import * as fs from 'fs';
import * as path from 'path';
import { authoredLevelIds, loadAuthoredLevel } from '../levels/loader';
import { CHAPTERS } from '../levels/chapters';
import { findLoudSolution, flyTimed, LoudVariant } from './helpers/timedBot';
import { flyLevel } from './helpers/levelBot';

/**
 * docs/LEVEL_SOLUTIONS.md is GENERATED from real runs of the solver bots through the real simulation.
 * Regenerate with:  WRITE_DOCS=1 npx jest solutions     (the test fails if the committed file is stale)
 */
const DOC = path.join(__dirname, '..', '..', 'docs', 'LEVEL_SOLUTIONS.md');
const LOUD = path.join(__dirname, '..', '..', 'docs', 'loud_solutions.json');
const readLoud = (): Record<string, LoudVariant> => (fs.existsSync(LOUD) ? JSON.parse(fs.readFileSync(LOUD, 'utf8')) : {});

let loudTableForWrite: Record<string, LoudVariant> = {};
const previousLoud: Record<string, LoudVariant> = readLoud();

function build(): string {
  const loudTable: Record<string, LoudVariant> = process.env.WRITE_DOCS ? {} : readLoud();
  loudTableForWrite = loudTable;
  const lines: string[] = [
    '# Level solutions (generated)',
    '',
    'Every level below was completed by an automated bot flying the real game simulation as **The Rookie**',
    '(no character is ever required). Times are the bot\'s clean run; star thresholds are 3x / 6x of that.',
    'Regenerate: `WRITE_DOCS=1 npx jest solutions`.',
    '',
  ];
  for (const ch of CHAPTERS) {
    lines.push(`## Chapter ${ch.id}: ${ch.name}`, '', '| Echo | Name | Sonar | Elements | Clean time | Pulses used | 3 stars | 2 stars |', '|---|---|---|---|---|---|---|---|');
    const details: string[] = [];
    const loudNotes: Record<number, string> = {};
    for (const id of authoredLevelIds().filter((i) => i >= ch.first && i <= ch.last).sort((a, b) => a - b)) {
      const def = loadAuthoredLevel(id, true)!;
      const dynamic = def.movingHazards.length > 0 || def.switches.length > 0 || def.enemies.length > 0 || (def.keys ?? []).length > 0;
      let time: number;
      let pulses = 0;
      let trace = '';
      let pulseTimes: number[] = [];
      if (dynamic) {
        const r = flyTimed(def);
        if (!r.finished) throw new Error(`level ${id} is not solvable: ${r.failedAt}`);
        if (def.enemies.length > 0) {
          if (!r.ghost) throw new Error(`level ${id}: the stealth route is not a ghost run`);
          // the loud solution: found by search when regenerating, replayed from the table otherwise
          let v: LoudVariant | undefined = loudTable[id];
          if (process.env.WRITE_DOCS) {
            // keep a recorded variant while it still works; search only when it is missing or stale
            const old = previousLoud[String(id)];
            const stillGood = old ? flyTimed(def, {}, 'loud', old) : null;
            if (old && stillGood && stillGood.finished && stillGood.deaths === 0 && stillGood.alerts > 0) {
              v = old;
            } else {
              const found = findLoudSolution(def);
              if (!found) throw new Error(`level ${id} has no loud solution`);
              v = found.variant;
            }
            loudTable[id] = v;
          }
          if (!v) throw new Error(`level ${id}: missing from loud_solutions.json (run WRITE_DOCS=1)`);
          const loud = flyTimed(def, {}, 'loud', v);
          if (!loud.finished || loud.deaths > 0 || loud.alerts === 0) throw new Error(`level ${id}: recorded loud solution no longer works`);
          loudNotes[id] = `Loud solution: wait ${v.startDelay} s, then pulse every ${v.noiseEvery} s from t=${v.noiseFrom} s; hunters alerted ${loud.alerts}x, finished in ${loud.timeSec.toFixed(1)} s.`;
        }
        time = r.timeSec;
        pulses = r.pulses;
        pulseTimes = r.pulseTimes;
        trace = r.trace.map((p) => `(${p.x},${p.y})@${p.t}s`).join(' -> ');
      } else {
        const r = flyLevel(def);
        if (!r.finished) throw new Error(`level ${id} is not solvable`);
        time = r.timeSec;
        trace = r.route.map((p) => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' -> ');
      }
      const el: string[] = [];
      if (def.spikes.length) el.push('spikes');
      for (const k of ['slider', 'blade'] as const) if (def.movingHazards.some((h) => h.kind === k)) el.push(k);
      if (def.walls.some((w) => w.type === 'crystal')) el.push('crystal');
      if (def.walls.some((w) => w.type === 'mossy')) el.push('mossy');
      if (def.switches.length) el.push(`${def.switches.length} switch/door`);
      if ((def.keys ?? []).length) el.push('key + locked door');
      if ((def.safeZones ?? []).length) el.push(`${def.safeZones!.length} safe zone${def.safeZones!.length > 1 ? 's' : ''}`);
      if (def.enemies.length) el.push(`${def.enemies.length} hunter${def.enemies.length > 1 ? 's' : ''} (${[...new Set(def.enemies.map((e) => e.speed))].join('/')})`);
      if (def.pickups.length) el.push(`${def.pickups.length} pickup`);
      const sonar = def.sonar.mode === 'fixed' ? `fixed ${def.sonar.charges}` : `${def.sonar.charges} / ${def.sonar.rechargeSec}s`;
      lines.push(`| ${id} | ${def.name} | ${sonar} | ${el.join(', ') || '-'} | ${time.toFixed(1)} s | ${pulses} | <= ${def.starThresholds.three} s | <= ${def.starThresholds.two} s |`);
      details.push(
        `### Echo ${String(id).padStart(2, '0')} - ${def.name}`,
        '',
        `${def.enemies.length ? 'Stealth (ghost run) route' : 'Route'}: ${trace}`,
        pulseTimes.length ? `Pulses at: ${pulseTimes.join(', ')} s` : 'Pulses: none needed for the route (a player uses them to see).',
        ...(loudNotes[id] ? [loudNotes[id]] : []),
        '',
      );
    }
    lines.push('', ...details);
  }
  return lines.join('\n') + '\n';
}

describe('level solution document', () => {
  it('docs/LEVEL_SOLUTIONS.md is up to date with the levels and solves every one', () => {
    const doc = build();
    if (process.env.WRITE_DOCS) {
      fs.writeFileSync(DOC, doc);
      fs.writeFileSync(LOUD, JSON.stringify(loudTableForWrite, null, 2) + '\n');
    }
    expect(fs.existsSync(DOC)).toBe(true);
    expect(fs.readFileSync(DOC, 'utf8').replace(/\r/g, '')).toBe(doc);
  });
});
