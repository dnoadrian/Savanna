// Bot-KI: Zustandsmaschine mit Wahrnehmung, menschenähnlichem Zielen, Deckung, Heilen und Sturmflucht.
import { BOT_FOV, BOT_VIEW_DIST, BOT_HEAR_DIST, MAX_HP, WEAPON, F, EYE_STAND, EYE_CROUCH } from '../constants.js';
import { anglesFromDir } from './combat.js';

const DEG = Math.PI / 180;

export const DIFF = {
  easy: { react: [0.7, 1.1], aimErr: 6.0, turn: 150, hs: 0.04, strafe: 0.3, burst: [3, 5], pause: [0.55, 1.0], settle: 1.6, crouch: 0.08, jump: 0.04, slide: 0.05, lead: 0.2, recoilComp: 0.3, heal: 70, engage: 110 },
  normal: { react: [0.42, 0.7], aimErr: 3.6, turn: 230, hs: 0.12, strafe: 0.6, burst: [4, 8], pause: [0.32, 0.65], settle: 1.3, crouch: 0.18, jump: 0.08, slide: 0.12, lead: 0.55, recoilComp: 0.55, heal: 80, engage: 130 },
  hard: { react: [0.26, 0.44], aimErr: 2.2, turn: 330, hs: 0.22, strafe: 0.85, burst: [5, 10], pause: [0.2, 0.45], settle: 1.0, crouch: 0.28, jump: 0.13, slide: 0.22, lead: 0.8, recoilComp: 0.72, heal: 90, engage: 145 },
  pro: { react: [0.16, 0.3], aimErr: 1.4, turn: 450, hs: 0.34, strafe: 1.0, burst: [6, 12], pause: [0.14, 0.32], settle: 0.8, crouch: 0.34, jump: 0.18, slide: 0.32, lead: 0.95, recoilComp: 0.85, heal: 100, engage: 150 },
};

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class BotBrain {
  constructor(sim, p, difficulty) {
    this.sim = sim;
    this.p = p;
    this.d = DIFF[difficulty] || DIFF.normal;
    this.rng = sim.rng;
    this.state = 'roam';
    this.target = null;
    this.lastSeen = null; // {x,y,z,t}
    this.visible = [];
    this.perceiveT = this.rng.next() * 0.3;
    this.reactT = 0;
    this.trackT = 0;
    this.errYaw = 0;
    this.errPitch = 0;
    this.errTargetYaw = 0;
    this.errTargetPitch = 0;
    this.errT = 0;
    this.aimYaw = p.body.yaw;
    this.aimPitch = 0;
    this.recoilPitch = 0;
    this.aimHead = false;
    this.burstLeft = 0;
    this.burstPauseT = 0;
    this.strafeDir = this.rng.chance(0.5) ? 1 : -1;
    this.strafeT = 0;
    this.crouchT = 0;
    this.path = null;
    this.pathIdx = 0;
    this.dest = null;
    this.destT = 0;
    this.pathPending = false;
    this.idleT = 0;
    this.lookYaw = p.body.yaw;
    this.stuckT = 0;
    this.stuckPos = { x: p.body.x, z: p.body.z };
    this.stuckCount = 0;
    this.detour = null;
    this.detourT = 0;
    this.coverPos = null;
    this.coverT = 0;
    this.healWaitT = 0;
    this.noEnemyT = 10;
    this.heardT = 0;
    this.heard = null;
    this.sprintPref = this.rng.chance(0.6);
    this.jumpCd = 0;
    this.slideCd = 0;
    this.input = { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, crouchPressed: false, ads: false, healing: false };
    this.actions = { fire: false, reload: false, heal: false };
  }

  eye(p) {
    return p.body.y + ((p.flags & (F.CROUCH | F.SLIDE)) ? EYE_CROUCH : EYE_STAND);
  }

  // ---------------- Wahrnehmung ----------------
  perceive() {
    const sim = this.sim, me = this.p, b = me.body;
    const ey = this.eye(me);
    this.visible.length = 0;
    const cosHalf = Math.cos((BOT_FOV / 2) * DEG);
    const fx = -Math.sin(this.aimYaw), fz = -Math.cos(this.aimYaw);
    for (const o of sim.players) {
      if (o === me || !o.alive) continue;
      const dx = o.body.x - b.x, dz = o.body.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d > BOT_VIEW_DIST) continue;
      const recentlyHurtBy = me.lastDamagedBy === o.id && sim.time - me.lastDamageT < 2.5;
      if (d > 9 && !recentlyHurtBy) {
        const c = (dx * fx + dz * fz) / (d || 1);
        if (c < cosHalf) continue;
      }
      const chestY = o.body.y + ((o.flags & (F.CROUCH | F.SLIDE)) ? 0.75 : 1.2);
      let vis = sim.world.collision.lineOfSight(b.x, ey, b.z, o.body.x, chestY, o.body.z);
      if (!vis) vis = sim.world.collision.lineOfSight(b.x, ey, b.z, o.body.x, chestY + 0.45, o.body.z);
      if (vis) this.visible.push({ o, d });
    }
    // Ziel wählen
    let best = null;
    let bestScore = Infinity;
    for (const v of this.visible) {
      let score = v.d;
      if (this.target && v.o.id === this.target.id) score *= 0.5;
      if (me.lastDamagedBy === v.o.id && sim.time - me.lastDamageT < 3) score *= 0.4;
      score *= 0.7 + (v.o.hp / MAX_HP) * 0.3;
      if (score < bestScore) { bestScore = score; best = v.o; }
    }
    if (best && (!this.target || best.id !== this.target.id)) {
      const wasCombat = this.target && this.sim.time - (this.lastSeen?.t ?? -9) < 1.5;
      this.target = best;
      this.reactT = this.rng.range(this.d.react[0], this.d.react[1]) * (wasCombat ? 0.5 : 1);
      this.trackT = 0;
      this.aimHead = this.rng.chance(this.d.hs);
      this.newError(2.2);
    }
    if (best) {
      this.lastSeen = { x: best.body.x, y: best.body.y, z: best.body.z, t: sim.time };
      this.noEnemyT = 0;
    }
    // Geräusche (Schüsse im Umkreis)
    if (!best) {
      for (const s of sim.recentShots) {
        if (s.id === me.id || s.t < sim.time - 0.6 || s.t <= this.heardT) continue;
        const d = Math.hypot(s.x - b.x, s.z - b.z);
        if (d < BOT_HEAR_DIST) {
          this.heard = { x: s.x, z: s.z, t: s.t };
          this.heardT = s.t;
        }
      }
      // wurde getroffen ohne Sicht: in Richtung Angreifer drehen
      if (me.lastDamagedBy && me.lastDamagedBy !== 'storm' && sim.time - me.lastDamageT < 0.5) {
        const a = sim.byId.get(me.lastDamagedBy);
        if (a) this.heard = { x: a.body.x, z: a.body.z, t: sim.time };
      }
    }
  }

  newError(mult = 1) {
    const e = this.d.aimErr * mult;
    this.errTargetYaw = (this.rng.next() * 2 - 1) * e;
    this.errTargetPitch = (this.rng.next() * 2 - 1) * e * 0.6;
    this.errT = this.rng.range(0.25, 0.6);
  }

  // ---------------- Navigation ----------------
  setDest(x, z) {
    this.dest = { x, z };
    this.path = null;
    this.pathIdx = 0;
    this.pathPending = true;
    this.destT = this.sim.time;
  }

  followPath(input) {
    const b = this.p.body;
    if (!this.dest) return false;
    if (this.pathPending && this.sim.pathBudget > 0) {
      this.sim.pathBudget--;
      this.pathPending = false;
      const res = this.sim.nav ? this.sim.nav.findPath(b.x, b.z, this.dest.x, this.dest.z) : null;
      if (res && res.points.length) {
        this.path = res.points;
        this.pathIdx = 1;
        this.pathComplete = res.complete;
      } else {
        this.path = [[this.dest.x, this.dest.z]];
        this.pathIdx = 0;
        this.pathComplete = true;
      }
    }
    let tx, tz;
    if (this.detour && this.sim.time < this.detourT) {
      tx = this.detour.x; tz = this.detour.z;
    } else {
      this.detour = null;
      if (this.path && this.pathIdx < this.path.length) {
        [tx, tz] = this.path[this.pathIdx];
        if (Math.hypot(tx - b.x, tz - b.z) < 1.6) {
          this.pathIdx++;
          if (this.pathIdx >= this.path.length) {
            if (!this.pathComplete) {
              this.pathPending = true;
            } else {
              return false; // angekommen
            }
          }
          if (this.pathIdx < this.path.length) [tx, tz] = this.path[this.pathIdx];
        }
      } else {
        tx = this.dest.x; tz = this.dest.z;
        if (Math.hypot(tx - b.x, tz - b.z) < 2) return false;
      }
    }
    if (tx === undefined) return false;
    this.moveToward(input, tx, tz);
    return true;
  }

  moveToward(input, tx, tz, speed = 1) {
    const b = this.p.body;
    const dx = tx - b.x, dz = tz - b.z;
    const l = Math.hypot(dx, dz) || 1;
    const wx = dx / l, wz = dz / l;
    const yaw = this.aimYaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    input.mz = (wx * fx + wz * fz) * speed;
    input.mx = (wx * rx + wz * rz) * speed;
    this.moveYaw = Math.atan2(-wx, -wz);
  }

  checkStuck(dt, wantsMove) {
    const b = this.p.body;
    this.stuckT += dt;
    if (this.stuckT < 1.0) return;
    const moved = Math.hypot(b.x - this.stuckPos.x, b.z - this.stuckPos.z);
    this.stuckPos.x = b.x;
    this.stuckPos.z = b.z;
    this.stuckT = 0;
    if (!wantsMove || this.p.healT >= 0) { this.stuckCount = 0; return; }
    if (moved < 0.7) {
      this.stuckCount++;
      if (this.stuckCount === 1) {
        this.wantJump = true;
      } else if (this.stuckCount <= 3) {
        // Umweg zur Seite
        const a = this.rng.next() * Math.PI * 2;
        const r = 4 + this.rng.next() * 5;
        const x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
        this.detour = { x, z };
        this.detourT = this.sim.time + 1.4;
        this.wantJump = this.rng.chance(0.5);
        this.pathPending = !!this.dest;
      } else {
        // neues Ziel
        this.stuckCount = 0;
        this.dest = null;
        this.path = null;
        this.wantJump = true;
      }
    } else if (moved > 2) {
      this.stuckCount = 0;
    }
  }

  // ---------------- Hauptupdate ----------------
  update(dt) {
    const sim = this.sim, me = this.p, b = me.body, d = this.d;
    const input = this.input;
    const act = this.actions;
    input.mx = 0; input.mz = 0; input.jump = false; input.crouchPressed = false; input.ads = false; input.healing = me.healT >= 0;
    input.sprint = false;
    act.fire = false; act.reload = false; act.heal = false;
    this.wantJump = this.wantJump && this.jumpCd <= 0;
    this.jumpCd -= dt;
    this.slideCd -= dt;
    this.noEnemyT += dt;

    if (sim.phase !== 'playing') {
      input.yaw = this.aimYaw;
      return input;
    }

    this.perceiveT -= dt;
    if (this.perceiveT <= 0) {
      this.perceiveT = 0.2 + this.rng.next() * 0.12;
      this.perceive();
    }

    const zone = sim.zone.state;
    const zoneOn = sim.zone.enabled;
    const outsideNow = zoneOn && sim.zone.isOutside(b.x, b.z);
    let outsideNext = false;
    if (zoneOn && zone.next) {
      const dn = Math.hypot(b.x - zone.next.x, b.z - zone.next.z);
      outsideNext = dn > zone.next.r * 0.92 && (zone.shrinking || zone.timeLeft < 28 || zone.phase >= 3);
      if (zone.next.r < 1) outsideNext = dn > 6;
    }

    const tgt = this.target && this.target.alive ? this.target : null;
    if (!tgt) this.target = null;
    const seeTarget = tgt && this.visible.some((v) => v.o === tgt);
    const hasRecentContact = this.lastSeen && sim.time - this.lastSeen.t < 6 && tgt;

    // --- Zustand wählen ---
    const lowHp = me.hp < d.heal && me.medkits > 0;
    if (me.healT >= 0) this.state = 'heal';
    else if (seeTarget) {
      if (lowHp && this.state !== 'cover' && !outsideNow) {
        this.state = 'cover';
        this.coverPos = sim.nav ? sim.nav.findCover(b.x, b.z, tgt.body.x, this.eye(tgt), tgt.body.z) : null;
        this.coverT = sim.time + 4;
        if (this.coverPos) this.setDest(this.coverPos[0], this.coverPos[1]);
      } else if (this.state !== 'cover' || sim.time > this.coverT) {
        this.state = 'combat';
      }
    } else if (lowHp && this.noEnemyT > 1.2 && !outsideNow) {
      this.state = 'heal';
    } else if (me.hp < 150 && me.medkits > 0 && this.noEnemyT > 6 && !outsideNow && !outsideNext) {
      this.state = 'heal';
    } else if (outsideNow || outsideNext) {
      if (this.state !== 'storm') {
        this.state = 'storm';
        const nz = zone.next || zone;
        const pt = sim.nav ? sim.nav.randomFree(this.rng, nz.x, nz.z, Math.max(4, nz.r * 0.55)) : null;
        this.setDest(pt ? pt[0] : nz.x, pt ? pt[1] : nz.z);
      }
    } else if (hasRecentContact && this.lastSeen && this.noEnemyT < 8) {
      if (this.state !== 'chase') {
        this.state = 'chase';
        this.setDest(this.lastSeen.x, this.lastSeen.z);
      }
    } else if (this.heard && sim.time - this.heard.t < 5 && this.state !== 'investigate') {
      this.state = 'investigate';
      this.investigateT = sim.time + 2.5;
      if (this.rng.chance(0.55)) this.setDest(this.heard.x + this.rng.range(-10, 10), this.heard.z + this.rng.range(-10, 10));
    } else if (this.state === 'combat' || this.state === 'cover' || (this.state === 'chase' && this.noEnemyT >= 8) || (this.state === 'heal' && !(me.healT >= 0))) {
      this.state = 'roam';
      this.dest = null;
    }

    // Nachladen außerhalb von Kämpfen
    if (!seeTarget && me.weapon.mag < WEAPON.magSize * 0.5 && !me.weapon.reloading && me.healT < 0) act.reload = true;
    if (me.weapon.mag === 0 && !me.weapon.reloading) act.reload = true;

    let wantsMove = false;
    let desiredYaw = this.aimYaw;
    let desiredPitch = 0;
    let aimAtTarget = false;

    switch (this.state) {
      case 'combat': {
        aimAtTarget = true;
        const dx = tgt.body.x - b.x, dz = tgt.body.z - b.z;
        const dist = Math.hypot(dx, dz);
        // Distanz regeln + strafen
        this.strafeT -= dt;
        if (this.strafeT <= 0) {
          this.strafeT = this.rng.range(0.45, 1.3);
          if (this.rng.chance(0.55 + d.strafe * 0.3)) this.strafeDir = -this.strafeDir;
          this.crouchT = this.rng.chance(d.crouch) ? this.rng.range(0.6, 1.6) : 0;
          if (this.rng.chance(d.jump) && this.jumpCd <= 0) { this.wantJump = true; this.jumpCd = 1.2; }
        }
        let fwd = 0;
        if (dist > 55) fwd = 1;
        else if (dist > 32) fwd = 0.5;
        else if (dist < 9) fwd = -0.7;
        let side = this.strafeDir * d.strafe;
        if (this.crouchT > 0) { this.crouchT -= dt; side *= 0.2; input.crouch = true; }
        else input.crouch = false;
        if (outsideNow) {
          // trotzdem Richtung Zone
          const nz = zone;
          this.moveToward(input, nz.x, nz.z);
          wantsMove = true;
        } else if (dist > 70 && this.dest && Math.hypot(this.dest.x - tgt.body.x, this.dest.z - tgt.body.z) > 20) {
          this.setDest(tgt.body.x, tgt.body.z);
        } else if (dist > 70) {
          if (!this.dest) this.setDest(tgt.body.x, tgt.body.z);
          wantsMove = this.followPath(input);
          if (dist > 90 && !input.crouch) input.sprint = this.sprintPref;
        } else {
          input.mz = fwd;
          input.mx = side;
          wantsMove = Math.abs(fwd) + Math.abs(side) > 0.1;
          // Slide beim Nachsetzen
          if (fwd > 0.4 && this.rng.chance(d.slide * dt) && this.slideCd <= 0) {
            input.sprint = true;
            this.slidePending = 0.35;
            this.slideCd = 4;
          }
        }
        if (this.slidePending > 0) {
          this.slidePending -= dt;
          input.sprint = true;
          input.mz = 1;
          if (this.slidePending <= 0 && b.sprinting) input.crouchPressed = true;
        }
        // ADS auf Distanz (wenn nicht gerade sprintend)
        input.ads = dist > 22 && !input.sprint && !outsideNow;
        // bei leerem Magazin: Deckung
        if (me.weapon.reloading && dist < 40 && !this.coverPos && sim.nav && this.rng.chance(0.02)) {
          this.coverPos = sim.nav.findCover(b.x, b.z, tgt.body.x, this.eye(tgt), tgt.body.z, 12);
          if (this.coverPos) { this.state = 'cover'; this.coverT = sim.time + 3; this.setDest(this.coverPos[0], this.coverPos[1]); }
        }
        break;
      }
      case 'cover': {
        if (tgt && seeTarget) aimAtTarget = true;
        input.sprint = true;
        wantsMove = this.followPath(input);
        if (!wantsMove) {
          // in Deckung: ducken, nachladen, heilen
          input.crouch = true;
          if (me.weapon.mag < WEAPON.magSize && !me.weapon.reloading) act.reload = true;
          if (me.hp < d.heal && me.medkits > 0 && me.healT < 0) act.heal = true;
          if (sim.time > this.coverT) { this.state = 'combat'; this.coverPos = null; }
        }
        if (me.healT < 0 && !lowHp && sim.time > this.coverT - 2) { this.state = 'combat'; this.coverPos = null; }
        break;
      }
      case 'heal': {
        input.crouch = true;
        if (me.healT < 0) {
          if (me.hp < MAX_HP - 20 && me.medkits > 0) act.heal = true;
          else this.state = 'roam';
        }
        desiredYaw = this.lookYaw;
        break;
      }
      case 'storm': {
        input.sprint = true;
        wantsMove = this.followPath(input);
        if (!wantsMove) this.state = 'roam';
        break;
      }
      case 'chase': {
        input.sprint = this.lastSeen && Math.hypot(this.lastSeen.x - b.x, this.lastSeen.z - b.z) > 25;
        wantsMove = this.followPath(input);
        if (!wantsMove) { this.state = 'roam'; this.dest = null; this.target = null; }
        if (this.lastSeen) desiredYaw = Math.atan2(-(this.lastSeen.x - b.x), -(this.lastSeen.z - b.z));
        break;
      }
      case 'investigate': {
        if (this.heard) desiredYaw = Math.atan2(-(this.heard.x - b.x), -(this.heard.z - b.z));
        if (this.dest) wantsMove = this.followPath(input);
        if (sim.time > this.investigateT && !wantsMove) { this.state = 'roam'; this.heard = null; }
        break;
      }
      default: {
        // roam
        if (!this.dest) {
          this.idleT -= dt;
          if (this.idleT <= 0) this.pickRoamDest();
          else {
            // umsehen
            this.lookYaw += Math.sin(sim.time * 0.8 + me.id.length) * dt * 0.8;
            desiredYaw = this.lookYaw;
          }
        } else {
          const far = Math.hypot(this.dest.x - b.x, this.dest.z - b.z) > 40;
          input.sprint = far && this.sprintPref;
          wantsMove = this.followPath(input);
          // gelegentlich beim Sprinten rutschen
          if (input.sprint && b.sprinting && this.slideCd <= 0 && this.rng.chance(d.slide * 0.25 * dt)) {
            input.crouchPressed = true;
            this.slideCd = 5;
          }
          if (!wantsMove) {
            this.dest = null;
            this.idleT = this.rng.range(0.5, 2.5);
            this.lookYaw = this.aimYaw;
          }
          if (sim.time - this.destT > 60) this.dest = null;
        }
      }
    }

    // Blickrichtung
    if (aimAtTarget && tgt) {
      const ey = this.eye(me);
      const aimY = tgt.body.y + (this.aimHead ? ((tgt.flags & (F.CROUCH | F.SLIDE)) ? 1.05 : 1.58) : ((tgt.flags & (F.CROUCH | F.SLIDE)) ? 0.78 : 1.18));
      // Vorhalt
      const lead = d.lead * 0.08;
      const tx = tgt.body.x + tgt.body.vx * lead, tz = tgt.body.z + tgt.body.vz * lead;
      const dx = tx - b.x, dy = aimY - ey, dz = tz - b.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      const ang = anglesFromDir(dx / l, dy / l, dz / l);
      desiredYaw = ang.yaw;
      desiredPitch = ang.pitch;
      this.trackT += dt;
      // Fehler wandert und wird mit der Zeit kleiner
      this.errT -= dt;
      if (this.errT <= 0) this.newError(0.35 + 0.65 * Math.exp(-this.trackT / d.settle));
      this.errYaw += (this.errTargetYaw - this.errYaw) * Math.min(1, dt * 3);
      this.errPitch += (this.errTargetPitch - this.errPitch) * Math.min(1, dt * 3);
      desiredYaw += this.errYaw * DEG;
      desiredPitch += this.errPitch * DEG;
    } else if (wantsMove && this.moveYaw !== undefined) {
      desiredYaw = this.moveYaw;
      desiredPitch = 0;
    }
    // Rückstoß erholt sich / wird kompensiert
    this.recoilPitch *= Math.max(0, 1 - dt * (3 + d.recoilComp * 6));

    const maxTurn = d.turn * DEG * dt * (aimAtTarget ? 1 : 0.8);
    const dyaw = angDiff(desiredYaw, this.aimYaw);
    const stepYaw = Math.max(-maxTurn, Math.min(maxTurn, dyaw * Math.min(1, dt * 9)));
    this.aimYaw += stepYaw;
    const dp = desiredPitch - this.aimPitch;
    this.aimPitch += Math.max(-maxTurn, Math.min(maxTurn, dp * Math.min(1, dt * 9)));

    // Bewegung relativ zur neuen Blickrichtung neu berechnen, wenn nur gelaufen wird
    if (!aimAtTarget && wantsMove && this.state !== 'combat') {
      // Laufrichtung ≈ Blick → vorwärts
      const adiff = angDiff(this.moveYaw ?? this.aimYaw, this.aimYaw);
      input.mz = Math.cos(adiff);
      input.mx = -Math.sin(adiff);
    }

    // Schießen
    if (aimAtTarget && tgt && seeTarget) {
      if (this.reactT > 0) this.reactT -= dt;
      else {
        const dist = Math.hypot(tgt.body.x - b.x, tgt.body.z - b.z);
        const tol = Math.max(1.2, Math.atan2(0.55, dist) / DEG * 1.6 + 0.6);
        const offYaw = Math.abs(angDiff(desiredYaw, this.aimYaw)) / DEG;
        this.burstPauseT -= dt;
        if (this.burstLeft <= 0 && this.burstPauseT <= 0) {
          this.burstLeft = dist > 90 ? 1 + Math.floor(this.rng.next() * 2) : this.rng.int(d.burst[0], d.burst[1]);
          this.burstPauseT = this.rng.range(d.pause[0], d.pause[1]) * (dist > 90 ? 1.8 : 1);
        }
        if (this.burstLeft > 0 && offYaw < tol && dist < d.engage && me.healT < 0 && !input.sprint) {
          act.fire = true;
        }
      }
    } else {
      this.burstLeft = 0;
    }

    if (this.wantJump && b.grounded) { input.jump = true; this.wantJump = false; this.jumpCd = 0.8; }
    if (input.healing || act.heal) { input.sprint = false; }

    this.checkStuck(dt, wantsMove);
    input.yaw = this.aimYaw;
    input.pitch = this.aimPitch + this.recoilPitch;
    return input;
  }

  onShotFired() {
    this.burstLeft--;
    this.recoilPitch += WEAPON.recoilUp * DEG * (1 - this.d.recoilComp * 0.8);
  }

  pickRoamDest() {
    const sim = this.sim, b = this.p.body;
    const z = sim.zone.state;
    const safe = sim.zone.enabled && z.next ? z.next : { x: 0, z: 0, r: 520 };
    let x, zz;
    if (this.rng.chance(0.55)) {
      const pois = sim.world.pois.filter((p) => Math.hypot(p.x - safe.x, p.z - safe.z) < safe.r * 0.9 + 20);
      if (pois.length) {
        const p = this.rng.pick(pois);
        x = p.x + this.rng.range(-p.r * 0.5, p.r * 0.5);
        zz = p.z + this.rng.range(-p.r * 0.5, p.r * 0.5);
      }
    }
    if (x === undefined) {
      const a = this.rng.next() * Math.PI * 2;
      const r = this.rng.range(40, 160);
      x = b.x + Math.cos(a) * r;
      zz = b.z + Math.sin(a) * r;
      if (Math.hypot(x - safe.x, zz - safe.z) > safe.r * 0.9) {
        x = safe.x + (x - safe.x) * 0.3;
        zz = safe.z + (zz - safe.z) * 0.3;
      }
    }
    if (sim.nav) {
      const pt = sim.nav.randomFree(this.rng, x, zz, 12);
      if (pt) { x = pt[0]; zz = pt[1]; }
    }
    this.setDest(x, zz);
  }
}
