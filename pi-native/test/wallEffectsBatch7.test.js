// Smoke tests for the seventh batch of wall-mode effects: weather,
// datetime, moon (celestial), ghost - see gradientWashWall.js/
// wallEffectsBatch1-6.test.js for the established pattern this follows.
//
// All four are "information display" effects that already had a
// `core.panelMode==='2d'` single-flat-panel branch (or, for celestial/
// ghost, an inherently single-centered-scene shape) in their cube-mode
// source - see weatherWall.js/datetimeWall.js/celestialWall.js/
// ghostWall.js's module comments for exactly how each one generalizes.
// weather and datetime are full-canvas spatial-math effects (sky
// gradient/horizon/ticker across the whole wall, clock hands centered on
// the true wall center) so those get a left/right-half brightness-sum
// continuity check. celestial/ghost are single-centered-scene effects
// (a moon/planet/ghost face centered on the FULL wall) so those get an
// explicit "content is centered on wallW/2, not on a single 64px panel"
// check instead.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectWeatherWall = require('../src/effects/weatherWall');
const effectDateTimeWall = require('../src/effects/datetimeWall');
const effectCelestialWall = require('../src/effects/celestialWall');
const effectGhostWall = require('../src/effects/ghostWall');
const { createWxState } = require('../src/effects/weather/state');
const effectWeatherWallCore = require('../src/effects/weather/weatherWall');

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

function makeWallCore() {
  const core = new CubeCore(64);
  core.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64); // two panels side by side -> 128x64
  assert.strictEqual(core.wallW, 128);
  assert.strictEqual(core.wallH, 64);
  core.t = 0;
  core.speedMult = 1;
  core.effectOptions = {};
  return core;
}

function assertFiniteThroughout(core) {
  for (let i = 0; i < core.wallBuf.length; i++) {
    assert.ok(Number.isFinite(core.wallBuf[i]), 'expected finite wallBuf value at ' + i);
  }
}

function assertFiniteAndNonZero(core) {
  assertFiniteThroughout(core);
  assert.ok(core.wallBuf.some((v) => v !== 0), 'expected the effect to have drawn something');
}

function halfSums(core) {
  const { wallW: W, wallH: H, wallBuf: buf } = core;
  let left = 0, right = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      const s = buf[o] + buf[o + 1] + buf[o + 2];
      if (x < W / 2) left += s; else right += s;
    }
  }
  return { left, right };
}

async function main() {
  // ── weather ── (no network in this sandbox - exercise the renderer
  // directly against a hand-built wxState, same approach test/weather.test.js
  // uses for the cube version, avoiding fetchWeather()/real network calls)
  test('weatherWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    core.speedMult = 1;
    const wxState = createWxState();
    effectWeatherWallCore(core, 0.05, wxState, 1);
  });

  test('weatherWall renders finite, non-zero output spanning the full wallW x wallH canvas', () => {
    const core = makeWallCore();
    const wxState = createWxState();
    wxState.code = 0; wxState.cityDisplay = 'London, UK';
    wxState.sunriseS = 21600; wxState.sunsetS = 72000;
    wxState.moonriseS = 3600; wxState.moonsetS = 43200;
    for (let i = 0; i < 30; i++) effectWeatherWallCore(core, 1 / 30, wxState, 1);
    assertFiniteAndNonZero(core);
    // Sky/ground gradient math is genuinely spatial across the whole
    // canvas (not a single centered scene) - both halves of a 2-panel-wide
    // wall should have picked up real brightness, not just the left panel
    // that would exist on a single 64x64 panel.
    const { left, right } = halfSums(core);
    assert.ok(left > 0 && right > 0, `expected both halves lit, got left=${left} right=${right}`);
  });

  test('weatherWall: every weather code exercised across many ticks stays finite (storm/lightning, rain, snow, fog)', () => {
    const core = makeWallCore();
    for (const code of [0, 3, 45, 61, 71, 95]) {
      const wxState = createWxState();
      wxState.code = code; wxState.cityDisplay = 'Reykjavik';
      wxState.sunriseS = 21600; wxState.sunsetS = 72000;
      wxState.moonriseS = 3600; wxState.moonsetS = 43200;
      for (let i = 0; i < 40; i++) effectWeatherWallCore(core, 1 / 20, wxState, 1);
      assertFiniteThroughout(core);
    }
  });

  test('weatherWall: long city name ticker scrolls across the full wallW without throwing', () => {
    const core = makeWallCore();
    const wxState = createWxState();
    wxState.code = 0;
    wxState.cityDisplay = 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch, UK';
    wxState.sunriseS = 21600; wxState.sunsetS = 72000;
    wxState.moonriseS = -1; wxState.moonsetS = -1;
    for (let i = 0; i < 60; i++) effectWeatherWallCore(core, 1 / 20, wxState, 1);
    assertFiniteAndNonZero(core);
  });

  // ── datetime ──
  test('datetimeWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectDateTimeWall(core, 0.05);
  });

  for (const mode of ['time', 'date', 'both', 'full', 'analogue', 'words']) {
    test(`datetimeWall mode=${mode} renders finite, non-zero output`, () => {
      const core = makeWallCore();
      core.effectOptions = { datetime: { mode } };
      for (let i = 0; i < 10; i++) effectDateTimeWall(core, 1 / 20);
      assertFiniteAndNonZero(core);
    });
  }

  test('datetimeWall analogue clock is centered on the FULL wall (hands reach past x=64 into the second panel)', () => {
    const core = makeWallCore();
    core.effectOptions = { datetime: { mode: 'analogue' } };
    for (let i = 0; i < 5; i++) effectDateTimeWall(core, 1 / 20);
    assertFiniteAndNonZero(core);
    const { wallW: W, wallH: H, wallBuf: buf } = core;
    // The clock face frame is drawn out to half=min(W,H)*0.42=~26.9px from
    // true center (64,32) - it should reach well past x=64 (the boundary
    // between the two panels) on the right side, proving centering used
    // the full wall width, not a single-panel-centered x=32.
    let litPastMidpoint = false;
    for (let y = 0; y < H; y++) {
      for (let x = Math.floor(W / 2) + 5; x < W; x++) {
        const o = (y * W + x) * 3;
        if (buf[o] + buf[o + 1] + buf[o + 2] > 0.05) { litPastMidpoint = true; break; }
      }
      if (litPastMidpoint) break;
    }
    assert.ok(litPastMidpoint, 'expected the analogue clock to extend past the wall midpoint (x=64), proving it is centered on the full wall');
  });

  test('datetimeWall scroll ticker mode does not throw across many ticks', () => {
    const core = makeWallCore();
    core.effectOptions = { datetime: { mode: 'time', scroll: true, scrollSpeed: 2 } };
    for (let i = 0; i < 60; i++) effectDateTimeWall(core, 1 / 20);
    assertFiniteAndNonZero(core);
  });

  // ── celestial (moon) ──
  test('celestialWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectCelestialWall(core, 0.05);
  });

  for (const body of ['moon', 'earth', 'saturn', 'sun', 'blackhole', 'solarsystem', 'jupiter', 'pluto']) {
    test(`celestialWall body=${body} renders finite, non-zero output`, () => {
      const core = makeWallCore();
      core.effectOptions = { moon: { body, solarSpeed: 0 } };
      for (let i = 0; i < 8; i++) effectCelestialWall(core, 1 / 20);
      assertFiniteAndNonZero(core);
    });
  }

  test('celestialWall moon disc is centered on the FULL wall, not a single 64px panel', () => {
    const core = makeWallCore();
    core.effectOptions = { moon: { body: 'moon' } };
    for (let i = 0; i < 5; i++) effectCelestialWall(core, 1 / 20);
    assertFiniteAndNonZero(core);
    const { wallW: W, wallH: H, wallBuf: buf } = core;
    // moonRad = min(W,H)*0.42-1 = ~25.9, centered at (64, 32+4=36) - the
    // disc should be lit at x=64 (the true center) and should NOT be lit
    // out at a single-panel-centered x=32 minus a full radius away, i.e.
    // brightness right around the true wall center should exceed what's
    // near the naive single-panel center (32, 36).
    const brightnessAt = (x, y) => { const o = (y * W + x) * 3; return buf[o] + buf[o + 1] + buf[o + 2]; };
    const atTrueCenter = brightnessAt(Math.round(W / 2), Math.round(H / 2) + 4);
    assert.ok(atTrueCenter > 0.1, `expected the moon disc lit at the true wall center (64,36), got brightness=${atTrueCenter}`);
  });

  // ── ghost ──
  test('ghostWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectGhostWall(core, 0.05);
  });

  test('ghostWall renders a centered scene on the full wall across a full emerge/present/retreat cycle', () => {
    const core = makeWallCore();
    let sawContentPastMidpoint = false;
    // hidden -> emerging (~2.2s) -> present (3-6s) -> retreating (~2s) -
    // run enough ticks to guarantee passing through 'present' at least once.
    for (let i = 0; i < 400; i++) {
      effectGhostWall(core, 1 / 20);
      assertFiniteThroughout(core);
      const { wallW: W, wallH: H, wallBuf: buf } = core;
      for (let y = 0; y < H && !sawContentPastMidpoint; y++) {
        for (let x = Math.floor(W / 2); x < W; x++) {
          const o = (y * W + x) * 3;
          if (buf[o] + buf[o + 1] + buf[o + 2] > 0.05) { sawContentPastMidpoint = true; break; }
        }
      }
    }
    assert.ok(core.wallBuf.some((v) => v !== 0), 'expected the ghost to have drawn something over a full cycle');
    assert.ok(sawContentPastMidpoint, 'expected the ghost face (radius ~min(W,H)*0.78, centered at W/2,H/2) to extend past the wall midpoint, proving it is centered on the full wall, not a single panel');
  });
}

main().then(() => {
  if (process.exitCode) {
    console.log('\nFAILED');
    process.exit(1);
  } else {
    console.log('\nAll wall effects batch 7 tests passed');
  }
});
