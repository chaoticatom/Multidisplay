#pragma once

#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>
#include "config.h"

// ---------------------------------------------------------------------------
// led_matrix.h - HUB75 DMA display initialization helper
//
// The 6 cube-face panels are chained into a single wide virtual bitmap:
//   total width  = NUM_FACES * PANEL_SIZE
//   total height = PANEL_SIZE
// Face N occupies the horizontal slice [N*PANEL_SIZE, (N+1)*PANEL_SIZE).
// ---------------------------------------------------------------------------

inline MatrixPanel_I2S_DMA* initDisplay() {
    HUB75_I2S_CFG::i2s_pins pins = {
        HUB75_R1, HUB75_G1, HUB75_B1,
        HUB75_R2, HUB75_G2, HUB75_B2,
        HUB75_A,  HUB75_B,  HUB75_C,  HUB75_D, HUB75_E,
        HUB75_LAT, HUB75_OE, HUB75_CLK
    };

    HUB75_I2S_CFG cfg(
        PANEL_SIZE,   // module width
        PANEL_SIZE,   // module height
        NUM_FACES,    // chain length (one panel per cube face)
        pins
    );

    // 1/32 scan for 64-row panels (requires E pin).
    // E-line continuity to GPIO 47 was confirmed good on the actual hardware,
    // which rules out the wiring-fault theory for the alternating blank-row-
    // band symptom. That symptom (half the row blocks never lighting) is a
    // classic sign of a driver IC needing a specific init sequence beyond
    // generic HUB75 timing - FM6126A is the most common chip on 64x64 panels
    // that behaves exactly this way under the plain SHIFTREG driver.
    cfg.clkphase = true;
    cfg.driver   = HUB75_I2S_CFG::FM6126A;
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

    MatrixPanel_I2S_DMA* display = new MatrixPanel_I2S_DMA(cfg);
    if (!display->begin()) {
        // begin() returning false means DMA allocation failed.
        return nullptr;
    }
    display->setBrightness8(180);
    display->clearScreen();
    return display;
}
