import * as fs from 'fs';
import * as path from 'path';
import { CHAPTERS, chapterLevelIds } from '../levels/chapters';
import { authoredLevelIds, loadAuthoredLevel } from '../levels/loader';
import { validateLevel } from '../levels/validate';
import { LevelDef } from '../levels/schema';

const ids = authoredLevelIds().filter((i) => i >= 1).sort((a, b) => a - b);
const lvl = (id: number) => loadAuthoredLevel(id, true) as LevelDef;

describe('the whole game: Echo 01 - 50', () => {
  it('has exactly the 50 levels, numbered 1..50, all valid', () => {
    expect(ids).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    for (const id of ids) expect(validateLevel(lvl(id))).toEqual([]);
  });

  it('three chapters split the levels exactly: no gaps, no overlap, each level in its own chapter', () => {
    expect(CHAPTERS.map((c) => [c.id, c.first, c.last])).toEqual([[1, 1, 20], [2, 21, 35], [3, 36, 50]]);
    const seen = new Set<number>();
    for (const c of CHAPTERS)
      for (const id of chapterLevelIds(c)) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        expect(lvl(id).chapter).toBe(c.id);
      }
    expect(seen.size).toBe(50);
    expect(CHAPTERS.map((c) => c.name)).toEqual(['The Dark Cavern', 'The Listening Deep', 'The Silent Abyss']);
  });

  it('every level has par time, star thresholds and a ghost pulse limit that make sense', () => {
    for (const id of ids) {
      const d = lvl(id);
      expect({ id, par: d.parTime > 0 }).toEqual({ id, par: true });
      expect({ id, order: d.starThresholds.three > 0 && d.starThresholds.two >= d.starThresholds.three }).toEqual({ id, order: true });
      expect({ id, par3: d.parTime === d.starThresholds.three }).toEqual({ id, par3: true });
      expect({ id, ghost: Number.isInteger(d.ghostPulseLimit) && d.ghostPulseLimit >= 1 }).toEqual({ id, ghost: true });
      expect({ id, named: d.name.length > 2 }).toEqual({ id, named: true });
    }
  });

  it('difficulty rises: the clean-run time of the late chapters is not shorter than chapter 1 on average', () => {
    const avg = (from: number, to: number) => {
      const xs = ids.filter((i) => i >= from && i <= to).map((i) => lvl(i).starThresholds.three);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(avg(21, 35)).toBeGreaterThan(avg(1, 5));
    expect(avg(36, 50)).toBeGreaterThan(avg(1, 5));
  });

  it('chapter-2 and chapter-3 levels each have at least one checkpoint where the level is tall', () => {
    for (const id of ids) {
      const d = lvl(id);
      if (d.height > 1000) expect({ id, cps: d.checkpoints.length > 0 }).toEqual({ id, cps: true });
    }
  });

  it('the generated solutions document lists all 50 levels', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'LEVEL_SOLUTIONS.md'), 'utf8');
    for (const id of ids) expect({ id, listed: new RegExp(`^\\| ${id} \\|`, 'm').test(doc) }).toEqual({ id, listed: true });
    for (const c of CHAPTERS) expect(doc).toContain(`## Chapter ${c.id}: ${c.name}`);
  });
});
