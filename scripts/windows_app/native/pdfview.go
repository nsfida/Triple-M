//go:build windows

package main

import (
	"os"
	"path/filepath"
)

// 3.9: the in-app PDF viewer. The page asks for a file it was told about in
// "download-complete"; only files saved through the app (completedFiles) can
// be read, only PDFs, and only up to maxViewerFileBytes. Anything else gets a
// "file-error" and the page opens the file in the default program instead.

func readFileForViewer(id string) {
	path, ok := completedFiles[id]
	fail := func(reason string) {
		postToPage(map[string]interface{}{"type": "file-error", "id": id, "reason": reason})
	}
	if !ok {
		fail("unknown")
		return
	}
	if viewerKind(path) != "pdf" {
		fail("type")
		return
	}
	st, err := os.Stat(path)
	if err != nil {
		fail("missing")
		return
	}
	if st.Size() == 0 || st.Size() > maxViewerFileBytes {
		fail("size")
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		fail("read")
		return
	}
	if !looksLikePDF(data) {
		fail("type")
		return
	}
	chunks := viewerChunks(data, viewerChunkBytes)
	for i, c := range chunks {
		msg := map[string]interface{}{"type": "file-data", "id": id, "seq": i, "total": len(chunks), "chunk": c}
		if i == 0 {
			msg["name"] = filepath.Base(path)
			msg["path"] = path
			msg["size"] = st.Size()
		}
		postToPage(msg)
	}
}
