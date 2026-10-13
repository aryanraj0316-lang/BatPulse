import * as fs from 'fs';
import * as path from 'path';
import { loadAuthoredLevel } from '../../levels/loader';
import { findLoudSolution } from '../helpers/timedBot';

// Tool, not a regression test: finds loud solutions and saves each one to docs/loud_solutions.json as soon as it is found.
//   LOUD_SEARCH=44,45 npx jest --testMatch "**/loudSearch.tool.ts" --testTimeout=3000000
// Not part of `npm test` (its file name does not match the test pattern).
const FILE = path.join(__dirname, '..', '..', '..', 'docs', 'loud_solutions.json');
const wanted = (process.env.LOUD_SEARCH ?? '').split(',').filter(Boolean).map(Number);

describe('loud solution search (tool)', () => {
  for (const id of wanted) {
    it(`level ${id}`, () => {
      const table = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      const found = findLoudSolution(loadAuthoredLevel(id, true)!);
      if (!found) throw new Error(`level ${id}: no loud solution among the searched strategies`);
      table[String(id)] = found.variant;
      fs.writeFileSync(FILE, JSON.stringify(table, null, 2) + '\n');
      console.log(`level ${id}: ${JSON.stringify(found.variant)} after ${found.tried} tries`);
    });
  }
});
