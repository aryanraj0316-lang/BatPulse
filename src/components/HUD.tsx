import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PALETTE } from '../constants/palette';

/** Values the HUD shows. Refreshed ~10x per second (not every frame). */
export interface HudSnapshot {
  elapsedSec: number;
  charges: number;
  maxCharges: number;
  /** 0..1 fill of the charge that is recharging */
  rechargeFill: number;
  mode: 'recharge' | 'fixed';
  momentum: number;
  /** The bat carries a key for a door that is still locked. */
  hasKey?: boolean;
  /** Whole seconds left in the current safe-zone stay, 0 when the bat is not hiding. */
  hiddenSec?: number;
}

interface HUDProps {
  levelTitle: string;
  levelNumber: number;
  snap: HudSnapshot;
  onPause: () => void;
  onRestart: () => void;
  /** Safe-area top inset in dp. */
  topInset: number;
}

export const formatTime = (sec: number): string => {
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const HUD: React.FC<HUDProps> = React.memo(({ levelTitle, levelNumber, snap, onPause, onRestart, topInset }) => {
  const segments = Array.from({ length: snap.maxCharges }, (_, i) => {
    if (i < snap.charges) return 1;
    if (snap.mode === 'recharge' && i === snap.charges) return snap.rechargeFill;
    return 0;
  });

  return (
    <View style={[styles.container, { top: topInset + 8 }]} pointerEvents="box-none">
      <View style={styles.headerBox}>
        <View style={styles.titleColumn}>
          <Text style={styles.levelTag}>ECHO {levelNumber.toString().padStart(2, '0')}</Text>
          <Text style={styles.levelTitle} numberOfLines={1}>
            {levelTitle.toUpperCase()}
          </Text>
        </View>

        <View style={styles.timeBox}>
          <Text style={styles.timeLabel}>TIME</Text>
          <Text style={styles.timeValue} testID="hud-time">{formatTime(snap.elapsedSec)}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.hudButton} onPress={onRestart} activeOpacity={0.7} accessibilityLabel="Restart" testID="btn-restart">
            <Text style={styles.hudButtonText}>↺</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.hudButton} onPress={onPause} activeOpacity={0.7} accessibilityLabel="Pause" testID="btn-pause">
            <Text style={styles.hudButtonText}>⏸</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.gaugeContainer}>
        <View style={styles.gaugeHeader}>
          <Text style={styles.gaugeTitle} testID="hud-sonar">
            {snap.mode === 'fixed' ? `SONAR: ${snap.charges} / ${snap.maxCharges}` : `SONAR ${snap.charges} / ${snap.maxCharges}`}
          </Text>
          {/* only shown when relevant: carrying a key, or hiding in a safe zone */}
          {snap.hasKey ? (
            <Text style={styles.keyChip} testID="hud-key">
              🔑 KEY
            </Text>
          ) : null}
          {snap.hiddenSec ? (
            <Text style={styles.hiddenChip} testID="hud-hidden">
              HIDDEN {snap.hiddenSec}s
            </Text>
          ) : null}
          <Text style={styles.momentumLabel} testID="hud-momentum">MOMENTUM ×{snap.momentum.toFixed(1)}</Text>
        </View>
        <View style={styles.nodeBar}>
          {segments.map((fill, i) => (
            <View key={i} style={styles.node}>
              <View style={[styles.nodeFill, { width: `${Math.round(fill * 100)}%`, opacity: fill >= 1 ? 1 : 0.55 }]} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
});
HUD.displayName = 'HUD';

const styles = StyleSheet.create({
  keyChip: { fontSize: 10, fontWeight: '900', color: '#FFD866', letterSpacing: 1 },
  hiddenChip: { fontSize: 10, fontWeight: '900', color: '#7CFFD1', letterSpacing: 1 },
  container: { position: 'absolute', left: 14, right: 14, zIndex: 100 },
  headerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(8, 13, 20, 0.85)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(77, 240, 255, 0.15)',
  },
  titleColumn: { flex: 1 },
  levelTag: { fontSize: 11, fontWeight: '700', color: PALETTE.sonarCyan, letterSpacing: 2 },
  levelTitle: { fontSize: 12, fontWeight: '600', color: '#CBD5E1', letterSpacing: 1.5, marginTop: 1 },
  timeBox: { alignItems: 'center', paddingHorizontal: 12 },
  timeLabel: { fontSize: 8, color: '#64748B', fontWeight: '700', letterSpacing: 1.5 },
  timeValue: { fontSize: 14, color: '#F8FAFC', fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: 1 },
  actions: { flexDirection: 'row', gap: 6 },
  hudButton: {
    width: 36,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hudButtonText: { color: '#F1F5F9', fontSize: 14, fontWeight: 'bold' },
  gaugeContainer: {
    marginTop: 8,
    backgroundColor: 'rgba(8, 13, 20, 0.75)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  gaugeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  gaugeTitle: { fontSize: 10, fontWeight: '800', color: PALETTE.sonarCyan, letterSpacing: 1.5 },
  momentumLabel: { fontSize: 10, fontWeight: '800', color: PALETTE.shardGold, letterSpacing: 1.2 },
  nodeBar: { flexDirection: 'row', gap: 4 },
  node: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  nodeFill: { height: '100%', backgroundColor: PALETTE.sonarCyan, borderRadius: 3 },
});
