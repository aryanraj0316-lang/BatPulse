/** Data-file level format (spec §3.2). Levels are JSON, never code. */
export type WallType = 'normal' | 'crystal' | 'mossy';
export type EnemyKind = 'hunter';

export interface LevelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface LevelPoint {
  x: number;
  y: number;
}
export interface WallDef extends LevelRect {
  type: WallType;
}
export type SpikeDef = LevelRect;
export interface MovingHazardDef extends LevelRect {
  kind: 'slider' | 'blade';
  /** slider: how far it travels (out and back over one loop); blade: ignored */
  travel?: LevelPoint;
  /** Seconds for one full cycle (slider: out and back, blade: one rotation). */
  loopSec: number;
  /** Where in the cycle it starts, 0..1. Lets several hazards be out of step. */
  phase?: number;
}
export interface SwitchDef {
  id: string;
  x: number;
  y: number;
  radius: number;
}
export interface DoorDef extends LevelRect {
  id: string;
  /** id of the switch that opens this door */
  switchId: string;
}
export interface PickupDef {
  type: 'charge';
  x: number;
  y: number;
}
export interface EnemyDef {
  type: EnemyKind;
  /** Patrol route in world units, walked as a loop (two points = back and forth). */
  waypoints: LevelPoint[];
  speed: 'slow' | 'fast';
  /** Seconds into the patrol cycle at spawn, so several hunters can be out of step. */
  phaseSec?: number;
}
export type CheckpointDef = LevelPoint;
export interface SonarDef {
  mode: 'recharge' | 'fixed';
  charges: number;
  rechargeSec: number;
}

export interface LevelDef {
  id: number;
  name: string;
  chapter: number;
  width: number;
  height: number;
  start: LevelPoint;
  finish: LevelPoint & { radius?: number };
  walls: WallDef[];
  spikes: SpikeDef[];
  movingHazards: MovingHazardDef[];
  switches: SwitchDef[];
  doors: DoorDef[];
  pickups: PickupDef[];
  enemies: EnemyDef[];
  checkpoints: CheckpointDef[];
  sonar: SonarDef;
  ghostPulseLimit: number;
  parTime: number;
  /** Seconds. three <= two: finishing at or under `two` gives 2 stars, at or under `three` gives 3. */
  starThresholds: { two: number; three: number };
  /**
   * Escape levels: a wall of darkness rises from behind the start at `wallSpeed` units/s (kills on touch).
   * `startGap` = how far behind the start it begins (default 140).
   */
  escape: { enabled: boolean; wallSpeed: number; startGap?: number };
  /** On-screen onboarding hints, shown one after another. */
  hints?: HintDef[];
}

/** A hint stays visible until its condition is met, then the next hint (if any) appears. */
export interface HintDef {
  text: string;
  until: 'move' | 'pulse' | 'seconds';
  /** Required when until === 'seconds'. */
  seconds?: number;
}
