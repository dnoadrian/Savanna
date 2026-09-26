// Die Karten: je ein Ort aus Fortnite Chapter 2 Season 2 als eigene Insel im Meer.
// Jede Runde wird eine davon zufällig ausgewählt. Aufbau nach dem Vorbild der Originalkarte,
// alles aus dem Baukasten (structures.js) gebaut.
import { SURF } from './terrain.js';
import { C } from './builder.js';
import { MAT } from '../physics/collision.js';
import {
  chest, floorLoot, sign, house2, house1, shop, gasStation, warehouse, container, barn, silo, waterBall, gazebo,
  soccer, hedge, picket, streetlight, bench, dock, bridge, lifeguard, greenhouse, church, block, cabin, tent,
  trailer, crane, coolingTower, tank, smokestack, windmill, cargoShip, yacht, oilRig, sharkRock, grottoBase, pipe, deck, posts,
} from './structures.js';
import { buildLighthouse, buildWatchtower, buildHut } from './pois.js';

const TAU = Math.PI * 2;
const HOUSE_COLORS = [
  [C.WALL_BLUE, C.ROOF_GREY], [C.WALL_YELLOW, C.ROOF_RED], [C.WALL_WHITE, C.ROOF_BLUE], [C.WALL_GREEN, C.ROOF_BROWN],
  [C.WALL_PINK, C.ROOF_GREY], [C.WALL_CREAM, C.ROOF_GREEN], [C.WALL_ORANGE, C.ROOF_DARK], [C.WALL_GREY, C.ROOF_RED],
];
// Blickrichtung (Vorderseite +Z) zum Punkt (tx, tz)
const face = (x, z, tx = 0, tz = 0) => Math.atan2(tx - x, tz - z);
const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
const ring = (r, n = 28, a0 = 0) => Array.from({ length: n + 1 }, (_, k) => polar(a0 + (k / n) * TAU, r));

// Ortsschild am Ortseingang
function townSign(P, x, z, name, rot) {
  P.build(x, z, rot, (B, out) => {
    for (const lx of [-2.3, 2.3]) B.cyl(lx, 0, 0, 0.12, 2.8, C.WOOD_DARK, { seg: 6 });
    B.box(0, 1.6, 0, 5.4, 1.3, 0.2, C.GREEN, { col: false });
    sign(out, B, 0, 2.25, 0.12, 5.0, 1.1, name.toUpperCase(), 0, '#2f7d3a', '#ffffff');
  });
}

// Häuser im Kreis um die Ortsmitte (Vorderseite zur Mitte), mit Zaun und Auto
function houseRing(P, n, r, a0, opts = {}) {
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * TAU;
    if (opts.skip && opts.skip.some((s) => Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))) < 0.22)) continue;
    const [x, z] = polar(a, r);
    const [wall, roof] = HOUSE_COLORS[(k + (opts.c0 ?? 0)) % HOUSE_COLORS.length];
    const two = opts.two ?? k % 3 !== 2;
    P.build(x, z, face(x, z), (B, out, ctx) => {
      if (two) house2(B, out, { w: 10 + (k % 2), d: 9.5, wall, roof, chest2: k % 4 === 0 });
      else house1(B, out, { w: 8.5, d: 7.5, wall, roof });
      if (opts.fence !== false) {
        picket(B, -7, 8.2, -2.2, 8.2);
        picket(B, 2.2, 8.2, 7, 8.2);
      }
      if (k % 2 === 0) ctx.prop('car', B.wx(7.6, 3), B.wz(7.6, 3), B.rot + Math.PI / 2, 1, k % 3);
    });
  }
}

// Landschaft außerhalb des Orts: kleine Gehöfte, Hütten, Türme (mit Truhen) auf Ring-Positionen
const SAT = {
  cabin: (B, out) => cabin(B, out, {}),
  house: (B, out) => house1(B, out, { wall: C.WALL_CREAM, roof: C.ROOF_BROWN }),
  house2: (B, out) => house2(B, out, { wall: C.WALL_WHITE, roof: C.ROOF_GREY, porch: false }),
  tower: (B, out) => buildWatchtower(B, out, 6),
  shed: (B, out) => {
    B.box(0, 0, 0, 5, 0.15, 4, C.PLANK, { m: MAT.WOOD });
    B.wall(-2.5, 2, 2.5, 2, 2.6, 0.25, C.WOOD, [{ at: 2.5, w: 1.6, y0: 0, y1: 2.2 }]);
    B.wall(2.5, -2, -2.5, -2, 3.0, 0.25, C.WOOD);
    B.wall(-2.5, -2, -2.5, 2, 2.6, 0.25, C.WOOD);
    B.wall(2.5, 2, 2.5, -2, 2.6, 0.25, C.WOOD);
    B.tinRoof(0, 2.8, 0, 5.6, 4.6, 0.5);
    chest(out, B, 0, 0.15, -1.2, 0);
  },
  camp: (B, out) => {
    tent(B, -2.5, 0, 0.3, C.CLOTH_GREEN);
    tent(B, 2.8, -1.2, -0.4, C.ORANGE);
    B.cyl(0, 0, 2.5, 0.6, 0.25, C.STONE, { seg: 8, col: false });
    B.box(0, 0.25, 2.5, 0.8, 0.4, 0.15, C.FIRE, { col: false, e: 1 });
    B.box(0, 0, 4.2, 2, 0.45, 0.5, C.WOOD_DARK, { col: false });
    chest(out, B, 0.5, 0, -2.5, 0);
  },
  barn: (B, out) => barn(B, out, { w: 11, d: 14 }),
  gas: (B, out) => gasStation(B, out, {}),
  shop: (B, out) => shop(B, out, { sign: 'SHOP', w: 10, d: 8 }),
  bunker: (B, out) => {
    B.box(0, -0.4, 0, 7, 2.6, 6, C.CONCRETE_DARK, { m: MAT.STONE });
    B.box(0, 2.2, 3.05, 7.2, 0.4, 0.2, C.CONCRETE, { col: false });
    B.box(0, 0, 3.4, 2.2, 0.15, 1.2, C.CONCRETE, { m: MAT.STONE });
    B.blocker(0, 2.2, 0, 7, 0.4, 6);
    chest(out, B, 2.3, 2.2, -1.5, 0);
    floorLoot(out, B, -2, 2.2, 1);
  },
};
const SAT_SIZE = { cabin: 7, house: 8, house2: 9, tower: 5, shed: 5, camp: 7, barn: 12, gas: 13, shop: 9, bunker: 6 };
function countryside(P, spots) {
  for (const [deg, r, type] of spots) {
    const a = (deg / 180) * Math.PI;
    const [x, z] = polar(a, r);
    P.flat(x, z, SAT_SIZE[type], null, 7);
    P.keep(x, z, SAT_SIZE[type] + 3);
    P.build(x, z, face(x, z), SAT[type]);
    P.pois.push({ id: 'sat' + P.pois.length, name: '', x, z, r: SAT_SIZE[type] + 6, minor: true });
  }
}

// Straße vom Ort zur Küste (Richtung deg)
function spoke(P, deg, r0, r1, w = 7, surf = SURF.ROAD) {
  const a = (deg / 180) * Math.PI;
  P.road([polar(a, r0), polar(a + 0.05, (r0 + r1) / 2), polar(a, r1)], w, surf);
}

// ===========================================================================
// Pleasant Park: Vorstadt rund um den Park mit Fußballfeld und Pavillon
function pleasantPark(P) {
  P.poi('Pleasant Park', 0, 0, 64);
  P.flat(0, 0, 68, 2.0, 24);
  P.paintCircle(0, 0, 23, SURF.GRASS);
  P.road(ring(30, 32), 7);
  for (const d of [0, 90, 180, 270]) spoke(P, d, 30, 128);
  P.build(0, 0, 0, (B, out) => soccer(B, out, 17, 28));
  P.build(-15, 10, 0.4, (B, out) => gazebo(B, out, 3.2));
  P.build(15, -12, 0, (B) => { bench(B, 0, 0, 0); bench(B, 3, 0, 0); });
  houseRing(P, 8, 47, TAU / 16, { c0: 0 });
  houseRing(P, 8, 63, TAU / 16 + TAU / 32, { c0: 3, two: false, skip: [0, Math.PI / 2, Math.PI, -Math.PI / 2] });
  for (let k = 0; k < 12; k++) {
    const [x, z] = polar((k / 12) * TAU + 0.26, 35);
    P.build(x, z, face(x, z), (B) => streetlight(B, 0, 0));
  }
  P.flat(74, -70, 14, null, 8);
  P.build(74, -70, face(74, -70), (B, out) => gasStation(B, out, { sign: 'PLEASANT GAS' }));
  townSign(P, 6, -84, 'Pleasant Park', 0);
  townSign(P, 84, 6, 'Pleasant Park', -Math.PI / 2);
  P.forest(-95, 60, 32, 0.9);
  countryside(P, [[35, 112, 'cabin'], [125, 108, 'barn'], [160, 112, 'tower'], [212, 110, 'house'], [250, 118, 'camp'], [300, 108, 'shed'], [330, 115, 'house2']]);
}

// Steamy Stacks: Kraftwerk mit zwei riesigen Kühltürmen
function steamyStacks(P) {
  P.poi('Steamy Stacks', 0, 0, 66);
  P.flat(0, 0, 70, 2.2, 22);
  P.paintCircle(0, 0, 60, SURF.PLAZA);
  spoke(P, 90, 55, 130);
  spoke(P, 200, 55, 128);
  P.build(-30, -24, 0, (B, out) => coolingTower(B, out, 13, 36));
  P.build(24, -34, 0, (B, out) => coolingTower(B, out, 12, 33));
  P.build(0, 22, Math.PI, (B, out) => warehouse(B, out, { w: 30, d: 18, h: 9, wall: C.WALL_GREY, c1: C.ORANGE, c2: C.BLUE }));
  P.build(40, 20, -Math.PI / 2, (B, out) => warehouse(B, out, { w: 18, d: 14, h: 7, wall: C.BRICK }));
  P.build(-42, 22, Math.PI / 2, (B, out) => block(B, out, { w: 14, d: 11, floors: 2, wall: C.WALL_PURPLE, trim: C.CONCRETE_DARK, sign: 'STEAMY STACKS', signBg: '#5a3d8a' }));
  P.build(0, -6, 0, (B, out) => {
    smokestack(B, out, 4, -2, 28, 1.6);
    smokestack(B, out, -4, -3, 24, 1.3);
    for (const [x, z] of [[-8, 4], [8, 5]]) tank(B, x, z, 2.6, 6, C.STEEL);
    pipe(B, -8, 5, 4, 8, 5, 5, 0.4, C.WALL_PURPLE);
    pipe(B, 0, 5, 4.5, 0, 5, 15, 0.45, C.STEEL, false);
    chest(out, B, 0, 0, 3, 0);
  });
  P.build(44, -8, 0, (B, out) => {
    for (const [x, z] of [[-5, -4], [0, 3], [5, -4]]) tank(B, x, z, 3, 8, C.WALL_WHITE);
    pipe(B, -5, 7, -4, 5, 7, -4, 0.35, C.STEEL);
    floorLoot(out, B, 0, 0, -2);
  });
  P.build(-10, 46, 0, (B, out, ctx) => {
    const cols = [C.RED, C.BLUE, C.GREEN, C.ORANGE];
    for (let k = 0; k < 4; k++) container(B, k * 3.2 - 5, 0, Math.PI / 2, cols[k], k === 1);
    container(B, -1.8, 0, Math.PI / 2, C.TEAL, false, 2.6);
    for (let k = 0; k < 3; k++) ctx.prop('car', B.wx(14 + k * 3, 2), B.wz(14 + k * 3, 2), Math.PI / 2, 1, k);
    chest(out, B, 3.3, 0, 0, 0);
  });
  // Laufsteg zwischen den Hallen
  P.build(-22, 20, 0, (B) => {
    B.box(0, 4.5, 0, 10, 0.25, 2.4, C.STEEL_DARK, { m: MAT.METAL });
    B.railing(-5, 1.1, 5, 1.1, 4.75, 1.0, C.STEEL);
    B.railing(-5, -1.1, 5, -1.1, 4.75, 1.0, C.STEEL);
    for (const x of [-4.6, 4.6]) B.cyl(x, 0, 0, 0.2, 4.5, C.STEEL, { seg: 6 });
  });
  for (let k = 0; k < 8; k++) {
    const [x, z] = polar((k / 8) * TAU + 0.2, 58);
    P.build(x, z, face(x, z), (B) => streetlight(B, 0, 0));
  }
  townSign(P, 8, 86, 'Steamy Stacks', Math.PI);
  P.forest(80, 70, 30, 0.9);
  P.forest(-90, -60, 28, 0.8);
  countryside(P, [[20, 110, 'house'], [60, 118, 'shed'], [140, 112, 'cabin'], [170, 105, 'tower'], [235, 112, 'house2'], [280, 110, 'camp'], [320, 118, 'bunker']]);
}


// kleine Deko-Bausteine
function umbrella(B, lx, lz, c) {
  B.cyl(lx, 0, lz, 0.05, 2.3, C.WALL_WHITE, { seg: 5, col: false });
  B.cyl(lx, 2.0, lz, 1.5, 0.5, c, { rt: 0.08, seg: 8, col: false });
  B.box(lx + 0.9, 0.02, lz + 0.4, 0.9, 0.03, 1.9, [C.YELLOW, C.RED, C.BLUE][Math.abs(Math.round(lx)) % 3], { col: false });
}
function fountain(B, out) {
  B.cyl(0, 0, 0, 3.4, 0.7, C.STONE, { seg: 12, m: MAT.STONE });
  B.cyl(0, 0.68, 0, 3.0, 0.04, C.POOL, { seg: 12, col: false });
  B.cyl(0, 0.7, 0, 0.5, 1.6, C.STONE, { seg: 8 });
  B.cyl(0, 2.2, 0, 1.2, 0.35, C.STONE, { rt: 0.6, seg: 10, col: false });
  B.cyl(0, 2.5, 0, 0.9, 0.05, C.POOL, { seg: 10, col: false });
  floorLoot(out, B, 4, 0, 0);
}
function tractor(B, lx, lz, ry = 0) {
  const S = B.sub(lx, lz, ry);
  S.box(0, 0.6, 0.4, 1.6, 1.0, 2.6, C.RED, { m: MAT.METAL });
  S.box(0, 1.6, -0.6, 1.5, 1.4, 1.3, C.RED, { m: MAT.METAL });
  S.box(0, 1.9, -0.6, 1.55, 0.8, 1.35, 0x2c3e50, { col: false });
  for (const x of [-0.95, 0.95]) {
    S.cyl(x, 0.85, -0.7, 0.85, 0.45, C.TIRE, { rz: Math.PI / 2, center: true, seg: 10, col: false });
    S.cyl(x, 0.5, 1.2, 0.5, 0.35, C.TIRE, { rz: Math.PI / 2, center: true, seg: 8, col: false });
  }
  S.cyl(0.4, 2.1, 1.1, 0.08, 1.0, C.STEEL_DARK, { seg: 5, col: false });
}
function bleachers(B, w = 14, rows = 4) {
  for (let r = 0; r < rows; r++) B.box(0, 0, -r * 0.8, w, 0.45 * (r + 1), 0.8, r % 2 ? C.BLUE : C.WALL_WHITE, { m: MAT.METAL });
  B.box(0, 0.45 * rows, -(rows - 1) * 0.8 - 0.5, w, 1.1, 0.12, C.STEEL_DARK, { col: false });
}
// Feld mit Zaun (Rechteck, Drehung ry)
function field(P, x, z, w, d, ry = 0) {
  P.paintRect(x, z, w, d, ry, SURF.FIELD);
  P.keep(x, z, Math.min(w, d) / 2);
  P.build(x, z, ry, (B) => {
    B.fence(-w / 2, -d / 2, w / 2, -d / 2, C.BOARD);
    B.fence(-w / 2, d / 2, -4, d / 2, C.BOARD);
    B.fence(4, d / 2, w / 2, d / 2, C.BOARD);
    B.fence(-w / 2, -d / 2, -w / 2, d / 2, C.BOARD);
  });
}

// ===========================================================================
// Salty Springs: kleiner Ort auf einem Hügel rund um eine Kreuzung
function saltySprings(P) {
  P.poi('Salty Springs', 0, 0, 56);
  P.hill(0, 0, 80, 3.5);
  P.flat(0, 0, 52, null, 20);
  P.road([[-140, 0], [-40, 2], [0, 0], [40, -2], [140, 0]], 7);
  P.road([[0, -140], [2, -40], [0, 0], [-2, 40], [0, 140]], 7);
  P.build(22, -22, face(22, -22), (B, out) => block(B, out, { w: 12, d: 11, floors: 3, fh: 3.2, wall: C.WALL_CREAM, roof: 'gable', roofColor: C.ROOF_BLUE, trim: C.WOOD_DARK }));
  P.build(-22, -22, face(-22, -22), (B, out) => house2(B, out, { wall: C.WALL_YELLOW, roof: C.ROOF_RED, chest2: true }));
  P.build(-22, 22, face(-22, 22), (B, out) => house2(B, out, { wall: C.WALL_BLUE, roof: C.ROOF_GREY }));
  P.build(22, 22, face(22, 22), (B, out) => shop(B, out, { w: 12, d: 10, sign: 'SALTY', signBg: '#d0493a', wall: C.WALL_WHITE }));
  P.build(-44, -10, face(-44, -10, -44, 0), (B, out) => house1(B, out, { wall: C.WALL_GREEN, roof: C.ROOF_BROWN }));
  P.build(44, 10, face(44, 10, 44, 0), (B, out) => house1(B, out, { wall: C.WALL_PINK, roof: C.ROOF_GREY }));
  P.build(10, -44, face(10, -44, 0, -44), (B, out) => house2(B, out, { wall: C.WALL_GREY, roof: C.ROOF_RED, porch: false }));
  P.build(-10, 44, face(-10, 44, 0, 44), (B, out) => house1(B, out, { wall: C.WALL_CREAM, roof: C.ROOF_GREEN }));
  P.build(-40, 36, 0, (B) => waterBall(B, 0, 0, 13, C.WALL_WHITE));
  for (const [x, z] of [[8, 8], [-8, -8], [8, -8], [-8, 8], [30, 6], [-30, -6], [6, -30], [-6, 30]]) P.build(x, z, face(x, z), (B) => streetlight(B, 0, 0));
  P.flat(70, -22, 13, null, 8);
  P.build(70, -22, face(70, -22, 70, 0), (B, out) => gasStation(B, out, { sign: 'SALTY GAS' }));
  P.build(-18, 9, 0, (B, out, ctx) => { ctx.prop('car', B.wx(0, 0), B.wz(0, 0), 0.1, 1, 0); ctx.prop('car', B.wx(26, -18), B.wz(26, -18), 1.6, 1, 1); });
  townSign(P, 6, -60, 'Salty Springs', 0);
  townSign(P, -60, -6, 'Salty Springs', Math.PI / 2);
  P.forest(-80, -80, 30, 1);
  P.forest(90, 70, 26, 0.9);
  countryside(P, [[30, 112, 'barn'], [70, 118, 'house'], [150, 110, 'cabin'], [200, 115, 'tower'], [245, 110, 'shed'], [300, 118, 'camp'], [330, 105, 'house2']]);
}

// Sweaty Sands: Strandort mit Hotel, Strandhäusern, Promenade, Seebrücke und Rettungstürmen
function sweatySands(P) {
  P.poi('Sweaty Sands', 0, -95, 60);
  P.flatRect(0, -92, 170, 58, 0, 1.6, 14);
  P.paintRect(0, -132, 240, 18, 0, SURF.BEACH);
  P.keep(0, -130, 30);
  P.road([[-100, -78], [-40, -80], [40, -80], [100, -78]], 7);
  P.road([[0, -80], [4, -20], [0, 60], [-4, 140]], 7);
  // Promenade
  P.build(0, -121, 0, (B) => {
    deck(B, 0, 0, 150, 4, 0.35, 'z');
    for (let x = -70; x <= 70; x += 14) streetlight(B, x, -1.6, 0);
  });
  P.build(-48, -100, Math.PI, (B, out) => block(B, out, { w: 18, d: 12, floors: 4, fh: 3.3, wall: C.WALL_PINK, trim: C.WALL_WHITE, sign: 'HOTEL', signBg: '#e35d8f', balcony: true }));
  const beach = [[C.WALL_TEAL, C.ROOF_BLUE], [C.WALL_YELLOW, C.ROOF_RED], [C.WALL_WHITE, C.ROOF_BLUE], [C.WALL_PINK, C.ROOF_GREY]];
  beach.forEach(([wall, roof], k) => P.build(-12 + k * 22, -102, Math.PI, (B, out) => house2(B, out, { wall, roof, chest2: k % 2 === 0 })));
  ['SURF SHOP', 'ICE CREAM', 'TACOS'].forEach((name, k) => P.build(-40 + k * 26, -64, Math.PI, (B, out) => shop(B, out, { w: 11, d: 9, sign: name, signBg: ['#1f8fd6', '#f07ab0', '#f2a23a'][k], wall: [C.WALL_WHITE, C.WALL_CREAM, C.WALL_ORANGE][k] })));
  P.build(54, -64, Math.PI, (B, out) => house1(B, out, { wall: C.WALL_BLUE, roof: C.ROOF_GREY }));
  // Seebrücke ins Meer + Rettungstürme + Sonnenschirme
  P.build(24, -134, Math.PI, (B, out) => dock(B, out, 18, 3.4, 0.55, true), 0);
  for (const x of [-60, -12, 46]) P.build(x, -136, 0, (B, out) => lifeguard(B, out, C.RED));
  P.build(0, -128, 0, (B) => { for (let k = 0; k < 8; k++) umbrella(B, -80 + k * 22 + (k % 2) * 5, (k % 3) * 2 - 2, [C.RED, C.YELLOW, C.BLUE, C.GREEN][k % 4]); });
  townSign(P, 8, -44, 'Sweaty Sands', Math.PI);
  P.forest(-70, 60, 34, 1);
  P.forest(70, 70, 30, 0.9);
  countryside(P, [[10, 110, 'house'], [40, 118, 'shed'], [80, 112, 'camp'], [110, 115, 'cabin'], [150, 110, 'tower'], [190, 118, 'bunker']]);
}

// Frenzy Farm: Scheune, Silos, Bauernhaus, Windrad, Felder und eine Rennstrecke
function frenzyFarm(P) {
  P.poi('Frenzy Farm', 0, 0, 55);
  P.flat(0, 0, 46, null, 18);
  P.paintCircle(0, 0, 30, SURF.PATH);
  P.build(-20, -6, face(-20, -6), (B, out) => barn(B, out, {}));
  P.build(-38, -24, 0, (B) => silo(B, 0, 0, 2.8, 13, C.WALL_GREY));
  P.build(-40, -12, 0, (B) => silo(B, 0, 0, 2.4, 11, C.WALL_WHITE));
  P.build(22, -16, face(22, -16), (B, out) => house2(B, out, { wall: C.WALL_WHITE, roof: C.ROOF_RED, trim: C.WALL_RED }));
  P.build(26, 22, 0, (B) => windmill(B, 'frenzy-mill', 0, 0, 13));
  P.build(4, 26, face(4, 26), SAT.shed);
  P.build(6, 4, 0.6, (B) => tractor(B, 0, 0, 0));
  for (const [x, z] of [[-8, -20], [-6, -18.4], [-9, -17], [12, 10], [13.6, 11.2]]) P.prop('hay', x, z, x * 0.3, 1, 0);
  field(P, 70, 45, 56, 42, 0.1);
  field(P, -68, 52, 42, 52, -0.15);
  field(P, 58, -62, 50, 36, 0.2);
  field(P, -60, -70, 40, 40, 0);
  for (const d of [0, 120, 240]) spoke(P, d, 30, 128, 5, SURF.PATH);
  // Rennstrecke im Norden
  P.flat(-18, -92, 28, null, 10);
  P.road(ring(22, 24).map(([x, z]) => [x - 18, z * 0.8 - 92]), 6, SURF.DIRT);
  P.build(-18, -92, 0, (B) => bleachers(B.sub(0, 26, Math.PI), 16, 4));
  P.build(-4, -92, 0, (B, out) => { chest(out, B, 0, 0, 0, 0); floorLoot(out, B, -26, 0, 0); });
  townSign(P, 34, 4, 'Frenzy Farm', -Math.PI / 2);
  P.forest(95, -20, 26, 0.8);
  countryside(P, [[60, 112, 'house'], [100, 110, 'cabin'], [140, 116, 'tower'], [200, 112, 'house2'], [300, 115, 'shed']]);
}

// Holly Hedges: Gärtnerei mit Gewächshäusern, Heckenlabyrinth, Häuser mit Hecken
function hollyHedges(P) {
  P.poi('Holly Hedges', 0, 0, 58);
  P.flat(0, 0, 60, null, 20);
  P.paintRect(4, 0, 64, 50, 0, SURF.PLAZA);
  P.road([[-140, 30], [-40, 30], [0, 34], [60, 30], [140, 28]], 7);
  P.road([[0, 34], [0, 140]], 7);
  P.build(20, 2, -Math.PI / 2, (B, out) => shop(B, out, { w: 16, d: 12, sign: 'HOLLY HEDGES', signBg: '#2f8a4a', wall: C.WALL_WHITE, awning: C.GREEN }));
  P.build(-14, -12, 0, (B, out) => greenhouse(B, out, 10, 16));
  P.build(-14, 12, 0, (B, out) => greenhouse(B, out, 10, 14));
  // Pflanztische + Töpfe
  P.build(4, -18, 0, (B, out) => {
    for (let k = 0; k < 4; k++) {
      B.box(k * 3 - 4.5, 0, 0, 2.2, 0.8, 1.2, C.WOOD_DARK, { m: MAT.WOOD });
      for (let q = 0; q < 3; q++) B.sph(k * 3 - 5.2 + q * 0.7, 1.05, 0, 0.3, [C.LEAF, 0xf25c78, 0xffd23f][q], { col: false });
    }
    floorLoot(out, B, 0, 0, 2);
  });
  // Heckenlabyrinth
  P.build(44, -40, 0.1, (B, out) => {
    const H = [[-15, -15, 15, -15], [-15, 15, 15, 15], [-15, -15, -15, 9], [15, -9, 15, 15], [-9, -9, 9, -9], [-9, -9, -9, 9], [9, -3, 9, 9], [-3, 3, 9, 3], [-3, -3, -3, 3], [3, 9, 3, 15]];
    for (const [x1, z1, x2, z2] of H) hedge(B, x1, z1, x2, z2, 2.2, 1.0);
    chest(out, B, 0, 0, 0, 0);
    floorLoot(out, B, 12, 0, 12);
  });
  // Häuser mit Hecken rundherum
  const homes = [[-52, -38], [-56, 30], [8, -58], [52, 44]];
  homes.forEach(([x, z], k) => {
    const [wall, roof] = HOUSE_COLORS[(k * 3 + 1) % HOUSE_COLORS.length];
    P.build(x, z, face(x, z), (B, out) => {
      if (k % 2) house1(B, out, { wall, roof });
      else house2(B, out, { wall, roof, porch: false });
      hedge(B, -9, -8, 9, -8);
      hedge(B, -9, -8, -9, 9);
      hedge(B, 9, -8, 9, 9);
      hedge(B, -9, 9, -2.2, 9);
      hedge(B, 2.2, 9, 9, 9);
    });
  });
  P.lake(-44, 58, 11, 0.7);
  P.build(-30, 52, face(-30, 52, -44, 58), (B) => { bench(B, 0, 0, 0); bench(B, 3, 0, 0); });
  townSign(P, -60, 36, 'Holly Hedges', Math.PI / 2);
  P.forest(90, -85, 26, 0.9);
  countryside(P, [[20, 118, 'house'], [80, 110, 'cabin'], [130, 112, 'shed'], [175, 116, 'tower'], [220, 110, 'barn'], [290, 118, 'camp']]);
}

// Weeping Woods: dichter Wald mit Lichtung, Lodge, Hütten, Zeltplatz und Ranger-Turm
function weepingWoods(P) {
  P.poi('Weeping Woods', 0, 0, 40);
  P.flat(0, 0, 32, null, 14);
  P.keep(0, 0, 34);
  P.paintCircle(0, 0, 26, SURF.PATH);
  P.forest(0, 0, 128, 1.15);
  P.build(0, -12, 0, (B, out) => block(B, out, { w: 14, d: 10, floors: 2, fh: 3.2, wall: C.WOOD_DARK, trim: C.WOOD, roof: 'gable', roofColor: C.ROOF_GREEN, frame: C.WOOD }));
  const cabins = [[-20, 12], [20, 12], [-58, -22], [52, -40], [-30, 60], [40, 58], [75, 10], [-78, 25], [0, -75]];
  cabins.forEach(([x, z], k) => {
    P.flat(x, z, 7, null, 5);
    P.keep(x, z, 9);
    P.build(x, z, face(x, z), (B, out) => cabin(B, out, { roof: k % 2 ? C.ROOF_BROWN : C.ROOF_GREEN }));
  });
  P.build(12, 24, 0, (B, out) => {
    tent(B, -3, 0, 0.2, C.ORANGE);
    tent(B, 3.5, -1, -0.3, C.CLOTH_BLUE);
    tent(B, 0, 5, 3.1, C.CLOTH_GREEN);
    B.cyl(0, 0, 2.2, 0.6, 0.25, C.STONE, { seg: 8, col: false });
    B.box(0, 0.25, 2.2, 0.7, 0.4, 0.15, C.FIRE, { col: false, e: 1 });
    chest(out, B, -6, 0, 3, 0.8);
  });
  P.keep(12, 26, 10);
  P.flat(-22, 28, 5, null, 4);
  P.keep(-22, 28, 6);
  P.build(-22, 28, 0, (B, out) => buildWatchtower(B, out, 9));
  P.lake(-48, -48, 16, 0.75);
  P.keep(-48, -48, 18);
  P.build(-36, -40, face(-36, -40, -48, -48), (B, out) => dock(B, out, 9, 2.6, 0.3, true));
  P.flat(34, 30, 9, null, 5);
  P.keep(34, 30, 10);
  P.build(34, 30, 0.4, (B, out) => { trailer(B, 0, -2.5, 0, C.WALL_WHITE); trailer(B, 0, 3, 0.1, C.WALL_CREAM); chest(out, B, 4.5, 0, 0.3, 0); });
  for (const d of [30, 150, 270]) spoke(P, d, 26, 125, 4.5, SURF.PATH);
  townSign(P, 22, -16, 'Weeping Woods', -Math.PI / 2);
  countryside(P, [[60, 118, 'house'], [120, 114, 'camp'], [200, 116, 'shed'], [240, 110, 'bunker'], [330, 112, 'house2']]);
}

// Slurpy Swamp: Slurp-Fabrik mit leuchtenden Tanks mitten im Sumpf
function slurpySwamp(P) {
  P.poi('Slurpy Swamp', 0, 0, 50);
  P.flat(0, 0, 48, 1.3, 16);
  P.paintCircle(0, 0, 40, SURF.PLAZA);
  const pools = [[62, 20, 12], [70, -40, 10], [-60, 40, 14], [-72, -20, 9], [20, 78, 11], [-20, -80, 12], [95, 60, 9], [-100, -60, 10], [48, -92, 8], [-40, 95, 10]];
  for (const [x, z, r] of pools) P.lake(x, z, r, 0.55, 1.2, 0.9);
  P.lake(40, 52, 16, 0.7);
  P.build(0, 12, 0, (B, out) => {
    warehouse(B, out, { w: 28, d: 18, h: 9, wall: C.WALL_TEAL, c1: C.GREEN, c2: C.SLURP_DARK });
    sign(out, B, 0, 7.4, 9.25, 9, 2, 'SLURP', 0, '#1f8fb3', '#ffffff');
  });
  P.build(0, -20, 0, (B, out) => {
    for (const x of [-24, -8, 8, 24]) tank(B, x, 0, 3.2, 9, C.SLURP_DARK, true);
    for (const x of [-24, -8, 8, 24]) pipe(B, x, 6, 3.2, x, 6, 20, 0.35, C.SLURP);
    pipe(B, -24, 8.5, 0, 24, 8.5, 0, 0.3, C.STEEL);
    chest(out, B, 0, 0, 0, 0);
    floorLoot(out, B, -16, 0, 4);
  });
  P.build(-34, 22, Math.PI / 2, (B, out) => shop(B, out, { w: 10, d: 8, sign: 'SLURP JUICE', signBg: '#20a8d8', wall: C.WALL_WHITE, awning: C.SLURP_DARK }));
  P.build(30, -8, 0, (B, out, ctx) => {
    container(B, 0, 0, Math.PI / 2, C.SLURP_DARK, true);
    container(B, 3.2, 0, Math.PI / 2, C.WALL_WHITE, false);
    container(B, 1.6, 0, Math.PI / 2, C.TEAL, false, 2.6);
    ctx.prop('car', B.wx(-6, 8), B.wz(-6, 8), 0.3, 1, 1);
    chest(out, B, 0, 0, 0, 0);
  });
  P.build(28, 44, face(28, 44, 40, 52), (B, out) => dock(B, out, 10, 3, 0.4, true));
  for (const [x, z] of [[20, 20], [-20, 26], [-26, -34], [26, -34]]) P.build(x, z, 0, (B) => streetlight(B, 0, 0));
  spoke(P, 90, 40, 128);
  townSign(P, 8, 44, 'Slurpy Swamp', Math.PI);
  P.forest(-80, 70, 28, 0.7);
  countryside(P, [[20, 112, 'cabin'], [140, 110, 'house'], [190, 116, 'camp'], [250, 112, 'shed'], [310, 110, 'tower']]);
}

// Feuerwache: zwei Tore vorne, Schlauchturm hinten
function fireStation(B, out) {
  const w = 14, d = 12, h = 4.8, hw = w / 2, hd = d / 2;
  B.box(0, 0, 0, w, 0.15, d, C.CONCRETE, { m: MAT.STONE });
  const gate = (at) => ({ at, w: 3.4, y0: 0, y1: 3.4 });
  B.wall(-hw, hd, hw, hd, h, 0.35, C.BRICK, [gate(3.2), gate(7.6), { at: 11.8, w: 1.4, y0: 0, y1: 2.4 }], { m: MAT.STONE, frameColor: C.WALL_WHITE });
  B.wall(hw, -hd, -hw, -hd, h, 0.35, C.BRICK, [{ at: 7, w: 1.4, y0: 0, y1: 2.4 }], { m: MAT.STONE });
  B.wall(-hw, -hd, -hw, hd, h, 0.35, C.BRICK, [{ at: 6, w: 1.3, y0: 1.2, y1: 2.4 }], { m: MAT.STONE });
  B.wall(hw, hd, hw, -hd, h, 0.35, C.BRICK, [{ at: 6, w: 1.3, y0: 1.2, y1: 2.4 }], { m: MAT.STONE });
  B.box(0, h, 0, w + 0.4, 0.35, d + 0.4, C.CONCRETE_DARK, { m: MAT.STONE });
  B.box(0, h + 0.35, hd, w + 0.4, 0.8, 0.3, C.WALL_WHITE, { col: false });
  sign(out, B, 0, h - 0.5, hd + 0.2, 6, 0.8, 'FEUERWACHE', 0, '#b8322a', '#ffffff');
  const T = B.sub(hw - 1.8, -hd + 1.8);
  T.box(0, h + 0.35, 0, 3.2, 5, 3.2, C.BRICK, { m: MAT.STONE });
  T.prism(0, h + 5.35, 0, 3.6, 1.5, 3.6, C.ROOF_DARK, { col: false });
  // Löschfahrzeug
  const F = B.sub(-3.2, 0.6);
  F.box(0, 0.5, 0, 2.3, 1.6, 7, C.RED, { m: MAT.METAL });
  F.box(0, 2.1, 2.2, 2.2, 1.0, 2.2, C.RED, { m: MAT.METAL });
  F.box(0, 2.15, 3.32, 2.0, 0.6, 0.04, 0x2c3e50, { col: false });
  F.box(0, 2.1, -1.2, 1.9, 0.18, 4.2, C.STEEL, { col: false });
  chest(out, B, 3.8, 0.15, -hd + 1, 0);
  floorLoot(out, B, 4, 0.15, 2);
}

// Misty Meadows: Hügeldorf mit Marktplatz, Brunnen, Kirche, Feuerwache und Schule
function mistyMeadows(P) {
  P.poi('Misty Meadows', 0, 0, 56);
  P.hill(92, -52, 34, 10, { snow: true, rock: true });
  P.hill(62, 84, 30, 8);
  P.hill(-96, -44, 30, 8, { snow: true });
  P.hill(-60, 90, 26, 7);
  P.flat(0, 0, 56, null, 22);
  P.paintCircle(0, 0, 15, SURF.PLAZA);
  P.road(ring(24, 28), 6);
  for (const d of [45, 135, 225, 315]) spoke(P, d, 24, 124, 6);
  P.build(0, 0, 0, fountain);
  P.build(-26, -2, Math.PI / 2, (B, out) => church(B, out, { wall: C.WALL_WHITE, roof: C.ROOF_GREY }));
  P.build(26, -4, -Math.PI / 2, fireStation);
  P.build(0, 34, Math.PI, (B, out) => block(B, out, { w: 22, d: 10, floors: 2, fh: 3.3, wall: C.BRICK, trim: C.WALL_WHITE, sign: 'SCHULE', signBg: '#2d4f8f' }));
  const homes = [[-30, 30], [30, 30], [-36, -34], [36, -34], [0, -44]];
  homes.forEach(([x, z], k) => {
    const [wall, roof] = HOUSE_COLORS[(k * 2 + 3) % HOUSE_COLORS.length];
    P.build(x, z, face(x, z), (B, out, ctx) => {
      if (k % 2) house1(B, out, { wall, roof });
      else house2(B, out, { wall, roof });
      picket(B, -6.5, 8, -2.2, 8);
      picket(B, 2.2, 8, 6.5, 8);
      if (k === 0) ctx.prop('car', B.wx(7.5, 2), B.wz(7.5, 2), B.rot + Math.PI / 2, 1, 2);
    });
  });
  for (let k = 0; k < 8; k++) {
    const [x, z] = polar((k / 8) * TAU, 17);
    P.build(x, z, face(x, z), (B) => streetlight(B, 0, 0));
  }
  townSign(P, 26, 26, 'Misty Meadows', -Math.PI * 0.75);
  P.forest(-90, 40, 28, 1);
  P.forest(95, 30, 24, 0.9);
  countryside(P, [[0, 112, 'cabin'], [90, 110, 'barn'], [150, 114, 'tower'], [200, 110, 'house'], [260, 116, 'camp'], [300, 112, 'shed']]);
}

// Lazy Lake: Häuser rund um einen See, Villa, Stege, Pavillon auf einer kleinen Insel
function lazyLake(P) {
  P.poi('Lazy Lake', 0, 0, 58);
  P.lake(0, 0, 30, 0.85, 1.2, 0.9);
  P.flat(6, 4, 5.5, 1.0, 3);
  P.build(6, 4, 0, (B, out) => gazebo(B, out, 3.0, C.ROOF_BLUE));
  P.build(6, 20, 0, (B) => bridge(B, 26, 3, 0.4, C.BOARD), 0.75);
  P.road(ring(54, 30), 7);
  for (const d of [20, 200]) spoke(P, d, 54, 128);
  const homes = [[-44, -12], [-36, 26], [-8, 44], [26, 40], [46, 8], [36, -30]];
  homes.forEach(([x, z], k) => {
    const [wall, roof] = HOUSE_COLORS[(k * 3 + 2) % HOUSE_COLORS.length];
    P.flat(x, z, 9, null, 5);
    P.build(x, z, face(x, z), (B, out, ctx) => {
      house2(B, out, { wall, roof, chest2: k % 3 === 0 });
      if (k % 2) ctx.prop('car', B.wx(-7.5, -3), B.wz(-7.5, -3), B.rot + Math.PI / 2, 1, k % 3);
    });
  });
  P.flat(0, -66, 16, null, 6);
  P.build(0, -66, 0, (B, out) => {
    block(B, out, { w: 20, d: 13, floors: 3, fh: 3.3, wall: C.WALL_WHITE, trim: C.GOLD_TRIM, helipad: true, balcony: true });
    B.box(0, 0, 11, 9, 0.3, 5, C.WALL_WHITE, { m: MAT.STONE });
    B.box(0, 0.3, 11, 8.2, 0.02, 4.2, C.POOL, { col: false });
  });
  for (const [x, z] of [[-26, -18], [22, 26], [-18, 22]]) P.build(x, z, face(x, z, 0, 0), (B, out) => dock(B, out, 8, 2.6, 0.2, true));
  townSign(P, 58, 22, 'Lazy Lake', -Math.PI / 2);
  P.forest(-80, 80, 28, 0.9);
  P.forest(90, -70, 28, 0.9);
  countryside(P, [[60, 112, 'house'], [120, 116, 'tower'], [160, 110, 'barn'], [240, 114, 'cabin'], [300, 112, 'camp'], [330, 116, 'shed']]);
}

// Retail Row: Ladenzeile mit großem Parkplatz, Wasserturm, Häuser dahinter
function retailRow(P) {
  P.poi('Retail Row', 0, -4, 60);
  P.flat(0, -6, 64, null, 20);
  P.paintRect(0, 7, 106, 30, 0, SURF.PLAZA);
  P.road([[-140, 30], [-60, 30], [0, 30], [60, 30], [140, 28]], 8);
  P.road([[-70, -64], [0, -66], [70, -64]], 6);
  P.road([[0, 30], [0, 140]], 7);
  const shops = [['BURGER BAY', '#d0493a', C.WALL_CREAM], ['SPORTS', '#2d6fd0', C.WALL_WHITE], ['SUPERMARKT', '#2f8a4a', C.WALL_GREY], ['PIZZA', '#e8792f', C.WALL_CREAM], ['SPIELZEUG', '#a85cd6', C.WALL_WHITE]];
  shops.forEach(([name, bg, wall], k) => P.build(-46 + k * 23, -18, 0, (B, out) => shop(B, out, { w: k === 2 ? 16 : 13, d: 11, h: 4.6, sign: name, signBg: bg, wall, awning: [C.RED, C.BLUE, C.GREEN, C.ORANGE, C.WALL_PURPLE][k] })));
  P.build(0, 0, 0, (B, out, ctx) => {
    let k = 0;
    for (const z of [2, 12]) for (let x = -44; x <= 44; x += 7) { if ((x + z) % 3 === 0) continue; ctx.prop('car', B.wx(x, z), B.wz(x, z), Math.PI / 2 + (k % 2) * Math.PI, 1, k++ % 3); }
    for (let x = -40; x <= 40; x += 20) streetlight(B, x, 7, 0);
    floorLoot(out, B, -20, 0, 7);
    floorLoot(out, B, 22, 0, 7);
  });
  P.build(52, -44, 0, (B) => waterBall(B, 0, 0, 14, C.WALL_WHITE));
  for (const [x, k] of [[-45, 0], [-18, 1], [12, 2], [40, 3]]) P.build(x, -52, Math.PI, (B, out) => (k % 2 ? house1(B, out, { wall: HOUSE_COLORS[k + 2][0], roof: HOUSE_COLORS[k + 2][1] }) : house2(B, out, { wall: HOUSE_COLORS[k + 1][0], roof: HOUSE_COLORS[k + 1][1], porch: false })));
  P.flat(-66, 44, 13, null, 8);
  P.build(-66, 44, Math.PI, (B, out) => gasStation(B, out, { sign: 'RETAIL GAS' }));
  townSign(P, 70, 36, 'Retail Row', -Math.PI / 2);
  P.forest(-90, -70, 28, 0.9);
  P.forest(80, 80, 26, 0.9);
  countryside(P, [[20, 112, 'cabin'], [70, 118, 'house'], [120, 112, 'tower'], [160, 110, 'barn'], [230, 115, 'camp'], [300, 116, 'shed']]);
}

// Dirty Docks: Hafen mit Lagerhallen, Containerlager, Kränen und Frachtschiff (Osten)
function dirtyDocks(P) {
  P.poi('Dirty Docks', 88, 0, 60);
  P.bulge(0, -18, 0.55);
  P.flatRect(86, 0, 70, 124, 0, 1.4, 5);
  P.paintRect(86, 0, 70, 124, 0, SURF.PLAZA);
  P.road([[50, 0], [0, 4], [-60, 0], [-140, -4]], 8);
  P.build(121.8, 0, 0, (B) => {
    B.box(0, -2, 0, 1.2, 3.4, 124, C.CONCRETE_DARK, { m: MAT.STONE });
    for (let z = -58; z <= 58; z += 8) B.cyl(0.3, 1.4, z, 0.25, 0.5, C.DARK, { seg: 6 });
  });
  for (const [z, k] of [[-40, 0], [0, 1], [40, 2]]) P.build(66, z, Math.PI / 2, (B, out) => warehouse(B, out, { w: 22, d: 16, h: 8, wall: [C.WALL_GREY, C.BRICK, C.WALL_BLUE][k], c1: [C.RED, C.ORANGE, C.GREEN][k], c2: [C.BLUE, C.TEAL, C.YELLOW][k] }));
  const cols = [C.RED, C.BLUE, C.GREEN, C.ORANGE, C.YELLOW, C.TEAL, C.NAVY];
  P.build(98, 0, 0, (B, out) => {
    let n = 0;
    for (const x of [-6, 1, 8]) {
      for (let z = -52; z <= 52; z += 9) {
        if (Math.abs(z) < 6) continue;
        const hgt = 1 + ((n * 7 + Math.round(x)) % 3);
        for (let l = 0; l < hgt; l++) container(B, x, z, Math.PI / 2, cols[(n + l) % cols.length], l === 0 && n % 4 === 0, l * 2.6);
        if (l0(n)) chest(out, B, x, 0.12, z + 0.2, 0);
        n++;
      }
    }
    floorLoot(out, B, -3, 0, 20);
    floorLoot(out, B, 4, 0, -30);
  });
  for (const z of [-26, 26]) P.build(116, z, Math.PI / 2, (B) => crane(B, 16, C.YELLOW));
  P.build(132.3, 8, -Math.PI / 2, (B, out) => cargoShip(B, out, 44, 11), 0);
  P.build(66, -58, 0, (B, out) => block(B, out, { w: 12, d: 9.5, floors: 2, wall: C.WALL_CREAM, trim: C.CONCRETE_DARK, sign: 'DIRTY DOCKS', signBg: '#5b4a3a' }));
  P.build(-40, -6, face(-40, -6, -40, 0), (B, out) => house2(B, out, { wall: C.WALL_GREY, roof: C.ROOF_RED }));
  P.build(-18, 24, face(-18, 24, -18, 0), (B, out) => house1(B, out, { wall: C.WALL_YELLOW, roof: C.ROOF_BROWN }));
  P.build(-60, 26, face(-60, 26, -60, 0), (B, out) => shop(B, out, { w: 10, d: 8, sign: 'HAFENBAR', signBg: '#3a5f8a' }));
  townSign(P, 44, 6, 'Dirty Docks', -Math.PI / 2);
  P.forest(-60, -80, 30, 1);
  P.forest(-70, 80, 30, 0.9);
  countryside(P, [[90, 112, 'house'], [140, 118, 'tower'], [180, 110, 'cabin'], [220, 116, 'barn'], [260, 112, 'camp'], [300, 118, 'house2']]);
}
// jede vierte Container-Reihe hat unten eine offene Tür mit Truhe
function l0(n) { return n % 4 === 0; }

// Craggy Cliffs: Hafenstädtchen auf den Klippen im Norden, Treppe hinunter zum Pier, Leuchtturm
function craggyCliffs(P) {
  P.poi('Craggy Cliffs', 0, -84, 50);
  P.bulge(-Math.PI / 2, -26, 0.5);
  P.hill(0, -70, 70, 5);
  P.flat(0, -82, 40, 8, 14);
  P.paintRect(0, -84, 60, 26, 0, SURF.PLAZA);
  P.road([[0, -70], [0, 0], [4, 60], [0, 140]], 7);
  const homes = [[-30, -94, C.BRICK], [-14, -100, C.WALL_CREAM], [14, -100, C.BRICK], [30, -94, C.WALL_WHITE], [-34, -70, C.WALL_BLUE]];
  homes.forEach(([x, z, wall], k) => P.build(x, z, face(x, z, x, 0), (B, out) => house2(B, out, { wall, roof: k % 2 ? C.ROOF_GREY : C.ROOF_DARK, trim: C.WALL_WHITE, porch: false })));
  P.build(30, -68, face(30, -68, 30, 0), (B, out) => shop(B, out, { w: 12, d: 9, sign: 'FISCH', signBg: '#2f6f9f', wall: C.WALL_WHITE, awning: C.BLUE }));
  P.build(44, -104, 0, (B, out) => buildLighthouse(B.sub(0, 0), out));
  // Treppe zum Pier + Pier
  P.build(0, -118, Math.PI, (B) => {
    const steps = 24;
    B.stairs(0, 0, 3.2, 7.4 / steps, 0.5, steps, C.STONE, 0, 0);
  }, 0.6);
  P.build(0, -118, Math.PI, (B, out) => {
    deck(B, 0, 8, 18, 16, 0.6, 'x');
    posts(B, -8.8, 8.8, 0.5, 15.5, 3.5, 3, 0.6);
    B.boat(10.5, 9, 0.2, C.RED, -0.2);
    B.boat(-10.5, 6, -0.3, C.WALL_BLUE, -0.2);
    B.crate(5, 0.6, 3, 1.1, 0.3);
    B.crate(6.2, 0.6, 3.5, 1.0, -0.2);
    B.barrel(-6, 0.6, 12, C.RUST);
    chest(out, B, -5, 0.6, 3, 0);
    floorLoot(out, B, 3, 0.6, 12);
  }, 0);
  // Felsen an der Klippe
  P.build(0, -112, 0, (B) => {
    for (let x = -46; x <= 46; x += 9) {
      if (Math.abs(x) < 5) continue;
      B.slab(x, -2, (x % 18 === 0 ? 0 : 2), 8, 8 + (Math.abs(x) % 5), 6, [C.ROCK_GREY, 0x80858c, 0x6f757c][Math.abs(x) % 3], { taper: 0.8 });
    }
  }, 0);
  townSign(P, 6, -56, 'Craggy Cliffs', Math.PI);
  P.forest(-80, 40, 32, 1);
  P.forest(80, 50, 30, 0.9);
  countryside(P, [[0, 110, 'house'], [40, 116, 'barn'], [90, 112, 'cabin'], [130, 110, 'tower'], [165, 115, 'house2'], [200, 112, 'camp']]);
}

// The Agency: Villa auf einer Insel mitten im See, drei Brücken, Hubschrauberlandeplatz
function theAgency(P) {
  P.poi('The Agency', 0, 0, 56);
  P.lake(0, 0, 46, 0.95);
  P.flat(0, 0, 24, 1.4, 4);
  P.build(0, -3, 0, (B, out) => block(B, out, { w: 22, d: 15, floors: 3, fh: 3.4, wall: C.WALL_WHITE, trim: C.GOLD_TRIM, frame: C.GOLD_TRIM, helipad: true, balcony: true, doorW: 3 }));
  P.build(0, 15, 0, fountain);
  for (const [x, z] of [[-17, -14], [17, -14]]) P.build(x, z, face(x, z), (B, out) => buildWatchtower(B, out, 6));
  for (const d of [90, 210, 330]) {
    const a = (d / 180) * Math.PI;
    const [x, z] = polar(a, 41);
    P.build(x, z, face(x, z), (B) => bridge(B, 36, 5, 0.4, C.CONCRETE), 1.0);
    spoke(P, d, 58, 128);
  }
  for (const [x, z] of [[-40, 34], [44, 28]]) P.build(x, z, face(x, z), (B, out) => dock(B, out, 8, 3, 0.3, true));
  P.build(-66, -20, face(-66, -20), (B, out) => house2(B, out, { wall: C.WALL_GREY, roof: C.ROOF_DARK }));
  P.build(64, -32, face(64, -32), (B, out) => house1(B, out, { wall: C.WALL_CREAM, roof: C.ROOF_BLUE }));
  P.build(-10, 70, face(-10, 70), (B, out) => shop(B, out, { w: 12, d: 9, sign: 'KIOSK', signBg: '#caa33a' }));
  townSign(P, 8, 62, 'The Agency', Math.PI);
  P.forest(-90, 60, 30, 1);
  P.forest(90, 70, 26, 0.9);
  P.forest(0, -95, 30, 0.9);
  countryside(P, [[20, 118, 'cabin'], [140, 114, 'barn'], [180, 112, 'tower'], [235, 118, 'house'], [300, 112, 'camp']]);
}

// The Shark: Felseninsel mit Haimaul-Basis (Nordwesten), Sandbank zur Hauptinsel, Fischerdorf
function theShark(P) {
  const ix = -126, iz = -62;
  P.poi('The Shark', ix, iz, 26);
  P.bulge(Math.atan2(iz, ix), -32, 0.45);
  P.hill(ix, iz, 18, 11, { rock: true });
  P.flat(ix, iz, 13, 1.6, 5);
  P.bar([[-92, -44], [ix + 10, iz + 6]], 12, -0.35);
  P.build(ix, iz, face(ix, iz), sharkRock);
  P.build(ix - 12, iz + 12, face(ix, iz, 0, 0) + Math.PI, (B, out) => dock(B, out, 8, 3, 0.4, true), 1.2);
  // Fischerdorf an der Bucht
  P.poi('Fischerdorf', -70, -26, 26);
  P.flat(-70, -26, 22, null, 10);
  for (const [x, z] of [[-78, -36], [-62, -34], [-72, -14]]) P.build(x, z, face(x, z, -100, -50), buildHut);
  P.build(-86, -22, face(-86, -22, -110, -40), (B, out) => dock(B, out, 12, 3, 0.4, true));
  // Dorf in der Mitte
  P.poi('Sharkside', 16, 18, 36);
  P.flat(16, 18, 36, null, 14);
  P.road(ring(22, 24).map(([x, z]) => [x + 16, z + 18]), 6);
  const homes = [[-6, 0], [38, 4], [30, 40], [0, 40], [16, -8]];
  homes.forEach(([x, z], k) => {
    const [wall, roof] = HOUSE_COLORS[(k * 3) % HOUSE_COLORS.length];
    P.build(x, z, face(x, z, 16, 18), (B, out) => (k % 2 ? house1(B, out, { wall, roof }) : house2(B, out, { wall, roof })));
  });
  P.build(16, 18, 0, (B, out) => shop(B, out, { w: 10, d: 8, sign: 'SHARK BAIT', signBg: '#2d4f8f' }));
  P.build(96, 22, face(96, 22), (B, out) => buildLighthouse(B, out));
  P.flat(96, 22, 14, null, 8);
  spoke(P, 20, 40, 128, 6);
  P.forest(40, -80, 30, 1);
  P.forest(-30, 90, 30, 0.9);
  countryside(P, [[60, 112, 'barn'], [110, 115, 'cabin'], [150, 110, 'tower'], [290, 110, 'house'], [330, 116, 'camp']]);
}

// The Yacht: Luxusyacht vor der Ostküste, Beach Club und Jachthafen
function theYacht(P) {
  P.poi('The Yacht', 146, 0, 34);
  P.bulge(0, -20, 0.5);
  P.build(146, 0, -Math.PI / 2, (B, out) => yacht(B, out, 56, 12), 0);
  P.build(118, -12, Math.PI / 2, (B, out) => dock(B, out, 18.5, 3, 0.55, false), 0);
  for (const z of [22, 36]) P.build(118, z, Math.PI / 2, (B, out) => dock(B, out, 12, 2.6, 0.55, true), 0);
  P.poi('Beach Club', 100, 6, 30);
  P.flat(100, 6, 26, 1.6, 10);
  P.paintRect(100, 6, 40, 40, 0, SURF.PLAZA);
  P.build(96, 6, Math.PI / 2, (B, out) => {
    shop(B, out, { w: 16, d: 11, sign: 'BEACH CLUB', signBg: '#1fa6c9', wall: C.WALL_WHITE, awning: C.TEAL });
    B.box(0, 0, 15, 12, 0.35, 6, C.WALL_WHITE, { m: MAT.STONE });
    B.box(0, 0.35, 15, 11, 0.02, 5, C.POOL, { col: false });
    for (let k = 0; k < 4; k++) umbrella(B, -6 + k * 4, 21, [C.RED, C.YELLOW, C.BLUE, C.GREEN][k]);
  });
  for (const [x, z] of [[86, -30], [88, 40]]) P.build(x, z, face(x, z, 100, 6), (B, out) => house2(B, out, { wall: C.WALL_WHITE, roof: C.ROOF_BLUE, porch: false }));
  P.road([[80, 6], [0, 0], [-60, 10], [-140, 4]], 7);
  P.poi('Inselmitte', -30, 10, 30);
  P.flat(-30, 10, 26, null, 12);
  for (const [x, z] of [[-44, 0], [-20, 26], [-30, -14]]) P.build(x, z, face(x, z, -30, 10), (B, out) => house1(B, out, { wall: C.WALL_CREAM, roof: C.ROOF_RED }));
  townSign(P, 74, 12, 'The Yacht', -Math.PI / 2);
  P.forest(-60, -80, 30, 1);
  P.forest(-50, 80, 28, 0.9);
  countryside(P, [[60, 110, 'cabin'], [110, 114, 'tower'], [160, 112, 'barn'], [200, 116, 'camp'], [250, 110, 'house2'], [300, 116, 'shed']]);
}

// The Rig: Bohrinsel vor der Südküste, Landesteg mit Treppe, Fischerdorf
function theRig(P) {
  P.poi('The Rig', 0, 132, 30);
  P.bulge(Math.PI / 2, -34, 0.5);
  P.build(0, 134, Math.PI, (B, out) => oilRig(B, out, 10), 0);
  P.poi('Hafendorf', 0, 86, 30);
  P.flat(0, 84, 24, null, 10);
  P.build(-18, 88, face(-18, 88, 0, 120), buildHut);
  P.build(18, 90, face(18, 90, 0, 120), buildHut);
  P.build(0, 70, Math.PI, (B, out) => warehouse(B, out, { w: 16, d: 12, h: 6, wall: C.WALL_BLUE }));
  P.road([[0, 60], [4, 0], [0, -60], [-4, -140]], 7);
  P.poi('Inselmitte', 0, -24, 40);
  P.flat(0, -24, 36, null, 14);
  const homes = [[-24, -24], [24, -20], [-10, -48], [14, -50], [0, 0]];
  homes.forEach(([x, z], k) => {
    const [wall, roof] = HOUSE_COLORS[(k * 5 + 1) % HOUSE_COLORS.length];
    P.build(x, z, face(x, z, 0, -24), (B, out) => (k % 2 ? house1(B, out, { wall, roof }) : house2(B, out, { wall, roof })));
  });
  townSign(P, 8, 58, 'The Rig', Math.PI);
  P.forest(-80, -40, 32, 1);
  P.forest(80, -60, 30, 0.9);
  countryside(P, [[0, 112, 'cabin'], [40, 116, 'barn'], [140, 112, 'house'], [180, 118, 'tower'], [220, 112, 'camp'], [320, 116, 'gas']]);
}

// The Grotto: Geheimbasis im Felsen an einer Bucht (Nordwesten), Wasserfall-Eingang
function theGrotto(P) {
  const a = -2.3;
  P.bulge(a, -28, 0.5);
  const bx = -68, bz = -76;
  const rot = Math.atan2(Math.cos(a), Math.sin(a));
  // Vorderseite (+Z) zeigt in die Bucht; der Berg liegt hinter und neben der Basis
  const fx = Math.sin(rot), fz = Math.cos(rot); // vorne
  const sx = Math.cos(rot), sz = -Math.sin(rot); // rechts
  P.poi('The Grotto', bx, bz, 30);
  P.hill(bx - fx * 20, bz - fz * 20, 30, 14, { rock: true });
  P.hill(bx + sx * 19 - fx * 4, bz + sz * 19 - fz * 4, 15, 9, { rock: true });
  P.hill(bx - sx * 19 - fx * 4, bz - sz * 19 - fz * 4, 15, 9, { rock: true });
  P.hill(bx - fx * 48, bz - fz * 48, 34, 10);
  P.flatRect(bx + fx * 2, bz + fz * 2, 27, 26, rot, 1.4, 3);
  P.build(bx, bz, rot, grottoBase);
  P.build(-86, -60, face(-86, -60, -110, -100), (B, out) => dock(B, out, 12, 3, 0.4, true), 0.9);
  P.poi('Buchtdorf', 34, 30, 40);
  P.flat(34, 30, 34, null, 14);
  const homes = [[12, 20], [52, 14], [44, 52], [18, 48], [34, 30]];
  homes.forEach(([x, z], k) => {
    const [wall, roof] = HOUSE_COLORS[(k * 3 + 5) % HOUSE_COLORS.length];
    P.build(x, z, k === 4 ? 0 : face(x, z, 34, 30), (B, out) => (k === 4 ? shop(B, out, { w: 11, d: 9, sign: 'LADEN', signBg: '#6a4a9a' }) : k % 2 ? house1(B, out, { wall, roof }) : house2(B, out, { wall, roof })));
  });
  P.road([[34, 30], [0, 0], [-20, -30], [-50, -62]], 6, SURF.PATH);
  P.road([[34, 30], [80, 60], [120, 80]], 7);
  townSign(P, 0, 6, 'The Grotto', -2.4);
  P.forest(80, -40, 30, 1);
  P.forest(-60, 80, 30, 0.9);
  countryside(P, [[20, 114, 'cabin'], [70, 112, 'barn'], [110, 116, 'tower'], [150, 112, 'house'], [300, 112, 'camp'], [330, 116, 'shed']]);
}

// ===========================================================================
export const MAPS = [
  { id: 'pleasant', shape: [[40, 12, 0.6], [150, -14, 0.7], [250, 10, 0.5], [320, -10, 0.6]], name: 'Pleasant Park', seed: 1101, hillAmp: 4.5, baseH: 1.4, plan: pleasantPark, biome: { scatter: { tree: 70, pine: 18 } } },
  { id: 'salty', shape: [[20, -12, 0.7], [110, 14, 0.6], [200, -10, 0.5], [290, 12, 0.8]], name: 'Salty Springs', seed: 1102, hillAmp: 5, baseH: 1.4, plan: saltySprings, biome: { scatter: { tree: 70, pine: 24 } } },
  { id: 'sweaty', shape: [[60, 12, 0.6], [140, -12, 0.7], [220, 10, 0.6]], name: 'Sweaty Sands', seed: 1103, hillAmp: 3.5, baseH: 1.3, plan: sweatySands, biome: { scatter: { tree: 45, pine: 14, palm: 50, beachgrass: 120 } } },
  { id: 'steamy', shape: [[10, 10, 0.5], [120, -14, 0.8], [230, 12, 0.6], [300, -10, 0.5]], name: 'Steamy Stacks', seed: 1104, hillAmp: 5, baseH: 1.4, plan: steamyStacks, biome: { pines: 0.6, scatter: { tree: 40, pine: 45 } } },
  { id: 'frenzy', shape: [[80, -12, 0.7], [170, 12, 0.6], [260, -12, 0.6], [350, 10, 0.5]], name: 'Frenzy Farm', seed: 1105, hillAmp: 3, baseH: 1.3, plan: frenzyFarm, biome: { dry: 0.15, scatter: { tree: 45, pine: 10, hay: 30, flower: 20 } } },
  { id: 'holly', shape: [[30, 12, 0.6], [130, -10, 0.6], [210, 12, 0.7], [310, -14, 0.6]], name: 'Holly Hedges', seed: 1106, hillAmp: 3.5, baseH: 1.3, plan: hollyHedges, biome: { scatter: { tree: 60, pine: 16, flower: 140, bush: 90 } } },
  { id: 'weeping', shape: [[60, -12, 0.6], [160, 12, 0.7], [250, -12, 0.6], [340, 10, 0.6]], name: 'Weeping Woods', seed: 1107, hillAmp: 4, baseH: 1.4, plan: weepingWoods, biome: { pines: 0.6, scatter: { tree: 30, pine: 20, flower: 20 } } },
  { id: 'slurpy', shape: [[0, 12, 0.7], [100, -12, 0.6], [190, 12, 0.6], [280, -14, 0.7]], name: 'Slurpy Swamp', seed: 1108, hillAmp: 1.5, baseH: 1.0, plan: slurpySwamp, biome: { swamp: true, dry: 0.9, scatter: { tree: 50, pine: 8, reed: 140, flower: 10 } } },
  { id: 'misty', shape: [[45, 12, 0.6], [135, -12, 0.7], [225, 12, 0.6], [315, -12, 0.6]], name: 'Misty Meadows', seed: 1109, hillAmp: 6, baseH: 1.8, plan: mistyMeadows, biome: { snowLine: 8.5, pines: 0.7, scatter: { tree: 40, pine: 50 } } },
  { id: 'lazy', shape: [[70, 12, 0.6], [180, -12, 0.7], [290, 10, 0.6]], name: 'Lazy Lake', seed: 1110, hillAmp: 4, baseH: 1.4, plan: lazyLake, biome: { scatter: { tree: 60, pine: 20, reed: 30 } } },
  { id: 'retail', shape: [[30, -12, 0.6], [120, 12, 0.7], [210, -10, 0.6], [300, 12, 0.6]], name: 'Retail Row', seed: 1111, hillAmp: 4, baseH: 1.4, plan: retailRow, biome: { scatter: { tree: 60, pine: 20 } } },
  { id: 'dirty', shape: [[120, 12, 0.6], [200, -12, 0.7], [280, 10, 0.6]], name: 'Dirty Docks', seed: 1112, hillAmp: 4, baseH: 1.4, plan: dirtyDocks, biome: { scatter: { tree: 55, pine: 25 } } },
  { id: 'craggy', shape: [[20, 10, 0.5], [110, -12, 0.7], [180, 12, 0.6]], name: 'Craggy Cliffs', seed: 1113, hillAmp: 5, baseH: 1.6, plan: craggyCliffs, biome: { pines: 0.55, scatter: { tree: 50, pine: 30, stoneL: 18 } } },
  { id: 'agency', shape: [[50, 12, 0.6], [140, -12, 0.6], [230, 12, 0.7], [320, -10, 0.6]], name: 'The Agency', seed: 1114, hillAmp: 4, baseH: 1.4, plan: theAgency, biome: { scatter: { tree: 55, pine: 20, reed: 40 } } },
  { id: 'shark', shape: [[40, 12, 0.6], [110, -10, 0.6], [300, 10, 0.5]], name: 'The Shark', seed: 1115, hillAmp: 4, baseH: 1.4, plan: theShark, biome: { scatter: { tree: 50, pine: 20, palm: 20, stoneL: 14 } } },
  { id: 'yacht', shape: [[100, -12, 0.6], [190, 12, 0.7], [280, -10, 0.6]], name: 'The Yacht', seed: 1116, hillAmp: 3.5, baseH: 1.3, plan: theYacht, biome: { scatter: { tree: 45, pine: 12, palm: 40 } } },
  { id: 'rig', shape: [[10, 12, 0.6], [200, -12, 0.6], [290, 12, 0.7]], name: 'The Rig', seed: 1117, hillAmp: 4, baseH: 1.4, plan: theRig, biome: { scatter: { tree: 55, pine: 20 } } },
  { id: 'grotto', shape: [[20, 12, 0.6], [100, -10, 0.6], [180, 10, 0.6]], name: 'The Grotto', seed: 1118, hillAmp: 4, baseH: 1.4, plan: theGrotto, biome: { pines: 0.55, scatter: { tree: 50, pine: 25, stoneL: 16 } } },
];
