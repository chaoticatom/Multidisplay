// Ported from effects-games.js's retroDrawTitle(buf,S,name) (~line 924-1339),
// the shared title-card renderer shown for ~2s whenever the Retro effect
// switches games. The 5x7 bitmap glyph font (`font` below, `0x1F`-style row
// bitmasks) and drawText()/border/label/per-game-icon layout are all plain
// drawing-primitive code and are ported verbatim.
//
// DROPPED, deliberately: the original had two categories of embedded raster
// image data that this port does not reproduce -
//   1. For 11 of the 14 games (deathchase, jetpac, manic, outrun, jsw,
//      rtype, wolf3d, quake2, invaders, samfox, pacman) the original
//      short-circuited straight past all the procedural code below with an
//      `if(name==='X'){ ...atob(X_SPLASH_B64)... return; }` block that
//      decoded an embedded base64 raster (very likely a captured
//      screenshot/box-art image of the real commercial game of that name)
//      and blitted it pixel-for-pixel as the splash screen.
//   2. For 3 more (tamagotchi, aticatac, donkeykong) the fallback path
//      itself had a branch that painted a plain background and then a
//      pixel-exact logo via a flat `[x,y,r,g,b,x,y,r,g,b,...]` coordinate
//      array (`_TL`/`_AA`/`_DK`) - same category of "reproduce a raster
//      image", just not base64-encoded.
// Both categories are skipped entirely here. Every one of the 14 games
// already had a fully-procedural fallback title card (border + auto-scaled
// bitmap-font game name + a small per-game procedural icon for several of
// them) sitting right below those branches in the original source, unused
// by the 11 blob games and only reached by the "else" tail for the other
// 3 (which is also skipped, in favour of just the border+label). That
// generic fallback is what every one of the 14 games renders here.
function retroDrawTitle(buf, S, name, t) {
  const setP = (x, y, r, g, b) => {
    if (x < 0 || x >= S || y < 0 || y >= S) return;
    const i = (y * S + x) * 3; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
  };
  const fillRect = (x1, y1, x2, y2, r, g, b) => {
    for (let y = Math.max(0, y1); y <= Math.min(S - 1, y2); y++) for (let x = Math.max(0, x1); x <= Math.min(S - 1, x2); x++) setP(x, y, r, g, b);
  };
  const hLine = (x1, x2, y, r, g, b) => { for (let x = Math.max(0, x1); x <= Math.min(S - 1, x2); x++) setP(x, y, r, g, b); };
  // 5x7 bitmap font used by the generic title card
  const font = {
    A: [0x1F, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11], B: [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
    C: [0x0F, 0x10, 0x10, 0x10, 0x10, 0x10, 0x0F], D: [0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E],
    E: [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F], F: [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
    G: [0x0F, 0x10, 0x10, 0x17, 0x11, 0x11, 0x0F], H: [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    I: [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E], J: [0x01, 0x01, 0x01, 0x01, 0x11, 0x11, 0x0E],
    K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11], L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
    M: [0x11, 0x1B, 0x15, 0x11, 0x11, 0x11, 0x11], N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
    O: [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E], P: [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
    Q: [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D], R: [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
    S: [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E], T: [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E], V: [0x11, 0x11, 0x11, 0x11, 0x0A, 0x0A, 0x04],
    W: [0x11, 0x11, 0x11, 0x11, 0x15, 0x1B, 0x11], X: [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
    Y: [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04], Z: [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
    '0': [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E], '1': [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
    '2': [0x0E, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1F], '3': [0x0E, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0E],
    '8': [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E], '9': [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x01, 0x0E],
    '-': [0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00], ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  };
  const drawText = (text, x, y, sc, r, g, b) => {
    for (let ci = 0; ci < text.length; ci++) {
      const ch = text[ci];
      if (ch === ' ') continue;
      const glyph = font[ch];
      if (!glyph) continue;
      const cx = x + ci * 6 * sc;
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if (bits & (0x10 >> col)) {
            fillRect(cx + col * sc, y + row * sc, cx + col * sc + sc - 1, y + row * sc + sc - 1, r, g, b);
          }
        }
      }
    }
  };

  const titles = {
    jetpac: { col: [1, 1, 0], bg: [0, 0, 0.3] },
    manic: { col: [1, 1, 0], bg: [0, 0, 0] },
    outrun: { col: [1, 0.4, 0], bg: [0, 0, 0.15] },
    invaders: { col: [0, 1, 0], bg: [0, 0, 0] },
    jsw: { col: [1, 0, 1], bg: [0, 0, 0] },
    deathchase: { col: [1, 1, 1], bg: [0, 0.1, 0] },
    rtype: { col: [0, 0.8, 1], bg: [0.1, 0, 0.1] },
    wolf3d: { col: [1, 0, 0], bg: [0.1, 0.1, 0.1] },
    quake2: { col: [1, 0.5, 0], bg: [0.05, 0.02, 0] },
    samfox: { col: [1, 0, 0.8], bg: [0, 0.1, 0] },
    tamagotchi: { col: [1, 0.85, 0.15], bg: [0.1, 0.4, 0.7] },
    aticatac: { col: [0, 0.85, 0.85], bg: [0, 0, 0] },
    donkeykong: { col: [0, 0.85, 1], bg: [0, 0, 0] },
    pacman: { col: [0.95, 0.85, 0], bg: [0, 0, 0] },
  };
  const t2 = titles[name] || { col: [1, 1, 1], bg: [0, 0, 0] };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) setP(x, y, t2.bg[0], t2.bg[1], t2.bg[2]);
  // Border (2px thick)
  for (let i = 0; i < 2; i++) {
    hLine(0, S - 1, i, t2.col[0] * 0.5, t2.col[1] * 0.5, t2.col[2] * 0.5);
    hLine(0, S - 1, S - 1 - i, t2.col[0] * 0.5, t2.col[1] * 0.5, t2.col[2] * 0.5);
    for (let y = 0; y < S; y++) { setP(i, y, t2.col[0] * 0.5, t2.col[1] * 0.5, t2.col[2] * 0.5); setP(S - 1 - i, y, t2.col[0] * 0.5, t2.col[1] * 0.5, t2.col[2] * 0.5); }
  }
  // Full game names
  const labels = {
    jetpac: 'JET PAC', manic: 'MANIC MINER', outrun: 'OUTRUN', invaders: 'SPACE INVADERS',
    jsw: 'JET SET WILLY', rtype: 'R-TYPE', wolf3d: 'WOLFENSTEIN 3D', quake2: 'QUAKE 2', samfox: 'SAM FOX SP', tamagotchi: 'TAMAGOTCHI', aticatac: 'ATIC ATAC', donkeykong: 'DONKEY KONG', pacman: 'PAC-MAN',
  };
  const label = labels[name] || name.toUpperCase();
  // Auto-scale to fit: max usable width is S-8 (4px border each side)
  const maxW = S - 8;
  const naturalW = label.length * 6;
  const scale = Math.min(2, Math.floor(maxW / naturalW) || 1);
  const charH = 7 * scale;
  const textW = label.length * 6 * scale;
  const startX = Math.floor((S - textW) / 2);
  const textY = Math.floor(S / 2) - Math.floor(charH / 2) - 2;
  const cr = t2.col[0], cg = t2.col[1], cb = t2.col[2];
  // Game-specific icon/logo below text (small procedural icons - the
  // original had these for 8 games; tamagotchi/aticatac/donkeykong instead
  // had a pixel-array logo branch here, dropped per the module comment, so
  // those three just get the border+label with no icon).
  if (name === 'jetpac') {
    fillRect(29, textY + charH + 4, 34, textY + charH + 14, cr, cg, cb);
    fillRect(30, textY + charH + 14, 33, textY + charH + 17, 1, 0.3, 0);
    setP(31, textY + charH + 3, cr, cg, cb); setP(32, textY + charH + 3, cr, cg, cb);
  } else if (name === 'manic') {
    fillRect(28, textY + charH + 5, 35, textY + charH + 8, cr, cg, cb);
    fillRect(29, textY + charH + 8, 34, textY + charH + 11, cr * 0.7, cg * 0.7, cb * 0.7);
    hLine(27, 36, textY + charH + 5, cr, cg, cb);
  } else if (name === 'outrun') {
    fillRect(27, textY + charH + 6, 36, textY + charH + 9, 1, 0, 0);
    fillRect(28, textY + charH + 9, 35, textY + charH + 11, 0.7, 0, 0);
  } else if (name === 'invaders') {
    fillRect(29, textY + charH + 6, 34, textY + charH + 8, cr, cg, cb);
    setP(28, textY + charH + 7, cr, cg, cb); setP(35, textY + charH + 7, cr, cg, cb);
    setP(29, textY + charH + 5, cr, cg, cb); setP(34, textY + charH + 5, cr, cg, cb);
  } else if (name === 'jsw') {
    fillRect(29, textY + charH + 5, 34, textY + charH + 11, cr, cg, cb);
    fillRect(27, textY + charH + 4, 36, textY + charH + 5, cr, cg, cb);
  } else if (name === 'rtype') {
    fillRect(28, textY + charH + 7, 35, textY + charH + 8, cr, cg, cb);
    fillRect(35, textY + charH + 6, 37, textY + charH + 9, cr, cg, cb);
  } else if (name === 'wolf3d') {
    hLine(28, 35, textY + charH + 7, cr, cg, cb);
    for (let y = textY + charH + 5; y <= textY + charH + 10; y++) setP(31, y, cr, cg, cb);
    setP(31, textY + charH + 7, 1, 1, 1);
  } else if (name === 'quake2') {
    fillRect(28, textY + charH + 5, 35, textY + charH + 10, cr, cg, cb);
    fillRect(30, textY + charH + 6, 33, textY + charH + 9, t2.bg[0], t2.bg[1], t2.bg[2]);
    setP(34, textY + charH + 10, cr, cg, cb); setP(35, textY + charH + 11, cr, cg, cb);
  } else if (name === 'samfox') {
    // Playing card icon
    fillRect(29, textY + charH + 4, 34, textY + charH + 11, 1, 1, 1);
    setP(30, textY + charH + 9, 1, 0, 0); setP(33, textY + charH + 6, 1, 0, 0);
    fillRect(31, textY + charH + 7, 32, textY + charH + 8, 0, 0, 0);
  }
  // Draw title text
  drawText(label, startX, textY, scale, cr, cg, cb);
  // Flashing bar
  const flashOn = Math.sin(t * 6) > 0;
  if (flashOn) fillRect(Math.floor(S * 0.2), 4, Math.floor(S * 0.8), 5, cr * 0.6, cg * 0.6, cb * 0.6);
}

module.exports = { retroDrawTitle };
