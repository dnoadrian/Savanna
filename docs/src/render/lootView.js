// Darstellung der Beute: Truhen (goldenes Leuchten, Deckel springt beim Öffnen auf) und
// Gegenstände am Boden (schweben, drehen sich, Lichtsäule in Seltenheitsfarbe, fliegen beim
// Erscheinen im Bogen aus der Truhe bzw. vom Spieler).
import * as THREE from 'three';
import { chestGeometry, itemGeometry, itemMaterial, AMMO_COLORS } from './weapons.js';
import { RARITY_COLORS, itemRarity } from '../../shared/items.js';

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

// Lichtsäule: unten hell, nach oben ausblendend
function beamGeometry() {
  const geo = new THREE.CylinderGeometry(0.22, 0.3, 1.7, 10, 1, true);
  geo.translate(0, 0.85, 0);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - pos.getY(i) / 1.7;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function itemKey(it) {
  return it.k === 'w' ? `w${it.w}${it.r}` : it.k === 'c' ? `c${it.c}${it.n}` : `a${it.a}${it.n}`;
}

export class LootView {
  constructor(scene, loot) {
    this.group = new THREE.Group();
    this.group.name = 'loot';
    scene.add(this.group);
    this.loot = loot;
    this.beamGeo = beamGeometry();
    this.beamMats = new Map();
    this.pickups = new Map();
    this.chests = new Map();
    this.spawnFrom = new Map();
    this.highlight = null;
    for (const c of loot.chests) this.addChest(c);
  }

  beamMat(color) {
    let m = this.beamMats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      this.beamMats.set(color, m);
    }
    return m;
  }

  addChest(c) {
    const root = new THREE.Group();
    root.position.set(c.x, c.y, c.z);
    // Front zeigt in Blickrichtung ry (−Z lokal)
    root.rotation.y = c.ry;
    const body = new THREE.Mesh(chestGeometry('body'), itemMaterial());
    body.castShadow = true;
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.6, 0.33);
    const lid = new THREE.Mesh(chestGeometry('lid'), itemMaterial());
    lid.position.set(0, 0, -0.33);
    lid.castShadow = true;
    lidPivot.add(lid);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd257, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.set(2.6, 2.0, 1);
    glow.position.set(0, 0.55, 0);
    root.add(body, lidPivot, glow);
    this.group.add(root);
    this.chests.set(c.id, { c, root, lidPivot, glow, openT: c.open ? 1 : 0 });
  }

  // Beim Erscheinen aus Truhe/Spieler herausfliegen
  spawnArc(id, fx, fy, fz) {
    this.spawnFrom.set(id, { fx, fy, fz, t: 0 });
  }

  addPickup(pk) {
    const it = pk.item;
    const color = it.k === 'a' ? AMMO_COLORS[it.a] : new THREE.Color(RARITY_COLORS[itemRarity(it)]).getHex();
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(itemGeometry(it, 0), itemMaterial());
    const s = it.k === 'w' ? 1.5 : it.k === 'c' ? 2.2 : 1.1;
    mesh.scale.setScalar(s);
    if (it.k === 'w') mesh.rotation.z = Math.PI / 2 * 0.12;
    root.add(mesh);
    let beam = null;
    if (it.k !== 'a') {
      beam = new THREE.Mesh(this.beamGeo, this.beamMat(color));
      root.add(beam);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.set(1.3, 0.6, 1);
    glow.position.y = 0.08;
    root.add(glow);
    root.position.set(pk.x, pk.y, pk.z);
    this.group.add(root);
    this.pickups.set(pk.id, { root, mesh, key: itemKey(it), phase: (pk.id * 1.7) % 6.28, x: pk.x, y: pk.y, z: pk.z });
  }

  removePickup(id) {
    const v = this.pickups.get(id);
    if (!v) return;
    this.group.remove(v.root);
    this.pickups.delete(id);
  }

  update(dt, time, target, cam = null) {
    const loot = this.loot;
    const far2 = 75 * 75;
    // Bodenbeute abgleichen
    for (const [id, v] of this.pickups) {
      const pk = loot.pickups.get(id);
      if (!pk || itemKey(pk.item) !== v.key) this.removePickup(id);
    }
    for (const pk of loot.pickups.values()) if (!this.pickups.has(pk.id)) this.addPickup(pk);
    for (const [id, v] of this.pickups) {
      // weit entfernte Beute nicht zeichnen (spart Draw-Calls)
      if (cam && !this.spawnFrom.has(id)) {
        const dx = v.x - cam.x, dz = v.z - cam.z;
        v.root.visible = dx * dx + dz * dz < far2;
        if (!v.root.visible) continue;
      }
      let x = v.x, y = v.y, z = v.z;
      const arc = this.spawnFrom.get(id);
      if (arc) {
        arc.t += dt / 0.55;
        const k = Math.min(1, arc.t);
        x = arc.fx + (v.x - arc.fx) * k;
        z = arc.fz + (v.z - arc.fz) * k;
        y = arc.fy + (v.y - arc.fy) * k + Math.sin(k * Math.PI) * 1.1;
        if (k >= 1) this.spawnFrom.delete(id);
      }
      v.root.position.set(x, y + 0.22 + Math.sin(time * 2.2 + v.phase) * 0.06, z);
      v.mesh.rotation.y = time * 1.2 + v.phase;
      const hl = target && target.kind === 'l' && target.id === id;
      v.mesh.scale.setScalar((hl ? 1.18 : 1) * (v.key[0] === 'w' ? 1.5 : v.key[0] === 'c' ? 2.2 : 1.1));
    }
    // Truhen
    for (const v of this.chests.values()) {
      if (cam) {
        const dx = v.c.x - cam.x, dz = v.c.z - cam.z;
        v.root.visible = dx * dx + dz * dz < far2 * 1.5;
        if (!v.root.visible) continue;
      }
      if (v.c.open && v.openT < 1) v.openT = Math.min(1, v.openT + dt * 3.2);
      const a = v.openT;
      v.lidPivot.rotation.x = -1.9 * (1 - Math.pow(1 - a, 3)) - (a > 0 && a < 1 ? Math.sin(a * Math.PI) * 0.2 : 0);
      v.glow.material.opacity = v.c.open ? Math.max(0, 0.55 * (1 - a * 1.4)) : 0.42 + Math.sin(time * 3 + v.c.id) * 0.13;
      const hl = target && target.kind === 'c' && target.id === v.c.id;
      v.glow.scale.set(hl ? 3.2 : 2.6, hl ? 2.4 : 2.0, 1);
    }
  }

  dispose() {
    this.group.parent && this.group.parent.remove(this.group);
    for (const m of this.beamMats.values()) m.dispose();
    this.beamGeo.dispose();
  }
}
