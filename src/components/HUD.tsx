import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Dimensions, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Circle, Defs, RadialGradient, LinearGradient, Stop, G, ClipPath, Rect } from 'react-native-svg';
import { Timer, Zap, Pause } from 'lucide-react-native';
import { ART } from '../render/art/kit';
import { UI } from '../ui/theme';

interface HUDProps {
  levelTitle: string;
  levelNumber: number;
  /** replaces "ECHO n" (e.g. "FLOOR 4" in Endless) */
  levelLabel?: string;
  sonarRemaining: number;
  maxSonar: number;
  elapsedSeconds: number;
  momentum: number;
  isFrenzy: boolean;
  onPause: () => void;
  onRestart: () => void;
  /** -1 = not reloading, else 0..1 progress of the pulse being recharged */
  reloadProgress?: number;
  /** 0 = no key in level, 1 = key not found yet, 2 = key collected */
  keyState?: number;
}

// Narrow phones get tighter spacing so the bar never overflows.
const COMPACT = Dimensions.get('window').width < 400;

const BAR_H = 46;
const EMBLEM = 50;

const C = {
  text: '#F2F4F7',
  dim: '#8E9BB0',
  sonar: '#7CC0FF',
  gold: '#E9A93F',
  dotOff: '#4A4F58',
  steel: '#5E6876',
  steelDark: '#22272F',
};

const BAT_EMBLEM_D =
  'M15,4.5 L13.6,1.5 L13.2,4.6 C11.5,4.8 10.6,6.2 10.4,7.4 C8.8,5.2 5.6,3.6 0.5,4.2 C3,5.6 3.6,7.6 3.4,9.4 C5,8.6 6.6,9 7.4,10.4 C8.8,9.8 10.4,10.4 11.2,12 C12.4,12.4 13.6,14.4 15,17 C16.4,14.4 17.6,12.4 18.8,12 C19.6,10.4 21.2,9.8 22.6,10.4 C23.4,9 25,8.6 26.6,9.4 C26.4,7.6 27,5.6 29.5,4.2 C24.4,3.6 21.2,5.2 19.6,7.4 C19.4,6.2 18.5,4.8 16.8,4.6 L16.4,1.5 Z';

const SonarIcon: React.FC<{ color: string }> = ({ color }) => (
  <Svg width={22} height={22} viewBox="0 0 20 20">
    <Circle cx={4} cy={10} r={2} fill={color} />
    <Path d="M8,5.5 A6,6 0 0 1 8,14.5" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
    <Path d="M11.5,2.5 A10,10 0 0 1 11.5,17.5" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.75} />
    <Path d="M15,0.5 A13,13 0 0 1 15,19.5" stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.45} />
  </Svg>
);

/** Row of small round pips. `fill` is 0..count (fractional = dimmer partial pip). */
const Dots: React.FC<{ count: number; fill: number; color: string; glow: Animated.Value }> = ({ count, fill, color, glow }) => (
  <View style={styles.dotRow}>
    {Array.from({ length: count }).map((_, i) => {
      const amt = Math.max(0, Math.min(1, fill - i));
      return (
        <View key={i} style={styles.dot}>
          {amt > 0 && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: 3,
                  backgroundColor: color,
                  shadowColor: color,
                  shadowOpacity: 0.9,
                  shadowRadius: 3,
                  shadowOffset: { width: 0, height: 0 },
                  opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.75 * amt + 0.1, amt] }),
                },
              ]}
            />
          )}
        </View>
      );
    })}
  </View>
);

/** Chamfered metal bar outline. */
const barPath = (w: number, h: number, inset: number) => {
  const a = 10 - inset * 0.5; // chamfer size
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  return `M${x0 + a},${y0}H${x1 - a}L${x1},${y0 + a}V${y1 - a}L${x1 - a},${y1}H${x0 + a}L${x0},${y1 - a}V${y0 + a}Z`;
};

export const HUD: React.FC<HUDProps> = React.memo(
  ({ levelTitle, levelNumber, levelLabel, sonarRemaining, maxSonar, elapsedSeconds, momentum, isFrenzy, onPause, reloadProgress = -1, keyState = 0 }) => {
    const glow = useRef(new Animated.Value(0)).current;
    const [barW, setBarW] = useState(0);
    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }, [glow]);

    const mins = Math.floor(elapsedSeconds / 60);
    const secs = Math.floor(elapsedSeconds % 60);
    const time = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    const isInfinite = maxSonar >= 999;
    const multiplier = (1.0 + momentum * 0.1).toFixed(1);
    const sonarColor = isFrenzy ? ART.wraithRed : C.sonar;
    const sonarDots = isInfinite ? 4 : Math.min(maxSonar, 8);
    const momentumFill = Math.max(1, Math.min(4, (momentum / 20) * 4));

    const onLayout = (e: LayoutChangeEvent) => setBarW(Math.round(e.nativeEvent.layout.width));

    return (
      <View style={styles.container} pointerEvents="box-none">
        {/* Metal bar */}
        <View style={styles.bar} onLayout={onLayout}>
          {barW > 0 && (
            <Svg width={barW} height={BAR_H} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="hudBar" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#1C222B" />
                  <Stop offset="0.55" stopColor="#10141A" />
                  <Stop offset="1" stopColor="#0A0D12" />
                </LinearGradient>
                <LinearGradient id="hudRim" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#8893A2" />
                  <Stop offset="0.5" stopColor={C.steel} />
                  <Stop offset="1" stopColor="#2C323B" />
                </LinearGradient>
              </Defs>
              <Path d={barPath(barW, BAR_H, 1)} fill="url(#hudBar)" stroke={isFrenzy ? ART.wraithRed : 'url(#hudRim)'} strokeWidth={2} />
              <Path d={barPath(barW, BAR_H, 4)} fill="none" stroke="#000000" strokeOpacity={0.55} strokeWidth={1} />
            </Svg>
          )}

          {/* Level */}
          <View style={styles.titleCol}>
            <View style={styles.row}>
              <Text style={styles.level} numberOfLines={1}>{levelLabel ?? `ECHO ${levelNumber}`}</Text>
              {keyState > 0 && (
                <Svg width={14} height={14} viewBox="0 0 14 14" style={{ marginLeft: 5 }}>
                  <Circle cx={4.5} cy={4.5} r={3} stroke={keyState === 2 ? C.gold : '#4B5563'} strokeWidth={1.8} fill="none" />
                  <Path d="M6.7,6.7L12.5,12.5M10,10L11.6,8.4M11.6,11.6L13,10.2" stroke={keyState === 2 ? C.gold : '#4B5563'} strokeWidth={1.8} strokeLinecap="round" />
                </Svg>
              )}
            </View>
            <Text style={styles.levelName} numberOfLines={1}>
              {levelTitle.toUpperCase()}
            </Text>
          </View>

          <View style={styles.divider} />

          {/* Time */}
          <View style={styles.row}>
            <Timer size={COMPACT ? 17 : 20} color={C.text} strokeWidth={1.8} />
            <View style={styles.statCol}>
              <Text style={styles.label}>TIME</Text>
              <Text style={styles.value}>{time}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Sonar */}
          <View style={styles.row}>
            <SonarIcon color={sonarColor} />
            <View style={styles.statCol}>
              <Text style={[styles.label, { color: sonarColor }]} numberOfLines={1}>
                {isFrenzy ? 'FRENZY!' : isInfinite ? 'SONAR ∞' : `SONAR ${sonarRemaining}/${maxSonar}`}
              </Text>
              <Dots
                count={sonarDots}
                fill={isInfinite ? 4 : (sonarRemaining / maxSonar) * sonarDots}
                color={sonarColor}
                glow={glow}
              />
            </View>
          </View>

          <View style={styles.divider} />

          {/* Momentum */}
          <View style={styles.row}>
            <Zap size={COMPACT ? 17 : 20} color={C.gold} fill={C.gold} strokeWidth={1} />
            <View style={styles.statCol}>
              <Text style={[styles.label, { color: C.gold }]} numberOfLines={1}>
                MOMENTUM
              </Text>
              <View style={styles.row}>
                <Dots count={4} fill={momentumFill} color={C.gold} glow={glow} />
                <Text style={styles.mult}>x{multiplier}</Text>
              </View>
            </View>
          </View>

          {/* Pause */}
          <TouchableOpacity style={styles.pause} onPress={onPause} activeOpacity={0.7} hitSlop={8}>
            <Pause size={14} color="#E4D3B0" fill="#E4D3B0" strokeWidth={1} />
          </TouchableOpacity>
        </View>

        {/* Bat emblem, overlapping the bar's left end */}
        <View style={styles.emblem} pointerEvents="none">
          <Svg width={EMBLEM} height={EMBLEM}>
            <Defs>
              <RadialGradient id="hudEmblem" cx="50%" cy="40%" r="60%">
                <Stop offset="0" stopColor="#2A2416" />
                <Stop offset="1" stopColor="#07090D" />
              </RadialGradient>
              <LinearGradient id="hudEmblemRim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#C7A26A" />
                <Stop offset="0.5" stopColor="#6E5432" />
                <Stop offset="1" stopColor="#3A2C1A" />
              </LinearGradient>
            </Defs>
            <Circle cx={EMBLEM / 2} cy={EMBLEM / 2} r={EMBLEM / 2 - 1} fill="#14171C" stroke="#4E5662" strokeWidth={1.5} />
            <Circle cx={EMBLEM / 2} cy={EMBLEM / 2} r={EMBLEM / 2 - 5} fill="url(#hudEmblem)" stroke="url(#hudEmblemRim)" strokeWidth={2.5} />
            {reloadProgress < 0 ? (
              <G transform={`translate(${EMBLEM / 2 - 15 * 1.05},${EMBLEM / 2 - 9.5 * 1.05}) scale(1.05)`}>
                <Path d={BAT_EMBLEM_D} fill="#D9A55A" />
              </G>
            ) : (
              <>
                {/* sonar recharging: the bat fills with gold from bottom to top */}
                <Defs>
                  <ClipPath id="hudReloadClip">
                    <Rect x={0} y={15 + 18 * (1 - reloadProgress)} width={EMBLEM} height={18 * reloadProgress + 1} />
                  </ClipPath>
                </Defs>
                <G transform={`translate(${EMBLEM / 2 - 15 * 1.05},${EMBLEM / 2 - 9.5 * 1.05}) scale(1.05)`}>
                  <Path d={BAT_EMBLEM_D} fill="#3A3424" />
                </G>
                <G clipPath="url(#hudReloadClip)">
                  <G transform={`translate(${EMBLEM / 2 - 15 * 1.05},${EMBLEM / 2 - 9.5 * 1.05}) scale(1.05)`}>
                    <Path d={BAT_EMBLEM_D} fill="#D9A55A" />
                  </G>
                </G>
                <Circle cx={EMBLEM / 2} cy={EMBLEM / 2} r={EMBLEM / 2 - 5} fill="none" stroke={C.sonar} strokeWidth={1.4} strokeOpacity={0.6} />
              </>
            )}
          </Svg>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    left: 4,
    right: 4,
    height: EMBLEM,
    justifyContent: 'center',
    zIndex: 100,
  },
  bar: {
    height: BAR_H,
    marginLeft: EMBLEM * 0.42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: EMBLEM * 0.58 + 6,
    paddingRight: 5,
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 10,
  },
  emblem: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: EMBLEM,
    height: EMBLEM,
    elevation: 11,
    zIndex: 2,
  },
  titleCol: {
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  level: {
    color: C.text,
    fontFamily: UI.font.techBold,
    fontSize: COMPACT ? 13 : 15,
    flexShrink: 0,
    letterSpacing: 0.4,
  },
  levelName: {
    color: C.dim,
    fontFamily: UI.font.techBold,
    fontSize: COMPACT ? 8.5 : 9.5,
    letterSpacing: 0.6,
    marginTop: -1,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(143, 155, 176, 0.22)',
    marginHorizontal: COMPACT ? 5 : 8,
  },
  statCol: { marginLeft: COMPACT ? 3 : 5 },
  label: {
    color: C.dim,
    fontFamily: UI.font.techBold,
    fontSize: COMPACT ? 8 : 9,
    letterSpacing: 0.4,
  },
  value: {
    color: C.text,
    fontFamily: UI.font.techBold,
    fontSize: COMPACT ? 15 : 17,
    marginTop: -2,
    fontVariant: ['tabular-nums'],
  },
  dotRow: { flexDirection: 'row', gap: COMPACT ? 2 : 2.5, marginTop: 3 },
  dot: {
    width: COMPACT ? 4.5 : 5,
    height: COMPACT ? 4.5 : 5,
    borderRadius: 3,
    backgroundColor: C.dotOff,
  },
  mult: {
    color: C.gold,
    fontFamily: UI.font.techBold,
    fontSize: COMPACT ? 9 : 10,
    marginLeft: 4,
    marginTop: 2,
  },
  pause: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: '#5E6876',
    backgroundColor: '#0B0E13',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: COMPACT ? 5 : 8,
  },
});
