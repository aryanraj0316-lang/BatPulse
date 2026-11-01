import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Play, RotateCcw, House, Map as MapIcon, FastForward, Volume2, VolumeX, Vibrate } from 'lucide-react-native';
import { SteelFrame, Divider } from '../ui/Frame';
import { StoneButton } from '../ui/StoneButton';
import { UI } from '../ui/theme';
import { useSettingsStore } from '../state/settingsStore';

interface PauseOverlayProps {
  levelNumber: number;
  levelTitle: string;
  /** e.g. "FLOOR 4" in Endless; defaults to "ECHO n" */
  levelLabel?: string;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  /** dev tools (only passed when dev mode is unlocked) */
  onSeeMap?: () => void;
  onSkipLevel?: () => void;
  isMapRevealed?: boolean;
}

const BAT_D =
  'M60,22 L57,13 L55.5,20 C52,20.5 50,23 49.5,25.5 C45,19 36,14.5 20,15 C27,19 29,24 28.5,29 C33,27 37.5,28 40,31.5 C44,30 48.5,31.5 51,35.5 C55,36.5 57.5,41 60,47 C62.5,41 65,36.5 69,35.5 C71.5,31.5 76,30 80,31.5 C82.5,28 87,27 91.5,29 C91,24 93,19 100,15 C84,14.5 75,19 70.5,25.5 C70,23 68,20.5 64.5,20 L63,13 Z';

/** Round bronze medallion with a bat, like the HUD emblem. */
const Medallion: React.FC = () => {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 16000, easing: Easing.linear, useNativeDriver: true }));
    l.start();
    return () => l.stop();
  }, [spin]);
  return (
    <View style={styles.medal}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
        <Svg width={72} height={72}>
          <Circle cx={36} cy={36} r={33} fill="none" stroke="#C89A5A" strokeWidth={1} strokeDasharray="2 5" />
        </Svg>
      </Animated.View>
      <Svg width={72} height={72} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="bronze" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#E8C68A" />
            <Stop offset="0.5" stopColor="#8A6232" />
            <Stop offset="1" stopColor="#4A3218" />
          </SvgGradient>
          <SvgGradient id="medalIn" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#2A2016" />
            <Stop offset="1" stopColor="#0C0905" />
          </SvgGradient>
        </Defs>
        <Circle cx={36} cy={36} r={29} fill="url(#bronze)" stroke="#1A120A" strokeWidth={1.5} />
        <Circle cx={36} cy={36} r={23} fill="url(#medalIn)" stroke="#C89A5A" strokeWidth={1} />
        <Path d={BAT_D} fill="url(#bronze)" transform="translate(12,13) scale(0.4)" />
      </Svg>
    </View>
  );
};

const RoundBtn: React.FC<{ onPress: () => void; children: React.ReactNode; on?: boolean }> = ({ onPress, children, on = true }) => (
  <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.round, !on && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.92 }] }]}>
    {children}
  </Pressable>
);

export const PauseOverlay: React.FC<PauseOverlayProps> = ({
  levelNumber,
  levelTitle,
  levelLabel,
  onResume,
  onRestart,
  onMenu,
  onSeeMap,
  onSkipLevel,
  isMapRevealed = false,
}) => {
  const { soundEnabled, hapticsEnabled, setSoundEnabled, setHapticsEnabled } = useSettingsStore();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }).start();
  }, [a]);
  return (
    <View style={styles.backdrop}>
      <Animated.View style={{ width: '78%', maxWidth: 320, opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
        <SteelFrame cut={20} padding={20} style={{ paddingTop: 44 }} fill={['#151C25', '#07090D']} fillOpacity={0.97}>
          <Text style={styles.kicker}>{levelLabel ?? `ECHO ${levelNumber}`}</Text>
          <Text style={styles.title}>PAUSED</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {levelTitle.toUpperCase()}
          </Text>
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <Divider width={150} />
          </View>

          <StoneButton label="RESUME" variant="primary" icon={Play} onPress={onResume} />
          <StoneButton label="RESTART" icon={RotateCcw} onPress={onRestart} style={{ marginTop: 10 }} />
          <StoneButton label="MAIN MENU" icon={House} onPress={onMenu} style={{ marginTop: 10 }} />

          {(onSeeMap || onSkipLevel) && (
            <View style={styles.devRow}>
              {onSeeMap && <StoneButton label={isMapRevealed ? 'HIDE MAP' : 'MAP'} icon={MapIcon} onPress={onSeeMap} height={40} style={{ flex: 1 }} />}
              {onSkipLevel && <StoneButton label="SKIP" icon={FastForward} onPress={onSkipLevel} height={40} style={{ flex: 1 }} />}
            </View>
          )}

          <View style={styles.quick}>
            <RoundBtn onPress={() => setSoundEnabled(!soundEnabled)} on={soundEnabled}>
              {soundEnabled ? <Volume2 size={18} color={UI.color.cyanSoft} /> : <VolumeX size={18} color="#8592A2" />}
            </RoundBtn>
            <RoundBtn onPress={() => setHapticsEnabled(!hapticsEnabled)} on={hapticsEnabled}>
              <Vibrate size={18} color={hapticsEnabled ? UI.color.cyanSoft : '#8592A2'} />
            </RoundBtn>
          </View>
        </SteelFrame>
        <View style={styles.medalWrap} pointerEvents="none">
          <Medallion />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(1, 3, 6, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  medalWrap: { position: 'absolute', top: -36, left: 0, right: 0, alignItems: 'center' },
  medal: { width: 72, height: 72 },
  kicker: { fontFamily: UI.font.techBold, color: UI.color.cyan, fontSize: 12, letterSpacing: 4, textAlign: 'center' },
  title: { fontFamily: UI.font.title, color: '#F2EEE6', fontSize: 32, letterSpacing: 4, textAlign: 'center', marginTop: 2 },
  subtitle: { fontFamily: UI.font.tech, color: '#8FA0B2', fontSize: 12, letterSpacing: 2.5, textAlign: 'center', marginTop: 2, marginBottom: 8 },
  devRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  quick: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 16 },
  round: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#6E7884',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
