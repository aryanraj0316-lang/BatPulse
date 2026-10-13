import { LevelDef } from './schema';

const WALL_TYPES = ['normal', 'crystal', 'mossy'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPt = (v: any) => !!v && isNum(v.x) && isNum(v.y);
const isRect = (v: any) => isPt(v) && isNum(v.width) && isNum(v.height) && v.width > 0 && v.height > 0;

/**
 * Validates untrusted level JSON. Returns a list of human-readable problems; empty = valid.
 * Pure function, no side effects, never throws.
 */
export function validateLevel(raw: unknown): string[] {
  const errs: string[] = [];
  const l = raw as any;
  if (!l || typeof l !== 'object') return ['level is not an object'];
  const tag = `level ${isNum(l.id) ? l.id : '?'}`;
  const bad = (m: string) => errs.push(`${tag}: ${m}`);

  if (!Number.isInteger(l.id) || l.id < 0) bad('id must be a non-negative integer');
  if (typeof l.name !== 'string' || !l.name) bad('name must be a non-empty string');
  if (!Number.isInteger(l.chapter) || l.chapter < 1) bad('chapter must be an integer >= 1');
  if (!isNum(l.width) || l.width <= 0) bad('width must be > 0');
  if (!isNum(l.height) || l.height <= 0) bad('height must be > 0');
  const W = isNum(l.width) ? l.width : 0;
  const H = isNum(l.height) ? l.height : 0;
  const inside = (p: any) => isPt(p) && p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H;

  if (!inside(l.start)) bad('start missing or outside the level bounds');
  if (!inside(l.finish)) bad('finish missing or outside the level bounds');

  const arr = (key: string): any[] => {
    if (!Array.isArray(l[key])) {
      bad(`${key} must be an array`);
      return [];
    }
    return l[key];
  };

  arr('walls').forEach((w, i) => {
    if (!isRect(w)) bad(`walls[${i}] is not a valid rect`);
    else if (!WALL_TYPES.includes(w.type)) bad(`walls[${i}].type must be one of ${WALL_TYPES.join('|')}`);
  });
  arr('spikes').forEach((s, i) => {
    if (!isRect(s)) bad(`spikes[${i}] is not a valid rect`);
  });
  arr('movingHazards').forEach((h, i) => {
    if (!isRect(h)) bad(`movingHazards[${i}] is not a valid rect`);
    else if (h.kind !== 'slider' && h.kind !== 'blade') bad(`movingHazards[${i}].kind must be slider|blade`);
    else if (!isNum(h.loopSec) || h.loopSec <= 0) bad(`movingHazards[${i}].loopSec must be > 0`);
    else if (h.phase !== undefined && !(isNum(h.phase) && h.phase >= 0 && h.phase <= 1)) bad(`movingHazards[${i}].phase must be 0..1`);
    else if (h.kind === 'slider' && !isPt(h.travel)) bad(`movingHazards[${i}] slider needs a travel vector`);
  });
  const switchIds = new Set<string>();
  arr('switches').forEach((s, i) => {
    if (!s || typeof s.id !== 'string' || !isPt(s) || !isNum(s.radius) || s.radius <= 0) bad(`switches[${i}] invalid`);
    else if (switchIds.has(s.id)) bad(`switches[${i}].id "${s.id}" is duplicated`);
    else switchIds.add(s.id);
  });
  arr('doors').forEach((d, i) => {
    if (!isRect(d) || typeof d.id !== 'string') bad(`doors[${i}] invalid`);
    else if (!switchIds.has(d.switchId)) bad(`doors[${i}].switchId "${d.switchId}" matches no switch`);
  });
  arr('pickups').forEach((p, i) => {
    if (!isPt(p) || p.type !== 'charge') bad(`pickups[${i}] invalid`);
  });
  arr('enemies').forEach((e, i) => {
    if (!e || e.type !== 'hunter') bad(`enemies[${i}].type must be "hunter"`);
    else if (!Array.isArray(e.waypoints) || e.waypoints.length < 1 || !e.waypoints.every(isPt)) bad(`enemies[${i}].waypoints needs >= 1 valid point`);
    else if (e.speed !== 'slow' && e.speed !== 'fast') bad(`enemies[${i}].speed must be slow|fast`);
    else if (e.phaseSec !== undefined && !(isNum(e.phaseSec) && e.phaseSec >= 0)) bad(`enemies[${i}].phaseSec must be >= 0`);
  });
  arr('checkpoints').forEach((c, i) => {
    if (!isPt(c)) bad(`checkpoints[${i}] invalid`);
  });

  const s = l.sonar;
  if (!s || (s.mode !== 'recharge' && s.mode !== 'fixed')) bad('sonar.mode must be recharge|fixed');
  else {
    if (!Number.isInteger(s.charges) || s.charges < 1) bad('sonar.charges must be an integer >= 1');
    if (s.mode === 'recharge' && (!isNum(s.rechargeSec) || s.rechargeSec <= 0)) bad('sonar.rechargeSec must be > 0 in recharge mode');
  }

  if (!Number.isInteger(l.ghostPulseLimit) || l.ghostPulseLimit < 0) bad('ghostPulseLimit must be an integer >= 0');
  if (!isNum(l.parTime) || l.parTime <= 0) bad('parTime must be > 0');
  const t = l.starThresholds;
  if (!t || !isNum(t.two) || !isNum(t.three) || t.three <= 0 || t.three > t.two) bad('starThresholds needs two >= three > 0 (seconds)');
  if (!l.escape || typeof l.escape.enabled !== 'boolean' || !isNum(l.escape.wallSpeed) || l.escape.wallSpeed < 0) bad('escape needs enabled:boolean and wallSpeed >= 0');
  else if (l.escape.enabled && !(l.escape.wallSpeed > 0)) bad('an enabled escape needs wallSpeed > 0');
  else if (l.escape.startGap !== undefined && !(isNum(l.escape.startGap) && l.escape.startGap >= 0)) bad('escape.startGap must be >= 0');

  if (l.hints !== undefined) {
    if (!Array.isArray(l.hints)) bad('hints must be an array');
    else
      l.hints.forEach((h: any, i: number) => {
        if (!h || typeof h.text !== 'string' || !h.text) bad(`hints[${i}].text must be a non-empty string`);
        else if (!['move', 'pulse', 'seconds'].includes(h.until)) bad(`hints[${i}].until must be move|pulse|seconds`);
        else if (h.until === 'seconds' && !(isNum(h.seconds) && h.seconds > 0)) bad(`hints[${i}].seconds must be > 0`);
      });
  }

  // Geometry sanity: start must not sit inside a wall.
  if (errs.length === 0) {
    for (const w of l.walls) {
      if (l.start.x >= w.x && l.start.x <= w.x + w.width && l.start.y >= w.y && l.start.y <= w.y + w.height) {
        bad('start is inside a wall');
        break;
      }
    }
  }
  return errs;
}

export const isValidLevel = (raw: unknown): raw is LevelDef => validateLevel(raw).length === 0;
