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
const HAIR = [0x3b2a1a, 0x1a1a1a, 0x8b5a2b, 0xd9a441, 0x6b3a1a, 0xb5651d];
const IRIS = [0x5a3a1a, 0x2f6fb0, 0x3f8a4a, 0x6b4a2a];

// Farben und Merkmale je Skin (primary = gewählte Farbe): Hemd, Hose, Gürtel, Ärmel oben (arm)
// und unten (fore, 'skin' = nackt), Manschette, Handschuh, Ober-/Unterschenkel, Schuh, Sohle,
// Stiefelschaft (boot = Höhe) und Extras wie Knieschoner, Schlaghose oder Wickelband.
function outfitDef(outfit, P) {
  switch (outfit) {
    case 'cowboy': return { shirt: P, shirt2: darker(P, 0.55), pants: 0x3d5f93, belt: 0x5a3820, buckle: 0xf2c230, arm: P, fore: P, cuff: darker(P, 0.55), glove: 0x8a5a32, thigh: 0x3d5f93, shin: 0x3d5f93, shoe: 0x6b4226, sole: 0x2a1a10, boot: 0.24, spur: true, hatTop: 0.34 };
    case 'ranger': return { shirt: 0xcdb27a, shirt2: 0xb39660, pants: 0xa08a5c, belt: 0x4a3a28, buckle: 0x9a9a9a, arm: 0xcdb27a, fore: 'skin', rolled: 0xb39660, glove: null, thigh: 0xa08a5c, shorts: true, sock: 0xece4d2, shoe: 0x6a5038, sole: 0x2b2118, boot: 0.1, hatTop: 0.34 };
    case 'chef': return { shirt: 0xfbfbfb, shirt2: 0xe2e2e2, pants: 0x2d2d33, belt: 0xfbfbfb, buckle: 0xfbfbfb, arm: 0xfbfbfb, fore: 0xfbfbfb, cuff: 0xe2e2e2, glove: null, thigh: 0x2d2d33, shin: 0x2d2d33, check: 0xd8d8d8, shoe: 0x1a1a1a, sole: 0x0e0e0e, hatTop: 0.6 };
    case 'pirate': return { shirt: 0xf5efe0, shirt2: 0x2a3f7a, coat: P, trim: 0xe0b84a, pants: 0x3a2a1a, belt: 0x3a2412, buckle: 0xe0b84a, arm: P, fore: P, cuff: 0xe0b84a, glove: null, thigh: 0x3a2a1a, shin: 0x3a2a1a, shoe: 0x1a1a1a, sole: 0x0b0b0b, boot: 0.28, bootFold: true, hatTop: 0.3 };
    case 'soldier': return { shirt: 0x5b6b3a, shirt2: 0x46552c, camo: [0x4a5a2e, 0x6e7c47, 0x3b4524], pants: 0x55633a, belt: 0x3a3a2a, buckle: 0x777777, arm: 0x5b6b3a, fore: 0x5b6b3a, glove: 0x2e2e26, thigh: 0x55633a, shin: 0x55633a, knee: 0x2e2e26, shoe: 0x2b2b2b, sole: 0x151515, boot: 0.2, patch: P, hatTop: 0.31 };
    case 'dancer': return { shirt: P, shirt2: 0xffd23f, pants: 0x1f1f2a, belt: 0xffd23f, buckle: 0xffffff, arm: P, fore: P, cuff: 0xffd23f, glove: 0xffffff, thigh: 0x1f1f2a, shin: 0x1f1f2a, flare: true, shoe: 0xffffff, sole: 0xffd23f, glow: true, hatTop: 0.47 };
    case 'ninja': return { shirt: 0x23262e, shirt2: 0x3a3f4a, pants: 0x23262e, belt: P, buckle: P, arm: 0x23262e, fore: 0x23262e, wrap: 0x3a3f4a, glove: 0x16181d, thigh: 0x23262e, shin: 0x23262e, shinWrap: 0x3a3f4a, shoe: 0x111111, sole: 0x080808, hatTop: 0.21 };
    case 'astronaut': return { shirt: 0xf2f2f2, shirt2: P, pants: 0xf2f2f2, belt: 0x9a9aa8, buckle: P, arm: 0xf2f2f2, fore: 0xf2f2f2, cuff: P, glove: 0xc8c8d4, thigh: 0xf2f2f2, shin: 0xf2f2f2, knee: 0xd8d8e0, shoe: 0xb8b8c6, sole: 0x7a7a88, boot: 0.22, hatTop: 0.31 };
    // Standard ohne Skin: T-Shirt in der gewählten Farbe, Jeans, Turnschuhe
    default: return { shirt: P, shirt2: darker(P, 0.7), pants: 0x3a4f78, belt: 0x2b2b2b, buckle: 0x9aa0a8, arm: P, fore: 'skin', short: true, cuff: null, glove: null, thigh: 0x3a4f78, shin: 0x3a4f78, shoe: 0xf2f2f2, sole: darker(P, 0.8), hatTop: 0.2 };
  }
}

// Ärmel/Hand für die Egoperspektive (passend zum Skin)
export function firstPersonArm(outfit, color) {
  const P = new THREE.Color(OUTFIT_COLORS[color % OUTFIT_COLORS.length]).getHex();
  const d = outfitDef(outfit, P);
  const skin = SKIN_TONES[1];
  return { sleeve: d.arm, fore: d.fore === 'skin' ? skin : d.fore, cuff: d.cuff || d.rolled || null, hand: d.glove ?? skin };
}

// kleine Flecken (Tarnmuster) deterministisch verteilen
function camo(g, cols, x0, x1, y0, y1, z, n, seed, rot = 0) {
  for (let i = 0; i < n; i++) {
    const hx = ((seed * 7 + i * 13) % 17) / 17, hy = ((seed * 11 + i * 7) % 19) / 19;
    g.box(x0 + (x1 - x0) * hx, y0 + (y1 - y0) * hy, z, 0.07 + (i % 3) * 0.025, 0.05 + (i % 2) * 0.03, 0.01, cols[i % cols.length], { ry: rot, rz: i * 0.7 });
  }
}

function buildTorso(o, def, P, skin) {
  const g = new GeoBuilder();
  // Becken, Gürtel mit Schnalle
  g.box(0, 0.0, 0, 0.46, 0.18, 0.27, def.pants);
  g.box(0, 0.1, 0, 0.48, 0.06, 0.29, def.belt, { e: def.glow ? 0.5 : 0 });
  g.box(0, 0.1, -0.15, 0.1, 0.07, 0.02, def.buckle, { e: def.glow ? 0.4 : 0 });
  // Oberkörper: Bauch, breitere Brust/Schultern, Kragen
  g.box(0, 0.3, 0, 0.47, 0.36, 0.27, def.shirt);
  g.box(0, 0.51, 0, 0.52, 0.18, 0.29, def.shirt);
  g.box(0, 0.6, 0, 0.3, 0.04, 0.22, darker(def.shirt, 0.85));
  const F = -0.15; // Vorderseite
  switch (o) {
    case 'cowboy':
      // kariertes Hemd, Lederweste, Halstuch, Sheriffstern, Holster
      for (const y of [0.2, 0.32, 0.44, 0.54]) g.box(0, y, 0, 0.53, 0.022, 0.3, def.shirt2);
      for (const x of [-0.2, -0.08, 0.04, 0.16]) g.box(x, 0.36, F + 0.005, 0.022, 0.44, 0.01, def.shirt2);
      for (const sx of [-1, 1]) {
        g.box(sx * 0.16, 0.36, F - 0.006, 0.17, 0.46, 0.02, 0x6b4226);
        g.box(sx * 0.255, 0.36, 0, 0.02, 0.46, 0.3, 0x6b4226);
        g.box(sx * 0.08, 0.36, F - 0.012, 0.012, 0.46, 0.012, 0x4a2c16);
      }
      g.box(0, 0.36, 0.152, 0.5, 0.46, 0.02, 0x6b4226);
      g.box(0, 0.54, F - 0.02, 0.2, 0.14, 0.03, 0xc0392b, { rz: 0.785 });
      g.box(0, 0.59, -0.08, 0.3, 0.07, 0.16, 0xc0392b);
      g.box(-0.16, 0.42, F - 0.02, 0.05, 0.05, 0.01, 0xf2c230, { e: 0.35 });
      g.box(-0.16, 0.42, F - 0.02, 0.05, 0.05, 0.01, 0xf2c230, { e: 0.35, rz: 0.785 });
      g.box(0.27, -0.06, 0.02, 0.07, 0.2, 0.1, 0x5a3820);
      g.box(0.27, 0.07, 0.05, 0.05, 0.1, 0.05, 0x2b2b2b, { rx: 0.3 });
      break;
    case 'ranger':
      // Safarihemd mit Brusttaschen und Schulterklappen, Halstuch, Fernglas, Rucksack mit Schlafrolle
      for (const sx of [-1, 1]) {
        g.box(sx * 0.12, 0.42, F - 0.004, 0.13, 0.12, 0.02, def.shirt2);
        g.box(sx * 0.12, 0.48, F - 0.012, 0.14, 0.04, 0.02, darker(def.shirt2, 0.85));
        g.box(sx * 0.12, 0.47, F - 0.022, 0.02, 0.02, 0.01, 0x6a5038);
        g.box(sx * 0.21, 0.605, 0, 0.1, 0.02, 0.2, def.shirt2);
      }
      g.box(0, 0.6, -0.07, 0.34, 0.07, 0.18, P);
      g.box(0, 0.53, F - 0.02, 0.1, 0.12, 0.03, P, { rz: 0.785 });
      for (const sx of [-1, 1]) g.cyl(sx * 0.045, 0.3, F - 0.05, 0.035, 0.09, 0x222222, { rx: Math.PI / 2, seg: 8 });
      g.box(0, 0.3, F - 0.05, 0.05, 0.03, 0.05, 0x333333);
      g.box(0, 0.44, 0, 0.53, 0.025, 0.3, 0x3a2e1e, { rz: 0.7 });
      g.box(0, 0.34, 0.21, 0.36, 0.42, 0.15, 0x7a6a45);
      g.box(0, 0.24, 0.29, 0.28, 0.14, 0.03, 0x6a5a38);
      g.cyl(0, 0.6, 0.22, 0.07, 0.4, 0x5d7a3a, { rz: Math.PI / 2, seg: 8 });
      break;
    case 'chef':
      // doppelreihige Kochjacke, Halstuch, Schürze mit Tasche
      g.box(0.06, 0.34, F - 0.004, 0.3, 0.46, 0.02, 0xf2f2f2);
      g.box(-0.09, 0.34, F - 0.012, 0.006, 0.46, 0.01, 0xd6d6d6);
      for (const y of [0.22, 0.34, 0.46]) for (const x of [0.0, 0.15]) g.box(x, y, F - 0.018, 0.035, 0.035, 0.012, 0x2b2b2b);
      g.box(0, 0.58, -0.09, 0.3, 0.08, 0.14, P);
      g.box(0, 0.51, F - 0.02, 0.1, 0.1, 0.03, P, { rz: 0.785 });
      g.box(0, -0.1, F - 0.02, 0.4, 0.46, 0.02, 0xf0f0f0);
      g.box(0, -0.06, F - 0.032, 0.16, 0.1, 0.01, 0xe0e0e0);
      g.box(0, 0.13, 0, 0.5, 0.025, 0.31, 0xf0f0f0);
      break;
    case 'pirate':
      // gestreiftes Hemd, langer Mantel mit Goldborte und Schößen, Schärpe, Schultergurt
      for (const y of [0.2, 0.3, 0.4, 0.5]) g.box(0, y, F - 0.004, 0.14, 0.04, 0.01, def.shirt2);
      for (const sx of [-1, 1]) {
        g.box(sx * 0.17, 0.2, F - 0.01, 0.17, 0.8, 0.025, def.coat);
        g.box(sx * 0.085, 0.24, F - 0.024, 0.02, 0.72, 0.01, def.trim, { e: 0.15 });
        g.box(sx * 0.255, 0.2, 0.01, 0.025, 0.8, 0.3, def.coat);
        for (const y of [0.25, 0.37, 0.49]) g.box(sx * 0.11, y, F - 0.03, 0.03, 0.03, 0.01, def.trim, { e: 0.2 });
        g.box(sx * 0.26, 0.56, 0, 0.06, 0.08, 0.3, def.coat);
      }
      g.box(0, 0.2, 0.16, 0.52, 0.8, 0.025, def.coat);
      g.box(0, -0.19, 0.172, 0.52, 0.03, 0.01, def.trim, { e: 0.15 });
      g.box(0, 0.12, 0, 0.5, 0.09, 0.31, darker(P, 0.55));
      g.box(-0.2, -0.02, F - 0.02, 0.07, 0.2, 0.02, darker(P, 0.55), { rz: 0.2 });
      g.box(0.02, 0.36, F - 0.035, 0.05, 0.56, 0.01, 0x3a2412, { rz: 0.62 });
      g.box(0.02, 0.36, 0.175, 0.05, 0.56, 0.01, 0x3a2412, { rz: -0.62 });
      break;
    case 'soldier':
      // Tarnhemd, Plattenträger mit Taschen, Funkgerät mit Antenne, Rucksack
      camo(g, def.camo, -0.2, 0.2, 0.18, 0.56, F - 0.002, 7, 3);
      camo(g, def.camo, -0.2, 0.2, 0.18, 0.56, 0.148, 7, 5);
      g.box(0, 0.36, 0, 0.5, 0.36, 0.33, 0x3d4a2a);
      for (const x of [-0.15, 0, 0.15]) {
        g.box(x, 0.26, -0.175, 0.12, 0.13, 0.04, 0x4b5a33);
        g.box(x, 0.33, -0.19, 0.12, 0.03, 0.01, 0x3a4626);
      }
      g.box(-0.13, 0.46, -0.172, 0.16, 0.05, 0.01, P);
      for (const sx of [-1, 1]) g.box(sx * 0.17, 0.57, 0, 0.1, 0.05, 0.3, 0x3d4a2a);
      g.box(0.16, 0.5, 0.2, 0.08, 0.14, 0.06, 0x2b2b2b);
      g.box(0.18, 0.72, 0.21, 0.012, 0.36, 0.012, 0x1a1a1a);
      g.box(-0.02, 0.34, 0.24, 0.38, 0.4, 0.14, 0x4a5a30);
      g.box(-0.02, 0.44, 0.315, 0.26, 0.12, 0.02, 0x3d4a2a);
      break;
    case 'dancer':
      // glänzende Discojacke mit Leuchtstreifen, Revers, Goldkette mit Discokugel
      g.box(0, 0.36, F - 0.004, 0.12, 0.46, 0.012, 0xffffff);
      for (const sx of [-1, 1]) {
        g.box(sx * 0.1, 0.46, F - 0.014, 0.08, 0.2, 0.01, 0xffffff, { rz: sx * -0.35 });
        g.box(sx * 0.2, 0.34, F - 0.006, 0.025, 0.46, 0.01, def.shirt2, { e: 0.7 });
        g.box(sx * 0.2, 0.34, 0.15, 0.025, 0.46, 0.01, def.shirt2, { e: 0.7 });
      }
      for (let i = 0; i < 6; i++) {
        const k = i / 5;
        g.box((k - 0.5) * 0.16, 0.56 - Math.sin(k * Math.PI) * 0.12, F - 0.02, 0.03, 0.02, 0.01, 0xf2c230, { e: 0.5 });
      }
      g.ico(0, 0.41, F - 0.03, 0.035, 0xdfe6ee, { e: 0.6, detail: 0 });
      break;
    case 'ninja':
      // Brustwickel, Schärpe mit Knoten, Katana auf dem Rücken, Shuriken
      g.box(0, 0.38, F - 0.004, 0.09, 0.5, 0.01, def.shirt2, { rz: 0.45 });
      g.box(0, 0.38, 0.148, 0.09, 0.5, 0.01, def.shirt2, { rz: -0.45 });
      g.box(0, 0.12, 0, 0.5, 0.08, 0.3, P);
      g.box(-0.17, 0.1, F - 0.02, 0.06, 0.06, 0.03, P);
      g.box(-0.2, -0.02, F - 0.02, 0.04, 0.2, 0.01, P, { rz: 0.15 });
      g.box(-0.14, -0.03, F - 0.02, 0.04, 0.18, 0.01, P, { rz: -0.1 });
      g.box(0.02, 0.36, 0.18, 0.06, 0.78, 0.05, 0x3a1a1a, { rz: 0.62 });
      g.box(-0.27, 0.72, 0.18, 0.05, 0.22, 0.045, P, { rz: 0.62 });
      g.box(-0.2, 0.62, 0.18, 0.1, 0.02, 0.08, 0xc9a45c, { rz: 0.62 });
      g.box(0.14, 0.12, F - 0.035, 0.1, 0.02, 0.01, 0xb8c0c8, { rz: 0.785 });
      g.box(0.14, 0.12, F - 0.035, 0.1, 0.02, 0.01, 0xb8c0c8, { rz: -0.785 });
      break;
    case 'astronaut':
      // Steuerpult vorne, Missionsabzeichen, Lebenserhaltungs-Rucksack mit Tanks und Schläuchen
      g.box(0, 0.36, -0.165, 0.26, 0.15, 0.05, 0xc8c8d4);
      g.box(-0.06, 0.39, -0.192, 0.08, 0.05, 0.005, 0x39e0ff, { e: 0.6 });
      for (const [x, c] of [[0.04, 0xff4040], [0.075, 0x40ff70], [0.11, 0xffd040]]) g.box(x, 0.4, -0.192, 0.022, 0.022, 0.005, c, { e: 0.8 });
      g.box(0.02, 0.32, -0.192, 0.16, 0.02, 0.005, 0x666677);
      g.cyl(-0.14, 0.5, -0.148, 0.045, 0.012, P, { rx: Math.PI / 2, seg: 10 });
      g.box(0, 0.22, 0, 0.53, 0.035, 0.3, P);
      g.box(0, 0.37, 0.24, 0.44, 0.52, 0.2, 0xe6e6ee);
      for (const sx of [-1, 1]) {
        g.cyl(sx * 0.17, 0.12, 0.3, 0.07, 0.46, 0xd0d0da, { seg: 10 });
        g.box(sx * 0.27, 0.34, 0.02, 0.03, 0.03, 0.4, 0x8a8a98, { rx: 0.5 });
      }
      g.box(0, 0.58, 0.345, 0.2, 0.05, 0.01, P, { e: 0.4 });
      g.box(0, 0.5, 0.345, 0.05, 0.05, 0.01, 0x40ff70, { e: 0.8 });
      break;
    default:
      // Standard: T-Shirt mit Emblem und Saum
      g.box(0.11, 0.45, F - 0.004, 0.1, 0.1, 0.01, 0xffffff);
      g.box(0.11, 0.45, F - 0.01, 0.06, 0.06, 0.01, def.shirt2);
      g.box(0, 0.14, 0, 0.475, 0.03, 0.275, def.shirt2);
      break;
  }
  return g;
}

// Augen, Brauen, Nase, Mund (Gesicht zeigt nach −Z)
function face(g, skin, hair, iris, o = {}) {
  for (const x of [-0.08, 0.08]) {
    if (!(o.patch && x > 0)) {
      g.box(x, 0.21, -0.166, 0.075, 0.07, 0.01, 0xffffff);
      g.box(x, 0.205, -0.17, 0.045, 0.055, 0.01, iris);
      g.box(x, 0.205, -0.173, 0.022, 0.03, 0.01, 0x111111);
      g.box(x + 0.012, 0.22, -0.176, 0.014, 0.014, 0.005, 0xffffff);
    }
    g.box(x, 0.265, -0.168, 0.085, 0.022, 0.012, hair, { rz: x > 0 ? -0.12 : 0.12 });
  }
  g.box(0, 0.16, -0.176, 0.05, 0.06, 0.03, darker(skin, 0.88));
  if (!o.noMouth) {
    g.box(0, 0.095, -0.168, 0.1, 0.022, 0.01, 0x7a3a2a);
    for (const x of [-0.055, 0.055]) g.box(x, 0.104, -0.168, 0.022, 0.02, 0.01, 0x7a3a2a);
  }
}

// Frisur (Kopfoberseite y = 0.36); style 0 kurz, 1 stachelig, 2 Seitenscheitel
function hairStyle(g, hair, style, full = true) {
  g.box(0, 0.26, 0.155, 0.36, 0.22, 0.05, hair);
  for (const sx of [-1, 1]) g.box(sx * 0.172, 0.27, 0.03, 0.03, 0.12, 0.2, hair);
  if (!full) return;
  g.box(0, 0.375, 0.005, 0.36, 0.06, 0.35, hair);
  if (style === 1) {
    for (const [x, z] of [[-0.1, -0.08], [0.02, -0.1], [0.12, -0.05], [-0.06, 0.06], [0.08, 0.08]]) g.cyl(x, 0.4, z, 0.07, 0.12, hair, { rt: 0, seg: 4, ry: x * 5 });
  } else if (style === 2) {
    g.box(0.03, 0.34, -0.165, 0.32, 0.07, 0.05, hair, { rz: 0.15 });
  } else {
    g.box(0, 0.345, -0.165, 0.34, 0.04, 0.04, hair);
  }
}

function buildHead(o, def, skin, P, seed) {
  const g = new GeoBuilder();
  const hair = HAIR[seed % HAIR.length];
  const iris = IRIS[(seed >> 3) % IRIS.length];
  // Hals, Kopf, Ohren
  g.box(0, 0.03, 0, 0.15, 0.08, 0.15, skin);
  g.box(0, 0.19, 0, 0.34, 0.34, 0.33, skin);
  if (o !== 'astronaut') for (const sx of [-1, 1]) g.box(sx * 0.176, 0.19, 0.01, 0.03, 0.08, 0.06, darker(skin, 0.92));
  switch (o) {
    case 'cowboy':
      face(g, skin, hair, iris);
      hairStyle(g, hair, 0, false);
      g.box(0, 0.125, -0.178, 0.16, 0.03, 0.02, hair);
      for (const sx of [-1, 1]) g.box(sx * 0.085, 0.105, -0.178, 0.03, 0.04, 0.02, hair);
      // Hut: breite, seitlich hochgebogene Krempe, eingedellte Krone, Hutband mit Schnalle
      g.cyl(0, 0.36, 0, 0.3, 0.035, 0x7a4e2a, { seg: 14 });
      for (const sx of [-1, 1]) g.box(sx * 0.29, 0.39, 0, 0.14, 0.03, 0.46, 0x7a4e2a, { rz: sx * 0.5 });
      g.cyl(0, 0.45, 0, 0.19, 0.18, 0x8a5a32, { rt: 0.16, seg: 10 });
      g.box(0, 0.535, 0, 0.06, 0.03, 0.24, 0x6a4424);
      g.cyl(0, 0.395, 0, 0.195, 0.045, 0x3a2412, { seg: 10 });
      g.box(0, 0.395, -0.194, 0.05, 0.04, 0.01, 0xf2c230, { e: 0.3 });
      break;
    case 'ranger':
      face(g, skin, hair, iris);
      hairStyle(g, hair, 0, false);
      // Tropenhelm mit Band
      g.ico(0, 0.37, 0, 0.24, 0xe8dcc0, { sy: 0.72, detail: 1, jitter: 0 });
      g.cyl(0, 0.33, 0, 0.3, 0.03, 0xe0d0b0, { seg: 14 });
      g.cyl(0, 0.35, 0, 0.245, 0.05, P, { seg: 12 });
      g.ico(0, 0.54, 0, 0.03, 0xd0c0a0, { jitter: 0 });
      break;
    case 'chef':
      face(g, skin, hair, iris);
      hairStyle(g, hair, 0, false);
      g.box(0, 0.125, -0.178, 0.16, 0.03, 0.02, hair);
      for (const sx of [-1, 1]) g.box(sx * 0.1, 0.14, -0.178, 0.04, 0.025, 0.02, hair, { rz: sx * 0.6 });
      // Kochmütze: Band, Säule, bauschiger Kopf
      g.cyl(0, 0.36, 0, 0.19, 0.08, 0xf4f4f4, { seg: 12 });
      g.cyl(0, 0.44, 0, 0.19, 0.18, 0xffffff, { rt: 0.22, seg: 12 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.ico(Math.cos(a) * 0.13, 0.66, Math.sin(a) * 0.13, 0.12, 0xffffff, { sy: 0.8, jitter: 0.08, jseed: k + 3 });
      }
      g.ico(0, 0.7, 0, 0.14, 0xffffff, { sy: 0.8, jitter: 0.08 });
      break;
    case 'pirate':
      face(g, skin, hair, iris, { patch: true });
      hairStyle(g, hair, 0, false);
      // Augenklappe, Bart, Dreispitz mit Goldborte und Totenkopf
      g.box(0.08, 0.21, -0.172, 0.09, 0.08, 0.012, 0x111111);
      g.box(0, 0.25, -0.17, 0.36, 0.015, 0.01, 0x111111, { rz: -0.35 });
      g.box(0, 0.06, -0.16, 0.26, 0.1, 0.05, hair);
      g.box(0, 0.125, -0.178, 0.16, 0.03, 0.02, hair);
      g.cyl(0, 0.36, 0, 0.21, 0.12, 0x1a1a1a, { seg: 10 });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
        const cx = Math.cos(a) * 0.19, cz = -Math.sin(a) * 0.19;
        g.box(cx, 0.4, cz, 0.44, 0.14, 0.03, 0x1a1a1a, { ry: a + Math.PI / 2, rx: 0.3 });
        g.box(cx * 1.08, 0.47, cz * 1.08, 0.44, 0.02, 0.035, 0xe0b84a, { ry: a + Math.PI / 2, rx: 0.3, e: 0.15 });
      }
      g.box(0, 0.43, -0.215, 0.07, 0.06, 0.01, 0xf2f2f2);
      for (const sx of [-1, 1]) g.box(sx * 0.015, 0.44, -0.22, 0.015, 0.015, 0.005, 0x111111);
      g.box(0, 0.39, -0.215, 0.12, 0.015, 0.008, 0xf2f2f2, { rz: 0.6 });
      g.box(0, 0.39, -0.215, 0.12, 0.015, 0.008, 0xf2f2f2, { rz: -0.6 });
      break;
    case 'soldier':
      face(g, skin, hair, iris);
      for (const sx of [-1, 1]) g.box(sx * 0.08, 0.16, -0.168, 0.08, 0.02, 0.01, 0x3a4a2a);
      // Helm mit Tarnnetz, Brille und Kinnriemen
      g.ico(0, 0.34, 0, 0.235, 0x55652f, { sy: 0.72, sx: 1.05, detail: 1, jitter: 0 });
      g.cyl(0, 0.3, 0, 0.25, 0.04, 0x4a5a2a, { seg: 12 });
      for (const a of [-0.6, 0, 0.6]) g.box(0, 0.4, 0, 0.5, 0.012, 0.012, 0x3b4524, { ry: a, rz: 0.2 });
      g.box(0, 0.4, -0.2, 0.28, 0.06, 0.04, 0x1a1a1a);
      for (const sx of [-1, 1]) g.box(sx * 0.07, 0.4, -0.222, 0.09, 0.045, 0.01, 0x7fc8ff, { e: 0.25 });
      for (const sx of [-1, 1]) g.box(sx * 0.17, 0.15, -0.06, 0.012, 0.18, 0.02, 0x2b2b2b, { rx: -0.3 });
      break;
    case 'dancer':
      face(g, skin, hair, iris);
      // Afro, Sonnenbrille, Ohrringe
      g.ico(0, 0.36, 0.03, 0.31, P === 0x222831 ? 0x9b5de5 : darker(P, 0.8), { detail: 1, jitter: 0.12 });
      g.box(0, 0.22, -0.18, 0.32, 0.075, 0.02, 0x111111);
      g.box(0.075, 0.22, -0.186, 0.11, 0.065, 0.01, 0x3a7bd5, { e: 0.35 });
      g.box(-0.075, 0.22, -0.186, 0.11, 0.065, 0.01, 0xe63946, { e: 0.35 });
      for (const sx of [-1, 1]) g.cyl(sx * 0.19, 0.1, 0.0, 0.03, 0.01, 0xf2c230, { rz: Math.PI / 2, seg: 8, e: 0.4 });
      break;
    case 'ninja':
      // Kopfhaube mit Augenschlitz, Stirnband mit wehenden Enden
      g.box(0, 0.22, 0, 0.36, 0.38, 0.35, 0x23262e);
      g.box(0, 0.21, -0.176, 0.3, 0.085, 0.01, skin);
      for (const x of [-0.08, 0.08]) {
        g.box(x, 0.21, -0.18, 0.06, 0.045, 0.01, 0xffffff);
        g.box(x, 0.207, -0.184, 0.03, 0.035, 0.01, 0x111111);
        g.box(x, 0.25, -0.18, 0.075, 0.015, 0.01, 0x111111, { rz: x > 0 ? -0.25 : 0.25 });
      }
      g.box(0, 0.3, 0, 0.37, 0.055, 0.36, P);
      g.box(0.05, 0.26, 0.27, 0.05, 0.03, 0.22, P, { rx: 0.5 });
      g.box(-0.05, 0.23, 0.26, 0.05, 0.03, 0.2, P, { rx: 0.8 });
      break;
    case 'astronaut':
      // Raumhelm mit goldenem Visier, Halsring, Lampe und Antenne
      g.cyl(0, -0.02, 0, 0.21, 0.07, 0xb8b8c6, { seg: 14 });
      g.ico(0, 0.21, 0, 0.3, 0xf2f2f2, { detail: 1, jitter: 0 });
      g.box(0, 0.21, -0.27, 0.4, 0.28, 0.07, 0xdadae2);
      g.box(0, 0.21, -0.285, 0.34, 0.22, 0.07, 0xd9a531, { e: 0.35 });
      g.box(0.07, 0.26, -0.322, 0.08, 0.04, 0.005, 0xfff2c0, { e: 0.6 });
      g.box(-0.24, 0.26, 0, 0.05, 0.08, 0.08, 0x9a9aa8);
      g.box(-0.24, 0.26, -0.045, 0.03, 0.03, 0.01, 0xfff6d0, { e: 0.9 });
      g.cyl(0.22, 0.34, 0.05, 0.012, 0.22, 0x999999, { seg: 4 });
      g.ico(0.22, 0.46, 0.05, 0.02, 0xff4040, { e: 0.9, jitter: 0 });
      break;
    default:
      face(g, skin, hair, iris);
      hairStyle(g, hair, seed % 3);
      break;
  }
  return g;
}

// Oberarm (Schulter bei y = 0, nach unten 0.29)
function upperArmGeo(def, skin, side) {
  const g = new GeoBuilder();
  g.box(0, -0.06, 0, 0.145, 0.12, 0.145, def.arm);
  if (def.short) {
    g.box(0, -0.13, 0, 0.14, 0.06, 0.14, def.arm);
    g.box(0, -0.22, 0, 0.12, 0.16, 0.12, skin);
  } else g.box(0, -0.16, 0, 0.13, 0.26, 0.13, def.arm);
  if (def.patch) g.box(side * 0.067, -0.1, 0, 0.01, 0.07, 0.07, def.patch);
  if (def.camo) camo(g, def.camo, -0.04, 0.04, -0.25, -0.05, side * 0.066, 3, side + 2, Math.PI / 2);
  if (def.coat) g.box(0, -0.27, 0, 0.14, 0.03, 0.14, def.trim);
  if (def.glow) g.box(side * 0.066, -0.15, 0, 0.01, 0.22, 0.02, def.shirt2, { e: 0.7 });
  return g;
}

// Unterarm mit Hand (Ellbogen bei y = 0)
function forearmGeo(def, skin) {
  const g = new GeoBuilder();
  const fc = def.fore === 'skin' ? skin : def.fore;
  g.box(0, -0.12, 0, 0.115, 0.24, 0.115, fc);
  if (def.rolled) g.box(0, -0.02, 0, 0.13, 0.06, 0.13, def.rolled);
  if (def.cuff) g.box(0, -0.225, 0, 0.126, 0.05, 0.126, def.cuff, { e: def.glow ? 0.5 : 0 });
  if (def.wrap) for (let i = 0; i < 3; i++) g.box(0, -0.05 - i * 0.065, 0, 0.122, 0.024, 0.122, def.wrap, { rz: 0.15 });
  const hc = def.glove ?? skin;
  g.box(0, -0.3, 0, 0.1, 0.1, 0.11, hc);
  g.box(0, -0.28, -0.06, 0.04, 0.05, 0.03, hc);
  return g;
}

// Oberschenkel (Hüfte bei y = 0, nach unten 0.46)
function thighGeo(def, skin, side) {
  const g = new GeoBuilder();
  if (def.shorts) {
    g.box(0, -0.13, 0, 0.19, 0.26, 0.2, def.thigh);
    g.box(side * 0.096, -0.15, 0, 0.012, 0.12, 0.12, darker(def.thigh, 0.85));
    g.box(0, -0.36, 0, 0.14, 0.2, 0.15, skin);
  } else g.box(0, -0.23, 0, 0.18, 0.46, 0.19, def.thigh);
  if (def.check) for (let i = 0; i < 4; i++) g.box(((i % 2) - 0.5) * 0.08, -0.08 - i * 0.1, -0.097, 0.05, 0.05, 0.01, def.check);
  if (def.camo) camo(g, def.camo, -0.06, 0.06, -0.42, -0.05, -0.097, 4, side + 7);
  if (def.coat) g.box(0, -0.12, 0.1, 0.19, 0.2, 0.02, def.coat);
  return g;
}

// Unterschenkel mit Schuh (Knie bei y = 0, Sohle bei −0.48)
function shinGeo(def, skin, outfit) {
  const g = new GeoBuilder();
  if (def.shorts) {
    g.box(0, -0.06, 0, 0.14, 0.12, 0.15, skin);
    g.box(0, -0.25, 0, 0.155, 0.28, 0.165, def.sock);
  } else g.box(0, -0.2, 0, 0.16, 0.4, 0.17, def.shin);
  if (def.flare) g.box(0, -0.33, 0, 0.2, 0.14, 0.21, def.shin);
  if (def.knee) g.box(0, -0.03, -0.09, 0.14, 0.12, 0.035, def.knee);
  if (def.shinWrap) for (let i = 0; i < 3; i++) g.box(0, -0.12 - i * 0.07, 0, 0.168, 0.025, 0.178, def.shinWrap, { rz: 0.12 });
  if (def.boot) g.box(0, -0.38 + def.boot / 2, 0, 0.18, def.boot, 0.19, def.shoe);
  if (def.bootFold) g.box(0, -0.38 + def.boot - 0.02, 0, 0.2, 0.06, 0.21, darker(def.shoe, 1.6));
  g.box(0, -0.425, -0.04, 0.17, 0.09, 0.27, def.shoe);
  g.box(0, -0.47, -0.04, 0.18, 0.025, 0.28, def.sole);
  if (outfit === 'recruit') g.box(0, -0.4, -0.04, 0.172, 0.02, 0.2, def.sole);
  if (def.spur) g.cyl(0, -0.43, 0.11, 0.03, 0.01, 0xf2c230, { rx: Math.PI / 2, seg: 6, e: 0.3 });
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

    this.torsoMesh = mk(buildTorso(outfit, def, primary, skinTone));
    this.torso.add(this.torsoMesh);
    this.headMesh = mk(buildHead(outfit, def, skinTone, primary, seed));
    this.head.add(this.headMesh);
    // Beine
    for (const side of [-1, 1]) {
      const upper = new THREE.Group();
      upper.position.set(side * 0.12, 0, 0);
      upper.add(mk(thighGeo(def, skinTone, side)));
      const knee = new THREE.Group();
      knee.position.set(0, -0.46, 0);
      knee.add(mk(shinGeo(def, skinTone, outfit)));
      upper.add(knee);
      this.hips.add(upper);
      this.legs.push({ upper, knee, side });
    }
    // Arme (IK-gesteuert, Kinder des Oberkörpers)
    for (const side of [-1, 1]) {
      const upper = new THREE.Group();
      upper.position.set(side * 0.31, 0.54, 0);
      upper.add(mk(upperArmGeo(def, skinTone, side)));
      const lower = new THREE.Group();
      lower.add(mk(forearmGeo(def, skinTone)));
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
