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
const { computeBands, BAND_COUNT } = require('./fft');
const { findPulseEnv } = require('../../pulseEnv');

const RETRY_COOLDOWN_MS = 8000;
const IDLE_TIMEOUT_MS = 10000;
const IDLE_CHECK_MS = 3000;
const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2; // s16le
const FRAME_SAMPLES = 2048; // samples per channel per FFT chunk (~46ms @ 44.1kHz)
const CHUNK_BYTES = FRAME_SAMPLES * CHANNELS * BYTES_PER_SAMPLE;

class RadioAudio {
  constructor(spawnFn = spawn) {
    this._spawn = spawnFn;
    this.decodeProc = null;
    this.playProc = null;
    this.url = null;
    this.pending = Buffer.alloc(0);
    this.status = 'Stopped';
    this.playbackStatus = 'No playback attempted';
    this.lastAttemptMs = 0;
    this.lastEnsureMs = 0;
    this.errored = false;
    this._stoppedIntentionally = false;

    // Canonical 256 log-spaced band levels (smoothed) + falling peak-hold,
    // same shape as effects-core.js's auSpec/auPeak - see ./spectrum.js for
    // how a caller re-samples this down to a smaller displayed band count.
    this.spec = new Float32Array(BAND_COUNT);
    this.peak = new Float32Array(BAND_COUNT);
    this._peakVel = new Float32Array(BAND_COUNT);
    this._lastChunkMs = 0;

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

    if (this.errored && Date.now() - this.lastAttemptMs < RETRY_COOLDOWN_MS) return;
    this._launch(url);
  }

  _launch(url) {
    this.lastAttemptMs = Date.now();
    this.pending = Buffer.alloc(0);
    this._lastChunkMs = Date.now();

    let proc;
    try {
      proc = this._spawn('ffmpeg', [
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

    proc.on('error', (err) => this._onSpawnFail(err));
    if (proc.stderr) proc.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-4000); });
    if (proc.stdout) proc.stdout.on('data', (chunk) => this._onData(chunk));

    proc.on('exit', (code) => {
      const wasIntentional = this._stoppedIntentionally;
      this._stoppedIntentionally = false;
      this.decodeProc = null;
      this._teardownPlayback();
      if (wasIntentional) return;
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
    proc.on('error', (err) => this._onPlaybackFail(err));
    if (proc.stderr) proc.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });
    // A write to a dead/closing stdin throws EPIPE - swallow it, _onData()
    // already guards with proc.stdin.writable before writing, this is just
    // a backstop for the race between that check and the pipe actually closing.
    if (proc.stdin) proc.stdin.on('error', () => {});
    proc.on('exit', (code) => {
      if (this.playProc === proc) this.playProc = null;
      if (this._stoppedIntentionally) return;
      if (code !== 0 && code !== null) {
        const lastLine = stderrTail.trim().split('\n').filter(Boolean).pop();
        this.playbackStatus = 'Playback stopped — ' + (lastLine || `paplay exited (code ${code})`);
      }
    });
  }

  _onPlaybackFail(err) {
    this.playProc = null;
    if (err && err.code === 'ENOENT') {
      this.playbackStatus = 'paplay not found — install with: sudo apt install pulseaudio-utils';
    } else {
      this.playbackStatus = 'No audio output — ' + ((err && err.message) || 'failed to start paplay') + ' (visualizer still works)';
    }
  }

  _onSpawnFail(err) {
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
    // never throw or block the FFT path below.
    if (this.playProc && this.playProc.stdin && this.playProc.stdin.writable) {
      try { this.playProc.stdin.write(chunk); } catch (e) { /* handled via the stdin 'error' listener */ }
    }

    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : Buffer.from(chunk);
    while (this.pending.length >= CHUNK_BYTES) {
      const frame = this.pending.subarray(0, CHUNK_BYTES);
      this.pending = this.pending.subarray(CHUNK_BYTES);
      this._processFrame(frame);
      if (this.status === 'Connecting…') this.status = 'Playing';
    }
  }

  _processFrame(frameBuf) {
    const now = Date.now();
    const dt = Math.max(0.005, Math.min(0.5, (now - this._lastChunkMs) / 1000));
    this._lastChunkMs = now;

    // Mono-sum the interleaved stereo s16le samples - see module comment /
    // CLAUDE.md task note: full stereo separation isn't worth the added
    // complexity for a 64px visualizer, mono-summed is an acceptable
    // simplification. (Bluetooth playback above stays true stereo -
    // this mono-sum only affects the spectrum data.)
    const samples = new Float32Array(FRAME_SAMPLES);
    for (let i = 0; i < FRAME_SAMPLES; i++) {
      const l = frameBuf.readInt16LE(i * 4);
      const r = frameBuf.readInt16LE(i * 4 + 2);
      samples[i] = ((l + r) / 2) / 32768;
    }

    const target = computeBands(samples, SAMPLE_RATE);
    for (let b = 0; b < BAND_COUNT; b++) {
      const t = target[b];
      if (t > this.spec[b]) this.spec[b] += (t - this.spec[b]) * Math.min(1, dt * 20);
      else this.spec[b] += (t - this.spec[b]) * Math.min(1, dt * 7);
      if (this.spec[b] > this.peak[b]) { this.peak[b] = this.spec[b]; this._peakVel[b] = 0; }
      else { this._peakVel[b] += dt * 1.2; this.peak[b] = Math.max(0, this.peak[b] - this._peakVel[b] * dt); }
    }
  }

  getStatus() { return this.status; }
  getPlaybackStatus() { return this.playbackStatus; }

  _checkIdle() {
    if (this.decodeProc && Date.now() - this.lastEnsureMs > IDLE_TIMEOUT_MS) {
      this._teardown();
      this.url = null;
      this.status = 'Stopped';
      this.playbackStatus = 'No playback attempted';
    }
  }

  _teardownPlayback() {
    if (this.playProc) {
      this._stoppedIntentionally = true; // shared flag is fine - decode teardown always accompanies this
      try { this.playProc.stdin && this.playProc.stdin.end(); } catch (e) { /* already closed */ }
      try { this.playProc.kill('SIGKILL'); } catch (e) { /* already dead */ }
      this.playProc = null;
    }
  }

  _teardown() {
    if (this.decodeProc) {
      this._stoppedIntentionally = true;
      try { this.decodeProc.kill('SIGKILL'); } catch (e) { /* already dead */ }
      this.decodeProc = null;
    }
    this._teardownPlayback();
    this.spec.fill(0);
    this.peak.fill(0);
  }

  close() {
    clearInterval(this._idleTimer);
    this._teardown();
  }
}

module.exports = { RadioAudio, BAND_COUNT: require('./fft').BAND_COUNT };
