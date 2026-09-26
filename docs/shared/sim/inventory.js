// Inventar: 5 Plätze (Tasten 1–5) für Waffen und Heil-/Schild-Gegenstände, dazu ein Munitionsbeutel.
import { WEAPONS, CONSUMABLES, AMMO_TYPES, AMMO_MAX, weaponItem, ammoItem } from '../items.js';

export const SLOTS = 5;

// Start: graue Pistole mit 20 Schuss im Magazin und 60 in Reserve (insgesamt 80)
export function createInventory() {
  return {
    slots: [weaponItem('pistol', 0), null, null, null, null],
    sel: 0,
    ammo: { light: 60, medium: 0, heavy: 0, shells: 0 },
    rev: 0,
  };
}

export function selectedItem(inv) {
  return inv.slots[inv.sel] || null;
}

/**
 * Nimmt einen Gegenstand auf.
 * Rückgabe: { taken, rest, dropped, slot }
 *  - rest: Teil, der liegen bleibt (Munition/Stapel voll)
 *  - dropped: Gegenstand, der beim Tauschen fallen gelassen wurde (Inventar voll)
 */
// Platz in vorhandenen Stapeln eines Schild-/Heilgegenstands (0 = kein Stapel oder alle voll)
export function stackRoom(inv, c) {
  const stack = CONSUMABLES[c].stack;
  let room = 0;
  for (let i = 0; i < SLOTS; i++) {
    const s = inv.slots[i];
    if (s && s.k === 'c' && s.c === c) room += stack - s.n;
  }
  return room;
}

export function addItem(inv, item, allowSwap = true) {
  const res = { taken: false, rest: null, dropped: null, slot: -1 };
  if (item.k === 'a') {
    const space = AMMO_MAX[item.a] - inv.ammo[item.a];
    const take = Math.min(space, item.n);
    if (take <= 0) {
      res.rest = item;
      return res;
    }
    inv.ammo[item.a] += take;
    inv.rev++;
    res.taken = true;
    if (item.n - take > 0) res.rest = ammoItem(item.a, item.n - take);
    return res;
  }
  if (item.k === 'c') {
    let n = item.n;
    const stack = CONSUMABLES[item.c].stack;
    for (let i = 0; i < SLOTS && n > 0; i++) {
      const s = inv.slots[i];
      if (s && s.k === 'c' && s.c === item.c && s.n < stack) {
        const add = Math.min(stack - s.n, n);
        s.n += add;
        n -= add;
        res.taken = true;
        res.slot = i;
      }
    }
    if (n > 0) {
      const free = inv.slots.indexOf(null);
      if (free >= 0) {
        inv.slots[free] = { k: 'c', c: item.c, n: Math.min(n, stack) };
        n -= Math.min(n, stack);
        res.taken = true;
        res.slot = free;
      } else if (!res.taken && allowSwap) {
        res.dropped = inv.slots[inv.sel];
        inv.slots[inv.sel] = { k: 'c', c: item.c, n: Math.min(n, stack) };
        n -= Math.min(n, stack);
        res.taken = true;
        res.slot = inv.sel;
      }
    }
    if (n > 0) res.rest = { k: 'c', c: item.c, n };
    if (res.taken) inv.rev++;
    return res;
  }
  // Waffe
  const free = inv.slots.indexOf(null);
  if (free >= 0) {
    inv.slots[free] = { ...item };
    res.slot = free;
  } else if (allowSwap) {
    res.dropped = inv.slots[inv.sel];
    inv.slots[inv.sel] = { ...item };
    res.slot = inv.sel;
  } else return res;
  res.taken = true;
  inv.rev++;
  return res;
}

// Alles fallen lassen (Eliminierung): Plätze + Munition als Gegenstände
export function dropAll(inv) {
  const out = [];
  for (let i = 0; i < SLOTS; i++) {
    if (inv.slots[i]) out.push(inv.slots[i]);
    inv.slots[i] = null;
  }
  for (const a of AMMO_TYPES) {
    if (inv.ammo[a] > 0) out.push(ammoItem(a, inv.ammo[a]));
    inv.ammo[a] = 0;
  }
  inv.rev++;
  return out;
}

// Gesamtbewertung einer Waffe (für Bots und Vergleiche)
export function weaponScore(item) {
  if (!item || item.k !== 'w') return 0;
  const def = WEAPONS[item.w];
  return def.dmg[item.r] * Math.min(def.fireRate, 6) + item.r * 8;
}

export function cloneInventory(inv) {
  return {
    slots: inv.slots.map((s) => (s ? { ...s } : null)),
    sel: inv.sel,
    ammo: { ...inv.ammo },
    rev: inv.rev,
  };
}
