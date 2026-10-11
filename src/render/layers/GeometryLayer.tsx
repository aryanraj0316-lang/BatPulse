import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Polygon, Rect } from 'react-native-svg';
import { EnvObject, Rect as WallRect, Vec2, GhostPoint } from '../../types/game';
import { RevealSystem } from '../../engine/RevealSystem';
import { PALETTE } from '../../constants/palette';

interface GeometryLayerProps {
  walls: WallRect[];
  objects: EnvObject[];
  goal: Vec2 & { radius: number; revealedAt: number; revealStrength: number };
  ghostTrack?: GhostPoint[];
  now: number;
  worldWidth: number;
  worldHeight: number;
}

export const GeometryLayer: React.FC<GeometryLayerProps> = ({
  walls,
  objects,
  goal,
  ghostTrack,
  now,
  worldWidth,
  worldHeight,
}) => {
  // Goal reveal
  const goalVis = RevealSystem.getRevealVisuals(
    {
      id: 'goal_beacon',
      revealedAt: goal.revealedAt,
      revealStrength: goal.revealStrength,
      lastPingDistance: 0,
    },
    now
  );

  // Batch walls into combined SVG paths by tier
  let freshPath = '';
  let fadingPath = '';
  let echoPath = '';

  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i];
    const revealedAt = (wall as any).revealedAt || 0;
    if (!revealedAt) continue;

    const vis = RevealSystem.getRevealVisuals(
      {
        id: wall.id,
        revealedAt,
        revealStrength: (wall as any).revealStrength || 1.0,
        lastPingDistance: 0,
      },
      now
    );
    if (vis.opacity <= 0.01) continue;

    const jx = Number.isFinite(vis.jitterX) ? vis.jitterX : 0;
    const jy = Number.isFinite(vis.jitterY) ? vis.jitterY : 0;
    const x = Math.round((wall.x + jx) * 10) / 10;
    const y = Math.round((wall.y + jy) * 10) / 10;
    const w = Math.round(wall.width * 10) / 10;
    const h = Math.round(wall.height * 10) / 10;

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
      continue;
    }

    const rectCmd = `M${x},${y}h${w}v${h}h${-w}Z `;

    if (vis.tier === 'FRESH') {
      freshPath += rectCmd;
    } else if (vis.tier === 'FADING') {
      fadingPath += rectCmd;
    } else if (vis.tier === 'ECHO') {
      echoPath += rectCmd;
    }
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={worldWidth} height={worldHeight}>
        {/* 1. Ghost Replay Trail */}
        {ghostTrack && ghostTrack.length > 1 && (
          ghostTrack.map((pt, i) => {
            if (i === 0) return null;
            const prev = ghostTrack[i - 1];
            return (
              <Line
                key={`ghost_${i}`}
                x1={prev.x}
                y1={prev.y}
                x2={pt.x}
                y2={pt.y}
                stroke={PALETTE.uiGhost}
                strokeWidth={1.2}
                strokeDasharray="2, 4"
                opacity={0.3}
              />
            );
          })
        )}

        {/* 2. Batched Walls */}
        {echoPath.length > 0 && (
          <Path
            d={echoPath}
            stroke={PALETTE.memoryDust}
            strokeWidth={1.0}
            fill="none"
            opacity={0.35}
          />
        )}

        {fadingPath.length > 0 && (
          <Path
            d={fadingPath}
            stroke={PALETTE.echoTeal}
            strokeWidth={1.5}
            fill="rgba(12, 22, 36, 0.3)"
            opacity={0.65}
          />
        )}

        {freshPath.length > 0 && (
          <Path
            d={freshPath}
            stroke={PALETTE.sonarCyan}
            strokeWidth={2.0}
            fill="rgba(12, 22, 36, 0.55)"
            opacity={0.95}
          />
        )}

        {/* 3. Specialized Environment Objects */}
        {objects.map((obj) => {
          if (obj.collected) return null;
          const vis = RevealSystem.getRevealVisuals(obj, now);
          if (vis.opacity <= 0.01) return null;

          const jx = Number.isFinite(vis.jitterX) ? vis.jitterX : 0;
          const jy = Number.isFinite(vis.jitterY) ? vis.jitterY : 0;
          const rx = obj.x + jx;
          const ry = obj.y + jy;

          if (obj.type === 'glass_wall') {
            return (
              <Rect
                key={obj.id}
                x={rx}
                y={ry}
                width={obj.width}
                height={obj.height}
                fill={PALETTE.glassCyan}
                stroke={PALETTE.sonarCyan}
                strokeWidth={1.2}
                strokeDasharray="4, 2"
                opacity={vis.opacity}
              />
            );
          }

          if (obj.type === 'echo_crystal') {
            const cx = rx + obj.width / 2;
            const cy = ry + obj.height / 2;
            return (
              <React.Fragment key={obj.id}>
                <Polygon
                  points={`${cx},${ry} ${rx + obj.width},${cy} ${cx},${ry + obj.height} ${rx},${cy}`}
                  fill={PALETTE.sonarCyan}
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                  opacity={vis.opacity}
                />
                <Circle cx={cx} cy={cy} r={3} fill="#FFFFFF" opacity={vis.opacity} />
              </React.Fragment>
            );
          }

          if (obj.type === 'chasm') {
            return (
              <Rect
                key={obj.id}
                x={rx}
                y={ry}
                width={obj.width}
                height={obj.height}
                fill={PALETTE.chasmDark}
                stroke="rgba(255, 59, 78, 0.4)"
                strokeWidth={1.0}
                strokeDasharray="3, 3"
                opacity={vis.opacity}
              />
            );
          }

          if (obj.type === 'sonar_shard') {
            const cx = rx + obj.width / 2;
            const cy = ry + obj.height / 2;
            return (
              <React.Fragment key={obj.id}>
                <Circle cx={cx} cy={cy} r={obj.width / 2} fill={PALETTE.shardGold} opacity={vis.opacity} />
                <Circle cx={cx} cy={cy} r={obj.width / 2 + 3} stroke={PALETTE.shardGold} strokeWidth={1} fill="none" opacity={vis.opacity * 0.7} />
              </React.Fragment>
            );
          }

          if (obj.type === 'resonance_gate') {
            const isOpen = obj.state === 'open';
            return (
              <Rect
                key={obj.id}
                x={rx}
                y={ry}
                width={obj.width}
                height={obj.height}
                fill={isOpen ? 'transparent' : 'rgba(180, 125, 255, 0.25)'}
                stroke={PALETTE.goalViolet}
                strokeWidth={isOpen ? 1 : 2}
                strokeDasharray={isOpen ? '4, 4' : 'none'}
                opacity={vis.opacity}
              />
            );
          }

          if (obj.type === 'moving_wall') {
            return (
              <Rect
                key={obj.id}
                x={rx}
                y={ry}
                width={obj.width}
                height={obj.height}
                fill="rgba(255, 59, 78, 0.2)"
                stroke={PALETTE.wraithRed}
                strokeWidth={1.8}
                opacity={vis.opacity}
                rx={2}
              />
            );
          }

          return null;
        })}

        {/* 4. Goal Extraction Beacon */}
        {goalVis.opacity > 0.01 && (
          <React.Fragment>
            <Circle cx={goal.x} cy={goal.y} r={goal.radius * 1.8} fill="rgba(180, 125, 255, 0.2)" opacity={goalVis.opacity} />
            <Circle
              cx={goal.x}
              cy={goal.y}
              r={goal.radius}
              stroke={PALETTE.goalViolet}
              strokeWidth={goalVis.strokeWidth}
              strokeDasharray="6, 3"
              fill="none"
              opacity={goalVis.opacity}
            />
            <Circle cx={goal.x} cy={goal.y} r={goal.radius * 0.5} stroke="#FFFFFF" strokeWidth={1.5} fill="none" opacity={goalVis.opacity} />
            <Circle cx={goal.x} cy={goal.y} r={4} fill={PALETTE.goalViolet} opacity={goalVis.opacity} />
          </React.Fragment>
        )}
      </Svg>
    </View>
  );
};
