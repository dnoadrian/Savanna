// Deko-Objekttypen mit Kollisionsdefinition (Server + Client).
// Kleine Deko hat keine Kollision, große Objekte blockieren Bewegung und Schüsse.
import { MAT } from '../physics/collision.js';

export const PROP_TYPES = [
  'acacia', 'baobab', 'deadtree', 'bush', 'rock_s', 'rock_m', 'rock_l', 'saguaro', 'pear',
  'termite', 'tallgrass', 'crate', 'barrel', 'skull', 'log', 'palm_s', 'flowers',
];
export const PT = Object.fromEntries(PROP_TYPES.map((n, i) => [n, i]));

// Kollision je Typ: Liste von Zylindern {r, h, y0} (mit Skalierung s) oder Box
export function propColliders(type, s) {
  switch (PROP_TYPES[type]) {
    case 'acacia': return [{ k: 'c', r: 0.32 * s, y0: 0, h: 3.4 * s, m: MAT.PLANT }];
    case 'baobab': return [{ k: 'c', r: 1.45 * s, y0: 0, h: 7.5 * s, m: MAT.PLANT }];
    case 'deadtree': return [{ k: 'c', r: 0.26 * s, y0: 0, h: 3.6 * s, m: MAT.WOOD }];
    case 'rock_m': return [{ k: 'c', r: 0.95 * s, y0: -0.3, h: 1.35 * s, m: MAT.STONE }];
    case 'rock_l': return [{ k: 'c', r: 2.1 * s, y0: -0.5, h: 3.3 * s, m: MAT.STONE }];
    case 'saguaro': return [{ k: 'c', r: 0.36 * s, y0: 0, h: 4.4 * s, m: MAT.PLANT }];
    case 'termite': return [{ k: 'c', r: 0.85 * s, y0: -0.2, h: 2.6 * s, m: MAT.STONE }];
    case 'crate': return [{ k: 'b', w: 1.2 * s, h: 1.2 * s, d: 1.2 * s, m: MAT.WOOD }];
    case 'barrel': return [{ k: 'c', r: 0.42, y0: 0, h: 1.1, m: MAT.METAL }];
    case 'log': return [{ k: 'b', w: 3.6 * s, h: 0.7 * s, d: 0.8 * s, m: MAT.WOOD }];
    case 'palm_s': return [{ k: 'c', r: 0.28 * s, y0: 0, h: 3 * s, m: MAT.PLANT }];
    default: return null;
  }
}

// Platzbedarf (Radius) für Abstandsprüfung beim Verteilen
export function propRadius(type, s) {
  switch (PROP_TYPES[type]) {
    case 'acacia': return 4.5 * s;
    case 'baobab': return 6 * s;
    case 'deadtree': return 2.5 * s;
    case 'bush': return 1.4 * s;
    case 'rock_s': return 0.8 * s;
    case 'rock_m': return 1.6 * s;
    case 'rock_l': return 3.2 * s;
    case 'saguaro': return 1.6 * s;
    case 'pear': return 1.2 * s;
    case 'termite': return 1.6 * s;
    case 'tallgrass': return 0.9 * s;
    case 'crate': return 1.2 * s;
    case 'barrel': return 0.7;
    case 'skull': return 1.0;
    case 'log': return 2.2 * s;
    case 'palm_s': return 2.5 * s;
    case 'flowers': return 0.8;
    default: return 1;
  }
}
