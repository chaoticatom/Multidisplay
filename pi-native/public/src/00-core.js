// Wires the sidebar markup to pi-native's WS control protocol. The Pi computes
// effects; this page sends commands, greys out controls with no backend, wires
// the Timers, Face Editor, Overlays and Bluetooth panels, and renders a 3D
// preview from the per-face frames the server streams.
// APP_VERSION is shown in the footer and must match package.json; it is
// bumped by `npm run release`. Clicking it does a plain hard reload.
const APP_VERSION = '0.6.300';

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
const WIRED_OPTION_PANELS = new Set(['countdown', 'ai_art', 'my_photos', 'message', 'snake', 'pixel_pet', 'epic', 'rain', 'lightspeed', 'cam', 'weather', 'maze', 'tron', 'dice', 'coinflip', 'random', 'fireworks', 'retro', 'video', 'strobe', 'balls', 'radio', 'datetime', 'moon', 'apod', 'iss', 'neo', 'unsplash', 'artic', 'joke', 'trivia', 'otd', 'custom_cube', 'radar', 'talking_face']);
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
  if (msg.cmd === 'aiModelsResult') { cxRenderAiModels(msg); return; }
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
    syncTalkingFacePanel();
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

