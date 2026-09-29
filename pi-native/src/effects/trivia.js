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
//
// Cube and wall share one fetch and one status - see ./textCard.js.
'use strict';

const { wcDecodeEntities } = require('./_shared');
const { fetchWithTimeout } = require('./net');
const { defineTextCardEffect } = require('./textCard');

module.exports = defineTextCardEffect({
  name: 'trivia',
  fetchingText: 'Fetching a question…',
  loadingWord: 'TRIVIA',
  async fetchText() {
    let r;
    try { r = await fetchWithTimeout('https://opentdb.com/api.php?amount=1&type=multiple'); }
    catch (fe) { throw new Error('Network error — check internet connection'); }
    if (!r.ok) throw new Error('Trivia API error ' + r.status);
    const d = await r.json();
    const q = (d.results || [])[0];
    if (!q) throw new Error('No question returned');
    const question = wcDecodeEntities(q.question || '').trim();
    const answer = wcDecodeEntities(q.correct_answer || '').trim();
    return (question.endsWith('?') ? question : question + '?') + ' ' + answer;
  },
});
