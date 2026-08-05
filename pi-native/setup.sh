#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Multidisplay pi-native — automated Raspberry Pi setup.
#
# Covers everything scriptable from a fresh Raspberry Pi OS Lite (64-bit)
# install through to the app running as a boot-time service: system
# packages, boot config (audio off / isolated CPU core for display timing),
# Node.js, npm install, a baseline test run, and systemd service install.
#
# Deliberately does NOT do the one thing that can't be scripted: calibrating
# FACE_LAYOUT in src/drivers/rgbMatrixDriver.js against your actual panel
# wiring, or tuning gpioSlowdown for image stability. Those need your eyes
# on real hardware - this script gets you to the point of being able to do
# that, then tells you exactly what to do next.
#
# Usage (from anywhere - clones the repo if not already present):
#   curl -fsSL https://raw.githubusercontent.com/chaoticatom/Multidisplay/claude/affectionate-hopper-h7wftr/pi-native/setup.sh | bash
# (swap the branch name in that URL, and the default BRANCH below, once
# this is merged to main.) Or, if you've already cloned the repo:
#   bash pi-native/setup.sh
#
# Safe to re-run - every step checks whether it's already done before
# doing it again, rather than blindly re-applying.
#
# NOT tested against real Pi hardware (no ARM/Raspberry Pi hardware
# available in the environment this was written in) - reviewed carefully
# for correctness, but you're the first real run. Read it before piping it
# into bash, same as you should for any script from the internet.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_URL="https://github.com/chaoticatom/Multidisplay.git"
# This code currently lives on a feature branch, not main - override with
# MULTIDISPLAY_BRANCH=main once it's merged, or leave as-is until then.
BRANCH="${MULTIDISPLAY_BRANCH:-claude/affectionate-hopper-h7wftr}"
INSTALL_DIR="${MULTIDISPLAY_DIR:-$HOME/Multidisplay}"
BOOT_CONFIG="/boot/firmware/config.txt"
BOOT_CMDLINE="/boot/firmware/cmdline.txt"
SERVICE_NAME="multidisplay-pi"
SERVICE_SRC=""   # set once we know INSTALL_DIR/pi-native exists
RUN_AS_USER="$(whoami)"

log()  { echo -e "\n==> $*"; }
warn() { echo -e "\n!!  $*" >&2; }

if [ "$(id -u)" = "0" ]; then
  warn "Don't run this whole script as root - it uses sudo only for the specific steps that need it (apt, boot config, systemd). Run as your normal user."
  exit 1
fi

if ! grep -qi 'raspberry pi' /proc/cpuinfo 2>/dev/null && [ ! -f /proc/device-tree/model ]; then
  warn "This doesn't look like a Raspberry Pi (no /proc/device-tree/model, /proc/cpuinfo doesn't mention it). Continuing anyway, but the boot-config/GPIO steps below only make sense on real Pi hardware."
fi

# ---------------------------------------------------------------------------
log "Step 1/7: system packages"
# ---------------------------------------------------------------------------
sudo apt-get update
sudo apt-get install -y \
  build-essential git curl \
  bluez pulseaudio-module-bluetooth pulseaudio-utils
sudo systemctl enable --now bluetooth

# ---------------------------------------------------------------------------
log "Step 2/7: boot config (disable onboard audio, isolate a CPU core for display timing)"
# ---------------------------------------------------------------------------
# dtparam=audio=off: the display library and onboard audio both want the
# same hardware PWM peripheral - leaving audio on causes flicker.
# isolcpus=3: dedicates core 3 exclusively to the display refresh thread so
# nothing else (WiFi, the effect-compute loop) can preempt it mid-refresh.
NEEDS_REBOOT=0
if [ -f "$BOOT_CONFIG" ]; then
  if ! grep -q '^dtparam=audio=off' "$BOOT_CONFIG"; then
    echo "dtparam=audio=off" | sudo tee -a "$BOOT_CONFIG" > /dev/null
    log "  added dtparam=audio=off to $BOOT_CONFIG"
    NEEDS_REBOOT=1
  else
    log "  dtparam=audio=off already present, skipping"
  fi
else
  warn "$BOOT_CONFIG not found - skipping audio-disable step. If this isn't a Pi, that's expected; if it is, check your OS layout (older Raspberry Pi OS used /boot/config.txt instead)."
fi

if [ -f "$BOOT_CMDLINE" ]; then
  if ! grep -q 'isolcpus=' "$BOOT_CMDLINE"; then
    sudo sed -i '1 s/$/ isolcpus=3/' "$BOOT_CMDLINE"
    log "  added isolcpus=3 to $BOOT_CMDLINE"
    NEEDS_REBOOT=1
  else
    log "  isolcpus= already present in $BOOT_CMDLINE, skipping (not overriding your existing value)"
  fi
else
  warn "$BOOT_CMDLINE not found - skipping isolcpus step."
fi

# ---------------------------------------------------------------------------
log "Step 3/7: Node.js"
# ---------------------------------------------------------------------------
if command -v node > /dev/null && [ "$(node -v | cut -d. -f1 | tr -d v)" -ge 18 ]; then
  log "  Node.js $(node -v) already installed, skipping"
else
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt-get install -y nodejs
  log "  installed Node.js $(node -v)"
fi

# ---------------------------------------------------------------------------
log "Step 4/7: get the code"
# ---------------------------------------------------------------------------
if [ -d "$INSTALL_DIR/.git" ]; then
  log "  $INSTALL_DIR already exists, pulling latest ($BRANCH) instead of cloning"
  git -C "$INSTALL_DIR" fetch origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull origin "$BRANCH"
else
  git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
PI_NATIVE_DIR="$INSTALL_DIR/pi-native"
SERVICE_SRC="$PI_NATIVE_DIR/systemd/$SERVICE_NAME.service"

# ---------------------------------------------------------------------------
log "Step 5/7: npm install + baseline test"
# ---------------------------------------------------------------------------
cd "$PI_NATIVE_DIR"
npm install
npm test
log "  baseline tests passed"

# ---------------------------------------------------------------------------
log "Step 6/7: install as a boot-time service"
# ---------------------------------------------------------------------------
if [ -f "$SERVICE_SRC" ]; then
  TMP_SERVICE="$(mktemp)"
  sed \
    -e "s|^WorkingDirectory=.*|WorkingDirectory=$PI_NATIVE_DIR|" \
    -e "s|^User=.*|User=root|" \
    "$SERVICE_SRC" > "$TMP_SERVICE"
  sudo cp "$TMP_SERVICE" "/etc/systemd/system/$SERVICE_NAME.service"
  rm -f "$TMP_SERVICE"
  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"
  log "  service installed and enabled (not started yet - see step 7 before starting it for real)"
else
  warn "Service file not found at $SERVICE_SRC - skipping systemd install."
fi

# ---------------------------------------------------------------------------
log "Step 7/7: done with what's scriptable - here's what's NOT"
# ---------------------------------------------------------------------------
cat <<EOF

Everything above is done. What's left needs your eyes on real hardware -
this cannot be scripted, and skipping it risks a corrupted/incorrect
display once the physical panels are wired up:

  1. Wire your HUB75 panels to the driver board per its documentation,
     the driver board to the Pi's GPIO header, and panel power to a
     dedicated 5V supply (never through the Pi itself).

  2. Edit $PI_NATIVE_DIR/src/drivers/rgbMatrixDriver.js:
     FACE_LAYOUT is currently a PLACEHOLDER, not calibrated to your
     wiring. Run it manually first to check:

       cd $PI_NATIVE_DIR
       sudo DRIVER=hardware npm start

     Then send {"cmd":"setEffect","effect":"wave"} to
     ws://<this-pi>:8081 from any WS client and see which physical panel
     lights up as which cube face. Fix FACE_LAYOUT until it's correct.

  3. If the image flickers/looks unstable, raise gpioSlowdown in the same
     file (starts at 2; Pi 3/4 sometimes need higher).

  4. Once step 2-3 look right, Ctrl+C the manual run and start it as the
     real service:
       sudo systemctl start $SERVICE_NAME
       sudo systemctl status $SERVICE_NAME

  5. Set your actual panel layout (persists across restarts):
     send {"cmd":"setPanelConfig","size":64,"mode":"cube"} (or "2d" for a
     single panel) to the same WS port.

  6. Bluetooth (optional - speaker + phone audio): the packages are
     already installed (step 1). Pairing/routing happens at runtime via
     WS commands (btScan/btPair/btDiscoverable/btRoutePhoneAudio) - see
     pi-native/README.md's "Bluetooth audio" section. Note: phone-audio
     routing needs a logged-in user's PulseAudio session, which conflicts
     with the service running as root for GPIO access - if you need that
     specific feature, run the app as your own user instead of via the
     root systemd service.

$( [ "$NEEDS_REBOOT" = "1" ] && echo "IMPORTANT: boot config changed above - reboot now (sudo reboot) before step 2, so the audio-off/isolcpus settings actually take effect." )
EOF
