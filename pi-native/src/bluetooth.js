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
  const devices = new Map(); // mac -> { name, rssi }
  const get = (mac) => {
    if (!devices.has(mac)) devices.set(mac, { name: mac, rssi: null });
    return devices.get(mac);
  };
  for (const line of text.split('\n')) {
    const m = DEVICE_LINE_RE.exec(line);
    if (!m) continue;
    const [, mac, rest] = m;
    const trimmed = rest.trim();
    // A real report: the Pi only ever showed raw MAC addresses for a
    // device Windows resolved to its full make/model. "First sighting
    // wins" (see below) locked in whatever the device's very first "[NEW]
    // Device MAC ..." line carried - which for many devices is just the
    // MAC again (no name known yet), with the real name only arriving
    // moments later via a separate "[CHG] Device MAC Name: <real name>"
    // line once BlueZ completes an extended inquiry/name request. That
    // later line matched this same generic regex but was being discarded
    // outright by the has()-check below, so the placeholder MAC "name"
    // never got upgraded. An explicit "Name: " line is NEVER scan noise
    // (unlike an "RSSI: -60"-style line) - it's always a real resolved
    // name - so it always wins, overwriting even an existing entry;
    // anything else still only fills in a first-seen placeholder, same
    // "don't let an RSSI update stomp a real name" protection as before.
    const nameMatch = /^Name: (.+)$/.exec(trimmed);
    if (nameMatch) { get(mac).name = nameMatch[1].trim(); continue; }
    // A real report: with several devices still MAC-only even after the
    // active info-lookup fix (below), there was no way to tell which one
    // was actually the user's OWN speaker vs. a neighbor's device sitting
    // further away - RSSI (signal strength) is the practical way to tell:
    // your own speaker should be sitting right next to the Pi and read
    // noticeably stronger (closer to 0, e.g. -40) than someone else's
    // device on the other side of a wall (e.g. -80). Keep the LATEST RSSI
    // value seen (unlike name, a moving/rotating device's signal strength
    // genuinely changes during a scan, so the newest reading is the most
    // accurate one) and surface it alongside the name/MAC either way.
    const rssiMatch = /^RSSI: (-?\d+)/.exec(trimmed);
    if (rssiMatch) { get(mac).rssi = Number(rssiMatch[1]); continue; }
    // Any other "PropertyKey: value"-shaped line (Connected/Trusted/
    // Paired/TxPower/ManufacturerData/ServiceData/...) is a property
    // update, never a name - a real report: some devices' FIRST-ever line
    // in a given scan's captured output was already a property update
    // (e.g. "[CHG] Device MAC RSSI: -67", not a "[NEW] Device MAC <name>"
    // line - happens when the device was already known/mid-discovery
    // before this scan's stdout capture started), so the old fallback (any
    // first-seen line, no shape check) adopted that literal property text
    // as the device's "name". get(mac) above already defaults name to the
    // MAC itself - same "MAC-only" outcome bluetoothctl already shows for
    // a device that genuinely never advertises a friendly name, not
    // garbage property text - while still leaving room for a later
    // "Name: " line (handled above) to upgrade it if one does arrive.
    const isPropertyLine = /^[A-Za-z][A-Za-z ]*: /.test(trimmed);
    const d = get(mac); // ensures a sighting is recorded either way, defaulting name to the MAC
    if (!isPropertyLine && d.name === mac) d.name = trimmed;
  }
  return [...devices.entries()].map(([mac, d]) => ({ mac, name: d.name, rssi: d.rssi }));
}

// After the passive scan, explicitly ask `bluetoothctl` for each
// still-unresolved device's info - a real report ("I need the full name of
// the device", most rows still MAC-only after the RSSI/property-line
// parsing fix above). `scan on` only shows a name if the device happened to
// include it in whatever advertisement/inquiry-response was captured
// during the scan window; `info <mac>` makes BlueZ do (or return
// already-cached results from) an explicit remote-name resolution for that
// one device, which often succeeds even when the passive scan output never
// carried a name line for it. Sequential, not parallel (see bluetoothctl()
// itself - each call spawns its own bluetoothctl process) - fine for a
// user-initiated one-off scan, not a hot path. Still not guaranteed: a
// BLE device that puts no name in its advertising and isn't already
// paired/cached genuinely requires connecting and reading its GATT Device
// Name characteristic to learn a name at all - `info` alone can't force
// that, so some devices will legitimately remain MAC-only no matter what.
async function resolveUnnamedDevices(devices) {
  for (const d of devices) {
    if (d.name !== d.mac) continue; // already has a real name
    const out = await bluetoothctl([`info ${d.mac}`], 1200);
    const nameMatch = /\bName: (.+)/.exec(out);
    if (nameMatch) d.name = nameMatch[1].trim();
  }
  return devices;
}

async function scanDevices(durationMs = 6000) {
  const out = await bluetoothctl(['scan on'], durationMs);
  await bluetoothctl(['scan off'], 500);
  return resolveUnnamedDevices(parseDeviceLines(out));
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
