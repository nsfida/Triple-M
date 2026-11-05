#!/usr/bin/env bash
# Builds the Microsoft Store packages on Linux/CI:
#   TriplemVIP-x64.msix and TriplemVIP-arm64.msix
# Upload BOTH files in the same Partner Center submission; the Store installs
# the native one on each PC. (The open-source makemsix can only create "flat"
# bundles, which the Store does not accept, so no .msixbundle is made here.
# On Windows, build_msix.ps1 can also produce a full .msixbundle with MakeAppx.)
#
# Requires Microsoft's open-source makemsix (github.com/microsoft/msix-packaging):
#   git clone --depth 1 https://github.com/microsoft/msix-packaging.git
#   cd msix-packaging && mkdir .vs && cd .vs
#   cmake -DCMAKE_BUILD_TYPE=MinSizeRel -DUSE_VALIDATION_PARSER=on -DMSIX_PACK=on \
#         -DSKIP_BUNDLES=off -DMSIX_SAMPLES=off -DMSIX_TESTS=off -DLINUX=on \
#         -DCMAKE_TOOLCHAIN_FILE=../cmake/linux.cmake .. && make
#   (needs CMake >= 3.29 and libicu-dev)
#
# Usage:
#   MAKEMSIX=/path/to/msix-packaging/.vs/bin/makemsix scripts/windows_app/msix/build_msix.sh [OUT_DIR]
#
# Upload both .msix files in Partner Center > Packages. The packages are NOT signed: Microsoft signs Store packages after
# certification. For every new Store release raise Version in AppxManifest.xml
# (last part must stay 0, e.g. 3.5.1.0) - Partner Center rejects a version it
# has already seen.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
MSIX_DIR="$ROOT/scripts/windows_app/msix"
MAKEMSIX="${MAKEMSIX:-makemsix}"
OUT_DIR="${1:-$ROOT}"
TMP="${TMPDIR:-/tmp}/triplem-vip-msix"
BUILD="${TMPDIR:-/tmp}/triplem-vip-windows-build"

if grep -q 'REPLACE' "$MSIX_DIR/AppxManifest.xml"; then
  echo "AppxManifest.xml still contains REPLACE markers." >&2; exit 1
fi
command -v "$MAKEMSIX" >/dev/null || { echo "makemsix not found (set MAKEMSIX)." >&2; exit 1; }
export LD_LIBRARY_PATH="$(dirname "$(command -v "$MAKEMSIX")")/../lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
VERSION="$(sed -n 's/^ *Version="\([0-9.]*\)"$/\1/p' "$MSIX_DIR/AppxManifest.xml" | head -1)"

bash "$ROOT/scripts/windows_app/build_windows_app.sh"

rm -rf "$TMP" && mkdir -p "$TMP/packages" "$OUT_DIR"
pack() {
  local arch="$1" app="$2" stage="$TMP/stage-$1" out="$TMP/packages/TriplemVIP-$1.msix"
  mkdir -p "$stage" "$TMP/check-$arch"
  cp "$app" "$stage/TriplemVIP.exe"
  sed "s/@ARCH@/$arch/" "$MSIX_DIR/AppxManifest.xml" > "$stage/AppxManifest.xml"
  cp -r "$MSIX_DIR/Assets" "$stage/"
  "$MAKEMSIX" pack -d "$stage" -p "$out"
  "$MAKEMSIX" unpack -p "$out" -d "$TMP/check-$arch" -ss >/dev/null
  cmp "$TMP/check-$arch/TriplemVIP.exe" "$app"
  cp "$out" "$OUT_DIR/"
}
pack x64 "$BUILD/TriplemVIP.exe"
pack arm64 "$BUILD/TriplemVIP-arm64.exe"
echo "Created and validated in $OUT_DIR: TriplemVIP-x64.msix and TriplemVIP-arm64.msix ($VERSION)"
