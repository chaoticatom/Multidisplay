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
const wordClock = require('./wordClock');
const starfield = require('./starfield');
const fluidInk = require('./fluidInk');
const lavaLamp = require('./lavaLamp');
const gradientWash = require('./gradientWash');
const weather = require('./weather');
const easterEgg = require('./easterEgg');
const rain = require('./neonRain'); // old rain*.js kept for reference
const plasma = require('./plasma');
const sphere = require('./laserGrid'); // Laser Grid (old sphere*.js kept for reference)
const dna = require('./dnaHelix'); // old dna*.js kept for reference
const aurora = require('./aurora');
const nebula = require('./nebula');
const warp = require('./warpTunnel'); // old warp*.js kept for reference
const lightning = require('./lightningStorm'); // old lightning*.js kept for reference
const lightspeed = require('./lightspeed');
const gradientWashWall = gradientWash.wall; // one definition for both modes (see ./surface.js)
const cam = require('./cam');
const maze = require('./maze');
const coinflip = require('./coinflip');
const dice = require('./diceRoll'); // Dice Roll (old dice*.js kept for reference)
const random = require('./random');
const random80s = require('./random80sScenes'); // old random80s*.js kept for reference
const tron = require('./tron');
const retro = require('./retro');
const fireworks = require('./fireworksShow'); // old fireworks*.js kept for reference
const video = require('./video');
const radio = require('./radio');
const strobe = require('./strobe');
const balls = require('./balls');
const sand = require('./gravitySand'); // old sand*.js kept for reference
const life = require('./life');
const fluid = require('./rippleTank'); // Liquid Crystal (old fluid*.js kept for reference)
const depthRings = require('./depthRings');
const prism = require('./prism');
const tide = require('./tide');
const datetime = require('./clock'); // Time & Date - all styles, incl. Words (old datetime*.js kept for reference)
const ghost = require('./ghostFace'); // Ghost Face (old ghost*.js kept for reference)
const moon = require('./celestial/celestial');
const iss = require('./iss');
const apod = require('./apod');
const epic = require('./epic');
const neoRadar = require('./neoRadar'); // Near-Earth Objects (neo.js fetches the data)
const apodWall = require('./apodWall');
const epicWall = require('./epicWall');
const issWall = require('./issWall');
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
const retroWall = require('./retroWall');
const radioWall = require('./radioWall');

// Wall-mode ('wall' panelConfig - a stitched grid of N flat panels, see
// core.js's initWall()/setWallPixel()) has its own effect registry, since
// a wall-aware effect needs different math (iterates core.wallW/wallH,
// not the cube's surfX/Y/Z) from its cube-mode counterpart of the same
// name - the two aren't interchangeable, a cube effect writing to
// core.colBuf has no effect on core.wallBuf. 42 of the 45 effects have a
// wall variant now (every EFFECTS key below except custom_cube - see its
// own entry's comment for why that one's deliberately excluded); app.js
// leaves the wall canvas untouched (so panels just stay on whatever they
// last showed, not a hard crash) when the selected effect has no
// WALL_EFFECTS entry yet - see the sidebar's per-effect greying for how
// this is surfaced to the user.
const WALL_EFFECTS = {
  my_photos: myPhotos.wall,
  ambient_weather: ambientWeather.wall,
  pixel_pet: pixelPet.wall,
  snake: snake.wall,
  now_playing: nowPlaying.wall,
  message: messageBoard.wall,
  word_clock: wordClock.wall,
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
  word_clock: wordClock,
  starfield: starfield,
  fluid_ink: fluidInk,
  lava_lamp: lavaLamp,
  ai_art: aiArt,
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
  word_clock: 'Word Clock',
  starfield: 'Starfield',
  fluid_ink: 'Fluid Ink',
  lava_lamp: 'Lava Lamp',
  ai_art: 'AI Art',
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
