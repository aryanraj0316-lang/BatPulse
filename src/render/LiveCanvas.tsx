import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SkiaPictureView, Skia, type SkPicture, type SkCanvas } from '@shopify/react-native-skia';

const NATIVE_VIEW_API: { setJsiProperty: (id: number, name: string, value: unknown) => void; requestRedraw: (id: number) => void } | null =
  Platform.OS !== 'web' && typeof globalThis !== 'undefined' && (globalThis as any).SkiaViewApi?.setJsiProperty
    ? (globalThis as any).SkiaViewApi
    : null;

interface Props {
  width: number;
  height: number;
  /** draws one frame; `t` = ms timestamp */
  draw: (c: SkCanvas, t: number, w: number, h: number) => void;
  /** false = draw once */
  animated?: boolean;
  /** cap the frame rate (menus don't need 60fps) */
  fps?: number;
  /** redraw when any of these change */
  deps?: unknown[];
  style?: StyleProp<ViewStyle>;
}

/**
 * Small animated Skia surface for menus. Each frame is recorded into a picture and pushed
 * straight to the native view (no React re-render on device).
 */
export const LiveCanvas: React.FC<Props> = ({ width, height, draw, animated = true, fps = 60, deps = [], style }) => {
  const viewRef = useRef<SkiaPictureView>(null);
  const shown = useRef<SkPicture[]>([]);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const render = (t: number) => {
    const rec = Skia.PictureRecorder();
    const c = rec.beginRecording(Skia.XYWHRect(0, 0, width, height));
    drawRef.current(c, t, width, height);
    return rec.finishRecordingAsPicture();
  };

  const first = useMemo(() => render(Date.now()), [width, height, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
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
    let last = 0;
    const minGap = 1000 / fps - 2;
    const frame = () => {
      if (!alive) return;
      const now = Date.now();
      if (now - last >= minGap) {
        last = now;
        const pic = render(now);
        const view = viewRef.current;
        if (NATIVE_VIEW_API && view) {
          NATIVE_VIEW_API.setJsiProperty(view.nativeId, 'picture', pic);
          NATIVE_VIEW_API.requestRedraw(view.nativeId);
          shown.current.push(pic);
          while (shown.current.length > 3) shown.current.shift()?.dispose();
        } else {
          setPicture(pic);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [animated, width, height, fps, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  return <SkiaPictureView ref={viewRef} picture={picture} style={StyleSheet.flatten([{ width, height }, style])} pointerEvents="none" />;
};
