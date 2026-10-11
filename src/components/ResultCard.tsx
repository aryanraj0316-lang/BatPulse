import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { PALETTE } from '../constants/palette';
import { ScoreBreakdown } from '../engine/ScoringSystem';

interface ResultCardProps {
  visible: boolean;
  levelNumber: number;
  levelTitle: string;
  score: ScoreBreakdown;
  shardsEarned: number;
  isGhostRun: boolean;
  onNextLevel: () => void;
  onInstantRetry: () => void;
  onMenu: () => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({
  visible,
  levelNumber,
  levelTitle,
  score,
  shardsEarned,
  isGhostRun,
  onNextLevel,
  onInstantRetry,
  onMenu,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <Text style={styles.headerTag}>✦ EXTRACTION SUCCESSFUL ✦</Text>
          <Text style={styles.titleText}>ECHO {levelNumber.toString().padStart(2, '0')}</Text>
          <Text style={styles.subtitleText}>{levelTitle.toUpperCase()}</Text>

          {/* 3-Star Rating */}
          <View style={styles.starsRow}>
            {[1, 2, 3].map((starIdx) => {
              const earned = starIdx <= score.stars;
              return (
                <Text
                  key={starIdx}
                  style={[
                    styles.starIcon,
                    {
                      color: earned ? PALETTE.shardGold : 'rgba(255,255,255,0.12)',
                      textShadowColor: earned ? PALETTE.shardGold : 'transparent',
                      textShadowRadius: 10,
                    },
                  ]}
                >
                  ★
                </Text>
              );
            })}
          </View>

          {/* Missing Star Replay Reason */}
          {score.missingStarReason && (
            <View style={styles.missingStarBox}>
              <Text style={styles.missingStarText}>{score.missingStarReason}</Text>
            </View>
          )}

          {/* Ghost Run Badge */}
          {isGhostRun && (
            <View style={styles.ghostBadge}>
              <Text style={styles.ghostBadgeText}>🦇 GHOST RUN · SILENT MASTERY</Text>
            </View>
          )}

          {/* Score & Rewards Breakdown */}
          <View style={styles.scoreGrid}>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>BASE SCORE</Text>
              <Text style={styles.scoreValue}>{score.baseScore}</Text>
            </View>

            {score.momentumMultiplier > 1.0 && (
              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>MOMENTUM MULTIPLIER</Text>
                <Text style={[styles.scoreValue, { color: PALETTE.shardGold }]}>
                  ×{score.momentumMultiplier.toFixed(1)}
                </Text>
              </View>
            )}

            {score.perfectEchoBonus > 0 && (
              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>PERFECT ECHO BONUS</Text>
                <Text style={[styles.scoreValue, { color: PALETTE.sonarCyan }]}>
                  +{score.perfectEchoBonus}
                </Text>
              </View>
            )}

            {score.blindFinishBonus > 0 && (
              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>BLIND FINISH BONUS</Text>
                <Text style={[styles.scoreValue, { color: PALETTE.goalViolet }]}>
                  +{score.blindFinishBonus}
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            <View style={styles.scoreRow}>
              <Text style={styles.totalLabel}>TOTAL SCORE</Text>
              <Text style={styles.totalValue}>{score.totalScore}</Text>
            </View>

            <View style={styles.shardRewardRow}>
              <Text style={styles.shardRewardLabel}>ECHO SHARDS EARNED</Text>
              <Text style={styles.shardRewardValue}>+{shardsEarned} ✦</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonStack}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onNextLevel}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>NEXT ECHO →</Text>
            </TouchableOpacity>

            <View style={styles.secondaryRow}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onInstantRetry}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryButtonText}>↺ RETRY CLEANER</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onMenu}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryButtonText}>≡ MENU</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4, 6, 10, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#080D16',
    borderRadius: 8,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: PALETTE.sonarCyan,
    shadowColor: PALETTE.sonarCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 18,
  },
  headerTag: {
    fontSize: 10,
    fontWeight: '800',
    color: PALETTE.goalViolet,
    letterSpacing: 2,
    marginBottom: 4,
  },
  titleText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  subtitleText: {
    fontSize: 11,
    color: '#94A3B8',
    letterSpacing: 1.5,
    marginTop: 2,
    marginBottom: 14,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  starIcon: {
    fontSize: 34,
  },
  missingStarBox: {
    backgroundColor: 'rgba(255, 201, 107, 0.08)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 201, 107, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  missingStarText: {
    fontSize: 10,
    color: PALETTE.shardGold,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
  },
  ghostBadge: {
    backgroundColor: 'rgba(77, 240, 255, 0.08)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: PALETTE.sonarCyan,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 14,
  },
  ghostBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: PALETTE.sonarCyan,
    letterSpacing: 1.2,
  },
  scoreGrid: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 6,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 6,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  scoreValue: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 4,
  },
  totalLabel: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  totalValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: 1,
  },
  shardRewardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  shardRewardLabel: {
    fontSize: 10,
    color: PALETTE.shardGold,
    fontWeight: '800',
    letterSpacing: 1,
  },
  shardRewardValue: {
    fontSize: 13,
    color: PALETTE.shardGold,
    fontWeight: '900',
  },
  buttonStack: {
    width: '100%',
    gap: 8,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: PALETTE.sonarCyan,
    shadowColor: PALETTE.sonarCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  primaryButtonText: {
    color: '#04060A',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 2,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1.2,
  },
});
