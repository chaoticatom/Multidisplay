#pragma once

#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>
#include "config.h"

#if USE_VIRTUAL_MATRIX_PANEL
// NOT using the library's own VirtualMatrixPanel here - its
// FOUR_SCAN_64PX_HIGH case has a real bug, confirmed by reading the actual
// installed source: it reassigns the local parameter `virt_y` to apply the
// 64px-tall-specific adjustment, but `coords.y` (which the very next,
// fallthrough case actually reads) was already copied from the ORIGINAL
// virt_y earlier in the same function, before this reassignment happens.
// The 64px-specific adjustment has no effect at all - it silently behaves
// identically to FOUR_SCAN_32PX_HIGH. That's consistent with "compiles
// fine, display is exactly the same" after switching to it.
//
// This reimplements the INTENDED algorithm (same formulas, same operator
// precedence, copied faithfully from that source) with the bug fixed: the
// adjusted y value is what actually feeds the rest of the remap.
inline void fourScan64Remap(int x, int y, int16_t& outX, int16_t& outY) {
    const int panelPixelBase = PANEL_SIZE;   // 64
    int adjY = y;
    if ((adjY & 8) != ((adjY & 16) >> 1)) {
        // Copied verbatim from the library source, including its exact
        // operator precedence (+ binds tighter than ^ in C++, so this is
        // (adjY & 0b11000) ^ (0b11000 + (adjY & 0b11100111)) - preserving
        // that exactly rather than guessing whether it was intentional.
        adjY = (adjY & 0b11000) ^ 0b11000 + (adjY & 0b11100111);
    }
    int outXi = x;
    if ((adjY & 8) == 0) {
        outXi += ((outXi / panelPixelBase) + 1) * panelPixelBase;
    } else {
        outXi += (outXi / panelPixelBase) * panelPixelBase;
    }
    const int outYi = (adjY >> 4) * 8 + (adjY & 0b00000111);
    outX = (int16_t)outXi;
    outY = (int16_t)outYi;
}

// Drop-in MatrixPanel_I2S_DMA replacement using the bug-fixed remap above.
class FourScan64Panel : public MatrixPanel_I2S_DMA {
public:
    using MatrixPanel_I2S_DMA::MatrixPanel_I2S_DMA;
    void drawPixel(int16_t x, int16_t y, uint16_t color) override {
        int16_t rx, ry;
        fourScan64Remap(x, y, rx, ry);
        MatrixPanel_I2S_DMA::drawPixel(rx, ry, color);
    }
};
#endif

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
    // and FM6126A were both tried with no difference. DP3246_SM5368
    // (referenced in a WebFetch-summarized GitHub issue as a driver mode
    // for the SM5xxx family) doesn't actually exist in either mrfaptastic's
    // registry package OR a fresh clone of mrcodetastic's current GitHub
    // master - the summary was likely wrong/hallucinated, or referenced a
    // PR that was never merged. Back to SHIFTREG and the registry package.
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

#if USE_VIRTUAL_MATRIX_PANEL
    MatrixPanel_I2S_DMA* display = new FourScan64Panel(cfg);
#elif SCAN_SPLIT_PANEL
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
