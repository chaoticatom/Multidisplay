// Frame-rate-independent trail fade. Effects that leave motion trails dim
// the whole buffer a little every frame; a fixed per-frame factor (e.g.
// `*= 0.78`) makes trails half as long at 60Hz as at 30Hz, and ignores the
// speed slider. Every such factor was tuned when the render loop ran at
// 30Hz, so trailFade(k, dt) returns the per-frame factor that gives the
// same fade per SECOND as `k` applied 30 times a second - identical to
// before at 30Hz, and consistent at any tick rate or speed.
'use strict';

const TUNED_HZ = 30;

function trailFade(k, dt) {
  return Math.pow(k, dt * TUNED_HZ);
}

module.exports = { trailFade, TUNED_HZ };
