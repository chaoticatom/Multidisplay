// Can't test actual nmcli/AP behavior end-to-end (no NetworkManager, no
// wlan0, no real network hardware in this sandbox) - the command-runner is
// injectable so the orchestration logic and the portal's real HTTP server
// (that part IS testable - it's just Node's http module, no hardware
// dependency) are exercised against a fake nmcli.
const assert = require('assert');
const wifiSetup = require('../src/wifiSetup');

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${label}`)), ms)),
  ]);
}

async function test(name, fn) {
  try {
    await withTimeout(Promise.resolve().then(fn), 5000, name);
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Fake nmcli - records every call, returns canned output per command.
function makeFakeNmcli(responses = {}) {
  const calls = [];
  const runFn = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const key = args.join(' ');
    for (const [pattern, output] of Object.entries(responses)) {
      if (key.startsWith(pattern)) return output;
    }
    return '';
  };
  runFn.calls = calls;
  return runFn;
}

async function run() {
  console.log('isConnected()');
  await test('true when a non-loopback device is connected', async () => {
    const runFn = makeFakeNmcli({
      '-t -f DEVICE,TYPE,STATE device status':
        'lo:loopback:unmanaged\nwlan0:wifi:connected\np2p-dev-wlan0:wifi_p2p:disconnected\n',
    });
    assert.strictEqual(await wifiSetup.isConnected(runFn), true);
  });
  await test('false when nothing but loopback is connected', async () => {
    const runFn = makeFakeNmcli({
      '-t -f DEVICE,TYPE,STATE device status':
        'lo:loopback:unmanaged\nwlan0:wifi:disconnected\n',
    });
    assert.strictEqual(await wifiSetup.isConnected(runFn), false);
  });
  await test('false on empty output rather than throwing', async () => {
    const runFn = makeFakeNmcli({});
    assert.strictEqual(await wifiSetup.isConnected(runFn), false);
  });

  console.log('startAccessPoint() / stopAccessPoint()');
  await test('issues the expected nmcli sequence to create the AP', async () => {
    const runFn = makeFakeNmcli();
    await wifiSetup.startAccessPoint(runFn);
    const cmds = runFn.calls.map((c) => c.join(' '));
    assert.ok(cmds.some((c) => c.includes('connection add type wifi') && c.includes(wifiSetup.AP_SSID)), 'expected a connection-add call with the AP SSID');
    assert.ok(cmds.some((c) => c.includes('802-11-wireless.mode ap')), 'expected AP mode to be set');
    assert.ok(cmds.some((c) => c.includes('wifi-sec.psk') && c.includes(wifiSetup.AP_PASSWORD)), 'expected the AP password to be set');
    assert.ok(cmds.some((c) => c === `nmcli connection up ${wifiSetup.AP_CON_NAME}`), 'expected the connection to be brought up');
  });
  await test('stopAccessPoint tears down what startAccessPoint created', async () => {
    const runFn = makeFakeNmcli();
    await wifiSetup.stopAccessPoint(runFn);
    const cmds = runFn.calls.map((c) => c.join(' '));
    assert.ok(cmds.some((c) => c === `nmcli connection down ${wifiSetup.AP_CON_NAME}`));
    assert.ok(cmds.some((c) => c === `nmcli connection delete ${wifiSetup.AP_CON_NAME}`));
  });

  console.log('connectToNetwork()');
  await test('rejects a missing ssid', async () => {
    await assert.rejects(() => wifiSetup.connectToNetwork(undefined, 'pw', makeFakeNmcli()));
  });
  await test('includes the password when given', async () => {
    const runFn = makeFakeNmcli();
    await wifiSetup.connectToNetwork('HomeWifi', 'hunter2', runFn);
    assert.deepStrictEqual(runFn.calls[0], ['nmcli', 'device', 'wifi', 'connect', 'HomeWifi', 'password', 'hunter2']);
  });
  await test('omits the password for an open network', async () => {
    const runFn = makeFakeNmcli();
    await wifiSetup.connectToNetwork('OpenWifi', '', runFn);
    assert.deepStrictEqual(runFn.calls[0], ['nmcli', 'device', 'wifi', 'connect', 'OpenWifi']);
  });

  console.log('captive portal HTTP server (real Node http server, no hardware needed)');
  await test('GET / serves the setup page, then POST /connect resolves on success', async () => {
    const port = 20000 + Math.floor(Math.random() * 10000);
    const connectedPromise = wifiSetup.startPortalServer(port, async (ssid, password) => {
      assert.strictEqual(ssid, 'HomeWifi');
      assert.strictEqual(password, 'hunter2');
    });
    await new Promise((r) => setTimeout(r, 100)); // let the server actually start listening

    const getResp = await fetch(`http://127.0.0.1:${port}/`);
    const html = await getResp.text();
    assert.strictEqual(getResp.status, 200);
    assert.ok(html.includes('Connect Multidisplay to WiFi'));

    const postResp = await fetch(`http://127.0.0.1:${port}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssid: 'HomeWifi', password: 'hunter2' }),
    });
    const data = await postResp.json();
    assert.strictEqual(data.ok, true);

    const result = await connectedPromise;
    assert.strictEqual(result.ssid, 'HomeWifi');
    result.server.close();
  });
  await test('POST /connect with a failing connectFn returns ok:false and keeps the server alive', async () => {
    const port = 30000 + Math.floor(Math.random() * 10000);
    let resolved = false;
    let attempt = 0;
    // Fails the first attempt, succeeds the second - lets the test both
    // verify failure handling AND cleanly resolve the server for teardown,
    // instead of leaving a dangling always-failing server/promise.
    const connectedPromise = wifiSetup.startPortalServer(port, async () => {
      attempt++;
      if (attempt === 1) throw new Error('bad password');
    });
    connectedPromise.then(() => { resolved = true; });
    await new Promise((r) => setTimeout(r, 100));

    const resp = await fetch(`http://127.0.0.1:${port}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssid: 'HomeWifi', password: 'wrong' }),
    });
    const data = await resp.json();
    assert.strictEqual(data.ok, false);
    assert.ok(data.error.includes('bad password'));
    assert.strictEqual(resolved, false, 'server should still be waiting for a successful attempt, not resolved');

    // GET / should still work - server wasn't torn down after the failure.
    const resp2 = await fetch(`http://127.0.0.1:${port}/`);
    assert.strictEqual(resp2.status, 200);

    // Retry succeeds - resolves the server so teardown is clean.
    const resp3 = await fetch(`http://127.0.0.1:${port}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssid: 'HomeWifi', password: 'right' }),
    });
    const data3 = await resp3.json();
    assert.strictEqual(data3.ok, true);
    const result = await connectedPromise;
    result.server.close();
  });

  console.log('ensureWifiConnected()');
  await test('skips AP setup entirely when already connected', async () => {
    const runFn = makeFakeNmcli({
      '-t -f DEVICE,TYPE,STATE device status': 'eth0:ethernet:connected\n',
    });
    await wifiSetup.ensureWifiConnected({ runFn, log: () => {} });
    assert.strictEqual(runFn.calls.length, 1, 'should only have checked connectivity, nothing else');
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll wifiSetup tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
