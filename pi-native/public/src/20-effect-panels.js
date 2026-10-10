// ---------------------------------------------------------------------
// Earth Live View (panel-epic) - "Refresh Earth Image" button sends a
// fresh timestamp as effectOptions.epic.refreshRequestedAt; effects/epic.js
// treats any change to that value as "force a re-fetch now", same trick
// used because setEffectOption is a value-store, not a fire-once command
// channel (see wsServer.js's setEffectOption comment). Status readout
// mirrors effects/epic.js's getStatus() shape (caption/date/lat/lon/
// fetching/error), same convention as syncWeatherPanel()/syncCamPanel().
// ---------------------------------------------------------------------
function wireEpicPanel() {
  const panel = document.getElementById('panel-epic');
  if (!panel) return;
  const btn = panel.querySelector('#epic-fetch-btn');
  if (btn) btn.addEventListener('click', () => setEffectOption('epic', 'refreshRequestedAt', Date.now()));
}

function syncEpicPanel() {
  const panel = document.getElementById('panel-epic');
  if (!panel) return;
  const status = currentState.effectStatus?.epic;
  const statusEl = panel.querySelector('#epic-status');
  const infoEl = panel.querySelector('#epic-info');
  const dateEl = panel.querySelector('#epic-date-line');
  const coordEl = panel.querySelector('#epic-coord-line');
  if (!status) { if (statusEl) statusEl.textContent = 'Not fetched yet'; return; }
  if (status.fetching) { if (statusEl) statusEl.textContent = 'Fetching latest Earth image…'; return; }
  if (status.error) { if (statusEl) statusEl.textContent = '✕ ' + status.error; return; }
  if (!status.caption) { if (statusEl) statusEl.textContent = 'Not fetched yet'; return; }
  if (statusEl) statusEl.textContent = status.imgError ? '✕ ' + status.imgError : status.caption;
  if (infoEl) infoEl.style.display = 'block';
  if (dateEl) dateEl.textContent = 'Captured: ' + status.date + ' UTC';
  if (coordEl) coordEl.textContent = (status.lat != null) ? `Centroid: ${status.lat.toFixed(1)}°, ${status.lon.toFixed(1)}°` : '';
}

// ---------------------------------------------------------------------
// ISS Tracker (panel-iss) - "Refresh Position" button sends a fresh
// timestamp as effectOptions.iss.refreshRequestedAt; effects/iss.js treats
// any change to that value as "force a re-fetch now", same trick as
// wireEpicPanel() above (setEffectOption is a value-store, not a fire-once
// command channel - see wsServer.js's setEffectOption comment). Status
// readout mirrors effects/iss.js's getStatus() shape (hasFix/lat/lon/
// timestamp/fetching/error/countryCode/countryName).
// ---------------------------------------------------------------------
function wireIssPanel() {
  const panel = document.getElementById('panel-iss');
  if (!panel) return;
  const btn = panel.querySelector('#iss-fetch-btn');
  if (btn) btn.addEventListener('click', () => setEffectOption('iss', 'refreshRequestedAt', Date.now()));
}

function syncIssPanel() {
  const panel = document.getElementById('panel-iss');
  if (!panel) return;
  const status = currentState.effectStatus?.iss;
  const statusEl = panel.querySelector('#iss-status');
  const infoEl = panel.querySelector('#iss-info');
  const coordEl = panel.querySelector('#iss-coord-line');
  const timeEl = panel.querySelector('#iss-time-line');
  const countryEl = panel.querySelector('#iss-country-line');
  if (!status) { if (statusEl) statusEl.textContent = 'Not fetched yet'; return; }
  if (status.fetching) { if (statusEl) statusEl.textContent = 'Fetching…'; return; }
  if (status.error) { if (statusEl) statusEl.textContent = '✕ ' + status.error; return; }
  if (!status.hasFix) { if (statusEl) statusEl.textContent = 'Not fetched yet'; return; }
  if (statusEl) statusEl.textContent = `Tracking — fix at ${new Date(status.timestamp * 1000).toLocaleTimeString()}`;
  if (infoEl) infoEl.style.display = 'block';
  if (coordEl) coordEl.textContent = `Lat ${status.lat.toFixed(2)}°  Lon ${status.lon.toFixed(2)}°`;
  if (timeEl) timeEl.textContent = 'Last fix: ' + new Date(status.timestamp * 1000).toLocaleTimeString();
  if (countryEl) countryEl.textContent = 'Currently over: ' + (status.countryCode ? status.countryName : 'International waters');
}

// ---------------------------------------------------------------------
// Near-Earth Objects (panel-neo) - "Refresh Tracking Data" button sends a
// fresh timestamp as effectOptions.neo.refreshRequestedAt; effects/neo.js
// treats any change to that value as "force a re-fetch now", same trick
// as wireEpicPanel()/wireIssPanel() above (setEffectOption is a
// value-store, not a fire-once command channel - see wsServer.js's
// setEffectOption comment). Status readout mirrors effects/neo.js's
// getStatus() shape (count/closest/risk/fetching/error).
// ---------------------------------------------------------------------
function wireNeoPanel() {
  const panel = document.getElementById('panel-neo');
  if (!panel) return;
  const btn = panel.querySelector('#neo-fetch-btn');
  if (btn) btn.addEventListener('click', () => setEffectOption('neo', 'refreshRequestedAt', Date.now()));
}

function syncNeoPanel() {
  const panel = document.getElementById('panel-neo');
  if (!panel) return;
  const status = currentState.effectStatus?.neo;
  const statusEl = panel.querySelector('#neo-status');
  const infoEl = panel.querySelector('#neo-info');
  const closestEl = panel.querySelector('#neo-closest-line');
  const riskEl = panel.querySelector('#neo-risk-line');
  if (!status) { if (statusEl) statusEl.textContent = 'Not fetched yet'; return; }
  if (status.fetching) { if (statusEl) statusEl.textContent = 'Fetching near-Earth object data…'; return; }
  if (status.error) { if (statusEl) statusEl.textContent = '✕ ' + status.error; return; }
  if (!status.count) { if (statusEl) statusEl.textContent = 'Not fetched yet'; return; }
  if (statusEl) statusEl.textContent = status.text || `${status.count} objects tracked`;
  if (infoEl) infoEl.style.display = 'block';
  if (closestEl) closestEl.textContent = status.closest ? `Closest: ${status.closest.name} — ${status.closest.missLD.toFixed(1)} LD` : 'Closest: —';
  if (riskEl) riskEl.textContent = 'Risk level: ' + (status.risk || '—').toUpperCase();
}

// ---------------------------------------------------------------------
// Colour Rain's Style buttons (panel-rain) - core.effectOptions.rain.style.
// ---------------------------------------------------------------------
function wireRainPanel() {
  document.querySelectorAll('.rain-style-btn[data-rainstyle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rain-style-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('rain', 'style', btn.dataset.rainstyle);
    });
  });
}

function syncRainPanel() {
  const style = currentState.effectOptions?.rain?.style || 'colour';
  document.querySelectorAll('.rain-style-btn[data-rainstyle]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.rainstyle === style);
  });
}

// ---------------------------------------------------------------------
// Light Speed's option panel (panel-lightspeed) - sliders for
// speed/trail/count, button groups for size/nudge/colour, all backed by
// core.effectOptions.lightspeed.*.
// ---------------------------------------------------------------------
function wireLightspeedPanel() {
  const panel = document.getElementById('panel-lightspeed');
  if (!panel) return;

  const speed = panel.querySelector('#ls-speed'), speedVal = panel.querySelector('#ls-speed-val');
  if (speed) speed.addEventListener('input', () => {
    if (speedVal) speedVal.textContent = speed.value;
    setEffectOption('lightspeed', 'speed', Number(speed.value));
  });

  const trail = panel.querySelector('#ls-trail'), trailVal = panel.querySelector('#ls-trail-val');
  if (trail) trail.addEventListener('input', () => {
    if (trailVal) trailVal.textContent = trail.value;
    setEffectOption('lightspeed', 'trail', Number(trail.value));
  });

  const count = panel.querySelector('#ls-count'), countVal = panel.querySelector('#ls-count-val');
  if (count) count.addEventListener('input', () => {
    if (countVal) countVal.textContent = count.value;
    setEffectOption('lightspeed', 'count', Number(count.value));
  });

  const wireButtonGroup = (selector, dataAttr, key, parse) => {
    panel.querySelectorAll(selector).forEach((btn) => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll(selector).forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        setEffectOption('lightspeed', key, parse(btn.dataset[dataAttr]));
      });
    });
  };
  wireButtonGroup('[data-ls-size]', 'lsSize', 'size', Number);
  wireButtonGroup('[data-ls-nudge]', 'lsNudge', 'nudge', Number);
  wireButtonGroup('[data-ls-col]', 'lsCol', 'colour', String);
}

function syncLightspeedPanel() {
  const panel = document.getElementById('panel-lightspeed');
  if (!panel) return;
  const opts = currentState.effectOptions?.lightspeed || {};
  const speed = panel.querySelector('#ls-speed'), speedVal = panel.querySelector('#ls-speed-val');
  if (speed && document.activeElement !== speed) { speed.value = opts.speed ?? 8; if (speedVal) speedVal.textContent = speed.value; }
  const trail = panel.querySelector('#ls-trail'), trailVal = panel.querySelector('#ls-trail-val');
  if (trail && document.activeElement !== trail) { trail.value = opts.trail ?? 32; if (trailVal) trailVal.textContent = trail.value; }
  const count = panel.querySelector('#ls-count'), countVal = panel.querySelector('#ls-count-val');
  if (count && document.activeElement !== count) { count.value = opts.count ?? 8; if (countVal) countVal.textContent = count.value; }
  panel.querySelectorAll('[data-ls-size]').forEach((b) => b.classList.toggle('active', Number(b.dataset.lsSize) === (opts.size ?? 1)));
  panel.querySelectorAll('[data-ls-nudge]').forEach((b) => b.classList.toggle('active', Number(b.dataset.lsNudge) === (opts.nudge ?? 0)));
  panel.querySelectorAll('[data-ls-col]').forEach((b) => b.classList.toggle('active', b.dataset.lsCol === (opts.colour || 'multi')));
}

// ---------------------------------------------------------------------
// Weather's option panel (panel-weather): city search plus live status
// readouts from effectStatus.weather.
// ---------------------------------------------------------------------
// City autocomplete: queries Open-Meteo geocoding from the browser (250 ms
// debounce) and shows country/region so ambiguous names can be picked
// exactly. Picking an entry sends "City, Country" immediately, like GO.
let _wxCityTimer = null;
function wireWeatherCityDropdown(cityInput, dropdown) {
  if (!cityInput || !dropdown) return;
  const query = () => {
    const q = cityInput.value.trim();
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    clearTimeout(_wxCityTimer);
    _wxCityTimer = setTimeout(() => {
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&format=json`)
        .then((r) => r.json())
        .then((data) => {
          const results = data.results || [];
          if (!results.length) { dropdown.style.display = 'none'; return; }
          dropdown.innerHTML = '';
          results.forEach((r) => {
            const label = `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}${r.country ? ', ' + r.country : ''}`;
            const short = r.country ? `${r.name}, ${r.country}` : r.name;
            const row = document.createElement('div');
            row.style.cssText = 'padding:6px 8px;cursor:pointer;font-size:13px;color:#9bd;border-bottom:1px solid rgba(80,120,255,0.1);';
            row.textContent = label;
            row.addEventListener('click', () => {
              cityInput.value = short;
              dropdown.style.display = 'none';
              setEffectOption('weather', 'city', short);
            });
            dropdown.appendChild(row);
          });
          dropdown.style.display = 'block';
        })
        .catch(() => { dropdown.style.display = 'none'; });
    }, 250);
  };
  cityInput.addEventListener('input', query);
  cityInput.addEventListener('focus', query);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#wx-city') && !e.target.closest('#wx-city-dropdown')) dropdown.style.display = 'none';
  });
}

function wireWeatherPanel() {
  const panel = document.getElementById('panel-weather');
  if (!panel) return;
  const cityInput = panel.querySelector('#wx-city');
  const dropdown = panel.querySelector('#wx-city-dropdown');
  const goBtn = panel.querySelector('#wx-fetch-btn');
  const submit = () => {
    const city = (cityInput?.value || '').trim();
    if (city) setEffectOption('weather', 'city', city);
    if (dropdown) dropdown.style.display = 'none';
  };
  if (goBtn) goBtn.addEventListener('click', submit);
  if (cityInput) cityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  wireWeatherCityDropdown(cityInput, dropdown);
}

function syncWeatherPanel() {
  const panel = document.getElementById('panel-weather');
  if (!panel) return;
  const status = currentState.effectStatus?.weather;
  const statusEl = panel.querySelector('#wx-status');
  const infoEl = panel.querySelector('#wx-info');
  const tempEl = panel.querySelector('#wx-temp-line');
  const descEl = panel.querySelector('#wx-desc-line');
  const sunEl = panel.querySelector('#wx-sun-line');
  // Show the server's current city in the input, unless the user is typing.
  // When effectOptions.weather.city is empty, use status.city (the server's
  // resolved name, including its DEFAULT_CITY fallback), so the box always
  // matches what the panels show.
  const cityInput = panel.querySelector('#wx-city');
  const optCity = currentState.effectOptions?.weather?.city || status?.city;
  if (cityInput && document.activeElement !== cityInput && optCity && cityInput.value !== optCity) {
    cityInput.value = optCity;
  }
  if (!status) { if (statusEl) statusEl.textContent = 'Enter city and press GO'; return; }
  if (status.fetching) { if (statusEl) statusEl.textContent = 'Fetching...'; return; }
  if (status.error) { if (statusEl) statusEl.textContent = 'Error: ' + status.error; return; }
  if (!status.city) { if (statusEl) statusEl.textContent = 'Enter city and press GO'; return; }
  if (statusEl) statusEl.textContent = status.city;
  if (infoEl) infoEl.style.display = 'block';
  if (tempEl) tempEl.textContent = (status.temp ?? '?') + '°C';
  if (descEl) descEl.textContent = status.desc || '';
  if (sunEl && Number.isFinite(status.sunriseS) && Number.isFinite(status.sunsetS)) {
    const fmt = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
    sunEl.textContent = `☀ ${fmt(status.sunriseS)} - ${fmt(status.sunsetS)}`;
  }
}

// ---------------------------------------------------------------------
// Maze Runner's option panel (panel-maze) - Runners slider + "NEW MAZE"
// button, backed by core.effectOptions.maze.runners/newMaze (see maze.js's
// module comment for how the button's rebuild-now behaviour works without
// a dedicated one-shot WS command - a monotonically increasing token).
// ---------------------------------------------------------------------
let _mazeToken = 0;
function wireMazePanel() {
  const panel = document.getElementById('panel-maze');
  if (!panel) return;
  const runners = panel.querySelector('#mz-runners'), runnersVal = panel.querySelector('#mz-runners-val');
  if (runners) runners.addEventListener('input', () => {
    if (runnersVal) runnersVal.textContent = runners.value;
    setEffectOption('maze', 'runners', Number(runners.value));
  });
  const newBtn = panel.querySelector('#new-maze-btn');
  if (newBtn) newBtn.addEventListener('click', () => setEffectOption('maze', 'newMaze', ++_mazeToken));
}

function syncMazePanel() {
  const panel = document.getElementById('panel-maze');
  if (!panel) return;
  const opts = currentState.effectOptions?.maze || {};
  const runners = panel.querySelector('#mz-runners'), runnersVal = panel.querySelector('#mz-runners-val');
  if (runners && document.activeElement !== runners) { runners.value = opts.runners ?? 3; if (runnersVal) runnersVal.textContent = runners.value; }
}

// ---------------------------------------------------------------------
// Retro's option panel (panel-retro) - the 14-game .retro-game-btn picker
// ("Auto" = -1, per-game buttons 0-13), the .retro-auto-chk checkboxes
// controlling which games are eligible for auto-rotation, the rotate-
// interval slider, and the "▶ Show" button that actually switches the
// active effect to Retro (mirrors ui.js's #retro-show-btn handler - opening
// the panel to configure a game doesn't itself switch the display, same as
// the original browser app). All backed by core.effectOptions.retro.
// {selectedGame,autoGames,rotate} via retro.js - see that file's module
// comment for the exact meaning of each.
// ---------------------------------------------------------------------
const RETRO_DEFAULT_AUTO_GAMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13]; // Sam Fox (9) excluded by default
// 🔊 Sound effects (Retro panel): on/off, volume, test.
document.querySelectorAll('[data-sfx]').forEach((b) => b.addEventListener('click', () => {
  const v = b.dataset.sfx;
  send(v === 'test' ? { cmd: 'setSfx', test: true } : { cmd: 'setSfx', on: v === 'on' });
}));
document.getElementById('sfx-vol')?.addEventListener('change', (e) => send({ cmd: 'setSfx', volume: Number(e.target.value), test: true }));
document.getElementById('sfx-vol')?.addEventListener('input', (e) => { document.getElementById('sfx-vol-val').textContent = Math.round(e.target.value * 100) + '%'; });
function syncSfx() {
  const f = currentState.prefs?.sfx || { on: true, volume: 0.6 };
  document.querySelectorAll('[data-sfx="on"]').forEach((b) => b.classList.toggle('active', !!f.on));
  document.querySelectorAll('[data-sfx="off"]').forEach((b) => b.classList.toggle('active', !f.on));
  const vol = document.getElementById('sfx-vol');
  if (vol && document.activeElement !== vol) { vol.value = f.volume; document.getElementById('sfx-vol-val').textContent = Math.round(f.volume * 100) + '%'; }
}
let _retroPress = 0;
function wireRetroPanel() {
  // Arrow pad: same idea as Snake's (dir + a press counter so repeats register).
  document.querySelectorAll('#panel-retro [data-retropad]').forEach((b) => b.addEventListener('click', () => {
    setEffectOption('retro', 'dir', b.dataset.retropad);
    setEffectOption('retro', 'press', ++_retroPress + Date.now() % 100000);
  }));
  document.querySelectorAll('#panel-retro .strobe-mode-btn[data-retroopt]').forEach((btn) => btn.addEventListener('click', () => {
    const key = btn.dataset.retroopt, raw = btn.dataset.v, value = raw === 'true' ? true : raw === 'false' ? false : raw;
    document.querySelectorAll(`#panel-retro .strobe-mode-btn[data-retroopt="${key}"]`).forEach((b) => b.classList.toggle('active', b === btn));
    setEffectOption('retro', key, value);
  }));
  const panel = document.getElementById('panel-retro');
  if (!panel) return;

  panel.querySelectorAll('.retro-game-btn[data-retrogame]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.retro-game-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('retro', 'selectedGame', Number(btn.dataset.retrogame));
    });
  });

  const updateAutoGames = () => {
    const chks = panel.querySelectorAll('.retro-auto-chk');
    const enabled = [];
    chks.forEach((c) => { if (c.checked) enabled.push(Number(c.dataset.idx)); });
    setEffectOption('retro', 'autoGames', enabled.length === chks.length ? null : enabled);
  };
  panel.querySelectorAll('.retro-auto-chk').forEach((c) => c.addEventListener('change', updateAutoGames));

  const slider = panel.querySelector('#retro-rotate-slider'), sliderVal = panel.querySelector('#retro-rotate-val');
  if (slider) slider.addEventListener('input', () => {
    if (sliderVal) sliderVal.textContent = slider.value;
    setEffectOption('retro', 'rotate', Number(slider.value));
  });

  const showBtn = panel.querySelector('#retro-show-btn');
  if (showBtn) showBtn.addEventListener('click', () => send({ cmd: 'setEffect', effect: 'retro' }));
}

function syncRetroPanel() {
  const ro = currentState.effectOptions?.retro || {}, RD = { screen: 'crt', hud: true, attract: true, trans: 'crt', cubeLayout: 'arcade' };
  document.querySelectorAll('#panel-retro .strobe-mode-btn[data-retroopt]').forEach((b) => b.classList.toggle('active', String(ro[b.dataset.retroopt] ?? RD[b.dataset.retroopt]) === b.dataset.v));
  const panel = document.getElementById('panel-retro');
  if (!panel) return;
  const opts = currentState.effectOptions?.retro || {};
  const selectedGame = opts.selectedGame ?? -1;
  panel.querySelectorAll('.retro-game-btn[data-retrogame]').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.retrogame) === selectedGame);
  });
  const autoGames = opts.autoGames || RETRO_DEFAULT_AUTO_GAMES;
  panel.querySelectorAll('.retro-auto-chk').forEach((c) => {
    if (document.activeElement !== c) c.checked = autoGames.includes(Number(c.dataset.idx));
  });
  const slider = panel.querySelector('#retro-rotate-slider'), sliderVal = panel.querySelector('#retro-rotate-val');
  if (slider && document.activeElement !== slider) { slider.value = opts.rotate ?? 8; if (sliderVal) sliderVal.textContent = slider.value; }
}

// ---------------------------------------------------------------------
// Tron Bikes' option panel (panel-tron), backed by
// core.effectOptions.tron.{bikes,speed,straight,borderWalls,newGame} - see
// tron.js's module comment for the full mapping, including the
// straight-lines checkbox being a faithfully-ported dead control (the
// original #tron-straight-check has no change listener in ui.js either).
// "⟳ NEW GAME" reuses maze's monotonic-token trick since there's no
// dedicated one-shot WS command for "force a restart now".
// ---------------------------------------------------------------------
let _tronToken = 0;
function wireTronPanel() {
  const panel = document.getElementById('panel-tron');
  if (!panel) return;
  const count = panel.querySelector('#tron-count'), countVal = panel.querySelector('#tron-count-val');
  if (count) count.addEventListener('input', () => {
    if (countVal) countVal.textContent = count.value;
    setEffectOption('tron', 'bikes', Number(count.value));
  });
  const speed = panel.querySelector('#tron-speed'), speedVal = panel.querySelector('#tron-speed-val');
  if (speed) speed.addEventListener('input', () => {
    if (speedVal) speedVal.textContent = Number(speed.value).toFixed(1) + '×';
    setEffectOption('tron', 'speed', Number(speed.value));
  });
  const straightChk = panel.querySelector('#tron-straight-check');
  if (straightChk) straightChk.addEventListener('change', () => {
    setEffectOption('tron', 'straight', straightChk.checked ? 1 : 0);
  });
  const borderChk = panel.querySelector('#tron-border-check');
  if (borderChk) borderChk.addEventListener('change', () => {
    setEffectOption('tron', 'borderWalls', borderChk.checked);
  });
  const newBtn = panel.querySelector('#new-tron-btn');
  if (newBtn) newBtn.addEventListener('click', () => setEffectOption('tron', 'newGame', ++_tronToken));
}

function syncTronPanel() {
  const panel = document.getElementById('panel-tron');
  if (!panel) return;
  const opts = currentState.effectOptions?.tron || {};
  const count = panel.querySelector('#tron-count'), countVal = panel.querySelector('#tron-count-val');
  if (count && document.activeElement !== count) { count.value = opts.bikes ?? 4; if (countVal) countVal.textContent = count.value; }
  const speed = panel.querySelector('#tron-speed'), speedVal = panel.querySelector('#tron-speed-val');
  if (speed && document.activeElement !== speed) { speed.value = opts.speed ?? 1; if (speedVal) speedVal.textContent = Number(speed.value).toFixed(1) + '×'; }
  const straightChk = panel.querySelector('#tron-straight-check');
  if (straightChk && document.activeElement !== straightChk) straightChk.checked = !!(opts.straight ?? 1);
  const borderChk = panel.querySelector('#tron-border-check');
  if (borderChk && document.activeElement !== borderChk) borderChk.checked = !!opts.borderWalls;
}

// ---------------------------------------------------------------------
// Time & Date's option panel (panel-datetime) - ALL PANELS/SCROLL checkboxes,
// Scroll Speed slider, and the six Mode buttons (data-dtmode), backed by
// core.effectOptions.datetime.{allPanels,scroll,scrollSpeed,mode} - see
// datetime.js's module comment for how each mode renders without a browser
// <canvas>. Mirrors the browser's #dt-allpanels-check/#dt-scroll-check/
// #dt-scroll-speed/[data-dtmode] wiring in ui.js.
// ---------------------------------------------------------------------
function wireDatetimePanel() {
  const panel = document.getElementById('panel-datetime');
  if (!panel) return;
  panel.querySelectorAll('[data-dtstyle]').forEach((b) => b.addEventListener('click', () => setEffectOption('datetime', 'style', b.dataset.dtstyle)));
  panel.querySelectorAll('[data-dtcol]').forEach((b) => b.addEventListener('click', () => setEffectOption('datetime', 'colour', b.dataset.dtcol)));
  panel.querySelectorAll('[data-dtflag]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.dtflag; setEffectOption('datetime', k, (currentState.effectOptions?.datetime || {})[k] === false);
  }));
}

function syncDatetimePanel() {
  const panel = document.getElementById('panel-datetime');
  if (!panel) return;
  const o = currentState.effectOptions?.datetime || {};
  const legacy = { time: 'neon', both: 'neon', full: 'neon', date: 'minimal', analogue: 'analogue', words: 'words' };
  const style = o.style || legacy[o.mode] || 'neon';
  panel.querySelectorAll('[data-dtstyle]').forEach((b) => b.classList.toggle('active', b.dataset.dtstyle === style));
  panel.querySelectorAll('[data-dtcol]').forEach((b) => b.classList.toggle('active', b.dataset.dtcol === (o.colour || 'auto')));
  panel.querySelectorAll('[data-dtflag]').forEach((b) => b.classList.toggle('on', o[b.dataset.dtflag] !== false));
}

// ---------------------------------------------------------------------
// Dice Roll's option panel (panel-dice) - "ROLL DICE" button + "AUTO ROLL"
// checkbox, backed by core.effectOptions.dice.rollToken/autoRoll (see
// dice.js's module comment - rollToken is the same monotonically-increasing-
// token one-shot-action pattern as maze.js's "NEW MAZE" button).
// ---------------------------------------------------------------------
let _diceToken = 0;
function wireDicePanel() {
  const panel = document.getElementById('panel-dice');
  if (!panel) return;
  const rollBtn = panel.querySelector('#dice-roll-btn');
  if (rollBtn) rollBtn.addEventListener('click', () => setEffectOption('dice', 'rollToken', ++_diceToken));
  const autoChk = panel.querySelector('#dice-auto-check');
  if (autoChk) autoChk.addEventListener('change', () => setEffectOption('dice', 'autoRoll', autoChk.checked));
}

function syncDicePanel() {
  const panel = document.getElementById('panel-dice');
  if (!panel) return;
  const opts = currentState.effectOptions?.dice || {};
  const autoChk = panel.querySelector('#dice-auto-check');
  if (autoChk && document.activeElement !== autoChk) autoChk.checked = !!opts.autoRoll;
}

// ---------------------------------------------------------------------
// Coin Flip's option panel (panel-coinflip) - Flip Speed slider, backed by
// core.effectOptions.coinflip.speed.
// ---------------------------------------------------------------------
function wireCoinflipPanel() {
  const panel = document.getElementById('panel-coinflip');
  if (!panel) return;
  const speed = panel.querySelector('#coin-speed'), speedVal = panel.querySelector('#coin-speed-val');
  if (speed) speed.addEventListener('input', () => {
    if (speedVal) speedVal.textContent = Number(speed.value).toFixed(1) + 'x';
    setEffectOption('coinflip', 'speed', Number(speed.value));
  });
}

function syncCoinflipPanel() {
  const panel = document.getElementById('panel-coinflip');
  if (!panel) return;
  const opts = currentState.effectOptions?.coinflip || {};
  const speed = panel.querySelector('#coin-speed'), speedVal = panel.querySelector('#coin-speed-val');
  if (speed && document.activeElement !== speed) { speed.value = opts.speed ?? 1; if (speedVal) speedVal.textContent = Number(speed.value).toFixed(1) + 'x'; }
}

// ---------------------------------------------------------------------
// Fireworks' option panel (panel-fireworks): Mode buttons and the "Show
// text on cube" checkbox + text, committed on 'change' rather than every
// keystroke to avoid a WS message per key.
// ---------------------------------------------------------------------
// Strobe Flash's option panel (panel-strobe): Pattern, Speed and Colour,
// read straight from core.effectOptions.strobe.
// ---------------------------------------------------------------------
function wireStrobePanel() {
  const panel = document.getElementById('panel-strobe');
  if (!panel) return;
  panel.querySelectorAll('[data-strobe]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-strobe]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('strobe', 'pattern', btn.dataset.strobe);
    });
  });
  const speed = panel.querySelector('#strobe-speed'), speedVal = panel.querySelector('#strobe-speed-val');
  if (speed) speed.addEventListener('input', () => {
    if (speedVal) speedVal.textContent = speed.value + '/s';
    setEffectOption('strobe', 'speed', Number(speed.value));
  });
  panel.querySelectorAll('[data-scol]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-scol]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('strobe', 'color', btn.dataset.scol);
    });
  });
}

function syncStrobePanel() {
  const panel = document.getElementById('panel-strobe');
  if (!panel) return;
  const opts = currentState.effectOptions?.strobe || {};
  const pattern = opts.pattern || 'all';
  panel.querySelectorAll('[data-strobe]').forEach((b) => b.classList.toggle('active', b.dataset.strobe === pattern));
  const speed = panel.querySelector('#strobe-speed'), speedVal = panel.querySelector('#strobe-speed-val');
  if (speed && document.activeElement !== speed) { speed.value = opts.speed ?? 8; if (speedVal) speedVal.textContent = speed.value + '/s'; }
  const color = opts.color || 'white';
  panel.querySelectorAll('[data-scol]').forEach((b) => b.classList.toggle('active', b.dataset.scol === color));
}

// ---------------------------------------------------------------------
// Bouncing Balls' option panel (panel-balls) - Mode buttons (data-ballmode
// "cross"/"own", backed by core.effectOptions.balls.crossFaces) and Balls
// per face slider (core.effectOptions.balls.count) - see balls.js's module
// comment for what each controls.
// ---------------------------------------------------------------------
function wireBallsPanel() {
  const panel = document.getElementById('panel-balls');
  if (!panel) return;
  panel.querySelectorAll('[data-ballmode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-ballmode]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setEffectOption('balls', 'crossFaces', btn.dataset.ballmode === 'cross');
    });
  });
  const count = panel.querySelector('#ball-count'), countVal = panel.querySelector('#ball-count-val');
  if (count) count.addEventListener('input', () => {
    if (countVal) countVal.textContent = count.value;
    setEffectOption('balls', 'count', Number(count.value));
  });
}

function syncBallsPanel() {
  const panel = document.getElementById('panel-balls');
  if (!panel) return;
  const opts = currentState.effectOptions?.balls || {};
  const crossFaces = opts.crossFaces ?? true;
  panel.querySelectorAll('[data-ballmode]').forEach((b) => b.classList.toggle('active', (b.dataset.ballmode === 'cross') === crossFaces));
  const count = panel.querySelector('#ball-count'), countVal = panel.querySelector('#ball-count-val');
  if (count && document.activeElement !== count) { count.value = opts.count ?? 8; if (countVal) countVal.textContent = count.value; }
}


// Weather Radar's option panel (panel-radar): zoom, and a status line.
function wireRadarPanel() {
  document.querySelectorAll('.radar-zoom-btn').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.radar-zoom-btn').forEach((x) => x.classList.toggle('active', x === b));
    setEffectOption('radar', 'zoom', Number(b.dataset.radarzoom));
  }));
}
function syncRadarPanel() {
  const z = Number(currentState.effectOptions?.radar?.zoom) || 7;
  document.querySelectorAll('.radar-zoom-btn').forEach((x) => x.classList.toggle('active', Number(x.dataset.radarzoom) === z));
  const s = currentState.effectStatus?.radar, el = document.getElementById('radar-status');
  if (el) el.textContent = !s ? '' : s.error ? '⚠ ' + s.error : s.frames ? '✓ ' + (s.place || '') + ' - ' + s.frames + ' frames, updated ' + new Date(s.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Loading…';
}
