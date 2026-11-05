//go:build windows

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"syscall"
	"unsafe"
)

// Window size/position memory. The normal (restored) rectangle and the
// maximized state are saved; on start-up the rectangle is validated against
// the monitors that are connected now (fitPlacement in logic.go) so the window
// can never open off-screen, e.g. after a second monitor was unplugged.

func placementPath() string { return filepath.Join(appDataDir(), "window.json") }

type monitorSet struct {
	work    []irect
	primary int
}

var monitorEnumCallback = syscall.NewCallback(func(hmon, hdc, lprc, data uintptr) uintptr {
	set := (*monitorSet)(unsafe.Pointer(data))
	mi := monitorInfo{CbSize: uint32(unsafe.Sizeof(monitorInfo{}))}
	if r, _, _ := procGetMonitorInfoW.Call(hmon, uintptr(unsafe.Pointer(&mi))); r != 0 {
		if mi.DwFlags&1 != 0 { // MONITORINFOF_PRIMARY
			set.primary = len(set.work)
		}
		set.work = append(set.work, irect{mi.RcWork.Left, mi.RcWork.Top, mi.RcWork.Right, mi.RcWork.Bottom})
	}
	return 1
})

func currentMonitors() monitorSet {
	var set monitorSet
	procEnumDisplayMonitors.Call(0, 0, monitorEnumCallback, uintptr(unsafe.Pointer(&set)))
	return set
}

// workspaceOffset converts between screen and "workspace" coordinates used by
// Get/SetWindowPlacement (they differ when the taskbar is on the top or left
// edge of the primary monitor).
func workspaceOffset(set monitorSet) (int32, int32) {
	hmon, _, _ := procMonitorFromWindow.Call(0, 1) // MONITOR_DEFAULTTOPRIMARY for a null window
	mi := monitorInfo{CbSize: uint32(unsafe.Sizeof(monitorInfo{}))}
	if r, _, _ := procGetMonitorInfoW.Call(hmon, uintptr(unsafe.Pointer(&mi))); r == 0 {
		return 0, 0
	}
	return mi.RcWork.Left - mi.RcMonitor.Left, mi.RcWork.Top - mi.RcMonitor.Top
}

// restoredPlacement returns the rectangle (screen coordinates) and state for
// window creation.
func restoredPlacement() (r irect, maximized bool, ok bool) {
	set := currentMonitors()
	b, err := os.ReadFile(placementPath())
	if err != nil || len(set.work) == 0 {
		return irect{}, true, false
	}
	var sp savedPlacement
	if json.Unmarshal(b, &sp) != nil || sp.Version != 1 {
		return irect{}, true, false
	}
	saved := irect{sp.Left, sp.Top, sp.Right, sp.Bottom}
	return fitPlacement(saved, set.work, set.primary), sp.Maximized, true
}

func saveWindowPlacement() {
	if mainHwnd == 0 {
		return
	}
	wp := windowPlacement{Length: uint32(unsafe.Sizeof(windowPlacement{}))}
	if r, _, _ := procGetWindowPlacement.Call(mainHwnd, uintptr(unsafe.Pointer(&wp))); r == 0 {
		return
	}
	set := currentMonitors()
	dx, dy := workspaceOffset(set)
	n := wp.RcNormalPosition
	sp := savedPlacement{
		Version: 1,
		Left:    n.Left + dx, Top: n.Top + dy, Right: n.Right + dx, Bottom: n.Bottom + dy,
		Maximized: wp.ShowCmd == SW_SHOWMAXIMIZED || (wp.Flags&0x2 != 0 && wp.ShowCmd == SW_SHOWMINIMIZED), // WPF_RESTORETOMAXIMIZED
	}
	if sp.Right-sp.Left < 200 || sp.Bottom-sp.Top < 150 {
		return
	}
	if b, err := json.Marshal(sp); err == nil {
		_ = writeFileAtomic(placementPath(), b)
	}
}

// applyInitialPlacement positions the (still hidden) window. It returns the
// show command to use.
func applyInitialPlacement(hwnd uintptr) uintptr {
	r, maximized, ok := restoredPlacement()
	if !ok {
		return SW_SHOWMAXIMIZED // first run: keep the previous default
	}
	set := currentMonitors()
	dx, dy := workspaceOffset(set)
	wp := windowPlacement{Length: uint32(unsafe.Sizeof(windowPlacement{}))}
	wp.ShowCmd = SW_HIDE
	wp.RcNormalPosition = rect{r.L - dx, r.T - dy, r.R - dx, r.B - dy}
	procSetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&wp)))
	if maximized {
		return SW_SHOWMAXIMIZED
	}
	return SW_SHOWNORMAL
}
