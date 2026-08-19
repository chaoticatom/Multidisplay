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
// overlays, brightness/speed, panel mode/size/layout, the Timer system,
// the Face Editor / Custom Cube save-load-delete library (in-memory only -
// resets on refresh, unlike the real Pi's on-disk customCubeConfig.json).
// What's NOT available here (no server, no hardware, nothing to fake
// usefully): Bluetooth pairing, WiFi setup, video upload/webcam/screen
// share, Unsplash API key persistence. Those panels are left visually
// present but inert - see wireSimUnsupported() in app.js's own sim-mode
// branch, same "grey out, don't hide" precedent this app already uses for
// not-yet-wired features.
(function () {
  const E = window.PiEngine;
  const TICK_HZ = 30;
  const PREVIEW_FPS = 20;

  const config = { ...E.panelConfig.DEFAULT_CONFIG, panels: [...E.panelConfig.DEFAULT_CONFIG.panels] };
  const core = new E.CubeCore(config.size);
  if (config.mode === 'wall') core.initWall(config.panels, config.size);

  // Weather's last-picked city is the one bit of state this simulator
  // persists across a browser refresh - a real report ("weather should
  // remember last city even after a browser refresh"). Everything else in
  // `state` really does reset every load (this is a from-scratch in-memory
  // fake server, not the real Pi's wsServer.js backed by weatherConfig.js's
  // on-disk JSON file), but a blank localStorage read/write is cheap and
  // matches what a user coming from the real backend would expect.
  const LS_WEATHER_CITY_KEY = 'multidisplay-weather-city';
  let savedCity = '';
  try { savedCity = localStorage.getItem(LS_WEATHER_CITY_KEY) || ''; } catch (err) { /* localStorage unavailable (private mode etc) - just fall back to '' */ }

  const state = {
    effect: 'wave', brightness: 1.0, speed: 1.0,
    overlays: JSON.parse(JSON.stringify(E.OV_DEFAULTS)),
    alarms: [], activeAlarm: null,
    customCube: { faces: E.customCubeConfig.DEFAULT_CONFIG.faces.slice(), library: [] },
    unsplashConfig: { apiKey: '', query: 'nature' },
    nasaConfig: { apiKey: '' },
    effectOptions: { weather: { city: savedCity } },
    blank: false,
    identifyPanels: false,
    wallLayouts: [],
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
      customCube: state.customCube, unsplashConfig: state.unsplashConfig, nasaConfig: state.nasaConfig,
      effectOptions: state.effectOptions, effectStatus: state.effectStatus, blank: state.blank,
      identifyPanels: !!state.identifyPanels,
      wallLayouts: state.wallLayouts || [],
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
    } else if (msg.cmd === 'setIdentifyPanels') {
      state.identifyPanels = !!msg.enabled;
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
      if (msg.effect === 'weather' && msg.key === 'city' && typeof msg.value === 'string') {
        try { localStorage.setItem(LS_WEATHER_CITY_KEY, msg.value); } catch (err) { /* ignore */ }
      }
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
    } else if (msg.cmd === 'setNasaConfig') {
      if (typeof msg.apiKey !== 'string') return;
      state.nasaConfig = { apiKey: msg.apiKey.trim() };
    } else if (msg.cmd === 'setPhysicalCubePanels') {
      if (E.panelConfig.isValidPhysicalCubePanels(msg.value)) config.physicalCubePanels = msg.value;
    } else if (msg.cmd === 'addPanel') {
      if (config.panels.length >= E.panelConfig.WALL_MAX_PANELS) return;
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
    } else if (msg.cmd === 'radioPlay') {
      // Delegates to the SAME bundled radio effect module (E.EFFECTS.radio -
      // literally src/effects/radio.js, run through esbuild like everything
      // else here) wsServer.js's real handler calls - a real report ("radio
      // browse and search not working"): this command (and radioStop/
      // radioSearch below) previously wasn't handled here AT ALL, silently
      // no-op'd by the same "anything not listed just falls through" catch-
      // all this function's own module comment describes for genuinely
      // hardware-only commands - radio search/play are NOT hardware-only
      // (search is a plain fetch, play is just state - see
      // ffmpegAudio.js's own "playback failure doesn't break decode/FFT"
      // design, already covered by test/radio.test.js's "ffmpeg missing"
      // case), so there was no reason for them to be unsupported here.
      if (!msg.station || typeof msg.station.url !== 'string' || !msg.station.url) return;
      E.EFFECTS.radio.playStation({ name: msg.station.name, genre: msg.station.genre, url: msg.station.url });
      refreshRadioStatus();
    } else if (msg.cmd === 'radioStop') {
      E.EFFECTS.radio.stopStation();
      refreshRadioStatus();
    } else if (msg.cmd === 'radioSearch') {
      // Async, like wsServer.js's own handler - emits its own follow-up
      // state message once the fetch resolves rather than relying on this
      // function's trailing synchronous emitText() below (which would fire
      // before results are in and send stale/empty search state).
      const query = typeof msg.query === 'string' ? msg.query : '';
      E.EFFECTS.radio.search(query).then(() => { refreshRadioStatus(); emitText(stateMsg()); }).catch(() => {});
    } else if (msg.cmd === 'addAlarm') {
      const al = sanitizeAlarm(msg.alarm, crypto.randomUUID());
      if (!al) return;
      if (!state.alarms) state.alarms = [];
      state.alarms.push(al);
    } else if (msg.cmd === 'updateAlarm') {
      if (typeof msg.id !== 'string' || !state.alarms) return;
      const idx = state.alarms.findIndex((a) => a.id === msg.id);
      if (idx < 0) return;
      const al = sanitizeAlarm(msg.alarm, msg.id);
      if (!al) return;
      state.alarms[idx] = al;
      if (state.activeAlarm && state.activeAlarm.al.id === msg.id) state.activeAlarm = null;
    } else if (msg.cmd === 'deleteAlarm') {
      if (typeof msg.id !== 'string' || !state.alarms) return;
      const before = state.alarms.length;
      state.alarms = state.alarms.filter((a) => a.id !== msg.id);
      if (state.alarms.length === before) return;
      if (state.activeAlarm && state.activeAlarm.al.id === msg.id) state.activeAlarm = null;
    } else if (msg.cmd === 'setAlarmEnabled') {
      if (typeof msg.id !== 'string' || !state.alarms) return;
      const al = state.alarms.find((a) => a.id === msg.id);
      if (!al) return;
      al.enabled = !!msg.enabled;
      if (!al.enabled && state.activeAlarm && state.activeAlarm.al.id === msg.id) state.activeAlarm = null;
    } else if (msg.cmd === 'dismissAlarm') {
      E.alarms.dismissActive(state);
    } else if (msg.cmd === 'setFaceEffect') {
      // Mirrors wsServer.js's setFaceEffect/setFaceOpts/setFaceOverlays/
      // saveCube/loadCube/deleteCube/clearFaces handlers exactly. Custom
      // Cube save/load was previously NOT implemented here at all (this
      // file's own module comment used to list it as an intentionally
      // out-of-scope, hardware/persistence-only feature) - but the Face
      // Editor panel itself was never gated to match (app.js's
      // greyOutUnsupported() only lists it as unsupported on the real Pi's
      // missing panels, not the simulator's), so every Face Editor control
      // silently no-op'd in the browser simulator while looking fully
      // live. Since none of this actually needs hardware or disk
      // persistence beyond what state.customCube already holds in memory
      // for the running Custom Cube effect, implementing it here (rather
      // than just greying the UI out) is the more useful fix.
      if (!state.customCube) return;
      const face = Number(msg.face);
      if (!Number.isInteger(face) || face < 0 || face > 5) return;
      if (msg.effect === null || msg.effect === undefined || msg.effect === 'none') {
        state.customCube.faces[face] = null;
      } else {
        if (typeof msg.effect !== 'string' || msg.effect === 'custom_cube' || (!E.EFFECTS[msg.effect] && !E.WALL_EFFECTS[msg.effect])) return;
        const existing = state.customCube.faces[face];
        const keepOpts = existing && existing.effect === msg.effect;
        state.customCube.faces[face] = {
          effect: msg.effect,
          overlayKeys: existing ? [...existing.overlayKeys] : [],
          opts: keepOpts ? { ...existing.opts } : {},
        };
      }
    } else if (msg.cmd === 'setFaceOpts') {
      if (!state.customCube) return;
      const face = Number(msg.face);
      if (!Number.isInteger(face) || face < 0 || face > 5) return;
      const cfg = state.customCube.faces[face];
      if (!cfg || !msg.opts || typeof msg.opts !== 'object' || Array.isArray(msg.opts)) return;
      cfg.opts = { ...msg.opts };
    } else if (msg.cmd === 'setFaceOverlays') {
      if (!state.customCube) return;
      const face = Number(msg.face);
      if (!Number.isInteger(face) || face < 0 || face > 5) return;
      const cfg = state.customCube.faces[face];
      if (!cfg || !Array.isArray(msg.overlayKeys)) return;
      if (msg.overlayKeys.some((k) => typeof k !== 'string' || !E.OVERLAY_KEYS.includes(k))) return;
      cfg.overlayKeys = [...msg.overlayKeys];
    } else if (msg.cmd === 'saveCube') {
      if (!state.customCube) return;
      if (typeof msg.name !== 'string' || !msg.name.trim()) return;
      const name = msg.name.trim();
      const snapshot = {
        name,
        faces: state.customCube.faces.map((f) => (f ? { effect: f.effect, overlayKeys: [...f.overlayKeys], opts: { ...f.opts } } : null)),
      };
      const idx = state.customCube.library.findIndex((c) => c.name === name);
      if (idx >= 0) state.customCube.library[idx] = snapshot;
      else state.customCube.library.push(snapshot);
    } else if (msg.cmd === 'loadCube') {
      if (!state.customCube) return;
      const idx = Number(msg.index);
      if (!Number.isInteger(idx)) return;
      const entry = state.customCube.library[idx];
      if (!entry) return;
      state.customCube.faces = entry.faces.map((f) => (f ? { effect: f.effect, overlayKeys: [...f.overlayKeys], opts: { ...f.opts } } : null));
    } else if (msg.cmd === 'deleteCube') {
      if (!state.customCube) return;
      const idx = Number(msg.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.customCube.library.length) return;
      state.customCube.library.splice(idx, 1);
    } else if (msg.cmd === 'clearFaces') {
      if (!state.customCube) return;
      state.customCube.faces = [null, null, null, null, null, null];
    } else if (msg.cmd === 'saveWallLayout') {
      // Mirrors wsServer.js's saveWallLayout/loadWallLayout/deleteWallLayout
      // exactly - named library of PHYSICAL panel-grid arrangements, not
      // simulated here previously (same "no sim-loopback.js handler at all"
      // gap already found/fixed for Timers and the Face Editor above).
      if (!Array.isArray(state.wallLayouts)) return;
      if (typeof msg.name !== 'string' || !msg.name.trim()) return;
      if (!E.panelConfig.isValidPanels(config.panels)) return;
      const name = msg.name.trim();
      const snapshot = { name, panels: config.panels.map((p) => ({ gx: p.gx, gy: p.gy })) };
      const idx = state.wallLayouts.findIndex((l) => l.name === name);
      if (idx >= 0) state.wallLayouts[idx] = snapshot;
      else state.wallLayouts.push(snapshot);
    } else if (msg.cmd === 'loadWallLayout') {
      if (!Array.isArray(state.wallLayouts)) return;
      const idx = Number(msg.index);
      if (!Number.isInteger(idx)) return;
      const entry = state.wallLayouts[idx];
      if (!entry || !E.panelConfig.isValidPanels(entry.panels)) return;
      config.mode = 'wall';
      config.panels = entry.panels.map((p) => ({ gx: p.gx, gy: p.gy }));
      core.initWall(config.panels, config.size);
    } else if (msg.cmd === 'deleteWallLayout') {
      if (!Array.isArray(state.wallLayouts)) return;
      const idx = Number(msg.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.wallLayouts.length) return;
      state.wallLayouts.splice(idx, 1);
    }
    emitText(stateMsg());
  }

  // Mirrors wsServer.js's _sanitizeAlarm() exactly - structural validation
  // only, matching that file's "each reads its own params defensively"
  // posture. addAlarm/updateAlarm/deleteAlarm/setAlarmEnabled were entirely
  // missing here before (a real report, "timer save button does not
  // work" - same bug class as the earlier radioPlay/radioStop/radioSearch
  // gap this file's own module comment documents above): the Timers panel
  // sends these commands and app.js closes the editor modal unconditionally
  // on send, so with no handler here the "save" silently no-op'd and the
  // modal just closed as if it worked.
  function sanitizeAlarm(raw, id) {
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
      overlayKeys: Array.isArray(raw.overlayKeys) ? raw.overlayKeys.filter((k) => E.OVERLAY_KEYS.includes(k)) : [],
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
        wdOverlayKeys: Array.isArray(raw.prealarm.wdOverlayKeys) ? raw.prealarm.wdOverlayKeys.filter((k) => E.OVERLAY_KEYS.includes(k)) : [],
      } : {},
    };
    if (!Number.isInteger(al.hour)) al.hour = 0;
    if (!Number.isInteger(al.minute)) al.minute = 0;
    if (!E.isValidAlarm(al)) return null;
    return al;
  }

  function refreshRadioStatus() {
    if (!state.effectStatus) state.effectStatus = {};
    state.effectStatus.radio = E.EFFECTS.radio.getStatus();
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
          // Plain row-major, no flip - a whole-canvas vertical flip was
          // tried here to fix orientation-sensitive effects like
          // weatherWall.js, but it turned out to be wrong: flipping which
          // wallBuf ROW a panel's output sources from also silently
          // changes WHICH OCCUPIED CELL it reads from whenever the layout
          // isn't symmetric about the vertical midline (confirmed: an
          // L-shaped layout read two of its panels from an unoccupied
          // (always-black) gap cell instead of their own data). The
          // correct fix belongs in the AFFECTED EFFECTS' own vertical
          // convention (see weatherWall.js), not here - this must stay a
          // pure, position-preserving slice.
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
