// Wi-Fi at boot (src/wifiSetup.js ensureWifiConnected): a slow network must
// not strand the Pi in setup-hotspot mode (a real report: amber screen, no SSH).
'use strict';
const assert = require('assert');
const wifiSetup = require('../src/wifiSetup');
console.log('wifiBoot');

function fakeNmcli(connectedAfter) {
  let checks = 0;
  const calls = [];
  const runFn = async (cmd, args) => {
    const c = args.join(' '); calls.push(c);
    if (c === '-t -f DEVICE,TYPE,STATE device status') { checks++; return checks > connectedAfter ? 'wlan0:wifi:connected\n' : 'wlan0:wifi:disconnected\n'; }
    return '';
  };
  return { runFn, calls };
}
const fast = { sleep: () => Promise.resolve(), log: () => {}, portalPort: 0 };

(async () => {
  try {
    // Connected after a few checks: no hotspot at all.
    let f = fakeNmcli(4);
    await wifiSetup.ensureWifiConnected({ runFn: f.runFn, ...fast, waitMs: 60000 });
    assert.ok(!f.calls.some((c) => /hotspot|ap|802-11-wireless.mode/i.test(c) && !/device status/.test(c)), 'never opened the setup AP: ' + f.calls.filter((c) => !/device status/.test(c)).join(' | '));
    assert.strictEqual(wifiSetup.status.apActive, false);
    console.log('  ok - Wi-Fi slow at boot: waits for it instead of opening the hotspot');

    // Not connected for a long time: the AP opens, times out, closes, and the
    // saved network is tried again (here it then connects).
    let slept = 0;
    f = fakeNmcli(Infinity);
    const sleep = (ms) => { slept += ms; if (slept > 30 * 60000) f.runFn.connectNow = true; return Promise.resolve(); };
    const runFn = async (cmd, args) => { const out = await f.runFn(cmd, args); if (f.runFn.connectNow && args.join(' ') === '-t -f DEVICE,TYPE,STATE device status') return 'wlan0:wifi:connected\n'; return out; };
    await wifiSetup.ensureWifiConnected({ runFn, sleep, log: () => {}, portalPort: 0, waitMs: 60000, apMs: 10 * 60000, stepMs: 5000 });
    const nonStatus = f.calls.filter((c) => !/device status/.test(c));
    assert.ok(nonStatus.length > 0, 'the setup AP was opened');
    assert.strictEqual(wifiSetup.status.apActive, false, 'and closed again');
    console.log('  ok - an unused hotspot closes after its time and the saved network is retried');
  } catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
  process.exit(process.exitCode || 0);
})();
