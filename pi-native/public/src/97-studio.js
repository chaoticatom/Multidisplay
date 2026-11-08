// ── Studio (v2 layout) ─────────────────────────────────────────────────
// On a wide screen the page becomes a studio round the cube: a rail of five
// areas on the left (Now, Effects, Music, Day, Setup - the old tab bar and
// its sub-tabs), the controls column beside it, and the stage: a header
// with what's playing and an Ask box, the 3D cube, an unfolded map of all
// six faces, a transport bar (previous / surprise me / next / speed) and a
// dock with the music and brightness. Every control here drives the same
// commands as the menu ones; phones keep the sheet layout.

const STUDIO_RAIL = [
  { id: 'now', tab: 'play', sub: 'Now', label: 'Now', icon: '<path d="M6 4l14 8-14 8z"/>' },
  { id: 'effects', tab: 'play', sub: 'Effects', label: 'Effects', icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>' },
  { id: 'music', tab: 'music', label: 'Music', icon: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' },
  { id: 'day', tab: 'schedule', label: 'Day', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  { id: 'setup', tab: 'setup', label: 'Setup', icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>' },
];
const svgIcon = (body, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

function studioPickSub(tab, sub) {
  if (sub) { try { const m = JSON.parse(localStorage.getItem('subtab') || '{}'); m[tab] = sub; localStorage.setItem('subtab', JSON.stringify(m)); } catch (e) { /* storage unavailable */ } }
  setTab(tab);
  syncStudio();
}

function wireStudio() {
  const rail = document.getElementById('studio-rail');
  if (!rail) return;
  rail.querySelector('.studio-items').innerHTML = STUDIO_RAIL.map((r) => `<button type="button" class="studio-item" data-rail="${r.id}" aria-label="${r.label}">${svgIcon(r.icon)}<span>${r.label}</span></button>`).join('');
  rail.querySelectorAll('[data-rail]').forEach((b) => b.addEventListener('click', () => { const r = STUDIO_RAIL.find((x) => x.id === b.dataset.rail); studioPickSub(r.tab, r.sub); }));
  // Header: the Ask box hands its text to the menu's own Ask (same handling).
  const ask = document.getElementById('studio-ask');
  ask?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && ask.value.trim()) { const t = ask.value.trim(); ask.value = ''; document.getElementById('cx-ask').value = t; cxSubmit(t); } });
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && ask) { e.preventDefault(); ask.focus(); } });
  document.getElementById('studio-panels')?.addEventListener('click', () => document.getElementById('panels-off-btn')?.click());
  // Transport.
  const keys = () => Object.keys(effectNames || {}).filter((k) => k !== 'draw' && k !== 'custom_cube' && k !== 'cam');
  const step = (d) => { const k = keys(), i = k.indexOf(currentState.effect); if (k.length) send({ cmd: 'setEffect', effect: k[(i + d + k.length) % k.length] }); };
  document.getElementById('studio-prev')?.addEventListener('click', () => step(-1));
  document.getElementById('studio-next')?.addEventListener('click', () => step(1));
  document.getElementById('studio-surprise')?.addEventListener('click', () => { const k = keys().filter((x) => x !== currentState.effect); if (k.length) send({ cmd: 'setEffect', effect: k[Math.floor(Math.random() * k.length)] }); });
  const spd = document.getElementById('studio-speed');
  spd?.addEventListener('input', () => send({ cmd: 'setSpeed', value: Number(spd.value) }));
  const br = document.getElementById('studio-bright');
  br?.addEventListener('input', () => send({ cmd: 'setBrightness', value: Number(br.value) }));
  document.getElementById('studio-stop')?.addEventListener('click', () => { send({ cmd: 'radioStop' }); if (typeof radioBrowserStop === 'function') radioBrowserStop(); });
  document.getElementById('studio-music')?.addEventListener('click', () => studioPickSub('music'));
  // Tap a face on the map: Setup > Display, where each face's orientation is set.
  document.getElementById('studio-map')?.addEventListener('click', () => studioPickSub('setup', 'Display'));
}

// The menu's own sliders know the command shapes; mirror their values.
function syncStudio() {
  const s = currentState;
  if (!document.getElementById('studio-rail')) return;
  const tab = document.body.dataset.tab || 'play';
  let sub = ''; try { sub = JSON.parse(localStorage.getItem('subtab') || '{}')[tab] || ''; } catch (e) { /* storage unavailable */ }
  document.querySelectorAll('#studio-rail [data-rail]').forEach((b) => {
    const r = STUDIO_RAIL.find((x) => x.id === b.dataset.rail);
    const on = r.tab === tab && (!r.sub || r.sub === sub || (r.sub === 'Now' && !sub));
    b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  const name = document.getElementById('studio-name');
  if (name) name.textContent = s.blank ? 'Display off' : (effectNames && effectNames[s.effect]) || s.effect || '';
  const lc = s.lastChange, chip = document.getElementById('studio-changed');
  if (chip) {
    if (lc && lc.by !== 'You' && lc.effect === s.effect) { const d = new Date(lc.at); chip.textContent = 'Changed by ' + lc.by + ' · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); chip.hidden = false; } else chip.hidden = true;
  }
  const pb = document.getElementById('studio-panels');
  if (pb) { pb.querySelector('.dot').classList.toggle('off', !!s.panelsOff); pb.querySelector('.txt').textContent = s.panelsOff ? 'Panels off' : 'Panels on'; }
  const spd = document.getElementById('studio-speed'); if (spd && document.activeElement !== spd && Number.isFinite(s.speed)) spd.value = s.speed;
  const br = document.getElementById('studio-bright'); if (br && document.activeElement !== br && Number.isFinite(s.brightness)) br.value = s.brightness;
  const fps = document.getElementById('studio-detail'); if (fps) fps.textContent = 'Detail: ' + ({ auto: 'Auto', smooth: 'Smooth', detailed: 'Detailed' }[s.prefs?.quality || 'auto']);
  // Dock: the Auto-DJ track, else the radio station, else nothing playing.
  const dj = s.dj, r = (s.effectStatus && s.effectStatus.radio) || {}, t1 = document.getElementById('studio-track'), t2 = document.getElementById('studio-track2');
  if (t1 && t2) {
    if (dj && dj.on && dj.now) { t1.textContent = 'Auto-DJ · ' + (dj.now.title || ''); t2.textContent = dj.next ? 'Next: ' + (dj.next.title || '') + (dj.mixing ? ' · mixing now' : '') : ''; }
    else if (r.playing && r.station) { t1.textContent = r.station.name || 'Radio'; t2.textContent = r.title || ''; }
    else { t1.textContent = 'Nothing playing'; t2.textContent = 'Music: radio, Auto-DJ or your own'; }
  }
  document.getElementById('studio-map')?.toggleAttribute('hidden', s.panelMode !== 'cube');
}

// The unfolded cube: each face as it arrives, drawn at half size into a
// cross (top above the front, the four sides in a row, bottom below).
const STUDIO_NET = { 4: [1, 0], 3: [0, 1], 0: [1, 1], 2: [2, 1], 1: [3, 1], 5: [1, 2] }; // face -> [column, row]
let _studioImg = null;
function studioNoteFrame(face, bytes) {
  const cv = document.getElementById('studio-map-canvas'); if (!cv || currentState.panelMode !== 'cube') return;
  const cell = STUDIO_NET[face]; if (!cell) return;
  const S = Math.round(Math.sqrt((bytes.length - 1) / 3)), half = 32, step = S / half, ctx = cv.getContext('2d');
  if (!_studioImg) _studioImg = ctx.createImageData(half, half);
  const d = _studioImg.data;
  for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) {
    const v = S - 1 - Math.floor(y * step), u = Math.floor(x * step), o = 1 + (v * S + u) * 3, p = (y * half + x) * 4;
    d[p] = bytes[o]; d[p + 1] = bytes[o + 1]; d[p + 2] = bytes[o + 2]; d[p + 3] = 255;
  }
  ctx.putImageData(_studioImg, cell[0] * (half + 2), cell[1] * (half + 2));
}

// ── Phone: the Remote (see the mock-up). Under 769px the page is the live
// cube with a header (effect name, power), a Now panel (Ask, a swipeable row
// of effect cards, brightness and speed, the music) and a bottom tab bar.
// Now shows that panel; the other tabs open the menu sheet on their area.
const isPhone = () => window.innerWidth <= 768;
function studioPhoneTab(id) {
  const r = STUDIO_RAIL.find((x) => x.id === id); if (!r) return;
  if (id === 'now') { if (menuOpen) toggleMenu(); }
  else { studioPickSub(r.tab, r.sub); if (!menuOpen) toggleMenu(); }
  syncStudio();
}
function wireStudioPhone() {
  const tabs = document.getElementById('studio-tabs'); if (!tabs) return;
  tabs.innerHTML = STUDIO_RAIL.map((r) => `<button type="button" data-ptab="${r.id}">${svgIcon(r.icon, 22)}<span>${r.label}</span></button>`).join('');
  tabs.querySelectorAll('[data-ptab]').forEach((b) => b.addEventListener('click', () => studioPhoneTab(b.dataset.ptab)));
  const ask = document.getElementById('studio-mask');
  ask?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && ask.value.trim()) { const t = ask.value.trim(); ask.value = ''; document.getElementById('cx-ask').value = t; cxSubmit(t); ask.blur(); } });
  document.getElementById('studio-mpower')?.addEventListener('click', () => document.getElementById('clear-all-btn')?.click());
  const br = document.getElementById('studio-mbright'), sp = document.getElementById('studio-mspeed');
  br?.addEventListener('input', () => send({ cmd: 'setBrightness', value: Number(br.value) }));
  sp?.addEventListener('input', () => send({ cmd: 'setSpeed', value: Number(sp.value) }));
  document.getElementById('studio-mstop')?.addEventListener('click', () => { send({ cmd: 'radioStop' }); if (typeof radioBrowserStop === 'function') radioBrowserStop(); });
  document.getElementById('studio-mall')?.addEventListener('click', () => studioPhoneTab('effects'));
  // Start on Now: the cube and the Now panel, the sheet tucked away.
  if (isPhone() && menuOpen) toggleMenu();
}
// The swipe deck: the playing effect, then favourites, then the rest.
let _deckKey = '';
function syncStudioPhone() {
  const s = currentState, deck = document.getElementById('studio-deck');
  document.querySelectorAll('#studio-tabs [data-ptab]').forEach((b) => {
    const r = STUDIO_RAIL.find((x) => x.id === b.dataset.ptab), tab = document.body.dataset.tab || 'play';
    let sub = ''; try { sub = JSON.parse(localStorage.getItem('subtab') || '{}')[tab] || ''; } catch (e) { /* storage unavailable */ }
    const on = r.id === 'now' ? !menuOpen : menuOpen && r.tab === tab && (!r.sub || r.sub === sub);
    b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  const nm = document.getElementById('studio-mname'); if (nm) nm.textContent = s.blank ? 'Display off' : (effectNames && effectNames[s.effect]) || s.effect || '';
  const pw = document.getElementById('studio-mpower'); if (pw) pw.classList.toggle('off', !!s.blank);
  const br = document.getElementById('studio-mbright'); if (br && document.activeElement !== br && Number.isFinite(s.brightness)) br.value = s.brightness;
  const sp = document.getElementById('studio-mspeed'); if (sp && document.activeElement !== sp && Number.isFinite(s.speed)) sp.value = s.speed;
  const t1 = document.getElementById('studio-track'), m1 = document.getElementById('studio-mtrack'), m2 = document.getElementById('studio-mtrack2');
  if (m1 && t1) { m1.textContent = t1.textContent; m2.textContent = document.getElementById('studio-track2').textContent; }
  if (!deck || !effectNames) return;
  const all = Object.keys(effectNames).filter((k) => !['draw', 'custom_cube', 'cam'].includes(k));
  const favs = (s.prefs?.favourites || []).filter((k) => effectNames[k]);
  const order = [...new Set([s.effect, ...favs, ...all])].filter((k) => effectNames[k]).slice(0, 24);
  const key = JSON.stringify([order, s.effect, !!_cxThumbData]);
  if (key === _deckKey) return;
  _deckKey = key;
  deck.replaceChildren(...order.map((k) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'studio-card' + (k === s.effect ? ' on' : '');
    const th = cxStillThumb(k); th.classList.add('studio-card-img');
    const n = document.createElement('span'); n.textContent = effectNames[k];
    b.append(th, n); b.addEventListener('click', () => send({ cmd: 'setEffect', effect: k }));
    return b;
  }));
}

// ── Menus v2: Now. Pictures first: the effect itself big, palettes as
// swatches, speed / music / brightness as dials, quick actions and overlays
// as icon tiles, recent effects as thumbnails (see the menu mock-ups).
const NX_PALS = ['auto', 'sunset', 'ocean', 'neon', 'ember', 'aurora', 'forest', 'candy', 'ice'];
const NX_OVERLAYS = [
  { key: 'snow', label: 'Snow', icon: '<path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9"/>' },
  { key: 'stars', label: 'Stars', icon: '<path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/>' },
  { key: 'sparkle', label: 'Sparkle', icon: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>' },
  { key: 'meteors', label: 'Meteors', icon: '<path d="M4 20 20 4M9 20 20 9M4 15 15 4"/>' },
  { key: 'edgeglow', label: 'Edge glow', icon: '<rect x="3" y="3" width="18" height="18" rx="3"/>' },
  { key: 'mist', label: 'Mist', icon: '<path d="M3 9h18M3 13h14M7 17h14"/>' },
];
const NX_DIALS = [
  { id: 'speed', label: 'Speed', color: '#7FE6FF', icon: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', min: 0.1, max: 3, step: 0.05, get: (s) => s.speed ?? 1, set: (v) => send({ cmd: 'setSpeed', value: v }), fmt: (v) => v.toFixed(1) + '×' },
  { id: 'music', label: 'Music reaction', color: '#FF9EC4', icon: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', min: 0, max: 1, step: 0.05, get: (s) => (s.musicReact?.on ? s.musicReact.amount ?? 0.6 : 0), set: (v) => send({ cmd: 'setMusicReact', on: v > 0.02, amount: v }), fmt: (v) => (v < 0.02 ? 'Off' : Math.round(v * 100) + '%') },
  { id: 'bright', label: 'Brightness', color: '#FFD24C', icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"/>', min: 0.1, max: 1.5, step: 0.05, get: (s) => s.brightness ?? 1, set: (v) => send({ cmd: 'setBrightness', value: v }), fmt: (v) => Math.round(v / 1.5 * 100) + '%' },
];
function wireNowV2() {
  const box = document.getElementById('nx'); if (!box) return;
  const pal = box.querySelector('.nx-pal');
  pal.innerHTML = NX_PALS.map((k) => `<button type="button" data-pal="${k}" aria-label="${(CX_PALETTES[k] || [k])[0]} colours" style="background:${(CX_PALETTES[k] || ['', '#333'])[1]}"></button>`).join('');
  pal.querySelectorAll('[data-pal]').forEach((b) => b.addEventListener('click', () => send({ cmd: 'setLook', palette: b.dataset.pal, on: true })));
  const dials = box.querySelector('.nx-dials');
  dials.innerHTML = NX_DIALS.map((d) => `<label class="nx-dial" style="--c:${d.color}"><span class="nx-ring"><span class="nx-in">${svgIcon(d.icon, 20)}</span></span><b class="nx-val"></b><input type="range" min="${d.min}" max="${d.max}" step="${d.step}" data-dial="${d.id}" aria-label="${d.label}"></label>`).join('');
  dials.querySelectorAll('[data-dial]').forEach((inp) => inp.addEventListener('input', () => { const d = NX_DIALS.find((x) => x.id === inp.dataset.dial); d.set(Number(inp.value)); paintDial(inp, d, Number(inp.value)); }));
  const q = box.querySelector('.nx-quick');
  q.querySelector('[data-q="draw"]').addEventListener('click', () => document.getElementById('draw-open')?.click());
  q.querySelector('[data-q="note"]').addEventListener('click', () => document.getElementById('note-open')?.click());
  q.querySelector('[data-q="party"]').addEventListener('click', () => send({ cmd: 'startParty', minutes: currentState.party ? 0 : 30 }));
  q.querySelector('[data-q="bed"]').addEventListener('click', () => { document.getElementById('cx-ask').value = 'calm bedtime'; cxSubmit('calm bedtime'); });
  const ov = box.querySelector('.nx-ov');
  ov.innerHTML = NX_OVERLAYS.map((o) => `<button type="button" data-ov="${o.key}" aria-label="${o.label}" title="${o.label}">${svgIcon(o.icon, 22)}</button>`).join('');
  ov.querySelectorAll('[data-ov]').forEach((b) => b.addEventListener('click', () => send({ cmd: 'setOverlay', key: b.dataset.ov, enabled: !currentState.overlays?.[b.dataset.ov]?.on })));
  box.querySelector('[data-nx="fav"]').addEventListener('click', () => send({ cmd: 'toggleFavourite', effect: currentState.effect }));
  box.querySelector('[data-nx="save"]').addEventListener('click', () => { const n = prompt('Name this scene', effectNames[currentState.effect] || ''); if (n && n.trim()) send({ cmd: 'saveScene', name: n.trim() }); });
}
function paintDial(inp, d, v) {
  const lab = inp.closest('.nx-dial'), f = (v - d.min) / (d.max - d.min);
  lab.style.setProperty('--p', Math.round(Math.max(0, Math.min(1, f)) * 100) + '%');
  lab.querySelector('.nx-val').textContent = d.fmt(v);
}
let _nxHeroKey = '', _nxRecentKey = '';
function syncNowV2() {
  const box = document.getElementById('nx'); if (!box || !effectNames) return;
  const s = currentState, k = s.effect;
  const heroKey = k + '|' + !!_cxThumbData;
  if (heroKey !== _nxHeroKey) {
    _nxHeroKey = heroKey;
    const img = box.querySelector('.nx-hero-img'), th = cxStillThumb(k); th.className = 'nx-hero-cv';
    img.replaceChildren(th);
    box.querySelector('.nx-name').textContent = effectNames[k] || k || '';
  }
  box.querySelector('[data-nx="fav"]').classList.toggle('on', (s.prefs?.favourites || []).includes(k));
  const pal = s.prefs?.look?.palette || 'auto';
  box.querySelectorAll('.nx-pal [data-pal]').forEach((b) => b.classList.toggle('on', b.dataset.pal === pal));
  box.querySelectorAll('[data-dial]').forEach((inp) => { if (document.activeElement === inp) return; const d = NX_DIALS.find((x) => x.id === inp.dataset.dial), v = Number(d.get(s)); inp.value = v; paintDial(inp, d, v); });
  box.querySelectorAll('.nx-ov [data-ov]').forEach((b) => b.classList.toggle('on', !!s.overlays?.[b.dataset.ov]?.on));
  box.querySelector('[data-q="party"]').classList.toggle('on', !!s.party);
  let list = []; try { list = JSON.parse(localStorage.getItem('recentFx') || '[]'); } catch (e) { /* storage unavailable */ }
  list = list.filter((x) => effectNames[x]).slice(0, 5);
  const rk = list.join(',') + '|' + !!_cxThumbData;
  if (rk !== _nxRecentKey) {
    _nxRecentKey = rk;
    box.querySelector('.nx-recent').replaceChildren(...list.map((x) => { const b = document.createElement('button'); b.type = 'button'; b.title = effectNames[x]; b.setAttribute('aria-label', effectNames[x]); b.className = x === k ? 'on' : ''; const cv = cxStillThumb(x); b.append(cv); b.addEventListener('click', () => send({ cmd: 'setEffect', effect: x })); return b; }));
  }
}

// ── Menus v2: Setup home. A tile per area (icon + one word), opening the
// right Setup tab, Display group or part of System; live health gauges.
const SX_TILES = [
  { id: 'panels', label: 'Panels', c: '#7FE6FF', g: '#10283A', sub: 'Display', dg: 'panels', icon: '<path d="M12 2 21 7v10l-9 5-9-5V7z"/><path d="M12 12 21 7M12 12 3 7M12 12v10"/>' },
  { id: 'look', label: 'Look', c: '#C9A6FF', g: '#2A1F3A', sub: 'Display', dg: 'look', icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' },
  { id: 'changes', label: 'Changes', c: '#9BE89A', g: '#1E2A1A', sub: 'Display', dg: 'changes', icon: '<path d="M4 12h16M12 4l8 8-8 8"/>' },
  { id: 'night', label: 'Night', c: '#C9D1FF', g: '#1A1E45', sub: 'Display', dg: 'night', icon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>' },
  { id: 'speaker', label: 'Speaker', c: '#6FA8FF', g: '#10203A', tab: 'music', find: 'Bluetooth', icon: '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>' },
  { id: 'ai', label: 'AI', c: '#FF9EC4', g: '#2E1A35', sub: 'AI assistant', icon: '<path d="M12 3c4.97 0 9 3.13 9 7s-4.03 7-9 7c-1 0-2-.13-2.9-.37L4 19l1.4-3.6C4 14.1 3 12.6 3 10c0-3.87 4.03-7 9-7z"/>' },
  { id: 'alexa', label: 'Alexa', c: '#7FE6FF', g: '#10283A', sub: 'Alexa', icon: '<circle cx="12" cy="12" r="9"/><path d="M8 12a4 4 0 0 1 8 0"/>' },
  { id: 'pin', label: 'PIN', c: '#FFD24C', g: '#2A2A1A', sub: 'System', find: 'Control PIN', icon: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>' },
  { id: 'backup', label: 'Backup', c: '#7CF2D0', g: '#1A2A2A', sub: 'System', find: 'Backup', icon: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M12 12v9M8 17l4 4 4-4"/>' },
];
function sxOpen(t) {
  studioPickSub(t.tab || 'setup', t.sub);
  if (t.dg) document.querySelector(`#dgroups [data-dg="${t.dg}"]`)?.click();
  if (t.find) setTimeout(() => { const el = [...document.querySelectorAll('#sidebar-scroll .ui-label-accent, #sidebar-scroll .ov-row-label, #sidebar-scroll .ui-note-spaced')].find((x) => x.offsetParent && x.textContent.includes(t.find)); if (el) cxScrollMenuTo(el); }, 60);
}
function wireSetupV2() {
  const box = document.getElementById('sx'); if (!box) return;
  const grid = box.querySelector('.sx-grid');
  grid.innerHTML = SX_TILES.map((t) => `<button type="button" data-sx="${t.id}" style="--c:${t.c};--g:${t.g}">${svgIcon(t.icon, 30)}<span>${t.label}</span><i class="sx-dot" hidden></i></button>`).join('');
  grid.querySelectorAll('[data-sx]').forEach((b) => b.addEventListener('click', () => sxOpen(SX_TILES.find((t) => t.id === b.dataset.sx))));
  box.querySelector('[data-sxa="update"]').addEventListener('click', () => { sxOpen({ sub: 'System', find: 'Software update' }); document.getElementById('update-check-btn')?.click(); });
  box.querySelector('[data-sxa="restart"]').addEventListener('click', () => document.getElementById('restart-app-btn')?.click());
  box.querySelector('[data-sxa="reboot"]').addEventListener('click', () => document.getElementById('reboot-pi-btn')?.click());
  setInterval(syncSetupGauges, 1000);
}
function sxGauge(el, frac, text, color) {
  if (!el) return;
  el.style.setProperty('--p', Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%');
  if (color) el.style.setProperty('--c', color);
  el.querySelector('b').textContent = text;
}
function syncSetupGauges() {
  const box = document.getElementById('sx'); if (!box || box.offsetParent === null) return;
  const d = typeof _lastDiag === 'object' && _lastDiag ? _lastDiag : null;
  const fps = d && Number.isFinite(d.fps) ? d.fps : null, t = d && Number.isFinite(d.tempC) ? d.tempC : null;
  sxGauge(box.querySelector('[data-g="fps"]'), fps === null ? 0 : fps / 60, fps === null ? '–' : String(Math.round(fps)), fps !== null && fps < 30 ? '#FFB86B' : '#5EE08A');
  sxGauge(box.querySelector('[data-g="temp"]'), t === null ? 0 : (t - 30) / 55, t === null ? '–' : Math.round(t) + '°', t !== null && t > 75 ? '#FF7A7A' : t !== null && t > 65 ? '#FFB86B' : '#7FE6FF');
  const u = currentState.update, ok = !u || !u.available;
  const ug = box.querySelector('[data-g="ver"]');
  if (ug) { ug.classList.toggle('warn', !ok); ug.querySelector('b').textContent = ok ? '✓' : '↑'; box.querySelector('[data-gl="ver"]').textContent = typeof APP_VERSION === 'string' ? APP_VERSION : ''; }
  // Green dots: the speaker connected, the AI on, Alexa on.
  const dot = (id, on) => { const i = box.querySelector(`[data-sx="${id}"] .sx-dot`); if (i) i.hidden = !on; };
  dot('speaker', typeof btPairedCache !== 'undefined' && (btPairedCache || []).some((x) => x.connected)); // from the last Bluetooth status
  dot('alexa', !!currentState.alexa?.on);
  dot('pin', !!currentState.controlPinSet);
}

// ── Menus v2: an Effects spotlight (the newest cube effect, big, with Play)
// and the Day plan as a 24-hour strip with a "now" line.
const FX_SPOTLIGHT = ['rubiks', 'aquarium'];
let _spotKey = '';
function syncEffectsV2() {
  const sp = document.getElementById('fx-spot'); if (!sp || !effectNames) return;
  const pick = FX_SPOTLIGHT.filter((k) => effectNames[k])[Math.floor(Date.now() / 86400000) % FX_SPOTLIGHT.length] || FX_SPOTLIGHT[0];
  const key = pick + '|' + !!_cxThumbData + '|' + currentState.effect;
  if (key === _spotKey) return;
  _spotKey = key;
  const img = sp.querySelector('.fx-spot-img'), cv = cxStillThumb(pick); img.replaceChildren(cv);
  sp.querySelector('.fx-spot-name').textContent = effectNames[pick] || pick;
  const play = sp.querySelector('button'); play.dataset.fx = pick; play.textContent = currentState.effect === pick ? 'Playing' : 'Play';
}
function wireEffectsV2() {
  document.querySelector('#fx-spot button')?.addEventListener('click', (e) => send({ cmd: 'setEffect', effect: e.currentTarget.dataset.fx }));
}
const DAY_PARTS = [['night', '#2B2245', '#C9B8FF'], ['morning', '#4A3A20', '#FFD9A0'], ['day', '#123A4A', '#A6EEFF'], ['evening', '#3A1F3A', '#FFB8E6']];
function syncDayV2() {
  const box = document.getElementById('day-strip'); if (!box) return;
  const dp = currentState.prefs?.dayPlan, st = (dp && dp.starts) || { morning: 6, day: 10, evening: 18, night: 23 };
  box.classList.toggle('off', !(dp && dp.on));
  // Segments from midnight: night (to morning), morning, day, evening, night again.
  const seq = [['night', 0, st.morning], ['morning', st.morning, st.day], ['day', st.day, st.evening], ['evening', st.evening, st.night], ['night', st.night, 24]].filter(([, a, b]) => b > a);
  const bar = box.querySelector('.day-bar');
  bar.replaceChildren(...seq.map(([part, a, b]) => { const c = DAY_PARTS.find((x) => x[0] === part); const d = document.createElement('div'); d.style.flex = String(b - a); d.style.background = c[1]; d.style.color = c[2]; d.title = part + ' ' + a + ':00 – ' + b + ':00'; if (b - a >= 3) d.textContent = part[0].toUpperCase() + part.slice(1); return d; }));
  const now = new Date(), h = now.getHours() + now.getMinutes() / 60, line = document.createElement('i'); line.className = 'day-now'; line.style.left = (h / 24 * 100) + '%';
  bar.append(line);
}

// ── Menus v2: Music. One player card on top: the Auto-DJ's track (or the
// radio station), its progress with the next track lined up in pink, big
// controls, and the next few songs (tap one to play it next).
const fmtT = (s) => (Number.isFinite(s) && s >= 0 ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '');
function wireMusicV2() {
  const box = document.getElementById('mx'); if (!box) return;
  box.querySelector('[data-mx="play"]').addEventListener('click', () => {
    const dj = currentState.dj, r = currentState.effectStatus?.radio;
    if ((dj && dj.on) || (r && r.playing)) { send({ cmd: 'radioStop' }); if (typeof radioBrowserStop === 'function') radioBrowserStop(); }
    else send({ cmd: 'djStart' });
  });
  box.querySelector('[data-mx="seek"]').addEventListener('click', (e) => {
    const n = currentState.dj?.now; if (!n || !n.dur) return;
    const r = e.currentTarget.getBoundingClientRect(); send({ cmd: 'djSeek', sec: (e.clientX - r.left) / r.width * n.dur });
  });
  setInterval(tickMusicV2, 500);
}
function tickMusicV2() {
  const box = document.getElementById('mx'); if (!box || box.offsetParent === null) return;
  const n = currentState.dj?.on ? currentState.dj.now : null;
  const pos = n ? Math.min(n.dur, n.pos + (Date.now() - (n.at || Date.now())) / 1000) : 0;
  box.querySelector('.mx-fill').style.width = n && n.dur ? (pos / n.dur * 100) + '%' : '0%';
  box.querySelector('[data-mx="t0"]').textContent = n ? fmtT(pos) : '';
  box.querySelector('[data-mx="t1"]').textContent = n ? fmtT(n.dur) : '';
}
let _mxQueueKey = '';
function syncMusicV2() {
  const box = document.getElementById('mx'); if (!box) return;
  const dj = currentState.dj, r = currentState.effectStatus?.radio || {}, on = dj && dj.on && dj.now;
  const kick = box.querySelector('.mx-kicker'), title = box.querySelector('.mx-title'), sub = box.querySelector('.mx-sub'), nx = box.querySelector('.mx-next');
  if (on) {
    kick.textContent = dj.mixing ? 'Auto-DJ · mixing' : 'Auto-DJ';
    title.textContent = dj.now.title || '';
    sub.textContent = [dj.now.bpm ? dj.now.bpm + ' BPM' : '', dj.now.key || ''].filter(Boolean).join(' · ');
    nx.textContent = dj.next && dj.next.title ? (dj.mixing ? 'Blending into ' : 'Next: ') + dj.next.title : '';
  } else if (r.playing && r.station) {
    kick.textContent = 'Radio'; title.textContent = r.station.name || ''; sub.textContent = r.title || ''; nx.textContent = '';
  } else { kick.textContent = 'Nothing playing'; title.textContent = 'Start the Auto-DJ'; sub.textContent = ''; nx.textContent = ''; }
  box.classList.toggle('live', !!(on || r.playing));
  box.querySelector('[data-mx="play"]').setAttribute('aria-label', on || r.playing ? 'Stop' : 'Start the Auto-DJ');
  box.querySelector('.mx-seek-row').hidden = !on;
  const q = on && Array.isArray(dj.queue) ? dj.queue.map((t, i) => ({ t, i })).filter(({ i }) => i > dj.nowIdx).slice(0, 4) : [];
  const key = JSON.stringify(q.map(({ t, i }) => [i, t.title, i === dj.nextIdx]));
  if (key !== _mxQueueKey) {
    _mxQueueKey = key;
    box.querySelector('.mx-queue').replaceChildren(...q.map(({ t, i }) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mx-q' + (i === dj.nextIdx ? ' next' : '');
      const n = document.createElement('b'); n.textContent = i === dj.nextIdx ? '▶' : String(i - dj.nowIdx);
      const s = document.createElement('span'); s.textContent = t.title || '';
      b.append(n, s); b.title = 'Play next'; b.addEventListener('click', () => send({ cmd: 'djNext', index: i }));
      return b;
    }));
  }
  tickMusicV2();
}
