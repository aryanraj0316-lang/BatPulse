/** Every visual and sound the game asks for, by key. Gameplay code only ever uses these keys. */
export const VISUAL_KEYS = [
  'bat_rookie',
  'bat_vesper',
  'bat_sonarbot',
  'bat_phantom',
  'bat_turbo',
  'wall_normal',
  'wall_crystal',
  'wall_mossy',
  'spike',
  'hazard_slider',
  'hazard_blade',
  'switch',
  'door',
  'pickup_charge',
  'finish',
  'checkpoint',
  'enemy_hunter',
  'pulse_wave',
  'sound_marker',
  'escape_wall',
] as const;
export type VisualKey = (typeof VISUAL_KEYS)[number];

export const BAT_KEYS: VisualKey[] = ['bat_rookie', 'bat_vesper', 'bat_sonarbot', 'bat_phantom', 'bat_turbo'];

export const SOUND_KEYS = [
  'sfx_ping',
  'sfx_hit',
  'sfx_death',
  'sfx_finish',
  'sfx_switch',
  'sfx_door',
  'sfx_enemy_alert',
  'sfx_heartbeat',
  'music_ambient',
] as const;
export type SoundKey = (typeof SOUND_KEYS)[number];

/** Wall surface styles are looked up with the same keys as the wall visuals. */
export const WALL_KEYS = ['wall_normal', 'wall_crystal', 'wall_mossy'] as const;
export type WallKey = (typeof WALL_KEYS)[number];
