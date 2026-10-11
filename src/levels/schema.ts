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
  /** slider: travel vector over one loop; blade: ignored */
  travel?: LevelPoint;
  loopSec: number;
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
  waypoints: LevelPoint[];
  speed: 'slow' | 'fast';
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
  escape: { enabled: boolean; wallSpeed: number };
  hint?: string;
}
