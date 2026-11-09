// ── Home layout (A + B quiet) ───────────────────────────────────────────
// Desktop: a search bar on top, the live cube in a big rounded tile, a slim
// column beside it (thin brightness / volume / speed sliders, five small
// round buttons, the music strip) and a dock (favourite effects, then All
// effects, Music, Day, Setup and power). There is no sidebar: each dock
// button turns the main area into that page, and the live cube moves to a
// preview card at the top of the column, so every page shows what's on the
// display. Phones: search, the cube tile with four small buttons on it, two
// thin sliders, the music strip and the bottom bar; a tab's page fills the
// screen under a live preview strip.
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
  if (window.innerWidth <= 768) ask.placeholder = 'Search or ask';
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
    power: () => hmOff(),
  };
  document.querySelectorAll('[data-hx]').forEach((b) => b.addEventListener('click', () => ({ blank: hmBlank, mute: hmMute, off: hmOff })[b.dataset.hx]()));
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
  wireMusicNext();
  // Start on the cube, the menus tucked away.
  if (menuOpen && (window.innerWidth >= 1024 || window.innerWidth <= 768)) toggleMenu();
  document.body.classList.toggle('hm-sheet', menuOpen);
  window.addEventListener('resize', () => syncHome());
  setTimeout(resizeRenderer, 50);
}
// Blank: the panels go dark, the music carries on (tap again: back on).
function hmBlank() { send({ cmd: 'setPanelsOff', on: !currentState.panelsOff }); }
// Mute: volume to 0, remembering the level; tap again to restore it.
function hmMute() {
  const v = Number(currentState.prefs?.volume ?? 0.5);
  if (v > 0.001) { try { localStorage.setItem('hmVol', String(v)); } catch (e) { /* storage blocked */ } send({ cmd: 'setMasterVolume', value: 0 }); }
  else { let back = 0.5; try { back = Number(localStorage.getItem('hmVol')) || 0.5; } catch (e) { /* storage blocked */ } send({ cmd: 'setMasterVolume', value: back }); }
}
// Off: the display and the music both stop (clearAll does both); when it's
// already off, the last effect comes back on.
function hmOff() {
  if (currentState.blank) { send({ cmd: 'setEffect', effect: currentState.effect || 'plasma' }); if (currentState.panelsOff) send({ cmd: 'setPanelsOff', on: false }); return; }
  send({ cmd: 'clearAll' }); if (typeof radioBrowserStop === 'function') radioBrowserStop();
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
    if (!inp || document.activeElement === inp) continue;
    if (Number.isFinite(v)) inp.value = v;
    hmRange(inp); document.getElementById(id + '-v').textContent = hmVal[id](Number(inp.value));
  }
  // Every menu slider shows its fill too.
  document.querySelectorAll('#sidebar input[type=range]').forEach(hmRange);
  const favs = s.prefs?.favourites || [];
  document.querySelectorAll('[data-hq="fav"]').forEach((b) => b.classList.toggle('on', favs.includes(s.effect)));
  document.querySelectorAll('[data-hq="party"]').forEach((b) => b.classList.toggle('on', !!s.party));
  document.querySelectorAll('[data-hd="power"]').forEach((b) => b.classList.toggle('off', !!s.blank));
  const xs = { blank: !!s.panelsOff, mute: Number(s.prefs?.volume ?? 1) <= 0.001, off: !!s.blank };
  document.querySelectorAll('[data-hx]').forEach((b) => { const on = xs[b.dataset.hx]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
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
  mxgSync();
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

// ── Music page (next gen): stations as picture cards grouped by genre.
// The Radio pane's lists (Mine, Recent, Featured, search / Top 60) keep their
// logic in 50-radio-audio.js and 95-main-ui.js; in the home layout they're
// hidden and #mxg draws whichever one is showing as genre rows instead.
const MX_GENRES = [
  { name: 'Chill & lo-fi', c: '#FF9EC4', re: /chill|lo-?fi|ambient|downtempo|lounge|relax|drone|space|easy|sleep|meditat|mellow/ },
  { name: 'Electronic', c: '#7FE6FF', re: /electr|house|techno|trance|dance|edm|synth|drum|dnb|beat|club|dubstep/ },
  { name: 'Jazz & soul', c: '#FFD24C', re: /jazz|soul|blues|funk|r&b|rnb|swing|motown/ },
  { name: 'Rock & indie', c: '#FF7A7A', re: /rock|indie|alternative|metal|punk|americana|country|folk|grunge/ },
  { name: 'Pop & hits', c: '#C9A6FF', re: /pop|hits|top ?40|80s|90s|70s|oldies|chart|disco/ },
  { name: 'Classical', c: '#9BE89A', re: /classic(al)?\b|orchestra|opera|baroque|piano|symphon/ },
  { name: 'News & talk', c: '#B9C2D3', re: /news|talk|sport|speech|public radio|bbc radio 4/ },
];
const MX_MORE = { name: 'More', c: '#8892A6' };
function mxGenreOf(st) {
  const t = ((st.genre || '') + ' ' + (st.name || '')).toLowerCase();
  return MX_GENRES.find((g) => g.re.test(t)) || MX_MORE;
}
// A steady colour per station, in its genre's family.
function mxCardBg(st, g) {
  let h = 0; for (const ch of st.name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `linear-gradient(135deg, ${g.c}, color-mix(in oklab, hsl(${(h >> 3) % 360} 70% 35%) 55%, #0A0C11))`;
}
function mxCard(st, current) {
  const g = mxGenreOf(st), on = current && current.url === st.url;
  const fav = (currentState.prefs?.stations || []).some((x) => x.url === st.url);
  const b = document.createElement('div'); b.className = 'mxg-card' + (on ? ' on' : ''); b.setAttribute('role', 'button'); b.tabIndex = 0;
  b.title = st.name + (st.genre ? ' · ' + st.genre : '');
  b.innerHTML = `<span class="mxg-art" style="background:${mxCardBg(st, g)}"><span class="mxg-ini">${escHtml((st.name || '?').replace(/^(somafm|radio)\s+/i, '').slice(0, 2))}</span><button type="button" class="mxg-fav${fav ? ' on' : ''}" aria-label="${fav ? 'Remove from' : 'Add to'} My stations">★</button><span class="mxg-play">${on ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>'}</span></span><b>${escHtml(st.name)}</b><small>${escHtml(st.genre || '')}</small>`;
  const play = () => {
    if (on) { send({ cmd: 'radioStop' }); if (typeof radioBrowserStop === 'function') radioBrowserStop(); return; }
    const s = { name: st.name, genre: st.genre || '', url: st.url };
    send({ cmd: 'radioPlay', station: s }); radioBrowserPlay(s);
  };
  b.addEventListener('click', play);
  b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
  b.querySelector('.mxg-fav').addEventListener('click', (e) => { e.stopPropagation(); send({ cmd: 'toggleStationFav', station: { name: st.name, genre: st.genre || '', url: st.url } }); });
  return b;
}
let _mxgKey = '', _mxgTopAsked = false;
function mxgSync() {
  const box = document.getElementById('mxg');
  if (!box || !document.body.classList.contains('hm')) return;
  const status = currentState.effectStatus?.radio || {}, current = status.playing ? status.station : null;
  const search = status.search, shown = document.querySelector('.mx-list:not([hidden])')?.dataset.mxl || 'featured';
  let list = [], note = '';
  if (shown === 'mine') { list = currentState.prefs?.stations || []; note = 'Tap ★ on any station to keep it here.'; }
  else if (shown === 'recent') { try { list = JSON.parse(localStorage.getItem('recentStations') || '[]'); } catch (e) { /* storage blocked */ } note = 'Stations you play show up here.'; }
  else if (shown === 'search') { list = search?.results || []; note = search?.searching ? 'Searching…' : search?.error ? 'Search failed: ' + search.error : 'Search for a name, genre or city.'; }
  else {
    // Featured: the built-in stations plus the most-played ones worldwide,
    // fetched once so every genre has something in it.
    list = [...RADIO_STATIONS, ...(search && !search.searching && !document.querySelector('.radio-search-input-el')?.value ? search.results || [] : [])];
    if (!_mxgTopAsked && !(search?.results || []).length && document.getElementById('sidebar')?.offsetParent !== null && document.body.dataset.tab === 'music') { _mxgTopAsked = true; send({ cmd: 'radioSearch', query: '' }); }
  }
  const seen = new Set(); list = list.filter((s) => s && s.url && !seen.has(s.url) && seen.add(s.url));
  const favs = (currentState.prefs?.stations || []).map((x) => x.url).join(',');
  const key = JSON.stringify([shown, list.map((s) => s.url), current?.url || '', favs, note]);
  if (key === _mxgKey) return;
  _mxgKey = key;
  if (!list.length) { box.replaceChildren(Object.assign(document.createElement('div'), { className: 'mxg-empty', textContent: note })); return; }
  const groups = new Map();
  for (const st of list) { const g = mxGenreOf(st); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(st); }
  const order = [...MX_GENRES, MX_MORE].filter((g) => groups.has(g));
  box.replaceChildren(...order.map((g) => {
    const sec = document.createElement('section'); sec.className = 'mxg-row';
    const head = document.createElement('div'); head.className = 'mxg-head';
    head.innerHTML = `<i style="background:${g.c};box-shadow:0 0 8px ${g.c}"></i><b>${g.name}</b><small>${groups.get(g).length}</small>`;
    const cards = document.createElement('div'); cards.className = 'mxg-cards';
    cards.append(...groups.get(g).map((st) => mxCard(st, current)));
    sec.append(head, cards);
    return sec;
  }));
}
// Source tabs as icon tiles.
function wireMusicNext() {
  const ICON = {
    radio: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>',
    dj: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
    sound: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  };
  const LABEL = { radio: 'Radio', dj: 'Auto-DJ', sound: 'Sound' };
  document.querySelectorAll('.mx-seg [data-mx]').forEach((b) => { const k = b.dataset.mx; if (ICON[k]) b.innerHTML = `<span class="mx-seg-i">${svgIcon(ICON[k], 22)}</span><span>${LABEL[k]}</span>`; });
  const pane = document.querySelector('.mx-pane[data-mx="radio"]'), filters = document.getElementById('mx-filters');
  if (pane && filters && !document.getElementById('mxg')) {
    const box = document.createElement('div'); box.id = 'mxg'; filters.after(box);
    const h = document.createElement('div'); h.className = 'mxg-title'; h.textContent = 'Radio'; pane.prepend(h);
  }
  document.querySelectorAll('#mx-filters [data-mxf], .mx-search .radio-search-btn-el').forEach((b) => b.addEventListener('click', () => setTimeout(mxgSync, 0)));
  document.querySelector('.mx-search .radio-search-input-el')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') setTimeout(mxgSync, 0); });
}
