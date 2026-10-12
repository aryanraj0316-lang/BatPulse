import { LevelDef } from './schema';
import { validateLevel } from './validate';
import testLevel from './data/echo_test.json';
import echo01 from './data/echo_01.json';
import echo02 from './data/echo_02.json';
import echo03 from './data/echo_03.json';
import echo04 from './data/echo_04.json';
import echo05 from './data/echo_05.json';

/**
 * Registry of authored level files. A new level is added by dropping a JSON file in ./data
 * and listing it here - no gameplay code changes.
 */
const RAW_LEVELS: Record<number, unknown> = {
  0: testLevel,
  1: echo01,
  2: echo02,
  3: echo03,
  4: echo04,
  5: echo05,
};

const strictByDefault = (): boolean => (typeof __DEV__ !== 'undefined' ? __DEV__ : true);

export class LevelLoadError extends Error {}

/**
 * Loads and validates an authored level.
 * strict (debug builds): a malformed level throws LevelLoadError listing every problem.
 * non-strict (release): logs the problems and returns null so callers can fall back; never throws.
 */
export function loadAuthoredLevel(id: number, strict: boolean = strictByDefault()): LevelDef | null {
  const raw = RAW_LEVELS[id];
  if (raw === undefined) return null;
  const errs = validateLevel(raw);
  if (errs.length === 0) return raw as LevelDef;
  const msg = `Malformed level file ${id}:\n - ${errs.join('\n - ')}`;
  if (strict) throw new LevelLoadError(msg);
  console.warn(msg);
  return null;
}

export const hasAuthoredLevel = (id: number): boolean => RAW_LEVELS[id] !== undefined;
export const authoredLevelIds = (): number[] => Object.keys(RAW_LEVELS).map(Number);

/** Test seam: lets unit tests inject files without touching the real registry. */
export function __setRawLevelForTest(id: number, raw: unknown | undefined) {
  if (raw === undefined) delete RAW_LEVELS[id];
  else RAW_LEVELS[id] = raw;
}
