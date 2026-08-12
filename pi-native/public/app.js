// Wires the (verbatim-copied) browser-app sidebar markup to pi-native's own
// WS control protocol. This is NOT the original ui.js - that file assumes
// an ESP32 streaming target and computes every effect in-browser, neither
// of which applies here (the Pi computes effects itself and only streams
// back small per-face preview frames). This script instead:
//   - drives the small set of controls pi-native actually has a backend
//     for (effect selection, cube-size/2D panel mode, master brightness/
//     speed, the Pi-only Bluetooth pairing panel in the Setup section)
//   - greys out everything else the markup contains but pi-native doesn't
//     support yet (Overlays, Custom Faces, Panel Editor, Timers, ESP32
//     Firmware Update, Standalone Mode, Clear All) so the page still looks
//     like the familiar app instead of silently doing nothing on click
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
const WIRED_OPTION_PANELS = new Set(['rain', 'lightspeed', 'cam', 'weather', 'maze', 'tron', 'dice', 'coinflip', 'random', 'fireworks', 'retro', 'video']);

let ws;
let effectNames = {};
let currentState = { effect: null, brightness: 1, speed: 1, panelSize: 64, panelMode: '2d' };
const faceCanvases = {};

function connect() {
  ws = new WebSocket(`ws://${location.hostname}:${location.port || 8081}`);
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
    syncWeatherPanel();
    syncMazePanel();
    syncTronPanel();
    syncDicePanel();
    syncCoinflipPanel();
    syncFireworksPanel();
    syncRetroPanel();
    syncVideoPanel();
    renderWallGrid();
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
function wireVideoPanel() {
  const panel = document.getElementById('panel-video');
  if (!panel) return;

  ['vid-file-btn', 'img-file-btn', 'vid-screen-btn', 'vid-cam-btn', 'vid-stop-btn'].forEach((id) => {
    const btn = panel.querySelector('#' + id);
    if (btn) { btn.disabled = true; btn.title = 'Not available on the Pi-native engine - use the URL field below instead'; btn.style.opacity = 0.35; }
  });

  const url = panel.querySelector('#vid-url');
  const loadBtn = panel.querySelector('#vid-load-btn');
  const submit = () => { if (url) setEffectOption('video', 'url', url.value.trim()); };
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
  });

  const statusEl = document.getElementById('vid-status');
  if (statusEl) statusEl.textContent = currentState.effectStatus?.video || 'No source loaded';
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
// Grey out sections pi-native has no backend for yet: Overlays, Custom
// Faces, Panel Editor, Timers, Standalone Mode, Clear All, ESP32 Firmware
// Update (that's an ESP32-only OTA flow, meaningless on the Pi).
// ---------------------------------------------------------------------
function greyOutUnsupported() {
  const bySelector = [
    '[data-section="overlays"]',
    '#custom-faces-section',
    '#panel-editor-section',
    '#alarm-section',
    '#standalone-mode-bar',
    '#fx-toggle-bar',
  ];
  bySelector.forEach((sel) => markUnsupported(document.querySelector(sel)));

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
// A fixed WALL_COLS x WALL_ROWS grid (matches panelConfig.js's
// WALL_MAX_COLS/WALL_MAX_ROWS - the same 2x3 physical topology already
// wired for cube mode) of drag-and-drop tiles. "+" (or clicking an empty
// cell) adds a panel; dragging a filled tile onto an empty cell moves it;
// the × removes it. Every change sends a full layout to the server, which
// is the single source of truth - this grid always re-renders from the
// next "state" message rather than assuming its own optimistic result,
// so a rejected/invalid drag just snaps back on the next state echo.
// ---------------------------------------------------------------------
const WALL_COLS = 2, WALL_ROWS = 3;
let _wallDragFrom = null;

function wireWallGrid() {
  const addBtn = document.getElementById('wall-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => send({ cmd: 'addPanel' }));
  renderWallGrid();
}

function currentWallPanels() {
  // Outside wall mode there's still exactly one physical panel (whatever
  // 2d/cube mode is showing) - represent it as a single fixed tile at
  // (0,0) so the grid always has something to show and the "+" button (or
  // an empty-cell click) has an obvious first panel to add alongside.
  return currentState.panelMode === 'wall' && Array.isArray(currentState.panels) && currentState.panels.length
    ? currentState.panels
    : [{ gx: 0, gy: 0 }];
}

function renderWallGrid() {
  const grid = document.getElementById('wall-grid');
  if (!grid) return;
  const panels = currentWallPanels();
  grid.innerHTML = '';
  for (let gy = 0; gy < WALL_ROWS; gy++) {
    for (let gx = 0; gx < WALL_COLS; gx++) {
      const panel = panels.find((p) => p.gx === gx && p.gy === gy);
      const cell = document.createElement('div');
      cell.dataset.gx = gx; cell.dataset.gy = gy;
      cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drop-target'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('drop-target'));
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('drop-target');
        if (!_wallDragFrom || panel) return; // only drop onto empty cells
        const next = currentWallPanels().map((p) => (p.gx === _wallDragFrom.gx && p.gy === _wallDragFrom.gy ? { gx, gy } : p));
        sendWallLayout(next);
        _wallDragFrom = null;
      });

      if (panel) {
        cell.className = 'wall-cell filled';
        cell.draggable = true;
        cell.textContent = `${gx},${gy}`;
        cell.addEventListener('dragstart', () => { _wallDragFrom = { gx, gy }; cell.classList.add('dragging'); });
        cell.addEventListener('dragend', () => cell.classList.remove('dragging'));
        const remove = document.createElement('span');
        remove.className = 'wall-remove';
        remove.textContent = '×';
        remove.title = 'Remove this display';
        remove.addEventListener('click', (e) => {
          e.stopPropagation();
          if (currentWallPanels().length <= 1) return; // keep at least one
          send({ cmd: 'removePanel', gx, gy });
        });
        cell.appendChild(remove);
      } else {
        cell.className = 'wall-cell empty';
        cell.textContent = '+';
        cell.addEventListener('click', () => sendWallLayout([...currentWallPanels(), { gx, gy }]));
      }
      grid.appendChild(cell);
    }
  }
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
// canvas per panel, positioned via absolute CSS to match its (gx,gy) grid
// position - so dragging a tile in the sidebar and seeing it move here
// use the exact same layout data (currentState.panels).
function rebuildWallPreview() {
  wallPreviewEl.innerHTML = '';
  for (const key in wallPanelCanvases) delete wallPanelCanvases[key];
  const panels = currentState.panels || [];
  const cols = Math.max(1, ...panels.map((p) => p.gx + 1));
  const rows = Math.max(1, ...panels.map((p) => p.gy + 1));
  wallPreviewEl.style.width = (cols * WALL_CELL) + 'px';
  wallPreviewEl.style.height = (rows * WALL_CELL) + 'px';
  panels.forEach((p, idx) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256; // fixed backing resolution per panel, same spirit as PANEL2D_OUT
    canvas.style.left = (p.gx * WALL_CELL) + 'px';
    canvas.style.top = (p.gy * WALL_CELL) + 'px';
    canvas.style.width = (WALL_CELL - 4) + 'px';
    canvas.style.height = (WALL_CELL - 4) + 'px';
    wallPreviewEl.appendChild(canvas);
    wallPanelCanvases[idx] = canvas.getContext('2d');
  });
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
  wireWallGrid();
  wireRainPanel();
  wireLightspeedPanel();
  wireCamPanel();
  wireWeatherPanel();
  wireMazePanel();
  wireTronPanel();
  wireDicePanel();
  wireCoinflipPanel();
  wireFireworksPanel();
  wireRetroPanel();
  wireVideoPanel();
  greyOutUnsupported();
  loadEffectNames();
  connect();
  try {
    initScene();
  } catch (err) {
    console.error('[app] 3D preview failed to start (controls are unaffected):', err);
  }
});
