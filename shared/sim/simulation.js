// Gemeinsames Simulationsmodul: Treffer, Schaden (Überschild → Schild → Gesundheit), Siphon,
// Waffen, Inventar, Truhen und Beute, Heil-/Schild-Gegenstände, Bots, Zone, Sieg.
// Läuft im Browser (Bot-Lobby ohne Server) und server-autoritativ im Mehrspieler.
import {
  MATCH_SIZE, COUNTDOWN, MAX_HEALTH, MAX_SHIELD, START_OVERSHIELD, SIPHON, F,
  SPAWN_MIN_DIST, MAX_REWIND, EYE_STAND, EYE_CROUCH, PLAY_RADIUS, INTERACT_RANGE, AUTO_PICKUP_RANGE, SEA_LEVEL,
} from '../constants.js';
import { WEAPONS, CONSUMABLES, WEAPON_TYPES, CONSUMABLE_TYPES, weaponDamage, encodeItem } from '../items.js';
import { RNG } from '../rng.js';
import { createBody, stepMovement, bodyFlags } from './movement.js';
import { createWeaponRuntime, equipWeapon, fireWeapon, startReload, cancelReload, updateWeapon, weaponSpread } from './weapon.js';
import { createInventory, addItem, dropAll, selectedItem } from './inventory.js';
import { Loot } from './loot.js';
import { rayPlayer, dirFromAngles, applySpread } from './combat.js';
import { Zone } from './zone.js';
import { BotBrain } from './bots.js';
import { MAT } from '../physics/collision.js';
import { BOT_NAMES } from '../names.js';

const HIST = 24;

// Waffe/Gegenstand in der Hand als Zahl (für Snapshots und Figuren)
export function handCode(item) {
  if (!item) return 0;
  if (item.k === 'w') return 1 + WEAPON_TYPES.indexOf(item.w) * 5 + item.r;
  if (item.k === 'c') return -(1 + CONSUMABLE_TYPES.indexOf(item.c));
  return 0;
}

export function decodeHand(code) {
  if (code > 0) return { k: 'w', w: WEAPON_TYPES[Math.floor((code - 1) / 5)], r: (code - 1) % 5 };
  if (code < 0) return { k: 'c', c: CONSUMABLE_TYPES[-code - 1] };
  return null;
}

export class Simulation {
  /**
   * world: { terrain, collision, nav, pois, chests, floorLoot }
   * cfg: { seed, players:[{id,name,isBot,outfit,color,crownStyle,streak}], storm, botDifficulty }
   */
  constructor(world, cfg) {
    this.world = world;
    this.nav = world.nav || null;
    this.seed = cfg.seed >>> 0;
    this.rng = new RNG(this.seed ^ 0x9e3779b9);
    this.opts = { storm: cfg.storm !== false, botDifficulty: cfg.botDifficulty || 'mixed' };
    this.zone = new Zone(this.seed, world.terrain, this.opts.storm);
    this.zone.update(0);
    this.loot = new Loot(world, this.seed);
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
    this.stepCount = 0;
    if (cfg.players.length < 1 || cfg.players.length > MATCH_SIZE) throw new Error('Match braucht 1 bis ' + MATCH_SIZE + ' Spieler');
    const spawns = this.pickSpawns(cfg.players.length);
    cfg.players.forEach((pc, i) => this.addPlayer(pc, spawns[i]));
  }

  // Bodenhöhe inkl. Stege/Böden
  groundAt(x, z) {
    const t = this.world.terrain.heightAt(x, z);
    return Math.max(t, this.world.collision.groundAt(x, z, 0.35, Math.max(t, SEA_LEVEL) + 2.2));
  }

  pickSpawns(n) {
    const out = [];
    const col = this.world.collision;
    let minDist = SPAWN_MIN_DIST;
    let tries = 0;
    const R = PLAY_RADIUS - 8;
    while (out.length < n && tries < 20000) {
      tries++;
      if (tries % 3000 === 0) minDist *= 0.85;
      const x = this.rng.range(-R, R);
      const z = this.rng.range(-R, R);
      if (Math.hypot(x, z) > R) continue;
      const h = this.groundAt(x, z);
      if (h < SEA_LEVEL + 0.15) continue; // nicht im Wasser
      if (h - this.world.terrain.heightAt(x, z) < 0.05 && this.world.terrain.normalAt(x, z).y < 0.85) continue;
      if (this.nav && !this.nav.isFree(x, z)) continue;
      if (col.overlaps(x, z, 0.9, h + 0.1, h + 2.3)) continue;
      if (col.ceilingAt(x, z, 0.5, h + 0.1) < h + 12) continue; // nicht unter Dächern
      if (out.some((s) => Math.hypot(s.x - x, s.z - z) < minDist)) continue;
      out.push({ x, y: h, z, yaw: this.rng.next() * Math.PI * 2 });
    }
    while (out.length < n) out.push({ x: 0, y: this.groundAt(0, 0), z: 0, yaw: 0 });
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
      crownStyle: pc.crownStyle || 'gold',
      streak: pc.streak || 0,
      body,
      pitch: 0,
      flags: 0,
      health: MAX_HEALTH,
      shield: 0,
      overshield: START_OVERSHIELD,
      alive: true,
      kills: 0,
      damage: 0,
      headshots: 0,
      shotsHit: 0,
      inv: createInventory(),
      wr: createWeaponRuntime(),
      useT: -1,
      useSlot: -1,
      placement: 0,
      deathT: 0,
      killerId: null,
      lastDamagedBy: null,
      lastDamageT: -10,
      stormAcc: 0,
      fireTokens: 1.5,
      hist: new Float32Array(HIST * 6),
      histN: 0,
      histHead: 0,
      connected: true,
      ping: 0,
    };
    if (p.isBot) {
      // gemischte Lobby: viele leichte/normale Bots, wenige starke
      let diff = this.opts.botDifficulty;
      if (diff === 'mixed') {
        const r = this.rng.next();
        diff = r < 0.45 ? 'easy' : r < 0.9 ? 'normal' : 'hard';
      }
      p.brain = new BotBrain(this, p, diff);
    }
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
    this.stepCount++;
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
    while (this.recentShots.length && this.recentShots[0].t < this.time - 1.2) this.recentShots.shift();

    const autoPickup = this.stepCount % 4 === 0;
    for (const p of this.players) {
      if (!p.alive) continue;
      const item = selectedItem(p.inv);
      const wev = updateWeapon(p.wr, item, p.inv.ammo, dt);
      if (wev) {
        p.inv.rev++;
        if (wev === 'done') this.emit({ t: 'reloaded', id: p.id });
      }
      // Feuerrate-Budget (Server prüft Schüsse der Menschen)
      const rate = item && item.k === 'w' ? WEAPONS[item.w].fireRate : 1;
      p.fireTokens = Math.min(1.5, p.fireTokens + dt * rate * 1.15);
      // Schild/Medikit benutzen
      if (p.useT >= 0) {
        p.useT += dt;
        const it = p.inv.slots[p.useSlot];
        if (!it || it.k !== 'c' || p.inv.sel !== p.useSlot) this.cancelUse(p);
        else if (p.useT >= CONSUMABLES[it.c].use) this.finishUse(p, it);
      }
      if (autoPickup) this.autoPickupAmmo(p);
      if (p.isBot) this.stepBot(p, dt);
    }

    // Sturmschaden (nur Gesundheit)
    if (this.phase === 'playing' && this.zone.enabled) {
      const dps = this.zone.state.dps;
      for (const p of this.players) {
        if (!p.alive) continue;
        if (this.zone.isOutside(p.body.x, p.body.z)) {
          p.stormAcc += dps * dt;
          if (p.stormAcc >= 1) {
            const dmg = Math.floor(p.stormAcc);
            p.stormAcc -= dmg;
            this.applyDamage(p, dmg, 'storm', 's', null, null);
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
    if (act.select >= 0 && act.select !== p.inv.sel) this.selectSlot(p, act.select);
    if (act.use >= 0) this.startUse(p, act.use);
    if (act.interact) this.interact(p, act.interact);
    const item = selectedItem(p.inv);
    if (act.reload && p.useT < 0 && startReload(p.wr, item, p.inv.ammo)) this.emit({ t: 'reload', id: p.id });
    input.using = p.useT >= 0;
    if (p.wr.reloading) input.sprint = false;
    stepMovement(p.body, input, dt, this.world);
    p.pitch = input.pitch;
    let extra = 0;
    if (input.ads) extra |= F.ADS;
    if (p.wr.reloading) extra |= F.RELOAD;
    if (p.useT >= 0) extra |= F.USING;
    if (act.fire && !p.body.sprinting && item && item.k === 'w' && p.useT < 0 && fireWeapon(p.wr, item)) {
      extra |= F.FIRING;
      const b = p.body;
      const flags = bodyFlags(b, extra);
      const eye = b.y + ((flags & (F.CROUCH | F.SLIDE)) ? EYE_CROUCH : EYE_STAND);
      const base = dirFromAngles(b.yaw, p.pitch);
      const speed = Math.hypot(b.vx, b.vz);
      const spread = weaponSpread(p.wr, item, flags, speed);
      const dirs = [];
      const pellets = WEAPONS[item.w].pellets;
      const rnd = () => this.rng.next();
      for (let k = 0; k < pellets; k++) dirs.push(applySpread(base, spread, rnd));
      this.fireShot(p, item, b.x, eye, b.z, dirs, 0);
      brain.onShotFired(item);
    } else if (p.wr.sinceShot < 0.2) {
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
    if (newer >= 0) {
      out.x = h[newer * 6 + 1]; out.y = h[newer * 6 + 2]; out.z = h[newer * 6 + 3]; out.yaw = h[newer * 6 + 4]; out.flags = h[newer * 6 + 5];
    }
    return out;
  }

  // Hitscan-Schuss mit einer oder mehreren Kugeln (Schrotflinten); Schaden je Ziel summiert
  fireShot(shooter, item, ox, oy, oz, dirs, rewind) {
    const def = WEAPONS[item.w];
    const range = def.range;
    const col = this.world.collision;
    const terrain = this.world.terrain;
    const rt = this.time - Math.min(MAX_REWIND, Math.max(0, rewind || 0));
    const states = this._states || (this._states = new Map());
    states.clear();
    for (const o of this.players) {
      if (o === shooter || !o.alive) continue;
      const st = { x: 0, y: 0, z: 0, yaw: 0, flags: 0 };
      if (rewind > 0) this.rewindState(o, rt, st);
      else { st.x = o.body.x; st.y = o.body.y; st.z = o.body.z; st.yaw = o.body.yaw; st.flags = o.flags; }
      states.set(o, st);
    }
    const hits = new Map();
    const ends = [];
    for (const d of dirs) {
      let tWorld = col.raycast(ox, oy, oz, d.x, d.y, d.z, range, true);
      let mat = tWorld >= 0 ? col.hitOut.mat : -1;
      if (tWorld < 0) tWorld = range;
      if (d.y < -1e-4) {
        const tw = (SEA_LEVEL - oy) / d.y;
        if (tw > 0 && tw < tWorld && terrain.heightAt(ox + d.x * tw, oz + d.z * tw) < SEA_LEVEL) {
          tWorld = tw;
          mat = MAT.WATER;
        }
      }
      let best = tWorld;
      let hitP = null;
      let hitPart = null;
      for (const [o, st] of states) {
        const r = rayPlayer(st, ox, oy, oz, d.x, d.y, d.z, best);
        if (r && r.t < best) { best = r.t; hitP = o; hitPart = r.part; }
      }
      const ex = ox + d.x * best, ey = oy + d.y * best, ez = oz + d.z * best;
      ends.push([r2(ex), r2(ey), r2(ez), hitP ? MAT.PLAYER : mat]);
      if (hitP) {
        let h = hits.get(hitP);
        if (!h) hits.set(hitP, (h = { dmg: 0, head: false, part: hitPart, pos: [r2(ex), r2(ey), r2(ez)] }));
        h.dmg += weaponDamage(item.w, item.r, hitPart, best);
        if (hitPart === 'h') { h.head = true; h.pos = [r2(ex), r2(ey), r2(ez)]; }
      }
    }
    this.recentShots.push({ x: ox, y: oy, z: oz, t: this.time, id: shooter.id });
    this.emit({ t: 'shot', id: shooter.id, w: item.w, o: [r2(ox), r2(oy), r2(oz)], e: ends });
    for (const [target, h] of hits) {
      shooter.shotsHit++;
      this.applyDamage(target, Math.max(1, Math.round(h.dmg)), shooter.id, h.head ? 'h' : h.part, h.pos, item.w);
      if (this.phase === 'ended') break;
    }
  }

  // Schaden: Überschild → Schild → Gesundheit (Sturm trifft nur die Gesundheit)
  applyDamage(target, dmg, attackerId, part, pos, weapon) {
    if (!target.alive || this.phase === 'ended') return;
    const attacker = attackerId && attackerId !== 'storm' ? this.byId.get(attackerId) : null;
    let rest = dmg;
    let sd = 0;
    const hadShield = target.shield + target.overshield > 0;
    if (attackerId !== 'storm') {
      const a = Math.min(target.overshield, rest);
      target.overshield -= a;
      rest -= a;
      const b = Math.min(target.shield, rest);
      target.shield -= b;
      rest -= b;
      sd = a + b;
    }
    const hd = Math.min(target.health, rest);
    target.health -= rest;
    target.lastDamagedBy = attackerId;
    target.lastDamageT = this.time;
    if (attacker) {
      attacker.damage += sd + hd;
      if (part === 'h') attacker.headshots++;
    }
    const ev = {
      t: 'hit', a: attackerId, v: target.id, d: dmg, sd, p: part,
      hp: Math.max(0, target.health), sh: target.shield, os: target.overshield,
    };
    if (hadShield && sd > 0 && target.shield + target.overshield <= 0 && target.health > 0) ev.br = 1;
    if (pos) ev.pos = pos;
    if (attacker) ev.from = [r2(attacker.body.x), r2(attacker.body.z)];
    this.emit(ev);
    if (target.health <= 0) this.kill(target, attacker, part === 'h', attackerId === 'storm' ? 'storm' : weapon || 'ar');
  }

  kill(target, killer, headshot, cause) {
    if (!target.alive) return;
    const before = this.aliveCount();
    target.alive = false;
    target.health = 0;
    target.shield = 0;
    target.overshield = 0;
    target.useT = -1;
    target.placement = before;
    target.deathT = this.matchTime;
    target.killerId = killer ? killer.id : null;
    target.flags = F.DEAD;
    this.emit({ t: 'kill', k: killer ? killer.id : null, v: target.id, hs: !!headshot, w: cause, place: before });
    if (killer && killer !== target && killer.alive) {
      killer.kills++;
      // Siphon: +50, erst Gesundheit, Rest als Schild
      const toHealth = Math.min(SIPHON, MAX_HEALTH - killer.health);
      killer.health += toHealth;
      killer.shield = Math.min(MAX_SHIELD, killer.shield + (SIPHON - toHealth));
      this.emit({ t: 'siphon', id: killer.id, hp: killer.health, sh: killer.shield });
    }
    // Beute fallen lassen
    const items = dropAll(target.inv);
    if (items.length) this.spawnLoot(items, target.body.x, target.body.y, target.body.z, null, 1.3);
    if (before - 1 <= 1) this.finish();
  }

  finish() {
    if (this.phase === 'ended') return;
    const alive = this.players.filter((p) => p.alive);
    let winner = alive[0];
    if (!winner) winner = this.players.slice().sort((a, b) => a.placement - b.placement)[0];
    this.phase = 'ended';
    this.winnerId = winner.id;
    winner.placement = 1;
    this.emit({ t: 'win', id: winner.id });
  }

  // ---------------- Beute ----------------
  spawnLoot(items, x, y, z, dirYaw, radius) {
    const list = this.loot.scatter(items, x, y, z, dirYaw, radius);
    this.emitLoot(list);
    return list;
  }

  emitLoot(list) {
    this.emit({ t: 'loot', a: list.map((p) => [p.id, encodeItem(p.item), r2(p.x), r2(p.y), r2(p.z), r2(p.fx), r2(p.fy), r2(p.fz)]) });
  }

  interact(p, target) {
    if (!p.alive || this.phase !== 'playing') return false;
    const b = p.body;
    const reach = INTERACT_RANGE + (p.isBot ? 0 : 1.0); // Menschen: Toleranz für Netzwerkverzögerung
    if (target.c !== undefined) {
      const c = this.loot.chest(target.c);
      if (!c || c.open) return false;
      if (Math.hypot(c.x - b.x, c.z - b.z) > reach || Math.abs(c.y - b.y) > 2.5) return false;
      const list = this.loot.openChest(c);
      this.emit({ t: 'chest', id: c.id, by: p.id });
      this.emitLoot(list);
      return true;
    }
    if (target.l !== undefined) {
      const pk = this.loot.pickups.get(target.l);
      if (!pk) return false;
      if (Math.hypot(pk.x - b.x, pk.z - b.z) > reach || Math.abs(pk.y - b.y) > 2.5) return false;
      return this.pickup(p, pk);
    }
    return false;
  }

  pickup(p, pk) {
    const item = pk.item;
    const wasEmpty = !selectedItem(p.inv);
    const res = addItem(p.inv, item, true);
    if (!res.taken) return false;
    if (res.rest) {
      pk.item = res.rest;
      this.emit({ t: 'lootn', id: pk.id, it: encodeItem(pk.item) });
    } else {
      this.loot.remove(pk.id);
      this.emit({ t: 'unloot', id: pk.id, by: p.id });
    }
    if (res.dropped) {
      this.cancelUse(p);
      this.spawnLoot([res.dropped], p.body.x, p.body.y, p.body.z, p.body.yaw, 1.0);
    }
    // neue Waffe landet im gewählten Platz oder die Hand war leer: gleich ausrüsten
    if (res.slot === p.inv.sel && (res.dropped || wasEmpty)) equipWeapon(p.wr, selectedItem(p.inv));
    else if (wasEmpty && res.slot >= 0 && item.k !== 'a') this.selectSlot(p, res.slot);
    this.emit({ t: 'pick', id: p.id, it: encodeItem(item) });
    return true;
  }

  autoPickupAmmo(p) {
    const b = p.body;
    for (const pk of this.loot.pickups.values()) {
      if (pk.item.k !== 'a') continue;
      const dx = pk.x - b.x, dz = pk.z - b.z;
      if (dx * dx + dz * dz > AUTO_PICKUP_RANGE * AUTO_PICKUP_RANGE || Math.abs(pk.y - b.y) > 1.6) continue;
      this.pickup(p, pk);
    }
  }

  selectSlot(p, slot) {
    if (slot < 0 || slot > 4 || slot === p.inv.sel) return;
    this.cancelUse(p);
    p.inv.sel = slot;
    equipWeapon(p.wr, selectedItem(p.inv));
    p.fireTokens = 1;
  }

  // ---------------- Schilde / Medikits ----------------
  canUse(p, it) {
    if (!it || it.k !== 'c') return false;
    const c = CONSUMABLES[it.c];
    if (c.heal) return p.health < MAX_HEALTH;
    return p.shield < c.cap;
  }

  startUse(p, slot) {
    if (!p.alive || p.useT >= 0 || this.phase !== 'playing') return false;
    const it = p.inv.slots[slot];
    if (!this.canUse(p, it)) return false;
    if (p.inv.sel !== slot) this.selectSlot(p, slot);
    cancelReload(p.wr);
    p.useT = 0;
    p.useSlot = slot;
    this.emit({ t: 'useStart', id: p.id, c: it.c });
    return true;
  }

  cancelUse(p) {
    if (p.useT < 0) return;
    p.useT = -1;
    this.emit({ t: 'useCancel', id: p.id });
  }

  finishUse(p, it) {
    const c = CONSUMABLES[it.c];
    if (c.heal) p.health = Math.min(MAX_HEALTH, c.heal);
    else if (p.shield < c.cap) p.shield = Math.min(c.cap, p.shield + c.shield);
    it.n--;
    if (it.n <= 0) p.inv.slots[p.useSlot] = null;
    p.inv.rev++;
    p.useT = -1;
    this.emit({ t: 'used', id: p.id, c: it.c, hp: p.health, sh: p.shield });
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
    f &= ~(F.USING | F.DEAD);
    if (p.useT >= 0) f |= F.USING;
    p.flags = f;
    b.stance = f & F.SLIDE ? 'slide' : f & F.CROUCH ? 'crouch' : 'stand';
    b.grounded = !(f & F.AIR);
    b.sprinting = !!(f & F.SPRINT);
  }

  // shot: { s: Platz, ox, oy, oz, dirs: [{x,y,z}, …], rewind }
  humanFire(id, shot) {
    const p = this.byId.get(id);
    if (!p || !p.alive || this.phase !== 'playing') return false;
    if (shot.s !== p.inv.sel && shot.s >= 0 && shot.s < 5) {
      p.inv.sel = shot.s;
      equipWeapon(p.wr, selectedItem(p.inv));
      p.wr.equipT = 0;
    }
    const item = selectedItem(p.inv);
    if (!item || item.k !== 'w' || p.fireTokens < 1) return false;
    const def = WEAPONS[item.w];
    // Nachladen ggf. vorzeitig beenden (Netzwerk-Jitter)
    if (p.wr.reloading && !def.shellReload && p.wr.reloadDur - p.wr.reloadT < 0.4) updateWeapon(p.wr, item, p.inv.ammo, 1);
    p.wr.equipT = 0;
    if (!fireWeapon(p.wr, item, true)) return false;
    p.fireTokens -= 1;
    this.cancelUse(p);
    const dirs = [];
    for (const d of (shot.dirs || []).slice(0, def.pellets)) {
      const l = Math.hypot(d.x, d.y, d.z);
      if (l > 0.5 && l < 1.5) dirs.push({ x: d.x / l, y: d.y / l, z: d.z / l });
    }
    if (!dirs.length) return false;
    let { ox, oy, oz } = shot;
    const b = p.body;
    if (Math.hypot(ox - b.x, oz - b.z) > 3 || Math.abs(oy - b.y - 1.2) > 2.5) {
      ox = b.x; oy = b.y + EYE_STAND; oz = b.z;
    }
    this.fireShot(p, item, ox, oy, oz, dirs, shot.rewind || 0);
    return true;
  }

  humanReload(id) {
    const p = this.byId.get(id);
    if (!p || !p.alive || p.useT >= 0) return;
    if (startReload(p.wr, selectedItem(p.inv), p.inv.ammo)) this.emit({ t: 'reload', id: p.id });
  }

  humanCancelReload(id) {
    const p = this.byId.get(id);
    if (p) cancelReload(p.wr);
  }

  humanSelect(id, slot) {
    const p = this.byId.get(id);
    if (p && p.alive) this.selectSlot(p, slot | 0);
  }

  humanInteract(id, target) {
    const p = this.byId.get(id);
    return p ? this.interact(p, target) : false;
  }

  humanUse(id, slot) {
    const p = this.byId.get(id);
    return p ? this.startUse(p, slot | 0) : false;
  }

  humanCancelUse(id) {
    const p = this.byId.get(id);
    if (p) this.cancelUse(p);
  }

  // Spieler verlässt das Match: Figur scheidet aus
  removePlayer(id) {
    const p = this.byId.get(id);
    if (!p) return;
    p.connected = false;
    if (p.alive && this.phase !== 'ended') {
      p.health = 0;
      this.emit({ t: 'hit', a: null, v: p.id, d: 0, sd: 0, p: 'x', hp: 0, sh: 0, os: 0 });
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
        p.id, r2(p.body.x), r2(p.body.y), r2(p.body.z), r3(p.body.yaw), r3(p.pitch), p.alive ? p.flags : F.DEAD,
        Math.ceil(p.health), Math.ceil(p.shield), Math.ceil(p.overshield), r2(p.body.vx), r2(p.body.vz),
        p.alive ? handCode(selectedItem(p.inv)) : 0,
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
      damage: Math.round(p.damage),
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
