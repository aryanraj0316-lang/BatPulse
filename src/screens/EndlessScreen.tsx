import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { PALETTE } from '../constants/palette';
import { useProgressStore } from '../state/progressStore';

interface EndlessScreenProps {
  onStartEndless: () => void;
  onStartDaily: () => void;
  onBack: () => void;
}

export const EndlessScreen: React.FC<EndlessScreenProps> = ({
  onStartEndless,
  onStartDaily,
  onBack,
}) => {
  const { endlessHighScore, dailyBestDepth } = useProgressStore();
  const todayNumber = Math.floor(Date.now() / 86400000) % 1000;

  const handleShareDaily = () => {
    const cardText = `BATS VIEW — DAILY ${todayNumber}\nDEPTH ${dailyBestDepth} · GHOST RUN 🦇\n▓▓▓▓▓▓▓▓░░`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cardText);
      Alert.alert('RESULT COPIED', 'Daily Descent score copied to clipboard!');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← BACK</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.title}>THE ABYSS</Text>
          <Text style={styles.subtitle}>ENDLESS DESCENT PROTOCOL</Text>
        </View>

        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
        {/* Endless Mode Card */}
        <View style={styles.modeCard}>
          <View style={styles.modeHeader}>
            <Text style={styles.modeTitle}>ENDLESS DESCENT</Text>
            <Text style={styles.highScoreTag}>BEST: DEPTH {endlessHighScore}</Text>
          </View>

          <Text style={styles.modeDesc}>
            Descend through infinite procedural chambers. Pulses do NOT refill between floors. Collect shards, conserve energy, and survive the deepening dark.
          </Text>

          <TouchableOpacity style={styles.launchBtn} onPress={onStartEndless} activeOpacity={0.8}>
            <Text style={styles.launchBtnText}>BEGIN DESCENT ▼</Text>
          </TouchableOpacity>
        </View>

        {/* Daily Shared Seed Descent Card */}
        <View style={styles.modeCard}>
          <View style={styles.modeHeader}>
            <Text style={styles.modeTitle}>DAILY DESCENT · #{todayNumber}</Text>
            <Text style={[styles.highScoreTag, { color: PALETTE.shardGold }]}>
              TODAY: DEPTH {dailyBestDepth}
            </Text>
          </View>

          <Text style={styles.modeDesc}>
            One globally shared seed per day. One run. Compare your depth and pulse efficiency with all other players worldwide.
          </Text>

          <View style={styles.dailyRow}>
            <TouchableOpacity style={styles.dailyLaunchBtn} onPress={onStartDaily} activeOpacity={0.8}>
              <Text style={styles.launchBtnText}>ATTEMPT DAILY RUN</Text>
            </TouchableOpacity>

            {dailyBestDepth > 0 && (
              <TouchableOpacity style={styles.shareBtn} onPress={handleShareDaily} activeOpacity={0.7}>
                <Text style={styles.shareBtnText}>SHARE CARD</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
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
  scrollList: {
    paddingHorizontal: 20,
    gap: 16,
  },
  modeCard: {
    backgroundColor: 'rgba(8, 13, 22, 0.7)',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(77, 240, 255, 0.2)',
    padding: 18,
  },
  modeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modeTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  highScoreTag: {
    fontSize: 10,
    fontWeight: '800',
    color: PALETTE.sonarCyan,
    letterSpacing: 1,
  },
  modeDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 16,
    letterSpacing: 0.4,
  },
  launchBtn: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 4,
    backgroundColor: PALETTE.sonarCyan,
    alignItems: 'center',
  },
  launchBtnText: {
    color: '#04060A',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.8,
  },
  dailyRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dailyLaunchBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 4,
    backgroundColor: PALETTE.sonarCyan,
    alignItems: 'center',
  },
  shareBtn: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: PALETTE.shardGold,
    backgroundColor: 'rgba(255, 201, 107, 0.08)',
    alignItems: 'center',
  },
  shareBtnText: {
    color: PALETTE.shardGold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.2,
  },
});
