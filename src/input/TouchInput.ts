import { ECHO_CONFIG } from '../constants/gameConfig';
import { clampKnob, stickFromDrag, StickOut } from '../sim/joystick';

/**
 * Turns raw multi-touch events into a joystick vector and pulse presses.
 *  - The first finger that lands in the joystick zone owns the stick until it lifts; extra fingers
 *    in that zone are ignored (they cannot steal or jitter the stick).
 *  - Fingers in the SONAR button fire a pulse on touch-DOWN (lowest possible latency), each finger once.
 *  - Joystick and SONAR are independent, so both thumbs work at the same time.
 * Zones are decided by the host (React views), this class only tracks ids. No allocations per move.
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

  private stickId: number | null = null;
  private sonarIds = new Set<number>();

  constructor(
    private onPulse: () => void,
    private radius: number = ECHO_CONFIG.player.joystickRadius,
    private deadZone: number = ECHO_CONFIG.player.joystickDeadZone,
  ) {}

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
