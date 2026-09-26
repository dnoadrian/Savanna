// Match-Sitzungen mit gleicher Schnittstelle:
//  - LocalSession: Bot-Lobby ohne Server, gemeinsame Simulation läuft im Browser (pausierbar)
//  - NetSession: Mehrspieler, Server ist autoritativ; Interpolation mit 100 ms Puffer
import { SIM_DT, INTERP_DELAY, F, MAX_HEALTH, START_OVERSHIELD } from '../../shared/constants.js';
import { decodeItem } from '../../shared/items.js';
import { Zone } from '../../shared/sim/zone.js';
import { Loot } from '../../shared/sim/loot.js';
import { createInventory } from '../../shared/sim/inventory.js';
import { handCode } from '../../shared/sim/simulation.js';

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function newState(id) {
  return { id, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, health: MAX_HEALTH, shield: 0, overshield: START_OVERSHIELD, alive: true, vx: 0, vz: 0, hand: 1 };
}

export class LocalSession {
  constructor(sim, youId) {
    this.isLocal = true;
    this.sim = sim;
    this.youId = youId;
    this.players = sim.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, outfit: p.outfit, color: p.color, crownStyle: p.crownStyle, streak: p.streak }));
    const me = sim.byId.get(youId);
    this.me = me;
    this.spawn = { x: me.body.x, y: me.body.y, z: me.body.z, yaw: me.body.yaw };
    this.paused = false;
    this.acc = 0;
    this.events = [];
    this.prev = new Map();
    this.ping = 0;
    this.zoneObj = sim.zone;
    this.loot = sim.loot;
    this.stateList = sim.players.map((p) => newState(p.id));
    this.capturePrev();
  }

  capturePrev() {
    for (const p of this.sim.players) {
      let o = this.prev.get(p.id);
      if (!o) this.prev.set(p.id, (o = {}));
      o.x = p.body.x; o.y = p.body.y; o.z = p.body.z; o.yaw = p.body.yaw;
    }
  }

  update(dt) {
    if (this.paused) return;
    this.acc += Math.min(dt, 0.25);
    let steps = 0;
    while (this.acc >= SIM_DT && steps < 8) {
      this.capturePrev();
      this.sim.step(SIM_DT);
      for (const e of this.sim.drainEvents()) this.events.push(e);
      this.acc -= SIM_DT;
      steps++;
    }
    if (steps >= 8) this.acc = 0;
  }

  states() {
    const a = Math.min(1, this.acc / SIM_DT);
    const list = this.stateList;
    this.sim.players.forEach((p, i) => {
      const s = list[i];
      const pr = this.prev.get(p.id);
      const b = p.body;
      if (p.id === this.youId || !pr) {
        s.x = b.x; s.y = b.y; s.z = b.z; s.yaw = b.yaw;
      } else {
        s.x = pr.x + (b.x - pr.x) * a;
        s.y = pr.y + (b.y - pr.y) * a;
        s.z = pr.z + (b.z - pr.z) * a;
        s.yaw = lerpAngle(pr.yaw, b.yaw, a);
      }
      s.pitch = p.pitch;
      s.flags = p.alive ? p.flags : F.DEAD;
      s.health = p.health;
      s.shield = p.shield;
      s.overshield = p.overshield;
      s.alive = p.alive;
      s.vx = b.vx;
      s.vz = b.vz;
      s.hand = p.alive ? handCode(p.inv.slots[p.inv.sel]) : 0;
    });
    return list;
  }

  self() {
    const p = this.me;
    return {
      health: p.health, shield: p.shield, overshield: p.overshield, alive: p.alive, kills: p.kills, damage: Math.round(p.damage),
      headshots: p.headshots, useT: p.useT, placement: p.placement,
    };
  }

  // autoritatives Inventar (nicht verändern – der Controller arbeitet mit einer Kopie)
  inventory() {
    return this.me.inv;
  }

  scores() {
    return this.sim.players.map((p) => ({ id: p.id, kills: p.kills, damage: Math.round(p.damage), alive: p.alive, placement: p.placement, ping: 0 }));
  }

  get phase() { return this.sim.phase; }
  get countdown() { return this.sim.countdown; }
  get matchTime() { return this.sim.matchTime; }
  get winnerId() { return this.sim.winnerId; }

  zone() {
    return this.sim.zone.state;
  }

  sendState(st) { this.sim.setHumanState(this.youId, st); }
  fire(shot) { this.sim.humanFire(this.youId, { ...shot, rewind: 0 }); }
  reload() { this.sim.humanReload(this.youId); }
  cancelReload() { this.sim.humanCancelReload(this.youId); }
  select(slot) { this.sim.humanSelect(this.youId, slot); }
  interact(target) { this.sim.humanInteract(this.youId, target); }
  use(slot) { this.sim.humanUse(this.youId, slot); }
  cancelUse() { this.sim.humanCancelUse(this.youId); }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  setPaused(v) {
    this.paused = v;
  }

  leave() {
    this.sim.removePlayer(this.youId);
  }

  results() {
    return this.sim.players.map((p) => this.sim.stats(p));
  }

  // Rest der Runde im Hintergrund zu Ende simulieren (für den Kronen-Sieger)
  finishInBackground(onDone) {
    const sim = this.sim;
    const tick = () => {
      const t0 = performance.now();
      while (sim.phase !== 'ended' && performance.now() - t0 < 8 && sim.matchTime < 1200) {
        sim.step(SIM_DT);
        sim.drainEvents();
      }
      if (sim.phase === 'ended' || sim.matchTime >= 1200) {
        if (sim.phase !== 'ended') sim.finish();
        onDone(sim);
      } else setTimeout(tick, 0);
    };
    tick();
  }

  dispose() {}
}

export class NetSession {
  constructor(net, start, map) {
    this.isLocal = false;
    this.net = net;
    this.matchId = start.matchId;
    this.youId = start.you;
    this.players = start.players;
    const me = start.spawns[this.youId];
    this.spawn = { x: me[0], y: me[1], z: me[2], yaw: me[3] };
    this.zoneObj = new Zone(start.seed, map.terrain, true);
    // Startbeute ist deterministisch aus Seed + Karte; danach kommen Änderungen als Ereignisse
    this.loot = new Loot(map, start.seed);
    this.inv = createInventory();
    this.useT = -1;
    this.useRecv = 0;
    this.snaps = [];
    this.events = [];
    this.offset = null;
    this.latest = null;
    this.kills = 0;
    this.damage = 0;
    this.headshots = 0;
    this.ended = false;
    this.final = null;
    this.winner = null;
    this.stateList = this.players.map((p) => newState(p.id));
    this.scoreMap = new Map(this.players.map((p) => [p.id, { id: p.id, kills: 0, damage: 0, alive: true, placement: 0, ping: 0 }]));
    this.unsub = net.on((msg) => this.onMsg(msg));
  }

  get ping() { return this.net.ping; }

  onMsg(m) {
    if (m.mid && m.mid !== this.matchId) return;
    if (m.t === 'snap') {
      const now = performance.now() / 1000;
      const off = m.s.t - now;
      if (this.offset === null) this.offset = off;
      else if (off > this.offset) this.offset += (off - this.offset) * 0.05;
      else this.offset = off; // späte Pakete: sofort anpassen (untere Hülle)
      const map = new Map();
      for (const r of m.s.p) map.set(r[0], r);
      const snap = { t: m.s.t, mt: m.s.mt, ph: m.s.ph, cd: m.s.cd, p: map, recv: now };
      this.snaps.push(snap);
      if (this.snaps.length > 40) this.snaps.shift();
      this.latest = snap;
      if (m.me) {
        this.useT = m.me.u;
        this.useRecv = now;
        if (m.me.inv) {
          const i = m.me.inv;
          this.inv = { slots: i.s.map((e) => (e ? decodeItem(e) : null)), sel: i.sel, ammo: { ...i.a }, rev: i.rev };
        }
      }
      if (m.sc) for (const [id, k, d, pg] of m.sc) {
        const s = this.scoreMap.get(id);
        if (s) { s.kills = k; s.damage = d; s.ping = pg; }
      }
    } else if (m.t === 'ev') {
      for (const e of m.e) {
        this.applyLootEvent(e);
        this.events.push(e);
        if (e.t === 'hit' && e.a === this.youId) { this.damage += e.d; if (e.p === 'h') this.headshots++; }
        if (e.t === 'kill') {
          const s = this.scoreMap.get(e.v);
          if (s) { s.alive = false; s.placement = e.place; }
          if (e.k === this.youId) this.kills++;
        }
        if (e.t === 'win') this.winner = e.id;
      }
    } else if (m.t === 'matchEnd') {
      this.ended = true;
      this.final = m.results;
      this.winner = m.winner;
    }
  }

  // Beute-Zustand aus Ereignissen nachführen
  applyLootEvent(e) {
    const L = this.loot;
    if (e.t === 'loot') {
      for (const [id, enc, x, y, z] of e.a) L.pickups.set(id, { id, item: decodeItem(enc), x, y, z });
    } else if (e.t === 'unloot') L.pickups.delete(e.id);
    else if (e.t === 'lootn') {
      const pk = L.pickups.get(e.id);
      if (pk) pk.item = decodeItem(e.it);
    } else if (e.t === 'chest') {
      const c = L.chest(e.id);
      if (c) c.open = true;
    }
  }

  update() {}

  renderTime() {
    return performance.now() / 1000 + (this.offset ?? 0) - INTERP_DELAY;
  }

  states() {
    const rt = this.renderTime();
    const snaps = this.snaps;
    let a = null, b = null;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].t <= rt) {
        a = snaps[i];
        b = snaps[i + 1] || null;
        break;
      }
    }
    if (!a) a = snaps[0];
    const k = a && b ? Math.min(1, (rt - a.t) / Math.max(0.001, b.t - a.t)) : 0;
    const list = this.stateList;
    this.players.forEach((p, i) => {
      const s = list[i];
      if (!a) return;
      const ra = a.p.get(p.id);
      if (!ra) return;
      const rb = b ? b.p.get(p.id) : null;
      if (rb) {
        s.x = ra[1] + (rb[1] - ra[1]) * k;
        s.y = ra[2] + (rb[2] - ra[2]) * k;
        s.z = ra[3] + (rb[3] - ra[3]) * k;
        s.yaw = lerpAngle(ra[4], rb[4], k);
        s.pitch = ra[5] + (rb[5] - ra[5]) * k;
      } else {
        s.x = ra[1]; s.y = ra[2]; s.z = ra[3]; s.yaw = ra[4]; s.pitch = ra[5];
      }
      const latest = this.latest.p.get(p.id) || ra;
      s.flags = (rb || ra)[6];
      s.health = latest[7];
      s.shield = latest[8];
      s.overshield = latest[9];
      s.alive = !(latest[6] & F.DEAD);
      if (!s.alive) s.flags |= F.DEAD;
      s.vx = (rb || ra)[10];
      s.vz = (rb || ra)[11];
      s.hand = latest[12];
    });
    return list;
  }

  self() {
    const r = this.latest ? this.latest.p.get(this.youId) : null;
    const alive = r ? !(r[6] & F.DEAD) : true;
    const useT = this.useT >= 0 ? this.useT + (performance.now() / 1000 - this.useRecv) : -1;
    return {
      health: r ? r[7] : MAX_HEALTH, shield: r ? r[8] : 0, overshield: r ? r[9] : START_OVERSHIELD, alive,
      kills: this.kills, damage: Math.round(this.damage), headshots: this.headshots, useT,
    };
  }

  inventory() {
    return this.inv;
  }

  scores() {
    return [...this.scoreMap.values()];
  }

  get phase() { return this.ended ? 'ended' : this.latest ? this.latest.ph : 'countdown'; }
  get countdown() {
    if (!this.latest) return 3.6;
    return this.latest.cd - (performance.now() / 1000 - this.latest.recv);
  }
  get matchTime() {
    if (!this.latest) return 0;
    const dtl = this.latest.ph === 'playing' ? performance.now() / 1000 - this.latest.recv : 0;
    return this.latest.mt + dtl;
  }
  get winnerId() { return this.winner; }

  zone() {
    return this.zoneObj.update(this.matchTime);
  }

  sendState(st) {
    this.net.send({ t: 'st', x: +st.x.toFixed(3), y: +st.y.toFixed(3), z: +st.z.toFixed(3), yaw: +st.yaw.toFixed(4), pitch: +st.pitch.toFixed(4), flags: st.flags, vx: +st.vx.toFixed(2), vz: +st.vz.toFixed(2) });
  }

  fire(shot) {
    const rewind = INTERP_DELAY + (this.net.ping || 0) / 2000;
    const r4 = (v) => Math.round(v * 10000) / 10000;
    this.net.send({ t: 'fire', s: shot.s, o: [r4(shot.ox), r4(shot.oy), r4(shot.oz)], d: shot.dirs.map((d) => [r4(d.x), r4(d.y), r4(d.z)]), rw: +rewind.toFixed(3) });
  }

  reload() { this.net.send({ t: 'reload' }); }
  cancelReload() { this.net.send({ t: 'reloadCancel' }); }
  select(slot) { this.net.send({ t: 'sel', s: slot }); }
  interact(target) { this.net.send({ t: 'int', ...target }); }
  use(slot) { this.net.send({ t: 'use', s: slot }); }
  cancelUse() { this.net.send({ t: 'useCancel' }); }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  setPaused() {}

  leave() {
    this.net.send({ t: 'leaveMatch' });
  }

  results() {
    return this.final;
  }

  dispose() {
    this.unsub && this.unsub();
  }
}
