// What the Talking Face says (effects/talkingFace.js draws it). Runs on the
// main thread and keeps state.faceTalk:
//   say: { id, text, at, cps }  - the current line (the render worker reads it)
//   thinking: true while waiting for an AI reply
//   log: [{ who: 'you'|'face', text }]  - the conversation, for the phone
// say(text) speaks a line; chat(text) answers it (AI assistant if set up, a
// friendly fallback if not); tick() (every 5 s) starts a topic by itself
// when the face is on screen and has been quiet for a while.
// Voice (effect option `voice`): 'phone' (the page speaks it), 'pi' (Gemini
// speech or espeak-ng to the Pi's speaker), 'both' or 'off'. The caption
// on the display is timed to the actual audio, and the laugh is heard too.
'use strict';

const { spawn } = require('child_process');
const CPS = 15; // speaking rate, characters per second (~170 words a minute)
let id = 0; // line numbers, unique for the whole process (the page speaks each new one once)

// Built-in jokes (it laughs at the punchline).
const JOKES = [
  'Why don\'t skeletons fight each other? They don\'t have the guts.',
  'I told my wife she was drawing her eyebrows too high. She looked surprised.',
  'Why did the scarecrow win an award? Because he was outstanding in his field.',
  'I\'m reading a book about anti-gravity. It\'s impossible to put down.',
  'What do you call a fish with no eyes? A fsh.',
  'Why can\'t you trust an atom? They make up everything.',
  'I used to be a banker, but I lost interest.',
  'What do you call a sleeping dinosaur? A dino-snore.',
  'Why did the LED go to school? To get a little brighter.',
  'Parallel lines have so much in common. It\'s a shame they\'ll never meet.',
];
const LAUGH_MS = 1800;
const GAP_MS = 150; // between a laugh and the words
const FUNNY = /\b(joke|haha+|ha ha|lol|lmao|funny|hilarious)\b|😂|🤣/i;

const TOPICS = [
  'Did you know octopuses have three hearts and blue blood?',
  'Honey never goes off. Archaeologists have found pots of it in Egyptian tombs that were still good to eat.',
  'A day on Venus is longer than its year. It spins that slowly.',
  'Bananas are berries, but strawberries aren\'t. Botany is strange.',
  'What\'s the best thing that happened to you today?',
  'Sea otters hold hands when they sleep, so they don\'t drift apart.',
  'The Eiffel Tower grows about fifteen centimetres taller in summer, as the metal warms up.',
  'If you could travel anywhere tomorrow, where would you go?',
  'Wombats do cube-shaped poo. Nobody is quite sure why that evolved.',
  'There are more possible games of chess than atoms in the observable universe.',
  'Have you listened to any good music lately? I\'d love to know what you like.',
  'A group of flamingos is called a flamboyance. Perfect name.',
  'Lightning is about five times hotter than the surface of the sun.',
  'Cows have best friends, and they get stressed when they\'re apart.',
  'The shortest war in history lasted about thirty-eight minutes.',
  'Your brain uses about twenty percent of your energy, even though it\'s only about two percent of your weight.',
  'What would you cook if you had the evening off and anything in the fridge?',
  'Scotland\'s national animal is the unicorn.',
  'Some turtles can breathe through their bums. Nature is wonderful.',
];

function timeGreeting(tz) {
  const h = require('./localTime').wallClock(tz).getHours();
  return h < 5 ? 'It\'s getting late. Don\'t stay up too long!' : h < 12 ? 'Good morning! I hope you slept well.' : h < 18 ? 'Good afternoon! How\'s your day going?' : 'Good evening! Time to relax a little.';
}

function createFaceTalk({ state, broadcast, ai = require('./ai'), spawnFn = spawn, now = Date.now, speakerLagMs = () => 0 } = {}) {
  const ft = state.faceTalk || (state.faceTalk = { say: null, thinking: false, log: [] });
  let speakEnds = 0, lastTopic = -1, voiceProc = null;
  const status = { voice: '' };

  const opts = () => (state.effectOptions && state.effectOptions.talking_face) || {};
  const voice = () => opts().voice || 'phone';

  // The basic Pi voice: espeak-ng rendered to a WAV first (the text goes as
  // an argument, never through a shell), so the caption can be timed to the
  // real length of the audio. Resolves { pcm, rate } or null.
  function espeakPcm(text) {
    return new Promise((resolve) => {
      let proc;
      try { proc = spawnFn('espeak-ng', ['-v', 'en-gb', '-s', '165', '--stdout', text], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { status.voice = 'Pi voice failed: ' + e.message; resolve(null); return; }
      const out = []; let err = '';
      if (proc.stdout) proc.stdout.on('data', (d) => out.push(d));
      if (proc.stderr) proc.stderr.on('data', (d) => { err += d; });
      proc.on('error', (e) => { status.voice = /ENOENT/.test(e.message) ? 'Install the Pi voice with: sudo apt install espeak-ng' : 'Pi voice failed: ' + e.message; resolve(null); });
      proc.on('close', (code) => {
        const w = Buffer.concat(out), d = w.indexOf('data');
        if (code !== 0 || d < 0 || w.length < 44) { if (!status.voice) status.voice = 'Pi voice: ' + (err.trim().split('\n').pop() || 'exit ' + code); resolve(null); return; }
        resolve({ pcm: w.subarray(d + 8), rate: w.readUInt32LE(24) || 22050 });
      });
    });
  }

  // Plays raw 16-bit mono PCM through paplay (the Pi speaker / Bluetooth).
  function playPcm(pcm, rate) {
    if (voiceProc) { try { voiceProc.kill(); } catch (e) { /* gone */ } voiceProc = null; }
    let proc;
    try {
      const { findPulseEnv } = require('./pulseEnv');
      const pulse = findPulseEnv(), env = pulse.env ? { ...process.env, ...pulse.env } : process.env;
      const args = ['--raw', '--rate=' + rate, '--channels=1', '--format=s16le', require('./masterVolume').paplayArg()];
      if (pulse.env) args.unshift('--server=' + pulse.env.PULSE_SERVER);
      proc = spawnFn('paplay', args, { stdio: ['pipe', 'ignore', 'pipe'], env });
    } catch (e) { status.voice = 'Pi voice failed: ' + e.message; return; }
    voiceProc = proc;
    proc.on('error', (e) => { if (proc === voiceProc) { voiceProc = null; status.voice = 'Pi voice failed: ' + e.message; } });
    proc.on('exit', () => { if (proc === voiceProc) voiceProc = null; });
    if (proc.stdin) { proc.stdin.on('error', () => {}); proc.stdin.end(pcm); }
  }

  // A real laugh to hear, in the same voice (cached - it's the same every time).
  const laughCache = new Map();
  async function laughPcm(vname, gemini) {
    const key = (gemini ? 'g:' : 'e:') + vname;
    if (laughCache.has(key)) return laughCache.get(key);
    let r = null;
    if (gemini) { try { const pcm = await ai.speech('Hahaha! Ha ha ha!', vname, 'Laugh out loud, warmly and naturally:'); if (pcm && pcm.length > 4800) r = { pcm, rate: 24000 }; } catch (e) { /* no laugh audio */ } }
    else r = await espeakPcm('Ha ha ha ha!');
    if (r) laughCache.set(key, r);
    return r;
  }

  // How long the speaker takes to start sounding (Bluetooth buffers a lot):
  // the caption starts that much after the audio is sent.
  const lagMs = () => Math.max(250, Math.min(2000, Number(speakerLagMs()) || 0) + 100);

  // Shows the line on the display; the caption and lips follow it at `cps`.
  // laugh: 'after' (its own joke - laughs at the punchline), 'before' (your
  // joke - laughs first, then speaks) or 'none'. The effect animates the
  // laugh between laughAt and laughAt + laughMs.
  function startLine(t, cps = CPS, laugh = 'none', laughMs = LAUGH_MS, lead = 300) {
    ft.thinking = false;
    let at = now() + lead, laughAt = 0;
    if (laugh === 'before') { laughAt = at; at += laughMs + GAP_MS; }
    const dur = (t.length / cps) * 1000;
    if (laugh === 'after') laughAt = at + dur + GAP_MS;
    ft.say = { id: ++id, text: t, at, cps, laughAt, laughMs: laughAt ? laughMs : 0 };
    speakEnds = Math.max(at + dur, laughAt + (laughAt ? laughMs : 0));
    ft.log.push({ who: 'face', text: t }); if (ft.log.length > 20) ft.log.shift();
    broadcast();
  }

  async function say(text, laugh = 'none') {
    const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!t) return;
    const v = voice();
    if (v !== 'pi' && v !== 'both') { startLine(t, CPS, laugh); return; }
    // The Pi speaks: a natural Gemini voice when available, else espeak-ng.
    // The audio is made first, then the caption and lips are timed to it.
    if (!ft.thinking) { ft.thinking = true; broadcast(); }
    const vname = opts().style === 'woman' ? 'Kore' : 'Puck';
    let speech = null, gemini = false;
    try {
      const pcm = ai.speech ? await ai.speech(t, vname) : null;
      if (pcm && pcm.length > 4800) { speech = { pcm, rate: 24000 }; gemini = true; status.voice = ''; }
    } catch (e) { status.voice = e.message.slice(0, 160) + ' - using the basic voice'; }
    if (!speech) speech = await espeakPcm(t);
    const lg = laugh !== 'none' && speech ? await laughPcm(vname, gemini) : null;
    if (!speech) { startLine(t, CPS, laugh); return; }
    const rate = speech.rate, secs = speech.pcm.length / (rate * 2);
    const lgPcm = lg && lg.rate === rate ? lg.pcm : null;
    const laughMs = lgPcm ? (lgPcm.length / (rate * 2)) * 1000 : LAUGH_MS;
    const gap = Buffer.alloc(Math.round(rate * GAP_MS / 1000) * 2);
    const silence = (ms) => Buffer.alloc(Math.round(rate * ms / 1000) * 2);
    const parts = laugh === 'before' ? [lgPcm || silence(laughMs), gap, speech.pcm] : laugh === 'after' ? [speech.pcm, gap, lgPcm || silence(0)] : [speech.pcm];
    startLine(t, Math.max(4, Math.min(30, t.length / secs)), laugh, laughMs, lagMs());
    playPcm(Buffer.concat(parts), rate);
  }

  // The phone speaking the line reports how far it has got (word by word),
  // and the caption follows it - phone voices all talk at different speeds.
  function progress(lineId, charIndex) {
    const sy = ft.say;
    if (!sy || sy.id !== lineId || voice() !== 'phone') return;
    const c = Math.max(0, Math.min(sy.text.length, Number(charIndex) || 0));
    if (now() < sy.at) return; // still laughing first
    const want = now() - (c / sy.cps) * 1000;
    if (Math.abs(want - sy.at) < 120) return;
    sy.at = want;
    speakEnds = Math.max(speakEnds, sy.at + (sy.text.length / sy.cps) * 1000);
    broadcast();
  }

  async function chat(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!t) return;
    ft.log.push({ who: 'you', text: t }); if (ft.log.length > 20) ft.log.shift();
    ft.thinking = true; broadcast();
    let reply = '', laugh = FUNNY.test(t) ? 'before' : 'none';
    try {
      const r = await ai.chat(ft.log.slice(0, -1), t);
      if (r.off) {
        // No AI: asked for a joke, tell one; otherwise a friendly pointer.
        if (/\bjoke\b/i.test(t)) { reply = pickJoke(); laugh = 'after'; }
        else reply = 'I\'d love to chat properly. Turn on the AI assistant in Setup, and I can answer you. Meanwhile, here\'s something: ' + pickTopic();
      } else { reply = r.say; if (r.laugh && r.laugh !== 'none') laugh = r.laugh; }
    } catch (e) { reply = 'Sorry, I lost my train of thought there. ' + e.message.slice(0, 80); }
    say(reply || 'Hmm, I\'m not sure what to say to that.', laugh); // keeps the thinking look while natural speech is fetched
  }

  // Busy talking or thinking: the microphone ignores the room meanwhile.
  function busy() { return ft.thinking || now() < speakEnds + 800; }

  // Something said through the Pi's microphone (src/mic.js), as a WAV.
  let offHintAt = -Infinity;
  async function hear(audio) {
    if (busy()) return;
    ft.thinking = true; broadcast();
    let r;
    try { r = await ai.hear(ft.log, audio); } catch (e) { ft.thinking = false; status.voice = 'Listening: ' + e.message.slice(0, 160); broadcast(); return; }
    if (r.off) {
      ft.thinking = false;
      if (now() - offHintAt > 5 * 60000) { offHintAt = now(); say('I can hear you, but I need the AI assistant to understand. Turn it on in Setup.'); } else broadcast();
      return;
    }
    if (!r.heard) { ft.thinking = false; broadcast(); return; } // noise, not speech
    ft.log.push({ who: 'you', text: r.heard }); if (ft.log.length > 20) ft.log.shift();
    let laugh = r.laugh && r.laugh !== 'none' ? r.laugh : FUNNY.test(r.heard) ? 'before' : 'none';
    let reply = r.say;
    if (!reply && /\bjoke\b/i.test(r.heard)) { reply = pickJoke(); laugh = 'after'; }
    say(reply || 'Sorry, could you say that again?', laugh);
  }

  let lastJoke = -1;
  function pickJoke() {
    let i; do { i = Math.floor(Math.random() * JOKES.length); } while (i === lastJoke && JOKES.length > 1);
    lastJoke = i; return JOKES[i];
  }

  function pickTopic() {
    let i; do { i = Math.floor(Math.random() * TOPICS.length); } while (i === lastTopic && TOPICS.length > 1);
    lastTopic = i; return TOPICS[i];
  }

  // A topic of its own: from the AI if set up, otherwise the built-in list.
  async function topic() {
    if (ft.thinking) return;
    let line = '', laugh = 'none';
    try { const r = await ai.chat(ft.log, '(Start a conversation: say something interesting, or tell a joke.)'); if (!r.off) { line = r.say; laugh = r.laugh || 'none'; } } catch (e) { /* fall back */ }
    if (!line) {
      const roll = Math.random();
      if (roll < 0.25) { line = pickJoke(); laugh = 'after'; } else line = roll < 0.4 ? timeGreeting(state.prefs && state.prefs.tz) : pickTopic();
    }
    say(line, laugh);
  }

  // Every 5 s: chat by itself while on screen and quiet for `chatty` seconds.
  function tick() {
    if (state.effect !== 'talking_face' || state.blank || ft.thinking) return;
    const gap = Math.max(10, Math.min(600, Number(opts().chatty) || 45)) * 1000;
    if (opts().chatty === 0) return; // 0 = only when spoken to
    if (now() > speakEnds + gap) { speakEnds = now(); topic(); }
  }

  return { say, chat, hear, busy, progress, topic, tick, status };
}

module.exports = { createFaceTalk, TOPICS, JOKES, LAUGH_MS };
