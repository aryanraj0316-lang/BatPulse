import { EnvObject, Rect } from '../types/game';

/**
 * Crusher timing, shared by collision and drawing.
 * A crusher is a strip across a corridor with two jaws that hide in the walls,
 * then slam together in the middle:
 *   open 50% → slam 12% → hold shut 12% → pull back 26%.
 */
export function crusherClosure(o: EnvObject, now: number): { closed: number; warn: number } {
  const cyc = o.cycleDuration || 3200;
  const u = ((((now + (o.phaseOffset || 0)) % cyc) + cyc) % cyc) / cyc;
  let closed = 0;
  if (u >= 0.5 && u < 0.62) {
    const k = (u - 0.5) / 0.12;
    closed = k * k; // accelerating slam
  } else if (u >= 0.62 && u < 0.74) closed = 1;
  else if (u >= 0.74) {
    const k = 1 - (u - 0.74) / 0.26;
    closed = k * k * (3 - 2 * k);
  }
  // warning glow ramps up during the last 0.12 of the open phase
  const warn = u >= 0.38 && u < 0.5 ? (u - 0.38) / 0.12 : closed > 0 ? 1 : 0;
  return { closed, warn };
}

/** The two jaw rectangles right now (zero-sized while fully open). */
export function crusherJaws(o: EnvObject, now: number): [Rect, Rect] {
  const { closed } = crusherClosure(o, now);
  if (o.axis === 'vertical') {
    // corridor runs left↔right: jaws come down from the top and up from the bottom
    const d = (o.height / 2) * closed;
    return [
      { id: `${o.id}_a`, x: o.x, y: o.y, width: o.width, height: d },
      { id: `${o.id}_b`, x: o.x, y: o.y + o.height - d, width: o.width, height: d },
    ];
  }
  const d = (o.width / 2) * closed;
  return [
    { id: `${o.id}_a`, x: o.x, y: o.y, width: d, height: o.height },
    { id: `${o.id}_b`, x: o.x + o.width - d, y: o.y, width: d, height: o.height },
  ];
}
