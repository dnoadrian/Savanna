// Automatische Tests (npm test): Spielregeln, Namen, 12-Spieler-Garantie, Determinismus, Bot-Match.
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { validateName, suggestAlternatives, randomName } from '../shared/names.js';
import { MAX_HEALTH, MAX_SHIELD, START_OVERSHIELD, SIPHON, MATCH_SIZE, SIM_DT } from '../shared/constants.js';
import { WEAPONS, CONSUMABLES, weaponItem, consumableItem, ammoItem, weaponDamage, rollWeapon, decodeItem } from '../shared/items.js';
import { createWeaponRuntime, equipWeapon, canFire, fireWeapon, updateWeapon } from '../shared/sim/weapon.js';
import { createInventory, addItem, SLOTS } from '../shared/sim/inventory.js';
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

console.log('SHOWDOWN BAY – Tests\n');

const map = generateMap();
const world = { terrain: map.terrain, collision: map.collision, nav: null, pois: map.pois, chests: map.chests, floorLoot: map.floorLoot };
// Match nur mit Menschen (ohne Bots, ohne Sturm)
function makeSim(seed, n) {
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Spieler' + i }));
  return new Simulation(world, { seed, players, storm: false });
}
function playing(sim) {
  while (sim.phase === 'countdown') sim.step(SIM_DT);
}

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

test('Leben 100 + Schild 100, Start: 100 Leben + 50 Überschild, graue Pistole 20/40', () => {
  assert.equal(MAX_HEALTH, 100);
  assert.equal(MAX_SHIELD, 100);
  assert.equal(START_OVERSHIELD, 50);
  assert.equal(SIPHON, 50);
  const sim = makeSim(1, 2);
  const a = sim.players[0];
  assert.equal(a.health, 100);
  assert.equal(a.shield, 0);
  assert.equal(a.overshield, 50);
  assert.deepEqual(a.inv.slots[0], { k: 'w', w: 'pistol', r: 0, mag: 20 });
  assert.equal(a.inv.slots.length, SLOTS);
  assert.equal(SLOTS, 5);
  assert.equal(a.inv.ammo.light, 40);
  assert.equal(a.inv.ammo.medium + a.inv.ammo.heavy + a.inv.ammo.shells, 0);
});

test('Schaden: erst Überschild, dann Schild, dann Leben – Überschild kommt nie zurück, Sturm trifft nur Leben', () => {
  const sim = makeSim(2, 2);
  playing(sim);
  const [a, b] = sim.players;
  b.shield = 30;
  sim.applyDamage(b, 40, a.id, 'b', null, 'ar');
  assert.deepEqual([b.overshield, b.shield, b.health], [10, 30, 100]);
  sim.applyDamage(b, 45, a.id, 'b', null, 'ar');
  assert.deepEqual([b.overshield, b.shield, b.health], [0, 0, 95]);
  // Schild auffüllen lädt nie den Überschild
  b.inv.slots[1] = consumableItem('big', 1);
  assert.ok(sim.startUse(b, 1));
  for (let i = 0; i < 6 * 30; i++) sim.step(SIM_DT);
  assert.deepEqual([b.overshield, b.shield], [0, 50]);
  sim.applyDamage(b, 20, 'storm', 'x', null);
  assert.deepEqual([b.shield, b.health], [50, 75]);
});

test('Siphon: +50 pro Eliminierung, erst Leben, Rest als Schild', () => {
  const sim = makeSim(3, 3);
  playing(sim);
  const [a, b, c] = sim.players;
  a.health = 70;
  sim.applyDamage(b, 999, a.id, 'h', null, 'pump');
  assert.equal(a.kills, 1);
  assert.deepEqual([a.health, a.shield], [100, 20]);
  sim.applyDamage(c, 999, a.id, 'b', null, 'ar');
  assert.deepEqual([a.health, a.shield], [100, 70]);
});

test('Waffen: SCAR 5,5 Schuss/s + 30er Magazin, Schrotflinten 10 Kugeln, Schweres Sniper nur episch/legendär', () => {
  const ar = WEAPONS.ar;
  assert.equal(ar.fireRate, 5.5);
  assert.equal(ar.mag, 30);
  assert.deepEqual(ar.dmg, [30, 31, 33, 35, 36]);
  const item = weaponItem('ar', 4);
  const rt = createWeaponRuntime();
  equipWeapon(rt, item);
  const ammo = { light: 0, medium: 90, heavy: 0, shells: 0 };
  let shots = 0;
  for (let t = 0; t < 3.0 + ar.equip - 1e-9; t += 1 / 240) {
    updateWeapon(rt, item, ammo, 1 / 240);
    if (canFire(rt, item) && fireWeapon(rt, item)) shots++;
  }
  assert.ok(shots >= 16 && shots <= 17, 'Schüsse in 3 s: ' + shots);
  assert.equal(WEAPONS.pump.pellets, 10);
  assert.equal(WEAPONS.tac.pellets, 10);
  assert.equal(WEAPONS.sniper.scope, 4);
  assert.deepEqual(WEAPONS.sniper.rarities, [3, 4]);
  assert.equal(Math.round(weaponDamage('sniper', 4, 'h', 50)), Math.round(157 * 2.5));
  // Schrot: volle Ladung aus der Nähe = Grundschaden
  let pump = 0;
  for (let k = 0; k < 10; k++) pump += weaponDamage('pump', 4, 'b', 3);
  assert.equal(Math.round(pump), 105);
  // Schadensabfall der SCAR ab 50 m
  assert.ok(weaponDamage('ar', 4, 'b', 100) < weaponDamage('ar', 4, 'b', 40));
  const rng = new RNG(4);
  for (let i = 0; i < 400; i++) {
    const w = rollWeapon(rng);
    assert.ok(WEAPONS[w.w].rarities.includes(w.r), `${w.w} mit Seltenheit ${w.r}`);
  }
});

test('Keine unendliche Munition, kein Auto-Nachladen: Reserve wird verbraucht', () => {
  const sim = makeSim(6, 2);
  playing(sim);
  const a = sim.players[0];
  const pistol = a.inv.slots[0];
  pistol.mag = 0;
  const shot = { s: 0, ox: a.body.x, oy: a.body.y + 1.6, oz: a.body.z, dirs: [{ x: 0, y: 0, z: -1 }] };
  assert.equal(sim.humanFire(a.id, shot), false);
  for (let i = 0; i < 90; i++) sim.step(SIM_DT);
  assert.equal(a.wr.reloading, false);
  assert.equal(pistol.mag, 0);
  sim.humanReload(a.id);
  assert.equal(a.wr.reloading, true);
  for (let i = 0; i < 90; i++) sim.step(SIM_DT);
  assert.equal(pistol.mag, 20);
  assert.equal(a.inv.ammo.light, 20);
  pistol.mag = 0;
  sim.humanReload(a.id);
  for (let i = 0; i < 90; i++) sim.step(SIM_DT);
  assert.equal(pistol.mag, 20);
  assert.equal(a.inv.ammo.light, 0);
  pistol.mag = 3;
  sim.humanReload(a.id);
  assert.equal(a.wr.reloading, false, 'ohne Reserve kein Nachladen');
});

test('Inventar: 5 Plätze, Stapel, Tausch bei vollem Inventar, Munitionsgrenzen', () => {
  const inv = createInventory();
  assert.equal(addItem(inv, consumableItem('mini', 4)).slot, 1);
  addItem(inv, consumableItem('mini', 4));
  assert.equal(inv.slots[1].n, 6);
  assert.equal(inv.slots[2].n, 2);
  addItem(inv, weaponItem('ar', 2));
  addItem(inv, weaponItem('pump', 3));
  assert.ok(inv.slots.every(Boolean));
  // volles Inventar: Schild wird nicht getauscht, wenn ein Stapel Platz hat
  assert.equal(addItem(inv, consumableItem('mini', 1)).taken, true);
  assert.equal(inv.slots[2].n, 3);
  inv.sel = 3;
  const sw = addItem(inv, weaponItem('sniper', 4));
  assert.equal(sw.dropped.w, 'ar');
  assert.equal(inv.slots[3].w, 'sniper');
  addItem(inv, ammoItem('heavy', 500));
  assert.equal(inv.ammo.heavy, 30);
});

test('Truhe mit F: 1 Waffe + 1 Heil-/Schild-Gegenstand + passende Munition, nur einmal', () => {
  const sim = makeSim(7, 2);
  playing(sim);
  const a = sim.players[0];
  const c = sim.loot.chests[0];
  a.body.x = c.x - Math.sin(c.ry) * 1.5;
  a.body.z = c.z - Math.cos(c.ry) * 1.5;
  a.body.y = c.y;
  sim.drainEvents();
  assert.ok(sim.humanInteract(a.id, { c: c.id }));
  assert.equal(sim.humanInteract(a.id, { c: c.id }), false);
  const ev = sim.drainEvents().find((e) => e.t === 'loot');
  const items = ev.a.map((q) => decodeItem(q[1]));
  assert.equal(items.length, 3);
  assert.equal(items[0].k, 'w');
  assert.equal(items[1].k, 'c');
  assert.equal(items[2].k, 'a');
  assert.equal(items[2].a, WEAPONS[items[0].w].ammo);
  // aufheben mit F
  const wid = ev.a[0][0];
  assert.ok(sim.humanInteract(a.id, { l: wid }));
  assert.equal(a.inv.slots[1].w, items[0].w);
});

test('Schilde & Heilung: Mini bis 50, Schildtrank bis 100, Medikit bis 100 Leben', () => {
  assert.deepEqual([CONSUMABLES.mini.shield, CONSUMABLES.mini.cap, CONSUMABLES.mini.use], [25, 50, 2]);
  assert.deepEqual([CONSUMABLES.big.shield, CONSUMABLES.big.cap, CONSUMABLES.big.use], [50, 100, 5]);
  assert.deepEqual([CONSUMABLES.medkit.heal, CONSUMABLES.medkit.use], [100, 10]);
  const sim = makeSim(8, 2);
  playing(sim);
  const a = sim.players[0];
  a.inv.slots[1] = consumableItem('mini', 6);
  a.shield = 40;
  assert.ok(sim.startUse(a, 1));
  for (let i = 0; i < 70; i++) sim.step(SIM_DT);
  assert.equal(a.shield, 50);
  assert.equal(sim.startUse(a, 1), false, 'Mini über 50 nicht möglich');
  a.health = 20;
  a.inv.slots[2] = consumableItem('medkit', 1);
  assert.ok(sim.startUse(a, 2));
  for (let i = 0; i < 10.2 * 30; i++) sim.step(SIM_DT);
  assert.equal(a.health, 100);
  assert.equal(a.inv.slots[2], null);
});

test('Immer genau 12 Spieler (1..12 Menschen, Rest Bots)', () => {
  const rng = new RNG(5);
  for (let h = 1; h <= 14; h++) {
    const humans = Array.from({ length: h }, (_, i) => ({ id: 'h' + i, name: 'Mensch' + i }));
    const players = Simulation.fillWithBots(humans, rng, h % 2 ? { name: 'Kronen Bot', outfit: 'pirate', color: 1, streak: 2 } : null);
    assert.equal(players.length, MATCH_SIZE);
    assert.equal(players.filter((p) => !p.isBot).length, Math.min(h, 12));
    assert.equal(new Set(players.map((p) => p.id)).size, 12);
  }
});

test('Karte: Hafenbucht mit 3 Orten, Truhen, türkisem Wasser, deterministisch (Server = Client)', () => {
  const m2 = generateMap();
  const hash = (m) => {
    let h = 0;
    for (const c of m.collision.cols) h = (h * 31 + Math.round((c.x + c.z) * 100)) | 0;
    return [m.collision.cols.length, h, m.props.length, m.parts.length, m.chests.length];
  };
  assert.deepEqual(hash(map), hash(m2));
  assert.deepEqual(map.pois.map((p) => p.name), ['Saloon Pier', 'Lighthouse Point', 'Tin Roof Wharf']);
  assert.ok(map.chests.length >= 15, 'Truhen: ' + map.chests.length);
  let water = 0, land = 0;
  for (let x = -90; x <= 90; x += 6) for (let z = -90; z <= 90; z += 6) {
    if (Math.hypot(x, z) > 90) continue;
    if (map.terrain.heightAt(x, z) < 0) water++; else land++;
  }
  assert.ok(water > 60 && land > 60, `Wasser ${water} / Land ${land}`);
  // Canyonwände rundherum
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) assert.ok(map.terrain.heightAt(Math.cos(a) * 125, Math.sin(a) * 125) > 3, 'Canyon bei 125 m');
  assert.ok(map.collision.cols.filter((c) => Math.hypot(c.x, c.z) > 95).length > 30, 'Felswände fehlen');
});

test('Komplettes Bot-Match: Sieger, Plätze 1..12, Truhen geöffnet, Beute, Heilung, Siphon', () => {
  const r = runHeadlessMatch({ seed: 4242 });
  assert.equal(r.playerCount, 12);
  assert.ok(r.winner, 'Kein Sieger');
  const places = r.sim.players.map((p) => p.placement).sort((a, b) => a - b);
  assert.deepEqual(places, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.ok(r.stats.chests > 3, 'Bots öffnen keine Truhen');
  assert.ok(r.stats.pickups > 5, 'Bots heben nichts auf');
  assert.ok(r.stats.siphons > 0, 'kein Siphon');
  assert.ok(r.stuckMax < 8, 'Bots stecken fest');
  console.log(`    Sieger: ${r.winner.name} nach ${r.sim.matchTime.toFixed(0)} s · Truhen ${r.stats.chests} · Aufgehoben ${r.stats.pickups} · Heilungen ${r.stats.heals} · Waffen ${JSON.stringify(r.stats.weapons)}`);
});

test('Webseiten-Version (docs/) ist aktuell', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'showdown-pages-'));
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
    console.log(`  ✔ Server: Namen, Freunde, Einladung, Party, 15-s-Warteschlange, Match mit Menschen + Bots, Inventar, Schüsse, Ende (${Date.now() - t0} ms)`);
  } catch (e) {
    console.error(`  ✘ Server-Integrationstest\n    ${e.stack}`);
    process.exitCode = 1;
  }
}

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', FEHLER vorhanden' : ''}.`);
process.exit(process.exitCode || 0);
