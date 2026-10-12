import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { PALETTE } from '../constants/palette';
import { useProgressStore } from '../state/progressStore';
import { authoredLevelIds, loadAuthoredLevel } from '../levels/loader';
import { emptyRecord } from '../state/progress';

interface LevelSelectScreenProps {
  onSelectLevel: (levelId: number) => void;
  onBack: () => void;
}

export const LevelSelectScreen: React.FC<LevelSelectScreenProps> = ({ onSelectLevel, onBack }) => {
  const { records, shards } = useProgressStore();
  const levels = authoredLevelIds()
    .filter((id) => id > 0)
    .sort((a, b) => a - b)
    .map((id) => loadAuthoredLevel(id))
    .filter((l): l is NonNullable<typeof l> => l !== null);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← BACK</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.title}>ECHO CHAMBERS</Text>
          <Text style={styles.subtitle}>ACOUSTIC ARCHIVES</Text>
        </View>

        <Text style={styles.shardCount}>✦ {shards}</Text>
      </View>

      {/* Levels Scroll List */}
      <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
        {levels.map((preset) => {
          const record = records[preset.id] || emptyRecord(preset.id, preset.id === 1);

          const isUnlocked = record.unlocked;

          return (
            <TouchableOpacity
              key={preset.id}
              style={[
                styles.card,
                {
                  borderColor: isUnlocked
                    ? record.completed
                      ? PALETTE.sonarCyan
                      : 'rgba(255, 255, 255, 0.2)'
                    : 'rgba(255, 255, 255, 0.05)',
                  backgroundColor: isUnlocked ? 'rgba(8, 13, 22, 0.7)' : 'rgba(5, 7, 12, 0.4)',
                  opacity: isUnlocked ? 1.0 : 0.45,
                },
              ]}
              disabled={!isUnlocked}
              onPress={() => onSelectLevel(preset.id)}
              activeOpacity={0.75}
            >
              <View style={styles.cardHeader}>
                <View style={styles.numberRow}>
                  <Text
                    style={[
                      styles.levelNum,
                      { color: isUnlocked ? PALETTE.sonarCyan : '#64748B' },
                    ]}
                  >
                    ECHO {preset.id.toString().padStart(2, '0')}
                  </Text>
                  {record.ghostRun && (
                    <Text style={styles.ghostTag}>🦇 GHOST</Text>
                  )}
                </View>

                {/* Stars Display */}
                {isUnlocked ? (
                  <View style={styles.starsRow}>
                    {[1, 2, 3].map((starIdx) => (
                      <Text
                        key={starIdx}
                        style={[
                          styles.star,
                          {
                            color:
                              starIdx <= record.stars
                                ? PALETTE.shardGold
                                : 'rgba(255,255,255,0.15)',
                          },
                        ]}
                      >
                        ★
                      </Text>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.lockTag}>🔒 LOCKED</Text>
                )}
              </View>

              <Text style={styles.cardTitle}>{preset.name.toUpperCase()}</Text>
              <Text style={styles.cardSubtitle}>CHAPTER {preset.chapter}</Text>

              {/* Best Record Footer */}
              {isUnlocked && record.completed && (
                <View style={styles.cardFooter}>
                  <Text style={styles.recordStat}>
                    ⚡ Best: {(record.bestTime ?? 0).toFixed(1)}s (Par {preset.parTime}s)
                  </Text>
                  <Text style={styles.recordStat}>🔥 Momentum ×{(record.bestMomentum ?? 1).toFixed(1)}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.voidBlack,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  backBtnText: {
    color: '#CBD5E1',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1,
  },
  headerCenter: {
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 9,
    fontWeight: '700',
    color: PALETTE.sonarCyan,
    letterSpacing: 1.5,
  },
  shardCount: {
    fontSize: 11,
    fontWeight: '900',
    color: PALETTE.shardGold,
    letterSpacing: 1,
  },
  scrollList: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    borderRadius: 8,
    padding: 16,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelNum: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  ghostTag: {
    fontSize: 8,
    fontWeight: '800',
    color: PALETTE.sonarCyan,
    backgroundColor: 'rgba(77, 240, 255, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    letterSpacing: 0.8,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  star: {
    fontSize: 16,
  },
  lockTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  recordStat: {
    fontSize: 10,
    color: '#CBD5E1',
    fontWeight: '600',
    letterSpacing: 0.8,
  },
});
