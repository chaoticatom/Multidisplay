// ═══════════════════════════════════════════════════
//  GLOBALS
// ═══════════════════════════════════════════════════
const TOTAL_SPAN = 63;   // constant world size
const DIM_BASE   = 0.020;

let SIZE = 64, N = 0, SPACING, HALF;

// Per-LED arrays (length = N, surface LEDs only)
let gridX, gridY, gridZ;   // integer coords, Uint8Array
let surfX, surfY, surfZ;   // normalised 0..1, Float32Array
let edgeFloorR, edgeFloorG, edgeFloorB;
// faceMap[f] : Int32Array length SIZE*SIZE, value = LED index or -1
// Faces: 0=front(z=max) 1=back(z=0) 2=right(x=max) 3=left(x=0) 4=top(y=max) 5=bottom(y=0)
let faceMap;
let faceMembership;   // Uint8Array — bitmask of which faces each LED belongs to
let origMatArray;     // Float32Array snapshot of original (unscaled) instance matrices
let panelMeshes = []; // solid opaque backing panels, one per face
let edgeLines;        // THREE.LineSegments along the 12 cube edges
let lastVisMask = -1; // cached face-visibility bitmask

// Outward normals for each face in cube-local space
const FACE_NORMALS = [
  new THREE.Vector3( 0, 0, 1), // 0 front  (z=max)
  new THREE.Vector3( 0, 0,-1), // 1 back   (z=0)
  new THREE.Vector3( 1, 0, 0), // 2 right  (x=max)
  new THREE.Vector3(-1, 0, 0), // 3 left   (x=0)
  new THREE.Vector3( 0, 1, 0), // 4 top    (y=max)
  new THREE.Vector3( 0,-1, 0), // 5 bottom (y=0)
];
const _camDir  = new THREE.Vector3();
const _fNorm   = new THREE.Vector3();

function getVisibleFaceMask() {
  _camDir.copy(camera.position).normalize(); // world-space dir from cube to camera
  const q = pivotGroup.quaternion;
  let mask = 0;
  for (let f = 0; f < 6; f++) {
    _fNorm.copy(FACE_NORMALS[f]).applyQuaternion(q);
    if (_fNorm.dot(_camDir) > 0) mask |= (1 << f);
  }
  return mask;
}

let mesh, colBuf;
const dummy = new THREE.Object3D();

// ═══════════════════════════════════════════════════
//  RENDERER / SCENE
// ═══════════════════════════════════════════════════
const canvas = document.getElementById('c');
const wrap   = document.getElementById('canvas-wrap');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000308);

const scene  = new THREE.Scene();
scene.fog    = new THREE.FogExp2(0x000308, 0.0012);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 3000);
camera.position.set(100, 100, 100); // isometric view, zoomed in
camera.lookAt(0, 0, 0);

function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  fitCameraToScene(w, h);
  fitPanel2d();
}

function fitCameraToScene(w, h) {
  const fov = camera.fov * Math.PI / 180;
  const cubeRadius = TOTAL_SPAN * 0.82;
  const buffer = window.innerWidth > 768 ? 1.45 : 1.15;
  const distV = (cubeRadius * buffer) / Math.tan(fov / 2);
  const distH = (cubeRadius * buffer) / (Math.tan(fov / 2) * (w / h));
  const dist = Math.max(distV, distH);
  const len = camera.position.length();
  if (len > 0) camera.position.multiplyScalar(dist / len);
}

function fitPanel2d() {
  const c = document.getElementById('panel2d-canvas');
  if (!c) return;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const buf = 20;
  const size = Math.min(w - buf * 2, h - buf * 2);
  c.style.width = size + 'px';
  c.style.height = size + 'px';
}
resize();
window.addEventListener('resize', resize);
// Re-trigger after fonts/layout settle
setTimeout(resize, 100);
setTimeout(resize, 500);

// ═══════════════════════════════════════════════════
//  MENU TOGGLE
// ═══════════════════════════════════════════════════
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');

let menuOpen = window.innerWidth > 768;

function updateSidebarOverlay() {
  if (!sidebarOverlay) return;
  const isSmall = window.innerWidth <= 768;
  sidebarOverlay.style.display = (isSmall && menuOpen) ? 'block' : 'none';
}

function updateMenuToggleButton() {
  const isSmall = window.innerWidth <= 768;
  menuToggle.classList.toggle('show', isSmall);
  if (isSmall) {
    if (!menuOpen) sidebar.classList.remove('open');
  } else {
    sidebar.classList.remove('open');
    sidebar.classList.remove('hidden');
    menuOpen = true;
  }
  updateSidebarOverlay();
  resize();
}

function toggleMenu() {
  menuOpen = !menuOpen;
  const isSmall = window.innerWidth <= 768;
  if (isSmall) {
    sidebar.classList.toggle('open', menuOpen);
  } else {
    sidebar.classList.toggle('hidden', !menuOpen);
    const openBtn = document.getElementById('sidebar-open-btn');
    if (openBtn) openBtn.classList.toggle('show', !menuOpen);
  }
  menuToggle.textContent = menuOpen ? '✕' : '☰';
  updateSidebarOverlay();
  setTimeout(resize, 550);
}

menuToggle.addEventListener('click', toggleMenu);

// Dedicated overlay closes the menu on mobile (more reliable than canvas click).
if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', () => {
    if (menuOpen) toggleMenu();
  });
}

window.addEventListener('resize', updateMenuToggleButton);
// Initialize: on mobile start with sidebar closed, show hamburger
if (window.innerWidth <= 768) {
  menuOpen = false;
  menuToggle.textContent = '☰';
  menuToggle.classList.add('show');
} else {
  menuOpen = true;
}
updateMenuToggleButton();

const pivotGroup = new THREE.Group();
scene.add(pivotGroup);

// ═══════════════════════════════════════════════════
//  CUBE INIT — surface LEDs only
// ═══════════════════════════════════════════════════
// 12-edge box bars at panel join seams
function createEdgeLines() {
  if (edgeLines) { pivotGroup.remove(edgeLines); edgeLines.traverse(o=>{ if(o.geometry)o.geometry.dispose(); }); }

  const GAP = SPACING * 0.55;           // clear gap between outermost LED and bar
  const T   = TOTAL_SPAN * 0.005;       // bar thickness — constant visual weight
  const H   = HALF + GAP + T * 0.5;    // bar centre position on each constrained axis
  const L   = (H + T * 0.5) * 2;       // bar length — overshoots corners for clean joins
  const mat = new THREE.MeshBasicMaterial({ color: 0x99ddff });
  const grp = new THREE.Group();

  const bar = (w,h,d, x,y,z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y,z); grp.add(m);
  };

  // 4 X-parallel bars
  bar(L,T,T,  0, H, H);  bar(L,T,T,  0, H,-H);
  bar(L,T,T,  0,-H, H);  bar(L,T,T,  0,-H,-H);
  // 4 Y-parallel bars
  bar(T,L,T,  H, 0, H);  bar(T,L,T,  H, 0,-H);
  bar(T,L,T, -H, 0, H);  bar(T,L,T, -H, 0,-H);
  // 4 Z-parallel bars
  bar(T,T,L,  H, H, 0);  bar(T,T,L,  H,-H, 0);
  bar(T,T,L, -H, H, 0);  bar(T,T,L, -H,-H, 0);

  pivotGroup.add(grp);
  edgeLines = grp;
}

// Solid opaque backing panel behind each face — fills the gaps between LEDs
function createPanels() {
  for (const p of panelMeshes) { pivotGroup.remove(p); p.geometry.dispose(); }
  panelMeshes = [];

  const span   = TOTAL_SPAN + SPACING * 1.2; // slightly wider than LED array
  const offset = SPACING * 0.55;             // placed just behind LED sphere centres
  const geo    = new THREE.PlaneGeometry(span, span);
  const mat    = new THREE.MeshBasicMaterial({ color: 0x06060e, side: THREE.FrontSide });
  const H = HALF;

  // [posX, posY, posZ,  rotX, rotY, rotZ]
  const cfg = [
    [ 0,  0,  H-offset,   0,           0,       0],  // front
    [ 0,  0, -H+offset,   0,     Math.PI,       0],  // back
    [ H-offset,  0,  0,   0,  Math.PI/2,        0],  // right
    [-H+offset,  0,  0,   0, -Math.PI/2,        0],  // left
    [ 0,  H-offset,  0,  -Math.PI/2,    0,      0],  // top
    [ 0, -H+offset,  0,   Math.PI/2,    0,      0],  // bottom
  ];
  for (const [px,py,pz, rx,ry,rz] of cfg) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.rotation.set(rx, ry, rz);
    pivotGroup.add(m);
    panelMeshes.push(m);
  }
}

function initCube(newSize) {
  if (mesh) {
    pivotGroup.remove(mesh);
    mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); mesh = null;
  }
  SIZE    = newSize;
  SPACING = TOTAL_SPAN / (SIZE - 1);
  HALF    = TOTAL_SPAN * 0.5;

  // Collect surface positions (where ≥1 coord is at boundary)
  const gx = [], gy = [], gz = [];
  for (let z = 0; z < SIZE; z++)
  for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE; x++) {
    if (x===0 || x===SIZE-1 || y===0 || y===SIZE-1 || z===0 || z===SIZE-1) {
      gx.push(x); gy.push(y); gz.push(z);
    }
  }
  N     = gx.length;
  gridX = new Uint8Array(gx); gridY = new Uint8Array(gy); gridZ = new Uint8Array(gz);
  surfX = new Float32Array(N); surfY = new Float32Array(N); surfZ = new Float32Array(N);
  const invS = 1 / (SIZE - 1);
  for (let i = 0; i < N; i++) {
    surfX[i] = gridX[i] * invS;
    surfY[i] = gridY[i] * invS;
    surfZ[i] = gridZ[i] * invS;
  }

  // Build face maps — each face is SIZE×SIZE, value = LED index or -1
  faceMap = Array.from({length: 6}, () => new Int32Array(SIZE * SIZE).fill(-1));
  for (let i = 0; i < N; i++) {
    const x = gridX[i], y = gridY[i], z = gridZ[i];
    if (z === SIZE-1) faceMap[0][y * SIZE + x] = i; // front
    if (z === 0)      faceMap[1][y * SIZE + (SIZE-1-x)] = i; // back (mirrored so it reads correctly from behind)
    if (x === SIZE-1) faceMap[2][y * SIZE + (SIZE-1-z)] = i; // right (mirrored so it reads correctly from the side)
    if (x === 0)      faceMap[3][y * SIZE + z] = i; // left
    if (y === SIZE-1) faceMap[4][z * SIZE + x] = i; // top
    if (y === 0)      faceMap[5][z * SIZE + x] = i; // bottom
  }

  // Precompute edge/corner floor colours; face surface gets DIM_BASE; interior not in N
  edgeFloorR = new Float32Array(N);
  edgeFloorG = new Float32Array(N);
  edgeFloorB = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x=gridX[i], y=gridY[i], z=gridZ[i];
    const bx=(x===0||x===SIZE-1), by=(y===0||y===SIZE-1), bz=(z===0||z===SIZE-1);
    const n = (bx?1:0)+(by?1:0)+(bz?1:0);
    edgeFloorR[i]=edgeFloorG[i]=edgeFloorB[i]=DIM_BASE; // uniform ghost; edges handled by LineSegments
  }

  // Face membership bitmask per LED (mirrors faceMap logic)
  faceMembership = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const x=gridX[i], y=gridY[i], z=gridZ[i];
    if (z===SIZE-1) faceMembership[i] |= 1;
    if (z===0)      faceMembership[i] |= 2;
    if (x===SIZE-1) faceMembership[i] |= 4;
    if (x===0)      faceMembership[i] |= 8;
    if (y===SIZE-1) faceMembership[i] |= 16;
    if (y===0)      faceMembership[i] |= 32;
  }

  // Instanced mesh
  const segs = SIZE <= 8 ? 7 : SIZE <= 16 ? 6 : 5;
  const geo  = new THREE.SphereGeometry(SPACING * 0.44, segs, segs - 1);
  const mat  = new THREE.MeshBasicMaterial();
  if (typeof brightness !== 'undefined') mat.color.setScalar(brightness);
  mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(0));
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  colBuf = mesh.instanceColor.array;

  for (let i = 0; i < N; i++) {
    dummy.position.set(gridX[i]*SPACING-HALF, gridY[i]*SPACING-HALF, gridZ[i]*SPACING-HALF);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  origMatArray = new Float32Array(mesh.instanceMatrix.array); // snapshot original matrices
  lastVisMask  = -1; // force matrix refresh on next frame
  pivotGroup.add(mesh);
  createPanels();
  createEdgeLines();

  // Init colours from floor
  for (let i = 0; i < N; i++) {
    colBuf[i*3]=edgeFloorR[i]; colBuf[i*3+1]=edgeFloorG[i]; colBuf[i*3+2]=edgeFloorB[i];
  }
  mesh.instanceColor.needsUpdate = true;

  document.getElementById('cube-label').innerHTML = `${SIZE}<sup>3</sup>`;
  const total = N.toLocaleString();
  document.getElementById('led-count-label').innerHTML = `${SIZE}<sup>3</sup> · ${total} surface LEDs`;

  fwParticles.length = 0;
  resetRain(); resetBalls(); resetSand();
  mazeOpen = null; auRings.length = 0; tronTrail = null;
  warpStars=[]; lifeGrid=null; fluidH=null; lightningBolts=[];
  auroraStar=null; nebStars=null; ballFlashes=[];
  t = 0;
}

// ═══════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════
function setLED(i, r, g, b) {
  colBuf[i*3]=r; colBuf[i*3+1]=g; colBuf[i*3+2]=b;
}
function setFaceLED(face, u, v, r, g, b) {
  if (u<0||u>=SIZE||v<0||v>=SIZE) return;
  const i = faceMap[face][v*SIZE+u];
  if (i>=0) setLED(i,r,g,b);
}

function hsl(h, s, l) {
  h = ((h%1)+1)%1;
  if (s===0) return [l,l,l];
  const q = l<0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  const hf = (p,q,t) => { if(t<0)t+=1;if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<0.5)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
  return [hf(p,q,h+1/3), hf(p,q,h), hf(p,q,h-1/3)];
}
function lerp(a,b,t){return a+(b-a)*t;}
function sm(e0,e1,x){const t=Math.max(0,Math.min(1,(x-e0)/(e1-e0)));return t*t*(3-2*t);}

// ═══════════════════════════════════════════════════
//  ORBIT
// ═══════════════════════════════════════════════════
let isDragging=false, lastX=0, lastY=0, autoRotate=true;
let rotateYOnly = false;
let autoRotY = 0; // accumulated Y rotation for auto-rotate
let _qRot = new THREE.Quaternion();
const _qDelta = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0,1,0);
const _xAxis = new THREE.Vector3(1,0,0);
const _zAxis = new THREE.Vector3(0,0,1);

// Init rotation: isometric view showing front, left, and top panels
_qRot.setFromAxisAngle(_yAxis, 0.5);
_qDelta.setFromAxisAngle(_xAxis, -0.6);
_qRot.multiplyQuaternions(_qDelta, _qRot);
pivotGroup.quaternion.copy(_qRot);

// Y-axis only rotation toggle
document.getElementById('rotate-y-only')?.addEventListener('change', e => {
  rotateYOnly = e.target.checked;
});

let gyroEnabled=false, gyroGX=0, gyroGY=-1, gyroGZ=0;
const _gravWorld=new THREE.Vector3(0,-1,0);
const _gravLocal=new THREE.Vector3();
const _invQ=new THREE.Quaternion();
function getLocalGravity(magnitude) {
  if(gyroEnabled) return {x:gyroGX*magnitude, y:gyroGY*magnitude, z:gyroGZ*magnitude};
  _invQ.copy(pivotGroup.quaternion).invert();
  _gravLocal.copy(_gravWorld).applyQuaternion(_invQ).multiplyScalar(magnitude);
  return _gravLocal;
}

const DRAG_SENS = 0.007;
const TOUCH_SENS = 0.009;
let _velX = 0, _velY = 0;
const INERTIA_DECAY = 0.88;
const INERTIA_MIN = 0.0003;

function applyRotation(dx, dy, sens) {
  if (rotateYOnly) {
    _qDelta.setFromAxisAngle(_zAxis, -dx * sens);
  } else {
    _qDelta.setFromAxisAngle(_yAxis, dx * sens);
  }
  _qRot.multiplyQuaternions(_qDelta, _qRot);
  if (!rotateYOnly) {
    _qDelta.setFromAxisAngle(_xAxis, dy * sens);
    _qRot.multiplyQuaternions(_qDelta, _qRot);
  }
  pivotGroup.quaternion.copy(_qRot);
}

function tickInertia() {
  if (isDragging || (Math.abs(_velX) < INERTIA_MIN && Math.abs(_velY) < INERTIA_MIN)) {
    _velX = _velY = 0;
    return;
  }
  applyRotation(_velX * 60, _velY * 60, DRAG_SENS);
  _velX *= INERTIA_DECAY;
  _velY *= INERTIA_DECAY;
  requestAnimationFrame(tickInertia);
}

function isNearCube(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const mx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const my = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera({x: mx, y: my}, camera);
  return _raycaster.intersectObjects(panelMeshes).length > 0;
}

wrap.addEventListener('mousedown', e=>{
  if(!isNearCube(e.clientX, e.clientY)) return;
  isDragging=true;autoRotate=false;_velX=_velY=0;const c=document.getElementById('auto-rotate-chk');if(c)c.checked=false;lastX=e.clientX;lastY=e.clientY;
});
window.addEventListener('mousemove', e=>{
  if(!isDragging)return;
  const dx=e.clientX-lastX, dy=e.clientY-lastY;
  lastX=e.clientX;lastY=e.clientY;
  _velX = dx * 0.015;
  _velY = dy * 0.015;
  applyRotation(dx, dy, DRAG_SENS);
});
window.addEventListener('mouseup',()=>{if(isDragging){isDragging=false;requestAnimationFrame(tickInertia);}});
wrap.addEventListener('touchstart',e=>{
  if(!e.touches.length || !isNearCube(e.touches[0].clientX, e.touches[0].clientY)) return;
  isDragging=true;autoRotate=false;_velX=_velY=0;const c=document.getElementById('auto-rotate-chk');if(c)c.checked=false;lastX=e.touches[0].clientX;lastY=e.touches[0].clientY;
},{passive:true});
wrap.addEventListener('touchmove',e=>{
  if(!isDragging||!e.touches.length)return;
  const dx=e.touches[0].clientX-lastX, dy=e.touches[0].clientY-lastY;
  lastX=e.touches[0].clientX;lastY=e.touches[0].clientY;
  _velX = dx * 0.015;
  _velY = dy * 0.015;
  applyRotation(dx, dy, TOUCH_SENS);
},{passive:true});
wrap.addEventListener('touchend',()=>{if(isDragging){isDragging=false;requestAnimationFrame(tickInertia);}});
wrap.addEventListener('wheel',e=>{ camera.position.multiplyScalar(1+e.deltaY*0.001); },{passive:true});

// ── Tap-to-snap: click/tap a face to rotate it front-on ──
const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();
let _snapAnimating = false;
let _tapDownX = 0, _tapDownY = 0, _tapDownTime = 0;

const FACE_QUATS = [
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI/2, 0)),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI/2, 0)),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2, 0, 0)),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2, 0, 0)),
];

function snapToFace(faceIdx) {
  if (_snapAnimating) return;
  const target = FACE_QUATS[faceIdx].clone();
  const start = _qRot.clone();
  _snapAnimating = true;
  _velX = _velY = 0;
  autoRotate = false;
  const c = document.getElementById('auto-rotate-chk');
  if (c) c.checked = false;
  const duration = 400;
  const t0 = performance.now();
  function tick(now) {
    let p = Math.min(1, (now - t0) / duration);
    p = p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p+2,3)/2;
    _qRot.copy(start).slerp(target, p);
    pivotGroup.quaternion.copy(_qRot);
    if (p < 1) requestAnimationFrame(tick);
    else _snapAnimating = false;
  }
  requestAnimationFrame(tick);
}

function handleTapSnap(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  _mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_mouse, camera);
  const hits = _raycaster.intersectObjects(panelMeshes);
  if (hits.length > 0) {
    const idx = panelMeshes.indexOf(hits[0].object);
    if (idx >= 0) snapToFace(idx);
  }
}

wrap.addEventListener('mousedown', e => { _tapDownX = e.clientX; _tapDownY = e.clientY; _tapDownTime = performance.now(); });
wrap.addEventListener('mouseup', e => {
  const dx = Math.abs(e.clientX - _tapDownX), dy = Math.abs(e.clientY - _tapDownY);
  if (dx < 5 && dy < 5 && (performance.now() - _tapDownTime) < 300) {
    handleTapSnap(e.clientX, e.clientY);
  }
});
wrap.addEventListener('touchstart', e => {
  if (e.touches.length === 1) { _tapDownX = e.touches[0].clientX; _tapDownY = e.touches[0].clientY; _tapDownTime = performance.now(); }
}, {passive: true});
wrap.addEventListener('touchend', e => {
  if (e.changedTouches.length === 1) {
    const t = e.changedTouches[0];
    const dx = Math.abs(t.clientX - _tapDownX), dy = Math.abs(t.clientY - _tapDownY);
    if (dx < 10 && dy < 10 && (performance.now() - _tapDownTime) < 300) {
      handleTapSnap(t.clientX, t.clientY);
    }
  }
});

// ═══════════════════════════════════════════════════
//  EFFECTS — all iterate surface LEDs only
// ═══════════════════════════════════════════════════
let t = 0;
