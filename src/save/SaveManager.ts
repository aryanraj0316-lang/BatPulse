import { KeyValueStorage } from './storage';
import { SAVE_VERSION, SaveData, defaultSave, migrateSave } from './schema';
import { assignDevice } from './ledger';

export const SAVE_KEYS = {
  primary: 'echo.save.primary',
  backup: 'echo.save.backup',
  corrupt: 'echo.save.corrupt',
  legacyProgress: 'bats_view_v2_progress',
  legacySettings: 'bats_view_v2_settings',
} as const;

export type LoadSource = 'primary' | 'backup' | 'legacy' | 'default';
export interface LoadResult {
  data: SaveData;
  source: LoadSource;
  /** true when the primary file was damaged and something else was used instead */
  recovered: boolean;
}

/** A random id for this install. Not a secret and not an account: it only keeps each device's earnings apart. */
export function newDeviceId(): string {
  const r = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  return `d${r()}${r()}`;
}

/** FNV-1a 32-bit. Detects truncation and bit-rot; not a security feature. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function encodeEnvelope(data: SaveData): string {
  const body = JSON.stringify(data);
  return JSON.stringify({ saveVersion: data.saveVersion, checksum: checksum(body), body });
}

/** Returns the parsed save, or null when the blob is missing, malformed or fails its checksum. */
export function decodeEnvelope(blob: string | null): { data: SaveData; version: number } | null {
  if (!blob) return null;
  try {
    const env = JSON.parse(blob);
    if (!env || typeof env.body !== 'string' || typeof env.checksum !== 'string') return null;
    if (checksum(env.body) !== env.checksum) return null;
    return { data: migrateSave(JSON.parse(env.body)), version: Number(env.saveVersion) || 0 };
  } catch {
    return null;
  }
}

/**
 * Owns the in-memory save and every write to disk.
 * - Writes are serialised through one promise chain, so two quick updates can never interleave.
 * - Every save writes the primary file and then an identical backup copy, so damage to one file loses nothing.
 * - load() falls back primary -> backup -> legacy keys -> clean default and heals the primary.
 */
export class SaveManager {
  private current: SaveData = defaultSave();
  private loaded = false;
  private chain: Promise<void> = Promise.resolve();
  /** Set when a newer app version wrote the file: we must not overwrite it. */
  private readOnly = false;
  lastError: unknown = null;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly makeDeviceId: () => string = newDeviceId,
    private readonly now: () => number = Date.now,
  ) {}

  get isLoaded() {
    return this.loaded;
  }

  get data(): SaveData {
    return this.current;
  }

  async load(): Promise<LoadResult> {
    let result: LoadResult | null = null;
    let primaryBlob: string | null = null;
    let primaryBroken = false;
    try {
      primaryBlob = await this.storage.getItem(SAVE_KEYS.primary);
      const primary = decodeEnvelope(primaryBlob);
      primaryBroken = primaryBlob !== null && !primary;
      if (primary) {
        if (primary.version > SAVE_VERSION) this.readOnly = true;
        result = { data: primary.data, source: 'primary', recovered: false };
      } else {
        const backup = decodeEnvelope(await this.storage.getItem(SAVE_KEYS.backup));
        if (backup) {
          result = { data: backup.data, source: 'backup', recovered: primaryBlob !== null };
        }
      }
    } catch (e) {
      this.lastError = e;
    }

    const damaged = result === null && primaryBlob !== null;
    if (primaryBroken) {
      // Keep the unreadable blob for forensics instead of silently destroying it (even when the backup saved the day).
      try {
        await this.storage.setItem(SAVE_KEYS.corrupt, primaryBlob as string);
      } catch (e) {
        this.lastError = e;
      }
    }

    if (!result) {
      const legacy = await this.readLegacy();
      result = legacy
        ? { data: legacy, source: 'legacy', recovered: false }
        : { data: defaultSave(), source: 'default', recovered: damaged };
    }

    this.current = result.data;
    // every install gets its own id the first time it loads (also moves an old save's balance onto it)
    const needsIdentity = !this.current.ledger.deviceId;
    if (needsIdentity) this.current = { ...this.current, ledger: assignDevice(this.current.ledger, this.makeDeviceId) };
    this.loaded = true;
    if (result.source !== 'primary' || needsIdentity) this.enqueueWrite(); // heal / migrate
    await this.flush();
    return result;
  }

  /** Applies a change to the live save and persists it. Safe to call rapidly. */
  mutate(change: (draft: SaveData) => void): void {
    if (!this.loaded) {
      console.warn('SaveManager.mutate called before load(); change ignored');
      return;
    }
    const draft: SaveData = JSON.parse(JSON.stringify(this.current));
    change(draft);
    draft.updatedAt = this.now();
    this.current = migrateSave(draft);
    this.enqueueWrite();
  }

  /**
   * Replaces the live save with a merged one (cloud sync) and persists it. Keeps this install's device id.
   * Ignored before load().
   */
  adopt(next: SaveData): void {
    if (!this.loaded) return;
    this.current = migrateSave({ ...next, ledger: { ...next.ledger, deviceId: this.current.ledger.deviceId } });
    this.enqueueWrite();
  }

  /** Resolves when every queued write has finished. */
  flush(): Promise<void> {
    return this.chain;
  }

  private enqueueWrite() {
    if (this.readOnly) return;
    const snapshot = encodeEnvelope(this.current);
    this.chain = this.chain.then(async () => {
      try {
        await this.storage.setItem(SAVE_KEYS.primary, snapshot);
        // identical second copy: if either file is ever damaged, the other holds the same, latest progress
        await this.storage.setItem(SAVE_KEYS.backup, snapshot);
      } catch (e) {
        this.lastError = e; // a later mutate rewrites the full snapshot, so nothing is lost permanently
      }
    });
  }

  /** Pre-rebuild builds stored flat progress/settings under other keys (web only in practice). */
  private async readLegacy(): Promise<SaveData | null> {
    try {
      const [p, s] = await Promise.all([
        this.storage.getItem(SAVE_KEYS.legacyProgress),
        this.storage.getItem(SAVE_KEYS.legacySettings),
      ]);
      if (!p && !s) return null;
      const progress = p ? JSON.parse(p) : {};
      const settings = s ? JSON.parse(s) : {};
      return migrateSave({ ...progress, settings });
    } catch {
      return null;
    }
  }
}
