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
// Auto-DJ split spectrum: each half drawn on its own small canvas (so every
// style works unchanged), then copied onto the wall.
let split = null; // made on first use (the level helpers are required further down)
const splitSide = () => ({ v2: createV2State(), v1: createSpectrumWallState(), lv: createLevelState(), sub: null });
function subCanvas(side, W, H) {
  if (side.sub && side.sub.wallW === W && side.sub.wallH === H) return side.sub;
  const buf = new Float32Array(W * H * 3);
  side.sub = { wallW: W, wallH: H, wallBuf: buf, t: 0, setWallPixel(x, y, r, g, b) { if (x < 0 || y < 0 || x >= W || y >= H || x !== (x | 0) || y !== (y | 0)) return; const o = (y * W + x) * 3; buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; } };
  return side.sub;
}
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
      bands, theme, barMode, scrollX: spectrumWallState.scrollX || 0, t: core.t, dt, tickerRows: djInfo ? DJ_ROWS : 9,
    };
    // Version 2 (the default) is the animated scenes; version 1 keeps the classic styles.
    if (djInfo && audio.specA && core.wallW >= 96) {
      // Auto-DJ: the left half is the song playing, the right half the next
      // one (its real sound during the mix; before that a silent preview of
      // its opening bars). The next one is dimmer until the mix brings it up.
      const half = Math.floor(core.wallW / 2), H = core.wallH;
      const kB = djInfo.mixing ? 0.65 + 0.35 * (djInfo.mixU || 0) : djInfo.next && djInfo.next.status !== 'loading' ? 0.6 : 0;
      const kA = djInfo.mixing ? 1 - 0.35 * (djInfo.mixU || 0) : 1;
      for (const [key, x0, w, spec, k] of [['a', 0, half, audio.specA, kA], ['b', half, core.wallW - half, audio.specB, kB]]) {
        if (!split) split = { a: splitSide(), b: splitSide() };
        const side = split[key], sub = subCanvas(side, w, H);
        sub.wallBuf.fill(0); sub.t = core.t;
        if (k > 0) {
          const lvS = computeLevels(side.lv, { spec, peak: spec }, { bands, gain, autoGain: autoGainOn, fitToScreen }, dt);
          const c2 = { ...ctx, amp: (b) => lvS.amp[b], peak: (b) => lvS.peak[b], ampArr: lvS.amp, peakArr: lvS.peak, ampL: null, ampR: null };
          if (opts.version === 1) renderSpectrumStyleWall(sub, c2, style, side.v1);
          else renderSpectrumV2Wall(sub, c2, opts.scene || 'auto', side.v2, opts.autoSecs);
        }
        const b = sub.wallBuf;
        for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 3; if (b[o] + b[o + 1] + b[o + 2] > 0) core.setWallPixel(x0 + x, y, b[o] * k, b[o + 1] * k, b[o + 2] * k); }
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
