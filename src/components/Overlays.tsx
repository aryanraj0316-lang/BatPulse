import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../constants/palette';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { TouchInput } from '../input/TouchInput';

/** Shows the joystick ring and knob where the thumb is; a faint resting ring when idle. */
export const StickVisual: React.FC<{ input: TouchInput; restX: number; restY: number }> = ({ input, restX, restY }) => {
  const r = ECHO_CONFIG.player.joystickRadius;
  const active = input.active;
  const cx = active ? input.originX : restX;
  const cy = active ? input.originY : restY;
  return (
    // the whole stick is drawn at low opacity: it only marks where it is, it must not distract from the dark
    <View style={[StyleSheet.absoluteFill, { opacity: active ? ECHO_CONFIG.input.stickActiveAlpha : ECHO_CONFIG.input.stickRestAlpha }]} pointerEvents="none" testID="stick-visual">
      <View
        style={[
          styles.ring,
          {
            left: cx - r,
            top: cy - r,
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            borderColor: active ? PALETTE.sonarCyan : '#FFFFFF',
            backgroundColor: active ? 'rgba(77, 240, 255, 0.08)' : 'rgba(10, 16, 28, 0.3)',
          },
        ]}
      />
      <View
        style={[
          styles.knob,
          {
            left: cx + input.knobX - 20,
            top: cy + input.knobY - 20,
            backgroundColor: active ? PALETTE.sonarCyan : '#FFFFFF',
          },
        ]}
      />
    </View>
  );
};

/** Onboarding hint, shown under the HUD. */
export const HintBanner: React.FC<{ text: string | null; topInset: number }> = ({ text, topInset }) => {
  if (!text) return null;
  return (
    <View style={[styles.hintWrap, { top: topInset + 128 }]} pointerEvents="none">
      <Text style={styles.hint} testID="hint-text">
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 1.5 },
  knob: { position: 'absolute', width: 40, height: 40, borderRadius: 20 },
  hintWrap: { position: 'absolute', left: 24, right: 24, alignItems: 'center', zIndex: 90 },
  hint: {
    color: '#E2F8FF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
    backgroundColor: 'rgba(8, 13, 20, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(77, 240, 255, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    overflow: 'hidden',
  },
});
