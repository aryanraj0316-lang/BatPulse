import { SoundKey } from '../assets/keys';
import { SimEvent } from '../sim/game';
import { roomScale } from '../audio/reverb';

export type HapticKind = 'ping' | 'bump' | 'pickup' | 'alert' | 'death' | 'victory' | 'heartbeat';

export interface Feedback {
  sound?: { key: SoundKey; gain: number; /** play with the cave echo */ echo?: boolean };
  haptic?: HapticKind;
}

/**
 * What the player hears and feels for every gameplay event: the one place to look (and to change).
 * `null` means the event is deliberately silent. Every SimEvent must be listed; a test enforces it.
 */
export const FEEDBACK: Record<SimEvent, Feedback | null> = {
  restart: null,
  respawn: null,
  pulse: { sound: { key: 'sfx_ping', gain: 1, echo: true }, haptic: 'ping' },
  no_charge: { sound: { key: 'sfx_switch', gain: 0.5 }, haptic: 'bump' },
  wall_hit: { sound: { key: 'sfx_hit', gain: 0.6 }, haptic: 'bump' },
  death: { sound: { key: 'sfx_death', gain: 1 }, haptic: 'death' },
  enemy_alert: { sound: { key: 'sfx_enemy_alert', gain: 1 }, haptic: 'alert' },
  heartbeat: { sound: { key: 'sfx_heartbeat', gain: 1 }, haptic: 'heartbeat' }, // gain follows the threat, see feedbackFor
  switch: { sound: { key: 'sfx_switch', gain: 1 }, haptic: 'bump' },
  checkpoint: { sound: { key: 'sfx_switch', gain: 0.9 }, haptic: 'pickup' },
  door_open: { sound: { key: 'sfx_door', gain: 1 } },
  door_close: { sound: { key: 'sfx_door', gain: 0.5 } },
  pickup: { sound: { key: 'sfx_switch', gain: 0.8 }, haptic: 'pickup' }, // no dedicated pickup sound yet: the click doubles as the chime
  finish: { sound: { key: 'sfx_finish', gain: 1 }, haptic: 'victory' },
};

/** The feedback for an event right now. The heartbeat gets louder as the hunter gets closer (threat 0..1). */
export function feedbackFor(e: SimEvent, threat: number): Feedback | null {
  const fb = FEEDBACK[e];
  if (!fb) return null;
  if (e === 'heartbeat' && fb.sound) return { ...fb, sound: { ...fb.sound, gain: 0.35 + 0.65 * Math.min(1, Math.max(0, threat)) } };
  return fb;
}

export interface FeedbackSinks {
  playSound(key: SoundKey, gain: number, echoScale?: number): void;
  haptic(kind: HapticKind): void;
}

/** Plays the feedback for an event through the given sinks (audio service + haptic engine). */
export function playFeedback(e: SimEvent, threat: number, level: { width: number; height: number }, sinks: FeedbackSinks): void {
  const fb = feedbackFor(e, threat);
  if (!fb) return;
  if (fb.sound) sinks.playSound(fb.sound.key, fb.sound.gain, fb.sound.echo ? roomScale(level.width, level.height) : undefined);
  if (fb.haptic) sinks.haptic(fb.haptic);
}
