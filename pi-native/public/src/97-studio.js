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
