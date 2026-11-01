/**
 * Bat skins: looks, powers and how each one is unlocked.
 * Visual-only fields drive the Skia bat rig (render/skia/layers/bat.ts);
 * `power` fields are read by the game loop (GameScreen).
 */

export type SkinId = 'dusk' | 'ember' | 'frost' | 'lunar' | 'jade' | 'storm' | 'umbra' | 'sovereign';
export type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

export interface SkinPalette {
  dark: string;
  mid: string;
  lit: string;
  edge: string;
  bone: string;
  fur: string;
  furHi: string;
  body: string;
  head: string;
  earIn: string;
  earOuter: string;
  rim: string;
  eye: string;
  eyeGlow: string;
  pupil: string;
  muzzle: string;
  legs: string;
  furLine: string;
}

/** Live particle style emitted from the wings. */
export type SkinParticles = 'none' | 'embers' | 'snow' | 'moon' | 'spores' | 'sparks' | 'smoke' | 'gold';
/** Pattern painted onto the wing membranes. */
export type SkinPattern = 'none' | 'ember' | 'frost' | 'lunar' | 'jade' | 'storm' | 'umbra' | 'royal';
/** Something worn on the head. */
export type SkinCrest = 'none' | 'horns' | 'icicles' | 'crescent' | 'frills' | 'antennae' | 'shadowhorns' | 'crown';

export interface SkinFx {
  /** colour of the floor aura + wing underglow */
  aura: string;
  auraStrength: number;
  /** wingtip trail colour */
  trail: string;
  /** glowing pattern colour (veins, runes, spots…) */
  glow: string;
  /** second accent (spots, sparks, filigree) */
  accent: string;
  particles: SkinParticles;
  pattern: SkinPattern;
  crest: SkinCrest;
  /** a halo / ring drawn behind the bat */
  halo: 'none' | 'moon' | 'sun';
  /** crackling arcs between wings + body */
  arcs?: boolean;
}

export interface SkinPower {
  label: string;
  desc: string;
  /** sonar recharge time × this */
  reloadMult?: number;
  /** wraith speed × this */
  wraithSpeedMult?: number;
  /** extra ms a revealed area stays fully lit */
  revealHoldMs?: number;
  /** extra sonar pulses per level */
  extraPulse?: number;
  /** flight speed × this */
  speedMult?: number;
  /** wraith vision range × this */
  visionMult?: number;
  /** shard rewards × this */
  shardMult?: number;
}

export type SkinUnlock =
  | { kind: 'free' }
  | { kind: 'shards'; value: number }
  | { kind: 'level'; value: number }
  | { kind: 'stars'; value: number }
  | { kind: 'ghost'; value: number };

export interface SkinDef {
  id: SkinId;
  name: string;
  epithet: string;
  rarity: Rarity;
  lore: string;
  unlock: SkinUnlock;
  power: SkinPower;
  pal: SkinPalette;
  fx: SkinFx;
}

export const RARITY_COLOR: Record<Rarity, { main: string; soft: string; deep: string }> = {
  COMMON: { main: '#B8C2CC', soft: '#E6ECF2', deep: '#3A424C' },
  RARE: { main: '#4DA8FF', soft: '#A8D4FF', deep: '#0E2E52' },
  EPIC: { main: '#B47DFF', soft: '#DCC4FF', deep: '#2E1656' },
  LEGENDARY: { main: '#FF9A3D', soft: '#FFD2A0', deep: '#4A2408' },
  MYTHIC: { main: '#FFD86B', soft: '#FFF2C4', deep: '#4A3A08' },
};

export const SKINS: SkinDef[] = [
  {
    id: 'dusk',
    name: 'Dusk Wanderer',
    epithet: 'Born of the first echo',
    rarity: 'COMMON',
    lore: 'A plain brown cave bat with sharp ears and steady wings.',
    unlock: { kind: 'free' },
    power: { label: 'Balanced', desc: 'No modifiers. Pure skill.' },
    pal: {
      dark: '#1E130E',
      mid: '#563A2F',
      lit: '#B07E66',
      edge: '#E0A07A',
      bone: '#9A7A66',
      fur: '#6E5040',
      furHi: '#A8846C',
      body: '#3B2A24',
      head: '#4E3A31',
      earIn: '#C08478',
      earOuter: '#4A3530',
      rim: '#00E5FF',
      eye: '#FFE9C4',
      eyeGlow: '#FFB547',
      pupil: '#1A0F0A',
      muzzle: '#6A4E40',
      legs: '#2A1C18',
      furLine: '#2A1C18',
    },
    fx: { aura: '#00E5FF', auraStrength: 0.38, trail: '#9AF6FF', glow: '#00E5FF', accent: '#9AF6FF', particles: 'none', pattern: 'none', crest: 'none', halo: 'none' },
  },
  {
    id: 'ember',
    name: 'Ember Wyrmling',
    epithet: 'Wings of banked coals',
    rarity: 'RARE',
    lore: 'Hatched in the forge-deeps. Molten veins pulse in its wings with every beat.',
    unlock: { kind: 'shards', value: 250 },
    power: { label: 'Kindled Echo', desc: 'Sonar recharges 25% faster.', reloadMult: 0.75 },
    pal: {
      dark: '#0E0605',
      mid: '#2A1410',
      lit: '#5A2A1C',
      edge: '#FF7A2A',
      bone: '#3A2620',
      fur: '#2A1A16',
      furHi: '#5A3A2E',
      body: '#1A0E0B',
      head: '#24140F',
      earIn: '#FF6A1A',
      earOuter: '#1E100C',
      rim: '#FF8A2A',
      eye: '#FFE08A',
      eyeGlow: '#FF7A1A',
      pupil: '#3A0A00',
      muzzle: '#2E1A14',
      legs: '#140A08',
      furLine: '#0A0504',
    },
    fx: { aura: '#FF7A1A', auraStrength: 0.42, trail: '#FFB060', glow: '#FF8A2A', accent: '#FFD27A', particles: 'embers', pattern: 'ember', crest: 'horns', halo: 'none' },
  },
  {
    id: 'frost',
    name: 'Frostwing Seraph',
    epithet: 'The cold that listens',
    rarity: 'RARE',
    lore: 'Its wings are thin as hoarfrost. Wraiths slow down in the chill it leaves behind.',
    unlock: { kind: 'level', value: 35 },
    power: { label: 'Chill Aura', desc: 'Wraiths move 12% slower.', wraithSpeedMult: 0.88 },
    pal: {
      dark: '#1A2A3E',
      mid: '#4A6E92',
      lit: '#A8D4F2',
      edge: '#E8F8FF',
      bone: '#CFE6FF',
      fur: '#8EB0CE',
      furHi: '#E2F2FF',
      body: '#5A7A98',
      head: '#6E8EAC',
      earIn: '#BFEFFF',
      earOuter: '#4A6A88',
      rim: '#9FE8FF',
      eye: '#E8FFFF',
      eyeGlow: '#7FE3FF',
      pupil: '#0A3A5A',
      muzzle: '#8EAAC4',
      legs: '#3A5470',
      furLine: '#3A5470',
    },
    fx: { aura: '#7FD8FF', auraStrength: 0.42, trail: '#DFF6FF', glow: '#BFF2FF', accent: '#FFFFFF', particles: 'snow', pattern: 'frost', crest: 'icicles', halo: 'none' },
  },
  {
    id: 'lunar',
    name: 'Lunar Phantom',
    epithet: 'Keeper of moonlit memory',
    rarity: 'EPIC',
    lore: 'Silver-furred and silent. Whatever moonlight touches, it remembers a little longer.',
    unlock: { kind: 'stars', value: 60 },
    power: { label: 'Moonlit Memory', desc: 'Revealed areas stay lit 0.5s longer.', revealHoldMs: 500 },
    pal: {
      dark: '#22243A',
      mid: '#5A5E86',
      lit: '#B8BEE6',
      edge: '#F2F4FF',
      bone: '#DCE0F5',
      fur: '#9EA4C4',
      furHi: '#F0F2FF',
      body: '#6A6E90',
      head: '#7E82A6',
      earIn: '#E6D8FF',
      earOuter: '#5A5E80',
      rim: '#D8DEFF',
      eye: '#F4F0FF',
      eyeGlow: '#C8B8FF',
      pupil: '#2A2050',
      muzzle: '#9A9EBE',
      legs: '#3E4262',
      furLine: '#3E4262',
    },
    fx: { aura: '#C8C8FF', auraStrength: 0.4, trail: '#E8E8FF', glow: '#E8ECFF', accent: '#B8A8FF', particles: 'moon', pattern: 'lunar', crest: 'crescent', halo: 'moon' },
  },
  {
    id: 'jade',
    name: 'Jade Venomwing',
    epithet: 'Glows where nothing grows',
    rarity: 'EPIC',
    lore: 'A fungal-hollow hunter with glowing spots. It can call one more pulse than other bats.',
    unlock: { kind: 'shards', value: 600 },
    power: { label: 'Deep Lungs', desc: '+1 sonar pulse every level.', extraPulse: 1 },
    pal: {
      dark: '#06140C',
      mid: '#0E3A22',
      lit: '#2A7A4A',
      edge: '#7AF0A8',
      bone: '#3A6A4A',
      fur: '#1E4A30',
      furHi: '#4A8A5E',
      body: '#123222',
      head: '#183E2A',
      earIn: '#7AF0A8',
      earOuter: '#123222',
      rim: '#4AFF9A',
      eye: '#F6FF8A',
      eyeGlow: '#C8FF4A',
      pupil: '#1A2A00',
      muzzle: '#2A5A3A',
      legs: '#0A1E12',
      furLine: '#06140C',
    },
    fx: { aura: '#3AFF9A', auraStrength: 0.4, trail: '#8AFFC0', glow: '#5AFFB0', accent: '#E0FF5A', particles: 'spores', pattern: 'jade', crest: 'frills', halo: 'none' },
  },
  {
    id: 'storm',
    name: 'Tempest Herald',
    epithet: 'Rides the thunder',
    rarity: 'EPIC',
    lore: 'Lightning crackles between its wingtips. Nothing in the dark flies faster.',
    unlock: { kind: 'level', value: 45 },
    power: { label: 'Tailwind', desc: 'Fly 10% faster.', speedMult: 1.1 },
    pal: {
      dark: '#0A0A24',
      mid: '#1E2260',
      lit: '#3A4AB8',
      edge: '#9AD8FF',
      bone: '#5A6AC8',
      fur: '#262A5A',
      furHi: '#5A62A8',
      body: '#161A44',
      head: '#1E2252',
      earIn: '#8AE0FF',
      earOuter: '#161A44',
      rim: '#7AE0FF',
      eye: '#FFFFFF',
      eyeGlow: '#7AE0FF',
      pupil: '#0A1060',
      muzzle: '#2E3470',
      legs: '#0E1030',
      furLine: '#06061A',
    },
    fx: { aura: '#5AA8FF', auraStrength: 0.44, trail: '#BFE8FF', glow: '#8AE0FF', accent: '#E0C8FF', particles: 'sparks', pattern: 'storm', crest: 'antennae', halo: 'none', arcs: true },
  },
  {
    id: 'umbra',
    name: 'Umbral Shade',
    epithet: 'Unseen, unheard',
    rarity: 'LEGENDARY',
    lore: 'Made of living shadow, so wraiths struggle to see it. Earned only by bats that are never spotted.',
    unlock: { kind: 'ghost', value: 10 },
    power: { label: 'Shadowmeld', desc: 'Wraith vision range 25% shorter.', visionMult: 0.75 },
    pal: {
      dark: '#030206',
      mid: '#0E0A18',
      lit: '#241A3A',
      edge: '#9A5AFF',
      bone: '#2A2040',
      fur: '#140F20',
      furHi: '#2E2448',
      body: '#0A0712',
      head: '#100C1A',
      earIn: '#7A3AFF',
      earOuter: '#0A0712',
      rim: '#9A5AFF',
      eye: '#E8CCFF',
      eyeGlow: '#A05AFF',
      pupil: '#2A005A',
      muzzle: '#1A1428',
      legs: '#05030A',
      furLine: '#000000',
    },
    fx: { aura: '#7A3AFF', auraStrength: 0.36, trail: '#B88AFF', glow: '#A060FF', accent: '#FF5AD8', particles: 'smoke', pattern: 'umbra', crest: 'shadowhorns', halo: 'none' },
  },
  {
    id: 'sovereign',
    name: 'Solar Sovereign',
    epithet: 'Crowned at the end of the dark',
    rarity: 'MYTHIC',
    lore: 'A golden bat that only appears to those who reach the bottom of the Astral Sanctum. Its crown pays out in shards.',
    unlock: { kind: 'level', value: 60 },
    power: { label: 'Royal Tithe', desc: '+50% shards from every clear.', shardMult: 1.5 },
    pal: {
      dark: '#3A2408',
      mid: '#8A5A14',
      lit: '#E8B24A',
      edge: '#FFF2C4',
      bone: '#FFE08A',
      fur: '#E8C890',
      furHi: '#FFF6DA',
      body: '#C89A5A',
      head: '#D8AE6E',
      earIn: '#FFD08A',
      earOuter: '#A87A3A',
      rim: '#FFE08A',
      eye: '#FFFFFF',
      eyeGlow: '#FFD24A',
      pupil: '#5A3000',
      muzzle: '#C89A6A',
      legs: '#6A4A1A',
      furLine: '#8A6A3A',
    },
    fx: { aura: '#FFD24A', auraStrength: 0.48, trail: '#FFF0B0', glow: '#FFE07A', accent: '#FFFFFF', particles: 'gold', pattern: 'royal', crest: 'crown', halo: 'sun' },
  },
];

export const SKIN_BY_ID: Record<SkinId, SkinDef> = SKINS.reduce((m, s) => ((m[s.id] = s), m), {} as Record<SkinId, SkinDef>);

export function skinOf(id: string | undefined | null): SkinDef {
  return (id && SKIN_BY_ID[id as SkinId]) || SKIN_BY_ID.dusk;
}

/** What the player needs to do to unlock a skin, as a short label. */
export function unlockLabel(u: SkinUnlock): string {
  switch (u.kind) {
    case 'free':
      return 'Starter';
    case 'shards':
      return `${u.value} shards`;
    case 'level':
      return `Clear Echo ${u.value}`;
    case 'stars':
      return `Earn ${u.value} stars`;
    case 'ghost':
      return `${u.value} ghost runs`;
  }
}

export interface SkinProgressInput {
  owned: SkinId[];
  shards: number;
  highestCleared: number;
  stars: number;
  ghostRuns: number;
}

/** owned = can equip · ready = requirement met (shards: affordable) · locked */
export function skinStatus(s: SkinDef, p: SkinProgressInput): { state: 'owned' | 'ready' | 'locked'; progress: number } {
  if (s.unlock.kind === 'free' || p.owned.includes(s.id)) return { state: 'owned', progress: 1 };
  const u = s.unlock;
  const have = u.kind === 'shards' ? p.shards : u.kind === 'level' ? p.highestCleared : u.kind === 'stars' ? p.stars : p.ghostRuns;
  const progress = Math.max(0, Math.min(1, have / u.value));
  if (u.kind !== 'shards' && progress >= 1) return { state: 'owned', progress: 1 }; // earned automatically
  return { state: progress >= 1 ? 'ready' : 'locked', progress };
}
