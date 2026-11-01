import { THEME } from '../skia/theme';
import { ART } from '../art/kit';
import { clearShaderCache } from '../skia/sk';
import { clearHazardPics } from '../skia/layers/HazardLayer';
import type { Biome, BiomeId } from './biomes';

// Snapshot of the default (crypt) look so every biome patches from the same base.
const THEME_BASE = JSON.parse(JSON.stringify(THEME));
const ART_BASE = { ...ART };
let current: BiomeId | null = null;

/** Repaints the shared art palette for a biome. Cheap; call before building a level's renderer. */
export function applyBiome(b: Biome) {
  if (current === b.id) return;
  current = b.id;
  Object.assign(THEME, JSON.parse(JSON.stringify(THEME_BASE)), JSON.parse(JSON.stringify(b.theme)));
  Object.assign(ART, ART_BASE, b.art);
  clearShaderCache(); // gradients are cached by name; their colours just changed
  clearHazardPics(); // water pits are recorded with the old colours
}
