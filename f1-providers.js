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
      return { pos: parseInt(s.position), abbrev: abbrev, points: parseFloat(s.points), wins: parseInt(s.wins), p2: 0, p3: 0 };
    });
    // Fetch P2 and P3 counts in parallel
    try {
      var [r2, r3] = await Promise.all([
        fetch('https://api.jolpi.ca/ergast/f1/current/results/2.json?limit=100'),
        fetch('https://api.jolpi.ca/ergast/f1/current/results/3.json?limit=100')
      ]);
      var countFinishes = function(raceData, field) {
        var races = raceData?.MRData?.RaceTable?.Races || [];
        var counts = {};
        races.forEach(function(race) {
          var result = (race.Results || [])[0];
          if (result) {
            var code = (result.Driver?.code || result.Driver?.familyName || '').substring(0,3).toUpperCase();
            counts[code] = (counts[code] || 0) + 1;
          }
        });
        return counts;
      };
      if (r2.ok && r3.ok) {
        var d2 = await r2.json(), d3 = await r3.json();
        var p2counts = countFinishes(d2), p3counts = countFinishes(d3);
        standings.forEach(function(s) { s.p2 = p2counts[s.abbrev] || 0; s.p3 = p3counts[s.abbrev] || 0; });
      }
    } catch(e2) {}
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

  // Sprint weekend: FP1 → Sprint Qualifying → Sprint → FP2 → Qualifying → Race
  // Standard weekend: FP1 → FP2 → FP3 → Qualifying → Race
  var isSprint = curName.includes('sprint');
  var meetingSessions = (meeting.sessions || []).map(function(s) { return s.type.toLowerCase(); });
  var isSprintWeekend = isSprint ||
    meetingSessions.some(function(t) { return t.includes('sprint'); });

  var schedule, curIdx = -1;
  if (isSprintWeekend) {
    schedule = [
      { name: 'Practice 1',         type: 'Practice',           gapToNext: 4 },
      { name: 'Sprint Qualifying',   type: 'Sprint Qualifying',  gapToNext: 20 },
      { name: 'Sprint',              type: 'Sprint',             gapToNext: 20 },
      { name: 'Qualifying',          type: 'Qualifying',         gapToNext: 20 },
      { name: 'Race',                type: 'Race',               gapToNext: 0 }
    ];
    if (curName.includes('sprint') && curName.includes('qual'))  curIdx = 1;
    else if (curName.includes('sprint'))                         curIdx = 2;
    else if (curName.includes('qual'))                           curIdx = 3;
    else if (curName.includes('race'))                           curIdx = 4;
    else if (curName.includes('practice') || curName.includes('fp1') || curName.includes('practice 1')) curIdx = 0;
  } else {
    schedule = [
      { name: 'Practice 1', type: 'Practice', gapToNext: 4 },
      { name: 'Practice 2', type: 'Practice', gapToNext: 19 },
      { name: 'Practice 3', type: 'Practice', gapToNext: 3 },
      { name: 'Qualifying', type: 'Qualifying', gapToNext: 24 },
      { name: 'Race',       type: 'Race',       gapToNext: 0 }
    ];
    for (var i = 0; i < schedule.length; i++) {
      if (curName.includes(schedule[i].name.toLowerCase()) ||
          (curName.includes('practice') && curName.includes('' + (i+1)) && schedule[i].type === 'Practice')) {
        curIdx = i; break;
      }
    }
    if (curIdx < 0 && curName.includes('qual')) curIdx = 3;
    if (curIdx < 0 && curName.includes('race')) curIdx = 4;
  }
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
  _setFallbackData() {
    if (!F1State.nextSession) {
      _f1FindNextFromSchedule().then(function(next) {
        if (next) {
          _f1SetNextSession(next);
          var m = { meeting_name: next.meeting_name, circuit_short_name: next.circuit_short_name, country_name: next.country_name, date_start: next.date_start };
          f1Update({ meeting: m });
          if (typeof buildScrollText === 'function') buildScrollText(m);
          var nameEl = document.getElementById('f1-race-name');
          if (nameEl) nameEl.textContent = next.meeting_name || '';
          var dateEl = document.getElementById('f1-race-date');
          if (dateEl && next.date_start) {
            var d = new Date(next.date_start);
            dateEl.textContent = d.toLocaleDateString('en-GB', {weekday:'short',day:'numeric',month:'short'});
          }
        } else {
          f1Update({ meeting: DEMO_MEETING, nextSession: DEMO_MEETING });
        }
        if (typeof buildIdleScroll === 'function') buildIdleScroll();
      }).catch(function() {
        f1Update({ meeting: DEMO_MEETING, nextSession: DEMO_MEETING });
        if (typeof buildIdleScroll === 'function') buildIdleScroll();
      });
    }
    if (!F1State.championshipStandings.length) _f1FetchChampionship();
  },
  async _init() {
    try {
      const res = await fetch('https://api.openf1.org/v1/sessions?session_key=latest');
      if (!res.ok) {
        f1Update({ connection: 'error', connectionError: 'HTTP ' + res.status + ' ' + res.statusText });
        this._setFallbackData();
        if (_f1IsActive()) this._timer = setTimeout(() => this._init(), 10000);
        return;
      }
      const sessions = await res.json();
      if (!sessions.length) { f1Update({ connection: 'connected', connectionError: '', session: { active: false } }); return; }
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
        connection: 'connected', connectionError: '',
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
      console.warn('[F1 OpenF1] connection error:', e.message || e);
      f1Update({ connection: 'error', connectionError: e.message || String(e) });
      this._setFallbackData();
      if (_f1IsActive()) this._timer = setTimeout(() => this._init(), 15000);
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
    f1Update({ connection: 'transferring' });
    // Each endpoint is independently fault-tolerant: a rate-limit or network
    // blip on one (e.g. positions) must not wipe out the others (weather,
    // race control, etc.) for this cycle — that's what made live-race
    // polling look like it "fell over" whenever a single request failed.
    let anyOk = false, anyFail = false;

    try {
      const posRes = await fetch(`https://api.openf1.org/v1/position?session_key=${sk}&order=date&order_direction=desc&limit=30`);
      if (posRes.ok) {
        anyOk = true;
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
      } else { anyFail = true; }
    } catch (e) { anyFail = true; }

    try {
      const intRes = await fetch(`https://api.openf1.org/v1/intervals?session_key=${sk}&order=date&order_direction=desc&limit=30`);
      if (intRes.ok) {
        anyOk = true;
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
      } else { anyFail = true; }
    } catch (e) { anyFail = true; }

    try {
      const lapRes = await fetch(`https://api.openf1.org/v1/laps?session_key=${sk}&order=date&order_direction=desc&limit=5`);
      if (lapRes.ok) {
        anyOk = true;
        const laps = await lapRes.json();
        if (laps.length) {
          const maxLap = laps.reduce((m, l) => Math.max(m, l.lap_number || 0), 0);
          f1Update({ session: { lap: { current: maxLap, total: F1State.session.lap.total || maxLap } } });
        }
      } else { anyFail = true; }
    } catch (e) { anyFail = true; }

    // Session timer — compute from session start time (no network needed)
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

    try {
      const wRes = await fetch(`https://api.openf1.org/v1/weather?session_key=${sk}&order=date&order_direction=desc&limit=1`);
      if (wRes.ok) {
        anyOk = true;
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
      } else { anyFail = true; }
    } catch (e) { anyFail = true; }

    try {
      const rcRes = await fetch(`https://api.openf1.org/v1/race_control?session_key=${sk}&order=date&order_direction=desc&limit=15`);
      if (rcRes.ok) {
        anyOk = true;
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
          const latest = rc[0];
          if (latest.flag) {
            var lf = latest.flag.toUpperCase();
            var lm = (latest.message || '').toUpperCase();
            if (lm.includes('VIRTUAL SAFETY CAR') || lf === 'VSC') {
              if (typeof applyF1Flag === 'function') applyF1Flag('VIRTUAL', 'VIRTUAL SC');
            } else if (lm.includes('SAFETY CAR') || lf === 'SAFETY CAR') {
              if (typeof applyF1Flag === 'function') applyF1Flag('SAFETY', 'SAFETY CAR');
            } else {
              if (typeof applyF1Flag === 'function') applyF1Flag(latest.flag, latest.flag);
            }
            if (latest.flag === 'CHEQUERED' && !this._finishedAt) {
              this._finishedAt = Date.now();
              f1Update({ session: { finished: true } });
            }
          }
        }
      } else { anyFail = true; }
    } catch (e) { anyFail = true; }

    if (anyOk) {
      f1Update({ connection: 'connected' });
      if (typeof f1SetStatus === 'function') f1SetStatus('ok');
      this._consecutiveFails = 0;
    } else if (anyFail) {
      f1Update({ connection: 'error' });
      this._consecutiveFails = (this._consecutiveFails || 0) + 1;
    }

    // Back off on repeated total failures (e.g. rate-limiting) instead of
    // hammering the API every 8s — cap at 30s between retries.
    const backoff = this._consecutiveFails > 0
      ? Math.min(30000, 8000 * Math.pow(1.5, Math.min(this._consecutiveFails, 6)))
      : 8000;
    if (_f1IsActive()) this._timer = setTimeout(() => this._pollLive(), backoff);
  }
};

// ── Simulation Provider ──────────────────────────────────────────────────────

const DEMO_MEETING = { meeting_name: 'British Grand Prix', circuit_short_name: 'Silverstone', country_name: 'United Kingdom', date_start: '2026-07-05T14:00:00' };
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
    track: { statusText, flagRGB: [.02, 1, .1], blueFlag: false, bwFlag: false }
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
  const cur = !!F1State.track.blueFlag;
  f1Update({
    track: { blueFlag: !cur }
  });
  const flagEl = document.getElementById('f1-flag');
  const textEl = document.getElementById('f1-status-text');
  if (!cur) {
    if (flagEl) flagEl.style.background = '#0055ff';
    if (textEl) textEl.textContent = 'BLUE FLAG';
  } else {
    if (flagEl) flagEl.style.background = '#111';
    if (textEl) textEl.textContent = F1State.track.flagLabel || F1State.track.statusText || 'Idle';
  }
}

function simBWFlag() {
  const cur = !!F1State.track.bwFlag;
  f1Update({ track: { bwFlag: !cur } });
  const flagEl = document.getElementById('f1-flag');
  const textEl = document.getElementById('f1-status-text');
  if (!cur) {
    if (flagEl) flagEl.style.background = '#888';
    if (textEl) textEl.textContent = 'BLACK & WHITE';
  } else {
    if (flagEl) flagEl.style.background = '#111';
    if (textEl) textEl.textContent = F1State.track.flagLabel || F1State.track.statusText || 'Idle';
  }
}

function simFinish() {
  f1Update({
    session: { active: true, finished: true },
    track: { statusText: 'FINISHED', flagRGB: [1, 1, 1], blueFlag: false, bwFlag: false }
  });
  if (typeof activateF1Mode === 'function') activateF1Mode();
  const flagEl = document.getElementById('f1-flag');
  const textEl = document.getElementById('f1-status-text');
  if (flagEl) flagEl.style.background = '#ffffff';
  if (textEl) textEl.textContent = 'FINISHED';
}

function simNoSession() {
  if (typeof activateF1Mode === 'function') activateF1Mode();
  var m = F1State.meeting || DEMO_MEETING;
  f1Update({
    session: { active: false, finished: false },
    track: { flag: 'none', flagRGB: [0, 0, 0], flagLabel: '', statusText: '', blueFlag: false, bwFlag: false },
    meeting: m,
    nextSession: F1State.nextSession || m
  });
  if (!F1State.championshipStandings.length) {
    f1Update({ championshipStandings: [
      { pos: 1, abbrev: 'VER', points: 255, wins: 7, p2: 3, p3: 2 },
      { pos: 2, abbrev: 'NOR', points: 203, wins: 3, p2: 5, p3: 2 },
      { pos: 3, abbrev: 'LEC', points: 180, wins: 2, p2: 2, p3: 4 }
    ]});
  }
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

function simRaceStart() {
  if (typeof activateF1Mode === 'function') activateF1Mode();
  simNoSession();
  var startTime = new Date(Date.now() + 15000).toISOString();
  f1Update({
    nextSession: { date_start: startTime, session_name: 'Race', session_type: 'Race' },
    meeting: F1State.meeting || DEMO_MEETING
  });
  if (typeof buildIdleScroll === 'function') buildIdleScroll();
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

// ── Race Weekend Simulator ──────────────────────────────────────────────────

var _simWeekendTimer = null;
var _simWeekendRunning = false;
var _simWeekendSpeed = 10;

var SIM_GRID = [
  { pos:1, number:1,  name:'Verstappen', abbrev:'VER', team:'Red Bull Racing',   color:'#3671C6', gap:'LEAD' },
  { pos:2, number:4,  name:'Norris',     abbrev:'NOR', team:'McLaren',           color:'#FF8000', gap:'+0.8s' },
  { pos:3, number:16, name:'Leclerc',    abbrev:'LEC', team:'Ferrari',           color:'#E8002D', gap:'+1.2s' },
  { pos:4, number:55, name:'Sainz',      abbrev:'SAI', team:'Ferrari',           color:'#E8002D', gap:'+2.5s' },
  { pos:5, number:63, name:'Russell',    abbrev:'RUS', team:'Mercedes',          color:'#27F4D2', gap:'+3.1s' },
  { pos:6, number:44, name:'Hamilton',   abbrev:'HAM', team:'Mercedes',          color:'#27F4D2', gap:'+4.8s' },
  { pos:7, number:81, name:'Piastri',    abbrev:'PIA', team:'McLaren',           color:'#FF8000', gap:'+6.2s' },
  { pos:8, number:14, name:'Alonso',     abbrev:'ALO', team:'Aston Martin',      color:'#229971', gap:'+8.0s' },
  { pos:9, number:11, name:'Perez',      abbrev:'PER', team:'Red Bull Racing',   color:'#3671C6', gap:'+9.5s' },
  { pos:10,number:10, name:'Gasly',      abbrev:'GAS', team:'Alpine',            color:'#FF87BC', gap:'+11.3s' },
];

function _simShufflePositions() {
  var d = SIM_GRID.map(function(x) { return Object.assign({}, x); });
  var i1 = Math.floor(Math.random() * d.length);
  var i2 = Math.floor(Math.random() * d.length);
  if (i1 !== i2) {
    var tmp = d[i1]; d[i1] = d[i2]; d[i2] = tmp;
  }
  for (var i = 0; i < d.length; i++) {
    d[i].pos = i + 1;
    d[i].gap = i === 0 ? 'LEAD' : '+' + (Math.random() * 15 + 0.5).toFixed(1) + 's';
  }
  return d;
}

function _simWeekendSetStatus(text) {
  var el = document.getElementById('f1-sim-status');
  if (el) el.textContent = text;
}

var SIM_WEEKEND_SESSIONS = [
  { type: 'Practice', label: 'FP1', fp: 1, duration: 3600, weather: 'sunny',
    flags: { 600: 'YELLOW', 660: 'GREEN', 1500: 'RED', 1560: 'GREEN', 2400: 'YELLOW', 2460: 'GREEN', 3200: 'YELLOW', 3240: 'GREEN' } },
  { type: 'Practice', label: 'FP2', fp: 2, duration: 3600, weather: 'cloudy',
    flags: { 800: 'YELLOW', 860: 'GREEN', 1200: 'RED', 1280: 'GREEN', 2000: 'YELLOW', 2060: 'GREEN', 2800: 'YELLOW', 2840: 'GREEN', 3300: 'YELLOW', 3340: 'GREEN' } },
  { type: 'Practice', label: 'FP3', fp: 3, duration: 3600, weather: 'sunny',
    flags: { 900: 'YELLOW', 960: 'GREEN', 1800: 'RED', 1860: 'GREEN', 2700: 'YELLOW', 2740: 'GREEN' } },
  { type: 'Qualifying', label: 'Q1', q: 1, duration: 1080, weather: 'sunny',
    flags: { 300: 'YELLOW', 340: 'GREEN', 700: 'RED', 760: 'GREEN', 900: 'YELLOW', 940: 'GREEN' } },
  { type: 'Qualifying', label: 'Q2', q: 2, duration: 900, weather: 'sunny',
    flags: { 400: 'YELLOW', 440: 'GREEN', 650: 'YELLOW', 680: 'GREEN' } },
  { type: 'Qualifying', label: 'Q3', q: 3, duration: 720, weather: 'cloudy',
    flags: { 300: 'YELLOW', 330: 'GREEN', 500: 'RED', 560: 'GREEN' } },
  { type: 'Race', label: 'Race', duration: 7200, totalLaps: 52, weather: 'sunny' }
];

var RACE_LAP_FLAGS = {
  1: 'GREEN',
  3: 'YELLOW', 4: 'GREEN',
  8: ['VIRTUAL', 'VIRTUAL SC'], 11: 'GREEN',
  14: 'YELLOW', 15: 'GREEN',
  18: 'BLUE_ON', 19: 'BLUE_OFF',
  22: ['DOUBLE YELLOW', 'DOUBLE YELLOW'], 23: 'YELLOW', 24: 'GREEN',
  28: ['SAFETY', 'SAFETY CAR'], 31: 'GREEN',
  34: 'BLUE_ON', 35: 'BLUE_OFF',
  37: 'BW_ON', 38: 'BW_OFF',
  40: 'YELLOW', 41: 'GREEN',
  43: ['VIRTUAL', 'VIRTUAL SC'], 45: 'GREEN',
  47: 'RAIN',
  49: 'YELLOW', 50: 'GREEN'
};

var _simWkSessions = [];
var _simWkIdx = 0;
var _simWkElapsed = 0;
var _simWkBreak = 0;
var _simWkRaceLap = 0;
var _simWkLapTimer = 0;

function _simWeekendTick() {
  if (!_simWeekendRunning) return;

  // Break between sessions
  if (_simWkBreak > 0) {
    _simWkBreak--;
    _simWeekendSetStatus('Break — next session in ' + _simWkBreak + 's');
    _simWeekendTimer = setTimeout(_simWeekendTick, 1000 / _simWeekendSpeed);
    return;
  }

  if (_simWkIdx >= _simWkSessions.length) {
    _simWeekendRunning = false;
    _simWeekendSetStatus('Weekend complete');
    var btn = document.getElementById('f1-sim-weekend');
    if (btn) btn.textContent = 'Simulate Race Weekend';
    simNoSession();
    return;
  }

  var ses = _simWkSessions[_simWkIdx];
  var isRace = ses.type === 'Race';

  // First tick of session — init
  if (_simWkElapsed === 0) {
    simSession(ses.type);
    if (ses.fp) f1Update({ session: { fpSession: ses.fp } });
    if (ses.q) f1Update({ session: { qSession: ses.q } });
    if (ses.weather) simWeather(ses.weather);
    var lapData = isRace ? { current: 0, total: ses.totalLaps } : { current: 0, total: 0 };
    f1Update({ session: {
      timer: { duration: ses.duration, elapsed: 0, remaining: ses.duration },
      lap: lapData
    }});
    simFlag('GREEN', 'GREEN');
    f1Update({ drivers: _simShufflePositions() });
    if (typeof updateLeaderboardUI === 'function') updateLeaderboardUI();
    if (typeof updateSessionUI === 'function') updateSessionUI();
    _simWkRaceLap = 0;
    _simWkLapTimer = 0;
  }

  _simWkElapsed++;
  var remaining = ses.duration - _simWkElapsed;

  if (isRace) {
    // Advance lap based on time: ~138s per lap for 52 laps in 7200s
    var secsPerLap = ses.duration / ses.totalLaps;
    var expectedLap = Math.min(ses.totalLaps, Math.floor(_simWkElapsed / secsPerLap) + 1);
    if (expectedLap > _simWkRaceLap) {
      _simWkRaceLap = expectedLap;
      f1Update({ session: { lap: { current: _simWkRaceLap, total: ses.totalLaps } } });

      // Lap-based flag events
      var lapFlag = RACE_LAP_FLAGS[_simWkRaceLap];
      if (lapFlag) {
        if (lapFlag === 'BLUE_ON') { if (!F1State.track.blueFlag) simBlueFlag(); }
        else if (lapFlag === 'BLUE_OFF') { if (F1State.track.blueFlag) simBlueFlag(); }
        else if (lapFlag === 'RAIN') { simWeather('rain'); }
        else if (Array.isArray(lapFlag)) { simFlag(lapFlag[0], lapFlag[1]); }
        else { simFlag(lapFlag, lapFlag); }
      }

      if (_simWkRaceLap % 3 === 0) {
        f1Update({ drivers: _simShufflePositions() });
        if (typeof updateLeaderboardUI === 'function') updateLeaderboardUI();
      }
    }
    _simWeekendSetStatus(ses.label + ' — Lap ' + _simWkRaceLap + '/' + ses.totalLaps);
  } else {
    // Timed session — check flag events
    if (ses.flags && ses.flags[_simWkElapsed]) {
      var f = ses.flags[_simWkElapsed];
      simFlag(f, f);
      f1Update({ drivers: _simShufflePositions() });
      if (typeof updateLeaderboardUI === 'function') updateLeaderboardUI();
    }
    // Shuffle positions occasionally
    if (_simWkElapsed % 120 === 0) {
      f1Update({ drivers: _simShufflePositions() });
      if (typeof updateLeaderboardUI === 'function') updateLeaderboardUI();
    }
    var mins = Math.floor(remaining / 60);
    var secs = String(remaining % 60).padStart(2, '0');
    _simWeekendSetStatus(ses.label + ' — ' + mins + ':' + secs + ' remaining');
  }

  f1Update({ session: { timer: { duration: ses.duration, elapsed: _simWkElapsed, remaining: Math.max(0, remaining) } } });
  f1DataDirty = true;
  if (typeof updateSessionUI === 'function') updateSessionUI();

  // Session end
  if (_simWkElapsed >= ses.duration) {
    simFlag('CHEQUERED', 'FINISHED');
    if (isRace) f1Update({ session: { finished: true } });
    if (typeof updateSessionUI === 'function') updateSessionUI();
    _simWkIdx++;
    _simWkElapsed = 0;
    _simWkBreak = 5;
    _simWeekendTimer = setTimeout(_simWeekendTick, 1000 / _simWeekendSpeed);
    return;
  }

  _simWeekendTimer = setTimeout(_simWeekendTick, 1000 / _simWeekendSpeed);
}

function simWeekendToggle() {
  if (_simWeekendRunning) {
    _simWeekendRunning = false;
    if (_simWeekendTimer) { clearTimeout(_simWeekendTimer); _simWeekendTimer = null; }
    _simWeekendSetStatus('Stopped');
    var btn = document.getElementById('f1-sim-weekend');
    if (btn) btn.textContent = 'Simulate Race Weekend';
    return;
  }
  if (typeof activateF1Mode === 'function') activateF1Mode();
  _simWeekendRunning = true;
  _simWkSessions = [];
  var chks = document.querySelectorAll('[data-sim-ses]');
  for (var i = 0; i < chks.length; i++) {
    if (chks[i].checked) _simWkSessions.push(SIM_WEEKEND_SESSIONS[parseInt(chks[i].getAttribute('data-sim-ses'))]);
  }
  if (!_simWkSessions.length) _simWkSessions = SIM_WEEKEND_SESSIONS.slice();
  _simWkIdx = 0;
  _simWkElapsed = 0;
  _simWkBreak = 0;
  _simWkRaceLap = 0;
  var btn = document.getElementById('f1-sim-weekend');
  if (btn) btn.textContent = 'Stop Simulation';
  document.getElementById('f1-sim-weekend-controls').style.display = 'block';
  _simWeekendSpeed = parseInt(document.getElementById('f1-sim-speed').value) || 10;
  _simWeekendTick();
}
