import { ECHO_CONFIG } from '../constants/gameConfig';

export interface ReverbTap {
  /** Seconds after the dry sound. */
  delaySec: number;
  /** 0..1, relative to the dry sound's volume. */
  gain: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** How big the cave sounds: 1 for the reference area, larger for bigger levels (clamped). */
export function roomScale(levelWidth: number, levelHeight: number, cfg = ECHO_CONFIG.audio.reverb): number {
  const area = levelWidth * levelHeight;
  if (!Number.isFinite(area) || area <= 0) return 1;
  return clamp(Math.sqrt(area / cfg.referenceArea), cfg.minScale, cfg.maxScale);
}

/** The echo repeats for a pulse in a cave of the given scale: later and more spread out in bigger caves. */
export function reverbTaps(scale: number, cfg = ECHO_CONFIG.audio.reverb): ReverbTap[] {
  const s = clamp(Number.isFinite(scale) ? scale : 1, cfg.minScale, cfg.maxScale);
  const taps: ReverbTap[] = [];
  for (let i = 0; i < cfg.taps; i++) {
    taps.push({
      delaySec: (cfg.firstDelaySec + i * cfg.spacingSec) * s,
      gain: cfg.gain * Math.pow(cfg.decay, i),
    });
  }
  return taps;
}
