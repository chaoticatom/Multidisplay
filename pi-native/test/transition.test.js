// Transitions between effects (src/effects/transition.js, used by tick.js).
'use strict';
const assert = require('assert');
const { applyTransition } = require('../src/effects/transition');
const { CubeCore } = require('../src/core');
console.log('transition');
let failed = false;
function t(name, fn) { try { fn(); console.log('  ok - ' + name); } catch (e) { failed = true; console.error('  FAIL - ' + name, e.message); } }

function halfway(style, k = 0.5) {
  const core = new CubeCore(64); core.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64);
  const n = core.wallBuf.length, from = new Float32Array(n);
  for (let i = 0; i < n; i += 3) { from[i] = 1; core.wallBuf[i + 2] = 1; } // old red, new blue
  applyTransition(style, core, core.wallBuf, from, k);
  const at = (x, y) => { const i = (y * core.wallW + x) * 3; return core.wallBuf[i + 2] > 0.5 ? 'new' : core.wallBuf[i] > 0.5 ? 'old' : 'mix'; };
  return { at, core };
}
t('fade blends the whole frame evenly', () => {
  const { core } = halfway('fade');
  assert.ok(Math.abs(core.wallBuf[0] - 0.5) < 0.01 && Math.abs(core.wallBuf[2] - 0.5) < 0.01);
});
t('wipe: new on the left, old on the right', () => {
  const { at } = halfway('wipe');
  assert.strictEqual(at(5, 30), 'new'); assert.strictEqual(at(120, 30), 'old');
});
t('slide: the new frame comes in from the right', () => {
  const { at } = halfway('slide');
  assert.strictEqual(at(5, 30), 'old'); assert.strictEqual(at(120, 30), 'new');
});
t('zoom: new in the middle, old at the corners', () => {
  const { at } = halfway('zoom');
  assert.strictEqual(at(64, 32), 'new'); assert.strictEqual(at(0, 0), 'old');
});
t('dissolve: a random mix, about half each, the same pixels every frame', () => {
  const a = halfway('dissolve'), b = halfway('dissolve');
  let nw = 0, total = 0, same = true;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) { total++; if (a.at(x, y) === 'new') nw++; if (a.at(x, y) !== b.at(x, y)) same = false; }
  assert.ok(nw / total > 0.3 && nw / total < 0.7, 'share new: ' + nw / total);
  assert.ok(same, 'no flicker');
});
t('every style ends fully on the new effect', () => {
  for (const s of ['fade', 'slide', 'dissolve', 'wipe', 'zoom']) { const { at } = halfway(s, 1); assert.strictEqual(at(0, 0), 'new', s); assert.strictEqual(at(127, 63), 'new', s); }
});
t('on a cube, wipe and zoom still run (surface positions)', () => {
  const core = new CubeCore(16), n = core.colBuf.length, from = new Float32Array(n).fill(1);
  core.colBuf.fill(0);
  applyTransition('wipe', core, core.colBuf, from, 0.5);
  const lit = core.colBuf.filter((v) => v === 1).length;
  assert.ok(lit > n * 0.2 && lit < n * 0.8, 'partly wiped: ' + lit / n);
});
if (failed) process.exitCode = 1;
