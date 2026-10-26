import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { SkiaPictureView, Skia, type SkPicture } from '@shopify/react-native-skia';
import { LevelData } from '../types/game';
import { buildDecor } from './art/decor';
import { SceneRenderer, FrameState } from './skia/SceneRenderer';

export interface GameCanvasHandle {
  /** Records and shows one frame. Call from the game loop — no React re-render involved. */
  draw: (fs: FrameState) => void;
}

interface GameCanvasProps {
  level: LevelData;
  worldWidth: number;
  worldHeight: number;
}

/** On web, add `?reveal` to the URL to switch the darkness off (art preview). */
const REVEAL_ALL =
  Platform.OS === 'web' && typeof window !== 'undefined' && /[?&]reveal(&|$)/.test(window.location.search);

/** Skia's native view API (phones only) — lets frames bypass React entirely. */
const NATIVE_VIEW_API: { setJsiProperty: (id: number, name: string, value: unknown) => void; requestRedraw: (id: number) => void } | null =
  Platform.OS !== 'web' && typeof globalThis !== 'undefined' && (globalThis as any).SkiaViewApi?.setJsiProperty
    ? (globalThis as any).SkiaViewApi
    : null;

function emptyPicture(w: number, h: number) {
  const rec = Skia.PictureRecorder();
  rec.beginRecording(Skia.XYWHRect(0, 0, w, h));
  return rec.finishRecordingAsPicture();
}

/**
 * GPU-rendered game view (Skia). The heavy static maze is baked once per level;
 * every frame the game loop calls `draw()` which records a single SkPicture and
 * swaps it into the canvas.
 */
export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(({ level, worldWidth, worldHeight }, ref) => {
  const renderer = useMemo(() => {
    const decor = buildDecor(level, worldWidth, worldHeight);
    return new SceneRenderer(decor, worldWidth, worldHeight, level.seed);
  }, [level, worldWidth, worldHeight]);

  // Web: this small component re-renders per frame to swap the picture.
  // Phones: frames are pushed straight to the native Skia view (no React state at all).
  const [picture, setPicture] = useState<SkPicture>(() => emptyPicture(worldWidth, worldHeight));
  const viewRef = useRef<SkiaPictureView>(null);
  // Pictures that have actually been on screen, oldest first. A picture is freed only
  // after newer ones have replaced it, so the view never draws a freed picture.
  const shown = useRef<SkPicture[]>([]);
  useEffect(() => {
    shown.current.push(picture);
    while (shown.current.length > 3) shown.current.shift()?.dispose();
  }, [picture]);

  useImperativeHandle(
    ref,
    () => ({
      draw: (fs) => {
        const pic = renderer.render({ ...fs, revealAll: fs.revealAll || REVEAL_ALL });
        const api = NATIVE_VIEW_API;
        const view = viewRef.current;
        if (api && view) {
          api.setJsiProperty(view.nativeId, 'picture', pic);
          api.requestRedraw(view.nativeId);
          shown.current.push(pic);
          while (shown.current.length > 3) shown.current.shift()?.dispose();
        } else {
          setPicture(pic);
        }
      },
    }),
    [renderer]
  );

  return (
    // SkiaPictureView just shows the picture we hand it. (Skia's <Canvas> needs a newer
    // native Skia than the one built into Expo Go, so we skip it.)
    <SkiaPictureView
      ref={viewRef}
      picture={picture}
      style={{ position: 'absolute', left: 0, top: 0, width: worldWidth, height: worldHeight }}
      pointerEvents="none"
    />
  );
});
