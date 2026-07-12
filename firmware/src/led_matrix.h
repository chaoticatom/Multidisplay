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

    MatrixPanel_I2S_DMA* display = new MatrixPanel_I2S_DMA(cfg);
    if (!display->begin()) {
        // begin() returning false means DMA allocation failed.
        return nullptr;
    }
    display->setBrightness8(180);
    display->clearScreen();
    return display;
}
