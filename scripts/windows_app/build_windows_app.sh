#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NATIVE_SRC="$ROOT/scripts/windows_app/native/main.go"
INSTALLER_DIR="$ROOT/scripts/windows_app/installer"
ICO="$ROOT/scripts/windows_app/assets/TriplemVIP.ico"
OUT="$ROOT/Assets/mobile_app/Windows/TriplemVIP_Setup.exe"
TMP="${TMPDIR:-/tmp}/triplem-vip-windows-build"
mkdir -p "$TMP" "$INSTALLER_DIR/payload" "$(dirname "$OUT")"
rm -f "$TMP/TriplemVIP.exe" "$TMP/TriplemVIP_Setup.exe"

# Build the actual native application as a distinct payload. It never copies or
# installs itself; setup is a separate process with a conventional responsibility.
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build \
  -trimpath \
  -ldflags='-H=windowsgui -buildid=' \
  -o "$TMP/TriplemVIP.exe" "$NATIVE_SRC"
python3 "$ROOT/scripts/windows_app/build_resources.py" "$TMP/TriplemVIP.exe" "$ICO"
cp "$TMP/TriplemVIP.exe" "$INSTALLER_DIR/payload/TriplemVIP.exe"
APP_SHA="$(sha256sum "$TMP/TriplemVIP.exe" | awk '{print $1}')"

# Build the single-file setup containing the verified native payload.
(
  cd "$INSTALLER_DIR"
  GO111MODULE=off GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build \
    -trimpath \
    -ldflags="-H=windowsgui -buildid= -X main.expectedPayloadSHA256=$APP_SHA" \
    -o "$TMP/TriplemVIP_Setup.exe" .
)
python3 "$ROOT/scripts/windows_app/build_resources.py" "$TMP/TriplemVIP_Setup.exe" "$ICO"
cp "$TMP/TriplemVIP_Setup.exe" "$OUT"

printf 'Native app SHA-256: %s\n' "$APP_SHA"
sha256sum "$OUT"
file "$TMP/TriplemVIP.exe" "$OUT"
rm -f "$INSTALLER_DIR/payload/TriplemVIP.exe"
