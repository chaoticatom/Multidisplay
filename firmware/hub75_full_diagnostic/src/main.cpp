// ===========================================================================
// HUB75 Full Wiring/Scan-Rate/Addressing/Driver Diagnostic
// ---------------------------------------------------------------------------
// Cycles forever through PANEL_CONFIGS[] (see PanelTypes.h), holding each
// configuration on screen for HOLD_TIME_MS while running all 12 required
// test patterns, printing the configuration and post-test diagnostics over
// Serial before/after each one.
//
// Architecture (per the "use classes, separate files" requirement):
//   PanelTypes.h        - enums, PanelConfiguration struct, the sweep list
//   Pins.h               - fixed physical wiring constants
//   MappingTester.h      - logical -> physical coordinate translation
//   PanelTester.h        - owns the MatrixPanel_I2S_DMA instance, applies a
//                          PanelConfiguration, exposes plotPixel()/fillAll()
//   DiagnosticRenderer.h - the 12 test patterns
//   Diagnostics.h        - Serial reporting
// ===========================================================================

#include <Arduino.h>
#include "PanelTypes.h"
#include "PanelTester.h"
#include "DiagnosticRenderer.h"
#include "Diagnostics.h"

static const unsigned long HOLD_TIME_MS = 8000;

static PanelTester panelTester;
static DiagnosticRenderer renderer;

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n[Boot] HUB75 full diagnostic starting...");
    Serial.printf("[Boot] %d configurations queued, %lu ms each, looping forever.\n",
                  NUM_PANEL_CONFIGS, HOLD_TIME_MS);
}

void loop() {
    for (int i = 0; i < NUM_PANEL_CONFIGS; i++) {
        const PanelConfiguration& config = PANEL_CONFIGS[i];
        Diagnostics::printConfiguration(i, NUM_PANEL_CONFIGS, config);

        if (!panelTester.applyConfiguration(config)) {
            Diagnostics::printBeginFailure(config);
            delay(HOLD_TIME_MS);
            continue;
        }

        renderer.resetFrameCount();
        const unsigned long startMs = millis();
        renderer.runAllTests(panelTester);
        const unsigned long elapsedMs = millis() - startMs;

        // MappingTester instance used for this config lives inside
        // panelTester; reconstruct an equivalent one just for reporting
        // physical-canvas dimensions (cheap - it's a tiny value object).
        MappingTester reportMapping;
        reportMapping.configure(config);
        Diagnostics::printPostTestStats(config, reportMapping, renderer.frameCount(), elapsedMs);

        // Fill remaining hold time (test patterns may finish early or late
        // relative to HOLD_TIME_MS - keep total per-config time consistent).
        const unsigned long totalSoFar = elapsedMs;
        if (totalSoFar < HOLD_TIME_MS) {
            delay(HOLD_TIME_MS - totalSoFar);
        }
    }
    Serial.println("\n[CYCLE COMPLETE] Restarting from configuration 1...\n");
}
