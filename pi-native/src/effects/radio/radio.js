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

const { RadioAudio, BAND_COUNT } = require('./ffmpegAudio');
const { renderSpectrumStyle, createSpectrumState } = require('./spectrum');
const { drawTicker } = require('./ticker');
const { searchStations } = require('./search');

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

const audio = new RadioAudio();
const spectrumState = createSpectrumState();

let playing = false;
let currentStation = null; // {name, genre, url}
let volume = 0.8;
let searchResults = [];
let searchError = null;
let searching = false;
let lastQuery = '';

// ── Gain/Auto Gain/Fit-to-Screen — downstream amplitude shaping applied at
// the presentation layer (ctx.amp/ctx.peak), NOT inside ffmpegAudio.js's
// decode/FFT pipeline (out of scope for this pass - see CLAUDE.md task
// note). This mirrors where the browser original applies the equivalent
// logic: auAutoGainMult is computed in readMicSpectrum() (effects-core.js
// ~153-163) as a slow-adapting multiplier separate from the manual Gain
// slider, and auFitScale in auUpdateFitScale() (~95-101) rescales so the
// loudest current band reaches near the top of the face - both applied
// AFTER auSpec/auPeak already hold their smoothed decode-side values,
// exactly where these apply here relative to audio.spec/audio.peak.
let autoGainMult = 1;
let lastLevelSmoothed = 0;
let fitScale = 1;

// station: {name, genre, url} - from RADIO_STATIONS or a search result,
// same shape either way (matches the original's radioPlay() contract).
function playStation(station) {
  if (!station || !station.url) return;
  currentStation = { name: station.name || 'Unknown', genre: station.genre || '', url: station.url };
  playing = true;
}

function stopStation() {
  playing = false;
}

function setVolume(v) {
  const n = Number(v);
  if (Number.isFinite(n)) volume = Math.max(0, Math.min(1, n));
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

// Re-samples the canonical 256-band log spectrum down to `bands` display
// bands by even stride, so a smaller band count still sees the FULL
// frequency range rather than just its low-frequency subset - see
// ffmpegAudio.js's module comment for why this differs slightly from the
// literal (arguably accidental) behaviour of the browser original's direct
// auSpec[b] indexing.
function sample(arr, b, bands) {
  const idx = Math.min(BAND_COUNT - 1, Math.floor((b * BAND_COUNT) / bands));
  return arr[idx];
}

function effectRadio(core, dt) {
  core.t += dt;
  const opts = core.effectOptions?.radio || {};
  const spectrumOn = !!opts.spectrumOn;
  const bands = [8, 16, 32, 64, 128, 256].includes(opts.bands) ? opts.bands : 64;
  const theme = Number.isFinite(opts.theme) ? opts.theme : 6;
  const style = opts.style || 'bars';
  const barMode = opts.barMode || 'solid';
  const gain = Number.isFinite(opts.gain) ? opts.gain : 1;
  const autoGainOn = !!opts.autoGain;
  const fitToScreen = !!opts.fitToScreen;
  const scrollSpeed = Number.isFinite(opts.scrollSpeed) ? opts.scrollSpeed : 0;
  if (Number.isFinite(opts.volume)) setVolume(opts.volume);

  audio.ensure(playing && currentStation ? currentStation.url : null);

  for (let i = 0; i < core.colBuf.length; i++) core.colBuf[i] = 0;

  if (spectrumOn) {
    // Auto Gain - slow-adapting overall multiplier toward a target overall
    // loudness (deliberately slow, per-second not per-band, so it can't
    // "pin to the top"), separate from the manual Gain slider.
    let overallLevel = 0;
    for (let b = 0; b < bands; b++) { const v = sample(audio.spec, b, bands); if (v > overallLevel) overallLevel = v; }
    lastLevelSmoothed += (overallLevel - lastLevelSmoothed) * Math.min(1, dt * 3);
    if (autoGainOn) {
      const target = 0.55;
      if (lastLevelSmoothed > 0.01) {
        const desired = target / Math.max(0.05, lastLevelSmoothed * autoGainMult);
        autoGainMult += (desired - autoGainMult) * Math.min(1, dt * 0.5);
        autoGainMult = Math.max(0.3, Math.min(4, autoGainMult));
      }
    } else {
      autoGainMult = 1;
    }
    const totalGain = gain * autoGainMult;

    // Fit to Screen - rescale bar-style displays each frame so the loudest
    // current band reaches near the top of the face, smoothed so it
    // doesn't visibly pump on every transient.
    if (fitToScreen) {
      let mx = 0;
      for (let b = 0; b < bands; b++) { const v = sample(audio.spec, b, bands) * totalGain; if (v > mx) mx = v; }
      const target = mx > 0.015 ? Math.min(3.5, 0.94 / mx) : fitScale;
      fitScale += (target - fitScale) * 0.12;
    } else {
      fitScale = 1;
    }

    // Scroll offset - advances only while Scroll Speed > 0, wraps every
    // 4*SIZE columns, matches effects-core.js's auRefreshCurrentSource().
    if (scrollSpeed > 0) {
      spectrumState.scrollX = ((spectrumState.scrollX || 0) + dt * scrollSpeed * core.SIZE * 1.5 + 4 * core.SIZE) % (4 * core.SIZE);
    }

    const ctx = {
      amp: (b) => Math.min(1, sample(audio.spec, b, bands) * totalGain * fitScale),
      peak: (b) => Math.min(1, sample(audio.peak, b, bands) * totalGain * fitScale),
      bands, theme, barMode, scrollX: spectrumState.scrollX || 0, t: core.t, dt,
    };
    renderSpectrumStyle(core, ctx, style, spectrumState);
  }

  if (playing && currentStation) {
    const label = currentStation.name + (currentStation.genre ? '  •  ' + currentStation.genre : '') + '    ';
    drawTicker(core, 0, label, dt);
    if (core.panelMode !== '2d') drawTicker(core, 2, label, dt);
  }
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

module.exports = effectRadio;
module.exports.getStatus = getStatus;
module.exports.playStation = playStation;
module.exports.stopStation = stopStation;
module.exports.setVolume = setVolume;
module.exports.search = search;
module.exports.RADIO_STATIONS = RADIO_STATIONS;
