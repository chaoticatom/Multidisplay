// ---------------------------------------------------------------------
// Preview - two completely different renderers, matching the original
// app exactly: 2D-panel mode never used WebGL at all (see ui.js's
// renderPanel2d()/#panel2d-canvas), it draws round LED dots on a plain 2D
// canvas; only cube mode (6 faces) uses the Three.js/WebGL cube on #c.
// ---------------------------------------------------------------------
let renderer, scene, camera, group;
let panel2dCanvas, panel2dCtx;
const PANEL2D_OUT = 512; // fixed backing resolution, same as ui.js's renderPanel2d()

let wallPreviewEl;
const wallPanelCanvases = {}; // panel index -> {canvas, ctx}
// Preview px per panel (including border/gap), sized to fill the room left
// after the sidebar, clamped so a lone display isn't huge and a full grid
// still fits. cols/rows are the bounding box of the cells actually rendered
// (see rebuildWallPreview()), not the WALL_COLS x WALL_ROWS hardware maximum.
function wallCellSize(cols, rows) {
  const buf = 40;
  const availW = window.innerWidth - sidebarOverlapPx() - buf * 2;
  const availH = sheetTopPx() - buf * 2;
  const cell = Math.min(availW / cols, availH / rows);
  // Up to 900px per panel (was 320): a one- or two-panel wall looked tiny
  // in the middle of a large screen.
  return Math.max(60, Math.min(900, Math.floor(cell)));
}

// Whether the WebGL cube preview is actually usable this session - a real
// report ("cube does not show now, 2d does" - Android, cube-size buttons
// leave the preview blank) traced to WebGL context creation itself failing
// on some mobile browsers/devices (weak GPU, power-saving mode, certain
// WebViews), which previously threw out of initScene() and got swallowed
// by the DOMContentLoaded handler's try/catch into a console.error only -
// 2D mode kept working (plain 2D canvas, no WebGL needed) while cube mode
// silently rendered nothing with zero feedback to the user. false once
// WebGL is confirmed unavailable; rebuildScene()'s cube branch checks this
// and shows #webgl-fallback instead of trying to build a Three.js scene.
let webglOK = true;

function initScene() {
  panel2dCanvas = document.getElementById('panel2d-canvas');
  panel2dCanvas.width = PANEL2D_OUT;
  panel2dCanvas.height = PANEL2D_OUT;
  panel2dCtx = panel2dCanvas.getContext('2d');
  wallPreviewEl = document.getElementById('wall-preview');

  const canvas = document.getElementById('c');
  // Retry once with antialias off (a lighter-weight context request some
  // constrained GPUs will grant even when the antialiased one fails)
  // before giving up on WebGL entirely.
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (err) {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    } catch (err2) {
      webglOK = false;
    }
  }
  if (webglOK) {
    // Clamp devicePixelRatio to 2: with a full-viewport canvas, the DPR of 3-4
    // many Android phones report asks for a framebuffer weak GPUs silently fail
    // to allocate, leaving a blank canvas with no error.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Second line of defense for the same report: a context that WAS
    // successfully created can still be lost/fail to render on some mobile
    // GPUs after the fact (no exception at construction time either) -
    // without this, that reads as the exact same silent black screen.
    // Falling back to the existing #webgl-fallback message at least turns
    // it into a legible "use Panel 2D instead" instead of a dead canvas.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      webglOK = false;
      rebuildScene();
    });
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    // No lights: this repo's three.min.js is a custom stripped-down build
    // (see build-tools/three-entry.js) that only exports what cube.js's own
    // InstancedMesh needs, which is unlit (vertex colors, no lighting model)
    // - THREE.AmbientLight etc. simply aren't in the bundle. Not needed here
    // either: the cube preview's per-LED spheres use MeshBasicMaterial,
    // which is self-lit.
  }
  window.addEventListener('resize', resizeRenderer);
  // The sidebar / phone bottom sheet animates open and closed; re-fit the
  // preview once it has settled (measuring mid-animation centred the
  // preview on the whole screen, half-hidden behind the sheet).
  document.getElementById('sidebar')?.addEventListener('transitionend', (e) => { if (e.target.id === 'sidebar') resizeRenderer(); });
  resizeRenderer();
  rebuildScene(); // shows #webgl-fallback instead of a Three.js scene if !webglOK and currently in cube mode
  if (webglOK) { wireCubeDrag(); buildFaceLabels(); animate(); }
}

// ---------------------------------------------------------------------
// Face labels (#face-labels-chk). The stripped three.min.js build has no
// Sprite/CanvasTexture, so each face's center is projected through the
// camera every frame and a plain DOM span is positioned over it.
// ---------------------------------------------------------------------
let faceLabelEls = [];
function buildFaceLabels() {
  if (faceLabelEls.length) return; // already built - initScene() can run more than once? no, but cheap to guard anyway
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap) return;
  faceLabelEls = FACE_NAMES.map((name) => {
    const el = document.createElement('div');
    el.className = 'face-label';
    el.textContent = name.toUpperCase();
    wrap.appendChild(el);
    return el;
  });
}

const _flVec = new THREE.Vector3();
function updateFaceLabels() {
  if (!faceLabelEls.length) return;
  const chk = document.getElementById('face-labels-chk');
  const on = !!(chk && chk.checked) && currentState.panelMode === 'cube' && group;
  if (!on) {
    for (const el of faceLabelEls) el.style.display = 'none';
    return;
  }
  const w = window.innerWidth, h = window.innerHeight;
  for (let face = 0; face < 6; face++) {
    const el = faceLabelEls[face];
    const xf = FACE_XFORM[face];
    // xf.pos is the face's outward unit normal on the 2x2x2 cube (see
    // rebuildScene()'s own comment on that box size) - pushed to 1.35x so
    // the label floats just outside the panel surface instead of
    // overlapping the LEDs.
    _flVec.set(xf.pos[0], xf.pos[1], xf.pos[2]).multiplyScalar(1.35).applyQuaternion(group.quaternion);
    // Only show labels for faces actually turned toward the camera - dot
    // of the (rotated) outward normal with the direction from the face to
    // the camera. Faces pointing away are on the far side of the cube,
    // hidden behind the near faces' spheres/backing panel; without this
    // check their labels would float in front of the wrong face.
    const towardCam = _flVec.dot(camera.position) > 0;
    if (!towardCam) { el.style.display = 'none'; continue; }
    const proj = _flVec.clone().project(camera);
    if (proj.z > 1) { el.style.display = 'none'; continue; } // behind the camera
    el.style.display = 'block';
    el.style.left = ((proj.x * 0.5 + 0.5) * w) + 'px';
    el.style.top = ((-proj.y * 0.5 + 0.5) * h) + 'px';
  }
}

function resizeRenderer() {
  fitPanel2dCanvas();
  rebuildWallPreview(); // no-ops outside wall mode - re-flows wallCellSize() on viewport/sidebar changes
  if (!webglOK) return; // nothing WebGL-dependent left to resize
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Centre the cube in the space beside an open desktop sidebar (same
  // reasoning as fitPanel2dCanvas()): shift the rendered view left by half
  // the sidebar's width, which moves the cube right by that much.
  const left = sidebarOverlapPx();
  const sheetGap = h - sheetTopPx(); // phones: keep the cube above the controls sheet
  if ((left > 0 || sheetGap > 0) && typeof camera.setViewOffset === 'function') camera.setViewOffset(w, h, -left / 2, sheetGap / 2, w, h);
  else if (typeof camera.clearViewOffset === 'function') camera.clearViewOffset();
  camera.updateProjectionMatrix();
  fitCubeCamera(); // no-ops outside cube mode
}

// Moves the camera along its original viewing direction just far enough
// that the whole cube fits the frustum at the current aspect ratio (narrow
// viewports shrink the horizontal FOV). Bounding radius is the corner
// distance of the 2x2x2 cube centered on the origin: sqrt(3).
const CUBE_BOUND_RADIUS = Math.sqrt(3);
const CUBE_CAMERA_DIR = new THREE.Vector3(2.6, 2.0, 2.6).normalize();
function fitCubeCamera() {
  if (!camera || currentState.panelMode !== 'cube') return;
  const vFov = camera.fov * Math.PI / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const vDist = CUBE_BOUND_RADIUS / Math.sin(vFov / 2);
  const hDist = CUBE_BOUND_RADIUS / Math.sin(hFov / 2);
  const dist = Math.max(vDist, hDist) * 1.15; // small margin so the cube isn't touching the screen edge
  const pos = CUBE_CAMERA_DIR.clone().multiplyScalar(dist);
  camera.position.copy(pos);
  camera.lookAt(0, 0, 0);
}

// Matches cube.js's fitPanel2d(): fit the fixed-resolution square canvas
// into the viewport with a margin, via CSS size (the backing resolution
// stays PANEL2D_OUT regardless).
// Width of the desktop sidebar covering the left of the preview area (0
// when it's collapsed, or on phones where the open menu is full-screen).
// Phones: top edge of the controls bottom sheet (the preview centres in
// the space above it); the full window height when it's closed or on a
// desktop layout.
function sheetTopPx() {
  const sb = document.getElementById('sidebar');
  const r = sb ? sb.getBoundingClientRect() : null;
  return r && r.width >= window.innerWidth * 0.9 && r.top > 0 && r.top < window.innerHeight - 4 ? r.top : window.innerHeight;
}

function sidebarOverlapPx() {
  const sb = document.getElementById('sidebar');
  const r = sb ? sb.getBoundingClientRect() : null;
  return r && r.right > 0 && r.width < window.innerWidth * 0.9 ? r.right : 0;
}

function fitPanel2dCanvas() {
  const buf = 20;
  // The preview area is full-window with the sidebar floating over its
  // left edge, so centring on the whole window hid part of the panel under
  // an open desktop sidebar and left a wide empty gap on the right. Fit and
  // centre it in the space to the RIGHT of the sidebar instead. (On phones
  // the open sidebar covers the whole screen, so this only matters on
  // desktop.)
  const left = sidebarOverlapPx();
  const availW = window.innerWidth - left;
  // Keep clear of the floating Layout toolbar in the top-right corner
  // (reserved top and bottom, so the panel stays vertically centred).
  const tb = document.getElementById('wall-toolbar');
  const tbr = tb ? tb.getBoundingClientRect() : null;
  const vReserve = tbr && tbr.height > 0 ? Math.max(buf, tbr.bottom + 8) : buf;
  const availH = sheetTopPx();
  const size = Math.max(64, Math.min(availW - buf * 2, availH - vReserve * 2));
  panel2dCanvas.style.top = (availH / 2) + 'px';
  panel2dCanvas.style.width = size + 'px';
  panel2dCanvas.style.height = size + 'px';
  panel2dCanvas.style.left = (left + availW / 2) + 'px';
}

// No textures here either: same custom-bundle constraint as the missing
// AmbientLight above (see build-tools/three-entry.js) - CanvasTexture etc.
// aren't exported since the real cube.js never uses textures. It instead
// colors each LED via an InstancedMesh's per-instance color, so the cube
// preview does the same thing here: one InstancedMesh per face, one
// sphere instance per pixel (matching cube.js's own SphereGeometry LED
// look), colored directly from the incoming binary frame.
function rebuildScene() {
  const size = currentState.panelSize || 64;
  const mode = currentState.panelMode;
  panel2dCanvas.style.display = mode === '2d' ? 'block' : 'none';
  wallPreviewEl.style.display = mode === 'wall' ? 'block' : 'none';
  document.getElementById('c').style.display = (mode === 'cube' && webglOK) ? 'block' : 'none';
  const fallback = document.getElementById('webgl-fallback');
  if (fallback) fallback.style.display = (mode === 'cube' && !webglOK) ? 'block' : 'none';
  // animate() (which drives updateFaceLabels()) only runs its body in cube
  // mode, so leaving these visible/stale-positioned here would float them
  // over the 2D/wall preview instead of disappearing with the cube.
  if (mode !== 'cube') for (const el of faceLabelEls) el.style.display = 'none';
  if (mode === '2d') { fitPanel2dCanvas(); return; } // drawn straight into panel2dCtx by handleFrame(), no Three.js scene needed
  if (mode === 'wall') { rebuildWallPreview(); return; } // ditto, drawn into per-panel 2D canvases
  if (!webglOK) return; // #webgl-fallback shown above instead - nothing WebGL-dependent below is safe to touch

  if (group) scene.remove(group);
  group = new THREE.Group();
  scene.add(group);
  for (const key in faceCanvases) delete faceCanvases[key];

  const spacing = 2 / size;                    // matches cube.js's SPACING = TOTAL_SPAN/(SIZE-1) scaled to a 2-unit face
  const geom = new THREE.SphereGeometry(spacing * 0.44, 6, 5); // segment counts kept low: up to 6 * SIZE^2 instances
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let face = 0; face < 6; face++) {
    const mesh = new THREE.InstancedMesh(geom, new THREE.MeshBasicMaterial(), size * size);
    // Top (face 4) flips its local row order here rather than in FACE_XFORM:
    // no single X rotation gives Top both the outward normal and v increasing
    // toward the Front edge (core.js faceMap[4][z*SIZE+x], v=z). Flipping v only
    // in the position lookup fixes the direction without touching the normal.
    const vFlip = face === 4;
    for (let v = 0; v < size; v++) {
      const lv = vFlip ? size - 1 - v : v;
      for (let u = 0; u < size; u++) {
        const i = v * size + u;
        dummy.position.set(-1 + spacing * (u + 0.5), -1 + spacing * (lv + 0.5), 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, color.setRGB(0, 0, 0));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;

    const xf = FACE_XFORM[face];
    mesh.position.set(xf.pos[0] * 1.001, xf.pos[1] * 1.001, xf.pos[2] * 1.001);
    mesh.rotation.set(xf.rot[0], xf.rot[1], xf.rot[2]);
    group.add(mesh);
    faceCanvases[face] = { mesh, size };

    // Solid opaque backing panel, positioned just behind this face's LED
    // spheres - ported from the original browser app's cube.js
    // createPanels() (its own module comment: "fills the gaps between
    // LEDs"). Without it there's nothing physically blocking the view
    // between LED dots, so the opposite face's spheres show straight
    // through the gaps - a real report ("I shouldn't be able to see
    // through it") since a real LED panel has an opaque PCB backing, not a
    // transparent one. Same span/offset math as cube.js's version, scaled
    // to this file's normalized -1..1 face coordinate space (HALF=1 here
    // vs. cube.js's HALF constant - same role).
    const panelSpan = 2 + spacing * 1.2; // slightly wider than the LED array
    const panelOffset = spacing * 0.55;  // placed just behind LED sphere centres
    const backing = new THREE.Mesh(
      new THREE.PlaneGeometry(panelSpan, panelSpan),
      new THREE.MeshBasicMaterial({ color: 0x06060e, side: THREE.FrontSide }),
    );
    const HALF = 1;
    backing.position.set(
      xf.pos[0] * (HALF - panelOffset),
      xf.pos[1] * (HALF - panelOffset),
      xf.pos[2] * (HALF - panelOffset),
    );
    backing.rotation.set(xf.rot[0], xf.rot[1], xf.rot[2]);
    group.add(backing);
  }

  // group gets fully recreated on every rebuildScene() (mode/size change),
  // which would otherwise silently reset the user's manual rotation back
  // to identity - _qRot (module-level, survives rebuilds) is the actual
  // source of truth for cube orientation, re-applied here every time.
  group.quaternion.copy(_qRot);
  fitCubeCamera();
}

// ---------------------------------------------------------------------
// Click/touch-and-drag cube rotation - "same look and feel as it was on
// the ESP32 version": ported from cube.js's quaternion-based orbit
// (applyRotation()/tickInertia()), not a simplified from-scratch version.
// Y-then-X axis-angle quaternion composition (avoids gimbal lock a plain
// Euler.x/y increment would hit), momentum that decays after release, and
// disabling the "auto-rotate" checkbox the moment a drag starts - all
// matching the original's behavior. rotateYOnly/gyro/tap-to-snap-a-face
// from cube.js aren't ported (not requested, no auto-rotate-only /
// device-orientation permission UI exists here to hang them off).
// ---------------------------------------------------------------------
const _qRot = new THREE.Quaternion();
const _qDelta = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const DRAG_SENS = 0.007, TOUCH_SENS = 0.009;
const INERTIA_DECAY = 0.88, INERTIA_MIN = 0.0003;
let cubeDragging = false, cubeLastX = 0, cubeLastY = 0, cubeVelX = 0, cubeVelY = 0;

function applyCubeRotation(dx, dy, sens) {
  _qDelta.setFromAxisAngle(_yAxis, dx * sens);
  _qRot.multiplyQuaternions(_qDelta, _qRot);
  _qDelta.setFromAxisAngle(_xAxis, dy * sens);
  _qRot.multiplyQuaternions(_qDelta, _qRot);
  if (group) group.quaternion.copy(_qRot);
}

function wireCubeDrag() {
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap) return;
  const uncheckAutoRotate = () => {
    const c = document.getElementById('auto-rotate-chk');
    if (c) c.checked = false;
  };
  const start = (x, y) => {
    if (currentState.panelMode !== 'cube' || !group) return;
    cubeDragging = true; cubeVelX = 0; cubeVelY = 0; cubeLastX = x; cubeLastY = y;
    uncheckAutoRotate();
  };
  const move = (x, y, sens) => {
    if (!cubeDragging) return;
    const dx = x - cubeLastX, dy = y - cubeLastY;
    cubeLastX = x; cubeLastY = y;
    cubeVelX = dx * 0.015; cubeVelY = dy * 0.015;
    applyCubeRotation(dx, dy, sens);
  };
  const end = () => { cubeDragging = false; };

  wrap.addEventListener('mousedown', (e) => start(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY, DRAG_SENS));
  window.addEventListener('mouseup', end);
  wrap.addEventListener('touchstart', (e) => { if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  wrap.addEventListener('touchmove', (e) => { if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY, TOUCH_SENS); }, { passive: true });
  wrap.addEventListener('touchend', end, { passive: true });
}

let _autoRotateChk;
function animate() {
  requestAnimationFrame(animate);
  if (currentState.panelMode !== 'cube') return; // 2D and wall modes never touch the WebGL renderer
  const autoRotate = _autoRotateChk || (_autoRotateChk = document.getElementById('auto-rotate-chk'));
  if (cubeDragging) {
    // rotation already applied directly in the move handler above
  } else if (Math.abs(cubeVelX) > INERTIA_MIN || Math.abs(cubeVelY) > INERTIA_MIN) {
    applyCubeRotation(cubeVelX * 60, cubeVelY * 60, DRAG_SENS);
    cubeVelX *= INERTIA_DECAY; cubeVelY *= INERTIA_DECAY;
  } else if (group && (!autoRotate || autoRotate.checked)) {
    _qDelta.setFromAxisAngle(_yAxis, 0.003);
    _qRot.multiplyQuaternions(_qDelta, _qRot);
    group.quaternion.copy(_qRot);
  }
  updateFaceLabels();
  renderer.render(scene, camera);
}

const _frameColor = new THREE.Color();

// Ported verbatim (math unchanged) from ui.js's renderPanel2d(): round LED
// dots on black, drawn straight into the 2D canvas - no WebGL involved.
function drawPanel2dFrame(bytes) {
  drawLedGrid(panel2dCtx, bytes, currentState.panelSize, PANEL2D_OUT, true);
  panel2dCtx.strokeStyle = '#99ddff';
  panel2dCtx.lineWidth = 2;
  panel2dCtx.strokeRect(1, 1, PANEL2D_OUT - 2, PANEL2D_OUT - 2);
}

// Fast round-LED rendering shared by the 2D and wall previews. It used to
// call arc()+fill() and build an rgb() string for every LED - 4,096 path
// fills per 64x64 panel per frame (x6 on a wall), the page's main CPU cost
// on phones. Now: write the pixels into a size x size ImageData, scale it
// up with smoothing off (one drawImage), then draw a cached mask that is
// black everywhere except round holes - the same dots-on-black look.
const _ledGrid = { src: null, img: null, size: 0 };
const _ledMasks = new Map(); // `${out}x${size}` -> canvas
function ledMask(out, size) {
  const key = out + 'x' + size;
  let m = _ledMasks.get(key);
  if (m) return m;
  m = document.createElement('canvas');
  m.width = m.height = out;
  const c = m.getContext('2d');
  const cell = out / size, r = cell * 0.44;
  c.fillStyle = '#000';
  c.fillRect(0, 0, out, out);
  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      c.moveTo((u + 0.5) * cell + r, (v + 0.5) * cell);
      c.arc((u + 0.5) * cell, (v + 0.5) * cell, r, 0, Math.PI * 2);
    }
  }
  c.fill();
  _ledMasks.set(key, m);
  return m;
}
function drawLedGrid(ctx, bytes, size, out, flipY) {
  if (_ledGrid.size !== size) {
    _ledGrid.src = document.createElement('canvas');
    _ledGrid.src.width = _ledGrid.src.height = size;
    _ledGrid.img = _ledGrid.src.getContext('2d').createImageData(size, size);
    _ledGrid.size = size;
  }
  const px = _ledGrid.img.data;
  for (let v = 0; v < size; v++) {
    const row = flipY ? size - 1 - v : v;
    for (let u = 0; u < size; u++) {
      const o = 1 + (v * size + u) * 3, d = (row * size + u) * 4;
      px[d] = bytes[o]; px[d + 1] = bytes[o + 1]; px[d + 2] = bytes[o + 2]; px[d + 3] = 255;
    }
  }
  _ledGrid.src.getContext('2d').putImageData(_ledGrid.img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(_ledGrid.src, 0, 0, out, out);
  ctx.drawImage(ledMask(out, size), 0, 0);
}

// One small canvas per placed panel (dots on black, like drawPanel2dFrame()),
// plus dashed drop targets only next to existing panels; the area tracks the
// panels+candidates bounding box. Panel 0 is the primary display and can be
// moved but never removed. wallPanelCanvases is keyed by index into
// currentState.panels, matching the per-panel frame index (handleFrame()).
// The server requires gx/gy within [0,WALL_COLS) x [0,WALL_ROWS), so a drop
// left of/above the primary at (0,0) needs every panel shifted. This returns
// that shift for a candidate, or null if no shift keeps all panels in bounds.
function shiftForCandidate(panels, gx, gy) {
  let shiftX = 0, shiftY = 0;
  if (gx < 0) shiftX = -gx;
  else if (gx >= WALL_COLS) shiftX = (WALL_COLS - 1) - gx;
  if (gy < 0) shiftY = -gy;
  else if (gy >= WALL_ROWS) shiftY = (WALL_ROWS - 1) - gy;
  for (const p of panels) {
    const sx = p.gx + shiftX, sy = p.gy + shiftY;
    if (sx < 0 || sx >= WALL_COLS || sy < 0 || sy >= WALL_ROWS) return null;
  }
  return { shiftX, shiftY };
}

// Applies a candidate's shift to every existing panel, then adds/moves one
// panel into the (already-shifted) target cell - the single code path
// both the "click an empty cell to add here" and "drop a dragged display
// here" handlers below funnel through, so a shifted placement behaves
// identically either way. `movingFrom`: null when adding a brand new
// display, or {gx,gy} (PRE-shift, i.e. as currently stored in
// currentState.panels) when repositioning an already-placed one instead.
function placeAtCandidate(candidate, movingFrom) {
  const { gx, gy, shiftX, shiftY } = candidate;
  const shifted = currentWallPanels()
    .filter((p) => !movingFrom || p.gx !== movingFrom.gx || p.gy !== movingFrom.gy)
    .map((p) => ({ gx: p.gx + shiftX, gy: p.gy + shiftY }));
  shifted.push({ gx: gx + shiftX, gy: gy + shiftY });
  // Deliberately does NOT clear _wallEditMode - a real report: edit mode
  // should stay open across a single add/move so you can place several
  // displays in a row, only closing when the toolbar button (or Escape/
  // click-outside) is pressed again.
  sendWallLayout(shifted);
}

function rebuildWallPreview() {
  updateWallLayoutButtonState();
  wallPreviewEl.innerHTML = '';
  for (const key in wallPanelCanvases) delete wallPanelCanvases[key];
  if (currentState.panelMode !== 'wall') return; // full grid only makes sense once wall mode is actually active - see wireWallToolbar()'s "+"  for how you get there
  const panels = currentState.panels || [];
  const occupied = new Set(panels.map((p) => p.gx + ',' + p.gy));

  // Candidate cells on all 4 sides of every placed panel. gx/gy are raw
  // (possibly negative) coordinates in the current unshifted layout so they
  // render in the right relative position; placing one may shift every panel
  // (see shiftForCandidate()/placeAtCandidate()). Only shown in layout edit
  // mode, otherwise they fill the whole grid once 2+ panels exist.
  const candidates = [];
  if (_wallEditMode) {
    const seenCandidate = new Set();
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const p of panels) {
      for (const [dx, dy] of DIRS) {
        const gx = p.gx + dx, gy = p.gy + dy;
        const key = gx + ',' + gy;
        if (occupied.has(key) || seenCandidate.has(key)) continue;
        seenCandidate.add(key);
        const shift = shiftForCandidate(panels, gx, gy);
        if (!shift) continue; // no room in that direction at all (e.g. both columns already full)
        // Adding is blocked once WALL_MAX_PANELS is already reached
        // (matches the server's own addPanel/setPanelPositions cap) - but
        // repositioning an EXISTING panel via drag doesn't change the
        // total count, so that stays allowed regardless.
        if (panels.length >= WALL_MAX_PANELS && !_wallDragFrom) continue;
        candidates.push({ gx, gy, shiftX: shift.shiftX, shiftY: shift.shiftY });
      }
    }
  }

  const allCells = [
    ...panels.map((p) => ({ ...p, filled: true })),
    // No "default"/suggested candidate anymore - a real report: don't
    // highlight a suggested square, just show every candidate as an equal
    // plain dotted outline.
    ...candidates.map((c) => ({ ...c, filled: false })),
  ];
  const minGx = Math.min(...allCells.map((c) => c.gx)), maxGx = Math.max(...allCells.map((c) => c.gx));
  const minGy = Math.min(...allCells.map((c) => c.gy)), maxGy = Math.max(...allCells.map((c) => c.gy));
  const cols = maxGx - minGx + 1, rows = maxGy - minGy + 1;
  const cellSize = wallCellSize(cols, rows);
  wallPreviewEl.style.width = (cols * cellSize) + 'px';
  wallPreviewEl.style.height = (rows * cellSize) + 'px';
  // Centre in the space beside an open desktop sidebar (see fitPanel2dCanvas()).
  wallPreviewEl.style.left = (sidebarOverlapPx() + (window.innerWidth - sidebarOverlapPx()) / 2) + 'px';
  wallPreviewEl.style.top = (sheetTopPx() / 2) + 'px';

  for (const c of allCells) {
    const { gx, gy, filled, shiftX, shiftY } = c;
    const idx = filled ? panels.findIndex((p) => p.gx === gx && p.gy === gy) : -1;
    const cell = document.createElement('div');
    cell.className = 'wall-cell ' + (filled ? 'filled' : 'empty');
    cell.style.left = ((gx - minGx) * cellSize) + 'px';
    cell.style.top = ((gy - minGy) * cellSize) + 'px';
    cell.style.width = (cellSize - 6) + 'px';
    cell.style.height = (cellSize - 6) + 'px';

    cell.addEventListener('dragover', (e) => { if (!filled) { e.preventDefault(); cell.classList.add('drop-target'); } });
    cell.addEventListener('dragleave', () => cell.classList.remove('drop-target'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('drop-target');
      if (!_wallDragFrom || filled) return; // only drop onto an empty candidate cell
      placeAtCandidate({ gx, gy, shiftX, shiftY }, _wallDragFrom);
      _wallDragFrom = null;
    });

    if (filled) {
      const canvas = document.createElement('canvas');
      canvas.width = PANEL2D_OUT; canvas.height = PANEL2D_OUT; // was 256: at 64x64 that is 4px per LED, too few for the round dots to read as round once scaled up
      canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.position = 'static';
      // Only draggable while layout editing is on - a real report: "don't
      // go to edit mode when tapping on the display. the button must be
      // pressed to go into edit mode" - draggable=false means the browser
      // never starts a drag gesture from this canvas at all outside edit
      // mode, and the mousedown guard below belt-and-suspenders that.
      canvas.draggable = _wallEditMode;
      // mousedown (fires before the native drag gesture actually starts,
      // unlike dragstart) is what shows candidate outlines - rebuilding
      // the WHOLE grid from inside dragstart itself would tear down and
      // recreate the very element mid-drag, risking Chromium canceling
      // the drag outright. By mousedown time nothing has started yet, so
      // the fresh candidate cells + a freshly-bound dragstart listener on
      // the recreated canvas are safely in place before the browser's
      // actual drag gesture begins.
      canvas.addEventListener('mousedown', () => {
        if (!_wallEditMode) return;
        _wallDragFrom = { gx, gy }; rebuildWallPreview();
      });
      canvas.addEventListener('dragstart', () => { _wallDragFrom = { gx, gy }; cell.classList.add('dragging'); });
      canvas.addEventListener('dragend', () => { _wallDragFrom = null; rebuildWallPreview(); });
      cell.appendChild(canvas);
      wallPanelCanvases[idx] = canvas.getContext('2d');

      // Only shown while actively editing (same gating as the candidate
      // outlines above) - a real report: "when I've finished adding
      // displays you need to remove the top right x and the space outline"
      // - both should disappear once you're done, not sit there
      // permanently. index 0 (primary) never gets one regardless.
      if (idx !== 0 && _wallEditMode) {
        const remove = document.createElement('span');
        remove.className = 'wall-remove';
        remove.textContent = '×';
        remove.title = 'Remove this display';
        remove.addEventListener('click', (e) => {
          e.stopPropagation();
          send({ cmd: 'removePanel', gx, gy });
        });
        cell.appendChild(remove);
      }
    } else {
      cell.title = 'Add a display here';
      cell.addEventListener('click', () => placeAtCandidate({ gx, gy, shiftX, shiftY }, null));
    }
    wallPreviewEl.appendChild(cell);
  }
}

// Wall per-panel bytes are plain row-major slices of core.wallBuf
// (encodeWallFrames(), wsServer.js _streamWallFrames(), and the hardware
// driver's _buildWallPanelBuffer() never flip v), so this must NOT flip v
// either, unlike drawPanel2dFrame(). A flip here would join the wrong rows
// at the seams of vertically stacked panels.
function drawWallPanelFrame(ctx, bytes) {
  drawLedGrid(ctx, bytes, currentState.panelSize, PANEL2D_OUT, false);
}

// 2D/wall frames are kept (latest per panel) and drawn once per display
// refresh in animate(), rather than immediately on arrival - a burst of
// frames no longer means a burst of redraws, and nothing is drawn at all
// while the tab is hidden (requestAnimationFrame pauses).
const pendingPanelFrames = new Map();
function flushPanelFrames() {
  if (!pendingPanelFrames.size) return;
  for (const [face, bytes] of pendingPanelFrames) {
    if (currentState.panelMode === '2d') { if (face === 0) drawPanel2dFrame(bytes); }
    else if (currentState.panelMode === 'wall') {
      const ctx = wallPanelCanvases[face]; // "face" byte is a panel index here, not a cube face
      if (ctx) drawWallPanelFrame(ctx, bytes);
    }
  }
  pendingPanelFrames.clear();
}

// Own loop, independent of animate() - that one only starts when WebGL is
// available, and the 2D/wall previews must keep drawing without it.
(function panelFrameLoop() {
  requestAnimationFrame(panelFrameLoop);
  flushPanelFrames();
})();

function handleFrame(buf) {
  if (document.body.classList.contains('cx-preview-off')) return;
  const bytes = new Uint8Array(buf);
  const face = bytes[0];
  cxNoteFrame(face, bytes);
  if (currentState.panelMode === '2d' || currentState.panelMode === 'wall') {
    pendingPanelFrames.set(face, bytes);
    return;
  }
  const entry = faceCanvases[face];
  if (!entry) return;
  const { mesh, size } = entry;
  for (let i = 0; i < size * size; i++) {
    const o = 1 + i * 3;
    _frameColor.setRGB(bytes[o] / 255, bytes[o + 1] / 255, bytes[o + 2] / 255);
    mesh.setColorAt(i, _frameColor);
  }
  mesh.instanceColor.needsUpdate = true;
}

