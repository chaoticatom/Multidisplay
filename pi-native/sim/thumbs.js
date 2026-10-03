// Builds public/thumbs.json: a tiny looping animation of every effect
// (16x16 pixels, 12 frames) for the control page's live effect tiles.
// Effects run headless here, exactly as on the Pi, with network calls
// answered by canned data. Run by sim/deploy.js (so `npm run release`).
'use strict';
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');

let seed = 4242;
Math.random = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let fakeNow = Date.UTC(2026, 8, 27, 20, 37, 21);
const RealDate = Date;
global.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(fakeNow); } static now() { return fakeNow; } };
const FAKE = [
  [/icanhazdadjoke/, { joke: 'Why did the LED blush? It saw the bus.' }],
  [/opentdb/, { results: [{ question: 'Which planet has most moons?', correct_answer: 'Saturn', incorrect_answers: ['Mars', 'Venus', 'Earth'] }] }],
  [/onthisday/, { events: [{ year: 1969, text: 'Apollo 11 lands on the Moon.' }] }],
  [/geocoding-api/, { results: [{ latitude: 51.5, longitude: -0.12, name: 'London', timezone: 'Europe/London' }] }],
  [/api\.open-meteo/, { current: { temperature_2m: 18, weather_code: 61, wind_speed_10m: 12 }, daily: { sunrise: ['2026-09-27T06:52'], sunset: ['2026-09-27T18:45'], temperature_2m_max: [21] } }],
];
global.fetch = (url) => {
  const hit = FAKE.find(([re]) => re.test(String(url)));
  if (!hit) return new Promise(() => {});
  return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(hit[1])), text: async () => JSON.stringify(hit[1]) });
};
const cp = require('child_process');
cp.spawn = () => { const { EventEmitter } = require('events'); const e = new EventEmitter(); e.stdout = new EventEmitter(); e.stderr = new EventEmitter(); e.stdin = Object.assign(new EventEmitter(), { write() { return true; }, end() {}, writable: false }); e.kill = () => {}; return e; };
global.setInterval = () => ({ unref() {} });
global.setTimeout = () => ({ unref() {} });
const yieldLoop = () => new Promise((r) => setImmediate(r));

const { CubeCore } = require(path.join(root, 'src/core'));
const { WALL_EFFECTS } = require(path.join(root, 'src/effects'));

const S = 16, FRAMES = 12, WARM = 20, STEP = 4;
const OPTS = { radio: { radio: { spectrumOn: true } }, datetime: { datetime: { mode: 'time' } }, message: { message: { text: 'HELLO', style: 'rainbow' } } };

(async () => {
  const out = {};
  // No moving tile preview for these (the tile just shows the name).
  const NO_PREVIEW = new Set(['easter_egg']);
  for (const [key, fn] of Object.entries(WALL_EFFECTS)) {
    if (NO_PREVIEW.has(key)) continue;
    seed = 4242;
    const core = new CubeCore(64);
    core.initWall([{ gx: 0, gy: 0 }], 64);
    core.panelMode = 'wall'; core.effectOptions = OPTS[key] || {}; core.t = 0; core.speedMult = 1;
    core.audio = { bass: 0.5, mid: 0.4, treble: 0.3, level: 0.4, beat: 0 };
    const bytes = new Uint8Array(S * S * 3 * FRAMES);
    let f = 0;
    try {
      for (let i = 0; f < FRAMES && i < WARM + STEP * FRAMES + 1; i++) {
        fakeNow += 33;
        fn(core, 1 / 30);
        await yieldLoop();
        if (i >= WARM && (i - WARM) % STEP === 0) {
          const B = 64 / S, W = core.wallW, buf = core.wallBuf;
          for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            let r = 0, g = 0, b = 0;
            for (let dy = 0; dy < B; dy++) for (let dx = 0; dx < B; dx++) {
              const o = ((y * B + dy) * W + x * B + dx) * 3; r += buf[o]; g += buf[o + 1]; b += buf[o + 2];
            }
            const o = f * S * S * 3 + (y * S + x) * 3, n = B * B;
            // Boost a little: averaging 4x4 blocks dims thin bright detail.
            bytes[o] = Math.min(255, (r / n) * 330); bytes[o + 1] = Math.min(255, (g / n) * 330); bytes[o + 2] = Math.min(255, (b / n) * 330);
          }
          f++;
        }
      }
    } catch (e) { /* an effect that can't run headless just gets no tile animation */ }
    if (f === FRAMES) out[key] = Buffer.from(bytes).toString('base64');
  }
  fs.writeFileSync(path.join(root, 'public', 'thumbs.json'), JSON.stringify({ size: S, frames: FRAMES, fx: out }));
  console.log('[thumbs] wrote public/thumbs.json (' + Object.keys(out).length + ' effects)');
  process.exit(0);
})();
