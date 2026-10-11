import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SonarWaveEntity } from '../../types/game';
import { PALETTE } from '../../constants/palette';

interface SonarWaveLayerProps {
  waves: SonarWaveEntity[];
  worldWidth: number;
  worldHeight: number;
}

export const SonarWaveLayer: React.FC<SonarWaveLayerProps> = ({
  waves,
  worldWidth,
  worldHeight,
}) => {
  if (waves.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={worldWidth} height={worldHeight}>
        {waves.map((wave) => {
          const r = Math.max(1, wave.currentRadius);
          const rBloom = Math.max(1, wave.currentRadius + 3);
          const rRipple = Math.max(1, wave.currentRadius * 0.84);
          const rFill = Math.max(1, wave.currentRadius * 0.95);

          return (
            <React.Fragment key={wave.id}>
              {/* 1. Translucent expanding aura */}
              <Circle
                cx={wave.origin.x}
                cy={wave.origin.y}
                r={rFill}
                fill={PALETTE.sonarCyan}
                opacity={wave.intensity * 0.08}
              />

              {/* 2. Soft leading glow bloom */}
              <Circle
                cx={wave.origin.x}
                cy={wave.origin.y}
                r={rBloom}
                stroke={PALETTE.sonarCyan}
                strokeWidth={4}
                fill="none"
                opacity={wave.intensity * 0.25}
              />

              {/* 3. Crisp leading edge wavefront */}
              <Circle
                cx={wave.origin.x}
                cy={wave.origin.y}
                r={r}
                stroke={PALETTE.sonarCyan}
                strokeWidth={2.0}
                fill="none"
                opacity={wave.intensity}
              />

              {/* 4. Interference ripple */}
              <Circle
                cx={wave.origin.x}
                cy={wave.origin.y}
                r={rRipple}
                stroke={PALETTE.sonarCyan}
                strokeWidth={1.0}
                strokeDasharray="4, 4"
                fill="none"
                opacity={wave.intensity * 0.4}
              />
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
};
