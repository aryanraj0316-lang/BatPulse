import { Analytics } from '../analytics/Analytics';

export type CrashSource = 'render' | 'js' | 'promise';

export interface CrashRecord {
  source: CrashSource;
  message: string;
  at: number;
}

const MAX_RECORDS = 20;
const records: CrashRecord[] = [];

const messageOf = (e: unknown): string => {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
  return (m ?? 'unknown error').slice(0, 200);
};

/** Notes a crash (kept in memory, sent to analytics). Never throws, so reporting can never cause a second crash. */
export function recordCrash(error: unknown, source: CrashSource, flush?: () => Promise<void>): CrashRecord {
  const rec: CrashRecord = { source, message: messageOf(error), at: Date.now() };
  records.push(rec);
  if (records.length > MAX_RECORDS) records.shift();
  try {
    Analytics.track({ name: 'crash', source, message: rec.message });
  } catch {
    // ignore
  }
  try {
    // make sure progress reaches disk before anything else goes wrong
    void flush?.().catch(() => {});
  } catch {
    // ignore
  }
  return rec;
}

export const recentCrashes = (): readonly CrashRecord[] => records;
export const clearCrashes = (): void => {
  records.length = 0;
};

type GlobalLike = {
  ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void };
  addEventListener?: (type: string, fn: (ev: any) => void) => void;
};

let installed = false;

/**
 * Catches errors outside React rendering: the React Native global handler (native) and window error /
 * unhandledrejection events (web). The previous handler is still called, so the platform's own behaviour is kept.
 */
export function installGlobalHandlers(g: GlobalLike = globalThis as unknown as GlobalLike, flush?: () => Promise<void>): void {
  if (installed) return;
  installed = true;
  const eu = g.ErrorUtils;
  if (eu) {
    const previous = eu.getGlobalHandler();
    eu.setGlobalHandler((e, fatal) => {
      recordCrash(e, 'js', flush);
      previous?.(e, fatal);
    });
  }
  g.addEventListener?.('error', (ev) => recordCrash(ev?.error ?? ev?.message, 'js', flush));
  g.addEventListener?.('unhandledrejection', (ev) => recordCrash(ev?.reason, 'promise', flush));
}

/** Test hook: lets a test install handlers again on a fake global. */
export const __resetCrashHandlersForTests = (): void => {
  installed = false;
};
