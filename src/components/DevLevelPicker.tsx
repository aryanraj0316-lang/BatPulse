import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { LevelFactory } from '../levels/generated';
import { ART } from '../render/art/kit';

const MAX_LEVEL = 30;
const { width: SW, height: SH } = Dimensions.get('window');

interface DevLevelPickerProps {
  currentLevel: number;
  onPick: (levelId: number) => void;
  onClose: () => void;
}

/** What a level contains, read straight from the level generator. */
function describe(levelId: number) {
  const lvl = LevelFactory.createLevel(levelId, undefined, SW, SH);
  const tags: string[] = [];
  const count = (type: string) => lvl.objects.filter((o) => o.type === type).length;
  if (lvl.hunters.length) tags.push(`${lvl.hunters.length} wraith${lvl.hunters.length > 1 ? 's' : ''}`);
  if (count('chasm')) tags.push('water');
  if (count('key')) tags.push('key + locked exit');
  if (count('echo_crystal')) tags.push('crystal');
  if (count('sonar_shard')) tags.push('orb');
  return {
    id: levelId,
    name: lvl.name,
    sonar: lvl.sonar.allowance >= 999 ? '∞' : String(lvl.sonar.allowance),
    tags: tags.length ? tags.join(' · ') : 'walls only',
  };
}

/** Development-only level jumper. */
export const DevLevelPicker: React.FC<DevLevelPickerProps> = ({ currentLevel, onPick, onClose }) => {
  const levels = useMemo(() => Array.from({ length: MAX_LEVEL }, (_, i) => describe(i + 1)), []);

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>DEV · JUMP TO LEVEL</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.grid}>
          {levels.map((l) => {
            const active = l.id === currentLevel;
            return (
              <TouchableOpacity
                key={l.id}
                style={[styles.tile, active && styles.tileActive]}
                onPress={() => onPick(l.id)}
                activeOpacity={0.75}
              >
                <View style={styles.tileTop}>
                  <Text style={[styles.num, active && { color: '#04121A' }]}>{l.id}</Text>
                  <Text style={[styles.sonar, active && { color: '#04121A' }]}>sonar {l.sonar}</Text>
                </View>
                <Text style={[styles.name, active && { color: '#04121A' }]} numberOfLines={1}>
                  {l.name}
                </Text>
                <Text style={[styles.tags, active && { color: '#0A2A33' }]} numberOfLines={2}>
                  {l.tags}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(1, 3, 6, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
  },
  card: {
    width: '92%',
    maxHeight: '82%',
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 194, 74, 0.55)',
    backgroundColor: 'rgba(6, 12, 20, 0.97)',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 },
  title: { color: ART.gold, fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  closeText: { color: '#E6EEF6', fontSize: 14, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  tile: {
    width: '48.5%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(77, 240, 255, 0.25)',
    backgroundColor: 'rgba(77, 240, 255, 0.05)',
    padding: 8,
  },
  tileActive: { backgroundColor: ART.cyan, borderColor: ART.cyan },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  num: { color: '#F2F7FB', fontSize: 18, fontWeight: '800' },
  sonar: { color: ART.cyan, fontSize: 9, fontWeight: '700' },
  name: { color: '#C9D6E2', fontSize: 10, fontWeight: '600', marginTop: 2 },
  tags: { color: '#8FA3B8', fontSize: 9, marginTop: 2 },
});
