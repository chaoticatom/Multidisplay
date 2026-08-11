// Effect registry. Each entry is a function(core, dt) that writes into
// core.colBuf via core.setLED()/core.setFaceLED() - same calling
// convention as the browser's EFFECTS map in ui.js, just addressed through
// `core` instead of bare globals (see ../core.js's module comment for why).
//
// Only 4 effects ported so far (proof-of-concept for the architecture, not
// full feature parity - see the project's pending task list for the much
// longer list of effects still to port from effects-*.js).
const wave = require('./wave');
const gradientWash = require('./gradientWash');
const weather = require('./weather');
const easterEgg = require('./easterEgg');
const rain = require('./rain');
const plasma = require('./plasma');
const sphere = require('./sphere');
const dna = require('./dna');
const aurora = require('./aurora');
const nebula = require('./nebula');
const warp = require('./warp');
const lightning = require('./lightning');
const lightspeed = require('./lightspeed');

const EFFECTS = {
  wave,
  gradient_wash: gradientWash,
  weather,
  easter_egg: easterEgg,
  rain,
  plasma,
  sphere,
  dna,
  aurora,
  nebula,
  warp,
  lightning,
  lightspeed,
};

const EFFECT_NAMES = {
  wave: 'Wave Cascade',
  gradient_wash: 'Rainbow Wash',
  weather: 'Weather',
  easter_egg: 'Easter Egg',
  rain: 'Colour Rain',
  plasma: 'Plasma Storm',
  sphere: 'Laser Grid',
  dna: 'DNA Helix',
  aurora: 'Aurora Borealis',
  nebula: 'Nebula Drift',
  warp: 'Warp Drive',
  lightning: 'Lightning Storm',
  lightspeed: 'Light Speed',
};

module.exports = { EFFECTS, EFFECT_NAMES };
