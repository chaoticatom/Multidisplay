// ---------------------------------------------------------------------
// Master brightness / speed sliders (Display section)
// ---------------------------------------------------------------------
let _brightEditingUntil = 0;
function wireSliders() {
  const bright = document.getElementById('bright-slider');
  const brightVal = document.getElementById('bright-val');
  if (bright) {
    // Same echo-fighting fix as #ov-global-bright (see that slider's own
    // comment in wireOverlaysPanel) - a time-based "ignore server echoes
    // for a bit" guard instead of relying on document.activeElement, which
    // touch drags don't reliably set. Applied here pre-emptively: this
    // slider moved to the top of the sidebar (prominent, now the ONLY
    // brightness control) and shares the exact same input->send->broadcast
    // ->sync round-trip architecture that caused it for #ov-global-bright.
    let brightSendQueued = false;
    bright.addEventListener('input', () => {
      _brightEditingUntil = Date.now() + 1200;
      const v = Number(bright.value);
      if (brightVal) brightVal.textContent = Math.round(v * 100) + '%';
      if (brightSendQueued) return;
      brightSendQueued = true;
      requestAnimationFrame(() => {
        brightSendQueued = false;
        send({ cmd: 'setBrightness', value: Number(bright.value) });
      });
    });
  }
  const speed = document.getElementById('speed-slider');
  const speedVal = document.getElementById('speed-val');
  if (speed) {
    speed.addEventListener('input', () => {
      const v = Number(speed.value);
      if (speedVal) speedVal.textContent = v.toFixed(1) + 'x';
      send({ cmd: 'setSpeed', value: v });
    });
  }
}

function syncSliders() {
  const bright = document.getElementById('bright-slider');
  const brightVal = document.getElementById('bright-val');
  if (bright && document.activeElement !== bright && Date.now() >= _brightEditingUntil) {
    bright.value = currentState.brightness;
    if (brightVal) brightVal.textContent = Math.round(currentState.brightness * 100) + '%';
  }
  const speed = document.getElementById('speed-slider');
  const speedVal = document.getElementById('speed-val');
  if (speed) { speed.value = currentState.speed; if (speedVal) speedVal.textContent = Number(currentState.speed).toFixed(1) + 'x'; }
}

// ---------------------------------------------------------------------
// Timers ("alarms"): the list on the Time tab and the editor sheet
// (#alarm-modal). The server owns the list (state.alarms, see
// src/alarmConfig.js for the stored shape); this maps it to four simple
// kinds:
//   wake     - optional sunrise, then an effect/scene (+ message)
//   start    - switch to an effect/scene at the time
//   winddown - fade from full to dark over N minutes (prealarm.windDown)
//   off      - blank the display (triggerType 'off'; music keeps playing)
const TM_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TM_KIND_LABEL = { wake: '⏰ Wake up', start: '▶ Switch on', winddown: '🌙 Wind down', off: '⏻ Turn off' };
const TM_REPEAT_DAYS = { daily: [0, 1, 2, 3, 4, 5, 6], weekdays: [1, 2, 3, 4, 5], weekends: [0, 6], once: [] };
let tmEdit = null; // { id|null, kind, days:Set, sunrise, wd, repeatHourly }

function tmKindOf(al) {
  if (TM_KIND_LABEL[al.kind]) return al.kind;
  if (al.triggerType === 'off') return 'off';
  if (al.prealarm?.windDown) return 'winddown';
  if (al.prealarm?.enabled || al.message) return 'wake';
  return 'start';
}
function tmDaysOf(al) {
  if (al.repeat === 'weekly') return al.days || [];
  return TM_REPEAT_DAYS[al.repeat] || TM_REPEAT_DAYS.daily;
}
// Days → the stored repeat mode.
function tmRepeatFor(days) {
  const key = [...days].sort().join(',');
  for (const r of ['daily', 'weekdays', 'weekends']) if (TM_REPEAT_DAYS[r].join(',') === key) return { repeat: r, days: [] };
  if (!days.size) return { repeat: 'once', days: [] };
  return { repeat: 'weekly', days: [...days].sort() };
}
function tmRepeatLabel(al) {
  if (al.repeat === 'hourly') return 'Every hour';
  const r = { once: 'Once', daily: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends' }[al.repeat];
  if (r) return r;
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => (al.days || []).includes(d)).map((d) => TM_DAY_NAMES[d]).join(' ') || 'Never';
}
// When an alarm next runs (Date), or null if it never will.
function tmNextRun(al, from = new Date()) {
  if (al.repeat === 'hourly') {
    const d = new Date(from); d.setSeconds(0, 0); d.setMinutes(al.minute);
    if (d <= from) d.setHours(d.getHours() + 1);
    return d;
  }
  const days = al.repeat === 'once' ? [0, 1, 2, 3, 4, 5, 6] : tmDaysOf(al);
  if (!days.length) return null;
  for (let i = 0; i < 8; i++) {
    const d = new Date(from); d.setDate(d.getDate() + i); d.setHours(al.hour, al.minute, 0, 0);
    if (d > from && days.includes(d.getDay())) return d;
  }
  return null;
}
function tmUntil(d) {
  if (!d) return '';
  const mins = Math.round((d - Date.now()) / 60000);
  if (mins < 60) return `in ${Math.max(1, mins)} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return `in ${h} h${m ? ' ' + m + ' min' : ''}`;
  return 'on ' + TM_DAY_NAMES[d.getDay()];
}
function tmHHMM(al) { return String(al.hour).padStart(2, '0') + ':' + String(al.minute).padStart(2, '0'); }
function tmWhat(al) {
  if (al.triggerType === 'scene') return 'Scene: ' + (al.scene || '?');
  if (al.effect) return effectNames?.[al.effect] || al.effect;
  return '';
}

function renderAlarmList() {
  const el = document.getElementById('alarm-list-ui');
  if (!el) return;
  const alarms = (currentState.alarms || []).slice().sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  if (!alarms.length) { el.innerHTML = '<div class="tm-empty">No timers yet. Tap one below to add it.</div>'; return; }
  el.replaceChildren(...alarms.map((al) => {
    const kind = tmKindOf(al);
    const what = kind === 'winddown' ? `fades over ${al.prealarm?.wdMinutes || 15} min` : kind === 'off' ? 'display off' : tmWhat(al);
    const next = al.enabled ? tmUntil(tmNextRun(al)) : 'off';
    const div = document.createElement('div');
    div.className = 'cx-timer' + (al.enabled ? ' on' : '');
    div.innerHTML = `<div class="cx-timer-main"><b></b><span></span><small></small></div><button type="button" class="cx-switch${al.enabled ? ' on' : ''}" aria-label="Timer on or off"></button>`;
    div.querySelector('b').textContent = tmHHMM(al);
    div.querySelector('span').textContent = (al.name || TM_KIND_LABEL[kind]) + (what ? ' · ' + what : '');
    const radioTxt = al.radio?.action === 'start' ? ' · 📻 ' + (al.radio.station?.name || 'radio') : al.radio?.action === 'stop' ? ' · 📻 off' : '';
    div.querySelector('small').textContent = tmRepeatLabel(al) + (next ? ' · ' + next : '') + radioTxt;
    div.querySelector('.cx-switch').addEventListener('click', (e) => { e.stopPropagation(); send({ cmd: 'setAlarmEnabled', id: al.id, enabled: !al.enabled }); });
    div.addEventListener('click', () => openAlarmEditor(al.id));
    return div;
  }));
}

function wireAlarmSection() {
  document.getElementById('alarm-add-btn')?.addEventListener('click', () => openAlarmEditor(null));
  document.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => openAlarmEditor(null, b.dataset.quick)));
}

// Stations for a "Start a station" timer: your starred ones, plus whatever is playing now.
let btPairedCache = [];
// Where a timer's radio plays: the output in use at the time, the Pi's own
// output, or one of the paired speakers (connected when the timer starts).
function tmFillOutputs() {
  const sel = document.getElementById('tm-output'); if (!sel || !tmEdit) return;
  const opts = [['', '🔈 Sound: current output'], ['local', '🔈 Sound: Pi output (no Bluetooth)'], ...btPairedCache.map((d) => [d.mac, '🔊 Sound: ' + (d.name || d.mac)])];
  if (tmEdit.output && !opts.some(([v]) => v === tmEdit.output)) opts.push([tmEdit.output, '🔊 Sound: ' + tmEdit.output]);
  sel.replaceChildren(...opts.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
  sel.value = tmEdit.output || '';
}

function tmFillStations() {
  const sel = document.getElementById('tm-station'); if (!sel || !tmEdit) return;
  const list = [...(currentState.prefs?.stations || [])];
  const now = currentState.effectStatus?.radio?.station;
  if (now && now.url && !list.some((x) => x.url === now.url)) list.unshift({ ...now, nowPlaying: true });
  if (tmEdit.station && tmEdit.station.url && !list.some((x) => x.url === tmEdit.station.url)) list.unshift(tmEdit.station);
  sel.replaceChildren(...list.map((st, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = (st.nowPlaying ? '▶ ' : '★ ') + (st.name || 'Station'); return o; }));
  sel._list = list;
  const idx = tmEdit.station ? list.findIndex((x) => x.url === tmEdit.station.url) : 0;
  sel.value = String(Math.max(0, idx));
  if (!tmEdit.station && list[0]) tmEdit.station = list[0];
  document.getElementById('tm-station-note').textContent = list.length ? 'Star more stations on the Music tab to choose them here.' : 'No stations yet: play or star one on the Music tab first.';
}

function tmFillShow(sel, al) {
  const scenes = currentState.scenes || [];
  const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };
  const groups = [];
  if (scenes.length) { const g = document.createElement('optgroup'); g.label = 'Scenes'; g.append(...scenes.map((sc) => opt('scene:' + sc.name, sc.name))); groups.push(g); }
  const g = document.createElement('optgroup'); g.label = 'Effects';
  g.append(...Object.entries(effectNames || {}).filter(([k]) => k !== 'custom_cube' && k !== 'easter_egg')
    .sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => opt('effect:' + k, v)));
  groups.push(g);
  sel.replaceChildren(opt('', 'Keep what is showing'), ...groups);
  sel.value = al.triggerType === 'scene' && al.scene ? 'scene:' + al.scene : al.effect ? 'effect:' + al.effect : '';
  if (sel.selectedIndex < 0) sel.value = '';
}

function tmSetChip(groupEl, attr, value) {
  groupEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === String(value)));
}

function tmSync() {
  const e = tmEdit;
  document.querySelectorAll('.tm-kind').forEach((b) => { const on = b.dataset.kind === e.kind; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.hidden = !on; };
  show('tm-show-row', e.kind === 'wake' || e.kind === 'start');
  show('tm-sunrise-row', e.kind === 'wake' || e.kind === 'start'); // a switch-on timer can fade up too
  show('tm-msg-row', e.kind === 'wake' || e.kind === 'start');
  show('tm-wd-row', e.kind === 'winddown');
  tmSetChip(document.getElementById('tm-sunrise'), 'v', e.sunrise);
  tmSetChip(document.getElementById('tm-wd'), 'v', e.wd);
  // Custom minutes boxes show the value when it isn't one of the chips.
  for (const [id, v, chips] of [['tm-sun-custom', e.sunrise, [0, 1, 5, 15, 30]], ['tm-wd-custom', e.wd, [1, 5, 15, 30, 60]]]) {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = chips.includes(v) ? '' : String(v);
  }
  tmSetChip(document.getElementById('tm-radio'), 'ra', e.radio);
  document.getElementById('tm-station-row').hidden = e.radio !== 'start';
  // Say how the radio fades with the light.
  const rn = document.getElementById('tm-radio-note');
  if (rn) rn.textContent = e.radio === 'none' ? '' : e.kind === 'wake' && e.sunrise > 0 && e.radio === 'start' ? `Starts quietly when the sunrise begins and rises to your volume by ${tmHHMM(tmRead())}.` : e.kind === 'winddown' ? 'Fades out with the light, then stops.' : '';
  const rep = e.repeatHourly ? 'hourly' : tmRepeatFor(e.days).repeat;
  tmSetChip(document.getElementById('tm-repeat'), 'r', rep);
  document.querySelectorAll('#tm-days button').forEach((b) => b.classList.toggle('on', e.days.has(+b.dataset.d)));
  document.getElementById('tm-name').placeholder = TM_KIND_LABEL[e.kind].replace(/^\S+\s/, '');
  // Summary: "Weekdays at 07:30 · next in 9 h 12 min"
  const al = tmRead();
  const next = tmNextRun(al);
  const start = e.kind === 'wake' && e.sunrise ? ` (sunrise from ${tmHHMM({ hour: Math.floor(((al.hour * 60 + al.minute - e.sunrise) + 1440) % 1440 / 60), minute: ((al.hour * 60 + al.minute - e.sunrise) + 1440) % 60 })})` : '';
  document.getElementById('tm-summary').textContent = next ? `${tmRepeatLabel(al)} at ${tmHHMM(al)}${start} · next ${tmUntil(next)}` : 'Pick at least one day';
}

function openAlarmEditor(id, quickKind) {
  const al = id ? (currentState.alarms || []).find((a) => a.id === id) : null;
  const kind = al ? tmKindOf(al) : quickKind || 'wake';
  const defaults = { wake: [7, 0], start: [18, 0], winddown: [22, 30], off: [23, 30] }[kind];
  const src = al || { hour: defaults[0], minute: defaults[1], repeat: kind === 'wake' ? 'weekdays' : 'daily', effect: '', message: '' };
  tmEdit = {
    id: al ? al.id : null, kind,
    days: new Set(src.repeat === 'once' ? [] : tmDaysOf(src)),
    repeatHourly: src.repeat === 'hourly',
    sunrise: al?.prealarm?.enabled ? al.prealarm.preMinutes || 15 : (al ? 0 : 15),
    wd: al?.prealarm?.wdMinutes || 15,
    radio: al?.radio?.action || 'none', station: al?.radio?.station || null, output: al?.radio?.output || '',
  };
  tmFillStations();
  tmFillOutputs();
  document.getElementById('tm-title').textContent = al ? 'Edit timer' : 'New timer';
  document.getElementById('tm-time').value = tmHHMM(src);
  document.getElementById('tm-name').value = al?.name || '';
  document.getElementById('tm-message').value = src.message || '';
  document.getElementById('tm-giant-sun').checked = !!al?.prealarm?.giantSun;
  document.getElementById('tm-wd-effect').checked = al ? !!al.prealarm?.wdUseEffect : true;
  tmFillShow(document.getElementById('tm-show'), src);
  document.getElementById('tm-delete').hidden = !al;
  document.getElementById('alarm-modal').hidden = false;
  tmSync();
}

function closeAlarmEditor() {
  document.getElementById('alarm-modal').hidden = true;
  tmEdit = null;
}

// The editor's current values as a stored alarm object.
function tmRead() {
  const e = tmEdit;
  const [hh, mm] = (document.getElementById('tm-time').value || '07:00').split(':').map((n) => parseInt(n, 10) || 0);
  const show = document.getElementById('tm-show').value;
  const isScene = show.startsWith('scene:');
  const rep = e.repeatHourly ? { repeat: 'hourly', days: [] } : tmRepeatFor(e.days);
  const old = e.id ? (currentState.alarms || []).find((a) => a.id === e.id) : null;
  const usesShow = e.kind === 'wake' || e.kind === 'start';
  return {
    kind: e.kind,
    radio: { action: e.radio, station: e.radio === 'start' ? e.station : null, output: e.radio === 'start' ? e.output || '' : '' },
    name: document.getElementById('tm-name').value.trim(),
    enabled: true, // saving a timer switches it on
    hour: Math.min(23, Math.max(0, hh)), minute: Math.min(59, Math.max(0, mm)),
    repeat: rep.repeat, days: rep.days,
    triggerType: e.kind === 'off' ? 'off' : usesShow && isScene ? 'scene' : 'effect',
    scene: usesShow && isScene ? show.slice(6) : '',
    effect: usesShow && show.startsWith('effect:') ? show.slice(7) : '',
    overlayKeys: old?.overlayKeys || [],
    message: usesShow ? document.getElementById('tm-message').value.trim() : '',
    prealarm: {
      enabled: (e.kind === 'wake' || e.kind === 'start') && e.sunrise > 0,
      preMinutes: e.sunrise || 15,
      startBright: old?.prealarm?.startBright || 5,
      giantSun: (e.kind === 'wake' || e.kind === 'start') && document.getElementById('tm-giant-sun').checked,
      windDown: e.kind === 'winddown',
      wdMinutes: e.wd,
      wdUseEffect: e.kind === 'winddown' && document.getElementById('tm-wd-effect').checked,
      wdEffectKey: '', // '' = whatever is showing when it starts
      wdOverlayKeys: [],
    },
  };
}

function wireAlarmModal() {
  const modal = document.getElementById('alarm-modal');
  if (!modal) return;
  document.querySelectorAll('.tm-kind').forEach((b) => b.addEventListener('click', () => { tmEdit.kind = b.dataset.kind; tmSync(); }));
  document.querySelectorAll('#tm-sunrise button').forEach((b) => b.addEventListener('click', () => { tmEdit.sunrise = +b.dataset.v; tmSync(); }));
  document.querySelectorAll('#tm-wd button').forEach((b) => b.addEventListener('click', () => { tmEdit.wd = +b.dataset.v; tmSync(); }));
  document.getElementById('tm-wd-custom')?.addEventListener('input', (ev) => { const n = Math.round(Number(ev.target.value)); if (n >= 1 && n <= 180) { tmEdit.wd = n; tmSync(); } });
  document.getElementById('tm-sun-custom')?.addEventListener('input', (ev) => { const n = Math.round(Number(ev.target.value)); if (n >= 1 && n <= 120) { tmEdit.sunrise = n; tmSync(); } });
  document.querySelectorAll('#tm-radio button').forEach((b) => b.addEventListener('click', () => { tmEdit.radio = b.dataset.ra; tmFillStations(); tmSync(); }));
  document.getElementById('tm-output').addEventListener('change', (e) => { tmEdit.output = e.target.value; });
  document.getElementById('tm-station').addEventListener('change', (e) => { const l = e.target._list || []; tmEdit.station = l[Number(e.target.value)] || null; if (tmEdit.station) delete tmEdit.station.nowPlaying; });
  document.querySelectorAll('#tm-repeat button').forEach((b) => b.addEventListener('click', () => {
    tmEdit.repeatHourly = false;
    tmEdit.days = new Set(TM_REPEAT_DAYS[b.dataset.r]);
    tmSync();
  }));
  document.querySelectorAll('#tm-days button').forEach((b) => b.addEventListener('click', () => {
    tmEdit.repeatHourly = false;
    const d = +b.dataset.d;
    if (tmEdit.days.has(d)) tmEdit.days.delete(d); else tmEdit.days.add(d);
    tmSync();
  }));
  document.getElementById('tm-time').addEventListener('input', tmSync);
  document.getElementById('tm-show').addEventListener('change', tmSync);
  document.getElementById('tm-close').addEventListener('click', closeAlarmEditor);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeAlarmEditor(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeAlarmEditor(); });
  document.getElementById('tm-delete').addEventListener('click', () => {
    if (tmEdit?.id && confirm('Delete this timer?')) { send({ cmd: 'deleteAlarm', id: tmEdit.id }); cxToast('Timer deleted'); closeAlarmEditor(); }
  });
  document.getElementById('tm-save').addEventListener('click', () => {
    const alarm = tmRead();
    if (tmEdit.id) send({ cmd: 'updateAlarm', id: tmEdit.id, alarm });
    else send({ cmd: 'addAlarm', alarm });
    const next = tmNextRun(alarm);
    cxToast(`Timer saved · ${next ? 'next ' + tmUntil(next) : 'runs once'}`);
    closeAlarmEditor();
  });
}

// ---------------------------------------------------------------------
// Auto show (#auto-section): day plan, match the weather, celebrations.
// Settings live in prefs on the Pi (src/prefs.js, src/autoShow.js); every
// change sends the whole part with {cmd:'setAutoShow'}.
const AS_PARTS = [['morning', '🌅 Morning'], ['day', '☀ Day'], ['evening', '🌆 Evening'], ['night', '🌙 Night']];
const AS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function asPrefs() {
  const p = currentState.prefs || {};
  return {
    dayPlan: p.dayPlan || { on: false, starts: { morning: 6, day: 10, evening: 18, night: 23 }, effects: { morning: [], day: [], evening: [], night: [] } },
    weatherMode: p.weatherMode || { on: false },
    celebrations: p.celebrations || { newYear: true, dates: [] },
  };
}
function asSend(part, value) { send({ cmd: 'setAutoShow', [part]: value }); }
function cxRenderAutoShow() {
  const host = document.getElementById('auto-show-ui');
  if (!host) return;
  const P = asPrefs(), st = currentState.autoStatus || {};
  const key = JSON.stringify([P, st, Object.keys(effectNames || {}).length]);
  if (host.dataset.key === key || host.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  host.dataset.key = key;
  const names = Object.entries(effectNames || {}).filter(([k]) => !['custom_cube', 'easter_egg', 'cam', 'screen', 'video'].includes(k)).sort((a, b) => a[1].localeCompare(b[1]));
  const hourOpts = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === sel ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
  const sw = (id, on) => `<button type="button" class="cx-switch${on ? ' on' : ''}" id="${id}" aria-label="On or off"></button>`;
  const dp = P.dayPlan;
  let html = `<div class="as-block"><div class="as-head"><b>Day plan<small>Different effects for each part of the day.${st.part ? ' Now: ' + st.part + '.' : ''}</small></b>${sw('as-dp-on', dp.on)}</div>`;
  if (dp.on) {
    for (const [part, label] of AS_PARTS) {
      const list = dp.effects[part] || [];
      const br = dp.brightness ? dp.brightness[part] : null;
      const brOpts = [['', 'Keep'], ['0.05', '5%'], ['0.1', '10%'], ['0.25', '25%'], ['0.5', '50%'], ['0.75', '75%'], ['1', '100%']]
        .map(([v, t]) => `<option value="${v}"${(br === null || br === undefined ? '' : String(br)) === v ? ' selected' : ''}>${t}</option>`).join('');
      html += `<div class="as-part" data-part="${part}"><div class="as-part-top"><span style="flex:1">${label}</span>from <select class="as-start" aria-label="${label} starts at">${hourOpts(dp.starts[part])}</select></div>
        <div class="as-part-top"><span style="flex:1">☀ Brightness</span><select class="as-bright" aria-label="${label} brightness">${brOpts}</select></div>
        <div class="as-chips">${list.map((k) => `<span class="as-chip">${escHtml(effectNames[k] || k)}<button type="button" data-rm="${k}" aria-label="Remove">✕</button></span>`).join('') || '<span class="ui-note" style="margin:0">Your favourites</span>'}</div>
        <select class="as-add" aria-label="Add an effect to ${label}"><option value="">+ Add effect…</option>${names.map(([k, v]) => `<option value="${k}">${escHtml(v)}</option>`).join('')}</select></div>`;
    }
    html += '<div class="ui-note" style="margin:0">With two or more effects in a part, turn on the playlist (Play tab) to cycle through them.</div>';
  }
  html += '</div>';
  const w = st.weather || {};
  html += `<div class="as-block"><div class="as-head"><b>Match the weather<small>Thunder, rain, snow, fog, clouds or a clear night pick a matching effect. Uses the town set in the Weather effect.</small></b>${sw('as-wx-on', P.weatherMode.on)}</div>`;
  if (P.weatherMode.on) html += `<div class="as-status">${w.error ? '⚠ ' + escHtml(w.error) : w.words ? `Now: ${escHtml(w.words)} in ${escHtml(w.place || '')} → ${escHtml(effectNames[w.effect] || w.effect)}` : 'Checking the weather…'}</div>`;
  html += '</div>';
  const cel = P.celebrations;
  html += `<div class="as-block"><div class="as-head"><b>Celebrations<small>Fireworks with your message for 15 minutes, then back to what was on.${st.celebration ? ' Now: ' + escHtml(st.celebration) : ''}</small></b></div>
    <div class="as-head"><span style="font-size:13px;color:#eef2ff">🎆 New Year at midnight</span>${sw('as-ny-on', cel.newYear)}</div>`;
  for (let i = 0; i < cel.dates.length; i++) {
    const d = cel.dates[i];
    html += `<div class="as-date"><span>${d.day} ${AS_MONTHS[d.month - 1]} · ${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')} · ${escHtml(d.text || 'Fireworks')}</span><button type="button" data-delcel="${i}">Remove</button></div>`;
  }
  html += `<div class="as-row"><input type="date" id="as-cel-date" aria-label="Date"><input type="time" id="as-cel-time" value="08:00" aria-label="Time"></div>
    <div class="as-row"><input type="text" id="as-cel-text" maxlength="24" placeholder="HAPPY BIRTHDAY SAM" aria-label="Message"><button type="button" class="ui-btn-small" id="as-cel-add">Add</button></div></div>`;
  host.innerHTML = html;
  // Wiring.
  host.querySelector('#as-dp-on').addEventListener('click', () => asSend('dayPlan', { ...dp, on: !dp.on }));
  host.querySelectorAll('.as-part').forEach((row) => {
    const part = row.dataset.part;
    row.querySelector('.as-start').addEventListener('change', (e) => asSend('dayPlan', { ...dp, starts: { ...dp.starts, [part]: Number(e.target.value) } }));
    row.querySelector('.as-bright').addEventListener('change', (e) => asSend('dayPlan', { ...dp, brightness: { ...(dp.brightness || {}), [part]: e.target.value === '' ? null : Number(e.target.value) } }));
    row.querySelector('.as-add').addEventListener('change', (e) => {
      const k = e.target.value; if (!k) return;
      const list = (dp.effects[part] || []).filter((x) => x !== k).concat(k);
      asSend('dayPlan', { ...dp, effects: { ...dp.effects, [part]: list } });
    });
    row.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => asSend('dayPlan', { ...dp, effects: { ...dp.effects, [part]: (dp.effects[part] || []).filter((x) => x !== b.dataset.rm) } })));
  });
  host.querySelector('#as-wx-on').addEventListener('click', () => asSend('weatherMode', { on: !P.weatherMode.on }));
  host.querySelector('#as-ny-on').addEventListener('click', () => asSend('celebrations', { ...cel, newYear: !cel.newYear }));
  host.querySelectorAll('[data-delcel]').forEach((b) => b.addEventListener('click', () => asSend('celebrations', { ...cel, dates: cel.dates.filter((_, i) => i !== Number(b.dataset.delcel)) })));
  host.querySelector('#as-cel-add').addEventListener('click', () => {
    const dv = host.querySelector('#as-cel-date').value, tv = host.querySelector('#as-cel-time').value || '08:00', text = host.querySelector('#as-cel-text').value.trim().toUpperCase();
    if (!dv) { cxToast('Pick a date first'); return; }
    const [, mo, da] = dv.split('-').map(Number), [hh, mi] = tv.split(':').map(Number);
    asSend('celebrations', { ...cel, dates: cel.dates.concat({ month: mo, day: da, hour: hh, minute: mi, text }) });
    cxToast('Celebration added · every year on ' + da + ' ' + AS_MONTHS[mo - 1]);
  });
}

