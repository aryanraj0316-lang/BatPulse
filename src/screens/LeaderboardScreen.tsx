import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { PALETTE } from '../constants/palette';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { useProgressStore } from '../state/progressStore';
import { leaderboards } from '../leaderboard';
import { BoardRow, displayNameFor, personalBoard } from '../leaderboard/rules';
import { TopStatus } from '../leaderboard/Leaderboards';
import { saveManager } from '../save';

interface Props {
  onBack: () => void;
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

export const LeaderboardScreen: React.FC<Props> = ({ onBack }) => {
  const records = useProgressStore((s) => s.records);
  const selected = useProgressStore((s) => s.selectedCharacter);
  const cleared = useMemo(
    () => Object.values(records).filter((r) => r.completed && r.levelId > 0).map((r) => r.levelId).sort((a, b) => a - b),
    [records],
  );
  const [index, setIndex] = useState(Math.max(0, cleared.length - 1));
  const [rookieOnly, setRookieOnly] = useState(true);
  const [top, setTop] = useState<{ status: TopStatus | 'loading'; rows: BoardRow[] }>({ status: 'loading', rows: [] });

  const levelId = cleared[Math.min(index, cleared.length - 1)];
  const character = rookieOnly ? 'bat_rookie' : selected;
  const you = displayNameFor(saveManager.data.ledger.deviceId);

  const load = useCallback(async () => {
    if (levelId === undefined) return;
    setTop({ status: 'loading', rows: [] });
    setTop(await leaderboards.top(levelId, character));
  }, [levelId, character]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = levelId === undefined ? [] : personalBoard(records[levelId], you);

  return (
    <View style={styles.container} testID="leaderboard-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} testID="lb-back">
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>LEADERBOARDS</Text>
        <View style={{ width: 60 }} />
      </View>

      {cleared.length === 0 ? (
        <Text style={styles.empty} testID="lb-empty">
          Clear a level to see its times here.
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.stepper}>
            <TouchableOpacity disabled={index <= 0} onPress={() => setIndex(index - 1)} style={styles.stepBtn} testID="lb-prev">
              <Text style={[styles.stepText, index <= 0 && styles.dim]}>◀</Text>
            </TouchableOpacity>
            <Text style={styles.level} testID="lb-level">
              ECHO {String(levelId).padStart(2, '0')}
            </Text>
            <TouchableOpacity disabled={index >= cleared.length - 1} onPress={() => setIndex(index + 1)} style={styles.stepBtn} testID="lb-next">
              <Text style={[styles.stepText, index >= cleared.length - 1 && styles.dim]}>▶</Text>
            </TouchableOpacity>
          </View>

          {selected !== 'bat_rookie' && (
            <View style={styles.toggleRow}>
              <TouchableOpacity style={[styles.toggle, rookieOnly && styles.toggleOn]} onPress={() => setRookieOnly(true)} testID="lb-rookie">
                <Text style={styles.toggleText}>ROOKIE ONLY</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.toggle, !rookieOnly && styles.toggleOn]} onPress={() => setRookieOnly(false)} testID="lb-mybat">
                <Text style={styles.toggleText}>{ECHO_CONFIG.characters[selected]?.name.toUpperCase() ?? 'MY BAT'}</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.note}>Each bat has its own board, so times are always compared fairly.</Text>

          <Text style={styles.section}>WORLD TOP {ECHO_CONFIG.online.leaderboard.topCount}</Text>
          {top.status === 'loading' && <Text style={styles.msg}>Loading…</Text>}
          {top.status === 'disabled' && (
            <Text style={styles.msg} testID="lb-disabled">
              Online leaderboards are not available in this build. Your own times are below.
            </Text>
          )}
          {top.status === 'offline' && (
            <TouchableOpacity onPress={load} testID="lb-retry">
              <Text style={styles.msg}>Could not load the leaderboard. Tap to retry.</Text>
            </TouchableOpacity>
          )}
          {top.status === 'ok' && top.rows.length === 0 && <Text style={styles.msg}>No times yet: be the first.</Text>}
          {top.rows.map((r) => (
            <Row key={`${r.rank}-${r.name}`} row={r} />
          ))}

          <Text style={styles.section}>YOUR BEST TIMES</Text>
          {mine.map((r) => (
            <Row key={r.name} row={r} />
          ))}
          {leaderboards.enabled && leaderboards.pending > 0 && (
            <Text style={styles.note} testID="lb-pending">
              {leaderboards.pending} time{leaderboards.pending > 1 ? 's' : ''} will be sent when you are online.
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const Row: React.FC<{ row: BoardRow }> = ({ row }) => (
  <View style={[styles.row, row.isYou && styles.rowYou]} testID="lb-row">
    <Text style={styles.rank}>{row.rank}</Text>
    <Text style={styles.name} numberOfLines={1}>
      {row.name}
    </Text>
    <Text style={styles.time}>{fmt(row.timeSec)}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.voidBlack },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { paddingVertical: 6, width: 60 },
  backText: { color: PALETTE.sonarCyan, fontWeight: '800', fontSize: 11, letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontWeight: '900', fontSize: 15, letterSpacing: 3 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  empty: { color: '#94A3B8', textAlign: 'center', marginTop: 60, paddingHorizontal: 32 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 10 },
  stepBtn: { padding: 10 },
  stepText: { color: PALETTE.sonarCyan, fontSize: 18 },
  dim: { opacity: 0.25 },
  level: { color: '#FFFFFF', fontWeight: '900', fontSize: 18, letterSpacing: 3, minWidth: 110, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 6 },
  toggle: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  toggleOn: { borderColor: PALETTE.sonarCyan, backgroundColor: 'rgba(77,240,255,0.12)' },
  toggleText: { color: '#E2E8F0', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  note: { color: '#64748B', fontSize: 10, textAlign: 'center', marginVertical: 8 },
  section: { color: PALETTE.shardGold, fontWeight: '900', fontSize: 11, letterSpacing: 2, marginTop: 16, marginBottom: 6 },
  msg: { color: '#94A3B8', fontSize: 11, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 10, borderRadius: 6, marginBottom: 4, backgroundColor: 'rgba(255,255,255,0.03)' },
  rowYou: { backgroundColor: 'rgba(77,240,255,0.10)' },
  rank: { width: 28, color: '#64748B', fontWeight: '800', fontSize: 12 },
  name: { flex: 1, color: '#E2E8F0', fontSize: 12 },
  time: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
});
