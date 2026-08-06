#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Multidisplay pi-native — customize an official Raspberry Pi OS image
# offline, producing a ready-to-flash .img with the app pre-installed.
#
# Takes a Raspberry Pi OS Lite (64-bit) image YOU download from
# raspberrypi.com/software (or downloads.raspberrypi.com directly), mounts
# it via a loop device, chroots into it using qemu-user-static (the image
# is ARM64, this script normally runs on an x86_64 machine), and installs
# everything setup.sh would install on a live Pi - packages, Node.js, the
# app itself, boot config, systemd services - without ever booting a Pi.
#
# ---------------------------------------------------------------------------
# STATUS: written carefully, but only PARTIALLY verified. Be aware of what
# that means before running this against a real image:
#
#   VERIFIED (in a sandboxed dev environment, via a synthetic stand-in
#   image - NOT actual Raspberry Pi OS, which couldn't be downloaded from
#   that environment at all):
#     - losetup/partition mounting mechanics
#     - qemu-user-static + binfmt_misc transparent ARM64 execution
#     - chroot itself, and a full debootstrap (both stages) completing
#       successfully under emulation ("Base system installed successfully")
#
#   NOT VERIFIED - hit a real wall partway through and couldn't get further:
#     - `apt-get install` of anything beyond the base system (build-essential/
#       python3/curl) HUNG indefinitely partway through a postinst script,
#       in that sandboxed environment. Root cause is most likely the missing
#       policy-rc.d guard (see below) - a genuinely common cause of exactly
#       this hang, now added here - but this was diagnosed, not re-verified
#       by a clean successful re-run, for lack of time/environment access.
#     - Node.js install, `npm install` (in particular whether
#       `rpi-led-matrix`'s native addon compiles successfully under
#       emulation - the single riskiest unknown in this whole approach) -
#       never reached.
#     - Boot config edits, systemd service enabling, final unmount/repack -
#       written carefully against documented Raspberry Pi OS/systemd
#       conventions, but never executed end to end.
#
# In short: the mounting/chrooting foundation is solid and demonstrated
# working. Everything from "install packages" onward is reasoned-through
# and should work on a normal Linux machine (which won't have whatever
# sandbox-specific restriction caused the hang above), but you are the
# first real end-to-end run. Watch it actually run rather than walking
# away - if apt-get hangs, Ctrl+C and see policy-rc.d's comment below for
# the most likely fix to try next.
# ---------------------------------------------------------------------------
set -euo pipefail

SRC_IMG="${1:?Usage: sudo ./build-image.sh <path-to-raspios-lite-arm64.img[.xz]> [output.img]}"
OUT_IMG="${2:-multidisplay-cube.img}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # assumes this script is run from inside a checkout of the repo
WORK_IMG="$(mktemp -d)/work.img"
MNT="$(mktemp -d)"
LOOPDEV=""

log()  { echo -e "\n==> $*"; }
warn() { echo -e "\n!!  $*" >&2; }

if [ "$(id -u)" != "0" ]; then
  echo "Run as root (sudo ./build-image.sh ...) - needed for loop devices, mounting, and chroot." >&2
  exit 1
fi

for tool in qemu-aarch64-static losetup mount chroot rsync sed; do
  command -v "$tool" > /dev/null 2>&1 || { echo "Missing required tool: $tool. On Debian/Ubuntu: apt-get install qemu-user-static rsync" >&2; exit 1; }
done
if [[ "$SRC_IMG" == *.xz ]] && ! command -v xz > /dev/null 2>&1; then
  echo "Missing required tool: xz (needed to decompress a .img.xz input). On Debian/Ubuntu: apt-get install xz-utils" >&2
  exit 1
fi

cleanup() {
  set +e
  log "Cleaning up..."
  rm -f "$MNT/usr/sbin/policy-rc.d" 2>/dev/null
  umount "$MNT/dev" 2>/dev/null
  umount "$MNT/proc" 2>/dev/null
  umount "$MNT/sys" 2>/dev/null
  umount "$MNT/boot/firmware" 2>/dev/null
  umount "$MNT/boot" 2>/dev/null
  umount "$MNT" 2>/dev/null
  [ -n "$LOOPDEV" ] && losetup -d "$LOOPDEV" 2>/dev/null
  rmdir "$MNT" 2>/dev/null
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
log "Step 1/8: prepare a working copy of the image"
# ---------------------------------------------------------------------------
mkdir -p "$(dirname "$WORK_IMG")"
if [[ "$SRC_IMG" == *.xz ]]; then
  log "  decompressing $SRC_IMG..."
  xz -dc "$SRC_IMG" > "$WORK_IMG"
else
  cp "$SRC_IMG" "$WORK_IMG"
fi
log "  working on a copy ($WORK_IMG) - your original ($SRC_IMG) is untouched"

# ---------------------------------------------------------------------------
log "Step 2/8: mount the image"
# ---------------------------------------------------------------------------
LOOPDEV="$(losetup -fP --show "$WORK_IMG")"
log "  loop device: $LOOPDEV (partitions: ${LOOPDEV}p1 boot, ${LOOPDEV}p2 root)"

# Partition device nodes (${LOOPDEV}p1/p2) can take a moment to appear
# after losetup - poll instead of a blind sleep.
for i in $(seq 1 20); do
  [ -e "${LOOPDEV}p1" ] && [ -e "${LOOPDEV}p2" ] && break
  sleep 0.5
done
if [ ! -e "${LOOPDEV}p2" ]; then
  echo "Partition devices never appeared under $LOOPDEV - is $WORK_IMG a valid partitioned disk image?" >&2
  exit 1
fi

mount "${LOOPDEV}p2" "$MNT"
# Raspberry Pi OS Bullseye+ mounts the boot partition at /boot/firmware;
# older images used /boot directly. Detect which this image expects rather
# than assuming.
if [ -d "$MNT/boot/firmware" ]; then
  BOOT_MNT="$MNT/boot/firmware"
else
  BOOT_MNT="$MNT/boot"
fi
mount "${LOOPDEV}p1" "$BOOT_MNT"
log "  boot partition mounted at $BOOT_MNT"

# ---------------------------------------------------------------------------
log "Step 3/8: set up chroot (binfmt_misc for ARM64, bind mounts, DNS, policy-rc.d)"
# ---------------------------------------------------------------------------
mountpoint -q /proc/sys/fs/binfmt_misc || mount -t binfmt_misc binfmt_misc /proc/sys/fs/binfmt_misc
if [ ! -e /proc/sys/fs/binfmt_misc/qemu-aarch64 ]; then
  if [ -f /usr/lib/binfmt.d/qemu-aarch64.conf ]; then
    cat /usr/lib/binfmt.d/qemu-aarch64.conf > /proc/sys/fs/binfmt_misc/register
  else
    update-binfmts --enable qemu-aarch64
  fi
fi

mount --bind /dev "$MNT/dev"
mount --bind /proc "$MNT/proc"
mount --bind /sys "$MNT/sys"
cp /etc/resolv.conf "$MNT/etc/resolv.conf"

# Without this, package postinst scripts try to actually start/restart
# services (systemctl start, service X restart) inside a chroot with no
# real init running - a well-documented way for a chrooted package install
# to hang indefinitely (exactly the failure mode this script hit while
# being developed - see the STATUS block above). Returning exit 101 tells
# invoke-rc.d "don't actually start anything", same technique pi-gen and
# similar Pi-image-building tools use.
cat > "$MNT/usr/sbin/policy-rc.d" <<'EOF'
#!/bin/sh
exit 101
EOF
chmod +x "$MNT/usr/sbin/policy-rc.d"

# ---------------------------------------------------------------------------
log "Step 4/8: install packages + Node.js inside the chroot"
# ---------------------------------------------------------------------------
chroot "$MNT" /bin/bash -c '
  set -e
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y build-essential git curl \
    bluez pulseaudio-module-bluetooth pulseaudio-utils network-manager
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
  systemctl enable bluetooth NetworkManager 2>/dev/null || true
  node -v
'
log "  packages + Node.js installed"

# ---------------------------------------------------------------------------
log "Step 5/8: copy the app into the image and npm install"
# ---------------------------------------------------------------------------
APP_DIR="$MNT/opt/multidisplay/pi-native"
mkdir -p "$(dirname "$APP_DIR")"
# Copies this exact reviewed checkout of pi-native/ (NOT the whole repo -
# the browser app/firmware source aren't needed to run this) rather than
# git-cloning inside the chroot, guaranteeing the image gets the code
# you're actually looking at. Excludes node_modules (npm install below
# rebuilds it correctly for ARM64 - a copied x86_64 node_modules, if this
# ever ran with one present, would be silently wrong) and any local
# panel-config.json (runtime state, not source).
rsync -a --exclude node_modules --exclude panel-config.json \
  "$REPO_ROOT/pi-native/" "$APP_DIR/"

chroot "$MNT" /bin/bash -c "
  set -e
  cd /opt/multidisplay/pi-native
  npm install
"
log "  app installed at /opt/multidisplay/pi-native (npm install completed - including rpi-led-matrix's native compile, if this step got this far)"

# ---------------------------------------------------------------------------
log "Step 6/8: boot config (disable onboard audio, isolate a CPU core)"
# ---------------------------------------------------------------------------
CONFIG_TXT="$BOOT_MNT/config.txt"
CMDLINE_TXT="$BOOT_MNT/cmdline.txt"
if [ -f "$CONFIG_TXT" ] && ! grep -q '^dtparam=audio=off' "$CONFIG_TXT"; then
  echo "dtparam=audio=off" >> "$CONFIG_TXT"
  log "  added dtparam=audio=off"
fi
if [ -f "$CMDLINE_TXT" ] && ! grep -q 'isolcpus=' "$CMDLINE_TXT"; then
  sed -i '1 s/$/ isolcpus=3/' "$CMDLINE_TXT"
  log "  added isolcpus=3"
fi

# ---------------------------------------------------------------------------
log "Step 7/8: install the systemd service"
# ---------------------------------------------------------------------------
SERVICE_SRC="$REPO_ROOT/pi-native/systemd/multidisplay-pi.service"
if [ -f "$SERVICE_SRC" ]; then
  sed "s|^WorkingDirectory=.*|WorkingDirectory=/opt/multidisplay/pi-native|" \
    "$SERVICE_SRC" > "$MNT/etc/systemd/system/multidisplay-pi.service"
  # systemctl --root works entirely offline (no dbus/live systemd needed) -
  # the standard mechanism for enabling services in an image being built
  # this way, distinct from enabling bluetooth/NetworkManager above (those
  # used the chroot's own systemctl since their presets/units come from the
  # packages just installed, not this repo).
  systemctl --root="$MNT" enable multidisplay-pi.service
  log "  multidisplay-pi.service installed and enabled"
else
  warn "Service file not found at $SERVICE_SRC - skipping."
fi

# ---------------------------------------------------------------------------
log "Step 8/8: unmount and finalize"
# ---------------------------------------------------------------------------
rm -f "$MNT/usr/sbin/policy-rc.d"
rm -f "$MNT/etc/resolv.conf"
umount "$MNT/dev"
umount "$MNT/proc"
umount "$MNT/sys"
umount "$BOOT_MNT"
umount "$MNT"
losetup -d "$LOOPDEV"
LOOPDEV=""
trap - EXIT

mv "$WORK_IMG" "$OUT_IMG"
log "Done: $OUT_IMG"
cat <<EOF

Flash it with Raspberry Pi Imager (Choose OS -> Use custom) or:
  sudo dd if=$OUT_IMG of=/dev/sdX bs=4M status=progress conv=fsync

Same manual steps as setup.sh's printed next-steps still apply after
first boot - wiring the panels, calibrating FACE_LAYOUT in
src/drivers/rgbMatrixDriver.js (at /opt/multidisplay/pi-native/src/
drivers/rgbMatrixDriver.js on the Pi), and switching panel-config from
its "2d" default to "cube" once you're ready. See pi-native/README.md.

WiFi: this image doesn't have credentials baked in unless you set them
via Raspberry Pi Imager separately before running this script (its
advanced-options WiFi config lives on the boot partition and this script
doesn't touch it either way) - or just let the Pi boot without a
connection and use its own captive-portal setup AP (src/wifiSetup.js,
same as covered in the README) to configure it from a phone.
EOF
