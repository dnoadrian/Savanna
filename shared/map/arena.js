// Holzarena für 1v1 und 2v2: kleine grüne Insel, in der Mitte ein eingezäuntes Rasenfeld
// (54 × 54 m) mit hohen Holzwänden. Jedes Team startet in einer eigenen Holzbox an einer Seite;
// in der Box steht man während der Waffenwahl still, danach geht es durch die offene Front hinaus.
// Deckung: Holzfort in der Mitte, Wandstücke, Kistenstapel und zwei Plattformen mit Treppe.
// Alles ist punktsymmetrisch um die Mitte, damit beide Seiten gleich gute Plätze haben.
import { C, TX } from './builder.js';
import { MAT } from '../physics/collision.js';

const H = 27; // halbe Innenkante der Arena
const WALL_H = 5.6;
const GROUND = 1.6;
const PLANK = 0x9a6a3e;
const PLANK_D = 0x6f4a2a;
const POST = 0x4e3321;
const BOX = 0xa8552f; // Startboxen: rötliches Holz mit leuchtender Kante
const wood = (o = {}) => ({ m: MAT.WOOD, tx: TX.WOOD, ...o });

// Holzwand-Stück (Bretter + Rahmen) von (x1,z1) nach (x2,z2), Unterkante auf dem Boden
function woodWall(B, x1, z1, x2, z2, h = 3, t = 0.3, c = PLANK, openings = []) {
  B.wall(x1, z1, x2, z2, h, t, c, openings, wood({ frame: false }));
  const len = Math.hypot(x2 - x1, z2 - z1);
  const ry = Math.atan2(-(z2 - z1) / len, (x2 - x1) / len);
  // Pfosten an den Enden und oben ein Abschlussbalken
  for (const [x, z] of [[x1, z1], [x2, z2]]) B.box(x, 0, z, t + 0.16, h + 0.12, t + 0.16, POST, wood({ col: false }));
  B.box((x1 + x2) / 2, h - 0.02, (z1 + z2) / 2, len + 0.1, 0.14, t + 0.12, PLANK_D, wood({ col: false, ry }));
}

// Kistenstapel als Deckung
function crates(B, x, z, ry, n) {
  B.crate(x, 0, z, 1.25, ry, C.WOOD);
  if (n > 1) B.crate(x + Math.cos(ry) * 1.3, 0, z - Math.sin(ry) * 1.3, 1.25, ry + 0.2, C.WOOD);
  if (n > 2) B.crate(x + Math.cos(ry) * 0.65, 1.25, z - Math.sin(ry) * 0.65, 1.2, ry - 0.15, C.WOOD);
}

// Startbox: Rückwand, zwei Seitenwände, Dach – die Front (Richtung Mitte, lokales −Z) ist offen
function startBox(B) {
  const w = 6.4, d = 5.2, h = 3.4, t = 0.3;
  B.box(0, 0, 0, w + 0.4, 0.18, d + 0.4, PLANK_D, wood());
  B.wall(-w / 2, d / 2, w / 2, d / 2, h, t, BOX, [], wood({ frame: false }));
  B.wall(-w / 2, -d / 2, -w / 2, d / 2, h, t, BOX, [], wood({ frame: false }));
  B.wall(w / 2, d / 2, w / 2, -d / 2, h, t, BOX, [], wood({ frame: false }));
  B.box(0, h, 0, w + 0.8, 0.25, d + 0.8, PLANK_D, wood());
  // leuchtende Kante um die offene Front
  for (const sg of [-1, 1]) B.box(sg * (w / 2), 0.18, -d / 2, 0.22, h - 0.18, 0.22, 0xffb13b, { col: false, e: 1 });
  B.box(0, h - 0.2, -d / 2, w + 0.2, 0.2, 0.22, 0xffb13b, { col: false, e: 1 });
  // Waffenständer an der Rückwand (Deko)
  for (const x of [-1.8, 0, 1.8]) B.box(x, 1.1, d / 2 - 0.3, 1.1, 0.08, 0.2, POST, { col: false });
}

// Plattform (Oberkante 2,4 m) mit Brüstung und Treppe; Ursprung = Plattformmitte
function platform(B) {
  const s = 5, top = 2.4;
  B.box(0, top - 0.25, 0, s, 0.25, s, PLANK, wood());
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cyl(x * (s / 2 - 0.3), 0, z * (s / 2 - 0.3), 0.16, top - 0.25, POST, { seg: 6 });
  // halbhohe Brüstung auf zwei Seiten (Deckung oben)
  const U = B.sub(0, 0, 0, top);
  U.wall(-s / 2, s / 2, s / 2, s / 2, 1.1, 0.2, PLANK_D, [], wood({ frame: false }));
  U.wall(s / 2, s / 2, s / 2, -s / 2, 1.1, 0.2, PLANK_D, [], wood({ frame: false }));
  // Treppe an der offenen −Z-Seite: 8 Stufen à 30 cm, die oberste endet an der Plattformkante
  B.stairs(-1.2, -s / 2 - 3.75, 1.6, 0.3, 0.5, 8, PLANK, Math.PI, 0);
}

function arenaPlan(P) {
  P.poi('Holzarena', 0, 0, 30);
  P.flatRect(0, 0, 2 * H + 16, 2 * H + 16, 0, GROUND, 10);
  P.keep(0, 0, H * 1.5);
  // Außenwand: hohe Bretterwand mit Pfosten, oben ein Laufsteg-Balken (nur Optik)
  P.build(0, 0, 0, (B) => {
    const t = 0.5;
    for (const [x1, z1, x2, z2] of [[-H, -H, H, -H], [H, -H, H, H], [H, H, -H, H], [-H, H, -H, -H]]) {
      B.wall(x1, z1, x2, z2, WALL_H, t, PLANK, [], wood({ frame: false }));
      const len = Math.hypot(x2 - x1, z2 - z1);
      for (let k = 0; k <= len; k += 6) {
        const x = x1 + ((x2 - x1) * k) / len, z = z1 + ((z2 - z1) * k) / len;
        B.box(x, 0, z, 0.7, WALL_H + 0.5, 0.7, POST, wood({ col: false }));
      }
      const ry = Math.atan2(-(z2 - z1) / len, (x2 - x1) / len);
      B.box((x1 + x2) / 2, WALL_H - 0.1, (z1 + z2) / 2, len + 0.8, 0.3, t + 0.4, PLANK_D, wood({ col: false, ry }));
      B.box((x1 + x2) / 2, 1.2, (z1 + z2) / 2, len, 0.25, t + 0.12, PLANK_D, wood({ col: false, ry }));
    }
    // Ecktürme mit Fahnen
    for (const [x, z, c] of [[-H, -H, 0xd23c3c], [H, -H, 0x2f6fd6], [H, H, 0xd23c3c], [-H, H, 0x2f6fd6]]) {
      B.box(x, 0, z, 1.6, WALL_H + 1.4, 1.6, POST, wood());
      B.cyl(x, WALL_H + 1.4, z, 0.08, 3.2, 0x2a2a2a, { seg: 5, col: false });
      B.box(x + 0.7, WALL_H + 3.6, z, 1.4, 0.8, 0.05, c, { col: false });
    }
  }, GROUND);
  // Startboxen: Team 0 im Süden (+Z) mit Blick nach Norden, Team 1 im Norden mit Blick nach Süden
  P.build(0, H - 2.9, 0, (B) => startBox(B), GROUND);
  P.build(0, -(H - 2.9), Math.PI, (B) => startBox(B), GROUND);
  // Deckung (punktsymmetrisch: jedes Stück auch bei (−x, −z) gedreht)
  const sym = (fn) => {
    P.build(0, 0, 0, (B) => fn(B, 1), GROUND);
    P.build(0, 0, Math.PI, (B) => fn(B, -1), GROUND);
  };
  // Holzfort in der Mitte: 5 × 5 m, Durchgänge nach Osten und Westen
  P.build(0, 0, 0, (B) => {
    const r = 2.5;
    woodWall(B, -r, r, r, r, 3, 0.3);
    woodWall(B, r, -r, -r, -r, 3, 0.3);
    woodWall(B, -r, -r, -r, r, 3, 0.3, PLANK, [{ at: r, w: 1.9, y0: 0, y1: 2.3 }]);
    woodWall(B, r, r, r, -r, 3, 0.3, PLANK, [{ at: r, w: 1.9, y0: 0, y1: 2.3 }]);
    B.box(0, 0, 0, 2 * r, 0.12, 2 * r, PLANK_D, wood({ col: false }));
  }, GROUND);
  sym((B) => {
    // Schutzwand vor jeder Startbox: kein Schuss von Box zu Box, man läuft seitlich hinaus
    woodWall(B, -3.8, 15.2, 3.8, 15.2, 3.2);
    woodWall(B, -11.5, 9, -6.5, 9, 3);
    woodWall(B, 7, 13, 11.5, 13, 3);
    woodWall(B, -16, -1, -16, 5, 3);
    woodWall(B, -21.5, 14, -16.5, 14, 3);
    woodWall(B, -21.5, 14, -21.5, 10, 3);
    woodWall(B, 15.5, 18, 20, 18, 2.2);
    crates(B, 5, 17.5, 0.3, 2);
    crates(B, 11.5, 3, -0.4, 3);
    crates(B, -6, 3.8, 0.9, 1);
    crates(B, -23.5, 1, 0.1, 2);
  });
  // Plattformen mit Treppe in zwei Ecken
  P.build(19.5, -19.5, 0, (B) => platform(B), GROUND);
  P.build(-19.5, 19.5, Math.PI, (B) => platform(B), GROUND);
  // außen: Zuschauerbänke vor den Wänden
  for (const [x, z, ry] of [[0, H + 5, 0], [0, -H - 5, Math.PI], [H + 5, 0, -Math.PI / 2], [-H - 5, 0, Math.PI / 2]]) {
    P.build(x, z, ry, (B) => {
      for (let k = 0; k < 3; k++) B.box(0, 0.45 * k, 0.9 * k, 14, 0.45, 0.9, k % 2 ? PLANK : PLANK_D, wood());
    });
  }
}

export const ARENA = {
  id: 'arena',
  name: 'Holzarena',
  seed: 4711,
  biome: 'grass',
  radius: 72,
  hillAmp: 3,
  baseH: 1.3,
  chests: 0,
  floorLoot: 0,
  scatter: { tree: 34, pine: 22, bush: 30, flower: 50, stone: 16 },
  plan: arenaPlan,
  // Startpunkte je Team (Mitte der Box, Blick zur Arenamitte) und die offenen Boxfronten
  spawns: [{ x: 0, z: H - 2.9, yaw: 0, w: 6.4 }, { x: 0, z: -(H - 2.9), yaw: Math.PI, w: 6.4 }],
  boxes: [{ x: 0, z: H - 2.9 - 2.6, y: GROUND, w: 6.4, h: 3.4, ry: 0 }, { x: 0, z: -(H - 2.9 - 2.6), y: GROUND, w: 6.4, h: 3.4, ry: Math.PI }],
  // kleiner Sturm um die Mitte, damit sich niemand ewig versteckt
  storm: {
    x: 0, z: 0, r: 42,
    phases: [
      { wait: 50, shrink: 30, radius: 17, dps: 2 },
      { wait: 20, shrink: 20, radius: 6, dps: 5 },
      { wait: 10, shrink: 15, radius: 0, dps: 10 },
    ],
  },
};
