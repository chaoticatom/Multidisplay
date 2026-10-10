// Talking Face: a realistic face (faceRender.js) that talks to you. What it
// says comes from the main thread (src/faceTalk.js) as core.faceTalk.say =
// { id, text, at (ms), cps (characters per second) }; the lips follow the
// letters being spoken, and the words show as captions - beside the face on
// a wide wall, scrolling along the bottom on a single panel.
// It moves like a person: blinks (sometimes twice), small eye darts, a slow
// sway and tilt, breathing, now and then a twitch (an eyebrow, a squint, a
// half-smile), it looks up while "thinking" about a reply, and it laughs at
// jokes (its own after the punchline, yours before answering). While quiet
// it does little human things now and then: turns to chat with someone off
// to the side, looks away, glances aside, nods, yawns, or sips a cup of tea.
// Options (core.effectOptions.talking_face): style (man/woman), skin, hair, eyes.
'use strict';

const { renderFace, LOOKS } = require('./faceRender');
const { FONT_5x7, FONT_3x5, drawString } = require('./text');

const rand = (a, b) => a + Math.random() * (b - a);
const st = {
  t: 0, blink: 0, blinkT: null, nextBlink: 2, doubleBlink: false,
  gaze: [0, 0], gazeTo: [0, 0], nextGaze: 1,
  twitch: null, nextTwitch: 6, brow: 0, open: 0, wide: 0, smile: 0.25,
  sayId: null, face: null, faceKey: '',
  action: null, nextAction: 10, // idle touches: look away, sip tea, yawn, nod
};

// Idle touches while it isn't talking: { kind, t, len, side }. The envelope
// eases each in and out.
const ACTIONS = [['look', 3, 3.5], ['aside', 4, 5.5], ['tea', 2, 6], ['yawn', 1, 3], ['nod', 2, 1.4], ['glance', 3, 2]];
function pickAction() {
  let r = Math.random() * ACTIONS.reduce((a, x) => a + x[1], 0);
  for (const [kind, w, len] of ACTIONS) { if ((r -= w) < 0) return { kind, t: 0, len, side: Math.random() < 0.5 ? -1 : 1 }; }
  return null;
}
const ease = (f, a = 0.2) => (f < a ? Math.sin((f / a) * Math.PI / 2) : f > 1 - a ? Math.sin(((1 - f) / a) * Math.PI / 2) : 1);

// How the mouth shapes a letter: open 0..1 and wide (-1 round .. 1 wide).
function viseme(ch) {
  const c = (ch || ' ').toLowerCase();
  if ('ai'.includes(c)) return [0.8, 0.4];
  if ('ou'.includes(c) || c === 'w' || c === 'q') return [0.55, -1];
  if (c === 'e' || c === 'y') return [0.5, 0.7];
  if ('mbp'.includes(c)) return [0, 0];
  if ('fv'.includes(c)) return [0.12, 0.3];
  if (/[a-z0-9]/.test(c)) return [0.32, 0.1];
  return [0.04, 0]; // spaces and punctuation: a short rest
}

// Where speech is now: the letter index, or -1 when not speaking.
function speechIndex(say, now) {
  if (!say || !say.text) return -1;
  const i = Math.floor(((now - say.at) / 1000) * (say.cps || 15));
  return i >= 0 && i < say.text.length ? i : -1;
}

function animate(dt, talk, now) {
  st.t += dt;
  const say = talk && talk.say, idx = speechIndex(say, now), speaking = idx >= 0;
  const thinking = !!(talk && talk.thinking);
  // Blinks: every 2-6 s, about 150 ms, sometimes a second one just after.
  // blinkT: null idle, < 0 waiting to start, 0..0.15 blinking.
  st.nextBlink -= dt;
  if (st.nextBlink <= 0 && st.blinkT === null) { st.blinkT = 0; st.doubleBlink = Math.random() < 0.15; st.nextBlink = rand(2, 6); }
  st.blink = 0;
  if (st.blinkT !== null) {
    st.blinkT += dt;
    if (st.blinkT >= 0 && st.blinkT < 0.15) st.blink = Math.sin((st.blinkT / 0.15) * Math.PI);
    else if (st.blinkT >= 0.15) { if (st.doubleBlink) { st.doubleBlink = false; st.blinkT = -0.12; } else st.blinkT = null; }
  }
  // Eye darts; looking up and to the side while thinking.
  st.nextGaze -= dt;
  if (st.nextGaze <= 0) { st.gazeTo = thinking ? [rand(-0.9, -0.4), -0.9] : [rand(-0.6, 0.6), rand(-0.4, 0.4)]; st.nextGaze = thinking ? rand(1, 2) : rand(0.6, 2.5); }
  const gk = 1 - Math.exp(-dt * 25);
  st.gaze[0] += (st.gazeTo[0] - st.gaze[0]) * gk; st.gaze[1] += (st.gazeTo[1] - st.gaze[1]) * gk;
  // Twitches: an eyebrow flash, a squint or a half-smile every 6-15 s.
  st.nextTwitch -= dt;
  if (st.nextTwitch <= 0) { st.twitch = { kind: ['brow', 'squint', 'smile'][Math.floor(Math.random() * 3)], t: 0 }; st.nextTwitch = rand(6, 15); }
  let tw = { brow: 0, squint: 0, smile: 0 };
  if (st.twitch) { st.twitch.t += dt; const k = Math.sin(Math.min(1, st.twitch.t / 0.45) * Math.PI); tw[st.twitch.kind] = 0.5 * k; if (st.twitch.t > 0.45) st.twitch = null; }
  // Mouth: follows the letter being spoken, eased so it moves like lips.
  const [vo, vw] = speaking ? viseme(say.text[idx]) : [0, 0];
  const mk = 1 - Math.exp(-dt * 28);
  st.open += (vo - st.open) * mk; st.wide += (vw - st.wide) * mk;
  // Eyebrows lift on a question and while thinking.
  const q = speaking && /\?/.test(say.text.slice(idx, idx + 12)) ? 0.5 : 0;
  st.brow += ((thinking ? 0.45 : q) - st.brow) * (1 - Math.exp(-dt * 6));
  st.smile += ((speaking ? 0.15 : 0.3) - st.smile) * (1 - Math.exp(-dt * 2));
  // Laughing (faceTalk sets laughAt/laughMs): a broad smile, the mouth going
  // "ha-ha" about 4.5 times a second, squinting, brows up, the head tipping
  // back and shaking a little. Eases in and out.
  let lk = 0, ha = 0;
  if (say && say.laughMs && now >= say.laughAt && now < say.laughAt + say.laughMs) {
    const f = (now - say.laughAt) / say.laughMs;
    lk = Math.sin(Math.min(1, f * 1.4) * Math.PI / 2) * (f > 0.75 ? (1 - f) / 0.25 : 1);
    ha = Math.max(0, Math.sin((now - say.laughAt) / 1000 * Math.PI * 2 * 4.5));
  }
  // Idle touches: only while quiet; talking, thinking or laughing ends one.
  if (speaking || thinking || lk > 0) { if (st.action && st.action.kind === 'tea' && st.action.t < st.action.len * 0.85) st.action.t = st.action.len * 0.85; if (st.action && st.action.kind !== 'tea') st.action = null; st.nextAction = Math.max(st.nextAction, 4); }
  else if (!st.action) { st.nextAction -= dt; if (st.nextAction <= 0) { st.action = pickAction(); st.nextAction = rand(9, 22); } }
  const act = { yaw: 0, tilt: 0, bob: 0, gazeX: null, gazeY: null, open: 0, wide: 0, squint: 0, brow: 0, smile: 0, mug: 0, blink: 0 };
  if (st.action) {
    const a = st.action; a.t += dt;
    const f = Math.min(1, a.t / a.len);
    if (a.kind === 'look') { const e = ease(f, 0.22); act.yaw = 0.32 * a.side * e; act.gazeX = 0.9 * a.side * e; act.tilt = 0.03 * a.side * e; }
    else if (a.kind === 'glance') { const e = ease(f, 0.15); act.gazeX = 0.85 * a.side * e; act.gazeY = 0.25 * e; act.brow = 0.15 * e; }
    else if (a.kind === 'aside') {
      // Turns to someone off to the side and says a few words to them: the
      // lips chatter in bursts with little pauses, a nod and a smile, then
      // turns back.
      const e = ease(f, 0.18), talkOn = f > 0.2 && f < 0.8;
      act.yaw = 0.45 * a.side * e; act.gazeX = 0.95 * a.side * e; act.tilt = 0.035 * a.side * e;
      if (talkOn) {
        const burst = Math.sin(a.t * 2.3) > -0.3; // short pauses between phrases
        if (burst && (a.nextMouth = (a.nextMouth || 0) - dt) <= 0) { a.mouth = [rand(0.05, 0.6), rand(-0.8, 0.7)]; a.nextMouth = rand(0.07, 0.14); }
        if (!burst) a.mouth = [0, 0];
        act.open = (a.mouth || [0])[0] * e; act.wide = (a.mouth || [0, 0])[1] * e;
        act.bob = 0.012 * Math.sin(a.t * 5.5) * e; act.brow = 0.15 * Math.max(0, Math.sin(a.t * 1.7)) * e;
      }
      act.smile = 0.2 * e;
    }
    else if (a.kind === 'nod') act.bob = 0.035 * Math.sin(f * Math.PI * 3) * (1 - f);
    else if (a.kind === 'yawn') { const e = Math.sin(f * Math.PI); act.open = e; act.wide = -0.4 * e; act.squint = 0.9 * e; act.brow = 0.35 * e; act.tilt = -0.06 * e; act.bob = -0.02 * e; }
    else if (a.kind === 'tea') {
      // Raise (0-0.3), sip with eyes half closed (0.3-0.7), lower (0.7-1).
      act.mug = f < 0.3 ? f / 0.3 : f < 0.7 ? 1 : (1 - f) / 0.3;
      const sip = f > 0.33 && f < 0.68 ? Math.sin(((f - 0.33) / 0.35) * Math.PI) : 0;
      act.tilt = -0.07 * sip; act.bob = -0.02 * sip; act.blink = 0.55 * sip; act.gazeY = 0.3 * act.mug;
      if (f > 0.72) act.smile = 0.25 * Math.sin(((f - 0.72) / 0.28) * Math.PI); // "ahh"
    }
    if (a.t >= a.len) st.action = null;
  }
  const t = st.t;
  if (lk > 0) {
    return {
      yaw: 0.02 * Math.sin(t * 0.37) + 0.02 * lk * Math.sin(t * 7),
      tilt: -0.07 * lk + 0.02 * Math.sin(t * 0.29 + 2),
      bob: -0.03 * lk + 0.012 * lk * ha,
      blink: 0, gazeX: st.gaze[0] * (1 - lk), gazeY: st.gaze[1] * (1 - lk) - 0.3 * lk,
      brow: 0.4 * lk, mouthOpen: lk * (0.45 + 0.55 * ha), mouthWide: lk, smile: 0.3 + 0.7 * lk, squint: 0.75 * lk,
      mug: act.mug, t,
    };
  }
  return {
    yaw: 0.03 * Math.sin(t * 0.37) + 0.015 * Math.sin(t * 1.13 + 1) + (speaking ? 0.012 * Math.sin(t * 2.7) : 0) + act.yaw,
    tilt: 0.025 * Math.sin(t * 0.29 + 2) + (speaking ? 0.01 * Math.sin(t * 2.1) : 0) + act.tilt,
    bob: 0.012 * Math.sin(t * 1.5) + (speaking ? 0.006 * Math.sin(t * 5.3) : 0) + act.bob, // breathing, and a nod while talking
    blink: Math.max(st.blink, act.blink), gazeX: act.gazeX !== null ? act.gazeX : st.gaze[0], gazeY: act.gazeY !== null ? act.gazeY : st.gaze[1],
    brow: st.brow + tw.brow + act.brow, mouthOpen: Math.max(st.open, act.open), mouthWide: st.wide + act.wide, smile: st.smile + tw.smile + act.smile, squint: Math.max(tw.squint, act.squint),
    mug: act.mug, t,
  };
}

function lookFrom(opts) {
  return {
    style: opts.style === 'woman' ? 'woman' : 'man',
    skin: LOOKS.skin[opts.skin] || LOOKS.skin.light,
    hair: LOOKS.hair[opts.hair] || (opts.style === 'woman' ? LOOKS.hair.blonde : LOOKS.hair.brown),
    iris: LOOKS.iris[opts.eyes] || LOOKS.iris.blue,
    shirt: opts.style === 'woman' ? [0.42, 0.04, 0.08] : [0.16, 0.24, 0.42], bg: [0.11, 0.09, 0.08],
  };
}

// Greedy word wrap.
function wrap(text, max) {
  const lines = []; let line = '', start = 0, lineStart = 0;
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > max) { lines.push({ text: line, start: lineStart }); line = word; lineStart = start; }
    else { if (!line) lineStart = start; line = line ? line + ' ' + word : word; }
    start += word.length + 1;
  }
  if (line) lines.push({ text: line, start: lineStart });
  return lines;
}

function captionsBeside(core, x0, W, H, say, idx, thinking) {
  const plot = (k) => (x, y) => core.setWallPixel(x, y, k, k, k * 0.95);
  if (thinking) { const dots = '.'.repeat(1 + (Math.floor(st.t * 3) % 3)); drawString(FONT_5x7, dots, x0, Math.floor(H / 2) - 4, plot(0.8)); return; }
  if (!say || !say.text) return;
  const cols = Math.max(4, Math.floor((W - x0 - 2) / FONT_5x7.adv)), lines = wrap(say.text.toUpperCase(), cols);
  const per = Math.max(1, Math.floor((H - 2) / 9)), spokenTo = idx < 0 ? say.text.length : idx;
  let cur = lines.findIndex((l, i) => i === lines.length - 1 || lines[i + 1].start > spokenTo);
  if (cur < 0) cur = lines.length - 1;
  const first = Math.max(0, Math.min(cur - per + 2, lines.length - per));
  const top = Math.max(1, Math.floor((H - Math.min(per, lines.length) * 9) / 2));
  lines.slice(first, first + per).forEach((l, i) => {
    const y = top + i * 9;
    // Spoken words bright, the rest dim.
    let x = x0;
    for (let c = 0; c < l.text.length; c++) {
      const spoken = l.start + c <= spokenTo;
      x += drawString(FONT_5x7, l.text[c], x, y, plot(spoken ? 0.95 : 0.3)) - x;
    }
  });
}

function captionBelow(core, W, H, say, idx, thinking) {
  for (let y = H - 9; y < H; y++) for (let x = 0; x < W; x++) core.setWallPixel(x, y, 0.02, 0.02, 0.03);
  const plot = (x, y) => core.setWallPixel(x, y, 0.95, 0.95, 0.9);
  if (thinking) { drawString(FONT_3x5, 'THINKING' + '.'.repeat(1 + (Math.floor(st.t * 3) % 3)), 2, H - 7, plot); return; }
  if (!say || !say.text || idx < 0) return;
  // The text slides along so the word being said stays in view.
  const text = say.text.toUpperCase(), shown = Math.max(0, idx * FONT_5x7.adv - Math.floor(W * 0.6));
  drawString(FONT_5x7, text, -shown + 2, H - 8, plot);
}

function wall(core, dt) {
  if (!core.wallW) return;
  const W = core.wallW, H = core.wallH, now = Date.now(), talk = core.faceTalk || {};
  const opts = (core.effectOptions && core.effectOptions.talking_face) || {};
  const pose = animate(dt, talk, now), look = lookFrom(opts);
  const wide = W >= H * 2.2, F = wide ? H : Math.min(W, H), fx = wide ? Math.round(W * 0.04) : Math.floor((W - F) / 2);
  // The face is redrawn every third frame (~20 a second - it moves slowly,
  // and the detailed shading is the heaviest part); frames between reuse it.
  if (!st.face || st.face.length !== F * F * 3) { st.face = new Float32Array(F * F * 3); st.frame = 0; }
  if ((st.frame = (st.frame || 0) + 1) % 3 === 1) renderFace(st.face, F, F, pose, look);
  for (let i = 0; i < core.wallBuf.length; i += 3) { core.wallBuf[i] = look.bg[0] * 0.6; core.wallBuf[i + 1] = look.bg[1] * 0.6; core.wallBuf[i + 2] = look.bg[2] * 0.6; }
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) { const o = (y * F + x) * 3; core.setWallPixel(fx + x, y, st.face[o], st.face[o + 1], st.face[o + 2]); }
  const idx = speechIndex(talk.say, now);
  if (wide) captionsBeside(core, fx + F + 6, W, H, talk.say, idx, talk.thinking);
  else captionBelow(core, W, H, talk.say, idx, talk.thinking);
}

function cube(core, dt) {
  const S = core.SIZE, now = Date.now(), talk = core.faceTalk || {};
  const pose = animate(dt, talk, now), look = lookFrom((core.effectOptions && core.effectOptions.talking_face) || {});
  if (!st.face || st.face.length !== S * S * 3) st.face = new Float32Array(S * S * 3);
  renderFace(st.face, S, S, pose, look);
  for (let i = 0; i < core.colBuf.length; i++) core.colBuf[i] = 0;
  // The face on each side face; face rows run bottom-up (see text.js).
  for (let f = 0; f < 4; f++) for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    const o = ((S - 1 - v) * S + u) * 3; core.setFaceLED(f, u, v, st.face[o], st.face[o + 1], st.face[o + 2]);
  }
}

cube.wall = wall;
cube._test = { viseme, speechIndex, wrap, st };
module.exports = cube;
