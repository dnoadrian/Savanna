// Insel-Generator (gleich auf Server und Client): die Karte ist eine Insel im offenen Meer.
// Eine Kartendefinition plant zuerst Gelände (ebene Flächen, Gipfel, Bergketten, Eisterrassen,
// gefrorene Seen und Flüsse, Hügel, Straßen) und Bauwerke; danach entstehen Höhenfeld,
// Bodenarten, Parts, Deko und Kollision. Als Generator (yield = Fortschritt), damit der Server
// in kleinen Häppchen rechnen kann, ohne laufende Matches ruckeln zu lassen.
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
// Abstand zur Linie + interpolierter dritter Wert der Punkte (z. B. Eishöhe eines Flusses)
function lineLevel(x, z, pts, out) {
  let best = Infinity, lv = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const [x1, z1, l1 = 0] = pts[k], [x2, z2, l2 = 0] = pts[k + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const l2d = dx * dx + dz * dz || 1e-9;
    let t = ((x - x1) * dx + (z - z1) * dz) / l2d;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x1 + dx * t - x, z1 + dz * t - z);
    if (d < best) { best = d; lv = l1 + (l2 - l1) * t; }
  }
  out.d = best;
  out.level = lv;
  return out;
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
    this.ramps = [];
    this.roads = [];
    this.paints = [];
    this.lakes = [];
    this.rivers = [];
    this.hills = [];
    this.peaks = [];
    this.ridges = [];
    this.shelves = [];
    this.glaciers = [];
    this.iceLakes = [];
    this.iceRivers = [];
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
  // Rampe von (x1,z1) auf Höhe h1 nach (x2,z2) auf Höhe h2 (null = Geländehöhe), Breite w
  ramp(x1, z1, h1, x2, z2, h2, w = 6, edge = 4) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    this.ramps.push({ x1, z1, h1, x2, z2, h2, w, edge, len, ux: (x2 - x1) / len, uz: (z2 - z1) / len });
    return this;
  }
  road(pts, w = 7, surf = SURF.ROAD) { this.roads.push({ pts, w, surf, box: lineBox(pts, w) }); return this; }
  paintCircle(x, z, r, surf) { this.paints.push({ k: 'c', x, z, r, surf }); return this; }
  paintRect(x, z, w, d, ry, surf) { this.paints.push({ k: 'r', x, z, w, d, ry, surf }); return this; }
  // flacher See (Tiefe < 1,1 m: man kann hindurchwaten)
  lake(x, z, r, depth = 0.8, sx = 1, sz = 1) { this.lakes.push({ x, z, r, depth, sx, sz }); return this; }
  river(pts, w = 8, depth = 0.7) { this.rivers.push({ pts, w, depth, box: lineBox(pts, w + 10) }); return this; }
  // Hügel/Berg (Gauß-Glocke); rock: Felsboden, snow: Schneekuppe
  hill(x, z, r, h, o = {}) { this.hills.push({ x, z, r, h, rock: !!o.rock, snow: !!o.snow, sharp: o.sharp ?? 2 }); return this; }
  // spitzer Berg mit Graten (ridges = Anzahl der Kämme, exp > 1 = hohle Flanken, jag = zerklüftet)
  peak(x, z, r, h, o = {}) {
    this.peaks.push({ x, z, r, h, R2: (r * 1.5) ** 2, exp: o.exp ?? 1.4, ridges: o.ridges ?? 5, rot: o.rot ?? 0, jag: o.jag ?? 0.25 });
    return this;
  }
  // Bergkette entlang einer Linie (Gipfel und Sättel per Rauschen)
  ridge(pts, w, h) { this.ridges.push({ pts, w, h, box: lineBox(pts, w * 0.7) }); return this; }
  // Schneeterrasse: flache Stufe mit steiler Eiskante (Gletscherstufe)
  shelf(x, z, r, h, edge = 1.6) { this.shelves.push({ x, z, r, h, edge }); return this; }
  // Bereich, in dem steile Hänge blankes Gletschereis statt Fels zeigen
  glacier(x, z, r) { this.glaciers.push({ x, z, r }); return this; }
  // gefrorener See / Fluss: Eisfläche auf Höhe level (begehbar); Flusspunkte [x, z, Eishöhe]
  iceLake(x, z, r, sx = 1, sz = 1, level = 0.35) { this.iceLakes.push({ x, z, r, sx, sz, level }); return this; }
  iceRiver(pts, w = 10) { this.iceRivers.push({ pts, w, box: lineBox(pts, w + 12) }); return this; }
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

  const LL = { d: 0, level: 0 };
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
    for (const pk of P.peaks) {
      const dx = x - pk.x, dz = z - pk.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > pk.R2) continue;
      const a = Math.atan2(dz, dx);
      // Grate: in Richtung der Kämme reicht der Berg weiter hinaus
      const ridge = Math.abs(Math.cos((a - pk.rot) * pk.ridges * 0.5)) ** 4;
      const rr = pk.r * (0.74 + 0.46 * ridge + n2.noise(Math.cos(a) * 1.7 + pk.x * 0.01, Math.sin(a) * 1.7 + pk.z * 0.01) * 0.16);
      const k = 1 - Math.sqrt(d2) / rr;
      if (k <= 0) continue;
      const rn = 1 - Math.abs(n3.noise(x / 10 + pk.x * 0.1, z / 10));
      h += pk.h * k ** pk.exp * (1 + (rn - 0.6) * pk.jag * (1 - k * 0.4));
    }
    for (const rg of P.ridges) {
      if (x < rg.box.x0 || x > rg.box.x1 || z < rg.box.z0 || z > rg.box.z1) continue;
      const hw = (rg.w / 2) * (1 + n1.noise(x / 40 + 3, z / 40) * 0.25);
      const dd = distToLine(x, z, rg.pts);
      if (dd >= hw) continue;
      const k = 1 - dd / hw;
      const along = 0.7 + (n2.noise(x / 42 + 11, z / 42) * 0.5 + 0.5) * 0.55;
      const rn = 1 - Math.abs(n3.noise(x / 12, z / 12 + 5));
      h += rg.h * along * k ** 1.5 * (1 + (rn - 0.6) * 0.32);
    }
    for (const sh of P.shelves) {
      const dx = x - sh.x, dz = z - sh.z;
      if (Math.abs(dx) > sh.r * 1.3 + sh.edge || Math.abs(dz) > sh.r * 1.3 + sh.edge) continue;
      const a = Math.atan2(dz, dx);
      const rr = sh.r * (1 + n1.noise(Math.cos(a) * 1.6 + sh.x * 0.05, Math.sin(a) * 1.6 + sh.z * 0.05) * 0.16);
      h += sh.h * smoothstep(rr + sh.edge, rr, Math.hypot(dx, dz));
    }
    for (const l of P.iceLakes) {
      const dx = (x - l.x) / l.sx, dz = (z - l.z) / l.sz;
      const q = Math.sqrt(dx * dx + dz * dz) / l.r + n3.noise(x / 11, z / 11) * 0.08;
      if (q > 1.6) continue;
      h = lerp(h, l.level, smoothstep(1.45, 1.0, q));
    }
    for (const rv of P.iceRivers) {
      if (x < rv.box.x0 || x > rv.box.x1 || z < rv.box.z0 || z > rv.box.z1) continue;
      lineLevel(x, z, rv.pts, LL);
      if (LL.d > rv.w / 2 + 7) continue;
      h = lerp(h, LL.level, smoothstep(rv.w / 2 + 7, rv.w / 2, LL.d));
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
  for (const r of P.ramps) {
    if (r.h1 === null) r.h1 = Math.max(0.6, pre(r.x1, r.z1));
    if (r.h2 === null) r.h2 = Math.max(0.6, pre(r.x2, r.z2));
  }
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
    for (const r of P.ramps) {
      const dx = x - r.x1, dz = z - r.z1;
      const t = (dx * r.ux + dz * r.uz) / r.len;
      if (t < -0.3 || t > 1.3) continue;
      const across = Math.max(0, Math.abs(dx * r.uz - dz * r.ux) - r.w / 2);
      const along = t < 0 ? -t * r.len : t > 1 ? (t - 1) * r.len : 0;
      const d = Math.hypot(across, along);
      if (d >= r.edge) continue;
      const tc = t < 0 ? 0 : t > 1 ? 1 : t;
      h = lerp(h, r.h1 + (r.h2 - r.h1) * tc, smoothstep(r.edge, 0, d));
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
  // auf dem Eis eines gefrorenen Sees/Flusses?
  const onIce = (x, z) => {
    for (const l of P.iceLakes) {
      const dx = (x - l.x) / l.sx, dz = (z - l.z) / l.sz;
      if (Math.sqrt(dx * dx + dz * dz) / l.r + n3.noise(x / 11, z / 11) * 0.08 < 1.04) return true;
    }
    for (const rv of P.iceRivers) {
      if (x < rv.box.x0 || x > rv.box.x1 || z < rv.box.z0 || z > rv.box.z1) continue;
      if (lineLevel(x, z, rv.pts, LL).d < rv.w / 2 + 0.6) return true;
    }
    return false;
  };
  const inShelf = (x, z) => P.shelves.some((sh) => Math.hypot(x - sh.x, z - sh.z) < sh.r * 1.3 + sh.edge + 1)
    || P.glaciers.some((g) => Math.hypot(x - g.x, z - g.z) < g.r);
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
        if (onIce(x, z)) s = SURF.ICE;
        else if (d < 7 && h < 1.5) s = SURF.BEACH; // Kiesstrand
        else if (nrm.y < 0.66 && inShelf(x, z)) s = SURF.GLACIER; // Eiskante der Terrassen
        // Fels nur an steilen Stellen; im Hochgebirge schon an mäßig steilen Hängen
        else if (nrm.y < 0.5 + 0.26 * smoothstep(10, 32, h) + n1.noise(x / 7, z / 7) * 0.06 || (h > 4 && nrm.y < 0.86 && inRock(x, z))) s = SURF.ROCK;
        else s = SURF.SNOW;
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
  const blockedSurf = new Set([SURF.ROAD, SURF.PLAZA, SURF.FIELD, SURF.SEAFLOOR, SURF.ICE, SURF.GLACIER, SURF.PATH]);
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
  // Wälder: dichte, verschneite Fichten; dann die offene Landschaft
  for (const f of P.forests) {
    const n = Math.round(((f.r * f.r) / 55) * f.density);
    scatter('snowpine', n, { area: f, spacing: 0.7, s0: 0.8, s1: 1.25 });
    scatter('boulder', Math.round(n * 0.08), { area: f });
  }
  const sc = def.scatter || {};
  scatter('snowpine', sc.pine ?? 90, { spacing: 1.1, s0: 0.75, s1: 1.2 });
  scatter('boulder', sc.boulder ?? 30, { maxSlope: 0.72, s0: 0.7, s1: 1.4 });
  scatter('stone_s', sc.stone ?? 40, { minH: -0.6, solid: false, maxSlope: 0.5, anySurf: true });
  // Eisbrocken an den Gletscherstufen und verstreut
  for (const sh of P.shelves) scatter('icechunk', sc.iceShelf ?? 2, { area: { x: sh.x, z: sh.z, r: sh.r * 1.35 }, maxSlope: 0.6, s0: 0.7, s1: 1.3 });
  scatter('icechunk', sc.ice ?? 12, { maxSlope: 0.72, s0: 0.6, s1: 1.2 });
  scatter('log', sc.log ?? 6, {});
  // treibende Eisschollen im Meer (nur Deko)
  for (let k = 0, g = 0; k < (sc.floe ?? 40) && g < 4000; g++) {
    const a = rng.next() * Math.PI * 2, r = PLAY_RADIUS + 6 + rng.next() * 60;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (hAt(x, z) > -1.4 || !occFree(x, z, 3)) continue;
    const s = rng.range(0.6, 1.7);
    occAdd(x, z, 3 * s);
    props.push({ t: PT.floe, x, y: 0, z, ry: rng.next() * Math.PI * 2, s, v: Math.floor(rng.next() * 3) });
    k++;
  }
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
