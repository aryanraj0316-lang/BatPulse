import type { ComponentType } from 'react';
import { SOUND_KEYS, SoundKey, VISUAL_KEYS, VisualKey, WallKey } from './keys';
import type { ToneSpec } from './sound/synth';

export type VisualState = 'idle' | 'flap' | 'hit' | 'preview';

/**
 * Props every visual understands. Position is the CENTRE of the object in world pixels so the
 * same component can be dropped into any parent <Svg>. `glow` 0..1 is how lit-up it is.
 */
export interface VisualProps {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number; // degrees
  frame?: 0 | 1; // wing flap frame (bats)
  state?: VisualState;
  glow?: number;
  active?: boolean; // switch pressed / door open
  progress?: number; // 0..1: door countdown, death burst, pulse expansion
  time?: number; // seconds, drives idle animation (rotating rings, blades, previews)
}
export type VisualComponent = ComponentType<VisualProps>;

/** Colours used when batching walls into a few SVG paths (fresh / fading / echo reveal tiers). */
export interface WallStyle {
  fresh: { stroke: string; width: number; fill: string; opacity: number };
  fading: { stroke: string; width: number; fill: string; opacity: number };
  echo: { stroke: string; width: number; fill: string; opacity: number };
}

/** A sound is either a synthesized placeholder or a real file supplied later. */
export type SoundSource = { kind: 'synth'; spec: ToneSpec } | { kind: 'file'; source: number | { uri: string } };

const visuals = new Map<VisualKey, VisualComponent>();
const wallStyles = new Map<WallKey, WallStyle>();
const sounds = new Map<SoundKey, SoundSource>();

/**
 * Single access point for all art and audio. Final assets replace placeholders by calling the
 * register* functions again with the same key; no gameplay code needs to change.
 */
export const AssetRegistry = {
  registerVisual(key: VisualKey, component: VisualComponent) {
    visuals.set(key, component);
  },
  getVisual(key: VisualKey): VisualComponent {
    const v = visuals.get(key);
    if (!v) throw new Error(`AssetRegistry: no visual registered for "${key}"`);
    return v;
  },

  registerWallStyle(key: WallKey, style: WallStyle) {
    wallStyles.set(key, style);
  },
  getWallStyle(key: WallKey): WallStyle {
    const s = wallStyles.get(key);
    if (!s) throw new Error(`AssetRegistry: no wall style registered for "${key}"`);
    return s;
  },

  registerSound(key: SoundKey, source: SoundSource) {
    sounds.set(key, source);
  },
  getSound(key: SoundKey): SoundSource {
    const s = sounds.get(key);
    if (!s) throw new Error(`AssetRegistry: no sound registered for "${key}"`);
    return s;
  },

  /** Keys that still have no implementation. Must be empty after setup (checked by tests). */
  missing(): string[] {
    return [
      ...VISUAL_KEYS.filter((k) => !visuals.has(k)),
      ...SOUND_KEYS.filter((k) => !sounds.has(k)),
    ];
  },
  clear() {
    visuals.clear();
    wallStyles.clear();
    sounds.clear();
  },
};
