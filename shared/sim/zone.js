// Sturm-Zone: 5 Phasen, Kreise vorab per Match-Seed bestimmt (reine Funktion der Zeit).
import { STORM_PHASES, STORM_START_RADIUS } from '../constants.js';
import { RNG } from '../rng.js';

export class Zone {
  constructor(seed, terrain, enabled = true) {
    this.enabled = enabled;
    const rng = new RNG(seed ^ 0x5a5a1234);
    this.circles = [{ x: 0, z: 0, r: STORM_START_RADIUS }];
    let prev = this.circles[0];
    for (let i = 0; i < STORM_PHASES.length; i++) {
      const r = STORM_PHASES[i].radius;
      let best = null;
      for (let tries = 0; tries < 60; tries++) {
        const maxOff = Math.max(0, Math.min(prev.r - r, i === 0 ? 14 : prev.r - r));
        const a = rng.next() * Math.PI * 2;
        const d = Math.sqrt(rng.next()) * maxOff;
        const x = prev.x + Math.cos(a) * d;
        const z = prev.z + Math.sin(a) * d;
        best = { x, z, r };
        if (!terrain) break;
        const h = terrain.heightAt(x, z);
        if (h > 2 && terrain.waterLevelAt(x, z) < h && Math.hypot(x, z) < 40) break;
      }
      this.circles.push(best);
      prev = best;
    }
    // Zeitplan
    this.schedule = [];
    let t = 0;
    for (let i = 0; i < STORM_PHASES.length; i++) {
      const p = STORM_PHASES[i];
      this.schedule.push({ waitStart: t, shrinkStart: t + p.wait, shrinkEnd: t + p.wait + p.shrink });
      t += p.wait + p.shrink;
    }
    this.totalTime = t;
    this.state = { phase: 0, shrinking: false, x: 0, z: 0, r: STORM_START_RADIUS, next: this.circles[1], timeLeft: 0, dps: 1 };
  }

  // Zustand zur Match-Zeit t (Sekunden seit GO)
  update(t) {
    const s = this.state;
    if (!this.enabled) {
      s.phase = 0; s.shrinking = false; s.x = 0; s.z = 0; s.r = 99999; s.timeLeft = 0; s.dps = 0; s.next = null;
      return s;
    }
    let idx = this.schedule.length - 1;
    for (let i = 0; i < this.schedule.length; i++) {
      if (t < this.schedule[i].shrinkEnd) { idx = i; break; }
    }
    const sc = this.schedule[idx];
    const from = this.circles[idx];
    const to = this.circles[idx + 1];
    s.phase = idx + 1;
    s.dps = STORM_PHASES[idx].dps;
    s.next = to;
    if (t >= this.totalTime) {
      s.shrinking = false; s.x = to.x; s.z = to.z; s.r = to.r; s.timeLeft = 0; s.phase = STORM_PHASES.length; s.done = true;
      return s;
    }
    s.done = false;
    if (t < sc.shrinkStart) {
      s.shrinking = false;
      s.x = from.x; s.z = from.z; s.r = from.r;
      s.timeLeft = sc.shrinkStart - t;
    } else {
      s.shrinking = true;
      const k = (t - sc.shrinkStart) / (sc.shrinkEnd - sc.shrinkStart);
      s.x = from.x + (to.x - from.x) * k;
      s.z = from.z + (to.z - from.z) * k;
      s.r = from.r + (to.r - from.r) * k;
      s.timeLeft = sc.shrinkEnd - t;
    }
    // Schaden: Phase 1-2: 1, Phase 3: 2, Phase 4: 5, Phase 5: 10
    return s;
  }

  isOutside(x, z) {
    const s = this.state;
    if (!this.enabled) return false;
    const dx = x - s.x, dz = z - s.z;
    return dx * dx + dz * dz > s.r * s.r;
  }
}
