// Deterministische Generierung der Insel "Savanne" (gleich auf Server und Client).
import { Noise2D, smoothstep, lerp, clamp } from '../noise.js';
import { RNG, hash2 } from '../rng.js';
import { WORLD_HALF, GRID_CELL, MAP_SEED } from '../constants.js';
import { Terrain, SURF } from './terrain.js';
import { CollisionWorld, MAT } from '../physics/collision.js';
import { Builder } from './builder.js';
import { PT, propColliders, propRadius } from './props.js';
import {
  POIS as POI_DEFS, CANYON_PATH, RIVER_PATH, RAIL_Z,
  buildMine, buildCanyon, buildOasis, buildSafari, buildRanch, buildStation, buildBones, buildLookout, buildDocks,
} from './pois.js';

const ISLAND_A = 575;
const LOOKOUT = { x: 200, z: 40, R: 30, H: 18 };
const CANYON = { x: 295, z: -300, R: 118, H: 16 };
const MESAS = [
  { x: -120, z: -70, R: 30, H: 10 },
  { x: -440, z: -40, R: 28, H: 12 },
  { x: 150, z: 430, R: 26, H: 9 },
  { x: 420, z: -60, R: 22, H: 11 },
];
const MINE_HILL = { x: -335, z: -350, R: 95, H: 17 };
const BONE_VALLEY = { x: -165, z: 330, R: 125, D: 7 };
const POND = { x: 0, z: 40, r: 24 };

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
  const n1 = new Noise2D(seed);
  const n2 = new Noise2D(seed + 11);
  const n3 = new Noise2D(seed + 23);
  const n4 = new Noise2D(seed + 37);
  const n5 = new Noise2D(seed + 51);
  const N = Math.round((WORLD_HALF * 2) / GRID_CELL);
  const S = N + 1;
  const cell = GRID_CELL;

  const islandD = (x, z) => {
    const ax = Math.abs(x) / ISLAND_A, az = Math.abs(z) / ISLAND_A;
    const circ = Math.sqrt(ax * ax + az * az);
    const sq = Math.sqrt(Math.sqrt(ax * ax * ax * ax + az * az * az * az));
    return 0.35 * circ + 0.65 * sq + n4.fbm(x / 210, z / 210, 3) * 0.05 + n5.noise(x / 55, z / 55) * 0.012;
  };

  const baseLand = (x, z) => {
    let h = 7.5 + n1.fbm(x / 430, z / 430, 4) * 9 + n2.fbm(x / 115, z / 115, 3) * 3 + n3.ridged(x / 260, z / 260, 3) * 4;
    // Minen-Hügel
    const dm = Math.hypot(x - MINE_HILL.x, z - MINE_HILL.z);
    h += MINE_HILL.H * smoothstep(MINE_HILL.R, MINE_HILL.R * 0.25, dm + n2.noise(x / 30, z / 30) * 10);
    // Bone Valley Senke
    const dv = Math.hypot(x - BONE_VALLEY.x, z - BONE_VALLEY.z);
    h -= BONE_VALLEY.D * smoothstep(BONE_VALLEY.R, BONE_VALLEY.R * 0.45, dv);
    return Math.max(2.8, h);
  };

  // POI-Referenzhöhen
  for (const p of POIS) p.h = Math.max(3.2, baseLand(p.x, p.z));
  const lookoutBase = baseLand(LOOKOUT.x, LOOKOUT.z);
  const lookoutTop = lookoutBase + LOOKOUT.H;

  const preHeight = (x, z) => {
    let h = baseLand(x, z);
    // Canyon-Plateau mit eingeschnittener Schlucht
    const dc = Math.hypot(x - CANYON.x, z - CANYON.z) + n3.noise(x / 40, z / 40) * 14;
    const plateau = smoothstep(CANYON.R, CANYON.R - 16, dc);
    if (plateau > 0) {
      const dcan = distToPolyline(x, z, CANYON_PATH) + n1.noise(x / 25, z / 25) * 2.5;
      const carve = smoothstep(9, 16, dcan);
      const terr = 1 + 0.18 * Math.round(n2.noise(x / 60, z / 60) * 2) / 2;
      h += CANYON.H * plateau * carve * terr;
    }
    // Felsplateaus
    for (const m of MESAS) {
      const d = Math.hypot(x - m.x, z - m.z) + n5.noise(x / 18, z / 18) * 4;
      const k = smoothstep(m.R + 5, m.R - 3, d);
      if (k > 0) h = lerp(h, baseLand(m.x, m.z) + m.H, k);
    }
    // POIs abflachen
    for (const p of POIS) {
      if (!p.flat) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r) h = lerp(h, p.h, smoothstep(p.r, p.r * 0.62, d));
    }
    // Lookout Rock (Tafelberg) + Rampe nach Süden
    const dl = Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z) + n2.noise(x / 14, z / 14) * 2.5;
    const mesa = smoothstep(LOOKOUT.R + 5, LOOKOUT.R - 4, dl);
    if (mesa > 0) h = lerp(h, lookoutTop, mesa);
    const rz0 = LOOKOUT.z + 88, rz1 = LOOKOUT.z + 24;
    if (z < rz0 && z > rz1 - 4) {
      const t = clamp((rz0 - z) / (rz0 - rz1), 0, 1);
      const w = smoothstep(7.5, 4.5, Math.abs(x - LOOKOUT.x));
      if (w > 0) {
        const target = lerp(h, lookoutTop, t);
        h = Math.max(h, lerp(h, target, w));
      }
    }
    // Flussbett
    const dr = distToPolyline(x, z, RIVER_PATH);
    if (dr < 14) h -= 2.2 * smoothstep(13, 5, dr);
    // Oasen-Teich
    const dp = Math.hypot(x - POND.x, z - POND.z);
    if (dp < POND.r + 10) {
      const oh = POIS[2].h;
      const floor = oh - 0.45 - 1.05 * Math.max(0, 1 - (dp / POND.r) * (dp / POND.r));
      h = Math.min(h, lerp(floor, h, smoothstep(POND.r - 1, POND.r + 9, dp)));
    }
    return h;
  };

  // Bahntrasse: geglättetes Höhenprofil entlang z = RAIL_Z
  const railProfile = new Float32Array(S);
  {
    const raw = new Float32Array(S);
    for (let i = 0; i < S; i++) raw[i] = preHeight(-WORLD_HALF + i * cell, RAIL_Z);
    const R = 14;
    for (let i = 0; i < S; i++) {
      let s = 0, c = 0;
      for (let k = -R; k <= R; k++) {
        const j = i + k;
        if (j < 0 || j >= S) continue;
        s += raw[j];
        c++;
      }
      railProfile[i] = Math.max(3.0, s / c);
    }
  }
  const railH = (x) => {
    const f = clamp((x + WORLD_HALF) / cell, 0, S - 1.001);
    const i = Math.floor(f);
    return lerp(railProfile[i], railProfile[i + 1], f - i);
  };

  const heights = new Float32Array(S * S);
  const coastD = new Float32Array(S * S);
  const riverDist = new Float32Array(S * S);
  for (let j = 0; j < S; j++) {
    const z = -WORLD_HALF + j * cell;
    for (let i = 0; i < S; i++) {
      const x = -WORLD_HALF + i * cell;
      const d = islandD(x, z);
      const idx = j * S + i;
      coastD[idx] = d;
      let land = 0;
      if (d < 1.08) {
        land = preHeight(x, z);
        const dz = Math.abs(z - RAIL_Z);
        if (dz < 16) land = lerp(land, railH(x), smoothstep(16, 5, dz));
      }
      let h;
      if (d < 0.86) h = land;
      else if (d < 0.95) h = lerp(land, 1.6, smoothstep(0.86, 0.95, d));
      else if (d < 1.0) h = lerp(1.6, -0.4, smoothstep(0.95, 1.0, d));
      else h = Math.max(-14, -0.4 - (d - 1) * 25 - Math.max(0, d - 1.05) * 120);
      heights[idx] = h;
      riverDist[idx] = d < 0.97 ? distToPolyline(x, z, RIVER_PATH) : 99;
    }
  }
  onProgress && onProgress(0.25);

  // Wege zwischen POIs
  const poiById = Object.fromEntries(POIS.map((p) => [p.id, p]));
  const EDGES = [
    ['oasis', 'station'], ['oasis', 'safari'], ['oasis', 'lookout'], ['oasis', 'bones'], ['lookout', 'ranch'],
    ['ranch', 'docks'], ['station', 'mine'], ['station', 'canyon'], ['safari', 'mine'], ['safari', 'bones'],
    ['lookout', 'docks'], ['bones', 'ranch'],
  ];
  const rngPaths = new RNG(seed ^ 0x77);
  const paths = [];
  for (const [a, b] of EDGES) {
    const A = poiById[a], B = poiById[b];
    let bx = B.x, bz = B.z;
    let ax = A.x, az = A.z;
    if (b === 'lookout') { bx = LOOKOUT.x; bz = LOOKOUT.z + 95; }
    if (a === 'lookout') { ax = LOOKOUT.x; az = LOOKOUT.z + 95; }
    if (b === 'canyon') { bx = CANYON_PATH[0][0]; bz = CANYON_PATH[0][1]; }
    if (b === 'docks') { bx = 470; bz = 40; }
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const px = -dz / len, pz = dx / len;
    const pts = [];
    const segs = Math.max(6, Math.round(len / 25));
    const amp = rngPaths.range(12, 28);
    const ph = rngPaths.range(0, 10);
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const off = Math.sin(t * Math.PI) * (n1.noise(ph + t * 2.3, 3.7) * amp);
      pts.push([ax + dx * t + px * off, az + dz * t + pz * off]);
    }
    paths.push(pts);
  }
  const pathDist = new Float32Array(S * S).fill(99);
  for (const pts of paths) {
    for (let k = 0; k < pts.length - 1; k++) {
      const [x1, z1] = pts[k], [x2, z2] = pts[k + 1];
      const i0 = Math.max(0, Math.floor((Math.min(x1, x2) - 6 + WORLD_HALF) / cell));
      const i1 = Math.min(N, Math.ceil((Math.max(x1, x2) + 6 + WORLD_HALF) / cell));
      const j0 = Math.max(0, Math.floor((Math.min(z1, z2) - 6 + WORLD_HALF) / cell));
      const j1 = Math.min(N, Math.ceil((Math.max(z1, z2) + 6 + WORLD_HALF) / cell));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const d = distToPolyline(-WORLD_HALF + i * cell, -WORLD_HALF + j * cell, [pts[k], pts[k + 1]]);
          const idx = j * S + i;
          if (d < pathDist[idx]) pathDist[idx] = d;
        }
      }
    }
  }

  const pondLevel = POIS[2].h - 0.45;
  const ponds = [{ x: POND.x, z: POND.z, r: POND.r + 2, level: pondLevel }];

  // Oberflächen klassifizieren
  const surface = new Uint8Array(S * S);
  const terrain = new Terrain(heights, surface, N, cell, WORLD_HALF, ponds);
  const nrm = { x: 0, y: 1, z: 0 };
  for (let j = 0; j < S; j++) {
    const z = -WORLD_HALF + j * cell;
    for (let i = 0; i < S; i++) {
      const x = -WORLD_HALF + i * cell;
      const idx = j * S + i;
      const h = heights[idx];
      const d = coastD[idx];
      let s;
      // Steilheit aus Nachbarn
      const hx = terrain.vertexHeight(i + 1, j) - terrain.vertexHeight(i - 1, j);
      const hz = terrain.vertexHeight(i, j + 1) - terrain.vertexHeight(i, j - 1);
      const slope = Math.hypot(hx, hz) / (2 * cell);
      const dp = Math.hypot(x - POND.x, z - POND.z);
      if (h < -0.25) s = SURF.SEAFLOOR;
      else if (d > 0.9 && h < 2.4) s = SURF.BEACH;
      else if (dp < POND.r + 3) s = SURF.SAND;
      else if (slope > 0.85) s = SURF.ROCK;
      else if (riverDist[idx] < 6.5) s = SURF.RIVER;
      else if (pathDist[idx] < 2.8) s = SURF.PATH;
      else if (Math.abs(z - RAIL_Z) < 3.2 && d < 0.93) s = SURF.PATH;
      else if (slope > 0.6) s = SURF.ROCK;
      else {
        const nd = n3.fbm(x / 90, z / 90, 3);
        const ng = n5.fbm(x / 140 + 7, z / 140, 2);
        let poiDirt = false;
        for (const p of POIS) {
          const dd = Math.hypot(x - p.x, z - p.z);
          if (dd < p.r * 0.5 && p.id !== 'oasis' && p.id !== 'lookout' && p.id !== 'docks') poiDirt = true;
        }
        const canyonD = Math.hypot(x - CANYON.x, z - CANYON.z);
        if (poiDirt || canyonD < CANYON.R || nd > 0.42) s = SURF.DIRT;
        else if (ng > -0.05) s = SURF.DRYGRASS;
        else s = SURF.GRASS;
        if (Math.hypot(x - POND.x, z - POND.z) < 60 && s === SURF.DRYGRASS) s = SURF.GRASS;
      }
      surface[idx] = s;
    }
  }
  onProgress && onProgress(0.4);

  const hAt = (x, z) => terrain.heightAt(x, z);

  // ---------------- Strukturen ----------------
  const parts = [];
  const groups = {};
  const poiBuilder = (id, rot = 0, oy = null) => {
    const p = poiById[id];
    return new Builder(parts, p.x, p.z, oy ?? p.h, rot, groups);
  };
  buildMine(poiBuilder('mine', 0));
  buildOasis(poiBuilder('oasis', 0));
  buildSafari(poiBuilder('safari', 0.3));
  buildRanch(poiBuilder('ranch', -0.15));
  buildStation(poiBuilder('station', 0), railH(poiById.station.x));
  buildBones(poiBuilder('bones', 0.25));
  buildLookout(new Builder(parts, LOOKOUT.x, LOOKOUT.z, lookoutTop, 0, groups));
  buildCanyon(new Builder(parts, 0, 0, 0, 0, groups), hAt, CANYON_PATH);
  // Küste für die Docks bestimmen
  let coastX = 520;
  const dockZ = 40;
  for (let x = 380; x < 700; x += 0.5) {
    if (hAt(x, dockZ) < 1.0) { coastX = x; break; }
  }
  poiById.docks.x = coastX - 22;
  poiById.docks.h = hAt(coastX - 22, dockZ);
  buildDocks(parts, groups, hAt, coastX, dockZ);
  poiById.lookout.h = lookoutTop;

  // Bahngleise über die ganze Insel
  const railParts = [];
  {
    let x = -WORLD_HALF;
    while (x < WORLD_HALF) {
      const hh = railH(x);
      if (hAt(x, RAIL_Z) > 0.6 && coastD[Math.round((RAIL_Z + WORLD_HALF) / cell) * S + Math.round((x + WORLD_HALF) / cell)] < 0.97) {
        railParts.push([x, hh]);
      }
      x += 12;
    }
    const rb = new Builder(parts, 0, 0, 0, 0, groups);
    for (const [x, hh] of railParts) {
      const seg = rb.sub(x + 6, RAIL_Z, Math.PI / 2, hh);
      seg.rails(0, 0, 12, 0, 0);
      seg.box(0, -0.35, 0, 3.4, 0.35, 12, 0x8e8577, { col: false });
    }
  }
  onProgress && onProgress(0.5);

  // ---------------- Deko verteilen ----------------
  const props = [];
  const occ = new Map(); // räumlicher Hash belegter Kreise
  const OCC = 8;
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
  const inPoi = (x, z, f = 0.85) => {
    for (const p of POIS) {
      if (Math.hypot(x - p.x, z - p.z) < p.r * f) return p.id;
    }
    if (Math.hypot(x - LOOKOUT.x, z - (LOOKOUT.z + 60)) < 12) return 'lookout';
    return null;
  };

  const rng = new RNG(seed ^ 0x1234567);
  const scatter = (type, count, opt) => {
    let placed = 0;
    let tries = 0;
    const maxTries = count * 40;
    while (placed < count && tries < maxTries) {
      tries++;
      let x, z;
      if (opt.center) {
        const a = rng.next() * Math.PI * 2;
        const r = Math.sqrt(rng.next()) * opt.center.r;
        x = opt.center.x + Math.cos(a) * r;
        z = opt.center.z + Math.sin(a) * r;
      } else {
        x = rng.range(-620, 620);
        z = rng.range(-620, 620);
      }
      const idx = sampleIdx(x, z);
      if (idx < 0 || idx >= heights.length) continue;
      const h = hAt(x, z);
      const surf = surface[idx];
      if (h < (opt.minH ?? 1.8)) continue;
      if (terrain.isPond(x, z)) continue;
      if (opt.surf && !opt.surf.includes(surf)) continue;
      if (!opt.allowPath && pathDist[idx] < 4.5) continue;
      if (!opt.allowPath && Math.abs(z - RAIL_Z) < 7 && coastD[idx] < 0.97) continue;
      if (opt.noRiver !== false && riverDist[idx] < 7 && !opt.allowRiver) continue;
      terrain.normalAt(x, z, nrm);
      if (nrm.y < (opt.maxSlope ?? 0.82)) continue;
      const poi = inPoi(x, z, opt.poiF ?? 0.9);
      if (poi && !(opt.inPoi && opt.inPoi.includes(poi))) continue;
      if (opt.density) {
        const dn = opt.density(x, z);
        if (rng.next() > dn) continue;
      }
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
  const treeDensity = (x, z) => 0.25 + 0.75 * smoothstep(-0.2, 0.45, n2.fbm(x / 160 + 3, z / 160, 2));
  const canyonArea = { x: CANYON.x, z: CANYON.z, r: CANYON.R + 20 };

  scatter(PT.baobab, 55, { surf: GR, s0: 0.85, s1: 1.2, spacing: 3 });
  scatter(PT.acacia, 470, { surf: GR, density: treeDensity, s0: 0.8, s1: 1.3 });
  scatter(PT.deadtree, 110, { surf: [SURF.DIRT, SURF.DRYGRASS], s0: 0.8, s1: 1.2, inPoi: ['bones', 'canyon'] });
  scatter(PT.rock_l, 70, { surf: [SURF.GRASS, SURF.DRYGRASS, SURF.DIRT, SURF.ROCK], maxSlope: 0.6, s0: 0.8, s1: 1.4 });
  scatter(PT.saguaro, 110, { center: canyonArea, surf: [SURF.DIRT, SURF.ROCK, SURF.DRYGRASS], maxSlope: 0.7, s0: 0.8, s1: 1.25, inPoi: ['canyon'] });
  scatter(PT.saguaro, 60, { surf: [SURF.DIRT, SURF.DRYGRASS], s0: 0.8, s1: 1.2, density: (x) => (x > 0 ? 0.8 : 0.2) });
  scatter(PT.pear, 90, { center: canyonArea, surf: [SURF.DIRT, SURF.ROCK, SURF.DRYGRASS], maxSlope: 0.7, inPoi: ['canyon'], solid: false });
  scatter(PT.pear, 90, { surf: [SURF.DIRT, SURF.DRYGRASS], solid: false });
  scatter(PT.termite, 110, { surf: [SURF.DIRT, SURF.DRYGRASS, SURF.GRASS], s0: 0.7, s1: 1.3 });
  scatter(PT.rock_m, 260, { surf: [SURF.GRASS, SURF.DRYGRASS, SURF.DIRT, SURF.ROCK, SURF.RIVER], allowRiver: true, maxSlope: 0.6, s0: 0.7, s1: 1.4, inPoi: ['canyon', 'bones'] });
  scatter(PT.rock_s, 520, { surf: [SURF.GRASS, SURF.DRYGRASS, SURF.DIRT, SURF.ROCK, SURF.RIVER, SURF.BEACH], allowRiver: true, maxSlope: 0.5, minH: 0.8, solid: false, inPoi: ['canyon', 'bones', 'mine', 'lookout'], poiF: 0.7 });
  scatter(PT.log, 60, { surf: LAND, s0: 0.8, s1: 1.1 });
  scatter(PT.bush, 900, { surf: [SURF.GRASS, SURF.DRYGRASS, SURF.DIRT], solid: false, s0: 0.7, s1: 1.4 });
  scatter(PT.skull, 22, { surf: LAND, solid: false });
  scatter(PT.skull, 16, { center: { x: BONE_VALLEY.x, z: BONE_VALLEY.z, r: 80 }, surf: LAND, solid: false, inPoi: ['bones'], poiF: 0.3 });
  scatter(PT.palm_s, 28, { surf: [SURF.BEACH], minH: 1.0, maxSlope: 0.9, s0: 0.8, s1: 1.2 });
  scatter(PT.tallgrass, 1700, { surf: [SURF.GRASS, SURF.DRYGRASS], solid: false, s0: 0.7, s1: 1.4 });
  scatter(PT.flowers, 260, { surf: [SURF.GRASS], solid: false });
  // Kisten- und Fässergruppen draußen
  for (let g = 0; g < 38; g++) {
    const x = rng.range(-520, 520), z = rng.range(-520, 520);
    const idx = sampleIdx(x, z);
    const h = hAt(x, z);
    if (h < 2 || terrain.isPond(x, z) || pathDist[idx] < 5 || inPoi(x, z, 1.0)) continue;
    terrain.normalAt(x, z, nrm);
    if (nrm.y < 0.9 || !occFree(x, z, 3)) continue;
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const ox = x + rng.range(-1.8, 1.8), oz = z + rng.range(-1.8, 1.8);
      const type = rng.chance(0.6) ? PT.crate : PT.barrel;
      if (!occFree(ox, oz, 0.7)) continue;
      occAdd(ox, oz, 0.75);
      props.push({ t: type, x: ox, y: hAt(ox, oz), z: oz, ry: rng.next() * 6.28, s: type === PT.crate ? rng.range(0.9, 1.15) : 1, v: rng.int(0, 2) });
    }
  }
  // Einzelne Windräder und Wassertürme in der Landschaft
  const extraSpots = [[-120, 150], [120, -300], [-450, 280], [380, 120], [-200, -130], [160, 250], [-480, -220], [260, 460]];
  extraSpots.forEach(([x, z], i) => {
    const h = hAt(x, z);
    if (h < 2) return;
    const b = new Builder(parts, x, z, h, i * 0.9, groups);
    if (i % 2 === 0) b.windmill(0, 0, 'wm_' + i, 0, 9 + (i % 3));
    else b.watertower(0, 0, 0, 5.5 + (i % 2), i % 3 ? 0xb07a45 : 0x8d99a6);
    occAdd(x, z, 4);
  });
  // Wegweiser an Wegen nahe POIs
  for (const pts of paths) {
    const k = Math.min(2, pts.length - 1);
    const [x, z] = pts[k];
    const h = hAt(x, z);
    if (h < 2) continue;
    const [x2, z2] = pts[pts.length - 1];
    const [x0, z0] = pts[0];
    const a1 = Math.atan2(-(z2 - z), x2 - x);
    const a2 = Math.atan2(-(z0 - z), x0 - x);
    new Builder(parts, x + 3.5, z + 3.5, h, 0, groups).signpost(0, 0, [a1, a2]);
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

  const pois = POIS.map((p) => ({ id: p.id, name: p.name, x: p.id === 'lookout' ? LOOKOUT.x : p.x, z: p.z, r: p.r, h: p.h }));

  return {
    seed,
    terrain,
    collision,
    parts,
    groups,
    props,
    pois,
    paths,
    ponds,
    rail: { z: RAIL_Z, segs: railParts },
    coastD,
    genTime: Date.now() - t0,
  };
}

// Deterministischer Hash für Client-Deko (Gras) – exportiert für Renderer
export { hash2 };
