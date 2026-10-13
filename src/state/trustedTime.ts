import { ECHO_CONFIG } from '../constants/gameConfig';

type Source = (typeof ECHO_CONFIG.trustedTime.sources)[number];

/** Turns a time-service response into UTC milliseconds, or null if it is not a usable answer. */
export function parseTrustedTime(kind: Source['kind'], body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  let ms: number;
  if (kind === 'worldtimeapi') {
    if (typeof b.unixtime !== 'number') return null;
    ms = b.unixtime * 1000;
  } else {
    // timeapi.io returns the UTC date-time without an offset
    if (typeof b.dateTime !== 'string') return null;
    ms = Date.parse(b.dateTime.endsWith('Z') ? b.dateTime : `${b.dateTime}Z`);
  }
  // reject nonsense (NaN, before 2024, absurdly far in the future)
  return Number.isFinite(ms) && ms > Date.UTC(2024, 0, 1) && ms < Date.UTC(2200, 0, 1) ? ms : null;
}

export type Fetcher = (url: string, timeoutMs: number) => Promise<unknown>;

const defaultFetcher: Fetcher = async (url, timeoutMs) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Current UTC time from a network source, or null when none is reachable. The phone's own clock is deliberately
 * never used: the daily reward must not be farmable by changing the date, so offline means "try again later".
 */
export async function fetchTrustedTime(fetcher: Fetcher = defaultFetcher): Promise<number | null> {
  for (const src of ECHO_CONFIG.trustedTime.sources) {
    try {
      const ms = parseTrustedTime(src.kind, await fetcher(src.url, ECHO_CONFIG.trustedTime.timeoutMs));
      if (ms !== null) return ms;
    } catch {
      // try the next source
    }
  }
  return null;
}
