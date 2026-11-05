// Command updatesign writes the signed update manifest (latest.json) that
// Triplem VIP for Windows 3.6+ reads to update itself.
//
//	go run ./scripts/windows_app/updatesign -key <key file> -setup <TriplemVIP_Setup.exe> -version 3.6.0 -out <latest.json> [-notes "..."]
//
// The key file holds the PRIVATE Ed25519 update signing key. Keep it off
// GitHub and out of the website: anyone with it could publish an update.
// Only the public half is compiled into the app (native/logic36.go).
package main

import (
	"bufio"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"
)

func main() {
	keyFile := flag.String("key", "", "private update signing key file")
	setup := flag.String("setup", "", "TriplemVIP_Setup.exe to publish")
	version := flag.String("version", "", "app version, e.g. 3.6.0")
	out := flag.String("out", "", "latest.json to write")
	notes := flag.String("notes", "", "short release notes")
	pubOut := flag.Bool("print-public", false, "print the public key and exit")
	flag.Parse()

	priv, err := readKey(*keyFile)
	if err != nil {
		fail(err)
	}
	if *pubOut {
		fmt.Println(base64.StdEncoding.EncodeToString(priv.Public().(ed25519.PublicKey)))
		return
	}
	if *setup == "" || *version == "" || *out == "" {
		fail(fmt.Errorf("-setup, -version and -out are required"))
	}
	data, err := os.ReadFile(*setup)
	if err != nil {
		fail(err)
	}
	sum := sha256.Sum256(data)
	manifest := map[string]interface{}{
		"product":   "triplem-vip-windows",
		"version":   *version,
		"url":       "https://triplem.vip/Assets/mobile_app/Windows/TriplemVIP_Setup.exe?v=" + *version,
		"sha256":    hex.EncodeToString(sum[:]),
		"size":      len(data),
		"notes":     *notes,
		"published": time.Now().UTC().Format(time.RFC3339),
	}
	payload, _ := json.Marshal(manifest)
	signed := map[string]string{
		"payload":   base64.StdEncoding.EncodeToString(payload),
		"signature": base64.StdEncoding.EncodeToString(ed25519.Sign(priv, payload)),
		"keyId":     "tvip-update-1",
	}
	b, _ := json.MarshalIndent(signed, "", "  ")
	if err := os.WriteFile(*out, append(b, '\n'), 0644); err != nil {
		fail(err)
	}
	fmt.Printf("signed update manifest: %s (version %s, sha256 %s)\n", *out, *version, manifest["sha256"])
}

func readKey(path string) (ed25519.PrivateKey, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	var lines []string
	for sc.Scan() {
		if l := strings.TrimSpace(sc.Text()); l != "" {
			lines = append(lines, l)
		}
	}
	if len(lines) != 2 || lines[0] != "TRIPLEM-VIP-UPDATE-SIGNING-KEY-V1" {
		return nil, fmt.Errorf("not a Triplem VIP update signing key file")
	}
	seed, err := base64.StdEncoding.DecodeString(lines[1])
	if err != nil || len(seed) != ed25519.SeedSize {
		return nil, fmt.Errorf("damaged update signing key")
	}
	return ed25519.NewKeyFromSeed(seed), nil
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "updatesign:", err)
	os.Exit(1)
}
