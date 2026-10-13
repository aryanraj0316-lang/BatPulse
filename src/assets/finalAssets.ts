import { AssetRegistry } from './AssetRegistry';
import { SOUND_KEYS, SoundKey, VISUAL_KEYS, VisualKey } from './keys';
import { imageVisual, ImageVisualSpec } from './imageVisual';

/**
 * FINAL ART AND SOUND GO HERE. This is the only file artists/audio designers touch.
 *
 *   FINAL_VISUALS.bat_rookie = { frames: [require('../../assets/art/bat_rookie_0.png'), require('../../assets/art/bat_rookie_1.png')] };
 *   FINAL_SOUNDS.sfx_ping = require('../../assets/audio/ping.ogg');
 *
 * Anything not listed keeps its placeholder, so art can be delivered one piece at a time.
 * Specs for every key: docs/ART_INTEGRATION.md.
 */
export const FINAL_VISUALS: Partial<Record<VisualKey, ImageVisualSpec>> = {};
export const FINAL_SOUNDS: Partial<Record<SoundKey, number | { uri: string }>> = {};

export interface FinalAssetReport {
  visuals: VisualKey[];
  sounds: SoundKey[];
  /** Keys that are not part of the game: ignored (a typo must never break startup). */
  unknown: string[];
}

/** Replaces placeholders with the final assets that exist. Call after registerPlaceholderAssets(). */
export function registerFinalAssets(visuals: Partial<Record<string, ImageVisualSpec>> = FINAL_VISUALS, sounds: Partial<Record<string, number | { uri: string }>> = FINAL_SOUNDS): FinalAssetReport {
  const report: FinalAssetReport = { visuals: [], sounds: [], unknown: [] };
  for (const [key, spec] of Object.entries(visuals)) {
    if (!spec) continue;
    if (!(VISUAL_KEYS as readonly string[]).includes(key)) {
      report.unknown.push(key);
      continue;
    }
    AssetRegistry.registerVisual(key as VisualKey, imageVisual(spec, `Final(${key})`));
    report.visuals.push(key as VisualKey);
  }
  for (const [key, source] of Object.entries(sounds)) {
    if (source === undefined) continue;
    if (!(SOUND_KEYS as readonly string[]).includes(key)) {
      report.unknown.push(key);
      continue;
    }
    AssetRegistry.registerSound(key as SoundKey, { kind: 'file', source });
    report.sounds.push(key as SoundKey);
  }
  if (report.unknown.length) console.warn(`registerFinalAssets: ignored unknown keys: ${report.unknown.join(', ')}`);
  return report;
}
