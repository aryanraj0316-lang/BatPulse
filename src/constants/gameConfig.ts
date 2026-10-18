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
    falloffExponent: 1, // brightness = (1 - distance / radius) ^ this: 1 = linear, >1 drops faster near the bat, <1 stays brighter longer
    edgeMinIntensity: 0.1, // faintest highlight just inside the wave's reach (beyond the radius is 0)
    glowHoldFraction: 0.4, // share of the glow time spent at full brightness before fading
    maxWaves: 8, // size of the pooled wave array
    waveLingerSec: 0.25, // how long the ring stays drawable after reaching full size
    revealGlowSec: 1.5,
    expandSec: 0.32,
    minTapGapMs: 120, // debounce for very fast taps
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
  /** Touch gestures: a quick tap anywhere sends a pulse; a drag or a hold takes the joystick. */
  input: {
    tapMaxMs: 220, // a touch shorter than this (and not moved) is a tap; held longer it becomes the joystick
    tapMaxTravelPx: 10, // moving further than this makes the touch a drag (the joystick), not a tap
    stickRestAlpha: 0.2, // joystick opacity when idle (barely visible, just marks where it is)
    stickActiveAlpha: 0.28, // and while a finger is steering
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
    ghostRunBonus: 25, // first time a level is completed as a Ghost Run
    replayFactor: 0.25, // replays pay this share of a first clear
    dailyLoginMin: 50,
    dailyLoginMax: 100,
    dailyStreakBonus: 100, // on day 7 of a streak
    dailyStreakDays: 7,
    /** Chapter mastery: bonus shards the first time this share of a chapter's stars is reached. */
    masteryMilestones: [
      { pct: 0.25, bonus: 20 },
      { pct: 0.5, bonus: 30 },
      { pct: 0.75, bonus: 50 },
      { pct: 1, bonus: 100 },
    ],
  },
  /** Daily reward trusted time: the phone clock is never trusted for the daily reward. */
  trustedTime: {
    // first reachable source wins; each parser turns the response into UTC milliseconds
    sources: [
      { url: 'https://worldtimeapi.org/api/timezone/Etc/UTC', kind: 'worldtimeapi' },
      { url: 'https://timeapi.io/api/Time/current/zone?timeZone=UTC', kind: 'timeapi' },
    ] as { url: string; kind: 'worldtimeapi' | 'timeapi' }[],
    timeoutMs: 6000,
  },
  enemy: {
    radius: 16,
    hearingRadiusMult: 1.2, // x pulse radius
    spawnSafeSec: 3, // hunters ignore everything for this long after an attempt starts
    slowHunterSpeedMult: 0.85, // x the player's max speed (15% slower)
    fastHunterSpeedMult: 1.0,
    patrolSpeedFactor: 0.55, // patrol is slow: this share of the hunter's chase speed
    visibleOnHitSec: 1, // a wave shows a hunter for this long
    alertToChaseSec: 1.5, // reach = chase speed x this: close enough to lock on
    lostSearchSec: 4,
    senseRadius: 55, // a hunter notices the bat directly inside this distance (with a clear line)
    loseDistanceMult: 1.8, // x reach: beyond this a chase is given up
    loseNoSightSec: 2, // chase also ends after this long without a clear line
    repathSec: 0.25, // how often a chasing hunter re-plans its route
    dwellSec: 0.6, // pause at each patrol waypoint
    searchSway: 50, // how far a searching hunter wanders around the last known spot
    tileSize: 20,
    threatRadiusTiles: 5, // heartbeat and red edge start inside this many tiles
    switchNoiseRadius: 180, // a switch click is heard this far away
    soundMarkerSec: 2, // how long the ring stays where a pulse was made
    heartbeatSlowSec: 1,
    heartbeatFastSec: 0.35,
    jumpEffectCooldownSec: 25, // the dark jump effect is not repeated more often than this
    jumpEffectMaxPerLevel: 2,
  },
  checkpoint: { radius: 24 },
  escape: {
    defaultStartGap: 140, // the wall starts this far behind the start point
    respawnGap: 220, // after a checkpoint respawn the wall is pushed back to at least this far behind the bat
    warnRange: 180, // heartbeat and red edge when the wall is this close
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
    // Names, prices and every stat are data: rename or retune here, nothing else changes.
    bat_rookie: { name: 'The Rookie', tagline: 'Balanced wings, normal pulse', price: 0, glowBonusSec: 0, radiusMult: 1, hearingMult: 1, momentumRateMult: 1, momentumCap: 2.0 },
    bat_vesper: { name: 'Vesper', tagline: 'High-frequency bat: walls and spikes glow 2 s longer', price: 1500, glowBonusSec: 2, radiusMult: 1, hearingMult: 1, momentumRateMult: 1, momentumCap: 2.0 },
    bat_sonarbot: { name: 'Sonar-Bot', tagline: 'Cyber bat: pulse radius x1.5', price: 3500, glowBonusSec: 0, radiusMult: 1.5, hearingMult: 1, momentumRateMult: 1, momentumCap: 2.0 },
    bat_phantom: { name: 'Phantom', tagline: 'The whisperer: hunters hear its pulses at half range', price: 6000, glowBonusSec: 0, radiusMult: 1, hearingMult: 0.5, momentumRateMult: 1, momentumCap: 2.0 },
    bat_turbo: { name: 'Turbo Moth', tagline: 'Momentum builds twice as fast, up to x4.0', price: 10000, glowBonusSec: 0, radiusMult: 1, hearingMult: 1, momentumRateMult: 2, momentumCap: 4.0 },
  } as Record<string, CharacterStats>,
  /**
   * Online features. Every one is OFF until a real backend exists and its address is filled in:
   * the game is fully playable offline and never shows a broken online screen.
   */
  online: {
    cloudSave: { enabled: false, baseUrl: '', timeoutMs: 8000, minIntervalSec: 60 },
    leaderboard: { enabled: false, baseUrl: '', timeoutMs: 8000, topCount: 10 },
    /** Rewarded ads: optional, never required, off until an ad SDK is integrated and enabled here. */
    ads: { enabled: false, rewardShards: 50, maxPerDay: 5 },
  },
  audio: {
    /**
     * Cave reverb. expo-audio has no effect chain, so the echo is a few quieter, delayed repeats of the ping.
     * Bigger caves (level area / referenceArea) give a longer, wider tail.
     */
    reverb: {
      taps: 3,
      firstDelaySec: 0.14,
      spacingSec: 0.11,
      gain: 0.38, // first repeat, relative to the dry ping
      decay: 0.55, // each further repeat
      referenceArea: 400 * 800, // a level of this area has scale 1
      minScale: 0.7,
      maxScale: 1.8,
    },
  },
  perf: {
    targetFps: 60,
    minAcceptableFps: 50, // low-end device floor
    frameBudgetMs: 1000 / 60,
    /** Graphics 'auto': drop to low quality when frames run long (and stay there for the session). */
    autoQuality: {
      warmupFrames: 60, // level start hitches are ignored
      windowFrames: 120, // 2 s at 60 FPS
      downgradeFrameMs: 22, // average slower than this (about 45 FPS) triggers the downgrade
      ignoreFrameMs: 150, // a single frame this long is a pause/background, not slowness
    },
    cullMarginWorld: 80, // lit things this far outside the screen are still drawn (no pop-in)
  },
  level: {
    loadBudgetMs: 1000,
  },
};

export interface CharacterStats {
  name: string;
  tagline: string;
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
