// Weather Radar (src/effects/radar.js), with the map and radar faked.
'use strict';
const assert = require('assert');
const radar = require('../src/effects/radar');
const { CubeCore } = require('../src/core');
console.log('radar');
let failed = false;
function t(name, fn) { try { fn(); console.log('  ok - ' + name); } catch (e) { failed = true; console.error('  FAIL - ' + name, e.message); } }
const { st, tileXY } = radar._test;

t('map tile maths: London at zoom 7 is tile 63,42', () => {
  const c = tileXY(51.5074, -0.1278, 7);
  assert.strictEqual(Math.floor(c.x), 63); assert.strictEqual(Math.floor(c.y), 42);
});
t('draws the map with rain over it, home in the middle, frame time shown', () => {
  const w = 768, h = 512;
  const mk = (fn) => { const d = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) fn(d, (y * w + x) * 4, x, y); return { w, h, data: d }; };
  st.map = mk((d, i) => { d[i] = d[i + 1] = d[i + 2] = 40; d[i + 3] = 255; });
  // Rain: a solid green blob around home (384, 256).
  const rain = mk((d, i, x, y) => { if (Math.hypot(x - 384, y - 256) < 60) { d[i + 1] = 220; d[i + 3] = 255; } });
  st.frames = [{ time: 1760000000, radar: rain }]; st.home = { x: 384, y: 256 }; st.composed.clear();
  st.lastFetch = Date.now(); st.city = 'Testville'; st.zoom = 7; st.place = 'Testville';
  const core = new CubeCore(64); core.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64); core.effectOptions = {};
  require('../src/weatherConfig').load = () => ({ city: 'Testville' }); // no refresh during the test
  radar.wall(core, 1 / 30);
  const px = (x, y) => { const i = (y * core.wallW + x) * 3; return [core.wallBuf[i], core.wallBuf[i + 1], core.wallBuf[i + 2]]; };
  const mid = px(70, 40);
  assert.ok(mid[1] > 0.7 && mid[0] < 0.1, 'rain near home is green: ' + mid);
  const edge = px(2, 60);
  assert.ok(Math.abs(edge[0] - edge[1]) < 0.01 && edge[0] > 0.1, 'away from the rain, the grey map: ' + edge);
  let text = 0; for (let y = 1; y < 6; y++) for (let x = 1; x < 20; x++) if (px(x, y)[2] > 0.9) text++;
  assert.ok(text > 10, 'the frame time is drawn top-left');
});
t('without a town it says so instead of fetching', () => {
  st.frames = []; st.map = null;
  require('../src/weatherConfig').load = () => ({});
  const core = new CubeCore(64); core.initWall([{ gx: 0, gy: 0 }], 64); core.effectOptions = {};
  radar.wall(core, 1 / 30);
  assert.ok(/town/i.test(radar.getStatus().error));
});
if (failed) process.exitCode = 1;
