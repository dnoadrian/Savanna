// Terrain-Chunks mit Vertexfarben und prozeduralen Texturen (Frustum-Culling pro Chunk).
// Schnee ist weich schattiert, Fels/Eis bleiben kantig. Am Fuß von Wänden, Felsen und
// Stämmen wird der Boden leicht abgedunkelt (Kontaktschatten).
import * as THREE from 'three';
import { SURF } from '../../shared/map/terrain.js';
import { hash2 } from '../../shared/rng.js';
import { Noise2D } from '../../shared/noise.js';
import { terrainMaterial } from './geom.js';
import { TX } from '../../shared/map/builder.js';

const SURF_COLORS = {
  [SURF.GRASS]: 0x86c956,
  [SURF.DRYGRASS]: 0xc9c062,
  [SURF.DIRT]: 0x8a7462,
  [SURF.ROCK]: 0x86807b,
  [SURF.BEACH]: 0xb8b0a4,
  [SURF.PATH]: 0xd9dde3,
  [SURF.SEAFLOOR]: 0x9fb2b3,
  [SURF.ROAD]: 0x6b6e75,
  [SURF.SNOW]: 0xf2f6fb,
  [SURF.FIELD]: 0xe6c45a,
  [SURF.PLAZA]: 0xc9c2b4,
  [SURF.SWAMP]: 0x6f7f3e,
  [SURF.FOREST]: 0x5f9a42,
  [SURF.MUD]: 0x8a6a45,
  [SURF.ICE]: 0xa6dcef,
  [SURF.GLACIER]: 0x3cb9e6,
};

// Textur je Bodenart
const SURF_TX = {
  [SURF.SNOW]: TX.SNOW,
  [SURF.PATH]: TX.SNOW,
  [SURF.ICE]: TX.ICE,
  [SURF.GLACIER]: TX.ICE,
  [SURF.ROCK]: TX.ROCK,
  [SURF.PLAZA]: TX.TILE,
};

export function surfaceColor(s) {
  return SURF_COLORS[s] ?? 0xff00ff;
}

// Abdunklung je Vertex nahe am Boden stehender Collider (1 = keine)
function contactShade(map) {
  const t = map.terrain;
  const S = t.n + 1, cell = t.cell, half = t.half;
  const ao = new Float32Array(S * S).fill(1);
  const R = 1.6;
  for (const c of map.collision.cols) {
    const i0 = Math.max(0, Math.floor((c.minX - R + half) / cell)), i1 = Math.min(t.n, Math.ceil((c.maxX + R + half) / cell));
    const j0 = Math.max(0, Math.floor((c.minZ - R + half) / cell)), j1 = Math.min(t.n, Math.ceil((c.maxZ + R + half) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = -half + j * cell;
      for (let i = i0; i <= i1; i++) {
        const x = -half + i * cell;
        const idx = j * S + i;
        const g = t.h[idx];
        if (c.minY > g + 0.6 || c.maxY < g + 0.4) continue;
        let d;
        if (c.kind === 1) d = Math.hypot(x - c.x, z - c.z) - c.r;
        else {
          const px = x - c.x, pz = z - c.z;
          const lx = Math.abs(px * c.cos - pz * c.sin) - c.hx;
          const lz = Math.abs(px * c.sin + pz * c.cos) - c.hz;
          d = Math.hypot(Math.max(0, lx), Math.max(0, lz));
        }
        if (d >= R) continue;
        const k = 0.66 + 0.34 * (Math.max(0, d) / R) ** 0.7;
        if (k < ao[idx]) ao[idx] = k;
      }
    }
  }
  return ao;
}

export function buildTerrain(map, chunkCells = 48) {
  const t = map.terrain;
  const N = t.n, S = N + 1, cell = t.cell, half = t.half;
  const noise = new Noise2D(map.seed + 99);
  const ao = contactShade(map);
  // Vertexfarben vorberechnen (linear)
  const vc = new Float32Array(S * S * 3);
  const col = new THREE.Color();
  const tint = new THREE.Color();
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const idx = j * S + i;
      const s = t.surf[idx];
      const x = -half + i * cell, z = -half + j * cell;
      col.set(SURF_COLORS[s] ?? 0xff00ff);
      const h = t.h[idx];
      let br = 1 + noise.fbm(x / 14, z / 14, 2) * 0.08 + noise.noise(x / 3.5, z / 3.5) * 0.025;
      if (s === SURF.SEAFLOOR) br *= Math.max(0.45, 1 + h * 0.06);
      if (s === SURF.BEACH && h < 0.7) br *= 0.84 + Math.max(0, h) * 0.2; // nasser Sand an der Wasserlinie
      if (s === SURF.GRASS) {
        // leichte Farbverläufe im Gras
        const m = noise.noise(x / 25 + 5, z / 25) * 0.5 + 0.5;
        col.lerp(tint.set(0xa6d45e), m * 0.4);
      }
      if (s === SURF.SEAFLOOR) {
        // hellere Kiesbänke, dunklere Rinnen unter Wasser
        const m = noise.noise(x / 18, z / 18) * 0.5 + 0.5;
        col.lerp(tint.set(0x7f9aa0), m * 0.35);
      }
      if (s === SURF.SNOW) {
        // Schnee: kaum Helligkeitsrauschen, dafür leicht bläuliche Mulden
        br = 1 + noise.fbm(x / 22, z / 22, 2) * 0.035;
        const m = noise.noise(x / 30 + 9, z / 30) * 0.5 + 0.5;
        col.lerp(tint.set(0xdce8f5), m * 0.5);
      }
      if (s === SURF.GLACIER || s === SURF.ICE) {
        const m = noise.noise(x / 12 + 2, z / 12) * 0.5 + 0.5;
        col.lerp(tint.set(s === SURF.GLACIER ? 0x1f8cc8 : 0x7fc8e6), m * 0.55);
      }
      if (s === SURF.ROCK) {
        // Fels: je nach Lage mal grauer, mal bräunlicher
        br *= 0.92 + Math.min(0.12, h / 60);
        const m = noise.noise(x / 20 + 4, z / 20 + 1) * 0.5 + 0.5;
        col.lerp(tint.set(0x7b6a5c), m * 0.55);
      }
      if (s === SURF.FIELD) {
        // Ackerfurchen: helle und dunkle Streifen
        const k = Math.sin(x * 1.3) > 0 ? 1.05 : 0.88;
        br *= k;
      }
      if (s === SURF.FOREST || s === SURF.SWAMP) {
        const m = noise.noise(x / 9 + 3, z / 9) * 0.5 + 0.5;
        col.lerp(tint.set(s === SURF.SWAMP ? 0x4d5f2e : 0x4a8236), m * 0.5);
      }
      if (s === SURF.ROAD) br *= 0.97 + noise.noise(x / 2, z / 2) * 0.03;
      br *= ao[idx];
      vc[idx * 3] = col.r * br;
      vc[idx * 3 + 1] = col.g * br;
      vc[idx * 3 + 2] = col.b * br;
    }
  }
  // weiche Normalen aus dem Höhenfeld (für den Schnee)
  const nv = new Float32Array(S * S * 3);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const hx = t.h[j * S + Math.min(N, i + 1)] - t.h[j * S + Math.max(0, i - 1)];
      const hz = t.h[Math.min(N, j + 1) * S + i] - t.h[Math.max(0, j - 1) * S + i];
      const nx = -hx / (2 * cell), nz = -hz / (2 * cell);
      const l = Math.hypot(nx, 1, nz);
      const o = (j * S + i) * 3;
      nv[o] = nx / l; nv[o + 1] = 1 / l; nv[o + 2] = nz / l;
    }
  }
  const group = new THREE.Group();
  group.name = 'terrain';
  const mat = terrainMaterial();
  const chunks = Math.ceil(N / chunkCells);
  for (let cj = 0; cj < chunks; cj++) {
    for (let ci = 0; ci < chunks; ci++) {
      const i0 = ci * chunkCells, j0 = cj * chunkCells;
      const i1 = Math.min(N, i0 + chunkCells), j1 = Math.min(N, j0 + chunkCells);
      let maxH = -Infinity;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) maxH = Math.max(maxH, t.h[j * S + i]);
      if (maxH < -7) continue; // tiefes Meer: unsichtbar
      const tris = (i1 - i0) * (j1 - j0) * 2;
      const pos = new Float32Array(tris * 9);
      const cols = new Float32Array(tris * 9);
      const nrm = new Float32Array(tris * 9);
      const tex = new Uint8Array(tris * 3);
      let k = 0;
      const put = (ia, x, z) => {
        pos[k * 3] = x; pos[k * 3 + 1] = t.h[ia]; pos[k * 3 + 2] = z;
        nrm[k * 3] = nv[ia * 3]; nrm[k * 3 + 1] = nv[ia * 3 + 1]; nrm[k * 3 + 2] = nv[ia * 3 + 2];
        k++;
      };
      const addTri = (ia, ib, ic, xa, za, xb, zb, xc, zc, seed) => {
        const k0 = k;
        put(ia, xa, za); put(ib, xb, zb); put(ic, xc, zc);
        // Textur nach der Mehrheit der drei Ecken
        const sa = t.surf[ia], sb = t.surf[ib], sc = t.surf[ic];
        const s = sb === sc ? sb : sa;
        const tx = SURF_TX[s] ?? TX.GROUND;
        tex[k0] = tex[k0 + 1] = tex[k0 + 2] = tx;
        if ((tx === TX.SNOW || tx === TX.ICE) && sa === sb && sb === sc) {
          // reiner Schnee/reines Eis: Farben je Ecke (weiche Übergänge)
          for (const [q, ix] of [[k0, ia], [k0 + 1, ib], [k0 + 2, ic]]) for (let c = 0; c < 3; c++) cols[q * 3 + c] = vc[ix * 3 + c];
          return;
        }
        const v = 1 + (hash2(seed, ia, 3) - 0.5) * 0.07;
        for (let c = 0; c < 3; c++) {
          const r = ((vc[ia * 3 + c] + vc[ib * 3 + c] + vc[ic * 3 + c]) / 3) * v;
          cols[k0 * 3 + c] = cols[k0 * 3 + 3 + c] = cols[k0 * 3 + 6 + c] = r;
        }
      };
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const i00 = j * S + i, i10 = i00 + 1, i01 = i00 + S, i11 = i01 + 1;
          const x0 = -half + i * cell, z0 = -half + j * cell;
          const x1 = x0 + cell, z1 = z0 + cell;
          // gleiche Diagonale wie Physik: (i+1,j)-(i,j+1)
          addTri(i00, i01, i10, x0, z0, x0, z1, x1, z0, i * 7 + j);
          addTri(i11, i10, i01, x1, z1, x1, z0, x0, z1, i * 13 + j * 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('tex', new THREE.BufferAttribute(tex, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.castShadow = maxH > 4;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.userData.center = new THREE.Vector3((-half + (i0 + i1) / 2 * cell), 0, (-half + (j0 + j1) / 2 * cell));
      group.add(m);
    }
  }
  return { group, vertexColors: vc };
}

// Höhenfeld als Textur (für Wasser-Shader: Schaum am Strand, Tiefe)
export function heightTexture(map) {
  const t = map.terrain;
  const S = t.n + 1;
  const data = new Uint16Array(S * S);
  for (let i = 0; i < S * S; i++) data[i] = THREE.DataUtils.toHalfFloat(t.h[i]);
  const tex = new THREE.DataTexture(data, S, S, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
