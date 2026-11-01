import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Dimensions, Animated, Easing, PanResponder } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Gem, Lock, Check, Star, Trophy, Ghost, Radio, Wind, EyeOff, Eye, Coins, Sparkles } from 'lucide-react-native';
import { CarvedHeader, SteelFrame, SectionLabel } from '../ui/Frame';
import { StoneButton } from '../ui/StoneButton';
import { UI } from '../ui/theme';
import { useProgressStore, skinProgress } from '../state/progressStore';
import { SKINS, RARITY_COLOR, skinStatus, unlockLabel, type SkinDef, type SkinPower, type Rarity } from '../skins/skins';
import { SkinPreview } from '../render/skins/SkinPreview';
import { LiveCanvas } from '../render/LiveCanvas';
import { drawRoostAtmosphere, drawBurst } from '../render/menuArt';
import { AudioEngine } from '../engine/AudioEngine';
import { useSettingsStore } from '../state/settingsStore';

const { width: SW, height: SH } = Dimensions.get('window');
const HEADER_H = 96;
const HERO_H = Math.round(Math.min(340, SH * 0.4));
const GRID_GAP = 8;
const CARD_W = Math.floor((SW - 32 - GRID_GAP * 3) / 4);
const RARITY_RANK: Record<Rarity, number> = { COMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };

interface Props {
  onBack: () => void;
}

// ─── Attributes: what each skin's power does, as stat bars ───────────────────
interface Stat {
  key: string;
  icon: typeof Radio;
  /** 0..1 bonus strength */
  val: (p: SkinPower) => number;
  /** short bonus text, '' when none */
  label: (p: SkinPower) => string;
}
const STATS: Stat[] = [
  {
    key: 'SONAR',
    icon: Radio,
    val: (p) => (1 - (p.reloadMult ?? 1)) * 1.6 + (p.extraPulse ?? 0) * 0.45,
    label: (p) => (p.extraPulse ? `+${p.extraPulse} PULSE` : p.reloadMult ? `${Math.round((1 - p.reloadMult) * 100)}% FASTER` : ''),
  },
  { key: 'SPEED', icon: Wind, val: (p) => ((p.speedMult ?? 1) - 1) * 4, label: (p) => (p.speedMult ? `+${Math.round((p.speedMult - 1) * 100)}%` : '') },
  {
    key: 'STEALTH',
    icon: EyeOff,
    val: (p) => (1 - (p.visionMult ?? 1)) * 2 + (1 - (p.wraithSpeedMult ?? 1)) * 3.5,
    label: (p) => (p.visionMult ? `-${Math.round((1 - p.visionMult) * 100)}% SIGHT` : p.wraithSpeedMult ? `-${Math.round((1 - p.wraithSpeedMult) * 100)}% WRAITH` : ''),
  },
  { key: 'MEMORY', icon: Eye, val: (p) => (p.revealHoldMs ?? 0) / 900, label: (p) => (p.revealHoldMs ? `+${(p.revealHoldMs / 1000).toFixed(1)}s` : '') },
  { key: 'FORTUNE', icon: Coins, val: (p) => ((p.shardMult ?? 1) - 1) * 1.2, label: (p) => (p.shardMult ? `+${Math.round((p.shardMult - 1) * 100)}%` : '') },
];
const BASE = 0.38;

const StatBar: React.FC<{ stat: Stat; power: SkinPower; color: string; soft: string; index: number }> = ({ stat, power, color, soft, index }) => {
  const bonus = Math.min(1 - BASE, Math.max(0, stat.val(power)) * (1 - BASE));
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 650, delay: 80 * index, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [power, a, index]);
  const Icon = stat.icon;
  const label = stat.label(power);
  return (
    <View style={styles.stat}>
      <Icon size={14} color={label ? soft : '#5E6A78'} />
      <Text style={[styles.statKey, label ? { color: '#D8E0E8' } : null]}>{stat.key}</Text>
      <View style={styles.statTrack}>
        <Animated.View style={[styles.statBase, { width: a.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${BASE * 100}%`] }) }]} />
        {bonus > 0 && (
          <Animated.View
            style={[
              styles.statBonus,
              {
                left: `${BASE * 100}%`,
                width: a.interpolate({ inputRange: [0, 0.4, 1], outputRange: ['0%', '0%', `${bonus * 100}%`] }),
                backgroundColor: color,
                shadowColor: color,
              },
            ]}
          />
        )}
        {[0.25, 0.5, 0.75].map((x) => (
          <View key={x} style={[styles.statNotch, { left: `${x * 100}%` }]} />
        ))}
      </View>
      <Text style={[styles.statVal, { color: label ? soft : '#4E5A68' }]} numberOfLines={1}>
        {label || '—'}
      </Text>
    </View>
  );
};

// ─── Small pieces ────────────────────────────────────────────────────────────
const UnlockIcon: React.FC<{ s: SkinDef; color: string; size?: number }> = ({ s, color, size = 14 }) => {
  const P = { size, color, strokeWidth: 2 };
  switch (s.unlock.kind) {
    case 'shards':
      return <Gem {...P} />;
    case 'stars':
      return <Star {...P} fill={color} />;
    case 'ghost':
      return <Ghost {...P} />;
    default:
      return <Trophy {...P} />;
  }
};

function progressText(s: SkinDef, p: ReturnType<typeof skinProgress>) {
  const u = s.unlock;
  if (u.kind === 'free') return '';
  const have = u.kind === 'shards' ? p.shards : u.kind === 'level' ? p.highestCleared : u.kind === 'stars' ? p.stars : p.ghostRuns;
  return `${Math.min(have, u.value)} / ${u.value}`;
}

/** Rarity plate with a light sweep running across it. */
const RarityPlate: React.FC<{ rarity: Rarity }> = ({ rarity }) => {
  const rc = RARITY_COLOR[rarity];
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([Animated.timing(sweep, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.delay(1600)]));
    sweep.setValue(0);
    l.start();
    return () => l.stop();
  }, [sweep, rarity]);
  return (
    <View style={[styles.rarity, { borderColor: rc.main, backgroundColor: `${rc.deep}E6` }]}>
      <Animated.View style={[styles.raritySweep, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-60, 160] }) }, { skewX: '-25deg' }] }]}>
        <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={styles.rarityPips}>
        {Array.from({ length: 5 }, (_, i) => (
          <Svg key={i} width={7} height={7} viewBox="0 0 10 10">
            <Path d="M5 0l5 5-5 5-5-5z" fill={i < RARITY_RANK[rarity] ? rc.soft : 'rgba(255,255,255,0.15)'} />
          </Svg>
        ))}
      </View>
      <Text style={[styles.rarityText, { color: rc.soft }]}>{rarity}</Text>
    </View>
  );
};

const Arrow: React.FC<{ dir: -1 | 1; onPress: () => void }> = ({ dir, onPress }) => (
  <Pressable onPress={onPress} hitSlop={12} style={({ pressed }) => [styles.arrow, dir < 0 ? { left: 10 } : { right: 10 }, pressed && { transform: [{ scale: 0.9 }] }]}>
    <SteelFrame cut={8} padding={0} studs={false} style={styles.arrowInner} fillOpacity={0.75}>
<View>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path d={dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} stroke="#DCE6F0" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      </View>
    </SteelFrame>
  </Pressable>
);

// ─── Screen ──────────────────────────────────────────────────────────────────
export const SkinsScreen: React.FC<Props> = ({ onBack }) => {
  const state = useProgressStore();
  const { equippedSkin, buySkin, equipSkin, shards } = state;
  const { soundEnabled } = useSettingsStore();
  const prog = skinProgress(state);
  const [index, setIndex] = useState(() => Math.max(0, SKINS.findIndex((s) => s.id === equippedSkin)));
  const skin = SKINS[index];
  const status = skinStatus(skin, prog);
  const rc = RARITY_COLOR[skin.rarity];
  const isEquipped = equippedSkin === skin.id;
  const owned = useMemo(() => SKINS.filter((s) => skinStatus(s, prog).state === 'owned').length, [prog]);

  // hero slide when the selection changes
  const slide = useRef(new Animated.Value(0)).current;
  const dirRef = useRef(1);
  const select = (i: number, dir?: number) => {
    const n = (i + SKINS.length) % SKINS.length;
    if (n === index) return;
    dirRef.current = dir ?? (n > index ? 1 : -1);
    setIndex(n);
    AudioEngine.playSonarPulse(soundEnabled);
  };
  useEffect(() => {
    slide.setValue(dirRef.current);
    Animated.spring(slide, { toValue: 0, friction: 9, tension: 70, useNativeDriver: true }).start();
  }, [index, slide]);

  // swipe the hero left / right
  const indexRef = useRef(index);
  indexRef.current = index;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -50) select(indexRef.current + 1, 1);
          else if (g.dx > 50) select(indexRef.current - 1, -1);
        },
      }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // unlock / equip celebration
  const [burst, setBurst] = useState<{ at: number; color: string; text: string } | null>(null);
  const pop = useRef(new Animated.Value(0)).current;
  const celebrate = (text: string, color: string) => {
    setBurst({ at: Date.now(), color, text });
    pop.setValue(0);
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 110, useNativeDriver: true }),
      Animated.delay(700),
      Animated.timing(pop, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setBurst(null));
  };

  const action = () => {
    if (status.state === 'owned') {
      if (!isEquipped && equipSkin(skin.id)) {
        AudioEngine.playShardChime(soundEnabled);
        celebrate('EQUIPPED', skin.fx.glow);
      }
    } else if (status.state === 'ready' && skin.unlock.kind === 'shards') {
      if (buySkin(skin.id)) {
        AudioEngine.playLevelComplete(soundEnabled);
        celebrate('AWAKENED', rc.main);
      }
    }
  };

  let buttonLabel = 'EQUIP';
  let variant: 'primary' | 'gold' | 'stone' = 'primary';
  let disabled = false;
  if (status.state === 'owned' && isEquipped) {
    buttonLabel = 'EQUIPPED';
    variant = 'stone';
    disabled = true;
  } else if (status.state === 'ready') {
    buttonLabel = `AWAKEN · ${skin.unlock.kind === 'shards' ? skin.unlock.value : ''}`;
    variant = 'gold';
  } else if (status.state === 'locked') {
    buttonLabel = unlockLabel(skin.unlock).toUpperCase();
    variant = 'stone';
    disabled = true;
  }

  const heroCenter = HEADER_H + 30 + HERO_H * 0.5;

  return (
    <View style={styles.container}>
      {/* living backdrop in the selected skin's colours */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LiveCanvas width={SW} height={SH} fps={40} deps={[skin.id]} draw={(c, t, w, h) => drawRoostAtmosphere(c, t, w, h, skin, rc.main, heroCenter)} />
      </View>

      <CarvedHeader
        title="THE ROOST"
        subtitle={`${owned} / ${SKINS.length} BATS AWAKENED`}
        onBack={onBack}
        right={
          <View style={styles.shardChip}>
            <Gem size={14} color="#7FD8FF" />
            <Text style={styles.shardText}>{shards}</Text>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* ── Hero ── */}
        <View style={{ height: HERO_H }} {...pan.panHandlers}>
          <Animated.View
            style={{
              flex: 1,
              opacity: slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: slide.interpolate({ inputRange: [-1, 1], outputRange: [-SW * 0.45, SW * 0.45] }) },
                { scale: slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.8, 1, 0.8] }) },
              ],
            }}
          >
            <SkinPreview key={skin.id} skin={skin} width={SW} height={HERO_H} animated dim={status.state === 'locked'} />
          </Animated.View>
          {status.state === 'locked' && (
            <View style={styles.lockBadge} pointerEvents="none">
              <Lock size={24} color={rc.soft} />
            </View>
          )}
          <View style={styles.rarityWrap} pointerEvents="none">
            <RarityPlate rarity={skin.rarity} />
          </View>
          {isEquipped && (
            <View style={styles.wornTag} pointerEvents="none">
              <Check size={12} color="#03161B" strokeWidth={3} />
              <Text style={styles.wornText}>WORN</Text>
            </View>
          )}
          <Arrow dir={-1} onPress={() => select(index - 1, -1)} />
          <Arrow dir={1} onPress={() => select(index + 1, 1)} />
        </View>

        {/* page dots */}
        <View style={styles.dots}>
          {SKINS.map((s, i) => (
            <Pressable key={s.id} onPress={() => select(i)} hitSlop={6}>
              <View style={[styles.dot, i === index && { width: 18, backgroundColor: rc.main }]} />
            </Pressable>
          ))}
        </View>

        {/* ── Identity ── */}
        <View style={styles.identity}>
          <Text style={[styles.name, { textShadowColor: rc.main }]}>{skin.name.toUpperCase()}</Text>
          <Text style={[styles.epithet, { color: rc.soft }]}>— {skin.epithet} —</Text>
        </View>

        <View style={styles.pad}>
          {/* action + requirement */}
          {status.state !== 'owned' && (
            <View style={styles.req}>
              <UnlockIcon s={skin} color={rc.soft} />
              <Text style={styles.reqText}>{unlockLabel(skin.unlock)}</Text>
              <View style={styles.reqBar}>
                <LinearGradient colors={[rc.main, rc.soft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.reqFill, { width: `${Math.round(status.progress * 100)}%` }]} />
              </View>
              <Text style={styles.reqCount}>{progressText(skin, prog)}</Text>
            </View>
          )}
          <StoneButton label={buttonLabel} variant={variant} disabled={disabled} onPress={action} icon={status.state === 'ready' ? Gem : isEquipped ? Check : status.state === 'locked' ? Lock : Sparkles} />

          {/* power */}
          <SteelFrame cut={14} padding={14} accent={rc.main} active style={{ marginTop: 16 }} fill={[`${rc.deep}`, '#07090D']} fillOpacity={0.88}>
            <View style={styles.powerRow}>
              <View style={[styles.powerIcon, { borderColor: rc.main, shadowColor: rc.main }]}>
                <Sparkles size={18} color={rc.soft} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.powerKicker, { color: rc.main }]}>SIGNATURE POWER</Text>
                <Text style={styles.powerName}>{skin.power.label.toUpperCase()}</Text>
                <Text style={styles.powerDesc}>{skin.power.desc}</Text>
              </View>
            </View>
          </SteelFrame>

          {/* attributes */}
          <SteelFrame cut={14} padding={14} style={{ marginTop: 12 }}>
            <SectionLabel color={rc.soft}>ATTRIBUTES</SectionLabel>
            {STATS.map((st, i) => (
              <StatBar key={`${skin.id}${st.key}`} stat={st} power={skin.power} color={rc.main} soft={rc.soft} index={i} />
            ))}
          </SteelFrame>

          <Text style={styles.lore}>“{skin.lore}”</Text>

          {/* collection */}
          <SectionLabel style={{ marginTop: 22 }}>COLLECTION</SectionLabel>
          <View style={styles.grid}>
            {SKINS.map((s, i) => {
              const st = skinStatus(s, prog);
              const c = RARITY_COLOR[s.rarity];
              const active = i === index;
              const worn = s.id === equippedSkin;
              return (
                <Pressable key={s.id} onPress={() => select(i)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : active ? 1.03 : 1 }] })}>
                  <SteelFrame cut={10} padding={0} studs={false} accent={active ? c.main : undefined} active={active} fill={[c.deep, '#06080B']} fillOpacity={0.95} style={{ width: CARD_W }}>
                    <View style={styles.cardInner}>
                      <SkinPreview skin={s} width={CARD_W - 8} height={CARD_W - 14} animated={false} dim={st.state === 'locked'} bare />
                      <View style={[styles.cardStripe, { backgroundColor: c.main }]} />
                      <Text numberOfLines={1} style={[styles.cardName, { color: st.state === 'locked' ? '#6E7A88' : '#E8EEF4' }]}>
                        {s.name.split(' ')[0].toUpperCase()}
                      </Text>
                      <View style={styles.cardFoot}>
                        {worn ? (
                          <Check size={11} color={UI.color.cyan} strokeWidth={3} />
                        ) : st.state === 'locked' ? (
                          <Lock size={10} color="#6E7A88" />
                        ) : st.state === 'ready' ? (
                          <Gem size={10} color={UI.color.gold} />
                        ) : (
                          <Sparkles size={10} color={c.soft} />
                        )}
                      </View>
                    </View>
                  </SteelFrame>
                  {st.state === 'ready' && <View style={[styles.readyDot]} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* celebration */}
      {burst && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LiveCanvas width={SW} height={SH} deps={[burst.at]} draw={(c, t, w, h) => drawBurst(c, (t - burst.at) / 1300, w, h, w / 2, heroCenter, burst.color)} />
          <Animated.View style={[styles.burstTextWrap, { top: heroCenter + HERO_H * 0.28, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
            <Text style={[styles.burstText, { textShadowColor: burst.color }]}>{burst.text}</Text>
          </Animated.View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#04060A', paddingTop: 30 },
  shardChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 6, borderWidth: 1, borderColor: UI.color.stoneEdge, backgroundColor: 'rgba(10,14,19,0.85)' },
  shardText: { fontFamily: UI.font.techBold, fontSize: 14, color: UI.color.text },
  lockBadge: {
    position: 'absolute',
    left: SW / 2 - 25,
    top: HERO_H * 0.47 - 25,
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4,6,10,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(200,210,225,0.35)',
  },
  rarityWrap: { position: 'absolute', top: 2, left: 0, right: 0, alignItems: 'center' },
  rarity: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  raritySweep: { position: 'absolute', top: -4, bottom: -4, width: 40 },
  rarityPips: { flexDirection: 'row', gap: 2 },
  rarityText: { fontFamily: UI.font.label, fontSize: 11, letterSpacing: 3 },
  wornTag: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: UI.color.cyan, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4 },
  wornText: { fontFamily: UI.font.techBold, fontSize: 11.5, letterSpacing: 2, color: '#03161B' },
  arrow: { position: 'absolute', top: HERO_H / 2 - 22 },
  arrowInner: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(200,210,225,0.25)' },
  identity: { alignItems: 'center', marginTop: 12, paddingHorizontal: 16 },
  name: {
    fontFamily: UI.font.title,
    fontSize: 27,
    color: '#F4F0E8',
    textAlign: 'center',
    letterSpacing: 1.5,
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
  epithet: { fontFamily: UI.font.tech, fontSize: 14.5, letterSpacing: 1.2, marginTop: 2 },
  pad: { paddingHorizontal: 16, marginTop: 14 },
  req: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  reqText: { fontFamily: UI.font.techBold, fontSize: 13, color: '#C8D0DA', letterSpacing: 0.6 },
  reqBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  reqFill: { height: '100%', borderRadius: 3 },
  reqCount: { fontFamily: UI.font.techBold, fontSize: 12, color: '#9AA6B4' },
  powerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  powerIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  powerKicker: { fontFamily: UI.font.techBold, fontSize: 10.5, letterSpacing: 2.5 },
  powerName: { fontFamily: UI.font.heading, fontSize: 16, color: '#F0F2F4', letterSpacing: 1.2, marginTop: 1 },
  powerDesc: { fontFamily: UI.font.tech, fontSize: 14.5, color: '#C8D0DA', marginTop: 1 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 26 },
  statKey: { fontFamily: UI.font.techBold, fontSize: 11.5, letterSpacing: 1.6, color: '#6E7A88', width: 64 },
  statTrack: { flex: 1, height: 7, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.6)' },
  statBase: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#5E6A78' },
  statBonus: { position: 'absolute', top: 0, bottom: 0, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  statNotch: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  statVal: { fontFamily: UI.font.techBold, fontSize: 11.5, letterSpacing: 0.8, width: 92, textAlign: 'right' },
  lore: { fontFamily: UI.font.body, fontSize: 14, color: '#8E9AAB', textAlign: 'center', marginTop: 14, lineHeight: 20, fontStyle: 'italic', paddingHorizontal: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  cardInner: { alignItems: 'center', paddingTop: 4, paddingBottom: 8 },
  cardStripe: { width: '60%', height: 2, borderRadius: 1, opacity: 0.9 },
  cardName: { fontFamily: UI.font.label, fontSize: 10, letterSpacing: 1, marginTop: 5 },
  cardFoot: { marginTop: 3, height: 12, justifyContent: 'center' },
  readyDot: { position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: 5, backgroundColor: UI.color.gold, borderWidth: 1.5, borderColor: '#1A1206' },
  burstTextWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  burstText: { fontFamily: UI.font.title, fontSize: 34, color: '#FFFFFF', letterSpacing: 6, textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
});
