// Regression: in WALL mode, showing Internet Radio must actually start the
// stream. radioWall.js only draws; nothing called audio.ensure(), so the
// Pi played nothing and the spectrum stayed flat (real report: worked on
// one 2D panel, flat once in wall mode).
const assert = require('assert');
const { tick } = require('../src/tick');
const { CubeCore } = require('../src/core');
const { EFFECTS, WALL_EFFECTS } = require('../src/effects');
const alarms = require('../src/effects/alarms');
const { runOverlays, OV_DEFAULTS } = require('../src/effects/overlays');
const radio = require('../src/effects/radio');

console.log('radioWallStart');
const calls = [];
const realEnsure = radio.audio.ensure;
radio.audio.ensure = (url) => calls.push(url);
try {
  radio.playStation({ name: 'Test FM', url: 'http://example.invalid/stream' });
  const core = new CubeCore(64); core.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64);
  const state = { effect: 'radio', overlays: JSON.parse(JSON.stringify(OV_DEFAULTS)), effectOptions: { radio: { spectrumOn: true } }, brightness: 1, speed: 1, alarms: [] };
  for (let i = 0; i < 3; i++) tick(core, state, { mode: 'wall', size: 64 }, EFFECTS, WALL_EFFECTS, alarms, runOverlays, 1 / 60);
  assert.ok(calls.includes('http://example.invalid/stream'), 'wall-mode radio must ask for the station: ' + JSON.stringify(calls));
  console.log('  ok - wall mode showing Internet Radio starts the stream');
  console.log('All radioWallStart tests passed');
} catch (err) {
  console.error('  FAIL -', err.message);
  process.exitCode = 1;
} finally {
  radio.audio.ensure = realEnsure;
  radio.stopStation();
  radio.audio.close();
}
