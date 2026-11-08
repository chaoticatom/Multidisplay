// ── Home layout (A + B quiet) ───────────────────────────────────────────
// Desktop: a search bar on top, the live cube in a big rounded tile, a slim
// column beside it (thin brightness / volume / speed sliders, five small
// round buttons, the music strip) and a dock (favourite effects, then All
// effects, Music, Day, Setup and power). There is no sidebar: each dock
// button opens that menu as a sheet on the right, Setup opens wide. Phones:
// search, the cube tile with four small buttons on it, two thin sliders,
// the music strip and the bottom bar (whose menus open as the bottom sheet).
// The markup is in index.html (#hm-*); the preview centres the cube in
// #hm-stage (see homeStageRect() in 90-preview.js).

const HM_DOCK = { effects: 'effects', music: 'music', day: 'day', setup: 'setup' };
const hmRange = (inp) => { const f = (Number(inp.value) - Number(inp.min)) / (Number(inp.max) - Number(inp.min)); inp.style.setProperty('--f', Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'); };
const hmVal = {
  'hm-bright': (v) => Math.round(v / 1.5 * 100),
  'hm-vol': (v) => Math.round(v * 100),
  'hm-speed': (v) => v.toFixed(1) + '×',
};
// Which menu is showing: the rail entry for the current tab and sub-tab.
function hmCurrent() {
  if (!menuOpen) return '';
  const tab = document.body.dataset.tab || 'play';
  let sub = ''; try { sub = JSON.parse(localStorage.getItem('subtab') || '{}')[tab] || ''; } catch (e) { /* storage unavailable */ }
  const r = STUDIO_RAIL.find((x) => x.tab === tab && (!x.sub || x.sub === sub || (x.sub === 'Now' && !sub)));
  return r ? r.id : '';
}
// Open a menu as the sheet; the same button again closes it.
function hmOpen(id) {
  const r = STUDIO_RAIL.find((x) => x.id === id); if (!r) return;
  if (menuOpen && hmCurrent() === id) { toggleMenu(); return; }
  studioPickSub(r.tab, r.sub);
  if (!menuOpen) toggleMenu();
  syncHome();
}
function hmAsk(t) { document.getElementById('cx-ask').value = t; cxSubmit(t); }

function wireHome() {
  if (!document.getElementById('hm-col')) return;
  document.body.classList.add('hm');
  // Phones: the first tab is Home (the cube and these controls).
  const home = STUDIO_RAIL.find((x) => x.id === 'now');
  if (home) { home.label = 'Home'; home.icon = '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>'; }
  const ask = document.getElementById('hm-ask');
  ask.addEventListener('keydown', (e) => { if (e.key === 'Enter' && ask.value.trim()) { const t = ask.value.trim(); ask.value = ''; hmAsk(t); ask.blur(); } });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && ask.offsetParent) { e.preventDefault(); ask.focus(); }
    if (e.key === 'Escape' && menuOpen && window.innerWidth >= 1024 && !document.querySelector('.tm-modal:not([hidden])')) toggleMenu();
  });
  const cmd = { 'hm-bright': (v) => send({ cmd: 'setBrightness', value: v }), 'hm-vol': (v) => send({ cmd: 'setMasterVolume', value: v }), 'hm-speed': (v) => send({ cmd: 'setSpeed', value: v }) };
  Object.keys(cmd).forEach((id) => {
    const inp = document.getElementById(id); let queued = false;
    inp.addEventListener('input', () => {
      hmRange(inp); document.getElementById(id + '-v').textContent = hmVal[id](Number(inp.value));
      if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; cmd[id](Number(inp.value)); }); }
    });
  });
  const quick = {
    party: () => send({ cmd: 'startParty', minutes: currentState.party ? 0 : 30 }),
    bed: () => hmAsk('calm bedtime'),
    note: () => document.getElementById('note-open')?.click(),
    draw: () => document.getElementById('draw-open')?.click(),
    fav: () => send({ cmd: 'toggleFavourite', effect: currentState.effect }),
    power: () => document.getElementById('clear-all-btn')?.click(),
  };
  document.querySelectorAll('[data-hq]').forEach((b) => b.addEventListener('click', () => quick[b.dataset.hq]()));
  document.querySelector('[data-ht="prev"]').addEventListener('click', () => document.getElementById('studio-prev')?.click());
  document.querySelector('[data-ht="next"]').addEventListener('click', () => document.getElementById('studio-next')?.click());
  document.querySelector('[data-ht="opts"]').addEventListener('click', () => hmOpen('now'));
  document.querySelectorAll('[data-hd]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.hd === 'power') quick.power(); else hmOpen(HM_DOCK[b.dataset.hd]);
  }));
  document.querySelector('[data-hm="music"]').addEventListener('click', () => hmOpen('music'));
  // Playing: stop. Nothing playing: open Music to pick something.
  document.querySelector('[data-hm="play"]').addEventListener('click', () => {
    if (hmPlaying()) { send({ cmd: 'radioStop' }); if (typeof radioBrowserStop === 'function') radioBrowserStop(); }
    else hmOpen('music');
  });
  // Start on the cube, the menus tucked away.
  if (menuOpen && (window.innerWidth >= 1024 || window.innerWidth <= 768)) toggleMenu();
  document.body.classList.toggle('hm-sheet', menuOpen);
  window.addEventListener('resize', () => syncHome());
  setTimeout(resizeRenderer, 50);
}
function hmPlaying() {
  const s = currentState, r = (s.effectStatus && s.effectStatus.radio) || {};
  return !!((s.dj && s.dj.on && s.dj.now) || r.playing);
}

const HM_PLAY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
const HM_MUSIC = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
let _hmFavKey = '', _hmPlayKey = '';
function syncHome() {
  if (!document.body.classList.contains('hm')) return;
  const s = currentState;
  document.body.classList.toggle('hm-sheet', !!menuOpen);
  const nm = document.getElementById('hm-name');
  if (nm) nm.textContent = s.blank ? 'Display off' : (typeof effectNames === 'object' && effectNames && effectNames[s.effect]) || s.effect || '';
  const vals = { 'hm-bright': s.brightness, 'hm-vol': s.prefs?.volume, 'hm-speed': s.speed };
  for (const id of Object.keys(vals)) {
    const inp = document.getElementById(id), v = Number(vals[id]);
    if (!inp || !Number.isFinite(v) || document.activeElement === inp) continue;
    inp.value = v; hmRange(inp); document.getElementById(id + '-v').textContent = hmVal[id](v);
  }
  // Every menu slider shows its fill too.
  document.querySelectorAll('#sidebar input[type=range]').forEach(hmRange);
  const favs = s.prefs?.favourites || [];
  document.querySelectorAll('[data-hq="fav"]').forEach((b) => b.classList.toggle('on', favs.includes(s.effect)));
  document.querySelectorAll('[data-hq="party"]').forEach((b) => b.classList.toggle('on', !!s.party));
  document.querySelectorAll('[data-hq="power"], [data-hd="power"]').forEach((b) => b.classList.toggle('off', !!s.blank));
  const cur = hmCurrent();
  document.querySelectorAll('[data-hd]').forEach((b) => { const on = b.dataset.hd !== 'power' && HM_DOCK[b.dataset.hd] === cur; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  // Music strip: the same text as the old dock (syncStudio fills it).
  const t1 = document.getElementById('studio-track'), t2 = document.getElementById('studio-track2');
  if (t1) { document.getElementById('hm-t1').textContent = t1.textContent; document.getElementById('hm-t2').textContent = t2 ? t2.textContent : ''; }
  const playing = hmPlaying();
  if (String(playing) !== _hmPlayKey) {
    _hmPlayKey = String(playing);
    const pb = document.querySelector('[data-hm="play"]');
    pb.innerHTML = playing ? HM_PLAY : HM_MUSIC; pb.setAttribute('aria-label', playing ? 'Stop the music' : 'Choose music');
    document.querySelector('[data-hm="music"]').classList.toggle('spin', playing);
  }
  hmSyncSetup();
  // Dock: five favourites (or the first effects), the playing one outlined.
  const box = document.getElementById('hm-favs');
  if (!box || typeof effectNames !== 'object' || !effectNames) return;
  const all = Object.keys(effectNames).filter((k) => !['draw', 'custom_cube', 'cam'].includes(k));
  const keys = [...new Set([...favs.filter((k) => effectNames[k]), ...all])].slice(0, 5);
  const key = JSON.stringify([keys, s.effect, typeof _cxThumbData !== 'undefined' && !!_cxThumbData]);
  if (key === _hmFavKey) return;
  _hmFavKey = key;
  box.replaceChildren(...keys.map((k) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hm-fav' + (k === s.effect ? ' on' : '');
    b.title = effectNames[k]; b.setAttribute('aria-label', effectNames[k]);
    b.append(cxStillThumb(k)); b.addEventListener('click', () => send({ cmd: 'setEffect', effect: k }));
    return b;
  }));
}
// Setup tiles: a word of status under each name.
function hmSyncSetup() {
  const s = currentState, grid = document.querySelector('#sx .sx-grid'); if (!grid) return;
  const btOn = typeof btPairedCache !== 'undefined' && (btPairedCache || []).some((x) => x.connected);
  const st = {
    panels: [s.panelMode === 'wall' ? 'Wall' : s.panelMode === '2d' ? 'One panel' : 'Cube', false],
    look: [{ auto: 'Auto', smooth: 'Smooth', detailed: 'Detailed' }[s.prefs?.quality || 'auto'], false],
    speaker: [btOn ? 'Connected' : 'Not connected', btOn],
    alexa: [s.alexa?.on ? 'On' : 'Off', !!s.alexa?.on],
    pin: [s.controlPinSet ? 'Set' : 'Off', !!s.controlPinSet],
  };
  grid.querySelectorAll('[data-sx]').forEach((b) => {
    const v = st[b.dataset.sx]; let sm = b.querySelector('small');
    if (!v) { if (sm) sm.remove(); return; }
    const lab = b.querySelector(':scope > span'); if (!lab) return;
    if (!sm) { sm = document.createElement('small'); lab.append(sm); }
    if (sm.textContent !== v[0]) sm.textContent = v[0];
    sm.classList.toggle('ok', v[1]);
  });
}
