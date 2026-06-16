# Effect Design Guide

This document explains how to write new visual effects for the Multidisplay RGB LED Cube, both in the browser simulator and on the ESP32 firmware.

## 1. Overview

Effects run in two places:

| Location | Language | When used |
|----------|----------|-----------|
| Browser (Three.js) | JavaScript | Always — drives the 3D simulator |
| ESP32 firmware (FreeRTOS) | C++ | Standalone mode only (no browser connected) |

Both places share the same conceptual pixel data model:

- **6 faces** numbered 0–5: Front, Back, Right, Left, Top, Bottom
- Each face is **S×S pixels** where `S` = `SIZE` (8, 16, or 64)
- Each pixel is **RGB 0–255** (firmware) or **RGB 0.0–1.0** (JavaScript)
- The six face buffers are sent from the browser to the ESP32 over WebSocket at 20 fps

In the browser, effects write into the global `colBuf` float array (3 floats per LED: R, G, B in 0–1 range) by calling `setLED(i, r, g, b)`. At the end of each frame, `streamFrameToCube()` in `ui.js` packs `colBuf` into binary WebSocket messages and sends them to the ESP32.

## 2. Writing a Browser Effect (JavaScript)

### Effect function signature

```js
function effectMyEffect(dt) {
  // dt = elapsed seconds since the last frame (typically ~0.016 at 60fps)
  t += dt;  // advance global time
  // ... write pixels ...
}
```

### Global variables available

| Name | Type | Description |
|------|------|-------------|
| `SIZE` | number | Pixels per face side (8, 16, or 64) |
| `N` | number | Total number of surface LEDs |
| `t` | number | Running time counter (seconds); increment by `dt` each frame |
| `surfX[i]` | Float32Array | Normalized X coordinate of LED `i` (0–1) |
| `surfY[i]` | Float32Array | Normalized Y coordinate of LED `i` (0–1) |
| `surfZ[i]` | Float32Array | Normalized Z coordinate of LED `i` (0–1) |
| `colBuf` | Float32Array | Raw colour buffer, 3 floats per LED (r,g,b 0–1) |
| `faceMap[face]` | Int32Array | Maps face pixel `(u,v)` → LED index. `faceMap[face][v*SIZE+u]` returns the LED index or `-1` if that cell is not on the face. |

Faces: `0`=Front (z=max), `1`=Back (z=0), `2`=Right (x=max), `3`=Left (x=0), `4`=Top (y=max), `5`=Bottom (y=0).

### Helper functions

```js
// Set LED i to colour (r, g, b) where each channel is 0.0–1.0
setLED(i, r, g, b)

// Set a specific pixel on a face by (u, v) coordinates (0 to SIZE-1)
setFaceLED(face, u, v, r, g, b)

// HSL to RGB. Returns [r, g, b] each 0–1.
// h=0..1, s=0..1, l=0..1
const [r, g, b] = hsl(h, s, l)

// Linear interpolation between a and b at fraction t (0–1)
lerp(a, b, t)

// Smoothstep: smooth transition from 0 to 1 as x goes from e0 to e1
sm(e0, e1, x)
```

### Minimal example

```js
function effectPulse(dt) {
  t += dt;
  const bright = (Math.sin(t * 2) + 1) / 2;  // oscillates 0..1
  for (let i = 0; i < N; i++) {
    setLED(i, bright, 0, bright * 0.5);
  }
}
```

### Face-by-face example

```js
function effectFaceColors(dt) {
  t += dt;
  for (let face = 0; face < 6; face++) {
    const hue = (face / 6 + t * 0.1) % 1;
    const [r, g, b] = hsl(hue, 1, 0.5);
    for (let v = 0; v < SIZE; v++) {
      for (let u = 0; u < SIZE; u++) {
        setFaceLED(face, u, v, r, g, b);
      }
    }
  }
}
```

### Coordinate-based example

```js
function effectDepthWave(dt) {
  t += dt;
  for (let i = 0; i < N; i++) {
    const wave = Math.sin(surfZ[i] * 10 - t * 3) * 0.5 + 0.5;
    const [r, g, b] = hsl(surfX[i] * 0.6 + t * 0.05, 1, wave * 0.7);
    setLED(i, r, g, b);
  }
}
```

### Registering a new effect

**Step 1** — Add the function to `effects.js`.

**Step 2** — Register it in `ui.js` in both maps (around line 992):

```js
const EFFECTS = {
  // ... existing entries ...
  pulse: effectPulse,     // <-- add here
};

const EFFECT_NAMES = {
  // ... existing entries ...
  pulse: 'Pulse Glow',   // <-- add here (display name for the UI)
};
```

**Step 3** — Add a button in `index.html` inside the appropriate `effect-group-label` section:

```html
<div class="effect-group-label">Dynamic</div>
<button class="effect-btn" data-effect="pulse">◈ Pulse Glow</button>
```

If your effect needs sidebar controls (sliders, colour pickers), add `has-panel` to the button class and create a matching `<div class="effect-panel" id="panel-pulse">...</div>` immediately after the button. Read the control values inside your effect function by querying the DOM elements directly, following the pattern used by existing effects like `effectStrobe` or `effectRain`.

### Adding sidebar controls

Example slider control for a speed parameter:

In `index.html`:
```html
<button class="effect-btn has-panel" data-effect="pulse">◈ Pulse Glow <span class="panel-arrow">▸</span></button>
<div class="effect-panel" id="panel-pulse">
  <div class="ov-row-label">Speed</div>
  <div class="slider-row">
    <input type="range" id="pulse-speed" min="0.5" max="8" step="0.1" value="2">
    <span class="slider-val" id="pulse-speed-val">2</span>
  </div>
</div>
```

In your effect function:
```js
function effectPulse(dt) {
  t += dt;
  const speed = parseFloat(document.getElementById('pulse-speed')?.value ?? 2);
  const bright = (Math.sin(t * speed) + 1) / 2;
  for (let i = 0; i < N; i++) {
    setLED(i, bright, 0, bright * 0.5);
  }
}
```

Wire up live value display in `ui.js` following the pattern used for existing sliders (search for `strobe-speed` for a simple example).

## 3. Writing the Same Effect in C++ (ESP32)

You do **not** need to implement effects in the firmware. The browser computes all effects and streams the resulting pixel frames to the ESP32 over WebSocket. The firmware simply receives frames and forwards them to the HUB75 panels via DMA.

For **standalone operation** (cube displays effects even when no browser is open), implement effects directly in the firmware:

### C++ effect signature

```cpp
// In firmware/src/led_matrix.h or a new effects.h
void effectPulse(MatrixPanel_I2S_DMA* dma, uint32_t t_ms) {
  float bright = (sin(t_ms * 0.002f) + 1.0f) / 2.0f;
  uint8_t r = (uint8_t)(bright * 255);
  uint8_t g = 0;
  uint8_t b = (uint8_t)(bright * 127);

  for (int face = 0; face < NUM_FACES; face++) {
    for (int y = 0; y < PANEL_SIZE; y++) {
      for (int x = 0; x < PANEL_SIZE; x++) {
        // x offset: face * PANEL_SIZE to target each panel
        dma->drawPixelRGB888(x + face * PANEL_SIZE, y, r, g, b);
      }
    }
  }
}
```

The effect runs in a FreeRTOS task. When the browser is connected and streaming (`PKT_VIDEO` packets are arriving), the firmware switches to streaming mode and ignores standalone effects. When the browser disconnects, standalone effects resume.

### Compile-time settings

Key constants in `firmware/src/config.h`:

```cpp
#define PANEL_SIZE  64   // pixels per side
#define NUM_FACES   6
#define WS_PORT     81   // WebSocket port
#define CUBE_FPS    20   // frame rate when streaming
```

## 4. Workflow for Developing New Effects

### Step-by-step

1. **Open the simulator**: Run `python3 -m http.server 8080` from the project root, then browse to `http://localhost:8080`. Or open `http://multidisplay.local` from a device on the same network as the ESP32.

2. **Write the effect**: Add your function to `effects.js`, then register it in `ui.js` and add a button in `index.html`.

3. **Test in simulator**: Click your new effect button in the sidebar. Drag to rotate the cube, scroll to zoom, and verify all six faces look correct.

4. **Stream to hardware**: With the ESP32 on the same WiFi network, open `http://multidisplay.local`. The browser auto-connects to `ws://multidisplay.local:81` and starts streaming frames at 20 fps.

5. **Iterate**: Edit `effects.js` locally and reload the page. The browser re-streams immediately.

6. **Port to C++ (optional)**: If you want the effect to run without a browser, implement it in the firmware following the pattern in section 3.

7. **Build and deploy**: Run `./build.sh` to gzip assets into `./data/`, then upload via the OTA loader.

### Tips

- Keep effect functions fast — they run every animation frame (up to 60 fps in the browser).
- Use `surfX`, `surfY`, `surfZ` for smooth 3D patterns; use `faceMap` when you need precise face/pixel control.
- Avoid allocating large objects inside the effect function — allocate state arrays once at the module level (like `rainDrops` in `effectRain`).
- Add a `reset` guard: many effects initialize their state lazily with a check like `if (!myState || myState.length !== N) myState = new Float32Array(N);`.

## 5. Upload Workflow (No USB Required After Initial Flash)

After the initial USB flash, all updates can be pushed over WiFi via the loader page.

### Web app changes

1. Edit `index.html`, `effects.js`, `ui.js`, `cube.js`, `f1.js`, or `style.css`.
2. Run `./build.sh` — this downloads Three.js, gzips all assets, and writes them to `./data/`.
3. In PlatformIO: **Build Filesystem Image** (`pio run --target buildfs`).
4. Browse to `http://multidisplay.local/loader`.
5. Drag `.pio/build/esp32-s3-devkitc-1/littlefs.bin` onto the **Filesystem** drop zone and click **Flash Filesystem**.
6. The ESP32 reboots and the page auto-reloads.

### Firmware changes

1. Edit firmware source in `firmware/src/`.
2. In PlatformIO: **Build** (`pio run`).
3. Browse to `http://multidisplay.local/loader`.
4. Drag `.pio/build/esp32-s3-devkitc-1/firmware.bin` onto the **Firmware** drop zone and click **Flash Firmware**.
5. The ESP32 reboots automatically.

## 6. Effect Parameters — Adding Sidebar Controls

Use the patterns below to wire up controls in the sidebar panel for your effect.

### Slider

HTML in `index.html` (inside `<div class="effect-panel" id="panel-myeffect">`):
```html
<div class="ov-row-label">Speed</div>
<div class="slider-row">
  <input type="range" id="myeffect-speed" min="0.5" max="10" step="0.5" value="3">
  <span class="slider-val" id="myeffect-speed-val">3</span>
</div>
```

Wire up live display in `ui.js`:
```js
document.getElementById('myeffect-speed')?.addEventListener('input', e => {
  document.getElementById('myeffect-speed-val').textContent = e.target.value;
});
```

### Colour picker (option buttons)

```html
<div class="ov-row-label">Colour</div>
<div class="opt-grid">
  <button class="strobe-mode-btn active" data-mycol="red">Red</button>
  <button class="strobe-mode-btn" data-mycol="blue">Blue</button>
  <button class="strobe-mode-btn" data-mycol="multi">Multi</button>
</div>
```

Track the active selection in a module-level variable and read it in your effect function.

### Checkbox / toggle

```html
<label class="check-row">
  <input type="checkbox" id="myeffect-mirror"> MIRROR
</label>
```

Read in effect function:
```js
const mirror = document.getElementById('myeffect-mirror')?.checked ?? false;
```
