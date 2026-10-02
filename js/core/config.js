/* ============================================================
   AEL — Aetherlands: A browser 3D RPG
   config.js — global constants and tuning
   ============================================================ */
const CFG = {
  VERSION: "1.0.0",
  SAVE_KEY: "ael_save_v1",

  // World
  WORLD: {
    SIZE: 7200,               // playable diameter x/z ([-3600,3600])
    CHUNK: 480,               // chunk size in world units
    SEG: 60,                  // segments per chunk (vertex every 8 units)
    VIEW_CHUNKS: 5,           // chunks rendered around player (odd)
    WATER_LEVEL: 0.6,
    MAX_HEIGHT: 260,
    MIN_HEIGHT: -18,
  },

  // Player
  PLAYER: {
    WALK: 6.0,
    RUN: 9.5,
    RIDE: 16.5,
    RIDE_RUNQ: 1.15,
    DASH_SPEED: 24,
    DASH_TIME: 0.22,
    DASH_COST: 18,
    JUMP: 7.5,
    GRAVITY: 24,
    ROT_SPEED: 8,
    CAM_DIST: 9.2,
    CAM_HEIGHT: 3.6,
    CAM_LERP: 5,
    STAMINA_REGEN: 16,
    STAMINA_REGEN_DELAY: 0.9,
    ATTACK_RANGE: 3.1,
    ATTACK_ARC: 1.25,
    PHYS_RADIUS: 0.8,
    DROP_FORGIVENESS: 6,
    SAVE_INTERVAL: 20,
    RESPAWN_TIME: 4,
  },

  // Combat formulas
  XP_FOR_LEVEL: function (lvl) {
    return Math.floor(40 * Math.pow(lvl, 1.55) + 20);
  },
  DAMAGE: {
    BASE_PLAYER: 6,
    BASE_ENEMY: 5,
    CRIT_MULT: 1.9,
    BLOCK_REDUCTION: 0.45,
  },

  // Economy
  GOLD: {
    DROP_MIN: 2,
    DROP_MAX: 16,
    DEATH_TAX: 0.08,
  },

  SPAWN: { MIN_DIST: 26, MAX_DIST: 90, TICK: 1.2 },

  TIME: { DAY_LEN: 600, START_HOUR: 9 },

  QUALITY: { DEFAULT: "high" },
};

CFG.CASTLE = {
  FLOORS: 100,
  MIN_LEVEL: 6,
  GATE_PER_FLOOR: 0.11,
  CLEAR_REWARD_GOLD: 60,
  // Floor theme tiers (each spans 25 floors)
  THEMES: [
    { name: "Ciudadela Árida", wall: 0xb8a57a, accent: 0x8a6f3c, fog: 0xd8cbb2 },
    { name: "Bastión Carmesí", wall: 0x8a3a3a, accent: 0x4a2424, fog: 0x5a2a2a },
    { name: "Salón Sombrío", wall: 0x3d4660, accent: 0x222233, fog: 0x2a3050 },
    { name: "Torre de Obsidiana", wall: 0x2b2b35, accent: 0x0f0f16, fog: 0x181820 },
  ],
};

CFG.GACHA = {
  SPIN_COST: 350,
  GUARANTEE_EVERY: 10,
  RATES: { common: 0.55, rare: 0.30, epic: 0.12, legendary: 0.03 },
};