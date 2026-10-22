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

/** Height of the one-line HUD plus a small gap; the play area starts below this (shared with the touch zone). */
export const HUD_HEIGHT = 56;

/**
 * One compact line: level number, timer, sonar charges (bars and count), momentum, key / hiding chips, restart and pause.
 * The level's name is not shown here (it is on the result card).
 */
export const HUD: React.FC<HUDProps> = React.memo(({ levelTitle, levelNumber, snap, onPause, onRestart, topInset }) => {
  const segments = Array.from({ length: snap.maxCharges }, (_, i) => {
    if (i < snap.charges) return 1;
    if (snap.mode === 'recharge' && i === snap.charges) return snap.rechargeFill;
    return 0;
  });

  return (
    <View style={[styles.container, { top: topInset + 6 }]} pointerEvents="box-none">
      <View style={styles.bar} accessibilityLabel={levelTitle}>
        <Text style={styles.levelTag} numberOfLines={1}>
          ECHO {levelNumber.toString().padStart(2, '0')}
        </Text>
        <Text style={styles.timeValue} testID="hud-time">
          {formatTime(snap.elapsedSec)}
        </Text>

        {/* sonar charges: the bars shrink first when the line is tight */}
        <View style={styles.sonar}>
          <View style={styles.nodeBar}>
            {segments.map((fill, i) => (
              <View key={i} style={styles.node}>
                <View style={[styles.nodeFill, { width: `${Math.round(fill * 100)}%`, opacity: fill >= 1 ? 1 : 0.55 }]} />
              </View>
            ))}
          </View>
          <Text style={styles.gaugeTitle} testID="hud-sonar" accessibilityLabel="Sonar charges" numberOfLines={1}>
            {snap.charges} / {snap.maxCharges}
          </Text>
        </View>

        {/* only shown when relevant: carrying a key, or hiding in a safe zone */}
        {snap.hasKey ? (
          <Text style={styles.keyChip} testID="hud-key">
            🔑
          </Text>
        ) : null}
        {snap.hiddenSec ? (
          <Text style={styles.hiddenChip} testID="hud-hidden">
            HIDDEN {snap.hiddenSec}s
          </Text>
        ) : null}
        {/* while hiding the bat is (nearly) still and its momentum is not in play: the room goes to the sonar bars */}
        {snap.hiddenSec ? null : (
          <Text style={styles.momentumLabel} testID="hud-momentum">
            ×{snap.momentum.toFixed(1)}
          </Text>
        )}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.hudButton} onPress={onRestart} activeOpacity={0.7} accessibilityLabel="Restart" testID="btn-restart">
            <Text style={styles.hudButtonText}>↺</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.hudButton} onPress={onPause} activeOpacity={0.7} accessibilityLabel="Pause" testID="btn-pause">
            <Text style={styles.hudButtonText}>⏸</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});
HUD.displayName = 'HUD';

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 10, right: 10, zIndex: 100 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    backgroundColor: 'rgba(8, 13, 20, 0.85)',
    borderRadius: 8,
    paddingLeft: 10,
    paddingRight: 5,
    borderWidth: 1,
    borderColor: 'rgba(77, 240, 255, 0.15)',
  },
  levelTag: { fontSize: 11, fontWeight: '800', color: PALETTE.sonarCyan, letterSpacing: 1.2 },
  timeValue: { fontSize: 13, color: '#F8FAFC', fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  sonar: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  nodeBar: { flex: 1, minWidth: 36, maxWidth: 70, flexDirection: 'row', gap: 3 },
  node: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  nodeFill: { height: '100%', backgroundColor: PALETTE.sonarCyan, borderRadius: 3 },
  gaugeTitle: { flexShrink: 0, fontSize: 11, fontWeight: '800', color: PALETTE.sonarCyan, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  keyChip: { flexShrink: 0, fontSize: 12, fontWeight: '900', color: '#FFD866' },
  hiddenChip: { flexShrink: 0, fontSize: 10, fontWeight: '900', color: '#7CFFD1', letterSpacing: 0.5 },
  momentumLabel: { fontSize: 11, fontWeight: '800', color: PALETTE.shardGold, letterSpacing: 0.5 },
  actions: { flexDirection: 'row', gap: 4 },
  hudButton: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hudButtonText: { color: '#F1F5F9', fontSize: 13, fontWeight: 'bold' },
});
