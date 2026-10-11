import { create } from 'zustand';
import { saveManager } from '../save';
import { defaultSave } from '../save/schema';

interface SettingsState {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  floatingJoystick: boolean;
  devModeUnlocked: boolean;

  setSoundEnabled: (val: boolean) => void;
  setHapticsEnabled: (val: boolean) => void;
  setFloatingJoystick: (val: boolean) => void;
  unlockDevMode: () => void;
  /** Replaces in-memory state with the loaded save. Call once after saveManager.load(). */
  hydrate: () => void;
}

const saveSettings = (state: SettingsState) => {
  saveManager.mutate((d) => {
    d.settings = {
      soundEnabled: state.soundEnabled,
      hapticsEnabled: state.hapticsEnabled,
      floatingJoystick: state.floatingJoystick,
      devModeUnlocked: state.devModeUnlocked,
    };
  });
};

const initial = defaultSave().settings;

export const useSettingsStore = create<SettingsState>((set) => ({
  soundEnabled: initial.soundEnabled ?? true,
  hapticsEnabled: initial.hapticsEnabled ?? true,
  floatingJoystick: initial.floatingJoystick ?? true,
  devModeUnlocked: initial.devModeUnlocked ?? false,

  hydrate: () => set({ ...saveManager.data.settings }),

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
