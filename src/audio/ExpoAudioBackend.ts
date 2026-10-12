import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { AssetRegistry } from '../assets/AssetRegistry';
import { SoundKey } from '../assets/keys';
import { synthDataUri, synthesize, toWav } from '../assets/sound/synth';
import { AudioBackend, PlayerHandle } from './AudioService';

/** Bump when the placeholder synthesis changes so stale cached WAVs are rewritten. */
const CACHE_VERSION = 1;

/**
 * Resolves a registry sound to something expo-audio can play.
 * - real files: passed through untouched
 * - synthesized placeholder, web: a data: URI
 * - synthesized placeholder, native: a WAV written once into the cache directory
 *   (iOS' AVPlayer does not reliably play data: URIs, so a real file is used there).
 */
function resolveSource(key: SoundKey): string | number {
  const src = AssetRegistry.getSound(key);
  if (src.kind === 'file') return typeof src.source === 'number' ? src.source : src.source.uri;
  if (Platform.OS === 'web') return synthDataUri(key, src.spec);

  const file = new File(Paths.cache, `echo_${key}_v${CACHE_VERSION}.wav`);
  if (!file.exists) {
    file.create({ overwrite: true });
    file.write(toWav(synthesize(src.spec)));
  }
  return file.uri;
}

/**
 * Browsers refuse to start audio before the first user gesture, and expo-audio's web player rejects
 * internally (where nothing can catch it). So on web nothing is played until the browser reports a gesture;
 * AudioService.nudge() retries music on the next touch. Native platforms always play.
 */
function canPlayNow(): boolean {
  if (Platform.OS !== 'web') return true;
  const activation = (globalThis as { navigator?: { userActivation?: { hasBeenActive: boolean } } }).navigator?.userActivation;
  return activation ? activation.hasBeenActive : true;
}

/** On web `play()` returns a promise that rejects when autoplay is blocked; that must never surface as an error. */
const quiet = (result: unknown) => {
  const p = result as Promise<unknown> | undefined;
  if (p && typeof p.catch === 'function') p.catch(() => {});
};

class ExpoPlayerHandle implements PlayerHandle {
  constructor(private readonly player: ReturnType<typeof createAudioPlayer>) {}
  setVolume(v: number) {
    this.player.volume = v;
  }
  setLoop(loop: boolean) {
    this.player.loop = loop;
  }
  restart() {
    if (!canPlayNow()) return;
    // seekTo is async but the position change is applied before the play call is handled
    quiet(this.player.seekTo(0));
    quiet(this.player.play());
  }
  pause() {
    quiet(this.player.pause());
  }
  resume() {
    if (!canPlayNow()) return;
    quiet(this.player.play());
  }
  stop() {
    quiet(this.player.pause());
    quiet(this.player.seekTo(0));
  }
  release() {
    this.player.remove();
  }
}

export class ExpoAudioBackend implements AudioBackend {
  private modeSet = false;

  async load(key: SoundKey, copies: number): Promise<PlayerHandle[]> {
    if (!this.modeSet) {
      this.modeSet = true;
      // Sound effects must play even in silent mode and never interrupt the user's own music app.
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
    }
    const uri = resolveSource(key);
    return Array.from({ length: copies }, () => new ExpoPlayerHandle(createAudioPlayer(uri)));
  }
}
