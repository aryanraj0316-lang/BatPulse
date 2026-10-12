import React, { useEffect, useReducer } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Rect } from 'react-native-svg';
import { FrameBus } from '../game/frameBus';
import { GameSim } from '../sim/game';
import { DEBUG_ENABLED, useDebugFlags } from './debugFlags';

interface Props {
  sim: GameSim;
  bus: FrameBus;
  screenW: number;
  screenH: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  fps: number;
}

/** Hitboxes and FPS counter (dev builds only). Enemy hearing radius is drawn once enemies exist (Phase 3). */
export const DebugOverlay: React.FC<Props> = ({ sim, bus, screenW, screenH, scale, offsetX, offsetY, fps }) => {
  const flags = useDebugFlags();
  const [, redraw] = useReducer((n: number) => (n + 1) | 0, 0);
  useEffect(() => (DEBUG_ENABLED && flags.showHitboxes ? bus.subscribe(redraw) : undefined), [bus, flags.showHitboxes]);
  if (!DEBUG_ENABLED) return null;

  const b = sim.body;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {flags.showHitboxes && (
        <Svg width={screenW} height={screenH}>
          <G transform={`translate(${offsetX} ${offsetY}) scale(${scale})`}>
            {sim.world.solids.map((w, i) => (
              <Rect key={`s${i}`} x={w.x} y={w.y} width={w.width} height={w.height} stroke="#00FF66" strokeWidth={1} fill="none" />
            ))}
            {sim.world.spikes.map((w, i) => (
              <Rect key={`k${i}`} x={w.x} y={w.y} width={w.width} height={w.height} stroke="#FFFF00" strokeWidth={1} fill="none" />
            ))}
            <Circle cx={sim.world.finish.x} cy={sim.world.finish.y} r={sim.world.finish.radius} stroke="#B47DFF" strokeWidth={1} fill="none" />
            <Circle cx={b.x} cy={b.y} r={b.r} stroke="#00FF66" strokeWidth={1} fill="none" />
          </G>
        </Svg>
      )}
      {flags.showFps && (
        <Text style={styles.fps}>
          {fps} FPS{flags.slowMotion ? ' (slow-mo)' : ''}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fps: {
    position: 'absolute',
    right: 8,
    top: 130,
    color: '#00FF66',
    fontSize: 12,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
