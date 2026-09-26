// 3D-Lobby vor transparentem Hintergrund (das blaue Streifen-Wallpaper liegt per CSS dahinter):
// eigene Figur mit goldener SCAR in der Mitte, Party links/rechts. Im Willkommens-Modus drehen
// sich stattdessen einige Waffen des Spiels als Schaukasten.
import * as THREE from 'three';
import { Character } from './characters.js';
import { weaponGeometry, itemMaterial } from './weapons.js';
import { handCode } from '../../shared/sim/simulation.js';

const SLOTS = [
  { x: 0, z: 0, ry: 0.5 },
  { x: -2.3, z: 0.9, ry: 0.3 },
  { x: 2.3, z: 0.9, ry: -0.3 },
  { x: -4.3, z: 2.1, ry: 0.45 },
];
const LOBBY_GUN = handCode({ k: 'w', w: 'ar', r: 4 });

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(160,225,255,0.9)');
  grd.addColorStop(0.45, 'rgba(90,180,255,0.35)');
  grd.addColorStop(1, 'rgba(60,140,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class LobbyScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 100);
    const hemi = new THREE.HemisphereLight(0xdcefff, 0x2a4fa8, 1.6);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    this.sun.position.set(-4, 8, 7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 30;
    this.scene.add(this.sun);
    const rim = new THREE.DirectionalLight(0x7fd4ff, 2.2);
    rim.position.set(5, 3, -6);
    this.scene.add(rim);
    this.buildStage();
    this.buildShowcase();
    this.chars = [];
    this.time = 0;
    this.mode = 'lobby';
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
  }

  // Boden: nur Schatten + hellblauer Lichtkreis unter den Füßen
  buildStage() {
    const tex = glowTexture();
    this.stage = new THREE.Group();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.ShadowMaterial({ opacity: 0.28 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.receiveShadow = true;
    this.stage.add(shadow);
    this.glows = [];
    for (const sl of SLOTS) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(sl.x, 0.01, sl.z);
      m.visible = false;
      this.stage.add(m);
      this.glows.push(m);
    }
    this.scene.add(this.stage);
  }

  // Willkommens-Bildschirm: schwebende Waffen
  buildShowcase() {
    this.showcase = new THREE.Group();
    const list = [['sniper', 4, 0.2, 1.75, -0.8], ['ar', 4, -0.1, 0.6, 0], ['pump', 3, 0.15, -0.5, 0.9], ['drum', 2, -0.05, -1.6, 1.6]];
    this.showItems = list.map(([type, r, x, y, ph]) => {
      const m = new THREE.Mesh(weaponGeometry(type, r, 1), itemMaterial());
      m.scale.setScalar(type === 'sniper' ? 2.5 : 2.9);
      m.position.set(x, y, 0);
      m.userData.ph = ph;
      m.userData.y = y;
      this.showcase.add(m);
      return m;
    });
    this.showcase.visible = false;
    this.scene.add(this.showcase);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // members: [{id, outfit, color, name, crown, crownStyle}]
  setMembers(members) {
    const key = JSON.stringify(members.map((m) => [m.id, m.outfit, m.color, m.crown, m.crownStyle]));
    if (key === this.key) return;
    this.key = key;
    for (const c of this.chars) {
      this.scene.remove(c.root);
      c.dispose();
    }
    this.chars = members.slice(0, 4).map((m, i) => {
      const c = new Character({ outfit: m.outfit, color: m.color, name: m.name, crown: m.crown, crownStyle: m.crownStyle });
      c.setHand(LOBBY_GUN);
      const sl = SLOTS[i];
      c.root.position.set(sl.x, 0, sl.z);
      c.baseYaw = Math.PI + sl.ry;
      c.slot = i;
      this.scene.add(c.root);
      return c;
    });
    this.glows.forEach((g, i) => { g.visible = i < this.chars.length; });
  }

  // Bildschirmposition über dem Kopf (für Namen/Bereit-Status)
  headScreen(i, w, h) {
    const c = this.chars[i];
    if (!c || this.mode !== 'lobby') return null;
    const v = new THREE.Vector3(c.root.position.x, c.root.position.y + 2.2, c.root.position.z).project(this.camera);
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    const welcome = this.mode === 'welcome';
    this.showcase.visible = welcome;
    this.stage.visible = !welcome;
    for (const c of this.chars) c.root.visible = !welcome;
    if (welcome) {
      // Kamera schaut auf den Waffen-Schaukasten, der rechts neben der Anmeldekarte steht
      const wide = this.camera.aspect > 1.2;
      this.camera.position.set(0, 0, 9);
      this.camera.lookAt(0, 0, 0);
      this.showcase.position.set(wide ? 2.6 * Math.min(1.6, this.camera.aspect / 1.2) : 0, wide ? 0 : -1.2, 0);
      for (const m of this.showItems) {
        const ph = m.userData.ph;
        m.rotation.set(0.12 + Math.sin(t * 0.7 + ph) * 0.06, t * 0.45 + ph, Math.sin(t * 0.5 + ph) * 0.05);
        m.position.y = m.userData.y + Math.sin(t * 1.1 + ph) * 0.08;
      }
    } else {
      // Figur leicht rechts der Mitte, damit links Platz für Party/Chat bleibt
      const sway = Math.sin(t * 0.25) * 0.15;
      this.camera.position.set(-0.9 + sway, 1.55, 8.4);
      this.camera.lookAt(-0.9, 1.05, 0);
    }
    this.chars.forEach((c, i) => {
      const look = Math.sin(t * 0.4 + i * 1.3) * 0.22;
      c.update(dt, { vx: 0, vz: 0, yaw: c.baseYaw + look, pitch: Math.sin(t * 0.3 + i) * 0.06, flags: 0 });
    });
  }
}
