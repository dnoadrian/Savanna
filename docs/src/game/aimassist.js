// Aim-Assist: Verlangsamung nahe am Gegner, leichtes Mitziehen bei Gegnerbewegung,
// kleiner ADS-Snap (max. ~2,5°). Nur auf sichtbare Gegner, bevorzugt den Oberkörper.
import { F } from '../../shared/constants.js';
import { anglesFromDir } from '../../shared/sim/combat.js';

const DEG = Math.PI / 180;
const LEVELS = {
  off: null,
  weak: { slow: 0.3, track: 0.1, snap: 1.5, cone: 3.2 },
  medium: { slow: 0.4, track: 0.18, snap: 2.2, cone: 4 },
  strong: { slow: 0.5, track: 0.25, snap: 3.0, cone: 4.8 },
};

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

  // Liefert bestes Ziel im Kegel { id, dyaw, dpitch, yawAng, pitchAng }
  findTarget(cam, yaw, pitch, states, selfId, coneDeg, now) {
    let best = null;
    let bestScore = Infinity;
    for (const s of states) {
      if (s.id === selfId || !s.alive || (s.flags & F.DEAD)) continue;
      const chestY = s.y + ((s.flags & (F.CROUCH | F.SLIDE)) ? 0.75 : 1.2);
      const dx = s.x - cam.x, dy = chestY - cam.y, dz = s.z - cam.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 160 || dist < 0.5) continue;
      const a = anglesFromDir(dx / dist, dy / dist, dz / dist);
      const dyaw = angDiff(a.yaw, yaw);
      const dpitch = a.pitch - pitch;
      const off = Math.hypot(dyaw * Math.cos(pitch), dpitch) / DEG;
      // Kegel etwas größer bei nahen Gegnern (Körpergröße)
      const cone = coneDeg + Math.atan2(0.35, dist) / DEG;
      if (off > cone) continue;
      // Sichtlinie (gecacht, 150 ms)
      let vis = this.visCache.get(s.id);
      if (!vis || now - vis.t > 0.15) {
        vis = { t: now, v: this.collision.lineOfSight(cam.x, cam.y, cam.z, s.x, chestY, s.z) };
        this.visCache.set(s.id, vis);
      }
      if (!vis.v) continue;
      const score = off + dist * 0.01;
      if (score < bestScore) {
        bestScore = score;
        best = { id: s.id, dyaw, dpitch, yawAng: a.yaw, pitchAng: a.pitch, off, dist };
      }
    }
    return best;
  }

  /**
   * Wendet Aim-Assist an. Gibt { sensMul, addYaw, addPitch } zurück.
   */
  update(level, cam, yaw, pitch, states, selfId, dt, now, adsJustStarted) {
    const L = LEVELS[level];
    const res = { sensMul: 1, addYaw: 0, addPitch: 0, target: null };
    if (!L) { this.prevAng = null; return res; }
    const tgt = this.findTarget(cam, yaw, pitch, states, selfId, L.cone, now);
    if (!tgt) {
      this.prevAng = null;
      this.target = null;
      return res;
    }
    res.target = tgt.id;
    // Verlangsamung stärker, je näher am Ziel
    const k = 1 - Math.min(1, tgt.off / (L.cone + 0.5));
    res.sensMul = 1 - L.slow * (0.5 + 0.5 * k);
    // Tracking: Anteil der Winkelbewegung des Ziels mitnehmen
    if (this.prevAng && this.target === tgt.id && dt > 0) {
      const wy = angDiff(tgt.yawAng, this.prevAng.yaw);
      const wp = tgt.pitchAng - this.prevAng.pitch;
      if (Math.abs(wy) < 0.2) res.addYaw += wy * L.track;
      if (Math.abs(wp) < 0.2) res.addPitch += wp * L.track;
    }
    this.prevAng = { yaw: tgt.yawAng, pitch: tgt.pitchAng };
    this.target = tgt.id;
    // ADS-Snap: kurz, gedeckelt
    if (adsJustStarted) {
      const max = L.snap * DEG;
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
