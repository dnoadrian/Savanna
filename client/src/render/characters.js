// Stilisierte Low-Poly-Figuren mit Outfits, prozeduralen Animationen (Idle, Laufen, Sprinten,
// Schleichen, Sliden, Schießen, Nachladen, Schild/Medikit benutzen, Tod) und Krone für den Sieger.
// In der Hand: die gerade gewählte Waffe (Seltenheitsfarbe) oder ein Heil-/Schild-Gegenstand.
import * as THREE from 'three';
import { GeoBuilder, flatMaterial } from './geom.js';
import { weaponGeometry, consumableGeometry, itemMaterial } from './weapons.js';
import { decodeHand } from '../../shared/sim/simulation.js';
import { OUTFIT_COLORS, F } from '../../shared/constants.js';
import { hashString } from '../../shared/rng.js';

export const SKIN_TONES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xd9a066];

let _mat = null;
function charMat() {
  if (!_mat) _mat = flatMaterial();
  return _mat;
}

const V_UP = new THREE.Vector3(0, -1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _a1 = new THREE.Vector3();
const _a2 = new THREE.Vector3();
const _a3 = new THREE.Vector3();
const _a4 = new THREE.Vector3();

function mk(g, shadow = true) {
  const m = new THREE.Mesh(g.toGeometry(), charMat());
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}

function darker(c, f = 0.7) {
  const col = new THREE.Color(c);
  col.multiplyScalar(f);
  return col.getHex();
}

// ---------------- Outfits ----------------
function outfitDef(outfit, primary) {
  switch (outfit) {
    case 'cowboy': return { shirt: primary, shirt2: darker(primary, 0.6), pants: 0x3a5a8c, shoes: 0x5a3820, glove: null, belt: 0x5a3820, buckle: 0xf2c230, hatTop: 0.34 };
    case 'ranger': return { shirt: 0xc9ab70, shirt2: 0xb09058, pants: 0xa08a5c, shoes: 0x5a4430, glove: null, belt: 0x4a3a28, buckle: 0x999999, shorts: true, sock: 0xe8e0d0, hatTop: 0.3 };
    case 'ninja': return { shirt: 0x23262e, shirt2: 0x1a1c22, pants: 0x23262e, shoes: 0x111111, glove: 0x111111, belt: primary, buckle: primary, hatTop: 0.1 };
    case 'soldier': return { shirt: 0x5b6b3a, shirt2: 0x4a5a30, pants: 0x4d5832, shoes: 0x2b2b2b, glove: 0x3a3a2a, belt: 0x3d4a2a, buckle: 0x777777, hatTop: 0.2 };
    case 'dancer': return { shirt: primary, shirt2: 0xffd23f, pants: 0x1f1f2a, shoes: 0xffffff, glove: 0xffffff, belt: 0xffd23f, buckle: 0xffffff, hatTop: 0.3 };
    case 'pirate': return { shirt: 0xf5efe0, shirt2: 0xc03030, pants: 0x3a2a1a, shoes: 0x1a1a1a, glove: null, belt: primary, buckle: 0xf2c230, hatTop: 0.3 };
    case 'chef': return { shirt: 0xfafafa, shirt2: 0xdddddd, pants: 0x3a3a3a, shoes: 0x1a1a1a, glove: null, belt: 0xfafafa, buckle: primary, hatTop: 0.46 };
    case 'astronaut': return { shirt: 0xf2f2f2, shirt2: primary, pants: 0xf2f2f2, shoes: 0x9a9aa8, glove: 0xd8d8e0, belt: 0x9a9aa8, buckle: primary, hatTop: 0.34 };
    // Standard ohne Skin: schlichtes Shirt in der gewählten Farbe, dunkle Hose
    case 'recruit': return { shirt: primary, shirt2: darker(primary, 0.7), pants: 0x3a3f4a, shoes: 0x23262b, glove: null, belt: 0x2b2b2b, buckle: 0x9aa0a8, hatTop: 0.14 };
    default: return outfitDef('recruit', primary);
  }
}

function buildTorso(o, def, primary) {
  const g = new GeoBuilder();
  // Becken
  g.box(0, 0.0, 0, 0.46, 0.18, 0.27, def.pants);
  g.box(0, 0.1, 0, 0.48, 0.06, 0.29, def.belt);
  g.box(0, 0.1, -0.15, 0.1, 0.07, 0.02, def.buckle, { e: o === 'dancer' ? 0.3 : 0 });
  // Oberkörper
  g.box(0, 0.36, 0, 0.5, 0.46, 0.28, def.shirt);
  g.box(0, 0.58, 0, 0.44, 0.06, 0.26, def.shirt);
  switch (o) {
    case 'cowboy':
      for (const y of [0.2, 0.34, 0.48]) g.box(0, y, -0.142, 0.5, 0.035, 0.01, def.shirt2);
      for (const x of [-0.12, 0.05, 0.18]) g.box(x, 0.36, -0.143, 0.035, 0.46, 0.01, def.shirt2);
      g.box(0, 0.58, -0.1, 0.3, 0.1, 0.12, 0xc0392b, { rx: 0.3 });
      g.box(0, 0.5, -0.15, 0.12, 0.12, 0.03, 0xc0392b, { rz: 0.78 });
      break;
    case 'ranger':
      g.box(0.12, 0.44, -0.145, 0.12, 0.1, 0.02, def.shirt2);
      g.box(-0.12, 0.44, -0.145, 0.12, 0.1, 0.02, def.shirt2);
      g.box(0, 0.6, -0.08, 0.36, 0.08, 0.16, primary);
      g.box(0, 0.35, 0.2, 0.36, 0.4, 0.14, 0x7a6a45);
      g.box(0, 0.58, 0.2, 0.3, 0.06, 0.16, 0x6a5a38);
      break;
    case 'ninja':
      g.box(0, 0.38, -0.143, 0.08, 0.4, 0.01, def.shirt2, { rz: 0.4 });
      g.box(0, 0.12, 0, 0.5, 0.08, 0.3, primary);
      g.box(0.1, 0.35, 0.16, 0.06, 0.6, 0.04, 0x8a6a3a, { rz: 0.6 });
      break;
    case 'soldier':
      g.box(0, 0.36, 0, 0.54, 0.4, 0.33, 0x3d4a2a);
      for (const x of [-0.15, 0, 0.15]) g.box(x, 0.28, -0.175, 0.11, 0.12, 0.04, 0x55652f);
      g.box(0, 0.38, 0.19, 0.36, 0.34, 0.1, 0x3d4a2a);
      break;
    case 'dancer':
      for (let i = 0; i < 6; i++) g.box(-0.2 + i * 0.08, 0.36, -0.143, 0.03, 0.46, 0.01, i % 2 ? def.shirt2 : 0xffffff, { e: 0.25 });
      g.box(0, 0.6, -0.1, 0.46, 0.06, 0.1, def.shirt2, { e: 0.3 });
      break;
    case 'pirate':
      for (const y of [0.18, 0.3, 0.42, 0.54]) g.box(0, y, 0, 0.505, 0.05, 0.285, def.shirt2);
      g.box(0, 0.14, 0, 0.52, 0.1, 0.3, primary);
      g.box(0.2, 0.05, -0.12, 0.08, 0.2, 0.06, primary, { rz: -0.3 });
      g.box(0.05, 0.36, -0.15, 0.06, 0.52, 0.02, 0x5a3820, { rz: 0.6 });
      break;
    case 'chef':
      for (const y of [0.24, 0.36, 0.48]) {
        g.box(0.08, y, -0.145, 0.04, 0.04, 0.01, 0x333333);
        g.box(-0.08, y, -0.145, 0.04, 0.04, 0.01, 0x333333);
      }
      g.box(0, 0.6, -0.1, 0.3, 0.08, 0.12, primary);
      g.box(0, 0.52, -0.15, 0.1, 0.1, 0.03, primary, { rz: 0.78 });
      g.box(0, 0.1, -0.12, 0.42, 0.25, 0.06, 0xffffff);
      break;
    case 'astronaut':
      g.box(0, 0.36, -0.143, 0.5, 0.06, 0.01, primary);
      g.box(0.1, 0.45, -0.145, 0.14, 0.1, 0.02, 0x3a7bd5, { e: 0.3 });
      g.box(-0.1, 0.45, -0.145, 0.06, 0.06, 0.02, 0xe63946, { e: 0.4 });
      g.box(0, 0.38, 0.22, 0.42, 0.5, 0.18, 0xdadada);
      g.box(0, 0.5, 0.31, 0.3, 0.1, 0.02, primary);
      break;
    default: break;
  }
  return g;
}

function buildHead(o, def, skin, primary, seed) {
  const g = new GeoBuilder();
  const hair = [0x3b2a1a, 0x1a1a1a, 0x8b5a2b, 0xd9a441, 0x6b3a1a][seed % 5];
  // Hals + Kopf
  g.box(0, 0.03, 0, 0.14, 0.08, 0.14, skin);
  g.box(0, 0.19, 0, 0.34, 0.34, 0.33, skin);
  // Gesicht
  const eye = (x) => {
    g.box(x, 0.21, -0.166, 0.07, 0.07, 0.01, 0xffffff);
    g.box(x, 0.205, -0.17, 0.035, 0.045, 0.01, 0x1b1b1b);
  };
  if (o !== 'astronaut') {
    eye(0.08);
    eye(-0.08);
    g.box(0, 0.15, -0.172, 0.05, 0.05, 0.03, darker(skin, 0.88));
    g.box(0, 0.095, -0.167, 0.1, 0.025, 0.01, 0x7a3a2a);
  }
  switch (o) {
    case 'cowboy':
      g.box(0, 0.35, 0, 0.35, 0.05, 0.34, hair);
      g.cyl(0, 0.37, 0, 0.36, 0.035, 0x7a4e2a, { seg: 12 });
      g.cyl(0, 0.48, 0, 0.19, 0.2, 0x8a5a32, { seg: 8, rt: 0.16 });
      g.box(0, 0.4, 0, 0.39, 0.04, 0.39, 0x3a2412);
      break;
    case 'ranger':
      g.ico(0, 0.36, 0, 0.23, 0xe8dcc0, { sy: 0.75, detail: 1, jitter: 0 });
      g.cyl(0, 0.34, 0, 0.3, 0.03, 0xe0d0b0, { seg: 12 });
      g.box(0, 0.34, 0, 0.36, 0.04, 0.35, primary);
      break;
    case 'ninja':
      g.box(0, 0.23, 0, 0.36, 0.36, 0.35, 0x23262e);
      g.box(0, 0.21, -0.176, 0.3, 0.08, 0.01, skin);
      g.box(0.08, 0.21, -0.181, 0.035, 0.045, 0.01, 0x1b1b1b);
      g.box(-0.08, 0.21, -0.181, 0.035, 0.045, 0.01, 0x1b1b1b);
      g.box(0, 0.29, 0, 0.37, 0.05, 0.36, primary);
      g.box(0.05, 0.25, 0.26, 0.05, 0.03, 0.22, primary, { rx: 0.5 });
      g.box(-0.05, 0.22, 0.25, 0.05, 0.03, 0.2, primary, { rx: 0.8 });
      break;
    case 'soldier':
      g.ico(0, 0.33, 0, 0.23, 0x55652f, { sy: 0.7, sx: 1.05, detail: 1, jitter: 0 });
      g.cyl(0, 0.3, 0, 0.25, 0.05, 0x4a5a2a, { seg: 10 });
      g.box(0, 0.12, -0.14, 0.3, 0.03, 0.06, 0x3a3a2a);
      break;
    case 'dancer':
      g.ico(0, 0.36, 0.03, 0.3, primary === 0x222831 ? 0x9b5de5 : darker(primary, 0.8), { detail: 1, jitter: 0.1 });
      g.box(0, 0.22, -0.18, 0.3, 0.07, 0.02, 0x111111);
      g.box(0.075, 0.22, -0.186, 0.1, 0.06, 0.01, 0x3a7bd5, { e: 0.3 });
      g.box(-0.075, 0.22, -0.186, 0.1, 0.06, 0.01, 0xe63946, { e: 0.3 });
      break;
    case 'pirate':
      g.box(0, 0.35, 0, 0.35, 0.05, 0.34, hair);
      g.prism(0, 0.43, 0, 0.5, 0.18, 0.42, 0x1a1a1a, { ry: Math.PI / 2 });
      g.prism(0, 0.43, 0.02, 0.44, 0.16, 0.5, 0x1a1a1a);
      g.box(0, 0.36, -0.2, 0.44, 0.03, 0.02, 0xf2c230);
      g.box(0.08, 0.21, -0.176, 0.09, 0.08, 0.01, 0x111111);
      g.box(0, 0.26, -0.172, 0.34, 0.015, 0.01, 0x111111, { rz: -0.3 });
      g.box(0, 0.06, -0.17, 0.2, 0.06, 0.02, hair);
      break;
    case 'chef':
      g.box(0, 0.35, 0, 0.35, 0.04, 0.34, hair);
      g.cyl(0, 0.46, 0, 0.19, 0.2, 0xffffff, { seg: 10 });
      g.ico(0, 0.62, 0, 0.23, 0xffffff, { sy: 0.7, detail: 1, jitter: 0.1 });
      g.box(0, 0.12, -0.175, 0.14, 0.03, 0.01, hair);
      break;
    case 'astronaut':
      g.ico(0, 0.2, 0, 0.3, 0xf2f2f2, { detail: 1, jitter: 0 });
      g.box(0, 0.21, -0.2, 0.34, 0.22, 0.12, 0x7fc8ff, { e: 0.35 });
      g.box(0, 0.36, -0.12, 0.2, 0.04, 0.1, primary);
      g.cyl(0.24, 0.3, 0.05, 0.02, 0.2, 0x999999, { seg: 4 });
      break;
    default: break;
  }
  return g;
}

function limb(len, w, d, color, endColor = null, endLen = 0, endOff = 0) {
  const g = new GeoBuilder();
  g.box(0, -len / 2, 0, w, len, d, color);
  if (endColor) g.box(0, -len - endLen / 2 + 0.02, endOff, w * 1.05, endLen, d + Math.abs(endOff) * 2, endColor);
  return g;
}

function buildCrownGeo(style) {
  const g = new GeoBuilder();
  const st = {
    gold: { base: 0xf2c230, gem: 0xe63946 },
    ruby: { base: 0xf2b830, gem: 0xff2255 },
    emerald: { base: 0xd8d8d8, gem: 0x2ecc71 },
    diamond: { base: 0xe8f4ff, gem: 0x7fdbff },
  }[style] || { base: 0xf2c230, gem: 0xe63946 };
  g.cyl(0, 0.04, 0, 0.17, 0.08, st.base, { seg: 10, e: 0.5 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.cyl(Math.cos(a) * 0.15, 0.13, Math.sin(a) * 0.15, 0.045, 0.12, st.base, { rt: 0.0, seg: 4, e: 0.5 });
    g.ico(Math.cos(a) * 0.17, 0.04, Math.sin(a) * 0.17, 0.028, st.gem, { e: 0.9, jitter: 0 });
    g.ico(Math.cos(a) * 0.15, 0.2, Math.sin(a) * 0.15, 0.022, st.gem, { e: 0.9, jitter: 0 });
  }
  return g;
}

let crownMat = null;
const glowMats = {};
function crownGlowMat(style) {
  if (glowMats[style]) return glowMats[style];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const col = { gold: 0xffd23f, ruby: 0xff4466, emerald: 0x4dff9a, diamond: 0x9fe8ff }[style] || 0xffd23f;
  glowMats[style] = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 });
  return glowMats[style];
}
export function createCrownMesh(style = 'gold') {
  crownMat = crownMat || new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x8a6200, emissiveIntensity: 0.9 });
  const m = new THREE.Mesh(buildCrownGeo(style).toGeometry(), crownMat);
  m.castShadow = false;
  // größer + Leuchten, damit man die Krone auch aus der Entfernung sieht
  m.scale.setScalar(1.45);
  const glow = new THREE.Sprite(crownGlowMat(style));
  glow.scale.set(0.95, 0.75, 1);
  glow.position.y = 0.1;
  m.add(glow);
  return m;
}

// Medkit-Modell (für Heilanimation)
// ---------------- Figur ----------------
export class Character {
  constructor(opts = {}) {
    this.opts = { ...opts };
    this.root = new THREE.Group();
    this.fall = new THREE.Group();
    this.root.add(this.fall);
    this.hips = new THREE.Group();
    this.fall.add(this.hips);
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.62, 0);
    this.torso.add(this.head);
    this.legs = [];
    this.arms = [];
    this.phase = 0;
    this.time = Math.random() * 10;
    this.speed = 0;
    this.crouchK = 0;
    this.slideK = 0;
    this.adsK = 0;
    this.sprintK = 0;
    this.airK = 0;
    this.useK = 0;
    this.hand = null;
    this.recoil = 0;
    this.reloadT = -1;
    this.dead = false;
    this.deathT = 0;
    this.build();
  }

  build() {
    const { outfit = 'recruit', color = 0, name = '' } = this.opts;
    const seed = hashString(name || 'x');
    const primary = new THREE.Color(OUTFIT_COLORS[color % OUTFIT_COLORS.length]).getHex();
    const skinTone = this.opts.skinTone ?? SKIN_TONES[seed % SKIN_TONES.length];
    const def = outfitDef(outfit, primary);
    this.def = def;
    for (const c of [...this.torso.children]) if (c !== this.head) this.torso.remove(c);
    this.head.clear();
    for (const l of this.legs) this.hips.remove(l.upper);
    this.legs = [];
    this.arms = [];

    this.torsoMesh = mk(buildTorso(outfit, def, primary));
    this.torso.add(this.torsoMesh);
    this.headMesh = mk(buildHead(outfit, def, skinTone, primary, seed));
    this.head.add(this.headMesh);
    // Beine
    const sleeve = outfit === 'ranger' ? def.shirt : def.shirt;
    for (const side of [-1, 1]) {
      const upper = new THREE.Group();
      upper.position.set(side * 0.12, 0, 0);
      const ug = limb(0.46, 0.18, 0.19, def.pants);
      if (def.shorts) {
        ug.pos.length = 0; ug.col.length = 0; ug.emi.length = 0;
        ug.box(0, -0.13, 0, 0.19, 0.26, 0.2, def.pants);
        ug.box(0, -0.36, 0, 0.14, 0.2, 0.15, skinTone);
      }
      upper.add(mk(ug));
      const knee = new THREE.Group();
      knee.position.set(0, -0.46, 0);
      const lg = new GeoBuilder();
      lg.box(0, -0.2, 0, 0.16, 0.4, 0.17, def.shorts ? def.sock : def.pants);
      lg.box(0, -0.43, -0.04, 0.17, 0.1, 0.27, def.shoes);
      if (outfit === 'cowboy' || outfit === 'pirate' || outfit === 'soldier') lg.box(0, -0.3, 0, 0.18, 0.2, 0.19, def.shoes);
      knee.add(mk(lg));
      upper.add(knee);
      this.hips.add(upper);
      this.legs.push({ upper, knee, side });
    }
    // Arme (IK-gesteuert, Kinder des Oberkörpers)
    for (const side of [-1, 1]) {
      const upper = new THREE.Group();
      upper.position.set(side * 0.31, 0.54, 0);
      upper.add(mk(limb(0.29, 0.13, 0.13, sleeve)));
      const lower = new THREE.Group();
      const lgb = new GeoBuilder();
      lgb.box(0, -0.13, 0, 0.115, 0.26, 0.115, outfit === 'ranger' ? skinTone : sleeve);
      lgb.box(0, -0.3, 0, 0.1, 0.1, 0.11, def.glove ?? skinTone);
      lower.add(mk(lgb));
      this.torso.add(upper);
      this.torso.add(lower);
      this.arms.push({ upper, lower, side, shoulder: new THREE.Vector3(side * 0.31, 0.54, 0) });
    }
    // Gegenstand in der Hand
    if (this.gun) this.torso.remove(this.gun);
    this.gun = new THREE.Mesh(weaponGeometry('ar', this.opts.rarity ?? 4, 0), itemMaterial());
    this.gun.scale.setScalar(1.15);
    this.gun.castShadow = true;
    this.torso.add(this.gun);
    if (this.medkit) this.torso.remove(this.medkit);
    this.medkit = new THREE.Mesh(consumableGeometry('medkit'), itemMaterial());
    this.medkit.scale.setScalar(1.3);
    this.medkit.visible = false;
    this.torso.add(this.medkit);
    this.handCode = null;
    this.setCrown(this.opts.crown ? this.opts.crownStyle || 'gold' : null);
  }

  setCrown(style) {
    if (this.crown) {
      this.head.remove(this.crown);
      this.crown = null;
    }
    if (!style) return;
    this.crown = createCrownMesh(style);
    this.crown.position.set(0, (this.def.hatTop ?? 0.3) + 0.14, 0);
    this.head.add(this.crown);
  }

  // Waffe/Gegenstand in der Hand (Code aus dem Snapshot)
  setHand(code) {
    if (code === this.handCode) return;
    this.handCode = code;
    const it = decodeHand(code);
    this.hand = it;
    if (it && it.k === 'w') {
      this.gun.geometry = weaponGeometry(it.w, it.r, 0);
      this.gun.visible = true;
      this.medkit.visible = false;
    } else {
      this.gun.visible = false;
      if (it) this.medkit.geometry = consumableGeometry(it.c);
    }
  }

  // ---------- Animation ----------
  // st: { vx, vz, yaw, pitch, flags }
  update(dt, st) {
    this.time += dt;
    const t = this.time;
    const flags = st.flags || 0;
    if (flags & F.DEAD) {
      if (!this.dead) this.die(st.killDir ?? 0);
      this.updateDeath(dt);
      return;
    }
    if (this.dead) this.revive();
    const cos = Math.cos(st.yaw), sin = Math.sin(st.yaw);
    const fwdV = -(st.vx || 0) * sin - (st.vz || 0) * cos;
    const sideV = (st.vx || 0) * cos - (st.vz || 0) * sin;
    const speed = Math.hypot(st.vx || 0, st.vz || 0);
    this.speed += (speed - this.speed) * Math.min(1, dt * 10);
    const k = (target, cur, rate) => cur + (target - cur) * Math.min(1, dt * rate);
    this.crouchK = k(flags & F.CROUCH ? 1 : 0, this.crouchK, 10);
    this.slideK = k(flags & F.SLIDE ? 1 : 0, this.slideK, 12);
    this.adsK = k(flags & F.ADS ? 1 : 0, this.adsK, 12);
    this.sprintK = k(flags & F.SPRINT ? 1 : 0, this.sprintK, 8);
    this.airK = k(flags & F.AIR ? 1 : 0, this.airK, 8);
    this.useK = k(flags & F.USING ? 1 : 0, this.useK, 10);
    // Duo: niedergeschlagen – auf dem Bauch kriechen
    this.knockK = k(flags & F.KNOCKED ? 1 : 0, this.knockK || 0, 6);
    if (st.hand !== undefined) this.setHand(st.hand);
    if (flags & F.RELOAD) {
      if (this.reloadT < 0) this.reloadT = 0;
      this.reloadT += dt / 2.1;
      if (this.reloadT > 1) this.reloadT = 1;
    } else this.reloadT = -1;
    if (flags & F.FIRING) this.recoil = Math.min(1, this.recoil + dt * 20);
    this.recoil = Math.max(0, this.recoil - dt * 8);

    this.root.rotation.y = st.yaw;
    const moving = this.speed > 0.4;
    const dir = fwdV < -0.3 ? -1 : 1;
    this.phase += dt * this.speed * (this.sprintK > 0.5 ? 1.35 : 1.7) * dir * (1 - this.slideK);
    const swingAmp = Math.min(1, this.speed / 5) * (0.55 + this.sprintK * 0.35) * (1 - this.crouchK * 0.45) * (1 - this.airK);
    const ph = this.phase;

    // Hüfte
    const bob = moving ? Math.abs(Math.sin(ph)) * 0.05 * (1 - this.crouchK) : Math.sin(t * 2) * 0.006;
    this.hips.position.y = 0.94 - this.crouchK * 0.36 - this.slideK * 0.52 + bob;
    // seitliches Laufen: Hüfte dreht in Laufrichtung
    const strafe = speed > 0.5 ? Math.atan2(sideV, Math.abs(fwdV) + 0.001) * 0.6 * (1 - this.slideK) : 0;
    this.hips.rotation.y = k(-strafe * (fwdV < -0.3 ? -1 : 1), this.hips.rotation.y, 8);
    this.torso.rotation.y = -this.hips.rotation.y;
    const lean = -this.sprintK * 0.22 + this.slideK * 0.45 - this.crouchK * 0.15 + (st.pitch || 0) * 0.25 * (1 - this.slideK);
    this.torso.rotation.x = lean;
    this.torso.scale.y = 1 + Math.sin(t * 2.2) * 0.008;
    this.head.rotation.x = (st.pitch || 0) * 0.45 - lean * 0.5;

    // Beine
    for (const L of this.legs) {
      const s = L.side;
      const sw = Math.sin(ph + (s > 0 ? 0 : Math.PI)) * swingAmp;
      let up = -sw * 0.9;
      let kn = Math.max(0, Math.sin(ph + (s > 0 ? 0 : Math.PI) - 1.2)) * swingAmp * 1.3 + 0.05;
      // Hocken
      up = up * (1 - this.crouchK) + (-1.05 + sw * 0.35) * this.crouchK;
      kn = kn * (1 - this.crouchK) + (1.75 + Math.max(0, sw) * 0.3) * this.crouchK;
      // Luft
      up = up * (1 - this.airK) + (-0.55 + (s > 0 ? 0.25 : -0.1)) * this.airK;
      kn = kn * (1 - this.airK) + 0.9 * this.airK;
      // Slide: ein Bein vorne, eines untergeschlagen
      up = up * (1 - this.slideK) + (s > 0 ? -1.45 : -0.55) * this.slideK;
      kn = kn * (1 - this.slideK) + (s > 0 ? 0.15 : 1.9) * this.slideK;
      L.upper.rotation.x = up;
      L.knee.rotation.x = kn;
      L.upper.rotation.z = s * 0.03;
    }

    // Waffenhaltung
    const gp = this.gun.position;
    const gr = this.gun.rotation;
    const pitch = st.pitch || 0;
    const hipPos = [0.16, 0.36, -0.34];
    const adsPos = [0.08, 0.5, -0.3];
    const sprPos = [0.12, 0.26, -0.26];
    const holding = this.hand && this.hand.k === 'c';
    const heal = holding ? Math.max(0.35, this.useK) : 0;
    const aim = 1 - this.sprintK;
    gp.set(
      (hipPos[0] * (1 - this.adsK) + adsPos[0] * this.adsK) * aim + sprPos[0] * this.sprintK,
      (hipPos[1] * (1 - this.adsK) + adsPos[1] * this.adsK) * aim + sprPos[1] * this.sprintK - heal * 0.2,
      (hipPos[2] * (1 - this.adsK) + adsPos[2] * this.adsK) * aim + sprPos[2] * this.sprintK + this.recoil * 0.05 + heal * 0.12,
    );
    gr.set(pitch * 0.75 * aim - this.sprintK * 0.55 - heal * 0.9 + this.recoil * 0.08, this.sprintK * 0.9 + heal * 0.5, 0);
    // Siegesjubel: Waffe hochgereckt, Hüpfen
    if (this.celebrate) {
      const j = Math.abs(Math.sin(t * 5.5));
      this.hips.position.y += j * 0.14;
      this.torso.rotation.x = -0.12;
      gp.set(0.2, 0.92 + j * 0.05, -0.02);
      gr.set(1.35, 0, 0.25 + Math.sin(t * 5.5) * 0.15);
    }
    // Nachladen: Waffe kippen
    let leftTarget = null;
    if (this.reloadT >= 0) {
      const r = this.reloadT;
      const tilt = Math.sin(Math.min(1, r * 1.3) * Math.PI) * 0.6;
      gr.z = tilt;
      gr.x += 0.15 * tilt;
      const magPos = _v3.set(0, -0.12, -0.12);
      if (r < 0.25) leftTarget = magPos;
      else if (r < 0.55) leftTarget = _v3.set(-0.1, -0.25, -0.05);
      else if (r < 0.75) leftTarget = magPos;
      else if (r < 0.9) leftTarget = _v3.set(0.06, 0.07, -0.02);
    }
    this.gun.updateMatrix();
    // Medkit
    this.medkit.visible = holding;
    if (holding) {
      this.medkit.position.set(-0.02, 0.18 + this.useK * 0.3 + Math.sin(t * 9) * 0.02 * this.useK, -0.34);
      this.medkit.rotation.set(0.3 + this.useK * 0.8, 0.2, 0);
    }
    // IK
    const grip = _v1.set(0, -0.06, 0.045).applyMatrix4(this.gun.matrix);
    this.solveArm(this.arms[1], grip, 1);
    let lt;
    if (holding) lt = _v2.copy(this.medkit.position).add(_v3.set(0.1, 0.05, 0));
    else if (this.celebrate) lt = _v2.set(-0.3 + Math.sin(t * 9) * 0.08, 0.98, -0.06);
    else if (leftTarget) lt = _v2.copy(leftTarget).applyMatrix4(this.gun.matrix);
    else lt = _v2.set(0, 0.0, -0.4).applyMatrix4(this.gun.matrix);
    this.solveArm(this.arms[0], lt, -1);
    if (this.knockK > 0.01) this.poseKnocked(t);
    else if (!this.gun.visible && (!this.hand || this.hand.k === 'w') && !this.dead) this.gun.visible = true;
    // Krone schwebt
    if (this.crown) {
      this.crown.rotation.y += dt * 0.8;
      this.crown.position.y = (this.def.hatTop ?? 0.3) + 0.2 + Math.sin(t * 2) * 0.03;
    }
  }

  // am Boden: Oberkörper nach vorne gekippt, Arme ziehen abwechselnd nach vorne
  poseKnocked(t) {
    const kk = this.knockK;
    this.fall.rotation.x = -kk * 1.3;
    this.fall.position.y = kk * 0.06;
    this.gun.visible = kk < 0.3 && (!this.hand || this.hand.k === 'w');
    this.medkit.visible = false;
    const crawl = Math.min(1, this.speed / 1.5);
    for (const L of this.legs) {
      const sw = Math.sin(this.phase * 1.4 + (L.side > 0 ? 0 : Math.PI)) * 0.35 * crawl;
      L.upper.rotation.x = L.upper.rotation.x * (1 - kk) + (0.05 + sw) * kk;
      L.knee.rotation.x = L.knee.rotation.x * (1 - kk) + (0.15 + Math.max(0, sw)) * kk;
    }
    const a = this.phase * 1.4;
    this.solveArm(this.arms[1], _v1.set(0.28, 0.72 + Math.sin(a) * 0.12 * crawl, -0.18 - Math.cos(a) * 0.1 * crawl), 1);
    this.solveArm(this.arms[0], _v2.set(-0.28, 0.72 - Math.sin(a) * 0.12 * crawl, -0.18 + Math.cos(a) * 0.1 * crawl), -1);
    this.head.rotation.x = 0.9 * kk;
    if (kk < 0.02) {
      this.fall.rotation.x = 0;
      this.fall.position.y = 0;
    }
  }

  solveArm(arm, target, side) {
    const a = 0.29, b = 0.3;
    const S = arm.shoulder;
    const dir = _a1.subVectors(target, S);
    let d = dir.length();
    d = Math.max(0.08, Math.min(a + b - 0.005, d));
    dir.normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const pole = _a2.set(side * 0.8, -1, 0.35);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = _a3.copy(S).addScaledVector(dir, a * cosA).addScaledVector(pole, a * sinA);
    arm.upper.position.copy(S);
    arm.upper.quaternion.setFromUnitVectors(V_UP, _a4.subVectors(elbow, S).normalize());
    arm.lower.position.copy(elbow);
    _a4.copy(S).addScaledVector(dir, d).sub(elbow).normalize();
    arm.lower.quaternion.setFromUnitVectors(V_UP, _a4);
  }

  die(dirAngle) {
    this.dead = true;
    this.deathT = 0;
    this.fallAxis = Math.random() < 0.5 ? 'x' : 'z';
    this.fallSign = Math.random() < 0.5 ? 1 : -1;
    if (this.fallAxis === 'x') this.fallSign = 1;
    // lag schon am Boden (Duo): einfach liegen bleiben
    if ((this.knockK || 0) > 0.5) {
      this.fallAxis = 'x';
      this.fallSign = -1;
      this.deathT = 0.58;
    }
    this.medkit.visible = false;
  }

  revive() {
    this.dead = false;
    this.fall.rotation.set(0, 0, 0);
    this.fall.position.set(0, 0, 0);
    this.gun.visible = !this.hand || this.hand.k === 'w';
  }

  updateDeath(dt) {
    this.deathT += dt;
    const t = this.deathT;
    // beschleunigtes Umkippen mit kleinem Aufprall-Wippen
    let ang = Math.min(1, t * t * 2.6) * (Math.PI / 2 - 0.06);
    if (t > 0.62) ang += Math.sin(Math.min(1, (t - 0.62) * 4) * Math.PI) * 0.06 * Math.exp(-(t - 0.62) * 3);
    if (this.fallAxis === 'x') this.fall.rotation.x = ang * this.fallSign;
    else this.fall.rotation.z = ang * this.fallSign;
    this.fall.position.y = Math.min(1, t * 2) * 0.14;
    // Gliedmaßen erschlaffen
    const f = Math.min(1, t * 2.5);
    this.hips.position.y = 0.94 - f * 0.08;
    for (const L of this.legs) {
      L.upper.rotation.x += ((L.side > 0 ? -0.35 : 0.15) - L.upper.rotation.x) * f * 0.2;
      L.knee.rotation.x += ((L.side > 0 ? 0.5 : 0.15) - L.knee.rotation.x) * f * 0.2;
    }
    for (const A of this.arms) {
      const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0, A.side * 1.3));
      A.upper.quaternion.slerp(target, f * 0.15);
      A.lower.position.copy(new THREE.Vector3(0, -0.29, 0).applyQuaternion(A.upper.quaternion).add(A.upper.position));
      A.lower.quaternion.copy(A.upper.quaternion);
    }
    this.head.rotation.x += (0.4 - this.head.rotation.x) * f * 0.1;
    this.gun.rotation.z += (1.4 - this.gun.rotation.z) * f * 0.1;
    this.gun.position.y += (0.05 - this.gun.position.y) * f * 0.1;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
  }
}
