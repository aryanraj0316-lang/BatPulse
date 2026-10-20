import React from 'react';
import Svg, { G, Rect } from 'react-native-svg';
import { AssetRegistry } from '../assets/AssetRegistry';
import { VisualKey } from '../assets/keys';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { GameSim } from '../sim/game';
import { isRowVisible, Lod, lodFor } from './quality';

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
  /** Level of detail (defaults to full). */
  lod?: Lod;
}

const WALL_KEY = { normal: 'wall_normal', crystal: 'wall_crystal', mossy: 'wall_mossy' } as const;

/** Glow is quantised so an item only re-renders when its brightness visibly changes. */
const quantise = (v: number, steps: number) => Math.round(v * steps) / steps;

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
export const GameView: React.FC<Props> = ({ sim, screenW, screenH, scale, offsetX, offsetY, batKey, brightness, time, shakeX, shakeY, lod = lodFor('high') }) => {
  const Bat = AssetRegistry.getVisual(batKey);
  const items = sim.world.revealables;
  const glow = sim.reveal.glow;
  const b = sim.body;
  const moving = Math.hypot(b.vx, b.vy) > 20;
  const dead = sim.status === 'dying';
  const deathProgress = dead ? Math.min(1, 1 - sim.shake / ECHO_CONFIG.death.shakeSec) : 0;
  const pieces: React.ReactNode[] = [];
  // visible world rows (tall levels scroll): lit things outside them are not drawn
  const viewTop = -offsetY / scale;
  const viewBottom = (screenH - offsetY) / scale;
  const hazards = sim.world.hazards;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!isRowVisible(it.y, it.height, viewTop, viewBottom)) continue;
    let g = quantise(glow[i] * brightness, lod.glowSteps);
    const ref = it.ref ?? 0;
    // state that must stay readable even when nothing is lit: an open door and its countdown
    const doorOpen = it.kind === 'door' && sim.isDoorOpen(ref);
    const switchLit = it.kind === 'switch' && sim.isSwitchLit(ref);
    if (doorOpen) g = Math.max(g, 0.85);
    if (switchLit) g = Math.max(g, 0.7);
    if (g <= lod.minGlow) continue;

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
        // a locked door (opened by a key) looks different from a switch door and shows no countdown
        if (sim.world.doorKey[ref] >= 0) {
          pieces.push(<Piece key={i} visual="locked_door" x={it.x + it.width / 2} y={it.y + it.height / 2} w={it.width} h={it.height} glow={g} active={doorOpen} />);
          break;
        }
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
      case 'key':
        if (!sim.keyTaken[ref]) pieces.push(<Piece key={i} visual="key_item" x={it.x + it.width / 2} y={it.y + it.height / 2} w={it.width} h={it.height} glow={g} />);
        break;
      case 'pickup':
        if (!sim.pickupTaken[ref]) pieces.push(<Piece key={i} visual="pickup_charge" x={it.x + it.width / 2} y={it.y + it.height / 2} w={it.width} h={it.height} glow={g} />);
        break;
    }
  }

  // faint rings where recent pulses were made: explains why a hunter is coming
  const Marker = AssetRegistry.getVisual('sound_marker');
  const markers: React.ReactNode[] = [];
  for (let m = 0; lod.showSoundMarkers && m < sim.markerAge.length; m++) {
    const age = sim.markerAge[m];
    if (age >= ECHO_CONFIG.enemy.soundMarkerSec) continue;
    markers.push(<Marker key={`m${m}`} x={sim.markerX[m]} y={sim.markerY[m]} width={56} height={56} progress={age / ECHO_CONFIG.enemy.soundMarkerSec} />);
  }

  // checkpoints: always faintly visible, bright once reached
  const cps: React.ReactNode[] = [];
  const checkpoints = sim.world.def.checkpoints;
  for (let c = 0; c < checkpoints.length; c++) {
    const reached = c === sim.lastCheckpoint;
    cps.push(<Piece key={`c${c}`} visual="checkpoint" x={checkpoints[c].x} y={checkpoints[c].y} w={ECHO_CONFIG.checkpoint.radius * 1.4} h={ECHO_CONFIG.checkpoint.radius * 1.4} glow={reached ? 1 : 0.35} active={reached} />);
  }

  // safe zones: always faintly visible so a hunted player can find one; bright while hiding, dim while resting,
  // and flashing when the stay is almost over
  const zoneNodes: React.ReactNode[] = [];
  const zones = sim.world.safeZones;
  for (let z = 0; z < zones.length; z++) {
    const zn = zones[z];
    if (!isRowVisible(zn.y, zn.height, viewTop, viewBottom)) continue;
    const hiding = sim.hidden && sim.hiddenZone === z;
    const resting = sim.zoneCooldownLeft(z) > 0;
    const warn = hiding && sim.hideLeft < 1 - ECHO_CONFIG.safeZone.warnFraction;
    const zGlow = hiding ? (warn ? 0.55 + 0.45 * Math.abs(Math.sin(time * 9)) : 1) : resting ? 0.2 : 0.5;
    zoneNodes.push(
      <Piece key={`z${z}`} visual="safe_zone" x={zn.x + zn.width / 2} y={zn.y + zn.height / 2} w={zn.width} h={zn.height} glow={Math.round(zGlow * 16) / 16} active={hiding} progress={hiding ? Math.round(sim.hideLeft * 40) / 40 : 1} />,
    );
  }

  // the wall of darkness on escape levels is always visible: it is a warning, not a secret
  const Wall = AssetRegistry.getVisual('escape_wall');
  const def = sim.world.def;
  const wallY = sim.escapeWallY;
  const wallNode = def.escape.enabled ? (
    <Wall x={def.width / 2} y={wallY + 900} width={def.width + 40} height={1800} glow={1} time={time} />
  ) : null;

  // the expanding wave itself is NOT drawn: the player only sees what it lights up (walls fading out with distance).
  // The wave still runs in the simulation (sim.waves) and still reveals things; `pulse_wave` stays in the registry
  // so final art for it can be switched back on here if the design ever changes.

  return (
    <Svg width={screenW} height={screenH} style={{ position: 'absolute', left: 0, top: 0 }}>
      <G transform={`translate(${offsetX + shakeX} ${offsetY + shakeY}) scale(${scale})`}>
        {zoneNodes}
        {cps}
        {markers}
        {pieces}
        {wallNode}
        {/* a hiding bat is drawn faint: it is hidden from the hunters, and the player can see that */}
        <G opacity={sim.hidden ? 0.4 : 1}>
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
      </G>
      {/* keeps Svg from collapsing when nothing is lit */}
      <Rect x={0} y={0} width={1} height={1} fill="transparent" />
    </Svg>
  );
};
