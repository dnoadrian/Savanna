// Low-Poly-Geometrie-Baukasten: sammelt Dreiecke mit Vertex-Farben (+Leucht-Flag)
// und führt sie zu einer BufferGeometry zusammen (zusammengeführte Geometrien).
import * as THREE from 'three';
import { hash2 } from '../../shared/rng.js';

const _c = new THREE.Color();

// Einheits-Primitive (lokal, nicht indiziert)
function unitBox() {
  const v = [];
  const P = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
  ];
  const F = [
    [4, 5, 6, 7, 0.96], // vorne +z
    [1, 0, 3, 2, 0.9], // hinten
    [5, 1, 2, 6, 0.93], // rechts
    [0, 4, 7, 3, 0.93], // links
    [7, 6, 2, 3, 1.06], // oben
    [0, 1, 5, 4, 0.8], // unten
  ];
  const shade = [];
  for (const [a, b, c, d, s] of F) {
    v.push(...P[a], ...P[b], ...P[c], ...P[a], ...P[c], ...P[d]);
    shade.push(s, s);
  }
  return { pos: new Float32Array(v), shade };
}

function unitCyl(seg, rt, rb, caps = true) {
  const v = [];
  const shade = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    // Mantel
    v.push(rb * c0, -0.5, rb * s0, rt * c0, 0.5, rt * s0, rt * c1, 0.5, rt * s1);
    shade.push(0.94 + 0.08 * Math.sin(a0));
    if (rb > 0) {
      v.push(rb * c0, -0.5, rb * s0, rt * c1, 0.5, rt * s1, rb * c1, -0.5, rb * s1);
      shade.push(0.94 + 0.08 * Math.sin(a0));
    }
    if (caps) {
      if (rt > 0) { v.push(0, 0.5, 0, rt * c1, 0.5, rt * s1, rt * c0, 0.5, rt * s0); shade.push(1.05); }
      if (rb > 0) { v.push(0, -0.5, 0, rb * c0, -0.5, rb * s0, rb * c1, -0.5, rb * s1); shade.push(0.8); }
    }
  }
  return { pos: new Float32Array(v), shade };
}

function unitPrism() {
  const v = [];
  const shade = [];
  const A = [-0.5, -0.5], B = [0.5, -0.5], Cc = [0, 0.5];
  // Giebel
  v.push(A[0], A[1], 0.5, B[0], B[1], 0.5, Cc[0], Cc[1], 0.5); shade.push(0.95);
  v.push(B[0], B[1], -0.5, A[0], A[1], -0.5, Cc[0], Cc[1], -0.5); shade.push(0.9);
  // Dachflächen
  v.push(B[0], B[1], 0.5, B[0], B[1], -0.5, Cc[0], Cc[1], -0.5, B[0], B[1], 0.5, Cc[0], Cc[1], -0.5, Cc[0], Cc[1], 0.5); shade.push(1.0, 1.0);
  v.push(A[0], A[1], -0.5, A[0], A[1], 0.5, Cc[0], Cc[1], 0.5, A[0], A[1], -0.5, Cc[0], Cc[1], 0.5, Cc[0], Cc[1], -0.5); shade.push(0.92, 0.92);
  // Boden
  v.push(A[0], A[1], 0.5, A[0], A[1], -0.5, B[0], B[1], -0.5, A[0], A[1], 0.5, B[0], B[1], -0.5, B[0], B[1], 0.5); shade.push(0.8, 0.8);
  return { pos: new Float32Array(v), shade };
}

// Felsblock: achteckig abgeschrägtes Prisma, oben um `taper` verkleinert (Canyonwände)
const slabCache = new Map();
function slabTemplate(taper) {
  const key = Math.round(taper * 50);
  let t = slabCache.get(key);
  if (t) return t;
  const c = 0.2;
  const ring = [[-0.5 + c, -0.5], [0.5 - c, -0.5], [0.5, -0.5 + c], [0.5, 0.5 - c], [0.5 - c, 0.5], [-0.5 + c, 0.5], [-0.5, 0.5 - c], [-0.5, -0.5 + c]];
  const tp = key / 50;
  const v = [];
  const shade = [];
  for (let i = 0; i < 8; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % 8];
    const b0 = [x0, -0.5, z0], b1 = [x1, -0.5, z1], t0 = [x0 * tp, 0.5, z0 * tp], t1 = [x1 * tp, 0.5, z1 * tp];
    v.push(...b0, ...t1, ...b1, ...b0, ...t0, ...t1);
    const nx = (z1 - z0), nz = -(x1 - x0);
    const sh = 0.86 + 0.12 * (nx * 0.6 + nz * 0.8) / Math.hypot(nx, nz);
    shade.push(sh, sh);
  }
  for (let i = 1; i < 7; i++) {
    const [x0, z0] = ring[0], [x1, z1] = ring[i], [x2, z2] = ring[i + 1];
    v.push(x0 * tp, 0.5, z0 * tp, x2 * tp, 0.5, z2 * tp, x1 * tp, 0.5, z1 * tp);
    shade.push(1.08);
  }
  t = { pos: new Float32Array(v), shade };
  slabCache.set(key, t);
  return t;
}

const icoCache = new Map();
function unitIco(detail) {
  if (icoCache.has(detail)) return icoCache.get(detail);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = new Float32Array(g.attributes.position.array);
  const shade = [];
  for (let i = 0; i < pos.length / 9; i++) shade.push(0.9 + 0.12 * (pos[i * 9 + 1] + pos[i * 9 + 4] + pos[i * 9 + 7]) / 3);
  const r = { pos, shade };
  icoCache.set(detail, r);
  return r;
}

const BOX = unitBox();
const PRISM = unitPrism();
const cylCache = new Map();
function cylTemplate(seg, rt, rb) {
  const k = seg + ':' + rt.toFixed(3) + ':' + rb.toFixed(3);
  let t = cylCache.get(k);
  if (!t) { t = unitCyl(seg, rt, rb); cylCache.set(k, t); }
  return t;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function makeMatrix(x, y, z, rx, ry, rz, sx, sy, sz, out = _m) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return out.compose(_p, _q, _s);
}

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.col = [];
    this.emi = [];
    this.tex = [];
    this.tx = 0; // Textur (TX) der als Nächstes angehängten Dreiecke
    this.seed = 1;
  }

  get triCount() {
    return this.pos.length / 9;
  }

  // Template (Float32Array Positionen + Schattierung pro Dreieck) mit Matrix anhängen
  addTemplate(t, m, color, emissive = 0, vary = 0.06, jitter = 0) {
    const e = m.elements;
    const p = t.pos;
    _c.set(color);
    const r0 = _c.r, g0 = _c.g, b0 = _c.b;
    const tris = p.length / 9;
    const pos = this.pos, col = this.col, emi = this.emi, tex = this.tex, tx = this.tx;
    for (let i = 0; i < tris; i++) {
      const s = (t.shade[i] ?? 1) * (1 + (hash2(this.seed++, i, 7) - 0.5) * vary * 2);
      const r = Math.min(1, r0 * s), g = Math.min(1, g0 * s), b = Math.min(1, b0 * s);
      for (let k = 0; k < 3; k++) {
        const o = i * 9 + k * 3;
        let x = p[o], y = p[o + 1], z = p[o + 2];
        if (jitter) {
          const hx = hash2(Math.round(x * 1000), Math.round(y * 1000) + Math.round(z * 777), this.jseed || 3);
          const f = 1 + (hx - 0.5) * jitter;
          x *= f; y *= f; z *= f;
        }
        pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
        col.push(r, g, b);
        emi.push(emissive);
        tex.push(tx);
      }
    }
  }

  box(x, y, z, w, h, d, color, o = {}) {
    this.tx = o.tx || 0;
    makeMatrix(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, w, h, d);
    this.addTemplate(BOX, _m, color, o.e || 0, o.vary ?? 0.05);
    return this;
  }

  cyl(x, y, z, rb, h, color, o = {}) {
    const rt = o.rt ?? rb;
    const seg = o.seg || 8;
    this.tx = o.tx || 0;
    const mr = Math.max(rt, rb) || 1;
    const t = cylTemplate(seg, rt / mr, rb / mr);
    makeMatrix(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, mr, h, mr);
    this.addTemplate(t, _m, color, o.e || 0, o.vary ?? 0.05);
    return this;
  }

  ico(x, y, z, r, color, o = {}) {
    this.tx = o.tx || 0;
    makeMatrix(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1));
    this.jseed = o.jseed || 3;
    this.addTemplate(unitIco(o.detail || 0), _m, color, o.e || 0, o.vary ?? 0.08, o.jitter ?? 0.25);
    this.jseed = 3;
    return this;
  }

  slab(x, y, z, w, h, d, color, o = {}) {
    this.tx = o.tx || 0;
    makeMatrix(x, y, z, 0, o.ry || 0, 0, w, h, d);
    this.addTemplate(slabTemplate(o.taper ?? 0.9), _m, color, 0, o.vary ?? 0.07);
    return this;
  }

  prism(x, y, z, w, h, d, color, o = {}) {
    this.tx = o.tx || 0;
    makeMatrix(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, w, h, d);
    this.addTemplate(PRISM, _m, color, o.e || 0, o.vary ?? 0.04);
    return this;
  }

  // anderen Builder (lokales Modell) transformiert anhängen
  append(other, m) {
    const e = m.elements;
    const p = other.pos;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      this.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
    for (let i = 0; i < other.col.length; i++) this.col.push(other.col[i]);
    for (let i = 0; i < other.emi.length; i++) this.emi.push(other.emi[i]);
    for (let i = 0; i < other.tex.length; i++) this.tex.push(other.tex[i]);
  }

  // vorkompiliertes Modell (Typed Arrays) transformiert anhängen – schneller Pfad
  appendModel(model, m, tint = null) {
    const e = m.elements;
    const p = model.pos;
    const pos = this.pos;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
    const c = model.col;
    if (tint) {
      for (let i = 0; i < c.length; i += 3) this.col.push(c[i] * tint[0], c[i + 1] * tint[1], c[i + 2] * tint[2]);
    } else {
      for (let i = 0; i < c.length; i++) this.col.push(c[i]);
    }
    const em = model.emi;
    for (let i = 0; i < em.length; i++) this.emi.push(em[i]);
    const tx = model.tex;
    for (let i = 0; i < tx.length; i++) this.tex.push(tx[i]);
  }

  compile() {
    return { pos: new Float32Array(this.pos), col: new Float32Array(this.col), emi: new Float32Array(this.emi), tex: new Uint8Array(this.tex) };
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    let anyEmi = false;
    for (let i = 0; i < this.emi.length; i++) if (this.emi[i]) { anyEmi = true; break; }
    if (anyEmi) {
      const eU8 = new Uint8Array(this.emi.length);
      for (let i = 0; i < this.emi.length; i++) eU8[i] = Math.round(Math.min(1, this.emi[i]) * 255);
      g.setAttribute('emis', new THREE.BufferAttribute(eU8, 1, true));
    }
    if (this.tex.some((v) => v)) g.setAttribute('tex', new THREE.BufferAttribute(new Uint8Array(this.tex), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---------------------------------------------------------------------------
// Prozedurale Oberflächen-Texturen (TX in shared/map/builder.js). Ohne UV-Koordinaten:
// Muster werden aus der Weltposition projiziert (Hauptachse der Flächennormale). Feine
// Details (Fugen, Risse, Glitzern) werden mit der Entfernung weich ausgeblendet.
const SURF_GLSL = /* glsl */ `
varying vec3 vWPos;
varying float vTexId;
float sdH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sdN(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sdH(i), sdH(i + vec2(1.0, 0.0)), u.x), mix(sdH(i + vec2(0.0, 1.0)), sdH(i + vec2(1.0, 1.0)), u.x), u.y);
}
float sdF(vec2 p) { return sdN(p) * 0.55 + sdN(p * 2.07 + 5.3) * 0.3 + sdN(p * 4.31 + 1.7) * 0.15; }
// Abstand zur nächsten Zellgrenze (Voronoi) – Risse in Eis und Fels
float sdCrack(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); float d1 = 9.0; float d2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + vec2(sdH(i + g), sdH(i + g + 31.7)) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}
// Linie (1 auf der Linie) mit Kantenglättung
float sdLine(float e, float w) { float aa = fwidth(e) * 1.2 + 1e-4; return 1.0 - smoothstep(w, w + aa, e); }
// Blockraster: x = Fuge, y = Zufallswert des Blocks, z = Höhe im Block (0 unten .. 1 oben)
vec3 sdBlocks(vec2 uv, vec2 size, float offset, float w) {
  vec2 b = uv / size;
  b.x += fract(floor(b.y) * offset);
  vec2 c = floor(b); vec2 f = fract(b);
  vec2 e = min(f, 1.0 - f) * size;
  return vec3(max(sdLine(e.x, w), sdLine(e.y, w)), sdH(c + 3.1), f.y);
}
void sdApply(inout vec3 col, vec3 nView) {
  float id = floor(vTexId + 0.5);
  if (id < 0.5) return;
  vec3 n = normalize((vec4(nView, 0.0) * viewMatrix).xyz);
  vec3 an = abs(n);
  vec3 p = vWPos;
  bool top = an.y >= an.x && an.y >= an.z;
  vec2 uv = top ? p.xz : (an.x > an.z ? vec2(p.z, p.y) : vec2(p.x, p.y));
  float fade = 1.0 - smoothstep(30.0, 115.0, length(vViewPosition));
  float big = sdF(p.xz * 0.06 + p.y * 0.04);
  if (id < 1.5) {
    // Schnee: weiche Wellen, leichte Verwehungen, Glitzern in der Sonne, bläulich an Hängen
    float rip = sin(dot(p.xz, vec2(0.83, 0.55)) * 2.4 + sdN(p.xz * 0.3) * 5.0);
    col *= 0.955 + big * 0.08 + rip * 0.02 * fade;
    float sp = step(0.9965, sdH(floor(p.xz * 10.0) + floor(cameraPosition.xz * 0.7)));
    col += sp * 0.5 * fade * max(0.0, n.y);
    col *= mix(vec3(0.9, 0.95, 1.03), vec3(1.0), smoothstep(0.7, 0.97, n.y));
  } else if (id < 2.5) {
    // Eis: dunklere Tiefe, weiße Reifschlieren, vereinzelte helle Risse, Glanz am Rand
    float deep = sdF(uv * 0.12 + 2.0);
    col *= 0.8 + deep * 0.36;
    if (top) {
      float streak = sdF(vec2(p.x * 0.05 + p.z * 0.11, p.z * 0.05 - p.x * 0.11) * vec2(1.0, 6.0));
      col = mix(col, vec3(0.9, 0.96, 1.0), smoothstep(0.55, 0.85, streak) * 0.55);
    } else {
      col *= 0.86 + sdN(vec2(uv.x * 1.3, uv.y * 0.08)) * 0.28;
      col = mix(col, vec3(0.9, 0.97, 1.0), smoothstep(0.7, 1.0, sdN(vec2(uv.x * 0.6, uv.y * 3.0))) * 0.3);
    }
    // Risse nur stellenweise: großes Netz schwach, feine Sprünge nur in einzelnen Flecken
    float mask = smoothstep(0.6, 0.85, sdN(uv * 0.07 + 11.0)) * (top ? 1.0 : 0.3);
    float c1 = sdLine(sdCrack(uv * 0.17), 0.02) * (0.25 + mask * 0.75);
    float c2 = sdLine(sdCrack(uv * 0.9 + 7.0), 0.014) * mask;
    col = mix(col, vec3(0.94, 0.99, 1.0), max(c1 * 0.3, c2 * 0.45) * fade);
    float fr = pow(1.0 - abs(dot(normalize(vViewPosition), nView)), 4.0);
    col += fr * 0.16;
  } else if (id < 3.5) {
    // Fels: Gesteinsschichten, Körnung, vereinzelte Risse
    float strata = sin(p.y * 1.7 + sdF(p.xz * 0.09) * 6.0);
    float band = smoothstep(0.35, 0.9, strata);
    col *= 0.88 + big * 0.2 + strata * 0.06 + band * 0.05 * fade + (sdN(uv * 2.6) - 0.5) * 0.12 * fade;
    float cmask = smoothstep(0.5, 0.75, sdN(uv * 0.12 + 5.0));
    col *= 1.0 - sdLine(sdCrack(uv * 0.42), 0.022) * 0.28 * cmask * fade;
  } else if (id < 4.5) {
    // Mauerwerk: versetzte Steinblöcke mit Fugen, jede Kante leicht heller
    vec3 b = sdBlocks(uv, top ? vec2(1.2) : vec2(1.4, 0.7), 0.5, 0.035);
    col *= 0.94 + (b.y - 0.5) * 0.16 * fade + (sdN(uv * 4.0) - 0.5) * 0.08 * fade + big * 0.05;
    if (!top) col *= 1.0 + smoothstep(0.8, 0.95, b.z) * 0.05 * fade;
    col *= 1.0 - b.x * 0.32 * fade;
  } else if (id < 5.5) {
    // Bodenplatten mit Reif
    vec3 b = sdBlocks(uv, vec2(2.0), 0.0, 0.04);
    col *= 0.94 + (b.y - 0.5) * 0.12 * fade + (sdN(uv * 3.0) - 0.5) * 0.06 * fade;
    col *= 1.0 - b.x * 0.36 * fade;
    col = mix(col, vec3(0.86, 0.9, 0.95), smoothstep(0.55, 0.82, sdF(p.xz * 0.4)) * 0.5);
  } else if (id < 6.5) {
    // Holz: Bretter mit Fugen und Maserung
    vec2 w = top ? (an.x > an.z ? p.zx : p.xz) : uv;
    float row = floor(w.y / 0.32);
    float gap = sdLine(min(fract(w.y / 0.32), 1.0 - fract(w.y / 0.32)) * 0.32, 0.018);
    float grain = sdN(vec2(w.x * 0.9 + row * 7.0, w.y * 26.0));
    col *= 0.92 + (sdH(vec2(row, 2.0)) - 0.5) * 0.16 * fade + (grain - 0.5) * 0.12 * fade;
    col *= 1.0 - gap * 0.35 * fade;
  } else if (id < 7.5) {
    // Blech: Plattenstöße und gebürstete Oberfläche
    vec3 b = sdBlocks(uv, vec2(1.5, 1.0), 0.0, 0.02);
    col *= 0.95 + (sdN(vec2(uv.x * 30.0, uv.y * 1.5)) - 0.5) * 0.07 * fade + (b.y - 0.5) * 0.06 * fade;
    col *= 1.0 - b.x * 0.22 * fade;
  } else if (id < 8.5) {
    // Bronze: helle Zierrippen und grünliche Patina
    float u = top ? atan(p.z, p.x) * 6.0 : uv.x / 0.7;
    float rib = sdLine(abs(fract(u) - 0.5) * 0.7, 0.035);
    col = mix(col, col * vec3(0.78, 1.12, 1.06), smoothstep(0.5, 0.8, sdF(uv * 0.45)) * 0.5);
    col *= 0.94 + big * 0.1;
    col += rib * 0.07 * fade;
  } else if (id < 9.5) {
    // Erdboden/Sand: Flecken und Körnung
    col *= 0.93 + big * 0.12 + (sdN(p.xz * 2.4) - 0.5) * 0.1 * fade;
  } else if (id < 10.5) {
    // große Betonplatten mit dunklen Schlieren unter jeder Fuge
    vec3 b = sdBlocks(uv, top ? vec2(3.0) : vec2(3.2, 1.6), 0.0, 0.03);
    float streak = top ? 0.0 : sdN(vec2(uv.x * 2.3, floor(uv.y / 1.6) * 3.0)) * (1.0 - b.z);
    col *= 0.95 + (b.y - 0.5) * 0.08 * fade + big * 0.06 - streak * 0.1 * fade;
    col *= 1.0 - b.x * 0.26 * fade;
  } else {
    // Wiese: helle und dunkle Flecken, trockene Stellen, feine Halmstruktur, kleine Blüten
    float mead = sdF(p.xz * 0.08 + 3.0);
    col *= 0.84 + mead * 0.3;
    col = mix(col, col * vec3(1.14, 1.05, 0.66), smoothstep(0.6, 0.9, sdF(p.xz * 0.045 + 9.0)) * 0.4);
    float blades = sdN(vec2(p.x * 7.0 + sdN(p.xz * 1.3) * 4.0, p.z * 7.0 - sdN(p.xz * 1.1 + 4.0) * 4.0));
    col *= 1.0 - (blades - 0.5) * 0.26 * fade;
    col *= 0.92 + sdN(p.xz * 2.1 + 1.3) * 0.14 * fade;
    float dots = step(0.988, sdH(floor(p.xz * 5.0)));
    col = mix(col, mix(vec3(1.0, 0.96, 0.62), vec3(1.0, 1.0, 1.0), sdH(floor(p.xz * 5.0) + 2.0)), dots * 0.55 * fade * max(0.0, n.y));
  }
}
`;

function patchSurface(sh, terrain) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float emis;\nattribute float tex;\nvarying float vEmis;\nvarying vec3 vWPos;\nvarying float vTexId;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmis = emis;\nvTexId = tex;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vEmis;')
    .replace('#include <clipping_planes_pars_fragment>', '#include <clipping_planes_pars_fragment>\n' + SURF_GLSL)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      ${terrain ? '// Gelände: Schnee, Eis und Wiese weich schattiert, Fels und Boden bleiben kantig\nif ((vTexId > 2.5 && vTexId < 10.5) || vTexId < 0.5) normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));' : ''}
      sdApply(diffuseColor.rgb, normal);`)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmis * 1.6;');
}

// Gemeinsames Material für alles Statische (Lambert, Flat-Shading, Vertexfarben, Texturen, Leuchten)
let sharedMat = null;
export function worldMaterial() {
  if (sharedMat) return sharedMat;
  sharedMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  sharedMat.onBeforeCompile = (sh) => patchSurface(sh, false);
  sharedMat.customProgramCacheKey = () => 'worldMat3';
  return sharedMat;
}

// Material fürs Gelände: weiche Normalen (Schnee), sonst wie worldMaterial
let terrainMat = null;
export function terrainMaterial() {
  if (terrainMat) return terrainMat;
  terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  terrainMat.onBeforeCompile = (sh) => patchSurface(sh, true);
  terrainMat.customProgramCacheKey = () => 'terrainMat3';
  return terrainMat;
}

// Material ohne Leucht-Attribut (Charaktere etc.)
export function flatMaterial(extra = {}) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...extra });
}
