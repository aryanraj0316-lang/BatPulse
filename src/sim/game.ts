import { ECHO_CONFIG } from '../constants/gameConfig';
import { Body, Box, circleOverlapsBox, resolveCircleBoxes } from './collision';
import { EnemySystem } from './enemy';
import { circleHitsHazard, HazardPose, hazardPose, segmentHitsBox } from './hazards';
import { HintTracker } from './hints';
import { Momentum } from './momentum';
import { applyWaves, RevealState, WaveField } from './reveal';
import { SonarEnergy } from './sonarEnergy';
import { World } from './world';

export type SimEvent =
  | 'restart'
  | 'pulse'
  | 'no_charge'
  | 'wall_hit'
  | 'death'
  | 'finish'
  | 'switch'
  | 'door_open'
  | 'door_close'
  | 'pickup'
  | 'enemy_alert'
  | 'heartbeat'
  | 'checkpoint'
  | 'respawn'
  | 'key' // a key was picked up
  | 'unlock' // a locked door opened
  | 'hide' // the bat entered a safe zone
  | 'expose'; // the safe zone's time ran out: the bat is visible again
export type SimStatus = 'playing' | 'dying' | 'won';
export type FailCause = 'spike' | 'hazard' | 'enemy' | 'escape_wall';

export interface SimParams {
  /** Pulse radius in world units. */
  pulseRadius: number;
  /** Seconds added to wall/spike glow (Vesper). */
  glowBonusSec?: number;
  /** Momentum rate multiplier and cap (Turbo Moth). */
  momentumRateMult?: number;
  momentumMax?: number;
  /** Phantom: how much enemies hear of the bat's pulses (0.5 = half the range). */
  hearingMult?: number;
}

const HALF_PI = Math.PI / 2;

/**
 * The whole rules engine for one level attempt. Pure TypeScript: no React, no timers, no platform code.
 * The host calls `step(dt)` once per frame and forwards input; everything else is deterministic,
 * so the same inputs always produce the same run (this is what the automated level tests rely on).
 * All per-frame state lives in preallocated objects and typed arrays.
 */
export class GameSim {
  readonly body: Body;
  /** Facing direction in radians (0 = right, -PI/2 = up). */
  rotation = -HALF_PI;
  status: SimStatus = 'playing';
  /** Run timer in seconds. Keeps counting through checkpoint respawns (stars are about the whole run). */
  elapsed = 0;
  /**
   * Time as the world sees it: hazards, hunter patrols and the escape wall depend on it. Equals `elapsed` until the
   * bat respawns at a checkpoint, where it rewinds to the moment the checkpoint was reached.
   */
  worldTime = 0;
  /** World time at which hunters start to notice the bat (3 s after every start or respawn). */
  armedAt: number = ECHO_CONFIG.enemy.spawnSafeSec;
  /** Index of the checkpoint the bat will respawn at, -1 when none was reached. */
  lastCheckpoint = -1;
  pulsesUsed = 0;
  /** Seconds of screen shake left. */
  shake = 0;
  /** Increments on every restart so the UI can reset per-attempt visuals. */
  attempt = 0;
  failCause: FailCause | null = null;
  /** Receives gameplay events for audio/haptics/analytics. Must not retain anything. */
  onEvent: ((e: SimEvent) => void) | null = null;

  readonly energy: SonarEnergy;
  readonly momentum: Momentum;
  readonly waves = new WaveField();
  readonly reveal: RevealState;
  readonly hints: HintTracker;

  /** Current pose of every moving hazard (parallel to world.hazards). */
  readonly poses: HazardPose[];
  /** Seconds each door stays open (0 = closed), parallel to world.doors. */
  readonly doorTimer: Float32Array;
  /** 1 once a pickup has been collected this attempt. */
  readonly pickupTaken: Uint8Array;
  /** 1 once a key has been picked up this attempt (parallel to world.keys). */
  readonly keyTaken: Uint8Array;
  /** The bat is inside a safe zone with time left: hunters cannot see, hear or catch it. */
  hidden = false;
  /** Index of the safe zone the bat is hiding in, -1 when not hiding. */
  hiddenZone = -1;
  /** Seconds spent hiding in each zone this stay (parallel to world.safeZones). */
  private readonly zoneStay: Float32Array;
  /** Seconds before each zone can hide the bat again. */
  private readonly zoneCooldown: Float32Array;
  readonly enemies: EnemySystem;
  /** 0..1: how close the nearest hunter is (heartbeat and red screen edge). */
  threat = 0;
  /** Seconds since the last heartbeat, for the edge pulse. */
  beatAge = 99;
  /** Faint rings where recent pulses were made (so a hunter's arrival is explainable). */
  readonly markerX = new Float32Array(4);
  readonly markerY = new Float32Array(4);
  readonly markerAge = new Float32Array(4).fill(Infinity);
  private beatTimer = 0;
  private readonly enemyReveal: number[];

  private inX = 0;
  private inY = 0;
  private deathTimer = 0;
  private checkpointSnap: { worldTime: number; charges: number; doors: Float32Array; pickups: Uint8Array; keys: Uint8Array } | null = null;
  /** Pushes the escape wall back after a respawn so it is never right behind the bat. */
  private wallBias = 0;
  private sincePulse = Infinity;
  private sinceHit = Infinity;
  /** Doors that are currently closed (solid). Rebuilt only when a door opens or closes. */
  private closedDoors: Box[] = [];
  private readonly doorBoxes: Box[];
  private readonly hazardReveal: number[];
  private readonly switchDoors: number[][];

  constructor(
    readonly world: World,
    private params: SimParams,
  ) {
    const def = world.def;
    this.body = { x: def.start.x, y: def.start.y, vx: 0, vy: 0, r: ECHO_CONFIG.player.radius };
    this.energy = new SonarEnergy(def.sonar);
    this.momentum = new Momentum({
      ...ECHO_CONFIG.momentum,
      max: params.momentumMax ?? ECHO_CONFIG.momentum.max,
      rateMult: params.momentumRateMult,
    });
    this.reveal = new RevealState(world.revealables.length);
    this.hints = new HintTracker(def.hints ?? []);

    this.poses = world.hazards.map(() => ({ x: 0, y: 0, angle: 0 }));
    this.doorTimer = new Float32Array(world.doors.length);
    this.pickupTaken = new Uint8Array(world.pickups.length);
    this.keyTaken = new Uint8Array(world.keys.length);
    this.zoneStay = new Float32Array(world.safeZones.length);
    this.zoneCooldown = new Float32Array(world.safeZones.length);
    this.doorBoxes = world.doors.map((d) => ({ x: d.x, y: d.y, width: d.width, height: d.height }));
    this.hazardReveal = world.hazards.map((_, i) => world.revealables.findIndex((r) => r.kind === 'hazard' && r.ref === i));
    this.switchDoors = world.switches.map((_, si) => world.doorSwitch.map((s, di) => (s === si ? di : -1)).filter((d) => d >= 0));
    this.enemyReveal = world.enemies.map((_, i) => world.revealables.findIndex((r) => r.kind === 'enemy' && r.ref === i));
    this.enemies = new EnemySystem(world, { onAlert: () => this.onEvent?.('enemy_alert') });
    this.rebuildClosedDoors();
    this.syncHazards();
    this.syncEnemyBoxes();
  }

  /** Joystick output, already dead-zoned, magnitude 0..1. */
  setInput(x: number, y: number): void {
    this.inX = x;
    this.inY = y;
  }

  setPulseRadius(r: number): void {
    this.params.pulseRadius = r;
  }

  /** 0..1 of the door's open time that is left (1 right after the switch was hit). 0 when closed. */
  doorProgress(i: number): number {
    return Math.min(1, this.doorTimer[i] / ECHO_CONFIG.door.openSec);
  }

  isDoorOpen(i: number): boolean {
    return this.doorTimer[i] > 0;
  }

  /** Number of times a hunter went from calm to hunting this attempt. */
  get alertCount(): number {
    return this.enemies.alertCount;
  }

  /**
   * Completed (so far) with no hunter ever alerted and within the level's pulse limit.
   * Only levels that have hunters can be ghost-run: with nobody to evade there is nothing to be a ghost against.
   */
  get isGhostRun(): boolean {
    return this.world.enemies.length > 0 && this.enemies.alertCount === 0 && this.pulsesUsed <= this.world.def.ghostPulseLimit;
  }

  /** How far a pulse is heard by hunters, in world units. */
  get hearingRadius(): number {
    return this.params.pulseRadius * ECHO_CONFIG.enemy.hearingRadiusMult * (this.params.hearingMult ?? 1);
  }

  /** A switch counts as lit while any of the doors it controls is open. */
  isSwitchLit(si: number): boolean {
    return this.switchDoors[si].some((d) => this.doorTimer[d] > 0);
  }

  /** Fresh attempt. Allowed in every state (during a pulse, during death, ...). */
  restart(): void {
    const def = this.world.def;
    this.body.x = def.start.x;
    this.body.y = def.start.y;
    this.body.vx = 0;
    this.body.vy = 0;
    this.rotation = -HALF_PI;
    this.status = 'playing';
    this.elapsed = 0;
    this.worldTime = 0;
    this.armedAt = ECHO_CONFIG.enemy.spawnSafeSec;
    this.lastCheckpoint = -1;
    this.checkpointSnap = null;
    this.wallBias = 0;
    this.pulsesUsed = 0;
    this.shake = 0;
    this.deathTimer = 0;
    this.sincePulse = Infinity;
    this.sinceHit = Infinity;
    this.failCause = null;
    this.energy.reset();
    this.momentum.reset();
    this.waves.clear();
    this.reveal.clear();
    this.hints.reset();
    this.doorTimer.fill(0);
    this.pickupTaken.fill(0);
    this.keyTaken.fill(0);
    this.resetSafeZones();
    this.enemies.reset();
    this.threat = 0;
    this.beatAge = 99;
    this.beatTimer = 0;
    this.markerAge.fill(Infinity);
    this.rebuildClosedDoors();
    this.syncHazards();
    this.syncEnemyBoxes();
    this.attempt++;
    this.onEvent?.('restart');
  }

  /** Emits a pulse if a charge is available. Returns true when a wave was started. */
  firePulse(): boolean {
    if (this.status !== 'playing') return false;
    if (this.sincePulse < ECHO_CONFIG.sonar.minTapGapMs / 1000) return false;
    if (!this.energy.tryUse()) {
      this.onEvent?.('no_charge');
      return false;
    }
    this.sincePulse = 0;
    this.pulsesUsed++;
    this.waves.spawn(this.body.x, this.body.y, this.params.pulseRadius);
    // a pulse made from inside a safe zone is not heard: that is what makes it a refuge
    if (this.world.enemies.length > 0 && !this.hidden) {
      this.addMarker(this.body.x, this.body.y);
      // hunters hear pulses inside 1.2x the pulse radius, but not during the spawn safe window
      if (this.worldTime >= this.armedAt) this.enemies.hear(this.body.x, this.body.y, this.hearingRadius, this.closedDoors);
    }
    this.hints.onPulse();
    this.onEvent?.('pulse');
    return true;
  }

  step(rawDt: number): void {
    const dt = Math.min(rawDt, ECHO_CONFIG.world.maxDt);
    if (!(dt > 0)) return;

    // waves and glow keep animating in every state so a death or win does not freeze the picture
    this.waves.update(dt);
    this.syncHazards();
    applyWaves(this.waves, this.world.revealables, this.reveal, this.params.glowBonusSec ?? 0);
    this.hitSwitches();
    this.reveal.update(dt);
    for (let i = 0; i < this.markerAge.length; i++) this.markerAge[i] += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);

    if (this.status === 'dying') {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.respawn();
      return;
    }
    if (this.status === 'won') return;

    this.elapsed += dt;
    this.worldTime += dt;
    this.sincePulse += dt;
    this.sinceHit += dt;
    this.energy.update(dt);
    this.hints.update(dt);
    this.updateDoors(dt);
    this.unlockDoors();

    this.move(dt);

    const cfg = ECHO_CONFIG;
    const b = this.body;
    const speed = Math.hypot(b.vx, b.vy);
    this.momentum.update(dt, speed > cfg.momentum.movingSpeed);
    if (speed > cfg.momentum.movingSpeed) this.hints.onMoved();

    this.collectPickups();
    this.collectKeys();
    this.updateCheckpoints();
    this.updateSafeZones(dt);
    if (this.stepEnemies(dt)) return;
    this.updateThreat(dt);
    // the escape wall kills on touch
    if (this.world.def.escape.enabled && this.body.y + this.body.r >= this.escapeWallY) {
      this.die('escape_wall');
      return;
    }

    // spikes kill (hitbox slightly smaller than drawn, see config)
    const spikes = this.world.spikes;
    for (let i = 0; i < spikes.length; i++) {
      if (circleOverlapsBox(b.x, b.y, b.r, spikes[i], cfg.hazards.spikeForgiveness)) {
        this.die('spike');
        return;
      }
    }
    // moving hazards kill
    const hz = this.world.hazards;
    for (let i = 0; i < hz.length; i++) {
      if (circleHitsHazard(hz[i], this.poses[i], b.x, b.y, b.r)) {
        this.die('hazard');
        return;
      }
    }

    // finish ring
    const f = this.world.finish;
    if (Math.hypot(b.x - f.x, b.y - f.y) < f.radius) {
      this.status = 'won';
      b.vx = 0;
      b.vy = 0;
      this.onEvent?.('finish');
    }
  }

  /** Puts every moving hazard where it is at the current attempt time and moves its reveal box with it. */
  private syncHazards() {
    const hz = this.world.hazards;
    for (let i = 0; i < hz.length; i++) {
      const p = hazardPose(hz[i], this.worldTime, this.poses[i]);
      const r = this.world.revealables[this.hazardReveal[i]];
      if (r) {
        r.x = p.x;
        r.y = p.y;
      }
    }
  }

  /** Moves each hunter's reveal box to where the hunter is. */
  private syncEnemyBoxes() {
    const en = this.enemies.enemies;
    for (let i = 0; i < en.length; i++) {
      const r = this.world.revealables[this.enemyReveal[i]];
      if (r) {
        r.x = en[i].body.x - ECHO_CONFIG.enemy.radius;
        r.y = en[i].body.y - ECHO_CONFIG.enemy.radius;
      }
    }
  }

  private addMarker(x: number, y: number) {
    // reuse the oldest slot
    let slot = 0;
    for (let i = 1; i < this.markerAge.length; i++) if (this.markerAge[i] > this.markerAge[slot]) slot = i;
    this.markerX[slot] = x;
    this.markerY[slot] = y;
    this.markerAge[slot] = 0;
  }

  /** Moves the hunters. Returns true when the bat was caught. */
  private stepEnemies(dt: number): boolean {
    if (this.world.enemies.length === 0) return false;
    const b = this.body;
    const armed = this.worldTime >= this.armedAt;
    const caught = this.enemies.update(dt, b.x, b.y, b.r, armed, this.closedDoors, this.world.solids);
    this.syncEnemyBoxes();
    if (caught) {
      this.die('enemy');
      return true;
    }
    return false;
  }

  /**
   * Heartbeat and red screen edge: from the nearest hunter (inside ~5 tiles) or the escape wall (inside its
   * warning range). The closer the danger, the stronger the edge and the faster the beat.
   */
  private updateThreat(dt: number) {
    const cfg = ECHO_CONFIG.enemy;
    const range = cfg.threatRadiusTiles * cfg.tileSize;
    let threat = this.world.enemies.length > 0 ? Math.max(0, 1 - this.enemies.nearest / range) : 0;
    if (this.world.def.escape.enabled) {
      const gap = this.escapeWallY - (this.body.y + this.body.r);
      threat = Math.max(threat, Math.max(0, 1 - gap / ECHO_CONFIG.escape.warnRange));
    }
    this.threat = Math.min(1, threat);
    this.beatAge += dt;
    if (this.threat > 0) {
      this.beatTimer += dt;
      const interval = cfg.heartbeatSlowSec + (cfg.heartbeatFastSec - cfg.heartbeatSlowSec) * this.threat;
      if (this.beatTimer >= interval) {
        this.beatTimer = 0;
        this.beatAge = 0;
        this.onEvent?.('heartbeat');
      }
    } else {
      this.beatTimer = 0;
    }
  }

  /** y of the front of the escape wall (the wall fills everything below it). Infinity when the level has none. */
  get escapeWallY(): number {
    const e = this.world.def.escape;
    if (!e.enabled) return Infinity;
    return this.world.def.start.y + (e.startGap ?? ECHO_CONFIG.escape.defaultStartGap) - e.wallSpeed * this.worldTime + this.wallBias;
  }

  /** Touching a checkpoint saves it: a death returns the bat here with the world as it was at that moment. */
  private updateCheckpoints() {
    const cps = this.world.def.checkpoints;
    for (let i = 0; i < cps.length; i++) {
      if (i === this.lastCheckpoint) continue;
      if (Math.hypot(cps[i].x - this.body.x, cps[i].y - this.body.y) > ECHO_CONFIG.checkpoint.radius) continue;
      this.lastCheckpoint = i;
      this.checkpointSnap = {
        worldTime: this.worldTime,
        charges: this.energy.charges,
        doors: this.doorTimer.slice(),
        pickups: this.pickupTaken.slice(),
        keys: this.keyTaken.slice(),
      };
      this.onEvent?.('checkpoint');
    }
  }

  /**
   * Returns the bat to the last checkpoint (or restarts the level when none was reached).
   * Everything is put back as it was when the checkpoint was reached: world time (hazards, hunter patrols, the wall),
   * doors, pickups and sonar charges. The run timer keeps counting and the hunters get a fresh 3 s safe window.
   */
  respawn(): void {
    const snap = this.checkpointSnap;
    const cp = snap ? this.world.def.checkpoints[this.lastCheckpoint] : null;
    if (!snap || !cp) {
      this.restart();
      return;
    }
    const b = this.body;
    b.x = cp.x;
    b.y = cp.y;
    b.vx = 0;
    b.vy = 0;
    this.rotation = -HALF_PI;
    this.status = 'playing';
    this.failCause = null;
    this.shake = 0;
    this.deathTimer = 0;
    this.sincePulse = Infinity;
    this.sinceHit = Infinity;
    this.worldTime = snap.worldTime;
    this.armedAt = snap.worldTime + ECHO_CONFIG.enemy.spawnSafeSec;
    this.energy.restore(snap.charges);
    this.momentum.reset();
    this.waves.clear();
    this.reveal.clear();
    this.doorTimer.set(snap.doors);
    this.pickupTaken.set(snap.pickups);
    this.keyTaken.set(snap.keys);
    this.resetSafeZones();
    this.enemies.reset(snap.worldTime, true);
    this.markerAge.fill(Infinity);
    this.threat = 0;
    this.beatAge = 99;
    this.beatTimer = 0;
    // never respawn with the wall right behind the bat
    const e = this.world.def.escape;
    if (e.enabled) {
      this.wallBias = 0;
      const natural = this.escapeWallY;
      this.wallBias = Math.max(0, b.y + ECHO_CONFIG.escape.respawnGap - natural);
    }
    this.rebuildClosedDoors();
    this.syncHazards();
    this.syncEnemyBoxes();
    this.attempt++;
    this.onEvent?.('respawn');
  }

  private rebuildClosedDoors() {
    this.closedDoors = this.doorBoxes.filter((_, i) => this.doorTimer[i] <= 0);
  }

  /**
   * A pulse that reaches a switch with a clear line of sight lights it and opens its doors for `door.openSec`.
   * Hitting it again while open restarts the countdown.
   */
  private hitSwitches() {
    const sw = this.world.switches;
    if (sw.length === 0) return;
    const waves = this.waves;
    for (let w = 0; w < waves.size; w++) {
      if (!waves.active[w]) continue;
      const prev = waves.prevRadius[w];
      const cur = waves.radius[w];
      if (cur <= prev) continue;
      const ox = waves.ox[w];
      const oy = waves.oy[w];
      for (let s = 0; s < sw.length; s++) {
        const d = Math.hypot(sw[s].x - ox, sw[s].y - oy);
        if (d <= prev || d > cur || d > waves.maxRadius[w]) continue;
        if (ECHO_CONFIG.door.switchLosEnabled && this.lineBlocked(ox, oy, sw[s].x, sw[s].y)) continue;
        this.activateSwitch(s);
      }
    }
  }

  private lineBlocked(ax: number, ay: number, bx: number, by: number): boolean {
    const solids = this.world.solids;
    for (let i = 0; i < solids.length; i++) if (segmentHitsBox(ax, ay, bx, by, solids[i])) return true;
    for (let i = 0; i < this.closedDoors.length; i++) if (segmentHitsBox(ax, ay, bx, by, this.closedDoors[i])) return true;
    return false;
  }

  private activateSwitch(s: number) {
    const doors = this.switchDoors[s];
    let opened = false;
    for (let k = 0; k < doors.length; k++) {
      if (this.doorTimer[doors[k]] <= 0) opened = true;
      this.doorTimer[doors[k]] = ECHO_CONFIG.door.openSec;
    }
    if (opened) this.rebuildClosedDoors();
    // the click carries: hunters nearby come to investigate (a way to draw them off)
    if (this.world.enemies.length > 0 && this.worldTime >= this.armedAt) {
      const sw = this.world.switches[s];
      this.enemies.hear(sw.x, sw.y, ECHO_CONFIG.enemy.switchNoiseRadius, this.closedDoors);
    }
    this.onEvent?.('switch');
    if (opened) this.onEvent?.('door_open');
  }

  /**
   * Counts the open timers down. A door never closes on top of the bat: it stays open until the bat has
   * left it, so a closing door can never crush or trap the player.
   */
  private updateDoors(dt: number) {
    let closed = false;
    for (let i = 0; i < this.doorTimer.length; i++) {
      if (this.doorTimer[i] <= 0) continue;
      this.doorTimer[i] -= dt;
      if (this.doorTimer[i] <= 0) {
        if (circleOverlapsBox(this.body.x, this.body.y, this.body.r + 2, this.doorBoxes[i])) {
          this.doorTimer[i] = 1e-4; // hold open until the bat is clear
        } else {
          this.doorTimer[i] = 0;
          closed = true;
        }
      }
    }
    if (closed) {
      this.rebuildClosedDoors();
      this.onEvent?.('door_close');
    }
  }

  /** True while the bat carries a key whose door is still locked (shown in the HUD). */
  get hasKey(): boolean {
    const dk = this.world.doorKey;
    for (let i = 0; i < dk.length; i++) if (dk[i] >= 0 && this.keyTaken[dk[i]] && this.doorTimer[i] <= 0) return true;
    return false;
  }

  /** 0..1: how much of the current stay in a safe zone is left (0 when not hiding). */
  get hideLeft(): number {
    return this.hidden ? Math.max(0, 1 - this.zoneStay[this.hiddenZone] / ECHO_CONFIG.safeZone.maxHideSec) : 0;
  }

  /** Seconds before zone `i` can hide the bat again (0 = ready). */
  zoneCooldownLeft(i: number): number {
    return this.zoneCooldown[i];
  }

  /** Picks keys up by touch. A key is hidden until a pulse lights it, but it can be found by flying over it. */
  private collectKeys() {
    const ks = this.world.keys;
    const reach = this.body.r + ECHO_CONFIG.key.radius;
    for (let i = 0; i < ks.length; i++) {
      if (this.keyTaken[i]) continue;
      if (Math.hypot(ks[i].x - this.body.x, ks[i].y - this.body.y) > reach) continue;
      this.keyTaken[i] = 1;
      this.onEvent?.('key');
    }
  }

  /**
   * A locked door opens for good as the bat reaches it with its key. Checked just before the bat moves, so the door is
   * already open when the bat gets there and never bumps into it.
   */
  private unlockDoors() {
    const dk = this.world.doorKey;
    let opened = false;
    for (let i = 0; i < dk.length; i++) {
      if (dk[i] < 0 || !this.keyTaken[dk[i]] || this.doorTimer[i] > 0) continue;
      if (!circleOverlapsBox(this.body.x, this.body.y, this.body.r + ECHO_CONFIG.key.unlockMargin, this.doorBoxes[i])) continue;
      this.doorTimer[i] = Infinity; // never closes again
      opened = true;
    }
    if (opened) {
      this.rebuildClosedDoors();
      this.onEvent?.('unlock');
    }
  }

  private resetSafeZones() {
    this.zoneStay.fill(0);
    this.zoneCooldown.fill(0);
    this.hidden = false;
    this.hiddenZone = -1;
    this.enemies.playerHidden = false;
    this.energy.endRest();
  }

  /**
   * Safe zones: while the bat is inside one (and it is ready) the bat is hidden, hunters lose it, and the sonar refills
   * one charge every few seconds. A stay lasts at most `maxHideSec`; when it runs out (or the bat leaves) the zone needs
   * a cool-down before it hides the bat again.
   */
  private updateSafeZones(dt: number) {
    const zones = this.world.safeZones;
    if (zones.length === 0) return;
    const cfg = ECHO_CONFIG.safeZone;
    for (let i = 0; i < zones.length; i++) if (this.zoneCooldown[i] > 0) this.zoneCooldown[i] = Math.max(0, this.zoneCooldown[i] - dt);

    let inside = -1;
    const b = this.body;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (b.x >= z.x && b.x <= z.x + z.width && b.y >= z.y && b.y <= z.y + z.height) {
        inside = i;
        break;
      }
    }

    if (this.hidden && inside !== this.hiddenZone) {
      // left the zone on purpose
      this.zoneCooldown[this.hiddenZone] = cfg.leaveCooldownSec;
      this.zoneStay[this.hiddenZone] = 0;
      this.hidden = false;
      this.hiddenZone = -1;
      this.energy.endRest();
    }
    if (inside >= 0 && this.zoneCooldown[inside] <= 0) {
      if (!this.hidden) {
        this.hidden = true;
        this.hiddenZone = inside;
        this.zoneStay[inside] = 0;
        this.onEvent?.('hide');
      }
      this.zoneStay[inside] += dt;
      this.energy.rest(dt, cfg.refillSecPerCharge);
      if (this.zoneStay[inside] >= cfg.maxHideSec) {
        // time is up: visible again, and this zone needs a long rest
        this.zoneCooldown[inside] = cfg.expireCooldownSec;
        this.zoneStay[inside] = 0;
        this.hidden = false;
        this.hiddenZone = -1;
        this.energy.endRest();
        this.onEvent?.('expose');
      }
    }
    this.enemies.playerHidden = this.hidden;
  }

  private collectPickups() {
    const pk = this.world.pickups;
    const reach = this.body.r + ECHO_CONFIG.pickup.radius;
    for (let i = 0; i < pk.length; i++) {
      if (this.pickupTaken[i]) continue;
      if (Math.hypot(pk[i].x - this.body.x, pk[i].y - this.body.y) > reach) continue;
      // a pickup is only used up when it actually refills something
      if (this.energy.add(1) > 0) {
        this.pickupTaken[i] = 1;
        this.onEvent?.('pickup');
      }
    }
  }

  private move(dt: number) {
    const cfg = ECHO_CONFIG.player;
    const b = this.body;
    const mag = Math.hypot(this.inX, this.inY);

    // Velocity eases towards the stick target. Because the direction of velocity changes gradually,
    // the bat sweeps through turns on an arc (its turning radius grows with speed).
    const k = mag > 0 ? cfg.acceleration : cfg.deceleration;
    const a = 1 - Math.exp(-k * dt);
    b.vx += (this.inX * cfg.speed - b.vx) * a;
    b.vy += (this.inY * cfg.speed - b.vy) * a;

    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 15) {
      let diff = Math.atan2(b.vy, b.vx) - this.rotation;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.rotation += diff * (1 - Math.exp(-cfg.turnSpeed * dt));
    }

    // sub-steps keep fast bats from tunnelling through thin walls
    const dist = speed * dt;
    const n = Math.max(1, Math.ceil(dist / (b.r * 0.5)));
    const sdt = dt / n;
    let impact = 0;
    for (let s = 0; s < n; s++) {
      b.x += b.vx * sdt;
      b.y += b.vy * sdt;
      const hit = resolveCircleBoxes(b, this.world.solids);
      if (hit > impact) impact = hit;
      if (this.closedDoors.length > 0) {
        const dhit = resolveCircleBoxes(b, this.closedDoors);
        if (dhit > impact) impact = dhit;
      }
    }

    // never leave the level, even if a level file forgot its outer walls
    const def = this.world.def;
    if (b.x < b.r) {
      b.x = b.r;
      if (b.vx < 0) b.vx = 0;
    } else if (b.x > def.width - b.r) {
      b.x = def.width - b.r;
      if (b.vx > 0) b.vx = 0;
    }
    if (b.y < b.r) {
      b.y = b.r;
      if (b.vy < 0) b.vy = 0;
    } else if (b.y > def.height - b.r) {
      b.y = def.height - b.r;
      if (b.vy > 0) b.vy = 0;
    }

    const mom = ECHO_CONFIG.momentum;
    if (impact > mom.hitSpeedThreshold) {
      this.momentum.onWallHit();
      if (this.sinceHit >= mom.hitCooldownSec) {
        this.sinceHit = 0;
        this.onEvent?.('wall_hit');
      }
    }
  }

  private die(cause: FailCause) {
    this.status = 'dying';
    this.failCause = cause;
    this.shake = ECHO_CONFIG.death.shakeSec;
    // being caught shows the fail screen (the player chooses to retry); other deaths restart by themselves
    this.deathTimer = cause === 'enemy' ? Infinity : ECHO_CONFIG.death.restartDelaySec;
    this.body.vx = 0;
    this.body.vy = 0;
    this.onEvent?.('death');
  }
}
