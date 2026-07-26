# Build script (PowerShell): bundle Three.js and gzip all web assets for
# LittleFS upload. Equivalent of build.sh, for machines without a working
# WSL/bash - both must stay in sync (same file list) since either can be
# used depending on what's available.
#
# Usage: powershell -ExecutionPolicy Bypass -File build.ps1
#   (or just `.\build.ps1` from a PowerShell prompt with local scripts allowed)
# Output: .\data\ directory ready to upload to ESP32-S3 LittleFS
# (firmware/platformio.ini has data_dir = ../data pointing at this folder)

$ErrorActionPreference = "Stop"

# Anchor to the script's own directory rather than trusting the caller's
# current directory - relative paths below silently resolved against the
# wrong folder before this fix (e.g. running from one level up), which let
# the gzip loop fail on the very first file without aborting the build.
Set-Location $PSScriptRoot

$Dist = ".\data"
$ThreeJsUrl = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r168/three.min.js"

Write-Host "==> Cleaning output directory..."
if (Test-Path $Dist) { Remove-Item -Recurse -Force $Dist }
New-Item -ItemType Directory -Path $Dist | Out-Null

Write-Host "==> Downloading Three.js r168..."
try {
    Invoke-WebRequest -Uri $ThreeJsUrl -OutFile "three.min.js" -TimeoutSec 30
    $size = (Get-Item "three.min.js").Length
    Write-Host "    three.min.js downloaded ($size bytes)"
} catch {
    Write-Host "    WARNING: Could not download Three.js. Using existing file if present."
    if (-not (Test-Path "three.min.js") -or (Get-Item "three.min.js").Length -eq 0) {
        Write-Error "three.min.js missing or empty. Cannot build."
    }
}

function GzipFile($srcPath, $dstPath) {
    $inBytes = [System.IO.File]::ReadAllBytes($srcPath)
    $outStream = [System.IO.File]::Create($dstPath)
    $gzip = New-Object System.IO.Compression.GZipStream($outStream, [System.IO.Compression.CompressionLevel]::Optimal)
    $gzip.Write($inBytes, 0, $inBytes.Length)
    $gzip.Close()
    $outStream.Close()
}

Write-Host "==> Gzipping assets into $Dist\..."
# Same file list as build.sh - keep both in sync. version.js, sw.js, and
# icons/icon.svg were missing from build.sh before this fix; the server
# falls back to serving an uncompressed file if no .gz sibling exists, so
# gzipping everything here is always safe.
$files = @(
    "index.html", "style.css", "version.js",
    "cube.js", "effects.js", "ui.js",
    "three.min.js", "manifest.json",
    "service-worker.js", "sw.js",
    "icons\icon-192.png", "icons\icon-512.png", "icons\icon.svg"
)

# Files the app cannot run without - if any of these fail to gzip, the
# build is not safe to flash (see the empty-filesystem-flashed incident
# this check was added for).
$required = @("index.html", "style.css", "version.js", "cube.js", "effects.js", "ui.js")
$missing = @()

foreach ($f in $files) {
    if (Test-Path $f) {
        $dstDir = Join-Path $Dist (Split-Path $f -Parent)
        if ($dstDir -and -not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir | Out-Null }
        $dst = Join-Path $Dist "$f.gz"
        GzipFile $f $dst
        $orig = (Get-Item $f).Length
        $comp = (Get-Item $dst).Length
        $pct = [math]::Round((($orig - $comp) * 100 / $orig))
        Write-Host ("    {0,-24} {1,6} -> {2,6} bytes ({3}% smaller)" -f $f, $orig, $comp, $pct)
    } else {
        Write-Host "    WARNING: $f not found, skipping."
        $missing += $f
    }
}

Write-Host ""
Write-Host "==> Build complete. Files in $Dist\:"
Get-ChildItem -Recurse $Dist | ForEach-Object { Write-Host "    $($_.FullName)" }
Write-Host ""

$missingRequired = $required | Where-Object { $missing -contains $_ }
if ($missingRequired) {
    Write-Error "Build incomplete - required file(s) missing from $Dist\: $($missingRequired -join ', '). Refusing to leave a broken image for uploadfs. Fix the source problem and rerun."
}

Write-Host "==> Upload to ESP32-S3 with PlatformIO:"
Write-Host "    cd firmware; python -m platformio run --target uploadfs"
