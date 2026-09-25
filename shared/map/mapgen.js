// Deterministische Generierung der kleinen Insel (gleich auf Server und Client):
// runde Savanneninsel mit Strand, sanften Hügeln am Rand und der Old Ranch in der Mitte.
import { Noise2D, smoothstep, lerp } from '../noise.js';
import { RNG } from '../rng.js';
import { WORLD_HALF, GRID_CELL, MAP_SEED, ISLAND_RADIUS } from '../constants.js';
import { Terrain, SURF } from './terrain.js';
import { CollisionWorld, MAT } from '../physics/collision.js';
import { Builder } from './builder.js';
import { PT, propColliders, propRadius } from './props.js';
import { POIS as POI_DEFS, RANCH_PATHS, buildRanch } from './pois.js';

// kleine Felshügel am Rand (Deckung und Aussicht)
const HILLS = [
  { x: -31, z: -27, R: 9, H: 3.2 },
  { x: 37, z: 8, R: 8, H: 2.6 },
  { x: -27, z: 31, R: 8, H: 2.3 },
];

function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const l2 = dx * dx + dz * dz;
    let t = ((x - x1) * dx + (z - z1) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x1 + dx * t - x, pz = z1 + dz * t - z;
    const d = px * px + pz * pz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function generateMap(seed = MAP_SEED, onProgress = null) {
  const t0 = Date.now();
  const POIS = POI_DEFS.map((p) => ({ ...p }));
  const ranch = POIS[0];
  const n1 = new Noise2D(seed);
  const n2 = new Noise2D(seed + 11);
  const n3 = new Noise2D(seed + 23);
  const n4 = new Noise2D(seed + 37);
  const n5 = new Noise2D(seed + 51);
  const N = Math.round((WORLD_HALF * 2) / GRID_CELL);
  const S = N + 1;
  const cell = GRID_CELL;
  const A = ISLAND_RADIUS;

  // normierter Abstand zur Küste (1 = Küstenlinie)
  const islandD = (x, z) => {
    const ax = Math.abs(x) / A, az = Math.abs(z) / A;
    const circ = Math.sqrt(ax * ax + az * az);
    const sq = Math.sqrt(Math.sqrt(ax * ax * ax * ax + az * az * az * az));
    return 0.7 * circ + 0.3 * sq + n4.fbm(x / 45, z / 45, 3) * 0.06 + n5.noise(x / 11, z / 11) * 0.012;
  };

  const baseLand = (x, z) => {
    let h = 3.4 + n1.fbm(x / 60, z / 60, 3) * 1.4 + n2.fbm(x / 18, z / 18, 2) * 0.35;
    for (const m of HILLS) {
      const d = Math.hypot(x - m.x, z - m.z) + n3.noise(x / 6, z / 6) * 1.5;
      h += m.H * smoothstep(m.R, m.R * 0.3, d);
    }
    return Math.max(2.6, h);
  };

  ranch.h = Math.max(3.2, baseLand(ranch.x, ranch.z));

  const landHeight = (x, z) => {
    let h = baseLand(x, z);
    // Ranch-Gelände einebnen
    const d = Math.hypot(x - ranch.x, z - ranch.z);
    if (d < ranch.flat) h = lerp(h, ranch.h, smoothstep(ranch.flat, ranch.flat * 0.62, d));
    return h;
  };

  const heights = new Float32Array(S * S);
  const coastD = new Float32Array(S * S);
  const pathDist = new Float32Array(S * S);
  for (let j = 0; j < S; j++) {
    const z = -WORLD_HALF + j * cell;
    for (let i = 0; i < S; i++) {
      const x = -WORLD_HALF + i * cell;
      const d = islandD(x, z);
      const idx = j * S + i;
      coastD[idx] = d;
      const land = d < 1.05 ? landHeight(x, z) : 0;
      let h;
      if (d < 0.8) h = land;
      else if (d < 0.92) h = lerp(land, 1.6, smoothstep(0.8, 0.92, d));
      else if (d < 1.0) h = lerp(1.6, -0.4, smoothstep(0.92, 1.0, d));
      else h = Math.max(-10, -0.4 - (d - 1) * 8 - Math.max(0, d - 1.1) * 30);
      heights[idx] = h;
      let pd = 99;
      if (d < 1.0) for (const pts of RANCH_PATHS) pd = Math.min(pd, distToPolyline(x, z, pts));
      pathDist[idx] = pd;
    }
  }
  onProgress && onProgress(0.25);

  // Oberflächen klassifizieren
  const surface = new Uint8Array(S * S);
  const terrain = new Terrain(heights, surface, N, cell, WORLD_HALF);
  for (let j = 0; j < S; j++) {
    const z = -WORLD_HALF + j * cell;
    for (let i = 0; i < S; i++) {
      const x = -WORLD_HALF + i * cell;
      const idx = j * S + i;
      const h = heights[idx];
      const d = coastD[idx];
      const hx = terrain.vertexHeight(i + 1, j) - terrain.vertexHeight(i - 1, j);
      const hz = terrain.vertexHeight(i, j + 1) - terrain.vertexHeight(i, j - 1);
      const slope = Math.hypot(hx, hz) / (2 * cell);
      let s;
      if (h < -0.25) s = SURF.SEAFLOOR;
      else if (d > 0.84 && h < 2.4) s = SURF.BEACH;
      else if (slope > 0.85) s = SURF.ROCK;
      else if (pathDist[idx] < 1.3 + n2.noise(x / 4, z / 4) * 0.35) s = SURF.PATH;
      else if (slope > 0.6) s = SURF.ROCK;
      else {
        const dr = Math.hypot(x - ranch.x, z - ranch.z) + n3.noise(x / 7, z / 7) * 4;
        const nd = n3.fbm(x / 25, z / 25, 3);
        const ng = n5.fbm(x / 35 + 7, z / 35, 2);
        if (dr < ranch.r * 0.55 || nd > 0.45) s = SURF.DIRT;
        else if (ng > -0.05) s = SURF.DRYGRASS;
        else s = SURF.GRASS;
      }
      surface[idx] = s;
    }
  }
  onProgress && onProgress(0.4);

  const hAt = (x, z) => terrain.heightAt(x, z);

  // ---------------- Strukturen ----------------
  const parts = [];
  const groups = {};
  buildRanch(new Builder(parts, ranch.x, ranch.z, ranch.h, 0, groups));
  onProgress && onProgress(0.5);

  // ---------------- Deko verteilen ----------------
  const props = [];
  const occ = new Map(); // räumlicher Hash belegter Kreise
  const OCC = 4;
  const occKey = (i, j) => i * 100003 + j;
  const occAdd = (x, z, r) => {
    const i = Math.floor(x / OCC), j = Math.floor(z / OCC);
    const k = occKey(i, j);
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
  // Strukturen belegen Platz
  for (const p of parts) {
    if (!p.col) continue;
    const r = p.s === 'box' ? Math.hypot(p.w, p.d) / 2 : (p.r || 1);
    occAdd(p.x, p.z, r * 0.9);
  }

  const sampleIdx = (x, z) => {
    const i = Math.round((x + WORLD_HALF) / cell), j = Math.round((z + WORLD_HALF) / cell);
    return j * S + i;
  };
  const inRanch = (x, z, f) => Math.hypot(x - ranch.x, z - ranch.z) < ranch.r * f;

  const nrm = { x: 0, y: 1, z: 0 };
  const rng = new RNG(seed ^ 0x1234567);
  const scatter = (type, count, opt) => {
    let placed = 0;
    let tries = 0;
    const maxTries = count * 60;
    while (placed < count && tries < maxTries) {
      tries++;
      const x = rng.range(-A, A);
      const z = rng.range(-A, A);
      const idx = sampleIdx(x, z);
      if (idx < 0 || idx >= heights.length) continue;
      const h = hAt(x, z);
      const surf = surface[idx];
      if (h < (opt.minH ?? 1.8)) continue;
      if (opt.surf && !opt.surf.includes(surf)) continue;
      if (!opt.allowPath && pathDist[idx] < 2.5) continue;
      terrain.normalAt(x, z, nrm);
      if (nrm.y < (opt.maxSlope ?? 0.82)) continue;
      if (!opt.inRanch && inRanch(x, z, opt.poiF ?? 0.9)) continue;
      const s = rng.range(opt.s0 ?? 0.8, opt.s1 ?? 1.25);
      const r = propRadius(type, s);
      if (!occFree(x, z, r * (opt.spacing ?? 1))) continue;
      occAdd(x, z, r * (opt.solid === false ? 0.3 : 1));
      props.push({ t: type, x, y: h, z, ry: rng.next() * Math.PI * 2, s, v: Math.floor(rng.next() * 3) });
      placed++;
    }
    return placed;
  };

  const GR = [SURF.GRASS, SURF.DRYGRASS];
  const LAND = [SURF.GRASS, SURF.DRYGRASS, SURF.DIRT];
  const ALL = [SURF.GRASS, SURF.DRYGRASS, SURF.DIRT, SURF.ROCK];
  scatter(PT.baobab, 2, { surf: GR, s0: 0.8, s1: 1.0, spacing: 1.5 });
  scatter(PT.acacia, 13, { surf: GR, s0: 0.75, s1: 1.15, spacing: 1.2 });
  scatter(PT.deadtree, 3, { surf: [SURF.DIRT, SURF.DRYGRASS], s0: 0.8, s1: 1.1 });
  scatter(PT.rock_l, 5, { surf: ALL, maxSlope: 0.6, s0: 0.7, s1: 1.1 });
  scatter(PT.rock_m, 16, { surf: ALL, maxSlope: 0.6, s0: 0.7, s1: 1.3 });
  scatter(PT.rock_s, 45, { surf: [...ALL, SURF.BEACH], maxSlope: 0.5, minH: 0.8, solid: false, inRanch: true });
  scatter(PT.saguaro, 3, { surf: [SURF.DIRT, SURF.DRYGRASS], s0: 0.8, s1: 1.1 });
  scatter(PT.pear, 7, { surf: [SURF.DIRT, SURF.DRYGRASS], solid: false });
  scatter(PT.termite, 3, { surf: LAND, s0: 0.7, s1: 1.1 });
  scatter(PT.log, 4, { surf: LAND, s0: 0.8, s1: 1.1 });
  scatter(PT.bush, 55, { surf: LAND, solid: false, s0: 0.7, s1: 1.3, inRanch: true, poiF: 0.3 });
  scatter(PT.skull, 2, { surf: LAND, solid: false });
  scatter(PT.palm_s, 10, { surf: [SURF.BEACH], minH: 1.0, maxSlope: 0.9, s0: 0.8, s1: 1.15 });
  scatter(PT.tallgrass, 110, { surf: GR, solid: false, s0: 0.7, s1: 1.3, inRanch: true });
  scatter(PT.flowers, 60, { surf: [SURF.GRASS, SURF.DRYGRASS], solid: false, inRanch: true });
  // Kisten- und Fässergruppen draußen
  for (let g = 0, groupsPlaced = 0; g < 80 && groupsPlaced < 6; g++) {
    const x = rng.range(-46, 46), z = rng.range(-46, 46);
    const idx = sampleIdx(x, z);
    const h = hAt(x, z);
    if (h < 2 || pathDist[idx] < 3 || inRanch(x, z, 0.8)) continue;
    terrain.normalAt(x, z, nrm);
    if (nrm.y < 0.9 || !occFree(x, z, 2.5)) continue;
    groupsPlaced++;
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const ox = x + rng.range(-1.8, 1.8), oz = z + rng.range(-1.8, 1.8);
      const type = rng.chance(0.6) ? PT.crate : PT.barrel;
      if (!occFree(ox, oz, 0.7)) continue;
      occAdd(ox, oz, 0.75);
      props.push({ t: type, x: ox, y: hAt(ox, oz), z: oz, ry: rng.next() * 6.28, s: type === PT.crate ? rng.range(0.9, 1.15) : 1, v: rng.int(0, 2) });
    }
  }
  onProgress && onProgress(0.7);

  // ---------------- Kollision ----------------
  const collision = new CollisionWorld(terrain);
  for (const p of parts) {
    if (!p.col) continue;
    if (p.s === 'box') collision.addBox(p.x, p.y, p.z, p.w, p.h, p.d, p.ry, p.m ?? MAT.WOOD);
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

  const pois = POIS.map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, r: p.r, h: p.h }));

  return {
    seed,
    terrain,
    collision,
    parts,
    groups,
    props,
    pois,
    genTime: Date.now() - t0,
  };
}

