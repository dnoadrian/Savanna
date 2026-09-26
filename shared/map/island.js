// Insel-Generator (gleich auf Server und Client): jede Karte ist eine Insel im offenen Meer mit
// einem Chapter-2-Ort. Eine Kartendefinition plant zuerst Gelände (ebene Flächen, Seen, Flüsse,
// Hügel, Straßen, Sandbänke) und Bauwerke; danach entstehen Höhenfeld, Bodenarten, Parts,
// Deko und Kollision. Als Generator (yield = Fortschritt), damit der Server in kleinen
// Häppchen rechnen kann, ohne laufende Matches ruckeln zu lassen.
import { Noise2D, smoothstep, lerp } from '../noise.js';
import { RNG } from '../rng.js';
import { WORLD_HALF, GRID_CELL, PLAY_RADIUS } from '../constants.js';
import { Terrain, SURF } from './terrain.js';
import { CollisionWorld, MAT } from '../physics/collision.js';
import { Builder } from './builder.js';
import { PT, propColliders, propRadius } from './props.js';

// Abstand Punkt–Strecke
export function distToSeg(x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const l2 = dx * dx + dz * dz || 1e-9;
  let t = ((x - x1) * dx + (z - z1) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x1 + dx * t - x, z1 + dz * t - z);
}
function distToLine(x, z, pts) {
  let best = Infinity;
  for (let k = 0; k < pts.length - 1; k++) {
    const d = distToSeg(x, z, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]);
    if (d < best) best = d;
  }
  return best;
}
function lineBox(pts, pad) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
}
// Abstand zu einem gedrehten Rechteck (0 innen)
function rectDist(x, z, r) {
  const px = x - r.x, pz = z - r.z;
  const c = Math.cos(r.ry), s = Math.sin(r.ry);
  const lx = Math.abs(px * c - pz * s) - r.w / 2;
  const lz = Math.abs(px * s + pz * c) - r.d / 2;
  return Math.hypot(Math.max(0, lx), Math.max(0, lz));
}

// ---------------------------------------------------------------------------
// Plan einer Karte (wird von den Kartendefinitionen befüllt)
export class Plan {
  constructor(seed) {
    this.rng = new RNG(seed ^ 0x2b7e15);
    this.flats = [];
    this.rects = [];
    this.roads = [];
    this.paints = [];
    this.lakes = [];
    this.rivers = [];
    this.hills = [];
    this.bars = [];
    this.bulges = [];
    this.items = [];
    this.props = [];
    this.keeps = [];
    this.pois = [];
    this.forests = [];
    this.chestSpots = [];
  }

  // ebene Fläche (Kreis); h = null → Geländehöhe in der Mitte
  flat(x, z, r, h = null, edge = 7) { this.flats.push({ x, z, r, h, edge }); return this; }
  // ebene Fläche (gedrehtes Rechteck)
  flatRect(x, z, w, d, ry = 0, h = null, edge = 5) { this.rects.push({ x, z, w, d, ry, h, edge }); return this; }
  road(pts, w = 7, surf = SURF.ROAD) { this.roads.push({ pts, w, surf, box: lineBox(pts, w) }); return this; }
  paintCircle(x, z, r, surf) { this.paints.push({ k: 'c', x, z, r, surf }); return this; }
  paintRect(x, z, w, d, ry, surf) { this.paints.push({ k: 'r', x, z, w, d, ry, surf }); return this; }
  // flacher See (Tiefe < 1,1 m: man kann hindurchwaten)
  lake(x, z, r, depth = 0.8, sx = 1, sz = 1) { this.lakes.push({ x, z, r, depth, sx, sz }); return this; }
  river(pts, w = 8, depth = 0.7) { this.rivers.push({ pts, w, depth, box: lineBox(pts, w + 10) }); return this; }
  // Hügel/Berg (Gauß-Glocke); rock: Felsboden, snow: Schneekuppe
  hill(x, z, r, h, o = {}) { this.hills.push({ x, z, r, h, rock: !!o.rock, snow: !!o.snow, sharp: o.sharp ?? 2 }); return this; }
  // Sandbank / Flachwasser im Meer entlang einer Linie
  bar(pts, w = 16, h = -0.45) { this.bars.push({ pts, w, h, box: lineBox(pts, w + 14) }); return this; }
  // Küste in Richtung a (rad) nach außen/innen verschieben
  bulge(a, amount, width = 0.6) { this.bulges.push({ a, amount, width }); return this; }
  // Bauwerk: fn(B, out, ctx) mit Builder auf Bodenhöhe (oder fester Höhe y)
  build(x, z, rot, fn, y = null) { this.items.push({ x, z, rot, fn, y }); return this; }
  prop(type, x, z, ry = 0, s = 1, v = 0) { this.props.push({ t: PT[type], x, z, ry, s, v }); return this; }
  keep(x, z, r) { this.keeps.push({ x, z, r }); return this; }
  forest(x, z, r, density = 1) { this.forests.push({ x, z, r, density }); return this; }
  poi(name, x, z, r) { this.pois.push({ id: name.toLowerCase().replace(/[^a-z]+/g, '-'), name, x, z, r }); return this; }
}

// ---------------------------------------------------------------------------
// Karte erzeugen (Generator): def = { id, name, seed, hillAmp, baseH, biome, plan(P) }
export function* islandSteps(def) {
  const t0 = Date.now();
  const seed = def.seed >>> 0;
  const n1 = new Noise2D(seed);
  const n2 = new Noise2D(seed + 11);
  const n3 = new Noise2D(seed + 23);
  const N = Math.round((WORLD_HALF * 2) / GRID_CELL);
  const S = N + 1;
  const cell = GRID_CELL;
  const bio = def.biome || {};
  const P = new Plan(seed);
  // eigene Küstenform je Karte: [Winkel in Grad, Ausbuchtung in m, Breite in rad]
  for (const [deg, amount, width] of def.shape || []) P.bulge((deg / 180) * Math.PI, amount, width ?? 0.7);
  def.plan(P);
  yield 0.03;

  const hillAmp = def.hillAmp ?? 4;
  const baseH = def.baseH ?? 1.0;
  const coastR = (a) => {
    let R = PLAY_RADIUS + n1.noise(Math.cos(a) * 1.3 + 7, Math.sin(a) * 1.3) * 8 + n2.noise(Math.cos(a) * 4, Math.sin(a) * 4) * 3;
    for (const b of P.bulges) {
      let da = Math.abs(a - b.a) % (Math.PI * 2);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da < b.width) R += b.amount * (0.5 + 0.5 * Math.cos((da / b.width) * Math.PI));
    }
    return R;
  };
  // Küstenradius vorab je Winkel (schnell)
  const CA = 720;
  const coastTab = new Float32Array(CA + 1);
  for (let i = 0; i <= CA; i++) coastTab[i] = coastR((i / CA) * Math.PI * 2 - Math.PI);
  const coastAt = (x, z) => {
    const f = ((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * CA;
    const i = Math.floor(f);
    return coastTab[i] + (coastTab[Math.min(CA, i + 1)] - coastTab[i]) * (f - i);
  };
  const coastDist = (x, z) => coastAt(x, z) - Math.hypot(x, z);

  // Höhe ohne ebene Flächen
  const pre = (x, z) => {
    const d = coastDist(x, z);
    let h;
    if (d < 0) h = lerp(-0.5, -9, smoothstep(0, 38, -d)) + n3.noise(x / 20, z / 20) * 0.2;
    else {
      const beach = smoothstep(0, 11, d);
      const inland = smoothstep(8, 42, d);
      const hill = (n2.fbm(x / 48, z / 48, 3) * 0.5 + 0.5) * hillAmp + n1.noise(x / 13, z / 13) * 0.25;
      h = lerp(-0.5, 1.1, beach) + inland * Math.max(0, hill + baseH - 1.1);
    }
    for (const hl of P.hills) {
      const dx = x - hl.x, dz = z - hl.z;
      const q = (dx * dx + dz * dz) / (hl.r * hl.r);
      if (q > 4) continue;
      const k = Math.exp(-q * hl.sharp);
      h += hl.h * k * (1 + n3.noise(x / 9, z / 9) * 0.12);
    }
    for (const l of P.lakes) {
      const dx = (x - l.x) / l.sx, dz = (z - l.z) / l.sz;
      const q = Math.sqrt(dx * dx + dz * dz) / l.r + n3.noise(x / 11, z / 11) * 0.08;
      if (q > 1.5) continue;
      h = lerp(h, -l.depth, smoothstep(1.35, 0.95, q));
    }
    for (const rv of P.rivers) {
      if (x < rv.box.x0 || x > rv.box.x1 || z < rv.box.z0 || z > rv.box.z1) continue;
      const dd = distToLine(x, z, rv.pts);
      if (dd > rv.w / 2 + 6) continue;
      h = lerp(h, -rv.depth, smoothstep(rv.w / 2 + 6, rv.w / 2, dd));
    }
    for (const b of P.bars) {
      if (x < b.box.x0 || x > b.box.x1 || z < b.box.z0 || z > b.box.z1) continue;
      const dd = distToLine(x, z, b.pts);
      if (dd > b.w / 2 + 12) continue;
      h = Math.max(h, lerp(h, b.h, smoothstep(b.w / 2 + 12, b.w / 2, dd)));
    }
    return h;
  };
  for (const f of P.flats) if (f.h === null) f.h = Math.max(0.6, pre(f.x, f.z));
  for (const r of P.rects) if (r.h === null) r.h = Math.max(0.6, pre(r.x, r.z));
  const heightFn = (x, z) => {
    let h = pre(x, z);
    for (const f of P.flats) {
      const dx = x - f.x, dz = z - f.z;
      const R = f.r + f.edge;
      if (dx > R || dx < -R || dz > R || dz < -R) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < R) h = lerp(h, f.h, smoothstep(R, f.r, d));
    }
    for (const r of P.rects) {
      const R = Math.max(r.w, r.d) / 2 + r.edge;
      if (Math.abs(x - r.x) > R || Math.abs(z - r.z) > R) continue;
      const d = rectDist(x, z, r);
      if (d < r.edge) h = lerp(h, r.h, smoothstep(r.edge, 0, d));
    }
    return h;
  };

  const heights = new Float32Array(S * S);
  for (let j = 0; j < S; j++) {
    const z = -WORLD_HALF + j * cell;
    for (let i = 0; i < S; i++) heights[j * S + i] = heightFn(-WORLD_HALF + i * cell, z);
    if (j % 40 === 39) yield 0.03 + (j / S) * 0.27;
  }
  const surface = new Uint8Array(S * S);
  const terrain = new Terrain(heights, surface, N, cell, WORLD_HALF);
  yield 0.32;

  // ---------------- Bodenarten ----------------
  const nrm = { x: 0, y: 1, z: 0 };
  const inRock = (x, z) => P.hills.some((hl) => hl.rock && Math.hypot(x - hl.x, z - hl.z) < hl.r * 0.9);
  const inForest = (x, z) => P.forests.some((f) => Math.hypot(x - f.x, z - f.z) < f.r);
  for (let j = 0; j < S; j++) {
    const z = -WORLD_HALF + j * cell;
    for (let i = 0; i < S; i++) {
      const x = -WORLD_HALF + i * cell;
      const idx = j * S + i;
      const h = heights[idx];
      let s;
      if (h < -0.22) s = SURF.SEAFLOOR;
      else {
        const d = coastDist(x, z);
        terrain.normalAt(x, z, nrm);
        if (d < 13 && h < 2.3 && !bio.noBeach) s = SURF.BEACH;
        else if (nrm.y < 0.74 || (h > 4 && inRock(x, z))) s = SURF.ROCK;
        else if (nrm.y < 0.86) s = SURF.DIRT;
        else if (bio.snowLine && h > bio.snowLine + n1.noise(x / 10, z / 10) * 1.5) s = SURF.SNOW;
        else if (inForest(x, z)) s = SURF.FOREST;
        else if (bio.swamp && n3.fbm(x / 34, z / 34, 2) > -0.1) s = SURF.SWAMP;
        else if (n3.fbm(x / 30 + 4, z / 30, 2) > (bio.dry ?? 0.55)) s = SURF.DRYGRASS;
        else s = SURF.GRASS;
      }
      surface[idx] = s;
    }
    if (j % 60 === 59) yield 0.32 + (j / S) * 0.08;
  }
  // gemalte Flächen + Straßen
  const paintAt = (fn, x0, x1, z0, z1) => {
    const i0 = Math.max(0, Math.floor((x0 + WORLD_HALF) / cell)), i1 = Math.min(N, Math.ceil((x1 + WORLD_HALF) / cell));
    const j0 = Math.max(0, Math.floor((z0 + WORLD_HALF) / cell)), j1 = Math.min(N, Math.ceil((z1 + WORLD_HALF) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = -WORLD_HALF + j * cell;
      for (let i = i0; i <= i1; i++) {
        const x = -WORLD_HALF + i * cell;
        const idx = j * S + i;
        if (heights[idx] < -0.15) continue;
        const s = fn(x, z);
        if (s >= 0) surface[idx] = s;
      }
    }
  };
  for (const p of P.paints) {
    if (p.k === 'c') paintAt((x, z) => (Math.hypot(x - p.x, z - p.z) <= p.r ? p.surf : -1), p.x - p.r, p.x + p.r, p.z - p.r, p.z + p.r);
    else {
      const R = Math.hypot(p.w, p.d) / 2;
      paintAt((x, z) => (rectDist(x, z, p) <= 0 ? p.surf : -1), p.x - R, p.x + R, p.z - R, p.z + R);
    }
  }
  for (const r of P.roads) paintAt((x, z) => (distToLine(x, z, r.pts) <= r.w / 2 ? r.surf : -1), r.box.x0, r.box.x1, r.box.z0, r.box.z1);
  yield 0.42;
  const hAt = (x, z) => terrain.heightAt(x, z);

  // ---------------- Bauwerke ----------------
  const parts = [];
  const groups = {};
  const out = { chests: [], floorLoot: [], signs: [], smoke: [] };
  const props = [];
  const ctx = {
    hAt,
    prop: (type, x, z, ry = 0, s = 1, v = 0) => props.push({ t: PT[type], x, y: hAt(x, z), z, ry, s, v }),
    propAt: (type, x, y, z, ry = 0, s = 1, v = 0) => props.push({ t: PT[type], x, y, z, ry, s, v }),
    rng: P.rng,
  };
  for (const it of P.items) {
    const y = it.y ?? hAt(it.x, it.z);
    it.fn(new Builder(parts, it.x, it.z, y, it.rot, groups), out, ctx);
  }
  for (const pr of P.props) props.push({ ...pr, y: hAt(pr.x, pr.z) });
  yield 0.5;

  // ---------------- Deko verteilen ----------------
  const rng = new RNG(seed ^ 0x51a9);
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
    const i0 = Math.floor((x - r - 10) / OCC), i1 = Math.floor((x + r + 10) / OCC);
    const j0 = Math.floor((z - r - 10) / OCC), j1 = Math.floor((z + r + 10) / OCC);
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
    if (r > 40) continue;
    occAdd(p.x, p.z, r * 0.85 + 0.8);
  }
  for (const pr of props) occAdd(pr.x, pr.z, propRadius(pr.t, pr.s));
  const blockedSurf = new Set([SURF.ROAD, SURF.PLAZA, SURF.FIELD, SURF.SEAFLOOR]);
  const inKeep = (x, z) => P.keeps.some((k) => Math.hypot(x - k.x, z - k.z) < k.r);

  const scatter = (type, count, opt = {}) => {
    let placed = 0, tries = 0;
    const R = PLAY_RADIUS + 10;
    while (placed < count && tries < count * 60) {
      tries++;
      let x, z;
      if (opt.area) {
        const a = rng.next() * Math.PI * 2, rr = Math.sqrt(rng.next()) * opt.area.r;
        x = opt.area.x + Math.cos(a) * rr; z = opt.area.z + Math.sin(a) * rr;
      } else {
        x = rng.range(-R, R); z = rng.range(-R, R);
      }
      const h = hAt(x, z);
      if (h < (opt.minH ?? 0.5) || h > (opt.maxH ?? 60)) continue;
      const s0 = terrain.surfaceAt(x, z);
      if (blockedSurf.has(s0) && !opt.anySurf) continue;
      if (opt.surf && !opt.surf.includes(s0)) continue;
      terrain.normalAt(x, z, nrm);
      if (nrm.y < (opt.maxSlope ?? 0.84)) continue;
      if (inKeep(x, z)) continue;
      const s = rng.range(opt.s0 ?? 0.85, opt.s1 ?? 1.2);
      const r = propRadius(PT[type], s);
      if (!occFree(x, z, r * (opt.spacing ?? 1))) continue;
      occAdd(x, z, r * (opt.solid === false ? 0.3 : 1));
      props.push({ t: PT[type], x, y: h, z, ry: rng.next() * Math.PI * 2, s, v: Math.floor(rng.next() * 3) });
      placed++;
    }
    return placed;
  };
  // Wälder zuerst (dicht), dann die offene Landschaft
  for (const f of P.forests) {
    const n = Math.round(((f.r * f.r) / 60) * f.density);
    scatter(bio.snowLine ? 'snowpine' : 'pine', Math.round(n * (bio.pines ?? 0.45)), { area: f, spacing: 0.75 });
    scatter('tree', Math.round(n * (1 - (bio.pines ?? 0.45))), { area: f, spacing: 0.8 });
    scatter('bush', Math.round(n * 0.4), { area: f, solid: false });
    scatter('stump', Math.round(n * 0.12), { area: f });
    scatter('log', Math.round(n * 0.06), { area: f });
  }
  const sc = bio.scatter || {};
  scatter('tree', sc.tree ?? 70, { spacing: 1.1 });
  scatter(bio.snowLine ? 'snowpine' : 'pine', sc.pine ?? 30, { spacing: 1.1 });
  scatter('palm', sc.palm ?? 0, { minH: 0.5, surf: [SURF.BEACH, SURF.GRASS, SURF.DRYGRASS] });
  scatter('bush', sc.bush ?? 60, { solid: false });
  scatter('stone_l', sc.stoneL ?? 10, { minH: 0.3, maxSlope: 0.6 });
  scatter('stone_m', sc.stoneM ?? 26, { minH: 0.1, maxSlope: 0.6 });
  scatter('stone_s', sc.stoneS ?? 50, { minH: -0.6, solid: false, maxSlope: 0.5, anySurf: true });
  scatter('flower', sc.flower ?? 40, { solid: false });
  scatter('beachgrass', sc.beachgrass ?? 60, { minH: 0.4, solid: false, surf: [SURF.BEACH] });
  scatter('reed', sc.reed ?? 0, { minH: -0.4, maxH: 0.8, solid: false, anySurf: true });
  scatter('log', sc.log ?? 6, {});
  scatter('hay', sc.hay ?? 0, { surf: [SURF.DRYGRASS, SURF.GRASS] });
  yield 0.6;

  // ---------------- Beute: fehlende Truhen/Bodenbeute auffüllen ----------------
  const wantChests = def.chests ?? 40;
  for (let g = 0; g < 4000 && out.chests.length < wantChests; g++) {
    const a = rng.next() * Math.PI * 2, rr = 18 + Math.sqrt(rng.next()) * (PLAY_RADIUS - 28);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const h = hAt(x, z);
    if (h < 0.5 || !occFree(x, z, 1.4)) continue;
    if (out.chests.some((c) => Math.hypot(c.x - x, c.z - z) < 14)) continue;
    terrain.normalAt(x, z, nrm);
    if (nrm.y < 0.9) continue;
    occAdd(x, z, 1.2);
    out.chests.push({ x, y: h, z, ry: rng.next() * Math.PI * 2 });
  }
  const wantFloor = def.floorLoot ?? 56;
  for (let g = 0; g < 4000 && out.floorLoot.length < wantFloor; g++) {
    const a = rng.next() * Math.PI * 2, rr = 10 + Math.sqrt(rng.next()) * (PLAY_RADIUS - 18);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const h = hAt(x, z);
    if (h < 0.4 || !occFree(x, z, 0.8)) continue;
    if (out.floorLoot.some((c) => Math.hypot(c.x - x, c.z - z) < 9)) continue;
    out.floorLoot.push({ x, y: h, z });
  }
  yield 0.66;

  // ---------------- Kollision ----------------
  const collision = new CollisionWorld(terrain);
  let n = 0;
  for (const p of parts) {
    if (!p.col) continue;
    if (p.s === 'box') {
      const c = collision.addBox(p.x, p.y, p.z, p.w, p.h, p.d, p.ry, p.m ?? MAT.WOOD);
      if (p.pass) c.pass = true;
    } else if (p.s === 'slab') {
      const c = collision.addBox(p.x, p.y, p.z, p.w * 0.92, p.h, p.d * 0.92, p.ry, p.m ?? MAT.STONE);
      c.soft = true;
    } else if (p.s === 'cyl') collision.addCyl(p.x, p.z, Math.max(0.05, (p.r + p.rt) / 2), p.y - p.h / 2, p.y + p.h / 2, p.m ?? MAT.WOOD);
    else if (p.s === 'sph') {
      const R = p.r * Math.max(p.sx, p.sz), H = p.r * p.sy;
      collision.addCyl(p.x, p.z, R * 0.86, p.y - H * 0.9, p.y + H * 0.45, p.m ?? MAT.STONE).soft = true;
      collision.addCyl(p.x, p.z, R * 0.55, p.y + H * 0.45, p.y + H * 0.88, p.m ?? MAT.STONE).soft = true;
    }
    if (++n % 1500 === 0) yield 0.66 + 0.2 * (n / parts.length);
  }
  for (const pr of props) {
    const cols = propColliders(pr.t, pr.s, pr.v);
    if (!cols) continue;
    const cos = Math.cos(pr.ry), sin = Math.sin(pr.ry);
    for (const c of cols) {
      const ox = c.ox || 0, oz = c.oz || 0;
      const x = pr.x + ox * cos + oz * sin, z = pr.z - ox * sin + oz * cos;
      const col = c.k === 'c' ? collision.addCyl(x, z, c.r, pr.y + c.y0, pr.y + c.h, c.m) : collision.addBox(x, pr.y + c.y, z, c.w, c.h, c.d, pr.ry + (c.ry || 0), c.m);
      if (c.m === MAT.STONE || c.m === MAT.PLANT) col.soft = true;
    }
  }
  yield 0.9;

  return {
    id: def.id,
    name: def.name,
    seed,
    terrain,
    collision,
    parts,
    groups,
    props,
    pois: P.pois.length ? P.pois : [{ id: def.id, name: def.name, x: 0, z: 0, r: 60 }],
    chests: out.chests,
    floorLoot: out.floorLoot,
    signs: out.signs,
    smoke: out.smoke,
    walks: [],
    genTime: Date.now() - t0,
  };
}
