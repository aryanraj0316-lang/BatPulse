import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { WraithEntity, Vec2 } from '../../types/game';
import { PALETTE } from '../../constants/palette';
import { HunterAI } from '../../engine/HunterAI';

interface WraithLayerProps {
  wraiths: WraithEntity[];
  playerPos: Vec2;
  now: number;
  worldWidth: number;
  worldHeight: number;
}

export const WraithLayer: React.FC<WraithLayerProps> = ({ wraiths, playerPos, now, worldWidth, worldHeight }) => {
    if (wraiths.length === 0) return null;

    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={worldWidth} height={worldHeight}>
          <Defs>
            {/* Red threat edge distortion gradient */}
            <RadialGradient id="wraithThreatFlare" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={PALETTE.wraithRed} stopOpacity="0.8" />
              <Stop offset="60%" stopColor={PALETTE.wraithRed} stopOpacity="0.25" />
              <Stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* 1. Edge-Screen Red Threat Flares (Directional Threat Indicator) */}
          {wraiths.map((wraith) => {
            const distInfo = HunterAI.getDistortionInfo(wraith, playerPos, worldWidth, worldHeight);
            if (!distInfo.active) return null;

            return (
              <Circle
                key={`flare_${wraith.id}`}
                cx={distInfo.edgeX}
                cy={distInfo.edgeY}
                r={24 * distInfo.intensity}
                fill="url(#wraithThreatFlare)"
                opacity={distInfo.intensity * 0.75}
              />
            );
          })}

          {/* 2. Wraith Silhouette (ONLY visible when revealed by sonar wave) */}
          {wraiths.map((wraith) => {
            const timeSinceReveal = now - (wraith.revealedAt || 0);
            if (timeSinceReveal > 600) return null; // Invisible in dark!

            const alpha = Math.max(0, 1.0 - timeSinceReveal / 600);

            return (
              <React.Fragment key={`silhouette_${wraith.id}`}>
                {/* Menacing red aura */}
                <Circle
                  cx={wraith.pos.x}
                  cy={wraith.pos.y}
                  r={wraith.radius + 6}
                  stroke={PALETTE.wraithRed}
                  strokeWidth={1.5}
                  fill="rgba(255, 59, 78, 0.15)"
                  opacity={alpha}
                />

                {/* Predator core silhouette */}
                <Circle
                  cx={wraith.pos.x}
                  cy={wraith.pos.y}
                  r={wraith.radius}
                  fill={PALETTE.wraithRed}
                  opacity={alpha * 0.9}
                />

                {/* Glowing predator eye slit */}
                <Circle
                  cx={wraith.pos.x}
                  cy={wraith.pos.y - 2}
                  r={3}
                  fill="#FFFFFF"
                  opacity={alpha}
                />
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    );
  };
