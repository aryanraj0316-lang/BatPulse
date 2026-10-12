import React from 'react';
import Svg, { G, Rect } from 'react-native-svg';
import { AssetRegistry } from '../assets/AssetRegistry';
import { VisualKey } from '../assets/keys';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { GameSim } from '../sim/game';
import { Revealable } from '../sim/world';

interface Props {
  sim: GameSim;
  screenW: number;
  screenH: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  /** Bat visual key (selected character). */
  batKey: VisualKey;
  brightness: number;
  /** Seconds, drives idle animations. */
  time: number;
  /** Screen-shake offset in screen px. */
  shakeX: number;
  shakeY: number;
}

const WALL_KEY = { normal: 'wall_normal', crystal: 'wall_crystal', mossy: 'wall_mossy' } as const;

/** Glow is quantised so an item only re-renders when its brightness visibly changes. */
const q = (v: number) => Math.round(v * 16) / 16;

interface PieceProps {
  item: Revealable;
  glow: number;
}

/** One revealable piece. Memoised: unchanged glow = no re-render. */
const Piece = React.memo(
  ({ item, glow }: PieceProps) => {
    const key: VisualKey = item.kind === 'wall' ? WALL_KEY[item.variant] : item.kind === 'spike' ? 'spike' : 'finish';
    const Visual = AssetRegistry.getVisual(key);
    return (
      <Visual
        x={item.x + item.width / 2}
        y={item.y + item.height / 2}
        width={item.width}
        height={item.height}
        glow={Math.min(glow, 1)}
      />
    );
  },
  (a, b) => a.item === b.item && a.glow === b.glow,
);
Piece.displayName = 'Piece';

/**
 * Draws one frame of a GameSim. Everything is a registry visual, so final art replaces the
 * placeholders without touching this file. Only lit items and live waves are rendered.
 */
export const GameView: React.FC<Props> = ({ sim, screenW, screenH, scale, offsetX, offsetY, batKey, brightness, time, shakeX, shakeY }) => {
  const Bat = AssetRegistry.getVisual(batKey);
  const Pulse = AssetRegistry.getVisual('pulse_wave');
  const items = sim.world.revealables;
  const glow = sim.reveal.glow;
  const b = sim.body;
  const moving = Math.hypot(b.vx, b.vy) > 20;
  const dead = sim.status === 'dying';
  const deathProgress = dead ? Math.min(1, 1 - sim.shake / ECHO_CONFIG.death.shakeSec) : 0;
  const pieces: React.ReactNode[] = [];
  for (let i = 0; i < items.length; i++) {
    const g = q(glow[i] * brightness);
    if (g <= 0.02) continue;
    pieces.push(<Piece key={i} item={items[i]} glow={g} />);
  }

  const waves: React.ReactNode[] = [];
  const w = sim.waves;
  for (let i = 0; i < w.size; i++) {
    if (!w.active[i]) continue;
    const p = Math.min(1, Math.max(0, w.radius[i]) / w.maxRadius[i]);
    waves.push(
      <Pulse key={i} x={w.ox[i]} y={w.oy[i]} width={w.maxRadius[i] * 2} height={w.maxRadius[i] * 2} progress={p} />,
    );
  }

  return (
    <Svg width={screenW} height={screenH} style={{ position: 'absolute', left: 0, top: 0 }}>
      <G transform={`translate(${offsetX + shakeX} ${offsetY + shakeY}) scale(${scale})`}>
        {pieces}
        {waves}
        <Bat
          x={b.x}
          y={b.y}
          width={b.r * 2.4}
          height={b.r * 2.4}
          rotation={(sim.rotation * 180) / Math.PI + 90}
          frame={moving && Math.floor(time * 14) % 2 === 1 ? 1 : 0}
          state={dead ? 'hit' : 'idle'}
          progress={deathProgress}
          time={time}
        />
      </G>
      {/* keeps Svg from collapsing when nothing is lit */}
      <Rect x={0} y={0} width={1} height={1} fill="transparent" />
    </Svg>
  );
};
