import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { HeadphonePrompt } from './src/components/HeadphonePrompt';

export default function App() {
  const [screen, setScreen] = useState<GameScreenState>('HOME');
  const [selectedLevelId, setSelectedLevelId] = useState(1);

  const { hasSeenHeadphonePrompt, setHeadphonePromptSeen } = useProgressStore();

  const handleStartGame = (levelId: number) => {
    setSelectedLevelId(levelId);
    setScreen('GAME');
  };

  const handleStartEndless = () => {
    // Endless mode starts at level 9 (procedural scaling floors)
    setSelectedLevelId(9);
    setScreen('GAME');
  };

  const handleStartDaily = () => {
    const todaySeed = Math.floor(Date.now() / 86400000);
    setSelectedLevelId(10);
    setScreen('GAME');
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.rootContainer} edges={['top', 'left', 'right']}>
        <StatusBar style="light" hidden={screen === 'GAME'} />

        {screen === 'HOME' && (
          <HomeScreen
            onPlay={handleStartGame}
            onLevelSelect={() => setScreen('LEVEL_SELECT')}
            onAbilities={() => setScreen('ABILITIES')}
            onEndless={() => setScreen('ENDLESS')}
            onSettings={() => setScreen('SETTINGS')}
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
            onStartEndless={handleStartEndless}
            onStartDaily={handleStartDaily}
            onBack={() => setScreen('HOME')}
          />
        )}

        {screen === 'SETTINGS' && (
          <SettingsScreen onBack={() => setScreen('HOME')} />
        )}

        {screen === 'GAME' && (
          <GameScreen
            levelId={selectedLevelId}
            onExitToMenu={() => setScreen('HOME')}
            onNextLevel={(nextId) => setSelectedLevelId(nextId)}
          />
        )}

        {/* First Launch Headphone Prompt */}
        {!hasSeenHeadphonePrompt && (
          <HeadphonePrompt
            visible={!hasSeenHeadphonePrompt}
            onProceed={setHeadphonePromptSeen}
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
