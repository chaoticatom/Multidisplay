// "Fetched text card" effects (Jokes, Trivia): fetch a line of text from a
// free API, show LOADING / API ERROR while waiting, then reveal it word by
// word with the shared word-cascade engine and fetch the next one after a
// hold (the shared Auto-advance setting). Cube and wall modes share ONE
// fetch and one status - they used to be separate files with separate
// state, so each mode fetched on its own, and the wall version showed a
// blank canvas while loading or on an error.
//
// defineTextCardEffect({ name, fetchingText, loadingWord, fetchText })
//   fetchText() -> Promise<string>; to fail, throw an Error whose message
//   is what the UI should show (e.g. 'Joke API error 503').
// Returns the cube effect with .wall and .getStatus attached.
'use strict';

const { wcInit, wcStep, wcDrawToFace, wcInitWall, wcStepWall, wcDrawToFaceWall, wcTagQA, drawLinesCentered3x5 } = require('./_shared');
const { drawLinesCentered, FONT_3x5, wallPlot } = require('./text');

// Shared Jokes/Trivia/On This Day "Auto-advance" + "Next after" setting.
function tfOpts(core) {
  const o = core.effectOptions?.triviaFacts || {};
  return { autoOn: o.autoOn !== false, holdSecs: Number(o.holdSecs) > 0 ? Number(o.holdSecs) : 5 };
}

function defineTextCardEffect({ name, fetchingText, loadingWord, fetchText }) {
  let text = '', fetching = false, error = '';
  let lastRefreshToken = null;
  const status = { text: 'Not fetched yet' };
  // Per-mode animation state (the cascade's layout differs per mode).
  const modes = { cube: { t: 0, cascade: null, forText: '' }, wall: { t: 0, cascade: null, forText: '' } };

  function doFetch() {
    if (fetching) return;
    fetching = true; error = '';
    status.text = fetchingText;
    fetchText().then((got) => {
      text = got;
      status.text = 'Got one!';
    }).catch((err) => {
      error = err && err.message ? err.message : 'Error';
      status.text = '✕ ' + error;
      if (process.env[name.toUpperCase() + '_DEBUG']) console.error(`[${name}] fetch error:`, err);
    }).finally(() => { fetching = false; });
  }

  // Shared per-frame bookkeeping: refresh button, first fetch.
  function update(core) {
    const refreshToken = core.effectOptions?.[name]?.refreshRequestedAt;
    if (refreshToken != null && refreshToken !== lastRefreshToken) { lastRefreshToken = refreshToken; doFetch(); }
    if (!text && !fetching) doFetch();
  }

  function maybeAdvance(core, cascade) {
    const { autoOn, holdSecs } = tfOpts(core);
    if (cascade.done && autoOn && cascade.holdTimer > holdSecs && !fetching) doFetch();
  }

  function cube(core, dt) {
    const m = modes.cube;
    m.t += dt;
    update(core);
    for (let i = 0; i < core.N; i++) core.setLED(i, 0, 0, 0);
    const is2D = core.panelMode === '2d';
    const faces = is2D ? [0] : [0, 1, 2, 3, 4, 5];
    if (!text) {
      const dots = '.'.repeat(1 + (Math.floor(m.t) % 3));
      for (const f of faces) drawLinesCentered3x5(core, f, ['LOADING', loadingWord + dots], 2, 0.9, 0.75, 0.2);
      return;
    }
    if (error) {
      for (const f of faces) drawLinesCentered3x5(core, f, ['API', 'ERROR'], 2, 1, 0.25, 0.25);
      return;
    }
    if (m.forText !== text) { m.cascade = wcInit(wcTagQA(text)); m.forText = text; }
    wcStep(m.cascade, dt);
    wcDrawToFace(core, m.cascade, is2D ? 0 : 1);
    maybeAdvance(core, m.cascade);
  }

  function wall(core, dt) {
    const { wallW, wallH } = core;
    if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
    const m = modes.wall;
    m.t += dt;
    update(core);
    for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;
    const scale = Math.max(1, Math.min(4, Math.floor(Math.min(wallW / 32, wallH / 16))));
    if (!text) {
      const dots = '.'.repeat(1 + (Math.floor(m.t) % 3));
      drawLinesCentered(FONT_3x5, ['LOADING', loadingWord + dots], wallW, wallH, wallPlot(core, 0.9, 0.75, 0.2), { scale });
      return;
    }
    if (error) {
      drawLinesCentered(FONT_3x5, ['API', 'ERROR'], wallW, wallH, wallPlot(core, 1, 0.25, 0.25), { scale });
      return;
    }
    if (m.forText !== text) { m.cascade = wcInitWall(wcTagQA(text), wallH); m.forText = text; }
    wcStepWall(m.cascade, dt, wallW);
    wcDrawToFaceWall(core, m.cascade);
    maybeAdvance(core, m.cascade);
  }

  cube.wall = wall;
  cube.getStatus = () => ({ text: status.text, fetching, error: error || null });
  wall.getStatus = cube.getStatus;
  return cube;
}

module.exports = { defineTextCardEffect, tfOpts };
