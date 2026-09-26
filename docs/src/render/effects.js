// Effekte: Leuchtspur, Mündungsblitze, Einschlagpartikel je Material, Einschusslöcher (max. 100),
// Patronenhülsen, Heil-/Staub-/Wasserpartikel – alles instanziert und gepoolt.
import * as THREE from 'three';
import { MAT } from '../../shared/physics/collision.js';

const MAX_P = 700;
const MAX_TRACERS = 48;
const MAX_DECALS = 100;
const MAX_SHELLS = 40;
const MAX_FLASH = 16;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const Z = new THREE.Vector3(0, 0, 1);
const NEG_Z = new THREE.Vector3(0, 0, -1);
const _e = new THREE.Euler();

const MAT_COLORS = {
  [MAT.TERRAIN]: [0xd9b56a, 0xc28a55],
  [MAT.WOOD]: [0xc8935a, 0x8a5a32],
  [MAT.METAL]: [0xffe08a, 0xfff2c0],
  [MAT.STONE]: [0xb8aa98, 0x8f8578],
  [MAT.CLOTH]: [0xe8dcc0, 0xd0c0a0],
  [MAT.PLANT]: [0x7fae4a, 0x5f8a3a],
  [MAT.WATER]: [0xe8f8ff, 0x9fe0f0],
  [MAT.BONE]: [0xf2ead3, 0xd6c8a8],
  [MAT.PLAYER]: [0xffffff, 0xffe08a],
};

function decalTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(15,10,8,1)');
  grd.addColorStop(0.35, 'rgba(30,22,18,0.95)');
  grd.addColorStop(0.6, 'rgba(60,45,35,0.5)');
  grd.addColorStop(1, 'rgba(60,45,35,0)');
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 22 : 30;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // Partikel
    const pg = new THREE.TetrahedronGeometry(0.06, 0);
    this.pMesh = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), MAX_P);
    this.pMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_P * 3), 3);
    this.pMesh.frustumCulled = false;
    this.pMesh.count = 0;
    scene.add(this.pMesh);
    this.parts = [];
    for (let i = 0; i < MAX_P; i++) this.parts.push({ life: 0 });
    this.pNext = 0;
    // Leuchtende Partikel (Funken, Heilen) – additiv
    this.gMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 300);
    this.gMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(300 * 3), 3);
    this.gMesh.frustumCulled = false;
    this.gMesh.count = 0;
    scene.add(this.gMesh);
    this.glows = [];
    for (let i = 0; i < 300; i++) this.glows.push({ life: 0 });
    this.gNext = 0;
    // Leuchtspur
    const tg = new THREE.BoxGeometry(0.035, 0.035, 1);
    tg.translate(0, 0, -0.5);
    this.tMesh = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe28a, toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), MAX_TRACERS);
    this.tMesh.frustumCulled = false;
    this.tMesh.count = MAX_TRACERS;
    scene.add(this.tMesh);
    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      this.tracers.push({ life: 0 });
      this.tMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.tNext = 0;
    // Einschusslöcher
    const dg = new THREE.PlaneGeometry(0.16, 0.16);
    this.dMesh = new THREE.InstancedMesh(dg, new THREE.MeshLambertMaterial({ map: decalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), MAX_DECALS);
    this.dMesh.frustumCulled = false;
    this.dMesh.count = 0;
    this.dMesh.renderOrder = 2;
    scene.add(this.dMesh);
    this.dNext = 0;
    this.dCount = 0;
    // Hülsen
    const sg = new THREE.CylinderGeometry(0.008, 0.008, 0.045, 6);
    sg.rotateZ(Math.PI / 2);
    this.sMesh = new THREE.InstancedMesh(sg, new THREE.MeshLambertMaterial({ color: 0xe0b040, emissive: 0x3a2800 }), MAX_SHELLS);
    this.sMesh.frustumCulled = false;
    this.sMesh.count = MAX_SHELLS;
    scene.add(this.sMesh);
    this.shells = [];
    for (let i = 0; i < MAX_SHELLS; i++) {
      this.shells.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() });
      this.sMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.sNext = 0;
    // Mündungsblitze anderer Spieler
    const fgeo = new THREE.OctahedronGeometry(0.14, 0);
    fgeo.scale(1, 1, 2.2);
    this.fMesh = new THREE.InstancedMesh(fgeo, new THREE.MeshBasicMaterial({ color: 0xffc860, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAX_FLASH);
    this.fMesh.frustumCulled = false;
    this.fMesh.count = MAX_FLASH;
    scene.add(this.fMesh);
    this.flashes = [];
    for (let i = 0; i < MAX_FLASH; i++) {
      this.flashes.push({ life: 0 });
      this.fMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.fNext = 0;
    // Licht für eigenes Mündungsfeuer (fest in der Szene, damit keine Shader-Neukompilierung)
    this.muzzleLight = new THREE.PointLight(0xffc070, 0, 9, 2);
    scene.add(this.muzzleLight);
    this.muzzleLightT = 0;
    this.terrain = null;
  }

  setTerrain(t) {
    this.terrain = t;
  }

  spawn(x, y, z, vx, vy, vz, color, life = 0.6, size = 1, grav = 9.8) {
    const p = this.parts[this.pNext];
    this.pNext = (this.pNext + 1) % MAX_P;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.max = life; p.size = size; p.grav = grav;
    p.rx = Math.random() * 6; p.ry = Math.random() * 6;
    _c.set(color);
    p.r = _c.r; p.g = _c.g; p.b = _c.b;
  }

  glow(x, y, z, vx, vy, vz, color, life = 0.8, size = 1, grav = -0.5) {
    const p = this.glows[this.gNext];
    this.gNext = (this.gNext + 1) % this.glows.length;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.max = life; p.size = size; p.grav = grav;
    _c.set(color);
    p.r = _c.r; p.g = _c.g; p.b = _c.b;
  }

  // remote: Schuss eines anderen Spielers (Spur wird kurz vor der eigenen Kamera ausgeblendet)
  tracer(from, to, remote = false, width = 1, speed = 520) {
    const t = this.tracers[this.tNext];
    t.remote = remote;
    t.w = width;
    this.tNext = (this.tNext + 1) % MAX_TRACERS;
    t.from = from.clone();
    t.dir = to.clone().sub(from);
    t.dist = t.dir.length();
    t.dir.normalize();
    t.pos = 0;
    t.speed = speed;
    t.len = Math.min(5, t.dist * 0.3 + 1);
    t.life = t.dist / t.speed + 0.05;
  }

  muzzleFlash(pos, dir) {
    const f = this.flashes[this.fNext];
    this.fNext = (this.fNext + 1) % MAX_FLASH;
    f.pos = pos.clone();
    f.dir = dir.clone();
    f.life = 0.05;
  }

  ownMuzzleLight(pos) {
    this.muzzleLight.position.copy(pos);
    this.muzzleLight.intensity = 6;
    this.muzzleLightT = 0.05;
  }

  impact(pos, normal, mat) {
    const cols = MAT_COLORS[mat] || MAT_COLORS[MAT.TERRAIN];
    const n = normal || new THREE.Vector3(0, 1, 0);
    if (mat === MAT.METAL) {
      for (let i = 0; i < 9; i++) {
        this.glow(pos.x, pos.y, pos.z, n.x * 3 + (Math.random() - 0.5) * 6, n.y * 3 + Math.random() * 4, n.z * 3 + (Math.random() - 0.5) * 6, i % 2 ? 0xffd27a : 0xfff2c0, 0.25 + Math.random() * 0.2, 0.5, 12);
      }
    } else if (mat === MAT.WATER) {
      for (let i = 0; i < 14; i++) {
        this.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 2, cols[i % 2], 0.6, 1.2, 12);
      }
      return;
    }
    const count = mat === MAT.PLAYER ? 6 : 10;
    for (let i = 0; i < count; i++) {
      const s = mat === MAT.WOOD ? 1.3 : 1;
      this.spawn(pos.x + n.x * 0.05, pos.y + n.y * 0.05, pos.z + n.z * 0.05,
        n.x * 2.5 + (Math.random() - 0.5) * 3, n.y * 2.5 + Math.random() * 2.5, n.z * 2.5 + (Math.random() - 0.5) * 3,
        cols[i % 2], 0.4 + Math.random() * 0.4, s * (0.7 + Math.random() * 0.6), 10);
    }
    if (mat === MAT.TERRAIN || mat === MAT.STONE) {
      // Staubwolke
      for (let i = 0; i < 4; i++) this.spawn(pos.x, pos.y + 0.05, pos.z, (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, cols[0], 0.8, 2.4, -0.4);
    }
    if (mat !== MAT.PLAYER && mat !== MAT.PLANT && mat !== MAT.CLOTH) this.decal(pos, n);
  }

  blood(pos) {
    // stilisierte "Treffer-Funken" statt Blut
    for (let i = 0; i < 6; i++) this.glow(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3, i % 2 ? 0xffffff : 0x9fe8ff, 0.3, 0.7, 6);
  }

  decal(pos, n) {
    const i = this.dNext;
    this.dNext = (this.dNext + 1) % MAX_DECALS;
    this.dCount = Math.min(MAX_DECALS, this.dCount + 1);
    _q.setFromUnitVectors(Z, _v.set(n.x, n.y, n.z).normalize());
    const rot = new THREE.Quaternion().setFromAxisAngle(Z, Math.random() * 6.28);
    _q.multiply(rot);
    const s = 0.7 + Math.random() * 0.6;
    _m.compose(_v.set(pos.x + n.x * 0.015, pos.y + n.y * 0.015, pos.z + n.z * 0.015), _q, _s.set(s, s, s));
    this.dMesh.setMatrixAt(i, _m);
    this.dMesh.count = this.dCount;
    this.dMesh.instanceMatrix.needsUpdate = true;
  }

  shell(pos, dir, right, size = 1) {
    const s = this.shells[this.sNext];
    s.size = size;
    this.sNext = (this.sNext + 1) % MAX_SHELLS;
    s.p.copy(pos);
    s.v.copy(right).multiplyScalar(2.2 + Math.random()).addScaledVector(dir, -0.4).add(_v.set(0, 2 + Math.random(), 0));
    s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    s.w.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    s.life = 2.5;
    s.bounced = 0;
  }

  healBurst(pos) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.3 + Math.random() * 0.5;
      this.glow(pos.x + Math.cos(a) * r, pos.y + Math.random() * 1.6, pos.z + Math.sin(a) * r, 0, 0.8 + Math.random(), 0, i % 3 ? 0x5dff8a : 0xb8ffc8, 1.0 + Math.random() * 0.4, 1.2, -0.3);
    }
  }

  // Treffer auf Schild: blaue Funken
  shieldHit(pos) {
    for (let i = 0; i < 7; i++) this.glow(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 3.5, Math.random() * 2.5, (Math.random() - 0.5) * 3.5, i % 2 ? 0x6fd0ff : 0xd8f4ff, 0.32, 0.8, 5);
  }

  // Schild bricht: Splitter + Lichtring
  shieldBreak(pos) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 2.5 + Math.random() * 3;
      this.glow(pos.x, pos.y + Math.random() * 0.8, pos.z, Math.cos(a) * v, Math.random() * 3, Math.sin(a) * v, i % 3 ? 0x3fb4ff : 0xffffff, 0.45 + Math.random() * 0.3, 1.2, 6);
    }
    for (let i = 0; i < 10; i++) this.spawn(pos.x, pos.y + 0.4, pos.z, (Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5, 0x5ac8ff, 0.7, 1.6, 10);
  }

  // Truhe öffnet sich: goldene Funken
  chestBurst(pos) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.5;
      this.glow(pos.x + Math.cos(a) * r, pos.y + 0.5, pos.z + Math.sin(a) * r, Math.cos(a) * 1.4, 2 + Math.random() * 2.5, Math.sin(a) * 1.4, i % 3 ? 0xffd257 : 0xfff4c0, 0.8 + Math.random() * 0.5, 1.1, 3);
    }
  }

  // Siphon: grün/blaue Funken um den Spieler
  siphon(pos) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      this.glow(pos.x + Math.cos(a) * 0.6, pos.y + Math.random() * 1.8, pos.z + Math.sin(a) * 0.6, 0, 1 + Math.random(), 0, i % 2 ? 0x5dff8a : 0x6fd0ff, 0.9, 1.2, -0.3);
    }
  }

  // Rauch (Kamin): große, langsam steigende graue Partikel
  smoke(x, y, z) {
    this.spawn(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2, 0.35 + Math.random() * 0.2, 0.9 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2, Math.random() < 0.5 ? 0xe4e4e0 : 0xcfcfcb, 4.5, 7 + Math.random() * 3, -0.05);
  }

  dust(pos, amount = 3, color = 0xd9b56a) {
    for (let i = 0; i < amount; i++) this.spawn(pos.x + (Math.random() - 0.5) * 0.6, pos.y + 0.05, pos.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2, color, 0.7, 2.2, -0.2);
  }

  splash(pos, amount = 6) {
    for (let i = 0; i < amount; i++) this.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, i % 2 ? 0xe8f8ff : 0x9fe0f0, 0.5, 1.1, 12);
  }

  update(dt, camPos = null) {
    // Partikel
    let n = 0;
    const pm = this.pMesh;
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.grav > 0 && this.terrain) {
        const h = this.terrain.heightAt(p.x, p.z);
        if (p.y < h) { p.y = h; p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; }
      } else if (p.grav < 0) {
        p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
      }
      p.rx += dt * 5;
      const k = p.life / p.max;
      const sz = p.size * (p.grav < 0 ? (1.5 - k) * k * 2.2 : Math.min(1, k * 2));
      _q.setFromEuler(_e.set(p.rx, p.ry, 0));
      _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(sz, sz, sz));
      pm.setMatrixAt(n, _m);
      pm.instanceColor.setXYZ(n, p.r, p.g, p.b);
      n++;
    }
    pm.count = n;
    pm.instanceMatrix.needsUpdate = true;
    pm.instanceColor.needsUpdate = true;
    // Leuchtpartikel
    n = 0;
    const gm = this.gMesh;
    for (const p of this.glows) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.life / p.max;
      const sz = p.size * Math.min(1, k * 2.5);
      _m.compose(_v.set(p.x, p.y, p.z), _q.identity(), _s.set(sz, sz, sz));
      gm.setMatrixAt(n, _m);
      gm.instanceColor.setXYZ(n, p.r * k * 1.5, p.g * k * 1.5, p.b * k * 1.5);
      n++;
    }
    gm.count = n;
    gm.instanceMatrix.needsUpdate = true;
    gm.instanceColor.needsUpdate = true;
    // Leuchtspur
    for (let i = 0; i < MAX_TRACERS; i++) {
      const t = this.tracers[i];
      if (t.life <= 0) continue;
      t.life -= dt;
      t.pos += t.speed * dt;
      if (t.life <= 0 || t.pos - t.len > t.dist) {
        t.life = 0;
        this.tMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      const head = Math.min(t.dist, t.pos);
      const tail = Math.max(0, t.pos - t.len);
      const len = Math.max(0.01, head - tail);
      _v.copy(t.from).addScaledVector(t.dir, head);
      if (t.remote && camPos && _v.distanceToSquared(camPos) < 6.25) {
        this.tMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      _q.setFromUnitVectors(NEG_Z, t.dir);
      _m.compose(_v, _q, _s.set(t.w, t.w, len));
      this.tMesh.setMatrixAt(i, _m);
    }
    this.tMesh.instanceMatrix.needsUpdate = true;
    // Blitze
    for (let i = 0; i < MAX_FLASH; i++) {
      const f = this.flashes[i];
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        this.fMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      _q.setFromUnitVectors(Z, f.dir);
      const s = 0.8 + Math.random() * 0.5;
      _m.compose(f.pos, _q, _s.set(s, s, s));
      this.fMesh.setMatrixAt(i, _m);
    }
    this.fMesh.instanceMatrix.needsUpdate = true;
    // Hülsen
    for (let i = 0; i < MAX_SHELLS; i++) {
      const s = this.shells[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        this.sMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      s.v.y -= 9.8 * dt;
      s.p.addScaledVector(s.v, dt);
      if (this.terrain) {
        const h = this.terrain.heightAt(s.p.x, s.p.z) + 0.01;
        if (s.p.y < h) {
          s.p.y = h;
          s.v.y = Math.abs(s.v.y) * 0.35;
          s.v.x *= 0.5; s.v.z *= 0.5;
          s.w.multiplyScalar(0.5);
          s.bounced++;
          if (this.onShellBounce && s.bounced === 1) this.onShellBounce(s.p);
        }
      }
      s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt;
      _q.setFromEuler(s.r);
      _m.compose(s.p, _q, _s.set(s.size, s.size * 1.6 - 0.6, s.size * 1.6 - 0.6));
      this.sMesh.setMatrixAt(i, _m);
    }
    this.sMesh.instanceMatrix.needsUpdate = true;
    // Mündungslicht
    this.muzzleLightT -= dt;
    if (this.muzzleLightT <= 0) this.muzzleLight.intensity = 0;
  }

  clear() {
    for (const p of this.parts) p.life = 0;
    for (const p of this.glows) p.life = 0;
    this.dCount = 0;
    this.dMesh.count = 0;
    for (let i = 0; i < MAX_TRACERS; i++) { this.tracers[i].life = 0; this.tMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); }
    for (let i = 0; i < MAX_SHELLS; i++) { this.shells[i].life = 0; this.sMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); }
  }
}
