// Instanzierte Grasbüschel rund um die Kamera (Dichte einstellbar), mit Wind im Vertex-Shader.
import * as THREE from 'three';
import { hash2 } from '/shared/rng.js';
import { SURF } from '/shared/map/terrain.js';

const MAX = 20000;
export const GRASS_LEVELS = {
  off: { r: 0, cell: 2 },
  low: { r: 38, cell: 1.6 },
  medium: { r: 55, cell: 1.3 },
  high: { r: 72, cell: 1.12 },
};

function tuftGeometry() {
  const pos = [];
  const blades = 5;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI + (i % 2) * 0.3;
    const w = 0.09;
    const h = 0.45 + (i % 3) * 0.12;
    const lean = 0.12 * (i % 2 ? 1 : -1);
    const cx = Math.cos(a) * w, cz = Math.sin(a) * w;
    const tx = Math.cos(a + 1.3) * lean, tz = Math.sin(a + 1.3) * lean;
    pos.push(-cx, 0, -cz, cx, 0, cz, tx, h, tz);
    pos.push(cx, 0, cz, -cx, 0, -cz, tx, h, tz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export class Grass {
  constructor(map) {
    this.map = map;
    this.time = { value: 0 };
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float sway = sin(uTime * 1.8 + ip.x * 0.21 + ip.z * 0.17) * 0.5 + sin(uTime * 3.1 + ip.x * 0.7) * 0.2;
          transformed.x += sway * 0.14 * position.y * 2.0;
          transformed.z += sway * 0.08 * position.y * 2.0;`);
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
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.c = new THREE.Color();
    this.cols = [new THREE.Color(0xd9b048), new THREE.Color(0xe6c35a), new THREE.Color(0xb9b848), new THREE.Color(0xc9a23e)];
  }

  update(camera, levelName, time) {
    this.time.value = time;
    const lv = GRASS_LEVELS[levelName] || GRASS_LEVELS.medium;
    const cx = camera.position.x, cz = camera.position.z;
    if (levelName !== this.level || Math.hypot(cx - this.lastX, cz - this.lastZ) > 7) {
      this.level = levelName;
      this.lastX = cx;
      this.lastZ = cz;
      this.rebuild(cx, cz, lv);
    }
  }

  rebuild(cx, cz, lv) {
    const t = this.map.terrain;
    const col = this.map.collision;
    if (lv.r === 0) { this.mesh.count = 0; return; }
    const cell = lv.cell;
    const r = lv.r;
    const i0 = Math.floor((cx - r) / cell), i1 = Math.floor((cx + r) / cell);
    const j0 = Math.floor((cz - r) / cell), j1 = Math.floor((cz + r) / cell);
    let n = 0;
    const m = this.m, q = this.q;
    const pos = new THREE.Vector3(), sc = new THREE.Vector3();
    const axis = new THREE.Vector3(0, 1, 0);
    const arr = this.mesh.instanceMatrix.array;
    const carr = this.mesh.instanceColor.array;
    for (let j = j0; j <= j1 && n < MAX; j++) {
      for (let i = i0; i <= i1 && n < MAX; i++) {
        const h1 = hash2(i, j, 17);
        const x = (i + hash2(i, j, 3)) * cell;
        const z = (j + hash2(i, j, 5)) * cell;
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r) continue;
        // am Rand ausdünnen
        if (d2 > r * r * 0.6 && h1 > 1 - (d2 / (r * r) - 0.6) * 2.5) continue;
        const s = t.surfaceAt(x, z);
        if (s !== SURF.GRASS && s !== SURF.DRYGRASS && !(s === SURF.DIRT && h1 < 0.25) && !(s === SURF.RIVER && h1 < 0.1)) continue;
        const y = t.heightAt(x, z);
        if (y < 0.4 || t.waterLevelAt(x, z) > y - 0.05) continue;
        if (col.groundAt(x, z, 0.05, y + 4) > y + 0.05) continue;
        const scale = 0.8 + hash2(i, j, 9) * 0.9;
        q.setFromAxisAngle(axis, hash2(i, j, 11) * 6.28);
        pos.set(x, y - 0.03, z);
        sc.set(scale, scale * (0.8 + hash2(i, j, 13) * 0.6), scale);
        m.compose(pos, q, sc);
        m.toArray(arr, n * 16);
        const c = this.cols[Math.floor(hash2(i, j, 21) * 4)];
        const b = 0.85 + hash2(i, j, 23) * 0.3;
        const green = s === SURF.GRASS ? 1 : 0;
        carr[n * 3] = c.r * b * (green ? 0.92 : 1);
        carr[n * 3 + 1] = c.g * b;
        carr[n * 3 + 2] = c.b * b * (green ? 0.9 : 1);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
