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
    // A real report: rows literally reading "RSSI is nil" / "TxPower is
    // nil" as the device name - this BlueZ/bluetoothctl version phrases
    // an unset property as "<Key> is nil", not "<Key>: value", so the
    // colon-based check above let it straight through as a name candidate.
    const isPropertyLine = /^[A-Za-z][A-Za-z ]*: /.test(trimmed) || /^[A-Za-z][A-Za-z ]* is nil$/.test(trimmed);
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

const btConfig = require('./btConfig');

// Selects an already-paired/connected speaker's PulseAudio sink as the
// system default output - the actual mechanism behind "pass the audio to
// the BT device" (both pairDevice()'s automatic call right after
// connecting, and the control page's manual "Set as Output" button for a
// device that's already paired, "like the audio-output picker on
// desktop"). `waitMs` gives PulseAudio's bluetooth module a moment to
// register the sink - needed right after a fresh `connect`, not needed
// when the device was already connected (setAsAudioOutput() from the
// manual button/auto-reconnect passes 0).
async function setAsAudioOutput(mac, waitMs = 0) {
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  const sinkName = 'bluez_sink.' + mac.replace(/:/g, '_') + '.a2dp_sink';
  const sinksOut = await run('pactl', ['list', 'short', 'sinks']);
  if (!sinksOut.includes(sinkName)) {
    return { set: false, log: sinksOut + `\nPulseAudio hasn't registered a sink for this speaker yet (${sinkName} not found) - it may need a moment after connecting, or the speaker doesn't support the A2DP sink profile.` };
  }
  const setOut = await run('pactl', ['set-default-sink', sinkName]);
  // Remember this speaker so autoReconnectLastSpeaker() (below, run at
  // server startup) can reconnect to it after a reboot without requiring
  // a manual re-pair - a real request: "auto try to connect to the
  // previous paired device, even after a reboot." Saved here (the one
  // place that actually knows the output was selected successfully)
  // rather than at each call site, so it stays correct whether the
  // selection came from pairDevice(), the manual "Set as Output" button,
  // or a future auto-reconnect.
  btConfig.save({ lastSpeakerMac: mac });
  return { set: true, log: sinksOut + '\n' + setOut };
}

async function pairDevice(mac) {
  if (!MAC_RE.test(mac)) throw new Error('invalid mac address');
  // A real report: a speaker beeped to confirm it connected, the control
  // page even said "Paired.", but it never showed up in the paired-devices
  // list afterward. Root cause: this never registered a pairing agent
  // before calling `pair` (makeDiscoverable() already does, for INCOMING
  // connections) - on a headless Pi with no display/keyboard to confirm a
  // "Just Works"/PIN prompt, `pair` itself can silently fail or time out
  // with no agent registered, even though `connect` succeeds right after
  // anyway (often via a stale/cached link key from a previous pairing) -
  // so `Connected: yes` shows up and looks like success, but BlueZ never
  // actually recorded this device as Paired, and bluetoothctl
  // paired-devices correctly omits it. Agent registration must happen in
  // the SAME bluetoothctl session as `pair` (it's tied to that process's
  // D-Bus connection, not persisted globally) - NoInputNoOutput
  // auto-accepts Just Works pairing, same choice makeDiscoverable() made.
  const out = await bluetoothctl(['agent NoInputNoOutput', 'default-agent', `pair ${mac}`, `trust ${mac}`, `connect ${mac}`], 6000);
  const ok = out.includes('Connection successful') || out.includes('Connected: yes');
  const log = [out];
  if (ok) {
    // A real report: "I have a paired speaker, how do I get radio to play
    // through it?" - pairing only connects the Bluetooth A2DP profile, it
    // never touched PulseAudio's default sink, so radioPlay's paplay (see
    // ffmpegAudio.js's module comment - it "uses whatever sink is
    // currently default") kept sending audio to whatever was already
    // default (the Pi's onboard audio/HDMI, typically) - the speaker was
    // connected but never actually selected as the audio destination.
    // 800ms delay: PulseAudio's bluetooth module registers the sink
    // shortly after `connect` succeeds, not necessarily instantaneously.
    const outputResult = await setAsAudioOutput(mac, 800);
    log.push(outputResult.log);
  }
  return { ok, log: log.join('\n') };
}

// A real request: "auto try to connect to the previous paired device, even
// after a reboot." bluetoothctl's own trusted-device auto-reconnect isn't
// reliable for a Pi acting as the audio SOURCE (it's the Pi that needs to
// initiate the connection back to the speaker, not the other way around,
// and BlueZ doesn't do that automatically on daemon/adapter startup) - so
// this actively attempts it instead. Retries a few times with a delay
// since right after boot the Bluetooth adapter may not be fully up yet,
// and the speaker itself may power on a few seconds after the Pi does
// (both plugged into the same power strip, say). Fire-and-forget from
// src/app.js's startup - never blocks the app from serving/rendering
// while it's still retrying in the background.
async function autoReconnectLastSpeaker(log = console.log) {
  const { lastSpeakerMac } = btConfig.load();
  if (!lastSpeakerMac) return;
  const MAX_ATTEMPTS = 6, RETRY_DELAY_MS = 5000;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const out = await bluetoothctl([`connect ${lastSpeakerMac}`], 4000);
      if (out.includes('Connection successful') || out.includes('Connected: yes')) {
        const result = await setAsAudioOutput(lastSpeakerMac, 800);
        log(`[bluetooth] Auto-reconnected to last speaker ${lastSpeakerMac} (attempt ${attempt}), audio output ${result.set ? 'selected' : 'NOT selected - ' + result.log}`);
        return;
      }
    } catch (err) {
      log(`[bluetooth] Auto-reconnect attempt ${attempt} for ${lastSpeakerMac} failed: ${err.message}`);
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  log(`[bluetooth] Gave up auto-reconnecting to last speaker ${lastSpeakerMac} after ${MAX_ATTEMPTS} attempts - pair it manually from the control page.`);
}

// A real request: "need an indication that the paired speaker is still
// pairing and connected and working" - listPaired() previously only
// listed WHICH devices are paired, with no live connection/output status
// at all, so a speaker that dropped its Bluetooth link or lost default-
// sink status (e.g. after reconnecting, or another device taking over as
// default output) looked identical to one still working. Enriches each
// device with `connected` (bluetoothctl info's live "Connected: yes/no",
// not just "was paired at some point") and `isDefaultOutput` (whether
// THIS is the sink pairDevice()'s auto-routing above actually selected -
// distinct from merely connected, since a second device could have taken
// over as default output without disconnecting the first).
async function listPaired() {
  const out = await bluetoothctl(['paired-devices'], 1000);
  const devices = parseDeviceLines(out);
  const defaultSinkOut = await run('pactl', ['get-default-sink']);
  const defaultSink = (defaultSinkOut.split('\n').find((l) => l && !l.startsWith('$')) || '').trim();
  for (const d of devices) {
    const infoOut = await bluetoothctl([`info ${d.mac}`], 800);
    d.connected = /Connected: yes/.test(infoOut);
    d.isDefaultOutput = !!defaultSink && defaultSink === 'bluez_sink.' + d.mac.replace(/:/g, '_') + '.a2dp_sink';
  }
  return devices;
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
  setAsAudioOutput, autoReconnectLastSpeaker,
};
