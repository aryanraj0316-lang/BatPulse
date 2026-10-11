import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { PlayerEntity } from '../../types/game';
import { PALETTE } from '../../constants/palette';
import { AssetRegistry } from '../../assets/AssetRegistry';
import { VisualKey } from '../../assets/keys';
import { useProgressStore } from '../../state/progressStore';

interface PlayerLayerProps {
  player: PlayerEntity;
  worldWidth: number;
  worldHeight: number;
}

export const PlayerLayer: React.FC<PlayerLayerProps> = ({ player, worldWidth, worldHeight }) => {
  const batKey = useProgressStore((st) => st.selectedCharacter) as VisualKey;
  const Bat = AssetRegistry.getVisual(batKey);
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

        {/* Bat (placeholder or final art, resolved by key). Wings flap at ~8 Hz while moving. */}
        <Bat
          x={player.pos.x}
          y={player.pos.y}
          width={diameter * 2.2 * player.scale}
          height={diameter * 2.2 * player.scale}
          rotation={rotationDeg}
          frame={player.isMoving && Math.floor(Date.now() / 60) % 2 === 1 ? 1 : 0}
          state="idle"
        />
      </Svg>
    </View>
  );
};
