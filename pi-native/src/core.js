// Ported from cube.js's initCube()/setLED()/setFaceLED()/hsl()/lerp()/sm().
// This is the DOM-free subset: SIZE/N/gridX,Y,Z/surfX,Y,Z/faceMap/colBuf and
// the pixel-write helpers effects call. Deliberately excludes everything
// that exists only for the browser's interactive 3D preview (WebGLRenderer,
// InstancedMesh, edge lines, panel meshes, orbit/drag controls, face-culling
// visibility) - none of that has an equivalent on real hardware; a connected
// browser gets its own preview by receiving frames over WebSocket and
// running the *original* cube.js/Three.js code unchanged, not this module.
//
// Keep this in sync with cube.js's initCube() if the face-mapping/mirroring
// logic there ever changes - the two must produce identical faceMap/surfX,Y,Z
// data for effects to look the same on real panels as in the browser preview.

const TOTAL_SPAN = 63; // matches cube.js - unused geometrically here (no 3D layout needed) but kept for parity/reference

class CubeCore {
  constructor(size = 64) {
    this.SIZE = size;
    this.N = 0;
    this.gridX = null; this.gridY = null; this.gridZ = null;
    this.surfX = null; this.surfY = null; this.surfZ = null;
    this.faceMap = null;       // faceMap[face] : Int32Array(SIZE*SIZE), value = LED index or -1
    this.faceMembership = null; // Uint8Array(N), per-LED bitmask of which faces it belongs to (1<<face) - mirrors cube.js's faceMembership, used by overlays.js's edge-glow overlay to find corner/edge LEDs (member of >=2 faces)
    this.colBuf = null;        // Float32Array(N*3), RGB 0..1 - plain array, NOT GPU-backed (see module comment)
    this.t = 0;                // shared animation clock, matches the browser's global `t`
    this._init(size);
  }

  // Rebuilds faceMap/colBuf/etc for a new SIZE - matches the browser's
  // initCube(newSize) being callable repeatedly (e.g. when the panel-size
  // picker changes). Public alias of the same logic the constructor uses.
  resize(size) {
    this._init(size);
  }

  _init(size) {
    const SIZE = size;
    const gx = [], gy = [], gz = [];
    for (let z = 0; z < SIZE; z++)
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          if (x === 0 || x === SIZE - 1 || y === 0 || y === SIZE - 1 || z === 0 || z === SIZE - 1) {
            gx.push(x); gy.push(y); gz.push(z);
          }
        }
    const N = gx.length;
    const gridX = new Uint8Array(gx), gridY = new Uint8Array(gy), gridZ = new Uint8Array(gz);
    const surfX = new Float32Array(N), surfY = new Float32Array(N), surfZ = new Float32Array(N);
    const invS = 1 / (SIZE - 1);
    for (let i = 0; i < N; i++) {
      surfX[i] = gridX[i] * invS;
      surfY[i] = gridY[i] * invS;
      surfZ[i] = gridZ[i] * invS;
    }

    // Same face-mapping + mirroring as cube.js's initCube() - must match
    // exactly, or an effect that looks correct in the browser preview will
    // appear mirrored/rotated on the real panels for faces 1/2.
    const faceMap = Array.from({ length: 6 }, () => new Int32Array(SIZE * SIZE).fill(-1));
    for (let i = 0; i < N; i++) {
      const x = gridX[i], y = gridY[i], z = gridZ[i];
      if (z === SIZE - 1) faceMap[0][y * SIZE + x] = i;                 // front
      if (z === 0)        faceMap[1][y * SIZE + (SIZE - 1 - x)] = i;    // back (mirrored)
      if (x === SIZE - 1) faceMap[2][y * SIZE + (SIZE - 1 - z)] = i;    // right (mirrored)
      if (x === 0)        faceMap[3][y * SIZE + z] = i;                 // left
      if (y === SIZE - 1) faceMap[4][z * SIZE + x] = i;                 // top
      if (y === 0)        faceMap[5][z * SIZE + x] = i;                 // bottom
    }

    // Face membership bitmask per LED (mirrors cube.js's initCube() logic,
    // lines ~279-288) - face bit values match faceMap's ordering above
    // (0=front..5=bottom): 1,2,4,8,16,32. Used by overlays.js's edge-glow
    // overlay to find LEDs on cube edges/corners (member of >=2 faces).
    const faceMembership = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const x = gridX[i], y = gridY[i], z = gridZ[i];
      if (z === SIZE - 1) faceMembership[i] |= 1;
      if (z === 0)        faceMembership[i] |= 2;
      if (x === SIZE - 1) faceMembership[i] |= 4;
      if (x === 0)        faceMembership[i] |= 8;
      if (y === SIZE - 1) faceMembership[i] |= 16;
      if (y === 0)        faceMembership[i] |= 32;
    }

    this.SIZE = SIZE;
    this.N = N;
    this.gridX = gridX; this.gridY = gridY; this.gridZ = gridZ;
    this.surfX = surfX; this.surfY = surfY; this.surfZ = surfZ;
    this.faceMap = faceMap;
    this.faceMembership = faceMembership;
    this.colBuf = new Float32Array(N * 3);
  }

  setLED(i, r, g, b) {
    const c = this.colBuf, o = i * 3;
    c[o] = r; c[o + 1] = g; c[o + 2] = b;
  }

  setFaceLED(face, u, v, r, g, b) {
    if (u < 0 || u >= this.SIZE || v < 0 || v >= this.SIZE) return;
    const i = this.faceMap[face][v * this.SIZE + u];
    if (i >= 0) this.setLED(i, r, g, b);
  }

  // ─────────────────────────────────────────────────────────────────────
  // "Wall" mode: an arbitrary grid of same-size flat panels forming one
  // big stitched 2D canvas, as opposed to the fixed 6-face cube geometry
  // above. Unrelated to (and independent of) the cube fields - a CubeCore
  // can have both initialized at once; which one an effect/driver/preview
  // actually reads depends on panelConfig.js's mode ('cube'/'2d' use the
  // cube fields via faceMap[0]; 'wall' uses these).
  //
  // panels: array of {gx, gy} - integer grid coordinates, one entry per
  // physical panel, gx/gy both 0-based from the top-left. Each panel is
  // panelSize x panelSize pixels; the overall canvas is
  // (max(gx)+1)*panelSize wide by (max(gy)+1)*panelSize tall - panels
  // don't have to fill every cell of that bounding box (setWallPixel
  // silently no-ops writes that land in an empty cell).
  initWall(panels, panelSize) {
    this.wallPanels = panels;
    this.wallPanelSize = panelSize;
    this.wallCols = Math.max(1, ...panels.map((p) => p.gx + 1));
    this.wallRows = Math.max(1, ...panels.map((p) => p.gy + 1));
    this.wallW = this.wallCols * panelSize;
    this.wallH = this.wallRows * panelSize;
    this.wallBuf = new Float32Array(this.wallW * this.wallH * 3);
    // Occupancy mask so setWallPixel can cheaply skip grid cells with no
    // physical panel in them (e.g. an L-shaped arrangement), same spirit
    // as faceMap's -1 "no LED here" sentinel.
    this._wallOccupied = new Uint8Array(this.wallCols * this.wallRows);
    for (const p of panels) this._wallOccupied[p.gy * this.wallCols + p.gx] = 1;
  }

  setWallPixel(x, y, r, g, b) {
    if (x < 0 || x >= this.wallW || y < 0 || y >= this.wallH) return;
    const gx = (x / this.wallPanelSize) | 0, gy = (y / this.wallPanelSize) | 0;
    if (!this._wallOccupied[gy * this.wallCols + gx]) return;
    const o = (y * this.wallW + x) * 3;
    this.wallBuf[o] = r; this.wallBuf[o + 1] = g; this.wallBuf[o + 2] = b;
  }
}

// Verbatim from cube.js.
function hsl(h, s, l) {
  h = ((h % 1) + 1) % 1;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const hf = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 0.5) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  return [hf(p, q, h + 1 / 3), hf(p, q, h), hf(p, q, h - 1 / 3)];
}
function lerp(a, b, t) { return a + (b - a) * t; }
function sm(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

module.exports = { CubeCore, hsl, lerp, sm, TOTAL_SPAN };
