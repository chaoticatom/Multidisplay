// Verifies the HTTPS listener (see wsServer.js's module comment and
// tls.js): a real report traced the Video Display webcam/screen-capture
// buttons staying permanently greyed out to getUserMedia()/
// getDisplayMedia() being unavailable entirely outside a secure context
// (browser policy) - the fix was a second, self-signed-cert HTTPS
// listener on port+1 alongside the existing plain-HTTP one. Requires
// `openssl` (same as the Pi this runs on in production) - skips cleanly
// if it's not on this machine's PATH rather than failing the whole suite.
const assert = require('assert');
const https = require('https');
const { execFileSync } = require('child_process');
const fs = require('fs');
const WsServer = require('../src/wsServer');
const { KEY_PATH, CERT_PATH } = require('../src/tls');

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

function hasOpenssl() {
  try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

async function run() {
  if (!hasOpenssl()) {
    console.log('  skip - openssl not available on this machine, cannot test the HTTPS listener');
    console.log('\nAll httpsListener tests passed (skipped)');
    process.exit(0);
  }

  const port = 40000 + Math.floor(Math.random() * 10000);
  const state = { effect: 'wave', brightness: 1, speed: 1 };
  const config = { size: 64, mode: 'cube' };
  const server = new WsServer(port, state, config, () => {});
  await new Promise((r) => setTimeout(r, 200)); // cert generation + listen

  await test('a self-signed cert was generated on disk', () => {
    assert.ok(fs.existsSync(KEY_PATH), 'expected a key file to exist');
    assert.ok(fs.existsSync(CERT_PATH), 'expected a cert file to exist');
  });

  await test('the HTTPS listener serves the same control page on port+1', async () => {
    const body = await new Promise((resolve, reject) => {
      https.get(`https://127.0.0.1:${port + 1}/`, { rejectUnauthorized: false }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, data }));
      }).on('error', reject);
    });
    assert.strictEqual(body.status, 200);
    assert.ok(body.data.includes('Multidisplay'));
  });

  await test('a client connected via wss:// (HTTPS) receives the same state broadcasts as a plain ws:// client', async () => {
    const WebSocket = require('ws');
    const wssClient = new WebSocket(`wss://127.0.0.1:${port + 1}`, { rejectUnauthorized: false });
    const msg = await new Promise((resolve, reject) => {
      wssClient.on('message', (data) => resolve(JSON.parse(data.toString())));
      wssClient.on('error', reject);
    });
    assert.strictEqual(msg.cmd, 'state');
    assert.strictEqual(msg.effect, 'wave');
    wssClient.close();
    await new Promise((resolve) => wssClient.once('close', resolve));
  });

  await test('an HTTPS-connected client is tracked in the same unified client set the HTTP listener uses', async () => {
    // _broadcast()/maybeStreamFrame() both iterate this._clients (a single
    // Set populated by BOTH _wireConnection() calls - see wsServer.js's
    // constructor), not two separate per-listener client lists, so an
    // HTTPS client reaching broadcasts is a direct consequence of that
    // shared bookkeeping rather than something needing its own separate
    // code path to test end-to-end here.
    await new Promise((resolve) => setTimeout(resolve, 100)); // let any prior test's close handshake fully settle server-side first
    const before = server._clients.size;
    const WebSocket = require('ws');
    const httpsClient = new WebSocket(`wss://127.0.0.1:${port + 1}`, { rejectUnauthorized: false });
    await new Promise((resolve, reject) => { httpsClient.once('open', resolve); httpsClient.once('error', reject); });
    assert.strictEqual(server._clients.size, before + 1, 'expected the HTTPS client to be added to the shared client set');
    httpsClient.close();
    // The client's own 'close' event firing doesn't guarantee the SERVER
    // side has finished its half of the close handshake (and run its own
    // ws.on('close', ...) cleanup, which is what actually removes it from
    // this._clients) in the same tick - a short delay avoids a race here.
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(server._clients.size, before, 'expected the client to be removed from the shared set on close');
  });

  server.close();

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll httpsListener tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
