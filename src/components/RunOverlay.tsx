import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Path, Defs, RadialGradient, Stop, Circle, G } from 'react-native-svg';
import { ArrowDown, RotateCw, House, Gem, Trophy } from 'lucide-react-native';
import { SteelFrame, Divider, useLoop } from '../ui/Frame';
import { StoneButton } from '../ui/StoneButton';
import { UI } from '../ui/theme';
import type { RunMode } from '../levels/runs';

interface Props {
  mode: RunMode;
  kind: 'cleared' | 'over';
  floor: number;
  floorShards: number;
  runShards: number;
  best: number;
  newBest: boolean;
  onContinue: () => void;
  onRetry: () => void;
  onMenu: () => void;
}

/** Counts up from 0 to `to` once the card has appeared. */
function useCountUp(to: number, delay = 350, ms = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = Date.now() + delay;
    const tick = () => {
      const k = Math.min(1, Math.max(0, (Date.now() - start) / ms));
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, ms]);
  return v;
}

/** Slowly turning light rays behind the big number (new records). */
const Rays: React.FC<{ color: string }> = ({ color }) => {
  const spin = useLoop(14000);
  const R = 120;
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const b = a + 0.12;
    return `M${R},${R}L${R + Math.cos(a) * R},${R + Math.sin(a) * R}L${R + Math.cos(b) * R},${R + Math.sin(b) * R}Z`;
  }).join('');
  return (
    <Animated.View pointerEvents="none" style={[styles.rays, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
      <Svg width={R * 2} height={R * 2}>
        <Defs>
          <RadialGradient id="rayfade" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.5} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Path d={rays} fill="url(#rayfade)" />
      </Svg>
    </Animated.View>
  );
};

/** Floor emblem: a stone well ring with sonar rings sinking into it. */
const WellEmblem: React.FC<{ color: string }> = ({ color }) => {
  const t = useLoop(2600);
  return (
    <View style={styles.emblem}>
      {[0, 1, 2].map((i) => {
        const ph = Animated.modulo(Animated.add(t, i / 3), 1);
        return (
          <Animated.View
            key={i}
            style={[
              StyleSheet.absoluteFill,
              {
                alignItems: 'center',
                justifyContent: 'center',
                opacity: ph.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] }),
                transform: [{ scale: ph.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }) }],
              },
            ]}
          >
            <View style={[styles.ring, { borderColor: color }]} />
          </Animated.View>
        );
      })}
      <Svg width={64} height={64} style={StyleSheet.absoluteFill}>
        <Circle cx={32} cy={32} r={29} fill="none" stroke="#7E8896" strokeWidth={2.5} />
        <Circle cx={32} cy={32} r={25} fill="none" stroke="#000" strokeOpacity={0.7} strokeWidth={2} />
        <G opacity={0.9}>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <Path key={i} d={`M${32 + Math.cos(a) * 25},${32 + Math.sin(a) * 25}L${32 + Math.cos(a) * 30},${32 + Math.sin(a) * 30}`} stroke="#4A535E" strokeWidth={2} />;
          })}
        </G>
      </Svg>
    </View>
  );
};

export const RunOverlay: React.FC<Props> = ({ mode, kind, floor, floorShards, runShards, best, newBest, onContinue, onRetry, onMenu }) => {
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(appear, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }).start();
  }, [appear]);
  const cleared = kind === 'cleared';
  const depth = cleared ? floor : floor - 1;
  const bigNum = useCountUp(depth);
  const shardNum = useCountUp(cleared ? floorShards : runShards, 600);
  const accent = cleared ? UI.color.cyan : '#FF5A6A';
  const modeName = mode === 'daily' ? 'DAILY DESCENT' : 'ENDLESS DESCENT';

  return (
    <View style={styles.backdrop}>
      <Animated.View
        style={{
          width: '86%',
          maxWidth: 360,
          opacity: appear,
          transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }, { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        }}
      >
        <SteelFrame cut={20} padding={22} accent={accent} active fill={cleared ? ['#0E1C26', '#05090D'] : ['#1E0E12', '#07060A']} fillOpacity={0.96}>
          <Text style={[styles.kicker, { color: accent }]}>{modeName}</Text>
          <Text style={styles.title}>{cleared ? `FLOOR ${floor} CLEARED` : 'THE DARK TAKES YOU'}</Text>
          <View style={{ alignItems: 'center' }}>
            <Divider color={accent} width={170} />
          </View>

          <View style={styles.hero}>
            {(newBest || cleared) && <Rays color={newBest ? UI.color.gold : UI.color.cyan} />}
            <WellEmblem color={accent} />
            <Text style={[styles.big, newBest && { color: '#FFE3A0', textShadowColor: UI.color.gold }]}>{bigNum}</Text>
            <Text style={styles.bigLabel}>{depth === 1 ? 'FLOOR DEEP' : 'FLOORS DEEP'}</Text>
            {newBest && (
              <View style={styles.bestTag}>
                <Trophy size={13} color="#1A1206" />
                <Text style={styles.bestTagText}>NEW BEST</Text>
              </View>
            )}
          </View>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Gem size={16} color="#7FD8FF" />
              <Text style={styles.statVal}>+{shardNum}</Text>
              <Text style={styles.statLabel}>{cleared ? 'THIS FLOOR' : 'THIS RUN'}</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.stat}>
              <Trophy size={16} color={UI.color.gold} />
              <Text style={styles.statVal}>{Math.max(best, depth)}</Text>
              <Text style={styles.statLabel}>{mode === 'daily' ? 'BEST TODAY' : 'BEST EVER'}</Text>
            </View>
          </View>

          {cleared ? (
            <>
              <StoneButton label="DESCEND" variant="primary" icon={ArrowDown} onPress={onContinue} style={{ marginTop: 18 }} />
              <StoneButton label="LEAVE THE RUN" icon={House} onPress={onMenu} style={{ marginTop: 10 }} />
            </>
          ) : (
            <>
              <StoneButton label={mode === 'daily' ? 'TRY AGAIN' : 'NEW RUN'} variant="primary" icon={RotateCw} onPress={onRetry} style={{ marginTop: 18 }} />
              <StoneButton label="MAIN MENU" icon={House} onPress={onMenu} style={{ marginTop: 10 }} />
            </>
          )}
        </SteelFrame>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(2,4,7,0.78)', alignItems: 'center', justifyContent: 'center', zIndex: 300 },
  kicker: { fontFamily: UI.font.techBold, fontSize: 12, letterSpacing: 4, textAlign: 'center' },
  title: { fontFamily: UI.font.title, fontSize: 19, color: '#F0ECE4', textAlign: 'center', letterSpacing: 1.5, marginTop: 4, marginBottom: 2 },
  hero: { alignItems: 'center', marginTop: 14, height: 168, justifyContent: 'center' },
  rays: { position: 'absolute', width: 240, height: 240, top: -36, alignSelf: 'center' },
  emblem: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  ring: { width: 50, height: 50, borderRadius: 25, borderWidth: 1.5 },
  big: {
    fontFamily: UI.font.title,
    fontSize: 46,
    color: '#EEF4FA',
    marginTop: 2,
    textShadowColor: UI.color.cyan,
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  bigLabel: { fontFamily: UI.font.techBold, fontSize: 12, letterSpacing: 3, color: '#93A0B0', marginTop: -4 },
  bestTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: UI.color.gold, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4, marginTop: 6 },
  bestTagText: { fontFamily: UI.font.techBold, fontSize: 11.5, letterSpacing: 2, color: '#1A1206' },
  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(160,175,195,0.14)' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statSep: { width: 1, height: 36, backgroundColor: 'rgba(160,175,195,0.18)' },
  statVal: { fontFamily: UI.font.techBold, fontSize: 20, color: '#E8ECF0' },
  statLabel: { fontFamily: UI.font.tech, fontSize: 10.5, letterSpacing: 2, color: '#8592A2' },
});
