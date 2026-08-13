// Wall-mode counterpart to joke.js ("Dad Jokes"). Fetch logic reused
// verbatim in this file's own module scope (own siloed state, same
// "don't collide across registries" reasoning as camWall.js). The reveal
// itself uses the wall-aware word-cascade siblings added to _shared.js
// (wcInitWall/wcStepWall/wcDrawToFaceWall) - wcInit/wcStep hardcode
// maxLines/maxW off a fixed 64 (the cube face's SIZE), which isn't a
// parameter the existing helpers already took, so this is a real sibling,
// not a call-with-different-args reuse (see _shared.js's comment on those).
// Word-wrap now spans the FULL wallW so a wide wall shows longer lines
// instead of wrapping at a hardcoded 64px column.
'use strict';

const { wcInitWall, wcStepWall, wcDrawToFaceWall, wcTagQA } = require('./_shared');

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
    if (process.env.JOKE_DEBUG) console.error('[jokeWall] fetch error:', err);
  }).finally(() => {
    jokeFetching = false;
  });
}

function tfOpts(core) {
  const o = core.effectOptions?.triviaFacts || {};
  return { autoOn: o.autoOn !== false, holdSecs: Number(o.holdSecs) > 0 ? Number(o.holdSecs) : 5 };
}

function effectJokeWall(core, dt) {
  const { wallW, wallH } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  t += dt;

  const refreshToken = core.effectOptions?.joke?.refreshRequestedAt;
  if (refreshToken != null && refreshToken !== lastRefreshToken) {
    lastRefreshToken = refreshToken;
    jokeFetch();
  }
  if (!jokeText && !jokeFetching) jokeFetch();

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  if (!jokeText || jokeError) return; // blank canvas while loading/erroring - no placeholder-text drawer wired up for wall mode yet, same gap camWall.js leaves for its idle state

  if (cascadeForText !== jokeText) {
    cascade = wcInitWall(wcTagQA(jokeText), wallH);
    cascadeForText = jokeText;
  }
  wcStepWall(cascade, dt, wallW);
  wcDrawToFaceWall(core, cascade);

  const { autoOn, holdSecs } = tfOpts(core);
  if (cascade.done && autoOn && cascade.holdTimer > holdSecs && !jokeFetching) jokeFetch();
}

module.exports = effectJokeWall;
module.exports.getStatus = getStatus;
