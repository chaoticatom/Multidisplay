// ---------------------------------------------------------------------
// Camera's option panel (panel-cam) - snapshot URL + fetch-rate slider,
// backed by core.effectOptions.cam.{url,rate}. The original browser effect
// just reads `#cam-url`/`#cam-rate`'s live `.value` each fetch cycle with no
// explicit submit step; there's no equivalent "read the DOM directly" path
// server-side; setEffectOption on the URL field's blur/change (not on every
// keystroke like the rate slider's `input`) is the closest equivalent to
// "read when needed" without spamming a setEffectOption message per
// keystroke while someone's still typing a URL.
// ---------------------------------------------------------------------
function wireCamPanel() {
  const panel = document.getElementById('panel-cam');
  if (!panel) return;

  const url = panel.querySelector('#cam-url');
  if (url) url.addEventListener('change', () => setEffectOption('cam', 'url', url.value.trim()));

  const rate = panel.querySelector('#cam-rate'), rateVal = panel.querySelector('#cam-rate-val');
  if (rate) rate.addEventListener('input', () => {
    if (rateVal) rateVal.textContent = rate.value;
    setEffectOption('cam', 'rate', Number(rate.value));
  });
}

// ---------------------------------------------------------------------
// Astronomy Pic of the Day's option panel (panel-apod) - a status readout
// plus a manual "Refresh" button, backed by src/effects/apod.js's daily
// auto-fetch + getStatus(). The browser's history-browsing Prev/Next and
// the shared .art-shared-panel Slideshow/Letterbox controls are not wired
// here - they belong to Unsplash/Art Gallery too, neither of which is
// ported to pi-native yet (see apod.js's module comment). The NASA API
// key input is also left unwired: this port reads NASA_API_KEY from the
// server's environment rather than per-browser localStorage, so there's
// no setEffectOption equivalent for it - grey just that sub-block.
// There's no dedicated one-shot "refresh now" command, so this reuses the
// same monotonically-increasing-token trick as maze.js's "NEW MAZE"/
// dice.js's "roll" buttons.
// ---------------------------------------------------------------------
let _apodRefreshToken = 0;
// NASA API key input - backed by the dedicated setNasaConfig command
// (persisted server-side, shared by APOD/EPIC/NEO - see wsServer.js's
// module comment and nasaConfig.js). Was previously greyed out entirely
// ("set via the server's NASA_API_KEY environment variable, not per-
// browser") - a real request: "enable the NASA apod API field. I have the
// api to enter."
function wireApodPanel() {
  const panel = document.getElementById('panel-apod');
  if (!panel) return;
  const keyInput = panel.querySelector('#nasa-api-key-input');
  const saveBtn = panel.querySelector('#nasa-api-key-save');
  if (saveBtn) saveBtn.addEventListener('click', () => send({ cmd: 'setNasaConfig', apiKey: (keyInput?.value || '').trim() }));
  const fetchBtn = panel.querySelector('#apod-fetch-btn');
  if (fetchBtn) fetchBtn.addEventListener('click', () => setEffectOption('apod', 'refresh', ++_apodRefreshToken));
}

function syncApodPanel() {
  const panel = document.getElementById('panel-apod');
  if (!panel) return;
  const keyInput = panel.querySelector('#nasa-api-key-input');
  if (keyInput && document.activeElement !== keyInput) keyInput.value = currentState.nasaConfig?.apiKey || '';
  const status = currentState.effectStatus?.apod;
  const statusEl = panel.querySelector('#apod-status');
  const infoEl = panel.querySelector('#apod-info');
  const titleEl = panel.querySelector('#apod-title-line');
  const dateEl = panel.querySelector('#apod-date-line');
  if (!status) { if (statusEl) statusEl.textContent = 'Not fetched yet'; return; }
  if (statusEl) statusEl.textContent = status.error ? ('✕ ' + status.error) : status.text;
  if (status.title) {
    if (infoEl) infoEl.style.display = 'block';
    if (titleEl) titleEl.textContent = 'Title: ' + status.title;
    if (dateEl) dateEl.textContent = 'Date: ' + (status.date || '—') + (status.mediaType === 'video' ? ' (video — thumbnail)' : '');
  }
}

// ---------------------------------------------------------------------
// Unsplash Photos (panel-unsplash) - search query + API key input, backed
// by the dedicated setUnsplashConfig command (persisted server-side, see
// wsServer.js's module comment and unsplashConfig.js) rather than the
// generic setEffectOption store, since the key must survive a restart.
// Prev/Next and the shared Slideshow/Letterbox/Speed controls live in the
// .art-shared-panel above it - see wireGalleryShared()/syncGalleryShared()
// below, shared with Art Gallery.
// ---------------------------------------------------------------------
function wireUnsplashPanel() {
  const panel = document.getElementById('panel-unsplash');
  if (!panel) return;
  const queryInput = panel.querySelector('#unsplash-query');
  const keyInput = panel.querySelector('#unsplash-api-key-input');
  const sendConfig = () => send({
    cmd: 'setUnsplashConfig',
    apiKey: (keyInput?.value || '').trim(),
    query: (queryInput?.value || '').trim() || 'nature',
  });
  panel.querySelector('#unsplash-fetch-btn')?.addEventListener('click', sendConfig);
  panel.querySelector('#unsplash-api-key-save')?.addEventListener('click', sendConfig);
  queryInput?.addEventListener('change', sendConfig);
}

function syncUnsplashPanel() {
  const panel = document.getElementById('panel-unsplash');
  if (!panel) return;
  const cfg = currentState.unsplashConfig || { apiKey: '', query: 'nature' };
  const queryInput = panel.querySelector('#unsplash-query');
  const keyInput = panel.querySelector('#unsplash-api-key-input');
  if (queryInput && document.activeElement !== queryInput) queryInput.value = cfg.query || 'nature';
  if (keyInput && document.activeElement !== keyInput) keyInput.value = cfg.apiKey || '';
  const status = currentState.effectStatus?.unsplash;
  const statusEl = panel.querySelector('#unsplash-status');
  if (statusEl) statusEl.textContent = status ? (status.error ? ('✕ ' + status.error) : status.text) : 'Enter API key below to start';
  const infoEl = panel.querySelector('#unsplash-info');
  const photoInfoEl = panel.querySelector('#unsplash-photo-info');
  if (status && status.count > 0) {
    if (infoEl) infoEl.style.display = 'block';
    if (photoInfoEl) photoInfoEl.textContent = (status.index + 1) + '/' + status.count;
  } else if (infoEl) infoEl.style.display = 'none';
}

// ---------------------------------------------------------------------
// Art Gallery / Met Museum (panel-artic) - search query only, no API key
// (keyless public collection API). Prev/Next/Slideshow/Letterbox/Speed
// come from the shared .art-shared-panel - see wireGalleryShared() below.
// ---------------------------------------------------------------------
function wireArticPanel() {
  const panel = document.getElementById('panel-artic');
  if (!panel) return;
  const queryInput = panel.querySelector('#artic-query');
  const sendQuery = () => setEffectOption('artic', 'query', (queryInput?.value || '').trim());
  panel.querySelector('#artic-fetch-btn')?.addEventListener('click', sendQuery);
  queryInput?.addEventListener('change', sendQuery);
}

function syncArticPanel() {
  const panel = document.getElementById('panel-artic');
  if (!panel) return;
  const queryInput = panel.querySelector('#artic-query');
  const opts = currentState.effectOptions?.artic || {};
  if (queryInput && document.activeElement !== queryInput) queryInput.value = opts.query || '';
  const status = currentState.effectStatus?.artic;
  const statusEl = panel.querySelector('#artic-status');
  if (statusEl) statusEl.textContent = status ? (status.error ? ('✕ ' + status.error) : status.text) : 'Loading random artworks…';
  const infoEl = panel.querySelector('#artic-info');
  const workInfoEl = panel.querySelector('#artic-work-info');
  if (status && status.count > 0) {
    if (infoEl) infoEl.style.display = 'block';
    if (workInfoEl) workInfoEl.textContent = (status.index + 1) + '/' + status.count;
  } else if (infoEl) infoEl.style.display = 'none';
}

// ---------------------------------------------------------------------
// Shared "Art" submenu controls (#art-slideshow-chk/#art-letterbox-chk/
// #art-speed/#art-prev-btn/#art-next-btn) - apply to whichever of
// Unsplash/Art Gallery (GALLERY_EFFECTS) is the currently selected effect,
// same single-shared-panel-drives-several-effects shape as the browser's
// artSyncSharedControls()/ART_EFFECTS (minus APOD - see wireApodPanel).
// Prev/Next use monotonically-increasing tokens (effects/unsplash.js's/
// effects/artic.js's prevToken/nextToken), same trick as apod.js's Refresh.
// ---------------------------------------------------------------------
let _galleryPrevToken = 0, _galleryNextToken = 0;
function wireGalleryShared() {
  // IDs (not the shared .art-shared-panel CLASS) are used to locate these -
  // index.html reuses that same class name for the unrelated Jokes/Trivia
  // shared-controls block too (see CLAUDE.md's "Submenu / shared-controls
  // UI pattern"), so a class-scoped query would silently grab the wrong
  // block if section order ever changes; these element IDs are unique.
  const slideshowChk = document.getElementById('art-slideshow-chk');
  const letterboxChk = document.getElementById('art-letterbox-chk');
  const speed = document.getElementById('art-speed');
  const speedLbl = document.getElementById('art-speed-label');
  const prevBtn = document.getElementById('art-prev-btn');
  const nextBtn = document.getElementById('art-next-btn');
  if (!slideshowChk && !letterboxChk && !speed && !prevBtn && !nextBtn) return;

  const activeGalleryEffect = () => (GALLERY_EFFECTS.includes(currentState.effect) ? currentState.effect : null);

  slideshowChk?.addEventListener('change', () => {
    const eff = activeGalleryEffect(); if (eff) setEffectOption(eff, 'slideshowOn', slideshowChk.checked);
  });
  letterboxChk?.addEventListener('change', () => {
    const eff = activeGalleryEffect(); if (eff) setEffectOption(eff, 'letterbox', letterboxChk.checked);
  });
  speed?.addEventListener('input', () => {
    const v = Number(speed.value);
    if (speedLbl) speedLbl.textContent = v + 's';
    const eff = activeGalleryEffect(); if (eff) setEffectOption(eff, 'speedSecs', v);
  });
  prevBtn?.addEventListener('click', () => {
    const eff = activeGalleryEffect(); if (eff) setEffectOption(eff, 'prevToken', ++_galleryPrevToken);
  });
  nextBtn?.addEventListener('click', () => {
    const eff = activeGalleryEffect(); if (eff) setEffectOption(eff, 'nextToken', ++_galleryNextToken);
  });
}

function syncGalleryShared() {
  const eff = GALLERY_EFFECTS.includes(currentState.effect) ? currentState.effect : null;
  const slideshowChk = document.getElementById('art-slideshow-chk');
  const letterboxChk = document.getElementById('art-letterbox-chk');
  const speed = document.getElementById('art-speed');
  const speedLbl = document.getElementById('art-speed-label');
  const opts = eff ? (currentState.effectOptions?.[eff] || {}) : {};
  if (slideshowChk) slideshowChk.checked = opts.slideshowOn !== false;
  if (letterboxChk) letterboxChk.checked = opts.letterbox !== false;
  if (speed && document.activeElement !== speed) {
    const v = Number(opts.speedSecs) > 0 ? Number(opts.speedSecs) : (eff === 'artic' ? 10 : 8);
    speed.value = v;
    if (speedLbl) speedLbl.textContent = v + 's';
  }
}

// ---------------------------------------------------------------------
// Jokes / Trivia / On This Day (panel-joke/panel-trivia/panel-otd) - the
// three word-cascade text effects, plus the shared "Trivia & Facts"
// Auto-advance/Next-after controls above them (#tf-auto-chk/#tf-speed) that
// drive Jokes and Trivia only (On This Day auto-advances between events on
// its own fixed 2.5s hold, same as the browser - it has no "static" mode
// since there's no single-item "done" state to hold on, just a rotating
// list). Backed by core.effectOptions.triviaFacts.{autoOn,holdSecs} - see
// joke.js/trivia.js's comment on why a shared pseudo-key instead of two
// separate per-effect options.
// ---------------------------------------------------------------------
function wireJokePanel() {
  const panel = document.getElementById('panel-joke');
  if (!panel) return;
  const btn = panel.querySelector('#joke-fetch-btn');
  if (btn) btn.addEventListener('click', () => setEffectOption('joke', 'refreshRequestedAt', Date.now()));
}
function syncJokePanel() {
  const panel = document.getElementById('panel-joke');
  if (!panel) return;
  const status = currentState.effectStatus?.joke;
  const statusEl = panel.querySelector('#joke-status');
  if (statusEl) statusEl.textContent = status ? (status.error ? ('✕ ' + status.error) : status.text) : 'Fetching a joke…';
}

function wireTriviaPanel() {
  const panel = document.getElementById('panel-trivia');
  if (!panel) return;
  const btn = panel.querySelector('#trivia-fetch-btn');
  if (btn) btn.addEventListener('click', () => setEffectOption('trivia', 'refreshRequestedAt', Date.now()));
}
function syncTriviaPanel() {
  const panel = document.getElementById('panel-trivia');
  if (!panel) return;
  const status = currentState.effectStatus?.trivia;
  const statusEl = panel.querySelector('#trivia-status');
  if (statusEl) statusEl.textContent = status ? (status.error ? ('✕ ' + status.error) : status.text) : 'Fetching a question…';
}

function wireOtdPanel() {
  const panel = document.getElementById('panel-otd');
  if (!panel) return;
  const btn = panel.querySelector('#otd-fetch-btn');
  if (btn) btn.addEventListener('click', () => setEffectOption('otd', 'refreshRequestedAt', Date.now()));
}
function syncOtdPanel() {
  const panel = document.getElementById('panel-otd');
  if (!panel) return;
  const status = currentState.effectStatus?.otd;
  const statusEl = panel.querySelector('#otd-status');
  if (statusEl) statusEl.textContent = status ? (status.error ? ('✕ ' + status.error) : status.text) : 'Fetching today in history…';
  const infoEl = panel.querySelector('#otd-info');
  const countLine = panel.querySelector('#otd-count-line');
  if (status && status.count > 0) {
    if (infoEl) infoEl.style.display = 'block';
    if (countLine) countLine.textContent = status.count + ' historical events';
  } else if (infoEl) infoEl.style.display = 'none';
}

function wireTriviaFactsShared() {
  const autoChk = document.getElementById('tf-auto-chk');
  const speed = document.getElementById('tf-speed');
  const speedLbl = document.getElementById('tf-speed-label');
  if (!autoChk && !speed) return;
  // Written under the shared pseudo-effect-key 'triviaFacts' (not a real
  // registered effect) - joke.js/trivia.js both read
  // core.effectOptions.triviaFacts.{autoOn,holdSecs} regardless of which of
  // the two is currently selected, same shape as GALLERY_EFFECTS' shared
  // panel but with no "active effect" gate needed since there's only one
  // shared key, not per-effect values.
  autoChk?.addEventListener('change', () => setEffectOption('triviaFacts', 'autoOn', autoChk.checked));
  speed?.addEventListener('input', () => {
    const v = Number(speed.value);
    if (speedLbl) speedLbl.textContent = v + 's';
    setEffectOption('triviaFacts', 'holdSecs', v);
  });
}
function syncTriviaFactsShared() {
  const autoChk = document.getElementById('tf-auto-chk');
  const speed = document.getElementById('tf-speed');
  const speedLbl = document.getElementById('tf-speed-label');
  const opts = currentState.effectOptions?.triviaFacts || {};
  if (autoChk && document.activeElement !== autoChk) autoChk.checked = opts.autoOn !== false;
  if (speed && document.activeElement !== speed) {
    const v = Number(opts.holdSecs) > 0 ? Number(opts.holdSecs) : 5;
    speed.value = v;
    if (speedLbl) speedLbl.textContent = v + 's';
  }
}

function syncCamPanel() {
  const panel = document.getElementById('panel-cam');
  if (!panel) return;
  const opts = currentState.effectOptions?.cam || {};
  const url = panel.querySelector('#cam-url');
  if (url && document.activeElement !== url) url.value = opts.url || '';
  const rate = panel.querySelector('#cam-rate'), rateVal = panel.querySelector('#cam-rate-val');
  if (rate && document.activeElement !== rate) { rate.value = opts.rate ?? 5; if (rateVal) rateVal.textContent = rate.value; }
  const statusEl = document.getElementById('cam-status');
  if (statusEl) statusEl.textContent = currentState.effectStatus?.cam || 'Idle';
}

// ---------------------------------------------------------------------
// Video Display's option panel (panel-video) - a URL (decoded via ffmpeg
// on the Pi, see src/effects/video.js) instead of the browser's file/
// webcam/screen-capture pickers, which have no server-side equivalent -
// those 4 buttons + the Stop button are disabled here rather than wired,
// same "grey what has no backend" treatment as everywhere else, just done
// per-control instead of markUnsupported()'s whole-panel sweep since this
// panel mixes wired and unwired controls.
// ---------------------------------------------------------------------
// Uploads a File chosen via the browser's native file picker (works from a
// phone too - <input type=file accept="video/*"> opens the camera roll/
// Files app there) to the server's /api/uploadVideo endpoint as the raw
// POST body, then points the video effect at whatever local path the
// server saved it to - see wsServer.js's _handleUpload()/UPLOAD_DIR
// comments for why this is a raw-body upload rather than multipart, and
// for why only one upload is ever kept on disk.
function uploadVideoFile(file, statusEl) {
  if (!file) return;
  stopBrowserCapture(); // an upload supersedes any live camera/screen capture in progress
  if (statusEl) statusEl.textContent = 'Uploading ' + file.name + '…';
  fetch('/api/uploadVideo?name=' + encodeURIComponent(file.name), { method: 'POST', body: file, headers: { 'X-Control-Pin': storedPin() } })
    .then((r) => r.json())
    .then((d) => {
      if (!d.ok) throw new Error(d.error || 'Upload failed');
      setEffectOption('video', 'source', 'url');
      setEffectOption('video', 'url', d.path);
      // Guarantees the upload is actually visible regardless of whatever
      // effect happened to be selected before - a real report traced to
      // this exact gap: the panel can still LOOK selected in a stale
      // browser tab (e.g. after a server restart reset state.effect back
      // to the default 'wave', which isn't persisted to disk) while the
      // server is actually showing something else, so the upload
      // "succeeds" (status says Playing) but nothing on the panels
      // changes. Explicitly selecting Video Display here removes that
      // whole class of confusing state mismatch.
      send({ cmd: 'setEffect', effect: 'video' });
      if (statusEl) statusEl.textContent = 'Uploaded ' + file.name + ' — decoding…';
    })
    .catch((err) => { if (statusEl) statusEl.textContent = '✕ ' + err.message; });
}

// ---------------------------------------------------------------------
// Live webcam / screen-share capture for Video Display - a headless Pi
// has no camera/display of its own, but THIS browser tab does
// (getUserMedia/getDisplayMedia are browser APIs, independent of what's
// actually driving the LED panels), so frames are captured+downsampled
// right here and streamed to the Pi over the existing WS connection as
// binary messages (see wsServer.js's module comment for the wire format
// and effects/video/browserFrameSource.js for how the server consumes
// them). Only runs while this tab stays open/connected and the capture
// hasn't been stopped - unlike a typed URL or an uploaded file (which
// play back entirely server-side via ffmpeg and keep going with no
// browser needed), this is fundamentally tab-dependent.
let browserCaptureState = null; // {stream, video, canvas, ctx, interval, kind} | null

function stopBrowserCapture() {
  if (!browserCaptureState) return;
  clearInterval(browserCaptureState.interval);
  browserCaptureState.stream.getTracks().forEach((t) => t.stop());
  browserCaptureState = null;
}

// Mirrors video.js's/videoWall.js's own decode-dims logic (see their
// module comments): a single square SIZE×SIZE tile in cube/2d mode
// (panorama/perspective layouts aren't meaningful for a live capture -
// video.js clamps to 'mirror' server-side if one is still selected when
// switching to a browser source), or the full stitched wallW×wallH
// canvas in wall mode.
function computeCaptureDims() {
  const size = currentState.panelSize || 64;
  if (currentState.panelMode === 'wall') {
    const panels = currentState.panels || [];
    if (!panels.length) return { w: size, h: size };
    const cols = Math.max(1, ...panels.map((p) => p.gx + 1));
    const rows = Math.max(1, ...panels.map((p) => p.gy + 1));
    return { w: cols * size, h: rows * size };
  }
  return { w: size, h: size };
}

function startBrowserCapture(kind, statusEl) {
  stopBrowserCapture();
  if (statusEl) statusEl.textContent = kind === 'screen' ? 'Requesting screen share…' : 'Requesting camera…';
  const getMedia = kind === 'screen'
    ? navigator.mediaDevices.getDisplayMedia({ video: true })
    : navigator.mediaDevices.getUserMedia({ video: true, audio: false });

  getMedia.then((stream) => {
    const videoEl = document.createElement('video');
    videoEl.srcObject = stream;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.play().catch(() => {}); // autoplay can reject before the first user gesture settles - harmless, drawImage below just waits for readyState

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const kindByte = kind === 'screen' ? 1 : 0;

    const captureFrame = () => {
      if (!ws || ws.readyState !== WebSocket.OPEN || videoEl.readyState < 2) return;
      const { w, h } = computeCaptureDims();
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.drawImage(videoEl, 0, 0, w, h);
      let imgData;
      try { imgData = ctx.getImageData(0, 0, w, h).data; } catch (e) { return; } // e.g. a tainted canvas - shouldn't happen for a local getUserMedia/getDisplayMedia stream, but never let a capture-loop error go uncaught
      // [type=1][w LE16][h LE16][kind][R,G,B * w*h] - see wsServer.js's
      // module comment. RGBA -> RGB24 here (drop alpha) to match what
      // FfmpegSource's ffmpeg output already looks like server-side, and
      // to cut the wire payload by 25%.
      const out = new Uint8Array(6 + w * h * 3);
      out[0] = 1;
      out[1] = w & 0xff; out[2] = (w >> 8) & 0xff;
      out[3] = h & 0xff; out[4] = (h >> 8) & 0xff;
      out[5] = kindByte;
      for (let i = 0, j = 6; i < imgData.length; i += 4, j += 3) {
        out[j] = imgData[i]; out[j + 1] = imgData[i + 1]; out[j + 2] = imgData[i + 2];
      }
      ws.send(out);
    };

    const interval = setInterval(captureFrame, 1000 / 10); // matches video.js's DECODE_FPS - an LED wall has no use for a faster capture rate
    browserCaptureState = { stream, video: videoEl, canvas, ctx, interval, kind };

    setEffectOption('video', 'source', 'browser');
    send({ cmd: 'setEffect', effect: 'video' });
    if (statusEl) statusEl.textContent = (kind === 'screen' ? 'Sharing screen' : 'Streaming camera') + '…';

    // The browser's OWN "Stop sharing" bar (screen capture) or the OS
    // revoking camera access ends the track directly, bypassing our Stop
    // button entirely - detect that and tear the capture loop down too,
    // rather than continuing to try to draw from a dead stream forever.
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (browserCaptureState && browserCaptureState.stream === stream) {
        stopBrowserCapture();
        if (statusEl) statusEl.textContent = 'Capture ended';
      }
    });
  }).catch((err) => {
    if (statusEl) statusEl.textContent = '✕ ' + (err.message || 'Permission denied or cancelled');
  });
}

function wireVideoPanel() {
  const panel = document.getElementById('panel-video');
  if (!panel) return;

  const statusEl = panel.querySelector('#vid-status');
  const vidFileBtn = panel.querySelector('#vid-file-btn'), vidFileInput = panel.querySelector('#vid-file-input');
  if (vidFileBtn && vidFileInput) {
    vidFileBtn.addEventListener('click', () => vidFileInput.click());
    vidFileInput.addEventListener('change', () => { uploadVideoFile(vidFileInput.files[0], statusEl); vidFileInput.value = ''; });
  }
  const imgFileBtn = panel.querySelector('#img-file-btn'), imgFileInput = panel.querySelector('#img-file-input');
  if (imgFileBtn && imgFileInput) {
    imgFileBtn.addEventListener('click', () => imgFileInput.click());
    imgFileInput.addEventListener('change', () => { uploadVideoFile(imgFileInput.files[0], statusEl); imgFileInput.value = ''; });
  }
  // getUserMedia()/getDisplayMedia() only exist in a "secure context" -
  // HTTPS, or the literal localhost/127.0.0.1 origin - browser policy,
  // not a feature this app can work around. This page is normally loaded
  // over plain http://<pi-hostname>:8081/ on a LAN, which does NOT
  // qualify, so navigator.mediaDevices itself is undefined there. A real
  // report traced the greyed-out cam/screen buttons to exactly this
  // (mistakenly assumed at first to be a "browser doesn't support it"
  // problem, which it wasn't) - see wsServer.js's module comment for the
  // HTTPS listener (port+1, self-signed cert) this app runs specifically
  // so these two buttons have somewhere secure to work from.
  const insecureContext = !window.isSecureContext;
  const camBtn = panel.querySelector('#vid-cam-btn');
  if (camBtn) {
    if (insecureContext || !navigator.mediaDevices?.getUserMedia) {
      camBtn.disabled = true;
      camBtn.title = insecureContext
        ? `Needs a secure connection - open https://${location.hostname}:${(Number(location.port) || 8081) + 1}/ instead (self-signed, your browser will warn once)`
        : 'This browser doesn\'t support camera capture';
      camBtn.style.opacity = 0.35;
    } else camBtn.addEventListener('click', () => startBrowserCapture('cam', statusEl));
  }
  const screenBtn = panel.querySelector('#vid-screen-btn');
  if (screenBtn) {
    if (insecureContext || !navigator.mediaDevices?.getDisplayMedia) {
      screenBtn.disabled = true;
      screenBtn.title = insecureContext
        ? `Needs a secure connection - open https://${location.hostname}:${(Number(location.port) || 8081) + 1}/ instead (self-signed, your browser will warn once)`
        : 'This browser doesn\'t support screen capture';
      screenBtn.style.opacity = 0.35;
    } else screenBtn.addEventListener('click', () => startBrowserCapture('screen', statusEl));
  }
  const stopBtn = panel.querySelector('#vid-stop-btn');
  if (stopBtn) stopBtn.addEventListener('click', () => {
    stopBrowserCapture();
    send({ cmd: 'stopVideoSource' }); // immediate - see the effect-btn click handler's comment on why this can't just wait for the option change to reach ffmpegSource.js
    setEffectOption('video', 'source', 'url');
    setEffectOption('video', 'url', '');
  });

  const url = panel.querySelector('#vid-url');
  const loadBtn = panel.querySelector('#vid-load-btn');
  const submit = () => {
    if (!url) return;
    stopBrowserCapture(); // a typed URL supersedes any live camera/screen capture in progress
    setEffectOption('video', 'source', 'url');
    setEffectOption('video', 'url', url.value.trim());
  };
  if (loadBtn) loadBtn.addEventListener('click', submit);
  if (url) url.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  const bright = panel.querySelector('#vid-bright'), brightVal = panel.querySelector('#vid-bright-val');
  if (bright) bright.addEventListener('input', () => {
    if (brightVal) brightVal.textContent = bright.value + '×';
    setEffectOption('video', 'bright', Number(bright.value));
  });
  const sat = panel.querySelector('#vid-sat'), satVal = panel.querySelector('#vid-sat-val');
  if (sat) sat.addEventListener('input', () => {
    if (satVal) satVal.textContent = sat.value + '×';
    setEffectOption('video', 'sat', Number(sat.value));
  });
  const scroll = panel.querySelector('#vid-scroll'), scrollVal = panel.querySelector('#vid-scroll-val');
  if (scroll) scroll.addEventListener('input', () => {
    if (scrollVal) scrollVal.textContent = scroll.value;
    setEffectOption('video', 'scroll', Number(scroll.value));
  });

  panel.querySelectorAll('.vid-layout-btn[data-layout]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.vid-layout-btn[data-layout]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('video', 'layout', btn.dataset.layout);
    });
  });
  panel.querySelectorAll('.vid-fit-btn[data-fit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.vid-fit-btn[data-fit]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('video', 'fit', btn.dataset.fit);
    });
  });
}

function syncVideoPanel() {
  const panel = document.getElementById('panel-video');
  if (!panel) return;
  const opts = currentState.effectOptions?.video || {};

  const url = panel.querySelector('#vid-url');
  if (url && document.activeElement !== url) url.value = opts.url || '';
  const bright = panel.querySelector('#vid-bright'), brightVal = panel.querySelector('#vid-bright-val');
  if (bright && document.activeElement !== bright) { bright.value = opts.bright ?? 1; if (brightVal) brightVal.textContent = bright.value + '×'; }
  const sat = panel.querySelector('#vid-sat'), satVal = panel.querySelector('#vid-sat-val');
  if (sat && document.activeElement !== sat) { sat.value = opts.sat ?? 1; if (satVal) satVal.textContent = sat.value + '×'; }
  const scroll = panel.querySelector('#vid-scroll'), scrollVal = panel.querySelector('#vid-scroll-val');
  if (scroll && document.activeElement !== scroll) { scroll.value = opts.scroll ?? 0; if (scrollVal) scrollVal.textContent = scroll.value; }
  panel.querySelectorAll('.vid-layout-btn[data-layout]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.layout === (opts.layout || 'panorama'));
    // Panorama/perspective decode a 4-wide composite meant to wrap around
    // the cube's 4 side faces - meaningless for a live browser camera/
    // screen capture (always a single square tile, see video.js's clamp
    // and computeCaptureDims() here) AND for '2d' single-panel mode
    // (there's no "wrap around 4 faces" when only one panel is physically
    // shown - video.js clamps this server-side too, see its module
    // comment for the real report this fixed: a single panel was only
    // ever showing a cropped 1/4-width slice of the image/video).
    const needsWrap = btn.dataset.layout === 'panorama' || btn.dataset.layout === 'perspective';
    const disable = needsWrap && (opts.source === 'browser' || currentState.panelMode === '2d');
    btn.disabled = disable;
    btn.style.opacity = disable ? 0.35 : '';
  });
  panel.querySelectorAll('.vid-fit-btn[data-fit]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.fit === (opts.fit || 'stretch'));
  });

  const camBtn = panel.querySelector('#vid-cam-btn'), screenBtn = panel.querySelector('#vid-screen-btn');
  const capturing = opts.source === 'browser';
  if (camBtn && !camBtn.title.includes('support')) camBtn.classList.toggle('active', capturing && browserCaptureState?.kind === 'cam');
  if (screenBtn && !screenBtn.title.includes('support')) screenBtn.classList.toggle('active', capturing && browserCaptureState?.kind === 'screen');

  const statusEl = document.getElementById('vid-status');
  if (statusEl) statusEl.textContent = currentState.effectStatus?.video || 'No source loaded';
}

