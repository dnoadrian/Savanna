// Aufbau der statischen Welt: Terrain, Wasser, Strukturen + Deko als zusammengeführte
// Chunk-Meshes mit zwei LOD-Stufen, animierte Gruppen, instanziertes Gras und Schilder.
import * as THREE from 'three';
import { GeoBuilder, worldMaterial, makeMatrix } from './geom.js';
import { propModel, LOD_SKIP } from './models.js';
import { PROP_TYPES } from '../../shared/map/props.js';
import { buildTerrain, heightTexture } from './terrainMesh.js';
import { createWater } from './water.js';
import { Grass } from './grass.js';
import { C, TX } from '../../shared/map/builder.js';
import { MAT } from '../../shared/physics/collision.js';

const CHUNK = 32;
const EMISSIVE_COLORS = new Set([C.FIRE, C.FIRE2, C.LAMP, C.SLURP, C.NEON]);

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

export class WorldView {
  constructor(map) {
    this.map = map;
    this.group = new THREE.Group();
    this.group.name = 'world';
    this.chunks = [];
    this.anim = [];
    this.lodHi = 80;
    this.viewDist = 400;
  }

  async build(onProgress = () => {}) {
    const map = this.map;
    const terr = buildTerrain(map);
    this.terrain = terr.group;
    this.group.add(this.terrain);
    onProgress(0.1);
    await nextFrame();
    this.heightTex = heightTexture(map);
    // Meer bis zum Horizont (die Insel liegt mitten im offenen Wasser)
    this.water = createWater(this.heightTex, map.terrain.half, 0, 2600, 320);
    this.group.add(this.water.mesh);
    for (const sg of map.signs) this.group.add(buildSign(sg));
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
      if (done % 6 === 0) {
        onProgress(0.2 + 0.65 * (done / total));
        await nextFrame();
      }
    }

    // animierte Gruppen
    for (const [key, parts] of animParts) {
      const info = map.groups[key];
      if (!info) continue;
      const g = new GeoBuilder();
      for (const p of parts) addPart(g, { ...p, x: p.x - info.pivot.x, y: p.y - info.pivot.y, z: p.z - info.pivot.z, tx: TX.NONE }, 0);
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

  // Speicher freigeben, wenn die Karte nicht mehr gebraucht wird
  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.name === 'sign' && o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    if (this.heightTex) this.heightTex.dispose();
    if (this.water && this.water.mesh.material) this.water.mesh.material.dispose();
    if (this.grass && this.grass.dispose) this.grass.dispose();
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
      if (a.axis === 'z') a.spin.rotation.z += dt * a.speed;
      else a.spin.rotation.x += dt * a.speed;
    }
    this.water.uniforms.uTime.value = time;
    if (this.grass) this.grass.update(camera, grassDensity, time);
  }

  setFog(color, near, far, storm = 0) {
    const u = this.water.uniforms;
    u.uFogColor.value.copy(color);
    u.uFogNear.value = near;
    u.uFogFar.value = far;
    u.uStorm.value = storm;
  }

  setSun(dir) {
    this.water.uniforms.uSunDir.value.copy(dir);
  }
}

// Holzschild mit Schriftzug (Canvas-Textur), Vorderseite zeigt in Blickrichtung ry
function buildSign(sg) {
  const c = document.createElement('canvas');
  const ratio = sg.w / sg.h;
  c.height = 128;
  c.width = Math.min(1024, Math.round(128 * ratio));
  const g = c.getContext('2d');
  g.fillStyle = sg.bg;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 8;
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  for (let y = 22; y < c.height; y += 30) {
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, y, c.width, 3);
  }
  g.fillStyle = sg.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 92;
  g.font = `${size}px "Luckiest Guy", Georgia, serif`;
  while (g.measureText(sg.text).width > c.width * 0.9 && size > 20) {
    size -= 4;
    g.font = `${size}px "Luckiest Guy", Georgia, serif`;
  }
  g.fillText(sg.text, c.width / 2, c.height / 2 + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, sg.h), new THREE.MeshLambertMaterial({ map: tex }));
  mesh.position.set(sg.x, sg.y, sg.z);
  mesh.rotation.y = sg.ry;
  mesh.name = 'sign';
  return mesh;
}

// Textur eines Parts: ausdrücklich angegeben, sonst nach Material (nur feste Bauteile)
function partTexture(p, e) {
  if (e) return TX.NONE;
  if (p.tx !== undefined) return p.tx;
  if (!p.col && p.s !== 'slab') return TX.NONE;
  switch (p.m) {
    case MAT.STONE: return p.s === 'slab' || p.s === 'sph' ? TX.ROCK : TX.STONE;
    case MAT.METAL: return TX.METAL;
    case MAT.WOOD: return TX.WOOD;
    default: return TX.NONE;
  }
}

export function addPart(g, p, e = 0) {
  const o = { rx: p.rx, ry: p.ry, rz: p.rz, e, tx: partTexture(p, e) };
  switch (p.s) {
    case 'box': g.box(p.x, p.y, p.z, p.w, p.h, p.d, p.c, o); break;
    case 'cyl': g.cyl(p.x, p.y, p.z, p.r, p.h, p.c, { ...o, rt: p.rt, seg: p.seg }); break;
    case 'sph': g.ico(p.x, p.y, p.z, p.r, p.c, { ...o, sx: p.sx, sy: p.sy, sz: p.sz, detail: p.detail, jseed: Math.round(p.x * 3 + p.z) }); break;
    case 'prism': g.prism(p.x, p.y, p.z, p.w, p.h, p.d, p.c, o); break;
    case 'slab': g.slab(p.x, p.y, p.z, p.w, p.h, p.d, p.c, { ry: p.ry, taper: p.taper, tx: o.tx }); break;
    default: break;
  }
}
