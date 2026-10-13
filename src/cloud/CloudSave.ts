import { ECHO_CONFIG } from '../constants/gameConfig';
import { decodeEnvelope, encodeEnvelope } from '../save/SaveManager';
import { SAVE_VERSION, SaveData } from '../save/schema';
import { mergeSaves } from './merge';

/** What the server holds: the encoded save plus a version the server bumps on every write. */
export interface RemoteSave {
  blob: string;
  version: string;
}

export interface CloudProvider {
  /** The stored save, or null when this player has none yet. Throws when the network or server fails. */
  download(): Promise<RemoteSave | null>;
  /** Stores a save only if the server still holds `expectedVersion` (null = none yet). false = someone else wrote first. */
  upload(blob: string, expectedVersion: string | null): Promise<boolean>;
}

export type SyncStatus =
  | 'disabled' // no backend configured in this build
  | 'ok' // merged and stored
  | 'unchanged' // nothing to do: both sides already equal
  | 'offline' // network or server unreachable; local save untouched
  | 'newer-app' // the cloud copy was written by a newer game version: do not touch it
  | 'conflict'; // another device kept writing at the same time; try again later

export interface SyncResult {
  status: SyncStatus;
  /** The save to use afterwards (the merged one when status is ok). */
  data: SaveData;
}

/** Same progress? Ignores which device wrote it and when. */
const sameContent = (a: SaveData, b: SaveData) => {
  const norm = (d: SaveData) => JSON.stringify({ ...d, ledger: { earned: d.ledger.earned }, updatedAt: 0 });
  return norm(a) === norm(b);
};

/**
 * One sync round: download, merge with the local save, store the result, and hand the merged save back.
 * Never throws and never loses local progress: any failure leaves the local save exactly as it was.
 */
export async function syncSave(local: SaveData, provider: CloudProvider | null, maxAttempts = 3): Promise<SyncResult> {
  if (!provider) return { status: 'disabled', data: local };
  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const remote = await provider.download();
      let merged = local;
      let version: string | null = null;
      if (remote) {
        version = remote.version;
        const decoded = decodeEnvelope(remote.blob);
        if (decoded && decoded.version > SAVE_VERSION) return { status: 'newer-app', data: local };
        // an unreadable cloud copy is simply replaced by the local one
        if (decoded) {
          merged = mergeSaves(local, decoded.data);
          if (sameContent(merged, decoded.data)) {
            // the cloud copy already holds everything local has: nothing to upload
            return { status: sameContent(merged, local) ? 'unchanged' : 'ok', data: merged };
          }
        }
      }
      if (await provider.upload(encodeEnvelope(merged), version)) return { status: 'ok', data: merged };
      // lost a race with another device: download again and merge again
    }
    return { status: 'conflict', data: local };
  } catch {
    return { status: 'offline', data: local };
  }
}

/** REST adapter. The route and payload shapes are documented in docs/ONLINE_BACKEND.md. */
export class HttpCloudProvider implements CloudProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => Promise<string | null>,
    private readonly timeoutMs: number = ECHO_CONFIG.online.cloudSave.timeoutMs,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async request(method: 'GET' | 'PUT', body?: unknown): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const token = await this.getToken();
      return await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/save`, {
        method,
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async download(): Promise<RemoteSave | null> {
    const res = await this.request('GET');
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`cloud save: HTTP ${res.status}`);
    const j = (await res.json()) as { blob?: unknown; version?: unknown };
    if (typeof j.blob !== 'string' || typeof j.version !== 'string') throw new Error('cloud save: bad response');
    return { blob: j.blob, version: j.version };
  }

  async upload(blob: string, expectedVersion: string | null): Promise<boolean> {
    const res = await this.request('PUT', { blob, expectedVersion });
    if (res.status === 409 || res.status === 412) return false;
    if (!res.ok) throw new Error(`cloud save: HTTP ${res.status}`);
    return true;
  }
}

/** The provider for this build: null while the feature is switched off or has no address. */
export function createCloudProvider(getToken: () => Promise<string | null> = async () => null): CloudProvider | null {
  const c = ECHO_CONFIG.online.cloudSave;
  return c.enabled && c.baseUrl ? new HttpCloudProvider(c.baseUrl, getToken, c.timeoutMs) : null;
}
