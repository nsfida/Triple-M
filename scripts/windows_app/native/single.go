//go:build windows

package main

import (
	"syscall"
	"time"
	"unsafe"
)

// One Triplem VIP process per Windows session. A second launch (Jump List task,
// Start Menu, desktop shortcut, notification click) forwards its validated
// arguments to the running instance and exits, so the tray app, the open
// session and the badge are never duplicated.

var singleInstanceMutex uintptr

// acquireSingleInstance returns true when this process is the primary instance.
func acquireSingleInstance() bool {
	name := utf16Ptr(`Local\TriplemVIP.Desktop.SingleInstance`)
	// LazyProc.Call captures GetLastError immediately after the call; a
	// separate GetLastError call could observe a value changed by the runtime.
	h, _, callErr := procCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(name)))
	if h == 0 {
		return true // cannot decide: run normally rather than refuse to start
	}
	if errno, ok := callErr.(syscall.Errno); ok && errno == ERROR_ALREADY_EXISTS {
		procCloseHandleNative.Call(h)
		return false
	}
	singleInstanceMutex = h // held for the life of the process
	return true
}

var procCloseHandleNative = kernel32.NewProc("CloseHandle")

func releaseSingleInstance() {
	if singleInstanceMutex != 0 {
		procCloseHandleNative.Call(singleInstanceMutex)
		singleInstanceMutex = 0
	}
}

func findRunningWindow() uintptr {
	h, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(utf16Ptr(mainWindowClass))), 0)
	return h
}

// forwardToRunningInstance delivers args to the primary instance. It waits a
// few seconds in case the primary instance is still creating its window.
func forwardToRunningInstance(a launchArgs) bool {
	payload := utf16Bytes(encodeForwardedArgs(a))
	deadline := time.Now().Add(6 * time.Second)
	for {
		if hwnd := findRunningWindow(); hwnd != 0 {
			var pid uint32
			procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
			if pid != 0 {
				procAllowSetForegroundWindow.Call(uintptr(pid))
			}
			cds := copyDataStruct{DwData: copyDataMagic, CbData: uint32(len(payload) * 2), LpData: uintptr(unsafe.Pointer(&payload[0]))}
			r, _, _ := procSendMessageW.Call(hwnd, WM_COPYDATA, 0, uintptr(unsafe.Pointer(&cds)))
			return r == 1
		}
		if time.Now().After(deadline) {
			return false
		}
		time.Sleep(150 * time.Millisecond)
	}
}

// handleCopyData runs in the primary instance (UI thread).
func handleCopyData(lParam uintptr) uintptr {
	cds := (*copyDataStruct)(unsafe.Pointer(lParam))
	if cds == nil || cds.DwData != copyDataMagic || cds.CbData == 0 || cds.CbData > 1024 || cds.CbData%2 != 0 {
		return 0
	}
	u := unsafe.Slice((*uint16)(unsafe.Pointer(cds.LpData)), cds.CbData/2)
	s := string(utf16Decode(u))
	a, ok := decodeForwardedArgs(s)
	if !ok {
		return 0
	}
	// Defer the work: SendMessage callers wait for this return value.
	dispatchUI(func() {
		if a.Background {
			return // e.g. a duplicate autostart: nothing to show
		}
		showMainWindow()
		if a.Open != "" {
			requestOpenTarget(a.Open)
		}
	})
	return 1
}

func utf16Decode(u []uint16) []rune {
	out := make([]rune, 0, len(u))
	for i := 0; i < len(u); i++ {
		c := u[i]
		if c == 0 {
			break
		}
		if c >= 0xD800 && c < 0xDC00 && i+1 < len(u) {
			d := u[i+1]
			if d >= 0xDC00 && d < 0xE000 {
				out = append(out, (rune(c)-0xD800)<<10+(rune(d)-0xDC00)+0x10000)
				i++
				continue
			}
		}
		out = append(out, rune(c))
	}
	return out
}
