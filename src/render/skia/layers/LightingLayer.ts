import { type SkCanvas } from '@shopify/react-native-skia';
import { RevealZone, Vec2 } from '../../../types/game';
import { THEME, HQ } from '../theme';
import { LevelDecor, LanternDecor } from '../../art/decor';
import { fill, stroke, shaded, rect, rrect, radial, radialAt, linear, additive, blurred } from '../sk';
import { BlendMode } from '@shopify/react-native-skia';

/**
 * LIGHTING — lantern fixtures + their warm additive light, the cyan sonar wash on the
 * floor, and the player-centred vignette. Everything here is cheap gradients, no per-
 * pixel work: a handful of radial shaders reused every frame.
 */

/** Slow, low-amplitude, per-lantern-desynchronised flicker (1 ± ~THEME.lanternFlicker). */
export function lanternFlicker(t: number, seed: number) {
  if (!HQ) return 1;
  const a = Math.sin(t * 0.0041 + seed * 1.7);
  const b = Math.sin(t * 0.0093 + seed * 3.1);
  const c = Math.sin(t * 0.0017 + seed * 0.37);
  return 1 + THEME.lanternFlicker * (a * 0.5 + b * 0.3 + c * 0.2);
}

/** Wall-mounted iron lantern: bracket, frame, glowing amber glass, highlight. */
export function drawLanternFixture(c: SkCanvas, l: LanternDecor, t: number) {
  const fl = lanternFlicker(t, l.seed);
  c.save();
  c.translate(l.x, l.y);
  // bracket plate on the wall + short arm
  c.drawRRect(rrect(-3.2, -6.6, 6.4, 3, 0.8), fill('#1B1F25'));
  c.drawLine(0, -4.2, 0, -2.4, stroke('#2A3038', 1.4, 1, true));
  // soft contact shadow
  c.drawRRect(rrect(-4.6 + 1.2, -3 + 2, 9.2, 9.4, 2), blurred(fill('#000000', 0.6), 1.6, HQ));
  // iron frame
  c.drawRRect(rrect(-4.6, -3, 9.2, 9.4, 2), shaded(linear('lanternFrame', -4.6, -3, 4.6, 6.4, [[0, '#6B737E', 1], [0.5, '#2C323A', 1], [1, '#14181D', 1]])));
  // glass
  c.drawRRect(rrect(-3, -1.4, 6, 6.2, 1), shaded(radialAt('lanternGlass', 0, 1.6, 4.6, [[0, THEME.lanternCore, 1], [0.55, THEME.lanternGlass, 1], [1, '#B35A00', 1]]), Math.min(1, 0.85 * fl + 0.1)));
  // frame bars over the glass
  c.drawLine(0, -1.4, 0, 4.8, stroke('#1B1F25', 0.8));
  c.drawLine(-3, 1.7, 3, 1.7, stroke('#1B1F25', 0.8));
  // cap + tiny highlight
  c.drawRRect(rrect(-3.4, -3.8, 6.8, 1.8, 0.8), fill('#3A414A'));
  c.drawCircle(-1.6, -0.4, 0.7, fill('#FFFFFF', 0.85));
  c.restore();
}

/** Warm light pooling around each lantern (additive: brightens floor + wall tops). */
export function drawLanternLight(c: SkCanvas, decor: LevelDecor, t: number, strength = 1) {
  const R = decor.cellMin * THEME.lanternGlowRadius;
  const pool = radial('lanternPool', [
    [0, THEME.lanternGlowCenter, THEME.lanternGlowStrength],
    [0.22, THEME.lanternGlowMid, THEME.lanternGlowStrength * 0.42],
    [0.55, THEME.lanternGlowMid, THEME.lanternGlowStrength * 0.1],
    [1, THEME.lanternGlowMid, 0],
  ]);
  const hot = radial('lanternHot', [[0, '#FFE6A0', 0.55], [1, '#FFA726', 0]]);
  for (const l of decor.lanterns) {
    const fl = lanternFlicker(t, l.seed);
    c.save();
    c.translate(l.x, l.y + 2);
    c.scale(R * fl, R * fl);
    c.drawCircle(0, 0, 1, additive(shaded(pool, strength), 'plus'));
    c.restore();
    c.save();
    c.translate(l.x, l.y + 1);
    c.scale(11 * fl, 11 * fl);
    c.drawCircle(0, 0, 1, additive(shaded(hot, strength), 'plus'));
    c.restore();
  }
}

/** Cool cyan light washing the floor inside an expanding sonar pulse (additive, under the darkness). */
export function drawSonarFloorLight(c: SkCanvas, zones: { z: RevealZone; r: number; a: number }[], t: number) {
  // smooth fade from the centre outward — no bright band, so no visible circular edge
  const wash = radial('sonarWashSoft', [
    [0, THEME.sonarInner, THEME.sonarFloorTint],
    [0.45, THEME.sonarInner, THEME.sonarFloorTint * 0.6],
    [0.8, THEME.sonarOuter, THEME.sonarFloorTint * 0.2],
    [1, THEME.sonarOuter, 0],
  ]);
  for (const { z, r, a } of zones) {
    if (a <= 0.01 || r < 2) continue;
    const shimmer = HQ ? 1 + 0.03 * Math.sin(t * 0.02 + r * 0.1) : 1;
    c.save();
    c.translate(z.x, z.y);
    c.scale(r * shimmer, r / shimmer);
    c.drawCircle(0, 0, 1, additive(shaded(wash, a), 'plus'));
    c.restore();
  }
}

/** Large player-centred vignette: clear near the bat, falling to near-black at the edges. */
export function drawVignette(c: SkCanvas, center: Vec2, w: number, h: number) {
  if (THEME.vignetteStrength <= 0) return;
  const R = Math.hypot(w, h) * 0.6;
  const sh = radial('vignette2', [
    [0, THEME.vignetteColor, 0],
    [0.42, THEME.vignetteColor, 0],
    [1, THEME.vignetteColor, THEME.vignetteStrength],
  ]);
  c.save();
  c.translate(center.x, center.y);
  c.scale(R, R);
  c.drawRect(rect(-center.x / R, -center.y / R, w / R, h / R), shaded(sh));
  c.restore();
}

/** Soft cyan aura on the floor directly beneath the bat. */
export function drawBatAura(c: SkCanvas, p: Vec2, t: number) {
  const a = THEME.batAuraStrength * (0.9 + 0.1 * Math.sin(t * 0.003));
  c.save();
  c.translate(p.x, p.y + 3);
  c.scale(30, 30);
  c.drawCircle(0, 0, 1, additive(shaded(radial('batAura', [[0, THEME.batAura, 0.8], [0.45, THEME.batAura, 0.25], [1, THEME.batAura, 0]]), a), 'plus'));
  c.restore();
}

/** Baked: warm lantern light tinting the wall stone only (SrcATop keeps it off empty pixels). */
export function drawLanternWallTint(c: SkCanvas, decor: LevelDecor) {
  const R = decor.cellMin * THEME.lanternGlowRadius;
  const sh = radial('lanternWall', [
    [0, THEME.lanternGlowCenter, 0.38],
    [0.4, THEME.lanternGlowMid, 0.14],
    [1, THEME.lanternGlowMid, 0],
  ]);
  for (const l of decor.lanterns) {
    c.save();
    c.translate(l.x, l.y + 2);
    c.scale(R, R);
    const p = shaded(sh);
    p.setBlendMode(BlendMode.SrcATop);
    c.drawCircle(0, 0, 1, p);
    c.restore();
  }
}

/** Live: one small flickering glow per lantern (everything else about the light is baked). */
export function drawLanternFlicker(c: SkCanvas, decor: LevelDecor, t: number) {
  const hot = radial('lanternHot', [[0, '#FFE6A0', 0.55], [1, '#FFA726', 0]]);
  for (const l of decor.lanterns) {
    const fl = lanternFlicker(t, l.seed);
    c.save();
    c.translate(l.x, l.y + 1);
    c.scale(13 * fl, 13 * fl);
    c.drawCircle(0, 0, 1, additive(shaded(hot, 0.4 + (fl - 1) * 4), 'plus'));
    c.restore();
  }
}
