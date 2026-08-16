// Real-hardware driver, using the `rpi-led-matrix` package (Node/N-API
// bindings for hzeller/rpi-rgb-led-matrix - the standard library this whole
// migration is built around). This file only loads/runs on the Pi itself:
// `rpi-led-matrix` ships a native addon that must be compiled against the
// actual hardware/OS, so it cannot be required in a plain dev sandbox - see
// mockDriver.js for the no-hardware stand-in used everywhere else.
//
// drawBuffer()'s exact contract (verified against the addon's own C++
// source, src/led-matrix.addon.cc's draw_buffer(): NOT just guessed from
// the README, which was stale on this point) is
//   drawBuffer(buffer, w, h, xOffset, yOffset)
// where buffer.length MUST equal w*h*3 - flat RGB, 3 bytes/pixel, row-major,
// (R,G,B) order per pixel. That's what buildFaceBuffer() below produces.
const { LedMatrix, GpioMapping } = require('rpi-led-matrix');

// ---------------------------------------------------------------------------
// PHYSICAL LAYOUT - MUST BE CALIBRATED FOR YOUR ACTUAL WIRING.
// ---------------------------------------------------------------------------
// Assumes the Active-3 board's 3 independent parallel HUB75 outputs, 2
// panels chained on each (matches the hardware recommended earlier in this
// project's planning): total canvas = 64*chainLength x 64*parallel = 128x192.
// cube.js's face indices: 0=Front 1=Back 2=Right 3=Left 4=Top 5=Bottom.
//
// FACE_LAYOUT maps each face to {chain: 0-2, pos: 0-1} - which of the 3
// parallel chains it's on, and which of the 2 chained positions within that
// chain. THE DEFAULT BELOW IS A PLACEHOLDER, NOT A VERIFIED MAPPING - it
// has never been checked against real panels (no hardware available to this
// session). Wire up the panels, run one distinctive test pattern per face
// (e.g. solid red/green/blue/yellow/cyan/magenta), and correct this table
// to match reality before trusting any effect's visual output.
const FACE_LAYOUT = [
  { chain: 0, pos: 0 }, // 0 Front  - PLACEHOLDER, verify against real wiring
  { chain: 0, pos: 1 }, // 1 Back   - PLACEHOLDER
  { chain: 1, pos: 0 }, // 2 Right  - PLACEHOLDER
  { chain: 1, pos: 1 }, // 3 Left   - PLACEHOLDER
  { chain: 2, pos: 0 }, // 4 Top    - PLACEHOLDER
  { chain: 2, pos: 1 }, // 5 Bottom - PLACEHOLDER
];

class RgbMatrixDriver {
  // opts.mode: 'cube' (6 panels via FACE_LAYOUT, FIXED 2x3 physical wiring
  // - unlike 'wall' below, this topology never changes since FACE_LAYOUT's
  // chain/pos values are hardcoded assuming exactly this shape) | '2d'
  // (default, 1 panel - matches panelConfig.js's DEFAULT_CONFIG, so a
  // fresh install doesn't assume all 6 panels are already wired and
  // FACE_LAYOUT calibrated) | 'wall' (N panels in an ARBITRARY flat grid,
  // via opts.panels - chainLength/parallel are computed from the actual
  // layout below, e.g. a 1-wide x 6-tall or 6-wide x 1-tall row needs
  // completely different physical wiring than a 2x3 block, not just a
  // different way of reading the same fixed topology cube mode uses). A
  // real request: "I need the ability to choose all horizontal displays
  // if I wish (or vertical). e.g. 1 row by 6 wide" - your actual cabling
  // needs to match whatever shape you configure. This is read ONCE at
  // construction - rpi-led-matrix has no API to reconfigure or tear down/
  // recreate an LedMatrix instance at runtime (see close() below), so
  // changing mode OR wall shape via the WS setPanelConfig/
  // setPanelPositions commands (see wsServer.js/app.js) only takes effect
  // on the physical panels after a process restart, even though it
  // updates core/the WS preview immediately - app.js logs a warning about
  // this when it happens.
  constructor(opts = {}) {
    this.mode = opts.mode || '2d';
    let topology;
    if (this.mode === '2d') {
      topology = { chainLength: 1, parallel: 1 };
    } else if (this.mode === 'wall' && Array.isArray(opts.panels) && opts.panels.length) {
      topology = {
        chainLength: Math.max(1, ...opts.panels.map((p) => p.gx + 1)),
        parallel: Math.max(1, ...opts.panels.map((p) => p.gy + 1)),
      };
    } else {
      topology = { chainLength: 2, parallel: 3 }; // 'cube' - fixed, see above
    }
    const matrixOptions = {
      ...LedMatrix.defaultMatrixOptions(),
      rows: 64,
      cols: 64,
      ...topology,
      hardwareMapping: GpioMapping.Regular, // change if using an Adafruit HAT instead of the Active-3 board
      ...opts.matrixOptions,
    };
    const runtimeOptions = {
      ...LedMatrix.defaultRuntimeOptions(),
      // Pi 3/4 typically need gpioSlowdown 2-4 or panels show noise/dropouts
      // - start at 2 and raise if the image looks unstable once on real
      // hardware; there's no way to determine the right value without it.
      gpioSlowdown: 2,
      ...opts.runtimeOptions,
    };
    this.matrix = new LedMatrix(matrixOptions, runtimeOptions);
    this._faceBufCache = new Uint8Array(64 * 64 * 3);
  }

  renderFrame(core, brightness = 1.0) {
    if (this.mode === 'wall') { this._renderWallFrame(core, brightness); return; }

    const SIZE = core.SIZE;
    if (SIZE !== 64) {
      // 8/16 are browser-preview-only resolutions (the ESP32 firmware is
      // hardcoded PANEL_SIZE=64 too) - real HUB75 panels are a fixed
      // physical resolution, they don't "become" an 8x8 panel. Only 64 is
      // meaningful here.
      throw new Error(`rgbMatrixDriver is hardcoded for 64x64 faces (matrixOptions rows/cols), got SIZE=${SIZE}`);
    }
    const faceCount = this.mode === '2d' ? 1 : 6;
    for (let face = 0; face < faceCount; face++) {
      const layout = FACE_LAYOUT[face];
      const buf = this._buildFaceBuffer(core, face, brightness);
      this.matrix.drawBuffer(buf, SIZE, SIZE, layout.pos * SIZE, layout.chain * SIZE);
    }
    this.matrix.sync();
  }

  // Wall mode: each panel's (gx,gy) grid position maps directly onto the
  // same physical offsets FACE_LAYOUT uses (gx -> pos/x, the chainLength
  // direction; gy -> chain/y, the parallel direction) - no separate mapping
  // table needed, since it's the identical 2x3 wiring, just addressed by
  // grid coordinate instead of cube face index.
  _renderWallFrame(core, brightness) {
    if (!core.wallBuf) return; // initWall() hasn't run yet
    const S = core.wallPanelSize;
    if (S !== 64) throw new Error(`rgbMatrixDriver is hardcoded for 64x64 panels, got wallPanelSize=${S}`);
    for (const p of core.wallPanels) {
      const buf = this._buildWallPanelBuffer(core, p, brightness);
      this.matrix.drawBuffer(buf, S, S, p.gx * S, p.gy * S);
    }
    this.matrix.sync();
  }

  // Same real-hardware-reported left-right mirror as _buildFaceBuffer's
  // '2d' branch above, for wall mode. Mirrors the WHOLE assembled
  // wallW x wallH canvas, not each panel in isolation - for a multi-panel
  // wall, content that was on the far right of the stitched image needs to
  // end up on the far left panel (not just flipped in place within
  // whichever physical panel already had it), which is what makes the
  // whole picture actually flip rather than each panel just showing its
  // own content backwards. The physical panel positions/wiring
  // (panel.gx/gy -> drawBuffer offset, in _renderWallFrame) are untouched -
  // only which CONTENT lands at each physical offset changes.
  _buildWallPanelBuffer(core, panel, brightness) {
    const S = core.wallPanelSize, wallW = core.wallW, wallH = core.wallH, wallBuf = core.wallBuf;
    const buf = this._faceBufCache;
    const ox = panel.gx * S, oy = panel.gy * S;
    for (let v = 0; v < S; v++) {
      for (let u = 0; u < S; u++) {
        const srcX = wallW - 1 - (ox + u);
        // Whole-canvas vertical flip, same spirit as the horizontal mirror
        // above but for the OTHER axis: several wall effects
        // (weatherWall.js confirmed directly - ground/horizon renders at
        // small v, sky near wallH-1) are written assuming wallBuf row 0 is
        // the BOTTOM of the wall, not the top. Kept consistent with
        // wsServer.js's _streamWallFrames() (the browser preview's
        // source), which applies the identical flip - a real report
        // ("weather... upside down") on the browser side confirmed this
        // is genuinely how the affected effects' own coordinate
        // convention works, not a preview-only quirk, so the physical
        // output needs the same correction to actually match what the
        // preview shows. Unlike the horizontal mirror above (confirmed
        // against a real device report), this hasn't been verified on
        // physical panels - flag any real-hardware orientation mismatch
        // if this turns out wrong for the actual wiring.
        const srcY = wallH - 1 - (oy + v);
        const c = (srcY * wallW + srcX) * 3;
        const o = (v * S + u) * 3;
        buf[o]     = Math.max(0, Math.min(255, (wallBuf[c] * brightness * 255) | 0));
        buf[o + 1] = Math.max(0, Math.min(255, (wallBuf[c + 1] * brightness * 255) | 0));
        buf[o + 2] = Math.max(0, Math.min(255, (wallBuf[c + 2] * brightness * 255) | 0));
      }
    }
    return buf;
  }

  // '2d' mode (a single flat panel, face 0) came back from a real-hardware
  // test mirrored left-right - a real user report, not a guess (the
  // browser preview, which goes through a completely separate path -
  // wsServer.js's maybeStreamFrame() streams colBuf/faceMap straight
  // through with no flip - was confirmed correct, so this is specific to
  // physical panel orientation, not the effect math itself). Cube mode
  // (6 faces) is left untouched here: its faceMap already bakes a
  // deliberate, separately-verified mirror for faces 1/2 (see core.js's
  // module comment and CLAUDE.md's "Face Mirroring" section) that predates
  // this driver and was carried over from the original ESP32 architecture -
  // flipping this function unconditionally would double up on/undo that
  // existing calibration with no report that cube mode is actually wrong.
  _buildFaceBuffer(core, face, brightness) {
    const SIZE = core.SIZE;
    const buf = this._faceBufCache;
    const faceMap = core.faceMap[face];
    const colBuf = core.colBuf;
    const mirror = this.mode === '2d';
    for (let v = 0; v < SIZE; v++) {
      for (let u = 0; u < SIZE; u++) {
        const su = mirror ? SIZE - 1 - u : u;
        const led = faceMap[v * SIZE + su];
        const o = (v * SIZE + u) * 3;
        if (led < 0) {
          buf[o] = 0; buf[o + 1] = 0; buf[o + 2] = 0;
          continue;
        }
        const c = led * 3;
        buf[o]     = Math.max(0, Math.min(255, (colBuf[c] * brightness * 255) | 0));
        buf[o + 1] = Math.max(0, Math.min(255, (colBuf[c + 1] * brightness * 255) | 0));
        buf[o + 2] = Math.max(0, Math.min(255, (colBuf[c + 2] * brightness * 255) | 0));
      }
    }
    return buf;
  }

  close() {
    // rpi-led-matrix has no explicit teardown API exposed - process exit
    // releases the GPIO/DMA resources.
  }
}

module.exports = RgbMatrixDriver;
