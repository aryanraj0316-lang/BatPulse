import { create } from 'zustand';
import { saveManager } from '../save';
import { defaultSave, SettingsSave } from '../save/schema';

interface SettingsState extends SettingsSave {
  setSfxVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
  setBrightness: (v: number) => void;
  setHapticsEnabled: (val: boolean) => void;
  setFloatingJoystick: (val: boolean) => void;
  /** Replaces in-memory state with the loaded save. Call once after saveManager.load(). */
  hydrate: () => void;
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

const persist = (s: SettingsSave) => {
  saveManager.mutate((d) => {
    d.settings = {
      sfxVolume: s.sfxVolume,
      musicVolume: s.musicVolume,
      brightness: s.brightness,
      hapticsEnabled: s.hapticsEnabled,
      floatingJoystick: s.floatingJoystick,
    };
  });
};

export const useSettingsStore = create<SettingsState>((set, get) => {
  /** Applies a change, then persists exactly the settings slice. */
  const update = (patch: Partial<SettingsSave>) => {
    set(patch);
    persist(get());
  };
  return {
    ...defaultSave().settings,
    hydrate: () => set({ ...saveManager.data.settings }),
    setSfxVolume: (v) => update({ sfxVolume: clamp(v, 0, 1) }),
    setMusicVolume: (v) => update({ musicVolume: clamp(v, 0, 1) }),
    setBrightness: (v) => update({ brightness: clamp(v, 0.5, 1.5) }),
    setHapticsEnabled: (val) => update({ hapticsEnabled: val }),
    setFloatingJoystick: (val) => update({ floatingJoystick: val }),
  };
});
