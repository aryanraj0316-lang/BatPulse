import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, Animated, Easing, LayoutChangeEvent } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Path } from 'react-native-svg';
import Constants from 'expo-constants';
import { Volume2, Vibrate, Hand, Move, DoorOpen } from 'lucide-react-native';
import { useSettingsStore } from '../state/settingsStore';
import { CarvedHeader, CarvedTitle, RuneToggle, SectionLabel } from '../ui/Frame';
import { UI } from '../ui/theme';

interface SettingsScreenProps {
  onBack: () => void;
}

const PLATE = require('../../assets/images/settings-plate.jpg');
// Source art size and where its two empty panels sit (fractions of the art)
const ART_W = 853;
const ART_H = 1844;
const PANEL_X = [0.085, 0.915];
const PANEL_1 = [0.232, 0.432];
const PANEL_2 = [0.474, 0.724];
const DIVIDER_Y = 0.172;
const LANTERN = { x: 0.168, y: 0.112 };
const VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** Warm flicker over the painted lantern + dust drifting through its light. */
const LanternGlow: React.FC<{ x: number; y: number; r: number }> = ({ x, y, r }) => {
  const flick = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    let alive = true;
    const step = () => {
      if (!alive) return;
      Animated.timing(flick, { toValue: 0.55 + Math.random() * 0.45, duration: 90 + Math.random() * 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(step);
    };
    step();
    return () => {
      alive = false;
      flick.stopAnimation();
    };
  }, [flick]);
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, opacity: flick }}>
      <Svg width={r * 2} height={r * 2}>
        <Defs>
          <RadialGradient id="lg" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFC870" stopOpacity={0.55} />
            <Stop offset="0.35" stopColor="#FF9A3A" stopOpacity={0.18} />
            <Stop offset="1" stopColor="#FF8A2A" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill="url(#lg)" />
      </Svg>
    </Animated.View>
  );
};

const Mote: React.FC<{ x: number; y: number; delay: number; drift: number }> = ({ x, y, delay, drift }) => {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.delay(delay), Animated.timing(t, { toValue: 1, duration: 7000, easing: Easing.linear, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [t, delay]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.mote,
        {
          left: x,
          top: y,
          opacity: t.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.8, 0.5, 0] }),
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -120] }) }, { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) }],
        },
      ]}
    />
  );
};

const Row: React.FC<{ icon: React.ReactNode; title: string; sub: string; right?: React.ReactNode; last?: boolean }> = ({ icon, title, sub, right, last }) => (
  <View style={[styles.row, !last && styles.rowLine]}>
    <View style={styles.rowIcon}>{icon}</View>
    <View style={{ flex: 1 }}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowSub}>{sub}</Text>
    </View>
    {right}
  </View>
);

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack }) => {
  const { soundEnabled, hapticsEnabled, setSoundEnabled, setHapticsEnabled } = useSettingsStore();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  // cover the screen with the art; anchor to the top so the panels never slide under the header
  const S = Math.max(box.w / ART_W, box.h / ART_H);
  const OX = (box.w - ART_W * S) / 2;
  const ax = (f: number) => OX + f * ART_W * S;
  const ay = (f: number) => f * ART_H * S;
  const panel = (y: number[]) => ({ left: ax(PANEL_X[0]), width: ax(PANEL_X[1]) - ax(PANEL_X[0]), top: ay(y[0]), height: ay(y[1]) - ay(y[0]) });

  return (
    <View style={styles.container} onLayout={onLayout}>
      {box.w > 0 && (
        <>
          <Image source={PLATE} style={{ position: 'absolute', left: OX, top: 0, width: ART_W * S, height: ART_H * S }} />
          <LanternGlow x={ax(LANTERN.x)} y={ay(LANTERN.y)} r={90 * S * 1.6} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Mote key={i} x={ax(0.1 + i * 0.03)} y={ay(0.2 + (i % 3) * 0.02)} delay={i * 1100} drift={18 + i * 6} />
          ))}

          <CarvedTitle style={{ position: 'absolute', left: 0, right: 0, top: ay(DIVIDER_Y) - 44 }}>SETTINGS</CarvedTitle>

          <View style={[styles.panel, panel(PANEL_1)]}>
            <SectionLabel>SOUND & FEEL</SectionLabel>
            <Row
              icon={<Volume2 size={20} color={UI.color.cyanSoft} />}
              title="Sound"
              sub="Echoes, growls and ambience"
              right={<RuneToggle value={soundEnabled} onChange={setSoundEnabled} />}
            />
            <Row
              icon={<Vibrate size={20} color={UI.color.cyanSoft} />}
              title="Vibration"
              sub="Taps on pulses and bumps"
              right={<RuneToggle value={hapticsEnabled} onChange={setHapticsEnabled} />}
              last
            />
          </View>

          <View style={[styles.panel, panel(PANEL_2)]}>
            <SectionLabel color={UI.color.gold}>HOW TO FLY</SectionLabel>
            <Row icon={<Hand size={20} color="#FFD58A" />} title="Tap" sub="Send a sonar pulse" />
            <Row icon={<Move size={20} color="#FFD58A" />} title="Hold or drag" sub="A joystick appears under your thumb" />
            <Row icon={<DoorOpen size={20} color="#FFD58A" />} title="Find the exit" sub="Reach the glowing door unseen" last />
          </View>

          <Text style={[styles.version, { top: ay(PANEL_2[1]) + 18 }]}>BATS VIEW · v{VERSION}</Text>
        </>
      )}
      <CarvedHeader onBack={onBack} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05080C', paddingTop: 24, overflow: 'hidden' },
  panel: { position: 'absolute', paddingHorizontal: 22, paddingTop: 18, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 12 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: 'rgba(160,175,195,0.12)' },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(160,175,195,0.3)',
  },
  rowTitle: { fontFamily: UI.font.heading, fontSize: 15, color: '#E8ECF0', letterSpacing: 0.8 },
  rowSub: { fontFamily: UI.font.body, fontSize: 13, color: '#93A0B0', marginTop: 1 },
  version: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: UI.font.techBold, fontSize: 11, letterSpacing: 2.5, color: 'rgba(170,185,200,0.45)' },
  mote: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#FFD9A0' },
});
