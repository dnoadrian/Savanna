// Gegenstände: Waffen (mit Seltenheit), Heil-/Schild-Gegenstände, Munition und Beute-Tabellen.
// Werte orientieren sich an den bekannten Battle-Royale-Originalen (SCAR, Pump, Taktische,
// Trommel-MP, Schweres Scharfschützengewehr, Pistole) und sind für schnelle Runden abgestimmt.

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY_COLORS = ['#a9b1bb', '#4fcf3a', '#2f9dff', '#b653ff', '#f7a51c'];

export const AMMO_TYPES = ['light', 'medium', 'heavy', 'shells'];
export const AMMO_MAX = { light: 360, medium: 360, heavy: 30, shells: 60 };
export const AMMO_DROP = { light: 36, medium: 30, heavy: 6, shells: 10 };
// Bei jeder Eliminierung fällt zusätzlich je ein volles Magazin jeder Munitionsart
// (Leicht = Trommel-MP 40, Mittel = SCAR 30, Schrot = Taktische 8, Schwer = 3 Sniper-Kugeln)
export const KILL_AMMO = { light: 40, medium: 30, heavy: 3, shells: 8 };

// dmg/reload je Seltenheit (Index 0..4). spread in Grad. falloff: [ab m, bis m, Restfaktor]
export const WEAPONS = {
  pistol: {
    ammo: 'light', mag: 20, fireRate: 8.75, auto: false, pellets: 1, hs: 2.0,
    dmg: [24, 25, 26, 27, 28], reload: [0.8, 0.76, 0.72, 0.68, 0.64], equip: 0.25,
    falloff: [25, 60, 0.65], range: 250,
    spread: { base: 1.3, move: 1.8, air: 4, perShot: 0.45, maxBloom: 3.2, recover: 9, ads: 0.45, crouch: 0.75 },
    recoil: { up: 1.2, side: 0.35 }, rarities: [0, 1, 2], weight: 8,
  },
  ar: {
    ammo: 'medium', mag: 30, fireRate: 7.2, auto: true, pellets: 1, hs: 1.5,
    dmg: [30, 31, 33, 35, 36], reload: [1.15, 1.1, 1.05, 1.0, 0.95], equip: 0.35,
    falloff: [50, 100, 0.75], range: 400,
    spread: { base: 1.0, move: 2.0, air: 4.5, perShot: 0.35, maxBloom: 3.0, recover: 7, ads: 0.3, crouch: 0.65 },
    recoil: { up: 0.8, side: 0.35 }, rarities: [0, 1, 2, 3, 4], weight: 22,
  },
  drum: {
    ammo: 'light', mag: 40, fireRate: 13, auto: true, pellets: 1, hs: 1.5,
    dmg: [19, 20, 21, 22, 23], reload: [1.5, 1.45, 1.4, 1.35, 1.3], equip: 0.35,
    falloff: [22, 55, 0.6], range: 250,
    spread: { base: 1.9, move: 2.2, air: 5, perShot: 0.28, maxBloom: 4.2, recover: 9, ads: 0.55, crouch: 0.7 },
    recoil: { up: 0.45, side: 0.5 }, rarities: [1, 2, 3], weight: 12,
  },
  tac: {
    ammo: 'shells', mag: 8, fireRate: 1.95, auto: false, pellets: 10, hs: 1.75, shellReload: true,
    dmg: [70, 73, 77, 81, 85], reload: [0.3, 0.29, 0.28, 0.27, 0.26], equip: 0.35,
    falloff: [8, 30, 0.4], range: 90,
    spread: { base: 5.4, move: 0.8, air: 1.5, perShot: 0, maxBloom: 0, recover: 10, ads: 0.8, crouch: 0.9 },
    recoil: { up: 3.2, side: 0.8 }, rarities: [0, 1, 2, 3], weight: 18,
  },
  pump: {
    ammo: 'shells', mag: 5, fireRate: 1.2, auto: false, pellets: 10, hs: 2.2, shellReload: true,
    dmg: [110, 117, 124, 131, 138], reload: [0.42, 0.4, 0.38, 0.36, 0.34], equip: 0.28,
    falloff: [13, 40, 0.5], range: 90,
    spread: { base: 2.6, move: 0.6, air: 1.2, perShot: 0, maxBloom: 0, recover: 10, ads: 0.78, crouch: 0.88 },
    recoil: { up: 5, side: 1.1 }, rarities: [1, 2, 3, 4], weight: 18,
  },
  // Hammer-Pump: zweite Pump – schneller nachgeschossen, 6 Patronen, etwas weniger Schaden
  hammer: {
    ammo: 'shells', mag: 6, fireRate: 1.6, auto: false, pellets: 10, hs: 2.0, shellReload: true,
    dmg: [92, 97, 102, 108, 114], reload: [0.38, 0.36, 0.34, 0.32, 0.3], equip: 0.28,
    falloff: [12, 38, 0.46], range: 90,
    spread: { base: 3.1, move: 0.6, air: 1.2, perShot: 0, maxBloom: 0, recover: 10, ads: 0.8, crouch: 0.88 },
    recoil: { up: 4, side: 1 }, rarities: [1, 2, 3, 4], weight: 14,
  },
  sniper: {
    ammo: 'heavy', mag: 1, fireRate: 0.45, auto: false, pellets: 1, hs: 2.5, scope: 4,
    dmg: [140, 145, 150, 150, 157], reload: [2.4, 2.35, 2.3, 2.2, 2.0], equip: 0.6,
    falloff: [400, 500, 1], range: 600,
    spread: { base: 7, move: 3, air: 6, perShot: 0, maxBloom: 0, recover: 10, ads: 0, crouch: 0.8, noscope: 4.5 },
    recoil: { up: 6.5, side: 0.8 }, rarities: [3, 4], weight: 13,
  },
  // Messer: immer dabei (eigene Taste), Nahkampf ohne Munition, 2,4 Hiebe/s, Reichweite 2,8 m
  knife: {
    ammo: null, mag: 1, fireRate: 2.4, auto: true, pellets: 1, hs: 1.5, melee: true,
    dmg: [40, 40, 40, 40, 40], reload: [0, 0, 0, 0, 0], equip: 0.15,
    falloff: [99, 100, 1], range: 2.8,
    spread: { base: 0, move: 0, air: 0, perShot: 0, maxBloom: 0, recover: 10, ads: 1, crouch: 1 },
    recoil: { up: 0, side: 0 }, rarities: [], weight: 0,
  },
};
export const WEAPON_TYPES = Object.keys(WEAPONS);
// Waffen, die in Truhen/am Boden liegen können (nicht das Messer)
export const LOOT_WEAPONS = WEAPON_TYPES.filter((t) => WEAPONS[t].weight > 0);
// Messer-Skins (Kosmetik): Index = item.r des Messers
export const KNIFE_SKINS = ['standard', 'tactical', 'neon', 'gold', 'dragon'];
export const knifeItem = (skin = 'standard') => ({ k: 'w', w: 'knife', r: Math.max(0, KNIFE_SKINS.indexOf(skin)), mag: 1 });

// Heil-/Schild-Gegenstände – wirken sofort (Benutzungszeit 0 s)
export const CONSUMABLES = {
  mini: { rarity: 1, stack: 6, use: 0, shield: 25, cap: 50, drop: 3, weight: 45 },
  big: { rarity: 2, stack: 3, use: 0, shield: 50, cap: 100, drop: 1, weight: 30 },
  medkit: { rarity: 1, stack: 3, use: 0, heal: 100, drop: 1, weight: 25 },
};
export const CONSUMABLE_TYPES = Object.keys(CONSUMABLES);

export const weaponItem = (w, r) => ({ k: 'w', w, r, mag: WEAPONS[w].mag });
export const consumableItem = (c, n = CONSUMABLES[c].drop) => ({ k: 'c', c, n });
export const ammoItem = (a, n = AMMO_DROP[a]) => ({ k: 'a', a, n });

export function itemRarity(item) {
  if (item.k === 'w') return item.r;
  if (item.k === 'c') return CONSUMABLES[item.c].rarity;
  return 0;
}

// Schaden eines Treffers (vor Rüstung): Körperteil, Entfernung, Waffe, Seltenheit, Schrotkugeln
export function weaponDamage(w, r, part, dist) {
  const def = WEAPONS[w];
  let d = def.dmg[r] / def.pellets;
  if (part === 'h') d *= def.hs;
  else if (part === 'l') d *= 0.9;
  const [f0, f1, fmin] = def.falloff;
  if (dist > f0) d *= dist >= f1 ? fmin : 1 - ((dist - f0) / (f1 - f0)) * (1 - fmin);
  return d;
}

// kompaktes Netzwerkformat
export function encodeItem(it) {
  if (it.k === 'w') return ['w', it.w, it.r, it.mag];
  if (it.k === 'c') return ['c', it.c, it.n];
  return ['a', it.a, it.n];
}

export function decodeItem(a) {
  if (a[0] === 'w') return { k: 'w', w: a[1], r: a[2], mag: a[3] };
  if (a[0] === 'c') return { k: 'c', c: a[1], n: a[2] };
  return { k: 'a', a: a[1], n: a[2] };
}

function weighted(rng, entries) {
  let total = 0;
  for (const [, w] of entries) total += w;
  let x = rng.next() * total;
  for (const [v, w] of entries) {
    x -= w;
    if (x <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

const CHEST_RARITY = [[0, 28], [1, 32], [2, 25], [3, 12], [4, 3]];
const FLOOR_RARITY = [[0, 50], [1, 34], [2, 13], [3, 3]];

export function rollWeapon(rng, rarityTable = CHEST_RARITY) {
  const w = weighted(rng, LOOT_WEAPONS.map((t) => [t, WEAPONS[t].weight]));
  const allowed = WEAPONS[w].rarities;
  let r = weighted(rng, rarityTable);
  if (r < allowed[0]) r = allowed[0];
  if (r > allowed[allowed.length - 1]) r = allowed[allowed.length - 1];
  // Schweres Scharfschützengewehr: 75 % episch, 25 % legendär
  if (w === 'sniper') r = rng.next() < 0.25 ? 4 : 3;
  return weaponItem(w, r);
}

export function rollConsumable(rng) {
  const c = weighted(rng, CONSUMABLE_TYPES.map((t) => [t, CONSUMABLES[t].weight]));
  return consumableItem(c);
}

// Munition, die mit einer Waffe aus der Truhe kommt: dreifaches Magazin (30er-Magazin → 90)
export function chestAmmoFor(w) {
  const def = WEAPONS[w];
  return Math.max(def.mag * 3, AMMO_DROP[def.ammo]);
}

// Truhe: eine Waffe, ein Heil-/Schild-Gegenstand und Munition für die Waffe
export function rollChestLoot(rng) {
  const weapon = rollWeapon(rng);
  return [weapon, rollConsumable(rng), ammoItem(WEAPONS[weapon.w].ammo, chestAmmoFor(weapon.w))];
}

// Bodenbeute: Waffe (eher schwach), Munition oder kleine Schilde
export function rollFloorLoot(rng) {
  const x = rng.next();
  if (x < 0.45) {
    const w = rollWeapon(rng, FLOOR_RARITY);
    return [w, ammoItem(WEAPONS[w.w].ammo)];
  }
  if (x < 0.8) return [ammoItem(AMMO_TYPES[Math.floor(rng.next() * AMMO_TYPES.length)])];
  return [consumableItem('mini', 2)];
}
