import React from 'react';
import { View, Text, StyleSheet, Pressable, Image, ViewStyle, Dimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Text as SvgText, G, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Zap, Star, Gem } from 'lucide-react-native';
import { UI } from './theme';

const BG = require('../../assets/images/home-bg.jpg');
const { width: SW, height: SH } = Dimensions.get('window');

// ─── Bat crest (spread wings) ────────────────────────────────
const CREST_D =
  'M60,22 L57,13 L55.5,20 C52,20.5 50,23 49.5,25.5 C45,19 36,14.5 20,15 C27,19 29,24 28.5,29 C33,27 37.5,28 40,31.5 C44,30 48.5,31.5 51,35.5 C55,36.5 57.5,41 60,47 C62.5,41 65,36.5 69,35.5 C71.5,31.5 76,30 80,31.5 C82.5,28 87,27 91.5,29 C91,24 93,19 100,15 C84,14.5 75,19 70.5,25.5 C70,23 68,20.5 64.5,20 L63,13 Z';

/** Engraved metallic "BATS VIEW" title with a bat crest and the tagline. */
export const TitleCrest: React.FC<{ width?: number }> = ({ width = Math.min(SW - 40, 340) }) => {
  const h = width * 0.62;
  const s = width / 340;
  return (
    <View style={{ width, alignItems: 'center' }}>
      <Svg width={width} height={h} viewBox="0 0 340 211">
        <Defs>
          <SvgGradient id="metal" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#F7FAFC" />
            <Stop offset="0.42" stopColor="#B9C4D0" />
            <Stop offset="0.55" stopColor="#6F7C8B" />
            <Stop offset="0.75" stopColor="#C9D2DC" />
            <Stop offset="1" stopColor="#7D8996" />
          </SvgGradient>
          <SvgGradient id="crest" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#CFF8FF" />
            <Stop offset="1" stopColor="#4FA8C4" />
          </SvgGradient>
        </Defs>
        {/* crest */}
        <G transform="translate(110,-6) scale(1)">
          <Path d={CREST_D} fill={UI.color.cyan} opacity={0.25} transform="translate(0,1.5)" />
          <Path d={CREST_D} fill="url(#crest)" stroke="#0B2A35" strokeWidth={1} />
        </G>
        {/* title: cyan underglow, dark engraving, metal face */}
        {[
          { t: 'BATS', y: 104, size: 78 },
          { t: 'VIEW', y: 172, size: 66 },
        ].map((l) => (
          <G key={l.t}>
            <SvgText x={170} y={l.y + 2} fontSize={l.size} fontFamily={UI.font.title} textAnchor="middle" fill={UI.color.cyan} opacity={0.35} letterSpacing={2}>
              {l.t}
            </SvgText>
            <SvgText x={170} y={l.y} fontSize={l.size} fontFamily={UI.font.title} textAnchor="middle" fill="#0E141B" stroke="#0E141B" strokeWidth={5} letterSpacing={2}>
              {l.t}
            </SvgText>
            <SvgText x={170} y={l.y} fontSize={l.size} fontFamily={UI.font.title} textAnchor="middle" fill="url(#metal)" stroke="#2A3542" strokeWidth={1} letterSpacing={2}>
              {l.t}
            </SvgText>
          </G>
        ))}
        {/* small sonar diamond under the title */}
        <Path d="M170,180 l5,6 l-5,6 l-5,-6 Z" fill={UI.color.cyan} />
      </Svg>
      <View style={styles.taglineRow}>
        <View style={styles.taglineLine} />
        <Text style={[styles.tagline, { fontSize: 13 * s }]}>SEE THE WORLD THROUGH SOUND</Text>
        <View style={styles.taglineLine} />
      </View>
    </View>
  );
};

/** Top-right capsule: ability slots, stars, shards. */
export const StatChip: React.FC<{ slots: string; stars: number; shards: number }> = ({ slots, stars, shards }) => (
  <View style={styles.chip}>
    <View style={styles.chipItem}>
      <Zap size={15} color={UI.color.cyan} fill={UI.color.cyan} />
      <Text style={styles.chipText}>{slots}</Text>
    </View>
    <View style={styles.chipItem}>
      <Star size={15} color={UI.color.gold} fill={UI.color.gold} />
      <Text style={styles.chipText}>{stars}</Text>
    </View>
    <View style={styles.chipItem}>
      <Gem size={15} color="#7FD8FF" />
      <Text style={styles.chipText}>{shards}</Text>
    </View>
  </View>
);

/** Round carved-stone icon button (settings gear, back arrow). */
export const RoundStoneButton: React.FC<{ onPress: () => void; children: React.ReactNode; size?: number }> = ({ onPress, children, size = 44 }) => (
  <Pressable onPress={onPress} hitSlop={8}>
    {({ pressed }) => (
      <View style={{ width: size, height: size, transform: [{ scale: pressed ? 0.94 : 1 }] }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgGradient id="rs" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={UI.color.stoneTop} />
              <Stop offset="1" stopColor={UI.color.stoneBottom} />
            </SvgGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2 + 2} r={size / 2 - 2} fill="#000" opacity={0.5} />
          <Circle cx={size / 2} cy={size / 2} r={size / 2 - 2} fill="url(#rs)" stroke={UI.color.stoneEdgeDark} strokeWidth={2} />
          <Circle cx={size / 2} cy={size / 2} r={size / 2 - 4} fill="none" stroke={UI.color.stoneEdge} strokeWidth={1} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
      </View>
    )}
  </Pressable>
);

/** The cave artwork as a backdrop. `dim` darkens + blurs it for content-heavy screens. */
export const MenuBackground: React.FC<{ dim?: boolean }> = ({ dim }) => {
  const size = Math.max(SW * 1.25, SH * 0.64);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: UI.color.ink }]} />
      {dim ? (
        <Image source={BG} blurRadius={8} style={{ position: 'absolute', width: SH, height: SH, left: (SW - SH) / 2, top: 0, opacity: 0.45 }} />
      ) : (
        <Image source={BG} style={{ position: 'absolute', width: size, height: size, left: (SW - size) / 2, top: SH * 0.04 }} />
      )}
      <LinearGradient colors={['rgba(4,7,10,0.85)', 'rgba(4,7,10,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: SH * 0.22 }} />
      <LinearGradient
        colors={dim ? ['rgba(4,7,10,0.55)', 'rgba(4,7,10,0.92)'] : ['rgba(4,7,10,0)', 'rgba(4,7,10,0.88)', UI.color.ink]}
        locations={dim ? [0, 1] : [0, 0.45, 1]}
        style={{ position: 'absolute', left: 0, right: 0, top: dim ? 0 : SH * 0.42, bottom: 0 }}
      />
      {/* edge vignette */}
      <LinearGradient colors={['rgba(4,7,10,0.7)', 'rgba(4,7,10,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: SW * 0.14 }} />
      <LinearGradient colors={['rgba(4,7,10,0)', 'rgba(4,7,10,0.7)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: SW * 0.14 }} />
    </View>
  );
};

/** Sub-screen header: stone back button, engraved title, small tech subtitle, optional right slot. */
export const ScreenHeader: React.FC<{ title: string; subtitle?: string; onBack: () => void; right?: React.ReactNode }> = ({ title, subtitle, onBack, right }) => (
  <View style={styles.header}>
    <RoundStoneButton onPress={onBack} size={42}>
      <ChevronLeft size={22} color={UI.color.cyan} />
    </RoundStoneButton>
    <View style={styles.headerCenter}>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
    </View>
    <View style={{ minWidth: 42, alignItems: 'flex-end' }}>{right}</View>
  </View>
);

/** Beveled dark slate card. `accent` tints the edge (cyan = active, gold = reward). */
export const StonePanel: React.FC<{ children: React.ReactNode; accent?: string; style?: ViewStyle; muted?: boolean }> = ({ children, accent, style, muted }) => (
  <View style={[styles.panelShadow, style]}>
    <LinearGradient colors={muted ? ['#14181E', '#0B0E12'] : ['#1E252E', '#0E1217']} style={[styles.panel, { borderColor: accent ?? UI.color.stoneEdge, opacity: muted ? 0.6 : 1 }]}>
      <View style={styles.panelInnerEdge} pointerEvents="none" />
      {children}
    </LinearGradient>
  </View>
);

/** Thin divider with a centred diamond, for section titles. */
export const SectionTitle: React.FC<{ children: string; color?: string }> = ({ children, color = UI.color.cyan }) => (
  <View style={styles.sectionRow}>
    <View style={[styles.sectionLine, { backgroundColor: color }]} />
    <Text style={[styles.sectionText, { color }]}>{children}</Text>
    <View style={[styles.sectionLine, { backgroundColor: color }]} />
  </View>
);

const styles = StyleSheet.create({
  taglineRow: { flexDirection: 'row', alignItems: 'center', marginTop: -4 },
  taglineLine: { width: 22, height: 1, backgroundColor: UI.color.cyan, opacity: 0.6, marginHorizontal: 8 },
  tagline: {
    fontFamily: UI.font.techBold,
    color: UI.color.cyan,
    letterSpacing: 3,
    textShadowColor: UI.color.cyan,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI.color.stoneEdge,
    backgroundColor: 'rgba(10, 14, 19, 0.82)',
    gap: 14,
  },
  chipItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipText: { fontFamily: UI.font.techBold, fontSize: 15, color: UI.color.text, letterSpacing: 0.5 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: {
    fontFamily: UI.font.heading,
    fontSize: 21,
    letterSpacing: 3,
    color: '#DCE5EE',
    textShadowColor: 'rgba(77,240,255,0.45)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  headerSub: { fontFamily: UI.font.tech, fontSize: 11.5, letterSpacing: 2.5, color: UI.color.cyan, marginTop: 2, opacity: 0.85 },
  panelShadow: {
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  panel: { borderRadius: 10, borderWidth: 1, padding: 16, overflow: 'hidden' },
  panelInnerEdge: {
    ...StyleSheet.absoluteFill,
    margin: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.55)',
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 4 },
  sectionLine: { flex: 1, height: 1, opacity: 0.35 },
  sectionText: { fontFamily: UI.font.label, fontSize: 12, letterSpacing: 3, marginHorizontal: 10 },
});
