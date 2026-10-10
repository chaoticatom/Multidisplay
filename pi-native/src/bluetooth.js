// Bluetooth pairing and audio routing, driven through bluetoothctl (commands fed
// on stdin) and pactl, and exposed over the existing WS control channel.
// The command runner is injectable (`exec`) so the output parsing can be unit
// tested without real binaries - see test/bluetooth.test.js.
const { spawn, execFile } = require('child_process');
const { findPulseEnv } = require('./pulseEnv');

const MAC_RE = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;
const DEVICE_LINE_RE = /Device ([0-9A-Fa-f:]{17}) (.+)/;
const PHONE_CAPTURE_SOURCE = 'phone_capture';

// Feeds commands into an interactive `bluetoothctl` session and returns
// its combined stdout+stderr - same technique as the Python original
// (simpler and more portable than a D-Bus binding).
// waitMs: either a single number applied after every command (unchanged
// default behavior), or an ARRAY giving a per-command wait (shorter than
// `commands`, the last entry repeats for the rest) - a real report ("it's
// very slow at pairing"): pairDevice() was waiting the same fixed 6000ms
// after EVERY command, including 'agent NoInputNoOutput'/'default-agent'
// (near-instant, no real handshake to wait for) - 5 commands x 6000ms was
// 30+ seconds for a pair attempt when only `pair`/`connect` (the actual
// Bluetooth handshake) need anywhere near that long.
function bluetoothctl(commands, waitMs = 1500) {
  const waitFor = (i) => Array.isArray(waitMs) ? (waitMs[i] ?? waitMs[waitMs.length - 1]) : waitMs;
  return new Promise((resolve, reject) => {
    const proc = spawn('bluetoothctl', [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { out += d.toString(); });
    proc.on('error', reject);

    (async () => {
      for (let i = 0; i < commands.length; i++) {
        proc.stdin.write(commands[i] + '\n');
        await new Promise((r) => setTimeout(r, waitFor(i)));
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
    // Many devices first appear with only their MAC; the real name arrives later
    // in a "Name: <name>" line. An explicit Name line always wins, even over an
    // existing entry. Any other line only fills in a first-seen placeholder, so
    // scan noise like an RSSI update can't overwrite a real name.
    const nameMatch = /^Name: (.+)$/.exec(trimmed);
    if (nameMatch) { get(mac).name = nameMatch[1].trim(); continue; }
    // Keep the latest RSSI so the user can tell their own nearby speaker (strong,
    // e.g. -40) from a neighbour's device (e.g. -80). Some bluetoothctl versions
    // print "RSSI: 0xffffffbd (-67)": prefer the decimal in brackets, else fall
    // back to a plain "RSSI: -67".
    const rssiMatch = /^RSSI: (?:0x[0-9a-fA-F]+\s*\((-?\d+)\)|(-?\d+)\b)/.exec(trimmed);
    if (rssiMatch) { get(mac).rssi = Number(rssiMatch[1] ?? rssiMatch[2]); continue; }
    // Property updates must never be taken as a device name. Their shapes vary by
    // BlueZ version ("RSSI: -67", "TxPower is nil", "ManufacturerData.Key: ..."),
    // so treat any line containing ": " or ending "is nil" as a property line.
    // Real names essentially never contain ": ", and "Name: " lines are handled
    // above. Unnamed devices keep their MAC as the name.
    const isPropertyLine = /: /.test(trimmed) || / is nil$/.test(trimmed);
    const d = get(mac); // ensures a sighting is recorded either way, defaulting name to the MAC
    if (!isPropertyLine && d.name === mac) d.name = trimmed;
  }
  return [...devices.entries()].map(([mac, d]) => ({ mac, name: d.name, rssi: d.rssi }));
}

// After the passive scan, run `info <mac>` for each device still without a
// name: it makes BlueZ resolve (or return a cached) remote name, which often
// works when the scan never showed one. Run one at a time, since each call
// spawns its own bluetoothctl. Some BLE devices only expose a name over GATT,
// so they may stay MAC-only.
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

// Called whenever a speaker becomes the audio output (setAsAudioOutput
// succeeded) - app.js uses it to move the radio's playback onto it (see
// RadioAudio.restartPlayback()).
const outputChangedListeners = [];
function onAudioOutputChanged(cb) { outputChangedListeners.push(cb); }

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
  const macUnderscored = mac.replace(/:/g, '_');
  // Find the sink by searching `pactl list short sinks` for the device's MAC
  // and reading the real name from that line. Names differ between PipeWire
  // ("bluez_output.<mac>.1") and PulseAudio versions ("bluez_sink.<mac>.a2dp_sink"
  // etc.), so never guess an exact name. Retry a few times: the sink can take a
  // moment to register after connecting.
  const SINK_RETRY_ATTEMPTS = 4, SINK_RETRY_DELAY_MS = 1500;
  let sinksOut = '', sinkLine = null;
  for (let attempt = 1; attempt <= SINK_RETRY_ATTEMPTS; attempt++) {
    sinksOut = await run('pactl', ['list', 'short', 'sinks']);
    sinkLine = sinksOut.split('\n').find((l) => l.includes(macUnderscored));
    if (sinkLine) break;
    if (attempt < SINK_RETRY_ATTEMPTS) await new Promise((r) => setTimeout(r, SINK_RETRY_DELAY_MS));
  }
  if (!sinkLine) {
    return { set: false, log: sinksOut + `\nPulseAudio/PipeWire hasn't registered a sink for this speaker yet (no sink line containing ${macUnderscored} after ${SINK_RETRY_ATTEMPTS} attempts) - it may need more time after connecting, or the speaker doesn't support the A2DP sink profile.` };
  }
  const sinkName = sinkLine.split(/\s+/)[1];
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
  if (btConfig.load().range === 'long') setRange('long', { save: false }).catch((e) => console.warn('[bluetooth] range:', e.message)); // keep Long range after a reconnect
  for (const cb of outputChangedListeners) { try { cb(mac); } catch (e) { console.warn('[bluetooth] output-changed listener failed:', e.message); } }
  return { set: true, log: sinksOut + '\n' + setOut };
}

async function pairDevice(mac) {
  if (!MAC_RE.test(mac)) throw new Error('invalid mac address');
  // Register a NoInputNoOutput agent in the SAME bluetoothctl session as `pair`
  // (the agent is tied to that process's D-Bus connection). Without one, on a
  // headless Pi `pair` can silently fail while `connect` still succeeds, so the
  // device never gets recorded as Paired. Waits are per command: only
  // pair/connect need several seconds.
  const out = await bluetoothctl(
    ['agent NoInputNoOutput', 'default-agent', `pair ${mac}`, `trust ${mac}`, `connect ${mac}`],
    [300, 300, 6000, 1000, 6000],
  );
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
  // A real report: the paired-devices list always showed empty even for
  // a device directly confirmed "Paired: yes" via `bluetoothctl info`.
  // Root cause: `paired-devices` isn't a valid bluetoothctl command on
  // this BlueZ version at all ("Invalid command in menu main:
  // paired-devices") - it was renamed to `devices Paired` (a filter
  // argument to the general `devices` command). Every listPaired() call
  // was silently getting an error message back instead of a device list,
  // parsing it as "0 devices" every time.
  const out = await bluetoothctl(['devices Paired'], 1000);
  const devices = parseDeviceLines(out);
  const defaultSinkOut = await run('pactl', ['get-default-sink']);
  // The answer from get-default-sink is the LAST non-empty line (run() may
  // prepend a diagnostic line). Match by MAC substring rather than an exact
  // sink name, so it works under both PipeWire and PulseAudio naming.
  const defaultSinkLines = defaultSinkOut.split('\n').filter((l) => l.trim());
  const defaultSink = (defaultSinkLines[defaultSinkLines.length - 1] || '').trim();
  for (const d of devices) {
    const infoOut = await bluetoothctl([`info ${d.mac}`], 800);
    d.connected = /Connected: yes/.test(infoOut);
    d.isDefaultOutput = !!defaultSink && defaultSink.includes(d.mac.replace(/:/g, '_'));
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
  // `pairable on` never expires by itself (unlike `discoverable`), and the
  // NoInputNoOutput agent accepts any pairing request. Turn pairable off again
  // after the ~120 s window shown to the user, or the Pi keeps accepting
  // pairings from any nearby device.
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

// findPulseEnv() (PULSE_SERVER/HOME/XDG_RUNTIME_DIR for reaching the real
// user's PulseAudio session, not root's own nonexistent one - see
// pulseEnv.js's module comment for the full story) now lives in
// src/pulseEnv.js, shared with ffmpegAudio.js's paplay playback process -
// a real report ("I don't hear anything on the BT speaker") turned out to
// be the exact same problem in that second place, which never had this
// fix applied since it used to live only here.
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

// A timer's chosen output: 'local' = the Pi's own (non-Bluetooth) output,
// or a paired speaker's MAC, connected first if it has dropped its link.
// Playback restarts on the new output via the onAudioOutputChanged hook.
async function useOutput(target) {
  if (target === 'local') {
    const sinks = await run('pactl', ['list', 'short', 'sinks']);
    const line = sinks.split('\n').find((l) => l.trim() && !/bluez/i.test(l));
    if (!line) return { set: false, log: 'No non-Bluetooth output found:\n' + sinks };
    const out = await run('pactl', ['set-default-sink', line.split(/\s+/)[1]]);
    for (const cb of outputChangedListeners) { try { cb(null); } catch (e) { console.warn('[bluetooth] output-changed listener failed:', e.message); } }
    return { set: true, log: out };
  }
  if (!MAC_RE.test(target)) return { set: false, log: 'Not a speaker address: ' + target };
  try { await bluetoothctl([`connect ${target}`], 4000); } catch (e) { /* may already be connected */ }
  return setAsAudioOutput(target, 800);
}

// Range (Setup > Bluetooth): the codec the speaker is driven with. The
// sound server offers one card profile per codec (a2dp-sink-sbc,
// a2dp-sink-aac, ...). Long range picks plain SBC - the least data per
// second, so the link survives a weak signal better (fewer dropouts at a
// distance, a little less sound quality); normal picks the best codec the
// speaker has. Older PulseAudio has a single a2dp profile, so there's
// nothing to choose there.
const NORMAL_ORDER = ['a2dp-sink-ldac', 'a2dp-sink-aptx_hd', 'a2dp-sink-aptx', 'a2dp-sink-aac', 'a2dp-sink-sbc_xq', 'a2dp-sink', 'a2dp-sink-sbc'];
const LONG_ORDER = ['a2dp-sink-sbc', 'a2dp-sink', 'a2dp_sink'];
function parseBtCards(text) {
  const cards = [];
  let card = null, inProfiles = false;
  for (const line of String(text || '').split('\n')) {
    let m;
    if (/^Card #/.test(line)) { card = null; inProfiles = false; continue; }
    if ((m = /^\s+Name: (bluez_card\.\S+)/.exec(line))) { card = { name: m[1], profiles: [], active: '' }; cards.push(card); continue; }
    if (!card) continue;
    if (/^\s+Profiles:/.test(line)) { inProfiles = true; continue; }
    if ((m = /^\s+Active Profile: (\S+)/.exec(line))) { card.active = m[1]; inProfiles = false; continue; }
    if (inProfiles && (m = /^\s+([\w.-]+): .*available: (\w+)/.exec(line))) card.profiles.push({ name: m[1], available: m[2] !== 'no' });
    else if (inProfiles && /^\s\S/.test(line)) inProfiles = false;
  }
  return cards;
}
function pickProfile(profiles, mode) {
  const have = new Set(profiles.filter((p) => p.available).map((p) => p.name));
  return (mode === 'long' ? LONG_ORDER : NORMAL_ORDER).find((n) => have.has(n)) || null;
}
async function setRange(mode, { save = true } = {}) {
  mode = mode === 'long' ? 'long' : 'normal';
  if (save) btConfig.save({ range: mode });
  const out = await run('pactl', ['list', 'cards']);
  const cards = parseBtCards(out);
  if (!cards.length) return { set: false, range: mode, log: 'No Bluetooth speaker connected - the setting is saved and used when it connects.' };
  const log = [];
  let changed = false;
  for (const card of cards) {
    const want = pickProfile(card.profiles, mode);
    if (!want) { log.push(card.name + ': no choice of codec on this system'); continue; }
    if (want === card.active) { log.push(card.name + ': already ' + want); continue; }
    log.push(await run('pactl', ['set-card-profile', card.name, want]));
    changed = true;
  }
  // The speaker's output was rebuilt: move the radio's playback onto it.
  if (changed) for (const cb of outputChangedListeners) { try { cb(null); } catch (e) { console.warn('[bluetooth] output-changed listener failed:', e.message); } }
  return { set: true, range: mode, log: log.join('\n') };
}

module.exports = {
  onAudioOutputChanged, useOutput, setRange, parseBtCards, pickProfile,
  MAC_RE, parseDeviceLines, scanDevices, pairDevice, listPaired, makeDiscoverable, routePhoneAudio,
  setAsAudioOutput, autoReconnectLastSpeaker, forgetDevice, resetPairability,
};
