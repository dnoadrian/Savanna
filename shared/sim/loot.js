// Beute: Truhen (F öffnen → Waffe + Heil-/Schild-Gegenstand + Munition), Bodenbeute und
// fallengelassene Gegenstände. Startzustand ist deterministisch aus Match-Seed + Karte, damit
// Server und Clients dieselben IDs haben; danach kommen Änderungen als Ereignisse.
import { RNG } from '../rng.js';
import { SEA_LEVEL } from '../constants.js';
import { rollChestLoot, rollFloorLoot } from '../items.js';

const CHEST_CHANCE = 1; // alle Truhen sind immer da
const FLOOR_CHANCE = 0.6;

export class Loot {
  constructor(map, seed) {
    this.map = map;
    this.pickups = new Map(); // id -> { id, item, x, y, z }
    this.chests = [];
    this.nextId = 1;
    const rng = new RNG((seed ^ 0x10c7) >>> 0);
    this.rng = rng;
    map.chests.forEach((c, i) => {
      if (rng.next() < CHEST_CHANCE) this.chests.push({ id: i, x: c.x, y: c.y, z: c.z, ry: c.ry, open: false });
    });
    for (const s of map.floorLoot) {
      if (rng.next() >= FLOOR_CHANCE) continue;
      const items = rollFloorLoot(rng);
      items.forEach((it, k) => {
        const a = k * 2.1 + s.x;
        this.add(it, s.x + Math.cos(a) * 0.55 * k, s.y, s.z + Math.sin(a) * 0.55 * k);
      });
    }
  }

  add(item, x, y, z) {
    const id = this.nextId++;
    const p = { id, item, x, y, z };
    this.pickups.set(id, p);
    return p;
  }

  chest(id) {
    return this.chests.find((c) => c.id === id) || null;
  }

  // Bodenhöhe für abgelegte Gegenstände (Terrain, Stege, Böden; im Wasser treiben sie oben)
  groundY(x, z, fromY) {
    const t = this.map.terrain.heightAt(x, z);
    const c = this.map.collision.groundAt(x, z, 0.15, fromY + 0.8);
    return Math.max(t, c, SEA_LEVEL + 0.05);
  }

  // Gegenstände rund um einen Punkt verteilen (Truhe, Eliminierung, Tausch)
  scatter(items, x, y, z, dirYaw = null, radius = 1.2) {
    const out = [];
    const n = items.length;
    const col = this.map.collision;
    items.forEach((it, k) => {
      let a;
      if (dirYaw === null) a = (k / Math.max(1, n)) * Math.PI * 2 + this.rng.next() * 0.6;
      else a = dirYaw + (k - (n - 1) / 2) * 0.55;
      const r = dirYaw === null ? radius * (0.6 + this.rng.next() * 0.5) : radius;
      let px = x - Math.sin(a) * r, pz = z - Math.cos(a) * r;
      // nicht in Wände legen
      if (!col.lineOfSight(x, y + 0.5, z, px, y + 0.5, pz)) { px = x; pz = z; }
      const p = this.add(it, px, this.groundY(px, pz, y), pz);
      p.fx = x; p.fy = y + 0.6; p.fz = z;
      out.push(p);
    });
    return out;
  }

  // Truhe öffnen: Beute fällt vor die Truhe
  openChest(chest) {
    if (chest.open) return null;
    chest.open = true;
    const items = rollChestLoot(this.rng);
    return this.scatter(items, chest.x, chest.y, chest.z, chest.ry, 1.25);
  }

  remove(id) {
    const p = this.pickups.get(id);
    if (p) this.pickups.delete(id);
    return p || null;
  }
}
