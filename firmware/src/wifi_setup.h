#pragma once

// ---------------------------------------------------------------------------
// wifi_setup.h - WiFi provisioning via WiFiManager.
//
// Just the declaration here, deliberately. The implementation (and the
// <WiFiManager.h> include, which pulls in the synchronous <WebServer.h>)
// lives in wifi_setup.cpp instead of being inline in this header. That
// keeps WiFiManager.h out of any translation unit that also includes
// ESPAsyncWebServer.h (i.e. main.cpp, via web_server.h) — both define their
// own same-named HTTP method enum (HTTP_GET, HTTP_DELETE, etc.), which is a
// well-documented compile-time conflict between these two libraries when
// their headers land in the same .cpp file. WiFiManager's portal and our
// own async web server never actually run at the same time (the portal
// finishes and tears down during connectWifi(), before initWebServer() is
// ever called), so this is a header-organization fix, not a behavior
// change.
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
bool connectWifi();
