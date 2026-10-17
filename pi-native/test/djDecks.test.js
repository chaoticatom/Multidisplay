'use strict';
// The Auto-DJ's two decks on the wall: NOW on the left half, NEXT on the
// right, the progress bar along the bottom row, the mix lighting NEXT up.
const assert = require('assert');
const { drawDjDecks, createDeckState, ROWS } = require('../src/effects/radio/djDecks');

function wall(W, H) {
  const buf = new Float32Array(W * H * 3);
  return { wallW: W, wallH: H, wallBuf: buf, setWallPixel(x, y, r, g, b) { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; } };
}
const sum = (c, x0, x1, y0, y1) => { let s = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * c.wallW + x) * 3; s += c.wallBuf[i] + c.wallBuf[i + 1] + c.wallBuf[i + 2]; } return s; };
const blue = (c, x0, x1, y0, y1) => { let s = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += c.wallBuf[(y * c.wallW + x) * 3 + 2]; return s; };

try {
  const info = { now: { title: 'Song One', bpm: 124, key: '8A', dur: 200, pos: 50 }, next: { title: 'Song Two', bpm: 124, key: '9A' }, mixing: false, mixU: 0, mixIn: 30 };
  const c = wall(128, 64), st = createDeckState();
  for (let i = 0; i < 40; i++) drawDjDecks(c, info, st, 1 / 30);
  assert.strictEqual(ROWS, 17);
  assert.strictEqual(sum(c, 0, 128, 0, 64 - ROWS), 0, 'nothing drawn above the decks');
  assert.ok(sum(c, 0, 64, 64 - 10, 64 - 2) > 5 && sum(c, 64, 128, 64 - 10, 64 - 2) > 5, 'a title on each deck');
  assert.ok(blue(c, 0, 64, 47, 64) > blue(c, 64, 128, 47, 64), 'NOW is the cyan deck, NEXT the amber one');
  // Progress: a quarter through, so the bar is lit on the left of the NOW deck only.
  assert.ok(sum(c, 2, 14, 63, 64) > sum(c, 30, 60, 63, 64) * 2, 'progress bar');
  // Mixing: the NEXT deck brightens and NOW dims.
  const c2 = wall(128, 64), st2 = createDeckState();
  for (let i = 0; i < 40; i++) drawDjDecks(c2, { ...info, mixing: true, mixU: 0.9 }, st2, 1 / 30);
  assert.ok(sum(c2, 0, 64, 47, 63) < sum(c, 0, 64, 47, 63), 'NOW dims during the mix');
  // One panel: the decks take turns.
  const c3 = wall(64, 64), st3 = createDeckState();
  for (let i = 0; i < 30; i++) drawDjDecks(c3, info, st3, 1 / 30);
  assert.ok(sum(c3, 0, 64, 47, 64) > 0);
  // Loading and empty states draw without errors.
  drawDjDecks(wall(384, 64), { now: null, next: { title: 'X', status: 'loading' }, mixing: false, mixU: 0, mixIn: -1 }, createDeckState(), 1 / 30);
  // Every wall layout up to six panels: both decks drawn, on panels only,
  // each in the bottom 17 rows of a panel.
  const { CubeCore } = require('../src/core');
  const layouts = {
    'two side by side': [[0, 0], [1, 0]], 'three in a row': [[0, 0], [1, 0], [2, 0]], 'six in a row': [0, 1, 2, 3, 4, 5].map((x) => [x, 0]),
    '3x2': [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], 'stack of two': [[0, 0], [0, 1]], 'L': [[0, 0], [0, 1], [1, 1]],
    'steps': [[0, 1], [1, 0], [2, 1]], 'one': [[0, 0]], '2x2': [[0, 0], [1, 0], [0, 1], [1, 1]],
  };
  for (const [name, cells] of Object.entries(layouts)) {
    const core = new CubeCore(64); core.initWall(cells.map(([gx, gy]) => ({ gx, gy })), 64);
    const s4 = createDeckState();
    for (let i = 0; i < 20; i++) drawDjDecks(core, info, s4, 1 / 30);
    let cyan = 0, amber = 0, stray = 0;
    for (let y = 0; y < core.wallH; y++) for (let x = 0; x < core.wallW; x++) {
      const o = (y * core.wallW + x) * 3, r = core.wallBuf[o], b = core.wallBuf[o + 2];
      if (r + b === 0) continue;
      if (y % 64 < 64 - 17) stray++;
      if (b > r) cyan++; else amber++;
    }
    assert.strictEqual(stray, 0, name + ': only in the deck rows');
    assert.ok(cyan > 50 && (cells.length === 1 || amber > 50), `${name}: both decks (${cyan}/${amber})`);
  }
  // The cube: NOW on the front and back, NEXT on the right and left.
  const cube = new CubeCore(64), s5 = createDeckState();
  for (let i = 0; i < 20; i++) drawDjDecks(cube, info, s5, 1 / 30, 0, 'cube');
  const faceTint = (f) => { let r = 0, b = 0; for (let v = 0; v < 64; v++) for (let u = 0; u < 64; u++) { const i = cube.faceMap[f][v * 64 + u]; if (i < 0) continue; r += cube.colBuf[i * 3]; b += cube.colBuf[i * 3 + 2]; } return [r, b]; };
  for (const f of [0, 1]) { const [r, b] = faceTint(f); assert.ok(b > r && b > 5, 'cube face ' + f + ' is NOW'); }
  for (const f of [2, 3]) { const [r, b] = faceTint(f); assert.ok(r > b && r > 5, 'cube face ' + f + ' is NEXT'); }
  console.log('  ok - now playing and up next decks');
} catch (e) { console.error(e); process.exitCode = 1; }
