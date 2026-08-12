// Entry point matching the effect registry's (core, dt) => void convention.
// The real implementation lives in ./ghost/ (ghost.js for the state
// machine/LED-surface compositing, render.js for the canvas-2D -> raw-
// pixel-math face renderer) - see ./ghost/ghost.js's module comment.
module.exports = require('./ghost/ghost');
