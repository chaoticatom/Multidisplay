// WiFi provisioning via a captive-portal-style AP, mirroring the ESP32
// firmware's WiFiManager flow (firmware/src/wifi_setup.cpp): if there's no
// working network connection at boot, the Pi opens its own AP so you can
// connect from a phone/PC and submit real WiFi credentials, instead of
// needing SSH/a keyboard-and-monitor to configure it. Same AP credentials
// as the firmware for consistency: SSID "Multidisplay-Setup", password
// "cube1234" (firmware/src/config.h's AP_SSID/AP_PASSWORD).
//
// Uses NetworkManager (`nmcli`) - the default network stack on Raspberry
// Pi OS (Bullseye and later; older dhcpcd-based images would need this
// rewritten against a different tool). Not testable end-to-end in this
// sandbox (no NetworkManager, no wlan0, no real network hardware) - the
// command-runner is injectable (see `exec` param) so the orchestration
// logic and the portal's HTTP handling - the hardware-independent parts -
// are still unit-tested against a fake nmcli. See test/wifiSetup.test.js.
const { execFile } = require('child_process');
const http = require('http');

const AP_SSID = 'Multidisplay-Setup';
const AP_PASSWORD = 'cube1234';
const AP_CON_NAME = 'multidisplay-setup-ap';
const PORTAL_PORT = 80;
// NetworkManager's own DHCP/DNS (ipv4.method=shared) defaults to this
// subnet for AP clients - there's no way to know it without hardware, so
// this is the documented NetworkManager default, not something probed.
const AP_GATEWAY_IP = '10.42.0.1';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 20000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args.join(' ')} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

// True if any device other than loopback currently has an active
// connection (WiFi already configured and working, or wired Ethernet).
async function isConnected(runFn = run) {
  const out = await runFn('nmcli', ['-t', '-f', 'DEVICE,TYPE,STATE', 'device', 'status']);
  return out.split('\n').some((line) => {
    const [device, type, state] = line.split(':');
    if (!device || type === 'loopback') return false;
    return state === 'connected';
  });
}

async function startAccessPoint(runFn = run) {
  // Recreate cleanly each time rather than assuming a previous run's
  // profile is still valid - cheap, and avoids subtle state drift.
  await runFn('nmcli', ['connection', 'delete', AP_CON_NAME]).catch(() => {});
  await runFn('nmcli', ['connection', 'add', 'type', 'wifi', 'ifname', 'wlan0',
    'con-name', AP_CON_NAME, 'autoconnect', 'no', 'ssid', AP_SSID]);
  await runFn('nmcli', ['connection', 'modify', AP_CON_NAME,
    '802-11-wireless.mode', 'ap', '802-11-wireless.band', 'bg',
    'ipv4.method', 'shared']);
  await runFn('nmcli', ['connection', 'modify', AP_CON_NAME,
    'wifi-sec.key-mgmt', 'wpa-psk', 'wifi-sec.psk', AP_PASSWORD]);
  await runFn('nmcli', ['connection', 'up', AP_CON_NAME]);
}

async function stopAccessPoint(runFn = run) {
  await runFn('nmcli', ['connection', 'down', AP_CON_NAME]).catch(() => {});
  await runFn('nmcli', ['connection', 'delete', AP_CON_NAME]).catch(() => {});
}

async function connectToNetwork(ssid, password, runFn = run) {
  if (!ssid || typeof ssid !== 'string') throw new Error('ssid is required');
  const args = password
    ? ['device', 'wifi', 'connect', ssid, 'password', password]
    : ['device', 'wifi', 'connect', ssid];
  await runFn('nmcli', args);
}

// ---------------------------------------------------------------------------
// Captive-portal HTTP server. Deliberately simple (no DNS hijacking to
// force the OS's automatic "Sign in to network" popup, unlike a full
// captive-portal implementation) - same UX as the ESP32 firmware's own
// portal: connect to the AP, then manually browse to its address. A DNS
// redirect (dnsmasq intercepting all queries on the AP interface) would
// upgrade this to auto-popup, but is a separate, real chunk of additional
// infrastructure - noted as a possible follow-up, not built here.
// ---------------------------------------------------------------------------
const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Multidisplay WiFi Setup</title>
<style>
body{font-family:sans-serif;max-width:400px;margin:40px auto;padding:0 16px;background:#111;color:#eee}
h1{font-size:20px}
label{display:block;margin-top:16px;font-size:14px;color:#aaa}
input{width:100%;box-sizing:border-box;padding:10px;margin-top:4px;font-size:16px;background:#222;color:#eee;border:1px solid #444;border-radius:4px}
button{width:100%;margin-top:24px;padding:12px;font-size:16px;background:#3af;color:#fff;border:none;border-radius:4px}
#status{margin-top:16px;font-size:14px}
</style></head><body>
<h1>Connect Multidisplay to WiFi</h1>
<form id="f">
<label>Network name (SSID)<input name="ssid" required autocomplete="off"></label>
<label>Password<input name="password" type="password" autocomplete="off"></label>
<button type="submit">Connect</button>
</form>
<div id="status"></div>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('status');
  status.textContent = 'Connecting...';
  const fd = new FormData(e.target);
  try {
    const resp = await fetch('/connect', {method:'POST', body: JSON.stringify({
      ssid: fd.get('ssid'), password: fd.get('password')
    }), headers: {'Content-Type':'application/json'}});
    const data = await resp.json();
    status.textContent = data.ok
      ? 'Connected! This page will stop working as the Pi switches networks.'
      : 'Failed: ' + (data.error || 'unknown error');
  } catch (err) {
    status.textContent = 'Request failed: ' + err.message;
  }
});
</script></body></html>`;

// Starts the portal HTTP server. Resolves with {ssid, password} the moment
// a connection attempt SUCCEEDS (connectToNetwork resolved without
// throwing) - caller is responsible for stopping the server and tearing
// down the AP afterward. A failed attempt keeps the server running so the
// user can retry from the same page.
function startPortalServer(port = PORTAL_PORT, connectFn = connectToNetwork) {
  return new Promise((resolveConnected, rejectServer) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(PAGE_HTML);
        return;
      }
      if (req.method === 'POST' && req.url === '/connect') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          let parsed;
          try { parsed = JSON.parse(body); } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'bad request body' }));
            return;
          }
          try {
            await connectFn(parsed.ssid, parsed.password);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            resolveConnected({ ssid: parsed.ssid, password: parsed.password, server });
          } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
    server.on('error', rejectServer);
    server.listen(port);
  });
}

// ---------------------------------------------------------------------------
// Orchestration: check connectivity, and if there isn't any, open the AP +
// portal and block until a real connection is made. Matches the ESP32
// firmware's connectWifi() blocking-until-connected-or-portal-closed
// pattern (see wifi_setup.cpp), so app.js can just `await` this once at
// startup before doing anything that needs the network.
// ---------------------------------------------------------------------------
async function ensureWifiConnected({ runFn = run, log = console.log } = {}) {
  let connected;
  try {
    connected = await isConnected(runFn);
  } catch (err) {
    // Most likely nmcli itself isn't installed - true on any non-Pi dev
    // machine (this sandbox included) and on Raspberry Pi OS images still
    // using the older dhcpcd network stack instead of NetworkManager. Log
    // and assume connected rather than crash the app or block forever on a
    // portal nobody can reach the AP for - this is a real limitation
    // (dhcpcd-based setups get no provisioning flow at all), not a
    // silently-ignored error.
    log(`[wifi] could not check connectivity (${err.message}) - assuming already connected. If this is a real Pi expecting WiFi setup, confirm NetworkManager/nmcli is installed (Raspberry Pi OS Bullseye+ ships it by default).`);
    return;
  }
  if (connected) {
    log('[wifi] already connected, skipping AP setup');
    return;
  }
  log(`[wifi] not connected - starting setup AP "${AP_SSID}" (password: ${AP_PASSWORD})`);
  await startAccessPoint(runFn);
  log(`[wifi] AP up - connect a phone/PC to it, then browse to http://${AP_GATEWAY_IP}/`);

  const connectWithLogging = async (ssid, password) => {
    log(`[wifi] attempting to connect to "${ssid}"...`);
    await connectToNetwork(ssid, password, runFn);
  };

  await startPortalServer(PORTAL_PORT, connectWithLogging).then(({ ssid, server }) => {
    log(`[wifi] connected to "${ssid}" - tearing down setup AP`);
    server.close();
    return stopAccessPoint(runFn);
  });
}

module.exports = {
  AP_SSID, AP_PASSWORD, AP_CON_NAME, AP_GATEWAY_IP, PORTAL_PORT,
  isConnected, startAccessPoint, stopAccessPoint, connectToNetwork,
  startPortalServer, ensureWifiConnected,
};
