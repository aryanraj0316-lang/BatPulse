import React from 'react';
import { GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../constants/palette';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { TouchInput } from '../input/TouchInput';

/** SONAR button diameter in dp. Never below the 64 dp minimum touch target. */
export const SONAR_BUTTON_DP = Math.max(ECHO_CONFIG.sonar.buttonMinDp, 88);
/** Invisible extra hit area around the button, so a thumb does not have to be exact. */
const HIT_SLOP = 24;
/** Space reserved for the HUD at the top (the stick zone starts below it). */
const HUD_HEIGHT = 120;

interface Props {
  input: TouchInput;
  /** Called when the stick moved, so the visual can refresh. */
  onStickChange: () => void;
  disabled?: boolean;
  /** Safe-area insets (notch, gesture bar) in dp. */
  insets: { top: number; bottom: number; left: number; right: number };
  /** true: stick appears where the thumb lands. false: fixed at (restX, restY). */
  /** Called on every touch-down (used to retry web audio that was blocked until the first gesture). */
  onTouchBegin?: () => void;
  floating: boolean;
  restX: number;
  restY: number;
}

/**
 * Raw touch handling for both thumbs. Plain touch events are delivered per finger and independently
 * per view, so the joystick and SONAR work at the same time (the responder system would only allow one).
 */
export const Controls: React.FC<Props> = ({ input, onStickChange, disabled, insets, floating, restX, restY, onTouchBegin }) => {
  const stickZone = {
    onTouchStart: (e: GestureResponderEvent) => {
      onTouchBegin?.();
      if (disabled) return;
      for (const t of e.nativeEvent.changedTouches) {
        input.stickDown(Number(t.identifier), floating ? t.pageX : restX, floating ? t.pageY : restY);
        // a fixed stick starts from wherever the finger landed relative to its centre
        input.stickMove(Number(t.identifier), t.pageX, t.pageY);
      }
      onStickChange();
    },
    onTouchMove: (e: GestureResponderEvent) => {
      for (const t of e.nativeEvent.changedTouches) input.stickMove(Number(t.identifier), t.pageX, t.pageY);
      onStickChange();
    },
    onTouchEnd: (e: GestureResponderEvent) => {
      for (const t of e.nativeEvent.changedTouches) input.stickUp(Number(t.identifier));
      onStickChange();
    },
    onTouchCancel: () => {
      input.cancelAll();
      onStickChange();
    },
  };

  const sonar = {
    onTouchStart: (e: GestureResponderEvent) => {
      onTouchBegin?.();
      if (disabled) return;
      for (const t of e.nativeEvent.changedTouches) input.sonarDown(Number(t.identifier));
    },
    onTouchEnd: (e: GestureResponderEvent) => {
      for (const t of e.nativeEvent.changedTouches) input.sonarUp(Number(t.identifier));
    },
    onTouchCancel: (e: GestureResponderEvent) => {
      for (const t of e.nativeEvent.changedTouches) input.sonarUp(Number(t.identifier));
    },
  };

  return (
    <>
      {/* joystick: the whole right side, floating origin where the thumb lands */}
      <View style={[styles.stickZone, { top: insets.top + HUD_HEIGHT, right: insets.right }]} testID="stick-zone" {...stickZone} />
      {/* SONAR: bottom-left */}
      <View
        style={[styles.sonarHit, { left: 16 - HIT_SLOP + insets.left, bottom: 36 - HIT_SLOP + insets.bottom }]}
        testID="sonar-button"
        {...sonar}
      >
        <View style={styles.sonarButton} pointerEvents="none">
          <View style={styles.ringOuter} />
          <View style={styles.ringInner} />
          <View style={styles.dot} />
          <Text style={styles.sonarText}>SONAR</Text>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  stickZone: { position: 'absolute', bottom: 0, width: '62%', zIndex: 50 },
  sonarHit: {
    position: 'absolute',
    width: SONAR_BUTTON_DP + HIT_SLOP * 2,
    height: SONAR_BUTTON_DP + HIT_SLOP * 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
  },
  sonarButton: {
    width: SONAR_BUTTON_DP,
    height: SONAR_BUTTON_DP,
    borderRadius: SONAR_BUTTON_DP / 2,
    backgroundColor: 'rgba(10, 16, 28, 0.75)',
    borderWidth: 1.5,
    borderColor: PALETTE.sonarCyan,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: PALETTE.sonarCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
  ringOuter: {
    position: 'absolute',
    width: SONAR_BUTTON_DP - 16,
    height: SONAR_BUTTON_DP - 16,
    borderRadius: SONAR_BUTTON_DP,
    borderWidth: 1.5,
    borderColor: PALETTE.sonarCyan,
    borderStyle: 'dashed',
    opacity: 0.4,
  },
  ringInner: {
    position: 'absolute',
    width: SONAR_BUTTON_DP * 0.5,
    height: SONAR_BUTTON_DP * 0.5,
    borderRadius: SONAR_BUTTON_DP,
    borderWidth: 2,
    borderColor: PALETTE.sonarCyan,
    opacity: 0.8,
  },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: PALETTE.sonarCyan },
  sonarText: {
    position: 'absolute',
    bottom: 10,
    color: PALETTE.sonarCyan,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
