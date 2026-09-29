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
//
// Cube and wall share one fetch and one status - see ./textCard.js.
'use strict';

const { fetchWithTimeout } = require('./net');
const { defineTextCardEffect } = require('./textCard');

module.exports = defineTextCardEffect({
  name: 'joke',
  fetchingText: 'Fetching a joke…',
  loadingWord: 'JOKE',
  async fetchText() {
    let r;
    try { r = await fetchWithTimeout('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json' } }); }
    catch (fe) { throw new Error('Network error — check internet connection'); }
    if (!r.ok) throw new Error('Joke API error ' + r.status);
    const d = await r.json();
    const text = (d.joke || '').trim();
    if (!text) throw new Error('Empty response');
    return text;
  },
});
