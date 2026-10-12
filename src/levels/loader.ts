import { LevelDef } from './schema';
import { validateLevel } from './validate';
import testLevel from './data/echo_test.json';
import echo01 from './data/echo_01.json';
import echo02 from './data/echo_02.json';
import echo03 from './data/echo_03.json';
import echo04 from './data/echo_04.json';
import echo05 from './data/echo_05.json';
import echo06 from './data/echo_06.json';
import echo07 from './data/echo_07.json';
import echo08 from './data/echo_08.json';
import echo09 from './data/echo_09.json';
import echo10 from './data/echo_10.json';
import echo11 from './data/echo_11.json';
import echo12 from './data/echo_12.json';
import echo13 from './data/echo_13.json';
import echo14 from './data/echo_14.json';
import echo15 from './data/echo_15.json';
import echo16 from './data/echo_16.json';
import echo17 from './data/echo_17.json';
import echo18 from './data/echo_18.json';
import echo19 from './data/echo_19.json';
import echo20 from './data/echo_20.json';
import echo21 from './data/echo_21.json';
import echo22 from './data/echo_22.json';
import echo23 from './data/echo_23.json';
import echo24 from './data/echo_24.json';
import echo25 from './data/echo_25.json';
import echo26 from './data/echo_26.json';
import echo27 from './data/echo_27.json';
import echo28 from './data/echo_28.json';
import echo29 from './data/echo_29.json';
import echo30 from './data/echo_30.json';
import echo31 from './data/echo_31.json';
import echo32 from './data/echo_32.json';
import echo33 from './data/echo_33.json';
import echo34 from './data/echo_34.json';
import echo35 from './data/echo_35.json';

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
  6: echo06,
  7: echo07,
  8: echo08,
  9: echo09,
  10: echo10,
  11: echo11,
  12: echo12,
  13: echo13,
  14: echo14,
  15: echo15,
  16: echo16,
  17: echo17,
  18: echo18,
  19: echo19,
  20: echo20,
  21: echo21,
  22: echo22,
  23: echo23,
  24: echo24,
  25: echo25,
  26: echo26,
  27: echo27,
  28: echo28,
  29: echo29,
  30: echo30,
  31: echo31,
  32: echo32,
  33: echo33,
  34: echo34,
  35: echo35,
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
