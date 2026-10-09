// Network watchdog (src/netWatch.js), with commands and the clock faked.
'use strict';
const assert = require('assert');
const { createNetWatch } = require('../src/netWatch');
console.log('netWatch');
const quiet = { log() {}, warn() {}, error() {} };
function fake(replies = {}) {
  const calls = [];
  const run = async (cmd, args) => { const c = cmd + ' ' + args.join(' '); calls.push(c); const k = Object.keys(replies).find((p) => c.startsWith(p)); return k ? replies[k] : { code: 0, out: '' }; };
  return { run, calls };
}
(async () => {
  try {
    // Tunnel installed but stopped: started again. Not installed: left alone.
    let f = fake({ 'systemctl is-active cloudflared': { code: 3, out: 'failed\n' } });
    let w = createNetWatch({ run: f.run, probe: async () => true, log: quiet });
    await w.tunnelCheck();
    assert.ok(f.calls.includes('systemctl restart cloudflared'));
    f = fake({ 'systemctl is-enabled cloudflared': { code: 1, out: 'Failed to get unit file state' } });
    w = createNetWatch({ run: f.run, probe: async () => true, log: quiet });
    await w.tunnelCheck();
    assert.ok(!f.calls.some((c) => c.includes('restart')));
    assert.strictEqual(w.status.tunnel, 'not installed');
    console.log('  ok - a stopped tunnel is started; no tunnel is left alone');

    // Offline: Wi-Fi restarted on the third failed check, reboot only after 20 min.
    let t = 1e12, online = false;
    f = fake();
    w = createNetWatch({ run: f.run, probe: async () => online, now: () => t, uptimeS: () => 3600, log: quiet });
    await w.check(); await w.check();
    assert.ok(!f.calls.some((c) => c.startsWith('nmcli')), 'not before the third failure');
    await w.check();
    assert.ok(f.calls.includes('nmcli radio wifi off') && f.calls.includes('nmcli radio wifi on'));
    assert.ok(!f.calls.includes('systemctl reboot'));
    t += 21 * 60000; await w.check();
    assert.ok(f.calls.includes('systemctl reboot'), 'reboots after 20 minutes offline');
    const n = f.calls.filter((c) => c === 'systemctl reboot').length;
    t += 60000; await w.check();
    assert.strictEqual(f.calls.filter((c) => c === 'systemctl reboot').length, n, 'not again within 6 hours');
    online = true; await w.check();
    assert.ok(w.status.online && f.calls.includes('systemctl restart cloudflared'), 'back online: the tunnel is restarted');
    console.log('  ok - offline: Wi-Fi restart, then a reboot at most once per 6 hours');

    // Freshly booted Pi: never reboots in its first 30 minutes.
    f = fake(); t = 1e12;
    w = createNetWatch({ run: f.run, probe: async () => false, now: () => t, uptimeS: () => 600, log: quiet });
    await w.check(); t += 25 * 60000; await w.check();
    assert.ok(!f.calls.includes('systemctl reboot'));
    console.log('  ok - no reboot in the first 30 minutes after boot');
  } catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
})();
