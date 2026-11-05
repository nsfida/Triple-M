//go:build windows

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"syscall"
	"unsafe"
)

var (
	procPostMessageW               = user32.NewProc("PostMessageW")
	procIsWindowVisible            = user32.NewProc("IsWindowVisible")
	procIsIconic                   = user32.NewProc("IsIconic")
	procGetWindowPlacement         = user32.NewProc("GetWindowPlacement")
	procSetWindowPlacement         = user32.NewProc("SetWindowPlacement")
	procEnumDisplayMonitors        = user32.NewProc("EnumDisplayMonitors")
	procGetMonitorInfoW            = user32.NewProc("GetMonitorInfoW")
	procMonitorFromWindow          = user32.NewProc("MonitorFromWindow")
	procFindWindowW                = user32.NewProc("FindWindowW")
	procGetWindowThreadProcessId   = user32.NewProc("GetWindowThreadProcessId")
	procAllowSetForegroundWindow   = user32.NewProc("AllowSetForegroundWindow")
	procRegisterWindowMessageW     = user32.NewProc("RegisterWindowMessageW")
	procCreatePopupMenu            = user32.NewProc("CreatePopupMenu")
	procAppendMenuW                = user32.NewProc("AppendMenuW")
	procTrackPopupMenu             = user32.NewProc("TrackPopupMenu")
	procDestroyMenu                = user32.NewProc("DestroyMenu")
	procGetCursorPos               = user32.NewProc("GetCursorPos")
	procSetMenuDefaultItem         = user32.NewProc("SetMenuDefaultItem")
	procGetSystemMetrics           = user32.NewProc("GetSystemMetrics")
	procCreateIconIndirect         = user32.NewProc("CreateIconIndirect")
	procDestroyIcon                = user32.NewProc("DestroyIcon")
	procBringWindowToTop           = user32.NewProc("BringWindowToTop")
	procFlashWindow                = user32.NewProc("FlashWindow")
	procShellNotifyIconW           = shell32.NewProc("Shell_NotifyIconW")
	procCreateMutexW               = kernel32.NewProc("CreateMutexW")
	procCoCreateInstanceNative     = ole32.NewProc("CoCreateInstance")
	gdi32                          = syscall.NewLazyDLL("gdi32.dll")
	procCreateDIBSection           = gdi32.NewProc("CreateDIBSection")
	procCreateBitmap               = gdi32.NewProc("CreateBitmap")
	procDeleteObject               = gdi32.NewProc("DeleteObject")
	comdlg32                       = syscall.NewLazyDLL("comdlg32.dll")
	procGetSaveFileNameW           = comdlg32.NewProc("GetSaveFileNameW")
	procCommDlgExtendedError       = comdlg32.NewProc("CommDlgExtendedError")
	procRegOpenKeyExW              = advapi32Native.NewProc("RegOpenKeyExW")
	procRegCreateKeyExWNative      = advapi32Native.NewProc("RegCreateKeyExW")
	procRegSetValueExWNative       = advapi32Native.NewProc("RegSetValueExW")
	procRegQueryValueExW           = advapi32Native.NewProc("RegQueryValueExW")
	procRegDeleteValueW            = advapi32Native.NewProc("RegDeleteValueW")
	procRegCloseKeyNative          = advapi32Native.NewProc("RegCloseKey")
	procSHOpenFolderAndSelectItems = shell32.NewProc("SHOpenFolderAndSelectItems")
	procILCreateFromPathW          = shell32.NewProc("ILCreateFromPathW")
	procILFree                     = shell32.NewProc("ILFree")
)

const (
	WM_APP             = 0x8000
	WM_USER            = 0x0400
	WM_COPYDATA        = 0x004A
	WM_COMMAND         = 0x0111
	WM_CONTEXTMENU     = 0x007B
	WM_NULL            = 0x0000
	WM_LBUTTONUP       = 0x0202
	WM_LBUTTONDBLCLK   = 0x0203
	WM_RBUTTONUP       = 0x0205
	WM_EXITSIZEMOVE    = 0x0232
	WM_QUERYENDSESSION = 0x0011
	WM_ENDSESSION      = 0x0016
	WM_SYSCOMMAND      = 0x0112
	WM_SHOWWINDOW      = 0x0018
	SC_MINIMIZE        = 0xF020
	SC_RESTORE         = 0xF120

	SW_HIDE            = 0
	SW_SHOWNORMAL      = 1
	SW_SHOWMINIMIZED   = 2
	SW_RESTORE         = 9
	SW_SHOWNOACTIVATE  = 4
	SW_SHOWMINNOACTIVE = 7

	SM_CXSMICON = 49

	MONITOR_DEFAULTTONEAREST = 2
	ERROR_ALREADY_EXISTS     = 183

	// Messages the app understands (also used by Setup to close the app).
	wmTrayCallback = WM_APP + 0x52
	wmTriplemQuit  = WM_APP + 0x60 // Setup/uninstall: exit completely
	wmSaveAs       = WM_APP + 0x61
	copyDataMagic  = 0x54564950 // "TVIP"

	mainWindowClass = "TriplemVIP.NativeWindow"
)

type windowPlacement struct {
	Length           uint32
	Flags            uint32
	ShowCmd          uint32
	PtMinPosition    point
	PtMaxPosition    point
	RcNormalPosition rect
}

type monitorInfo struct {
	CbSize    uint32
	RcMonitor rect
	RcWork    rect
	DwFlags   uint32
}

type copyDataStruct struct {
	DwData uintptr
	CbData uint32
	LpData uintptr
}

func utf16Bytes(s string) []uint16 {
	u, _ := syscall.UTF16FromString(s)
	return u
}

// ---- Files under %LOCALAPPDATA%\Triplem VIP ------------------------------------------

func appDataDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	return filepath.Join(base, "Triplem VIP")
}

func writeFileAtomic(path string, data []byte) error {
	_ = os.MkdirAll(filepath.Dir(path), 0700)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

var settings = defaultSettings()

func settingsPath() string { return filepath.Join(appDataDir(), "desktop-settings.json") }

func loadSettings() {
	b, _ := os.ReadFile(settingsPath())
	settings = decodeSettings(b)
}

func saveSettings() {
	b, err := json.MarshalIndent(settings, "", "  ")
	if err == nil {
		_ = writeFileAtomic(settingsPath(), b)
	}
}

// ---- Registry helpers (HKCU only) ----------------------------------------------------

const (
	hkeyCurrentUser = uintptr(0x80000001)
	keyRead         = 0x20019
	keyWrite        = 0x20006
	regSZ           = 1
	regBinary       = 3
)

func regOpen(path string, access uintptr) uintptr {
	var h uintptr
	if r, _, _ := procRegOpenKeyExW.Call(hkeyCurrentUser, uintptr(unsafe.Pointer(utf16Ptr(path))), 0, access, uintptr(unsafe.Pointer(&h))); r != 0 {
		return 0
	}
	return h
}

func regSetStringValue(path, name, value string) bool {
	var h, disp uintptr
	r, _, _ := procRegCreateKeyExWNative.Call(hkeyCurrentUser, uintptr(unsafe.Pointer(utf16Ptr(path))), 0, 0, 0, keyWrite, 0, uintptr(unsafe.Pointer(&h)), uintptr(unsafe.Pointer(&disp)))
	if r != 0 || h == 0 {
		return false
	}
	defer procRegCloseKeyNative.Call(h)
	v := utf16Bytes(value)
	r, _, _ = procRegSetValueExWNative.Call(h, uintptr(unsafe.Pointer(utf16Ptr(name))), 0, regSZ, uintptr(unsafe.Pointer(&v[0])), uintptr(len(v)*2))
	return r == 0
}

func regDeleteValue(path, name string) {
	h := regOpen(path, keyWrite)
	if h == 0 {
		return
	}
	defer procRegCloseKeyNative.Call(h)
	procRegDeleteValueW.Call(h, uintptr(unsafe.Pointer(utf16Ptr(name))))
}

func regReadBytes(path, name string) []byte {
	h := regOpen(path, keyRead)
	if h == 0 {
		return nil
	}
	defer procRegCloseKeyNative.Call(h)
	var typ, size uint32
	if r, _, _ := procRegQueryValueExW.Call(h, uintptr(unsafe.Pointer(utf16Ptr(name))), 0, uintptr(unsafe.Pointer(&typ)), 0, uintptr(unsafe.Pointer(&size))); r != 0 || size == 0 || size > 4096 {
		return nil
	}
	buf := make([]byte, size)
	if r, _, _ := procRegQueryValueExW.Call(h, uintptr(unsafe.Pointer(utf16Ptr(name))), 0, uintptr(unsafe.Pointer(&typ)), uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size))); r != 0 {
		return nil
	}
	return buf[:size]
}

func isWindowShown() bool {
	if mainHwnd == 0 {
		return false
	}
	v, _, _ := procIsWindowVisible.Call(mainHwnd)
	ic, _, _ := procIsIconic.Call(mainHwnd)
	return v != 0 && ic == 0
}
