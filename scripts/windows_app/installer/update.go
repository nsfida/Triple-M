//go:build windows

package main

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"time"
	"unsafe"
)

// Setup 3.5: one Setup.exe for both x64 and ARM64 PCs, and safe in-place
// updates while Triplem VIP is running (it can now keep running in the tray).

//go:embed payload/TriplemVIP-arm64.exe
var embeddedTriplemAppARM64 []byte
var expectedPayloadSHA256ARM64 string

const imageFileMachineARM64 = 0xAA64

var (
	procIsWow64Process2   = kernel32.NewProc("IsWow64Process2")
	procGetCurrentProcess = kernel32.NewProc("GetCurrentProcess")
	procFindWindowWSetup  = user32.NewProc("FindWindowW")
	procMoveFileExWSetup  = kernel32.NewProc("MoveFileExW")
	setupAppWindowClass   = "TriplemVIP.NativeWindow"
	setupMsgTriplemQuit   = uintptr(0x8000 + 0x60) // understood by Triplem VIP 3.5+
	setupWMClose          = uintptr(0x0010)        // Triplem VIP 3.4 exits on close
)

// nativeIsARM64 reports whether Windows itself runs on ARM64 (Setup is an x64
// program and runs emulated there).
func nativeIsARM64() bool {
	if procIsWow64Process2.Find() != nil {
		return false
	}
	proc, _, _ := procGetCurrentProcess.Call()
	var processMachine, nativeMachine uint16
	r, _, _ := procIsWow64Process2.Call(proc, uintptr(unsafe.Pointer(&processMachine)), uintptr(unsafe.Pointer(&nativeMachine)))
	return r != 0 && nativeMachine == imageFileMachineARM64
}

// selectedPayload returns the native build for this PC and its pinned hash.
func selectedPayload() (payload []byte, expected string, arch string) {
	if nativeIsARM64() && len(embeddedTriplemAppARM64) > 500000 {
		return embeddedTriplemAppARM64, expectedPayloadSHA256ARM64, "arm64"
	}
	return embeddedTriplemApp, expectedPayloadSHA256, "x64"
}

// closeRunningTriplemApp asks a running Triplem VIP to exit before its
// executable is replaced. 3.5+ handles the quit message (it may be hidden in
// the tray); 3.4 exits on WM_CLOSE.
func closeRunningTriplemApp() {
	find := func() uintptr {
		h, _, _ := procFindWindowWSetup.Call(uintptr(unsafe.Pointer(utf16Ptr(setupAppWindowClass))), 0)
		return h
	}
	h := find()
	if h == 0 {
		return
	}
	setupLog("Triplem VIP is running: asking it to exit before the update")
	procPostMessageW.Call(h, setupMsgTriplemQuit, 0, 0)
	if waitGone(find, 4*time.Second) {
		return
	}
	procPostMessageW.Call(h, setupWMClose, 0, 0)
	if !waitGone(find, 4*time.Second) {
		setupLog("Triplem VIP did not exit; the running file will be replaced safely")
	}
}

func waitGone(find func() uintptr, d time.Duration) bool {
	end := time.Now().Add(d)
	for time.Now().Before(end) {
		if find() == 0 {
			time.Sleep(300 * time.Millisecond) // let the process release its executable
			return true
		}
		time.Sleep(120 * time.Millisecond)
	}
	return find() == 0
}

// replaceExecutable activates the verified temporary file. If the old file is
// still locked by a running process, it is renamed out of the way (Windows
// allows renaming a running executable) and removed at the next restart.
func replaceExecutable(tmp, dest string) error {
	if err := os.Remove(dest); err != nil && !os.IsNotExist(err) {
		old := fmt.Sprintf("%s.%d.old", dest, time.Now().Unix())
		if rerr := os.Rename(dest, old); rerr != nil {
			return fmt.Errorf("Triplem VIP is still running. Close it from the notification area and run Setup again")
		}
		procMoveFileExWSetup.Call(uintptr(unsafe.Pointer(utf16Ptr(old))), 0, 0x4) // MOVEFILE_DELAY_UNTIL_REBOOT
	}
	return os.Rename(tmp, dest)
}

// ---- Silent update (3.6) -------------------------------------------------------------
//
// Started by the installed Triplem VIP app after it downloaded this Setup and
// verified its signed manifest and SHA-256 hash. It replaces only
// TriplemVIP.exe in the existing installation folder (shortcuts, settings,
// the signed-in session and all data are kept), then starts the app again.

func updateModeArgs(args []string) (string, bool) {
	update := false
	dir := ""
	for _, a := range args {
		switch {
		case a == "--update":
			update = true
		case len(a) > 6 && a[:6] == "--dir=":
			dir = a[6:]
		}
	}
	if !update {
		return "", false
	}
	return dir, true
}

// validUpdateDir accepts only an existing Triplem VIP installation folder.
func validUpdateDir(dir string) bool {
	if dir == "" || !filepath.IsAbs(dir) {
		return false
	}
	st, err := os.Stat(filepath.Join(dir, "TriplemVIP.exe"))
	return err == nil && !st.IsDir()
}

func runSilentUpdate(dir string) {
	setupLog("silent update requested")
	if !validUpdateDir(dir) {
		dir = setupDefaultDir()
		if !validUpdateDir(dir) {
			messageBox("Triplem VIP Update", "The Triplem VIP installation folder was not found. Download Triplem VIP again from https://triplem.vip/ to update.", MB_OK|MB_ICONERROR)
			return
		}
	}
	// The app is closing itself; wait briefly so its executable is released.
	time.Sleep(700 * time.Millisecond)
	exePath, err := installCore(dir, func(int, string) {})
	if err != nil {
		setupLog("silent update failed: " + err.Error())
		messageBox("Triplem VIP Update", "The update could not be installed. Your current version and all your data are unchanged.\r\n\r\n"+err.Error()+"\r\n\r\nDiagnostic log: "+setupLogPath(), MB_OK|MB_ICONERROR)
		// Start the existing version again so the user is not left without the app.
		if old := filepath.Join(dir, "TriplemVIP.exe"); validUpdateDir(dir) {
			_ = startWithArgs(old, "--updated-failed")
		}
		return
	}
	setupLog("silent update complete")
	if err := startWithArgs(exePath, "--updated"); err != nil {
		setupLog("relaunch after update failed: " + err.Error())
	}
}

func startWithArgs(path, args string) error {
	var si startupInfo
	si.Cb = uint32(unsafe.Sizeof(si))
	var pi processInformation
	app := utf16Ptr(path)
	cmd, _ := syscall.UTF16FromString(`"` + path + `" ` + args)
	work := utf16Ptr(filepath.Dir(path))
	r, _, e := procCreateProcessW.Call(uintptr(unsafe.Pointer(app)), uintptr(unsafe.Pointer(&cmd[0])), 0, 0, 0, 0, 0, uintptr(unsafe.Pointer(work)), uintptr(unsafe.Pointer(&si)), uintptr(unsafe.Pointer(&pi)))
	if r == 0 {
		return e
	}
	procCloseHandle.Call(uintptr(pi.HProcess))
	procCloseHandle.Call(uintptr(pi.HThread))
	return nil
}
