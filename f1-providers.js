/* f1-providers.js — ESP32, OpenF1, and Simulation data providers */

const F1Providers = {};
let f1ActiveProvider = null;
let f1PollTimerId = null;
let f1SessionTimerId = null;

// ── Provider Manager ─────────────────────────────────────────────────────────

function _f1IsActive() {
  try { return currentEffect === 'f1'; } catch(e) { return false; }
}

// ── Jolpica F1 Schedule Cache ────────────────────────────────────────────────

var _f1Schedule = null;
var _f1ScheduleYear = null;

async function _f1FetchSchedule() {
  var year = new Date().getFullYear();
  if (_f1Schedule && _f1ScheduleYear === year) return _f1Schedule;
  try {
    var ctrl = new AbortController();
    var tid = setTimeout(function() { ctrl.abort(); }, 8000);
    var res = await fetch('https://api.jolpi.ca/ergast/f1/' + year + '.json', { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return null;
    var data = await res.json();
    var races = data?.MRData?.RaceTable?.Races;
    if (!races || !races.length) return null;
    _f1Schedule = [];
    for (var i = 0; i < races.length; i++) {
      var r = races[i];
      var entry = {
        raceName: r.raceName, circuitName: r.Circuit?.circuitName || '',
        locality: r.Circuit?.Location?.locality || '', country: r.Circuit?.Location?.country || '',
        sessions: []
      };
      if (r.FirstPractice) entry.sessions.push({ name: 'Practice 1', type: 'Practice', date_start: r.FirstPractice.date + 'T' + (r.FirstPractice.time || '00:00:00Z') });
      if (r.SecondPractice) entry.sessions.push({ name: 'Practice 2', type: 'Practice', date_start: r.SecondPractice.date + 'T' + (r.SecondPractice.time || '00:00:00Z') });
      if (r.ThirdPractice) entry.sessions.push({ name: 'Practice 3', type: 'Practice', date_start: r.ThirdPractice.date + 'T' + (r.ThirdPractice.time || '00:00:00Z') });
      if (r.Sprint) entry.sessions.push({ name: 'Sprint', type: 'Sprint', date_start: r.Sprint.date + 'T' + (r.Sprint.time || '00:00:00Z') });
      if (r.SprintQualifying) entry.sessions.push({ name: 'Sprint Qualifying', type: 'Sprint Qualifying', date_start: r.SprintQualifying.date + 'T' + (r.SprintQualifying.time || '00:00:00Z') });
      if (r.Qualifying) entry.sessions.push({ name: 'Qualifying', type: 'Qualifying', date_start: r.Qualifying.date + 'T' + (r.Qualifying.time || '00:00:00Z') });
      entry.sessions.push({ name: 'Race', type: 'Race', date_start: r.date + 'T' + (r.time || '00:00:00Z') });
      entry.sessions.sort(function(a, b) { return new Date(a.date_start).getTime() - new Date(b.date_start).getTime(); });
      _f1Schedule.push(entry);
    }
    _f1ScheduleYear = year;
    return _f1Schedule;
  } catch (e) { return null; }
}

var _f1StandingsCache = null;
var _f1StandingsTs = 0;

async function _f1FetchChampionship() {
  if (_f1StandingsCache && Date.now() - _f1StandingsTs < 3600000) return;
  try {
    var ctrl = new AbortController();
    var tid = setTimeout(function() { ctrl.abort(); }, 8000);
    var res = await fetch('https://api.jolpi.ca/ergast/f1/current/driverStandings.json', { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return;
    var data = await res.json();
    var list = data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings;
    if (!list || !list.length) return;
    var standings = list.map(function(s) {
      var d = s.Driver || {};
      var abbrev = (d.code || d.familyName || '').substring(0, 3).toUpperCase();
      return { pos: parseInt(s.position), abbrev: abbrev, points: parseFloat(s.points), wins: parseInt(s.wins) };
    });
    _f1StandingsCache = standings;
    _f1StandingsTs = Date.now();
    f1Update({ championshipStandings: standings });
  } catch (e) {}
}

async function _f1FindNextFromSchedule() {
  var schedule = await _f1FetchSchedule();
  if (!schedule) return null;
  var meeting = F1State.meeting;
  var now = Date.now();

  // Try to match current meeting by circuit name
  var curCircuit = (meeting?.circuit_short_name || '').toLowerCase();
  var curMeeting = (meeting?.meeting_name || '').toLowerCase();
  var matchedRace = null;
  for (var i = 0; i < schedule.length; i++) {
    var r = schedule[i];
    if (curCircuit && (r.locality.toLowerCase().includes(curCircuit) || r.circuitName.toLowerCase().includes(curCircuit) || r.raceName.toLowerCase().includes(curCircuit))) {
      matchedRace = r; break;
    }
    if (curMeeting && r.raceName.toLowerCase().includes(curMeeting.replace(/grand prix/i, '').trim())) {
      matchedRace = r; break;
    }
  }

  // Find next session within matched race weekend
  if (matchedRace) {
    for (var j = 0; j < matchedRace.sessions.length; j++) {
      var s = matchedRace.sessions[j];
      if (new Date(s.date_start).getTime() > now) {
        return {
          session_name: s.name, session_type: s.type,
          meeting_name: matchedRace.raceName, circuit_short_name: matchedRace.locality,
          country_name: matchedRace.country, meeting_key: meeting?.meeting_key || null,
          date_start: s.date_start
        };
      }
    }
  }

  // No match or all sessions passed — find next future session across all races
  for (var k = 0; k < schedule.length; k++) {
    var race = schedule[k];
    for (var m = 0; m < race.sessions.length; m++) {
      var sess = race.sessions[m];
      if (new Date(sess.date_start).getTime() > now) {
        return {
          session_name: sess.name, session_type: sess.type,
          meeting_name: race.raceName, circuit_short_name: race.locality,
          country_name: race.country, meeting_key: null,
          date_start: sess.date_start
        };
      }
    }
  }
  return null;
}

function _f1PredictNextSession() {
  var meeting = F1State.meeting;
  if (!meeting) return null;
  var curName = (meeting.session_name || meeting.session_type || F1State.session.type || '').toLowerCase();
  var schedule = [
    { name: 'Practice 1', type: 'Practice', gapToNext: 4 },
    { name: 'Practice 2', type: 'Practice', gapToNext: 19 },
    { name: 'Practice 3', type: 'Practice', gapToNext: 3 },
    { name: 'Qualifying', type: 'Qualifying', gapToNext: 24 },
    { name: 'Race',       type: 'Race',       gapToNext: 0 }
  ];
  var curIdx = -1;
  for (var i = 0; i < schedule.length; i++) {
    if (curName.includes(schedule[i].name.toLowerCase()) ||
        (curName.includes('practice') && curName.includes('' + (i+1)) && schedule[i].type === 'Practice')) {
      curIdx = i; break;
    }
  }
  if (curIdx < 0 && curName.includes('sprint')) curIdx = 2;
  if (curIdx < 0 && curName.includes('qual')) curIdx = 3;
  if (curIdx < 0 && curName.includes('race')) curIdx = 4;
  if (curIdx < 0) return null;
  var nextIdx = curIdx + 1;
  if (nextIdx >= schedule.length) return null;
  var next = schedule[nextIdx];
  var sessionStart = F1State.session.dateStart || meeting.date_start;
  var baseTime = sessionStart ? new Date(sessionStart).getTime() : Date.now();
  var gapH = schedule[curIdx].gapToNext;
  var estStart = new Date(baseTime + gapH * 3600000);
  if (estStart.getTime() < Date.now()) {
    estStart = new Date(Date.now() + gapH * 3600000);
  }
  return {
    session_name: next.name, session_type: next.type,
    meeting_name: meeting.meeting_name || '', circuit_short_name: meeting.circuit_short_name || '',
    country_name: meeting.country_name || '', meeting_key: meeting.meeting_key || null,
    date_start: estStart.toISOString(), _estimated: true
  };
}

function _f1SetNextSession(next) {
  if (!next) return;
  f1Update({ nextSession: next });
  if (typeof buildIdleScroll === 'function') buildIdleScroll();
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
    f1Update({ connection: 'transferring' });
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
        const meetingUpdate = {};
        if (ses.meeting_name) meetingUpdate.meeting_name = ses.meeting_name;
        if (ses.circuit_short_name) meetingUpdate.circuit_short_name = ses.circuit_short_name;
        if (ses.country_name) meetingUpdate.country_name = ses.country_name;
        if (ses.date_start) meetingUpdate.date_start = ses.date_start;

        f1Update({
          session: {
            active, type, qSession: qS, fpSession: fpS,
            name: ses.meeting_name || '', circuit: ses.circuit_short_name || '',
            country: ses.country_name || '', dateStart: ses.date_start || '',
            lap: { current: ses.lap || 0, total: ses.total_laps || 0 },
            timer: { duration: ses.duration || 0, elapsed: ses.elapsed || 0, remaining: ses.remaining || 0 }
          },
          track: { statusText },
          meeting: Object.keys(meetingUpdate).length ? meetingUpdate : undefined
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
            pos: d.position, number: d.driver_number,
            name: `#${d.driver_number} ${d.name}`,
            abbrev: d.abbrev || '', team: d.team || '',
            gap: d.gap
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

    try {
      const res = await fetch('/api/weather', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const w = await res.json();
        f1Update({ weather: w });
        anySuccess = true;
      }
    } catch (e) { /* */ }

    f1Update({ connection: anySuccess ? 'connected' : 'error' });
    if (typeof f1SetStatus === 'function') f1SetStatus(anySuccess ? 'ok' : 'error');
    if (!F1State.session.active && !F1State.nextSession) {
      _f1FindNextFromSchedule().then(function(next) {
        _f1SetNextSession(next || _f1PredictNextSession());
      });
    }
  }
};

// ── OpenF1 Provider ──────────────────────────────────────────────────────────

F1Providers.openf1 = {
  _sessionKey: null,
  _finishedAt: 0,
  _nextSession: null,
  _currentMeetingKey: null,
  start() {
    f1Update({ connection: 'connecting' });
    this._finishedAt = 0;
    this._nextSession = null;
    this._init();
    startF1SessionTimer();
  },
  stop() {
    this._sessionKey = null;
    this._finishedAt = 0;
    this._nextSession = null;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    stopF1SessionTimer();
  },
  async _init() {
    try {
      const res = await fetch('https://api.openf1.org/v1/sessions?session_key=latest');
      if (!res.ok) {
        f1Update({ connection: 'error' });
        if (_f1IsActive()) this._timer = setTimeout(() => this._init(), 10000);
        return;
      }
      const sessions = await res.json();
      if (!sessions.length) { f1Update({ connection: 'connected', session: { active: false } }); return; }
      const s = sessions[0];
      this._sessionKey = s.session_key;
      this._currentMeetingKey = s.meeting_key || null;
      this._sessionStart = s.date_start ? new Date(s.date_start).getTime() : Date.now();
      const sType = (s.session_type || '').toLowerCase();
      const sName = (s.session_name || '');
      const duration = sType.includes('race') ? 7200 : sType.includes('quali') ? 3600 : 5400;
      const lapTotal = sType.includes('race') ? (s.total_laps || 0) : 0;
      var elapsed = Math.floor((Date.now() - this._sessionStart) / 1000);
      var isLive = elapsed < duration + 1800;
      var fpNum = 1, qNum = 1;
      var fpMatch = sName.match(/practice\s*(\d)/i);
      if (fpMatch) fpNum = parseInt(fpMatch[1]);
      f1Update({
        connection: 'connected',
        session: {
          active: isLive,
          type: sType,
          name: s.meeting_name || sName || '',
          circuit: s.circuit_short_name || '',
          country: s.country_name || '',
          dateStart: s.date_start || '',
          fpSession: fpNum, qSession: qNum,
          lap: { current: 0, total: lapTotal },
          timer: { duration, elapsed: 0, remaining: duration }
        },
        meeting: s
      });
      if (typeof buildScrollText === 'function') buildScrollText({ meeting_name: s.meeting_name, circuit_short_name: s.circuit_short_name });
      if (typeof buildCircuitStrip === 'function') buildCircuitStrip();
      if (isLive && typeof buildIdleScroll === 'function') buildIdleScroll();

      // Fetch championship standings (non-blocking)
      _f1FetchChampionship();

      // Fetch drivers
      const dRes = await fetch(`https://api.openf1.org/v1/drivers?session_key=${this._sessionKey}`);
      if (dRes.ok) {
        const drivers = await dRes.json();
        this._driverMap = {};
        drivers.forEach(d => { this._driverMap[d.driver_number] = d; });
      }

      // If session is not live, fetch next upcoming session (non-blocking)
      if (!isLive) {
        this._fetchNextSession().then(function(next) {
          if (next) {
            next.session_type = next.session_type || next.session_name || '';
            F1Providers.openf1._nextSession = next;
            _f1SetNextSession(next);
          }
        });
      }
      this._pollLive();
    } catch (e) {
      f1Update({ connection: 'error' });
      if (_f1IsActive()) this._timer = setTimeout(() => this._init(), 10000);
    }
  },
  async _fetchNextSession() {
    // Try Jolpica schedule first (has official times for all sessions)
    var jolpica = await _f1FindNextFromSchedule();
    if (jolpica) return jolpica;
    try {
      // Try OpenF1 same meeting
      if (this._currentMeetingKey) {
        var mRes = await fetch('https://api.openf1.org/v1/sessions?meeting_key=' + this._currentMeetingKey + '&order=date_start&order_direction=asc');
        if (mRes.ok) {
          var mSessions = await mRes.json();
          var curKey = this._sessionKey;
          var found = false;
          for (var i = 0; i < mSessions.length; i++) {
            if (found) return mSessions[i];
            if (mSessions[i].session_key === curKey) found = true;
          }
        }
      }
      // Try OpenF1 future sessions
      var now = new Date().toISOString();
      var res = await fetch('https://api.openf1.org/v1/sessions?date_start>=' + now + '&order=date_start&order_direction=asc');
      if (res.ok) {
        var sessions = await res.json();
        if (sessions.length) return sessions[0];
      }
    } catch (e) { /* fall through */ }
    return _f1PredictNextSession();
  },
  _showNextSession(next) {
    if (!next) return;
    const sameCircuit = next.meeting_key === this._currentMeetingKey;
    if (sameCircuit) {
      const sType = (next.session_type || '').toUpperCase();
      const dateStr = next.date_start ? new Date(next.date_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
      f1Update({
        session: { active: false, finished: false, type: '' },
        track: { statusText: `NEXT: ${sType}`, flagRGB: [0.1, 0.4, 1] }
      });
      this._nextSession = next;
      _f1SetNextSession(next);
    } else {
      f1Update({
        session: { active: false, finished: false, type: '',
          name: next.meeting_name || '', circuit: next.circuit_short_name || '',
          country: next.country_name || '', dateStart: next.date_start || '' },
        track: { statusText: 'NEXT RACE', flagRGB: [0.1, 0.4, 1] },
        meeting: next
      });
      this._nextSession = next;
      _f1SetNextSession(next);
      if (typeof buildScrollText === 'function') buildScrollText({ meeting_name: next.meeting_name, circuit_short_name: next.circuit_short_name });
      if (typeof buildCircuitStrip === 'function') buildCircuitStrip();
    }
    f1DataDirty = true;
    const flagEl = document.getElementById('f1-flag');
    const textEl = document.getElementById('f1-status-text');
    if (flagEl) flagEl.style.background = '#2266ff';
    if (textEl) {
      const sc = next.meeting_key === this._currentMeetingKey;
      textEl.textContent = sc ? `Next: ${(next.session_type||'').toUpperCase()}` : `Next: ${next.circuit_short_name || next.meeting_name || ''}`;
    }
  },
  async _pollLive() {
    if (!this._sessionKey) {
      if (_f1IsActive()) this._timer = setTimeout(() => this._init(), 10000);
      return;
    }

    // After session finishes, wait 60s then show next session
    if (this._finishedAt && !this._nextSession) {
      if (Date.now() - this._finishedAt >= 60000) {
        const next = await this._fetchNextSession();
        if (next) this._showNextSession(next);
      }
      if (_f1IsActive()) this._timer = setTimeout(() => this._pollLive(), 8000);
      return;
    }
    if (!F1State.session.active && this._nextSession) {
      f1Update({ connection: 'connected' });
      if (_f1IsActive()) this._timer = setTimeout(() => this._pollLive(), 30000);
      return;
    }
    const sk = this._sessionKey;
    try {
      f1Update({ connection: 'transferring' });
      // Positions
      const posRes = await fetch(`https://api.openf1.org/v1/position?session_key=${sk}&order=date&order_direction=desc&limit=30`);
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
      const intRes = await fetch(`https://api.openf1.org/v1/intervals?session_key=${sk}&order=date&order_direction=desc&limit=30`);
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

      // Laps
      try {
        const lapRes = await fetch(`https://api.openf1.org/v1/laps?session_key=${sk}&order=date&order_direction=desc&limit=5`);
        if (lapRes.ok) {
          const laps = await lapRes.json();
          if (laps.length) {
            const maxLap = laps.reduce((m, l) => Math.max(m, l.lap_number || 0), 0);
            f1Update({ session: { lap: { current: maxLap, total: F1State.session.lap.total || maxLap } } });
          }
        }
      } catch(e) { /* */ }

      // Session timer — compute from session start time
      if (this._sessionStart) {
        const elapsed = Math.floor((Date.now() - this._sessionStart) / 1000);
        const dur = F1State.session.timer.duration || 7200;
        const remaining = Math.max(0, dur - elapsed);
        f1Update({ session: { timer: { duration: dur, elapsed, remaining } } });
        if (remaining <= 0 && !this._finishedAt && F1State.session.active) {
          this._finishedAt = Date.now();
          f1Update({ session: { finished: true } });
        }
      }

      // Weather
      const wRes = await fetch(`https://api.openf1.org/v1/weather?session_key=${sk}&order=date&order_direction=desc&limit=1`);
      if (wRes.ok) {
        const weather = await wRes.json();
        if (weather.length) {
          const w = weather[0];
          const rainLevel = w.rainfall || 0;
          const code = rainLevel > 5 ? 65 : rainLevel > 0 ? 61 : (w.track_temperature > 35 ? 0 : 2);
          f1Update({
            weather: {
              temp: w.air_temperature != null ? Math.round(w.air_temperature) : null,
              humidity: w.humidity != null ? Math.round(w.humidity) : null,
              wind: w.wind_speed != null ? Math.round(w.wind_speed) : null,
              rain: rainLevel > 0,
              condition: rainLevel > 5 ? 'Heavy Rain' : rainLevel > 0 ? 'Rain' : 'Dry',
              code
            }
          });
        }
      }

      // Race control
      const rcRes = await fetch(`https://api.openf1.org/v1/race_control?session_key=${sk}&order=date&order_direction=desc&limit=15`);
      if (rcRes.ok) {
        const rc = await rcRes.json();
        if (rc.length) {
          const msgs = rc.slice(0, 10).map(m => ({
            message: m.message, flag: m.flag, lap: m.lap_number, timestamp: m.date
          }));
          f1Update({ track: { raceControlMessages: msgs } });
          for (var ri = 0; ri < rc.length; ri++) {
            var msg = (rc[ri].message || '').toUpperCase();
            if (msg.includes('Q3')) { f1Update({ session: { qSession: 3 } }); break; }
            if (msg.includes('Q2')) { f1Update({ session: { qSession: 2 } }); break; }
            if (msg.includes('Q1')) { f1Update({ session: { qSession: 1 } }); break; }
          }
          // Detect SC/VSC from most recent race control
          for (var si = 0; si < rc.length; si++) {
            var scMsg = (rc[si].message || '').toUpperCase();
            var scFlag = (rc[si].flag || '').toUpperCase();
            if (scMsg.includes('VIRTUAL SAFETY CAR') || scFlag === 'VSC') {
              f1Update({ track: { flag: 'vsc', statusText: 'VSC' } }); break;
            }
            if (scMsg.includes('SAFETY CAR') || scFlag === 'SAFETY CAR') {
              f1Update({ track: { flag: 'sc', statusText: 'SAFETY CAR' } }); break;
            }
            if (scFlag === 'GREEN' || scFlag === 'CLEAR') {
              break; // SC/VSC ended
            }
          }
          const latest = rc[0];
          if (latest.flag) {
            if (typeof applyF1Flag === 'function') applyF1Flag(latest.flag, latest.flag);
            if (latest.flag === 'CHEQUERED' && !this._finishedAt) {
              this._finishedAt = Date.now();
              f1Update({ session: { finished: true } });
            }
          }
        }
      }

      f1Update({ connection: 'connected' });
      if (typeof f1SetStatus === 'function') f1SetStatus('ok');
    } catch (e) {
      f1Update({ connection: 'error' });
    }
    if (_f1IsActive()) this._timer = setTimeout(() => this._pollLive(), 8000);
  }
};

// ── Simulation Provider ──────────────────────────────────────────────────────

const DEMO_MEETING = { meeting_name: 'British Grand Prix', circuit_short_name: 'Silverstone', country_name: 'United Kingdom', date_start: '2025-07-06' };
const DEMO_STANDINGS = [
  { pos: 1, number: 1, name: 'Verstappen', abbrev: 'VER', team: 'Red Bull Racing', color: '#3671C6', gap: 'LEAD' },
  { pos: 2, number: 4, name: 'Norris', abbrev: 'NOR', team: 'McLaren', color: '#FF8000', gap: '+4.2s' },
  { pos: 3, number: 16, name: 'Leclerc', abbrev: 'LEC', team: 'Ferrari', color: '#E8002D', gap: '+9.1s' },
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

  const lapData = sessionType === 'Race' ? { current: 1, total: 52 } : { current: 0, total: 0 };
  f1Update({
    session: {
      active: true, type: sessionType, finished: false,
      qSession: qS, fpSession: fpS, timer, lap: lapData
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
