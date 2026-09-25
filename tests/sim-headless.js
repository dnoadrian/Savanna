// Headless-Test: komplettes Match mit 12 Bots in Node simulieren.
import { generateMap } from '../shared/map/mapgen.js';
import { NavGrid } from '../shared/sim/nav.js';
import { Simulation } from '../shared/sim/simulation.js';
import { RNG } from '../shared/rng.js';
import { SIM_DT, MATCH_SIZE } from '../shared/constants.js';

export function runHeadlessMatch({ seed = 1234, difficulty = 'normal', storm = true, maxTime = 900, log = false } = {}) {
  const t0 = Date.now();
  const map = generateMap();
  const nav = new NavGrid(map.terrain, map.collision);
  const tGen = Date.now() - t0;
  const rng = new RNG(seed);
  const players = Simulation.fillWithBots([], rng);
  const sim = new Simulation({ terrain: map.terrain, collision: map.collision, nav, pois: map.pois }, { seed, players, storm, botDifficulty: difficulty });
  const stats = { kills: 0, heals: 0, shots: 0, hits: 0, stormDeaths: 0, reloads: 0, slides: 0 };
  const stateTime = {};
  let stuckSamples = 0, stuckMax = 0;
  const lastPos = new Map();
  let steps = 0;
  const tSim0 = Date.now();
  while (sim.phase !== 'ended' && sim.matchTime < maxTime) {
    sim.step(SIM_DT);
    steps++;
    for (const e of sim.drainEvents()) {
      if (e.t === 'kill') { stats.kills++; if (e.w === 'storm') stats.stormDeaths++; if (log) console.log(`[${sim.matchTime.toFixed(1)}] ${e.k ? sim.byId.get(e.k).name : 'Sturm'} -> ${sim.byId.get(e.v).name} (#${e.place})${e.hs ? ' HS' : ''}`); }
      else if (e.t === 'heal') stats.heals++;
      else if (e.t === 'shot') { stats.shots++; if (e.m === 8) stats.hits++; }
      else if (e.t === 'reload') stats.reloads++;
    }
    if (steps % 30 === 0) {
      for (const p of sim.players) {
        if (!p.alive) continue;
        const st = p.brain.state;
        stateTime[st] = (stateTime[st] || 0) + 1;
        const lp = lastPos.get(p.id);
        if (lp && p.brain.dest && Math.hypot(p.body.x - lp.x, p.body.z - lp.z) < 0.3) { lp.n++; stuckSamples++; stuckMax = Math.max(stuckMax, lp.n); }
        else if (lp) lp.n = 0;
        lastPos.set(p.id, { x: p.body.x, z: p.body.z, n: lp && Math.hypot(p.body.x - lp.x, p.body.z - lp.z) < 0.3 ? lp.n : 0 });
      }
    }
  }
  stats.slides = sim.slideCount || 0;
  const winner = sim.winnerId ? sim.byId.get(sim.winnerId) : null;
  return { sim, winner, stats, stateTime, stuckMax, tGen, tSim: Date.now() - tSim0, steps, playerCount: sim.players.length, expected: MATCH_SIZE };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = runHeadlessMatch({ log: true, difficulty: process.argv[2] || 'normal' });
  console.log('winner', r.winner && r.winner.name, 'matchTime', r.sim.matchTime.toFixed(1), 'steps', r.steps, 'simMs', r.tSim, 'genMs', r.tGen);
  console.log(r.stats, r.stateTime, 'stuckMax', r.stuckMax);
}
