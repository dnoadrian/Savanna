// Prozedurale Low-Poly-Modelle für Deko-Objekte (mit LOD-Varianten): Palmen, Felsen, Fässer,
// Kisten, Bojen, Laubbäume, Tannen, Autos, Heuballen und für die Schneeinsel verschneite Fichten,
// Felsbrocken mit Schneehaube, Eisbrocken und Eisschollen.
import { GeoBuilder } from './geom.js';
import { PROP_TYPES } from '../../shared/map/props.js';
import { TX } from '../../shared/map/builder.js';

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

// ---------- Bäume, Felsen, Autos, Heuballen ----------
const LEAF = [0x4f9e3a, 0x5fae42, 0x3f8c34];
const LEAF_DARK = [0x2f6e3a, 0x3a7a3f, 0x285f33];
const BARK = [0x7a5537, 0x6b4a30, 0x86603e];
const STONE = [0x9aa0a6, 0x8a9096, 0xa9adb2];
const CAR = [0xd6453a, 0x3a78d6, 0xe8e2d6];

// runder Laubbaum: Stamm + mehrere Blätterkugeln
function tree(v, lod) {
  const g = new GeoBuilder();
  g.cyl(0, 1.6, 0, 0.3, 3.2, BARK[v], { rt: 0.24, seg: lod ? 5 : 7 });
  if (!lod) {
    g.cyl(0.35, 2.6, 0, 0.12, 1.2, BARK[v], { rz: -0.7, seg: 5 });
    g.cyl(-0.3, 2.9, 0.2, 0.1, 1.0, BARK[v], { rz: 0.7, seg: 5 });
  }
  g.ico(0, 4.4, 0, 2.0, LEAF[v], { sy: 0.85, detail: lod ? 0 : 1, jseed: v + 60 });
  if (!lod) {
    g.ico(1.2, 3.8, 0.4, 1.3, LEAF[(v + 1) % 3], { sy: 0.8, jseed: v + 61 });
    g.ico(-1.1, 3.9, -0.5, 1.25, LEAF[(v + 2) % 3], { sy: 0.8, jseed: v + 62 });
    g.ico(0.2, 5.3, -0.3, 1.2, LEAF[v], { sy: 0.8, jseed: v + 63 });
  }
  return g;
}

// Tanne aus drei Kegeln
function pine(v, lod) {
  const g = new GeoBuilder();
  g.cyl(0, 0.8, 0, 0.26, 1.6, BARK[(v + 1) % 3], { seg: 5 });
  const tiers = lod ? [[1.2, 1.7, 2.6], [3.2, 1.1, 2.6]] : [[1.2, 1.8, 2.2], [2.6, 1.4, 2.0], [3.9, 1.0, 1.8], [5.0, 0.6, 1.4]];
  tiers.forEach(([y, r, h], i) => {
    g.cyl(0, y + h / 2, 0, r, h, LEAF_DARK[(v + i) % 3], { rt: 0.05, seg: lod ? 6 : 8 });
  });
  return g;
}

function stone(size, v, lod) {
  const g = new GeoBuilder();
  const c = STONE[v];
  if (size === 0) {
    g.ico(0, 0.1, 0, 0.45, c, { sy: 0.6, jitter: 0.4, jseed: v + 70, tx: TX.ROCK });
  } else if (size === 1) {
    g.ico(0, 0.35, 0, 1.2, c, { sy: 0.75, jitter: 0.35, jseed: v + 71, tx: TX.ROCK });
    if (!lod) g.ico(0.7, 0.2, 0.4, 0.6, STONE[(v + 1) % 3], { sy: 0.7, jseed: v + 72, tx: TX.ROCK });
  } else {
    g.slab(0, 0.6, 0, 3.8, 1.6, 3.2, c, { ry: v, taper: 0.85, tx: TX.ROCK });
    g.slab(0.2, 1.8, -0.1, 3.0, 1.0, 2.6, STONE[(v + 1) % 3], { ry: v + 0.4, taper: 0.8, tx: TX.ROCK });
    if (!lod) {
      g.slab(-0.1, 2.6, 0.1, 2.0, 0.7, 1.8, STONE[(v + 2) % 3], { ry: v + 0.9, taper: 0.7, tx: TX.ROCK });
      g.ico(1.9, 0.3, 1.0, 0.8, STONE[(v + 1) % 3], { sy: 0.7, jseed: v + 74, tx: TX.ROCK });
    }
  }
  return g;
}

// Auto (Länge entlang X)
function car(v, lod) {
  const g = new GeoBuilder();
  const c = CAR[v];
  g.box(0, 0.72, 0, 4.3, 0.75, 1.9, c);
  g.box(-0.25, 1.45, 0, 2.3, 0.7, 1.7, c);
  g.box(-0.25, 1.47, 0, 2.34, 0.5, 1.74, 0x2c3e50, { vary: 0 });
  g.box(-0.25, 1.83, 0, 2.1, 0.06, 1.6, c);
  for (const [x, z] of [[1.35, 0.9], [-1.35, 0.9], [1.35, -0.9], [-1.35, -0.9]]) g.cyl(x, 0.38, z, 0.38, 0.3, 0x1f1f1f, { rx: Math.PI / 2, seg: lod ? 6 : 10 });
  if (!lod) {
    g.box(2.16, 0.78, 0.6, 0.04, 0.2, 0.36, 0xfff1a8, { e: 1 });
    g.box(2.16, 0.78, -0.6, 0.04, 0.2, 0.36, 0xfff1a8, { e: 1 });
    g.box(-2.16, 0.8, 0.62, 0.04, 0.18, 0.3, 0xd6222a);
    g.box(-2.16, 0.8, -0.62, 0.04, 0.18, 0.3, 0xd6222a);
    g.box(0, 0.4, 0, 4.36, 0.12, 1.94, 0x3a3a3a);
  }
  return g;
}

// runder Heuballen (liegend)
function hay(v) {
  const g = new GeoBuilder();
  const c = [0xe2bd52, 0xd8b048, 0xebc75c][v];
  g.cyl(0, 0.75, 0, 0.75, 1.5, c, { rx: Math.PI / 2, seg: 12 });
  g.cyl(0, 0.75, 0.76, 0.6, 0.02, 0xc79a3a, { rx: Math.PI / 2, seg: 12 });
  g.cyl(0, 0.75, -0.76, 0.6, 0.02, 0xc79a3a, { rx: Math.PI / 2, seg: 12 });
  return g;
}

function flower(v) {
  const g = new GeoBuilder();
  const c = [0xf25c78, 0xffd23f, 0xb46bf2][v];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + v;
    const x = Math.cos(a) * 0.25, z = Math.sin(a) * 0.25;
    g.box(x, 0.18, z, 0.03, 0.36, 0.03, 0x4f9e3a);
    g.ico(x, 0.4, z, 0.09, i % 2 ? c : 0xffffff, { detail: 0 });
  }
  return g;
}

function reed(v) {
  const g = new GeoBuilder();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + v;
    const h = 1.0 + ((i * 13) % 5) * 0.12;
    g.box(Math.cos(a) * 0.18, h / 2, Math.sin(a) * 0.18, 0.05, h, 0.05, [0x6f8f3a, 0x7fa048, 0x5f7f32][(i + v) % 3], { rz: Math.cos(a) * 0.15, rx: -Math.sin(a) * 0.15 });
    if (i % 2 === 0) g.box(Math.cos(a) * 0.22, h + 0.1, Math.sin(a) * 0.22, 0.09, 0.25, 0.09, 0x6b4a26);
  }
  return g;
}

function stump(v) {
  const g = new GeoBuilder();
  g.cyl(0, 0.27, 0, 0.45, 0.55, BARK[v], { rt: 0.4, seg: 8 });
  g.cyl(0, 0.56, 0, 0.4, 0.02, 0xd8b98a, { seg: 8 });
  return g;
}

// Verschneite Fichte: schlanke Kegel-Etagen, jede mit Schneemantel (unten schaut Grün hervor)
const SPRUCE = [0x2e5e3f, 0x356a45, 0x29553a];
const SNOW = 0xf3f7fb;
function spruce(v, lod) {
  const g = new GeoBuilder();
  const green = SPRUCE[v];
  g.cyl(0, 1.0, 0, 0.28, 2.0, BARK[(v + 1) % 3], { rt: 0.2, seg: 6 });
  const tiers = lod ? 3 : 6;
  for (let i = 0; i < tiers; i++) {
    const k = lod ? i * 2 : i;
    const y = 1.1 + k * 1.35;
    const r = (2.0 - k * 0.27) * (lod ? 1.05 : 1);
    const h = (2.2 - k * 0.12) * (lod ? 1.5 : 1);
    const rot = i * 0.7 + v;
    g.cyl(0, y + h / 2, 0, r, h, green, { rt: 0.06, seg: lod ? 7 : 9, ry: rot, vary: 0.08 });
    // Schneemantel: deckt die oberen 70 % der Etage knapp außerhalb des Kegels
    g.cyl(0, y + h * 0.3 + (h * 0.7) / 2 + 0.03, 0, r * 0.75, h * 0.7, SNOW, { rt: 0.05, seg: lod ? 7 : 9, ry: rot, vary: 0.03, tx: TX.SNOW });
    if (!lod && i < 4) {
      // Schneeklumpen auf den Astspitzen
      for (let q = 0; q < 3; q++) {
        const a = rot * 2 + q * 2.1;
        g.ico(Math.cos(a) * r * 0.72, y + h * 0.3, Math.sin(a) * r * 0.72, 0.28, SNOW, { sy: 0.55, jseed: v * 9 + i * 3 + q, tx: TX.SNOW });
      }
    }
  }
  g.cyl(0, 1.1 + (lod ? 4 : 5) * 1.35 + 2.3, 0, 0.2, 0.9, SNOW, { rt: 0.02, seg: 6, tx: TX.SNOW });
  return g;
}

// Felsbrocken mit Schneehaube (braun wie im Gebirge)
const BOULDER = [0x6e5a4b, 0x7a6352, 0x5f4d40];
function boulder(v, lod) {
  const g = new GeoBuilder();
  g.ico(0, 0.45, 0, 1.35, BOULDER[v], { sy: 0.72, detail: lod ? 0 : 1, jitter: 0.3, jseed: v + 80, tx: TX.ROCK });
  if (!lod) g.ico(0.95, 0.2, 0.5, 0.75, BOULDER[(v + 1) % 3], { sy: 0.7, jseed: v + 81, tx: TX.ROCK });
  g.ico(-0.1, 1.08, 0.05, 1.08, SNOW, { sy: 0.32, detail: lod ? 0 : 1, jitter: 0.2, jseed: v + 82, tx: TX.SNOW });
  return g;
}

// kantiger Brocken aus blauem Gletschereis mit Schneedecke
const ICE = [0x4ec3e8, 0x3fb4e0, 0x62cdec];
function iceChunk(v, lod) {
  const g = new GeoBuilder();
  const ry = v * 0.7;
  g.slab(0, 0.75, 0, 2.3, 1.9, 1.9, ICE[v], { ry, taper: 0.74, tx: TX.ICE });
  g.slab(0, 1.78, 0, 1.55, 0.2, 1.3, SNOW, { ry, taper: 0.85, tx: TX.SNOW });
  if (!lod) g.slab(1.25, 0.3, 0.7, 1.1, 1.0, 1.0, ICE[(v + 1) % 3], { ry: ry + 0.6, taper: 0.7, tx: TX.ICE });
  return g;
}

// Eisscholle im Meer
function floe(v) {
  const g = new GeoBuilder();
  const w = [5.5, 4.2, 6.4][v], d = [4.2, 3.6, 3.4][v];
  g.slab(0, -0.12, 0, w + 0.3, 0.35, d + 0.3, 0x86d3ea, { taper: 0.95, tx: TX.ICE });
  g.slab(0, 0.12, 0, w, 0.22, d, 0xeef5fa, { taper: 0.9, tx: TX.SNOW });
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
    case 'tree': g = tree(v, lod); break;
    case 'pine': g = pine(v, lod); break;
    case 'snowpine': g = spruce(v, lod); break;
    case 'boulder': g = boulder(v, lod); break;
    case 'icechunk': g = iceChunk(v, lod); break;
    case 'floe': g = floe(v); break;
    case 'stone_s': g = stone(0, v, lod); break;
    case 'stone_m': g = stone(1, v, lod); break;
    case 'stone_l': g = stone(2, v, lod); break;
    case 'car': g = car(v, lod); break;
    case 'hay': g = hay(v); break;
    case 'flower': g = flower(v); break;
    case 'reed': g = reed(v); break;
    case 'stump': g = stump(v); break;
    default: g = new GeoBuilder().box(0, 0.5, 0, 1, 1, 1, 0xff00ff);
  }
  m = g.compile();
  cache.set(key, m);
  return m;
}

// Welche Typen werden im Fern-LOD weggelassen?
export const LOD_SKIP = new Set(['rock_s', 'beachgrass', 'fern', 'barrel', 'crate', 'log', 'buoy', 'stone_s', 'flower', 'reed', 'stump', 'hay', 'floe']);

export { palm as palmBuilder, bush as bushBuilder };
