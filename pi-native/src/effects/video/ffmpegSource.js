// Background ffmpeg-based video decode pipeline - the new capability this
// port needed (see ../video.js's module comment for why: no Node
// equivalent to the browser's <video> element). Spawns a system `ffmpeg`
// (NOT an npm wrapper - see ../video.js) to decode a URL to raw RGB24
// frames at a low resolution/fps, piped to stdout, and keeps only the
// latest complete frame (older ones are dropped, never buffered/queued -
// this is what makes it safe to call every tick without unbounded memory
// growth, and mirrors the "always show the current frame" behavior a live
// <video> element gives you for free).
//
// Fully non-blocking from a caller's perspective: `ensure()` only ever
// starts/stops a background child process and returns immediately;
// `getFrame()` just reads whatever's already been buffered. Same
// fire-and-forget shape as weather.js's maybeFetch()/cam.js's maybeFetch().
//
// Failure handling:
//  - ffmpeg not installed: `spawn()` throws/emits an ENOENT 'error' event
//    (depending on platform) - both are caught and surfaced as a clear
//    "install with: sudo apt install ffmpeg" status, never thrown.
//  - bad/unreachable URL: ffmpeg exits non-zero - surfaced with the last
//    line of its stderr. Retried, but only after RETRY_COOLDOWN_MS, so a
//    permanently-bad URL doesn't spin up a fresh doomed process every
//    tick (30/sec) - same "don't hammer a failing endpoint" reasoning as
//    f1-providers.js's f1Fetch() cooldown, see CLAUDE.md.
//  - clean end-of-stream (exit code 0): treated as "loop" - the next
//    ensure() call (same url/dims) respawns immediately, no cooldown,
//    matching the browser's vidEl.loop=true.
//
// Idle shutdown: app.js's tick loop only ever calls the CURRENTLY
// SELECTED effect's function (see app.js's module comment), so
// ensure() simply stops being called at all the moment the user switches
// away from the Video Display effect - but the spawned ffmpeg process
// itself has no way to know that (it just keeps decoding into a pipe
// nobody's reading `getFrame()` from, silently burning CPU). Rather than
// touch app.js's generic tick loop (which has no per-effect
// activate/deactivate hook today) just for this one effect, this module
// watches its OWN `ensure()` call timestamps on an internal timer and
// tears the process down after IDLE_TIMEOUT_MS of nobody calling
// ensure() - equivalent in effect, self-contained here.
'use strict';

const { spawn } = require('child_process');

const RETRY_COOLDOWN_MS = 8000;
const IDLE_TIMEOUT_MS = 10000;
const IDLE_CHECK_MS = 3000;

class FfmpegSource {
  constructor(spawnFn = spawn) {
    this._spawn = spawnFn;
    this.proc = null;
    this.key = null;
    this.width = 0;
    this.height = 0;
    this.frameSize = 0;
    this.pending = Buffer.alloc(0);
    this.latestFrame = null;
    this.status = 'No source';
    this.lastAttemptMs = 0;
    this.lastEnsureMs = 0;
    this.errored = false;
    this._stoppedIntentionally = false;
    this._idleTimer = setInterval(() => this._checkIdle(), IDLE_CHECK_MS);
    if (this._idleTimer.unref) this._idleTimer.unref(); // never keep the process alive on its own
  }

  // Call every tick the video effect is active. `url` empty/falsy tears
  // down any running process. Changing url/width/height/fps mid-stream
  // restarts immediately (same as the browser swapping vidEl.src).
  ensure(url, w, h, fps) {
    this.lastEnsureMs = Date.now();
    if (!url) {
      this._teardown();
      this.key = null;
      this.status = 'No source';
      return;
    }
    const key = `${url}|${w}x${h}|${fps}`;
    if (this.proc && this.key === key) return; // already running the right thing

    if (this.key !== key) {
      this._teardown();
      this.key = key;
      this.width = w;
      this.height = h;
      this.frameSize = w * h * 3;
      this.errored = false;
      this._launch(url, w, h, fps);
      return;
    }

    // Same key, no process running: either it just looped (clean EOF,
    // errored===false) or it died with an error (respect cooldown).
    if (this.errored && Date.now() - this.lastAttemptMs < RETRY_COOLDOWN_MS) return;
    this._launch(url, w, h, fps);
  }

  _launch(url, w, h, fps) {
    this.lastAttemptMs = Date.now();
    this.pending = Buffer.alloc(0);
    this.latestFrame = null;

    let proc;
    try {
      proc = this._spawn('ffmpeg', [
        '-loglevel', 'error',
        '-i', url,
        '-an',
        '-vf', `scale=${w}:${h}`,
        '-r', String(fps),
        '-f', 'rawvideo',
        '-pix_fmt', 'rgb24',
        'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      this._onSpawnFail(err);
      return;
    }

    this.proc = proc;
    this.status = 'Starting…';
    let stderrTail = '';

    // Some platforms deliver a missing-binary failure as an 'error' event
    // (ENOENT) rather than a thrown exception from spawn() itself - both
    // paths are covered.
    proc.on('error', (err) => this._onSpawnFail(err));

    if (proc.stdout) proc.stdout.on('data', (chunk) => this._onData(chunk));
    if (proc.stderr) {
      proc.stderr.on('data', (d) => {
        stderrTail = (stderrTail + d.toString()).slice(-4000);
      });
    }

    proc.on('exit', (code) => {
      const wasIntentional = this._stoppedIntentionally;
      this._stoppedIntentionally = false;
      this.proc = null;
      if (wasIntentional) return;
      if (code === 0) {
        this.errored = false;
        this.status = 'Playing (looping)';
      } else {
        this.errored = true;
        const lastLine = stderrTail.trim().split('\n').filter(Boolean).pop();
        this.status = 'Error — ffmpeg exited (' + (lastLine || `code ${code}`) + ')';
      }
    });
  }

  _onSpawnFail(err) {
    this.proc = null;
    this.errored = true;
    if (err && err.code === 'ENOENT') {
      this.status = 'ffmpeg not found — install with: sudo apt install ffmpeg';
    } else {
      this.status = 'Error — ' + ((err && err.message) || 'failed to start ffmpeg');
    }
  }

  _onData(chunk) {
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : Buffer.from(chunk);
    // Keep only the newest complete frame - drop any older ones already
    // sitting in `pending` once a newer one is available, so a decode
    // rate that briefly outpaces consumption can't grow this unbounded.
    while (this.pending.length >= this.frameSize) {
      this.latestFrame = this.pending.subarray(0, this.frameSize);
      this.pending = this.pending.subarray(this.frameSize);
      if (this.status === 'Starting…') this.status = 'Playing';
    }
  }

  // Returns the latest complete frame (a Buffer/Uint8Array view, w*h*3
  // bytes, RGB24) for the given dims, or null if nothing decoded yet or
  // the requested dims don't match what's currently running (e.g. right
  // after a layout change that changed decode resolution - the caller
  // will see null for one tick until the newly-launched process catches
  // up, same as a browser <video> briefly showing a stale/blank frame
  // right after src changes).
  getFrame(w, h) {
    if (this.width !== w || this.height !== h) return null;
    return this.latestFrame;
  }

  getStatus() { return this.status; }

  _checkIdle() {
    if (this.proc && Date.now() - this.lastEnsureMs > IDLE_TIMEOUT_MS) {
      this._teardown();
      this.key = null;
      this.status = 'No source';
    }
  }

  _teardown() {
    if (this.proc) {
      this._stoppedIntentionally = true;
      try { this.proc.kill('SIGKILL'); } catch (e) { /* already dead */ }
      this.proc = null;
    }
    this.latestFrame = null;
    this.pending = Buffer.alloc(0);
  }

  // For tests/shutdown - stops the process and the idle-check timer.
  destroy() {
    this._teardown();
    clearInterval(this._idleTimer);
  }
}

module.exports = { FfmpegSource, RETRY_COOLDOWN_MS, IDLE_TIMEOUT_MS };
