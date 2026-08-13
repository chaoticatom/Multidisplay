// Live browser-captured video source (webcam or screen-share, via the
// browser's getUserMedia()/getDisplayMedia()) - the counterpart to
// ffmpegSource.js's URL-based decode pipeline. A headless Pi has no
// camera/display of its own to capture from, but a connected BROWSER TAB
// does - getUserMedia/getDisplayMedia are browser APIs, entirely
// independent of what's actually driving the LED panels - so instead of
// decoding server-side, the browser captures+downsamples frames itself
// (see public/app.js's startBrowserCapture()) and streams them to the Pi
// over the existing WebSocket connection as binary messages (see
// wsServer.js's module comment for the wire format: [type=1][wLo,wHi]
// [hLo,hHi][RGB24 payload]). This module just holds onto the latest one.
//
// Deliberately mirrors FfmpegSource's getFrame(w,h)-exact-dims-match
// contract (returns null if the caller's requested dims don't match
// what's currently arriving, or nothing has arrived recently) so video.js/
// videoWall.js can read from whichever source is active - ffmpeg or
// browser - through the exact same buildComposite()/projectToFaces()
// code, with no branching needed there beyond picking which source's
// getFrame() to call.
//
// Single process-wide singleton (not one per cube/wall effect instance,
// unlike FfmpegSource, which owns a whole child process per instance) -
// there's only ever one "the browser's live camera feed" regardless of
// which panel-mode effect is currently rendering it, and only one
// connected control browser is expected to ever be actively streaming at
// once in practice.
'use strict';

// No new frame in this long -> treat the feed as gone (browser tab
// closed/backgrounded, camera permission revoked, WiFi dropped, etc) -
// same idea as a browser <video> element stalling when its source stops,
// and long enough to tolerate a brief WS hiccup without visibly cutting
// out (see the WS reconnect churn documented in this project's real
// deployment reports) without leaving a frozen frame on screen forever if
// the feed is genuinely gone.
const STALE_MS = 3000;

class BrowserFrameSource {
  constructor() {
    this.latestFrame = null;
    this.width = 0;
    this.height = 0;
    this.lastFrameMs = 0;
    this.kind = null; // 'cam' | 'screen' - informational only, for getStatus()
  }

  setFrame(buf, w, h, kind) {
    this.latestFrame = buf;
    this.width = w;
    this.height = h;
    this.lastFrameMs = Date.now();
    if (kind) this.kind = kind;
  }

  getFrame(w, h) {
    if (this.width !== w || this.height !== h) return null;
    if (Date.now() - this.lastFrameMs > STALE_MS) return null;
    return this.latestFrame;
  }

  getStatus() {
    if (!this.latestFrame) return 'Waiting for browser camera/screen…';
    if (Date.now() - this.lastFrameMs > STALE_MS) return 'Browser feed stalled (tab closed/backgrounded?)';
    return `Receiving live ${this.kind === 'screen' ? 'screen share' : 'camera'} from browser (${this.width}x${this.height})`;
  }
}

// Shared singleton - see module comment above for why.
const browserFrameSource = new BrowserFrameSource();

module.exports = { browserFrameSource, BrowserFrameSource };
