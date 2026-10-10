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

