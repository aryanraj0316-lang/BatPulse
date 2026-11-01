import React, { useState } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GameScreenState } from './src/types/game';
import { PALETTE } from './src/constants/palette';
import { useProgressStore } from './src/state/progressStore';
import { HomeScreen } from './src/screens/HomeScreen';
import { GameScreen } from './src/screens/GameScreen';
import { LevelSelectScreen } from './src/screens/LevelSelectScreen';
import { AbilitiesScreen } from './src/screens/AbilitiesScreen';
import { EndlessScreen } from './src/screens/EndlessScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { useAppFonts } from './src/ui/theme';
import { type RunInfo, newEndlessRun, newDailyRun } from './src/levels/runs';
import { AssetGalleryScreen } from './src/screens/AssetGalleryScreen';
import { SkinsScreen } from './src/screens/SkinsScreen';

// Android system-button control. Loaded defensively: builds made before this native
// module was added don't have it, and an OTA update must not crash them.
let NavigationBar: React.ComponentType<{ style?: 'light' | 'dark'; hidden?: boolean }> | null = null;
try {
  NavigationBar = require('expo-navigation-bar').NavigationBar;
} catch {
  NavigationBar = null;
}

// Web-only dev shortcuts: `?gallery` shows every asset, `?level=8` jumps straight into a level.
const WEB_QUERY = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.search : '';
const SHOW_GALLERY = /[?&]gallery(&|$)/.test(WEB_QUERY);
const DIRECT_LEVEL = Number((WEB_QUERY.match(/[?&]level=(\d+)/) || [])[1]) || 0;
// `?screen=SKINS` / `?screen=LEVEL_SELECT` opens a menu screen directly (web previews)
const DIRECT_SCREEN = ((WEB_QUERY.match(/[?&]screen=([A-Z_]+)/) || [])[1] || '') as GameScreenState | '';

export default function App() {
  const [screen, setScreen] = useState<GameScreenState>(DIRECT_LEVEL || /[?&]run=/.test(WEB_QUERY) ? 'GAME' : DIRECT_SCREEN || 'HOME');
  const [selectedLevelId, setSelectedLevelId] = useState(DIRECT_LEVEL || 1);

  useAppFonts();

  const handleStartGame = (levelId: number) => {
    setRun(null);
    setSelectedLevelId(levelId);
    setScreen('GAME');
  };

  // Endless / Daily Descent: a chain of floors, one life
  const [run, setRun] = useState<RunInfo | null>(() =>
    /[?&]run=endless/.test(WEB_QUERY) ? newEndlessRun() : /[?&]run=daily/.test(WEB_QUERY) ? newDailyRun() : null
  );
  const [runNonce, setRunNonce] = useState(0);
  const startRun = (r: RunInfo) => {
    setRun(r);
    setRunNonce((n) => n + 1);
    setScreen('GAME');
  };

  if (SHOW_GALLERY) return <AssetGalleryScreen />;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.rootContainer} edges={['top', 'left', 'right']}>
        <StatusBar style="light" hidden={screen === 'GAME'} />
        {/* Android system buttons slide away during gameplay (swipe up to peek) */}
        {NavigationBar && <NavigationBar style="light" hidden={screen === 'GAME'} />}

        {screen === 'HOME' && (
          <HomeScreen
            onPlay={handleStartGame}
            onLevelSelect={() => setScreen('LEVEL_SELECT')}
            onAbilities={() => setScreen('ABILITIES')}
            onEndless={() => setScreen('ENDLESS')}
            onSettings={() => setScreen('SETTINGS')}
            onSkins={() => setScreen('SKINS')}
          />
        )}

        {screen === 'LEVEL_SELECT' && (
          <LevelSelectScreen
            onSelectLevel={handleStartGame}
            onBack={() => setScreen('HOME')}
          />
        )}

        {screen === 'ABILITIES' && (
          <AbilitiesScreen onBack={() => setScreen('HOME')} />
        )}

        {screen === 'ENDLESS' && (
          <EndlessScreen
            onStartEndless={() => startRun(newEndlessRun())}
            onStartDaily={() => startRun(newDailyRun())}
            onBack={() => setScreen('HOME')}
          />
        )}

        {screen === 'SKINS' && <SkinsScreen onBack={() => setScreen('HOME')} />}

        {screen === 'SETTINGS' && (
          <SettingsScreen onBack={() => setScreen('HOME')} />
        )}

        {screen === 'GAME' && (
          <GameScreen
            key={run ? `run${runNonce}` : 'campaign'}
            levelId={selectedLevelId}
            run={run ?? undefined}
            onExitToMenu={() => {
              setScreen(run ? 'ENDLESS' : 'HOME');
              setRun(null);
            }}
            onNextLevel={(nextId) => setSelectedLevelId(nextId)}
            onRunAdvance={setRun}
            onRunRestart={() => run && startRun(run.mode === 'daily' ? newDailyRun() : newEndlessRun())}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: PALETTE.voidBlack,
  },
});
