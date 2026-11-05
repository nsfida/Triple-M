#!/usr/bin/env bash
# Builds the single-file Windows installer: Assets/mobile_app/Windows/TriplemVIP_Setup.exe
#
#   1. TriplemVIP.exe (native WebView2 client) is compiled for x64 AND ARM64 and
#      each build gets its icon, manifest and version information.
#   2. If a signing command is configured, both app builds are Authenticode-
#      signed BEFORE they are embedded, so the installed app is signed too.
#   3. TriplemVIP_Setup.exe (x64; runs natively on x64 and emulated on ARM64)
#      is compiled with both verified builds embedded (SHA-256 pinned at build
#      time). Setup installs the native build for the PC it runs on.
#   4. Setup gets its resources and is signed.
#
# Code signing (removes "Unknown publisher"; see docs/WINDOWS-APP-SIGNING.md):
#   export TRIPLEM_SIGN_CMD='/path/to/sign-wrapper'
# The command is called once per file with the file path as its only argument
# and must sign the file in place (SHA-256 digest + RFC 3161 timestamp).
# Without it, unsigned files are produced and a warning is printed. Set
# TRIPLEM_REQUIRE_SIGNING=1 for release builds to fail instead of warning.
#
# Automatic updates (3.6+): the build also writes the signed update manifest
# Assets/mobile_app/Windows/latest.json when the private update key is given:
#   export TRIPLEM_UPDATE_KEY_FILE=/safe/place/triplem_update_signing_key.txt
#   export TRIPLEM_UPDATE_NOTES="What changed"
# The key must match the public key compiled into the app (checked below).
# Never commit the key file. Without it, installed apps simply keep the
# current version until the next signed release.
#
# Requirements: Go 1.22+, Python 3, GNU binutils with PE support for both
# x86-64 and AArch64 (Debian/Ubuntu: apt install binutils-multiarch).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NATIVE_DIR="$ROOT/scripts/windows_app/native"
INSTALLER_DIR="$ROOT/scripts/windows_app/installer"
ICO="$ROOT/scripts/windows_app/assets/TriplemVIP.ico"
OUT="$ROOT/Assets/mobile_app/Windows/TriplemVIP_Setup.exe"
VERSION="3.6.1"
TMP="${TMPDIR:-/tmp}/triplem-vip-windows-build"
mkdir -p "$TMP" "$INSTALLER_DIR/payload" "$(dirname "$OUT")"
rm -f "$TMP"/TriplemVIP*.exe

OBJCOPY_TARGETS="$(objcopy --info 2>/dev/null || true)"
if [[ "$OBJCOPY_TARGETS" != *pei-aarch64* ]]; then
  echo "ERROR: objcopy cannot edit ARM64 Windows executables. Install binutils-multiarch." >&2
  exit 1
fi

sign_file() {
  local file="$1"
  if [ -n "${TRIPLEM_SIGN_CMD:-}" ]; then
    "$TRIPLEM_SIGN_CMD" "$file"
    python3 "$ROOT/scripts/windows_app/signing/verify_signature.py" "$file"
    echo "signed: $file"
  elif [ "${TRIPLEM_REQUIRE_SIGNING:-0}" = "1" ]; then
    echo "ERROR: TRIPLEM_REQUIRE_SIGNING=1 but TRIPLEM_SIGN_CMD is not set." >&2
    exit 1
  else
    echo "WARNING: $file is NOT code-signed (set TRIPLEM_SIGN_CMD). Windows SmartScreen will show 'Unknown publisher'." >&2
  fi
}

# Unit tests for the platform-independent logic must pass before packaging.
(cd "$NATIVE_DIR" && GO111MODULE=off go test . >/dev/null)

build_app() {
  local goarch="$1" out="$2"
  (
    cd "$NATIVE_DIR"
    GO111MODULE=off GOOS=windows GOARCH="$goarch" CGO_ENABLED=0 go build \
      -trimpath \
      -ldflags='-H=windowsgui -buildid=' \
      -o "$out" .
  )
  python3 "$ROOT/scripts/windows_app/build_resources.py" "$out" "$ICO" \
    --description "Triplem VIP" --version "$VERSION" --original "TriplemVIP.exe"
  sign_file "$out"
}

# The native application payloads. They never copy or install themselves;
# setup is a separate process with a conventional responsibility.
build_app amd64 "$TMP/TriplemVIP.exe"
build_app arm64 "$TMP/TriplemVIP-arm64.exe"
cp "$TMP/TriplemVIP.exe" "$INSTALLER_DIR/payload/TriplemVIP.exe"
cp "$TMP/TriplemVIP-arm64.exe" "$INSTALLER_DIR/payload/TriplemVIP-arm64.exe"
APP_SHA="$(sha256sum "$TMP/TriplemVIP.exe" | awk '{print $1}')"
APP_SHA_ARM64="$(sha256sum "$TMP/TriplemVIP-arm64.exe" | awk '{print $1}')"

# Single-file setup containing both verified payloads and the glass interface.
(
  cd "$INSTALLER_DIR"
  GO111MODULE=off GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build \
    -trimpath \
    -ldflags="-H=windowsgui -buildid= -X main.expectedPayloadSHA256=$APP_SHA -X main.expectedPayloadSHA256ARM64=$APP_SHA_ARM64" \
    -o "$TMP/TriplemVIP_Setup.exe" .
)
python3 "$ROOT/scripts/windows_app/build_resources.py" "$TMP/TriplemVIP_Setup.exe" "$ICO" \
  --description "Triplem VIP Setup" --version "$VERSION" --original "TriplemVIP_Setup.exe"
sign_file "$TMP/TriplemVIP_Setup.exe"
cp "$TMP/TriplemVIP_Setup.exe" "$OUT"

MANIFEST="$(dirname "$OUT")/latest.json"
if [ -n "${TRIPLEM_UPDATE_KEY_FILE:-}" ]; then
  KEY_PUB="$(cd "$ROOT/scripts/windows_app/updatesign" && GO111MODULE=off go run . -key "$TRIPLEM_UPDATE_KEY_FILE" -print-public)"
  if ! grep -q "updatePublicKeyB64 = \"$KEY_PUB\"" "$NATIVE_DIR/logic36.go"; then
    echo "ERROR: the update signing key does not match the public key compiled into the app." >&2
    exit 1
  fi
  (cd "$ROOT/scripts/windows_app/updatesign" && GO111MODULE=off go run . -key "$TRIPLEM_UPDATE_KEY_FILE" -setup "$OUT" -version "$VERSION" -out "$MANIFEST" -notes "${TRIPLEM_UPDATE_NOTES:-}")
elif [ "${TRIPLEM_REQUIRE_UPDATE_SIGNING:-0}" = "1" ]; then
  echo "ERROR: TRIPLEM_REQUIRE_UPDATE_SIGNING=1 but TRIPLEM_UPDATE_KEY_FILE is not set." >&2
  exit 1
else
  echo "WARNING: latest.json was not written (no TRIPLEM_UPDATE_KEY_FILE); installed apps will not see this release automatically." >&2
fi

python3 "$ROOT/scripts/windows_app/signing/verify_signature.py" --report "$TMP/TriplemVIP.exe" "$TMP/TriplemVIP-arm64.exe" "$OUT" || true
printf 'Native app SHA-256 (x64):   %s\n' "$APP_SHA"
printf 'Native app SHA-256 (ARM64): %s\n' "$APP_SHA_ARM64"
sha256sum "$OUT"
rm -f "$INSTALLER_DIR/payload/TriplemVIP.exe" "$INSTALLER_DIR/payload/TriplemVIP-arm64.exe"
