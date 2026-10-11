import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { PALETTE } from '../constants/palette';
import { useProgressStore, ABILITIES } from '../state/progressStore';
import { AbilityId } from '../types/game';

interface AbilitiesScreenProps {
  onBack: () => void;
}

export const AbilitiesScreen: React.FC<AbilitiesScreenProps> = ({ onBack }) => {
  const { shards, unlockedAbilities, equippedAbilities, unlockAbility, toggleEquipAbility } =
    useProgressStore();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← BACK</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.title}>ABILITY MATRIX</Text>
          <Text style={styles.subtitle}>2 LOADOUT SLOTS AVAILABLE</Text>
        </View>

        <Text style={styles.shardCount}>✦ {shards}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
        {/* Loadout Status Bar */}
        <View style={styles.loadoutBar}>
          <Text style={styles.loadoutTitle}>EQUIPPED ABILITIES ({equippedAbilities.length}/2)</Text>
          <View style={styles.equippedRow}>
            {equippedAbilities.map((id) => (
              <View key={id} style={styles.equippedChip}>
                <Text style={styles.equippedChipText}>{ABILITIES[id]?.name.toUpperCase()}</Text>
              </View>
            ))}
            {equippedAbilities.length === 0 && (
              <Text style={styles.emptySlotText}>No abilities equipped (tap unlocked cards below)</Text>
            )}
          </View>
        </View>

        {/* Ability Cards */}
        {Object.values(ABILITIES).map((ability) => {
          const isUnlocked = unlockedAbilities.includes(ability.id);
          const isEquipped = equippedAbilities.includes(ability.id);
          const canAfford = shards >= ability.cost;

          return (
            <View
              key={ability.id}
              style={[
                styles.card,
                {
                  borderColor: isEquipped
                    ? PALETTE.sonarCyan
                    : isUnlocked
                    ? 'rgba(255, 255, 255, 0.15)'
                    : 'rgba(255, 255, 255, 0.05)',
                  backgroundColor: isEquipped
                    ? 'rgba(77, 240, 255, 0.06)'
                    : 'rgba(8, 13, 22, 0.5)',
                },
              ]}
            >
              <View style={styles.cardTop}>
                <Text style={styles.abilityName}>{ability.name.toUpperCase()}</Text>
                {isUnlocked ? (
                  <TouchableOpacity
                    style={[
                      styles.equipBtn,
                      {
                        backgroundColor: isEquipped ? PALETTE.sonarCyan : 'rgba(255,255,255,0.08)',
                      },
                    ]}
                    onPress={() => toggleEquipAbility(ability.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.equipBtnText,
                        { color: isEquipped ? '#000000' : '#FFFFFF' },
                      ]}
                    >
                      {isEquipped ? 'EQUIPPED ✓' : 'EQUIP'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.unlockBtn,
                      {
                        backgroundColor: canAfford ? PALETTE.shardGold : 'rgba(255,255,255,0.05)',
                        opacity: canAfford ? 1.0 : 0.4,
                      },
                    ]}
                    disabled={!canAfford}
                    onPress={() => unlockAbility(ability.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.unlockBtnText,
                        { color: canAfford ? '#000000' : '#94A3B8' },
                      ]}
                    >
                      UNLOCK {ability.cost} ✦
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.abilityDesc}>{ability.description}</Text>
            </View>
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
  loadoutBar: {
    backgroundColor: 'rgba(77, 240, 255, 0.05)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(77, 240, 255, 0.15)',
    padding: 12,
    marginBottom: 8,
  },
  loadoutTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: PALETTE.sonarCyan,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  equippedRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  equippedChip: {
    backgroundColor: PALETTE.sonarCyan,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 3,
  },
  equippedChipText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 1,
  },
  emptySlotText: {
    fontSize: 10,
    color: '#64748B',
    fontStyle: 'italic',
  },
  card: {
    borderRadius: 6,
    padding: 16,
    borderWidth: 1.5,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  abilityName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  abilityDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
    letterSpacing: 0.4,
  },
  equipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  equipBtnText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  unlockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  unlockBtnText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
