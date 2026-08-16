// Test for weatherConfig.js (last-selected-city persistence for the Weather
// effect) and its wiring into wsServer.js's setEffectOption handler.
//
// Real report: the weather effect always reverted to "London" on every
// restart instead of remembering the last city the user picked, because
// core.effectOptions.weather.city only ever lived in wsServer.js's
// in-memory state, never on disk. This checks the load/save round-trip
// and that sending setEffectOption for effect:'weather', key:'city' over a
// live WsServer actually persists it.
//
// weatherConfig.js's load()/save() close over CONFIG_PATH as a module-level
// const, so (unlike stubbing unsplashConfig.load/save at the call-site) the
// only way to test it without touching the real weather-config.json is to
// save/restore that file's actual content around each test.
const assert = require('assert');
const fs = require('fs');
const WebSocket = require('ws');
const WsServer = require('../src/wsServer');
const weatherConfig = require('../src/weatherConfig');

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

function withRealConfigFile(fn) {
  const hadFile = fs.existsSync(weatherConfig.CONFIG_PATH);
  const original = hadFile ? fs.readFileSync(weatherConfig.CONFIG_PATH, 'utf8') : null;
  try {
    return fn();
  } finally {
    if (hadFile) fs.writeFileSync(weatherConfig.CONFIG_PATH, original);
    else if (fs.existsSync(weatherConfig.CONFIG_PATH)) fs.unlinkSync(weatherConfig.CONFIG_PATH);
  }
}

async function withServer(fn) {
  const port = 40000 + Math.floor(Math.random() * 10000);
  const state = { effect: 'weather', brightness: 1, speed: 1, effectOptions: {} };
  const config = { size: 64, mode: 'cube', panels: [{ gx: 0, gy: 0 }], physicalCubePanels: 6 };
  const server = new WsServer(port, state, config, () => {});
  await new Promise((r) => setTimeout(r, 100));
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const initialState = new Promise((resolve, reject) => { ws.once('message', resolve); ws.once('error', reject); });
  await initialState;
  try {
    await fn({ server, ws, port });
  } finally {
    ws.close();
    server.close();
  }
}

function nextMessage(ws) {
  return new Promise((resolve) => ws.once('message', (d) => resolve(JSON.parse(d.toString()))));
}

async function run() {
  await test('save() then load() round-trips the city on disk', () => {
    withRealConfigFile(() => {
      weatherConfig.save({ city: 'Paris, France' });
      const cfg = weatherConfig.load();
      assert.deepStrictEqual(cfg, { city: 'Paris, France' });
    });
  });

  await test('isValidConfig rejects malformed shapes', () => {
    assert.strictEqual(weatherConfig.isValidConfig(null), false);
    assert.strictEqual(weatherConfig.isValidConfig({}), false);
    assert.strictEqual(weatherConfig.isValidConfig({ city: 123 }), false);
    assert.strictEqual(weatherConfig.isValidConfig({ city: 'London' }), true);
  });

  await test('load() falls back to defaults on corrupt JSON without throwing', () => {
    withRealConfigFile(() => {
      fs.writeFileSync(weatherConfig.CONFIG_PATH, '{not valid json');
      const cfg = weatherConfig.load();
      assert.deepStrictEqual(cfg, { city: '' });
    });
  });

  await test('load() falls back to defaults when the file is missing', () => {
    withRealConfigFile(() => {
      if (fs.existsSync(weatherConfig.CONFIG_PATH)) fs.unlinkSync(weatherConfig.CONFIG_PATH);
      const cfg = weatherConfig.load();
      assert.deepStrictEqual(cfg, { city: '' });
    });
  });

  await withServer(async ({ ws }) => {
    await test('"setEffectOption" for weather/city persists to weatherConfig and broadcasts', async () => {
      await withRealConfigFile(async () => {
        ws.send(JSON.stringify({ cmd: 'setEffectOption', effect: 'weather', key: 'city', value: 'Tokyo, Japan' }));
        const msg = await nextMessage(ws);
        assert.strictEqual(msg.effectOptions.weather.city, 'Tokyo, Japan');
        const raw = JSON.parse(fs.readFileSync(weatherConfig.CONFIG_PATH, 'utf8'));
        assert.deepStrictEqual(raw, { city: 'Tokyo, Japan' });
      });
    });
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll weatherConfig tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
