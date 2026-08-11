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
    const modeChanged = msg.panelMode !== currentState.panelMode || msg.panelSize !== currentState.panelSize;
    currentState = msg;
    syncEffectButtons();
    syncPanelButtons();
    syncSliders();
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
    if (Object.prototype.hasOwnProperty.call(effectNames, key)) {
      btn.addEventListener('click', () => send({ cmd: 'setEffect', effect: key }));
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

function markUnsupported(el) {
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
    note.textContent = 'Not available in the Pi-native engine yet.';
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
// 3D preview (Three.js), targeting the original app's #c canvas.
// ---------------------------------------------------------------------
let renderer, scene, camera, group;

function initScene() {
  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
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
}

function rebuildScene() {
  if (group) scene.remove(group);
  group = new THREE.Group();
  scene.add(group);
  for (const key in faceCanvases) delete faceCanvases[key];

  const size = currentState.panelSize || 64;
  const faceCount = currentState.panelMode === '2d' ? 1 : 6;

  for (let face = 0; face < faceCount; face++) {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    faceCanvases[face] = { canvas, ctx, imgData: ctx.createImageData(size, size), texture };

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: texture }));
    if (faceCount === 1) {
      group.add(plane);
    } else {
      const xf = FACE_XFORM[face];
      plane.position.set(xf.pos[0] * 1.001, xf.pos[1] * 1.001, xf.pos[2] * 1.001);
      plane.rotation.set(xf.rot[0], xf.rot[1], xf.rot[2]);
      group.add(plane);
    }
  }

  camera.position.set(faceCount === 1 ? 0 : 2.6, faceCount === 1 ? 0 : 2.0, faceCount === 1 ? 2.4 : 2.6);
  camera.lookAt(0, 0, 0);
}

function animate() {
  requestAnimationFrame(animate);
  const autoRotate = document.getElementById('auto-rotate-chk');
  if (group && currentState.panelMode !== '2d' && (!autoRotate || autoRotate.checked)) group.rotation.y += 0.003;
  renderer.render(scene, camera);
}

function handleFrame(buf) {
  const bytes = new Uint8Array(buf);
  const face = bytes[0];
  const entry = faceCanvases[face];
  if (!entry) return;
  const size = currentState.panelSize;
  const { ctx, imgData, texture } = entry;
  const px = imgData.data;
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = bytes[1 + i * 3];
    px[i * 4 + 1] = bytes[1 + i * 3 + 1];
    px[i * 4 + 2] = bytes[1 + i * 3 + 2];
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  texture.needsUpdate = true;
}

// ---------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  wireCollapsibles();
  wirePanelButtons();
  wireSliders();
  wireBluetooth();
  greyOutUnsupported();
  loadEffectNames();
  initScene();
  connect();
});
