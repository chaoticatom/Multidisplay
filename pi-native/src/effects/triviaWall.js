// Wall-mode counterpart to trivia.js ("Trivia & Facts" / Open Trivia DB).
// Same wall-aware word-cascade treatment as jokeWall.js - see its header
// comment for the full reasoning on wcInitWall/wcStepWall/wcDrawToFaceWall.
'use strict';

const { wcInitWall, wcStepWall, wcDrawToFaceWall, wcTagQA, wcDecodeEntities } = require('./_shared');

let triviaText = '';
let triviaFetching = false;
let triviaError = '';
let t = 0;
let cascade = null;
let cascadeForText = '';
let lastRefreshToken = null;

const status = { text: 'Not fetched yet' };
function getStatus() {
  return { text: status.text, fetching: triviaFetching, error: triviaError || null };
}

function triviaFetch() {
  if (triviaFetching) return;
  triviaFetching = true; triviaError = '';
  status.text = 'Fetching a question…';
  (async () => {
    let r;
    try { r = await fetch('https://opentdb.com/api.php?amount=1&type=multiple'); }
    catch (fe) { triviaError = 'Network error — check internet connection'; throw fe; }
    if (!r.ok) { triviaError = 'Trivia API error ' + r.status; throw new Error(String(r.status)); }
    const d = await r.json();
    const q = (d.results || [])[0];
    if (!q) { triviaError = 'No question returned'; throw new Error('empty'); }
    const question = wcDecodeEntities(q.question || '').trim();
    const answer = wcDecodeEntities(q.correct_answer || '').trim();
    triviaText = (question.endsWith('?') ? question : question + '?') + ' ' + answer;
    status.text = 'Got one!';
  })().catch((err) => {
    status.text = '✕ ' + triviaError;
    if (process.env.TRIVIA_DEBUG) console.error('[triviaWall] fetch error:', err);
  }).finally(() => {
    triviaFetching = false;
  });
}

function tfOpts(core) {
  const o = core.effectOptions?.triviaFacts || {};
  return { autoOn: o.autoOn !== false, holdSecs: Number(o.holdSecs) > 0 ? Number(o.holdSecs) : 5 };
}

function effectTriviaWall(core, dt) {
  const { wallW, wallH } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  t += dt;

  const refreshToken = core.effectOptions?.trivia?.refreshRequestedAt;
  if (refreshToken != null && refreshToken !== lastRefreshToken) {
    lastRefreshToken = refreshToken;
    triviaFetch();
  }
  if (!triviaText && !triviaFetching) triviaFetch();

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  if (!triviaText || triviaError) return; // blank canvas while loading/erroring, same gap jokeWall.js leaves

  if (cascadeForText !== triviaText) {
    cascade = wcInitWall(wcTagQA(triviaText), wallH);
    cascadeForText = triviaText;
  }
  wcStepWall(cascade, dt, wallW);
  wcDrawToFaceWall(core, cascade);

  const { autoOn, holdSecs } = tfOpts(core);
  if (cascade.done && autoOn && cascade.holdTimer > holdSecs && !triviaFetching) triviaFetch();
}

module.exports = effectTriviaWall;
module.exports.getStatus = getStatus;
