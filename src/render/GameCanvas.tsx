import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  PlayerEntity,
  Rect as WallRect,
  EnvObject,
  Vec2,
  SonarWaveEntity,
  ImpactSpark,
  AmbientDust,
  WraithEntity,
  GhostPoint,
} from '../types/game';
import { DarknessLayer } from './layers/DarknessLayer';
import { GeometryLayer } from './layers/GeometryLayer';
import { SonarWaveLayer } from './layers/SonarWaveLayer';
import { ParticleLayer } from './layers/ParticleLayer';
import { DustLayer } from './layers/DustLayer';
import { PlayerLayer } from './layers/PlayerLayer';
import { WraithLayer } from './layers/WraithLayer';

interface GameCanvasProps {
  player: PlayerEntity;
  walls: WallRect[];
  objects: EnvObject[];
  goal: Vec2 & { radius: number; revealedAt: number; revealStrength: number };
  waves: SonarWaveEntity[];
  sparks: ImpactSpark[];
  dustParticles: AmbientDust[];
  wraiths: WraithEntity[];
  ghostTrack?: GhostPoint[];
  now: number;
  worldWidth: number;
  worldHeight: number;
  isHunting: boolean;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
    player,
    walls,
    objects,
    goal,
    waves,
    sparks,
    dustParticles,
    wraiths,
    ghostTrack,
    now,
    worldWidth,
    worldHeight,
    isHunting,
  }) => {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Layer 1: Ambient Darkness & Threat Vignette */}
        <DarknessLayer
          playerPos={player.pos}
          worldWidth={worldWidth}
          worldHeight={worldHeight}
          isHunting={isHunting}
        />

        {/* Layer 2: Geometry (Walls, Glass, Crystals, Chasms, Goal) */}
        <GeometryLayer
          walls={walls}
          objects={objects}
          goal={goal}
          ghostTrack={ghostTrack}
          now={now}
          worldWidth={worldWidth}
          worldHeight={worldHeight}
        />

        {/* Layer 3: Sonar 4-Layer Expanding Waves */}
        <SonarWaveLayer waves={waves} worldWidth={worldWidth} worldHeight={worldHeight} />

        {/* Layer 4: Returning Impact Sparks & Reverberations */}
        <ParticleLayer sparks={sparks} worldWidth={worldWidth} worldHeight={worldHeight} />

        {/* Layer 5: Ambient Drifting Dust Particles */}
        <DustLayer dustParticles={dustParticles} worldWidth={worldWidth} worldHeight={worldHeight} />

        {/* Layer 6: Player Bat Core & Momentum Arc */}
        <PlayerLayer player={player} worldWidth={worldWidth} worldHeight={worldHeight} />

        {/* Layer 7: Wraith Edge Flares & Detected Silhouettes */}
        <WraithLayer
          wraiths={wraiths}
          playerPos={player.pos}
          now={now}
          worldWidth={worldWidth}
          worldHeight={worldHeight}
        />
      </View>
    );
  };

