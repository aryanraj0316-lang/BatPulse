import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { PALETTE } from '../constants/palette';
import { DEBUG_ENABLED, DebugFlags, useDebugFlags } from '../debug/debugFlags';

interface DevPanelProps {
  visible: boolean;
  onClose: () => void;
  /** Debug level jump: starts the given level immediately (0 = data-file test level). */
  onJumpToLevel?: (levelId: number) => void;
}

const TOGGLES: { key: keyof DebugFlags; label: string }[] = [
  { key: 'unlimitedShards', label: 'Unlimited shards' },
  { key: 'showHitboxes', label: 'Show hitboxes' },
  { key: 'showHearing', label: 'Show enemy hearing radius (needs enemies, Phase 3)' },
  { key: 'showFps', label: 'FPS counter' },
  { key: 'slowMotion', label: 'Slow motion (0.3x)' },
];

const TuneRow: React.FC<{ label: string; onMinus: () => void; onPlus: () => void }> = ({ label, onMinus, onPlus }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.btnRow}>
      <TouchableOpacity style={styles.adjustBtn} onPress={onMinus}>
        <Text style={styles.btnTxt}>-</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.adjustBtn} onPress={onPlus}>
        <Text style={styles.btnTxt}>+</Text>
      </TouchableOpacity>
    </View>
  </View>
);

export const DevPanel: React.FC<DevPanelProps> = ({ visible, onClose, onJumpToLevel }) => {
  const flags = useDebugFlags();
  const [jumpLevel, setJumpLevel] = useState(0);
  // Debug tooling never exists in release builds.
  if (!DEBUG_ENABLED) return null;

  const [speed, setSpeed] = useState(ECHO_CONFIG.player.speed);
  const [radiusFraction, setRadiusFraction] = useState(ECHO_CONFIG.sonar.maxRadiusScreenFraction);
  const [momentumInterval, setMomentumInterval] = useState(ECHO_CONFIG.momentum.intervalSec);

  // Live tuning: takes effect for the next level start (the config object is read by the systems).
  const applyChanges = () => {
    ECHO_CONFIG.player.speed = speed;
    ECHO_CONFIG.sonar.maxRadiusScreenFraction = radiusFraction;
    ECHO_CONFIG.momentum.intervalSec = momentumInterval;
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.title}>ENGINE TUNING PANEL</Text>

          <ScrollView style={styles.scroll}>
            {/* Level jump */}
            <View style={styles.row}>
              <Text style={styles.label}>Level jump: {jumpLevel === 0 ? 'TEST' : `Echo ${String(jumpLevel).padStart(2, '0')}`}</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.adjustBtn} onPress={() => setJumpLevel((v) => Math.max(0, v - 1))}>
                  <Text style={styles.btnTxt}>-</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.adjustBtn} onPress={() => setJumpLevel((v) => Math.min(50, v + 1))}>
                  <Text style={styles.btnTxt}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.adjustBtn, { width: 44 }]}
                  onPress={() => {
                    onClose();
                    onJumpToLevel?.(jumpLevel);
                  }}
                >
                  <Text style={styles.btnTxt}>GO</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Debug toggles */}
            {TOGGLES.map((t) => (
              <View key={t.key} style={styles.row}>
                <Text style={styles.label}>{t.label}</Text>
                <TouchableOpacity
                  style={[styles.adjustBtn, { width: 44 }, flags[t.key] && { backgroundColor: PALETTE.sonarCyan }]}
                  onPress={() => flags.set(t.key, !flags[t.key])}
                >
                  <Text style={[styles.btnTxt, { fontSize: 11 }, flags[t.key] && { color: '#000' }]}>{flags[t.key] ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TuneRow label={`Player speed: ${speed}`} onMinus={() => setSpeed((v) => Math.max(80, v - 10))} onPlus={() => setSpeed((v) => Math.min(320, v + 10))} />
            <TuneRow
              label={`Pulse radius: ${Math.round(radiusFraction * 100)}% of width`}
              onMinus={() => setRadiusFraction((v) => Math.max(0.15, Math.round((v - 0.05) * 100) / 100))}
              onPlus={() => setRadiusFraction((v) => Math.min(0.9, Math.round((v + 0.05) * 100) / 100))}
            />
            <TuneRow
              label={`Momentum step every: ${momentumInterval}s`}
              onMinus={() => setMomentumInterval((v) => Math.max(0.5, Math.round((v - 0.5) * 10) / 10))}
              onPlus={() => setMomentumInterval((v) => Math.min(6, Math.round((v + 0.5) * 10) / 10))}
            />
          </ScrollView>

          <TouchableOpacity style={styles.applyBtn} onPress={applyChanges}>
            <Text style={styles.applyTxt}>APPLY & RESUME</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  panel: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#0E1726',
    borderRadius: 8,
    padding: 18,
    borderWidth: 1.5,
    borderColor: PALETTE.sonarCyan,
  },
  title: {
    fontSize: 13,
    fontWeight: '900',
    color: PALETTE.sonarCyan,
    letterSpacing: 2,
    marginBottom: 14,
    textAlign: 'center',
  },
  scroll: {
    maxHeight: 380,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  label: {
    fontSize: 11,
    color: '#E2E8F0',
    fontWeight: '600',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 6,
  },
  adjustBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnTxt: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  applyBtn: {
    marginTop: 14,
    paddingVertical: 12,
    backgroundColor: PALETTE.sonarCyan,
    borderRadius: 6,
    alignItems: 'center',
  },
  applyTxt: {
    color: '#000',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1.5,
  },
});
