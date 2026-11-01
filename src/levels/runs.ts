/**
 * Endless & Daily Descent: a run is a chain of generated floors that get harder each time.
 * One death ends the run. The daily run uses the same seed for everyone on a given day.
 */

export type RunMode = 'endless' | 'daily';

export interface RunInfo {
  mode: RunMode;
  /** 1-based floor number within the run */
  floor: number;
  /** base seed of the whole run */
  seed: number;
  /** shards collected so far this run */
  shards: number;
}

/** Days since 1970 (UTC); the daily maze changes when this does. */
export const todayNumber = () => Math.floor(Date.now() / 86400000);

/** Milliseconds until the next daily maze. */
export const msUntilNextDaily = () => (todayNumber() + 1) * 86400000 - Date.now();

/** Which campaign difficulty a floor plays at: floor 1 ≈ Echo 7, +3 per floor, capped at 70. */
export const runLevelId = (floor: number) => Math.min(70, 4 + floor * 3);

/** Seed for one floor of a run. */
export const runFloorSeed = (run: Pick<RunInfo, 'seed' | 'floor'>) => ((run.seed * 7919) ^ (run.floor * 104729)) >>> 0;

/** Shards for clearing a floor (before skin bonuses). */
export const floorShards = (floor: number) => 4 + floor * 2;

export const newEndlessRun = (): RunInfo => ({ mode: 'endless', floor: 1, seed: (Math.random() * 1e9) >>> 0, shards: 0 });
export const newDailyRun = (): RunInfo => ({ mode: 'daily', floor: 1, seed: todayNumber() * 2654435 + 17, shards: 0 });

/** The day a daily run belongs to. */
export const runDay = (run: Pick<RunInfo, 'seed'>) => Math.floor(run.seed / 2654435);
