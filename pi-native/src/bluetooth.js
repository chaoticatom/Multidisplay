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
const fs = require('fs');

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
    // A real report: RSSI showing as "0 dBm" for almost every device. This
    // BlueZ/bluetoothctl version formats RSSI as "RSSI: 0xffffffbd (-67)"
    // (hex encoding of the signed byte, then the real signed decimal in
    // parens) rather than a plain "RSSI: -67" - the old regex matched
    // greedily from "RSSI: " and captured just the leading "0" of
    // "0xffffffbd" before the non-digit "x" stopped it, silently reading
    // 0 dBm off every single device instead of the real value. Prefer the
    // parenthesized decimal when present; fall back to a plain "RSSI: N"
    // for any bluetoothctl version/line that reports it that way instead.
    const rssiMatch = /^RSSI: (?:0x[0-9a-fA-F]+\s*\((-?\d+)\)|(-?\d+)\b)/.exec(trimmed);
    if (rssiMatch) { get(mac).rssi = Number(rssiMatch[1] ?? rssiMatch[2]); continue; }
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
    // A real report: "ManufacturerData.Key: 0x3144 (12612)" ALSO got
    // adopted as a name - a nested/namespaced property key with a period
    // in it ("ManufacturerData.Key") isn't just letters+spaces, so even
    // the broadened colon check above still missed it. Rather than keep
    // enumerating every property-key shape a given BlueZ version might
    // use, invert the heuristic: a real device name essentially never
    // contains a bare ": " sequence, so treat ANY line with one (or
    // ending "is nil") as a property update, not a name candidate -
    // explicit "Name: " lines are still handled separately above and
    // always win regardless.
    const isPropertyLine = /: /.test(trimmed) || / is nil$/.test(trimmed);
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

// A real report: "why does it think I have paired 5 devices?" - each
// pairing attempt (including test/debugging ones on random nearby
// devices) creates a REAL, persistent BlueZ pairing that sticks around
// indefinitely until explicitly removed - bluetoothctl paired-devices was
// accurately reporting actual state, not a bug, but there was no way to
// clean up stale entries from the control page. `remove` un-pairs AND
// un-trusts in one step (BlueZ's own combined operation, not a separate
// unpair+untrust).
async function forgetDevice(mac) {
  if (!MAC_RE.test(mac)) throw new Error('invalid mac address');
  const out = await bluetoothctl([`remove ${mac}`], 1500);
  const ok = out.includes('has been removed') || out.includes('Device has been removed');
  return { ok, log: out };
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
// How long the pairing window advertised to the user (see app.js's
// "Opening pairing window (~120s)...") actually stays open.
const DISCOVERABLE_WINDOW_MS = 120000;

async function makeDiscoverable() {
  const out = await bluetoothctl([
    'agent NoInputNoOutput',
    'default-agent',
    'discoverable on',
    'pairable on',
  ], 1000);
  // A real report: "it keeps adding devices to my paired device list but
  // I have never paired with them." Root cause: `pairable on` (unlike
  // `discoverable`, which has BlueZ's own DiscoverableTimeout) has NO
  // automatic expiry at all - it's a persistent Adapter1 property that
  // stays on indefinitely, independent of which client process set it or
  // whether that process has since exited, until something explicitly
  // turns it back off. Combined with the NoInputNoOutput agent (which
  // auto-accepts ANY incoming pairing request with no confirmation
  // prompt), a single click of "Make Cube Discoverable" left the Pi
  // silently accepting a pairing from literally any nearby device,
  // forever - explaining random unrecognized devices ("43\" Crystal
  // UHD", "PowerHubnrGaDGo7") accumulating in the paired list over time.
  // Explicitly close the window after the same ~120s already advertised
  // to the user, rather than relying on `discoverable`'s own timeout
  // (which doesn't touch `pairable` at all).
  setTimeout(() => {
    bluetoothctl(['discoverable off', 'pairable off'], 1000).catch(() => {});
  }, DISCOVERABLE_WINDOW_MS);
  return { ok: true, log: out };
}

// Defensive reset called once at server startup (see src/app.js) - if a
// previous run left `pairable`/`discoverable` on (e.g. the process was
// killed/crashed mid-window before makeDiscoverable()'s own close-out
// above could fire, or an old build without this fix at all left it on
// indefinitely), a plain restart alone would never clear it, since
// `pairable` is a persistent adapter-level property with no timeout of
// its own. Cheap and safe to run unconditionally on every boot.
async function resetPairability() {
  try {
    await bluetoothctl(['discoverable off', 'pairable off'], 1000);
  } catch (err) { /* best-effort - a boot-time cleanup shouldn't crash startup */ }
}

// A real report (raw pactl output captured via the pairing-log console
// dump): "Failed to create secure directory (/root/.config/pulse):
// Permission denied" / "Connection failure: Connection refused". Root
// cause: multidisplay-pi.service runs as root (needed for rpi-led-matrix's
// GPIO/DMA access - see the unit file's own comment), but PulseAudio runs
// as a per-user SESSION daemon under the Pi's regular login user, not
// root - every `pactl` call this whole time was trying to reach root's
// own (nonexistent) PulseAudio session instead of the real one. This
// silently broke EVERY pactl-based feature in this file (sink listing/
// selection, phone-audio routing), not just pairing - `pairDevice()`'s
// Bluetooth-level connect/pair could still succeed (that's bluetoothd,
// unrelated to PulseAudio), while the actual "make this the audio output"
// step failed every single time with no visible error anywhere but here.
// Finds the real user's running PulseAudio socket (/run/user/<uid>/pulse/
// native - the standard per-user runtime location) and points PULSE_SERVER
// at it explicitly, rather than assuming a uid (varies by install).
// Pointing PULSE_SERVER at the right socket alone isn't quite enough:
// PulseAudio's client auth normally relies on a cookie file at
// $HOME/.config/pulse/cookie, matched against the same file the server
// (running as the real login user) uses. Root's own $HOME (/root) has no
// such cookie and can't create one there either (see the "Failed to
// create secure directory (/root/.config/pulse): Permission denied" error
// this was diagnosed from) - so the child pactl process also needs HOME/
// XDG_RUNTIME_DIR pointed at the REAL user's environment, not just the
// socket path. Reads /etc/passwd for the home directory matching whichever
// uid under /run/user/ actually has a live PulseAudio socket, rather than
// assuming a fixed uid/username (varies by install).
let _pulseEnvCache = null;
// Returns { env } on success or { debug } on failure - a real report:
// this returned null on a real Pi even with its own prerequisites (a live
// socket at the expected path, a matching /etc/passwd entry) directly
// confirmed present by hand over SSH, and silently swallowing whatever
// went wrong here made that impossible to diagnose further. `debug`
// records exactly what was tried and what fs call failed/returned, so a
// second failure surfaces the real cause instead of just "found nothing"
// again.
function findPulseEnv() {
  // Only the found-it case is cached - if PulseAudio's session hasn't
  // started yet (e.g. checked very early at boot, before the user session
  // is up), retrying the cheap filesystem scan on the next call is better
  // than permanently caching a false "not found".
  if (_pulseEnvCache) return { env: _pulseEnvCache };
  const debug = [];
  const runUser = '/run/user';
  let entries;
  try {
    entries = fs.readdirSync(runUser);
    debug.push(`readdirSync(${runUser}) -> [${entries.join(', ')}]`);
  } catch (err) {
    debug.push(`readdirSync(${runUser}) threw: ${err.code || ''} ${err.message}`);
    return { debug };
  }
  for (const uid of entries) {
    const sock = `${runUser}/${uid}/pulse/native`;
    let exists;
    try { exists = fs.existsSync(sock); } catch (err) { exists = false; debug.push(`existsSync(${sock}) threw: ${err.message}`); }
    debug.push(`existsSync(${sock}) -> ${exists}`);
    if (!exists) continue;
    let home = null;
    try {
      const passwd = fs.readFileSync('/etc/passwd', 'utf8');
      for (const line of passwd.split('\n')) {
        const fields = line.split(':');
        if (fields[2] === uid) { home = fields[5] || null; break; }
      }
      debug.push(`home for uid ${uid} -> ${home}`);
    } catch (err) {
      debug.push(`readFileSync(/etc/passwd) threw: ${err.message}`);
    }
    _pulseEnvCache = { PULSE_SERVER: 'unix:' + sock, XDG_RUNTIME_DIR: `${runUser}/${uid}`, ...(home ? { HOME: home } : {}) };
    return { env: _pulseEnvCache };
  }
  return { debug };
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const result = cmd === 'pactl' ? findPulseEnv() : null;
    const pulseEnv = result && result.env;
    const env = pulseEnv ? { ...process.env, ...pulseEnv } : process.env;
    // Belt-and-suspenders: pass --server explicitly too, not just via the
    // PULSE_SERVER env var - in case this pactl build/environment doesn't
    // pick up the env var reliably.
    if (pulseEnv) args = ['--server=' + pulseEnv.PULSE_SERVER, ...args];
    // Temporary but real diagnostic need: a previous version of this
    // override still didn't fix "Connection refused" on a real Pi even
    // once its own prerequisites (a live socket, a matching /etc/passwd
    // entry) were directly confirmed present by hand over SSH, and
    // findPulseEnv() itself reported finding nothing despite that -
    // meaning the bug was in the detection code, not the pactl approach,
    // but there was no visibility into WHY it found nothing. Surfaces the
    // full step-by-step debug trail (what readdirSync/existsSync actually
    // saw/threw) in the same log the UI already displays.
    const envNote = cmd === 'pactl'
      ? `[pulseEnv: ${pulseEnv ? JSON.stringify(pulseEnv) : 'NOT FOUND - debug: ' + JSON.stringify(result.debug)}]\n`
      : '';
    execFile(cmd, args, { timeout: 15000, env }, (err, stdout, stderr) => {
      resolve(`${envNote}$ ${cmd} ${args.join(' ')}\n${stdout || ''}${stderr || ''}`);
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
  setAsAudioOutput, autoReconnectLastSpeaker, forgetDevice, resetPairability,
};
