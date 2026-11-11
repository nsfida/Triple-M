//go:build windows && !store

package main

import (
	"os"
	"path/filepath"
	"time"
	"unsafe"
)

// Uninstall for the direct-download edition (Settings > Apps > Triplem VIP runs
// TriplemVIP.exe --uninstall). The Microsoft Store edition is removed by Windows
// itself and contains none of this.

const MOVEFILE_DELAY_UNTIL_REBOOT = 0x4

var procMoveFileExWNative = kernel32.NewProc("MoveFileExW")

func unregisterAppNative() {
	const hkcu = uintptr(0x80000001)
	key := `Software\Microsoft\Windows\CurrentVersion\Uninstall\TriplemVIP`
	procRegDeleteTreeWNative.Call(hkcu, uintptr(unsafe.Pointer(utf16Ptr(key))))
}

func runUninstall() {
	if messageBoxReturn("Triplem VIP Uninstall", "Remove the Triplem VIP Windows application from this computer?\n\nYour online Triplem VIP account and cloud data will not be deleted.", MB_YESNO|MB_ICONQUESTION) != IDYES {
		return
	}
	if desktop := knownFolderNative(&folderDesktopNative); desktop != "" {
		_ = os.Remove(filepath.Join(desktop, "Triplem VIP.lnk"))
	}
	if programs := knownFolderNative(&folderProgramsNative); programs != "" {
		_ = os.Remove(filepath.Join(programs, "Triplem VIP.lnk"))
	}
	closeRunningInstance()
	removeStartupRegistration()
	procCoInitializeEx.Call(0, COINIT_APARTMENTTHREADED)
	deleteJumpList()
	unregisterAppNative()
	removeAppIdentity()
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		_ = os.RemoveAll(filepath.Join(local, "Triplem VIP", "WebView2"))
		_ = os.RemoveAll(filepath.Join(local, "Triplem VIP", "Updates"))
		_ = os.Remove(filepath.Join(local, "Triplem VIP", "desktop-settings.json"))
		_ = os.Remove(filepath.Join(local, "Triplem VIP", "window.json"))
		_ = os.Remove(filepath.Join(local, "Triplem VIP", "toast-logo.png"))
		_ = os.Remove(filepath.Join(local, "Triplem VIP", "run-state.json"))
	}
	self, _ := os.Executable()
	dir := filepath.Dir(self)
	procMoveFileExWNative.Call(uintptr(unsafe.Pointer(utf16Ptr(self))), 0, MOVEFILE_DELAY_UNTIL_REBOOT)
	procMoveFileExWNative.Call(uintptr(unsafe.Pointer(utf16Ptr(dir))), 0, MOVEFILE_DELAY_UNTIL_REBOOT)
	messageBox("Triplem VIP", "Triplem VIP has been removed from Windows. Windows may finish deleting the final executable after restart. Your online account and cloud data were not changed.", MB_OK|MB_ICONINFORMATION)
}

// closeRunningInstance asks a running Triplem VIP (which may be hidden in the
// tray) to exit before its files are removed.
func closeRunningInstance() {
	for i := 0; i < 50; i++ {
		h := findRunningWindow()
		if h == 0 {
			return
		}
		if i == 0 {
			procPostMessageW.Call(h, wmTriplemQuit, 0, 0)
		}
		time.Sleep(100 * time.Millisecond)
	}
}
