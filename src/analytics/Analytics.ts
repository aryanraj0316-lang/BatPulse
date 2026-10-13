/** Typed analytics events (spec §3.8). A sink forwards them to a real provider later. */
export type FailCause = 'spike' | 'hazard' | 'enemy' | 'fall' | 'escape_wall' | 'restart';

export type AnalyticsEvent =
  | { name: 'level_start'; levelId: number }
  | { name: 'level_complete'; levelId: number; timeSec: number; stars: number; pulses: number; momentum: number }
  | { name: 'level_fail'; levelId: number; cause: FailCause }
  | { name: 'pulses_used'; levelId: number; count: number }
  | { name: 'ghost_run'; levelId: number }
  | { name: 'shard_earned'; amount: number; source: string }
  | { name: 'shard_spent'; amount: number; item: string }
  | { name: 'character_unlocked'; characterId: string }
  | { name: 'character_selected'; characterId: string }
  | { name: 'daily_claimed'; day: number; amount: number }
  | { name: 'mastery_milestone'; chapterId: number; pct: number; bonus: number };

export type AnalyticsSink = (event: AnalyticsEvent, timestamp: number) => void;

const sinks: AnalyticsSink[] = [];
const buffer: { event: AnalyticsEvent; timestamp: number }[] = [];
const BUFFER_LIMIT = 200;

export const Analytics = {
  /** Never throws: a broken sink must not affect gameplay. */
  track(event: AnalyticsEvent): void {
    const timestamp = Date.now();
    buffer.push({ event, timestamp });
    if (buffer.length > BUFFER_LIMIT) buffer.shift();
    for (const sink of sinks) {
      try {
        sink(event, timestamp);
      } catch {
        // ignore sink failures
      }
    }
  },
  addSink(sink: AnalyticsSink): () => void {
    sinks.push(sink);
    return () => {
      const i = sinks.indexOf(sink);
      if (i >= 0) sinks.splice(i, 1);
    };
  },
  /** Recent events, newest last (debug inspection and tests). */
  recent(): readonly { event: AnalyticsEvent; timestamp: number }[] {
    return buffer;
  },
  reset(): void {
    buffer.length = 0;
    sinks.length = 0;
  },
};

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  Analytics.addSink((e) => console.log(`[analytics] ${e.name}`, e));
}
