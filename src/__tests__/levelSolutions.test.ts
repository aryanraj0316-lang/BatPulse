import { authoredLevelIds, loadAuthoredLevel } from '../levels/loader';
import { flyLevel, findRoute } from './helpers/levelBot';
import { buildWorld } from '../sim/world';
import { ECHO_CONFIG } from '../constants/gameConfig';

const ids = authoredLevelIds().sort((a, b) => a - b);

describe('every authored level is completable (real simulation, automated flight)', () => {
  it.each(ids.map((id) => [id]))('level %i: a safe route exists and the bat finishes without dying', (id) => {
    const def = loadAuthoredLevel(id, true)!;
    const run = flyLevel(def);
    expect(run.route.length).toBeGreaterThan(1);
    expect(run.finished).toBe(true);
    expect(run.deaths).toBe(0);
    // the bot's clean run must land inside the star thresholds the designer set
    expect(run.timeSec).toBeLessThanOrEqual(def.starThresholds.three);
  });

  it.each(ids.map((id) => [id]))('level %i: the solution is not trivially short and not absurdly long', (id) => {
    const def = loadAuthoredLevel(id, true)!;
    const run = flyLevel(def);
    expect(run.timeSec).toBeGreaterThan(2);
    expect(run.timeSec).toBeLessThan(def.parTime * 2);
  });

  it('flying straight into the first spike kills (spikes are lethal)', () => {
    const def = loadAuthoredLevel(3, true)!;
    const world = buildWorld(def, ECHO_CONFIG.world.wallSegmentLen);
    const spike = world.spikes[0];
    // run the real sim with the bat placed beside the spike, pushing into it
    const { GameSim } = require('../sim/game');
    const sim = new GameSim(world, { pulseRadius: 100 });
    sim.body.x = spike.x - 30;
    sim.body.y = spike.y + spike.height / 2;
    sim.setInput(1, 0);
    for (let i = 0; i < 120 && sim.status === 'playing'; i++) sim.step(1 / 60);
    expect(sim.status).toBe('dying');
  });

  it('a level with a sealed-off finish has no route', () => {
    const def: any = JSON.parse(JSON.stringify(loadAuthoredLevel(1, true)));
    def.walls.push({ x: 0, y: 0, width: 380, height: 140, type: 'normal' }); // seals the top corridor
    expect(findRoute(buildWorld(def, 60))).toBeNull();
  });
});
