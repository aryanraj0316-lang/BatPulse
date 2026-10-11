import { create } from 'zustand';

/** Debug tooling exists only in development builds; in release every flag is forced off. */
export const DEBUG_ENABLED: boolean = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

export const SLOW_MO_FACTOR = 0.3;

export interface DebugFlags {
  unlimitedShards: boolean;
  showHitboxes: boolean;
  showHearing: boolean;
  showFps: boolean;
  slowMotion: boolean;
}

interface DebugState extends DebugFlags {
  set: <K extends keyof DebugFlags>(key: K, value: boolean) => void;
}

const OFF: DebugFlags = {
  unlimitedShards: false,
  showHitboxes: false,
  showHearing: false,
  showFps: false,
  slowMotion: false,
};

export const useDebugFlags = create<DebugState>((set) => ({
  ...OFF,
  set: (key, value) => {
    if (!DEBUG_ENABLED) return;
    set({ [key]: value } as Partial<DebugFlags>);
  },
}));

/** Multiplier applied to the simulation delta time. */
export const debugTimeScale = (flags: Pick<DebugFlags, 'slowMotion'>, enabled: boolean = DEBUG_ENABLED): number =>
  enabled && flags.slowMotion ? SLOW_MO_FACTOR : 1;

/** Non-hook accessor for engine code. */
export const getDebugFlags = (): DebugFlags => {
  const s = useDebugFlags.getState();
  return DEBUG_ENABLED
    ? { unlimitedShards: s.unlimitedShards, showHitboxes: s.showHitboxes, showHearing: s.showHearing, showFps: s.showFps, slowMotion: s.slowMotion }
    : OFF;
};
