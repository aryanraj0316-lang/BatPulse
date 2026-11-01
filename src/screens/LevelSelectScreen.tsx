import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lamp, Waves, Flame, Snowflake, Sprout, Sparkles, Lock, Star, Infinity as InfinityIcon, Swords } from 'lucide-react-native';
import { useProgressStore } from '../state/progressStore';
import { LEVEL_PRESETS, LEVEL_NAMES } from '../levels/params';
import { BIOMES, CHAPTER_SIZE, CAMPAIGN_LEVELS, biomeForLevel, type BiomeId } from '../render/themes/biomes';
import { MenuBackground } from '../ui/Chrome';
import { CarvedHeader } from '../ui/Frame';
import { UI } from '../ui/theme';
import { GAME_CONFIG } from '../constants/gameConfig';
import { LiveCanvas } from '../render/LiveCanvas';
import { drawChapterBanner } from '../render/menuScenes';

interface LevelSelectScreenProps {
  onSelectLevel: (levelId: number) => void;
  onBack: () => void;
}

const { width: SW } = Dimensions.get('window');
const COLS = 5;
const CARD_W = SW - 32;
const BANNER_H = 96;
const GAP = 8;
const TILE = Math.floor((SW - 32 - 24 - GAP * (COLS - 1)) / COLS);

const ICONS: Record<BiomeId, typeof Lamp> = { crypt: Lamp, grotto: Waves, forge: Flame, frost: Snowflake, fungal: Sprout, astral: Sparkles };

export function levelName(id: number) {
  return LEVEL_PRESETS.find((p) => p.id === id)?.name ?? LEVEL_NAMES[id - 9] ?? `Echo ${id}`;
}

export const LevelSelectScreen: React.FC<LevelSelectScreenProps> = ({ onSelectLevel, onBack }) => {
  const { records } = useProgressStore();
  const unlocked = (id: number) => id === 1 || !!records[id]?.unlocked;
  const highestUnlocked = useMemo(() => Object.values(records).reduce((m, r) => (r.unlocked ? Math.max(m, r.levelId) : m), 1), [records]);
  const totalStars = Object.values(records).reduce((s, r) => s + (r.stars || 0), 0);
  const beyond = highestUnlocked > CAMPAIGN_LEVELS ? Array.from({ length: highestUnlocked - CAMPAIGN_LEVELS }, (_, i) => CAMPAIGN_LEVELS + 1 + i) : [];

  const tile = (id: number, accent: string, soft: string) => {
    const rec = records[id];
    const open = unlocked(id);
    const stars = rec?.stars ?? 0;
    const current = open && !rec?.completed;
    return (
      <Pressable
        key={id}
        disabled={!open}
        onPress={() => onSelectLevel(id)}
        style={({ pressed }) => [
          styles.tile,
          {
            borderColor: current ? accent : open ? `${accent}66` : 'rgba(120,130,145,0.18)',
            backgroundColor: open ? 'rgba(8,12,18,0.82)' : 'rgba(5,7,10,0.6)',
            transform: [{ scale: pressed ? 0.94 : 1 }],
            shadowColor: accent,
            shadowOpacity: current ? 0.8 : 0,
          },
        ]}
      >
        {current && <LinearGradient colors={[`${accent}40`, 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />}
        {open ? (
          <>
            <Text style={[styles.tileNum, { color: rec?.completed ? '#EEF2F6' : soft }]}>{id}</Text>
            <View style={styles.tileStars}>
              {[1, 2, 3].map((k) => (
                <Star key={k} size={8} color={k <= stars ? '#FFC24A' : '#3A4250'} fill={k <= stars ? '#FFC24A' : '#3A4250'} strokeWidth={1} />
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.tileNum, { color: '#4A5462', fontSize: 15 }]}>{id}</Text>
            <Lock size={10} color="#4A5462" />
          </>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <MenuBackground dim />
      <CarvedHeader
        title="ECHO CHAMBERS"
        subtitle={`${totalStars} / ${CAMPAIGN_LEVELS * 3} STARS`}
        onBack={onBack}
        right={
          <View style={styles.starChip}>
            <Star size={13} color="#FFC24A" fill="#FFC24A" />
            <Text style={styles.starChipText}>{totalStars}</Text>
          </View>
        }
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {BIOMES.map((b) => {
          const first = b.index * CHAPTER_SIZE + 1;
          const ids = Array.from({ length: CHAPTER_SIZE }, (_, i) => first + i);
          const open = unlocked(first);
          const stars = ids.reduce((s, id) => s + (records[id]?.stars ?? 0), 0);
          const cleared = ids.filter((id) => records[id]?.completed).length;
          const Icon = ICONS[b.id] ?? Lamp;
          const twist =
            first >= GAME_CONFIG.RIFT_FIRST_LEVEL ? 'Crushers · Rifts' : first >= GAME_CONFIG.CRUSHER_FIRST_LEVEL ? 'Crushers' : null;
          return (
            <View key={b.id} style={[styles.chapter, { borderColor: open ? `${b.ui.accent}70` : 'rgba(120,130,145,0.2)', opacity: open ? 1 : 0.62 }]}>
              <LinearGradient colors={[`${b.ui.deep}`, 'rgba(6,9,13,0.94)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              {/* painted corridor of this biome, animated */}
              <View style={styles.banner} pointerEvents="none">
                <LiveCanvas width={CARD_W - 2} height={BANNER_H} fps={24} animated={open} deps={[open]} draw={(c, t, w, h) => drawChapterBanner(c, t, w, h, b, !open)} />
                <Text style={[styles.bannerNum, { color: b.ui.soft, textShadowColor: b.ui.accent }]}>{b.numeral}</Text>
              </View>
              <View style={styles.chapterHead}>
                <View style={[styles.emblem, { borderColor: b.ui.accent, shadowColor: b.ui.accent }]}>
                  <Icon size={20} color={b.ui.soft} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.chapterNum, { color: b.ui.accent }]}>
                    CHAPTER {b.numeral} · {first}–{first + CHAPTER_SIZE - 1}
                  </Text>
                  <Text style={styles.chapterName}>{b.name.toUpperCase()}</Text>
                  <Text style={styles.chapterTag}>{b.tagline}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={styles.chapterStars}>
                    <Star size={11} color="#FFC24A" fill="#FFC24A" />
                    <Text style={styles.chapterStarsText}>
                      {stars}/{CHAPTER_SIZE * 3}
                    </Text>
                  </View>
                  <Text style={styles.cleared}>{open ? `${cleared}/${CHAPTER_SIZE} cleared` : 'Locked'}</Text>
                </View>
              </View>
              {twist && (
                <View style={[styles.twist, { borderColor: `${b.ui.accent}80` }]}>
                  <Swords size={11} color={b.ui.soft} />
                  <Text style={[styles.twistText, { color: b.ui.soft }]}>NEW TWISTS · {twist.toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.grid}>{ids.map((id) => tile(id, b.ui.accent, b.ui.soft))}</View>
            </View>
          );
        })}

        {/* past the campaign: the maze keeps going, cycling the biomes */}
        <View style={[styles.chapter, { borderColor: 'rgba(120,200,255,0.35)', opacity: beyond.length ? 1 : 0.62 }]}>
          <LinearGradient colors={['#0A1424', 'rgba(6,9,13,0.94)']} style={StyleSheet.absoluteFill} />
          <View style={styles.chapterHead}>
            <View style={[styles.emblem, { borderColor: UI.color.cyan, shadowColor: UI.color.cyan }]}>
              <InfinityIcon size={20} color={UI.color.cyanSoft} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.chapterNum, { color: UI.color.cyan }]}>BEYOND · {CAMPAIGN_LEVELS + 1}+</Text>
              <Text style={styles.chapterName}>THE ENDLESS DEEP</Text>
              <Text style={styles.chapterTag}>Every biome again, darker each time</Text>
            </View>
          </View>
          {beyond.length ? (
            <View style={styles.grid}>{beyond.map((id) => tile(id, biomeForLevel(id).ui.accent, biomeForLevel(id).ui.soft))}</View>
          ) : (
            <Text style={styles.beyondLocked}>Clear Echo {CAMPAIGN_LEVELS} to descend further.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.color.ink, paddingTop: 34 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 14 },
  starChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 30, borderRadius: 8, borderWidth: 1, borderColor: UI.color.stoneEdge, backgroundColor: 'rgba(10,14,19,0.85)' },
  starChipText: { fontFamily: UI.font.techBold, fontSize: 14, color: UI.color.text },
  chapter: { borderRadius: 14, borderWidth: 1, padding: 12, overflow: 'hidden' },
  banner: { marginHorizontal: -12, marginTop: -12, marginBottom: 10, height: BANNER_H, overflow: 'hidden', borderTopLeftRadius: 13, borderTopRightRadius: 13 },
  bannerNum: {
    position: 'absolute',
    left: 14,
    top: 8,
    fontFamily: UI.font.title,
    fontSize: 30,
    opacity: 0.9,
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  chapterHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emblem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  chapterNum: { fontFamily: UI.font.label, fontSize: 10.5, letterSpacing: 2 },
  chapterName: { fontFamily: UI.font.heading, fontSize: 16.5, color: '#EEF2F6', letterSpacing: 1, marginTop: 1 },
  chapterTag: { fontFamily: UI.font.tech, fontSize: 12.5, color: '#8E9AAB', marginTop: 1 },
  chapterStars: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chapterStarsText: { fontFamily: UI.font.techBold, fontSize: 13, color: '#E8D8A8' },
  cleared: { fontFamily: UI.font.tech, fontSize: 11, color: '#8592A2' },
  twist: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  twistText: { fontFamily: UI.font.techBold, fontSize: 10.5, letterSpacing: 1.2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: 12 },
  tile: {
    width: TILE,
    height: TILE * 0.92,
    borderRadius: 9,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  tileNum: { fontFamily: UI.font.heading, fontSize: 17 },
  tileStars: { flexDirection: 'row', gap: 1.5, marginTop: 3 },
  beyondLocked: { fontFamily: UI.font.tech, fontSize: 13, color: '#8592A2', marginTop: 10 },
});
