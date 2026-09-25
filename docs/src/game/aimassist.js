// Aim-Assist (deutlich spürbar): Verlangsamung am Gegner, Mitziehen bei Bewegung des Ziels,
// Magnetismus zum Oberkörper beim Schießen/Zielen und ein Snap beim Anvisieren.
// Nur auf sichtbare Gegner.
import { F } from '../../shared/constants.js';
import { anglesFromDir } from '../../shared/sim/combat.js';

const DEG = Math.PI / 180;
// slow: Anteil Verlangsamung, track: Anteil mitgezogener Zielbewegung, pull: Magnetismus in °/s,
// pullIdle: Anteil des Magnetismus ohne Schießen/Zielen, snap: max. Snap beim Anvisieren in °, cone: Wirkkegel in °
const LEVELS = {
  off: null,
  weak: { slow: 0.35, track: 0.45, pull: 5, pullIdle: 0.2, snap: 3.5, cone: 5 },
  medium: { slow: 0.5, track: 0.7, pull: 10, pullIdle: 0.3, snap: 6, cone: 7 },
  strong: { slow: 0.6, track: 0.9, pull: 16, pullIdle: 0.4, snap: 9, cone: 9 },
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
  // engaged: Spieler schießt oder zielt (voller Magnetismus)
  update(level, cam, yaw, pitch, states, selfId, dt, now, adsJustStarted, engaged) {
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
    // Magnetismus: Richtung Oberkörper ziehen, nie darüber hinaus; liegt das Fadenkreuz
    // schon auf dem Körper, nur noch schwach (Kopfschüsse bleiben möglich)
    const onBody = tgt.off < Math.atan2(0.32, tgt.dist) / DEG;
    const pull = L.pull * DEG * dt * (engaged ? 1 : L.pullIdle) * (0.45 + 0.55 * k) * (onBody ? 0.25 : 1);
    const offRad = Math.hypot(tgt.dyaw, tgt.dpitch);
    if (offRad > 1e-5 && pull > 0) {
      const f = Math.min(1, pull / offRad);
      res.addYaw += tgt.dyaw * f;
      res.addPitch += tgt.dpitch * f;
    }
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
