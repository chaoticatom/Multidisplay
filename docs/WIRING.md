# ESP32-S3 → HUB75 LED Panel Wiring Guide

## Hardware Overview

| Item | Spec |
|------|------|
| Microcontroller | ESP32-S3 N16R8 devkit |
| Panels | 6× HUB75 64×64 RGB LED matrix (P3 or P4 pitch) |
| Chain order | Top → Front → Right → Back → Left → Bottom |
| LEDs per panel | 4096 (64×64) |
| Scan rate | 1/32 (requires E address pin) |
| Panel power | 5V, up to 4A per panel at full white |
| Total power | Up to 24A at 6 panels full white — use a dedicated 5V/30A PSU |

---

## Pin Mapping: ESP32-S3 → HUB75

| HUB75 Pin | ESP32-S3 GPIO | Description               |
|-----------|---------------|---------------------------|
| R1        | GPIO 42       | Red data, rows 1–32       |
| G1        | GPIO 41       | Green data, rows 1–32     |
| B1        | GPIO 40       | Blue data, rows 1–32      |
| R2        | GPIO 39       | Red data, rows 33–64      |
| G2        | GPIO 38       | Green data, rows 33–64    |
| B2        | GPIO 37       | Blue data, rows 33–64     |
| A         | GPIO 36       | Row address bit 0         |
| B         | GPIO 35       | Row address bit 1         |
| C         | GPIO 45       | Row address bit 2         |
| D         | GPIO 48       | Row address bit 3         |
| E         | GPIO 47       | Row address bit 4 (1/32 scan) |
| CLK       | GPIO 13       | Pixel clock               |
| LAT       | GPIO 21       | Latch / strobe            |
| OE        | GPIO 14       | Output enable (active low)|
| GND       | GND           | Common ground             |

---

## Power Notes

- **Do NOT** power panels from the ESP32 5V pin — it can only supply ~500 mA.
- Use a dedicated **5V / 30A+** PSU for the panels.
- Connect PSU GND to ESP32 GND (common ground is mandatory).
- Add a **1000 µF capacitor** across each panel's power connector to suppress inrush/ripple.
- **Level shifting:** ESP32-S3 GPIO outputs 3.3V. Most modern HUB75 panels accept 3.3V data signals.
  If your panels require 5V logic, add a **74HCT245** (or similar) level-shifter buffer on the data lines.

---

## ASCII Wiring Diagram

```
ESP32-S3 (N16R8)                    HUB75 Panel Chain
┌─────────────────┐                 ┌──────────────────┐
│                 │                 │  Panel 0 (Top)   │
│  GPIO42 (R1)───┼─────────────────┼► R1              │
│  GPIO41 (G1)───┼─────────────────┼► G1              │
│  GPIO40 (B1)───┼─────────────────┼► B1              │
│  GPIO39 (R2)───┼─────────────────┼► R2              │
│  GPIO38 (G2)───┼─────────────────┼► G2              │
│  GPIO37 (B2)───┼─────────────────┼► B2              │
│  GPIO36  (A)───┼─────────────────┼► A               │
│  GPIO35  (B)───┼─────────────────┼► B               │
│  GPIO45  (C)───┼─────────────────┼► C               │
│  GPIO48  (D)───┼─────────────────┼► D               │
│  GPIO47  (E)───┼─────────────────┼► E               │
│  GPIO13(CLK)───┼─────────────────┼► CLK             │
│  GPIO21(LAT)───┼─────────────────┼► LAT             │
│  GPIO14 (OE)───┼─────────────────┼► OE              │
│                 │                 │                  │
│  GND ──────────┼────────────┬────┼► GND    OUT ─────┼──► Panel 1 IN
│                 │            │    └──────────────────┘   (and so on)
└─────────────────┘            │
                                │    ┌─────────────────┐
5V PSU 30A+                    │    │ 5V +────────────┼──► All panels
  (+)──────────────────────────┼────┤                 │
  (-)──────────────────────────┘    └─────────────────┘
                                      (1000µF cap per panel)
```

Panels 1–5 receive their data via the daisy-chain OUT connector of the previous panel — you only need signal wires from the ESP32 to Panel 0 (Top).

---

## HUB75 IDC Connector Pinout

Looking at the **female socket on the panel** (16-pin IDC):

```
┌────┬────┐
│ R1 │ G1 │  Pin 1–2
│ B1 │ GND│  Pin 3–4
│ R2 │ G2 │  Pin 5–6
│ B2 │ GND│  Pin 7–8
│ A  │ B  │  Pin 9–10
│ C  │ D  │  Pin 11–12
│ CLK│ LAT│  Pin 13–14  (LAT also called STB or STROBE)
│ OE │ E  │  Pin 15–16
└────┴────┘
```

> Note: Pin numbering varies by manufacturer. Always verify against the silkscreen on your specific panel.

---

## Software Library

```ini
; platformio.ini
lib_deps =
    mrfaptastic/ESP32 HUB75 LED MATRIX PANEL DMA Display@^3.0.0
```

Minimal firmware configuration example:

```cpp
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

#define PANEL_WIDTH  64
#define PANEL_HEIGHT 64
#define NUM_PANELS   6

HUB75_I2S_CFG::i2s_pins pins = {
  .r1 = 42, .g1 = 41, .b1 = 40,
  .r2 = 39, .g2 = 38, .b2 = 37,
  .a  = 36, .b  = 35, .c  = 45,
  .d  = 48, .e  = 47,
  .clk = 13, .lat = 21, .oe = 14
};

HUB75_I2S_CFG config(PANEL_WIDTH, PANEL_HEIGHT, NUM_PANELS, pins);
MatrixPanel_I2S_DMA *display = new MatrixPanel_I2S_DMA(config);
```

---

## 3D Cube Face Layout

Panel chain order and face assignment (daisy-chain IN on left, OUT on right):

```
          ┌──────┐
          │Top(0)│
  ┌───────┼──────┼───────┬──────────┐
  │ Left  │Front │ Right │  Back    │
  │  (4)  │ (1)  │  (2)  │   (3)   │
  └───────┼──────┼───────┴──────────┘
          │Bot(5)│
          └──────┘

Panel chain: Top(0) → Front(1) → Right(2) → Back(3) → Left(4) → Bottom(5)
```

Each panel's OUT connector feeds the next panel's IN connector. The ESP32 only connects to Panel 0 (Top).

---

## Checklist Before Power-On

- [ ] Common GND between PSU and ESP32
- [ ] 1000 µF capacitor on each panel power connector
- [ ] PSU rated for at least 30A at 5V (consider 40A for headroom)
- [ ] Double-check IDC connector orientation on Panel 0 (notch direction)
- [ ] Verify E pin is wired — without it, only half the rows display (1/16 scan behavior)
- [ ] Start with low brightness in firmware before testing full white
