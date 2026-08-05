// Local control + preview WebSocket server. Idles (no frame encoding/
// sending) until a client connects, then streams frames - same pattern as
// g_browserConnected/WS_EVT_CONNECT in the ESP32 firmware's web_server.h,
// deliberately kept (per this project's design discussion) so nobody
// watching means zero wasted CPU/bandwidth on preview encoding.
//
// Wire protocol:
//   Text frames (JSON), client -> server, control commands:
//     {"cmd":"setEffect",    "effect":"wave"}
//     {"cmd":"setBrightness","value":0.0-1.5}
//     {"cmd":"setSpeed",     "value":0.0-8.0}
//     {"cmd":"setPanelConfig","size":8|16|64,"mode":"cube"|"2d"}
//       Mirrors the browser's cube-size picker (8x8/16x16/64x64/2D) -
//       reused as the panel-layout config here instead of inventing a new
//       setting, since HUB75 itself can't be auto-probed for panel count
//       (write-only protocol, no return path - see project discussion).
//       All 3 sizes mean the same 6-face physical layout; "2d" means 1
//       flat panel instead. Persisted to disk (panelConfig.js) so it
//       survives a restart, and always included in the "state" message so
//       a freshly-connected remote browser's UI reflects whatever was last
//       chosen on the Pi rather than defaulting to something stale.
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
const { EFFECTS, EFFECT_NAMES } = require('./effects');
const panelConfig = require('./panelConfig');
const bluetooth = require('./bluetooth');

const PREVIEW_FPS = 20; // matches the ESP32 firmware's streamFrameToCube() throttle

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
    this.wss = new WebSocket.Server({ port });
    this._lastFrameMs = 0;

    this.wss.on('connection', (ws) => {
      console.log('[WS] client connected');
      ws.send(JSON.stringify(this._stateMsg()));
      ws.on('message', (data) => this._handleMessage(ws, data));
      ws.on('close', () => console.log('[WS] client disconnected'));
      ws.on('error', (err) => console.warn('[WS] client error:', err.message));
    });
  }

  _stateMsg() {
    return {
      cmd: 'state',
      effect: this.state.effect, brightness: this.state.brightness, speed: this.state.speed,
      panelSize: this.config.size, panelMode: this.config.mode,
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
    } else if (msg.cmd === 'setPanelConfig') {
      const size = Number(msg.size);
      const mode = msg.mode;
      if (!panelConfig.VALID_SIZES.includes(size) || (mode !== 'cube' && mode !== '2d')) return;
      this.config.size = size;
      this.config.mode = mode;
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

  close() {
    this.wss.close();
  }
}

module.exports = WsServer;
