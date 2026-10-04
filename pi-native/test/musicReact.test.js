// Effects that react to music themselves: identical in silence, and a
// detected kick launches fireworks / strikes lightning.
'use strict';
const assert = require('assert');
global.setTimeout = () => ({ unref() {} });
const { CubeCore } = require('../src/core');
const { tempo, kick } = require('../src/effects/audioFeatures');
const fireworksWall = require('../src/effects').WALL_EFFECTS.fireworks;
function ok(name, fn) { try { fn(); console.log('  ok -', name); } catch (e) { console.error('  FAIL -', name, e.message); process.exitCode = 1; } }
const wall = () => { const c = new CubeCore(64); c.initWall([{ gx: 0, gy: 0 }], 64); c.effectOptions = {}; c.t = 0; return c; };
ok('tempo is 1 with no music', () => { assert.strictEqual(tempo({ audio: null }), 1); assert.strictEqual(tempo({ audio: { active: false, bass: 1, beat: 1 } }), 1); });
ok('tempo rises with bass and beats', () => assert.ok(tempo({ audio: { active: true, bass: 0.5, beat: 1 } }) > 1.5));
ok('kick fires only on the beat tick', () => {
  assert.strictEqual(kick({ audio: { active: true, beat: 1 } }), true);
  assert.strictEqual(kick({ audio: { active: true, beat: 0.8 } }), false);
});
ok('a kick launches fireworks straight away', () => {
  const lit = (c) => c.wallBuf.reduce((a, v) => a + v, 0);
  const quiet = wall(); quiet.audio = { active: false, beat: 0, bass: 0, level: 0 };
  const loud = wall(); loud.audio = { active: true, beat: 1, bass: 0.6, level: 0.6 };
  fireworksWall(quiet, 0.05); fireworksWall(loud, 0.05);
  for (let i = 0; i < 6; i++) { quiet.audio.beat = 0; loud.audio.beat = 0.5; fireworksWall(quiet, 0.05); fireworksWall(loud, 0.05); }
  assert.ok(lit(loud) > lit(quiet), `loud ${lit(loud).toFixed(2)} vs quiet ${lit(quiet).toFixed(2)}`);
});
ok("an effect's own music setting overrides the global one", () => {
  const { tick } = require('../src/tick');
  const { EFFECTS, WALL_EFFECTS } = require('../src/effects');
  const alarms = require('../src/effects/alarms');
  const { runOverlays, OV_DEFAULTS } = require('../src/effects/overlays');
  const radio = require('../src/effects/radio');
  const realSpec = radio.audio.spec, realKeep = radio.keepAlive;
  radio.keepAlive = () => {}; // with no station playing it would clear the fake spectrum
  const run = (perEffect) => {
    const c = new CubeCore(16);
    const state = { effect: 'plasma', overlays: JSON.parse(JSON.stringify(OV_DEFAULTS)), effectOptions: {}, brightness: 1, speed: 1, alarms: [], musicReact: { on: false, amount: 0.6, perEffect } };
    radio.audio.spec = new Float32Array(1024).fill(0.9);
    for (let i = 0; i < 12; i++) tick(c, state, { mode: 'cube', size: 16 }, EFFECTS, WALL_EFFECTS, alarms, runOverlays, 1 / 30);
    return c.colBuf.reduce((a, v) => a + v, 0);
  };
  try {
    const off = run({}), on = run({ plasma: 1 });
    assert.notStrictEqual(off.toFixed(3), on.toFixed(3), 'perEffect plasma:1 should react even with the global setting off');
  } finally { radio.audio.spec = realSpec; radio.keepAlive = realKeep; }
});
