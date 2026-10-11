import { Vec2, WraithEntity } from '../types/game';

class AdaptiveSpatialMixer {
  private ctx: any = null;
  private wraithDroneOsc: any = null;
  private wraithDroneGain: any = null;
  private wraithDronePanner: any = null;
  private shardStreak: number = 0;
  private lastShardTime: number = 0;

  private getAudioContext() {
    if (typeof window !== 'undefined') {
      const AudioCtxClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        if (!this.ctx) {
          this.ctx = new AudioCtxClass();
        }
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        return this.ctx;
      }
    }
    return null;
  }

  /**
   * Signature Sonar Pulse: Short sine-swept "bwooop" with long reverb decay tail (1.2-2.0s),
   * pitched around 800Hz, synced with visual reveal.
   */
  playSonarPulse(enabled: boolean = true) {
    if (!enabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Pitch sweep: 820Hz -> 240Hz
      osc.type = 'sine';
      osc.frequency.setValueAtTime(820, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.35);

      // Gain envelope: fast attack, 1.4s long reverb tail
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.45);
    } catch {
      // Audio error suppressed
    }
  }

  /**
   * Return Echo: Pitch-shifted quiet return ping, stereo panned to the hit direction
   * and delayed by distance / sound_speed.
   */
  playReturnEcho(impactPos: Vec2, playerPos: Vec2, distance: number, enabled: boolean = true) {
    if (!enabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const delaySeconds = Math.min(0.25, distance / 1200);
      const startTime = ctx.currentTime + delaySeconds;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Pan calculation (-1 left to 1 right)
      const dx = impactPos.x - playerPos.x;
      const panVal = Math.max(-0.9, Math.min(0.9, dx / 200));

      let pannerNode = null;
      if (ctx.createStereoPanner) {
        pannerNode = ctx.createStereoPanner();
        pannerNode.pan.setValueAtTime(panVal, startTime);
      }

      osc.type = 'triangle';
      const baseFreq = 950 + Math.random() * 200;
      osc.frequency.setValueAtTime(baseFreq, startTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, startTime + 0.08);

      gain.gain.setValueAtTime(0.08, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

      if (pannerNode) {
        osc.connect(gain);
        gain.connect(pannerNode);
        pannerNode.connect(ctx.destination);
      } else {
        osc.connect(gain);
        gain.connect(ctx.destination);
      }

      osc.start(startTime);
      osc.stop(startTime + 0.09);
    } catch {
      // Suppress
    }
  }

  /**
   * Shard collected: Pitch-ascending chime that rises by a semitone per shard in chain
   */
  playShardChime(enabled: boolean = true) {
    if (!enabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const nowTime = Date.now();
      if (nowTime - this.lastShardTime < 3000) {
        this.shardStreak = Math.min(12, this.shardStreak + 1);
      } else {
        this.shardStreak = 0;
      }
      this.lastShardTime = nowTime;

      const now = ctx.currentTime;
      // Base frequency 587.33Hz (D5), ascending semitone per streak
      const semitoneRatio = Math.pow(2, this.shardStreak / 12);
      const freq = 587.33 * semitoneRatio;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.22);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.32);
    } catch {
      // Suppress
    }
  }

  /**
   * Wall Collision: Low dull bump
   */
  playCollisionThud(enabled: boolean = true) {
    if (!enabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.13);
    } catch {
      // Suppress
    }
  }

  /**
   * Wraith Alert Bass Drop
   */
  playWraithAlert(enabled: boolean = true) {
    if (!enabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.6);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.65);
    } catch {
      // Suppress
    }
  }

  /**
   * Goal Reached: Resonant harmonic chord
   */
  playLevelComplete(enabled: boolean = true) {
    if (!enabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
      notes.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const st = now + idx * 0.1;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, st);

        gain.gain.setValueAtTime(0.18, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(st);
        osc.stop(st + 0.65);
      });
    } catch {
      // Suppress
    }
  }

  /**
   * Update spatial audio position for Wraith continuous drone & heartbeat
   */
  updateWraithAudio(wraith: WraithEntity | undefined, playerPos: Vec2, enabled: boolean) {
    if (!enabled || !wraith || wraith.state === 'DORMANT') {
      if (this.wraithDroneGain) {
        try {
          this.wraithDroneGain.gain.setValueAtTime(0.001, this.ctx?.currentTime || 0);
        } catch {}
      }
      return;
    }

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const dist = Math.hypot(wraith.pos.x - playerPos.x, wraith.pos.y - playerPos.y);
      const maxRange = 360;
      const volume = Math.max(0, 1.0 - dist / maxRange) * (wraith.state === 'FRENZY' ? 0.35 : 0.18);
      const dx = wraith.pos.x - playerPos.x;
      const panVal = Math.max(-0.95, Math.min(0.95, dx / 220));

      if (!this.wraithDroneOsc) {
        this.wraithDroneOsc = ctx.createOscillator();
        this.wraithDroneGain = ctx.createGain();
        this.wraithDroneOsc.type = 'sawtooth';
        this.wraithDroneOsc.frequency.setValueAtTime(55, ctx.currentTime);

        if (ctx.createStereoPanner) {
          this.wraithDronePanner = ctx.createStereoPanner();
          this.wraithDroneOsc.connect(this.wraithDroneGain);
          this.wraithDroneGain.connect(this.wraithDronePanner);
          this.wraithDronePanner.connect(ctx.destination);
        } else {
          this.wraithDroneOsc.connect(this.wraithDroneGain);
          this.wraithDroneGain.connect(ctx.destination);
        }

        this.wraithDroneOsc.start();
      }

      const now = ctx.currentTime;
      this.wraithDroneGain.gain.setValueAtTime(volume, now);
      if (this.wraithDronePanner) {
        this.wraithDronePanner.pan.setValueAtTime(panVal, now);
      }
    } catch {
      // Suppress
    }
  }

  stopAll() {
    try {
      if (this.wraithDroneOsc) {
        this.wraithDroneOsc.stop();
        this.wraithDroneOsc = null;
      }
    } catch {}
  }
}

export const AudioEngine = new AdaptiveSpatialMixer();
