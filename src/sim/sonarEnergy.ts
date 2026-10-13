export interface SonarEnergyRules {
  mode: 'recharge' | 'fixed';
  charges: number;
  rechargeSec: number;
}

/**
 * Pulse charges.
 *  - recharge: one charge returns every `rechargeSec` while below max (the timer only runs while a charge is missing)
 *  - fixed: charges never come back, except via pickups (`add`)
 */
export class SonarEnergy {
  private count: number;
  private timer = 0; // seconds into the current recharge

  constructor(private rules: SonarEnergyRules) {
    this.count = rules.charges;
  }

  get charges(): number {
    return this.count;
  }
  get max(): number {
    return this.rules.charges;
  }
  get mode() {
    return this.rules.mode;
  }
  /** 0..1 fill of the charge that is currently recharging (0 when full or in fixed mode). */
  get rechargeFill(): number {
    if (this.rules.mode !== 'recharge' || this.count >= this.rules.charges) return 0;
    return Math.min(1, this.timer / this.rules.rechargeSec);
  }

  /** Spends one charge. Returns false (and changes nothing) when empty. */
  tryUse(): boolean {
    if (this.count <= 0) return false;
    this.count--;
    return true;
  }

  /** Pickup: +n charges, never above max. Returns how many were actually added. */
  add(n: number = 1): number {
    const before = this.count;
    this.count = Math.min(this.rules.charges, this.count + n);
    if (this.count >= this.rules.charges) this.timer = 0;
    return this.count - before;
  }

  update(dt: number): void {
    if (this.rules.mode !== 'recharge' || this.count >= this.rules.charges) return;
    this.timer += dt;
    while (this.timer >= this.rules.rechargeSec && this.count < this.rules.charges) {
      this.timer -= this.rules.rechargeSec;
      this.count++;
    }
    if (this.count >= this.rules.charges) this.timer = 0;
  }

  /** Puts the charge count back to a saved value (checkpoint respawn). */
  restore(count: number): void {
    this.count = Math.max(0, Math.min(this.rules.charges, count));
    this.timer = 0;
  }

  reset(): void {
    this.count = this.rules.charges;
    this.timer = 0;
  }
}
