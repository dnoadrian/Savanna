// Baukasten für die Karte: Truhen, Beute, Schilder, Stege, Container, Blockhütte, Gasthaus, Zelt.
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

// Steg ins Wasser entlang +Z (Oberkante ly über dem Ursprung)
export function dock(B, out, len = 14, w = 3, ly = 0.55, boat = true) {
  deck(B, 0, len / 2, w, len, ly, 'x');
  posts(B, -w / 2 + 0.15, w / 2 - 0.15, 0.5, len - 0.3, 3, 2.2, ly);
  if (boat) B.boat(w / 2 + 1.4, len * 0.6, 0.1, C.WALL_BLUE, -0.25);
  floorLoot(out, B, 0, ly, len - 1.5);
}

// Blockbohlen außen an einer Wand entlang X (bei z) – Tür- und Fensteröffnungen bleiben frei,
// damit man sieht, wo man hindurchgehen kann. ops: [{ x, w, y0, y1 }]
function logStrips(B, z, x0, x1, h, ops, color) {
  for (let y = 0.35; y < h; y += 0.45) {
    const cuts = ops.filter((q) => y + 0.1 > q.y0 && y < q.y1).map((q) => [q.x - q.w / 2 - 0.04, q.x + q.w / 2 + 0.04]).sort((a, b) => a[0] - b[0]);
    let cur = x0;
    for (const [a, b] of cuts) {
      if (a > cur + 0.05) B.box((cur + a) / 2, y, z, a - cur, 0.1, 0.06, color, { col: false });
      cur = Math.max(cur, b);
    }
    if (x1 > cur + 0.05) B.box((cur + x1) / 2, y, z, x1 - cur, 0.1, 0.06, color, { col: false });
  }
}

// Türrahmen (Pfosten + Sturz) in einer Wand entlang X bei z und ein offenes Türblatt, das nach
// innen (−Z) an der Laibung steht – so ist klar: hier ist offen
function openDoor(B, x, z, w, h, thick, color, leaf) {
  for (const sg of [-1, 1]) B.box(x + sg * (w / 2 + 0.06), 0.2, z, 0.12, h - 0.2, thick + 0.14, color, { col: false });
  B.box(x, h, z, w + 0.36, 0.14, thick + 0.14, color, { col: false });
  const lw = w - 0.12;
  B.box(x - w / 2 + 0.06, 0.22, z - thick / 2 - lw / 2 - 0.02, 0.06, h - 0.3, lw, leaf, { col: false });
  B.box(x - w / 2 + 0.1, 1.05, z - thick / 2 - lw + 0.12, 0.05, 0.05, 0.08, 0x2a2a2a, { col: false });
}

// Blockhütte
export function cabin(B, out, o = {}) {
  const w = o.w ?? 6.5, d = o.d ?? 5.5, hw = w / 2, hd = d / 2, h = 2.8;
  const wc = o.wall ?? C.WOOD_DARK;
  B.box(0, 0, 0, w, 0.2, d, C.PLANK, { m: MAT.WOOD });
  const dr = door(w * 0.33, 1.9, 2.3), wf = win(w * 0.78, 1.0), wb = win(w / 2, 1.1);
  B.wall(-hw, hd, hw, hd, h, 0.3, wc, [dr, wf]);
  B.wall(hw, -hd, -hw, -hd, h, 0.3, wc, [wb]);
  B.wall(-hw, -hd, -hw, hd, h, 0.3, wc, [win(d / 2, 1.0)]);
  B.wall(hw, hd, hw, -hd, h, 0.3, wc, []);
  logStrips(B, hd + 0.16, -hw - 0.15, hw + 0.15, h, [{ ...dr, x: -hw + dr.at }, { ...wf, x: -hw + wf.at }], C.WOOD);
  logStrips(B, -hd - 0.16, -hw - 0.15, hw + 0.15, h, [{ ...wb, x: hw - wb.at }], C.WOOD);
  openDoor(B, -hw + dr.at, hd, dr.w, dr.y1, 0.3, C.WOOD_DARK, C.WOOD);
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
