#pragma once

#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>
#include "config.h"

// ---------------------------------------------------------------------------
// led_matrix.h - HUB75 DMA display initialization helper
//
// All the rest of the firmware (main.cpp's video frame push, the bring-up
// test pattern, standalone.h's native effects) addresses pixels in "logical"
// space: face N occupies x in [N*PANEL_SIZE, (N+1)*PANEL_SIZE), y in
// [0, PANEL_SIZE). That never changes, regardless of HALF_SCAN_PANEL below —
// halfScanRemap()/HalfScanPanel exist specifically so nothing else in the
// codebase has to know or care that the physical panels are half-scan.
// ---------------------------------------------------------------------------

// Translates logical (x, y) — face N at x in [N*PANEL_SIZE,(N+1)*PANEL_SIZE),
// y in [0,PANEL_SIZE) — into the doubled-chain, half-height physical space a
// half-scan panel actually needs. Each face's top half (y < PANEL_SIZE/2)
// and bottom half become two separate consecutive entries in the virtual
// chain, each PANEL_SIZE wide x PANEL_SIZE/2 tall.
inline void halfScanRemap(int x, int y, int16_t& outX, int16_t& outY) {
    const int half = PANEL_SIZE / 2;
    const int face = x / PANEL_SIZE;
    const int lx   = x % PANEL_SIZE;
    int halfIdx = (y >= half) ? 1 : 0;
#if HALF_SCAN_SWAP_HALVES
    halfIdx = 1 - halfIdx;
#endif
    const int moduleIndex = face * 2 + halfIdx;
    outY = (int16_t)(y % half);
    outX = (int16_t)(moduleIndex * PANEL_SIZE + lx);
}

#if HALF_SCAN_PANEL
// Drop-in MatrixPanel_I2S_DMA replacement that remaps every pixel through
// halfScanRemap() before handing it to the base class. Overriding drawPixel
// (not drawPixelRGB888) is deliberate: Adafruit_GFX's higher-level helpers
// (fillRect, drawLine, print, fillCircle, ...) — used by the bring-up
// pattern and standalone.h — all funnel through this one virtual method, so
// overriding it here fixes all of them for free. main.cpp's direct
// drawPixelRGB888 fast path in the live video loop is remapped explicitly
// at its call site instead, since that method isn't guaranteed virtual.
class HalfScanPanel : public MatrixPanel_I2S_DMA {
public:
    using MatrixPanel_I2S_DMA::MatrixPanel_I2S_DMA;
    void drawPixel(int16_t x, int16_t y, uint16_t color) override {
        int16_t rx, ry;
        halfScanRemap(x, y, rx, ry);
        MatrixPanel_I2S_DMA::drawPixel(rx, ry, color);
    }
};
#endif

inline MatrixPanel_I2S_DMA* initDisplay() {
    HUB75_I2S_CFG::i2s_pins pins = {
        HUB75_R1, HUB75_G1, HUB75_B1,
        HUB75_R2, HUB75_G2, HUB75_B2,
        HUB75_A,  HUB75_B,  HUB75_C,  HUB75_D, HUB75_E,
        HUB75_LAT, HUB75_OE, HUB75_CLK
    };

    HUB75_I2S_CFG cfg(
        PANEL_SIZE,        // module width (unchanged - still 64 wide per half)
        HUB75_MOD_HEIGHT,  // module height (half-scan: 32, not the full 64)
        HUB75_CHAIN_LEN,   // chain length (two virtual modules per physical face)
        pins
    );

    // Row-driver IC on this panel is confirmed (via chip-marking photo) to be
    // an SM5166PS - a plain constant-current shift-register sink, NOT a
    // "smart" chip like FM6126A/ICN2038S that needs a special init sequence.
    // FM6126A mode was tried and made no difference, consistent with that -
    // reverted back to the generic SHIFTREG driver, which is the correct
    // match for this chip.
    cfg.clkphase = true;
    cfg.driver   = HUB75_I2S_CFG::SHIFTREG;
    cfg.double_buff = true;   // use the library's hardware double buffer

    // Latch blanking controls how many clock pulses the output is disabled
    // (via OE) around the LAT toggle, to hide row-address bits transitioning
    // mid-shift. The library's own docs call this out as the fix for
    // "ghosting"/duplicate-with-offset symptoms - exactly what we're
    // chasing. Default is 1; try bumping it (2-4) if the split persists.
    // If this value turns out not to matter, that's a real data point too -
    // it'd point back toward a wiring issue (E line or CLK/LAT) rather than
    // a timing config problem.
    cfg.latch_blanking = 4;

#if HALF_SCAN_PANEL
    MatrixPanel_I2S_DMA* display = new HalfScanPanel(cfg);
#else
    MatrixPanel_I2S_DMA* display = new MatrixPanel_I2S_DMA(cfg);
#endif
    if (!display->begin()) {
        // begin() returning false means DMA allocation failed.
        return nullptr;
    }
    display->setBrightness8(180);
    display->clearScreen();
    return display;
}
