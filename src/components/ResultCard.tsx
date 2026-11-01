import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, LayoutChangeEvent, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Timer, Radio, Star, ArrowRight, RotateCw, Menu } from 'lucide-react-native';
import { ScoreBreakdown } from '../engine/ScoringSystem';
import { UI } from '../ui/theme';
import { LiveCanvas } from '../render/LiveCanvas';
import { drawNightCastle } from '../render/menuScenes';

const SCREEN = Dimensions.get('window');

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

const C = {
  gold: '#F2B54A',
  goldText: '#F0B04A',
  bronze: '#7A6040',
  bronzeDim: 'rgba(160, 125, 80, 0.28)',
  title: '#EFE8DC',
  header: '#B9B2A6',
  subtitle: '#8D9AB8',
  label: '#9C9CA4',
  value: '#E8E6E1',
  starOff: '#3A3A3E',
  panelBorder: 'rgba(255, 255, 255, 0.09)',
};

/** Splits "★★ — complete in under 25s. You took 59s." into readable text + the highlighted value. */
function parseReason(reason: string) {
  const text = reason.replace(/^[★\s]*—\s*/, '');
  const pretty = text.charAt(0).toUpperCase() + text.slice(1);
  const m = pretty.match(/^(.*\b(?:took|had)\s+)(\S+?)(\.?)$/);
  const isTime = /under\s+\d+s/.test(pretty);
  if (!m) return { before: pretty, highlight: '', after: '', isTime };
  return { before: m[1], highlight: m[2], after: m[3], isTime };
}

/** Card outline with concave notched corners. */
function frame(w: number, h: number, inset: number, r: number) {
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  return (
    `M${x0 + r},${y0}H${x1 - r}A${r},${r} 0 0 0 ${x1},${y0 + r}` +
    `V${y1 - r}A${r},${r} 0 0 0 ${x1 - r},${y1}` +
    `H${x0 + r}A${r},${r} 0 0 0 ${x0},${y1 - r}` +
    `V${y0 + r}A${r},${r} 0 0 0 ${x0 + r},${y0}Z`
  );
}

const GoldLine: React.FC<{ flip?: boolean }> = ({ flip }) => (
  <LinearGradient
    colors={['rgba(242,181,74,0)', 'rgba(242,181,74,0.75)']}
    start={{ x: flip ? 1 : 0, y: 0 }}
    end={{ x: flip ? 0 : 1, y: 0 }}
    style={styles.headerLine}
  />
);

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
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: Math.round(width), h: Math.round(height) });
  };
  const reason = score.missingStarReason ? parseReason(score.missingStarReason) : null;
  const ReasonIcon = reason?.isTime === false ? Radio : Timer;

  return (
    <Modal visible={visible} transparent animationType="fade">
      {/* moonlit castle the bat escaped to */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LiveCanvas width={SCREEN.width} height={SCREEN.height} fps={30} animated={visible} draw={(c, t, w, h) => drawNightCastle(c, t, w, h)} />
      </View>
      <LinearGradient
        colors={['rgba(2, 4, 10, 0.2)', 'rgba(2, 4, 8, 0.5)', 'rgba(0, 0, 0, 0.25)']}
        style={styles.overlay}
      >
        <View style={styles.card} onLayout={onLayout}>
          {/* Carved frame */}
          {size.w > 0 && (
            <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
              <Defs>
                <SvgGradient id="rcFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#18181B" />
                  <Stop offset="0.5" stopColor="#111113" />
                  <Stop offset="1" stopColor="#0B0B0D" />
                </SvgGradient>
              </Defs>
              <Path d={frame(size.w, size.h, 1, 18)} fill="url(#rcFill)" stroke={C.bronze} strokeWidth={1.5} />
              <Path d={frame(size.w, size.h, 6, 16)} fill="none" stroke={C.bronzeDim} strokeWidth={1} />
            </Svg>
          )}

          {/* Top ornament */}
          <View style={styles.ornament}>
            <GoldLine />
            <View style={styles.ornamentDiamond} />
            <GoldLine flip />
          </View>

          {/* Header */}
          <View style={styles.headerRow}>
            <GoldLine />
            <Text style={styles.headerTag}>LEVEL</Text>
            <Text style={styles.headerSpark}>✦</Text>
            <Text style={styles.headerTag}>COMPLETE</Text>
            <GoldLine flip />
          </View>
          <Text style={styles.titleText}>ECHO {levelNumber.toString().padStart(2, '0')}</Text>
          <Text style={styles.subtitleText}>{levelTitle.toUpperCase()}</Text>

          {/* 3-Star Rating */}
          <View style={styles.starsRow}>
            {[1, 2, 3].map((starIdx) => {
              const earned = starIdx <= score.stars;
              return (
                <View key={starIdx} style={earned ? styles.starGlow : undefined}>
                  <Star
                    size={50}
                    color={earned ? '#FFD27A' : C.starOff}
                    fill={earned ? C.gold : C.starOff}
                    strokeWidth={1}
                  />
                </View>
              );
            })}
          </View>

          {/* Missing star hint */}
          {reason && (
            <View style={styles.reasonBox}>
              <ReasonIcon size={22} color={C.gold} strokeWidth={2} />
              <Text style={styles.reasonText}>
                {reason.before}
                {reason.highlight ? <Text style={styles.reasonHighlight}>{reason.highlight}</Text> : null}
                {reason.after}
              </Text>
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
                <Text style={[styles.scoreValue, styles.goldValue]}>
                  x{score.momentumMultiplier.toFixed(1)}
                </Text>
              </View>
            )}

            {score.perfectEchoBonus > 0 && (
              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>PERFECT ECHO BONUS</Text>
                <Text style={[styles.scoreValue, styles.goldValue]}>+{score.perfectEchoBonus}</Text>
              </View>
            )}

            {score.blindFinishBonus > 0 && (
              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>BLIND FINISH BONUS</Text>
                <Text style={[styles.scoreValue, styles.goldValue]}>+{score.blindFinishBonus}</Text>
              </View>
            )}

            <View style={styles.divider} />

            <View style={styles.scoreRow}>
              <Text style={styles.totalLabel}>TOTAL SCORE</Text>
              <Text style={styles.totalValue}>{score.totalScore}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.scoreRow}>
              <View style={styles.shardLabelWrap}>
                <Star size={20} color={C.gold} fill={C.gold} strokeWidth={1} />
                <Text style={styles.shardRewardLabel}>ECHO SHARDS EARNED</Text>
              </View>
              <Text style={styles.shardRewardValue}>+{shardsEarned}</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonStack}>
            <Pressable onPress={onNextLevel} style={({ pressed }) => [styles.primaryWrap, pressed && styles.pressed]}>
              <LinearGradient
                colors={['#F3C47A', '#E2A95A', '#C98C42']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>NEXT ECHO</Text>
                <ArrowRight size={20} color="#1A1206" strokeWidth={2.4} />
              </LinearGradient>
            </Pressable>

            <View style={styles.secondaryRow}>
              <Pressable
                onPress={onInstantRetry}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <RotateCw size={20} color="#B8B4AC" strokeWidth={2.2} />
                <Text style={styles.secondaryButtonText}>RETRY</Text>
              </Pressable>

              <Pressable onPress={onMenu} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Menu size={20} color="#B8B4AC" strokeWidth={2.2} />
                <Text style={styles.secondaryButtonText}>MENU</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </LinearGradient>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 26,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 16,
  },
  ornament: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 90,
    marginBottom: 6,
  },
  ornamentDiamond: {
    width: 7,
    height: 7,
    borderWidth: 1,
    borderColor: C.gold,
    transform: [{ rotate: '45deg' }],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 8,
    marginBottom: 4,
  },
  headerLine: {
    flex: 1,
    height: 1,
  },
  headerTag: {
    fontFamily: UI.font.label,
    fontSize: 12,
    color: C.header,
    letterSpacing: 3,
  },
  headerSpark: {
    fontSize: 14,
    color: C.gold,
    textShadowColor: C.gold,
    textShadowRadius: 8,
  },
  titleText: {
    fontFamily: UI.font.heading,
    fontSize: 42,
    color: C.title,
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  subtitleText: {
    fontFamily: UI.font.label,
    fontSize: 12,
    color: C.subtitle,
    letterSpacing: 3.5,
    marginTop: 2,
    marginBottom: 14,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 22,
    marginBottom: 18,
  },
  starGlow: {
    shadowColor: '#FFB437',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
  },
  reasonBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 16,
  },
  reasonText: {
    flex: 1,
    fontFamily: UI.font.tech,
    fontSize: 15,
    color: '#D6D3CD',
    letterSpacing: 0.4,
  },
  reasonHighlight: {
    fontFamily: UI.font.techBold,
    color: C.goldText,
  },
  ghostBadge: {
    backgroundColor: 'rgba(242, 181, 74, 0.08)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(242, 181, 74, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 14,
  },
  ghostBadgeText: {
    fontFamily: UI.font.techBold,
    fontSize: 11,
    color: C.goldText,
    letterSpacing: 1.2,
  },
  scoreGrid: {
    alignSelf: 'stretch',
    marginHorizontal: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.panelBorder,
    gap: 10,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreLabel: {
    fontFamily: UI.font.tech,
    fontSize: 13,
    color: C.label,
    letterSpacing: 1.6,
  },
  scoreValue: {
    fontFamily: UI.font.techBold,
    fontSize: 15,
    color: C.value,
    fontVariant: ['tabular-nums'],
  },
  goldValue: {
    color: C.goldText,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  totalLabel: {
    fontFamily: UI.font.techBold,
    fontSize: 17,
    color: '#F2F0EB',
    letterSpacing: 2,
  },
  totalValue: {
    fontFamily: UI.font.techBold,
    fontSize: 24,
    color: '#F7F5F0',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  shardLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shardRewardLabel: {
    fontFamily: UI.font.techBold,
    fontSize: 13,
    color: C.goldText,
    letterSpacing: 1.4,
  },
  shardRewardValue: {
    fontFamily: UI.font.techBold,
    fontSize: 20,
    color: C.goldText,
  },
  buttonStack: {
    alignSelf: 'stretch',
    gap: 12,
  },
  primaryWrap: {
    borderRadius: 8,
    shadowColor: '#E8A84A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    height: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F8D9A0',
  },
  primaryButtonText: {
    fontFamily: UI.font.techBold,
    color: '#1A1206',
    fontSize: 18,
    letterSpacing: 2.6,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    height: 52,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  secondaryButtonText: {
    fontFamily: UI.font.techBold,
    color: '#D6D3CD',
    fontSize: 15,
    letterSpacing: 2,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
