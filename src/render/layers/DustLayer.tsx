import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AmbientDust } from '../../types/game';
import { PALETTE } from '../../constants/palette';

interface DustLayerProps {
  dustParticles: AmbientDust[];
  worldWidth: number;
  worldHeight: number;
}

export const DustLayer: React.FC<DustLayerProps> = ({
  dustParticles,
  worldWidth,
  worldHeight,
}) => {
  let pathNormal = '';
  let pathIgnited = '';

  for (let i = 0; i < dustParticles.length; i++) {
    const d = dustParticles[i];
    const isIgnited = d.ignitedTimer > 0;
    const r = isIgnited ? d.size * 1.5 : d.size;
    const cmd = `M${d.x - r},${d.y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 -${r * 2},0 `;
    if (isIgnited) {
      pathIgnited += cmd;
    } else {
      pathNormal += cmd;
    }
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={worldWidth} height={worldHeight}>
        {pathNormal.length > 0 && (
          <Path d={pathNormal} fill="rgba(200, 230, 255, 0.4)" opacity={0.12} />
        )}
        {pathIgnited.length > 0 && (
          <Path d={pathIgnited} fill={PALETTE.dustActive} opacity={0.75} />
        )}
      </Svg>
    </View>
  );
};
