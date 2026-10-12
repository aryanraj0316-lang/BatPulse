import { ECHO_CONFIG } from '../constants/gameConfig';
import { WallType } from '../levels/schema';
import { distanceToBox } from './collision';
import { Revealable } from './world';

/** Per-surface glow behaviour. `brightMult` > 1 means brighter than normal (renderer clamps). */
export function surfaceGlow(variant: WallType): { brightMult: number; secMult: number; fixedSec?: number } {
  const s = ECHO_CONFIG.surfaces[variant];
  return s;
}

const smoothstep = (u: number) => {
  const c = u < 0 ? 0 : u > 1 ? 1 : u;
  return c * c * (3 - 2 * c);
};

/** 1 inside the safe part of the radius, smoothly down to 0 at the very edge of the wave. */
export function edgeFalloff(distance: number, maxRadius: number, falloff: number = ECHO_CONFIG.sonar.edgeFalloff): number {
  if (maxRadius <= 0) return 0;
  const t = distance / maxRadius;
  const start = 1 - falloff;
  if (t <= start) return 1;
  if (t >= 1) return 0;
  return 1 - smoothstep((t - start) / falloff);
}

/** Brightness over the life of one reveal: hold at full, then ease out. progress 0..1. */
export function glowCurve(progress: number, hold: number = ECHO_CONFIG.sonar.glowHoldFraction): number {
  if (progress <= hold) return 1;
  return 1 - smoothstep((progress - hold) / (1 - hold));
}

/** Fixed-size pool of expanding pulse waves. No allocation after construction. */
export class WaveField {
  readonly ox: Float32Array;
  readonly oy: Float32Array;
  readonly radius: Float32Array;
  readonly prevRadius: Float32Array;
  readonly maxRadius: Float32Array;
  readonly age: Float32Array;
  readonly active: Uint8Array;
  readonly size: number;

  constructor(size: number = ECHO_CONFIG.sonar.maxWaves) {
    this.size = size;
    this.ox = new Float32Array(size);
    this.oy = new Float32Array(size);
    this.radius = new Float32Array(size);
    this.prevRadius = new Float32Array(size);
    this.maxRadius = new Float32Array(size);
    this.age = new Float32Array(size);
    this.active = new Uint8Array(size);
  }

  /** Starts a wave. If the pool is full the oldest wave is recycled. */
  spawn(x: number, y: number, maxRadius: number): number {
    let slot = -1;
    let oldest = -1;
    let oldestAge = -1;
    for (let i = 0; i < this.size; i++) {
      if (!this.active[i]) {
        slot = i;
        break;
      }
      if (this.age[i] > oldestAge) {
        oldestAge = this.age[i];
        oldest = i;
      }
    }
    if (slot < 0) slot = oldest;
    this.ox[slot] = x;
    this.oy[slot] = y;
    this.radius[slot] = -1; // -1 so things exactly at the origin (distance 0) are caught on the first step
    this.prevRadius[slot] = -1;
    this.maxRadius[slot] = maxRadius;
    this.age[slot] = 0;
    this.active[slot] = 1;
    return slot;
  }

  /** Normalised expansion 0..1 (eased: fast start, slow finish). */
  progress(i: number): number {
    const t = Math.min(1, this.age[i] / ECHO_CONFIG.sonar.expandSec);
    return 1 - Math.pow(1 - t, 4);
  }

  update(dt: number): void {
    for (let i = 0; i < this.size; i++) {
      if (!this.active[i]) continue;
      this.prevRadius[i] = this.radius[i];
      this.age[i] += dt;
      this.radius[i] = this.maxRadius[i] * this.progress(i);
      // linger briefly after full size so the fading ring can be drawn
      if (this.age[i] >= ECHO_CONFIG.sonar.expandSec + ECHO_CONFIG.sonar.waveLingerSec) this.active[i] = 0;
    }
  }

  clear(): void {
    this.active.fill(0);
  }

  get activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.size; i++) n += this.active[i];
    return n;
  }
}

/** Glow state for every revealable (parallel arrays indexed like World.revealables). */
export class RevealState {
  readonly glow: Float32Array; // brightness right now, 0..brightMult
  private readonly peak: Float32Array;
  private readonly left: Float32Array;
  private readonly total: Float32Array;
  readonly count: number;

  constructor(count: number) {
    this.count = count;
    this.glow = new Float32Array(count);
    this.peak = new Float32Array(count);
    this.left = new Float32Array(count);
    this.total = new Float32Array(count);
  }

  /** Light item i up. A new hit only replaces the current glow if it is at least as bright. */
  hit(i: number, brightness: number, seconds: number): void {
    const current = this.left[i] > 0 ? this.peak[i] * glowCurve(1 - this.left[i] / this.total[i]) : 0;
    if (brightness >= current) {
      this.peak[i] = brightness;
      this.left[i] = seconds;
      this.total[i] = seconds;
      this.glow[i] = brightness;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.left[i] <= 0) {
        this.glow[i] = 0;
        continue;
      }
      this.left[i] = Math.max(0, this.left[i] - dt);
      this.glow[i] = this.left[i] > 0 ? this.peak[i] * glowCurve(1 - this.left[i] / this.total[i]) : 0;
    }
  }

  clear(): void {
    this.glow.fill(0);
    this.peak.fill(0);
    this.left.fill(0);
    this.total.fill(0);
  }
}

/**
 * Lights every revealable whose distance from a wave origin was crossed by the wave front this step.
 * `extraSec` lengthens the glow of walls and spikes (Vesper's ability).
 */
export function applyWaves(
  waves: WaveField,
  items: readonly Revealable[],
  reveal: RevealState,
  extraSec: number = 0,
): void {
  const baseSec = ECHO_CONFIG.sonar.revealGlowSec;
  for (let w = 0; w < waves.size; w++) {
    if (!waves.active[w]) continue;
    const prev = waves.prevRadius[w];
    const cur = waves.radius[w];
    if (cur <= prev) continue;
    const max = waves.maxRadius[w];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const d = distanceToBox(waves.ox[w], waves.oy[w], it);
      if (d <= prev || d > cur || d > max) continue;
      const falloff = edgeFalloff(d, max);
      if (falloff < 0.02) continue;
      const surf = surfaceGlow(it.variant);
      const bonus = it.kind === 'finish' ? 0 : extraSec;
      // hunters are only seen for a moment after a wave touches them
      const seconds = it.kind === 'enemy' ? ECHO_CONFIG.enemy.visibleOnHitSec : surf.fixedSec !== undefined ? surf.fixedSec : (baseSec + bonus) * surf.secMult;
      reveal.hit(i, falloff * surf.brightMult, seconds);
    }
  }
}
