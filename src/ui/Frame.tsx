import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing, LayoutChangeEvent, ViewStyle, StyleProp } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Circle } from 'react-native-svg';
import { UI } from './theme';

/** Octagon-ish outline with cut corners, inset by `i`. */
export function chamferPath(w: number, h: number, c: number, i = 0) {
  const k = Math.max(0, c - i * 0.41);
  return `M${i + k},${i}H${w - i - k}L${w - i},${i + k}V${h - i - k}L${w - i - k},${h - i}H${i + k}L${i},${h - i - k}V${i + k}Z`;
}

interface FrameProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** edge tint; defaults to brushed steel */
  accent?: string;
  /** stronger, glowing accent edge (selected / equipped) */
  active?: boolean;
  /** corner cut size */
  cut?: number;
  /** fill top / bottom colours */
  fill?: [string, string];
  fillOpacity?: number;
  /** small diamond studs on the left/right edges, like the menu art */
  studs?: boolean;
  dim?: boolean;
  padding?: number;
}

/**
 * Bevelled steel panel with chamfered corners and smoky glass inside: the panel style of the
 * home screen art. Drawn in SVG so it fits any size.
 */
export const SteelFrame: React.FC<FrameProps> = ({
  children,
  style,
  accent,
  active,
  cut = 14,
  fill = ['#141B24', '#080B10'],
  fillOpacity = 0.9,
  studs = true,
  dim,
  padding = 16,
}) => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.round(width) !== size.w || Math.round(height) !== size.h) setSize({ w: Math.round(width), h: Math.round(height) });
  };
  const { w, h } = size;
  const edge = accent ?? '#8C96A4';
  const id = `sf${w}x${h}${(accent ?? 'x').replace('#', '')}${active ? 'a' : ''}`;
  return (
    <View style={[{ padding, opacity: dim ? 0.62 : 1 }, style]} onLayout={onLayout}>
      {w > 0 && (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={fill[0]} stopOpacity={fillOpacity} />
              <Stop offset="1" stopColor={fill[1]} stopOpacity={fillOpacity} />
            </SvgGradient>
            <SvgGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#E4EAF0" />
              <Stop offset="0.35" stopColor={active ? edge : '#7E8896'} />
              <Stop offset="0.7" stopColor="#3C444F" />
              <Stop offset="1" stopColor={active ? edge : '#9AA4B0'} />
            </SvgGradient>
          </Defs>
          {/* drop shadow */}
          <Path d={chamferPath(w, h, cut, 0)} fill="#000" opacity={0.45} transform="translate(0,3)" />
          <Path d={chamferPath(w, h, cut, 1)} fill={`url(#${id}f)`} />
          {/* top sheen */}
          <Path d={`M${cut + 2},2.5H${w - cut - 2}`} stroke="#FFFFFF" strokeOpacity={0.18} strokeWidth={1} />
          {active && <Path d={chamferPath(w, h, cut, 0)} fill="none" stroke={edge} strokeOpacity={0.35} strokeWidth={5} />}
          {/* metal rim + dark groove + inner hairline */}
          <Path d={chamferPath(w, h, cut, 1.5)} fill="none" stroke={`url(#${id}m)`} strokeWidth={2.2} />
          <Path d={chamferPath(w, h, cut, 4)} fill="none" stroke="#000" strokeOpacity={0.6} strokeWidth={1.4} />
          <Path d={chamferPath(w, h, cut, 5.5)} fill="none" stroke={active ? edge : '#FFFFFF'} strokeOpacity={active ? 0.45 : 0.06} strokeWidth={1} />
          {studs && h > 60 && (
            <>
              <Path d={`M1.5,${h / 2}l6,-6l6,6l-6,6Z`} fill="#1A2029" stroke={`url(#${id}m)`} strokeWidth={1.4} />
              <Path d={`M${w - 1.5},${h / 2}l-6,-6l-6,6l6,6Z`} fill="#1A2029" stroke={`url(#${id}m)`} strokeWidth={1.4} />
              <Circle cx={7.5} cy={h / 2} r={1.4} fill={active ? edge : '#9AA4B0'} />
              <Circle cx={w - 7.5} cy={h / 2} r={1.4} fill={active ? edge : '#9AA4B0'} />
            </>
          )}
        </Svg>
      )}
      {children}
    </View>
  );
};

/** Header used by every sub-screen: chamfered steel back button, carved title, cyan divider. */
/** Carved title text alone (for screens whose art already has the divider). */
export const CarvedTitle: React.FC<{ children: string; style?: StyleProp<ViewStyle> }> = ({ children, style }) => (
  <View style={[{ alignItems: 'center' }, style]} pointerEvents="none">
    <Text style={styles.title}>{children}</Text>
  </View>
);

export const CarvedHeader: React.FC<{ title?: string; subtitle?: string; onBack: () => void; right?: React.ReactNode }> = ({ title, subtitle, onBack, right }) => (
  <View style={styles.header}>
    <Pressable onPress={onBack} hitSlop={10} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.93 : 1 }] })}>
      <SteelFrame cut={9} padding={0} studs={false} style={styles.back}>
        <View>
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path d="M15 5l-7 7 7 7" stroke={UI.color.cyan} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      </SteelFrame>
    </Pressable>
    <View style={styles.titleWrap} pointerEvents="none">
      {title ? (
        <>
          <Text style={[styles.title, title.length > 11 && { fontSize: title.length > 13 ? 17 : 19, letterSpacing: 1.5 }]} numberOfLines={1} adjustsFontSizeToFit>
            {title}
          </Text>
          <Divider />
        </>
      ) : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{right}</View>
  </View>
);

/** Thin cyan line with a centred diamond (the home screen tagline ornament). */
export const Divider: React.FC<{ color?: string; width?: number }> = ({ color = UI.color.cyan, width = 190 }) => (
  <View style={[styles.divider, { width }]}>
    <View style={[styles.divLine, { backgroundColor: color }]} />
    <Svg width={12} height={12} viewBox="0 0 12 12" style={{ marginHorizontal: 6 }}>
      <Path d="M6 1l4.5 5L6 11 1.5 6z" fill="none" stroke={color} strokeWidth={1.4} />
      <Circle cx={6} cy={6} r={1.3} fill={color} />
    </Svg>
    <View style={[styles.divLine, { backgroundColor: color }]} />
  </View>
);

/** Small engraved section label: "◆ SOUND & FEEL" with a fading rule. */
export const SectionLabel: React.FC<{ children: string; color?: string; style?: StyleProp<ViewStyle> }> = ({ children, color = UI.color.cyan, style }) => (
  <View style={[styles.section, style]}>
    <Svg width={9} height={9} viewBox="0 0 10 10">
      <Path d="M5 0l5 5-5 5-5-5z" fill={color} />
    </Svg>
    <Text style={[styles.sectionText, { color }]}>{children}</Text>
    <View style={[styles.sectionRule, { backgroundColor: color }]} />
  </View>
);

/** Iron lever switch: the knob slides along a groove and the rune lights cyan when on. */
export const RuneToggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => {
  const a = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: value ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, a]);
  const W = 58;
  const H = 30;
  return (
    <Pressable onPress={() => onChange(!value)} hitSlop={10} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={{ width: W, height: H }}>
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Path d={chamferPath(W, H, 8, 1)} fill="#06090D" stroke="#56606C" strokeWidth={1.4} />
          <Path d={chamferPath(W, H, 8, 4)} fill="none" stroke="#000" strokeOpacity={0.7} />
        </Svg>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { margin: 4, borderRadius: 3, backgroundColor: UI.color.cyan, opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }) },
          ]}
        />
        <Animated.View style={[styles.knob, { transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [4, W - 26] }) }] }]}>
          <Svg width={22} height={22}>
            <Defs>
              <SvgGradient id="knob" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#D8DEE6" />
                <Stop offset="0.5" stopColor="#7C8794" />
                <Stop offset="1" stopColor="#3A424C" />
              </SvgGradient>
            </Defs>
            <Path d={chamferPath(22, 22, 6, 0.5)} fill="url(#knob)" stroke="#1A1F26" strokeWidth={1} />
            <Path d="M11 5l5 6-5 6-5-6z" fill={value ? UI.color.cyan : '#20262E'} stroke={value ? '#E8FDFF' : '#4A535E'} strokeWidth={0.8} />
          </Svg>
        </Animated.View>
      </View>
    </Pressable>
  );
};

/** Slow looping 0→1 value for idle animations (shimmer, breathing glows). */
export function useLoop(duration = 2400, native = true) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: native }));
    loop.start();
    return () => loop.stop();
  }, [v, duration, native]);
  return v;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 },
  back: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  title: {
    fontFamily: UI.font.title,
    fontSize: 24,
    letterSpacing: 2.5,
    color: '#E8ECF0',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 2 },
  },
  subtitle: { fontFamily: UI.font.techBold, fontSize: 11.5, letterSpacing: 3, color: UI.color.cyanSoft, marginTop: 4, opacity: 0.85 },
  divider: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  divLine: { flex: 1, height: 1, opacity: 0.7 },
  section: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionText: { fontFamily: UI.font.label, fontSize: 12, letterSpacing: 3 },
  sectionRule: { flex: 1, height: 1, opacity: 0.25 },
  knob: { position: 'absolute', top: 4, left: 0, width: 22, height: 22 },
});
