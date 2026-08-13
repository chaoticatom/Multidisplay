// Ported from effects-livedata.js's Jokes section (~line 4144-4204):
// jokeText/jokeFetch/effectJoke. Fetches a random dad joke from
// icanhazdadjoke.com (free, no key, just needs an Accept: application/json
// header) and reveals it via the shared word-cascade engine (_shared.js's
// wcInit/wcStep/wcDrawToFace/wcTagQA, ported from effects-core.js).
//
// tfAutoOn/tfHoldSecs are genuinely shared state between Jokes and Trivia
// (one "Auto-advance" checkbox + "Next after" slider drives both - see
// CLAUDE.md's Submenu/shared-controls pattern and index.html's shared
// .art-shared-panel above the Jokes/On This Day/Trivia buttons). Rather
// than a new file-scoped global pair duplicated in trivia.js, both effects
// read/write core.effectOptions.triviaFacts.{autoOn,holdSecs} - the same
// "shared pseudo-key in the generic effectOptions store" shape the task
// brief suggested, consistent with how every other option panel here
// already persists through setEffectOption.
'use strict';

const { wcInit, wcStep, wcDrawToFace, wcTagQA, drawLinesCentered3x5 } = require('./_shared');

let jokeText = '';
let jokeFetching = false;
let jokeError = '';
let t = 0;
let cascade = null;
let cascadeForText = '';
let lastRefreshToken = null;

const status = { text: 'Not fetched yet' };
function getStatus() {
  return { text: status.text, fetching: jokeFetching, error: jokeError || null };
}

function jokeFetch() {
  if (jokeFetching) return;
  jokeFetching = true; jokeError = '';
  status.text = 'Fetching a joke…';
  (async () => {
    let r;
    try { r = await fetch('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json' } }); }
    catch (fe) { jokeError = 'Network error — check internet connection'; throw fe; }
    if (!r.ok) { jokeError = 'Joke API error ' + r.status; throw new Error(String(r.status)); }
    const d = await r.json();
    const text = (d.joke || '').trim();
    if (!text) { jokeError = 'Empty response'; throw new Error('empty'); }
    jokeText = text;
    status.text = 'Got one!';
  })().catch((err) => {
    status.text = '✕ ' + jokeError;
    if (process.env.JOKE_DEBUG) console.error('[joke] fetch error:', err);
  }).finally(() => {
    jokeFetching = false;
  });
}

function tfOpts(core) {
  const o = core.effectOptions?.triviaFacts || {};
  return { autoOn: o.autoOn !== false, holdSecs: Number(o.holdSecs) > 0 ? Number(o.holdSecs) : 5 };
}

function effectJoke(core, dt) {
  t += dt;

  const refreshToken = core.effectOptions?.joke?.refreshRequestedAt;
  if (refreshToken != null && refreshToken !== lastRefreshToken) {
    lastRefreshToken = refreshToken;
    jokeFetch();
  }
  if (!jokeText && !jokeFetching) jokeFetch();

  const { N } = core;
  for (let i = 0; i < N; i++) core.setLED(i, 0, 0, 0);

  const is2D = core.panelMode === '2d';
  const faces = is2D ? [0] : [0, 1, 2, 3, 4, 5];

  if (!jokeText) {
    const dots = '.'.repeat(1 + (Math.floor(t) % 3));
    for (const f of faces) drawLinesCentered3x5(core, f, ['LOADING', 'JOKE' + dots], 2, 0.9, 0.75, 0.2);
    return;
  }
  if (jokeError) {
    for (const f of faces) drawLinesCentered3x5(core, f, ['API', 'ERROR'], 2, 1, 0.25, 0.25);
    return;
  }

  if (cascadeForText !== jokeText) {
    cascade = wcInit(wcTagQA(jokeText));
    cascadeForText = jokeText;
  }
  wcStep(cascade, dt);
  const targetFace = is2D ? 0 : 1;
  wcDrawToFace(core, cascade, targetFace);

  const { autoOn, holdSecs } = tfOpts(core);
  if (cascade.done && autoOn && cascade.holdTimer > holdSecs && !jokeFetching) jokeFetch();
}

module.exports = effectJoke;
module.exports.getStatus = getStatus;
