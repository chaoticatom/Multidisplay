'use strict';

// Converts one 0-1 float pixel to 0-255 bytes at the given brightness.
// Brightness goes up to 1.5, and clamping each channel separately at 255
// changed the COLOUR of anything saturated (orange [1, 0.5, 0] at 1.5 came
// out [255, 191, 0] - yellow). Instead, if the brightest channel would
// clip, the whole pixel is scaled down so it sits exactly at full, keeping
// the channels' ratio (the hue) intact. Gamma is NOT applied here: the
// panel library already does CIE1931 luminance correction itself
// (rpi-rgb-led-matrix's do_luminance_correct_, on by default).
function writePixel(buf, o, r, g, b, brightness) {
  r = r > 0 ? r * brightness : 0;
  g = g > 0 ? g * brightness : 0;
  b = b > 0 ? b * brightness : 0;
  const m = r > g ? (r > b ? r : b) : (g > b ? g : b);
  const k = m > 1 ? 255 / m : 255;
  buf[o] = (r * k) | 0;
  buf[o + 1] = (g * k) | 0;
  buf[o + 2] = (b * k) | 0;
}

module.exports = { writePixel };
