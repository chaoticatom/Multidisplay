// Stress test for the weather effect port (pi-native/src/effects/weather/).
// Can't visually verify this (no renderer/hardware available - see
// pi-native/README.md) so this checks the only things possible without
// eyes on it: never throws, and colBuf stays finite/plausible-range across
// every weather code, a full sweep of times of day (via tzOffset, since
// the effect reads real Date.now() internally), both moon-up and moon-down
// cases, and both short and long city names (static vs. scrolling text).
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectWeather = require('../src/effects/weather/weather');
const { createWxState, wxInitScene } = require('../src/effects/weather/state');

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

function checkFinite(core, label) {
  for (let i = 0; i < core.colBuf.length; i++) {
    const v = core.colBuf[i];
    assert.ok(Number.isFinite(v), `${label}: non-finite value ${v} at colBuf[${i}]`);
    assert.ok(v >= -0.5 && v <= 2.0, `${label}: colBuf[${i}]=${v} looks out of plausible range`);
  }
}

const WEATHER_CODES = [0, 1, 2, 3, 45, 48, 51, 55, 61, 65, 71, 75, 80, 82, 85, 86, 95, 96, 99];

console.log('effectWeather: every weather code, several tzOffsets (times of day), city name variants, both panel modes');
for (const code of WEATHER_CODES) {
  for (const tzOffset of [0, -6 * 3600, 6 * 3600, 12 * 3600]) {
    for (const cityDisplay of ['London, UK', 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch, UK']) {
      for (const panelMode of ['cube', '2d']) {
        test(`code=${code} tzOffset=${tzOffset} city="${cityDisplay.slice(0, 12)}..." panelMode=${panelMode}`, () => {
          const core = new CubeCore(64);
          core.speedMult = 1;
          core.panelMode = panelMode;
          const wxState = createWxState();
          wxState.code = code;
          wxState.tzOffset = tzOffset;
          wxState.cityDisplay = cityDisplay;
          wxState.sunriseS = 21600;
          wxState.sunsetS = 72000;
          // Exercise both moon-up and moon-down branches across runs.
          wxState.moonriseS = 3600;
          wxState.moonsetS = 43200;
          wxInitScene(code, wxState, core.SIZE, panelMode === '2d');
          // Several ticks so cloud/creature/particle motion and the
          // lightning-strike timer all get exercised, not just frame 1.
          for (let i = 0; i < 20; i++) {
            effectWeather(core, 1 / 30, wxState, 1);
          }
          checkFinite(core, `code=${code} panelMode=${panelMode}`);
        });
      }
    }
  }
}

console.log('effectWeather: is2d branches actually diverge from cube-mode output (not silently falling through)');
test('2d vs cube output differs for the same state/frame', () => {
  const coreCube = new CubeCore(64);
  coreCube.panelMode = 'cube';
  const core2d = new CubeCore(64);
  core2d.panelMode = '2d';
  const wxA = createWxState();
  wxA.code = 0; wxA.cityDisplay = 'London, UK'; wxA.sunriseS = 21600; wxA.sunsetS = 72000;
  wxA.moonriseS = 3600; wxA.moonsetS = 43200;
  const wxB = createWxState();
  Object.assign(wxB, JSON.parse(JSON.stringify({ ...wxA, clouds: undefined, particles: undefined, stars: undefined, skyline: undefined, skyShapes: undefined, creatures: undefined })));
  wxInitScene(0, wxA, coreCube.SIZE, false);
  wxInitScene(0, wxB, core2d.SIZE, true);
  for (let i = 0; i < 5; i++) {
    effectWeather(coreCube, 1 / 30, wxA, 1);
    effectWeather(core2d, 1 / 30, wxB, 1);
  }
  let differs = false;
  for (let i = 0; i < coreCube.colBuf.length; i++) {
    if (Math.abs(coreCube.colBuf[i] - core2d.colBuf[i]) > 1e-6) { differs = true; break; }
  }
  assert.ok(differs, 'expected 2d-mode output to differ from cube-mode output for the same weather state');
});

console.log('effectWeather: moon-down (moonriseS/moonsetS both -1) does not throw');
test('moon always down', () => {
  const core = new CubeCore(64);
  const wxState = createWxState();
  wxState.moonriseS = -1;
  wxState.moonsetS = -1;
  wxInitScene(0, wxState, core.SIZE);
  for (let i = 0; i < 10; i++) effectWeather(core, 1 / 30, wxState, 1);
  checkFinite(core, 'moon down');
});

console.log('effectWeather: re-entrant wxInitScene (weather code change mid-run) does not throw');
test('code change triggers re-init cleanly', () => {
  const core = new CubeCore(64);
  const wxState = createWxState();
  wxInitScene(0, wxState, core.SIZE);
  for (let i = 0; i < 5; i++) effectWeather(core, 1 / 30, wxState, 1);
  wxState.code = 99; // storm
  wxInitScene(99, wxState, core.SIZE);
  for (let i = 0; i < 30; i++) effectWeather(core, 1 / 30, wxState, 1); // long enough to likely trigger a lightning strike
  checkFinite(core, 'after code change to storm');
});

if (process.exitCode) {
  console.log('\nFAILED');
  process.exit(1);
} else {
  console.log('\nAll weather tests passed');
}
