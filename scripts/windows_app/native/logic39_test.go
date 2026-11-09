package main

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestViewerKind(t *testing.T) {
	for _, p := range []string{`C:\Users\a\Documents\Invoice INV-0001.pdf`, `D:\x\REPORT.PDF`} {
		if viewerKind(p) != "pdf" {
			t.Fatal("pdf", p)
		}
	}
	for _, p := range []string{`C:\a\data.xlsx`, `C:\a\data.csv`, `C:\a\x.pdf.exe`, `C:\a\pdf`, ""} {
		if viewerKind(p) != "" {
			t.Fatal("not pdf", p)
		}
	}
}

func TestLooksLikePDF(t *testing.T) {
	if !looksLikePDF([]byte("%PDF-1.7\n...")) || !looksLikePDF(append([]byte("\xef\xbb\xbf  "), []byte("%PDF-1.3")...)) {
		t.Fatal("header")
	}
	if looksLikePDF([]byte("MZ\x90\x00 not a pdf")) || looksLikePDF(nil) {
		t.Fatal("not a pdf")
	}
	late := append([]byte(strings.Repeat(" ", 2000)), []byte("%PDF-1.4")...)
	if looksLikePDF(late) {
		t.Fatal("header must be near the start")
	}
}

func TestViewerChunksRoundTrip(t *testing.T) {
	data := []byte(strings.Repeat("0123456789", 1000)) // 10000 bytes
	chunks := viewerChunks(data, 3000)
	if len(chunks) != 4 {
		t.Fatal(len(chunks))
	}
	var back []byte
	for _, c := range chunks {
		b, err := base64.StdEncoding.DecodeString(c)
		if err != nil {
			t.Fatal(err)
		}
		back = append(back, b...)
	}
	if string(back) != string(data) {
		t.Fatal("round trip")
	}
	if len(viewerChunks(nil, 10)) != 0 {
		t.Fatal("empty")
	}
	if maxViewerFileBytes/viewerChunkBytes > 64 {
		t.Fatal("too many messages for the largest file")
	}
}

func TestBridgeAcceptsFileRead(t *testing.T) {
	m, ok := parseBridgeMessage(appOrigin+"/", `{"cmd":"file-read","id":"7"}`)
	if !ok || m.ID != "7" {
		t.Fatal("file-read")
	}
	if _, ok := parseBridgeMessage("https://example.com/", `{"cmd":"file-read","id":"7"}`); ok {
		t.Fatal("other sites cannot read files")
	}
	m, _ = parseBridgeMessage(appOrigin+"/", `{"cmd":"file-read","id":"..\\..\\x"}`)
	if m.ID != "" {
		t.Fatal("ids are cleaned")
	}
}

func TestPreviewFiles(t *testing.T) {
	if previewFileName(12) != "preview-12.pdf" || !isPreviewFileName("preview-12.pdf") {
		t.Fatal("name")
	}
	for _, n := range []string{"preview-.pdf", "invoice.pdf", "preview-1.pdf.exe", `..\preview-1.pdf`, "Preview-1.pdf", "preview-1.PDF "} {
		if isPreviewFileName(n) {
			t.Fatal("must not remove", n)
		}
	}
	for _, id := range []string{"v3", "p12", "5"} {
		m, ok := parseBridgeMessage(appOrigin+"/", `{"cmd":"file-read","id":"`+id+`"}`)
		if !ok || m.ID != id {
			t.Fatal("id", id)
		}
	}
	if _, ok := parseBridgeMessage(appOrigin+"/", `{"cmd":"print-preview","print":{"paper":"a4"}}`); !ok {
		t.Fatal("print-preview")
	}
}
