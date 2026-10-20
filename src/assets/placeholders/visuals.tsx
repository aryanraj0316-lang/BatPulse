import React from 'react';
import { G, Rect, Circle, Path, Polygon, Line } from 'react-native-svg';
import { AssetRegistry, VisualProps, WallStyle } from '../AssetRegistry';
import { SOUND_KEYS, VisualKey } from '../keys';
import { SOUND_SPECS } from '../sound/synth';
import { PALETTE } from '../../constants/palette';

/* ───────────────────────────── Bats ─────────────────────────────
 * Drawn in a unit box [-1,1] facing up (-y), scaled to width/2.
 * frame 1 squeezes the wings horizontally for a 2-frame flap. */

type WingStyle = 'round' | 'pointed' | 'angular' | 'fluffy';

interface BatLook {
  body: string;
  wing: string;
  outline: string;
  span: number; // wing reach, 1 = full box
  wings: WingStyle;
  ears: number; // ear height
  opacity: number;
  ring?: boolean; // Sonar-Bot back ring
  trail?: 'fade' | 'speed';
  scale: number; // overall size vs. box
}

const LOOKS: Record<string, BatLook> = {
  bat_rookie: { body: PALETTE.playerWarm, wing: '#E9CFA3', outline: '#FFF6E2', span: 1, wings: 'round', ears: 0.25, opacity: 1, scale: 1 },
  bat_vesper: { body: '#B48CFF', wing: '#8A5FE0', outline: '#E3D2FF', span: 0.78, wings: 'pointed', ears: 0.5, opacity: 1, scale: 0.85 },
  bat_sonarbot: { body: '#9DB8C2', wing: '#5E7C88', outline: '#4DF0FF', span: 0.95, wings: 'angular', ears: 0.2, opacity: 1, ring: true, scale: 1 },
  bat_phantom: { body: '#4A5470', wing: '#2D3550', outline: '#8DA0D0', span: 1, wings: 'round', ears: 0.3, opacity: 0.55, trail: 'fade', scale: 1 },
  bat_turbo: { body: '#FFB347', wing: '#FF8F1F', outline: '#FFE0A3', span: 1.05, wings: 'fluffy', ears: 0.25, opacity: 1, trail: 'speed', scale: 1 },
};

/** Right wing outline in unit coordinates (mirrored for the left). */
function wingPath(style: WingStyle, s: number): string {
  switch (style) {
    case 'pointed':
      return `M0.12,-0.2 L${s},-0.05 L${0.55 * s},0.15 L0.12,0.35 Z`;
    case 'angular':
      return `M0.12,-0.3 L${0.6 * s},-0.45 L${s},0 L${0.7 * s},0.1 L${0.55 * s},0.4 L0.12,0.4 Z`;
    case 'fluffy':
      return `M0.12,-0.25 Q${0.6 * s},-0.85 ${s},-0.2 Q${1.08 * s},0.1 ${0.85 * s},0.25 Q${0.8 * s},0.5 ${0.55 * s},0.4 Q${0.35 * s},0.55 0.12,0.4 Z`;
    default:
      return `M0.12,-0.25 Q${0.6 * s},-0.7 ${s},0 Q${0.8 * s},0.15 ${0.55 * s},0.35 Q${0.35 * s},0.25 0.12,0.4 Z`;
  }
}

const makeBat = (key: string): React.FC<VisualProps> => {
  const look = LOOKS[key];
  const Bat: React.FC<VisualProps> = ({ x, y, width, rotation = 0, frame = 0, state = 'idle', glow = 0, progress = 0, time = 0 }) => {
    const unit = (width / 2) * look.scale;
    const sw = 1.4 / unit; // keep ~1.4px outlines regardless of size
    // Two-frame flap: frame 1 squeezes the wings; a hit pulls them in fully.
    const wingScale = state === 'hit' ? 0.5 : frame === 1 ? 0.6 : 1;
    const spin = state === 'preview' ? time * 40 : 0;
    const wp = wingPath(look.wings, look.span);
    const hit = state === 'hit';
    const body = hit ? '#FF6B5C' : look.body;
    return (
      <G transform={`translate(${x} ${y}) rotate(${rotation + spin}) scale(${unit})`} opacity={look.opacity}>
        {state === 'preview' && <Circle r={1.15} fill={look.outline} opacity={0.1 + 0.08 * Math.sin(time * 3)} />}
        {glow > 0 && <Circle r={1} fill={look.outline} opacity={0.18 * glow} />}
        {look.trail === 'fade' &&
          [0.5, 0.75, 1].map((d, i) => (
            <Circle key={i} cy={d * 0.9} r={0.28 - i * 0.05} fill={look.outline} opacity={0.22 - i * 0.06} />
          ))}
        {look.trail === 'speed' &&
          [-0.3, 0, 0.3].map((dx, i) => (
            <Line key={i} x1={dx} y1={0.5} x2={dx} y2={1 + i * 0.1} stroke={look.outline} strokeWidth={0.06} opacity={0.4} />
          ))}
        <G transform={`scale(${wingScale} 1)`}>
          <Path d={wp} fill={look.wing} stroke={look.outline} strokeWidth={sw} />
          <G transform="scale(-1 1)">
            <Path d={wp} fill={look.wing} stroke={look.outline} strokeWidth={sw} />
          </G>
        </G>
        <Polygon points={`-0.14,-0.5 -0.1,${-0.5 - look.ears} -0.02,-0.55`} fill={body} stroke={look.outline} strokeWidth={sw} />
        <Polygon points={`0.14,-0.5 0.1,${-0.5 - look.ears} 0.02,-0.55`} fill={body} stroke={look.outline} strokeWidth={sw} />
        <Path d="M0,-0.62 C0.2,-0.62 0.24,-0.3 0.2,0.1 C0.16,0.45 0.08,0.65 0,0.7 C-0.08,0.65 -0.16,0.45 -0.2,0.1 C-0.24,-0.3 -0.2,-0.62 0,-0.62 Z" fill={body} stroke={look.outline} strokeWidth={sw} />
        <Circle cx={-0.07} cy={-0.38} r={0.04} fill="#04060A" />
        <Circle cx={0.07} cy={-0.38} r={0.04} fill="#04060A" />
        {look.ring && (
          <G transform={`rotate(${time * 120} 0 0.1)`}>
            <Circle cx={0} cy={0.1} r={0.22} stroke={PALETTE.sonarCyan} strokeWidth={0.05} fill="none" strokeDasharray="0.18 0.1" />
          </G>
        )}
        {hit &&
          Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const r1 = 0.4 + progress * 1.2;
            const r2 = r1 + 0.3;
            return (
              <Line key={i} x1={Math.cos(a) * r1} y1={Math.sin(a) * r1} x2={Math.cos(a) * r2} y2={Math.sin(a) * r2} stroke="#FF6B5C" strokeWidth={0.07} opacity={1 - progress} />
            );
          })}
      </G>
    );
  };
  Bat.displayName = `Visual(${key})`;
  return Bat;
};

/* ───────────────────────────── World ───────────────────────────── */

const rect = (p: VisualProps) => ({ x: p.x - p.width / 2, y: p.y - p.height / 2, width: p.width, height: p.height });
const glowOf = (p: VisualProps) => (p.glow === undefined ? 1 : p.glow);

const WallNormal: React.FC<VisualProps> = (p) => (
  <Rect {...rect(p)} stroke={PALETTE.sonarCyan} strokeWidth={2} fill="rgba(12,22,36,0.55)" opacity={glowOf(p)} />
);

const WallCrystal: React.FC<VisualProps> = (p) => {
  const r = rect(p);
  const facets: React.ReactNode[] = [];
  const step = 14;
  const along = Math.max(p.width, p.height);
  for (let d = step; d < along; d += step) {
    // diagonal facet lines clipped to the rectangle
    const x1 = r.x + Math.min(d, r.width);
    const y1 = r.y + Math.max(0, d - r.width);
    const x2 = r.x + Math.max(0, d - r.height);
    const y2 = r.y + Math.min(d, r.height);
    facets.push(<Line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#E8FDFF" strokeWidth={1} opacity={0.55} />);
  }
  return (
    <G opacity={glowOf(p)}>
      <Rect {...r} stroke="#E8FDFF" strokeWidth={2.5} fill="rgba(180,250,255,0.12)" />
      {facets}
    </G>
  );
};

const WallMossy: React.FC<VisualProps> = (p) => (
  <Rect {...rect(p)} stroke="#3F6B3A" strokeWidth={1.5} fill="rgba(20,40,20,0.4)" opacity={glowOf(p) * 0.7} />
);

const Spike: React.FC<VisualProps> = (p) => {
  const r = rect(p);
  const n = Math.max(1, Math.floor(r.width / 10));
  const w = r.width / n;
  return (
    <G opacity={glowOf(p)}>
      {Array.from({ length: n }).map((_, i) => (
        <Polygon key={i} points={`${r.x + i * w},${r.y + r.height} ${r.x + i * w + w / 2},${r.y} ${r.x + (i + 1) * w},${r.y + r.height}`} fill="#FF5A36" stroke="#FFB199" strokeWidth={0.8} />
      ))}
    </G>
  );
};

const HazardSlider: React.FC<VisualProps> = (p) => (
  <Rect {...rect(p)} rx={3} fill="#FF8A1F" stroke="#FFD2A1" strokeWidth={1.5} opacity={glowOf(p)} />
);

const HazardBlade: React.FC<VisualProps> = (p) => {
  const len = Math.max(p.width, p.height);
  const t = 5;
  return (
    <G transform={`translate(${p.x} ${p.y}) rotate(${p.rotation ?? (p.time ?? 0) * 180})`} opacity={glowOf(p)}>
      <Rect x={-len / 2} y={-t / 2} width={len} height={t} fill="#FF8A1F" stroke="#FFD2A1" strokeWidth={1} />
      <Rect x={-t / 2} y={-len / 2} width={t} height={len} fill="#FF8A1F" stroke="#FFD2A1" strokeWidth={1} />
      <Circle r={t} fill="#FFD2A1" />
    </G>
  );
};

const Switch: React.FC<VisualProps> = (p) => {
  const r = Math.min(p.width, p.height) / 2;
  const c = p.active ? '#5CFF9D' : PALETTE.sonarCyan;
  return (
    <G opacity={glowOf(p)}>
      <Circle cx={p.x} cy={p.y} r={r} stroke={c} strokeWidth={2} fill="none" />
      <Circle cx={p.x} cy={p.y} r={r * 0.55} stroke={c} strokeWidth={1.5} fill={p.active ? c : 'none'} fillOpacity={0.35} />
    </G>
  );
};

const Door: React.FC<VisualProps> = (p) => {
  const open = !!p.active;
  const radius = Math.max(8, Math.min(p.width, p.height) / 2 + 6);
  const circ = 2 * Math.PI * radius;
  return (
    <G opacity={glowOf(p)}>
      <Rect {...rect(p)} fill={open ? 'none' : '#FFB000'} fillOpacity={0.9} stroke="#FFD866" strokeWidth={2} strokeDasharray={open ? '4 4' : undefined} />
      {open && (
        <Circle
          cx={p.x}
          cy={p.y}
          r={radius}
          stroke="#FFD866"
          strokeWidth={2}
          fill="none"
          strokeDasharray={`${circ * Math.max(0, Math.min(1, p.progress ?? 1))} ${circ}`}
          transform={`rotate(-90 ${p.x} ${p.y})`}
        />
      )}
    </G>
  );
};

const PickupCharge: React.FC<VisualProps> = (p) => {
  const r = Math.min(p.width, p.height) / 2;
  return (
    <Polygon
      points={`${p.x},${p.y - r} ${p.x + r * 0.7},${p.y} ${p.x},${p.y + r} ${p.x - r * 0.7},${p.y}`}
      fill={PALETTE.sonarCyan}
      fillOpacity={0.35}
      stroke={PALETTE.sonarCyan}
      strokeWidth={1.5}
      opacity={glowOf(p)}
    />
  );
};

const Finish: React.FC<VisualProps> = (p) => {
  const r = Math.min(p.width, p.height) / 2;
  const pulse = 1 + 0.06 * Math.sin((p.time ?? 0) * 3);
  return (
    <G opacity={glowOf(p)}>
      {[1, 0.66, 0.33].map((k, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={r * k * pulse} stroke={PALETTE.goalViolet} strokeWidth={i === 0 ? 2 : 1.5} fill="none" />
      ))}
    </G>
  );
};

const Checkpoint: React.FC<VisualProps> = (p) => {
  const r = Math.min(p.width, p.height) / 2;
  return <Circle cx={p.x} cy={p.y} r={r} stroke="#5CFF9D" strokeWidth={p.active ? 3 : 1.8} fill="none" opacity={glowOf(p)} />;
};

/** A hidden key: a small gold key, lit only while a pulse shows it. */
const KeyItem: React.FC<VisualProps> = (p) => {
  const s = Math.min(p.width, p.height);
  const bow = s * 0.2;
  const left = p.x - s * 0.34;
  return (
    <G opacity={glowOf(p)}>
      <Circle cx={left} cy={p.y} r={bow} stroke="#FFD866" strokeWidth={2} fill="#FFB000" fillOpacity={0.35} />
      <Line x1={left + bow} y1={p.y} x2={p.x + s * 0.4} y2={p.y} stroke="#FFD866" strokeWidth={2.2} />
      <Line x1={p.x + s * 0.2} y1={p.y} x2={p.x + s * 0.2} y2={p.y + s * 0.2} stroke="#FFD866" strokeWidth={2.2} />
      <Line x1={p.x + s * 0.4} y1={p.y} x2={p.x + s * 0.4} y2={p.y + s * 0.26} stroke="#FFD866" strokeWidth={2.2} />
    </G>
  );
};

/** A door that needs a key: purple, with a padlock. Open (active) = dashed outline and no lock. */
const LockedDoor: React.FC<VisualProps> = (p) => {
  const open = !!p.active;
  const lock = Math.min(p.width, p.height, 26) * 0.5;
  return (
    <G opacity={glowOf(p)}>
      <Rect {...rect(p)} fill={open ? 'none' : '#7A3CFF'} fillOpacity={0.75} stroke="#C9A8FF" strokeWidth={2} strokeDasharray={open ? '4 4' : undefined} />
      {!open && (
        <G>
          <Path d={`M${p.x - lock * 0.45},${p.y - lock * 0.1} v${-lock * 0.3} a${lock * 0.45},${lock * 0.45} 0 0 1 ${lock * 0.9},0 v${lock * 0.3}`} stroke="#FFFFFF" strokeWidth={1.8} fill="none" />
          <Rect x={p.x - lock * 0.6} y={p.y - lock * 0.1} width={lock * 1.2} height={lock * 0.9} rx={2} fill="#FFFFFF" fillOpacity={0.9} />
        </G>
      )}
    </G>
  );
};

/**
 * A refuge. Always faintly visible (like a checkpoint) so it can be found in the dark. `active` = the bat is hiding in it,
 * `progress` = how much of the stay is left; a dim, dashed zone is resting and cannot hide the bat yet.
 */
const SafeZone: React.FC<VisualProps> = (p) => {
  const hiding = !!p.active;
  const left = Math.max(0, Math.min(1, p.progress ?? 1));
  const r = rect(p);
  return (
    <G opacity={glowOf(p)}>
      <Rect {...r} rx={6} fill="#7CFFD1" fillOpacity={hiding ? 0.16 : 0.06} stroke="#7CFFD1" strokeWidth={hiding ? 2.4 : 1.6} strokeDasharray={hiding ? undefined : '5 4'} />
      <Path d={`M${p.x - p.width * 0.22},${p.y + p.height * 0.28} v${-p.height * 0.32} a${p.width * 0.22},${p.width * 0.22} 0 0 1 ${p.width * 0.44},0 v${p.height * 0.32}`} stroke="#7CFFD1" strokeWidth={1.6} fill="none" opacity={0.8} />
      {hiding && <Rect x={r.x + 3} y={r.y + r.height - 6} width={Math.max(0, (r.width - 6) * left)} height={3} fill="#7CFFD1" />}
    </G>
  );
};

const EnemyHunter: React.FC<VisualProps> = (p) => {
  const r = Math.min(p.width, p.height) / 2;
  return (
    <G opacity={glowOf(p)}>
      <Circle cx={p.x} cy={p.y} r={r} fill={p.active ? '#6A0F1C' : '#3A0A10'} stroke={p.active ? '#FFFFFF' : PALETTE.wraithRed} strokeWidth={p.active ? 2.5 : 1.5} />
      <Path d={`M${p.x - r * 0.6},${p.y} Q${p.x},${p.y - r * 0.6} ${p.x + r * 0.6},${p.y} Q${p.x},${p.y + r * 0.6} ${p.x - r * 0.6},${p.y} Z`} fill={PALETTE.wraithRed} />
      <Circle cx={p.x} cy={p.y} r={r * 0.18} fill="#04060A" />
    </G>
  );
};

/** progress 0..1 is how far the wave has expanded; width = full-size diameter. */
const PulseWave: React.FC<VisualProps> = (p) => {
  const prog = Math.max(0, Math.min(1, p.progress ?? 0));
  const r = (p.width / 2) * prog;
  const fade = Math.pow(1 - prog, 1.5);
  return (
    <G opacity={fade}>
      <Circle cx={p.x} cy={p.y} r={Math.max(1, r)} stroke={PALETTE.sonarCyan} strokeWidth={2.5} fill="none" />
      <Circle cx={p.x} cy={p.y} r={Math.max(1, r * 0.85)} stroke={PALETTE.sonarCyan} strokeWidth={1.2} fill="none" strokeDasharray="5 4" opacity={0.7} />
    </G>
  );
};

/** Faint ring where a pulse was made; progress 0..1 is its age (it fades out). */
const SoundMarker: React.FC<VisualProps> = (p) => {
  const prog = Math.max(0, Math.min(1, p.progress ?? 0));
  const r = (Math.min(p.width, p.height) / 2) * (0.6 + 0.4 * prog);
  return (
    <G opacity={0.55 * (1 - prog)}>
      <Circle cx={p.x} cy={p.y} r={r} stroke={PALETTE.sonarCyan} strokeWidth={1.2} strokeDasharray="3 4" fill="none" />
      <Circle cx={p.x} cy={p.y} r={2} fill={PALETTE.sonarCyan} />
    </G>
  );
};

/**
 * The wall of darkness on escape levels: a dark violet mass with a jagged glowing edge on top.
 * x,y = centre of the whole mass, width/height = its size; glow scales the edge brightness.
 */
const EscapeWall: React.FC<VisualProps> = (p) => {
  const left = p.x - p.width / 2;
  const top = p.y - p.height / 2;
  let d = `M${left},${top}`;
  const teeth = Math.max(4, Math.round(p.width / 26));
  for (let i = 0; i < teeth; i++) {
    const x0 = left + (p.width * i) / teeth;
    const x1 = left + (p.width * (i + 0.5)) / teeth;
    const x2 = left + (p.width * (i + 1)) / teeth;
    const wob = 10 + 6 * Math.sin(((p.time ?? 0) * 2 + i * 1.7));
    d += ` L${x1},${top - wob} L${x2},${top}`;
    void x0;
  }
  return (
    <G opacity={p.glow ?? 1}>
      <Rect x={left} y={top} width={p.width} height={p.height} fill="rgba(40, 0, 70, 0.78)" />
      <Path d={d} stroke="#FF3B6E" strokeWidth={2.5} fill="none" opacity={0.9} />
      <Path d={d} stroke="#FF3B6E" strokeWidth={8} fill="none" opacity={0.18} />
    </G>
  );
};

/* ───────────────────────────── Registration ───────────────────────────── */

const wallStyle = (fresh: string, fading: string, echo: string): WallStyle => ({
  fresh: { stroke: fresh, width: 2.0, fill: 'rgba(12, 22, 36, 0.55)', opacity: 0.95 },
  fading: { stroke: fading, width: 1.5, fill: 'rgba(12, 22, 36, 0.3)', opacity: 0.65 },
  echo: { stroke: echo, width: 1.0, fill: 'none', opacity: 0.35 },
});

/** Registers every placeholder visual, wall style and sound. Call once at startup. */
export function registerPlaceholderAssets(): void {
  const visuals: Record<VisualKey, React.FC<VisualProps>> = {
    bat_rookie: makeBat('bat_rookie'),
    bat_vesper: makeBat('bat_vesper'),
    bat_sonarbot: makeBat('bat_sonarbot'),
    bat_phantom: makeBat('bat_phantom'),
    bat_turbo: makeBat('bat_turbo'),
    wall_normal: WallNormal,
    wall_crystal: WallCrystal,
    wall_mossy: WallMossy,
    spike: Spike,
    hazard_slider: HazardSlider,
    hazard_blade: HazardBlade,
    switch: Switch,
    door: Door,
    pickup_charge: PickupCharge,
    finish: Finish,
    checkpoint: Checkpoint,
    key_item: KeyItem,
    locked_door: LockedDoor,
    safe_zone: SafeZone,
    enemy_hunter: EnemyHunter,
    pulse_wave: PulseWave,
    sound_marker: SoundMarker,
    escape_wall: EscapeWall,
  };
  (Object.keys(visuals) as VisualKey[]).forEach((k) => AssetRegistry.registerVisual(k, visuals[k]));

  AssetRegistry.registerWallStyle('wall_normal', wallStyle(PALETTE.sonarCyan, PALETTE.echoTeal, PALETTE.memoryDust));
  AssetRegistry.registerWallStyle('wall_crystal', wallStyle('#E8FDFF', '#7FD9E6', '#2A6F7A'));
  AssetRegistry.registerWallStyle('wall_mossy', wallStyle('#5E9A55', '#3F6B3A', '#22381F'));

  SOUND_KEYS.forEach((k) => AssetRegistry.registerSound(k, { kind: 'synth', spec: SOUND_SPECS[k] }));
}
