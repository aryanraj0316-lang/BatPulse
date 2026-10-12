import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { PALETTE } from '../constants/palette';
import { formatTime } from './HUD';

export interface ResultData {
  stars: 1 | 2 | 3;
  timeSec: number;
  bestMomentum: number;
  score: number;
  shardsEarned: number;
  isNewBestTime: boolean;
  /** seconds needed for the next star, if not at 3 stars */
  nextStarAt: number | null;
}

interface Props {
  visible: boolean;
  levelNumber: number;
  levelTitle: string;
  result: ResultData;
  /** false when there is no further level to go to */
  hasNext: boolean;
  onNext: () => void;
  onRetry: () => void;
  onHome: () => void;
}

export const ResultCard: React.FC<Props> = ({ visible, levelNumber, levelTitle, result, hasNext, onNext, onRetry, onHome }) => (
  <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.headerTag}>✦ LEVEL COMPLETE ✦</Text>
        <Text style={styles.titleText}>ECHO {levelNumber.toString().padStart(2, '0')}</Text>
        <Text style={styles.subtitleText}>{levelTitle.toUpperCase()}</Text>

        <View style={styles.starsRow} testID="result-stars">
          {[1, 2, 3].map((i) => (
            <Text key={i} style={[styles.starIcon, { color: i <= result.stars ? PALETTE.shardGold : 'rgba(255,255,255,0.12)' }]}>
              ★
            </Text>
          ))}
        </View>
        {result.nextStarAt !== null && (
          <Text style={styles.hint}>{result.stars === 1 ? '★★' : '★★★'} under {Math.floor(result.nextStarAt)}s</Text>
        )}

        <View style={styles.grid}>
          <Row label="TIME" value={`${formatTime(result.timeSec)}${result.isNewBestTime ? '  NEW BEST' : ''}`} testID="result-time" />
          <Row label="BEST MOMENTUM" value={`×${result.bestMomentum.toFixed(1)}`} color={PALETTE.shardGold} testID="result-momentum" />
          <Row label="SCORE" value={String(result.score)} />
          <View style={styles.divider} />
          <Row label="ECHO SHARDS" value={`+${result.shardsEarned} ✦`} color={PALETTE.shardGold} big testID="result-shards" />
        </View>

        <View style={styles.buttons}>
          {hasNext && (
            <TouchableOpacity style={styles.primary} onPress={onNext} activeOpacity={0.8} testID="btn-next">
              <Text style={styles.primaryText}>NEXT →</Text>
            </TouchableOpacity>
          )}
          <View style={styles.secondaryRow}>
            <TouchableOpacity style={styles.secondary} onPress={onRetry} activeOpacity={0.7} testID="btn-retry">
              <Text style={styles.secondaryText}>↺ RETRY</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={onHome} activeOpacity={0.7} testID="btn-home">
              <Text style={styles.secondaryText}>⌂ HOME</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  </Modal>
);

const Row: React.FC<{ label: string; value: string; color?: string; big?: boolean; testID?: string }> = ({ label, value, color, big, testID }) => (
  <View style={styles.row}>
    <Text style={[styles.rowLabel, big && styles.rowLabelBig]}>{label}</Text>
    <Text style={[styles.rowValue, big && styles.rowValueBig, color ? { color } : null]} testID={testID}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(4, 6, 10, 0.92)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#0A111C',
    borderRadius: 12,
    padding: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(77, 240, 255, 0.35)',
    alignItems: 'center',
  },
  headerTag: { fontSize: 10, fontWeight: '800', color: PALETTE.sonarCyan, letterSpacing: 2.5 },
  titleText: { fontSize: 26, fontWeight: '900', color: '#F8FAFC', letterSpacing: 3, marginTop: 6 },
  subtitleText: { fontSize: 11, color: '#94A3B8', letterSpacing: 2, marginTop: 2 },
  starsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  starIcon: { fontSize: 38 },
  hint: { fontSize: 10, color: '#94A3B8', letterSpacing: 1, marginTop: 2 },
  grid: { width: '100%', marginTop: 16, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 10, color: '#64748B', fontWeight: '700', letterSpacing: 1.5 },
  rowLabelBig: { color: '#CBD5E1' },
  rowValue: { fontSize: 14, color: '#F8FAFC', fontWeight: '700', fontVariant: ['tabular-nums'] },
  rowValueBig: { fontSize: 18, fontWeight: '900' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 4 },
  buttons: { width: '100%', marginTop: 18, gap: 10 },
  primary: { backgroundColor: PALETTE.sonarCyan, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#001018', fontWeight: '900', fontSize: 14, letterSpacing: 2 },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondary: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  secondaryText: { color: '#E2E8F0', fontWeight: '700', fontSize: 12, letterSpacing: 1.5 },
});
