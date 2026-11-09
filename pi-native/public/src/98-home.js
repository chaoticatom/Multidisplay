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
    if (e.key === 'Escape' && menuOpen && window.innerWidth > 768 && !document.querySelector('.tm-modal:not([hidden])')) toggleMenu();
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
  document.querySelector('[data-ht="full"]')?.addEventListener('click', () => { if (menuOpen) toggleMenu(); });
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
  wireDayNext();
  wireTabsNext();
  wireSetupCards();
  hmRelabel();
  // Start on the cube, the menus tucked away.
  if (menuOpen) toggleMenu();
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
  // Colour swatches keep their own colour over the menu's button styles.
  document.querySelectorAll('#nx .nx-pal [data-pal]:not([data-bg])').forEach((b) => { const bg = b.style.background; if (bg) { b.style.setProperty('background', bg, 'important'); b.dataset.bg = '1'; } });
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
  const first = (st.genre || '').split(',')[0].trim().toLowerCase(), t = ((st.genre || '') + ' ' + (st.name || '')).toLowerCase();
  return (first && MX_GENRES.find((g) => g.re.test(first))) || MX_GENRES.find((g) => g.re.test(t)) || MX_MORE;
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
  else if (shown === 'search') { list = search?.query === 'genres:' ? [] : search?.results || []; note = search?.searching ? 'Searching…' : search?.error ? 'Search failed: ' + search.error : 'Search for a name, genre or city.'; }
  else {
    // Featured: the built-in stations plus the most-played ones worldwide,
    // fetched once so every genre has something in it.
    list = [...RADIO_STATIONS, ...(search && !search.searching && search.query === 'genres:' ? search.results || [] : [])];
    if (!_mxgTopAsked && search?.query !== 'genres:' && document.body.dataset.tab === 'music' && menuOpen) { _mxgTopAsked = true; send({ cmd: 'radioSearch', query: 'genres:' }); }
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

// ── Day page (next gen): each timer kind gets an icon and a colour; the
// quick-add buttons become icon tiles.
const TM_ICON = {
  wake: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"/>',
  start: '<path d="M7 4l13 8-13 8z"/>',
  winddown: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  off: '<path d="M12 3v9"/><path d="M6.4 7.6a8 8 0 1 0 11.2 0"/>',
};
function wireDayNext() {
  const LABEL = { wake: 'Wake up', start: 'Switch on', winddown: 'Wind down', off: 'Turn off' };
  document.querySelectorAll('.tm-quick [data-quick]').forEach((b) => { const k = b.dataset.quick; if (TM_ICON[k]) { b.dataset.kind = k; b.innerHTML = `<span class="tm-ico">${svgIcon(TM_ICON[k], 16)}</span><span>${LABEL[k]}</span><span class="tm-plus">+</span>`; } });
  const add = document.getElementById('alarm-add-btn'); if (add) add.innerHTML = svgIcon('<path d="M12 5v14M5 12h14"/>', 14) + '<span>New timer</span>';
}

// ── Now, Scenes and Faces (next gen). Now: the playing effect and recent
// ones on the left, colours / its options / dials / overlays on the right
// (the nodes are moved, so every handler stays). Plain one-word sub-tab
// names. The Draw pop-up: tools on the left, a big canvas on the right.
function wireTabsNext() {
  if (typeof SUB_LABEL === 'object') {
    for (const k of Object.keys(SUB_LABEL)) SUB_LABEL[k] = SUB_LABEL[k].replace(/^[^\p{L}\p{N}]+/u, '');
    SUB_LABEL['Draw on a Face'] = 'Faces';
  }
  const body = document.querySelector('#now-section > .section-body'), nx = document.getElementById('nx');
  if (body && nx && !nx.querySelector('.nx-l')) {
    const L = document.createElement('div'), R = document.createElement('div');
    L.className = 'nx-l'; R.className = 'nx-r';
    const q = (s) => body.querySelector(s);
    L.append(...['.nx-hero', '#last-change', '.nx-quick', '.nx-recent'].map(q).filter(Boolean));
    R.append(...['.nx-pal', '#now-options', '#now-no-options', '.nx-dials', '.nx-ov'].map(q).filter(Boolean));
    nx.append(L, R); // still inside #nx, which syncNowV2() looks them up in
  }
  // Colour swatches keep their own colour over the menu's button styles.
  const sheet = document.querySelector('#draw-modal .tm-sheet'), cv = document.getElementById('draw-canvas');
  if (sheet && cv && !sheet.querySelector('.dm-tools')) {
    const tools = document.createElement('div'); tools.className = 'dm-tools';
    const rest = [...sheet.children].filter((x) => x !== cv && !x.classList.contains('tm-top'));
    tools.append(...rest);
    const stage = document.createElement('div'); stage.className = 'dm-stage'; stage.append(cv);
    sheet.append(tools, stage);
  }
}

// ── Setup tabs (next gen): each heading and the controls under it become a
// card with a coloured icon, two across on a wide page. Nodes are moved, not
// rebuilt, so every control keeps its handlers and ids.
const SETUP_ICON = [
  [/restart|reboot/i, '#FF7A7A', '<path d="M12 3v9"/><path d="M6.4 7.6a8 8 0 1 0 11.2 0"/>'],
  [/pin|lock|guest/i, '#FFD24C', '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'],
  [/update|software|version/i, '#7FE6FF', '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'],
  [/backup|restore/i, '#7CF2D0', '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M12 12v9M8 17l4 4 4-4"/>'],
  [/notif|message|alert/i, '#C9A6FF', '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/>'],
  [/app|install/i, '#5EE08A', '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M11 18h2"/>'],
  [/alexa|skill|echo/i, '#7FE6FF', '<circle cx="12" cy="12" r="9"/><path d="M8 12a4 4 0 0 1 8 0"/>'],
  [/\bai\b|assistant|model|key/i, '#FF9EC4', '<path d="M12 3c4.97 0 9 3.13 9 7s-4.03 7-9 7c-1 0-2-.13-2.9-.37L4 19l1.4-3.6C4 14.1 3 12.6 3 10c0-3.87 4.03-7 9-7z"/>'],
  [/wifi|wi-fi|network|internet|remote|tunnel|cloudflare/i, '#6FA8FF', '<path d="M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1"/>'],
  [/bluetooth|speaker|sound|audio/i, '#6FA8FF', '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>'],
  [/night|sleep|dim/i, '#C9D1FF', '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>'],
  [/panel|face|cube|wall|layout|chain/i, '#7FE6FF', '<path d="M12 2 21 7v10l-9 5-9-5V7z"/><path d="M12 12 21 7M12 12 3 7M12 12v10"/>'],
  [/look|quality|colour|color|bright/i, '#C9A6FF', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"/>'],
  [/change|fade|transition|crossfade/i, '#9BE89A', '<path d="M4 12h16M12 4l8 8-8 8"/>'],
  [/timing|delay|sync/i, '#FFD24C', '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'],
  [/react|music|play|dj|mix/i, '#FF9EC4', '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'],
  [/preview|view/i, '#9BE89A', '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'],
];
function setupIconFor(text) {
  const hit = SETUP_ICON.find(([re]) => re.test(text));
  return hit || ['#8892A6', '#8892A6', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'];
}
function setupCardHead(title) {
  const [, c, icon] = setupIconFor(title);
  const h = document.createElement('div'); h.className = 'sc-head'; h.style.setProperty('--c', c);
  h.innerHTML = `<span class="sc-ico">${svgIcon(icon, 20)}</span><b></b>`;
  h.querySelector('b').textContent = title.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  return h;
}
// Split one container's children into cards at each heading.
function cardify(box, firstTitle) {
  if (!box || box.dataset.cards) return;
  box.dataset.cards = '1';
  const kids = [...box.children];
  let card = null;
  const start = (title, headEl) => {
    card = document.createElement('div'); card.className = 'sc-card';
    card.append(setupCardHead(title));
    if (headEl) { headEl.classList.add('sc-was-head'); card.append(headEl); }
    box.append(card);
  };
  for (const k of kids) {
    if (k.matches('.ui-label-accent')) { start(k.textContent, k); continue; }
    if (k.matches('.dgroups, .dgroup, #dgroups')) { box.append(k); continue; } // Display's own switcher and groups stay as they are
    if (!card) start(firstTitle, null);
    card.append(k);
  }
  box.classList.add('sc-grid');
}
// Music's Auto-DJ and Sound cards, and the timer / message pop-ups' sections:
// the same icon header as the Setup cards.
function iconHeads() {
  document.querySelectorAll('.mx-card > .mx-h:not([data-ic])').forEach((h) => {
    h.dataset.ic = '1';
    const head = setupCardHead(h.textContent.replace(/^\d+\s*·\s*/, ''));
    if (/what to play|play/i.test(h.textContent)) head.style.setProperty('--c', '#FF9EC4');
    h.replaceWith(head); head.classList.add('mx-h');
  });
}
function wireSetupCards() {
  iconHeads();
  document.querySelectorAll('#sidebar-scroll > .sidebar-section').forEach((sec) => {
    const head = sec.querySelector(':scope > .section-head'), body = sec.querySelector(':scope > .section-body');
    if (!head || !body || sec.id === 'setup-home') return;
    const name = head.textContent.replace(/[◈▾]/g, '').trim();
    if (!/^(Display|AI assistant|Alexa|System)$/.test(name)) return;
    if (name === 'Display') body.querySelectorAll('.dgroup').forEach((g) => cardify(g, (g.dataset.dgroup || 'Display').replace(/^./, (c) => c.toUpperCase())));
    else cardify(body, name);
  });
}

// ── Short labels: long settings text cut to a word or two (the full
// wording stays as a hover title). Only the text is changed, so every
// control keeps its handler and its checkbox.
const HM_RELABEL = [
  ['#setup-layout-btn', 'Edit layout'],
  ['#identify-panels-btn', 'Panel numbers'],
  ['#pwa-install-btn', 'Install app'],
  ['label:has(#acc-local)', 'No PIN at home'],
  ['label:has(#acc-guests)', 'Guest view from outside'],
  ['label:has(#alexa-chk)', 'Use with Alexa'],
  ['label:has(.au-sync-auto-el)', 'Auto sync'],
  ['label:has(#draw-slideshow)', 'Slideshow when idle'],
  ['.size-btn[data-size="8"]', 'Cube 8'],
];
function hmRelabel() {
  for (const [sel, text] of HM_RELABEL) {
    document.querySelectorAll(sel).forEach((el) => {
      if (el.dataset.relabelled) return;
      const tn = [...el.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
      if (!tn) return;
      el.title = el.title || el.textContent.trim();
      tn.textContent = ' ' + text;
      el.dataset.relabelled = '1';
    });
  }
  // Long how-to notes fold away behind a small "How" link.
  document.querySelectorAll('#alexa-help, #pwa-help, #ai-help').forEach((n) => {
    if (n.closest('details.hm-how') || !n.parentNode) return;
    const d = document.createElement('details'); d.className = 'hm-how';
    const s = document.createElement('summary'); s.textContent = 'How it works';
    n.before(d); d.append(s, n);
  });
}
