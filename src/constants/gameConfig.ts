export const GAME_CONFIG = {
  // Sonar wave & raycast constants
  SONAR_RADIUS: 140, // how far a pulse travels + lights up (Wide Pulse ability = x1.4)
  SONAR_EXPAND_DURATION: 0.32, // fast punchy expansion
  SONAR_RAY_COUNT: 144, // radial rays
  SONAR_COOLDOWN: 280, // ms between pulses
  DISTANCE_DECAY_FACTOR: 0.85, // falloff at edge of sonar wave

  // Snappy instant Reveal decay timings (ms) — quick flash that fades immediately
  REVEAL_FULL_DURATION: 220, // FRESH tier (bright flash)
  REVEAL_FADE_DURATION: 260, // FADING tier (quick decay)
  REVEAL_ECHO_DURATION: 320, // ECHO tier (final fadeout)
  ECHO_JITTER_AMPLITUDE: 2.0, // ±px memory uncertainty jitter

  // Darkness / visibility (render)
  DARKNESS_OPACITY: 1, // unrevealed maze is fully hidden (original behaviour)
  // Matches the original reveal tiers: FRESH (220) then FADING + ECHO (260 + 320)
  REVEAL_HOLD_MS: 220, // a pulse keeps its area fully lit this long after expanding
  REVEAL_FADE_MS: 580, // then the darkness closes back in over this long
  PLAYER_AURA_RADIUS: 38, // soft light on the floor right under the bat, fading to black
  PLAYER_AURA_STRENGTH: 0.75, // brightness at the centre (0 = off)
  LANTERN_LIGHT_RADIUS: 0, // optional: lanterns light nearby maze (0 = off, original)
  LANTERN_LIGHT_STRENGTH: 0,
  LANTERNS_GLOW_IN_DARK: false, // false = lanterns only show when the sonar reveals them
  // Enemies fade in out of the dark as the bat gets close (visual only)
  WRAITH_FADE_START: 170, // px — enemy starts to appear faintly at this distance
  WRAITH_FADE_FULL: 45, // px — enemy is clearest at this distance or closer
  WRAITH_FADE_MAX: 0.85, // how visible it gets from proximity alone (a sonar ping still shows it fully)
  WRAITH_VISIBLE_MS: 600, // how long a pinged wraith stays visible (original)

  // Player physics
  PLAYER_RADIUS: 11, // collision size (the drawn bat is a little larger)
  CORRIDOR_CLEARANCE: 8,
  // Lock & key: the exit is sealed behind laser barriers until the key is collected
  LOCK_AND_KEY: true,
  LOCK_FIRST_LEVEL: 3,
  HUD_SAFE_TOP: 110, // px — keys are never placed under the HUD bar / dev buttons
  // Sonar reload: at or below this many pulses the sonar starts recharging, one pulse at a time, until full
  SONAR_RELOAD_BELOW: 2,
  SONAR_RELOAD_MS: 4000, // time to recharge one pulse
  MAX_GRID_COLS: 8, // no level gets denser than this (keeps later mazes clean and readable)
  MAX_GRID_ROWS: 12, // px of free space beside the bat in the narrowest corridor
  LANE_ASSIST: 7, // how strongly the bat is eased to the middle of the corridor it flies along (0 = off)
  PLAYER_SPEED: 150, // pixels per second (wraiths move at HUNTER_SPEED_RATIO of this)
  PLAYER_ACCEL: 16.0, // lerp factor
  PLAYER_FRICTION: 12.0,
  MOVEMENT_NOISE_THRESHOLD: 0.7, // >70% joystick magnitude emits footstep echo
  MOVEMENT_NOISE_FACTOR: 0.15, // 15% of sonar audibility

  // Hunter (The Wraith)
  HUNTER_RADIUS: 18,
  HUNTER_SPEED_RATIO: 0.82, // 0.82x player speed
  // Enemies detect by SIGHT only: the bat must enter the red cone with a clear line of sight
  HUNTER_VISION_RANGE: 130, // px — length of the red vision cone (also what is drawn)
  HUNTER_VISION_HALF_ANGLE: 22.5, // degrees — half the cone width (45° wedge)
  HUNTER_SENSE_RADIUS: 70, // px — enemies also notice the bat this close, in any direction (even through walls)
  HUNTER_SWEEP_DEG: 35, // idle enemies sweep their cone ± this many degrees
  HUNTER_LOSE_DISTANCE: 230, // px — beyond this the enemy gives up and stays where it is
  HUNTER_PATROL_RADIUS: 2, // cells — idle enemies drift around their post within this many steps (0 = stand still)
  HUNTER_PATROL_SPEED: 0.4, // patrol speed as a fraction of chase speed
  HUNTER_FORGET_MS: 2500, // ms — a hunting enemy that can't see/sense the bat this long gives up too
  HUNTER_BODY_RADIUS: 9, // px — enemy body size for wall collisions
  HUNTER_REPATH_MS: 250, // how often a hunting enemy re-plans its route
  HUNTER_HEARING_RADIUS: 380, // (no longer used: enemies no longer hear pings; kept for the dev panel)

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
