import { ECHO_CONFIG } from '../constants/gameConfig';

/**
 * Decides whether the dark "jump" effect may play when the bat is caught.
 * It must never be repeated excessively: at most `jumpEffectMaxPerLevel` times per play session of a level,
 * and never twice within `jumpEffectCooldownSec`. Otherwise the fail screen simply appears without it.
 */
export class JumpGate {
  private last = -Infinity;
  private count = 0;

  constructor(
    private readonly cooldownSec: number = ECHO_CONFIG.enemy.jumpEffectCooldownSec,
    private readonly maxPerLevel: number = ECHO_CONFIG.enemy.jumpEffectMaxPerLevel,
  ) {}

  /** True when the effect may play now (and records that it did). `nowSec` is any monotonic clock. */
  tryPlay(nowSec: number): boolean {
    if (this.count >= this.maxPerLevel) return false;
    if (nowSec - this.last < this.cooldownSec) return false;
    this.last = nowSec;
    this.count++;
    return true;
  }
}

/** Seconds between heartbeats for a threat level 0..1 (1 = hunter right next to the bat). */
export function heartbeatInterval(threat: number): number {
  const t = Math.max(0, Math.min(1, threat));
  const c = ECHO_CONFIG.enemy;
  return c.heartbeatSlowSec + (c.heartbeatFastSec - c.heartbeatSlowSec) * t;
}

/** Opacity of the red screen edge: a flash on each beat, decaying, stronger the closer the hunter. */
export function edgeAlpha(threat: number, beatAgeSec: number): number {
  if (threat <= 0) return 0;
  const flash = Math.exp(-beatAgeSec * 6);
  // a clearly visible floor (it is the player's only warning of a hunter they cannot see) plus a flash per beat
  return Math.min(0.95, 0.3 + 0.3 * threat + 0.4 * threat * flash);
}
