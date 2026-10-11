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

export const DEV_KEYS = {
  TAP_COUNT_TO_UNLOCK_DEV: 5,
};
