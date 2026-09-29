// WebSocket command handlers, one method per `cmd` - formerly a single
// ~400-line if/else chain inside WsServer._handleMessage(). Each handler is
// called with `this` bound to the WsServer instance (so `this.state`,
// `this._broadcast()` etc. work exactly as before), plus the client socket
// and the parsed message. To add a command, add a method here.
'use strict';

const path = require('path');
const crypto = require('crypto');
const { EFFECTS, WALL_EFFECTS } = require('./effects');
const { OVERLAY_KEYS } = require('./effects/overlays');
const panelConfig = require('./panelConfig');
const unsplashConfig = require('./unsplashConfig');
const nasaConfig = require('./nasaConfig');
const weatherConfig = require('./weatherConfig');
const wallLayoutConfig = require('./wallLayoutConfig');
const bluetooth = require('./bluetooth');
const alarmsEngine = require('./effects/alarms');
const radio = require('./effects/radio');
const { browserFrameSource } = require('./effects/video/browserFrameSource');
const pinConfig = require('./pinConfig');

const COMMANDS = {
  // Sets (or, with an empty pin, clears) the control PIN. Only reachable by
  // an already-authenticated client. Everyone else connected stays
  // connected; new connections will need the PIN.
  setControlPin(ws, msg) {
    try {
      this.pinCfg = pinConfig.setPin(msg.pin || '');
      ws.send(JSON.stringify({ cmd: 'controlPinResult', ok: true, set: pinConfig.isPinSet(this.pinCfg) }));
    } catch (err) {
      ws.send(JSON.stringify({ cmd: 'controlPinResult', ok: false, error: err.message }));
    }
    this._broadcast(this._stateMsg());
  },

  setEffect(ws, msg) {
    if (!(EFFECTS[msg.effect])) return;
    this.state.effect = msg.effect;
    this.state.blank = false; // selecting a new effect always un-blanks - see "clearAll" below
    this._broadcast(this._stateMsg());
  },

  clearAll(ws, msg) {
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
  },

  setIdentifyPanels(ws, msg) {
    // "Identify Panels" - a wiring-calibration toggle, not an effect (see
    // tick.js/identify.js). Labels each physical panel with its own
    // identity (face name or wall index, plus which HAT/Active-3 output
    // and chain position it's wired to) so a real multi-panel install can
    // be wired up correctly without trial-and-error solid-color testing.
    this.state.identifyPanels = !!msg.enabled;
    this._broadcast(this._stateMsg());
  },

  setBrightness(ws, msg) {
    const v = Number(msg.value);
    if (Number.isFinite(v)) this.state.brightness = Math.max(0, Math.min(1.5, v));
  },

  setSpeed(ws, msg) {
    const v = Number(msg.value);
    if (Number.isFinite(v)) this.state.speed = Math.max(0, Math.min(8, v));
  },

  setEffectOption(ws, msg) {
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
    // Weather's city is the one effect option persisted across a restart
    // (see weatherConfig.js's module comment for the real report this
    // fixes - it always reverted to London otherwise) - everything else
    // in effectOptions is deliberately in-memory-only, matching how the
    // rest of this generic store already worked.
    if (msg.effect === 'weather' && msg.key === 'city' && typeof msg.value === 'string') {
      weatherConfig.save({ city: msg.value });
    }
    this._broadcast(this._stateMsg());
  },

  stopVideoSource(ws, msg) {
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
    if (this.effectCommandRelay) {
      this.effectCommandRelay('videoStop', {});
    } else {
      if (typeof EFFECTS.video?.stop === 'function') EFFECTS.video.stop();
      if (typeof WALL_EFFECTS.video?.stop === 'function') WALL_EFFECTS.video.stop();
      browserFrameSource.clear();
    }
  },

  setPanelConfig(ws, msg) {
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
  },

  addPanel(ws, msg) {
    // Adds a panel at the first free cell (row-major) in the wall grid,
    // switching to wall mode if not already in it - this is the "+"
    // button's command. No-ops (rather than erroring) once
    // WALL_MAX_PANELS is reached - checked explicitly by count, NOT by
    // running out of free cells within the WALL_MAX_COLS x
    // WALL_MAX_ROWS scan bounds, since those bounds are now much more
    // generous than the real panel budget (they allow any 1-wide/
    // 1-tall row/column shape up to WALL_MAX_PANELS long, not just a
    // fixed 2x3 block) - relying on "no free cell left in the scan"
    // would incorrectly allow far more than WALL_MAX_PANELS panels.
    const panels = this.config.mode === 'wall' ? this.config.panels.slice() : [{ gx: 0, gy: 0 }];
    if (panels.length >= panelConfig.WALL_MAX_PANELS) return;
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
  },

  removePanel(ws, msg) {
    // Removes by grid position (what the drag UI knows, not array index,
    // since positions are what's rendered) - keeps at least 1 panel.
    if (this.config.mode !== 'wall' || this.config.panels.length <= 1) return;
    const panels = this.config.panels.filter((p) => !(p.gx === msg.gx && p.gy === msg.gy));
    if (panels.length === this.config.panels.length) return; // no matching panel
    this.config.panels = panels;
    panelConfig.save(this.config);
    if (this.onConfigChange) this.onConfigChange(this.config);
    this._broadcast(this._stateMsg());
  },

  setPanelPositions(ws, msg) {
    // Drag-to-rearrange result: a full replacement panels array. Validated
    // the same way as everywhere else a layout can enter config (see
    // panelConfig.isValidPanels) so a malformed drag can never reach
    // core.initWall()/the driver.
    if (this.config.mode !== 'wall' || !panelConfig.isValidPanels(msg.panels)) return;
    this.config.panels = msg.panels;
    panelConfig.save(this.config);
    if (this.onConfigChange) this.onConfigChange(this.config);
    this._broadcast(this._stateMsg());
  },

  setOverlay(ws, msg) {
    if (typeof msg.key !== 'string' || !OVERLAY_KEYS.includes(msg.key)) return;
    if (!this.state.overlays || !this.state.overlays[msg.key]) return;
    this.state.overlays[msg.key].on = !!msg.enabled;
    this._broadcast(this._stateMsg());
  },

  setOverlayOption(ws, msg) {
    // Same "untyped, each overlay reads its own params defensively"
    // spirit as setEffectOption above - `key` is validated against the
    // real overlay list, `option`/`value` are not further checked here.
    if (typeof msg.key !== 'string' || !OVERLAY_KEYS.includes(msg.key)) return;
    if (typeof msg.option !== 'string') return;
    if (!this.state.overlays || !this.state.overlays[msg.key]) return;
    this.state.overlays[msg.key][msg.option] = msg.value;
    this._broadcast(this._stateMsg());
  },

  setOverlayGlobalBright(ws, msg) {
    const v = Number(msg.value);
    if (!Number.isFinite(v) || !this.state.overlays) return;
    this.state.overlays.globalBright = Math.max(0, Math.min(1, v));
    this._broadcast(this._stateMsg());
  },

  addAlarm(ws, msg) {
    const al = this._sanitizeAlarm(msg.alarm, crypto.randomUUID());
    if (!al) return;
    if (!this.state.alarms) this.state.alarms = [];
    this.state.alarms.push(al);
    this._persistAlarms();
  },

  updateAlarm(ws, msg) {
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
  },

  deleteAlarm(ws, msg) {
    if (typeof msg.id !== 'string' || !this.state.alarms) return;
    const before = this.state.alarms.length;
    this.state.alarms = this.state.alarms.filter((a) => a.id !== msg.id);
    if (this.state.alarms.length === before) return; // no matching alarm
    if (this.state.activeAlarm && this.state.activeAlarm.al.id === msg.id) this.state.activeAlarm = null;
    this._persistAlarms();
  },

  setAlarmEnabled(ws, msg) {
    if (typeof msg.id !== 'string' || !this.state.alarms) return;
    const al = this.state.alarms.find((a) => a.id === msg.id);
    if (!al) return;
    al.enabled = !!msg.enabled;
    if (!al.enabled && this.state.activeAlarm && this.state.activeAlarm.al.id === msg.id) this.state.activeAlarm = null;
    this._persistAlarms();
  },

  dismissAlarm(ws, msg) {
    alarmsEngine.dismissActive(this.state);
    this._broadcast(this._stateMsg());
  },

  setFaceEffect(ws, msg) {
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
  },

  setFaceOpts(ws, msg) {
    if (!this.state.customCube) return;
    const face = Number(msg.face);
    if (!Number.isInteger(face) || face < 0 || face > 5) return;
    const cfg = this.state.customCube.faces[face];
    if (!cfg || !msg.opts || typeof msg.opts !== 'object' || Array.isArray(msg.opts)) return;
    cfg.opts = { ...msg.opts };
    this._persistCustomCube();
  },

  setFaceOverlays(ws, msg) {
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
  },

  saveCube(ws, msg) {
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
  },

  loadCube(ws, msg) {
    if (!this.state.customCube) return;
    const idx = Number(msg.index);
    if (!Number.isInteger(idx)) return;
    const entry = this.state.customCube.library[idx];
    if (!entry) return;
    this.state.customCube.faces = entry.faces.map((f) => (f ? { effect: f.effect, overlayKeys: [...f.overlayKeys], opts: { ...f.opts } } : null));
    this._persistCustomCube();
  },

  deleteCube(ws, msg) {
    if (!this.state.customCube) return;
    const idx = Number(msg.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.state.customCube.library.length) return;
    this.state.customCube.library.splice(idx, 1);
    this._persistCustomCube();
  },

  clearFaces(ws, msg) {
    if (!this.state.customCube) return;
    this.state.customCube.faces = [null, null, null, null, null, null];
    this._persistCustomCube();
  },

  saveWallLayout(ws, msg) {
    // Named library of PHYSICAL panel-grid arrangements (config.panels),
    // distinct from saveCube's per-face EFFECT assignments above - see
    // wallLayoutConfig.js's module comment. Saves whatever the wall
    // layout editor (wireWallToolbar() in app.js) currently has placed,
    // regardless of which effect/mode is active.
    if (!Array.isArray(this.state.wallLayouts)) return;
    if (typeof msg.name !== 'string' || !msg.name.trim()) return;
    if (!panelConfig.isValidPanels(this.config.panels)) return; // nothing placed yet
    const name = msg.name.trim();
    const snapshot = { name, panels: this.config.panels.map((p) => ({ gx: p.gx, gy: p.gy })) };
    const idx = this.state.wallLayouts.findIndex((l) => l.name === name);
    if (idx >= 0) this.state.wallLayouts[idx] = snapshot;
    else this.state.wallLayouts.push(snapshot);
    this._persistWallLayouts();
  },

  loadWallLayout(ws, msg) {
    if (!Array.isArray(this.state.wallLayouts)) return;
    const idx = Number(msg.index);
    if (!Number.isInteger(idx)) return;
    const entry = this.state.wallLayouts[idx];
    if (!entry || !panelConfig.isValidPanels(entry.panels)) return;
    this.config.mode = 'wall';
    this.config.panels = entry.panels.map((p) => ({ gx: p.gx, gy: p.gy }));
    panelConfig.save(this.config);
    if (this.onConfigChange) this.onConfigChange(this.config);
    this._broadcast(this._stateMsg());
  },

  deleteWallLayout(ws, msg) {
    if (!Array.isArray(this.state.wallLayouts)) return;
    const idx = Number(msg.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.state.wallLayouts.length) return;
    this.state.wallLayouts.splice(idx, 1);
    this._persistWallLayouts();
  },

  btScan(ws, msg) {
    this._replyBt(ws, 'btScanResult', async () => ({ devices: await bluetooth.scanDevices() }));
  },

  btPair(ws, msg) {
    // A real report: "says it's pairing but nothing ever happens" -
    // pairDevice() resolves its OWN {ok, log} (pairing succeeded/failed),
    // which _replyBt's `{ ok: true, ...result }` spread let clobber the
    // wrapper's own `ok:true` whenever pairing itself failed (but didn't
    // throw) - collapsing "the pair attempt failed" into the exact same
    // shape as "the request itself errored", with no `error` field for
    // app.js's generic `if (!msg.ok)` fallback to show. Renamed to
    // `paired` so it can never collide with the wrapper's `ok`.
    this._replyBt(ws, 'btPairResult', async () => {
      const r = await bluetooth.pairDevice(msg.mac);
      return { paired: r.ok, log: r.log };
    });
  },

  btStatus(ws, msg) {
    this._replyBt(ws, 'btStatusResult', async () => ({ devices: await bluetooth.listPaired() }));
  },

  btSetOutput(ws, msg) {
    // A real request: "an option to pass the audio to the BT device,
    // like the audio-output picker on desktop does" - re-select which
    // ALREADY-PAIRED/connected device gets the Pi's audio at any time,
    // not just automatically at the moment it was first paired.
    if (typeof msg.mac !== 'string') return;
    this._replyBt(ws, 'btSetOutputResult', () => bluetooth.setAsAudioOutput(msg.mac));
  },

  btForget(ws, msg) {
    // A real report: "why does it think I have paired 5 devices?" - lets
    // stale pairings (including ones from testing/debugging) be removed
    // from the control page instead of only via SSH.
    if (typeof msg.mac !== 'string') return;
    this._replyBt(ws, 'btForgetResult', async () => {
      const r = await bluetooth.forgetDevice(msg.mac);
      return { forgot: r.ok, log: r.log };
    });
  },

  btDiscoverable(ws, msg) {
    this._replyBt(ws, 'btDiscoverableResult', () => bluetooth.makeDiscoverable());
  },

  btRoutePhoneAudio(ws, msg) {
    this._replyBt(ws, 'btRoutePhoneAudioResult', () => bluetooth.routePhoneAudio());
  },

  radioPlay(ws, msg) {
    if (!msg.station || typeof msg.station.url !== 'string' || !msg.station.url) return;
    const station = { name: msg.station.name, genre: msg.station.genre, url: msg.station.url };
    if (this.effectCommandRelay) this.effectCommandRelay('radioPlay', { station });
    else radio.playStation(station);
    this._refreshRadioStatus();
    this._broadcast(this._stateMsg());
  },

  radioStop(ws, msg) {
    if (this.effectCommandRelay) this.effectCommandRelay('radioStop', {});
    else radio.stopStation();
    this._refreshRadioStatus();
    this._broadcast(this._stateMsg());
  },

  radioDebugTone(ws, msg) {
    // Debug-mode controls ("Sweep Test"/"Drum Test" buttons, and a
    // frequency slider for a steady single-tone 'kind') for verifying the
    // spectrum analyser without a real stream - see radio.js's
    // DEBUG_TONES/playDebugTone() for the actual tone generation.
    if (msg.kind !== 'sweep' && msg.kind !== 'drum' && msg.kind !== 'tone') return;
    const payload = { kind: msg.kind, freq: msg.freq };
    if (this.effectCommandRelay) this.effectCommandRelay('radioDebugTone', payload);
    else radio.playDebugTone(payload.kind, payload.freq);
    this._refreshRadioStatus();
    this._broadcast(this._stateMsg());
  },

  stopAllSound(ws, msg) {
    // The sidebar's "Stop Sound" button, next to Clear All - a real
    // request: internet radio keeps playing in the background regardless
    // of which effect is selected/displayed (see radio.js's module
    // comment), so Clear All blanking the display doesn't stop audio -
    // there was no single button to kill sound without hunting for the
    // Radio panel and hitting stop there. Radio is the only long-running
    // background audio source in this codebase (video has no audio
    // playback) - same relay-aware stop as the 'radioStop' handler above,
    // just reachable from anywhere in the UI.
    if (this.effectCommandRelay) this.effectCommandRelay('radioStop', {});
    else radio.stopStation();
    this._refreshRadioStatus();
    this._broadcast(this._stateMsg());
  },

  setUnsplashConfig(ws, msg) {
    // Persists the Unsplash Access Key + default search query - see
    // unsplashConfig.js's module comment for why this is a dedicated
    // small JSON file rather than the generic setEffectOption store: the
    // key needs to survive a restart the same way alarms/customCube do,
    // which setEffectOption's in-memory-only state.effectOptions does not.
    if (typeof msg.apiKey !== 'string' || typeof msg.query !== 'string') return;
    this.state.unsplashConfig = { apiKey: msg.apiKey.trim(), query: msg.query.trim() || 'nature' };
    unsplashConfig.save(this.state.unsplashConfig);
    this._broadcast(this._stateMsg());
  },

  setNasaConfig(ws, msg) {
    // Persists the shared NASA API key (APOD/EPIC/NEO all read this via
    // nasaConfig.currentKey()) - a real request: "enable the NASA apod
    // API field. I have the api to enter." Same dedicated-small-file
    // shape as setUnsplashConfig above, for the same reason (needs to
    // survive a restart).
    if (typeof msg.apiKey !== 'string') return;
    this.state.nasaConfig = { apiKey: msg.apiKey.trim() };
    nasaConfig.save(this.state.nasaConfig);
    this._broadcast(this._stateMsg());
  },

  radioSearch(ws, msg) {
    const query = typeof msg.query === 'string' ? msg.query : '';
    if (this.effectCommandRelay) {
      // Fire-and-forget here too - the worker's own per-tick frame reply
      // already includes fresh radio status unconditionally (see
      // renderWorker.js), so results surface within one tick interval
      // without needing an explicit async reply/rebroadcast round trip.
      this.effectCommandRelay('radioSearch', { query });
    } else {
      radio.search(query).then(() => { this._refreshRadioStatus(); this._broadcast(this._stateMsg()); }).catch((err) => console.warn('[radio] search failed:', err.message));
    }
  },
};

module.exports = { COMMANDS };
