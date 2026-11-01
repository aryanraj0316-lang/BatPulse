import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Animated, Easing } from 'react-native';
import { Gem, Lock, Check } from 'lucide-react-native';
import { useProgressStore, ABILITIES } from '../state/progressStore';
import { useSettingsStore } from '../state/settingsStore';
import { AudioEngine } from '../engine/AudioEngine';
import { AbilityId } from '../types/game';
import { MenuBackground } from '../ui/Chrome';
import { CarvedHeader, SteelFrame, SectionLabel } from '../ui/Frame';
import { UI } from '../ui/theme';
import { LiveCanvas } from '../render/LiveCanvas';
import { drawSigil, type SigilState } from '../render/menuArt';

interface AbilitiesScreenProps {
  onBack: () => void;
}

const SLOTS = 2;
const ORDER: AbilityId[] = ['WIDE_PULSE', 'PIERCING_PING', 'WHISPER_STEP', 'RICOCHET', 'SIXTH_SENSE'];

const Sigil: React.FC<{ id: AbilityId; state: SigilState; size: number; animated?: boolean }> = ({ id, state, size, animated = true }) => (
  <LiveCanvas width={size} height={size} fps={40} animated={animated && state !== 'locked'} deps={[id, state]} draw={(c, t) => drawSigil(c, t, size, id, state)} />
);

/** One loadout socket: carved stone ring, holds an equipped sigil or sits empty. */
const Socket: React.FC<{ id?: AbilityId; onPress?: () => void }> = ({ id, onPress }) => {
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    pop.setValue(0.6);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [id, pop]);
  return (
    <Pressable onPress={onPress} disabled={!id} style={styles.socket}>
      <View style={styles.socketRing}>
        {id ? (
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <Sigil id={id} state="equipped" size={86} />
          </Animated.View>
        ) : (
          <View style={styles.socketEmpty}>
            <Text style={styles.socketPlus}>+</Text>
          </View>
        )}
      </View>
      <Text style={[styles.socketName, !id && { color: '#5E6A78' }]} numberOfLines={1}>
        {id ? ABILITIES[id].name.toUpperCase() : 'EMPTY SLOT'}
      </Text>
    </Pressable>
  );
};

export const AbilitiesScreen: React.FC<AbilitiesScreenProps> = ({ onBack }) => {
  const { shards, unlockedAbilities, equippedAbilities, unlockAbility, toggleEquipAbility } = useProgressStore();
  const { soundEnabled } = useSettingsStore();

  const slots = Array.from({ length: SLOTS }, (_, i) => equippedAbilities[i]);

  return (
    <View style={styles.container}>
      <MenuBackground dim />
      <CarvedHeader
        title="ABILITIES"
        subtitle={`${equippedAbilities.length} / ${SLOTS} SLOTS FILLED`}
        onBack={onBack}
        right={
          <View style={styles.shardChip}>
            <Gem size={14} color="#7FD8FF" />
            <Text style={styles.shardText}>{shards}</Text>
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Loadout altar */}
        <SteelFrame cut={18} padding={14} style={{ marginBottom: 18 }} fill={['#0E1A22', '#06090D']}>
          <View style={styles.altar}>
            {slots.map((id, i) => (
              <Socket key={i} id={id} onPress={() => id && toggleEquipAbility(id)} />
            ))}
          </View>
          <Text style={styles.altarHint}>Tap an ability below to equip it. Tap a socket to remove it.</Text>
        </SteelFrame>

        <SectionLabel>ABILITIES</SectionLabel>
        {ORDER.map((id) => {
          const ab = ABILITIES[id];
          const owned = unlockedAbilities.includes(id);
          const equipped = equippedAbilities.includes(id);
          const afford = shards >= ab.cost;
          const state: SigilState = equipped ? 'equipped' : owned ? 'owned' : 'locked';
          const onPress = () => {
            if (owned) {
              toggleEquipAbility(id);
              AudioEngine.playShardChime(soundEnabled);
            } else if (afford && unlockAbility(id)) {
              AudioEngine.playLevelComplete(soundEnabled);
            }
          };
          return (
            <Pressable key={id} onPress={onPress} disabled={!owned && !afford} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }], marginBottom: 12 })}>
              <SteelFrame cut={14} padding={12} accent={equipped ? UI.color.cyan : undefined} active={equipped} dim={!owned && !afford}>
                <View style={styles.cardRow}>
                  <Sigil id={id} state={state} size={64} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, equipped && { color: '#E8FDFF' }]}>{ab.name.toUpperCase()}</Text>
                    <Text style={styles.desc}>{ab.description}</Text>
                  </View>
                  {equipped ? (
                    <View style={[styles.tag, styles.tagOn]}>
                      <Check size={12} color="#03161B" strokeWidth={3} />
                      <Text style={[styles.tagText, { color: '#03161B' }]}>ON</Text>
                    </View>
                  ) : owned ? (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>EQUIP</Text>
                    </View>
                  ) : (
                    <View style={[styles.tag, afford ? styles.tagGold : styles.tagLocked]}>
                      {afford ? <Gem size={12} color="#1A1206" /> : <Lock size={11} color="#8592A2" />}
                      <Text style={[styles.tagText, { color: afford ? '#1A1206' : '#8592A2' }]}>{ab.cost}</Text>
                    </View>
                  )}
                </View>
              </SteelFrame>
            </Pressable>
          );
        })}
        <Text style={styles.foot}>Earn shards by clearing levels and descending in Endless.</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.color.ink, paddingTop: 30 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  shardChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 6, borderWidth: 1, borderColor: UI.color.stoneEdge, backgroundColor: 'rgba(10,14,19,0.85)' },
  shardText: { fontFamily: UI.font.techBold, fontSize: 14, color: UI.color.text },
  altar: { flexDirection: 'row', justifyContent: 'space-evenly' },
  socket: { alignItems: 'center', width: 130 },
  socketRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#5A4A36',
    backgroundColor: 'rgba(0,0,0,0.55)',
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  socketEmpty: { width: 78, height: 78, borderRadius: 39, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(160,175,195,0.35)', alignItems: 'center', justifyContent: 'center' },
  socketPlus: { fontFamily: UI.font.tech, fontSize: 28, color: 'rgba(160,175,195,0.45)' },
  socketName: { fontFamily: UI.font.label, fontSize: 11.5, letterSpacing: 1.6, color: UI.color.cyanSoft, marginTop: 8 },
  altarHint: { fontFamily: UI.font.body, fontSize: 12.5, color: '#7E8B9A', textAlign: 'center', marginTop: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: UI.font.heading, fontSize: 15, letterSpacing: 1.2, color: '#E8ECF0' },
  desc: { fontFamily: UI.font.body, fontSize: 13.5, color: '#93A0B0', marginTop: 2, lineHeight: 18 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(160,175,195,0.45)', backgroundColor: 'rgba(0,0,0,0.35)' },
  tagOn: { backgroundColor: UI.color.cyan, borderColor: UI.color.cyan },
  tagGold: { backgroundColor: UI.color.gold, borderColor: UI.color.gold },
  tagLocked: { borderColor: 'rgba(120,130,145,0.3)' },
  tagText: { fontFamily: UI.font.techBold, fontSize: 12.5, letterSpacing: 1.5, color: '#D8E0E8' },
  foot: { fontFamily: UI.font.body, fontSize: 12.5, color: '#6E7A88', textAlign: 'center', marginTop: 6 },
});
