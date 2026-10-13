import { ECHO_CONFIG } from '../constants/gameConfig';

export type GraphicsSetting = 'auto' | 'low' | 'high';
export type Quality = 'low' | 'high';

export const GRAPHICS_SETTINGS: readonly GraphicsSetting[] = ['auto', 'low', 'high'];

/** What each quality level changes in the renderer. Gameplay is identical in both. */
export interface Lod {
  /** Glow is rounded to this many steps: fewer steps = fewer re-renders while things fade. */
  glowSteps: number;
  /** Items dimmer than this are not drawn at all. */
  minGlow: number;
  /** Faint rings where recent pulses were made. */
  showSoundMarkers: boolean;
}

const LODS: Record<Quality, Lod> = {
  high: { glowSteps: 16, minGlow: 0.02, showSoundMarkers: true },
  low: { glowSteps: 6, minGlow: 0.08, showSoundMarkers: false },
};
export const lodFor = (q: Quality): Lod => LODS[q];

/** The quality to render with, given the player's setting and what the governor has decided. */
export const effectiveQuality = (setting: GraphicsSetting, governed: Quality): Quality => (setting === 'auto' ? governed : setting);

/** True when a box (world units, y range) is inside the visible world rows, with a margin. */
export function isRowVisible(top: number, height: number, viewTop: number, viewBottom: number, margin: number = ECHO_CONFIG.perf.cullMarginWorld): boolean {
  return top + height >= viewTop - margin && top <= viewBottom + margin;
}

/**
 * Watches frame times (ms) and decides when to drop to low quality. It only ever downgrades: flapping
 * between modes would itself cause hitches. Feed it every frame; it returns the new quality exactly once.
 */
export class QualityGovernor {
  private quality: Quality = 'high';
  private seen = 0;
  private sum = 0;
  private count = 0;

  constructor(private readonly cfg = ECHO_CONFIG.perf.autoQuality) {}

  get current(): Quality {
    return this.quality;
  }

  sample(frameMs: number): Quality | null {
    if (this.quality === 'low' || !Number.isFinite(frameMs) || frameMs <= 0) return null;
    this.seen++;
    if (this.seen <= this.cfg.warmupFrames) return null;
    if (frameMs >= this.cfg.ignoreFrameMs) return null;
    this.sum += frameMs;
    this.count++;
    if (this.count < this.cfg.windowFrames) return null;
    const mean = this.sum / this.count;
    this.sum = 0;
    this.count = 0;
    if (mean > this.cfg.downgradeFrameMs) {
      this.quality = 'low';
      return 'low';
    }
    return null;
  }

  /** New level: forget the warm-up window but keep an earlier downgrade. */
  restartWindow(): void {
    this.seen = 0;
    this.sum = 0;
    this.count = 0;
  }
}

/** One governor for the whole session, so a downgrade carries over from level to level. */
export const sessionGovernor = new QualityGovernor();
