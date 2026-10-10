// The Pi's microphone (any USB mic or headset PulseAudio can see). Main
// thread only. One `parec` capture feeds two things:
//   - speech: when someone talks, the utterance (start of voice to ~0.9 s of
//     silence) is handed to onUtterance as a 16 kHz mono WAV - the Talking
//     Face answers it (faceTalk.js hear()).
//   - music:  a live spectrum of the room (spec()), so effects react to
//     music playing nearby when no station is on (prefs.mic.music; merged
//     with the radio's spectrum in tick.js).
// It only runs while something wants it (setWanted), and re-checks for a
// microphone every 30 s, so plugging one in later just works. While the
// face is speaking, speech detection is paused (isBusy) so it doesn't
// answer itself.
'use strict';

const { spawn: realSpawn, execFile: realExecFile } = require('child_process');
const { createAnalyser, BAND_COUNT, nextPow2 } = require('./effects/radio/fft');

const RATE = 16000;
const FRAME = 480; // 30 ms
const MAX_UTTER_S = 12;
const END_SILENCE_FRAMES = 30; // ~0.9 s
const MIN_VOICE_FRAMES = 10; // ~0.3 s of voice before it counts as speech
const PRE_ROLL_FRAMES = 10; // keep the start of the first word

function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Picks a capture source from `pactl list short sources`: the first that
// isn't a ".monitor" (a monitor is the speaker's own output, not a mic).
function pickSource(listing) {
  for (const line of String(listing || '').split('\n')) {
    const name = line.split('\t')[1];
    if (name && !/\.monitor$/.test(name)) return name;
  }
  return null;
}

function createMic({ onUtterance = () => {}, isBusy = () => false, spawnFn = realSpawn, execFileFn = realExecFile, now = Date.now } = {}) {
  const status = { mic: '', source: '', listening: false, hearing: false, level: 0 };
  let wanted = { speech: false, music: false }, proc = null, lastLook = 0, env = process.env, server = null;
  let rest = Buffer.alloc(0);
  // Speech detector.
  let noise = 0.004, voiceFrames = 0, silentFrames = 0, inSpeech = false, utter = [], preRoll = [];
  // Room spectrum.
  const analyser = createAnalyser(RATE, 1024);
  const ring = new Float32Array(nextPow2(analyser.win * 2));
  let ringPos = 0;
  const spectrum = new Float32Array(BAND_COUNT);
  let specAt = 0;

  function pulse() {
    try {
      const p = require('./pulseEnv').findPulseEnv();
      if (p.env) { env = { ...process.env, ...p.env }; server = p.env.PULSE_SERVER; }
    } catch (e) { /* default env */ }
  }

  function stop() {
    const p = proc; proc = null;
    if (p) { try { p.kill(); } catch (e) { /* gone */ } }
    status.listening = false; status.hearing = false; inSpeech = false; utter = []; spectrum.fill(0);
  }

  function start(source) {
    const args = ['--raw', '--format=s16le', '--rate=' + RATE, '--channels=1', '--latency-msec=60', '--device=' + source];
    if (server) args.unshift('--server=' + server);
    let p;
    try { p = spawnFn('parec', args, { stdio: ['ignore', 'pipe', 'pipe'], env }); } catch (e) { status.mic = 'Microphone failed: ' + e.message; return; }
    proc = p; status.source = source; status.listening = true; status.mic = '';
    let err = '';
    p.stdout.on('data', (d) => { if (p === proc) onData(d); });
    if (p.stderr) p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { if (p === proc) { proc = null; status.listening = false; status.mic = /ENOENT/.test(e.message) ? 'parec is missing (sudo apt install pulseaudio-utils)' : 'Microphone failed: ' + e.message; } });
    p.on('exit', (code) => { if (p === proc) { proc = null; status.listening = false; status.mic = 'Microphone stopped' + (err.trim() ? ': ' + err.trim().split('\n').pop() : code ? ' (exit ' + code + ')' : ''); lastLook = 0; } });
  }

  // Looks for a microphone and starts listening (at most every 30 s).
  function ensure() {
    if (proc || now() - lastLook < 30000) return;
    lastLook = now();
    pulse();
    const args = server ? ['--server=' + server, 'list', 'short', 'sources'] : ['list', 'short', 'sources'];
    try {
      execFileFn('pactl', args, { env, timeout: 5000 }, (e, out) => {
        if (proc || !(wanted.speech || wanted.music)) return;
        const src = e ? null : pickSource(out);
        if (!src) { status.mic = e ? 'Could not ask the sound system for a microphone' : 'No microphone found - plug a USB microphone into the Pi'; return; }
        start(src);
      });
    } catch (e) { status.mic = 'Microphone failed: ' + e.message; }
  }

  function setWanted(w) {
    wanted = { speech: !!w.speech, music: !!w.music };
    if (wanted.speech || wanted.music) ensure(); else if (proc) stop();
  }

  function onData(d) {
    const buf = rest.length ? Buffer.concat([rest, d]) : d;
    const whole = buf.length - (buf.length % (FRAME * 2));
    for (let o = 0; o < whole; o += FRAME * 2) frame(buf.subarray(o, o + FRAME * 2));
    rest = Buffer.from(buf.subarray(whole));
  }

  function frame(f) {
    let sum = 0;
    for (let i = 0; i < FRAME; i++) {
      const s = f.readInt16LE(i * 2) / 32768;
      sum += s * s;
      ring[ringPos] = s; ringPos = (ringPos + 1) & (ring.length - 1);
    }
    const rms = Math.sqrt(sum / FRAME);
    status.level = Math.min(1, rms * 8);
    if (wanted.music) { spectrum.set(analyser.analyse(ring, ringPos)); specAt = now(); }
    if (wanted.speech) detect(f, rms);
  }

  function detect(f, rms) {
    if (isBusy()) { // the face is talking: don't listen to ourselves
      if (inSpeech) { inSpeech = false; utter = []; status.hearing = false; }
      voiceFrames = 0; preRoll = [];
      return;
    }
    const loud = rms > Math.max(0.012, noise * 3.2);
    if (!inSpeech) {
      if (!loud) noise += (rms - noise) * 0.02; // follow the room's background level
      preRoll.push(Buffer.from(f)); if (preRoll.length > PRE_ROLL_FRAMES) preRoll.shift();
      voiceFrames = loud ? voiceFrames + 1 : Math.max(0, voiceFrames - 1);
      if (voiceFrames >= MIN_VOICE_FRAMES) { inSpeech = true; status.hearing = true; utter = preRoll; preRoll = []; silentFrames = 0; }
      return;
    }
    utter.push(Buffer.from(f));
    silentFrames = loud ? 0 : silentFrames + 1;
    if (silentFrames >= END_SILENCE_FRAMES || utter.length * FRAME >= MAX_UTTER_S * RATE) {
      const pcm = Buffer.concat(utter);
      inSpeech = false; status.hearing = false; utter = []; voiceFrames = 0;
      try { onUtterance(wav(pcm)); } catch (e) { /* the listener's problem */ }
    }
  }

  // The room's spectrum for effects, or null when not listening for music
  // (or the capture has gone quiet).
  function spec() { return wanted.music && proc && now() - specAt < 500 ? spectrum : null; }

  return { setWanted, spec, status, stop, _test: { frame, pickSource } };
}

module.exports = { createMic, pickSource, wav, RATE };
