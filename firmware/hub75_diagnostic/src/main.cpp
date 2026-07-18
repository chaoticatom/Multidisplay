// ===========================================================================
// HUB75 Wiring Diagnostic Firmware
// ---------------------------------------------------------------------------
// Goal: identify exactly how a HUB75 panel is wired/scanned - NOT to display
// graphics. Cycles automatically through 12 test patterns, holding each long
// enough to observe, then loops back to Test 1 and repeats forever so you
// don't need to reset the board between observations.
//
// Everything you'd need to change to test a different panel, scan theory, or
// wiring is in the CONFIGURATION section directly below - nothing else in
// this file should need editing.
// ===========================================================================

#include <Arduino.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

// ============================== CONFIGURATION ==============================

// --- Panel geometry ---------------------------------------------------------
#define PANEL_WIDTH     64
#define PANEL_HEIGHT    64
#define PANEL_CHAIN     1      // number of panels physically chained together

// --- Scan-rate / module-height theory --------------------------------------
// A true 1/32-scan 64-row panel is one module of the full PANEL_HEIGHT, one
// chain entry. Some panels are actually built as two or four internally-
// cascaded sub-modules (half-scan / quarter-scan) that need a SMALLER module
// height and a LONGER chain length to address correctly - the pixel data
// then needs remapping so logical rows land on the right physical strip.
// Set SCAN_SPLIT to 1 (true full-height scan - default), 2 (half-scan) or 4
// (quarter-scan) to test each theory without touching anything else below.
#define SCAN_SPLIT      1
#define MODULE_HEIGHT   (PANEL_HEIGHT / SCAN_SPLIT)
#define PANEL_CHAIN_LEN    (PANEL_CHAIN * SCAN_SPLIT)

// --- Row address type (documentation only) ----------------------------------
// The library always drives standard binary-coded row addresses (A=weight 1,
// B=weight 2, C=weight 4, D=weight 8, E=weight 16). This string is printed
// over Serial alongside the other settings purely so you have a record of
// what you believe is true for this panel - update it if you determine
// otherwise (e.g. a panel using a non-standard/shift-style row select).
#define ROW_ADDRESS_TYPE  "BINARY_CODED (A=1,B=2,C=4,D=8,E=16)"

// --- Driver chip -------------------------------------------------------------
// Match this to your panel's actual row-driver IC. SHIFTREG is correct for a
// plain constant-current shift-register sink (no special init sequence).
// FM6126A / FM6124 / ICN2038S are "smart" chips needing their own init
// sequence - picking the wrong one is a classic cause of a blank, dim, or
// garbled panel. (Exact enum member names depend on your installed library
// version - if one of these doesn't compile, check
// ESP32-HUB75-MatrixPanel-I2S-DMA.h's shift_driver enum for the exact names
// available and swap it in here.)
#define DRIVER_CHIP     HUB75_I2S_CFG::SHIFTREG

// --- HUB75 pin mapping -------------------------------------------------------
// Defaults below match the Multidisplay project's ESP32-S3 wiring. Change
// these to match whatever board/panel you're actually testing.
#define PIN_R1   42
#define PIN_G1   41
#define PIN_B1   40
#define PIN_R2   39
#define PIN_G2   38
#define PIN_B2   37
#define PIN_A    36
#define PIN_B    35
#define PIN_C    45
#define PIN_D    47
#define PIN_E    -1     // -1 if your panel doesn't have/need an E line
#define PIN_LAT  21
#define PIN_OE   14
#define PIN_CLK  13

// --- Timing ------------------------------------------------------------------
#define STATIC_TEST_MS      2500   // solid-colour tests (1-4), checkerboards (7-8)
#define STEP_TEST_MS         500   // per-row/column/number hold (tests 5, 6, 11)
#define ANIMATION_STEP_MS     40   // per-frame delay for moving line/pixel tests

// ============================================================================
// Nothing below this line should need editing to test a different panel.
// ============================================================================

MatrixPanel_I2S_DMA* display = nullptr;

// Fires at least every 2s regardless of which test is running - use
// diagDelay() instead of delay() everywhere in test code so a long test
// (e.g. the ~2.5-minute moving-pixel sweep) can never go silent for more
// than a couple seconds at a stretch. That silence was the real cause of
// "nothing happening" reports: the old code only printed once at the start
// of a test, so glancing at the monitor mid-test could show truly nothing
// for over a minute even with everything working correctly.
static unsigned long lastHeartbeat = 0;
static void heartbeatTick() {
    if (millis() - lastHeartbeat > 2000) {
        lastHeartbeat = millis();
        Serial.printf("[HEARTBEAT] alive, uptime %lus\n", millis() / 1000);
    }
}
static void diagDelay(unsigned long ms) {
    unsigned long start = millis();
    do {
        heartbeatTick();
        delay(10);
    } while (millis() - start < ms);
}

static const char* driverName(HUB75_I2S_CFG::shift_driver d) {
    switch (d) {
        case HUB75_I2S_CFG::SHIFTREG: return "SHIFTREG (generic constant-current sink)";
        case HUB75_I2S_CFG::FM6126A:  return "FM6126A (smart driver, needs init sequence)";
        case HUB75_I2S_CFG::FM6124:   return "FM6124 (smart driver, needs init sequence)";
        case HUB75_I2S_CFG::ICN2038S: return "ICN2038S (smart driver, needs init sequence)";
        default:                     return "UNKNOWN - update driverName() for this enum value";
    }
}

static void printConfig() {
    Serial.println();
    Serial.println("=============================================");
    Serial.println("  HUB75 Wiring Diagnostic - active configuration");
    Serial.println("=============================================");
    Serial.printf("  Panel size:      %d x %d, chain length %d\n", PANEL_WIDTH, PANEL_HEIGHT, PANEL_CHAIN);
    Serial.printf("  Current scan rate:  1/%d (module height %d, %d chain entries per panel)\n",
                  MODULE_HEIGHT / 2, MODULE_HEIGHT, SCAN_SPLIT);
    Serial.printf("  Current row mapping: SCAN_SPLIT=%d -> module height %d px, virtual chain length %d\n",
                  SCAN_SPLIT, MODULE_HEIGHT, PANEL_CHAIN_LEN);
    Serial.printf("  Current driver type: %s\n", driverName(DRIVER_CHIP));
    Serial.printf("  Current address type: %s\n", ROW_ADDRESS_TYPE);
    Serial.printf("  Pins: R1=%d G1=%d B1=%d R2=%d G2=%d B2=%d\n",
                  PIN_R1, PIN_G1, PIN_B1, PIN_R2, PIN_G2, PIN_B2);
    Serial.printf("        A=%d B=%d C=%d D=%d E=%d  LAT=%d OE=%d CLK=%d\n",
                  PIN_A, PIN_B, PIN_C, PIN_D, PIN_E, PIN_LAT, PIN_OE, PIN_CLK);
    Serial.println("=============================================");
    Serial.println();
}

static void fillSolid(uint8_t r, uint8_t g, uint8_t b) {
    display->fillScreen(display->color565(r, g, b));
}

// Test 5: light only one row at a time, moving down, 1 row/sec.
static void testRowSweep() {
    Serial.println("[TEST 5] Row sweep - lit row moves down, one row/step.");
    for (int y = 0; y < PANEL_HEIGHT; y++) {
        display->fillScreen(display->color565(0, 0, 0));
        display->drawFastHLine(0, y, PANEL_WIDTH, display->color565(255, 255, 255));
        Serial.printf("  row %d lit\n", y);
        diagDelay(STEP_TEST_MS);
    }
}

// Test 6: light only one column at a time, moving across, 1 column/sec.
static void testColumnSweep() {
    Serial.println("[TEST 6] Column sweep - lit column moves across, one column/step.");
    for (int x = 0; x < PANEL_WIDTH; x++) {
        display->fillScreen(display->color565(0, 0, 0));
        display->drawFastVLine(x, 0, PANEL_HEIGHT, display->color565(255, 255, 255));
        Serial.printf("  column %d lit\n", x);
        diagDelay(STEP_TEST_MS);
    }
}

// Tests 7/8: checkerboard at a given block size (8 = 8x8 blocks, 1 = single pixel).
static void testCheckerboard(int blockSize) {
    Serial.printf("[TEST] Checkerboard, %dx%d blocks.\n", blockSize, blockSize);
    for (int y = 0; y < PANEL_HEIGHT; y++) {
        for (int x = 0; x < PANEL_WIDTH; x++) {
            bool on = (((x / blockSize) + (y / blockSize)) % 2) == 0;
            display->drawPixel(x, y, on ? display->color565(255, 255, 255) : display->color565(0, 0, 0));
        }
    }
    diagDelay(STATIC_TEST_MS);
}

// Test 9: moving vertical white line, left to right.
static void testMovingVLine() {
    Serial.println("[TEST 9] Moving vertical line, left to right.");
    for (int x = 0; x < PANEL_WIDTH; x++) {
        display->fillScreen(display->color565(0, 0, 0));
        display->drawFastVLine(x, 0, PANEL_HEIGHT, display->color565(255, 255, 255));
        diagDelay(ANIMATION_STEP_MS);
    }
}

// Test 10: moving horizontal white line, top to bottom.
static void testMovingHLine() {
    Serial.println("[TEST 10] Moving horizontal line, top to bottom.");
    for (int y = 0; y < PANEL_HEIGHT; y++) {
        display->fillScreen(display->color565(0, 0, 0));
        display->drawFastHLine(0, y, PANEL_WIDTH, display->color565(255, 255, 255));
        diagDelay(ANIMATION_STEP_MS);
    }
}

// Test 11: print the row address number at each row position in turn, so you
// can read off (via camera/eye) exactly which physical row corresponds to
// which address value - the core question this whole tool exists to answer.
static void testRowNumbers() {
    Serial.println("[TEST 11] Row address numbers - printed at each row in turn.");
    for (int y = 0; y < PANEL_HEIGHT; y++) {
        display->fillScreen(display->color565(0, 0, 0));
        display->setTextColor(display->color565(255, 255, 0));
        display->setTextSize(1);
        display->setCursor(0, y);
        display->print(y);
        Serial.printf("  showing row number %d\n", y);
        diagDelay(STEP_TEST_MS);
    }
}

// Test 12: single white pixel visiting every LED on the panel, row by row.
static void testMovingPixel() {
    Serial.println("[TEST 12] Single moving pixel - visiting every LED, row by row.");
    for (int y = 0; y < PANEL_HEIGHT; y++) {
        for (int x = 0; x < PANEL_WIDTH; x++) {
            display->fillScreen(display->color565(0, 0, 0));
            display->drawPixel(x, y, display->color565(255, 255, 255));
            diagDelay(ANIMATION_STEP_MS);
        }
    }
}

static void runDiagnosticCycle() {
    printConfig();

    Serial.println("[TEST 1] Solid RED");
    fillSolid(255, 0, 0);
    diagDelay(STATIC_TEST_MS);

    Serial.println("[TEST 2] Solid GREEN");
    fillSolid(0, 255, 0);
    diagDelay(STATIC_TEST_MS);

    Serial.println("[TEST 3] Solid BLUE");
    fillSolid(0, 0, 255);
    diagDelay(STATIC_TEST_MS);

    Serial.println("[TEST 4] Solid WHITE");
    fillSolid(255, 255, 255);
    diagDelay(STATIC_TEST_MS);

    testRowSweep();       // Test 5
    testColumnSweep();    // Test 6

    Serial.println("[TEST 7] 8x8 checkerboard");
    testCheckerboard(8);

    Serial.println("[TEST 8] 1-pixel checkerboard");
    testCheckerboard(1);

    testMovingVLine();    // Test 9
    testMovingHLine();    // Test 10
    testRowNumbers();     // Test 11
    testMovingPixel();    // Test 12

    Serial.println("[CYCLE COMPLETE] Restarting from Test 1...\n");
}

// Prints then immediately flushes - USB-CDC serial is buffered/async, so
// queued-but-unsent bytes can be lost entirely if the chip crashes/resets a
// moment later, unlike a hardware UART. Flushing after every boot-sequence
// line means whatever we see is a true record of how far execution actually
// got before anything went wrong, not an artifact of buffering.
static void logStep(const char* msg) {
    Serial.println(msg);
    Serial.flush();
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    logStep("\n[Boot] HUB75 wiring diagnostic starting...");
    logStep("[Boot] Step 1: Serial up.");

    HUB75_I2S_CFG::i2s_pins pins = {
        PIN_R1, PIN_G1, PIN_B1,
        PIN_R2, PIN_G2, PIN_B2,
        PIN_A,  PIN_B,  PIN_C,  PIN_D, PIN_E,
        PIN_LAT, PIN_OE, PIN_CLK
    };
    logStep("[Boot] Step 2: pin struct built.");

    HUB75_I2S_CFG cfg(PANEL_WIDTH, MODULE_HEIGHT, PANEL_CHAIN_LEN, pins);
    cfg.driver = DRIVER_CHIP;
    cfg.clkphase = true;
    cfg.double_buff = true;
    logStep("[Boot] Step 3: HUB75_I2S_CFG constructed.");

    display = new MatrixPanel_I2S_DMA(cfg);
    logStep("[Boot] Step 4: MatrixPanel_I2S_DMA allocated - about to call begin()...");

    if (!display->begin()) {
        // Repeat forever, not just once - so this can't be missed no matter
        // when a serial monitor happens to attach.
        while (true) {
            logStep("[FATAL] display->begin() failed - DMA allocation error. Halting.");
            delay(1000);
        }
    }
    logStep("[Boot] Step 5: begin() returned true.");
    display->setBrightness8(90);
    display->clearScreen();
    logStep("[Boot] Display initialized OK.");
}

void loop() {
    runDiagnosticCycle();   // diagDelay() inside it keeps the heartbeat alive throughout
}
