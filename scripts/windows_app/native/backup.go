//go:build windows

package main

import (
	"os"
	"path/filepath"
	"syscall"
	"time"
	"unsafe"
)

// Backup & Restore in the Windows app (3.8).
//
// The backup ZIP is built by the page exactly like Account > Backup & Restore
// (the same server-signed export of every record of the account). The app
// adds three things:
//   - a backup folder: "Back up now" and scheduled backups are saved there
//     without a Save As dialog;
//   - a schedule (daily, weekly or monthly at a chosen time). A backup that was
//     missed because the PC was off or asleep runs as soon as the app runs;
//   - keeping only the newest N backups of the account in that folder.
// Restoring uses the page's own restore (it only ever adds missing records).
// The app never reads the backup content; it only saves the file the page
// produced and, when asked, removes older files with the same backup name
// pattern of the same account.

const (
	backupTimerID     = 0x54564994
	backupCheckMs     = 60 * 1000
	backupRetryAfter  = 30 * time.Minute
	backupRunTimeout  = 15 * time.Minute
	backupExpectValid = 2 * time.Minute
)

var (
	folderDocumentsNative = guid{0xFDD39AD0, 0x238F, 0x46AF, [8]byte{0xAD, 0xB4, 0x6C, 0x85, 0x48, 0x03, 0x69, 0xC7}}

	procSHBrowseForFolderW   = shell32.NewProc("SHBrowseForFolderW")
	procSHGetPathFromIDListW = shell32.NewProc("SHGetPathFromIDListW")

	expectedBackup   string
	expectedAuto     bool
	expectedAt       time.Time
	backupRunningAt  time.Time
	backupFailNotice time.Time
)

type browseInfoW struct {
	HwndOwner      uintptr
	PidlRoot       uintptr
	PszDisplayName *uint16
	LpszTitle      *uint16
	UlFlags        uint32
	Lpfn           uintptr
	LParam         uintptr
	IImage         int32
}

const (
	BIF_RETURNONLYFSDIRS = 0x1
	BIF_NEWDIALOGSTYLE   = 0x40
	BIF_EDITBOX          = 0x10
)

func defaultBackupFolder() string {
	docs := knownFolderNative(&folderDocumentsNative)
	if docs == "" {
		if home, err := os.UserHomeDir(); err == nil {
			docs = filepath.Join(home, "Documents")
		}
	}
	if docs == "" {
		return ""
	}
	return filepath.Join(docs, "Triplem VIP Backups")
}

func folderUsable(dir string) bool {
	if dir == "" || !filepath.IsAbs(dir) {
		return false
	}
	st, err := os.Stat(dir)
	return err == nil && st.IsDir()
}

// ensureBackupFolder returns the chosen folder, creating the default one when
// none was chosen yet.
func ensureBackupFolder() string {
	dir := settings.BackupFolder
	if dir == "" {
		dir = defaultBackupFolder()
		if dir == "" {
			return ""
		}
		settings.BackupFolder = dir
		saveSettings()
	}
	if !folderUsable(dir) {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return ""
		}
	}
	return dir
}

func chooseBackupFolder() {
	defer recoverOptional("backup folder")
	title := utf16Ptr("Choose the folder for Triplem VIP backups")
	var display [260]uint16
	bi := browseInfoW{HwndOwner: mainHwnd, PszDisplayName: &display[0], LpszTitle: title, UlFlags: BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE | BIF_EDITBOX}
	pidl, _, _ := procSHBrowseForFolderW.Call(uintptr(unsafe.Pointer(&bi)))
	if pidl == 0 {
		sendSettingsToPage()
		return
	}
	defer procCoTaskMemFree.Call(pidl)
	var buf [32768]uint16
	if ok, _, _ := procSHGetPathFromIDListW.Call(pidl, uintptr(unsafe.Pointer(&buf[0]))); ok == 0 {
		postToPage(map[string]interface{}{"type": "backup-status", "ok": false, "reason": "That location cannot be used for backups. Choose a folder on this PC."})
		sendSettingsToPage()
		return
	}
	dir := syscall.UTF16ToString(buf[:])
	if !folderUsable(dir) {
		postToPage(map[string]interface{}{"type": "backup-status", "ok": false, "reason": "That location cannot be used for backups. Choose a folder on this PC."})
		sendSettingsToPage()
		return
	}
	settings.BackupFolder = dir
	saveSettings()
	sendSettingsToPage()
}

func openBackupFolder() {
	dir := ensureBackupFolder()
	if dir == "" {
		return
	}
	procShellExecuteW.Call(mainHwnd, uintptr(unsafe.Pointer(utf16Ptr("open"))), uintptr(unsafe.Pointer(utf16Ptr(dir))), 0, 0, SW_SHOWNORMAL)
}

func setBackupSchedule(s backupSchedule) {
	s = sanitizeBackupSchedule(s)
	if s.Freq != "off" && ensureBackupFolder() == "" {
		postToPage(map[string]interface{}{"type": "backup-status", "ok": false, "reason": "The backup folder could not be created. Choose another folder."})
		s.Freq = "off"
	}
	// A schedule that starts now should not immediately back up for a time
	// that has already passed today: count from now.
	if s.Freq != "off" && sanitizeBackupSchedule(settings.Backup).Freq == "off" {
		settings.BackupSince = time.Now().UnixMilli()
	}
	settings.Backup = s
	settings.BackupLastError = ""
	saveSettings()
	armBackupTimer()
	sendSettingsToPage()
}

func armBackupTimer() {
	procKillTimer.Call(mainHwnd, backupTimerID)
	if sanitizeBackupSchedule(settings.Backup).Freq != "off" {
		procSetTimer.Call(mainHwnd, backupTimerID, backupCheckMs, 0)
	}
}

// backupLastRef is the later of the last backup and the moment the schedule
// was turned on (so turning it on never starts a backup for a past time).
func backupLastRef() time.Time {
	ms := settings.BackupLastDone
	if settings.BackupSince > ms {
		ms = settings.BackupSince
	}
	return time.UnixMilli(ms)
}

func backupBusy() bool {
	return !backupRunningAt.IsZero() && time.Since(backupRunningAt) < backupRunTimeout
}

func onBackupTimer() {
	defer recoverOptional("backup schedule")
	sched := sanitizeBackupSchedule(settings.Backup)
	if sched.Freq == "off" {
		procKillTimer.Call(mainHwnd, backupTimerID)
		return
	}
	now := time.Now()
	if !backupDue(sched, backupLastRef(), now) || backupBusy() {
		return
	}
	if settings.BackupLastAttempt > 0 && now.Sub(time.UnixMilli(settings.BackupLastAttempt)) < backupRetryAfter {
		return
	}
	if !pageReady || offlineShown {
		return // the page is not loaded (e.g. no internet): try again on a later tick
	}
	runBackupNow(true)
}

// runBackupNow asks the page to build the backup ZIP.
func runBackupNow(auto bool) {
	if auto {
		settings.BackupLastAttempt = time.Now().UnixMilli()
		saveSettings()
	}
	backupRunningAt = time.Now()
	resumePage() // a paused page cannot build the file
	procKillTimer.Call(mainHwnd, suspendTimerID)
	postToPage(map[string]interface{}{"type": "backup-run", "auto": auto})
}

func expectBackup(name string, auto bool) {
	if !validBackupFileName(name) {
		return
	}
	expectedBackup, expectedAuto, expectedAt = name, auto, time.Now()
	backupRunningAt = time.Now()
	postToPage(map[string]interface{}{"type": "backup-expect-ok", "name": name})
}

// takeBackupDownload is called for every download: when it is the backup the
// page announced, it returns where to save it (no dialog) and true.
// dialog=true means: ask with Save As (no folder for a manual backup).
func takeBackupDownload(defPath string) (path string, isBackup bool, dialog bool, failReason string) {
	if expectedBackup == "" || time.Since(expectedAt) > backupExpectValid {
		return "", false, false, ""
	}
	if !matchesExpectedBackup(filepath.Base(defPath), expectedBackup) {
		return "", false, false, ""
	}
	name, auto := expectedBackup, expectedAuto
	expectedBackup = ""
	// The folder shown in the menu (Documents\Triplem VIP Backups until the
	// user chooses another) is used for "Back up now" and scheduled backups.
	dir := settings.BackupFolder
	if dir == "" {
		if dir = ensureBackupFolder(); dir == "" {
			if auto {
				return "", true, false, "The backup folder could not be created. Choose a folder in Backup & Restore."
			}
			return "", true, true, "" // ask where to save instead
		}
	}
	if dir != "" && !folderUsable(dir) {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			if auto {
				return "", true, false, "The backup folder is not available. Choose another folder in Backup & Restore."
			}
			return "", true, true, ""
		}
	}
	if dir == "" {
		return "", true, true, ""
	}
	exists := func(p string) bool { _, err := os.Stat(p); return err == nil }
	return uniqueBackupPath(dir, name, exists), true, false, ""
}

// backupSaved runs when the backup file was written completely.
func backupSaved(path string, size int64) {
	backupRunningAt = time.Time{}
	settings.BackupLastDone = time.Now().UnixMilli()
	settings.BackupLastAttempt = 0
	settings.BackupLastError = ""
	settings.BackupLastFile = filepath.Base(path)
	removed := 0
	if keep := settings.Backup.Keep; keep > 0 && settings.BackupFolder != "" && sameDir(filepath.Dir(path), settings.BackupFolder) {
		if entries, err := os.ReadDir(settings.BackupFolder); err == nil {
			names := make([]string, 0, len(entries))
			for _, e := range entries {
				if e.Type().IsRegular() {
					names = append(names, e.Name())
				}
			}
			for _, old := range backupsToPrune(names, keep, filepath.Base(path)) {
				if os.Remove(filepath.Join(settings.BackupFolder, old)) == nil {
					removed++
				}
			}
		}
	}
	saveSettings()
	postToPage(map[string]interface{}{"type": "backup-saved", "name": filepath.Base(path), "folder": filepath.Base(filepath.Dir(path)), "size": size, "removed": removed})
	sendSettingsToPage()
	if !isWindowShown() {
		onWindowHiddenForMemory() // pause the page again when allowed
	}
}

func backupFailed(reason string, auto bool) {
	backupRunningAt = time.Time{}
	expectedBackup = ""
	if reason == "" {
		reason = "The backup could not be saved."
	}
	settings.BackupLastError = clampText(reason, 200)
	saveSettings()
	postToPage(map[string]interface{}{"type": "backup-status", "ok": false, "reason": reason, "auto": auto})
	sendSettingsToPage()
	// Scheduled backups run unattended: tell the user once a day at most.
	if auto && settings.Notifications && time.Since(backupFailNotice) > 20*time.Hour {
		backupFailNotice = time.Now()
		notify(bridgeMessage{Title: "Automatic backup did not run", Body: clampText(reason, 200), Tag: "backup-failed", Target: "home"})
	}
	if !isWindowShown() {
		onWindowHiddenForMemory()
	}
}

func sameDir(a, b string) bool {
	return filepath.Clean(a) == filepath.Clean(b) || equalFoldPath(filepath.Clean(a), filepath.Clean(b))
}

func equalFoldPath(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := 0; i < len(a); i++ {
		x, y := a[i], b[i]
		if 'A' <= x && x <= 'Z' {
			x += 'a' - 'A'
		}
		if 'A' <= y && y <= 'Z' {
			y += 'a' - 'A'
		}
		if x != y {
			return false
		}
	}
	return true
}

func backupSettingsForPage() map[string]interface{} {
	s := sanitizeBackupSchedule(settings.Backup)
	now := time.Now()
	next := nextScheduledBackup(s, now)
	if backupDue(s, backupLastRef(), now) {
		next = now
	}
	nextMs := int64(0)
	if !next.IsZero() {
		nextMs = next.UnixMilli()
	}
	folder := settings.BackupFolder
	if folder == "" {
		folder = defaultBackupFolder()
	}
	return map[string]interface{}{
		"freq": s.Freq, "time": s.Time, "weekday": s.Weekday, "monthday": s.Monthday, "keep": s.Keep,
		"folder": folder, "folderSet": settings.BackupFolder != "", "lastDone": settings.BackupLastDone, "lastFile": settings.BackupLastFile,
		"lastError": settings.BackupLastError, "next": nextMs, "running": backupBusy(),
	}
}
