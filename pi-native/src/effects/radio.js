// Thin re-export, matching weather.js's module split (effects/weather.js
// -> effects/weather/weather.js) - keeps the effect registry's require
// path (./radio) stable while the actual implementation lives in the
// radio/ subdirectory alongside its ffmpeg/FFT/spectrum/search/font/ticker
// helper modules (see radio/radio.js's module comment for the full
// architecture).
module.exports = require('./radio/radio');
