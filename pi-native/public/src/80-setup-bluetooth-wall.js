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

// Sidebar-wide menu system - the ◀ collapse button + floating "show
// sidebar" button on desktop (#sidebar.hidden), and the ☰ #menu-toggle +
// #sidebar-overlay slide-in/out on narrow/mobile viewports (#sidebar.open)
// - present in the markup/CSS (all copied verbatim from the browser
// original) but NONE of it was ever wired here, unlike ui.js's own
// cube.js-based version of this. Ported from cube.js's "MENU TOGGLE"
// section/ui.js's "SIDEBAR COLLAPSE" section (toggleMenu() there is the
// same unified function both delegate to), with one deliberate behavior
// change: the original started with the sidebar CLOSED on a narrow
// viewport (`menuOpen = window.innerWidth > 768`) - this always starts
// OPEN regardless of viewport width, per a real report that the sidebar
// wasn't there to begin with on first load.
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
// Mirrors panelConfig.js's WALL_MAX_COLS/WALL_MAX_ROWS/WALL_MAX_PANELS -
// this file has no access to that module (it also runs standalone against
// a real Pi's wsServer.js over plain WebSocket, not just the bundled
// simulator), so it keeps its own copy, same as before this was 2x3. A
// real request: "I need the ability to choose all horizontal displays...
// e.g. 1 row by 6 wide" - WALL_COLS/WALL_ROWS are now a generous per-axis
// bound (any 1-wide or 1-tall row/column up to 6 long is valid, not just
// a fixed 2x3 block); WALL_MAX_PANELS is the real hardware panel-count cap.
const WALL_COLS = 6, WALL_ROWS = 6, WALL_MAX_PANELS = 6;
let _wallDragFrom = null;
// Whether placement-candidate outlines should currently be rendered at
// all - a real report: candidates used to be shown PERMANENTLY around
// every placed panel, which (once 2+ panels exist) fills out to look
// like the original disliked "static 6-box grid" all over again. Now
// candidates only appear while actively choosing where to put a new
// display (toggled by the "+" button - see wireWallToolbar()) or while
// dragging an existing one to reposition it (_wallDragFrom above) - at
// rest, only the actually-placed displays are shown.
// Single source of truth for "am I currently editing the wall layout" -
// gates candidate outlines, the per-panel remove "×", and whether a placed
// panel can be dragged at all. A real report: "don't go to edit mode when
// tapping on the display. the button must be pressed to go into edit mode
// and pressed again to exit edit mode" - tapping/dragging a placed panel
// used to flip this on by itself (the old canvas mousedown handler set
// _wallDragFrom unconditionally), so merely touching a display while just
// looking at the wall started an edit session. Now ONLY the toolbar button
// (or Escape/click-outside while already editing) can turn this on or off;
// dragging is still how you reposition a panel, but only once edit mode is
// already active via the button.
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

