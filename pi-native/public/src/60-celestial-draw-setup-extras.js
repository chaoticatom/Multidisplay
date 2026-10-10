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
// City search for the Moon's terminator tilt - mirrors
// wireWeatherCityDropdown()'s open-meteo geocoding search, but commits
// lat/lon directly from the picked result (setEffectOption('moon','lat'/
// 'lon', ...)) rather than a city name string - celestial.js only ever
// needed the coordinates, no server-side re-geocode-by-name step needed.
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

// "🔇 Stop Sound" - next to Clear All. Radio plays in the background
// regardless of which effect is selected/displayed, so Clear All blanking
// the screen doesn't stop audio - this is a one-click way to kill it
// without navigating to the Radio panel. A real report: this button
// stopped the Pi-side ticker/status but not the audible sound - because
// "Play in this browser" (see radioBrowserPlay()) plays the stream
// directly in the CLIENT via its own <audio> element, entirely separate
// from the Pi's ffmpeg/paplay pipeline the WS 'stopAllSound' command
// tears down. The existing Radio panel Stop button already calls
// radioBrowserStop() alongside its WS send for exactly this reason (see
// its own click handler) - this button needs the same pairing.
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

