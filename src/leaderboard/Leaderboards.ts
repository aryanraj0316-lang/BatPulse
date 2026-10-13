import { ECHO_CONFIG } from '../constants/gameConfig';
import { LevelDef } from '../levels/schema';
import { LeaderboardProvider } from './providers';
import { BoardRow, boardKey, enqueueScore, Submission, SubmissionProblem, validateSubmission } from './rules';

export type SubmitStatus = 'sent' | 'queued' | 'rejected' | 'disabled' | SubmissionProblem;
export type TopStatus = 'ok' | 'offline' | 'disabled';

export interface LeaderboardDeps {
  /** null while the feature is off in this build. */
  provider: LeaderboardProvider | null;
  getQueue(): Submission[];
  setQueue(q: Submission[]): void;
  getName(): string;
  loadLevel(id: number): LevelDef | null;
  now?(): number;
}

const CACHE_MS = 30_000;

/**
 * Sends the player's best times and reads the boards. Times are checked before they are queued, queued while
 * offline (one per board, fastest kept) and sent when the network is back. It never throws.
 */
export class Leaderboards {
  private flushing: Promise<void> | null = null;
  private cache = new Map<string, { at: number; rows: BoardRow[] }>();

  constructor(private readonly deps: LeaderboardDeps) {}

  get enabled(): boolean {
    return this.deps.provider !== null;
  }

  get pending(): number {
    return this.deps.getQueue().length;
  }

  /** Call when a clear beat the player's best for that bat on that level. */
  async submitBest(s: Submission): Promise<SubmitStatus> {
    const problem = validateSubmission(s, this.deps.loadLevel(s.levelId));
    if (problem) return problem;
    if (!this.deps.provider) return 'disabled';
    this.deps.setQueue(enqueueScore(this.deps.getQueue(), s));
    await this.flush();
    const left = this.deps.getQueue().some((q) => boardKey(q.levelId, q.character) === boardKey(s.levelId, s.character) && q.timeSec <= s.timeSec);
    return left ? 'queued' : 'sent';
  }

  /** Sends everything waiting. Items the server accepts or rejects leave the queue; network failures stay. */
  flush(): Promise<void> {
    const provider = this.deps.provider;
    if (!provider) return Promise.resolve();
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      for (const item of [...this.deps.getQueue()]) {
        try {
          await provider.submit({ ...item, name: this.deps.getName() });
        } catch {
          return; // offline or server trouble: keep the rest for next time
        }
        // accepted or refused for good: either way this entry is done (only if the queued time is unchanged)
        this.deps.setQueue(this.deps.getQueue().filter((q) => !(boardKey(q.levelId, q.character) === boardKey(item.levelId, item.character) && q.timeSec === item.timeSec)));
        this.cache.delete(boardKey(item.levelId, item.character));
      }
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  /** The top of one board. Cached for a short while so flipping through levels does not hammer the server. */
  async top(levelId: number, character: string): Promise<{ status: TopStatus; rows: BoardRow[] }> {
    const provider = this.deps.provider;
    if (!provider) return { status: 'disabled', rows: [] };
    const key = boardKey(levelId, character);
    const now = (this.deps.now ?? Date.now)();
    const hit = this.cache.get(key);
    if (hit && now - hit.at < CACHE_MS) return { status: 'ok', rows: hit.rows };
    try {
      const rows = await provider.top(levelId, character, ECHO_CONFIG.online.leaderboard.topCount);
      this.cache.set(key, { at: now, rows });
      return { status: 'ok', rows };
    } catch {
      return { status: hit ? 'ok' : 'offline', rows: hit?.rows ?? [] };
    }
  }
}
