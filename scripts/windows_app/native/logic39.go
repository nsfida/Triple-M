package main

// Platform-independent logic added in Triplem VIP for Windows 3.9: which
// saved files the in-app PDF viewer may read, and how a file is split into
// messages for the page.

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	// Largest file the in-app viewer reads. Bigger PDFs open in the default
	// PDF program as before.
	maxViewerFileBytes = 40 << 20
	// Raw bytes per message (base64 makes each message about 1.4 MB).
	viewerChunkBytes = 1 << 20
)

// viewerKind returns the viewer that can show a saved file ("pdf"), or ""
// when the file opens in its default program as before.
func viewerKind(path string) string {
	if strings.EqualFold(filepath.Ext(path), ".pdf") {
		return "pdf"
	}
	return ""
}

// looksLikePDF checks the file header: a PDF starts with "%PDF-" within its
// first kilobyte.
func looksLikePDF(head []byte) bool {
	if len(head) > 1024 {
		head = head[:1024]
	}
	return bytes.Contains(head, []byte("%PDF-"))
}

// viewerChunks splits file data into base64 chunks of at most chunk raw bytes.
func viewerChunks(data []byte, chunk int) []string {
	if chunk <= 0 {
		chunk = viewerChunkBytes
	}
	out := make([]string, 0, len(data)/chunk+1)
	for i := 0; i < len(data); i += chunk {
		end := i + chunk
		if end > len(data) {
			end = len(data)
		}
		out = append(out, base64.StdEncoding.EncodeToString(data[i:end]))
	}
	return out
}

// Print previews are written to %TEMP%\TriplemVIP-preview as
// preview-<n>.pdf; only files with exactly that name are ever removed there.
const previewDirName = "TriplemVIP-preview"

var previewNamePattern = regexp.MustCompile(`^preview-[0-9]{1,9}\.pdf$`)

func previewFileName(n int) string { return fmt.Sprintf("preview-%d.pdf", n) }

func isPreviewFileName(name string) bool { return previewNamePattern.MatchString(name) }
