import { SOUND_KEYS } from '../assets/keys';
import { AudioService } from './AudioService';
import { ExpoAudioBackend } from './ExpoAudioBackend';
import { useSettingsStore } from '../state/settingsStore';

/** App-wide audio. Volumes are read live from settings on every play. */
export const audio = new AudioService(new ExpoAudioBackend(), () => {
  const s = useSettingsStore.getState();
  return { sfx: s.sfxVolume, music: s.musicVolume, reverb: s.reverb };
});

/** Call once at startup, after assets are registered. */
export function initAudio(): Promise<void> {
  return audio.preload(SOUND_KEYS, 'music_ambient');
}
