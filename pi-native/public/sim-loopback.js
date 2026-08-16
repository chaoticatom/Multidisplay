// Browser-native "fake server" for the GitHub Pages simulator. Loaded only
// when index.html sets window.MULTIDISPLAY_SIM = true (see sim/README.md
// for the full picture). Runs the EXACT same effect-computation code as
// the real Pi (bundled from src/core.js + src/effects/index.js + src/tick.js
// into sim-engine.js, see sim/build.js) inside a setInterval tick loop, and
// encodes frames in the identical wire format wsServer.js streams over a
// real WebSocket - so app.js's existing handleTextMessage()/handleFrame()
// need NO changes to work against this instead of a real connection.
//
// What's genuinely simulated (same code as the Pi): every visual effect,
// overlays, brightness/speed, panel mode/size/layout, the Timer system.
// What's NOT available here (no server, no hardware, nothing to fake
// usefully): Bluetooth pairing, WiFi setup, video upload/webcam/screen
// share, Custom Cube save/load (needs multi-face persistence UX beyond
// what a demo needs), Unsplash API key persistence. Those panels are left
// visually present but inert - see wireSimUnsupported() in app.js's own
// sim-mode branch, same "grey out, don't hide" precedent this app already
// uses for not-yet-wired features.
(function () {
  const E = window.PiEngine;
  const TICK_HZ = 30;
  const PREVIEW_FPS = 20;

  const config = { ...E.panelConfig.DEFAULT_CONFIG, panels: [...E.panelConfig.DEFAULT_CONFIG.panels] };
  const core = new E.CubeCore(config.size);
  if (config.mode === 'wall') core.initWall(config.panels, config.size);

  const state = {
    effect: 'wave', brightness: 1.0, speed: 1.0,
    overlays: JSON.parse(JSON.stringify(E.OV_DEFAULTS)),
    alarms: [], activeAlarm: null,
    customCube: { faces: {}, saved: {} },
    unsplashConfig: { apiKey: '', query: 'nature' },
    effectOptions: { weather: { city: '' } },
    blank: false,
  };

  const listeners = { text: [], frame: [] };
  function emitText(msg) { for (const cb of listeners.text) cb(msg); }
  function emitFrame(buf) { for (const cb of listeners.frame) cb(buf); }

  function stateMsg() {
    return {
      cmd: 'state', effect: state.effect, brightness: state.brightness, speed: state.speed,
      panelSize: config.size, panelMode: config.mode, panels: config.panels,
      physicalCubePanels: config.physicalCubePanels,
      overlays: state.overlays, alarms: state.alarms, activeAlarm: state.activeAlarm,
      customCube: state.customCube, unsplashConfig: state.unsplashConfig,
      effectOptions: state.effectOptions, effectStatus: state.effectStatus, blank: state.blank,
      effectNames: E.EFFECT_NAMES,
      simulator: true,
    };
  }

  // ── Command handling ──────────────────────────────────────────────────
  // Deliberately covers the effect-focused slice of wsServer.js's real
  // protocol (see that file's module comment for the full list) - anything
  // hardware/persistence-only (Bluetooth, WiFi, video upload, Custom Cube
  // save/load) is not handled here and silently no-ops, matching how
  // app.js already greys those controls out in sim mode.
  function applyCommand(msg) {
    if (msg.cmd === 'setEffect') {
      if (!E.EFFECTS[msg.effect] && !E.WALL_EFFECTS[msg.effect]) return;
      state.effect = msg.effect;
      state.blank = false;
    } else if (msg.cmd === 'clearAll') {
      for (const k of Object.keys(state.overlays)) state.overlays[k].on = false;
      state.blank = true;
    } else if (msg.cmd === 'setBrightness') {
      const v = Number(msg.value);
      if (Number.isFinite(v)) state.brightness = Math.max(0, Math.min(1.5, v));
    } else if (msg.cmd === 'setSpeed') {
      const v = Number(msg.value);
      if (Number.isFinite(v)) state.speed = Math.max(0, Math.min(8, v));
    } else if (msg.cmd === 'setEffectOption') {
      if (typeof msg.effect !== 'string' || typeof msg.key !== 'string') return;
      if (!E.EFFECTS[msg.effect] && !E.WALL_EFFECTS[msg.effect]) return;
      if (!state.effectOptions[msg.effect]) state.effectOptions[msg.effect] = {};
      state.effectOptions[msg.effect][msg.key] = msg.value;
    } else if (msg.cmd === 'setOverlay') {
      if (!E.OVERLAY_KEYS.includes(msg.key)) return;
      state.overlays[msg.key].on = !!msg.enabled;
    } else if (msg.cmd === 'setOverlayOption') {
      if (!E.OVERLAY_KEYS.includes(msg.key)) return;
      state.overlays[msg.key][msg.option] = msg.value;
    } else if (msg.cmd === 'setPanelConfig') {
      if (E.panelConfig.VALID_SIZES.includes(msg.size)) config.size = msg.size;
      if (E.panelConfig.VALID_MODES.includes(msg.mode)) config.mode = msg.mode;
      // panels is optional here, only meaningful for mode:'wall' - matches
      // wsServer.js's real handler (lets the first "+" click switch INTO
      // wall mode and set an initial layout in the same message). Missing
      // here previously - msg.panels was silently ignored, so any caller
      // that switches into wall mode with more than the default single
      // panel lost everything but that one panel.
      if (config.mode === 'wall' && msg.panels !== undefined && E.panelConfig.isValidPanels(msg.panels)) {
        config.panels = msg.panels;
      }
      core.resize(config.size);
      if (config.mode === 'wall') core.initWall(config.panels, config.size);
    } else if (msg.cmd === 'setPhysicalCubePanels') {
      if (E.panelConfig.isValidPhysicalCubePanels(msg.value)) config.physicalCubePanels = msg.value;
    } else if (msg.cmd === 'addPanel') {
      if (config.panels.length >= E.panelConfig.WALL_MAX_COLS * E.panelConfig.WALL_MAX_ROWS) return;
      const occupied = new Set(config.panels.map((p) => p.gx + ',' + p.gy));
      outer: for (let gy = 0; gy < E.panelConfig.WALL_MAX_ROWS; gy++) {
        for (let gx = 0; gx < E.panelConfig.WALL_MAX_COLS; gx++) {
          if (!occupied.has(gx + ',' + gy)) { config.panels.push({ gx, gy }); break outer; }
        }
      }
      config.mode = 'wall';
      core.initWall(config.panels, config.size);
    } else if (msg.cmd === 'removePanel') {
      config.panels = config.panels.filter((p) => !(p.gx === msg.gx && p.gy === msg.gy));
      if (!config.panels.length) config.panels = [{ gx: 0, gy: 0 }];
      core.initWall(config.panels, config.size);
    } else if (msg.cmd === 'setPanelPositions') {
      if (E.panelConfig.isValidPanels(msg.panels)) {
        config.panels = msg.panels;
        core.initWall(config.panels, config.size);
      }
    }
    emitText(stateMsg());
  }

  // ── Frame encoding - byte-identical to wsServer.js's maybeStreamFrame/
  // _streamWallFrames, just Uint8Array instead of Node's Buffer. ─────────
  function encodeCubeFrames() {
    const SIZE = core.SIZE;
    const faceCount = config.mode === '2d' ? 1 : 6;
    for (let face = 0; face < faceCount; face++) {
      const faceMap = core.faceMap[face];
      const buf = new Uint8Array(1 + SIZE * SIZE * 3);
      buf[0] = face;
      const colBuf = core.colBuf;
      for (let v = 0; v < SIZE; v++) {
        for (let u = 0; u < SIZE; u++) {
          const led = faceMap[v * SIZE + u];
          const o = 1 + (v * SIZE + u) * 3;
          if (led < 0) continue;
          const c = led * 3;
          buf[o] = Math.max(0, Math.min(255, (colBuf[c] * state.brightness * 255) | 0));
          buf[o + 1] = Math.max(0, Math.min(255, (colBuf[c + 1] * state.brightness * 255) | 0));
          buf[o + 2] = Math.max(0, Math.min(255, (colBuf[c + 2] * state.brightness * 255) | 0));
        }
      }
      emitFrame(buf.buffer);
    }
  }
  function encodeWallFrames() {
    if (!core.wallBuf) return;
    const S = core.wallPanelSize, wallW = core.wallW, wallBuf = core.wallBuf;
    config.panels.forEach((p, idx) => {
      const buf = new Uint8Array(1 + S * S * 3);
      buf[0] = idx;
      const ox = p.gx * S, oy = p.gy * S;
      for (let v = 0; v < S; v++) {
        for (let u = 0; u < S; u++) {
          const c = ((oy + v) * wallW + (ox + u)) * 3;
          const o = 1 + (v * S + u) * 3;
          buf[o] = Math.max(0, Math.min(255, (wallBuf[c] * state.brightness * 255) | 0));
          buf[o + 1] = Math.max(0, Math.min(255, (wallBuf[c + 1] * state.brightness * 255) | 0));
          buf[o + 2] = Math.max(0, Math.min(255, (wallBuf[c + 2] * state.brightness * 255) | 0));
        }
      }
      emitFrame(buf.buffer);
    });
  }

  let lastMs = null, lastFrameMs = 0;
  function loop() {
    const now = Date.now();
    const dt = Math.min(0.1, (lastMs ? (now - lastMs) / 1000 : 1 / TICK_HZ)) * state.speed;
    lastMs = now;
    core.t = (core.t || 0);
    E.tick(core, state, config, E.EFFECTS, E.WALL_EFFECTS, E.alarms, E.runOverlays, dt);
    if (now - lastFrameMs >= 1000 / PREVIEW_FPS) {
      lastFrameMs = now;
      if (config.mode === 'wall') encodeWallFrames(); else encodeCubeFrames();
    }
  }

  window.__simLoopback = {
    send(obj) { applyCommand(obj); },
    onText(cb) { listeners.text.push(cb); },
    onFrame(cb) { listeners.frame.push(cb); },
    // Fired once immediately by app.js in place of the real WS's open
    // "state" push, so the UI populates without waiting for a command.
    initialState: stateMsg,
    // Not auto-started - app.js calls this only after initScene() has run
    // (see connect()'s module comment: emitting a frame before the 3D
    // scene/2D canvas context exists throws, a real WebSocket's inherent
    // async delivery never raced this before).
    start() { setInterval(loop, 1000 / TICK_HZ); },
  };
})();
