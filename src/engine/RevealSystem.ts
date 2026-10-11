import { RevealTier, Revealable } from '../types/game';
import { GAME_CONFIG } from '../constants/gameConfig';
import { PALETTE } from '../constants/palette';

export class RevealSystem {
  /**
   * Calculates the current reveal tier, opacity, jitter offset, and stroke styling
   * for an object based on elapsed time since ping and distance falloff.
   */
  static getRevealVisuals(
    revealable: Revealable,
    now: number
  ): {
    tier: RevealTier;
    opacity: number;
    jitterX: number;
    jitterY: number;
    color: string;
    strokeWidth: number;
  } {
    if (!revealable.revealedAt) {
      return { tier: 'GONE', opacity: 0, jitterX: 0, jitterY: 0, color: 'transparent', strokeWidth: 0 };
    }

    const elapsed = now - revealable.revealedAt;
    const distanceFalloff = Math.max(0.4, revealable.revealStrength || 1.0);

    const fullDuration = GAME_CONFIG.REVEAL_FULL_DURATION * distanceFalloff;
    const fadeDuration = GAME_CONFIG.REVEAL_FADE_DURATION * distanceFalloff;
    const echoDuration = GAME_CONFIG.REVEAL_ECHO_DURATION * distanceFalloff;

    // 1. FRESH Tier: Crisp bright cyan glow
    if (elapsed < fullDuration) {
      const progress = elapsed / fullDuration;
      const opacity = 1.0 - progress * 0.45; // 1.0 -> 0.55
      return {
        tier: 'FRESH',
        opacity: Math.max(0.55, opacity),
        jitterX: 0,
        jitterY: 0,
        color: PALETTE.sonarCyan,
        strokeWidth: 2.2,
      };
    }

    // 2. FADING Tier: Mid-decay teal
    const fadeElapsed = elapsed - fullDuration;
    if (fadeElapsed < fadeDuration) {
      const progress = fadeElapsed / fadeDuration;
      const opacity = 0.55 - progress * 0.43; // 0.55 -> 0.12
      return {
        tier: 'FADING',
        opacity: Math.max(0.12, opacity),
        jitterX: 0,
        jitterY: 0,
        color: PALETTE.echoTeal,
        strokeWidth: 1.5,
      };
    }

    // 3. ECHO Tier: Memory afterimage with procedural uncertainty jitter
    const echoElapsed = fadeElapsed - fadeDuration;
    if (echoElapsed < echoDuration) {
      const progress = echoElapsed / echoDuration;
      const opacity = 0.12 * (1.0 - progress);

      // Safe character code sum (never produces NaN)
      let idHash = 0;
      const str = revealable.id || '';
      for (let i = 0; i < str.length; i++) {
        idHash = (idHash * 31 + str.charCodeAt(i)) & 0xffff;
      }

      const jitterScale = (1.0 - distanceFalloff + progress * 0.5) * GAME_CONFIG.ECHO_JITTER_AMPLITUDE;
      const freq = (now * 0.004) + (idHash % 60);
      const sinVal = Math.sin(freq);
      const cosVal = Math.cos(freq * 1.3);

      const jitterX = Number.isFinite(sinVal) ? sinVal * jitterScale : 0;
      const jitterY = Number.isFinite(cosVal) ? cosVal * jitterScale : 0;

      return {
        tier: 'ECHO',
        opacity: Math.max(0.02, opacity),
        jitterX,
        jitterY,
        color: PALETTE.memoryDust,
        strokeWidth: 1.0,
      };
    }

    // 4. GONE: Total darkness
    return {
      tier: 'GONE',
      opacity: 0,
      jitterX: 0,
      jitterY: 0,
      color: 'transparent',
      strokeWidth: 0,
    };
  }
}
