import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import { PlayerEntity } from '../../types/game';
import { PALETTE } from '../../constants/palette';

interface PlayerLayerProps {
  player: PlayerEntity;
  worldWidth: number;
  worldHeight: number;
}

export const PlayerLayer: React.FC<PlayerLayerProps> = ({ player, worldWidth, worldHeight }) => {
  const rotationDeg = (player.rotation * 180) / Math.PI + 90;
  const diameter = player.radius * 2;

  // Momentum arc calculation (thin unlabeled brightening arc around player)
  const momentumRatio = player.momentum / 20; // 0 to 1
  const arcRadius = player.radius + 6;
  const arcAngle = momentumRatio * Math.PI * 2;

  // SVG arc path
  const arcStartX = player.pos.x + Math.sin(0) * arcRadius;
  const arcStartY = player.pos.y - Math.cos(0) * arcRadius;
  const arcEndX = player.pos.x + Math.sin(arcAngle) * arcRadius;
  const arcEndY = player.pos.y - Math.cos(arcAngle) * arcRadius;
  const largeArcFlag = arcAngle > Math.PI ? 1 : 0;

  const arcD =
    momentumRatio > 0.05
      ? `M ${arcStartX} ${arcStartY} A ${arcRadius} ${arcRadius} 0 ${largeArcFlag} 1 ${arcEndX} ${arcEndY}`
      : '';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={worldWidth} height={worldHeight}>
        {/* Momentum Arc (Subtle brightening halo) */}
        {momentumRatio > 0.05 && (
          <Path
            d={arcD}
            stroke={PALETTE.sonarCyan}
            strokeWidth={1.5}
            fill="none"
            opacity={0.3 + momentumRatio * 0.7}
          />
        )}

        {/* Ambient guiding halo */}
        <Circle
          cx={player.pos.x}
          cy={player.pos.y}
          r={player.radius + 3}
          stroke={PALETTE.playerWarm}
          strokeWidth={1}
          fill="none"
          opacity={0.4}
        />

        {/* Directional Beacon Cone & Bat Silhouette */}
        <Path
          d="M16 8 C12 2 4 4 2 12 C6 13 10 11 12 15 C14 18 15 24 16 26 C17 24 18 18 20 15 C22 11 26 13 30 12 C28 4 20 2 16 8 Z"
          fill={PALETTE.playerWarm}
          transform={`translate(${player.pos.x - 16}, ${player.pos.y - 16}) rotate(${rotationDeg}, 16, 16) scale(${player.scale})`}
        />

        {/* Player Core Eye */}
        <Circle
          cx={player.pos.x}
          cy={player.pos.y}
          r={2.5}
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );
};
