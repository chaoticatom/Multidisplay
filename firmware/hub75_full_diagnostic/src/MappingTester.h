#pragma once

#include <Arduino.h>
#include "PanelTypes.h"
#include "Pins.h"

// ===========================================================================
// MappingTester - translates "logical" pixel coordinates (the full
// 0..PANEL_WIDTH-1 / 0..PANEL_HEIGHT-1 space every test in DiagnosticRenderer
// draws in) into the physical coordinate space the library's virtual canvas
// actually needs for a given configuration.
//
// Two independent things get folded into one remap here:
//   1. "Virtual matrix mapping" - when ScanRate splits the panel into
//      multiple virtual chain modules (1/8 and 1/16 scan both do this;
//      1/32 doesn't), each logical row lands in a different virtual module,
//      the same technique validated earlier in this project's debugging
//      history (see firmware/src/led_matrix.h's ScanSplitPanel).
//   2. Row/column order reversal - independent of scan-rate splitting,
//      applied to the logical coordinate BEFORE the scan-rate remap.
// ===========================================================================
class MappingTester {
public:
    void configure(const PanelConfiguration& config) {
        scanSplit_ = chainLengthFor(config.scanRate);
        stripHeight_ = moduleHeightFor(config.scanRate);
        rowOrder_ = config.rowOrder;
        columnOrder_ = config.columnOrder;
    }

    // Physical canvas dimensions the library needs to be configured with,
    // for the currently-configured scan rate.
    int physicalWidth() const  { return Pins::PANEL_WIDTH * scanSplit_ * Pins::PANEL_CHAIN; }
    int physicalHeight() const { return stripHeight_; }

    void mapCoordinates(int logicalX, int logicalY, int16_t& physicalX, int16_t& physicalY) const {
        int x = logicalX;
        int y = logicalY;

        if (columnOrder_ == ColumnOrder::REVERSED) {
            x = (Pins::PANEL_WIDTH - 1) - x;
        }
        if (rowOrder_ == RowOrder::REVERSED) {
            y = (Pins::PANEL_HEIGHT - 1) - y;
        }

        const int stripIndex = y / stripHeight_;
        const int panelIndex = x / Pins::PANEL_WIDTH;   // always 0 - single physical panel
        const int localX = x % Pins::PANEL_WIDTH;
        const int moduleIndex = panelIndex * scanSplit_ + stripIndex;

        physicalY = (int16_t)(y % stripHeight_);
        physicalX = (int16_t)(moduleIndex * Pins::PANEL_WIDTH + localX);
    }

private:
    int scanSplit_ = 1;
    int stripHeight_ = Pins::PANEL_HEIGHT;
    RowOrder rowOrder_ = RowOrder::NORMAL;
    ColumnOrder columnOrder_ = ColumnOrder::NORMAL;
};
