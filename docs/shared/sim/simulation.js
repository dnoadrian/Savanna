// Gemeinsames Simulationsmodul: Treffer, Schaden, Bots, Zone, Heilen, Sieg.
// Solo: läuft im Browser. Lokaler Mehrspieler: läuft server-autoritativ.
import {
  MATCH_SIZE, COUNTDOWN, MAX_HP, MEDKIT_START, MEDKIT_MAX, MEDKIT_HEAL, MEDKIT_TIME, WEAPON, F,
  SPAWN_MIN_DIST, MAX_REWIND, EYE_STAND, EYE_CROUCH, ISLAND_RADIUS,
} from '../constants.js';
import { RNG } from '../rng.js';
import { createBody, stepMovement, bodyFlags } from './movement.js';
import { WeaponState } from './weapon.js';
import { rayPlayer, computeDamage, dirFromAngles, applySpread } from './combat.js';
import { Zone } from './zone.js';
import { BotBrain } from './bots.js';
import { MAT } from '../physics/collision.js';
import { BOT_NAMES } from '../names.js';

const HIST = 24;

export class Simulation {
  /**
   * world: { terrain, collision, nav, pois }
   * cfg: { seed, players:[{id,name,isBot,outfit,color,skin,crownStyle,streak}], storm, botDifficulty, infiniteAmmo }
   */
  constructor(world, cfg) {
    this.world = world;
    this.nav = world.nav || null;
    this.seed = cfg.seed >>> 0;
    this.rng = new RNG(this.seed ^ 0x9e3779b9);
    this.opts = {
      storm: cfg.storm !== false,
      botDifficulty: cfg.botDifficulty || 'normal',
      infiniteAmmo: cfg.infiniteAmmo !== false,
    };
    this.zone = new Zone(this.seed, world.terrain, this.opts.storm);
    this.zone.update(0);
    this.time = 0;
    this.matchTime = 0;
    this.phase = 'countdown';
    this.countdown = COUNTDOWN;
    this.events = [];
    this.recentShots = [];
    this.pathBudget = 2;
    this.winnerId = null;
    this.players = [];
    this.byId = new Map();
    // mit Bots immer 12 Spieler; online ohne Bots nur die Menschen
    if (cfg.players.length < 1 || cfg.players.length > MATCH_SIZE) throw new Error('Match braucht 1 bis ' + MATCH_SIZE + ' Spieler');
    const spawns = this.pickSpawns(cfg.players.length);
    cfg.players.forEach((pc, i) => this.addPlayer(pc, spawns[i]));
  }

  pickSpawns(n) {
    const out = [];
    const t = this.world.terrain;
    const col = this.world.collision;
    let minDist = SPAWN_MIN_DIST;
    let tries = 0;
    while (out.length < n && tries < 20000) {
      tries++;
      if (tries % 3000 === 0) minDist *= 0.85;
      const x = this.rng.range(-ISLAND_RADIUS + 8, ISLAND_RADIUS - 8);
      const z = this.rng.range(-ISLAND_RADIUS + 8, ISLAND_RADIUS - 8);
      const h = t.heightAt(x, z);
      if (h < 2.2 || t.waterLevelAt(x, z) > h - 0.1) continue;
      const n2 = t.normalAt(x, z);
      if (n2.y < 0.85) continue;
      if (this.nav && !this.nav.isFree(x, z)) continue;
      if (col.overlaps(x, z, 1.0, h + 0.1, h + 2.5)) continue;
      if (col.ceilingAt(x, z, 0.5, h + 0.1) < h + 12) continue; // nicht unter Dächern/im Stollen
      if (out.some((s) => Math.hypot(s.x - x, s.z - z) < minDist)) continue;
      out.push({ x, y: h, z, yaw: this.rng.next() * Math.PI * 2 });
    }
    while (out.length < n) out.push({ x: 0, y: t.heightAt(0, 0), z: 0, yaw: 0 });
    return out;
  }

  addPlayer(pc, sp) {
    const body = createBody(sp.x, sp.y, sp.z);
    body.yaw = sp.yaw;
    const p = {
      id: pc.id,
      name: pc.name,
      isBot: !!pc.isBot,
      outfit: pc.outfit || 'cowboy',
      color: pc.color ?? 0,
      skin: pc.skin || 'gold',
      crownStyle: pc.crownStyle || 'gold',
      streak: pc.streak || 0,
      body,
      pitch: 0,
      flags: 0,
      hp: MAX_HP,
      alive: true,
      kills: 0,
      damage: 0,
      headshots: 0,
      shotsHit: 0,
      medkits: MEDKIT_START,
      weapon: new WeaponState(this.opts.infiniteAmmo),
      healT: -1,
      placement: 0,
      deathT: 0,
      killerId: null,
      lastDamagedBy: null,
      lastDamageT: -10,
      stormAcc: 0,
      fireTokens: 3,
      hist: new Float32Array(HIST * 6),
      histN: 0,
      histHead: 0,
      connected: true,
      ping: 0,
    };
    if (p.isBot) p.brain = new BotBrain(this, p, this.opts.botDifficulty);
    this.players.push(p);
    this.byId.set(p.id, p);
    return p;
  }

  aliveCount() {
    let n = 0;
    for (const p of this.players) if (p.alive) n++;
    return n;
  }

  emit(e) {
    this.events.push(e);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------------- Schritt ----------------
  step(dt) {
    this.time += dt;
    this.pathBudget = 2;
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      for (const p of this.players) {
        p.body.frozen = true;
        if (p.isBot) p.body.yaw = p.brain.aimYaw;
      }
      if (this.countdown <= 0) {
        this.phase = 'playing';
        for (const p of this.players) p.body.frozen = false;
        this.emit({ t: 'go' });
      }
      this.recordHistory();
      return;
    }
    if (this.phase === 'playing') {
      this.matchTime += dt;
      this.zone.update(this.matchTime);
    }
    // alte Schüsse vergessen
    while (this.recentShots.length && this.recentShots[0].t < this.time - 1.2) this.recentShots.shift();

    for (const p of this.players) {
      if (!p.alive) continue;
      // Waffe
      if (p.weapon.update(dt)) this.emit({ t: 'reloaded', id: p.id });
      // Feuerrate-Budget für Menschen
      p.fireTokens = Math.min(3, p.fireTokens + dt * WEAPON.fireRate * 1.1);
      // Heilen
      if (p.healT >= 0) {
        p.healT += dt;
        if (p.healT >= MEDKIT_TIME) {
          p.healT = -1;
          if (p.medkits > 0 && p.hp < MAX_HP) {
            p.medkits--;
            const before = p.hp;
            p.hp = Math.min(MAX_HP, p.hp + MEDKIT_HEAL);
            this.emit({ t: 'heal', id: p.id, amt: p.hp - before, hp: p.hp, mk: p.medkits });
          }
        }
      }
      if (p.isBot) this.stepBot(p, dt);
    }

    // Sturmschaden
    if (this.phase === 'playing' && this.zone.enabled) {
      const dps = this.zone.state.dps;
      for (const p of this.players) {
        if (!p.alive) continue;
        if (this.zone.isOutside(p.body.x, p.body.z)) {
          p.stormAcc += dps * dt;
          if (p.stormAcc >= 1) {
            const dmg = Math.floor(p.stormAcc);
            p.stormAcc -= dmg;
            this.applyDamage(p, dmg, 'storm', 's', null);
            if (this.phase === 'ended') break;
          }
        } else {
          p.stormAcc = 0;
        }
      }
    }
    this.recordHistory();
  }

  stepBot(p, dt) {
    const brain = p.brain;
    const input = brain.update(dt);
    const act = brain.actions;
    if (this.phase !== 'playing') return;
    // Aktionen
    if (act.heal) this.startHeal(p);
    if (act.reload && !p.weapon.reloading && p.healT < 0) {
      if (p.weapon.startReload()) this.emit({ t: 'reload', id: p.id });
    }
    input.healing = p.healT >= 0;
    // Bots laden lieber fertig nach, statt den Nachladevorgang durch Sprinten abzubrechen
    if (p.weapon.reloading) input.sprint = false;
    stepMovement(p.body, input, dt, this.world);
    if (p.body.slideStarted) this.slideCount = (this.slideCount || 0) + 1;
    p.pitch = input.pitch;
    let extra = 0;
    if (input.ads) extra |= F.ADS;
    if (p.weapon.reloading) extra |= F.RELOAD;
    if (p.healT >= 0) extra |= F.HEAL;
    if (act.fire && !p.body.sprinting && p.weapon.canFire()) {
      if (p.healT >= 0) this.cancelHeal(p);
      if (p.weapon.fire()) {
        extra |= F.FIRING;
        const b = p.body;
        const flags = bodyFlags(b, extra);
        const eye = b.y + ((flags & (F.CROUCH | F.SLIDE)) ? EYE_CROUCH : EYE_STAND);
        let dir = dirFromAngles(b.yaw, p.pitch);
        const speed = Math.hypot(b.vx, b.vz);
        dir = applySpread(dir, p.weapon.spread(flags, speed), () => this.rng.next());
        this.fireShot(p, b.x, eye, b.z, dir.x, dir.y, dir.z, 0);
        brain.onShotFired();
        if (p.weapon.mag === 0 && p.weapon.startReload()) this.emit({ t: 'reload', id: p.id });
      }
    } else if (p.weapon.sinceShot < 0.2) {
      extra |= F.FIRING;
    }
    p.flags = bodyFlags(p.body, extra);
  }

  recordHistory() {
    for (const p of this.players) {
      const h = p.hist;
      const o = p.histHead * 6;
      h[o] = this.time;
      h[o + 1] = p.body.x;
      h[o + 2] = p.body.y;
      h[o + 3] = p.body.z;
      h[o + 4] = p.body.yaw;
      h[o + 5] = p.flags;
      p.histHead = (p.histHead + 1) % HIST;
      p.histN = Math.min(HIST, p.histN + 1);
    }
  }

  // Zustand eines Spielers zur Zeit t (Lag-Kompensation)
  rewindState(p, t, out) {
    out.x = p.body.x; out.y = p.body.y; out.z = p.body.z; out.yaw = p.body.yaw; out.flags = p.flags;
    if (p.histN < 2) return out;
    const h = p.hist;
    let newer = -1;
    for (let k = 1; k <= p.histN; k++) {
      const idx = ((p.histHead - k) % HIST + HIST) % HIST;
      const ht = h[idx * 6];
      if (ht <= t) {
        if (newer < 0) {
          out.x = h[idx * 6 + 1]; out.y = h[idx * 6 + 2]; out.z = h[idx * 6 + 3]; out.yaw = h[idx * 6 + 4]; out.flags = h[idx * 6 + 5];
          return out;
        }
        const nt = h[newer * 6];
        const a = nt > ht ? (t - ht) / (nt - ht) : 0;
        out.x = h[idx * 6 + 1] + (h[newer * 6 + 1] - h[idx * 6 + 1]) * a;
        out.y = h[idx * 6 + 2] + (h[newer * 6 + 2] - h[idx * 6 + 2]) * a;
        out.z = h[idx * 6 + 3] + (h[newer * 6 + 3] - h[idx * 6 + 3]) * a;
        out.yaw = h[idx * 6 + 4];
        out.flags = h[idx * 6 + 5];
        return out;
      }
      newer = idx;
    }
    // älter als der Puffer
    if (newer >= 0) {
      out.x = h[newer * 6 + 1]; out.y = h[newer * 6 + 2]; out.z = h[newer * 6 + 3]; out.yaw = h[newer * 6 + 4]; out.flags = h[newer * 6 + 5];
    }
    return out;
  }

  // Hitscan-Schuss
  fireShot(shooter, ox, oy, oz, dx, dy, dz, rewind) {
    const range = WEAPON.range;
    const col = this.world.collision;
    let tWorld = col.raycast(ox, oy, oz, dx, dy, dz, range, true);
    let mat = tWorld >= 0 ? col.hitOut.mat : -1;
    let nx = col.hitOut.nx, ny = col.hitOut.ny, nz = col.hitOut.nz;
    if (tWorld < 0) tWorld = range;
    // Wasseroberfläche
    if (dy < -1e-4) {
      const ex = ox + dx * tWorld, ez = oz + dz * tWorld;
      const wl = this.world.terrain.waterLevelAt(ex, ez);
      const tw = (wl - oy) / dy;
      if (tw > 0 && tw < tWorld && this.world.terrain.heightAt(ox + dx * tw, oz + dz * tw) < wl) {
        tWorld = tw;
        mat = MAT.WATER;
        nx = 0; ny = 1; nz = 0;
      }
    }
    // Spieler
    const rt = this.time - Math.min(MAX_REWIND, Math.max(0, rewind || 0));
    const tmp = this._rw || (this._rw = { x: 0, y: 0, z: 0, yaw: 0, flags: 0 });
    let best = tWorld;
    let hitP = null;
    let hitPart = null;
    for (const o of this.players) {
      if (o === shooter || !o.alive) continue;
      const st = rewind > 0 ? this.rewindState(o, rt, tmp) : { x: o.body.x, y: o.body.y, z: o.body.z, yaw: o.body.yaw, flags: o.flags };
      const r = rayPlayer(st, ox, oy, oz, dx, dy, dz, best);
      if (r && r.t < best) {
        best = r.t;
        hitP = o;
        hitPart = r.part;
      }
    }
    const ex = ox + dx * best, ey = oy + dy * best, ez = oz + dz * best;
    this.recentShots.push({ x: ox, y: oy, z: oz, t: this.time, id: shooter.id });
    const shot = { t: 'shot', id: shooter.id, o: [r2(ox), r2(oy), r2(oz)], e: [r2(ex), r2(ey), r2(ez)] };
    if (hitP) {
      shot.m = MAT.PLAYER;
      this.emit(shot);
      const dmg = computeDamage(hitPart, best);
      shooter.shotsHit++;
      this.applyDamage(hitP, dmg, shooter.id, hitPart, [ex, ey, ez]);
    } else {
      if (mat >= 0) {
        shot.m = mat;
        shot.n = [r2(nx), r2(ny), r2(nz)];
      }
      this.emit(shot);
    }
    return hitP;
  }

  applyDamage(target, dmg, attackerId, part, pos) {
    if (!target.alive || this.phase === 'ended') return;
    const attacker = attackerId && attackerId !== 'storm' ? this.byId.get(attackerId) : null;
    const real = Math.min(target.hp, dmg);
    target.hp -= dmg;
    target.lastDamagedBy = attackerId;
    target.lastDamageT = this.time;
    if (attacker) {
      attacker.damage += real;
      if (part === 'h') attacker.headshots++;
    }
    const ev = { t: 'hit', a: attackerId, v: target.id, d: dmg, p: part, hp: Math.max(0, target.hp) };
    if (pos) ev.pos = pos;
    if (attacker) ev.from = [r2(attacker.body.x), r2(attacker.body.z)];
    this.emit(ev);
    if (target.hp <= 0) this.kill(target, attacker, part === 'h', attackerId === 'storm' ? 'storm' : 'ar');
  }

  kill(target, killer, headshot, cause) {
    if (!target.alive) return;
    const before = this.aliveCount();
    target.alive = false;
    target.hp = 0;
    target.healT = -1;
    target.placement = before;
    target.deathT = this.matchTime;
    target.killerId = killer ? killer.id : null;
    target.flags = F.DEAD;
    if (killer && killer !== target) {
      killer.kills++;
      if (killer.medkits < MEDKIT_MAX) {
        killer.medkits++;
      }
      this.emit({ t: 'medkit', id: killer.id, n: killer.medkits });
    }
    this.emit({ t: 'kill', k: killer ? killer.id : null, v: target.id, hs: !!headshot, w: cause, place: before });
    if (before - 1 <= 1) this.finish();
  }

  finish() {
    if (this.phase === 'ended') return;
    const alive = this.players.filter((p) => p.alive);
    let winner = alive[0];
    if (!winner) {
      // alle gleichzeitig gestorben: zuletzt Gestorbener gewinnt
      winner = this.players.slice().sort((a, b) => a.placement - b.placement)[0];
    }
    this.phase = 'ended';
    this.winnerId = winner.id;
    winner.placement = 1;
    this.emit({ t: 'win', id: winner.id });
  }

  // ---------------- Menschliche Eingaben ----------------
  setHumanState(id, s) {
    const p = this.byId.get(id);
    if (!p || !p.alive || p.isBot) return;
    const b = p.body;
    if (this.phase === 'countdown') {
      b.yaw = s.yaw;
      p.pitch = s.pitch;
      return;
    }
    if (Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)) {
      b.vx = (s.x - b.x) * 30;
      b.vz = (s.z - b.z) * 30;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 40) { b.vx *= 40 / sp; b.vz *= 40 / sp; }
      b.x = s.x; b.y = s.y; b.z = s.z;
      if (Number.isFinite(s.vx)) { b.vx = s.vx; b.vz = s.vz; }
    }
    b.yaw = s.yaw;
    p.pitch = s.pitch;
    let f = s.flags | 0;
    f &= ~(F.HEAL | F.DEAD);
    if (p.healT >= 0) f |= F.HEAL;
    p.flags = f;
    b.stance = f & F.SLIDE ? 'slide' : f & F.CROUCH ? 'crouch' : 'stand';
    b.grounded = !(f & F.AIR);
    b.sprinting = !!(f & F.SPRINT);
  }

  humanFire(id, shot) {
    const p = this.byId.get(id);
    if (!p || !p.alive || this.phase !== 'playing') return false;
    if (p.fireTokens < 1) return false;
    // Server-Magazin: Nachladen ggf. vorzeitig beenden (Netzwerk-Jitter). Nachgeladen wird nur auf Tastendruck.
    if (p.weapon.reloading && p.weapon.reloadDur - p.weapon.reloadT < 0.4) p.weapon.finishReload();
    if (!p.weapon.fire(true)) return false;
    p.fireTokens -= 1;
    if (p.healT >= 0) this.cancelHeal(p);
    let { ox, oy, oz, dx, dy, dz } = shot;
    const l = Math.hypot(dx, dy, dz);
    if (!(l > 0.5 && l < 1.5)) return false;
    dx /= l; dy /= l; dz /= l;
    // Ursprung plausibel (nahe Spielerposition)
    const b = p.body;
    if (Math.hypot(ox - b.x, oz - b.z) > 3 || Math.abs(oy - b.y - 1.2) > 2.5) {
      ox = b.x; oy = b.y + EYE_STAND; oz = b.z;
    }
    this.fireShot(p, ox, oy, oz, dx, dy, dz, shot.rewind || 0);
    return true;
  }

  humanReload(id) {
    const p = this.byId.get(id);
    if (!p || !p.alive) return;
    if (p.weapon.startReload()) this.emit({ t: 'reload', id: p.id });
  }

  humanCancelReload(id) {
    const p = this.byId.get(id);
    if (!p) return;
    p.weapon.cancelReload();
  }

  startHeal(p) {
    if (!p.alive || p.healT >= 0 || p.medkits <= 0 || p.hp >= MAX_HP) return false;
    p.healT = 0;
    if (p.weapon.reloading) p.weapon.cancelReload();
    this.emit({ t: 'healStart', id: p.id });
    return true;
  }

  cancelHeal(p) {
    if (p.healT < 0) return;
    p.healT = -1;
    this.emit({ t: 'healCancel', id: p.id });
  }

  humanHeal(id) {
    const p = this.byId.get(id);
    if (!p || this.phase !== 'playing') return false;
    return this.startHeal(p);
  }

  humanCancelHeal(id) {
    const p = this.byId.get(id);
    if (p) this.cancelHeal(p);
  }

  // Spieler verlässt das Match: Figur scheidet aus
  removePlayer(id) {
    const p = this.byId.get(id);
    if (!p) return;
    p.connected = false;
    if (p.alive && this.phase !== 'ended') {
      p.hp = 0;
      this.emit({ t: 'hit', a: null, v: p.id, d: 0, p: 'x', hp: 0 });
      this.kill(p, null, false, 'leave');
    }
  }

  // ---------------- Netzwerk-Snapshot ----------------
  snapshot() {
    const z = this.zone.state;
    return {
      t: r2(this.time),
      mt: r2(this.matchTime),
      ph: this.phase,
      cd: r2(this.countdown),
      p: this.players.map((p) => [
        p.id, r2(p.body.x), r2(p.body.y), r2(p.body.z), r3(p.body.yaw), r3(p.pitch), p.alive ? p.flags : F.DEAD, p.hp,
        r2(p.body.vx), r2(p.body.vz),
      ]),
      z: [r2(z.x), r2(z.z), r2(z.r)],
    };
  }

  // Statistik pro Spieler (Ergebnisbildschirm)
  stats(p) {
    return {
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      kills: p.kills,
      damage: p.damage,
      headshots: p.headshots,
      placement: p.alive ? (this.phase === 'ended' ? 1 : 0) : p.placement,
      survival: p.alive ? this.matchTime : p.deathT,
      killerId: p.killerId,
    };
  }

  // Bot-Aufstellung: fehlende Plätze mit Bots füllen (genau 12)
  static fillWithBots(humans, rng, champion = null) {
    const players = humans.slice(0, MATCH_SIZE);
    const used = new Set(players.map((p) => p.name.toLowerCase()));
    const names = rng.shuffle(BOT_NAMES.slice());
    let k = 0;
    const outfits = ['cowboy', 'ranger', 'ninja', 'soldier', 'dancer', 'pirate', 'chef', 'astronaut'];
    const skins = ['grey', 'green', 'blue', 'purple', 'gold'];
    let botIdx = 0;
    if (champion && players.length < MATCH_SIZE) {
      players.push({ ...champion, id: 'bot_champ', isBot: true });
      used.add(champion.name.toLowerCase());
      botIdx++;
    }
    while (players.length < MATCH_SIZE) {
      let name = names[k++ % names.length];
      if (used.has(name.toLowerCase())) name = name + ' ' + (k + 1);
      used.add(name.toLowerCase());
      players.push({
        id: 'bot_' + botIdx++,
        name,
        isBot: true,
        outfit: rng.pick(outfits),
        color: rng.int(0, 7),
        skin: rng.pick(skins),
        crownStyle: 'gold',
        streak: 0,
      });
    }
    return players;
  }
}

function r2(v) {
  return Math.round(v * 100) / 100;
}
function r3(v) {
  return Math.round(v * 1000) / 1000;
}
