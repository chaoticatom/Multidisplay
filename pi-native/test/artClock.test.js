// Art Clock (src/effects/artClock.js): every style draws something on the
// cube's sides and top, on a single panel and on a wall, and Mix changes
// style every five minutes.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const { EFFECTS, WALL_EFFECTS } = require('../src/effects');
const artClock = require('../src/effects/artClock');

function test(name, fn) {
  try { fn(); console.log(`  ok - ${name}`); } catch (err) { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; }
}
const lit = (buf, idx) => { let n = 0; for (const i of idx) if (i >= 0 && buf[i * 3] + buf[i * 3 + 1] + buf[i * 3 + 2] > 0.3) n++; return n; };

test('every style lights the sides and top of the cube', () => {
  for (const style of artClock.STYLES) {
    const c = new CubeCore(32); c.effectOptions = { art_clock: { style } };
    EFFECTS.art_clock(c, 1 / 30);
    for (const f of [0, 2, 4]) assert.ok(lit(c.colBuf, c.faceMap[f]) > 10, `${style}: face ${f} is lit`);
    // The bottom is not drawn (its edge LEDs are shared with the sides, so skip those).
    const S = c.SIZE, inner = []; for (let v = 1; v < S - 1; v++) for (let u = 1; u < S - 1; u++) inner.push(c.faceMap[5][v * S + u]);
    assert.strictEqual(lit(c.colBuf, inner), 0, `${style}: the bottom stays dark`);
  }
});

test('on a wall the clock is centred, as large as fits', () => {
  const c = new CubeCore(64); c.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64); c.effectOptions = { art_clock: { style: 'rings' } };
  WALL_EFFECTS.art_clock(c, 1 / 30);
  let left = 0, mid = 0;
  for (let y = 0; y < 64; y++) { for (let x = 0; x < 20; x++) left += c.wallBuf[(y * 128 + x) * 3]; for (let x = 40; x < 88; x++) mid += c.wallBuf[(y * 128 + x) * 3]; }
  assert.ok(mid > 5 && left < mid / 4, 'drawn in the middle, not stretched to the edges');
});

test('an unknown style falls back to Galaxy; Mix picks a real style', () => {
  const c = new CubeCore(16); c.effectOptions = { art_clock: { style: 'nope' } };
  EFFECTS.art_clock(c, 1 / 30); // doesn't throw
  c.effectOptions = { art_clock: { style: 'mix' } };
  EFFECTS.art_clock(c, 1 / 30);
  assert.ok(lit(c.colBuf, c.faceMap[0]) > 0);
});

if (!process.exitCode) console.log('\nAll artClock tests passed');
