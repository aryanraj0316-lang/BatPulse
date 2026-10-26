import { type SkCanvas } from '@shopify/react-native-skia';
import { RevealZone, ImpactSpark, AmbientDust } from '../../../types/game';
import { THEME, HQ } from '../theme';
import { ART, circleD } from '../../art/kit';
import { fill, stroke, shaded, svgPathOnce, mix, linear, additive, blurred, radial } from '../sk';

/**
 * ENTITIES & EFFECTS above the darkness: enemy vision cones, sonar rings,
 * returning echo sparks and dust. (The bats themselves live in ./bat.ts.)
 */

/** Forward-facing red wedge from an enemy, feathered, tinting the floor. Drawn under the enemy bat. */
export function drawVisionCone(c: SkCanvas, x: number, y: number, deg: number, alpha: number, t: number, frenzy: boolean) {
  const L = THEME.coneLength;
  const half = (THEME.coneHalfAngleDeg * Math.PI) / 180;
  const sx = Math.sin(half) * L;
  const cy = -Math.cos(half) * L;
  const wedge = svgPathOnce(`M0,0L${(-sx).toFixed(1)},${cy.toFixed(1)}A${L},${L} 0 0 1 ${sx.toFixed(1)},${cy.toFixed(1)}Z`);
  if (!wedge) return;
  const pulse = frenzy ? 0.8 + 0.2 * Math.sin(t * 0.03) : 1;
  const grad = linear(`cone${L}`, 0, 0, 0, -L, [
    [0, THEME.coneColor, THEME.coneOpacity],
    [0.55, THEME.coneColor, THEME.coneOpacity * 0.4],
    [1, THEME.coneColor, 0],
  ]);
  c.save();
  c.translate(x, y);
  c.rotate(deg, 0, 0);
  // red light falling on the floor (additive), then the feathered wedge itself
  c.drawPath(wedge, additive(shaded(grad, 0.45 * alpha * pulse)));
  c.drawPath(wedge, shaded(grad, alpha * pulse));
  // brighter source right at the eyes
  c.save();
  c.scale(10, 10);
  c.drawCircle(0, 0, 1, additive(shaded(radial('coneSrc', [[0, THEME.enemyRim, 0.6], [1, THEME.enemyRim, 0]]), alpha)));
  c.restore();
  c.restore();
}

/** Soft concentric sonar rings: cyan leading edge shifting to deep blue as they widen. */
export function drawSonarRings(c: SkCanvas, zones: { z: RevealZone; r: number; life: number }[], t: number) {
  for (const { z, r, life } of zones) {
    if (life <= 0 || r < 2) continue;
    const widen = Math.min(1, r / z.maxRadius);
    for (let i = 0; i < THEME.sonarRingCount; i++) {
      const rr = r * (1 - i * 0.17);
      if (rr < 2) continue;
      const a = life * z.intensity * (1 - i * 0.28);
      const col = mix(THEME.sonarInner, THEME.sonarOuter, widen * 0.8 + i * 0.12);
      // glow body of the ring
      const glowP = blurred(stroke('#000000', i === 0 ? 3 : 2, 1, false), THEME.sonarRingBlur, HQ);
      glowP.setColor(col);
      glowP.setAlphaf(Math.min(1, a * 0.75));
      c.drawCircle(z.x, z.y, rr, additive(glowP));
      // faint bright core on the leading ring only (still soft, no hard edge)
      if (i === 0) {
        const core = blurred(stroke('#000000', 1, 1, false), 0.8, HQ);
        core.setColor(mix('#CFFBFF', THEME.sonarInner, widen));
        core.setAlphaf(Math.min(1, a * 0.55));
        c.drawCircle(z.x, z.y, rr, additive(core));
      }
    }
    // gentle bloom at the origin right after the call
    const flash = Math.max(0, 1 - (t - z.createdAt) / 260);
    if (flash > 0) {
      c.save();
      c.translate(z.x, z.y);
      c.scale(16 + (1 - flash) * 18, 16 + (1 - flash) * 18);
      c.drawCircle(0, 0, 1, additive(shaded(radial('sonarFlash', [[0, THEME.sonarInner, 0.8], [1, THEME.sonarInner, 0]]), flash)));
      c.restore();
    }
  }
}

/** Returning echo sparks (batched by colour) + floating dust motes. */
export function drawSparksAndDust(c: SkCanvas, sparks: ImpactSpark[], dust: AmbientDust[]) {
  const buckets = new Map<string, { halo: string; core: string }>();
  for (const sp of sparks) {
    let b = buckets.get(sp.color);
    if (!b) buckets.set(sp.color, (b = { halo: '', core: '' }));
    const r = Math.max(0.6, sp.size * (sp.life / sp.maxLife));
    b.halo += circleD(sp.x, sp.y, r * 2.6);
    b.core += circleD(sp.x, sp.y, r);
  }
  buckets.forEach((b, color) => {
    const halo = svgPathOnce(b.halo);
    const core = svgPathOnce(b.core);
    if (halo) c.drawPath(halo, additive(fill(color, 0.22)));
    if (core) c.drawPath(core, additive(fill(color === ART.wraithRed ? ART.wraithHot : '#E8FDFF', 0.95)));
  });
  let dimD = '';
  let litD = '';
  for (const d of dust) {
    if (d.ignitedTimer > 0) litD += circleD(d.x, d.y, d.size * 1.4);
    else dimD += circleD(d.x, d.y, d.size * 0.8);
  }
  const dim = svgPathOnce(dimD);
  const lit = svgPathOnce(litD);
  if (dim) c.drawPath(dim, fill('#C8E6FF', 0.1));
  if (lit) c.drawPath(lit, additive(fill(THEME.sonarInner, 0.7)));
}
