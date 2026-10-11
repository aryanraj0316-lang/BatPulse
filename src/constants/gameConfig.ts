export const GAME_CONFIG = {
  // Sonar wave & raycast constants
  SONAR_RADIUS: 290,
  SONAR_EXPAND_DURATION: 0.32, // fast punchy expansion
  SONAR_RAY_COUNT: 144, // radial rays
  SONAR_COOLDOWN: 280, // ms between pulses
  DISTANCE_DECAY_FACTOR: 0.85, // falloff at edge of sonar wave

  // Snappy instant Reveal decay timings (ms) — quick flash that fades immediately
  REVEAL_FULL_DURATION: 220, // FRESH tier (bright flash)
  REVEAL_FADE_DURATION: 260, // FADING tier (quick decay)
  REVEAL_ECHO_DURATION: 320, // ECHO tier (final fadeout)
  ECHO_JITTER_AMPLITUDE: 2.0, // ±px memory uncertainty jitter

  // Player physics
  PLAYER_RADIUS: 14,
  PLAYER_SPEED: 185, // pixels per second
  PLAYER_ACCEL: 16.0, // lerp factor
  PLAYER_FRICTION: 12.0,
  MOVEMENT_NOISE_THRESHOLD: 0.7, // >70% joystick magnitude emits footstep echo
  MOVEMENT_NOISE_FACTOR: 0.15, // 15% of sonar audibility

  // Hunter (The Wraith)
  HUNTER_RADIUS: 18,
  HUNTER_SPEED_RATIO: 0.82, // 0.82x player speed
  HUNTER_HEARING_RADIUS: 380, // Hearing distance for pings
  HUNTER_FOOTSTEP_HEARING_RADIUS: 140, // Hearing distance for sprint footsteps
  HUNTER_SEARCH_TIME: 4500, // ms of spiral search before returning to patrol
  HUNTER_FRENZY_MULT: 1.15, // 1.15x player speed in frenzy
  HUNTER_FRENZY_DURATION: 3000, // ms frenzy lasts

  // Momentum & Scoring
  MOMENTUM_TICK: 500, // ms of movement for +1 momentum
  MOMENTUM_CAP: 20,
  PERFECT_ECHO_BONUS: 250, // bonus per pulse left
  GHOST_RUN_BONUS: 1000, // cleared without alert
  BLIND_FINISH_BONUS_MULT: 1.5,

  // Particles, Dust, Effects
  PARTICLE_POOL_SIZE: 36,
  DUST_COUNT: 18,
  GRAIN_OPACITY: 0.04,
  TARGET_FPS: 60,

  // Responsive arena world size
  WORLD_WIDTH: 380,
  WORLD_HEIGHT: 660,
};

/**
 * Spec-driven tunables (Echo Location rebuild). Everything gameplay-related that a designer
 * might tweak lives here; systems read these values and never hard-code numbers.
 * Times are in seconds unless the key says Ms.
 */
export const ECHO_CONFIG = {
  sonar: {
    defaultCharges: 3,
    defaultRechargeSec: 4,
    tutorialRechargeSec: 2, // Echo 01-05
    tutorialLevelMax: 5,
    maxRadiusScreenFraction: 0.4, // of screen width
    edgeFalloff: 0.35, // 0..1 – share of the radius over which the wave fades out
    revealGlowSec: 1.5,
    expandSec: 0.32,
    minTapGapMs: 120, // debounce for very fast taps
    buttonMinDp: 64,
  },
  player: {
    speed: 185, // px / s
    acceleration: 16,
    deceleration: 12,
    turnRate: 0.25, // fraction of remaining angle closed per frame
    joystickDeadZone: 0.1,
    joystickRadius: 50,
    radius: 14,
  },
  momentum: {
    start: 1.0,
    step: 0.1,
    intervalSec: 2,
    max: 2.0,
    idleResetSec: 1.5,
    resetOnWallHit: true,
  },
  death: {
    shakeSec: 0.3,
    restartDelaySec: 1.0,
  },
  rewards: {
    starShards: { 1: 20, 2: 35, 3: 50 } as Record<number, number>,
    ghostRunBonus: 25,
    momentumBonusPerStep: 2, // shards per 0.1 of momentum above x1.0 at finish
    replayFactor: 0.25, // replays pay this share of a first clear
    dailyLoginMin: 50,
    dailyLoginMax: 100,
    dailyStreakBonus: 100, // on day 7 of a streak
    dailyStreakDays: 7,
  },
  enemy: {
    hearingRadiusMult: 1.2, // x pulse radius
    spawnSafeSec: 3,
    slowHunterSpeedMult: 0.85, // vs player's max speed
    fastHunterSpeedMult: 1.0,
    visibleOnHitSec: 1,
    alertToChaseSec: 1.5,
    lostSearchSec: 4,
    threatRadiusTiles: 5,
    chaseRadiusTiles: 1.5,
  },
  door: {
    openSec: 8,
  },
  hazards: {
    sliderLoopSecMin: 2,
    sliderLoopSecMax: 4,
  },
  characters: {
    bat_rookie: { name: 'The Rookie', price: 0, glowBonusSec: 0, radiusMult: 1, hearingMult: 1, momentumRateMult: 1, momentumCap: 2.0 },
    bat_vesper: { name: 'Vesper', price: 1500, glowBonusSec: 2, radiusMult: 1, hearingMult: 1, momentumRateMult: 1, momentumCap: 2.0 },
    bat_sonarbot: { name: 'Sonar-Bot', price: 3500, glowBonusSec: 0, radiusMult: 1.5, hearingMult: 1, momentumRateMult: 1, momentumCap: 2.0 },
    bat_phantom: { name: 'Phantom', price: 6000, glowBonusSec: 0, radiusMult: 1, hearingMult: 0.5, momentumRateMult: 1, momentumCap: 2.0 },
    bat_turbo: { name: 'Turbo Moth', price: 10000, glowBonusSec: 0, radiusMult: 1, hearingMult: 1, momentumRateMult: 2, momentumCap: 4.0 },
  } as Record<string, CharacterStats>,
  perf: {
    targetFps: 60,
    minAcceptableFps: 50, // low-end device floor
    frameBudgetMs: 1000 / 60,
  },
  level: {
    loadBudgetMs: 1000,
  },
};

export interface CharacterStats {
  name: string;
  price: number;
  glowBonusSec: number;
  radiusMult: number;
  hearingMult: number;
  momentumRateMult: number;
  momentumCap: number;
}

export const DEV_KEYS = {
  TAP_COUNT_TO_UNLOCK_DEV: 5,
};
