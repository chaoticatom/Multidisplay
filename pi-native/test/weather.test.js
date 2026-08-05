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

console.log('effectWeather: every weather code, several tzOffsets (times of day), city name variants');
for (const code of WEATHER_CODES) {
  for (const tzOffset of [0, -6 * 3600, 6 * 3600, 12 * 3600]) {
    for (const cityDisplay of ['London, UK', 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch, UK']) {
      test(`code=${code} tzOffset=${tzOffset} city="${cityDisplay.slice(0, 12)}..."`, () => {
        const core = new CubeCore(64);
        core.speedMult = 1;
        const wxState = createWxState();
        wxState.code = code;
        wxState.tzOffset = tzOffset;
        wxState.cityDisplay = cityDisplay;
        wxState.sunriseS = 21600;
        wxState.sunsetS = 72000;
        // Exercise both moon-up and moon-down branches across runs.
        wxState.moonriseS = 3600;
        wxState.moonsetS = 43200;
        wxInitScene(code, wxState, core.SIZE);
        // Several ticks so cloud/creature/particle motion and the
        // lightning-strike timer all get exercised, not just frame 1.
        for (let i = 0; i < 20; i++) {
          effectWeather(core, 1 / 30, wxState, 1);
        }
        checkFinite(core, `code=${code}`);
      });
    }
  }
}

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
