// Gemeinsames Simulationsmodul: Treffer, Schaden (Überschild → Schild → Gesundheit), Siphon,
// Waffen, Inventar, Truhen und Beute, Heil-/Schild-Gegenstände, Bots, Zone, Sieg.
// Läuft im Browser (Bot-Lobby ohne Server) und server-autoritativ im Mehrspieler.
import {
  MATCH_SIZE, COUNTDOWN, MAX_HEALTH, MAX_SHIELD, START_OVERSHIELD, SIPHON, F,
  SPAWN_MIN_DIST, MAX_REWIND, EYE_STAND, EYE_CROUCH, PLAY_RADIUS, INTERACT_RANGE, AUTO_PICKUP_RANGE, SEA_LEVEL,
  KNOCK_HP, KNOCK_BLEED, REVIVE_TIME, REVIVE_HP, REVIVE_RANGE,
} from '../constants.js';
import { WEAPONS, CONSUMABLES, WEAPON_TYPES, CONSUMABLE_TYPES, weaponDamage, encodeItem, AMMO_TYPES, AMMO_MAX, KILL_AMMO, ammoItem, consumableItem, weaponItem } from '../items.js';
import { RNG } from '../rng.js';
import { createBody, stepMovement, bodyFlags } from './movement.js';
import { createWeaponRuntime, equipWeapon, fireWeapon, startReload, cancelReload, updateWeapon, weaponSpread, botWeaponSpread } from './weapon.js';
import { createInventory, addItem, dropAll, selectedItem, stackRoom, KNIFE_SLOT } from './inventory.js';
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

// Rechenbudget der Bot-Wegsuche pro Simulationsschritt (untersuchte Navigationszellen)
const EXPAND_PER_TICK = 5000;

// Richtungen für einen Messerhieb: Mitte zuerst, dann ein kleiner Fächer (±9° seitlich, ±6° hoch/runter)
function meleeFan(d) {
  const out = [d];
  const yaw = Math.atan2(d.x, d.z), pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
  for (const [dy, dp] of [[0.16, 0], [-0.16, 0], [0, 0.1], [0, -0.1], [0.1, 0.07], [-0.1, 0.07], [0.1, -0.07], [-0.1, -0.07]]) {
    const cy = Math.cos(pitch + dp);
    out.push({ x: Math.sin(yaw + dy) * cy, y: Math.sin(pitch + dp), z: Math.cos(yaw + dy) * cy });
  }
  return out;
}

export class Simulation {
  /**
   * world: { terrain, collision, nav, pois, chests, floorLoot }
   * cfg: { seed, players:[{id,name,isBot,outfit,color,crownStyle,streak,team}], storm, botDifficulty, mode }
   * mode 'duo': Zweierteams (kein Eigenbeschuss, Niederschlagen + Wiederbeleben, Team-Platzierung)
   */
  constructor(world, cfg) {
    this.world = world;
    this.nav = world.nav || null;
    this.seed = cfg.seed >>> 0;
    this.rng = new RNG(this.seed ^ 0x9e3779b9);
    this.opts = { storm: cfg.storm !== false, botDifficulty: cfg.botDifficulty || 'mixed' };
    this.mode = cfg.mode === 'duo' ? 'duo' : 'solo';
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
    this.expandBudget = EXPAND_PER_TICK;
    this.winnerId = null;
    this.players = [];
    this.byId = new Map();
    this.stepCount = 0;
    if (cfg.players.length < 1 || cfg.players.length > MATCH_SIZE) throw new Error('Match braucht 1 bis ' + MATCH_SIZE + ' Spieler');
    // Teams: Solo = jeder für sich; Duo = Team-Nummer aus der Aufstellung (Partner starten zusammen)
    const teamOf = cfg.players.map((pc, i) => (this.mode === 'duo' && Number.isInteger(pc.team) ? pc.team : 1000 + i));
    const teamIds = [...new Set(teamOf)];
    const spawns = this.pickSpawns(teamIds.length);
    const used = new Map();
    cfg.players.forEach((pc, i) => {
      const k = teamIds.indexOf(teamOf[i]);
      const n = used.get(k) || 0;
      used.set(k, n + 1);
      const sp = spawns[k];
      const off = n ? this.teamSpawnOffset(sp, n) : sp;
      const p = this.addPlayer(pc, off);
      p.team = k;
    });
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

  // Partner neben dem Startpunkt (freie Stelle in 2–4 m Abstand)
  teamSpawnOffset(sp, n) {
    const col = this.world.collision;
    for (let k = 0; k < 16; k++) {
      const a = sp.yaw + Math.PI / 2 + k * 0.8 + n;
      const r = 2.2 + (k % 4) * 0.6;
      const x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r;
      const h = this.groundAt(x, z);
      if (h < SEA_LEVEL + 0.15 || Math.abs(h - sp.y) > 1.2) continue;
      if (col.overlaps(x, z, 0.6, h + 0.1, h + 2.2)) continue;
      return { x, y: h, z, yaw: sp.yaw };
    }
    return { ...sp, x: sp.x + 0.8 };
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
      inv: createInventory(pc.knife),
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
      team: 0,
      knocked: false,
      knockedBy: null,
      reviving: null, // ID des Partners, der gerade wiederbelebt wird
      reviveT: 0,
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

  // Anzahl Teams mit mindestens einem lebenden Mitglied
  aliveTeamCount() {
    const t = new Set();
    for (const p of this.players) if (p.alive) t.add(p.team);
    return t.size;
  }

  mates(p) {
    return this.players.filter((o) => o !== p && o.team === p.team);
  }

  isMate(a, b) {
    return this.mode === 'duo' && a !== b && a.team === b.team;
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
    this.expandBudget = EXPAND_PER_TICK;
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
      if (autoPickup && !p.knocked) this.autoPickupAmmo(p);
      if (p.isBot) this.stepBot(p, dt);
    }

    if (this.mode === 'duo' && this.phase === 'playing') this.stepDuo(dt);

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

  // Duo: Ausbluten am Boden und Wiederbeleben
  stepDuo(dt) {
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.knocked) {
        p.health -= KNOCK_BLEED * dt;
        if (p.health <= 0) {
          const k = p.knockedBy ? this.byId.get(p.knockedBy) : null;
          this.kill(p, k && k !== p ? k : null, false, 'bleed');
          if (this.phase === 'ended') return;
        }
        continue;
      }
      if (!p.reviving) continue;
      const t = this.byId.get(p.reviving);
      const ok = t && t.alive && t.knocked && t.team === p.team && p.useT < 0 &&
        Math.hypot(t.body.x - p.body.x, t.body.z - p.body.z) <= REVIVE_RANGE + 0.6 && Math.abs(t.body.y - p.body.y) < 2;
      if (!ok) { this.cancelRevive(p); continue; }
      p.reviveT += dt;
      if (p.reviveT >= REVIVE_TIME) this.revive(t, p);
    }
  }

  revive(t, by) {
    t.knocked = false;
    t.knockedBy = null;
    t.health = REVIVE_HP;
    t.stormAcc = 0;
    by.reviving = null;
    by.reviveT = 0;
    this.emit({ t: 'revive', id: t.id, by: by.id });
  }

  cancelRevive(p) {
    if (!p.reviving) return;
    const id = p.reviving;
    p.reviving = null;
    p.reviveT = 0;
    this.emit({ t: 'reviveStop', id: p.id, v: id });
  }

  // Wiederbeleben beginnen (Partner am Boden in Reichweite) bzw. mit null abbrechen
  startRevive(p, targetId) {
    if (!targetId) { this.cancelRevive(p); return false; }
    const t = this.byId.get(targetId);
    if (!p.alive || p.knocked || !t || !t.alive || !t.knocked || t.team !== p.team || p === t) return false;
    if (Math.hypot(t.body.x - p.body.x, t.body.z - p.body.z) > REVIVE_RANGE + 0.8) return false;
    if (p.reviving === t.id) return true;
    this.cancelUse(p);
    cancelReload(p.wr);
    p.reviving = t.id;
    p.reviveT = 0;
    this.emit({ t: 'reviveStart', id: p.id, v: t.id });
    return true;
  }

  humanRevive(id, targetId) {
    const p = this.byId.get(id);
    return p ? this.startRevive(p, targetId) : false;
  }

  stepBot(p, dt) {
    const brain = p.brain;
    const input = brain.update(dt);
    const act = brain.actions;
    if (this.phase !== 'playing') return;
    if (p.knocked || p.reviving) {
      // am Boden: nur kriechen; beim Wiederbeleben stillhalten
      if (p.knocked) { input.crouch = true; input.speedMul = 0.8; } else { input.mx = 0; input.mz = 0; }
      input.sprint = false; input.jump = false; input.crouchPressed = false; input.ads = false;
      if (!p.knocked && act.revive !== undefined && act.revive !== p.reviving) this.startRevive(p, act.revive);
      stepMovement(p.body, input, dt, this.world);
      p.pitch = input.pitch;
      p.flags = bodyFlags(p.body, 0);
      return;
    }
    input.speedMul = 0;
    if (act.revive) this.startRevive(p, act.revive);
    if (act.select >= 0 && act.select !== p.inv.sel) this.selectSlot(p, act.select);
    if (act.use >= 0) this.startUse(p, act.use);
    if (act.interact) this.interact(p, act.interact);
    const item = selectedItem(p.inv);
    if (act.reload && p.useT < 0 && startReload(p.wr, item, p.inv.ammo)) this.emit({ t: 'reload', id: p.id });
    input.using = p.useT >= 0;
    if (p.wr.reloading) input.sprint = false;
    stepMovement(p.body, input, dt, this.world);
    if (p.body.slideStarted) this.slideCount = (this.slideCount || 0) + 1;
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
      const spread = botWeaponSpread(p.wr, item, flags, speed) * (brain.spreadMul || 1);
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
  // wall: Admin „durch Wände schießen“ – Welt-Geometrie wird ignoriert
  fireShot(shooter, item, ox, oy, oz, dirs, rewind, wall = false) {
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
    // Messer: großzügiger Nahkampf – ein Strahl in der Mitte plus ein Fächer drumherum,
    // der erste getroffene Spieler bekommt den vollen Schaden (nur einmal pro Hieb)
    if (def.melee && dirs.length) dirs = meleeFan(dirs[0]);
    let meleeHit = false;
    for (const d of dirs) {
      if (meleeHit) break;
      let tWorld = wall ? -1 : col.raycast(ox, oy, oz, d.x, d.y, d.z, range, true, true);
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
        if (def.melee) meleeHit = true;
        let h = hits.get(hitP);
        if (!h) hits.set(hitP, (h = { dmg: 0, head: false, part: hitPart, pos: [r2(ex), r2(ey), r2(ez)] }));
        h.dmg += def.melee ? def.dmg[0] * (hitPart === 'h' ? def.hs : 1) : weaponDamage(item.w, item.r, hitPart, best);
        if (hitPart === 'h') { h.head = true; h.pos = [r2(ex), r2(ey), r2(ez)]; }
      }
    }
    this.recentShots.push({ x: ox, y: oy, z: oz, t: this.time, id: shooter.id });
    this.emit({ t: 'shot', id: shooter.id, w: item.w, o: [r2(ox), r2(oy), r2(oz)], e: def.melee ? ends.slice(0, 1) : ends });
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
    if (attacker && this.isMate(attacker, target)) return; // kein Eigenbeschuss im Duo
    if (target.knocked) {
      // am Boden: Schaden direkt aufs Leben (Schilde sind weg)
      target.health -= dmg;
      if (attacker) attacker.damage += Math.min(dmg, Math.max(0, target.health + dmg));
      const ev = { t: 'hit', a: attackerId, v: target.id, d: dmg, sd: 0, p: part, hp: Math.max(0, target.health), sh: 0, os: 0, dn: 1 };
      if (pos) ev.pos = pos;
      if (attacker) ev.from = [r2(attacker.body.x), r2(attacker.body.z)];
      this.emit(ev);
      if (target.health <= 0) this.kill(target, attacker || (target.knockedBy && this.byId.get(target.knockedBy)) || null, part === 'h', attackerId === 'storm' ? 'storm' : weapon || 'ar');
      return;
    }
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
    if (weapon === 'knife') ev.w = 'knife';
    this.emit(ev);
    if (target.health <= 0) {
      if (this.canKnock(target)) this.knock(target, attacker, part === 'h', attackerId === 'storm' ? 'storm' : weapon || 'ar');
      else this.kill(target, attacker, part === 'h', attackerId === 'storm' ? 'storm' : weapon || 'ar');
    }
  }

  // Duo: niederschlagen statt eliminieren, solange ein Partner noch steht
  canKnock(p) {
    return this.mode === 'duo' && this.mates(p).some((m) => m.alive && !m.knocked);
  }

  knock(target, attacker, headshot, cause) {
    target.knocked = true;
    target.knockedBy = attacker ? attacker.id : null;
    target.health = KNOCK_HP;
    target.shield = 0;
    target.overshield = 0;
    target.stormAcc = 0;
    this.cancelUse(target);
    cancelReload(target.wr);
    this.cancelRevive(target);
    // wer diesen Spieler gerade wiederbelebt, bricht nicht ab (er selbst ist nicht betroffen)
    this.emit({ t: 'knock', k: attacker ? attacker.id : null, v: target.id, hs: !!headshot, w: cause });
  }

  kill(target, killer, headshot, cause) {
    if (!target.alive) return;
    const before = this.aliveTeamCount();
    target.alive = false;
    target.knocked = false;
    target.health = 0;
    target.shield = 0;
    target.overshield = 0;
    target.useT = -1;
    this.cancelRevive(target);
    // Team ausgeschieden? (niemand mehr auf den Beinen → Partner am Boden scheiden mit aus)
    const mates = this.mates(target).filter((m) => m.alive);
    const teamOut = !mates.some((m) => !m.knocked);
    target.placement = teamOut ? before : 0;
    target.deathT = this.matchTime;
    target.killerId = killer ? killer.id : null;
    target.flags = F.DEAD;
    this.emit({ t: 'kill', k: killer ? killer.id : null, v: target.id, hs: !!headshot, w: cause, place: teamOut ? before : 0 });
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
    // Kill-Munition: je ein Magazin jeder Art (mit vorhandener Munition des Opfers zusammengelegt)
    for (const a of AMMO_TYPES) {
      const have = items.find((it) => it.k === 'a' && it.a === a);
      if (have) have.n += KILL_AMMO[a];
      else items.push(ammoItem(a, KILL_AMMO[a]));
    }
    if (items.length) this.spawnLoot(items, target.body.x, target.body.y, target.body.z, null, 1.3);
    if (teamOut) {
      for (const m of this.mates(target)) {
        if (m.alive) this.kill(m, killer, false, 'bleed');
        m.placement = before;
      }
      if (this.phase !== 'ended' && before - 1 <= 1) this.finish();
    }
  }

  finish() {
    if (this.phase === 'ended') return;
    const alive = this.players.filter((p) => p.alive);
    let winner = alive[0];
    if (!winner) winner = this.players.slice().sort((a, b) => a.placement - b.placement)[0];
    this.phase = 'ended';
    this.winnerId = winner.id;
    winner.placement = 1;
    // Duo: das ganze Team gewinnt (auch ein bereits eliminierter Partner)
    for (const m of this.mates(winner)) m.placement = 1;
    this.emit({ t: 'win', id: winner.id, team: winner.team });
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
    if (!p.alive || p.knocked || this.phase !== 'playing') return false;
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

  // Beim Drüberlaufen: Munition immer, Schilde/Medikits nur, wenn schon ein Stapel davon im
  // Inventar ist (dann nur so viele, wie noch in die vorhandenen Stapel passen)
  autoPickupAmmo(p) {
    const b = p.body;
    for (const pk of this.loot.pickups.values()) {
      if (pk.item.k === 'w') continue;
      const dx = pk.x - b.x, dz = pk.z - b.z;
      if (dx * dx + dz * dz > AUTO_PICKUP_RANGE * AUTO_PICKUP_RANGE || Math.abs(pk.y - b.y) > 1.6) continue;
      if (pk.dropBy === p.id && this.time < pk.dropUntil) continue;
      if (pk.item.k === 'c') {
        const room = stackRoom(p.inv, pk.item.c);
        if (room <= 0) continue;
        if (room < pk.item.n) {
          addItem(p.inv, consumableItem(pk.item.c, room), false);
          pk.item = consumableItem(pk.item.c, pk.item.n - room);
          this.emit({ t: 'lootn', id: pk.id, it: encodeItem(pk.item) });
          this.emit({ t: 'pick', id: p.id, it: encodeItem(consumableItem(pk.item.c, room)) });
          continue;
        }
      }
      this.pickup(p, pk);
    }
  }

  selectSlot(p, slot) {
    if (slot < 0 || slot > KNIFE_SLOT || slot === p.inv.sel || p.knocked) return;
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
    if (!p.alive || p.knocked || p.useT >= 0 || this.phase !== 'playing') return false;
    const it = p.inv.slots[slot];
    if (!this.canUse(p, it)) return false;
    if (p.inv.sel !== slot) this.selectSlot(p, slot);
    cancelReload(p.wr);
    p.useT = 0;
    p.useSlot = slot;
    this.emit({ t: 'useStart', id: p.id, c: it.c });
    // Schilde/Medikits wirken sofort
    if (CONSUMABLES[it.c].use <= 0) this.finishUse(p, it);
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
    if (!p || !p.alive || p.knocked || this.phase !== 'playing') return false;
    if (p.reviving) this.cancelRevive(p);
    if (shot.s !== p.inv.sel && shot.s >= 0 && shot.s <= KNIFE_SLOT) {
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
    if (p.infAmmo) item.mag = def.mag; // Admin: unendliche Munition
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
    this.fireShot(p, item, ox, oy, oz, dirs, shot.rewind || 0, !!shot.wall);
    return true;
  }

  humanReload(id) {
    const p = this.byId.get(id);
    if (!p || !p.alive || p.knocked || p.useT >= 0) return;
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

  // Inventar sortieren: zwei Plätze tauschen, die Auswahl folgt dem Gegenstand in der Hand
  humanSwap(id, a, b) {
    const p = this.byId.get(id);
    a |= 0; b |= 0;
    if (!p || !p.alive || a === b || a < 0 || b < 0 || a > 4 || b > 4) return false;
    const inv = p.inv;
    const t = inv.slots[a];
    inv.slots[a] = inv.slots[b];
    inv.slots[b] = t;
    if (inv.sel === a) inv.sel = b;
    else if (inv.sel === b) inv.sel = a;
    if (p.useT >= 0) p.useSlot = inv.sel;
    inv.rev++;
    return true;
  }

  // Gegenstand aus dem Inventar fallen lassen (aus dem TAB-Menü gezogen)
  humanDrop(id, slot) {
    const p = this.byId.get(id);
    slot |= 0;
    if (!p || !p.alive || slot < 0 || slot > 4) return false;
    const it = p.inv.slots[slot];
    if (!it) return false;
    if (slot === p.inv.sel) {
      this.cancelUse(p);
      cancelReload(p.wr);
    }
    p.inv.slots[slot] = null;
    if (slot === p.inv.sel) equipWeapon(p.wr, null);
    p.inv.rev++;
    this.dropNear(p, it);
    return true;
  }

  // Munition fallen lassen: ein Magazin der Art (bzw. der Rest)
  humanDropAmmo(id, a) {
    const p = this.byId.get(id);
    if (!p || !p.alive || !AMMO_TYPES.includes(a)) return false;
    const n = Math.min(p.inv.ammo[a], KILL_AMMO[a]);
    if (n <= 0) return false;
    p.inv.ammo[a] -= n;
    p.inv.rev++;
    this.dropNear(p, ammoItem(a, n));
    return true;
  }

  dropNear(p, item) {
    const [pk] = this.spawnLoot([item], p.body.x, p.body.y, p.body.z, p.body.yaw, 1.6);
    // eigene fallengelassene Sachen nicht sofort wieder automatisch einsammeln
    if (pk) { pk.dropBy = p.id; pk.dropUntil = this.time + 4; }
  }

  // Admin-Cheats (Server prüft vorher, ob der Spieler Admin ist)
  humanCheat(id, o) {
    const p = this.byId.get(id);
    if (p) p.infAmmo = !!o.infAmmo;
  }

  // OP-Loot: goldene SCAR auf Platz 1, goldenes Scharfschützengewehr auf Platz 2, Rest leer
  humanOpLoot(id) {
    const p = this.byId.get(id);
    if (!p || !p.alive) return false;
    this.cancelUse(p);
    cancelReload(p.wr);
    p.inv.slots = [weaponItem('ar', 4), weaponItem('sniper', 4), null, null, null];
    p.inv.sel = 0;
    p.inv.ammo.medium = Math.max(p.inv.ammo.medium, AMMO_MAX.medium);
    p.inv.ammo.heavy = Math.max(p.inv.ammo.heavy, AMMO_MAX.heavy);
    p.inv.rev++;
    equipWeapon(p.wr, selectedItem(p.inv));
    return true;
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
        p.id, r2(p.body.x), r2(p.body.y), r2(p.body.z), r3(p.body.yaw), r3(p.pitch), p.alive ? this.netFlags(p) : F.DEAD,
        Math.ceil(p.health), Math.ceil(p.shield), Math.ceil(p.overshield), r2(p.body.vx), r2(p.body.vz),
        p.alive ? handCode(selectedItem(p.inv)) : 0,
      ]),
      z: [r2(z.x), r2(z.z), r2(z.r)],
    };
  }

  netFlags(p) {
    let f = p.flags & ~(F.KNOCKED | F.REVIVING);
    if (p.knocked) {
      f |= F.KNOCKED;
      if (this.players.some((o) => o.reviving === p.id)) f |= F.REVIVING;
    }
    return f;
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
      placement: p.placement === 1 || (p.alive && this.phase === 'ended') ? 1 : p.alive ? 0 : p.placement,
      team: p.team,
      survival: p.alive ? this.matchTime : p.deathT,
      killerId: p.killerId,
    };
  }

  // Bot-Aufstellung: fehlende Plätze mit Bots füllen (genau 20); Duo: Zweierteams bilden
  static fillWithBots(humans, rng, champion = null, mode = 'solo') {
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
    if (mode === 'duo') Simulation.assignTeams(players);
    return players;
  }

  // Duo: Party-Partner zusammen, sonst Einzelspieler miteinander, Rest mit Bots (Menschen stehen vorne)
  static assignTeams(players) {
    let team = 0;
    const done = new Set();
    const parties = new Map();
    for (const p of players) {
      if (p.isBot || !p.party) continue;
      if (!parties.has(p.party)) parties.set(p.party, []);
      parties.get(p.party).push(p);
    }
    for (const list of parties.values()) {
      for (let i = 0; i + 1 < list.length; i += 2) {
        list[i].team = list[i + 1].team = team++;
        done.add(list[i]);
        done.add(list[i + 1]);
      }
    }
    const rest = players.filter((p) => !done.has(p));
    for (let i = 0; i < rest.length; i += 2) {
      rest[i].team = team;
      if (rest[i + 1]) rest[i + 1].team = team;
      team++;
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
