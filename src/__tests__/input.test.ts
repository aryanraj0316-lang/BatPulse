import { TouchInput } from '../input/TouchInput';

const mk = () => {
  let pulses = 0;
  const input = new TouchInput(() => pulses++, 50, 0.1);
  return { input, pulses: () => pulses };
};

describe('TouchInput: joystick', () => {
  it('anchors where the thumb lands and reports a vector', () => {
    const { input } = mk();
    input.stickDown(1, 300, 700);
    expect(input.active).toBe(true);
    expect(input.stick.mag).toBe(0);
    input.stickMove(1, 330, 700);
    expect(input.stick.x).toBeGreaterThan(0.3);
    expect(input.stick.y).toBeCloseTo(0);
    expect(input.knobX).toBe(30);
  });
  it('dead zone: tiny wobble gives exactly zero', () => {
    const { input } = mk();
    input.stickDown(1, 300, 700);
    input.stickMove(1, 303, 702);
    expect(input.stick).toEqual({ x: 0, y: 0, mag: 0 });
  });
  it('releases to zero', () => {
    const { input } = mk();
    input.stickDown(1, 300, 700);
    input.stickMove(1, 360, 700);
    input.stickUp(1);
    expect(input.active).toBe(false);
    expect(input.stick).toEqual({ x: 0, y: 0, mag: 0 });
    expect(input.knobX).toBe(0);
  });
  it('extra fingers cannot steal or disturb the stick', () => {
    const { input } = mk();
    input.stickDown(1, 300, 700);
    input.stickMove(1, 340, 700);
    const before = { ...input.stick };
    input.stickDown(2, 100, 100); // second finger in the same zone
    input.stickMove(2, 150, 150);
    input.stickUp(2);
    expect(input.stick).toEqual(before);
    expect(input.active).toBe(true);
    input.stickUp(1);
    expect(input.active).toBe(false);
  });
  it('a new finger can take over after the first lifted', () => {
    const { input } = mk();
    input.stickDown(1, 300, 700);
    input.stickUp(1);
    input.stickDown(2, 200, 600);
    input.stickMove(2, 200, 560);
    expect(input.stick.y).toBeLessThan(-0.5);
  });
  it('moves from unknown ids are ignored', () => {
    const { input } = mk();
    input.stickMove(9, 500, 500);
    expect(input.stick.mag).toBe(0);
    input.stickDown(1, 300, 700);
    input.stickUp(9);
    expect(input.active).toBe(true);
  });
});

describe('TouchInput: SONAR + joystick together', () => {
  it('pulse fires on touch-down, once per finger', () => {
    const { input, pulses } = mk();
    input.sonarDown(5);
    input.sonarDown(5); // duplicate down for the same finger
    expect(pulses()).toBe(1);
    input.sonarUp(5);
    input.sonarDown(5);
    expect(pulses()).toBe(2);
  });
  it('both thumbs at once: stick keeps steering while pulses fire', () => {
    const { input, pulses } = mk();
    input.stickDown(1, 300, 700);
    input.stickMove(1, 350, 700);
    input.sonarDown(2);
    input.sonarUp(2);
    input.sonarDown(3);
    input.stickMove(1, 350, 650);
    expect(pulses()).toBe(2);
    expect(input.stick.y).toBeLessThan(0);
    expect(input.active).toBe(true);
  });
  it('very fast tapping registers every tap', () => {
    const { input, pulses } = mk();
    for (let i = 0; i < 50; i++) {
      input.sonarDown(100 + i);
      input.sonarUp(100 + i);
    }
    expect(pulses()).toBe(50); // debouncing is the simulation's job, not the input's
  });
  it('cancelAll (system interruption) releases everything', () => {
    const { input, pulses } = mk();
    input.stickDown(1, 300, 700);
    input.stickMove(1, 350, 700);
    input.sonarDown(2);
    input.cancelAll();
    expect(input.active).toBe(false);
    expect(input.stick.mag).toBe(0);
    input.sonarDown(2); // the same id can fire again after the cancel
    expect(pulses()).toBe(2);
  });
});

describe('TouchInput: keyboard (web)', () => {
  it('keys drive the stick and win over touch; releasing falls back to touch', () => {
    const { input } = mk();
    input.setKeys(1, 0);
    expect(input.stick).toEqual({ x: 1, y: 0, mag: 1 });
    input.stickDown(1, 300, 700);
    input.stickMove(1, 300, 650);
    expect(input.stick.x).toBe(1);
    input.setKeys(0, 0);
    expect(input.stick.y).toBeLessThan(-0.5);
  });
  it('diagonal keys are normalised', () => {
    const { input } = mk();
    input.setKeys(1, 1);
    expect(input.stick.mag).toBeCloseTo(1);
  });
});
