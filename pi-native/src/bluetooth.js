// Ported from pi/bluetooth_server.py - same bluetoothctl/PulseAudio
// approach (feed commands into an interactive bluetoothctl session via
// stdin, same regex-based device-line parsing, same PulseAudio module-
// remap-source + module-loopback plumbing for routing a paired phone's
// audio to both the speaker and a capturable "phone_capture" source).
//
// Unlike pi/bluetooth_server.py (a standalone Python HTTP server on its
// own port for a Pi running the *browser-based* app), this is wired
// directly into pi-native's existing WS control channel (see wsServer.js)
// instead of adding a second separate service/port - this project already
// has one control channel, no reason to add another for this.
//
// Not testable end-to-end in this sandbox (no bluetoothctl/pactl, no
// Bluetooth hardware) - the command-runner is injectable (see `exec`
// param below) so the parsing logic can still be unit-tested against
// canned bluetoothctl/pactl-style output without the real binaries. See
// test/bluetooth.test.js.
const { spawn, execFile } = require('child_process');

const MAC_RE = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;
const DEVICE_LINE_RE = /Device ([0-9A-Fa-f:]{17}) (.+)/;
const PHONE_CAPTURE_SOURCE = 'phone_capture';

// Feeds commands into an interactive `bluetoothctl` session and returns
// its combined stdout+stderr - same technique as the Python original
// (simpler and more portable than a D-Bus binding).
function bluetoothctl(commands, waitMs = 1500) {
  return new Promise((resolve, reject) => {
    const proc = spawn('bluetoothctl', [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { out += d.toString(); });
    proc.on('error', reject);

    (async () => {
      for (const cmd of commands) {
        proc.stdin.write(cmd + '\n');
        await new Promise((r) => setTimeout(r, waitMs));
      }
      proc.stdin.write('quit\n');
      setTimeout(() => { proc.kill(); resolve(out); }, 500);
    })();
  });
}

function parseDeviceLines(text) {
  const devices = new Map();
  for (const line of text.split('\n')) {
    const m = DEVICE_LINE_RE.exec(line);
    if (!m) continue;
    const [, mac, rest] = m;
    // First sighting wins, not last: a live scan mixes "[NEW] Device MAC
    // Name" lines with "[CHG] Device MAC RSSI: -60"-style property-update
    // lines for the SAME device - both match this same generic pattern,
    // so overwriting on every match would eventually stomp the real name
    // with whatever property update happened to scroll by last. Confirmed
    // live: a canned multi-line sample with an interleaved RSSI update
    // reproduced exactly this.
    if (!devices.has(mac)) devices.set(mac, rest.trim());
  }
  return [...devices.entries()].map(([mac, name]) => ({ mac, name }));
}

async function scanDevices(durationMs = 6000) {
  const out = await bluetoothctl(['scan on'], durationMs);
  await bluetoothctl(['scan off'], 500);
  return parseDeviceLines(out);
}

async function pairDevice(mac) {
  if (!MAC_RE.test(mac)) throw new Error('invalid mac address');
  const out = await bluetoothctl([`pair ${mac}`, `trust ${mac}`, `connect ${mac}`], 6000);
  const ok = out.includes('Connection successful') || out.includes('Connected: yes');
  return { ok, log: out };
}

async function listPaired() {
  const out = await bluetoothctl(['paired-devices'], 1000);
  return parseDeviceLines(out);
}

// Opens a pairing window for an INCOMING connection (a phone finding and
// pairing with the Pi), the reverse role from pairDevice() (Pi connecting
// out to a known speaker). NoInputNoOutput agent auto-accepts the pairing
// prompt (just-works pairing) - no way to type a PIN on a headless Pi.
async function makeDiscoverable() {
  const out = await bluetoothctl([
    'agent NoInputNoOutput',
    'default-agent',
    'discoverable on',
    'pairable on',
  ], 1000);
  return { ok: true, log: out };
}

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15000 }, (err, stdout, stderr) => {
      resolve(`$ ${cmd} ${args.join(' ')}\n${stdout || ''}${stderr || ''}`);
    });
  });
}

// Finds the Bluetooth source PulseAudio created for a connected phone
// (bluez_source.*.a2dp_source), exposes it as a stable-named capturable
// input ("phone_capture") via module-remap-source, and loops it to the
// default sink so it's audible on the paired external speaker at the same
// time. Safe to call again - unloads any previous instance of these
// modules first so re-running doesn't stack duplicates.
async function routePhoneAudio() {
  const log = [];
  const sourcesOut = await run('pactl', ['list', 'short', 'sources']);
  log.push(sourcesOut);

  let phoneSource = null;
  for (const line of sourcesOut.split('\n')) {
    if (line.includes('bluez_source') && line.includes('a2dp_source')) {
      phoneSource = line.split('\t')[1];
      break;
    }
  }
  if (!phoneSource) {
    return { ok: false, log: [...log, 'No connected phone audio source found - pair and start playing music on the phone first.'] };
  }

  const modsOut = await run('pactl', ['list', 'short', 'modules']);
  log.push(modsOut);
  for (const line of modsOut.split('\n')) {
    if (line.includes(PHONE_CAPTURE_SOURCE) || (line.includes('module-loopback') && line.includes(phoneSource))) {
      const modId = line.split('\t')[0];
      if (modId) log.push(await run('pactl', ['unload-module', modId]));
    }
  }

  log.push(await run('pactl', ['load-module', 'module-remap-source', `master=${phoneSource}`, `source_name=${PHONE_CAPTURE_SOURCE}`]));
  log.push(await run('pactl', ['load-module', 'module-loopback', `source=${phoneSource}`, 'latency_msec=100']));

  return { ok: true, log };
}

module.exports = {
  MAC_RE, parseDeviceLines, scanDevices, pairDevice, listPaired, makeDiscoverable, routePhoneAudio,
};
