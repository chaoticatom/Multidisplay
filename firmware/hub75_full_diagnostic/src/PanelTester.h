#pragma once

#include <Arduino.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>
#include "PanelTypes.h"
#include "Pins.h"
#include "MappingTester.h"

// ===========================================================================
// PanelTester - owns the single MatrixPanel_I2S_DMA instance and applies a
// PanelConfiguration to it (tearing down and reconstructing the DMA/I2S
// setup each time, since scan rate/chain length/driver are all fixed at
// construction time in this library - there's no "reconfigure in place").
//
// All pixel plotting for logical (test-pattern-space) coordinates goes
// through plotPixel(), which consults MappingTester for the actual physical
// address. fillAll() bypasses mapping entirely (a full-buffer fill floods
// every physically addressable pixel regardless of mapping correctness -
// useful as the very first go/no-go check independent of any coordinate
// theory being right).
// ===========================================================================
class PanelTester {
public:
    // Tears down any previous display, builds a fresh one for the given
    // configuration, and calls begin(). Returns false (and leaves display()
    // null) if begin() itself fails - a distinct failure mode from "wrong
    // config but panel lights up incorrectly".
    bool applyConfiguration(const PanelConfiguration& config) {
        teardown();
        mapping_.configure(config);

        const int dPin = (config.addressMapping == AddressMapping::ABCE)
            ? Pins::NOT_CONNECTED
            : Pins::EXTRA_ADDRESS_WIRE;
        const int ePin = (config.addressMapping == AddressMapping::ABCE)
            ? Pins::EXTRA_ADDRESS_WIRE
            : Pins::NOT_CONNECTED;

        HUB75_I2S_CFG::i2s_pins pins = {
            Pins::R1, Pins::G1, Pins::B1,
            Pins::R2, Pins::G2, Pins::B2,
            Pins::A,  Pins::B,  Pins::C, dPin, ePin,
            Pins::LAT, Pins::OE, Pins::CLK
        };

        HUB75_I2S_CFG mxconfig(
            Pins::PANEL_WIDTH,
            moduleHeightFor(config.scanRate),
            chainLengthFor(config.scanRate) * Pins::PANEL_CHAIN,
            pins
        );
        mxconfig.driver = toLibraryDriver(config.driverType);
        mxconfig.clkphase = config.clockPhaseInverted;
        mxconfig.double_buff = config.doubleBuffer;
        mxconfig.latch_blanking = config.latchBlanking;

        display_ = new MatrixPanel_I2S_DMA(mxconfig);
        if (!display_->begin()) {
            delete display_;
            display_ = nullptr;
            return false;
        }
        display_->setBrightness8(90);
        display_->clearScreen();
        return true;
    }

    bool isReady() const { return display_ != nullptr; }
    MatrixPanel_I2S_DMA* display() const { return display_; }

    // Logical-space plot - goes through the mapping for the current config.
    void plotPixel(int logicalX, int logicalY, uint8_t r, uint8_t g, uint8_t b) {
        if (!display_) return;
        int16_t px, py;
        mapping_.mapCoordinates(logicalX, logicalY, px, py);
        display_->drawPixel(px, py, display_->color565(r, g, b));
    }

    // Bypasses mapping entirely - floods the whole physical buffer.
    void fillAll(uint8_t r, uint8_t g, uint8_t b) {
        if (!display_) return;
        display_->fillScreen(display_->color565(r, g, b));
    }

    void clear() {
        if (!display_) return;
        display_->clearScreen();
    }

private:
    void teardown() {
        if (display_) {
            delete display_;
            display_ = nullptr;
            delay(200);   // let the previous DMA/I2S peripheral settle before reinitializing
        }
    }

    MatrixPanel_I2S_DMA* display_ = nullptr;
    MappingTester mapping_;
};
