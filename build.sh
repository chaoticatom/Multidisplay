#!/usr/bin/env bash
# Build script: bundle Three.js and gzip all web assets for LittleFS upload
# Usage: ./build.sh
# Output: ./data/ directory ready to upload to ESP32-S3 LittleFS

set -e

DIST="./data"
THREEJS_URL="https://cdnjs.cloudflare.com/ajax/libs/three.js/r168/three.min.js"

echo "==> Cleaning output directory..."
rm -rf "$DIST"
mkdir -p "$DIST"

echo "==> Downloading Three.js r168..."
if curl -fL --max-time 30 "$THREEJS_URL" -o three.min.js; then
  echo "    three.min.js downloaded ($(wc -c < three.min.js) bytes)"
else
  echo "    WARNING: Could not download Three.js. Using existing file if present."
  if [ ! -s three.min.js ]; then
    echo "    ERROR: three.min.js missing or empty. Cannot build." >&2
    exit 1
  fi
fi

echo "==> Gzipping assets into $DIST/..."
for f in index.html style.css cube.js effects.js f1.js ui.js three.min.js; do
  if [ -f "$f" ]; then
    gzip -9 -c "$f" > "$DIST/${f}.gz"
    orig=$(wc -c < "$f")
    comp=$(wc -c < "$DIST/${f}.gz")
    pct=$(( (orig - comp) * 100 / orig ))
    printf "    %-20s %6d → %6d bytes (%d%% smaller)\n" "$f" "$orig" "$comp" "$pct"
  else
    echo "    WARNING: $f not found, skipping."
  fi
done

echo ""
echo "==> Build complete. Files in $DIST/:"
ls -lh "$DIST/"
echo ""
total=$(du -sh "$DIST/" | cut -f1)
echo "    Total size: $total"
echo ""
echo "==> Upload to ESP32-S3 with Arduino IDE or PlatformIO:"
echo "    Arduino: Sketch → Upload Filesystem Image"
echo "    PlatformIO: pio run --target uploadfs"
echo ""
echo "==> In your ESP32 firmware, serve gzipped files like this:"
echo '    server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html.gz");'
echo '    // Or manually:'
echo '    server.on("/", HTTP_GET, [](AsyncWebServerRequest *req){'
echo '      req->sendFile(LittleFS, "/index.html.gz", "text/html");'
echo '    });'
