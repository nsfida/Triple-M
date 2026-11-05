//go:build windows

package main

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"unsafe"
)

// 3.6.1: keeps the Triplem VIP icon on the pinned taskbar button after the
// window is closed to the notification area.
//
// While the window is open the taskbar draws the window's own icon. Once the
// window is hidden, a pinned button falls back to the icon stored in its
// shortcut. Pins made from the running window by earlier versions could store
// no icon at all, which Windows draws as a blank "white page". On the first
// start of each new version this repairs only Triplem VIP's own shortcuts
// (matched by program path or app ID; nothing else is ever opened for
// writing) and asks Windows to refresh its icon cache once.

const (
	iconRepairTimerID = 0x54564980
	iconRepairDelayMs = 6000

	plGetPath         = 3
	plGetIconLocation = 16
	pfLoad            = 5
	pfSave            = 6
	psGetValue        = 5
	psSetValue        = 6
	psCommit          = 7

	SHCNE_UPDATEITEM   = 0x00002000
	SHCNE_ASSOCCHANGED = 0x08000000
	SHCNF_IDLIST       = 0x0000
	SHCNF_PATHW        = 0x0005
	SHCNF_FLUSHNOWAIT  = 0x3000
)

var (
	iidPersistFileNative = guid{0x0000010B, 0x0000, 0x0000, [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	procSHChangeNotify   = shell32.NewProc("SHChangeNotify")
)

func scheduleIconRepair() {
	if isPackaged() || !iconRepairDue(settings.IconRepairVersion, appVersionNative) {
		return
	}
	procSetTimer.Call(mainHwnd, iconRepairTimerID, iconRepairDelayMs, 0)
}

func onIconRepairTimer() {
	procKillTimer.Call(mainHwnd, iconRepairTimerID)
	repairShellIcons()
}

// pinnedShortcutDirs lists the folders Windows keeps taskbar pins and this
// app's own shortcuts in.
func pinnedShortcutDirs() []string {
	var dirs []string
	if roaming := os.Getenv("APPDATA"); roaming != "" {
		dirs = append(dirs, filepath.Join(roaming, "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar"))
	}
	if p := knownFolderNative(&folderProgramsNative); p != "" {
		dirs = append(dirs, p)
	}
	if p := knownFolderNative(&folderDesktopNative); p != "" {
		dirs = append(dirs, p)
	}
	return dirs
}

func repairShellIcons() {
	defer recoverOptional("taskbar icon repair")
	if isPackaged() {
		return
	}
	exe, err := os.Executable()
	if err != nil || exe == "" {
		return
	}
	repaired := 0
	for _, dir := range pinnedShortcutDirs() {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".lnk") {
				continue
			}
			if repairShortcut(filepath.Join(dir, e.Name()), exe) {
				repaired++
			}
		}
	}
	// Refresh the shell's icon cache once for this version, so a blank icon
	// that Windows cached earlier is drawn again from the app.
	notifyShellPath(exe)
	procSHChangeNotify.Call(SHCNE_ASSOCCHANGED, SHCNF_IDLIST|SHCNF_FLUSHNOWAIT, 0, 0)
	settings.IconRepairVersion = appVersionNative
	saveSettings()
	startupLog("taskbar icon check done; shortcuts repaired: " + strconv.Itoa(repaired))
}

func notifyShellPath(path string) {
	p := utf16Ptr(path)
	procSHChangeNotify.Call(SHCNE_UPDATEITEM, SHCNF_PATHW|SHCNF_FLUSHNOWAIT, uintptr(unsafe.Pointer(p)), 0)
}

// repairShortcut returns true when the shortcut belonged to this app and was
// missing its icon (or app ID) and has been fixed.
func repairShortcut(path, exe string) (changed bool) {
	defer recoverOptional("shortcut repair")
	var link uintptr
	r, _, _ := procCoCreateInstanceNative.Call(uintptr(unsafe.Pointer(&clsidShellLinkNative)), 0, CLSCTX_INPROC_SERVER, uintptr(unsafe.Pointer(&iidShellLinkW)), uintptr(unsafe.Pointer(&link)))
	if !hrOK(r) || link == 0 {
		return false
	}
	defer releaseCOM(link)
	persist := comQuery(link, &iidPersistFileNative)
	if persist == 0 {
		return false
	}
	defer releaseCOM(persist)
	if !hrOK(vcall(persist, pfLoad, uintptr(unsafe.Pointer(utf16Ptr(path))), 0)) { // STGM_READ
		return false
	}
	var info pinnedLink
	buf := make([]uint16, 1024)
	if hrOK(vcall(link, plGetPath, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), 0, 0)) {
		info.Target = syscall.UTF16ToString(buf)
	}
	icon := make([]uint16, 1024)
	var index int32
	if hrOK(vcall(link, plGetIconLocation, uintptr(unsafe.Pointer(&icon[0])), uintptr(len(icon)), uintptr(unsafe.Pointer(&index)))) {
		info.IconPath = expandWindowsEnv(syscall.UTF16ToString(icon))
		if info.IconPath != "" {
			if st, err := os.Stat(info.IconPath); err == nil && !st.IsDir() {
				info.IconExists = true
			}
		}
	}
	store := comQuery(link, &iidIPropertyStore)
	if store != 0 {
		defer releaseCOM(store)
		info.AppID = readStringProperty(store, 5)
	}
	ours, setIcon, setAppID := pinnedLinkFix(info, exe, appUserModelID)
	if !ours || (!setIcon && !setAppID) {
		return false
	}
	if setIcon && !hrOK(vcall(link, slSetIconLocation, uintptr(unsafe.Pointer(utf16Ptr(exe))), 0)) {
		return false
	}
	if setAppID && store != 0 {
		var pv propVariant
		if initPropVariantString(appUserModelID, &pv) {
			key := propertyKey{FmtID: appModelFmtID, PID: 5}
			vcall(store, psSetValue, uintptr(unsafe.Pointer(&key)), uintptr(unsafe.Pointer(&pv)))
			vcall(store, psCommit)
			procPropVariantClear.Call(uintptr(unsafe.Pointer(&pv)))
		}
	}
	if !hrOK(vcall(persist, pfSave, uintptr(unsafe.Pointer(utf16Ptr(path))), 1)) {
		startupLog("could not update shortcut " + filepath.Base(path))
		return false
	}
	notifyShellPath(path)
	startupLog("repaired the icon of shortcut " + filepath.Base(path))
	return true
}

func readStringProperty(store uintptr, pid uint32) string {
	var pv propVariant
	key := propertyKey{FmtID: appModelFmtID, PID: pid}
	if !hrOK(vcall(store, psGetValue, uintptr(unsafe.Pointer(&key)), uintptr(unsafe.Pointer(&pv)))) {
		return ""
	}
	defer procPropVariantClear.Call(uintptr(unsafe.Pointer(&pv)))
	if pv.VT != 31 || pv.Value1 == 0 { // VT_LPWSTR
		return ""
	}
	p := (*[4096]uint16)(unsafe.Pointer(pv.Value1))
	n := 0
	for n < len(p) && p[n] != 0 {
		n++
	}
	return syscall.UTF16ToString(p[:n])
}

var procExpandEnvironmentStringsW = kernel32.NewProc("ExpandEnvironmentStringsW")

// expandWindowsEnv expands %VARIABLE% references in a shortcut's icon path.
func expandWindowsEnv(s string) string {
	if !strings.Contains(s, "%") {
		return s
	}
	out := make([]uint16, 2048)
	n, _, _ := procExpandEnvironmentStringsW.Call(uintptr(unsafe.Pointer(utf16Ptr(s))), uintptr(unsafe.Pointer(&out[0])), uintptr(len(out)))
	if n == 0 || int(n) > len(out) {
		return s
	}
	return syscall.UTF16ToString(out)
}
