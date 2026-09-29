// Spielerprofil im localStorage: Name, Spieler-ID (UUID), Spind, Statistik, Krone.
// Mit Server wird eine Kopie dort gespeichert: Anmelden auf jedem Gerät mit Name + Geburtsdatum.
import { clampRank, applyRankResult } from '../shared/ranks.js';
import { OUTFITS, DEFAULT_OUTFIT, SKIN_SHOP, KNIFE_SHOP, COINS_PER_KILL, COINS_PER_WIN } from '../shared/constants.js';

// v2: alle Konten wurden zurückgesetzt (Anmeldung mit Geburtsdatum)
const BASE_KEY = 'showdown.profile.v3';
const OLD_KEYS = ['showdown.profile.v1', 'showdown.profile.v2'];
// Felder, die als Spielstand auf dem Server liegen (alles außer ID/Name/Anmeldeschlüssel)
const SAVE_FIELDS = ['outfit', 'coins', 'owned', 'rank', 'bestRank', 'knife', 'ownedKnives', 'color', 'crownStyle', 'winStreak', 'soloChampion', 'stats', 'createdAt'];

// Profil-Slots pro Tab: Ist ein Profil bereits in einem anderen offenen Tab aktiv, bekommt
// dieser Tab ein eigenes Profil (z. B. zum Testen von Freunden/Party mit zwei Tabs).
const TOKEN = Math.random().toString(36).slice(2);
function slotAlive(n) {
  try {
    const raw = localStorage.getItem('showdown.slot.' + n);
    if (!raw) return false;
    const { t, token } = JSON.parse(raw);
    return token !== TOKEN && Date.now() - t < 2500;
  } catch {
    return false;
  }
}
function pickSlot() {
  let slot = null;
  try {
    const s = sessionStorage.getItem('showdown.slot');
    if (s !== null) slot = Number(s);
  } catch { /* ignorieren */ }
  if (slot === null || slotAlive(slot)) {
    slot = 0;
    while (slotAlive(slot) && slot < 16) slot++;
  }
  try { sessionStorage.setItem('showdown.slot', String(slot)); } catch { /* ignorieren */ }
  const beat = () => {
    try { localStorage.setItem('showdown.slot.' + slot, JSON.stringify({ t: Date.now(), token: TOKEN })); } catch { /* ignorieren */ }
  };
  beat();
  setInterval(beat, 1000);
  window.addEventListener('beforeunload', () => {
    try { localStorage.removeItem('showdown.slot.' + slot); } catch { /* ignorieren */ }
  });
  return slot;
}
export const PROFILE_SLOT = pickSlot();
const KEY = PROFILE_SLOT === 0 ? BASE_KEY : BASE_KEY + '.s' + PROFILE_SLOT;
// alte Profile (vor dem Zurücksetzen) aufräumen
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && OLD_KEYS.some((o) => k === o || k.startsWith(o + '.s'))) localStorage.removeItem(k);
  }
} catch { /* ignorieren */ }

export function uuid() {
  if (window.crypto && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch { /* unsicherer Kontext */ }
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function freshStats() {
  return { xp: 0, level: 1, wins: 0, crownWins: 0, kills: 0, deaths: 0, matches: 0, damage: 0, headshots: 0, bestPlacement: 0, timePlayed: 0, bestStreak: 0 };
}

// Admin hat alle Spieler zurückgesetzt: alle Profile dieses Geräts löschen und merken, wann
// (neue Profile gelten danach sicher als „nach dem Reset“, auch wenn die Uhr falsch geht)
const WIPED_KEY = 'showdown.wipedAt';
export function wipeAllProfiles(at) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k === BASE_KEY || k.startsWith(BASE_KEY + '.s'))) localStorage.removeItem(k);
    }
    const prev = Number(localStorage.getItem(WIPED_KEY)) || 0;
    localStorage.setItem(WIPED_KEY, String(Math.max(prev, Number(at) || Date.now())));
  } catch { /* ignorieren */ }
}
function wipedAt() {
  try { return Number(localStorage.getItem(WIPED_KEY)) || 0; } catch { return 0; }
}

export class Profile {
  constructor() {
    this.data = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = JSON.parse(raw);
    } catch {
      this.data = null;
    }
    if (this.data) this.migrate();
    this.onChange = null;
  }

  // fehlende/alte Felder ergänzen (auch für Spielstände vom Server)
  migrate() {
    const d = this.data;
    d.stats = { ...freshStats(), ...(d.stats && typeof d.stats === 'object' ? d.stats : {}) };
    if (!d.id) d.id = uuid();
    if (!Number.isFinite(d.coins)) d.coins = 0;
    if (!Array.isArray(d.owned)) d.owned = [DEFAULT_OUTFIT];
    d.owned = [...new Set([DEFAULT_OUTFIT, ...d.owned.filter((o) => OUTFITS.includes(o))])];
    if (!d.owned.includes(d.outfit)) d.outfit = DEFAULT_OUTFIT;
    // Messer-Skins (Standard hat jeder)
    if (!Array.isArray(d.ownedKnives)) d.ownedKnives = ['standard'];
    d.ownedKnives = [...new Set(['standard', ...d.ownedKnives.filter((k) => k === 'standard' || KNIFE_SHOP[k])])];
    if (!d.ownedKnives.includes(d.knife)) d.knife = 'standard';
    // Ranked: jeder startet bei Bronze I
    d.rank = clampRank(d.rank);
    if (!Number.isFinite(d.bestRank)) d.bestRank = d.rank.i;
    if (!Number.isInteger(d.color) || d.color < 0 || d.color > 7) d.color = 0;
    if (!Number.isFinite(d.winStreak)) d.winStreak = 0;
    if (!d.crownStyle) d.crownStyle = 'gold';
  }

  get hasName() {
    return !!(this.data && this.data.name);
  }

  get id() { return this.data?.id; }
  get name() { return this.data?.name; }

  create(name, auth = null) {
    this.data = {
      id: uuid(),
      name,
      auth,
      createdAt: Math.max(Date.now(), wipedAt() + 1),
      outfit: DEFAULT_OUTFIT,
      coins: 0,
      owned: [DEFAULT_OUTFIT],
      rank: { i: 0, p: 0 },
      bestRank: 0,
      knife: 'standard',
      ownedKnives: ['standard'],
      color: Math.floor(Math.random() * 8),
      crownStyle: 'gold',
      winStreak: 0,
      soloChampion: null,
      stats: freshStats(),
      registered: false,
    };
    this.save();
  }

  set(k, v) {
    this.data[k] = v;
    this.save();
  }

  // Anmeldung auf einem anderen Gerät: Spielstand vom Server übernehmen
  adopt(id, name, auth, save) {
    const src = save && typeof save === 'object' ? save : {};
    const d = { id, name, auth, registered: true };
    for (const k of SAVE_FIELDS) if (src[k] !== undefined) d[k] = src[k];
    this.data = d;
    this.migrate();
    this.save();
  }

  // Spielstand für den Server
  saveBlob() {
    const out = {};
    for (const k of SAVE_FIELDS) if (this.data[k] !== undefined) out[k] = this.data[k];
    return out;
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignorieren */
    }
    if (this.onChange) this.onChange();
  }

  reset() {
    this.data = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignorieren */
    }
  }

  // Öffentliche Daten für Server / Match
  publicInfo() {
    const d = this.data;
    return {
      id: d.id,
      name: d.name,
      outfit: d.outfit,
      color: d.color,
      crownStyle: d.crownStyle,
      streak: d.winStreak,
      rank: d.rank ? d.rank.i : 0,
      knife: d.knife || 'standard',
    };
  }

  owns(outfit) {
    return this.data.owned.includes(outfit);
  }

  addCoins(n) {
    this.data.coins = Math.max(0, Math.round(this.data.coins + n));
    this.save();
  }

  // Skin kaufen: true, wenn gekauft (genug Coins)
  buy(outfit) {
    const item = SKIN_SHOP[outfit];
    if (!item || this.owns(outfit) || this.data.coins < item.price) return false;
    this.data.coins -= item.price;
    this.data.owned.push(outfit);
    this.save();
    return true;
  }

  ownsKnife(k) {
    return (this.data.ownedKnives || ['standard']).includes(k);
  }

  // Messer-Skin kaufen
  buyKnife(k) {
    const item = KNIFE_SHOP[k];
    if (!item || this.ownsKnife(k) || this.data.coins < item.price) return false;
    this.data.coins -= item.price;
    this.data.ownedKnives.push(k);
    this.save();
    return true;
  }

  // Ranked-Fortschritt eines Matches: { before, after, gain, promoted }
  applyRank(r) {
    const res = applyRankResult(this.data.rank, r.placement, r.kills);
    this.data.rank = res.after;
    this.data.bestRank = Math.max(this.data.bestRank || 0, res.after.i);
    this.save();
    return res;
  }

  // Ergebnis eines Matches übernehmen
  applyMatch(r) {
    const s = this.data.stats;
    s.matches++;
    s.kills += r.kills;
    s.damage += r.damage;
    s.headshots += r.headshots;
    s.timePlayed += Math.round(r.survival);
    if (r.arena) {
      // Arena: Kills/Schaden zählen, Siege und Kronen-Serie gibt es nur im Battle Royale
      this.save();
      return;
    }
    if (r.placement > 0 && (s.bestPlacement === 0 || r.placement < s.bestPlacement)) s.bestPlacement = r.placement;
    if (r.placement === 1) {
      if (this.data.winStreak > 0) s.crownWins++;
      s.wins++;
      this.data.winStreak++;
      s.bestStreak = Math.max(s.bestStreak, this.data.winStreak);
    } else {
      s.deaths++;
      this.data.winStreak = 0;
    }
    this.save();
  }
}


// Coins einer Runde: 50 pro Kill, 250 für den Sieg
export function computeCoins(r) {
  return (r.kills || 0) * COINS_PER_KILL + (r.placement === 1 ? COINS_PER_WIN : 0);
}
