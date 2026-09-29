// Karten-Verzeichnis: Frostfeste (Battle Royale) und Holzarena (1v1/2v2). generateMap(id) baut eine
// Karte deterministisch (Server und Client identisch); mapSteps(id) liefert denselben Aufbau in
// Häppchen (yield = Fortschritt 0..1).
import { MAPS as BR_MAPS } from './frostfeste.js';
import { ARENA } from './arena.js';
import { islandSteps } from './island.js';
import { isArenaMode, ARENA_MAP } from '../constants.js';

export const MAPS = [...BR_MAPS, ARENA];
// Battle-Royale-Karten (die Arena gibt es nur in 1v1/2v2)
export const MAP_IDS = BR_MAPS.map((m) => m.id);

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

// Karte für einen Modus: Arena-Modi immer die Holzarena, sonst eine Battle-Royale-Insel
export function mapForMode(mode, rnd = Math.random, not = null) {
  return isArenaMode(mode) ? ARENA_MAP : randomMapId(rnd, not);
}

// zufällige Battle-Royale-Karte (möglichst nicht dieselbe wie zuletzt; bei nur einer Karte immer diese)
export function randomMapId(rnd = Math.random, not = null) {
  const list = MAP_IDS.length > 1 && not ? MAP_IDS.filter((id) => id !== not) : MAP_IDS;
  return list[Math.floor(rnd() * list.length) % list.length];
}
