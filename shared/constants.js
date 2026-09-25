// Zentrale Spielkonstanten – Server und Client verwenden exakt dieselben Werte.

export const MATCH_SIZE = 12; // fest: jedes Match hat genau 12 Spieler
export const PARTY_MAX = 4;
export const MAP_SEED = 424242; // Insel ist immer gleich (POIs handplatziert, Deko per Seed)
export const SERVER_PORT = 4242;

export const SIM_HZ = 30;
export const SIM_DT = 1 / SIM_HZ;
export const SNAPSHOT_HZ = 20;
export const CLIENT_SEND_HZ = 30;
export const INTERP_DELAY = 0.1; // 100 ms Interpolationspuffer
export const MAX_REWIND = 0.3; // Lag-Kompensation max. 300 ms

export const COUNTDOWN = 3.6; // 3-2-1-GO
export const QUEUE_WAIT = 10; // Sekunden Wartezeit auf weitere Menschen
export const INVITE_TTL = 60;

// Welt
export const WORLD_HALF = 720; // Terrain reicht von -720..720
export const GRID_CELL = 4; // Terrain-Auflösung in Metern
export const SEA_LEVEL = 0;
export const DEEP_WATER = 1.25; // ab dieser Tiefe (Füße unter Wasser) treibt es zurück
export const BOUNDARY_RADIUS = 700;
export const SPAWN_MIN_DIST = 60;

// Spieler
export const MAX_HP = 200;
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
export const HEAL_MOVE_MULT = 0.5;
export const SLIDE_START_MULT = 1.8;
export const SLIDE_TIME = 1.0;
export const SLIDE_MAX_TIME = 2.2;
export const SLIDE_COOLDOWN = 0.8;
export const MAX_WALK_SLOPE = 0.72; // Normal-Y unter diesem Wert ist zu steil (~44°)

// Waffe: Sturmgewehr
export const WEAPON = {
  id: 'ar',
  magSize: 30,
  reserve: 180,
  fireRate: 5.5,
  damageBody: 19,
  damageHead: 26,
  damageLimb: 16,
  falloffStart: 50,
  falloffEnd: 100,
  falloffMin: 0.7,
  range: 400,
  reloadTactical: 1.9,
  reloadEmpty: 2.4,
  // Streuung in Grad
  spreadBase: 1.1,
  spreadMove: 2.2,
  spreadAir: 4.5,
  spreadPerShot: 0.4,
  spreadMaxBloom: 3.2,
  spreadRecover: 7,
  crouchMult: 0.6,
  adsMult: 0.28,
  // Rückstoß in Grad
  recoilUp: 0.85,
  recoilSide: 0.4,
};

// Medkits
export const MEDKIT_START = 1;
export const MEDKIT_MAX = 5;
export const MEDKIT_HEAL = 75;
export const MEDKIT_TIME = 1.0;

// Sturm – 5 Phasen, Start nach 60 s
export const STORM_PHASES = [
  { wait: 60, shrink: 45, radius: 440, dps: 1 },
  { wait: 40, shrink: 35, radius: 270, dps: 1 },
  { wait: 35, shrink: 30, radius: 150, dps: 2 },
  { wait: 30, shrink: 25, radius: 70, dps: 5 },
  { wait: 25, shrink: 25, radius: 0, dps: 10 },
];
export const STORM_START_RADIUS = 760;

// Sichtbarkeit/Wahrnehmung der Bots
export const BOT_FOV = 120;
export const BOT_VIEW_DIST = 150;
export const BOT_HEAR_DIST = 100;

// Spielerflags für Animation/Netzwerk (Bitmaske)
export const F = {
  MOVING: 1,
  SPRINT: 2,
  CROUCH: 4,
  SLIDE: 8,
  AIR: 16,
  ADS: 32,
  RELOAD: 64,
  HEAL: 128,
  FIRING: 256,
  DEAD: 512,
  WATER: 1024,
};

export const BOT_DIFFICULTIES = ['easy', 'normal', 'hard', 'pro'];

export const OUTFITS = ['cowboy', 'ranger', 'ninja', 'soldier', 'dancer', 'pirate', 'chef', 'astronaut'];
export const OUTFIT_COLORS = ['#e63946', '#2a9df4', '#43aa5b', '#f4a261', '#9b5de5', '#f15bb5', '#222831', '#f1faee'];
export const WEAPON_SKINS = ['grey', 'green', 'blue', 'purple', 'gold'];
export const CROWN_STYLES = ['gold', 'ruby', 'emerald', 'diamond'];

export function xpForLevel(level) {
  return 800 + 200 * (level - 1);
}
