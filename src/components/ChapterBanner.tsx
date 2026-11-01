import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Biome } from '../render/themes/biomes';
import { UI } from '../ui/theme';

const { width: SW, height: SH } = Dimensions.get('window');

interface Props {
  biome: Biome;
  levelNumber: number;
  levelName: string;
  /** a twist this chapter introduces, shown under the title */
  twist?: string | null;
}

/** Cinematic chapter title shown when a new biome begins. Purely visual; never blocks touches. */
export const ChapterBanner: React.FC<Props> = ({ biome, levelNumber, levelName, twist }) => {
  const fade = useRef(new Animated.Value(0)).current;
  const lines = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const seq = Animated.sequence([
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(lines, { toValue: 1, duration: 900, easing: Easing.out(Easing.exp), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.delay(twist ? 2600 : 1900),
      Animated.timing(fade, { toValue: 0, duration: 700, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    seq.start();
    return () => seq.stop();
  }, [fade, lines, sweep, twist]);

  const { accent, soft, deep } = biome.ui;
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity: fade }]}>
      <LinearGradient colors={['rgba(0,0,0,0)', `${deep}E6`, `${deep}F2`, `${deep}E6`, 'rgba(0,0,0,0)']} locations={[0, 0.22, 0.5, 0.78, 1]} style={styles.band} />
      {/* light sweeping across the band */}
      <Animated.View
        style={[
          styles.sweep,
          { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-SW * 0.6, SW * 1.1] }) }, { skewX: '-20deg' }] },
        ]}
      >
        <LinearGradient colors={['rgba(255,255,255,0)', `${accent}40`, 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.View style={{ alignItems: 'center', transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
        <View style={styles.row}>
          <Animated.View style={[styles.line, { transform: [{ scaleX: lines }] }]}>
            <LinearGradient colors={['rgba(0,0,0,0)', accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <Text style={[styles.chapter, { color: soft }]}>CHAPTER {biome.numeral}</Text>
          <Animated.View style={[styles.line, { transform: [{ scaleX: lines }] }]}>
            <LinearGradient colors={[accent, 'rgba(0,0,0,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
        <Text style={[styles.title, { textShadowColor: accent }]}>{biome.name.toUpperCase()}</Text>
        <Text style={[styles.tagline, { color: accent }]}>{biome.tagline}</Text>
        <Text style={styles.level}>
          ECHO {levelNumber.toString().padStart(2, '0')} · {levelName.toUpperCase()}
        </Text>
        {twist ? (
          <View style={[styles.twist, { borderColor: `${accent}99` }]}>
            <Text style={[styles.twistText, { color: soft }]}>{twist}</Text>
          </View>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: SH * 0.3,
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 400,
  },
  band: { ...StyleSheet.absoluteFill },
  sweep: { position: 'absolute', top: 0, bottom: 0, width: SW * 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { width: 54, height: 1.2 },
  chapter: { fontFamily: UI.font.label, fontSize: 12, letterSpacing: 5 },
  title: {
    fontFamily: UI.font.title,
    fontSize: SW < 400 ? 24 : 28,
    color: '#F4F1EA',
    letterSpacing: 1.5,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 16,
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  tagline: { fontFamily: UI.font.tech, fontSize: 14, letterSpacing: 1.6, marginTop: 4 },
  level: { fontFamily: UI.font.techBold, fontSize: 11, color: '#9AA4B4', letterSpacing: 2, marginTop: 12 },
  twist: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.35)', maxWidth: SW - 48 },
  twistText: { fontFamily: UI.font.tech, fontSize: 13, letterSpacing: 0.4, textAlign: 'center' },
});
