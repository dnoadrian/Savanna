// Terrain-Chunks mit Flat-Shading und Vertexfarben (Frustum-Culling pro Chunk).
// Am Fuß von Wänden, Felsen und Stämmen wird der Boden leicht abgedunkelt (Kontaktschatten).
import * as THREE from 'three';
import { SURF } from '../../shared/map/terrain.js';
import { hash2 } from '../../shared/rng.js';
import { Noise2D } from '../../shared/noise.js';
import { worldMaterial } from './geom.js';

const SURF_COLORS = {
  [SURF.GRASS]: 0xb9bf4c,
  [SURF.DRYGRASS]: 0xe2b84e,
  [SURF.DIRT]: 0xc7683d,
  [SURF.ROCK]: 0xa37c62,
  [SURF.BEACH]: 0xf3dfa6,
  [SURF.PATH]: 0xe0bf82,
  [SURF.SEAFLOOR]: 0xd9c48e,
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
      if (s === SURF.GRASS || s === SURF.DRYGRASS) {
        // leichte Farbverläufe zwischen Gold und Grün
        const m = noise.noise(x / 25 + 5, z / 25) * 0.5 + 0.5;
        col.lerp(tint.set(s === SURF.GRASS ? 0xd8c050 : 0xcaa640), m * 0.35);
      }
      if (s === SURF.ROCK) br *= 0.95 + Math.min(0.15, h / 40);
      br *= ao[idx];
      vc[idx * 3] = col.r * br;
      vc[idx * 3 + 1] = col.g * br;
      vc[idx * 3 + 2] = col.b * br;
    }
  }
  const group = new THREE.Group();
  group.name = 'terrain';
  const mat = worldMaterial();
  const chunks = Math.ceil(N / chunkCells);
  for (let cj = 0; cj < chunks; cj++) {
    for (let ci = 0; ci < chunks; ci++) {
      const i0 = ci * chunkCells, j0 = cj * chunkCells;
      const i1 = Math.min(N, i0 + chunkCells), j1 = Math.min(N, j0 + chunkCells);
      let maxH = -Infinity;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) maxH = Math.max(maxH, t.h[j * S + i]);
      if (maxH < -7) continue; // tiefes Meer: unsichtbar
      const pos = [];
      const cols = [];
      const addTri = (a, b, c, ia, ib, ic, seed) => {
        pos.push(...a, ...b, ...c);
        const v = 1 + (hash2(seed, ia, 3) - 0.5) * 0.07;
        for (let k = 0; k < 3; k++) {
          const r = (vc[ia * 3 + k] + vc[ib * 3 + k] + vc[ic * 3 + k]) / 3 * v;
          cols.push(r);
        }
        cols.push(...cols.slice(-3), ...cols.slice(-3));
      };
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const i00 = j * S + i, i10 = i00 + 1, i01 = i00 + S, i11 = i01 + 1;
          const x0 = -half + i * cell, z0 = -half + j * cell;
          const x1 = x0 + cell, z1 = z0 + cell;
          const p00 = [x0, t.h[i00], z0], p10 = [x1, t.h[i10], z0], p01 = [x0, t.h[i01], z1], p11 = [x1, t.h[i11], z1];
          // gleiche Diagonale wie Physik: (i+1,j)-(i,j+1)
          addTri(p00, p01, p10, i00, i01, i10, i * 7 + j);
          addTri(p11, p10, p01, i11, i10, i01, i * 13 + j * 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
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
