/* f1-state.js — Single canonical F1 race state object */

window.F1State = {
  source: 'none',              // 'esp32'|'openf1'|'simulation'|'none'
  connection: 'idle',          // 'idle'|'connecting'|'connected'|'error'
  lastUpdate: 0,
  updateCount: 0,
  reconnectCount: 0,

  session: {
    active: false,
    type: '',                  // 'race','qualifying','practice','sprint',''
    name: '',                  // e.g. 'British Grand Prix'
    circuit: '',               // e.g. 'Silverstone'
    dateStart: '',
    qSession: 1,               // Q1/Q2/Q3
    fpSession: 1,              // FP1/FP2/FP3
    finished: false,
    lap: { current: 0, total: 0 },
    timer: { duration: 0, elapsed: 0, remaining: 0 }
  },

  drivers: [],                 // [{pos, number, name, abbrev, team, color, gap, interval, lastLap}]

  track: {
    flag: 'none',              // 'none','green','yellow','red','sc','vsc','chequered'
    flagRGB: [0, 0, 0],        // [r,g,b] 0-1
    flagLabel: '',
    statusText: '',            // display string
    raceControlMessages: []    // [{message, flag, lap, timestamp}] last 10
  },

  weather: {
    temp: null,
    humidity: null,
    wind: null,
    rain: false,
    condition: '',
    code: 0
  },

  carPositions: [],            // [{driverNumber, frac, colour}]
  meeting: null                // raw meeting data
};

let f1DataDirty = true;

function f1Update(partial) {
  _f1Merge(F1State, partial);
  F1State.lastUpdate = Date.now();
  F1State.updateCount++;
  f1DataDirty = true;
  document.dispatchEvent(new CustomEvent('f1-state-change', { detail: partial }));
}

function f1Reset() {
  F1State.source = 'none';
  F1State.connection = 'idle';
  F1State.lastUpdate = 0;
  F1State.updateCount = 0;
  F1State.reconnectCount = 0;
  F1State.session = {
    active: false, type: '', name: '', circuit: '', dateStart: '',
    qSession: 1, fpSession: 1, finished: false,
    lap: { current: 0, total: 0 },
    timer: { duration: 0, elapsed: 0, remaining: 0 }
  };
  F1State.drivers = [];
  F1State.track = { flag: 'none', flagRGB: [0, 0, 0], flagLabel: '', statusText: '', raceControlMessages: [] };
  F1State.weather = { temp: null, humidity: null, wind: null, rain: false, condition: '', code: 0 };
  F1State.carPositions = [];
  F1State.meeting = null;
  f1DataDirty = true;
  document.dispatchEvent(new CustomEvent('f1-state-change'));
}

function _f1Merge(target, source) {
  if (!source) return;
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      _f1Merge(target[key], val);
    } else {
      target[key] = val;
    }
  }
}
