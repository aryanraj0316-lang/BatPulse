import React, { useEffect, useReducer } from 'react';
import { StyleSheet, View } from 'react-native';
import { VisualKey } from '../assets/keys';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { FrameBus } from '../game/frameBus';
import { GameSim } from '../sim/game';
import { GameView } from './GameView';

interface Props {
  sim: GameSim;
  bus: FrameBus;
  screenW: number;
  screenH: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  batKey: VisualKey;
  brightness: number;
}

const SHAKE_PX = 9;

/**
 * Owns the per-frame redraw: subscribes to the frame bus and re-renders itself (and only itself),
 * so the HUD and menus are not touched 60 times a second.
 */
export const GameCanvas: React.FC<Props> = React.memo(({ sim, bus, screenW, screenH, scale, offsetX, offsetY, batKey, brightness }) => {
  const [, redraw] = useReducer((n: number) => (n + 1) | 0, 0);
  useEffect(() => bus.subscribe(redraw), [bus]);

  const t = Date.now() / 1000;
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
        scale={scale}
        offsetX={offsetX}
        offsetY={offsetY}
        batKey={batKey}
        brightness={brightness}
        time={t}
        shakeX={shakeX}
        shakeY={shakeY}
      />
      {k > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FF3B4E', opacity: 0.28 * k }]} />}
    </View>
  );
});
GameCanvas.displayName = 'GameCanvas';
