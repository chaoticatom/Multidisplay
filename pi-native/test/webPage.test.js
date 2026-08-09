// Verifies the control page + effects.json are actually served on the
// same port as the WebSocket server (see wsServer.js's _handleHttp) - the
// fix for a real user report: browsing to http://<pi>:8081/ showed
// "Upgrade Required" because the server used to be WebSocket-only, with
// no plain HTTP handling at all.
const assert = require('assert');
const WsServer = require('../src/wsServer');

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

async function run() {
  const port = 40000 + Math.floor(Math.random() * 10000);
  const state = { effect: 'wave', brightness: 1, speed: 1 };
  const config = { size: 64, mode: 'cube' };
  const server = new WsServer(port, state, config, () => {});
  await new Promise((r) => setTimeout(r, 100));

  await test('GET / serves the control page as HTML', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/`);
    assert.strictEqual(resp.status, 200);
    assert.ok(resp.headers.get('content-type').includes('text/html'));
    const html = await resp.text();
    assert.ok(html.includes('Multidisplay'));
    assert.ok(html.includes('WebSocket'));
  });

  await test('GET /effects.json returns the effect name map', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/effects.json`);
    assert.strictEqual(resp.status, 200);
    assert.ok(resp.headers.get('content-type').includes('application/json'));
    const data = await resp.json();
    assert.ok(data.wave, 'expected a "wave" entry');
    assert.strictEqual(typeof data.wave, 'string');
  });

  await test('GET of an unknown path returns 404, not a crash', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/nonexistent`);
    assert.strictEqual(resp.status, 404);
  });

  await test('the WebSocket upgrade still works on the same port', async () => {
    const WebSocket = require('ws');
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const msg = await new Promise((resolve, reject) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
      ws.on('error', reject);
    });
    assert.strictEqual(msg.cmd, 'state');
    ws.close();
  });

  server.close();

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll webPage tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
