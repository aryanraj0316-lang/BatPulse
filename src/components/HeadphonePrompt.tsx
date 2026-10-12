import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { PALETTE } from '../constants/palette';

interface HeadphonePromptProps {
  visible: boolean;
  onProceed: () => void;
}

export const HeadphonePrompt: React.FC<HeadphonePromptProps> = ({ visible, onProceed }) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.icon}>🎧</Text>
          <Text style={styles.title}>HEADPHONES STRONGLY RECOMMENDED</Text>
          <Text style={styles.description}>
            Echolocation relies on directional sound cues and spatial audio. Headphones make the pulses, echoes and the hunters' heartbeat much clearer.
          </Text>

          <TouchableOpacity style={styles.button} onPress={onProceed} activeOpacity={0.8}>
            <Text style={styles.buttonText}>INITIALIZE ACOUSTIC SENSORS →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4, 6, 10, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#080D14',
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: PALETTE.sonarCyan,
  },
  icon: {
    fontSize: 42,
    marginBottom: 16,
  },
  title: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 0.5,
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 6,
    backgroundColor: PALETTE.sonarCyan,
    alignItems: 'center',
  },
  buttonText: {
    color: '#04060A',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.5,
  },
});
