import React, { useEffect, useReducer } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { FrameBus } from '../game/frameBus';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { GameSim } from '../sim/game';
import { Viewport, viewOffsetY } from '../sim/world';
import { DEBUG_ENABLED, useDebugFlags } from './debugFlags';

interface Props {
  sim: GameSim;
  bus: FrameBus;
  screenW: number;
  screenH: number;
  viewport: Viewport;
  fps: number;
}

/**
 * Debug drawing (dev builds only): hitboxes, hunter hearing radius + state + target line (so hunter behaviour can be
 * followed frame by frame), and the FPS counter.
 */
export const DebugOverlay: React.FC<Props> = ({ sim, bus, screenW, screenH, viewport, fps }) => {
  const flags = useDebugFlags();
  const [, redraw] = useReducer((n: number) => (n + 1) | 0, 0);
  useEffect(() => (DEBUG_ENABLED && (flags.showHitboxes || flags.showHearing) ? bus.subscribe(redraw) : undefined), [bus, flags.showHitboxes, flags.showHearing]);
  if (!DEBUG_ENABLED) return null;

  const b = sim.body;
  const scale = viewport.scale;
  const offsetX = viewport.offsetX;
  const offsetY = viewOffsetY(viewport, b.y);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {(flags.showHitboxes || flags.showHearing) && (
        <Svg width={screenW} height={screenH}>
          <G transform={`translate(${offsetX} ${offsetY}) scale(${scale})`}>
            {flags.showHearing &&
              sim.enemies.enemies.map((e, i) => (
                <G key={`h${i}`}>
                  <Circle cx={e.body.x} cy={e.body.y} r={sim.hearingRadius} stroke="#FF3B4E" strokeWidth={1} strokeDasharray="6 6" fill="rgba(255,59,78,0.05)" />
                  <Circle cx={e.body.x} cy={e.body.y} r={ECHO_CONFIG.enemy.senseRadius} stroke="#FFAA00" strokeWidth={1} fill="none" />
                  {e.state !== 'patrol' && <Line x1={e.body.x} y1={e.body.y} x2={e.tx} y2={e.ty} stroke="#FFAA00" strokeWidth={1} strokeDasharray="3 3" />}
                  <SvgText x={e.body.x + 20} y={e.body.y - 20} fill="#FFAA00" fontSize={11}>{e.state}</SvgText>
                </G>
              ))}
            {flags.showHitboxes && sim.world.solids.map((w, i) => (
              <Rect key={`s${i}`} x={w.x} y={w.y} width={w.width} height={w.height} stroke="#00FF66" strokeWidth={1} fill="none" />
            ))}
            {flags.showHitboxes && sim.world.spikes.map((w, i) => (
              <Rect key={`k${i}`} x={w.x} y={w.y} width={w.width} height={w.height} stroke="#FFFF00" strokeWidth={1} fill="none" />
            ))}
            {flags.showHitboxes && <Circle cx={sim.world.finish.x} cy={sim.world.finish.y} r={sim.world.finish.radius} stroke="#B47DFF" strokeWidth={1} fill="none" />}
            {flags.showHitboxes && <Circle cx={b.x} cy={b.y} r={b.r} stroke="#00FF66" strokeWidth={1} fill="none" />}
            {flags.showHitboxes && sim.enemies.enemies.map((e, i) => <Circle key={`eb${i}`} cx={e.body.x} cy={e.body.y} r={e.body.r} stroke="#FF3B4E" strokeWidth={1} fill="none" />)}
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
