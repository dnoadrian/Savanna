// Deterministische Generierung der Karte „Showdown Bay“ (gleich auf Server und Client):
// eine türkise Bucht mit flachem Wasser, Sandinseln und Stegen, rundum rote Canyonwände,
// graue Brandungspfeiler, Palmen und drei Orte (Saloon Pier, Lighthouse Point, Tin Roof Wharf).
import { Noise2D, smoothstep, lerp } from '../noise.js';
import { RNG } from '../rng.js';
import { WORLD_HALF, GRID_CELL, MAP_SEED, PLAY_RADIUS } from '../constants.js';
import { Terrain, SURF } from './terrain.js';
import { CollisionWorld, MAT } from '../physics/collision.js';
import { Builder, C } from './builder.js';
import { PT, propColliders, propRadius } from './props.js';
import {
  POIS as POI_DEFS, DECK_Y, buildSaloon, buildLighthouse, buildWharf, buildHut, buildWatchtower, buildSeaStack,
} from './pois.js';

const SEABED = -0.62; // flaches Wasser: überall durchwatbar

// Sandinseln: Mitte, Radien, Höhe, Drehung
const ISLANDS = [
  { x: 0, z: -93, rx: 34, rz: 13, h: 1.0, rot: 0 }, // Nordstrand hinter dem Saloon
  { x: -70, z: -8, rx: 17, rz: 24, h: 1.15, rot: 0.15 }, // Lighthouse Point
  { x: -88, z: -6, rx: 11, rz: 36, h: 1.0, rot: 0 }, // Weststrand
  { x: 4, z: 63, rx: 21, rz: 14, h: 0.95, rot: 0 }, // Tin Roof Wharf
  { x: -4, z: 4, rx: 9, rz: 9, h: 0.9, rot: 0.3 }, // Mittelinsel
  { x: 54, z: -47, rx: 10, rz: 8, h: 0.95, rot: -0.4 }, // Hütte Nordost
  { x: -58, z: 58, rx: 21, rz: 13, h: 0.95, rot: -0.5 }, // Südweststrand
  { x: -34, z: 44, rx: 9, rz: 9, h: 0.9, rot: 0 }, // Sandbank mit Wachturm
  { x: 84, z: 30, rx: 11, rz: 28, h: 0.95, rot: 0.4 }, // Oststrand
  { x: 10, z: 92, rx: 24, rz: 9, h: 0.9, rot: 0 }, // Südstrand
  { x: 58, z: 12, rx: 8, rz: 6, h: 0.6, rot: 0.2 }, // Sandbank bei den Pfeilern
];

// Ebene Flächen für Bauwerke
const FLATS = [
  { x: 4, z: 61, r: 15, h: 0.95 },
  { x: -4, z: 4, r: 6, h: 0.9 },
  { x: 54, z: -47, r: 6, h: 0.95 },
  { x: -64, z: -8, r: 16, h: 1.15 },
  { x: -34, z: 44, r: 5, h: 0.9 },
];

// Stege (Polylinien), rail: Geländer links (1), rechts (-1) oder keins (0)
const WALKS = [
  { pts: [[0, -49], [0, -30], [-3, -3]], rail: 1 },
  { pts: [[-2, 12], [1, 32], [4, 48]], rail: -1 },
  { pts: [[-13, 3], [-30, 1], [-52, -3]], rail: 1 },
  { pts: [[14, -60], [30, -56], [45, -50]], rail: 0 },
  { pts: [[5, 1], [22, -4], [38, -6]], rail: 0 },
  { pts: [[21, 62], [48, 58], [73, 42]], rail: 1 },
  { pts: [[-60, 16], [-59, 34], [-58, 46]], rail: -1 },
  { pts: [[-13, 64], [-30, 58], [-45, 56]], rail: 0 },
  { pts: [[-31, 57], [-34, 50]], rail: 0 },
];

// Brandungspfeiler: x, z, Höhe, Radius
const STACKS = [[62, 4, 15, 4.8], [46, 26, 10, 3.8], [72, -20, 17, 4.4], [-30, -60, 9, 3.4], [24, -32, 7, 2.8], [-44, 26, 8, 3]];

function distToSeg(x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const l2 = dx * dx + dz * dz;
  let t = ((x - x1) * dx + (z - z1) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x1 + dx * t - x, z1 + dz * t - z);
}

export function generateMap(seed = MAP_SEED, onProgress = null) {
  const t0 = Date.now();
  const n1 = new Noise2D(seed);
  const n2 = new Noise2D(seed + 11);
  const n3 = new Noise2D(seed + 23);
  const N = Math.round((WORLD_HALF * 2) / GRID_CELL);
  const S = N + 1;
  const cell = GRID_CELL;

  // Radius der Canyonwand je Richtung
  const rimR = (x, z) => {
    const a = Math.atan2(z, x);
    return PLAY_RADIUS - 2 + n1.noise(Math.cos(a) * 1.6 + 3, Math.sin(a) * 1.6) * 4 + n2.noise(Math.cos(a) * 5, Math.sin(a) * 5) * 1.5;
  };

  const heightFn = (x, z) => {
    let h = SEABED + n2.fbm(x / 22, z / 22, 2) * 0.07;
    for (const is of ISLANDS) {
      const c = Math.cos(is.rot), s = Math.sin(is.rot);
      const lx = (x - is.x) * c - (z - is.z) * s, lz = (x - is.x) * s + (z - is.z) * c;
      const d = Math.sqrt((lx / is.rx) ** 2 + (lz / is.rz) ** 2) + n3.noise(x / 9, z / 9) * 0.09;
      const k = smoothstep(1.05, 0.55, d);
      if (k > 0) h = Math.max(h, SEABED + (is.h + n1.noise(x / 14, z / 14) * 0.12 - SEABED) * k);
    }
    const r = Math.hypot(x, z);
    const R = rimR(x, z);
    if (r > R - 14) {
      const beach = lerp(SEABED, 1.0, smoothstep(R - 14, R - 5, r));
      h = Math.max(h, beach);
      if (r > R - 1) h = Math.max(h, lerp(1.0, 5.5 + n1.noise(x / 12, z / 12) * 1.5, smoothstep(R - 1, R + 7, r)));
    }
    for (const f of FLATS) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r + 4) h = lerp(h, f.h, smoothstep(f.r + 4, f.r, d));
    }
    return h;
  };

  const heights = new Float32Array(S * S);
  for (let j = 0; j < S; j++) {
    const z = -WORLD_HALF + j * cell;
    for (let i = 0; i < S; i++) heights[j * S + i] = heightFn(-WORLD_HALF + i * cell, z);
  }
  onProgress && onProgress(0.25);

  const surface = new Uint8Array(S * S);
  const terrain = new Terrain(heights, surface, N, cell, WORLD_HALF);
  for (let j = 0; j < S; j++) {
    const z = -WORLD_HALF + j * cell;
    for (let i = 0; i < S; i++) {
      const x = -WORLD_HALF + i * cell;
      const idx = j * S + i;
      const h = heights[idx];
      const r = Math.hypot(x, z);
      let s;
      if (r > rimR(x, z) + 1) s = SURF.ROCK;
      else if (h < -0.2) s = SURF.SEAFLOOR;
      else if (h > 1.02 && n3.fbm(x / 10, z / 10, 2) > 0.1 && r < 90) s = SURF.GRASS;
      else s = SURF.BEACH;
      surface[idx] = s;
    }
  }
  onProgress && onProgress(0.4);

  const hAt = (x, z) => terrain.heightAt(x, z);

  // ---------------- Bauwerke ----------------
  const parts = [];
  const groups = {};
  const out = { chests: [], floorLoot: [], signs: [], smoke: [] };
  const poiById = Object.fromEntries(POI_DEFS.map((p) => [p.id, { ...p }]));
  buildSaloon(new Builder(parts, 0, -66, DECK_Y, 0, groups), out);
  buildLighthouse(new Builder(parts, -62, -6, 1.15, 0, groups), out);
  buildWharf(new Builder(parts, 4, 60, 0.95, 0, groups), out);
  buildHut(new Builder(parts, 54, -47, 0.95, -0.4, groups), out);
  buildWatchtower(new Builder(parts, -6, 1, 0.9, 0, groups), out);
  buildWatchtower(new Builder(parts, -34, 44, 0.9, Math.PI, groups), out);
  // Wachturm im Wasser mit Plattform am Steg
  {
    const B = new Builder(parts, 40, -15, DECK_Y, 0, groups);
    B.box(0, -0.22, 3.5, 5, 0.22, 10, C.BOARD, { m: MAT.WOOD });
    for (const [x, z] of [[-2.4, -1.4], [2.4, -1.4], [-2.4, 8.4], [2.4, 8.4]]) B.cyl(x, -1.4, z, 0.17, 1.4, C.BOARD_DARK, { seg: 6, col: false });
    buildWatchtower(B, out, 5.2);
  }
  for (const [x, z, h, r] of STACKS) buildSeaStack(new Builder(parts, x, z, hAt(x, z), n1.noise(x, z) * 3, groups), h, r);

  // Stege
  const rng = new RNG(seed ^ 0x51a9);
  for (const w of WALKS) {
    for (let k = 0; k < w.pts.length - 1; k++) {
      const [x1, z1] = w.pts[k], [x2, z2] = w.pts[k + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ry = Math.atan2(-(x2 - x1), -(z2 - z1));
      const B = new Builder(parts, (x1 + x2) / 2, (z1 + z2) / 2, DECK_Y, ry, groups);
      B.box(0, -0.22, 0, 3, 0.22, len + 0.4, C.BOARD, { m: MAT.WOOD });
      const planks = Math.round(len / 0.8);
      for (let q = 0; q < planks; q += 2) {
        const col = (q / 2) % 3 === 0 ? C.BOARD_LIGHT : (q / 2) % 3 === 1 ? C.BOARD_DARK : C.BOARD;
        B.box(0, -0.01, -len / 2 + (q + 0.5) * (len / planks), 3.02, 0.03, (len / planks) * 0.9, col, { col: false });
      }
      const posts = Math.max(1, Math.round(len / 3.2));
      for (let q = 0; q <= posts; q++) {
        const lz = -len / 2 + (q / posts) * len;
        for (const sx of [-1.35, 1.35]) {
          const wx = B.wx(sx, lz), wz = B.wz(sx, lz);
          if (hAt(wx, wz) > DECK_Y - 0.1) continue;
          B.cyl(sx, -1.6, lz, 0.15, 1.6, C.BOARD_DARK, { seg: 6, col: false });
        }
      }
      if (w.rail) B.railing(w.rail * 1.4, -len / 2 + 0.5, w.rail * 1.4, len / 2 - 0.5, 0, 0.95, C.BOARD_DARK);
      if (rng.chance(0.35)) out.floorLoot.push({ x: B.wx(-w.rail * 0.6, 0), y: DECK_Y, z: B.wz(-w.rail * 0.6, 0) });
    }
  }
  // Steg-Truhen
  out.chests.push({ x: 0.6, y: DECK_Y, z: 21, ry: Math.PI / 2 });
  out.chests.push({ x: -31, y: DECK_Y, z: 0.4, ry: 0 });

  // Canyonwände: gestapelte Felsblöcke, innen mit Kollision, außen nur als Kulisse
  const cliffColors = [C.CLIFF_BASE, C.CLIFF_RED, C.CLIFF_ORANGE, C.CLIFF_LIGHT, C.CLIFF_TOP];
  const ring = (radiusOff, count, hMin, hMax, collide) => {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + rng.range(-0.02, 0.02);
      const ca = Math.cos(a), sa = Math.sin(a);
      const R = rimR(ca * 100, sa * 100) + radiusOff + rng.range(0, 3);
      const tangent = Math.atan2(-ca, sa); // Blickrichtung parallel zur Wand
      const w0 = rng.range(10, 15), d0 = rng.range(12, 17);
      const cx = ca * (R + d0 / 2 - 1), cz = sa * (R + d0 / 2 - 1);
      const base = hAt(ca * (R - 1), sa * (R - 1)) - 0.5;
      let y = base;
      const total = rng.range(hMin, hMax);
      const layers = 3 + rng.int(0, 2);
      let w = w0, d = d0;
      for (let l = 0; l < layers; l++) {
        const lh = l === layers - 1 ? Math.max(2, total - (y - base)) : total / layers * rng.range(0.8, 1.2);
        const off = rng.range(-1.2, 1.2);
        const B = new Builder(parts, cx + ca * off, cz + sa * off, y, tangent + rng.range(-0.15, 0.15), groups);
        B.slab(0, 0, 0, w, lh, d, cliffColors[Math.min(4, l + (rng.chance(0.3) ? 1 : 0))], { taper: rng.range(0.82, 0.95), col: collide && l < 2 });
        y += lh;
        w *= rng.range(0.78, 0.92);
        d *= rng.range(0.8, 0.95);
      }
    }
  };
  ring(2, 78, 16, 30, true);
  ring(18, 58, 26, 44, false);
  ring(36, 44, 34, 54, false);
  // einzelne Felstürme am Rand
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.4;
    const R = rimR(Math.cos(a) * 100, Math.sin(a) * 100) - 7;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    const B = new Builder(parts, x, z, hAt(x, z) - 0.4, a, groups);
    let y = 0, w = rng.range(5, 7);
    for (let l = 0; l < 3; l++) {
      const lh = rng.range(3.5, 6);
      B.slab(0, y, 0, w, lh, w * 0.9, cliffColors[l + 1], { ry: rng.range(-0.3, 0.3), taper: 0.86 });
      y += lh;
      w *= 0.8;
    }
  }
  onProgress && onProgress(0.5);

  // ---------------- Deko verteilen ----------------
  const props = [];
  const occ = new Map();
  const OCC = 4;
  const occKey = (i, j) => i * 100003 + j;
  const occAdd = (x, z, r) => {
    const k = occKey(Math.floor(x / OCC), Math.floor(z / OCC));
    let a = occ.get(k);
    if (!a) occ.set(k, (a = []));
    a.push(x, z, r);
  };
  const occFree = (x, z, r) => {
    const i0 = Math.floor((x - r - 8) / OCC), i1 = Math.floor((x + r + 8) / OCC);
    const j0 = Math.floor((z - r - 8) / OCC), j1 = Math.floor((z + r + 8) / OCC);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = occ.get(occKey(i, j));
      if (!a) continue;
      for (let k = 0; k < a.length; k += 3) {
        const dx = a[k] - x, dz = a[k + 1] - z, rr = a[k + 2] + r;
        if (dx * dx + dz * dz < rr * rr) return false;
      }
    }
    return true;
  };
  for (const p of parts) {
    if (!p.col && p.s !== 'slab') continue;
    const r = p.s === 'box' || p.s === 'slab' ? Math.hypot(p.w, p.d) / 2 : (p.r || 1);
    occAdd(p.x, p.z, r * 0.9);
  }
  for (const w of WALKS) {
    for (let k = 0; k < w.pts.length - 1; k++) {
      const [x1, z1] = w.pts[k], [x2, z2] = w.pts[k + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      for (let q = 0; q <= len; q += 2) occAdd(x1 + ((x2 - x1) * q) / len, z1 + ((z2 - z1) * q) / len, 1.8);
    }
  }
  const nearWalk = (x, z, d) => WALKS.some((w) => w.pts.some((p, k) => k < w.pts.length - 1 && distToSeg(x, z, p[0], p[1], w.pts[k + 1][0], w.pts[k + 1][1]) < d));

  const nrm = { x: 0, y: 1, z: 0 };
  const scatter = (type, count, opt) => {
    let placed = 0;
    let tries = 0;
    while (placed < count && tries < count * 80) {
      tries++;
      const R = opt.rMax ?? PLAY_RADIUS + 2;
      const x = rng.range(-R, R), z = rng.range(-R, R);
      const rr = Math.hypot(x, z);
      if (rr > R || rr < (opt.rMin ?? 0)) continue;
      if (rr > rimR(x, z) - (opt.rimGap ?? 2)) continue;
      const h = hAt(x, z);
      if (h < (opt.minH ?? 0.3) || h > (opt.maxH ?? 3)) continue;
      terrain.normalAt(x, z, nrm);
      if (nrm.y < (opt.maxSlope ?? 0.85)) continue;
      if (opt.noWalk !== false && nearWalk(x, z, 2.5)) continue;
      const s = rng.range(opt.s0 ?? 0.85, opt.s1 ?? 1.2);
      const r = propRadius(type, s);
      if (!occFree(x, z, r * (opt.spacing ?? 1))) continue;
      occAdd(x, z, r * (opt.solid === false ? 0.3 : 1));
      props.push({ t: type, x, y: opt.float ? 0 : h, z, ry: rng.next() * Math.PI * 2, s, v: Math.floor(rng.next() * 3) });
      placed++;
    }
    return placed;
  };
  scatter(PT.palm, 46, { minH: 0.45, s0: 0.85, s1: 1.25, spacing: 0.8 });
  scatter(PT.palm_s, 26, { minH: 0.4, s0: 0.8, s1: 1.1 });
  scatter(PT.bush, 34, { minH: 0.5, solid: false, s0: 0.8, s1: 1.3 });
  scatter(PT.fern, 40, { minH: 0.6, solid: false, rMin: 70 });
  scatter(PT.rock_l, 14, { minH: 0.2, rMin: 78, rimGap: 0, s0: 0.8, s1: 1.2 });
  scatter(PT.rock_m, 26, { minH: -0.7, s0: 0.7, s1: 1.2 });
  scatter(PT.rock_s, 70, { minH: -0.7, solid: false, s0: 0.7, s1: 1.4 });
  scatter(PT.log, 8, { minH: 0.3, s0: 0.8, s1: 1.1 });
  scatter(PT.beachgrass, 170, { minH: 0.45, solid: false, s0: 0.7, s1: 1.3 });
  scatter(PT.buoy, 16, { minH: -1, maxH: -0.3, solid: false, float: true, rMax: 85 });
  // Kisten- und Fässergruppen an Stränden
  for (let g = 0, placed = 0; g < 200 && placed < 10; g++) {
    const x = rng.range(-90, 90), z = rng.range(-90, 90);
    const h = hAt(x, z);
    if (h < 0.5 || Math.hypot(x, z) > rimR(x, z) - 6 || nearWalk(x, z, 3) || !occFree(x, z, 2.5)) continue;
    placed++;
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const ox = x + rng.range(-1.6, 1.6), oz = z + rng.range(-1.6, 1.6);
      const type = rng.chance(0.55) ? PT.crate : PT.barrel;
      if (!occFree(ox, oz, 0.7)) continue;
      occAdd(ox, oz, 0.75);
      props.push({ t: type, x: ox, y: hAt(ox, oz), z: oz, ry: rng.next() * 6.28, s: type === PT.crate ? rng.range(0.9, 1.15) : 1, v: rng.int(0, 2) });
    }
  }
  // Truhen und Bodenbeute an Stränden
  for (const [x, z, ry] of [[-60, 61, 2.4], [84, 26, -1.6], [-20, -88, 3.1], [58, 13, 1.2], [30, 90, 3.14], [-86, 22, -1.57], [70, -60, 2.3]]) {
    out.chests.push({ x, y: hAt(x, z), z, ry });
  }
  for (const [x, z] of [[-50, 50], [78, 40], [12, -86], [-80, -30], [62, 16], [20, 88], [-40, -80], [86, 4], [-70, 40], [40, -70]]) {
    out.floorLoot.push({ x, y: hAt(x, z), z });
  }
  onProgress && onProgress(0.7);

  // ---------------- Kollision ----------------
  const collision = new CollisionWorld(terrain);
  for (const p of parts) {
    if (!p.col) continue;
    if (p.s === 'box' || p.s === 'slab') collision.addBox(p.x, p.y, p.z, p.w, p.h, p.d, p.ry, p.m ?? MAT.WOOD);
    else if (p.s === 'cyl') collision.addCyl(p.x, p.z, Math.max(0.05, (p.r + p.rt) / 2), p.y - p.h / 2, p.y + p.h / 2, p.m ?? MAT.WOOD);
    else if (p.s === 'sph') collision.addCyl(p.x, p.z, p.r * Math.max(p.sx, p.sz) * 0.85, p.y - p.r * p.sy, p.y + p.r * p.sy * 0.8, p.m ?? MAT.STONE);
  }
  for (const pr of props) {
    const cols = propColliders(pr.t, pr.s);
    if (!cols) continue;
    for (const c of cols) {
      if (c.k === 'c') collision.addCyl(pr.x, pr.z, c.r, pr.y + c.y0, pr.y + c.h, c.m);
      else collision.addBox(pr.x, pr.y + c.h / 2, pr.z, c.w, c.h, c.d, pr.ry, c.m);
    }
  }
  onProgress && onProgress(0.8);

  const pois = Object.values(poiById).map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, r: p.r }));
  return {
    seed,
    terrain,
    collision,
    parts,
    groups,
    props,
    pois,
    chests: out.chests,
    floorLoot: out.floorLoot,
    signs: out.signs,
    smoke: out.smoke,
    walks: WALKS,
    genTime: Date.now() - t0,
  };
}
