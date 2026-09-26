// Die drei Orte der Bucht (Saloon Pier, Lighthouse Point, Tin Roof Wharf) und kleinere Bauwerke.
// Jede Funktion baut Parts (Rendering + Kollision) und trägt Truhen, Bodenbeute, Schilder und
// Rauch in `out` ein (Weltkoordinaten).
import { C } from './builder.js';
import { MAT } from '../physics/collision.js';

export const DECK_Y = 0.55; // Oberkante aller Stege über dem Wasser

export const POIS = [
  { id: 'saloon', name: 'Saloon Pier', x: 0, z: -64, r: 26 },
  { id: 'lighthouse', name: 'Lighthouse Point', x: -62, z: -6, r: 24 },
  { id: 'wharf', name: 'Tin Roof Wharf', x: 4, z: 60, r: 26 },
];

// Hilfen: Weltkoordinaten aus lokalen Builder-Koordinaten
function chest(out, B, lx, ly, lz, ry = 0) {
  out.chests.push({ x: B.wx(lx, lz), y: B.oy + ly, z: B.wz(lx, lz), ry: B.rot + ry });
}
function floor(out, B, lx, ly, lz) {
  out.floorLoot.push({ x: B.wx(lx, lz), y: B.oy + ly, z: B.wz(lx, lz) });
}
function sign(out, B, lx, ly, lz, w, h, text, ry = 0, bg = '#6b3f22', fg = '#ffe9b0') {
  out.signs.push({ x: B.wx(lx, lz), y: B.oy + ly, z: B.wz(lx, lz), ry: B.rot + ry, w, h, text, bg, fg });
}

// Pfähle unter einer Plattform bis zum Meeresgrund
function posts(B, x0, x1, z0, z1, step, depth = 1.6, top = 0) {
  for (let x = x0; x <= x1 + 0.01; x += step) {
    for (const z of [z0, z1]) B.cyl(x, top - depth, z, 0.17, depth, C.BOARD_DARK, { seg: 6, col: false });
  }
  for (let z = z0 + step; z < z1 - 0.01; z += step) {
    for (const x of [x0, x1]) B.cyl(x, top - depth, z, 0.17, depth, C.BOARD_DARK, { seg: 6, col: false });
  }
}

// Planken-Plattform (Oberkante = ly), leicht unterschiedliche Brettfarben
function deck(B, cx, cz, w, d, ly = 0, dir = 'x') {
  B.box(cx, ly - 0.22, cz, w, 0.22, d, C.BOARD, { m: MAT.WOOD });
  const n = Math.round((dir === 'x' ? d : w) / 0.9);
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n - 0.5;
    const col = i % 3 === 0 ? C.BOARD_LIGHT : i % 3 === 1 ? C.BOARD : C.BOARD_DARK;
    if (i % 2) continue;
    if (dir === 'x') B.box(cx, ly - 0.01, cz + k * d, w, 0.03, d / n * 0.92, col, { col: false });
    else B.box(cx + k * w, ly - 0.01, cz, w / n * 0.92, 0.03, d, col, { col: false });
  }
}

// ---------------------------------------------------------------------------
// Saloon Pier: zweistöckiger Saloon auf einem Pier, Front nach Süden (+Z)
export function buildSaloon(B, out) {
  // Pier-Plattform
  deck(B, 0, 1, 28, 32, 0, 'x');
  posts(B, -14, 14, -15, 17, 4, 1.8);
  // Gebäude: 14 × 11, Mitte (0,-6), Front bei z = -0.5
  const W = 14, D = 11, H1 = 3.4, H2 = 3.0, cz = -6;
  const S = B.sub(0, cz);
  const hw = W / 2, hd = D / 2;
  const wc = C.BOARD_LIGHT;
  S.box(0, 0, 0, W, 0.12, D, C.PLANK, { m: MAT.WOOD });
  const win = (at, y0 = 1.0, y1 = 2.2, w = 1.4) => ({ at, w, y0, y1 });
  S.wall(-hw, hd, hw, hd, H1, 0.3, wc, [{ at: 7, w: 2.4, y0: 0, y1: 2.5 }, win(2.6), win(11.4)]);
  S.wall(hw, -hd, -hw, -hd, H1, 0.3, wc, [{ at: 11, w: 1.6, y0: 0, y1: 2.3 }, win(4)]);
  S.wall(-hw, -hd, -hw, hd, H1, 0.3, wc, [win(3.5), win(7.5)]);
  S.wall(hw, hd, hw, -hd, H1, 0.3, wc, [win(3)]);
  // Obergeschoss-Boden mit Treppenloch (Osten)
  S.box(-1.3, H1, 0, 11.4, 0.25, D, C.PLANK, { m: MAT.WOOD });
  S.box(5.7, H1, 3.05, 2.6, 0.25, 4.9, C.PLANK, { m: MAT.WOOD });
  S.box(5.7, H1, -5.05, 2.6, 0.25, 0.9, C.PLANK, { m: MAT.WOOD });
  // Treppe innen: von z = 3 (unten) nach z = -4.6 (oben)
  S.stairs(5.6, 3.2, 2.1, H1 / 10, 0.78, 10, C.WOOD);
  S.railing(4.35, -4.6, 4.35, 0.6, H1 + 0.25, 1.0);
  // Obergeschoss-Wände
  const y2 = H1 + 0.25;
  const U = S.sub(0, 0, 0, y2);
  U.wall(-hw, hd, hw, hd, H2, 0.3, wc, [{ at: 7, w: 1.8, y0: 0, y1: 2.3 }, win(2.8, 0.9, 2.1), win(11.2, 0.9, 2.1)]);
  U.wall(hw, -hd, -hw, -hd, H2, 0.3, wc, [win(4, 0.9, 2.1), win(10, 0.9, 2.1)]);
  U.wall(-hw, -hd, -hw, hd, H2, 0.3, wc, [win(5.5, 0.9, 2.1)]);
  U.wall(hw, hd, hw, -hd, H2, 0.3, wc, [win(8, 0.9, 2.1)]);
  // Dach + Scheinfassade mit Schild
  const yr = y2 + H2;
  S.box(0, yr, 0, W + 0.4, 0.3, D + 0.4, C.BOARD_DARK, { m: MAT.WOOD });
  S.box(0, yr, hd - 0.1, W + 0.6, 2.0, 0.35, C.BOARD_LIGHT, { m: MAT.WOOD });
  S.box(0, yr + 2.0, hd - 0.1, W * 0.55, 0.9, 0.35, C.BOARD_LIGHT, { m: MAT.WOOD });
  S.box(0, yr + 2.9, hd - 0.1, W * 0.6, 0.18, 0.5, C.BOARD_DARK, { col: false });
  S.box(0, yr + 1.95, hd - 0.1, W + 0.8, 0.15, 0.5, C.BOARD_DARK, { col: false });
  for (const x of [-hw, hw]) S.box(x, 0, hd - 0.1, 0.4, yr + 2, 0.45, C.BOARD_DARK, { col: false });
  sign(out, S, 0, yr + 1.2, hd + 0.12, 7.4, 1.5, 'SALOON');
  // Balkon vorne (auf Höhe Obergeschoss) mit Überdachung
  S.box(0, H1, hd + 1.4, W, 0.25, 2.8, C.BOARD, { m: MAT.WOOD });
  S.railing(-hw, hd + 2.75, hw, hd + 2.75, y2, 1.0);
  S.railing(-hw, hd, -hw, hd + 2.75, y2, 1.0);
  S.railing(hw, hd, hw, hd + 2.75, y2, 1.0);
  for (const x of [-hw + 0.2, -2.3, 2.3, hw - 0.2]) S.cyl(x, 0, hd + 2.6, 0.16, yr - 0.4, C.BOARD_DARK, { seg: 6 });
  S.tinRoof(0, yr - 0.1, hd + 1.5, W + 0.6, 3.2, 0.7, C.TIN);
  // Einrichtung: Bar, Regal, Tische, Klavier, Schwingtüren
  S.box(-4.6, 0.12, -1.8, 1.0, 1.1, 5.8, C.BOARD_DARK, { m: MAT.WOOD });
  S.box(-4.6, 1.22, -1.8, 1.3, 0.1, 6.0, C.WOOD_LIGHT, { col: false });
  S.box(-6.6, 1.2, -1.8, 0.4, 1.8, 6.4, C.BOARD_DARK, { col: false });
  for (let i = 0; i < 6; i++) S.cyl(-6.45, 1.5 + (i % 2) * 0.6, -4.2 + i * 0.9, 0.09, 0.32, [0x3f8f4f, 0x8a3f2f, 0xd9b25b][i % 3], { seg: 6, col: false });
  for (const [x, z] of [[0.5, -2.5], [1.5, 2.2]]) {
    S.cyl(x, 0.12, z, 0.75, 0.85, C.WOOD, { seg: 10, m: MAT.WOOD });
    for (let k = 0; k < 3; k++) S.box(x + Math.cos(k * 2.1) * 1.15, 0.12, z + Math.sin(k * 2.1) * 1.15, 0.45, 0.5, 0.45, C.BOARD_DARK, { col: false });
  }
  S.box(3.2, 0.12, -4.6, 2.2, 1.3, 0.9, 0x3a2418, { m: MAT.WOOD });
  S.box(-0.6, 0.6, hd - 0.05, 0.9, 1.3, 0.06, C.WOOD_LIGHT, { col: false, ry: 0.5 });
  S.box(0.6, 0.6, hd - 0.05, 0.9, 1.3, 0.06, C.WOOD_LIGHT, { col: false, ry: -0.5 });
  chest(out, S, -5.9, 0.12, -4.4, -Math.PI / 2);
  chest(out, S, -4.2, y2, -3.8, 0);
  floor(out, S, 2.2, 0.12, 1.2);
  floor(out, S, 0, y2, 2.5);
  // Pier-Deko: Wasserturm, Fässer, Kisten, Laternen, Anbindepfosten, Boot
  B.watertower(-10, -12, 0.2, 4.2, C.BOARD);
  for (const [x, z] of [[9.5, 8], [10.4, 8.8], [9.2, 9.6]]) B.barrel(x, 0, z, C.BOARD_DARK);
  B.crate(-10.5, 0, 9, 1.2, 0.3);
  B.crate(-9.2, 0, 10, 1.1, -0.2);
  B.crate(-10, 1.2, 9.4, 1.0, 0.5);
  B.lamppost(-6.5, 15.5);
  B.lamppost(6.5, 15.5);
  B.box(0, 0, 13, 5, 0.9, 0.2, C.BOARD_DARK, { m: MAT.WOOD });
  B.boat(16.5, 6, 0.2, C.WALL_BLUE, -0.5);
  floor(out, B, -11, 0, 13);
  floor(out, B, 11, 0, -12);
}

// ---------------------------------------------------------------------------
// Lighthouse Point: rot-weißer Leuchtturm, Wärterhaus, Planwagen
export function buildLighthouse(B, out) {
  // Leuchtturm
  const T = B.sub(-8, -10);
  T.cyl(0, -0.3, 0, 4.2, 0.9, C.STONE, { seg: 12, m: MAT.STONE });
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const r0 = 2.7 - (i / segs) * 0.8, r1 = 2.7 - ((i + 1) / segs) * 0.8;
    T.cyl(0, 0.6 + i * 2, 0, r0, 2, i % 2 ? C.WALL_WHITE : C.LIGHT_RED, { rt: r1, seg: 14, m: MAT.STONE, col: i === 0 });
  }
  T.blocker(0, 0.6, 0, 3.6, 14, 3.6);
  const top = 0.6 + segs * 2;
  T.cyl(0, top, 0, 2.7, 0.3, C.METAL_DARK, { seg: 14, col: false });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    T.box(Math.cos(a) * 2.55, top + 0.3, Math.sin(a) * 2.55, 0.1, 1.0, 0.1, C.METAL_DARK, { col: false });
  }
  T.cyl(0, top + 1.2, 0, 2.6, 0.1, C.METAL_DARK, { seg: 14, col: false });
  T.cyl(0, top + 0.3, 0, 1.45, 1.9, C.FIRE2, { seg: 10, col: false });
  T.cyl(0, top + 2.2, 0, 1.95, 1.8, C.METAL_DARK, { rt: 0.15, seg: 10, col: false });
  T.sph(0, top + 4.1, 0, 0.3, C.METAL_DARK, { col: false });
  T.box(0, 0.6, 2.35, 1.2, 2.2, 0.5, 0x3b2a20, { col: false });
  chest(out, B, -8, 0, -4.8, 0);
  // Wärterhaus (weiß, rotes Dach), Tür nach Osten
  const H = B.house(7, 5, 7, 6, { wall: C.WALL_WHITE, roof: C.LIGHT_RED, wallH: 3.0, rot: Math.PI / 2, trim: C.BOARD_DARK });
  chest(out, H, 0, 0.22, -1.8, Math.PI);
  floor(out, H, -2, 0.22, 1);
  // Zaun, Kisten, Planwagen
  B.fence(-2, 14, 10, 14, C.BOARD);
  B.fence(10, 14, 12, 8, C.BOARD);
  B.crate(-3, 0, 7, 1.2, 0.2);
  B.crate(-1.8, 0, 7.6, 1.1, 0.7);
  B.barrel(12.5, 0, -1.5, C.BOARD_DARK);
  const Wg = B.sub(-6, 18, 0.9);
  Wg.box(0, 0.7, 0, 1.9, 0.55, 3.8, C.WOOD, { m: MAT.WOOD });
  for (const zz of [-1.4, -0.45, 0.45, 1.4]) Wg.box(0, 1.25, zz, 2.0, 1.5, 0.08, C.CLOTH_WHITE, { col: false });
  Wg.box(0, 2.6, 0, 1.6, 0.35, 3.0, C.CLOTH_WHITE, { col: false });
  for (const [x, zz] of [[1.05, -1.2], [-1.05, -1.2], [1.05, 1.3], [-1.05, 1.3]]) Wg.cyl(x, 0.6, zz, 0.6, 0.12, C.WOOD_DARK, { rz: Math.PI / 2, seg: 10, col: false, center: true });
  floor(out, B, -3, 0, 20);
  floor(out, B, 4, 0, -12);
}

// ---------------------------------------------------------------------------
// Tin Roof Wharf: blaues Lagerhaus mit Wellblechdach und rauchendem Schornstein, Front nach Norden
export function buildWharf(B, out) {
  deck(B, 0, 0, 32, 24, 0.12, 'z');
  posts(B, -16, 16, -12, 12, 4, 1.8, 0.12);
  const H = B.sub(0, 2, Math.PI, 0.12); // Front zeigt nach Norden (-Z)
  const W = 16, D = 12, WH = 3.8;
  const hw = W / 2, hd = D / 2;
  H.box(0, 0, 0, W, 0.1, D, C.PLANK, { m: MAT.WOOD });
  const win = (at) => ({ at, w: 1.5, y0: 1.1, y1: 2.3 });
  const o = { frameColor: C.WALL_WHITE };
  H.wall(-hw, hd, hw, hd, WH, 0.3, C.HOUSE_BLUE, [{ at: 8, w: 3.2, y0: 0, y1: 2.8 }, win(3), win(13)], o);
  H.wall(hw, -hd, -hw, -hd, WH, 0.3, C.HOUSE_BLUE, [{ at: 12, w: 1.6, y0: 0, y1: 2.3 }, win(5)], o);
  H.wall(-hw, -hd, -hw, hd, WH, 0.3, C.HOUSE_BLUE, [win(4), win(8.5)], o);
  H.wall(hw, hd, hw, -hd, WH, 0.3, C.HOUSE_BLUE, [win(3.5), { at: 8.5, w: 1.6, y0: 0, y1: 2.3 }], o);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) H.box(sx * (hw - 0.05), 0, sz * (hd - 0.05), 0.4, WH, 0.4, C.WALL_WHITE, { col: false });
  H.box(0, WH, 0, W + 0.2, 0.2, D + 0.2, C.BOARD_DARK, { m: MAT.WOOD });
  // Satteldach aus Wellblech (zwei Hälften), First entlang X
  H.tinRoof(0, WH + 1.15, hd / 2 + 0.25, W + 1.2, hd + 0.9, 2.1);
  const Hb = H.sub(0, 0, Math.PI);
  Hb.tinRoof(0, WH + 1.15, hd / 2 + 0.25, W + 1.2, hd + 0.9, 2.1);
  H.prism(0, WH + 0.2, 0, D - 0.2, 2.0, W, C.HOUSE_BLUE_DARK, { ry: Math.PI / 2, col: false });
  // Schornstein mit Rauch
  H.box(4.5, WH, 2.5, 1.1, 4.0, 1.1, 0x9b8f86, { m: MAT.STONE });
  H.box(4.5, WH + 4.0, 2.5, 1.35, 0.25, 1.35, 0x6f655e, { col: false });
  out.smoke.push({ x: H.wx(4.5, 2.5), y: H.oy + WH + 4.3, z: H.wz(4.5, 2.5) });
  sign(out, H, 0, 3.15, hd + 0.2, 6.5, 0.9, 'TIN ROOF WHARF', 0, '#2f5f7f', '#ffffff');
  // Innen: Kistenstapel, Regale, Netze, Tisch
  for (const [x, z, y] of [[-6, -4, 0], [-4.8, -4.2, 0], [-5.4, -4, 1.2], [5.8, 3.5, 0], [6.1, 2.2, 0]]) H.crate(x, 0.1 + y, z, 1.2, (x + z) * 0.3);
  H.box(-7.4, 0.1, 1.5, 0.6, 2.4, 4.5, C.BOARD_DARK, { m: MAT.WOOD });
  H.box(1, 0.1, -1, 2.4, 0.9, 1.2, C.WOOD, { m: MAT.WOOD });
  chest(out, H, -3, 0.1, 3.8, Math.PI);
  chest(out, H, 5.2, 0.1, -3.9, 0);
  floor(out, H, 0, 0.1, 1.5);
  floor(out, H, -5, 0.1, 0.5);
  // Schuppen daneben (Osten)
  const Sh = B.sub(12.5, 6, -Math.PI / 2, 0.12);
  Sh.box(0, 0, 0, 5, 0.1, 4, C.PLANK, { m: MAT.WOOD });
  Sh.wall(-2.5, 2, 2.5, 2, 2.6, 0.25, C.HOUSE_BLUE_DARK, [{ at: 2.5, w: 1.6, y0: 0, y1: 2.2 }]);
  Sh.wall(2.5, -2, -2.5, -2, 3.2, 0.25, C.HOUSE_BLUE_DARK);
  Sh.wall(-2.5, -2, -2.5, 2, 2.6, 0.25, C.HOUSE_BLUE_DARK);
  Sh.wall(2.5, 2, 2.5, -2, 2.6, 0.25, C.HOUSE_BLUE_DARK);
  Sh.tinRoof(0, 3.0, 0, 5.6, 4.6, 0.7);
  floor(out, Sh, 0, 0.1, -0.5);
  // Kran mit hängender Kiste, Fässer, Laternen
  const K = B.sub(-13, -9);
  K.box(0, 0.12, 0, 0.4, 5.5, 0.4, C.BOARD_DARK, { m: MAT.WOOD });
  K.box(0, 5.4, -1.8, 0.3, 0.3, 4.2, C.BOARD_DARK, { col: false });
  K.box(0, 3.2, -3.6, 0.04, 2.2, 0.04, 0x3a3a3a, { col: false });
  K.box(0, 2.3, -3.6, 1.1, 0.9, 1.1, C.WOOD, { col: false });
  for (const [x, z] of [[13.5, -9], [14.3, -8.2], [13.2, -7.6]]) B.barrel(x, 0.12, z, C.RUST);
  B.crate(-9, 0.12, 10.2, 1.2, 0.2);
  B.lamppost(-15, 11, 2.6, 0.12);
  B.lamppost(15, 11, 2.6, 0.12);
  B.boat(-19, -4, -0.3, C.RED, -0.5);
  floor(out, B, 10, 0.12, -9.5);
}

// Kleine blaue Fischerhütte mit Pultdach (Nordosten)
export function buildHut(B, out) {
  deck(B, 0, 0, 9, 8, 0.12, 'x');
  const H = B.sub(0, -0.5, 0, 0.12);
  H.box(0, 0, 0, 6, 0.1, 5, C.PLANK, { m: MAT.WOOD });
  H.wall(-3, 2.5, 3, 2.5, 2.7, 0.25, C.HOUSE_BLUE, [{ at: 3, w: 1.6, y0: 0, y1: 2.2 }, { at: 1.2, w: 1.1, y0: 1.1, y1: 2.0 }]);
  H.wall(3, -2.5, -3, -2.5, 3.4, 0.25, C.HOUSE_BLUE, [{ at: 3, w: 1.2, y0: 1.2, y1: 2.2 }]);
  H.wall(-3, -2.5, -3, 2.5, 2.7, 0.25, C.HOUSE_BLUE);
  H.wall(3, 2.5, 3, -2.5, 2.7, 0.25, C.HOUSE_BLUE, [{ at: 2.5, w: 1.1, y0: 1.1, y1: 2.0 }]);
  H.tinRoof(0, 3.25, 0, 6.8, 5.8, 0.8);
  chest(out, H, -1.8, 0.1, -1.4, 0);
  for (const [x, z] of [[3.8, 2.8], [3.5, 3.6]]) B.barrel(x, 0.12, z, C.BOARD_DARK);
  floor(out, B, -3.5, 0.12, 3.2);
}

// Wachturm mit Laternendach; Plattform-Oberkante h, Treppe nach +Z hinunter
export function buildWatchtower(B, out, h = 5.2) {
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]]) B.cyl(x, -0.8, z, 0.17, h + 0.8, C.BOARD_DARK, { seg: 6 });
  B.box(0, h - 0.25, 0, 3.6, 0.25, 3.6, C.BOARD, { m: MAT.WOOD });
  B.box(0, h * 0.45, -1.5, 3.1, 0.12, 0.12, C.BOARD_DARK, { col: false, rz: 0.9 });
  B.box(1.5, h * 0.45, 0, 0.12, 0.12, 3.1, C.BOARD_DARK, { col: false, rx: 0.9 });
  B.railing(-1.8, -1.8, 1.8, -1.8, h, 1.0);
  B.railing(-1.8, -1.8, -1.8, 1.8, h, 1.0);
  B.railing(1.8, 1.8, 1.8, -1.8, h, 1.0);
  B.railing(-1.8, 1.8, 0.2, 1.8, h, 1.0);
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) B.box(x, h, z, 0.14, 2.3, 0.14, C.BOARD_DARK, { col: false });
  B.cyl(0, h + 2.3, 0, 2.9, 1.6, C.BOARD_DARK, { rt: 0.12, seg: 4, ry: Math.PI / 4, col: false });
  B.box(0, h + 1.7, 0, 0.45, 0.55, 0.45, C.LAMP, { col: false });
  // Treppe: unten bei z = 1.9 + n*run, oben an der Plattform
  const steps = Math.round(h / 0.42);
  const rise = h / steps;
  B.stairs(1.0, 1.9 + (steps - 1) * 0.42, 1.1, rise, 0.42, steps, C.BOARD);
  chest(out, B, -0.8, h, -0.8, Math.PI * 0.75);
}

// Graue Brandungspfeiler (Deckung im Wasser)
export function buildSeaStack(B, h, r) {
  const n = Math.max(2, Math.round(h / 5));
  let y = -0.8;
  for (let i = 0; i < n; i++) {
    const s = 1 - i * 0.12;
    const sh = (h + 0.8) / n;
    B.slab(0, y, 0, r * 2 * s, sh, r * 2 * s * 0.9, i % 2 ? C.STACK_DARK : C.STACK, { ry: i * 0.7, taper: 0.88 });
    y += sh;
  }
  B.sph(0, y + r * 0.2, 0, r * 1.25, C.STACK, { sy: 0.5, sx: 1.1, detail: 1, col: false });
}
