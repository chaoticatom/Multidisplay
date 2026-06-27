/* f1-providers.js — ESP32, OpenF1, and Simulation data providers */

const F1Providers = {};
let f1ActiveProvider = null;
let f1PollTimerId = null;
let f1SessionTimerId = null;

// ── Provider Manager ─────────────────────────────────────────────────────────

function _f1IsActive() {
  try { return currentEffect === 'f1' && effectsOn; } catch(e) { return false; }
}

function f1SetMode(mode) {
  if (f1ActiveProvider) {
    f1ActiveProvider.stop();
    f1ActiveProvider = null;
  }
  if (f1PollTimerId) { clearInterval(f1PollTimerId); f1PollTimerId = null; }
  if (f1SessionTimerId) { clearInterval(f1SessionTimerId); f1SessionTimerId = null; }

  f1Reset();
  F1State.source = mode;

  const provider = F1Providers[mode];
  if (provider) {
    f1ActiveProvider = provider;
    provider.start();
  }
  localStorage.setItem('f1-mode', mode);
}

function f1GetMode() {
  return F1State.source;
}

// ── Session Timer (shared by all providers) ──────────────────────────────────

function startF1SessionTimer() {
  if (f1SessionTimerId) return;
  f1SessionTimerId = setInterval(() => {
    if (_f1IsActive()) {
      const t = F1State.session.timer;
      t.elapsed += 1;
      t.remaining = Math.max(0, t.duration - t.elapsed);
      f1DataDirty = true;
      if (typeof updateSessionUI === 'function') updateSessionUI();
    }
  }, 1000);
}

function stopF1SessionTimer() {
  if (f1SessionTimerId) { clearInterval(f1SessionTimerId); f1SessionTimerId = null; }
}

// ── ESP32 Provider ───────────────────────────────────────────────────────────

F1Providers.esp32 = {
  start() {
    f1Update({ connection: 'connecting' });
    this._poll();
    f1PollTimerId = setInterval(() => this._poll(), 5000);
    startF1SessionTimer();
  },
  stop() {
    stopF1SessionTimer();
  },
  async _poll() {
    if (!_f1IsActive()) return;
    let anySuccess = false;
    try {
      const res = await fetch('/api/session', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const ses = await res.json();
        const type = ses.type || '';
        const active = type && type !== 'standby';
        let qS = F1State.session.qSession, fpS = F1State.session.fpSession;
        let statusText = 'LIVE';
        if (type.includes('quali')) {
          const m = type.match(/(\d)/);
          qS = m ? parseInt(m[1]) : qS;
          statusText = `Q${qS}`;
        } else if (type.includes('practice')) {
          const m = type.match(/(\d)/);
          fpS = m ? parseInt(m[1]) : fpS;
          statusText = `FP${fpS}`;
        }
        f1Update({
          session: { active, type, qSession: qS, fpSession: fpS },
          track: { statusText }
        });
        anySuccess = true;
      }
    } catch (e) { /* */ }

    try {
      const res = await fetch('/api/drivers', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const drivers = await res.json();
        f1Update({
          drivers: drivers.slice(0, 10).map(d => ({
            pos: d.position, name: `#${d.driver_number} ${d.name}`, gap: d.gap
          }))
        });
        if (typeof updateLeaderboardUI === 'function') updateLeaderboardUI();
        anySuccess = true;
      }
    } catch (e) { /* */ }

    try {
      const res = await fetch('/api/flags', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const flags = await res.json();
        if (typeof applyF1Flag === 'function') applyF1Flag(flags.flag, null);
        anySuccess = true;
      }
    } catch (e) { /* */ }

    f1Update({ connection: anySuccess ? 'connected' : 'error' });
    if (typeof f1SetStatus === 'function') f1SetStatus(anySuccess ? 'ok' : 'error');
  }
};

// ── OpenF1 Provider ──────────────────────────────────────────────────────────

F1Providers.openf1 = {
  _sessionKey: null,
  start() {
    f1Update({ connection: 'connecting' });
    this._init();
    f1PollTimerId = setInterval(() => this._pollLive(), 8000);
    startF1SessionTimer();
  },
  stop() {
    this._sessionKey = null;
    stopF1SessionTimer();
  },
  async _init() {
    try {
      const res = await fetch('https://api.openf1.org/v1/sessions?session_key=latest');
      if (!res.ok) { f1Update({ connection: 'error' }); return; }
      const sessions = await res.json();
      if (!sessions.length) { f1Update({ connection: 'connected', session: { active: false } }); return; }
      const s = sessions[0];
      this._sessionKey = s.session_key;
      f1Update({
        connection: 'connected',
        session: {
          active: true,
          type: (s.session_type || '').toLowerCase(),
          name: s.meeting_name || s.session_name || '',
          circuit: s.circuit_short_name || '',
          dateStart: s.date_start || ''
        },
        meeting: s
      });
      if (typeof buildScrollText === 'function') buildScrollText({ meeting_name: s.meeting_name, circuit_short_name: s.circuit_short_name });
      if (typeof buildCircuitStrip === 'function') buildCircuitStrip();
      if (typeof buildIdleScroll === 'function') buildIdleScroll();

      // Fetch drivers
      const dRes = await fetch(`https://api.openf1.org/v1/drivers?session_key=${this._sessionKey}`);
      if (dRes.ok) {
        const drivers = await dRes.json();
        this._driverMap = {};
        drivers.forEach(d => { this._driverMap[d.driver_number] = d; });
      }
      this._pollLive();
    } catch (e) {
      f1Update({ connection: 'error' });
    }
  },
  async _pollLive() {
    if (!this._sessionKey) return;
    const sk = this._sessionKey;
    try {
      // Positions
      const posRes = await fetch(`https://api.openf1.org/v1/position?session_key=${sk}&order=date&order_direction=desc`);
      if (posRes.ok) {
        const positions = await posRes.json();
        const latest = {};
        for (const p of positions) {
          if (!latest[p.driver_number]) latest[p.driver_number] = p;
        }
        const sorted = Object.values(latest).sort((a, b) => a.position - b.position);
        f1Update({
          drivers: sorted.slice(0, 10).map(p => {
            const d = this._driverMap?.[p.driver_number];
            return {
              pos: p.position,
              number: p.driver_number,
              name: d ? `#${d.driver_number} ${d.name_acronym || d.last_name || ''}` : `#${p.driver_number}`,
              abbrev: d?.name_acronym || '',
              team: d?.team_name || '',
              color: d?.team_colour ? `#${d.team_colour}` : '#fff',
              gap: ''
            };
          })
        });
        if (typeof updateLeaderboardUI === 'function') updateLeaderboardUI();
      }

      // Intervals
      const intRes = await fetch(`https://api.openf1.org/v1/intervals?session_key=${sk}&order=date&order_direction=desc`);
      if (intRes.ok) {
        const intervals = await intRes.json();
        const latestInt = {};
        for (const iv of intervals) {
          if (!latestInt[iv.driver_number]) latestInt[iv.driver_number] = iv;
        }
        const drivers = [...F1State.drivers];
        for (const d of drivers) {
          const iv = latestInt[d.number];
          if (iv) d.gap = iv.gap_to_leader != null ? `+${iv.gap_to_leader}s` : '';
        }
        if (drivers.length && drivers[0]) drivers[0].gap = 'LEAD';
        f1Update({ drivers });
      }

      // Weather
      const wRes = await fetch(`https://api.openf1.org/v1/weather?session_key=${sk}&order=date&order_direction=desc`);
      if (wRes.ok) {
        const weather = await wRes.json();
        if (weather.length) {
          const w = weather[0];
          f1Update({
            weather: {
              temp: w.air_temperature != null ? Math.round(w.air_temperature) : null,
              humidity: w.humidity != null ? Math.round(w.humidity) : null,
              wind: w.wind_speed != null ? Math.round(w.wind_speed) : null,
              rain: w.rainfall > 0,
              condition: w.rainfall > 0 ? 'Rain' : 'Dry'
            }
          });
        }
      }

      // Race control
      const rcRes = await fetch(`https://api.openf1.org/v1/race_control?session_key=${sk}&order=date&order_direction=desc`);
      if (rcRes.ok) {
        const rc = await rcRes.json();
        if (rc.length) {
          const msgs = rc.slice(0, 10).map(m => ({
            message: m.message, flag: m.flag, lap: m.lap_number, timestamp: m.date
          }));
          f1Update({ track: { raceControlMessages: msgs } });
          const latest = rc[0];
          if (latest.flag) {
            if (typeof applyF1Flag === 'function') applyF1Flag(latest.flag, latest.flag);
          }
        }
      }

      f1Update({ connection: 'connected' });
      if (typeof f1SetStatus === 'function') f1SetStatus('ok');
    } catch (e) {
      f1Update({ connection: 'error' });
    }
  }
};

// ── Simulation Provider ──────────────────────────────────────────────────────

const DEMO_MEETING = { meeting_name: 'British Grand Prix', circuit_short_name: 'Silverstone', date_start: '2025-07-06' };
const DEMO_STANDINGS = [
  { pos: 1, name: 'Verstappen', gap: 'LEAD' },
  { pos: 2, name: 'Norris', gap: '+4.2s' },
  { pos: 3, name: 'Leclerc', gap: '+9.1s' },
];
const DEMO_WEATHER = { temp: 18, humidity: 65, wind: 12, rain: false, condition: 'Dry', code: 2 };

F1Providers.simulation = {
  start() {
    f1Update({ source: 'simulation', connection: 'connected' });
  },
  stop() {
    stopF1SessionTimer();
  }
};

function simSession(sessionType) {
  if (typeof activateF1Mode === 'function') activateF1Mode();
  const meeting = F1State.meeting || DEMO_MEETING;
  f1Update({ meeting, source: 'simulation', connection: 'connected' });

  if (!F1State.drivers.length) f1Update({ drivers: DEMO_STANDINGS });
  if (F1State.weather.temp == null) f1Update({ weather: DEMO_WEATHER });

  document.getElementById('f1-race-name').textContent = meeting.meeting_name;
  document.getElementById('f1-race-date').textContent = 'Sun Jul 6';
  if (typeof buildScrollText === 'function') buildScrollText(meeting);
  if (typeof buildCircuitStrip === 'function') buildCircuitStrip();
  if (typeof buildIdleScroll === 'function') buildIdleScroll();

  let qS = F1State.session.qSession, fpS = F1State.session.fpSession;
  let statusText = 'LIVE', timer;

  if (sessionType === 'Qualifying') {
    qS = (qS % 3) + 1;
    timer = { duration: 3600, elapsed: 1800, remaining: 1800 };
    statusText = `Q${qS}`;
  } else if (sessionType === 'Practice') {
    fpS = (fpS % 3) + 1;
    timer = { duration: 5400, elapsed: 2700, remaining: 2700 };
    statusText = `FP${fpS}`;
  } else {
    timer = { duration: 7200, elapsed: 1800, remaining: 5400 };
    statusText = 'LIVE';
  }

  f1Update({
    session: {
      active: true, type: sessionType, finished: false,
      qSession: qS, fpSession: fpS, timer
    },
    track: { statusText, flagRGB: [.02, 1, .1] }
  });

  if (typeof applyF1Flag === 'function') applyF1Flag(null, 'GREEN');
  if (typeof updateLeaderboardUI === 'function') updateLeaderboardUI();
  if (typeof updateSessionUI === 'function') updateSessionUI();
  startF1SessionTimer();
}

function simFlag(flag, status) {
  if (typeof activateF1Mode === 'function') activateF1Mode();

  if (!F1State.session.active) simSession('Race');
  if (typeof applyF1Flag === 'function') applyF1Flag(flag, status);
  f1DataDirty = true;
  if (typeof updateLeaderboardUI === 'function') updateLeaderboardUI();
  if (typeof updateSessionUI === 'function') updateSessionUI();
}

function simBlueFlag() {
  const cur = F1State.track.flag === 'blue';
  f1Update({
    track: {
      flag: cur ? 'none' : 'blue',
      flagRGB: cur ? [0, 0, 0] : [0, 0.33, 1],
      statusText: cur ? (F1State.track.statusText || '') : 'BLUE FLAG'
    }
  });
  const flagEl = document.getElementById('f1-flag');
  const textEl = document.getElementById('f1-status-text');
  if (cur) {
    if (flagEl) flagEl.style.background = '#111';
    if (textEl) textEl.textContent = F1State.track.flagLabel || 'Idle';
  } else {
    if (flagEl) flagEl.style.background = '#0055ff';
    if (textEl) textEl.textContent = 'BLUE FLAG';
  }
}

function simFinish() {
  f1Update({
    session: { active: true, finished: true },
    track: { statusText: 'FINISHED', flagRGB: [1, 1, 1] }
  });
  if (typeof activateF1Mode === 'function') activateF1Mode();
  const flagEl = document.getElementById('f1-flag');
  const textEl = document.getElementById('f1-status-text');
  if (flagEl) flagEl.style.background = '#ffffff';
  if (textEl) textEl.textContent = 'FINISHED';
}

function simNoSession() {
  if (typeof activateF1Mode === 'function') activateF1Mode();
  f1Update({
    session: { active: false, finished: false },
    track: { flag: 'none', flagRGB: [0, 0, 0], flagLabel: '', statusText: '' },
    meeting: F1State.meeting || DEMO_MEETING
  });
  if (!F1State.meeting) {
    document.getElementById('f1-race-name').textContent = DEMO_MEETING.meeting_name;
    document.getElementById('f1-race-date').textContent = 'Sun Jul 6';
  }
  if (typeof buildIdleScroll === 'function') buildIdleScroll();
  const flagEl = document.getElementById('f1-flag');
  const textEl = document.getElementById('f1-status-text');
  if (flagEl) flagEl.style.background = '#111';
  if (textEl) textEl.textContent = 'No session';
  f1DataDirty = true;
}

function simWeather(preset) {
  const presets = {
    sunny: { temp: 28, humidity: 35, wind: 8, rain: false, condition: 'Sunny', code: 0 },
    cloudy: { temp: 18, humidity: 65, wind: 15, rain: false, condition: 'Cloudy', code: 2 },
    rain: { temp: 14, humidity: 85, wind: 20, rain: true, condition: 'Rain', code: 61 },
    heavyrain: { temp: 12, humidity: 95, wind: 30, rain: true, condition: 'Heavy Rain', code: 65 },
    storm: { temp: 10, humidity: 98, wind: 45, rain: true, condition: 'Storm', code: 95 }
  };
  f1Update({ weather: presets[preset] || presets.sunny });
  f1DataDirty = true;
}

function simLap(delta) {
  const lap = F1State.session.lap;
  f1Update({ session: { lap: { current: Math.max(0, lap.current + delta), total: lap.total } } });
  f1DataDirty = true;
}
