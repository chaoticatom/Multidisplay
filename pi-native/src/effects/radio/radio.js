// Internet Radio - entry point (core, dt) => void, matching the effect
// registry convention (see ../index.js / weather.js's module comment for
// the pattern this follows). Owns the module-scope player state (current
// station, playing/volume, search results) - same "singleton state owned
// by the effect module, mutated via exported functions the WS layer
// calls" shape as effects/weather.js's wxState / effects/maze.js's token
// trick, not effectOptions (station selection/search are one-shot actions
// with a result, not a slider-style value - see ../../wsServer.js's
// radioPlay/radioStop/radioSearch command handlers).
//
// Visual behaviour matches effects-core.js's effectRadio(): clears
// colBuf, draws the spectrum visualizer ONLY if the "Spectrum Analyser"
// toggle is on (core.effectOptions.radio.spectrumOn - the local per-effect
// equivalent of the browser's global OV.spectrum.on, see CLAUDE.md task
// note: full OV.spectrum overlay integration is out of scope here), then
// draws the scrolling now-playing ticker on face 0 (and face 2 unless
// core.panelMode==='2d', matching the original's is2D check).
'use strict';

const { RadioAudio, RemoteAudio, BAND_COUNT } = require('./ffmpegAudio');
const { renderSpectrumStyle, createSpectrumState } = require('./spectrum');
const { drawTicker } = require('./ticker');
const { CHAR_W } = require('./font');
const { drawGlyph5x7Face, drawLinesCentered, FONT_3x5, facePlot } = require('../text');
const { searchStations } = require('./search');
const { sample, createLevelState, computeLevels } = require('./levels');

// Featured stations - verbatim from effects-core.js's RADIO_STATIONS (real,
// legal, public streams - see CLAUDE.md task note, no concerns here).
const RADIO_STATIONS = [
  { name: 'SomaFM Groove Salad', genre: 'Ambient/Downtempo', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { name: 'SomaFM Drone Zone', genre: 'Ambient', url: 'https://ice1.somafm.com/dronezone-128-mp3' },
  { name: 'SomaFM Space Station', genre: 'Space Music', url: 'https://ice1.somafm.com/spacestation-128-mp3' },
  { name: 'SomaFM Beat Blender', genre: 'Electronica', url: 'https://ice1.somafm.com/beatblender-128-mp3' },
  { name: 'SomaFM Indie Pop Rocks', genre: 'Indie Pop', url: 'https://ice1.somafm.com/indiepop-128-mp3' },
  { name: 'SomaFM Lush', genre: 'Mellow Vocals', url: 'https://ice1.somafm.com/lush-128-mp3' },
  { name: 'SomaFM Secret Agent', genre: 'Spy Lounge', url: 'https://ice1.somafm.com/secretagent-128-mp3' },
  { name: 'SomaFM Boot Liquor', genre: 'Americana', url: 'https://ice1.somafm.com/bootliquor-128-mp3' },
];

// Debug-mode test tones for verifying the spectrum analyser without a real
// stream - see ffmpegAudio.js's _launch() for how `debug:<lavfi spec>` URLs
// get decoded through the SAME pipeline as a real station (FFT/ticker/
// playback all unchanged). Both are plain math expressions (aevalsrc), no
// external files needed.
//   Sweep: a linear chirp from 40Hz to 7000Hz over 45s (narrowed further
//   per a real, explicit request: "do max of 7khz. this is for the debug
//   and also the live spectrum analyser for all sounds" - fft.js's own
//   analysis ceiling was lowered to match). Originally narrowed from
//   20Hz-15000Hz - a real follow-up: "only needs to cover low to high of
//   what a typical song would be" - deep sub-bass below 40Hz and the
//   near-ultrasonic tail above 10kHz aren't where real music content
//   actually sits) - instantaneous phase = 2*PI*(f0*t + (f1-f0)*t^2/(2*T))
//   so frequency rises linearly the whole way, letting you watch every
//   band light up in turn.
//   Drum: a synthesized kick drum (a real follow-up: "make it sound like
//   a deep drum loud sound" - the original was just a broadband noise
//   burst, no low-end character at all). sin(2*PI*(50+70*exp(-25*t))*t) is
//   a classic drum-synthesis trick: the sine's OWN frequency starts around
//   120Hz and drops to 50Hz within about 100ms (the "pitch envelope" that
//   gives a kick its characteristic thump, not just a plain bass tone),
//   multiplied by exp(-4*t) for a ~250ms decay (long enough to read as
//   "loud"/full-bodied, not a clipped click).
const DEBUG_TONES = {
  // debugloop: (not debug:) - a real follow-up ("the sweep should go
  // from 40 to 10khz and back to 40hz again and so forth") - the sweep
  // is meant to keep repeating indefinitely, unlike drum/tone which
  // should play once and stop. See ffmpegAudio.js's ensure()/
  // _debugFinished for how the two prefixes are told apart.
  sweep: { name: 'Debug: Sweep', genre: '40Hz-7kHz over 45s', url: 'debugloop:aevalsrc=sin(2*PI*(40*t+6960*t*t/90)):s=44100:d=45' },
  drum: { name: 'Debug: Drum Hit', genre: 'Deep kick', url: 'debug:aevalsrc=sin(2*PI*(50+70*exp(-25*t))*t)*exp(-4*t):s=44100:d=3' },
};
// (A single colon - `exprs:options` - is the correct aevalsrc syntax,
// verified directly against the real ffmpeg build on real hardware: single
// colon produces a correctly-sized PCM file with no errors, double colon
// throws "Undefined constant or missing '(' in ''" - both expressions
// above use it correctly.)

let audio = new RadioAudio(); // swapped for a RemoteAudio by useRemoteAudio() in the render worker
const spectrumState = createSpectrumState();

let playing = false;
let currentStation = null; // {name, genre, url}
let volume = 0.8;
let searchResults = [];
let searchError = null;
let searching = false;
let lastQuery = '';

// Gain/auto-gain/fit-to-screen state for the display levels - see ./levels.js.
const levelState = createLevelState();

// station: {name, genre, url} - from RADIO_STATIONS or a search result,
// same shape either way (matches the original's radioPlay() contract).
function playStation(station) {
  if (!station || !station.url) return;
  currentStation = { name: station.name || 'Unknown', genre: station.genre || '', url: station.url };
  playing = true;
  // Clears ffmpegAudio.js's "this one-shot debug tone already finished,
  // don't auto-restart it" latch on every genuine new play request (a
  // real station selection is unaffected - the flag only ever gets set
  // for a one-shot debug tone in the first place) - see that file's
  // ensure()/_debugFinished for the other half of this.
  audio.clearDebugFinished();
}

// kind: 'sweep' | 'drum' | 'tone' - see DEBUG_TONES above. 'tone' is a
// steady single frequency built on the fly rather than a fixed table
// entry - a real follow-up request: "add a scroll bar to the sweep test
// so I can select the freq", for manually dialing to one exact frequency
// and watching precisely which band lights up, instead of only the
// automatic sweep. freq is clamped to the same 40Hz-7kHz musical range
// the sweep covers.
function playDebugTone(kind, freq) {
  if (kind === 'tone') {
    const f = Math.max(40, Math.min(7000, Math.round(Number(freq)) || 440));
    playStation({ name: 'Debug: Tone', genre: f + ' Hz', url: 'debug:aevalsrc=sin(2*PI*' + f + '*t):s=44100:d=30' });
    return;
  }
  const tone = DEBUG_TONES[kind];
  if (tone) playStation(tone);
}

function stopStation() {
  playing = false;
  // A real report: a "Stop Sound" action left the decode ffmpeg process
  // running indefinitely (confirmed via `ps aux` on real hardware) when
  // radio wasn't the currently-selected/displayed effect. Root cause:
  // audio.ensure(null) (the only thing that actually tears down the
  // decode/playback processes) was only ever called from effectRadio()'s
  // own tick - which, by design, keeps running radio in the background
  // regardless of the selected effect, but does NOT run at all once
  // nothing is telling it to (nothing schedules a tick for an effect that
  // isn't selected and isn't producing pixels). Tearing down here,
  // synchronously on stop, doesn't depend on another tick ever happening.
  audio.ensure(null);
}

// Called by tick.js every frame (whatever effect or mode is showing), so a
// playing station starts and keeps going. Without this nothing
// called audio.ensure() once you switched away, and the analyser's 10s
// idle timeout stopped the stream - "background" radio cut out 10 seconds
// after changing effect.
function keepAlive(opts) {
  if (opts) { audio.setSyncMs(opts.syncMs); if (Number.isFinite(Number(opts.volume))) setVolume(opts.volume); }
  audio.ensure(playing && currentStation ? currentStation.url : null);
}

function setVolume(v) {
  const n = Number(v);
  if (Number.isFinite(n)) volume = Math.max(0, Math.min(1, n));
  if (audio.setVolume) audio.setVolume(volume); // reaches the speaker (see ffmpegAudio.js)
}

// Fire-and-forget, mirrors weather.js's maybeFetch() shape - the caller
// (wsServer.js's radioSearch handler) doesn't await this; results land in
// getStatus().search on the next state broadcast/poll.
async function search(query) {
  lastQuery = query || '';
  searching = true;
  const { results, error } = await searchStations(lastQuery);
  searchResults = results;
  searchError = error;
  searching = false;
}

function effectRadio(core, dt) {
  core.t += dt;
  const opts = core.effectOptions?.radio || {};
  const spectrumOn = !!opts.spectrumOn;
  const bands = [8, 16, 32, 64, 128, 256].includes(opts.bands) ? opts.bands : 64;
  // Defaults changed per a real request: auto gain ON, gain 2.0x, theme
  // Pastel (5, not VU Meter/6) - see index.html/app.js for the matching
  // UI-side defaults (checkbox/slider initial state + sync fallback).
  const theme = Number.isFinite(opts.theme) ? opts.theme : 5;
  const style = opts.style || 'glow'; // 'glow' is drawn as Bars on the cube faces
  const barMode = opts.barMode || 'solid';
  const gain = Number.isFinite(opts.gain) ? opts.gain : 2;
  const autoGainOn = opts.autoGain !== false;
  const fitToScreen = !!opts.fitToScreen;
  const scrollSpeed = Number.isFinite(opts.scrollSpeed) ? opts.scrollSpeed : 0;
  if (Number.isFinite(opts.volume)) setVolume(opts.volume);

  audio.setSyncMs(opts.syncMs);
  audio.ensure(playing && currentStation ? currentStation.url : null);

  for (let i = 0; i < core.colBuf.length; i++) core.colBuf[i] = 0;

  if (spectrumOn) {
    // Auto Gain - slow-adapting overall multiplier toward a target overall
    // loudness (deliberately slow, per-second not per-band, so it can't
    // "pin to the top"), separate from the manual Gain slider.
    // A real report: "the first bar is always so high, it makes auto gain
    // not function well" - bass/sub-bass content is legitimately loud in an
    // FFT (more raw energy concentrated at low frequencies for most music),
    // so band 0 sits near its ceiling far more often than other bands. Using
    // the MAX across bands here meant that one persistently-loud band alone
    // drove the auto-gain multiplier down, crushing every OTHER band even
    // though they weren't actually loud - average is what "overall
    // loudness" should mean for this purpose.
    // Gain -> auto-gain -> fit-to-screen -> soft ceiling -> bloom, once per
    // frame into arrays (see ./levels.js).
    const lv = computeLevels(levelState, audio, { bands, gain, autoGain: autoGainOn, fitToScreen }, dt);

    // Scroll offset - advances only while Scroll Speed > 0, wraps every
    // 4*SIZE columns, matches effects-core.js's auRefreshCurrentSource().
    if (scrollSpeed > 0) {
      spectrumState.scrollX = ((spectrumState.scrollX || 0) + dt * scrollSpeed * core.SIZE * 1.5 + 4 * core.SIZE) % (4 * core.SIZE);
    }
    const ampArr = lv.amp, peakArr = lv.peak;
    const ctx = {
      amp: (b) => ampArr[b],
      peak: (b) => peakArr[b],
      ampArr, peakArr, vu: audio.vu, // vu: stereo [left, right, leftPeak, rightPeak]
      bands, theme, barMode, scrollX: spectrumState.scrollX || 0, t: core.t, dt,
    };
    renderSpectrumStyle(core, ctx, style, spectrumState);
  }

  if (!playing || !currentStation) {
    // Nothing selected yet: say so instead of a black cube (a review found
    // it read as "broken" - the station list is in the web page).
    if (core.SIZE >= 16) {
      const sc = core.SIZE >= 64 ? 2 : 1;
      // Face rows run bottom-up in the preview/panels (see text.js's
      // drawGlyph5x7Face), so the whole text block is flipped vertically.
      const M = core.SIZE - 1;
      const hint = (face) => { const p = facePlot(core, face, 0.35, 0.5, 0.7); return (x, y) => p(x, M - y); };
      drawLinesCentered(FONT_3x5, ['PICK A', 'STATION'], core.SIZE, core.SIZE, hint(0), { scale: sc });
      if (core.panelMode !== '2d') drawLinesCentered(FONT_3x5, ['PICK A', 'STATION'], core.SIZE, core.SIZE, hint(2), { scale: sc });
    }
  }

  if (playing && currentStation) {
    // Live current-frequency readout for the sweep specifically - a real
    // request: "write on the text the current hz, needs to update
    // quickly". Computed directly from the sweep's own known formula and
    // elapsed real time since launch (audio.lastAttemptMs, already
    // tracked for the retry-cooldown logic) rather than reading it back
    // out of the audio pipeline - updates every tick, at full frame rate,
    // same as anything else drawn here.
    let genre = currentStation.genre;
    if (currentStation.url.startsWith('debugloop:') && audio.lastAttemptMs) {
      const elapsed = (Date.now() - audio.lastAttemptMs) / 1000;
      const sweepSecs = 45, f0 = 40, f1 = 7000;
      const hz = Math.round(f0 + (f1 - f0) * ((elapsed % sweepSecs) / sweepSecs));
      genre = hz + ' Hz';
    }
    // A real follow-up: "the hz text needs to be on screen at all times" -
    // the scrolling ticker only shows any given moment of the label
    // briefly as it marches across the panel, which defeats a LIVE
    // reading that's meant to be watched continuously. The sweep draws
    // its Hz reading as a static, centered, non-scrolling label instead
    // of feeding it through drawTicker(); drum/tone/real stations are
    // unaffected and keep the normal scrolling now-playing ticker.
    if (currentStation.url.startsWith('debugloop:')) {
      drawStaticLabel(core, 0, genre, 7);
      if (core.panelMode !== '2d') drawStaticLabel(core, 2, genre, 7);
    } else {
      const label = currentStation.name + (genre ? '  •  ' + genre : '') + '    ';
      drawTicker(core, 0, label, dt);
      if (core.panelMode !== '2d') drawTicker(core, 2, label, dt);
    }
  }
}

// Centered, non-scrolling text - see effectRadio()'s call for why (the
// sweep's live Hz reading needs to stay fully visible, not march past
// like the normal now-playing ticker).
function drawStaticLabel(core, face, text, sv) {
  if (!text) return;
  const textW = text.length * CHAR_W;
  let u = Math.round((core.SIZE - textW) / 2);
  const rgb = [0.6, 0.85, 1];
  for (const ch of text) u += drawGlyph5x7Face(core, face, ch, u, sv, rgb);
}

// Polled every tick (see app.js's module comment on state.effectStatus)
// into state.effectStatus.radio, broadcast to clients - backs the option
// panel's status readout, search results list, and now-playing display.
function getStatus() {
  return {
    status: audio.getStatus(),
    playbackStatus: audio.getPlaybackStatus(),
    playing,
    station: currentStation,
    volume,
    search: { query: lastQuery, results: searchResults, error: searchError, searching },
  };
}

// Read-only accessor for radioWall.js - exposes the SAME audio decode
// pipeline/playback state this module owns, rather than radioWall.js
// spinning up its own RadioAudio instance (which would double-decode the
// same stream). Matches epic.js/iss.js's ensureFetches() sharing pattern
// referenced in neoWall.js's module comment - one underlying resource,
// two rendering front-ends (cube-face and wall).
function getPlaybackState() {
  return { playing, currentStation };
}

module.exports = effectRadio;
module.exports.getStatus = getStatus;
module.exports.playStation = playStation;
module.exports.playDebugTone = playDebugTone;
module.exports.DEBUG_TONES = DEBUG_TONES;
module.exports.stopStation = stopStation;
module.exports.keepAlive = keepAlive;
module.exports.setVolume = setVolume;
module.exports.search = search;
module.exports.RADIO_STATIONS = RADIO_STATIONS;
module.exports.audio = audio;
// RENDER_WORKER=1 only: called once by renderWorker.js so this thread's
// radio renders from spectrum data the main thread's real RadioAudio sends
// over, instead of decoding on the render thread (see RemoteAudio's
// comment in ./ffmpegAudio.js).
module.exports.useRemoteAudio = () => {
  audio.close();
  audio = new RemoteAudio();
  module.exports.audio = audio;
  return audio;
};
module.exports.getPlaybackState = getPlaybackState;
module.exports.sample = sample;
