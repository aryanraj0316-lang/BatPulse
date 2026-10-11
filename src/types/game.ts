export type Vec2 = {
  x: number;
  y: number;
};

export type Rect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RevealTier = 'FRESH' | 'FADING' | 'ECHO' | 'GONE';

export interface Revealable {
  id: string;
  revealedAt: number; // timestamp in ms
  revealStrength: number; // 0–1 based on distance from pulse origin
  lastPingDistance: number;
}

export type EnvObjectType =
  | 'wall'
  | 'glass_wall'
  | 'echo_crystal'
  | 'dust_field'
  | 'chasm'
  | 'sonar_shard'
  | 'resonance_gate'
  | 'pressure_plate'
  | 'moving_wall';

export interface EnvObject extends Rect, Revealable {
  type: EnvObjectType;
  // Specific object metadata
  state?: 'active' | 'triggered' | 'open' | 'closed';
  hitsCount?: number;
  lastHitTime?: number;
  // Moving wall parameters
  cycleDuration?: number; // ms
  travelDistance?: number;
  axis?: 'horizontal' | 'vertical';
  initialPos?: Vec2;
  // Pressure plate / Echo crystal triggers
  triggerRadius?: number;
  collected?: boolean;
}

export type WraithState = 'DORMANT' | 'ALERTED' | 'HUNTING' | 'LOSING' | 'FRENZY';

export interface WraithEntity {
  id: string;
  pos: Vec2;
  velocity: Vec2;
  radius: number;
  speed: number;
  state: WraithState;
  targetPos: Vec2 | null;
  patrolAnchor: Vec2;
  searchTimer: number; // ms left in hunting
  frenzyTimer: number; // ms left in frenzy
  revealedAt: number;
  revealStrength: number;
  lastBreatheTime: number;
}

export interface PlayerEntity {
  pos: Vec2;
  velocity: Vec2;
  radius: number;
  rotation: number; // radians
  scale: number;
  momentum: number; // 0 to 20
  momentumTimer: number; // ms
  isMoving: boolean;
  footstepTimer: number;
  squashFactor: number;
}

export interface SonarWaveEntity {
  id: string;
  origin: Vec2;
  currentRadius: number;
  maxRadius: number;
  speed: number;
  createdAt: number;
  intensity: number;
  bounced?: boolean;
  piercing?: boolean;
  ricochetCount?: number;
}

export interface ImpactSpark {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // remaining ms
  maxLife: number;
  color: string;
  size: number;
}

export interface AmbientDust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseAlpha: number;
  ignitedTimer: number; // ms remaining when hit by wave
}

export type MechanicId =
  | 'SONAR_BASICS'
  | 'DIAGONAL_MOVEMENT'
  | 'LIMITED_PULSES'
  | 'FIRST_WRAITH'
  | 'CHASMS'
  | 'GLASS_WALLS'
  | 'ECHO_CRYSTALS'
  | 'RESONANCE_GATES'
  | 'PRESSURE_PLATES'
  | 'MOVING_WALLS';

export interface HunterSpawn {
  anchor: Vec2;
  speedMultiplier?: number;
}

export interface LevelData {
  id: number;
  name: string;
  subtitle: string;
  seed: number;
  grid: {
    cols: number;
    rows: number;
    cellSize: number;
  };
  generation: {
    braidFactor: number;
    roomCount: number;
    corridorWidth: 1 | 2;
  };
  spawn: Vec2;
  goal: Vec2 & { radius: number };
  walls: Rect[]; // greedy meshed wall collision rectangles
  objects: EnvObject[];
  hunters: HunterSpawn[];
  sonar: {
    allowance: number;
    radius: number;
    revealDuration: number;
  };
  player: {
    speed: number;
  };
  par: {
    time: number;
    sonarUsed: number;
  };
  difficulty: 1 | 2 | 3 | 4 | 5;
  teaches?: MechanicId;
  hint?: string;
}

export interface GhostPoint {
  t: number; // elapsed ms
  x: number;
  y: number;
  p: boolean; // ping fired this frame
}

export interface LevelRecord {
  levelId: number;
  unlocked: boolean;
  completed: boolean;
  stars: number; // 0 to 3
  bestTime: number | null; // seconds
  bestSonarUsed: number | null;
  ghostRun: boolean; // cleared without alerting wraith
  perfectEcho: boolean;
  ghostTrack?: GhostPoint[];
}

export type AbilityId =
  | 'WIDE_PULSE'
  | 'PIERCING_PING'
  | 'RICOCHET'
  | 'WHISPER_STEP'
  | 'SIXTH_SENSE';

export interface AbilityInfo {
  id: AbilityId;
  name: string;
  description: string;
  cost: number;
  unlocked: boolean;
}

export type GameMode = 'CAMPAIGN' | 'ENDLESS' | 'DAILY';

export type GameScreenState =
  | 'HOME'
  | 'LEVEL_SELECT'
  | 'GAME'
  | 'ABILITIES'
  | 'SETTINGS'
  | 'ENDLESS'
  | 'HOW_TO_PLAY';

export type PlayOutcome = 'VICTORY' | 'CAUGHT_BY_WRAITH' | 'CHASM_FALL' | 'OUT_OF_PULSES';
