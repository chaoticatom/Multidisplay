#pragma once

#include <Arduino.h>
#include "PanelTypes.h"
#include "MappingTester.h"

// ===========================================================================
// Diagnostics - Serial reporting. Two responsibilities: printing a
// configuration before it's applied, and printing post-test stats
// afterward (memory, approximate frame rate).
//
// Honest limitation: there is no photosensor/camera feedback in this
// firmware, so "rows detected" / "columns detected" / autonomous fault
// classification (scan rate vs addressing vs mapping vs timing vs driver)
// are NOT computed automatically - that would require optical feedback this
// hardware doesn't have. What's printed instead is the actual configured
// geometry plus enough labelling (config name, index, every parameter) that
// a human watching the panel can read off which category is at fault by
// correlating what's printed with what's visible.
// ===========================================================================
class Diagnostics {
public:
    static void printConfiguration(int index, int total, const PanelConfiguration& config) {
        Serial.println();
        Serial.println("=================================================");
        Serial.printf("  CONFIGURATION %d / %d: %s\n", index + 1, total, config.name);
        Serial.printf("  Scan rate:        %s\n", scanRateName(config.scanRate));
        Serial.printf("  Multiplex mode:   %d row-groups (module height %d px, chain length %d)\n",
                      moduleHeightFor(config.scanRate) / 2,
                      moduleHeightFor(config.scanRate), chainLengthFor(config.scanRate));
        Serial.printf("  Address mapping:  %s\n", addressMappingName(config.addressMapping));
        Serial.printf("  Row order:        %s\n", rowOrderName(config.rowOrder));
        Serial.printf("  Column order:     %s\n", columnOrderName(config.columnOrder));
        Serial.printf("  Driver type:      %s\n", driverTypeName(config.driverType));
        Serial.printf("  Latch blanking:   %d\n", config.latchBlanking);
        Serial.printf("  Clock phase:      %s\n", config.clockPhaseInverted ? "INVERTED" : "NORMAL");
        Serial.printf("  Double buffer:    %s\n", config.doubleBuffer ? "ON" : "OFF");
        Serial.println("=================================================");
    }

    static void printBeginFailure(const PanelConfiguration& config) {
        Serial.printf("  [FAILED] display->begin() returned false for \"%s\" - skipping.\n", config.name);
        Serial.println("  Likely cause: DMA/memory allocation error for this specific geometry,");
        Serial.println("  not a wiring/addressing issue (those would show as a wrong PATTERN,");
        Serial.println("  not an outright begin() failure).");
    }

    // Called after a configuration's on-screen time is done - reports the
    // configured geometry (not detected - see class-level note above) plus
    // real memory/frame-rate figures.
    static void printPostTestStats(const PanelConfiguration& config, const MappingTester& mapping,
                                    unsigned long frameCount, unsigned long elapsedMs) {
        const float fps = elapsedMs > 0 ? (frameCount * 1000.0f / elapsedMs) : 0.0f;
        Serial.println("  --- Post-test diagnostics ---");
        Serial.printf("  Rows configured:      %d\n", Pins::PANEL_HEIGHT);
        Serial.printf("  Columns configured:   %d\n", Pins::PANEL_WIDTH);
        Serial.printf("  Physical canvas:      %d x %d (module height %d x chain %d)\n",
                      mapping.physicalWidth(), mapping.physicalHeight(),
                      mapping.physicalHeight(), mapping.physicalWidth() / Pins::PANEL_WIDTH);
        Serial.printf("  Approx. frame rate:   %.1f fps (%lu ticks / %lu ms)\n", fps, frameCount, elapsedMs);
        Serial.printf("  Free heap:            %u bytes\n", ESP.getFreeHeap());
        Serial.printf("  Free PSRAM:           %u bytes\n", ESP.getFreePsram());
        Serial.printf("  Current mapping:      %s / %s\n",
                      rowOrderName(config.rowOrder), columnOrderName(config.columnOrder));
        Serial.printf("  Current timing:       latch_blanking=%d, clkphase=%s\n",
                      config.latchBlanking, config.clockPhaseInverted ? "INVERTED" : "NORMAL");
        Serial.println("  ------------------------------");
    }
};
