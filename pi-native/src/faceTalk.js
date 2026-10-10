// What the Talking Face says (effects/talkingFace.js draws it). Runs on the
// main thread and keeps state.faceTalk:
//   say: { id, text, at, cps }  - the current line (the render worker reads it)
//   thinking: true while waiting for an AI reply
//   log: [{ who: 'you'|'face', text }]  - the conversation, for the phone
// say(text) speaks a line; chat(text) answers it (AI assistant if set up, a
// friendly fallback if not); tick() (every 5 s) starts a topic by itself
// when the face is on screen and has been quiet for a while.
// Voice (effect option `voice`): 'phone' (the page speaks it), 'pi' (espeak-ng
// to the Pi's speaker), 'both' or 'off'.
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

function createFaceTalk({ state, broadcast, ai = require('./ai'), spawnFn = spawn, now = Date.now } = {}) {
  const ft = state.faceTalk || (state.faceTalk = { say: null, thinking: false, log: [] });
  let speakEnds = 0, lastTopic = -1, voiceProc = null;
  const status = { voice: '' };

  const opts = () => (state.effectOptions && state.effectOptions.talking_face) || {};
  const voice = () => opts().voice || 'phone';

  // The Pi's own voice: espeak-ng piped into paplay (the Pi speaker / Bluetooth).
  function piSpeak(text) {
    if (voiceProc) { try { voiceProc.kill(); } catch (e) { /* gone */ } voiceProc = null; }
    let proc;
    try {
      const { findPulseEnv } = require('./pulseEnv');
      const pulse = findPulseEnv(), env = pulse.env ? { ...process.env, ...pulse.env } : process.env;
      const play = pulse.env ? `paplay --server=${pulse.env.PULSE_SERVER}` : 'paplay';
      proc = spawnFn('sh', ['-c', `espeak-ng -v en-gb -s 165 --stdout "$1" | ${play}`, 'speak', text], { stdio: ['ignore', 'ignore', 'pipe'], env });
    } catch (e) { status.voice = 'Pi voice failed: ' + e.message; return; }
    voiceProc = proc;
    let err = '';
    if (proc.stderr) proc.stderr.on('data', (d) => { err += d; });
    proc.on('exit', (code) => {
      if (proc !== voiceProc) return; // replaced by a newer line
      voiceProc = null;
      status.voice = code === 0 ? '' : /not found|No such file/i.test(err) ? 'Install the Pi voice with: sudo apt install espeak-ng' : 'Pi voice: ' + (err.trim().split('\n').pop() || 'exit ' + code);
    });
    proc.on('error', (e) => { if (proc === voiceProc) { voiceProc = null; status.voice = 'Pi voice failed: ' + e.message; } });
  }

  // Natural speech (Gemini text-to-speech, when Gemini is the AI provider):
  // raw 24 kHz mono PCM straight into paplay.
  function playPcm(pcm) {
    if (voiceProc) { try { voiceProc.kill(); } catch (e) { /* gone */ } voiceProc = null; }
    let proc;
    try {
      const { findPulseEnv } = require('./pulseEnv');
      const pulse = findPulseEnv(), env = pulse.env ? { ...process.env, ...pulse.env } : process.env;
      const args = ['--raw', '--rate=24000', '--channels=1', '--format=s16le'];
      if (pulse.env) args.unshift('--server=' + pulse.env.PULSE_SERVER);
      proc = spawnFn('paplay', args, { stdio: ['pipe', 'ignore', 'pipe'], env });
    } catch (e) { status.voice = 'Pi voice failed: ' + e.message; return; }
    voiceProc = proc;
    proc.on('error', (e) => { if (proc === voiceProc) { voiceProc = null; status.voice = 'Pi voice failed: ' + e.message; } });
    proc.on('exit', () => { if (proc === voiceProc) voiceProc = null; });
    if (proc.stdin) { proc.stdin.on('error', () => {}); proc.stdin.end(pcm); }
  }

  // Shows the line on the display; the lips follow it at `cps`.
  // laugh: 'after' (its own joke - laughs at the punchline), 'before' (your
  // joke - laughs first, then speaks) or 'none'. The effect animates the
  // laugh between laughAt and laughAt + laughMs.
  function startLine(t, cps = CPS, laugh = 'none') {
    ft.thinking = false;
    let at = now() + 300, laughAt = 0;
    if (laugh === 'before') { laughAt = at; at += LAUGH_MS; }
    const dur = (t.length / cps) * 1000;
    if (laugh === 'after') laughAt = at + dur + 150;
    ft.say = { id: ++id, text: t, at, cps, laughAt, laughMs: laughAt ? LAUGH_MS : 0 };
    speakEnds = Math.max(at + dur, laughAt + (laughAt ? LAUGH_MS : 0));
    ft.log.push({ who: 'face', text: t }); if (ft.log.length > 20) ft.log.shift();
    broadcast();
  }

  async function say(text, laugh = 'none') {
    const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!t) return;
    const v = voice();
    if (v === 'pi' || v === 'both') {
      // A natural Gemini voice when available: fetched first, then the lips
      // are timed to the real length of the audio.
      try {
        if (!ft.thinking) { ft.thinking = true; broadcast(); }
        const pcm = ai.speech ? await ai.speech(t, opts().style === 'woman' ? 'Kore' : 'Puck') : null;
        ft.thinking = false;
        if (pcm && pcm.length > 4800) {
          const secs = pcm.length / 48000;
          startLine(t, Math.max(5, Math.min(30, t.length / secs)), laugh);
          if (laugh === 'before') setTimeout(() => playPcm(pcm), LAUGH_MS).unref(); else playPcm(pcm);
          status.voice = '';
          return;
        }
      } catch (e) { ft.thinking = false; status.voice = e.message.slice(0, 160) + ' - using the basic voice'; }
      startLine(t, CPS, laugh);
      if (laugh === 'before') setTimeout(() => piSpeak(t), LAUGH_MS).unref(); else piSpeak(t);
      return;
    }
    startLine(t, CPS, laugh);
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

  return { say, chat, topic, tick, status };
}

module.exports = { createFaceTalk, TOPICS, JOKES, LAUGH_MS };
