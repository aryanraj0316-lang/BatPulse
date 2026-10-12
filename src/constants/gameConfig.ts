/**
 * All gameplay tunables. Everything gameplay-related that a designer
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
    edgeFalloff: 0.35, // 0..1: share of the radius over which the wave fades out
    glowHoldFraction: 0.4, // share of the glow time spent at full brightness before fading
    maxWaves: 8, // size of the pooled wave array
    waveLingerSec: 0.25, // how long the ring stays drawable after reaching full size
    revealGlowSec: 1.5,
    expandSec: 0.32,
    minTapGapMs: 120, // debounce for very fast taps
    buttonMinDp: 64,
  },
  player: {
    speed: 185, // px / s
    acceleration: 16,
    deceleration: 12,
    turnSpeed: 12, // heading smoothing rate (1/s); higher = snappier turns
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
    hitSpeedThreshold: 40, // px/s into a wall that counts as a hit (grazing slides do not)
    hitCooldownSec: 0.25, // minimum gap between wall-hit events
    movingSpeed: 25, // px/s above which the bat counts as moving
  },
  death: {
    shakeSec: 0.3,
    restartDelaySec: 1.0,
  },
  rewards: {
    starShards: { 1: 20, 2: 35, 3: 50 } as Record<number, number>,
    ghostRunBonus: 25,
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
    switchLosEnabled: true, // a pulse must have a clear line to the switch to trigger it
  },
  pickup: { radius: 10 },
  switch: { radius: 14 },
  hazards: {
    sliderLoopSecMin: 2,
    sliderLoopSecMax: 4,
    bladeThickness: 8, // width of each blade arm
    spikeForgiveness: 2, // px the spike hitbox is shrunk by, so touching a tip is not instant death
  },
  surfaces: {
    normal: { brightMult: 1, secMult: 1 } as { brightMult: number; secMult: number; fixedSec?: number },
    crystal: { brightMult: 2, secMult: 2 } as { brightMult: number; secMult: number; fixedSec?: number },
    mossy: { brightMult: 0.6, secMult: 0.2, fixedSec: 0.3 } as { brightMult: number; secMult: number; fixedSec?: number },
  },
  world: {
    wallSegmentLen: 60, // long walls are revealed in pieces of at most this length
    edgeThickness: 8, // glowing outline thickness of thick solid blocks
    maxDt: 0.05, // longest simulated step (s); longer frames are clamped
  },
  score: {
    base: 500,
    timeBonusPerSec: 50, // per second under 2x par time
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
