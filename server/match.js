// Server-autoritatives Match: gemeinsame Simulation mit 30 Hz, Snapshots mit 20 Hz,
// Ereignisse sofort, Lag-Kompensation beim Treffertest.
import { Simulation } from '../shared/sim/simulation.js';
import { encodeItem } from '../shared/items.js';
import { RNG } from '../shared/rng.js';
import { SIM_DT, SIM_HZ, SNAPSHOT_HZ, MATCH_SIZE, MAX_REWIND } from '../shared/constants.js';

let nextMatch = 1;


// Extra-Simulationsschritte pro Tick, wenn keine Menschen mehr im Match sind (SHOWDOWN_FAST_STEPS)
const FAST_STEPS = Math.max(0, Math.min(20, Number(process.env.SHOWDOWN_FAST_STEPS ?? 2)));
export class ServerMatch {
  constructor(gs, clients) {
    this.gs = gs;
    this.id = 'm' + nextMatch++ + '_' + Date.now().toString(36);
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    const rng = new RNG(this.seed ^ 0xabc);
    const humans = clients.slice(0, MATCH_SIZE).map((c) => ({ ...gs.publicProfile(c.pid), isBot: false }));
    const champ = gs.store.data.champion;
    // freie Plätze bis 12 mit Bots auffüllen
    const players = Simulation.fillWithBots(humans, rng, champ ? { ...champ, crownStyle: 'gold' } : null);
    this.sim = new Simulation(gs.world, { seed: this.seed, players });
    this.clients = new Map(clients.map((c) => [c.pid, c]));
    this.loaded = new Set();
    this.started = false;
    this.createdAt = Date.now();
    this.tick = 0;
    this.ended = false;
    this.endSent = false;
    this.players = this.sim.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, outfit: p.outfit, color: p.color, crownStyle: p.crownStyle, streak: p.streak }));
    this.sentRev = new Map();
    const spawns = {};
    for (const p of this.sim.players) spawns[p.id] = [r2(p.body.x), r2(p.body.y), r2(p.body.z), r2(p.body.yaw)];
    for (const c of this.clients.values()) {
      c.matchId = this.id;
      gs.send(c, { t: 'matchStart', matchId: this.id, seed: this.seed, players: this.players, spawns, you: c.pid });
    }
    this.timer = setInterval(() => this.update(), 1000 / SIM_HZ);
    console.log(`Match ${this.id} gestartet: ${humans.length} ${humans.length === 1 ? 'Mensch' : 'Menschen'} + ${this.sim.players.length - humans.length} Bots = ${this.sim.players.length}`);
  }

  humanCount() {
    let n = 0;
    for (const c of this.clients.values()) if (c.matchId === this.id) n++;
    return n;
  }

  onLoaded(c) {
    this.loaded.add(c.pid);
    if (c.admin && c.cheats && c.cheats.ia) this.sim.humanCheat(c.pid, { infAmmo: true });
  }

  update() {
    // Warten, bis alle Clients die Welt geladen haben (max. 15 s)
    if (!this.started) {
      const all = [...this.clients.keys()].every((id) => this.loaded.has(id) || !this.clients.get(id).ws);
      if (all || Date.now() - this.createdAt > 15000) this.started = true;
      else {
        if (this.tick++ % 10 === 0) this.broadcastSnapshot(false);
        return;
      }
    }
    this.tick++;
    this.sim.step(SIM_DT);
    const ev = this.sim.drainEvents();
    if (ev.length) this.broadcast({ t: 'ev', mid: this.id, e: ev });
    // Snapshots mit 20 Hz
    if (Math.floor(this.tick * SNAPSHOT_HZ / SIM_HZ) !== Math.floor((this.tick - 1) * SNAPSHOT_HZ / SIM_HZ)) {
      this.broadcastSnapshot(this.tick % 15 === 0);
    }
    if (this.sim.phase === 'ended' && !this.ended) {
      this.ended = true;
      this.endAt = Date.now() + 1500;
    }
    if (this.ended && !this.endSent && Date.now() > this.endAt) this.finish();
    // Keine Menschen mehr: Runde schnell zu Ende simulieren (für den Kronen-Sieger)
    if (!this.ended && this.humanCount() === 0 && this.started) this.fastForward();
  }

  broadcastSnapshot(withScores) {
    const s = this.sim.snapshot();
    let sc = null;
    if (withScores) sc = this.sim.players.map((p) => [p.id, p.kills, p.damage, p.isBot ? 0 : Math.round((this.clients.get(p.id)?.ping) || 0)]);
    for (const c of this.clients.values()) {
      if (c.matchId !== this.id) continue;
      const p = this.sim.byId.get(c.pid);
      const msg = { t: 'snap', mid: this.id, s };
      if (sc) msg.sc = sc;
      if (p) {
        msg.me = { u: p.useT >= 0 ? Math.round(p.useT * 100) / 100 : -1 };
        // Inventar nur bei Änderungen
        if (this.sentRev.get(c.pid) !== p.inv.rev) {
          this.sentRev.set(c.pid, p.inv.rev);
          msg.me.inv = { s: p.inv.slots.map((it) => (it ? encodeItem(it) : null)), sel: p.inv.sel, a: p.inv.ammo, rev: p.inv.rev };
        }
      }
      this.gs.send(c, msg);
    }
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const c of this.clients.values()) {
      if (c.matchId === this.id) this.gs.sendRaw(c, data);
    }
  }

  // Nachricht eines menschlichen Spielers
  onMessage(c, m) {
    const sim = this.sim;
    switch (m.t) {
      case 'loaded': this.onLoaded(c); break;
      case 'st':
        if (typeof m.x === 'number') sim.setHumanState(c.pid, m);
        break;
      case 'fire': {
        const rw = Math.max(0, Math.min(MAX_REWIND, Number(m.rw) || 0));
        if (!Array.isArray(m.o) || !Array.isArray(m.d) || m.d.length > 12) break;
        const [ox, oy, oz] = m.o.map(Number);
        const dirs = m.d.filter((d) => Array.isArray(d) && d.length === 3 && d.every((v) => Number.isFinite(+v))).map((d) => ({ x: +d[0], y: +d[1], z: +d[2] }));
        if ([ox, oy, oz].every(Number.isFinite) && dirs.length) sim.humanFire(c.pid, { s: m.s | 0, ox, oy, oz, dirs, rewind: rw, wall: !!m.wb && !!c.admin });
        break;
      }
      case 'reload': sim.humanReload(c.pid); break;
      case 'reloadCancel': sim.humanCancelReload(c.pid); break;
      case 'sel': sim.humanSelect(c.pid, m.s | 0); break;
      case 'swap': sim.humanSwap(c.pid, m.a | 0, m.b | 0); break;
      case 'drop': sim.humanDrop(c.pid, m.s | 0); break;
      case 'dropAmmo': sim.humanDropAmmo(c.pid, String(m.a)); break;
      case 'cheat':
        // Cheats nur für angemeldete Admins (Server prüft das Token)
        c.cheats = { ia: !!m.ia };
        if (!c.admin) break;
        sim.humanCheat(c.pid, { infAmmo: !!m.ia });
        if (m.op) sim.humanOpLoot(c.pid);
        break;
      case 'int':
        if (Number.isInteger(m.c)) sim.humanInteract(c.pid, { c: m.c });
        else if (Number.isInteger(m.l)) sim.humanInteract(c.pid, { l: m.l });
        break;
      case 'use': sim.humanUse(c.pid, m.s | 0); break;
      case 'useCancel': sim.humanCancelUse(c.pid); break;
      case 'leaveMatch': this.leave(c); break;
      default: break;
    }
  }

  // Spieler verlässt das Match (oder trennt die Verbindung): Figur scheidet aus
  leave(c) {
    if (c.matchId !== this.id) return;
    this.sim.removePlayer(c.pid);
    if (c.matchId === this.id) c.matchId = null;
    const ev = this.sim.drainEvents();
    if (ev.length) this.broadcast({ t: 'ev', mid: this.id, e: ev });
    this.gs.onClientLeftMatch(c);
  }

  // Nur noch Bots übrig: Runde zügig, aber schonend zu Ende rechnen (für den Kronen-Sieger).
  // Wenige Extra-Schritte pro Tick statt voller CPU-Last – sonst ruckeln auf kleinen Servern
  // (z. B. Render Gratis mit 0,1 CPU) alle anderen Matches und der Ping steigt.
  fastForward() {
    for (let i = 0; i < FAST_STEPS && this.sim.phase !== 'ended' && this.sim.matchTime < 1200; i++) {
      this.sim.step(SIM_DT);
      this.sim.drainEvents();
    }
    if (this.sim.matchTime >= 1200 && this.sim.phase !== 'ended') this.sim.finish();
    if (this.sim.phase === 'ended' && !this.ended) {
      this.ended = true;
      this.endAt = 0;
    }
  }

  finish() {
    this.endSent = true;
    clearInterval(this.timer);
    const sim = this.sim;
    const results = sim.players.map((p) => sim.stats(p));
    const winner = sim.winnerId;
    for (const c of this.clients.values()) {
      if (c.matchId === this.id) this.gs.send(c, { t: 'matchEnd', mid: this.id, results, winner });
    }
    this.gs.onMatchFinished(this, winner);
  }

  destroy() {
    clearInterval(this.timer);
  }
}

function r2(v) {
  return Math.round(v * 100) / 100;
}
