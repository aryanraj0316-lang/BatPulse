/**
 * Visual theme for the in-game Skia renderer.
 * Every colour / intensity worth tweaking lives here.
 */

import { GAME_CONFIG } from '../../constants/gameConfig';

/** 'high' = all effects. 'low' = no blur masks, water caustics, lantern flicker or motion smear. */
export const GFX_QUALITY: 'high' | 'low' = 'high';
export const HQ = GFX_QUALITY === 'high';

export const THEME = {
  // ── Floor (slate cobblestones) ─────────────────────────────
  floorMortar: '#06090D',
  floorStoneDark: '#0D1218',
  floorStoneLight: '#1A222D',
  floorStoneHighlight: '#2A3442',
  floorPatchStrength: 0.22, // broad light/dark noise patches

  // ── Walls (raised masonry) ─────────────────────────────────
  wallCap: '#4A5568',
  wallCapAlt: '#3A4454',
  wallCapMortar: '#1F2630',
  wallFacet: '#1E2530',
  wallFacetDark: '#11161D',
  wallBevelLight: '#718096',
  wallBevelDark: '#141922',
  wallShadow: 'rgba(0,0,0,0.8)',
  wallShadowBlur: 8,
  wallShadowOffset: { x: 5, y: 7 },
  /** max extra art thickness on each side of the collision rect (scaled down in tight mazes) */
  wallMaxPad: 4.5,
  /** height of the south-facing facet below the cap */
  wallFacetHeight: 6,

  // ── Moss / ivy ─────────────────────────────────────────────
  moss: '#2E4A28',
  mossDark: '#1F3A1E',
  ivy: ['#1E3A1A', '#2C5224', '#3F6E2E', '#5A8F3A'],
  berry: '#B3263A',

  // ── Border terrain ─────────────────────────────────────────
  rock: '#1B2027',
  rockLight: '#38414D',
  rockDark: '#0A0D11',

  // ── Water ──────────────────────────────────────────────────
  waterTop: '#002B36',
  waterBottom: '#00141C',
  waterSpecular: '#7FF7FF',
  waterCaustic: '#3FD3E6',

  // ── Lighting ───────────────────────────────────────────────
  lanternCore: '#FFE6A0',
  lanternGlass: '#FFC24A',
  lanternGlowCenter: '#FFA726',
  lanternGlowMid: '#FF6F00',
  lanternGlowStrength: 0.6, // additive warm light on floor/walls
  lanternGlowRadius: 2.1, // in cells
  lanternFlicker: 0.06, // intensity wobble (0 = steady)
  ambientTint: 'rgba(40, 70, 110, 0.10)', // cool wash over the whole world
  vignetteStrength: 0.62, // 0 = none
  vignetteColor: '#04070A',

  // ── Sonar ──────────────────────────────────────────────────
  sonarInner: '#00E5FF',
  sonarOuter: '#0052D4',
  sonarRingCount: 0, // 0 = no ring lines, just the soft light fade
  sonarRingBlur: 3.5,
  sonarFloorTint: 0.16, // additive cyan wash on the floor inside the pulse
  batAura: '#00E5FF',
  batAuraStrength: 0.38,

  // ── Enemies ────────────────────────────────────────────────
  enemyRim: '#FF1744',
  coneColor: '#FF1E44',
  coneOpacity: 0.45,
  coneHalfAngleDeg: GAME_CONFIG.HUNTER_VISION_HALF_ANGLE, // same wedge the AI uses to see
  coneLength: GAME_CONFIG.HUNTER_VISION_RANGE,

  // ── Hazards / pickups ──────────────────────────────────────
  laserCore: '#FFFFFF',
  laserColor: '#00FFFF',
  laserBloomBlur: 7,
  orbGlow: '#FFB300',
  crystalGlow: '#4DF0FF',
  exitChevron: '#61D9FF',
};
