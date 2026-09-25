// Aufbau der statischen Welt: Terrain, Wasser, Strukturen + Deko als zusammengeführte
// Chunk-Meshes mit zwei LOD-Stufen, animierte Gruppen (Windräder) und instanziertes Gras.
import * as THREE from 'three';
import { GeoBuilder, worldMaterial, makeMatrix } from './geom.js';
import { propModel, LOD_SKIP } from './models.js';
import { PROP_TYPES } from '/shared/map/props.js';
import { buildTerrain, heightTexture } from './terrainMesh.js';
import { createWater, createPond } from './water.js';
import { Grass } from './grass.js';
import { C } from '/shared/map/builder.js';

const CHUNK = 90;
const EMISSIVE_COLORS = new Set([C.FIRE, C.FIRE2]);

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

export class WorldView {
  constructor(map) {
    this.map = map;
    this.group = new THREE.Group();
    this.group.name = 'world';
    this.chunks = [];
    this.anim = [];
    this.lodHi = 170;
    this.viewDist = 600;
  }

  async build(onProgress = () => {}) {
    const map = this.map;
    const terr = buildTerrain(map);
    this.terrain = terr.group;
    this.group.add(this.terrain);
    onProgress(0.1);
    await nextFrame();
    this.heightTex = heightTexture(map);
    this.water = createWater(this.heightTex, map.terrain.half, 0);
    this.group.add(this.water.mesh);
    this.ponds = map.ponds.map((p) => {
      const w = createPond(this.heightTex, map.terrain.half, p);
      this.group.add(w.mesh);
      return w;
    });
    onProgress(0.2);
    await nextFrame();

    // Parts + Props nach Chunks sortieren
    const half = map.terrain.half;
    const nC = Math.ceil((half * 2) / CHUNK);
    const buckets = new Map();
    const bucket = (x, z) => {
      const i = Math.max(0, Math.min(nC - 1, Math.floor((x + half) / CHUNK)));
      const j = Math.max(0, Math.min(nC - 1, Math.floor((z + half) / CHUNK)));
      const k = j * nC + i;
      let b = buckets.get(k);
      if (!b) buckets.set(k, (b = { i, j, parts: [], props: [] }));
      return b;
    };
    const animParts = new Map();
    for (const p of map.parts) {
      if (p.inv) continue;
      if (p.grp) {
        if (!animParts.has(p.grp)) animParts.set(p.grp, []);
        animParts.get(p.grp).push(p);
        continue;
      }
      bucket(p.x, p.z).parts.push(p);
    }
    for (const pr of map.props) bucket(pr.x, pr.z).props.push(pr);

    const mat = worldMaterial();
    const m4 = new THREE.Matrix4();
    let done = 0;
    const total = buckets.size;
    for (const b of buckets.values()) {
      const hi = new GeoBuilder();
      const lo = new GeoBuilder();
      for (const p of b.parts) {
        const e = EMISSIVE_COLORS.has(p.c) ? 1 : 0;
        const small = Math.max(p.w || 0, p.h || 0, p.d || 0, (p.r || 0) * 2) < 0.7 && !p.col;
        addPart(hi, p, e);
        if (!small) addPart(lo, p, e);
      }
      for (const pr of b.props) {
        makeMatrix(pr.x, pr.y, pr.z, 0, pr.ry, 0, pr.s, pr.s, pr.s, m4);
        hi.appendModel(propModel(pr.t, pr.v, 0), m4);
        if (!LOD_SKIP.has(PROP_TYPES[pr.t])) lo.appendModel(propModel(pr.t, pr.v, 1), m4);
      }
      if (hi.triCount === 0) continue;
      const mHi = new THREE.Mesh(hi.toGeometry(), mat);
      mHi.castShadow = true;
      mHi.receiveShadow = true;
      mHi.matrixAutoUpdate = false;
      const mLo = lo.triCount ? new THREE.Mesh(lo.toGeometry(), mat) : null;
      if (mLo) {
        mLo.castShadow = false;
        mLo.receiveShadow = true;
        mLo.matrixAutoUpdate = false;
        mLo.visible = false;
        this.group.add(mLo);
      }
      this.group.add(mHi);
      const cx = -half + (b.i + 0.5) * CHUNK, cz = -half + (b.j + 0.5) * CHUNK;
      this.chunks.push({ hi: mHi, lo: mLo, cx, cz, level: 0 });
      done++;
      if (done % 12 === 0) {
        onProgress(0.2 + 0.65 * (done / total));
        await nextFrame();
      }
    }

    // animierte Gruppen
    for (const [key, parts] of animParts) {
      const info = map.groups[key];
      if (!info) continue;
      const g = new GeoBuilder();
      for (const p of parts) addPart(g, { ...p, x: p.x - info.pivot.x, y: p.y - info.pivot.y, z: p.z - info.pivot.z }, 0);
      const geo = g.toGeometry();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      // Drehachse: lokale Achse um Gier gedreht
      const pivot = new THREE.Group();
      pivot.position.set(info.pivot.x, info.pivot.y, info.pivot.z);
      const inner = new THREE.Group();
      inner.rotation.y = info.ry;
      const spin = new THREE.Group();
      // Geometrie liegt in Weltorientierung -> in lokale Orientierung zurückdrehen
      mesh.rotation.y = -info.ry;
      spin.add(mesh);
      inner.add(spin);
      pivot.add(inner);
      this.group.add(pivot);
      this.anim.push({ spin, axis: info.axis, speed: info.speed, x: info.pivot.x, z: info.pivot.z });
    }
    onProgress(0.9);
    await nextFrame();
    this.grass = new Grass(map);
    this.group.add(this.grass.mesh);
    onProgress(1);
  }

  setViewDistance(d) {
    this.viewDist = d;
  }

  update(camera, dt, time, grassDensity) {
    const cx = camera.position.x, cz = camera.position.z;
    const hiD2 = this.lodHi * this.lodHi;
    const farD = this.viewDist + CHUNK;
    const farD2 = farD * farD;
    for (const c of this.chunks) {
      const dx = c.cx - cx, dz = c.cz - cz;
      const d2 = dx * dx + dz * dz;
      const level = d2 < hiD2 ? 0 : d2 < farD2 ? 1 : 2;
      if (level !== c.level) {
        c.level = level;
        c.hi.visible = level === 0 || (level === 1 && !c.lo);
        if (c.lo) c.lo.visible = level === 1;
      }
    }
    for (const t of this.terrain.children) {
      const dx = t.userData.center.x - cx, dz = t.userData.center.z - cz;
      t.visible = dx * dx + dz * dz < (farD + 100) * (farD + 100);
    }
    for (const a of this.anim) {
      const d = Math.hypot(a.x - cx, a.z - cz);
      if (d > 350) continue;
      if (a.axis === 'z') a.spin.rotation.z += dt * a.speed;
      else a.spin.rotation.x += dt * a.speed;
    }
    this.water.uniforms.uTime.value = time;
    for (const p of this.ponds) p.uniforms.uTime.value = time;
    if (this.grass) this.grass.update(camera, grassDensity, time);
  }

  setFog(color, near, far, storm = 0) {
    for (const w of [this.water, ...this.ponds]) {
      w.uniforms.uFogColor.value.copy(color);
      w.uniforms.uFogNear.value = near;
      w.uniforms.uFogFar.value = far;
      w.uniforms.uStorm.value = storm;
    }
  }

  setSun(dir) {
    for (const w of [this.water, ...this.ponds]) w.uniforms.uSunDir.value.copy(dir);
  }
}

export function addPart(g, p, e = 0) {
  const o = { rx: p.rx, ry: p.ry, rz: p.rz, e };
  switch (p.s) {
    case 'box': g.box(p.x, p.y, p.z, p.w, p.h, p.d, p.c, o); break;
    case 'cyl': g.cyl(p.x, p.y, p.z, p.r, p.h, p.c, { ...o, rt: p.rt, seg: p.seg }); break;
    case 'sph': g.ico(p.x, p.y, p.z, p.r, p.c, { ...o, sx: p.sx, sy: p.sy, sz: p.sz, detail: p.detail, jseed: Math.round(p.x * 3 + p.z) }); break;
    case 'prism': g.prism(p.x, p.y, p.z, p.w, p.h, p.d, p.c, o); break;
    default: break;
  }
}
