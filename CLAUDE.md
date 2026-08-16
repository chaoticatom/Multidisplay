# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**The ESP32+browser architecture described in most of this file is retired.** The project now runs on `pi-native/` - a Node.js app running directly on a Raspberry Pi, computing effects server-side and driving HUB75 panels via `rpi-led-matrix` (see the "Pi-native architecture" section below, and `pi-native/README.md`). The rest of this document (firmware/, build.sh, cube.js/ui.js/effects-*.js at the repo root, the WebSocket-to-ESP32 pipeline) is kept as historical reference for now, not current guidance - don't build against it.

Multidisplay is a 6-face RGB LED cube (64×64 per face). Originally: a browser-based Three.js simulator streaming pixel frames over WebSocket to an ESP32-S3 driving HUB75 panels via DMA at 20 fps, with the browser computing all effects in JavaScript. Now: pi-native computes effects and drives the panels directly from the Pi, with a thin browser control/preview UI (`pi-native/public/`) talking to it over WebSocket.

**Live demo**: https://chaoticatom.github.io/Multidisplay/ - a browser-native build of the pi-native effect engine (bundled via `pi-native/sim/`, see `pi-native/sim/README.md`), running standalone with no Pi or server behind it. This is NOT the ESP32-architecture simulator that used to be deployed at this URL from the repo-root `index.html`/`ui.js`/`effects-*.js` files - those were removed when this took over the URL (see git history before that commit if you need them).

## Development

No build step for the web app. Edit JS/CSS/HTML, reload the page.

```bash
# Local dev server
python3 -m http.server 8080
# Then open http://localhost:8080 (WebSocket streaming to hardware auto-disables on localhost)

# Firmware build (PlatformIO)
cd firmware && pio run                      # compile only
cd firmware && pio run --target upload      # compile + flash over USB (initial flash)
cd firmware && pio run --target buildfs     # build LittleFS image from ./data/
cd firmware && pio run --target uploadfs    # flash LittleFS image over USB
cd firmware && pio device monitor           # serial monitor, 115200 baud

# Bundle web assets for ESP32 LittleFS
./build.sh    # downloads three.js, gzips all assets into ./data/

# OTA updates (after initial flash, no USB needed)
# Browse to http://multidisplay.local/loader, drag-drop firmware.bin or littlefs.bin
```

No test suite or linter is configured (`package.json` only lists `playwright` as a dependency; no test files exist).

## Version Bumping

Every change requires updating `index.html` (there is no service-worker precache step — see PWA note below): bump the inline `const APP_VERSION = '...'` near the bottom of `<body>`, and every `?v=` param inside the `appScripts` array (`cube.js`, `effects-core.js`, `ui.js`). The 7 lazy-loaded `effects-*.js` category files aren't listed in `appScripts` — they're cache-busted at runtime via `getLazyCategoryStub()`'s `cat.file+'?v='+APP_VERSION`, so bumping `APP_VERSION` alone is enough to bust them too.

`style.css` and `version.js` used to be separate files but are now inlined directly into `index.html` (a `<style>` block and an inline `<script>` setting `APP_VERSION`) — this cuts 2 of the concurrent connections a browser opens on first page load, which mattered on the ESP32's very tight (~16-20KB, no working PSRAM) heap. Don't re-extract them into external files without re-checking that heap budget.

### PWA / service worker is retired

`sw.js` and `service-worker.js` are both intentionally reduced to self-destruct stubs (unregister themselves, clear all caches) — they caused more stuck-version problems than they solved. `index.html` only calls `getRegistrations()` to unregister leftovers; it does not register a new one. Do not reintroduce a precaching service worker without discussing it — the version-bump-and-reload model this app uses depends on there being no cache layer between the browser and the server.

## Architecture

### Rendering Pipeline

```
Effect function → setLED(i, r, g, b) → colBuf (Float32Array, RGB 0-1)
  ├→ Three.js InstancedMesh (browser, 60fps)
  └→ streamFrameToCube() → WebSocket binary [PKT_VIDEO=2, faceID, S×S×3 RGB888]
       → ESP32 g_frameBuf → displayTask (Core 0, 20fps) → HUB75 DMA → physical LEDs
```

`colBuf` is a direct reference to `mesh.instanceColor.array` — writes go straight to the GPU texture. The float-to-uint8 conversion happens only at WebSocket streaming time.

### Key Globals (cube.js)

- `SIZE` (8/16/64), `N` (total surface LEDs), `SPACING`, `HALF`
- `colBuf` — Float32Array, N×3, the pixel buffer everything writes to
- `faceMap[face][v*SIZE+u]` — maps face pixel coords to LED index (-1 if none)
- `surfX/Y/Z[i]` — normalized 0-1 coords for smooth 3D patterns
- `mesh` — Three.js InstancedMesh
- Faces: 0=Front(z=max), 1=Back(z=0), 2=Right(x=max), 3=Left(x=0), 4=Top(y=max), 5=Bottom(y=0)
- faceMap bakes horizontal flip for faces 1 and 2

### Key Globals (ui.js)

- `currentEffect` — active effect key string
- `brightness` — master brightness 0-1.5; 3D cube uses `mesh.material.color.setScalar(brightness)`
- `speedMult` — effect speed multiplier
- `EFFECTS` — map of effect key → function (~line 1267)
- `EFFECT_NAMES` — map of effect key → display name (~line 1294)
- `OV` — overlay enable flags and params; `runOverlays(dt)` processes all enabled overlays
- `perFaceEffect[0-5]` — per-face effect assignment `{effect, overlayKeys:[], opts:{}}`
- `activeAlarm` — current timer state `{al, phase:'pre'|'main'|'done', startMs, ...}`

### Animation Loop (ui.js `animate()`, ~line 3099)

Each frame: FPS counter → playlist advance → alarm check → alarm phase rendering → main effect execution → overlay application → floor brightness → backface culling → Three.js render → WebSocket stream.

### File Load Order

`APP_VERSION` is set by an inline `<script>` in `index.html` (no longer a separate `version.js` fetch) → `three.min.js` (local, CDN fallback) → then `index.html`'s inline loader sequentially injects `cube.js` → `effects-core.js` → `ui.js` (each with a `?v=APP_VERSION` cache-bust) once `THREE` is confirmed available. The other seven `effects-*.js` category files (below) are NOT part of this eager sequence — each is injected on demand, the first time an effect in that category is invoked.

## Writing Effects

Effect functions used to all live in one 15k-line `effects.js`, loaded eagerly on every page load. That file has been split into 8 files to cut how much JS a first-time visitor has to download before anything renders:

- **`effects-core.js`** — eager-loaded, part of the normal `appScripts` sequence, always available. Holds genuinely shared infrastructure used across multiple categories: the overlay engine (`OV`, all `ov*` functions, `OV_FUNCS`, `applyFaceOverlays`, `runOverlays`), the gallery-slideshow shared engine (`galleryInitFaceState`/`gallerySlideshowStep`/`galleryApplyToFace`/`galleryApplyBlendToFace`), the word-cascade text engine (`WC_FONT`, `wcInit`/`wcStep`/`wcDrawToFace`/`wcDrawGlyph`/`wcTagQA`), `loadImageForPixels()`, the audio/spectrum-analyser + internet radio subsystem (all `au*`/mic/phone globals, `drawSpectrumOverlay`, `RADIO_STATIONS`, `radio*` functions, `effectRadio` itself), and a handful of helpers that turned out to be used by more than one category (`cubePx`/`fwPx`/`FW_FACES`, `tronMove`, `surfIdx`, `VID_FACE_ORDER`, the fireworks-text builder, the panel-editor `_peTarget*` vars, `DT_RES`).
- **`effects-motion.js`** (lazy) — wave, rain, plasma, sphere, dna, nebula, aurora, warp, lightning, lightspeed
- **`effects-physics.js`** (lazy) — balls, sand, life, fluid, fireworks, strobe
- **`effects-colour.js`** (lazy) — gradient_wash, depth_rings, prism, tide
- **`effects-livedata.js`** (lazy) — weather, moon, datetime, neo, apod, unsplash, artic, joke, otd, trivia, epic, iss, cam
- **`effects-games.js`** (lazy) — maze, tron, retro, coinflip, dice, random, random80s
- **`effects-scenes.js`** (lazy) — ghost, custom_cube
- **`effects-media.js`** (lazy) — video (radio lives in `effects-core.js`, not here, since radio playback and the spectrum overlay are tightly coupled and the overlay runs unconditionally from core's `runOverlays`)

The 7 non-core files load lazily: in `ui.js`, every key in a lazy category maps in the `EFFECTS` object to a shared stub built by `getLazyCategoryStub(catName)` (see `LAZY_CATEGORIES` in `ui.js`, just above the `EFFECTS` map). The first time any effect in that category is invoked, the stub injects `<script src="effects-CATEGORY.js?v=APP_VERSION">`; once it loads, every key in that category's `EFFECTS` entry is swapped for the real function and the currently-selected effect is invoked immediately (so the first frame after load isn't blank). A second invocation while still loading is a no-op, not an error. Because these are classic `<script>` tags sharing one global scope, anything a lazy file's effect needs from outside its own file must already exist in `effects-core.js` (loaded before all of them) — never assume another lazy category file happens to be loaded first.

Registration requires three steps:
1. Add the function to the correct `effects-*.js` file (or `effects-core.js` if it's shared infrastructure)
2. Add to `EFFECTS` (via `getLazyCategoryStub('category')`, or `getLazyCategoryStub` + a new entry in `LAZY_CATEGORIES` if it's a new category) and `EFFECT_NAMES` maps in `ui.js`
3. Add button in `index.html`: `<button class="effect-btn" data-effect="key">Name</button>`

Use `setLED(i, r, g, b)` for coordinate-based patterns (iterate `surfX/Y/Z`), or `faceMap[face][v*SIZE+u]` for pixel-precise face rendering. Pre-allocate state arrays at module level with lazy init guards.

Effects read UI controls directly via `document.getElementById()` inside the effect function — no event listener wiring needed.

### Shared engines — reuse these instead of reimplementing per effect

Several visual patterns recur across effects and have been factored into shared helpers in `effects-core.js`. When adding an effect that fits one of these shapes, wrap the shared engine rather than copy-pasting an existing effect's version of it (this has happened twice already and both times got unified later):

- **Photo-gallery slideshow** (Unsplash, Art Gallery): `galleryInitFaceState(n, periodSecs)` sets up per-face staggered timing state; `gallerySlideshowStep(state, n, dt, periodSecs, fadeDur, slideshowOn, loadFn, pixelsArr)` advances one face's cycle/crossfade per frame; `galleryApplyToFace`/`galleryApplyBlendToFace` do the actual pixel blit/crossfade given generic `pixelsArr`/`sizesArr` arrays. Each face cycles on the same period but offset by `period/6` and crossfades over `fadeDur` seconds instead of cutting.
- **Word-cascade text** (Jokes, Trivia, On This Day, Date & Time's Words mode): `WC_FONT` (4-wide × 7-tall bitmap font), `WC_CHAR_W`/`WC_LINE_H`, `wcInit(taggedWords)`/`wcStep(state, dt)`/`wcDrawToFace(state, face)`/`wcDrawGlyph(face, ch, su, sv, rgb)`, and `wcTagQA(text)` (splits a question/answer string into per-word color tags). Any "words appear staggered with per-word timing" effect should reuse this rather than hand-rolling text layout.
- **Image loading** (`loadImageForPixels()` in `effects-core.js`): 4-tier fallback — direct fetch→blob, direct `<img crossOrigin>`, proxy fetch→blob (images.weserv.nl), proxy `<img>`. Some CDNs (e.g. Art Institute of Chicago's IIIF server) block all four tiers via hotlink/referrer protection with no client-side workaround — if every strategy fails for a given host, the fix is switching data source, not adding a 5th strategy.

## Submenu / shared-controls UI pattern

The "Art" and "Trivia & Facts" sidebar entries are submenus grouping several related effects (e.g. APOD/Unsplash/Art Gallery) with one shared controls block, not three separate ones. The pattern: a `.sub-section.collapsed` wrapping a `.sub-head.sub-head-boxed` header (styled and sized identically to a regular `.effect-btn`, with the same `.panel-arrow` rotate-on-open behavior) and a `.sub-body` containing the child effect buttons. Shared controls that must stay visible regardless of which child effect is open go in a `.art-shared-panel` div — **not** `.effect-panel` — because the effect-button click handler does `document.querySelectorAll('.effect-panel').forEach(p=>p.classList.remove('open'))`, which would strip a shared panel reusing that class too.

## Overlays

13 overlays (stars, snow, meteors, edgeglow, fire, sparkle, colorwave, pulse, scanline, vignette, glitch, mist, lightning) defined in `effects-core.js`. Each has an `OV[key].on` flag. They blend onto colBuf after the main effect via `runOverlays(dt)`. UI uses `.ov-toggle`/`.ov-slider` CSS classes for pill-shaped slide toggles.

## Timer System (ui.js, lines ~286-1016)

Timers (formerly "alarms") support Alarm and Wind Down modes with collapsible dropdown headers. Wind down triggers AT alarm time and dims forward. `activeAlarm.phase` tracks state: `'pre'` (counting), `'main'` (firing), `'done'` (blanked). Timer editor uses hidden inputs for alarm/wind-down selection, `.ov-toggle` slide switches for all checkboxes.

## F1 Subsystem (f1-state.js, f1.js, f1-providers.js)

Three files with a strict separation of concerns — don't blur them:

- **`f1-state.js`** defines the single source of truth, `F1State` (session, drivers, track, weather, connection status). `f1Update(partial)` deep-merges into it and fires a `f1-state-change` DOM event; nothing should mutate `F1State` directly.
- **`f1-providers.js`** owns all networking, behind `F1Providers.esp32` / `.openf1` / `.simulation`. Exactly one is active at a time via `f1SetMode(mode)`; each writes into `F1State` via `f1Update()` and never touches rendering.
- **`f1.js`** (`effectF1(dt)`) only ever *reads* `F1State` — it never fetches anything. It renders leaderboard, weather, track outline, and flag overlays onto cube faces via `faceMap`.

`F1Providers.esp32` polls `/api/session`, `/api/drivers`, `/api/flags`, `/api/weather` on the ESP32 every 5s. `F1Providers.openf1` polls `api.openf1.org` directly from the browser (standalone/GitHub-Pages mode) and is rate-limited — see the next section, since it's the pattern to copy for any new external-API effect. `F1Providers.simulation` drives `F1State` from the sidebar's dev-tools buttons for demoing without a live session.

The F1 sidebar panel's collapsible "▸ Diagnostics" section (`_f1UpdateDiag()` in `ui.js`) surfaces `F1State.connectionError` — check there first (not just the connection dot) when live data looks stuck, since the error string carries the actual HTTP status/endpoint that failed.

### External API resilience pattern (copy this for new API-backed effects)

`f1-providers.js`'s `f1Fetch()` is the reference implementation for talking to a rate-limited free API:
- A token-bucket rate limiter gates every request under the provider's documented ceiling (proactive throttling, not reactive)
- A CORS-proxy retry (`corsproxy.io`) on raw network failure (`TypeError: Failed to fetch`), which is distinct from an HTTP error response
- 403/429 responses get a much longer cooldown than a generic failure — hammering an active rate-limit block just prolongs it
- Failures are surfaced into `F1State.connectionError` with enough detail (endpoint + status) to diagnose from the UI — never collapse a failure into a bare "error" state

## Firmware (ESP32-S3)

- `config.h` — pin assignments, `PANEL_SIZE=64`, `NUM_FACES=6`, `WS_PORT=81`, `PKT_VIDEO=2`, `PKT_CMD=1`
- `main.cpp` — PSRAM frame buffers, `displayTask` (Core 0, 20fps DMA output), `statusLedTask` (Core 1)
- `web_server.h` — HTTP routes, WebSocket handler copies `PKT_VIDEO` packets into `g_frameBuf[face]` with mutex protection
- `led_matrix.h` — HUB75 DMA panel driver via `MatrixPanel_I2S_DMA`
- Face ordering differs: JS sends face IDs, firmware maps via `CUBE_FACE_ORDER` in ui.js (~line 3525)
- Dual-core split: Core 0 runs only the DMA display task; Core 1 runs WiFi/HTTP/WebSocket/`loop()` and the status-LED task — don't add blocking work to Core 0's task
- First boot with no saved WiFi credentials starts an AP (`Multidisplay-Setup` / `cube1234`) with a captive portal; normal boot connects to saved WiFi and falls back to AP mode after a 30s connect failure
- OTA updates write to the inactive partition and only flip `otadata` after a successful write — `/loader` is served from PROGMEM so it stays reachable even if LittleFS is mid-update
- Deep dives already written up in `docs/`: `ARCHITECTURE.md` (full system diagrams), `DEVELOPMENT.md` (debugging, WS frame format, mDNS troubleshooting), `WIRING.md`, `EFFECTS.md`. Treat these as historical references, not current truth — cross-check against the actual source (e.g. current `web_server.h` routes, current `f1-providers.js`) before relying on specifics, since some content (the old single-provider F1 description, the effect count) predates this session's changes and hasn't been updated to match.

## UI Patterns

- Sidebar sections: collapsible with section headers
- Effect buttons: `data-effect="key"`, optional `has-panel` class with `<div class="effect-panel" id="panel-key">`
- Toggle switches: `.ov-toggle` wrapping `<input type="checkbox">` + `.ov-slider` span
- `.check-row` class on labels renders checkboxes as slide toggles (separate from `.ov-toggle`)
- `.modern-chk` class for custom styled checkboxes (dark square, blue check)
- Timer list uses custom slide-switch HTML (not CSS class)

## Weather System (effects-livedata.js)

Real-time weather via Open-Meteo API. Key globals: `wxData`, `wxCity`, `HORIZ` (horizon line fraction), `WX_CLEAR_TOP` (clear zone top). Clouds use dist-based falloff and naturally dip 6px into the clear zone. `SIDE=[2,0,3,1]` maps face indices for panoramic rendering.

## Face Mirroring

faceMap bakes horizontal flip for faces 1 (back) and 2 (right). For text rendering, `SIDE=[2,0,3,1]` orders faces for panoramic layout. Wind down text uses `mir=false` on all faces; normal countdown uses `mirFaces=[2,3]`.

## WebSocket Streaming (ui.js)

`initCubeWs()` connects to `ws://{hostname}:81`. Disabled on localhost and HTTPS. `streamFrameToCube()` throttles to 20fps, packs colBuf floats into RGB888 bytes per face. Auto-reconnects every 5 seconds.

## Deployment

GitHub Pages auto-deploys from `main` on every push, but the deploy step itself fails transiently roughly 30-40% of the time for infrastructure reasons unrelated to the commit's content. After pushing, check the run's conclusion (GitHub Actions "pages build and deployment" workflow) and rerun failed jobs rather than assuming a first-attempt failure means the code is broken.
