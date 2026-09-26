// Prozedurale Low-Poly-Modelle für Deko-Objekte (mit LOD-Varianten) – Hafenbucht-Stil:
// geschwungene Palmen, rote Canyon-Felsen, Fässer, Kisten, Bojen, Strandgras.
import { GeoBuilder } from './geom.js';
import { PROP_TYPES } from '../../shared/map/props.js';

const cache = new Map();

const FROND = [0x3f9f35, 0x55b443, 0x2f8a30];
const TRUNK = [0x8d6a45, 0x7e5d3b, 0x9a7650];
const ROCK = [0xc2613d, 0xb0553a, 0xcf7a4d];

// Palmwedel: drei Segmente, die nach außen hängen
function frond(g, x, y, z, yaw, len, color, lod) {
  const segs = lod ? [[0.1, 1.0]] : [[-0.2, 0.95], [0.35, 0.8], [0.85, 0.5]];
  const L = len / segs.length;
  let px = x, py = y, pz = z;
  for (const [pitch, w] of segs) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dx = Math.cos(yaw) * cp, dy = -sp, dz = -Math.sin(yaw) * cp;
    g.box(px + dx * L / 2, py + dy * L / 2, pz + dz * L / 2, L, 0.06, w, color, { ry: yaw, rz: -pitch, vary: 0.1 });
    px += dx * L; py += dy * L; pz += dz * L;
  }
}

function palm(v, lod, tall) {
  const g = new GeoBuilder();
  let x = 0, y = 0;
  const n = tall ? 7 : 5;
  const segH = tall ? 1.0 : 0.85;
  const lean = 0.1 + v * 0.07;
  for (let i = 0; i < n; i++) {
    const a = lean * (0.2 + i * 0.22);
    const r = (tall ? 0.27 : 0.22) - i * 0.018;
    g.cyl(x + Math.sin(a) * segH / 2, y + Math.cos(a) * segH / 2, 0, r, segH * 1.04, i % 2 ? TRUNK[v] : TRUNK[(v + 1) % 3], { rt: r - 0.02, rz: -a, seg: lod ? 5 : 7 });
    x += Math.sin(a) * segH;
    y += Math.cos(a) * segH;
  }
  const fronds = lod ? 5 : 9;
  const len = tall ? 3.6 : 2.8;
  for (let k = 0; k < fronds; k++) {
    const yaw = (k / fronds) * Math.PI * 2 + v * 0.7;
    frond(g, x, y + 0.05, 0, yaw, len * (0.85 + (k % 3) * 0.1), FROND[(k + v) % 3], lod);
  }
  if (!lod) {
    // Nüsse + Wedelansatz
    g.ico(x, y - 0.05, 0, 0.35, 0x5f7f2a, { sy: 0.8 });
    for (let k = 0; k < 3; k++) g.ico(x + Math.cos(k * 2.1) * 0.28, y - 0.3, Math.sin(k * 2.1) * 0.28, 0.17, 0x6b4a26, { jitter: 0.1 });
  }
  return g;
}

function bush(v, lod) {
  const g = new GeoBuilder();
  const c = [0x4d9a36, 0x5eab3c, 0x3f8a32][v];
  g.ico(0, 0.5, 0, 0.95, c, { sy: 0.7, detail: lod ? 0 : 1, jseed: v + 30 });
  if (!lod) {
    g.ico(0.65, 0.38, 0.2, 0.62, FROND[(v + 1) % 3], { sy: 0.75, jseed: v + 31 });
    g.ico(-0.55, 0.34, -0.3, 0.58, c, { sy: 0.75, jseed: v + 32 });
  }
  return g;
}

function rock(size, v, lod) {
  const g = new GeoBuilder();
  const c = ROCK[v];
  if (size === 0) {
    g.ico(0, 0.1, 0, 0.45, c, { sy: 0.6, jitter: 0.4, jseed: v + 40 });
  } else if (size === 1) {
    g.ico(0, 0.35, 0, 1.2, c, { sy: 0.75, jitter: 0.35, jseed: v + 41 });
    if (!lod) g.ico(0.7, 0.2, 0.4, 0.6, ROCK[(v + 1) % 3], { sy: 0.7, jseed: v + 42 });
  } else {
    // große, geschichtete Canyon-Brocken
    g.slab(0, 0.6, 0, 3.8, 1.6, 3.2, c, { ry: v, taper: 0.85 });
    g.slab(0.2, 1.8, -0.1, 3.0, 1.0, 2.6, ROCK[(v + 1) % 3], { ry: v + 0.4, taper: 0.8 });
    if (!lod) {
      g.slab(-0.1, 2.6, 0.1, 2.0, 0.7, 1.8, ROCK[(v + 2) % 3], { ry: v + 0.9, taper: 0.7 });
      g.ico(1.9, 0.3, 1.0, 0.8, ROCK[(v + 1) % 3], { sy: 0.7, jseed: v + 44 });
    }
  }
  return g;
}

function beachgrass(v) {
  const g = new GeoBuilder();
  const cols = [0x6fb043, 0x8fbe4c, 0x5a9a3a];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + v;
    const h = 0.55 + ((i * 37) % 5) * 0.08;
    g.box(Math.cos(a) * 0.15, h / 2, Math.sin(a) * 0.15, 0.05, h, 0.1, cols[(i + v) % 3], { rz: Math.cos(a) * 0.4, rx: -Math.sin(a) * 0.4, ry: a });
  }
  return g;
}

function fern(v, lod) {
  const g = new GeoBuilder();
  const n = lod ? 4 : 7;
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + v;
    g.box(Math.cos(yaw) * 0.45, 0.28, -Math.sin(yaw) * 0.45, 1.0, 0.04, 0.34, FROND[(i + v) % 3], { ry: yaw, rz: 0.45 });
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
  const c = [0x8e5a30, 0x9a6438, 0xb2402c][v];
  g.cyl(0, 0.55, 0, 0.4, 1.1, c, { seg: 10, rt: 0.36 });
  g.cyl(0, 0.55, 0, 0.43, 0.5, c, { seg: 10 });
  for (const y of [0.18, 0.92]) g.cyl(0, y, 0, 0.42, 0.07, 0x3d3a38, { seg: 10 });
  g.cyl(0, 1.1, 0, 0.34, 0.02, 0x5a3a20, { seg: 10 });
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

// schwimmende Boje (rot/weiß) mit kleinem Mast
function buoy(v) {
  const g = new GeoBuilder();
  const red = v === 1 ? 0xf2c230 : 0xe0452e;
  g.cyl(0, -0.05, 0, 0.42, 0.36, red, { rt: 0.36, seg: 10 });
  g.cyl(0, 0.2, 0, 0.3, 0.16, 0xf5f2ea, { rt: 0.24, seg: 10 });
  g.cyl(0, 0.55, 0, 0.05, 0.6, 0x3d3a38, { seg: 5 });
  g.cyl(0, 0.9, 0, 0.1, 0.16, red, { seg: 6, e: 0.4 });
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
    case 'palm': g = palm(v, lod, true); break;
    case 'palm_s': g = palm(v, lod, false); break;
    case 'bush': g = bush(v, lod); break;
    case 'rock_s': g = rock(0, v, lod); break;
    case 'rock_m': g = rock(1, v, lod); break;
    case 'rock_l': g = rock(2, v, lod); break;
    case 'crate': g = crate(v); break;
    case 'barrel': g = barrel(v); break;
    case 'beachgrass': g = beachgrass(v); break;
    case 'log': g = log(v); break;
    case 'buoy': g = buoy(v); break;
    case 'fern': g = fern(v, lod); break;
    default: g = new GeoBuilder().box(0, 0.5, 0, 1, 1, 1, 0xff00ff);
  }
  m = g.compile();
  cache.set(key, m);
  return m;
}

// Welche Typen werden im Fern-LOD weggelassen?
export const LOD_SKIP = new Set(['rock_s', 'beachgrass', 'fern', 'barrel', 'crate', 'log', 'buoy']);

export { palm as palmBuilder, bush as bushBuilder };
