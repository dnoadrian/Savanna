// Der einzige Ort der Insel: Old Ranch (handplatziert in der Inselmitte).
import { C } from './builder.js';
import { MAT } from '../physics/collision.js';

// r: Radius des Ortes (Karte, Deko-Abstand), flat: Radius, in dem das Gelände eingeebnet wird
export const POIS = [
  { id: 'ranch', name: 'Old Ranch', x: 0, z: 0, r: 34, flat: 44 },
];

// Wege über den Hof und zum Strand (Weltkoordinaten)
export const RANCH_PATHS = [
  [[-16, -2], [-6, 3], [4, 3], [15, -1]],
  [[0, 3], [-1, 12], [8, 15]],
  [[2, 3], [5, 24], [7, 40], [8, 56]],
];

export function buildRanch(B) {
  // Farmhaus mit Veranda
  const fh = B.house(-14, -8, 10, 8, { wall: C.WALL_YELLOW, roof: C.ROOF_RED, wallH: 3.3, doorAt: 3, backDoor: true });
  fh.box(0, 0, 5.5, 10, 0.22, 3, C.PLANK, { m: MAT.WOOD });
  for (const x of [-4.8, -1.6, 1.6, 4.8]) fh.cyl(x, 0, 6.8, 0.12, 3.0, C.WOOD_LIGHT, { seg: 5 });
  fh.box(0, 3.0, 5.5, 10.4, 0.15, 3.2, C.ROOF_RED, { col: false, rx: 0.12 });
  fh.box(3.8, 0.22, 6.2, 1.8, 0.45, 0.6, C.WOOD_DARK, { m: MAT.WOOD });
  fh.box(0, 3.3 + 2.4 - 0.5, -1.5, 0.8, 1.6, 0.8, 0x8a4a3a, { col: false });
  fh.crate(-3.2, 0.22, -2.4, 1.0, 0.2);
  fh.box(2.8, 0.22, -2.9, 2.2, 0.8, 1.0, C.WOOD_DARK, { m: MAT.WOOD });
  // Scheune
  const barn = B.house(15, -10, 12, 16, { wall: C.WALL_RED, roof: C.ROOF_BROWN, wallH: 5, doorW: 4.2, backDoor: true, trim: C.WALL_WHITE, roofH: 3.6 });
  barn.box(0, 0, 8.02, 4.4, 0.25, 0.1, C.WALL_WHITE, { col: false, ry: 0 });
  barn.box(-5.6, 2.6, 3, 0.2, 0.2, 10, C.WOOD_DARK, { col: false });
  for (let i = 0; i < 4; i++) barn.haybale(-3.5, -5 + i * 1.6, Math.PI / 2);
  barn.haybale(-3.5, -4.2, Math.PI / 2, 1.45);
  barn.haybale(-3.5, -2.6, Math.PI / 2, 1.45);
  barn.crate(3.8, 0.22, -5.5, 1.2);
  barn.crate(3.8, 1.42, -5.5, 1.0, 0.3);
  barn.crate(3.6, 0.22, 2.5, 1.2, 0.5);
  // Heuballen im Hof (Deckung)
  const hb = [[4, 8], [5.6, 8.2], [7.2, 8], [4.8, 8.1, 1.45], [6.4, 8.1, 1.45], [-5, 13], [-5, 14.6], [-5, 13.8, 1.45]];
  for (const [x, z, y] of hb) B.haybale(x, z, 0, y || 0);
  for (const [x, z, y] of [[-28, -6], [-28, -4.4], [-28, -5.2, 1.45], [-27.6, -2.8]]) B.haybale(x, z, Math.PI / 2, y || 0);
  // Windrad + Wassertank
  B.windmill(-9, 21, 'ranch_windmill', 0.6);
  B.watertower(-22, 15, 0.1, 6.5);
  // Koppel mit Tränke
  const cx = 17, cz = 17, w = 14, d = 10;
  B.fence(cx - w / 2, cz - d / 2, cx + w / 2, cz - d / 2);
  B.fence(cx + w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
  B.fence(cx + w / 2, cz + d / 2, cx - w / 2, cz + d / 2);
  B.fence(cx - w / 2, cz + d / 2, cx - w / 2, cz + 1);
  B.box(cx, 0, cz, 3, 0.7, 1, C.METAL, { m: MAT.METAL });
  B.box(cx, 0.68, cz, 2.7, 0.04, 0.7, C.WATER, { col: false });
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
  // Geräteschuppen hinter dem Hof
  const shed = B.house(0, -25, 6, 5, { wall: C.WOOD_LIGHT, roof: C.ROOF_TIN, wallH: 2.8, doorW: 1.6 });
  shed.barrel(-1.8, 0.22, -1.4, C.RUST);
  shed.crate(1.6, 0.22, -1.3, 1.0, 0.4);
  // Alter Planwagen
  const wg = B.sub(-15, 27, 0.4);
  wg.box(0, 0.7, 0, 1.8, 0.5, 3.6, C.WOOD, { m: MAT.WOOD });
  wg.box(0, 1.2, 0, 1.9, 0.12, 3.7, C.WOOD_DARK, { col: false });
  for (const zz of [-1.3, 0, 1.3]) wg.box(0, 1.2, zz, 2.0, 1.4, 0.08, C.CLOTH_WHITE, { col: false });
  wg.box(0, 2.45, 0, 2.0, 0.1, 3.0, C.CLOTH_WHITE, { col: false });
  for (const [x, zz] of [[1.0, -1.1], [-1.0, -1.1], [1.0, 1.2], [-1.0, 1.2]]) wg.cyl(x, 0.55, zz, 0.55, 0.12, C.WOOD_DARK, { rz: Math.PI / 2, seg: 10, col: false, center: true });
  // niedrige Steinmauern
  B.box(9, 0, 29, 6, 1.1, 0.7, C.STONE, { m: MAT.STONE, ry: 0.25 });
  B.box(30, 0, -14, 0.7, 1.1, 5.5, C.STONE, { m: MAT.STONE, ry: 0.15 });
  B.box(-31, 0, 10, 0.7, 1.1, 5, C.STONE, { m: MAT.STONE, ry: -0.2 });
  // Kisten, Fässer, Tränke, Briefkasten
  B.barrel(-9, 0, 4);
  B.barrel(-8, 0, 4.6, C.METAL);
  B.crate(10, 0, 6, 1.2, 0.2);
  B.crate(26, 0, 2, 1.2, 0.2);
  B.crate(27.3, 0, 2.4, 1.2, 0.6);
  B.crate(26.6, 1.2, 2.2, 1.0, 0.1);
  B.barrel(25.2, 0, 3.8);
  B.box(-24, 0, 4, 3, 0.8, 1, C.WOOD_DARK, { m: MAT.WOOD });
  B.box(-24, 0.7, 4, 2.7, 0.05, 0.7, C.WATER, { col: false });
  B.box(-27, 0, 7, 0.12, 1.1, 0.12, C.WOOD_DARK, { col: false });
  B.box(-27, 1.1, 7, 0.5, 0.35, 0.3, C.RED, { col: false });
}
