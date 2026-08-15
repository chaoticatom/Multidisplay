// Wires the (verbatim-copied) browser-app sidebar markup to pi-native's own
// WS control protocol. This is NOT the original ui.js - that file assumes
// an ESP32 streaming target and computes every effect in-browser, neither
// of which applies here (the Pi computes effects itself and only streams
// back small per-face preview frames). This script instead:
//   - drives the small set of controls pi-native actually has a backend
//     for (effect selection, cube-size/2D panel mode, master brightness/
//     speed, the Pi-only Bluetooth pairing panel in the Setup section, and
//     the Overlays panel - global compositing layers, see wireOverlaysPanel)
//   - greys out everything else the markup contains but pi-native doesn't
//     support yet (Custom Faces freehand drawing, ESP32 Firmware Update,
//     Standalone Mode, Clear All) so the page still looks like the
//     familiar app instead of silently doing nothing on click
//   - wires the Timers section (#alarm-section / #alarm-modal) to the
//     server's addAlarm/updateAlarm/deleteAlarm/setAlarmEnabled/
//     dismissAlarm commands - see wireAlarmSection()/wireAlarmModal()
//   - wires the Face Editor (#panel-editor-section) and the Custom Cube
//     effect's own panel (#panel-custom_cube) to setFaceEffect/setFaceOpts/
//     setFaceOverlays/saveCube/loadCube/deleteCube/clearFaces - see
//     wirePanelEditor()/wireCustomCubeEffectPanel()
//   - renders a live 3D preview on the #c canvas from the binary per-face
//     frames the WS server already streams for this purpose
const FACE_NAMES = ['Front', 'Back', 'Right', 'Left', 'Top', 'Bottom'];
const FACE_XFORM = [
  { pos: [0, 0, 1],  rot: [0, 0, 0] },
  { pos: [0, 0, -1], rot: [0, Math.PI, 0] },
  { pos: [1, 0, 0],  rot: [0, Math.PI / 2, 0] },
  { pos: [-1, 0, 0], rot: [0, -Math.PI / 2, 0] },
  { pos: [0, 1, 0],  rot: [-Math.PI / 2, 0, 0] },
  { pos: [0, -1, 0], rot: [Math.PI / 2, 0, 0] },
];

// Effect option panels with a real backend behind them (see
// wsServer.js's setEffectOption / rain.js's core.effectOptions.rain.style /
// lightspeed.js's core.effectOptions.lightspeed.*) - every other has-panel
// effect still gets the generic "not wired yet" greying in loadEffectNames().
// 'random' has no real controls of its own - panel-random is just the two
// Random 1 / Random 2 selector buttons, already handled by the generic
// .effect-btn[data-effect] wiring in loadEffectNames(). It's still listed
// here (not wired to any setEffectOption) purely so markUnsupported() below
// doesn't disable those two buttons, which live inside panel-random.
const WIRED_OPTION_PANELS = new Set(['rain', 'lightspeed', 'cam', 'weather', 'maze', 'tron', 'dice', 'coinflip', 'random', 'fireworks', 'retro', 'video', 'strobe', 'balls', 'radio', 'datetime', 'moon', 'apod', 'iss', 'neo', 'unsplash', 'artic', 'joke', 'trivia', 'otd', 'custom_cube']);
// Shared "Art" submenu prev/next/slideshow/letterbox/speed controls
// (#art-slideshow-chk/#art-letterbox-chk/#art-speed/#art-prev-btn/
// #art-next-btn) drive whichever of Unsplash/Art Gallery is the currently
// selected effect - same shared-panel shape as the browser's
// artSyncSharedControls()/ART_EFFECTS, minus APOD (not wired to these
// controls here - see wireApodPanel's comment on why).
const GALLERY_EFFECTS = ['unsplash', 'artic'];

let ws;
let effectNames = {};
let currentState = { effect: null, brightness: 1, speed: 1, panelSize: 64, panelMode: '2d' };
const faceCanvases = {};

function connect() {
  // Matches whichever transport the page itself was loaded over - plain
  // ws:// on the regular HTTP port, or wss:// on the HTTPS port (see
  // wsServer.js's module comment: a second TLS listener on port+1 exists
  // solely so getUserMedia()/getDisplayMedia() work at all, since browsers
  // refuse them entirely outside a secure context). A page loaded over
  // https:// trying to open a plain ws:// connection would be blocked as
  // mixed content anyway, so this isn't optional once HTTPS is in play.
  const wsScheme = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${wsScheme}://${location.hostname}:${location.port || 8081}`);
  ws.binaryType = 'arraybuffer';
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') handleTextMessage(JSON.parse(ev.data));
    else handleFrame(ev.data);
  };
  ws.onclose = () => setTimeout(connect, 2000);
  ws.onerror = () => ws.close();
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function handleTextMessage(msg) {
  if (msg.cmd === 'state') {
    const modeChanged = msg.panelMode !== currentState.panelMode || msg.panelSize !== currentState.panelSize
      || JSON.stringify(msg.panels) !== JSON.stringify(currentState.panels);
    currentState = msg;
    syncEffectButtons();
    syncPanelButtons();
    syncSliders();
    syncRainPanel();
    syncLightspeedPanel();
    syncCamPanel();
    syncApodPanel();
    syncUnsplashPanel();
    syncArticPanel();
    syncGalleryShared();
    syncJokePanel();
    syncTriviaPanel();
    syncOtdPanel();
    syncTriviaFactsShared();
    syncWeatherPanel();
    syncEpicPanel();
    syncIssPanel();
    syncNeoPanel();
    syncMazePanel();
    syncTronPanel();
    syncDatetimePanel();
    syncDicePanel();
    syncCoinflipPanel();
    syncFireworksPanel();
    syncRetroPanel();
    syncVideoPanel();
    syncStrobePanel();
    syncBallsPanel();
    syncRadioPanel();
    syncCelestialPanel();
    syncOverlaysPanel();
    syncPanelEditor();
    syncCustomCubeLibrarySelects();
    syncCustomCubeEffectPanel();
    renderAlarmList();
    syncClearAllButton();
    syncPhysicalPanelsControl();
    // Re-renders the wall grid on every state update (not just a mode
    // change) so adding/removing/dragging a panel is reflected immediately -
    // rebuildWallPreview() itself no-ops when not in wall mode. modeChanged
    // still separately triggers the full rebuildScene() (cube/2D<->wall
    // canvas visibility, WebGL scene teardown, etc) below.
    if (!modeChanged) rebuildWallPreview();
    if (modeChanged) rebuildScene();
  } else if (msg.cmd && msg.cmd.startsWith('bt') && msg.cmd.endsWith('Result')) {
    handleBtResult(msg);
  }
}

// ---------------------------------------------------------------------
// Effect buttons - the sidebar markup already has every effect as a
// .effect-btn[data-effect] element; just wire the ones pi-native actually
// has a registered effect for, and grey out the rest.
// ---------------------------------------------------------------------
async function loadEffectNames() {
  const resp = await fetch('/effects.json');
  effectNames = await resp.json();
  document.querySelectorAll('.effect-btn[data-effect]').forEach((btn) => {
    const key = btn.dataset.effect;
    const panel = document.getElementById('panel-' + key);
    if (Object.prototype.hasOwnProperty.call(effectNames, key)) {
      btn.addEventListener('click', () => {
        // Switching away from Video Display to any other effect - a real
        // report traced a persistent flicker between video content and
        // whatever effect was just selected to this: nothing ever told
        // the video source to actually stop. The tick loop only ever
        // calls the CURRENTLY SELECTED effect's function (see app.js's
        // module comment on the Pi), so once a different effect is
        // selected, just clearing effectOptions.video.url wouldn't
        // actually reach ffmpegSource.js's teardown (that only runs
        // inside effectVideo() itself, which stops being called) - hence
        // the dedicated stopVideoSource command for an immediate,
        // selection-independent stop (see wsServer.js's module comment),
        // on top of stopping any live browser camera/screen capture here
        // and resetting the stored url so Video Display starts fresh
        // rather than trying to resume the old source if reselected.
        if (currentState.effect === 'video' && key !== 'video') {
          stopBrowserCapture();
          send({ cmd: 'stopVideoSource' });
          setEffectOption('video', 'source', 'url');
          setEffectOption('video', 'url', '');
        }
        send({ cmd: 'setEffect', effect: key });
        if (btn.classList.contains('has-panel')) {
          // Same open/close convention as the original app: clicking an
          // already-open has-panel button just closes its panel; clicking
          // any other has-panel button opens its own and closes all others.
          const wasOpen = btn.classList.contains('open');
          document.querySelectorAll('.effect-btn.open').forEach((b) => b.classList.remove('open'));
          document.querySelectorAll('.effect-panel.open').forEach((p) => p.classList.remove('open'));
          if (!wasOpen) { btn.classList.add('open'); if (panel) panel.classList.add('open'); }
        }
      });
      // Most ported effects don't have their per-effect option controls
      // (city search, colour pickers, etc.) wired to a pi-native backend
      // command yet - grey those panels out so opening them doesn't imply
      // the controls inside do something they don't. Colour Rain and Light
      // Speed are the exception (wired below via WIRED_OPTION_PANELS).
      if (panel && !WIRED_OPTION_PANELS.has(key)) markUnsupported(panel, 'Effect options aren’t wired to the Pi-native engine yet.');
    } else {
      btn.classList.add('not-ported');
      btn.title = 'Not yet ported to the Pi-native engine';
      btn.disabled = true;
    }
  });
  syncEffectButtons();
}

function syncEffectButtons() {
  document.querySelectorAll('.effect-btn[data-effect]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.effect === currentState.effect);
  });
}

function setEffectOption(effect, key, value) {
  send({ cmd: 'setEffectOption', effect, key, value });
}

// ---------------------------------------------------------------------
// Earth Live View (panel-epic) - "Refresh Earth Image" button sends a
// fresh timestamp as effectOptions.epic.refreshRequestedAt; effects/epic.js
// treats any change to that value as "force a re-fetch now", same trick
// used because setEffectOption is a value-store, not a fire-once command
// channel (see wsServer.js's setEffectOption comment). Status readout
// mirrors effects/epic.js's getStatus() shape (caption/date/lat/lon/
// fetching/error), same convention as syncWeatherPanel()/syncCamPanel().
// ---------------------------------------------------------------------
function wireEpicPanel() {
  const panel = document.getElementById('panel-epic');
  if (!panel) return;
  const btn = panel.querySelector('#epic-fetch-btn');
  if (btn) btn.addEventListener('click', () => setEffectOption('epic', 'refreshRequestedAt', Date.now()));
}

function syncEpicPanel() {
  const panel = document.getElementById('panel-epic');
  if (!panel) return;
  const status = currentState.effectStatus?.epic;
  const statusEl = panel.querySelector('#epic-status');
  const infoEl = panel.querySelector('#epic-info');
  const dateEl = panel.querySelector('#epic-date-line');
  const coordEl = panel.querySelector('#epic-coord-line');
  if (!status) { if (statusEl) statusEl.textContent = 'Not fetched yet'; return; }
  if (status.fetching) { if (statusEl) statusEl.textContent = 'Fetching latest Earth image…'; return; }
  if (status.error) { if (statusEl) statusEl.textContent = '✕ ' + status.error; return; }
  if (!status.caption) { if (statusEl) statusEl.textContent = 'Not fetched yet'; return; }
  if (statusEl) statusEl.textContent = status.imgError ? '✕ ' + status.imgError : status.caption;
  if (infoEl) infoEl.style.display = 'block';
  if (dateEl) dateEl.textContent = 'Captured: ' + status.date + ' UTC';
  if (coordEl) coordEl.textContent = (status.lat != null) ? `Centroid: ${status.lat.toFixed(1)}°, ${status.lon.toFixed(1)}°` : '';
}

// ---------------------------------------------------------------------
// ISS Tracker (panel-iss) - "Refresh Position" button sends a fresh
// timestamp as effectOptions.iss.refreshRequestedAt; effects/iss.js treats
// any change to that value as "force a re-fetch now", same trick as
// wireEpicPanel() above (setEffectOption is a value-store, not a fire-once
// command channel - see wsServer.js's setEffectOption comment). Status
// readout mirrors effects/iss.js's getStatus() shape (hasFix/lat/lon/
// timestamp/fetching/error/countryCode/countryName).
// ---------------------------------------------------------------------
function wireIssPanel() {
  const panel = document.getElementById('panel-iss');
  if (!panel) return;
  const btn = panel.querySelector('#iss-fetch-btn');
  if (btn) btn.addEventListener('click', () => setEffectOption('iss', 'refreshRequestedAt', Date.now()));
}

function syncIssPanel() {
  const panel = document.getElementById('panel-iss');
  if (!panel) return;
  const status = currentState.effectStatus?.iss;
  const statusEl = panel.querySelector('#iss-status');
  const infoEl = panel.querySelector('#iss-info');
  const coordEl = panel.querySelector('#iss-coord-line');
  const timeEl = panel.querySelector('#iss-time-line');
  const countryEl = panel.querySelector('#iss-country-line');
  if (!status) { if (statusEl) statusEl.textContent = 'Not fetched yet'; return; }
  if (status.fetching) { if (statusEl) statusEl.textContent = 'Fetching…'; return; }
  if (status.error) { if (statusEl) statusEl.textContent = '✕ ' + status.error; return; }
  if (!status.hasFix) { if (statusEl) statusEl.textContent = 'Not fetched yet'; return; }
  if (statusEl) statusEl.textContent = `Tracking — fix at ${new Date(status.timestamp * 1000).toLocaleTimeString()}`;
  if (infoEl) infoEl.style.display = 'block';
  if (coordEl) coordEl.textContent = `Lat ${status.lat.toFixed(2)}°  Lon ${status.lon.toFixed(2)}°`;
  if (timeEl) timeEl.textContent = 'Last fix: ' + new Date(status.timestamp * 1000).toLocaleTimeString();
  if (countryEl) countryEl.textContent = 'Currently over: ' + (status.countryCode ? status.countryName : 'International waters');
}

// ---------------------------------------------------------------------
// Near-Earth Objects (panel-neo) - "Refresh Tracking Data" button sends a
// fresh timestamp as effectOptions.neo.refreshRequestedAt; effects/neo.js
// treats any change to that value as "force a re-fetch now", same trick
// as wireEpicPanel()/wireIssPanel() above (setEffectOption is a
// value-store, not a fire-once command channel - see wsServer.js's
// setEffectOption comment). Status readout mirrors effects/neo.js's
// getStatus() shape (count/closest/risk/fetching/error).
// ---------------------------------------------------------------------
function wireNeoPanel() {
  const panel = document.getElementById('panel-neo');
  if (!panel) return;
  const btn = panel.querySelector('#neo-fetch-btn');
  if (btn) btn.addEventListener('click', () => setEffectOption('neo', 'refreshRequestedAt', Date.now()));
}

function syncNeoPanel() {
  const panel = document.getElementById('panel-neo');
  if (!panel) return;
  const status = currentState.effectStatus?.neo;
  const statusEl = panel.querySelector('#neo-status');
  const infoEl = panel.querySelector('#neo-info');
  const closestEl = panel.querySelector('#neo-closest-line');
  const riskEl = panel.querySelector('#neo-risk-line');
  if (!status) { if (statusEl) statusEl.textContent = 'Not fetched yet'; return; }
  if (status.fetching) { if (statusEl) statusEl.textContent = 'Fetching near-Earth object data…'; return; }
  if (status.error) { if (statusEl) statusEl.textContent = '✕ ' + status.error; return; }
  if (!status.count) { if (statusEl) statusEl.textContent = 'Not fetched yet'; return; }
  if (statusEl) statusEl.textContent = status.text || `${status.count} objects tracked`;
  if (infoEl) infoEl.style.display = 'block';
  if (closestEl) closestEl.textContent = status.closest ? `Closest: ${status.closest.name} — ${status.closest.missLD.toFixed(1)} LD` : 'Closest: —';
  if (riskEl) riskEl.textContent = 'Risk level: ' + (status.risk || '—').toUpperCase();
}

// ---------------------------------------------------------------------
// Colour Rain's Style buttons (panel-rain) - core.effectOptions.rain.style.
// ---------------------------------------------------------------------
function wireRainPanel() {
  document.querySelectorAll('.rain-style-btn[data-rainstyle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rain-style-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('rain', 'style', btn.dataset.rainstyle);
    });
  });
}

function syncRainPanel() {
  const style = currentState.effectOptions?.rain?.style || 'colour';
  document.querySelectorAll('.rain-style-btn[data-rainstyle]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.rainstyle === style);
  });
}

// ---------------------------------------------------------------------
// Light Speed's option panel (panel-lightspeed) - sliders for
// speed/trail/count, button groups for size/nudge/colour, all backed by
// core.effectOptions.lightspeed.*.
// ---------------------------------------------------------------------
function wireLightspeedPanel() {
  const panel = document.getElementById('panel-lightspeed');
  if (!panel) return;

  const speed = panel.querySelector('#ls-speed'), speedVal = panel.querySelector('#ls-speed-val');
  if (speed) speed.addEventListener('input', () => {
    if (speedVal) speedVal.textContent = speed.value;
    setEffectOption('lightspeed', 'speed', Number(speed.value));
  });

  const trail = panel.querySelector('#ls-trail'), trailVal = panel.querySelector('#ls-trail-val');
  if (trail) trail.addEventListener('input', () => {
    if (trailVal) trailVal.textContent = trail.value;
    setEffectOption('lightspeed', 'trail', Number(trail.value));
  });

  const count = panel.querySelector('#ls-count'), countVal = panel.querySelector('#ls-count-val');
  if (count) count.addEventListener('input', () => {
    if (countVal) countVal.textContent = count.value;
    setEffectOption('lightspeed', 'count', Number(count.value));
  });

  const wireButtonGroup = (selector, dataAttr, key, parse) => {
    panel.querySelectorAll(selector).forEach((btn) => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll(selector).forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        setEffectOption('lightspeed', key, parse(btn.dataset[dataAttr]));
      });
    });
  };
  wireButtonGroup('[data-ls-size]', 'lsSize', 'size', Number);
  wireButtonGroup('[data-ls-nudge]', 'lsNudge', 'nudge', Number);
  wireButtonGroup('[data-ls-col]', 'lsCol', 'colour', String);
}

function syncLightspeedPanel() {
  const panel = document.getElementById('panel-lightspeed');
  if (!panel) return;
  const opts = currentState.effectOptions?.lightspeed || {};
  const speed = panel.querySelector('#ls-speed'), speedVal = panel.querySelector('#ls-speed-val');
  if (speed && document.activeElement !== speed) { speed.value = opts.speed ?? 8; if (speedVal) speedVal.textContent = speed.value; }
  const trail = panel.querySelector('#ls-trail'), trailVal = panel.querySelector('#ls-trail-val');
  if (trail && document.activeElement !== trail) { trail.value = opts.trail ?? 32; if (trailVal) trailVal.textContent = trail.value; }
  const count = panel.querySelector('#ls-count'), countVal = panel.querySelector('#ls-count-val');
  if (count && document.activeElement !== count) { count.value = opts.count ?? 3; if (countVal) countVal.textContent = count.value; }
  panel.querySelectorAll('[data-ls-size]').forEach((b) => b.classList.toggle('active', Number(b.dataset.lsSize) === (opts.size ?? 1)));
  panel.querySelectorAll('[data-ls-nudge]').forEach((b) => b.classList.toggle('active', Number(b.dataset.lsNudge) === (opts.nudge ?? 0)));
  panel.querySelectorAll('[data-ls-col]').forEach((b) => b.classList.toggle('active', b.dataset.lsCol === (opts.colour || 'multi')));
}

// ---------------------------------------------------------------------
// Weather's option panel (panel-weather) - city search box + live status/
// temp/description readouts, backed by core.effectOptions.weather.city and
// the effectStatus.weather snapshot effects/weather.js's getStatus()
// exposes (see wsServer.js's _stateMsg()/app.js's per-tick poll).
// ---------------------------------------------------------------------
function wireWeatherPanel() {
  const panel = document.getElementById('panel-weather');
  if (!panel) return;
  const cityInput = panel.querySelector('#wx-city');
  const goBtn = panel.querySelector('#wx-fetch-btn');
  const submit = () => {
    const city = (cityInput?.value || '').trim();
    if (city) setEffectOption('weather', 'city', city);
  };
  if (goBtn) goBtn.addEventListener('click', submit);
  if (cityInput) cityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

function syncWeatherPanel() {
  const panel = document.getElementById('panel-weather');
  if (!panel) return;
  const status = currentState.effectStatus?.weather;
  const statusEl = panel.querySelector('#wx-status');
  const infoEl = panel.querySelector('#wx-info');
  const tempEl = panel.querySelector('#wx-temp-line');
  const descEl = panel.querySelector('#wx-desc-line');
  const sunEl = panel.querySelector('#wx-sun-line');
  if (!status) { if (statusEl) statusEl.textContent = 'Enter city and press GO'; return; }
  if (status.fetching) { if (statusEl) statusEl.textContent = 'Fetching...'; return; }
  if (status.error) { if (statusEl) statusEl.textContent = 'Error: ' + status.error; return; }
  if (!status.city) { if (statusEl) statusEl.textContent = 'Enter city and press GO'; return; }
  if (statusEl) statusEl.textContent = status.city;
  if (infoEl) infoEl.style.display = 'block';
  if (tempEl) tempEl.textContent = (status.temp ?? '?') + '°C';
  if (descEl) descEl.textContent = status.desc || '';
  if (sunEl && Number.isFinite(status.sunriseS) && Number.isFinite(status.sunsetS)) {
    const fmt = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
    sunEl.textContent = `☀ ${fmt(status.sunriseS)} - ${fmt(status.sunsetS)}`;
  }
}

// ---------------------------------------------------------------------
// Maze Runner's option panel (panel-maze) - Runners slider + "NEW MAZE"
// button, backed by core.effectOptions.maze.runners/newMaze (see maze.js's
// module comment for how the button's rebuild-now behaviour works without
// a dedicated one-shot WS command - a monotonically increasing token).
// ---------------------------------------------------------------------
let _mazeToken = 0;
function wireMazePanel() {
  const panel = document.getElementById('panel-maze');
  if (!panel) return;
  const runners = panel.querySelector('#mz-runners'), runnersVal = panel.querySelector('#mz-runners-val');
  if (runners) runners.addEventListener('input', () => {
    if (runnersVal) runnersVal.textContent = runners.value;
    setEffectOption('maze', 'runners', Number(runners.value));
  });
  const newBtn = panel.querySelector('#new-maze-btn');
  if (newBtn) newBtn.addEventListener('click', () => setEffectOption('maze', 'newMaze', ++_mazeToken));
}

function syncMazePanel() {
  const panel = document.getElementById('panel-maze');
  if (!panel) return;
  const opts = currentState.effectOptions?.maze || {};
  const runners = panel.querySelector('#mz-runners'), runnersVal = panel.querySelector('#mz-runners-val');
  if (runners && document.activeElement !== runners) { runners.value = opts.runners ?? 3; if (runnersVal) runnersVal.textContent = runners.value; }
}

// ---------------------------------------------------------------------
// Retro's option panel (panel-retro) - the 14-game .retro-game-btn picker
// ("Auto" = -1, per-game buttons 0-13), the .retro-auto-chk checkboxes
// controlling which games are eligible for auto-rotation, the rotate-
// interval slider, and the "▶ Show" button that actually switches the
// active effect to Retro (mirrors ui.js's #retro-show-btn handler - opening
// the panel to configure a game doesn't itself switch the display, same as
// the original browser app). All backed by core.effectOptions.retro.
// {selectedGame,autoGames,rotate} via retro.js - see that file's module
// comment for the exact meaning of each.
// ---------------------------------------------------------------------
const RETRO_DEFAULT_AUTO_GAMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13]; // Sam Fox (9) excluded by default
function wireRetroPanel() {
  const panel = document.getElementById('panel-retro');
  if (!panel) return;

  panel.querySelectorAll('.retro-game-btn[data-retrogame]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.retro-game-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('retro', 'selectedGame', Number(btn.dataset.retrogame));
    });
  });

  const updateAutoGames = () => {
    const chks = panel.querySelectorAll('.retro-auto-chk');
    const enabled = [];
    chks.forEach((c) => { if (c.checked) enabled.push(Number(c.dataset.idx)); });
    setEffectOption('retro', 'autoGames', enabled.length === chks.length ? null : enabled);
  };
  panel.querySelectorAll('.retro-auto-chk').forEach((c) => c.addEventListener('change', updateAutoGames));

  const slider = panel.querySelector('#retro-rotate-slider'), sliderVal = panel.querySelector('#retro-rotate-val');
  if (slider) slider.addEventListener('input', () => {
    if (sliderVal) sliderVal.textContent = slider.value;
    setEffectOption('retro', 'rotate', Number(slider.value));
  });

  const showBtn = panel.querySelector('#retro-show-btn');
  if (showBtn) showBtn.addEventListener('click', () => send({ cmd: 'setEffect', effect: 'retro' }));
}

function syncRetroPanel() {
  const panel = document.getElementById('panel-retro');
  if (!panel) return;
  const opts = currentState.effectOptions?.retro || {};
  const selectedGame = opts.selectedGame ?? -1;
  panel.querySelectorAll('.retro-game-btn[data-retrogame]').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.retrogame) === selectedGame);
  });
  const autoGames = opts.autoGames || RETRO_DEFAULT_AUTO_GAMES;
  panel.querySelectorAll('.retro-auto-chk').forEach((c) => {
    if (document.activeElement !== c) c.checked = autoGames.includes(Number(c.dataset.idx));
  });
  const slider = panel.querySelector('#retro-rotate-slider'), sliderVal = panel.querySelector('#retro-rotate-val');
  if (slider && document.activeElement !== slider) { slider.value = opts.rotate ?? 8; if (sliderVal) sliderVal.textContent = slider.value; }
}

// ---------------------------------------------------------------------
// Tron Bikes' option panel (panel-tron), backed by
// core.effectOptions.tron.{bikes,speed,straight,borderWalls,newGame} - see
// tron.js's module comment for the full mapping, including the
// straight-lines checkbox being a faithfully-ported dead control (the
// original #tron-straight-check has no change listener in ui.js either).
// "⟳ NEW GAME" reuses maze's monotonic-token trick since there's no
// dedicated one-shot WS command for "force a restart now".
// ---------------------------------------------------------------------
let _tronToken = 0;
function wireTronPanel() {
  const panel = document.getElementById('panel-tron');
  if (!panel) return;
  const count = panel.querySelector('#tron-count'), countVal = panel.querySelector('#tron-count-val');
  if (count) count.addEventListener('input', () => {
    if (countVal) countVal.textContent = count.value;
    setEffectOption('tron', 'bikes', Number(count.value));
  });
  const speed = panel.querySelector('#tron-speed'), speedVal = panel.querySelector('#tron-speed-val');
  if (speed) speed.addEventListener('input', () => {
    if (speedVal) speedVal.textContent = Number(speed.value).toFixed(1) + '×';
    setEffectOption('tron', 'speed', Number(speed.value));
  });
  const straightChk = panel.querySelector('#tron-straight-check');
  if (straightChk) straightChk.addEventListener('change', () => {
    setEffectOption('tron', 'straight', straightChk.checked ? 1 : 0);
  });
  const borderChk = panel.querySelector('#tron-border-check');
  if (borderChk) borderChk.addEventListener('change', () => {
    setEffectOption('tron', 'borderWalls', borderChk.checked);
  });
  const newBtn = panel.querySelector('#new-tron-btn');
  if (newBtn) newBtn.addEventListener('click', () => setEffectOption('tron', 'newGame', ++_tronToken));
}

function syncTronPanel() {
  const panel = document.getElementById('panel-tron');
  if (!panel) return;
  const opts = currentState.effectOptions?.tron || {};
  const count = panel.querySelector('#tron-count'), countVal = panel.querySelector('#tron-count-val');
  if (count && document.activeElement !== count) { count.value = opts.bikes ?? 4; if (countVal) countVal.textContent = count.value; }
  const speed = panel.querySelector('#tron-speed'), speedVal = panel.querySelector('#tron-speed-val');
  if (speed && document.activeElement !== speed) { speed.value = opts.speed ?? 1; if (speedVal) speedVal.textContent = Number(speed.value).toFixed(1) + '×'; }
  const straightChk = panel.querySelector('#tron-straight-check');
  if (straightChk && document.activeElement !== straightChk) straightChk.checked = !!(opts.straight ?? 1);
  const borderChk = panel.querySelector('#tron-border-check');
  if (borderChk && document.activeElement !== borderChk) borderChk.checked = !!opts.borderWalls;
}

// ---------------------------------------------------------------------
// Time & Date's option panel (panel-datetime) - ALL PANELS/SCROLL checkboxes,
// Scroll Speed slider, and the six Mode buttons (data-dtmode), backed by
// core.effectOptions.datetime.{allPanels,scroll,scrollSpeed,mode} - see
// datetime.js's module comment for how each mode renders without a browser
// <canvas>. Mirrors the browser's #dt-allpanels-check/#dt-scroll-check/
// #dt-scroll-speed/[data-dtmode] wiring in ui.js.
// ---------------------------------------------------------------------
function wireDatetimePanel() {
  const panel = document.getElementById('panel-datetime');
  if (!panel) return;
  const allPanels = panel.querySelector('#dt-allpanels-check');
  if (allPanels) allPanels.addEventListener('change', () => setEffectOption('datetime', 'allPanels', allPanels.checked));
  const scroll = panel.querySelector('#dt-scroll-check');
  if (scroll) scroll.addEventListener('change', () => setEffectOption('datetime', 'scroll', scroll.checked));
  const speed = panel.querySelector('#dt-scroll-speed'), speedVal = panel.querySelector('#dt-scroll-speed-val');
  if (speed) speed.addEventListener('input', () => {
    if (speedVal) speedVal.textContent = speed.value;
    setEffectOption('datetime', 'scrollSpeed', Number(speed.value));
  });
  panel.querySelectorAll('[data-dtmode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-dtmode]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('datetime', 'mode', btn.dataset.dtmode);
    });
  });
}

function syncDatetimePanel() {
  const panel = document.getElementById('panel-datetime');
  if (!panel) return;
  const opts = currentState.effectOptions?.datetime || {};
  const allPanels = panel.querySelector('#dt-allpanels-check');
  if (allPanels && document.activeElement !== allPanels) allPanels.checked = !!opts.allPanels;
  const scroll = panel.querySelector('#dt-scroll-check');
  if (scroll && document.activeElement !== scroll) scroll.checked = !!opts.scroll;
  const speed = panel.querySelector('#dt-scroll-speed'), speedVal = panel.querySelector('#dt-scroll-speed-val');
  if (speed && document.activeElement !== speed) { speed.value = opts.scrollSpeed ?? 1; if (speedVal) speedVal.textContent = speed.value; }
  const mode = opts.mode || 'time';
  panel.querySelectorAll('[data-dtmode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.dtmode === mode);
  });
}

// ---------------------------------------------------------------------
// Dice Roll's option panel (panel-dice) - "ROLL DICE" button + "AUTO ROLL"
// checkbox, backed by core.effectOptions.dice.rollToken/autoRoll (see
// dice.js's module comment - rollToken is the same monotonically-increasing-
// token one-shot-action pattern as maze.js's "NEW MAZE" button).
// ---------------------------------------------------------------------
let _diceToken = 0;
function wireDicePanel() {
  const panel = document.getElementById('panel-dice');
  if (!panel) return;
  const rollBtn = panel.querySelector('#dice-roll-btn');
  if (rollBtn) rollBtn.addEventListener('click', () => setEffectOption('dice', 'rollToken', ++_diceToken));
  const autoChk = panel.querySelector('#dice-auto-check');
  if (autoChk) autoChk.addEventListener('change', () => setEffectOption('dice', 'autoRoll', autoChk.checked));
}

function syncDicePanel() {
  const panel = document.getElementById('panel-dice');
  if (!panel) return;
  const opts = currentState.effectOptions?.dice || {};
  const autoChk = panel.querySelector('#dice-auto-check');
  if (autoChk && document.activeElement !== autoChk) autoChk.checked = !!opts.autoRoll;
}

// ---------------------------------------------------------------------
// Coin Flip's option panel (panel-coinflip) - Flip Speed slider, backed by
// core.effectOptions.coinflip.speed.
// ---------------------------------------------------------------------
function wireCoinflipPanel() {
  const panel = document.getElementById('panel-coinflip');
  if (!panel) return;
  const speed = panel.querySelector('#coin-speed'), speedVal = panel.querySelector('#coin-speed-val');
  if (speed) speed.addEventListener('input', () => {
    if (speedVal) speedVal.textContent = Number(speed.value).toFixed(1) + 'x';
    setEffectOption('coinflip', 'speed', Number(speed.value));
  });
}

function syncCoinflipPanel() {
  const panel = document.getElementById('panel-coinflip');
  if (!panel) return;
  const opts = currentState.effectOptions?.coinflip || {};
  const speed = panel.querySelector('#coin-speed'), speedVal = panel.querySelector('#coin-speed-val');
  if (speed && document.activeElement !== speed) { speed.value = opts.speed ?? 1; if (speedVal) speedVal.textContent = Number(speed.value).toFixed(1) + 'x'; }
}

// ---------------------------------------------------------------------
// Fireworks' option panel (panel-fireworks) - Mode buttons (random/sync/
// mic, backed by core.effectOptions.fireworks.mode - see fireworks.js's
// module comment for what each mode actually does, including the mic-mode
// fallback), "Show text on cube" checkbox + text input, backed by
// core.effectOptions.fireworks.textOn/text. The text input is committed on
// 'change' (blur/Enter) rather than every keystroke's 'input' event - same
// "don't spam a WS message per keystroke" reasoning as cam.js's URL field -
// since scrolling-text rebuilds are more expensive than a simple option
// swap and there's no live preview benefit to rebuilding mid-keystroke here.
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Strobe Flash's option panel (panel-strobe) - Pattern buttons (data-strobe,
// backed by core.effectOptions.strobe.pattern), Speed slider
// (core.effectOptions.strobe.speed), and Colour buttons (data-scol, backed
// by core.effectOptions.strobe.color) - see strobe.js's module comment for
// why this always reads straight from effectOptions (no Panel Editor here).
// ---------------------------------------------------------------------
function wireStrobePanel() {
  const panel = document.getElementById('panel-strobe');
  if (!panel) return;
  panel.querySelectorAll('[data-strobe]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-strobe]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('strobe', 'pattern', btn.dataset.strobe);
    });
  });
  const speed = panel.querySelector('#strobe-speed'), speedVal = panel.querySelector('#strobe-speed-val');
  if (speed) speed.addEventListener('input', () => {
    if (speedVal) speedVal.textContent = speed.value + '/s';
    setEffectOption('strobe', 'speed', Number(speed.value));
  });
  panel.querySelectorAll('[data-scol]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-scol]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('strobe', 'color', btn.dataset.scol);
    });
  });
}

function syncStrobePanel() {
  const panel = document.getElementById('panel-strobe');
  if (!panel) return;
  const opts = currentState.effectOptions?.strobe || {};
  const pattern = opts.pattern || 'all';
  panel.querySelectorAll('[data-strobe]').forEach((b) => b.classList.toggle('active', b.dataset.strobe === pattern));
  const speed = panel.querySelector('#strobe-speed'), speedVal = panel.querySelector('#strobe-speed-val');
  if (speed && document.activeElement !== speed) { speed.value = opts.speed ?? 8; if (speedVal) speedVal.textContent = speed.value + '/s'; }
  const color = opts.color || 'white';
  panel.querySelectorAll('[data-scol]').forEach((b) => b.classList.toggle('active', b.dataset.scol === color));
}

// ---------------------------------------------------------------------
// Bouncing Balls' option panel (panel-balls) - Mode buttons (data-ballmode
// "cross"/"own", backed by core.effectOptions.balls.crossFaces) and Balls
// per face slider (core.effectOptions.balls.count) - see balls.js's module
// comment for what each controls.
// ---------------------------------------------------------------------
function wireBallsPanel() {
  const panel = document.getElementById('panel-balls');
  if (!panel) return;
  panel.querySelectorAll('[data-ballmode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-ballmode]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('balls', 'crossFaces', btn.dataset.ballmode === 'cross');
    });
  });
  const count = panel.querySelector('#ball-count'), countVal = panel.querySelector('#ball-count-val');
  if (count) count.addEventListener('input', () => {
    if (countVal) countVal.textContent = count.value;
    setEffectOption('balls', 'count', Number(count.value));
  });
}

function syncBallsPanel() {
  const panel = document.getElementById('panel-balls');
  if (!panel) return;
  const opts = currentState.effectOptions?.balls || {};
  const crossFaces = opts.crossFaces ?? true;
  panel.querySelectorAll('[data-ballmode]').forEach((b) => b.classList.toggle('active', (b.dataset.ballmode === 'cross') === crossFaces));
  const count = panel.querySelector('#ball-count'), countVal = panel.querySelector('#ball-count-val');
  if (count && document.activeElement !== count) { count.value = opts.count ?? 3; if (countVal) countVal.textContent = count.value; }
}

// ---------------------------------------------------------------------
// Overlays panel (data-section="overlays") - global compositing layers
// (stars/snow/fire/lightning/...), NOT a selectable effect, backed by
// src/effects/overlays.js + wsServer.js's setOverlay/setOverlayOption/
// setOverlayGlobalBright commands (see that file's module comment for the
// wire protocol). Unlike every other panel here, the 13 ported overlays
// share a uniform markup convention (.ov-chk[data-ov] toggle, .ov-sl
// [data-ov][data-prop] param sliders, .ov-col[data-ov][data-val] colour
// swatch buttons) - so this wires all of them generically in one loop
// instead of 13 near-identical hand-written blocks. Radio/Spectrum use the
// same .ov-chk markup but have no backend (see greyOutUnsupported) and are
// left alone here - sending setOverlay for a key wsServer.js doesn't
// recognise is just silently dropped, but they're disabled anyway so their
// checkboxes can't be clicked in the first place.
function wireOverlaysPanel() {
  document.querySelectorAll('.ov-chk[data-ov]').forEach((chk) => {
    const key = chk.dataset.ov;
    chk.addEventListener('change', () => send({ cmd: 'setOverlay', key, enabled: chk.checked }));
  });
  document.querySelectorAll('.ov-sl[data-ov][data-prop]').forEach((sl) => {
    const key = sl.dataset.ov, prop = sl.dataset.prop;
    sl.addEventListener('input', () => {
      const valEl = sl.parentElement && sl.parentElement.querySelector('.ov-vl');
      if (valEl) valEl.textContent = sl.value;
      send({ cmd: 'setOverlayOption', key, option: prop, value: Number(sl.value) });
    });
  });
  document.querySelectorAll('.ov-col[data-ov][data-val]').forEach((btn) => {
    const key = btn.dataset.ov;
    btn.addEventListener('click', () => {
      const group = btn.parentElement;
      if (group) group.querySelectorAll('.ov-col[data-ov="' + key + '"]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      send({ cmd: 'setOverlayOption', key, option: 'color', value: btn.dataset.val });
    });
  });
  const gb = document.getElementById('ov-global-bright');
  if (gb) {
    gb.addEventListener('input', () => {
      const lbl = document.getElementById('ov-global-bright-val');
      if (lbl) lbl.textContent = Math.round(gb.value * 100) + '%';
      send({ cmd: 'setOverlayGlobalBright', value: Number(gb.value) });
    });
  }
}

function syncOverlaysPanel() {
  const overlays = currentState.overlays;
  if (!overlays) return;
  document.querySelectorAll('.ov-chk[data-ov]').forEach((chk) => {
    const cfg = overlays[chk.dataset.ov];
    if (cfg && document.activeElement !== chk) chk.checked = !!cfg.on;
  });
  document.querySelectorAll('.ov-sl[data-ov][data-prop]').forEach((sl) => {
    const cfg = overlays[sl.dataset.ov];
    if (!cfg || document.activeElement === sl) return;
    const v = cfg[sl.dataset.prop];
    if (v !== undefined) {
      sl.value = v;
      const valEl = sl.parentElement && sl.parentElement.querySelector('.ov-vl');
      if (valEl) valEl.textContent = v;
    }
  });
  document.querySelectorAll('.ov-col[data-ov][data-val]').forEach((btn) => {
    const cfg = overlays[btn.dataset.ov];
    if (!cfg) return;
    btn.classList.toggle('active', cfg.color === btn.dataset.val);
  });
  const gb = document.getElementById('ov-global-bright');
  if (gb && document.activeElement !== gb && overlays.globalBright !== undefined) {
    gb.value = overlays.globalBright;
    const lbl = document.getElementById('ov-global-bright-val');
    if (lbl) lbl.textContent = Math.round(overlays.globalBright * 100) + '%';
  }
}

// ---------------------------------------------------------------------
// Custom Cube - Face Editor (#panel-editor-section, pe-* ids) assigns an
// effect + sub-options + a per-face overlay subset to each of the 6 cube
// faces, and the Custom Cube effect's own panel (#panel-custom_cube,
// cc-select/cc-load-btn) activates a saved configuration from the library.
// Ported from ui.js's buildPanelEditor()/buildSubOptions() (lines 7-270)
// and effects-scenes.js's ccRefreshSelect() - see customCubeConfig.js's
// module comment for how pi-native unifies the browser's separate
// perFaceEffect(draft)/_customCubeData(active) state into one live `faces`
// array server-side (currentState.customCube.faces), which is why there's
// no "— Use global effect —" option here (that indirection existed only to
// let the draft diverge from what was actually running - not a concept
// this design needs) and no local pe-* draft state at all: every control
// below sends straight to the server and re-renders from the next "state"
// broadcast, same as every other panel in this file.
// ---------------------------------------------------------------------
const CC_FACE_NAMES = ['Front', 'Back', 'Right', 'Left', 'Top', 'Bottom'];
const CC_FACE_OVERLAY_KEYS = ['stars', 'fire', 'sparkle', 'glitch', 'mist', 'snow'];

// Sub-option control set per effect - mirrors ui.js's buildSubOptions()
// (lines 82-107) exactly, restricted to effects actually ported here (e.g.
// no 'video' sub-options - video.js's option is 'bright', already covered
// below; every effect not listed gets no sub-options at all, same as the
// browser's own fall-through for balls/sand/everything-else).
const CC_SUBOPTIONS = {
  fireworks: [
    { key: 'textOn', type: 'toggle', label: 'Show text on cube', default: false },
    { key: 'text', type: 'text', label: 'Text:', placeholder: 'Enter message…' },
  ],
  rain: [
    { key: 'style', type: 'select', label: 'Style:', options: [['colour', 'Colour'], ['matrix', 'Matrix']], default: 'colour' },
  ],
  datetime: [
    { key: 'mode', type: 'select', label: 'Mode:', options: [['time', 'Time'], ['date', 'Date'], ['both', 'Both'], ['full', 'Full']], default: 'time' },
    { key: 'scroll', type: 'toggle', label: 'Scroll', default: false },
  ],
  strobe: [
    { key: 'pattern', type: 'select', label: 'Pattern:', options: [['all', 'Full'], ['checker', 'Alt'], ['faces', 'Faces'], ['rings', 'Rings'], ['diagonal', 'Diag'], ['scanline', 'Scan']], default: 'all' },
    { key: 'speed', type: 'slider', label: 'Speed:', min: 1, max: 30, step: 1, default: 8, fmt: (v) => v + '/s' },
    { key: 'color', type: 'select', label: 'Colour:', options: [['white', 'White'], ['red', 'Red'], ['green', 'Green'], ['blue', 'Blue'], ['cyan', 'Cyan'], ['multi', 'Multi']], default: 'white' },
  ],
  lightspeed: [
    { key: 'speed', type: 'slider', label: 'Speed:', min: 1, max: 20, step: 0.5, default: 8, fmt: (v) => v },
    { key: 'trail', type: 'slider', label: 'Trail:', min: 4, max: 120, step: 2, default: 32, fmt: (v) => v },
    { key: 'nudge', type: 'select', label: 'Nudge:', options: [['0', '0°'], ['1', '1°'], ['2', '2°'], ['5', '5°'], ['10', '10°'], ['20', '20°'], ['45', '45°'], ['90', '90°']], default: '0' },
  ],
  maze: [
    { key: 'runners', type: 'slider', label: 'Runners:', min: 1, max: 6, step: 1, default: 3, fmt: (v) => v },
  ],
  tron: [
    { key: 'bikes', type: 'slider', label: 'Bikes:', min: 2, max: 8, step: 1, default: 4, fmt: (v) => v },
    { key: 'speed', type: 'slider', label: 'Speed:', min: 0.5, max: 3, step: 0.1, default: 1, fmt: (v) => parseFloat(v).toFixed(1) + '×' },
  ],
  video: [
    { key: 'bright', type: 'slider', label: 'Bright:', min: 0.1, max: 2, step: 0.1, default: 1, fmt: (v) => parseFloat(v).toFixed(1) + '×' },
  ],
  // balls/sand/everything else: no sub-options, matching ui.js line 105-107.
};

function ccLibrary() {
  return (currentState.customCube && currentState.customCube.library) || [];
}

function ccFaces() {
  return (currentState.customCube && currentState.customCube.faces) || [null, null, null, null, null, null];
}

// Builds one sub-options control from CC_SUBOPTIONS's declarative spec -
// same 4 control shapes (text/select/slider/toggle) as ui.js's
// buildSubOptions() row()/textInput()/slider()/select()/chk() helpers.
function buildFaceSubOptionRow(f, spec, opts) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:5px;';
  const currentVal = opts[spec.key] !== undefined ? opts[spec.key] : spec.default;
  const commit = (val) => send({ cmd: 'setFaceOpts', face: f, opts: { ...opts, [spec.key]: val } });

  if (spec.type === 'toggle') {
    const tog = document.createElement('span'); tog.className = 'ov-toggle'; tog.style.marginLeft = '0';
    const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = !!currentVal;
    chk.addEventListener('change', () => commit(chk.checked));
    const slider = document.createElement('span'); slider.className = 'ov-slider';
    tog.appendChild(chk); tog.appendChild(slider);
    const lbl = document.createElement('span'); lbl.style.cssText = 'font-size:11px;color:#99b;'; lbl.textContent = spec.label;
    row.appendChild(tog); row.appendChild(lbl);
    return row;
  }

  const lbl = document.createElement('span');
  lbl.style.cssText = 'font-size:11px;color:#778;flex:0 0 72px;';
  lbl.textContent = spec.label;
  row.appendChild(lbl);

  if (spec.type === 'text') {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = spec.placeholder || ''; inp.value = currentVal || '';
    inp.style.cssText = 'flex:1;padding:4px 7px;background:#0a1020;border:1px solid rgba(80,120,255,0.3);color:#ccd;font-size:11px;border-radius:3px;';
    inp.addEventListener('change', () => commit(inp.value));
    row.appendChild(inp);
  } else if (spec.type === 'select') {
    const sel = document.createElement('select');
    sel.style.cssText = 'flex:1;padding:4px 6px;background:#0a1020;border:1px solid rgba(80,120,255,0.3);color:#ccd;font-size:11px;border-radius:3px;';
    spec.options.forEach(([v, l]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = l;
      if (String(currentVal) === v) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => commit(sel.value));
    row.appendChild(sel);
  } else if (spec.type === 'slider') {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:5px;flex:1;';
    const s = document.createElement('input'); s.type = 'range';
    s.min = spec.min; s.max = spec.max; s.step = spec.step; s.value = currentVal;
    s.style.cssText = 'flex:1;';
    const vl = document.createElement('span'); vl.style.cssText = 'font-size:10px;color:#9cd;width:34px;';
    vl.textContent = spec.fmt(currentVal);
    s.addEventListener('input', () => { vl.textContent = spec.fmt(s.value); });
    s.addEventListener('change', () => commit(parseFloat(s.value)));
    wrap.appendChild(s); wrap.appendChild(vl);
    row.appendChild(wrap);
  }
  return row;
}

function buildFaceCard(f) {
  const cfg = ccFaces()[f];
  const div = document.createElement('div');
  div.style.cssText = 'margin-bottom:12px;padding:10px;background:rgba(20,30,60,0.5);border-radius:6px;border:1px solid rgba(80,120,255,0.2);';

  const label = document.createElement('div');
  label.style.cssText = 'font-size:13px;letter-spacing:1px;color:#7aadff;margin-bottom:8px;font-weight:bold;';
  label.textContent = `Face ${f + 1} — ${CC_FACE_NAMES[f]}`;
  div.appendChild(label);

  const sel = document.createElement('select');
  sel.style.cssText = 'width:100%;background:#0a1020;border:1px solid rgba(80,120,255,0.35);color:#ccd;font-size:12px;padding:5px 7px;border-radius:4px;margin-bottom:8px;';
  const optNone = document.createElement('option');
  optNone.value = 'none'; optNone.textContent = '✕ None (blank face)';
  if (!cfg) optNone.selected = true;
  sel.appendChild(optNone);
  Object.entries(effectNames).filter(([k]) => k !== 'custom_cube').forEach(([k, name]) => {
    const o = document.createElement('option'); o.value = k; o.textContent = name;
    if (cfg && cfg.effect === k) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => send({ cmd: 'setFaceEffect', face: f, effect: sel.value === 'none' ? null : sel.value }));
  div.appendChild(sel);

  const subDiv = document.createElement('div');
  subDiv.style.cssText = 'background:rgba(0,0,0,0.2);border-radius:4px;padding:6px 8px;margin-bottom:8px;';
  const specs = cfg && cfg.effect ? CC_SUBOPTIONS[cfg.effect] : null;
  if (specs && specs.length) {
    const opts = cfg.opts || {};
    specs.forEach((spec) => subDiv.appendChild(buildFaceSubOptionRow(f, spec, opts)));
  } else {
    subDiv.style.display = 'none';
  }
  div.appendChild(subDiv);

  const ovLabel = document.createElement('div');
  ovLabel.style.cssText = 'font-size:11px;color:#778;margin-bottom:6px;';
  ovLabel.textContent = 'Overlays on this face:';
  div.appendChild(ovLabel);
  const ovGrid = document.createElement('div');
  ovGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:5px;';
  CC_FACE_OVERLAY_KEYS.forEach((ov) => {
    const lbl = document.createElement('label');
    lbl.style.cssText = 'font-size:12px;color:#99b;display:flex;align-items:center;gap:6px;cursor:pointer;';
    const tog = document.createElement('span'); tog.className = 'ov-toggle'; tog.style.marginLeft = '0';
    const chk = document.createElement('input'); chk.type = 'checkbox';
    chk.checked = !!(cfg && cfg.overlayKeys && cfg.overlayKeys.includes(ov));
    chk.disabled = !cfg; // no face effect assigned yet - nothing to overlay onto
    chk.addEventListener('change', () => {
      const keys = new Set((cfg && cfg.overlayKeys) || []);
      if (chk.checked) keys.add(ov); else keys.delete(ov);
      send({ cmd: 'setFaceOverlays', face: f, overlayKeys: [...keys] });
    });
    const slider = document.createElement('span'); slider.className = 'ov-slider';
    tog.appendChild(chk); tog.appendChild(slider);
    lbl.appendChild(tog); lbl.appendChild(document.createTextNode(ov));
    ovGrid.appendChild(lbl);
  });
  div.appendChild(ovGrid);

  return div;
}

// Full rebuild on every "state" broadcast, same convention as
// renderAlarmList() - simplest way to stay in sync with server-authoritative
// state, at the cost of not preserving in-progress focus/scroll through an
// unrelated broadcast (e.g. a brightness drag elsewhere), an accepted
// trade-off this codebase already makes for the Timers list.
function syncPanelEditor() {
  const el = document.getElementById('pe-faces');
  if (!el || !effectNames || !Object.keys(effectNames).length) return;
  el.innerHTML = '';
  for (let f = 0; f < 6; f += 1) el.appendChild(buildFaceCard(f));
}

function wirePanelEditor() {
  document.getElementById('pe-clear-btn')?.addEventListener('click', () => send({ cmd: 'clearFaces' }));
  document.getElementById('pe-save-btn')?.addEventListener('click', () => {
    const nameEl = document.getElementById('pe-name-input');
    const name = (nameEl?.value || '').trim() || `Cube ${ccLibrary().length + 1}`;
    send({ cmd: 'saveCube', name });
  });
  document.getElementById('pe-load-btn')?.addEventListener('click', () => {
    const sel = document.getElementById('pe-load-select');
    if (!sel || sel.value === '') return;
    const idx = Number(sel.value);
    send({ cmd: 'loadCube', index: idx });
    const nameEl = document.getElementById('pe-name-input');
    const entry = ccLibrary()[idx];
    if (nameEl && entry) nameEl.value = entry.name;
  });
  document.getElementById('pe-del-btn')?.addEventListener('click', () => {
    const sel = document.getElementById('pe-load-select');
    if (!sel || sel.value === '') return;
    send({ cmd: 'deleteCube', index: Number(sel.value) });
  });
}

// Keeps pe-load-select and the Custom Cube effect panel's cc-select in sync
// with currentState.customCube.library - mirrors ui.js's peRefreshSelect()
// (which drove both dropdowns from the same localStorage-backed list).
function syncCustomCubeLibrarySelects() {
  const lib = ccLibrary();
  ['pe-load-select', 'cc-select'].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel || document.activeElement === sel) return;
    const prevVal = sel.value;
    sel.innerHTML = '<option value="">— choose a saved cube —</option>';
    lib.forEach((c, i) => { const o = document.createElement('option'); o.value = i; o.textContent = c.name; sel.appendChild(o); });
    if (prevVal !== '' && Number(prevVal) < lib.length) sel.value = prevVal;
  });
}

// Custom Cube effect's own panel (#panel-custom_cube) - "activate a saved
// cube" picker, ported from effects-scenes.js's ccRefreshSelect()/ui.js's
// cc-select wiring. pi-native's unified `faces`-array design (see
// customCubeConfig.js's module comment) makes this functionally identical
// to the Face Editor's own Load button - both just copy a library entry
// into the live `faces` assignment - so it's wired the same way rather than
// left dead. #cc-active is frontend-only cosmetic state (which library
// entry was last loaded via THIS button) since the unified design has no
// server-side "active cube name" to track once you've loaded one).
let ccLastLoadedName = null;
function wireCustomCubeEffectPanel() {
  document.getElementById('cc-load-btn')?.addEventListener('click', () => {
    const sel = document.getElementById('cc-select');
    if (!sel || sel.value === '') return;
    const idx = Number(sel.value);
    const entry = ccLibrary()[idx];
    send({ cmd: 'loadCube', index: idx });
    ccLastLoadedName = entry ? entry.name : null;
    syncCustomCubeEffectPanel();
  });
}

function syncCustomCubeEffectPanel() {
  const active = document.getElementById('cc-active');
  if (!active) return;
  active.textContent = ccLastLoadedName ? `Active: ${ccLastLoadedName}` : '';
}

function wireFireworksPanel() {
  const panel = document.getElementById('panel-fireworks');
  if (!panel) return;
  panel.querySelectorAll('.strobe-mode-btn[data-fwmode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.strobe-mode-btn[data-fwmode]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('fireworks', 'mode', btn.dataset.fwmode);
    });
  });
  const textOn = panel.querySelector('#fw-text-on');
  if (textOn) textOn.addEventListener('change', () => setEffectOption('fireworks', 'textOn', textOn.checked));
  const textInput = panel.querySelector('#fw-text-input');
  if (textInput) textInput.addEventListener('change', () => setEffectOption('fireworks', 'text', textInput.value));
}

function syncFireworksPanel() {
  const panel = document.getElementById('panel-fireworks');
  if (!panel) return;
  const opts = currentState.effectOptions?.fireworks || {};
  const mode = opts.mode || 'random';
  panel.querySelectorAll('.strobe-mode-btn[data-fwmode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.fwmode === mode);
  });
  const textOn = panel.querySelector('#fw-text-on');
  if (textOn && document.activeElement !== textOn) textOn.checked = !!opts.textOn;
  const textInput = panel.querySelector('#fw-text-input');
  if (textInput && document.activeElement !== textInput) textInput.value = opts.text || '';
}

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
function wireApodPanel() {
  const panel = document.getElementById('panel-apod');
  if (!panel) return;
  const keyBlock = panel.querySelector('#nasa-api-key-input')?.closest('div')?.parentElement;
  if (keyBlock) markUnsupported(keyBlock, 'NASA API key is set via the server’s NASA_API_KEY environment variable, not per-browser.');
  const fetchBtn = panel.querySelector('#apod-fetch-btn');
  if (fetchBtn) fetchBtn.addEventListener('click', () => setEffectOption('apod', 'refresh', ++_apodRefreshToken));
}

function syncApodPanel() {
  const panel = document.getElementById('panel-apod');
  if (!panel) return;
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
  fetch('/api/uploadVideo?name=' + encodeURIComponent(file.name), { method: 'POST', body: file })
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

// ---------------------------------------------------------------------
// Internet Radio's option panel (panel-radio) - the real new backend this
// port added: Stop/volume (dedicated radioStop/setEffectOption('radio',
// 'volume',...) commands), the directory search box (radioSearch command,
// results rendered from currentState.effectStatus.radio.search - see
// wsServer.js's module comment for why search results are broadcast state
// rather than a per-request reply, unlike Bluetooth's btScan), the
// featured RADIO_STATIONS list (station selection -> radioPlay command),
// and the Spectrum Analyser style/band-count/colour-theme/bar-mode/gain/
// scroll-speed/fit-to-screen/auto-gain controls, all via
// core.effectOptions.radio.{spectrumOn,bands,style,theme,barMode,gain,
// scrollSpeed,fitToScreen,autoGain} through the generic setEffectOption
// path - see radio.js's module comment for why this is a LOCAL per-effect
// toggle here rather than the browser's global OV.spectrum overlay, and
// for where gain/auto-gain/fit-to-screen amplitude shaping is applied.
// RADIO_STATIONS is duplicated here (not fetched from the
// server) - same "small static list, client already has it" precedent as
// the browser original itself hard-coding it, and pi-native's Retro/Tron
// panels hard-coding their own per-game/option button markup.
// ---------------------------------------------------------------------
const RADIO_STATIONS = [
  { name: 'SomaFM Groove Salad', genre: 'Ambient/Downtempo', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { name: 'SomaFM Drone Zone', genre: 'Ambient', url: 'https://ice1.somafm.com/dronezone-128-mp3' },
  { name: 'SomaFM Space Station', genre: 'Space Music', url: 'https://ice1.somafm.com/spacestation-128-mp3' },
  { name: 'SomaFM Beat Blender', genre: 'Electronica', url: 'https://ice1.somafm.com/beatblender-128-mp3' },
  { name: 'SomaFM Indie Pop Rocks', genre: 'Indie Pop', url: 'https://ice1.somafm.com/indiepop-128-mp3' },
  { name: 'SomaFM Lush', genre: 'Mellow Vocals', url: 'https://ice1.somafm.com/lush-128-mp3' },
  { name: 'SomaFM Secret Agent', genre: 'Spy Lounge', url: 'https://ice1.somafm.com/secretagent-128-mp3' },
  { name: 'SomaFM Boot Liquor', genre: 'Americana', url: 'https://ice1.somafm.com/bootliquor-128-mp3' },
];

function radioStationRow(station, current) {
  const div = document.createElement('div');
  const isCurrent = current && current.url === station.url;
  div.style.cssText = `padding:6px 8px;margin-bottom:4px;border-radius:4px;cursor:pointer;font-size:11px;background:${isCurrent ? 'rgba(80,120,255,0.22)' : 'rgba(255,255,255,0.04)'};border:1px solid ${isCurrent ? 'rgba(80,120,255,0.5)' : 'rgba(255,255,255,0.08)'};`;
  div.innerHTML = `<div style="color:#dde;font-weight:600;">${isCurrent ? '▶ ' : ''}${station.name}</div>${station.genre ? `<div style="color:#8899bb;font-size:10px;">${station.genre}</div>` : ''}`;
  div.addEventListener('click', () => send({ cmd: 'radioPlay', station }));
  return div;
}

function wireRadioPanel() {
  const panel = document.getElementById('panel-radio');
  if (!panel) return;

  panel.querySelectorAll('.radio-stop-btn-el').forEach((btn) => btn.addEventListener('click', () => send({ cmd: 'radioStop' })));
  panel.querySelectorAll('.radio-vol-el').forEach((sl) => sl.addEventListener('input', () => setEffectOption('radio', 'volume', Number(sl.value))));

  const searchInput = panel.querySelector('.radio-search-input-el');
  const doSearch = () => send({ cmd: 'radioSearch', query: (searchInput?.value || '').trim() });
  panel.querySelector('.radio-search-btn-el')?.addEventListener('click', doSearch);
  searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  panel.querySelector('.radio-browse-top-btn-el')?.addEventListener('click', () => { if (searchInput) searchInput.value = ''; send({ cmd: 'radioSearch', query: '' }); });

  // Featured list is static - render once, click handlers close over the
  // fixed station objects (syncRadioPanel only re-renders it for the
  // "which one is currently playing" highlight, via a full re-render below).
  const featuredEl = panel.querySelector('.radio-station-list-el');
  if (featuredEl) renderFeaturedList(featuredEl, null);

  // Spectrum Analyser sub-panel - the .ov-chk[data-ov="spectrum"] checkbox
  // here is ALSO caught by wireOverlaysPanel's generic loop (sends a
  // harmless setOverlay for a key wsServer.js doesn't recognise, see that
  // function's comment) - this listener does the real work.
  const spectrumChk = panel.querySelector('.ov-chk[data-ov="spectrum"]');
  if (spectrumChk) spectrumChk.addEventListener('change', () => setEffectOption('radio', 'spectrumOn', spectrumChk.checked));

  panel.querySelectorAll('.spectrum-bands-btn[data-bands]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.spectrum-bands-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('radio', 'bands', Number(btn.dataset.bands));
    });
  });
  panel.querySelectorAll('.au-style-btn[data-austyle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.au-style-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('radio', 'style', btn.dataset.austyle);
    });
  });
  panel.querySelectorAll('.au-theme-btn[data-autheme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.au-theme-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('radio', 'theme', Number(btn.dataset.autheme));
    });
  });
  panel.querySelectorAll('.au-barmode-btn[data-barmode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.au-barmode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('radio', 'barMode', btn.dataset.barmode);
    });
  });
  const fitScreenChk = panel.querySelector('.sp-fit-screen-el');
  if (fitScreenChk) fitScreenChk.addEventListener('change', () => setEffectOption('radio', 'fitToScreen', fitScreenChk.checked));
  const autoGainChk = panel.querySelector('.au-autogain-el');
  if (autoGainChk) autoGainChk.addEventListener('change', () => setEffectOption('radio', 'autoGain', autoGainChk.checked));
  const gainSlider = panel.querySelector('.au-gain-el'), gainVal = panel.querySelector('.au-gain-val-el');
  if (gainSlider) gainSlider.addEventListener('input', () => {
    if (gainVal) gainVal.textContent = Number(gainSlider.value).toFixed(1) + '×';
    setEffectOption('radio', 'gain', Number(gainSlider.value));
  });
  const scrollSlider = panel.querySelector('.au-scroll-speed-el'), scrollVal = panel.querySelector('.au-scroll-speed-val-el');
  if (scrollSlider) scrollSlider.addEventListener('input', () => {
    if (scrollVal) scrollVal.textContent = scrollSlider.value;
    setEffectOption('radio', 'scrollSpeed', Number(scrollSlider.value));
  });
}

function renderFeaturedList(el, current) {
  el.innerHTML = '';
  RADIO_STATIONS.forEach((s) => el.appendChild(radioStationRow(s, current)));
}

function renderSearchResults(el, results, current) {
  el.innerHTML = '';
  if (!results || !results.length) return;
  results.forEach((s) => el.appendChild(radioStationRow(s, current)));
}

function syncRadioPanel() {
  const panel = document.getElementById('panel-radio');
  if (!panel) return;
  const status = currentState.effectStatus?.radio;
  const opts = currentState.effectOptions?.radio || {};
  const current = status?.station || null;

  panel.querySelectorAll('.radio-status-el').forEach((el) => {
    if (!status) { el.textContent = 'Pick a station'; return; }
    if (!status.playing) { el.textContent = 'Stopped'; return; }
    const parts = [status.status];
    if (status.playbackStatus && !/^Starting playback/.test(status.playbackStatus)) parts.push(status.playbackStatus);
    el.textContent = (current ? '▶ ' + current.name + (current.genre ? ' — ' + current.genre : '') + ' — ' : '') + parts.join(' — ');
  });
  panel.querySelectorAll('.radio-vol-el').forEach((sl) => { if (document.activeElement !== sl) sl.value = opts.volume ?? status?.volume ?? 0.8; });

  const searchStatusEls = panel.querySelectorAll('.radio-search-status-el');
  const search = status?.search;
  searchStatusEls.forEach((el) => {
    if (!search) { el.textContent = ''; return; }
    if (search.searching) { el.textContent = 'Searching…'; return; }
    if (search.error) { el.textContent = '✕ ' + search.error; return; }
    el.textContent = search.results.length ? search.results.length + ' stations found' : '';
  });
  const resultsEl = panel.querySelector('.radio-search-results-el');
  if (resultsEl && search) renderSearchResults(resultsEl, search.results, current);

  const featuredEl = panel.querySelector('.radio-station-list-el');
  if (featuredEl && featuredEl.dataset.lastCurrent !== (current?.url || '')) {
    featuredEl.dataset.lastCurrent = current?.url || '';
    renderFeaturedList(featuredEl, current);
  }

  const spectrumChk = panel.querySelector('.ov-chk[data-ov="spectrum"]');
  const spectrumOptions = panel.querySelector('.ov-options-el[data-ov="spectrum"]');
  const spectrumOn = !!opts.spectrumOn;
  if (spectrumChk && document.activeElement !== spectrumChk) spectrumChk.checked = spectrumOn;
  if (spectrumOptions) spectrumOptions.style.display = spectrumOn ? '' : 'none';
  panel.querySelectorAll('.spectrum-bands-btn[data-bands]').forEach((btn) => btn.classList.toggle('active', Number(btn.dataset.bands) === (opts.bands ?? 64)));
  panel.querySelectorAll('.au-style-btn[data-austyle]').forEach((btn) => btn.classList.toggle('active', btn.dataset.austyle === (opts.style || 'bars')));
  panel.querySelectorAll('.au-theme-btn[data-autheme]').forEach((btn) => btn.classList.toggle('active', Number(btn.dataset.autheme) === (opts.theme ?? 6)));
  panel.querySelectorAll('.au-barmode-btn[data-barmode]').forEach((btn) => btn.classList.toggle('active', btn.dataset.barmode === (opts.barMode || 'solid')));

  const fitScreenChk = panel.querySelector('.sp-fit-screen-el');
  if (fitScreenChk && document.activeElement !== fitScreenChk) fitScreenChk.checked = !!opts.fitToScreen;
  const autoGainChk = panel.querySelector('.au-autogain-el');
  if (autoGainChk && document.activeElement !== autoGainChk) autoGainChk.checked = !!opts.autoGain;
  const gainSlider = panel.querySelector('.au-gain-el'), gainVal = panel.querySelector('.au-gain-val-el');
  if (gainSlider && document.activeElement !== gainSlider) { gainSlider.value = opts.gain ?? 1; if (gainVal) gainVal.textContent = Number(gainSlider.value).toFixed(1) + '×'; }
  const scrollSlider = panel.querySelector('.au-scroll-speed-el'), scrollVal = panel.querySelector('.au-scroll-speed-val-el');
  if (scrollSlider && document.activeElement !== scrollSlider) { scrollSlider.value = opts.scrollSpeed ?? 0; if (scrollVal) scrollVal.textContent = scrollSlider.value; }
}

// ---------------------------------------------------------------------
// Celestial's option panel (panel-moon) - the 13-way "celestial-body" radio
// group (moon/mercury/venus/earth/mars/jupiter/saturn/uranus/neptune/pluto/
// sun/blackhole/solarsystem), backed by core.effectOptions.moon.body, plus
// the Solar System view's Orbit Speed slider, backed by
// core.effectOptions.moon.solarSpeed - same 0-7 logarithmic-multiplier
// slider as the original (see effects/celestial/solarsystem.js). The
// #solar-speed-row show/hide-on-selection behaviour is verbatim from
// index.html's own inline <script> for this panel (harmless leftover -
// still just toggling a style, no bearing on the WS wiring below).
// ---------------------------------------------------------------------
function wireCelestialPanel() {
  const panel = document.getElementById('panel-moon');
  if (!panel) return;
  panel.querySelectorAll('input[name="celestial-body"]').forEach((r) => {
    r.addEventListener('change', () => { if (r.checked) setEffectOption('moon', 'body', r.value); });
  });
  const speed = panel.querySelector('#solar-speed'), speedLabel = panel.querySelector('#solar-speed-label');
  if (speed) speed.addEventListener('input', () => {
    const mult = Math.pow(10, Number(speed.value));
    if (speedLabel) speedLabel.textContent = mult < 10 ? mult.toFixed(1) + 'x' : Math.round(mult) + 'x';
    setEffectOption('moon', 'solarSpeed', Number(speed.value));
  });
}

function syncCelestialPanel() {
  const panel = document.getElementById('panel-moon');
  if (!panel) return;
  const opts = currentState.effectOptions?.moon || {};
  const body = opts.body || 'moon';
  panel.querySelectorAll('input[name="celestial-body"]').forEach((r) => { r.checked = (r.value === body); });
  const speedRow = panel.querySelector('#solar-speed-row');
  if (speedRow) speedRow.style.display = body === 'solarsystem' ? '' : 'none';
  const speed = panel.querySelector('#solar-speed'), speedLabel = panel.querySelector('#solar-speed-label');
  if (speed && document.activeElement !== speed) {
    speed.value = opts.solarSpeed ?? 0;
    const mult = Math.pow(10, Number(speed.value));
    if (speedLabel) speedLabel.textContent = mult < 10 ? mult.toFixed(1) + 'x' : Math.round(mult) + 'x';
  }
}

// ---------------------------------------------------------------------
// Cube size / 2D panel buttons
// ---------------------------------------------------------------------
function wirePanelButtons() {
  document.querySelectorAll('.size-btn[data-size]').forEach((btn) => {
    const size = Number(btn.dataset.size);
    const mode = btn.dataset.mode === 'panel2d' ? '2d' : 'cube';
    btn.addEventListener('click', () => send({ cmd: 'setPanelConfig', size, mode }));
  });
  syncPanelButtons();
}

function syncPanelButtons() {
  document.querySelectorAll('.size-btn[data-size]').forEach((btn) => {
    const size = Number(btn.dataset.size);
    const mode = btn.dataset.mode === 'panel2d' ? '2d' : 'cube';
    btn.classList.toggle('active', currentState.panelMode === mode && (mode === '2d' || currentState.panelSize === size));
  });
  const label = document.getElementById('cube-label');
  if (label) label.textContent = currentState.panelMode === '2d' ? '2D Panel' : `${currentState.panelSize}×${currentState.panelSize}`;
}

// "✕ Clear All" - see wsServer.js's "clearAll" command comment.
function wireClearAllButton() {
  const btn = document.getElementById('clear-all-btn');
  if (btn) btn.addEventListener('click', () => send({ cmd: 'clearAll' }));
}

function syncClearAllButton() {
  const btn = document.getElementById('clear-all-btn');
  if (btn) btn.classList.toggle('active', !!currentState.blank);
}

// ---------------------------------------------------------------------
// Physical Cube Panels (Setup section) + the "simulation" banner over the
// 3D preview - see wsServer.js's "setPhysicalCubePanels" command comment.
// ---------------------------------------------------------------------
function wirePhysicalPanelsControl() {
  document.querySelectorAll('.physical-panels-btn[data-count]').forEach((btn) => {
    btn.addEventListener('click', () => send({ cmd: 'setPhysicalCubePanels', value: Number(btn.dataset.count) }));
  });
}

function syncPhysicalPanelsControl() {
  const count = currentState.physicalCubePanels ?? 6;
  document.querySelectorAll('.physical-panels-btn[data-count]').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.count) === count);
  });
  const banner = document.getElementById('sim-banner');
  if (!banner) return;
  const show = currentState.panelMode === 'cube' && count < 6;
  banner.style.display = show ? 'block' : 'none';
  if (show) {
    const countEl = document.getElementById('sim-banner-count');
    if (countEl) countEl.textContent = count;
  }
}

// ---------------------------------------------------------------------
// Master brightness / speed sliders (Display section)
// ---------------------------------------------------------------------
function wireSliders() {
  const bright = document.getElementById('bright-slider');
  const brightVal = document.getElementById('bright-val');
  if (bright) {
    bright.addEventListener('input', () => {
      const v = Number(bright.value);
      if (brightVal) brightVal.textContent = Math.round(v * 100) + '%';
      send({ cmd: 'setBrightness', value: v });
    });
  }
  const speed = document.getElementById('speed-slider');
  const speedVal = document.getElementById('speed-val');
  if (speed) {
    speed.addEventListener('input', () => {
      const v = Number(speed.value);
      if (speedVal) speedVal.textContent = v.toFixed(1) + 'x';
      send({ cmd: 'setSpeed', value: v });
    });
  }
}

function syncSliders() {
  const bright = document.getElementById('bright-slider');
  const brightVal = document.getElementById('bright-val');
  if (bright) { bright.value = currentState.brightness; if (brightVal) brightVal.textContent = Math.round(currentState.brightness * 100) + '%'; }
  const speed = document.getElementById('speed-slider');
  const speedVal = document.getElementById('speed-val');
  if (speed) { speed.value = currentState.speed; if (speedVal) speedVal.textContent = Number(currentState.speed).toFixed(1) + 'x'; }
}

// ---------------------------------------------------------------------
// Timers ("alarms") - #alarm-section's list + #alarm-modal's editor.
// Mirrors the browser's own function breakdown (alarmBuildList()/
// alarmOpenEditor()/alarmSetTriggerType()/alarmUpdateSunriseTog() in
// ui.js), but list rendering here builds real DOM client-side from
// currentState.alarms/activeAlarm (the WS "state" broadcast) instead of
// the browser's own local `alarms` array - see effects/alarms.js's module
// comment on the server for the full data model and the effectRise/
// wxRise/playlist scope boundaries this editor deliberately doesn't expose
// UI for (index.html's alarm-modal was trimmed to match: no playlist
// picker beyond a disabled placeholder, no Effect-Rise sub-panel).
const AL_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const OV_NAMES = { stars: '✨ Stars', snow: '❄️ Snow', meteors: '☄️ Meteors', edgeglow: '🔆 Edge Glow', fire: '🔥 Fire', sparkle: '💫 Sparkle', colorwave: '🌊 Color Wave', pulse: '💡 Pulse', scanline: '📡 Scan Line', vignette: '🌑 Vignette', glitch: '📺 Glitch', mist: '🌫️ Mist', lightning: '⚡ Lightning' };
let alarmEditId = null;

function renderAlarmList() {
  const el = document.getElementById('alarm-list-ui');
  if (!el) return;
  const alarms = currentState.alarms || [];
  if (!alarms.length) { el.innerHTML = '<div style="font-size:12px;color:#667;text-align:center;padding:10px 0;">No timers set</div>'; return; }
  el.innerHTML = '';
  alarms.forEach((al) => {
    const h = String(al.hour).padStart(2, '0'), m = String(al.minute).padStart(2, '0');
    const repeatLabel = { once: 'Once', daily: 'Daily', weekdays: 'Weekdays', weekends: 'Weekends', weekly: (al.days || []).map((d) => AL_DAYS[d]).join(','), hourly: 'Hourly' }[al.repeat] || al.repeat;
    const isWd = !!al.prealarm?.windDown;
    const typeLabel = isWd ? 'Wind Down' : 'Alarm';
    const on = al.enabled;
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:5px;background:rgba(20,30,60,0.5);border-radius:6px;border:1px solid rgba(80,120,255,0.18);';
    div.innerHTML = `
      <span class="al-tog" style="display:inline-block;width:28px;height:15px;border-radius:8px;position:relative;cursor:pointer;flex-shrink:0;background:${on ? 'rgba(80,200,120,0.6)' : 'rgba(60,70,100,0.8)'};border:1px solid ${on ? 'rgba(80,200,120,0.8)' : 'rgba(80,120,255,0.3)'};transition:all 0.2s;">
        <span style="position:absolute;top:2px;left:${on ? '13px' : '2px'};width:9px;height:9px;border-radius:50%;background:${on ? '#4d8' : '#668'};transition:all 0.2s;"></span>
      </span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:16px;color:#dde;font-weight:700;letter-spacing:1px;">${h}:${m} <span style="font-size:11px;color:#8899bb;font-weight:600;">${repeatLabel}</span></div>
        <div style="font-size:12px;color:#99aabb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${al.name || ''} <span style="font-size:10px;color:#7aadff;">${typeLabel}</span></div>
      </div>
      <button class="al-edit-btn" style="padding:4px 10px;font-size:11px;background:rgba(80,120,255,0.12);border:1px solid rgba(80,120,255,0.3);color:#7aadff;border-radius:4px;cursor:pointer;">✏</button>
      <button class="al-del-btn" style="padding:4px 10px;font-size:11px;background:rgba(255,60,60,0.08);border:1px solid rgba(255,60,60,0.2);color:#f88;border-radius:4px;cursor:pointer;">✕</button>`;
    div.querySelector('.al-tog').addEventListener('click', () => send({ cmd: 'setAlarmEnabled', id: al.id, enabled: !al.enabled }));
    div.querySelector('.al-edit-btn').addEventListener('click', () => openAlarmEditor(al.id));
    div.querySelector('.al-del-btn').addEventListener('click', () => { if (confirm('Delete timer?')) send({ cmd: 'deleteAlarm', id: al.id }); });
    el.appendChild(div);
  });
}

function wireAlarmSection() {
  document.getElementById('alarm-add-btn')?.addEventListener('click', () => openAlarmEditor(null));
}

function buildOverlayCheckboxes(container, checkedKeys) {
  container.innerHTML = '';
  Object.keys(OV_NAMES).forEach((ov) => {
    const lbl = document.createElement('label');
    lbl.style.cssText = 'font-size:12px;color:#99b;display:flex;align-items:center;gap:6px;cursor:pointer;padding:2px 0;';
    const tog = document.createElement('span'); tog.className = 'ov-toggle'; tog.style.marginLeft = '0';
    const chk = document.createElement('input'); chk.type = 'checkbox'; chk.value = ov;
    chk.checked = (checkedKeys || []).includes(ov);
    const slider = document.createElement('span'); slider.className = 'ov-slider';
    tog.appendChild(chk); tog.appendChild(slider);
    lbl.appendChild(tog); lbl.appendChild(document.createTextNode(OV_NAMES[ov]));
    container.appendChild(lbl);
  });
}

function readCheckedOverlayKeys(container) {
  return Array.from(container.querySelectorAll('input[type=checkbox]:checked')).map((c) => c.value);
}

function populateEffectSelect(sel, selected) {
  sel.innerHTML = '<option value="">─ None (no effect) ─</option>';
  Object.entries(effectNames || {}).filter(([k]) => k !== 'custom_cube').forEach(([k, v]) => {
    const o = document.createElement('option'); o.value = k; o.textContent = v;
    if (k === selected) o.selected = true;
    sel.appendChild(o);
  });
}

function alarmSetTriggerType(type) {
  const eff = type === 'effect';
  document.getElementById('al-type-effect')?.classList.toggle('active', eff);
  document.getElementById('al-type-playlist')?.classList.toggle('active', !eff);
  const effRow = document.getElementById('al-effect-row'), plRow = document.getElementById('al-playlist-row');
  if (effRow) effRow.style.display = eff ? '' : 'none';
  if (plRow) plRow.style.display = eff ? 'none' : '';
}

function openAlarmEditor(id) {
  alarmEditId = id;
  const al = id ? (currentState.alarms || []).find((a) => a.id === id) : null;
  const d = al || {
    name: 'Morning Timer', enabled: true, hour: 7, minute: 30, repeat: 'daily', days: [1, 2, 3, 4, 5],
    triggerType: 'effect', effect: 'wave', overlayKeys: [], message: 'Good Morning! 🌅', prealarm: { enabled: false, preMinutes: 15, startBright: 5 },
  };

  document.getElementById('al-name').value = d.name || '';
  document.getElementById('al-hour').value = d.hour;
  document.getElementById('al-min').value = String(d.minute).padStart(2, '0');
  document.getElementById('al-repeat').value = d.repeat || 'daily';
  document.getElementById('al-message').value = d.message || '';
  document.getElementById('al-pre-mins').value = d.prealarm?.preMinutes || 15;
  document.getElementById('al-dim-start').value = d.prealarm?.startBright || 5;
  document.getElementById('al-dim-val').textContent = (d.prealarm?.startBright || 5) + '%';

  const isWd = !!d.prealarm?.windDown;
  document.getElementById('al-alarm-on').value = isWd ? '0' : '1';
  document.getElementById('al-alarm-opts').style.display = isWd ? 'none' : '';
  document.getElementById('al-alarm-arrow').style.transform = isWd ? '' : 'rotate(90deg)';
  document.getElementById('al-wind-down').value = isWd ? '1' : '0';
  document.getElementById('al-wd-use-effect').checked = !!d.prealarm?.wdUseEffect;
  const wdMinsEl = document.getElementById('al-wd-mins');
  if (wdMinsEl) wdMinsEl.value = d.prealarm?.wdMinutes || 15;
  document.getElementById('al-wd-opts').style.display = isWd ? '' : 'none';
  document.getElementById('al-wd-arrow').style.transform = isWd ? 'rotate(90deg)' : '';
  document.getElementById('al-sunrise-chk').checked = !!d.prealarm?.enabled;
  document.getElementById('al-sunrise-opts').style.display = d.prealarm?.enabled ? 'block' : 'none';
  document.getElementById('al-giant-sun-chk').checked = !!d.prealarm?.giantSun;

  document.querySelectorAll('.al-day-btn').forEach((b) => {
    const dd = +b.dataset.d;
    b.classList.toggle('active', (d.days || []).includes(dd));
  });
  document.getElementById('al-days-row').style.display = d.repeat === 'weekly' ? '' : 'none';

  alarmSetTriggerType(d.triggerType || 'effect');
  populateEffectSelect(document.getElementById('al-effect'), d.effect);
  buildOverlayCheckboxes(document.getElementById('al-overlays'), d.overlayKeys);
  populateEffectSelect(document.getElementById('al-wd-effect'), d.prealarm?.wdEffectKey || currentState.effect);
  buildOverlayCheckboxes(document.getElementById('al-wd-overlays'), d.prealarm?.wdOverlayKeys);
  document.getElementById('al-wd-effect-section').style.display = d.prealarm?.wdUseEffect ? 'none' : '';

  document.getElementById('alarm-modal-title').textContent = id ? 'EDIT TIMER' : 'ADD TIMER';
  document.getElementById('alarm-modal').style.display = 'block';
}

function closeAlarmEditor() {
  document.getElementById('alarm-modal').style.display = 'none';
}

function readAlarmFromModal() {
  const triggerType = document.getElementById('al-type-playlist').classList.contains('active') ? 'playlist' : 'effect';
  const repeat = document.getElementById('al-repeat').value;
  const days = repeat === 'weekly' ? Array.from(document.querySelectorAll('.al-day-btn.active')).map((b) => +b.dataset.d) : [];
  const isWd = document.getElementById('al-wind-down').value === '1';
  return {
    name: document.getElementById('al-name').value || 'Timer',
    enabled: true,
    hour: Math.max(0, Math.min(23, parseInt(document.getElementById('al-hour').value, 10) || 0)),
    minute: Math.max(0, Math.min(59, parseInt(document.getElementById('al-min').value, 10) || 0)),
    repeat, days,
    triggerType,
    effect: document.getElementById('al-effect').value || '',
    overlayKeys: readCheckedOverlayKeys(document.getElementById('al-overlays')),
    playlistName: '',
    message: document.getElementById('al-message').value || '',
    prealarm: {
      enabled: !isWd && document.getElementById('al-sunrise-chk').checked,
      preMinutes: parseInt(document.getElementById('al-pre-mins').value, 10) || 15,
      startBright: parseInt(document.getElementById('al-dim-start').value, 10) || 5,
      giantSun: document.getElementById('al-giant-sun-chk').checked,
      windDown: isWd,
      wdMinutes: parseInt(document.getElementById('al-wd-mins').value, 10) || 15,
      wdUseEffect: document.getElementById('al-wd-use-effect').checked,
      wdEffectKey: document.getElementById('al-wd-effect').value || '',
      wdOverlayKeys: readCheckedOverlayKeys(document.getElementById('al-wd-overlays')),
    },
  };
}

function wireAlarmModal() {
  document.getElementById('al-type-effect')?.addEventListener('click', () => alarmSetTriggerType('effect'));
  // Playlist trigger type is a permanent scope boundary (see this file's
  // module comment + effects/alarms.js) - the button is disabled in
  // index.html so this click handler never fires from it, kept out
  // entirely rather than wired to a dead end.
  document.getElementById('al-repeat')?.addEventListener('change', (e) => {
    document.getElementById('al-days-row').style.display = e.target.value === 'weekly' ? '' : 'none';
  });
  document.querySelectorAll('.al-day-btn').forEach((b) => b.addEventListener('click', () => b.classList.toggle('active')));
  document.getElementById('al-dim-start')?.addEventListener('input', (e) => {
    document.getElementById('al-dim-val').textContent = e.target.value + '%';
  });
  document.getElementById('al-sunrise-chk')?.addEventListener('change', (e) => {
    document.getElementById('al-sunrise-opts').style.display = e.target.checked ? 'block' : 'none';
  });
  document.getElementById('al-alarm-hdr')?.addEventListener('click', () => {
    const on = document.getElementById('al-alarm-on').value === '1';
    document.getElementById('al-alarm-on').value = on ? '0' : '1';
    document.getElementById('al-wind-down').value = on ? '1' : '0';
    document.getElementById('al-alarm-opts').style.display = on ? 'none' : '';
    document.getElementById('al-alarm-arrow').style.transform = on ? '' : 'rotate(90deg)';
    document.getElementById('al-wd-opts').style.display = on ? '' : 'none';
    document.getElementById('al-wd-arrow').style.transform = on ? 'rotate(90deg)' : '';
  });
  document.getElementById('al-wd-hdr')?.addEventListener('click', () => {
    const on = document.getElementById('al-wind-down').value === '1';
    document.getElementById('al-wind-down').value = on ? '0' : '1';
    document.getElementById('al-alarm-on').value = on ? '1' : '0';
    document.getElementById('al-wd-opts').style.display = on ? 'none' : '';
    document.getElementById('al-wd-arrow').style.transform = on ? '' : 'rotate(90deg)';
    document.getElementById('al-alarm-opts').style.display = on ? '' : 'none';
    document.getElementById('al-alarm-arrow').style.transform = on ? 'rotate(90deg)' : '';
  });
  document.getElementById('al-wd-use-effect')?.addEventListener('change', (e) => {
    document.getElementById('al-wd-effect-section').style.display = e.target.checked ? 'none' : '';
  });
  document.getElementById('al-save-btn')?.addEventListener('click', () => {
    const alarm = readAlarmFromModal();
    if (alarmEditId) send({ cmd: 'updateAlarm', id: alarmEditId, alarm });
    else send({ cmd: 'addAlarm', alarm });
    closeAlarmEditor();
  });
  document.getElementById('al-cancel-btn')?.addEventListener('click', closeAlarmEditor);
}

// ---------------------------------------------------------------------
// Collapsible sections/sub-sections - the original app's ui.js normally
// handles this; reimplemented minimally here since ui.js isn't loaded.
// ---------------------------------------------------------------------
function wireCollapsibles() {
  document.querySelectorAll('.section-head, .sub-head').forEach((head) => {
    head.addEventListener('click', () => {
      const parent = head.closest('.sidebar-section, .sub-section');
      if (parent) parent.classList.toggle('collapsed');
    });
  });
}

// ---------------------------------------------------------------------
// Grey out sections pi-native has no backend for yet: Custom
// Faces (freehand pixel-art drawing onto each face - a different feature
// from Custom Cube's per-face EFFECT assignment below, and not ported),
// Standalone Mode, Clear All, ESP32 Firmware Update (that's an ESP32-only
// OTA flow, meaningless on the Pi). Timers (#alarm-section) is NOT in this
// list - it's fully wired, see wireAlarmSection(). #panel-editor-section
// (Face Editor) is NOT in this list either - it's fully wired, see
// wirePanelEditor()/syncPanelEditor() below (Custom Cube's per-face effect
// assignment UI).
// ---------------------------------------------------------------------
function greyOutUnsupported() {
  const bySelector = [
    '#custom-faces-section',
  ];
  bySelector.forEach((sel) => markUnsupported(document.querySelector(sel)));

  // Radio and Spectrum are the two overlays deliberately NOT ported (see
  // src/effects/overlays.js's module comment: radio is an audio-only no-op
  // in the browser too, spectrum needs an audio-input pipeline pi-native
  // doesn't have) - grey out just those two items rather than the whole
  // Overlays section, which is otherwise fully wired (see wireOverlaysPanel).
  markUnsupported(document.getElementById('ovi-radio'), 'Audio playback has no equivalent here - not ported.');
  markUnsupported(document.getElementById('ovi-spectrum'), 'No audio-input pipeline in pi-native - not ported.');

  // Firmware Update has no id - match by its header text.
  document.querySelectorAll('.sidebar-section').forEach((section) => {
    const head = section.querySelector('.section-head');
    if (head && head.textContent.includes('Firmware Update')) markUnsupported(section);
  });
}

function markUnsupported(el, message) {
  if (!el) return;
  el.classList.add('pi-unsupported');
  el.querySelectorAll('input, button, select, textarea').forEach((ctrl) => {
    if (ctrl.classList.contains('section-head') || ctrl.classList.contains('sub-head')) return;
    ctrl.disabled = true;
  });
  const body = el.querySelector('.section-body') || el;
  if (body && !body.querySelector('.pi-unsupported-note')) {
    const note = document.createElement('div');
    note.className = 'pi-unsupported-note';
    note.textContent = message || 'Not available in the Pi-native engine yet.';
    body.insertBefore(note, body.firstChild);
  }
}

// ---------------------------------------------------------------------
// Setup section's Bluetooth pairing panel - this one IS wired, since it
// matches pi-native's actual bluetooth.js backend 1:1 (see wsServer.js's
// btScan/btStatus/btDiscoverable/btRoutePhoneAudio commands).
// ---------------------------------------------------------------------
function wireBluetooth() {
  const scanBtn = document.querySelector('.bt-scan-btn-el');
  const refreshBtn = document.querySelector('.bt-refresh-btn-el');
  const statusEl = document.querySelector('.bt-status-el');
  const listEl = document.querySelector('.bt-device-list-el');
  const discoverableBtn = document.querySelector('.bt-discoverable-btn-el');
  const routeBtn = document.querySelector('.bt-route-phone-btn-el');
  const phoneStatusEl = document.querySelector('.bt-phone-status-el');

  if (scanBtn) scanBtn.addEventListener('click', () => { if (statusEl) statusEl.textContent = 'Scanning (~6s)...'; send({ cmd: 'btScan' }); });
  if (refreshBtn) refreshBtn.addEventListener('click', () => { if (statusEl) statusEl.textContent = 'Checking paired devices...'; send({ cmd: 'btStatus' }); });
  if (discoverableBtn) discoverableBtn.addEventListener('click', () => { if (phoneStatusEl) phoneStatusEl.textContent = 'Opening pairing window (~120s)...'; send({ cmd: 'btDiscoverable' }); });
  if (routeBtn) routeBtn.addEventListener('click', () => { if (phoneStatusEl) phoneStatusEl.textContent = 'Routing phone audio...'; send({ cmd: 'btRoutePhoneAudio' }); });

  window._btUi = { statusEl, listEl, phoneStatusEl };
}

function handleBtResult(msg) {
  const { statusEl, listEl, phoneStatusEl } = window._btUi || {};
  if (!msg.ok) {
    if (statusEl) statusEl.textContent = 'Error: ' + (msg.error || 'unknown');
    return;
  }
  if (msg.cmd === 'btScanResult' || msg.cmd === 'btStatusResult') {
    if (statusEl) statusEl.textContent = `${msg.devices.length} device(s) found.`;
    if (listEl) {
      listEl.innerHTML = '';
      for (const d of msg.devices) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 0;font-size:11px;';
        row.innerHTML = `<span style="flex:1;">${d.name}</span><span style="color:#778;font-family:monospace;font-size:10px;">${d.mac}</span>`;
        const pairBtn = document.createElement('button');
        pairBtn.textContent = 'Pair';
        pairBtn.style.cssText = 'padding:3px 8px;background:rgba(80,120,255,0.15);border:1px solid rgba(80,120,255,0.4);color:#7aadff;border-radius:4px;cursor:pointer;font-size:10px;';
        pairBtn.onclick = () => { if (statusEl) statusEl.textContent = 'Pairing with ' + d.name + '...'; send({ cmd: 'btPair', mac: d.mac }); };
        row.appendChild(pairBtn);
        listEl.appendChild(row);
      }
    }
  } else if (phoneStatusEl && (msg.cmd === 'btDiscoverableResult' || msg.cmd === 'btRoutePhoneAudioResult')) {
    phoneStatusEl.textContent = 'OK';
  }
}

// ---------------------------------------------------------------------
// Video Wall layout editor - Pi-native-only, no original-app equivalent.
// Lives directly in the main preview area (#wall-preview, right of the
// sidebar), not a separate abstract grid tucked away in the sidebar - you
// see the actual live per-panel feeds while placing new ones, and drag/
// click straight onto the real layout to put a new display above, below,
// left, or right of an existing one. A fixed WALL_COLS x WALL_ROWS grid
// (matches panelConfig.js's WALL_MAX_COLS/WALL_MAX_ROWS - the same 2x3
// physical topology already wired for cube mode, so up to 6 displays
// total) of cells: filled ones are live-updating canvases (draggable,
// with a × to remove), empty ones are dashed drop-targets/click-to-add-
// here placeholders. Every change sends a full layout to the server,
// which is the single source of truth - the grid always re-renders from
// the next "state" message rather than assuming its own optimistic
// result, so a rejected/invalid drag just snaps back on the next state
// echo. The #wall-toolbar "+" button is the entry point for switching
// INTO wall mode from cube/2D in the first place (always visible, not
// gated on already being in wall mode); rebuildWallPreview() itself only
// renders the full editable grid once wall mode is actually active.
// ---------------------------------------------------------------------
const WALL_COLS = 2, WALL_ROWS = 3;
let _wallDragFrom = null;

function wireWallToolbar() {
  const addBtn = document.getElementById('wall-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => send({ cmd: 'addPanel' }));
}

function currentWallPanels() {
  // Outside wall mode there's still exactly one physical panel (whatever
  // 2d/cube mode is showing) - represent it as a single fixed tile at
  // (0,0) so a layout change sent from here (e.g. the first click/drag)
  // has an obvious existing panel to place a new one alongside.
  return currentState.panelMode === 'wall' && Array.isArray(currentState.panels) && currentState.panels.length
    ? currentState.panels
    : [{ gx: 0, gy: 0 }];
}

// First click/drag while still in 2d/cube mode needs to both switch into
// wall mode AND carry the new layout in the same message, since the
// server's setPanelPositions command requires already being in wall mode
// (see wsServer.js) - setPanelConfig accepts an optional panels array for
// exactly this transition.
function sendWallLayout(panels) {
  if (currentState.panelMode === 'wall') send({ cmd: 'setPanelPositions', panels });
  else send({ cmd: 'setPanelConfig', size: currentState.panelSize || 64, mode: 'wall', panels });
}

// ---------------------------------------------------------------------
// Preview - two completely different renderers, matching the original
// app exactly: 2D-panel mode never used WebGL at all (see ui.js's
// renderPanel2d()/#panel2d-canvas), it draws round LED dots on a plain 2D
// canvas; only cube mode (6 faces) uses the Three.js/WebGL cube on #c.
// ---------------------------------------------------------------------
let renderer, scene, camera, group;
let panel2dCanvas, panel2dCtx;
const PANEL2D_OUT = 512; // fixed backing resolution, same as ui.js's renderPanel2d()

let wallPreviewEl;
const wallPanelCanvases = {}; // panel index -> {canvas, ctx}
const WALL_CELL = 130; // preview px per panel, including its border/gap

function initScene() {
  panel2dCanvas = document.getElementById('panel2d-canvas');
  panel2dCanvas.width = PANEL2D_OUT;
  panel2dCanvas.height = PANEL2D_OUT;
  panel2dCtx = panel2dCanvas.getContext('2d');
  wallPreviewEl = document.getElementById('wall-preview');

  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  // No lights: this repo's three.min.js is a custom stripped-down build
  // (see build-tools/three-entry.js) that only exports what cube.js's own
  // InstancedMesh needs, which is unlit (vertex colors, no lighting model)
  // - THREE.AmbientLight etc. simply aren't in the bundle. Not needed here
  // either: the cube preview's per-LED spheres use MeshBasicMaterial,
  // which is self-lit.
  window.addEventListener('resize', resizeRenderer);
  resizeRenderer();
  rebuildScene();
  animate();
}

function resizeRenderer() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fitPanel2dCanvas();
}

// Matches cube.js's fitPanel2d(): fit the fixed-resolution square canvas
// into the viewport with a margin, via CSS size (the backing resolution
// stays PANEL2D_OUT regardless).
function fitPanel2dCanvas() {
  const buf = 20;
  const size = Math.min(window.innerWidth - buf * 2, window.innerHeight - buf * 2);
  panel2dCanvas.style.width = size + 'px';
  panel2dCanvas.style.height = size + 'px';
}

// No textures here either: same custom-bundle constraint as the missing
// AmbientLight above (see build-tools/three-entry.js) - CanvasTexture etc.
// aren't exported since the real cube.js never uses textures. It instead
// colors each LED via an InstancedMesh's per-instance color, so the cube
// preview does the same thing here: one InstancedMesh per face, one
// sphere instance per pixel (matching cube.js's own SphereGeometry LED
// look), colored directly from the incoming binary frame.
function rebuildScene() {
  if (group) scene.remove(group);
  group = new THREE.Group();
  scene.add(group);
  for (const key in faceCanvases) delete faceCanvases[key];

  const size = currentState.panelSize || 64;
  const mode = currentState.panelMode;
  panel2dCanvas.style.display = mode === '2d' ? 'block' : 'none';
  wallPreviewEl.style.display = mode === 'wall' ? 'block' : 'none';
  document.getElementById('c').style.display = mode === 'cube' ? 'block' : 'none';
  if (mode === '2d') { fitPanel2dCanvas(); return; } // drawn straight into panel2dCtx by handleFrame(), no Three.js scene needed
  if (mode === 'wall') { rebuildWallPreview(); return; } // ditto, drawn into per-panel 2D canvases

  const spacing = 2 / size;                    // matches cube.js's SPACING = TOTAL_SPAN/(SIZE-1) scaled to a 2-unit face
  const geom = new THREE.SphereGeometry(spacing * 0.44, 6, 5); // segment counts kept low: up to 6 * SIZE^2 instances
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let face = 0; face < 6; face++) {
    const mesh = new THREE.InstancedMesh(geom, new THREE.MeshBasicMaterial(), size * size);
    for (let v = 0; v < size; v++) {
      for (let u = 0; u < size; u++) {
        const i = v * size + u;
        dummy.position.set(-1 + spacing * (u + 0.5), -1 + spacing * (v + 0.5), 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, color.setRGB(0, 0, 0));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;

    const xf = FACE_XFORM[face];
    mesh.position.set(xf.pos[0] * 1.001, xf.pos[1] * 1.001, xf.pos[2] * 1.001);
    mesh.rotation.set(xf.rot[0], xf.rot[1], xf.rot[2]);
    group.add(mesh);
    faceCanvases[face] = { mesh, size };
  }

  camera.position.set(2.6, 2.0, 2.6);
  camera.lookAt(0, 0, 0);
}

function animate() {
  requestAnimationFrame(animate);
  if (currentState.panelMode !== 'cube') return; // 2D and wall modes never touch the WebGL renderer
  const autoRotate = document.getElementById('auto-rotate-chk');
  if (group && (!autoRotate || autoRotate.checked)) group.rotation.y += 0.003;
  renderer.render(scene, camera);
}

const _frameColor = new THREE.Color();

// Ported verbatim (math unchanged) from ui.js's renderPanel2d(): round LED
// dots on black, drawn straight into the 2D canvas - no WebGL involved.
function drawPanel2dFrame(bytes) {
  const size = currentState.panelSize;
  const cell = PANEL2D_OUT / size;
  const r = cell * 0.44;
  panel2dCtx.fillStyle = '#000';
  panel2dCtx.fillRect(0, 0, PANEL2D_OUT, PANEL2D_OUT);
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      const o = 1 + (v * size + u) * 3;
      const fv = size - 1 - v;
      panel2dCtx.fillStyle = `rgb(${bytes[o]},${bytes[o + 1]},${bytes[o + 2]})`;
      panel2dCtx.beginPath();
      panel2dCtx.arc((u + 0.5) * cell, (fv + 0.5) * cell, r, 0, Math.PI * 2);
      panel2dCtx.fill();
    }
  }
  panel2dCtx.strokeStyle = '#99ddff';
  panel2dCtx.lineWidth = 2;
  panel2dCtx.strokeRect(1, 1, PANEL2D_OUT - 2, PANEL2D_OUT - 2);
}

// Same round-dot-on-black technique as drawPanel2dFrame(), one small
// canvas per EXISTING panel (drawWallPanelFrame() below keeps them live-
// updating), plus a dashed placeholder for every other cell in the fixed
// WALL_COLS x WALL_ROWS grid so there's always somewhere to drag onto or
// click to add a new display above/below/left/right of the current
// layout - see this section's module comment. wallPanelCanvases stays
// keyed by each panel's INDEX INTO currentState.panels (not gx/gy),
// matching the wire protocol's per-panel frame index (see handleFrame()).
function rebuildWallPreview() {
  wallPreviewEl.innerHTML = '';
  for (const key in wallPanelCanvases) delete wallPanelCanvases[key];
  if (currentState.panelMode !== 'wall') return; // full grid only makes sense once wall mode is actually active - see wireWallToolbar()'s "+"  for how you get there
  const panels = currentState.panels || [];
  wallPreviewEl.style.width = (WALL_COLS * WALL_CELL) + 'px';
  wallPreviewEl.style.height = (WALL_ROWS * WALL_CELL) + 'px';

  for (let gy = 0; gy < WALL_ROWS; gy++) {
    for (let gx = 0; gx < WALL_COLS; gx++) {
      const idx = panels.findIndex((p) => p.gx === gx && p.gy === gy);
      const cell = document.createElement('div');
      cell.className = 'wall-cell ' + (idx >= 0 ? 'filled' : 'empty');
      cell.style.left = (gx * WALL_CELL) + 'px';
      cell.style.top = (gy * WALL_CELL) + 'px';
      cell.style.width = (WALL_CELL - 6) + 'px';
      cell.style.height = (WALL_CELL - 6) + 'px';

      cell.addEventListener('dragover', (e) => { if (idx < 0) { e.preventDefault(); cell.classList.add('drop-target'); } });
      cell.addEventListener('dragleave', () => cell.classList.remove('drop-target'));
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('drop-target');
        if (!_wallDragFrom || idx >= 0) return; // only drop onto empty cells
        const next = currentWallPanels().map((p) => (p.gx === _wallDragFrom.gx && p.gy === _wallDragFrom.gy ? { gx, gy } : p));
        sendWallLayout(next);
        _wallDragFrom = null;
      });

      if (idx >= 0) {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256; // fixed backing resolution per panel, same spirit as PANEL2D_OUT
        canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.position = 'static';
        canvas.draggable = true;
        canvas.addEventListener('dragstart', () => { _wallDragFrom = { gx, gy }; cell.classList.add('dragging'); });
        canvas.addEventListener('dragend', () => cell.classList.remove('dragging'));
        cell.appendChild(canvas);
        wallPanelCanvases[idx] = canvas.getContext('2d');

        const remove = document.createElement('span');
        remove.className = 'wall-remove';
        remove.textContent = '×';
        remove.title = 'Remove this display';
        remove.addEventListener('click', (e) => {
          e.stopPropagation();
          if (panels.length <= 1) return; // keep at least one
          send({ cmd: 'removePanel', gx, gy });
        });
        cell.appendChild(remove);
      } else {
        cell.title = 'Add a display here';
        cell.addEventListener('click', () => sendWallLayout([...currentWallPanels(), { gx, gy }]));
      }
      wallPreviewEl.appendChild(cell);
    }
  }
}

function drawWallPanelFrame(ctx, bytes) {
  const size = currentState.panelSize;
  const out = 256;
  const cell = out / size;
  const r = cell * 0.44;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, out, out);
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      const o = 1 + (v * size + u) * 3;
      const fv = size - 1 - v;
      ctx.fillStyle = `rgb(${bytes[o]},${bytes[o + 1]},${bytes[o + 2]})`;
      ctx.beginPath();
      ctx.arc((u + 0.5) * cell, (fv + 0.5) * cell, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function handleFrame(buf) {
  const bytes = new Uint8Array(buf);
  const face = bytes[0];
  if (currentState.panelMode === '2d') {
    if (face === 0) drawPanel2dFrame(bytes);
    return;
  }
  if (currentState.panelMode === 'wall') {
    const ctx = wallPanelCanvases[face]; // "face" byte is a panel index here, not a cube face
    if (ctx) drawWallPanelFrame(ctx, bytes);
    return;
  }
  const entry = faceCanvases[face];
  if (!entry) return;
  const { mesh, size } = entry;
  for (let i = 0; i < size * size; i++) {
    const o = 1 + i * 3;
    _frameColor.setRGB(bytes[o] / 255, bytes[o + 1] / 255, bytes[o + 2] / 255);
    mesh.setColorAt(i, _frameColor);
  }
  mesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------------
// connect() (the real control channel) runs first and unconditionally.
// initScene() (just the cosmetic 3D preview) is wrapped in try/catch so a
// bug in it can never again take the rest of startup down with it - that's
// exactly what happened here: an uncaught exception in initScene() aborted
// this handler before the connect() call after it ever ran, silently
// leaving every effect/panel/slider button wired to a `ws` that was never
// created, so every click's send() no-op'd on `ws && ws.readyState===OPEN`.
document.addEventListener('DOMContentLoaded', () => {
  wireCollapsibles();
  wirePanelButtons();
  wireSliders();
  wireBluetooth();
  wireWallToolbar();
  wireClearAllButton();
  wirePhysicalPanelsControl();
  wireRainPanel();
  wireLightspeedPanel();
  wireCamPanel();
  wireApodPanel();
  wireUnsplashPanel();
  wireArticPanel();
  wireGalleryShared();
  wireJokePanel();
  wireTriviaPanel();
  wireOtdPanel();
  wireTriviaFactsShared();
  wireWeatherPanel();
  wireEpicPanel();
  wireIssPanel();
  wireNeoPanel();
  wireMazePanel();
  wireTronPanel();
  wireDatetimePanel();
  wireDicePanel();
  wireCoinflipPanel();
  wireFireworksPanel();
  wireRetroPanel();
  wireVideoPanel();
  wireStrobePanel();
  wireBallsPanel();
  wireRadioPanel();
  wireCelestialPanel();
  wireOverlaysPanel();
  wirePanelEditor();
  wireCustomCubeEffectPanel();
  wireAlarmSection();
  wireAlarmModal();
  greyOutUnsupported();
  loadEffectNames();
  connect();
  try {
    initScene();
  } catch (err) {
    console.error('[app] 3D preview failed to start (controls are unaffected):', err);
  }
});
