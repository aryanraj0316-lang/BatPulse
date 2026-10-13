import { SoundKey } from '../assets/keys';
import { reverbTaps } from './reverb';
import { ECHO_CONFIG } from '../constants/gameConfig';

/** One playable instance of a sound. Implemented by the platform backend. */
export interface PlayerHandle {
  setVolume(volume: number): void;
  setLoop(loop: boolean): void;
  /** Restart from the beginning and play. */
  restart(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  release(): void;
}

export interface AudioBackend {
  /** Prepares one sound key and returns `copies` independent players for it. */
  load(key: SoundKey, copies: number): Promise<PlayerHandle[]>;
}

export interface Volumes {
  sfx: number;
  music: number;
  /** Cave echo on pulses (default on). */
  reverb?: boolean;
}

/** Injectable timer so tests can control time. */
export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
const realScheduler: Scheduler = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/** Minimum gap between two plays of the same key, so rapid taps never stack into noise. */
const MIN_GAP_MS: Partial<Record<SoundKey, number>> = {
  sfx_ping: 70,
  sfx_hit: 60,
  sfx_switch: 60,
  sfx_enemy_alert: 300,
  sfx_heartbeat: 150,
};
const DEFAULT_GAP_MS = 30;
const SFX_COPIES = 3;

interface Entry {
  players: PlayerHandle[];
  next: number;
  lastPlayedAt: number;
}

/**
 * Plays registry sounds through a platform backend.
 * - SFX use a small round-robin pool, so overlapping pings are possible.
 * - Volumes come from settings through `getVolumes()` and are applied at play time.
 * - Every call is failure-safe: audio problems must never break gameplay.
 */
export class AudioService {
  private entries = new Map<SoundKey, Entry>();
  private musicKey: SoundKey | null = null;
  private musicPlaying = false;
  private paused = false;

  constructor(
    private readonly backend: AudioBackend,
    private readonly getVolumes: () => Volumes,
    private readonly now: () => number = Date.now,
    private readonly scheduler: Scheduler = realScheduler,
  ) {}

  private echoTimers = new Set<unknown>();

  /** Loads the given sounds. Keys that fail to load are skipped (and stay silent). */
  async preload(keys: readonly SoundKey[], musicKey: SoundKey | null = null): Promise<void> {
    this.musicKey = musicKey;
    await Promise.all(
      keys.map(async (key) => {
        try {
          // the ping plays together with its echoes: give it a player for each, plus spare, so no echo cuts the dry sound
          const copies = key === musicKey ? 1 : key === 'sfx_ping' ? Math.max(SFX_COPIES, ECHO_CONFIG.audio.reverb.taps + 2) : SFX_COPIES;
          const players = await this.backend.load(key, copies);
          if (key === musicKey) players.forEach((p) => p.setLoop(true));
          this.entries.set(key, { players, next: 0, lastPlayedAt: -Infinity });
        } catch (e) {
          console.warn(`AudioService: could not load ${key}`, e);
        }
      }),
    );
  }

  isLoaded(key: SoundKey): boolean {
    return this.entries.has(key);
  }

  /** Plays a one-shot effect. `gain` (0..1) scales on top of the SFX volume. */
  play(key: SoundKey, gain: number = 1): boolean {
    const entry = this.entries.get(key);
    if (!entry || this.paused) return false;
    const volume = this.getVolumes().sfx * clamp01(gain);
    if (volume <= 0) return false;
    const t = this.now();
    if (t - entry.lastPlayedAt < (MIN_GAP_MS[key] ?? DEFAULT_GAP_MS)) return false;
    entry.lastPlayedAt = t;
    const player = entry.players[entry.next];
    entry.next = (entry.next + 1) % entry.players.length;
    try {
      player.setVolume(volume);
      player.restart();
      return true;
    } catch (e) {
      console.warn(`AudioService: play ${key} failed`, e);
      return false;
    }
  }

  /**
   * A pulse sound followed by the cave echo (decaying repeats). `roomScale` 1 = a normal cave.
   * The echo is skipped when reverb is off, and it never survives a pause/stop.
   */
  playWithEcho(key: SoundKey, roomScale: number = 1, gain: number = 1): boolean {
    const dry = this.play(key, gain);
    if (!dry || this.getVolumes().reverb === false) return dry;
    for (const tap of reverbTaps(roomScale)) {
      const handle = this.scheduler.set(() => {
        this.echoTimers.delete(handle);
        this.playEchoTap(key, gain * tap.gain);
      }, tap.delaySec * 1000);
      this.echoTimers.add(handle);
    }
    return dry;
  }

  /** One echo repeat: same pool as the dry sound but not subject to its minimum gap. */
  private playEchoTap(key: SoundKey, gain: number): void {
    const entry = this.entries.get(key);
    if (!entry || this.paused) return;
    const volume = this.getVolumes().sfx * clamp01(gain);
    if (volume <= 0) return;
    const player = entry.players[entry.next];
    entry.next = (entry.next + 1) % entry.players.length;
    safe(() => {
      player.setVolume(volume);
      player.restart();
    });
  }

  private cancelEchoes(): void {
    for (const h of this.echoTimers) this.scheduler.clear(h);
    this.echoTimers.clear();
  }

  startMusic(): void {
    this.musicPlaying = true;
    this.applyMusic();
  }

  stopMusic(): void {
    this.musicPlaying = false;
    const entry = this.musicKey ? this.entries.get(this.musicKey) : undefined;
    entry?.players.forEach((p) => safe(() => p.stop()));
  }

  /**
   * Retry music that a browser refused to start before the first user gesture.
   * Cheap and safe to call on every touch-down; does nothing when music is not wanted or already playing.
   */
  nudge(): void {
    if (this.musicPlaying && !this.paused) this.applyMusic();
  }

  /** Re-applies settings volumes (call when sliders change). */
  refreshVolumes(): void {
    this.applyMusic();
  }

  /** App went to background / call came in: silence everything. */
  pauseAll(): void {
    this.paused = true;
    this.cancelEchoes();
    for (const e of this.entries.values()) e.players.forEach((p) => safe(() => p.pause()));
  }

  resumeAll(): void {
    this.paused = false;
    this.applyMusic();
  }

  stopAll(): void {
    this.musicPlaying = false;
    this.cancelEchoes();
    for (const e of this.entries.values()) e.players.forEach((p) => safe(() => p.stop()));
  }

  release(): void {
    this.cancelEchoes();
    for (const e of this.entries.values()) e.players.forEach((p) => safe(() => p.release()));
    this.entries.clear();
  }

  private applyMusic() {
    const entry = this.musicKey ? this.entries.get(this.musicKey) : undefined;
    if (!entry) return;
    const volume = this.getVolumes().music;
    for (const p of entry.players) {
      safe(() => {
        p.setVolume(volume);
        if (this.musicPlaying && !this.paused && volume > 0) p.resume();
        else p.pause();
      });
    }
  }
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
function safe(fn: () => void) {
  try {
    fn();
  } catch (e) {
    console.warn('AudioService: operation failed', e);
  }
}
