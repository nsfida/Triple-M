//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unsafe"
)

// Every PDF/Excel/CSV export in Triplem VIP is a browser download. In the
// Windows app each download is intercepted (ICoreWebView2_4.DownloadStarting)
// and the standard Windows "Save As" dialog chooses the folder and file name.
// When the file is written completely, the page offers Open file / Show in
// folder. Only files saved by this mechanism can be opened that way.

type pendingDownload struct {
	args     uintptr
	op       uintptr
	deferral uintptr
	defPath  string
}

type savedDownload struct {
	path   string
	op     uintptr
	total  int64
	id     string
	backup bool // 3.8: a backup ZIP from Backup & Restore
	auto   bool
}

var (
	downloadSeq     int
	pendingSaves    = map[int]*pendingDownload{}
	activeDownloads = map[uintptr]*savedDownload{} // keyed by DownloadOperation
	completedFiles  = map[string]string{}          // id -> path
)

func onDownloadStarting(this, sender, args uintptr) uintptr {
	var op, deferral uintptr
	if !hrOK(vcall(args, dlStartOperation, uintptr(unsafe.Pointer(&op)))) || op == 0 {
		return 0
	}
	if !hrOK(vcall(args, dlStartGetDeferral, uintptr(unsafe.Pointer(&deferral)))) || deferral == 0 {
		releaseCOM(op)
		return 0 // fall back to WebView2's default download handling
	}
	comAddRef(args)
	downloadSeq++
	id := downloadSeq
	pendingSaves[id] = &pendingDownload{args: args, op: op, deferral: deferral, defPath: getString(args, dlStartResultPath)}
	// Show the dialog outside the event callback (WebView2 guidance).
	procPostMessageW.Call(mainHwnd, wmSaveAs, uintptr(id), 0)
	return 0
}

func completeSaveAs(id int) {
	p := pendingSaves[id]
	if p == nil {
		return
	}
	delete(pendingSaves, id)
	defer func() {
		vcall(p.deferral, deferralComplete)
		releaseCOM(p.deferral)
		releaseCOM(p.args)
	}()
	// 3.8: the backup the page announced goes straight into the backup folder.
	auto := expectedAuto
	path, isBackup, dialog, failReason := takeBackupDownload(p.defPath)
	if isBackup && failReason != "" {
		vcall(p.args, dlStartSetCancel, 1)
		releaseCOM(p.op)
		backupFailed(failReason, auto)
		return
	}
	ok := true
	if !isBackup || dialog {
		path, ok = askSavePath(p.defPath)
	}
	if !ok {
		vcall(p.args, dlStartSetCancel, 1)
		releaseCOM(p.op)
		if isBackup {
			backupRunningAt = time.Time{}
			postToPage(map[string]interface{}{"type": "backup-status", "ok": false, "cancelled": true})
		}
		return
	}
	vcall(p.args, dlStartSetResultPath, uintptr(unsafe.Pointer(utf16Ptr(path))))
	vcall(p.args, dlStartSetHandled, 1) // our own completion message replaces the download flyout
	var total int64
	vcall(p.op, dlOpTotalBytes, uintptr(unsafe.Pointer(&total)))
	rec := &savedDownload{path: path, op: p.op, total: total, id: fmt.Sprintf("d%d", id), backup: isBackup, auto: isBackup && auto}
	activeDownloads[p.op] = rec
	var token int64
	vcall(p.op, dlOpAddStateChanged, hDownloadState.ptr(), uintptr(unsafe.Pointer(&token)))
	if !isBackup || dialog {
		settings.LastSaveDir = filepath.Dir(path)
		saveSettings()
	}
}

func onDownloadStateChanged(this, sender, args uintptr) uintptr {
	rec := activeDownloads[sender]
	if rec == nil {
		return 0
	}
	switch getInt32(sender, dlOpState) {
	case downloadInProgress:
		return 0
	case downloadCompleted:
		finalPath := getString(sender, dlOpResultFilePath)
		if finalPath == "" {
			finalPath = rec.path
		}
		st, err := os.Stat(finalPath)
		if err != nil || st.Size() == 0 || (rec.total > 0 && st.Size() != rec.total) {
			if rec.backup {
				backupFailed("The backup file was not written completely. It will be tried again.", rec.auto)
			} else {
				postToPage(map[string]interface{}{"type": "download-failed", "name": filepath.Base(rec.path), "reason": "The file was not written completely. Please export it again."})
			}
		} else {
			completedFiles[rec.id] = finalPath
			if rec.backup {
				backupSaved(finalPath, st.Size())
			}
			postToPage(map[string]interface{}{"type": "download-complete", "id": rec.id, "name": filepath.Base(finalPath), "folder": filepath.Base(filepath.Dir(finalPath)), "size": st.Size(), "backup": rec.backup, "auto": rec.auto})
		}
	case downloadInterrupted:
		reason := getInt32(sender, dlOpInterruptReason)
		if rec.backup {
			if reason == interruptUserCanceled {
				backupRunningAt = time.Time{}
			} else {
				backupFailed(interruptText(reason), rec.auto)
			}
		} else if reason != interruptUserCanceled {
			postToPage(map[string]interface{}{"type": "download-failed", "name": filepath.Base(rec.path), "reason": interruptText(reason)})
		}
	}
	delete(activeDownloads, sender)
	releaseCOM(sender)
	return 0
}

func interruptText(reason int32) string {
	switch reason {
	case 2:
		return "Windows denied access to the selected folder. Choose another folder."
	case 3:
		return "There is not enough disk space."
	case 4:
		return "The file name is too long. Choose a shorter name."
	case 6, 8, 9:
		return "Windows security blocked the file."
	default:
		return "The export could not be saved. Please try again."
	}
}

// ---- Save dialog -------------------------------------------------------------------

type openFileNameW struct {
	LStructSize       uint32
	HwndOwner         uintptr
	HInstance         uintptr
	LpstrFilter       *uint16
	LpstrCustomFilter *uint16
	NMaxCustFilter    uint32
	NFilterIndex      uint32
	LpstrFile         *uint16
	NMaxFile          uint32
	LpstrFileTitle    *uint16
	NMaxFileTitle     uint32
	LpstrInitialDir   *uint16
	LpstrTitle        *uint16
	Flags             uint32
	NFileOffset       uint16
	NFileExtension    uint16
	LpstrDefExt       *uint16
	LCustData         uintptr
	LpfnHook          uintptr
	LpTemplateName    *uint16
	PvReserved        uintptr
	DwReserved        uint32
	FlagsEx           uint32
}

const (
	OFN_OVERWRITEPROMPT = 0x2
	OFN_HIDEREADONLY    = 0x4
	OFN_NOCHANGEDIR     = 0x8
	OFN_PATHMUSTEXIST   = 0x800
	OFN_EXPLORER        = 0x80000
	OFN_ENABLESIZING    = 0x800000
)

func askSavePath(defPath string) (string, bool) {
	name := sanitizeFileName(filepath.Base(defPath))
	ext := strings.ToLower(filepath.Ext(name))
	initial := settings.LastSaveDir
	if st, err := os.Stat(initial); initial == "" || err != nil || !st.IsDir() {
		initial = filepath.Dir(defPath)
	}
	showMainWindow()
	for attempt := 0; attempt < 5; attempt++ {
		buf := make([]uint16, 32768)
		copy(buf, utf16Bytes(name))
		filter := utf16MultiString(saveDialogFilter(ext)) // keeps the embedded NUL separators
		var defExt *uint16
		if ext != "" {
			defExt = utf16Ptr(strings.TrimPrefix(ext, "."))
		}
		ofn := openFileNameW{
			LStructSize:     uint32(unsafe.Sizeof(openFileNameW{})),
			HwndOwner:       mainHwnd,
			LpstrFilter:     &filter[0],
			NFilterIndex:    1,
			LpstrFile:       &buf[0],
			NMaxFile:        uint32(len(buf)),
			LpstrInitialDir: utf16Ptr(initial),
			LpstrTitle:      utf16Ptr("Save Triplem VIP export"),
			Flags:           OFN_OVERWRITEPROMPT | OFN_HIDEREADONLY | OFN_NOCHANGEDIR | OFN_PATHMUSTEXIST | OFN_EXPLORER | OFN_ENABLESIZING,
			LpstrDefExt:     defExt,
		}
		r, _, _ := procGetSaveFileNameW.Call(uintptr(unsafe.Pointer(&ofn)))
		if r == 0 {
			if code, _, _ := procCommDlgExtendedError.Call(); code != 0 {
				startupLog(fmt.Sprintf("save dialog error 0x%X", code))
			}
			return "", false
		}
		chosen := string(utf16Decode(buf))
		final := ensureExtension(chosen, ext)
		if final != chosen {
			if _, err := os.Stat(final); err == nil {
				if messageBoxReturn("Confirm Save As", filepath.Base(final)+" already exists.\n\nDo you want to replace it?", MB_YESNO|MB_ICONQUESTION) != IDYES {
					name = filepath.Base(final)
					initial = filepath.Dir(final)
					continue
				}
			}
		}
		return final, true
	}
	return "", false
}

func openDownload(id string, inFolder bool) {
	path, ok := completedFiles[id]
	if !ok {
		return
	}
	if _, err := os.Stat(path); err != nil {
		postToPage(map[string]interface{}{"type": "download-failed", "name": filepath.Base(path), "reason": "The file was moved or deleted."})
		return
	}
	if !inFolder {
		procShellExecuteW.Call(mainHwnd, uintptr(unsafe.Pointer(utf16Ptr("open"))), uintptr(unsafe.Pointer(utf16Ptr(path))), 0, uintptr(unsafe.Pointer(utf16Ptr(filepath.Dir(path)))), SW_SHOWNORMAL)
		return
	}
	pidl, _, _ := procILCreateFromPathW.Call(uintptr(unsafe.Pointer(utf16Ptr(path))))
	if pidl != 0 {
		defer procILFree.Call(pidl)
		if r, _, _ := procSHOpenFolderAndSelectItems.Call(pidl, 0, 0, 0); hrOK(r) {
			return
		}
	}
	launchDetached("explorer.exe", `/select,"`+path+`"`)
}
