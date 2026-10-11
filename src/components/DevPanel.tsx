import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { GAME_CONFIG } from '../constants/gameConfig';
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
  { key: 'showHearing', label: 'Show enemy hearing radius' },
  { key: 'showFps', label: 'FPS counter' },
  { key: 'slowMotion', label: 'Slow motion (0.3x)' },
];

export const DevPanel: React.FC<DevPanelProps> = ({ visible, onClose, onJumpToLevel }) => {
  const flags = useDebugFlags();
  const [jumpLevel, setJumpLevel] = useState(0);
  // Debug tooling never exists in release builds.
  if (!DEBUG_ENABLED) return null;

  const [wraithSpeedRatio, setWraithSpeedRatio] = useState(GAME_CONFIG.HUNTER_SPEED_RATIO);
  const [sonarRadius, setSonarRadius] = useState(GAME_CONFIG.SONAR_RADIUS);
  const [hearingRadius, setHearingRadius] = useState(GAME_CONFIG.HUNTER_HEARING_RADIUS);

  const applyChanges = () => {
    GAME_CONFIG.HUNTER_SPEED_RATIO = wraithSpeedRatio;
    GAME_CONFIG.SONAR_RADIUS = sonarRadius;
    GAME_CONFIG.HUNTER_HEARING_RADIUS = hearingRadius;
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

            {/* Wraith Speed */}
            <View style={styles.row}>
              <Text style={styles.label}>Wraith Speed: {wraithSpeedRatio.toFixed(2)}×</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.adjustBtn}
                  onPress={() => setWraithSpeedRatio((v) => Math.max(0.4, v - 0.05))}
                >
                  <Text style={styles.btnTxt}>-</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.adjustBtn}
                  onPress={() => setWraithSpeedRatio((v) => Math.min(1.4, v + 0.05))}
                >
                  <Text style={styles.btnTxt}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Sonar Radius */}
            <View style={styles.row}>
              <Text style={styles.label}>Sonar Radius: {sonarRadius}px</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.adjustBtn}
                  onPress={() => setSonarRadius((v) => Math.max(150, v - 20))}
                >
                  <Text style={styles.btnTxt}>-</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.adjustBtn}
                  onPress={() => setSonarRadius((v) => Math.min(450, v + 20))}
                >
                  <Text style={styles.btnTxt}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Hearing Radius */}
            <View style={styles.row}>
              <Text style={styles.label}>Hearing Radius: {hearingRadius}px</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.adjustBtn}
                  onPress={() => setHearingRadius((v) => Math.max(150, v - 30))}
                >
                  <Text style={styles.btnTxt}>-</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.adjustBtn}
                  onPress={() => setHearingRadius((v) => Math.min(600, v + 30))}
                >
                  <Text style={styles.btnTxt}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
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
