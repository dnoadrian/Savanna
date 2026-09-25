// Automatische Tests (npm test): Spielregeln, Namen, 12-Spieler-Garantie, Determinismus, Bot-Match.
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { validateName, suggestAlternatives, randomName } from '../shared/names.js';
import { MAX_HP, WEAPON, MEDKIT_HEAL, MEDKIT_START, MEDKIT_MAX, MATCH_SIZE, SIM_DT } from '../shared/constants.js';
import { computeDamage, falloff } from '../shared/sim/combat.js';
import { WeaponState } from '../shared/sim/weapon.js';
import { Simulation } from '../shared/sim/simulation.js';
import { RNG } from '../shared/rng.js';
import { generateMap } from '../shared/map/mapgen.js';
import { runHeadlessMatch } from './sim-headless.js';
import { runServerTest } from './server-test.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function test(name, fn) {
  const t0 = Date.now();
  try {
    fn();
    passed++;
    console.log(`  ✔ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    console.error(`  ✘ ${name}\n    ${e.stack}`);
    process.exitCode = 1;
  }
}

console.log('SAVANNA ROYALE – Tests\n');

test('Namensregeln', () => {
  assert.equal(validateName('WildeGiraffe42'), null);
  assert.equal(validateName('Jürgen_Ölmühle'), null);
  assert.equal(validateName('ab'), 'short');
  assert.equal(validateName('a'.repeat(17)), 'long');
  assert.equal(validateName(' Hallo'), 'spaces');
  assert.equal(validateName('Hallo Welt'), 'spaces');
  assert.equal(validateName('Hi!!'), 'chars');
  assert.equal(validateName('SuperBot'), 'bot');
  assert.equal(validateName('[BOT]Max'), 'chars');
  assert.equal(validateName('F1ck3r'), 'banned');
  for (let i = 0; i < 50; i++) assert.equal(validateName(randomName()), null);
  const taken = new Set(['alpha', 'alpha1']);
  const alts = suggestAlternatives('Alpha', (n) => taken.has(n.toLowerCase()));
  assert.equal(alts.length, 3);
  for (const a of alts) assert.equal(validateName(a), null);
});

test('Werte: 200 HP, 19/26/16 Schaden, Medkit +75, Start 1 / Max 5', () => {
  assert.equal(MAX_HP, 200);
  assert.equal(computeDamage('b', 10), 19);
  assert.equal(computeDamage('h', 10), 26);
  assert.equal(computeDamage('l', 10), 16);
  assert.equal(MEDKIT_HEAL, 75);
  assert.equal(MEDKIT_START, 1);
  assert.equal(MEDKIT_MAX, 5);
});

test('Schadensabfall ab 50 m linear auf 70 % bei 100 m', () => {
  assert.equal(falloff(50), 1);
  assert.ok(Math.abs(falloff(75) - 0.85) < 1e-9);
  assert.equal(falloff(100), 0.7);
  assert.equal(falloff(300), 0.7);
  assert.equal(computeDamage('b', 100), Math.round(19 * 0.7));
});

test('Sturmgewehr: 30 Schuss, 5,5 Schuss/s, Nachladen 1,9 s / 2,4 s', () => {
  const w = new WeaponState(true);
  assert.equal(w.mag, 30);
  let shots = 0;
  for (let t = 0; t < 1.0 - 1e-9; t += 1 / 240) {
    w.update(1 / 240);
    if (w.canFire() && w.fire()) shots++;
  }
  assert.ok(shots >= 5 && shots <= 6, 'Schüsse in 1 s: ' + shots);
  assert.ok(w.startReload());
  assert.equal(w.reloadDur, WEAPON.reloadTactical);
  const w2 = new WeaponState(false);
  w2.mag = 0;
  w2.startReload();
  assert.equal(w2.reloadDur, WEAPON.reloadEmpty);
  for (let i = 0; i < 100; i++) w2.update(0.03);
  assert.equal(w2.mag, 30);
  assert.equal(w2.reserve, 150);
});

test('Jedes Match hat genau 12 Spieler (1..12 Menschen)', () => {
  const rng = new RNG(5);
  for (let h = 1; h <= 14; h++) {
    const humans = Array.from({ length: h }, (_, i) => ({ id: 'h' + i, name: 'Mensch' + i }));
    const players = Simulation.fillWithBots(humans, rng, h % 2 ? { name: 'Kronen Bot', outfit: 'pirate', color: 1, skin: 'gold', streak: 2 } : null);
    assert.equal(players.length, MATCH_SIZE);
    assert.equal(players.filter((p) => !p.isBot).length, Math.min(h, 12));
    assert.equal(new Set(players.map((p) => p.id)).size, 12);
  }
});

let map;
test('Insel ist deterministisch (Server = Client)', () => {
  map = generateMap();
  const m2 = generateMap();
  const hash = (m) => {
    let h = 0;
    for (const c of m.collision.cols) h = (h * 31 + Math.round((c.x + c.z) * 100)) | 0;
    return [m.collision.cols.length, h, m.props.length, m.parts.length];
  };
  assert.deepEqual(hash(map), hash(m2));
  assert.ok(map.pois.length >= 8);
  const names = map.pois.map((p) => p.name);
  for (const n of ['Dusty Mine', 'Cactus Canyon', 'Oasis', 'Safari Camp', 'Old Ranch', 'Railway Station', 'Bone Valley', 'Lookout Rock', 'Fishing Docks']) assert.ok(names.includes(n), n);
  // von Wasser umgeben
  for (const [x, z] of [[-700, 0], [700, 0], [0, -700], [0, 700], [690, 690]]) assert.ok(map.terrain.heightAt(x, z) < -2);
});

test('Medkit heilt +75, nicht über 200; Kill gibt +1 Medkit', () => {
  const nav = null;
  const rng = new RNG(9);
  const players = Simulation.fillWithBots([{ id: 'me', name: 'Ich' }], rng);
  const sim = new Simulation({ terrain: map.terrain, collision: map.collision, nav, pois: map.pois }, { seed: 99, players, storm: false });
  while (sim.phase === 'countdown') sim.step(SIM_DT);
  const me = sim.byId.get('me');
  assert.equal(sim.humanHeal('me'), false); // volle HP
  me.hp = 150;
  assert.equal(sim.humanHeal('me'), true);
  for (let i = 0; i < 40; i++) sim.step(SIM_DT);
  assert.equal(me.hp, 200);
  assert.equal(me.medkits, 0);
  const bot = sim.players.find((p) => p.isBot);
  sim.applyDamage(bot, 999, 'me', 'h', null);
  assert.equal(me.kills, 1);
  assert.equal(me.medkits, 1);
});

test('Komplettes Bot-Match: genau ein Sieger, Plätze 1..12', () => {
  const r = runHeadlessMatch({ seed: 4242, difficulty: 'normal' });
  assert.equal(r.playerCount, 12);
  assert.ok(r.winner, 'Kein Sieger');
  const places = r.sim.players.map((p) => p.placement).sort((a, b) => a - b);
  assert.deepEqual(places, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.ok(r.stats.heals > 0, 'Bots heilen nie');
  assert.ok(r.stuckMax < 8, 'Bots stecken fest');
  console.log(`    Sieger: ${r.winner.name} nach ${r.sim.matchTime.toFixed(0)} s, Heilungen: ${r.stats.heals}, Slides: ${r.stats.slides}`);
});

test('Webseiten-Version (docs/) ist aktuell', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'savanna-pages-'));
  const out = path.join(tmp, 'site');
  execFileSync(process.execPath, ['scripts/build-pages.js', out], { cwd: ROOT, stdio: 'ignore' });
  const list = (d, base = d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name))])).sort();
  const a = list(out);
  const b = list(path.join(ROOT, 'docs'));
  assert.deepEqual(b, a, 'docs/ enthält andere Dateien – bitte "npm run build:pages" ausführen');
  for (const f of a) {
    assert.ok(fs.readFileSync(path.join(out, f)).equals(fs.readFileSync(path.join(ROOT, 'docs', f))), `docs/${f} ist veraltet – bitte "npm run build:pages" ausführen`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

// asynchroner Server-Integrationstest
{
  const t0 = Date.now();
  try {
    await runServerTest();
    passed++;
    console.log(`  ✔ Server: Namen, Freunde, Einladung, Party, Warteschlange, Match mit 2 Menschen + 10 Bots, Ende (${Date.now() - t0} ms)`);
  } catch (e) {
    console.error(`  ✘ Server-Integrationstest\n    ${e.stack}`);
    process.exitCode = 1;
  }
}

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', FEHLER vorhanden' : ''}.`);
process.exit(process.exitCode || 0);
