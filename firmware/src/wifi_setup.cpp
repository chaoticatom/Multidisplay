#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include "config.h"
#include "wifi_setup.h"

// See wifi_setup.h for why this implementation lives in its own .cpp file
// rather than being inline in the header.

bool connectWifi() {
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
