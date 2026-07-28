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
    // beginResponse_P is for PROGMEM/flash data that lives forever (see the
    // /loader route below) - the free(copy) that used to follow req->send()
    // here was a use-after-free: send() only queues the response, the bytes
    // are actually read out and transmitted later, asynchronously, by
    // AsyncTCP as the socket becomes writable, well after this handler (and
    // that free()) already returned. A length-known response with its own
    // fill callback (same pattern as web_server.h's static-file streaming)
    // instead reads directly from `copy` and only frees it once the
    // callback has actually consumed every byte.
    size_t total = len;
    AsyncWebServerResponse* resp = req->beginResponse("image/jpeg", total,
        [copy, total](uint8_t* dst, size_t maxLen, size_t index) mutable -> size_t {
            size_t remaining = total - index;
            size_t toCopy = remaining < maxLen ? remaining : maxLen;
            memcpy(dst, copy + index, toCopy);
            if (index + toCopy >= total) free(copy);
            return toCopy;
        });
    resp->addHeader("Cache-Control", "no-store");
    resp->addHeader("Access-Control-Allow-Origin", "*");
    req->send(resp);
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
