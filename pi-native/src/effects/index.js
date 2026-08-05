// Effect registry. Each entry is a function(core, dt) that writes into
// core.colBuf via core.setLED()/core.setFaceLED() - same calling
// convention as the browser's EFFECTS map in ui.js, just addressed through
// `core` instead of bare globals (see ../core.js's module comment for why).
//
// Only 2 effects ported so far (proof-of-concept for the architecture, not
// full feature parity - see the project's pending task list for the much
// longer list of effects still to port from effects-*.js).
const wave = require('./wave');
const gradientWash = require('./gradientWash');

const EFFECTS = {
  wave,
  gradient_wash: gradientWash,
};

const EFFECT_NAMES = {
  wave: 'Wave Cascade',
  gradient_wash: 'Rainbow Wash',
};

module.exports = { EFFECTS, EFFECT_NAMES };
