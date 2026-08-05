# Multidisplay Pi-native (early proof-of-concept)

Native effect engine + LED panel driver for running Multidisplay on a
Raspberry Pi driving HUB75 panels directly (via `rpi-led-matrix`), instead
of a browser computing effects and streaming frames to an ESP32.

Not to be confused with the top-level `pi/` directory in this repo, which
is unrelated: helper scripts (Bluetooth audio bridge) for a Raspberry Pi
that's running the *existing browser-based* app as a client, not this
native rewrite.

## Status: proof-of-concept, NOT feature-complete, NOT hardware-tested

This was built and tested entirely in a sandbox with **no Raspberry Pi, no
HUB75 panels, and no ARM hardware available**. What that means concretely:

**Verified (in this sandbox, with `DRIVER=mock`):**
- `src/core.js` — the ported `SIZE`/`N`/`faceMap`/`surfX,Y,Z`/`colBuf`/
  `setLED` logic — produces the exact expected surface-LED count
  (64³ − 62³ = 23,816) and valid `faceMap` entries. See `test/core.test.js`.
- The 2 ported effects (`wave`, `gradient_wash`) run without throwing and
  produce finite, in-range color values.
- The WS control/preview server: connect → receive state → send
  `setEffect` → receive correctly-shaped binary preview frames for all 6
  faces. See `test/smoke-client.js` (manual, run against a live `npm start`).

**NOT verified — needs real hardware:**
- `src/drivers/rgbMatrixDriver.js` — written against `rpi-led-matrix`'s
  actual documented API and its native addon's C++ source (verified the
  `drawBuffer()` byte-buffer contract by reading `led-matrix.addon.cc`
  directly, not just the README, which was stale on this point) — but it
  has never actually run against the native binding or real panels, since
  that binding requires compiling against real hardware.
- **`FACE_LAYOUT` in `rgbMatrixDriver.js` is a placeholder**, not a
  calibrated mapping. It assumes the Active-3 board's 3-parallel-chain
  layout discussed during planning, but which physical face lands where is
  a property of how *you* wire it. Test with solid per-face colors before
  trusting any real effect's output.
- `gpioSlowdown` and other `runtimeOptions` in `rgbMatrixDriver.js` are
  placeholder starting points, not tuned values.
- Only 2 of the ~40 effects in the browser (`effects-*.js`) are ported.
  Everything else in the project's task list (word-cascade text, weather,
  APOD, ISS tracker, custom-cube per-face composition, internet radio) is
  still todo, and radio specifically needs its own audio-decode/FFT
  subsystem - it isn't a `setLED()`-only port like the rest.
- The `systemd/multidisplay-pi.service` unit file is standard boilerplate,
  not tested against a real boot.

## Running (development, no hardware)

```bash
npm install --omit=optional   # skip rpi-led-matrix's native build if you don't have build tools/hardware for it
npm test                      # run test/core.test.js
npm run start:mock            # or: DRIVER=mock node src/app.js
```

With `DRIVER=mock` (the default), no GPIO/hardware calls happen at all —
`mockDriver.js` just logs a periodic frame/brightness summary, so the
effect engine + WS server can be exercised on any machine.

Connect a WS client to `ws://localhost:8081` to drive it — see
`src/wsServer.js`'s module comment for the exact protocol, or run
`node test/smoke-client.js` against a live `npm start` as a working example.

## Running on real hardware

```bash
npm install          # now including rpi-led-matrix - needs build tools + the actual native library present
sudo DRIVER=hardware node src/app.js
```

Before trusting any effect's visual output: **calibrate `FACE_LAYOUT` in
`src/drivers/rgbMatrixDriver.js` against your actual wiring** by testing
one distinctive solid color per face.

Then install `systemd/multidisplay-pi.service` (adjust `WorkingDirectory`
to wherever this is deployed) to run it as a boot-time service.

## Project layout

- `src/core.js` — DOM-free port of `cube.js`'s `SIZE`/`N`/`faceMap`/
  `surfX,Y,Z`/`colBuf`/`setLED`/`setFaceLED` plus the `hsl`/`lerp`/`sm`
  color helpers. No dependency on `document`/WebGL/Three.js at all - see
  its module comment for why that split was necessary.
- `src/effects/` — ported effect functions, `(core, dt) => void`, same
  calling convention as the browser's `EFFECTS` map.
- `src/drivers/` — pluggable LED output backends (`mockDriver.js`,
  `rgbMatrixDriver.js`) behind the shared contract in
  `driverInterface.js`.
- `src/wsServer.js` — local control + preview WebSocket server.
- `src/app.js` — entry point: animation loop, driver selection, wiring it
  all together.
