export interface LevelPreset {
  id: number;
  name: string;
  subtitle: string;
  cols: number;
  rows: number;
  braidFactor: number;
  roomCount: number;
  sonarAllowance: number;
  parTime: number;
  parSonar: number;
  hunterCount: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  hint?: string;
}

export const LEVEL_PRESETS: LevelPreset[] = [
  {
    id: 1,
    name: 'First Echo',
    subtitle: 'The Darkness Awaits',
    cols: 5,
    rows: 7,
    braidFactor: 0.6,
    roomCount: 1,
    sonarAllowance: 999, // Infinite tutorial
    parTime: 12,
    parSonar: 3,
    hunterCount: 0,
    difficulty: 1,
    hint: 'Tap anywhere to send a sonar pulse. Its echo lights up the walls.',
  },
  {
    id: 2,
    name: 'Corridors of Silence',
    subtitle: 'Learn Diagonal Navigation',
    cols: 6,
    rows: 8,
    braidFactor: 0.5,
    roomCount: 1,
    sonarAllowance: 12,
    parTime: 18,
    parSonar: 5,
    hunterCount: 0,
    difficulty: 1,
    hint: 'Hold or drag anywhere to steer. A joystick appears under your thumb.',
  },
  {
    id: 3,
    name: 'Echo Scarcity',
    subtitle: 'Every Pulse Counts',
    cols: 7,
    rows: 10,
    braidFactor: 0.4,
    roomCount: 1,
    sonarAllowance: 8,
    parTime: 25,
    parSonar: 4,
    hunterCount: 0,
    difficulty: 2,
    hint: 'Pulses are limited. Remember the walls you saw before pulsing again.',
  },
  {
    id: 4,
    name: 'The Blind Stalker',
    subtitle: 'First Wraith Encounter',
    cols: 7,
    rows: 11,
    braidFactor: 0.4,
    roomCount: 1,
    sonarAllowance: 8,
    parTime: 30,
    parSonar: 5,
    hunterCount: 1,
    difficulty: 2,
    hint: 'A wraith patrols this maze. Stay out of its red cone of sight.',
  },
  {
    id: 5,
    name: 'The Silent Abyss',
    subtitle: 'Beware the Chasm',
    cols: 8,
    rows: 12,
    braidFactor: 0.35,
    roomCount: 2,
    sonarAllowance: 7,
    parTime: 32,
    parSonar: 4,
    hunterCount: 1,
    difficulty: 3,
    hint: 'Chasms swallow your echo. Dark gaps in the floor are deadly.',
  },
  {
    id: 6,
    name: 'The Crucible',
    subtitle: 'All Systems Active',
    cols: 9,
    rows: 13,
    braidFactor: 0.35,
    roomCount: 2,
    sonarAllowance: 6,
    parTime: 35,
    parSonar: 4,
    hunterCount: 1,
    difficulty: 3,
    hint: 'Wraiths also sense a bat that flies too close. Give them room.',
  },
  {
    id: 7,
    name: 'Glass Sanctuary',
    subtitle: 'Deceptive Clearances',
    cols: 9,
    rows: 14,
    braidFactor: 0.3,
    roomCount: 2,
    sonarAllowance: 6,
    parTime: 40,
    parSonar: 4,
    hunterCount: 1,
    difficulty: 4,
    hint: 'Sonar penetrates glass walls, but your bat cannot pass through.',
  },
  {
    id: 8,
    name: 'Resonant Depths',
    subtitle: 'Echo Crystals & Double Pings',
    cols: 10,
    rows: 15,
    braidFactor: 0.3,
    roomCount: 3,
    sonarAllowance: 6,
    parTime: 45,
    parSonar: 4,
    hunterCount: 2,
    difficulty: 5,
    hint: 'Fire into Echo Crystals to reveal distant chambers for free.',
  },
];

/** Names for the generated campaign levels 9–60 (index 0 = level 9). */
export const LEVEL_NAMES: string[] = [
  // I · The Ivy Crypt
  'Moss & Marrow', 'The Lantern Keeper',
  // II · The Sunken Grotto
  'Tidepool Hall', 'Drowned Choir', 'Barnacle Run', 'The Pearl Vault', 'Kelp Cathedral',
  'Glimmer Shoals', "Siren's Hollow", 'Coral Labyrinth', 'The Abyssal Gate', "Leviathan's Rest",
  // III · The Ember Forge
  'Cinder Steps', 'The Bellows', 'Slag Rivers', 'Anvil Hall', 'Ashen Gallery',
  'Magma Veins', 'The Crucible Deep', 'Obsidian Spire', 'Furnace Heart', 'Molten Throne',
  // IV · The Frostbound Catacombs
  'Rime Gate', 'Hoarfrost Crypts', 'The Frozen Choir', 'Glacier Vaults', 'Shiver Halls',
  'Icebound Ossuary', 'Aurora Steps', 'The Silent Thaw', "Winter's Tomb", 'Heart of Ice',
  // V · The Fungal Hollow
  'Sporefall', 'Mycelium Maze', 'The Glowcap Grove', 'Rotwood Hollow', 'Lantern Shrooms',
  'The Breathing Dark', 'Puffball Plaza', 'Root Cathedral', 'Bloom of Ruin', 'The Grand Mycelium',
  // VI · The Astral Sanctum
  'Stardust Steps', 'Celestial Nave', 'The Orrery', 'Constellation Halls', 'Nebula Gardens',
  'The Eclipse Vault', "Comet's Path", 'Starfall Sanctum', 'The Last Light', 'Throne of Echoes',
];

/** One hint per chapter (index = chapter 0..5). Twist chapters explain their twist. */
export const CHAPTER_HINTS: string[] = [
  'Plan several moves ahead. Wraiths watch every corridor.',
  'Jellyfish drift over the drowned halls. The deep pools still kill.',
  'Lava pools are deadly. Follow the glowing seams.',
  'The ice muffles everything. Pulse with care.',
  'Crushers sweep the corridors. Watch their glow, then time your dash.',
  'Rifts link distant halls. Fly into one and come out of its twin.',
];
