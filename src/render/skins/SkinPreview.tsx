import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { SkiaPictureView, Skia, type SkPicture, type SkCanvas } from '@shopify/react-native-skia';
import { drawBatRig } from '../skia/layers/bat';
import { glow, radial, stroke, fill, additive, svgPathOnce, rect, shaded, linear } from '../skia/sk';
import { RARITY_COLOR, type SkinDef } from '../../skins/skins';
import { circleD } from '../art/kit';

const NATIVE_VIEW_API: { setJsiProperty: (id: number, name: string, value: unknown) => void; requestRedraw: (id: number) => void } | null =
  Platform.OS !== 'web' && typeof globalThis !== 'undefined' && (globalThis as any).SkiaViewApi?.setJsiProperty
    ? (globalThis as any).SkiaViewApi
    : null;

interface Props {
  skin: SkinDef;
  width: number;
  height: number;
  /** false = one still frame (cheap thumbnails) */
  animated?: boolean;
  /** draw a darkened silhouette (locked skins) */
  dim?: boolean;
  /** just the bat on a soft aura (tiny icons) */
  bare?: boolean;
}

let _dimPaint: ReturnType<typeof Skia.Paint> | null = null;
function DIM_PAINT() {
  if (!_dimPaint) {
    _dimPaint = Skia.Paint();
    _dimPaint.setColorFilter(Skia.ColorFilter.MakeMatrix([0.22, 0, 0, 0, 0, 0, 0.22, 0, 0, 0, 0, 0, 0.28, 0, 0, 0, 0, 0, 0.92, 0]));
  }
  return _dimPaint;
}

/** A pedestal under a spotlight with the bat hovering above it. */
function drawStage(c: SkCanvas, skin: SkinDef, w: number, h: number, t: number, still: boolean) {
  const rc = RARITY_COLOR[skin.rarity];
  const cx = w / 2;
  const py = h * 0.8;
  const pr = Math.min(w * 0.36, h * 0.42);
  // backdrop glow in the rarity colour + the skin's own aura
  glow(c, radial(`stageBg${rc.main}`, [[0, rc.main, 0.32], [0.5, rc.deep, 0.22], [1, rc.deep, 0]]), cx, h * 0.46, Math.max(w, h) * 0.62, 1);
  glow(c, radial(`stageAura${skin.fx.aura}`, [[0, skin.fx.aura, 0.3], [1, skin.fx.aura, 0]]), cx, h * 0.46, pr * 1.3, 0.7 + (still ? 0 : 0.3 * Math.sin(t * 0.002)));
  // light shaft from above
  const shaft = svgPathOnce(`M${cx - pr * 0.25},0L${cx + pr * 0.25},0L${cx + pr * 0.95},${py}L${cx - pr * 0.95},${py}Z`);
  if (shaft) c.drawPath(shaft, additive(shaded(linear(`shaft${Math.round(py)}${rc.soft}`, 0, 0, 0, py, [[0, rc.soft, 0.0], [0.4, rc.soft, 0.07], [1, rc.soft, 0.12]]))));
  // pedestal: stone disc with a glowing rune ring
  c.save();
  c.translate(cx, py);
  c.scale(1, 0.3);
  c.drawCircle(0, 6 / 0.3, pr, fill('#000000', 0.55));
  c.drawCircle(0, 0, pr, shaded(linear(`ped${Math.round(pr)}`, 0, -pr, 0, pr, [[0, '#3A3F4A', 1], [1, '#0E1014', 1]])));
  c.drawCircle(0, 0, pr, stroke('#5A6170', 2.5, 0.9));
  c.save();
  c.rotate(still ? 0 : t * 0.01, 0, 0);
  c.drawCircle(0, 0, pr * 0.78, additive(stroke(rc.main, 3, 0.55, false, [10, 7])));
  c.restore();
  c.drawCircle(0, 0, pr * 0.62, additive(stroke(skin.fx.glow, 1.6, 0.4)));
  // outer ring of carved ticks, turning the other way
  c.save();
  c.rotate(still ? 0 : -t * 0.006, 0, 0);
  c.drawCircle(0, 0, pr * 0.92, stroke('#8C96A4', 1, 0.5, false, [1.5, 6]));
  c.restore();
  // a pulse of light spreading across the disc
  if (!still) {
    const k = ((t * 0.0004) % 1 + 1) % 1;
    c.drawCircle(0, 0, pr * (0.2 + k * 0.8), additive(stroke(skin.fx.glow, 2, 0.35 * (1 - k))));
  }
  c.restore();
  // three orbs circling the bat (dimmer when behind it)
  if (!still) {
    const oy = h * 0.47;
    for (let i = 0; i < 3; i++) {
      const a = t * 0.0011 + (i / 3) * Math.PI * 2;
      const depth = (Math.sin(a) + 1) / 2;
      const ox = cx + Math.cos(a) * pr * 0.95;
      const oyy = oy + Math.sin(a) * pr * 0.22 - pr * 0.1;
      glow(c, radial(`orb${skin.fx.glow}`, [[0, '#FFFFFF', 0.9], [0.3, skin.fx.glow, 0.6], [1, skin.fx.glow, 0]]), ox, oyy, 6 + depth * 6, 0.25 + depth * 0.6);
    }
  }
  // motes rising off the pedestal
  if (!still) {
    let d = '';
    for (let i = 0; i < 14; i++) {
      const life = ((t * 0.00025 + i / 14) % 1 + 1) % 1;
      const a = i * 2.39;
      const r = pr * (0.3 + 0.6 * ((i * 0.37) % 1));
      d += circleD(cx + Math.cos(a) * r, py - life * h * 0.5, 1 + (1 - life) * 1.2);
    }
    const p = svgPathOnce(d);
    if (p) c.drawPath(p, additive(fill(rc.soft, 0.35)));
  }
}

/** Animated (or still) Skia showcase of one bat skin. */
export const SkinPreview: React.FC<Props> = ({ skin, width, height, animated = true, dim = false, bare = false }) => {
  const viewRef = useRef<SkiaPictureView>(null);
  const shown = useRef<SkPicture[]>([]);
  const phase = useRef(0);
  const last = useRef(0);
  const nextPing = useRef(0);

  const render = (t: number, still: boolean) => {
    const rec = Skia.PictureRecorder();
    const c = rec.beginRecording(Skia.XYWHRect(0, 0, width, height));
    if (bare) glow(c, radial(`bare${skin.fx.aura}`, [[0, skin.fx.aura, 0.35], [1, skin.fx.aura, 0]]), width / 2, height / 2, Math.min(width, height) * 0.5, 1);
    else drawStage(c, skin, width, height, t, still);
    const dt = last.current ? Math.min(0.05, (t - last.current) / 1000) : 0.016;
    last.current = t;
    phase.current += dt * Math.PI * 2 * (still ? 0 : 3.2);
    if (!nextPing.current) nextPing.current = t + 1400;
    if (t > nextPing.current + 3400) nextPing.current = t;
    const pingAge = t - nextPing.current;
    const pingK = !still && pingAge >= 0 && pingAge < 320 ? 1 - pingAge / 320 : 0;
    const k = Math.min(width, height) / (bare ? 27 : still ? 38 : 52);
    const bob = still ? 0 : Math.sin(t * 0.0021) * k * 1.4;
    // locked: draw the bat as a dark silhouette (only the bat, so no box shows in big previews)
    const silhouette = dim && !bare;
    if (silhouette) c.saveLayer(DIM_PAINT());
    drawBatRig(c, {
      key: `preview|${skin.id}|${still ? 's' : 'a'}`,
      x: width / 2,
      y: height * (bare ? 0.55 : still ? 0.48 : 0.5) + bob,
      deg: still ? 0 : Math.sin(t * 0.0007) * 10,
      k,
      phase: still ? 1.1 : phase.current,
      t,
      variant: 'player',
      bank: still ? 0 : Math.sin(t * 0.0007 + 1.2) * 0.35,
      amp: 0.95,
      glide: 0,
      speed: still ? 0 : 0.55,
      react: { pingK, bumpK: 0, pickupK: 0, fear: 0 },
      skin,
    });
    if (silhouette) c.restore();
    else if (dim) c.drawRect(rect(0, 0, width, height), fill('#05070A', 0.62));
    return rec.finishRecordingAsPicture();
  };

  const first = useMemo(() => render(animated ? Date.now() : 1000, !animated), [skin.id, width, height, dim]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picture, setPicture] = useState<SkPicture>(first);
  useEffect(() => setPicture(first), [first]);

  useEffect(() => {
    shown.current.push(picture);
    while (shown.current.length > 3) shown.current.shift()?.dispose();
  }, [picture]);

  useEffect(() => {
    if (!animated) return;
    let alive = true;
    let raf = 0;
    const frame = () => {
      if (!alive) return;
      const pic = render(Date.now(), false);
      const view = viewRef.current;
      if (NATIVE_VIEW_API && view) {
        NATIVE_VIEW_API.setJsiProperty(view.nativeId, 'picture', pic);
        NATIVE_VIEW_API.requestRedraw(view.nativeId);
        shown.current.push(pic);
        while (shown.current.length > 3) shown.current.shift()?.dispose();
      } else {
        setPicture(pic);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [animated, skin.id, width, height, dim]); // eslint-disable-line react-hooks/exhaustive-deps

  return <SkiaPictureView ref={viewRef} picture={picture} style={{ width, height }} pointerEvents="none" />;
};
