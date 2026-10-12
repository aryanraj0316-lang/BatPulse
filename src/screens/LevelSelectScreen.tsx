import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { PALETTE } from '../constants/palette';
import { useProgressStore } from '../state/progressStore';
import { CHAPTERS, chapterLevelIds, chapterProgress, isLevelUnlocked } from '../levels/chapters';
import { hasAuthoredLevel } from '../levels/loader';

interface Props {
  onSelectLevel: (levelId: number) => void;
  onBack: () => void;
}

export const LevelSelectScreen: React.FC<Props> = ({ onSelectLevel, onBack }) => {
  const { records, shards } = useProgressStore();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7} testID="btn-select-back">
          <Text style={styles.backBtnText}>← BACK</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>LEVEL SELECT</Text>
        </View>
        <Text style={styles.shardCount}>✦ {shards}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {CHAPTERS.map((chapter) => {
          const prog = chapterProgress(chapter, records);
          return (
            <View key={chapter.id} style={styles.chapter}>
              <Text style={styles.chapterTag}>CHAPTER {chapter.id}</Text>
              <Text style={styles.chapterName} testID={`chapter-${chapter.id}`}>
                {chapter.name.toUpperCase()}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(prog.stars / prog.maxStars) * 100}%` }]} />
              </View>
              <Text style={styles.progressText}>
                ★ {prog.stars} / {prog.maxStars} · {prog.completed} / {prog.total} cleared
              </Text>

              <View style={styles.grid}>
                {chapterLevelIds(chapter)
                  .filter((id) => hasAuthoredLevel(id))
                  .map((id) => {
                    const rec = records[id];
                    const open = isLevelUnlocked(id, records);
                    return (
                      <TouchableOpacity
                        key={id}
                        style={[styles.tile, open ? (rec?.completed ? styles.tileDone : styles.tileOpen) : styles.tileLocked]}
                        disabled={!open}
                        onPress={() => onSelectLevel(id)}
                        activeOpacity={0.75}
                        testID={`level-${id}`}
                      >
                        <Text style={[styles.tileNum, { color: open ? PALETTE.sonarCyan : '#475569' }]}>{id.toString().padStart(2, '0')}</Text>
                        {open ? (
                          <Text style={styles.tileStars}>
                            {[1, 2, 3].map((i) => (
                              <Text key={i} style={{ color: i <= (rec?.stars ?? 0) ? PALETTE.shardGold : 'rgba(255,255,255,0.15)' }}>
                                ★
                              </Text>
                            ))}
                          </Text>
                        ) : (
                          <Text style={styles.lock}>🔒</Text>
                        )}
                        {rec?.ghostRun && <Text style={styles.ghost}>🦇</Text>}
                      </TouchableOpacity>
                    );
                  })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.voidBlack, paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14 },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  backBtnText: { color: '#CBD5E1', fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  headerCenter: { alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '900', color: '#FFFFFF', letterSpacing: 2 },
  shardCount: { color: PALETTE.shardGold, fontWeight: '800', fontSize: 12, minWidth: 50, textAlign: 'right' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  chapter: {
    backgroundColor: 'rgba(8, 13, 22, 0.7)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(77, 240, 255, 0.15)',
    padding: 16,
  },
  chapterTag: { fontSize: 9, fontWeight: '800', color: PALETTE.sonarCyan, letterSpacing: 2 },
  chapterName: { fontSize: 18, fontWeight: '900', color: '#F8FAFC', letterSpacing: 2, marginTop: 2 },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 10, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: PALETTE.shardGold },
  progressText: { fontSize: 10, color: '#94A3B8', marginTop: 6, letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  tile: {
    width: '22%',
    aspectRatio: 1,
    minWidth: 64,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tileOpen: { borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(8,13,22,0.8)' },
  tileDone: { borderColor: PALETTE.sonarCyan, backgroundColor: 'rgba(77,240,255,0.06)' },
  tileLocked: { borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(5,7,12,0.5)', opacity: 0.55 },
  tileNum: { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  tileStars: { fontSize: 11 },
  lock: { fontSize: 12 },
  ghost: { position: 'absolute', top: 3, right: 4, fontSize: 10 },
});
