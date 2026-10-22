import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Analytics } from '../analytics/Analytics';
import { VisualKey } from '../assets/keys';
import { audio } from '../audio';
import { Controls } from '../components/Controls';
import { HUD, HUD_HEIGHT, HudSnapshot } from '../components/HUD';
import { HintBanner, StickVisual } from '../components/Overlays';
import { FailScreen } from '../components/FailScreen';
import { PauseMenu } from '../components/PauseMenu';
import { JumpGate } from '../game/jumpGate';
import { ResultCard, ResultData } from '../components/ResultCard';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { PALETTE } from '../constants/palette';
import { DebugOverlay } from '../debug/DebugOverlay';
import { DEBUG_ENABLED } from '../debug/debugFlags';
import { FrameBus } from '../game/frameBus';
import { useGameLoop } from '../game/useGameLoop';
import { effectiveQuality, lodFor, Quality, sessionGovernor } from '../render/quality';
import { playFeedback } from '../game/feedback';
import { leaderboards } from '../leaderboard';
import { ads } from '../ads';
import { HapticEngine } from '../haptics/HapticEngine';
import { TouchInput } from '../input/TouchInput';
import { hasAuthoredLevel, loadAuthoredLevel } from '../levels/loader';
import { LevelDef } from '../levels/schema';
import { GameCanvas } from '../render/GameCanvas';
import { GameSim, SimEvent } from '../sim/game';
import { scoreFor, starsForTime } from '../sim/scoring';
import { buildWorld, fitViewport, pulseRadiusWorld } from '../sim/world';
import { simParamsFor } from '../game/characters';
import { useProgressStore } from '../state/progressStore';
import { useSettingsStore } from '../state/settingsStore';

/** Space the HUD occupies at the top; the level is fitted into the area below it. */

interface GameScreenProps {
  levelId: number;
  onExitToMenu: () => void;
  onNextLevel: (nextLevelId: number) => void;
}

/** Loads the level file; a missing or malformed level (release builds) shows a message instead of crashing. */
export const GameScreen: React.FC<GameScreenProps> = ({ levelId, onExitToMenu, onNextLevel }) => {
  const def = useMemo(() => loadAuthoredLevel(levelId), [levelId]);
  if (!def) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>This level is unavailable.</Text>
        <TouchableOpacity style={styles.missingBtn} onPress={onExitToMenu}>
          <Text style={styles.missingBtnText}>HOME</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return <LevelRunner key={levelId} def={def} onExitToMenu={onExitToMenu} onNextLevel={onNextLevel} />;
};

const makeSnapshot = (sim: GameSim): HudSnapshot => ({
  elapsedSec: sim.elapsed,
  charges: sim.energy.charges,
  maxCharges: sim.energy.max,
  rechargeFill: Math.round(sim.energy.rechargeFill * 20) / 20,
  mode: sim.energy.mode,
  momentum: sim.momentum.value,
  hasKey: sim.hasKey,
  hiddenSec: sim.hidden ? Math.ceil(sim.hideLeft * ECHO_CONFIG.safeZone.maxHideSec) : 0,
});

const sameSnapshot = (a: HudSnapshot, b: HudSnapshot) =>
  Math.floor(a.elapsedSec) === Math.floor(b.elapsedSec) &&
  a.charges === b.charges &&
  a.maxCharges === b.maxCharges &&
  a.rechargeFill === b.rechargeFill &&
  a.momentum === b.momentum &&
  a.hasKey === b.hasKey &&
  a.hiddenSec === b.hiddenSec;

interface RunnerProps {
  def: LevelDef;
  onExitToMenu: () => void;
  onNextLevel: (nextLevelId: number) => void;
}

const LevelRunner: React.FC<RunnerProps> = ({ def, onExitToMenu, onNextLevel }) => {
  const { width: SW, height: SH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const batKey = useProgressStore((s) => s.selectedCharacter) as VisualKey;
  const brightness = useSettingsStore((s) => s.brightness);
  const floating = useSettingsStore((s) => s.floatingJoystick);
  const graphics = useSettingsStore((s) => s.graphics);
  // 'auto' watches frame times and drops detail (never gameplay) when the device struggles
  const governor = sessionGovernor;
  useEffect(() => governor.restartWindow(), [governor]);
  const [governed, setGoverned] = useState<Quality>(governor.current);
  const lod = lodFor(effectiveQuality(graphics, governed));
  const recordVictory = useProgressStore((s) => s.recordVictory);

  // fit the level into the area below the HUD
  // (levels taller than the screen are scaled to the width and the camera follows the bat)
  const view = useMemo(() => {
    const top = insets.top + HUD_HEIGHT;
    return fitViewport(SW, top, Math.max(100, SH - top - insets.bottom), def.width, def.height);
  }, [SW, SH, insets.top, insets.bottom, def.width, def.height]);
  // every ability of the chosen bat turns into numbers in one place (see game/characters.ts)
  const simParams = simParamsFor(batKey, pulseRadiusWorld(SW, view.scale, ECHO_CONFIG.sonar.maxRadiusScreenFraction));
  const pulseRadius = simParams.pulseRadius;

  const world = useMemo(() => buildWorld(def, ECHO_CONFIG.world.wallSegmentLen), [def]);
  const sim = useMemo(
    () =>
      new GameSim(world, simParams),
    // a new sim only when the level or the character changes; the radius is updated in place below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, batKey],
  );
  useEffect(() => sim.setPulseRadius(pulseRadius), [sim, pulseRadius]);

  const bus = useMemo(() => new FrameBus(), []);
  const input = useMemo(() => new TouchInput(() => sim.firePulse()), [sim]);

  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);
  const [snap, setSnap] = useState<HudSnapshot>(() => makeSnapshot(sim));
  const [hint, setHint] = useState<string | null>(sim.hints.current);
  const [fps, setFps] = useState(0);
  const [fail, setFail] = useState<{ jump: boolean } | null>(null);
  // optional rewarded ad on the result card (one per result; the whole feature is off by default)
  const [adBusy, setAdBusy] = useState(false);
  const [adGranted, setAdGranted] = useState<number | null>(null);
  const jumpGate = useMemo(() => new JumpGate(), [sim]);
  const [, bumpStick] = useReducer((n: number) => (n + 1) | 0, 0);

  useGameLoop({ sim, input, bus, paused, onFps: setFps, governor: graphics === 'auto' ? governor : undefined, onQuality: setGoverned });

  /* ───────────── gameplay events -> sound, haptics, analytics, result ───────────── */
  useEffect(() => {
    sim.onEvent = (e: SimEvent) => {
      const haptics = useSettingsStore.getState().hapticsEnabled;
      // sound + vibration come from one table (game/feedback.ts); this switch only does analytics and results
      playFeedback(e, sim.threat, def, {
        playSound: (key, gain, echoScale) => (echoScale !== undefined ? audio.playWithEcho(key, echoScale, gain) : audio.play(key, gain)),
        haptic: (kind) => HapticEngine.play(kind, haptics),
      });
      switch (e) {
        case 'restart':
          Analytics.track({ name: 'level_start', levelId: def.id });
          break;
        case 'death':
          Analytics.track({ name: 'level_fail', levelId: def.id, cause: sim.failCause ?? 'spike' });
          Analytics.track({ name: 'pulses_used', levelId: def.id, count: sim.pulsesUsed });
          // being caught by a hunter shows the fail screen (dark jump effect at most once in a while)
          if (sim.failCause === 'enemy') setFail({ jump: jumpGate.tryPlay(Date.now() / 1000) });
          break;
        case 'finish': {
          const timeSec = Math.round(sim.elapsed * 100) / 100;
          const stars = starsForTime(timeSec, def.starThresholds);
          const momentum = sim.momentum.value;
          const bestMomentum = sim.momentum.best;
          // the debug test chamber (id 0) never touches the player's save
          const ghostRun = sim.isGhostRun;
          const res =
            def.id === 0
              ? { firstClear: false, shardsEarned: 0, isNewBestTime: false, newBestStars: false, newCharacterBest: false, ghostBonus: 0, masteryBonus: 0 }
              : recordVictory(def.id, { timeSec, stars, momentum, bestMomentum, ghostRun });
          // a personal best with this bat goes to that bat's leaderboard (queued when offline, never blocks the result)
          if (def.id !== 0 && res.newCharacterBest) void leaderboards.submitBest({ levelId: def.id, character: useProgressStore.getState().selectedCharacter, timeSec });
          if (ghostRun) Analytics.track({ name: 'ghost_run', levelId: def.id });
          Analytics.track({ name: 'level_complete', levelId: def.id, timeSec, stars, pulses: sim.pulsesUsed, momentum: bestMomentum });
          Analytics.track({ name: 'pulses_used', levelId: def.id, count: sim.pulsesUsed });
          const nextStarAt = stars === 3 ? null : stars === 2 ? def.starThresholds.three : def.starThresholds.two;
          setResult({
            stars,
            timeSec,
            bestMomentum,
            score: scoreFor(timeSec, def.parTime, momentum),
            shardsEarned: res.shardsEarned,
            isNewBestTime: res.isNewBestTime,
            ghostRun,
            ghostBonus: res.ghostBonus,
            masteryBonus: res.masteryBonus,
            nextStarAt,
          });
          break;
        }
      }
    };
    return () => {
      sim.onEvent = null;
    };
  }, [sim, def, recordVictory, jumpGate]);

  /* ───────────── HUD snapshot ~10x per second ───────────── */
  useEffect(() => {
    const id = setInterval(() => {
      const next = makeSnapshot(sim);
      setSnap((prev) => (sameSnapshot(prev, next) ? prev : next));
      setHint((prev) => (prev === sim.hints.current ? prev : sim.hints.current));
    }, 100);
    return () => clearInterval(id);
  }, [sim]);

  /* ───────────── lifecycle: analytics, music, backgrounding ───────────── */
  useEffect(() => {
    Analytics.track({ name: 'level_start', levelId: def.id }); // first attempt; later attempts come from the 'restart' event
  }, [def.id]);

  useEffect(() => {
    audio.startMusic();
    return () => audio.stopMusic();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        audio.resumeAll();
        return;
      }
      // home button, phone call, app switcher: pause the run, silence audio, drop held touches
      audio.pauseAll();
      input.cancelAll();
      if (sim.status !== 'won') setPaused(true);
    });
    return () => sub.remove();
  }, [sim, input]);

  // Dev builds on web expose the live simulation so automated end-to-end tests can observe and verify it.
  useEffect(() => {
    if (!DEBUG_ENABLED || Platform.OS !== 'web') return;
    (window as unknown as { __echo?: unknown }).__echo = { sim, input, def };
    return () => {
      delete (window as unknown as { __echo?: unknown }).__echo;
    };
  }, [sim, input, def]);

  /* ───────────── keyboard (web / desktop) ───────────── */
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const down = new Set<string>();
    const apply = () => {
      const x = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
      const y = (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0) - (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0);
      input.setKeys(x, y);
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (!e.repeat) sim.firePulse();
        e.preventDefault();
        return;
      }
      down.add(e.code);
      apply();
    };
    const onUp = (e: KeyboardEvent) => {
      down.delete(e.code);
      apply();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      input.setKeys(0, 0);
    };
  }, [sim, input]);

  /* ───────────── actions (valid in every state) ───────────── */
  const restart = useCallback(() => {
    input.cancelAll();
    sim.restart();
    setResult(null);
    setAdGranted(null);
    setFail(null);
    setPaused(false);
    bumpStick();
    setSnap(makeSnapshot(sim));
    setHint(sim.hints.current);
  }, [sim, input]);

  const watchAd = useCallback(async () => {
    setAdBusy(true);
    const before = useProgressStore.getState().shards;
    const outcome = await ads.watch(adGranted !== null);
    setAdBusy(false);
    if (outcome === 'rewarded') setAdGranted(useProgressStore.getState().shards - before);
  }, [adGranted]);

  /** "Retry Cleaner": back to the last checkpoint (or the start when none was reached). */
  const retryFromCheckpoint = useCallback(() => {
    input.cancelAll();
    sim.respawn();
    setFail(null);
    setPaused(false);
    bumpStick();
    setSnap(makeSnapshot(sim));
  }, [sim, input]);

  const togglePause = useCallback(() => {
    if (sim.status === 'won') return;
    input.cancelAll();
    bumpStick();
    setPaused((p) => !p);
  }, [sim, input]);

  const nextId = def.id + 1;
  const restX = SW - 80 - insets.right;
  const restY = SH - 110 - insets.bottom;

  return (
    <View style={styles.container} testID="game-screen">
      <GameCanvas
        sim={sim}
        bus={bus}
        screenW={SW}
        screenH={SH}
        viewport={view}
        batKey={batKey}
        brightness={brightness}
        lod={lod}
      />

      <StickVisual input={input} restX={restX} restY={restY} />

      <HintBanner text={hint} topInset={insets.top} />
      <HUD levelTitle={def.name} levelNumber={def.id} snap={snap} onPause={togglePause} onRestart={restart} topInset={insets.top} />

      <Controls
        input={input}
        onStickChange={bumpStick}
        disabled={paused || result !== null}
        insets={insets}
        floating={floating}
        onTouchBegin={() => audio.nudge()}
        restX={restX}
        restY={restY}
      />

      <DebugOverlay sim={sim} bus={bus} screenW={SW} screenH={SH} viewport={view} fps={fps} />

      {fail && sim.status === 'dying' && sim.failCause === 'enemy' && <FailScreen jump={fail.jump} onRetry={retryFromCheckpoint} onHome={onExitToMenu} />}

      <PauseMenu visible={paused && result === null} onResume={() => setPaused(false)} onRestart={restart} onHome={onExitToMenu} />

      {result && (
        <ResultCard
          visible
          levelNumber={def.id}
          levelTitle={def.name}
          result={result}
          hasNext={hasAuthoredLevel(nextId)}
          onNext={() => onNextLevel(nextId)}
          onRetry={restart}
          onHome={onExitToMenu}
          adOffer={(() => {
            const o = ads.offer(adGranted !== null);
            return o.available ? { reward: o.reward } : null;
          })()}
          adBusy={adBusy}
          adGranted={adGranted}
          onWatchAd={watchAd}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.voidBlack, overflow: 'hidden' },
  missing: { flex: 1, backgroundColor: PALETTE.voidBlack, justifyContent: 'center', alignItems: 'center', gap: 16 },
  missingText: { color: '#E2E8F0', fontSize: 14, letterSpacing: 1 },
  missingBtn: { borderWidth: 1, borderColor: PALETTE.sonarCyan, borderRadius: 8, paddingHorizontal: 28, paddingVertical: 12 },
  missingBtnText: { color: PALETTE.sonarCyan, fontWeight: '800', letterSpacing: 2 },
});
