#pragma once

#include <Arduino.h>
#include "PanelTester.h"
#include "Pins.h"

// ===========================================================================
// DiagnosticRenderer - the 12 required test patterns, each operating purely
// in logical (0..63, 0..63) space via PanelTester::plotPixel()/fillAll().
//
// Per-test time budgets are named constants (TestDuration namespace) sized
// so all 12 fit inside one configuration's total on-screen time (see
// main.cpp's HOLD_TIME_MS) - solid fills and static patterns get a short
// hold, the sweep/walking-pixel tests get a longer budget since they need
// to visit many pixels to be meaningful at all.
// ===========================================================================

namespace TestDuration {
    constexpr unsigned long SOLID_COLOR_MS   = 300;
    constexpr unsigned long SWEEP_LINE_MS     = 1000;
    constexpr unsigned long CHECKERBOARD_MS   = 300;
    constexpr unsigned long WALKING_PIXEL_MS  = 1200;
    constexpr unsigned long GRID_MS           = 500;
    constexpr unsigned long AXES_MS           = 500;
    constexpr unsigned long QUADRANTS_MS      = 700;
}

class DiagnosticRenderer {
public:
    // Total frames rendered since the last resetFrameCount() call - used by
    // Diagnostics to report an approximate frame rate for the current config.
    unsigned long frameCount() const { return frameCount_; }
    void resetFrameCount() { frameCount_ = 0; }

    void runAllTests(PanelTester& panel) {
        testSolidColor(panel, 255, 0, 0);     // 1: RED
        testSolidColor(panel, 0, 255, 0);     // 2: GREEN
        testSolidColor(panel, 0, 0, 255);     // 3: BLUE
        testSolidColor(panel, 255, 255, 255); // 4: WHITE
        testMovingHorizontalLine(panel);      // 5
        testMovingVerticalLine(panel);        // 6
        testCheckerboard(panel, 8);           // 7: 8x8 blocks
        testCheckerboard(panel, 1);           // 8: 1px blocks
        testWalkingPixel(panel);              // 9
        testNumberedGrid(panel);              // 10
        testCoordinateAxes(panel);            // 11
        testColouredQuadrants(panel);         // 12
    }

private:
    static constexpr int WIDTH  = Pins::PANEL_WIDTH;
    static constexpr int HEIGHT = Pins::PANEL_HEIGHT;

    void tick() { frameCount_++; }

    void testSolidColor(PanelTester& panel, uint8_t r, uint8_t g, uint8_t b) {
        panel.fillAll(r, g, b);
        tick();
        delay(TestDuration::SOLID_COLOR_MS);
    }

    void testMovingHorizontalLine(PanelTester& panel) {
        const int steps = HEIGHT;
        const unsigned long perStep = TestDuration::SWEEP_LINE_MS / steps;
        for (int y = 0; y < steps; y++) {
            panel.clear();
            for (int x = 0; x < WIDTH; x++) panel.plotPixel(x, y, 255, 255, 255);
            tick();
            delay(perStep);
        }
    }

    void testMovingVerticalLine(PanelTester& panel) {
        const int steps = WIDTH;
        const unsigned long perStep = TestDuration::SWEEP_LINE_MS / steps;
        for (int x = 0; x < steps; x++) {
            panel.clear();
            for (int y = 0; y < HEIGHT; y++) panel.plotPixel(x, y, 255, 255, 255);
            tick();
            delay(perStep);
        }
    }

    void testCheckerboard(PanelTester& panel, int blockSize) {
        for (int y = 0; y < HEIGHT; y++) {
            for (int x = 0; x < WIDTH; x++) {
                const bool on = (((x / blockSize) + (y / blockSize)) % 2) == 0;
                if (on) panel.plotPixel(x, y, 255, 255, 255);
                else    panel.plotPixel(x, y, 0, 0, 0);
            }
        }
        tick();
        delay(TestDuration::CHECKERBOARD_MS);
    }

    void testWalkingPixel(PanelTester& panel) {
        const int totalPixels = WIDTH * HEIGHT;
        const unsigned long perStep = TestDuration::WALKING_PIXEL_MS / totalPixels;
        // A true 1ms-per-pixel walk of all 4096 pixels wouldn't fit in the
        // budget - stride through a representative subset (every 8th pixel)
        // so the walk still traverses the whole panel within the time slice.
        const int stride = 8;
        for (int i = 0; i < totalPixels; i += stride) {
            const int x = i % WIDTH;
            const int y = i / WIDTH;
            panel.clear();
            panel.plotPixel(x, y, 255, 255, 255);
            tick();
            delay(perStep * stride);
        }
    }

    void testNumberedGrid(PanelTester& panel) {
        panel.clear();
        const int gridSpacing = 8;
        for (int y = 0; y < HEIGHT; y += gridSpacing) {
            for (int x = 0; x < WIDTH; x++) panel.plotPixel(x, y, 40, 40, 40);
        }
        for (int x = 0; x < WIDTH; x += gridSpacing) {
            for (int y = 0; y < HEIGHT; y++) panel.plotPixel(x, y, 40, 40, 40);
        }
        for (int gy = 0; gy < HEIGHT; gy += gridSpacing) {
            for (int gx = 0; gx < WIDTH; gx += gridSpacing) {
                drawDigit(panel, gx + 1, gy + 1, (gx / gridSpacing) % 10, 255, 255, 0);
            }
        }
        tick();
        delay(TestDuration::GRID_MS);
    }

    void testCoordinateAxes(PanelTester& panel) {
        panel.clear();
        const int midY = HEIGHT / 2;
        const int midX = WIDTH / 2;
        for (int x = 0; x < WIDTH; x++)  panel.plotPixel(x, midY, 255, 0, 0);   // X axis, red
        for (int y = 0; y < HEIGHT; y++) panel.plotPixel(midX, y, 0, 255, 0);   // Y axis, green
        tick();
        delay(TestDuration::AXES_MS);
    }

    void testColouredQuadrants(PanelTester& panel) {
        const int midX = WIDTH / 2;
        const int midY = HEIGHT / 2;
        for (int y = 0; y < HEIGHT; y++) {
            for (int x = 0; x < WIDTH; x++) {
                const bool left = x < midX;
                const bool top = y < midY;
                if (top && left)        panel.plotPixel(x, y, 255, 0, 0);     // top-left: red
                else if (top && !left)  panel.plotPixel(x, y, 0, 255, 0);     // top-right: green
                else if (!top && left)  panel.plotPixel(x, y, 0, 0, 255);     // bottom-left: blue
                else                    panel.plotPixel(x, y, 255, 255, 255); // bottom-right: white
            }
        }
        tick();
        delay(TestDuration::QUADRANTS_MS);
    }

    // Tiny hand-plotted 3x5 bitmap font (digits 0-9 only, all this diagnostic
    // needs). Deliberately NOT using Adafruit_GFX text methods - those call
    // the library's own drawPixel/print directly in physical space, bypassing
    // MappingTester's logical->physical remap entirely, which would place
    // digits at the wrong location under any non-identity mapping.
    static void drawDigit(PanelTester& panel, int x0, int y0, int digit, uint8_t r, uint8_t g, uint8_t b) {
        static const uint8_t FONT[10][5] = {
            {0b111,0b101,0b101,0b101,0b111}, // 0
            {0b010,0b110,0b010,0b010,0b111}, // 1
            {0b111,0b001,0b111,0b100,0b111}, // 2
            {0b111,0b001,0b111,0b001,0b111}, // 3
            {0b101,0b101,0b111,0b001,0b001}, // 4
            {0b111,0b100,0b111,0b001,0b111}, // 5
            {0b111,0b100,0b111,0b101,0b111}, // 6
            {0b111,0b001,0b010,0b010,0b010}, // 7
            {0b111,0b101,0b111,0b101,0b111}, // 8
            {0b111,0b101,0b111,0b001,0b111}, // 9
        };
        if (digit < 0 || digit > 9) return;
        for (int row = 0; row < 5; row++) {
            for (int col = 0; col < 3; col++) {
                if (FONT[digit][row] & (0b100 >> col)) {
                    panel.plotPixel(x0 + col, y0 + row, r, g, b);
                }
            }
        }
    }

    unsigned long frameCount_ = 0;
};
