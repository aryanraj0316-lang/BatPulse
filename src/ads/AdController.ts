import { ECHO_CONFIG } from '../constants/gameConfig';

export type AdOutcome = 'rewarded' | 'dismissed' | 'failed';

/** An ad network behind a thin wrapper. The real SDK is integrated later by implementing this. */
export interface AdProvider {
  /** An ad is loaded and can be shown right now. */
  isReady(): boolean;
  /** Shows it. 'rewarded' only when the player watched it to the end. Must not throw (a throw is treated as 'failed'). */
  show(): Promise<AdOutcome>;
}

/** Used while no ad SDK is integrated: never ready, so no ad UI ever appears. */
export const noAdProvider: AdProvider = { isReady: () => false, show: async () => 'failed' };

export interface AdUsage {
  /** Day number (ms / 86 400 000) of `count`. */
  day: number | null;
  count: number;
}

export type AdOffer = { available: true; reward: number } | { available: false; reason: 'disabled' | 'not_ready' | 'daily_limit' | 'already_used' };

export interface AdDeps {
  provider: AdProvider;
  getUsage(): AdUsage;
  setUsage(u: AdUsage): void;
  /** Adds the shards to the player's balance. */
  grant(amount: number, source: string): void;
  now?(): number;
  /** Overrides the config (tests). */
  config?: { enabled: boolean; rewardShards: number; maxPerDay: number };
}

const dayOf = (ms: number) => Math.floor(ms / 86_400_000);

/**
 * Optional rewarded ads. Rules:
 *  - everything is off unless `ECHO_CONFIG.online.ads.enabled` is true AND a provider reports an ad ready
 *  - one offer per result screen, and a soft daily cap
 *  - the reward is paid only when the provider says the ad was completed, and never more than once per ad
 *  - an ad can never be needed to progress: it is only ever an extra button
 */
export class AdController {
  private busy = false;

  constructor(private readonly deps: AdDeps) {}

  private get cfg() {
    return this.deps.config ?? ECHO_CONFIG.online.ads;
  }

  private today(): number {
    return dayOf((this.deps.now ?? Date.now)());
  }

  private usedToday(): number {
    const u = this.deps.getUsage();
    return u.day === this.today() ? u.count : 0;
  }

  /** Can the result screen show the button right now? `alreadyUsed`: this result's ad was already watched. */
  offer(alreadyUsed = false): AdOffer {
    const c = this.cfg;
    if (!c.enabled) return { available: false, reason: 'disabled' };
    if (alreadyUsed) return { available: false, reason: 'already_used' };
    if (this.usedToday() >= c.maxPerDay) return { available: false, reason: 'daily_limit' };
    if (!this.deps.provider.isReady()) return { available: false, reason: 'not_ready' };
    return { available: true, reward: c.rewardShards };
  }

  /** Shows an ad and pays out if it was completed. Returns what happened. */
  async watch(alreadyUsed = false): Promise<AdOutcome | 'unavailable'> {
    if (this.busy || !this.offer(alreadyUsed).available) return 'unavailable';
    this.busy = true;
    try {
      let outcome: AdOutcome;
      try {
        outcome = await this.deps.provider.show();
      } catch {
        outcome = 'failed';
      }
      if (outcome === 'rewarded') {
        const today = this.today();
        this.deps.setUsage({ day: today, count: this.usedToday() + 1 });
        this.deps.grant(this.cfg.rewardShards, 'rewarded_ad');
      }
      return outcome;
    } finally {
      this.busy = false;
    }
  }
}
