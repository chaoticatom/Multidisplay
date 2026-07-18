// ===========================================================================
// HUB75 Scan-Rate / Addressing / Driver-Chip Sweep
// ---------------------------------------------------------------------------
// Cycles through 9 configurations forever, holding each for 10 seconds as a
// full-brightness solid white fill (the clearest way to see how many LEDs a
// given config actually lights), printing the active config over Serial
// before each one. Goal: find which combination lights ALL LEDs correctly.
// ===========================================================================

#include <Arduino.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

// --- Fixed pins (the confirmed-wired signals; only D/E vary per config) ---
#define R1_PIN  42
#define G1_PIN  41
#define B1_PIN  40
#define R2_PIN  39
#define G2_PIN  38
#define B2_PIN  37
#define A_PIN   36
#define B_PIN   35
#define C_PIN   45
#define LAT_PIN 21
#define OE_PIN  14
#define CLK_PIN 13

// The one extra address wire this panel's connector actually has, beyond
// A/B/C - which of D or E it drives (or whether it's used at all) is exactly
// what several of the configs below are testing.
#define EXTRA_WIRE_PIN 47

#define HOLD_MS 10000

struct ScanConfig {
    const char* name;
    int moduleHeight;
    int chainLength;
    int dPin;
    int ePin;
    HUB75_I2S_CFG::shift_driver driver;
    const char* driverName;
    const char* addressingDesc;
};

static const ScanConfig CONFIGS[] = {
    { "1/8 SCAN",              16, 4, -1,             -1,             HUB75_I2S_CFG::SHIFTREG, "SHIFTREG", "A/B/C only (3-bit, 8 row-groups)" },
    { "1/16 SCAN",             32, 2, EXTRA_WIRE_PIN, -1,             HUB75_I2S_CFG::SHIFTREG, "SHIFTREG", "A/B/C/D (4-bit, 16 row-groups)" },
    { "1/32 SCAN",             64, 1, EXTRA_WIRE_PIN, -1,             HUB75_I2S_CFG::SHIFTREG, "SHIFTREG", "A/B/C/D/E (5-bit, 32 row-groups), extra wire = D" },
    { "STANDARD ROW ADDRESSING", 64, 1, EXTRA_WIRE_PIN, -1,           HUB75_I2S_CFG::SHIFTREG, "SHIFTREG", "Library default full 5-bit binary addressing" },
    { "ABCDE ADDRESSING",      64, 1, EXTRA_WIRE_PIN, -1,             HUB75_I2S_CFG::SHIFTREG, "SHIFTREG", "Extra wire driven as D (weight 8), E left unconnected" },
    { "ABCE ADDRESSING",       64, 1, -1,              EXTRA_WIRE_PIN, HUB75_I2S_CFG::SHIFTREG, "SHIFTREG", "Extra wire driven as E (weight 16), D left unconnected" },
    { "FM6126A INIT",          64, 1, EXTRA_WIRE_PIN, -1,             HUB75_I2S_CFG::FM6126A,  "FM6126A",  "Smart-driver init sequence, A/B/C/D/E addressing" },
    { "ICN2038S INIT",         64, 1, EXTRA_WIRE_PIN, -1,             HUB75_I2S_CFG::ICN2038S, "ICN2038S", "Smart-driver init sequence, A/B/C/D/E addressing" },
    { "SHIFT-REGISTER INIT",   64, 1, EXTRA_WIRE_PIN, -1,             HUB75_I2S_CFG::SHIFTREG, "SHIFTREG", "Plain constant-current shift-register init" },
};
static const int NUM_CONFIGS = sizeof(CONFIGS) / sizeof(CONFIGS[0]);

MatrixPanel_I2S_DMA* display = nullptr;

static void printConfig(const ScanConfig& cfg) {
    Serial.println();
    Serial.println("=============================================");
    Serial.printf("  CONFIG: %s\n", cfg.name);
    Serial.printf("  Module height: %d, chain length: %d\n", cfg.moduleHeight, cfg.chainLength);
    Serial.printf("  D pin: %d, E pin: %d\n", cfg.dPin, cfg.ePin);
    Serial.printf("  Driver: %s\n", cfg.driverName);
    Serial.printf("  Addressing: %s\n", cfg.addressingDesc);
    Serial.println("=============================================");
}

static void applyConfig(const ScanConfig& cfg) {
    if (display) {
        delete display;
        display = nullptr;
        delay(200);   // let the previous DMA/I2S setup settle before reinitializing
    }

    HUB75_I2S_CFG::i2s_pins pins = {
        R1_PIN, G1_PIN, B1_PIN,
        R2_PIN, G2_PIN, B2_PIN,
        A_PIN,  B_PIN,  C_PIN, cfg.dPin, cfg.ePin,
        LAT_PIN, OE_PIN, CLK_PIN
    };

    HUB75_I2S_CFG mxconfig(64, cfg.moduleHeight, cfg.chainLength, pins);
    mxconfig.driver = cfg.driver;
    mxconfig.clkphase = true;
    mxconfig.double_buff = true;
    mxconfig.latch_blanking = 4;

    display = new MatrixPanel_I2S_DMA(mxconfig);
    if (!display->begin()) {
        Serial.printf("  [FAILED] begin() returned false for %s\n", cfg.name);
        return;
    }
    display->setBrightness8(90);
    display->fillScreen(display->color565(255, 255, 255));   // full white - clearest test of "does everything light"
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n[Boot] HUB75 scan-rate/addressing/driver sweep starting...");
    Serial.printf("[Boot] %d configs, %d ms each, looping forever.\n", NUM_CONFIGS, HOLD_MS);
}

void loop() {
    for (int i = 0; i < NUM_CONFIGS; i++) {
        const ScanConfig& cfg = CONFIGS[i];
        printConfig(cfg);
        applyConfig(cfg);
        delay(HOLD_MS);
    }
    Serial.println("\n[CYCLE COMPLETE] Restarting from config 1...\n");
}
