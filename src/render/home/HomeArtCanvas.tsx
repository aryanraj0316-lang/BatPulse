import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { SkiaPictureView, Skia, type SkPicture, type SkImage } from '@shopify/react-native-skia';
import { HomeScene } from './HomeScene';

const NATIVE_VIEW_API: { setJsiProperty: (id: number, name: string, value: unknown) => void; requestRedraw: (id: number) => void } | null =
  Platform.OS !== 'web' && typeof globalThis !== 'undefined' && (globalThis as any).SkiaViewApi?.setJsiProperty
    ? (globalThis as any).SkiaViewApi
    : null;

const BAT_SPRITE = require('../../../assets/images/home-bat.png');

let cachedBat: SkImage | null = null;
async function loadBat(): Promise<SkImage | null> {
  if (cachedBat) return cachedBat;
  const asset = Asset.fromModule(BAT_SPRITE);
  await asset.downloadAsync();
  const data = await Skia.Data.fromURI(asset.localUri ?? asset.uri);
  cachedBat = Skia.Image.MakeImageFromEncoded(data);
  return cachedBat;
}

export interface HomeArtHandle {
  flap: () => void;
}

interface Props {
  width: number;
  height: number;
  /** art → screen mapping */
  scale: number;
  offsetX: number;
  offsetY: number;
  /** called once the bat sprite is drawn (so the static painting can hide nothing until then) */
  onReady?: () => void;
}

function emptyPicture(w: number, h: number) {
  const rec = Skia.PictureRecorder();
  rec.beginRecording(Skia.XYWHRect(0, 0, w, h));
  return rec.finishRecordingAsPicture();
}

/** The living part of the home screen: hero bat, enemy bats, lantern/orb light, dust. */
export const HomeArtCanvas = forwardRef<HomeArtHandle, Props>(({ width, height, scale, offsetX, offsetY, onReady }, ref) => {
  const [picture, setPicture] = useState<SkPicture>(() => emptyPicture(width, height));
  const viewRef = useRef<SkiaPictureView>(null);
  const sceneRef = useRef<HomeScene | null>(null);
  const t0 = useRef(Date.now());
  const shown = useRef<SkPicture[]>([]);
  const geo = useRef({ scale, offsetX, offsetY, width, height });
  geo.current = { scale, offsetX, offsetY, width, height };

  useImperativeHandle(ref, () => ({
    flap: () => sceneRef.current?.flap((Date.now() - t0.current) / 1000),
  }));

  useEffect(() => {
    shown.current.push(picture);
    while (shown.current.length > 3) shown.current.shift()?.dispose();
  }, [picture]);

  useEffect(() => {
    let alive = true;
    let raf = 0;
    let readySent = false;

    const frame = () => {
      if (!alive) return;
      const scene = sceneRef.current;
      if (scene) {
        const g = geo.current;
        const rec = Skia.PictureRecorder();
        const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, g.width, g.height));
        canvas.save();
        canvas.translate(g.offsetX, g.offsetY);
        canvas.scale(g.scale, g.scale);
        scene.draw(canvas, (Date.now() - t0.current) / 1000);
        canvas.restore();
        const pic = rec.finishRecordingAsPicture();
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
        if (!readySent) {
          readySent = true;
          onReady?.();
        }
      }
      raf = requestAnimationFrame(frame);
    };

    loadBat()
      .then((img) => {
        if (!alive || !img) return;
        sceneRef.current = new HomeScene(img);
      })
      .catch((e) => console.warn('[BatPulse] home art failed to load', e));
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SkiaPictureView
      ref={viewRef}
      picture={picture}
      style={{ position: 'absolute', left: 0, top: 0, width, height }}
      pointerEvents="none"
    />
  );
});
