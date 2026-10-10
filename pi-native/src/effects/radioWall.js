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
const { CHAR_W } = require('./radio/font');
const { createLevelState, computeLevels } = require('./radio/levels');
const { drawString, drawMarquee, drawLinesCentered, FONT_3x5, FONT_5x7, wallPlot } = require('./text');

const spectrumWallState = createSpectrumWallState();
const levelStateW = createLevelState(); // see ./radio/levels.js
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
    const ctx = {
      amp: (b) => ampArr[b],
      peak: (b) => peakArr[b],
      ampArr, peakArr, vu: audio.vu, wave: audio.wave, // vu: stereo [left, right, leftPeak, rightPeak]; wave: the sound wave
      bands, theme, barMode, scrollX: spectrumWallState.scrollX || 0, t: core.t, dt,
    };
    // Version 2 (the default) is the animated scenes; version 1 keeps the classic styles.
    if (opts.version === 1) renderSpectrumStyleWall(core, ctx, style, spectrumWallState);
    else renderSpectrumV2Wall(core, ctx, opts.scene || 'auto', v2State);
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
    } else {
      const label = currentStation.name + (title ? '  -  ' + title : genre ? '  •  ' + genre : '') + '    '; // the song when the station sends it
      drawTickerWall(core, label, dt);
    }
  }
}

module.exports = effectRadioWall;
module.exports.getStatus = radio.getStatus;
