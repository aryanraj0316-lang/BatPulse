import { ECHO_CONFIG } from '../constants/gameConfig';
import { Body, circleOverlapsBox, resolveCircleBoxes } from './collision';
import { HintTracker } from './hints';
import { Momentum } from './momentum';
import { applyWaves, RevealState, WaveField } from './reveal';
import { SonarEnergy } from './sonarEnergy';
import { World } from './world';

export type SimEvent = 'restart' | 'pulse' | 'no_charge' | 'wall_hit' | 'death' | 'finish';
export type SimStatus = 'playing' | 'dying' | 'won';

export interface SimParams {
  /** Pulse radius in world units. */
  pulseRadius: number;
  /** Seconds added to wall/spike glow (Vesper). */
  glowBonusSec?: number;
  /** Momentum rate multiplier and cap (Turbo Moth). */
  momentumRateMult?: number;
  momentumMax?: number;
}

const HALF_PI = Math.PI / 2;

/**
 * The whole rules engine for one level attempt. Pure TypeScript: no React, no timers, no platform code.
 * The host calls `step(dt)` once per frame and forwards input; everything else is deterministic,
 * so the same inputs always produce the same run (this is what the automated level tests rely on).
 * All per-frame state lives in preallocated objects and typed arrays.
 */
export class GameSim {
  readonly body: Body;
  /** Facing direction in radians (0 = right, -PI/2 = up). */
  rotation = -HALF_PI;
  status: SimStatus = 'playing';
  elapsed = 0;
  pulsesUsed = 0;
  /** Seconds of screen shake left. */
  shake = 0;
  /** Increments on every restart so the UI can reset per-attempt visuals. */
  attempt = 0;
  failCause: 'spike' | null = null;
  /** Receives gameplay events for audio/haptics/analytics. Must not retain anything. */
  onEvent: ((e: SimEvent) => void) | null = null;

  readonly energy: SonarEnergy;
  readonly momentum: Momentum;
  readonly waves = new WaveField();
  readonly reveal: RevealState;
  readonly hints: HintTracker;

  private inX = 0;
  private inY = 0;
  private deathTimer = 0;
  private sincePulse = Infinity;
  private sinceHit = Infinity;

  constructor(
    readonly world: World,
    private params: SimParams,
  ) {
    const def = world.def;
    this.body = { x: def.start.x, y: def.start.y, vx: 0, vy: 0, r: ECHO_CONFIG.player.radius };
    this.energy = new SonarEnergy(def.sonar);
    this.momentum = new Momentum({
      ...ECHO_CONFIG.momentum,
      max: params.momentumMax ?? ECHO_CONFIG.momentum.max,
      rateMult: params.momentumRateMult,
    });
    this.reveal = new RevealState(world.revealables.length);
    this.hints = new HintTracker(def.hints ?? []);
  }

  /** Joystick output, already dead-zoned, magnitude 0..1. */
  setInput(x: number, y: number): void {
    this.inX = x;
    this.inY = y;
  }

  setPulseRadius(r: number): void {
    this.params.pulseRadius = r;
  }

  /** Fresh attempt. Allowed in every state (during a pulse, during death, ...). */
  restart(): void {
    const def = this.world.def;
    this.body.x = def.start.x;
    this.body.y = def.start.y;
    this.body.vx = 0;
    this.body.vy = 0;
    this.rotation = -HALF_PI;
    this.status = 'playing';
    this.elapsed = 0;
    this.pulsesUsed = 0;
    this.shake = 0;
    this.deathTimer = 0;
    this.sincePulse = Infinity;
    this.sinceHit = Infinity;
    this.failCause = null;
    this.energy.reset();
    this.momentum.reset();
    this.waves.clear();
    this.reveal.clear();
    this.hints.reset();
    this.attempt++;
    this.onEvent?.('restart');
  }

  /** Emits a pulse if a charge is available. Returns true when a wave was started. */
  firePulse(): boolean {
    if (this.status !== 'playing') return false;
    if (this.sincePulse < ECHO_CONFIG.sonar.minTapGapMs / 1000) return false;
    if (!this.energy.tryUse()) {
      this.onEvent?.('no_charge');
      return false;
    }
    this.sincePulse = 0;
    this.pulsesUsed++;
    this.waves.spawn(this.body.x, this.body.y, this.params.pulseRadius);
    this.hints.onPulse();
    this.onEvent?.('pulse');
    return true;
  }

  step(rawDt: number): void {
    const dt = Math.min(rawDt, ECHO_CONFIG.world.maxDt);
    if (!(dt > 0)) return;

    // waves and glow keep animating in every state so a death or win does not freeze the picture
    this.waves.update(dt);
    applyWaves(this.waves, this.world.revealables, this.reveal, this.params.glowBonusSec ?? 0);
    this.reveal.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);

    if (this.status === 'dying') {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.restart();
      return;
    }
    if (this.status === 'won') return;

    this.elapsed += dt;
    this.sincePulse += dt;
    this.sinceHit += dt;
    this.energy.update(dt);
    this.hints.update(dt);

    this.move(dt);

    const cfg = ECHO_CONFIG;
    const b = this.body;
    const speed = Math.hypot(b.vx, b.vy);
    this.momentum.update(dt, speed > cfg.momentum.movingSpeed);
    if (speed > cfg.momentum.movingSpeed) this.hints.onMoved();

    // spikes kill (hitbox slightly smaller than drawn, see config)
    const spikes = this.world.spikes;
    for (let i = 0; i < spikes.length; i++) {
      if (circleOverlapsBox(b.x, b.y, b.r, spikes[i], cfg.hazards.spikeForgiveness)) {
        this.die('spike');
        return;
      }
    }

    // finish ring
    const f = this.world.finish;
    if (Math.hypot(b.x - f.x, b.y - f.y) < f.radius) {
      this.status = 'won';
      b.vx = 0;
      b.vy = 0;
      this.onEvent?.('finish');
    }
  }

  private move(dt: number) {
    const cfg = ECHO_CONFIG.player;
    const b = this.body;
    const mag = Math.hypot(this.inX, this.inY);

    // Velocity eases towards the stick target. Because the direction of velocity changes gradually,
    // the bat sweeps through turns on an arc (its turning radius grows with speed).
    const k = mag > 0 ? cfg.acceleration : cfg.deceleration;
    const a = 1 - Math.exp(-k * dt);
    b.vx += (this.inX * cfg.speed - b.vx) * a;
    b.vy += (this.inY * cfg.speed - b.vy) * a;

    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 15) {
      let diff = Math.atan2(b.vy, b.vx) - this.rotation;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.rotation += diff * (1 - Math.exp(-cfg.turnSpeed * dt));
    }

    // sub-steps keep fast bats from tunnelling through thin walls
    const dist = speed * dt;
    const n = Math.max(1, Math.ceil(dist / (b.r * 0.5)));
    const sdt = dt / n;
    let impact = 0;
    for (let s = 0; s < n; s++) {
      b.x += b.vx * sdt;
      b.y += b.vy * sdt;
      const hit = resolveCircleBoxes(b, this.world.solids);
      if (hit > impact) impact = hit;
    }

    // never leave the level, even if a level file forgot its outer walls
    const def = this.world.def;
    if (b.x < b.r) {
      b.x = b.r;
      if (b.vx < 0) b.vx = 0;
    } else if (b.x > def.width - b.r) {
      b.x = def.width - b.r;
      if (b.vx > 0) b.vx = 0;
    }
    if (b.y < b.r) {
      b.y = b.r;
      if (b.vy < 0) b.vy = 0;
    } else if (b.y > def.height - b.r) {
      b.y = def.height - b.r;
      if (b.vy > 0) b.vy = 0;
    }

    const mom = ECHO_CONFIG.momentum;
    if (impact > mom.hitSpeedThreshold) {
      this.momentum.onWallHit();
      if (this.sinceHit >= mom.hitCooldownSec) {
        this.sinceHit = 0;
        this.onEvent?.('wall_hit');
      }
    }
  }

  private die(cause: 'spike') {
    this.status = 'dying';
    this.failCause = cause;
    this.shake = ECHO_CONFIG.death.shakeSec;
    this.deathTimer = ECHO_CONFIG.death.restartDelaySec;
    this.body.vx = 0;
    this.body.vy = 0;
    this.onEvent?.('death');
  }
}
