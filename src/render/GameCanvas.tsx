import React, { useEffect, useReducer } from 'react';
import { StyleSheet, View } from 'react-native';
import { VisualKey } from '../assets/keys';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { FrameBus } from '../game/frameBus';
import { GameSim } from '../sim/game';
import { Viewport, viewOffsetY } from '../sim/world';
import { edgeAlpha } from '../game/jumpGate';
import { GameView } from './GameView';
import { Lod } from './quality';

interface Props {
  sim: GameSim;
  bus: FrameBus;
  screenW: number;
  screenH: number;
  viewport: Viewport;
  batKey: VisualKey;
  brightness: number;
  lod?: Lod;
}

const SHAKE_PX = 9;

/**
 * Owns the per-frame redraw: subscribes to the frame bus and re-renders itself (and only itself),
 * so the HUD and menus are not touched 60 times a second.
 */
export const GameCanvas: React.FC<Props> = React.memo(({ sim, bus, screenW, screenH, viewport, batKey, brightness, lod }) => {
  const [, redraw] = useReducer((n: number) => (n + 1) | 0, 0);
  useEffect(() => bus.subscribe(redraw), [bus]);

  const t = Date.now() / 1000;
  // tall levels scroll: the camera follows the bat
  const offsetY = viewOffsetY(viewport, sim.body.y);
  // decaying jitter while the death shake runs
  const k = sim.shake > 0 ? sim.shake / ECHO_CONFIG.death.shakeSec : 0;
  const shakeX = k * SHAKE_PX * Math.sin(t * 90);
  const shakeY = k * SHAKE_PX * Math.cos(t * 77);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="game-canvas">
      <GameView
        sim={sim}
        screenW={screenW}
        screenH={screenH}
        scale={viewport.scale}
        offsetX={viewport.offsetX}
        offsetY={offsetY}
        batKey={batKey}
        brightness={brightness}
        lod={lod}
        time={t}
        shakeX={shakeX}
        shakeY={shakeY}
      />
      {k > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FF3B4E', opacity: 0.28 * k }]} />}
      {sim.threat > 0 && (
        <View
          testID="threat-edge"
          style={[StyleSheet.absoluteFill, { borderWidth: 6 + 12 * sim.threat, borderColor: '#FF1F3D', opacity: edgeAlpha(sim.threat, sim.beatAge) }]}
        />
      )}
    </View>
  );
});
GameCanvas.displayName = 'GameCanvas';
