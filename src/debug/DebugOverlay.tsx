import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { EnvObject, PlayerEntity, Rect as WallRect, WraithEntity } from '../types/game';
import { GAME_CONFIG } from '../constants/gameConfig';
import { DEBUG_ENABLED, useDebugFlags } from './debugFlags';

interface Props {
  width: number;
  height: number;
  player: PlayerEntity;
  walls: WallRect[];
  objects: EnvObject[];
  wraiths: WraithEntity[];
  fps: number;
}

/** Hitboxes, enemy hearing radius and FPS counter. Renders nothing in release builds. */
export const DebugOverlay: React.FC<Props> = ({ width, height, player, walls, objects, wraiths, fps }) => {
  const flags = useDebugFlags();
  if (!DEBUG_ENABLED) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {(flags.showHitboxes || flags.showHearing) && (
        <Svg width={width} height={height}>
          {flags.showHitboxes && (
            <>
              {walls.map((w) => (
                <Rect key={w.id} x={w.x} y={w.y} width={w.width} height={w.height} stroke="#00FF66" strokeWidth={1} fill="none" />
              ))}
              {objects.map((o) => (
                <Rect key={o.id} x={o.x} y={o.y} width={o.width} height={o.height} stroke="#FFFF00" strokeWidth={1} fill="none" />
              ))}
              <Circle cx={player.pos.x} cy={player.pos.y} r={player.radius} stroke="#00FF66" strokeWidth={1} fill="none" />
              {wraiths.map((w) => (
                <Circle key={`hb${w.id}`} cx={w.pos.x} cy={w.pos.y} r={w.radius} stroke="#FF3B4E" strokeWidth={1} fill="none" />
              ))}
            </>
          )}
          {flags.showHearing &&
            wraiths.map((w) => (
              <Circle
                key={`hr${w.id}`}
                cx={w.pos.x}
                cy={w.pos.y}
                r={GAME_CONFIG.HUNTER_HEARING_RADIUS}
                stroke="#FF3B4E"
                strokeWidth={1}
                strokeDasharray="6 6"
                fill="rgba(255,59,78,0.05)"
              />
            ))}
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
    top: 90,
    color: '#00FF66',
    fontSize: 12,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
