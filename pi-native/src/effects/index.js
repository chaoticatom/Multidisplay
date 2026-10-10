// Effect registry. Each entry is a function(core, dt) that writes into
// core.colBuf via core.setLED()/core.setFaceLED() - same calling
// convention as the browser's EFFECTS map in ui.js, just addressed through
// `core` instead of bare globals (see ../core.js's module comment for why).
//
// Only 4 effects ported so far (proof-of-concept for the architecture, not
// full feature parity - see the project's pending task list for the much
// longer list of effects still to port from effects-*.js).
const wave = require('./wave');
const aiArt = require('./aiArt');
const myPhotos = require('./myPhotos');
const ambientWeather = require('./ambientWeather');
const pixelPet = require('./pixelPet');
const snake = require('./snake');
const nowPlaying = require('./nowPlaying');
const messageBoard = require('./messageBoard');
const drawPad = require('./drawPad');
const wordClock = require('./wordClock');
const starfield = require('./starfield');
const fluidInk = require('./fluidInk');
const lavaLamp = require('./lavaLamp');
const countdown = require('./countdown');
const gradientWash = require('./gradientWash');
const weather = require('./weather');
const radar = require('./radar');
const hand3d = require('./hand3d');
const talkingFace = require('./talkingFace');
const easterEgg = require('./easterEgg');
const rain = require('./neonRain');
const plasma = require('./plasma');
const sphere = require('./laserGrid'); // Laser Grid
const dna = require('./dnaHelix');
const aurora = require('./aurora');
const nebula = require('./nebula');
const warp = require('./warpTunnel');
const lightning = require('./lightningStorm');
const lightspeed = require('./lightspeed');
const gradientWashWall = gradientWash.wall; // one definition for both modes (see ./surface.js)
const cam = require('./cam');
const maze = require('./maze');
const coinflip = require('./coinflip');
const dice = require('./diceRoll'); // Dice Roll
const random = require('./random');
const random80s = require('./random80sScenes');
const tron = require('./tron');
const retroFaces = require('./retro'); // the classic cube layout: a different game on each face
const retroArcade = require('./retroArcade');
// Cube Retro: the arcade show on every face, or (option cubeLayout 'faces') the classic layout.
const retro = (core, dt) => ((core.effectOptions && core.effectOptions.retro && core.effectOptions.retro.cubeLayout === 'faces') ? retroFaces : retroArcade)(core, dt);
retro.getStatus = () => (retroArcade.getStatus ? retroArcade.getStatus() : null);
const fireworks = require('./fireworksShow');
const video = require('./video');
const radio = require('./radio');
const strobe = require('./strobe');
const balls = require('./balls');
const sand = require('./gravitySand');
const life = require('./life');
const fluid = require('./rippleTank'); // Liquid Crystal
const depthRings = require('./depthRings');
const prism = require('./prism');
const tide = require('./tide');
const datetime = require('./clock'); // Time & Date - all styles, incl. Words
const ghost = require('./ghostFace'); // Ghost Face
const moon = require('./celestial/celestial');
const iss = require('./iss');
const apod = require('./apod');
const epic = require('./epic');
const neoRadar = require('./neoRadar'); // Near-Earth Objects (neo.js fetches the data)
const apodWall = require('./apodWall');
const epicWall = require('./epicWall');
const issWall = require('./issMap').wall; // the cube keeps iss.js
const customCube = require('./customCube');
const unsplash = require('./unsplash');
const artic = require('./artic');
const joke = require('./joke');
const trivia = require('./trivia');
const otd = require('./otd');
const videoWall = require('./videoWall');
const depthRingsWall = depthRings.wall; // one definition for both modes (see ./surface.js)
const prismWall = prism.wall; // one definition for both modes (see ./surface.js)
const tideWall = tide.wall; // one definition for both modes (see ./surface.js)
const strobeWall = require('./strobeWall');
const waveWall = wave.wall; // one definition for both modes (see ./surface.js)
const plasmaWall = plasma.wall; // one definition for both modes (see ./surface.js)
const auroraWall = aurora.wall; // one definition for both modes (see ./surface.js)
const nebulaWall = nebula.wall; // one definition for both modes (see ./surface.js)
const warpWall = warp.wall;
const rainWall = rain.wall;
const dnaWall = dna.wall;
const lightningWall = lightning.wall;
const lightspeedWall = require('./lightspeedWall');
const sphereWall = sphere.wall;
const ballsWall = balls.wall;
const sandWall = sand.wall;
const lifeWall = require('./lifeWall');
const fluidWall = fluid.wall;
const easterEggWall = require('./easterEggWall');
const coinflipWall = coinflip.wall;
const diceWall = dice.wall;
const randomWall = require('./randomWall');
const random80sWall = random80s.wall;
const fireworksWall = fireworks.wall;
const mazeWall = require('./mazeWall');
const tronWall = require('./tronWall');
const camWall = require('./camWall');
const weatherWall = require('./weatherWall');
const datetimeWall = datetime.wall;
const celestialWall = require('./celestialWall');
const ghostWall = ghost.wall;
const unsplashWall = require('./unsplashWall');
const articWall = require('./articWall');
const jokeWall = joke.wall; // shares one fetch with cube mode (see ./textCard.js)
const triviaWall = trivia.wall; // shares one fetch with cube mode (see ./textCard.js)
const otdWall = otd.wall; // shares one fetch with cube mode
const retroWall = retroArcade.wall;
const radioWall = require('./radioWall');

// Wall mode has its own registry: wall effects draw into core.wallBuf over
// wallW x wallH, so cube effects can't stand in. If the selected effect has
// no WALL_EFFECTS entry, the wall canvas is left as it was (the sidebar
// greys such effects out).
const WALL_EFFECTS = {
  my_photos: myPhotos.wall,
  ambient_weather: ambientWeather.wall,
  pixel_pet: pixelPet.wall,
  snake: snake.wall,
  now_playing: nowPlaying.wall,
  message: messageBoard.wall,
  draw: drawPad.wall,
  word_clock: wordClock.wall,
  countdown: countdown.wall,
  starfield: starfield.wall,
  fluid_ink: fluidInk.wall,
  lava_lamp: lavaLamp.wall,
  ai_art: aiArt.wall,
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
  maze: mazeWall,
  tron: tronWall,
  cam: camWall,
  weather: weatherWall,
  radar: radar.wall,
  talking_face: talkingFace.wall,
  hand3d: hand3d.wall,
  datetime: datetimeWall,
  moon: celestialWall,
  ghost: ghostWall,
  apod: apodWall,
  epic: epicWall,
  iss: issWall,
  neo: neoRadar.wall,
  unsplash: unsplashWall,
  artic: articWall,
  joke: jokeWall,
  trivia: triviaWall,
  otd: otdWall,
  retro: retroWall,
  radio: radioWall,
};

const EFFECTS = {
  my_photos: myPhotos,
  ambient_weather: ambientWeather,
  pixel_pet: pixelPet,
  snake: snake,
  now_playing: nowPlaying,
  message: messageBoard,
  draw: drawPad,
  word_clock: wordClock,
  countdown,
  starfield: starfield,
  fluid_ink: fluidInk,
  lava_lamp: lavaLamp,
  ai_art: aiArt,
  wave,
  gradient_wash: gradientWash,
  weather,
  radar,
  talking_face: talkingFace,
  hand3d,
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
  neo: neoRadar,
  unsplash,
  artic,
  joke,
  trivia,
  otd,
  // No wall variant, and not planned: this is inherently a per-cube-face
  // composition tool (assigns a different effect to each of the 6 cube
  // faces), which has no flat-wall equivalent - there's no "6 faces" to
  // assign on a stitched flat canvas. Nothing is actually lost: each
  // face's assigned effect already has its own wall port (if it has one)
  // that can be selected directly.
  custom_cube: customCube,
};

const EFFECT_NAMES = {
  my_photos: 'My Photos',
  ambient_weather: 'Ambient Weather',
  pixel_pet: 'Pixel Pet',
  snake: 'Snake',
  now_playing: 'Now Playing',
  message: 'Message Board',
  draw: 'Draw',
  word_clock: 'Word Clock',
  countdown: 'Countdown',
  starfield: 'Starfield',
  fluid_ink: 'Fluid Ink',
  lava_lamp: 'Lava Lamp',
  ai_art: 'AI Art',
  wave: 'Wave Cascade',
  gradient_wash: 'Rainbow Wash',
  weather: 'Weather',
  radar: 'Weather Radar',
  talking_face: 'Talking Face',
  hand3d: '3D Hand',
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
  random80s: 'Random 80s',
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
