#include "cam_api.h"
#include "cam_client.h"
#include <ArduinoJson.h>

void camApiInit(AsyncWebServer& server) {
  // GET /api/cam/snap — returns latest JPEG frame
  server.on("/api/cam/snap", HTTP_GET, [](AsyncWebServerRequest* req) {
    const uint8_t* buf; size_t len;
    if (!camGetLatestJpeg(&buf, &len)) {
      req->send(503, "text/plain", "No frame yet");
      return;
    }
    // Copy so we can release the mutex before sending
    uint8_t* copy = (uint8_t*)malloc(len);
    if (!copy) { camReleaseJpeg(); req->send(503, "text/plain", "OOM"); return; }
    memcpy(copy, buf, len);
    camReleaseJpeg();
    AsyncWebServerResponse* resp = req->beginResponse_P(200, "image/jpeg", copy, len);
    resp->addHeader("Cache-Control", "no-store");
    resp->addHeader("Access-Control-Allow-Origin", "*");
    req->send(resp);
    free(copy);
  });

  // GET /api/cam/status
  server.on("/api/cam/status", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument doc;
    doc["running"] = camIsRunning();
    doc["fetches"] = camGetFetchCount();
    doc["errors"] = camGetErrorCount();
    String out; serializeJson(doc, out);
    req->send(200, "application/json", out);
  });
}
