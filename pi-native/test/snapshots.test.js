// Visual regression test: renders every effect (cube, 2D and wall, plus
// radio text, Identify Panels and alarm overlays) for a few dozen frames
// under deterministic randomness and time, and compares a hash of each
// sampled frame against test/snapshots.json.
//
// A failure means some effect's OUTPUT changed. If that was intended (you
// changed how an effect looks), re-record the baseline and commit it:
//   npm run snapshots:update
// Pixels are quantised to 8 bits (what the panels actually show) before
// hashing, so tiny float differences between Node versions or CPUs don't
// trip it.
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const BASELINE = path.join(__dirname, 'snapshots.json');
const UPDATE = process.argv.includes('--update');

// --- determinism ---
let seed = 12345;
Math.random = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const T0 = Date.UTC(2026, 8, 27, 14, 37, 21);
let fakeNow = T0;
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(fakeNow); } static now() { return fakeNow; } }
global.Date = FakeDate;

// Fake API responses so the fetch-driven text effects actually draw text.
const FAKE = [
  [/icanhazdadjoke/, { joke: 'Why did the LED cube blush? It saw the bus bar.' }],
  [/opentdb/, { results: [{ question: 'Which planet has the most moons?', correct_answer: 'Saturn', incorrect_answers: ['Jupiter', 'Mars', 'Venus'] }] }],
  [/onthisday/, { events: [{ year: 1969, text: 'Apollo 11 lands on the Moon.' }, { year: 1989, text: 'The Berlin Wall falls.' }] }],
  [/geocoding-api/, { results: [{ latitude: 51.5, longitude: -0.12, name: 'London', timezone: 'Europe/London' }] }],
  [/api\.open-meteo/, { current: { temperature_2m: 18.4, weather_code: 3, wind_speed_10m: 12 }, daily: { sunrise: ['2026-09-27T06:52'], sunset: ['2026-09-27T18:45'], temperature_2m_max: [21] } }],
];
global.fetch = (url) => {
  const hit = FAKE.find(([re]) => re.test(String(url)));
  if (!hit) return new Promise(() => {});
  return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(hit[1])), text: async () => JSON.stringify(hit[1]) });
};
const cp = require('child_process');
cp.spawn = () => { const { EventEmitter } = require('events'); const e = new EventEmitter(); e.stdout = new EventEmitter(); e.stderr = new EventEmitter(); e.stdin = Object.assign(new EventEmitter(), { write() { return true; }, end() {}, writable: false }); e.kill = () => {}; return e; };
setInterval = () => ({ unref() {} }); // eslint-disable-line no-global-assign
const yieldLoop = () => new Promise((r) => setImmediate(r));
// Fake setTimeout on the fake clock (lightning schedules follow-up strikes
// with real timers, which leaked wall-clock jitter into the snapshots).
let timerQ = [];
global.setTimeout = (fn, ms = 0) => { timerQ.push({ at: fakeNow + ms, fn }); return { unref() {} }; };
function flushTimers() { const due = timerQ.filter((t) => t.at <= fakeNow); timerQ = timerQ.filter((t) => t.at > fakeNow); for (const t of due) t.fn(); }

const { CubeCore } = require(path.join(root, 'src/core'));
const { EFFECTS, WALL_EFFECTS } = require(path.join(root, 'src/effects'));
const { renderIdentify } = require(path.join(root, 'src/effects/identify'));
const radio = require(path.join(root, 'src/effects/radio/radio'));
const alarms = require(path.join(root, 'src/effects/alarms'));

const hash = (buf) => {
  const q = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) q[i] = Math.max(0, Math.min(255, Math.round(buf[i] * 255)));
  return crypto.createHash('sha1').update(q).digest('hex').slice(0, 12);
};
const results = {};

async function run(label, core, fn, opts, panelMode, ticks = 45) {
  seed = 12345; fakeNow = T0; timerQ = [];
  core.panelMode = panelMode; core.effectOptions = opts; core.t = 0; core.speedMult = 1;
  const buf = panelMode === 'wall' ? core.wallBuf : core.colBuf;
  const hashes = [];
  for (let i = 0; i < ticks; i++) {
    fakeNow += 33;
    try { flushTimers(); fn(core, 1 / 30); } catch (e) { hashes.push('ERR:' + e.message); break; }
    await yieldLoop(); await yieldLoop();
    if (i % 5 === 4) hashes.push(hash(buf));
  }
  results[label] = hashes.join(',');
}

const VARIANTS = {
  datetime: ['time', 'date', 'both', 'full', 'words', 'analogue'].map((m) => ({ datetime: { mode: m } })),
  fireworks: [{}, { fireworks: { textOn: true, text: 'HI 2026!' } }],
  moon: ['moon', 'mars', 'saturn', 'sun', 'solarsystem'].map((b) => ({ moon: { body: b } })),
  radio: [{}, { radio: { spectrumOn: true } }],
  weather: [{}, { weather: { city: 'London' } }],
};

(async () => {
  for (const mode of ['cube', '2d']) {
    for (const [key, fn] of Object.entries(EFFECTS)) {
      for (const [vi, opts] of (VARIANTS[key] || [{}]).entries()) {
        await run(`${mode}:${key}:${vi}`, new CubeCore(64), fn, opts, mode);
      }
    }
  }
  for (const [key, fn] of Object.entries(WALL_EFFECTS)) {
    for (const [vi, opts] of (VARIANTS[key] || [{}]).entries()) {
      const core = new CubeCore(64); core.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64);
      await run(`wall:${key}:${vi}`, core, fn, opts, 'wall');
    }
  }

  // Radio text paths: a playing station's scrolling ticker, and the debug
  // sweep's static live-Hz label.
  for (const [label, start] of [['station', () => radio.playStation({ name: 'SomaFM Groove Salad', genre: 'Ambient', url: 'http://x/y' })], ['sweep', () => radio.playDebugTone('sweep')]]) {
    start();
    await run(`cube:radio-${label}`, new CubeCore(64), EFFECTS.radio, {}, '2d');
    const w = new CubeCore(64); w.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64);
    await run(`wall:radio-${label}`, w, WALL_EFFECTS.radio, {}, 'wall');
    radio.stopStation();
  }

  // Identify Panels overlay in every mode.
  for (const mode of ['cube', '2d']) {
    await run(`identify:${mode}`, new CubeCore(64), (c) => renderIdentify(c, { mode, size: 64, panels: [] }), {}, mode, 5);
  }
  {
    const core = new CubeCore(64); core.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }, { gx: 0, gy: 1 }], 64);
    await run('identify:wall', core, (c) => renderIdentify(c, { mode: 'wall', size: 64, panels: c.wallPanels }), {}, 'wall', 5);
  }

  // Alarm text: main-phase big message, pre-phase countdown, wind-down
  // countdown + message.
  const ALARMS = {
    main: () => ({ al: { message: 'Wake up 7:00!' }, phase: 'main', startMs: T0 }),
    pre: () => ({ al: { message: 'Morning', prealarm: {} }, phase: 'pre', startMs: T0, preMs: 600000 }),
    winddown: () => ({ al: { message: 'Sleep well', prealarm: { windDown: true } }, phase: 'pre', startMs: T0, preMs: 600000 }),
  };
  for (const [label, mk] of Object.entries(ALARMS)) {
    const state = { activeAlarm: mk(), brightness: 1, effect: 'wave', overlays: {} };
    await run(`alarm:${label}`, new CubeCore(64), (c, dt) => {
      alarms.renderMainMessage(c, state);
      alarms.renderPrePhase(c, dt, state, EFFECTS);
    }, {}, 'cube', 10);
  }

  console.log('snapshots');
  if (UPDATE || !fs.existsSync(BASELINE)) {
    fs.writeFileSync(BASELINE, JSON.stringify(results, null, 1) + '\n');
    console.log(`  wrote ${Object.keys(results).length} snapshots to test/snapshots.json`);
    process.exit(0);
  }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const changed = Object.keys(results).filter((k) => k in base && base[k] !== results[k]);
  const missing = Object.keys(base).filter((k) => !(k in results));
  const added = Object.keys(results).filter((k) => !(k in base));
  if (changed.length || missing.length || added.length) {
    console.error(`  FAIL - effect output changed: ${changed.length} changed, ${added.length} new, ${missing.length} gone`);
    for (const k of [...changed, ...added, ...missing].slice(0, 30)) console.error('    ' + k);
    console.error('  If intended, run: npm run snapshots:update (and commit test/snapshots.json)');
    process.exit(1);
  }
  console.log(`  ok - all ${Object.keys(results).length} effect snapshots match`);
  console.log('All snapshot tests passed');
  process.exit(0);
})();
