#pragma once

#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>
#include "config.h"

// ---------------------------------------------------------------------------
// led_matrix.h - HUB75 DMA display initialization helper
//
// All the rest of the firmware (main.cpp's video frame push, the bring-up
// test pattern, standalone.h's native effects) addresses pixels in "logical"
// space: face N occupies x in [N*PANEL_SIZE, (N+1)*PANEL_SIZE), y in
// [0, PANEL_SIZE). That never changes, regardless of SCAN_SPLIT below —
// scanSplitRemap()/ScanSplitPanel exist specifically so nothing else in the
// codebase has to know or care how many strips the physical panels scan as.
// ---------------------------------------------------------------------------

// Translates logical (x, y) — face N at x in [N*PANEL_SIZE,(N+1)*PANEL_SIZE),
// y in [0,PANEL_SIZE) — into the SCAN_SPLIT-times-longer-chain, 1/SCAN_SPLIT
// -height physical space this panel actually needs. Each face's y-range
// splits into SCAN_SPLIT equal strips, each becoming a separate consecutive
// entry in the virtual chain, PANEL_SIZE wide x (PANEL_SIZE/SCAN_SPLIT) tall.
inline void scanSplitRemap(int x, int y, int16_t& outX, int16_t& outY) {
    const int stripH = PANEL_SIZE / SCAN_SPLIT;
    const int face = x / PANEL_SIZE;
    const int lx   = x % PANEL_SIZE;
    int stripIdx = y / stripH;
#if SCAN_SPLIT_REVERSE
    stripIdx = (SCAN_SPLIT - 1) - stripIdx;
#endif
    const int moduleIndex = face * SCAN_SPLIT + stripIdx;
    outY = (int16_t)(y % stripH);
    outX = (int16_t)(moduleIndex * PANEL_SIZE + lx);
}

#if SCAN_SPLIT_PANEL
// Drop-in MatrixPanel_I2S_DMA replacement that remaps every pixel through
// scanSplitRemap() before handing it to the base class. Overriding drawPixel
// (not drawPixelRGB888) is deliberate: Adafruit_GFX's higher-level helpers
// (fillRect, drawLine, print, fillCircle, ...) — used by the bring-up
// pattern and standalone.h — all funnel through this one virtual method, so
// overriding it here fixes all of them for free. main.cpp's direct
// drawPixelRGB888 fast path in the live video loop is remapped explicitly
// at its call site instead, since that method isn't guaranteed virtual.
class ScanSplitPanel : public MatrixPanel_I2S_DMA {
public:
    using MatrixPanel_I2S_DMA::MatrixPanel_I2S_DMA;
    void drawPixel(int16_t x, int16_t y, uint16_t color) override {
        int16_t rx, ry;
        scanSplitRemap(x, y, rx, ry);
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
        PANEL_SIZE,        // module width (unchanged - still 64 wide per strip)
        HUB75_MOD_HEIGHT,  // module height (quarter-scan: 16, not the full 64)
        HUB75_CHAIN_LEN,   // chain length (SCAN_SPLIT virtual modules per physical face)
        pins
    );

    // Row-driver IC on this panel is confirmed (via chip-marking photo) to be
    // an SM5166PS - a plain constant-current shift-register sink. SHIFTREG
    // and FM6126A were both tried with no difference. DP3246_SM5368 (a
    // driver mode specific to the SM5xxx family, per a user report on
    // GitHub mrcodetastic/ESP32-HUB75-MatrixPanel-DMA issue #702) didn't
    // exist in v3.0.15 - platformio.ini's lib_deps now pulls the latest
    // available release instead (was pinned to ^3.0.11) specifically to
    // get access to this driver mode if a newer version includes it.
    cfg.clkphase = true;
    cfg.driver   = HUB75_I2S_CFG::DP3246_SM5368;
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

#if SCAN_SPLIT_PANEL
    MatrixPanel_I2S_DMA* display = new ScanSplitPanel(cfg);
#else
    MatrixPanel_I2S_DMA* display = new MatrixPanel_I2S_DMA(cfg);
#endif
    if (!display->begin()) {
        // begin() returning false means DMA allocation failed.
        return nullptr;
    }
    display->setBrightness8(90);   // 50% of the previous 180, per request
    display->clearScreen();
    return display;
}
