// Low-Poly-Geometrie-Baukasten: sammelt Dreiecke mit Vertex-Farben (+Leucht-Flag)
// und führt sie zu einer BufferGeometry zusammen (zusammengeführte Geometrien).
import * as THREE from 'three';
import { hash2 } from '/shared/rng.js';

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
    const pos = this.pos, col = this.col, emi = this.emi;
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
      }
    }
  }

  box(x, y, z, w, h, d, color, o = {}) {
    makeMatrix(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, w, h, d);
    this.addTemplate(BOX, _m, color, o.e || 0, o.vary ?? 0.05);
    return this;
  }

  cyl(x, y, z, rb, h, color, o = {}) {
    const rt = o.rt ?? rb;
    const seg = o.seg || 8;
    const mr = Math.max(rt, rb) || 1;
    const t = cylTemplate(seg, rt / mr, rb / mr);
    makeMatrix(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, mr, h, mr);
    this.addTemplate(t, _m, color, o.e || 0, o.vary ?? 0.05);
    return this;
  }

  ico(x, y, z, r, color, o = {}) {
    makeMatrix(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1));
    this.jseed = o.jseed || 3;
    this.addTemplate(unitIco(o.detail || 0), _m, color, o.e || 0, o.vary ?? 0.08, o.jitter ?? 0.25);
    this.jseed = 3;
    return this;
  }

  prism(x, y, z, w, h, d, color, o = {}) {
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
  }

  compile() {
    return { pos: new Float32Array(this.pos), col: new Float32Array(this.col), emi: new Float32Array(this.emi) };
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
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Gemeinsames Material für alles Statische (Lambert, Flat-Shading, Vertexfarben, optionales Leuchten)
let sharedMat = null;
export function worldMaterial() {
  if (sharedMat) return sharedMat;
  sharedMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  sharedMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float emis;\nvarying float vEmis;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmis = emis;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEmis;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmis * 1.6;');
  };
  sharedMat.customProgramCacheKey = () => 'worldMat';
  return sharedMat;
}

// Material ohne Leucht-Attribut (Charaktere etc.)
export function flatMaterial(extra = {}) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...extra });
}
