import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg from 'react-native-svg';
import { AssetRegistry } from '../assets/AssetRegistry';
import { PALETTE } from '../constants/palette';

interface Props {
  /** Play the short dark jump effect before the menu appears (the gate decides, see JumpGate). */
  jump: boolean;
  onRetry: () => void;
  onHome: () => void;
}

/** Length of the jump effect (ms). */
export const JUMP_MS = 650;

/**
 * Shown when a hunter catches the bat. A brief dark flash with a large hunter eye (once in a while, see JumpGate),
 * then the choice to retry immediately ("Retry Cleaner") or leave.
 */
export const FailScreen: React.FC<Props> = ({ jump, onRetry, onHome }) => {
  const flash = useRef(new Animated.Value(jump ? 1 : 0)).current;
  const menu = useRef(new Animated.Value(jump ? 0 : 1)).current;
  const Eye = AssetRegistry.getVisual('enemy_hunter');
  // the jump layer is removed entirely once it is over, so nothing of it lingers behind the menu
  const [jumping, setJumping] = useState(jump);

  useEffect(() => {
    if (jump) {
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 60, useNativeDriver: false }),
        Animated.timing(flash, { toValue: 0, duration: JUMP_MS - 60, useNativeDriver: false }),
      ]).start();
      Animated.timing(menu, { toValue: 1, duration: 250, delay: JUMP_MS - 100, useNativeDriver: false }).start();
      const id = setTimeout(() => setJumping(false), JUMP_MS + 50);
      return () => clearTimeout(id);
    }
  }, [jump, flash, menu]);

  return (
    <View style={styles.overlay} testID="fail-screen">
      {jump && jumping && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.jump, { opacity: flash }]} pointerEvents="none" testID="jump-effect">
          <Svg width={320} height={320} viewBox="0 0 320 320">
            <Eye x={160} y={160} width={300} height={300} glow={1} active />
          </Svg>
        </Animated.View>
      )}
      <Animated.View style={[styles.card, { opacity: menu }]}>
        <Text style={styles.title}>CAUGHT</Text>
        <Text style={styles.tip}>Hunters hear pulses. Pulse far from them, and listen for the heartbeat.</Text>
        <TouchableOpacity style={styles.primary} onPress={onRetry} activeOpacity={0.8} testID="btn-retry-cleaner">
          <Text style={styles.primaryText}>RETRY CLEANER</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={onHome} activeOpacity={0.7} testID="btn-fail-home">
          <Text style={styles.secondaryText}>⌂ HOME</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(2, 3, 6, 0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 95 }, // below the HUD (100): restart and pause stay usable
  jump: { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  card: { width: '82%', maxWidth: 320, alignItems: 'center', gap: 12 },
  title: { color: PALETTE.wraithRed, fontSize: 26, fontWeight: '900', letterSpacing: 6 },
  tip: { color: '#94A3B8', fontSize: 11, textAlign: 'center', letterSpacing: 0.5, marginBottom: 6 },
  primary: { width: '100%', backgroundColor: PALETTE.wraithRed, borderRadius: 8, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 3 },
  secondary: {
    width: '100%',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  secondaryText: { color: '#E2E8F0', fontWeight: '700', fontSize: 12, letterSpacing: 1.5 },
});
