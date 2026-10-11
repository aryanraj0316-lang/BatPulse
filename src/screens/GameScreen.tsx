import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  PanResponder,
  Pressable,
  Text,
  Platform,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  LevelData,
  PlayerEntity,
  Rect as WallRect,
  EnvObject,
  Vec2,
  SonarWaveEntity,
  ImpactSpark,
  AmbientDust,
  WraithEntity,
  GhostPoint,
} from '../types/game';
import { GAME_CONFIG } from '../constants/gameConfig';
import { PALETTE } from '../constants/palette';
import { LevelFactory } from '../levels/generated';
import { SpatialHashGrid } from '../maze/mesher';
import { CollisionSystem } from '../engine/CollisionSystem';
import { SonarSystem } from '../engine/SonarSystem';
import { MovementSystem } from '../engine/MovementSystem';
import { HunterAI } from '../engine/HunterAI';
import { AudioEngine } from '../engine/AudioEngine';
import { HapticEngine } from '../engine/HapticEngine';
import { ScoringSystem, ScoreBreakdown } from '../engine/ScoringSystem';
import { useProgressStore } from '../state/progressStore';
import { useSettingsStore } from '../state/settingsStore';
import { GameCanvas } from '../render/GameCanvas';
import { HUD } from '../components/HUD';
import { ResultCard } from '../components/ResultCard';

interface GameScreenProps {
  levelId: number;
  onExitToMenu: () => void;
  onNextLevel: (nextLevelId: number) => void;
}

const { width: SW, height: SH } = Dimensions.get('window');
const JOY_RADIUS = 50;

export const GameScreen: React.FC<GameScreenProps> = ({
  levelId,
  onExitToMenu,
  onNextLevel,
}) => {
  const { records, recordLevelVictory, equippedAbilities } = useProgressStore();
  const { soundEnabled, hapticsEnabled } = useSettingsStore();

  const level = useMemo(
    () => LevelFactory.createLevel(levelId, undefined, SW, SH),
    [levelId]
  );
  const existingRecord = records[levelId];

  const hasWidePulse = equippedAbilities.includes('WIDE_PULSE');
  const hasPiercing = equippedAbilities.includes('PIERCING_PING');
  const hasWhisperStep = equippedAbilities.includes('WHISPER_STEP');
  const sonarRadius = hasWidePulse ? GAME_CONFIG.SONAR_RADIUS * 1.4 : GAME_CONFIG.SONAR_RADIUS;

  // Single tick to drive high-fps React re-renders
  const [, setTick] = useState(0);

  // Overlay / UI states
  const [isPaused, setIsPaused] = useState(false);
  const [isWon, setIsWon] = useState(false);
  const [scoreResult, setScoreResult] = useState<ScoreBreakdown | null>(null);
  const [shardsEarned, setShardsEarned] = useState(0);
  const [isRedStatic, setIsRedStatic] = useState(false);

  // Joystick visual state (starts down in the bottom-right corner)
  const [joyCenter, setJoyCenter] = useState<Vec2>({ x: SW - 75, y: SH - 85 });
  const [joyKnob, setJoyKnob] = useState<Vec2>({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);

  // Mutable game state
  const playerRef = useRef<PlayerEntity>(null as any);
  const wallsRef = useRef<WallRect[]>([]);
  const objectsRef = useRef<EnvObject[]>([]);
  const goalRef = useRef<Vec2 & { radius: number; revealedAt: number; revealStrength: number }>(null as any);
  const wraithsRef = useRef<WraithEntity[]>([]);
  const wavesRef = useRef<SonarWaveEntity[]>([]);
  const sparksRef = useRef<ImpactSpark[]>([]);
  const dustRef = useRef<AmbientDust[]>([]);
  const gridRef = useRef(new SpatialHashGrid(50));
  const inputRef = useRef<Vec2>({ x: 0, y: 0 }); // Directional input
  const sonarLeftRef = useRef(0);
  const elapsedRef = useRef(0);
  const frenzyRef = useRef(false);
  const runningRef = useRef(true);
  const lastFrameRef = useRef(Date.now());
  const lastPingRef = useRef(0);
  const ghostRef = useRef(true);
  const trackRef = useRef<GhostPoint[]>([]);
  const rafRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const wonRef = useRef(false);

  // Level init
  const initLevel = useCallback(() => {
    gridRef.current.clear();
    level.walls.forEach((w) => gridRef.current.insert(w));

    const dust: AmbientDust[] = [];
    for (let i = 0; i < GAME_CONFIG.DUST_COUNT; i++) {
      dust.push({
        x: Math.random() * SW,
        y: Math.random() * SH,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
        size: 0.8 + Math.random() * 1.2,
        baseAlpha: 0.04 + Math.random() * 0.06,
        ignitedTimer: 0,
      });
    }

    playerRef.current = {
      pos: { x: level.spawn.x, y: level.spawn.y },
      velocity: { x: 0, y: 0 },
      radius: GAME_CONFIG.PLAYER_RADIUS,
      rotation: -Math.PI / 2,
      scale: 1.0,
      momentum: 0,
      momentumTimer: 0,
      isMoving: false,
      footstepTimer: 0,
      squashFactor: 1.0,
    };
    wallsRef.current = level.walls;
    objectsRef.current = level.objects.map((o) => ({
      ...o,
      revealedAt: 0,
      revealStrength: 0,
      lastPingDistance: 0,
      collected: false,
    }));
    goalRef.current = {
      x: level.goal.x,
      y: level.goal.y,
      radius: level.goal.radius,
      revealedAt: 0,
      revealStrength: 0,
    };
    wraithsRef.current = level.hunters.map((h) =>
      HunterAI.create(h.anchor, h.speedMultiplier)
    );
    wavesRef.current = [];
    sparksRef.current = [];
    dustRef.current = dust;
    inputRef.current = { x: 0, y: 0 };
    sonarLeftRef.current = level.sonar.allowance;
    elapsedRef.current = 0;
    frenzyRef.current = false;
    runningRef.current = true;
    lastFrameRef.current = Date.now();
    ghostRef.current = true;
    trackRef.current = [];
    pausedRef.current = false;
    wonRef.current = false;

    setIsPaused(false);
    setIsWon(false);
    setScoreResult(null);
    setShardsEarned(0);
    setIsRedStatic(false);
    setJoyActive(false);
    setJoyKnob({ x: 0, y: 0 });
  }, [level]);

  useEffect(() => {
    initLevel();
    return () => {
      AudioEngine.stopAll();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [initLevel]);

  const triggerRestart = useCallback(() => {
    runningRef.current = false;
    HapticEngine.death(hapticsEnabled);
    setIsRedStatic(true);
    setTimeout(() => initLevel(), 250);
  }, [hapticsEnabled, initLevel]);

  // Elapsed timer
  useEffect(() => {
    const id = setInterval(() => {
      if (runningRef.current && !pausedRef.current && !wonRef.current) {
        elapsedRef.current += 1;
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { wonRef.current = isWon; }, [isWon]);

  // Sonar Ping Function
  const fireSonar = useCallback(() => {
    if (!runningRef.current || pausedRef.current || wonRef.current) return;
    const now = Date.now();
    if (now - lastPingRef.current < GAME_CONFIG.SONAR_COOLDOWN) return;
    if (level.sonar.allowance < 999 && sonarLeftRef.current <= 0) {
      AudioEngine.playCollisionThud(soundEnabled);
      HapticEngine.wallBump(hapticsEnabled);
      return;
    }
    lastPingRef.current = now;
    if (level.sonar.allowance < 999) sonarLeftRef.current -= 1;
    playerRef.current.momentum = 0;

    wavesRef.current = [
      ...wavesRef.current,
      {
        id: `w_${now}_${Math.random()}`,
        origin: { x: playerRef.current.pos.x, y: playerRef.current.pos.y },
        currentRadius: 8,
        maxRadius: sonarRadius,
        speed: 460,
        createdAt: now,
        intensity: 1.0,
        piercing: hasPiercing,
      },
    ];
    AudioEngine.playSonarPulse(soundEnabled);
    HapticEngine.ping(hapticsEnabled);

    for (const w of wraithsRef.current) {
      const { alerted } = HunterAI.onPlayerPing(
        w,
        playerRef.current.pos,
        now,
        lastPingRef.current
      );
      if (alerted) {
        ghostRef.current = false;
        AudioEngine.playWraithAlert(soundEnabled);
        HapticEngine.wraithAlert(hapticsEnabled);
      }
    }
  }, [level, sonarRadius, hasPiercing, soundEnabled, hapticsEnabled]);

  // Keyboard controls for Web / Simulator
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const keys: Record<string, boolean> = {};

    const updateKeys = () => {
      let x = 0;
      let y = 0;
      if (keys['KeyW'] || keys['ArrowUp']) y -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) y += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) x -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) x += 1;
      const mag = Math.hypot(x, y);
      if (mag > 0) {
        inputRef.current = { x: x / mag, y: y / mag };
      } else {
        inputRef.current = { x: 0, y: 0 };
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        fireSonar();
        return;
      }
      keys[e.code] = true;
      updateKeys();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
      updateKeys();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [fireSonar]);

  // ══════════════════════════════════════════════════════════════
  // RIGHT-SIDE FLOATING ANALOG JOYSTICK (PanResponder)
  // ══════════════════════════════════════════════════════════════
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,

        onPanResponderGrant: (evt) => {
          const { pageX, pageY } = evt.nativeEvent;
          setJoyCenter({ x: pageX, y: pageY });
          setJoyKnob({ x: 0, y: 0 });
          setJoyActive(true);
          inputRef.current = { x: 0, y: 0 };
        },

        onPanResponderMove: (_evt, gestureState) => {
          const { dx, dy } = gestureState;
          const dist = Math.hypot(dx, dy);

          let clampedX = dx;
          let clampedY = dy;
          if (dist > JOY_RADIUS) {
            clampedX = (dx / dist) * JOY_RADIUS;
            clampedY = (dy / dist) * JOY_RADIUS;
          }

          const mag = Math.min(1.0, dist / JOY_RADIUS);
          if (dist > 2) {
            inputRef.current = {
              x: (dx / dist) * mag,
              y: (dy / dist) * mag,
            };
          } else {
            inputRef.current = { x: 0, y: 0 };
          }

          setJoyKnob({ x: clampedX, y: clampedY });
        },

        onPanResponderRelease: () => {
          inputRef.current = { x: 0, y: 0 };
          setJoyActive(false);
          setJoyKnob({ x: 0, y: 0 });
        },

        onPanResponderTerminate: () => {
          inputRef.current = { x: 0, y: 0 };
          setJoyActive(false);
          setJoyKnob({ x: 0, y: 0 });
        },
      }),
    []
  );

  // ══════════════════════════════════════════════════════════════
  // HIGH-PERFORMANCE 60 FPS ENGINE LOOP
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    const tick = () => {
      if (!runningRef.current || pausedRef.current || wonRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = Date.now();
      const dt = Math.min(0.04, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      const p = playerRef.current;
      if (!p) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // 1. Move Player Physics
      const mv = MovementSystem.updatePlayer(p, inputRef.current, hasWhisperStep, dt, now);

      trackRef.current.push({
        t: elapsedRef.current * 1000,
        x: p.pos.x,
        y: p.pos.y,
        p: false,
      });

      if (mv.emittedFootstep) {
        for (const w of wraithsRef.current) {
          if (HunterAI.onPlayerSprint(w, p.pos)) {
            ghostRef.current = false;
            AudioEngine.playWraithAlert(soundEnabled);
            HapticEngine.wraithAlert(hapticsEnabled);
          }
        }
      }

      CollisionSystem.updateMovingWalls(objectsRef.current, now);

      // 2. Resolve Collisions
      const coll = CollisionSystem.resolvePlayerMovement(
        p.pos,
        mv.deltaPos,
        p.radius,
        wallsRef.current,
        objectsRef.current,
        SW,
        SH
      );
      p.pos = coll.newPos;

      if (coll.collided && mv.isSprinting) {
        AudioEngine.playCollisionThud(soundEnabled);
        HapticEngine.wallBump(hapticsEnabled);
      }

      // 3. Environmental Interactions
      if (CollisionSystem.checkChasmFall(p.pos, p.radius, objectsRef.current)) {
        triggerRestart();
        return;
      }
      if (CollisionSystem.checkShardCollection(p.pos, p.radius, objectsRef.current)) {
        sonarLeftRef.current = Math.min(level.sonar.allowance, sonarLeftRef.current + 1);
        AudioEngine.playShardChime(soundEnabled);
        HapticEngine.shardPickup(hapticsEnabled);
      }
      const plate = CollisionSystem.checkPressurePlate(p.pos, p.radius, objectsRef.current, now);
      if (plate) {
        AudioEngine.playWraithAlert(soundEnabled);
        for (const w of wraithsRef.current) {
          HunterAI.onDistraction(w, {
            x: plate.x + plate.width / 2,
            y: plate.y + plate.height / 2,
          });
        }
      }

      // 4. Goal Check
      if (CollisionSystem.checkGoal(p.pos, p.radius, goalRef.current)) {
        runningRef.current = false;
        wonRef.current = true;
        AudioEngine.playLevelComplete(soundEnabled);
        HapticEngine.victory(hapticsEnabled);

        const used =
          level.sonar.allowance >= 999
            ? 1
            : level.sonar.allowance - sonarLeftRef.current;
        const sc = ScoringSystem.evaluateScore(
          level,
          elapsedRef.current,
          used,
          level.sonar.allowance,
          p.momentum,
          ghostRef.current,
          false
        );
        const rec = recordLevelVictory(
          level.id,
          elapsedRef.current,
          used,
          sc.stars,
          ghostRef.current,
          sc.perfectEchoBonus > 0,
          trackRef.current
        );

        setScoreResult(sc);
        setShardsEarned(rec.shardsEarned);
        setIsWon(true);
        return;
      }

      // 5. Sonar Waves Sweep
      const liveWaves: SonarWaveEntity[] = [];
      const secondaryPings: Vec2[] = [];
      for (const wave of wavesRef.current) {
        const res = SonarSystem.updateWave(
          wave,
          dt,
          now,
          wallsRef.current,
          objectsRef.current,
          wraithsRef.current,
          goalRef.current,
          (pos, dist) => AudioEngine.playReturnEcho(pos, p.pos, dist, soundEnabled)
        );
        if (res.isAlive) liveWaves.push(wave);
        objectsRef.current = res.updatedObjects;
        sparksRef.current = [...sparksRef.current, ...res.newSparks].slice(
          -GAME_CONFIG.PARTICLE_POOL_SIZE
        );
        secondaryPings.push(...res.secondaryPings);
      }
      for (const sp of secondaryPings) {
        liveWaves.push({
          id: `s${now}${Math.random()}`,
          origin: sp,
          currentRadius: 10,
          maxRadius: sonarRadius * 0.8,
          speed: 400,
          createdAt: now,
          intensity: 0.8,
        });
        AudioEngine.playSonarPulse(soundEnabled);
      }
      wavesRef.current = liveWaves;

      // 6. Particles Sparks
      const ls: ImpactSpark[] = [];
      for (const sp of sparksRef.current) {
        const life = sp.life - dt * 1000;
        if (life > 0) ls.push({ ...sp, x: sp.x + sp.vx * dt, y: sp.y + sp.vy * dt, life });
      }
      sparksRef.current = ls;

      // 7. Ambient Dust
      for (const d of dustRef.current) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.x < 0) d.x = SW;
        if (d.x > SW) d.x = 0;
        if (d.y < 0) d.y = SH;
        if (d.y > SH) d.y = 0;
        if (d.ignitedTimer > 0) d.ignitedTimer -= dt * 1000;
        for (const w of liveWaves) {
          const dist = Math.hypot(w.origin.x - d.x, w.origin.y - d.y);
          if (dist >= w.currentRadius - 8 && dist <= w.currentRadius + 8) d.ignitedTimer = 800;
        }
      }

      // 8. Wraith AI
      let anyFrenzy = false;
      const cW = SW / level.grid.cols;
      const cH = SH / level.grid.rows;
      const openGrid = Array.from({ length: level.grid.rows }, (_, r) =>
        Array.from({ length: level.grid.cols }, (_, c) => ({
          col: c,
          row: r,
          walls: { top: false, right: false, bottom: false, left: false },
          visited: true,
        }))
      );
      for (const wraith of wraithsRef.current) {
        HunterAI.update(wraith, openGrid, cW, cH, dt, now);
        if (wraith.state === 'FRENZY') anyFrenzy = true;
        if (Math.hypot(wraith.pos.x - p.pos.x, wraith.pos.y - p.pos.y) < wraith.radius + p.radius) {
          triggerRestart();
          return;
        }
      }
      frenzyRef.current = anyFrenzy;
      AudioEngine.updateWraithAudio(wraithsRef.current[0], p.pos, soundEnabled);

      // Trigger high-fps React re-render
      setTick((t) => (t + 1) | 0);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [
    level,
    sonarRadius,
    hasWhisperStep,
    hapticsEnabled,
    soundEnabled,
    recordLevelVictory,
    triggerRestart,
  ]);

  const p = playerRef.current;

  return (
    <View style={[styles.container, isRedStatic && styles.redStatic]}>
      {/* 1. LAYERED GAME CANVAS (pointerEvents="none" for zero touch blocking) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {p && (
          <GameCanvas
            player={p}
            walls={wallsRef.current}
            objects={objectsRef.current}
            goal={goalRef.current}
            waves={wavesRef.current}
            sparks={sparksRef.current}
            dustParticles={dustRef.current}
            wraiths={wraithsRef.current}
            ghostTrack={existingRecord?.ghostTrack}
            now={Date.now()}
            worldWidth={SW}
            worldHeight={SH}
            isHunting={wraithsRef.current.some(
              (w) => w.state === 'HUNTING' || w.state === 'FRENZY'
            )}
          />
        )}
      </View>

      {/* 2. FLOATING JOYSTICK VISUAL OVERLAY (Full Screen, pointerEvents="none") */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={SW} height={SH}>
          {/* Base outer ring */}
          <Circle
            cx={joyCenter.x}
            cy={joyCenter.y}
            r={JOY_RADIUS}
            stroke={joyActive ? PALETTE.sonarCyan : 'rgba(255, 255, 255, 0.15)'}
            strokeWidth={1.5}
            fill={joyActive ? 'rgba(77, 240, 255, 0.08)' : 'rgba(10, 16, 28, 0.3)'}
          />
          {/* Directional Knob */}
          <Circle
            cx={joyCenter.x + joyKnob.x}
            cy={joyCenter.y + joyKnob.y}
            r={20}
            fill={joyActive ? PALETTE.sonarCyan : 'rgba(255, 255, 255, 0.25)'}
            stroke="#FFFFFF"
            strokeWidth={joyActive ? 1.5 : 0}
          />
        </Svg>
      </View>

      {/* 3. LEFT-SIDE SONAR BUTTON & TAP ZONE (Left 35% of screen) */}
      <Pressable
        style={styles.sonarZone}
        onPress={fireSonar}
        android_disableSound
      >
        <View style={styles.sonarButton}>
          <Svg width={56} height={56} viewBox="0 0 56 56">
            <Circle cx={28} cy={28} r={24} stroke={PALETTE.sonarCyan} strokeWidth={1.5} fill="none" opacity={0.4} strokeDasharray="4, 3" />
            <Circle cx={28} cy={28} r={16} stroke={PALETTE.sonarCyan} strokeWidth={2} fill="none" opacity={0.8} />
            <Circle cx={28} cy={28} r={7} fill={PALETTE.sonarCyan} />
          </Svg>
          <Text style={styles.sonarButtonText}>SONAR</Text>
        </View>
      </Pressable>

      {/* 4. RIGHT-SIDE FLOATING JOYSTICK CAPTURE ZONE (Right 65% of screen) */}
      <View style={styles.joystickZone} {...panResponder.panHandlers} />

      {/* 5. HEADS-UP DISPLAY */}
      {p && (
        <HUD
          levelTitle={level.name}
          levelNumber={level.id}
          sonarRemaining={sonarLeftRef.current}
          maxSonar={level.sonar.allowance}
          elapsedSeconds={elapsedRef.current}
          momentum={p.momentum}
          isFrenzy={frenzyRef.current}
          onPause={() => setIsPaused((prev) => !prev)}
          onRestart={initLevel}
        />
      )}

      {/* 6. VICTORY CARD */}
      {scoreResult && (
        <ResultCard
          visible={isWon}
          levelNumber={level.id}
          levelTitle={level.name}
          score={scoreResult}
          shardsEarned={shardsEarned}
          isGhostRun={ghostRef.current}
          onNextLevel={() => onNextLevel(level.id + 1)}
          onInstantRetry={initLevel}
          onMenu={onExitToMenu}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.voidBlack,
    overflow: 'hidden',
  },
  redStatic: {
    backgroundColor: PALETTE.wraithRed,
    opacity: 0.9,
  },
  sonarZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '35%',
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 40,
    zIndex: 50,
  },
  joystickZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: '65%',
    height: '100%',
    zIndex: 50,
  },
  sonarButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(10, 16, 28, 0.75)',
    borderWidth: 1.5,
    borderColor: PALETTE.sonarCyan,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: PALETTE.sonarCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
  sonarButtonText: {
    color: PALETTE.sonarCyan,
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: -2,
  },
});
