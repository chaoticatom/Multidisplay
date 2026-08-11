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
const gradientWashWall = require('./gradientWashWall');
const cam = require('./cam');

// Wall-mode ('wall' panelConfig - a stitched grid of N flat panels, see
// core.js's initWall()/setWallPixel()) has its own effect registry, since
// a wall-aware effect needs different math (iterates core.wallW/wallH,
// not the cube's surfX/Y/Z) from its cube-mode counterpart of the same
// name - the two aren't interchangeable, a cube effect writing to
// core.colBuf has no effect on core.wallBuf. Only gradient_wash has a wall
// variant so far; app.js leaves the wall canvas untouched (so panels just
// stay on whatever they last showed, not a hard crash) when the selected
// effect has no WALL_EFFECTS entry yet - see the sidebar's per-effect
// greying for how this is surfaced to the user.
const WALL_EFFECTS = {
  gradient_wash: gradientWashWall,
};

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
  cam,
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
  cam: 'Camera',
};

module.exports = { EFFECTS, EFFECT_NAMES, WALL_EFFECTS };
