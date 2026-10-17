// Wall-mode counterpart to radio.js ("Internet Radio"). Draws the spectrum
// (./radio/spectrumWall.js) and the now-playing ticker across the whole wall
// canvas, the ticker using radio/font.js's glyphs with core.setWallPixel.
// Playback is not duplicated: radio.js owns the single RadioAudio instance,
// and this reads the same spectrum data through its exports.
'use strict';

const radio = require('./radio/radio');
const { renderSpectrumStyleWall, createSpectrumWallState } = require('./radio/spectrumWall');
const { renderSpectrumV2Wall, createV2State } = require('./radio/spectrumV2Wall');
const v2State = createV2State();
const { drawDjDecks, createDeckState, ROWS: DJ_ROWS } = require('./radio/djDecks');
const deckState = createDeckState();
// Auto-DJ: the next track's peak line over the playing track's spectrum.
let djNext = null; // { lv, smooth, k } made on first use (the level helpers are required further down)
const { CHAR_W } = require('./radio/font');
const { createLevelState, computeLevels } = require('./radio/levels');
const { drawString, drawMarquee, drawLinesCentered, FONT_3x5, FONT_5x7, wallPlot } = require('./text');

const spectrumWallState = createSpectrumWallState();
const levelStateW = createLevelState(); // see ./radio/levels.js
const levelStateL = createLevelState(), levelStateR = createLevelState(); // left/right channels (stereo styles)
let tickerScrollX = 0;

// The 5x7 font on the wall canvas: UNflipped, glyph cell spanning rows
// sv-6..sv (see text.js's drawGlyph5x7Face() for why cube faces differ).
// Text is drawn plain - wallBuf content never bakes in a driver-specific
// mirror, since the (uncorrected) browser preview and the physical
// driver's own separately-verified mirror step both read the same buffer.
const TEXT_RGB = [0.6, 0.85, 1];

// Centered, non-scrolling text - see radio.js's effectRadio() for why
// (the sweep's live Hz reading needs to stay fully visible, not march
// past like the normal now-playing ticker).
function drawStaticLabelWall(core, text) {
  if (!text) return;
  const sv = core.wallH - 2;
  const u = Math.round((core.wallW - text.length * CHAR_W) / 2);
  drawString(FONT_5x7, text, u, sv - 6, wallPlot(core, ...TEXT_RGB));
}

function drawTickerWall(core, label, dt) {
  if (!label) return;
  const textW = label.length * CHAR_W;
  tickerScrollX += dt * 14;
  if (tickerScrollX > textW) tickerScrollX -= textW;
  // Baseline sv = wallH - 2, not 1 - same fix/root cause as ticker.js's
  // drawTicker(): the glyph spans sv-6..sv, so sv needs to sit near the
  // bottom edge in this top-down (row 0 = top) frame - see that file's own
  // comment for the full explanation.
  const sv = core.wallH - 2;
  drawMarquee(FONT_5x7, label, tickerScrollX, sv - 6, core.wallW, wallPlot(core, ...TEXT_RGB), { outline: wallPlot(core, 0, 0, 0) });
}

function effectRadioWall(core, dt) {
  if (!core.wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  core.t += dt;
  const opts = core.effectOptions?.radio || {};
  const spectrumOn = !!opts.spectrumOn;
  const bands = [8, 16, 32, 64, 128, 256, 384].includes(opts.bands) ? opts.bands : 64;
  // See radio.js's effectRadio() for the default changes (auto gain ON,
  // gain 2.0x, theme Pastel).
  const theme = Number.isFinite(opts.theme) ? opts.theme : 5;
  const style = opts.style || 'glow';
  const barMode = opts.barMode || 'solid';
  const gain = Number.isFinite(opts.gain) ? opts.gain : 2;
  const autoGainOn = opts.autoGain !== false;
  const fitToScreen = !!opts.fitToScreen;
  const scrollSpeed = Number.isFinite(opts.scrollSpeed) ? opts.scrollSpeed : 0;

  const audio = radio.audio;
  const djInfo = radio.getPlaybackState().currentStation?.url === 'dj:' ? audio.djInfo || (audio.dj ? { now: audio.dj.status.now, next: audio.dj.status.next, mixing: audio.dj.status.mixing, mixU: audio.dj.status.mixU || 0, mixIn: audio.dj.status.mixIn ?? -1 } : null) : null; // Auto-DJ: the two decks replace the ticker

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  if (spectrumOn) {
    // Shared with the cube front-end - see ./radio/levels.js.
    const lv = computeLevels(levelStateW, audio, { bands, gain, autoGain: autoGainOn, fitToScreen }, dt);

    if (scrollSpeed > 0) {
      spectrumWallState.scrollX = ((spectrumWallState.scrollX || 0) + dt * scrollSpeed * core.wallW * 0.375 + 4 * core.wallW) % (4 * core.wallW);
    } else {

      // Scroll off again: back to the normal, unshifted position.

      spectrumWallState.scrollX = 0;

    }
    const ampArr = lv.amp, peakArr = lv.peak;
    // Left and right on their own (stereo Mirror and Neon), at the main
    // level's gain so a panned sound shows on its own side only.
    let ampL = null, ampR = null;
    if (audio.specL && audio.specR) {
      const o2 = { bands, gain: gain * levelStateW.autoGainMult * (fitToScreen ? levelStateW.fitScale : 1), autoGain: false, fitToScreen: false };
      ampL = computeLevels(levelStateL, { spec: audio.specL, peak: audio.specL }, o2, dt).amp;
      ampR = computeLevels(levelStateR, { spec: audio.specR, peak: audio.specR }, o2, dt).amp;
    }
    const ctx = {
      amp: (b) => ampArr[b],
      peak: (b) => peakArr[b],
      ampArr, peakArr, ampL, ampR, vu: audio.vu, wave: audio.wave, // vu: stereo [left, right, leftPeak, rightPeak]; wave: the sound wave
      bands, theme, barMode, scrollX: spectrumWallState.scrollX || 0, t: core.t, dt, tickerRows: djInfo ? DJ_ROWS : 9, noLabels: !!djInfo,
    };
    // Version 2 (the default) is the animated scenes; version 1 keeps the classic styles.
    if (djInfo && audio.specA) {
      // Auto-DJ: the playing track fills the width in the chosen style; the
      // next track rides on top as a single magenta peak line - from the
      // moment it's lined up (a silent preview of its opening bars), through
      // the mix, so you can watch its peaks against the playing track's.
      if (!djNext) djNext = { a: createLevelState(), b: createLevelState(), line: null, k: 0 };
      const o = { bands, gain, autoGain: autoGainOn, fitToScreen };
      const lA = computeLevels(djNext.a, { spec: audio.specA, peak: audio.specA }, o, dt);
      const c2 = { ...ctx, amp: (i) => lA.amp[i], peak: (i) => lA.peak[i], ampArr: lA.amp, peakArr: lA.peak };
      if (opts.version === 1) renderSpectrumStyleWall(core, c2, style, spectrumWallState);
      else renderSpectrumV2Wall(core, c2, opts.scene || 'auto', v2State, opts.autoSecs);
      const ready = djInfo.next && djInfo.next.status !== 'loading';
      djNext.k += ((ready ? 1 : 0) - djNext.k) * Math.min(1, dt * (ready ? 2 : 5));
      if (djNext.k > 0.02 && audio.specB) {
        const lB = computeLevels(djNext.b, { spec: audio.specB, peak: audio.specB }, o, dt);
        const W = core.wallW, top = 1, bot = core.wallH - DJ_ROWS - 1, h = bot - top;
        if (!djNext.line || djNext.line.length !== W) djNext.line = new Float32Array(W);
        const ln = djNext.line, nb = lB.amp.length;
        for (let x = 0; x < W; x++) {
          const f = (x / Math.max(1, W - 1)) * (nb - 1), i = Math.floor(f), t = f - i;
          const v = (lB.amp[i] || 0) * (1 - t) + (lB.amp[Math.min(nb - 1, i + 1)] || 0) * t;
          ln[x] = bot - Math.max(0, Math.min(1, v)) * h;
        }
        const mixing = !!djInfo.mixing, kk = djNext.k * (mixing ? 1 : 0.85), C = [1, 0.2, 0.85]; // magenta: nothing else uses it
        const px = (x, y, a) => {
          y = Math.round(y); if (x < 0 || x >= W || y < 0 || y > bot) return;
          const q = (y * W + x) * 3, wb = core.wallBuf;
          core.setWallPixel(x, y, Math.min(1.6, wb[q] * (1 - a * 0.6) + C[0] * a), Math.min(1.6, wb[q + 1] * (1 - a * 0.6) + C[1] * a), Math.min(1.6, wb[q + 2] * (1 - a * 0.6) + C[2] * a));
        };
        for (let x = 0; x < W; x++) {
          const y0 = ln[x], y1 = x + 1 < W ? ln[x + 1] : y0;
          // The line itself (joined to its neighbour), a soft glow just under it.
          for (let y = Math.min(y0, y1); y <= Math.max(y0, y1) + 0.01; y += 1) px(x, y, kk);
          px(x, y0 + 1, kk * 0.35); px(x, y0 + 2, kk * 0.12);
        }
      }
    } else if (opts.version === 1) renderSpectrumStyleWall(core, ctx, style, spectrumWallState);
    else renderSpectrumV2Wall(core, ctx, opts.scene || 'auto', v2State, opts.autoSecs);
  }

  const { playing, currentStation, title } = radio.getPlaybackState();
  if (!playing || !currentStation) {
    // Nothing selected yet - see radio.js's matching hint.
    const scale = Math.max(1, Math.min(4, Math.floor(Math.min(core.wallW / 40, core.wallH / 24))));
    drawLinesCentered(FONT_3x5, ['PICK A STATION'], core.wallW, core.wallH, wallPlot(core, 0.35, 0.5, 0.7), { scale });
  }
  if (playing && currentStation) {
    // See radio.js's effectRadio() for why - live current-frequency
    // readout for the sweep specifically, computed from elapsed real
    // time rather than read back out of the audio pipeline.
    let genre = currentStation.genre;
    if (currentStation.url.startsWith('debugloop:') && radio.audio.lastAttemptMs) {
      const elapsed = (Date.now() - radio.audio.lastAttemptMs) / 1000;
      const sweepSecs = 45, f0 = 40, f1 = 7000;
      const hz = Math.round(f0 + (f1 - f0) * ((elapsed % sweepSecs) / sweepSecs));
      genre = hz + ' Hz';
    }
    // See radio.js's effectRadio() for why the sweep gets a static,
    // non-scrolling label instead.
    if (currentStation.url.startsWith('debugloop:')) {
      drawStaticLabelWall(core, genre);
    } else if (djInfo) {
      drawDjDecks(core, djInfo, deckState, dt, core.audio ? core.audio.beat : 0);
    } else {
      const label = currentStation.name + (title ? '  -  ' + title : genre ? '  •  ' + genre : '') + '    '; // the song when the station sends it
      drawTickerWall(core, label, dt);
    }
  }
}

module.exports = effectRadioWall;
module.exports.getStatus = radio.getStatus;
