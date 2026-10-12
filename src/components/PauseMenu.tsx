import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { PALETTE } from '../constants/palette';

interface Props {
  visible: boolean;
  onResume: () => void;
  onRestart: () => void;
  onHome: () => void;
}

export const PauseMenu: React.FC<Props> = ({ visible, onResume, onRestart, onHome }) => (
  <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onResume}>
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>PAUSED</Text>
        <TouchableOpacity style={styles.primary} onPress={onResume} activeOpacity={0.8} testID="btn-resume">
          <Text style={styles.primaryText}>RESUME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={onRestart} activeOpacity={0.7} testID="btn-pause-restart">
          <Text style={styles.secondaryText}>↺ RESTART</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={onHome} activeOpacity={0.7} testID="btn-pause-home">
          <Text style={styles.secondaryText}>⌂ HOME</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(4, 6, 10, 0.88)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: '#0A111C',
    borderRadius: 12,
    padding: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(77, 240, 255, 0.35)',
    gap: 10,
  },
  title: { color: PALETTE.sonarCyan, fontSize: 16, fontWeight: '900', letterSpacing: 4, textAlign: 'center', marginBottom: 6 },
  primary: { backgroundColor: PALETTE.sonarCyan, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#001018', fontWeight: '900', fontSize: 14, letterSpacing: 2 },
  secondary: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  secondaryText: { color: '#E2E8F0', fontWeight: '700', fontSize: 12, letterSpacing: 1.5 },
});
