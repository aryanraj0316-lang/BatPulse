import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { PALETTE } from '../constants/palette';
import { useProgressStore } from '../state/progressStore';
import { useSettingsStore } from '../state/settingsStore';
import { DevPanel } from '../components/DevPanel';
import { DEBUG_ENABLED } from '../debug/debugFlags';
import { DEV_KEYS } from '../constants/gameConfig';
import { AudioEngine } from '../engine/AudioEngine';

interface HomeScreenProps {
  onPlay: (levelId: number) => void;
  onLevelSelect: () => void;
  onAbilities: () => void;
  onEndless: () => void;
  onSettings: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onPlay,
  onLevelSelect,
  onAbilities,
  onEndless,
  onSettings,
}) => {
  const { records, shards } = useProgressStore();
  const { soundEnabled, devModeUnlocked, unlockDevMode } = useSettingsStore();

  const [ambientRadius, setAmbientRadius] = useState(10);
  const [tapCount, setTapCount] = useState(0);
  const [devPanelOpen, setDevPanelOpen] = useState(false);

  useEffect(() => {
    // Ambient sonar ripple crossing screen every 6 seconds
    const interval = setInterval(() => {
      setAmbientRadius((prev) => {
        if (prev > SCREEN_WIDTH * 1.1) return 10;
        return prev + 2.5;
      });
    }, 28);

    return () => clearInterval(interval);
  }, []);

  // Determine latest unlocked level
  const unlockedLevels = Object.values(records).filter((r) => r.unlocked);
  const latestLevelId = unlockedLevels.length > 0 ? Math.max(...unlockedLevels.map((r) => r.levelId)) : 1;

  const totalStars = Object.values(records).reduce((sum, r) => sum + (r.stars || 0), 0);

  const handleVersionTap = () => {
    if (!DEBUG_ENABLED) return; // dev tools are stripped from release builds
    const next = tapCount + 1;
    setTapCount(next);
    if (next >= DEV_KEYS.TAP_COUNT_TO_UNLOCK_DEV) {
      unlockDevMode();
      setDevPanelOpen(true);
      setTapCount(0);
    }
  };

  return (
    <View style={styles.container}>
      {/* Ambient Sonar Echolocation Wave Background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT}>
          <Circle
            cx={SCREEN_WIDTH / 2}
            cy={SCREEN_HEIGHT * 0.36}
            r={ambientRadius}
            stroke={PALETTE.sonarCyan}
            strokeWidth={1.5}
            fill="none"
            opacity={Math.max(0, 0.85 - ambientRadius / (SCREEN_WIDTH * 1.1))}
          />
          <Circle
            cx={SCREEN_WIDTH / 2}
            cy={SCREEN_HEIGHT * 0.36}
            r={Math.max(1, ambientRadius * 0.82)}
            stroke={PALETTE.sonarCyan}
            strokeWidth={1}
            strokeDasharray="4, 4"
            fill="none"
            opacity={Math.max(0, 0.45 - ambientRadius / (SCREEN_WIDTH * 1.1))}
          />

          {/* Faint distant cave boundary revealed by ambient ripple */}
          <Rect
            x={40}
            y={SCREEN_HEIGHT * 0.2}
            width={SCREEN_WIDTH - 80}
            height={SCREEN_HEIGHT * 0.3}
            stroke={PALETTE.echoTeal}
            strokeWidth={1}
            strokeDasharray="6, 8"
            fill="none"
            opacity={Math.max(0, 0.25 * (1.0 - Math.abs(ambientRadius - 160) / 100))}
          />
        </Svg>
      </View>

      {/* Header instrumentation block */}
      <View style={styles.header}>
        <View style={styles.badgeRow}>
          <Text style={styles.terminalTag}>ACOUSTIC SENSORY INTERFACE · v2.0</Text>
          <Text style={styles.shardCountText}>✦ {shards} SHARDS</Text>
        </View>

        <Text style={styles.title}>BATS VIEW</Text>
        <Text style={styles.subtitle}>SEE THE WORLD THROUGH SOUND</Text>

        <View style={styles.statsBadge}>
          <Text style={styles.statsText}>★ {totalStars} STARS ACQUIRED</Text>
        </View>
      </View>

      {/* Menu Options */}
      <View style={styles.menuGroup}>
        <TouchableOpacity
          style={styles.primaryPlayButton}
          onPress={() => {
            AudioEngine.playSonarPulse(soundEnabled);
            onPlay(latestLevelId);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryPlayText}>
            DEPLOY ECHO {latestLevelId.toString().padStart(2, '0')} ▶
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuButton} onPress={onLevelSelect} activeOpacity={0.7}>
          <Text style={styles.menuButtonText}>≡ SELECT ECHO CHAMBER</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuButton} onPress={onAbilities} activeOpacity={0.7}>
          <Text style={styles.menuButtonText}>✦ ABILITY LOADOUT ({shards} SHARDS)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuButton} onPress={onEndless} activeOpacity={0.7}>
          <Text style={styles.menuButtonText}>▼ ENDLESS & DAILY DESCENT</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuButton} onPress={onSettings} activeOpacity={0.7}>
          <Text style={styles.menuButtonText}>⚙ SETTINGS & CALIBRATION</Text>
        </TouchableOpacity>
      </View>

      {/* Version Tag */}
      <TouchableOpacity style={styles.footer} onPress={handleVersionTap} activeOpacity={0.9}>
        <Text style={styles.versionText}>
          SEC-SYS PROTOCOL 2.0.4 {DEBUG_ENABLED && devModeUnlocked ? '· [DEV TUNING ACTIVE]' : ''}
        </Text>
      </TouchableOpacity>

      {/* Live Engine Tuning Panel */}
      {DEBUG_ENABLED && devPanelOpen && (
        <DevPanel visible={devPanelOpen} onClose={() => setDevPanelOpen(false)} onJumpToLevel={onPlay} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.voidBlack,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 45,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 320,
    marginBottom: 16,
  },
  terminalTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.5,
  },
  shardCountText: {
    fontSize: 10,
    fontWeight: '900',
    color: PALETTE.shardGold,
    letterSpacing: 1,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 4,
    textShadowColor: PALETTE.sonarCyan,
    textShadowRadius: 14,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: PALETTE.sonarCyan,
    letterSpacing: 2.2,
    marginTop: 6,
  },
  statsBadge: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 201, 107, 0.3)',
    backgroundColor: 'rgba(255, 201, 107, 0.05)',
  },
  statsText: {
    fontSize: 10,
    color: PALETTE.shardGold,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  menuGroup: {
    width: '100%',
    maxWidth: 320,
    gap: 10,
  },
  primaryPlayButton: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: PALETTE.sonarCyan,
    shadowColor: PALETTE.sonarCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  primaryPlayText: {
    color: '#04060A',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 2,
  },
  menuButton: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  menuButtonText: {
    color: '#E2E8F0',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  footer: {
    alignItems: 'center',
  },
  versionText: {
    fontSize: 9,
    color: '#475569',
    fontWeight: '600',
    letterSpacing: 1.5,
  },
});
