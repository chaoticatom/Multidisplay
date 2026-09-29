// Background ffmpeg-based audio decode + FFT + Bluetooth playback pipeline
// for Internet Radio. This is the audio equivalent of ../video/ffmpegSource.js
// - read that file first, this mirrors its shape closely (injectable spawn,
// non-blocking ensure()/getStatus(), ENOENT/retry-cooldown/idle-shutdown
// handling). The genuinely new part is what happens to the decoded bytes:
// there are TWO consumers of the same PCM stream, not one.
//
// Pipeline:
//   ffmpeg -i <url> -> raw PCM (s16le, 44100Hz, stereo) on stdout
//     -> (a) FFT / band-energy pass here in JS, feeding the spectrum
//            visualizer (see ./spectrum.js)
//     -> (b) piped to a second spawned process (`paplay`) for actual
//            audible playback, routed to whatever sink PulseAudio currently
//            has as default - which is exactly what bluetooth.js's
//            routePhoneAudio()/pactl set-default-sink (via the Setup UI)
//            already establishes for a paired speaker. No new pairing/
//            routing code here - reusing that existing infrastructure was
//            an explicit requirement.
//
// Why one ffmpeg + a second process fed via stdout listeners, instead of a
// single ffmpeg invocation with two outputs (`-f s16le pipe:1 -f s16le
// pipe:2"`-style tee)? Node's child_process only wires up stdio pipes 0/1/2
// by default; a third pipe is possible but fiddlier to plumb portably, and
// keeping ffmpeg to a single well-understood stdout consumer matches
// ffmpegSource.js's established pattern most closely. Piping the SAME
// stdout Buffer chunks to both the FFT pass and paplay's stdin keeps the
// two consumers perfectly in sync (no drift between what you hear and what
// the visualizer shows) - simpler and more robust than two independent
// ffmpeg processes decoding the same URL twice.
//
// Decode format choice: s16le/44100Hz/stereo - CD-quality PCM, the format
// `paplay --raw` expects by default and a totally standard choice for
// analysis; no reason to downsample for the FFT side since the decode cost
// is dominated by ffmpeg itself either way.
//
// Playback routing is independent from FFT/decode success: if paplay is
// missing or the Bluetooth sink isn't there, decode + FFT + visualizer
// keep working (see `playbackStatus` vs `status`) - required so this is
// testable/usable in environments with no real speaker, same spirit as
// this project already holds video.js to for a missing ffmpeg.
'use strict';

const { spawn } = require('child_process');
const { createAnalyser, BAND_COUNT } = require('./fft');
const { findPulseEnv } = require('../../pulseEnv');

const RETRY_COOLDOWN_MS = 8000;
const IDLE_TIMEOUT_MS = 10000;
const IDLE_CHECK_MS = 3000;
const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2; // s16le
// Spectrum analysis clock + ballistics (see _analysisTick()/_applySpectrumTarget()).
const ANALYSIS_HZ = 60;
const WINDOW_VU = 2048; // ~46ms
const VU_DB_FLOOR = -42;
const RING_SAMPLES = 1 << 16; // ~1.5s of mono audio
// How far behind the newest decoded audio to analyse. Audio reaches your
// ears later than ffmpeg decodes it (pipe + PulseAudio + Bluetooth, which
// varies a lot by speaker), so this is adjustable from the radio panel's
// "Speaker sync" slider (setSyncMs()) to line the bars up with the sound.
const DEFAULT_SYNC_MS = 150;
const MAX_SYNC_MS = 800;
const STALL_MS = 400; // no new audio for this long -> bars fall
const ATTACK_RATE = 60; // per second; ~17ms to reach a new higher level
const RELEASE_RATE = 7; // per second; ~140ms decay
const PEAK_HOLD_S = 0.35;
const PEAK_GRAVITY = 3.2; // peak marker fall acceleration (units/s^2)

class RadioAudio {
  constructor(spawnFn = spawn) {
    this._spawn = spawnFn;
    this.decodeProc = null;
    this.playProc = null;
    this.url = null;
    this._ring = new Float32Array(RING_SAMPLES);
    // Separate left/right rings feed the stereo VU levels (this.vu).
    this._ringL = new Float32Array(RING_SAMPLES);
    this._ringR = new Float32Array(RING_SAMPLES);
    // [left, right, leftPeak, rightPeak], 0..1 on a dB scale.
    this.vu = new Float32Array(4);
    this._vuHold = new Float32Array(2);
    this._vuVel = new Float32Array(2);
    this._writePos = 0;
    this._playPos = 0;
    this._carry = null;
    this._lastDataMs = 0;
    this._analyser = createAnalyser(SAMPLE_RATE);
    this._zeros = new Float32Array(BAND_COUNT);
    this._analysisTimer = null;
    this._syncS = DEFAULT_SYNC_MS / 1000;
    this.status = 'Stopped';
    this.playbackStatus = 'No playback attempted';
    this.lastAttemptMs = 0;
    this.lastEnsureMs = 0;
    this.errored = false;
    this._debugFinished = false;

    // Canonical 256 log-spaced band levels (smoothed) + falling peak-hold,
    // same shape as effects-core.js's auSpec/auPeak - see ./spectrum.js for
    // how a caller re-samples this down to a smaller displayed band count.
    this.spec = new Float32Array(BAND_COUNT);
    this.peak = new Float32Array(BAND_COUNT);
    this._peakVel = new Float32Array(BAND_COUNT);
    this._peakHold = new Float32Array(BAND_COUNT);

    this._idleTimer = setInterval(() => this._checkIdle(), IDLE_CHECK_MS);
    if (this._idleTimer.unref) this._idleTimer.unref();
  }

  // Call every tick the radio effect is active and a station is selected.
  // Empty/falsy url tears everything down.
  ensure(url) {
    this.lastEnsureMs = Date.now();
    if (!url) {
      this._teardown();
      this.url = null;
      this.status = 'Stopped';
      this.playbackStatus = 'No playback attempted';
      return;
    }
    if (this.decodeProc && this.url === url) return;

    if (this.url !== url) {
      this._teardown();
      this.url = url;
      this.errored = false;
      this._launch(url);
      return;
    }

    // A real report: a debug tone (fixed duration, ends on its own) kept
    // auto-restarting forever - "it restart[s] from the left, even if the
    // sound has gone". Root cause: nothing here distinguished "process
    // exited because the station errored" (should retry) from "a debug
    // tone finished its own fixed duration on purpose" (should just stay
    // stopped) - both left decodeProc null with the same url still
    // selected, so this function's normal "the process died, relaunch
    // it" fallback kept firing every tick forever. _debugFinished is set
    // by _launch()'s exit handler on a clean debug completion, and
    // cleared here on any actual NEW play request from radio.js's
    // playStation() - see that function's own comment.
    if (this._debugFinished) return;

    if (this.errored && Date.now() - this.lastAttemptMs < RETRY_COOLDOWN_MS) return;
    this._launch(url);
  }

  _launch(url) {
    this.lastAttemptMs = Date.now();
    this._ring.fill(0); this._ringL.fill(0); this._ringR.fill(0); this.vu.fill(0);
    this._writePos = 0;
    this._playPos = 0;
    this._carry = null;
    this._startAnalysisClock();
    // A real report: "if I stop the sweep and restart I get two peaks...
    // it should start again at the beginning" - spec/peak only got reset
    // on an EXPLICIT stop (ensure(null) -> _teardown()), never here on a
    // fresh (re)start, so the previous play-through's slow-falling peak-
    // hold markers stayed on screen decaying alongside the new one's
    // freshly building peaks - looking like two simultaneous peaks
    // instead of one clean restart from zero.
    this.spec.fill(0);
    this.peak.fill(0);
    this._peakVel.fill(0);

    // A real request: two "debug mode" buttons (a full-spectrum sweep and a
    // drum-like broadband thump) to visually verify the spectrum analyser
    // without needing an actual internet stream. Rather than a second
    // playback path, `debug:<lavfi spec>` / `debugloop:<lavfi spec>` URLs
    // (built by radio.js's playDebugTone()) are decoded through this SAME
    // pipeline - swap `-i url` for `-f lavfi -i <spec>` and everything
    // downstream (FFT, ticker, playback) is unchanged. These sources have
    // a fixed duration (`d=` in the lavfi spec) and end on their own - not
    // a real error, so it's tracked here to keep proc.on('exit') from
    // reporting it as one.
    //
    // `debugloop:` (the sweep specifically) vs plain `debug:` (drum/tone)
    // distinguishes "should keep repeating" from "should play once and
    // stop" - a real report caught BOTH directions of this wrong at
    // different points: first, ALL debug tones silently kept
    // auto-restarting forever once finished (nothing told ensure()'s
    // normal "the process died, relaunch it" tick-driven fallback that a
    // clean debug completion isn't a failure to recover from) - "it
    // restart[s] from the left, even if the sound has gone". Then, once
    // that was fixed generically, a follow-up ("the sweep should go from
    // 40 to 10khz and back to 40hz again and so forth") clarified the
    // sweep SHOULD keep looping - just the drum/tone shouldn't. See
    // ensure()'s _debugFinished check for the other half of this.
    const isDebug = url.startsWith('debug:') || url.startsWith('debugloop:');
    const isLoop = url.startsWith('debugloop:');
    this._isDebugSource = isDebug;
    this._isDebugLoop = isLoop;
    const lavfiSpec = isDebug ? url.slice(isLoop ? 'debugloop:'.length : 'debug:'.length) : null;

    let proc;
    try {
      proc = this._spawn('ffmpeg', isDebug ? [
        '-loglevel', 'error',
        // A real report: "the BT speaker goes quickly from mid-low to
        // mid-high in 1 second [...] the bars seem to follow the BT
        // speaker more" - a synthetic lavfi source (unlike a real network
        // stream, which is naturally paced by how fast bytes arrive over
        // the network) gets generated as fast as the CPU allows, not in
        // real time - ffmpeg would render the whole 60s sweep in a
        // fraction of a second. That flooded _onData() far faster than
        // paplay could drain its stdin, and the backpressure fix earlier
        // in this session (which DROPS data rather than buffering it
        // without bound) discarded most of the sweep, leaving only a
        // fast, jumbled fragment for both playback AND the FFT/bars (fed
        // from the same decode stream) to follow. `-re` makes ffmpeg
        // read/generate the input at its own native frame rate, pacing
        // the whole pipeline to real time - the same way a real stream's
        // network delivery already does.
        '-re',
        '-f', 'lavfi',
        '-i', lavfiSpec,
        '-vn',
        '-f', 's16le',
        '-acodec', 'pcm_s16le',
        '-ar', String(SAMPLE_RATE),
        '-ac', String(CHANNELS),
        'pipe:1',
      ] : [
        '-loglevel', 'error',
        '-i', url,
        '-vn',
        '-f', 's16le',
        '-acodec', 'pcm_s16le',
        '-ar', String(SAMPLE_RATE),
        '-ac', String(CHANNELS),
        'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      this._onSpawnFail(err);
      return;
    }

    this.decodeProc = proc;
    this.status = 'Connecting…';
    let stderrTail = '';

    proc.on('error', (err) => this._onSpawnFail(err, proc));
    if (proc.stderr) proc.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-4000); });
    // A real report: switching the debug frequency slider quickly showed
    // multiple simultaneous peaks instead of one clean tone - the same
    // class of bug video.js's FfmpegSource already had fixed (see
    // ffmpegSourceStaleData.test.js), just not here yet. kill('SIGKILL')
    // in _teardown() is asynchronous - the OS can still deliver a killed
    // process's already-buffered stdout data after this.decodeProc has
    // moved on to a freshly-spawned replacement, briefly feeding the OLD
    // (stale-frequency) audio into the FFT alongside the new one. Guard
    // against it: only process data from whichever process is CURRENTLY
    // this.decodeProc at the moment the data actually arrives.
    if (proc.stdout) proc.stdout.on('data', (chunk) => { if (proc === this.decodeProc) this._onData(chunk); });

    proc.on('exit', (code) => {
      // A real report: switching stations left the BT speaker flickering
      // between previously-selected channels. kill() is asynchronous, so a
      // replaced process's exit lands AFTER _launch() has already started
      // its successor - and this handler used to act on whatever was
      // CURRENT: nulling decodeProc and killing the NEW station's paplay,
      // which made the next tick relaunch again and orphaned a still-
      // running ffmpeg. A process that has already been replaced (or torn
      // down) owns nothing any more, so its exit is ignored outright.
      if (proc !== this.decodeProc) return;
      const wasDebug = this._isDebugSource;
      const wasLoop = this._isDebugLoop;
      this.decodeProc = null;
      this._teardownPlayback();
      if (wasDebug && code === 0) {
        this.status = 'Stopped';
        if (!wasLoop) {
          // One-shot (drum/tone) - don't auto-restart (the sweep/isLoop
          // is left to restart normally via _launch()'s own reset). A
          // real report: "after a few seconds the sound stops but the
          // bars still show" - spec/peak only ever got reset on an
          // explicit stop or a fresh _launch(), never here on a NATURAL
          // completion that intentionally does NOT relaunch, so a
          // finished drum/tone's bars just froze at their last value
          // forever instead of falling back to dark.
          this._debugFinished = true;
          this._stopAnalysisClock();
          this.spec.fill(0);
          this.peak.fill(0);
          this._peakVel.fill(0);
        }
        return;
      }
      this.errored = true; // any exit while a station is still selected is a failure - streams don't have a "clean EOF" in normal use
      const lastLine = stderrTail.trim().split('\n').filter(Boolean).pop();
      this.status = 'Error — ffmpeg exited (' + (lastLine || `code ${code}`) + ')';
    });

    this._launchPlayback();
  }

  // Second process: reads the SAME PCM chunks this._onData() also feeds to
  // the FFT (see _onData below) and plays them out via PulseAudio's
  // `paplay --raw`, which uses whatever sink is currently default - the
  // sink bluetooth.js's routePhoneAudio()/the Setup panel's pairing flow
  // already arranges to be the paired Bluetooth speaker. Deliberately does
  // NOT hunt for a bluez_sink itself and pass --device - PulseAudio's
  // default-sink concept is exactly what "already paired via Setup" means
  // in this project, so respecting it (rather than second-guessing it) is
  // the simplest correct choice.
  _launchPlayback() {
    let proc;
    try {
      // A real report: "I don't hear anything on the BT speaker" - despite
      // the paired speaker correctly showing as the selected PulseAudio
      // output. Root cause: this app runs as root (needed for
      // rpi-led-matrix's GPIO/DMA access), but PulseAudio/PipeWire-pulse
      // runs as a per-user session under the Pi's regular login user -
      // paplay spawned with no env override tries to reach root's own
      // nonexistent session and fails silently (see pulseEnv.js's module
      // comment, and bluetooth.js's original diagnosis of the identical
      // problem for pactl - this is the same fix, just never applied to
      // this second PulseAudio-client process).
      const pulseResult = findPulseEnv();
      const env = pulseResult.env ? { ...process.env, ...pulseResult.env } : process.env;
      const args = ['--raw', '--format=s16le', '--rate=' + SAMPLE_RATE, '--channels=' + CHANNELS];
      if (pulseResult.env) args.unshift('--server=' + pulseResult.env.PULSE_SERVER);
      proc = this._spawn('paplay', args, { stdio: ['pipe', 'ignore', 'pipe'], env });
    } catch (err) {
      this._onPlaybackFail(err);
      return;
    }
    this.playProc = proc;
    this.playbackStatus = 'Starting playback…';
    let stderrTail = '';
    proc.on('error', (err) => this._onPlaybackFail(err, proc));
    if (proc.stderr) proc.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });
    // A write to a dead/closing stdin throws EPIPE - swallow it, _onData()
    // already guards with proc.stdin.writable before writing, this is just
    // a backstop for the race between that check and the pipe actually closing.
    if (proc.stdin) proc.stdin.on('error', () => {});
    // A real report: "the spectrum analyser is very laggy when using the
    // BT speaker." A2DP playback has real, sometimes bursty buffering
    // (visible in a real bluetoothctl transport log: "Delay: 0x0064
    // (100)" - ~100ms baseline, worse under congestion) - paplay's stdin
    // can't always drain writes as fast as ffmpeg produces them. _onData()
    // below wrote to it unconditionally with no backpressure handling, so
    // Node's internal write buffer for that stream had no upper bound:
    // every write that couldn't be flushed immediately just piled up,
    // making the audio (and therefore anything perceptually synced to it)
    // increasingly delayed the longer playback ran, never catching back
    // up on its own. `_playDrained` tracks whether the pipe can currently
    // accept more data without buffering further - _onData() skips
    // forwarding audio to playback while backed up (briefly dropping live
    // samples, the correct behavior for a live stream that's fallen
    // behind - it should catch up to "now", not play out a growing
    // backlog) rather than letting the buffer grow without bound. The FFT/
    // visualization path is untouched either way, since it already reads
    // ffmpeg's own stdout directly, not through this write.
    this._playDrained = true;
    if (proc.stdin) {
      proc.stdin.on('drain', () => { this._playDrained = true; });
    }
    proc.on('exit', (code) => {
      if (this.playProc !== proc) return; // replaced/torn down - see decode exit handler
      this.playProc = null;
      if (code !== 0 && code !== null) {
        const lastLine = stderrTail.trim().split('\n').filter(Boolean).pop();
        this.playbackStatus = 'Playback stopped — ' + (lastLine || `paplay exited (code ${code})`);
      }
    });
  }

  _onPlaybackFail(err, proc) {
    if (proc && proc !== this.playProc) return;
    this.playProc = null;
    if (err && err.code === 'ENOENT') {
      this.playbackStatus = 'paplay not found — install with: sudo apt install pulseaudio-utils';
    } else {
      this.playbackStatus = 'No audio output — ' + ((err && err.message) || 'failed to start paplay') + ' (visualizer still works)';
    }
  }

  _onSpawnFail(err, proc) {
    if (proc && proc !== this.decodeProc) return; // late error from a replaced process
    this.decodeProc = null;
    this.errored = true;
    if (err && err.code === 'ENOENT') {
      this.status = 'ffmpeg not found — install with: sudo apt install ffmpeg';
    } else {
      this.status = 'Error — ' + ((err && err.message) || 'failed to start ffmpeg');
    }
  }

  _onData(chunk) {
    // Forward to playback first (order doesn't matter, but this keeps the
    // two consumers as close to in-sync as possible) - failure here must
    // never throw or block the FFT path below. Skipped entirely while the
    // pipe is still backed up from a previous write (see the 'drain'
    // listener in _launchPlayback()) instead of writing regardless and
    // letting Node's internal buffer grow without bound.
    if (this.playProc && this.playProc.stdin && this.playProc.stdin.writable && this._playDrained) {
      try { this._playDrained = this.playProc.stdin.write(chunk); } catch (e) { /* handled via the stdin 'error' listener */ }
    }

    // Mono-sum into the analysis ring (the Bluetooth playback above stays
    // true stereo - this only feeds the visualizer). An odd trailing byte
    // or half-frame is carried over to the next chunk.
    let buf = chunk;
    if (this._carry && this._carry.length) { buf = Buffer.concat([this._carry, chunk]); this._carry = null; }
    const frames = (buf.length / 4) | 0;
    const ring = this._ring, mask = ring.length - 1;
    let w = this._writePos;
    const ringL = this._ringL, ringR = this._ringR;
    for (let i = 0; i < frames; i++) {
      const l = buf.readInt16LE(i * 4) / 32768, r = buf.readInt16LE(i * 4 + 2) / 32768;
      ringL[w & mask] = l; ringR[w & mask] = r;
      ring[w & mask] = (l + r) / 2;
      w++;
    }
    this._writePos = w;
    if (buf.length > frames * 4) this._carry = Buffer.from(buf.subarray(frames * 4));
    if (frames > 0) {
      this._lastDataMs = performance.now();
      if (this.status === 'Connecting…') this.status = 'Playing';
    }
  }

  // Clock-driven analysis (redone for smoothness). Previously each
  // 2048-sample block was analysed the moment it arrived: only ~21 updates
  // a second (bars moved in visible steps at a 60Hz render), and at the
  // mercy of network bursts - a burst of blocks arriving together made the
  // bars jump ahead of what you hear, then freeze. Now decoded audio goes
  // into a ring buffer, and a steady ANALYSIS_HZ clock analyses the most
  // recent window at a "play cursor" that advances in real time, kept a
  // fixed sync delay behind the newest data (absorbing bursts). Result:
  // 60 fresh spectra a second, evenly spaced, from a sliding window.
  _startAnalysisClock() {
    if (this._analysisTimer) return;
    this._lastTickMs = performance.now();
    this._analysisTimer = setInterval(() => this._analysisTick(), 1000 / ANALYSIS_HZ);
    if (this._analysisTimer.unref) this._analysisTimer.unref();
  }

  _stopAnalysisClock() {
    if (this._analysisTimer) clearInterval(this._analysisTimer);
    this._analysisTimer = null;
  }

  _analysisTick() {
    const now = performance.now();
    const dt = Math.max(0.001, Math.min(0.1, (now - this._lastTickMs) / 1000));
    this._lastTickMs = now;
    const win = this._analyser.win;
    const w = this._writePos;
    let target;
    if (w < win || now - this._lastDataMs > STALL_MS) {
      // Not enough audio yet, or the stream has stalled: let the bars fall
      // rather than freezing on the last window.
      target = this._zeros;
    } else {
      const lag = this._syncS * SAMPLE_RATE;
      if (!(this._playPos > 0)) this._playPos = w - lag;
      this._playPos += dt * SAMPLE_RATE;
      this._playPos += (w - lag - this._playPos) * Math.min(1, dt * 2); // drift back toward the target lag
      const lo = w - this._ring.length + win, hi = w;
      if (this._playPos > hi) this._playPos = hi;
      if (this._playPos < lo) this._playPos = lo;
      if (this._playPos < win) { target = this._zeros; } else target = this._analyser.analyse(this._ring, Math.floor(this._playPos));
    }
    this._lastTarget = target;
    this._applySpectrumTarget(target, dt);
    this._updateVu(target === this._zeros ? -1 : Math.floor(this._playPos), dt);
  }

  // Stereo VU: RMS of each channel over the analysis window, on a dB scale
  // (VU_DB_FLOOR..0dB full-scale sine -> 0..1), with meter ballistics - a
  // quick rise, slow fall, and peak markers that hold then drop.
  _updateVu(end, dt) {
    const win = WINDOW_VU, mask = this._ring.length - 1;
    for (let ch = 0; ch < 2; ch++) {
      let target = 0;
      if (end >= win) {
        const ring = ch === 0 ? this._ringL : this._ringR;
        let sum = 0;
        for (let i = end - win; i < end; i++) { const v = ring[i & mask]; sum += v * v; }
        const rms = Math.sqrt(sum / win);
        const db = rms > 1e-6 ? 20 * Math.log10(rms * Math.SQRT2) : -Infinity;
        target = Math.max(0, Math.min(1, (db - VU_DB_FLOOR) / -VU_DB_FLOOR));
      }
      const cur = this.vu[ch];
      this.vu[ch] = cur + (target - cur) * Math.min(1, dt * (target > cur ? 30 : 3.5));
      if (this.vu[ch] >= this.vu[ch + 2]) { this.vu[ch + 2] = this.vu[ch]; this._vuHold[ch] = 0.8; this._vuVel[ch] = 0; }
      else if (this._vuHold[ch] > 0) this._vuHold[ch] -= dt;
      else { this._vuVel[ch] += dt * 1.5; this.vu[ch + 2] = Math.max(this.vu[ch], this.vu[ch + 2] - this._vuVel[ch] * dt); }
    }
  }

  // Ballistics: near-instant attack so hits land on the beat, a smooth
  // exponential release, and peak markers that hold briefly then fall
  // with gravity - the classic analyser feel. (The old attack of dt*11
  // added ~90ms of lag to every hit.)
  _applySpectrumTarget(target, dt) {
    const attack = Math.min(1, dt * ATTACK_RATE), release = Math.min(1, dt * RELEASE_RATE);
    for (let b = 0; b < BAND_COUNT; b++) {
      const t = target[b], s = this.spec[b];
      this.spec[b] = s + (t - s) * (t > s ? attack : release);
      if (this.spec[b] >= this.peak[b]) { this.peak[b] = this.spec[b]; this._peakVel[b] = 0; this._peakHold[b] = PEAK_HOLD_S; }
      else if (this._peakHold[b] > 0) this._peakHold[b] -= dt;
      else { this._peakVel[b] += dt * PEAK_GRAVITY; this.peak[b] = Math.max(this.spec[b], this.peak[b] - this._peakVel[b] * dt); }
    }
  }

  getStatus() { return this.status; }
  getPlaybackStatus() { return this.playbackStatus; }

  // Re-opens the playback process so it attaches to PulseAudio's CURRENT
  // default output. A playback stream stays on whatever output was default
  // when it started, so a station resumed at startup (before the Bluetooth
  // speaker reconnected) kept playing to the Pi's own output even after
  // the speaker became the default. Called when the audio output changes.
  restartPlayback() {
    if (!this.decodeProc) return;
    this._teardownPlayback();
    this._launchPlayback();
  }

  // Speaker sync delay (see DEFAULT_SYNC_MS). Clamped so the analysis
  // window always stays inside the ring buffer.
  setSyncMs(ms) {
    const v = Number.isFinite(ms) ? Math.max(0, Math.min(MAX_SYNC_MS, ms)) : DEFAULT_SYNC_MS;
    this._syncS = v / 1000;
  }

  // Clears the "one-shot debug tone already finished" latch - called on
  // every genuine new play request (see radio.js's playStation()).
  clearDebugFinished() { this._debugFinished = false; }

  // Plain, structured-clone-friendly copy of what the render side reads -
  // see RemoteAudio below.
  snapshot() {
    return { spec: this.spec, peak: this.peak, vu: this.vu, status: this.status, playbackStatus: this.playbackStatus, lastAttemptMs: this.lastAttemptMs };
  }

  _checkIdle() {
    // A real report: "when on a single freq, the bars sometimes go off
    // and come back again". Root cause: ensure() only actually runs from
    // effectRadio()'s own tick, which only fires while radio is the
    // currently-selected/displayed effect - any gap longer than
    // IDLE_TIMEOUT_MS (10s) without a tick (briefly viewing a different
    // effect, a slow frame, etc.) tripped this safety net, tearing down
    // the process AND clearing this.url - so the very next tick's
    // ensure() saw url!==this.url and relaunched from scratch, reading
    // as "went off, came back". This idle safety net exists for REAL
    // stations (an indefinite stream nobody's watching shouldn't run
    // forever) - debug tones already self-terminate via their own fixed
    // `d=` duration and don't need it.
    if (this.decodeProc && !this._isDebugSource && Date.now() - this.lastEnsureMs > IDLE_TIMEOUT_MS) {
      this._teardown();
      this.url = null;
      this.status = 'Stopped';
      this.playbackStatus = 'No playback attempted';
    }
  }

  _teardownPlayback() {
    if (this.playProc) {
      try { this.playProc.stdin && this.playProc.stdin.end(); } catch (e) { /* already closed */ }
      try { this.playProc.kill('SIGKILL'); } catch (e) { /* already dead */ }
      this.playProc = null;
    }
  }

  _teardown() {
    if (this.decodeProc) {
      try { this.decodeProc.kill('SIGKILL'); } catch (e) { /* already dead */ }
      this.decodeProc = null;
    }
    this._teardownPlayback();
    this._stopAnalysisClock();
    this.spec.fill(0);
    this.peak.fill(0);
    this.vu.fill(0);
  }

  close() {
    clearInterval(this._idleTimer);
    this._teardown();
  }
}

// Stand-in for RadioAudio inside the RENDER_WORKER=1 render thread. A real
// report: raising TICK_HZ from 30 to 60 made the spectrum bars move
// visibly SLOWER on real hardware. The decode/FFT/playback pipeline used
// to live on the render thread itself, and at 60Hz that thread is busy
// back-to-back with tick() + the blocking panel push - ffmpeg's stdout
// only got read in the brief gaps between frames, in large late batches,
// so bar levels advanced in coarse steps. The real RadioAudio now runs on
// the (mostly idle) main thread instead; this proxy just records what the
// radio effect ASKS for (ensure()/clearDebugFinished(), sent back with
// each frame reply via request()) and serves the spectrum/status the main
// thread sends with each tick (applySnapshot()). ensureCount only
// advances while the radio effect is actually ticking, so the main
// thread's RadioAudio idle-timeout still fires exactly as before when
// nothing is asking for audio any more.
class RemoteAudio {
  constructor() {
    this.spec = new Float32Array(BAND_COUNT);
    this.peak = new Float32Array(BAND_COUNT);
    this.vu = new Float32Array(4);
    this.status = 'Stopped';
    this.playbackStatus = 'No playback attempted';
    this.lastAttemptMs = 0;
    this.url = null;
    this.ensureCount = 0;
    this.clearCount = 0;
  }
  ensure(url) { this.url = url || null; this.ensureCount++; }
  setSyncMs(ms) { this.syncMs = ms; }
  clearDebugFinished() { this.clearCount++; }
  getStatus() { return this.status; }
  getPlaybackStatus() { return this.playbackStatus; }
  applySnapshot(snap) {
    if (!snap) return;
    if (snap.spec && snap.spec.length === BAND_COUNT) this.spec.set(snap.spec);
    if (snap.peak && snap.peak.length === BAND_COUNT) this.peak.set(snap.peak);
    if (snap.vu && snap.vu.length === 4) this.vu.set(snap.vu);
    this.status = snap.status;
    this.playbackStatus = snap.playbackStatus;
    this.lastAttemptMs = snap.lastAttemptMs;
  }
  request() { return { url: this.url, ensureCount: this.ensureCount, clearCount: this.clearCount, syncMs: this.syncMs }; }
  close() {}
}

// Main-thread side of RemoteAudio: applies one frame reply's request() to
// the real RadioAudio. Returns the new {ensureCount, clearCount} seen, to
// pass back in as `seen` next time.
function applyRemoteRequest(audio, req, seen) {
  if (!req) return seen;
  if (audio.setSyncMs) audio.setSyncMs(req.syncMs);
  if (req.clearCount !== seen.clearCount) audio.clearDebugFinished();
  if (req.ensureCount !== seen.ensureCount) audio.ensure(req.url);
  return { ensureCount: req.ensureCount, clearCount: req.clearCount };
}

module.exports = { RadioAudio, RemoteAudio, applyRemoteRequest, BAND_COUNT: require('./fft').BAND_COUNT };
