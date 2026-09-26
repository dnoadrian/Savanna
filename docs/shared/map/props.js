// Deko-Objekttypen mit Kollisionsdefinition (Server + Client).
// Kleine Deko hat keine Kollision, große Objekte blockieren Bewegung und Schüsse.
import { MAT } from '../physics/collision.js';

export const PROP_TYPES = [
  'palm', 'palm_s', 'bush', 'rock_s', 'rock_m', 'rock_l', 'crate', 'barrel', 'beachgrass', 'log', 'buoy', 'fern',
];
export const PT = Object.fromEntries(PROP_TYPES.map((n, i) => [n, i]));

// Kollision je Typ: Liste von Zylindern {r, h, y0} (mit Skalierung s) oder Box
export function propColliders(type, s) {
  switch (PROP_TYPES[type]) {
    case 'palm': return [{ k: 'c', r: 0.3 * s, y0: 0, h: 5 * s, m: MAT.PLANT }];
    case 'palm_s': return [{ k: 'c', r: 0.25 * s, y0: 0, h: 3 * s, m: MAT.PLANT }];
    case 'rock_m': return [{ k: 'c', r: 0.95 * s, y0: -0.3, h: 1.35 * s, m: MAT.STONE }];
    case 'rock_l': return [{ k: 'c', r: 1.9 * s, y0: -0.5, h: 2.8 * s, m: MAT.STONE }];
    case 'crate': return [{ k: 'b', w: 1.2 * s, h: 1.2 * s, d: 1.2 * s, m: MAT.WOOD }];
    case 'barrel': return [{ k: 'c', r: 0.42, y0: 0, h: 1.1, m: MAT.WOOD }];
    case 'log': return [{ k: 'b', w: 3.2 * s, h: 0.6 * s, d: 0.7 * s, m: MAT.WOOD }];
    default: return null;
  }
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
