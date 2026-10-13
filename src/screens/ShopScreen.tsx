import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Svg from 'react-native-svg';
import { PALETTE } from '../constants/palette';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { AssetRegistry } from '../assets/AssetRegistry';
import { useProgressStore } from '../state/progressStore';
import { CHARACTER_IDS, momentumText, statBars, visualKeyOf } from '../game/characters';
import { audio } from '../audio';

interface Props {
  onBack: () => void;
}

const PREVIEW = 92;

/** Looping idle animation of a bat (wing flap + slow turn), drawn through the AssetRegistry. */
const BatPreview: React.FC<{ id: string; dim: boolean }> = ({ id, dim }) => {
  const [t, setT] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setT((v) => v + 0.1), 100);
    return () => clearInterval(h);
  }, []);
  const Visual = AssetRegistry.getVisual(visualKeyOf(id));
  return (
    <Svg width={PREVIEW} height={PREVIEW} opacity={dim ? 0.45 : 1}>
      <Visual x={PREVIEW / 2} y={PREVIEW / 2} width={PREVIEW * 0.8} height={PREVIEW * 0.8} rotation={Math.sin(t * 1.3) * 10} frame={Math.floor(t * 3) % 2 === 0 ? 0 : 1} time={t} glow={0.4} />
    </Svg>
  );
};

export const ShopScreen: React.FC<Props> = ({ onBack }) => {
  const shards = useProgressStore((s) => s.shards);
  const unlocked = useProgressStore((s) => s.unlockedCharacters);
  const selected = useProgressStore((s) => s.selectedCharacter);
  const buy = useProgressStore((s) => s.buyCharacter);
  const choose = useProgressStore((s) => s.chooseCharacter);
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null);

  const onBuy = (id: string) => {
    const r = buy(id);
    if (r.ok) {
      audio.play('sfx_finish');
      setNotice({ id, text: `${ECHO_CONFIG.characters[id].name} unlocked!` });
      choose(id);
    } else if (r.reason === 'not_enough_shards') {
      setNotice({ id, text: `Need ${r.missing} more shards` });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} testID="shop-back">
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>BAT SHOP</Text>
        <Text style={styles.shards} testID="shop-shards">
          ✦ {shards}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {CHARACTER_IDS.map((id) => {
          const c = ECHO_CONFIG.characters[id];
          const owned = unlocked.includes(id);
          const equipped = selected === id;
          const affordable = shards >= c.price;
          return (
            <View key={id} style={[styles.card, equipped && styles.cardEquipped]} testID={`shop-card-${id}`}>
              <View style={styles.cardTop}>
                <BatPreview id={id} dim={!owned} />
                <View style={styles.info}>
                  <Text style={styles.name}>{c.name.toUpperCase()}</Text>
                  <Text style={styles.tagline}>{c.tagline}</Text>
                  {statBars(id).map((b) => (
                    <View key={b.key} style={styles.statRow}>
                      <Text style={styles.statLabel}>{b.label}</Text>
                      <View style={styles.statTrack}>
                        <View style={[styles.statFill, { width: `${Math.round(b.value * 100)}%` }]} />
                      </View>
                      <Text style={styles.statText}>{b.text}</Text>
                    </View>
                  ))}
                  <Text style={styles.momentum}>{momentumText(id)}</Text>
                </View>
              </View>

              {owned ? (
                <TouchableOpacity
                  style={[styles.btn, equipped ? styles.btnEquipped : styles.btnEquip]}
                  disabled={equipped}
                  onPress={() => choose(id)}
                  testID={`shop-equip-${id}`}
                >
                  <Text style={styles.btnText}>{equipped ? 'EQUIPPED' : 'EQUIP'}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.btn, affordable ? styles.btnBuy : styles.btnLocked]} onPress={() => onBuy(id)} testID={`shop-buy-${id}`}>
                  <Text style={styles.btnText}>
                    ✦ {c.price.toLocaleString('en-US')} · {affordable ? 'BUY' : 'NOT ENOUGH SHARDS'}
                  </Text>
                </TouchableOpacity>
              )}
              {notice?.id === id && (
                <Text style={styles.notice} testID="shop-notice">
                  {notice.text}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.voidBlack },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  backText: { color: PALETTE.sonarCyan, fontWeight: '800', fontSize: 11, letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontWeight: '900', fontSize: 15, letterSpacing: 3 },
  shards: { color: PALETTE.shardGold, fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  card: { borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.03)', padding: 12 },
  cardEquipped: { borderColor: PALETTE.sonarCyan },
  cardTop: { flexDirection: 'row', gap: 10 },
  info: { flex: 1 },
  name: { color: '#FFFFFF', fontWeight: '900', fontSize: 13, letterSpacing: 2 },
  tagline: { color: '#94A3B8', fontSize: 10, marginTop: 2, marginBottom: 6 },
  statRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  statLabel: { width: 62, color: '#64748B', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  statTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  statFill: { height: '100%', backgroundColor: PALETTE.sonarCyan },
  statText: { width: 70, textAlign: 'right', color: '#CBD5E1', fontSize: 9 },
  momentum: { color: PALETTE.shardGold, fontSize: 9, marginTop: 6 },
  btn: { marginTop: 10, paddingVertical: 11, borderRadius: 6, alignItems: 'center' },
  btnBuy: { backgroundColor: PALETTE.sonarCyan },
  btnLocked: { backgroundColor: 'rgba(255,255,255,0.08)' },
  btnEquip: { backgroundColor: 'rgba(77,240,255,0.18)', borderWidth: 1, borderColor: PALETTE.sonarCyan },
  btnEquipped: { backgroundColor: 'rgba(255,255,255,0.05)' },
  btnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11, letterSpacing: 1.5 },
  notice: { color: PALETTE.shardGold, fontSize: 10, marginTop: 6, textAlign: 'center' },
});
