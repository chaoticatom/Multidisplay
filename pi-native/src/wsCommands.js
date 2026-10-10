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
const btConfig = require('./btConfig');
const BAD_OPTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const { atomicWriteJson } = require('./atomicWrite');
function readDrawings() { try { const j = JSON.parse(require('fs').readFileSync(EFFECTS.draw.FILE, 'utf8')); return Array.isArray(j) ? j : []; } catch (e) { return []; } }
const alarmsEngine = require('./effects/alarms');
const radio = require('./effects/radio');
const { browserFrameSource } = require('./effects/video/browserFrameSource');
const pinConfig = require('./pinConfig');
const scenes = require('./scenes');
const ai = require('./ai');
const aiConfig = require('./aiConfig');
const prefs = require('./prefs');
const httpApi = require('./httpApi');
const youtube = require('./youtube');
const { spawn } = require('child_process');

const COMMANDS = {
  // Sets (or, with an empty pin, clears) the control PIN. Only reachable by
  // an already-authenticated client. Everyone else connected stays
  // connected; new connections will need the PIN.
  // "React to music" (see effects/audioFeatures.js): {on?, amount? 0..1}.
  setMusicReact(ws, msg) {
    const cur = this.state.musicReact || { on: false, amount: 0.6 };
    const amount = Number.isFinite(Number(msg.amount)) ? Math.max(0, Math.min(1, Number(msg.amount))) : cur.amount;
    this.state.musicReact = { on: msg.on === undefined ? cur.on : !!msg.on, amount, perEffect: cur.perEffect || {} };
    this._broadcast(this._stateMsg());
  },

  // Scenes (see ../scenes.js): save the current display under a name,
  // recall one, or delete one.
  saveScene(ws, msg) {
    const name = typeof msg.name === 'string' ? msg.name.trim().slice(0, 40) : '';
    if (!name) return;
    const list = (this.state.scenes || []).filter((sc) => sc.name !== name);
    if (list.length >= scenes.MAX_SCENES) return;
    list.push(scenes.capture(this.state, name));
    this.state.scenes = list;
    scenes.save(list);
    this._broadcast(this._stateMsg());
  },

  applyScene(ws, msg) {
    const scene = (this.state.scenes || []).find((sc) => sc.name === msg.name);
    if (!scene || !EFFECTS[scene.effect]) return;
    if (this.state.effect === 'video' && scene.effect !== 'video') COMMANDS.stopVideoSource.call(this, ws, {});
    scenes.apply(this.state, scene);
    this._broadcast(this._stateMsg());
  },

  deleteScene(ws, msg) {
    const list = (this.state.scenes || []).filter((sc) => sc.name !== msg.name);
    this.state.scenes = list;
    scenes.save(list);
    this._broadcast(this._stateMsg());
  },

  // Settings > Setup buttons. Both save the session first (see
  // ../sessionState.js) so the display comes back as it was.
  // Restart just this app - systemd's Restart=on-failure brings it back
  // in a few seconds (quicker than a reboot).
  restartApp(ws) {
    if (this.saveSession) this.saveSession();
    this._broadcast({ cmd: 'systemNotice', text: 'Restarting the display app…' });
    setTimeout(() => process.exit(75), 400);
  },

  // Reboot the whole Pi (the app runs as root).
  rebootPi(ws) {
    if (this.saveSession) this.saveSession();
    this._broadcast({ cmd: 'systemNotice', text: 'Rebooting the Pi - back in about a minute…' });
    setTimeout(() => {
      const p = spawn('systemctl', ['reboot'], { stdio: 'ignore', detached: true });
      p.on('error', (err) => console.error('[app] reboot failed:', err.message));
      p.unref();
    }, 400);
  },

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
    this._playlistSince = Date.now(); // a manual pick restarts the playlist timer
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
    // Switching off stops the music too (on request); 💡 Panels off is the
    // way to darken the panels and keep listening.
    if (this.effectCommandRelay) this.effectCommandRelay('radioStop', {});
    else radio.stopStation();
    this._refreshRadioStatus();
    this._broadcast(this._stateMsg());
  },

  // {on}: turns the LED panels dark while the effect, the web preview and
  // the music all keep running.
  setPanelsOff(ws, msg) {
    this.state.panelsOff = !!msg.on;
    this._broadcast(this._stateMsg());
  },
  // {on}: this browser stops receiving preview frames (saves phone battery
  // and Pi work); per connection, nothing else changes.
  setPreviewOff(ws, msg) {
    ws.previewOff = !!msg.on;
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
    // Options are kept in the state the Pi re-sends constantly: short names,
    // no prototype keys, and small values only.
    if (!/^[A-Za-z0-9_]{1,40}$/.test(msg.key) || BAD_OPTION_KEYS.has(msg.key)) return;
    try { if (JSON.stringify(msg.value === undefined ? null : msg.value).length > 16384) return; } catch (e) { return; }
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
    Object.assign(this.config, panelConfig.normalizeFlat(this.config)); // '2d' = one-panel wall
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
    Object.assign(this.config, panelConfig.normalizeFlat(this.config));
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
    Object.assign(this.config, panelConfig.normalizeFlat(this.config));
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
    Object.assign(this.config, panelConfig.normalizeFlat(this.config));
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
    this.state.alarmCancel = Date.now(); // tells the render thread a running timer was stopped on purpose
    this._persistAlarms();
  },

  deleteAlarm(ws, msg) {
    if (typeof msg.id !== 'string' || !this.state.alarms) return;
    const before = this.state.alarms.length;
    this.state.alarms = this.state.alarms.filter((a) => a.id !== msg.id);
    if (this.state.alarms.length === before) return; // no matching alarm
    if (this.state.activeAlarm && this.state.activeAlarm.al.id === msg.id) this.state.activeAlarm = null;
    this.state.alarmCancel = Date.now(); // tells the render thread a running timer was stopped on purpose
    this._persistAlarms();
  },

  setAlarmEnabled(ws, msg) {
    if (typeof msg.id !== 'string' || !this.state.alarms) return;
    const al = this.state.alarms.find((a) => a.id === msg.id);
    if (!al) return;
    al.enabled = !!msg.enabled;
    if (!al.enabled && this.state.activeAlarm && this.state.activeAlarm.al.id === msg.id) { this.state.activeAlarm = null; this.state.alarmCancel = Date.now(); }
    this._persistAlarms();
  },

  dismissAlarm(ws, msg) {
    alarmsEngine.dismissActive(this.state);
    this.state.alarmCancel = Date.now();
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
    // lastSpeakerMac: the speaker the music should be on, so the Music tab
    // can warn when it has dropped (see app.js renderSpeakerWarning).
    this._replyBt(ws, 'btStatusResult', async () => ({ devices: await bluetooth.listPaired(), lastSpeakerMac: btConfig.load().lastSpeakerMac, range: btConfig.load().range }));
  },

  // Talking Face (src/faceTalk.js): say a line as typed, chat (the AI
  // assistant answers, if set up), or start a new topic.
  faceSay(ws, msg) { this.faceTalk.say(msg.text); },
  faceChat(ws, msg) { this.faceTalk.chat(msg.text); },
  faceTopic() { this.faceTalk.topic(); },

  // Timer list > Test: runs a copy of the timer now, shortened - a 15 s
  // sunrise or wind-down (3 s lead-in otherwise), then the timer itself with
  // a 15 s message. The saved timer is untouched.
  testAlarm(ws, msg) {
    const al = (this.state.alarms || []).find((a) => a.id === msg.id);
    if (!al) return;
    const copy = JSON.parse(JSON.stringify(al));
    copy.enabled = true;
    const longLead = !!(copy.prealarm && (copy.prealarm.enabled || copy.prealarm.windDown));
    this.state.blank = false; this.state.panelsOff = false;
    this.state.activeAlarm = { al: copy, phase: 'pre', startMs: Date.now(), preMs: longLead ? 15000 : 3000, dismissed: false, test: true, prevBright: this.state.brightness };
    this.state.alarmCancel = Date.now(); // replaces anything the render worker is running
    this._broadcast(this._stateMsg());
  },

  // Setup > Bluetooth > Range: normal (best sound) or long (steadier at a distance).
  btSetRange(ws, msg) {
    this._replyBt(ws, 'btRangeResult', () => bluetooth.setRange(msg.range));
  },

  // Music tab -> Reconnect: connect the usual speaker again and make it the output.
  btReconnect(ws, msg) {
    this._replyBt(ws, 'btReconnectResult', async () => {
      const mac = btConfig.load().lastSpeakerMac;
      if (!mac) return { set: false, log: 'No speaker has been paired yet.' };
      return bluetooth.useOutput(mac);
    });
  },

  // Synced phone playback on/off for this page (see wsServer.js sendAudio).
  audioSub(ws, msg) { ws._audio = !!msg.on; },
  // Clock sync for it: the page measures the round trip and the Pi's clock.
  clockPing(ws, msg) { if (ws.readyState === 1 && Number.isFinite(msg.c)) ws.send(JSON.stringify({ cmd: 'clockPong', c: Number(msg.c), s: Date.now() })); },

  // Setup -> Check for updates / Update now (see selfUpdate.js).
  checkUpdate(ws, msg) {
    this.updater.check().then(() => this._broadcast(this._stateMsg())).catch((err) => console.warn('[update] check failed:', err.message));
  },
  runUpdate(ws, msg) {
    this._replyBt(ws, 'updateResult', async () => {
      const r = await this.updater.update();
      this._broadcast(this._stateMsg());
      if (r.ok) {
        console.log('[update] updated - restarting');
        // Restart through systemd; if that isn't available, exit with an
        // error code so Restart=on-failure brings the new version up.
        setTimeout(() => {
          try { require('child_process').spawn('systemctl', ['restart', 'multidisplay-pi'], { detached: true, stdio: 'ignore' }).unref(); } catch (e) { /* not under systemd */ }
          setTimeout(() => process.exit(1), 5000);
        }, 1500);
      }
      return { updated: r.ok, log: r.log };
    });
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

  // Favourites (star on an effect tile): {effect}. Toggles.
  toggleFavourite(ws, msg) {
    if (!EFFECTS[msg.effect]) return;
    const p = this.state.prefs || (this.state.prefs = prefs.load());
    const i = p.favourites.indexOf(msg.effect);
    if (i >= 0) p.favourites.splice(i, 1); else p.favourites.push(msg.effect);
    this.state.prefs = prefs.save(p);
    this._broadcast(this._stateMsg());
  },

  // Favourite radio stations: {station: {name, genre, url}}. Toggles.
  toggleStationFav(ws, msg) {
    const st = msg.station;
    if (!st || typeof st.url !== 'string') return;
    const p = this.state.prefs || prefs.load();
    const list = p.stations.filter((x) => x.url !== st.url);
    if (list.length === p.stations.length) list.unshift({ name: st.name, genre: st.genre, url: st.url });
    this.state.prefs = prefs.save({ ...p, stations: list });
    this._broadcast(this._stateMsg());
  },

  // {video: {id, title, channel, duration}} adds or removes a YouTube favourite.
  toggleVideoFav(ws, msg) {
    const v = msg.video;
    if (!v || typeof v.id !== 'string') return;
    const p = this.state.prefs || prefs.load();
    const list = p.videos.filter((x) => x.id !== v.id);
    if (list.length === p.videos.length) list.unshift(v);
    this.state.prefs = prefs.save({ ...p, videos: list });
    this._broadcast(this._stateMsg());
  },

  // Party mode: {minutes, text} starts a show (fireworks with the message,
  // other lively effects in between, everything reacting to the music);
  // {minutes: 0} stops it. See _playlistTick.
  startParty(ws, msg) {
    const min = Math.max(0, Math.min(240, Number(msg.minutes) || 0));
    if (!min) { if (this.state.party) this.state.party.endsAt = 0; this._playlistTick(); this._broadcast(this._stateMsg()); return; }
    if (!this.state.party) this._beforeParty = { effect: this.state.effect, blank: !!this.state.blank, musicReact: JSON.parse(JSON.stringify(this.state.musicReact || { on: false, amount: 0.6 })) };
    this.state.party = { endsAt: Date.now() + min * 60000, text: typeof msg.text === 'string' ? msg.text.toUpperCase().slice(0, 24) : '', step: -1 };
    this._partyAt = 0;
    const fx = (this.state.prefs || {}).sfx; if (fx && fx.on) require('./sfx').play('horn', fx.volume);
    this._playlistTick();
    this._broadcast(this._stateMsg());
  },

  // {tz}: the browser's time zone, so timers follow the user's clock.
  setTimezone(ws, msg) {
    const p = this.state.prefs || prefs.load();
    if (!require('./localTime').isZone(msg.tz) || p.tz === msg.tz) return;
    this.state.prefs = prefs.save({ ...p, tz: msg.tz });
    this._broadcast(this._stateMsg());
  },

  // Sound effects: {on?, volume?}; {test: true} plays a sample.
  setSfx(ws, msg) {
    const p = this.state.prefs || prefs.load();
    this.state.prefs = prefs.save({ ...p, sfx: { on: msg.on === undefined ? p.sfx.on : !!msg.on, volume: msg.volume === undefined ? p.sfx.volume : Number(msg.volume) } });
    if (msg.test) require('./sfx').play('coin', this.state.prefs.sfx.volume);
    this._broadcast(this._stateMsg());
  },

  // Setup > Backup: make a backup copy now.
  backupNow() {
    this.state.backup = require('./autoBackup').backupNow();
    this._broadcast(this._stateMsg());
  },

  // Who needs the PIN: {localNoPin, guests} (see src/access.js).
  setAccess(ws, msg) {
    const p = this.state.prefs || prefs.load();
    this.state.prefs = prefs.save({ ...p, access: { localNoPin: msg.localNoPin !== false, guests: !!msg.guests } });
    this._broadcast(this._stateMsg());
  },

  // {effect, amount}: how much this one effect reacts to music (0 = not at
  // all, null = follow the global setting).
  setMusicReactFor(ws, msg) {
    if (typeof msg.effect !== 'string' || !EFFECTS[msg.effect]) return;
    const cur = this.state.musicReact || { on: false, amount: 0.6 };
    const per = { ...(cur.perEffect || {}) };
    const a = Number(msg.amount);
    if (msg.amount === null || msg.amount === undefined || !Number.isFinite(a)) delete per[msg.effect];
    else per[msg.effect] = Math.max(0, Math.min(1, a));
    this.state.musicReact = { ...cur, perEffect: per };
    this._broadcast(this._stateMsg());
  },

  // Automatic show settings: {dayPlan?, weatherMode?, celebrations?}
  // (see src/autoShow.js). Each given part replaces the stored one.
  setAutoShow(ws, msg) {
    const p = this.state.prefs || prefs.load(), next = { ...p };
    for (const k of ['dayPlan', 'weatherMode', 'celebrations']) if (msg[k] && typeof msg[k] === 'object') next[k] = msg[k];
    this.state.prefs = prefs.save(next);
    if (msg.weatherMode) this._wxAt = 0; // fetch straight away
    if (msg.dayPlan && this.state.autoStatus) this.state.autoStatus.part = ''; // re-apply the current part (its brightness too)
    this._broadcast(this._stateMsg());
  },

  // Playlist: {on, minutes} - cycles through the favourites (see
  // WsServer._playlistTick). Night dimming: {on, from, to, level}.
  setPlaylist(ws, msg) {
    const p = this.state.prefs || prefs.load();
    this.state.prefs = prefs.save({ ...p, playlist: { ...p.playlist, ...msg, cmd: undefined } });
    this._playlistSince = Date.now();
    this._broadcast(this._stateMsg());
  },
  // Next-gen look (postfx.js): {on, bloom, vibrance, smooth}.
  setLook(ws, msg) {
    const p = this.state.prefs || prefs.load();
    this.state.prefs = prefs.save({ ...p, look: { ...p.look, ...msg, cmd: undefined } });
    this._broadcast(this._stateMsg());
  },
  // How effects change over (effects/transition.js): {style, secs}.
  setTransition(ws, msg) {
    const p = this.state.prefs || prefs.load();
    this.state.prefs = prefs.save({ ...p, transition: { ...p.transition, ...(msg.style !== undefined ? { style: msg.style } : {}), ...(msg.secs !== undefined ? { secs: Number(msg.secs) } : {}) } });
    this._broadcast(this._stateMsg());
  },
  setNightDim(ws, msg) {
    const p = this.state.prefs || prefs.load();
    this.state.prefs = prefs.save({ ...p, nightDim: { ...p.nightDim, ...msg, cmd: undefined } });
    this._broadcast(this._stateMsg());
  },

  // YouTube for Video Display (src/youtube.js, needs yt-dlp on the Pi).
  // ytSearch {query} fills state.yt.results; ytPlay {id, title} resolves the
  // stream and plays it as the video link.
  ytSearch(ws, msg) {
    const query = typeof msg.query === 'string' ? msg.query.trim() : '';
    if (!query) return;
    this.state.yt = { query, searching: true, results: (this.state.yt && this.state.yt.results) || [], error: '' };
    this._broadcast(this._stateMsg());
    youtube.search(query).then((results) => { this.state.yt = { query, searching: false, results, error: results.length ? '' : 'No videos found' }; })
      .catch((e) => { this.state.yt = { query, searching: false, results: [], error: e.message }; })
      .finally(() => this._broadcast(this._stateMsg()));
  },
  ytPlay(ws, msg) {
    const id = typeof msg.id === 'string' ? msg.id : '';
    const title = typeof msg.title === 'string' ? msg.title.slice(0, 120) : '';
    const duration = Number(msg.duration) > 0 ? Number(msg.duration) : 0;
    this.state.yt = { ...(this.state.yt || {}), playing: { id, title, duration, loading: true }, error: '' };
    this._broadcast(this._stateMsg());
    youtube.resolveStreams(id).then((st) => {
      this._ytStreamUrl = st.video;
      this._ytAudioUrl = st.audio;
      COMMANDS._ytStart.call(this, ws, title, 0);
      this.state.yt = { ...this.state.yt, playing: { id, title, duration, start: 0, startedAt: Date.now(), loading: false } };
    }).catch((e) => { this.state.yt = { ...this.state.yt, playing: null, error: e.message }; })
      .finally(() => this._broadcast(this._stateMsg()));
  },
  // ytCookies {text}: signs YouTube in with an uploaded cookies.txt; {text:''} signs out.
  ytCookies(ws, msg) {
    try {
      if (msg.text) youtube.saveCookies(msg.text); else youtube.signOut();
      this.state.yt = { ...(this.state.yt || {}), error: '' };
    } catch (e) { this.state.yt = { ...(this.state.yt || {}), error: e.message }; }
    this._broadcast(this._stateMsg());
  },
  // ytSeek {seconds}: restarts the current YouTube video (picture and sound) there.
  ytSeek(ws, msg) {
    const p = this.state.yt && this.state.yt.playing;
    if (!p || !this._ytStreamUrl) return;
    let t = Math.max(0, Number(msg.seconds) || 0);
    if (p.duration) t = Math.min(t, Math.max(0, p.duration - 1));
    COMMANDS._ytStart.call(this, ws, p.title, t);
    this.state.yt = { ...this.state.yt, playing: { ...p, start: t, startedAt: Date.now() } };
    this._broadcast(this._stateMsg());
  },
  // Video on the panels plus the same stream as a radio station, so the sound
  // plays on the Pi's speaker and through "Play in this browser".
  _ytStart(ws, title, seconds) {
    const at = '#mdss=' + Math.round(seconds);
    const url = this._ytStreamUrl + at;
    const audioUrl = (this._ytAudioUrl || this._ytStreamUrl) + at;
    COMMANDS.setEffectOption.call(this, ws, { effect: 'video', key: 'source', value: 'url' });
    COMMANDS.setEffectOption.call(this, ws, { effect: 'video', key: 'url', value: url });
    if (this.state.effect !== 'video') COMMANDS.setEffect.call(this, ws, { effect: 'video' });
    COMMANDS.radioPlay.call(this, ws, { station: { name: title || 'YouTube', genre: 'YouTube', url: audioUrl } });
  },

  // My Photos: {name} removes one uploaded photo.
  deletePhoto(ws, msg) {
    if (typeof msg.name === 'string' && httpApi.deletePhoto(msg.name)) this._broadcast(this._stateMsg());
  },
  // Notifications: a fresh secret for the /api/notify link (the old one stops working).
  newNotifyToken() {
    httpApi.newNotifyToken();
    this._broadcast(this._stateMsg());
  },
  // Draw (see effects/drawPad.js): brush dabs / the whole picture / clear,
  // relayed to the copy of the effect that renders.
  drawOps(ws, msg) {
    const payload = { w: msg.w, h: msg.h, clear: !!msg.clear, image: typeof msg.image === 'string' ? msg.image : undefined, ops: Array.isArray(msg.ops) ? msg.ops : undefined };
    if (this.effectCommandRelay) this.effectCommandRelay('drawOps', payload);
    else EFFECTS.draw.applyOps(payload);
  },
  // Saved drawings for the slideshow, newest first, up to 30.
  saveDrawing(ws, msg) {
    const w = msg.w | 0, h = msg.h | 0;
    if (w < 1 || h < 1 || w * h > 384 * 384 || typeof msg.image !== 'string' || Buffer.from(msg.image, 'base64').length !== w * h * 3) return;
    const list = readDrawings();
    list.unshift({ name: String(msg.name || '').slice(0, 40) || new Date().toLocaleString(), w, h, image: msg.image, at: Date.now() });
    atomicWriteJson(EFFECTS.draw.FILE, list.slice(0, 30));
    this._replyBt(ws, 'drawListResult', async () => ({ list: readDrawings() }));
  },
  drawList(ws) {
    this._replyBt(ws, 'drawListResult', async () => ({ list: readDrawings() }));
  },
  deleteDrawing(ws, msg) {
    const list = readDrawings();
    if (Number.isInteger(msg.index) && msg.index >= 0 && msg.index < list.length) { list.splice(msg.index, 1); atomicWriteJson(EFFECTS.draw.FILE, list); }
    this._replyBt(ws, 'drawListResult', async () => ({ list: readDrawings() }));
  },
  // A message from the phone shown as a note on the display (see effects/notice.js).
  sendNote(ws, msg) {
    const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!text) return;
    const secs = Math.max(5, Math.min(3600, Number(msg.secs) || 30));
    const color = /^#[0-9a-f]{6}$/i.test(msg.color || '') ? msg.color : '#ffd23d';
    this.state.notice = { text, color, until: Date.now() + secs * 1000, style: 'note', from: String(msg.from || '').slice(0, 20) };
    this._broadcast(this._stateMsg());
  },
  // Clears a notification banner early.
  clearNotice() {
    this.state.notice = null;
    this._broadcast(this._stateMsg());
  },

  // AI assistant settings (Setup > AI). The key is stored on the Pi only.
  setAiConfig(ws, msg) {
    aiConfig.save(msg || {});
    this._broadcast(this._stateMsg());
  },

  // The Ask bar: {text}. Asks the configured AI service (see src/ai.js) and
  // applies the validated actions; replies to the asking client only with
  // {cmd:'aiResult', say | error | off}. One request at a time.
  aiAsk(ws, msg) {
    const reply = (o) => { try { ws.send(JSON.stringify({ cmd: 'aiResult', ...o })); } catch (e) { /* client gone */ } };
    const text = typeof msg.text === 'string' ? msg.text.trim() : '';
    if (!text) return;
    if (this._aiBusy) { reply({ error: 'Still thinking about the last request…' }); return; }
    this._aiBusy = true;
    ai.ask(text, { effect: this.state.effect, mode: this.config.mode }).then((res) => {
      if (res.off) { reply({ off: true }); return; }
      for (const a of res.actions) {
        if (a.type === 'effect') COMMANDS.setEffect.call(this, ws, { effect: a.key });
        else if (a.type === 'overlay') COMMANDS.setOverlay.call(this, ws, { key: a.key, enabled: a.on });
        else if (a.type === 'brightness') COMMANDS.setBrightness.call(this, ws, { value: a.value });
        else if (a.type === 'speed') COMMANDS.setSpeed.call(this, ws, { value: a.value });
        else if (a.type === 'option') COMMANDS.setEffectOption.call(this, ws, { effect: a.effect, key: a.key, value: a.value });
        else if (a.type === 'palette') COMMANDS.setLook.call(this, ws, { palette: a.name, on: true });
        else if (a.type === 'off') COMMANDS.clearAll.call(this, ws, {});
        else if (a.type === 'art') {
          COMMANDS.setEffectOption.call(this, ws, { effect: 'ai_art', key: 'art', value: a.art });
          COMMANDS.setEffect.call(this, ws, { effect: 'ai_art' });
        }
      }
      this._broadcast(this._stateMsg());
      reply({ say: res.say || (res.actions.length ? 'Done.' : "I couldn't find a way to show that."), actions: res.actions.length });
    }).catch((err) => {
      console.warn('[ai] request failed:', err.message);
      reply({ error: err.message });
    }).finally(() => { this._aiBusy = false; });
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
