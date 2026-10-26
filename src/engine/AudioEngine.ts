import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Vec2, WraithEntity } from '../types/game';

/**
 * Game audio (iOS, Android and web) on expo-audio.
 * Sounds are pre-rendered WAVs in assets/sounds (made by scripts/sfx/generate-sounds.mjs).
 *
 * Low-latency rules:
 *  - Every player is created up front (`preload`) so nothing loads at the moment a sound fires.
 *  - A one-shot player is rewound in the background right after it finishes, so the next
 *    `play()` starts instantly (no seek on the hot path).
 *  - Loop volumes are pushed to the native side at most ~10 times a second.
 * Directional sounds pick a left / centre / right rendering (expo-audio has no live pan).
 */

const SRC = {
  sonar: require('../../assets/sounds/sonar_ping.wav'),
  bump: require('../../assets/sounds/wall_bump.wav'),
  orb: require('../../assets/sounds/orb_pickup.wav'),
  alert: require('../../assets/sounds/wraith_alert.wav'),
  death: require('../../assets/sounds/death.wav'),
  complete: require('../../assets/sounds/level_complete.wav'),
  echo: {
    a: { l: require('../../assets/sounds/echo_a_l.wav'), c: require('../../assets/sounds/echo_a_c.wav'), r: require('../../assets/sounds/echo_a_r.wav') },
    b: { l: require('../../assets/sounds/echo_b_l.wav'), c: require('../../assets/sounds/echo_b_c.wav'), r: require('../../assets/sounds/echo_b_r.wav') },
    c: { l: require('../../assets/sounds/echo_c_l.wav'), c: require('../../assets/sounds/echo_c_c.wav'), r: require('../../assets/sounds/echo_c_r.wav') },
  },
  ambience: require('../../assets/sounds/cave_ambience.wav'),
  flutter: require('../../assets/sounds/flutter_loop.wav'),
  growlL: require('../../assets/sounds/wraith_growl_l.wav'),
  growlR: require('../../assets/sounds/wraith_growl_r.wav'),
};

// Mix levels (0..1) — the single place to balance the soundtrack
const MIX = {
  sonar: 0.85,
  echo: 0.55,
  bump: 0.6,
  orb: 0.8,
  alert: 0.9,
  death: 1.0,
  complete: 0.85,
  ambience: 0.38,
  flutter: 0.32,
  growl: 0.75,
};

/** A few players for one sound, so quick repeats overlap instead of cutting each other off. */
class Pool {
  private players: AudioPlayer[] = [];
  private busyUntil: number[] = [];
  private rearm: (ReturnType<typeof setTimeout> | null)[] = [];
  private next = 0;
  constructor(private source: number, private size: number, private durationMs: number) {}

  preload() {
    while (this.players.length < this.size) {
      try {
        this.players.push(createAudioPlayer(this.source));
        this.busyUntil.push(0);
        this.rearm.push(null);
      } catch {
        return;
      }
    }
  }

  play(volume: number) {
    this.preload();
    if (!this.players.length) return;
    const now = Date.now();
    // prefer a free player; otherwise take the oldest
    let idx = -1;
    for (let k = 0; k < this.players.length; k++) {
      const i = (this.next + k) % this.players.length;
      if (this.busyUntil[i] <= now) {
        idx = i;
        break;
      }
    }
    if (idx < 0) idx = this.next % this.players.length;
    this.next = idx + 1;
    const p = this.players[idx];
    try {
      if (this.busyUntil[idx] > now) p.seekTo(0); // stealing a sounding player: restart it
      if (this.rearm[idx]) clearTimeout(this.rearm[idx]!);
      p.volume = Math.max(0, Math.min(1, volume));
      p.play();
      this.busyUntil[idx] = now + this.durationMs;
      // rewind in the background once finished, ready for an instant next play
      this.rearm[idx] = setTimeout(() => {
        try {
          p.pause();
          p.seekTo(0);
        } catch {}
        this.rearm[idx] = null;
      }, this.durationMs + 40);
    } catch {
      // never let audio break the game
    }
  }

  /** Stop anything still sounding and rewind (players stay loaded). */
  silence() {
    this.players.forEach((p, i) => {
      if (this.rearm[i]) clearTimeout(this.rearm[i]!);
      this.rearm[i] = null;
      if (this.busyUntil[i] > Date.now()) {
        try {
          p.pause();
          p.seekTo(0);
        } catch {}
      }
      this.busyUntil[i] = 0;
    });
  }

  release() {
    this.silence();
    for (const p of this.players) {
      try {
        p.pause();
        p.remove();
      } catch {}
    }
    this.players = [];
    this.busyUntil = [];
    this.rearm = [];
  }
}

/** A looping bed whose volume is steered every frame (pushed natively ~10×/s). */
class Loop {
  private player: AudioPlayer | null = null;
  private current = 0;
  private sent = -1;
  private lastSend = 0;
  private playing = false;
  constructor(private source: number) {}

  preload() {
    if (this.player) return;
    try {
      this.player = createAudioPlayer(this.source);
      this.player.loop = true;
      this.player.volume = 0;
      this.sent = 0;
    } catch {}
  }

  set(target: number) {
    this.preload();
    if (!this.player) return;
    this.current += (target - this.current) * 0.12; // ease, no zipper noise
    if (target === 0 && this.current < 0.01) this.current = 0;
    const now = Date.now();
    const due = now - this.lastSend > 100 || (this.current === 0 && this.sent !== 0);
    if (!due) return;
    // Also re-check that a loop that should be audible really is playing
    // (e.g. browsers refuse play() until the first tap — retry instead of giving up).
    const stalled = this.current > 0 && !this.player.playing;
    if (!stalled && Math.abs(this.current - this.sent) < 0.01) return;
    this.lastSend = now;
    try {
      this.player.volume = this.current;
      this.sent = this.current;
      if (this.current > 0 && (!this.playing || stalled)) {
        this.player.play();
        this.playing = true;
      } else if (this.current === 0 && this.playing) {
        this.player.pause();
        this.playing = false;
      }
    } catch {}
  }

  stop() {
    if (!this.playing && this.sent === 0) return; // already silent (called every paused frame)
    try {
      this.player?.pause();
      if (this.player) this.player.volume = 0;
    } catch {}
    this.playing = false;
    this.current = 0;
    this.sent = 0;
  }

  release() {
    this.stop();
    try {
      this.player?.pause();
      this.player?.remove();
    } catch {}
    this.player = null;
  }
}

class GameAudio {
  private modeSet = false;
  private pools = {
    sonar: new Pool(SRC.sonar, 3, 2200),
    bump: new Pool(SRC.bump, 2, 500),
    orb: new Pool(SRC.orb, 2, 2000),
    alert: new Pool(SRC.alert, 2, 2400),
    death: new Pool(SRC.death, 1, 2200),
    complete: new Pool(SRC.complete, 1, 3600),
    echo_a_l: new Pool(SRC.echo.a.l, 2, 600),
    echo_a_c: new Pool(SRC.echo.a.c, 2, 600),
    echo_a_r: new Pool(SRC.echo.a.r, 2, 600),
    echo_b_l: new Pool(SRC.echo.b.l, 2, 600),
    echo_b_c: new Pool(SRC.echo.b.c, 2, 600),
    echo_b_r: new Pool(SRC.echo.b.r, 2, 600),
    echo_c_l: new Pool(SRC.echo.c.l, 2, 600),
    echo_c_c: new Pool(SRC.echo.c.c, 2, 600),
    echo_c_r: new Pool(SRC.echo.c.r, 2, 600),
  };
  private ambience = new Loop(SRC.ambience);
  private flutter = new Loop(SRC.flutter);
  private growlL = new Loop(SRC.growlL);
  private growlR = new Loop(SRC.growlR);
  private echoTimers: ReturnType<typeof setTimeout>[] = [];
  private lastBump = 0;
  private lastEcho = 0;
  private lastAlert = 0;

  private mode() {
    if (this.modeSet) return;
    this.modeSet = true;
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => {});
  }

  /** Create every player now (call when a level starts) so no sound loads mid-game. */
  preload() {
    this.mode();
    Object.values(this.pools).forEach((p) => p.preload());
    this.ambience.preload();
    this.flutter.preload();
    this.growlL.preload();
    this.growlR.preload();
  }

  // ── One-shots ────────────────────────────────────────────────
  playSonarPulse(enabled = true) {
    if (!enabled) return;
    this.mode();
    this.pools.sonar.play(MIX.sonar);
  }

  /** Small ping off a wall/object, from its direction, slightly delayed by distance. */
  playReturnEcho(impactPos: Vec2, playerPos: Vec2, distance: number, enabled = true) {
    if (!enabled) return;
    const now = Date.now();
    if (now - this.lastEcho < 55) return;
    this.lastEcho = now;
    const dx = impactPos.x - playerPos.x;
    const side = dx < -40 ? 'l' : dx > 40 ? 'r' : 'c';
    const pitch = (['a', 'b', 'c'] as const)[Math.floor(Math.random() * 3)];
    const volume = MIX.echo * Math.max(0.35, 1 - distance / 320);
    const pool = this.pools[`echo_${pitch}_${side}` as keyof GameAudio['pools']];
    const delay = Math.min(160, distance * 0.6);
    const timer = setTimeout(() => {
      this.echoTimers = this.echoTimers.filter((t) => t !== timer);
      pool.play(volume);
    }, delay);
    this.echoTimers.push(timer);
  }

  playShardChime(enabled = true) {
    if (!enabled) return;
    this.pools.orb.play(MIX.orb);
  }

  playCollisionThud(enabled = true) {
    if (!enabled) return;
    const now = Date.now();
    if (now - this.lastBump < 260) return;
    this.lastBump = now;
    this.pools.bump.play(MIX.bump);
  }

  playWraithAlert(enabled = true) {
    if (!enabled) return;
    const now = Date.now();
    if (now - this.lastAlert < 700) return;
    this.lastAlert = now;
    this.pools.alert.play(MIX.alert);
  }

  playDeath(enabled = true) {
    if (!enabled) return;
    this.pools.death.play(MIX.death);
  }

  playLevelComplete(enabled = true) {
    if (!enabled) return;
    this.pools.complete.play(MIX.complete);
  }

  // ── Loops (call every frame while playing) ───────────────────
  updateLoops(opts: { enabled: boolean; playerPos: Vec2; playerSpeed: number; maxSpeed: number; wraiths: WraithEntity[] }) {
    const { enabled, playerPos, playerSpeed, maxSpeed, wraiths } = opts;
    if (!enabled) {
      this.stopLoops();
      return;
    }
    this.ambience.set(MIX.ambience);
    this.flutter.set(MIX.flutter * Math.min(1, playerSpeed / maxSpeed) ** 0.8);

    let best: WraithEntity | null = null;
    let bestD = Infinity;
    for (const w of wraiths) {
      if (w.state === 'DORMANT') continue;
      const d = Math.hypot(w.pos.x - playerPos.x, w.pos.y - playerPos.y);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    if (!best) {
      this.growlL.set(0);
      this.growlR.set(0);
      return;
    }
    const near = Math.max(0, 1 - bestD / 380) ** 1.4;
    const vol = MIX.growl * near * (best.state === 'FRENZY' ? 1 : 0.65);
    const pan = Math.max(-1, Math.min(1, (best.pos.x - playerPos.x) / 200));
    const a = ((pan + 1) * Math.PI) / 4; // equal-power between the left and right renderings
    this.growlL.set(vol * Math.cos(a));
    this.growlR.set(vol * Math.sin(a));
  }

  /** Silence the loops (pause menu, win screen). One-shots keep ringing out. */
  stopLoops() {
    this.ambience.stop();
    this.flutter.stop();
    this.growlL.stop();
    this.growlR.stop();
  }

  /** Level is ending (next level / restart): stop every sound, keep players loaded. */
  silenceAll() {
    this.echoTimers.forEach(clearTimeout);
    this.echoTimers = [];
    this.stopLoops();
    Object.values(this.pools).forEach((p) => p.silence());
  }

  /** Leaving the game screen: stop and free everything. */
  stopAll() {
    this.echoTimers.forEach(clearTimeout);
    this.echoTimers = [];
    this.ambience.release();
    this.flutter.release();
    this.growlL.release();
    this.growlR.release();
    Object.values(this.pools).forEach((p) => p.release());
  }
}

export const AudioEngine = new GameAudio();
