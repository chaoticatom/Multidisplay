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
//   Text frames, server -> client, on connect and on every effect change:
//     {"cmd":"state","effect":"wave","brightness":1,"speed":1}
//   Binary frames, server -> client, one per face per tick, only while
//   >=1 client is connected:
//     [faceId(1 byte)][R,G,B * SIZE*SIZE bytes, row-major, faceMap order]
//   This is a new, simpler protocol - not required to bit-match the
//   ESP32's PKT_VIDEO framing, since direction/purpose differ (Pi -> any
//   preview client, vs. today's browser -> ESP32) and no existing consumer
//   code depends on the ESP32's exact framing.
const WebSocket = require('ws');
const { EFFECTS, EFFECT_NAMES } = require('./effects');

const PREVIEW_FPS = 20; // matches the ESP32 firmware's streamFrameToCube() throttle

class WsServer {
  constructor(port, state) {
    this.state = state; // shared mutable state: {effect, brightness, speed}
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
    return { cmd: 'state', effect: this.state.effect, brightness: this.state.brightness, speed: this.state.speed };
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
    for (let face = 0; face < 6; face++) {
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
