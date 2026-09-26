// Instanzierte Grasbüschel rund um die Kamera (Dichte einstellbar), mit Wind im Vertex-Shader.
// Das Gras wird in 12-m-Kacheln vorberechnet und gecacht, damit beim Laufen keine Ruckler entstehen.
import * as THREE from 'three';
import { hash2 } from '../../shared/rng.js';
import { SURF } from '../../shared/map/terrain.js';

const MAX = 32000;
const TILE = 12;
const CACHE_MAX = 400;

// kleine Insel: das Gras kann dicht stehen
export const GRASS_LEVELS = {
  off: { r: 0, cell: 2 },
  low: { r: 30, cell: 1.2 },
  medium: { r: 42, cell: 0.95 },
  high: { r: 56, cell: 0.8 },
};

// Büschel aus einseitigen Halmen; Normalen zeigen nach oben (gleichmäßig hell von beiden Seiten),
// Vertexfarbe von dunkler Basis zur hellen Spitze.
function tuftGeometry() {
  const pos = [];
  const col = [];
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + (i % 2) * 0.4;
    const r = 0.05 + (i % 3) * 0.03;
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const w = 0.06;
    const h = 0.3 + ((i * 5) % 7) * 0.035;
    const lean = 0.14 + (i % 3) * 0.04;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const tx = ox + Math.cos(a) * lean, tz = oz + Math.sin(a) * lean;
    pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, tx, h, tz);
    col.push(0.55, 0.55, 0.5, 0.55, 0.55, 0.5, 1.15, 1.15, 1.08);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

export class Grass {
  constructor(map) {
    this.map = map;
    this.time = { value: 0 };
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float sway = sin(uTime * 1.8 + ip.x * 0.21 + ip.z * 0.17) * 0.5 + sin(uTime * 3.1 + ip.x * 0.7) * 0.2;
          float gust = sin(uTime * 0.6 + ip.x * 0.05 - ip.z * 0.03) * 0.5 + 0.5;
          transformed.x += sway * (0.1 + gust * 0.12) * position.y * 2.0;
          transformed.z += sway * (0.06 + gust * 0.06) * position.y * 2.0;`);
    };
    mat.customProgramCacheKey = () => 'grassMat';
    this.mesh = new THREE.InstancedMesh(tuftGeometry(), mat, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'grass';
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.lastX = 1e9;
    this.lastZ = 1e9;
    this.level = null;
    this.tiles = new Map();
    // grüne Wiese, trockenes Gras (golden) und Getreide
    this.cols = [new THREE.Color(0x6fb33f), new THREE.Color(0x7fc44b), new THREE.Color(0x5ea63a), new THREE.Color(0x8fc653)];
    this.dryCols = [new THREE.Color(0xd9b048), new THREE.Color(0xe6c35a), new THREE.Color(0xb9b848), new THREE.Color(0xc9a23e)];
    this.fieldCol = new THREE.Color(0xe8c04e);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.tiles.clear();
  }

  update(camera, levelName, time) {
    this.time.value = time;
    const lv = GRASS_LEVELS[levelName] || GRASS_LEVELS.medium;
    const cx = camera.position.x, cz = camera.position.z;
    if (levelName !== this.level) {
      this.tiles.clear();
      this.level = levelName;
      this.lastX = 1e9;
    }
    if (Math.hypot(cx - this.lastX, cz - this.lastZ) > 5) {
      this.lastX = cx;
      this.lastZ = cz;
      this.rebuild(cx, cz, lv);
    }
  }

  // Kachel berechnen: Float32Array mit [x,y,z, rot, sx, sy, r,g,b] je Büschel
  tile(ti, tj, lv) {
    const key = ti * 10007 + tj;
    let t = this.tiles.get(key);
    if (t) {
      t.used = performance.now();
      return t;
    }
    const terrain = this.map.terrain;
    const col = this.map.collision;
    const cell = lv.cell;
    const out = [];
    const i0 = Math.floor((ti * TILE) / cell), i1 = Math.floor(((ti + 1) * TILE) / cell) - 1;
    const j0 = Math.floor((tj * TILE) / cell), j1 = Math.floor(((tj + 1) * TILE) / cell) - 1;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const h1 = hash2(i, j, 17);
        const x = (i + hash2(i, j, 3)) * cell;
        const z = (j + hash2(i, j, 5)) * cell;
        const s = terrain.surfaceAt(x, z);
        const field = s === SURF.FIELD;
        if (s !== SURF.GRASS && s !== SURF.DRYGRASS && s !== SURF.FOREST && !field && !(s === SURF.SWAMP && h1 < 0.5) && !(s === SURF.DIRT && h1 < 0.25)) continue;
        const y = terrain.heightAt(x, z);
        if (y < 0.4 || terrain.waterLevelAt(x, z) > y - 0.05) continue;
        if (col.groundAt(x, z, 0.05, y + 4) > y + 0.05) continue;
        const scale = (0.7 + hash2(i, j, 9) * 0.6) * (field ? 1.5 : 1);
        const pal = s === SURF.DRYGRASS || s === SURF.DIRT ? this.dryCols : this.cols;
        const c = field ? this.fieldCol : pal[Math.floor(hash2(i, j, 21) * 4)];
        const b = 0.85 + hash2(i, j, 23) * 0.3;
        const green = s === SURF.GRASS || s === SURF.FOREST;
        out.push(x, y - 0.03, z, hash2(i, j, 11) * 6.28, scale, scale * (0.8 + hash2(i, j, 13) * 0.6) * (field ? 1.8 : 1), c.r * b * (green ? 0.92 : 1), c.g * b, c.b * b * (green ? 0.9 : 1), h1);
      }
    }
    t = { data: new Float32Array(out), used: performance.now() };
    this.tiles.set(key, t);
    if (this.tiles.size > CACHE_MAX) {
      // älteste Kacheln verwerfen
      const arr = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
      for (let k = 0; k < arr.length - CACHE_MAX + 50; k++) this.tiles.delete(arr[k][0]);
    }
    return t;
  }

  rebuild(cx, cz, lv) {
    if (lv.r === 0) {
      this.mesh.count = 0;
      return;
    }
    const r = lv.r;
    const r2 = r * r;
    const arr = this.mesh.instanceMatrix.array;
    const carr = this.mesh.instanceColor.array;
    const ti0 = Math.floor((cx - r) / TILE), ti1 = Math.floor((cx + r) / TILE);
    const tj0 = Math.floor((cz - r) / TILE), tj1 = Math.floor((cz + r) / TILE);
    let n = 0;
    for (let tj = tj0; tj <= tj1 && n < MAX; tj++) {
      for (let ti = ti0; ti <= ti1 && n < MAX; ti++) {
        // Kachel komplett außerhalb?
        const nx = Math.max(ti * TILE, Math.min(cx, (ti + 1) * TILE));
        const nz = Math.max(tj * TILE, Math.min(cz, (tj + 1) * TILE));
        if ((nx - cx) ** 2 + (nz - cz) ** 2 > r2) continue;
        const d = this.tile(ti, tj, lv).data;
        for (let k = 0; k < d.length && n < MAX; k += 10) {
          const dx = d[k] - cx, dz = d[k + 2] - cz;
          const dd = dx * dx + dz * dz;
          if (dd > r2) continue;
          // am Rand ausdünnen
          if (dd > r2 * 0.6 && d[k + 9] > 1 - (dd / r2 - 0.6) * 2.5) continue;
          const rot = d[k + 3], sx = d[k + 4], sy = d[k + 5];
          const c = Math.cos(rot), s = Math.sin(rot);
          const o = n * 16;
          arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -s * sx; arr[o + 3] = 0;
          arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
          arr[o + 8] = s * sx; arr[o + 9] = 0; arr[o + 10] = c * sx; arr[o + 11] = 0;
          arr[o + 12] = d[k]; arr[o + 13] = d[k + 1]; arr[o + 14] = d[k + 2]; arr[o + 15] = 1;
          carr[n * 3] = d[k + 6];
          carr[n * 3 + 1] = d[k + 7];
          carr[n * 3 + 2] = d[k + 8];
          n++;
        }
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
