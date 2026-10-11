import { create } from 'zustand';

interface SettingsState {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  floatingJoystick: boolean;
  devModeUnlocked: boolean;

  setSoundEnabled: (val: boolean) => void;
  setHapticsEnabled: (val: boolean) => void;
  setFloatingJoystick: (val: boolean) => void;
  unlockDevMode: () => void;
}

const STORAGE_KEY = 'bats_view_v2_settings';

const loadSavedSettings = (): Partial<SettingsState> => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const data = window.localStorage.getItem(STORAGE_KEY);
      if (data) return JSON.parse(data);
    }
  } catch {}
  return {};
};

const saveSettings = (state: SettingsState) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {}
};

const initial = loadSavedSettings();

export const useSettingsStore = create<SettingsState>((set) => ({
  soundEnabled: initial.soundEnabled ?? true,
  hapticsEnabled: initial.hapticsEnabled ?? true,
  floatingJoystick: initial.floatingJoystick ?? true,
  devModeUnlocked: initial.devModeUnlocked ?? false,

  setSoundEnabled: (val) => {
    set((state) => {
      const next = { ...state, soundEnabled: val };
      saveSettings(next);
      return next;
    });
  },

  setHapticsEnabled: (val) => {
    set((state) => {
      const next = { ...state, hapticsEnabled: val };
      saveSettings(next);
      return next;
    });
  },

  setFloatingJoystick: (val) => {
    set((state) => {
      const next = { ...state, floatingJoystick: val };
      saveSettings(next);
      return next;
    });
  },

  unlockDevMode: () => {
    set((state) => {
      const next = { ...state, devModeUnlocked: true };
      saveSettings(next);
      return next;
    });
  },
}));
