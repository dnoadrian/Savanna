// Baukasten für die Insel-Karten (Chapter-2-Orte): Häuser, Läden, Tankstelle, Lagerhallen,
// Scheune, Silos, Container, Kirche, Villa, Kühltürme, Tanks, Kräne, Yacht, Bohrinsel …
// Jede Funktion baut mit einem Builder (Ursprung = Bodenhöhe, Vorderseite = lokales +Z) Parts
// für Rendering + Kollision und trägt Truhen, Bodenbeute, Schilder und Rauch in `out` ein.
import { C } from './builder.js';
import { MAT } from '../physics/collision.js';

// ---------------------------------------------------------------------------
// kleine Helfer
export function chest(out, B, lx, ly, lz, ry = 0) {
  out.chests.push({ x: B.wx(lx, lz), y: B.oy + ly, z: B.wz(lx, lz), ry: B.rot + ry });
}
export function floorLoot(out, B, lx, ly, lz) {
  out.floorLoot.push({ x: B.wx(lx, lz), y: B.oy + ly, z: B.wz(lx, lz) });
}
export function sign(out, B, lx, ly, lz, w, h, text, ry = 0, bg = '#6b3f22', fg = '#ffe9b0') {
  out.signs.push({ x: B.wx(lx, lz), y: B.oy + ly, z: B.wz(lx, lz), ry: B.rot + ry, w, h, text, bg, fg });
}
export function smoke(out, B, lx, ly, lz) {
  out.smoke.push({ x: B.wx(lx, lz), y: B.oy + ly, z: B.wz(lx, lz) });
}

// Planken-Plattform (Oberkante = ly)
export function deck(B, cx, cz, w, d, ly = 0, dir = 'x', color = C.BOARD) {
  B.box(cx, ly - 0.22, cz, w, 0.22, d, color, { m: MAT.WOOD });
  const n = Math.round((dir === 'x' ? d : w) / 0.9);
  for (let i = 0; i < n; i += 2) {
    const k = (i + 0.5) / n - 0.5;
    const col = i % 3 === 0 ? C.BOARD_LIGHT : C.BOARD_DARK;
    if (dir === 'x') B.box(cx, ly - 0.01, cz + k * d, w, 0.03, (d / n) * 0.92, col, { col: false });
    else B.box(cx + k * w, ly - 0.01, cz, (w / n) * 0.92, 0.03, d, col, { col: false });
  }
}

// Pfähle unter einer Plattform bis zum Grund
export function posts(B, x0, x1, z0, z1, step, depth = 1.6, top = 0, c = C.BOARD_DARK) {
  for (let x = x0; x <= x1 + 0.01; x += step) {
    for (const z of [z0, z1]) B.cyl(x, top - depth, z, 0.17, depth, c, { seg: 6, col: false });
  }
  for (let z = z0 + step; z < z1 - 0.01; z += step) {
    for (const x of [x0, x1]) B.cyl(x, top - depth, z, 0.17, depth, c, { seg: 6, col: false });
  }
}

// Rohr zwischen zwei lokalen Punkten (nur Optik)
export function pipe(B, x1, y1, z1, x2, y2, z2, r, c = C.STEEL, col = false) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  const len = Math.hypot(dx, dy, dz);
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(Math.hypot(dx, dz), dy);
  B.cyl((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, r, len, c, { center: true, ry: yaw, rx: pitch, seg: 8, col: false });
  if (col && Math.abs(dy) < 0.01) {
    // waagrechtes Rohr: Kollisionsbox
    B.box((x1 + x2) / 2, y1 - r, (z1 + z2) / 2, r * 2, r * 2, len, 0, { ry: yaw, m: MAT.METAL });
    B.parts[B.parts.length - 1].inv = true;
  }
}

// Fenster-Öffnung
const win = (at, w = 1.3, y0 = 1.0, y1 = 2.1) => ({ at, w, y0, y1 });
const door = (at, w = 1.8, y1 = 2.4) => ({ at, w, y0: 0, y1 });

// Innentreppe: steigt Richtung lokales -Z, oben bei Höhe top; x = Mitte der Treppe
function innerStairs(S, x, zBottom, width, top, run = 0.6) {
  const steps = Math.max(4, Math.round(top / 0.31));
  S.stairs(x, zBottom, width, top / steps, run, steps, C.WOOD);
  return zBottom - (steps - 1) * run - run / 2; // Oberkante (hinten)
}

// ---------------------------------------------------------------------------
// Zweistöckiges Wohnhaus: Tür vorne (+Z), Treppe an der rechten Wand (+X), Satteldach.
// o: { w, d, wall, roof, trim, porch, chest2 }
export function house2(B, out, o = {}) {
  const w = Math.max(9, o.w ?? 10), d = Math.max(9, o.d ?? 9.5);
  const H1 = 3.2, H2 = 2.9, t = 0.25;
  const hw = w / 2, hd = d / 2;
  const wc = o.wall ?? C.WALL_WHITE, rc = o.roof ?? C.ROOF_RED, trim = o.trim ?? C.WOOD_DARK;
  B.box(0, 0, 0, w, 0.2, d, o.floor ?? C.PLANK, { m: MAT.WOOD });
  B.wall(-hw, hd, hw, hd, H1, t, wc, [door(w * 0.32), win(w * 0.72, 1.5)], o);
  B.wall(hw, -hd, -hw, -hd, H1, t, wc, [door(w * 0.25, 1.4, 2.3), win(w * 0.7)], o);
  B.wall(-hw, -hd, -hw, hd, H1, t, wc, [win(d * 0.3), win(d * 0.72)], o);
  B.wall(hw, hd, hw, -hd, H1, t, wc, [win(d * 0.5, 1.1)], o);
  // Obergeschoss-Boden mit Treppenloch rechts vorne
  const sx = hw - 0.85, sw = 1.3;
  const top = H1 + t;
  const zTop = innerStairs(B, sx, hd - 0.9, sw, top);
  const holeX = hw - 1.6;
  B.box((-hw + holeX) / 2, H1, 0, holeX + hw, t, d, C.PLANK, { m: MAT.WOOD });
  const backLen = zTop + hd;
  if (backLen > 0.2) B.box((holeX + hw) / 2, H1, (-hd + zTop) / 2, hw - holeX, t, backLen, C.PLANK, { m: MAT.WOOD });
  B.railing(holeX, zTop + 0.2, holeX, hd - 0.3, top, 0.95, trim);
  // Obergeschoss
  const U = B.sub(0, 0, 0, top);
  U.wall(-hw, hd, hw, hd, H2, t, wc, [win(w * 0.28), win(w * 0.72)], o);
  U.wall(hw, -hd, -hw, -hd, H2, t, wc, [win(w * 0.3), win(w * 0.72)], o);
  U.wall(-hw, -hd, -hw, hd, H2, t, wc, [win(d * 0.5, 1.4)], o);
  U.wall(hw, hd, hw, -hd, H2, t, wc, [win(d * 0.25)], o);
  // Decke + Dach (First entlang X)
  const yr = top + H2;
  B.box(0, yr, 0, w + 0.2, 0.2, d + 0.2, C.WOOD_DARK, { m: MAT.WOOD });
  B.prism(0, yr + 0.2, 0, d + 1.0, Math.min(3.2, d * 0.34), w + 1.0, rc, { col: true, ry: Math.PI / 2 });
  for (const sx2 of [-1, 1]) for (const sz of [-1, 1]) B.box(sx2 * (hw - 0.05), 0, sz * (hd - 0.05), 0.3, yr, 0.3, trim, { col: false });
  // Veranda
  if (o.porch !== false) {
    B.box(-hw * 0.35, 0, hd + 1.3, w * 0.62, 0.2, 2.4, C.BOARD, { m: MAT.WOOD });
    for (const px of [-hw + 0.3, -hw * 0.35 + w * 0.29]) B.cyl(px, 0.2, hd + 2.3, 0.12, 2.6, C.WALL_WHITE, { seg: 6 });
    B.tinRoof(-hw * 0.35, 2.8, hd + 1.3, w * 0.66, 2.6, -0.45, o.porchRoof ?? rc);
  }
  // Einrichtung
  B.box(-hw + 1.2, 0.2, -hd + 1.0, 2.2, 0.8, 0.9, C.CLOTH_BLUE, { m: MAT.CLOTH }); // Sofa
  B.box(-hw + 1.4, 0.2, 0.6, 1.4, 0.75, 1.0, C.WOOD, { m: MAT.WOOD }); // Tisch
  B.box(hw - 2.4, 0.2, -hd + 0.6, 1.0, 2.0, 0.7, C.WALL_WHITE, { m: MAT.METAL }); // Kühlschrank
  U.box(-hw + 1.3, 0, -hd + 1.3, 2.0, 0.6, 2.4, C.CLOTH_RED, { m: MAT.CLOTH }); // Bett
  U.box(hw - 2.6, 0, -hd + 0.5, 1.6, 2.0, 0.6, C.WOOD_DARK, { m: MAT.WOOD }); // Schrank
  chest(out, U, -hw + 1.0, 0, 1.2, Math.PI / 2);
  if (o.chest2) chest(out, B, -hw + 0.9, 0.2, hd - 2.2, Math.PI / 2);
  floorLoot(out, B, 0.2, 0.2, 0.5);
  floorLoot(out, U, 0.5, 0, -1);
  return B;
}

// Einstöckiges Haus mit Satteldach
export function house1(B, out, o = {}) {
  const w = o.w ?? 8, d = o.d ?? 7;
  const H = B.house(0, 0, w, d, { wall: o.wall ?? C.WALL_CREAM, roof: o.roof ?? C.ROOF_BROWN, wallH: 3.0, trim: o.trim ?? C.WOOD_DARK, backDoor: true, ridgeX: true });
  H.box(-w / 2 + 1.1, 0.22, -d / 2 + 0.9, 1.8, 0.75, 0.8, C.CLOTH_GREEN, { m: MAT.CLOTH });
  chest(out, H, w / 2 - 1.0, 0.22, -d / 2 + 1.0, -Math.PI / 2);
  floorLoot(out, H, -0.5, 0.22, 0.5);
  return H;
}

// Laden mit Flachdach, großen Schaufenstern und Schild über dem Eingang
// o: { w, d, h, wall, sign, signBg, signFg, awning }
export function shop(B, out, o = {}) {
  const w = o.w ?? 12, d = o.d ?? 10, h = o.h ?? 4.2, t = 0.3;
  const hw = w / 2, hd = d / 2;
  const wc = o.wall ?? C.WALL_CREAM;
  B.box(0, 0, 0, w, 0.15, d, C.CONCRETE, { m: MAT.STONE });
  const shopWin = (at, ww) => ({ at, w: ww, y0: 0.8, y1: 3.1 });
  B.wall(-hw, hd, hw, hd, h, t, wc, [shopWin(w * 0.2, w * 0.28), door(w / 2, 2.2, 2.6), shopWin(w * 0.8, w * 0.28)], { frameColor: C.STEEL_DARK, m: MAT.STONE });
  B.wall(hw, -hd, -hw, -hd, h, t, wc, [door(w * 0.8, 1.4, 2.3)], { m: MAT.STONE });
  B.wall(-hw, -hd, -hw, hd, h, t, wc, [win(d * 0.5)], { m: MAT.STONE });
  B.wall(hw, hd, hw, -hd, h, t, wc, [], { m: MAT.STONE });
  B.box(0, h, 0, w + 0.4, 0.3, d + 0.4, C.CONCRETE_DARK, { m: MAT.STONE });
  // Attika mit Schild
  B.box(0, h + 0.3, hd - 0.05, w + 0.4, 1.3, 0.3, o.trim ?? C.CONCRETE, { m: MAT.STONE });
  if (o.sign) sign(out, B, 0, h + 0.95, hd + 0.13, Math.min(w * 0.8, 9), 1.0, o.sign, 0, o.signBg ?? '#e8443a', o.signFg ?? '#ffffff');
  if (o.awning !== false) B.tinRoof(0, 3.2, hd + 0.9, w * 0.9, 1.8, -0.35, o.awning ?? C.RED);
  // Einrichtung: Theke, Regale
  B.box(-hw + 2.2, 0.15, -hd + 2.2, 2.6, 1.05, 0.8, C.WOOD_DARK, { m: MAT.WOOD });
  for (let i = 0; i < 2; i++) B.box(1 + i * 2.6, 0.15, -0.8, 0.7, 1.7, d * 0.45, C.STEEL, { m: MAT.METAL });
  chest(out, B, hw - 1.0, 0.15, -hd + 1.0, -Math.PI / 2);
  floorLoot(out, B, -1.5, 0.15, 1.5);
  return B;
}

// Tankstelle: Dach auf Säulen, Zapfsäulen, Shop dahinter
export function gasStation(B, out, o = {}) {
  const S = B.sub(0, -9);
  shop(S, out, { w: 12, d: 8, wall: o.wall ?? C.WALL_WHITE, sign: o.sign ?? 'GAS', signBg: '#1f6fd6', awning: C.BLUE });
  B.box(0, 0, 1.5, 16, 0.12, 10, C.CONCRETE, { m: MAT.STONE, col: false });
  for (const [x, z] of [[-6, -1.5], [6, -1.5], [-6, 4.5], [6, 4.5]]) B.box(x, 0, z, 0.5, 4.6, 0.5, C.WALL_WHITE, { m: MAT.METAL });
  B.box(0, 4.6, 1.5, 15, 0.55, 8.5, C.WALL_WHITE, { m: MAT.METAL });
  B.box(0, 4.6, 5.78, 15.1, 0.56, 0.08, o.stripe ?? C.RED, { col: false });
  B.box(0, 4.6, -2.78, 15.1, 0.56, 0.08, o.stripe ?? C.RED, { col: false });
  for (const x of [-3, 3]) {
    B.box(x, 0, 1.5, 1.6, 0.2, 3.2, C.CONCRETE_DARK, { m: MAT.STONE });
    for (const z of [0.6, 2.4]) {
      B.box(x, 0.2, z, 0.8, 1.6, 0.6, C.RED, { m: MAT.METAL });
      B.box(x, 1.3, z + 0.31, 0.5, 0.35, 0.02, C.LAMP, { col: false });
    }
  }
  // Preisschild
  B.cyl(8.6, 0, 6.5, 0.18, 5.5, C.STEEL_DARK, { seg: 6 });
  B.box(8.6, 5.5, 6.5, 2.2, 1.6, 0.3, C.WALL_WHITE, { col: false });
  sign(out, B, 8.6, 6.3, 6.67, 2.0, 1.2, o.sign ?? 'GAS', 0, '#1f6fd6', '#ffffff');
  floorLoot(out, B, 0, 0.1, 1.5);
  return B;
}

// Lagerhalle mit großen Toren, Laufsteg an der Rückwand und Containern innen
export function warehouse(B, out, o = {}) {
  const w = o.w ?? 22, d = o.d ?? 16, h = o.h ?? 7.5, t = 0.35;
  const hw = w / 2, hd = d / 2;
  const wc = o.wall ?? C.WALL_GREY;
  const opt = { m: MAT.METAL, frameColor: C.STEEL_DARK };
  B.box(0, 0, 0, w, 0.15, d, C.CONCRETE, { m: MAT.STONE });
  const gate = (at) => ({ at, w: 5, y0: 0, y1: 5 });
  B.wall(-hw, hd, hw, hd, h, t, wc, [gate(w * 0.3), win(w * 0.72, 2, 3, 4.5)], opt);
  B.wall(hw, -hd, -hw, -hd, h, t, wc, [gate(w * 0.62), door(w * 0.15, 1.6, 2.4)], opt);
  B.wall(-hw, -hd, -hw, hd, h, t, wc, [door(d * 0.3, 1.6), win(d * 0.7, 2, 3, 4.5)], opt);
  B.wall(hw, hd, hw, -hd, h, t, wc, [win(d * 0.5, 2.4, 3, 4.5)], opt);
  // Dach: flaches Wellblech
  B.box(0, h, 0, w + 0.6, 0.3, d + 0.6, o.roof ?? C.TIN_DARK, { m: MAT.METAL });
  for (let x = -hw; x <= hw; x += 1.1) B.box(x, h + 0.3, 0, 0.12, 0.08, d + 0.6, C.TIN, { col: false });
  // Laufsteg hinten mit Treppe links
  const cy = 3.3;
  B.box(0.8, cy, -hd + 1.4, w - 3.2, 0.2, 2.4, C.STEEL_DARK, { m: MAT.METAL });
  B.railing(-hw + 2.4, -hd + 2.6, hw - 0.8, -hd + 2.6, cy + 0.2, 1.0, C.STEEL);
  const steps = 11;
  B.stairs(-hw + 1.3, -hd + 2.8 + (steps - 1) * 0.5, 1.6, (cy + 0.2) / steps, 0.5, steps, C.STEEL_DARK);
  // Container + Kisten
  container(B, hw - 5, 2.5, Math.PI / 2 * 0, o.c1 ?? C.RED, false);
  container(B, -3, 3.4, 0.08, o.c2 ?? C.BLUE, true);
  B.crate(hw - 2.2, 0.15, -1.0, 1.2, 0.2);
  B.crate(hw - 2.0, 1.35, -1.1, 1.0, 0.5);
  B.crate(-hw + 2.0, 0.15, 3.0, 1.2, -0.3);
  chest(out, B, 2, cy + 0.2, -hd + 1.3, 0);
  chest(out, B, -hw + 1.2, 0.15, 1.2, Math.PI / 2);
  floorLoot(out, B, 0, 0.15, 0);
  floorLoot(out, B, hw - 3, 0.15, -4);
  return B;
}

// Schiffscontainer (L 6,1 × B 2,44 × H 2,6); open: an einer Stirnseite offen und begehbar
export function container(B, lx, lz, ry, color, open = false, ly = 0) {
  const S = B.sub(lx, lz, ry, ly);
  const L = 6.1, W = 2.44, H = 2.6;
  if (!open) S.box(0, 0, 0, L, H, W, color, { m: MAT.METAL });
  else {
    S.box(0, 0, 0, L, 0.12, W, C.STEEL_DARK, { m: MAT.METAL });
    S.box(0, 0, W / 2 - 0.06, L, H, 0.12, color, { m: MAT.METAL });
    S.box(0, 0, -W / 2 + 0.06, L, H, 0.12, color, { m: MAT.METAL });
    S.box(-L / 2 + 0.06, 0, 0, 0.12, H, W, color, { m: MAT.METAL });
    S.box(0, H - 0.12, 0, L, 0.12, W, color, { m: MAT.METAL });
    S.box(L / 2 + 0.5, 0, W / 2 - 0.1, 0.08, H, 1.1, color, { col: false, ry: -0.9 });
  }
  for (let i = 0; i < 9; i++) {
    const x = -L / 2 + 0.35 + i * ((L - 0.7) / 8);
    S.box(x, 0.05, W / 2 + 0.02, 0.1, H - 0.1, 0.04, C.STEEL_DARK, { col: false });
    S.box(x, 0.05, -W / 2 - 0.02, 0.1, H - 0.1, 0.04, C.STEEL_DARK, { col: false });
  }
  return S;
}

// Rote Scheune mit Heuboden, großen Toren vorne/hinten und Satteldach (First entlang Z)
export function barn(B, out, o = {}) {
  const w = o.w ?? 13, d = o.d ?? 17, h = 5.0, t = 0.3;
  const hw = w / 2, hd = d / 2;
  const wc = o.wall ?? C.WALL_RED;
  B.box(0, 0, 0, w, 0.15, d, C.PLANK, { m: MAT.WOOD });
  const gate = { at: w / 2, w: 4.4, y0: 0, y1: 4.1 };
  B.wall(-hw, hd, hw, hd, h, t, wc, [gate], { frameColor: C.WALL_WHITE });
  B.wall(hw, -hd, -hw, -hd, h, t, wc, [gate], { frameColor: C.WALL_WHITE });
  B.wall(-hw, -hd, -hw, hd, h, t, wc, [win(d * 0.25, 1.2, 2.0, 3.0), door(d * 0.65, 1.6)], { frameColor: C.WALL_WHITE });
  B.wall(hw, hd, hw, -hd, h, t, wc, [win(d * 0.35, 1.2, 2.0, 3.0), win(d * 0.75, 1.2, 2.0, 3.0)], { frameColor: C.WALL_WHITE });
  // weiße Kreuze auf den Toren
  for (const sz of [1, -1]) {
    for (const r of [0.72, -0.72]) B.box(0, 2.05, sz * (hd + 0.18), 5.2, 0.22, 0.06, C.WALL_WHITE, { col: false, rz: r, ry: 0 });
  }
  // Heuboden über der hinteren Hälfte + Treppe
  const ly = 3.2;
  B.box(0, ly, -hd / 2 - 0.3, w - 0.6, 0.22, hd - 0.6, C.PLANK, { m: MAT.WOOD });
  B.railing(-hw + 2.2, -0.6, hw - 0.4, -0.6, ly + 0.22, 1.0, C.WOOD_DARK);
  const steps = 11;
  B.stairs(-hw + 1.1, -0.9 + (steps - 1) * 0.55, 1.4, (ly + 0.22) / steps, 0.55, steps, C.WOOD);
  // Dach
  B.box(0, h, 0, w + 0.2, 0.2, d + 0.2, C.WOOD_DARK, { m: MAT.WOOD });
  B.prism(0, h + 0.2, 0, w + 1.2, o.roofH ?? 4.2, d + 1.0, o.roof ?? C.ROOF_DARK, { col: true });
  // Heu
  for (const [x, z] of [[-3, -5], [-1.5, -5.2], [3, -6]]) B.box(x, ly + 0.22, z, 1.2, 0.8, 1.6, C.HAY, { m: MAT.PLANT });
  B.box(3.8, 0.15, 3.5, 1.4, 0.9, 2.0, C.HAY, { m: MAT.PLANT });
  chest(out, B, 2.5, ly + 0.22, -hd + 1.2, 0);
  chest(out, B, hw - 1.1, 0.15, -1.5, -Math.PI / 2);
  floorLoot(out, B, -2, 0.15, 3);
  return B;
}

// Silo mit Kuppel und Leiter
export function silo(B, lx, lz, r = 2.6, h = 11, c = C.WALL_GREY) {
  B.cyl(lx, 0, lz, r, h, c, { seg: 14, m: MAT.METAL });
  for (let y = 1.5; y < h; y += 2.2) B.cyl(lx, y, lz, r + 0.05, 0.12, C.STEEL_DARK, { seg: 14, col: false });
  B.sph(lx, h, lz, r * 1.02, C.STEEL, { sy: 0.55, col: false, detail: 1 });
  B.box(lx, 0, lz + r + 0.12, 0.5, h, 0.08, C.STEEL_DARK, { col: false });
  return B;
}

// Wasserturm/Ortsturm mit Kugel-Tank (Retail Row, Salty)
export function waterBall(B, lx, lz, h = 14, c = C.WALL_WHITE) {
  const S = B.sub(lx, lz);
  for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [1.8, 1.8], [-1.8, 1.8]]) S.cyl(x, 0, z, 0.22, h, C.STEEL_DARK, { seg: 6 });
  S.cyl(0, 0, 0, 0.5, h, C.STEEL, { seg: 8 });
  S.sph(0, h + 2.4, 0, 3.4, c, { sy: 0.8, col: false, detail: 1 });
  S.cyl(0, h + 0.2, 0, 3.0, 0.2, C.STEEL_DARK, { seg: 12, col: false });
  return S;
}

// ---------------------------------------------------------------------------
// Achteckiger Pavillon
export function gazebo(B, out, r = 3.2, roof = C.ROOF_GREEN) {
  B.cyl(0, 0, 0, r + 0.35, 0.35, C.WALL_WHITE, { seg: 8, m: MAT.WOOD });
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    B.cyl(pts[k][0], 0.35, pts[k][1], 0.12, 2.6, C.WALL_WHITE, { seg: 6 });
  }
  for (let k = 0; k < 8; k++) {
    if (k === 1 || k === 5) continue; // Eingänge
    const [x1, z1] = pts[k], [x2, z2] = pts[(k + 1) % 8];
    B.railing(x1, z1, x2, z2, 0.35, 0.8, C.WALL_WHITE);
  }
  B.cyl(0, 2.95, 0, r + 0.8, 1.7, roof, { rt: 0.15, seg: 8, col: false });
  B.blocker(0, 2.95, 0, r * 1.4, 0.2, r * 1.4);
  floorLoot(out, B, 0, 0.35, 0);
}

// Fußballfeld (nur Linien + Tore); Rasen malt die Karte
export function soccer(B, out, w = 18, d = 30) {
  const L = C.LINE, hw = w / 2, hd = d / 2, y = 0.01;
  const line = (x, z, lw, ld) => B.box(x, y, z, lw, 0.03, ld, L, { col: false });
  line(-hw, 0, 0.15, d); line(hw, 0, 0.15, d);
  line(0, -hd, w, 0.15); line(0, hd, w, 0.15);
  line(0, 0, w, 0.15);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    B.box(Math.cos(a) * 3, y, Math.sin(a) * 3, 1.2, 0.03, 0.15, L, { col: false, ry: -a + Math.PI / 2 });
  }
  for (const s of [-1, 1]) {
    line(-4, s * (hd - 3), 0.15, 6); line(4, s * (hd - 3), 0.15, 6); line(0, s * (hd - 6), 8, 0.15);
    // Tor
    for (const x of [-2.4, 2.4]) B.cyl(x, 0, s * hd, 0.08, 2.2, C.WALL_WHITE, { seg: 6 });
    B.box(0, 2.1, s * hd, 4.9, 0.14, 0.14, C.WALL_WHITE, { col: false });
    // Netz: dünnes Gitter statt einer Wand
    for (let x = -2.4; x <= 2.41; x += 0.6) B.box(x, 0, s * (hd + 1.0), 0.04, 2.1, 0.04, 0xdfe6ea, { col: false });
    for (let y = 0.3; y < 2.1; y += 0.45) B.box(0, y, s * (hd + 1.0), 4.8, 0.04, 0.04, 0xdfe6ea, { col: false });
    for (const x of [-2.4, 2.4]) B.box(x, 2.08, s * (hd + 0.5), 0.05, 0.05, 1.0, 0xdfe6ea, { col: false });
  }
}

// Hecke (blockiert Laufen und Kugeln)
export function hedge(B, x1, z1, x2, z2, h = 1.9, t = 0.9) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const ry = Math.atan2(-dz, dx);
  const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
  B.box(mx, 0, mz, len, h, t, C.HEDGE, { ry, m: MAT.PLANT });
  B.box(mx, h - 0.05, mz, len - 0.15, 0.12, t - 0.15, C.HEDGE_DARK, { ry, col: false });
}

// weißer Lattenzaun (man kann hindurchschießen)
export function picket(B, x1, z1, x2, z2) {
  B.railing(x1, z1, x2, z2, 0, 1.0, C.WALL_WHITE);
}

// Straßenlaterne
export function streetlight(B, lx, lz, ry = 0) {
  const S = B.sub(lx, lz, ry);
  S.cyl(0, 0, 0, 0.1, 5.2, C.STEEL_DARK, { seg: 6 });
  S.box(0, 5.1, 0.7, 0.12, 0.12, 1.5, C.STEEL_DARK, { col: false });
  S.box(0, 4.9, 1.4, 0.5, 0.2, 0.7, C.LAMP, { col: false });
}

export function bench(B, lx, lz, ry = 0) {
  const S = B.sub(lx, lz, ry);
  S.box(0, 0.42, 0, 1.8, 0.08, 0.5, C.WOOD, { col: false });
  S.box(0, 0.6, -0.24, 1.8, 0.4, 0.06, C.WOOD, { col: false });
  for (const x of [-0.75, 0.75]) S.box(x, 0, 0, 0.08, 0.45, 0.45, C.STEEL_DARK, { col: false });
  S.blocker(0, 0, 0, 1.8, 0.8, 0.5);
}

// Steg ins Wasser entlang +Z (Oberkante ly über dem Ursprung)
export function dock(B, out, len = 14, w = 3, ly = 0.55, boat = true) {
  deck(B, 0, len / 2, w, len, ly, 'x');
  posts(B, -w / 2 + 0.15, w / 2 - 0.15, 0.5, len - 0.3, 3, 2.2, ly);
  if (boat) B.boat(w / 2 + 1.4, len * 0.6, 0.1, C.WALL_BLUE, -0.25);
  floorLoot(out, B, 0, ly, len - 1.5);
}

// Brücke entlang lokal Z (Länge len, Deckhöhe h über dem Ursprung)
export function bridge(B, len = 16, w = 4.5, h = 0.4, c = C.CONCRETE) {
  B.box(0, h - 0.4, 0, w, 0.4, len, c, { m: MAT.STONE });
  B.railing(-w / 2 + 0.1, -len / 2, -w / 2 + 0.1, len / 2, h, 1.0, C.STEEL_DARK);
  B.railing(w / 2 - 0.1, -len / 2, w / 2 - 0.1, len / 2, h, 1.0, C.STEEL_DARK);
  for (let z = -len / 2 + 3; z < len / 2 - 2; z += 6) B.box(0, h - 3.4, z, w * 0.5, 3.0, 0.8, C.CONCRETE_DARK, { col: false });
}

// Rettungsschwimmer-Turm: Plattform auf Stelzen mit Hütte, Rampe nach +Z
export function lifeguard(B, out, c = C.RED) {
  const y = 2.6;
  for (const [x, z] of [[-1.4, -1.2], [1.4, -1.2], [-1.4, 1.2], [1.4, 1.2]]) B.cyl(x, 0, z, 0.14, y, C.WALL_WHITE, { seg: 6 });
  B.box(0, y - 0.2, 0.4, 3.6, 0.2, 3.6, C.BOARD, { m: MAT.WOOD });
  B.wall(-1.5, -1.3, 1.5, -1.3, 2.2, 0.15, c, [], { frame: false });
  B.wall(-1.5, -1.3, -1.5, 1.0, 2.2, 0.15, c, [win(1.1, 1.0, 0.9, 1.8)]);
  B.wall(1.5, 1.0, 1.5, -1.3, 2.2, 0.15, c, [win(1.2, 1.0, 0.9, 1.8)]);
  B.railing(-1.7, 2.1, -0.65, 2.1, y, 0.9, C.WALL_WHITE);
  B.railing(0.65, 2.1, 1.7, 2.1, y, 0.9, C.WALL_WHITE);
  B.prism(0, y + 2.2, -0.15, 3.8, 1.2, 3.2, C.WALL_WHITE, { col: true });
  const steps = 8;
  B.stairs(0, 2.45 + (steps - 1) * 0.5, 1.1, y / steps, 0.5, steps, C.BOARD);
  chest(out, B, 0, y, -0.6, 0);
}

// Gewächshaus: Stahlrahmen, Glaswände (man kann hindurchschießen), Pflanztische
export function greenhouse(B, out, w = 10, d = 16) {
  const hw = w / 2, hd = d / 2, h = 3.2;
  B.box(0, 0, 0, w, 0.12, d, C.CONCRETE, { m: MAT.STONE });
  const glass = (x1, z1, x2, z2, gap) => {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx);
    const ux = dx / len, uz = dz / len;
    const segs = gap ? [[0, len / 2 - 1.0], [len / 2 + 1.0, len]] : [[0, len]];
    for (const [a, b] of segs) {
      const m = (a + b) / 2;
      B.box(x1 + ux * m, 0.12, z1 + uz * m, b - a, h, 0.08, C.GLASS, { ry, pass: true });
    }
    for (let q = 0; q <= len + 0.01; q += 2) B.box(x1 + ux * q, 0.12, z1 + uz * q, 0.1, h, 0.12, C.WALL_WHITE, { ry, col: false });
  };
  glass(-hw, hd, hw, hd, true);
  glass(hw, -hd, -hw, -hd, true);
  glass(-hw, -hd, -hw, hd, false);
  glass(hw, hd, hw, -hd, false);
  B.prism(0, h + 0.12, 0, w + 0.3, 2.0, d + 0.3, C.GLASS, {});
  for (let z = -hd; z <= hd + 0.01; z += 2) B.box(0, h + 0.12, z, w + 0.3, 0.1, 0.1, C.WALL_WHITE, { col: false });
  B.blocker(0, h + 0.1, 0, w, 0.3, d);
  for (const x of [-hw + 1.3, hw - 1.3]) {
    B.box(x, 0.12, 0, 1.2, 0.85, d - 4, C.WOOD_DARK, { m: MAT.WOOD });
    for (let z = -hd + 2.8; z < hd - 2.5; z += 1.3) B.sph(x, 1.3, z, 0.42, C.LEAF, { col: false });
  }
  chest(out, B, 0, 0.12, -hd + 1.2, 0);
  floorLoot(out, B, 0, 0.12, 1);
}

// Kirche mit Glockenturm vorne (+Z)
export function church(B, out, o = {}) {
  const w = 10, d = 16, h = 6, hw = w / 2, hd = d / 2;
  const wc = o.wall ?? C.WALL_WHITE;
  B.box(0, 0, 0, w, 0.2, d, C.PLANK, { m: MAT.WOOD });
  const tall = (at) => ({ at, w: 1.1, y0: 1.4, y1: 4.2 });
  B.wall(-hw, hd, hw, hd, h, 0.35, wc, [door(hw, 2.2, 3.0)], { m: MAT.STONE });
  B.wall(hw, -hd, -hw, -hd, h, 0.35, wc, [tall(hw)], { m: MAT.STONE });
  B.wall(-hw, -hd, -hw, hd, h, 0.35, wc, [tall(4), tall(8), door(12, 1.6)], { m: MAT.STONE });
  B.wall(hw, hd, hw, -hd, h, 0.35, wc, [tall(4), tall(8), tall(12)], { m: MAT.STONE });
  B.box(0, h, 0, w + 0.2, 0.2, d + 0.2, C.WOOD_DARK, { m: MAT.WOOD });
  B.prism(0, h + 0.2, 0, w + 1.2, 4.2, d + 0.8, o.roof ?? C.ROOF_GREY, { col: true });
  // Turm
  const T = B.sub(0, hd + 2.2);
  T.wall(-2, 2, 2, 2, 10, 0.4, wc, [door(2, 1.8, 2.6)], { m: MAT.STONE });
  T.wall(2, -2, -2, -2, 10, 0.4, wc, [door(2, 2.2, 3.0)], { m: MAT.STONE });
  T.wall(-2, -2, -2, 2, 10, 0.4, wc, [win(2, 0.9, 5, 6.8)], { m: MAT.STONE });
  T.wall(2, 2, 2, -2, 10, 0.4, wc, [win(2, 0.9, 5, 6.8)], { m: MAT.STONE });
  T.box(0, 10, 0, 4.4, 0.3, 4.4, C.WOOD_DARK, { m: MAT.WOOD });
  for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [1.9, 1.9], [-1.9, 1.9]]) T.box(x, 10.3, z, 0.4, 2.6, 0.4, wc, { m: MAT.STONE });
  T.cyl(0, 11.2, 0, 0.5, 1.0, C.GOLD, { rt: 0.35, seg: 8, col: false });
  T.cyl(0, 12.9, 0, 3.0, 5.5, o.roof ?? C.ROOF_GREY, { rt: 0.08, seg: 4, ry: Math.PI / 4, col: false });
  T.box(0, 18.3, 0, 0.12, 1.4, 0.12, C.GOLD, { col: false });
  T.box(0, 18.8, 0, 0.7, 0.12, 0.12, C.GOLD, { col: false });
  // Bänke + Altar
  for (let z = -3; z <= 5; z += 2) for (const x of [-2.4, 2.4]) B.box(x, 0.2, z, 3.2, 0.5, 0.6, C.WOOD_DARK, { m: MAT.WOOD });
  B.box(0, 0.2, -hd + 1.6, 3, 1.0, 1.2, C.WALL_WHITE, { m: MAT.STONE });
  chest(out, B, 0, 0.2, -hd + 0.7, 0);
  floorLoot(out, B, 0, 0.2, 2);
  chest(out, T, 0, 0, -0.6, Math.PI);
}

// Mehrstöckiges Gebäude (Hotel, Schule, Wohnblock, Villa): Treppen im Wechsel an der rechten Seite.
// o: { w, d, floors, fh, wall, trim, roof ('flat'|'gable'), roofColor, sign, balcony, helipad, frontDoor }
export function block(B, out, o = {}) {
  const w = o.w ?? 14, d = o.d ?? 12, floors = o.floors ?? 3, fh = o.fh ?? 3.4, t = 0.3;
  const hw = w / 2, hd = d / 2;
  const wc = o.wall ?? C.WALL_CREAM, trim = o.trim ?? C.CONCRETE_DARK;
  const opt = { m: MAT.STONE, frameColor: o.frame ?? C.WALL_WHITE };
  B.box(0, 0, 0, w, 0.2, d, C.CONCRETE, { m: MAT.STONE });
  const strips = [hw - 0.85, hw - 2.35];
  const nWin = Math.max(2, Math.floor(w / 3.2));
  const holes = [];
  for (let f = 0; f < floors; f++) {
    const y = f === 0 ? 0 : f * fh;
    const S = B.sub(0, 0, 0, y);
    const H = f === 0 ? fh : fh - 0.25;
    const base = f === 0 ? 0 : 0.25;
    const front = [];
    for (let k = 0; k < nWin; k++) front.push(win(((k + 0.5) / nWin) * w, 1.3, 1.0 + base, 2.2 + base));
    if (f === 0) front.splice(Math.floor(nWin / 2), 1, door(w / 2, o.doorW ?? 2.4, 2.6));
    const W2 = S.sub(0, 0, 0, f === 0 ? 0 : 0.25);
    W2.wall(-hw, hd, hw, hd, H, t, wc, f === 0 ? front : front.map((q) => ({ ...q, y0: q.y0 - base, y1: q.y1 - base })), opt);
    const back = [];
    for (let k = 0; k < nWin; k++) back.push(win(((k + 0.5) / nWin) * w));
    if (f === 0) back[0] = door(w * 0.12, 1.6, 2.4);
    W2.wall(hw, -hd, -hw, -hd, H, t, wc, back, opt);
    W2.wall(-hw, -hd, -hw, hd, H, t, wc, [win(d * 0.3), win(d * 0.7)], opt);
    W2.wall(hw, hd, hw, -hd, H, t, wc, f === 0 ? [door(d * 0.85, 1.6, 2.4)] : [win(d * 0.85)], opt);
    // Treppe von Etage f nach f+1 (abwechselnd äußerer/innerer Streifen)
    if (f < floors - 1) {
      const sx = strips[f % 2];
      const top = fh + 0.25 - (f === 0 ? 0 : 0.25);
      const zTop = innerStairs(W2, sx, hd - 1.0, 1.3, top, 0.56);
      holes.push({ x: sx, z0: zTop, z1: hd - 0.4 });
    }
    // Decke / Boden der nächsten Etage mit Treppenloch
    const yc = (f + 1) * fh;
    const hole = f < floors - 1 ? holes[f] : null;
    const C2 = B.sub(0, 0, 0, yc);
    if (!hole) C2.box(0, 0, 0, w, 0.25, d, C.CONCRETE_DARK, { m: MAT.STONE });
    else {
      const x0 = hole.x - 0.75, x1 = hole.x + 0.75;
      if (x0 + hw > 0.1) C2.box((-hw + x0) / 2, 0, 0, x0 + hw, 0.25, d, C.CONCRETE_DARK, { m: MAT.STONE });
      if (hw - x1 > 0.1) C2.box((x1 + hw) / 2, 0, 0, hw - x1, 0.25, d, C.CONCRETE_DARK, { m: MAT.STONE });
      C2.box(hole.x, 0, (-hd + hole.z0) / 2, 1.5, 0.25, hole.z0 + hd, C.CONCRETE_DARK, { m: MAT.STONE });
      C2.box(hole.x, 0, (hole.z1 + hd) / 2, 1.5, 0.25, hd - hole.z1, C.CONCRETE_DARK, { m: MAT.STONE });
      C2.railing(hole.x - 0.8, hole.z0 + 0.3, hole.x - 0.8, hole.z1, 0.25, 0.95, C.STEEL_DARK);
    }
    // Einrichtung + Beute je Etage
    const F = B.sub(0, 0, 0, f === 0 ? 0.2 : f * fh + 0.25);
    F.box(-hw + 1.4, 0, -hd + 1.0, 2.2, 0.8, 0.9, [C.CLOTH_BLUE, C.CLOTH_RED, C.CLOTH_GREEN][f % 3], { m: MAT.CLOTH });
    F.box(-1, 0, 0.5, 1.6, 0.75, 1.0, C.WOOD, { m: MAT.WOOD });
    if (f % 2 === 0) chest(out, F, -hw + 1.0, 0, 1.5, Math.PI / 2);
    else chest(out, F, 0.5, 0, -hd + 0.9, 0);
    floorLoot(out, F, -2, 0, -1.5);
    // Balkone vorne
    if (o.balcony && f > 0) {
      F.box(0, -0.25, hd + 1.1, w * 0.6, 0.25, 2.0, trim, { m: MAT.STONE });
      F.railing(-w * 0.3, hd + 2.05, w * 0.3, hd + 2.05, 0, 1.0, C.STEEL_DARK);
    }
  }
  // Dach
  const yr = floors * fh + 0.25;
  if (o.roof === 'gable') B.prism(0, yr, 0, d + 1, Math.min(3.6, d * 0.3), w + 1, o.roofColor ?? C.ROOF_RED, { col: true, ry: Math.PI / 2 });
  else {
    B.box(0, yr, hd, w + 0.3, 1.0, 0.3, trim, { m: MAT.STONE });
    B.box(0, yr, -hd, w + 0.3, 1.0, 0.3, trim, { m: MAT.STONE });
    B.box(-hw, yr, 0, 0.3, 1.0, d, trim, { m: MAT.STONE });
    B.box(hw, yr, 0, 0.3, 1.0, d, trim, { m: MAT.STONE });
    if (o.helipad) {
      B.cyl(0, yr, 0, Math.min(w, d) * 0.38, 0.06, C.CONCRETE_DARK, { seg: 16, col: false });
      B.box(-1, yr + 0.06, 0, 0.4, 0.02, 3, C.YELLOW, { col: false });
      B.box(1, yr + 0.06, 0, 0.4, 0.02, 3, C.YELLOW, { col: false });
      B.box(0, yr + 0.06, 0, 2, 0.02, 0.4, C.YELLOW, { col: false });
    }
    // Dachzugang: Treppenhaus-Aufbau über dem letzten Treppenstreifen
    B.box(hw - 1.6, yr, -hd + 1.6, 2.6, 2.4, 2.6, trim, { m: MAT.STONE });
  }
  if (o.sign) sign(out, B, 0, yr + 1.3, hd + 0.2, Math.min(w * 0.7, 10), 1.3, o.sign, 0, o.signBg ?? '#1f3f7a', o.signFg ?? '#ffe14d');
  return B;
}

// Blockhütte
export function cabin(B, out, o = {}) {
  const w = o.w ?? 6.5, d = o.d ?? 5.5, hw = w / 2, hd = d / 2, h = 2.8;
  const wc = o.wall ?? C.WOOD_DARK;
  B.box(0, 0, 0, w, 0.2, d, C.PLANK, { m: MAT.WOOD });
  B.wall(-hw, hd, hw, hd, h, 0.3, wc, [door(w * 0.35, 1.5, 2.3), win(w * 0.75, 1.1)]);
  B.wall(hw, -hd, -hw, -hd, h, 0.3, wc, [win(w / 2, 1.1)]);
  B.wall(-hw, -hd, -hw, hd, h, 0.3, wc, [win(d / 2, 1.0)]);
  B.wall(hw, hd, hw, -hd, h, 0.3, wc, []);
  for (let y = 0.35; y < h; y += 0.45) {
    B.box(0, y, hd + 0.16, w + 0.3, 0.1, 0.06, C.WOOD, { col: false });
    B.box(0, y, -hd - 0.16, w + 0.3, 0.1, 0.06, C.WOOD, { col: false });
  }
  B.box(0, h, 0, w + 0.2, 0.15, d + 0.2, C.WOOD_DARK, { m: MAT.WOOD });
  B.prism(0, h + 0.15, 0, d + 1.2, 2.0, w + 1.2, o.roof ?? C.ROOF_GREEN, { col: true, ry: Math.PI / 2 });
  B.box(hw - 1.0, h, -0.6, 0.8, 3.0, 0.8, C.STONE, { m: MAT.STONE });
  B.box(-hw + 1.0, 0.2, -hd + 0.8, 1.6, 0.6, 0.9, C.CLOTH_RED, { m: MAT.CLOTH });
  chest(out, B, hw - 0.9, 0.2, 0.6, -Math.PI / 2);
  floorLoot(out, B, -0.5, 0.2, 0.3);
  return B;
}

// Zelt (Satteldach bis zum Boden)
export function tent(B, lx, lz, ry = 0, c = C.CLOTH_GREEN) {
  const S = B.sub(lx, lz, ry);
  S.prism(0, 0, 0, 2.6, 1.8, 3.2, c, {});
  S.blocker(0, 0, 0, 1.9, 1.4, 3.2);
  S.box(0, 0, 1.62, 0.9, 1.1, 0.04, C.DARK, { col: false });
}

// Wohnwagen
export function trailer(B, lx, lz, ry = 0, c = C.WALL_WHITE) {
  const S = B.sub(lx, lz, ry);
  S.box(0, 0.45, 0, 7, 2.6, 2.5, c, { m: MAT.METAL });
  S.box(0, 1.4, 1.26, 7.02, 0.35, 0.02, C.TEAL, { col: false });
  for (const x of [-2.2, 0.4, 2.4]) S.box(x, 1.8, 1.27, 1.1, 0.7, 0.02, 0x2c3e50, { col: false });
  S.box(-1.0, 0.5, 1.27, 0.8, 1.9, 0.02, C.STEEL_DARK, { col: false });
  for (const x of [-1.6, 1.6]) S.cyl(x, 0.4, 0, 0.4, 2.7, C.TIRE, { rx: Math.PI / 2, center: true, seg: 8, col: false });
}

// Hafenkran (Portal mit Ausleger zum Wasser, +Z)
export function crane(B, h = 16, c = C.YELLOW) {
  for (const [x, z] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) B.box(x, 0, z, 0.8, h, 0.8, c, { m: MAT.METAL });
  for (const z of [-3, 3]) B.box(0, h - 1.2, z, 8.8, 1.2, 0.8, c, { m: MAT.METAL });
  for (const x of [-4, 4]) B.box(x, h * 0.45, 0, 0.5, 0.5, 6.6, c, { col: false });
  B.box(0, h, 4, 3, 1.6, 26, c, { col: false });
  B.box(0, h + 1.6, -1.5, 3.5, 2.6, 4, C.STEEL_DARK, { col: false });
  B.box(0, h - 5.5, 14, 0.08, 7, 0.08, C.DARK, { col: false });
  B.box(0, h - 7, 14, 2.4, 1.2, 1.4, C.RED, { col: false });
}

// Kühlturm (Hyperboloid aus Zylinderringen)
export function coolingTower(B, out, rBase = 13, h = 36, c = C.TOWER) {
  const n = 9;
  const rMin = rBase * 0.62;
  const yW = h * 0.72;
  const rad = (y) => rMin * Math.sqrt(1 + ((y - yW) / (h * 0.36)) ** 2);
  for (let i = 0; i < n; i++) {
    const y0 = (i / n) * h, y1 = ((i + 1) / n) * h;
    const r0 = rad(y0), r1 = rad(y1);
    B.cyl(0, y0, 0, r0, y1 - y0 + 0.02, i === n - 1 ? C.WALL_PURPLE : c, { rt: r1, seg: 20, m: MAT.STONE, col: i < 2 });
  }
  B.blocker(0, h * 0.2, 0, rMin * 1.35, h * 0.8, rMin * 1.35);
  // Stützen am Fuß
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    B.box(Math.cos(a) * rBase * 0.98, 0, Math.sin(a) * rBase * 0.98, 0.5, 1.4, 0.5, C.CONCRETE_DARK, { col: false });
  }
  smoke(out, B, 0, h + 0.5, 0);
  smoke(out, B, 2.5, h + 0.5, -2);
}

// Tank (optional leuchtend) mit Leiter
export function tank(B, lx, lz, r = 3, h = 7, c = C.STEEL, glow = false) {
  B.cyl(lx, 0, lz, r, h, c, { seg: 14, m: MAT.METAL });
  B.cyl(lx, h, lz, r * 1.02, 0.6, glow ? C.SLURP : C.STEEL_DARK, { rt: r * 0.5, seg: 14, col: false });
  if (glow) for (const y of [h * 0.3, h * 0.65]) B.cyl(lx, y, lz, r + 0.06, 0.5, C.SLURP, { seg: 14, col: false });
  B.box(lx, 0, lz + r + 0.1, 0.5, h, 0.08, C.STEEL_DARK, { col: false });
}

// Schornstein mit rot-weißer Spitze
export function smokestack(B, out, lx, lz, h = 24, r = 1.4) {
  B.cyl(lx, 0, lz, r, h, C.BRICK, { rt: r * 0.8, seg: 10, m: MAT.STONE });
  for (let k = 0; k < 3; k++) B.cyl(lx, h - 2.4 + k * 0.8, lz, r * 0.84, 0.4, k % 2 ? C.WALL_WHITE : C.RED, { seg: 10, col: false });
  smoke(out, B, lx, h + 0.5, lz);
}

// Windrad mit drehenden Flügeln (Animation über groups)
export function windmill(B, key, lx, lz, h = 12) {
  const S = B.sub(lx, lz);
  S.cyl(0, 0, 0, 0.8, h, C.WALL_WHITE, { rt: 0.45, seg: 8, m: MAT.METAL });
  S.box(0, h - 0.2, 0.3, 1.2, 1.2, 2.2, C.WALL_WHITE, { col: false });
  const px = S.wx(0, 1.5), pz = S.wz(0, 1.5), py = S.oy + h + 0.4;
  B.groups[key] = { pivot: { x: px, y: py, z: pz }, ry: S.rot, axis: 'z', speed: 1.2 };
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const len = 5.5;
    S.box(Math.cos(a) * len / 2, h + 0.4 + Math.sin(a) * len / 2 - 0.2, 1.5, len, 0.5, 0.12, C.WALL_WHITE, { col: false, rz: a, grp: key });
  }
  S.cyl(0, h + 0.4, 1.4, 0.35, 0.5, C.RED, { rx: Math.PI / 2, center: true, col: false, grp: key });
}

// ---------------------------------------------------------------------------
// Frachtschiff längs lokal X, Seite zum Kai = +Z; Ursprung auf Wasserhöhe
export function cargoShip(B, out, len = 44, beam = 11) {
  const hl = len / 2, hb = beam / 2, dy = 3.2;
  const body = len - 8;
  B.box(-4, -1.3, 0, body, dy + 1.3, beam, C.NAVY, { m: MAT.METAL });
  for (let k = 0; k < 3; k++) {
    const bw = beam * (0.8 - k * 0.25), bl = 2.6;
    B.box(-4 + body / 2 + bl * (k + 0.5), -1.3, 0, bl, dy + 1.3, bw, C.NAVY, { m: MAT.METAL });
  }
  B.box(-4, -0.1, 0, body + 0.1, 0.5, beam + 0.1, C.RED, { col: false });
  B.railing(-hl + 4, hb - 0.2, -hl + 13, hb - 0.2, dy, 1.0, C.WALL_WHITE);
  B.railing(-hl + 15, hb - 0.2, hl - 4, hb - 0.2, dy, 1.0, C.WALL_WHITE);
  B.railing(-hl + 4, -hb + 0.2, hl - 4, -hb + 0.2, dy, 1.0, C.WALL_WHITE);
  // Container in Reihen (Gänge dazwischen)
  const cols = [C.RED, C.BLUE, C.GREEN, C.ORANGE, C.YELLOW, C.TEAL];
  let n = 0;
  for (let x = -hl + 17; x < hl - 6; x += 7) {
    for (const z of [-2.6, 2.6]) {
      container(B, x, z, 0, cols[n++ % cols.length], n % 5 === 0, dy);
      if (n % 3 !== 0) container(B, x, z, 0, cols[(n + 2) % cols.length], false, dy + 2.6);
    }
  }
  // Brückenhaus am Heck (-X)
  const H = B.sub(-hl + 8, 0, 0, dy);
  H.wall(-3, 3.5, 3, 3.5, 3, 0.3, C.WALL_WHITE, [door(3, 1.6)], { m: MAT.METAL });
  H.wall(3, -3.5, -3, -3.5, 3, 0.3, C.WALL_WHITE, [door(3, 1.6)], { m: MAT.METAL });
  H.wall(-3, -3.5, -3, 3.5, 3, 0.3, C.WALL_WHITE, [win(3.5, 2)], { m: MAT.METAL });
  H.wall(3, 3.5, 3, -3.5, 3, 0.3, C.WALL_WHITE, [win(2, 1.6), win(5, 1.6)], { m: MAT.METAL });
  H.box(0, 3, 0, 6.6, 0.3, 7.6, C.WALL_WHITE, { m: MAT.METAL });
  H.box(0, 3.3, 0, 4.5, 2.4, 5, C.WALL_WHITE, { m: MAT.METAL });
  H.box(0, 4.3, 2.52, 4.0, 0.9, 0.04, 0x2c3e50, { col: false });
  smokestack(B, out, -hl + 6.5, 0, dy + 9, 0.9);
  chest(out, H, -1.5, 0, 0, Math.PI / 2);
  // Gangway vom Kai (+Z) hinauf
  const steps = 9;
  B.stairs(-hl + 14, hb + 0.3 + (steps - 1) * 0.5, 1.4, (dy - 0.55) / steps, 0.5, steps, C.STEEL_DARK, 0, 0.55);
  chest(out, B, 6, dy, 0, 0);
  floorLoot(out, B, -hl + 15, dy, -2);
}

// Luxusyacht längs lokal X (Bug +X), Seite zum Steg = +Z; Ursprung auf Wasserhöhe
export function yacht(B, out, len = 56, beam = 12) {
  const hl = len / 2, hb = beam / 2, d1 = 3.0, lv = 3.2;
  const body = len - 10;
  B.box(-5, -1.2, 0, body, d1 + 1.2, beam, C.WALL_WHITE, { m: MAT.METAL });
  for (let k = 0; k < 4; k++) {
    const bw = beam * (0.85 - k * 0.2), bl = 2.5;
    B.box(-5 + body / 2 + bl * (k + 0.5), -1.2 + k * 0.3, 0, bl, d1 + 1.2 - k * 0.3, bw, C.WALL_WHITE, { m: MAT.METAL });
  }
  B.box(-5, 0.6, 0, body + 0.1, 0.5, beam + 0.1, C.NAVY, { col: false });
  B.box(-5, d1 - 0.05, 0, body - 0.4, 0.06, beam - 0.4, C.BOARD_LIGHT, { col: false });
  B.railing(-hl + 5, hb - 0.2, -hl + 15, hb - 0.2, d1, 1.0, C.STEEL);
  B.railing(-hl + 17, hb - 0.2, hl - 4, hb - 0.2, d1, 1.0, C.STEEL);
  B.railing(-hl + 5, -hb + 0.2, hl - 4, -hb + 0.2, d1, 1.0, C.STEEL);
  B.railing(-hl + 0.4, -hb + 0.2, -hl + 0.4, hb - 0.2, d1, 1.0, C.STEEL);
  // Pool + Liegen am Heck
  B.box(-hl + 8, d1, 0, 7, 0.3, 5.2, C.WALL_WHITE, { m: MAT.STONE });
  B.box(-hl + 8, d1 + 0.3, 0, 6.2, 0.02, 4.4, C.POOL, { col: false, e: 0 });
  for (const z of [-3.6, 3.6]) for (const x of [-hl + 5.5, -hl + 8, -hl + 10.5]) B.box(x, d1, z, 0.8, 0.4, 1.9, C.WALL_WHITE, { col: false });
  // Kabinen-Deck
  const K = B.sub(-3, 0, 0, d1);
  const kl = 24, kw = beam - 3;
  K.wall(-kl / 2, kw / 2, kl / 2, kw / 2, lv, 0.3, C.WALL_WHITE, [door(4, 1.8), win(9, 3, 1.0, 2.5), win(15, 3, 1.0, 2.5), door(21, 1.8)], { m: MAT.METAL, frameColor: C.NAVY });
  K.wall(kl / 2, -kw / 2, -kl / 2, -kw / 2, lv, 0.3, C.WALL_WHITE, [win(5, 3, 1.0, 2.5), win(12, 3, 1.0, 2.5), door(19, 1.8)], { m: MAT.METAL, frameColor: C.NAVY });
  K.wall(-kl / 2, -kw / 2, -kl / 2, kw / 2, lv, 0.3, C.WALL_WHITE, [door(kw / 2, 2.4)], { m: MAT.METAL });
  K.wall(kl / 2, kw / 2, kl / 2, -kw / 2, lv, 0.3, C.WALL_WHITE, [win(kw / 2, 3, 1.0, 2.5)], { m: MAT.METAL, frameColor: C.NAVY });
  K.box(0, lv, 0, kl + 1.2, 0.3, kw + 1.2, C.WALL_WHITE, { m: MAT.METAL });
  K.box(-4, 0, -1.5, 5, 0.8, 1.2, C.CLOTH_WHITE, { m: MAT.CLOTH });
  K.box(5, 0, 1.5, 1.6, 1.0, 3.4, C.WOOD_DARK, { m: MAT.WOOD });
  chest(out, K, -9, 0, 0, Math.PI / 2);
  chest(out, K, 9, 0, -2, -Math.PI / 2);
  floorLoot(out, K, 0, 0, 0);
  // Oberdeck + Brücke
  const d2 = lv + 0.3;
  K.railing(-kl / 2 - 0.5, kw / 2 + 0.5, kl / 2 + 0.5, kw / 2 + 0.5, d2, 1.0, C.STEEL);
  K.railing(-kl / 2 - 0.5, -kw / 2 - 0.5, kl / 2 + 0.5, -kw / 2 - 0.5, d2, 1.0, C.STEEL);
  const R = K.sub(4, 0, 0, d2);
  R.wall(-5, 3, 5, 3, 3, 0.3, C.WALL_WHITE, [win(3, 2.5, 1.0, 2.4), win(7, 2.5, 1.0, 2.4)], { m: MAT.METAL, frameColor: C.NAVY });
  R.wall(5, -3, -5, -3, 3, 0.3, C.WALL_WHITE, [win(5, 3, 1.0, 2.4)], { m: MAT.METAL, frameColor: C.NAVY });
  R.wall(-5, -3, -5, 3, 3, 0.3, C.WALL_WHITE, [door(3, 1.8)], { m: MAT.METAL });
  R.wall(5, 3, 5, -3, 3, 0.3, C.WALL_WHITE, [win(3, 4, 1.0, 2.4)], { m: MAT.METAL, frameColor: C.NAVY });
  R.box(0, 3, 0, 11, 0.3, 7, C.WALL_WHITE, { m: MAT.METAL });
  R.cyl(0, 3.3, 0, 0.3, 3, C.STEEL, { seg: 6, col: false });
  chest(out, R, 2, 0, 0, -Math.PI / 2);
  // Hubschrauber-Landeplatz auf dem Oberdeck vorne
  K.cyl(-7.5, d2, 0, 3.4, 0.05, C.NAVY, { seg: 16, col: false });
  K.box(-8.2, d2 + 0.05, 0, 0.35, 0.02, 2.4, C.WALL_WHITE, { col: false });
  K.box(-6.8, d2 + 0.05, 0, 0.35, 0.02, 2.4, C.WALL_WHITE, { col: false });
  K.box(-7.5, d2 + 0.05, 0, 1.4, 0.02, 0.35, C.WALL_WHITE, { col: false });
  // Treppen: Hauptdeck → Oberdeck (vorne am Kabinendeck, steigt Richtung -X)
  const st = 10;
  const S1 = K.sub(kl / 2 + 0.9 + (st - 1) * 0.5, -kw / 2 + 1.0, Math.PI / 2);
  S1.stairs(0, 0, 1.2, d2 / st, 0.5, st, C.STEEL_DARK);
  // Gangway vom Steg (+Z)
  const g = 8;
  B.stairs(-hl + 16, hb + 0.3 + (g - 1) * 0.5, 1.4, (d1 - 0.55) / g, 0.5, g, C.STEEL_DARK, 0, 0.55);
  chest(out, B, hl - 8, d1, 0, 0);
}

// Bohrinsel: Hauptdeck auf Stelzen (Höhe dy), Landesteg auf Wasserhöhe (+Z) mit langer Treppe
export function oilRig(B, out, dy = 10) {
  const W = 30, D = 24, hw = W / 2, hd = D / 2;
  for (const [x, z] of [[-hw + 2, -hd + 2], [hw - 2, -hd + 2], [-hw + 2, hd - 2], [hw - 2, hd - 2]]) {
    B.cyl(x, -4, z, 1.1, dy + 4, C.YELLOW, { seg: 10, m: MAT.METAL });
    B.cyl(x, -0.6, z, 1.5, 1.2, C.STEEL_DARK, { seg: 10, col: false });
  }
  for (const z of [-hd + 2, hd - 2]) B.box(0, dy * 0.45, z, W - 4, 0.5, 0.5, C.YELLOW, { col: false });
  for (const x of [-hw + 2, hw - 2]) B.box(x, dy * 0.45, 0, 0.5, 0.5, D - 4, C.YELLOW, { col: false });
  B.box(0, dy - 0.6, 0, W, 0.6, D, C.STEEL_DARK, { m: MAT.METAL });
  B.box(0, dy - 0.05, 0, W - 0.2, 0.06, D - 0.2, C.CONCRETE_DARK, { col: false });
  B.railing(-hw, hd, -3, hd, dy, 1.1, C.YELLOW);
  B.railing(3, hd, hw, hd, dy, 1.1, C.YELLOW);
  B.railing(-hw, -hd, hw, -hd, dy, 1.1, C.YELLOW);
  B.railing(-hw, -hd, -hw, hd, dy, 1.1, C.YELLOW);
  B.railing(hw, -hd, hw, hd, dy, 1.1, C.YELLOW);
  // Landesteg + Treppe vom Wasser hinauf
  deck(B, 0, hd + 19, 7, 6, 0.6, 'x', C.STEEL_DARK);
  posts(B, -3.2, 3.2, hd + 16.5, hd + 21.5, 3, 3, 0.6, C.STEEL_DARK);
  const steps = 29;
  B.stairs(0, hd + 16 - 0.25, 2.2, (dy - 0.6) / steps, 0.55, steps, C.STEEL_DARK, 0, 0.6);
  B.railing(-1.25, hd + 0.2, -1.25, hd + 15.8, 0.6, 1.0, C.YELLOW);
  // Wohncontainer (2 Etagen) mit Landeplatz
  block(B.sub(-hw + 7, -hd + 6, 0, dy), out, { w: 11, d: 9.5, floors: 2, fh: 3.2, wall: C.WALL_WHITE, trim: C.STEEL_DARK, helipad: true, frame: C.STEEL_DARK });
  // Bohrturm
  const T = B.sub(6, -3, 0, dy);
  const th = 22;
  for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5]]) T.box(x * 0.55, 0, z * 0.55, 0.4, th, 0.4, C.RED, { col: false, rz: -x * 0.02, rx: z * 0.02 });
  T.blocker(0, 0, 0, 3.2, th, 3.2);
  for (let y = 2; y < th; y += 3) {
    const k = 1 - (y / th) * 0.4;
    T.box(0, y, 2.5 * 0.55 * k, 5 * 0.55 * k, 0.2, 0.2, C.WALL_WHITE, { col: false });
    T.box(0, y, -2.5 * 0.55 * k, 5 * 0.55 * k, 0.2, 0.2, C.WALL_WHITE, { col: false });
  }
  T.box(0, th, 0, 1.8, 1, 1.8, C.RED, { col: false });
  // Kran + Container
  crane(B.sub(hw - 5, hd - 6, Math.PI / 2, dy), 8, C.YELLOW);
  container(B, -2, 6, 0.1, C.ORANGE, true, dy);
  container(B, -2, 9, -0.05, C.BLUE, false, dy);
  B.crate(8, dy, 8, 1.2, 0.3);
  B.crate(9.2, dy, 8.4, 1.1, -0.2);
  chest(out, B, 10, dy, -9, 0);
  chest(out, B, -3, dy, 1, Math.PI);
  floorLoot(out, B, 4, dy, 5);
  floorLoot(out, B, 0, 0.6, hd + 20);
}

// Hai-Felsen (The Shark): begehbarer Felsenbau mit Maul (+Z), Rückenflosse und Innenräumen
export function sharkRock(B, out) {
  const w = 16, d = 20, h = 8, hw = w / 2, hd = d / 2;
  const R = C.ROCK_GREY, R2 = 0x7d8288;
  B.box(0, 0, 0, w, 0.3, d, C.CONCRETE_DARK, { m: MAT.STONE });
  const opt = { m: MAT.STONE, frame: false };
  B.wall(-hw, hd, hw, hd, h, 1.2, R, [{ at: hw, w: 6, y0: 0.3, y1: 4.2 }], opt);
  B.wall(hw, -hd, -hw, -hd, h, 1.2, R, [door(4, 2)], opt);
  B.wall(-hw, -hd, -hw, hd, h, 1.2, R, [door(d * 0.3, 2)], opt);
  B.wall(hw, hd, hw, -hd, h, 1.2, R, [win(d * 0.5, 2, 3, 4.2)], opt);
  // Zähne im Maul
  for (let k = 0; k < 6; k++) {
    const x = -2.6 + k * 1.05;
    B.cyl(x, 3.6, hd + 0.3, 0.35, 0.7, C.WALL_WHITE, { rt: 0.02, seg: 4, rx: Math.PI, col: false });
    B.cyl(x + 0.5, 0.3, hd + 0.3, 0.3, 0.6, C.WALL_WHITE, { rt: 0.02, seg: 4, col: false });
  }
  // Kopf/Rücken: abgerundete Felsschichten
  B.box(0, h, 0, w + 0.6, 0.6, d + 0.6, R, { m: MAT.STONE });
  B.slab(0, h + 0.6, -1, w * 0.9, 2.6, d * 0.9, R2, { taper: 0.7 });
  B.slab(0, h + 3.2, -2, w * 0.55, 1.6, d * 0.6, R, { taper: 0.7 });
  // Rückenflosse
  B.prism(0, h + 4.8, -2, 1.6, 8, 7, R2, { col: false });
  B.blocker(0, h + 4.8, -2, 1.4, 5, 5);
  // Augen
  for (const x of [-hw - 0.1, hw + 0.1]) B.sph(x, 5.4, hd - 3, 0.7, C.DARK, { col: false });
  // Schwanzflosse hinten
  B.slab(0, 1, -hd - 3, 4, 4, 6, R2, { taper: 0.6 });
  B.prism(0, 5, -hd - 5, 1.4, 5, 4, R, { col: false, rx: 0.4 });
  // Innen: Galerie auf 4 m + Treppe
  B.box(-3.5, 4, -4.5, 7, 0.25, 9, C.STEEL_DARK, { m: MAT.METAL });
  B.railing(0, -8.5, 0, -3, 4.25, 1.0, C.STEEL);
  B.railing(-7, -0.2, 0, -0.2, 4.25, 1.0, C.STEEL);
  const steps = 13;
  B.stairs(0.9, 4, 1.6, 4.25 / steps, 0.5, steps, C.STEEL_DARK);
  B.box(5, 0.3, 6, 3, 1.1, 1.2, C.STEEL_DARK, { m: MAT.METAL });
  chest(out, B, -5.5, 4.25, -8, 0);
  chest(out, B, 5.5, 0.3, -8.4, 0);
  chest(out, B, -5.8, 0.3, 6, Math.PI / 2);
  floorLoot(out, B, 0, 0.3, 3);
  floorLoot(out, B, -3, 4.25, -3);
}

// Grotte: Felsenmassiv mit Geheimbasis (Pool, Lounge, Tresor); Eingang hinter einem Wasserfall (+Z)
export function grottoBase(B, out) {
  const w = 22, d = 18, h = 6.5, hw = w / 2, hd = d / 2;
  const R = C.ROCK_GREY, R2 = 0x80858c, R3 = 0x6f757c;
  B.box(0, 0, 0, w, 0.3, d, C.CONCRETE, { m: MAT.STONE });
  const opt = { m: MAT.STONE, frame: false };
  B.wall(-hw, hd, hw, hd, h, 2.0, R, [{ at: hw, w: 4, y0: 0.3, y1: 3.6 }], opt);
  B.wall(hw, -hd, -hw, -hd, h, 2.0, R, [], opt);
  B.wall(-hw, -hd, -hw, hd, h, 2.0, R, [{ at: 5, w: 2.4, y0: 0.3, y1: 3 }], opt);
  B.wall(hw, hd, hw, -hd, h, 2.0, R, [], opt);
  B.box(0, h, 0, w + 2, 1.4, d + 2, R2, { m: MAT.STONE });
  // Felsen außen herum (verdecken die geraden Wände); [x, y, z, Breite, Höhe, Tiefe]
  const rocks = [
    [-hw - 2.5, -0.5, 4, 5, 8, 8], [hw + 2.5, -0.5, 0, 5, 9, d + 2], [0, -0.5, -hd - 2.5, w + 6, 10, 5],
    [-4, h + 1.4, 1, 12, 4, 10], [5, h + 1.4, -3, 10, 5, 10],
    [-hw + 1, -0.5, hd + 1.2, 6, 7, 3], [hw - 1, -0.5, hd + 1.2, 6, 7.5, 3],
  ];
  rocks.forEach(([x, y, z, sw, sh, sd], i) => B.slab(x, y, z, sw, sh, sd, [R, R2, R3][i % 3], { taper: 0.78 }));
  // Wasserfall vor dem Eingang
  for (let k = 0; k < 5; k++) B.box(-1.8 + k * 0.9, 0.3, hd + 1.4, 0.85, h + 1.2, 0.2, [0x9fe3ff, 0x7fd0f5][k % 2], { col: false, e: 0 });
  B.box(0, -0.2, hd + 2.2, 6, 0.3, 2.5, 0xbdefff, { col: false });
  // Innen: Pool, Lounge, Tresor
  B.box(-3, 0.3, 1, 8, 0.25, 5, C.WALL_WHITE, { m: MAT.STONE });
  B.box(-3, 0.56, 1, 7.2, 0.02, 4.2, C.POOL, { col: false });
  for (const x of [3.5, 5.5, 7.5]) B.box(x, 0.3, 3, 0.8, 0.45, 2, C.WALL_WHITE, { col: false });
  B.box(6, 0.3, -2, 4, 0.8, 1.2, C.CLOTH_RED, { m: MAT.CLOTH });
  // Tresorraum hinten links
  const V = B.sub(-6, -5.5);
  V.wall(-3, 2, 3, 2, 3.2, 0.3, C.STEEL_DARK, [door(4.2, 1.6)], { m: MAT.METAL });
  V.wall(3, 2, 3, -2.5, 3.2, 0.3, C.STEEL_DARK, [], { m: MAT.METAL });
  V.box(0, 3.2, -0.2, 6.2, 0.3, 4.6, C.STEEL_DARK, { m: MAT.METAL });
  for (let k = 0; k < 6; k++) V.box(-2 + (k % 3) * 0.7, 0.3 + Math.floor(k / 3) * 0.3, -1.6, 0.6, 0.28, 0.35, C.GOLD, { col: false });
  chest(out, V, 1.4, 0.3, -1.2, -Math.PI / 2);
  chest(out, B, 8.5, 0.3, -6.5, 0);
  chest(out, B, -9, 0.3, 5.5, Math.PI / 2);
  floorLoot(out, B, 0, 0.3, 5);
  floorLoot(out, B, 4, 0.3, -5);
}
