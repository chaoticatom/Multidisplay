// Covers a real request: the "✕ Clear All" button (was greyed out,
// unwired).
const assert = require('assert');
const WebSocket = require('ws');
const WsServer = require('../src/wsServer');

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
  const config = { size: 64, mode: 'cube', panels: [{ gx: 0, gy: 0 }] };
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

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll clearAll tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
