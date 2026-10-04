// Sound effects through the Pi's speaker (the paired Bluetooth one, or
// whatever PulseAudio's default sink is), mixed over any radio playing.
// Each sound is synthesised here (8-bit style square/saw waves and noise),
// then piped to `paplay --raw`, the same way the radio plays (see
// effects/radio/ffmpegAudio.js). Effects in the render worker queue sound
// names on core.sfx; the main thread plays them (see app.js).
//   play(name, volume)   name: laser, boom, coin, jump, waka, blip, start, horn
'use strict';
const { spawn: realSpawn } = require('child_process');
const { findPulseEnv } = require('./pulseEnv');

const RATE = 22050;
const square = (f, t) => (Math.sin(2 * Math.PI * f * t) >= 0 ? 1 : -1);
const saw = (f, t) => 2 * ((f * t) % 1) - 1;
const tri = (f, t) => 1 - 4 * Math.abs(((f * t) % 1) - 0.5);

// name -> (t, dur) => sample in -1..1, plus duration in seconds.
const SOUNDS = {
  laser: [0.16, (t, d) => square(1500 - (t / d) * 1200, t) * (1 - t / d)],
  boom: [0.45, (t, d) => (Math.random() * 2 - 1) * Math.pow(1 - t / d, 2)],
  coin: [0.33, (t) => square(t < 0.08 ? 988 : 1319, t) * (t < 0.08 ? 0.8 : 0.8 * (1 - (t - 0.08) / 0.25))],
  jump: [0.15, (t, d) => square(300 + (t / d) * 600, t) * 0.7],
  waka: [0.1, (t, d) => tri(450 - (t / d) * 250, t) * 0.9],
  blip: [0.05, (t) => square(880, t) * 0.6],
  start: [0.6, (t) => { const n = [523, 659, 784, 1047][Math.min(3, Math.floor(t / 0.15))]; return square(n, t) * 0.6 * (1 - (t % 0.15) / 0.2); }],
  horn: [0.9, (t, d) => (saw(440 + 18 * Math.sin(t * 40), t) * 0.6 + saw(554, t) * 0.4) * Math.min(1, t * 20) * (t > d - 0.1 ? (d - t) * 10 : 1)],
};

function synth(name, volume = 0.6) {
  const s = SOUNDS[name];
  if (!s) return null;
  const [dur, fn] = s, n = Math.round(dur * RATE), buf = Buffer.alloc(n * 2);
  const v = Math.max(0, Math.min(1, volume)) * 0.5; // headroom under the radio
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, fn(i / RATE, dur) * v)) * 32767), i * 2);
  return buf;
}

// At most a few at once, and the same sound no more than every 80 ms, so a
// burst of events can't flood the speaker with processes.
const lastAt = {};
let running = 0;
function play(name, volume = 0.6, spawn = realSpawn) {
  const now = Date.now();
  if (running >= 4 || now - (lastAt[name] || 0) < 80) return false;
  const pcm = synth(name, volume);
  if (!pcm) return false;
  lastAt[name] = now;
  let proc;
  try {
    const pulse = findPulseEnv();
    const env = pulse.env ? { ...process.env, ...pulse.env } : process.env;
    const args = ['--raw', '--format=s16le', '--rate=' + RATE, '--channels=1'];
    if (pulse.env) args.unshift('--server=' + pulse.env.PULSE_SERVER);
    proc = spawn('paplay', args, { stdio: ['pipe', 'ignore', 'ignore'], env });
  } catch (e) { return false; }
  running++;
  const done = () => { running = Math.max(0, running - 1); };
  proc.on('error', done);
  proc.on('close', done);
  proc.stdin.on('error', () => { /* paplay gone - nothing to do */ });
  proc.stdin.end(pcm);
  return true;
}

module.exports = { play, synth, SOUNDS, RATE };
