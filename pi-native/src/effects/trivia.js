// Ported from effects-livedata.js's Trivia section (~line 4206-4274):
// triviaText/triviaFetch/effectTrivia. Fetches one multiple-choice question
// from Open Trivia DB (opentdb.com, free, no key) and reveals
// "question? answer" via the shared word-cascade engine, same as Jokes.
//
// OpenTDB returns HTML-escaped text by default - the browser decoded it
// with a throwaway <textarea>.innerHTML trick; here _shared.js's
// wcDecodeEntities() does the same job without a DOM (numeric entities
// generically, named entities via a lookup table of what OpenTDB actually
// emits - see _shared.js's comment).
//
// tfAutoOn/tfHoldSecs shared state: see joke.js's comment - both effects
// read/write core.effectOptions.triviaFacts.{autoOn,holdSecs}.
'use strict';

const { wcInit, wcStep, wcDrawToFace, wcTagQA, wcDecodeEntities, drawLinesCentered3x5 } = require('./_shared');

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
    if (process.env.TRIVIA_DEBUG) console.error('[trivia] fetch error:', err);
  }).finally(() => {
    triviaFetching = false;
  });
}

function tfOpts(core) {
  const o = core.effectOptions?.triviaFacts || {};
  return { autoOn: o.autoOn !== false, holdSecs: Number(o.holdSecs) > 0 ? Number(o.holdSecs) : 5 };
}

function effectTrivia(core, dt) {
  t += dt;

  const refreshToken = core.effectOptions?.trivia?.refreshRequestedAt;
  if (refreshToken != null && refreshToken !== lastRefreshToken) {
    lastRefreshToken = refreshToken;
    triviaFetch();
  }
  if (!triviaText && !triviaFetching) triviaFetch();

  const { N } = core;
  for (let i = 0; i < N; i++) core.setLED(i, 0, 0, 0);

  const is2D = core.panelMode === '2d';
  const faces = is2D ? [0] : [0, 1, 2, 3, 4, 5];

  if (!triviaText) {
    const dots = '.'.repeat(1 + (Math.floor(t) % 3));
    for (const f of faces) drawLinesCentered3x5(core, f, ['LOADING', 'TRIVIA' + dots], 2, 0.9, 0.75, 0.2);
    return;
  }
  if (triviaError) {
    for (const f of faces) drawLinesCentered3x5(core, f, ['API', 'ERROR'], 2, 1, 0.25, 0.25);
    return;
  }

  if (cascadeForText !== triviaText) {
    cascade = wcInit(wcTagQA(triviaText));
    cascadeForText = triviaText;
  }
  wcStep(cascade, dt);
  const targetFace = is2D ? 0 : 1;
  wcDrawToFace(core, cascade, targetFace);

  const { autoOn, holdSecs } = tfOpts(core);
  if (cascade.done && autoOn && cascade.holdTimer > holdSecs && !triviaFetching) triviaFetch();
}

module.exports = effectTrivia;
module.exports.getStatus = getStatus;
