import { authoredLevelIds, loadAuthoredLevel } from '../levels/loader';
import { GameSim } from '../sim/game';
import { buildWorld } from '../sim/world';
import { ECHO_CONFIG } from '../constants/gameConfig';

const simFor = (id: number) => new GameSim(buildWorld(loadAuthoredLevel(id, true)!, ECHO_CONFIG.world.wallSegmentLen), { pulseRadius: 150 });

describe('Ghost Run applies only where there are hunters', () => {
  it('a level without hunters is never a ghost run, however quiet', () => {
    const noHunters = authoredLevelIds().filter((i) => i > 0 && loadAuthoredLevel(i, true)!.enemies.length === 0);
    expect(noHunters.length).toBeGreaterThanOrEqual(20);
    for (const id of noHunters) expect(simFor(id).isGhostRun).toBe(false);
  });
  it('a hunter level starts as a ghost run and stops being one once a hunter is alerted or pulses exceed the limit', () => {
    const id = authoredLevelIds().find((i) => i > 0 && loadAuthoredLevel(i, true)!.enemies.length > 0)!;
    const sim = simFor(id);
    expect(sim.isGhostRun).toBe(true);
    (sim as unknown as { pulsesUsed: number }).pulsesUsed = loadAuthoredLevel(id, true)!.ghostPulseLimit + 1;
    expect(sim.isGhostRun).toBe(false);
  });
});
