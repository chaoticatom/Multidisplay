// ---------------------------------------------------------------------
// Internet Radio's option panel (panel-radio): stop/volume, directory search
// (results arrive as broadcast state in effectStatus.radio.search), the
// featured RADIO_STATIONS list, and the Spectrum Analyser controls, all sent
// through setEffectOption('radio', ...). RADIO_STATIONS is a small static list
// duplicated here rather than fetched from the server.
// ---------------------------------------------------------------------
const RADIO_STATIONS = [
  { name: 'SomaFM Groove Salad', genre: 'Ambient/Downtempo', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { name: 'SomaFM Drone Zone', genre: 'Ambient', url: 'https://ice1.somafm.com/dronezone-128-mp3' },
  { name: 'SomaFM Space Station', genre: 'Space Music', url: 'https://ice1.somafm.com/spacestation-128-mp3' },
  { name: 'SomaFM Beat Blender', genre: 'Electronica', url: 'https://ice1.somafm.com/beatblender-128-mp3' },
  { name: 'SomaFM Indie Pop Rocks', genre: 'Indie Pop', url: 'https://ice1.somafm.com/indiepop-128-mp3' },
  { name: 'SomaFM Lush', genre: 'Mellow Vocals', url: 'https://ice1.somafm.com/lush-128-mp3' },
  { name: 'SomaFM Secret Agent', genre: 'Spy Lounge', url: 'https://ice1.somafm.com/secretagent-128-mp3' },
  { name: 'SomaFM Boot Liquor', genre: 'Americana', url: 'https://ice1.somafm.com/bootliquor-128-mp3' },
];

// Escapes text for interpolation into an innerHTML template - station
// names/genres come from an external directory (radio-browser.info) and
// timer names from any client on the LAN, so neither can be trusted as
// markup.
function escHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function radioStationRow(station, current) {
  const div = document.createElement('div');
  const isCurrent = current && current.url === station.url;
  div.className = 'cx-station' + (isCurrent ? ' on' : '');
  const fav = (currentState.prefs?.stations || []).some((x) => x.url === station.url);
  div.innerHTML = `<span class="cx-station-play">${isCurrent ? '❚❚' : '▶'}</span><span class="cx-station-txt"><b>${escHtml(station.name)}</b>${station.genre ? `<small>${escHtml(station.genre)}</small>` : ''}</span>${isCurrent ? '<span class="cx-eq"><i></i><i></i><i></i></span>' : ''}<span class="cx-station-fav${fav ? ' on' : ''}" role="button" title="${fav ? 'Remove from My stations' : 'Add to My stations'}">★</span>`;
  div.querySelector('.cx-station-fav').addEventListener('click', (e) => {
    e.stopPropagation();
    send({ cmd: 'toggleStationFav', station: { name: station.name, genre: station.genre || '', url: station.url } });
  });
  div.addEventListener('click', () => {
    send({ cmd: 'radioPlay', station });
    // Fired directly inside this click's own handler (a genuine user
    // gesture), NOT from the later "state" broadcast that comes back over
    // the WebSocket - browsers require audio.play() to happen synchronously
    // within a user gesture or it's silently rejected (NotAllowedError),
    // and a WS round-trip breaks that chain. See radioBrowserPlay()'s own
    // comment for the full "why a separate <audio> element at all" story.
    radioBrowserPlay(station);
  });
  return div;
}

// ---------------------------------------------------------------------
// Playback on this phone/browser. The Pi's radio plays only on the Pi's own
// sink, so this plays it here too. Synced mode: the Pi sends the PCM it gives
// its speaker, each piece stamped with the Pi time the speaker plays it (see
// src/wsServer.js sendAudio). We estimate the Pi's clock and schedule each
// piece for that moment, less this device's own output delay.
// ---------------------------------------------------------------------
const syncAudio = { on: false, ctx: null, gain: null, next: 0, offset: 0, samples: [], timer: null, late: 0, extra: 0 };
function isAudioPacket(buf) {
  if (!(buf instanceof ArrayBuffer) || buf.byteLength < 20) return false;
  const b = new Uint8Array(buf, 0, 8);
  return b[0] === 77 && b[1] === 68 && b[2] === 65 && b[3] === 85 && b[4] === 68 && b[5] === 73 && b[6] === 79 && b[7] === 49; // 'MDAUDIO1'
}
function syncAudioStart() {
  try {
    syncAudio.ctx = syncAudio.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (syncAudio.ctx.state === 'suspended') syncAudio.ctx.resume();
    if (!syncAudio.gain) { syncAudio.gain = syncAudio.ctx.createGain(); syncAudio.gain.connect(syncAudio.ctx.destination); }
  } catch (e) { return; }
  syncAudio.on = true; syncAudio.next = 0; syncAudio.samples = []; syncAudio.extra = 0; syncAudio.late = 0;
  send({ cmd: 'audioSub', on: true });
  // Clock pings: quickly at first, then every few seconds.
  let n = 0;
  clearInterval(syncAudio.timer);
  syncAudio.timer = setInterval(() => { if (++n > 6 && n % 6) return; send({ cmd: 'clockPing', c: Date.now() }); }, 500);
}
// Phones pause web audio when the screen locks or the app is in the
// background; pick it up again on return and re-lock to the Pi's timing.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !syncAudio.on || !syncAudio.ctx) return;
  if (syncAudio.ctx.state !== 'running') syncAudio.ctx.resume().catch(() => {});
  syncAudio.next = 0; syncAudio.extra = 0;
  send({ cmd: 'clockPing', c: Date.now() });
});
function syncAudioStop() {
  if (!syncAudio.on) return;
  syncAudio.on = false;
  clearInterval(syncAudio.timer);
  send({ cmd: 'audioSub', on: false });
}
// The Pi's clock: from the replies with the shortest round trip (the most
// accurate), over the last dozen.
function syncClockPong(msg) {
  const now = Date.now(), rtt = now - msg.c;
  if (!(rtt >= 0 && rtt < 5000)) return;
  syncAudio.samples.push({ rtt, offset: msg.s - (msg.c + rtt / 2) });
  if (syncAudio.samples.length > 12) syncAudio.samples.shift();
  syncAudio.offset = syncAudio.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;
}
function handleSyncAudio(buf) {
  const a = syncAudio;
  if (!a.on || !a.ctx || !a.samples.length) return;
  const dv = new DataView(buf), playAt = dv.getFloat64(8, true), frames = (buf.byteLength - 16) >> 2;
  if (frames < 1) return;
  const ab = a.ctx.createBuffer(2, frames, 22050), L = ab.getChannelData(0), R = ab.getChannelData(1);
  for (let i = 0, o = 16; i < frames; i++, o += 4) { L[i] = dv.getInt16(o, true) / 32768; R[i] = dv.getInt16(o + 2, true) / 32768; }
  // Volume follows the overall slider at the top and the mute button, as on the Pi.
  const muted = Number(currentState.effectOptions?.radio?.volume ?? 0.8) <= 0;
  a.gain.gain.value = muted ? 0 : Math.max(0, Math.min(1, Number(currentState.prefs?.volume ?? 1)));
  const outDelay = (a.ctx.outputLatency || 0) + (a.ctx.baseLatency || 0);
  const when = a.ctx.currentTime + (playAt - a.offset - Date.now()) / 1000 - outDelay + a.extra + radioBrowserSyncMs() / 1000;
  if (when < a.ctx.currentTime + 0.01) {
    // Arrived too late: skip it and re-lock on the next. If that keeps
    // happening (a slow connection), add a little delay rather than go silent.
    a.next = 0;
    if (++a.late > 4) { a.late = 0; a.extra = Math.min(1, a.extra + 0.05); }
    return;
  }
  a.late = 0;
  // Back to back with the previous piece when it's close, so there are no clicks.
  // Pieces arrive stamped back to back; small timing jitter (network, clock
  // estimate) is ignored so playback stays seamless, and only a real jump re-times it.
  const start = a.next && Math.abs(when - a.next) < 0.15 && a.next > a.ctx.currentTime + 0.005 ? a.next : when;
  const src = a.ctx.createBufferSource();
  src.buffer = ab; src.connect(a.gain); src.start(start);
  a.next = start + ab.duration;
}

// "This browser" sync: a per-device nudge (ms, + = later) on top of the
// Pi's timing, for lining this device's sound up with the speaker by ear.
const RADIO_BROWSER_SYNC_KEY = 'multidisplay-radio-browser-sync';
function radioBrowserSyncMs() { try { const v = Number(localStorage.getItem(RADIO_BROWSER_SYNC_KEY)); return Number.isFinite(v) ? Math.max(-2000, Math.min(2000, v)) : 0; } catch (e) { return 0; } }
function setRadioBrowserSyncMs(v) { try { localStorage.setItem(RADIO_BROWSER_SYNC_KEY, String(v)); } catch (e) { /* storage unavailable */ } syncAudio.next = 0; }

const RADIO_BROWSER_PLAY_KEY = 'multidisplay-radio-browser-play';
function radioBrowserPlaybackWanted() {
  try { return localStorage.getItem(RADIO_BROWSER_PLAY_KEY) !== '0'; } catch (err) { return true; } // default ON
}
function setRadioBrowserPlaybackWanted(on) {
  try { localStorage.setItem(RADIO_BROWSER_PLAY_KEY, on ? '1' : '0'); } catch (err) { /* ignore */ }
}
// Web Audio graph for #radio-browser-audio. A MediaElementAudioSourceNode on a
// non-CORS source still plays audibly; only analysis reads zeros. The graph is
// always created, with crossOrigin='anonymous', BEFORE play() inside the same
// synchronous click handler; creating it later or async broke playback.
let _raCtx = null, _raAnalyser = null, _raSource = null, _raBuf = null, _raRunning = false;
let _raSilent = false, _raSilentTimer = 0, _raLastLevel = 0;
function radioEnsureGraph() {
  const el = document.getElementById('radio-browser-audio');
  if (!el) return false;
  try {
    _raCtx = _raCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (_raCtx.state === 'suspended') _raCtx.resume();
    if (!_raSource) {
      _raSource = _raCtx.createMediaElementSource(el);
      _raAnalyser = _raCtx.createAnalyser();
      _raAnalyser.fftSize = 2048;
      _raAnalyser.smoothingTimeConstant = 0.45;
      _raBuf = new Uint8Array(_raAnalyser.frequencyBinCount);
      // Route through the analyser AND back out to speakers - creating a
      // MediaElementSource replaces the <audio> tag's default output path,
      // so without this explicit connect() the stream would play silently.
      _raSource.connect(_raAnalyser);
      _raAnalyser.connect(_raCtx.destination);
    }
    return true;
  } catch (err) { return false; } // e.g. no Web Audio API support - falls back to the element's own native playback below
}
function radioBrowserPlay(station) {
  if (!radioBrowserPlaybackWanted() || !station || !station.url) return;
  if (!window.MULTIDISPLAY_SIM) { syncAudioStart(); return; } // on the Pi: play the Pi's own audio, in step with the speaker
  const el = document.getElementById('radio-browser-audio');
  if (!el) return;
  radioEnsureGraph();
  _raSilent = false; _raSilentTimer = 0; _raLastLevel = 0;
  // /api/debugTone streams one finite WAV clip, while the Pi loops the sweep by
  // relaunching ffmpeg. `loop` replays the already-downloaded clip with no extra
  // request, so the sound keeps up with the looping bars.
  el.loop = !!station.loop;
  // A YouTube start offset ('#mdss=N', see src/youtube.js) becomes a media fragment.
  const src = station.url.replace(/#mdss=(\d+(?:\.\d+)?)$/, '#t=$1');
  if (el.src !== src) el.src = src;
  el.play().catch(() => { /* autoplay blocked or stream unreachable - #radio-status-el already shows the Pi-side status regardless */ });
  if (!_raRunning) { _raRunning = true; _raLastMs = 0; requestAnimationFrame(radioAnalyserTick); }
}
function radioBrowserStop() {
  if (!window.MULTIDISPLAY_SIM) syncAudioStop();
  const el = document.getElementById('radio-browser-audio');
  if (!el) return;
  el.pause();
  el.removeAttribute('src');
  el.load();
}

// Reads the analyser every frame. Only useful in the simulator, where
// window.PiEngine.EFFECTS.radio.audio exists; on a real Pi this loop no-ops.
// Bucketing and smoothing are ported from the original app. If the level stays
// near zero for 4+ seconds while playing, the stream doesn't allow analysis
// (no CORS), so bars ease to idle; audible playback is unaffected.
let _raLastMs = 0;
function radioAnalyserTick(nowMs) {
  requestAnimationFrame(radioAnalyserTick);
  const el = document.getElementById('radio-browser-audio');
  const audio = window.PiEngine?.EFFECTS?.radio?.audio;
  const dt = Math.max(0.005, Math.min(0.5, (nowMs - (_raLastMs || nowMs)) / 1000));
  _raLastMs = nowMs;
  if (!_raAnalyser || !audio || !el || el.paused) return;
  if (!_raSilent) {
    _raAnalyser.getByteFrequencyData(_raBuf);
    const AB = audio.spec.length, nb = _raBuf.length, minBin = 1;
    // maxBin capped to ~80% of the true Nyquist-adjacent bin, not nb-1 - a
    // real report ("even with gain high, the right 3 bars don't move").
    // Gain can't amplify signal that isn't there: the bins right next to
    // Nyquist carry essentially zero energy for ANY real-world audio (every
    // encode/playback pipeline anti-alias-filters well below Nyquist, and
    // lossy internet radio streams roll off earlier still, often ~16kHz).
    // Mapping the last few display bars all the way out to that
    // acoustically-dead edge meant they could never show real movement
    // regardless of gain - capping the usable range to a realistic top
    // frequency keeps every displayed bar inside the range that actually
    // carries content.
    const maxBin = Math.max(minBin + 1, Math.round((nb - 1) * 0.8));
    let lo = minBin, level = 0;
    for (let b = 0; b < AB; b++) {
      const frac = (b + 1) / AB;
      let hi = Math.round(minBin * Math.pow(maxBin / minBin, frac));
      if (hi <= lo) hi = lo + 1;
      hi = Math.min(hi, maxBin);
      let sum = 0, count = 0;
      for (let k = lo; k <= hi; k++) { sum += _raBuf[k]; count++; }
      const raw = count > 0 ? (sum / count) / 255 : 0;
      if (raw > level) level = raw;
      const trebleBoost = 1 + frac * 1.8;
      const target = Math.min(1, raw * trebleBoost);
      if (target > audio.spec[b]) audio.spec[b] += (target - audio.spec[b]) * Math.min(1, dt * 20);
      else audio.spec[b] += (target - audio.spec[b]) * Math.min(1, dt * 7);
      if (audio.spec[b] > audio.peak[b]) { audio.peak[b] = audio.spec[b]; audio._peakVel[b] = 0; }
      else { audio._peakVel[b] += dt * 1.2; audio.peak[b] = Math.max(0, audio.peak[b] - audio._peakVel[b] * dt); }
      lo = hi + 1;
      if (lo > maxBin) lo = maxBin;
    }
    _raLastLevel += (level - _raLastLevel) * Math.min(1, dt * 3);
    if (_raLastLevel <= 0.04) _raSilentTimer += dt; else _raSilentTimer = 0;
    if (_raSilentTimer > 4) {
      _raSilent = true;
      const statusEl = document.querySelector('.radio-status-el');
      if (statusEl) statusEl.textContent += ' (visualizer unavailable — station blocks audio analysis)';
    }
  } else {
    for (let b = 0; b < audio.spec.length; b++) {
      audio.spec[b] += (0 - audio.spec[b]) * Math.min(1, dt * 7);
      if (audio.spec[b] > audio.peak[b]) audio.peak[b] = audio.spec[b];
      else { audio._peakVel[b] += dt * 1.2; audio.peak[b] = Math.max(0, audio.peak[b] - audio._peakVel[b] * dt); }
    }
  }
}

function wireRadioPanel() {
  const panel = document.getElementById('panel-radio');
  if (!panel) return;

  panel.querySelectorAll('.radio-stop-btn-el').forEach((btn) => btn.addEventListener('click', () => { send({ cmd: 'radioStop' }); radioBrowserStop(); }));
  // Debug mode: two server-generated test tones for checking the spectrum
  // analyser (see radio.js's DEBUG_TONES). The WS command drives the Pi-side
  // pipeline. Its `debug:` URL isn't fetchable by a browser, so when "Play in
  // this browser" is on the <audio> element uses the separate /api/debugTone route.
  const playDebugTone = (kind, freq) => {
    send({ cmd: 'radioDebugTone', kind, freq });
    if (radioBrowserPlaybackWanted()) {
      // 'sweep' loops (see radioBrowserPlay()'s own comment) - matches the
      // Pi-side pipeline, which relaunches the sweep indefinitely but
      // plays drum/tone once.
      radioBrowserPlay({ url: '/api/debugTone?kind=' + kind + (freq != null ? '&freq=' + freq : ''), loop: kind === 'sweep' });
    }
  };
  document.querySelectorAll('.radio-debug-sweep-btn-el').forEach((btn) => btn.addEventListener('click', () => playDebugTone('sweep')));
  document.querySelectorAll('.radio-debug-drum-btn-el').forEach((btn) => btn.addEventListener('click', () => playDebugTone('drum')));
  // Frequency slider - a real follow-up ("add a scroll bar to the sweep
  // test so I can select the freq"), then ("the freq needs to change as I
  // scroll" - shortened from an initial 300ms debounce to 80ms so it
  // tracks the drag live rather than only updating once you stop moving.
  // Still debounced, not fired on every 'input' tick, since each change
  // restarts the debug ffmpeg process and firing on literally every
  // pixel of drag would thrash it badly.
  let debugFreqDebounce = null;
  document.querySelectorAll('.radio-debug-freq-el').forEach((sl) => {
    const valEl = panel.querySelector('.radio-debug-freq-val-el');
    sl.addEventListener('input', () => {
      if (valEl) valEl.textContent = sl.value + ' Hz';
      clearTimeout(debugFreqDebounce);
      debugFreqDebounce = setTimeout(() => playDebugTone('tone', Number(sl.value)), 80);
    });
  });
  const browserPlayChk = panel.querySelector('.radio-browser-play-el');
  if (browserPlayChk) {
    browserPlayChk.checked = radioBrowserPlaybackWanted();
    browserPlayChk.addEventListener('change', () => {
      setRadioBrowserPlaybackWanted(browserPlayChk.checked);
      if (browserPlayChk.checked) {
        // Turning the checkbox ON is itself a user gesture, so a currently-
        // playing station can start in this browser right now too, not
        // just the next time one is picked.
        const current = currentState.effectStatus?.radio?.station;
        if (current && currentState.effectStatus?.radio?.playing) radioBrowserPlay(current);
      } else {
        radioBrowserStop();
      }
    });
  }

  const searchInput = panel.querySelector('.radio-search-input-el');
  const doSearch = () => send({ cmd: 'radioSearch', query: (searchInput?.value || '').trim() });
  panel.querySelector('.radio-search-btn-el')?.addEventListener('click', doSearch);
  searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  panel.querySelector('.radio-browse-top-btn-el')?.addEventListener('click', () => { if (searchInput) searchInput.value = ''; send({ cmd: 'radioSearch', query: '' }); });

  // Featured list is static - render once, click handlers close over the
  // fixed station objects (syncRadioPanel only re-renders it for the
  // "which one is currently playing" highlight, via a full re-render below).
  const featuredEl = panel.querySelector('.radio-station-list-el');
  if (featuredEl) renderFeaturedList(featuredEl, null);

  // Spectrum Analyser sub-panel - the .ov-chk[data-ov="spectrum"] checkbox
  // here is ALSO caught by wireOverlaysPanel's generic loop (sends a
  // harmless setOverlay for a key wsServer.js doesn't recognise, see that
  // function's comment) - this listener does the real work.
  const spectrumChk = panel.querySelector('.ov-chk[data-ov="spectrum"]');
  // The switch shows whether the spectrum is ON SCREEN: turning it on
  // brings the spectrum up, turning it off goes back to the previous effect.
  if (spectrumChk) spectrumChk.addEventListener('change', () => {
    const showing = currentState.effect === 'radio' && !!currentState.effectOptions?.radio?.spectrumOn;
    if (spectrumChk.checked !== showing) cxToggleSpectrum();
  });

  panel.querySelectorAll('.spectrum-bands-btn[data-bands]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.spectrum-bands-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('radio', 'bands', Number(btn.dataset.bands));
    });
  });
  // One Style list: the animated scenes (v2) and the classic styles (v1).
  panel.querySelector('#au-look-sel')?.addEventListener('change', (e) => {
    const [ver, key] = e.target.value.split(':');
    if (ver === 'v1') { setEffectOption('radio', 'version', 1); setEffectOption('radio', 'style', key); }
    else { setEffectOption('radio', 'version', 2); setEffectOption('radio', 'scene', key); }
    const v1Row = document.getElementById('au-v1-row'); if (v1Row) v1Row.hidden = ver !== 'v1';
  });


  panel.querySelectorAll('.au-theme-btn[data-autheme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.au-theme-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('radio', 'theme', Number(btn.dataset.autheme));
    });
  });
  panel.querySelectorAll('.au-barmode-btn[data-barmode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.au-barmode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('radio', 'barMode', btn.dataset.barmode);
    });
  });
  const fitScreenChk = panel.querySelector('.sp-fit-screen-el');
  if (fitScreenChk) fitScreenChk.addEventListener('change', () => setEffectOption('radio', 'fitToScreen', fitScreenChk.checked));
  const autoGainChk = panel.querySelector('.au-autogain-el');
  if (autoGainChk) autoGainChk.addEventListener('change', () => setEffectOption('radio', 'autoGain', autoGainChk.checked));
  const gainSlider = panel.querySelector('.au-gain-el'), gainVal = panel.querySelector('.au-gain-val-el');
  if (gainSlider) gainSlider.addEventListener('input', () => {
    if (gainVal) gainVal.textContent = Number(gainSlider.value).toFixed(1) + '×';
    setEffectOption('radio', 'gain', Number(gainSlider.value));
  });
  const syncSlider = panel.querySelector('.au-sync-el'), syncVal = panel.querySelector('.au-sync-val-el');
  if (syncSlider) syncSlider.addEventListener('input', () => {
    if (syncVal) syncVal.textContent = syncSlider.value + 'ms';
    setEffectOption('radio', 'syncMs', Number(syncSlider.value));
  });
  const bSync = panel.querySelector('.au-bsync-el'), bSyncVal = panel.querySelector('.au-bsync-val-el');
  if (bSync) {
    const show = () => { if (bSyncVal) bSyncVal.textContent = (bSync.value > 0 ? '+' : '') + bSync.value + 'ms'; };
    bSync.value = radioBrowserSyncMs(); show();
    bSync.addEventListener('input', () => { show(); setRadioBrowserSyncMs(Number(bSync.value)); });
  }
  const syncAuto = panel.querySelector('.au-sync-auto-el');
  if (syncAuto) syncAuto.addEventListener('change', () => {
    if (syncSlider) syncSlider.disabled = syncAuto.checked;
    setEffectOption('radio', 'syncAuto', syncAuto.checked);
  });
  const scrollSlider = panel.querySelector('.au-scroll-speed-el'), scrollVal = panel.querySelector('.au-scroll-speed-val-el');
  if (scrollSlider) scrollSlider.addEventListener('input', () => {
    if (scrollVal) scrollVal.textContent = scrollSlider.value;
    setEffectOption('radio', 'scrollSpeed', Number(scrollSlider.value));
  });
}

// Featured stations as a dropdown (a long list of rows was too much); picking
// one plays it straight away, like tapping a row.
function renderFeaturedList(el, current) {
  let sel = el.querySelector('select');
  if (!sel) {
    sel = document.createElement('select');
    sel.className = 'tm-select'; sel.style.width = '100%'; sel.setAttribute('aria-label', 'Featured stations');
    sel.addEventListener('change', () => {
      const station = RADIO_STATIONS[Number(sel.value)];
      if (!station) return;
      send({ cmd: 'radioPlay', station });
      radioBrowserPlay(station); // in this same tap, so phone audio may start
    });
    el.replaceChildren(sel);
  }
  const idx = current ? RADIO_STATIONS.findIndex((x) => x.url === current.url) : -1;
  const pick = document.createElement('option'); pick.value = ''; pick.textContent = '▶ Pick a featured station…';
  sel.replaceChildren(pick, ...RADIO_STATIONS.map((st, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = (i === idx ? '♪ ' : '') + st.name + (st.genre ? ' - ' + st.genre : ''); return o; }));
  if (document.activeElement !== sel) sel.value = idx >= 0 ? String(idx) : '';
}

function renderSearchResults(el, results, current) {
  el.innerHTML = '';
  if (!results || !results.length) return;
  results.forEach((s) => el.appendChild(radioStationRow(s, current)));
}

// Recently played stations (this device), one tap to play again.
let recentStationsKey = null;
function syncRecentStations(playing) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('recentStations') || '[]'); } catch (e) { /* storage unavailable */ }
  if (playing && playing.url && !String(playing.url).startsWith('debug') && (!list[0] || list[0].url !== playing.url)) {
    list = [{ name: playing.name, genre: playing.genre || '', url: playing.url }, ...list.filter((x) => x.url !== playing.url)].slice(0, 6);
    try { localStorage.setItem('recentStations', JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  }
  const shown = list.filter((x) => !playing || x.url !== playing.url);
  const key = shown.map((x) => x.url).join('|');
  if (key === recentStationsKey) return;
  recentStationsKey = key;
  const wrap = document.getElementById('radio-recent-wrap'), row = document.getElementById('radio-recent');
  if (!wrap || !row) return;
  wrap.hidden = !shown.length;
  row.replaceChildren(...shown.map((st) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '📻 ' + st.name; b.title = 'Play ' + st.name + (st.genre ? ' (' + st.genre + ')' : '');
    b.addEventListener('click', () => { send({ cmd: 'radioPlay', station: st }); radioBrowserPlay(st); });
    return b;
  }));
}

function syncRadioPanel() {
  updateActiveEffectLabel();
  const panel = document.getElementById('panel-radio');
  if (!panel) return;
  const status = currentState.effectStatus?.radio;
  const opts = currentState.effectOptions?.radio || {};
  const current = status?.station || null;
  syncRecentStations(status && status.playing ? current : null);

  panel.querySelectorAll('.radio-status-el').forEach((el) => {
    if (!status) { el.textContent = 'Pick a station'; return; }
    if (!status.playing) { el.textContent = 'Stopped'; return; }
    const parts = [status.status];
    if (status.playbackStatus && !/^Starting playback/.test(status.playbackStatus)) parts.push(status.playbackStatus);
    el.textContent = (current ? '▶ ' + current.name + (current.genre ? ' — ' + current.genre : '') + ' — ' : '') + parts.join(' — ');
  });

  const searchStatusEls = panel.querySelectorAll('.radio-search-status-el');
  const search = status?.search;
  searchStatusEls.forEach((el) => {
    if (!search) { el.textContent = ''; return; }
    if (search.searching) { el.textContent = 'Searching…'; return; }
    if (search.error) { el.textContent = '✕ ' + search.error; return; }
    el.textContent = search.results.length ? search.results.length + ' stations found' : '';
  });
  const resultsEl = panel.querySelector('.radio-search-results-el');
  if (resultsEl && search) renderSearchResults(resultsEl, search.results, current);

  // Re-render when the playing station or the favourites change (stars).
  const favs = currentState.prefs?.stations || [];
  const listKey = (current?.url || '') + '|' + favs.map((x) => x.url).join(',');
  const featuredEl = panel.querySelector('.radio-station-list-el');
  if (featuredEl && featuredEl.dataset.lastCurrent !== listKey) {
    featuredEl.dataset.lastCurrent = listKey;
    renderFeaturedList(featuredEl, current);
    const favEl = panel.querySelector('.radio-fav-list-el');
    if (favEl) {
      favEl.replaceChildren(...favs.map((st) => radioStationRow(st, current)));
      if (!favs.length) favEl.innerHTML = '<div class="ui-note">Tap ★ on any station to keep it here.</div>';
    }
    if (resultsEl && search) renderSearchResults(resultsEl, search.results, current);
  }

  const spectrumChk = panel.querySelector('.ov-chk[data-ov="spectrum"]');
  const spectrumOptions = panel.querySelector('.ov-options-el[data-ov="spectrum"]');
  const spectrumOn = !!opts.spectrumOn;
  if (spectrumChk) spectrumChk.checked = spectrumOn && currentState.effect === 'radio';
  if (spectrumOptions) spectrumOptions.style.display = spectrumOn ? '' : 'none';
  panel.querySelectorAll('.spectrum-bands-btn[data-bands]').forEach((btn) => btn.classList.toggle('active', Number(btn.dataset.bands) === (opts.bands ?? 64)));
  const isV1 = opts.version === 1;
  const lookSel = panel.querySelector('#au-look-sel');
  if (lookSel && document.activeElement !== lookSel) {
    lookSel.value = isV1 ? 'v1:' + (opts.style || 'glow') : 'v2:' + (opts.scene || 'auto');
    if (lookSel.selectedIndex < 0) lookSel.value = 'v2:auto'; // a choice from an older version
  }
  const v1Row = document.getElementById('au-v1-row'); if (v1Row) v1Row.hidden = !isV1;
  panel.querySelectorAll('.au-theme-btn[data-autheme]').forEach((btn) => btn.classList.toggle('active', Number(btn.dataset.autheme) === (opts.theme ?? 5)));
  panel.querySelectorAll('.au-barmode-btn[data-barmode]').forEach((btn) => btn.classList.toggle('active', btn.dataset.barmode === (opts.barMode || 'solid')));

  const fitScreenChk = panel.querySelector('.sp-fit-screen-el');
  if (fitScreenChk && document.activeElement !== fitScreenChk) fitScreenChk.checked = !!opts.fitToScreen;
  const autoGainChk = panel.querySelector('.au-autogain-el');
  // Defaults to ON (opts.autoGain !== false), not off - see radio.js's
  // effectRadio() for the matching server-side default change.
  if (autoGainChk && document.activeElement !== autoGainChk) autoGainChk.checked = opts.autoGain !== false;
  const gainSlider = panel.querySelector('.au-gain-el'), gainVal = panel.querySelector('.au-gain-val-el');
  if (gainSlider && document.activeElement !== gainSlider) { gainSlider.value = opts.gain ?? 2; if (gainVal) gainVal.textContent = Number(gainSlider.value).toFixed(1) + '×'; }
  const syncSlider = panel.querySelector('.au-sync-el'), syncVal = panel.querySelector('.au-sync-val-el');
  const syncAutoEl = panel.querySelector('.au-sync-auto-el'), autoOn = opts.syncAuto !== false; // Auto sync is the default
  if (syncAutoEl) syncAutoEl.checked = autoOn;
  if (syncSlider) syncSlider.disabled = autoOn;
  if (autoOn) {
    // Auto speaker sync: show what the Pi measured (see ffmpegAudio.js _measureLatency).
    const m = currentState.effectStatus?.radio?.autoSyncMs;
    if (syncVal) syncVal.textContent = Number.isFinite(m) ? m + 'ms' : '~200ms';
    if (syncSlider && Number.isFinite(m)) syncSlider.value = m;
  } else if (syncSlider && document.activeElement !== syncSlider) { syncSlider.value = opts.syncMs ?? 200; if (syncVal) syncVal.textContent = syncSlider.value + 'ms'; }
  const scrollSlider = panel.querySelector('.au-scroll-speed-el'), scrollVal = panel.querySelector('.au-scroll-speed-val-el');
  if (scrollSlider && document.activeElement !== scrollSlider) { scrollSlider.value = opts.scrollSpeed ?? 0; if (scrollVal) scrollVal.textContent = scrollSlider.value; }
}

