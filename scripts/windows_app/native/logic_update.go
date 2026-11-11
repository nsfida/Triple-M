//go:build !store

package main

// Signed update manifest for the direct-download edition only. The Microsoft
// Store edition is built with -tags store and contains none of this: the Store
// installs its updates.

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
	"strconv"
	"strings"
)

// ---- Signed update manifest -----------------------------------------------------------
//
// latest.json (published next to the Setup file) contains a base64 payload
// and an Ed25519 signature over exactly those payload bytes. The public key is
// compiled into the app; the private key never leaves the release machine.
// A manifest that is unsigned, signed by another key, for another download
// location or with a malformed hash is ignored.

const updateManifestURL = "https://triplem.vip/Assets/mobile_app/Windows/latest.json"
const updateDownloadPrefix = "https://triplem.vip/Assets/mobile_app/Windows/"

// Triplem VIP update signing key (public half, key id tvip-update-1).
const updatePublicKeyB64 = "m/6uGYB8uwv1/UNlYLAku4mrfXL1Pf02T2DOz5dBWaM="

type signedManifest struct {
	Payload   string `json:"payload"`
	Signature string `json:"signature"`
	KeyID     string `json:"keyId"`
}

type updateManifest struct {
	Product   string `json:"product"`
	Version   string `json:"version"`
	URL       string `json:"url"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
	Notes     string `json:"notes"`
	Published string `json:"published"`
}

var versionPattern = regexp.MustCompile(`^\d{1,4}\.\d{1,4}\.\d{1,6}$`)

func updatePublicKey() ed25519.PublicKey {
	b, err := base64.StdEncoding.DecodeString(updatePublicKeyB64)
	if err != nil || len(b) != ed25519.PublicKeySize {
		return nil
	}
	return ed25519.PublicKey(b)
}

func verifyUpdateManifest(raw []byte, pub ed25519.PublicKey) (updateManifest, error) {
	var m updateManifest
	if len(pub) != ed25519.PublicKeySize {
		return m, errors.New("no update key")
	}
	if len(raw) == 0 || len(raw) > 16*1024 {
		return m, errors.New("manifest size")
	}
	var s signedManifest
	if err := json.Unmarshal(raw, &s); err != nil {
		return m, errors.New("manifest format")
	}
	payload, err := base64.StdEncoding.DecodeString(s.Payload)
	if err != nil || len(payload) == 0 {
		return m, errors.New("manifest payload")
	}
	sig, err := base64.StdEncoding.DecodeString(s.Signature)
	if err != nil || len(sig) != ed25519.SignatureSize || !ed25519.Verify(pub, payload, sig) {
		return m, errors.New("manifest signature")
	}
	if err := json.Unmarshal(payload, &m); err != nil {
		return m, errors.New("manifest content")
	}
	m.SHA256 = strings.ToLower(m.SHA256)
	if m.Product != "triplem-vip-windows" || !versionPattern.MatchString(m.Version) {
		return m, errors.New("manifest product/version")
	}
	if !strings.HasPrefix(m.URL, updateDownloadPrefix) || !strings.HasSuffix(strings.SplitN(m.URL, "?", 2)[0], ".exe") || strings.Contains(m.URL, "..") {
		return m, errors.New("manifest url")
	}
	if b, err := hex.DecodeString(m.SHA256); err != nil || len(b) != 32 {
		return m, errors.New("manifest hash")
	}
	if m.Size < 1<<20 || m.Size > 200<<20 {
		return m, errors.New("manifest size field")
	}
	m.Notes = clampText(m.Notes, 300)
	return m, nil
}

// versionNewer reports whether a is a higher x.y.z version than b.
func versionNewer(a, b string) bool {
	pa, pb := versionParts(a), versionParts(b)
	for i := 0; i < 3; i++ {
		if pa[i] != pb[i] {
			return pa[i] > pb[i]
		}
	}
	return false
}

func versionParts(v string) [3]int {
	var out [3]int
	for i, f := range strings.SplitN(strings.TrimSpace(v), ".", 3) {
		n, _ := strconv.Atoi(f)
		out[i] = n
	}
	return out
}

