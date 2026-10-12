import { HintDef } from '../levels/schema';

/**
 * Walks through a level's onboarding hints in order. A hint stays up until the player does what
 * it asks (move / pulse) or its timer runs out, then the next hint is shown.
 */
export class HintTracker {
  private index = 0;
  private shownFor = 0;

  constructor(private readonly hints: readonly HintDef[]) {}

  /** The text to display now, or null when every hint has been completed. */
  get current(): string | null {
    return this.index < this.hints.length ? this.hints[this.index].text : null;
  }

  onMoved(): void {
    this.advanceIf('move');
  }

  onPulse(): void {
    this.advanceIf('pulse');
  }

  update(dt: number): void {
    const h = this.hints[this.index];
    if (!h || h.until !== 'seconds') return;
    this.shownFor += dt;
    if (this.shownFor >= (h.seconds ?? 0)) this.next();
  }

  reset(): void {
    this.index = 0;
    this.shownFor = 0;
  }

  private advanceIf(kind: 'move' | 'pulse') {
    const h = this.hints[this.index];
    if (h && h.until === kind) this.next();
  }

  private next() {
    this.index++;
    this.shownFor = 0;
  }
}
