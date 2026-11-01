import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { ArrowDown, CalendarDays, Heart, TrendingUp, Gem, Trophy } from 'lucide-react-native';
import { useProgressStore } from '../state/progressStore';
import { MenuBackground } from '../ui/Chrome';
import { CarvedHeader, SteelFrame, SectionLabel } from '../ui/Frame';
import { StoneButton } from '../ui/StoneButton';
import { UI } from '../ui/theme';
import { LiveCanvas } from '../render/LiveCanvas';
import { drawAbyss, drawMoonDial } from '../render/menuArt';
import { todayNumber, msUntilNextDaily } from '../levels/runs';

interface EndlessScreenProps {
  onStartEndless: () => void;
  onStartDaily: () => void;
  onBack: () => void;
}

const { width: SW } = Dimensions.get('window');
const WELL_W = Math.min(SW - 32, 420) - 14;
const WELL_H = 190;

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

const Rule: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <View style={styles.rule}>
    {icon}
    <Text style={styles.ruleText}>{text}</Text>
  </View>
);

export const EndlessScreen: React.FC<EndlessScreenProps> = ({ onStartEndless, onStartDaily, onBack }) => {
  const { endlessHighScore, dailyBestDepth, dailyDay, endlessRuns } = useProgressStore();
  const today = todayNumber();
  const todayBest = dailyDay === today ? dailyBestDepth : 0;
  const [left, setLeft] = useState(msUntilNextDaily());
  useEffect(() => {
    const id = setInterval(() => setLeft(msUntilNextDaily()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.container}>
      <MenuBackground dim />
      <CarvedHeader title="THE DESCENT" subtitle="HOW DEEP CAN YOU GO?" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Endless */}
        <SteelFrame cut={10} padding={0} accent={UI.color.cyan} style={{ marginBottom: 16 }}>
          <View style={styles.wellWrap}>
            <LiveCanvas width={WELL_W} height={WELL_H} fps={45} draw={(c, t, w, h) => drawAbyss(c, t, w, h)} />
            <View style={styles.wellBadge}>
              <Trophy size={13} color="#1A1206" />
              <Text style={styles.wellBadgeText}>BEST · FLOOR {endlessHighScore}</Text>
            </View>
          </View>
          <View style={styles.body}>
            <Text style={styles.cardTitle}>ENDLESS DESCENT</Text>
            <Text style={styles.cardText}>Floor after floor, each one darker and harder than the last. A new maze every run.</Text>
            <View style={styles.rules}>
              <Rule icon={<Heart size={14} color="#FF6A7A" />} text="One life" />
              <Rule icon={<TrendingUp size={14} color={UI.color.cyan} />} text="Harder each floor" />
              <Rule icon={<Gem size={14} color="#7FD8FF" />} text="Shards every floor" />
            </View>
            <StoneButton label="BEGIN DESCENT" variant="primary" icon={ArrowDown} onPress={onStartEndless} style={{ marginTop: 14 }} />
            {endlessRuns > 0 && <Text style={styles.small}>{endlessRuns} {endlessRuns === 1 ? 'descent' : 'descents'} so far</Text>}
          </View>
        </SteelFrame>

        {/* Daily */}
        <SectionLabel color={UI.color.gold}>TODAY'S MAZE</SectionLabel>
        <SteelFrame cut={18} padding={14} accent={UI.color.gold}>
          <View style={styles.dailyRow}>
            <LiveCanvas width={96} height={96} fps={30} draw={(c, t) => drawMoonDial(c, t, 96)} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>DAILY DESCENT</Text>
              <Text style={styles.cardText}>One new maze every day, the same for every player. Try it as often as you like.</Text>
              <View style={styles.dailyStats}>
                <View style={styles.pill}>
                  <Text style={styles.pillLabel}>TODAY</Text>
                  <Text style={styles.pillVal}>FLOOR {todayBest}</Text>
                </View>
                <View style={styles.pill}>
                  <CalendarDays size={12} color="#9AA6B4" />
                  <Text style={styles.pillLabel}>NEW IN</Text>
                  <Text style={styles.pillVal}>{fmt(left)}</Text>
                </View>
              </View>
            </View>
          </View>
          <StoneButton label="ENTER TODAY'S MAZE" variant="gold" icon={ArrowDown} onPress={onStartDaily} style={{ marginTop: 14 }} />
        </SteelFrame>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.color.ink, paddingTop: 30 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  wellWrap: { margin: 7, marginBottom: 0, overflow: 'hidden', borderRadius: 3 },
  wellBadge: { position: 'absolute', top: 12, right: 14, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: UI.color.gold, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 4 },
  wellBadgeText: { fontFamily: UI.font.techBold, fontSize: 11.5, letterSpacing: 1.5, color: '#1A1206' },
  body: { padding: 16, paddingTop: 12 },
  cardTitle: { fontFamily: UI.font.heading, fontSize: 17, letterSpacing: 1.6, color: '#EEF2F6' },
  cardText: { fontFamily: UI.font.body, fontSize: 14, color: '#93A0B0', marginTop: 4, lineHeight: 19 },
  rules: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(160,175,195,0.22)', backgroundColor: 'rgba(0,0,0,0.3)' },
  ruleText: { fontFamily: UI.font.techBold, fontSize: 12, color: '#C8D0DA', letterSpacing: 0.5 },
  small: { fontFamily: UI.font.tech, fontSize: 12, color: '#6E7A88', textAlign: 'center', marginTop: 8 },
  dailyRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dailyStats: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,194,74,0.3)' },
  pillLabel: { fontFamily: UI.font.tech, fontSize: 10.5, letterSpacing: 1.5, color: '#9AA6B4' },
  pillVal: { fontFamily: UI.font.techBold, fontSize: 12, color: '#FFE3A0', letterSpacing: 0.8 },
});
