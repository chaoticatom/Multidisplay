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
  grid.querySelectorAll('[data-sx]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.sx; if (id === 'panels' || id === 'look' || id === 'speaker') spOpen(id); else sxOpen(SX_TILES.find((t) => t.id === id)); }));
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
  const box = document.getElementById('day-strip'); if (!box || _dayDragging) return;
  const dp = currentState.prefs?.dayPlan, st = (dp && dp.starts) || { morning: 6, day: 10, evening: 18, night: 23 };
  box.classList.toggle('off', !(dp && dp.on));
  // Segments from midnight: night (to morning), morning, day, evening, night again.
  const seq = [['night', 0, st.morning], ['morning', st.morning, st.day], ['day', st.day, st.evening], ['evening', st.evening, st.night], ['night', st.night, 24]].filter(([, a, b]) => b > a);
  const bar = box.querySelector('.day-bar');
  bar.replaceChildren(...seq.map(([part, a, b]) => { const c = DAY_PARTS.find((x) => x[0] === part); const d = document.createElement('div'); d.style.flex = String(b - a); d.style.background = c[1]; d.style.color = c[2]; d.title = part + ' ' + a + ':00 – ' + b + ':00'; if (b - a >= 3) d.textContent = part[0].toUpperCase() + part.slice(1); return d; }));
  const now = new Date(), h = now.getHours() + now.getMinutes() / 60, line = document.createElement('i'); line.className = 'day-now'; line.style.left = (h / 24 * 100) + '%';
  bar.append(line);
  // Drag a border to change when that part of the day starts (whole hours).
  for (const part of ['morning', 'day', 'evening', 'night']) {
    const e = document.createElement('span'); e.className = 'day-edge'; e.style.left = (st[part] / 24 * 100) + '%';
    e.title = 'Drag: ' + part + ' starts ' + st[part] + ':00'; e.setAttribute('aria-label', part + ' starts at ' + st[part] + ':00');
    e.addEventListener('pointerdown', (ev) => dayDrag(ev, part, e, bar));
    bar.append(e);
  }
}
let _dayDragging = false;
function dayDrag(ev, part, edge, bar) {
  ev.preventDefault(); edge.setPointerCapture(ev.pointerId); _dayDragging = true; edge.classList.add('drag');
  const dp = currentState.prefs?.dayPlan || {}, st = { morning: 6, day: 10, evening: 18, night: 23, ...(dp.starts || {}) };
  const order = ['morning', 'day', 'evening', 'night'], i = order.indexOf(part);
  const lo = i ? st[order[i - 1]] + 1 : 1, hi = i < 3 ? st[order[i + 1]] - 1 : 23;
  const tip = document.createElement('span'); tip.className = 'day-tip'; bar.append(tip);
  const at = (x) => { const r = bar.getBoundingClientRect(); return Math.max(lo, Math.min(hi, Math.round((x - r.left) / r.width * 24))); };
  let hour = st[part];
  const move = (e) => { hour = at(e.clientX); edge.style.left = tip.style.left = (hour / 24 * 100) + '%'; tip.textContent = String(hour).padStart(2, '0') + ':00'; };
  move(ev);
  edge.onpointermove = move;
  edge.onpointerup = () => {
    edge.onpointermove = edge.onpointerup = null; _dayDragging = false; tip.remove();
    send({ cmd: 'setAutoShow', dayPlan: { ...dp, starts: { ...st, [part]: hour } } });
  };
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

// ── Double-tap (or double-click) a face of the 3D preview to give that face
// its own effect: a small picker, then the display switches to Custom Cube
// with that face set (the others keep theirs).
const FACE_LABEL = ['Front', 'Back', 'Right', 'Left', 'Top', 'Bottom'];
function wireFacePick() {
  const cv = document.getElementById('c'); if (!cv || typeof THREE === 'undefined') return;
  const ray = new THREE.Raycaster(), pt = new THREE.Vector2();
  const pickAt = (x, y) => {
    if (currentState.panelMode !== 'cube' || !camera) return;
    const r = cv.getBoundingClientRect(); pt.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pt, camera);
    const meshes = Object.entries(faceCanvases).map(([f, e]) => { e.mesh.userData.face = Number(f); return e.mesh; });
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit) openFacePicker(hit.object.userData.face, x, y);
  };
  cv.addEventListener('dblclick', (e) => pickAt(e.clientX, e.clientY));
  let lastTap = 0;
  cv.addEventListener('touchend', (e) => { const now = Date.now(), t = e.changedTouches[0]; if (now - lastTap < 320 && t) pickAt(t.clientX, t.clientY); lastTap = now; });
}
function openFacePicker(face, x, y) {
  document.getElementById('face-pick')?.remove();
  const box = document.createElement('div'); box.id = 'face-pick'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', FACE_LABEL[face] + ' face');
  box.style.left = Math.min(window.innerWidth - 270, Math.max(10, x - 130)) + 'px'; box.style.top = Math.min(window.innerHeight - 330, Math.max(10, y - 20)) + 'px';
  const head = document.createElement('div'); head.className = 'fp-head'; head.textContent = FACE_LABEL[face] + ' face';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '✕'; close.setAttribute('aria-label', 'Close'); close.addEventListener('click', () => box.remove()); head.append(close);
  const grid = document.createElement('div'); grid.className = 'fp-grid';
  const keys = Object.keys(effectNames || {}).filter((k) => !['custom_cube', 'draw', 'cam', 'easter_egg'].includes(k));
  grid.append(...keys.map((k) => { const b = document.createElement('button'); b.type = 'button'; b.title = effectNames[k]; b.setAttribute('aria-label', effectNames[k]); const th = cxStillThumb(k); const n = document.createElement('span'); n.textContent = effectNames[k]; b.append(th, n);
    b.addEventListener('click', () => { send({ cmd: 'setFaceEffect', face, effect: k }); if (currentState.effect !== 'custom_cube') send({ cmd: 'setEffect', effect: 'custom_cube' }); box.remove(); cxToast(FACE_LABEL[face] + ': ' + effectNames[k]); }); return b; }));
  box.append(head, grid);
  document.body.append(box);
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!box.contains(e.target)) { box.remove(); document.removeEventListener('pointerdown', off); } }), 0);
}

// The playing effect's tile in the effects grid shows the real cube, live
// (the front face as it arrives), instead of its canned loop.
function liveTileFrame(face, bytes) {
  if (face !== 0 || document.body.dataset.tab !== 'play') return;
  const tile = document.querySelector('#effects-body .effect-btn.cx-tile.active .cx-thumb'); if (!tile) return;
  const S = Math.round(Math.sqrt((bytes.length - 1) / 3)), W = tile.width, ctx = tile.getContext('2d'), img = ctx.createImageData(W, W), st = S / W;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const v = S - 1 - Math.floor(y * st), u = Math.floor(x * st), o = 1 + (v * S + u) * 3, p = (y * W + x) * 4; img.data[p] = bytes[o]; img.data[p + 1] = bytes[o + 1]; img.data[p + 2] = bytes[o + 2]; img.data[p + 3] = 255; }
  ctx.putImageData(img, 0, 0);
}

// ── Declutter: the menus with less text. Explanations fold behind an ⓘ you
// tap to read; long labels keep their first words (the rest is the hover /
// long-press hint); common slider names become icons. Run once the page is
// built, and again for panels added later.
const SLIDER_ICONS = {
  speed: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  intense: '<path d="M12 2c3 4 5 6.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-5 .5 2 1.5 3 3 3-1-3 0-5 0-8z"/>', density: '<circle cx="6" cy="6" r="2"/><circle cx="14" cy="8" r="2"/><circle cx="9" cy="15" r="2"/><circle cx="18" cy="17" r="2"/>',
  rate: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>', 'change every': '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>', blend: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
  width: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>', depth: '<path d="M12 2 21 7v10l-9 5-9-5V7z"/>', trail: '<path d="M4 18c4 0 4-6 8-6s4-6 8-6"/>', radius: '<circle cx="12" cy="12" r="9"/><path d="M12 12h9"/>', spin: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
};
function shortLabel(el) {
  if (el.dataset.dc) return; el.dataset.dc = '1';
  const txt = (el.textContent || '').trim(); if (txt.length <= 26) return;
  const cut = txt.search(/\s[-–—]\s|:\s|\s\(|\. /);
  if (cut < 4) return;
  const tn = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length > 20); if (!tn) return;
  el.title = el.title || txt; tn.textContent = txt.slice(0, cut).replace(/^[^\w]*\s/, (m) => m) + ' ';
}
function declutter(root = document.getElementById('sidebar-scroll')) {
  if (!root) return;
  // Explanations: behind an ⓘ (notes with an id are live status lines - left alone).
  root.querySelectorAll('.ui-note:not([id]):not([data-dc]), .ui-hint:not([id]):not([data-dc]), .ui-note-spaced:not([id]):not([data-dc])').forEach((n) => {
    if (n.closest('#nx, #sx, #mx, #face-pick')) return;
    n.dataset.dc = '1'; n.classList.add('dc-folded');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'dc-info'; b.setAttribute('aria-label', 'More about this'); b.setAttribute('aria-expanded', 'false'); b.textContent = 'i';
    b.addEventListener('click', () => { const open = n.classList.toggle('dc-open'); b.setAttribute('aria-expanded', String(open)); });
    n.before(b);
  });
  root.querySelectorAll('.ui-label-accent, .ov-row-label, .cx-row > span:first-child, .check-row > span, .ui-check-label').forEach(shortLabel);
  tileify(root); twoWordLabels(root);
  root.querySelectorAll('.slider-label:not([data-dc])').forEach((l) => {
    l.dataset.dc = '1';
    const key = (l.textContent || '').trim().toLowerCase(), ic = SLIDER_ICONS[key];
    if (!ic) return;
    l.title = l.textContent.trim(); l.setAttribute('aria-label', l.title); l.innerHTML = svgIcon(ic, 18); l.classList.add('dc-icon');
  });
}
function wireDeclutter() {
  declutter();
  // Panels moved into Now, timers and lists re-render: tidy what appears.
  let pend = false;
  new MutationObserver(() => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; declutter(); }); }).observe(document.getElementById('sidebar-scroll') || document.body, { childList: true, subtree: true });
}

// ── Icon tiles: every choice button in the menus and effect options shows a
// picture (an icon, or a swatch for a colour) over a label of a word or two;
// the full wording stays as its hint. Labels everywhere are capped at two
// words. (The rule from the effect-options mock-up, applied to all of them.)
const TILE_SWATCH = {
  rainbow: 'linear-gradient(90deg,#FF5E7A,#FFB86B,#7CF29A,#5DE1FF,#B57BFF)', gold: 'linear-gradient(90deg,#FFC24C,#FFE7A0)', 'gold & silver': 'linear-gradient(90deg,#FFC24C,#E8ECF4,#FFC24C)',
  'red white blue': 'linear-gradient(90deg,#FF3D57,#FFFFFF,#3D6BFF)', neon: 'linear-gradient(90deg,#FF2BD6,#7A3CFF,#2BFFF1)', ocean: 'linear-gradient(90deg,#03124a,#0b4fa3,#5fe6e0)', fire: 'linear-gradient(90deg,#3d0700,#ff4d00,#ffab1a)',
  pastel: 'linear-gradient(90deg,#FFB3C7,#FFE3A3,#B8F2C8,#B3D9FF)', matrix: 'linear-gradient(180deg,#003B12,#00FF66)', 'vu meter': 'linear-gradient(90deg,#22C55E,#FACC15,#EF4444)', multi: 'linear-gradient(90deg,#FF5E7A,#5DE1FF,#7CF29A)',
  red: '#EF4444', green: '#22C55E', blue: '#3B82F6', cyan: '#22D3EE', white: '#F2F4F8', black: '#000', 'over water': 'linear-gradient(180deg,#0B1530 0 60%,#0F3E6B 61%)', city: 'linear-gradient(180deg,#0B1530 0 55%,#05070D 56%)', 'open sky': 'linear-gradient(180deg,#0B1530,#1E2A55)',
  'game boy': 'linear-gradient(180deg,#9BBC0F,#306230)', 'zx spectrum': 'linear-gradient(90deg,#D70000,#D7D700,#00D700,#00D7D7)',
};
const TILE_ICON = {
  random: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>', 'sync show': '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/>',
  mixed: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="9" r="2"/><circle cx="11" cy="16" r="4"/>', classic: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3"/>', willow: '<path d="M12 4v4M12 8c-4 2-6 6-6 12M12 8c4 2 6 6 6 12M12 8v12"/>',
  shapes: '<path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/>', crackle: '<path d="M5 5h.01M12 4h.01M19 6h.01M7 12h.01M15 11h.01M4 18h.01M11 19h.01M19 17h.01"/>', rings: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="10"/>',
  small: '<circle cx="12" cy="12" r="3"/>', large: '<circle cx="12" cy="12" r="8"/>', huge: '<circle cx="12" cy="12" r="10"/>', full: '<rect x="3" y="3" width="18" height="18" rx="2"/>',
  on: '<path d="M20 6 9 17l-5-5"/>', off: '<path d="M18 6 6 18M6 6l12 12"/>', show: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', hide: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 22 12s-1.2 2.2-3.5 4M6.5 6.6C3.6 8.3 2 12 2 12s4 7 10 7c1.7 0 3.2-.5 4.5-1.2"/>',
  'every 2 min': '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>', 'on a big beat': '<path d="M3 12h4l3 8 4-16 3 8h4"/>', test: '<path d="M7 4l13 8-13 8z"/>',
  solid: '<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/>', striped: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>', wave: '<path d="M2 12c3-6 5-6 8 0s5 6 8 0 3-4 4-4"/>', falling: '<path d="M12 4v14M6 12l6 6 6-6"/>',
  center: '<circle cx="12" cy="12" r="2"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>', stacked: '<rect x="5" y="4" width="14" height="4" rx="1"/><rect x="5" y="10" width="14" height="4" rx="1"/><rect x="5" y="16" width="14" height="4" rx="1"/>',
  'cross faces': '<path d="M12 2 21 7v10l-9 5-9-5V7z"/><path d="M3 12h18"/>', 'own face': '<rect x="5" y="5" width="14" height="14" rx="2"/>', faces: '<path d="M12 2 21 7v10l-9 5-9-5V7z"/><path d="M12 12 21 7M12 12 3 7M12 12v10"/>',
  cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>', wipe: '<path d="M4 4h8v16H4z"/><path d="M16 4v16"/>', scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M3 12h18"/>', diag: '<path d="M4 20 20 4"/>',
  clean: '<path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6 7 18.2l1.9-5.8L4 8.8h6.1z"/>', alt: '<path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>', 'straight on': '<path d="M12 19V5M5 12l7-7 7 7"/>',
  'arcade crt': '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>', 'crt power-on': '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 10.5h8"/>',
};
const TILE_SKIP = '#nx, #sx, #mx, #face-pick, #studio-deck, #dgroups, #quality-chips, #bottom-chips, #view-chips, #tr-style, #tr-secs';
function twoWords(text) {
  const t = text.replace(/\s+/g, ' ').trim(), em = t.match(/^(\p{Extended_Pictographic}️?\s*)/u), lead = em ? em[1] : '';
  const words = t.slice(lead.length).split(' ');
  return words.length <= 2 ? t : lead + words.slice(0, 2).join(' ').replace(/[,:;.-]+$/, '');
}
function tileify(root) {
  root.querySelectorAll('.strobe-mode-btn:not([data-tile]), .spectrum-bands-btn:not([data-tile]), .au-theme-btn:not([data-tile]), .au-barmode-btn:not([data-tile]), .retro-game-btn:not([data-tile])').forEach((b) => {
    if (b.closest(TILE_SKIP)) return;
    b.dataset.tile = '1';
    const full = (b.textContent || '').replace(/\s+/g, ' ').trim(); if (!full) return;
    const key = full.replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase().replace('&amp;', '&');
    const label = twoWords(full.replace(/^[▶🎤]\s*/u, ''));
    if (!b.title) b.title = full; if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', full);
    const sw = TILE_SWATCH[key], ic = TILE_ICON[key] || TILE_ICON[key.split(' ')[0]];
    b.classList.add('icon-tile');
    const pic = document.createElement('span'); pic.className = 'it-pic'; pic.setAttribute('aria-hidden', 'true');
    if (sw) pic.style.background = sw;
    else if (ic) pic.innerHTML = svgIcon(ic, 22);
    else { pic.textContent = /^[\d°x.]+$/i.test(full) ? full : full.replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 1).toUpperCase(); pic.classList.add('it-letter'); }
    const lab = document.createElement('span'); lab.className = 'it-label'; lab.textContent = /^[\d°x.]+$/i.test(full) ? '' : label;
    b.replaceChildren(pic, lab);
  });
}
// Labels: two words at most (the full text is the hint).
function twoWordLabels(root) {
  root.querySelectorAll('.ov-row-label:not([data-tw]), .ui-label-accent:not([data-tw]), .cx-row > span:first-child:not([data-tw]), .check-row > span:not([data-tw]), .ui-check-label:not([data-tw]), .tm-label:not([data-tw])').forEach((el) => {
    if (el.closest(TILE_SKIP)) return;
    el.dataset.tw = '1';
    const tn = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()); if (!tn) return;
    const full = (el.textContent || '').replace(/\s+/g, ' ').trim(), short = twoWords(tn.textContent);
    if (short.length < tn.textContent.trim().length) { el.title = el.title || full; tn.textContent = short + ' '; }
  });
}

// ── Setup pages (Panels, Look, Speaker): open from the Setup tiles in place
// of the home grid, with a back button - icons and dials, a word or two each.
const FIX_CYCLE = ['', 'mirror', 'flip', 'rot180'], FIX_WORD = { '': 'As is', mirror: 'Mirror', flip: 'Flip', rot180: 'Turned' };
const NET = [[4, 1, 0], [3, 0, 1], [0, 1, 1], [2, 2, 1], [1, 3, 1], [5, 1, 2]]; // face, column, row
const LOOK_DIALS = [['bloom', 'Glow', '#7FE6FF'], ['vibrance', 'Colour', '#FF9EC4'], ['depth', 'Depth', '#C9A6FF'], ['smooth', 'Smooth', '#FFD24C']];
const TRANS = [['seamless', 'Seamless', 'linear-gradient(90deg,#2B7BFF,#B57BFF)'], ['fade', 'Fade', 'linear-gradient(90deg,#2B7BFF,#0F141D)'], ['wipe', 'Wipe', 'linear-gradient(90deg,#2B7BFF 50%,#B57BFF 50%)'], ['dissolve', 'Dissolve', 'radial-gradient(#B57BFF 30%, transparent 32%) 0 0/8px 8px, #2B7BFF']];
const dialHTML = (id, label, color) => `<label class="nx-dial sp-dial" style="--c:${color}"><span class="nx-ring"><span class="nx-in"><b class="nx-val"></b></span></span><span class="sp-cap">${label}</span><input type="range" min="0" max="1" step="0.05" data-sp="${id}" aria-label="${label}"></label>`;
const tileHTML = (attr, label, inner, on) => `<div class="sp-t"><button type="button" ${attr} class="sp-tile${on ? ' on' : ''}" aria-label="${label}">${inner}</button><span>${label}</span></div>`;
let spPage = '';
function spOpen(page) {
  spPage = page;
  const box = document.getElementById('sp'), home = document.getElementById('sx'); if (!box) return;
  home.hidden = !!page; box.hidden = !page;
  if (!page) return;
  box.innerHTML = `<div class="sp-head"><button type="button" class="sp-back" aria-label="Back">${svgIcon('<path d="M15 18 9 12l6-6"/>', 18)}</button><span>${{ panels: 'Panels', look: 'Look', speaker: 'Speaker' }[page]}</span></div><div class="sp-body"></div>`;
  box.querySelector('.sp-back').addEventListener('click', () => spOpen(''));
  const body = box.querySelector('.sp-body'), cube = '<path d="M12 2 21 7v10l-9 5-9-5V7z"/><path d="M12 12 21 7M12 12 3 7M12 12v10"/>';
  if (page === 'panels') {
    body.innerHTML = `<div class="sp-row3">${tileHTML('data-pa="cube"', 'Cube', svgIcon(cube, 32))}${tileHTML('data-pa="flat"', 'Flat', svgIcon('<rect x="2" y="6" width="9" height="9" rx="1"/><rect x="13" y="6" width="9" height="9" rx="1"/>', 32))}${tileHTML('data-pa="layout"', 'Layout', svgIcon('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><path d="M17 13v8M13 17h8"/>', 32))}</div>
      <div class="sp-card cube-only"><span class="sp-kick">Orientation</span><div class="sp-net">${NET.map(([f, c, r]) => `<button type="button" data-face="${f}" style="grid-column:${c + 1};grid-row:${r + 1}"><b>${FACE_LABEL[f]}</b><i></i></button>`).join('')}</div></div>
      <div class="sp-row3">${tileHTML('data-pa="numbers"', 'Numbers', '<b class="sp-big">123</b>')}${tileHTML('data-pa="signal"', 'Signal', svgIcon('<path d="M2 12h3l3-8 4 16 3-8h7"/>', 24))}${tileHTML('data-pa="view"', 'View', svgIcon('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 24))}</div>
      <div class="sp-views" hidden>${[['all', 'All'], ['fr', 'Front+Right'], ['rb', 'Right+Back'], ['bl', 'Back+Left'], ['lf', 'Left+Front']].map(([v, l]) => `<button type="button" data-view="${v}">${l}</button>`).join('')}</div>`;
    body.querySelector('[data-pa="cube"]').addEventListener('click', () => document.querySelector('.size-btn[data-size="64"]:not([data-mode])')?.click());
    body.querySelector('[data-pa="flat"]').addEventListener('click', () => document.getElementById('panel2d-btn')?.click());
    body.querySelector('[data-pa="layout"]').addEventListener('click', () => document.getElementById('setup-layout-btn')?.click());
    body.querySelector('[data-pa="numbers"]').addEventListener('click', () => document.getElementById('identify-panels-btn')?.click());
    body.querySelector('[data-pa="signal"]').addEventListener('click', () => { spOpen(''); sxOpen({ sub: 'Display', dg: 'panels', find: 'Panel signal' }); });
    body.querySelector('[data-pa="view"]').addEventListener('click', () => { const v = body.querySelector('.sp-views'); v.hidden = !v.hidden; });
    body.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => send({ cmd: 'setCubeView', view: b.dataset.view })));
    body.querySelectorAll('[data-face]').forEach((b) => b.addEventListener('click', () => { const f = Number(b.dataset.face), cur = (currentState.faceFix || [])[f] || ''; send({ cmd: 'setFaceFix', face: f, fix: FIX_CYCLE[(FIX_CYCLE.indexOf(cur) + 1) % FIX_CYCLE.length] }); }));
  } else if (page === 'look') {
    body.innerHTML = `<div class="sp-row4">${LOOK_DIALS.map(([k, l, c]) => dialHTML(k, l, c)).join('')}</div>
      <span class="sp-kick">Detail</span><div class="sp-row3">${tileHTML('data-q2="auto"', 'Auto', svgIcon('<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/>', 24))}${tileHTML('data-q2="smooth"', 'Smooth', svgIcon('<path d="M2 12c3-6 5-6 8 0s5 6 8 0 3-4 4-4"/>', 24))}${tileHTML('data-q2="detailed"', 'Detailed', svgIcon('<path d="M3 3h4v4H3zM10 3h4v4h-4zM17 3h4v4h-4zM3 10h4v4H3zM10 10h4v4h-4zM17 10h4v4h-4zM3 17h4v4H3zM10 17h4v4h-4zM17 17h4v4h-4z"/>', 24))}</div>
      <span class="sp-kick">Change</span><div class="sp-row4">${TRANS.map(([k, l, bg]) => tileHTML(`data-tr2="${k}" style="background:${bg}"`, l, '')).join('')}</div>
      <div class="sp-line"><span class="sp-ico" style="background:#1A1E45;color:#C9D1FF">${svgIcon('<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>', 18)}</span><span class="sp-grow">Night dim</span><span class="sp-dim" data-night-hours></span><button type="button" class="cx-switch" data-night aria-label="Night dim on or off"></button></div>`;
    body.querySelectorAll('[data-sp]').forEach((inp) => inp.addEventListener('input', () => { spPaint(inp, Number(inp.value)); send({ cmd: 'setLook', [inp.dataset.sp]: Number(inp.value) }); }));
    body.querySelectorAll('[data-q2]').forEach((b) => b.addEventListener('click', () => send({ cmd: 'setQuality', quality: b.dataset.q2 })));
    body.querySelectorAll('[data-tr2]').forEach((b) => b.addEventListener('click', () => send({ cmd: 'setTransition', style: b.dataset.tr2 })));
    body.querySelector('[data-night]').addEventListener('click', () => send({ cmd: 'setNightDim', on: !currentState.prefs?.nightDim?.on }));
  } else if (page === 'speaker') {
    body.innerHTML = `<div class="sp-card sp-spk"><span class="sp-spk-ico">${svgIcon('<rect x="6" y="2" width="12" height="20" rx="3"/><circle cx="12" cy="14" r="3"/><circle cx="12" cy="6.5" r="1"/>', 28)}</span><div class="sp-grow"><b data-spk-name></b><span data-spk-state></span></div></div>
      <div class="sp-row2">${dialHTML('vol', 'Volume', '#7FE6FF')}<label class="nx-dial sp-dial" style="--c:#FF9EC4"><span class="nx-ring"><span class="nx-in"><b class="nx-val"></b></span></span><span class="sp-cap">Sync ms</span><input type="range" min="0" max="600" step="10" data-sp="sync" aria-label="Speaker sync"></label></div>
      <span class="sp-kick">Paired</span><div class="sp-paired"></div>
      <button type="button" class="sp-cta" data-find>${svgIcon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 20)}Find speakers</button>`;
    body.querySelector('[data-sp="vol"]').addEventListener('input', (e) => { spPaint(e.target, Number(e.target.value)); send({ cmd: 'setMasterVolume', value: Number(e.target.value) }); });
    body.querySelector('[data-sp="sync"]').addEventListener('input', (e) => { spPaint(e.target, Number(e.target.value), 600, (v) => String(v)); setEffectOption('radio', 'syncMs', Number(e.target.value)); });
    body.querySelector('[data-find]').addEventListener('click', () => { send({ cmd: 'btScan' }); spOpen(''); sxOpen({ tab: 'music', find: 'Bluetooth' }); });
    send({ cmd: 'btStatus' });
  }
  syncSetupPages();
}
function spPaint(inp, v, max = 1, fmt = (x) => String(Math.round(x * 100))) {
  const d = inp.closest('.nx-dial'); d.style.setProperty('--p', Math.round(Math.max(0, Math.min(1, v / max)) * 100) + '%'); d.querySelector('.nx-val').textContent = fmt(v);
}
function syncSetupPages() {
  const box = document.getElementById('sp'); if (!box || !spPage) return;
  const s = currentState;
  if (spPage === 'panels') {
    box.querySelector('[data-pa="cube"]')?.classList.toggle('on', s.panelMode === 'cube');
    box.querySelector('[data-pa="flat"]')?.classList.toggle('on', s.panelMode !== 'cube');
    box.querySelectorAll('[data-face]').forEach((b) => { const fx = (s.faceFix || [])[Number(b.dataset.face)] || ''; b.classList.toggle('on', !!fx); b.querySelector('i').textContent = FIX_WORD[fx]; });
    box.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === (s.prefs?.view || 'all')));
  } else if (spPage === 'look') {
    const look = s.prefs?.look || {};
    box.querySelectorAll('[data-sp]').forEach((inp) => { if (document.activeElement === inp) return; const v = Number(look[inp.dataset.sp] ?? 0.5); inp.value = v; spPaint(inp, v); });
    box.querySelectorAll('[data-q2]').forEach((b) => b.classList.toggle('on', b.dataset.q2 === (s.prefs?.quality || 'auto')));
    box.querySelectorAll('[data-tr2]').forEach((b) => b.classList.toggle('on', b.dataset.tr2 === (s.prefs?.transition?.style || 'seamless')));
    const n = s.prefs?.nightDim || {};
    box.querySelector('[data-night]')?.classList.toggle('on', !!n.on);
    const h = box.querySelector('[data-night-hours]'); if (h) h.textContent = String(n.from ?? 22).padStart(2, '0') + '–' + String(n.to ?? 7).padStart(2, '0');
  } else if (spPage === 'speaker') {
    const list = typeof btPairedCache !== 'undefined' ? btPairedCache || [] : [], on = list.find((d) => d.connected);
    const nm = box.querySelector('[data-spk-name]'), st = box.querySelector('[data-spk-state]');
    if (nm) { nm.textContent = on ? on.name || on.mac : 'No speaker'; st.textContent = on ? '● Connected' : 'Not connected'; st.className = on ? 'sp-ok' : 'sp-dim'; }
    const vol = box.querySelector('[data-sp="vol"]'); if (vol && document.activeElement !== vol) { const v = s.prefs?.volume ?? 1; vol.value = v; spPaint(vol, v); }
    const sy = box.querySelector('[data-sp="sync"]'); if (sy && document.activeElement !== sy) { const v = s.effectOptions?.radio?.syncMs ?? 200; sy.value = v; spPaint(sy, v, 600, (x) => String(x)); }
    const pl = box.querySelector('.sp-paired');
    if (pl) pl.replaceChildren(...list.filter((d) => !d.connected).map((d) => { const r = document.createElement('div'); r.className = 'sp-line'; const dot = document.createElement('span'); dot.className = 'sp-dot'; const n = document.createElement('span'); n.className = 'sp-grow'; n.textContent = d.name || d.mac; const b = document.createElement('button'); b.type = 'button'; b.className = 'sp-small'; b.textContent = 'Connect'; b.addEventListener('click', () => send({ cmd: 'btSetOutput', mac: d.mac })); r.append(dot, n, b); return r; }));
  }
}
