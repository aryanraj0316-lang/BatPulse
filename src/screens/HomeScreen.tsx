import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions } from 'react-native';
import { Settings, Zap, Star, Gem } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useProgressStore, ABILITIES } from '../state/progressStore';
import { useSettingsStore } from '../state/settingsStore';
import { DevPanel } from '../components/DevPanel';
import { DEV_KEYS } from '../constants/gameConfig';
import { AudioEngine } from '../engine/AudioEngine';
import { HomeArtCanvas, HomeArtHandle } from '../render/home/HomeArtCanvas';
import { ART_W, ART_H } from '../render/home/HomeScene';

interface HomeScreenProps {
  onPlay: (levelId: number) => void;
  onLevelSelect: () => void;
  onAbilities: () => void;
  onEndless: () => void;
  onSettings: () => void;
}

const PLATE = require('../../assets/images/home-plate.jpg');
const { width: SW, height: SH } = Dimensions.get('window');

// Fit the painting: crop at most ~7% per side, never taller than the screen; anchor to the bottom.
const S = Math.min(SW / (ART_W * 0.86), SH / ART_H);
const OX = (SW - ART_W * S) / 2;
const OY = SH - ART_H * S;
const art = (x: number, y: number, w: number, h: number) => ({ left: OX + x * S, top: OY + y * S, width: w * S, height: h * S });

// Painted menu buttons (art pixels)
const BUTTONS = [
  { key: 'play', rect: [228, 975, 492, 93] },
  { key: 'select', rect: [223, 1090, 497, 88] },
  { key: 'abilities', rect: [223, 1202, 497, 88] },
  { key: 'endless', rect: [223, 1314, 497, 88] },
  { key: 'settings', rect: [223, 1426, 497, 88] },
] as const;

export const HomeScreen: React.FC<HomeScreenProps> = ({ onPlay, onLevelSelect, onAbilities, onEndless, onSettings }) => {
  const { records, shards, unlockedAbilities } = useProgressStore();
  const { soundEnabled, devModeUnlocked, unlockDevMode } = useSettingsStore();
  const [tapCount, setTapCount] = useState(0);
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const artRef = useRef<HomeArtHandle>(null);

  const unlocked = Object.values(records).filter((r) => r.unlocked);
  const latestLevelId = unlocked.length > 0 ? Math.max(...unlocked.map((r) => r.levelId)) : 1;
  const totalStars = Object.values(records).reduce((sum, r) => sum + (r.stars || 0), 0);
  const abilityTotal = Object.keys(ABILITIES).length;

  const actions: Record<string, () => void> = {
    play: () => {
      AudioEngine.playSonarPulse(soundEnabled);
      onPlay(latestLevelId);
    },
    select: onLevelSelect,
    abilities: onAbilities,
    endless: onEndless,
    settings: onSettings,
  };

  const handleVersionTap = () => {
    const next = tapCount + 1;
    setTapCount(next);
    if (next >= DEV_KEYS.TAP_COUNT_TO_UNLOCK_DEV) {
      unlockDevMode();
      setDevPanelOpen(true);
      setTapCount(0);
    }
  };

  const topY = Math.max(OY + 30 * S, 34);

  return (
    <View style={styles.container}>
      <Image source={PLATE} style={{ position: 'absolute', left: OX, top: OY, width: ART_W * S, height: ART_H * S }} />
      {/* blend the painting into the dark where the screen is taller/wider than the art */}
      {OY > 0 && (
        <LinearGradient colors={['#04070A', 'rgba(4,7,10,0)']} style={{ position: 'absolute', left: 0, right: 0, top: OY - 1, height: 70 * S }} />
      )}

      <HomeArtCanvas ref={artRef} width={SW} height={SH} scale={S} offsetX={OX} offsetY={OY} />

      {BUTTONS.map((b) => (
        <Pressable
          key={b.key}
          style={({ pressed }) => [styles.hit, art(b.rect[0], b.rect[1], b.rect[2], b.rect[3]), pressed && styles.hitPressed]}
          onPress={() => {
            artRef.current?.flap();
            actions[b.key]();
          }}
        />
      ))}

      <View style={[styles.topBar, { top: topY }]}>
        <Pressable onPress={onSettings} hitSlop={8} style={({ pressed }) => [styles.gear, pressed && { opacity: 0.7 }]}>
          <Settings size={20} color="#8FB4D8" />
        </Pressable>
        <View style={styles.chip}>
          <Zap size={15} color="#FFC24A" fill="#FFC24A" />
          <Text style={styles.chipText}>{`${unlockedAbilities.length}/${abilityTotal}`}</Text>
          <View style={styles.sep} />
          <Star size={15} color="#FFC24A" fill="#FFC24A" />
          <Text style={styles.chipText}>{totalStars}</Text>
          <View style={styles.sep} />
          <Gem size={15} color="#4DA8FF" fill="#1F5FB8" />
          <Text style={styles.chipText}>{shards}</Text>
        </View>
      </View>

      <Pressable onPress={handleVersionTap} hitSlop={10} style={styles.version}>
        <Text style={styles.versionText}>{devModeUnlocked ? 'DEV · ' : ''}v2.0.0</Text>
      </Pressable>

      {devPanelOpen && <DevPanel visible={devPanelOpen} onClose={() => setDevPanelOpen(false)} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#04070A', overflow: 'hidden' },
  hit: { position: 'absolute', borderRadius: 6 },
  hitPressed: { backgroundColor: 'rgba(77,170,255,0.12)', borderWidth: 1, borderColor: 'rgba(110,190,255,0.55)' },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gear: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(110,150,190,0.55)',
    backgroundColor: 'rgba(8,14,22,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(110,150,190,0.55)',
    backgroundColor: 'rgba(8,14,22,0.78)',
  },
  chipText: { color: '#D8E2EC', fontSize: 15, fontFamily: 'Cinzel_600SemiBold' },
  sep: { width: 1, height: 18, backgroundColor: 'rgba(110,150,190,0.4)', marginHorizontal: 6 },
  version: { position: 'absolute', right: 16, bottom: 14 },
  versionText: { color: '#6F8194', fontSize: 11, fontFamily: 'Cinzel_600SemiBold' },
});
