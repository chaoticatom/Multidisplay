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
// WebSocket wire protocol:
//   Text frames (JSON), client -> server, control commands:
//     {"cmd":"setEffect",    "effect":"wave"}
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
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { EFFECTS, EFFECT_NAMES, WALL_EFFECTS } = require('./effects');
const panelConfig = require('./panelConfig');
const bluetooth = require('./bluetooth');

const PREVIEW_FPS = 20; // matches the ESP32 firmware's streamFrameToCube() throttle
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const INDEX_HTML = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'));   // read once at startup, not per-request
const THREE_JS = fs.readFileSync(path.join(PUBLIC_DIR, 'three.min.js'));   // served for the sidebar/3D-preview page's <script src>, same pattern as INDEX_HTML
const APP_JS = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'));           // wires the copied sidebar markup to pi-native's WS protocol

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

    this.wss.on('connection', (ws) => {
      console.log('[WS] client connected');
      ws.send(JSON.stringify(this._stateMsg()));
      ws.on('message', (data) => this._handleMessage(ws, data));
      ws.on('close', () => console.log('[WS] client disconnected'));
      ws.on('error', (err) => console.warn('[WS] client error:', err.message));
    });

    this.http.listen(port);
  }

  _handleHttp(req, res) {
    if (req.method !== 'GET') { res.writeHead(404).end(); return; }
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(INDEX_HTML);
    } else if (req.url === '/effects.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(EFFECT_NAMES));
    } else if (req.url === '/three.min.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(THREE_JS);
    } else if (req.url === '/app.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(APP_JS);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }

  _stateMsg() {
    return {
      cmd: 'state',
      effect: this.state.effect, brightness: this.state.brightness, speed: this.state.speed,
      panelSize: this.config.size, panelMode: this.config.mode, panels: this.config.panels,
      effectOptions: this.state.effectOptions, effectStatus: this.state.effectStatus,
    };
  }

  _handleMessage(ws, data) {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.cmd === 'setEffect' && EFFECTS[msg.effect]) {
      this.state.effect = msg.effect;
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
    return this.wss.clients.size > 0;
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
      for (const client of this.wss.clients) {
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
      for (const client of this.wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(buf);
      }
    });
  }

  close() {
    this.wss.close();
    this.http.close();
  }
}

module.exports = WsServer;
