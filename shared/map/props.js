// Deko-Objekttypen mit Kollisionsdefinition (Server + Client).
// Kleine Deko hat keine Kollision, große Objekte blockieren Bewegung und Schüsse.
import { MAT } from '../physics/collision.js';

export const PROP_TYPES = [
  'palm', 'palm_s', 'bush', 'rock_s', 'rock_m', 'rock_l', 'crate', 'barrel', 'beachgrass', 'log', 'buoy', 'fern',
];
export const PT = Object.fromEntries(PROP_TYPES.map((n, i) => [n, i]));

// Kollision je Typ – passend zu den Modellen in client/src/render/models.js.
// Zylinder {k:'c', r, y0, h, ox, oz} bzw. Box {k:'b', w, h, d, y, ox, oz, ry} in lokalen,
// bereits skalierten Koordinaten (ox/oz werden mit der Drehung des Objekts mitgedreht).
export function propColliders(type, s, v = 0) {
  switch (PROP_TYPES[type]) {
    case 'palm': return palmColliders(true, s, v);
    case 'palm_s': return palmColliders(false, s, v);
    case 'rock_m': return [
      // abgeflachte Kugel: breiter unten, schmaler oben
      { k: 'c', r: 1.1 * s, y0: -0.3, h: 0.8 * s, m: MAT.STONE },
      { k: 'c', r: 0.72 * s, y0: 0.8 * s, h: 1.22 * s, m: MAT.STONE },
      { k: 'c', r: 0.55 * s, y0: -0.2, h: 0.62 * s, ox: 0.7 * s, oz: 0.4 * s, m: MAT.STONE },
    ];
    case 'rock_l': return [
      // geschichtete Platten wie im Modell (Box je Schicht, eigene Drehung = Variante)
      { k: 'b', w: 3.7 * s, h: 1.7 * s, d: 3.1 * s, y: 0.6 * s, ry: v, m: MAT.STONE },
      { k: 'b', w: 2.8 * s, h: 1.0 * s, d: 2.4 * s, y: 1.8 * s, ox: 0.2 * s, oz: -0.1 * s, ry: v + 0.4, m: MAT.STONE },
      { k: 'b', w: 1.7 * s, h: 0.7 * s, d: 1.5 * s, y: 2.6 * s, ox: -0.1 * s, oz: 0.1 * s, ry: v + 0.9, m: MAT.STONE },
      { k: 'c', r: 0.72 * s, y0: -0.2, h: 0.86 * s, ox: 1.9 * s, oz: 1.0 * s, m: MAT.STONE },
    ];
    case 'crate': return [{ k: 'b', w: 1.2 * s, h: 1.2 * s, d: 1.2 * s, y: 0.6 * s, m: MAT.WOOD }];
    case 'barrel': return [{ k: 'c', r: 0.42 * s, y0: 0, h: 1.12 * s, m: MAT.WOOD }];
    case 'log': return [{ k: 'b', w: 3.6 * s, h: 0.72 * s, d: 0.72 * s, y: 0.35 * s, m: MAT.WOOD }];
    default: return null;
  }
}

// Palmenstamm ist geneigt: ein kurzer Zylinder je Segment entlang der Neigung (wie das Modell)
function palmColliders(tall, s, v) {
  const out = [];
  const n = tall ? 7 : 5;
  const segH = tall ? 1.0 : 0.85;
  const lean = 0.1 + v * 0.07;
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    const a = lean * (0.2 + i * 0.22);
    const r = (tall ? 0.27 : 0.22) - i * 0.018;
    const nx = x + Math.sin(a) * segH, ny = y + Math.cos(a) * segH;
    out.push({ k: 'c', r: (r + 0.03) * s, y0: y * s, h: ny * s, ox: ((x + nx) / 2) * s, oz: 0, m: MAT.PLANT });
    x = nx; y = ny;
  }
  return out;
}

// Platzbedarf (Radius) für Abstandsprüfung beim Verteilen
export function propRadius(type, s) {
  switch (PROP_TYPES[type]) {
    case 'palm': return 2.2 * s;
    case 'palm_s': return 1.6 * s;
    case 'bush': return 1.1 * s;
    case 'rock_s': return 0.7 * s;
    case 'rock_m': return 1.5 * s;
    case 'rock_l': return 2.8 * s;
    case 'crate': return 1.1 * s;
    case 'barrel': return 0.6;
    case 'beachgrass': return 0.7 * s;
    case 'log': return 2 * s;
    case 'buoy': return 0.8;
    case 'fern': return 0.8 * s;
    default: return 1;
  }
}
