import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { SteelFrame } from '../ui/Frame';
import { UI } from '../ui/theme';

interface Props {
  text: string;
  /** ms before it appears */
  delay?: number;
  /** ms it stays fully visible */
  hold?: number;
}

/** A short tip that rises from the bottom, stays for a few seconds and fades. Never blocks touches. */
export const HintToast: React.FC<Props> = ({ text, delay = 900, hold = 6500 }) => {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const seq = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(a, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(hold),
      Animated.timing(a, { toValue: 0, duration: 600, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    seq.start();
    return () => seq.stop();
  }, [a, delay, hold, text]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}
    >
      <SteelFrame cut={12} padding={12} accent={UI.color.cyan} fillOpacity={0.92}>
        <View style={styles.row}>
          <View>
            <Svg width={28} height={28} viewBox="0 0 28 28">
              <Circle cx={14} cy={14} r={12.5} fill="rgba(0,0,0,0.4)" stroke={UI.color.cyan} strokeWidth={1.2} />
              <Path d="M14 7.5v8" stroke={UI.color.cyan} strokeWidth={2.4} strokeLinecap="round" />
              <Circle cx={14} cy={20} r={1.6} fill={UI.color.cyan} />
            </Svg>
          </View>
          <Text style={styles.text}>{text}</Text>
        </View>
      </SteelFrame>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, bottom: 34, zIndex: 120 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, fontFamily: UI.font.tech, fontSize: 15, lineHeight: 20, color: '#E2EAF2' },
});
