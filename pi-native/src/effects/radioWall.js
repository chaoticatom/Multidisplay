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
      // one (a silent preview of its opening bars, dimmer). As the mix runs,
      // the right analyser slides left into the left one while the left's
      // peaks and troughs morph into the new song's; a glowing seam marks
      // where they meet. When the mix ends the left is the new song, and the
      // song after it fades in on the right.
      if (!split) split = { a: splitSide(), b: splitSide(), kB: 0, merged: null };
      const half = Math.floor(core.wallW / 2), wR = core.wallW - half, H = core.wallH;
      // The mix in three slow stages: the next song's analyser glides in
      // over the first third; then the two sit on top of each other on the
      // same frequency axis - its peaks tinted amber, white where the two
      // songs' peaks meet, so the bass beats can be seen landing together;
      // over the last fifth the old song fades and the new takes its colours.
      const u = djInfo.mixing ? Math.max(0, Math.min(1, djInfo.mixU || 0)) : 0;
      const sm3 = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
      const slide = sm3(u / 0.35), fadeA = sm3((u - 0.8) / 0.2), together = djInfo.mixing ? slide * (1 - fadeA) : 0, e = fadeA;
      const kBWant = djInfo.next && djInfo.next.status !== 'loading' ? 0.62 : 0;
      split.kB += (kBWant - split.kB) * Math.min(1, dt * (kBWant > split.kB ? 1.2 : 4));
      const o = { bands, gain, autoGain: autoGainOn, fitToScreen };
      const lA = computeLevels(split.a.lv, { spec: audio.specA, peak: audio.specA }, o, dt);
      const lB = computeLevels(split.b.lv, { spec: audio.specB, peak: audio.specB }, o, dt);
      if (!split.merged || split.merged.amp.length !== lA.amp.length) split.merged = { amp: new Float32Array(lA.amp.length), peak: new Float32Array(lA.amp.length) };
      const m = split.merged;
      for (let i = 0; i < m.amp.length; i++) { m.amp[i] = lA.amp[i] + (lB.amp[i] - lA.amp[i]) * e; m.peak[i] = lA.peak[i] + (lB.peak[i] - lA.peak[i]) * e; }
      const draw = (side, w, lv) => {
        const sub = subCanvas(side, w, H); sub.wallBuf.fill(0); sub.t = core.t;
        const c2 = { ...ctx, amp: (i) => lv.amp[i], peak: (i) => lv.peak[i], ampArr: lv.amp, peakArr: lv.peak, ampL: null, ampR: null };
        if (opts.version === 1) renderSpectrumStyleWall(sub, c2, style, side.v1);
        else renderSpectrumV2Wall(sub, c2, opts.scene || 'auto', side.v2, opts.autoSecs);
        return sub.wallBuf;
      };
      const put = (x, y, r, g, b2, add) => {
        if (x < 0 || x >= core.wallW) return;
        const q = (y * core.wallW + x) * 3, wb = core.wallBuf;
        if (add) core.setWallPixel(x, y, Math.min(1.6, wb[q] + r), Math.min(1.6, wb[q + 1] + g), Math.min(1.6, wb[q + 2] + b2));
        else core.setWallPixel(x, y, r, g, b2);
      };
      // Left: the playing song (its levels only become the new song's in the final fade).
      const bufA = draw(split.a, half, m), kA = 1 - fadeA;
      const kB = djInfo.mixing ? Math.max(split.kB, 0.62) + (1 - Math.max(split.kB, 0.62)) * fadeA : split.kB;
      const bufB = kB > 0.01 ? draw(split.b, wR, lB) : null;
      const x0B = djInfo.mixing ? Math.round(half * (1 - slide)) : half, tint = 0.75 * together;
      const W2 = core.wallW, AMB = [1, 0.55, 0.12];
      for (let y = 0; y < H; y++) for (let x = 0; x < W2; x++) {
        let r = 0, g = 0, bl = 0, la = 0, lb = 0;
        if (x < half) { const q = (y * half + x) * 3; r = bufA[q] * kA; g = bufA[q + 1] * kA; bl = bufA[q + 2] * kA; la = r + g + bl; }
        const xb = x - x0B;
        if (bufB && xb >= 0 && xb < wR) {
          const q = (y * wR + xb) * 3, br = bufB[q], bg = bufB[q + 1], bb = bufB[q + 2];
          lb = (br + bg + bb) * kB;
          if (lb > 0) {
            const lum = (br + bg + bb) / 3;
            r += (br + (AMB[0] * lum * 1.6 - br) * tint) * kB; g += (bg + (AMB[1] * lum * 1.6 - bg) * tint) * kB; bl += (bb + (AMB[2] * lum * 1.6 - bb) * tint) * kB;
          }
        }
        // Where both songs' peaks are at the same place, light it white.
        if (together > 0.02 && la > 0.25 && lb > 0.25) { const w = Math.min(la, lb) * 0.28 * together; r += w; g += w; bl += w; }
        if (r + g + bl > 0) core.setWallPixel(x, y, Math.min(1.6, r), Math.min(1.6, g), Math.min(1.6, bl));
      }
      // The leading edge glows while the next song glides in.
      const glow = djInfo.mixing ? Math.sin(Math.PI * slide) : 0, area = H - DJ_ROWS;
      if (glow > 0.02) for (let y = 0; y < area; y++) for (let d = -3; d <= 3; d++) {
        const k = glow * (1 - Math.abs(d) / 4) * (0.55 + 0.45 * Math.sin(y * 0.35 + core.t * 9)) * 0.5;
        put(x0B + d, y, 1 * k * (d >= 0 ? 1 : 0.35), 0.62 * k, (d < 0 ? 1 : 0.25) * k, true);
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
