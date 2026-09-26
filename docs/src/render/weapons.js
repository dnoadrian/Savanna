// Eigene Low-Poly-Modelle aller Gegenstände (keine Original-Assets): Pistole, SCAR-Sturmgewehr,
// Trommel-MP, taktische und Pump-Schrotflinte, schweres Scharfschützengewehr, Mini-Schild,
// großer Schild, Medikit, Munitionskisten und die Truhe. Waffen sind in Seltenheitsfarbe lackiert.
// Lokales System der Waffen: Lauf zeigt nach -Z, Ursprung am Pistolengriff, Visierlinie bei y = sightY.
import * as THREE from 'three';
import { GeoBuilder, worldMaterial } from './geom.js';

export const RAR_BODY = [0x8c939c, 0x58b23a, 0x3a8fe4, 0x9b58e4, 0xe3a132];
export const RAR_DARK = [0x4b5058, 0x2e5c21, 0x1f4b85, 0x4e2b7c, 0x80540f];
export const RAR_LIGHT = [0xc4cad0, 0x94e06c, 0x86c7ff, 0xd0a4ff, 0xffd878];

const BLACK = 0x23262b;
const GUNMETAL = 0x3a3f46;
const WOOD = 0x8a5230;
const WOOD_DARK = 0x6a3c22;

// Metadaten für Egoperspektive/Figuren je Waffe
export const WEAPON_META = {
  pistol: { sightY: 0.075, muzzle: [0, 0.05, -0.2], eject: [0.03, 0.06, -0.03], mag: [0, -0.06, 0.02], fore: null, hip: [0.2, -0.2, -0.42], adsZ: -0.38, scale: 1.0 },
  ar: { sightY: 0.13, muzzle: [0, 0.036, -0.7], eject: [0.045, 0.055, -0.06], mag: [0, -0.04, -0.13], fore: [0, -0.01, -0.36], hip: [0.2, -0.215, -0.5], adsZ: -0.46, scale: 1.0 },
  drum: { sightY: 0.12, muzzle: [0, 0.03, -0.62], eject: [0.04, 0.05, -0.08], mag: [0, -0.06, -0.14], fore: [0, -0.1, -0.3], hip: [0.2, -0.22, -0.5], adsZ: -0.44, scale: 1.0 },
  tac: { sightY: 0.11, muzzle: [0, 0.03, -0.66], eject: [0.05, 0.05, -0.05], mag: null, fore: [0, -0.03, -0.38], hip: [0.2, -0.22, -0.5], adsZ: -0.44, scale: 1.0 },
  pump: { sightY: 0.1, muzzle: [0, 0.035, -0.78], eject: [0.05, 0.04, -0.05], mag: null, fore: [0, -0.02, -0.42], hip: [0.2, -0.22, -0.52], adsZ: -0.46, scale: 1.0 },
  sniper: { sightY: 0.16, muzzle: [0, 0.03, -0.95], eject: [0.05, 0.06, -0.04], mag: [0, -0.04, -0.12], fore: [0, -0.02, -0.4], hip: [0.2, -0.22, -0.55], adsZ: -0.4, scale: 1.0 },
};

function pistol(g, r, detail) {
  const body = RAR_BODY[r], dark = RAR_DARK[r];
  g.box(0, 0.05, -0.07, 0.036, 0.04, 0.23, GUNMETAL); // Schlitten
  g.box(0, 0.074, -0.07, 0.03, 0.01, 0.21, BLACK);
  if (detail) for (let i = 0; i < 5; i++) g.box(0.019, 0.055, 0.02 + i * 0.008 - 0.03, 0.003, 0.02, 0.004, BLACK);
  g.box(0, 0.018, -0.06, 0.034, 0.03, 0.19, body); // Rahmen
  g.box(0, -0.045, 0.012, 0.034, 0.11, 0.05, dark, { rx: -0.25 }); // Griff
  g.box(0, -0.01, -0.045, 0.01, 0.01, 0.06, BLACK); // Abzugsbügel
  g.box(0, 0.083, -0.17, 0.006, 0.012, 0.01, BLACK); // Korn
  g.box(0.009, 0.083, 0.03, 0.006, 0.014, 0.01, BLACK); // Kimme
  g.box(-0.009, 0.083, 0.03, 0.006, 0.014, 0.01, BLACK);
  g.cyl(0, 0.05, -0.19, 0.009, 0.02, BLACK, { rx: Math.PI / 2, seg: 6 });
}

function ar(g, r, detail) {
  const A = RAR_BODY[r], B = BLACK, Cc = RAR_LIGHT[r];
  g.box(0, 0.038, -0.1, 0.072, 0.082, 0.44, A);
  g.box(0, 0.083, -0.1, 0.06, 0.012, 0.42, A, { vary: 0.02 });
  g.box(0, -0.018, -0.02, 0.066, 0.05, 0.25, B);
  g.box(0, 0.094, -0.14, 0.034, 0.016, 0.38, B);
  if (detail) for (let i = 0; i < 11; i++) g.box(0, 0.104, -0.31 + i * 0.034, 0.038, 0.008, 0.012, B);
  g.box(0, 0.032, -0.4, 0.078, 0.078, 0.24, B);
  if (detail) for (let i = 0; i < 4; i++) {
    g.box(0.04, 0.035, -0.47 + i * 0.05, 0.004, 0.03, 0.025, 0x0c0c0c);
    g.box(-0.04, 0.035, -0.47 + i * 0.05, 0.004, 0.03, 0.025, 0x0c0c0c);
  }
  g.box(0, 0.075, -0.4, 0.04, 0.012, 0.22, B);
  g.cyl(0, 0.036, -0.575, 0.014, 0.13, 0x222222, { rx: Math.PI / 2, seg: 6 });
  g.cyl(0, 0.036, -0.66, 0.026, 0.075, B, { rx: Math.PI / 2, seg: 6 });
  if (detail) {
    g.box(0.027, 0.036, -0.66, 0.006, 0.012, 0.05, Cc);
    g.box(-0.027, 0.036, -0.66, 0.006, 0.012, 0.05, Cc);
  }
  // Korn + Kimme (Visierlinie 0.13)
  g.box(0, 0.075, -0.53, 0.03, 0.03, 0.03, B);
  g.box(0, 0.1, -0.53, 0.014, 0.02, 0.014, B);
  g.box(0, 0.12, -0.53, 0.005, 0.02, 0.005, B);
  g.box(0.013, 0.117, -0.53, 0.004, 0.026, 0.012, B);
  g.box(-0.013, 0.117, -0.53, 0.004, 0.026, 0.012, B);
  if (detail) g.box(0, 0.128, -0.53, 0.0055, 0.004, 0.0055, Cc);
  g.box(0, 0.108, 0.02, 0.04, 0.012, 0.035, B);
  g.box(0.0115, 0.122, 0.02, 0.009, 0.016, 0.018, B);
  g.box(-0.0115, 0.122, 0.02, 0.009, 0.016, 0.018, B);
  g.box(0, -0.075, 0.045, 0.042, 0.12, 0.055, B, { rx: -0.35 });
  g.box(0, -0.052, -0.035, 0.012, 0.012, 0.09, B);
  g.box(0, 0.03, 0.2, 0.052, 0.07, 0.2, A);
  g.box(0, 0.075, 0.2, 0.046, 0.022, 0.18, B);
  g.box(0, -0.005, 0.29, 0.058, 0.13, 0.035, B);
  g.box(0, -0.035, 0.18, 0.03, 0.03, 0.14, A, { rx: 0.25 });
  g.box(0.045, 0.05, -0.02, 0.02, 0.018, 0.035, Cc);
  g.box(0.037, 0.055, -0.07, 0.004, 0.028, 0.06, 0x111111);
  if (detail) {
    g.box(0.037, 0.02, -0.12, 0.003, 0.012, 0.3, Cc);
    g.box(-0.037, 0.02, -0.12, 0.003, 0.012, 0.3, Cc);
  }
}

function drum(g, r, detail) {
  const band = RAR_BODY[r];
  g.box(0, 0.035, -0.12, 0.06, 0.07, 0.36, BLACK); // Gehäuse
  g.box(0, 0.075, -0.12, 0.05, 0.014, 0.34, GUNMETAL);
  g.box(0.031, 0.035, -0.1, 0.004, 0.035, 0.2, band); // Seltenheitsstreifen
  g.box(-0.031, 0.035, -0.1, 0.004, 0.035, 0.2, band);
  g.cyl(0, 0.03, -0.44, 0.024, 0.26, BLACK, { rx: Math.PI / 2, seg: 8 }); // Lauf
  if (detail) for (let i = 0; i < 7; i++) g.cyl(0, 0.03, -0.35 - i * 0.028, 0.03, 0.01, GUNMETAL, { rx: Math.PI / 2, seg: 8 }); // Kühlrippen
  g.cyl(0, 0.03, -0.585, 0.028, 0.04, GUNMETAL, { rx: Math.PI / 2, seg: 8 });
  g.box(0, 0.09, -0.56, 0.008, 0.03, 0.008, BLACK); // Korn
  g.box(0, 0.094, 0.0, 0.03, 0.02, 0.02, BLACK); // Kimme
  // Trommelmagazin
  g.cyl(0, -0.08, -0.14, 0.085, 0.05, 0x2d3036, { rz: Math.PI / 2, seg: 14 });
  g.cyl(0, -0.08, -0.14, 0.05, 0.056, band, { rz: Math.PI / 2, seg: 10 });
  // Holz: Pistolengriff, Vordergriff, Schaft
  g.box(0, -0.07, 0.05, 0.04, 0.12, 0.055, WOOD, { rx: -0.3 });
  g.box(0, -0.1, -0.3, 0.036, 0.12, 0.045, WOOD, { rx: 0.15 });
  g.box(0, 0.02, 0.2, 0.05, 0.075, 0.22, WOOD, { rx: 0.08 });
  g.box(0, -0.01, 0.31, 0.056, 0.12, 0.03, WOOD_DARK);
  g.box(0, -0.025, -0.035, 0.012, 0.012, 0.07, BLACK);
}

function tac(g, r, detail) {
  const A = RAR_BODY[r], L = RAR_LIGHT[r];
  // Hülle um den Lauf (Seltenheitsfarbe, kantig wie im Bild)
  g.box(0, 0.035, -0.42, 0.09, 0.1, 0.34, A);
  g.box(0, 0.09, -0.42, 0.07, 0.02, 0.3, A, { vary: 0.02 });
  if (detail) {
    g.box(0.046, 0.05, -0.42, 0.004, 0.02, 0.2, BLACK);
    g.box(-0.046, 0.05, -0.42, 0.004, 0.02, 0.2, BLACK);
    for (const z of [-0.33, -0.5]) g.cyl(0.048, 0.01, z, 0.008, 0.01, GUNMETAL, { rz: Math.PI / 2, seg: 6 });
  }
  g.box(0, -0.03, -0.4, 0.07, 0.05, 0.28, A);
  g.box(0, 0.035, -0.62, 0.075, 0.075, 0.08, BLACK); // Mündungsbremse
  if (detail) for (let k = 0; k < 4; k++) g.box(Math.cos(k * 1.57) * 0.03, 0.035 + Math.sin(k * 1.57) * 0.03, -0.67, 0.015, 0.015, 0.03, BLACK);
  // Gehäuse
  g.box(0, 0.03, -0.1, 0.07, 0.085, 0.26, GUNMETAL);
  g.box(0, 0.08, -0.1, 0.03, 0.015, 0.24, BLACK);
  g.box(0.036, 0.03, -0.08, 0.004, 0.03, 0.05, L); // Seltenheits-Akzent
  g.box(0, -0.075, 0.03, 0.042, 0.12, 0.055, BLACK, { rx: -0.3 });
  g.box(0, -0.035, -0.05, 0.012, 0.012, 0.07, BLACK);
  // Schaft mit Patronenhalter
  g.box(0, 0.02, 0.16, 0.05, 0.07, 0.2, BLACK);
  g.box(0, -0.015, 0.27, 0.06, 0.12, 0.035, BLACK);
  if (detail) for (let i = 0; i < 4; i++) g.cyl(0.03, 0.03 - i * 0.02, 0.18, 0.009, 0.05, 0xc0392b, { rz: Math.PI / 2, seg: 6 });
  g.box(0, 0.1, -0.52, 0.008, 0.02, 0.008, BLACK);
}

function pump(g, r, detail) {
  const band = RAR_BODY[r];
  g.cyl(0, 0.035, -0.5, 0.025, 0.56, 0x2b2f35, { rx: Math.PI / 2, seg: 8 }); // Lauf
  g.box(0, 0.064, -0.5, 0.014, 0.01, 0.56, BLACK); // Laufschiene
  if (detail) for (let i = 0; i < 12; i++) g.box(0, 0.07, -0.26 - i * 0.04, 0.016, 0.006, 0.01, GUNMETAL);
  g.cyl(0, 0.0, -0.44, 0.02, 0.36, BLACK, { rx: Math.PI / 2, seg: 8 }); // Röhrenmagazin
  g.box(0, 0.0, -0.36, 0.058, 0.055, 0.18, WOOD); // Pumpgriff
  if (detail) for (let i = 0; i < 4; i++) g.box(0, 0.029, -0.3 - i * 0.04, 0.06, 0.005, 0.012, WOOD_DARK);
  g.box(0, 0.03, -0.1, 0.065, 0.085, 0.22, BLACK); // Gehäuse
  g.box(0.034, 0.035, -0.1, 0.004, 0.035, 0.1, band);
  g.box(0.034, 0.04, -0.06, 0.004, 0.02, 0.05, 0x5a5f66);
  g.box(0, -0.04, 0.02, 0.012, 0.03, 0.06, BLACK); // Abzugsbügel
  g.box(0, 0.0, 0.14, 0.05, 0.08, 0.16, WOOD, { rx: 0.12 }); // Holzschaft
  g.box(0, -0.03, 0.26, 0.055, 0.12, 0.12, WOOD, { rx: 0.2 });
  g.box(0, -0.04, 0.33, 0.058, 0.13, 0.02, WOOD_DARK, { rx: 0.2 });
  g.box(0, 0.08, -0.77, 0.008, 0.012, 0.008, 0xd0c070); // Perlkorn
}

function sniper(g, r, detail) {
  const A = RAR_BODY[r], L = RAR_LIGHT[r];
  g.box(0, 0.03, -0.1, 0.07, 0.08, 0.34, A); // Gehäuse
  g.box(0, 0.075, -0.1, 0.05, 0.012, 0.3, BLACK);
  g.cyl(0, 0.03, -0.55, 0.022, 0.56, 0x2b2f35, { rx: Math.PI / 2, seg: 8 }); // schwerer Lauf
  g.box(0, 0.03, -0.9, 0.06, 0.05, 0.1, BLACK); // Mündungsbremse
  if (detail) for (const x of [-0.031, 0.031]) g.box(x, 0.03, -0.9, 0.004, 0.03, 0.06, 0x111111);
  g.box(0, 0.03, -0.35, 0.08, 0.07, 0.26, A); // Handschutz
  if (detail) g.box(0.041, 0.03, -0.35, 0.003, 0.02, 0.2, L);
  // Zielfernrohr
  g.cyl(0, 0.16, -0.12, 0.03, 0.3, BLACK, { rx: Math.PI / 2, seg: 10 });
  g.cyl(0, 0.16, -0.3, 0.04, 0.07, BLACK, { rx: Math.PI / 2, seg: 10 });
  g.cyl(0, 0.16, 0.04, 0.036, 0.05, BLACK, { rx: Math.PI / 2, seg: 10 });
  g.box(0, 0.11, -0.05, 0.03, 0.04, 0.03, BLACK);
  g.box(0, 0.11, -0.2, 0.03, 0.04, 0.03, BLACK);
  if (detail) g.cyl(0, 0.16, -0.338, 0.034, 0.004, 0x5fb8ff, { rx: Math.PI / 2, seg: 10, e: 0.4 });
  // Griff, Kammerstängel, Schaft, Zweibein
  g.box(0, -0.07, 0.05, 0.042, 0.12, 0.055, BLACK, { rx: -0.3 });
  g.box(0.05, 0.05, 0.0, 0.05, 0.014, 0.014, BLACK);
  g.box(0.075, 0.05, 0.0, 0.02, 0.02, 0.02, GUNMETAL);
  g.box(0, 0.02, 0.2, 0.06, 0.08, 0.22, A);
  g.box(0, 0.07, 0.19, 0.05, 0.02, 0.12, BLACK);
  g.box(0, -0.01, 0.31, 0.066, 0.14, 0.035, BLACK);
  g.box(0, -0.03, -0.42, 0.012, 0.012, 0.16, BLACK, { rx: 0.2 });
}

const BUILDERS = { pistol, ar, drum, tac, pump, sniper };

const geoCache = new Map();
export function weaponGeometry(type, rarity, detail = 1) {
  const key = type + rarity + ':' + detail;
  let geo = geoCache.get(key);
  if (!geo) {
    const g = new GeoBuilder();
    BUILDERS[type](g, rarity, detail);
    geo = g.toGeometry();
    geoCache.set(key, geo);
  }
  return geo;
}

// abnehmbares Magazin für die Nachlade-Animation (Ursprung = Magazinschacht)
export function magazineGeometry(type, rarity) {
  const key = 'mag:' + type + rarity;
  let geo = geoCache.get(key);
  if (!geo) {
    const g = new GeoBuilder();
    const B = RAR_BODY[rarity], D = BLACK;
    if (type === 'ar') {
      g.box(0, -0.05, 0.01, 0.044, 0.13, 0.075, D, { rx: 0.18 });
      g.box(0, -0.14, 0.025, 0.042, 0.08, 0.07, B, { rx: 0.36 });
    } else if (type === 'pistol') {
      g.box(0, -0.05, 0, 0.028, 0.1, 0.04, D, { rx: -0.25 });
    } else if (type === 'drum') {
      g.cyl(0, -0.02, 0, 0.085, 0.05, 0x2d3036, { rz: Math.PI / 2, seg: 14 });
      g.cyl(0, -0.02, 0, 0.05, 0.056, B, { rz: Math.PI / 2, seg: 10 });
    } else {
      g.box(0, -0.03, 0, 0.04, 0.06, 0.08, D);
    }
    geo = g.toGeometry();
    geoCache.set(key, geo);
  }
  return geo;
}

// Heil-/Schild-Gegenstände (Ursprung = Boden des Gegenstands)
export function consumableGeometry(type) {
  const key = 'c:' + type;
  let geo = geoCache.get(key);
  if (!geo) {
    const g = new GeoBuilder();
    if (type === 'mini') {
      g.ico(0, 0.05, 0, 0.05, 0x3fb2ff, { detail: 1, e: 0.35, jitter: 0 });
      g.cyl(0, 0.11, 0, 0.017, 0.04, 0x9fe0ff, { seg: 8 });
      g.cyl(0, 0.14, 0, 0.02, 0.02, 0xc08a50, { seg: 8 });
      g.ico(0, 0.05, 0, 0.056, 0xbfeaff, { detail: 1, jitter: 0, sy: 0.35 });
    } else if (type === 'big') {
      g.cyl(0, 0.08, 0, 0.065, 0.16, 0x2f8fff, { seg: 10, e: 0.35 });
      g.cyl(0, 0.08, 0, 0.068, 0.07, 0xf2f2f2, { seg: 10 });
      g.cyl(0, 0.18, 0, 0.035, 0.05, 0x7fcaff, { seg: 8 });
      g.cyl(0, 0.215, 0, 0.04, 0.025, 0x3a3f46, { seg: 8 });
      g.box(0.07, 0.12, 0, 0.012, 0.06, 0.03, 0x3a3f46);
    } else {
      g.box(0, 0.08, 0, 0.22, 0.16, 0.1, 0xf5f5f5);
      g.box(0, 0.165, 0, 0.1, 0.02, 0.03, 0x888888);
      g.box(0, 0.08, -0.052, 0.1, 0.03, 0.01, 0xe63946, { e: 0.3 });
      g.box(0, 0.08, -0.052, 0.03, 0.1, 0.01, 0xe63946, { e: 0.3 });
    }
    geo = g.toGeometry();
    geoCache.set(key, geo);
  }
  return geo;
}

export const AMMO_COLORS = { light: 0x8fb0c8, medium: 0x5fae3e, heavy: 0x9b3d2c, shells: 0xd9442f };

export function ammoGeometry(type) {
  const key = 'a:' + type;
  let geo = geoCache.get(key);
  if (!geo) {
    const g = new GeoBuilder();
    g.box(0, 0.09, 0, 0.36, 0.18, 0.22, 0x5b6147);
    g.box(0, 0.185, 0, 0.37, 0.02, 0.23, 0x444a36);
    g.box(0, 0.1, -0.112, 0.2, 0.08, 0.005, AMMO_COLORS[type], { e: 0.25 });
    for (let i = 0; i < 3; i++) g.cyl(-0.08 + i * 0.08, 0.24, 0, 0.018, 0.08, 0xe6b84a, { seg: 6 });
    geo = g.toGeometry();
    geoCache.set(key, geo);
  }
  return geo;
}

// Truhe: Kiste (Rumpf) + Deckel getrennt für die Öffnen-Animation
export function chestGeometry(part) {
  const key = 'chest:' + part;
  let geo = geoCache.get(key);
  if (!geo) {
    const g = new GeoBuilder();
    const wood = 0x8b5a2b, gold = 0xf2c230;
    if (part === 'body') {
      g.box(0, 0.3, 0, 1.1, 0.6, 0.66, wood);
      for (const x of [-0.5, 0.5]) g.box(x, 0.3, 0, 0.08, 0.62, 0.68, gold, { e: 0.25 });
      g.box(0, 0.05, 0, 1.14, 0.08, 0.7, gold, { e: 0.2 });
      g.box(0, 0.55, -0.34, 0.16, 0.16, 0.04, gold, { e: 0.5 });
    } else {
      g.box(0, 0.12, 0.33, 1.1, 0.24, 0.66, wood);
      g.box(0, 0.22, 0.33, 1.1, 0.08, 0.5, wood);
      for (const x of [-0.5, 0.5]) g.box(x, 0.14, 0.33, 0.08, 0.3, 0.68, gold, { e: 0.25 });
      g.box(0, 0.0, 0.0, 1.14, 0.05, 0.05, gold, { e: 0.2 });
    }
    geo = g.toGeometry();
    geoCache.set(key, geo);
  }
  return geo;
}

// Gegenstand als Mesh (Viewmodel, Figuren, Bodenbeute)
export function itemGeometry(item, detail = 1) {
  if (!item) return null;
  if (item.k === 'w') return weaponGeometry(item.w, item.r, detail);
  if (item.k === 'c') return consumableGeometry(item.c);
  return ammoGeometry(item.a);
}

let sharedMat = null;
export function itemMaterial() {
  sharedMat = sharedMat || worldMaterial();
  return sharedMat;
}

export function createItemMesh(item, detail = 1) {
  const m = new THREE.Mesh(itemGeometry(item, detail), itemMaterial());
  return m;
}
