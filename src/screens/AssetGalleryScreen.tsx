import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SkiaPictureView, Skia } from '@shopify/react-native-skia';
import { PixelRatio } from 'react-native';
import { ART, makeRng } from '../render/art/kit';
import { makeBush, makeVine } from '../render/art/decor';
import { fill, stroke, glow, G } from '../render/skia/sk';
import {
  drawBat,
  drawCone,
  drawLantern,
  drawLanternGlow,
  drawKey,
  drawEnergyOrb,
  drawExitPad,
  drawCrystal,
  drawForceField,
  drawWaterPool,
  drawCrate,
  drawBarrel,
  drawRocks,
  drawBones,
  drawGrate,
  drawSpikeBlock,
  drawPortcullis,
  drawPressurePlate,
  bake,
  paintBush,
  paintVine,
  drawSprite,
} from '../render/skia/sprites';
import { drawJoystick } from '../render/skia/SceneRenderer';
import { drawBatRig } from '../render/skia/layers/bat';
import { drawVisionCone } from '../render/skia/layers/EntityLayer';
import { drawLaser, drawEnergyCore, drawCrystalHQ, drawWater, drawGrateHQ } from '../render/skia/layers/HazardLayer';
import { drawSpikeBed } from '../render/skia/layers/FloorLayer';
import { drawLanternFixture, drawBatAura } from '../render/skia/layers/LightingLayer';
import type { SkCanvas } from '@shopify/react-native-skia';

const S = 120;
const GAP = 14;
const COLS = 3;

type Tile = { label: string; draw: (c: SkCanvas, t: number) => void };

/** Dev preview of every game asset, animated. Open the web build with `?gallery`. */
export const AssetGalleryScreen: React.FC = () => {
  const flora = useMemo(() => {
    const rng = makeRng(42);
    const scale = Math.min(2.5, PixelRatio.get());
    const bush = makeBush(rng, 0, 0, 18);
    const tree = makeBush(rng, 0, 0, 40);
    const vine = makeVine(rng, 0, 0, 34);
    return {
      bush: bake(bush.r * 1.35 + 4, scale, (c) => paintBush(c, bush)),
      tree: bake(tree.r * 1.35 + 4, scale, (c) => paintBush(c, tree)),
      vine: bake(22, scale, (c) => paintVine(c, vine)),
    };
  }, []);

  const tiles: Tile[] = useMemo(
    () => [
      {
        label: 'Player bat (flying)',
        draw: (c, t) => {
          drawBatAura(c, { x: 60, y: 60 }, t);
          drawBatRig(c, { key: 'g_fly', x: 60, y: 60, deg: Math.sin(t * 0.0008) * 20, k: 1.7, phase: t * 0.026, t, variant: 'player', amp: 1, speed: 0.6, bank: Math.sin(t * 0.0008) * 0.6 });
        },
      },
      {
        label: 'Bat: sonar call / bump / pickup',
        draw: (c, t) => {
          const cyc = t % 4500;
          const k = (s: number, len: number) => Math.max(0, 1 - Math.max(0, cyc - s) / len) * (cyc >= s ? 1 : 0);
          drawBatRig(c, { key: 'g_react', x: 60, y: 62, deg: 0, k: 1.6, phase: t * 0.024, t, variant: 'player', amp: 0.8, react: { pingK: k(0, 320), bumpK: k(1500, 300), pickupK: k(3000, 700), fear: 0 } });
        },
      },
      {
        label: 'Bat: scared / hovering',
        draw: (c, t) => drawBatRig(c, { key: 'g_fear', x: 60, y: 62, deg: 0, k: 1.6, phase: t * 0.04, t, variant: 'player', amp: 0.6, speed: 0, react: { pingK: 0, bumpK: 0, pickupK: 0, fear: 0.5 + 0.5 * Math.sin(t * 0.002) } }),
      },
      {
        label: 'Bat: gliding',
        draw: (c, t) => drawBatRig(c, { key: 'g_glide', x: 60, y: 60, deg: 0, k: 1.6, phase: t * 0.01, t, variant: 'player', amp: 1, glide: 1, speed: 1 }),
      },
      {
        label: 'Wraith + vision cone',
        draw: (c, t) => {
          const look = Math.sin(t * 0.0012) * 30;
          drawVisionCone(c, 60, 82, look, 1, t, false);
          drawBatRig(c, { key: 'g_wraith', x: 60, y: 82, deg: look, k: 1.2, phase: t * 0.024, t, variant: 'wraith', amp: 1 });
        },
      },
      {
        label: 'Wraith frenzy',
        draw: (c, t) => drawBatRig(c, { key: 'g_frenzy', x: 60, y: 60, deg: (t * 0.2) % 360, k: 1.2, phase: t * 0.05, t, variant: 'wraith', frenzy: true, amp: 1, speed: 1 }),
      },
      {
        label: 'Lantern',
        draw: (c, t) => drawLanternFixture(c, { x: 60, y: 60, seed: 3 }, t),
      },
      { label: 'Energy core (+1 pulse)', draw: (c, t) => drawEnergyCore(c, 60, 60, t) },
      { label: 'Exit (unlocked)', draw: (c, t) => drawExitPad(c, 60, 60, 50, t, false) },
      { label: 'Exit (locked)', draw: (c, t) => drawExitPad(c, 60, 60, 50, t, true) },
      { label: 'Echo crystal', draw: (c, t) => drawCrystalHQ(c, 60, 60, t, t % 2400) },
      { label: 'Laser barrier', draw: (c, t) => drawLaser(c, 56, 14, 8, 92, t) },
      { label: 'Water pit', draw: (c, t) => drawWater(c, 24, 24, 72, 72, t, 1.3) },
      { label: 'Spike bed (decor)', draw: (c) => drawSpikeBed(c, { x: 30, y: 36, w: 60, h: 48 }) },
      { label: 'Spike block', draw: (c) => drawSpikeBlock(c, 32, 39, 56, 42) },
      { label: 'Portcullis', draw: (c, t) => drawPortcullis(c, 56, 20, 8, 80, false, t) },
      { label: 'Pressure plate', draw: (c, t) => drawPressurePlate(c, 40, 40, 40, 40, t, t % 2000) },
      { label: 'Crate', draw: (c) => drawCrate(c, 60, 60, 36, 0.15) },
      { label: 'Barrel', draw: (c) => drawBarrel(c, 60, 60, 20) },
      { label: 'Rocks', draw: (c) => drawRocks(c, 60, 60, 40, 7.7) },
      { label: 'Bones', draw: (c) => drawBones(c, 60, 60, 30, 0.3) },
      { label: 'Floor grate', draw: (c, t) => drawGrateHQ(c, 60, 60, 44, t, 2) },
      { label: 'Bush', draw: (c, t) => flora.bush && drawSprite(c, flora.bush, 60, 60, Math.sin(t * 0.0011) * 2.4) },
      { label: 'Tree canopy', draw: (c, t) => flora.tree && drawSprite(c, flora.tree, 60, 60, Math.sin(t * 0.0011) * 2.4) },
      { label: 'Vine', draw: (c, t) => flora.vine && drawSprite(c, flora.vine, 60, 40, Math.sin(t * 0.0014) * 5) },
      {
        label: 'Joystick',
        draw: (c, t) =>
          drawJoystick(c, {
            center: { x: 60, y: 60 },
            knob: { x: Math.cos(t * 0.002) * 30, y: Math.sin(t * 0.002) * 30 },
            active: true,
            radius: 44,
          }),
      },
    ],
    [flora]
  );

  const rows = Math.ceil(tiles.length / COLS);
  const W = COLS * S + (COLS - 1) * GAP;
  const H = rows * (S + 30);

  const [picture, setPicture] = useState(() => {
    const r = Skia.PictureRecorder();
    r.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
    return r.finishRecordingAsPicture();
  });

  useEffect(() => {
    let id = 0;
    const recorder = Skia.PictureRecorder();
    const loop = () => {
      const t = Date.now();
      const c = recorder.beginRecording(Skia.XYWHRect(0, 0, W, H));
      tiles.forEach((tile, i) => {
        const x = (i % COLS) * (S + GAP);
        const y = Math.floor(i / COLS) * (S + 30);
        c.save();
        c.translate(x, y);
        c.drawCircle(60, 60, 58, fill('#0F1215'));
        tile.draw(c, t);
        c.restore();
      });
      setPicture(recorder.finishRecordingAsPicture());
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [tiles, W, H]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>BAT PULSE · ASSETS</Text>
      <View style={{ width: W, height: H }}>
        <SkiaPictureView picture={picture} style={{ width: W, height: H }} />
        {tiles.map((tile, i) => (
          <Text
            key={tile.label}
            style={[styles.label, { left: (i % COLS) * (S + GAP), top: Math.floor(i / COLS) * (S + 30) + S + 4 }]}
          >
            {tile.label}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05070A' },
  content: { alignItems: 'center', paddingVertical: 10 },
  title: { color: ART.cyan, fontWeight: '800', letterSpacing: 4, marginVertical: 10 },
  label: { position: 'absolute', width: S, textAlign: 'center', color: '#8FA3B8', fontSize: 10, letterSpacing: 1 },
});
