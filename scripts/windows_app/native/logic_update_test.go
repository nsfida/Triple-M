//go:build !store

package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
)

func signManifest(t *testing.T, priv ed25519.PrivateKey, m map[string]interface{}) []byte {
	payload, _ := json.Marshal(m)
	b, _ := json.Marshal(signedManifest{Payload: base64.StdEncoding.EncodeToString(payload), Signature: base64.StdEncoding.EncodeToString(ed25519.Sign(priv, payload)), KeyID: "tvip-update-1"})
	return b
}

func goodManifest() map[string]interface{} {
	return map[string]interface{}{
		"product": "triplem-vip-windows", "version": "3.6.1",
		"url":    "https://triplem.vip/Assets/mobile_app/Windows/TriplemVIP_Setup.exe?v=3.6.1",
		"sha256": strings.Repeat("ab", 32), "size": 12 << 20, "notes": "Fixes",
	}
}

func TestUpdateManifestSignatureAndContent(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	m, err := verifyUpdateManifest(signManifest(t, priv, goodManifest()), pub)
	if err != nil || m.Version != "3.6.1" {
		t.Fatalf("valid manifest rejected: %v", err)
	}
	_, other, _ := ed25519.GenerateKey(rand.Reader)
	if _, err := verifyUpdateManifest(signManifest(t, other, goodManifest()), pub); err == nil {
		t.Fatal("manifest signed by another key accepted")
	}
	// Tampered payload with the original signature.
	raw := signManifest(t, priv, goodManifest())
	var s signedManifest
	_ = json.Unmarshal(raw, &s)
	p, _ := base64.StdEncoding.DecodeString(s.Payload)
	p = []byte(strings.Replace(string(p), "3.6.1", "9.9.9", 1))
	s.Payload = base64.StdEncoding.EncodeToString(p)
	tampered, _ := json.Marshal(s)
	if _, err := verifyUpdateManifest(tampered, pub); err == nil {
		t.Fatal("tampered manifest accepted")
	}
	for key, val := range map[string]interface{}{
		"url":     "https://evil.example/TriplemVIP_Setup.exe",
		"product": "other",
		"version": "3.6",
		"sha256":  "zz",
		"size":    10,
	} {
		bad := goodManifest()
		bad[key] = val
		if _, err := verifyUpdateManifest(signManifest(t, priv, bad), pub); err == nil {
			t.Fatalf("manifest with bad %s accepted", key)
		}
	}
	bad := goodManifest()
	bad["url"] = "https://triplem.vip/Assets/mobile_app/Windows/../../x.exe"
	if _, err := verifyUpdateManifest(signManifest(t, priv, bad), pub); err == nil {
		t.Fatal("path traversal accepted")
	}
	if _, err := verifyUpdateManifest([]byte(`{"payload":"x"}`), pub); err == nil {
		t.Fatal("unsigned manifest accepted")
	}
}

func TestCompiledUpdateKeyIsValid(t *testing.T) {
	if len(updatePublicKey()) != ed25519.PublicKeySize {
		t.Fatal("compiled update public key is malformed")
	}
}

func TestVersionNewer(t *testing.T) {
	if !versionNewer("3.6.1", "3.6.0") || !versionNewer("3.10.0", "3.9.9") || versionNewer("3.6.0", "3.6.0") || versionNewer("3.5.9", "3.6.0") {
		t.Fatal("version comparison")
	}
	if versionNewer("3.6.0", appVersionNative) {
		t.Fatal("app version")
	}
}

