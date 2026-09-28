// Zentrale Spielkonstanten – Server und Client verwenden exakt dieselben Werte.

export const GAME_NAME = 'SHOWDOWN BAY';
export const MATCH_SIZE = 20; // jedes Match: 20 Spieler, freie Plätze füllen Bots
export const PARTY_MAX = 4;
export const SERVER_PORT = 4242;

export const SIM_HZ = 30;
export const SIM_DT = 1 / SIM_HZ;
export const SNAPSHOT_HZ = 20;
export const CLIENT_SEND_HZ = 30;
export const INTERP_DELAY = 0.1; // 100 ms Interpolationspuffer
export const MAX_REWIND = 0.3; // Lag-Kompensation max. 300 ms

export const COUNTDOWN = 3.6; // 3-2-1-GO
// Warteschlange: so lange wird auf echte Spieler gewartet, dann füllen Bots auf (einstellbar)
export const QUEUE_WAIT = 15;
export const QUEUE_WAIT_MIN = 10;
export const QUEUE_WAIT_MAX = 120;
export function clampQueueWait(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(QUEUE_WAIT_MIN, Math.min(QUEUE_WAIT_MAX, n)) : QUEUE_WAIT;
}
export const INVITE_TTL = 60;

// Welt: verschneite Insel mitten im Meer (Frostfeste) – 25 % mehr Fläche als die alten Inseln
export const WORLD_HALF = 240; // Terrain reicht von -240..240 (außen offenes Meer)
export const GRID_CELL = 1.25; // Terrain-Auflösung in Metern
export const PLAY_RADIUS = 159; // ungefährer Inselradius (Küstenlinie)
export const SEA_LEVEL = 0;
export const DEEP_WATER = 1.25; // tieferes Wasser (offenes Meer) kann man nicht betreten
export const BOUNDARY_RADIUS = 179;
export const SPAWN_MIN_DIST = 38;
export const SPAWN_MAX_HEIGHT = 30; // nicht auf Berggipfeln starten

// Leben: 100 Gesundheit (grün) + 100 Schild (blau); Start mit 50 Überschild, der nicht zurückkommt
export const MAX_HEALTH = 100;
export const MAX_SHIELD = 100;
export const START_OVERSHIELD = 50;
export const SIPHON = 50; // pro Eliminierung: erst Gesundheit, Rest als Schild

// Spieler
export const PLAYER_RADIUS = 0.38;
export const STAND_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.2;
export const SLIDE_HEIGHT = 1.0;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.1;
export const EYE_SLIDE = 0.85;
export const STEP_HEIGHT = 0.55;
export const GRAVITY = 22;
export const JUMP_SPEED = 7.4;

export const WALK_SPEED = 5.4;
export const SPRINT_MULT = 1.75;
export const CROUCH_MULT = 0.5;
export const ADS_MULT = 0.65;
export const USE_MOVE_MULT = 0.5; // Bewegung beim Benutzen von Schilden/Medikits
export const SLIDE_START_MULT = 2.35;
export const SLIDE_TIME = 1.3;
export const SLIDE_MAX_TIME = 3.0;
export const SLIDE_COOLDOWN = 0.7;
export const SLIDE_FRICTION = 4.2;
// Ausdauer fürs Sprinten (weißer Balken über der Hotbar)
export const STAMINA_SPRINT_TIME = 7; // s Dauersprint mit voller Ausdauer
export const STAMINA_REGEN_TIME = 3.2; // s von leer auf voll
export const STAMINA_REGEN_DELAY = 0.7; // s Pause, bevor sie sich erholt
export const STAMINA_RECOVER = 0.3; // nach komplett leer erst ab 30 % wieder sprinten
export const MAX_WALK_SLOPE = 0.72; // Normal-Y unter diesem Wert ist zu steil (~44°)

// Reichweiten für Truhen und Gegenstände
export const INTERACT_RANGE = 2.6;
export const AUTO_PICKUP_RANGE = 1.3; // Munition wird beim Drüberlaufen eingesammelt

// Sturm – 5 Phasen, Start nach 55 s, eine Runde dauert höchstens ca. 5 Minuten
export const STORM_PHASES = [
  { wait: 55, shrink: 40, radius: 108, dps: 1 },
  { wait: 35, shrink: 30, radius: 72, dps: 1 },
  { wait: 30, shrink: 25, radius: 42, dps: 2 },
  { wait: 25, shrink: 20, radius: 17, dps: 5 },
  { wait: 18, shrink: 18, radius: 0, dps: 10 },
];
export const STORM_START_RADIUS = 240;

// Sichtbarkeit/Wahrnehmung der Bots
export const BOT_FOV = 120;
export const BOT_VIEW_DIST = 85;
export const BOT_HEAR_DIST = 45;

// Spielerflags für Animation/Netzwerk (Bitmaske)
export const F = {
  MOVING: 1,
  SPRINT: 2,
  CROUCH: 4,
  SLIDE: 8,
  AIR: 16,
  ADS: 32,
  RELOAD: 64,
  USING: 128,
  FIRING: 256,
  DEAD: 512,
  WATER: 1024,
  KNOCKED: 2048, // Duo: niedergeschlagen, kriecht
  REVIVING: 4096, // wird gerade wiederbelebt
};

// Duo: Niederschlagen + Wiederbeleben (wie im Original)
export const MODES = ['solo', 'duo'];
export const KNOCK_HP = 100; // Leben am Boden
export const KNOCK_BLEED = 3; // Lebensverlust pro Sekunde am Boden (~33 s)
export const REVIVE_TIME = 5; // Sekunden zum Wiederbeleben
export const REVIVE_HP = 30; // Leben nach dem Wiederbeleben
export const REVIVE_RANGE = 2.6;
export const CRAWL_MULT = 0.8; // zusätzlich zum Ducken: Kriechen am Boden

export const OUTFITS = ['recruit', 'cowboy', 'ranger', 'chef', 'pirate', 'soldier', 'dancer', 'ninja', 'astronaut'];
// Shop: Standard ist „Rekrut“ (kein Skin), alles andere kauft man mit Coins
export const DEFAULT_OUTFIT = 'recruit';
export const COINS_PER_KILL = 50;
export const COINS_PER_WIN = 250;
// Messer-Skins im Shop (Standard kostenlos); Seltenheit wie bei Waffen
export const KNIFE_SHOP = {
  tactical: { price: 500, rarity: 1 },
  neon: { price: 1200, rarity: 2 },
  gold: { price: 1800, rarity: 3 },
  dragon: { price: 2500, rarity: 4 },
};
// Admin-Zugang (Panel mit Taste 0) – der Server prüft ihn beim Coins-Verschenken
export const ADMIN_USER = 'adrian';
export const ADMIN_PASS = '1234';
export const ADMIN_MAX_COINS = 100000;
// „Leuchtfeuer“: Wer online hostet, meldet seine Tunnel-Adresse über ntfy.sh. Die Webseite
// (GitHub Pages) fragt dort nach und verbindet sich automatisch mit dem laufenden Host.
export const BEACON_BASE = 'https://ntfy.sh';
export const BEACON_TOPIC = 'showdownbay-dnoadrian-savanna';
export const BEACON_INTERVAL = 60; // s – so oft meldet sich der Host
export const BEACON_MAX_AGE = 180; // s – ältere Meldungen gelten als offline
// Preis und Seltenheit (0..4) je Skin – ein Skin kostet etwa 3–15 Runden
export const SKIN_SHOP = {
  cowboy: { price: 600, rarity: 1 },
  ranger: { price: 600, rarity: 1 },
  chef: { price: 800, rarity: 1 },
  pirate: { price: 1200, rarity: 2 },
  soldier: { price: 1200, rarity: 2 },
  dancer: { price: 1500, rarity: 3 },
  ninja: { price: 2000, rarity: 3 },
  astronaut: { price: 2500, rarity: 4 },
};
export const OUTFIT_COLORS = ['#e63946', '#2a9df4', '#43aa5b', '#f4a261', '#9b5de5', '#f15bb5', '#222831', '#f1faee'];
export const CROWN_STYLES = ['gold', 'ruby', 'emerald', 'diamond'];

export function xpForLevel(level) {
  return 800 + 200 * (level - 1);
}
