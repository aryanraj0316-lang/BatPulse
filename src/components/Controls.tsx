import React, { useEffect } from 'react';
import { GestureResponderEvent, StyleSheet, View } from 'react-native';
import { TouchInput } from '../input/TouchInput';
import { HUD_HEIGHT } from './HUD';


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
 * Raw touch handling for the whole play area (everything below the HUD). One view, one touch handler per finger:
 * a quick tap sends a pulse, a drag or a hold is the joystick (the decision lives in TouchInput so it can be tested
 * without a screen). The joystick and a tap by the other thumb work at the same time.
 */
export const Controls: React.FC<Props> = ({ input, onStickChange, disabled, insets, floating, restX, restY, onTouchBegin }) => {
  // a hold that turns into the joystick has no touch event of its own: let the view know
  useEffect(() => {
    input.onChange = onStickChange;
    return () => {
      if (input.onChange === onStickChange) input.onChange = null;
    };
  }, [input, onStickChange]);

  const zone = {
    onTouchStart: (e: GestureResponderEvent) => {
      onTouchBegin?.();
      if (disabled) return;
      // fixed stick: centred on its rest position; floating: appears where the thumb lands
      const anchor = floating ? null : { x: restX, y: restY };
      for (const t of e.nativeEvent.changedTouches) input.touchStart(Number(t.identifier), t.pageX, t.pageY, anchor);
    },
    onTouchMove: (e: GestureResponderEvent) => {
      for (const t of e.nativeEvent.changedTouches) input.touchMove(Number(t.identifier), t.pageX, t.pageY);
      onStickChange();
    },
    onTouchEnd: (e: GestureResponderEvent) => {
      for (const t of e.nativeEvent.changedTouches) input.touchEnd(Number(t.identifier));
      onStickChange();
    },
    onTouchCancel: () => {
      input.cancelAll();
      onStickChange();
    },
  };

  // no sonar button: a tap anywhere below the HUD is the pulse
  return <View style={[styles.zone, { top: insets.top + HUD_HEIGHT, left: insets.left, right: insets.right }]} testID="touch-zone" {...zone} />;
};

const styles = StyleSheet.create({
  zone: { position: 'absolute', bottom: 0, zIndex: 50 },
});
