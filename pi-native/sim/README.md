# Browser-native simulator (GitHub Pages)

Lets you preview pi-native effects from a desktop browser with no Pi
connected at all - deployed at the repo root on GitHub Pages
(`https://chaoticatom.github.io/Multidisplay/`).

## Why this exists, and what it is NOT

The pi-native web UI (`pi-native/public/`) is normally a thin client: it
sends WebSocket commands to `src/wsServer.js` on a real Pi, and the Pi
computes every effect frame server-side. That page has nothing to talk to
without a Pi running, so it can't just be copied to GitHub Pages (a static
host - no Node process behind it) and expected to work.

This is **not** the original ESP32+browser architecture's simulator
(`index.html`/`effects-*.js`/`ui.js`, which used to be deployed at this
same root URL) - that was a separate, older codebase that computed effects
differently, for a different physical architecture (browser -> ESP32 over
WebSocket, no Pi involved). That architecture is retired; its source files
were removed from the repo root when this simulator took over the URL (see
git history before the commit that did that if you need them). This one
runs the actual pi-native effect engine.

## How it works

`sim/entry.js` bundles the REAL Pi code - `src/core.js` (CubeCore),
`src/effects/index.js` (every effect), `src/tick.js` (the per-frame
sequencing app.js also calls) - into `public/sim-engine.js` via esbuild
(`node sim/build.js`), with small browser shims for the handful of Node
built-ins a few modules touch (`sim/shims/`: `fs` -> localStorage,
`path` -> string join, `child_process` -> throws, since ffmpeg-based video
can't run in a browser tab).

`public/sim-loopback.js` is a hand-written (not bundled from Pi source)
browser-only "fake server": a `setInterval` tick loop calling the same
`tick()` function app.js calls, a command handler covering the
effect-focused slice of `wsServer.js`'s real WS protocol (setEffect,
setEffectOption, overlays, brightness/speed, panel mode/size/layout), and
frame encoding byte-identical to `wsServer.js`'s `maybeStreamFrame`/
`_streamWallFrames`. `public/app.js` (the same file the real Pi serves,
unmodified in git except for the `window.MULTIDISPLAY_SIM` branch in
`connect()`/`send()`) is fed through this instead of a real WebSocket -
`handleTextMessage()`/`handleFrame()` don't know the difference.

## What's simulated vs. not

**Works, same code as the Pi:** every visual effect (cube/2D/wall), all 13
overlays, brightness/speed, panel mode/size/layout, the Timer system.

**Not available (no server, no hardware to fake):** Bluetooth pairing,
WiFi setup, video upload/webcam/screen share (needs a real `ffmpeg`
process), Custom Cube save/load and Unsplash API key persistence (in-memory
only for the session, not saved). Their panels are left visible but inert,
same "grey out, don't hide" precedent this app already uses elsewhere.

## Building/deploying

```
cd pi-native
node sim/deploy.js
```

Regenerates `public/sim-engine.js` + `public/effects.json`, then writes a
full static copy into `<repo root>` (index.html patched to load
`sim-engine.js`/`sim-loopback.js` and set `window.MULTIDISPLAY_SIM` before
`app.js` runs). The repo-root copies are committed directly (no CI build
step for this repo) - GitHub Pages serves them as-is once pushed to `main`.

**Run this again, and commit the result, any time you change**
`public/app.js`, `public/index.html`, `src/core.js`, `src/tick.js`, or
anything under `src/effects/` - otherwise the deployed simulator drifts
out of sync with what the Pi actually runs.
