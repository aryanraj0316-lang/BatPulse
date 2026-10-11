import { LevelData } from '../types/game';
import { GAME_CONFIG } from '../constants/gameConfig';

export interface ScoreBreakdown {
  stars: number;
  baseScore: number;
  momentumMultiplier: number;
  perfectEchoBonus: number;
  ghostRunBonus: number;
  blindFinishBonus: number;
  totalScore: number;
  star1Earned: boolean;
  star2Earned: boolean;
  star3Earned: boolean;
  missingStarReason: string | null;
}

export class ScoringSystem {
  static evaluateScore(
    level: LevelData,
    elapsedSeconds: number,
    sonarUsed: number,
    maxSonar: number,
    finalMomentum: number,
    wasGhostRun: boolean,
    wasBlindFinish: boolean
  ): ScoreBreakdown {
    // Star 1: Complete level
    const star1Earned = true;

    // Star 2: Under parTime
    const star2Earned = elapsedSeconds <= level.par.time;

    // Star 3: Under parTime AND <= parSonar
    const star3Earned = star2Earned && sonarUsed <= level.par.sonarUsed;

    let stars = 1;
    if (star3Earned) {
      stars = 3;
    } else if (star2Earned) {
      stars = 2;
    }

    // Determine exact missing star reason for player feedback
    let missingStarReason: string | null = null;
    if (stars === 2) {
      const neededLeft = maxSonar - level.par.sonarUsed;
      const actualLeft = maxSonar - sonarUsed;
      missingStarReason = `★★★ — finish with ${neededLeft} pulses left. You had ${actualLeft}.`;
    } else if (stars === 1) {
      missingStarReason = `★★ — complete in under ${level.par.time}s. You took ${Math.floor(elapsedSeconds)}s.`;
    }

    // Momentum multiplier: 1.0 + momentum * 0.1
    const momentumMultiplier = 1.0 + finalMomentum * 0.1;

    // Perfect Echo bonus: remaining * 250
    const pulsesRemaining = Math.max(0, maxSonar - sonarUsed);
    const perfectEchoBonus = pulsesRemaining * GAME_CONFIG.PERFECT_ECHO_BONUS;

    // Ghost Run bonus
    const ghostRunBonus = wasGhostRun ? GAME_CONFIG.GHOST_RUN_BONUS : 0;

    // Base score calculation
    const timeBonus = Math.max(0, Math.floor((level.par.time * 2 - elapsedSeconds) * 25));
    const baseScore = 500 + timeBonus;

    let subtotal = (baseScore + perfectEchoBonus + ghostRunBonus) * momentumMultiplier;

    // Blind finish bonus (+50%)
    let blindFinishBonus = 0;
    if (wasBlindFinish) {
      blindFinishBonus = Math.floor(subtotal * 0.5);
      subtotal += blindFinishBonus;
    }

    const totalScore = Math.floor(subtotal);

    return {
      stars,
      baseScore,
      momentumMultiplier,
      perfectEchoBonus,
      ghostRunBonus,
      blindFinishBonus,
      totalScore,
      star1Earned,
      star2Earned,
      star3Earned,
      missingStarReason,
    };
  }
}
