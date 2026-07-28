#!/usr/bin/env bash
# Build script: bundle Three.js and gzip all web assets for LittleFS upload
# Usage: ./build.sh
# Output: ./data/ directory ready to upload to ESP32-S3 LittleFS

set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

DIST="./data"

echo "==> Cleaning output directory..."
rm -rf "$DIST"
mkdir -p "$DIST"

# Custom tree-shaken Three.js build (build-tools/three-entry.js) instead of
# the full upstream r168 minified UMD build. The ESP32-S3's lwIP/AsyncTCP
# stack wedges on sustained large-file transfers (see platformio.ini's
# notes - every firmware-side mitigation tried has failed to fix it
# outright), so shrinking the file itself is the remaining lever. Only
# exports the ~20 THREE.* symbols the app actually references (see
# three-entry.js) - WebGLRenderer's own shader/material library still
# dominates the bundle since three.js isn't tree-shakeable at that depth,
# but this still cuts real bytes off every serve.
echo "==> Building tree-shaken Three.js bundle..."
if [ ! -d node_modules/esbuild ] || [ ! -d node_modules/three ]; then
  npm install --no-audit --no-fund
fi
if npx esbuild build-tools/three-entry.js --bundle --minify --format=iife --global-name=THREE --outfile=three.min.js; then
  echo "    three.min.js built ($(wc -c < three.min.js) bytes)"
else
  echo "    WARNING: Could not build custom Three.js bundle. Using existing file if present."
  if [ ! -s three.min.js ]; then
    echo "    ERROR: three.min.js missing or empty. Cannot build." >&2
    exit 1
  fi
fi

# Split into THREE_PART_COUNT text-safe chunks (index.html's loadThree()
# fetches each in turn and reassembles before executing) so the ESP32 never
# has to serve one continuous ~480KB response - see three.min.js's build
# comment above and split-three.js for why. Keep this count in sync with
# THREE_PART_COUNT in index.html.
THREE_PART_COUNT=4
echo "==> Splitting three.min.js into $THREE_PART_COUNT parts..."
node build-tools/split-three.js three.min.js three.part "$THREE_PART_COUNT"

echo "==> Gzipping assets into $DIST/..."
# Keep this file list in sync with build.ps1 (the Windows/no-WSL
# equivalent). style.css and version.js are inlined directly into
# index.html (cuts 2 concurrent connections off the page-load flurry on
# this board's ~16-20KB heap) so they're no longer separate served
# assets - don't re-add them here without also un-inlining index.html.
# If any of these fail to gzip, the build is not safe to flash (see the
# empty-filesystem-flashed incident this check was added for).
THREE_PARTS=""
for i in $(seq 0 $((THREE_PART_COUNT - 1))); do THREE_PARTS="$THREE_PARTS three.part${i}.js"; done

REQUIRED="index.html cube.js effects-core.js effects-motion.js effects-physics.js effects-colour.js effects-livedata.js effects-games.js effects-scenes.js effects-media.js ui.js$THREE_PARTS"
MISSING=""

for f in index.html cube.js effects-core.js effects-motion.js effects-physics.js effects-colour.js effects-livedata.js effects-games.js effects-scenes.js effects-media.js ui.js $THREE_PARTS manifest.json service-worker.js sw.js icons/icon-192.png icons/icon-512.png icons/icon.svg; do
  if [ -f "$f" ]; then
    mkdir -p "$DIST/$(dirname "$f")"
    gzip -9 -c "$f" > "$DIST/${f}.gz"
    orig=$(wc -c < "$f")
    comp=$(wc -c < "$DIST/${f}.gz")
    pct=$(( (orig - comp) * 100 / orig ))
    printf "    %-20s %6d → %6d bytes (%d%% smaller)\n" "$f" "$orig" "$comp" "$pct"
  else
    echo "    WARNING: $f not found, skipping."
    MISSING="$MISSING $f"
  fi
done

echo ""
echo "==> Build complete. Files in $DIST/:"
ls -lh "$DIST/"
echo ""
total=$(du -sh "$DIST/" | cut -f1)
echo "    Total size: $total"
echo ""

for f in $REQUIRED; do
  case " $MISSING " in
    *" $f "*)
      echo "ERROR: required file '$f' is missing from $DIST/ - refusing to leave a broken image for uploadfs." >&2
      exit 1
      ;;
  esac
done
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
