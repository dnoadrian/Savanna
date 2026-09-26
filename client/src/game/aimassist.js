// Aim-Assist (An/Aus) – wie eine Zielhilfe, nicht wie ein Aimbot:
//  - Verlangsamung, wenn das Fadenkreuz nahe am Gegner ist
//  - Mitziehen nur, solange man selbst die Maus bewegt oder läuft (wie Controller-Aim-Assist)
//  - kleiner Snap beim Anvisieren (max. ~2°)
// Nur auf sichtbare Gegner, bevorzugt den Oberkörper.
import { F } from '../../shared/constants.js';
import { anglesFromDir } from '../../shared/sim/combat.js';

const DEG = Math.PI / 180;
const ON = { slow: 0.35, track: 0.35, snap: 2.0, cone: 3.8 };

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class AimAssist {
  constructor(collision) {
    this.collision = collision;
    this.target = null;
    this.prevAng = null;
    this.visCache = new Map();
    this.snapLeft = 0;
    this.snapYaw = 0;
    this.snapPitch = 0;
  }

  findTarget(cam, yaw, pitch, states, selfId, coneDeg, now) {
    let best = null;
    let bestScore = Infinity;
    for (const s of states) {
      if (s.id === selfId || !s.alive || (s.flags & F.DEAD)) continue;
      const chestY = s.y + ((s.flags & (F.CROUCH | F.SLIDE)) ? 0.75 : 1.2);
      const dx = s.x - cam.x, dy = chestY - cam.y, dz = s.z - cam.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 120 || dist < 0.5) continue;
      const a = anglesFromDir(dx / dist, dy / dist, dz / dist);
      const dyaw = angDiff(a.yaw, yaw);
      const dpitch = a.pitch - pitch;
      const off = Math.hypot(dyaw * Math.cos(pitch), dpitch) / DEG;
      const cone = coneDeg + Math.atan2(0.3, dist) / DEG;
      if (off > cone) continue;
      let vis = this.visCache.get(s.id);
      if (!vis || now - vis.t > 0.15) {
        vis = { t: now, v: this.collision.lineOfSight(cam.x, cam.y, cam.z, s.x, chestY, s.z) };
        this.visCache.set(s.id, vis);
      }
      if (!vis.v) continue;
      const score = off + dist * 0.01;
      if (score < bestScore) {
        bestScore = score;
        best = { id: s.id, dyaw, dpitch, yawAng: a.yaw, pitchAng: a.pitch, off };
      }
    }
    return best;
  }

  /**
   * level: 'on' | 'off'; input: der Spieler bewegt Maus oder Figur
   * Rückgabe { sensMul, addYaw, addPitch }
   */
  update(level, cam, yaw, pitch, states, selfId, dt, now, adsJustStarted, input) {
    const res = { sensMul: 1, addYaw: 0, addPitch: 0 };
    if (level !== 'on') { this.prevAng = null; return res; }
    const tgt = this.findTarget(cam, yaw, pitch, states, selfId, ON.cone, now);
    if (!tgt) {
      this.prevAng = null;
      this.target = null;
      return res;
    }
    const k = 1 - Math.min(1, tgt.off / (ON.cone + 0.5));
    res.sensMul = 1 - ON.slow * (0.4 + 0.6 * k);
    if (input && this.prevAng && this.target === tgt.id && dt > 0) {
      const wy = angDiff(tgt.yawAng, this.prevAng.yaw);
      const wp = tgt.pitchAng - this.prevAng.pitch;
      if (Math.abs(wy) < 0.15) res.addYaw += wy * ON.track;
      if (Math.abs(wp) < 0.15) res.addPitch += wp * ON.track;
    }
    this.prevAng = { yaw: tgt.yawAng, pitch: tgt.pitchAng };
    this.target = tgt.id;
    if (adsJustStarted) {
      const max = ON.snap * DEG;
      this.snapYaw = Math.max(-max, Math.min(max, tgt.dyaw));
      this.snapPitch = Math.max(-max, Math.min(max, tgt.dpitch));
      this.snapLeft = 0.12;
    }
    if (this.snapLeft > 0) {
      const f = Math.min(1, dt / this.snapLeft);
      res.addYaw += this.snapYaw * f;
      res.addPitch += this.snapPitch * f;
      this.snapYaw *= 1 - f;
      this.snapPitch *= 1 - f;
      this.snapLeft -= dt;
    }
    return res;
  }
}
