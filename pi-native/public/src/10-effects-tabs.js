// ---------------------------------------------------------------------
// Effect buttons - the sidebar markup already has every effect as a
// .effect-btn[data-effect] element; just wire the ones pi-native actually
// has a registered effect for, and grey out the rest.
// ---------------------------------------------------------------------
async function loadEffectNames() {
  // Relative, not root-absolute ('/effects.json') - both resolve the same
  // way when this page is served from a Pi's server root, but only the
  // relative form also works when the whole public/ folder is redeployed
  // under a URL subpath, as GitHub Pages' simulator build does (see
  // sim/README.md) - MULTIDISPLAY_SIM doesn't gate this on purpose, so the
  // Pi path stays exercised by the exact same code as the sim path.
  const resp = await fetch('effects.json');
  effectNames = await resp.json();
  document.querySelectorAll('.effect-btn[data-effect]').forEach((btn) => {
    const key = btn.dataset.effect;
    const panel = document.getElementById('panel-' + key);
    if (Object.prototype.hasOwnProperty.call(effectNames, key)) {
      btn.addEventListener('click', () => {
        // Leaving Video Display: only the selected effect is ticked, so the
        // video source would never tear itself down (causing flicker). Send
        // stopVideoSource, stop any browser camera/screen capture, and reset the
        // stored url so Video Display starts fresh if reselected.
        const wasRunning = currentState.effect === key && !currentState.blank;
        if (currentState.effect === 'video' && key !== 'video') {
          stopBrowserCapture();
          send({ cmd: 'stopVideoSource' });
          setEffectOption('video', 'source', 'url');
          setEffectOption('video', 'url', '');
        }
        send({ cmd: 'setEffect', effect: key });
        // Its options (e.g. Internet Radio's station list) live on the Now
        // tab - go there, or tapping an effect with options seemed to do
        // nothing (a real report: "nothing happens when I click internet radio").
        if (key === 'radio') setTab('music');
        // Settings open only when tapping the effect that's already running (or
        // via ⚙ Options) - jumping up on every pick meant scrolling back down
        // to the tiles each time.
        else if (panel && wasRunning) { setTab('play'); setTimeout(cxShowOptions, 60); }
        // Immediate feedback: the 'active' highlight only moves once the
        // Pi's state echo arrives, which can take a visible moment on a
        // busy Pi - mark this button pending until then (cleared in
        // syncEffectButtons()).
        document.querySelectorAll('.effect-btn.pending').forEach((b) => b.classList.remove('pending'));
        if (currentState.effect !== key) btn.classList.add('pending');
        if (btn.classList.contains('has-panel')) {
          // Same open/close convention as the original app: clicking an
          // already-open has-panel button just closes its panel; clicking
          // any other has-panel button opens its own and closes all others.
          const wasOpen = btn.classList.contains('open');
          document.querySelectorAll('.effect-btn.open').forEach((b) => b.classList.remove('open'));
          document.querySelectorAll('.effect-panel.open').forEach((p) => p.classList.remove('open'));
          if (!wasOpen) { btn.classList.add('open'); if (panel) panel.classList.add('open'); }
        }
      });
      // Most ported effects don't have their per-effect option controls
      // (city search, colour pickers, etc.) wired to a pi-native backend
      // command yet - grey those panels out so opening them doesn't imply
      // the controls inside do something they don't. Colour Rain and Light
      // Speed are the exception (wired below via WIRED_OPTION_PANELS).
      if (panel && !WIRED_OPTION_PANELS.has(key)) markUnsupported(panel, 'Effect options aren’t wired to the Pi-native engine yet.');
    } else {
      btn.classList.add('not-ported');
      btn.title = 'Not yet ported to the Pi-native engine';
      btn.disabled = true;
    }
  });
  syncEffectButtons();
}

// Shows the running effect under the page title, so it's visible without
// scrolling the long effects list to find the highlighted button.
function updateActiveEffectLabel() {
  // Now-playing pills under the title: the effect showing and the radio
  // station playing - each jumps to the tab that controls it.
  const el = document.getElementById('active-effect-label');
  if (!el) return;
  const btn = document.querySelector(`.effect-btn[data-effect="${CSS.escape(currentState.effect || '')}"]`);
  const name = currentState.blank ? 'Off' : (btn ? btn.textContent.replace(/[◈▸]/g, '').trim() : currentState.effect) || '';
  const st = currentState.effectStatus?.radio;
  const station = st && st.playing && st.station ? st.station.name.replace(/^[\s-]+/, '') : '';
  const key = name + '|' + station;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  const pill = (text, tab, cls) => {
    const b = document.createElement('button');
    b.className = 'now-pill ' + cls; b.textContent = text; b.title = text;
    b.addEventListener('click', () => setTab(tab));
    return b;
  };
  el.replaceChildren(...[name && pill('▶ ' + name, 'play', 'now-pill-fx'), station && pill('♫ ' + station, 'music', 'now-pill-radio')].filter(Boolean));
}

// Effects search box + "Show unavailable" toggle. While a query is typed,
// every sub-section is shown expanded (only matching buttons visible, empty
// sub-sections hidden); clearing it restores the normal collapsed layout.
// Screen readers announced most sliders/selects as just "slider" - they're
// laid out with a separate text label div rather than a <label>. Give each
// unlabelled control an aria-label from the nearest preceding label-ish
// text (its own row label, or the text of the element just before it).
function labelUnlabelledControls() {
  document.querySelectorAll('input[type=range], select, input[type=number], input[type=text], input[type=color]').forEach((el) => {
    if (el.getAttribute('aria-label') || el.labels?.length || el.getAttribute('aria-labelledby')) return;
    let text = '';
    for (let n = el.previousElementSibling; n && !text; n = n.previousElementSibling) text = n.textContent.trim();
    for (let p = el.parentElement; p && !text; p = p.parentElement) {
      for (let n = p.previousElementSibling; n && !text; n = n.previousElementSibling) text = n.textContent.trim();
      if (p.classList.contains('effect-panel')) break;
    }
    if (text) el.setAttribute('aria-label', text.replace(/\s+/g, ' ').slice(0, 60));
  });
}

// Diagnostics section (see src/diagnostics.js on the Pi).
let _lastDiag = null;
function renderDiag(d) {
  _lastDiag = d;
  const tb = document.querySelector('#diag-table tbody');
  if (!tb || tb.closest('.sidebar-section')?.classList.contains('collapsed')) return; // don't touch the DOM while hidden
  const fmtUp = (s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
  const rows = [
    ['Version', d.version], ['Mode', d.mode], ['Render thread', d.renderThread],
    ['Frame rate', `${d.fps} fps`, d.fps < 25], ['Render time', d.renderMsAvg == null ? '-' : `${d.renderMsAvg} ms avg, ${d.renderMsMax} ms max`, d.renderMsMax > 30],
    ['CPU (all threads)', `${d.cpuPct}%`, d.cpuPct > 150], ['Load (1 min)', d.load1], ['Memory', `${d.rssMB} MB (heap ${d.heapMB} MB)`],
    ['Temperature', d.tempC == null ? 'n/a' : `${d.tempC.toFixed(1)} °C`, d.tempC > 75], ['Uptime', fmtUp(d.uptimeS)],
    ['Radio', d.radio], ['Radio output', d.radioPlayback],
  ];
  // Health checks every 5 minutes (see src/health.js): a steady climb in
  // app memory or child processes over the hours points at a leak.
  if (d.net) {
    rows.push(['Internet', d.net.online ? 'connected' : 'OFFLINE (' + d.net.failures + ' checks)', !d.net.online]);
    rows.push(['Cloudflare tunnel', d.net.tunnel || '-', d.net.tunnel && !['active', 'activating', 'not installed', 'unknown'].includes(d.net.tunnel)]);
    if (d.net.lastFix) rows.push(['Last network fix', d.net.lastFix]);
  }
  const hl = d.health || [];
  if (hl.length) {
    const last = hl[hl.length - 1], first = hl[0];
    rows.push(['Pi free memory', `${last.freeMB} of ${last.totalMB} MB`, last.freeMB < last.totalMB * 0.1]);
    rows.push(['Child processes', last.children == null ? 'n/a' : String(last.children), last.children > 25]);
    rows.push(['Memory trend', `${first.rssMB} → ${last.rssMB} MB since ${first.t}`, last.rssMB > first.rssMB * 1.5 && last.rssMB - first.rssMB > 50]);
  }
  tb.replaceChildren(...rows.map(([k, v, warn]) => {
    const tr = document.createElement('tr');
    const a = document.createElement('td'); a.textContent = k;
    const b = document.createElement('td'); b.textContent = v == null ? '-' : String(v); if (warn) b.className = 'warn';
    tr.append(a, b); return tr;
  }));
  const log = document.getElementById('diag-log');
  if (log) {
    if (!d.log.length) log.textContent = 'None';
    else log.replaceChildren(...d.log.slice().reverse().map((e) => { const div = document.createElement('div'); div.className = e.level; div.textContent = `${e.t} ${e.msg}`; return div; }));
  }
}
function wireDiagnostics() {
  document.getElementById('diag-copy-btn')?.addEventListener('click', async () => {
    if (!_lastDiag) return;
    const text = JSON.stringify({ ...(_lastDiag), page: APP_VERSION, userAgent: navigator.userAgent }, null, 2);
    try { await navigator.clipboard.writeText(text); document.getElementById('diag-copy-btn').textContent = 'Copied ✓'; }
    catch (e) { window.prompt('Copy this report:', text); }
    setTimeout(() => { const b = document.getElementById('diag-copy-btn'); if (b) b.textContent = 'Copy report'; }, 1500);
  });
}

function wireMusicReact() {
  const chk = document.getElementById('music-react-chk'), amt = document.getElementById('music-react-amt'), val = document.getElementById('music-react-val');
  chk?.addEventListener('change', () => send({ cmd: 'setMusicReact', on: chk.checked }));
  amt?.addEventListener('input', () => { if (val) val.textContent = Math.round(amt.value * 100) + '%'; send({ cmd: 'setMusicReact', amount: Number(amt.value) }); });
  document.getElementById('mic-music-chk')?.addEventListener('change', (e) => send({ cmd: 'setMic', music: e.target.checked }));
}
function syncMusicReact() {
  const m = currentState.musicReact || { on: false, amount: 0.6 };
  const chk = document.getElementById('music-react-chk'), amt = document.getElementById('music-react-amt'), val = document.getElementById('music-react-val');
  if (chk && document.activeElement !== chk) chk.checked = !!m.on;
  if (amt && document.activeElement !== amt) { amt.value = m.amount; if (val) val.textContent = Math.round(m.amount * 100) + '%'; }
  const row = document.getElementById('music-react-row'); if (row) row.style.opacity = m.on ? '1' : '0.45';
  const mic = document.getElementById('mic-music-chk'), on = !!currentState.prefs?.mic?.music;
  if (mic && document.activeElement !== mic) mic.checked = on;
  const mn = document.getElementById('mic-music-note'), ms = currentState.mic;
  if (mn) mn.textContent = !on ? '' : ms?.status ? '⚠ ' + ms.status : ms?.listening ? 'Listening on ' + ms.source : 'Looking for a microphone…';
}

function wireRestartButtons() {
  document.getElementById('restart-app-btn')?.addEventListener('click', () => {
    if (confirm('Restart the display app? The panels go dark for a few seconds.')) send({ cmd: 'restartApp' });
  });
  document.getElementById('reboot-pi-btn')?.addEventListener('click', () => {
    if (confirm('Reboot the Raspberry Pi? It takes about a minute to come back.')) send({ cmd: 'rebootPi' });
  });
}

function wirePinControls() {
  const inp = document.getElementById('pin-input');
  document.getElementById('pin-save-btn')?.addEventListener('click', () => {
    const pin = (inp?.value || '').trim();
    if (!/^[0-9A-Za-z]{4,32}$/.test(pin)) { alert('PIN must be 4-32 letters or digits'); return; }
    inp.dataset.pending = pin;
    send({ cmd: 'setControlPin', pin });
  });
  document.getElementById('pin-clear-btn')?.addEventListener('click', () => {
    if (confirm('Remove the control PIN? Anyone on your network will be able to use this page.')) send({ cmd: 'setControlPin', pin: '' });
  });
}
function syncPinStatus() {
  const el = document.getElementById('pin-status');
  if (el) el.textContent = currentState.controlPinSet ? 'PIN set - new browsers must enter it.' : 'No PIN - anyone on your network can use this page.';
}

// ── Tabs: Now / Effects / Overlays / Timers / Settings ─────────────────
// Each sidebar section belongs to one tab (by its heading); only the active
// tab's sections show, open. The chosen tab is remembered per browser.
const TAB_OF_SECTION = [
  ['Effects', 'play'], ['Draw on a Face', 'play'], ['Music', 'music'], ['Overlays', 'schedule'], ['Timers', 'schedule'], ['Auto show', 'schedule'],
  ['Display', 'setup'], ['AI assistant', 'setup'], ['System', 'setup'],
];
// Tab names before the Play/Music/Schedule/Setup redesign, so a browser
// that remembered one lands somewhere sensible.
const OLD_TABS = { now: 'play', effects: 'play', overlays: 'schedule', timers: 'schedule', settings: 'setup' };
// ── Effect categories: a chip row above the effect tiles replaces opening
// and closing each group. "All" shows every group, labelled. ──
function wireEffectChips() {
  const body = document.getElementById('effects-body');
  const filterRow = body?.querySelector('.effect-filter-row');
  if (!body || !filterRow || document.getElementById('effect-chips')) return;
  const groups = [...body.querySelectorAll(':scope > .sub-section')].filter((g) => g.querySelector(':scope > .sub-head'));
  const row = document.createElement('div');
  row.id = 'effect-chips';
  row.className = 'effect-chips';
  const names = groups.map((g) => g.querySelector(':scope > .sub-head').textContent.replace(/[▾▸◈]/g, '').trim());
  const choose = (i) => {
    body.classList.toggle('only-favs', i === -2);
    row.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(i === -2 ? j === 0 : j === i + 2)));
    groups.forEach((g, j) => {
      g.classList.toggle('chip-hidden', i >= 0 && j !== i);
      if (i < 0 || j === i) g.classList.remove('collapsed');
    });
    body.classList.toggle('chips-all', i < 0);
    try { localStorage.setItem('fxChip', String(i)); } catch (e) { /* storage unavailable */ }
  };
  ['★', 'All', ...names].forEach((n, k) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = n.replace(/ &.*$/, '');
    b.title = k === 0 ? 'Favourites' : n;
    b.addEventListener('click', () => choose(k - 2));
    row.appendChild(b);
  });
  filterRow.after(row);
  let saved = -1;
  try { saved = Number(localStorage.getItem('fxChip') ?? -1); } catch (e) { /* storage unavailable */ }
  choose(saved >= -2 && saved < groups.length ? saved : -1);
}

const OVERLAY_DESC = {
  stars: 'Little stars twinkle on top', snow: 'Snowflakes drift down', meteors: 'Shooting stars streak across',
  edgeglow: 'A glowing rim around the edges', fire: 'Flames along the bottom edge', sparkle: 'Glitter falls like rain',
  colorwave: 'A colour wash sweeps across', pulse: 'Everything gently breathes', scanline: 'A retro scan line rolls past',
  vignette: 'Darkens the edges', glitch: 'Random digital glitches', mist: 'A soft rainbow haze',
  lightning: 'Occasional lightning flashes', spectrum: 'Music bars over any effect',
};
function addOverlayDescriptions() {
  document.querySelectorAll('.ov-item').forEach((item) => {
    const key = item.querySelector('.ov-chk')?.dataset.ov;
    const name = item.querySelector('.ov-name');
    if (!key || !name || !OVERLAY_DESC[key] || name.querySelector('.ov-desc')) return;
    const d = document.createElement('span');
    d.className = 'ov-desc'; d.textContent = OVERLAY_DESC[key];
    name.appendChild(d);
  });
}

function wireTabs() {
  wireEffectChips();
  addOverlayDescriptions();
  const sections = [...document.querySelectorAll('#sidebar-scroll > .sidebar-section')];
  for (const sec of sections) {
    if (sec.dataset.tab) continue;
    const head = sec.querySelector(':scope > .section-head')?.textContent || '';
    const hit = TAB_OF_SECTION.find(([t]) => head.includes(t));
    sec.dataset.tab = hit ? hit[1] : 'setup';
  }
  // Tabs with a single section drop its accordion header and keep it open.
  const counts = {};
  for (const sec of sections) counts[sec.dataset.tab] = (counts[sec.dataset.tab] || 0) + 1;
  for (const sec of sections) if (counts[sec.dataset.tab] === 1) { sec.classList.add('tab-solo'); sec.classList.remove('collapsed'); }
  document.querySelectorAll('#tab-bar [data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  let tab = 'play';
  try { tab = localStorage.getItem('tab') || 'play'; } catch (e) { /* storage unavailable */ }
  setTab(tab);
}
// Recent effects as one-tap chips on the Play tab: recorded from the Pi's own
// state, so a pick from a tile, a scene, a timer or the playlist all count.
let recentShown = null;
function syncRecents() {
  const fx = currentState.effect; if (!fx || !effectNames[fx]) return;
  let list = [];
  try { list = JSON.parse(localStorage.getItem('recentFx') || '[]'); } catch (e) { /* storage unavailable */ }
  if (list[0] !== fx) { list = [fx, ...list.filter((k) => k !== fx)].slice(0, 7); try { localStorage.setItem('recentFx', JSON.stringify(list)); } catch (e) { /* storage unavailable */ } }
  const key = list.join(',');
  if (key === recentShown) return;
  recentShown = key;
  const row = document.getElementById('recent-row'); if (!row) return;
  const others = list.slice(1).filter((k) => effectNames[k]);
  row.hidden = !others.length;
  row.replaceChildren(...others.map((k) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = '↺ ' + effectNames[k]; b.title = 'Show ' + effectNames[k] + ' again'; b.addEventListener('click', () => send({ cmd: 'setEffect', effect: k })); return b; }));
}

// Buttons that show only an emoji get a name for screen readers and
// long-press hints, from their title (or a nearby label) if they lack one.
function labelIconButtons(root = document) {
  root.querySelectorAll('button:not([aria-label])').forEach((b) => {
    const text = (b.textContent || '').trim();
    if (/[A-Za-z0-9]/.test(text)) return;
    const name = b.title || b.dataset.label || '';
    if (name) b.setAttribute('aria-label', name);
  });
}
new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) labelIconButtons(n.tagName === 'BUTTON' ? n.parentNode || n : n); }).observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => labelIconButtons()); else labelIconButtons();

// Setup search: hides the Setup sections that don't mention the words typed
// and opens the ones that do.
function wireSetupSearch() {
  const inp = document.getElementById('setup-search-in'); if (!inp) return;
  const run = () => {
    const words = inp.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    document.querySelectorAll('#sidebar-scroll > .sidebar-section[data-tab="setup"]').forEach((sec) => {
      const hit = !words.length || words.every((w) => sec.textContent.toLowerCase().includes(w));
      sec.classList.toggle('search-miss', !hit);
      if (hit) shown++;
      if (hit && words.length) sec.classList.remove('collapsed');
    });
    let none = document.getElementById('setup-search-none');
    if (!shown) { if (!none) { none = document.createElement('div'); none.id = 'setup-search-none'; inp.parentElement.append(none); } none.textContent = 'No setting matches "' + inp.value + '"'; } else if (none) none.remove();
  };
  inp.addEventListener('input', run);
}
function setTab(tab) {
  tab = OLD_TABS[tab] || tab;
  if (!document.querySelector(`#tab-bar [data-tab="${tab}"]`)) tab = 'play';
  document.body.dataset.tab = tab;
  document.querySelectorAll('#tab-bar [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll('#sidebar-scroll > .sidebar-section').forEach((sec) => sec.classList.toggle('tab-active', sec.dataset.tab === tab));
  document.getElementById('sidebar-scroll')?.scrollTo(0, 0);
  // The Effects tab opens with the effect list expanded.
  // Open the tab's first section if all of them are folded, so a tab never looks empty.
  const secs = [...document.querySelectorAll('#sidebar-scroll > .sidebar-section.tab-active')];
  if (secs.length && secs.every((x) => x.classList.contains('collapsed'))) secs[0].classList.remove('collapsed');
  if (tab === 'play') document.getElementById('effects-body')?.closest('.sidebar-section')?.classList.remove('collapsed');
  try { localStorage.setItem('tab', tab); } catch (e) { /* storage unavailable */ }
}

// ── Now tab: the running effect's own options panel (plus any shared
// panel of its submenu, e.g. the Art slideshow controls) is moved here
// while that effect runs, and put back where it came from afterwards. ──
const _nowMoved = []; // [{ el, marker }]
function placeActivePanels() {
  const host = document.getElementById('now-options');
  if (!host) return;
  const key = currentState.effect;
  const nameEl = document.getElementById('now-effect-name');
  const btn = key && document.querySelector(`.effect-btn[data-effect="${CSS.escape(key)}"]`);
  if (nameEl) nameEl.textContent = currentState.blank ? 'Nothing (cleared)' : btn ? btn.textContent.replace(/[◈▸▶]/g, '').trim() : (key || '…');
  const want = [];
  const panel = key && document.getElementById('panel-' + key);
  if (panel && !panel.closest('#music-section')) want.push(panel); // the radio lives on the Music tab
  // Slideshow/letterbox controls only belong to the picture galleries.
  const shared = btn && ['apod', 'unsplash', 'artic'].includes(key) && btn.closest('.sub-section')?.querySelector('.art-shared-panel');
  if (shared) want.push(shared);
  if (want.length === _nowMoved.length && want.every((el, i) => _nowMoved[i].el === el)) return;
  // Put back whatever is there now.
  while (_nowMoved.length) { const { el, marker } = _nowMoved.pop(); marker.replaceWith(el); }
  for (const el of want) {
    const marker = document.createComment('now-tab placeholder');
    el.replaceWith(marker);
    host.appendChild(el);
    _nowMoved.push({ el, marker });
  }
  const none = document.getElementById('now-no-options');
  if (none) {
    none.style.display = want.length ? 'none' : '';
    none.textContent = panel && !want.includes(panel) ? 'Station, volume and spectrum settings are on the Music tab.' : 'This effect has no options.';
  }
}

// ── Scenes ──
function renderScenes() {
  const box = document.getElementById('scene-chips');
  if (!box) return;
  const list = currentState.scenes || [];
  if (!list.length) { box.textContent = 'No scenes yet.'; box.className = 'scene-chips ui-note'; return; }
  box.className = 'scene-chips scene-tiles';
  box.replaceChildren(...list.map((sc) => {
    const tile = document.createElement('div');
    tile.className = 'scene-tile';
    const go = document.createElement('button'); go.type = 'button'; go.className = 'scene-go'; go.title = 'Show this scene';
    const name = document.createElement('span'); name.textContent = sc.name;
    go.append(cxStillThumb(sc.effect), name);
    go.addEventListener('click', () => { send({ cmd: 'applyScene', name: sc.name }); cxToast('Scene: ' + sc.name); });
    const del = document.createElement('button'); del.type = 'button'; del.className = 'scene-del'; del.textContent = '✕'; del.setAttribute('aria-label', 'Delete scene ' + sc.name);
    del.addEventListener('click', () => { if (confirm(`Delete scene "${sc.name}"?`)) send({ cmd: 'deleteScene', name: sc.name }); });
    tile.append(go, del);
    return tile;
  }));
}
function wireScenes() {
  const inp = document.getElementById('scene-name-input');
  const save = () => {
    const name = (inp?.value || '').trim();
    if (!name) { inp?.focus(); return; }
    if ((currentState.scenes || []).some((sc) => sc.name === name) && !confirm(`Replace scene "${name}"?`)) return;
    send({ cmd: 'saveScene', name });
    inp.value = '';
  };
  document.getElementById('scene-save-btn')?.addEventListener('click', save);
  inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
}

function wireEffectFilter() {
  const body = document.getElementById('effects-body');
  const input = document.getElementById('effect-filter');
  const chk = document.getElementById('show-unported-chk');
  if (!body || !input) return;
  const apply = () => {
    const q = input.value.trim().toLowerCase();
    body.classList.toggle('filtering', !!q);
    body.querySelectorAll('.effect-btn[data-effect]').forEach((btn) => {
      const hit = !q || btn.textContent.toLowerCase().includes(q) || btn.dataset.effect.toLowerCase().includes(q);
      btn.classList.toggle('filter-hide', !hit);
    });
    body.querySelectorAll('.sub-section').forEach((sec) => {
      const any = [...sec.querySelectorAll('.effect-btn[data-effect]')].some((b) => !b.classList.contains('filter-hide')
        && !(document.body.classList.contains('hide-unported') && b.classList.contains('not-ported')));
      sec.classList.toggle('filter-empty', !!q && !any);
    });
  };
  input.addEventListener('input', apply);
  if (chk) {
    let show = false;
    try { show = localStorage.getItem('showUnported') === '1'; } catch (e) { /* storage unavailable */ }
    chk.checked = show;
    document.body.classList.toggle('hide-unported', !show);
    chk.addEventListener('change', () => {
      document.body.classList.toggle('hide-unported', !chk.checked);
      try { localStorage.setItem('showUnported', chk.checked ? '1' : '0'); } catch (e) { /* storage unavailable */ }
      apply();
    });
  }
}

function syncEffectButtons() {
  document.querySelectorAll('.effect-btn[data-effect]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.effect === currentState.effect);
    if (btn.dataset.effect === currentState.effect) btn.classList.remove('pending');
  });
  updateActiveEffectLabel();
}

function setEffectOption(effect, key, value) {
  send({ cmd: 'setEffectOption', effect, key, value });
}

