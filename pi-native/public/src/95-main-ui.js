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
  wireTalkingFacePanel();
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
  const tr = currentState.prefs?.transition || { style: 'fade', secs: 0.4 };
  document.querySelectorAll('#tr-style button').forEach((b) => b.classList.toggle('on', b.dataset.tr === tr.style));
  document.querySelectorAll('#tr-secs button').forEach((b) => b.classList.toggle('on', Math.abs(Number(b.dataset.secs) - tr.secs) < 0.05));
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
  // Transition between effects (src/effects/transition.js).
  document.querySelectorAll('#tr-style button').forEach((b) => b.addEventListener('click', () => send({ cmd: 'setTransition', style: b.dataset.tr })));
  document.querySelectorAll('#tr-secs button').forEach((b) => b.addEventListener('click', () => send({ cmd: 'setTransition', secs: Number(b.dataset.secs) })));
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
  const sel = document.getElementById('ai-model-sel'), model = document.getElementById('ai-model');
  sel.addEventListener('change', () => {
    model.hidden = sel.value !== '__custom';
    if (sel.value !== '__custom') model.value = sel.value; else model.focus();
  });
  document.getElementById('ai-model-refresh').addEventListener('click', () => cxRequestAiModels(prov.value));
}
// Ask the Pi for the provider's model list (aiModelsResult -> cxRenderAiModels).
let cxAiModelsFor = null;
function cxRequestAiModels(p) {
  cxAiModelsFor = p;
  if (p === 'off') return;
  document.getElementById('ai-model-note').textContent = 'Loading models…';
  send({ cmd: 'aiModels', provider: p, url: document.getElementById('ai-url').value });
}
function cxRenderAiModels(msg) {
  const prov = document.getElementById('ai-provider'), sel = document.getElementById('ai-model-sel'), model = document.getElementById('ai-model');
  if (!sel || msg.provider !== prov.value) return;
  const names = (msg.models || []).slice();
  if (msg.default && !names.includes(msg.default)) names.unshift(msg.default);
  const cur = model.value || msg.default || '';
  if (cur && !names.includes(cur)) names.push(cur);
  sel.replaceChildren(...names.map((n) => new Option(n === msg.default ? '★ ' + n + ' (recommended)' : n, n)), new Option('Custom…', '__custom'));
  sel.value = cur || msg.default || '__custom';
  model.value = sel.value === '__custom' ? model.value : sel.value;
  model.hidden = sel.value !== '__custom';
  document.getElementById('ai-model-note').textContent = msg.error ? 'Could not list models: ' + msg.error : names.length + ' models available';
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
  if (pick) model.value = (a.defaults && a.defaults[p]) || '';
  if (cxAiModelsFor !== p) cxRequestAiModels(p);
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
