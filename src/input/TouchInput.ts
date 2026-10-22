import { ECHO_CONFIG } from '../constants/gameConfig';
import { clampKnob, stickFromDrag, StickOut } from '../sim/joystick';

/** Where a touch stands while the game decides if it is a tap or the start of a drag/hold. */
interface Touch {
  x0: number;
  y0: number;
  x: number;
  y: number;
  t0: number;
  /** Fixed stick centre, or null when the stick appears where the thumb landed. */
  anchor: { x: number; y: number } | null;
  state: 'pending' | 'stick' | 'ignored';
  timer: unknown;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/**
 * Turns raw multi-touch events into a joystick vector and pulse presses.
 *
 * Whole-screen gestures (touchStart / touchMove / touchEnd):
 *  - A quick tap (shorter than `tapMaxMs`, moved less than `tapMaxTravelPx`) sends a pulse when the finger lifts
 *    and never touches the joystick.
 *  - A drag (moved past `tapMaxTravelPx`) or a hold (longer than `tapMaxMs`) takes the joystick, and sends no pulse.
 *  - The first finger that takes the stick owns it until it lifts; extra fingers cannot steal or jitter it.
 *  - While one finger steers, ANY other finger that touches down sends a pulse at once, on touch-down: that finger can
 *    only be the sonar, so there is nothing to wait for (no tap/drag decision, no travel or time limit, no lag).
 *    This is what lets the two thumbs work at the same time.
 *
 * Direct methods (stickDown / stickMove / stickUp, sonarDown / sonarUp) are the low-level API the gestures are built on.
 * Zones are decided by the host (React views); this class only tracks ids. No allocations per move.
 */
export class TouchInput {
  /** Final movement vector (keyboard wins over touch when both are active). Read this every frame. */
  readonly stick: StickOut = { x: 0, y: 0, mag: 0 };
  private readonly touch: StickOut = { x: 0, y: 0, mag: 0 };
  private keyX = 0;
  private keyY = 0;
  /** Where the stick is anchored and where the knob is drawn (screen px). */
  originX = 0;
  originY = 0;
  knobX = 0;
  knobY = 0;
  active = false;
  /** Called when the stick changes without a touch event (a hold that turns into the joystick), so the view can refresh. */
  onChange: (() => void) | null = null;

  private stickId: number | null = null;
  private sonarIds = new Set<number>();
  private touches = new Map<number, Touch>();

  constructor(
    private onPulse: () => void,
    private radius: number = ECHO_CONFIG.player.joystickRadius,
    private deadZone: number = ECHO_CONFIG.player.joystickDeadZone,
    private cfg: { tapMaxMs: number; tapMaxTravelPx: number } = ECHO_CONFIG.input,
    private timers: Timers = realTimers,
    private clock: () => number = Date.now,
  ) {}

  /** A finger touched the screen anywhere. `anchor` = fixed stick centre, null = the stick appears under the thumb. */
  touchStart(id: number, x: number, y: number, anchor: { x: number; y: number } | null = null): void {
    if (this.touches.has(id)) return;
    if (this.stickId !== null) {
      // another finger is steering: this one is the sonar finger. Pulse right now, and keep the touch only so that its
      // later moves and its lift are recognised and ignored.
      this.touches.set(id, { x0: x, y0: y, x, y, t0: this.clock(), anchor, state: 'ignored', timer: null });
      this.onPulse();
      return;
    }
    const t: Touch = { x0: x, y0: y, x, y, t0: this.clock(), anchor, state: 'pending', timer: null };
    // held long enough without lifting: it is not a tap, it is the joystick
    t.timer = this.timers.set(() => this.promote(id), this.cfg.tapMaxMs);
    this.touches.set(id, t);
  }

  touchMove(id: number, x: number, y: number): void {
    const t = this.touches.get(id);
    if (!t) return;
    t.x = x;
    t.y = y;
    if (t.state === 'pending') {
      if (Math.hypot(x - t.x0, y - t.y0) > this.cfg.tapMaxTravelPx) this.promote(id);
    } else if (t.state === 'stick') {
      this.stickMove(id, x, y);
    }
  }

  touchEnd(id: number): void {
    const t = this.touches.get(id);
    if (!t) return;
    this.finish(id, t);
    if (t.state === 'pending') {
      // lifted before it became a drag or a hold: a tap (checked against the clock too, in case the timer is late)
      const quick = this.clock() - t.t0 < this.cfg.tapMaxMs && Math.hypot(t.x - t.x0, t.y - t.y0) <= this.cfg.tapMaxTravelPx;
      if (quick) this.onPulse();
    } else if (t.state === 'stick') {
      this.stickUp(id);
    }
  }

  /** Turns a pending touch into the joystick (or ignores it when another finger already holds the stick). */
  private promote(id: number): void {
    const t = this.touches.get(id);
    if (!t || t.state !== 'pending') return;
    if (t.timer !== null) this.timers.clear(t.timer);
    t.timer = null;
    if (this.stickId !== null) {
      t.state = 'ignored'; // a second drag/hold: no pulse, no stick
      return;
    }
    t.state = 'stick';
    this.stickDown(id, t.anchor ? t.anchor.x : t.x0, t.anchor ? t.anchor.y : t.y0);
    this.stickMove(id, t.x, t.y); // continue from where the finger is now
    this.onChange?.();
  }

  private finish(id: number, t: Touch): void {
    if (t.timer !== null) this.timers.clear(t.timer);
    t.timer = null;
    this.touches.delete(id);
  }

  stickDown(id: number, x: number, y: number): void {
    if (this.stickId !== null) return; // already owned by another finger
    this.stickId = id;
    this.active = true;
    this.originX = x;
    this.originY = y;
    this.knobX = 0;
    this.knobY = 0;
    this.touch.x = 0;
    this.touch.y = 0;
    this.touch.mag = 0;
    this.merge();
  }

  stickMove(id: number, x: number, y: number): void {
    if (id !== this.stickId) return;
    const dx = x - this.originX;
    const dy = y - this.originY;
    stickFromDrag(dx, dy, this.radius, this.deadZone, this.touch);
    const k = clampKnob(dx, dy, this.radius);
    this.knobX = k.x;
    this.knobY = k.y;
    this.merge();
  }

  stickUp(id: number): void {
    if (id !== this.stickId) return;
    this.releaseStick();
  }

  sonarDown(id: number): void {
    if (this.sonarIds.has(id)) return;
    this.sonarIds.add(id);
    this.onPulse();
  }

  sonarUp(id: number): void {
    this.sonarIds.delete(id);
  }

  /** The system took the touches away (call, notification shade, gesture): let go of everything. */
  cancelAll(): void {
    for (const [id, t] of [...this.touches]) this.finish(id, t);
    this.releaseStick();
    this.sonarIds.clear();
  }

  /** Keyboard / gamepad style input (web builds, desktop testing). Values -1..1. */
  setKeys(x: number, y: number): void {
    const m = Math.hypot(x, y);
    this.keyX = m > 1 ? x / m : x;
    this.keyY = m > 1 ? y / m : y;
    this.merge();
  }

  private releaseStick() {
    this.stickId = null;
    this.active = false;
    this.knobX = 0;
    this.knobY = 0;
    this.touch.x = 0;
    this.touch.y = 0;
    this.touch.mag = 0;
    this.merge();
  }

  private merge() {
    if (this.keyX !== 0 || this.keyY !== 0) {
      this.stick.x = this.keyX;
      this.stick.y = this.keyY;
      this.stick.mag = Math.hypot(this.keyX, this.keyY);
    } else {
      this.stick.x = this.touch.x;
      this.stick.y = this.touch.y;
      this.stick.mag = this.touch.mag;
    }
  }
}
