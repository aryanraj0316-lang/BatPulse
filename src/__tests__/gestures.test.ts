import * as fs from 'fs';
import * as path from 'path';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { TouchInput, Timers } from '../input/TouchInput';
import { loadAuthoredLevel } from '../levels/loader';

const TAP_MS = ECHO_CONFIG.input.tapMaxMs;
const TRAVEL = ECHO_CONFIG.input.tapMaxTravelPx;

/** A TouchInput with a controllable clock and timers, so "held for 300 ms" needs no real waiting. */
function rig() {
  let now = 1000;
  let pulses = 0;
  let changes = 0;
  const timers: { id: number; at: number; fn: () => void; live: boolean }[] = [];
  const fake: Timers = {
    set: (fn, ms) => {
      const t = { id: timers.length, at: now + ms, fn, live: true };
      timers.push(t);
      return t;
    },
    clear: (h) => {
      (h as { live: boolean }).live = false;
    },
  };
  const input = new TouchInput(() => pulses++, 50, 0.1, ECHO_CONFIG.input, fake, () => now);
  input.onChange = () => changes++;
  /** Moves the clock forward and fires timers that came due. */
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers.filter((x) => x.live && x.at <= now)) {
      t.live = false;
      t.fn();
    }
  };
  /** Moves the clock without firing timers (simulates a timer that runs late). */
  const skip = (ms: number) => (now += ms);
  return { input, advance, skip, pulses: () => pulses, changes: () => changes, liveTimers: () => timers.filter((t) => t.live).length };
}

describe('tap = pulse', () => {
  it('a quick tap sends exactly one pulse, when the finger lifts', () => {
    const r = rig();
    r.input.touchStart(1, 100, 400);
    expect(r.pulses()).toBe(0); // not on touch-down: the game must first know it is not a drag
    r.advance(80);
    r.input.touchEnd(1);
    expect(r.pulses()).toBe(1);
  });

  it('a tap never engages the joystick', () => {
    const r = rig();
    r.input.touchStart(1, 100, 400);
    r.advance(50);
    r.input.touchEnd(1);
    expect(r.input.active).toBe(false);
    expect(r.input.stick).toEqual({ x: 0, y: 0, mag: 0 });
    expect(r.changes()).toBe(0);
  });

  it('works anywhere: left, right, top and bottom of the screen', () => {
    const r = rig();
    for (const [i, [x, y]] of [[10, 10], [380, 10], [10, 800], [380, 800], [190, 400]].entries()) {
      r.input.touchStart(i, x, y);
      r.advance(40);
      r.input.touchEnd(i);
    }
    expect(r.pulses()).toBe(5);
  });

  it('a little wobble (within the travel limit) is still a tap', () => {
    const r = rig();
    r.input.touchStart(1, 100, 400);
    r.input.touchMove(1, 100 + TRAVEL, 400); // exactly at the limit
    r.advance(60);
    r.input.touchEnd(1);
    expect(r.pulses()).toBe(1);
    expect(r.input.active).toBe(false);
  });

  it('a tap just under the time limit counts; at the limit it does not', () => {
    const under = rig();
    under.input.touchStart(1, 0, 0);
    under.skip(TAP_MS - 1);
    under.input.touchEnd(1);
    expect(under.pulses()).toBe(1);
    const at = rig();
    at.input.touchStart(1, 0, 0);
    at.skip(TAP_MS); // the timer has not run yet (late), but the clock says it was held
    at.input.touchEnd(1);
    expect(at.pulses()).toBe(0);
  });

  it('rapid separate taps each send a pulse (the sim limits the rate, not the input)', () => {
    const r = rig();
    for (let i = 0; i < 10; i++) {
      r.input.touchStart(i, 50, 50);
      r.advance(20);
      r.input.touchEnd(i);
      r.advance(10);
    }
    expect(r.pulses()).toBe(10);
  });
});

describe('drag = joystick', () => {
  it('moving past the travel limit takes the joystick and sends no pulse', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.input.touchMove(1, 300, 600 - TRAVEL - 1);
    expect(r.input.active).toBe(true);
    r.input.touchEnd(1);
    expect(r.pulses()).toBe(0);
    expect(r.input.active).toBe(false);
  });

  it('floating stick: anchored where the thumb landed, steers from there', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.input.touchMove(1, 340, 600);
    expect(r.input.originX).toBe(300);
    expect(r.input.originY).toBe(600);
    expect(r.input.stick.x).toBeGreaterThan(0.5);
    expect(r.input.stick.y).toBeCloseTo(0);
    expect(r.input.knobX).toBe(40);
  });

  it('fixed stick: anchored at its rest position, whatever part of the screen is touched', () => {
    const r = rig();
    r.input.touchStart(1, 100, 300, { x: 310, y: 730 });
    r.input.touchMove(1, 100, 250); // a drag far from the stick
    expect(r.input.originX).toBe(310);
    expect(r.input.originY).toBe(730);
    // direction is measured from the rest position to the finger: up and to the left
    expect(r.input.stick.x).toBeLessThan(0);
    expect(r.input.stick.y).toBeLessThan(0);
  });

  it('the vector keeps following the finger and returns to zero on release', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.input.touchMove(1, 300, 580);
    r.input.touchMove(1, 360, 600);
    expect(r.input.stick.x).toBeGreaterThan(0.9);
    r.input.touchEnd(1);
    expect(r.input.stick).toEqual({ x: 0, y: 0, mag: 0 });
    expect(r.input.knobX).toBe(0);
  });

  it('the dead zone still applies once it is the stick', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.input.touchMove(1, 300 + TRAVEL + 1, 600); // promoted by travel, but only 11 px from the origin: past the 5 px dead zone
    expect(r.input.stick.mag).toBeGreaterThan(0);
  });
});

describe('hold = joystick', () => {
  it('holding still past the time limit takes the joystick (no movement needed)', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.advance(TAP_MS - 10);
    expect(r.input.active).toBe(false);
    r.advance(20);
    expect(r.input.active).toBe(true);
    expect(r.input.stick).toEqual({ x: 0, y: 0, mag: 0 }); // engaged, not moving yet
    expect(r.input.originX).toBe(300);
    expect(r.changes()).toBe(1); // the view is told, since no touch event happened
  });

  it('releasing a hold sends no pulse', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.advance(TAP_MS + 100);
    r.input.touchEnd(1);
    expect(r.pulses()).toBe(0);
    expect(r.input.active).toBe(false);
  });

  it('after a hold, moving steers immediately', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.advance(TAP_MS + 50);
    r.input.touchMove(1, 300, 560);
    expect(r.input.stick.y).toBeLessThan(-0.5);
  });

  it('a finger that lifted in time never gets promoted later (the timer is cancelled)', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.advance(50);
    r.input.touchEnd(1);
    expect(r.liveTimers()).toBe(0);
    r.advance(1000);
    expect(r.input.active).toBe(false);
  });
});

describe('two thumbs: steer with one, sonar with the other, at the same time', () => {
  it('a second finger sends a pulse the moment it touches down, while the first keeps steering', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.input.touchMove(1, 340, 600);
    const before = { ...r.input.stick };
    r.input.touchStart(2, 80, 500); // the other thumb
    expect(r.pulses()).toBe(1); // on touch-down: nothing to wait for
    expect(r.input.active).toBe(true);
    expect(r.input.stick).toEqual(before);
    r.advance(50);
    r.input.touchEnd(2);
    expect(r.pulses()).toBe(1); // lifting sends nothing more
    r.input.touchMove(1, 340, 600);
    expect(r.input.stick.x).toBeGreaterThan(0.5);
  });

  it('the pulse thumb may wobble, slide or rest as long as it likes: it still pulsed once and never touches the stick', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.input.touchMove(1, 340, 600);
    const before = { ...r.input.stick };
    r.input.touchStart(2, 80, 500);
    r.input.touchMove(2, 80, 400); // drags a long way
    r.input.touchMove(2, 200, 300);
    expect(r.input.stick).toEqual(before);
    expect(r.input.originX).toBe(300);
    r.input.touchEnd(2);
    expect(r.pulses()).toBe(1);
    r.input.touchStart(3, 60, 700);
    expect(r.pulses()).toBe(2); // a new touch is a new pulse
    r.advance(TAP_MS + 500); // held for a long time: no extra pulse, no stick
    expect(r.input.originX).toBe(300);
    expect(r.pulses()).toBe(2);
    r.input.touchEnd(3);
    expect(r.pulses()).toBe(2);
  });

  it('every extra finger taps its own pulse (rapid alternating taps while steering)', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.input.touchMove(1, 340, 600);
    for (let i = 0; i < 6; i++) {
      r.input.touchStart(10 + i, 80, 500);
      r.advance(30);
      r.input.touchEnd(10 + i);
      r.advance(30);
    }
    expect(r.pulses()).toBe(6);
    expect(r.input.active).toBe(true);
    expect(r.input.stick.x).toBeGreaterThan(0.5);
  });

  it('the steering finger can lift while the pulse finger is still down, without a stray pulse', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.input.touchMove(1, 340, 600);
    r.input.touchStart(2, 80, 500);
    expect(r.pulses()).toBe(1);
    r.input.touchEnd(1);
    expect(r.input.active).toBe(false);
    expect(r.pulses()).toBe(1);
    r.input.touchMove(2, 90, 480);
    r.input.touchEnd(2);
    expect(r.pulses()).toBe(1);
  });

  it('when nobody is steering yet, a quick tap still pulses on release (and does not steer)', () => {
    const r = rig();
    r.input.touchStart(1, 100, 400);
    expect(r.pulses()).toBe(0);
    r.advance(60);
    r.input.touchEnd(1);
    expect(r.pulses()).toBe(1);
    expect(r.input.active).toBe(false);
  });

  it('works through the Android touch model: every pointer of a gesture is reported to the first finger view', () => {
    // React Native on Android sends all pointers to the view the first finger touched. That is why the game has ONE
    // touch zone: whichever thumb goes down first, the other thumb's events reach the same handler.
    const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'Controls.tsx'), 'utf8');
    expect(src.match(/testID="touch-zone"/g)).toHaveLength(1);
    expect(src.match(/onTouchStart:/g)).toHaveLength(1); // one handler set, no second view with its own touch handlers
    const screen = fs.readFileSync(path.join(__dirname, '..', 'screens', 'GameScreen.tsx'), 'utf8');
    expect(screen).not.toMatch(/onTouchStart|onPressIn|onStartShouldSetResponder/);
  });

  it('after the first finger lifts, the next drag can take the stick', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.input.touchMove(1, 340, 600);
    r.input.touchEnd(1);
    r.input.touchStart(2, 100, 500);
    r.input.touchMove(2, 100, 460);
    expect(r.input.active).toBe(true);
    expect(r.input.originX).toBe(100);
  });
});

describe('robustness', () => {
  it('unknown ids and repeated events are harmless', () => {
    const r = rig();
    expect(() => {
      r.input.touchMove(9, 1, 1);
      r.input.touchEnd(9);
      r.input.touchStart(1, 10, 10);
      r.input.touchStart(1, 99, 99); // duplicate start for the same finger is ignored
      r.input.touchEnd(1);
      r.input.touchEnd(1);
    }).not.toThrow();
    expect(r.pulses()).toBe(1);
  });

  it('cancelAll (a call, the notification shade) releases everything, cancels timers and sends no extra pulse', () => {
    const r = rig();
    r.input.touchStart(1, 300, 600);
    r.input.touchMove(1, 340, 600);
    r.input.touchStart(2, 80, 500); // the sonar thumb: one pulse, at touch-down
    expect(r.pulses()).toBe(1);
    r.input.cancelAll();
    expect(r.input.active).toBe(false);
    expect(r.input.stick).toEqual({ x: 0, y: 0, mag: 0 });
    expect(r.liveTimers()).toBe(0);
    r.input.touchEnd(2); // the system may still report the lift afterwards
    expect(r.pulses()).toBe(1);
  });

  it('the same finger id can be used again after a cancel', () => {
    const r = rig();
    r.input.touchStart(1, 10, 10);
    r.input.cancelAll();
    r.input.touchStart(1, 10, 10);
    r.advance(30);
    r.input.touchEnd(1);
    expect(r.pulses()).toBe(1);
  });

  it('the keyboard still steers, and the older stick/sonar methods still work', () => {
    const r = rig();
    r.input.setKeys(1, 0);
    expect(r.input.stick.x).toBe(1);
    r.input.setKeys(0, 0);
    r.input.sonarDown(5);
    expect(r.pulses()).toBe(1);
    r.input.stickDown(6, 100, 100);
    r.input.stickMove(6, 140, 100);
    expect(r.input.stick.x).toBeGreaterThan(0.5);
  });
});

describe('screen: no sonar button, a dim joystick, an invisible wave', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

  it('the thresholds and opacities are tunable data, in the specified ranges', () => {
    expect(ECHO_CONFIG.input.tapMaxMs).toBeGreaterThan(100);
    expect(ECHO_CONFIG.input.tapMaxMs).toBeLessThan(400);
    expect(ECHO_CONFIG.input.tapMaxTravelPx).toBeGreaterThanOrEqual(5);
    expect(ECHO_CONFIG.input.stickRestAlpha).toBeGreaterThanOrEqual(0.15);
    expect(ECHO_CONFIG.input.stickRestAlpha).toBeLessThanOrEqual(0.25);
    expect(ECHO_CONFIG.input.stickActiveAlpha).toBeGreaterThanOrEqual(0.15);
    expect(ECHO_CONFIG.input.stickActiveAlpha).toBeLessThanOrEqual(0.3);
  });

  it('the controls draw no sonar button and use one touch zone for everything', () => {
    const src = read('components', 'Controls.tsx');
    expect(src).not.toMatch(/sonar-button|SONAR|sonarButton|sonarHit/);
    expect(src).toMatch(/testID="touch-zone"/);
    expect(src).toMatch(/input\.touchStart\(/);
    expect(src).toMatch(/input\.touchEnd\(/);
  });

  it('the joystick is drawn through the configured low opacity', () => {
    const src = read('components', 'Overlays.tsx');
    expect(src).toMatch(/ECHO_CONFIG\.input\.stickActiveAlpha : ECHO_CONFIG\.input\.stickRestAlpha/);
  });

  it('the expanding wave is not drawn, but the simulation still runs it', () => {
    const view = read('render', 'GameView.tsx');
    expect(view).not.toMatch(/getVisual\('pulse_wave'\)/);
    expect(view).not.toMatch(/<Pulse\b/);
    expect(read('sim', 'game.ts')).toMatch(/this\.waves\.spawn\(/); // still part of the rules
  });

  it('the tutorial no longer talks about a SONAR button or a right-side stick', () => {
    const hints = (loadAuthoredLevel(1, true)!.hints ?? []).map((h) => h.text);
    expect(hints).toContain('Drag anywhere to fly');
    expect(hints).toContain('Tap anywhere to send a pulse');
    expect(hints.join(' ')).not.toMatch(/SONAR|right side/);
  });
});
