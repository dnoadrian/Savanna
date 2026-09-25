// Eigenes Low-Poly-Sturmgewehr (inspiriert vom kantigen SCAR-Stil, keine Original-Assets).
// Kein Zielfernrohr/Rotpunkt: offene Visierung (Kimme hinten, Korn vorne).
// Lokales System: Lauf zeigt nach -Z, Ursprung am Pistolengriff, Visierlinie bei y = SIGHT_Y.
import * as THREE from 'three';
import { GeoBuilder, worldMaterial } from './geom.js';

export const SIGHT_Y = 0.13;
export const MUZZLE = new THREE.Vector3(0, 0.036, -0.7);
export const EJECT = new THREE.Vector3(0.045, 0.055, -0.06);

export const SKIN_COLORS = {
  grey: { a: 0x7a818c, b: 0x2b2f36, c: 0xa7afba },
  green: { a: 0x6f8f3a, b: 0x2f3a24, c: 0x9fbf5a },
  blue: { a: 0x3a7bd5, b: 0x1c2640, c: 0x7fb2ff },
  purple: { a: 0x9b5de5, b: 0x2a1c40, c: 0xc79bff },
  gold: { a: 0xf2a122, b: 0x1c1c1c, c: 0xffd23f },
};

export function buildRifle(skin = 'gold', detail = 1, noMag = false) {
  const s = SKIN_COLORS[skin] || SKIN_COLORS.gold;
  const g = new GeoBuilder();
  const A = s.a, B = s.b, Cc = s.c;
  // Oberes Gehäuse (kantig)
  g.box(0, 0.038, -0.1, 0.072, 0.082, 0.44, A);
  g.box(0, 0.083, -0.1, 0.06, 0.012, 0.42, A, { vary: 0.02 });
  // Unteres Gehäuse
  g.box(0, -0.018, -0.02, 0.066, 0.05, 0.25, B);
  // Picatinny-Schiene
  g.box(0, 0.094, -0.14, 0.034, 0.016, 0.38, B);
  if (detail) for (let i = 0; i < 11; i++) g.box(0, 0.104, -0.31 + i * 0.034, 0.038, 0.008, 0.012, B);
  // Handschutz mit Lüftungsschlitzen
  g.box(0, 0.032, -0.4, 0.078, 0.078, 0.24, B);
  if (detail) for (let i = 0; i < 4; i++) {
    g.box(0.04, 0.035, -0.47 + i * 0.05, 0.004, 0.03, 0.025, 0x0c0c0c);
    g.box(-0.04, 0.035, -0.47 + i * 0.05, 0.004, 0.03, 0.025, 0x0c0c0c);
  }
  g.box(0, 0.075, -0.4, 0.04, 0.012, 0.22, B);
  // Lauf + Mündungsfeuerdämpfer
  g.cyl(0, 0.036, -0.575, 0.014, 0.13, 0x222222, { rx: Math.PI / 2, seg: 6 });
  g.cyl(0, 0.036, -0.66, 0.026, 0.075, B, { rx: Math.PI / 2, seg: 6 });
  if (detail) {
    g.box(0.027, 0.036, -0.66, 0.006, 0.012, 0.05, Cc);
    g.box(-0.027, 0.036, -0.66, 0.006, 0.012, 0.05, Cc);
  }
  // Gasblock + Korn (Oberkante des Korns = Visierlinie)
  g.box(0, 0.075, -0.53, 0.03, 0.03, 0.03, B);
  g.box(0, 0.1, -0.53, 0.014, 0.02, 0.014, B);
  g.box(0, 0.12, -0.53, 0.005, 0.02, 0.005, B);
  g.box(0.013, 0.117, -0.53, 0.004, 0.026, 0.012, B);
  g.box(-0.013, 0.117, -0.53, 0.004, 0.026, 0.012, B);
  if (detail) g.box(0, 0.128, -0.53, 0.0055, 0.004, 0.0055, Cc);
  // Kimme hinten (zwei Ohren mit Kerbe, Oberkante = Visierlinie)
  g.box(0, 0.108, 0.02, 0.04, 0.012, 0.035, B);
  g.box(0.0115, 0.122, 0.02, 0.009, 0.016, 0.018, B);
  g.box(-0.0115, 0.122, 0.02, 0.009, 0.016, 0.018, B);
  // Magazin (leicht gebogen)
  if (!noMag) addMag(g, A, B, 0, 0, 0);
  // Pistolengriff + Abzugsbügel
  g.box(0, -0.075, 0.045, 0.042, 0.12, 0.055, B, { rx: -0.35 });
  g.box(0, -0.052, -0.035, 0.012, 0.012, 0.09, B);
  g.box(0, -0.035, -0.03, 0.006, 0.03, 0.006, 0x444444);
  // Schaft
  g.box(0, 0.03, 0.2, 0.052, 0.07, 0.2, A);
  g.box(0, 0.075, 0.2, 0.046, 0.022, 0.18, B);
  g.box(0, -0.005, 0.29, 0.058, 0.13, 0.035, B);
  g.box(0, -0.035, 0.18, 0.03, 0.03, 0.14, A, { rx: 0.25 });
  // Ladehebel + Auswurffenster
  g.box(0.045, 0.05, -0.02, 0.02, 0.018, 0.035, Cc);
  g.box(0.037, 0.055, -0.07, 0.004, 0.028, 0.06, 0x111111);
  // Zierstreifen (Legendär-Look)
  if (detail) {
    g.box(0.037, 0.02, -0.12, 0.003, 0.012, 0.3, Cc);
    g.box(-0.037, 0.02, -0.12, 0.003, 0.012, 0.3, Cc);
  }
  return g;
}

function addMag(g, A, B, ox, oy, oz) {
  g.box(ox, oy - 0.09, oz - 0.12, 0.044, 0.13, 0.075, B, { rx: 0.18 });
  g.box(ox, oy - 0.18, oz - 0.105, 0.042, 0.08, 0.07, A, { rx: 0.36 });
}

// separates Magazin (Viewmodel-Nachladeanimation), Ursprung = Magazinschacht
export const MAG_ORIGIN = new THREE.Vector3(0, -0.04, -0.13);
export function buildMagazine(skin = 'gold') {
  const s = SKIN_COLORS[skin] || SKIN_COLORS.gold;
  const g = new GeoBuilder();
  addMag(g, s.a, s.b, -MAG_ORIGIN.x, -MAG_ORIGIN.y, -MAG_ORIGIN.z);
  return g;
}

export function createRifleMesh(skin, detail = 1, noMag = false) {
  const g = buildRifle(skin, detail, noMag);
  const mesh = new THREE.Mesh(g.toGeometry(), worldMaterial());
  const grp = new THREE.Group();
  grp.add(mesh);
  grp.userData.mesh = mesh;
  return grp;
}

export function setRifleSkin(grp, skin, detail = 1, noMag = false) {
  const mesh = grp.userData.mesh;
  mesh.geometry.dispose();
  mesh.geometry = buildRifle(skin, detail, noMag).toGeometry();
}
