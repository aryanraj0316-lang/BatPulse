import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Platform,
  Text,
  TouchableOpacity,
  type GestureResponderEvent,
} from 'react-native';
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
  RevealZone,
} from '../types/game';
import { GAME_CONFIG } from '../constants/gameConfig';
import { PALETTE } from '../constants/palette';
import { LevelFactory } from '../levels/generated';
import { SpatialHashGrid } from '../maze/mesher';
import { CollisionSystem } from '../engine/CollisionSystem';
import { SonarSystem } from '../engine/SonarSystem';
import { MovementSystem } from '../engine/MovementSystem';
import { HunterAI } from '../engine/HunterAI';
import { buildNavGrid } from '../engine/NavGrid';
import { AudioEngine } from '../engine/AudioEngine';
import { HapticEngine } from '../engine/HapticEngine';
import { ScoringSystem, ScoreBreakdown } from '../engine/ScoringSystem';
import { useProgressStore } from '../state/progressStore';
import { useSettingsStore } from '../state/settingsStore';
import { GameCanvas, GameCanvasHandle } from '../render/GameCanvas';
import type { JoystickState } from '../render/skia/SceneRenderer';
import { HUD } from '../components/HUD';
import { Map as MapIcon, FastForward } from 'lucide-react-native';
import { UI } from '../ui/theme';
import { PauseOverlay } from '../components/PauseOverlay';
import { DevLevelPicker } from '../components/DevLevelPicker';
import { ResultCard } from '../components/ResultCard';
import { ChapterBanner } from '../components/ChapterBanner';
import { skinOf } from '../skins/skins';
import { biomeForLevel, CHAPTER_SIZE } from '../render/themes/biomes';
import { RunOverlay } from '../components/RunOverlay';
import { HintToast } from '../components/HintToast';
import { type RunInfo, runLevelId, runFloorSeed, floorShards, runDay } from '../levels/runs';

interface GameScreenProps {
  levelId: number;
  onExitToMenu: () => void;
  onNextLevel: (nextLevelId: number) => void;
  /** Endless / Daily run in progress (campaign when absent) */
  run?: RunInfo;
  /** continue the run on its next floor */
  onRunAdvance?: (next: RunInfo) => void;
  /** start a fresh run of the same mode */
  onRunRestart?: () => void;
}

const { width: SW, height: SH } = Dimensions.get('window');
const JOY_RADIUS = 50;
const TAP_MAX_MS = 260; // a touch shorter than this that barely moves = sonar tap
const TAP_MAX_MOVE = 12; // px a finger may wander and still count as a tap
const LONG_PRESS_MS = TAP_MAX_MS; // holding still this long summons the joystick
const restingJoystick = (): JoystickState => ({
  center: { x: SW - 75, y: SH - 85 },
  knob: { x: 0, y: 0 },
  active: false,
  radius: JOY_RADIUS,
});

export const GameScreen: React.FC<GameScreenProps> = ({
  levelId,
  onExitToMenu,
  onNextLevel,
  run,
  onRunAdvance,
  onRunRestart,
}) => {
  const { records, recordLevelVictory, equippedAbilities, equippedSkin } = useProgressStore();
  const { soundEnabled, hapticsEnabled, devModeUnlocked } = useSettingsStore();
  const runRef = useRef(run);
  runRef.current = run;

  const level = useMemo(() => {
    if (!run) return LevelFactory.createLevel(levelId, undefined, SW, SH);
    const lv = LevelFactory.createLevel(runLevelId(run.floor), runFloorSeed(run), SW, SH);
    return { ...lv, name: run.mode === 'daily' ? 'Daily Descent' : 'Endless Descent' };
  }, [levelId, run?.mode, run?.floor, run?.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const existingRecord = records[levelId];

  const hasWidePulse = equippedAbilities.includes('WIDE_PULSE');
  const hasPiercing = equippedAbilities.includes('PIERCING_PING');
  const hasWhisperStep = equippedAbilities.includes('WHISPER_STEP');
  const hasRicochet = equippedAbilities.includes('RICOCHET');
  const hasSixthSense = equippedAbilities.includes('SIXTH_SENSE');
  const sonarRadius = hasWidePulse ? GAME_CONFIG.SONAR_RADIUS * 1.4 : GAME_CONFIG.SONAR_RADIUS;

  // Equipped skin: its look is drawn by the renderer, its power tweaks the numbers below
  const skin = useMemo(() => skinOf(equippedSkin), [equippedSkin]);
  const power = skin.power;
  const maxSonar = level.sonar.allowance >= 999 ? level.sonar.allowance : level.sonar.allowance + (power.extraPulse ?? 0);
  const reloadMs = GAME_CONFIG.SONAR_RELOAD_MS * (power.reloadMult ?? 1);
  const revealHold = GAME_CONFIG.REVEAL_HOLD_MS + (power.revealHoldMs ?? 0);

  // Chapter title card on the first level of each biome
  const biome = biomeForLevel(levelId);
  const chapterOpen = !run && (levelId - 1) % CHAPTER_SIZE === 0;
  const twistNote =
    levelId === GAME_CONFIG.CRUSHER_FIRST_LEVEL
      ? 'NEW · Crushers slam shut across corridors. Watch their glow, then dash.'
      : levelId === GAME_CONFIG.RIFT_FIRST_LEVEL
      ? 'NEW · Rifts are linked portals. Fly into one, come out of its twin.'
      : null;

  // HUD values. Only pushed to React when they actually change (not every frame).
  const [hud, setHud] = useState({
    sonar: 0,
    elapsed: 0,
    momentum: 0,
    frenzy: false,
    lastPingAt: 0,
    reload: -1,
    keyState: 0,
  });
  const hudRef = useRef(hud);
  const canvasRef = useRef<GameCanvasHandle>(null);
  function syncHud(force = false) {
    const pl = playerRef.current;
    const next = {
      sonar: sonarLeftRef.current,
      elapsed: elapsedRef.current,
      momentum: pl ? pl.momentum : 0,
      frenzy: frenzyRef.current,
      lastPingAt: lastPingRef.current,
      // -1 = not reloading; otherwise 0..1 in 1/20 steps (so the HUD redraws only ~5×/s)
      reload: reloadingRef.current ? Math.floor((reloadMsRef.current / reloadMs) * 20) / 20 : -1,
      // 0 = no key in this level, 1 = key still hidden, 2 = key collected
      keyState: objectsRef.current.some((o) => o.type === 'key') ? (objectsRef.current.some((o) => o.type === 'key' && !o.collected) ? 1 : 2) : 0,
    };
    const cur = hudRef.current;
    if (
      force ||
      cur.sonar !== next.sonar ||
      cur.elapsed !== next.elapsed ||
      cur.momentum !== next.momentum ||
      cur.frenzy !== next.frenzy ||
      cur.lastPingAt !== next.lastPingAt ||
      cur.reload !== next.reload ||
      cur.keyState !== next.keyState
    ) {
      hudRef.current = next;
      setHud(next);
    }
  }

  // Overlay / UI states
  const [isPaused, setIsPaused] = useState(false);
  const [showDevPicker, setShowDevPicker] = useState(false);
  // DEV: switch the darkness off to see the whole maze
  const [revealAll, setRevealAll] = useState(false);
  const revealAllRef = useRef(false);
  const [isWon, setIsWon] = useState(false);
  const [scoreResult, setScoreResult] = useState<ScoreBreakdown | null>(null);
  const [shardsEarned, setShardsEarned] = useState(0);
  const [isRedStatic, setIsRedStatic] = useState(false);
  // Endless / Daily: floor cleared or run over
  const [runCard, setRunCard] = useState<null | { kind: 'cleared' | 'over'; floor: number; floorShards: number; runShards: number; best: number; newBest: boolean }>(null);
  // delayed echoes: Ricochet bounces and the Sixth Sense exit glow
  const pendingEchoRef = useRef<{ x: number; y: number; at: number; sense?: boolean }[]>([]);

  // Joystick (drawn by the Skia canvas; hidden until a long press or drag summons it)
  const joyRef = useRef<JoystickState>(restingJoystick());
  // Active touches: which one steers, and which are still candidate taps
  const touchesRef = useRef(
    new Map<number, { x0: number; y0: number; t0: number; steering: boolean; hold?: ReturnType<typeof setTimeout> }>()
  );

  // Mutable game state
  const playerRef = useRef<PlayerEntity>(null as any);
  const wallsRef = useRef<WallRect[]>([]);
  const objectsRef = useRef<EnvObject[]>([]);
  const goalRef = useRef<Vec2 & { radius: number; revealedAt: number; revealStrength: number }>(null as any);
  const wraithsRef = useRef<WraithEntity[]>([]);
  const wavesRef = useRef<SonarWaveEntity[]>([]);
  const revealsRef = useRef<RevealZone[]>([]);
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
  // sonar reload: recharging once at/below the threshold until full; progress 0..1 of the next pulse
  const reloadingRef = useRef(false);
  const reloadMsRef = useRef(0);
  const pulsesFiredRef = useRef(0);
  // visual-only: when the bat last bumped a wall / picked something up (drives its reactions)
  const bumpAtRef = useRef(0);
  const pickupAtRef = useRef(0);
  const ghostRef = useRef(true);
  const trackRef = useRef<GhostPoint[]>([]);
  const rafRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  // rift the bat just arrived in (no teleport back until it flies out)
  const riftLockRef = useRef<string | null>(null);
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
      Object.assign(HunterAI.create(h.anchor, (h.speedMultiplier ?? 1) * (power.wraithSpeedMult ?? 1), buildNavGrid(level, SW, SH, level.objects)), {
        visionScale: power.visionMult ?? 1,
      })
    );
    wavesRef.current = [];
    revealsRef.current = [];
    sparksRef.current = [];
    dustRef.current = dust;
    inputRef.current = { x: 0, y: 0 };
    sonarLeftRef.current = maxSonar;
    riftLockRef.current = null;
    pendingEchoRef.current = hasSixthSense ? [{ x: level.goal.x, y: level.goal.y, at: Date.now() + 900, sense: true }] : [];
    reloadingRef.current = false;
    reloadMsRef.current = 0;
    pulsesFiredRef.current = 0;
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
    setRunCard(null);
    setIsRedStatic(false);
    joyRef.current = restingJoystick();
    touchesRef.current.clear();
    syncHud(true);
  }, [level, maxSonar, power, hasSixthSense]);

  useEffect(() => {
    AudioEngine.preload(); // load every sound now so nothing loads mid-game
    initLevel();
    return () => {
      // level is changing: stop this level's sounds (loops, jingles, pending echoes)
      AudioEngine.silenceAll();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [initLevel]);

  // leaving the game screen entirely: free all audio players
  useEffect(() => () => AudioEngine.stopAll(), []);

  const triggerRestart = useCallback(() => {
    runningRef.current = false;
    AudioEngine.playDeath(soundEnabled);
    HapticEngine.death(hapticsEnabled);
    setIsRedStatic(true);
    const r = runRef.current;
    if (!r) {
      setTimeout(() => initLevel(), 250);
      return;
    }
    // one life per run: record how deep the bat got and show the run summary
    wonRef.current = true;
    const depth = r.floor - 1;
    const store = useProgressStore.getState();
    const prevBest = r.mode === 'daily' ? (store.dailyDay === runDay(r) ? store.dailyBestDepth : 0) : store.endlessHighScore;
    const newBest = r.mode === 'daily' ? store.recordDailyScore(runDay(r), depth) : store.recordEndlessScore(depth);
    setTimeout(() => {
      setIsRedStatic(false);
      setRunCard({ kind: 'over', floor: r.floor, floorShards: 0, runShards: r.shards, best: Math.max(prevBest, depth), newBest });
    }, 420);
  }, [hapticsEnabled, soundEnabled, initLevel]);

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
    pulsesFiredRef.current += 1;
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
        followsPlayer: true,
      },
    ];
    revealsRef.current = [
      ...revealsRef.current,
      {
        id: `z_${now}_${Math.random()}`,
        x: playerRef.current.pos.x,
        y: playerRef.current.pos.y,
        maxRadius: sonarRadius,
        createdAt: now,
        intensity: 1.0,
        followsPlayer: true,
        hold: revealHold,
      },
    ];
    if (hasRicochet) {
      for (const b of SonarSystem.ricochetPoints(playerRef.current.pos, sonarRadius, gridRef.current, objectsRef.current)) {
        pendingEchoRef.current.push({ x: b.x, y: b.y, at: now + (b.dist / 460) * 1000 + 120 });
      }
    }
    AudioEngine.playSonarPulse(soundEnabled);
    HapticEngine.ping(hapticsEnabled);
  }, [level, sonarRadius, hasPiercing, hasRicochet, soundEnabled, hapticsEnabled, revealHold]);

  // Web-only preview: `?run=endless&runcard=over|cleared` shows the run summary card
  useEffect(() => {
    if (Platform.OS !== 'web' || !run || typeof window === 'undefined') return;
    const m = window.location.search.match(/[?&]runcard=(over|cleared)/);
    if (m) setTimeout(() => setRunCard({ kind: m[1] as 'over' | 'cleared', floor: 7, floorShards: 18, runShards: 96, best: 9, newBest: m[1] === 'cleared' }), 500);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Web-only preview: `?level=5&win` shows the Level Complete card
  useEffect(() => {
    if (Platform.OS !== 'web' || run || typeof window === 'undefined' || !/[?&]win(&|$)/.test(window.location.search)) return;
    setTimeout(() => {
      runningRef.current = false;
      wonRef.current = true;
      setScoreResult(ScoringSystem.evaluateScore(level, 24, 3, maxSonar, 0, true, false));
      setShardsEarned(12);
      setIsWon(true);
    }, 600);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Web-only preview: `?autopulse` fires the sonar every 1.8s (handy for screenshots / attract mode)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!/[?&]autopulse(&|$)/.test(window.location.search)) return;
    const id = setInterval(() => fireSonar(), 1800);
    return () => clearInterval(id);
  }, [fireSonar]);

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
  // WHOLE-SCREEN TOUCH: quick tap anywhere = sonar, press + drag = joystick
  // ══════════════════════════════════════════════════════════════
  type TouchPoint = { identifier?: number; pageX: number; pageY: number };
  const changedTouches = (e: GestureResponderEvent): TouchPoint[] => {
    const ne: any = e.nativeEvent;
    return ne.changedTouches && ne.changedTouches.length ? ne.changedTouches : [ne];
  };
  const allTouches = (e: GestureResponderEvent): TouchPoint[] => {
    const ne: any = e.nativeEvent;
    return ne.touches && ne.touches.length ? ne.touches : [ne];
  };

  const onTouchDown = (e: GestureResponderEvent) => {
    for (const tch of changedTouches(e)) {
      const id = tch.identifier ?? 0;
      if (touchesRef.current.has(id)) continue;
      const tr: { x0: number; y0: number; t0: number; steering: boolean; hold?: ReturnType<typeof setTimeout> } = {
        x0: tch.pageX,
        y0: tch.pageY,
        t0: Date.now(),
        steering: false,
      };
      // Long press: if the finger is still down (and nobody steers yet), it becomes the joystick
      tr.hold = setTimeout(() => {
        if (touchesRef.current.get(id) !== tr || tr.steering) return;
        let someoneSteering = false;
        touchesRef.current.forEach((t) => {
          if (t.steering) someoneSteering = true;
        });
        if (someoneSteering) return;
        startSteering(tr);
      }, LONG_PRESS_MS);
      touchesRef.current.set(id, tr);
    }
  };

  /** Turn a finger into the floating joystick, centred where it first touched. */
  const startSteering = (tr: { x0: number; y0: number; steering: boolean }) => {
    tr.steering = true;
    joyRef.current.center = { x: tr.x0, y: tr.y0 };
    joyRef.current.knob = { x: 0, y: 0 };
    joyRef.current.active = true;
  };

  const onTouchMove = (e: GestureResponderEvent) => {
    let someoneSteering = false;
    touchesRef.current.forEach((t) => {
      if (t.steering) someoneSteering = true;
    });
    for (const tch of allTouches(e)) {
      const tr = touchesRef.current.get(tch.identifier ?? 0);
      if (!tr) continue;
      if (!tr.steering && !someoneSteering && Math.hypot(tch.pageX - tr.x0, tch.pageY - tr.y0) > TAP_MAX_MOVE) {
        startSteering(tr);
        someoneSteering = true;
      }
      if (tr.steering) {
        const dx = tch.pageX - joyRef.current.center.x;
        const dy = tch.pageY - joyRef.current.center.y;
        const dist = Math.hypot(dx, dy);
        const k = dist > JOY_RADIUS ? JOY_RADIUS / dist : 1;
        joyRef.current.knob = { x: dx * k, y: dy * k };
        const mag = Math.min(1, dist / JOY_RADIUS);
        inputRef.current = dist > 2 ? { x: (dx / dist) * mag, y: (dy / dist) * mag } : { x: 0, y: 0 };
      }
    }
  };

  const onTouchUp = (e: GestureResponderEvent) => {
    for (const tch of changedTouches(e)) {
      const id = tch.identifier ?? 0;
      const tr = touchesRef.current.get(id);
      if (!tr) continue;
      if (tr.hold) clearTimeout(tr.hold);
      touchesRef.current.delete(id);
      if (tr.steering) {
        inputRef.current = { x: 0, y: 0 };
        joyRef.current = restingJoystick();
      } else if (Date.now() - tr.t0 <= TAP_MAX_MS && Math.hypot(tch.pageX - tr.x0, tch.pageY - tr.y0) <= TAP_MAX_MOVE) {
        fireSonar();
      }
    }
  };

  const onTouchCancel = () => {
    touchesRef.current.forEach((t) => t.hold && clearTimeout(t.hold));
    touchesRef.current.clear();
    inputRef.current = { x: 0, y: 0 };
    joyRef.current = restingJoystick();
  };

  // Enemy navigation grid built from the REAL walls (water + lasers impassable) — once per level
  const navGrid = useMemo(() => buildNavGrid(level, SW, SH, level.objects), [level]);

  const drawFrame = (now: number) => {
    const pl = playerRef.current;
    if (!pl || !canvasRef.current) return;
    canvasRef.current.draw({
      now,
      player: pl,
      wraiths: wraithsRef.current,
      objects: objectsRef.current,
      goal: goalRef.current,
      revealZones: revealsRef.current,
      sparks: sparksRef.current,
      dust: dustRef.current,
      // a ghost recorded on an older layout of this level (different start) would fly through walls
      ghostTrack:
        existingRecord?.ghostTrack?.length &&
        Math.hypot(existingRecord.ghostTrack[0].x - level.spawn.x, existingRecord.ghostTrack[0].y - level.spawn.y) < 40
          ? existingRecord.ghostTrack
          : undefined,
      isHunting: wraithsRef.current.some((w) => w.state === 'HUNTING' || w.state === 'FRENZY'),
      joystick: joyRef.current,
      skin,
      revealAll: revealAllRef.current || undefined,
      batFx: {
        pingAt: lastPingRef.current,
        bumpAt: bumpAtRef.current,
        pickupAt: pickupAtRef.current,
        fear: wraithsRef.current.reduce((acc, w) => {
          if (w.state === 'DORMANT') return acc;
          const d = Math.hypot(w.pos.x - pl.pos.x, w.pos.y - pl.pos.y);
          return Math.max(acc, Math.max(0, 1 - d / 260));
        }, 0),
      },
    });
  };

  // ══════════════════════════════════════════════════════════════
  // HIGH-PERFORMANCE 60 FPS ENGINE LOOP
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    const tick = () => {
      if (!runningRef.current || pausedRef.current || wonRef.current) {
        AudioEngine.stopLoops();
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
      const mv = MovementSystem.updatePlayer(p, inputRef.current, hasWhisperStep, dt, now, power.speedMult ?? 1);

      trackRef.current.push({
        t: elapsedRef.current * 1000,
        x: p.pos.x,
        y: p.pos.y,
        p: false,
      });

      // (enemies no longer hear footsteps: they only react to what they see)

      // Lane assist: steering mostly along one axis gently centres the bat in that corridor,
      // so it lines up with openings instead of scraping walls and catching on corners.
      if (GAME_CONFIG.LANE_ASSIST > 0) {
        const inp = inputRef.current;
        const ax = Math.abs(inp.x);
        const ay = Math.abs(inp.y);
        const k = Math.min(1, dt * GAME_CONFIG.LANE_ASSIST);
        const cellW = SW / level.grid.cols;
        const cellH = SH / level.grid.rows;
        if (ax > 0.25 && ax > ay * 1.8) {
          const off = (Math.floor(p.pos.y / cellH) + 0.5) * cellH - p.pos.y;
          if (Math.abs(off) < cellH * 0.42) mv.deltaPos.y += off * k * Math.min(1, ax);
        } else if (ay > 0.25 && ay > ax * 1.8) {
          const off = (Math.floor(p.pos.x / cellW) + 0.5) * cellW - p.pos.x;
          if (Math.abs(off) < cellW * 0.42) mv.deltaPos.x += off * k * Math.min(1, ay);
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

      if (coll.collided && Math.hypot(p.velocity.x, p.velocity.y) > GAME_CONFIG.PLAYER_SPEED * 0.4 && now - bumpAtRef.current > 300) {
        bumpAtRef.current = now; // visual reaction only
      }
      if (coll.collided && mv.isSprinting) {
        AudioEngine.playCollisionThud(soundEnabled);
        HapticEngine.wallBump(hapticsEnabled);
      }

      // 3. Environmental Interactions
      if (CollisionSystem.checkChasmFall(p.pos, p.radius, objectsRef.current)) {
        triggerRestart();
        return;
      }
      // 3a. Twists: crushers kill, rifts carry the bat to their twin
      if (CollisionSystem.checkCrusher(p.pos, p.radius, objectsRef.current, now)) {
        triggerRestart();
        return;
      }
      const rift = CollisionSystem.checkRift(p.pos, objectsRef.current);
      if (!rift) riftLockRef.current = null;
      else if (riftLockRef.current !== rift.id) {
        const twin = objectsRef.current.find((o) => o.id === rift.pairId);
        if (twin) {
          p.pos = { x: twin.x + twin.width / 2, y: twin.y + twin.height / 2 };
          riftLockRef.current = twin.id; // don't bounce straight back until the bat leaves it
          rift.lastHitTime = now;
          twin.lastHitTime = now;
          pickupAtRef.current = now;
          AudioEngine.playSonarPulse(soundEnabled);
          HapticEngine.shardPickup(hapticsEnabled);
        }
      }
      if (CollisionSystem.checkShardCollection(p.pos, p.radius, objectsRef.current)) {
        pickupAtRef.current = now; // visual reaction only
        sonarLeftRef.current = Math.min(maxSonar, sonarLeftRef.current + 1);
        AudioEngine.playShardChime(soundEnabled);
        HapticEngine.shardPickup(hapticsEnabled);
      }
      const plate = CollisionSystem.checkPressurePlate(p.pos, p.radius, objectsRef.current, now);
      if (plate) {
        AudioEngine.playWraithAlert(soundEnabled);
      }

      // 3b. Key: opens the laser barriers sealing the exit
      if (CollisionSystem.checkKeyCollection(p.pos, p.radius, objectsRef.current)) {
        pickupAtRef.current = now;
        AudioEngine.playShardChime(soundEnabled);
        HapticEngine.shardPickup(hapticsEnabled);
      }

      // 3c. Sonar reload: at/below the threshold it recharges one pulse at a time until full
      if (maxSonar < 999) {
        if (sonarLeftRef.current <= GAME_CONFIG.SONAR_RELOAD_BELOW) reloadingRef.current = true;
        if (reloadingRef.current) {
          reloadMsRef.current += dt * 1000;
          if (reloadMsRef.current >= reloadMs) {
            reloadMsRef.current = 0;
            sonarLeftRef.current = Math.min(maxSonar, sonarLeftRef.current + 1);
            AudioEngine.playShardChime(soundEnabled);
          }
          if (sonarLeftRef.current >= maxSonar) {
            reloadingRef.current = false;
            reloadMsRef.current = 0;
          }
        }
      }

      // 4. Goal Check (only once the exit is unlocked)
      const exitLocked = objectsRef.current.some((o) => o.type === 'key' && !o.collected);
      if (!exitLocked && CollisionSystem.checkGoal(p.pos, p.radius, goalRef.current)) {
        runningRef.current = false;
        wonRef.current = true;
        AudioEngine.playLevelComplete(soundEnabled);
        HapticEngine.victory(hapticsEnabled);

        const r = runRef.current;
        if (r) {
          const got = Math.round(floorShards(r.floor) * (power.shardMult ?? 1));
          useProgressStore.getState().addShards(got);
          const store = useProgressStore.getState();
          const best = r.mode === 'daily' ? store.dailyBestDepth : store.endlessHighScore;
          setRunCard({ kind: 'cleared', floor: r.floor, floorShards: got, runShards: r.shards + got, best, newBest: r.floor > best });
          setIsWon(true);
          return;
        }

        // pulses actually fired (the reload means "allowance − left" is no longer the count)
        const used = level.sonar.allowance >= 999 ? 1 : Math.max(1, pulsesFiredRef.current);
        const sc = ScoringSystem.evaluateScore(
          level,
          elapsedRef.current,
          used,
          maxSonar,
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
          trackRef.current,
          power.shardMult ?? 1
        );

        setScoreResult(sc);
        setShardsEarned(rec.shardsEarned);
        setIsWon(true);
        return;
      }

      // 5. Sonar Waves Sweep — pulses the bat fired move along with it
      for (const wave of wavesRef.current) {
        if (wave.followsPlayer) wave.origin = { x: p.pos.x, y: p.pos.y };
      }
      for (const z of revealsRef.current) {
        if (z.followsPlayer) {
          z.x = p.pos.x;
          z.y = p.pos.y;
        }
      }
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
      if (pendingEchoRef.current.length) {
        const due = pendingEchoRef.current.filter((e) => e.at <= now);
        if (due.length) {
          pendingEchoRef.current = pendingEchoRef.current.filter((e) => e.at > now);
          for (const e of due) {
            if (e.sense) {
              // Sixth Sense: the exit glows briefly through the dark
              revealsRef.current.push({ id: `ss_${now}`, x: e.x, y: e.y, maxRadius: 70, createdAt: now, intensity: 0.85, hold: 1500 });
              goalRef.current.revealedAt = now;
              goalRef.current.revealStrength = 1;
            } else {
              secondaryPings.push({ x: e.x, y: e.y });
            }
          }
        }
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
        revealsRef.current.push({
          id: `zs_${now}_${Math.random()}`,
          x: sp.x,
          y: sp.y,
          maxRadius: sonarRadius * 0.8,
          createdAt: now,
          intensity: 0.8,
        });
        AudioEngine.playSonarPulse(soundEnabled);
      }
      wavesRef.current = liveWaves;
      const zoneLife =
        GAME_CONFIG.SONAR_EXPAND_DURATION * 1000 + revealHold + GAME_CONFIG.REVEAL_FADE_MS;
      if (revealsRef.current.length && now - revealsRef.current[0].createdAt > zoneLife) {
        revealsRef.current = revealsRef.current.filter((z) => now - z.createdAt <= zoneLife);
      }

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
      const hunterWorld = {
        nav: navGrid,
        walls: wallsRef.current,
        objects: objectsRef.current,
        playerPos: p.pos,
        playerRadius: p.radius,
        worldW: SW,
        worldH: SH,
      };
      for (const wraith of wraithsRef.current) {
        // enemies only give chase when the bat enters their red vision cone
        if (HunterAI.update(wraith, hunterWorld, dt, now).spotted) {
          ghostRef.current = false;
          AudioEngine.playWraithAlert(soundEnabled);
          HapticEngine.wraithAlert(hapticsEnabled);
        }
        if (wraith.state === 'FRENZY') anyFrenzy = true;
        if (Math.hypot(wraith.pos.x - p.pos.x, wraith.pos.y - p.pos.y) < wraith.radius + p.radius) {
          triggerRestart();
          return;
        }
      }
      frenzyRef.current = anyFrenzy;
      AudioEngine.updateLoops({
        enabled: soundEnabled,
        playerPos: p.pos,
        playerSpeed: Math.hypot(p.velocity.x, p.velocity.y),
        maxSpeed: GAME_CONFIG.PLAYER_SPEED,
        wraiths: wraithsRef.current,
      });

      // Draw the frame straight to the GPU canvas (no React re-render)
      drawFrame(now);
      syncHud();
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
    maxSonar,
    reloadMs,
    revealHold,
    power,
  ]);


  return (
    <View style={[styles.container, { backgroundColor: biome.ui.ink }, isRedStatic && styles.redStatic]}>
      {/* 1. GPU GAME CANVAS (Skia) — also draws the floating joystick */}
      <GameCanvas ref={canvasRef} level={level} worldWidth={SW} worldHeight={SH} />

      {/* 2. WHOLE-SCREEN TOUCH: tap anywhere = sonar, long press / drag = joystick */}
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onTouchDown}
        {...({ onResponderStart: onTouchDown, onResponderEnd: onTouchUp } as object)}
        onResponderMove={onTouchMove}
        onResponderRelease={onTouchUp}
        onResponderTerminate={onTouchCancel}
      />

      {/* 3. CHAPTER TITLE (first level of each biome) */}
      {chapterOpen && <ChapterBanner key={levelId} biome={biome} levelNumber={levelId} levelName={level.name} twist={twistNote} />}

      {/* first-time tips: the tutorial levels, and each chapter's opener (after its title card) */}
      {!run && level.hint && !existingRecord?.completed && (levelId <= 8 || chapterOpen) && !twistNote && (
        <HintToast key={`hint${levelId}`} text={level.hint} delay={chapterOpen ? 4600 : 900} />
      )}

      {/* 4. HEADS-UP DISPLAY */}
      <HUD
        levelTitle={level.name}
        levelNumber={level.id}
        levelLabel={run ? `FLOOR ${run.floor}` : undefined}
        sonarRemaining={hud.sonar}
        maxSonar={maxSonar}
        elapsedSeconds={hud.elapsed}
        momentum={hud.momentum}
        isFrenzy={hud.frenzy}
        onPause={() => setIsPaused((prev) => !prev)}
        onRestart={initLevel}
        reloadProgress={hud.reload}
        keyState={hud.keyState}
      />

      {/* 5a. DEV ONLY: See Map & Skip to Level (unlock: tap the version on Home 5×) */}
      {devModeUnlocked && !run && !isWon && (
        <View style={styles.devRow} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.devButton, revealAll && styles.devButtonOn]}
            activeOpacity={0.75}
            onPress={() => {
              revealAllRef.current = !revealAllRef.current;
              setRevealAll(revealAllRef.current);
              drawFrame(Date.now());
            }}
          >
            <MapIcon size={16} color={revealAll ? '#E9A93F' : '#E6EAF0'} strokeWidth={2} />
            <Text style={[styles.devButtonText, revealAll && { color: '#E9A93F' }]}>
              {revealAll ? 'HIDE MAP' : 'SEE MAP'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.devButton}
            activeOpacity={0.75}
            onPress={() => {
              setIsPaused(true);
              setShowDevPicker(true);
            }}
          >
            <FastForward size={16} color="#E6EAF0" fill="#E6EAF0" strokeWidth={1.5} />
            <Text style={styles.devButtonText}>SKIP TO LEVEL</Text>
          </TouchableOpacity>
        </View>
      )}
      {showDevPicker && (
        <DevLevelPicker
          currentLevel={level.id}
          onPick={(id) => {
            setShowDevPicker(false);
            setIsPaused(false);
            if (id === level.id) initLevel();
            else onNextLevel(id);
          }}
          onClose={() => {
            setShowDevPicker(false);
            setIsPaused(false);
          }}
        />
      )}

      {/* 5b. PAUSE MENU */}
      {isPaused && !isWon && !showDevPicker && (
        <PauseOverlay
          levelNumber={level.id}
          levelTitle={level.name}
          levelLabel={run ? `FLOOR ${run.floor}` : undefined}
          onResume={() => setIsPaused(false)}
          onRestart={initLevel}
          onMenu={onExitToMenu}
          onSeeMap={
            devModeUnlocked && !run
              ? () => {
                  revealAllRef.current = !revealAllRef.current;
                  setRevealAll(revealAllRef.current);
                  drawFrame(Date.now());
                }
              : undefined
          }
          onSkipLevel={devModeUnlocked && !run ? () => setShowDevPicker(true) : undefined}
          isMapRevealed={revealAll}
        />
      )}

      {/* 6a. ENDLESS / DAILY run cards */}
      {run && runCard && (
        <RunOverlay
          mode={run.mode}
          kind={runCard.kind}
          floor={runCard.floor}
          floorShards={runCard.floorShards}
          runShards={runCard.runShards}
          best={runCard.best}
          newBest={runCard.newBest}
          onContinue={() => onRunAdvance?.({ ...run, floor: run.floor + 1, shards: runCard.runShards })}
          onRetry={() => onRunRestart?.()}
          onMenu={() => {
            // leaving mid-run (after clearing a floor) still counts the depth reached
            if (runCard.kind === 'cleared') {
              const st = useProgressStore.getState();
              if (run.mode === 'daily') st.recordDailyScore(runDay(run), run.floor);
              else st.recordEndlessScore(run.floor);
            }
            onExitToMenu();
          }}
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
  devRow: {
    position: 'absolute',
    top: 76,
    right: 10,
    flexDirection: 'row',
    gap: 8,
    zIndex: 150,
  },
  devButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 26,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1.2,
    borderColor: 'rgba(150, 162, 180, 0.55)',
    backgroundColor: 'rgba(10, 13, 18, 0.92)',
  },
  devButtonOn: { borderColor: 'rgba(233, 169, 63, 0.8)' },
  devButtonText: { color: '#E6EAF0', fontFamily: UI.font.techBold, fontSize: 11, letterSpacing: 0.8 },
  redStatic: {
    backgroundColor: PALETTE.wraithRed,
    opacity: 0.9,
  },
});
