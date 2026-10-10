// Local control + preview server - both plain HTTP (the control page) and
// WebSocket (commands + frame streaming) on the SAME port, via one
// http.Server the `ws` library attaches to. Before this, the port was
// WebSocket-only, so browsing to http://<pi>:8081/ directly (the obvious
// first thing to try) showed a bare "Upgrade Required" error - confirmed
// live by a real user hitting exactly that. Idles (no frame encoding/
// sending) until a WS client connects, then streams frames - same pattern
// as g_browserConnected/WS_EVT_CONNECT in the ESP32 firmware's
// web_server.h, deliberately kept (per this project's design discussion)
// so nobody watching means zero wasted CPU/bandwidth on preview encoding.
//
// HTTP routes:
//   GET /             -> public/index.html, the control page (effect
//                         buttons, brightness/speed, panel layout, live
//                         per-face preview canvases, Bluetooth pairing UI)
//   GET /effects.json -> {"wave":"Wave Cascade", ...} (EFFECT_NAMES) - the
//                         page fetches this once instead of hand-
//                         maintaining its own copy of the effect list
//
// Served on TWO ports: the primary one (plain HTTP, e.g. :8081) and a
// second HTTPS listener on port+1 (e.g. :8082) with a self-signed cert
// (see tls.js) - identical content/protocol on both, the ONLY reason the
// second one exists is that
// getUserMedia()/getDisplayMedia() (Video Display's webcam/screen-capture
// buttons) are unavailable to JS entirely outside a "secure context"
// (HTTPS, or literal localhost/127.0.0.1) - browser policy, not something
// this app can work around. A real report traced those two buttons
// staying permanently greyed out to exactly this. Every other feature
// works identically on either port; this is purely an additional entry
// point, not a replacement - existing http://<pi>:8081/ bookmarks keep
// working unchanged. Absent (not fatal) if openssl isn't installed.
//
// WebSocket wire protocol:
//   Text frames (JSON), client -> server, control commands:
//     {"cmd":"setEffect",    "effect":"wave"}
//       Also clears state.blank (see "clearAll" below) - selecting any
//       effect always un-blanks the display.
//     {"cmd":"clearAll"}
//       Sidebar's "✕ Clear All" button - turns every overlay off and sets
//       state.blank=true, which app.js's tick loop checks to skip the main
//       effect entirely (colBuf/wallBuf go and stay solid black) - matches
//       the browser original's clear-all-btn handler. Cleared by selecting
//       any effect again.
//     {"cmd":"setBrightness","value":0.0-1.5}
//     {"cmd":"setSpeed",     "value":0.0-8.0}
//     {"cmd":"setPanelConfig","size":8|16|64,"mode":"cube"|"2d"|"wall"}
//       Mirrors the browser's cube-size picker (8x8/16x16/64x64/2D) -
//       reused as the panel-layout config here instead of inventing a new
//       setting, since HUB75 itself can't be auto-probed for panel count
//       (write-only protocol, no return path - see project discussion).
//       All 3 sizes mean the same 6-face physical layout; "2d" means 1
//       flat panel instead. Persisted to disk (panelConfig.js) so it
//       survives a restart, and always included in the "state" message so
//       a freshly-connected remote browser's UI reflects whatever was last
//       chosen on the Pi rather than defaulting to something stale.
//     {"cmd":"addPanel"}
//       Pi-native-only addition, not in the original ESP32 app: appends a
//       panel at the first free cell of the wall grid (switching to "wall"
//       mode if not already in it) - the sidebar's "+ Add Display" button.
//     {"cmd":"removePanel","gx":0,"gy":0}
//     {"cmd":"setPanelPositions","panels":[{"gx":0,"gy":0}, ...]}
//       Drag-to-rearrange result: a full replacement layout for wall mode.
//       See panelConfig.isValidPanels()/WALL_MAX_COLS/WALL_MAX_ROWS for the
//       grid bounds (currently 2x3, matching the physical topology already
//       wired for cube mode's 3-chain x 2-panel Active-3 layout).
//     {"cmd":"setOverlay","key":"stars","enabled":true}
//       Toggles one of the 13 ported overlays on/off (see
//       effects/overlays.js's OVERLAY_KEYS/module comment - overlays are
//       GLOBAL layers, not a selectable effect, so this is a separate
//       command from setEffect/setEffectOption). `key` must be one of
//       OVERLAY_KEYS or the message is dropped, same defensive spirit as
//       setEffectOption's effect/key checks above.
//     {"cmd":"setOverlayOption","key":"stars","option":"density","value":10}
//       Sets one param on one overlay (e.g. stars' density/speed/color).
//     {"cmd":"setOverlayGlobalBright","value":0.8}
//       Sets state.overlays.globalBright (mirrors the browser's
//       ovGlobalBright slider) - a separate command rather than overloading
//       setOverlay/setOverlayOption with a magic "__global__" key, since
//       global brightness isn't a per-overlay on/off or param and doesn't
//       need `key` validated against OVERLAY_KEYS at all.
//     {"cmd":"addAlarm","alarm":{...}}                    -> broadcasts state with the new alarm appended (id assigned server-side)
//     {"cmd":"updateAlarm","id":"...","alarm":{...}}       -> replaces the stored alarm with that id (id itself is not editable)
//     {"cmd":"deleteAlarm","id":"..."}
//     {"cmd":"setAlarmEnabled","id":"...","enabled":bool}
//     {"cmd":"dismissAlarm"}                               -> clears state.activeAlarm early (Timers panel's toggle-off-while-firing behaviour)
//       Timer system - see effects/alarms.js's module comment for the full
//       data model / tick-order this composes with overlays. `alarm`
//       payloads are validated defensively (alarmConfig.isValidAlarm, plus
//       the same-spirit checks below for the nested prealarm/overlayKeys
//       fields it doesn't cover) before ever reaching alarmConfig.save() or
//       state.alarms - same defensive posture as panelConfig.isValidPanels.
//       Every one of these persists to disk (alarmConfig.save) and
//       broadcasts the new "state" message so all connected clients (and a
//       freshly-connected one) see the current list.
//     {"cmd":"setFaceEffect","face":0,"effect":"fireworks"}  -> assigns an effect to one cube face (face 0-5); effect:null or "none" clears it
//     {"cmd":"setFaceOpts","face":0,"opts":{...}}            -> replaces that face's saved sub-options (fireworks' text, rain's style, ...); face must already have an effect assigned
//     {"cmd":"setFaceOverlays","face":0,"overlayKeys":["stars","fire"]} -> per-face overlay picks (a subset of OVERLAY_KEYS), applied only to that face's LEDs when Custom Cube renders it
//     {"cmd":"saveCube","name":"My Cube"}                    -> snapshots the current per-face assignment (state.customCube.faces) into the named-configuration library; overwrites an existing entry with the same name
//     {"cmd":"loadCube","index":0}                           -> copies a library entry's faces into the live assignment
//     {"cmd":"deleteCube","index":0}
//     {"cmd":"clearFaces"}                                   -> blanks all 6 faces (does not touch the library)
//       Custom Cube - lets each of the 6 cube faces run a different effect
//       simultaneously, with a saved-configuration library. See
//       effects/customCube.js's module comment for the per-face composition
//       mechanism and customCubeConfig.js for the persisted shape (unifying
//       the browser's separate draft-editor/active-effect state into one
//       `faces` array - see that file's module comment for why). Every
//       command here is validated defensively (face 0-5, effect must be a
//       real EFFECTS key or null/'none', overlayKeys must be a subset of
//       OVERLAY_KEYS) before ever reaching customCubeConfig.save() or
//       state.customCube - same defensive posture as alarmConfig/panelConfig.
//     {"cmd":"btScan"}                                    -> {"cmd":"btScanResult","devices":[{"mac":"..","name":".."}]}
//     {"cmd":"btPair","mac":"AA:BB:CC:DD:EE:FF"}           -> {"cmd":"btPairResult","ok":bool,"log":".."}
//     {"cmd":"btStatus"}                                   -> {"cmd":"btStatusResult","devices":[..]}
//     {"cmd":"btDiscoverable"}                             -> {"cmd":"btDiscoverableResult","ok":bool,"log":".."}
//     {"cmd":"btRoutePhoneAudio"}                          -> {"cmd":"btRoutePhoneAudioResult","ok":bool,"log":[..]}
//       Ported from pi/bluetooth_server.py (a separate Python HTTP service
//       for the browser-based deployment) - see src/bluetooth.js. Wired
//       into this same control channel instead of a second service/port,
//       since this project already has one. Bluetooth operations reply
//       ONLY to the requesting client (request/response, not broadcast
//       state) since a scan/status result is specific to that request, not
//       shared app state every client should see.
//     {"cmd":"setUnsplashConfig","apiKey":"...","query":"nature"}
//       Persists the Unsplash Access Key + default search query to disk
//       (unsplashConfig.js) and broadcasts state.unsplashConfig to every
//       connected client - see effects/unsplash.js's module comment.
//     {"cmd":"radioPlay","station":{"name":"..","genre":"..","url":".."}}
//       Selects/plays an Internet Radio station - either one of the
//       featured RADIO_STATIONS or a directory search result, same shape
//       either way (see effects/radio/radio.js's playStation()). Unlike
//       setEffectOption (a plain value store), this is a dedicated command
//       because it triggers a real side effect (spawns ffmpeg) - same
//       "dedicated command for a one-shot action with a result" reasoning
//       as the Bluetooth commands above, not the generic option-store
//       pattern. Broadcasts state (station/playing show up in
//       effectStatus.radio for every connected client, not just the
//       requester - unlike Bluetooth, "what's playing" is shared state).
//     {"cmd":"radioStop"}
//       Stops playback (tears down the ffmpeg/paplay pipeline on the next
//       tick's ensure() call). Broadcasts state.
//     {"cmd":"stopVideoSource"}
//       Immediately tears down Video Display's ffmpeg decode (both cube
//       and wall instances) and any live browser camera/screen capture,
//       regardless of which effect is currently selected - see video.js's/
//       videoWall.js's exported stop() and browserFrameSource.js's clear().
//       Needed because the tick loop only ever runs the CURRENTLY
//       SELECTED effect's function, so switching away from Video Display
//       to something else means effectVideo()/effectVideoWall() simply
//       stop being called - a plain setEffectOption('video','url','')
//       wouldn't reach ffmpegSource.js's teardown at all in that case
//       (only ensure()'s own idle timeout would, eventually). public/
//       app.js sends this the moment the user clicks away from Video
//       Display to any other effect (a real report traced a persistent
//       flicker between video content and the new effect to this gap) and
//       from the panel's own Stop button. No state broadcast - purely a
//       server-side cleanup action.
//     {"cmd":"radioSearch","query":"jazz"}
//       Searches the radio-browser.info directory (empty/omitted query =
//       "top clicked" browse list). Async + fire-and-forget from this
//       handler's perspective - results land in effectStatus.radio.search
//       on the next tick's state broadcast, not a direct reply, since
//       "what did the last search return" is meaningful shared UI state
//       (unlike Bluetooth's per-request scan results) that a second
//       connected client should also see.
//   Text frames, server -> client, on connect and on every change:
//     {"cmd":"state","effect":"wave","brightness":1,"speed":1,"panelSize":64,"panelMode":"cube"}
//   Binary frames, server -> client, one per face per tick, only while
//   >=1 client is connected (only face 0 when panelMode is "2d" - 1 panel,
//   nothing else to stream):
//     [faceId(1 byte)][R,G,B * SIZE*SIZE bytes, row-major, faceMap order]
//   This is a new, simpler protocol - not required to bit-match the
//   ESP32's PKT_VIDEO framing, since direction/purpose differ (Pi -> any
//   preview client, vs. today's browser -> ESP32) and no existing consumer
//   code depends on the ESP32's exact framing.
//   Binary frames, CLIENT -> server - live webcam/screen-share capture for
//   Video Display's browser source (see effects/video/browserFrameSource.js's
//   module comment for why this exists: a headless Pi has no camera of its
//   own, but a connected browser tab does). public/app.js's
//   startBrowserCapture() sends one of these per captured frame, at
//   whatever fps its capture interval runs (see that function):
//     [type(1 byte, always 1)][width(uint16 LE)][height(uint16 LE)]
//     [kind(1 byte: 0='cam', 1='screen')][R,G,B * width*height bytes, row-major]
//   Routed by _handleBinaryFrame() straight into browserFrameSource's
//   shared singleton - effects/video.js and videoWall.js read from it via
//   the same getFrame(w,h)-exact-dims-match contract FfmpegSource uses, so
//   they don't need to know or care which source produced a frame.
const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const { ensureSelfSignedCert } = require('./tls');
const youtube = require('./youtube');
const autoShow = require('./autoShow');
const access = require('./access');
const autoBackup = require('./autoBackup');
const fs = require('fs');
const path = require('path');
const { EFFECTS, EFFECT_NAMES, WALL_EFFECTS } = require('./effects');
const { OVERLAY_KEYS } = require('./effects/overlays');
const panelConfig = require('./panelConfig');
const alarmConfig = require('./alarmConfig');
const customCubeConfig = require('./customCubeConfig');
const wallLayoutConfig = require('./wallLayoutConfig');
const unsplashConfig = require('./unsplashConfig');
const nasaConfig = require('./nasaConfig');
const weatherConfig = require('./weatherConfig');
const bluetooth = require('./bluetooth');
const alarmsEngine = require('./effects/alarms');
const radio = require('./effects/radio');
const { spawn } = require('child_process');
const { browserFrameSource } = require('./effects/video/browserFrameSource');
const crypto = require('crypto');
const { COMMANDS } = require('./wsCommands');
const aiConfig = require('./aiConfig');
const httpApi = require('./httpApi');
const pinConfig = require('./pinConfig');
const { createUpdater } = require('./selfUpdate');

const PREVIEW_FPS = 20; // matches the ESP32 firmware's streamFrameToCube() throttle
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const INDEX_HTML = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'));   // read once at startup, not per-request
const THREE_JS = fs.readFileSync(path.join(PUBLIC_DIR, 'three.min.js'));   // served for the sidebar/3D-preview page's <script src>, same pattern as INDEX_HTML
const APP_JS = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'));
// Live effect-tile animations (built by sim/thumbs.js at release time).
let THUMBS_JSON = null;
try { THUMBS_JSON = fs.readFileSync(path.join(PUBLIC_DIR, 'thumbs.json')); } catch (e) { /* tiles fall back to plain buttons */ }           // wires the copied sidebar markup to pi-native's WS protocol

// Local-file upload for Video Display, restoring the browser original's
// "pick a file from your computer/phone" flow that a headless Pi has no
// direct equivalent for (see video.js's module comment - this port had
// scoped that down to URL-only, ffmpeg-decoded playback). ffmpeg reads a
// local filesystem path exactly the same way it reads a URL (video.js's
// FfmpegSource just passes whatever string effectOptions.video.url holds
// straight to `ffmpeg -i`), so the fix is entirely upload-plumbing: the
// browser POSTs the raw file bytes here, we save it to disk, and the
// client then does the exact same setEffectOption('video','url',<path>)
// it already does for a typed URL.
// No multipart/form-data parsing (would need a new npm dependency) - the
// client sends the raw File object as the POST body via fetch(), which
// streams the exact bytes with no multipart boilerplate; the filename
// travels via a query param instead of a form field.
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
// Largest legitimate WebSocket message is a browser-captured video frame
// (at most WALL_MAX_PANELS 64x64 RGB panels, well under 1MB); the ws
// default of 100MB would let any client make the Pi buffer a huge message.
const WS_MAX_PAYLOAD = 8 * 1024 * 1024;

// Cross-site request protection. The control server listens on every
// interface with no login, so without this ANY web page open in a browser
// on the same network could open a WebSocket to the Pi (or POST an upload)
// and drive it - browsers don't apply same-origin rules to WebSocket
// connections or simple form POSTs, they only report the Origin. Requests
// with no Origin header (curl, scripts, non-browser tools) are allowed:
// they aren't the cross-site-page threat this guards against.
function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (e) {
    return false;
  }
}

const UPLOAD_MAX_BYTES = 500 * 1024 * 1024; // 500MB - generous for a phone-shot video, still bounded so a bad/huge upload can't fill the Pi's disk
// Only one upload lives on disk at a time - each new upload deletes
// whatever the previous one saved first, same "personal-use, don't grow
// unbounded" policy as unsplashConfig's single-entry persistence.
function clearUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) return;
  for (const f of fs.readdirSync(UPLOAD_DIR)) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, f)); } catch (e) { /* ignore - best-effort cleanup */ }
  }
}
// Strips path separators and any leading dots so the saved filename can
// never escape UPLOAD_DIR (e.g. a crafted "../../etc/passwd" name) and
// can't be hidden/dotfile-prefixed; a short random prefix keeps repeated
// uploads of the same filename from colliding while the (single-file)
// directory is mid-clear.
function sanitizeUploadName(raw) {
  const base = String(raw || 'video').replace(/[\\/]/g, '_').replace(/^\.+/, '') || 'video';
  return crypto.randomBytes(4).toString('hex') + '_' + base.slice(-120);
}

// Preview frames are skipped for a page that already has about two frames
// still waiting to go out. Without this a slow phone's queue grew without
// limit: the preview fell further and further behind (looked frozen) and
// the synced audio sharing the connection was cut off (a real report).
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function isWellFormed(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return false;
  if (typeof msg.cmd !== 'string' || !/^[A-Za-z]{1,40}$/.test(msg.cmd)) return false;
  return !Object.keys(msg).some((k) => BAD_KEYS.has(k));
}

function previewHasRoom(client, frameBytes) {
  return (client.bufferedAmount || 0) < Math.max(64 * 1024, frameBytes * 2);
}

class WsServer {
  // state: shared mutable {effect, brightness, speed}.
  // config: shared mutable {size, mode} (panelConfig.js shape) - already
  // loaded from disk by app.js before this is constructed.
  // onConfigChange(config): called after a validated setPanelConfig command
  // is applied and persisted, so app.js can rebuild the CubeCore/driver
  // (which this module has no reference to and shouldn't own).
  // effectCommandRelay(cmd, payload): optional (RENDER_WORKER=1 only - see
  // renderWorker.js's module comment). A real report: enabling the render-
  // loop worker thread silently broke radio (and would have broken video
  // stop too) - Node gives each worker_threads Worker its own completely
  // separate module require() cache, so the copy of effects/radio/radio.js
  // this file calls playStation()/stopStation()/search() on directly
  // (below) is a DIFFERENT object instance from the one the worker's own
  // tick() loop actually renders from - a station picked here never
  // reached the instance that mattered. When set, radioPlay/radioStop/
  // radioSearch/the video-stop handler relay through this instead of
  // calling the effect module directly, so the mutation lands on the
  // SAME instance tick() uses. Left null for the normal (no worker)
  // single-threaded path, where calling the module directly is correct
  // and unchanged.
  constructor(port, state, config, onConfigChange, effectCommandRelay = null) {
    this.state = state;
    this.updater = createUpdater(); // Setup -> Update (see selfUpdate.js)
    this.config = config;
    this.onConfigChange = onConfigChange;
    this.effectCommandRelay = effectCommandRelay;
    this._lastFrameMs = 0;
    this._playlistSince = Date.now();
    setInterval(() => this._playlistTick(), 5000).unref();
    // Weekly settings backup (see src/autoBackup.js): at start-up, then hourly.
    this.state.backup = autoBackup.maybeBackup();
    setInterval(() => { const before = JSON.stringify(this.state.backup); this.state.backup = autoBackup.maybeBackup(); if (JSON.stringify(this.state.backup) !== before) this._broadcast(this._stateMsg()); }, 3600000).unref();

    // One HTTP server handles both the control page (GET /, GET
    // /effects.json) and the WebSocket upgrade, on the same port - so
    // http://<pi>:8081/ actually shows something instead of the "Upgrade
    // Required" error a bare WebSocket-only server gives a normal browser
    // GET request (see project discussion - this is exactly the confusion
    // that prompted building this page in the first place).
    this.http = http.createServer((req, res) => this._handleHttp(req, res));
    this.wss = new WebSocket.Server({ server: this.http, maxPayload: WS_MAX_PAYLOAD, verifyClient: ({ req }) => isSameOrigin(req) });

    // Tracks EVERY connected client across both the plain-HTTP and (if
    // available) HTTPS listeners as one set, so broadcast/preview-
    // streaming code doesn't need to know or care which transport any
    // given client came in on - see _wireConnection() below.
    this._clients = new Set();
    this.pinCfg = pinConfig.load();
    this._wireConnection(this.wss);

    this.http.listen(port);

    // Second listener, on port+1, serving the exact same content/protocol
    // over TLS with a self-signed cert (see tls.js's module comment) -
    // ONLY reason this exists is that getUserMedia()/getDisplayMedia()
    // (Video Display's webcam/screen-capture buttons) are unavailable to
    // JS entirely on a plain-HTTP, non-localhost origin ("secure context"
    // browser policy, not something this app can work around) - a real
    // report traced those buttons staying permanently greyed out to
    // exactly this. Regular usage (every other feature) is entirely
    // unaffected and keeps working over the existing plain-HTTP port with
    // no changes - this is purely an ADDITIONAL entry point for whoever
    // wants to use the camera/screen-capture feature specifically, not a
    // replacement. Self-signed means a one-time "not secure" browser
    // warning to click through per device/browser; unavoidable without a
    // real CA-issued cert, impractical for a device with no public DNS
    // name. Gracefully absent (not fatal) if openssl isn't installed or
    // cert generation fails for any reason - see tls.js.
    const tlsFiles = ensureSelfSignedCert();
    if (tlsFiles) {
      // HTTPS_PORT (environment) picks the secure port(s), e.g. "443" for a
      // plain https://name address, or "8082,443" for both. Default: port+1.
      const ports = String(process.env.HTTPS_PORT || port + 1).split(',').map((p) => parseInt(p, 10)).filter((p) => p > 0 && p < 65536);
      this.httpsServers = ports.map((p) => {
        const srv = https.createServer(tlsFiles, (req, res) => this._handleHttp(req, res));
        this._wireConnection(new WebSocket.Server({ server: srv, maxPayload: WS_MAX_PAYLOAD, verifyClient: ({ req }) => isSameOrigin(req) }));
        srv.on('error', (e) => console.warn(`[app] HTTPS on :${p} failed: ${e.message}`));
        srv.listen(p);
        console.log(`[app] HTTPS control page (needed for camera/screen capture) on :${p}`);
        return srv;
      });
      this.https = this.httpsServers[0] || null;
    } else {
      this.https = null;
    }
  }

  _wireConnection(wss) {
    wss.on('connection', (ws, req) => {
      console.log('[WS] client connected');
      // With a control PIN set, the socket only joins _clients (and so only
      // receives state/preview and may send commands) after sending it -
      // see _handleAuth() - unless src/access.js lets it in as a home-network
      // admin or an internet guest.
      const role = access.decide({ pinSet: pinConfig.isPinSet(this.pinCfg), remote: access.isRemote(req), access: (this.state.prefs || {}).access });
      if (role === 'auth') {
        ws.send(JSON.stringify({ cmd: 'authRequired' }));
      } else {
        ws.role = role;
        this._clients.add(ws);
        ws.send(JSON.stringify(this._stateMsg()));
        if (role === 'guest') ws.send(JSON.stringify({ cmd: 'role', role })); // admin is the page's default
      }
      ws.on('message', (data, isBinary) => this._handleMessage(ws, data, isBinary));
      ws.on('close', () => { this._clients.delete(ws); console.log('[WS] client disconnected'); });
      ws.on('error', (err) => console.warn('[WS] client error:', err.message));
    });
  }

  // Synced phone playback: the PCM the Pi is sending to its speaker, for
  // pages that asked for it (cmd audioSub), stamped with the Pi time the
  // speaker plays it. Packet: 'MDAUDIO1', float64 time (ms), then 16-bit
  // stereo at 22050 Hz (every other frame of the 44.1 kHz decode).
  sendAudio(chunk, playAtMs) {
    let any = false;
    for (const c of this._clients) if (c._audio && c.readyState === WebSocket.OPEN) { any = true; break; }
    if (!any) return;
    const frames = Math.floor(chunk.length / 4), out = Buffer.allocUnsafe(16 + Math.ceil(frames / 2) * 4);
    out.write('MDAUDIO1', 0, 'ascii'); out.writeDoubleLE(playAtMs, 8);
    let o = 16;
    for (let f = 0; f < frames; f += 2) { chunk.copy(out, o, f * 4, f * 4 + 4); o += 4; }
    const pkt = out.subarray(0, o);
    for (const c of this._clients) {
      // A phone that can't keep up is skipped rather than buffered for ever.
      if (c._audio && c.readyState === WebSocket.OPEN && c.bufferedAmount < 512 * 1024) c.send(pkt);
    }
  }

  _handleHttp(req, res) {
    const authCode = (r) => (!isSameOrigin(r) ? 403
      : access.decide({ pinSet: pinConfig.isPinSet(this.pinCfg), remote: access.isRemote(r), access: (this.state.prefs || {}).access }) === 'admin' ? 0
      : !pinConfig.verifyPin(this.pinCfg, r.headers['x-control-pin']) ? 401 : 0);
    if (httpApi.handle(this, req, res, authCode)) return;
    if (req.method === 'POST' && req.url.startsWith('/api/uploadVideo')) {
      if (!isSameOrigin(req)) { res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Cross-origin upload refused'); return; }
      if (!pinConfig.verifyPin(this.pinCfg, req.headers['x-control-pin'])) { res.writeHead(401, { 'Content-Type': 'text/plain' }).end('Control PIN required'); return; }
      this._handleUpload(req, res);
      return;
    }
    if (req.method !== 'GET') { res.writeHead(404).end(); return; }
    // No-cache on every response this route serves - a real report ("click
    // a button, nothing happens until I refresh the page") pointed at
    // exactly this gap: none of these responses ever sent a Cache-Control
    // header at all, so it was entirely up to browser heuristics whether a
    // stale cached app.js (missing whatever click-handler fix had just
    // shipped) got reused instead of fetching the current one - and
    // heuristic caching can persist across an ordinary refresh, not just
    // repeat visits. `no-store` is the strongest guarantee available (never
    // cache, always refetch) - appropriate here since this whole app is
    // versioned by "pull the latest code and restart the service", not by
    // any cache-busting query param scheme, so there's no mechanism for a
    // stale cached copy to ever self-correct without this.
    const noCacheHeaders = { 'Cache-Control': 'no-store, must-revalidate' };
    // Strip the query string before route-matching - index.html's
    // <script src="app.js?v=..."> cache-buster (see that file's own
    // comment on the tag) means req.url arrives as "/app.js?v=0.6.54", not
    // "/app.js". A real report: every request for app.js 404'd once that
    // ?v= param was added, because this matching used to compare the raw
    // req.url (with the query string still attached) against the bare
    // path - since every release bumps the version number, this would have
    // 404'd on literally every real deployment, not just an edge case.
    const urlPath = req.url.split('?')[0];
    if (urlPath === '/api/debugTone') { this._handleDebugTone(req, res); return; }
    if (urlPath === '/' || urlPath === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html', ...noCacheHeaders });
      res.end(INDEX_HTML);
    } else if (urlPath === '/effects.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...noCacheHeaders });
      res.end(JSON.stringify(EFFECT_NAMES));
    } else if (urlPath === '/three.min.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript', ...noCacheHeaders });
      res.end(THREE_JS);
    } else if (urlPath === '/thumbs.json' && THUMBS_JSON) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }); // revalidate: the page asks with ?v=<version>
      res.end(THUMBS_JSON);
    } else if (urlPath === '/app.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript', ...noCacheHeaders });
      res.end(APP_JS);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }

  // GET /api/debugTone?kind=sweep|drum|tone[&freq=N] - lets the BROWSER hear the same
  // debug test tones the Pi-side spectrum pipeline plays (see radio.js's
  // DEBUG_TONES/playDebugTone()). A real report: "can the browser play the
  // sound" - the "Play in this browser" checkbox only works for real
  // stations (it points a client-side <audio> element at the station's own
  // HTTP URL); debug tones use an internal `debug:<lavfi spec>` scheme with
  // no real URL for a browser to fetch. This route bridges that gap:
  // spawn a SEPARATE, short-lived ffmpeg (independent of the Pi-side
  // RadioAudio decode/playback pipeline - this is purely for the browser's
  // own <audio> element, doesn't touch paplay/Bluetooth at all) that
  // renders the exact same lavfi expression to a WAV stream and pipes it
  // straight through as the HTTP response body.
  _handleDebugTone(req, res) {
    let kind, freqParam;
    try {
      const q = new URL(req.url, 'http://x').searchParams;
      kind = q.get('kind');
      freqParam = q.get('freq');
    } catch (e) { /* kind/freqParam stay undefined */ }
    // 'tone' (the frequency slider) is built on the fly, same as
    // radio.playDebugTone() does for the Pi-side pipeline - not a fixed
    // DEBUG_TONES entry, since the frequency is chosen by the user.
    let lavfiSpec;
    if (kind === 'tone') {
      const f = Math.max(40, Math.min(7000, Math.round(Number(freqParam)) || 440));
      lavfiSpec = 'aevalsrc=sin(2*PI*' + f + '*t):s=44100:d=30';
    } else {
      const tone = radio.DEBUG_TONES[kind];
      if (!tone) { res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Unknown debug tone'); return; }
      // 'debugloop:' (the sweep) vs 'debug:' (drum) - see radio.js's
      // DEBUG_TONES/ffmpegAudio.js's ensure() for why the prefix differs.
      lavfiSpec = tone.url.slice(tone.url.startsWith('debugloop:') ? 'debugloop:'.length : 'debug:'.length);
    }

    let proc;
    try {
      proc = spawn('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', lavfiSpec, '-f', 'wav', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' }).end('ffmpeg spawn failed: ' + err.message);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' });
    proc.stdout.pipe(res);
    // A browser navigating away/pausing mid-stream aborts the request - kill
    // the now-pointless ffmpeg process rather than leaving it to finish
    // rendering a WAV nobody will read (same "don't leak background
    // processes" concern as radio.js's stopStation() fix elsewhere).
    req.on('close', () => { try { proc.kill('SIGKILL'); } catch (e) { /* already dead */ } });
    proc.on('error', () => { try { res.destroy(); } catch (e) { /* already closed */ } });
  }

  // POST /api/uploadVideo?name=<original filename> - raw file bytes as the
  // whole request body (see the UPLOAD_DIR block above for why this isn't
  // multipart/form-data). Responds {ok:true,path:"<absolute path>"} for
  // effects/video.js's FfmpegSource (via setEffectOption('video','url',...))
  // to decode exactly like a typed URL, or {ok:false,error:"..."} - a
  // malformed/oversized/failed upload never crashes the server, matching
  // every other request-handler's defensiveness in this file.
  _handleUpload(req, res) {
    let name = 'video';
    try { name = new URL(req.url, 'http://x').searchParams.get('name') || 'video'; } catch (e) { /* keep default */ }

    // mkdirSync/clearUploadDir are synchronous fs calls that can throw for
    // reasons entirely outside this code's control (e.g. the service
    // user lacking write permission on UPLOAD_DIR's parent - a real
    // deployment hit exactly this: EACCES on mkdir). Before the
    // process-wide uncaughtException handler in app.js was added, an
    // uncaught throw here crashed the whole server; even with that safety
    // net in place, an uncaught throw HERE specifically happens before any
    // response is ever sent, so the request just hangs until the browser's
    // fetch() itself times out ("Failed to fetch") - a real, confusing
    // symptom to debug blind on a headless Pi with no stack trace visible
    // client-side. Catching it here turns that into an immediate, clear
    // {ok:false,error:...} response instead.
    try {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      clearUploadDir(); // drop any previous upload (and stale .part leftovers) before starting the new one
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `Could not prepare the upload directory (${e.code || e.message}) - check that the multidisplay-pi service's user can write to ${UPLOAD_DIR}` }));
      return;
    }

    let total = 0;
    // Guards every response path below, not just the size-limit one this
    // used to be scoped to - a real crash was traced to this gap: mobile
    // browsers commonly tear down the underlying TCP connection slightly
    // AFTER fetch() has already resolved (backgrounding the tab, a network
    // handoff, etc.), which fires a late req 'error'/'aborted' event after
    // out.on('finish') had already sent the success response. Calling
    // res.end() a second time throws "write after end", and since nothing
    // in app.js installs a process-wide uncaughtException handler, that
    // crashed the whole Node process - systemd's Restart=on-failure then
    // restarted it a few seconds later with fresh in-memory state (state.
    // effect isn't persisted to disk the way alarms/customCube/panelConfig
    // are), which is exactly the "pauses, then reverts to the default
    // effect" symptom that was reported. `responded` makes every one of
    // fail()/the finish handler a no-op once any one of them has already
    // sent a response, and res.end() itself is wrapped in try/catch as a
    // second line of defense in case the socket is already gone by then.
    let responded = false;
    const destName = sanitizeUploadName(name);
    const destPath = path.join(UPLOAD_DIR, destName);
    const tmpPath = destPath + '.part';
    const out = fs.createWriteStream(tmpPath);
    const startedAt = Date.now();
    console.log(`[upload] start "${name}" -> ${destPath}`);

    const safeEnd = (code, body) => {
      if (responded) return;
      responded = true;
      console.log(`[upload] "${name}" responding ${code} after ${Date.now() - startedAt}ms, ${total} bytes received: ${JSON.stringify(body)}`);
      try {
        if (!res.headersSent) res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      } catch (e) { console.warn(`[upload] "${name}" res.end() itself threw (socket likely already gone):`, e.message); }
    };

    const fail = (code, message) => {
      if (responded) return;
      req.unpipe(out);
      out.destroy();
      fs.unlink(tmpPath, () => {});
      safeEnd(code, { ok: false, error: message });
    };

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > UPLOAD_MAX_BYTES) fail(413, `File too large (max ${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)}MB)`);
    });
    req.on('error', (err) => { console.warn(`[upload] "${name}" req error after ${total} bytes:`, err.code || err.message); fail(500, err.message); });
    out.on('error', (err) => { console.warn(`[upload] "${name}" write-stream error after ${total} bytes:`, err.code || err.message); fail(500, err.message); });
    // 'close' fires on ANY end of the request - a clean finish, an 'error',
    // or (the case none of the above events catch) the client/network
    // abruptly severing the connection with neither an 'end' nor an
    // 'error' ever firing on `req` itself. Logging here regardless of
    // whether we've already responded is the one thing that can tell a
    // genuine network-level drop (logged bytes stop well short of the
    // real file size, no error event, no response ever sent) apart from
    // a normal completed request - added specifically to get hard
    // evidence for a real report ("net::ERR_CONNECTION_RESET" client-side,
    // consistently, on real hardware over WiFi) rather than guessing.
    req.on('close', () => {
      console.log(`[upload] "${name}" req closed after ${Date.now() - startedAt}ms, ${total} bytes received, responded=${responded}`);
    });

    req.pipe(out);
    out.on('finish', () => {
      if (responded) return; // already failed (e.g. size limit hit right as the stream finished)
      try {
        fs.renameSync(tmpPath, destPath);
      } catch (e) {
        fail(500, `Could not finalize the upload (${e.code || e.message})`);
        return;
      }
      safeEnd(200, { ok: true, path: destPath });
    });
  }

  // Client -> server binary frame (see the module comment's wire-format
  // block above) - one captured webcam/screen-share frame from
  // startBrowserCapture(). Deliberately silent/defensive on any malformed
  // input (too-short buffer, a width/height that doesn't match the actual
  // payload length) rather than throwing - a single dropped video frame
  // is a total non-event (the next one arrives ~100ms later), so there's
  // nothing worth logging or erroring over, same "just drop it" spirit as
  // this file's other malformed-payload handling (setOverlay with an
  // unknown key, etc).
  _handleBinaryFrame(data) {
    if (!Buffer.isBuffer(data) || data.length < 5) return;
    if (data[0] !== 1) return; // only one binary frame type exists so far
    const w = data.readUInt16LE(1), h = data.readUInt16LE(3);
    const kind = data[5] === 1 ? 'screen' : 'cam';
    const payload = data.subarray(6);
    if (w <= 0 || h <= 0 || payload.length !== w * h * 3) return;
    // See the constructor's effectCommandRelay comment - browserFrameSource
    // is ANOTHER module-singleton the render-worker thread (RENDER_WORKER=1)
    // would otherwise have its own separate, never-updated copy of, same
    // class of bug as radio - a webcam/screen-share frame arriving here
    // would never reach the copy tick()'s video effect actually reads from.
    if (this.effectCommandRelay) this.effectCommandRelay('videoFrame', { payload, w, h, kind });
    else browserFrameSource.setFrame(payload, w, h, kind);
  }

  // Playlist: every N minutes, move on to the next favourite. Waits while
  // the display is off or a timer is running.
  // Every 5 s: celebrations, then weather, then the (day-plan) playlist -
  // see src/autoShow.js for the rules.
  _playlistTick() {
    const p = this.state.prefs;
    if (!p || this.state.activeAlarm) return;
    const now = require('./localTime').wallClock(p.tz); // the user's local time
    const st = this.state.autoStatus || (this.state.autoStatus = {});
    // The Pi's view of the time, shown under Timers so a wrong clock or zone is easy to spot.
    const clock = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    if (st.clock !== clock) { st.clock = clock; st.tz = p.tz || 'Pi clock'; this._broadcast(this._stateMsg()); }
    const show = (effect) => {
      if (!EFFECTS[effect] || this.state.effect === effect) return false;
      this.state.effect = effect; this.state.blank = false; this._playlistSince = Date.now();
      return true;
    };
    // 0. Party mode: a lively effect every 90 s (fireworks with the message
    // first and every other turn), music reaction on; back to before at the end.
    if (this.state.party) {
      const party = this.state.party;
      if (Date.now() >= party.endsAt) {
        const b = this._beforeParty || {}; this.state.party = null; this._beforeParty = null;
        if (this.state.effectOptions.fireworks) this.state.effectOptions = { ...this.state.effectOptions, fireworks: { ...this.state.effectOptions.fireworks, partySfx: false } };
        if (b.effect) show(b.effect); this.state.blank = !!b.blank; if (b.musicReact) this.state.musicReact = b.musicReact;
        this._broadcast(this._stateMsg());
        return;
      }
      if (Date.now() - (this._partyAt || 0) > 90000) {
        this._partyAt = Date.now(); party.step++;
        const lively = ['sphere', 'warp', 'lightning', 'lava_lamp', 'dna', 'random80s'];
        const next = party.step % 2 === 0 ? 'fireworks' : lively[(party.step >> 1) % lively.length];
        if (next === 'fireworks') this.state.effectOptions = { ...this.state.effectOptions, fireworks: { ...(this.state.effectOptions.fireworks || {}), textOn: !!party.text, text: party.text, finaleToken: Date.now(), partySfx: true } };
        this.state.musicReact = { ...(this.state.musicReact || {}), on: true, amount: Math.max(0.7, (this.state.musicReact && this.state.musicReact.amount) || 0) };
        show(next); this.state.blank = false;
        this._broadcast(this._stateMsg());
      }
      return;
    }
    // 1. Celebrations.
    const cel = autoShow.celebrationAt(p.celebrations, now);
    if (cel && this._celebrationKey !== cel.key) {
      this._celebrationKey = cel.key;
      this._beforeCelebration = { effect: this.state.effect, blank: !!this.state.blank };
      const fw = { ...(this.state.effectOptions.fireworks || {}), textOn: !!cel.text, text: cel.text, finaleToken: Date.now() };
      this.state.effectOptions = { ...this.state.effectOptions, fireworks: fw };
      show('fireworks'); this.state.blank = false;
      st.celebration = cel.text || 'Fireworks';
      this._broadcast(this._stateMsg());
      return;
    }
    if (cel) return; // keep the celebration on screen
    if (this._beforeCelebration) {
      const b = this._beforeCelebration; this._beforeCelebration = null; st.celebration = '';
      if (this.state.effect === 'fireworks') { show(b.effect); this.state.blank = b.blank; this._broadcast(this._stateMsg()); }
      return;
    }
    if (this.state.blank) return;
    // 2. Match the weather (refreshed every 15 minutes).
    if (p.weatherMode && p.weatherMode.on) {
      const city = (weatherConfig.load() || {}).city;
      if (city && !this._wxBusy && Date.now() - (this._wxAt || 0) > 15 * 60000) {
        this._wxBusy = true; this._wxAt = Date.now();
        autoShow.fetchWeatherCode(city).then((w) => { this._wx = w; st.weather = { place: w.place, words: autoShow.WEATHER_WORDS(w.code), effect: autoShow.effectForWeather(w.code, !w.isDay), error: '' }; })
          .catch((e) => { st.weather = { error: e.message }; })
          .finally(() => { this._wxBusy = false; this._broadcast(this._stateMsg()); });
      }
      if (!city) st.weather = { error: 'Set your town in the Weather effect first' };
      // Switch only when the weather's effect changes, so something picked
      // by hand stays until the weather turns (it used to be forced back
      // every 5 s - a real report: the spectrum switched itself off).
      const wxEffect = this._wx ? autoShow.effectForWeather(this._wx.code, !this._wx.isDay) : null;
      if (wxEffect && wxEffect !== this._wxShown) { this._wxShown = wxEffect; if (show(wxEffect)) this._broadcast(this._stateMsg()); }
      return;
    }
    this._wxShown = null;
    // 3. Playlist, using the current part of the day's effects when the day plan is on.
    let list = p.favourites;
    if (p.dayPlan && p.dayPlan.on) {
      const part = autoShow.partAt(p.dayPlan.starts, now);
      const partChanged = part !== st.part;
      if (partChanged) {
        st.part = part; this._playlistSince = 0;
        // Each part of the day can set its own brightness as it begins.
        const b = p.dayPlan.brightness && p.dayPlan.brightness[part];
        if (b !== null && b !== undefined) { this.state.brightness = b; this._broadcast(this._stateMsg()); }
      }
      const own = (p.dayPlan.effects[part] || []).filter((k) => EFFECTS[k]);
      if (own.length) list = own;
      // A new part of the day starts on its own effects; within it, an effect
      // picked by hand stays (the playlist moves on after its usual minutes).
      if (partChanged && own.length && !own.includes(this.state.effect)) { if (show(own[0])) this._broadcast(this._stateMsg()); return; }
    } else st.part = '';
    if (!p.playlist || !p.playlist.on) return;
    const favs = list.filter((k) => EFFECTS[k]);
    if (favs.length < 2 || Date.now() - this._playlistSince < p.playlist.minutes * 60000) return;
    if (show(favs[(favs.indexOf(this.state.effect) + 1) % favs.length])) this._broadcast(this._stateMsg());
  }

  _stateMsg() {
    return {
      cmd: 'state',
      effect: this.state.effect, brightness: this.state.brightness, speed: this.state.speed,
      controlPinSet: pinConfig.isPinSet(this.pinCfg),
      blank: !!this.state.blank,
      panelsOff: !!this.state.panelsOff,
      autoStatus: this.state.autoStatus || {},
      backup: this.state.backup || null,
      update: this.updater ? { ...this.updater.status } : null,
      party: this.state.party ? { endsAt: this.state.party.endsAt, text: this.state.party.text } : null,
      musicReact: this.state.musicReact || { on: false, amount: 0.6 },
      scenes: (this.state.scenes || []).map((sc) => ({ name: sc.name, effect: sc.effect })),
      panelSize: this.config.size, panelMode: this.config.mode, panels: this.config.panels,
      effectOptions: this.state.effectOptions, effectStatus: this.state.effectStatus,
      overlays: this.state.overlays,
      alarms: this.state.alarms, activeAlarm: this.state.activeAlarm,
      customCube: this.state.customCube,
      unsplashConfig: this.state.unsplashConfig,
      nasaConfig: this.state.nasaConfig,
      identifyPanels: !!this.state.identifyPanels,
      wallLayouts: this.state.wallLayouts || [],
      ai: aiConfig.publicView(),
      prefs: this.state.prefs,
      photos: httpApi.listPhotos(),
      yt: { ...(this.state.yt || {}), signedIn: youtube.signedIn() },
      notifyToken: httpApi.notifyToken(),
      notice: this.state.notice && this.state.notice.until > Date.now() ? this.state.notice : null,
    };
  }

  // Defensive shape-check for an incoming alarm payload beyond what
  // alarmConfig.isValidAlarm covers (id/hour/minute/repeat/days/
  // triggerType/overlayKeys) - the nested prealarm object's fields are
  // never trusted as anything but plain values by effects/alarms.js
  // (it reads them with `|| default` throughout), so this only rejects
  // structurally wrong payloads, same "each reads its own params
  // defensively" spirit as setEffectOption/setOverlayOption.
  _sanitizeAlarm(raw, id) {
    if (!raw || typeof raw !== 'object') return null;
    const al = {
      id,
      name: typeof raw.name === 'string' ? raw.name.slice(0, 60) : '',
      kind: ['wake', 'start', 'winddown', 'off'].includes(raw.kind) ? raw.kind : '',
      radio: raw.radio && ['start', 'stop'].includes(raw.radio.action) ? {
        action: raw.radio.action,
        station: raw.radio.action === 'start' && raw.radio.station && /^https?:\/\//.test(String(raw.radio.station.url || ''))
          ? { name: String(raw.radio.station.name || 'Radio').slice(0, 80), genre: String(raw.radio.station.genre || '').slice(0, 60), url: String(raw.radio.station.url).slice(0, 500) } : null,
        output: raw.radio.output === 'local' || /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(String(raw.radio.output || '')) ? String(raw.radio.output) : '',
      } : { action: 'none' },
      enabled: !!raw.enabled,
      hour: Number(raw.hour), minute: Number(raw.minute),
      repeat: raw.repeat,
      days: Array.isArray(raw.days) ? raw.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
      triggerType: ['scene', 'off'].includes(raw.triggerType) ? raw.triggerType : 'effect',
      scene: typeof raw.scene === 'string' ? raw.scene.slice(0, 40) : '',
      effect: typeof raw.effect === 'string' ? raw.effect : '',
      overlayKeys: Array.isArray(raw.overlayKeys) ? raw.overlayKeys.filter((k) => OVERLAY_KEYS.includes(k)) : [],
      playlistName: typeof raw.playlistName === 'string' ? raw.playlistName : '',
      message: typeof raw.message === 'string' ? raw.message : '',
      prealarm: raw.prealarm && typeof raw.prealarm === 'object' ? {
        enabled: !!raw.prealarm.enabled,
        preMinutes: Math.max(1, Math.min(180, Math.round(Number(raw.prealarm.preMinutes) || 15))),
        startBright: Number(raw.prealarm.startBright) || 5,
        giantSun: !!raw.prealarm.giantSun,
        windDown: !!raw.prealarm.windDown,
        wdMinutes: Math.max(1, Math.min(180, Math.round(Number(raw.prealarm.wdMinutes) || 15))),
        wdUseEffect: !!raw.prealarm.wdUseEffect,
        wdEffectKey: typeof raw.prealarm.wdEffectKey === 'string' ? raw.prealarm.wdEffectKey : '',
        wdOverlayKeys: Array.isArray(raw.prealarm.wdOverlayKeys) ? raw.prealarm.wdOverlayKeys.filter((k) => OVERLAY_KEYS.includes(k)) : [],
      } : {},
    };
    if (!Number.isInteger(al.hour)) al.hour = 0;
    if (!Number.isInteger(al.minute)) al.minute = 0;
    if (!alarmConfig.isValidAlarm(al)) return null;
    return al;
  }

  _persistAlarms() {
    alarmConfig.save(this.state.alarms);
    this._broadcast(this._stateMsg());
  }

  // Final gate before every Custom Cube mutation reaches disk - each
  // handler below constructs state.customCube.faces/library itself (already
  // shape-correct), but this is cheap insurance against a future handler
  // bug writing something malformed, same "each reads/writes its own state
  // defensively" spirit as the rest of this file. Skips the persist+
  // broadcast entirely (rather than persisting a fallback) if the shape
  // somehow went bad - a handler bug should be visible as "nothing
  // happened", not a silently-corrected save.
  _persistCustomCube() {
    if (!customCubeConfig.isValidFaces(this.state.customCube.faces)) return;
    if (!customCubeConfig.isValidLibrary(this.state.customCube.library)) return;
    customCubeConfig.save(this.state.customCube);
    this._broadcast(this._stateMsg());
  }

  // Same "skip rather than persist a fallback" posture as _persistCustomCube
  // above - see wallLayoutConfig.js's module comment for the data shape.
  _persistWallLayouts() {
    if (!wallLayoutConfig.isValidLibrary(this.state.wallLayouts)) return;
    wallLayoutConfig.save({ library: this.state.wallLayouts });
    this._broadcast(this._stateMsg());
  }

  // Unauthenticated socket (a PIN is set): only {cmd:'auth', pin} is
  // accepted. Five wrong tries close the connection, and each failure is
  // answered after a short delay, to make guessing slow.
  _handleAuth(ws, msg) {
    // Anything else before the PIN is ignored: the page asks once on connect.
    // Answering every early message with authRequired made the page ask for
    // the PIN several times in a row (a real report).
    if (!msg || msg.cmd !== 'auth') return;
    if (pinConfig.verifyPin(this.pinCfg, msg.pin)) {
      ws.role = 'admin';
      this._clients.add(ws);
      ws.send(JSON.stringify({ cmd: 'authOk' }));
      if (ws._wasGuest) ws.send(JSON.stringify({ cmd: 'role', role: 'admin' }));
      ws.send(JSON.stringify(this._stateMsg()));
      return;
    }
    ws._authFails = (ws._authFails || 0) + 1;
    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ cmd: 'authFailed' }));
      if (ws._authFails >= 5) ws.close(4003, 'Too many wrong PINs');
    }, 800);
  }

  _handleMessage(ws, data, isBinary) {
    if (isBinary) { if (this._clients.has(ws)) this._handleBinaryFrame(data); return; }
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    // Same shape rules for every command: a plain object with a short command
    // name and no prototype-poisoning keys. Each handler still checks its own
    // values (see wsCommands.js).
    if (!isWellFormed(msg)) return;
    if (!this._clients.has(ws)) { this._handleAuth(ws, msg); return; }
    // Guests: the PIN upgrades them; otherwise only a few commands work.
    if (ws && ws.role === 'guest') {
      if (msg.cmd === 'auth') { ws._wasGuest = true; this._clients.delete(ws); this._handleAuth(ws, msg); if (!this._clients.has(ws)) this._clients.add(ws); return; }
      if (!access.GUEST_CMDS.has(msg.cmd)) return;
    }
    // Any command may change state (several - brightness, speed, face
    // effects, alarms - don't broadcast), so every one bumps the version
    // app.js checks before re-sending state to the render worker.
    this.stateVersion = (this.stateVersion || 0) + 1;
    // See wsCommands.js - one handler per command. Unknown commands are
    // ignored, as the old if/else chain did.
    const handler = Object.prototype.hasOwnProperty.call(COMMANDS, msg.cmd) ? COMMANDS[msg.cmd] : null;
    if (handler) handler.call(this, ws, msg);
  }

  // Writes effectStatus.radio directly - a real report ("radio search does
  // not seem to work"). The tick loop (tick.js) only ever refreshes
  // effectStatus[state.effect] for whichever effect is CURRENTLY ACTIVE/
  // DISPLAYED, but radioPlay/radioStop/radioSearch are meant to work from
  // the sidebar panel regardless of what's currently showing on the cube -
  // searching for a station while some other effect is selected updated
  // radio.js's own internal state fine, but the client never received it,
  // since nothing wrote effectStatus.radio unless radio also happened to
  // be the active effect. Called after every radio command instead of
  // relying on the tick loop.
  _refreshRadioStatus() {
    // When effectCommandRelay is set (RENDER_WORKER=1), this thread's own
    // EFFECTS.radio is a dead/never-updated copy (see the constructor
    // comment) - calling its getStatus() here would overwrite the correct,
    // worker-relayed status (applied every tick via the frame reply - see
    // renderWorker.js, which computes this unconditionally itself) with
    // stale nonsense. Skip entirely and let that per-tick relay do it.
    if (this.effectCommandRelay) return;
    if (!this.state.effectStatus) this.state.effectStatus = {};
    this.state.effectStatus.radio = EFFECTS.radio.getStatus();
  }

  // Runs a Bluetooth operation (all async, several seconds each for
  // bluetoothctl calls) and replies ONLY to the requesting client, not a
  // broadcast - see module comment. Failures (missing bluetoothctl/pactl,
  // a rejected promise) become {ok:false, error:message} rather than an
  // unhandled rejection or a silently dropped request.
  async _replyBt(ws, resultCmd, fn) {
    try {
      const result = await fn();
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ cmd: resultCmd, ok: true, ...result }));
    } catch (err) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ cmd: resultCmd, ok: false, error: err.message }));
    }
  }

  _broadcast(obj) {
    // Also bumped for every incoming command (see _handleMessage) - this
    // covers async changes that land later (e.g. radio search results).
    this.stateVersion = (this.stateVersion || 0) + 1;
    const s = JSON.stringify(obj);
    // this._clients, not this.wss.clients: the latter is only the plain-
    // HTTP listener's set, so clients on the HTTPS page (:8082, needed for
    // camera/screen capture) never received state broadcasts at all.
    for (const client of this._clients) {
      if (client.readyState === WebSocket.OPEN) client.send(s);
    }
  }

  // Sends to every authenticated client WITHOUT counting as a state change
  // (unlike _broadcast) - for periodic data like diagnostics.
  sendAll(obj) {
    const s = JSON.stringify(obj);
    for (const client of this._clients) if (client.readyState === WebSocket.OPEN) client.send(s);
  }

  get hasClients() {
    return this._clients.size > 0;
  }

  // Call once per animation tick. Throttles internally to PREVIEW_FPS and
  // is a no-op with zero clients connected - see module comment. brightness
  // is applied here (not baked into core.colBuf) so the preview matches
  // what the physical panels show - see app.js's comment on why brightness
  // must stay non-destructive.
  maybeStreamFrame(core, brightness = 1.0) {
    if (!this.hasClients) return;
    const now = Date.now();
    if (now - this._lastFrameMs < 1000 / PREVIEW_FPS) return;
    this._lastFrameMs = now;
    this._frameN = (this._frameN || 0) + 1;
    this._guestFrame = this._frameN % 4 === 0; // guests get a lighter 5 fps preview

    if (this.config.mode === 'wall') { this._streamWallFrames(core, brightness); return; }

    const SIZE = core.SIZE;
    const faceCount = this.config.mode === '2d' ? 1 : 6;
    for (let face = 0; face < faceCount; face++) {
      const faceMap = core.faceMap[face];
      const buf = Buffer.allocUnsafe(1 + SIZE * SIZE * 3);
      buf[0] = face;
      const colBuf = core.colBuf;
      for (let v = 0; v < SIZE; v++) {
        for (let u = 0; u < SIZE; u++) {
          const led = faceMap[v * SIZE + u];
          const o = 1 + (v * SIZE + u) * 3;
          if (led < 0) { buf[o] = 0; buf[o + 1] = 0; buf[o + 2] = 0; continue; }
          const c = led * 3;
          buf[o]     = Math.max(0, Math.min(255, (colBuf[c] * brightness * 255) | 0));
          buf[o + 1] = Math.max(0, Math.min(255, (colBuf[c + 1] * brightness * 255) | 0));
          buf[o + 2] = Math.max(0, Math.min(255, (colBuf[c + 2] * brightness * 255) | 0));
        }
      }
      for (const client of this._clients) {
        if (client.readyState === WebSocket.OPEN && !client.previewOff && (client.role !== 'guest' || this._guestFrame) && previewHasRoom(client, buf.length)) client.send(buf);
      }
    }
  }

  // One binary frame per panel (not per cube face - wall mode has no
  // faces), keyed by index into this.config.panels (the same array the
  // client already has from the "state" message, so it knows each frame's
  // grid position). Slices each panel's panelSize x panelSize square out
  // of core.wallBuf at that panel's (gx,gy) offset.
  _streamWallFrames(core, brightness) {
    if (!core.wallBuf) return; // initWall() hasn't run yet
    const S = core.wallPanelSize, wallW = core.wallW, wallBuf = core.wallBuf;
    this.config.panels.forEach((p, idx) => {
      const buf = Buffer.allocUnsafe(1 + S * S * 3);
      buf[0] = idx;
      const ox = p.gx * S, oy = p.gy * S;
      for (let v = 0; v < S; v++) {
        for (let u = 0; u < S; u++) {
          // Plain row-major, no flip - a whole-canvas vertical flip was
          // tried here to fix orientation-sensitive effects like
          // weatherWall.js, but it's wrong: flipping which wallBuf ROW a
          // panel sources from also silently changes WHICH OCCUPIED CELL
          // it reads from whenever the layout isn't symmetric about the
          // vertical midline (confirmed: an L-shaped layout read two of
          // its panels from an unoccupied, always-black gap cell instead
          // of their own data). The correct fix belongs in the AFFECTED
          // EFFECTS' own vertical convention (see weatherWall.js), not
          // here - this must stay a pure, position-preserving slice.
          const c = ((oy + v) * wallW + (ox + u)) * 3;
          const o = 1 + (v * S + u) * 3;
          buf[o]     = Math.max(0, Math.min(255, (wallBuf[c] * brightness * 255) | 0));
          buf[o + 1] = Math.max(0, Math.min(255, (wallBuf[c + 1] * brightness * 255) | 0));
          buf[o + 2] = Math.max(0, Math.min(255, (wallBuf[c + 2] * brightness * 255) | 0));
        }
      }
      for (const client of this._clients) {
        if (client.readyState === WebSocket.OPEN && !client.previewOff && (client.role !== 'guest' || this._guestFrame) && previewHasRoom(client, buf.length)) client.send(buf);
      }
    });
  }

  close() {
    this.wss.close();
    this.http.close();
    for (const srv of this.httpsServers || []) srv.close();
  }
}

module.exports = WsServer;
module.exports.previewHasRoom = previewHasRoom;
module.exports.isWellFormed = isWellFormed;
module.exports.isSameOrigin = isSameOrigin;
