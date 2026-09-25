// 3D-Lobby: Figur auf runder Plattform vor Savannen-Sonnenuntergang, Party links/rechts.
// Wird auch als animierter Hintergrund des Willkommens-Screens (Kamerafahrt) verwendet.
import * as THREE from 'three';
import { Sky } from './sky.js';
import { GeoBuilder, worldMaterial, makeMatrix } from './geom.js';
import { propModel } from './models.js';
import { PT } from '../../shared/map/props.js';
import { Character } from './characters.js';
import { RNG } from '../../shared/rng.js';

const SLOTS = [
  { x: 0, z: 0, ry: 0 },
  { x: -2.3, z: 0.9, ry: 0.3 },
  { x: 2.3, z: 0.9, ry: -0.3 },
  { x: -4.3, z: 2.1, ry: 0.45 },
];

export class LobbyScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xf2a86a, 60, 420);
    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 900);
    this.sky = new Sky({ top: 0x3d4fa8, horizon: 0xffa35c, bottom: 0xf2a86a, sun: 0xffe0a0, clouds: 16, seed: 5 });
    this.sky.setSun(new THREE.Vector3(-0.2, 0.08, -1));
    this.sky.clouds.material.emissive.set(0xffb07a);
    this.sky.clouds.material.emissiveIntensity = 0.55;
    this.scene.add(this.sky.group);
    const hemi = new THREE.HemisphereLight(0xffd6b0, 0x8a5a3a, 1.35);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffc890, 2.6);
    this.sun.position.set(-6, 8, -10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 40;
    this.scene.add(this.sun);
    const rim = new THREE.DirectionalLight(0xb8d0ff, 1.5);
    rim.position.set(6, 4, 8);
    this.scene.add(rim);
    this.buildEnvironment();
    this.chars = [];
    this.time = 0;
    this.mode = 'lobby';
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
  }

  buildEnvironment() {
    const rng = new RNG(1234);
    const g = new GeoBuilder();
    // Boden
    for (let i = 0; i < 400; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 6 + Math.sqrt(rng.next()) * 300;
      const s = rng.range(6, 18);
      g.ico(Math.cos(a) * r, -s * 0.9, Math.sin(a) * r, s, rng.chance(0.5) ? 0xd9a441 : 0xc98a3a, { sy: 0.12, jitter: 0.2, jseed: i });
    }
    g.cyl(0, -0.6, 0, 600, 1, 0xcf9440, { seg: 24 });
    // Plattform
    g.cyl(0, 0.15, 0, 3.4, 0.3, 0x5a3a2a, { seg: 24 });
    g.cyl(0, 0.32, 0, 3.2, 0.06, 0xf2c230, { seg: 24, e: 0.35 });
    g.cyl(0, 0.36, 0, 3.0, 0.04, 0x3d2a1f, { seg: 24 });
    g.cyl(-3.1, 0.12, 1.6, 1.4, 0.24, 0x5a3a2a, { seg: 16 });
    g.cyl(3.1, 0.12, 1.6, 1.4, 0.24, 0x5a3a2a, { seg: 16 });
    g.cyl(-4.6, 0.1, 2.6, 1.1, 0.2, 0x5a3a2a, { seg: 14 });
    this.ground = new THREE.Mesh(g.toGeometry(), worldMaterial());
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    // Akazien & Baobabs als Silhouetten
    const trees = new GeoBuilder();
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 70; i++) {
      const a = rng.range(-Math.PI * 0.95, Math.PI * 0.95) - Math.PI / 2;
      const r = rng.range(25, 220);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > -10 && Math.abs(x) < 20) continue;
      const s = rng.range(1.0, 2.2);
      makeMatrix(x, -0.3, z, 0, rng.next() * 6, 0, s, s, s, m4);
      trees.appendModel(propModel(rng.chance(0.85) ? PT.acacia : PT.baobab, rng.int(0, 2), 0), m4);
    }
    for (let i = 0; i < 60; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = rng.range(8, 60);
      makeMatrix(Math.cos(a) * r, 0, Math.sin(a) * r, 0, rng.next() * 6, 0, 1.2, 1.2, 1.2, m4);
      trees.appendModel(propModel(rng.chance(0.7) ? PT.tallgrass : PT.bush, rng.int(0, 2), 0), m4);
    }
    this.trees = new THREE.Mesh(trees.toGeometry(), worldMaterial());
    this.trees.castShadow = true;
    this.scene.add(this.trees);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // members: [{id, outfit, color, skin, name, crown, crownStyle}]
  setMembers(members) {
    const key = JSON.stringify(members.map((m) => [m.id, m.outfit, m.color, m.skin, m.crown, m.crownStyle]));
    if (key === this.key) return;
    this.key = key;
    for (const c of this.chars) {
      this.scene.remove(c.root);
      c.dispose();
    }
    this.chars = members.slice(0, 4).map((m, i) => {
      const c = new Character({ outfit: m.outfit, color: m.color, skin: m.skin, name: m.name, crown: m.crown, crownStyle: m.crownStyle });
      const sl = SLOTS[i];
      c.root.position.set(sl.x, sl.x === 0 && sl.z === 0 ? 0.39 : 0.24, sl.z);
      c.baseYaw = Math.PI + sl.ry;
      c.slot = i;
      this.scene.add(c.root);
      return c;
    });
  }

  // Bildschirmposition über dem Kopf (für Namen/Bereit-Status)
  headScreen(i, w, h) {
    const c = this.chars[i];
    if (!c) return null;
    const v = new THREE.Vector3(c.root.position.x, c.root.position.y + 2.35, c.root.position.z).project(this.camera);
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    if (this.mode === 'welcome') {
      // langsame Kamerafahrt durch die Savanne
      const a = t * 0.05;
      this.camera.position.set(Math.sin(a) * 26, 5 + Math.sin(t * 0.2) * 1.5, Math.cos(a) * 26 - 10);
      this.camera.lookAt(Math.sin(a + 0.8) * 40, 4, -60);
    } else {
      const sway = Math.sin(t * 0.25) * 0.3;
      this.camera.position.set(0.6 + sway, 1.85, 9.6);
      this.camera.lookAt(0.1, 1.35, 0);
    }
    this.chars.forEach((c, i) => {
      const look = Math.sin(t * 0.4 + i * 1.3) * 0.25;
      c.update(dt, { vx: 0, vz: 0, yaw: c.baseYaw + look, pitch: Math.sin(t * 0.3 + i) * 0.08, flags: 0 });
    });
    this.sky.update(this.camera, dt);
  }
}
