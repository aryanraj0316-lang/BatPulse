import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Circle } from 'react-native-svg';
import { PALETTE } from '../../constants/palette';
import { Vec2 } from '../../types/game';

interface DarknessLayerProps {
  playerPos: Vec2;
  worldWidth: number;
  worldHeight: number;
  isHunting: boolean;
}

export const DarknessLayer: React.FC<DarknessLayerProps> = ({
  playerPos,
  worldWidth,
  worldHeight,
  isHunting,
}) => {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={worldWidth} height={worldHeight}>
        {/* Base void darkness background */}
        <Rect x={0} y={0} width={worldWidth} height={worldHeight} fill={PALETTE.voidBlack} />

        {/* Ambient player subtle visibility aura (pure circles, no shader recompilation) */}
        <Circle
          cx={playerPos.x}
          cy={playerPos.y}
          r={70}
          fill={PALETTE.abyss}
          opacity={0.7}
        />
        <Circle
          cx={playerPos.x}
          cy={playerPos.y}
          r={35}
          fill="rgba(77, 240, 255, 0.04)"
        />

        {/* Threat boundary frame when hunting */}
        {isHunting && (
          <Rect
            x={0}
            y={0}
            width={worldWidth}
            height={worldHeight}
            stroke={PALETTE.wraithRed}
            strokeWidth={3}
            fill="rgba(255, 59, 78, 0.05)"
          />
        )}
      </Svg>
    </View>
  );
};
