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
const maze = require('./maze');
const coinflip = require('./coinflip');
const dice = require('./dice');
const random = require('./random');
const random80s = require('./random80s');
const tron = require('./tron');
const retro = require('./retro');
const fireworks = require('./fireworks');
const video = require('./video');
const radio = require('./radio');
const strobe = require('./strobe');
const balls = require('./balls');
const sand = require('./sand');
const life = require('./life');
const fluid = require('./fluid');
const depthRings = require('./depthRings');
const prism = require('./prism');
const tide = require('./tide');
const datetime = require('./datetime');
const ghost = require('./ghost');
const moon = require('./celestial/celestial');
const iss = require('./iss');
const apod = require('./apod');
const epic = require('./epic');
const neo = require('./neo');
const customCube = require('./customCube');
const unsplash = require('./unsplash');
const artic = require('./artic');
const joke = require('./joke');
const trivia = require('./trivia');
const otd = require('./otd');
const videoWall = require('./videoWall');
const depthRingsWall = require('./depthRingsWall');
const prismWall = require('./prismWall');
const tideWall = require('./tideWall');
const strobeWall = require('./strobeWall');
const waveWall = require('./waveWall');
const plasmaWall = require('./plasmaWall');
const auroraWall = require('./auroraWall');
const nebulaWall = require('./nebulaWall');
const warpWall = require('./warpWall');
const rainWall = require('./rainWall');
const dnaWall = require('./dnaWall');
const lightningWall = require('./lightningWall');
const lightspeedWall = require('./lightspeedWall');
const sphereWall = require('./sphereWall');
const ballsWall = require('./ballsWall');
const sandWall = require('./sandWall');
const lifeWall = require('./lifeWall');
const fluidWall = require('./fluidWall');
const easterEggWall = require('./easterEggWall');
const coinflipWall = require('./coinflipWall');
const diceWall = require('./diceWall');
const randomWall = require('./randomWall');
const random80sWall = require('./random80sWall');
const fireworksWall = require('./fireworksWall');

// Wall-mode ('wall' panelConfig - a stitched grid of N flat panels, see
// core.js's initWall()/setWallPixel()) has its own effect registry, since
// a wall-aware effect needs different math (iterates core.wallW/wallH,
// not the cube's surfX/Y/Z) from its cube-mode counterpart of the same
// name - the two aren't interchangeable, a cube effect writing to
// core.colBuf has no effect on core.wallBuf. 26 effects have a wall variant
// so far (gradient_wash, video, depth_rings, prism, tide, strobe, wave,
// plasma, aurora, nebula, warp, rain, dna, lightning, lightspeed, sphere,
// balls, sand, life, fluid, easter_egg, coinflip, dice, random, random80s,
// fireworks); app.js leaves the wall canvas untouched (so panels just stay
// on whatever they last showed, not a hard crash) when the selected effect
// has no WALL_EFFECTS entry yet - see the sidebar's per-effect greying for
// how this is surfaced to the user.
const WALL_EFFECTS = {
  gradient_wash: gradientWashWall,
  video: videoWall,
  depth_rings: depthRingsWall,
  prism: prismWall,
  tide: tideWall,
  strobe: strobeWall,
  wave: waveWall,
  plasma: plasmaWall,
  aurora: auroraWall,
  nebula: nebulaWall,
  warp: warpWall,
  rain: rainWall,
  dna: dnaWall,
  lightning: lightningWall,
  lightspeed: lightspeedWall,
  sphere: sphereWall,
  balls: ballsWall,
  sand: sandWall,
  life: lifeWall,
  fluid: fluidWall,
  easter_egg: easterEggWall,
  coinflip: coinflipWall,
  dice: diceWall,
  random: randomWall,
  random80s: random80sWall,
  fireworks: fireworksWall,
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
  maze,
  tron,
  coinflip,
  dice,
  random,
  random80s,
  fireworks,
  retro,
  video,
  radio,
  strobe,
  balls,
  sand,
  life,
  fluid,
  depth_rings: depthRings,
  prism,
  tide,
  ghost,
  datetime,
  moon,
  epic,
  apod,
  iss,
  neo,
  unsplash,
  artic,
  joke,
  trivia,
  otd,
  custom_cube: customCube,
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
  maze: 'Maze Runner',
  tron: 'Tron Bikes',
  coinflip: 'Coin Flip',
  dice: 'Dice Roll',
  random: 'Random 1',
  random80s: 'Random 2',
  fireworks: 'Fireworks',
  retro: 'Retro',
  video: 'Video Display',
  radio: 'Internet Radio',
  strobe: 'Strobe Flash',
  balls: 'Bouncing Balls',
  sand: 'Gravity Sand',
  life: 'Crystal Life',
  fluid: 'Liquid Crystal',
  depth_rings: 'Depth Rings',
  prism: 'Prism Sweep',
  tide: 'Color Tide',
  ghost: 'Ghost Face',
  datetime: 'Time & Date',
  moon: 'Celestial',
  epic: 'Earth Live View',
  apod: 'Astronomy Pic of the Day',
  iss: 'ISS Tracker',
  neo: 'Near-Earth Objects',
  unsplash: 'Unsplash Photos',
  artic: 'Art Gallery',
  joke: 'Jokes',
  trivia: 'Trivia',
  otd: 'On This Day',
  custom_cube: 'Custom Cube',
};

module.exports = { EFFECTS, EFFECT_NAMES, WALL_EFFECTS };
