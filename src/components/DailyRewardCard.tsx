import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PALETTE } from '../constants/palette';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { useProgressStore } from '../state/progressStore';
import { dailyStatus, DailyStatus } from '../state/economy';
import { fetchTrustedTime } from '../state/trustedTime';
import { audio } from '../audio';

const hhmm = (ms: number) => `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;

/**
 * Daily login reward. Uses TRUSTED network time only (never the phone clock): offline shows "connect to claim"
 * and the reward stays available until the clock can be checked.
 */
export const DailyRewardCard: React.FC = () => {
  const daily = useProgressStore((s) => s.daily);
  const claim = useProgressStore((s) => s.claimDailyReward);
  const [now, setNow] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState<{ reward: number; day: number } | null>(null);

  const check = useCallback(async () => {
    setBusy(true);
    const t = await fetchTrustedTime();
    setNow(t);
    setOffline(t === null);
    setBusy(false);
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const status: DailyStatus | null = now === null ? null : dailyStatus(daily, now);

  const onClaim = async () => {
    // re-check the time at the moment of the tap so a stale value can never pay twice
    setBusy(true);
    const t = await fetchTrustedTime();
    setBusy(false);
    if (t === null) {
      setOffline(true);
      return;
    }
    setNow(t);
    const r = claim(t);
    if (r) {
      audio.play('sfx_finish');
      setClaimed(r);
    }
  };

  const days = ECHO_CONFIG.rewards.dailyStreakDays;
  return (
    <View style={styles.card} testID="daily-card">
      <Text style={styles.title}>DAILY REWARD · STREAK {Math.max(0, daily.streak)}/{days}</Text>
      {claimed ? (
        <Text style={styles.msg} testID="daily-claimed">
          +{claimed.reward} ✦ (day {claimed.day})
        </Text>
      ) : offline ? (
        <TouchableOpacity onPress={check} testID="daily-retry">
          <Text style={styles.msg}>Connect to the internet to claim · tap to retry</Text>
        </TouchableOpacity>
      ) : !status ? (
        <Text style={styles.msg}>Checking the time…</Text>
      ) : status.canClaim ? (
        <TouchableOpacity style={styles.btn} disabled={busy} onPress={onClaim} testID="daily-claim">
          <Text style={styles.btnText}>
            CLAIM DAY {status.day} · +{status.reward} ✦{status.streakBroken ? ' (streak restarted)' : ''}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.msg} testID="daily-wait">
          Next reward in {hhmm(status.msUntilNext)}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { width: '100%', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,201,107,0.3)', backgroundColor: 'rgba(255,201,107,0.05)' },
  title: { color: PALETTE.shardGold, fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  msg: { color: '#CBD5E1', fontSize: 10, textAlign: 'center' },
  btn: { paddingVertical: 9, borderRadius: 5, alignItems: 'center', backgroundColor: PALETTE.shardGold },
  btnText: { color: '#04060A', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
});
