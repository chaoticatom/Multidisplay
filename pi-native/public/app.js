// Wires the sidebar markup to pi-native's WS control protocol. The Pi computes
// effects; this page sends commands, greys out controls with no backend, wires
// the Timers, Face Editor, Overlays and Bluetooth panels, and renders a 3D
// preview from the per-face frames the server streams.
// APP_VERSION is shown in the footer and must match package.json; it is
// bumped by `npm run release`. Clicking it does a plain hard reload.
const APP_VERSION = '0.6.287';

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
const WIRED_OPTION_PANELS = new Set(['countdown', 'ai_art', 'my_photos', 'message', 'snake', 'pixel_pet', 'epic', 'rain', 'lightspeed', 'cam', 'weather', 'maze', 'tron', 'dice', 'coinflip', 'random', 'fireworks', 'retro', 'video', 'strobe', 'balls', 'radio', 'datetime', 'moon', 'apod', 'iss', 'neo', 'unsplash', 'artic', 'joke', 'trivia', 'otd', 'custom_cube']);
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

// window.MULTIDISPLAY_SIM is set by index.html only on the GitHub Pages
// build (see sim/README.md) - everywhere else (a real Pi's own served
// page) this is undefined and connect()/send() behave exactly as before,
// talking to a real wsServer.js over a real WebSocket. In sim mode there is
// no server at all: public/sim-loopback.js runs the same effect-computation
// code locally (bundled from src/core.js/src/effects/index.js/src/tick.js)
// and feeds handleTextMessage()/handleFrame() directly, so neither of those
// functions (nor anything downstream of them) needs to know the difference.
function connect() {
  if (window.MULTIDISPLAY_SIM) {
    const loop = window.__simLoopback;
    loop.onText(handleTextMessage);
    loop.onFrame(handleFrame);
    // Deferred, not called synchronously here - connect() runs before
    // initScene() in the DOMContentLoaded handler below, and (unlike a
    // real WebSocket, whose "open"/first message always arrives async)
    // calling handleTextMessage() synchronously would run rebuildScene()
    // against a 3D scene/2D canvas context that doesn't exist yet.
    setTimeout(() => handleTextMessage(loop.initialState()), 0);
    setConnStatus('simulator');
    return;
  }
  // Matches whichever transport the page itself was loaded over - plain
  // ws:// on the regular HTTP port, or wss:// on the HTTPS port (see
  // wsServer.js's module comment: a second TLS listener on port+1 exists
  // solely so getUserMedia()/getDisplayMedia() work at all, since browsers
  // refuse them entirely outside a secure context). A page loaded over
  // https:// trying to open a plain ws:// connection would be blocked as
  // mixed content anyway, so this isn't optional once HTTPS is in play.
  const wsScheme = location.protocol === 'https:' ? 'wss' : 'ws';
  clearTimeout(reconnectTimer);
  setConnStatus(reconnectAttempts ? 'reconnecting' : 'connecting');
  // No port in the address means the default one (443 for https, set up with
  // HTTPS_PORT); only a plain-http page with no port falls back to 8081.
  const wsHost = location.port || wsScheme === 'wss' ? location.host : location.hostname + ':8081';
  const sock = new WebSocket(`${wsScheme}://${wsHost}`);
  ws = sock;
  ws.binaryType = 'arraybuffer';
  ws.onmessage = (ev) => {
    lastMessageMs = Date.now();
    if (typeof ev.data !== 'string') { if (isAudioPacket(ev.data)) handleSyncAudio(ev.data); else handleFrame(ev.data); return; }
    // One malformed message must not take down the handler for the rest
    // of the session.
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { console.warn('[ws] ignoring unparseable message', e); return; }
    handleTextMessage(msg);
  };
  // A real report: "need it to check asap" - the paired-devices list sat
  // on "Not checked yet" until the first 15s auto-refresh tick, because
  // wireBluetooth()'s initial send({cmd:'btStatus'}) runs at page-wiring
  // time, well before this WebSocket connection actually finishes
  // opening - send() silently no-ops on a socket that isn't OPEN yet (see
  // its own definition), so that first attempt was just dropped. Checking
  // here instead, right as the connection actually opens, is the earliest
  // point a real request could possibly succeed.
  ws.onopen = () => {
    reconnectAttempts = 0;
    lastMessageMs = Date.now();
    setConnStatus('connected');
    // Anything clicked while disconnected is sent now, in order, rather
    // than silently lost (the btStatus drop described above was exactly
    // that failure).
    wsReady = false; // flushed once the Pi lets us in - see flushPending()
    if (syncAudio.on) { send({ cmd: 'audioSub', on: true }); syncAudio.next = 0; } // a new connection: ask for the audio again
    send({ cmd: 'btStatus' });
  };
  // onclose fires after onerror too - a single guarded scheduler means an
  // error+close pair can't queue two reconnects.
  ws.onclose = () => { if (ws === sock) scheduleReconnect(); };
  ws.onerror = () => sock.close();
}

// Reconnect with exponential backoff (1s, 2s, 4s ... capped at 15s, plus
// jitter so several open tabs don't reconnect in lockstep after the Pi
// reboots) instead of hammering every 2s forever.
let reconnectTimer = null, reconnectAttempts = 0, lastMessageMs = 0;
function scheduleReconnect() {
  setConnStatus('reconnecting');
  clearTimeout(reconnectTimer);
  const delay = Math.min(15000, 1000 * 2 ** reconnectAttempts) * (0.8 + Math.random() * 0.4);
  reconnectAttempts++;
  reconnectTimer = setTimeout(connect, delay);
}

// Half-open socket detection: the Pi streams preview frames continuously
// while any client is connected, so total silence for STALE_MS means the
// connection died without a close (Pi lost WiFi, laptop slept) - force a
// reconnect instead of sitting on a dead socket indefinitely.
const STALE_MS = 10000;
setInterval(() => {
  if (window.MULTIDISPLAY_SIM || !ws || ws.readyState !== WebSocket.OPEN || !wsReady) return; // nothing streams before the PIN
  if (document.visibilityState === 'visible' && Date.now() - lastMessageMs > STALE_MS) ws.close();
}, 3000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') lastMessageMs = Date.now(); // background tabs get throttled; don't misread that as a dead socket
});

// Messages sent while not connected are queued (bounded) and flushed on
// reconnect - see ws.onopen.
const pendingSends = [];
const MAX_PENDING_SENDS = 50;
// wsReady: the Pi has let this page in (sent its state, or accepted the
// PIN). Until then commands wait in the queue - sent earlier, the Pi took
// each as an un-PINned request and asked for the PIN again.
let wsReady = false;
function flushPending() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  for (const m of pendingSends.splice(0)) ws.send(m);
}
function send(obj) {
  if (window.MULTIDISPLAY_SIM) { window.__simLoopback.send(obj); return; }
  const data = JSON.stringify(obj);
  if (ws && ws.readyState === WebSocket.OPEN && wsReady) { ws.send(data); return; }
  if (pendingSends.length >= MAX_PENDING_SENDS) pendingSends.shift();
  pendingSends.push(data);
}

// Connection status pill in the header (see #conn-status in index.html) -
// previously nothing showed the page had lost the Pi, so clicks just
// silently did nothing. Controls are dimmed while not connected.
function setConnStatus(status) {
  const el = document.getElementById('conn-status');
  document.body.classList.toggle('offline', status !== 'connected' && status !== 'simulator');
  if (!el) return;
  el.dataset.status = status;
  el.textContent = status === 'reconnecting' ? offlineText() : { connected: 'Connected', connecting: 'Connecting…', simulator: 'Simulator' }[status] || status;
}
// While the Pi can't be reached: how long since we last heard from it.
function offlineText() {
  if (!lastMessageMs) return 'Reconnecting…';
  const s = Math.round((Date.now() - lastMessageMs) / 1000);
  const ago = s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h';
  return 'Pi offline - last seen ' + ago + ' ago · retrying';
}
setInterval(() => {
  const el = document.getElementById('conn-status');
  if (el && el.dataset.status === 'reconnecting' && /^Pi offline|^Reconnecting/.test(el.textContent)) el.textContent = offlineText();
}, 1000);

let _lastStateJson = '';
// Control PIN (see src/pinConfig.js). Remembered per browser; asked for
// when the Pi says one is needed or the stored one is wrong.
function storedPin() { try { return localStorage.getItem('controlPin') || ''; } catch (e) { return ''; } }
function rememberPin(p) { try { if (p) localStorage.setItem('controlPin', p); else localStorage.removeItem('controlPin'); } catch (e) { /* storage unavailable */ } }
let authAsking = false;
async function answerAuth(failed) {
  if (authAsking) return; // one PIN box at a time
  authAsking = true;
  try {
    let pin = failed ? '' : storedPin(), remember = true;
    if (!pin) ({ pin, remember } = await pinPad(failed ? 'Wrong PIN - try again' : 'Enter the control PIN'));
    rememberPin(remember ? pin : '');
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ cmd: 'auth', pin }));
  } finally { authAsking = false; }
}
// The PIN keypad (it was the browser's plain prompt box). Resolves with
// { pin, remember }. Digits by tap, or typed - a PIN may contain letters.
function pinPad(title) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'tm-modal'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = '<div class="tm-sheet" style="max-width:340px;margin:auto;text-align:center">'
      + '<div style="font-size:30px">🔒</div><b class="pp-title" style="display:block;margin:4px 0 12px"></b>'
      + '<input class="pp-in" type="password" inputmode="numeric" autocomplete="current-password" aria-label="PIN" style="width:100%;box-sizing:border-box;text-align:center;font-size:26px;letter-spacing:8px;padding:10px;border-radius:14px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit">'
      + '<div class="pp-keys" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0"></div>'
      + '<label class="check-row" style="justify-content:center"><input type="checkbox" class="pp-rem" checked> Remember on this device</label>'
      + '<button type="button" class="ui-btn-primary pp-ok" style="width:100%;margin-top:10px">Unlock</button></div>';
    wrap.querySelector('.pp-title').textContent = title;
    const inp = wrap.querySelector('.pp-in'), keys = wrap.querySelector('.pp-keys');
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓']) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = k;
      b.style.cssText = 'font-size:22px;padding:14px 0;border-radius:16px';
      b.setAttribute('aria-label', k === '⌫' ? 'Delete' : k === '✓' ? 'Unlock' : k);
      b.addEventListener('click', () => { if (k === '⌫') inp.value = inp.value.slice(0, -1); else if (k === '✓') done(); else inp.value += k; inp.focus(); });
      keys.append(b);
    }
    const done = () => { if (!inp.value) { inp.focus(); return; } wrap.remove(); resolve({ pin: inp.value, remember: wrap.querySelector('.pp-rem').checked }); };
    wrap.querySelector('.pp-ok').addEventListener('click', done);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
    document.body.append(wrap);
    setTimeout(() => inp.focus(), 50);
  });
}

function handleTextMessage(msg) {
  if (msg.cmd === 'diag') { renderDiag(msg); return; }
  if (msg.cmd === 'systemNotice') { const el = document.getElementById('conn-status'); if (el) { el.dataset.status = 'reconnecting'; el.textContent = msg.text; } return; }
  if (msg.cmd === 'authRequired') { answerAuth(false); return; }
  if (msg.cmd === 'authFailed') { rememberPin(''); answerAuth(true); return; }
  if (msg.cmd === 'clockPong') { syncClockPong(msg); return; }
  if (msg.cmd === 'authOk') { wsReady = true; flushPending(); return; }
  if (msg.cmd === 'role') {
    document.body.classList.toggle('guest', msg.role === 'guest');
    // A device that already knows the PIN goes straight to full control.
    if (msg.role === 'guest') { closeFxSheet(); if (storedPin() && ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ cmd: 'auth', pin: storedPin() })); }
    return;
  }
  if (msg.cmd === 'aiResult') { cxAiResult(msg); return; }
  if (msg.cmd === 'controlPinResult') {
    if (!msg.ok) alert(msg.error);
    else rememberPin(msg.set ? (document.getElementById('pin-input')?.dataset.pending || '') : '');
    const inp = document.getElementById('pin-input'); if (inp) { inp.value = ''; delete inp.dataset.pending; }
    return;
  }
  if (msg.cmd === 'state' && ws && !ws._pvSent) { ws._pvSent = true; if (cxPreviewOff()) cxApplyPreviewOff(true); }
  if (msg.cmd === 'state' && !wsReady) { wsReady = true; flushPending(); }
  if (msg.cmd === 'state') {
    // Every command triggers a state broadcast, and each one re-runs ~40
    // panel sync functions (several rebuild whole lists). An identical
    // repeat (common: another client's no-op, a reconnect) changes nothing,
    // so skip it entirely.
    const json = JSON.stringify(msg);
    if (json === _lastStateJson) return;
    _lastStateJson = json;
    const modeChanged = msg.panelMode !== currentState.panelMode || msg.panelSize !== currentState.panelSize
      || JSON.stringify(msg.panels) !== JSON.stringify(currentState.panels);
    currentState = msg;
    cxOnState();
    syncUpdateStatus();
    syncRecents();
    syncEffectButtons();
    syncPanelButtons();
    syncPinStatus();
    syncMusicReact();
    placeActivePanels();
    renderScenes();
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
    syncRadarPanel();
    syncCelestialPanel();
    syncOverlaysPanel();
    syncPanelEditor();
    syncCustomCubeLibrarySelects();
    syncCustomCubeEffectPanel();
    renderAlarmList();
    cxRenderAutoShow();
    fxSheetSync();
    syncAccessChecks();
    syncClearAllButton();
    syncIdentifyPanelsButton();
    renderWallLayoutList();
    // Re-renders the wall grid on every state update (not just a mode
    // change) so adding/removing/dragging a panel is reflected immediately -
    // rebuildWallPreview() itself no-ops when not in wall mode. modeChanged
    // still separately triggers the full rebuildScene() (cube/2D<->wall
    // canvas visibility, WebGL scene teardown, etc) below.
    if (!modeChanged) rebuildWallPreview();
    if (modeChanged) rebuildScene();
  } else if (msg.cmd && (msg.cmd.startsWith('bt') || msg.cmd === 'updateResult' || msg.cmd === 'drawListResult') && msg.cmd.endsWith('Result')) {
    handleBtResult(msg);
  }
}

// ---------------------------------------------------------------------
// Effect buttons - the sidebar markup already has every effect as a
// .effect-btn[data-effect] element; just wire the ones pi-native actually
// has a registered effect for, and grey out the rest.
// ---------------------------------------------------------------------
async function loadEffectNames() {
  // Relative, not root-absolute ('/effects.json') - both resolve the same
  // way when this page is served from a Pi's server root, but only the
  // relative form also works when the whole public/ folder is redeployed
  // under a URL subpath, as GitHub Pages' simulator build does (see
  // sim/README.md) - MULTIDISPLAY_SIM doesn't gate this on purpose, so the
  // Pi path stays exercised by the exact same code as the sim path.
  const resp = await fetch('effects.json');
  effectNames = await resp.json();
  document.querySelectorAll('.effect-btn[data-effect]').forEach((btn) => {
    const key = btn.dataset.effect;
    const panel = document.getElementById('panel-' + key);
    if (Object.prototype.hasOwnProperty.call(effectNames, key)) {
      btn.addEventListener('click', () => {
        // Leaving Video Display: only the selected effect is ticked, so the
        // video source would never tear itself down (causing flicker). Send
        // stopVideoSource, stop any browser camera/screen capture, and reset the
        // stored url so Video Display starts fresh if reselected.
        const wasRunning = currentState.effect === key && !currentState.blank;
        if (currentState.effect === 'video' && key !== 'video') {
          stopBrowserCapture();
          send({ cmd: 'stopVideoSource' });
          setEffectOption('video', 'source', 'url');
          setEffectOption('video', 'url', '');
        }
        send({ cmd: 'setEffect', effect: key });
        // Its options (e.g. Internet Radio's station list) live on the Now
        // tab - go there, or tapping an effect with options seemed to do
        // nothing (a real report: "nothing happens when I click internet radio").
        if (key === 'radio') setTab('music');
        // Settings open only when tapping the effect that's already running (or
        // via ⚙ Options) - jumping up on every pick meant scrolling back down
        // to the tiles each time.
        else if (panel && wasRunning) { setTab('play'); setTimeout(cxShowOptions, 60); }
        // Immediate feedback: the 'active' highlight only moves once the
        // Pi's state echo arrives, which can take a visible moment on a
        // busy Pi - mark this button pending until then (cleared in
        // syncEffectButtons()).
        document.querySelectorAll('.effect-btn.pending').forEach((b) => b.classList.remove('pending'));
        if (currentState.effect !== key) btn.classList.add('pending');
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

// Shows the running effect under the page title, so it's visible without
// scrolling the long effects list to find the highlighted button.
function updateActiveEffectLabel() {
  // Now-playing pills under the title: the effect showing and the radio
  // station playing - each jumps to the tab that controls it.
  const el = document.getElementById('active-effect-label');
  if (!el) return;
  const btn = document.querySelector(`.effect-btn[data-effect="${CSS.escape(currentState.effect || '')}"]`);
  const name = currentState.blank ? 'Off' : (btn ? btn.textContent.replace(/[◈▸]/g, '').trim() : currentState.effect) || '';
  const st = currentState.effectStatus?.radio;
  const station = st && st.playing && st.station ? st.station.name.replace(/^[\s-]+/, '') : '';
  const key = name + '|' + station;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  const pill = (text, tab, cls) => {
    const b = document.createElement('button');
    b.className = 'now-pill ' + cls; b.textContent = text; b.title = text;
    b.addEventListener('click', () => setTab(tab));
    return b;
  };
  el.replaceChildren(...[name && pill('▶ ' + name, 'play', 'now-pill-fx'), station && pill('♫ ' + station, 'music', 'now-pill-radio')].filter(Boolean));
}

// Effects search box + "Show unavailable" toggle. While a query is typed,
// every sub-section is shown expanded (only matching buttons visible, empty
// sub-sections hidden); clearing it restores the normal collapsed layout.
// Screen readers announced most sliders/selects as just "slider" - they're
// laid out with a separate text label div rather than a <label>. Give each
// unlabelled control an aria-label from the nearest preceding label-ish
// text (its own row label, or the text of the element just before it).
function labelUnlabelledControls() {
  document.querySelectorAll('input[type=range], select, input[type=number], input[type=text], input[type=color]').forEach((el) => {
    if (el.getAttribute('aria-label') || el.labels?.length || el.getAttribute('aria-labelledby')) return;
    let text = '';
    for (let n = el.previousElementSibling; n && !text; n = n.previousElementSibling) text = n.textContent.trim();
    for (let p = el.parentElement; p && !text; p = p.parentElement) {
      for (let n = p.previousElementSibling; n && !text; n = n.previousElementSibling) text = n.textContent.trim();
      if (p.classList.contains('effect-panel')) break;
    }
    if (text) el.setAttribute('aria-label', text.replace(/\s+/g, ' ').slice(0, 60));
  });
}

// Diagnostics section (see src/diagnostics.js on the Pi).
let _lastDiag = null;
function renderDiag(d) {
  _lastDiag = d;
  const tb = document.querySelector('#diag-table tbody');
  if (!tb || tb.closest('.sidebar-section')?.classList.contains('collapsed')) return; // don't touch the DOM while hidden
  const fmtUp = (s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
  const rows = [
    ['Version', d.version], ['Mode', d.mode], ['Render thread', d.renderThread],
    ['Frame rate', `${d.fps} fps`, d.fps < 25], ['Render time', d.renderMsAvg == null ? '-' : `${d.renderMsAvg} ms avg, ${d.renderMsMax} ms max`, d.renderMsMax > 30],
    ['CPU (all threads)', `${d.cpuPct}%`, d.cpuPct > 150], ['Load (1 min)', d.load1], ['Memory', `${d.rssMB} MB (heap ${d.heapMB} MB)`],
    ['Temperature', d.tempC == null ? 'n/a' : `${d.tempC.toFixed(1)} °C`, d.tempC > 75], ['Uptime', fmtUp(d.uptimeS)],
    ['Radio', d.radio], ['Radio output', d.radioPlayback],
  ];
  // Health checks every 5 minutes (see src/health.js): a steady climb in
  // app memory or child processes over the hours points at a leak.
  if (d.net) {
    rows.push(['Internet', d.net.online ? 'connected' : 'OFFLINE (' + d.net.failures + ' checks)', !d.net.online]);
    rows.push(['Cloudflare tunnel', d.net.tunnel || '-', d.net.tunnel && !['active', 'activating', 'not installed', 'unknown'].includes(d.net.tunnel)]);
    if (d.net.lastFix) rows.push(['Last network fix', d.net.lastFix]);
  }
  const hl = d.health || [];
  if (hl.length) {
    const last = hl[hl.length - 1], first = hl[0];
    rows.push(['Pi free memory', `${last.freeMB} of ${last.totalMB} MB`, last.freeMB < last.totalMB * 0.1]);
    rows.push(['Child processes', last.children == null ? 'n/a' : String(last.children), last.children > 25]);
    rows.push(['Memory trend', `${first.rssMB} → ${last.rssMB} MB since ${first.t}`, last.rssMB > first.rssMB * 1.5 && last.rssMB - first.rssMB > 50]);
  }
  tb.replaceChildren(...rows.map(([k, v, warn]) => {
    const tr = document.createElement('tr');
    const a = document.createElement('td'); a.textContent = k;
    const b = document.createElement('td'); b.textContent = v == null ? '-' : String(v); if (warn) b.className = 'warn';
    tr.append(a, b); return tr;
  }));
  const log = document.getElementById('diag-log');
  if (log) {
    if (!d.log.length) log.textContent = 'None';
    else log.replaceChildren(...d.log.slice().reverse().map((e) => { const div = document.createElement('div'); div.className = e.level; div.textContent = `${e.t} ${e.msg}`; return div; }));
  }
}
function wireDiagnostics() {
  document.getElementById('diag-copy-btn')?.addEventListener('click', async () => {
    if (!_lastDiag) return;
    const text = JSON.stringify({ ...(_lastDiag), page: APP_VERSION, userAgent: navigator.userAgent }, null, 2);
    try { await navigator.clipboard.writeText(text); document.getElementById('diag-copy-btn').textContent = 'Copied ✓'; }
    catch (e) { window.prompt('Copy this report:', text); }
    setTimeout(() => { const b = document.getElementById('diag-copy-btn'); if (b) b.textContent = 'Copy report'; }, 1500);
  });
}

function wireMusicReact() {
  const chk = document.getElementById('music-react-chk'), amt = document.getElementById('music-react-amt'), val = document.getElementById('music-react-val');
  chk?.addEventListener('change', () => send({ cmd: 'setMusicReact', on: chk.checked }));
  amt?.addEventListener('input', () => { if (val) val.textContent = Math.round(amt.value * 100) + '%'; send({ cmd: 'setMusicReact', amount: Number(amt.value) }); });
}
function syncMusicReact() {
  const m = currentState.musicReact || { on: false, amount: 0.6 };
  const chk = document.getElementById('music-react-chk'), amt = document.getElementById('music-react-amt'), val = document.getElementById('music-react-val');
  if (chk && document.activeElement !== chk) chk.checked = !!m.on;
  if (amt && document.activeElement !== amt) { amt.value = m.amount; if (val) val.textContent = Math.round(m.amount * 100) + '%'; }
  const row = document.getElementById('music-react-row'); if (row) row.style.opacity = m.on ? '1' : '0.45';
}

function wireRestartButtons() {
  document.getElementById('restart-app-btn')?.addEventListener('click', () => {
    if (confirm('Restart the display app? The panels go dark for a few seconds.')) send({ cmd: 'restartApp' });
  });
  document.getElementById('reboot-pi-btn')?.addEventListener('click', () => {
    if (confirm('Reboot the Raspberry Pi? It takes about a minute to come back.')) send({ cmd: 'rebootPi' });
  });
}

function wirePinControls() {
  const inp = document.getElementById('pin-input');
  document.getElementById('pin-save-btn')?.addEventListener('click', () => {
    const pin = (inp?.value || '').trim();
    if (!/^[0-9A-Za-z]{4,32}$/.test(pin)) { alert('PIN must be 4-32 letters or digits'); return; }
    inp.dataset.pending = pin;
    send({ cmd: 'setControlPin', pin });
  });
  document.getElementById('pin-clear-btn')?.addEventListener('click', () => {
    if (confirm('Remove the control PIN? Anyone on your network will be able to use this page.')) send({ cmd: 'setControlPin', pin: '' });
  });
}
function syncPinStatus() {
  const el = document.getElementById('pin-status');
  if (el) el.textContent = currentState.controlPinSet ? 'PIN set - new browsers must enter it.' : 'No PIN - anyone on your network can use this page.';
}

// ── Tabs: Now / Effects / Overlays / Timers / Settings ─────────────────
// Each sidebar section belongs to one tab (by its heading); only the active
// tab's sections show, open. The chosen tab is remembered per browser.
const TAB_OF_SECTION = [
  ['Effects', 'play'], ['Draw on a Face', 'play'], ['Music', 'music'], ['Overlays', 'schedule'], ['Timers', 'schedule'], ['Auto show', 'schedule'],
  ['Display', 'setup'], ['AI assistant', 'setup'], ['System', 'setup'],
];
// Tab names before the Play/Music/Schedule/Setup redesign, so a browser
// that remembered one lands somewhere sensible.
const OLD_TABS = { now: 'play', effects: 'play', overlays: 'schedule', timers: 'schedule', settings: 'setup' };
// ── Effect categories: a chip row above the effect tiles replaces opening
// and closing each group. "All" shows every group, labelled. ──
function wireEffectChips() {
  const body = document.getElementById('effects-body');
  const filterRow = body?.querySelector('.effect-filter-row');
  if (!body || !filterRow || document.getElementById('effect-chips')) return;
  const groups = [...body.querySelectorAll(':scope > .sub-section')].filter((g) => g.querySelector(':scope > .sub-head'));
  const row = document.createElement('div');
  row.id = 'effect-chips';
  row.className = 'effect-chips';
  const names = groups.map((g) => g.querySelector(':scope > .sub-head').textContent.replace(/[▾▸◈]/g, '').trim());
  const choose = (i) => {
    body.classList.toggle('only-favs', i === -2);
    row.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(i === -2 ? j === 0 : j === i + 2)));
    groups.forEach((g, j) => {
      g.classList.toggle('chip-hidden', i >= 0 && j !== i);
      if (i < 0 || j === i) g.classList.remove('collapsed');
    });
    body.classList.toggle('chips-all', i < 0);
    try { localStorage.setItem('fxChip', String(i)); } catch (e) { /* storage unavailable */ }
  };
  ['★', 'All', ...names].forEach((n, k) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = n.replace(/ &.*$/, '');
    b.title = k === 0 ? 'Favourites' : n;
    b.addEventListener('click', () => choose(k - 2));
    row.appendChild(b);
  });
  filterRow.after(row);
  let saved = -1;
  try { saved = Number(localStorage.getItem('fxChip') ?? -1); } catch (e) { /* storage unavailable */ }
  choose(saved >= -2 && saved < groups.length ? saved : -1);
}

const OVERLAY_DESC = {
  stars: 'Little stars twinkle on top', snow: 'Snowflakes drift down', meteors: 'Shooting stars streak across',
  edgeglow: 'A glowing rim around the edges', fire: 'Flames along the bottom edge', sparkle: 'Glitter falls like rain',
  colorwave: 'A colour wash sweeps across', pulse: 'Everything gently breathes', scanline: 'A retro scan line rolls past',
  vignette: 'Darkens the edges', glitch: 'Random digital glitches', mist: 'A soft rainbow haze',
  lightning: 'Occasional lightning flashes', spectrum: 'Music bars over any effect',
};
function addOverlayDescriptions() {
  document.querySelectorAll('.ov-item').forEach((item) => {
    const key = item.querySelector('.ov-chk')?.dataset.ov;
    const name = item.querySelector('.ov-name');
    if (!key || !name || !OVERLAY_DESC[key] || name.querySelector('.ov-desc')) return;
    const d = document.createElement('span');
    d.className = 'ov-desc'; d.textContent = OVERLAY_DESC[key];
    name.appendChild(d);
  });
}

function wireTabs() {
  wireEffectChips();
  addOverlayDescriptions();
  const sections = [...document.querySelectorAll('#sidebar-scroll > .sidebar-section')];
  for (const sec of sections) {
    if (sec.dataset.tab) continue;
    const head = sec.querySelector(':scope > .section-head')?.textContent || '';
    const hit = TAB_OF_SECTION.find(([t]) => head.includes(t));
    sec.dataset.tab = hit ? hit[1] : 'setup';
  }
  // Tabs with a single section drop its accordion header and keep it open.
  const counts = {};
  for (const sec of sections) counts[sec.dataset.tab] = (counts[sec.dataset.tab] || 0) + 1;
  for (const sec of sections) if (counts[sec.dataset.tab] === 1) { sec.classList.add('tab-solo'); sec.classList.remove('collapsed'); }
  document.querySelectorAll('#tab-bar [data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  let tab = 'play';
  try { tab = localStorage.getItem('tab') || 'play'; } catch (e) { /* storage unavailable */ }
  setTab(tab);
}
// Recent effects as one-tap chips on the Play tab: recorded from the Pi's own
// state, so a pick from a tile, a scene, a timer or the playlist all count.
let recentShown = null;
function syncRecents() {
  const fx = currentState.effect; if (!fx || !effectNames[fx]) return;
  let list = [];
  try { list = JSON.parse(localStorage.getItem('recentFx') || '[]'); } catch (e) { /* storage unavailable */ }
  if (list[0] !== fx) { list = [fx, ...list.filter((k) => k !== fx)].slice(0, 7); try { localStorage.setItem('recentFx', JSON.stringify(list)); } catch (e) { /* storage unavailable */ } }
  const key = list.join(',');
  if (key === recentShown) return;
  recentShown = key;
  const row = document.getElementById('recent-row'); if (!row) return;
  const others = list.slice(1).filter((k) => effectNames[k]);
  row.hidden = !others.length;
  row.replaceChildren(...others.map((k) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = '↺ ' + effectNames[k]; b.title = 'Show ' + effectNames[k] + ' again'; b.addEventListener('click', () => send({ cmd: 'setEffect', effect: k })); return b; }));
}

// Buttons that show only an emoji get a name for screen readers and
// long-press hints, from their title (or a nearby label) if they lack one.
function labelIconButtons(root = document) {
  root.querySelectorAll('button:not([aria-label])').forEach((b) => {
    const text = (b.textContent || '').trim();
    if (/[A-Za-z0-9]/.test(text)) return;
    const name = b.title || b.dataset.label || '';
    if (name) b.setAttribute('aria-label', name);
  });
}
new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) labelIconButtons(n.tagName === 'BUTTON' ? n.parentNode || n : n); }).observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => labelIconButtons()); else labelIconButtons();

// Setup search: hides the Setup sections that don't mention the words typed
// and opens the ones that do.
function wireSetupSearch() {
  const inp = document.getElementById('setup-search-in'); if (!inp) return;
  const run = () => {
    const words = inp.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    document.querySelectorAll('#sidebar-scroll > .sidebar-section[data-tab="setup"]').forEach((sec) => {
      const hit = !words.length || words.every((w) => sec.textContent.toLowerCase().includes(w));
      sec.classList.toggle('search-miss', !hit);
      if (hit) shown++;
      if (hit && words.length) sec.classList.remove('collapsed');
    });
    let none = document.getElementById('setup-search-none');
    if (!shown) { if (!none) { none = document.createElement('div'); none.id = 'setup-search-none'; inp.parentElement.append(none); } none.textContent = 'No setting matches "' + inp.value + '"'; } else if (none) none.remove();
  };
  inp.addEventListener('input', run);
}
function setTab(tab) {
  tab = OLD_TABS[tab] || tab;
  if (!document.querySelector(`#tab-bar [data-tab="${tab}"]`)) tab = 'play';
  document.body.dataset.tab = tab;
  document.querySelectorAll('#tab-bar [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll('#sidebar-scroll > .sidebar-section').forEach((sec) => sec.classList.toggle('tab-active', sec.dataset.tab === tab));
  document.getElementById('sidebar-scroll')?.scrollTo(0, 0);
  // The Effects tab opens with the effect list expanded.
  // Open the tab's first section if all of them are folded, so a tab never looks empty.
  const secs = [...document.querySelectorAll('#sidebar-scroll > .sidebar-section.tab-active')];
  if (secs.length && secs.every((x) => x.classList.contains('collapsed'))) secs[0].classList.remove('collapsed');
  if (tab === 'play') document.getElementById('effects-body')?.closest('.sidebar-section')?.classList.remove('collapsed');
  try { localStorage.setItem('tab', tab); } catch (e) { /* storage unavailable */ }
}

// ── Now tab: the running effect's own options panel (plus any shared
// panel of its submenu, e.g. the Art slideshow controls) is moved here
// while that effect runs, and put back where it came from afterwards. ──
const _nowMoved = []; // [{ el, marker }]
function placeActivePanels() {
  const host = document.getElementById('now-options');
  if (!host) return;
  const key = currentState.effect;
  const nameEl = document.getElementById('now-effect-name');
  const btn = key && document.querySelector(`.effect-btn[data-effect="${CSS.escape(key)}"]`);
  if (nameEl) nameEl.textContent = currentState.blank ? 'Nothing (cleared)' : btn ? btn.textContent.replace(/[◈▸▶]/g, '').trim() : (key || '…');
  const want = [];
  const panel = key && document.getElementById('panel-' + key);
  if (panel && !panel.closest('#music-section')) want.push(panel); // the radio lives on the Music tab
  // Slideshow/letterbox controls only belong to the picture galleries.
  const shared = btn && ['apod', 'unsplash', 'artic'].includes(key) && btn.closest('.sub-section')?.querySelector('.art-shared-panel');
  if (shared) want.push(shared);
  if (want.length === _nowMoved.length && want.every((el, i) => _nowMoved[i].el === el)) return;
  // Put back whatever is there now.
  while (_nowMoved.length) { const { el, marker } = _nowMoved.pop(); marker.replaceWith(el); }
  for (const el of want) {
    const marker = document.createComment('now-tab placeholder');
    el.replaceWith(marker);
    host.appendChild(el);
    _nowMoved.push({ el, marker });
  }
  const none = document.getElementById('now-no-options');
  if (none) {
    none.style.display = want.length ? 'none' : '';
    none.textContent = panel && !want.includes(panel) ? 'Station, volume and spectrum settings are on the Music tab.' : 'This effect has no options.';
  }
}

// ── Scenes ──
function renderScenes() {
  const box = document.getElementById('scene-chips');
  if (!box) return;
  const list = currentState.scenes || [];
  if (!list.length) { box.textContent = 'No scenes yet.'; box.className = 'scene-chips ui-note'; return; }
  box.className = 'scene-chips scene-tiles';
  box.replaceChildren(...list.map((sc) => {
    const tile = document.createElement('div');
    tile.className = 'scene-tile';
    const go = document.createElement('button'); go.type = 'button'; go.className = 'scene-go'; go.title = 'Show this scene';
    const name = document.createElement('span'); name.textContent = sc.name;
    go.append(cxStillThumb(sc.effect), name);
    go.addEventListener('click', () => { send({ cmd: 'applyScene', name: sc.name }); cxToast('Scene: ' + sc.name); });
    const del = document.createElement('button'); del.type = 'button'; del.className = 'scene-del'; del.textContent = '✕'; del.setAttribute('aria-label', 'Delete scene ' + sc.name);
    del.addEventListener('click', () => { if (confirm(`Delete scene "${sc.name}"?`)) send({ cmd: 'deleteScene', name: sc.name }); });
    tile.append(go, del);
    return tile;
  }));
}
function wireScenes() {
  const inp = document.getElementById('scene-name-input');
  const save = () => {
    const name = (inp?.value || '').trim();
    if (!name) { inp?.focus(); return; }
    if ((currentState.scenes || []).some((sc) => sc.name === name) && !confirm(`Replace scene "${name}"?`)) return;
    send({ cmd: 'saveScene', name });
    inp.value = '';
  };
  document.getElementById('scene-save-btn')?.addEventListener('click', save);
  inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
}

function wireEffectFilter() {
  const body = document.getElementById('effects-body');
  const input = document.getElementById('effect-filter');
  const chk = document.getElementById('show-unported-chk');
  if (!body || !input) return;
  const apply = () => {
    const q = input.value.trim().toLowerCase();
    body.classList.toggle('filtering', !!q);
    body.querySelectorAll('.effect-btn[data-effect]').forEach((btn) => {
      const hit = !q || btn.textContent.toLowerCase().includes(q) || btn.dataset.effect.toLowerCase().includes(q);
      btn.classList.toggle('filter-hide', !hit);
    });
    body.querySelectorAll('.sub-section').forEach((sec) => {
      const any = [...sec.querySelectorAll('.effect-btn[data-effect]')].some((b) => !b.classList.contains('filter-hide')
        && !(document.body.classList.contains('hide-unported') && b.classList.contains('not-ported')));
      sec.classList.toggle('filter-empty', !!q && !any);
    });
  };
  input.addEventListener('input', apply);
  if (chk) {
    let show = false;
    try { show = localStorage.getItem('showUnported') === '1'; } catch (e) { /* storage unavailable */ }
    chk.checked = show;
    document.body.classList.toggle('hide-unported', !show);
    chk.addEventListener('change', () => {
      document.body.classList.toggle('hide-unported', !chk.checked);
      try { localStorage.setItem('showUnported', chk.checked ? '1' : '0'); } catch (e) { /* storage unavailable */ }
      apply();
    });
  }
}

function syncEffectButtons() {
  document.querySelectorAll('.effect-btn[data-effect]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.effect === currentState.effect);
    if (btn.dataset.effect === currentState.effect) btn.classList.remove('pending');
  });
  updateActiveEffectLabel();
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
  if (count && document.activeElement !== count) { count.value = opts.count ?? 8; if (countVal) countVal.textContent = count.value; }
  panel.querySelectorAll('[data-ls-size]').forEach((b) => b.classList.toggle('active', Number(b.dataset.lsSize) === (opts.size ?? 1)));
  panel.querySelectorAll('[data-ls-nudge]').forEach((b) => b.classList.toggle('active', Number(b.dataset.lsNudge) === (opts.nudge ?? 0)));
  panel.querySelectorAll('[data-ls-col]').forEach((b) => b.classList.toggle('active', b.dataset.lsCol === (opts.colour || 'multi')));
}

// ---------------------------------------------------------------------
// Weather's option panel (panel-weather): city search plus live status
// readouts from effectStatus.weather.
// ---------------------------------------------------------------------
// City autocomplete: queries Open-Meteo geocoding from the browser (250 ms
// debounce) and shows country/region so ambiguous names can be picked
// exactly. Picking an entry sends "City, Country" immediately, like GO.
let _wxCityTimer = null;
function wireWeatherCityDropdown(cityInput, dropdown) {
  if (!cityInput || !dropdown) return;
  const query = () => {
    const q = cityInput.value.trim();
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    clearTimeout(_wxCityTimer);
    _wxCityTimer = setTimeout(() => {
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&format=json`)
        .then((r) => r.json())
        .then((data) => {
          const results = data.results || [];
          if (!results.length) { dropdown.style.display = 'none'; return; }
          dropdown.innerHTML = '';
          results.forEach((r) => {
            const label = `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}${r.country ? ', ' + r.country : ''}`;
            const short = r.country ? `${r.name}, ${r.country}` : r.name;
            const row = document.createElement('div');
            row.style.cssText = 'padding:6px 8px;cursor:pointer;font-size:13px;color:#9bd;border-bottom:1px solid rgba(80,120,255,0.1);';
            row.textContent = label;
            row.addEventListener('click', () => {
              cityInput.value = short;
              dropdown.style.display = 'none';
              setEffectOption('weather', 'city', short);
            });
            dropdown.appendChild(row);
          });
          dropdown.style.display = 'block';
        })
        .catch(() => { dropdown.style.display = 'none'; });
    }, 250);
  };
  cityInput.addEventListener('input', query);
  cityInput.addEventListener('focus', query);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#wx-city') && !e.target.closest('#wx-city-dropdown')) dropdown.style.display = 'none';
  });
}

function wireWeatherPanel() {
  const panel = document.getElementById('panel-weather');
  if (!panel) return;
  const cityInput = panel.querySelector('#wx-city');
  const dropdown = panel.querySelector('#wx-city-dropdown');
  const goBtn = panel.querySelector('#wx-fetch-btn');
  const submit = () => {
    const city = (cityInput?.value || '').trim();
    if (city) setEffectOption('weather', 'city', city);
    if (dropdown) dropdown.style.display = 'none';
  };
  if (goBtn) goBtn.addEventListener('click', submit);
  if (cityInput) cityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  wireWeatherCityDropdown(cityInput, dropdown);
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
  // Show the server's current city in the input, unless the user is typing.
  // When effectOptions.weather.city is empty, use status.city (the server's
  // resolved name, including its DEFAULT_CITY fallback), so the box always
  // matches what the panels show.
  const cityInput = panel.querySelector('#wx-city');
  const optCity = currentState.effectOptions?.weather?.city || status?.city;
  if (cityInput && document.activeElement !== cityInput && optCity && cityInput.value !== optCity) {
    cityInput.value = optCity;
  }
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
// 🔊 Sound effects (Retro panel): on/off, volume, test.
document.querySelectorAll('[data-sfx]').forEach((b) => b.addEventListener('click', () => {
  const v = b.dataset.sfx;
  send(v === 'test' ? { cmd: 'setSfx', test: true } : { cmd: 'setSfx', on: v === 'on' });
}));
document.getElementById('sfx-vol')?.addEventListener('change', (e) => send({ cmd: 'setSfx', volume: Number(e.target.value), test: true }));
document.getElementById('sfx-vol')?.addEventListener('input', (e) => { document.getElementById('sfx-vol-val').textContent = Math.round(e.target.value * 100) + '%'; });
function syncSfx() {
  const f = currentState.prefs?.sfx || { on: true, volume: 0.6 };
  document.querySelectorAll('[data-sfx="on"]').forEach((b) => b.classList.toggle('active', !!f.on));
  document.querySelectorAll('[data-sfx="off"]').forEach((b) => b.classList.toggle('active', !f.on));
  const vol = document.getElementById('sfx-vol');
  if (vol && document.activeElement !== vol) { vol.value = f.volume; document.getElementById('sfx-vol-val').textContent = Math.round(f.volume * 100) + '%'; }
}
let _retroPress = 0;
function wireRetroPanel() {
  // Arrow pad: same idea as Snake's (dir + a press counter so repeats register).
  document.querySelectorAll('#panel-retro [data-retropad]').forEach((b) => b.addEventListener('click', () => {
    setEffectOption('retro', 'dir', b.dataset.retropad);
    setEffectOption('retro', 'press', ++_retroPress + Date.now() % 100000);
  }));
  document.querySelectorAll('#panel-retro .strobe-mode-btn[data-retroopt]').forEach((btn) => btn.addEventListener('click', () => {
    const key = btn.dataset.retroopt, raw = btn.dataset.v, value = raw === 'true' ? true : raw === 'false' ? false : raw;
    document.querySelectorAll(`#panel-retro .strobe-mode-btn[data-retroopt="${key}"]`).forEach((b) => b.classList.toggle('active', b === btn));
    setEffectOption('retro', key, value);
  }));
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
  const ro = currentState.effectOptions?.retro || {}, RD = { screen: 'crt', hud: true, attract: true, trans: 'crt', cubeLayout: 'arcade' };
  document.querySelectorAll('#panel-retro .strobe-mode-btn[data-retroopt]').forEach((b) => b.classList.toggle('active', String(ro[b.dataset.retroopt] ?? RD[b.dataset.retroopt]) === b.dataset.v));
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
  panel.querySelectorAll('[data-dtstyle]').forEach((b) => b.addEventListener('click', () => setEffectOption('datetime', 'style', b.dataset.dtstyle)));
  panel.querySelectorAll('[data-dtcol]').forEach((b) => b.addEventListener('click', () => setEffectOption('datetime', 'colour', b.dataset.dtcol)));
  panel.querySelectorAll('[data-dtflag]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.dtflag; setEffectOption('datetime', k, (currentState.effectOptions?.datetime || {})[k] === false);
  }));
}

function syncDatetimePanel() {
  const panel = document.getElementById('panel-datetime');
  if (!panel) return;
  const o = currentState.effectOptions?.datetime || {};
  const legacy = { time: 'neon', both: 'neon', full: 'neon', date: 'minimal', analogue: 'analogue', words: 'words' };
  const style = o.style || legacy[o.mode] || 'neon';
  panel.querySelectorAll('[data-dtstyle]').forEach((b) => b.classList.toggle('active', b.dataset.dtstyle === style));
  panel.querySelectorAll('[data-dtcol]').forEach((b) => b.classList.toggle('active', b.dataset.dtcol === (o.colour || 'auto')));
  panel.querySelectorAll('[data-dtflag]').forEach((b) => b.classList.toggle('on', o[b.dataset.dtflag] !== false));
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
// Fireworks' option panel (panel-fireworks): Mode buttons and the "Show
// text on cube" checkbox + text, committed on 'change' rather than every
// keystroke to avoid a WS message per key.
// ---------------------------------------------------------------------
// Strobe Flash's option panel (panel-strobe): Pattern, Speed and Colour,
// read straight from core.effectOptions.strobe.
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
  if (count && document.activeElement !== count) { count.value = opts.count ?? 8; if (countVal) countVal.textContent = count.value; }
}


// Weather Radar's option panel (panel-radar): zoom, and a status line.
function wireRadarPanel() {
  document.querySelectorAll('.radar-zoom-btn').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.radar-zoom-btn').forEach((x) => x.classList.toggle('active', x === b));
    setEffectOption('radar', 'zoom', Number(b.dataset.radarzoom));
  }));
}
function syncRadarPanel() {
  const z = Number(currentState.effectOptions?.radar?.zoom) || 7;
  document.querySelectorAll('.radar-zoom-btn').forEach((x) => x.classList.toggle('active', Number(x.dataset.radarzoom) === z));
  const s = currentState.effectStatus?.radar, el = document.getElementById('radar-status');
  if (el) el.textContent = !s ? '' : s.error ? '⚠ ' + s.error : s.frames ? '✓ ' + (s.place || '') + ' - ' + s.frames + ' frames, updated ' + new Date(s.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Loading…';
}
// ---------------------------------------------------------------------
// Overlays panel - global compositing layers (not an effect), backed by
// src/effects/overlays.js and the setOverlay* commands. All overlays share one
// markup convention (.ov-chk / .ov-sl / .ov-col with data-ov), so they are wired
// generically in one loop. Radio/Spectrum have no backend and stay disabled.
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
    // Each drag tick's send is echoed back as a "state" broadcast mid-drag. A focus-based
    // guard is unreliable on touch (some mobile browsers don't focus a range input), so
    // _gbEditingUntil is a time-based guard: syncOverlaysPanel() ignores echoes for a
    // short while after the last local edit, so the thumb doesn't snap back.
    let gbSendQueued = false;
    gb.addEventListener('input', () => {
      _gbEditingUntil = Date.now() + 1200;
      // Coalesce to at most one send per animation frame - a native range
      // input fires 'input' on every pixel of movement (dozens/sec while
      // dragging), each otherwise triggering a full state broadcast to
      // every connected client. Doesn't change the echo-fighting fix above
      // (that's the time guard), just cuts needless network/server load.
      if (gbSendQueued) return;
      gbSendQueued = true;
      requestAnimationFrame(() => {
        gbSendQueued = false;
        send({ cmd: 'setOverlayGlobalBright', value: Number(gb.value) });
      });
      const lbl = document.getElementById('ov-global-bright-val');
      if (lbl) lbl.textContent = Math.round(gb.value * 100) + '%';
    });
  }
}
let _gbEditingUntil = 0;

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
  if (gb && document.activeElement !== gb && Date.now() >= _gbEditingUntil && overlays.globalBright !== undefined) {
    gb.value = overlays.globalBright;
    const lbl = document.getElementById('ov-global-bright-val');
    if (lbl) lbl.textContent = Math.round(overlays.globalBright * 100) + '%';
  }
}

// ---------------------------------------------------------------------
// Custom Cube - the Face Editor (pe-*) assigns an effect, sub-options and an overlay
// subset to each of the 6 faces; the Custom Cube panel (cc-*) loads a saved
// configuration. There is one live `faces` array server-side (customCubeConfig.js) and
// no local draft: every control sends straight to the server and re-renders from state.
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
  lbl.style.cssText = 'font-size:11px;color:#9aa3b8;flex:0 0 72px;';
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
    const vl = document.createElement('span'); vl.style.cssText = 'font-size:11px;color:#9cd;width:34px;';
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
  div.className = 'cx-face-card'; div.id = 'cx-face-' + f;

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
  ovLabel.style.cssText = 'font-size:11px;color:#9aa3b8;margin-bottom:6px;';
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
  // An unfolded cube: tap a face to jump to its settings.
  const net = document.createElement('div');
  net.className = 'cx-net';
  const POS = { 4: [2, 1], 3: [1, 2], 0: [2, 2], 2: [3, 2], 1: [4, 2], 5: [2, 3] }; // face -> [col,row]
  for (let f = 0; f < 6; f += 1) {
    const cfg = ccFaces()[f], b = document.createElement('button');
    b.type = 'button'; b.className = 'cx-net-face' + (cfg && cfg.effect ? ' set' : '');
    b.style.gridColumn = POS[f][0]; b.style.gridRow = POS[f][1];
    const thumb = cfg && cfg.effect && document.querySelector(`.effect-btn[data-effect="${CSS.escape(cfg.effect)}"] .cx-thumb`);
    if (thumb) { const cv = document.createElement('canvas'); cv.width = cv.height = thumb.width; cv.getContext('2d').drawImage(thumb, 0, 0); b.appendChild(cv); }
    const t = document.createElement('span'); t.textContent = CC_FACE_NAMES[f] + (cfg && cfg.effect ? '\n' + (effectNames[cfg.effect] || cfg.effect) : '');
    b.appendChild(t);
    b.addEventListener('click', () => { const c = document.getElementById('cx-face-' + f); cxScrollMenuTo(c, 'center'); c?.classList.add('flash'); setTimeout(() => c?.classList.remove('flash'), 900); });
    net.appendChild(b);
  }
  el.appendChild(net);
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
  const quantity = panel.querySelector('#fw-quantity'), quantityVal = panel.querySelector('#fw-quantity-val');
  if (quantity) quantity.addEventListener('input', () => {
    if (quantityVal) quantityVal.textContent = quantity.value;
    setEffectOption('fireworks', 'quantity', Number(quantity.value));
  });
  // Show style, colours, backdrop, size, finale, smoke: one handler for all.
  panel.querySelectorAll('.strobe-mode-btn[data-fwopt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.fwopt, raw = btn.dataset.v;
      const value = raw === 'true' ? true : raw === 'false' ? false : key === 'size' ? Number(raw) : raw;
      panel.querySelectorAll(`.strobe-mode-btn[data-fwopt="${key}"]`).forEach((b) => b.classList.toggle('active', b === btn));
      setEffectOption('fireworks', key, value);
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
  const FW_DEFAULTS = { style: 'mixed', palette: 'rainbow', backdrop: 'water', size: 2, finale: '2', smoke: true };
  panel.querySelectorAll('.strobe-mode-btn[data-fwopt]').forEach((btn) => {
    const key = btn.dataset.fwopt, cur = opts[key] ?? FW_DEFAULTS[key];
    btn.classList.toggle('active', String(cur) === btn.dataset.v);
  });
  panel.querySelectorAll('.strobe-mode-btn[data-fwmode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.fwmode === mode);
  });
  const quantity = panel.querySelector('#fw-quantity'), quantityVal = panel.querySelector('#fw-quantity-val');
  if (quantity && document.activeElement !== quantity) {
    quantity.value = opts.quantity ?? 6;
    if (quantityVal) quantityVal.textContent = quantity.value;
  }
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
// APOD option panel - status readout plus a "Refresh" button (an increasing token,
// since there's no one-shot refresh command). The NASA key input is greyed out:
// the server reads NASA_API_KEY from its environment.
// ---------------------------------------------------------------------
let _apodRefreshToken = 0;
// NASA API key input - backed by the dedicated setNasaConfig command
// (persisted server-side, shared by APOD/EPIC/NEO - see wsServer.js's
// module comment and nasaConfig.js). Was previously greyed out entirely
// ("set via the server's NASA_API_KEY environment variable, not per-
// browser") - a real request: "enable the NASA apod API field. I have the
// api to enter."
function wireApodPanel() {
  const panel = document.getElementById('panel-apod');
  if (!panel) return;
  const keyInput = panel.querySelector('#nasa-api-key-input');
  const saveBtn = panel.querySelector('#nasa-api-key-save');
  if (saveBtn) saveBtn.addEventListener('click', () => send({ cmd: 'setNasaConfig', apiKey: (keyInput?.value || '').trim() }));
  const fetchBtn = panel.querySelector('#apod-fetch-btn');
  if (fetchBtn) fetchBtn.addEventListener('click', () => setEffectOption('apod', 'refresh', ++_apodRefreshToken));
}

function syncApodPanel() {
  const panel = document.getElementById('panel-apod');
  if (!panel) return;
  const keyInput = panel.querySelector('#nasa-api-key-input');
  if (keyInput && document.activeElement !== keyInput) keyInput.value = currentState.nasaConfig?.apiKey || '';
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
// Video Display's option panel (panel-video): URL, file upload and browser capture.
// ---------------------------------------------------------------------
// Uploads a chosen File to /api/uploadVideo as the raw POST body (not multipart, see
// wsServer.js), then points the video effect at the path the server saved it to.
function uploadVideoFile(file, statusEl) {
  if (!file) return;
  stopBrowserCapture(); // an upload supersedes any live camera/screen capture in progress
  if (statusEl) statusEl.textContent = 'Uploading ' + file.name + '…';
  fetch('/api/uploadVideo?name=' + encodeURIComponent(file.name), { method: 'POST', body: file, headers: { 'X-Control-Pin': storedPin() } })
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
// Live webcam / screen-share capture: the Pi has no camera, but this tab does, so
// frames are captured, downsampled and streamed to the Pi as binary WS messages (see
// wsServer.js for the format). Unlike URL/file playback this stops when the tab closes.
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
// Internet Radio's option panel (panel-radio): stop/volume, directory search
// (results arrive as broadcast state in effectStatus.radio.search), the
// featured RADIO_STATIONS list, and the Spectrum Analyser controls, all sent
// through setEffectOption('radio', ...). RADIO_STATIONS is a small static list
// duplicated here rather than fetched from the server.
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

// Escapes text for interpolation into an innerHTML template - station
// names/genres come from an external directory (radio-browser.info) and
// timer names from any client on the LAN, so neither can be trusted as
// markup.
function escHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function radioStationRow(station, current) {
  const div = document.createElement('div');
  const isCurrent = current && current.url === station.url;
  div.className = 'cx-station' + (isCurrent ? ' on' : '');
  const fav = (currentState.prefs?.stations || []).some((x) => x.url === station.url);
  div.innerHTML = `<span class="cx-station-play">${isCurrent ? '❚❚' : '▶'}</span><span class="cx-station-txt"><b>${escHtml(station.name)}</b>${station.genre ? `<small>${escHtml(station.genre)}</small>` : ''}</span>${isCurrent ? '<span class="cx-eq"><i></i><i></i><i></i></span>' : ''}<span class="cx-station-fav${fav ? ' on' : ''}" role="button" title="${fav ? 'Remove from My stations' : 'Add to My stations'}">★</span>`;
  div.querySelector('.cx-station-fav').addEventListener('click', (e) => {
    e.stopPropagation();
    send({ cmd: 'toggleStationFav', station: { name: station.name, genre: station.genre || '', url: station.url } });
  });
  div.addEventListener('click', () => {
    send({ cmd: 'radioPlay', station });
    // Fired directly inside this click's own handler (a genuine user
    // gesture), NOT from the later "state" broadcast that comes back over
    // the WebSocket - browsers require audio.play() to happen synchronously
    // within a user gesture or it's silently rejected (NotAllowedError),
    // and a WS round-trip breaks that chain. See radioBrowserPlay()'s own
    // comment for the full "why a separate <audio> element at all" story.
    radioBrowserPlay(station);
  });
  return div;
}

// ---------------------------------------------------------------------
// Playback on this phone/browser. The Pi's radio plays only on the Pi's own
// sink, so this plays it here too. Synced mode: the Pi sends the PCM it gives
// its speaker, each piece stamped with the Pi time the speaker plays it (see
// src/wsServer.js sendAudio). We estimate the Pi's clock and schedule each
// piece for that moment, less this device's own output delay.
// ---------------------------------------------------------------------
const syncAudio = { on: false, ctx: null, gain: null, next: 0, offset: 0, samples: [], timer: null, late: 0, extra: 0 };
function isAudioPacket(buf) {
  if (!(buf instanceof ArrayBuffer) || buf.byteLength < 20) return false;
  const b = new Uint8Array(buf, 0, 8);
  return b[0] === 77 && b[1] === 68 && b[2] === 65 && b[3] === 85 && b[4] === 68 && b[5] === 73 && b[6] === 79 && b[7] === 49; // 'MDAUDIO1'
}
function syncAudioStart() {
  try {
    syncAudio.ctx = syncAudio.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (syncAudio.ctx.state === 'suspended') syncAudio.ctx.resume();
    if (!syncAudio.gain) { syncAudio.gain = syncAudio.ctx.createGain(); syncAudio.gain.connect(syncAudio.ctx.destination); }
  } catch (e) { return; }
  syncAudio.on = true; syncAudio.next = 0; syncAudio.samples = []; syncAudio.extra = 0; syncAudio.late = 0;
  send({ cmd: 'audioSub', on: true });
  // Clock pings: quickly at first, then every few seconds.
  let n = 0;
  clearInterval(syncAudio.timer);
  syncAudio.timer = setInterval(() => { if (++n > 6 && n % 6) return; send({ cmd: 'clockPing', c: Date.now() }); }, 500);
}
// Phones pause web audio when the screen locks or the app is in the
// background; pick it up again on return and re-lock to the Pi's timing.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !syncAudio.on || !syncAudio.ctx) return;
  if (syncAudio.ctx.state !== 'running') syncAudio.ctx.resume().catch(() => {});
  syncAudio.next = 0; syncAudio.extra = 0;
  send({ cmd: 'clockPing', c: Date.now() });
});
function syncAudioStop() {
  if (!syncAudio.on) return;
  syncAudio.on = false;
  clearInterval(syncAudio.timer);
  send({ cmd: 'audioSub', on: false });
}
// The Pi's clock: from the replies with the shortest round trip (the most
// accurate), over the last dozen.
function syncClockPong(msg) {
  const now = Date.now(), rtt = now - msg.c;
  if (!(rtt >= 0 && rtt < 5000)) return;
  syncAudio.samples.push({ rtt, offset: msg.s - (msg.c + rtt / 2) });
  if (syncAudio.samples.length > 12) syncAudio.samples.shift();
  syncAudio.offset = syncAudio.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;
}
function handleSyncAudio(buf) {
  const a = syncAudio;
  if (!a.on || !a.ctx || !a.samples.length) return;
  const dv = new DataView(buf), playAt = dv.getFloat64(8, true), frames = (buf.byteLength - 16) >> 2;
  if (frames < 1) return;
  const ab = a.ctx.createBuffer(2, frames, 22050), L = ab.getChannelData(0), R = ab.getChannelData(1);
  for (let i = 0, o = 16; i < frames; i++, o += 4) { L[i] = dv.getInt16(o, true) / 32768; R[i] = dv.getInt16(o + 2, true) / 32768; }
  // Volume follows the radio's volume (0.8 = full, as on the Pi) and the mute button.
  const vol = Number(currentState.effectOptions?.radio?.volume ?? 0.8);
  a.gain.gain.value = Math.max(0, Math.min(1.25, vol / 0.8));
  const outDelay = (a.ctx.outputLatency || 0) + (a.ctx.baseLatency || 0);
  const when = a.ctx.currentTime + (playAt - a.offset - Date.now()) / 1000 - outDelay + a.extra;
  if (when < a.ctx.currentTime + 0.01) {
    // Arrived too late: skip it and re-lock on the next. If that keeps
    // happening (a slow connection), add a little delay rather than go silent.
    a.next = 0;
    if (++a.late > 4) { a.late = 0; a.extra = Math.min(1, a.extra + 0.05); }
    return;
  }
  a.late = 0;
  // Back to back with the previous piece when it's close, so there are no clicks.
  // Pieces arrive stamped back to back; small timing jitter (network, clock
  // estimate) is ignored so playback stays seamless, and only a real jump re-times it.
  const start = a.next && Math.abs(when - a.next) < 0.15 && a.next > a.ctx.currentTime + 0.005 ? a.next : when;
  const src = a.ctx.createBufferSource();
  src.buffer = ab; src.connect(a.gain); src.start(start);
  a.next = start + ab.duration;
}

const RADIO_BROWSER_PLAY_KEY = 'multidisplay-radio-browser-play';
function radioBrowserPlaybackWanted() {
  try { return localStorage.getItem(RADIO_BROWSER_PLAY_KEY) !== '0'; } catch (err) { return true; } // default ON
}
function setRadioBrowserPlaybackWanted(on) {
  try { localStorage.setItem(RADIO_BROWSER_PLAY_KEY, on ? '1' : '0'); } catch (err) { /* ignore */ }
}
// Web Audio graph for #radio-browser-audio. A MediaElementAudioSourceNode on a
// non-CORS source still plays audibly; only analysis reads zeros. The graph is
// always created, with crossOrigin='anonymous', BEFORE play() inside the same
// synchronous click handler; creating it later or async broke playback.
let _raCtx = null, _raAnalyser = null, _raSource = null, _raBuf = null, _raRunning = false;
let _raSilent = false, _raSilentTimer = 0, _raLastLevel = 0;
function radioEnsureGraph() {
  const el = document.getElementById('radio-browser-audio');
  if (!el) return false;
  try {
    _raCtx = _raCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (_raCtx.state === 'suspended') _raCtx.resume();
    if (!_raSource) {
      _raSource = _raCtx.createMediaElementSource(el);
      _raAnalyser = _raCtx.createAnalyser();
      _raAnalyser.fftSize = 2048;
      _raAnalyser.smoothingTimeConstant = 0.45;
      _raBuf = new Uint8Array(_raAnalyser.frequencyBinCount);
      // Route through the analyser AND back out to speakers - creating a
      // MediaElementSource replaces the <audio> tag's default output path,
      // so without this explicit connect() the stream would play silently.
      _raSource.connect(_raAnalyser);
      _raAnalyser.connect(_raCtx.destination);
    }
    return true;
  } catch (err) { return false; } // e.g. no Web Audio API support - falls back to the element's own native playback below
}
function radioBrowserPlay(station) {
  if (!radioBrowserPlaybackWanted() || !station || !station.url) return;
  if (!window.MULTIDISPLAY_SIM) { syncAudioStart(); return; } // on the Pi: play the Pi's own audio, in step with the speaker
  const el = document.getElementById('radio-browser-audio');
  if (!el) return;
  radioEnsureGraph();
  _raSilent = false; _raSilentTimer = 0; _raLastLevel = 0;
  // /api/debugTone streams one finite WAV clip, while the Pi loops the sweep by
  // relaunching ffmpeg. `loop` replays the already-downloaded clip with no extra
  // request, so the sound keeps up with the looping bars.
  el.loop = !!station.loop;
  // A YouTube start offset ('#mdss=N', see src/youtube.js) becomes a media fragment.
  const src = station.url.replace(/#mdss=(\d+(?:\.\d+)?)$/, '#t=$1');
  if (el.src !== src) el.src = src;
  el.play().catch(() => { /* autoplay blocked or stream unreachable - #radio-status-el already shows the Pi-side status regardless */ });
  if (!_raRunning) { _raRunning = true; _raLastMs = 0; requestAnimationFrame(radioAnalyserTick); }
}
function radioBrowserStop() {
  if (!window.MULTIDISPLAY_SIM) syncAudioStop();
  const el = document.getElementById('radio-browser-audio');
  if (!el) return;
  el.pause();
  el.removeAttribute('src');
  el.load();
}

// Reads the analyser every frame. Only useful in the simulator, where
// window.PiEngine.EFFECTS.radio.audio exists; on a real Pi this loop no-ops.
// Bucketing and smoothing are ported from the original app. If the level stays
// near zero for 4+ seconds while playing, the stream doesn't allow analysis
// (no CORS), so bars ease to idle; audible playback is unaffected.
let _raLastMs = 0;
function radioAnalyserTick(nowMs) {
  requestAnimationFrame(radioAnalyserTick);
  const el = document.getElementById('radio-browser-audio');
  const audio = window.PiEngine?.EFFECTS?.radio?.audio;
  const dt = Math.max(0.005, Math.min(0.5, (nowMs - (_raLastMs || nowMs)) / 1000));
  _raLastMs = nowMs;
  if (!_raAnalyser || !audio || !el || el.paused) return;
  if (!_raSilent) {
    _raAnalyser.getByteFrequencyData(_raBuf);
    const AB = audio.spec.length, nb = _raBuf.length, minBin = 1;
    // maxBin capped to ~80% of the true Nyquist-adjacent bin, not nb-1 - a
    // real report ("even with gain high, the right 3 bars don't move").
    // Gain can't amplify signal that isn't there: the bins right next to
    // Nyquist carry essentially zero energy for ANY real-world audio (every
    // encode/playback pipeline anti-alias-filters well below Nyquist, and
    // lossy internet radio streams roll off earlier still, often ~16kHz).
    // Mapping the last few display bars all the way out to that
    // acoustically-dead edge meant they could never show real movement
    // regardless of gain - capping the usable range to a realistic top
    // frequency keeps every displayed bar inside the range that actually
    // carries content.
    const maxBin = Math.max(minBin + 1, Math.round((nb - 1) * 0.8));
    let lo = minBin, level = 0;
    for (let b = 0; b < AB; b++) {
      const frac = (b + 1) / AB;
      let hi = Math.round(minBin * Math.pow(maxBin / minBin, frac));
      if (hi <= lo) hi = lo + 1;
      hi = Math.min(hi, maxBin);
      let sum = 0, count = 0;
      for (let k = lo; k <= hi; k++) { sum += _raBuf[k]; count++; }
      const raw = count > 0 ? (sum / count) / 255 : 0;
      if (raw > level) level = raw;
      const trebleBoost = 1 + frac * 1.8;
      const target = Math.min(1, raw * trebleBoost);
      if (target > audio.spec[b]) audio.spec[b] += (target - audio.spec[b]) * Math.min(1, dt * 20);
      else audio.spec[b] += (target - audio.spec[b]) * Math.min(1, dt * 7);
      if (audio.spec[b] > audio.peak[b]) { audio.peak[b] = audio.spec[b]; audio._peakVel[b] = 0; }
      else { audio._peakVel[b] += dt * 1.2; audio.peak[b] = Math.max(0, audio.peak[b] - audio._peakVel[b] * dt); }
      lo = hi + 1;
      if (lo > maxBin) lo = maxBin;
    }
    _raLastLevel += (level - _raLastLevel) * Math.min(1, dt * 3);
    if (_raLastLevel <= 0.04) _raSilentTimer += dt; else _raSilentTimer = 0;
    if (_raSilentTimer > 4) {
      _raSilent = true;
      const statusEl = document.querySelector('.radio-status-el');
      if (statusEl) statusEl.textContent += ' (visualizer unavailable — station blocks audio analysis)';
    }
  } else {
    for (let b = 0; b < audio.spec.length; b++) {
      audio.spec[b] += (0 - audio.spec[b]) * Math.min(1, dt * 7);
      if (audio.spec[b] > audio.peak[b]) audio.peak[b] = audio.spec[b];
      else { audio._peakVel[b] += dt * 1.2; audio.peak[b] = Math.max(0, audio.peak[b] - audio._peakVel[b] * dt); }
    }
  }
}

function wireRadioPanel() {
  const panel = document.getElementById('panel-radio');
  if (!panel) return;

  panel.querySelectorAll('.radio-stop-btn-el').forEach((btn) => btn.addEventListener('click', () => { send({ cmd: 'radioStop' }); radioBrowserStop(); }));
  // Debug mode: two server-generated test tones for checking the spectrum
  // analyser (see radio.js's DEBUG_TONES). The WS command drives the Pi-side
  // pipeline. Its `debug:` URL isn't fetchable by a browser, so when "Play in
  // this browser" is on the <audio> element uses the separate /api/debugTone route.
  const playDebugTone = (kind, freq) => {
    send({ cmd: 'radioDebugTone', kind, freq });
    if (radioBrowserPlaybackWanted()) {
      // 'sweep' loops (see radioBrowserPlay()'s own comment) - matches the
      // Pi-side pipeline, which relaunches the sweep indefinitely but
      // plays drum/tone once.
      radioBrowserPlay({ url: '/api/debugTone?kind=' + kind + (freq != null ? '&freq=' + freq : ''), loop: kind === 'sweep' });
    }
  };
  document.querySelectorAll('.radio-debug-sweep-btn-el').forEach((btn) => btn.addEventListener('click', () => playDebugTone('sweep')));
  document.querySelectorAll('.radio-debug-drum-btn-el').forEach((btn) => btn.addEventListener('click', () => playDebugTone('drum')));
  // Frequency slider - a real follow-up ("add a scroll bar to the sweep
  // test so I can select the freq"), then ("the freq needs to change as I
  // scroll" - shortened from an initial 300ms debounce to 80ms so it
  // tracks the drag live rather than only updating once you stop moving.
  // Still debounced, not fired on every 'input' tick, since each change
  // restarts the debug ffmpeg process and firing on literally every
  // pixel of drag would thrash it badly.
  let debugFreqDebounce = null;
  document.querySelectorAll('.radio-debug-freq-el').forEach((sl) => {
    const valEl = panel.querySelector('.radio-debug-freq-val-el');
    sl.addEventListener('input', () => {
      if (valEl) valEl.textContent = sl.value + ' Hz';
      clearTimeout(debugFreqDebounce);
      debugFreqDebounce = setTimeout(() => playDebugTone('tone', Number(sl.value)), 80);
    });
  });
  panel.querySelectorAll('.radio-vol-el').forEach((sl) => sl.addEventListener('input', () => {
    setEffectOption('radio', 'volume', Number(sl.value));
    const el = document.getElementById('radio-browser-audio');
    if (el) el.volume = Number(sl.value);
  }));
  const browserPlayChk = panel.querySelector('.radio-browser-play-el');
  if (browserPlayChk) {
    browserPlayChk.checked = radioBrowserPlaybackWanted();
    browserPlayChk.addEventListener('change', () => {
      setRadioBrowserPlaybackWanted(browserPlayChk.checked);
      if (browserPlayChk.checked) {
        // Turning the checkbox ON is itself a user gesture, so a currently-
        // playing station can start in this browser right now too, not
        // just the next time one is picked.
        const current = currentState.effectStatus?.radio?.station;
        if (current && currentState.effectStatus?.radio?.playing) radioBrowserPlay(current);
      } else {
        radioBrowserStop();
      }
    });
  }

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
  // The switch shows whether the spectrum is ON SCREEN: turning it on
  // brings the spectrum up, turning it off goes back to the previous effect.
  if (spectrumChk) spectrumChk.addEventListener('change', () => {
    const showing = currentState.effect === 'radio' && !!currentState.effectOptions?.radio?.spectrumOn;
    if (spectrumChk.checked !== showing) cxToggleSpectrum();
  });

  panel.querySelectorAll('.spectrum-bands-btn[data-bands]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.spectrum-bands-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('radio', 'bands', Number(btn.dataset.bands));
    });
  });
  // One Style list: the animated scenes (v2) and the classic styles (v1).
  panel.querySelector('#au-look-sel')?.addEventListener('change', (e) => {
    const [ver, key] = e.target.value.split(':');
    if (ver === 'v1') { setEffectOption('radio', 'version', 1); setEffectOption('radio', 'style', key); }
    else { setEffectOption('radio', 'version', 2); setEffectOption('radio', 'scene', key); }
    const v1Row = document.getElementById('au-v1-row'); if (v1Row) v1Row.hidden = ver !== 'v1';
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
  const syncSlider = panel.querySelector('.au-sync-el'), syncVal = panel.querySelector('.au-sync-val-el');
  if (syncSlider) syncSlider.addEventListener('input', () => {
    if (syncVal) syncVal.textContent = syncSlider.value + 'ms';
    setEffectOption('radio', 'syncMs', Number(syncSlider.value));
  });
  const syncAuto = panel.querySelector('.au-sync-auto-el');
  if (syncAuto) syncAuto.addEventListener('change', () => {
    if (syncSlider) syncSlider.disabled = syncAuto.checked;
    setEffectOption('radio', 'syncAuto', syncAuto.checked);
  });
  const scrollSlider = panel.querySelector('.au-scroll-speed-el'), scrollVal = panel.querySelector('.au-scroll-speed-val-el');
  if (scrollSlider) scrollSlider.addEventListener('input', () => {
    if (scrollVal) scrollVal.textContent = scrollSlider.value;
    setEffectOption('radio', 'scrollSpeed', Number(scrollSlider.value));
  });
}

// Featured stations as a dropdown (a long list of rows was too much); picking
// one plays it straight away, like tapping a row.
function renderFeaturedList(el, current) {
  let sel = el.querySelector('select');
  if (!sel) {
    sel = document.createElement('select');
    sel.className = 'tm-select'; sel.style.width = '100%'; sel.setAttribute('aria-label', 'Featured stations');
    sel.addEventListener('change', () => {
      const station = RADIO_STATIONS[Number(sel.value)];
      if (!station) return;
      send({ cmd: 'radioPlay', station });
      radioBrowserPlay(station); // in this same tap, so phone audio may start
    });
    el.replaceChildren(sel);
  }
  const idx = current ? RADIO_STATIONS.findIndex((x) => x.url === current.url) : -1;
  const pick = document.createElement('option'); pick.value = ''; pick.textContent = '▶ Pick a featured station…';
  sel.replaceChildren(pick, ...RADIO_STATIONS.map((st, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = (i === idx ? '♪ ' : '') + st.name + (st.genre ? ' - ' + st.genre : ''); return o; }));
  if (document.activeElement !== sel) sel.value = idx >= 0 ? String(idx) : '';
}

function renderSearchResults(el, results, current) {
  el.innerHTML = '';
  if (!results || !results.length) return;
  results.forEach((s) => el.appendChild(radioStationRow(s, current)));
}

// Recently played stations (this device), one tap to play again.
let recentStationsKey = null;
function syncRecentStations(playing) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('recentStations') || '[]'); } catch (e) { /* storage unavailable */ }
  if (playing && playing.url && !String(playing.url).startsWith('debug') && (!list[0] || list[0].url !== playing.url)) {
    list = [{ name: playing.name, genre: playing.genre || '', url: playing.url }, ...list.filter((x) => x.url !== playing.url)].slice(0, 6);
    try { localStorage.setItem('recentStations', JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  }
  const shown = list.filter((x) => !playing || x.url !== playing.url);
  const key = shown.map((x) => x.url).join('|');
  if (key === recentStationsKey) return;
  recentStationsKey = key;
  const wrap = document.getElementById('radio-recent-wrap'), row = document.getElementById('radio-recent');
  if (!wrap || !row) return;
  wrap.hidden = !shown.length;
  row.replaceChildren(...shown.map((st) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '📻 ' + st.name; b.title = 'Play ' + st.name + (st.genre ? ' (' + st.genre + ')' : '');
    b.addEventListener('click', () => { send({ cmd: 'radioPlay', station: st }); radioBrowserPlay(st); });
    return b;
  }));
}

function syncRadioPanel() {
  updateActiveEffectLabel();
  const panel = document.getElementById('panel-radio');
  if (!panel) return;
  const status = currentState.effectStatus?.radio;
  const opts = currentState.effectOptions?.radio || {};
  const current = status?.station || null;
  syncRecentStations(status && status.playing ? current : null);

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

  // Re-render when the playing station or the favourites change (stars).
  const favs = currentState.prefs?.stations || [];
  const listKey = (current?.url || '') + '|' + favs.map((x) => x.url).join(',');
  const featuredEl = panel.querySelector('.radio-station-list-el');
  if (featuredEl && featuredEl.dataset.lastCurrent !== listKey) {
    featuredEl.dataset.lastCurrent = listKey;
    renderFeaturedList(featuredEl, current);
    const favEl = panel.querySelector('.radio-fav-list-el');
    if (favEl) {
      favEl.replaceChildren(...favs.map((st) => radioStationRow(st, current)));
      if (!favs.length) favEl.innerHTML = '<div class="ui-note">Tap ★ on any station to keep it here.</div>';
    }
    if (resultsEl && search) renderSearchResults(resultsEl, search.results, current);
  }

  const spectrumChk = panel.querySelector('.ov-chk[data-ov="spectrum"]');
  const spectrumOptions = panel.querySelector('.ov-options-el[data-ov="spectrum"]');
  const spectrumOn = !!opts.spectrumOn;
  if (spectrumChk) spectrumChk.checked = spectrumOn && currentState.effect === 'radio';
  if (spectrumOptions) spectrumOptions.style.display = spectrumOn ? '' : 'none';
  panel.querySelectorAll('.spectrum-bands-btn[data-bands]').forEach((btn) => btn.classList.toggle('active', Number(btn.dataset.bands) === (opts.bands ?? 64)));
  const isV1 = opts.version === 1;
  const lookSel = panel.querySelector('#au-look-sel');
  if (lookSel && document.activeElement !== lookSel) {
    lookSel.value = isV1 ? 'v1:' + (opts.style || 'glow') : 'v2:' + (opts.scene || 'auto');
    if (lookSel.selectedIndex < 0) lookSel.value = 'v2:auto'; // a choice from an older version
  }
  const v1Row = document.getElementById('au-v1-row'); if (v1Row) v1Row.hidden = !isV1;
  panel.querySelectorAll('.au-theme-btn[data-autheme]').forEach((btn) => btn.classList.toggle('active', Number(btn.dataset.autheme) === (opts.theme ?? 5)));
  panel.querySelectorAll('.au-barmode-btn[data-barmode]').forEach((btn) => btn.classList.toggle('active', btn.dataset.barmode === (opts.barMode || 'solid')));

  const fitScreenChk = panel.querySelector('.sp-fit-screen-el');
  if (fitScreenChk && document.activeElement !== fitScreenChk) fitScreenChk.checked = !!opts.fitToScreen;
  const autoGainChk = panel.querySelector('.au-autogain-el');
  // Defaults to ON (opts.autoGain !== false), not off - see radio.js's
  // effectRadio() for the matching server-side default change.
  if (autoGainChk && document.activeElement !== autoGainChk) autoGainChk.checked = opts.autoGain !== false;
  const gainSlider = panel.querySelector('.au-gain-el'), gainVal = panel.querySelector('.au-gain-val-el');
  if (gainSlider && document.activeElement !== gainSlider) { gainSlider.value = opts.gain ?? 2; if (gainVal) gainVal.textContent = Number(gainSlider.value).toFixed(1) + '×'; }
  const syncSlider = panel.querySelector('.au-sync-el'), syncVal = panel.querySelector('.au-sync-val-el');
  const syncAutoEl = panel.querySelector('.au-sync-auto-el'), autoOn = opts.syncAuto !== false; // Auto sync is the default
  if (syncAutoEl) syncAutoEl.checked = autoOn;
  if (syncSlider) syncSlider.disabled = autoOn;
  if (autoOn) {
    // Auto speaker sync: show what the Pi measured (see ffmpegAudio.js _measureLatency).
    const m = currentState.effectStatus?.radio?.autoSyncMs;
    if (syncVal) syncVal.textContent = Number.isFinite(m) ? m + 'ms' : 'auto';
    if (syncSlider && Number.isFinite(m)) syncSlider.value = m;
  } else if (syncSlider && document.activeElement !== syncSlider) { syncSlider.value = opts.syncMs ?? 150; if (syncVal) syncVal.textContent = syncSlider.value + 'ms'; }
  const scrollSlider = panel.querySelector('.au-scroll-speed-el'), scrollVal = panel.querySelector('.au-scroll-speed-val-el');
  if (scrollSlider && document.activeElement !== scrollSlider) { scrollSlider.value = opts.scrollSpeed ?? 0; if (scrollVal) scrollVal.textContent = scrollSlider.value; }
}

// ---------------------------------------------------------------------
// Celestial's option panel (panel-moon): the body radio group
// (core.effectOptions.moon.body) and the Solar System Orbit Speed slider
// (moon.solarSpeed, 0-7 logarithmic multiplier).
// ---------------------------------------------------------------------
// City search for the Moon's terminator tilt: like
// wireWeatherCityDropdown(), but it saves lat/lon directly
// (setEffectOption('moon','lat'/'lon', ...)) rather than a city name.
let _moonCityTimer = null;
function wireCelestialCityDropdown(cityInput, dropdown, statusEl) {
  if (!cityInput || !dropdown) return;
  const query = () => {
    const q = cityInput.value.trim();
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    clearTimeout(_moonCityTimer);
    _moonCityTimer = setTimeout(() => {
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&format=json`)
        .then((r) => r.json())
        .then((data) => {
          const results = data.results || [];
          if (!results.length) { dropdown.style.display = 'none'; return; }
          dropdown.innerHTML = '';
          results.forEach((r) => {
            const label = `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}${r.country ? ', ' + r.country : ''}`;
            const short = r.country ? `${r.name}, ${r.country}` : r.name;
            const row = document.createElement('div');
            row.style.cssText = 'padding:6px 8px;cursor:pointer;font-size:13px;color:#9bd;border-bottom:1px solid rgba(80,120,255,0.1);';
            row.textContent = label;
            row.addEventListener('click', () => {
              cityInput.value = short;
              dropdown.style.display = 'none';
              setEffectOption('moon', 'lat', r.latitude);
              setEffectOption('moon', 'lon', r.longitude);
              if (statusEl) statusEl.textContent = 'Terminator tilt: ' + short;
            });
            dropdown.appendChild(row);
          });
          dropdown.style.display = 'block';
        })
        .catch(() => { dropdown.style.display = 'none'; });
    }, 250);
  };
  cityInput.addEventListener('input', query);
  cityInput.addEventListener('focus', query);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#moon-city') && !e.target.closest('#moon-city-dropdown')) dropdown.style.display = 'none';
  });
}

function wireCelestialPanel() {
  const panel = document.getElementById('panel-moon');
  if (!panel) return;
  panel.querySelectorAll('input[name="celestial-body"]').forEach((r) => {
    r.addEventListener('change', () => { if (r.checked) setEffectOption('moon', 'body', r.value); });
  });
  wireCelestialCityDropdown(
    panel.querySelector('#moon-city'),
    panel.querySelector('#moon-city-dropdown'),
    panel.querySelector('#moon-city-status'),
  );
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
    btn.addEventListener('click', () => {
      const flatNow = currentState.panelMode === 'wall' || currentState.panelMode === '2d';
      const same = mode === '2d' ? flatNow : (!flatNow && currentState.panelSize === size);
      if (same) return;
      // Switching display type or cube resolution restarts the Pi's panel
      // driver (see app.js on the Pi) - say so before it happens.
      if (!confirm('This restarts the display for a few seconds to apply the change. Continue?')) return;
      send({ cmd: 'setPanelConfig', size, mode });
    });
  });
  // Setup > Display: "Edit panel layout" opens the layout editor on the preview.
  document.getElementById('setup-layout-btn')?.addEventListener('click', () => {
    document.getElementById('wall-layout-btn')?.click();
    if (window.innerWidth < 760) document.getElementById('menu-toggle')?.click();
  });
  syncPanelButtons();
}

function syncPanelButtons() {
  document.querySelectorAll('.size-btn[data-size]').forEach((btn) => {
    const size = Number(btn.dataset.size);
    const mode = btn.dataset.mode === 'panel2d' ? '2d' : 'cube';
    const flat = currentState.panelMode === 'wall' || currentState.panelMode === '2d';
    btn.classList.toggle('active', mode === '2d' ? flat : currentState.panelMode === 'cube' && currentState.panelSize === size);
  });
  document.body.dataset.mode = currentState.panelMode || 'cube';
  const wallBtn = document.getElementById('wall-mode-btn');
  if (wallBtn) wallBtn.classList.toggle('active', currentState.panelMode === 'wall');
  // Header line under the title - was static "64³ · 24,576 surface LEDs"
  // whatever mode was actually running.
  const count = document.getElementById('led-count-label');
  if (count) {
    const n = currentState.panelSize || 64;
    const panels = currentState.panelMode === 'wall' ? (currentState.panels || []).length || 1 : 1;
    count.textContent = currentState.panelMode === '2d' ? `1 panel · ${n}×${n} · ${(n * n).toLocaleString()} LEDs`
      : currentState.panelMode === 'wall' ? `Flat · ${panels} panel${panels === 1 ? '' : 's'} · ${(panels * n * n).toLocaleString()} LEDs`
      : `${n}×${n} cube · ${(6 * n * n).toLocaleString()} surface LEDs`;
  }
  const label = document.getElementById('cube-label');
  if (label) label.textContent = currentState.panelMode === '2d' ? '2D Panel' : `${currentState.panelSize}×${currentState.panelSize}`;
  // Displays "+" (multi-panel wall layout) only makes sense starting from
  // a single flat 2D panel - a real request scoped it to exactly that: "only
  // allow adding displays on 2D display mode". Wall mode itself (once
  // already in it, from a previous 2D + click) still shows the toolbar too,
  // since #wall-toolbar is how you keep adding further displays to an
  // existing wall layout - only the 3 CUBE size modes (8x8/16x16/64x64)
  // hide it entirely, since a 6-face cube has no flat "wall" analogue.
  const wallToolbar = document.getElementById('wall-toolbar');
  if (wallToolbar) wallToolbar.style.display = currentState.panelMode === 'cube' ? 'none' : 'flex';
}

// "🔍 Identify Panels" - a wiring-calibration toggle (see wsServer.js's
// "setIdentifyPanels" command comment / src/effects/identify.js). Labels
// every physical panel with its own identity directly on the panel itself,
// so wiring 6 boards across 3 HAT/Active-3 outputs into a cube - or any
// arbitrary wall shape (L, star, long strip) - can be verified without the
// old "remember which solid color meant which face" workflow.
function wireIdentifyPanelsButton() {
  const btn = document.getElementById('identify-panels-btn');
  if (btn) btn.addEventListener('click', () => send({ cmd: 'setIdentifyPanels', enabled: !currentState.identifyPanels }));
}

function syncIdentifyPanelsButton() {
  const btn = document.getElementById('identify-panels-btn');
  if (btn) btn.classList.toggle('active', !!currentState.identifyPanels);
}

// "✕ Clear All" - see wsServer.js's "clearAll" command comment.
function wireClearAllButton() {
  const btn = document.getElementById('clear-all-btn');
  // A toggle: off, and tapping again turns the display back on.
  if (btn) btn.addEventListener('click', () => send(currentState.blank ? { cmd: 'setEffect', effect: currentState.effect || 'plasma' } : { cmd: 'clearAll' }));
}

// 💡 LED panels off (shared, on the Pi) and 👁 preview off (this device
// only, remembered here and re-sent after every reconnect).
function cxPreviewOff() { try { return localStorage.getItem('cxPreviewOff') === '1'; } catch (e) { return false; } }
function cxApplyPreviewOff(off) {
  document.body.classList.toggle('cx-preview-off', off);
  try { localStorage.setItem('cxPreviewOff', off ? '1' : ''); } catch (e) { /* storage blocked */ }
  send({ cmd: 'setPreviewOff', on: off });
  const b = document.getElementById('preview-off-btn');
  if (b) { b.classList.toggle('cx-muted', off); b.classList.toggle('is-off', off); b.textContent = off ? '🙈' : '👁'; b.title = off ? 'Preview is OFF on this device - tap to show it' : 'Hide the preview on this device'; }
}
document.getElementById('preview-off-btn')?.addEventListener('click', () => cxApplyPreviewOff(!document.body.classList.contains('cx-preview-off')));
document.getElementById('panels-off-btn')?.addEventListener('click', () => send({ cmd: 'setPanelsOff', on: !currentState.panelsOff }));
function syncPanelsOffButton() {
  const b = document.getElementById('panels-off-btn');
  if (!b) return;
  const off = !!currentState.panelsOff;
  b.classList.toggle('cx-muted', off);
  b.title = off ? 'Turn the LED panels back on' : 'LED panels off (preview and music keep going)';
}

function syncClearAllButton() {
  syncPanelsOffButton();
  const btn = document.getElementById('clear-all-btn'), blank = !!currentState.blank, panels = !!currentState.panelsOff;
  if (btn) { btn.classList.toggle('active', blank); btn.classList.toggle('is-off', blank); btn.title = blank ? 'Display is OFF - tap an effect or Turn on' : 'Off (display and music)'; }
  document.getElementById('panels-off-btn')?.classList.toggle('is-off', panels);
}

// "🔇 Stop Sound" next to Clear All stops background radio without opening
// the Radio panel. It must also call radioBrowserStop(), because "Play in
// this browser" plays through a client <audio> element that the WS
// 'stopAllSound' command can't reach (the Radio Stop button does the same).
// The speaker button mutes/unmutes (the station keeps playing; Stop on the
// Music tab still stops it). Muting sets the volume to 0 and remembers the
// level to come back to.
function radioMuted() { return Number(currentState.effectOptions?.radio?.volume ?? 0.8) === 0; }
// ---------------------------------------------------------------------
// 🎨 Draw: finger-paint on a canvas the size of the display; strokes go
// to the Pi as they're drawn (see src/effects/drawPad.js). The picture is
// kept on this phone too, so reopening carries on where you left off.
// ---------------------------------------------------------------------
const DRAW_COLOURS = ['#ffffff', '#ff3b3b', '#ff9f1c', '#ffe14d', '#4dff6a', '#2ee6d6', '#3b8bff', '#a64dff', '#ff5ec4', '#8b5a2b'];
let drawState = null;
function drawDims() {
  const S = currentState.panelSize || 64;
  if (currentState.panelMode !== 'wall' || !Array.isArray(currentState.panels) || !currentState.panels.length) return [S, S];
  const gx = Math.max(...currentState.panels.map((p) => p.gx)) + 1, gy = Math.max(...currentState.panels.map((p) => p.gy)) + 1;
  return [gx * S, gy * S];
}
function b64Bytes(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s); }
function bytesB64(b64) { const s = atob(b64), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
function wireDraw() {
  const modal = document.getElementById('draw-modal'), cv = document.getElementById('draw-canvas');
  if (!modal || !cv) return;
  const ctx2 = cv.getContext('2d');
  const st = drawState = { w: 64, h: 64, pix: null, colour: 0xffffff, size: 1, undo: [], ops: [], last: null, timer: null };
  const key = () => 'drawPad_' + st.w + 'x' + st.h;
  const paint = () => {
    const img = ctx2.createImageData(st.w, st.h);
    for (let i = 0, j = 0; i < st.pix.length; i += 3, j += 4) { img.data[j] = st.pix[i]; img.data[j + 1] = st.pix[i + 1]; img.data[j + 2] = st.pix[i + 2]; img.data[j + 3] = 255; }
    ctx2.putImageData(img, 0, 0);
  };
  const store = () => { try { localStorage.setItem(key(), b64Bytes(st.pix)); } catch (e) { /* storage full or blocked */ } };
  const sendImage = () => send({ cmd: 'drawOps', w: st.w, h: st.h, image: b64Bytes(st.pix) });
  const flush = () => { st.timer = null; if (!st.ops.length) return; send({ cmd: 'drawOps', w: st.w, h: st.h, ops: st.ops.splice(0) }); store(); };
  const dab = (x, y) => {
    const s = st.size || 1, col = st.size ? st.colour : 0, x0 = Math.round(x - (s - 1) / 2), y0 = Math.round(y - (s - 1) / 2);
    for (let yy = y0; yy < y0 + s; yy++) for (let xx = x0; xx < x0 + s; xx++) {
      if (xx < 0 || yy < 0 || xx >= st.w || yy >= st.h) continue;
      const i = (yy * st.w + xx) * 3; st.pix[i] = col >> 16; st.pix[i + 1] = (col >> 8) & 255; st.pix[i + 2] = col & 255;
    }
    st.ops.push([Math.round(x), Math.round(y), col, s]);
    if (!st.timer) st.timer = setTimeout(flush, 40);
  };
  const at = (e) => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * st.w), Math.floor((e.clientY - r.top) / r.height * st.h)]; };
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    st.undo.push(st.pix.slice()); if (st.undo.length > 20) st.undo.shift();
    st.last = at(e); dab(...st.last); paint();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!st.last) return;
    const [x, y] = at(e), [lx, ly] = st.last, n = Math.max(Math.abs(x - lx), Math.abs(y - ly));
    for (let k = 1; k <= n; k++) dab(lx + (x - lx) * k / n, ly + (y - ly) * k / n);
    st.last = [x, y]; paint();
  });
  const up = () => { st.last = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  const colours = document.getElementById('draw-colours');
  colours.replaceChildren(...DRAW_COLOURS.map((c, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = i === 0 ? 'on' : '';
    b.style.cssText = 'width:30px;height:30px;padding:0;border-radius:50%;background:' + c + ';';
    b.setAttribute('aria-label', 'Colour ' + c);
    b.addEventListener('click', () => { st.colour = parseInt(c.slice(1), 16); if (!st.size) st.size = 1; colours.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); syncSizes(); });
    return b;
  }));
  const syncSizes = () => document.querySelectorAll('#draw-sizes button').forEach((x) => x.classList.toggle('on', Number(x.dataset.size) === st.size));
  document.querySelectorAll('#draw-sizes button').forEach((b) => b.addEventListener('click', () => { st.size = Number(b.dataset.size); syncSizes(); }));
  document.getElementById('draw-undo').addEventListener('click', () => { const prev = st.undo.pop(); if (!prev) return; st.pix = prev; paint(); store(); sendImage(); });
  document.getElementById('draw-clear').addEventListener('click', () => { st.undo.push(st.pix.slice()); st.pix.fill(0); paint(); store(); send({ cmd: 'drawOps', w: st.w, h: st.h, clear: true }); });
  document.getElementById('draw-save').addEventListener('click', () => { send({ cmd: 'saveDrawing', w: st.w, h: st.h, image: b64Bytes(st.pix) }); cxToast('💾 Saved to the display'); });
  const slide = document.getElementById('draw-slideshow');
  slide.addEventListener('change', () => { try { localStorage.setItem('drawSlideshow', slide.checked ? '1' : ''); } catch (e) { /* blocked */ } });
  const close = () => {
    modal.hidden = true; flush();
    setEffectOption('draw', 'slideshow', slide.checked); // slideshow only while you're not drawing
  };
  document.getElementById('draw-close').addEventListener('click', close);
  document.getElementById('draw-open').addEventListener('click', () => {
    [st.w, st.h] = drawDims();
    cv.width = st.w; cv.height = st.h;
    st.pix = new Uint8Array(st.w * st.h * 3);
    try { const saved = localStorage.getItem(key()); if (saved) { const b = bytesB64(saved); if (b.length === st.pix.length) st.pix.set(b); } } catch (e) { /* blocked */ }
    try { slide.checked = !!localStorage.getItem('drawSlideshow'); } catch (e) { /* blocked */ }
    st.undo = []; paint();
    modal.hidden = false;
    setEffectOption('draw', 'slideshow', false);
    send({ cmd: 'setEffect', effect: 'draw' });
    sendImage();
    send({ cmd: 'drawList' });
  });
}
function renderDrawGallery(list) {
  const g = document.getElementById('draw-gallery'); if (!g || !drawState) return;
  g.replaceChildren(...(list || []).map((d, i) => {
    const wrapEl = document.createElement('div'); wrapEl.style.cssText = 'position:relative;';
    const c = document.createElement('canvas'); c.width = d.w; c.height = d.h;
    c.style.cssText = 'width:100%;image-rendering:pixelated;border-radius:6px;background:#000;cursor:pointer;';
    const px = bytesB64(d.image), cx = c.getContext('2d'), img = cx.createImageData(d.w, d.h);
    for (let k = 0, j = 0; k < px.length; k += 3, j += 4) { img.data[j] = px[k]; img.data[j + 1] = px[k + 1]; img.data[j + 2] = px[k + 2]; img.data[j + 3] = 255; }
    cx.putImageData(img, 0, 0);
    c.title = 'Load ' + d.name;
    c.addEventListener('click', () => {
      if (d.w !== drawState.w || d.h !== drawState.h) { cxToast('That drawing is a different size'); return; }
      drawState.undo.push(drawState.pix.slice()); drawState.pix = px;
      document.getElementById('draw-canvas').getContext('2d').putImageData(img, 0, 0);
      send({ cmd: 'drawOps', w: d.w, h: d.h, image: d.image });
    });
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Delete drawing');
    x.style.cssText = 'position:absolute;top:-4px;right:-4px;width:20px;height:20px;padding:0;border-radius:50%;font-size:10px;';
    x.addEventListener('click', () => send({ cmd: 'deleteDrawing', index: i }));
    wrapEl.append(c, x);
    return wrapEl;
  }));
}

// 💌 Message: a note that drops onto the display (see src/effects/notice.js).
// Setup > Bluetooth > Range (see src/bluetooth.js setRange).
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('#bt-range button'); if (!b) return;
  document.querySelectorAll('#bt-range button').forEach((x) => x.classList.toggle('on', x === b));
  const note = document.getElementById('bt-range-note'); if (note) note.textContent = 'Switching…';
  send({ cmd: 'btSetRange', range: b.dataset.range });
});

function wireNote() {
  const modal = document.getElementById('note-modal'); if (!modal) return;
  const text = document.getElementById('note-text');
  let colour = '#ffd23d', secs = 30;
  const chips = (id, fn) => document.querySelectorAll('#' + id + ' button').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('#' + id + ' button').forEach((x) => x.classList.toggle('on', x === b)); fn(b); }));
  chips('note-colours', (b) => { colour = b.dataset.c; });
  chips('note-secs', (b) => { secs = Number(b.dataset.s); });
  text.addEventListener('input', () => { document.getElementById('note-count').textContent = text.value.length + ' / 120'; });
  document.getElementById('note-open').addEventListener('click', () => { modal.hidden = false; setTimeout(() => text.focus(), 50); });
  document.getElementById('note-close').addEventListener('click', () => { modal.hidden = true; });
  document.getElementById('note-send').addEventListener('click', () => {
    if (!text.value.trim()) { text.focus(); return; }
    send({ cmd: 'sendNote', text: text.value, color: colour, secs });
    cxToast('💌 Sent to the display'); modal.hidden = true; text.value = '';
    document.getElementById('note-count').textContent = '0 / 120';
  });
  document.getElementById('note-clear').addEventListener('click', () => { send({ cmd: 'clearNotice' }); cxToast('Message taken down'); });
}

// Setup -> Software update: shows whether the Pi is behind GitHub, and
// updates + restarts it (see src/selfUpdate.js). The Setup tab gets a dot
// while an update is waiting.
function syncUpdateStatus() {
  const u = currentState.update, el = document.getElementById('update-status'); if (!el) return;
  const run = document.getElementById('update-run-btn'), badge = document.getElementById('setup-badge');
  const behind = u && u.behind > 0;
  if (badge) badge.hidden = !behind;
  if (run) run.disabled = !behind || (u && u.updating);
  if (!u || !u.checkedAt) { el.textContent = 'Not checked yet - the Pi looks a minute after starting, then every 6 hours.'; return; }
  const when = new Date(u.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (u.updating) el.textContent = 'Updating…';
  else if (u.error) el.textContent = '⚠ ' + u.error + ' (checked ' + when + ')';
  else if (behind) el.textContent = '🆕 ' + u.behind + ' update' + (u.behind > 1 ? 's' : '') + ' available - latest: ' + u.latest;
  else el.textContent = '✅ Up to date (' + APP_VERSION + ', checked ' + when + ')';
}
function wireUpdate() {
  document.getElementById('update-check-btn')?.addEventListener('click', () => { document.getElementById('update-status').textContent = 'Checking GitHub…'; send({ cmd: 'checkUpdate' }); });
  document.getElementById('update-run-btn')?.addEventListener('click', (e) => {
    e.target.disabled = true;
    document.getElementById('update-status').textContent = 'Updating… the display restarts when it is done.';
    send({ cmd: 'runUpdate' });
  });
  document.getElementById('spk-reconnect-btn')?.addEventListener('click', (e) => {
    e.target.disabled = true; e.target.textContent = 'Connecting…';
    send({ cmd: 'btReconnect' });
  });
}
// Music tab: warn when the usual speaker has dropped or isn't the output.
function renderSpeakerWarning(devices, lastMac) {
  const box = document.getElementById('spk-warn'); if (!box) return;
  const d = lastMac && (devices || []).find((x) => x.mac === lastMac);
  const ok = !lastMac || (d && d.connected && d.isDefaultOutput);
  box.hidden = ok;
  if (!ok) document.getElementById('spk-warn-text').textContent = d && d.connected ? '🔈 ' + (d.name || 'The speaker') + ' is connected but not playing the sound' : '🔇 ' + ((d && d.name) || 'The speaker') + ' is not connected';
}

function wireStopSoundButton() {
  const btn = document.getElementById('stop-sound-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const el = document.getElementById('radio-browser-audio');
    let v;
    if (radioMuted()) {
      try { v = Number(localStorage.getItem('unmuteVol')) || 0.8; } catch (e) { v = 0.8; }
      cxToast('🔊 Sound on');
    } else {
      const cur = Number(currentState.effectOptions?.radio?.volume ?? 0.8);
      try { localStorage.setItem('unmuteVol', String(cur || 0.8)); } catch (e) { /* storage unavailable */ }
      v = 0;
      cxToast('🔇 Muted');
    }
    setEffectOption('radio', 'volume', v);
    if (el) el.volume = v;
  });
}

// ---------------------------------------------------------------------
// Master brightness / speed sliders (Display section)
// ---------------------------------------------------------------------
let _brightEditingUntil = 0;
function wireSliders() {
  const bright = document.getElementById('bright-slider');
  const brightVal = document.getElementById('bright-val');
  if (bright) {
    // Same echo-fighting fix as #ov-global-bright (see that slider's own
    // comment in wireOverlaysPanel) - a time-based "ignore server echoes
    // for a bit" guard instead of relying on document.activeElement, which
    // touch drags don't reliably set. Applied here pre-emptively: this
    // slider moved to the top of the sidebar (prominent, now the ONLY
    // brightness control) and shares the exact same input->send->broadcast
    // ->sync round-trip architecture that caused it for #ov-global-bright.
    let brightSendQueued = false;
    bright.addEventListener('input', () => {
      _brightEditingUntil = Date.now() + 1200;
      const v = Number(bright.value);
      if (brightVal) brightVal.textContent = Math.round(v * 100) + '%';
      if (brightSendQueued) return;
      brightSendQueued = true;
      requestAnimationFrame(() => {
        brightSendQueued = false;
        send({ cmd: 'setBrightness', value: Number(bright.value) });
      });
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
  if (bright && document.activeElement !== bright && Date.now() >= _brightEditingUntil) {
    bright.value = currentState.brightness;
    if (brightVal) brightVal.textContent = Math.round(currentState.brightness * 100) + '%';
  }
  const speed = document.getElementById('speed-slider');
  const speedVal = document.getElementById('speed-val');
  if (speed) { speed.value = currentState.speed; if (speedVal) speedVal.textContent = Number(currentState.speed).toFixed(1) + 'x'; }
}

// ---------------------------------------------------------------------
// Timers ("alarms"): the list on the Time tab and the editor sheet
// (#alarm-modal). The server owns the list (state.alarms, see
// src/alarmConfig.js for the stored shape); this maps it to four simple
// kinds:
//   wake     - optional sunrise, then an effect/scene (+ message)
//   start    - switch to an effect/scene at the time
//   winddown - fade from full to dark over N minutes (prealarm.windDown)
//   off      - blank the display (triggerType 'off'; music keeps playing)
const TM_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TM_KIND_LABEL = { wake: '⏰ Wake up', start: '▶ Switch on', winddown: '🌙 Wind down', off: '⏻ Turn off' };
const TM_REPEAT_DAYS = { daily: [0, 1, 2, 3, 4, 5, 6], weekdays: [1, 2, 3, 4, 5], weekends: [0, 6], once: [] };
let tmEdit = null; // { id|null, kind, days:Set, sunrise, wd, repeatHourly }

function tmKindOf(al) {
  if (TM_KIND_LABEL[al.kind]) return al.kind;
  if (al.triggerType === 'off') return 'off';
  if (al.prealarm?.windDown) return 'winddown';
  if (al.prealarm?.enabled || al.message) return 'wake';
  return 'start';
}
function tmDaysOf(al) {
  if (al.repeat === 'weekly') return al.days || [];
  return TM_REPEAT_DAYS[al.repeat] || TM_REPEAT_DAYS.daily;
}
// Days → the stored repeat mode.
function tmRepeatFor(days) {
  const key = [...days].sort().join(',');
  for (const r of ['daily', 'weekdays', 'weekends']) if (TM_REPEAT_DAYS[r].join(',') === key) return { repeat: r, days: [] };
  if (!days.size) return { repeat: 'once', days: [] };
  return { repeat: 'weekly', days: [...days].sort() };
}
function tmRepeatLabel(al) {
  if (al.repeat === 'hourly') return 'Every hour';
  const r = { once: 'Once', daily: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends' }[al.repeat];
  if (r) return r;
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => (al.days || []).includes(d)).map((d) => TM_DAY_NAMES[d]).join(' ') || 'Never';
}
// When an alarm next runs (Date), or null if it never will.
function tmNextRun(al, from = new Date()) {
  if (al.repeat === 'hourly') {
    const d = new Date(from); d.setSeconds(0, 0); d.setMinutes(al.minute);
    if (d <= from) d.setHours(d.getHours() + 1);
    return d;
  }
  const days = al.repeat === 'once' ? [0, 1, 2, 3, 4, 5, 6] : tmDaysOf(al);
  if (!days.length) return null;
  for (let i = 0; i < 8; i++) {
    const d = new Date(from); d.setDate(d.getDate() + i); d.setHours(al.hour, al.minute, 0, 0);
    if (d > from && days.includes(d.getDay())) return d;
  }
  return null;
}
function tmUntil(d) {
  if (!d) return '';
  const mins = Math.round((d - Date.now()) / 60000);
  if (mins < 60) return `in ${Math.max(1, mins)} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return `in ${h} h${m ? ' ' + m + ' min' : ''}`;
  return 'on ' + TM_DAY_NAMES[d.getDay()];
}
function tmHHMM(al) { return String(al.hour).padStart(2, '0') + ':' + String(al.minute).padStart(2, '0'); }
function tmWhat(al) {
  if (al.triggerType === 'scene') return 'Scene: ' + (al.scene || '?');
  if (al.effect) return effectNames?.[al.effect] || al.effect;
  return '';
}

function renderAlarmList() {
  const el = document.getElementById('alarm-list-ui');
  if (!el) return;
  const alarms = (currentState.alarms || []).slice().sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  if (!alarms.length) { el.innerHTML = '<div class="tm-empty">No timers yet. Tap one below to add it.</div>'; return; }
  el.replaceChildren(...alarms.map((al) => {
    const kind = tmKindOf(al);
    const what = kind === 'winddown' ? `fades over ${al.prealarm?.wdMinutes || 15} min` : kind === 'off' ? 'display off' : tmWhat(al);
    const next = al.enabled ? tmUntil(tmNextRun(al)) : 'off';
    const div = document.createElement('div');
    div.className = 'cx-timer' + (al.enabled ? ' on' : '');
    div.innerHTML = `<div class="cx-timer-main"><b></b><span></span><small></small><em class="tm-last"></em></div><button type="button" class="tm-test" aria-label="Test this timer now" title="Run it now, shortened to about 20 seconds">▶ Test</button><button type="button" class="cx-switch${al.enabled ? ' on' : ''}" aria-label="Timer on or off"></button>`;
    div.querySelector('b').textContent = tmHHMM(al);
    div.querySelector('span').textContent = (al.name || TM_KIND_LABEL[kind]) + (what ? ' · ' + what : '');
    const radioTxt = al.radio?.action === 'start' ? ' · 📻 ' + (al.radio.station?.name || 'radio') : al.radio?.action === 'stop' ? ' · 📻 off' : '';
    div.querySelector('small').textContent = tmRepeatLabel(al) + (next ? ' · ' + next : '') + radioTxt;
    div.querySelector('.cx-switch').addEventListener('click', (e) => { e.stopPropagation(); send({ cmd: 'setAlarmEnabled', id: al.id, enabled: !al.enabled }); });
    // Timer history: when it last ran and what happened (set by the Pi, see effects/alarms.js).
    const last = div.querySelector('.tm-last');
    if (al.lastRun && al.lastRun.text) last.textContent = 'Last: ' + al.lastRun.text; else last.remove();
    div.querySelector('.tm-test').addEventListener('click', (e) => { e.stopPropagation(); send({ cmd: 'testAlarm', id: al.id }); cxToast('▶ Testing - watch the display'); });
    div.addEventListener('click', () => openAlarmEditor(al.id));
    return div;
  }));
}

function wireAlarmSection() {
  document.getElementById('alarm-add-btn')?.addEventListener('click', () => openAlarmEditor(null));
  document.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => openAlarmEditor(null, b.dataset.quick)));
}

// Stations for a "Start a station" timer: your starred ones, plus whatever is playing now.
let btPairedCache = [];
// Where a timer's radio plays: the output in use at the time, the Pi's own
// output, or one of the paired speakers (connected when the timer starts).
function tmFillOutputs() {
  const sel = document.getElementById('tm-output'); if (!sel || !tmEdit) return;
  const opts = [['', '🔈 Sound: current output'], ['local', '🔈 Sound: Pi output (no Bluetooth)'], ...btPairedCache.map((d) => [d.mac, '🔊 Sound: ' + (d.name || d.mac)])];
  if (tmEdit.output && !opts.some(([v]) => v === tmEdit.output)) opts.push([tmEdit.output, '🔊 Sound: ' + tmEdit.output]);
  sel.replaceChildren(...opts.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
  sel.value = tmEdit.output || '';
}

function tmFillStations() {
  const sel = document.getElementById('tm-station'); if (!sel || !tmEdit) return;
  const list = [...(currentState.prefs?.stations || [])];
  const now = currentState.effectStatus?.radio?.station;
  if (now && now.url && !list.some((x) => x.url === now.url)) list.unshift({ ...now, nowPlaying: true });
  if (tmEdit.station && tmEdit.station.url && !list.some((x) => x.url === tmEdit.station.url)) list.unshift(tmEdit.station);
  sel.replaceChildren(...list.map((st, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = (st.nowPlaying ? '▶ ' : '★ ') + (st.name || 'Station'); return o; }));
  sel._list = list;
  const idx = tmEdit.station ? list.findIndex((x) => x.url === tmEdit.station.url) : 0;
  sel.value = String(Math.max(0, idx));
  if (!tmEdit.station && list[0]) tmEdit.station = list[0];
  document.getElementById('tm-station-note').textContent = list.length ? 'Star more stations on the Music tab to choose them here.' : 'No stations yet: play or star one on the Music tab first.';
}

function tmFillShow(sel, al) {
  const scenes = currentState.scenes || [];
  const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };
  const groups = [];
  if (scenes.length) { const g = document.createElement('optgroup'); g.label = 'Scenes'; g.append(...scenes.map((sc) => opt('scene:' + sc.name, sc.name))); groups.push(g); }
  const g = document.createElement('optgroup'); g.label = 'Effects';
  g.append(...Object.entries(effectNames || {}).filter(([k]) => k !== 'custom_cube' && k !== 'easter_egg')
    .sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => opt('effect:' + k, v)));
  groups.push(g);
  sel.replaceChildren(opt('', 'Keep what is showing'), ...groups);
  sel.value = al.triggerType === 'scene' && al.scene ? 'scene:' + al.scene : al.effect ? 'effect:' + al.effect : '';
  if (sel.selectedIndex < 0) sel.value = '';
}

function tmSetChip(groupEl, attr, value) {
  groupEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === String(value)));
}

function tmSync() {
  const e = tmEdit;
  document.querySelectorAll('.tm-kind').forEach((b) => { const on = b.dataset.kind === e.kind; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.hidden = !on; };
  show('tm-show-row', e.kind === 'wake' || e.kind === 'start');
  show('tm-sunrise-row', e.kind === 'wake' || e.kind === 'start'); // a switch-on timer can fade up too
  show('tm-msg-row', e.kind === 'wake' || e.kind === 'start');
  show('tm-wd-row', e.kind === 'winddown');
  tmSetChip(document.getElementById('tm-sunrise'), 'v', e.sunrise);
  tmSetChip(document.getElementById('tm-wd'), 'v', e.wd);
  // Custom minutes boxes show the value when it isn't one of the chips.
  for (const [id, v, chips] of [['tm-sun-custom', e.sunrise, [0, 1, 5, 15, 30]], ['tm-wd-custom', e.wd, [1, 5, 15, 30, 60]]]) {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = chips.includes(v) ? '' : String(v);
  }
  tmSetChip(document.getElementById('tm-radio'), 'ra', e.radio);
  document.getElementById('tm-station-row').hidden = e.radio !== 'start';
  // Say how the radio fades with the light.
  const rn = document.getElementById('tm-radio-note');
  if (rn) rn.textContent = e.radio === 'none' ? '' : e.kind === 'wake' && e.sunrise > 0 && e.radio === 'start' ? `Starts quietly when the sunrise begins and rises to your volume by ${tmHHMM(tmRead())}.` : e.kind === 'winddown' ? 'Fades out with the light, then stops.' : '';
  const rep = e.repeatHourly ? 'hourly' : tmRepeatFor(e.days).repeat;
  tmSetChip(document.getElementById('tm-repeat'), 'r', rep);
  document.querySelectorAll('#tm-days button').forEach((b) => b.classList.toggle('on', e.days.has(+b.dataset.d)));
  document.getElementById('tm-name').placeholder = TM_KIND_LABEL[e.kind].replace(/^\S+\s/, '');
  // Summary: "Weekdays at 07:30 · next in 9 h 12 min"
  const al = tmRead();
  const next = tmNextRun(al);
  const start = e.kind === 'wake' && e.sunrise ? ` (sunrise from ${tmHHMM({ hour: Math.floor(((al.hour * 60 + al.minute - e.sunrise) + 1440) % 1440 / 60), minute: ((al.hour * 60 + al.minute - e.sunrise) + 1440) % 60 })})` : '';
  document.getElementById('tm-summary').textContent = next ? `${tmRepeatLabel(al)} at ${tmHHMM(al)}${start} · next ${tmUntil(next)}` : 'Pick at least one day';
}

function openAlarmEditor(id, quickKind) {
  const al = id ? (currentState.alarms || []).find((a) => a.id === id) : null;
  const kind = al ? tmKindOf(al) : quickKind || 'wake';
  const defaults = { wake: [7, 0], start: [18, 0], winddown: [22, 30], off: [23, 30] }[kind];
  const src = al || { hour: defaults[0], minute: defaults[1], repeat: kind === 'wake' ? 'weekdays' : 'daily', effect: '', message: '' };
  tmEdit = {
    id: al ? al.id : null, kind,
    days: new Set(src.repeat === 'once' ? [] : tmDaysOf(src)),
    repeatHourly: src.repeat === 'hourly',
    sunrise: al?.prealarm?.enabled ? al.prealarm.preMinutes || 15 : (al ? 0 : 15),
    wd: al?.prealarm?.wdMinutes || 15,
    radio: al?.radio?.action || 'none', station: al?.radio?.station || null, output: al?.radio?.output || '',
  };
  tmFillStations();
  tmFillOutputs();
  document.getElementById('tm-title').textContent = al ? 'Edit timer' : 'New timer';
  document.getElementById('tm-time').value = tmHHMM(src);
  document.getElementById('tm-name').value = al?.name || '';
  document.getElementById('tm-message').value = src.message || '';
  document.getElementById('tm-giant-sun').checked = !!al?.prealarm?.giantSun;
  document.getElementById('tm-wd-effect').checked = al ? !!al.prealarm?.wdUseEffect : true;
  tmFillShow(document.getElementById('tm-show'), src);
  document.getElementById('tm-delete').hidden = !al;
  document.getElementById('alarm-modal').hidden = false;
  tmSync();
}

function closeAlarmEditor() {
  document.getElementById('alarm-modal').hidden = true;
  tmEdit = null;
}

// The editor's current values as a stored alarm object.
function tmRead() {
  const e = tmEdit;
  const [hh, mm] = (document.getElementById('tm-time').value || '07:00').split(':').map((n) => parseInt(n, 10) || 0);
  const show = document.getElementById('tm-show').value;
  const isScene = show.startsWith('scene:');
  const rep = e.repeatHourly ? { repeat: 'hourly', days: [] } : tmRepeatFor(e.days);
  const old = e.id ? (currentState.alarms || []).find((a) => a.id === e.id) : null;
  const usesShow = e.kind === 'wake' || e.kind === 'start';
  return {
    kind: e.kind,
    radio: { action: e.radio, station: e.radio === 'start' ? e.station : null, output: e.radio === 'start' ? e.output || '' : '' },
    name: document.getElementById('tm-name').value.trim(),
    enabled: true, // saving a timer switches it on
    hour: Math.min(23, Math.max(0, hh)), minute: Math.min(59, Math.max(0, mm)),
    repeat: rep.repeat, days: rep.days,
    triggerType: e.kind === 'off' ? 'off' : usesShow && isScene ? 'scene' : 'effect',
    scene: usesShow && isScene ? show.slice(6) : '',
    effect: usesShow && show.startsWith('effect:') ? show.slice(7) : '',
    overlayKeys: old?.overlayKeys || [],
    message: usesShow ? document.getElementById('tm-message').value.trim() : '',
    prealarm: {
      enabled: (e.kind === 'wake' || e.kind === 'start') && e.sunrise > 0,
      preMinutes: e.sunrise || 15,
      startBright: old?.prealarm?.startBright || 5,
      giantSun: (e.kind === 'wake' || e.kind === 'start') && document.getElementById('tm-giant-sun').checked,
      windDown: e.kind === 'winddown',
      wdMinutes: e.wd,
      wdUseEffect: e.kind === 'winddown' && document.getElementById('tm-wd-effect').checked,
      wdEffectKey: '', // '' = whatever is showing when it starts
      wdOverlayKeys: [],
    },
  };
}

function wireAlarmModal() {
  const modal = document.getElementById('alarm-modal');
  if (!modal) return;
  document.querySelectorAll('.tm-kind').forEach((b) => b.addEventListener('click', () => { tmEdit.kind = b.dataset.kind; tmSync(); }));
  document.querySelectorAll('#tm-sunrise button').forEach((b) => b.addEventListener('click', () => { tmEdit.sunrise = +b.dataset.v; tmSync(); }));
  document.querySelectorAll('#tm-wd button').forEach((b) => b.addEventListener('click', () => { tmEdit.wd = +b.dataset.v; tmSync(); }));
  document.getElementById('tm-wd-custom')?.addEventListener('input', (ev) => { const n = Math.round(Number(ev.target.value)); if (n >= 1 && n <= 180) { tmEdit.wd = n; tmSync(); } });
  document.getElementById('tm-sun-custom')?.addEventListener('input', (ev) => { const n = Math.round(Number(ev.target.value)); if (n >= 1 && n <= 120) { tmEdit.sunrise = n; tmSync(); } });
  document.querySelectorAll('#tm-radio button').forEach((b) => b.addEventListener('click', () => { tmEdit.radio = b.dataset.ra; tmFillStations(); tmSync(); }));
  document.getElementById('tm-output').addEventListener('change', (e) => { tmEdit.output = e.target.value; });
  document.getElementById('tm-station').addEventListener('change', (e) => { const l = e.target._list || []; tmEdit.station = l[Number(e.target.value)] || null; if (tmEdit.station) delete tmEdit.station.nowPlaying; });
  document.querySelectorAll('#tm-repeat button').forEach((b) => b.addEventListener('click', () => {
    tmEdit.repeatHourly = false;
    tmEdit.days = new Set(TM_REPEAT_DAYS[b.dataset.r]);
    tmSync();
  }));
  document.querySelectorAll('#tm-days button').forEach((b) => b.addEventListener('click', () => {
    tmEdit.repeatHourly = false;
    const d = +b.dataset.d;
    if (tmEdit.days.has(d)) tmEdit.days.delete(d); else tmEdit.days.add(d);
    tmSync();
  }));
  document.getElementById('tm-time').addEventListener('input', tmSync);
  document.getElementById('tm-show').addEventListener('change', tmSync);
  document.getElementById('tm-close').addEventListener('click', closeAlarmEditor);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeAlarmEditor(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeAlarmEditor(); });
  document.getElementById('tm-delete').addEventListener('click', () => {
    if (tmEdit?.id && confirm('Delete this timer?')) { send({ cmd: 'deleteAlarm', id: tmEdit.id }); cxToast('Timer deleted'); closeAlarmEditor(); }
  });
  document.getElementById('tm-save').addEventListener('click', () => {
    const alarm = tmRead();
    if (tmEdit.id) send({ cmd: 'updateAlarm', id: tmEdit.id, alarm });
    else send({ cmd: 'addAlarm', alarm });
    const next = tmNextRun(alarm);
    cxToast(`Timer saved · ${next ? 'next ' + tmUntil(next) : 'runs once'}`);
    closeAlarmEditor();
  });
}

// ---------------------------------------------------------------------
// Auto show (#auto-section): day plan, match the weather, celebrations.
// Settings live in prefs on the Pi (src/prefs.js, src/autoShow.js); every
// change sends the whole part with {cmd:'setAutoShow'}.
const AS_PARTS = [['morning', '🌅 Morning'], ['day', '☀ Day'], ['evening', '🌆 Evening'], ['night', '🌙 Night']];
const AS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function asPrefs() {
  const p = currentState.prefs || {};
  return {
    dayPlan: p.dayPlan || { on: false, starts: { morning: 6, day: 10, evening: 18, night: 23 }, effects: { morning: [], day: [], evening: [], night: [] } },
    weatherMode: p.weatherMode || { on: false },
    celebrations: p.celebrations || { newYear: true, dates: [] },
  };
}
function asSend(part, value) { send({ cmd: 'setAutoShow', [part]: value }); }
function cxRenderAutoShow() {
  const host = document.getElementById('auto-show-ui');
  if (!host) return;
  const P = asPrefs(), st = currentState.autoStatus || {};
  const key = JSON.stringify([P, st, Object.keys(effectNames || {}).length]);
  if (host.dataset.key === key || host.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  host.dataset.key = key;
  const names = Object.entries(effectNames || {}).filter(([k]) => !['custom_cube', 'easter_egg', 'cam', 'screen', 'video'].includes(k)).sort((a, b) => a[1].localeCompare(b[1]));
  const hourOpts = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === sel ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
  const sw = (id, on) => `<button type="button" class="cx-switch${on ? ' on' : ''}" id="${id}" aria-label="On or off"></button>`;
  const dp = P.dayPlan;
  let html = `<div class="as-block"><div class="as-head"><b>Day plan<small>Different effects for each part of the day.${st.part ? ' Now: ' + st.part + '.' : ''}</small></b>${sw('as-dp-on', dp.on)}</div>`;
  if (dp.on) {
    for (const [part, label] of AS_PARTS) {
      const list = dp.effects[part] || [];
      const br = dp.brightness ? dp.brightness[part] : null;
      const brOpts = [['', 'Keep'], ['0.05', '5%'], ['0.1', '10%'], ['0.25', '25%'], ['0.5', '50%'], ['0.75', '75%'], ['1', '100%']]
        .map(([v, t]) => `<option value="${v}"${(br === null || br === undefined ? '' : String(br)) === v ? ' selected' : ''}>${t}</option>`).join('');
      html += `<div class="as-part" data-part="${part}"><div class="as-part-top"><span style="flex:1">${label}</span>from <select class="as-start" aria-label="${label} starts at">${hourOpts(dp.starts[part])}</select></div>
        <div class="as-part-top"><span style="flex:1">☀ Brightness</span><select class="as-bright" aria-label="${label} brightness">${brOpts}</select></div>
        <div class="as-chips">${list.map((k) => `<span class="as-chip">${escHtml(effectNames[k] || k)}<button type="button" data-rm="${k}" aria-label="Remove">✕</button></span>`).join('') || '<span class="ui-note" style="margin:0">Your favourites</span>'}</div>
        <select class="as-add" aria-label="Add an effect to ${label}"><option value="">+ Add effect…</option>${names.map(([k, v]) => `<option value="${k}">${escHtml(v)}</option>`).join('')}</select></div>`;
    }
    html += '<div class="ui-note" style="margin:0">With two or more effects in a part, turn on the playlist (Play tab) to cycle through them.</div>';
  }
  html += '</div>';
  const w = st.weather || {};
  html += `<div class="as-block"><div class="as-head"><b>Match the weather<small>Thunder, rain, snow, fog, clouds or a clear night pick a matching effect. Uses the town set in the Weather effect.</small></b>${sw('as-wx-on', P.weatherMode.on)}</div>`;
  if (P.weatherMode.on) html += `<div class="as-status">${w.error ? '⚠ ' + escHtml(w.error) : w.words ? `Now: ${escHtml(w.words)} in ${escHtml(w.place || '')} → ${escHtml(effectNames[w.effect] || w.effect)}` : 'Checking the weather…'}</div>`;
  html += '</div>';
  const cel = P.celebrations;
  html += `<div class="as-block"><div class="as-head"><b>Celebrations<small>Fireworks with your message for 15 minutes, then back to what was on.${st.celebration ? ' Now: ' + escHtml(st.celebration) : ''}</small></b></div>
    <div class="as-head"><span style="font-size:13px;color:#eef2ff">🎆 New Year at midnight</span>${sw('as-ny-on', cel.newYear)}</div>`;
  for (let i = 0; i < cel.dates.length; i++) {
    const d = cel.dates[i];
    html += `<div class="as-date"><span>${d.day} ${AS_MONTHS[d.month - 1]} · ${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')} · ${escHtml(d.text || 'Fireworks')}</span><button type="button" data-delcel="${i}">Remove</button></div>`;
  }
  html += `<div class="as-row"><input type="date" id="as-cel-date" aria-label="Date"><input type="time" id="as-cel-time" value="08:00" aria-label="Time"></div>
    <div class="as-row"><input type="text" id="as-cel-text" maxlength="24" placeholder="HAPPY BIRTHDAY SAM" aria-label="Message"><button type="button" class="ui-btn-small" id="as-cel-add">Add</button></div></div>`;
  host.innerHTML = html;
  // Wiring.
  host.querySelector('#as-dp-on').addEventListener('click', () => asSend('dayPlan', { ...dp, on: !dp.on }));
  host.querySelectorAll('.as-part').forEach((row) => {
    const part = row.dataset.part;
    row.querySelector('.as-start').addEventListener('change', (e) => asSend('dayPlan', { ...dp, starts: { ...dp.starts, [part]: Number(e.target.value) } }));
    row.querySelector('.as-bright').addEventListener('change', (e) => asSend('dayPlan', { ...dp, brightness: { ...(dp.brightness || {}), [part]: e.target.value === '' ? null : Number(e.target.value) } }));
    row.querySelector('.as-add').addEventListener('change', (e) => {
      const k = e.target.value; if (!k) return;
      const list = (dp.effects[part] || []).filter((x) => x !== k).concat(k);
      asSend('dayPlan', { ...dp, effects: { ...dp.effects, [part]: list } });
    });
    row.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => asSend('dayPlan', { ...dp, effects: { ...dp.effects, [part]: (dp.effects[part] || []).filter((x) => x !== b.dataset.rm) } })));
  });
  host.querySelector('#as-wx-on').addEventListener('click', () => asSend('weatherMode', { on: !P.weatherMode.on }));
  host.querySelector('#as-ny-on').addEventListener('click', () => asSend('celebrations', { ...cel, newYear: !cel.newYear }));
  host.querySelectorAll('[data-delcel]').forEach((b) => b.addEventListener('click', () => asSend('celebrations', { ...cel, dates: cel.dates.filter((_, i) => i !== Number(b.dataset.delcel)) })));
  host.querySelector('#as-cel-add').addEventListener('click', () => {
    const dv = host.querySelector('#as-cel-date').value, tv = host.querySelector('#as-cel-time').value || '08:00', text = host.querySelector('#as-cel-text').value.trim().toUpperCase();
    if (!dv) { cxToast('Pick a date first'); return; }
    const [, mo, da] = dv.split('-').map(Number), [hh, mi] = tv.split(':').map(Number);
    asSend('celebrations', { ...cel, dates: cel.dates.concat({ month: mo, day: da, hour: hh, minute: mi, text }) });
    cxToast('Celebration added · every year on ' + da + ' ' + AS_MONTHS[mo - 1]);
  });
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

// Sidebar menu: the collapse button and floating "show sidebar" button on
// desktop (#sidebar.hidden), and the ☰ toggle with overlay on narrow screens
// (#sidebar.open). Always starts open, whatever the viewport width.
let menuOpen = true;
function updateSidebarOverlay() {
  const overlay = document.getElementById('sidebar-overlay');
  if (!overlay) return;
  const isSmall = window.innerWidth <= 768;
  overlay.style.display = (isSmall && menuOpen) ? 'block' : 'none';
}
function updateMenuToggleButton() {
  const sidebar = document.getElementById('sidebar');
  const menuToggle = document.getElementById('menu-toggle');
  if (!sidebar || !menuToggle) return;
  const isSmall = window.innerWidth <= 768;
  menuToggle.classList.toggle('show', isSmall);
  const openBtn = document.getElementById('sidebar-open-btn');
  if (isSmall) {
    sidebar.classList.toggle('open', menuOpen);
    // #menu-toggle lives INSIDE #sidebar, so it slides off-screen along
    // with it once closed (translateX(-100%)) - there is no way to reach
    // it again from a closed sidebar. #sidebar-open-btn is `position:
    // fixed` OUTSIDE #sidebar (already the desktop mechanism for the same
    // problem: reopening a hidden sidebar) - reused here for mobile too,
    // shown only while the sidebar is actually closed so it doesn't
    // overlap #menu-toggle while open. A real report ("the open button
    // has now disappeared... make sure when the sidebar is closed, the
    // cube is visible under it") traced to exactly this gap.
    if (openBtn) openBtn.classList.toggle('show', !menuOpen);
  } else {
    sidebar.classList.remove('open');
    sidebar.classList.toggle('hidden', !menuOpen);
    if (openBtn) openBtn.classList.toggle('show', !menuOpen);
  }
  menuToggle.textContent = menuOpen ? '✕' : '☰';
  updateSidebarOverlay();
}
function toggleMenu() {
  menuOpen = !menuOpen;
  updateMenuToggleButton();
  updateSidebarOverlay();
  // resizeRenderer() (this file's equivalent of ui.js's resize()) after
  // the CSS width/transform transition finishes, so the 3D preview/2D
  // canvas immediately fills the space the sidebar freed up or reclaimed
  // instead of staying sized for the old layout until the next unrelated
  // resize.
  setTimeout(resizeRenderer, 550);
}
// Ported verbatim (behavior, not code shape) from ui.js's wireForceUpdate()
// - a real report ("GitHub still says 0.1.0" after a fresh deploy) traced
// to browser/CDN caching outliving a plain reload, same class of problem
// the original app's version tap already solved. clears the Cache
// Storage API and unregisters any service workers (pi-native registers
// neither itself, but a stale one from visiting this exact URL under the
// old retired ESP32-architecture app - which DID use both - could still be
// sitting in the browser), then reloads with a cache-busting query param
// (location.reload() alone doesn't reliably bypass HTTP caching in modern
// browsers - the old location.reload(true) "force" argument is a no-op
// today).
function wireVersionDisplay() {
  const el = document.getElementById('app-version');
  if (!el) return;
  el.textContent = 'v' + APP_VERSION;
  el.style.cursor = 'pointer';
  el.title = 'Tap to force update';
  let busy = false;
  function forceUpdate(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (busy) return;
    busy = true;
    el.textContent = 'Clearing…';
    Promise.resolve().then(async () => {
      try {
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if (navigator.serviceWorker) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch (err) { /* ignore, still reload */ }
      location.href = location.pathname + '?nocache=' + Date.now();
    });
  }
  el.addEventListener('touchend', forceUpdate, { passive: false });
  el.addEventListener('click', forceUpdate);
}

function wireSidebarMenu() {
  const sidebar = document.getElementById('sidebar');
  const menuToggle = document.getElementById('menu-toggle');
  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  const openBtn = document.getElementById('sidebar-open-btn');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  if (menuToggle) menuToggle.addEventListener('click', toggleMenu);
  if (collapseBtn) collapseBtn.addEventListener('click', () => { if (menuOpen) toggleMenu(); });
  if (openBtn) openBtn.addEventListener('click', () => { if (!menuOpen) toggleMenu(); });
  if (overlay) overlay.addEventListener('click', () => { if (menuOpen) toggleMenu(); });
  window.addEventListener('resize', updateMenuToggleButton);
  updateMenuToggleButton();
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
  // Everything that used to be greyed out here (ESP32 firmware update,
  // Custom Faces drawing, Playlist, the radio/spectrum overlays) has been
  // removed from the page rather than shown disabled. Kept as the single
  // place to grey out anything that's temporarily unavailable.
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
  const pairedStatusEl = document.querySelector('.bt-paired-status-el');
  const pairedListEl = document.querySelector('.bt-paired-list-el');
  const discoverableBtn = document.querySelector('.bt-discoverable-btn-el');
  const routeBtn = document.querySelector('.bt-route-phone-btn-el');
  const phoneStatusEl = document.querySelector('.bt-phone-status-el');

  if (scanBtn) scanBtn.addEventListener('click', () => { if (statusEl) statusEl.textContent = 'Scanning (~6s)...'; send({ cmd: 'btScan' }); });
  if (refreshBtn) refreshBtn.addEventListener('click', () => { if (pairedStatusEl) pairedStatusEl.textContent = 'Checking paired devices...'; send({ cmd: 'btStatus' }); });
  if (discoverableBtn) discoverableBtn.addEventListener('click', () => { if (phoneStatusEl) phoneStatusEl.textContent = 'Opening pairing window (~120s)...'; send({ cmd: 'btDiscoverable' }); });
  if (routeBtn) routeBtn.addEventListener('click', () => { if (phoneStatusEl) phoneStatusEl.textContent = 'Routing phone audio...'; send({ cmd: 'btRoutePhoneAudio' }); });

  window._btUi = { statusEl, listEl, pairedStatusEl, pairedListEl, phoneStatusEl };

  // Keep the connected/output status dots live without a manual refresh
  // click - a real request ("need an indication that the paired speaker
  // is still connected and working"), since a speaker can silently drop
  // its Bluetooth link or lose default-output status at any time, not
  // just right after you clicked something. Every 15s rather than
  // something snappier - each check spawns a bluetoothctl process per
  // paired device (see listPaired()'s comment), not free enough to poll
  // aggressively for a status dot's sake. Only touches the paired-devices
  // section (see handleBtResult) - a real report that this used to also
  // stomp an in-progress scan's results ("finds devices then refreshes to
  // 0 then finds random devices") back when both shared one list element.
  send({ cmd: 'btStatus' });
  setInterval(() => send({ cmd: 'btStatus' }), 15000);
}

// Scan results (btScanResult) and paired devices (btStatusResult) now
// render into COMPLETELY SEPARATE elements - see index.html's comment on
// .bt-paired-list-el for the bug this fixes (the two used to share one
// list, so the 15s background paired-status poll kept clobbering whatever
// scan results were on screen and vice versa).
function renderBtScanResults(devices, statusEl, listEl) {
  if (statusEl) statusEl.textContent = `${devices.length} device(s) found.`;
  if (!listEl) return;
  listEl.textContent = '';
  // Strongest signal first - a real report ("I can't tell which one is my
  // speaker" once several devices came back MAC-only even after active
  // name resolution): RSSI (closer to 0 = physically closer) is the
  // practical way to guess which device is actually sitting next to the
  // Pi versus a neighbor's device further away.
  const sorted = [...devices].sort((a, b) => (b.rssi ?? -Infinity) - (a.rssi ?? -Infinity));
  for (const d of sorted) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 0;font-size:11px;';
    // Built via createElement/textContent (not innerHTML) - a device name
    // comes from whatever a nearby Bluetooth device chooses to broadcast,
    // never trusted as HTML.
    const nameSpan = document.createElement('span');
    nameSpan.style.flex = '1';
    nameSpan.textContent = d.name;
    nameSpan.title = d.mac; // MAC dropped from the visible row, kept as a hover tooltip
    const pairBtn = document.createElement('button');
    pairBtn.textContent = 'Pair';
    pairBtn.style.cssText = 'padding:3px 8px;background:rgba(80,120,255,0.15);border:1px solid rgba(80,120,255,0.4);color:#7aadff;border-radius:4px;cursor:pointer;font-size:11px;';
    pairBtn.onclick = () => { if (statusEl) statusEl.textContent = 'Pairing with ' + d.name + '...'; send({ cmd: 'btPair', mac: d.mac }); };
    row.append(pairBtn, nameSpan);
    if (typeof d.rssi === 'number') {
      const rssiSpan = document.createElement('span');
      // Rough near/mid/far color coding - a real speaker sitting right
      // next to the Pi typically reads -40 to -60, a device a room or two
      // away -70 to -90+.
      const color = d.rssi >= -60 ? '#6e8' : d.rssi >= -80 ? '#dd6' : '#f88';
      rssiSpan.style.cssText = `color:${color};font-family:monospace;font-size:11px;min-width:34px;text-align:right;`;
      rssiSpan.textContent = d.rssi + ' dBm';
      row.appendChild(rssiSpan);
    }
    listEl.appendChild(row);
  }
}

function renderBtPairedList(devices, statusEl, listEl) {
  if (statusEl) statusEl.textContent = devices.length ? `${devices.length} paired.` : 'No paired devices yet.';
  if (!listEl) return;
  listEl.textContent = '';
  for (const d of devices) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 0;font-size:11px;';
    const statusDot = document.createElement('span');
    statusDot.style.cssText = 'width:8px;height:8px;border-radius:50%;flex-shrink:0;';
    if (d.connected && d.isDefaultOutput) { statusDot.style.background = '#6e8'; statusDot.title = 'Connected - this is the current audio output'; }
    else if (d.connected) { statusDot.style.background = '#dd6'; statusDot.title = 'Connected, but not the current audio output'; }
    else { statusDot.style.background = '#f88'; statusDot.title = 'Not connected'; }
    const nameSpan = document.createElement('span');
    nameSpan.style.flex = '1';
    nameSpan.textContent = d.name;
    nameSpan.title = d.mac;
    // A real request: "an option to pass the audio to the BT device, like
    // the audio-output picker on desktop does" - lets you re-select which
    // ALREADY-PAIRED device gets the Pi's audio at any time, not just
    // automatically at the moment you first pair it.
    const outputBtn = document.createElement('button');
    outputBtn.textContent = d.isDefaultOutput ? 'Output ✓' : 'Set as Output';
    outputBtn.disabled = !!d.isDefaultOutput;
    outputBtn.style.cssText = 'padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;' +
      (d.isDefaultOutput
        ? 'background:rgba(80,220,120,0.15);border:1px solid rgba(80,220,120,0.4);color:#6e8;cursor:default;'
        : 'background:rgba(80,120,255,0.15);border:1px solid rgba(80,120,255,0.4);color:#7aadff;');
    outputBtn.onclick = () => { if (statusEl) statusEl.textContent = 'Setting ' + d.name + ' as output...'; send({ cmd: 'btSetOutput', mac: d.mac }); };
    // A real report: "why does it think I have paired 5 devices?" - each
    // pairing attempt (including test/debugging ones) creates a real,
    // persistent BlueZ pairing with no expiry - this lets a stale one be
    // removed from the control page instead of only via SSH.
    const forgetBtn = document.createElement('button');
    forgetBtn.textContent = '✕';
    forgetBtn.title = 'Forget this device';
    forgetBtn.style.cssText = 'padding:3px 7px;border-radius:4px;cursor:pointer;font-size:11px;background:rgba(255,80,80,0.08);border:1px solid rgba(255,80,80,0.2);color:#f88;';
    forgetBtn.onclick = () => { if (statusEl) statusEl.textContent = 'Forgetting ' + d.name + '...'; send({ cmd: 'btForget', mac: d.mac }); };
    row.append(statusDot, nameSpan, outputBtn, forgetBtn);
    listEl.appendChild(row);
  }
}

function handleBtResult(msg) {
  const { statusEl, listEl, pairedStatusEl, pairedListEl, phoneStatusEl } = window._btUi || {};
  if (!msg.ok) {
    // A scan/status/output-set failure only touches the section it came
    // from, not the other one - see the module comment on why these are
    // now fully separate.
    const target = msg.cmd === 'btScanResult' ? statusEl : pairedStatusEl;
    if (target) target.textContent = 'Error: ' + (msg.error || 'unknown');
    return;
  }
  if (msg.cmd === 'btScanResult') {
    renderBtScanResults(msg.devices, statusEl, listEl);
  } else if (msg.cmd === 'drawListResult') {
    renderDrawGallery(msg.list);
  } else if (msg.cmd === 'updateResult') {
    const log = document.getElementById('update-log'); if (log) { log.hidden = false; log.textContent = msg.log || msg.error || ''; }
    if (msg.updated) { document.getElementById('update-status').textContent = '✅ Updated - restarting. This page reloads in 20 s.'; setTimeout(() => location.reload(), 20000); }
    else document.getElementById('update-status').textContent = '⚠ The update did not finish - see the details below.';
  } else if (msg.cmd === 'btReconnectResult') {
    const b = document.getElementById('spk-reconnect-btn'); if (b) { b.disabled = false; b.textContent = 'Reconnect'; }
    cxToast(msg.set ? '🔊 Speaker connected' : '⚠ Could not connect the speaker - is it switched on?');
    send({ cmd: 'btStatus' });
  } else if (msg.cmd === 'btRangeResult') {
    const note = document.getElementById('bt-range-note');
    if (note) note.textContent = msg.ok === false ? '⚠ ' + (msg.error || 'Could not change it') : msg.set ? (msg.range === 'long' ? '📶 Long range on.' : '🎵 Normal - best sound.') : (msg.log || '');
    if (/no choice of codec/.test(msg.log || '') && note) note.textContent = 'Saved - but this speaker or Pi offers only one codec, so there is nothing to switch.';
  } else if (msg.cmd === 'btStatusResult') {
    document.querySelectorAll('#bt-range button').forEach((b) => b.classList.toggle('on', b.dataset.range === (msg.range || 'normal')));
    renderSpeakerWarning(msg.devices, msg.lastSpeakerMac);
    btPairedCache = msg.devices || []; // also the timer editor's sound-output list
    renderBtPairedList(msg.devices, pairedStatusEl, pairedListEl);
  } else if (msg.cmd === 'btPairResult') {
    // A real report: "says it's pairing but nothing ever happens" - this
    // case was never handled at all, so the "Pairing with X..." text set
    // by the Pair button's click handler just sat there forever regardless
    // of whether pairing actually succeeded or failed.
    if (statusEl) statusEl.textContent = msg.paired ? 'Paired.' : 'Pairing failed - see server log.';
    // Real diagnostic aid: pairDevice() can report "paired" (a beep, a
    // live connection) while the device still never shows up in the
    // paired-devices list, because bluetoothctl's own Connected/Paired
    // states can genuinely diverge for some devices - the full raw
    // bluetoothctl transcript is the only way to see why without SSHing
    // into the Pi. Logged to the browser console (not the visible UI, to
    // avoid dumping a wall of text into the sidebar) - open DevTools ->
    // Console after a Pair click to see exactly what bluetoothctl said.
    console.log('[bluetooth] pairDevice raw log:\n' + msg.log);
    // Refresh the (separate) paired-devices list so a newly-paired device
    // shows up without a manual refresh click.
    send({ cmd: 'btStatus' });
  } else if (msg.cmd === 'btSetOutputResult') {
    if (pairedStatusEl) pairedStatusEl.textContent = msg.set ? 'Output updated.' : 'Could not set output - see server log.';
    send({ cmd: 'btStatus' });
  } else if (msg.cmd === 'btForgetResult') {
    if (pairedStatusEl) pairedStatusEl.textContent = msg.forgot ? 'Forgotten.' : 'Could not forget device - see server log.';
    send({ cmd: 'btStatus' });
  } else if (phoneStatusEl && (msg.cmd === 'btDiscoverableResult' || msg.cmd === 'btRoutePhoneAudioResult')) {
    phoneStatusEl.textContent = 'OK';
  }
}

// ---------------------------------------------------------------------
// Video Wall layout editor, drawn in #wall-preview with live per-panel feeds.
// Filled cells are draggable canvases; empty cells are drop/click targets.
// Every change sends the full layout to the server, which is the source of
// truth: the grid re-renders from the next "state" message, so an invalid drag
// snaps back. The toolbar "+" button also switches into wall mode.
// ---------------------------------------------------------------------
// Copy of panelConfig.js's limits (this file can't require it). Any row or
// column up to 6 long is allowed; WALL_MAX_PANELS is the hardware panel cap.
const WALL_COLS = 6, WALL_ROWS = 6, WALL_MAX_PANELS = 6;
let _wallDragFrom = null;
// Single source of truth for wall edit mode: gates candidate outlines, the
// remove "×", and dragging. Only the toolbar button (or Escape/click-outside
// while editing) toggles it; tapping a display must not start editing.
// Candidates show only while editing or dragging, not around every panel.
let _wallEditMode = false;

// Reflects _wallEditMode on the single "Layout" toggle button - a real
// report ("rename to layout with a plus or x icon"): one button showing a
// "+" (enter layout editing) or "✕" (exit it) instead of two separate
// add/exit buttons. Called from rebuildWallPreview() (the one place that
// already runs on every _wallEditMode change) so it never drifts out of
// sync with what's actually showing.
function updateWallLayoutButtonState() {
  const btn = document.getElementById('wall-layout-btn');
  if (!btn) return;
  btn.classList.toggle('editing', _wallEditMode);
  const icon = btn.querySelector('.wall-layout-icon');
  if (icon) icon.textContent = _wallEditMode ? '✕' : '+';
  btn.title = _wallEditMode ? 'Exit layout editing' : 'Edit wall layout';
  const hint = document.getElementById('wall-hint');
  if (hint) {
    const show = _wallEditMode && currentState.panelMode === 'wall';
    hint.classList.toggle('show', show);
    if (show) hint.style.left = (sidebarOverlapPx() + (window.innerWidth - sidebarOverlapPx()) / 2) + 'px';
  }
}

// Turns layout editing off - the explicit "press again to exit" a real
// report asked for, on top of the toolbar button itself already toggling
// it off. Safe to call even when not currently editing.
function exitWallEditMode() {
  if (!_wallEditMode) return;
  _wallEditMode = false;
  _wallDragFrom = null;
  rebuildWallPreview();
}

function wireWallToolbar() {
  const btn = document.getElementById('wall-layout-btn');
  if (!btn) return;
  btn.addEventListener('click', () => toggleWallEditing());
  const modeBtn = document.getElementById('wall-mode-btn');
  if (modeBtn) modeBtn.addEventListener('click', () => { if (!_wallEditMode) toggleWallEditing(); });

  function toggleWallEditing() {
    if (currentState.panelMode !== 'wall') {
      // First-ever click: just switch into wall mode with the single
      // existing panel carried over - no addPanel yet, so the very next
      // rebuildWallPreview() (triggered by the resulting "state" broadcast)
      // has an actual wall layout to compute candidates against. Set
      // BEFORE send(), not after - the sim loopback (and, in principle, a
      // fast-enough real WS round-trip) can deliver the resulting "state"
      // message and call rebuildWallPreview() SYNCHRONOUSLY inside send(),
      // before this function would otherwise get back around to setting
      // the flag - candidates would silently not render on the very first
      // click.
      _wallEditMode = true;
      send({ cmd: 'setPanelConfig', size: currentState.panelSize || 64, mode: 'wall', panels: currentWallPanels() });
      return;
    }
    if (_wallEditMode) { exitWallEditMode(); return; }
    _wallEditMode = true;
    rebuildWallPreview();
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') exitWallEditMode(); });
  document.addEventListener('click', (e) => {
    if (!_wallEditMode) return;
    // composedPath() is captured when the click is dispatched: by the time
    // this document-level listener runs, clicking a "+" has usually already
    // rebuilt the preview (the sim delivers the new state synchronously),
    // detaching the clicked cell - so e.target.closest() found nothing and
    // every add closed the editor, as if you'd clicked outside it.
    const inside = e.composedPath().some((el) => el && (el.id === 'wall-preview' || el.id === 'wall-toolbar' || el.id === 'wall-hint' || el.id === 'wall-mode-btn' || el.id === 'setup-layout-btn'));
    if (inside) return;
    exitWallEditMode();
  });
}

// "💾" dropdown next to the Layout button - save/load/delete a NAMED wall
// panel-grid arrangement (config.panels), separate from Custom Cube's
// per-face effect library (wirePanelEditor() above) - see wsServer.js's
// saveWallLayout/loadWallLayout/deleteWallLayout comment. A real request:
// wiring up an L-shape/star/long-strip layout via the drag editor is
// fiddly to redo from scratch every time you want to switch shapes.
function wireWallLayoutSaveDropdown() {
  const toggle = document.getElementById('wall-layout-save-toggle');
  const dropdown = document.getElementById('wall-layout-save-dropdown');
  const nameInput = document.getElementById('wall-layout-name-input');
  const saveBtn = document.getElementById('wall-layout-save-btn');
  if (!toggle || !dropdown) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!dropdown.classList.contains('open')) return;
    if (e.target.closest('#wall-layout-save-wrap')) return;
    dropdown.classList.remove('open');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dropdown.classList.remove('open'); });

  saveBtn?.addEventListener('click', () => {
    const name = (nameInput?.value || '').trim();
    if (!name) return;
    send({ cmd: 'saveWallLayout', name });
    if (nameInput) nameInput.value = '';
  });
}

function renderWallLayoutList() {
  const list = document.getElementById('wall-layout-list');
  if (!list) return;
  list.textContent = '';
  const layouts = Array.isArray(currentState.wallLayouts) ? currentState.wallLayouts : [];
  if (!layouts.length) {
    const empty = document.createElement('div');
    empty.id = 'wall-layout-empty';
    empty.textContent = 'No saved layouts yet.';
    list.appendChild(empty);
    return;
  }
  // Built via createElement/textContent (not innerHTML), same as
  // syncCustomCubeLibrarySelects() above - layout names are free-text user
  // input, never trusted as HTML.
  layouts.forEach((l, i) => {
    const row = document.createElement('div');
    row.className = 'wall-layout-row';
    const span = document.createElement('span');
    span.textContent = l.name;
    span.title = l.name;
    const loadBtn = document.createElement('button');
    loadBtn.className = 'wl-load-btn';
    loadBtn.textContent = 'LOAD';
    loadBtn.addEventListener('click', () => send({ cmd: 'loadWallLayout', index: i }));
    const delBtn = document.createElement('button');
    delBtn.className = 'wl-del-btn';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => send({ cmd: 'deleteWallLayout', index: i }));
    row.append(span, loadBtn, delBtn);
    list.appendChild(row);
  });
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
// Preview px per panel (including border/gap), sized to fill the room left
// after the sidebar, clamped so a lone display isn't huge and a full grid
// still fits. cols/rows are the bounding box of the cells actually rendered
// (see rebuildWallPreview()), not the WALL_COLS x WALL_ROWS hardware maximum.
function wallCellSize(cols, rows) {
  const buf = 40;
  const availW = window.innerWidth - sidebarOverlapPx() - buf * 2;
  const availH = sheetTopPx() - buf * 2;
  const cell = Math.min(availW / cols, availH / rows);
  // Up to 900px per panel (was 320): a one- or two-panel wall looked tiny
  // in the middle of a large screen.
  return Math.max(60, Math.min(900, Math.floor(cell)));
}

// Whether the WebGL cube preview is actually usable this session - a real
// report ("cube does not show now, 2d does" - Android, cube-size buttons
// leave the preview blank) traced to WebGL context creation itself failing
// on some mobile browsers/devices (weak GPU, power-saving mode, certain
// WebViews), which previously threw out of initScene() and got swallowed
// by the DOMContentLoaded handler's try/catch into a console.error only -
// 2D mode kept working (plain 2D canvas, no WebGL needed) while cube mode
// silently rendered nothing with zero feedback to the user. false once
// WebGL is confirmed unavailable; rebuildScene()'s cube branch checks this
// and shows #webgl-fallback instead of trying to build a Three.js scene.
let webglOK = true;

function initScene() {
  panel2dCanvas = document.getElementById('panel2d-canvas');
  panel2dCanvas.width = PANEL2D_OUT;
  panel2dCanvas.height = PANEL2D_OUT;
  panel2dCtx = panel2dCanvas.getContext('2d');
  wallPreviewEl = document.getElementById('wall-preview');

  const canvas = document.getElementById('c');
  // Retry once with antialias off (a lighter-weight context request some
  // constrained GPUs will grant even when the antialiased one fails)
  // before giving up on WebGL entirely.
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (err) {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    } catch (err2) {
      webglOK = false;
    }
  }
  if (webglOK) {
    // Clamp devicePixelRatio to 2: with a full-viewport canvas, the DPR of 3-4
    // many Android phones report asks for a framebuffer weak GPUs silently fail
    // to allocate, leaving a blank canvas with no error.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Second line of defense for the same report: a context that WAS
    // successfully created can still be lost/fail to render on some mobile
    // GPUs after the fact (no exception at construction time either) -
    // without this, that reads as the exact same silent black screen.
    // Falling back to the existing #webgl-fallback message at least turns
    // it into a legible "use Panel 2D instead" instead of a dead canvas.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      webglOK = false;
      rebuildScene();
    });
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    // No lights: this repo's three.min.js is a custom stripped-down build
    // (see build-tools/three-entry.js) that only exports what cube.js's own
    // InstancedMesh needs, which is unlit (vertex colors, no lighting model)
    // - THREE.AmbientLight etc. simply aren't in the bundle. Not needed here
    // either: the cube preview's per-LED spheres use MeshBasicMaterial,
    // which is self-lit.
  }
  window.addEventListener('resize', resizeRenderer);
  // The sidebar / phone bottom sheet animates open and closed; re-fit the
  // preview once it has settled (measuring mid-animation centred the
  // preview on the whole screen, half-hidden behind the sheet).
  document.getElementById('sidebar')?.addEventListener('transitionend', (e) => { if (e.target.id === 'sidebar') resizeRenderer(); });
  resizeRenderer();
  rebuildScene(); // shows #webgl-fallback instead of a Three.js scene if !webglOK and currently in cube mode
  if (webglOK) { wireCubeDrag(); buildFaceLabels(); animate(); }
}

// ---------------------------------------------------------------------
// Face labels (#face-labels-chk). The stripped three.min.js build has no
// Sprite/CanvasTexture, so each face's center is projected through the
// camera every frame and a plain DOM span is positioned over it.
// ---------------------------------------------------------------------
let faceLabelEls = [];
function buildFaceLabels() {
  if (faceLabelEls.length) return; // already built - initScene() can run more than once? no, but cheap to guard anyway
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap) return;
  faceLabelEls = FACE_NAMES.map((name) => {
    const el = document.createElement('div');
    el.className = 'face-label';
    el.textContent = name.toUpperCase();
    wrap.appendChild(el);
    return el;
  });
}

const _flVec = new THREE.Vector3();
function updateFaceLabels() {
  if (!faceLabelEls.length) return;
  const chk = document.getElementById('face-labels-chk');
  const on = !!(chk && chk.checked) && currentState.panelMode === 'cube' && group;
  if (!on) {
    for (const el of faceLabelEls) el.style.display = 'none';
    return;
  }
  const w = window.innerWidth, h = window.innerHeight;
  for (let face = 0; face < 6; face++) {
    const el = faceLabelEls[face];
    const xf = FACE_XFORM[face];
    // xf.pos is the face's outward unit normal on the 2x2x2 cube (see
    // rebuildScene()'s own comment on that box size) - pushed to 1.35x so
    // the label floats just outside the panel surface instead of
    // overlapping the LEDs.
    _flVec.set(xf.pos[0], xf.pos[1], xf.pos[2]).multiplyScalar(1.35).applyQuaternion(group.quaternion);
    // Only show labels for faces actually turned toward the camera - dot
    // of the (rotated) outward normal with the direction from the face to
    // the camera. Faces pointing away are on the far side of the cube,
    // hidden behind the near faces' spheres/backing panel; without this
    // check their labels would float in front of the wrong face.
    const towardCam = _flVec.dot(camera.position) > 0;
    if (!towardCam) { el.style.display = 'none'; continue; }
    const proj = _flVec.clone().project(camera);
    if (proj.z > 1) { el.style.display = 'none'; continue; } // behind the camera
    el.style.display = 'block';
    el.style.left = ((proj.x * 0.5 + 0.5) * w) + 'px';
    el.style.top = ((-proj.y * 0.5 + 0.5) * h) + 'px';
  }
}

function resizeRenderer() {
  fitPanel2dCanvas();
  rebuildWallPreview(); // no-ops outside wall mode - re-flows wallCellSize() on viewport/sidebar changes
  if (!webglOK) return; // nothing WebGL-dependent left to resize
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Centre the cube in the space beside an open desktop sidebar (same
  // reasoning as fitPanel2dCanvas()): shift the rendered view left by half
  // the sidebar's width, which moves the cube right by that much.
  const left = sidebarOverlapPx();
  const sheetGap = h - sheetTopPx(); // phones: keep the cube above the controls sheet
  if ((left > 0 || sheetGap > 0) && typeof camera.setViewOffset === 'function') camera.setViewOffset(w, h, -left / 2, sheetGap / 2, w, h);
  else if (typeof camera.clearViewOffset === 'function') camera.clearViewOffset();
  camera.updateProjectionMatrix();
  fitCubeCamera(); // no-ops outside cube mode
}

// Moves the camera along its original viewing direction just far enough
// that the whole cube fits the frustum at the current aspect ratio (narrow
// viewports shrink the horizontal FOV). Bounding radius is the corner
// distance of the 2x2x2 cube centered on the origin: sqrt(3).
const CUBE_BOUND_RADIUS = Math.sqrt(3);
const CUBE_CAMERA_DIR = new THREE.Vector3(2.6, 2.0, 2.6).normalize();
function fitCubeCamera() {
  if (!camera || currentState.panelMode !== 'cube') return;
  const vFov = camera.fov * Math.PI / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const vDist = CUBE_BOUND_RADIUS / Math.sin(vFov / 2);
  const hDist = CUBE_BOUND_RADIUS / Math.sin(hFov / 2);
  const dist = Math.max(vDist, hDist) * 1.15; // small margin so the cube isn't touching the screen edge
  const pos = CUBE_CAMERA_DIR.clone().multiplyScalar(dist);
  camera.position.copy(pos);
  camera.lookAt(0, 0, 0);
}

// Matches cube.js's fitPanel2d(): fit the fixed-resolution square canvas
// into the viewport with a margin, via CSS size (the backing resolution
// stays PANEL2D_OUT regardless).
// Width of the desktop sidebar covering the left of the preview area (0
// when it's collapsed, or on phones where the open menu is full-screen).
// Phones: top edge of the controls bottom sheet (the preview centres in
// the space above it); the full window height when it's closed or on a
// desktop layout.
function sheetTopPx() {
  const sb = document.getElementById('sidebar');
  const r = sb ? sb.getBoundingClientRect() : null;
  return r && r.width >= window.innerWidth * 0.9 && r.top > 0 && r.top < window.innerHeight - 4 ? r.top : window.innerHeight;
}

function sidebarOverlapPx() {
  const sb = document.getElementById('sidebar');
  const r = sb ? sb.getBoundingClientRect() : null;
  return r && r.right > 0 && r.width < window.innerWidth * 0.9 ? r.right : 0;
}

function fitPanel2dCanvas() {
  const buf = 20;
  // The preview area is full-window with the sidebar floating over its
  // left edge, so centring on the whole window hid part of the panel under
  // an open desktop sidebar and left a wide empty gap on the right. Fit and
  // centre it in the space to the RIGHT of the sidebar instead. (On phones
  // the open sidebar covers the whole screen, so this only matters on
  // desktop.)
  const left = sidebarOverlapPx();
  const availW = window.innerWidth - left;
  // Keep clear of the floating Layout toolbar in the top-right corner
  // (reserved top and bottom, so the panel stays vertically centred).
  const tb = document.getElementById('wall-toolbar');
  const tbr = tb ? tb.getBoundingClientRect() : null;
  const vReserve = tbr && tbr.height > 0 ? Math.max(buf, tbr.bottom + 8) : buf;
  const availH = sheetTopPx();
  const size = Math.max(64, Math.min(availW - buf * 2, availH - vReserve * 2));
  panel2dCanvas.style.top = (availH / 2) + 'px';
  panel2dCanvas.style.width = size + 'px';
  panel2dCanvas.style.height = size + 'px';
  panel2dCanvas.style.left = (left + availW / 2) + 'px';
}

// No textures here either: same custom-bundle constraint as the missing
// AmbientLight above (see build-tools/three-entry.js) - CanvasTexture etc.
// aren't exported since the real cube.js never uses textures. It instead
// colors each LED via an InstancedMesh's per-instance color, so the cube
// preview does the same thing here: one InstancedMesh per face, one
// sphere instance per pixel (matching cube.js's own SphereGeometry LED
// look), colored directly from the incoming binary frame.
function rebuildScene() {
  const size = currentState.panelSize || 64;
  const mode = currentState.panelMode;
  panel2dCanvas.style.display = mode === '2d' ? 'block' : 'none';
  wallPreviewEl.style.display = mode === 'wall' ? 'block' : 'none';
  document.getElementById('c').style.display = (mode === 'cube' && webglOK) ? 'block' : 'none';
  const fallback = document.getElementById('webgl-fallback');
  if (fallback) fallback.style.display = (mode === 'cube' && !webglOK) ? 'block' : 'none';
  // animate() (which drives updateFaceLabels()) only runs its body in cube
  // mode, so leaving these visible/stale-positioned here would float them
  // over the 2D/wall preview instead of disappearing with the cube.
  if (mode !== 'cube') for (const el of faceLabelEls) el.style.display = 'none';
  if (mode === '2d') { fitPanel2dCanvas(); return; } // drawn straight into panel2dCtx by handleFrame(), no Three.js scene needed
  if (mode === 'wall') { rebuildWallPreview(); return; } // ditto, drawn into per-panel 2D canvases
  if (!webglOK) return; // #webgl-fallback shown above instead - nothing WebGL-dependent below is safe to touch

  if (group) scene.remove(group);
  group = new THREE.Group();
  scene.add(group);
  for (const key in faceCanvases) delete faceCanvases[key];

  const spacing = 2 / size;                    // matches cube.js's SPACING = TOTAL_SPAN/(SIZE-1) scaled to a 2-unit face
  const geom = new THREE.SphereGeometry(spacing * 0.44, 6, 5); // segment counts kept low: up to 6 * SIZE^2 instances
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let face = 0; face < 6; face++) {
    const mesh = new THREE.InstancedMesh(geom, new THREE.MeshBasicMaterial(), size * size);
    // Top (face 4) flips its local row order here rather than in FACE_XFORM:
    // no single X rotation gives Top both the outward normal and v increasing
    // toward the Front edge (core.js faceMap[4][z*SIZE+x], v=z). Flipping v only
    // in the position lookup fixes the direction without touching the normal.
    const vFlip = face === 4;
    for (let v = 0; v < size; v++) {
      const lv = vFlip ? size - 1 - v : v;
      for (let u = 0; u < size; u++) {
        const i = v * size + u;
        dummy.position.set(-1 + spacing * (u + 0.5), -1 + spacing * (lv + 0.5), 0);
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

    // Solid opaque backing panel, positioned just behind this face's LED
    // spheres - ported from the original browser app's cube.js
    // createPanels() (its own module comment: "fills the gaps between
    // LEDs"). Without it there's nothing physically blocking the view
    // between LED dots, so the opposite face's spheres show straight
    // through the gaps - a real report ("I shouldn't be able to see
    // through it") since a real LED panel has an opaque PCB backing, not a
    // transparent one. Same span/offset math as cube.js's version, scaled
    // to this file's normalized -1..1 face coordinate space (HALF=1 here
    // vs. cube.js's HALF constant - same role).
    const panelSpan = 2 + spacing * 1.2; // slightly wider than the LED array
    const panelOffset = spacing * 0.55;  // placed just behind LED sphere centres
    const backing = new THREE.Mesh(
      new THREE.PlaneGeometry(panelSpan, panelSpan),
      new THREE.MeshBasicMaterial({ color: 0x06060e, side: THREE.FrontSide }),
    );
    const HALF = 1;
    backing.position.set(
      xf.pos[0] * (HALF - panelOffset),
      xf.pos[1] * (HALF - panelOffset),
      xf.pos[2] * (HALF - panelOffset),
    );
    backing.rotation.set(xf.rot[0], xf.rot[1], xf.rot[2]);
    group.add(backing);
  }

  // group gets fully recreated on every rebuildScene() (mode/size change),
  // which would otherwise silently reset the user's manual rotation back
  // to identity - _qRot (module-level, survives rebuilds) is the actual
  // source of truth for cube orientation, re-applied here every time.
  group.quaternion.copy(_qRot);
  fitCubeCamera();
}

// ---------------------------------------------------------------------
// Click/touch-and-drag cube rotation - "same look and feel as it was on
// the ESP32 version": ported from cube.js's quaternion-based orbit
// (applyRotation()/tickInertia()), not a simplified from-scratch version.
// Y-then-X axis-angle quaternion composition (avoids gimbal lock a plain
// Euler.x/y increment would hit), momentum that decays after release, and
// disabling the "auto-rotate" checkbox the moment a drag starts - all
// matching the original's behavior. rotateYOnly/gyro/tap-to-snap-a-face
// from cube.js aren't ported (not requested, no auto-rotate-only /
// device-orientation permission UI exists here to hang them off).
// ---------------------------------------------------------------------
const _qRot = new THREE.Quaternion();
const _qDelta = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const DRAG_SENS = 0.007, TOUCH_SENS = 0.009;
const INERTIA_DECAY = 0.88, INERTIA_MIN = 0.0003;
let cubeDragging = false, cubeLastX = 0, cubeLastY = 0, cubeVelX = 0, cubeVelY = 0;

function applyCubeRotation(dx, dy, sens) {
  _qDelta.setFromAxisAngle(_yAxis, dx * sens);
  _qRot.multiplyQuaternions(_qDelta, _qRot);
  _qDelta.setFromAxisAngle(_xAxis, dy * sens);
  _qRot.multiplyQuaternions(_qDelta, _qRot);
  if (group) group.quaternion.copy(_qRot);
}

function wireCubeDrag() {
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap) return;
  const uncheckAutoRotate = () => {
    const c = document.getElementById('auto-rotate-chk');
    if (c) c.checked = false;
  };
  const start = (x, y) => {
    if (currentState.panelMode !== 'cube' || !group) return;
    cubeDragging = true; cubeVelX = 0; cubeVelY = 0; cubeLastX = x; cubeLastY = y;
    uncheckAutoRotate();
  };
  const move = (x, y, sens) => {
    if (!cubeDragging) return;
    const dx = x - cubeLastX, dy = y - cubeLastY;
    cubeLastX = x; cubeLastY = y;
    cubeVelX = dx * 0.015; cubeVelY = dy * 0.015;
    applyCubeRotation(dx, dy, sens);
  };
  const end = () => { cubeDragging = false; };

  wrap.addEventListener('mousedown', (e) => start(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY, DRAG_SENS));
  window.addEventListener('mouseup', end);
  wrap.addEventListener('touchstart', (e) => { if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  wrap.addEventListener('touchmove', (e) => { if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY, TOUCH_SENS); }, { passive: true });
  wrap.addEventListener('touchend', end, { passive: true });
}

let _autoRotateChk;
function animate() {
  requestAnimationFrame(animate);
  if (currentState.panelMode !== 'cube') return; // 2D and wall modes never touch the WebGL renderer
  const autoRotate = _autoRotateChk || (_autoRotateChk = document.getElementById('auto-rotate-chk'));
  if (cubeDragging) {
    // rotation already applied directly in the move handler above
  } else if (Math.abs(cubeVelX) > INERTIA_MIN || Math.abs(cubeVelY) > INERTIA_MIN) {
    applyCubeRotation(cubeVelX * 60, cubeVelY * 60, DRAG_SENS);
    cubeVelX *= INERTIA_DECAY; cubeVelY *= INERTIA_DECAY;
  } else if (group && (!autoRotate || autoRotate.checked)) {
    _qDelta.setFromAxisAngle(_yAxis, 0.003);
    _qRot.multiplyQuaternions(_qDelta, _qRot);
    group.quaternion.copy(_qRot);
  }
  updateFaceLabels();
  renderer.render(scene, camera);
}

const _frameColor = new THREE.Color();

// Ported verbatim (math unchanged) from ui.js's renderPanel2d(): round LED
// dots on black, drawn straight into the 2D canvas - no WebGL involved.
function drawPanel2dFrame(bytes) {
  drawLedGrid(panel2dCtx, bytes, currentState.panelSize, PANEL2D_OUT, true);
  panel2dCtx.strokeStyle = '#99ddff';
  panel2dCtx.lineWidth = 2;
  panel2dCtx.strokeRect(1, 1, PANEL2D_OUT - 2, PANEL2D_OUT - 2);
}

// Fast round-LED rendering shared by the 2D and wall previews. It used to
// call arc()+fill() and build an rgb() string for every LED - 4,096 path
// fills per 64x64 panel per frame (x6 on a wall), the page's main CPU cost
// on phones. Now: write the pixels into a size x size ImageData, scale it
// up with smoothing off (one drawImage), then draw a cached mask that is
// black everywhere except round holes - the same dots-on-black look.
const _ledGrid = { src: null, img: null, size: 0 };
const _ledMasks = new Map(); // `${out}x${size}` -> canvas
function ledMask(out, size) {
  const key = out + 'x' + size;
  let m = _ledMasks.get(key);
  if (m) return m;
  m = document.createElement('canvas');
  m.width = m.height = out;
  const c = m.getContext('2d');
  const cell = out / size, r = cell * 0.44;
  c.fillStyle = '#000';
  c.fillRect(0, 0, out, out);
  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      c.moveTo((u + 0.5) * cell + r, (v + 0.5) * cell);
      c.arc((u + 0.5) * cell, (v + 0.5) * cell, r, 0, Math.PI * 2);
    }
  }
  c.fill();
  _ledMasks.set(key, m);
  return m;
}
function drawLedGrid(ctx, bytes, size, out, flipY) {
  if (_ledGrid.size !== size) {
    _ledGrid.src = document.createElement('canvas');
    _ledGrid.src.width = _ledGrid.src.height = size;
    _ledGrid.img = _ledGrid.src.getContext('2d').createImageData(size, size);
    _ledGrid.size = size;
  }
  const px = _ledGrid.img.data;
  for (let v = 0; v < size; v++) {
    const row = flipY ? size - 1 - v : v;
    for (let u = 0; u < size; u++) {
      const o = 1 + (v * size + u) * 3, d = (row * size + u) * 4;
      px[d] = bytes[o]; px[d + 1] = bytes[o + 1]; px[d + 2] = bytes[o + 2]; px[d + 3] = 255;
    }
  }
  _ledGrid.src.getContext('2d').putImageData(_ledGrid.img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(_ledGrid.src, 0, 0, out, out);
  ctx.drawImage(ledMask(out, size), 0, 0);
}

// One small canvas per placed panel (dots on black, like drawPanel2dFrame()),
// plus dashed drop targets only next to existing panels; the area tracks the
// panels+candidates bounding box. Panel 0 is the primary display and can be
// moved but never removed. wallPanelCanvases is keyed by index into
// currentState.panels, matching the per-panel frame index (handleFrame()).
// The server requires gx/gy within [0,WALL_COLS) x [0,WALL_ROWS), so a drop
// left of/above the primary at (0,0) needs every panel shifted. This returns
// that shift for a candidate, or null if no shift keeps all panels in bounds.
function shiftForCandidate(panels, gx, gy) {
  let shiftX = 0, shiftY = 0;
  if (gx < 0) shiftX = -gx;
  else if (gx >= WALL_COLS) shiftX = (WALL_COLS - 1) - gx;
  if (gy < 0) shiftY = -gy;
  else if (gy >= WALL_ROWS) shiftY = (WALL_ROWS - 1) - gy;
  for (const p of panels) {
    const sx = p.gx + shiftX, sy = p.gy + shiftY;
    if (sx < 0 || sx >= WALL_COLS || sy < 0 || sy >= WALL_ROWS) return null;
  }
  return { shiftX, shiftY };
}

// Applies a candidate's shift to every existing panel, then adds/moves one
// panel into the (already-shifted) target cell - the single code path
// both the "click an empty cell to add here" and "drop a dragged display
// here" handlers below funnel through, so a shifted placement behaves
// identically either way. `movingFrom`: null when adding a brand new
// display, or {gx,gy} (PRE-shift, i.e. as currently stored in
// currentState.panels) when repositioning an already-placed one instead.
function placeAtCandidate(candidate, movingFrom) {
  const { gx, gy, shiftX, shiftY } = candidate;
  const shifted = currentWallPanels()
    .filter((p) => !movingFrom || p.gx !== movingFrom.gx || p.gy !== movingFrom.gy)
    .map((p) => ({ gx: p.gx + shiftX, gy: p.gy + shiftY }));
  shifted.push({ gx: gx + shiftX, gy: gy + shiftY });
  // Deliberately does NOT clear _wallEditMode - a real report: edit mode
  // should stay open across a single add/move so you can place several
  // displays in a row, only closing when the toolbar button (or Escape/
  // click-outside) is pressed again.
  sendWallLayout(shifted);
}

function rebuildWallPreview() {
  updateWallLayoutButtonState();
  wallPreviewEl.innerHTML = '';
  for (const key in wallPanelCanvases) delete wallPanelCanvases[key];
  if (currentState.panelMode !== 'wall') return; // full grid only makes sense once wall mode is actually active - see wireWallToolbar()'s "+"  for how you get there
  const panels = currentState.panels || [];
  const occupied = new Set(panels.map((p) => p.gx + ',' + p.gy));

  // Candidate cells on all 4 sides of every placed panel. gx/gy are raw
  // (possibly negative) coordinates in the current unshifted layout so they
  // render in the right relative position; placing one may shift every panel
  // (see shiftForCandidate()/placeAtCandidate()). Only shown in layout edit
  // mode, otherwise they fill the whole grid once 2+ panels exist.
  const candidates = [];
  if (_wallEditMode) {
    const seenCandidate = new Set();
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const p of panels) {
      for (const [dx, dy] of DIRS) {
        const gx = p.gx + dx, gy = p.gy + dy;
        const key = gx + ',' + gy;
        if (occupied.has(key) || seenCandidate.has(key)) continue;
        seenCandidate.add(key);
        const shift = shiftForCandidate(panels, gx, gy);
        if (!shift) continue; // no room in that direction at all (e.g. both columns already full)
        // Adding is blocked once WALL_MAX_PANELS is already reached
        // (matches the server's own addPanel/setPanelPositions cap) - but
        // repositioning an EXISTING panel via drag doesn't change the
        // total count, so that stays allowed regardless.
        if (panels.length >= WALL_MAX_PANELS && !_wallDragFrom) continue;
        candidates.push({ gx, gy, shiftX: shift.shiftX, shiftY: shift.shiftY });
      }
    }
  }

  const allCells = [
    ...panels.map((p) => ({ ...p, filled: true })),
    // No "default"/suggested candidate anymore - a real report: don't
    // highlight a suggested square, just show every candidate as an equal
    // plain dotted outline.
    ...candidates.map((c) => ({ ...c, filled: false })),
  ];
  const minGx = Math.min(...allCells.map((c) => c.gx)), maxGx = Math.max(...allCells.map((c) => c.gx));
  const minGy = Math.min(...allCells.map((c) => c.gy)), maxGy = Math.max(...allCells.map((c) => c.gy));
  const cols = maxGx - minGx + 1, rows = maxGy - minGy + 1;
  const cellSize = wallCellSize(cols, rows);
  wallPreviewEl.style.width = (cols * cellSize) + 'px';
  wallPreviewEl.style.height = (rows * cellSize) + 'px';
  // Centre in the space beside an open desktop sidebar (see fitPanel2dCanvas()).
  wallPreviewEl.style.left = (sidebarOverlapPx() + (window.innerWidth - sidebarOverlapPx()) / 2) + 'px';
  wallPreviewEl.style.top = (sheetTopPx() / 2) + 'px';

  for (const c of allCells) {
    const { gx, gy, filled, shiftX, shiftY } = c;
    const idx = filled ? panels.findIndex((p) => p.gx === gx && p.gy === gy) : -1;
    const cell = document.createElement('div');
    cell.className = 'wall-cell ' + (filled ? 'filled' : 'empty');
    cell.style.left = ((gx - minGx) * cellSize) + 'px';
    cell.style.top = ((gy - minGy) * cellSize) + 'px';
    cell.style.width = (cellSize - 6) + 'px';
    cell.style.height = (cellSize - 6) + 'px';

    cell.addEventListener('dragover', (e) => { if (!filled) { e.preventDefault(); cell.classList.add('drop-target'); } });
    cell.addEventListener('dragleave', () => cell.classList.remove('drop-target'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('drop-target');
      if (!_wallDragFrom || filled) return; // only drop onto an empty candidate cell
      placeAtCandidate({ gx, gy, shiftX, shiftY }, _wallDragFrom);
      _wallDragFrom = null;
    });

    if (filled) {
      const canvas = document.createElement('canvas');
      canvas.width = PANEL2D_OUT; canvas.height = PANEL2D_OUT; // was 256: at 64x64 that is 4px per LED, too few for the round dots to read as round once scaled up
      canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.position = 'static';
      // Only draggable while layout editing is on - a real report: "don't
      // go to edit mode when tapping on the display. the button must be
      // pressed to go into edit mode" - draggable=false means the browser
      // never starts a drag gesture from this canvas at all outside edit
      // mode, and the mousedown guard below belt-and-suspenders that.
      canvas.draggable = _wallEditMode;
      // mousedown (fires before the native drag gesture actually starts,
      // unlike dragstart) is what shows candidate outlines - rebuilding
      // the WHOLE grid from inside dragstart itself would tear down and
      // recreate the very element mid-drag, risking Chromium canceling
      // the drag outright. By mousedown time nothing has started yet, so
      // the fresh candidate cells + a freshly-bound dragstart listener on
      // the recreated canvas are safely in place before the browser's
      // actual drag gesture begins.
      canvas.addEventListener('mousedown', () => {
        if (!_wallEditMode) return;
        _wallDragFrom = { gx, gy }; rebuildWallPreview();
      });
      canvas.addEventListener('dragstart', () => { _wallDragFrom = { gx, gy }; cell.classList.add('dragging'); });
      canvas.addEventListener('dragend', () => { _wallDragFrom = null; rebuildWallPreview(); });
      cell.appendChild(canvas);
      wallPanelCanvases[idx] = canvas.getContext('2d');

      // Only shown while actively editing (same gating as the candidate
      // outlines above) - a real report: "when I've finished adding
      // displays you need to remove the top right x and the space outline"
      // - both should disappear once you're done, not sit there
      // permanently. index 0 (primary) never gets one regardless.
      if (idx !== 0 && _wallEditMode) {
        const remove = document.createElement('span');
        remove.className = 'wall-remove';
        remove.textContent = '×';
        remove.title = 'Remove this display';
        remove.addEventListener('click', (e) => {
          e.stopPropagation();
          send({ cmd: 'removePanel', gx, gy });
        });
        cell.appendChild(remove);
      }
    } else {
      cell.title = 'Add a display here';
      cell.addEventListener('click', () => placeAtCandidate({ gx, gy, shiftX, shiftY }, null));
    }
    wallPreviewEl.appendChild(cell);
  }
}

// Wall per-panel bytes are plain row-major slices of core.wallBuf
// (encodeWallFrames(), wsServer.js _streamWallFrames(), and the hardware
// driver's _buildWallPanelBuffer() never flip v), so this must NOT flip v
// either, unlike drawPanel2dFrame(). A flip here would join the wrong rows
// at the seams of vertically stacked panels.
function drawWallPanelFrame(ctx, bytes) {
  drawLedGrid(ctx, bytes, currentState.panelSize, PANEL2D_OUT, false);
}

// 2D/wall frames are kept (latest per panel) and drawn once per display
// refresh in animate(), rather than immediately on arrival - a burst of
// frames no longer means a burst of redraws, and nothing is drawn at all
// while the tab is hidden (requestAnimationFrame pauses).
const pendingPanelFrames = new Map();
function flushPanelFrames() {
  if (!pendingPanelFrames.size) return;
  for (const [face, bytes] of pendingPanelFrames) {
    if (currentState.panelMode === '2d') { if (face === 0) drawPanel2dFrame(bytes); }
    else if (currentState.panelMode === 'wall') {
      const ctx = wallPanelCanvases[face]; // "face" byte is a panel index here, not a cube face
      if (ctx) drawWallPanelFrame(ctx, bytes);
    }
  }
  pendingPanelFrames.clear();
}

// Own loop, independent of animate() - that one only starts when WebGL is
// available, and the 2D/wall previews must keep drawing without it.
(function panelFrameLoop() {
  requestAnimationFrame(panelFrameLoop);
  flushPanelFrames();
})();

function handleFrame(buf) {
  if (document.body.classList.contains('cx-preview-off')) return;
  const bytes = new Uint8Array(buf);
  const face = bytes[0];
  cxNoteFrame(face, bytes);
  if (currentState.panelMode === '2d' || currentState.panelMode === 'wall') {
    pendingPanelFrames.set(face, bytes);
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
  try { cxInit(); } catch (e) { console.error('cxInit', e); }
  wireSidebarMenu();
  wireVersionDisplay();
  wirePanelButtons();
  wireSliders();
  wireBluetooth();
  wireWallToolbar();
  wireWallLayoutSaveDropdown();
  wireClearAllButton();
  wireStopSoundButton();
  wireUpdate();
  wireSetupSearch();
  wireDraw();
  wireNote();
  wireIdentifyPanelsButton();
  wireRainPanel();
  wireRadarPanel();
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
  wireEffectFilter();
  wirePinControls();
  wireRestartButtons();
  wireMusicReact();
  wireScenes();
  wireTabs();
  wireDiagnostics();
  labelUnlabelledControls();
  connect();
  try {
    initScene();
  } catch (err) {
    console.error('[app] 3D preview failed to start (controls are unaffected):', err);
  }
  if (window.MULTIDISPLAY_SIM) window.__simLoopback.start();
});

// =====================================================================
// v0.6.183 look: live preview "remote", colour-matched glow, liquid dock,
// live effect tiles, Ask bar, 24-hour timer ring, now-playing card.
// Everything here is presentation - commands go through the same send()
// calls as the rest of the page.
// =====================================================================
const _cxFaces = {}; // cube mode: face -> latest frame bytes, for the hero strip
const _cxFaceCanvases = [];
let _cxHero = null, _cxHeroCtx = null, _cxSample = null;
const _cxC1 = [91, 124, 255], _cxC2 = [180, 91, 255];

function cxNoteFrame(face, bytes) { if (currentState.panelMode === 'cube') _cxFaces[face] = bytes; }

function cxEffectOrder() {
  return [...document.querySelectorAll('#effects-body .effect-btn[data-effect]')]
    .filter((b) => !b.disabled && b.offsetParent !== null).map((b) => b.dataset.effect)
    .filter((k, i, a) => a.indexOf(k) === i);
}
function cxEffectName(key) {
  const b = document.querySelector(`.effect-btn[data-effect="${CSS.escape(key || '')}"]`);
  return b ? b.textContent.replace(/[◈▸▶]/g, '').trim() : (key || '');
}
function cxToast(text) {
  let t = document.getElementById('cx-toast');
  if (!t) { t = document.createElement('div'); t.id = 'cx-toast'; document.body.appendChild(t); }
  t.textContent = text; t.classList.add('on');
  clearTimeout(cxToast._t); cxToast._t = setTimeout(() => t.classList.remove('on'), 1600);
}

// ── Hero: a live copy of the display at the top of the menu, and a remote:
// swipe sideways for the next/previous effect, drag up/down for brightness.
function cxWireHero() {
  _cxHero = document.getElementById('cx-hero-canvas');
  if (!_cxHero) return;
  _cxHeroCtx = _cxHero.getContext('2d');
  _cxSample = document.createElement('canvas'); _cxSample.width = _cxSample.height = 6;
  const hero = document.getElementById('cx-hero');
  const ring = document.getElementById('cx-ring'), arc = document.getElementById('cx-arc'), pct = document.getElementById('cx-pct');
  let sx = null, sy = 0, sb = 1, mode = null, dx = 0;
  hero.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; sb = currentState.brightness ?? 1; mode = null; dx = 0; hero.setPointerCapture(e.pointerId); });
  hero.addEventListener('pointermove', (e) => {
    if (sx == null) return;
    dx = e.clientX - sx; const dy = e.clientY - sy;
    if (!mode && Math.hypot(dx, dy) > 12) mode = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (mode === 'y') {
      const v = Math.max(0.1, Math.min(1.5, sb - dy / 160));
      ring.classList.add('show'); arc.style.strokeDashoffset = String(276 * (1 - v / 1.5)); pct.textContent = Math.round(v / 1.5 * 100) + '%';
      clearTimeout(cxWireHero._t); cxWireHero._t = setTimeout(() => send({ cmd: 'setBrightness', value: v }), 40);
      const sl = document.getElementById('bright-slider'); if (sl) sl.value = v;
    }
    if (mode === 'x') hero.style.setProperty('--swipe', String(Math.max(-1, Math.min(1, dx / 120))));
  });
  const hint = document.getElementById('cx-hero-hint');
  try { if (localStorage.getItem('heroUsed')) hint?.classList.add('gone'); } catch (e) { /* storage unavailable */ }
  const end = () => {
    if (mode) { hint?.classList.add('gone'); try { localStorage.setItem('heroUsed', '1'); } catch (e) { /* storage unavailable */ } }
    if (mode === 'x' && Math.abs(dx) > 60) {
      const order = cxEffectOrder(), i = order.indexOf(currentState.effect);
      const next = order[(i + (dx < 0 ? 1 : -1) + order.length) % order.length];
      if (next) { send({ cmd: 'setEffect', effect: next }); cxToast('▶ ' + cxEffectName(next)); }
    }
    sx = null; ring.classList.remove('show'); hero.style.setProperty('--swipe', '0');
  };
  hero.addEventListener('pointerup', end); hero.addEventListener('pointercancel', end);
  document.getElementById('cx-opts-btn')?.addEventListener('click', (e) => { e.stopPropagation(); cxShowOptions(); });
  document.getElementById('cx-opts-btn')?.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.getElementById('cx-mini-opts')?.addEventListener('click', () => cxShowOptions());
  (function heroLoop() {
    requestAnimationFrame(heroLoop);
    if (heroLoop.n = (heroLoop.n || 0) + 1, heroLoop.n % 2) return; // ~30 fps is plenty
    cxDrawHero();
  })();
}
function cxHeroAspect() {
  if (currentState.panelMode === 'cube') return [4, 1];
  if (currentState.panelMode !== 'wall') return [1, 1];
  const p = currentState.panels || [{ gx: 0, gy: 0 }];
  return [Math.max(1, ...p.map((q) => q.gx + 1)), Math.max(1, ...p.map((q) => q.gy + 1))];
}
function cxDrawHero() {
  const [ac, ar] = cxHeroAspect(), want = Math.round(480 * ar / ac);
  if (_cxHero.width !== 480 || _cxHero.height !== want) { _cxHero.width = 480; _cxHero.height = want; _cxHero.style.aspectRatio = `${ac} / ${ar}`; }
  const c = _cxHeroCtx, W = _cxHero.width, H = _cxHero.height;
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  if (currentState.panelMode === 'cube') {
    const order = [0, 2, 1, 3], size = currentState.panelSize || 64, cell = W / 4;
    order.forEach((f, k) => {
      const bytes = _cxFaces[f]; if (!bytes) return;
      if (!_cxFaceCanvases[k]) { const cv = document.createElement('canvas'); cv.width = cv.height = 160; _cxFaceCanvases[k] = cv; }
      const cv = _cxFaceCanvases[k];
      drawLedGrid(cv.getContext('2d'), bytes, size, 160, true);
      c.drawImage(cv, k * cell + 2, (H - cell) / 2 + 2, cell - 4, cell - 4);
    });
  } else if (currentState.panelMode === '2d') {
    if (panel2dCanvas) { const sz = Math.min(W, H); c.drawImage(panel2dCanvas, (W - sz) / 2, (H - sz) / 2, sz, sz); }
  } else {
    const panels = currentState.panels || [{ gx: 0, gy: 0 }];
    const cols = Math.max(1, ...panels.map((p) => p.gx + 1)), rows = Math.max(1, ...panels.map((p) => p.gy + 1));
    const cell = Math.min(W / cols, H / rows), ox = (W - cell * cols) / 2, oy = (H - cell * rows) / 2;
    panels.forEach((p, i) => {
      const ctx = wallPanelCanvases[i];
      if (ctx) c.drawImage(ctx.canvas, ox + p.gx * cell + 1, oy + p.gy * cell + 1, cell - 2, cell - 2);
    });
  }
  cxColourSync();
}

// ── Colour sync: the menu's glow and accents follow what the panel shows.
function cxColourSync() {
  if ((cxColourSync.n = (cxColourSync.n || 0) + 1) % 4) return;
  const s = _cxSample.getContext('2d', { willReadFrequently: true });
  s.drawImage(_cxHero, 0, 0, 6, 6);
  const d = s.getImageData(0, 0, 6, 6).data;
  let r = 0, g = 0, b = 0, best = -1, br = 0, bg = 0, bb = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]; g += d[i + 1]; b += d[i + 2];
    const sat = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    if (sat > best) { best = sat; br = d[i]; bg = d[i + 1]; bb = d[i + 2]; }
  }
  const n = d.length / 4, lift = (v) => Math.min(255, v * 1.6 + 40);
  // Drift slowly towards the display's colours (a quick snap made the page
  // glow flash with every change in the effect). A dark or grey picture
  // drifts back to the default blue/violet.
  const t1 = best > 40 ? [lift(r / n), lift(g / n), lift(b / n)] : [91, 124, 255];
  const t2 = best > 40 ? [lift(br), lift(bg), lift(bb)] : [180, 91, 255];
  for (let k = 0; k < 3; k++) { _cxC1[k] += (t1[k] - _cxC1[k]) * 0.06; _cxC2[k] += (t2[k] - _cxC2[k]) * 0.06; }
  const root = document.documentElement.style;
  root.setProperty('--cx1', `rgb(${_cxC1.map(Math.round).join(',')})`);
  root.setProperty('--cx2', `rgb(${_cxC2.map(Math.round).join(',')})`);
}

// ── Liquid dock: one gradient blob slides between the four tabs.
function cxMoveBlob() {
  const blob = document.getElementById('cx-blob');
  const on = document.querySelector('#tab-bar [aria-selected="true"]');
  if (blob && on) { blob.style.left = on.offsetLeft + 'px'; blob.style.width = on.offsetWidth + 'px'; }
}

// A still preview of an effect (its thumbnail's middle frame), for the
// favourites strip and scene tiles.
let _cxThumbData = null;
function cxStillThumb(key) {
  const d = _cxThumbData, b64 = d && d.fx[key];
  const cv = document.createElement('canvas'); cv.className = 'cx-mini-thumb';
  if (!b64) { cv.width = cv.height = 1; return cv; }
  const S = d.size, raw = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)), off = Math.floor(d.frames / 2) * S * S * 3;
  cv.width = cv.height = S;
  const img = new ImageData(S, S);
  for (let i = 0; i < S * S; i++) { img.data[i * 4] = raw[off + i * 3]; img.data[i * 4 + 1] = raw[off + i * 3 + 1]; img.data[i * 4 + 2] = raw[off + i * 3 + 2]; img.data[i * 4 + 3] = 255; }
  cv.getContext('2d').putImageData(img, 0, 0);
  return cv;
}

// ── Live tiles: every effect tile plays a tiny loop of itself.
async function cxWireTiles() {
  let data;
  // Versioned URL: a new release never shows previews cached from an older one.
  try { data = await (await fetch('thumbs.json?v=' + APP_VERSION)).json(); } catch (e) { return; }
  _cxThumbData = data; renderScenes(); cxSyncFavs();
  const S = data.size, F = data.frames, tiles = [];
  document.querySelectorAll('#effects-body .effect-btn[data-effect]').forEach((btn) => {
    const b64 = data.fx[btn.dataset.effect];
    if (!b64 || btn.querySelector('.cx-thumb')) return;
    const raw = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const cv = document.createElement('canvas'); cv.width = cv.height = S; cv.className = 'cx-thumb';
    const label = document.createElement('span'); label.className = 'cx-tile-name';
    label.textContent = btn.textContent.replace(/[◈▸]/g, '').trim();
    btn.replaceChildren(cv, label); btn.classList.add('cx-tile');
    cxAddStar(btn);
    tiles.push({ cv, ctx: cv.getContext('2d'), raw, img: new ImageData(S, S), btn });
  });
  let f = 0;
  const vis = new Set();
  const io = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? vis.add(e.target) : vis.delete(e.target))));
  tiles.forEach((t) => io.observe(t.cv));
  const draw = () => {
    for (const t of tiles) {
      if (!vis.has(t.cv) && f > 0) continue;
      const off = (f % F) * S * S * 3, px = t.img.data;
      for (let i = 0; i < S * S; i++) { px[i * 4] = t.raw[off + i * 3]; px[i * 4 + 1] = t.raw[off + i * 3 + 1]; px[i * 4 + 2] = t.raw[off + i * 3 + 2]; px[i * 4 + 3] = 255; }
      t.ctx.putImageData(t.img, 0, 0);
    }
    f++;
  };
  draw();
  setInterval(() => { if (!document.hidden && document.body.dataset.tab === 'play') draw(); }, 125);
}

// Scroll only the menu's own list to an element. (scrollIntoView also
// scrolled the whole page, shifting the sidebar up and leaving a gap below.)
function cxScrollMenuTo(el, where = 'start') {
  const sc = document.getElementById('sidebar-scroll');
  if (!el || !sc) return;
  const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
  sc.scrollTo({ top: where === 'center' ? top - sc.clientHeight / 2 + el.offsetHeight / 2 : top - 6, behavior: 'smooth' });
}

// Jump to the running effect's options (top of Play) and flash them.
// Phones: the menu is a bottom sheet over the preview. Tapping its handle (or
// swiping up/down on the header) switches between half and almost full
// height; opening an effect's Options goes full so the settings fit.
function cxSheetFull(on) {
  const sb = document.getElementById('sidebar');
  if (!sb || !window.matchMedia('(max-width: 768px)').matches) return;
  sb.classList.toggle('cx-full', on === undefined ? !sb.classList.contains('cx-full') : on);
  try { localStorage.setItem('cxSheetFull', sb.classList.contains('cx-full') ? '1' : ''); } catch (e) { /* storage blocked */ }
}
(function cxWireSheet() {
  const hd = document.getElementById('sidebar-header');
  if (!hd) return;
  try { if (localStorage.getItem('cxSheetFull')) cxSheetFull(true); } catch (e) { /* storage blocked */ }
  let y0 = null;
  hd.addEventListener('click', (e) => { if (!e.target.closest('button,a,input')) cxSheetFull(); });
  hd.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  hd.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0; y0 = null;
    if (Math.abs(dy) > 30) { cxSheetFull(dy < 0); e.preventDefault(); }
  });
})();

// ⚙ Options opens the effect options sheet: the running effect's panel is
// shown in a full-height sheet over the menu (‹ Effects closes it, back to
// the same spot in the list; ◀ ▶ step through the effects with the sheet
// still open).
function cxShowOptions() { if (!document.body.classList.contains('guest')) openFxSheet(); }
document.getElementById('guest-pin-btn')?.addEventListener('click', () => answerAuth(false));
// Setup > Control PIN: who has to enter it.
['acc-local', 'acc-guests'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => {
  send({ cmd: 'setAccess', localNoPin: document.getElementById('acc-local').checked, guests: document.getElementById('acc-guests').checked });
}));
// Countdown options.
['cd-target', 'cd-label'].forEach((id) => document.getElementById(id)?.addEventListener('change', (e) => setEffectOption('countdown', id === 'cd-target' ? 'target' : 'label', e.target.value)));
function syncCountdownPanel() {
  const o = currentState.effectOptions?.countdown || {};
  for (const [id, k] of [['cd-target', 'target'], ['cd-label', 'label']]) { const el = document.getElementById(id); if (el && document.activeElement !== el && o[k] !== undefined) el.value = o[k]; }
}
// 🎉 Party mode (Play tab).
document.getElementById('party-open')?.addEventListener('click', () => { document.querySelector('#party-box .party-form').hidden = false; document.querySelector('#party-box .party-idle').hidden = true; document.getElementById('party-text')?.focus(); });
document.getElementById('party-go')?.addEventListener('click', () => {
  send({ cmd: 'startParty', minutes: Number(document.getElementById('party-min').value), text: document.getElementById('party-text').value.trim() });
  cxToast('🎉 Party on!');
});
document.getElementById('party-stop')?.addEventListener('click', () => send({ cmd: 'startParty', minutes: 0 }));
function syncParty() {
  const box = document.getElementById('party-box'); if (!box) return;
  const p = currentState.party, on = !!(p && p.endsAt > Date.now());
  box.querySelector('.party-on').hidden = !on;
  if (on) { box.querySelector('.party-form').hidden = true; box.querySelector('.party-idle').hidden = true; document.getElementById('party-status').textContent = '🎉 Party on until ' + new Date(p.endsAt).toTimeString().slice(0, 5); }
  else if (box.querySelector('.party-form').hidden) box.querySelector('.party-idle').hidden = false;
}
// Weekly automatic backup status (Setup > System).
document.getElementById('autobackup-now')?.addEventListener('click', () => { send({ cmd: 'backupNow' }); cxToast('Backing up…'); });
function syncAutoBackup() {
  const el = document.getElementById('autobackup-status'), b = currentState.backup; if (!el || !b) return;
  el.textContent = b.error ? '⚠ The last automatic backup failed: ' + b.error
    : b.lastAt ? `Automatic weekly backup: last on ${new Date(b.lastAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} (${b.count} kept on the Pi)` : 'Automatic weekly backup: the first one runs once there are settings to save.';
  el.style.color = b.error ? '#ff9a9a' : '';
}
// When a timer starts (sunrise, wind-down or the alarm itself), a browser
// that had hidden its preview shows it again, so you can see what's happening.
let _cxAlarmSeen = null;
function syncAlarmPreview() {
  const a = currentState.activeAlarm, id = a && !a.dismissed ? (a.al && a.al.id) + ':' + a.phase : null;
  if (id && id !== _cxAlarmSeen && document.body.classList.contains('cx-preview-off')) { cxApplyPreviewOff(false); cxToast('⏰ Timer started - preview back on'); }
  _cxAlarmSeen = id;
}
// Tell the Pi this browser's time zone (timers run on the user's clock).
function syncTimezone() {
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* old browser */ }
  if (tz && currentState.prefs && currentState.prefs.tz !== tz && !syncTimezone.sent) { syncTimezone.sent = true; send({ cmd: 'setTimezone', tz }); setTimeout(() => { syncTimezone.sent = false; }, 10000); }
}
setInterval(() => { try { renderAlarmList(); } catch (e) { /* not ready yet */ } }, 30000); // keep 'in 3 min' current
function syncPiClock() {
  const el = document.getElementById('pi-clock'), st = currentState.autoStatus || {};
  if (!el) return;
  const mine = new Date().toTimeString().slice(0, 5);
  el.textContent = st.clock ? `Timers run on the Pi's clock: ${st.clock} (${st.tz})` + (st.clock !== mine ? ` - this device says ${mine}` : '') : '';
  el.style.color = st.clock && st.clock !== mine ? '#ff9a9a' : '';
}
function syncAccessChecks() {
  syncParty();
  syncPiClock();
  syncTimezone();
  syncAlarmPreview();
  syncSfx();
  syncAutoBackup();
  syncCountdownPanel();
  const a = currentState.prefs?.access || { localNoPin: true, guests: false };
  const l = document.getElementById('acc-local'), g = document.getElementById('acc-guests');
  if (l) l.checked = a.localNoPin !== false; if (g) g.checked = !!a.guests;
}
const _fxMoved = []; // [{ el, marker }]
function fxEffectList() {
  return [...document.querySelectorAll('#effects-body .effect-btn[data-effect]')].map((b) => b.dataset.effect)
    .filter((k, i, a) => a.indexOf(k) === i && !['custom_cube', 'easter_egg'].includes(k));
}
function fxSheetSync() {
  const sheet = document.getElementById('fx-sheet');
  if (!sheet || sheet.hidden) return;
  // 🎵 Music reaction for this effect, at the top of the sheet.
  const bodyEl = document.getElementById('fx-body');
  let mr = document.getElementById('fx-music');
  if (!mr) {
    mr = document.createElement('div'); mr.id = 'fx-music';
    mr.innerHTML = '<div class="ov-row-label">🎵 Reacts to music</div><div class="opt-grid">' +
      [['', 'Like the rest'], ['0', 'Off'], ['0.3', 'A little'], ['0.6', 'Medium'], ['1', 'A lot']].map(([v, t]) => `<button type="button" class="strobe-mode-btn" data-mr="${v}">${t}</button>`).join('') + '</div>';
    mr.querySelectorAll('[data-mr]').forEach((b) => b.addEventListener('click', () => send({ cmd: 'setMusicReactFor', effect: currentState.effect, amount: b.dataset.mr === '' ? null : Number(b.dataset.mr) })));
    bodyEl.prepend(mr);
  }
  const own = currentState.musicReact?.perEffect?.[currentState.effect];
  const curV = own === undefined || own === null ? '' : String(own);
  mr.querySelectorAll('[data-mr]').forEach((b) => b.classList.toggle('active', b.dataset.mr === curV));
  mr.hidden = currentState.effect === 'radio';
  document.getElementById('fx-name').textContent = cxEffectName(currentState.effect);
  const body = document.getElementById('fx-body'), host = document.getElementById('now-options');
  let none = body.querySelector('.fx-none');
  const empty = !host || !host.children.length;
  if (empty && !none) { none = document.createElement('div'); none.className = 'fx-none'; body.appendChild(none); }
  if (none) { none.hidden = !empty; none.textContent = currentState.effect === 'radio' ? 'Internet Radio\'s options are on the Music tab.' : 'This effect has no options. Use ◀ ▶ to try the next one.'; }
}
function openFxSheet() {
  const sheet = document.getElementById('fx-sheet'), body = document.getElementById('fx-body');
  if (!sheet || !body) return;
  setTab('play');
  placeActivePanels();
  if (sheet.hidden) {
    // Move the options (and the speed/colour controls) into the sheet; markers put them back on close.
    for (const id of ['now-options']) {
      const el = document.getElementById(id); if (!el) continue;
      const marker = document.createComment('fx-sheet placeholder');
      el.replaceWith(marker); body.appendChild(el); _fxMoved.push({ el, marker });
    }
    sheet.hidden = false;
  }
  document.body.classList.add('fx-open');
  cxSheetFull(true);
  fxSheetSync();
  document.getElementById('fx-body').scrollTop = 0;
  document.getElementById('fx-back')?.focus({ preventScroll: true });
}
function closeFxSheet() {
  const sheet = document.getElementById('fx-sheet');
  if (!sheet || sheet.hidden) return;
  while (_fxMoved.length) { const { el, marker } = _fxMoved.pop(); marker.replaceWith(el); }
  sheet.hidden = true;
  document.body.classList.remove('fx-open');
  // Back to the running effect's tile, where the user was.
  const tile = document.querySelector(`#effects-body .effect-btn[data-effect="${CSS.escape(currentState.effect || '')}"]`);
  if (tile) { const r = tile.getBoundingClientRect(), sc = document.getElementById('sidebar-scroll').getBoundingClientRect(); if (r.top < sc.top || r.bottom > sc.bottom) cxScrollMenuTo(tile, 'center'); }
}
function fxStep(dir) {
  const list = fxEffectList(); if (!list.length) return;
  const i = list.indexOf(currentState.effect);
  const next = list[((i < 0 ? 0 : i + dir) + list.length) % list.length];
  document.querySelector(`#effects-body .effect-btn[data-effect="${CSS.escape(next)}"]`)?.click();
  setTimeout(openFxSheet, 80); // the tile's own handler may switch tab; keep the sheet showing
}
document.getElementById('fx-back')?.addEventListener('click', closeFxSheet);
document.getElementById('fx-prev')?.addEventListener('click', () => fxStep(-1));
document.getElementById('fx-next')?.addEventListener('click', () => fxStep(1));
document.addEventListener('keydown', (e) => {
  const sheet = document.getElementById('fx-sheet');
  if (!sheet || sheet.hidden || e.target.matches('input, textarea, select')) return;
  if (e.key === 'Escape') closeFxSheet();
  else if (e.key === 'ArrowLeft') fxStep(-1);
  else if (e.key === 'ArrowRight') fxStep(1);
});

// ── Colour palettes (applied to every effect by the Pi's finishing pass).
const CX_PALETTES = {
  auto: ['Original', 'linear-gradient(90deg,#ff3d3d,#ffd23d,#3dff7a,#3dbbff,#b23dff)'],
  sunset: ['Sunset', 'linear-gradient(90deg,#3b0a4d,#a3216b,#ff4e5c,#ff9b3d,#ffe08a)'],
  ocean: ['Ocean', 'linear-gradient(90deg,#03124a,#0b4fa3,#14a8d6,#5fe6e0)'],
  neon: ['Neon', 'linear-gradient(90deg,#ff00a8,#8a00ff,#00c8ff,#00ffa3)'],
  ember: ['Ember', 'linear-gradient(90deg,#3d0700,#a01d00,#ff4d00,#ffab1a)'],
  aurora: ['Aurora', 'linear-gradient(90deg,#003d2a,#00b377,#30f0c8,#7c5cff,#e86bff)'],
  forest: ['Forest', 'linear-gradient(90deg,#0b2a10,#2e7d32,#8bc34a,#d4e157)'],
  candy: ['Candy', 'linear-gradient(90deg,#ff5fa2,#b388ff,#82b1ff,#80ffea)'],
  ice: ['Ice', 'linear-gradient(90deg,#0a1a3a,#2a5ab8,#7ab8ff,#cfe8ff)'],
};
function cxWirePalettes() {
  const box = document.getElementById('cx-pal');
  if (!box) return;
  box.replaceChildren(...Object.entries(CX_PALETTES).map(([k, [name, bg]]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.dataset.pal = k; b.style.background = bg;
    b.addEventListener('click', () => send({ cmd: 'setLook', palette: k, on: true }));
    return b;
  }));
}
function cxSyncPalettes() {
  const cur = currentState.prefs?.look?.palette || 'auto';
  document.querySelectorAll('#cx-pal button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pal === cur)));
}

// ── Favourites: a star on every tile.
function cxAddStar(btn) {
  if (btn.querySelector('.cx-star')) return;
  const st = document.createElement('span');
  st.className = 'cx-star'; st.setAttribute('role', 'button'); st.title = 'Favourite'; // the ★ is CSS content, so it never leaks into the tile's name
  st.addEventListener('click', (e) => { e.stopPropagation(); send({ cmd: 'toggleFavourite', effect: btn.dataset.effect }); });
  btn.appendChild(st);
}
function cxSyncFavs() {
  const favs = new Set(currentState.prefs?.favourites || []);
  // ★ Favourites strip at the top of the effect list: one tap, no scrolling.
  const body = document.getElementById('effects-body');
  if (body) {
    let strip = document.getElementById('fav-strip');
    if (!strip) { strip = document.createElement('div'); strip.id = 'fav-strip'; body.prepend(strip); }
    const list = (currentState.prefs?.favourites || []).filter((k) => effectNames?.[k]);
    const key = JSON.stringify([list, currentState.effect, !!_cxThumbData]);
    if (strip.dataset.key !== key) {
      strip.dataset.key = key;
      strip.hidden = !list.length;
      strip.replaceChildren(Object.assign(document.createElement('div'), { className: 'fav-strip-title', textContent: '★ Favourites' }), ...list.map((k) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'fav-tile' + (k === currentState.effect ? ' on' : '');
        const n = document.createElement('span'); n.textContent = effectNames[k];
        b.append(cxStillThumb(k), n);
        b.addEventListener('click', () => document.querySelector(`#effects-body .effect-btn[data-effect="${CSS.escape(k)}"]`)?.click());
        return b;
      }));
    }
  }
  document.querySelectorAll('#effects-body .effect-btn[data-effect]').forEach((b) => b.classList.toggle('fav', favs.has(b.dataset.effect)));
  const p = currentState.prefs?.playlist;
  const sw = document.getElementById('playlist-sw'), sel = document.getElementById('playlist-min'), note = document.getElementById('playlist-note');
  if (p && sw) {
    sw.classList.toggle('on', !!p.on);
    if (document.activeElement !== sel) sel.value = String(p.minutes);
    note.textContent = p.on && favs.size < 2 ? 'Star at least two effects (★ on the tiles) for the playlist to cycle.' : '';
  }
  const look = currentState.prefs?.look, lsw = document.getElementById('look-sw');
  if (look && lsw) {
    lsw.classList.toggle('on', look.on !== false);
    for (const k of ['bloom', 'vibrance', 'smooth', 'depth']) {
      const el = document.getElementById('look-' + k);
      if (el && look[k] !== undefined && document.activeElement !== el) { el.value = look[k]; document.getElementById('look-' + k + '-val').textContent = Math.round(look[k] * 100) + '%'; }
    }
  }
  const n = currentState.prefs?.nightDim, nsw = document.getElementById('night-sw');
  if (n && nsw) {
    nsw.classList.toggle('on', !!n.on);
    const f = document.getElementById('night-from'), t = document.getElementById('night-to'), l = document.getElementById('night-level');
    if (document.activeElement !== f) f.value = String(n.from);
    if (document.activeElement !== t) t.value = String(n.to);
    if (document.activeElement !== l) { l.value = n.level; document.getElementById('night-level-val').textContent = Math.round(n.level * 100) + '%'; }
  }
}
function cxWirePrefs() {
  document.querySelectorAll('#effects-body .effect-btn[data-effect]').forEach(cxAddStar);
  document.getElementById('playlist-sw')?.addEventListener('click', () => send({ cmd: 'setPlaylist', on: !currentState.prefs?.playlist?.on }));
  document.getElementById('playlist-min')?.addEventListener('change', (e) => send({ cmd: 'setPlaylist', minutes: Number(e.target.value) }));
  const hours = [...Array(24).keys()].map((h) => new Option(String(h).padStart(2, '0') + ':00', String(h)));
  document.getElementById('night-from')?.replaceChildren(...hours.map((o) => o.cloneNode(true)));
  document.getElementById('night-to')?.replaceChildren(...hours.map((o) => o.cloneNode(true)));
  document.getElementById('look-sw')?.addEventListener('click', () => send({ cmd: 'setLook', on: currentState.prefs?.look?.on === false }));
  for (const k of ['bloom', 'vibrance', 'smooth', 'depth']) {
    const el = document.getElementById('look-' + k);
    el?.addEventListener('input', () => { document.getElementById('look-' + k + '-val').textContent = Math.round(el.value * 100) + '%'; });
    el?.addEventListener('change', () => send({ cmd: 'setLook', [k]: Number(el.value) }));
  }
  document.getElementById('night-sw')?.addEventListener('click', () => send({ cmd: 'setNightDim', on: !currentState.prefs?.nightDim?.on }));
  document.getElementById('night-from')?.addEventListener('change', (e) => send({ cmd: 'setNightDim', from: Number(e.target.value) }));
  document.getElementById('night-to')?.addEventListener('change', (e) => send({ cmd: 'setNightDim', to: Number(e.target.value) }));
  const lvl = document.getElementById('night-level');
  lvl?.addEventListener('input', () => { document.getElementById('night-level-val').textContent = Math.round(lvl.value * 100) + '%'; });
  lvl?.addEventListener('change', () => send({ cmd: 'setNightDim', level: Number(lvl.value) }));
  // Message Board, Snake, Pixel Pet option panels.
  const msgText = document.getElementById('msg-text');
  const showMsg = () => { setEffectOption('message', 'text', msgText.value); if (currentState.effect !== 'message') send({ cmd: 'setEffect', effect: 'message' }); };
  document.getElementById('msg-send')?.addEventListener('click', showMsg);
  msgText?.addEventListener('keydown', (e) => { if (e.key === 'Enter') showMsg(); });
  document.querySelectorAll('.msg-style').forEach((b) => b.addEventListener('click', () => setEffectOption('message', 'style', b.dataset.style)));
  const ms = document.getElementById('msg-speed');
  ms?.addEventListener('input', () => { document.getElementById('msg-speed-val').textContent = Number(ms.value).toFixed(1) + 'x'; });
  ms?.addEventListener('change', () => setEffectOption('message', 'speed', Number(ms.value)));
  document.querySelectorAll('[data-snake]').forEach((b) => b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    setEffectOption('snake', 'dir', b.dataset.snake);
    setEffectOption('snake', 'press', Date.now());
  }));
  document.getElementById('pet-poke')?.addEventListener('click', () => setEffectOption('pixel_pet', 'poke', Date.now()));
}
// ── YouTube search for Video Display (the Pi searches and streams with yt-dlp).
function cxWireYouTube() {
  const q = document.getElementById('yt-query');
  const go = () => { const v = (q?.value || '').trim(); if (v) send({ cmd: 'ytSearch', query: v }); };
  document.getElementById('yt-search-btn')?.addEventListener('click', go);
  q?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { go(); q.blur(); } });
}
function cxSyncAiArtNote() {
  const n = document.getElementById('aiart-note');
  if (n) n.textContent = cxAiOn() ? '' : 'Needs an AI service - Setup → AI assistant (free options there).';
}
function cxSyncYouTube() {
  cxSyncAiArtNote();
  const yt = currentState.yt, list = document.getElementById('yt-results'), st = document.getElementById('yt-status');
  if (!list || !st) return;
  const favs = currentState.prefs?.videos || [];
  const showFavs = !yt?.results?.length || !!document.getElementById('yt-favs-btn')?.classList.contains('active');
  const rows = showFavs ? favs : yt.results;
  const key = JSON.stringify([rows.map((r) => r.id), yt?.playing?.id, favs.map((r) => r.id), showFavs]);
  st.textContent = !yt?.query && !yt?.playing && !yt?.error ? (favs.length ? '★ Your favourite videos. Search for more.' : 'Search, then tap a video to play it on the display.') : yt.searching ? 'Searching…'
    : yt.playing?.loading ? 'Loading “' + yt.playing.title + '”…' : yt.error || (yt.playing ? '▶ ' + yt.playing.title : '');
  cxSyncYtSeek();
  const acct = document.getElementById('yt-account');
  if (acct) acct.textContent = yt?.signedIn ? '✓ Signed in to YouTube' : 'Not signed in';
  const out = document.getElementById('yt-signout'); if (out) out.hidden = !yt?.signedIn;
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  const mmss = (s) => (s ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '');
  list.replaceChildren(...rows.map((r) => {
    const row = document.createElement('div');
    const fav = favs.some((f) => f.id === r.id);
    row.className = 'yt-item' + (yt?.playing?.id === r.id ? ' on' : '');
    row.innerHTML = `<span class="yt-play">▶</span><span style="flex:1;min-width:0"><b></b><small></small></span><button class="yt-fav" aria-label="Favourite"></button>`;
    row.querySelector('b').textContent = r.title;
    row.querySelector('small').textContent = [r.channel, mmss(r.duration)].filter(Boolean).join(' · ');
    const star = row.querySelector('.yt-fav');
    star.textContent = fav ? '★' : '☆';
    star.classList.toggle('on', fav);
    star.addEventListener('click', (e) => { e.stopPropagation(); send({ cmd: 'toggleVideoFav', video: { id: r.id, title: r.title, channel: r.channel || '', duration: r.duration || 0 } }); });
    row.addEventListener('click', () => send({ cmd: 'ytPlay', id: r.id, title: r.title, duration: r.duration }));
    return row;
  }));
}

// YouTube position bar + ±10 s: the position is estimated from when the
// server last (re)started the stream; a seek restarts picture and sound there.
let _ytSeekDragging = false;
function cxYtPos() {
  const p = currentState.yt?.playing;
  if (!p || p.loading || !p.startedAt) return 0;
  const t = (p.start || 0) + (Date.now() - p.startedAt) / 1000;
  return p.duration ? Math.min(t, p.duration) : t;
}
function cxYtClock(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function cxSyncYtSeek() {
  const box = document.getElementById('yt-seek'), p = currentState.yt?.playing;
  if (!box) return;
  box.hidden = !p || p.loading;
  if (box.hidden) return;
  const bar = document.getElementById('yt-seek-bar'), t = cxYtPos();
  bar.max = String(p.duration || Math.max(600, Math.ceil(t) + 60));
  if (!_ytSeekDragging) bar.value = String(t);
  document.getElementById('yt-seek-time').textContent = cxYtClock(_ytSeekDragging ? Number(bar.value) : t) + (p.duration ? ' / ' + cxYtClock(p.duration) : '');
  const vol = Number(currentState.effectOptions?.radio?.volume ?? 0.8), vs = document.getElementById('yt-volume');
  if (vs && document.activeElement !== vs) vs.value = String(vol);
  const vv = document.getElementById('yt-volume-val'); if (vv) vv.textContent = Math.round(vol * 100) + '%';
  // Where the sound goes, and why it might be silent.
  const rs = currentState.effectStatus?.radio || {}, snd = document.getElementById('yt-sound');
  if (snd) {
    const bits = [];
    if (vol === 0) bits.push('🔇 Muted - turn the volume up');
    else bits.push('Speaker: ' + (rs.playbackStatus || rs.status || 'starting…'));
    if (document.getElementById('radio-browser-audio') && !radioBrowserPlaybackWanted()) bits.push('To hear it on this device too: Music tab → Play in this browser');
    snd.textContent = bits.join(' · ');
  }
}
function cxWireYtSeek() {
  const bar = document.getElementById('yt-seek-bar');
  if (!bar) return;
  bar.addEventListener('input', () => { _ytSeekDragging = true; cxSyncYtSeek(); });
  const vs = document.getElementById('yt-volume');
  vs?.addEventListener('input', () => {
    setEffectOption('radio', 'volume', Number(vs.value));
    const el = document.getElementById('radio-browser-audio'); if (el) el.volume = Number(vs.value);
    document.getElementById('yt-volume-val').textContent = Math.round(Number(vs.value) * 100) + '%';
  });
  bar.addEventListener('change', () => { _ytSeekDragging = false; send({ cmd: 'ytSeek', seconds: Number(bar.value) }); });
  document.querySelectorAll('[data-ytskip]').forEach((b) => b.addEventListener('click', () => send({ cmd: 'ytSeek', seconds: cxYtPos() + Number(b.dataset.ytskip) })));
  setInterval(cxSyncYtSeek, 500);
}
cxWireYtSeek();
document.getElementById('yt-cookie-file')?.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  f.text().then((text) => send({ cmd: 'ytCookies', text })); e.target.value = '';
});
document.getElementById('yt-signout')?.addEventListener('click', () => send({ cmd: 'ytCookies', text: '' }));
document.getElementById('yt-favs-btn')?.addEventListener('click', (e) => { e.currentTarget.classList.toggle('active'); cxSyncYouTube(); });

// AI Art's own prompt box: asks the AI to draw (same path as the Ask bar).
function cxWireAiArt() {
  const inp = document.getElementById('aiart-input');
  const go = () => {
    const v = (inp?.value || '').trim(); if (!v) return;
    if (!cxAiOn()) { cxToast('Set up an AI service first: Setup → AI assistant'); return; }
    cxSubmit('draw pixel art of ' + v); inp.value = '';
  };
  document.getElementById('aiart-go')?.addEventListener('click', go);
  inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

function cxWireDice() {
  document.querySelectorAll('[data-dicecount]').forEach((b) => b.addEventListener('click', () => setEffectOption('dice', 'count', Number(b.dataset.dicecount))));
  document.querySelectorAll('[data-dicecol]').forEach((b) => b.addEventListener('click', () => setEffectOption('dice', 'colour', b.dataset.dicecol)));
}
function cxSyncOptionPanels() {
  const dc = currentState.effectOptions?.dice || {};
  document.querySelectorAll('[data-dicecount]').forEach((b) => b.classList.toggle('active', Number(b.dataset.dicecount) === (Number(dc.count) || 2)));
  document.querySelectorAll('[data-dicecol]').forEach((b) => b.classList.toggle('active', b.dataset.dicecol === (dc.colour || 'ivory')));
  const o = currentState.effectOptions?.message || {};
  document.querySelectorAll('.msg-style').forEach((b) => b.classList.toggle('active', b.dataset.style === (o.style || 'neon')));
  const t = document.getElementById('msg-text');
  if (t && document.activeElement !== t && typeof o.text === 'string') t.value = o.text;
}

// ── Voice: speak into the Ask bar (the phone's own speech recognition;
// browsers only allow the microphone on the https:// address).
function cxWireVoice() {
  const mic = document.getElementById('cx-mic');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!mic) return;
  mic.addEventListener('click', () => {
    if (!SR) { cxToast('Voice isn\u2019t supported in this browser'); return; }
    if (!window.isSecureContext) { cxToast('Voice needs the https:// address (port 8082)'); return; }
    const rec = new SR(); rec.lang = navigator.language || 'en-GB'; rec.interimResults = false; rec.maxAlternatives = 1;
    const box = document.querySelector('.cx-ask');
    box.classList.add('listening'); cxToast('🎤 Listening…');
    rec.onresult = (e) => { const t = e.results[0][0].transcript; document.getElementById('cx-ask').value = t; cxSubmit(t); };
    rec.onerror = (e) => cxToast('Voice: ' + (e.error === 'not-allowed' ? 'microphone blocked' : e.error));
    rec.onend = () => box.classList.remove('listening');
    rec.start();
  });
}

// ── Install as an app (PWA). Browsers only offer "Install" on a secure
// (https or allowed) address; the service worker (/sw.js) adds an offline
// page. iPhone installs via Safari's Share menu without either.
let _cxInstallEvt = null;
function cxWirePwa() {
  if ('serviceWorker' in navigator && window.isSecureContext && !window.MULTIDISPLAY_SIM) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); _cxInstallEvt = e; cxSyncPwa(); });
  window.addEventListener('appinstalled', () => { _cxInstallEvt = null; cxToast('📲 Installed'); cxSyncPwa(); });
  document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
    if (_cxInstallEvt) { _cxInstallEvt.prompt(); await _cxInstallEvt.userChoice.catch(() => {}); _cxInstallEvt = null; cxSyncPwa(); return; }
    document.getElementById('pwa-help').hidden = false;
    cxScrollMenuTo(document.getElementById('pwa-help'), 'center');
  });
  cxSyncPwa();
}
function cxSyncPwa() {
  const btn = document.getElementById('pwa-install-btn'), help = document.getElementById('pwa-help');
  if (!btn || !help) return;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (standalone) { btn.hidden = true; help.textContent = '✅ Running as an installed app.'; return; }
  btn.hidden = false;
  btn.textContent = _cxInstallEvt ? '📲 Install as an app' : '📲 How to install as an app';
  const here = location.origin;
  help.innerHTML = ios
    ? 'In <b>Safari</b>: tap <b>Share</b> (square with arrow) → <b>Add to Home Screen</b>. It opens full-screen like an app.'
    : _cxInstallEvt ? 'Tap the button - your browser will ask to install it.'
      : `Your browser only installs apps from a secure address. Once, in <b>Chrome</b>: open <b>chrome://flags/#unsafely-treat-insecure-origin-as-secure</b>, enable it, add <b>${here}</b>, tap <b>Relaunch</b>. Then come back here and tap the button (or ⋮ → <b>Install app</b>).`;
  help.hidden = !_cxInstallEvt && !ios ? help.hidden : false;
}

// ── Backup, notifications, My Photos
function cxWireExtras() {
  const pinHdr = () => ({ 'X-Control-Pin': storedPin() });
  document.getElementById('backup-btn')?.addEventListener('click', async () => {
    try {
      const r = await fetch('/api/backup', { headers: pinHdr() });
      if (!r.ok) throw new Error((await r.json()).error || r.status);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await r.blob());
      a.download = `multidisplay-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      cxToast('💾 Backup downloaded');
    } catch (e) { cxToast('Backup failed: ' + e.message); }
  });
  document.getElementById('restore-input')?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f || !confirm('Replace ALL settings on the Pi with this backup? The display restarts.')) return;
    try {
      const r = await fetch('/api/restore', { method: 'POST', body: f, headers: pinHdr() });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      cxToast('Restored - restarting…');
    } catch (err) { cxToast('Restore failed: ' + err.message); }
  });
  const url = () => document.getElementById('notify-url')?.value || '';
  document.getElementById('notify-copy')?.addEventListener('click', () => { navigator.clipboard?.writeText(url()).then(() => cxToast('Link copied'), () => { document.getElementById('notify-url').select(); }); });
  document.getElementById('notify-test')?.addEventListener('click', () => fetch(url().replace('Hello', 'Hello from the phone')).then(() => cxToast('Sent')));
  document.getElementById('notify-new')?.addEventListener('click', () => { if (confirm('Make a new link? The old one stops working.')) send({ cmd: 'newNotifyToken' }); });
  document.getElementById('photo-input')?.addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    const st = document.getElementById('photo-status');
    let done = 0;
    for (const f of files) {
      st.textContent = `Uploading ${done + 1} of ${files.length}…`;
      try {
        const r = await fetch('/api/uploadPhoto?name=' + encodeURIComponent(f.name), { method: 'POST', body: f, headers: pinHdr() });
        const j = await r.json(); if (!j.ok) throw new Error(j.error);
        done++;
      } catch (err) { st.textContent = `${f.name}: ${err.message}`; return; }
    }
    st.textContent = `Added ${done} photo${done === 1 ? '' : 's'}.`;
    if (currentState.effect !== 'my_photos') send({ cmd: 'setEffect', effect: 'my_photos' });
  });
  const secs = document.getElementById('photo-secs');
  secs?.addEventListener('input', () => { document.getElementById('photo-secs-val').textContent = secs.value + 's'; });
  secs?.addEventListener('change', () => setEffectOption('my_photos', 'secs', Number(secs.value)));
}
let _cxNoticeSeen = null;
function cxSyncExtras() {
  const u = document.getElementById('notify-url');
  if (u && currentState.notifyToken) u.value = `${location.protocol}//${location.host}/api/notify?token=${currentState.notifyToken}&text=Hello`;
  const list = document.getElementById('photo-list');
  if (list) {
    const photos = currentState.photos || [];
    list.replaceChildren(...photos.map((n, i) => {
      const chip = document.createElement('span'); chip.textContent = `Photo ${i + 1}`;
      const del = document.createElement('button'); del.textContent = '✕'; del.setAttribute('aria-label', `Delete photo ${i + 1}`);
      del.addEventListener('click', () => { if (confirm('Delete this photo?')) send({ cmd: 'deletePhoto', name: n }); });
      chip.appendChild(del); return chip;
    }));
  }
  const n = currentState.notice;
  if (n && n.until !== _cxNoticeSeen) { _cxNoticeSeen = n.until; cxToast('🔔 ' + n.text); }
}

// ── Ask: type what you want ("calm blue", "party", "fire"...).
const CX_ASK = [
  [/calm|chill|relax|blue|ocean|sea/, 'tide'], [/aurora|northern|green/, 'aurora'], [/party|dance|disco/, 'strobe'],
  [/music|radio|beat|song/, 'radio'], [/fire|warm|cosy|cozy|flame/, 'fireworks'], [/night|sky|space|star|galax/, 'nebula'],
  [/rain/, 'rain'], [/rainbow|colou?r/, 'gradient_wash'], [/time|clock/, 'datetime'], [/weather/, 'weather'],
  [/moon|planet/, 'moon'], [/joke|funny|laugh/, 'joke'], [/trivia|quiz/, 'trivia'], [/game|tron|bike/, 'tron'],
  [/maze/, 'maze'], [/sand/, 'sand'], [/ball/, 'balls'], [/dice/, 'dice'], [/coin/, 'coinflip'], [/plasma|psych/, 'plasma'],
  [/surprise|random|anything/, 'random'], [/sunset|sunrise|orange|warm glow/, 'prism'], [/wave|water|flow/, 'wave'],
  [/laser|grid|cyber|neon/, 'sphere'], [/dna|science|helix/, 'dna'], [/warp|hyper|fast/, 'warp'], [/storm|thunder/, 'lightning'],
  [/ghost|spooky|halloween/, 'ghost'], [/firework|celebrat|new year|birthday/, 'fireworks'], [/retro|80s|arcade/, 'random80s'], [/earth|globe/, 'epic'], [/photo|art|picture/, 'artic'], [/iss|station/, 'iss'],
];
function cxAsk(q) {
  q = q.toLowerCase().trim();
  if (!q) return;
  if (/^(off|stop|dark|sleep)/.test(q)) { document.getElementById('clear-all-btn')?.click(); return; }
  const palWord = [[/warm|cosy|cozy|orange/, 'ember'], [/sunset|dusk/, 'sunset'], [/cool|cold|blue|ocean|sea/, 'ocean'], [/ice|frost|winter/, 'ice'],
    [/neon|vivid|cyber/, 'neon'], [/green|forest|nature/, 'forest'], [/pastel|candy|soft|pink/, 'candy'], [/aurora/, 'aurora'], [/normal|original|default|rainbow/, 'auto']]
    .find(([re]) => re.test(q));
  if (palWord && /colou?r|make it|warmer|cooler|palette|tone|more|less|normal|original/.test(q)) {
    send({ cmd: 'setLook', palette: palWord[1], on: true });
    cxToast('🎨 ' + CX_PALETTES[palWord[1]][0] + ' colours'); return;
  }
  let key = CX_ASK.find(([re]) => re.test(q))?.[1];
  if (!key) key = cxEffectOrder().find((k) => cxEffectName(k).toLowerCase().includes(q) || k.includes(q));
  if (!key) { cxToast('Try “calm”, “party”, “night sky” or an effect name'); return; }
  send({ cmd: 'setEffect', effect: key });
  if (key === 'radio') setTab('music');
  cxToast('✨ ' + cxEffectName(key));
}
// With an AI service set up (Setup > AI), the Ask bar goes to the Pi's AI
// assistant (src/ai.js); otherwise, or if it's switched off, the built-in
// keywords above answer instantly.
function cxAiOn() { return currentState.ai && currentState.ai.provider && currentState.ai.provider !== 'off'; }
function cxSubmit(text) {
  text = (text || '').trim();
  if (!text) return;
  if (!cxAiOn()) { cxAsk(text); return; }
  document.querySelector('.cx-ask')?.classList.add('thinking');
  cxToast('✨ Thinking…');
  clearTimeout(cxSubmit._t);
  cxSubmit._t = setTimeout(() => cxAiResult({ error: 'No answer from the AI - try again' }), 130000);
  send({ cmd: 'aiAsk', text });
}
function cxAiResult(msg) {
  clearTimeout(cxSubmit._t);
  document.querySelector('.cx-ask')?.classList.remove('thinking');
  if (msg.off) { cxToast('AI is off - using built-in words'); return; }
  if (msg.error) { cxToast('⚠ ' + msg.error); return; }
  cxToast('✨ ' + (msg.say || 'Done'));
}
function cxWireAsk() {
  const inp = document.getElementById('cx-ask');
  if (!inp) return;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { cxSubmit(inp.value); inp.value = ''; inp.blur(); } });
  document.querySelectorAll('#cx-ask-chips button').forEach((b) => b.addEventListener('click', () => cxSubmit(b.textContent)));
}

// ── Setup > AI assistant
function cxWireAiSetup() {
  const prov = document.getElementById('ai-provider');
  if (!prov) return;
  document.getElementById('ai-save-btn')?.addEventListener('click', () => {
    const key = document.getElementById('ai-key');
    send({ cmd: 'setAiConfig', provider: prov.value, key: key.value, model: document.getElementById('ai-model').value, url: document.getElementById('ai-url').value });
    key.value = '';
    cxToast('AI settings saved');
  });
  document.getElementById('ai-clear-btn')?.addEventListener('click', () => { if (confirm('Remove the saved AI key?')) send({ cmd: 'setAiConfig', clearKey: true }); });
  prov.addEventListener('change', () => cxSyncAiSetup(prov.value));
}
const AI_HELP = {
  off: 'The Ask bar uses built-in words only (calm, party, night sky…). No internet needed.',
  gemini: 'Free key from aistudio.google.com → Get API key. Free-tier prompts may be used by Google to improve its models.',
  groq: 'Free key from console.groq.com → API Keys. Fast, with daily limits.',
  ollama: 'Free and private: install Ollama on a computer on your network, run “ollama pull llama3.2”, and enter its address.',
};
function cxSyncAiSetup(pick) {
  const a = currentState.ai, prov = document.getElementById('ai-provider');
  if (!a || !prov) return;
  if (!prov.options.length) prov.replaceChildren(...Object.entries(a.providers).map(([k, v]) => new Option(v, k)));
  if (!pick && document.activeElement !== prov) prov.value = a.provider;
  const p = pick || prov.value;
  document.getElementById('ai-key-row').hidden = !(p === 'gemini' || p === 'groq');
  document.getElementById('ai-url-row').hidden = p !== 'ollama';
  document.getElementById('ai-model-row').hidden = p === 'off';
  const model = document.getElementById('ai-model'), url = document.getElementById('ai-url');
  if (document.activeElement !== model && !pick) model.value = a.model || '';
  if (document.activeElement !== url && !pick) url.value = a.url || '';
  document.getElementById('ai-help').textContent = AI_HELP[p] || '';
  document.getElementById('ai-key').placeholder = a.keySet && p === a.provider ? 'Key saved ✓ (type to replace)' : 'Paste your API key';
  document.getElementById('ai-clear-btn').hidden = !a.keySet;
}

// ── Time ring: every timer as a dot on a 24-hour clock face.
function cxRenderRing() {
  const svg = document.getElementById('cx-ring-svg');
  if (!svg) return;
  const now = new Date(), hh = now.getHours() + now.getMinutes() / 60;
  const pt = (h, r) => { const a = h / 24 * Math.PI * 2 - Math.PI / 2; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; };
  let out = '<circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="6"/>';
  for (let h = 0; h < 24; h += 6) { const [x, y] = pt(h, 30); out += `<text x="${x}" y="${y + 1.5}" font-size="4" text-anchor="middle" fill="rgba(238,242,255,.45)">${h}</text>`; }
  const alarms = (currentState.alarms || []).filter((a) => a.enabled);
  let next = null, best = Infinity;
  for (const al of alarms) {
    const h = al.hour + al.minute / 60, [x, y] = pt(h, 40);
    out += `<circle cx="${x}" cy="${y}" r="3.2" fill="var(--cx2)" stroke="#fff" stroke-width=".6"/>`;
    const t = tmNextRun(al, now);
    if (t && t - now < best) { best = t - now; next = al; }
  }
  const [hx, hy] = pt(hh, 40);
  out += `<circle cx="${hx}" cy="${hy}" r="2.2" fill="#fff"/>`;
  svg.innerHTML = out;
  const t = document.getElementById('cx-ring-time'), n = document.getElementById('cx-ring-next');
  if (t) t.textContent = now.toTimeString().slice(0, 5);
  if (n) n.textContent = next ? `next: ${next.name || TM_KIND_LABEL[tmKindOf(next)]} ${tmUntil(tmNextRun(next, now))}` : 'no timers on';
}

// ── Now playing card on the Music tab.
// Spectrum settings only show while Internet Radio is the effect on screen,
// so changing one (or tapping Show spectrum) switches the display to it.
let _cxBeforeSpectrum = null;
function cxShowSpectrum() {
  if (currentState.effect !== 'radio') { _cxBeforeSpectrum = currentState.effect; send({ cmd: 'setEffect', effect: 'radio' }); cxToast('📊 Showing the spectrum'); }
  if (!(currentState.effectOptions?.radio?.spectrumOn)) setEffectOption('radio', 'spectrumOn', true);
}
// The button is a toggle: while the spectrum shows, it goes back to the
// effect that was on before (or just switches the spectrum bars off).
function cxToggleSpectrum() {
  if (currentState.effect === 'radio' && currentState.effectOptions?.radio?.spectrumOn) {
    if (_cxBeforeSpectrum && _cxBeforeSpectrum !== 'radio') { send({ cmd: 'setEffect', effect: _cxBeforeSpectrum }); cxToast('Back to ' + cxEffectName(_cxBeforeSpectrum)); }
    else setEffectOption('radio', 'spectrumOn', false);
    _cxBeforeSpectrum = null;
  } else cxShowSpectrum();
}
function cxWireSpectrumShortcut() {
  document.getElementById('cx-show-spectrum')?.addEventListener('click', cxToggleSpectrum);
  document.querySelectorAll('#panel-radio .spectrum-bands-btn, #panel-radio .au-theme-btn').forEach((b) => b.addEventListener('click', () => { if (currentState.effect !== 'radio') cxShowSpectrum(); }));
  document.querySelectorAll('#au-look-sel').forEach((el) => el.addEventListener('change', () => { if (currentState.effect !== 'radio') cxShowSpectrum(); }));
}

function cxSyncMusic() {
  const st = currentState.effectStatus?.radio, card = document.getElementById('cx-np');
  if (!card) return;
  const playing = !!(st && st.playing && st.station);
  card.classList.toggle('playing', playing);
  const sb = document.getElementById('cx-show-spectrum');
  if (sb) {
    const on = currentState.effect === 'radio' && !!currentState.effectOptions?.radio?.spectrumOn;
    sb.textContent = on ? '📊 Hide the spectrum' : '📊 Show the spectrum on the display';
    sb.classList.toggle('active', on);
  }
  document.getElementById('cx-np-name').textContent = playing ? st.station.name.replace(/^[\s-]+/, '') : 'Nothing playing';
  document.getElementById('cx-np-sub').textContent = playing ? (st.title ? '♪ ' + st.title : st.station.genre || 'Radio') : 'Pick a station below';
  const mb = document.getElementById('stop-sound-btn');
  if (mb) {
    const muted = radioMuted();
    mb.textContent = muted ? '🔇' : '🔊';
    mb.title = muted ? 'Unmute' : 'Mute'; mb.setAttribute('aria-label', mb.title);
    mb.classList.toggle('cx-quiet', !playing && !muted);
    mb.classList.toggle('cx-muted', muted);
    mb.classList.toggle('snd-off', muted || !playing); // the ON/OFF label under it, like the other buttons
  }
}

function cxSyncHeroLabel() {
  const n = document.getElementById('cx-hero-name'), sub = document.getElementById('cx-hero-sub');
  if (!n) return;
  n.textContent = currentState.blank ? 'Off' : cxEffectName(currentState.effect);
  const hasOpts = !!document.getElementById('panel-' + (currentState.effect || ''));
  const ob = document.getElementById('cx-opts-btn'), mb = document.getElementById('cx-mini-opts'), mn = document.getElementById('cx-mini-name');
  if (ob) ob.hidden = !hasOpts;
  if (mb) mb.hidden = !hasOpts;
  if (mn) mn.textContent = currentState.blank ? 'Off' : cxEffectName(currentState.effect);
  const st = currentState.effectStatus?.radio;
  sub.textContent = st && st.playing && st.station ? '♫ ' + st.station.name.replace(/^[\s-]+/, '') : '';
}
function cxOnState() { cxSyncMusic(); cxRenderRing(); cxSyncHeroLabel(); cxSyncAiSetup(); cxSyncFavs(); cxSyncPalettes(); cxSyncOptionPanels(); cxSyncYouTube(); cxSyncExtras(); requestAnimationFrame(cxMoveBlob); }

function cxInit() {
  cxWireHero();
  cxWireAsk();
  cxWireAiSetup();
  cxWirePrefs();
  cxWirePalettes();
  cxWireDice();
  cxWireYouTube();
  cxWireAiArt();
  cxWireVoice();
  cxWireSpectrumShortcut();
  cxWireExtras();
  cxWirePwa();
  cxWireTiles();
  document.querySelectorAll('#tab-bar [data-tab]').forEach((b) => b.addEventListener('click', () => requestAnimationFrame(cxMoveBlob)));
  window.addEventListener('resize', cxMoveBlob);
  setInterval(cxRenderRing, 30000);
  // Display type cards: a spinning cube and a flat-panel outline on the buttons.
  document.querySelectorAll('.size-btn[data-size]').forEach((b) => {
    if (b.querySelector('.cx-ico')) return;
    const i = document.createElement('span');
    i.className = 'cx-ico ' + (b.dataset.mode === 'panel2d' ? 'cx-ico-flat' : 'cx-ico-cube');
    i.innerHTML = b.dataset.mode === 'panel2d' ? '<i></i><i></i>' : '<i></i><i></i><i></i><i></i><i></i><i></i>';
    b.prepend(i);
  });
  cxOnState();
  setTimeout(cxMoveBlob, 300);
}
