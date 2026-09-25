// Handplatzierte Points of Interest mit ihren Strukturen.
import { Builder, C } from './builder.js';
import { MAT } from '../physics/collision.js';

export const RAIL_Z = -140;

// Feste Positionen (x,z), Abflachungsradius r
export const POIS = [
  { id: 'mine', name: 'Dusty Mine', x: -300, z: -270, r: 72, flat: true },
  { id: 'canyon', name: 'Cactus Canyon', x: 292, z: -302, r: 60, flat: false },
  { id: 'oasis', name: 'Oasis', x: 0, z: 40, r: 78, flat: true },
  { id: 'safari', name: 'Safari Camp', x: -330, z: 130, r: 62, flat: true },
  { id: 'ranch', name: 'Old Ranch', x: 300, z: 250, r: 72, flat: true },
  { id: 'station', name: 'Railway Station', x: 40, z: RAIL_Z, r: 70, flat: true },
  { id: 'bones', name: 'Bone Valley', x: -165, z: 330, r: 64, flat: true },
  { id: 'lookout', name: 'Lookout Rock', x: 200, z: 40, r: 44, flat: false },
  { id: 'docks', name: 'Fishing Docks', x: 500, z: 40, r: 50, flat: false },
];

export const CANYON_PATH = [[188, -398], [240, -347], [292, -304], [342, -256], [402, -218]];
export const RIVER_PATH = [[0, 40], [20, 112], [6, 190], [40, 270], [34, 360], [70, 450], [82, 560], [92, 660]];

// ---------------------------------------------------------------------------

export function buildMine(B) {
  // Felsbuckel mit begehbarem Stollen (Ost-West, lokale z = -24)
  const tz = -24;
  B.box(0, 0, tz - 4.5, 28, 5.2, 5, C.ROCK, { m: MAT.STONE });
  B.box(0, 0, tz + 4.5, 28, 5.2, 5, C.ROCK, { m: MAT.STONE });
  B.box(0, 3.4, tz, 28, 2.6, 14, C.ROCK_DARK, { m: MAT.STONE });
  // dekorative Felsbrocken auf dem Buckel
  const deco = [[-10, 6.2, tz, 4.2], [-3, 6.6, tz - 2, 4.8], [5, 6.3, tz + 1, 4.4], [11, 5.8, tz - 1, 3.6], [0, 5.5, tz - 6, 3], [-8, 5.2, tz + 5, 2.6], [8, 5.2, tz + 5.5, 2.4]];
  deco.forEach(([x, y, z, r], i) => B.sph(x, y, z, r, i % 2 ? C.ROCK : C.ROCK_DARK, { sy: 0.55, sx: 1.2, ry: i, col: false }));
  B.sph(-14.5, 2.2, tz - 5, 2.8, C.ROCK, { sy: 0.9, col: false });
  B.sph(14.5, 2.2, tz + 5.5, 2.6, C.ROCK_DARK, { sy: 0.9, col: false });
  // Stollenrahmen + Stützen innen
  for (const x of [-14, -9.3, -4.6, 0, 4.6, 9.3, 14]) {
    const post = Math.abs(x) === 14 ? C.WOOD_DARK : C.WOOD;
    B.box(x, 0, tz - 1.8, 0.3, 3.4, 0.3, post, { m: MAT.WOOD });
    B.box(x, 0, tz + 1.8, 0.3, 3.4, 0.3, post, { m: MAT.WOOD });
    B.box(x, 3.1, tz, 0.35, 0.35, 4.2, post, { col: false });
  }
  for (const x of [-7, 2.3, 11.6]) B.box(x, 2.7, tz - 1.6, 0.25, 0.3, 0.25, C.FIRE2, { col: false });
  B.rails(0, tz, 48, Math.PI / 2);
  B.minecart(-4, tz, Math.PI / 2, 0.15);
  B.minecart(19, tz, Math.PI / 2, 0.15, C.ROCK_GREY);
  // vernagelter Seiteneingang (Nordseite)
  B.box(-4, 0, tz - 7.1, 3.2, 3.2, 0.3, C.DARK, { col: false });
  for (const [y, r] of [[0.8, 0.4], [1.8, -0.35], [2.6, 0.2]]) B.box(-4, y, tz - 7.3, 3.6, 0.3, 0.12, C.PLANK, { rz: r, col: false });
  B.box(-5.8, 0, tz - 7.3, 0.35, 3.6, 0.35, C.WOOD_DARK, { col: false });
  B.box(-2.2, 0, tz - 7.3, 0.35, 3.6, 0.35, C.WOOD_DARK, { col: false });
  B.box(-4, 3.3, tz - 7.3, 4.2, 0.4, 0.4, C.WOOD_DARK, { col: false });
  // Holzstützen am Fels
  for (const x of [-12, -6, 6, 12]) B.box(x, 0, tz + 7.2, 0.3, 5.5, 0.3, C.WOOD, { rx: 0.35, col: false });

  // Förderturm
  const F = B.sub(16, 10);
  const H = 14;
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [2.2, 2.2], [-2.2, 2.2]]) {
    F.box(x * 0.75, 0, z * 0.75, 0.35, H, 0.35, C.WOOD_DARK, { rx: -z * 0.05, rz: x * 0.05, col: false });
    F.cyl(x, 0, z, 0.25, 3, C.WOOD_DARK, { seg: 5, m: MAT.WOOD });
    F.parts[F.parts.length - 1].inv = true;
  }
  for (let y = 3; y < H; y += 3.5) {
    const s = 2.2 - (y / H) * 0.6;
    F.box(0, y, s * 0.95, s * 2, 0.2, 0.2, C.WOOD, { col: false });
    F.box(0, y, -s * 0.95, s * 2, 0.2, 0.2, C.WOOD, { col: false });
    F.box(s * 0.95, y, 0, 0.2, 0.2, s * 2, C.WOOD, { col: false });
    F.box(-s * 0.95, y, 0, 0.2, 0.2, s * 2, C.WOOD, { col: false });
  }
  F.box(0, H, 0, 3.4, 0.3, 3.4, C.WOOD_DARK, { col: false });
  // Seilrad (dreht sich)
  const wheelKey = 'mine_wheel';
  if (B.groups) B.groups[wheelKey] = { pivot: { x: F.wx(0, 0), y: F.oy + H + 1.9, z: F.wz(0, 0) }, axis: 'x', ry: F.rot, speed: 0.8 };
  F.cyl(0, H + 1.9 - 0.12, 0, 1.6, 0.24, C.METAL_DARK, { rz: Math.PI / 2, seg: 12, col: false, grp: wheelKey });
  for (let k = 0; k < 4; k++) F.box(0, H + 1.9 - 1.5, 0, 0.15, 3.0, 0.15, C.RUST, { rx: (k * Math.PI) / 4, col: false, grp: wheelKey });
  F.box(-0.1, H - 0.2, 0, 0.2, 2.3, 0.2, C.WOOD_DARK, { col: false });
  // Schacht
  F.box(0, 0.02, 0, 3.2, 0.05, 3.2, C.DARK, { col: false });
  F.railing(-2.4, -2.4, 2.4, -2.4, 0, 1.0);
  F.railing(2.4, -2.4, 2.4, 2.4, 0, 1.0);
  F.railing(-2.4, 2.4, -2.4, -2.4, 0, 1.0);
  // Gleise vom Stollen zum Schacht
  B.rails(24, tz + 17, 34, 0);
  B.minecart(24, 0, 0, 0.15);

  // Schuppen
  B.house(-20, 12, 7, 5, { wall: C.WOOD, roof: C.ROOF_TIN, wallH: 3, trim: C.WOOD_DARK, floor: C.PLANK });
  B.house(-4, 20, 6, 5, { wall: C.WOOD_LIGHT, roof: C.ROOF_TIN, wallH: 2.8, rot: -0.2 });
  // Erzhaufen, Kisten, Fässer
  B.sph(8, 0.3, 18, 2.2, C.ROCK_GREY, { sy: 0.5, col: false });
  B.sph(9, 0.6, 19, 1.0, C.GOLD, { sy: 0.6, col: false });
  B.blocker(8, 0, 18, 3.4, 1.2, 3.4, { m: MAT.STONE });
  B.crate(-12, 0, 2, 1.2, 0.3);
  B.crate(-12, 1.2, 2, 1.1, 0.6);
  B.crate(-10.6, 0, 2.6, 1.2, 0.1);
  B.barrel(4, 0, 4);
  B.barrel(5, 0, 5);
  B.barrel(-26, 0, -6);
  B.crate(28, 0, -6, 1.3, 0.4);
  B.crate(29.5, 0, -5, 1.2, 0.9);
  B.box(-24, 0, 26, 3, 0.9, 1, C.PLANK, { m: MAT.WOOD });
  B.watertower(-30, -8, 0.3, 5);
}

export function buildCanyon(B0, hAt, path) {
  const parts = B0.parts;
  const at = (t) => {
    const n = path.length - 1;
    const f = Math.min(n - 0.0001, Math.max(0, t * n));
    const i = Math.floor(f);
    const k = f - i;
    const [x1, z1] = path[i];
    const [x2, z2] = path[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const l = Math.hypot(dx, dz);
    return { x: x1 + dx * k, z: z1 + dz * k, tx: dx / l, tz: dz / l };
  };
  // Felsbögen über der Schlucht
  for (const t of [0.3, 0.66]) {
    const p = at(t);
    const nx = -p.tz, nz = p.tx;
    const ry = Math.atan2(-nz, nx);
    const top = Math.max(hAt(p.x + nx * 9, p.z + nz * 9), hAt(p.x - nx * 9, p.z - nz * 9)) + 1.5;
    for (const sgn of [-1, 1]) {
      const px = p.x + nx * 9 * sgn, pz = p.z + nz * 9 * sgn;
      const base = hAt(px, pz) - 1;
      const b = new Builder(parts, px, pz, base, ry, B0.groups);
      b.box(0, 0, 0, 3.4, top - base + 1, 3.6, C.ROCK, { m: MAT.STONE });
      b.sph(0, (top - base) * 0.5, 0, 2.2, C.ROCK_DARK, { sy: 1.6, col: false });
    }
    const b = new Builder(parts, p.x, p.z, top, ry, B0.groups);
    b.box(0, 0, 0, 22, 2.8, 3.6, C.ROCK, { m: MAT.STONE });
    b.box(-6, 1.8, 0, 10, 1.8, 3.2, C.ROCK_DARK, { rz: 0.12, col: false });
    b.box(6, 1.8, 0, 10, 1.8, 3.2, C.ROCK_DARK, { rz: -0.12, col: false });
    b.box(0, -0.8, 0, 12, 1.2, 3.0, C.ROCK_DARK, { col: false });
  }
  // verlassene Hütte + Planwagen im Canyon
  {
    const p = at(0.48);
    const nx = -p.tz, nz = p.tx;
    const hx = p.x + nx * 4, hz = p.z + nz * 4;
    const b = new Builder(parts, hx, hz, hAt(hx, hz), Math.atan2(-p.tz, p.tx) + Math.PI / 2, B0.groups);
    b.house(0, 0, 6, 5, { wall: C.WOOD_DARK, roof: C.ROOF_BROWN, wallH: 2.8, trim: C.WOOD });
    b.barrel(4, 0, 2);
    b.crate(4, 0, -1, 1.1, 0.4);
  }
  {
    const p = at(0.12);
    const b = new Builder(parts, p.x, p.z, hAt(p.x, p.z), Math.atan2(-p.tz, p.tx) + 0.4, B0.groups);
    b.box(0, 0.7, 0, 2.0, 0.5, 4.4, C.WOOD, { m: MAT.WOOD });
    for (const z of [-1.8, -0.6, 0.6, 1.8]) b.box(0, 1.2, z, 2.2, 1.6, 0.12, C.WOOD_DARK, { rx: 0, col: false });
    b.prism(0, 1.2, 0, 2.4, 1.5, 4.4, C.CLOTH_WHITE, { ry: 0 });
    b.blocker(0, 0.7, 0, 2.0, 2.2, 4.4, { m: MAT.WOOD });
    for (const sx of [-1.1, 1.1]) for (const sz of [-1.5, 1.5]) b.cyl(sx, 0.6, sz, 0.6, 0.12, C.WOOD_DARK, { rz: Math.PI / 2, seg: 8, col: false, center: true });
  }
  // Wegweiser am Eingang
  const p0 = at(0.03);
  new Builder(parts, p0.x + 6, p0.z, hAt(p0.x + 6, p0.z), 0, B0.groups).signpost(0, 0, [0.6, -0.8]);
}

export function buildOasis(B) {
  // Palmenring um den Teich
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    const r = 28 + (i % 3) * 3;
    B.palm(Math.cos(a) * r, Math.sin(a) * r, 6 + (i % 4), 0.2 + (i % 3) * 0.1, a + Math.PI);
  }
  // Schilf am Ufer
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 23 + (i % 5) * 0.8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    for (let k = 0; k < 3; k++) B.box(x + k * 0.3, -0.4, z + (k - 1) * 0.25, 0.08, 1.6 + k * 0.3, 0.08, k % 2 ? 0x7da34a : 0x5f8a3a, { rz: (k - 1) * 0.15, col: false });
  }
  // Steg in den Teich
  B.box(0, 0.1, 21, 2.2, 0.25, 8, C.PLANK, { m: MAT.WOOD });
  for (const z of [18, 21, 24]) for (const x of [-1, 1]) B.cyl(x, -1.2, z, 0.12, 1.6, C.WOOD_DARK, { seg: 5, col: false });
  // Zelte
  B.tent(-44, -10, 5, 4, C.CLOTH_WHITE, Math.PI / 2);
  B.tent(-38, 22, 5, 4, C.CLOTH_TAN, 2.2);
  B.tent(40, -22, 5, 4, C.CLOTH_TAN, -1.2);
  B.canopy(42, 16, 5, 4, C.CLOTH_RED, 0.4);
  B.canopy(-10, -46, 6, 4, C.CLOTH_BLUE, 0.1);
  B.canopy(14, 44, 4, 4, C.CLOTH_RED, -0.3);
  // Marktstand
  B.box(-10, 0, -46, 4, 0.9, 1.2, C.WOOD, { m: MAT.WOOD });
  for (let i = 0; i < 5; i++) B.sph(-11.6 + i * 0.8, 1.05, -46, 0.22, [C.RED, C.FIRE2, 0x7fc242, C.FIRE, C.RED][i], { col: false });
  // Brunnen
  const W = B.sub(30, 34);
  W.cyl(0, 0, 0, 1.3, 0.9, C.STONE, { seg: 10, m: MAT.STONE });
  W.cyl(0, 0.9, 0, 1.0, 0.02, C.WATER, { seg: 10, col: false });
  W.box(-1.1, 0.9, 0, 0.15, 1.8, 0.15, C.WOOD_DARK, { col: false });
  W.box(1.1, 0.9, 0, 0.15, 1.8, 0.15, C.WOOD_DARK, { col: false });
  W.prism(0, 2.6, 0, 2.8, 0.9, 1.8, C.ROOF_RED, { ry: Math.PI / 2 });
  // Kisten, Krüge
  B.crate(36, 0, 12, 1.1, 0.3);
  B.crate(-40, 0, 30, 1.2, 0.7);
  B.barrel(-47, 0, -4, C.WOOD);
  for (let i = 0; i < 4; i++) B.cyl(12 + i * 0.7, 0, 42, 0.3, 0.7, 0xc46a3c, { rt: 0.18, seg: 7, col: false });
  // Kamel-Sattel-Rastplatz: Teppiche
  B.box(-24, 0.02, 30, 3, 0.05, 2, C.CLOTH_RED, { col: false, ry: 0.3 });
  B.box(22, 0.02, -32, 3, 0.05, 2, C.CLOTH_BLUE, { col: false, ry: -0.5 });
}

export function buildSafari(B) {
  // Zelte im Kreis, Eingang zur Mitte
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 17, z = Math.sin(a) * 17;
    B.tent(x, z, 5, 4.4, i % 2 ? C.CLOTH_GREEN : C.CLOTH_TAN, Math.atan2(x, z) + Math.PI);
  }
  B.campfire(0, 0);
  B.box(0, 0, 3.4, 3.2, 0.5, 0.6, C.WOOD_DARK, { m: MAT.WOOD });
  B.box(0, 0, -3.4, 3.2, 0.5, 0.6, C.WOOD_DARK, { m: MAT.WOOD });
  B.box(3.4, 0, 0, 0.6, 0.5, 3.2, C.WOOD_DARK, { m: MAT.WOOD });
  B.jeep(24, -6, 0.4, C.JEEP);
  B.jeep(-22, 20, 2.3, C.JEEP2);
  B.jeep(4, 32, -1.3, C.JEEP);
  // Hochsitze
  hide(B.sub(-30, -22, 0.6));
  hide(B.sub(30, 24, -2.4));
  // Fahnenmast
  B.cyl(8, 0, -8, 0.08, 8, C.METAL, { seg: 5, col: false });
  B.box(9.1, 6.6, -8, 2.2, 1.3, 0.04, 0xf4b41a, { col: false });
  // Kisten und Fässer
  B.crate(-8, 0, 28, 1.2, 0.2);
  B.crate(-6.7, 0, 28.4, 1.2, 0.6);
  B.crate(-7.4, 1.2, 28.2, 1.0, 0.1);
  B.barrel(12, 0, -24);
  B.barrel(13, 0, -23);
  B.barrel(12.4, 0, -22.2, C.METAL);
  B.crate(-26, 0, -4, 1.3, 0.3);
  // Dornenzaun (Boma) teilweise
  for (let i = 0; i < 22; i++) {
    const a = (i / 30) * Math.PI * 2 + 0.6;
    B.sph(Math.cos(a) * 40, 0.5, Math.sin(a) * 40, 1.2, 0x8a6a3a, { sy: 0.6, col: false, ry: i });
  }
  // Wasserturm
  B.watertower(34, -26, 0.2, 6, C.WOOD_LIGHT);
}

function hide(b) {
  const h = 4.2;
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4]]) {
    b.cyl(x, 0, z, 0.15, h + 2.6, C.WOOD_DARK, { seg: 5 });
  }
  b.box(0, h - 0.2, 0, 3.3, 0.22, 3.3, C.PLANK, { m: MAT.WOOD });
  b.railing(-1.6, -1.6, 1.6, -1.6, h, 1.0);
  b.railing(-1.6, -1.6, -1.6, 1.6, h, 1.0);
  b.railing(1.6, 1.6, 1.6, -1.6, h, 1.0);
  b.railing(-1.6, 1.6, 0.2, 1.6, h, 1.0);
  b.prism(0, h + 2.6, 0, 4.0, 1.2, 4.0, C.ROOF_BROWN);
  b.box(0, h + 2.5, 0, 3.6, 0.1, 3.6, C.WOOD_DARK, { col: false });
  // Treppe nach Süden (+Z) hinunter
  b.stairs(1.0, 1.65 + 12 * 0.42 - 0.02, 1.1, h / 12, 0.42, 12, C.WOOD);
}

export function buildRanch(B) {
  // Farmhaus mit Veranda
  const fh = B.house(-16, -8, 10, 8, { wall: C.WALL_YELLOW, roof: C.ROOF_RED, wallH: 3.3, doorAt: 3, backDoor: true });
  fh.box(0, 0, 5.5, 10, 0.22, 3, C.PLANK, { m: MAT.WOOD });
  for (const x of [-4.8, -1.6, 1.6, 4.8]) fh.cyl(x, 0, 6.8, 0.12, 3.0, C.WOOD_LIGHT, { seg: 5 });
  fh.box(0, 3.0, 5.5, 10.4, 0.15, 3.2, C.ROOF_RED, { col: false, rx: 0.12 });
  fh.box(3.8, 0.22, 6.2, 1.8, 0.45, 0.6, C.WOOD_DARK, { m: MAT.WOOD });
  fh.box(0, 3.3 + 2.4 - 0.5, -1.5, 0.8, 1.6, 0.8, 0x8a4a3a, { col: false });
  // Scheune
  const barn = B.house(18, -12, 12, 16, { wall: C.WALL_RED, roof: C.ROOF_BROWN, wallH: 5, doorW: 4.2, backDoor: true, trim: C.WALL_WHITE, roofH: 3.6 });
  barn.box(0, 0, 8.02, 4.4, 0.25, 0.1, C.WALL_WHITE, { col: false, ry: 0 });
  barn.box(-5.6, 2.6, 3, 0.2, 0.2, 10, C.WOOD_DARK, { col: false });
  // Heuboden-Innenleben
  for (let i = 0; i < 4; i++) barn.haybale(-3.5, -5 + i * 1.6, Math.PI / 2);
  barn.haybale(-3.5, -4.2, Math.PI / 2, 1.45);
  barn.haybale(-3.5, -2.6, Math.PI / 2, 1.45);
  barn.crate(3.8, 0.22, -5.5, 1.2);
  barn.crate(3.8, 1.42, -5.5, 1.0, 0.3);
  // Heuballen draußen
  const hb = [[4, 8], [5.6, 8.2], [7.2, 8], [4.8, 8.1, 1.45], [6.4, 8.1, 1.45], [-2, 16], [-2, 17.6]];
  for (const [x, z, y] of hb) B.haybale(x, z, 0, y || 0);
  // Windrad
  B.windmill(-2, 26, 'ranch_windmill', 0.6);
  // Wassertank
  B.watertower(-22, 22, 0.1, 6.5);
  // Koppel
  const cx = 24, cz = 24, w = 18, d = 14;
  B.fence(cx - w / 2, cz - d / 2, cx + w / 2, cz - d / 2);
  B.fence(cx + w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
  B.fence(cx + w / 2, cz + d / 2, cx - w / 2, cz + d / 2);
  B.fence(cx - w / 2, cz + d / 2, cx - w / 2, cz + 1);
  B.box(cx, 0, cz, 3, 0.7, 1, C.METAL, { m: MAT.METAL });
  // Traktor
  const tr = B.sub(-2, 2, 1.1);
  tr.box(0, 0.6, 0.4, 1.3, 1.0, 2.4, 0xd63a2f, { m: MAT.METAL });
  tr.box(0, 1.6, -0.6, 1.2, 1.2, 1.1, 0xd63a2f, { col: false });
  tr.box(0, 2.8, -0.6, 1.4, 0.08, 1.3, C.METAL_DARK, { col: false });
  tr.cyl(0.9, 0.8, -0.7, 0.8, 0.45, C.TIRE, { rz: Math.PI / 2, seg: 12, col: false, center: true });
  tr.cyl(-0.9, 0.8, -0.7, 0.8, 0.45, C.TIRE, { rz: Math.PI / 2, seg: 12, col: false, center: true });
  tr.cyl(0.75, 0.45, 1.3, 0.45, 0.3, C.TIRE, { rz: Math.PI / 2, seg: 10, col: false, center: true });
  tr.cyl(-0.75, 0.45, 1.3, 0.45, 0.3, C.TIRE, { rz: Math.PI / 2, seg: 10, col: false, center: true });
  tr.cyl(0.3, 1.5, 1.0, 0.07, 1.0, C.METAL_DARK, { seg: 5, col: false });
  // Kisten, Fässer, Tränke
  B.barrel(-9, 0, 4);
  B.barrel(-8, 0, 4.6, C.METAL);
  B.crate(10, 0, 6, 1.2, 0.2);
  B.box(-24, 0, 4, 3, 0.8, 1, C.WOOD_DARK, { m: MAT.WOOD });
  B.box(-24, 0.7, 4, 2.7, 0.05, 0.7, C.WATER, { col: false });
  // Briefkasten + Wegweiser
  B.box(-30, 0, 14, 0.12, 1.1, 0.12, C.WOOD_DARK, { col: false });
  B.box(-30, 1.1, 14, 0.5, 0.35, 0.3, C.RED, { col: false });
  B.signpost(-34, 12, [2.6, 0.9, -1.3]);
}

export function buildStation(B, railY) {
  // Bahnsteig (südlich der Gleise)
  B.box(0, 0, 6.4, 46, 0.5, 5, C.STONE, { m: MAT.STONE });
  B.box(0, 0.5, 4.05, 46, 0.03, 0.3, 0xf2d24a, { col: false });
  // Bahnhofsgebäude, Tür zum Bahnsteig (Norden)
  const st = B.house(0, 15.5, 16, 8, { wall: C.WALL_TEAL, roof: C.ROOF_RED, wallH: 3.6, rot: Math.PI, backDoor: true, doorAt: 8, roofH: 2.2 });
  st.box(0, 3.6 + 1.0, 4.3, 2.2, 1.0, 0.2, C.WALL_WHITE, { col: false });
  st.box(0, 4.25, 4.42, 0.9, 0.9, 0.05, 0x333333, { col: false });
  // Bahnsteigdach
  for (const x of [-18, -9, 0, 9, 18]) B.cyl(x, 0.5, 8.3, 0.14, 3.2, C.METAL_DARK, { seg: 6, m: MAT.METAL });
  B.box(0, 3.7, 7, 40, 0.2, 4.2, C.ROOF_TIN, { m: MAT.METAL, rx: 0 });
  // Bänke
  for (const x of [-12, -4, 6, 14]) {
    B.box(x, 0.5, 7.6, 2.2, 0.45, 0.6, C.WOOD, { m: MAT.WOOD });
    B.box(x, 0.95, 7.95, 2.2, 0.5, 0.1, C.WOOD, { col: false });
  }
  // Verlassener Zug auf dem Gleis (lokal z=0, x entlang Gleis)
  const ry = 0;
  const T = new Builder(B.parts, B.ox, B.oz, (railY ?? B.oy) + 0.35, B.rot + ry, B.groups);
  // Lok
  T.box(-22, 0.4, 0, 9.5, 0.6, 2.8, C.METAL_DARK, { m: MAT.METAL });
  T.cyl(-23, 1.0, 0, 1.25, 7, 0x2f3b4a, { rz: Math.PI / 2, seg: 12, col: false });
  T.blocker(-23.5, 1.0, 0, 7.5, 2.5, 2.5, { m: MAT.METAL });
  T.box(-17.8, 1.0, 0, 2.8, 3.2, 2.9, 0x8e2a2a, { m: MAT.METAL });
  T.box(-17.8, 4.2, 0, 3.2, 0.25, 3.2, C.METAL_DARK, { col: false });
  T.cyl(-25.5, 3.4, 0, 0.35, 1.6, C.METAL_DARK, { rt: 0.5, seg: 8, col: false });
  T.cyl(-22.5, 3.4, 0, 0.45, 0.6, C.GOLD, { seg: 8, col: false });
  T.box(-27.2, 0.3, 0, 0.8, 1.2, 2.6, C.RED, { col: false, rz: 0.4 });
  for (const x of [-25.5, -23, -20.5, -18]) for (const z of [-1.3, 1.3]) T.cyl(x, 0.55, z, 0.55, 0.15, 0xb03a2e, { rx: Math.PI / 2, seg: 10, col: false, center: true });
  // Güterwagen (begehbar, Schiebetüren offen)
  const G = T.sub(-7, 0, 0, 1.05);
  G.box(0, 0, 0, 10, 0.2, 2.9, C.PLANK, { m: MAT.WOOD });
  G.wall(-5, 1.4, 5, 1.4, 2.6, 0.12, 0x9c4a26, [{ at: 5, w: 2.4, y0: 0, y1: 2.3 }], { frame: false });
  G.wall(5, -1.4, -5, -1.4, 2.6, 0.12, 0x9c4a26, [{ at: 5, w: 2.4, y0: 0, y1: 2.3 }], { frame: false });
  G.wall(-5, -1.4, -5, 1.4, 2.6, 0.12, 0x9c4a26, []);
  G.wall(5, 1.4, 5, -1.4, 2.6, 0.12, 0x9c4a26, []);
  G.box(0, 2.6, 0, 10.2, 0.2, 3.1, 0x6e3a1e, { m: MAT.WOOD });
  G.crate(-3, 0.2, 0, 1.1, 0.3);
  G.crate(3.4, 0.2, -0.5, 1.2, 0.1);
  for (const x of [-3.5, 3.5]) for (const z of [-1.3, 1.3]) G.cyl(x, -0.6, z, 0.45, 0.15, C.METAL_DARK, { rx: Math.PI / 2, seg: 10, col: false, center: true });
  B.crate(-7, 0, -2.6, 0.9, 0.2);
  B.crate(-7, 0.5, 4.3, 0.6, 0.2);
  // Kohlewagen
  const K = T.sub(5, 0, 0, 0.9);
  K.box(0, 0, 0, 9, 1.6, 2.8, 0x3d4450, { m: MAT.METAL });
  K.sph(0, 1.6, 0, 1.6, 0x1f1f1f, { sx: 2.5, sy: 0.35, col: false });
  for (const x of [-3, 3]) for (const z of [-1.3, 1.3]) K.cyl(x, -0.45, z, 0.45, 0.15, C.METAL_DARK, { rx: Math.PI / 2, seg: 10, col: false, center: true });
  // Kesselwagen
  const Q = T.sub(16, 0, 0, 0.9);
  Q.box(0, 0, 0, 9, 0.4, 2.6, C.METAL_DARK, { m: MAT.METAL });
  Q.cyl(0, 0.4 + 1.2, 0, 1.25, 8.4, 0xe0e0d8, { rz: Math.PI / 2, seg: 12, col: false });
  Q.blocker(0, 0.4, 0, 8.4, 2.5, 2.5, { m: MAT.METAL });
  Q.cyl(0, 2.8, 0, 0.35, 0.5, C.METAL_DARK, { seg: 8, col: false });
  for (const x of [-3, 3]) for (const z of [-1.3, 1.3]) Q.cyl(x, -0.45, z, 0.45, 0.15, C.METAL_DARK, { rx: Math.PI / 2, seg: 10, col: false, center: true });
  // Wasserturm für die Lok, Signal, Gepäckwagen
  B.watertower(-32, -9, 0, 6, C.WOOD);
  const S = B.sub(28, -3);
  S.cyl(0, 0, 0, 0.12, 5.5, C.METAL_DARK, { seg: 6, col: false });
  S.box(0, 4.6, 0.1, 0.5, 1.2, 0.3, 0x222222, { col: false });
  S.sph(0, 5.3, 0.3, 0.14, C.RED, { col: false });
  S.sph(0, 4.9, 0.3, 0.14, 0x55dd55, { col: false });
  for (const x of [-18, 12]) {
    B.box(x, 0.5, 5.4, 1.6, 0.6, 1.0, C.WOOD, { m: MAT.WOOD });
    B.box(x - 0.4, 1.1, 5.4, 0.7, 0.5, 0.6, C.CLOTH_TAN, { col: false });
    B.box(x + 0.4, 1.1, 5.4, 0.6, 0.35, 0.5, 0x6b4a2e, { col: false });
  }
  B.crate(22, 0, 16, 1.2, 0.4);
  B.crate(23.3, 0, 16.3, 1.2, 0.1);
  B.barrel(-22, 0, 15);
  B.barrel(-23, 0, 16);
  B.signpost(12, 26, [1.2, -1.9, 0.2]);
}

export function buildBones(B) {
  const bc = C.BONE, bd = C.BONE_DARK;
  // Wirbelsäule
  for (let i = 0; i < 18; i++) {
    const x = -22 + i * 2.2;
    const y = x < -8 ? Math.max(0.6, 5.2 + (x + 8) * 0.33) : 5.4 - Math.max(0, x - 8) * 0.08;
    B.box(x, y - 0.5, 0, 1.4, 1.1, 1.3, i % 2 ? bc : bd, { m: MAT.BONE });
    B.box(x, y + 0.5, 0, 0.3, 1.1, 0.3, bc, { col: false });
  }
  // Rippen
  for (let i = 0; i < 7; i++) {
    const x = -6 + i * 2.3;
    const sc = 1 - Math.abs(i - 3) * 0.08;
    for (const s of [-1, 1]) {
      B.box(x, 4.4 * sc, s * 1.6, 0.35, 1.8, 0.4, bc, { rx: -s * 0.9, col: false });
      B.box(x, 2.2 * sc, s * 3.4, 0.4, 2.6, 0.4, bd, { rx: -s * 0.25 });
      B.box(x, 0.2, s * 3.1, 0.4, 2.2, 0.4, bc, { rx: s * 0.2, col: false });
      B.blocker(x, 0, s * 3.3, 0.5, 4.2 * sc, 0.6, { m: MAT.BONE });
    }
  }
  // Schädel (Triceratops-artig)
  const S = B.sub(18, 0, 0);
  S.box(0, 0.4, 0, 4.4, 3.6, 3.2, bc, { m: MAT.BONE });
  S.box(2.8, 1.5, 0, 2.4, 1.8, 2.2, bd, { m: MAT.BONE });
  S.box(4.3, 1.2, 0, 1.2, 1.2, 1.2, bc, { col: false, rz: -0.3 });
  S.box(2.8, 0.2, 0, 2.6, 0.9, 2.0, bd, { col: false });
  S.box(-2.2, 2.4, 0, 1.0, 4.6, 5.6, bc, { rz: 0.35, col: false });
  S.box(1.0, 2.4, 1.61, 0.9, 0.8, 0.05, C.DARK, { col: false });
  S.box(1.0, 2.4, -1.61, 0.9, 0.8, 0.05, C.DARK, { col: false });
  S.cyl(1.6, 3.0, 1.0, 0.35, 2.6, bc, { rt: 0.02, rz: -0.9, seg: 6, col: false });
  S.cyl(1.6, 3.0, -1.0, 0.35, 2.6, bc, { rt: 0.02, rz: -0.9, seg: 6, col: false });
  S.cyl(4.2, 2.0, 0, 0.3, 1.2, bc, { rt: 0.02, rz: -0.5, seg: 6, col: false });
  for (let k = 0; k < 6; k++) S.cyl(2.2 + k * 0.4, 0.55, 0.9, 0.08, 0.4, C.WHITE, { rt: 0, rx: Math.PI, seg: 4, col: false });
  // Beinknochen
  for (const [x, z, r] of [[-10, 4, 0.5], [-10, -4, -0.4], [6, 4.5, -0.5], [6, -4.5, 0.6]]) {
    B.cyl(x, 0, z, 0.45, 5, bd, { rz: r, rx: z > 0 ? 0.3 : -0.3, seg: 6, col: false });
    B.sph(x, 0.4, z, 0.8, bc, { sy: 0.6, col: false });
  }
  // Elefantenschädel mit Stoßzähnen
  const E = B.sub(-26, 24, 0.8);
  E.sph(0, 1.6, 0, 2.4, bc, { sx: 1.1, sy: 0.9, sz: 1.2, col: false, detail: 1 });
  E.blocker(0, 0, 0, 4, 3.2, 4.4, { m: MAT.BONE });
  E.sph(0.8, 2.0, 1.6, 0.5, C.DARK, { col: false });
  E.sph(-0.8, 2.0, 1.6, 0.5, C.DARK, { col: false });
  for (const s of [-1, 1]) {
    E.cyl(s * 1.2, 0.6, 2.4, 0.35, 2.4, C.WHITE, { rt: 0.1, rx: 1.2, seg: 6, col: false });
    E.cyl(s * 1.2, 1.2, 4.3, 0.12, 1.4, C.WHITE, { rt: 0.02, rx: 0.4, seg: 6, col: false });
  }
  // Grabungsstelle
  B.canopy(-4, -22, 6, 5, C.CLOTH_WHITE, 0.2);
  B.box(-4, 0, -22, 3, 0.9, 1.2, C.WOOD, { m: MAT.WOOD });
  B.crate(0, 0, -25, 1.1, 0.4);
  B.crate(1.2, 0, -24.6, 1.0, 0.8);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    B.cyl(-4 + Math.cos(a) * 7, 0, -22 + Math.sin(a) * 5, 0.06, 0.9, C.WOOD_DARK, { seg: 4, col: false });
  }
  // verstreute Knochen
  const bones = [[12, 12], [-16, -12], [22, -14], [-30, -8], [30, 10], [8, -30], [-12, 30], [26, 26], [-34, 16], [14, -20]];
  bones.forEach(([x, z], i) => {
    B.cyl(x, 0.2, z, 0.18, 2.2, i % 2 ? bc : bd, { rz: Math.PI / 2, ry: i, seg: 6, col: false });
    B.sph(x + Math.cos(i) * 1.1, 0.25, z - Math.sin(i) * 1.1, 0.3, bc, { col: false });
  });
  B.signpost(-40, -4, [0.3, 2.6]);
}

export function buildLookout(B) {
  // B.oy = Plateauhöhe
  const h = 6;
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [2.2, 2.2], [-2.2, 2.2]]) {
    B.cyl(x, 0, z, 0.22, h + 2.8, C.WOOD_DARK, { seg: 6 });
  }
  for (const y of [1.5, 3.5]) {
    B.box(0, y, 2.2, 4.4, 0.15, 0.15, C.WOOD, { col: false, rz: 0.4 });
    B.box(0, y, -2.2, 4.4, 0.15, 0.15, C.WOOD, { col: false, rz: -0.4 });
    B.box(-2.2, y, 0, 0.15, 0.15, 4.4, C.WOOD, { col: false, rx: 0.4 });
  }
  B.box(0, h - 0.25, 0, 5.2, 0.25, 5.2, C.PLANK, { m: MAT.WOOD });
  B.railing(-2.6, -2.6, 2.6, -2.6, h, 1.05);
  B.railing(-2.6, 2.6, -2.6, -2.6, h, 1.05);
  B.railing(2.6, 2.6, -2.6, 2.6, h, 1.05);
  B.railing(2.6, -1.0, 2.6, 2.6, h, 1.05);
  B.prism(0, h + 2.8, 0, 6.2, 1.6, 6.2, C.ROOF_RED, { col: true });
  B.box(0, h + 2.7, 0, 5.6, 0.12, 5.6, C.WOOD_DARK, { col: false });
  // Treppe an der Ostseite, Aufstieg nach Norden (-Z)
  const steps = 15;
  const rise = h / steps;
  B.stairs(3.4, 6.0, 1.3, rise, 0.5, steps, C.WOOD);
  B.box(3.4, 0, -2.0, 1.3, h, 1.5, C.WOOD_DARK, { m: MAT.WOOD });
  B.box(2.85, h - 0.25, -1.8, 0.6, 0.25, 1.4, C.PLANK, { m: MAT.WOOD });
  // Sandsäcke am Rand
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    if (i === 4) continue;
    const r = 13;
    B.box(Math.cos(a) * r, 0, Math.sin(a) * r, 2.2, 0.9, 1.0, 0xc8b27a, { ry: -a + Math.PI / 2, m: MAT.CLOTH });
  }
  // Fernglas, Fahne, Kisten
  B.cyl(-8, 0, 6, 0.06, 1.3, C.METAL_DARK, { seg: 5, col: false });
  B.box(-8, 1.3, 6, 0.3, 0.2, 0.5, C.BLACK, { col: false });
  B.cyl(0, h + 4.4, 0, 0.05, 2.2, C.METAL, { seg: 4, col: false });
  B.box(0.6, h + 5.9, 0, 1.2, 0.7, 0.03, C.RED, { col: false });
  B.crate(-5, 0, -6, 1.2, 0.3);
  B.crate(-5.5, 1.2, -6, 1.0, 0.8);
  B.barrel(6, 0, -7);
}

// Docks: gebaut relativ zur ermittelten Küstenlinie
export function buildDocks(parts, groups, hAt, coastX, z0) {
  const B = new Builder(parts, 0, 0, 0, 0, groups);
  const pierY = 1.5;
  const x0 = coastX - 7;
  const len = 46;
  // Hauptsteg nach Osten
  for (let i = 0; i < len / 4; i++) {
    const x = x0 + i * 4 + 2;
    B.box(x, pierY - 0.25, z0, 4, 0.25, 3.2, i % 2 ? C.PLANK : C.WOOD, { m: MAT.WOOD });
    for (const s of [-1.5, 1.5]) B.cyl(x - 2, -4, z0 + s, 0.16, pierY + 4 - 0.25, C.WOOD_DARK, { seg: 5, m: MAT.WOOD });
  }
  // T-Kopf
  const xe = x0 + len;
  B.box(xe + 1.6, pierY - 0.25, z0, 3.2, 0.25, 16, C.PLANK, { m: MAT.WOOD });
  for (const s of [-7.5, 0, 7.5]) for (const dx of [0.2, 3.0]) B.cyl(xe + dx, -4, z0 + s, 0.16, pierY + 4 - 0.25, C.WOOD_DARK, { seg: 5, m: MAT.WOOD });
  B.railing(xe + 3.1, z0 - 8, xe + 3.1, z0 + 8, pierY, 0.9);
  // Poller
  for (let i = 1; i < len / 8; i++) B.cyl(x0 + i * 8, pierY, z0 + 1.4, 0.15, 0.5, C.METAL_DARK, { seg: 6, col: false });
  // Boote am Steg
  B.boat(x0 + 16, z0 + 4.2, Math.PI / 2 + 0.05, C.WALL_BLUE, -0.25);
  B.boat(x0 + 30, z0 - 4.2, Math.PI / 2 - 0.08, C.RED, -0.25);
  B.boat(xe + 1.6, z0 + 11, 0.1, C.WALL_WHITE, -0.25);
  // Boote am Strand
  for (const [dz, c, r] of [[-22, 0x3d8b5a, 0.3], [18, C.WALL_YELLOW, -0.4], [-34, C.WALL_BLUE, 0.9]]) {
    const x = coastX - 14;
    const b = B.sub(x, z0 + dz, r, hAt(x, z0 + dz) - 0.1);
    b.boat(0, 0, 0, c);
  }
  // Fischerhütten auf Stelzen
  const huts = [[coastX - 30, z0 - 12, C.WALL_BLUE, 0], [coastX - 32, z0 + 16, C.WALL_TEAL, Math.PI], [coastX - 50, z0 + 2, C.WALL_YELLOW, -Math.PI / 2]];
  for (const [x, z, c, r] of huts) {
    let top = -Infinity;
    for (let dx = -4; dx <= 4; dx += 2) for (let dz = -3; dz <= 3; dz += 2) top = Math.max(top, hAt(x + dx, z + dz));
    let low = Infinity;
    for (let dx = -4; dx <= 4; dx += 2) for (let dz = -3; dz <= 3; dz += 2) low = Math.min(low, hAt(x + dx, z + dz));
    const fy = top + 0.3;
    const hb = new Builder(parts, x, z, fy, r, groups);
    // Fundament unter dem Boden
    hb.box(0, low - fy - 0.2, 0, 6.4, fy - low + 0.2, 5.4, C.WOOD_DARK, { m: MAT.WOOD });
    hb.house(0, 0, 6, 5, { wall: c, roof: C.ROOF_TIN, wallH: 2.8, trim: C.WOOD_LIGHT });
    // Stufen vor der Tür
    const ground = hAt(hb.wx(0, 3.4), hb.wz(0, 3.4)) - fy;
    const rise = 0.22 - ground;
    const n = Math.max(1, Math.ceil(rise / 0.42));
    for (let i = 0; i < n; i++) {
      const top = ground + (rise * (i + 1)) / n;
      hb.box(0, ground - 0.3, 2.7 + 0.225 + (n - 1 - i) * 0.45, 1.6, top - ground + 0.3, 0.45, C.WOOD, { m: MAT.WOOD });
    }
  }
  // Leuchtturm
  const lx = coastX - 12, lz = z0 - 48;
  const L = new Builder(parts, lx, lz, hAt(lx, lz) - 0.3, 0, groups);
  L.cyl(0, 0, 0, 2.6, 1.2, C.STONE, { seg: 10, m: MAT.STONE });
  for (let i = 0; i < 5; i++) L.cyl(0, 1.2 + i * 2.4, 0, 2.0 - i * 0.18, 2.4, i % 2 ? C.RED : C.WALL_WHITE, { rt: 2.0 - (i + 1) * 0.18, seg: 10, m: MAT.STONE });
  L.cyl(0, 13.2, 0, 1.4, 0.2, C.METAL_DARK, { seg: 10, col: false });
  L.cyl(0, 13.4, 0, 0.9, 1.4, C.FIRE2, { seg: 8, col: false });
  L.cyl(0, 14.8, 0, 1.2, 1.0, C.RED, { rt: 0.1, seg: 8, col: false });
  // Trockengestelle mit Netzen, Kisten, Fässer
  for (const [x, z] of [[coastX - 22, z0 - 2], [coastX - 40, z0 + 26]]) {
    const b = B.sub(x, z, 0.3, hAt(x, z));
    b.box(-2, 0, 0, 0.12, 2.2, 0.12, C.WOOD_DARK, { col: false });
    b.box(2, 0, 0, 0.12, 2.2, 0.12, C.WOOD_DARK, { col: false });
    b.box(0, 2.1, 0, 4.2, 0.1, 0.1, C.WOOD_DARK, { col: false });
    b.box(0, 0.9, 0, 3.8, 1.2, 0.03, 0x6f8f7a, { col: false });
  }
  for (const [x, z] of [[coastX - 18, z0 + 8], [coastX - 26, z0 + 30], [coastX - 44, z0 - 20]]) {
    const b = B.sub(x, z, 0.4, hAt(x, z));
    b.crate(0, 0, 0, 1.2, 0.2);
    b.barrel(1.4, 0, 0.3, C.WALL_BLUE);
  }
  B.sub(coastX - 60, z0 - 8, 0, hAt(coastX - 60, z0 - 8)).signpost(0, 0, [Math.PI, 2.2]);
}
