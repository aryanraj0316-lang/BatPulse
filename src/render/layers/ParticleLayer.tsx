import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ImpactSpark } from '../../types/game';
import { PALETTE } from '../../constants/palette';

interface ParticleLayerProps {
  sparks: ImpactSpark[];
  worldWidth: number;
  worldHeight: number;
}

export const ParticleLayer: React.FC<ParticleLayerProps> = ({
  sparks,
  worldWidth,
  worldHeight,
}) => {
  if (sparks.length === 0) return null;

  // Batch all sparks into 1 combined SVG Path
  let pathD = '';
  for (let i = 0; i < sparks.length; i++) {
    const sp = sparks[i];
    const r = Math.max(1, sp.size * (sp.life / sp.maxLife));
    pathD += `M${sp.x - r},${sp.y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 -${r * 2},0 `;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={worldWidth} height={worldHeight}>
        <Path d={pathD} fill={PALETTE.sonarCyan} opacity={0.85} />
      </Svg>
    </View>
  );
};
