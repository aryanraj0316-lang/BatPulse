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
import { PauseOverlay } from '../components/PauseOverlay';
import { DevLevelPicker } from '../components/DevLevelPicker';
import { ResultCard } from '../components/ResultCard';

interface GameScreenProps {
  levelId: number;
  onExitToMenu: () => void;
  onNextLevel: (nextLevelId: number) => void;
}

const { width: SW, height: SH } = Dimensions.get('window');
const JOY_RADIUS = 50;
const TAP_MAX_MS = 260; // a touch shorter than this that barely moves = sonar tap
const TAP_MAX_MOVE = 12; // px a finger may wander and still count as a tap
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
      reload: reloadingRef.current ? Math.floor((reloadMsRef.current / GAME_CONFIG.SONAR_RELOAD_MS) * 20) / 20 : -1,
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

  // Joystick (drawn by the Skia canvas; rests in the bottom-right corner)
  const joyRef = useRef<JoystickState>(restingJoystick());
  // Active touches: which one steers, and which are still candidate taps
  const touchesRef = useRef(new Map<number, { x0: number; y0: number; t0: number; steering: boolean }>());

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
      HunterAI.create(h.anchor, h.speedMultiplier, buildNavGrid(level, SW, SH, level.objects))
    );
    wavesRef.current = [];
    revealsRef.current = [];
    sparksRef.current = [];
    dustRef.current = dust;
    inputRef.current = { x: 0, y: 0 };
    sonarLeftRef.current = level.sonar.allowance;
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
    setIsRedStatic(false);
    joyRef.current = restingJoystick();
    touchesRef.current.clear();
    syncHud(true);
  }, [level]);

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
    setTimeout(() => initLevel(), 250);
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
      },
    ];
    AudioEngine.playSonarPulse(soundEnabled);
    HapticEngine.ping(hapticsEnabled);
  }, [level, sonarRadius, hasPiercing, soundEnabled, hapticsEnabled]);

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
      touchesRef.current.set(id, { x0: tch.pageX, y0: tch.pageY, t0: Date.now(), steering: false });
    }
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
        // This finger becomes the floating joystick, centred where it first touched
        tr.steering = true;
        someoneSteering = true;
        joyRef.current.center = { x: tr.x0, y: tr.y0 };
        joyRef.current.active = true;
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
      ghostTrack: existingRecord?.ghostTrack,
      isHunting: wraithsRef.current.some((w) => w.state === 'HUNTING' || w.state === 'FRENZY'),
      joystick: joyRef.current,
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
      const mv = MovementSystem.updatePlayer(p, inputRef.current, hasWhisperStep, dt, now);

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
      if (CollisionSystem.checkShardCollection(p.pos, p.radius, objectsRef.current)) {
        pickupAtRef.current = now; // visual reaction only
        sonarLeftRef.current = Math.min(level.sonar.allowance, sonarLeftRef.current + 1);
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
      if (level.sonar.allowance < 999) {
        if (sonarLeftRef.current <= GAME_CONFIG.SONAR_RELOAD_BELOW) reloadingRef.current = true;
        if (reloadingRef.current) {
          reloadMsRef.current += dt * 1000;
          if (reloadMsRef.current >= GAME_CONFIG.SONAR_RELOAD_MS) {
            reloadMsRef.current = 0;
            sonarLeftRef.current = Math.min(level.sonar.allowance, sonarLeftRef.current + 1);
            AudioEngine.playShardChime(soundEnabled);
          }
          if (sonarLeftRef.current >= level.sonar.allowance) {
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

        // pulses actually fired (the reload means "allowance − left" is no longer the count)
        const used = level.sonar.allowance >= 999 ? 1 : Math.max(1, pulsesFiredRef.current);
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
        GAME_CONFIG.SONAR_EXPAND_DURATION * 1000 + GAME_CONFIG.REVEAL_HOLD_MS + GAME_CONFIG.REVEAL_FADE_MS;
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
  ]);


  return (
    <View style={[styles.container, isRedStatic && styles.redStatic]}>
      {/* 1. GPU GAME CANVAS (Skia) — also draws the floating joystick */}
      <GameCanvas ref={canvasRef} level={level} worldWidth={SW} worldHeight={SH} />

      {/* 2. WHOLE-SCREEN TOUCH: tap anywhere = sonar, drag = joystick */}
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

      {/* 4. HEADS-UP DISPLAY */}
      <HUD
        levelTitle={level.name}
        levelNumber={level.id}
        sonarRemaining={hud.sonar}
        maxSonar={level.sonar.allowance}
        elapsedSeconds={hud.elapsed}
        momentum={hud.momentum}
        isFrenzy={hud.frenzy}
        onPause={() => setIsPaused((prev) => !prev)}
        onRestart={initLevel}
        reloadProgress={hud.reload}
        keyState={hud.keyState}
      />

      {/* 5a. See Map & Skip to Level buttons */}
      {!isWon && (
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
            <Text style={[styles.devButtonText, revealAll && { color: '#04121A' }]}>
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
          onResume={() => setIsPaused(false)}
          onRestart={initLevel}
          onMenu={onExitToMenu}
          onSeeMap={() => {
            revealAllRef.current = !revealAllRef.current;
            setRevealAll(revealAllRef.current);
            drawFrame(Date.now());
          }}
          onSkipLevel={() => setShowDevPicker(true)}
          isMapRevealed={revealAll}
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
    top: 84,
    right: 14,
    flexDirection: 'row',
    gap: 8,
    zIndex: 150,
  },
  devButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 194, 74, 0.6)',
    backgroundColor: 'rgba(20, 14, 4, 0.85)',
  },
  devButtonOn: { backgroundColor: '#FFC24A', borderColor: '#FFC24A' },
  devButtonText: { color: '#FFC24A', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  redStatic: {
    backgroundColor: PALETTE.wraithRed,
    opacity: 0.9,
  },
});
