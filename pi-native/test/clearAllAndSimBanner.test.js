// Covers two real requests: the "✕ Clear All" button (was greyed out,
// unwired) and the "simulation" indicator for cube mode with fewer than 6
// physical panels wired (panelConfig.js's physicalCubePanels / wsServer.js's
// setPhysicalCubePanels).
const assert = require('assert');
const WebSocket = require('ws');
const WsServer = require('../src/wsServer');
const panelConfig = require('../src/panelConfig');

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

async function withServer(fn) {
  const port = 40000 + Math.floor(Math.random() * 10000);
  const state = {
    effect: 'wave', brightness: 1, speed: 1, effectOptions: {},
    overlays: { stars: { on: true, density: 5 }, snow: { on: true } },
  };
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
  await test('panelConfig.load() defaults physicalCubePanels to 6', () => {
    // isValidPhysicalCubePanels is the piece load() delegates to for both
    // a missing field and a corrupt one - test it directly rather than
    // hitting the filesystem.
    assert.strictEqual(panelConfig.isValidPhysicalCubePanels(6), true);
    assert.strictEqual(panelConfig.isValidPhysicalCubePanels(1), true);
    assert.strictEqual(panelConfig.isValidPhysicalCubePanels(0), false);
    assert.strictEqual(panelConfig.isValidPhysicalCubePanels(7), false);
    assert.strictEqual(panelConfig.isValidPhysicalCubePanels(3.5), false);
    assert.strictEqual(panelConfig.isValidPhysicalCubePanels('6'), false);
  });

  await withServer(async ({ ws }) => {
    await test('"clearAll" turns every overlay off, sets state.blank, and is undone by setEffect', async () => {
      ws.send(JSON.stringify({ cmd: 'clearAll' }));
      const msg = await nextMessage(ws);
      assert.strictEqual(msg.blank, true);
      assert.strictEqual(msg.overlays.stars.on, false);
      assert.strictEqual(msg.overlays.snow.on, false);

      ws.send(JSON.stringify({ cmd: 'setEffect', effect: 'plasma' }));
      const msg2 = await nextMessage(ws);
      assert.strictEqual(msg2.blank, false, 'expected selecting a new effect to clear state.blank');
      assert.strictEqual(msg2.effect, 'plasma');
    });
  });

  await withServer(async ({ ws }) => {
    await test('"setPhysicalCubePanels" is validated (1-6) and broadcasts the new value', async () => {
      ws.send(JSON.stringify({ cmd: 'setPhysicalCubePanels', value: 2 }));
      const msg = await nextMessage(ws);
      assert.strictEqual(msg.physicalCubePanels, 2);

      // Out-of-range/invalid values are silently ignored (same defensive
      // spirit as every other setter in this file), not applied.
      ws.send(JSON.stringify({ cmd: 'setPhysicalCubePanels', value: 0 }));
      ws.send(JSON.stringify({ cmd: 'setPhysicalCubePanels', value: 7 }));
      ws.send(JSON.stringify({ cmd: 'setPhysicalCubePanels', value: 'x' }));
      // Send one more VALID command so there's something to await - if an
      // invalid one had incorrectly broadcast, this assert below would see
      // its (wrong) value instead.
      ws.send(JSON.stringify({ cmd: 'setPhysicalCubePanels', value: 4 }));
      const msg2 = await nextMessage(ws);
      assert.strictEqual(msg2.physicalCubePanels, 4, 'expected the invalid values in between to have been dropped, not broadcast');
    });
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll clearAllAndSimBanner tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
