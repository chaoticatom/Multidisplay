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
    cfg.clkphase = false;
    cfg.driver   = HUB75_I2S_CFG::SHIFTREG;
    cfg.double_buff = true;   // use the library's hardware double buffer

    MatrixPanel_I2S_DMA* display = new MatrixPanel_I2S_DMA(cfg);
    if (!display->begin()) {
        // begin() returning false means DMA allocation failed.
        return nullptr;
    }
    display->setBrightness8(180);
    display->clearScreen();
    return display;
}
