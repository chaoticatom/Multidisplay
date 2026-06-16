#pragma once

#include <WiFi.h>
#include <WiFiManager.h>
#include "config.h"

// ---------------------------------------------------------------------------
// wifi_setup.h - WiFi provisioning via WiFiManager.
//
// First boot (no saved credentials): starts a captive-portal AP
//   SSID:     "Multidisplay-Setup"
//   password: "cube1234"
// The user connects, browses to 192.168.4.1 and enters home WiFi creds,
// which WiFiManager persists to NVS.
//
// Subsequent boots: attempts to connect to the saved network. If it fails
// within 30 s, the portal AP is opened again.
//
// Returns true once connected to a station network.
// ---------------------------------------------------------------------------

inline bool connectWifi() {
    WiFi.mode(WIFI_STA);

    WiFiManager wm;
    wm.setConfigPortalTimeout(180);   // close portal after 3 min idle
    wm.setConnectTimeout(30);         // 30 s to join saved network
    wm.setAPCallback([](WiFiManager* mgr) {
        Serial.printf("[WiFi] Config portal started: SSID=%s pass=%s\n",
                      AP_SSID, AP_PASSWORD);
    });

    // autoConnect() tries saved creds first, then opens the portal AP if
    // they are missing or the join fails.
    bool ok = wm.autoConnect(AP_SSID, AP_PASSWORD);
    if (ok) {
        Serial.printf("[WiFi] Connected, IP=%s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("[WiFi] Failed to connect / portal timed out");
    }
    return ok;
}
