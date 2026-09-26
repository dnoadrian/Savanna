// Zentrale Spielkonstanten – Server und Client verwenden exakt dieselben Werte.

export const GAME_NAME = 'SHOWDOWN BAY';
export const MATCH_SIZE = 12; // jedes Match: 12 Spieler, freie Plätze füllen Bots
export const PARTY_MAX = 4;
export const MAP_SEED = 20260926; // Karte ist immer gleich (Orte handplatziert, Deko per Seed)
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

// Welt: Bucht im Canyon (Wasser, Stege, Inseln, drei Orte)
export const WORLD_HALF = 150; // Terrain reicht von -150..150
export const GRID_CELL = 1.25; // Terrain-Auflösung in Metern
export const PLAY_RADIUS = 100; // ab hier beginnen die Canyonwände
export const SEA_LEVEL = 0;
export const DEEP_WATER = 1.25; // tieferes Wasser gibt es in der Bucht nicht
export const BOUNDARY_RADIUS = 104;
export const SPAWN_MIN_DIST = 32;

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
export const SPRINT_MULT = 1.5;
export const CROUCH_MULT = 0.5;
export const ADS_MULT = 0.65;
export const USE_MOVE_MULT = 0.5; // Bewegung beim Benutzen von Schilden/Medikits
export const SLIDE_START_MULT = 1.8;
export const SLIDE_TIME = 1.0;
export const SLIDE_MAX_TIME = 2.2;
export const SLIDE_COOLDOWN = 0.8;
export const MAX_WALK_SLOPE = 0.72; // Normal-Y unter diesem Wert ist zu steil (~44°)

// Reichweiten für Truhen und Gegenstände
export const INTERACT_RANGE = 2.6;
export const AUTO_PICKUP_RANGE = 1.3; // Munition wird beim Drüberlaufen eingesammelt

// Sturm – 5 Phasen, Start nach 45 s, eine Runde dauert höchstens ca. 4 Minuten
export const STORM_PHASES = [
  { wait: 45, shrink: 30, radius: 76, dps: 1 },
  { wait: 30, shrink: 25, radius: 50, dps: 1 },
  { wait: 25, shrink: 20, radius: 29, dps: 2 },
  { wait: 20, shrink: 15, radius: 12, dps: 5 },
  { wait: 15, shrink: 15, radius: 0, dps: 10 },
];
export const STORM_START_RADIUS = 150;

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
};

export const OUTFITS = ['cowboy', 'ranger', 'ninja', 'soldier', 'dancer', 'pirate', 'chef', 'astronaut'];
export const OUTFIT_COLORS = ['#e63946', '#2a9df4', '#43aa5b', '#f4a261', '#9b5de5', '#f15bb5', '#222831', '#f1faee'];
export const CROWN_STYLES = ['gold', 'ruby', 'emerald', 'diamond'];

export function xpForLevel(level) {
  return 800 + 200 * (level - 1);
}
