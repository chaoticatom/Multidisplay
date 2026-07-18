// Bare-minimum test: no HUB75 library, no Adafruit GFX, nothing except
// Arduino core + the onboard LED. Purpose: isolate whether THIS board, THIS
// COM port, and THIS monitor setup can show ANY serial output at all right
// now - before blaming the HUB75 library for total silence seen elsewhere.
#include <Arduino.h>

#define LED_PIN 2   // built-in LED on most ESP32-S3 devkits; harmless if wrong

void setup() {
    pinMode(LED_PIN, OUTPUT);
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n[BARE TEST] Booted. If you can read this, Serial works.");
}

void loop() {
    static unsigned long lastPrint = 0;
    static bool ledOn = false;
    static unsigned long count = 0;

    digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
    ledOn = !ledOn;

    if (millis() - lastPrint > 1000) {
        lastPrint = millis();
        count++;
        Serial.printf("[BARE TEST] tick %lu, uptime %lus\n", count, millis() / 1000);
        Serial.flush();
    }
    delay(200);
}
