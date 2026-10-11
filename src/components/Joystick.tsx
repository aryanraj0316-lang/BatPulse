import React, { useRef, useCallback } from 'react';
import { View, StyleSheet, GestureResponderEvent, Platform } from 'react-native';
import { Vec2 } from '../types/game';
import { PALETTE } from '../constants/palette';

interface JoystickProps {
  onInput: React.MutableRefObject<Vec2>;
}

/**
 * Minimal floating joystick using direct responder handlers (NOT PanResponder).
 * Writes directly to a mutable ref for zero-latency game loop input.
 */
export const Joystick: React.FC<JoystickProps> = ({ onInput }) => {
  const originRef = useRef<Vec2>({ x: 0, y: 0 });
  const isActiveRef = useRef(false);
  const knobRef = useRef<View>(null);
  const baseRef = useRef<View>(null);

  const MAX_RADIUS = 46;

  const handleStart = useCallback((e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    originRef.current = { x: pageX, y: pageY };
    isActiveRef.current = true;

    // Position the base at touch origin
    baseRef.current?.setNativeProps({
      style: {
        left: pageX - 45,
        top: pageY - 45,
        opacity: 1.0,
        borderColor: PALETTE.sonarCyan,
      },
    });
    knobRef.current?.setNativeProps({
      style: {
        transform: [{ translateX: 0 }, { translateY: 0 }],
        backgroundColor: PALETTE.sonarCyan,
      },
    });
  }, []);

  const handleMove = useCallback((e: GestureResponderEvent) => {
    if (!isActiveRef.current) return;

    const { pageX, pageY } = e.nativeEvent;
    const dx = pageX - originRef.current.x;
    const dy = pageY - originRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let clampedX = dx;
    let clampedY = dy;
    if (dist > MAX_RADIUS) {
      clampedX = (dx / dist) * MAX_RADIUS;
      clampedY = (dy / dist) * MAX_RADIUS;
    }

    // Write directly to game loop ref (zero allocation)
    onInput.current = {
      x: clampedX / MAX_RADIUS,
      y: clampedY / MAX_RADIUS,
    };

    // Update knob visual without re-render
    knobRef.current?.setNativeProps({
      style: {
        transform: [{ translateX: clampedX }, { translateY: clampedY }],
      },
    });
  }, [onInput]);

  const handleEnd = useCallback(() => {
    isActiveRef.current = false;
    onInput.current = { x: 0, y: 0 };

    knobRef.current?.setNativeProps({
      style: {
        transform: [{ translateX: 0 }, { translateY: 0 }],
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
      },
    });
    baseRef.current?.setNativeProps({
      style: {
        opacity: 0.35,
        borderColor: 'rgba(255, 255, 255, 0.2)',
      },
    });
  }, [onInput]);

  return (
    <View
      style={styles.touchZone}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleStart}
      onResponderMove={handleMove}
      onResponderRelease={handleEnd}
      onResponderTerminate={handleEnd}
    >
      <View ref={baseRef} style={styles.base}>
        <View ref={knobRef} style={styles.knob} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  touchZone: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: '50%',
    height: '42%',
    zIndex: 100,
  },
  base: {
    position: 'absolute',
    left: 60,
    top: 80,
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(10, 16, 28, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.35,
  },
  knob: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
});
