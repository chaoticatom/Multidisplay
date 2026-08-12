// Fast, no-timing-flakiness tests for src/effects/overlays.js. Run with
// `npm test`. See that file's module comment for what overlays are and
// what was intentionally skipped (radio/spectrum).
const assert = require('assert');
const { CubeCore } = require('../src/core');
const { EFFECTS } = require('../src/effects');
const { OV_DEFAULTS, OVERLAY_KEYS, runOverlays } = require('../src/effects/overlays');

function test(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function hasNaN(buf) {
  for (let i = 0; i < buf.length; i++) if (!Number.isFinite(buf[i])) return true;
  return false;
}

function allOnState() {
  const s = JSON.parse(JSON.stringify(OV_DEFAULTS));
  for (const k of OVERLAY_KEYS) s[k].on = true;
  return s;
}

console.log('overlays');

test('OVERLAY_KEYS has exactly the 13 ported overlays (no radio/spectrum)', () => {
  assert.strictEqual(OVERLAY_KEYS.length, 13);
  assert.ok(!OVERLAY_KEYS.includes('radio'));
  assert.ok(!OVERLAY_KEYS.includes('spectrum'));
  for (const k of OVERLAY_KEYS) assert.ok(OV_DEFAULTS[k], `OV_DEFAULTS missing ${k}`);
});

test('all overlays off: runOverlays is a no-op on colBuf', () => {
  const core = new CubeCore(16);
  EFFECTS.wave(core, 1 / 30);
  const before = Float32Array.from(core.colBuf);
  const overlayState = JSON.parse(JSON.stringify(OV_DEFAULTS)); // all on:false
  runOverlays(core, 1 / 30, overlayState);
  assert.deepStrictEqual(Array.from(core.colBuf), Array.from(before));
});

test('all 13 overlays on simultaneously: 60 ticks, no NaN, colBuf actually changes', () => {
  const core = new CubeCore(16);
  const overlayState = allOnState();
  const dt = 1 / 30;
  for (let i = 0; i < 60; i++) {
    EFFECTS.wave(core, dt);
    assert.ok(!hasNaN(core.colBuf), `NaN after effect at tick ${i}`);
    runOverlays(core, dt, overlayState);
    assert.ok(!hasNaN(core.colBuf), `NaN after runOverlays at tick ${i}`);
  }
});

test('overlays produce a visibly different frame than the effect alone', () => {
  const dt = 1 / 30;
  const coreA = new CubeCore(16);
  const coreB = new CubeCore(16);
  const overlayState = allOnState();
  for (let i = 0; i < 20; i++) {
    EFFECTS.wave(coreA, dt);
    EFFECTS.wave(coreB, dt);
    runOverlays(coreB, dt, overlayState);
  }
  let diff = 0;
  for (let i = 0; i < coreA.colBuf.length; i++) if (Math.abs(coreA.colBuf[i] - coreB.colBuf[i]) > 1e-6) diff++;
  assert.ok(diff > 0, 'expected overlays to change at least some colBuf values');
});

test('globalBright<0.99 scales only the positive overlay delta, not negative deltas', () => {
  // Ported verbatim from runOverlays()'s low-globalBright branch: only
  // `delta > 0` (additive overlays like stars/snow brightening a pixel)
  // gets multiplied by globalBright; a negative delta (dimming overlays
  // like pulse/vignette/glitch darkening a pixel) is applied at full
  // strength either way - see effects-core.js's runOverlays() and
  // overlays.js's runOverlays() `apply()`/scaling loop. So comparing
  // globalBright=1.0 vs globalBright=0.3 output on the SAME starting frame,
  // every LED should end up between (or equal to) the two bounds implied by
  // "less brightening, same darkening" - concretely: the 0.3 run's total
  // positive contribution over the base frame is <= the 1.0 run's.
  // Uses colorwave (a purely additive overlay - it only ever brightens a
  // pixel, never dims it) called with dt=0 so the shared, module-wide
  // ovPulseT clock (which every runOverlays() call anywhere - including
  // earlier tests in this file - advances by dt) doesn't move between the
  // two calls below; with dt=0 both calls see the exact same ovPulseT
  // value, making colorwave's otherwise-history-dependent output
  // reproducible for this comparison.
  function additiveOnState(gb) {
    const s = JSON.parse(JSON.stringify(OV_DEFAULTS));
    s.colorwave.on = true;
    s.globalBright = gb;
    return s;
  }
  const coreFull = new CubeCore(16);
  const coreDim = new CubeCore(16);
  EFFECTS.wave(coreFull, 1 / 30);
  EFFECTS.wave(coreDim, 1 / 30);
  const base = Float32Array.from(coreFull.colBuf); // same starting frame for both
  const overlayFull = additiveOnState(1.0);
  const overlayDim = additiveOnState(0.3);
  runOverlays(coreFull, 0, overlayFull);
  runOverlays(coreDim, 0, overlayDim);
  let sawSmallerPositiveDelta = false;
  for (let i = 0; i < base.length; i++) {
    const deltaFull = coreFull.colBuf[i] - base[i];
    const deltaDim = coreDim.colBuf[i] - base[i];
    if (deltaFull > 1e-6) {
      assert.ok(deltaDim <= deltaFull + 1e-6, `positive delta at ${i} not scaled down (full=${deltaFull}, dim=${deltaDim})`);
      if (deltaDim < deltaFull - 1e-6) sawSmallerPositiveDelta = true;
    }
  }
  assert.ok(sawSmallerPositiveDelta, 'expected at least one LED where globalBright=0.3 visibly reduced the overlays\' positive contribution');
});

test('faceMembership bitmask: a corner LED belongs to exactly 3 faces', () => {
  const core = new CubeCore(8);
  let found = false;
  for (let i = 0; i < core.N; i++) {
    const bits = core.faceMembership[i];
    let count = 0, n = bits;
    while (n) { count += n & 1; n >>>= 1; }
    if (count === 3) { found = true; break; }
  }
  assert.ok(found, 'expected at least one corner LED with 3-face membership');
});

console.log('All overlays tests passed');
