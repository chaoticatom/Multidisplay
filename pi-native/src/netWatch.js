// Network watchdog, for "after a while the internet address shows Cloudflare
// error 1033 and I have to restart the Pi" (a real report): the Pi dropped
// off the network or the Cloudflare tunnel (cloudflared, set up by hand)
// stopped. The app runs as root, so it can look after both:
//   - Wi-Fi power saving off at start and every hour (a known cause of a Pi
//     quietly dropping off Wi-Fi after a while);
//   - every minute, can we reach the internet? After 3 failures in a row,
//     restart Wi-Fi, then the tunnel;
//   - every 2 minutes, if cloudflared is installed as a service but not
//     running, start it;
//   - last resort: 20 minutes with no internet reboots the Pi, at most once
//     every 6 hours and never in its first 30 minutes (so an internet outage
//     at the provider can't cause a reboot loop).
// `run(cmd, args)` -> Promise<{ code, out }>, `probe()` -> Promise<boolean>,
// `now()` and `uptimeS()` are injectable for the tests.
'use strict';
const net = require('net');
const os = require('os');
const { execFile } = require('child_process');

function defaultRun(cmd, args) {
  return new Promise((resolve) => execFile(cmd, args, { timeout: 20000 }, (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: String(stdout || '') + String(stderr || '') })));
}
// Can we open a connection to a well-known address? (No DNS needed.)
function defaultProbe() {
  const tryOne = (host) => new Promise((resolve) => {
    const s = net.connect({ host, port: 443, timeout: 5000 }, () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false)); s.on('timeout', () => { s.destroy(); resolve(false); });
  });
  return tryOne('1.1.1.1').then((ok) => ok || tryOne('8.8.8.8'));
}

function createNetWatch({ run = defaultRun, probe = defaultProbe, now = Date.now, uptimeS = os.uptime, log = console, rebootStampFile = null } = {}) {
  const status = { online: true, failures: 0, offlineSince: 0, lastFix: '', tunnel: 'unknown' };
  let lastReboot = 0;
  const fs = require('fs');
  if (rebootStampFile) { try { lastReboot = Number(fs.readFileSync(rebootStampFile, 'utf8')) || 0; } catch (e) { /* none yet */ } }

  async function powerSaveOff() {
    const r = await run('iw', ['dev', 'wlan0', 'set', 'power_save', 'off']);
    if (r.code !== 0 && !/No such device|command not found|ENOENT/i.test(r.out)) log.warn('[net] could not turn Wi-Fi power saving off: ' + r.out.trim().slice(0, 120));
  }

  async function tunnelCheck() {
    const enabled = await run('systemctl', ['is-enabled', 'cloudflared']);
    if (enabled.code !== 0) { status.tunnel = 'not installed'; return; }
    const active = (await run('systemctl', ['is-active', 'cloudflared'])).out.trim();
    status.tunnel = active;
    if (active !== 'active' && active !== 'activating') {
      log.warn('[net] the Cloudflare tunnel was ' + active + ' - starting it');
      await run('systemctl', ['restart', 'cloudflared']);
      status.lastFix = new Date(now()).toISOString().slice(11, 16) + ' tunnel restarted';
    }
  }

  async function check() {
    const ok = await probe();
    if (ok) {
      if (!status.online) { log.log('[net] back online'); if (status.failures >= 3) await run('systemctl', ['restart', 'cloudflared']); }
      status.online = true; status.failures = 0; status.offlineSince = 0;
      return status;
    }
    status.failures++;
    if (status.online) { status.online = false; status.offlineSince = now(); log.warn('[net] internet unreachable'); }
    if (status.failures === 3 || (status.failures > 3 && status.failures % 5 === 0)) {
      // Wi-Fi off and on again, then the tunnel (it can't recover by itself).
      log.warn('[net] still offline - restarting Wi-Fi');
      const r = await run('nmcli', ['radio', 'wifi', 'off']);
      if (r.code === 0) { await new Promise((res) => setTimeout(res, 3000)); await run('nmcli', ['radio', 'wifi', 'on']); }
      else { await run('ip', ['link', 'set', 'wlan0', 'down']); await new Promise((res) => setTimeout(res, 3000)); await run('ip', ['link', 'set', 'wlan0', 'up']); }
      await powerSaveOff();
      status.lastFix = new Date(now()).toISOString().slice(11, 16) + ' Wi-Fi restarted';
    }
    const offlineMin = (now() - status.offlineSince) / 60000;
    if (offlineMin >= 20 && uptimeS() > 30 * 60 && now() - lastReboot > 6 * 3600000) {
      log.error('[net] no internet for 20 minutes - rebooting the Pi');
      lastReboot = now();
      if (rebootStampFile) { try { fs.writeFileSync(rebootStampFile, String(lastReboot)); } catch (e) { /* best effort */ } }
      await run('systemctl', ['reboot']);
    }
    return status;
  }

  function start() {
    powerSaveOff();
    setTimeout(() => tunnelCheck().catch(() => {}), 30000).unref();
    setInterval(() => check().catch((e) => log.warn('[net] check failed: ' + e.message)), 60000).unref();
    setInterval(() => tunnelCheck().catch(() => {}), 120000).unref();
    setInterval(() => powerSaveOff().catch(() => {}), 3600000).unref();
  }

  return { start, check, tunnelCheck, powerSaveOff, status };
}

module.exports = { createNetWatch };
