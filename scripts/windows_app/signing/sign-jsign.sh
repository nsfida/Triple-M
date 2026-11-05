#!/usr/bin/env bash
# Authenticode-sign one Windows file in place with jsign (https://ebourg.github.io/jsign/).
# Used by build_windows_app.sh through:  export TRIPLEM_SIGN_CMD="$PWD/scripts/windows_app/signing/sign-jsign.sh"
#
# jsign runs on Linux/macOS/Windows (Java 8+) and supports the key storage that
# CAs require since June 2023 (hardware token or cloud HSM):
#   JSIGN_STORETYPE   PKCS11 | DIGICERTONE | ESIGNER | AZUREKEYVAULT | GOOGLECLOUD | AWS | YUBIKEY | ...
#   JSIGN_KEYSTORE    store location (PKCS#11 config file, vault name, API URL - see jsign docs)
#   JSIGN_STOREPASS   store password / API credentials (keep in a CI secret, never in the repo)
#   JSIGN_ALIAS       key / certificate alias in the store
#   JSIGN_CERTFILE    optional: PEM/P7B chain file (required by some cloud stores)
#   JSIGN_TSAURL      optional: RFC 3161 timestamp URL (default DigiCert, others listed in docs)
#   JSIGN_JAR         optional: path to jsign-<version>.jar if the `jsign` command is not installed
#
# The file is signed with SHA-256 and an RFC 3161 timestamp, so the signature
# stays valid after the certificate expires.
set -euo pipefail
file="${1:?usage: sign-jsign.sh FILE}"
: "${JSIGN_STORETYPE:?set JSIGN_STORETYPE}" "${JSIGN_KEYSTORE:?set JSIGN_KEYSTORE}" "${JSIGN_ALIAS:?set JSIGN_ALIAS}"
tsa="${JSIGN_TSAURL:-http://timestamp.digicert.com}"

if command -v jsign >/dev/null 2>&1; then
  cmd=(jsign)
elif [ -n "${JSIGN_JAR:-}" ]; then
  cmd=(java -jar "$JSIGN_JAR")
else
  echo "jsign not found: install it or set JSIGN_JAR=/path/to/jsign.jar" >&2
  exit 1
fi

args=(--storetype "$JSIGN_STORETYPE" --keystore "$JSIGN_KEYSTORE" --alias "$JSIGN_ALIAS"
      --alg SHA-256 --tsaurl "$tsa" --tsmode RFC3161 --tsretries 3 --tsretrywait 10
      --name "Triplem VIP" --url "https://triplem.vip/")
[ -n "${JSIGN_STOREPASS:-}" ] && args+=(--storepass "$JSIGN_STOREPASS")
[ -n "${JSIGN_CERTFILE:-}" ] && args+=(--certfile "$JSIGN_CERTFILE")

"${cmd[@]}" "${args[@]}" "$file"
