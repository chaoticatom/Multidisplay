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
        // Disable WiFi modem sleep. Default power-save periodically drops
        // the radio to save power, which shows up as exactly "reachable,
        // then not" flakiness under real load - and combined with the
        // HUB75 DMA task's CPU/memory-bandwidth demands (plus this board's
        // documented -80dBm/"poor" signal), the radio's sleep/wake timing
        // gets squeezed enough to intermittently miss or delay HTTP
        // requests. Costs a little extra power draw; worth it for a
        // always-on display that needs a reliable web UI.
        WiFi.setSleep(false);
        Serial.printf("[WiFi] Connected, IP=%s (modem sleep disabled)\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("[WiFi] Failed to connect / portal timed out");
    }
    return ok;
}
