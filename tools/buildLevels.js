#!/usr/bin/env node
/**
 * Level build tool.
 *
 * Designers edit ASCII maps in `levels-src/*.txt`; this script turns them into the JSON data files
 * the game loads (`src/levels/data/*.json`). Run with `npm run levels`.
 * `npm run levels -- --check` verifies the JSON files are up to date without writing (used by tests).
 *
 * File format:
 *   <JSON header: id, name, chapter, sonar, ghostPulseLimit, parTime, starThresholds, escape, hints ...>
 *   ---
 *   <ASCII grid, one char per CELL (20 world units)>
 *
 * Cell legend:
 *   #  normal wall        C  crystal wall        M  mossy wall
 *   ^  spike              .  empty
 *   S  start              F  finish ring
 *   k  checkpoint         p  charge pickup
 *   1-9  switch (id s1..s9)   a-i  door controlled by switch 1..9 (a = s1, b = s2, ...)
 *   K  hidden key (at most one per level)
 *   L  locked door that the key opens (one rectangle of L cells; needs a K)
 *   Z  safe zone (a refuge from hunters; every rectangle of Z cells is one zone, at least 2 x 2 cells)
 */
const fs = require('fs');
const path = require('path');

const CELL = 20;
const SRC = path.join(__dirname, '..', 'levels-src');
const OUT = path.join(__dirname, '..', 'src', 'levels', 'data');

const WALL_CHARS = { '#': 'normal', C: 'crystal', M: 'mossy' };

/** Greedy rectangle merge: horizontal runs first, then stack identical runs vertically. */
function mergeRects(grid, matches) {
  const rows = grid.length;
  const cols = grid[0].length;
  const used = grid.map((r) => Array.from(r, () => false));
  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (used[r][c] || !matches(grid[r][c])) continue;
      const ch = grid[r][c];
      let w = 1;
      while (c + w < cols && !used[r][c + w] && grid[r][c + w] === ch) w++;
      let h = 1;
      outer: while (r + h < rows) {
        for (let k = 0; k < w; k++) if (used[r + h][c + k] || grid[r + h][c + k] !== ch) break outer;
        h++;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) used[r + y][c + x] = true;
      rects.push({ ch, x: c * CELL, y: r * CELL, width: w * CELL, height: h * CELL });
    }
  }
  return rects;
}

function build(file) {
  const text = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\r/g, '');
  const split = text.indexOf('\n---\n');
  if (split < 0) throw new Error(`${file}: missing "---" separator`);
  const meta = JSON.parse(text.slice(0, split));
  const grid = text
    .slice(split + 5)
    .split('\n')
    .filter((l) => l.length > 0);
  const cols = grid[0].length;
  grid.forEach((l, i) => {
    if (l.length !== cols) throw new Error(`${file}: row ${i} has ${l.length} cells, expected ${cols}`);
  });

  let start = null;
  let finish = null;
  const checkpoints = [];
  const pickups = [];
  const switches = [];
  const keys = [];
  grid.forEach((line, r) => {
    for (let c = 0; c < cols; c++) {
      const p = { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 };
      const ch = line[c];
      if (ch === 'S') {
        if (start) throw new Error(`${file}: more than one S`);
        start = p;
      } else if (ch === 'F') {
        if (finish) throw new Error(`${file}: more than one F`);
        finish = { ...p, radius: 18 };
      } else if (ch === 'k') checkpoints.push(p);
      else if (ch === 'p') pickups.push({ type: 'charge', ...p });
      else if (ch >= '1' && ch <= '9') switches.push({ id: `s${ch}`, x: p.x, y: p.y, radius: 14 });
      else if (ch === 'K') keys.push({ id: `k${keys.length + 1}`, x: p.x, y: p.y });
      else if (!'#CM^.abcdefghiLZ'.includes(ch)) throw new Error(`${file}: unknown cell "${ch}" at row ${r}, col ${c}`);
    }
  });
  if (!start) throw new Error(`${file}: no S (start)`);
  if (!finish) throw new Error(`${file}: no F (finish)`);

  const walls = mergeRects(grid, (ch) => ch in WALL_CHARS).map((r) => ({
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    type: WALL_CHARS[r.ch],
  }));
  const doors = mergeRects(grid, (ch) => ch >= 'a' && ch <= 'i').map((r) => ({
    id: `d_${r.ch}_${r.x}_${r.y}`,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    switchId: `s${r.ch.charCodeAt(0) - 96}`,
  }));
  // a locked door is ONE rectangle of L cells, opened by the level's one key
  const lockedRects = mergeRects(grid, (ch) => ch === 'L');
  if (lockedRects.length > 1) throw new Error(`${file}: the L cells must form a single rectangle (found ${lockedRects.length})`);
  if (keys.length > 1) throw new Error(`${file}: at most one K (key) per level`);
  if (lockedRects.length !== keys.length) throw new Error(`${file}: a locked door (L) needs exactly one key (K), and a key needs a door`);
  for (const r of lockedRects) doors.push({ id: `d_L_${r.x}_${r.y}`, x: r.x, y: r.y, width: r.width, height: r.height, keyId: keys[0].id });
  const safeZones = mergeRects(grid, (ch) => ch === 'Z').map(({ x, y, width, height }) => ({ x, y, width, height }));
  const spikes = mergeRects(grid, (ch) => ch === '^').map(({ x, y, width, height }) => ({ x, y, width, height }));

  const level = {
    id: meta.id,
    name: meta.name,
    chapter: meta.chapter,
    width: cols * CELL,
    height: grid.length * CELL,
    start,
    finish,
    walls,
    spikes,
    movingHazards: meta.movingHazards || [],
    switches,
    doors,
    pickups,
    enemies: meta.enemies || [],
    checkpoints,
    sonar: meta.sonar,
    ghostPulseLimit: meta.ghostPulseLimit,
    parTime: meta.parTime,
    starThresholds: meta.starThresholds,
    escape: meta.escape || { enabled: false, wallSpeed: 0 },
  };
  // optional lists are only written when a level uses them, so older levels stay byte-for-byte the same
  if (keys.length) level.keys = keys;
  if (safeZones.length) level.safeZones = safeZones;
  if (meta.hints) level.hints = meta.hints;
  return { name: path.basename(file, '.txt'), json: JSON.stringify(level, null, 2) + '\n' };
}

function main() {
  const check = process.argv.includes('--check');
  const files = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter((f) => f.endsWith('.txt')).sort() : [];
  let stale = 0;
  for (const f of files) {
    const { name, json } = build(f);
    const target = path.join(OUT, `${name}.json`);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r/g, '') : null;
    if (check) {
      if (current !== json) {
        stale++;
        console.error(`STALE: ${name}.json differs from levels-src/${f}`);
      }
    } else if (current !== json) {
      fs.writeFileSync(target, json);
      console.log(`wrote ${name}.json`);
    }
  }
  if (check && stale) process.exit(1);
  if (!check) console.log(`${files.length} level source(s) processed`);
}

main();
