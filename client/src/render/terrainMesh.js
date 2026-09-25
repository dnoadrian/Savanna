// Terrain-Chunks mit Flat-Shading und Vertexfarben (Frustum-Culling pro Chunk).
import * as THREE from 'three';
import { SURF } from '/shared/map/terrain.js';
import { hash2 } from '/shared/rng.js';
import { Noise2D } from '/shared/noise.js';
import { worldMaterial } from './geom.js';

const SURF_COLORS = {
  [SURF.GRASS]: 0xb9bf4c,
  [SURF.DRYGRASS]: 0xe2b84e,
  [SURF.DIRT]: 0xc7683d,
  [SURF.SAND]: 0xe8cf92,
  [SURF.ROCK]: 0xa37c62,
  [SURF.BEACH]: 0xf3dfa6,
  [SURF.PATH]: 0xe0bf82,
  [SURF.SEAFLOOR]: 0xd9c48e,
  [SURF.RIVER]: 0xcdb58a,
};

export function surfaceColor(s) {
  return SURF_COLORS[s] ?? 0xff00ff;
}

export function buildTerrain(map, chunkCells = 36) {
  const t = map.terrain;
  const N = t.n, S = N + 1, cell = t.cell, half = t.half;
  const noise = new Noise2D(map.seed + 99);
  // Vertexfarben vorberechnen (linear)
  const vc = new Float32Array(S * S * 3);
  const col = new THREE.Color();
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const idx = j * S + i;
      const s = t.surf[idx];
      const x = -half + i * cell, z = -half + j * cell;
      col.set(SURF_COLORS[s] ?? 0xff00ff);
      const h = t.h[idx];
      let br = 1 + noise.fbm(x / 40, z / 40, 2) * 0.09;
      if (s === SURF.SEAFLOOR) br *= Math.max(0.45, 1 + h * 0.06);
      if (s === SURF.GRASS || s === SURF.DRYGRASS) {
        // leichte Farbverläufe zwischen Gold und Grün
        const m = noise.noise(x / 70 + 5, z / 70) * 0.5 + 0.5;
        col.lerp(new THREE.Color(s === SURF.GRASS ? 0xd8c050 : 0xcaa640), m * 0.35);
      }
      if (s === SURF.ROCK) br *= 0.95 + Math.min(0.15, h / 200);
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
      m.castShadow = maxH > 6;
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
