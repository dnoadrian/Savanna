// Server-autoritatives Match: gemeinsame Simulation mit 30 Hz, Snapshots mit 20 Hz,
// Ereignisse sofort, Lag-Kompensation beim Treffertest.
import { Simulation } from '../shared/sim/simulation.js';
import { RNG } from '../shared/rng.js';
import { SIM_DT, SIM_HZ, SNAPSHOT_HZ, MATCH_SIZE, MAX_REWIND } from '../shared/constants.js';

let nextMatch = 1;

export class ServerMatch {
  constructor(gs, clients, opts) {
    this.gs = gs;
    this.id = 'm' + nextMatch++ + '_' + Date.now().toString(36);
    this.opts = opts;
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    const rng = new RNG(this.seed ^ 0xabc);
    const humans = clients.slice(0, MATCH_SIZE).map((c) => ({ ...gs.publicProfile(c.pid), isBot: false }));
    const champ = gs.store.data.champion;
    const players = Simulation.fillWithBots(humans, rng, champ ? { ...champ, crownStyle: 'gold' } : null);
    this.sim = new Simulation(gs.world, {
      seed: this.seed,
      players,
      storm: opts.storm !== false,
      botDifficulty: opts.botDifficulty || 'normal',
      infiniteAmmo: opts.infiniteAmmo !== false,
    });
    this.clients = new Map(clients.map((c) => [c.pid, c]));
    this.loaded = new Set();
    this.started = false;
    this.createdAt = Date.now();
    this.tick = 0;
    this.ended = false;
    this.endSent = false;
    this.players = this.sim.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, outfit: p.outfit, color: p.color, skin: p.skin, crownStyle: p.crownStyle, streak: p.streak }));
    const spawns = {};
    for (const p of this.sim.players) spawns[p.id] = [r2(p.body.x), r2(p.body.y), r2(p.body.z), r2(p.body.yaw)];
    for (const c of this.clients.values()) {
      c.matchId = this.id;
      gs.send(c, { t: 'matchStart', matchId: this.id, seed: this.seed, storm: opts.storm !== false, players: this.players, spawns, you: c.pid });
    }
    this.timer = setInterval(() => this.update(), 1000 / SIM_HZ);
    console.log(`Match ${this.id} gestartet: ${humans.length} Menschen + ${MATCH_SIZE - humans.length} Bots = ${this.sim.players.length}`);
  }

  humanCount() {
    let n = 0;
    for (const c of this.clients.values()) if (c.matchId === this.id) n++;
    return n;
  }

  onLoaded(c) {
    this.loaded.add(c.pid);
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
      const msg = { t: 'snap', mid: this.id, s, me: { mk: p ? p.medkits : 0 } };
      if (sc) msg.sc = sc;
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
        const shot = { ox: +m.ox, oy: +m.oy, oz: +m.oz, dx: +m.dx, dy: +m.dy, dz: +m.dz, rewind: rw };
        if (Object.values(shot).every(Number.isFinite)) sim.humanFire(c.pid, shot);
        break;
      }
      case 'reload': sim.humanReload(c.pid); break;
      case 'reloadCancel': sim.humanCancelReload(c.pid); break;
      case 'heal': sim.humanHeal(c.pid); break;
      case 'healCancel': sim.humanCancelHeal(c.pid); break;
      case 'leaveMatch': this.leave(c); break;
      default: break;
    }
  }

  // Spieler verlässt das Match (oder trennt die Verbindung): Figur scheidet aus
  leave(c) {
    this.sim.removePlayer(c.pid);
    if (c.matchId === this.id) c.matchId = null;
    const ev = this.sim.drainEvents();
    if (ev.length) this.broadcast({ t: 'ev', mid: this.id, e: ev });
    this.gs.onClientLeftMatch(c);
  }

  fastForward() {
    const t0 = Date.now();
    while (this.sim.phase !== 'ended' && Date.now() - t0 < 25 && this.sim.matchTime < 1200) {
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
