export interface MomentumRules {
  start: number; // x1.0
  step: number; // +0.1
  intervalSec: number; // every 2 s of continuous movement
  max: number; // x2.0
  idleResetSec: number; // standing still this long resets
  /** Character modifier: 2 = momentum grows twice as fast. */
  rateMult?: number;
}

/**
 * Momentum multiplier.
 *  - starts at `start`
 *  - +`step` for every `intervalSec` of movement (time only accumulates while moving)
 *  - capped at `max`
 *  - resets on a wall hit, or after `idleResetSec` without movement
 * Internally an integer step count is kept, so the value never drifts (1.1, 1.2 ... not 1.2000000000000002).
 */
export class Momentum {
  private steps = 0;
  private moveTime = 0;
  private idleTime = 0;
  private maxSteps: number;
  private bestSteps = 0;

  constructor(private rules: MomentumRules) {
    this.maxSteps = Math.round((rules.max - rules.start) / rules.step);
  }

  get value(): number {
    return Math.round((this.rules.start + this.steps * this.rules.step) * 1000) / 1000;
  }

  /** Highest multiplier reached since the last full reset() (shown on the victory screen). */
  get best(): number {
    return Math.round((this.rules.start + this.bestSteps * this.rules.step) * 1000) / 1000;
  }

  /** 0..1 progress towards the next step (for HUD hints). */
  get progress(): number {
    return this.steps >= this.maxSteps ? 1 : Math.min(1, this.moveTime / this.rules.intervalSec);
  }

  update(dt: number, moving: boolean): void {
    if (moving) {
      this.idleTime = 0;
      this.moveTime += dt * (this.rules.rateMult ?? 1);
      while (this.moveTime >= this.rules.intervalSec) {
        this.moveTime -= this.rules.intervalSec;
        if (this.steps < this.maxSteps) this.steps++;
      }
      if (this.steps >= this.maxSteps) this.moveTime = 0;
      if (this.steps > this.bestSteps) this.bestSteps = this.steps;
    } else {
      this.idleTime += dt;
      if (this.idleTime >= this.rules.idleResetSec) this.dropToStart();
    }
  }

  onWallHit(): void {
    this.dropToStart();
  }

  /** New attempt: back to x1.0 and forget the best. */
  reset(): void {
    this.dropToStart();
    this.bestSteps = 0;
  }

  private dropToStart() {
    this.steps = 0;
    this.moveTime = 0;
    this.idleTime = 0;
  }
}
