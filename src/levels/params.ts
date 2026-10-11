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
    hint: 'Tap anywhere in the darkness to emit your first sonar pulse.',
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
    hint: 'Use the floating joystick to glide smoothly through corridors.',
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
    hint: 'Trust your decaying memory afterimage before firing another pulse.',
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
    hint: 'A blind predator shares the maze. It hears every pulse you emit.',
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
    hint: 'Chasms return no echo. Fear silence just as much as walls.',
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
    hint: 'Stand completely still to stay inaudible while the Wraith patrols.',
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
