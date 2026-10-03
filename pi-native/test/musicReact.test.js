// Effects that react to music themselves: identical in silence, and a
// detected kick launches fireworks / strikes lightning.
'use strict';
const assert = require('assert');
global.setTimeout = () => ({ unref() {} });
const { CubeCore } = require('../src/core');
const { tempo, kick } = require('../src/effects/audioFeatures');
const fireworksWall = require('../src/effects/fireworksWall');
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
