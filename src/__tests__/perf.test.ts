import { loadAuthoredLevel } from '../levels/loader';
import { GameSim } from '../sim/game';
import { buildWorld } from '../sim/world';
import { ECHO_CONFIG } from '../constants/gameConfig';

/**
 * Simulation cost budget (see docs/TEST_DEVICES.md). Node on a dev PC is far faster than a Low-tier phone,
 * so the bar here is deliberately strict: 4 ms is the Low-tier allowance, we require a small fraction of it.
 */
describe('simulation performance', () => {
  it('a full step with 8 live pulse waves stays far below the frame budget', () => {
    const def = loadAuthoredLevel(5, true)!;
    const sim = new GameSim(buildWorld(def, ECHO_CONFIG.world.wallSegmentLen), { pulseRadius: 160 });
    sim.setInput(0.7, -0.7);
    // fill the wave pool
    for (let i = 0; i < 8; i++) {
      sim.energy.reset();
      sim.step(0.1);
      sim.firePulse();
    }
    const N = 3000;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      if (i % 20 === 0) {
        sim.energy.reset();
        sim.step(0.1);
        sim.firePulse();
      }
      sim.step(1 / 60);
    }
    const msPerStep = Number(process.hrtime.bigint() - t0) / 1e6 / N;
    expect(msPerStep).toBeLessThan(1);
  });

  it('level load (world build) is well under the 1 s budget', () => {
    const def = loadAuthoredLevel(5, true)!;
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) buildWorld(def, ECHO_CONFIG.world.wallSegmentLen);
    expect((Date.now() - t0) / 100).toBeLessThan(50);
  });

  it('stepping does not allocate: heap stays flat over 100k steps', () => {
    const def = loadAuthoredLevel(3, true)!;
    const sim = new GameSim(buildWorld(def, ECHO_CONFIG.world.wallSegmentLen), { pulseRadius: 160 });
    sim.setInput(0.5, 0);
    if (global.gc) global.gc();
    for (let i = 0; i < 2000; i++) sim.step(1 / 60); // warm-up
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 100000; i++) {
      if (i % 200 === 0) sim.firePulse();
      sim.step(1 / 60);
      if (sim.status !== 'playing') sim.restart();
    }
    const grown = process.memoryUsage().heapUsed - before;
    // 100k steps with an allocating step would grow by tens of MB; allow generous noise
    expect(grown).toBeLessThan(8 * 1024 * 1024);
  });
});
