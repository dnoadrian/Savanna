// Automatische Tests (npm test): Spielregeln, Namen, 12-Spieler-Garantie, Determinismus, Bot-Match.
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { validateName, suggestAlternatives, randomName } from '../shared/names.js';
import { MAX_HEALTH, MAX_SHIELD, START_OVERSHIELD, SIPHON, MATCH_SIZE, SIM_DT, QUEUE_WAIT, PLAY_RADIUS, clampQueueWait } from '../shared/constants.js';
import { WEAPONS, LOOT_WEAPONS, KNIFE_SKINS, CONSUMABLES, AMMO_DROP, KILL_AMMO, AMMO_TYPES, weaponItem, consumableItem, ammoItem, weaponDamage, rollWeapon, decodeItem, chestAmmoFor } from '../shared/items.js';
import { createWeaponRuntime, equipWeapon, canFire, fireWeapon, updateWeapon } from '../shared/sim/weapon.js';
import { createInventory, addItem, selectedItem, SLOTS, KNIFE_SLOT } from '../shared/sim/inventory.js';
import { createBody, stepMovement } from '../shared/sim/movement.js';
import { PT, PROP_TYPES, propColliders } from '../shared/map/props.js';
import { SURF } from '../shared/map/terrain.js';
import { NavGrid } from '../shared/sim/nav.js';
import { CollisionWorld } from '../shared/physics/collision.js';
import { Simulation } from '../shared/sim/simulation.js';
import { RNG } from '../shared/rng.js';
import { generateMap, MAPS, randomMapId } from '../shared/map/mapgen.js';
import { runHeadlessMatch } from './sim-headless.js';
import { runServerTest } from './server-test.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const asyncTests = [];
function test(name, fn) {
  const t0 = Date.now();
  const ok = () => { passed++; console.log(`  ✔ ${name} (${Date.now() - t0} ms)`); };
  const fail = (e) => { console.error(`  ✘ ${name}\n    ${e.stack}`); process.exitCode = 1; };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') asyncTests.push(r.then(ok, fail));
    else ok();
  } catch (e) {
    fail(e);
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

test('Leben 100 + Schild 100, Start: 100 Leben + 50 Überschild, graue Pistole 20 + 60 = 80 Schuss', () => {
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
  assert.equal(a.inv.ammo.light, 60);
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

test('Kill: je ein Magazin jeder Munitionsart fällt auf den Boden', () => {
  const sim = makeSim(3, 3);
  playing(sim);
  const [a, b] = sim.players;
  for (const k of AMMO_TYPES) b.inv.ammo[k] = 0;
  const before = new Set(sim.loot.pickups.keys());
  sim.applyDamage(b, 999, a.id, 'b', null, 'ar');
  const drops = [...sim.loot.pickups.values()].filter((p) => !before.has(p.id) && p.item.k === 'a');
  for (const k of AMMO_TYPES) {
    const d = drops.find((p) => p.item.a === k);
    assert.ok(d, 'keine Munition: ' + k);
    assert.equal(d.item.n, KILL_AMMO[k]);
  }
  assert.equal(KILL_AMMO.medium, WEAPONS.ar.mag);
});

test('Schilde/Medikits werden automatisch aufgesammelt, wenn schon ein Stapel im Inventar ist', () => {
  const sim = makeSim(5, 2);
  playing(sim);
  const [a] = sim.players;
  a.inv.slots = [null, consumableItem('mini', 2), null, null, null];
  const { x, y, z } = a.body;
  const [mini] = sim.loot.scatter([consumableItem('mini', 6)], x, y, z, null, 0);
  const [big] = sim.loot.scatter([consumableItem('big', 1)], x, y, z, null, 0);
  for (let i = 0; i < 8; i++) sim.step(SIM_DT);
  assert.equal(a.inv.slots[1].n, 6, 'Stapel aufgefüllt');
  assert.equal(sim.loot.pickups.get(mini.id).item.n, 2, 'Rest bleibt liegen');
  assert.ok(sim.loot.pickups.has(big.id), 'ohne Stapel nicht automatisch');
});

test('Inventar sortieren (TAB): Plätze tauschen, gewählter Gegenstand bleibt in der Hand', () => {
  const sim = makeSim(8, 2);
  playing(sim);
  const a = sim.players[0];
  a.inv.slots = [weaponItem('ar', 1), null, weaponItem('pump', 2), consumableItem('mini', 2), null];
  a.inv.sel = 0;
  assert.ok(sim.humanSwap(a.id, 0, 2));
  assert.equal(a.inv.slots[0].w, 'pump');
  assert.equal(a.inv.slots[2].w, 'ar');
  assert.equal(a.inv.sel, 2, 'Auswahl folgt der SCAR');
  assert.ok(sim.humanSwap(a.id, 3, 4));
  assert.equal(a.inv.slots[4].c, 'mini');
  assert.equal(sim.humanSwap(a.id, 0, 7), false);
});

test('Inventar: Gegenstand und Munition fallen lassen (nicht sofort wieder eingesammelt)', () => {
  const sim = makeSim(9, 2);
  playing(sim);
  const a = sim.players[0];
  a.inv.slots = [weaponItem('ar', 2), consumableItem('mini', 2), null, null, null];
  a.inv.sel = 0;
  a.inv.ammo.medium = 70;
  const before = new Set(sim.loot.pickups.keys());
  assert.ok(sim.humanDrop(a.id, 0));
  assert.equal(a.inv.slots[0], null);
  assert.ok(sim.humanDropAmmo(a.id, 'medium'));
  assert.equal(a.inv.ammo.medium, 40);
  for (let i = 0; i < 20; i++) sim.step(SIM_DT);
  const fresh = [...sim.loot.pickups.values()].filter((p) => !before.has(p.id));
  assert.ok(fresh.some((p) => p.item.k === 'w' && p.item.w === 'ar'), 'SCAR liegt am Boden');
  assert.ok(fresh.some((p) => p.item.k === 'a' && p.item.a === 'medium' && p.item.n === 30), 'Munition liegt am Boden');
  assert.equal(a.inv.ammo.medium, 40, 'nicht sofort wieder eingesammelt');
  assert.equal(sim.humanDrop(a.id, 0), false);
});

test('Admin-Cheats: OP-Loot (goldene SCAR + Sniper) und unendliche Munition', () => {
  const sim = makeSim(10, 2);
  playing(sim);
  const a = sim.players[0];
  assert.ok(sim.humanOpLoot(a.id));
  assert.deepEqual(a.inv.slots.map((x) => x && `${x.w}${x.r}`), ['ar4', 'sniper4', null, null, null]);
  assert.equal(a.inv.sel, 0);
  sim.humanCheat(a.id, { infAmmo: true });
  a.wr.equipT = 0;
  const shot = () => sim.humanFire(a.id, { s: 0, ox: a.body.x, oy: a.body.y + 1.6, oz: a.body.z, dirs: [{ x: 0, y: 0, z: -1 }] });
  for (let i = 0; i < 40; i++) { a.fireTokens = 2; a.wr.cooldown = 0; shot(); }
  assert.equal(a.inv.slots[0].mag, 30, 'Magazin bleibt voll');
  sim.humanCheat(a.id, { infAmmo: false });
  a.fireTokens = 2; a.wr.cooldown = 0;
  assert.ok(shot());
  assert.equal(a.inv.slots[0].mag, 29);
});

test('Messer: eigener Platz, Nahkampf 40 Schaden (Kopf 60), keine Munition, nie in Truhen', () => {
  assert.ok(!LOOT_WEAPONS.includes('knife'));
  const rng = new RNG(99);
  for (let i = 0; i < 2000; i++) assert.notEqual(rollWeapon(rng).w, 'knife');
  assert.equal(createInventory('gold').knife.r, KNIFE_SKINS.indexOf('gold'));
  assert.equal(createInventory('gibtsnicht').knife.r, 0, 'unbekannter Skin → Standard');
  const sim = makeSim(12, 2);
  playing(sim);
  const [a, b] = sim.players;
  // beide in die Luft (nichts im Weg), b steht 1,8 m vor a
  a.body.x = 0; a.body.y = 150; a.body.z = 0;
  b.body.x = 0; b.body.y = 150; b.body.z = -1.8;
  sim.humanSelect(a.id, KNIFE_SLOT);
  assert.equal(a.inv.sel, KNIFE_SLOT);
  assert.equal(selectedItem(a.inv).w, 'knife');
  const ammo = { ...a.inv.ammo };
  const total = () => b.health + b.shield + b.overshield;
  const hit = (dy) => {
    a.fireTokens = 2; a.wr.cooldown = 0; a.wr.equipT = 0;
    const l = Math.hypot(dy, 1);
    return sim.humanFire(a.id, { s: KNIFE_SLOT, ox: 0, oy: 151.6, oz: 0, dirs: [{ x: 0, y: dy / l, z: -1 / l }] });
  };
  let before = total();
  assert.ok(hit(-0.35));
  assert.equal(before - total(), 40, 'Körpertreffer');
  before = total();
  assert.ok(hit(0));
  assert.equal(before - total(), 60, 'Kopftreffer');
  assert.equal(a.inv.knife.mag, 1, 'kein Magazin verbraucht');
  assert.deepEqual(a.inv.ammo, ammo, 'keine Munition verbraucht');
  sim.humanReload(a.id);
  assert.equal(a.wr.reloading, false, 'Messer lädt nicht nach');
  b.body.z = -4;
  before = total();
  hit(-0.35);
  assert.equal(total(), before, '4 m sind außer Reichweite');
  sim.humanSelect(a.id, 0);
  assert.equal(selectedItem(a.inv).w, 'pistol');
});

test('Admin-Zugänge: Haupt-Admin legt Zugänge mit begrenzten Anmeldungen an', async () => {
  const { AdminAuth, USES_UNLIMITED } = await import('../server/admin.js');
  const store = { data: {}, save() {} };
  const auth = new AdminAuth(store);
  const m = auth.login('adrian', '1234');
  assert.equal(m.role, 'master');
  assert.equal(auth.check(m.token).role, 'master');
  assert.ok(auth.add('Freund', 'geheim', 2).ok);
  assert.ok(auth.add('vip', 'pw', USES_UNLIMITED).ok);
  assert.equal(auth.add('x', 'pw', 3).ok, false, 'zu kurzer Name');
  assert.equal(auth.login('freund', 'falsch').ok, false);
  const g1 = auth.login('freund', 'geheim');
  assert.ok(g1.ok && g1.role === 'guest' && g1.uses === 1);
  assert.equal(auth.login('freund', 'geheim').uses, 0);
  assert.equal(auth.login('freund', 'geheim').key, 'adminNoUses');
  for (let i = 0; i < 5; i++) assert.ok(auth.login('vip', 'pw').ok);
  assert.ok(auth.check(g1.token), 'Token bleibt gültig');
  auth.remove('freund');
  assert.equal(auth.check(g1.token), null, 'gelöschter Zugang verliert das Token');
  assert.deepEqual(auth.list().map((a) => a.user), ['vip']);
});

test('Sprint-Ausdauer: leert sich beim Sprinten, erholt sich danach', () => {
  const map = generateMap();
  const world = { terrain: map.terrain, collision: map.collision };
  // auf dem gefrorenen Spiegelsee hin und her (freie, ebene Strecke)
  const b = createBody(-84, map.terrain.heightAt(-84, 40), 40);
  const inp = { mx: 0, mz: 1, sprint: true, yaw: 0, pitch: 0 };
  let sprintT = 0;
  for (let t = 0; t < 12; t += SIM_DT) {
    inp.yaw = Math.floor(t / 2.5) % 2 ? -Math.PI / 2 : Math.PI / 2;
    stepMovement(b, inp, SIM_DT, world);
    if (b.sprinting) sprintT += SIM_DT;
    if (b.exhausted) break;
  }
  assert.ok(b.exhausted && b.stamina === 0, 'Ausdauer leer');
  assert.ok(sprintT > 5 && sprintT < 9, 'Sprintdauer ' + sprintT.toFixed(1));
  inp.sprint = false; inp.mz = 0;
  for (let t = 0; t < 5; t += SIM_DT) stepMovement(b, inp, SIM_DT, world);
  assert.ok(b.stamina > 0.99 && !b.exhausted, 'Ausdauer erholt');
});

test('Unter einen Steg gerutscht: man kann herauskriechen und bleibt nicht stecken', () => {
  const map = generateMap();
  const world = { terrain: map.terrain, collision: map.collision };
  // Stelle unter dem Hafen-Deck von Tin Roof Wharf
  const b = createBody(-9.4, map.terrain.heightAt(-9.4, 49.2), 49.2);
  b.stance = 'slide'; b.slideT = 5; b.vx = 0; b.vz = 0;
  for (let t = 0; t < 3; t += SIM_DT) stepMovement(b, { mx: 0, mz: 1, yaw: Math.PI / 2, pitch: 0 }, SIM_DT, world);
  assert.ok(Math.hypot(b.x + 9.4, b.z - 49.2) > 2, 'eingeklemmt: ' + b.x.toFixed(2) + ' ' + b.z.toFixed(2));
});

test('Kugeln gehen knapp an Felskanten vorbei (Kanten-Toleranz), Bewegung bleibt blockiert', () => {
  const rock = map.collision.cols.find((c) => c.soft && c.kind === 1 && c.r > 0.8);
  assert.ok(rock, 'kein Felsen');
  const y = (rock.minY + rock.maxY) / 2 - 0.2;
  const ox = rock.x + rock.r - 0.06, oz = rock.z - 20;
  const n = { nx: 0, ny: 0, nz: 0 };
  const tMove = CollisionWorld.rayCollider(rock, ox, y, oz, 0, 0, 1, 40, n, 0);
  const tBullet = CollisionWorld.rayCollider(rock, ox, y, oz, 0, 0, 1, 40, n, 0.14);
  assert.ok(tMove > 0, 'Strahl ohne Toleranz trifft den Felsen');
  assert.ok(tBullet < 0, 'Kugel streift vorbei');
  // mitten drauf trifft auch die Kugel
  assert.ok(CollisionWorld.rayCollider(rock, rock.x, y, oz, 0, 0, 1, 40, n, 0.14) > 0);
});

test('Objekt-Hitboxen folgen den Modellen (geneigte Palme, Felsplatten)', () => {
  const palm = propColliders(PT.palm, 1, 2);
  assert.ok(palm.length >= 5 && palm[palm.length - 1].ox > 0.5, 'Palmenstamm geneigt');
  const rock = propColliders(PT.rock_l, 1, 1);
  assert.ok(rock.filter((c) => c.k === 'b').length === 3, 'Felsplatten als Boxen');
});

test('Waffen: SCAR 7,2 Schuss/s + 30er Magazin, Schrotflinten 10 Kugeln, Schweres Sniper nur episch/legendär', () => {
  const ar = WEAPONS.ar;
  assert.equal(ar.fireRate, 7.2);
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
  assert.ok(shots >= 21 && shots <= 22, 'Schüsse in 3 s: ' + shots);
  assert.equal(WEAPONS.pump.pellets, 10);
  assert.equal(WEAPONS.tac.pellets, 10);
  assert.equal(WEAPONS.sniper.scope, 4);
  assert.deepEqual(WEAPONS.sniper.rarities, [3, 4]);
  assert.equal(Math.round(weaponDamage('sniper', 4, 'h', 50)), Math.round(157 * 2.5));
  // Schrot: volle Ladung aus der Nähe = Grundschaden
  let pump = 0;
  for (let k = 0; k < 10; k++) pump += weaponDamage('pump', 4, 'b', 3);
  assert.equal(Math.round(pump), 125);
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
  assert.equal(a.inv.ammo.light, 40);
  a.inv.ammo.light = 20;
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
  assert.equal(items[2].n, Math.max(WEAPONS[items[0].w].mag * 3, AMMO_DROP[items[2].a]), 'Munition = 3 Magazine');
  assert.equal(chestAmmoFor('ar'), 90, 'SCAR: 30 + 90 = 120 Schuss');
  // aufheben mit F
  const wid = ev.a[0][0];
  assert.ok(sim.humanInteract(a.id, { l: wid }));
  assert.equal(a.inv.slots[1].w, items[0].w);
});

test('Schilde & Heilung wirken sofort: Mini bis 50, Schildtrank bis 100, Medikit bis 100 Leben', () => {
  assert.deepEqual([CONSUMABLES.mini.shield, CONSUMABLES.mini.cap, CONSUMABLES.mini.use], [25, 50, 0]);
  assert.deepEqual([CONSUMABLES.big.shield, CONSUMABLES.big.cap, CONSUMABLES.big.use], [50, 100, 0]);
  assert.deepEqual([CONSUMABLES.medkit.heal, CONSUMABLES.medkit.use], [100, 0]);
  const sim = makeSim(8, 2);
  playing(sim);
  const a = sim.players[0];
  a.inv.slots[1] = consumableItem('mini', 6);
  a.shield = 40;
  assert.ok(sim.startUse(a, 1));
  assert.equal(a.shield, 50, 'sofort');
  assert.equal(a.useT, -1);
  assert.equal(sim.startUse(a, 1), false, 'Mini über 50 nicht möglich');
  a.health = 20;
  a.inv.slots[2] = consumableItem('medkit', 1);
  assert.ok(sim.startUse(a, 2));
  assert.equal(a.health, 100);
  assert.equal(a.inv.slots[2], null);
  a.inv.slots[3] = consumableItem('big', 1);
  assert.ok(sim.startUse(a, 3));
  assert.equal(a.shield, 100);
});

test('Warteschlange: Wartezeit einstellbar, Standard 15 s, 10 bis 120 s', () => {
  assert.equal(QUEUE_WAIT, 15);
  assert.equal(clampQueueWait(undefined), 15);
  assert.equal(clampQueueWait('abc'), 15);
  assert.equal(clampQueueWait(3), 10);
  assert.equal(clampQueueWait(45), 45);
  assert.equal(clampQueueWait(500), 120);
});

test('Immer genau 20 Spieler (1..20 Menschen, Rest Bots)', () => {
  assert.equal(MATCH_SIZE, 20);
  const rng = new RNG(5);
  for (let h = 1; h <= 22; h++) {
    const humans = Array.from({ length: h }, (_, i) => ({ id: 'h' + i, name: 'Mensch' + i }));
    const players = Simulation.fillWithBots(humans, rng, h % 2 ? { name: 'Kronen Bot', outfit: 'pirate', color: 1, streak: 2 } : null);
    assert.equal(players.length, MATCH_SIZE);
    assert.equal(players.filter((p) => !p.isBot).length, Math.min(h, 20));
    assert.equal(new Set(players.map((p) => p.id)).size, 20);
  }
});

test('Duo-Teams: Party-Partner zusammen, Einzelspieler miteinander, Rest Bots – 10 Zweierteams', () => {
  const rng = new RNG(8);
  const humans = [
    { id: 'a', name: 'Anna', party: 'p1' }, { id: 'b', name: 'Ben', party: 'p1' },
    { id: 'c', name: 'Cem' }, { id: 'd', name: 'Dora' }, { id: 'e', name: 'Emil' },
  ];
  const players = Simulation.fillWithBots(humans, rng, null, 'duo');
  const team = (id) => players.find((p) => p.id === id).team;
  assert.equal(team('a'), team('b'), 'Party zusammen');
  assert.equal(team('c'), team('d'), 'Einzelspieler zusammen');
  assert.ok(players.find((p) => p.team === team('e') && p.id !== 'e').isBot, 'Rest mit Bot');
  const sizes = new Map();
  for (const p of players) sizes.set(p.team, (sizes.get(p.team) || 0) + 1);
  assert.equal(sizes.size, 10);
  assert.ok([...sizes.values()].every((n) => n === 2));
});

test('Duo: kein Eigenbeschuss, Niederschlagen, Wiederbeleben, Team-Aus und Team-Sieg', () => {
  const players = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: 'P' + id, team: i < 2 ? 0 : 1 }));
  const sim = new Simulation(world, { seed: 3, players, storm: false, mode: 'duo' });
  playing(sim);
  const [a, b, c, d] = sim.players;
  assert.ok(Math.hypot(a.body.x - b.body.x, a.body.z - b.body.z) < 6, 'Partner starten zusammen');
  sim.applyDamage(b, 60, 'a', 'b', null, 'ar');
  assert.equal(b.overshield + b.health, 150, 'kein Eigenbeschuss');
  // a wird niedergeschlagen (b steht noch)
  sim.applyDamage(a, 500, 'c', 'b', null, 'ar');
  assert.ok(a.alive && a.knocked, 'niedergeschlagen statt eliminiert');
  assert.equal(sim.humanFire(a.id, { s: 0, ox: a.body.x, oy: a.body.y + 1, oz: a.body.z, dirs: [{ x: 0, y: 0, z: -1 }] }), false, 'am Boden kein Schießen');
  // b belebt a wieder
  b.body.x = a.body.x + 1; b.body.z = a.body.z; b.body.y = a.body.y;
  assert.ok(sim.humanRevive(b.id, a.id));
  for (let t = 0; t < 5.2; t += SIM_DT) sim.step(SIM_DT);
  assert.ok(!a.knocked && a.health === 30, 'wiederbelebt mit 30 Leben');
  // ausbluten: c niederschlagen, d eliminieren → c scheidet sofort mit aus (Team raus, Platz 2)
  sim.applyDamage(c, 500, 'a', 'b', null, 'ar');
  assert.ok(c.knocked);
  sim.applyDamage(d, 500, 'b', 'b', null, 'ar');
  assert.ok(!c.alive && !d.alive, 'ganzes Team ausgeschieden');
  assert.equal(c.placement, 2);
  assert.equal(d.placement, 2);
  assert.equal(sim.phase, 'ended');
  assert.equal(sim.stats(a).placement, 1);
  assert.equal(sim.stats(b).placement, 1);
});

test('Karte Frostfeste: Schneeinsel im Meer (+25 % Fläche), Feste, Gipfel, Eis, alles erreichbar, deterministisch', () => {
  const hash = (m) => {
    let h = 0;
    for (const c of m.collision.cols) h = (h * 31 + Math.round((c.x + c.z) * 100)) | 0;
    return [m.collision.cols.length, h, m.props.length, m.parts.length, m.chests.length];
  };
  assert.deepEqual(MAPS.map((m) => m.name), ['Frostfeste']);
  for (let i = 0; i < 20; i++) assert.equal(randomMapId(Math.random, 'frostfeste'), 'frostfeste');
  const m = generateMap('frostfeste');
  assert.deepEqual(hash(m), hash(generateMap('frostfeste')), 'deterministisch (Server = Client)');
  const names = m.pois.filter((p) => p.name).map((p) => p.name);
  for (const n of ['Frostfeste', 'Frosttal', 'Eishafen', 'Spiegelsee', 'Gletscherstation']) assert.ok(names.includes(n), 'Ort ' + n);
  assert.ok(m.chests.length >= 50, `Truhen ${m.chests.length}`);
  assert.ok(m.floorLoot.length >= 60, `Bodenbeute ${m.floorLoot.length}`);
  // rundherum Meer, innen Land; 25 % mehr Fläche als die alten Inseln (Radius 142)
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) assert.ok(m.terrain.heightAt(Math.cos(a) * 208, Math.sin(a) * 208) < -1, 'Meer bei 208 m');
  let land = 0;
  for (let x = -120; x <= 120; x += 10) for (let z = -120; z <= 120; z += 10) if (m.terrain.heightAt(x, z) > 0.3) land++;
  assert.ok(land > 480, `Land ${land}`);
  assert.ok(Math.abs((PLAY_RADIUS * PLAY_RADIUS) / (142 * 142) - 1.25) < 0.02);
  // Hornspitze hinter der Feste, Terrasse, Schnee überall, Eis auf See/Fluss und an den Kanten
  assert.ok(m.terrain.heightAt(4, -122) > 60, 'Gipfel');
  assert.ok(Math.abs(m.terrain.heightAt(0, -50) - 17) < 0.1, 'Terrasse');
  const cnt = {};
  for (const sf of m.terrain.surf) cnt[sf] = (cnt[sf] || 0) + 1;
  assert.ok(cnt[SURF.SNOW] > cnt[SURF.ROCK] && cnt[SURF.ICE] > 1000 && cnt[SURF.GLACIER] > 200, JSON.stringify(cnt));
  assert.equal(m.terrain.surfaceAt(-84, 40), SURF.ICE, 'Spiegelsee gefroren');
  assert.ok(m.props.some((p) => PROP_TYPES[p.t] === 'snowpine') && m.props.some((p) => PROP_TYPES[p.t] === 'icechunk'));
  // Alles zu Fuß erreichbar (auch für Bots): Platz, Freitreppe, Terrasse, Halle, Dorf, Hafen, See, Station
  const nav = new NavGrid(m.terrain, m.collision);
  const region = (x, z) => nav.region[nav.nearestFree(x, z, 3)];
  const r0 = region(0, 40);
  for (const [x, z, n] of [[4, -14, 'Platz'], [0, -31, 'Freitreppe'], [0, -39.5, 'Vorplatz'], [0, -48, 'Halle'], [-25, -45, 'Terrasse W'], [25, -45, 'Terrasse O'],
    [2, 90, 'Frosttal'], [93, 80, 'Eishafen'], [-84, 40, 'Spiegelsee'], [80, -6, 'Station']]) assert.equal(region(x, z), r0, n + ' erreichbar');
  assert.ok(nav.findPath(0, 40, 0, -48, 40000), 'Weg vom Süden bis in die Halle');
  // Startpunkte gleichmäßig über die ganze Insel: weit auseinander, in allen vier Vierteln
  for (const seed of [1, 2, 3]) {
    const players = Simulation.fillWithBots([], new RNG(seed), null, 'solo');
    const sim = new Simulation({ terrain: m.terrain, collision: m.collision, nav, pois: m.pois, chests: m.chests, floorLoot: m.floorLoot }, { seed, players });
    const sp = sim.players.map((p) => p.body);
    let minD = Infinity;
    for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) minD = Math.min(minD, Math.hypot(sp[i].x - sp[j].x, sp[i].z - sp[j].z));
    assert.ok(minD > 35, `Startabstand ${minD.toFixed(1)} m`);
    const quad = [0, 0, 0, 0];
    for (const b of sp) quad[(b.x > 0 ? 1 : 0) + (b.z > 0 ? 2 : 0)]++;
    assert.ok(quad.every((q) => q >= 3), 'Viertel ' + quad.join(','));
  }
});

test('Komplettes Bot-Match: Sieger, Plätze 1..20, Truhen geöffnet, Beute, Heilung, Siphon', () => {
  const r = runHeadlessMatch({ seed: 4242 });
  assert.equal(r.playerCount, 20);
  assert.ok(r.winner, 'Kein Sieger');
  const places = r.sim.players.map((p) => p.placement).sort((a, b) => a - b);
  assert.deepEqual(places, Array.from({ length: 20 }, (_, i) => i + 1));
  assert.ok(r.stats.chests > 3, 'Bots öffnen keine Truhen');
  assert.ok(r.stats.pickups > 5, 'Bots heben nichts auf');
  assert.ok(r.stats.siphons > 0, 'kein Siphon');
  assert.ok(r.stuckMax < 8, 'Bots stecken fest');
  console.log(`    Sieger: ${r.winner.name} nach ${r.sim.matchTime.toFixed(0)} s · Truhen ${r.stats.chests} · Aufgehoben ${r.stats.pickups} · Heilungen ${r.stats.heals} · Waffen ${JSON.stringify(r.stats.weapons)}`);
});

test('Duo-Bot-Match: 10 Teams, Plätze pro Team, Siegerteam auf Platz 1', () => {
  const r = runHeadlessMatch({ seed: 777, mode: 'duo' });
  assert.ok(r.winner, 'Kein Sieger');
  const byTeam = new Map();
  for (const p of r.sim.players) {
    if (!byTeam.has(p.team)) byTeam.set(p.team, new Set());
    byTeam.get(p.team).add(p.placement);
  }
  assert.equal(byTeam.size, 10);
  for (const set of byTeam.values()) assert.equal(set.size, 1, 'Team hat eine gemeinsame Platzierung');
  const places = [...byTeam.values()].map((set) => [...set][0]).sort((a, b) => a - b);
  assert.deepEqual(places, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(r.stats.knocks > 0, 'niemand wurde niedergeschlagen');
  console.log(`    Duo-Sieger: Team von ${r.winner.name} nach ${r.sim.matchTime.toFixed(0)} s · Niedergeschlagen ${r.stats.knocks} · Wiederbelebt ${r.stats.revives}`);
});

test('Leuchtfeuer: Host meldet seine Tunnel-Adresse, beim Beenden „offline“', async () => {
  const { Beacon } = await import('../server/beacon.js');
  const { EventEmitter } = await import('events');
  const sent = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, o) => { sent.push([url, o.body]); return { ok: true }; };
  try {
    const tunnel = new EventEmitter();
    const b = new Beacon(tunnel, () => {});
    tunnel.emit('change', { state: 'online', url: 'https://abc-def.trycloudflare.com' });
    tunnel.emit('change', { state: 'online', url: 'https://abc-def.trycloudflare.com' });
    tunnel.emit('change', { state: 'idle', url: null });
    await new Promise((r) => setTimeout(r, 20));
    b.stop();
    assert.deepEqual(sent.map((x) => x[1]), ['https://abc-def.trycloudflare.com', 'offline']);
    assert.ok(sent[0][0].startsWith('https://ntfy.sh/'));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Alle JavaScript-Dateien sind syntaktisch korrekt (Client, Server, Shared)', () => {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) files.push(p);
    }
  };
  for (const d of ['client/src', 'shared', 'server']) walk(path.join(ROOT, d));
  const bad = [];
  for (const f of files) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { bad.push(path.relative(ROOT, f) + ': ' + String(e.stderr).split('\n').slice(0, 5).join(' ')); }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
  assert.ok(files.length > 40);
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

// asynchrone Tests abwarten, dann Server-Integrationstest
await Promise.all(asyncTests);
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
