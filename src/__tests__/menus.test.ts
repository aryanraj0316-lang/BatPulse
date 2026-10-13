import { CHAPTERS, chapterLevelIds, chapterProgress, isLevelUnlocked } from '../levels/chapters';
import { authoredLevelIds } from '../levels/loader';
import { emptyRecord, applyVictory } from '../state/progress';
import { sliderValueFromX } from '../components/sliderMath';
import { defaultSave, migrateSave } from '../save/schema';
import { LevelRecord } from '../types/game';

describe('chapters and level select logic', () => {
  it('Chapter 1 is "The Dark Cavern", Echo 01-20', () => {
    expect(CHAPTERS[0]).toMatchObject({ id: 1, name: 'The Dark Cavern', first: 1, last: 20 });
    expect(chapterLevelIds(CHAPTERS[0])).toHaveLength(20);
  });
  it('every level of the chapter exists as a data file', () => {
    const have = authoredLevelIds();
    for (const id of chapterLevelIds(CHAPTERS[0])) expect(have).toContain(id);
  });
  it('only level 1 is open on a fresh save; progress opens the next level in order', () => {
    let records: Record<number, LevelRecord> = defaultSave().records;
    expect(isLevelUnlocked(1, records)).toBe(true);
    expect(isLevelUnlocked(2, records)).toBe(false);
    expect(isLevelUnlocked(20, records)).toBe(false);
    for (let id = 1; id <= 19; id++) {
      records = applyVictory(records, 0, id, { timeSec: 10, stars: 2, momentum: 1, bestMomentum: 1 }).records;
      expect(isLevelUnlocked(id + 1, records)).toBe(true);
      expect(isLevelUnlocked(id + 2, records)).toBe(false);
    }
  });
  it('chapter progress counts stars and cleared levels', () => {
    const records: Record<number, LevelRecord> = {
      1: { ...emptyRecord(1, true), completed: true, stars: 3 },
      2: { ...emptyRecord(2, true), completed: true, stars: 1 },
      3: { ...emptyRecord(3, true) },
    };
    expect(chapterProgress(CHAPTERS[0], records)).toEqual({ stars: 4, maxStars: 60, completed: 2, total: 20 });
    expect(chapterProgress(CHAPTERS[0], {})).toEqual({ stars: 0, maxStars: 60, completed: 0, total: 20 });
  });
});

describe('settings slider math and persistence', () => {
  it('maps a touch position to a snapped, clamped value', () => {
    expect(sliderValueFromX(0, 200, 0, 1, 0.05)).toBe(0);
    expect(sliderValueFromX(200, 200, 0, 1, 0.05)).toBe(1);
    expect(sliderValueFromX(100, 200, 0, 1, 0.05)).toBe(0.5);
    expect(sliderValueFromX(-50, 200, 0, 1, 0.05)).toBe(0);
    expect(sliderValueFromX(999, 200, 0, 1, 0.05)).toBe(1);
    expect(sliderValueFromX(103, 200, 0, 1, 0.05)).toBe(0.5); // snaps
    expect(sliderValueFromX(100, 200, 0.5, 1.5, 0.05)).toBe(1);
    expect(sliderValueFromX(10, 0, 0, 1, 0.05)).toBe(0); // unmeasured track
  });
  it('all settings survive a save round trip and are clamped when corrupt', () => {
    const s = migrateSave({ settings: { sfxVolume: 0.3, musicVolume: 0.9, brightness: 1.2, hapticsEnabled: false, floatingJoystick: false } });
    expect(s.settings).toEqual({ sfxVolume: 0.3, musicVolume: 0.9, brightness: 1.2, hapticsEnabled: false, floatingJoystick: false, reverb: true, graphics: 'auto' });
    const bad = migrateSave({ settings: { sfxVolume: 'loud', brightness: 100, hapticsEnabled: 'yes' } });
    expect(bad.settings.sfxVolume).toBe(0.8);
    expect(bad.settings.brightness).toBe(1.5);
    expect(bad.settings.hapticsEnabled).toBe(true);
  });
});
