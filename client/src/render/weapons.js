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
  pistol: { sightY: 0.09, muzzle: [0, 0.05, -0.2], eject: [0.03, 0.06, -0.03], mag: [0, -0.06, 0.02], fore: null, hip: [0.25, -0.24, -0.55], adsZ: -0.48, adsDrop: 0.03, scale: 1.0 },
  ar: { sightY: 0.13, muzzle: [0, 0.036, -0.7], eject: [0.045, 0.055, -0.06], mag: [0, -0.04, -0.13], fore: [0, -0.01, -0.36], hip: [0.28, -0.26, -0.66], adsZ: -0.64, adsDrop: 0.035, scale: 1.0 },
  drum: { sightY: 0.12, muzzle: [0, 0.03, -0.62], eject: [0.04, 0.05, -0.08], mag: [0, -0.06, -0.14], fore: [0, -0.1, -0.3], hip: [0.28, -0.265, -0.66], adsZ: -0.6, adsDrop: 0.035, scale: 1.0 },
  tac: { sightY: 0.11, muzzle: [0, 0.03, -0.66], eject: [0.05, 0.05, -0.05], mag: null, fore: [0, -0.03, -0.38], hip: [0.28, -0.265, -0.66], adsZ: -0.54, adsDrop: 0.065, scale: 1.0 },
  pump: { sightY: 0.1, muzzle: [0, 0.035, -0.78], eject: [0.05, 0.04, -0.05], mag: null, fore: [0, -0.02, -0.42], hip: [0.28, -0.265, -0.68], adsZ: -0.56, adsDrop: 0.065, scale: 1.0 },
  hammer: { sightY: 0.1, muzzle: [0, 0.04, -0.72], eject: [0.05, 0.05, -0.05], mag: null, fore: [0, -0.02, -0.36], hip: [0.28, -0.265, -0.66], adsZ: -0.54, adsDrop: 0.065, scale: 1.0 },
  knife: { sightY: 0.04, muzzle: [0, 0.01, -0.27], eject: [0, 0, 0], mag: null, fore: null, hip: [0.2, -0.17, -0.34], adsZ: -0.4, scale: 1.0, melee: true },
  sniper: { sightY: 0.16, muzzle: [0, 0.03, -0.95], eject: [0.05, 0.06, -0.04], mag: [0, -0.04, -0.12], fore: [0, -0.02, -0.4], hip: [0.28, -0.265, -0.7], adsZ: -0.4, scale: 1.0 },
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

// SCAR (Sturmgewehr): Oberteil in Seltenheitsfarbe mit durchgehender Picatinny-Schiene,
// schlanker Handschutz mit Seitenschienen, schwarzes Unterteil, Ladehebel links, Gasblock,
// Mündungsfeuerdämpfer, Klapp-Schaft mit Wangenauflage – Visierlinie bei y = 0.13
function ar(g, r, detail) {
  const A = RAR_BODY[r], D = RAR_DARK[r], L = RAR_LIGHT[r], B = BLACK, M = GUNMETAL;
  // Oberes Gehäuse
  g.box(0, 0.05, -0.1, 0.07, 0.064, 0.36, A);
  g.box(0, 0.013, -0.1, 0.062, 0.012, 0.36, D);
  g.box(0.036, 0.062, -0.1, 0.004, 0.008, 0.34, D);
  g.box(-0.036, 0.062, -0.1, 0.004, 0.008, 0.34, D);
  // Handschutz vorn, unten abgeschrägt
  g.box(0, 0.046, -0.4, 0.062, 0.07, 0.24, A);
  g.box(0, 0.004, -0.4, 0.05, 0.016, 0.24, D);
  if (detail) {
    for (const x of [-0.033, 0.033]) {
      g.box(x, 0.038, -0.43, 0.006, 0.018, 0.17, B);
      for (let i = 0; i < 7; i++) g.box(x * 1.08, 0.038, -0.505 + i * 0.026, 0.004, 0.022, 0.008, M);
    }
    for (let i = 0; i < 3; i++) g.box(0, -0.005, -0.47 + i * 0.05, 0.03, 0.006, 0.02, B);
  }
  // durchgehende Schiene oben
  g.box(0, 0.088, -0.2, 0.032, 0.012, 0.62, B);
  if (detail) for (let i = 0; i < 20; i++) g.box(0, 0.097, -0.495 + i * 0.03, 0.036, 0.007, 0.012, B);
  // Auswurffenster rechts, Ladehebel links, Magazinlöser, Seltenheitsakzente
  g.box(0.036, 0.048, -0.05, 0.004, 0.028, 0.075, 0x101214);
  g.box(-0.047, 0.06, -0.21, 0.026, 0.014, 0.028, B);
  g.box(-0.063, 0.06, -0.21, 0.012, 0.024, 0.026, M);
  if (detail) {
    g.box(0.037, 0.03, -0.16, 0.003, 0.008, 0.24, L);
    g.box(-0.037, 0.03, -0.16, 0.003, 0.008, 0.24, L);
    g.box(0.034, -0.012, -0.1, 0.006, 0.012, 0.014, M);
  }
  // Lauf, Gasblock, Mündungsfeuerdämpfer
  g.cyl(0, 0.04, -0.585, 0.013, 0.14, 0x2a2d31, { rx: Math.PI / 2, seg: 8 });
  g.box(0, 0.05, -0.54, 0.03, 0.034, 0.028, B);
  g.cyl(0, 0.04, -0.675, 0.02, 0.07, B, { rx: Math.PI / 2, seg: 8 });
  if (detail) for (let k = 0; k < 4; k++) g.box(Math.cos(k * 1.57) * 0.018, 0.04 + Math.sin(k * 1.57) * 0.018, -0.69, 0.008, 0.008, 0.035, 0x0c0c0c);
  // Korn vorn (Schutzohren) und Lochkimme hinten
  g.box(0, 0.104, -0.49, 0.028, 0.02, 0.024, B);
  g.box(0.012, 0.122, -0.49, 0.004, 0.026, 0.014, B);
  g.box(-0.012, 0.122, -0.49, 0.004, 0.026, 0.014, B);
  g.box(0, 0.121, -0.49, 0.005, 0.022, 0.005, B);
  if (detail) g.box(0, 0.131, -0.49, 0.0055, 0.004, 0.0055, L);
  g.box(0, 0.104, 0.06, 0.034, 0.018, 0.032, B);
  g.box(0.012, 0.124, 0.06, 0.008, 0.024, 0.014, B);
  g.box(-0.012, 0.124, 0.06, 0.008, 0.024, 0.014, B);
  g.box(0, 0.137, 0.06, 0.032, 0.006, 0.014, B);
  // Unteres Gehäuse, Magazinschacht, Abzug, Pistolengriff
  g.box(0, -0.004, -0.04, 0.062, 0.034, 0.22, B);
  g.box(0, -0.035, -0.125, 0.05, 0.04, 0.084, B);
  g.box(0, -0.052, -0.03, 0.01, 0.01, 0.085, B);
  g.box(0, -0.036, -0.07, 0.01, 0.034, 0.01, B);
  g.box(0, -0.032, -0.03, 0.006, 0.024, 0.006, M, { rx: 0.3 });
  g.box(0, -0.075, 0.045, 0.042, 0.12, 0.056, B, { rx: -0.35 });
  if (detail) for (let i = 0; i < 4; i++) g.box(0, -0.05 - i * 0.022, 0.018 + i * 0.008, 0.044, 0.006, 0.006, 0x31353b, { rx: -0.35 });
  // Klapp-Schaft: Scharnier, Oberholm, Wangenauflage, Unterholm, Schaftkappe
  g.box(0, 0.048, 0.1, 0.052, 0.06, 0.03, B);
  g.box(0, 0.06, 0.205, 0.046, 0.038, 0.2, A);
  g.box(0, 0.086, 0.21, 0.04, 0.016, 0.14, D);
  g.box(0, 0.002, 0.2, 0.03, 0.026, 0.19, A, { rx: 0.2 });
  g.box(0, 0.02, 0.312, 0.052, 0.13, 0.03, B);
  g.box(0, 0.02, 0.33, 0.054, 0.134, 0.008, 0x141517);
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

// Taktische Schrotflinte: kantiger Hitzeschutz in Seltenheitsfarbe mit Lüftungsschlitzen,
// Mündungsbremse, schwarzes Gehäuse, Pistolengriff und Schaft mit Patronenhalter
function tac(g, r, detail) {
  const A = RAR_BODY[r], D = RAR_DARK[r], L = RAR_LIGHT[r];
  g.box(0, 0.038, -0.42, 0.09, 0.1, 0.34, A);
  g.box(0, 0.093, -0.42, 0.07, 0.02, 0.3, D);
  g.box(0, -0.028, -0.4, 0.07, 0.05, 0.28, A);
  if (detail) {
    for (let i = 0; i < 5; i++) {
      g.box(0.046, 0.045, -0.53 + i * 0.05, 0.004, 0.04, 0.02, BLACK);
      g.box(-0.046, 0.045, -0.53 + i * 0.05, 0.004, 0.04, 0.02, BLACK);
    }
    g.box(0.046, -0.02, -0.42, 0.004, 0.012, 0.22, L);
    g.box(-0.046, -0.02, -0.42, 0.004, 0.012, 0.22, L);
  }
  g.box(0, 0.038, -0.62, 0.08, 0.08, 0.08, BLACK);
  if (detail) for (let k = 0; k < 4; k++) g.box(Math.cos(k * 1.57) * 0.03, 0.038 + Math.sin(k * 1.57) * 0.03, -0.67, 0.016, 0.016, 0.03, BLACK);
  // Gehäuse
  g.box(0, 0.032, -0.1, 0.07, 0.085, 0.26, GUNMETAL);
  g.box(0, 0.082, -0.1, 0.03, 0.015, 0.24, BLACK);
  g.box(0.036, 0.04, -0.06, 0.004, 0.026, 0.07, 0x101214);
  g.box(0.036, 0.012, -0.14, 0.004, 0.02, 0.06, L);
  g.box(0, -0.075, 0.03, 0.042, 0.12, 0.055, BLACK, { rx: -0.3 });
  g.box(0, -0.035, -0.05, 0.012, 0.012, 0.07, BLACK);
  g.box(0, -0.025, -0.05, 0.006, 0.02, 0.006, GUNMETAL, { rx: 0.3 });
  // Schaft mit Patronenhalter
  g.box(0, 0.024, 0.16, 0.05, 0.07, 0.2, BLACK);
  g.box(0, 0.058, 0.17, 0.042, 0.014, 0.14, D);
  g.box(0, -0.012, 0.27, 0.06, 0.12, 0.035, BLACK);
  if (detail) for (let i = 0; i < 4; i++) {
    g.cyl(0.03, 0.035 - i * 0.02, 0.18, 0.009, 0.05, 0xc0392b, { rz: Math.PI / 2, seg: 6 });
    g.cyl(0.056, 0.035 - i * 0.02, 0.18, 0.009, 0.006, 0xd9b24a, { rz: Math.PI / 2, seg: 6 });
  }
  g.box(0, 0.102, -0.52, 0.008, 0.02, 0.008, BLACK);
  g.box(0, 0.11, -0.52, 0.006, 0.006, 0.006, L, { e: 0.3 });
}

// Pump-Schrotflinte: Holzschaft + geriffelter Holz-Pumpgriff, schwarzes Gehäuse mit
// Seltenheits-Seitenplatte, Lauf mit Laufschiene und Perlkorn, Röhrenmagazin mit Endkappe
function pump(g, r, detail) {
  const A = RAR_BODY[r], L = RAR_LIGHT[r];
  g.cyl(0, 0.038, -0.5, 0.024, 0.56, 0x2b2f35, { rx: Math.PI / 2, seg: 10 });
  g.box(0, 0.066, -0.5, 0.014, 0.01, 0.56, BLACK);
  if (detail) for (let i = 0; i < 12; i++) g.box(0, 0.072, -0.26 - i * 0.04, 0.016, 0.006, 0.01, GUNMETAL);
  g.cyl(0, 0.038, -0.785, 0.029, 0.03, BLACK, { rx: Math.PI / 2, seg: 10 });
  g.cyl(0, -0.004, -0.44, 0.02, 0.36, BLACK, { rx: Math.PI / 2, seg: 8 });
  g.cyl(0, -0.004, -0.625, 0.024, 0.03, GUNMETAL, { rx: Math.PI / 2, seg: 8 });
  g.box(0, 0.02, -0.64, 0.012, 0.04, 0.012, BLACK);
  // Pumpgriff (Holz, geriffelt)
  g.box(0, -0.004, -0.36, 0.062, 0.058, 0.2, WOOD);
  if (detail) for (let i = 0; i < 6; i++) {
    g.box(0.032, -0.004, -0.29 - i * 0.028, 0.004, 0.05, 0.01, WOOD_DARK);
    g.box(-0.032, -0.004, -0.29 - i * 0.028, 0.004, 0.05, 0.01, WOOD_DARK);
  }
  // Gehäuse mit Seltenheitsplatte und Auswurffenster
  g.box(0, 0.032, -0.1, 0.066, 0.09, 0.24, BLACK);
  g.box(0, 0.08, -0.1, 0.05, 0.012, 0.22, GUNMETAL);
  g.box(0.034, 0.03, -0.12, 0.004, 0.05, 0.16, A);
  g.box(-0.034, 0.03, -0.12, 0.004, 0.05, 0.16, A);
  g.box(0.036, 0.05, -0.07, 0.004, 0.024, 0.06, 0x101214);
  if (detail) g.box(0.036, 0.012, -0.16, 0.003, 0.008, 0.08, L);
  // Abzugsbügel + Abzug
  g.box(0, -0.035, -0.02, 0.01, 0.01, 0.08, BLACK);
  g.box(0, -0.025, -0.02, 0.006, 0.022, 0.006, GUNMETAL, { rx: 0.3 });
  // Holzschaft mit Griffstück, Schaftkappe
  g.box(0, -0.002, 0.07, 0.05, 0.07, 0.08, WOOD, { rx: 0.25 });
  g.box(0, -0.02, 0.18, 0.052, 0.09, 0.16, WOOD, { rx: 0.14 });
  g.box(0, -0.036, 0.28, 0.056, 0.13, 0.08, WOOD, { rx: 0.2 });
  g.box(0, -0.045, 0.325, 0.058, 0.136, 0.022, 0x2a1a10, { rx: 0.2 });
  if (detail) g.box(0.028, -0.02, 0.2, 0.004, 0.03, 0.06, A);
  // Perlkorn
  g.box(0, 0.082, -0.77, 0.009, 0.012, 0.009, 0xe8d890, { e: 0.3 });
}

// Hammer-Pump: schwarzes Polymer statt Holz, gelochter Hitzeschild über dem Lauf, Pumpgriff und
// Seitenplatten in Seltenheitsfarbe, Pistolengriff und Skelettschaft – klar anders als die Holz-Pump
function hammer(g, r, detail) {
  const A = RAR_BODY[r], D = RAR_DARK[r], L = RAR_LIGHT[r];
  // Lauf + Magazinrohr
  g.cyl(0, 0.04, -0.46, 0.022, 0.48, 0x2b2f35, { rx: Math.PI / 2, seg: 10 });
  g.cyl(0, 0.04, -0.705, 0.03, 0.03, BLACK, { rx: Math.PI / 2, seg: 10 });
  g.cyl(0, 0.0, -0.42, 0.022, 0.34, BLACK, { rx: Math.PI / 2, seg: 8 });
  // Hitzeschild mit Löchern
  g.box(0, 0.07, -0.47, 0.05, 0.012, 0.38, D);
  for (const x of [-0.026, 0.026]) g.box(x, 0.055, -0.47, 0.004, 0.03, 0.38, D);
  if (detail) for (let i = 0; i < 7; i++) for (const x of [-0.029, 0.029]) g.box(x, 0.055, -0.32 - i * 0.05, 0.003, 0.014, 0.022, 0x111316);
  // Pumpgriff in Seltenheitsfarbe mit Rillen
  g.box(0, 0.0, -0.36, 0.066, 0.06, 0.18, A);
  if (detail) for (let i = 0; i < 5; i++) for (const x of [-0.034, 0.034]) g.box(x, 0.0, -0.29 - i * 0.034, 0.004, 0.05, 0.012, D);
  g.box(0, -0.034, -0.36, 0.05, 0.012, 0.16, D);
  // Gehäuse
  g.box(0, 0.036, -0.1, 0.07, 0.094, 0.24, BLACK);
  g.box(0, 0.088, -0.1, 0.052, 0.014, 0.22, GUNMETAL);
  if (detail) for (let i = 0; i < 9; i++) g.box(0, 0.098, -0.02 - i * 0.022, 0.054, 0.006, 0.008, BLACK);
  g.box(0.036, 0.04, -0.12, 0.004, 0.06, 0.18, A);
  g.box(-0.036, 0.04, -0.12, 0.004, 0.06, 0.18, A);
  g.box(0.038, 0.058, -0.07, 0.004, 0.026, 0.07, 0x101214);
  if (detail) g.box(0.038, 0.016, -0.16, 0.003, 0.008, 0.1, L, { e: 0.2 });
  // Abzug + Pistolengriff
  g.box(0, -0.034, -0.03, 0.01, 0.01, 0.08, BLACK);
  g.box(0, -0.024, -0.03, 0.006, 0.022, 0.006, GUNMETAL, { rx: 0.3 });
  g.box(0, -0.07, 0.03, 0.044, 0.1, 0.05, BLACK, { rx: -0.3 });
  if (detail) g.box(0.023, -0.07, 0.03, 0.003, 0.07, 0.03, D, { rx: -0.3 });
  // Skelettschaft
  g.box(0, 0.035, 0.1, 0.03, 0.03, 0.14, BLACK);
  g.box(0, -0.02, 0.12, 0.024, 0.024, 0.16, BLACK, { rx: -0.35 });
  g.box(0, 0.0, 0.2, 0.05, 0.12, 0.03, A);
  g.box(0, 0.0, 0.216, 0.054, 0.126, 0.012, 0x1a1c20);
  // Kimme + leuchtendes Korn
  g.box(0, 0.084, -0.66, 0.008, 0.016, 0.01, 0xff5a3a, { e: 0.6 });
  g.box(0, 0.1, -0.03, 0.03, 0.012, 0.012, BLACK);
}

// Messer (Nahkampf): Klinge nach −Z, Griff am Ursprung. r = Skin (siehe KNIFE_SKINS):
// 0 Jagdmesser (Stahl, Holzgriff), 1 Taktisch (schwarzes Tanto mit Sägerücken),
// 2 Neon (leuchtende Klinge mit Aussparung), 3 Gold (Bowie mit Clip-Spitze),
// 4 Drache (gebogenes Karambit mit Fingerring). Keine Parierstange – echte Messer, keine Schwerter.
const KNIFE_LOOK = [
  { blade: 0xd7dde5, edge: 0xffffff, bolster: 0x8b939e, grip: 0x6b4226, accent: 0xc8ccd2, e: 0 },
  { blade: 0x2b2f35, edge: 0xa6afba, bolster: 0x15171a, grip: 0x3d4a2e, accent: 0x1b1d20, e: 0 },
  { blade: 0x17cfe8, edge: 0xc8fcff, bolster: 0x101830, grip: 0x141a2e, accent: 0xff3fd0, e: 0.9 },
  { blade: 0xf5c542, edge: 0xfff2b0, bolster: 0xb8860b, grip: 0x5a2e0e, accent: 0xffe07a, e: 0.25 },
  { blade: 0xb3121e, edge: 0xffb24a, bolster: 0x1a0a0a, grip: 0x220808, accent: 0xffc23a, e: 0.35 },
];

// Klinge aus schräg gestellten Segmenten entlang −Z ab z0: prof(t) = [unten, oben] bei t
// (0 = Heft, 1 = Spitze); unten liegt die Schneide
function blade(g, z0, len, prof, th, color, edgeCol, e, n) {
  const dz = len / n;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const [a0, b0] = prof(t0), [a1, b1] = prof(t1);
    const y0 = (a0 + b0) / 2, y1 = (a1 + b1) / 2;
    const h = Math.max(0.003, (b0 - a0 + b1 - a1) / 2);
    const zc = z0 - ((t0 + t1) / 2) * len;
    g.box(0, (y0 + y1) / 2, zc, th, h, Math.hypot(dz, y1 - y0) + 0.002, color, { rx: Math.atan2(y1 - y0, dz), e: e * 0.6 });
    if (h > 0.008) g.box(0, (a0 + a1) / 2 + 0.003, zc, th * 0.55, 0.006, Math.hypot(dz, a1 - a0) + 0.002, edgeCol, { rx: Math.atan2(a1 - a0, dz), e });
  }
}

function knife(g, r, detail) {
  const L = KNIFE_LOOK[r] || KNIFE_LOOK[0];
  const n = detail ? 10 : 5;
  const th = 0.008;
  if (r === 4) {
    // Karambit: nach unten gebogene Klaue, Schneide innen, Fingerring am Griffende
    const c = (t) => -0.075 * t ** 1.7;
    const w = (t) => 0.03 * (1 - t ** 1.4) + 0.004;
    blade(g, -0.004, 0.13, (t) => [c(t) - w(t) / 2, c(t) + w(t) / 2], th, L.blade, L.edge, L.e, n + 2);
    g.box(0, -0.006, 0.05, 0.026, 0.034, 0.1, L.grip, { rx: -0.12 });
    g.box(0, -0.002, 0.002, 0.03, 0.04, 0.012, L.bolster);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.box(0, -0.016 + Math.sin(a) * 0.024, 0.118 + Math.cos(a) * 0.024, 0.012, 0.009, 0.014, L.accent, { rx: -a, e: L.e * 0.5 });
    }
    if (detail) for (let i = 0; i < 4; i++) g.box(0.0045, c(0.2 + i * 0.17) + 0.004, -0.02 - i * 0.026, 0.001, 0.008, 0.012, L.accent, { e: 0.5, rx: 0.4 });
    return;
  }
  const len = [0.17, 0.17, 0.18, 0.2][r] ?? 0.17;
  const prof = [
    // Jagdmesser: gerader Rücken, der zur Spitze abfällt, gebogene Schneide
    (t) => [-0.016 + 0.018 * t ** 2, 0.016 - 0.014 * t ** 2.5],
    // Tanto: gerader Rücken und Schneide, eckige Spitze
    (t) => [t < 0.78 ? -0.016 : -0.016 + ((t - 0.78) / 0.22) * 0.02, t < 0.84 ? 0.016 : 0.016 - ((t - 0.84) / 0.16) * 0.012],
    // Neon: schlank, leicht nach oben gezogene Spitze
    (t) => [-0.013 + 0.016 * t ** 1.6, 0.013 - 0.01 * t ** 3],
    // Bowie: breite Klinge, Clip-Spitze am Rücken
    (t) => [-0.019 + 0.021 * t ** 2.4, t < 0.6 ? 0.019 : 0.019 - ((t - 0.6) / 0.4) ** 1.2 * 0.017],
  ][r];
  blade(g, -0.004, len, prof, th, L.blade, L.edge, L.e, n);
  // Heft ohne Parierstange: kurzer Metallbund, Griff, Knauf
  g.box(0, 0.0, 0.004, 0.03, 0.04, 0.014, L.bolster, { e: r === 3 ? 0.2 : 0 });
  if (r === 1) {
    // taktischer Griff mit Fingermulden und kleinem Fingerschutz unten
    g.box(0, -0.002, 0.058, 0.028, 0.034, 0.1, L.grip);
    g.box(0, -0.027, 0.004, 0.026, 0.018, 0.012, L.bolster);
    if (detail) for (let i = 0; i < 3; i++) g.box(0, -0.021, 0.03 + i * 0.024, 0.029, 0.008, 0.01, L.accent);
    if (detail) for (let i = 0; i < 6; i++) g.box(0, 0.0175, -0.012 - i * 0.012, 0.007, 0.006, 0.006, L.blade, { rx: 0.785 });
  } else {
    g.box(0, -0.003, 0.058, 0.028, 0.036, 0.1, L.grip);
    g.box(0, -0.004, 0.113, 0.032, 0.04, 0.012, L.bolster, { e: r === 3 ? 0.2 : 0 });
    if (detail) for (const z of [0.035, 0.08]) g.box(0, -0.003, z, 0.031, 0.009, 0.009, L.accent, { e: L.e * 0.4 }); // Nieten / Zierringe
  }
  if (detail) {
    // Hohlkehle bzw. Zierlinie auf der Klinge
    if (r === 2) g.box(0, 0.001, -0.07, th + 0.001, 0.008, 0.075, 0x0b1020);
    else g.box(0.0045, prof(0.4)[1] - 0.007, -0.07, 0.001, 0.005, 0.1, L.accent, { e: L.e });
  }
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

const BUILDERS = { pistol, ar, drum, tac, pump, hammer, sniper, knife };

const geoCache = new Map();
// withMag: Magazin gleich mit einbauen (Figuren, Bodenbeute, Symbole); die Egoperspektive hat ein
// eigenes, bewegliches Magazin für die Nachladeanimation
export function weaponGeometry(type, rarity, detail = 1, withMag = true) {
  const key = type + rarity + ':' + detail + (withMag ? 'm' : '');
  let geo = geoCache.get(key);
  if (!geo) {
    const g = new GeoBuilder();
    BUILDERS[type](g, rarity, detail);
    const mp = WEAPON_META[type].mag;
    if (withMag && mp) addMagazine(g, type, rarity, mp);
    geo = g.toGeometry();
    geoCache.set(key, geo);
  }
  return geo;
}

// abnehmbares Magazin für die Nachlade-Animation (Ursprung = Magazinschacht)
// Magazin-Bauteile, verschoben um o = [x, y, z] (Magazinschacht)
function buildMagazine(g, type, rarity, o = [0, 0, 0]) {
  const [ox, oy, oz] = o;
  const B = RAR_BODY[rarity], D = BLACK;
  if (type === 'ar') {
    g.box(ox, oy - 0.055, oz + 0.008, 0.042, 0.12, 0.068, D, { rx: 0.12 });
    g.box(ox, oy - 0.125, oz + 0.018, 0.044, 0.03, 0.072, B, { rx: 0.2 });
    g.box(ox + 0.022, oy - 0.06, oz + 0.008, 0.003, 0.08, 0.04, B, { rx: 0.12 });
  } else if (type === 'pistol') {
    g.box(ox, oy - 0.05, oz, 0.028, 0.1, 0.04, D, { rx: -0.25 });
  } else if (type === 'drum') {
    g.cyl(ox, oy - 0.02, oz, 0.085, 0.05, 0x2d3036, { rz: Math.PI / 2, seg: 14 });
    g.cyl(ox, oy - 0.02, oz, 0.05, 0.056, B, { rz: Math.PI / 2, seg: 10 });
  } else {
    g.box(ox, oy - 0.03, oz, 0.04, 0.06, 0.08, D);
  }
}

function addMagazine(g, type, rarity, o) {
  buildMagazine(g, type, rarity, o);
}

export function magazineGeometry(type, rarity) {
  const key = 'mag:' + type + rarity;
  let geo = geoCache.get(key);
  if (!geo) {
    const g = new GeoBuilder();
    buildMagazine(g, type, rarity);
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

// Munitionsfarben (wie im Original): Leicht = graublau, Mittel = grün, Schwer = dunkelrot, Schrot = rot
export const AMMO_COLORS = { light: 0x9fc0dc, medium: 0x5fbf3e, heavy: 0xb4352a, shells: 0xff4a36 };
const BRASS = 0xe8bc4c, BRASS_DARK = 0xb8892c, TIP = 0xc98a3c;

// Patrone liegend (entlang X) oder stehend
function bullet(g, x, y, z, r, len, o = {}) {
  if (o.lying) {
    g.cyl(x, y, z, r, len * 0.72, BRASS, { rz: Math.PI / 2, ry: o.ry || 0, seg: 8 });
    g.cyl(x + len * 0.5 * Math.cos(o.ry || 0), y, z - len * 0.5 * Math.sin(o.ry || 0), r, len * 0.3, TIP, { rt: r * 0.25, rz: -Math.PI / 2, ry: o.ry || 0, seg: 8 });
  } else {
    g.cyl(x, y + len * 0.36, z, r, len * 0.72, BRASS, { seg: 8 });
    g.cyl(x, y + len * 0.72 + len * 0.13, z, r, len * 0.26, o.tip || TIP, { rt: r * 0.3, seg: 8 });
  }
}

// Unterschiedliche Modelle je Munitionsart (Fortnite-inspiriert):
// Leicht: flache Pappschachtel mit vielen kleinen Patronen; Mittel: grüne Munitionskiste mit Griff;
// Schwer: schwere dunkelrote Kiste mit großen Patronen; Schrot: Stapel roter Schrotpatronen.
export function ammoGeometry(type) {
  const key = 'a2:' + type;
  let geo = geoCache.get(key);
  if (!geo) {
    const g = new GeoBuilder();
    const C = AMMO_COLORS[type];
    if (type === 'light') {
      g.box(0, 0.06, 0, 0.3, 0.12, 0.2, 0x8aa9c4);
      g.box(0, 0.123, 0, 0.31, 0.012, 0.21, 0x6f8ca8);
      g.box(0, 0.065, -0.101, 0.3, 0.035, 0.004, 0xffffff, { e: 0.15 });
      g.box(0, 0.065, 0.101, 0.3, 0.035, 0.004, 0xffffff, { e: 0.15 });
      for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) bullet(g, -0.1 + i * 0.05, 0.128, -0.035 + j * 0.07, 0.013, 0.07, { tip: 0xd8d8d8 });
    } else if (type === 'medium') {
      g.box(0, 0.1, 0, 0.36, 0.2, 0.18, 0x3f6b2b);
      g.box(0, 0.205, 0, 0.38, 0.03, 0.2, 0x2f5220);
      g.box(0, 0.1, -0.091, 0.36, 0.04, 0.004, 0xf2d33a, { e: 0.2 });
      g.box(0, 0.25, 0, 0.16, 0.02, 0.03, 0x222222);
      for (const x of [-0.075, 0.075]) g.box(x, 0.232, 0, 0.018, 0.04, 0.03, 0x222222);
      for (const x of [-0.19, 0.19]) g.box(x, 0.12, 0.05, 0.02, 0.05, 0.04, 0x2a2a2a);
      for (let i = 0; i < 3; i++) bullet(g, -0.14 + i * 0.05, 0.22, 0.06, 0.017, 0.09);
    } else if (type === 'heavy') {
      g.box(0, 0.11, 0, 0.42, 0.22, 0.24, 0x5a1f18);
      g.box(0, 0.225, 0, 0.44, 0.03, 0.26, 0x3d1410);
      for (const x of [-0.16, 0.16]) g.box(x, 0.11, 0, 0.04, 0.23, 0.25, 0x2a2a2a);
      g.box(0, 0.11, -0.121, 0.2, 0.08, 0.004, C, { e: 0.35 });
      bullet(g, -0.04, 0.265, -0.03, 0.028, 0.2, { lying: true, ry: 0.2 });
      bullet(g, 0.02, 0.265, 0.06, 0.028, 0.2, { lying: true, ry: -0.15 });
    } else {
      // Schrot: 2×2 stehende Patronen + eine liegende
      for (const [x, z] of [[-0.045, -0.045], [0.045, -0.045], [-0.045, 0.045], [0.045, 0.045]]) {
        g.cyl(x, 0.025, z, 0.042, 0.05, BRASS, { seg: 10 });
        g.cyl(x, 0.035, z, 0.046, 0.012, BRASS_DARK, { seg: 10 });
        g.cyl(x, 0.12, z, 0.04, 0.15, C, { seg: 10, e: 0.12 });
        g.cyl(x, 0.197, z, 0.036, 0.006, 0xa82418, { seg: 10 });
      }
      g.cyl(0.02, 0.045, 0.14, 0.042, 0.19, C, { rz: Math.PI / 2, ry: 0.4, seg: 10, e: 0.12 });
      g.cyl(-0.075, 0.045, 0.17, 0.045, 0.05, BRASS, { rz: Math.PI / 2, ry: 0.4, seg: 10 });
    }
    geo = g.toGeometry();
    geoCache.set(key, geo);
  }
  return geo;
}

// Truhe: Kiste (Rumpf) + Deckel getrennt für die Öffnen-Animation. Vorderseite = −Z.
// Rumpf: Holzplanken, goldene Kanten und Eckbeschläge, Schloss mit Schlüsselloch.
// Deckel: gewölbt (Tonnendeckel) mit Goldbändern; Ursprung = Scharnier an der hinteren Oberkante,
// der Deckel reicht nach −Z (vorne) und öffnet sich durch Drehung um +X.
export function chestGeometry(part) {
  const key = 'chest2:' + part;
  let geo = geoCache.get(key);
  if (!geo) {
    const g = new GeoBuilder();
    const wood = 0x8b5a2b, woodD = 0x6b4220, woodL = 0xa36a35, gold = 0xf2c230, goldD = 0xc9951c;
    const W = 1.1, D = 0.66, H = 0.56;
    if (part === 'body') {
      g.box(0, H / 2, 0, W, H, D, wood);
      // Planken
      for (let i = 0; i < 3; i++) {
        const y = 0.1 + i * 0.17;
        g.box(0, y, -D / 2 - 0.004, W - 0.08, 0.012, 0.01, woodD);
        g.box(0, y, D / 2 + 0.004, W - 0.08, 0.012, 0.01, woodD);
      }
      g.box(0, 0.33, -D / 2 - 0.006, W - 0.2, 0.2, 0.006, woodL);
      // goldene Kanten + Eckbeschläge
      for (const x of [-W / 2, W / 2]) {
        g.box(x, H / 2, -D / 2, 0.07, H + 0.02, 0.07, gold, { e: 0.3 });
        g.box(x, H / 2, D / 2, 0.07, H + 0.02, 0.07, gold, { e: 0.3 });
      }
      g.box(0, 0.035, 0, W + 0.06, 0.07, D + 0.06, goldD, { e: 0.2 });
      g.box(0, H - 0.02, -D / 2, W, 0.04, 0.04, gold, { e: 0.3 });
      g.box(0, H - 0.02, D / 2, W, 0.04, 0.04, gold, { e: 0.3 });
      // Schloss
      g.box(0, H - 0.07, -D / 2 - 0.02, 0.17, 0.2, 0.04, gold, { e: 0.55 });
      g.box(0, H - 0.09, -D / 2 - 0.045, 0.03, 0.06, 0.01, 0x2a1a0a);
      g.cyl(0, H - 0.05, -D / 2 - 0.045, 0.022, 0.01, 0x2a1a0a, { rx: Math.PI / 2, seg: 8 });
    } else {
      // gewölbter Deckel: 6 Segmente um die Achse entlang X, Scharnier bei (0,0,0)
      const R = D / 2, cz = -D / 2, seg = 6;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI;
        const am = (a0 + a1) / 2;
        const y = Math.sin(am) * R * 0.62, z = cz + Math.cos(am) * R;
        const len = 2 * R * Math.sin((a1 - a0) / 2) + 0.01;
        g.box(0, y, z, W, 0.05, len, i % 2 ? wood : woodL, { rx: am - Math.PI / 2 });
        for (const x of [-W / 2 + 0.03, 0, W / 2 - 0.03]) g.box(x, y + 0.005, z, x === 0 ? 0.1 : 0.07, 0.056, len, gold, { rx: am - Math.PI / 2, e: 0.3 });
      }
      g.box(0, 0.0, cz, W + 0.02, 0.04, D + 0.02, woodD);
      g.box(0, 0.02, -D, W, 0.04, 0.04, gold, { e: 0.3 });
      // Schlossblech vorn
      g.box(0, 0.02, -D - 0.02, 0.14, 0.1, 0.03, gold, { e: 0.55 });
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
