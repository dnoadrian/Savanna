// Bot-KI: Zustandsmaschine mit Wahrnehmung, menschenähnlichem Zielen, Deckung, Looten (Truhen,
// bessere Waffen, Schilde), Waffenwahl nach Entfernung, Schild/Medikit benutzen und Sturmflucht.
import { BOT_FOV, BOT_VIEW_DIST, BOT_HEAR_DIST, F, EYE_STAND, EYE_CROUCH, INTERACT_RANGE, WALK_SPEED, SPRINT_MULT } from '../constants.js';
import { WEAPONS, CONSUMABLES } from '../items.js';
import { anglesFromDir } from './combat.js';
import { weaponScore } from './inventory.js';
import { PATH_MAX_EXPAND } from './nav.js';

const PATH_MIN_BUDGET = 1500;

const DEG = Math.PI / 180;
// Nahkampf-Nerf (abgeschwächt: Bots treffen auf kurze Distanz wieder ca. 25 % öfter als mit dem vollen Nerf)
const CLOSE_NERF_NEAR = 10; // m – volle Wirkung
const CLOSE_NERF_FAR = 22; // m – keine Wirkung mehr
const CLOSE_ERR = 0.45; // zusätzlicher Zielfehler
const CLOSE_TURN = 0.12; // langsameres Nachdrehen
const CLOSE_SPREAD = 0.45; // zusätzliche Streuung der Schüsse

export const DIFF = {
  easy: { react: [0.8, 1.25], aimErr: 7.5, turn: 150, hs: 0.04, strafe: 0.3, burst: [3, 5], pause: [0.55, 1.0], settle: 1.6, crouch: 0.08, jump: 0.04, slide: 0.05, lead: 0.2, recoilComp: 0.3 },
  normal: { react: [0.5, 0.85], aimErr: 4.6, turn: 230, hs: 0.12, strafe: 0.6, burst: [4, 8], pause: [0.32, 0.65], settle: 1.3, crouch: 0.18, jump: 0.08, slide: 0.12, lead: 0.55, recoilComp: 0.55 },
  hard: { react: [0.32, 0.55], aimErr: 3.0, turn: 330, hs: 0.22, strafe: 0.85, burst: [5, 10], pause: [0.2, 0.45], settle: 1.0, crouch: 0.28, jump: 0.13, slide: 0.22, lead: 0.8, recoilComp: 0.72 },
  pro: { react: [0.16, 0.3], aimErr: 1.4, turn: 450, hs: 0.34, strafe: 1.0, burst: [6, 12], pause: [0.14, 0.32], settle: 0.8, crouch: 0.34, jump: 0.18, slide: 0.32, lead: 0.95, recoilComp: 0.85 },
};

// maximale Kampfentfernung je Waffe
const ENGAGE = { pistol: 45, ar: 115, drum: 55, tac: 28, pump: 30, hammer: 28, sniper: 150 };
// Anfangsphase: erst looten, nur nahe Gegner oder Angreifer bekämpfen
const EARLY_LOOT = 45;
const EARLY_SIGHT = 12;
// Bots untereinander kämpfen erst auf kürzere Distanz (Runden dauern länger, Menschen bleiben im Fokus)
const BOT_VS_BOT_DIST = 45;

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Eignung einer Waffe für eine Entfernung
function suitability(item, dist, ammo) {
  if (!item || item.k !== 'w') return -1;
  const def = WEAPONS[item.w];
  if (item.mag <= 0 && ammo[def.ammo] <= 0) return -1;
  let s;
  switch (item.w) {
    case 'pump': s = dist < 12 ? 330 : dist < 20 ? 170 : 20; break;
    case 'hammer': s = dist < 12 ? 310 : dist < 19 ? 160 : 20; break;
    case 'tac': s = dist < 10 ? 290 : dist < 16 ? 130 : 20; break;
    case 'sniper': s = dist > 40 ? 320 : dist > 20 ? 120 : 15; break;
    case 'ar': s = dist < 8 ? 120 : 210; break;
    case 'drum': s = dist < 25 ? 235 : dist < 45 ? 150 : 60; break;
    default: s = dist < 30 ? 105 : 70;
  }
  s *= 1 + item.r * 0.08;
  if (item.mag === 0) s *= 0.55;
  return s;
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
    this.noEnemyT = 10;
    this.heardT = 0;
    this.heard = null;
    this.sprintPref = this.rng.chance(0.9); // fast alle Bots sprinten auf längeren Wegen
    this.jumpCd = 0;
    this.slideCd = 0;
    this.switchCd = 0;
    this.lootTarget = null;
    this.lootCd = this.rng.range(0, 1.5);
    this.useCd = 0;
    this.input = { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, crouchPressed: false, ads: false, using: false };
    this.actions = { fire: false, reload: false, select: -1, use: -1, interact: null, revive: null };
  }

  eye(p) {
    return p.body.y + ((p.flags & (F.CROUCH | F.SLIDE)) ? EYE_CROUCH : EYE_STAND);
  }

  get item() {
    return this.p.inv.slots[this.p.inv.sel];
  }

  // ---------------- Wahrnehmung ----------------
  perceive() {
    const sim = this.sim, me = this.p, b = me.body;
    const ey = this.eye(me);
    this.visible.length = 0;
    const cosHalf = Math.cos((BOT_FOV / 2) * DEG);
    const fx = -Math.sin(this.aimYaw), fz = -Math.cos(this.aimYaw);
    const early = sim.matchTime < EARLY_LOOT;
    for (const o of sim.players) {
      if (o === me || !o.alive || sim.isMate(me, o)) continue;
      const dx = o.body.x - b.x, dz = o.body.z - b.z;
      const d = Math.hypot(dx, dz);
      const recentlyHurtBy = me.lastDamagedBy === o.id && sim.time - me.lastDamageT < 2.5;
      // Anfangsphase: Bots looten und greifen sich gegenseitig nicht an – nur nahe Menschen
      // oder wer selbst angegriffen wird, wehrt sich
      const sight = early ? (o.isBot ? 0 : EARLY_SIGHT) : o.isBot ? BOT_VS_BOT_DIST : BOT_VIEW_DIST;
      if (d > (recentlyHurtBy ? BOT_VIEW_DIST : sight)) continue;
      if (d > 9 && !recentlyHurtBy) {
        const c = (dx * fx + dz * fz) / (d || 1);
        if (c < cosHalf) continue;
      }
      const chestY = o.body.y + ((o.flags & (F.CROUCH | F.SLIDE)) ? 0.75 : 1.2);
      let vis = sim.world.collision.lineOfSight(b.x, ey, b.z, o.body.x, chestY, o.body.z);
      if (!vis) vis = sim.world.collision.lineOfSight(b.x, ey, b.z, o.body.x, chestY + 0.45, o.body.z);
      if (vis) this.visible.push({ o, d });
    }
    let best = null;
    let bestScore = Infinity;
    for (const v of this.visible) {
      let score = v.d;
      if (this.target && v.o.id === this.target.id) score *= 0.5;
      if (me.lastDamagedBy === v.o.id && sim.time - me.lastDamageT < 3) score *= 0.4;
      score *= 0.55 + ((v.o.health + v.o.shield) / 200) * 0.45;
      if (v.o.knocked) score *= v.d < 12 ? 0.7 : 1.8; // Niedergeschlagene nur aus der Nähe erledigen
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
    if (!best) {
      for (const s of sim.recentShots) {
        if (s.id === me.id || s.t < sim.time - 0.6 || s.t <= this.heardT) continue;
        const d = Math.hypot(s.x - b.x, s.z - b.z);
        if (d < BOT_HEAR_DIST) {
          this.heard = { x: s.x, z: s.z, t: s.t };
          this.heardT = s.t;
        }
      }
      if (me.lastDamagedBy && me.lastDamagedBy !== 'storm' && sim.time - me.lastDamageT < 0.5) {
        const a = sim.byId.get(me.lastDamagedBy);
        if (a) this.heard = { x: a.body.x, z: a.body.z, t: sim.time };
      }
    }
  }

  // geladene Zweitwaffe (Platz oder -1); autoOnly: nur Automatikwaffen (Pump-Kombo)
  loadedAlt(dist, autoOnly = false) {
    const inv = this.p.inv;
    let best = -1, bestS = 60;
    for (let i = 0; i < 5; i++) {
      const it = inv.slots[i];
      if (i === inv.sel || !it || it.k !== 'w' || it.mag <= 0) continue;
      if (autoOnly && !WEAPONS[it.w].auto) continue;
      const s = suitability(it, dist, inv.ammo);
      if (s > bestS) { bestS = s; best = i; }
    }
    return best;
  }

  // Ausdauer mit Hysterese: erst ab 35 % wieder losrennen (Reserve für Kämpfe)
  canSprint(b) {
    return b.sprinting ? b.stamina > 0.05 : b.stamina > 0.35;
  }

  newError(mult = 1) {
    const e = this.d.aimErr * mult;
    this.errTargetYaw = (this.rng.next() * 2 - 1) * e;
    this.errTargetPitch = (this.rng.next() * 2 - 1) * e * 0.6;
    this.errT = this.rng.range(0.25, 0.6);
  }

  // ---------------- Inventar ----------------
  bestSlot(dist) {
    const inv = this.p.inv;
    let best = -1, bestS = 0;
    for (let i = 0; i < 5; i++) {
      const s = suitability(inv.slots[i], dist, inv.ammo);
      if (s > bestS) { bestS = s; best = i; }
    }
    return { slot: best, score: bestS };
  }

  consumableSlot(type) {
    const slots = this.p.inv.slots;
    for (let i = 0; i < 5; i++) if (slots[i] && slots[i].k === 'c' && slots[i].c === type) return i;
    return -1;
  }

  // Schild/Medikit, das jetzt sinnvoll wäre (Platz oder -1)
  wantedConsumable() {
    const me = this.p;
    if (me.shield < 50) { const s = this.consumableSlot('mini'); if (s >= 0) return s; }
    if (me.shield < 100) { const s = this.consumableSlot('big'); if (s >= 0) return s; }
    if (me.health < 75) { const s = this.consumableSlot('medkit'); if (s >= 0) return s; }
    return -1;
  }

  // Lohnt sich ein Gegenstand? swapSlot: Platz, der dafür getauscht würde (-1: freier Platz)
  wantsItem(item) {
    const inv = this.p.inv;
    const free = inv.slots.indexOf(null);
    if (item.k === 'a') {
      for (const s of inv.slots) if (s && s.k === 'w' && WEAPONS[s.w].ammo === item.a && inv.ammo[item.a] < 40) return { ok: true, swap: -1 };
      return { ok: false };
    }
    if (item.k === 'c') {
      for (const s of inv.slots) if (s && s.k === 'c' && s.c === item.c && s.n < CONSUMABLES[s.c].stack) return { ok: true, swap: -1 };
      return free >= 0 ? { ok: true, swap: -1 } : { ok: false };
    }
    // Waffe: gleiche Art mit gleicher/höherer Seltenheit → uninteressant
    let worst = -1, worstScore = Infinity, same = -1;
    for (let i = 0; i < 5; i++) {
      const s = inv.slots[i];
      if (s && s.k === 'w' && s.w === item.w) same = i;
      const sc = s ? (s.k === 'w' ? weaponScore(s) : 40) : -1;
      if (s && sc < worstScore) { worstScore = sc; worst = i; }
    }
    if (same >= 0) {
      return item.r > inv.slots[same].r ? { ok: true, swap: same } : { ok: false };
    }
    if (free >= 0) return { ok: true, swap: -1 };
    return weaponScore(item) > worstScore + 15 ? { ok: true, swap: worst } : { ok: false };
  }

  // unerreichbares Ziel eine Weile meiden (sonst läuft der Bot immer wieder gegen dieselbe Kante)
  avoidTarget(t) {
    (this.badTargets || (this.badTargets = new Map())).set(t.kind + t.id, this.sim.time + 45);
  }

  isAvoided(kind, id) {
    const until = this.badTargets && this.badTargets.get(kind + id);
    return until !== undefined && until > this.sim.time;
  }

  findLootTarget() {
    const sim = this.sim, b = this.p.body;
    let best = null, bestD = Infinity;
    const claims = sim.botClaims || (sim.botClaims = new Map());
    const reachable = (x, y, z) => !sim.nav || Math.abs(sim.nav.groundH(x, z) - y) < 1.3;
    for (const c of sim.loot.chests) {
      if (c.open || this.isAvoided('c', c.id) || !reachable(c.x, c.y, c.z)) continue;
      const owner = claims.get(c.id);
      if (owner && owner !== this.p.id && sim.byId.get(owner)?.alive) continue;
      const d = Math.hypot(c.x - b.x, c.z - b.z) + Math.abs(c.y - b.y) * 3;
      if (d < 55 && d < bestD) { bestD = d; best = { kind: 'c', id: c.id, x: c.x, y: c.y, z: c.z }; }
    }
    for (const pk of sim.loot.pickups.values()) {
      const d = Math.hypot(pk.x - b.x, pk.z - b.z) + Math.abs(pk.y - b.y) * 3;
      if (d > 32 || d * 1.3 > bestD || this.isAvoided('l', pk.id) || !reachable(pk.x, pk.y, pk.z)) continue;
      const w = this.wantsItem(pk.item);
      if (!w.ok) continue;
      bestD = d * 1.3;
      best = { kind: 'l', id: pk.id, x: pk.x, y: pk.y, z: pk.z, swap: w.swap };
    }
    if (best && best.kind === 'c') claims.set(best.id, this.p.id);
    return best;
  }

  lootTargetValid(t) {
    const sim = this.sim;
    if (t.kind === 'c') {
      const c = sim.loot.chest(t.id);
      return !!c && !c.open;
    }
    const pk = sim.loot.pickups.get(t.id);
    return !!pk && this.wantsItem(pk.item).ok;
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
    // Wegsuche mit Rechenbudget pro Takt (Suchen + untersuchte Zellen), sonst im nächsten Takt
    if (this.pathPending && this.sim.pathBudget > 0 && this.sim.expandBudget >= PATH_MIN_BUDGET) {
      this.sim.pathBudget--;
      this.pathPending = false;
      const nav = this.sim.nav;
      const res = nav ? nav.findPath(b.x, b.z, this.dest.x, this.dest.z, Math.min(PATH_MAX_EXPAND, this.sim.expandBudget)) : null;
      if (nav) this.sim.expandBudget -= nav.lastExpand;
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
        if (Math.hypot(tx - b.x, tz - b.z) < 1.2) {
          this.pathIdx++;
          if (this.pathIdx >= this.path.length) {
            if (!this.pathComplete) this.pathPending = true;
            else return false; // angekommen
          }
          if (this.pathIdx < this.path.length) [tx, tz] = this.path[this.pathIdx];
        }
      } else {
        tx = this.dest.x; tz = this.dest.z;
        if (Math.hypot(tx - b.x, tz - b.z) < 1.2) return false;
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
    if (!wantsMove || this.p.useT >= 0) { this.stuckCount = 0; return; }
    if (moved < 0.7) {
      this.stuckCount++;
      if (this.stuckCount === 1) {
        this.wantJump = true;
      } else if (this.stuckCount <= 3) {
        // Ausweichen zu einer freien Stelle in der Nähe (nicht in die nächste Wand)
        const a = this.rng.next() * Math.PI * 2;
        const r = 3 + this.rng.next() * 4;
        const free = this.sim.nav ? this.sim.nav.randomFree(this.rng, b.x, b.z, 6) : null;
        this.detour = free ? { x: free[0], z: free[1] } : { x: b.x + Math.cos(a) * r, z: b.z + Math.sin(a) * r };
        this.detourT = this.sim.time + 1.4;
        this.wantJump = this.rng.chance(0.5);
        this.pathPending = !!this.dest;
      } else {
        this.stuckCount = 0;
        this.dest = null;
        this.path = null;
        if (this.lootTarget) this.avoidTarget(this.lootTarget);
        this.lootTarget = null;
        this.lootCd = 4;
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
    input.mx = 0; input.mz = 0; input.jump = false; input.crouchPressed = false; input.ads = false; input.using = me.useT >= 0;
    input.sprint = false;
    act.fire = false; act.reload = false; act.select = -1; act.use = -1; act.interact = null; act.revive = null;
    this.wantJump = this.wantJump && this.jumpCd <= 0;
    this.jumpCd -= dt;
    this.slideCd -= dt;
    this.switchCd -= dt;
    this.lootCd -= dt;
    this.useCd -= dt;
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

    // Duo: am Boden zum Partner kriechen; Partner am Boden wiederbeleben
    if (sim.mode === 'duo') {
      const mate = sim.mates(me).find((m) => m.alive) || null;
      if (me.knocked) return this.updateKnocked(dt, mate);
      if (mate && mate.knocked && this.updateRevive(dt, mate)) {
        this.checkStuck(dt, !!this.dest);
        input.yaw = this.aimYaw;
        input.pitch = this.aimPitch;
        return input;
      }
      this.mate = mate;
    }

    const zone = sim.zone.state;
    const zoneOn = sim.zone.enabled;
    const outsideNow = zoneOn && sim.zone.isOutside(b.x, b.z);
    let outsideNext = false;
    if (zoneOn && zone.next) {
      const dn = Math.hypot(b.x - zone.next.x, b.z - zone.next.z);
      // rechtzeitig losgehen: benötigte Laufzeit bis in den nächsten Kreis + Puffer
      const need = Math.max(0, dn - zone.next.r * 0.85) / (WALK_SPEED * SPRINT_MULT * 0.8) + 10;
      outsideNext = dn > zone.next.r * 0.92 && (zone.shrinking || zone.timeLeft < Math.max(20, need) || zone.phase >= 3);
      if (zone.next.r < 1) outsideNext = dn > 5;
    }

    const tgt = this.target && this.target.alive ? this.target : null;
    if (!tgt) this.target = null;
    const seeTarget = tgt && this.visible.some((v) => v.o === tgt);
    const hasRecentContact = this.lastSeen && sim.time - this.lastSeen.t < 6 && tgt;
    const tDist = tgt ? Math.hypot(tgt.body.x - b.x, tgt.body.z - b.z) : 999;
    const ehp = me.health + me.shield + me.overshield;
    const useSlot = this.wantedConsumable();
    const lowHp = ehp < 70 && useSlot >= 0;

    // --- Zustand wählen ---
    if (me.useT >= 0) this.state = 'use';
    else if (seeTarget) {
      if (lowHp && this.state !== 'cover' && !outsideNow && tDist > 12) {
        this.state = 'cover';
        this.coverPos = sim.nav ? sim.nav.findCover(b.x, b.z, tgt.body.x, this.eye(tgt), tgt.body.z) : null;
        this.coverT = sim.time + 4;
        if (this.coverPos) this.setDest(this.coverPos[0], this.coverPos[1]);
      } else if (this.state !== 'cover' || sim.time > this.coverT) {
        this.state = 'combat';
      }
    } else if (useSlot >= 0 && this.noEnemyT > 1.6 && !outsideNow && this.useCd <= 0 && (me.health < 75 || me.shield < 100)) {
      this.state = 'use';
    } else if (outsideNow || outsideNext) {
      if (this.state !== 'storm') {
        this.state = 'storm';
        const nz = zone.next || zone;
        const pt = sim.nav ? sim.nav.randomFree(this.rng, nz.x, nz.z, Math.max(3, nz.r * 0.55)) : null;
        this.setDest(pt ? pt[0] : nz.x, pt ? pt[1] : nz.z);
      }
    } else if (hasRecentContact && this.lastSeen && this.noEnemyT < 6) {
      if (this.state !== 'chase') {
        this.state = 'chase';
        this.setDest(this.lastSeen.x, this.lastSeen.z);
      }
    } else if (this.heard && sim.time - this.heard.t < 4 && this.state !== 'investigate' && this.state !== 'loot') {
      this.state = 'investigate';
      this.investigateT = sim.time + 2.5;
      if (this.rng.chance(0.5)) this.setDest(this.heard.x + this.rng.range(-8, 8), this.heard.z + this.rng.range(-8, 8));
    } else if (this.state !== 'loot' && this.lootCd <= 0 && this.noEnemyT > 2) {
      const t = this.findLootTarget();
      this.lootCd = t ? 0 : 2.5;
      if (t) {
        this.lootTarget = { ...t, t0: sim.time };
        this.state = 'loot';
        this.setDest(t.x, t.z);
      } else if (this.state !== 'roam' && this.state !== 'investigate') {
        this.state = 'roam';
        this.dest = null;
      }
    } else if (this.state === 'combat' || this.state === 'cover' || (this.state === 'chase' && this.noEnemyT >= 6) || (this.state === 'use' && me.useT < 0)) {
      this.state = 'roam';
      this.dest = null;
    }

    // --- Waffe wählen ---
    const item = this.item;
    const engaged = this.state === 'combat' || this.state === 'cover';
    if (this.state !== 'use' && this.switchCd <= 0) {
      const pick = this.bestSlot(engaged ? tDist : 30);
      const cur = suitability(item, engaged ? tDist : 30, me.inv.ammo);
      if (pick.slot >= 0 && pick.slot !== me.inv.sel && (cur <= 0 || pick.score > cur * 1.35)) {
        act.select = pick.slot;
        this.switchCd = 0.8;
      }
    }
    // Nachladen: leer, oder außerhalb von Kämpfen unter halb voll. Im Kampf mit leerem Magazin
    // lieber auf eine geladene zweite Waffe wechseln (schneller als Nachladen)
    if (item && item.k === 'w' && !me.wr.reloading && me.useT < 0) {
      const def = WEAPONS[item.w];
      const alt = item.mag === 0 && seeTarget && act.select < 0 ? this.loadedAlt(tDist) : -1;
      if (alt >= 0) { act.select = alt; this.switchCd = 0.6; }
      else if (item.mag === 0 && me.inv.ammo[def.ammo] > 0) act.reload = true;
      else if (!seeTarget && item.mag < def.mag * 0.5 && me.inv.ammo[def.ammo] > 0) act.reload = true;
    }

    let wantsMove = false;
    let desiredYaw = this.aimYaw;
    let desiredPitch = 0;
    let aimAtTarget = false;
    const hw = item && item.k === 'w' ? item.w : 'pistol';
    const shotgun = WEAPONS[hw].pellets > 1;

    switch (this.state) {
      case 'combat': {
        aimAtTarget = true;
        const dist = tDist;
        this.strafeT -= dt;
        if (this.strafeT <= 0) {
          this.strafeT = this.rng.range(0.45, 1.3);
          if (this.rng.chance(0.55 + d.strafe * 0.3)) this.strafeDir = -this.strafeDir;
          // auf Distanz öfter ducken (ruhiger zielen), im Nahkampf kaum
          const cc = dist > 30 ? d.crouch * 2.2 : dist < 10 ? d.crouch * 0.4 : d.crouch;
          this.crouchT = this.rng.chance(Math.min(0.8, cc)) ? this.rng.range(0.6, 1.6) : 0;
          if (this.rng.chance(d.jump) && this.jumpCd <= 0) { this.wantJump = true; this.jumpCd = 1.2; }
        }
        // Wunschabstand je Waffe
        const want = shotgun ? 5 : hw === 'sniper' ? 45 : hw === 'drum' ? 14 : 22;
        let fwd = 0;
        if (dist > want * 2.2) fwd = 1;
        else if (dist > want * 1.3) fwd = 0.6;
        else if (dist < want * 0.5) fwd = -0.7;
        let side = this.strafeDir * d.strafe;
        if (this.crouchT > 0) { this.crouchT -= dt; side *= 0.2; input.crouch = true; }
        else input.crouch = false;
        if (outsideNow) {
          this.moveToward(input, zone.x, zone.z);
          wantsMove = true;
        } else if (dist > ENGAGE[hw] * 0.9) {
          if (!this.dest || Math.hypot(this.dest.x - tgt.body.x, this.dest.z - tgt.body.z) > 15) this.setDest(tgt.body.x, tgt.body.z);
          wantsMove = this.followPath(input);
          if (dist > 35 && !input.crouch) input.sprint = true;
        } else {
          input.mz = fwd;
          input.mx = side;
          wantsMove = Math.abs(fwd) + Math.abs(side) > 0.1;
          // mit Schrotflinte in den Gegner hineinsliden, sonst gelegentlich zum Ausweichen
          const slideRate = shotgun && dist > 7 && dist < 18 ? d.slide * 4 : d.slide;
          if (fwd > 0.4 && this.rng.chance(slideRate * dt) && this.slideCd <= 0) {
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
        input.ads = (hw === 'sniper' || dist > 20) && !input.sprint && !outsideNow && !shotgun;
        // Schilde/Medikits wirken sofort: im Kampf nachschilden, sobald es nötig ist
        // (bevorzugt beim Nachladen oder wenn der Gegner kurz nicht sichtbar ist)
        if (useSlot >= 0 && this.useCd <= 0 && me.useT < 0 && (me.shield < 50 || me.health < 60) &&
            (!seeTarget || me.wr.reloading || this.rng.chance(dt * 2.5))) {
          act.use = useSlot;
          this.useCd = 0.9;
        }
        // Pump-Kombo: nach dem Schrotschuss auf eine geladene Automatik wechseln
        if (shotgun && me.wr.sinceShot < 0.05 && dist < 16 && this.switchCd <= 0 && act.select < 0) {
          const alt = this.loadedAlt(dist, true);
          if (alt >= 0 && this.rng.chance(0.35 + d.strafe * 0.3)) { act.select = alt; this.switchCd = 0.9; }
        }
        if (me.wr.reloading && dist < 40 && !this.coverPos && sim.nav && this.rng.chance(0.02)) {
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
          input.crouch = true;
          if (item && item.k === 'w' && item.mag < WEAPONS[item.w].mag && !me.wr.reloading) act.reload = true;
          if (useSlot >= 0 && me.useT < 0) act.use = useSlot;
          if (sim.time > this.coverT) { this.state = 'combat'; this.coverPos = null; }
        }
        if (me.useT < 0 && !lowHp && sim.time > this.coverT - 2) { this.state = 'combat'; this.coverPos = null; }
        break;
      }
      case 'use': {
        input.crouch = true;
        if (me.useT < 0) {
          if (useSlot >= 0 && this.useCd <= 0) {
            act.use = useSlot;
            this.useCd = 0.5;
          } else this.state = 'roam';
        }
        desiredYaw = this.lookYaw;
        break;
      }
      case 'loot': {
        const t = this.lootTarget;
        if (!t || !this.lootTargetValid(t) || sim.time - t.t0 > 14) {
          if (t && sim.time - t.t0 > 14) this.avoidTarget(t);
          this.lootTarget = null;
          this.state = 'roam';
          this.dest = null;
          this.lootCd = 0.3;
          break;
        }
        const dd = Math.hypot(t.x - b.x, t.z - b.z);
        if (dd < INTERACT_RANGE - 0.7 && Math.abs(t.y - b.y) < 2) {
          if (t.kind === 'l' && t.swap >= 0 && me.inv.sel !== t.swap) act.select = t.swap;
          act.interact = t.kind === 'c' ? { c: t.id } : { l: t.id };
          this.lootTarget = null;
          this.state = 'roam';
          this.dest = null;
          this.lootCd = 0.4;
          desiredYaw = Math.atan2(-(t.x - b.x), -(t.z - b.z));
        } else {
          input.sprint = dd > 8 && this.canSprint(b);
          wantsMove = this.followPath(input);
          this.maybeSlide(input, b, d, dt);
          if (!wantsMove) this.moveToward(input, t.x, t.z, 0.6);
        }
        break;
      }
      case 'storm': {
        input.sprint = true;
        wantsMove = this.followPath(input);
        this.maybeSlide(input, b, d, dt);
        if (!wantsMove) this.state = 'roam';
        break;
      }
      case 'chase': {
        input.sprint = this.lastSeen && Math.hypot(this.lastSeen.x - b.x, this.lastSeen.z - b.z) > 20;
        wantsMove = this.followPath(input);
        if (!wantsMove) { this.state = 'roam'; this.dest = null; this.target = null; }
        if (this.lastSeen) desiredYaw = Math.atan2(-(this.lastSeen.x - b.x), -(this.lastSeen.z - b.z));
        break;
      }
      case 'investigate': {
        if (this.heard) desiredYaw = Math.atan2(-(this.heard.x - b.x), -(this.heard.z - b.z));
        if (this.dest) wantsMove = this.followPath(input);
        // anschleichen: in der Nähe des Geräuschs geduckt und leise, weit weg sprinten
        const hd = this.heard ? Math.hypot(this.heard.x - b.x, this.heard.z - b.z) : 99;
        if (hd < 28) { input.crouch = true; input.sprint = false; }
        else input.sprint = hd > 40;
        if (sim.time > this.investigateT && !wantsMove) { this.state = 'roam'; this.heard = null; }
        break;
      }
      default: {
        if (!this.dest) {
          this.idleT -= dt;
          if (this.idleT <= 0) this.pickRoamDest();
          else {
            this.lookYaw += Math.sin(sim.time * 0.8 + me.id.length) * dt * 0.8;
            desiredYaw = this.lookYaw;
          }
        } else {
          const far = Math.hypot(this.dest.x - b.x, this.dest.z - b.z) > 25;
          input.sprint = far && this.sprintPref && this.canSprint(b);
          wantsMove = this.followPath(input);
          this.maybeSlide(input, b, d, dt);
          if (!wantsMove) {
            this.dest = null;
            this.idleT = this.rng.range(0.4, 1.8);
            this.lookYaw = this.aimYaw;
          }
          if (sim.time - this.destT > 40) this.dest = null;
        }
      }
    }

    // Blickrichtung
    if (aimAtTarget && tgt) {
      const ey = this.eye(me);
      const low = (tgt.flags & (F.CROUCH | F.SLIDE));
      const head = this.aimHead && !shotgun;
      const aimY = tgt.body.y + (head ? (low ? 1.05 : 1.58) : (low ? 0.78 : 1.18));
      const lead = d.lead * 0.08;
      const tx = tgt.body.x + tgt.body.vx * lead, tz = tgt.body.z + tgt.body.vz * lead;
      const dx = tx - b.x, dy = aimY - ey, dz = tz - b.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      const ang = anglesFromDir(dx / l, dy / l, dz / l);
      desiredYaw = ang.yaw;
      desiredPitch = ang.pitch;
      this.trackT += dt;
      this.errT -= dt;
      // Nahkampf-Nerf: auf kurze Distanz streuen Bots deutlich mehr und drehen langsamer nach
      const close = Math.max(0, Math.min(1, (CLOSE_NERF_FAR - tDist) / (CLOSE_NERF_FAR - CLOSE_NERF_NEAR)));
      if (this.errT <= 0) this.newError((0.35 + 0.65 * Math.exp(-this.trackT / d.settle)) * (1 + CLOSE_ERR * close));
      this.errYaw += (this.errTargetYaw - this.errYaw) * Math.min(1, dt * 3);
      this.errPitch += (this.errTargetPitch - this.errPitch) * Math.min(1, dt * 3);
      desiredYaw += this.errYaw * DEG;
      desiredPitch += this.errPitch * DEG;
    } else if (wantsMove && this.moveYaw !== undefined) {
      desiredYaw = this.moveYaw;
      desiredPitch = 0;
    }
    this.recoilPitch *= Math.max(0, 1 - dt * (3 + d.recoilComp * 6));

    const closeK = aimAtTarget ? Math.max(0, Math.min(1, (CLOSE_NERF_FAR - tDist) / (CLOSE_NERF_FAR - CLOSE_NERF_NEAR))) : 0;
    const maxTurn = d.turn * DEG * dt * (aimAtTarget ? 1 - CLOSE_TURN * closeK : 0.8);
    this.spreadMul = 1 + CLOSE_SPREAD * closeK;
    const dyaw = angDiff(desiredYaw, this.aimYaw);
    const stepYaw = Math.max(-maxTurn, Math.min(maxTurn, dyaw * Math.min(1, dt * 9)));
    this.aimYaw += stepYaw;
    const dp = desiredPitch - this.aimPitch;
    this.aimPitch += Math.max(-maxTurn, Math.min(maxTurn, dp * Math.min(1, dt * 9)));

    if (!aimAtTarget && wantsMove && this.state !== 'combat') {
      const adiff = angDiff(this.moveYaw ?? this.aimYaw, this.aimYaw);
      input.mz = Math.cos(adiff);
      input.mx = -Math.sin(adiff);
    }

    // Schießen
    if (aimAtTarget && tgt && seeTarget && item && item.k === 'w' && me.useT < 0) {
      if (this.reactT > 0) this.reactT -= dt;
      else {
        const dist = tDist;
        const def = WEAPONS[item.w];
        const tol = Math.max(1.2, Math.atan2(0.55, dist) / DEG * 1.6 + 0.6) * (def.pellets > 1 ? 1.6 : 1);
        const offYaw = Math.abs(angDiff(desiredYaw, this.aimYaw)) / DEG;
        this.burstPauseT -= dt;
        if (this.burstLeft <= 0 && this.burstPauseT <= 0) {
          if (def.auto) {
            this.burstLeft = dist > 70 ? 1 + Math.floor(this.rng.next() * 2) : this.rng.int(d.burst[0], d.burst[1]);
            this.burstPauseT = this.rng.range(d.pause[0], d.pause[1]) * (dist > 70 ? 1.8 : 1);
          } else {
            this.burstLeft = 1;
            this.burstPauseT = this.rng.range(0.05, 0.25) + (item.w === 'pistol' ? 0.12 : 0);
          }
        }
        const steady = item.w !== 'sniper' || this.trackT > d.settle * 0.7;
        if (this.burstLeft > 0 && offYaw < tol && dist < ENGAGE[item.w] && !input.sprint && steady && item.mag > 0) act.fire = true;
      }
    } else {
      this.burstLeft = 0;
    }

    if (this.wantJump && b.grounded) { input.jump = true; this.wantJump = false; this.jumpCd = 0.8; }
    if (input.using || act.use >= 0) input.sprint = false;

    this.checkStuck(dt, wantsMove);
    input.yaw = this.aimYaw;
    input.pitch = this.aimPitch + this.recoilPitch;
    return input;
  }

  // am Boden: zum Partner kriechen (oder weg vom Gegner), nicht schießen
  updateKnocked(dt, mate) {
    const b = this.p.body, input = this.input;
    this.state = 'knocked';
    let tx = null, tz = null;
    if (mate && !mate.knocked) { tx = mate.body.x; tz = mate.body.z; }
    else if (this.target && this.target.alive) { tx = b.x - (this.target.body.x - b.x); tz = b.z - (this.target.body.z - b.z); }
    if (tx !== null && Math.hypot(tx - b.x, tz - b.z) > 1.8) {
      if (!this.dest || Math.hypot(this.dest.x - tx, this.dest.z - tz) > 6) this.setDest(tx, tz);
      const moving = this.followPath(input);
      if (!moving) this.moveToward(input, tx, tz, 1);
      const adiff = angDiff(this.moveYaw ?? this.aimYaw, this.aimYaw);
      this.aimYaw += Math.max(-3 * dt, Math.min(3 * dt, adiff));
      input.mz = Math.cos(adiff);
      input.mx = -Math.sin(adiff);
    }
    input.yaw = this.aimYaw;
    input.pitch = 0;
    return input;
  }

  // Partner liegt am Boden: hinlaufen und wiederbeleben (außer ein Gegner ist ganz nah)
  // true = Bot kümmert sich gerade darum (restliche Logik überspringen)
  updateRevive(dt, mate) {
    const sim = this.sim, me = this.p, b = me.body, input = this.input;
    const d = Math.hypot(mate.body.x - b.x, mate.body.z - b.z);
    const threat = this.visible.find((v) => !v.o.knocked && v.d < (me.reviving ? 12 : 22));
    if (threat || d > 90) {
      if (me.reviving) this.actions.revive = null;
      return false;
    }
    this.state = 'revive';
    this.target = null;
    if (d <= 2.0) {
      this.actions.revive = mate.id;
      input.crouch = true;
      const want = Math.atan2(-(mate.body.x - b.x), -(mate.body.z - b.z));
      this.aimYaw += Math.max(-4 * dt, Math.min(4 * dt, angDiff(want, this.aimYaw)));
      this.dest = null;
      return true;
    }
    if (!this.dest || Math.hypot(this.dest.x - mate.body.x, this.dest.z - mate.body.z) > 2.5) this.setDest(mate.body.x, mate.body.z);
    input.sprint = d > 6 && this.canSprint(b);
    const moving = this.followPath(input);
    if (!moving) this.moveToward(input, mate.body.x, mate.body.z, 1);
    const adiff = angDiff(this.moveYaw ?? this.aimYaw, this.aimYaw);
    this.aimYaw += Math.max(-6 * dt, Math.min(6 * dt, adiff));
    input.mz = Math.cos(angDiff(this.moveYaw ?? this.aimYaw, this.aimYaw));
    input.mx = -Math.sin(angDiff(this.moveYaw ?? this.aimYaw, this.aimYaw));
    return true;
  }

  // Slide nur, wenn es passt: beim Sprinten bergab (schneller und weiter) oder selten zwischendurch
  maybeSlide(input, b, d, dt) {
    if (!input.sprint || !b.sprinting || !b.grounded || this.slideCd > 0 || b.stance !== 'stand') return;
    const sp = Math.hypot(b.vx, b.vz);
    if (sp < 6) return;
    const t = this.sim.world.terrain;
    const ax = b.x + (b.vx / sp) * 3, az = b.z + (b.vz / sp) * 3;
    const downhill = t.heightAt(ax, az) < t.heightAt(b.x, b.z) - 0.35;
    if ((downhill && this.rng.chance(0.6)) || this.rng.chance(d.slide * 0.2 * dt)) {
      input.crouchPressed = true;
      this.slideCd = downhill ? 2.5 : 6;
    }
  }

  onShotFired(item) {
    this.burstLeft--;
    this.recoilPitch += WEAPONS[item.w].recoil.up * DEG * (1 - this.d.recoilComp * 0.8);
  }

  pickRoamDest() {
    const sim = this.sim, b = this.p.body;
    const z = sim.zone.state;
    const safe = sim.zone.enabled && z.next ? z.next : { x: 0, z: 0, r: 80 };
    let x, zz;
    // Duo: in der Nähe des Partners bleiben
    const mate = this.mate;
    if (mate && mate.alive && !mate.knocked && Math.hypot(mate.body.x - b.x, mate.body.z - b.z) > 22) {
      x = mate.body.x + this.rng.range(-8, 8);
      zz = mate.body.z + this.rng.range(-8, 8);
    }
    // Orte in der Nähe bevorzugen und solche meiden, zu denen schon andere Bots laufen –
    // so verteilen sich die Bots über die ganze Karte statt alle zur Mitte zu rennen
    if (x === undefined && this.rng.chance(0.4)) {
      let total = 0;
      const opts = [];
      for (const p of sim.world.pois) {
        if (Math.hypot(p.x - safe.x, p.z - safe.z) > safe.r * 0.9 + 10) continue;
        let crowd = 0;
        for (const o of sim.players) {
          if (o === this.p || !o.alive || !o.isBot || !o.brain.dest) continue;
          if (Math.hypot(o.brain.dest.x - p.x, o.brain.dest.z - p.z) < p.r + 10) crowd++;
        }
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        const w = 1 / (1 + (d / 55) ** 2) / (1 + crowd * crowd);
        opts.push([p, w]);
        total += w;
      }
      let pick = this.rng.next() * total;
      for (const [p, w] of opts) {
        pick -= w;
        if (pick > 0) continue;
        x = p.x + this.rng.range(-p.r * 0.5, p.r * 0.5);
        zz = p.z + this.rng.range(-p.r * 0.5, p.r * 0.5);
        break;
      }
    }
    if (x === undefined) {
      const a = this.rng.next() * Math.PI * 2;
      const r = this.rng.range(15, 55);
      x = b.x + Math.cos(a) * r;
      zz = b.z + Math.sin(a) * r;
      if (Math.hypot(x - safe.x, zz - safe.z) > safe.r * 0.9) {
        x = safe.x + (x - safe.x) * 0.3;
        zz = safe.z + (zz - safe.z) * 0.3;
      }
    }
    if (sim.nav) {
      const pt = sim.nav.randomFree(this.rng, x, zz, 10);
      if (pt) { x = pt[0]; zz = pt[1]; }
    }
    this.setDest(x, zz);
  }
}

