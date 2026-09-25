// Prozedurale Low-Poly-Modelle für Deko-Objekte (mit LOD-Varianten).
import { GeoBuilder } from './geom.js';
import { PROP_TYPES } from '/shared/map/props.js';

const cache = new Map();

const LEAF = [0x7a9a3a, 0x6f8f32, 0x8aa640];
const TRUNK = [0x7b5638, 0x6e4a2f, 0x86603f];
const ROCK = [0xa4866f, 0x9a8d80, 0xb07a5a];
const CACTUS = [0x4f8f3f, 0x5a9a45, 0x3f7f39];

function acacia(v, lod) {
  const g = new GeoBuilder();
  const tc = TRUNK[v], lc = LEAF[v];
  const h = 3.4 + v * 0.3;
  if (lod) {
    g.cyl(0, h / 2, 0, 0.3, h, tc, { rt: 0.2, seg: 5 });
    g.ico(0, h + 0.6, 0, 3.4, lc, { sy: 0.28, detail: 0 });
    return g;
  }
  g.cyl(0, h * 0.35, 0, 0.32, h * 0.7, tc, { rt: 0.24, seg: 6 });
  // Äste
  const br = [[0.9, 0.5, 0.2], [-0.8, 0.6, -0.3], [0.1, 0.55, 0.9]];
  for (const [bx, s, bz] of br) {
    const len = 1.8;
    g.cyl(bx * 0.6, h * 0.7 + 0.6, bz * 0.6, 0.16, len, tc, { rt: 0.1, seg: 5, rz: -bx * s * 0.9, rx: bz * s * 0.9 });
  }
  // flache Schirmkrone
  g.ico(0, h + 0.7, 0, 3.3, lc, { sx: 1.1, sy: 0.26, detail: 1, jseed: v + 10 });
  g.ico(1.3, h + 1.1, 0.6, 1.9, LEAF[(v + 1) % 3], { sy: 0.3, detail: 0, jseed: v + 11 });
  g.ico(-1.4, h + 0.95, -0.5, 1.8, LEAF[(v + 2) % 3], { sy: 0.32, detail: 0, jseed: v + 12 });
  g.ico(0.2, h + 0.3, -1.4, 1.5, lc, { sy: 0.3, detail: 0, jseed: v + 13 });
  return g;
}

function baobab(v, lod) {
  const g = new GeoBuilder();
  const tc = [0x9c8472, 0x8f7a68, 0xa68d78][v];
  g.cyl(0, 3.2, 0, 1.55, 6.4, tc, { rt: 1.15, seg: lod ? 6 : 9 });
  if (lod) {
    g.ico(0, 7.4, 0, 2.6, LEAF[v], { sy: 0.4 });
    return g;
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + v;
    const l = 2.2;
    g.cyl(Math.cos(a) * 1.0, 7.0, Math.sin(a) * 1.0, 0.35, l, tc, { rt: 0.18, seg: 5, rz: -Math.cos(a) * 0.9, rx: Math.sin(a) * 0.9 });
    g.ico(Math.cos(a) * 2.0, 8.0, Math.sin(a) * 2.0, 0.9, LEAF[(v + i) % 3], { sy: 0.6, detail: 0, jseed: i + 20 });
  }
  g.cyl(0, 6.6, 0, 1.15, 0.6, tc, { rt: 0.8, seg: 9 });
  return g;
}

function deadtree(v, lod) {
  const g = new GeoBuilder();
  const c = [0x8e8174, 0x7d6e62, 0x9a8b7c][v];
  g.cyl(0, 1.8, 0, 0.25, 3.6, c, { rt: 0.14, seg: 5 });
  if (lod) return g;
  g.cyl(0.5, 3.2, 0, 0.1, 1.8, c, { rt: 0.04, seg: 4, rz: -0.8 });
  g.cyl(-0.4, 2.6, 0.3, 0.1, 1.6, c, { rt: 0.04, seg: 4, rz: 0.9, rx: 0.3 });
  g.cyl(0.1, 3.9, -0.3, 0.07, 1.2, c, { rt: 0.03, seg: 4, rx: -0.6 });
  return g;
}

function bush(v, lod) {
  const g = new GeoBuilder();
  const c = [0x6f8f35, 0x8a9a3a, 0x5f7f30][v];
  g.ico(0, 0.45, 0, 0.9, c, { sy: 0.65, detail: 0, jseed: v + 30 });
  if (!lod) {
    g.ico(0.6, 0.35, 0.2, 0.6, LEAF[(v + 1) % 3], { sy: 0.7, jseed: v + 31 });
    g.ico(-0.5, 0.3, -0.3, 0.55, c, { sy: 0.7, jseed: v + 32 });
  }
  return g;
}

function rock(size, v, lod) {
  const g = new GeoBuilder();
  const c = ROCK[v];
  if (size === 0) {
    g.ico(0, 0.1, 0, 0.45, c, { sy: 0.6, jitter: 0.4, jseed: v + 40 });
  } else if (size === 1) {
    g.ico(0, 0.35, 0, 1.2, c, { sy: 0.75, jitter: 0.35, jseed: v + 41, detail: lod ? 0 : 0 });
    if (!lod) g.ico(0.7, 0.2, 0.4, 0.6, ROCK[(v + 1) % 3], { sy: 0.7, jseed: v + 42 });
  } else {
    g.ico(0, 1.0, 0, 2.5, c, { sy: 0.85, jitter: 0.3, jseed: v + 43, detail: lod ? 0 : 1 });
    if (!lod) {
      g.ico(1.8, 0.6, 0.8, 1.3, ROCK[(v + 1) % 3], { sy: 0.8, jseed: v + 44 });
      g.ico(-1.5, 0.4, -1.1, 1.1, ROCK[(v + 2) % 3], { sy: 0.7, jseed: v + 45 });
    }
  }
  return g;
}

function saguaro(v, lod) {
  const g = new GeoBuilder();
  const c = CACTUS[v];
  const h = 4.2;
  const seg = lod ? 5 : 7;
  g.cyl(0, h / 2, 0, 0.36, h, c, { seg });
  g.cyl(0, h + 0.15, 0, 0.36, 0.3, c, { rt: 0.2, seg });
  if (lod) return g;
  const arm = (side, y, up) => {
    g.cyl(side * 0.55, y, 0, 0.22, 0.8, c, { rz: Math.PI / 2, seg: 6 });
    g.cyl(side * 0.9, y + up / 2, 0, 0.22, up, c, { seg: 6 });
    g.cyl(side * 0.9, y + up + 0.08, 0, 0.22, 0.16, c, { rt: 0.12, seg: 6 });
  };
  arm(1, 1.8 + v * 0.3, 1.4);
  if (v !== 1) arm(-1, 2.4, 1.1);
  // Blüte
  g.ico(0, h + 0.35, 0, 0.14, 0xf06292, { e: 0.2 });
  return g;
}

function pear(v, lod) {
  const g = new GeoBuilder();
  const c = CACTUS[(v + 1) % 3];
  const pads = lod ? [[0, 0.45, 0, 0]] : [[0, 0.45, 0, 0], [0.35, 1.0, 0.1, 0.5], [-0.3, 0.95, -0.1, -0.4], [0.1, 1.45, 0, 0.2], [-0.5, 0.4, 0.3, -0.9]];
  for (const [x, y, z, r] of pads) {
    g.ico(x, y, z, 0.42, c, { sx: 1, sy: 1.1, sz: 0.28, rz: r, ry: v, jitter: 0.1 });
    if (!lod) g.ico(x + 0.15, y + 0.4, z, 0.07, 0xe0407a, { e: 0.15 });
  }
  return g;
}

function termite(v, lod) {
  const g = new GeoBuilder();
  const c = [0xb0643e, 0xa55a36, 0xbd7248][v];
  g.cyl(0, 1.2, 0, 0.9, 2.4, c, { rt: 0.25, seg: lod ? 5 : 7 });
  if (!lod) {
    g.cyl(0.45, 1.0, 0.2, 0.35, 1.8, c, { rt: 0.08, seg: 5 });
    g.cyl(-0.3, 0.8, -0.35, 0.35, 1.5, c, { rt: 0.08, seg: 5 });
    g.ico(0, 0.25, 0, 1.1, c, { sy: 0.35 });
  }
  return g;
}

function tallgrass(v) {
  const g = new GeoBuilder();
  const cols = [0xe3be52, 0xd4ad44, 0xc9b84e];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + v;
    const h = 0.9 + ((i * 37) % 5) * 0.12;
    g.box(Math.cos(a) * 0.18, h / 2, Math.sin(a) * 0.18, 0.05, h, 0.12, cols[(i + v) % 3], { rz: Math.cos(a) * 0.3, rx: -Math.sin(a) * 0.3, ry: a });
  }
  return g;
}

function crate(v) {
  const g = new GeoBuilder();
  const c = [0xb07a45, 0xa36e3d, 0xc08a50][v];
  g.box(0, 0.6, 0, 1.2, 1.2, 1.2, c);
  for (const y of [0.06, 1.14]) {
    g.box(0, y, 0.6, 1.24, 0.12, 0.04, 0x7a4e2a);
    g.box(0, y, -0.6, 1.24, 0.12, 0.04, 0x7a4e2a);
    g.box(0.6, y, 0, 0.04, 0.12, 1.24, 0x7a4e2a);
    g.box(-0.6, y, 0, 0.04, 0.12, 1.24, 0x7a4e2a);
  }
  g.box(0, 0.6, 0.61, 1.5, 0.12, 0.03, 0x7a4e2a, { rz: 0.78 });
  return g;
}

function barrel(v) {
  const g = new GeoBuilder();
  const c = [0x9c4a26, 0x3f6fa0, 0x4f7a3a][v];
  g.cyl(0, 0.55, 0, 0.42, 1.1, c, { seg: 10 });
  g.cyl(0, 0.3, 0, 0.44, 0.08, 0x3d4450, { seg: 10 });
  g.cyl(0, 0.8, 0, 0.44, 0.08, 0x3d4450, { seg: 10 });
  g.cyl(0, 1.105, 0, 0.36, 0.01, 0x2b2b2b, { seg: 10 });
  return g;
}

function skull(v) {
  const g = new GeoBuilder();
  const c = 0xf2ead3;
  g.box(0, 0.25, 0, 0.5, 0.4, 0.7, c);
  g.box(0, 0.18, 0.45, 0.34, 0.26, 0.4, c);
  g.box(0.13, 0.32, 0.2, 0.12, 0.1, 0.02, 0x2b2b2b);
  g.box(-0.13, 0.32, 0.2, 0.12, 0.1, 0.02, 0x2b2b2b);
  const hs = v === 2 ? 0.6 : 1;
  g.cyl(0.45, 0.45, -0.1, 0.07, 0.8 * hs, 0xe8dcc0, { rt: 0.02, rz: -1.1, seg: 5 });
  g.cyl(-0.45, 0.45, -0.1, 0.07, 0.8 * hs, 0xe8dcc0, { rt: 0.02, rz: 1.1, seg: 5 });
  return g;
}

function log(v) {
  const g = new GeoBuilder();
  const c = TRUNK[v];
  g.cyl(0, 0.35, 0, 0.36, 3.6, c, { rz: Math.PI / 2, seg: 7 });
  g.cyl(1.8, 0.35, 0, 0.3, 0.02, 0xd8b98a, { rz: Math.PI / 2, seg: 7 });
  g.cyl(-1.8, 0.35, 0, 0.3, 0.02, 0xd8b98a, { rz: Math.PI / 2, seg: 7 });
  g.cyl(0.6, 0.6, 0.25, 0.08, 0.7, c, { rx: 0.6, seg: 4 });
  return g;
}

function palm(v, lod) {
  const g = new GeoBuilder();
  let x = 0, y = 0;
  const lean = 0.18 + v * 0.08;
  for (let i = 0; i < 5; i++) {
    const a = lean * (0.3 + i * 0.2);
    g.cyl(x + Math.sin(a) * 0.6, y + 0.6, 0, 0.26 - i * 0.03, 1.25, 0x9a7650, { rt: 0.22 - i * 0.03, rz: -a, seg: 6 });
    x += Math.sin(a) * 1.2;
    y += Math.cos(a) * 1.2;
  }
  const n = lod ? 4 : 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    g.box(x + Math.cos(a) * 1.4, y - 0.1, Math.sin(a) * 1.4, 3.0, 0.08, 0.9, k % 2 ? 0x4f9a3a : 0x6aa84f, { ry: -a, rz: 0, rx: 0 });
  }
  if (!lod) g.ico(x, y + 0.1, 0, 0.35, 0x7a4e2a);
  return g;
}

function flowers(v) {
  const g = new GeoBuilder();
  const c = [0xf06292, 0xffd54f, 0xba68c8][v];
  for (let i = 0; i < 6; i++) {
    const a = i * 2.1;
    const r = 0.2 + (i % 3) * 0.15;
    g.box(Math.cos(a) * r, 0.18, Math.sin(a) * r, 0.03, 0.36, 0.03, 0x5f8a3a);
    g.ico(Math.cos(a) * r, 0.38, Math.sin(a) * r, 0.08, i % 2 ? c : 0xffffff, { e: 0.1 });
  }
  return g;
}

// Liefert kompiliertes Modell {pos, col, emi} für Typ/Variante/LOD
export function propModel(type, v, lod = 0) {
  const key = type * 10 + v + lod * 1000;
  let m = cache.get(key);
  if (m) return m;
  const name = PROP_TYPES[type];
  let g;
  switch (name) {
    case 'acacia': g = acacia(v, lod); break;
    case 'baobab': g = baobab(v, lod); break;
    case 'deadtree': g = deadtree(v, lod); break;
    case 'bush': g = bush(v, lod); break;
    case 'rock_s': g = rock(0, v, lod); break;
    case 'rock_m': g = rock(1, v, lod); break;
    case 'rock_l': g = rock(2, v, lod); break;
    case 'saguaro': g = saguaro(v, lod); break;
    case 'pear': g = pear(v, lod); break;
    case 'termite': g = termite(v, lod); break;
    case 'tallgrass': g = tallgrass(v); break;
    case 'crate': g = crate(v); break;
    case 'barrel': g = barrel(v); break;
    case 'skull': g = skull(v); break;
    case 'log': g = log(v); break;
    case 'palm_s': g = palm(v, lod); break;
    case 'flowers': g = flowers(v); break;
    default: g = new GeoBuilder().box(0, 0.5, 0, 1, 1, 1, 0xff00ff);
  }
  m = g.compile();
  cache.set(key, m);
  return m;
}

// Welche Typen werden im Fern-LOD weggelassen?
export const LOD_SKIP = new Set(['rock_s', 'tallgrass', 'flowers', 'skull', 'pear', 'barrel', 'crate', 'log']);

export { acacia as acaciaBuilder, bush as bushBuilder };
