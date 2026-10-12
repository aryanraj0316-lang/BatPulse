import { SoundKey } from '../assets/keys';

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
}

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
  ) {}

  /** Loads the given sounds. Keys that fail to load are skipped (and stay silent). */
  async preload(keys: readonly SoundKey[], musicKey: SoundKey | null = null): Promise<void> {
    this.musicKey = musicKey;
    await Promise.all(
      keys.map(async (key) => {
        try {
          const copies = key === musicKey ? 1 : SFX_COPIES;
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
    for (const e of this.entries.values()) e.players.forEach((p) => safe(() => p.pause()));
  }

  resumeAll(): void {
    this.paused = false;
    this.applyMusic();
  }

  stopAll(): void {
    this.musicPlaying = false;
    for (const e of this.entries.values()) e.players.forEach((p) => safe(() => p.stop()));
  }

  release(): void {
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
