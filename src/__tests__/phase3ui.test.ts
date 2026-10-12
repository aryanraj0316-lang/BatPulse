import { ECHO_CONFIG } from '../constants/gameConfig';
import { edgeAlpha, heartbeatInterval, JumpGate } from '../game/jumpGate';
import { VISUAL_KEYS } from '../assets/keys';

const E = ECHO_CONFIG.enemy;

describe('jump effect gate (never repeated excessively)', () => {
  it('plays the first time, then not again within the cooldown', () => {
    const g = new JumpGate(25, 5);
    expect(g.tryPlay(100)).toBe(true);
    expect(g.tryPlay(110)).toBe(false);
    expect(g.tryPlay(124.9)).toBe(false);
    expect(g.tryPlay(125.1)).toBe(true);
  });
  it('is capped per level no matter how long the player stays', () => {
    const g = new JumpGate(25, 2);
    let plays = 0;
    for (let t = 0; t < 10000; t += 30) if (g.tryPlay(t)) plays++;
    expect(plays).toBe(2);
  });
  it('uses the configured defaults', () => {
    const g = new JumpGate();
    expect(g.tryPlay(0)).toBe(true);
    expect(g.tryPlay(E.jumpEffectCooldownSec - 1)).toBe(false);
    expect(g.tryPlay(E.jumpEffectCooldownSec + 1)).toBe(true);
    expect(g.tryPlay(E.jumpEffectCooldownSec * 3)).toBe(false); // max per level reached
  });
  it('a player who dies ten times in a row sees the effect at most twice', () => {
    const g = new JumpGate();
    let plays = 0;
    for (let i = 0; i < 10; i++) if (g.tryPlay(i * 12)) plays++; // a death every 12 s
    expect(plays).toBeLessThanOrEqual(E.jumpEffectMaxPerLevel);
  });
});

describe('threat feedback maths', () => {
  it('heartbeat interval runs from 1.0 s (edge of range) down to 0.35 s (adjacent)', () => {
    expect(heartbeatInterval(0)).toBe(E.heartbeatSlowSec);
    expect(heartbeatInterval(1)).toBe(E.heartbeatFastSec);
    expect(heartbeatInterval(0.5)).toBeCloseTo((E.heartbeatSlowSec + E.heartbeatFastSec) / 2);
    expect(heartbeatInterval(5)).toBe(E.heartbeatFastSec);
    expect(heartbeatInterval(-1)).toBe(E.heartbeatSlowSec);
  });
  it('the red edge is off with no threat, brighter when closer, and flashes on the beat', () => {
    expect(edgeAlpha(0, 0)).toBe(0);
    expect(edgeAlpha(0.8, 5)).toBeGreaterThan(edgeAlpha(0.2, 5));
    expect(edgeAlpha(0.5, 0)).toBeGreaterThan(edgeAlpha(0.5, 0.6));
    expect(edgeAlpha(1, 0)).toBeLessThanOrEqual(0.95);
    expect(edgeAlpha(0.15, 5)).toBeGreaterThanOrEqual(0.3); // clearly visible even at the edge of the range
  });
  it('the heartbeat has its own placeholder sound and the marker its own visual key', () => {
    expect(VISUAL_KEYS).toContain('sound_marker');
    expect(VISUAL_KEYS).toContain('enemy_hunter');
  });
});
