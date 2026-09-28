// Karten-Verzeichnis (zurzeit nur die Frostfeste). generateMap(id) baut eine Karte
// deterministisch (Server und Client identisch); mapSteps(id) liefert denselben Aufbau in
// Häppchen (yield = Fortschritt 0..1).
import { MAPS } from './frostfeste.js';
import { islandSteps } from './island.js';

export { MAPS };
export const MAP_IDS = MAPS.map((m) => m.id);

export function mapDef(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}

export function mapSteps(id) {
  return islandSteps(mapDef(id));
}

export function generateMap(id = MAPS[0].id, onProgress = null) {
  const g = mapSteps(id);
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
    if (onProgress) onProgress(r.value);
  }
}

// zufällige Karte (möglichst nicht dieselbe wie zuletzt; bei nur einer Karte immer diese)
export function randomMapId(rnd = Math.random, not = null) {
  const list = MAP_IDS.length > 1 && not ? MAP_IDS.filter((id) => id !== not) : MAP_IDS;
  return list[Math.floor(rnd() * list.length) % list.length];
}
