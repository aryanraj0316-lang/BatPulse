import React from 'react';
import Svg, { G, Rect } from 'react-native-svg';
import { AssetRegistry } from '../assets/AssetRegistry';
import { VisualKey } from '../assets/keys';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { GameSim } from '../sim/game';

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
  visual: VisualKey;
  x: number; // centre
  y: number;
  w: number;
  h: number;
  glow: number;
  active?: boolean;
  progress?: number;
  rotation?: number;
}

/** One lit item. Memoised on plain values, so it only re-renders when something visible changed. */
const Piece = React.memo(({ visual, x, y, w, h, glow, active, progress, rotation }: PieceProps) => {
  const Visual = AssetRegistry.getVisual(visual);
  return <Visual x={x} y={y} width={w} height={h} glow={Math.min(glow, 1)} active={active} progress={progress} rotation={rotation} />;
});
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
  const hazards = sim.world.hazards;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let g = q(glow[i] * brightness);
    const ref = it.ref ?? 0;
    // state that must stay readable even when nothing is lit: an open door and its countdown
    const doorOpen = it.kind === 'door' && sim.isDoorOpen(ref);
    const switchLit = it.kind === 'switch' && sim.isSwitchLit(ref);
    if (doorOpen) g = Math.max(g, 0.85);
    if (switchLit) g = Math.max(g, 0.7);
    if (g <= 0.02) continue;

    switch (it.kind) {
      case 'wall':
        pieces.push(<Piece key={i} visual={WALL_KEY[it.variant]} x={it.x + it.width / 2} y={it.y + it.height / 2} w={it.width} h={it.height} glow={g} />);
        break;
      case 'spike':
        pieces.push(<Piece key={i} visual="spike" x={it.x + it.width / 2} y={it.y + it.height / 2} w={it.width} h={it.height} glow={g} />);
        break;
      case 'finish':
        pieces.push(<Piece key={i} visual="finish" x={it.x + it.width / 2} y={it.y + it.height / 2} w={it.width} h={it.height} glow={g} />);
        break;
      case 'hazard': {
        const h = hazards[ref];
        const p = sim.poses[ref];
        const deg = h.kind === 'blade' ? Math.round(((p.angle * 180) / Math.PI) * 2) / 2 : 0;
        pieces.push(
          <Piece
            key={i}
            visual={h.kind === 'blade' ? 'hazard_blade' : 'hazard_slider'}
            x={Math.round((p.x + h.width / 2) * 2) / 2}
            y={Math.round((p.y + h.height / 2) * 2) / 2}
            w={h.width}
            h={h.height}
            glow={g}
            rotation={deg}
          />,
        );
        break;
      }
      case 'switch':
        pieces.push(<Piece key={i} visual="switch" x={it.x + it.width / 2} y={it.y + it.height / 2} w={it.width} h={it.height} glow={g} active={switchLit} />);
        break;
      case 'door':
        pieces.push(
          <Piece
            key={i}
            visual="door"
            x={it.x + it.width / 2}
            y={it.y + it.height / 2}
            w={it.width}
            h={it.height}
            glow={g}
            active={doorOpen}
            progress={Math.round(sim.doorProgress(ref) * 40) / 40}
          />,
        );
        break;
      case 'enemy': {
        const en = sim.enemies.enemies[ref];
        pieces.push(
          <Piece
            key={i}
            visual="enemy_hunter"
            x={Math.round(en.body.x * 2) / 2}
            y={Math.round(en.body.y * 2) / 2}
            w={ECHO_CONFIG.enemy.radius * 2}
            h={ECHO_CONFIG.enemy.radius * 2}
            glow={g}
            active={en.state === 'chase'}
          />,
        );
        break;
      }
      case 'pickup':
        if (!sim.pickupTaken[ref]) pieces.push(<Piece key={i} visual="pickup_charge" x={it.x + it.width / 2} y={it.y + it.height / 2} w={it.width} h={it.height} glow={g} />);
        break;
    }
  }

  // faint rings where recent pulses were made: explains why a hunter is coming
  const Marker = AssetRegistry.getVisual('sound_marker');
  const markers: React.ReactNode[] = [];
  for (let m = 0; m < sim.markerAge.length; m++) {
    const age = sim.markerAge[m];
    if (age >= ECHO_CONFIG.enemy.soundMarkerSec) continue;
    markers.push(<Marker key={`m${m}`} x={sim.markerX[m]} y={sim.markerY[m]} width={56} height={56} progress={age / ECHO_CONFIG.enemy.soundMarkerSec} />);
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
        {markers}
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
