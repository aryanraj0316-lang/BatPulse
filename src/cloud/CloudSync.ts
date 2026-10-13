import { ECHO_CONFIG } from '../constants/gameConfig';
import { SaveData } from '../save/schema';
import { CloudProvider, SyncStatus, syncSave } from './CloudSave';

export type SyncReason = 'launch' | 'background' | 'change' | 'manual';

export interface CloudSyncDeps {
  /** null while the feature is off in this build. */
  provider: CloudProvider | null;
  getLocal(): SaveData;
  /** Called with the merged save after a successful sync (the app stores it and refreshes its screens). */
  adopt(merged: SaveData): void;
  now?(): number;
  minIntervalSec?: number;
}

/**
 * Decides when to sync: at launch, when the app goes to the background, after progress changes (not more often
 * than every `minIntervalSec`) and whenever the player taps "Sync now". One sync at a time.
 */
export class CloudSync {
  status: SyncStatus | 'idle' = 'idle';
  lastSyncedAt: number | null = null;
  private lastAttemptAt = -Infinity;
  private running: Promise<SyncStatus> | null = null;
  private listeners = new Set<() => void>();

  constructor(private readonly deps: CloudSyncDeps) {}

  get enabled(): boolean {
    return this.deps.provider !== null;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  /** Runs a sync unless one is running or the last one was too recent (manual always runs). */
  request(reason: SyncReason): Promise<SyncStatus> {
    const now = (this.deps.now ?? Date.now)();
    const minMs = (this.deps.minIntervalSec ?? ECHO_CONFIG.online.cloudSave.minIntervalSec) * 1000;
    if (!this.deps.provider) return Promise.resolve('disabled');
    if (this.running) return this.running;
    if (reason !== 'manual' && reason !== 'launch' && now - this.lastAttemptAt < minMs) return Promise.resolve(this.status === 'idle' ? 'unchanged' : (this.status as SyncStatus));
    this.lastAttemptAt = now;
    this.running = (async () => {
      const result = await syncSave(this.deps.getLocal(), this.deps.provider);
      if (result.status === 'ok') {
        this.deps.adopt(result.data);
      }
      if (result.status === 'ok' || result.status === 'unchanged') this.lastSyncedAt = now;
      this.status = result.status;
      this.emit();
      return result.status;
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }
}

export const syncStatusText = (s: SyncStatus | 'idle', enabled: boolean): string => {
  if (!enabled) return 'Cloud save is not available in this build.';
  switch (s) {
    case 'idle': return 'Not synced yet.';
    case 'ok': return 'Synced.';
    case 'unchanged': return 'Up to date.';
    case 'offline': return 'Could not reach the server. Your progress is safe on this device.';
    case 'newer-app': return 'Your cloud save was made by a newer version of the game. Update the app to sync.';
    case 'conflict': return 'Another device is syncing. Try again in a moment.';
    case 'disabled': return 'Cloud save is not available in this build.';
  }
};
