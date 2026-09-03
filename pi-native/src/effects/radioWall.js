// Wall-mode counterpart to radio.js ("Internet Radio").
//
// This is primarily an audio-playback effect (ffmpeg decode + paplay) -
// per radio.js's module comment, only the spectrum-visualizer branch
// (core.effectOptions.radio.spectrumOn) and the now-playing ticker have
// any pixel output at all. Both are generalized here from radio.js's
// `core.panelMode==='2d'` single-flat-panel shape to the full wallW x
// wallH stitched canvas:
//   - Spectrum: ./radio/spectrumWall.js is spectrum.js's renderSpectrumStyle
//     family re-pointed at core.wallW/wallH (see its module comment for why
//     that's mostly a straight parameter swap, cols=S -> cols=wallW,
//     S(height)=wallH, with a few faces-native styles - radial/tunnel/vu/
//     fire - getting new wall-native math instead of a literal per-face
//     port).
//   - Ticker: radio/ticker.js draws through core.setFaceLED/core.SIZE, so
//     rather than bend that helper to a second addressing scheme, this
//     reimplements the same scroll/wrap math directly against
//     core.setWallPixel using radio/font.js's glyph table (font DATA
//     reused, not re-invented - same split ticker.js itself already makes
//     between "its own scroll logic" and "font.js's glyph table").
//
// Playback itself (audio decode, station selection, volume, search) is
// NOT duplicated here - radio.js owns the single RadioAudio instance and
// exports it (module.exports.audio) plus getPlaybackState()/sample() so
// this wall entry point reads the exact same spectrum data the cube-mode
// effect does, rather than decoding the stream a second time. Matches
// weatherWall.js/neoWall.js's "own render state, shared underlying
// resource" split.
'use strict';

const radio = require('./radio/radio');
const { renderSpectrumStyleWall, createSpectrumWallState } = require('./radio/spectrumWall');
const { FONT, CHAR_W } = require('./radio/font');

const spectrumWallState = createSpectrumWallState();
let autoGainMultW = 1;
let lastLevelSmoothedW = 0;
let fitScaleW = 1;
let tickerScrollX = 0;

// See radio.js's sample() for the full story - this used to pick a
// single nearest canonical index per displayed bar, which could skip
// canonical bands (and their peaks) entirely; now takes the max across
// the full contiguous range each displayed bar represents.
function sample(arr, b, bands, BAND_COUNT) {
  if (bands <= 1) return arr[BAND_COUNT - 1];
  const start = Math.floor((b * BAND_COUNT) / bands);
  const end = b === bands - 1 ? BAND_COUNT - 1 : Math.floor(((b + 1) * BAND_COUNT) / bands) - 1;
  let v = arr[start];
  for (let i = start + 1; i <= end; i++) if (arr[i] > v) v = arr[i];
  return v;
}

// Plain, uncorrected glyph draw - see radio/font.js's drawGlyph() comment
// for why: colBuf/wallBuf content should never bake in a driver-specific
// mirror, since the (uncorrected) browser preview and the physical
// driver's own separately-verified mirror step both read the same buffer.
function glyphWall(core, ch, su, sv, rgb) {
  const rows = FONT[ch.toUpperCase()] || FONT['?'];
  for (let ry = 0; ry < 7; ry++) {
    const bits = rows[ry];
    const y = sv - (6 - ry);
    if (y < 0 || y >= core.wallH) continue;
    for (let rx = 0; rx < 5; rx++) {
      if (!(bits & (1 << (4 - rx)))) continue;
      const x = su + rx;
      if (x < 0 || x >= core.wallW) continue;
      core.setWallPixel(x, y, rgb[0], rgb[1], rgb[2]);
    }
  }
  return CHAR_W;
}

// Centered, non-scrolling text - see radio.js's effectRadio() for why
// (the sweep's live Hz reading needs to stay fully visible, not march
// past like the normal now-playing ticker).
function drawStaticLabelWall(core, text) {
  if (!text) return;
  const textW = text.length * CHAR_W;
  const sv = core.wallH - 2;
  let u = Math.round((core.wallW - textW) / 2);
  const rgb = [0.6, 0.85, 1];
  for (const ch of text) u += glyphWall(core, ch, u, sv, rgb);
}

function drawTickerWall(core, label, dt) {
  if (!label) return;
  const textW = label.length * CHAR_W;
  tickerScrollX += dt * 14;
  if (tickerScrollX > textW) tickerScrollX -= textW;
  // sv = core.wallH - 2, not 1 - same fix/root cause as ticker.js's
  // drawTicker(): glyphWall()'s `y = sv - (6-ry)` needs sv near the bottom
  // edge (wallH-ish) in this top-down (row 0 = top) frame, not near 0 - see
  // that file's own comment for the full explanation.
  const sv = core.wallH - 2;
  let u = -Math.floor(tickerScrollX);
  const rgb = [0.6, 0.85, 1];
  while (u < core.wallW) {
    for (const ch of label) {
      u += glyphWall(core, ch, u, sv, rgb);
      if (u > core.wallW) break;
    }
  }
}

function effectRadioWall(core, dt) {
  if (!core.wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  core.t += dt;
  const opts = core.effectOptions?.radio || {};
  const spectrumOn = !!opts.spectrumOn;
  const bands = [8, 16, 32, 64, 128, 256].includes(opts.bands) ? opts.bands : 64;
  // See radio.js's effectRadio() for the default changes (auto gain ON,
  // gain 2.0x, theme Pastel).
  const theme = Number.isFinite(opts.theme) ? opts.theme : 5;
  const style = opts.style || 'bars';
  const barMode = opts.barMode || 'solid';
  const gain = Number.isFinite(opts.gain) ? opts.gain : 2;
  const autoGainOn = opts.autoGain !== false;
  const fitToScreen = !!opts.fitToScreen;
  const scrollSpeed = Number.isFinite(opts.scrollSpeed) ? opts.scrollSpeed : 0;

  const audio = radio.audio;
  const BAND_COUNT = audio.spec.length;

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  if (spectrumOn) {
    // See radio.js's effectRadio() for why this is an average, not the max,
    // and why the target dropped from 0.55 accordingly - same real report
    // (a persistently-loud bass band was crushing auto gain for every
    // other band).
    let overallLevel = 0;
    for (let b = 0; b < bands; b++) overallLevel += sample(audio.spec, b, bands, BAND_COUNT);
    overallLevel /= bands;
    lastLevelSmoothedW += (overallLevel - lastLevelSmoothedW) * Math.min(1, dt * 3);
    if (autoGainOn) {
      const target = 0.45; // see radio.js's effectRadio() for why this was raised again
      if (lastLevelSmoothedW > 0.01) {
        const desired = target / Math.max(0.05, lastLevelSmoothedW * autoGainMultW);
        // See radio.js's effectRadio() - adjustment cadence deliberately
        // gradual (several seconds), separate from bar-motion smoothness.
        autoGainMultW += (desired - autoGainMultW) * Math.min(1, dt * 0.2);
        // See radio.js's effectRadio() - ceiling raised from 4 so auto gain
        // alone can reach what previously needed the manual Gain slider
        // stacked on top of an already-maxed-out multiplier.
        autoGainMultW = Math.max(0.3, Math.min(10, autoGainMultW));
      }
    } else {
      autoGainMultW = 1;
    }
    const totalGain = gain * autoGainMultW;

    // Target 0.99, not 0.94 - same fix/root cause as radio.js's own
    // Fit-to-Screen comment (a real report: bars capped below the true
    // top, "flat lines on loud music").
    if (fitToScreen) {
      let mx = 0;
      for (let b = 0; b < bands; b++) { const v = sample(audio.spec, b, bands, BAND_COUNT) * totalGain; if (v > mx) mx = v; }
      const target = mx > 0.015 ? Math.min(3.5, 0.99 / mx) : fitScaleW;
      fitScaleW += (target - fitScaleW) * 0.12;
    } else {
      fitScaleW = 1;
    }

    if (scrollSpeed > 0) {
      spectrumWallState.scrollX = ((spectrumWallState.scrollX || 0) + dt * scrollSpeed * core.wallW * 0.375 + 4 * core.wallW) % (4 * core.wallW);
    }

    // See radio.js's effectRadio() for why this blooms onto neighbouring
    // bars (display-only, doesn't touch audio.spec/peak).
    const rawAmp = (b) => Math.min(1, sample(audio.spec, b, bands, BAND_COUNT) * totalGain * fitScaleW);
    const rawPeak = (b) => Math.min(1, sample(audio.peak, b, bands, BAND_COUNT) * totalGain * fitScaleW);
    const bloom = (fn, b) => {
      let v = fn(b);
      if (b > 0) v = Math.max(v, fn(b - 1) * 0.5);
      if (b < bands - 1) v = Math.max(v, fn(b + 1) * 0.5);
      return v;
    };
    const ctx = {
      amp: (b) => bloom(rawAmp, b),
      peak: (b) => bloom(rawPeak, b),
      bands, theme, barMode, scrollX: spectrumWallState.scrollX || 0, t: core.t, dt,
    };
    renderSpectrumStyleWall(core, ctx, style, spectrumWallState);
  }

  const { playing, currentStation } = radio.getPlaybackState();
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
      const label = currentStation.name + (genre ? '  •  ' + genre : '') + '    ';
      drawTickerWall(core, label, dt);
    }
  }
}

module.exports = effectRadioWall;
module.exports.getStatus = radio.getStatus;
