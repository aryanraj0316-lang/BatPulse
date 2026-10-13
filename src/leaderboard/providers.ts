import { ECHO_CONFIG } from '../constants/gameConfig';
import { Submission } from './rules';

export interface RemoteRow {
  rank: number;
  name: string;
  timeSec: number;
  isYou: boolean;
}

export interface LeaderboardProvider {
  /** Sends one time. true = accepted, false = rejected by the server (do not retry). Throws on network failure (retry later). */
  submit(entry: Submission & { name: string }): Promise<boolean>;
  /** Best times of one board, fastest first. Throws on network failure. */
  top(levelId: number, character: string, count: number): Promise<RemoteRow[]>;
}

/** REST adapter. Routes and payloads are documented in docs/ONLINE_BACKEND.md. */
export class HttpLeaderboardProvider implements LeaderboardProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => Promise<string | null>,
    private readonly timeoutMs: number = ECHO_CONFIG.online.leaderboard.timeoutMs,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async request(path: string, init: RequestInit): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const token = await this.getToken();
      return await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}${path}`, {
        ...init,
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async submit(entry: Submission & { name: string }): Promise<boolean> {
    const res = await this.request('/scores', { method: 'POST', body: JSON.stringify(entry) });
    if (res.status === 400 || res.status === 422) return false; // the server refused this time for good
    if (!res.ok) throw new Error(`leaderboard: HTTP ${res.status}`);
    return true;
  }

  async top(levelId: number, character: string, count: number): Promise<RemoteRow[]> {
    const q = `levelId=${encodeURIComponent(levelId)}&character=${encodeURIComponent(character)}&limit=${encodeURIComponent(count)}`;
    const res = await this.request(`/scores?${q}`, { method: 'GET' });
    if (!res.ok) throw new Error(`leaderboard: HTTP ${res.status}`);
    const j = (await res.json()) as { rows?: unknown };
    if (!Array.isArray(j.rows)) throw new Error('leaderboard: bad response');
    return j.rows
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r, i) => ({
        rank: typeof r.rank === 'number' ? r.rank : i + 1,
        name: typeof r.name === 'string' ? r.name.slice(0, 24) : '?',
        timeSec: typeof r.timeSec === 'number' && Number.isFinite(r.timeSec) ? r.timeSec : NaN,
        isYou: r.isYou === true,
      }))
      .filter((r) => Number.isFinite(r.timeSec) && r.timeSec > 0)
      .slice(0, count);
  }
}

/** The provider for this build: null while the feature is off or has no address. */
export function createLeaderboardProvider(getToken: () => Promise<string | null> = async () => null): LeaderboardProvider | null {
  const c = ECHO_CONFIG.online.leaderboard;
  return c.enabled && c.baseUrl ? new HttpLeaderboardProvider(c.baseUrl, getToken, c.timeoutMs) : null;
}
