// Wall-mode counterpart to retro.js ("Retro" mini-games).
//
// Shape check (per the batch brief): retro.js's `is2D` branch renders ONE
// game's simulation onto a single SIZE x SIZE panel (drawFace() -> a
// square retroFaceBuf, blitted through faceMap[0]). drawRetroGame(game,
// dt, buf, S) (./retro/games.js) is already written in terms of a passed-
// in `S` rather than a hardcoded global SIZE - it just always uses that
// one S for BOTH axes (a square coordinate space; none of the 14 games'
// logic assumes anything else). A stitched wall isn't generally square
// (e.g. 128x64 for two panels side-by-side), so rather than stretch a
// square game's coordinate space into a non-square rectangle (which would
// skew every game's geometry - roads, mazes, sprites, all built assuming
// equal x/y scale), this renders the game at its native square size
// (S = core.wallPanelSize, the size of ONE physical panel) and tiles that
// same rendered frame onto every occupied panel in the wall grid - one
// shared game instance/state, replicated per panel, same spirit as
// retro.js's 3D branch showing a game across multiple cube faces. Per-game
// simulation logic (./retro/games.js) is untouched; only the "where do
// these pixels land" step changes, per the batch's "don't duplicate non-
// rendering logic" rule.
'use strict';

const { drawRetroGame } = require('./retro/games');
const { retroDrawTitle } = require('./retro/title');

// Same pool/default as retro.js (Sam Fox excluded from auto-rotation).
const DEFAULT_AUTO_GAMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13];

let retroGamesW = [];
let retroInitW = false;
let retroFaceBufW = null;
let retroPanelSizeW = 0;
let retroTW = 0, retroLastGameIdxW = -1, retroSplashTW = 0;

function initRetroWall(core) {
  retroGamesW = [
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
  const g = retroGamesW[1];
  g.platforms = [[0, 10, 63], [15, 20, 40], [30, 30, 55], [5, 40, 35], [20, 50, 60]];
  g.items = [];
  for (let i = 0; i < 6; i++) g.items.push({ x: 8 + i * 9, y: g.platforms[i % 5][0] - 5, collected: false });
  g.enemyX = [20, 40];
  const inv = retroGamesW[3];
  inv.invAlive = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) inv.invAlive.push({ r, c, alive: true });
  const rt = retroGamesW[6];
  rt.enemies = [];
  for (let i = 0; i < 5; i++) rt.enemies.push({ x: 50 + i * 12, y: 15 + i * 8, alive: true, type: i % 3, phase: i * 2 });
  retroPanelSizeW = core.wallPanelSize;
  retroFaceBufW = new Float32Array(retroPanelSizeW * retroPanelSizeW * 3);
  retroInitW = true;
}

function effectRetroWall(core, dt) {
  if (!core.wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  if (!retroInitW || !retroFaceBufW || retroPanelSizeW !== core.wallPanelSize) initRetroWall(core);
  if (dt > 0.1) dt = 0.016;
  retroTW += dt;
  retroSplashTW = Math.max(0, retroSplashTW - dt);
  const S = retroPanelSizeW;

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  const numGames = retroGamesW.length;
  const opts = core.effectOptions?.retro || {};
  const selectedGame = opts.selectedGame ?? -1;
  const rotateInterval = opts.rotate || 8;
  const autoGames = (opts.autoGames && opts.autoGames.length > 0) ? opts.autoGames : null;

  let currentIdx;
  if (selectedGame >= 0) {
    currentIdx = selectedGame;
  } else {
    const pool = autoGames || DEFAULT_AUTO_GAMES;
    currentIdx = pool[Math.floor(retroTW / rotateInterval) % pool.length];
  }
  if (currentIdx !== retroLastGameIdxW) {
    retroLastGameIdxW = currentIdx;
    retroSplashTW = 2.0;
  }

  const game = retroGamesW[currentIdx % numGames];
  game.t += dt;
  const into = retroFaceBufW;
  into.fill(0);
  if (retroSplashTW > 0) {
    retroDrawTitle(into, S, game.name, retroTW);
    for (let y = 0; y < Math.floor(S / 2); y++) {
      const y2 = S - 1 - y;
      for (let x = 0; x < S; x++) {
        const i1 = (y * S + x) * 3, i2 = (y2 * S + (S - 1 - x)) * 3;
        const tr = into[i1], tg = into[i1 + 1], tb = into[i1 + 2];
        into[i1] = into[i2]; into[i1 + 1] = into[i2 + 1]; into[i1 + 2] = into[i2 + 2];
        into[i2] = tr; into[i2 + 1] = tg; into[i2 + 2] = tb;
      }
    }
  } else {
    drawRetroGame(game, dt, into, S);
  }

  // Tile the rendered game onto every occupied panel in the wall grid -
  // one shared game instance, mosaicked across however many panels are
  // placed (mirrors retro.js's is2D flip: pu = S-1-u).
  for (const p of core.wallPanels) {
    const ox = p.gx * S, oy = p.gy * S;
    for (let v = 0; v < S; v++) {
      for (let u = 0; u < S; u++) {
        const pu = S - 1 - u;
        const i = (v * S + pu) * 3;
        core.setWallPixel(ox + u, oy + v, into[i], into[i + 1], into[i + 2]);
      }
    }
  }
}

module.exports = effectRetroWall;
