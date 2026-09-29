// Die Karte „Frostfeste“: eine verschneite Insel im Meer. In der Mitte thront die Feste auf
// einer Terrasse – große Freitreppe, runde Torscheibe, verhüllte Statuen, dunkle Kugeln und
// Kuppeltürme –, dahinter ein spitzer Felsgipfel und eine Bergkette. Dazu ein gefrorener Fluss
// mit See, Gletscherstufen mit Forschungsstation, ein Dorf, ein Hafen und Außenposten.
import { SURF } from './terrain.js';
import { C, TX } from './builder.js';
import { MAT } from '../physics/collision.js';
import { chest, floorLoot, sign, smoke, house2, cabin, tent, container, dock } from './structures.js';

const TAU = Math.PI * 2;
// Blickrichtung (Vorderseite +Z) zum Punkt (tx, tz)
const face = (x, z, tx = 0, tz = 0) => Math.atan2(tx - x, tz - z);
const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];

// Farben der Feste
const K = {
  STONE: 0x9c978f,
  STONE_L: 0xb9b4ab,
  STONE_D: 0x736d66,
  BRONZE: 0x5e4c3e,
  BRONZE_L: 0xa98b5f,
  GOLD: 0xcaa55e,
  DARK: 0x15171b,
  STATUE: 0x463f39,
  ORB: 0x2c2926,
  FLOOR: 0x8f8a83,
  RUNE: 0x625c55,
  SNOW: 0xf1f6fb,
  ROOF: 0x4a3f3a,
};
const HC = 17; // Höhe der Festungsterrasse
const HP = 9; // Höhe des Statuenplatzes vor der Freitreppe
const PLAZA_Z = -14.2; // Mitte des achteckigen Platzes
const STAIR_Z = -24.4; // unterste Stufe der Freitreppe
const FRONT_Z = -42; // Vorderseite der Haupthalle

const stone = (o = {}) => ({ m: MAT.STONE, tx: TX.STONE, ...o });
const panel = (o = {}) => ({ m: MAT.STONE, tx: TX.PANEL, frame: false, ...o });

// Schneedecke auf einer Oberkante
function snowTop(B, lx, ly, lz, w, d, ry = 0) {
  B.box(lx, ly, lz, w + 0.08, 0.16, d + 0.08, K.SNOW, { col: false, tx: TX.SNOW, ry });
}
// Schnee auf einem Satteldach (First entlang lokaler Z-Achse vor der Drehung ry)
function snowRoof(B, lx, ly, lz, w, h, d, ry = 0) {
  B.prism(lx, ly + h * 0.28 + 0.07, lz, w * 0.72, h * 0.72, d + 0.1, K.SNOW, { ry, tx: TX.SNOW });
}
// Ring aus kurzen Leisten in einer senkrechten Ebene (Torscheibe); skip(x, y) lässt Stücke aus
function ringV(B, cx, cy, z, r, thick, depth, color, n, skip = null) {
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * TAU;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (skip && skip(x, y)) continue;
    B.box(x, y - thick / 2, z, (TAU * r) / n + 0.05, thick, depth, color, { col: false, rz: a + Math.PI / 2 });
  }
}
// eingravierter Ring im Boden (flache Leisten)
function ringFlat(B, cx, cz, y, r, n, w = 0.14, color = K.RUNE) {
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * TAU;
    B.box(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, (TAU * r) / n + 0.03, 0.03, w, color, { col: false, ry: -a - Math.PI / 2 });
  }
}

// ---------------------------------------------------------------------------
// Verhüllte Statue: weiter Kapuzenmantel, gefaltete Hände, Sockel (eckig oder rund)
function statue(B, lx, lz, ry = 0, s = 1, round = false) {
  const S = B.sub(lx, lz, ry);
  const ph = 1.0 * s;
  if (round) {
    S.cyl(0, 0, 0, 1.2 * s, ph, K.STONE_D, { seg: 16, m: MAT.STONE, tx: TX.STONE });
    S.cyl(0, ph, 0, 1.3 * s, 0.14 * s, K.STONE_L, { seg: 16, col: false });
  } else {
    S.box(0, 0, 0, 1.7 * s, ph, 1.7 * s, K.STONE_D, stone());
    S.box(0, ph, 0, 1.85 * s, 0.14 * s, 1.85 * s, K.STONE_L, { col: false });
  }
  const y = ph + 0.14 * s;
  S.cyl(0, y, 0, 0.68 * s, 2.4 * s, K.STATUE, { rt: 0.4 * s, seg: 10, m: MAT.STONE });
  S.cyl(0, y + 2.3 * s, 0, 0.48 * s, 0.45 * s, K.STATUE, { rt: 0.32 * s, seg: 10, col: false });
  // Mantelfalten
  for (const a of [-0.9, -0.3, 0.3, 0.9]) S.box(Math.sin(a) * 0.55 * s, y, Math.cos(a) * 0.5 * s, 0.1 * s, 2.1 * s, 0.1 * s, K.STATUE, { col: false, ry: a, rx: -0.08 });
  // Kapuze mit Spitze, dunkles Gesicht
  S.sph(0, y + 3.0 * s, -0.02 * s, 0.42 * s, K.STATUE, { sy: 1.2, detail: 1 });
  S.cyl(0, y + 3.25 * s, -0.14 * s, 0.26 * s, 0.55 * s, K.STATUE, { rt: 0.03 * s, seg: 8, rx: -0.35, col: false });
  S.box(0, y + 2.76 * s, 0.27 * s, 0.34 * s, 0.42 * s, 0.1 * s, K.DARK, { col: false });
  S.sph(0, y + 3.42 * s, -0.08 * s, 0.26 * s, K.SNOW, { sy: 0.35, tx: TX.SNOW });
  // gefaltete Hände in den Ärmeln, Gürtel
  S.box(0, y + 1.72 * s, 0.42 * s, 0.5 * s, 0.34 * s, 0.28 * s, K.STATUE, { col: false });
  S.cyl(0, y + 1.3 * s, 0, 0.57 * s, 0.1 * s, K.BRONZE_L, { seg: 10, col: false });
  S.box(0, y + 2.3 * s, 0.1 * s, 1.0 * s, 0.14 * s, 0.7 * s, K.SNOW, { col: false, tx: TX.SNOW });
}

// dunkle Kugel auf einem Sockel
function orb(B, lx, lz, s = 1) {
  B.box(lx, 0, lz, 1.3 * s, 1.3 * s, 1.3 * s, K.STONE_D, stone());
  B.box(lx, 1.3 * s, lz, 1.45 * s, 0.14 * s, 1.45 * s, K.STONE_L, { col: false });
  B.sph(lx, 1.44 * s + 0.76 * s, lz, 0.78 * s, K.ORB, { detail: 1, tx: TX.BRONZE });
  B.blocker(lx, 1.44 * s, lz, 1.1 * s, 1.5 * s, 1.1 * s, { m: MAT.STONE });
}

// ---------------------------------------------------------------------------
// Große runde Torscheibe: Bronzescheibe mit Steinrand, Zierringen und Gravur. Unten schneidet
// die Tür (doorW × doorH) ein Rechteck heraus. Ursprung = Wandfuß, Scheibe vor der Fläche zf.
function portalDisc(B, cy, R, zf, doorW, doorH) {
  const hd = doorW / 2 + 0.25;
  const inDoor = (x, y) => Math.abs(x) < hd + 0.3 && y < doorH + 0.35;
  const step = 0.4;
  for (let y = cy - R; y < cy + R - 0.01; y += step) {
    const dy = y + step / 2 - cy;
    const half = Math.sqrt(Math.max(0, R * R - dy * dy));
    if (half < 0.25) continue;
    if (y + step / 2 < doorH + 0.2) {
      if (half <= hd) continue;
      for (const sg of [-1, 1]) B.box(sg * (hd + (half - hd) / 2), y, zf + 0.12, half - hd, step, 0.24, K.BRONZE, { col: false, tx: TX.BRONZE });
    } else B.box(0, y, zf + 0.12, half * 2, step, 0.24, K.BRONZE, { col: false, tx: TX.BRONZE });
  }
  ringV(B, 0, cy, zf + 0.3, R + 0.05, 0.6, 0.5, K.STONE_L, 44, inDoor);
  ringV(B, 0, cy, zf + 0.27, R * 0.74, 0.14, 0.08, K.BRONZE_L, 36, inDoor);
  ringV(B, 0, cy, zf + 0.27, R * 0.44, 0.14, 0.08, K.BRONZE_L, 24, inDoor);
  ringV(B, 0, cy, zf + 0.27, R * 0.2, 0.12, 0.08, K.BRONZE_L, 14, inDoor);
  // Strahlen zwischen den Zierringen und Runen am Rand
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    const rm = R * 0.59;
    const x = Math.cos(a) * rm, y = cy + Math.sin(a) * rm;
    if (!inDoor(x, y - 0.8)) B.box(x, y - 0.06, zf + 0.27, R * 0.3, 0.12, 0.08, K.BRONZE_L, { col: false, rz: a });
    const x2 = Math.cos(a + 0.2) * R * 0.87, y2 = cy + Math.sin(a + 0.2) * R * 0.87;
    if (!inDoor(x2, y2)) B.box(x2, y2 - 0.2, zf + 0.27, 0.34, 0.4, 0.08, K.GOLD, { col: false, rz: a });
  }
  // Türlaibung dunkel (Innenraum liegt im Schatten)
  for (const sg of [-1, 1]) B.box(sg * (doorW / 2 - 0.03), 0, zf - 1.5, 0.06, doorH, 2.9, K.DARK, { col: false });
  B.box(0, doorH - 0.06, zf - 1.5, doorW, 0.06, 2.9, K.DARK, { col: false });
}

// ---------------------------------------------------------------------------
// Haupthalle: Front bei z = 0 (Torscheibe), Tiefe 16, Breite 26. Innen: Säulen, Freitreppe
// in der Mitte zur Galerie an der Rückwand, Seitentüren vorne, Hintertür unter der Galerie.
function mainHall(B, out) {
  const W = 26, D = 16, H = 12.5, t = 1.2, hw = W / 2;
  const doorW = 4.2, doorH = 5.4;
  const zF = -t / 2, zB = -D + t / 2, xS = hw - t / 2;
  B.box(0, -0.6, -D / 2, W, 0.85, D, K.FLOOR, { m: MAT.STONE, tx: TX.TILE });
  const win = (at, w = 1.1, y0 = 7, y1 = 10.2) => ({ at, w, y0, y1 });
  B.wall(-hw, zF, hw, zF, H, t, K.STONE, [{ at: hw, w: doorW, y0: 0, y1: doorH }], panel());
  B.wall(hw, zB, -hw, zB, H, t, K.STONE, [{ at: hw, w: 3, y0: 0, y1: 4 }, win(hw - 6.5, 1.4, 6.6, 9.6), win(hw + 6.5, 1.4, 6.6, 9.6)], panel());
  const sideLen = D - t;
  // Seitentüren vorne, Fenster über und hinter den Seitenflügeln (die an z = -10 anschließen)
  B.wall(-xS, zB, -xS, zF, H, t, K.STONE, [{ at: sideLen - 3.4, w: 2.8, y0: 0, y1: 4 }, win(sideLen * 0.15), win(sideLen * 0.55)], panel());
  B.wall(xS, zF, xS, zB, H, t, K.STONE, [{ at: 3.4, w: 2.8, y0: 0, y1: 4 }, win(sideLen * 0.45), win(sideLen * 0.85)], panel());
  // Säulen
  for (const x of [-6, 6]) for (const z of [-4.5, -10]) {
    B.cyl(x, 0.25, z, 0.62, H - 0.25, K.STONE_L, { seg: 12, m: MAT.STONE, tx: TX.STONE });
    B.box(x, 0.25, z, 1.6, 0.5, 1.6, K.STONE_D, stone({ col: false }));
    B.box(x, H - 0.6, z, 1.6, 0.6, 1.6, K.STONE_D, stone({ col: false }));
  }
  // Treppe in der Mitte zur Galerie (Oberkante 5.45), Galerie an der Rückwand
  const gTop = 5.45, gFront = -11.2, n = 13, rise = (gTop - 0.25) / n, run = 0.5;
  const z0 = gFront + run / 2 + (n - 1) * run;
  for (let i = 0; i < n; i++) {
    B.box(0, 0.25, z0 - i * run, 3.6, (i + 1) * rise, run, K.STONE_L, stone());
    for (const sg of [-1, 1]) B.box(sg * 1.95, 0.25, z0 - i * run, 0.3, (i + 1) * rise + 0.9, run, K.BRONZE, { m: MAT.STONE, tx: TX.BRONZE });
  }
  const gDepth = gFront - (zB + t / 2);
  B.box(0, gTop - 0.35, (gFront + zB + t / 2) / 2, W - 2 * t, 0.35, gDepth, K.FLOOR, { m: MAT.STONE, tx: TX.TILE });
  B.railing(-hw + t, gFront + 0.1, -1.9, gFront + 0.1, gTop, 1.0, K.BRONZE);
  B.railing(1.9, gFront + 0.1, hw - t, gFront + 0.1, gTop, 1.0, K.BRONZE);
  // Altar mit Truhe unter der Galerie, Truhen oben, Beute am Boden
  B.box(-7.5, 0.25, -13.4, 3.2, 0.6, 2, K.STONE_D, stone());
  chest(out, B, -7.5, 0.85, -13.4, 0);
  chest(out, B, 8, gTop, -13.6, 0);
  chest(out, B, -9, gTop, -13.6, 0);
  floorLoot(out, B, 3.5, 0.25, -2.5);
  floorLoot(out, B, -3.5, 0.25, -7);
  floorLoot(out, B, 0, gTop, -13.5);
  // Dach mit Schnee, Tambour und Pilzkuppel
  B.box(0, H, -D / 2, W + 0.6, 0.8, D + 0.6, K.STONE_D, panel());
  B.box(0, H + 0.8, -D / 2, W + 0.3, 0.16, D + 0.3, K.SNOW, { col: false, tx: TX.SNOW });
  B.cyl(0, H + 0.8, -D / 2, 6, 1.8, K.STONE_L, { seg: 20, m: MAT.STONE, tx: TX.STONE });
  for (let k = 0; k < 10; k++) {
    const [x, z] = polar((k / 10) * TAU, 6.02);
    B.box(x, H + 1.4, -D / 2 + z, 0.7, 0.9, 0.08, K.DARK, { col: false, ry: -(k / 10) * TAU + Math.PI / 2 });
  }
  dome(B, 0, H + 2.6, -D / 2, 7.6);
  // Fassade: vorspringender Portalblock, Torscheibe, Strebepfeiler, Fensterschlitze, Gesims
  B.wall(-8.2, 0.5, 8.2, 0.5, H + 1.4, 1.0, K.STONE_L, [{ at: 8.2, w: doorW, y0: 0, y1: doorH }], panel());
  B.box(0, H + 1.4, 0.4, 17.4, 0.5, 1.6, K.STONE_D, stone({ col: false }));
  snowTop(B, 0, H + 1.9, 0.4, 17.4, 1.6);
  portalDisc(B, 6.9, 5.8, 1.0, doorW, doorH);
  for (const sg of [-1, 1]) {
    B.box(sg * 10.9, 0, 0.8, 3.2, 10.5, 2.0, K.STONE, stone({ col: false, rx: 0.1 }));
    B.box(sg * 10.9, 0, 0.3, 3.0, 9.4, 1.0, K.STONE, stone());
    snowTop(B, sg * 10.9, 10.4, 0.4, 3.2, 1.2);
    for (const y of [3.2, 6.8]) B.box(sg * 10.9, y, 1.86, 0.7, 1.9, 0.06, K.DARK, { col: false, rx: 0.1 });
  }
  B.box(0, H - 0.5, 0.05, W + 0.4, 0.5, 0.4, K.STONE_L, { col: false });
}

// flache Pilzkuppel aus Bronze (Rand, Kappe, Laterne, Spitze) mit Schneeresten
function dome(B, lx, ly, lz, r) {
  B.cyl(lx, ly, lz, r + 0.25, 0.45, K.BRONZE_L, { seg: 18, col: false, tx: TX.BRONZE });
  B.cyl(lx, ly + 0.45, lz, r, r * 0.26, K.BRONZE, { rt: r * 0.6, seg: 18, col: false, tx: TX.BRONZE });
  B.cyl(lx, ly + 0.45 + r * 0.26, lz, r * 0.6, r * 0.14, K.BRONZE, { rt: r * 0.28, seg: 18, col: false, tx: TX.BRONZE });
  B.cyl(lx, ly + 0.45 + r * 0.26, lz, r * 0.5, r * 0.1, K.SNOW, { rt: r * 0.26, seg: 18, col: false, tx: TX.SNOW });
  const top = ly + 0.45 + r * 0.4;
  B.cyl(lx, top, lz, r * 0.2, r * 0.12, K.BRONZE_L, { seg: 10, col: false, tx: TX.BRONZE });
  B.cyl(lx, top + r * 0.12, lz, 0.12 + r * 0.02, r * 0.2, K.GOLD, { rt: 0.02, seg: 6, col: false });
}

// ---------------------------------------------------------------------------
// Kuppelturm (auch als Außenposten): zwei Geschosse mit Innentreppen, offene Säulenhalle auf
// dem Dach unter einer Pilzkuppel. Optional auf einem Sockel mit Freitreppe.
function domeTower(B, out, o = {}) {
  const pl = o.plinth ?? 0;
  if (pl > 0) {
    B.box(0, -1.5, 0, 11.6, pl + 1.5, 11.6, K.STONE_D, stone());
    for (const [x, z, w, d] of [[0, 5.5, 11.6, 0.6], [0, -5.5, 11.6, 0.6], [5.5, 0, 0.6, 11.6], [-5.5, 0, 0.6, 11.6]]) snowTop(B, x, pl, z, w, d);
    const n = Math.ceil(pl / 0.32), run = 0.5;
    for (let i = 0; i < n; i++) B.box(0, 0, 5.8 + (n - 1 - i) * run + run / 2, 3.4, (i + 1) * (pl / n), run, K.STONE, stone());
  }
  const T = B.sub(0, 0, 0, pl);
  const hw = 4.5, t = 0.6, inner = hw - t;
  const f2 = 4.4, f3 = 8.4; // Unterkanten der Böden
  T.box(0, 0, 0, 9, 0.3, 9, K.FLOOR, { m: MAT.STONE, tx: TX.TILE });
  const wo = stone({ frame: false });
  const win = (at, w = 1.2, y0 = 1.5, y1 = 2.9) => ({ at, w, y0, y1 });
  // Erdgeschoss
  T.wall(-hw, hw - t / 2, hw, hw - t / 2, f2, t, K.STONE, [{ at: hw, w: 2.2, y0: 0, y1: 3.0 }], wo);
  T.wall(hw, -hw + t / 2, -hw, -hw + t / 2, f2, t, K.STONE, [win(hw)], wo);
  T.wall(-hw + t / 2, -hw, -hw + t / 2, hw, f2, t, K.STONE, [win(2.6), win(6.4)], wo);
  T.wall(hw - t / 2, hw, hw - t / 2, -hw, f2, t, K.STONE, [win(4.5, 1.0, 2.2, 3.4)], wo);
  // Treppe 1 (rechts, steigt nach hinten) und Boden des Obergeschosses mit Treppenloch
  const run = 0.52;
  let n = 14, rise = (f2 + 0.3 - 0.3) / n;
  let z0 = -inner + run / 2 + (n - 1) * run;
  for (let i = 0; i < n; i++) T.box(3.2, 0.3, z0 - i * run, 1.3, (i + 1) * rise, run, K.STONE_L, stone());
  T.box((-inner + 2.45) / 2, f2, 0, inner + 2.45, 0.3, inner * 2, K.FLOOR, { m: MAT.STONE, tx: TX.TILE });
  T.railing(2.45, -inner + 1.4, 2.45, inner, f2 + 0.3, 1.0, K.BRONZE);
  // Obergeschoss
  const U = T.sub(0, 0, 0, f2 + 0.3);
  const h2 = f3 - f2 - 0.3;
  U.wall(-hw, hw - t / 2, hw, hw - t / 2, h2, t, K.STONE, [win(2.3, 1.5, 1.0, 2.5), win(6.7, 1.5, 1.0, 2.5)], wo);
  U.wall(hw, -hw + t / 2, -hw, -hw + t / 2, h2, t, K.STONE, [win(hw, 1.8, 1.0, 2.5)], wo);
  U.wall(-hw + t / 2, -hw, -hw + t / 2, hw, h2, t, K.STONE, [win(hw, 2.0, 1.0, 2.5)], wo);
  U.wall(hw - t / 2, hw, hw - t / 2, -hw, h2, t, K.STONE, [win(2.4, 1.2, 1.0, 2.5)], wo);
  // Treppe 2 (links, steigt nach vorne) zur Dachhalle
  n = 13; rise = (f3 + 0.3 - (f2 + 0.3)) / n;
  const S2 = T.sub(-3.2, -inner + run / 2, Math.PI, f2 + 0.3);
  for (let i = 0; i < n; i++) S2.box(0, 0, -i * run, 1.3, (i + 1) * rise, run, K.STONE_L, stone());
  // Dach: Boden mit Treppenloch links, Brüstung, Säulen, Kuppel
  const y3 = f3 + 0.3;
  T.box((-2.45 + hw) / 2, f3, 0, hw + 2.45, 0.3, 9, K.FLOOR, { m: MAT.STONE, tx: TX.TILE });
  T.box(-hw + t / 2, f3, 0, t, 0.3, 9, K.STONE, stone());
  T.railing(-2.45, -inner, -2.45, inner - 1.4, y3, 1.0, K.BRONZE);
  for (const [x, z, w, d] of [[0, hw - 0.2, 9, 0.4], [0, -hw + 0.2, 9, 0.4], [hw - 0.2, 0, 0.4, 9], [-hw + 0.2, 0, 0.4, 9]]) {
    T.box(x, y3, z, w, 0.95, d, K.STONE_L, stone());
    snowTop(T, x, y3 + 0.95, z, w, d);
  }
  for (const x of [-4.15, 0, 4.15]) for (const z of [-4.15, 0, 4.15]) {
    if (x === 0 && z === 0) continue;
    T.cyl(x, y3, z, 0.3, 3.4, K.STONE_L, { seg: 8, m: MAT.STONE, tx: TX.STONE });
  }
  dome(T, 0, y3 + 3.4, 0, 5.6);
  // Zierband, Eckpfeiler
  for (const [x, z, w, d] of [[0, hw + 0.1, 9.4, 0.3], [0, -hw - 0.1, 9.4, 0.3], [hw + 0.1, 0, 0.3, 9.4], [-hw - 0.1, 0, 0.3, 9.4]]) T.box(x, f2, z, w, 0.4, d, K.STONE_D, { col: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) T.box(sx * (hw - 0.2), 0, sz * (hw - 0.2), 0.9, f3 + 0.3, 0.9, K.STONE_L, stone({ col: false }));
  // Beute
  chest(out, T, -2.6, 0.3, -2.9, 0);
  chest(out, T, 0.6, f2 + 0.3, 3.1, Math.PI);
  floorLoot(out, T, 1.5, y3, -1.5);
  floorLoot(out, T, -1.2, 0.3, 2.2);
  return T;
}

// schlanker Wachturm (massiv) mit offener Laterne und Kuppel
function spire(B, w, h) {
  B.box(0, -1, 0, w, h + 1, w, K.STONE, panel());
  for (let y = 3; y < h - 2; y += 4) for (const [x, z, ry] of [[0, w / 2 + 0.03, 0], [0, -w / 2 - 0.03, 0], [w / 2 + 0.03, 0, Math.PI / 2], [-w / 2 - 0.03, 0, Math.PI / 2]]) {
    B.box(x, y, z, 0.7, 1.8, 0.06, K.DARK, { col: false, ry });
  }
  B.box(0, h, 0, w + 0.8, 0.5, w + 0.8, K.STONE_L, stone({ col: false }));
  snowTop(B, 0, h + 0.5, 0, w + 0.8, w + 0.8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(sx * (w / 2 - 0.3), h + 0.5, sz * (w / 2 - 0.3), 0.5, 2.6, 0.5, K.STONE_L, stone({ col: false }));
  dome(B, 0, h + 3.1, 0, w * 0.72);
}

// Seitenflügel: dicke Mauer entlang lokal X (0..len) mit Durchgang und Fensterreihe
function wing(B, len, h, t) {
  B.wall(0, 0, len, 0, h, t, K.STONE, [{ at: len / 2, w: 3.2, y0: 0, y1: 4.2 }], panel());
  for (let x = 2; x < len - 1.5; x += 2.6) {
    if (Math.abs(x - len / 2) < 2.6) continue;
    for (const sg of [-1, 1]) B.box(x, 5.0, sg * (t / 2 + 0.03), 0.9, 1.7, 0.06, K.DARK, { col: false });
  }
  B.box(len / 2, h - 0.2, 0, len, 0.5, t + 0.5, K.STONE_L, stone({ col: false }));
  snowTop(B, len / 2, h + 0.3, 0, len, t + 0.5);
  for (let x = 1.2; x < len; x += 3.4) B.box(x, h + 0.3, 0, 1.4, 0.8, t + 0.3, K.STONE_L, stone({ col: false }));
}

// ---------------------------------------------------------------------------
// Die Feste mit Terrasse, Freitreppe und Statuenplatz
function citadel(P) {
  P.poi('Frostfeste', 0, -34, 46);
  // Gelände: Terrasse, Einschnitt für die Treppe, Platz; steile Hänge davor sind Gletschereis
  // Terrasse mit Eiskante: oben die Terrasse, eine Stufe tiefer ein Schneesims, dann Schneehang
  P.flatRect(0, -52, 104, 45, 0, HC - 3.6, 12);
  P.flatRect(0, -54, 92, 33, 0, HC, 2.4);
  // unter der Freitreppe steigt das Gelände knapp unter den Stufen mit (Wegenetz der Bots),
  // seitlich führen Schneerampen auf die Terrasse
  P.ramp(0, STAIR_Z + 0.3, HP - 0.25, 0, STAIR_Z - 27 * 0.52, HC - 0.35, 8.2, 1.2);
  P.ramp(-44, -44, HC, -44, -16, null, 6, 4);
  P.ramp(44, -44, HC, 44, -16, null, 6, 4);
  P.flatRect(0, -18, 26, 13, 0, HP - 0.35, 9);
  for (const x of [-42, -30, -18, -8, 8, 18, 30, 42]) P.glacier(x, -37, 7);
  for (const z of [-44, -54, -64]) { P.glacier(-47, z, 6); P.glacier(47, z, 6); }
  P.keep(0, -38, 50);

  // Haupthalle mit Seitenflügeln
  P.build(0, FRONT_Z, 0, (B, out) => mainHall(B, out), HC);
  P.build(-13, -52, 0, (B) => wing(B.sub(0, 0, Math.PI), 18, 8, 3), HC);
  P.build(13, -52, 0, (B) => wing(B, 18, 8, 3), HC);
  // Kuppeltürme links (auf Sockel) und rechts, schlanker Wachturm und kleiner Turm dahinter
  P.build(-35.5, -52, 0, (B, out) => domeTower(B, out, { plinth: 2.6 }), HC);
  P.build(35.5, -50, 0, (B, out) => domeTower(B, out, {}), HC);
  P.build(21, -64, 0, (B) => spire(B, 5, 19), HC);
  P.build(-19, -66, 0, (B) => spire(B, 4.2, 13), HC);

  // Vorplatz oben: Plattenboden, Statuen neben dem Tor, Kugeln an der Treppe
  P.build(0, -39.8, 0, (B, out) => {
    B.box(0, -0.4, 0, 19, 0.65, 4.8, K.FLOOR, { m: MAT.STONE, tx: TX.TILE });
    statue(B, -4.1, 0.5, 0, 1);
    statue(B, 4.1, 0.5, 0, 1);
    orb(B, -7.4, 0.9);
    orb(B, 7.4, 0.9);
    floorLoot(out, B, 0, 0.25, 0.8);
  }, HC);

  // Freitreppe: 25 Stufen, seitlich massive Brüstungen mit schrägem Handlauf
  P.build(0, STAIR_Z, 0, (B) => {
    const n = 27, rise = (HC - HP) / n, run = 0.52, w = 8;
    for (let i = 0; i < n; i++) B.box(0, 0, -i * run, w, (i + 1) * rise, run, K.STONE_L, stone());
    const L = Math.hypot(n * run, HC - HP), slope = Math.atan2(HC - HP, n * run);
    for (const sg of [-1, 1]) {
      const x = sg * (w / 2 + 0.95);
      for (let i = 0; i < n; i++) B.box(x, -1.6, -i * run, 1.9, (i + 1) * rise + 1.6 + 0.75, run, K.STONE, stone());
      B.box(x, (HC - HP) / 2 + 0.75, -(n - 1) * run / 2, 2.1, 0.3, L + 0.4, K.STONE_L, stone({ col: false, rx: slope }));
      B.box(x, (HC - HP) / 2 + 1.05, -(n - 1) * run / 2, 1.9, 0.14, L + 0.3, K.SNOW, { col: false, tx: TX.SNOW, rx: slope });
      B.box(x, -1.6, 0.6, 2.3, 2.8, 1.0, K.STONE_D, stone());
    }
  }, HP);

  // Achteckiger Statuenplatz mit Brüstung, Rune-Gravur und drei Statuen
  P.build(0, PLAZA_Z, 0, (B, out, ctx) => {
    const R = 11;
    B.cyl(0, -4.5, 0, R, 4.5, K.STONE_D, { seg: 8, ry: Math.PI / 8, col: false, m: MAT.STONE, tx: TX.STONE });
    B.cyl(0, -4.5, 0, 10.45, 4.5, 0, { seg: 8, m: MAT.STONE });
    B.parts[B.parts.length - 1].inv = true;
    B.cyl(0, -0.1, 0, R - 0.25, 0.12, K.FLOOR, { seg: 8, ry: Math.PI / 8, col: false, tx: TX.TILE });
    // Gravur: Doppelring, drei Kreise, Verbindungslinien
    ringFlat(B, 0, 0, 0.02, 7.4, 56);
    ringFlat(B, 0, 0, 0.02, 6.8, 52);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + Math.PI / 2;
      const [cx, cz] = polar(a, 3.9);
      ringFlat(B, cx, cz, 0.02, 2.0, 22);
      ringFlat(B, cx, cz, 0.02, 1.3, 16);
      const [lx, lz] = polar(a + Math.PI / 3, 3.9);
      B.box(lx * 0.5, 0.02, lz * 0.5, 0.14, 0.03, 3.9, K.RUNE, { col: false, ry: -(a + Math.PI / 3) + Math.PI / 2 });
    }
    // Brüstung an allen Seiten außer zur Treppe, vorne mit Durchgang
    const inR = R * Math.cos(Math.PI / 8) - 0.3, edge = 2 * R * Math.sin(Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const [ex, ez] = polar(a, inR);
      if (ez < -9) continue; // Norden: Treppe
      const ry = -a + Math.PI / 2;
      if (k % 2 === 0) {
        // gerade Seiten (Ost, Süd, West): Brüstung mit Durchgang in der Mitte
        const [tx, tz] = [-Math.sin(a), Math.cos(a)];
        for (const sg of [-1, 1]) {
          const off = sg * (edge / 4 + 1.05);
          B.box(ex + tx * off, 0, ez + tz * off, edge / 2 - 2.1, 0.8, 0.45, K.STONE_L, stone({ ry }));
          snowTop(B, ex + tx * off, 0.8, ez + tz * off, edge / 2 - 2.1, 0.45, ry);
        }
      } else {
        B.box(ex, 0, ez, edge - 0.3, 0.8, 0.45, K.STONE_L, stone({ ry }));
        snowTop(B, ex, 0.8, ez, edge - 0.3, 0.45, ry);
      }
    }
    statue(B, 0, 0.6, 0, 1.2, true);
    statue(B, -5.9, -8.0, 0, 1);
    statue(B, 5.9, -8.0, 0, 1);
    chest(out, B, -6.2, 0, -2.2, Math.PI / 2);
    floorLoot(out, B, 4.5, 0, 2.5);
    // Treppe vom Platz hinunter in den Schnee (nach Süden)
    const southZ = R * Math.cos(Math.PI / 8);
    const g = ctx.hAt(0, PLAZA_Z + southZ + 3);
    const drop = HP - g;
    if (drop > 0.4) {
      const n = Math.ceil(drop / 0.29), run = 0.55;
      const S = B.sub(0, southZ + (n - 1) * run + run / 2, 0, -drop);
      for (let i = 0; i < n; i++) S.box(0, -0.5, -i * run, 3.8, (i + 1) * (drop / n) + 0.5, run, K.STONE_L, stone());
    }
  }, HP);

  // Eisbrocken an den Hängen rund um die Feste
  for (const [x, z, s, v] of [[-13, -33, 1.5, 0], [14, -34, 1.3, 1], [-23, -34, 1.8, 2], [25, -33.5, 1.6, 0], [-12, -22, 0.9, 1],
    [15, -21, 1.0, 2], [-35, -34, 1.7, 1], [36, -33, 1.5, 2], [-50, -40, 1.6, 0], [50, -38, 1.8, 1], [-9, -28, 1.1, 2], [10, -27, 1.2, 0]]) P.prop('icechunk', x, z, x * 0.1, s, v);
  for (const [x, z, s, v] of [[-17, -9, 1.1, 0], [19, -12, 1.3, 1], [26, -2, 1.0, 2], [-24, 2, 1.2, 1]]) P.prop('boulder', x, z, z * 0.2, s, v);
}

// ---------------------------------------------------------------------------
// Frosttal: Dorf aus verschneiten Blockhütten um einen Platz mit Brunnen, dazu ein Gasthaus
function village(P) {
  const cx = 2, cz = 96;
  P.poi('Frosttal', cx, cz, 34);
  P.flat(cx, cz, 30, null, 12);
  P.paintCircle(cx, cz, 9, SURF.PATH);
  P.build(cx, cz, 0, (B) => {
    B.cyl(0, 0, 0, 1.6, 0.9, K.STONE, { seg: 10, m: MAT.STONE, tx: TX.STONE });
    B.cyl(0, 0.9, 0, 1.3, 0.05, 0x9fd6ea, { seg: 10, col: false, tx: TX.ICE });
    for (const sg of [-1, 1]) B.box(sg * 1.1, 0.9, 0, 0.2, 2.2, 0.2, C.WOOD_DARK, { col: false });
    B.prism(0, 3.1, 0, 2.8, 1.0, 1.2, K.ROOF, { ry: Math.PI / 2 });
    snowRoof(B, 0, 3.1, 0, 2.8, 1.0, 1.2, Math.PI / 2);
  });
  const spots = [[0, 21, 'lodge'], [50, 22, 'cabin'], [105, 20, 'cabin'], [155, 22, 'cabin'], [205, 21, 'cabin'], [250, 22, 'cabin'], [300, 20, 'shed'], [330, 23, 'cabin']];
  spots.forEach(([deg, r, type], k) => {
    const a = (deg / 180) * Math.PI - Math.PI / 2;
    const [x, z] = polar(a, r);
    const wx = cx + x, wz = cz + z;
    P.build(wx, wz, face(wx, wz, cx, cz), (B, out) => {
      if (type === 'lodge') {
        house2(B, out, { w: 11, d: 10, wall: 0x7a5236, roof: K.ROOF, trim: 0x4e3524, porch: false, chest2: true, frame: false });
        snowRoof(B, 0, 6.55, 0, 11, 3.2, 12, Math.PI / 2);
        B.box(3.2, 6.3, -2.5, 1.0, 4.2, 1.0, K.STONE_D, stone());
        smoke(out, B, 3.2, 10.6, -2.5);
        sign(out, B, 0, 3.55, 5.2, 4.8, 0.9, 'GASTHAUS', 0, '#5a3a22', '#ffe9b0');
      } else if (type === 'shed') {
        B.box(0, 0, 0, 5, 0.2, 4, C.PLANK, { m: MAT.WOOD });
        B.wall(-2.5, 2, 2.5, 2, 2.6, 0.25, 0x7a5236, [{ at: 2.5, w: 1.9, y0: 0, y1: 2.2 }]);
        B.wall(2.5, -2, -2.5, -2, 2.6, 0.25, 0x7a5236);
        B.wall(-2.5, -2, -2.5, 2, 2.6, 0.25, 0x7a5236);
        B.wall(2.5, 2, 2.5, -2, 2.6, 0.25, 0x7a5236);
        B.prism(0, 2.6, 0, 5.6, 1.4, 4.8, K.ROOF, { col: true });
        snowRoof(B, 0, 2.6, 0, 5.6, 1.4, 4.8);
        for (let i = 0; i < 3; i++) B.box(-3.2, 0, -1.2 + i * 1.2, 0.9, 0.45 + (i % 2) * 0.45, 1.0, C.WOOD, { m: MAT.WOOD });
        chest(out, B, 0.8, 0.2, -1.1, 0);
      } else {
        cabin(B, out, { w: 6.5 + (k % 2) * 0.8, d: 5.5, wall: k % 3 ? 0x6e4a31 : 0x7d5a3c, roof: K.ROOF });
        const w = 6.5 + (k % 2) * 0.8;
        snowRoof(B, 0, 2.95, 0, 6.7, 2.0, w + 1.2, Math.PI / 2);
        if (k % 2) smoke(out, B, w / 2 - 1.0, 6.4, -0.6);
      }
    });
  });
  for (const [x, z] of [[-8, 80], [12, 80], [-14, 108], [18, 110]]) P.build(x, z, 0, (B) => B.lamppost(0, 0, 3.2));
  P.build(cx, cz - 36, 0, (B, out) => {
    for (const lx of [-2.3, 2.3]) B.cyl(lx, 0, 0, 0.13, 2.8, C.WOOD_DARK, { seg: 6 });
    B.box(0, 1.6, 0, 5.4, 1.3, 0.2, 0x5a3a22, { col: false });
    sign(out, B, 0, 2.25, 0.12, 5.0, 1.1, 'FROSTTAL', 0, '#5a3a22', '#ffffff');
  });
}

// Eishafen: Stege ins Meer, Bootshaus, Container, eingefrorener Kutter
function harbor(P) {
  const a = 0.72;
  const [hx, hz] = polar(a, 124);
  const rot = face(hx, hz, hx * 2, hz * 2); // Front zum Meer
  P.poi('Eishafen', hx, hz, 28);
  P.flat(hx, hz, 20, 1.6, 10);
  P.paintCircle(hx, hz, 17, SURF.PATH);
  P.build(hx, hz, rot, (B, out) => {
    // Bootshaus (offene Halle mit Blechdach)
    const W = 14, D = 10, H = 5;
    B.box(-6, 0, -3, W, 0.25, D, C.PLANK, { m: MAT.WOOD });
    B.wall(-6 - W / 2, -3 - D / 2, -6 + W / 2, -3 - D / 2, H, 0.3, 0x5f6b75, [{ at: 4, w: 1.4, y0: 1.4, y1: 2.6 }, { at: 10, w: 1.4, y0: 1.4, y1: 2.6 }], { m: MAT.METAL, tx: TX.METAL, frame: false });
    B.wall(-6 - W / 2, -3 + D / 2, -6 - W / 2, -3 - D / 2, H, 0.3, 0x5f6b75, [{ at: 5, w: 2, y0: 0, y1: 2.6 }], { m: MAT.METAL, tx: TX.METAL, frame: false });
    B.wall(-6 + W / 2, -3 - D / 2, -6 + W / 2, -3 + D / 2, H, 0.3, 0x5f6b75, [], { m: MAT.METAL, tx: TX.METAL });
    B.box(-6, H, -3, W + 0.8, 0.25, D + 0.8, 0x4a525a, { m: MAT.METAL, tx: TX.METAL });
    snowTop(B, -6, H + 0.25, -3, W + 0.8, D + 0.8);
    chest(out, B, -11, 0.25, -6.5, 0);
    floorLoot(out, B, -3, 0.25, -2);
    container(B, 7, -6, 0.1, 0xb23a2e, false);
    container(B, 7, -6, 0.1, 0x2f6fb0, false, 2.6);
    container(B, 8.5, 1, -0.2, 0x3d8f5a, true);
    chest(out, B, 7.6, 0.12, 1.3, Math.PI / 2 - 0.2);
    B.box(7, 5.2, -6, 6.2, 0.16, 2.5, K.SNOW, { col: false, tx: TX.SNOW, ry: 0.1 });
    for (const x of [-8, -2, 4]) B.crate(x, 0, 6, 1.2, x * 0.3);
  });
  // Stege ab dem Strand ins Meer und ein eingefrorener Fischkutter daneben
  P.build(hx, hz, rot, (B, out, ctx) => {
    let d = 8;
    while (d < 60 && ctx.hAt(B.wx(0, d), B.wz(0, d)) > 0.35) d += 0.5;
    for (const [off, len, boat] of [[-9, 22, false], [3, 18, true]]) dock(B.sub(off, d - 3, 0, 0.3 - B.oy), out, len, 3.2, 0.7, boat);
    const S = B.sub(-3, d + 12, 0.3, -0.2 - B.oy);
    S.box(0, -0.8, 0, 4.2, 2.2, 11, 0x9c3a2e, { m: MAT.WOOD, tx: TX.WOOD });
    S.box(0, -0.8, 5.6, 2.6, 2.2, 1.8, 0x9c3a2e, { col: false });
    S.box(0, 1.4, 0, 3.8, 0.2, 10.4, C.BOARD, { m: MAT.WOOD, tx: TX.WOOD });
    S.box(0, 1.6, -2.5, 3, 2.4, 3.2, 0xe8e4dc, { m: MAT.WOOD });
    S.box(0, 4.0, -2.5, 3.3, 0.2, 3.5, K.SNOW, { col: false, tx: TX.SNOW });
    S.cyl(0, 1.6, 2.5, 0.12, 5, C.WOOD_DARK, { seg: 6 });
    chest(out, S, 0.8, 1.6, 2.2, 0);
  });
  P.build(hx - Math.cos(a) * 22, hz - Math.sin(a) * 22, rot, (B, out) => {
    for (const lx of [-2.3, 2.3]) B.cyl(lx, 0, 0, 0.13, 2.8, C.WOOD_DARK, { seg: 6 });
    B.box(0, 1.6, 0, 5.4, 1.3, 0.2, 0x2f4f6f, { col: false });
    sign(out, B, 0, 2.25, -0.12, 5.0, 1.1, 'EISHAFEN', Math.PI, '#2f4f6f', '#ffffff');
  });
}

// Spiegelsee: gefrorener See mit Eisfischer-Hütten, Steg und Bootshütte am Ufer
function frozenLake(P) {
  const lx = -84, lz = 40;
  P.poi('Spiegelsee', lx, lz, 32);
  P.iceLake(lx, lz, 23, 1.35, 1.0, 0.45);
  for (const [x, z, ry, loot] of [[-92, 34, 0.4, true], [-74, 46, -0.6, true], [-86, 50, 1.9, false]]) {
    P.build(x, z, ry, (B, out) => {
      // Tür 1,8 m breit, damit auch Bots wieder hinausfinden
      B.box(0, 0, 0, 3.8, 0.15, 3.2, C.PLANK, { m: MAT.WOOD });
      B.wall(-1.9, 1.6, 1.9, 1.6, 2.4, 0.18, 0xb8452f, [{ at: 1.9, w: 1.8, y0: 0, y1: 2.0 }]);
      B.wall(1.9, -1.6, -1.9, -1.6, 2.4, 0.18, 0xb8452f);
      B.wall(-1.9, -1.6, -1.9, 1.6, 2.4, 0.18, 0xb8452f, [{ at: 1.6, w: 0.8, y0: 1.1, y1: 1.7 }]);
      B.wall(1.9, 1.6, 1.9, -1.6, 2.4, 0.18, 0xb8452f);
      B.prism(0, 2.4, 0, 4.2, 1.0, 3.6, K.ROOF, { col: true, ry: Math.PI / 2 });
      snowRoof(B, 0, 2.4, 0, 4.2, 1.0, 3.6, Math.PI / 2);
      B.cyl(-2.8, 0, 0.8, 0.45, 0.02, 0x1d3f55, { seg: 10, col: false });
      B.box(-2.8, 0, 1.3, 0.05, 1.2, 0.05, C.WOOD_DARK, { col: false, rx: 0.4 });
      if (loot) chest(out, B, 0.6, 0.15, -0.8, Math.PI);
      else floorLoot(out, B, 0, 0.15, 0);
    });
  }
  // Steg vom Ufer aufs Eis und Bootshütte
  P.build(-78, 66, face(-78, 66, lx, lz), (B, out) => {
    B.box(0, 0.1, 5, 2.6, 0.2, 10, C.BOARD, { m: MAT.WOOD, tx: TX.WOOD });
    for (let z = 1; z < 10; z += 3) for (const sg of [-1, 1]) B.cyl(sg * 1.1, -0.8, z, 0.14, 1.2, C.WOOD_DARK, { seg: 6, col: false });
    B.boat(2.4, 7, 0.3, C.WALL_BLUE, 0.1);
    floorLoot(out, B, 0, 0.3, 8);
  });
  P.flat(-106, 10, 7, null, 6);
  P.build(-106, 10, face(-106, 10, lx, lz), (B, out) => {
    cabin(B, out, { w: 7, d: 5.5, wall: 0x6e4a31, roof: K.ROOF });
    snowRoof(B, 0, 2.95, 0, 6.7, 2.0, 8.2, Math.PI / 2);
  });
}

// Forschungsstation auf den Gletscherstufen: Container-Labore, Funkmast, Radarschüssel, Zelte
function station(P) {
  const sx = 80, sz = -6;
  P.poi('Gletscherstation', sx, sz, 30);
  P.shelf(66, -16, 18, 2.0);
  P.shelf(sx, sz, 14, 2.2);
  P.shelf(74, 18, 12, 1.8);
  P.shelf(94, 12, 10, 1.6);
  P.flat(sx, sz, 9, null, 4);
  P.build(sx, sz, face(sx, sz), (B, out) => {
    container(B, -3.5, 0, 0, 0xe0673a, true);
    container(B, 3.8, -1.2, Math.PI / 2, 0xd9dde3, true);
    for (const [x, z, w, d, ry] of [[-3.5, 0, 6.2, 2.5, 0], [3.8, -1.2, 6.2, 2.5, Math.PI / 2]]) snowTop(B, x, 2.6, z, w, d, ry);
    chest(out, B, -5.6, 0.12, 0, Math.PI / 2);
    chest(out, B, 3.8, 0.12, -3.6, 0);
    // Funkmast mit Abspannung
    B.cyl(0, 0, -6, 0.18, 12, 0xd23c3c, { seg: 6, m: MAT.METAL });
    for (let y = 2; y < 12; y += 2) B.box(0, y, -6, 0.9, 0.08, 0.9, 0xe8e8e8, { col: false });
    B.box(0, 12, -6, 0.3, 0.3, 0.3, 0xff4040, { col: false, e: 1 });
    // Radarschüssel
    B.cyl(5, 0, 5, 0.5, 2.2, C.STEEL_DARK, { seg: 8, m: MAT.METAL });
    B.sph(5, 3.2, 5, 1.9, 0xe9edf1, { sy: 0.45, rx: 0.9, tx: TX.METAL });
    floorLoot(out, B, 0, 0, 3);
  });
  P.build(sx - 10, sz + 9, 0.5, (B) => {
    tent(B, 0, 0, 0, 0xe8792f);
    tent(B, 3.5, -1.5, -0.4, 0xd9534f);
  });
}

// Außenposten: Kuppelturm mit Beute an vier Stellen der Insel
function outposts(P) {
  for (const [x, z] of [[-122, -22], [126, 46], [-60, 118], [52, 130]]) {
    P.flat(x, z, 8, null, 8);
    P.keep(x, z, 11);
    P.build(x, z, face(x, z), (B, out) => domeTower(B, out, {}));
    P.pois.push({ id: 'out' + P.pois.length, name: '', x, z, r: 14, minor: true });
  }
}

// ---------------------------------------------------------------------------
// Gelände der ganzen Insel: Hornspitze hinter der Feste, Bergkette im Norden, gefrorener Fluss
// vom Gebirge zum Spiegelsee und weiter ins Meer, sanfte Schneehügel, Fichtenwälder, Pfade
function landscape(P) {
  // Berge begehbar: breiter und flacher (Flanken unter ~44°), wenig Zacken
  const soft = { exp: 1.0, jag: 0.04, spur: 0.1, wob: 0.06 };
  P.peak(4, -134, 76, 52, { ridges: 3, rot: 0.45, ...soft });
  P.peak(-72, -120, 54, 30, { ridges: 3, rot: 1.1, ...soft });
  P.peak(80, -114, 58, 34, { ridges: 3, rot: 0.2, ...soft });
  P.peak(130, -56, 44, 20, { ridges: 3, rot: 0.8, ...soft });
  P.peak(-132, -62, 46, 22, { ridges: 3, rot: 2.0, ...soft });
  P.ridge([[-158, -30], [-128, -92], [-66, -138], [8, -156], [82, -142], [136, -98], [160, -36]], 70, 13, 0.1);
  // ganzes Gebirge im Norden begehbar (Hänge höchstens ~39°, der Gipfelweg ist flacher)
  P.soften(-190, -215, 190, -58, 0.8, 14);
  for (const [x, z, r, h] of [[-100, -56, 30, 9], [100, -64, 26, 10], [-22, 134, 24, 6], [142, 14, 22, 7], [-142, 30, 24, 7], [40, 74, 20, 5]]) P.hill(x, z, r, h);
  // Fluss aus dem Gebirge (Eishöhe fällt zum See ab) und Abfluss ins Meer
  P.iceRiver([[-62, -124, 24], [-63, -86, 13], [-62, -52, 7.5], [-57, -22, 3.6], [-55, 6, 1.4], [-66, 28, 0.45]], 9);
  P.iceRiver([[-100, 50, 0.45], [-120, 78, 0.35], [-140, 100, 0.25], [-162, 118, 0.2]], 12);
  P.glacier(-60, -46, 14);
  // Pfade (festgetretener Schnee)
  P.road([[0, -3], [2, 30], [-2, 60], [2, 74]], 4, SURF.PATH);
  P.road([[22, 100], [60, 96], [96, 86]], 4, SURF.PATH);
  P.road([[-18, 92], [-50, 70], [-70, 56]], 4, SURF.PATH);
  P.road([[12, -4], [40, 0], [64, -4]], 4, SURF.PATH);
  // Fichtenwälder
  for (const [x, z, r, d] of [[-28, 30, 20, 1], [-120, 4, 22, 1], [40, 58, 20, 0.9], [-102, 98, 18, 1], [104, -58, 16, 0.8],
    [118, -6, 16, 0.9], [-26, -92, 14, 0.7], [70, 92, 14, 0.9], [-40, 150, 12, 0.8], [-150, 60, 14, 0.8]]) P.forest(x, z, r, d);
}

// ---------------------------------------------------------------------------
// Hornspitze begehbar: Gipfelweg von der Festungsterrasse in Kehren bis auf den flachen Gipfel
// (Steigung höchstens ~21°, auch für Bots), unterwegs die Bergstation, oben ein Aussichtspunkt
// mit Hütte, Aussichtsturm und Truhen.
const TRAIL = [[-36, -72, HC], [-44, -98, 27], [-34, -124, 37], [-14, -146, 45], [12, -152, 50], [6, -141, 52]];
const SUMMIT = { x: 4, z: -134, h: 52 };

function mountain(P) {
  P.flat(SUMMIT.x, SUMMIT.z, 8, SUMMIT.h, 6);
  for (let i = 0; i + 1 < TRAIL.length; i++) {
    const [x1, z1, h1] = TRAIL[i], [x2, z2, h2] = TRAIL[i + 1];
    P.ramp(x1, z1, h1, x2, z2, h2, 5.5, i === 0 ? 8 : 4); // erstes Stück führt als breiter Damm über den Sims
  }
  P.road(TRAIL.map(([x, z]) => [x, z]), 4.2, SURF.PATH);
  P.poi('Hornspitze', SUMMIT.x, SUMMIT.z, 18);
  P.keep(SUMMIT.x, SUMMIT.z, 14);
  // Gipfel: Steinhütte, Aussichtsturm mit Treppe, Gipfelkreuz, Fahne, Bänke
  P.build(SUMMIT.x, SUMMIT.z, 0.6, (B, out) => {
    // Hütte (Tür Richtung Weg)
    const w = 5.2, d = 4.2, h = 2.7;
    B.box(0, 0, 0, w, 0.2, d, K.FLOOR, { m: MAT.STONE, tx: TX.TILE });
    B.wall(-w / 2, d / 2, w / 2, d / 2, h, 0.4, K.STONE, [{ at: w / 2, w: 1.9, y0: 0, y1: 2.2 }], stone({ frame: false }));
    B.wall(w / 2, -d / 2, -w / 2, -d / 2, h, 0.4, K.STONE, [{ at: w / 2, w: 1.1, y0: 1.1, y1: 1.9 }], stone({ frame: false }));
    B.wall(-w / 2, -d / 2, -w / 2, d / 2, h, 0.4, K.STONE, [], stone({ frame: false }));
    B.wall(w / 2, d / 2, w / 2, -d / 2, h, 0.4, K.STONE, [], stone({ frame: false }));
    B.prism(0, h, 0, w + 0.8, 1.4, d + 0.8, K.ROOF, { col: true });
    snowRoof(B, 0, h, 0, w + 0.8, 1.4, d + 0.8);
    chest(out, B, -1.5, 0.2, -1.2, 0);
    floorLoot(out, B, 1.2, 0.2, -0.8);
    // Aussichtsturm aus Holz: Plattform auf 4 m, Treppe, Brüstung
    const T = B.sub(5.6, -4.2, 0, 0);
    T.box(0, 3.8, 0, 3.6, 0.25, 3.6, C.BOARD, { m: MAT.WOOD, tx: TX.WOOD });
    for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) T.cyl(x, 0, z, 0.16, 3.8, C.WOOD_DARK, { seg: 6 });
    T.railing(-1.8, -1.8, 1.8, -1.8, 4.05, 1.0, C.WOOD_DARK);
    T.railing(1.8, -1.8, 1.8, 1.8, 4.05, 1.0, C.WOOD_DARK);
    T.railing(-1.8, -1.8, -1.8, 1.8, 4.05, 1.0, C.WOOD_DARK);
    T.stairs(0.9, 2.05 + 11 * 0.5, 1.2, 0.34, 0.5, 12, C.WOOD);
    chest(out, T, 0, 4.05, -0.8, Math.PI);
    // Gipfelkreuz und Fahne
    B.cyl(-6, 0, 3, 0.14, 4.2, C.WOOD_DARK, { seg: 6 });
    B.box(-6, 2.9, 3, 1.8, 0.18, 0.18, C.WOOD_DARK, { col: false });
    B.cyl(-4, 0, -5, 0.07, 5.5, 0x2a2a2a, { seg: 5, col: false });
    B.box(-3.3, 4.6, -5, 1.4, 0.8, 0.05, 0xd23c3c, { col: false });
    for (const [x, z, ry] of [[-2.5, 5.5, 0.2], [2.8, 5.8, -0.3]]) B.box(x, 0, z, 1.8, 0.45, 0.5, C.WOOD, { m: MAT.WOOD, ry });
    sign(out, B, 0, 3.05, d / 2 + 0.5, 2.6, 0.6, 'HORNSPITZE', 0, '#5a3a22', '#ffffff');
  }, SUMMIT.h);
  // Bergstation auf halber Höhe (Rasthütte mit Truhe neben dem Weg)
  const [bx, bz, bh] = [-26, -150, 45];
  P.flat(bx, bz, 5.5, bh, 4);
  P.poi('Bergstation', bx, bz, 12);
  P.build(bx, bz, face(bx, bz, -14, -146), (B, out) => {
    cabin(B, out, { w: 5.6, d: 4.6, wall: 0x6e4a31, roof: K.ROOF });
    snowRoof(B, 0, 2.95, 0, 5.8, 2.0, 6.8, Math.PI / 2);
  }, bh);
  // Wegweiser am Beginn des Gipfelwegs
  P.build(-33, -69, 0, (B, out) => {
    B.cyl(0, 0, 0, 0.12, 2.6, C.WOOD_DARK, { seg: 6 });
    sign(out, B, 0, 2.1, 0.1, 2.6, 0.6, 'GIPFELWEG', 0, '#5a3a22', '#ffe9b0');
  }, HC);
}

function frostPlan(P) {
  landscape(P);
  mountain(P);
  citadel(P);
  village(P);
  harbor(P);
  frozenLake(P);
  station(P);
  outposts(P);
}

export const MAPS = [
  {
    id: 'frostfeste',
    name: 'Frostfeste',
    seed: 2126,
    // Küstenform: Ausbuchtungen [Grad, m, Breite]
    shape: [[-90, 14, 0.9], [150, 10, 0.6], [30, -8, 0.5], [220, 8, 0.7]],
    hillAmp: 6,
    baseH: 2.2,
    chests: 60,
    floorLoot: 74,
    scatter: { pine: 110, boulder: 36, ice: 14, floe: 46 },
    plan: frostPlan,
  },
];
