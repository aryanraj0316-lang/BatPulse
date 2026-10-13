import React, { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GameScreenState } from './src/types/game';
import { PALETTE } from './src/constants/palette';
import { useProgressStore } from './src/state/progressStore';
import { useSettingsStore } from './src/state/settingsStore';
import { HomeScreen } from './src/screens/HomeScreen';
import { GameScreen } from './src/screens/GameScreen';
import { LevelSelectScreen } from './src/screens/LevelSelectScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ShopScreen } from './src/screens/ShopScreen';
import { SplashScreen } from './src/screens/SplashScreen';
import { HeadphonePrompt } from './src/components/HeadphonePrompt';
import { saveManager } from './src/save';
import { registerPlaceholderAssets } from './src/assets/placeholders/visuals';
import { audio, initAudio } from './src/audio';
import { authoredLevelIds } from './src/levels/loader';

// All art/audio is resolved through AssetRegistry keys; placeholders are registered once here.
registerPlaceholderAssets();

/** Splash goes straight into Echo 01; a returning player resumes at their furthest unlocked level. */
function firstLevelToPlay(): number {
  const playable = authoredLevelIds().filter((id) => id > 0);
  const unlocked = Object.values(useProgressStore.getState().records).filter((r) => r.unlocked && playable.includes(r.levelId));
  return unlocked.length > 0 ? Math.max(...unlocked.map((r) => r.levelId)) : 1;
}

export default function App() {
  const [screen, setScreen] = useState<GameScreenState>('SPLASH');
  const [selectedLevelId, setSelectedLevelId] = useState(1);
  const [ready, setReady] = useState(false);

  const hasSeenHeadphonePrompt = useProgressStore((s) => s.hasSeenHeadphonePrompt);
  const setHeadphonePromptSeen = useProgressStore((s) => s.setHeadphonePromptSeen);

  // Load the save (primary -> backup -> default) and the sounds before any screen needs them.
  useEffect(() => {
    let cancelled = false;
    saveManager
      .load()
      .catch((e) => console.warn('save load failed, continuing with defaults', e))
      .then(() => {
        useProgressStore.getState().hydrate();
        useSettingsStore.getState().hydrate();
        return initAudio().catch((e) => console.warn('audio init failed, continuing silent', e));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Make sure queued writes reach disk when the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') saveManager.flush();
    });
    return () => sub.remove();
  }, []);

  const startGame = useCallback((levelId: number) => {
    setSelectedLevelId(levelId);
    setScreen('GAME');
  }, []);

  const afterSplash = useCallback(() => startGame(firstLevelToPlay()), [startGame]);
  const goHome = useCallback(() => setScreen('HOME'), []);

  if (!ready) {
    return <View style={styles.rootContainer} />;
  }

  return (
    <SafeAreaProvider>
      {/* The game screen handles its own safe-area insets so touch and drawing share one coordinate space. */}
      <SafeAreaView style={styles.rootContainer} edges={screen === 'GAME' ? [] : ['top', 'left', 'right']}>
        <StatusBar style="light" hidden={screen === 'GAME'} />

        {/* the splash clock starts only after the first-launch prompt is dismissed */}
        {screen === 'SPLASH' && hasSeenHeadphonePrompt && <SplashScreen onDone={afterSplash} />}

        {screen === 'HOME' && (
          <HomeScreen onPlay={startGame} onLevelSelect={() => setScreen('LEVEL_SELECT')} onSettings={() => setScreen('SETTINGS')} onShop={() => setScreen('SHOP')} />
        )}

        {screen === 'LEVEL_SELECT' && <LevelSelectScreen onSelectLevel={startGame} onBack={goHome} />}

        {screen === 'SETTINGS' && <SettingsScreen onBack={goHome} />}

        {screen === 'SHOP' && <ShopScreen onBack={goHome} />}

        {screen === 'GAME' && (
          <GameScreen
            levelId={selectedLevelId}
            onExitToMenu={() => {
              audio.stopAll();
              goHome();
            }}
            onNextLevel={(nextId) => setSelectedLevelId(nextId)}
          />
        )}

        {/* First launch headphone prompt (above everything, including the splash) */}
        {!hasSeenHeadphonePrompt && <HeadphonePrompt visible onProceed={setHeadphonePromptSeen} />}
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
