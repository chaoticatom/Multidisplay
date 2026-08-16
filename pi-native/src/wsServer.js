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
//     {"cmd":"setPhysicalCubePanels","value":1-6}
//       How many of the 6 cube faces are actually wired to real hardware
//       (see panelConfig.js's module comment) - purely informational for
//       the UI (a "simulation" indicator when the 3D preview is showing
//       more faces than physically exist), doesn't affect config.mode/
//       size/panels or what the driver pushes.
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
const fs = require('fs');
const path = require('path');
const { EFFECTS, EFFECT_NAMES, WALL_EFFECTS } = require('./effects');
const { OVERLAY_KEYS } = require('./effects/overlays');
const panelConfig = require('./panelConfig');
const alarmConfig = require('./alarmConfig');
const customCubeConfig = require('./customCubeConfig');
const unsplashConfig = require('./unsplashConfig');
const bluetooth = require('./bluetooth');
const alarmsEngine = require('./effects/alarms');
const radio = require('./effects/radio');
const { browserFrameSource } = require('./effects/video/browserFrameSource');
const crypto = require('crypto');

const PREVIEW_FPS = 20; // matches the ESP32 firmware's streamFrameToCube() throttle
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const INDEX_HTML = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'));   // read once at startup, not per-request
const THREE_JS = fs.readFileSync(path.join(PUBLIC_DIR, 'three.min.js'));   // served for the sidebar/3D-preview page's <script src>, same pattern as INDEX_HTML
const APP_JS = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'));           // wires the copied sidebar markup to pi-native's WS protocol

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

class WsServer {
  // state: shared mutable {effect, brightness, speed}.
  // config: shared mutable {size, mode} (panelConfig.js shape) - already
  // loaded from disk by app.js before this is constructed.
  // onConfigChange(config): called after a validated setPanelConfig command
  // is applied and persisted, so app.js can rebuild the CubeCore/driver
  // (which this module has no reference to and shouldn't own).
  constructor(port, state, config, onConfigChange) {
    this.state = state;
    this.config = config;
    this.onConfigChange = onConfigChange;
    this._lastFrameMs = 0;

    // One HTTP server handles both the control page (GET /, GET
    // /effects.json) and the WebSocket upgrade, on the same port - so
    // http://<pi>:8081/ actually shows something instead of the "Upgrade
    // Required" error a bare WebSocket-only server gives a normal browser
    // GET request (see project discussion - this is exactly the confusion
    // that prompted building this page in the first place).
    this.http = http.createServer((req, res) => this._handleHttp(req, res));
    this.wss = new WebSocket.Server({ server: this.http });

    // Tracks EVERY connected client across both the plain-HTTP and (if
    // available) HTTPS listeners as one set, so broadcast/preview-
    // streaming code doesn't need to know or care which transport any
    // given client came in on - see _wireConnection() below.
    this._clients = new Set();
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
      this.https = https.createServer(tlsFiles, (req, res) => this._handleHttp(req, res));
      this.wssHttps = new WebSocket.Server({ server: this.https });
      this._wireConnection(this.wssHttps);
      this.https.listen(port + 1);
      console.log(`[app] HTTPS control page (needed for camera/screen capture) on :${port + 1} - self-signed, browsers will warn once`);
    } else {
      this.https = null;
    }
  }

  _wireConnection(wss) {
    wss.on('connection', (ws) => {
      console.log('[WS] client connected');
      this._clients.add(ws);
      ws.send(JSON.stringify(this._stateMsg()));
      ws.on('message', (data, isBinary) => this._handleMessage(ws, data, isBinary));
      ws.on('close', () => { this._clients.delete(ws); console.log('[WS] client disconnected'); });
      ws.on('error', (err) => console.warn('[WS] client error:', err.message));
    });
  }

  _handleHttp(req, res) {
    if (req.method === 'POST' && req.url.startsWith('/api/uploadVideo')) { this._handleUpload(req, res); return; }
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
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html', ...noCacheHeaders });
      res.end(INDEX_HTML);
    } else if (req.url === '/effects.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...noCacheHeaders });
      res.end(JSON.stringify(EFFECT_NAMES));
    } else if (req.url === '/three.min.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript', ...noCacheHeaders });
      res.end(THREE_JS);
    } else if (req.url === '/app.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript', ...noCacheHeaders });
      res.end(APP_JS);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
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
    browserFrameSource.setFrame(payload, w, h, kind);
  }

  _stateMsg() {
    return {
      cmd: 'state',
      effect: this.state.effect, brightness: this.state.brightness, speed: this.state.speed,
      blank: !!this.state.blank,
      panelSize: this.config.size, panelMode: this.config.mode, panels: this.config.panels,
      physicalCubePanels: this.config.physicalCubePanels ?? 6,
      effectOptions: this.state.effectOptions, effectStatus: this.state.effectStatus,
      overlays: this.state.overlays,
      alarms: this.state.alarms, activeAlarm: this.state.activeAlarm,
      customCube: this.state.customCube,
      unsplashConfig: this.state.unsplashConfig,
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
      name: typeof raw.name === 'string' ? raw.name : '',
      enabled: !!raw.enabled,
      hour: Number(raw.hour), minute: Number(raw.minute),
      repeat: raw.repeat,
      days: Array.isArray(raw.days) ? raw.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
      triggerType: raw.triggerType === 'playlist' ? 'playlist' : 'effect',
      effect: typeof raw.effect === 'string' ? raw.effect : '',
      overlayKeys: Array.isArray(raw.overlayKeys) ? raw.overlayKeys.filter((k) => OVERLAY_KEYS.includes(k)) : [],
      playlistName: typeof raw.playlistName === 'string' ? raw.playlistName : '',
      message: typeof raw.message === 'string' ? raw.message : '',
      prealarm: raw.prealarm && typeof raw.prealarm === 'object' ? {
        enabled: !!raw.prealarm.enabled,
        preMinutes: Number(raw.prealarm.preMinutes) || 15,
        startBright: Number(raw.prealarm.startBright) || 5,
        giantSun: !!raw.prealarm.giantSun,
        windDown: !!raw.prealarm.windDown,
        wdMinutes: Number(raw.prealarm.wdMinutes) || 15,
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

  _handleMessage(ws, data, isBinary) {
    if (isBinary) { this._handleBinaryFrame(data); return; }
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.cmd === 'setEffect' && EFFECTS[msg.effect]) {
      this.state.effect = msg.effect;
      this.state.blank = false; // selecting a new effect always un-blanks - see "clearAll" below
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'clearAll') {
      // The sidebar's "✕ Clear All" button - matches the browser
      // original's clear-all-btn handler (see ui.js): turns every overlay
      // off AND stops rendering the current effect, so the display goes
      // and stays solid black rather than the previously-selected effect
      // simply keeping running underneath. app.js's tick loop checks
      // state.blank and skips the main effect entirely while it's set
      // (see its module comment); selecting any effect again (setEffect,
      // above) clears it automatically, matching the browser's own
      // "still fully usable, just currently blanked" behavior.
      if (!this.state.overlays) this.state.overlays = {};
      for (const key of OVERLAY_KEYS) {
        if (!this.state.overlays[key]) this.state.overlays[key] = {};
        this.state.overlays[key].on = false;
      }
      this.state.blank = true;
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'setBrightness') {
      const v = Number(msg.value);
      if (Number.isFinite(v)) this.state.brightness = Math.max(0, Math.min(1.5, v));
    } else if (msg.cmd === 'setSpeed') {
      const v = Number(msg.value);
      if (Number.isFinite(v)) this.state.speed = Math.max(0, Math.min(8, v));
    } else if (msg.cmd === 'setEffectOption') {
      // Generic per-effect option store, e.g. {cmd:'setEffectOption',
      // effect:'lightspeed', key:'speed', value:8} - backs the effect
      // option panels (Colour Rain's style, Light Speed's speed/trail/
      // size/nudge/count/colour, ...). Deliberately untyped/unvalidated
      // beyond "effect and key are non-empty strings": each effect reads
      // its own options defensively with its own default (see rain.js/
      // lightspeed.js), the same way the browser's plain module-level
      // vars never validated slider/button values either.
      if (typeof msg.effect !== 'string' || typeof msg.key !== 'string') return;
      if (!EFFECTS[msg.effect] && !WALL_EFFECTS[msg.effect]) return;
      if (!this.state.effectOptions) this.state.effectOptions = {};
      if (!this.state.effectOptions[msg.effect]) this.state.effectOptions[msg.effect] = {};
      this.state.effectOptions[msg.effect][msg.key] = msg.value;
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'stopVideoSource') {
      // Immediately tears down whichever video source is currently live
      // (ffmpeg decode, cube AND wall instances, plus any browser camera/
      // screen capture) regardless of which effect is actually selected
      // right now. See video.js's/videoWall.js's exported stop() and
      // browserFrameSource.js's clear() for why this needs to reach past
      // the tick loop's "only the currently-selected effect runs" rule
      // (app.js's module comment) - public/app.js sends this the moment
      // the user clicks away from Video Display to any other effect, a
      // real report having traced a persistent flicker-on-switch to
      // nothing ever stopping the video source at that point (it would
      // eventually stop on its own via ffmpegSource.js's idle timeout,
      // but that left a real window where a stale frame or a still-live
      // camera/screen capture could flash back or keep running pointlessly).
      if (typeof EFFECTS.video?.stop === 'function') EFFECTS.video.stop();
      if (typeof WALL_EFFECTS.video?.stop === 'function') WALL_EFFECTS.video.stop();
      browserFrameSource.clear();
    } else if (msg.cmd === 'setPanelConfig') {
      const size = Number(msg.size);
      const mode = msg.mode;
      if (!panelConfig.VALID_SIZES.includes(size) || !panelConfig.VALID_MODES.includes(mode)) return;
      // panels is optional here, only meaningful for mode:'wall' - lets the
      // client's wall-grid UI switch INTO wall mode and set an initial
      // layout in one message (setPanelPositions below requires already
      // being in wall mode, which isn't true yet on that first click/drag).
      if (mode === 'wall' && msg.panels !== undefined) {
        if (!panelConfig.isValidPanels(msg.panels)) return;
        this.config.panels = msg.panels;
      }
      this.config.size = size;
      this.config.mode = mode;
      panelConfig.save(this.config);
      if (this.onConfigChange) this.onConfigChange(this.config);
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'setPhysicalCubePanels') {
      // How many of the 6 cube faces are actually wired to real hardware
      // (see panelConfig.js's module comment) - purely informational, lets
      // the UI show a "simulation" indicator when cube mode's 3D preview
      // is showing more faces than physically exist. Doesn't touch
      // config.mode/size/panels or the driver at all.
      const n = Number(msg.value);
      if (!panelConfig.isValidPhysicalCubePanels(n)) return;
      this.config.physicalCubePanels = n;
      panelConfig.save(this.config);
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'addPanel') {
      // Adds a panel at the first free cell (row-major) in the wall grid,
      // switching to wall mode if not already in it - this is the "+"
      // button's command. No-ops (rather than erroring) once the grid is
      // full (WALL_MAX_COLS*WALL_MAX_ROWS panels, matching the physical
      // 2x3 topology already wired for cube mode).
      const panels = this.config.mode === 'wall' ? this.config.panels.slice() : [{ gx: 0, gy: 0 }];
      let placed = null;
      outer: for (let gy = 0; gy < panelConfig.WALL_MAX_ROWS; gy++) {
        for (let gx = 0; gx < panelConfig.WALL_MAX_COLS; gx++) {
          if (!panels.some((p) => p.gx === gx && p.gy === gy)) { placed = { gx, gy }; break outer; }
        }
      }
      if (!placed) return; // grid already full
      panels.push(placed);
      this.config.mode = 'wall';
      this.config.panels = panels;
      panelConfig.save(this.config);
      if (this.onConfigChange) this.onConfigChange(this.config);
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'removePanel') {
      // Removes by grid position (what the drag UI knows, not array index,
      // since positions are what's rendered) - keeps at least 1 panel.
      if (this.config.mode !== 'wall' || this.config.panels.length <= 1) return;
      const panels = this.config.panels.filter((p) => !(p.gx === msg.gx && p.gy === msg.gy));
      if (panels.length === this.config.panels.length) return; // no matching panel
      this.config.panels = panels;
      panelConfig.save(this.config);
      if (this.onConfigChange) this.onConfigChange(this.config);
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'setPanelPositions') {
      // Drag-to-rearrange result: a full replacement panels array. Validated
      // the same way as everywhere else a layout can enter config (see
      // panelConfig.isValidPanels) so a malformed drag can never reach
      // core.initWall()/the driver.
      if (this.config.mode !== 'wall' || !panelConfig.isValidPanels(msg.panels)) return;
      this.config.panels = msg.panels;
      panelConfig.save(this.config);
      if (this.onConfigChange) this.onConfigChange(this.config);
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'setOverlay') {
      if (typeof msg.key !== 'string' || !OVERLAY_KEYS.includes(msg.key)) return;
      if (!this.state.overlays || !this.state.overlays[msg.key]) return;
      this.state.overlays[msg.key].on = !!msg.enabled;
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'setOverlayOption') {
      // Same "untyped, each overlay reads its own params defensively"
      // spirit as setEffectOption above - `key` is validated against the
      // real overlay list, `option`/`value` are not further checked here.
      if (typeof msg.key !== 'string' || !OVERLAY_KEYS.includes(msg.key)) return;
      if (typeof msg.option !== 'string') return;
      if (!this.state.overlays || !this.state.overlays[msg.key]) return;
      this.state.overlays[msg.key][msg.option] = msg.value;
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'setOverlayGlobalBright') {
      const v = Number(msg.value);
      if (!Number.isFinite(v) || !this.state.overlays) return;
      this.state.overlays.globalBright = Math.max(0, Math.min(1, v));
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'addAlarm') {
      const al = this._sanitizeAlarm(msg.alarm, crypto.randomUUID());
      if (!al) return;
      if (!this.state.alarms) this.state.alarms = [];
      this.state.alarms.push(al);
      this._persistAlarms();
    } else if (msg.cmd === 'updateAlarm') {
      if (typeof msg.id !== 'string' || !this.state.alarms) return;
      const idx = this.state.alarms.findIndex((a) => a.id === msg.id);
      if (idx < 0) return;
      const al = this._sanitizeAlarm(msg.alarm, msg.id);
      if (!al) return;
      this.state.alarms[idx] = al;
      // Editing the alarm currently firing dismisses it, same as the
      // browser's alarmOpenEditor save-path (ui.js ~line 776) - stale
      // in-flight state referencing the pre-edit alarm object shouldn't
      // keep rendering.
      if (this.state.activeAlarm && this.state.activeAlarm.al.id === msg.id) this.state.activeAlarm = null;
      this._persistAlarms();
    } else if (msg.cmd === 'deleteAlarm') {
      if (typeof msg.id !== 'string' || !this.state.alarms) return;
      const before = this.state.alarms.length;
      this.state.alarms = this.state.alarms.filter((a) => a.id !== msg.id);
      if (this.state.alarms.length === before) return; // no matching alarm
      if (this.state.activeAlarm && this.state.activeAlarm.al.id === msg.id) this.state.activeAlarm = null;
      this._persistAlarms();
    } else if (msg.cmd === 'setAlarmEnabled') {
      if (typeof msg.id !== 'string' || !this.state.alarms) return;
      const al = this.state.alarms.find((a) => a.id === msg.id);
      if (!al) return;
      al.enabled = !!msg.enabled;
      if (!al.enabled && this.state.activeAlarm && this.state.activeAlarm.al.id === msg.id) this.state.activeAlarm = null;
      this._persistAlarms();
    } else if (msg.cmd === 'dismissAlarm') {
      alarmsEngine.dismissActive(this.state);
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'setFaceEffect') {
      if (!this.state.customCube) return;
      const face = Number(msg.face);
      if (!Number.isInteger(face) || face < 0 || face > 5) return;
      if (msg.effect === null || msg.effect === undefined || msg.effect === 'none') {
        this.state.customCube.faces[face] = null;
      } else {
        if (typeof msg.effect !== 'string' || msg.effect === 'custom_cube' || !EFFECTS[msg.effect]) return;
        // Preserve overlayKeys/opts across a same-effect re-pick (e.g.
        // re-selecting the effect already assigned doesn't wipe its saved
        // opts); a genuine effect CHANGE starts that face's opts fresh,
        // same as the browser's sel 'change' handler (ui.js ~line 149-159).
        const existing = this.state.customCube.faces[face];
        const keepOpts = existing && existing.effect === msg.effect;
        this.state.customCube.faces[face] = {
          effect: msg.effect,
          overlayKeys: existing ? [...existing.overlayKeys] : [],
          opts: keepOpts ? { ...existing.opts } : {},
        };
      }
      this._persistCustomCube();
    } else if (msg.cmd === 'setFaceOpts') {
      if (!this.state.customCube) return;
      const face = Number(msg.face);
      if (!Number.isInteger(face) || face < 0 || face > 5) return;
      const cfg = this.state.customCube.faces[face];
      if (!cfg || !msg.opts || typeof msg.opts !== 'object' || Array.isArray(msg.opts)) return;
      cfg.opts = { ...msg.opts };
      this._persistCustomCube();
    } else if (msg.cmd === 'setFaceOverlays') {
      if (!this.state.customCube) return;
      const face = Number(msg.face);
      if (!Number.isInteger(face) || face < 0 || face > 5) return;
      const cfg = this.state.customCube.faces[face];
      if (!cfg || !Array.isArray(msg.overlayKeys)) return;
      // Reject (not silently filter) a payload containing an unknown key -
      // same "malformed payload dropped whole" posture as _sanitizeAlarm,
      // rather than quietly saving a truncated list the client didn't ask for.
      if (msg.overlayKeys.some((k) => typeof k !== 'string' || !OVERLAY_KEYS.includes(k))) return;
      cfg.overlayKeys = [...msg.overlayKeys];
      this._persistCustomCube();
    } else if (msg.cmd === 'saveCube') {
      if (!this.state.customCube) return;
      if (typeof msg.name !== 'string' || !msg.name.trim()) return;
      const name = msg.name.trim();
      const snapshot = {
        name,
        faces: this.state.customCube.faces.map((f) => (f ? { effect: f.effect, overlayKeys: [...f.overlayKeys], opts: { ...f.opts } } : null)),
      };
      const idx = this.state.customCube.library.findIndex((c) => c.name === name);
      if (idx >= 0) this.state.customCube.library[idx] = snapshot;
      else this.state.customCube.library.push(snapshot);
      this._persistCustomCube();
    } else if (msg.cmd === 'loadCube') {
      if (!this.state.customCube) return;
      const idx = Number(msg.index);
      if (!Number.isInteger(idx)) return;
      const entry = this.state.customCube.library[idx];
      if (!entry) return;
      this.state.customCube.faces = entry.faces.map((f) => (f ? { effect: f.effect, overlayKeys: [...f.overlayKeys], opts: { ...f.opts } } : null));
      this._persistCustomCube();
    } else if (msg.cmd === 'deleteCube') {
      if (!this.state.customCube) return;
      const idx = Number(msg.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= this.state.customCube.library.length) return;
      this.state.customCube.library.splice(idx, 1);
      this._persistCustomCube();
    } else if (msg.cmd === 'clearFaces') {
      if (!this.state.customCube) return;
      this.state.customCube.faces = [null, null, null, null, null, null];
      this._persistCustomCube();
    } else if (msg.cmd === 'btScan') {
      this._replyBt(ws, 'btScanResult', async () => ({ devices: await bluetooth.scanDevices() }));
    } else if (msg.cmd === 'btPair') {
      this._replyBt(ws, 'btPairResult', () => bluetooth.pairDevice(msg.mac));
    } else if (msg.cmd === 'btStatus') {
      this._replyBt(ws, 'btStatusResult', async () => ({ devices: await bluetooth.listPaired() }));
    } else if (msg.cmd === 'btDiscoverable') {
      this._replyBt(ws, 'btDiscoverableResult', () => bluetooth.makeDiscoverable());
    } else if (msg.cmd === 'btRoutePhoneAudio') {
      this._replyBt(ws, 'btRoutePhoneAudioResult', () => bluetooth.routePhoneAudio());
    } else if (msg.cmd === 'radioPlay') {
      if (!msg.station || typeof msg.station.url !== 'string' || !msg.station.url) return;
      radio.playStation({ name: msg.station.name, genre: msg.station.genre, url: msg.station.url });
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'radioStop') {
      radio.stopStation();
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'setUnsplashConfig') {
      // Persists the Unsplash Access Key + default search query - see
      // unsplashConfig.js's module comment for why this is a dedicated
      // small JSON file rather than the generic setEffectOption store: the
      // key needs to survive a restart the same way alarms/customCube do,
      // which setEffectOption's in-memory-only state.effectOptions does not.
      if (typeof msg.apiKey !== 'string' || typeof msg.query !== 'string') return;
      this.state.unsplashConfig = { apiKey: msg.apiKey.trim(), query: msg.query.trim() || 'nature' };
      unsplashConfig.save(this.state.unsplashConfig);
      this._broadcast(this._stateMsg());
    } else if (msg.cmd === 'radioSearch') {
      const query = typeof msg.query === 'string' ? msg.query : '';
      radio.search(query).then(() => this._broadcast(this._stateMsg())).catch((err) => console.warn('[radio] search failed:', err.message));
    }
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
    const s = JSON.stringify(obj);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(s);
    }
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
        if (client.readyState === WebSocket.OPEN) client.send(buf);
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
          const c = ((oy + v) * wallW + (ox + u)) * 3;
          const o = 1 + (v * S + u) * 3;
          buf[o]     = Math.max(0, Math.min(255, (wallBuf[c] * brightness * 255) | 0));
          buf[o + 1] = Math.max(0, Math.min(255, (wallBuf[c + 1] * brightness * 255) | 0));
          buf[o + 2] = Math.max(0, Math.min(255, (wallBuf[c + 2] * brightness * 255) | 0));
        }
      }
      for (const client of this._clients) {
        if (client.readyState === WebSocket.OPEN) client.send(buf);
      }
    });
  }

  close() {
    this.wss.close();
    this.http.close();
    if (this.https) { this.wssHttps.close(); this.https.close(); }
  }
}

module.exports = WsServer;
