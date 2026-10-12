import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PALETTE } from '../constants/palette';

/** How long the splash stays (ms). Tapping skips it. */
export const SPLASH_MS = 1400;

export const SplashScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  useEffect(() => {
    const id = setTimeout(onDone, SPLASH_MS);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <TouchableOpacity style={styles.container} activeOpacity={1} onPress={onDone} testID="splash">
      <View style={styles.ring} />
      <View style={[styles.ring, styles.ring2]} />
      <Text style={styles.title}>ECHOLOCATION</Text>
      <Text style={styles.subtitle}>SEE THE WORLD THROUGH SOUND</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.voidBlack, justifyContent: 'center', alignItems: 'center' },
  ring: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    borderColor: PALETTE.sonarCyan,
    opacity: 0.35,
  },
  ring2: { width: 260, height: 260, borderRadius: 130, opacity: 0.15, borderStyle: 'dashed' },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', letterSpacing: 6 },
  subtitle: { color: PALETTE.sonarCyan, fontSize: 10, fontWeight: '700', letterSpacing: 3, marginTop: 8 },
});
