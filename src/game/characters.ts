import { CharacterStats, ECHO_CONFIG } from '../constants/gameConfig';
import { VisualKey } from '../assets/keys';
import { SimParams } from '../sim/game';

/** Roster order (shop order = price order). Names, prices and stats come from ECHO_CONFIG.characters. */
export const CHARACTER_IDS = ['bat_rookie', 'bat_vesper', 'bat_sonarbot', 'bat_phantom', 'bat_turbo'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const DEFAULT_CHARACTER: CharacterId = 'bat_rookie';

export const isCharacterId = (v: unknown): v is CharacterId => typeof v === 'string' && (CHARACTER_IDS as readonly string[]).includes(v);

export function characterStats(id: string): CharacterStats {
  return ECHO_CONFIG.characters[isCharacterId(id) ? id : DEFAULT_CHARACTER];
}

/** The AssetRegistry key of a character's visual is its id. */
export const visualKeyOf = (id: string): VisualKey => (isCharacterId(id) ? id : DEFAULT_CHARACTER);

/**
 * How a character changes the rules. `baseRadiusWorld` is the pulse radius of a plain bat on this screen
 * (40% of the screen width); Sonar-Bot multiplies it. This is the single place abilities turn into numbers.
 */
export function simParamsFor(id: string, baseRadiusWorld: number): SimParams {
  const c = characterStats(id);
  return {
    pulseRadius: baseRadiusWorld * c.radiusMult,
    glowBonusSec: c.glowBonusSec,
    momentumRateMult: c.momentumRateMult,
    momentumMax: c.momentumCap,
    hearingMult: c.hearingMult,
  };
}

export interface StatBar {
  key: 'range' | 'duration' | 'noise';
  label: string;
  /** 0..1 bar length, relative to the strongest value in the roster. */
  value: number;
  /** What the bar means in numbers. */
  text: string;
}

const allStats = () => CHARACTER_IDS.map((id) => ECHO_CONFIG.characters[id]);

/** Range, Duration and Noise bars for the shop. Longer = more range / longer glow / louder (noise is a cost). */
export function statBars(id: string): StatBar[] {
  const c = characterStats(id);
  const all = allStats();
  const maxRange = Math.max(...all.map((s) => s.radiusMult));
  const baseGlow = ECHO_CONFIG.sonar.revealGlowSec;
  const maxGlow = Math.max(...all.map((s) => baseGlow + s.glowBonusSec));
  const maxNoise = Math.max(...all.map((s) => s.hearingMult));
  return [
    { key: 'range', label: 'RANGE', value: c.radiusMult / maxRange, text: `x${c.radiusMult}` },
    { key: 'duration', label: 'DURATION', value: (baseGlow + c.glowBonusSec) / maxGlow, text: `${(baseGlow + c.glowBonusSec).toFixed(1)} s` },
    { key: 'noise', label: 'NOISE', value: c.hearingMult / maxNoise, text: c.hearingMult < 1 ? `x${c.hearingMult} (quiet)` : 'normal' },
  ];
}

/** Momentum line for the shop (it has no bar in the spec, but Turbo Moth is defined by it). */
export function momentumText(id: string): string {
  const c = characterStats(id);
  const rate = c.momentumRateMult === 1 ? 'normal rate' : `x${c.momentumRateMult} rate`;
  return `Momentum: ${rate}, cap x${c.momentumCap.toFixed(1)}`;
}
