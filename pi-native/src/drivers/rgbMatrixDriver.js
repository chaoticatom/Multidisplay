// Real-hardware driver using `rpi-led-matrix` (Node bindings for
// hzeller/rpi-rgb-led-matrix). Its native addon only builds on the Pi; see
// mockDriver.js for the no-hardware stand-in.
// drawBuffer(buffer, w, h, xOffset, yOffset) requires buffer.length ===
// w*h*3: flat row-major RGB, 3 bytes per pixel (checked against the C++ source).
const { LedMatrix, GpioMapping, RuntimeFlag } = require('rpi-led-matrix');
const { FACE_LAYOUT } = require('../panelConfig');
const { writePixel } = require('./pixel');
const PANEL = 64; // physical panel width/height in pixels

// ---------------------------------------------------------------------------
// PHYSICAL LAYOUT - MUST BE CALIBRATED FOR YOUR ACTUAL WIRING.
// ---------------------------------------------------------------------------
// Cube mode assumes 3 parallel HUB75 chains of 2 panels (128x192 canvas).
// FACE_LAYOUT (in panelConfig.js, shared with Identify Panels) maps each face
// to {chain, pos}; verify it against the real wiring. rotate180 on Top
// compensates for that panel being mounted upside-down relative to the sides
// (unverified on hardware; flipH/flipV also work, see _buildFaceBuffer()).
class RgbMatrixDriver {
  // opts.mode: 'cube' (6 panels, fixed 2x3 wiring via FACE_LAYOUT) | '2d'
  // (default, 1 panel) | 'wall' (N panels in any flat grid via opts.panels;
  // chainLength/parallel come from the layout, and the cabling must match).
  // Read once: rpi-led-matrix cannot be reconfigured at runtime, so mode or
  // wall shape changes reach the panels only after a process restart.
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
      // The library drops root privileges by default after GPIO init. This app
      // needs root for its whole lifetime (bluetoothctl/pactl in bluetooth.js run
      // after this constructor, and fail with "Connection refused" otherwise), so
      // it is disabled explicitly.
      dropPrivileges: RuntimeFlag.Off,
      ...opts.runtimeOptions,
    };
    this.matrix = new LedMatrix(matrixOptions, runtimeOptions);
    this._faceBufCache = new Uint8Array(64 * 64 * 3);
  }

  renderFrame(core, brightness = 1.0) {
    // Which drawing path to use comes from the CURRENT panel mode, not the
    // one at startup: a flat panel's wiring is the same whether it's shown
    // as 'Panel 2D' or as a one-panel wall, so switching between those
    // (e.g. clicking Layout) needs no restart. app.js only restarts the
    // app when the wiring itself changes (cube vs flat, or the wall grid
    // growing) - see driverLayoutKey there.
    const want = core.panelMode || this.mode;
    this._curMode = this.mode === 'cube' ? 'cube' : want === 'wall' && core.wallBuf ? 'wall' : '2d';
    if (this._curMode === 'wall') { this._renderWallFrame(core, brightness); return; }

    const SIZE = core.SIZE;
    if (SIZE !== 64) {
      // 8/16 are browser-preview-only resolutions (the ESP32 firmware is
      // hardcoded PANEL_SIZE=64 too) - real HUB75 panels are a fixed
      // physical resolution, they don't "become" an 8x8 panel. Only 64 is
      // meaningful here.
      throw new Error(`rgbMatrixDriver is hardcoded for 64x64 faces (matrixOptions rows/cols), got SIZE=${SIZE}`);
    }
    const faceCount = this._curMode === '2d' ? 1 : 6;
    for (let face = 0; face < faceCount; face++) {
      // '2d' mode's matrixOptions topology (above) is a FIXED chainLength:1,
      // parallel:1 - i.e. a 64x64 canvas, exactly one panel, always at
      // offset (0,0). FACE_LAYOUT[0] (Front) is {chain:0, pos:1} - a real
      // report ("nothing appears on the physical screen", boot-time
      // flicker then blank once the app starts driving it): using
      // FACE_LAYOUT[face] unconditionally here meant 2d mode drew at
      // xOffset=1*64=64 into a canvas that's only 64px wide - entirely
      // off-canvas, so drawBuffer() silently had nowhere valid to put the
      // pixels. Cube mode still needs FACE_LAYOUT (6 real chain/pos slots);
      // 2d mode's one panel is never wired via that table at all.
      const layout = this._curMode === '2d' ? { chain: 0, pos: 0 } : FACE_LAYOUT[face];
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
    // The physical panels are always 64x64. A smaller logical size (8/16,
    // chosen in the UI) is scaled up to fill each panel - it used to throw,
    // which killed the render worker at startup with a saved 8x8 setting.
    for (const p of core.wallPanels) {
      const buf = this._buildWallPanelBuffer(core, p, brightness);
      this.matrix.drawBuffer(buf, PANEL, PANEL, p.gx * PANEL, p.gy * PANEL);
    }
    this.matrix.sync();
  }

  // Wall mode gets the same left-right mirror as '2d' (real panels show it
  // mirrored otherwise). It mirrors the whole wallW x wallH canvas, not each
  // panel, so content moves between panels; panel offsets are unchanged.
  // Gotcha: on a layout not symmetric about its vertical centerline (e.g. an
  // L-shape), the mirrored column can land on an empty cell and show black.
  _buildWallPanelBuffer(core, panel, brightness) {
    const S = core.wallPanelSize, wallW = core.wallW, wallBuf = core.wallBuf;
    const buf = this._faceBufCache;
    const ox = panel.gx * S, oy = panel.gy * S;
    for (let v = 0; v < PANEL; v++) {
      const sv = Math.floor((v * S) / PANEL);
      for (let u = 0; u < PANEL; u++) {
        const srcX = wallW - 1 - (ox + Math.floor((u * S) / PANEL));
        const c = ((oy + sv) * wallW + srcX) * 3;
        // Flipped top-to-bottom per panel, confirmed on real hardware after
        // 2D was merged into Flat (a 180 rotation left text mirrored).
        const o = ((PANEL - 1 - v) * PANEL + u) * 3;
        writePixel(buf, o, wallBuf[c], wallBuf[c + 1], wallBuf[c + 2], brightness);
      }
    }
    return buf;
  }

  // '2d' mode (single panel, face 0) is mirrored left-right here because the
  // physical panel shows it mirrored otherwise; the browser preview needs no
  // flip. Cube mode is left alone: its faceMap already bakes in a separate,
  // verified mirror for faces 1/2 (see core.js) that this must not undo.
  _buildFaceBuffer(core, face, brightness) {
    const SIZE = core.SIZE;
    const buf = this._faceBufCache;
    const faceMap = core.faceMap[face];
    const colBuf = core.colBuf;
    const mirror = this._curMode === '2d';
    // Per-face physical-mount correction (rotate180/rotateCW90/rotateCCW90/
    // flipH/flipV, see FACE_LAYOUT's module comment) - independent of the
    // '2d' mirror above and of faceMap's own baked-in mirror for faces
    // 1/2, both of which are about the SOFTWARE-side face mapping; this is
    // purely "this one physical panel is mounted rotated/flipped relative
    // to the others", applied last by remapping which source (u,v) each
    // output pixel reads from before faceMap even sees it. rotateCW90/CCW90
    // compute (su,sv) directly from the untransformed (u,v) - not
    // composable with mirror/the other flags (never both true at once in
    // practice: mirror only applies in '2d' mode, where layout is null).
    const layout = this._curMode === '2d' ? null : FACE_LAYOUT[face];
    for (let v = 0; v < SIZE; v++) {
      for (let u = 0; u < SIZE; u++) {
        let su = mirror ? SIZE - 1 - u : u;
        let sv = v;
        if (layout && layout.rotateCW90) { su = v; sv = SIZE - 1 - u; }
        else if (layout && layout.rotateCCW90) { su = SIZE - 1 - v; sv = u; }
        else if (layout && layout.rotate180) { su = SIZE - 1 - su; sv = SIZE - 1 - sv; }
        else if (layout && layout.flipH) { su = SIZE - 1 - su; }
        else if (layout && layout.flipV) { sv = SIZE - 1 - sv; }
        const led = faceMap[sv * SIZE + su];
        const o = (v * SIZE + u) * 3;
        if (led < 0) {
          buf[o] = 0; buf[o + 1] = 0; buf[o + 2] = 0;
          continue;
        }
        const c = led * 3;
        writePixel(buf, o, colBuf[c], colBuf[c + 1], colBuf[c + 2], brightness);
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
