// Ported from effects-games.js's initRetro()/effectRetro(dt) (~line 889-922,
// 4481-4544) - the "Retro" effect's entry point, tying together the 14
// mini-game simulations (./retro/games.js), the shared title-card splash
// (./retro/title.js) and the rotating "RETRO"/"GAMES" top-face logo
// (./retro/topface.js). See those three files' module comments for what
// changed vs. the original (title.js in particular drops embedded raster
// image data the original used for 11 of the 14 games' splash screens and
// 3 more games' logos - none of that is reproduced here, only the
// fully-procedural fallback title card every game already had).
//
// Option-panel plumbing: the browser drives game selection/rotation/pool
// straight off module-level globals (retroSelectedGame/retroRotateInterval/
// retroAutoGames) set by sidebar click handlers. Here those same three
// knobs come from core.effectOptions.retro (generic setEffectOption
// mechanism, same pattern as maze.js's runners/newMaze or tron.js's
// bikes/speed/newGame):
//   - core.effectOptions.retro.selectedGame: -1 (or undefined) = auto
//     rotate, 0-13 = pin to one game (mirrors the "Auto"/named
//     .retro-game-btn buttons in panel-retro).
//   - core.effectOptions.retro.rotate: seconds between auto-rotation game
//     changes (mirrors #retro-rotate-slider), default 8.
//   - core.effectOptions.retro.autoGames: array of enabled game indices for
//     the auto-rotation pool (mirrors the .retro-auto-chk checkboxes),
//     or undefined/null to mean "all 14" - same convention as the
//     browser's retroAutoGames (null = no filtering).
const { drawRetroGame } = require('./retro/games');
const { retroDrawTitle } = require('./retro/title');
const { retroDrawTopFace } = require('./retro/topface');
const { VID_FACE_ORDER } = require('./_shared');

// Sam Fox (9) excluded from the auto-rotation pool by default, same as the browser.
const DEFAULT_AUTO_GAMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13];

let retroT = 0, retroGames = [], retroInit = false, retroFaceBuf = null;
let retroLastGameIdx = -1, retroSplashT = 0;

function initRetro(core) {
  retroGames = [
    { name: 'jetpac', t: 0, playerX: 10, playerY: 20, jetY: 0, fuel: [], aliens: [], rocketParts: 0, phase: 'build', partX: 50, partY: 55, carryPart: false, laserT: 0, laserDir: 1, phaseT: 0, launchT: 0 },
    { name: 'manic', t: 0, playerX: 5, playerY: 5, dir: 1, jumpT: 0, jumping: false, platforms: [], items: [], enemyX: [] },
    { name: 'outrun', t: 0, roadOff: 0, carX: 32, speed: 0, trees: [], curves: 0 },
    { name: 'invaders', t: 0, invX: 5, invY: 32, invDir: 1, bullets: [], playerX: 30, bombs: [], invAlive: [], shieldDmg: new Set() },
    { name: 'jsw', t: 0, playerX: 10, playerY: 10, dir: 1, jumpT: 0, jumping: false, room: 0, roomT: 0 },
    { name: 'deathchase', t: 0, speed: 0, treeOff: 0, bikeX: 32, leanDir: 0, enemyX: 20, enemyZ: 40, hit: false, hitT: 0, bullets: [], fireT: 0 },
    { name: 'rtype', t: 0, shipX: 10, shipY: 32, bullets: [], enemies: [], chargeT: 0, scrollX: 0, bossHP: 20, bossX: 55 },
    { name: 'wolf3d', t: 0, posX: 2.5, posY: 2.5, dirA: 0, gunFrame: 0, fireT: 0 },
    { name: 'quake2', t: 0, posX: 3, posY: 3, dirA: 0.5, bobT: 0, muzzleT: 0, enemies: [] },
    { name: 'samfox', t: 0, cards: [], dealT: 0, phase: 'deal', resultT: 0, hand: 'PAIR' },
    { name: 'tamagotchi', t: 0 },
    { name: 'aticatac', t: 0, playerX: 32, playerY: 32, dir: 0, room: 0, roomT: 0, enemies: [], keys: 0, score: 0, health: 100, doorT: 0, attacking: false, attackT: 0, items: [] },
    { name: 'donkeykong', t: 0, marioX: 10, marioY: 8, marioVY: 0, jumping: false, dir: 1, barrels: [], barrelT: 0, score: 0, level: 0, hammer: false, hammerT: 0, lives: 3 },
    { name: 'pacman', t: 0, px: 31, py: 15, pdir: 0, pmouth: 0, dots: [], ghosts: [], score: 0, powerT: 0, eatT: 0, dirQ: 0, mazeInit: false },
  ];
  // Manic Miner platforms
  const g = retroGames[1];
  g.platforms = [[0, 10, 63], [15, 20, 40], [30, 30, 55], [5, 40, 35], [20, 50, 60]];
  g.items = [];
  for (let i = 0; i < 6; i++) g.items.push({ x: 8 + i * 9, y: g.platforms[i % 5][0] - 5, collected: false });
  g.enemyX = [20, 40];
  // Space invaders
  const inv = retroGames[3];
  inv.invAlive = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) inv.invAlive.push({ r, c, alive: true });
  // R-Type enemies
  const rt = retroGames[6];
  rt.enemies = [];
  for (let i = 0; i < 5; i++) rt.enemies.push({ x: 50 + i * 12, y: 15 + i * 8, alive: true, type: i % 3, phase: i * 2 });
  retroFaceBuf = new Float32Array(core.SIZE * core.SIZE * 3);
  retroInit = true;
}

function effectRetro(core, dt) {
  if (!retroInit || !retroFaceBuf || retroFaceBuf.length !== core.SIZE * core.SIZE * 3) initRetro(core);
  if (dt > 0.1) dt = 0.016;
  retroT += dt;
  retroSplashT = Math.max(0, retroSplashT - dt);
  const S = core.SIZE;
  for (let i = 0; i < core.N * 3; i++) core.colBuf[i] = 0;

  const faceBuf = retroFaceBuf;
  const numGames = retroGames.length;
  const opts = core.effectOptions?.retro || {};
  const selectedGame = opts.selectedGame ?? -1;
  const rotateInterval = opts.rotate || 8;
  const autoGames = (opts.autoGames && opts.autoGames.length > 0) ? opts.autoGames : null;

  // Detect game change and trigger splash
  let currentIdx;
  if (selectedGame >= 0) {
    currentIdx = selectedGame;
  } else {
    const pool = autoGames || DEFAULT_AUTO_GAMES;
    currentIdx = pool[Math.floor(retroT / rotateInterval) % pool.length];
  }
  if (currentIdx !== retroLastGameIdx) {
    retroLastGameIdx = currentIdx;
    retroSplashT = 2.0;
  }

  function drawFace(gameIdx, into) {
    const game = retroGames[gameIdx % numGames];
    game.t += dt;
    if (retroSplashT > 0) {
      retroDrawTitle(into, S, game.name, retroT);
      // Mirror: flip both horizontally and vertically
      for (let y = 0; y < Math.floor(S / 2); y++) {
        const y2 = S - 1 - y;
        for (let x = 0; x < S; x++) {
          const i1 = (y * S + x) * 3, i2 = (y2 * S + (S - 1 - x)) * 3;
          const tr = into[i1], tg = into[i1 + 1], tb = into[i1 + 2];
          into[i1] = into[i2]; into[i1 + 1] = into[i2 + 1]; into[i1 + 2] = into[i2 + 2];
          into[i2] = tr; into[i2 + 1] = tg; into[i2 + 2] = tb;
        }
      }
      return;
    }
    drawRetroGame(game, dt, into, S);
  }

  const is2D = core.panelMode === '2d';
  if (is2D) {
    // 2D: show selected game or auto-rotate
    faceBuf.fill(0);
    drawFace(currentIdx, faceBuf);
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
      const pu = S - 1 - u;
      const i = (v * S + pu) * 3;
      const idx = core.faceMap[0][v * S + u]; if (idx < 0) continue;
      core.colBuf[idx * 3] = faceBuf[i]; core.colBuf[idx * 3 + 1] = faceBuf[i + 1]; core.colBuf[idx * 3 + 2] = faceBuf[i + 2];
    }
  } else {
    // 3D: show selected game on all faces, or rotate different games
    const baseIdx = currentIdx;
    const singleGame = selectedGame >= 0;
    faceBuf.fill(0);
    drawFace(baseIdx, faceBuf);
    for (let fIdx = 0; fIdx < 4; fIdx++) {
      if (!singleGame && fIdx > 0) {
        const pool2 = autoGames || DEFAULT_AUTO_GAMES;
        const faceGame = pool2[(pool2.indexOf(baseIdx) + fIdx) % pool2.length];
        faceBuf.fill(0); drawFace(faceGame, faceBuf);
      }
      const face = VID_FACE_ORDER[fIdx];
      for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
        const pu = S - 1 - u;
        const i = (v * S + pu) * 3;
        const idx = core.faceMap[face][v * S + u]; if (idx < 0) continue;
        core.colBuf[idx * 3] = faceBuf[i]; core.colBuf[idx * 3 + 1] = faceBuf[i + 1]; core.colBuf[idx * 3 + 2] = faceBuf[i + 2];
      }
    }
    // Top: RETRO text rotating in circle with effects
    retroDrawTopFace(core, S, retroT);
    // Bottom: dark
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
      const idx = core.faceMap[5][v * S + u]; if (idx < 0) continue;
      core.colBuf[idx * 3] = 0.01; core.colBuf[idx * 3 + 1] = 0.01; core.colBuf[idx * 3 + 2] = 0.03;
    }
  }
}

module.exports = effectRetro;
