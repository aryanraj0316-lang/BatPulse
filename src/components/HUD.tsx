import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Dimensions } from 'react-native';
import Svg, { Path, Circle, Defs, RadialGradient, Stop, G, ClipPath, Rect } from 'react-native-svg';
import { Timer, Zap, Pause } from 'lucide-react-native';
import { ART } from '../render/art/kit';

interface HUDProps {
  levelTitle: string;
  levelNumber: number;
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

// Narrow phones get shorter labels so the bar never overflows.
const COMPACT = Dimensions.get('window').width < 430;

const BAT_EMBLEM_D =
  'M15,4.5 L13.6,1.5 L13.2,4.6 C11.5,4.8 10.6,6.2 10.4,7.4 C8.8,5.2 5.6,3.6 0.5,4.2 C3,5.6 3.6,7.6 3.4,9.4 C5,8.6 6.6,9 7.4,10.4 C8.8,9.8 10.4,10.4 11.2,12 C12.4,12.4 13.6,14.4 15,17 C16.4,14.4 17.6,12.4 18.8,12 C19.6,10.4 21.2,9.8 22.6,10.4 C23.4,9 25,8.6 26.6,9.4 C26.4,7.6 27,5.6 29.5,4.2 C24.4,3.6 21.2,5.2 19.6,7.4 C19.4,6.2 18.5,4.8 16.8,4.6 L16.4,1.5 Z';

const SonarIcon: React.FC<{ color: string }> = ({ color }) => (
  <Svg width={20} height={20} viewBox="0 0 20 20">
    <Circle cx={4} cy={10} r={2} fill={color} />
    <Path d="M8,5.5 A6,6 0 0 1 8,14.5" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
    <Path d="M11.5,2.5 A10,10 0 0 1 11.5,17.5" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.75} />
    <Path d="M15,0.5 A13,13 0 0 1 15,19.5" stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.45} />
  </Svg>
);

/** Thin glowing segmented bar. `fill` is 0..segments (fractional = partial segment). */
const SegBar: React.FC<{ segments: number; fill: number; color: string; glow: Animated.Value; width: number }> = ({
  segments,
  fill,
  color,
  glow,
  width,
}) => (
  <View style={[styles.segRow, { width }]}>
    {Array.from({ length: segments }).map((_, i) => {
      const amt = Math.max(0, Math.min(1, fill - i));
      return (
        <View key={i} style={styles.seg}>
          {amt > 0 && (
            <Animated.View
              style={[
                styles.segFill,
                {
                  width: `${amt * 100}%`,
                  backgroundColor: color,
                  shadowColor: color,
                  opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
                },
              ]}
            />
          )}
        </View>
      );
    })}
  </View>
);

export const HUD: React.FC<HUDProps> = React.memo(
  ({ levelTitle, levelNumber, sonarRemaining, maxSonar, elapsedSeconds, momentum, isFrenzy, onPause, reloadProgress = -1, keyState = 0 }) => {
    const glow = useRef(new Animated.Value(0)).current;
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
    const accent = isFrenzy ? ART.wraithRed : ART.cyan;

    return (
      <View style={styles.container} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.glowRim,
            { borderColor: accent, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] }) },
          ]}
          pointerEvents="none"
        />
        <View style={[styles.pill, { borderColor: isFrenzy ? ART.wraithRed : 'rgba(97, 217, 255, 0.6)' }]}>
          {/* Emblem */}
          <View style={styles.emblem}>
            <Svg width={40} height={40}>
              <Defs>
                <RadialGradient id="hudEmblem" cx="50%" cy="40%" r="60%">
                  <Stop offset="0" stopColor="#2A2414" />
                  <Stop offset="1" stopColor="#07090D" />
                </RadialGradient>
              </Defs>
              <Circle cx={20} cy={20} r={19} fill="url(#hudEmblem)" stroke={ART.gold} strokeWidth={1.2} strokeOpacity={0.7} />
              {reloadProgress < 0 ? (
                <G transform="translate(5,11)">
                  <Path d={BAT_EMBLEM_D} fill={ART.gold} />
                </G>
              ) : (
                <>
                  {/* sonar recharging: the bat fills with gold from bottom to top */}
                  <Defs>
                    <ClipPath id="hudReloadClip">
                      <Rect x={0} y={11 + 17 * (1 - reloadProgress)} width={40} height={17 * reloadProgress + 1} />
                    </ClipPath>
                  </Defs>
                  <G transform="translate(5,11)">
                    <Path d={BAT_EMBLEM_D} fill="#3A3424" />
                  </G>
                  <G clipPath="url(#hudReloadClip)">
                    <G transform="translate(5,11)">
                      <Path d={BAT_EMBLEM_D} fill={ART.gold} />
                    </G>
                  </G>
                  <Circle cx={20} cy={20} r={19} fill="none" stroke={ART.cyan} strokeWidth={1.2} strokeOpacity={0.55} />
                </>
              )}
            </Svg>
          </View>

          {/* Level */}
          <View style={styles.titleCol}>
            <View style={styles.row}>
              <Text style={styles.level} numberOfLines={1}>ECHO {levelNumber}</Text>
              {keyState > 0 && (
                <Svg width={14} height={14} viewBox="0 0 14 14" style={{ marginLeft: 5 }}>
                  <Circle cx={4.5} cy={4.5} r={3} stroke={keyState === 2 ? ART.gold : '#4B5563'} strokeWidth={1.6} fill="none" />
                  <Path d="M6.7,6.7L12.5,12.5M10,10L11.6,8.4M11.6,11.6L13,10.2" stroke={keyState === 2 ? ART.gold : '#4B5563'} strokeWidth={1.6} strokeLinecap="round" />
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
            <Timer size={COMPACT ? 15 : 18} color="#E6EEF6" strokeWidth={2} />
            <View style={styles.statCol}>
              <Text style={styles.label}>TIME</Text>
              <Text style={styles.value}>{time}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Sonar */}
          <View style={styles.row}>
            <SonarIcon color={accent} />
            <View style={styles.statCol}>
              <Text style={[styles.label, { color: accent, fontWeight: '800' }]} numberOfLines={1}>
                {isFrenzy ? 'FRENZY!' : isInfinite ? 'SONAR ∞' : COMPACT ? `SONAR ${sonarRemaining}/${maxSonar}` : `SONAR: ${sonarRemaining} / ${maxSonar}`}
              </Text>
              <SegBar
                segments={isInfinite ? 4 : Math.min(maxSonar, 8)}
                fill={isInfinite ? 4 : (sonarRemaining / maxSonar) * Math.min(maxSonar, 8)}
                color={accent}
                glow={glow}
                width={COMPACT ? 40 : 48}
              />
            </View>
          </View>

          <View style={styles.divider} />

          {/* Momentum */}
          <View style={styles.row}>
            <Zap size={15} color={ART.gold} fill={ART.gold} />
            <View style={styles.statCol}>
              <Text style={[styles.label, { color: ART.gold, fontWeight: '800' }]} numberOfLines={1}>
                {COMPACT ? `MOMENTUM` : `MOMENTUM ×${multiplier}`}
              </Text>
              <View style={[styles.row, { flexWrap: 'nowrap' }]}>
                <SegBar segments={4} fill={Math.max(0.35, (momentum / 20) * 4)} color={ART.gold} glow={glow} width={COMPACT ? 30 : 52} />
                {COMPACT && <Text style={styles.mult}>×{multiplier}</Text>}
              </View>
            </View>
          </View>

          {/* Pause */}
          <TouchableOpacity style={styles.pause} onPress={onPause} activeOpacity={0.7} hitSlop={8}>
            <Pause size={16} color="#E6EEF6" fill="#E6EEF6" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    left: 8,
    right: 8,
    zIndex: 100,
  },
  glowRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 30,
    borderWidth: 3,
    margin: -2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 10, 18, 0.9)',
    borderRadius: 28,
    borderWidth: 1.2,
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 6,
    shadowColor: ART.cyan,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  emblem: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flexShrink: 1,
    flexGrow: 1,
    marginLeft: 6,
    minWidth: 0,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  level: { color: '#F2F7FB', fontSize: COMPACT ? 11 : 12, flexShrink: 0, fontWeight: '800', letterSpacing: 0.5 },
  levelName: { color: '#8FA3B8', fontSize: 7.5, fontWeight: '600', letterSpacing: 0.8, marginTop: 1 },
  divider: { width: 1, height: 26, backgroundColor: 'rgba(143, 163, 184, 0.25)', marginHorizontal: COMPACT ? 4 : 6 },
  statCol: { marginLeft: 4 },
  label: { color: '#8FA3B8', fontSize: 7.5, fontWeight: '700', letterSpacing: 0.4 },
  value: { color: '#F2F7FB', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  segRow: { flexDirection: 'row', gap: 2.5, marginTop: 3 },
  seg: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(143, 163, 184, 0.18)',
    overflow: 'hidden',
  },
  segFill: {
    height: '100%',
    borderRadius: 3,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  mult: { color: ART.gold, fontSize: 9, fontWeight: '800', marginLeft: 3, marginTop: 2 },
  pause: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(230, 238, 246, 0.25)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
});
