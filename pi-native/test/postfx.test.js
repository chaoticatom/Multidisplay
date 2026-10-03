// The next-gen pass only changes what is shown: the next tick starts from
// the clean frame (no glow feedback into trail effects), it adds light
// around bright pixels, and switched off it changes nothing.
'use strict';
const assert = require('assert');
const { CubeCore } = require('../src/core');
const { applyPostFx, restorePostFx } = require('../src/effects/postfx');
function ok(name, fn) { try { fn(); console.log('  ok -', name); } catch (e) { console.error('  FAIL -', name, e.message); process.exitCode = 1; } }
const look = { on: true, bloom: 0.8, vibrance: 0.3, smooth: 0 };
function wallWithDot() {
  const c = new CubeCore(64); c.initWall([{ gx: 0, gy: 0 }], 64);
  c.setWallPixel(32, 32, 1, 1, 1);
  return c;
}
ok('bloom lights the neighbours of a bright pixel', () => {
  const c = wallWithDot(); applyPostFx(c, 'wall', look);
  const o = (32 * 64 + 35) * 3; assert.ok(c.wallBuf[o] > 0.005, String(c.wallBuf[o]));
});
ok('restore puts back the clean frame', () => {
  const c = wallWithDot(); const before = Float32Array.from(c.wallBuf);
  applyPostFx(c, 'wall', look); restorePostFx();
  assert.deepStrictEqual(Array.from(c.wallBuf), Array.from(before));
});
ok('off changes nothing', () => {
  const c = wallWithDot(); const before = Float32Array.from(c.wallBuf);
  applyPostFx(c, 'wall', { on: false });
  assert.deepStrictEqual(Array.from(c.wallBuf), Array.from(before));
});
ok('cube: an edge LED shared by two faces is processed once', () => {
  const c = new CubeCore(16);
  for (let i = 0; i < c.colBuf.length; i++) c.colBuf[i] = 0.3;
  applyPostFx(c, 'cube', { on: true, bloom: 0, vibrance: 0, smooth: 0, depth: 0 });
  assert.ok(c.colBuf.every((v) => Math.abs(v - 0.3) < 1e-6));
});
ok('a palette recolours a saturated pixel but leaves white alone', () => {
  const c = new CubeCore(64); c.initWall([{ gx: 0, gy: 0 }], 64);
  c.setWallPixel(1, 1, 0, 1, 0); c.setWallPixel(2, 2, 1, 1, 1);
  applyPostFx(c, 'wall', { on: true, bloom: 0, vibrance: 0, smooth: 0, palette: 'ember' });
  const g = (64 + 1) * 3, w = (2 * 64 + 2) * 3;
  assert.ok(c.wallBuf[g] > 0.5 && c.wallBuf[g + 1] < 0.9, 'green became an ember colour');
  assert.deepStrictEqual([c.wallBuf[w], c.wallBuf[w + 1], c.wallBuf[w + 2]].map((v) => Math.round(v * 100)), [100, 100, 100]);
});
ok('cube depth: top face brighter than bottom', () => {
  const c = new CubeCore(16); c.colBuf.fill(0.5);
  applyPostFx(c, 'cube', { on: true, bloom: 0, vibrance: 0, smooth: 0, depth: 1 });
  const avg = (f) => { let s = 0, n = 0; for (const i of c.faceMap[f]) if (i >= 0) { s += c.colBuf[i * 3]; n++; } return s / n; };
  assert.ok(avg(4) > avg(5), `top ${avg(4)} vs bottom ${avg(5)}`);
});
