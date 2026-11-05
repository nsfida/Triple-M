//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// Quick-add shortcut key and a title bar that matches the app theme (3.6).

const (
	WM_HOTKEY     = 0x0312
	MOD_ALT       = 0x0001
	MOD_CONTROL   = 0x0002
	MOD_SHIFT     = 0x0004
	MOD_NOREPEAT  = 0x4000
	quickAddKeyID = 0x5456
	quickAddVKey  = 'E'

	dwmUseDarkMode      = 20 // DWMWA_USE_IMMERSIVE_DARK_MODE (Windows 10 20H1+ / 11)
	dwmUseDarkModeOld   = 19 // same attribute on Windows 10 1809-1909
	dwmCaptionColor     = 35 // Windows 11
	dwmTextColor        = 36 // Windows 11
	dwmSystemBackdrop   = 38 // Windows 11 22H2+
	dwmBackdropMainWin  = 2  // DWMSBT_MAINWINDOW (Mica)
	quickAddShortcutTxt = "Ctrl+Alt+Shift+E"
)

var (
	procRegisterHotKey        = user32.NewProc("RegisterHotKey")
	procUnregisterHotKey      = user32.NewProc("UnregisterHotKey")
	dwmapi                    = syscall.NewLazyDLL("dwmapi.dll")
	procDwmSetWindowAttribute = dwmapi.NewProc("DwmSetWindowAttribute")
	hotkeyRegistered          bool
	hotkeyUnavailable         bool
)

// applyQuickAddHotkey registers Ctrl+Alt+Shift+E for "Add expense" while the
// setting is on. If another program already uses the combination, Windows
// refuses it and the settings panel says so; nothing else is affected.
func applyQuickAddHotkey() {
	defer recoverOptional("shortcut key")
	if mainHwnd == 0 {
		return
	}
	want := settings.QuickAddHotkey && !safeStart
	if want && !hotkeyRegistered {
		r, _, _ := procRegisterHotKey.Call(mainHwnd, quickAddKeyID, MOD_CONTROL|MOD_ALT|MOD_SHIFT|MOD_NOREPEAT, quickAddVKey)
		hotkeyRegistered = r != 0
		hotkeyUnavailable = r == 0
		if r == 0 {
			startupLog("shortcut key " + quickAddShortcutTxt + " is used by another program")
		}
	} else if !want && hotkeyRegistered {
		procUnregisterHotKey.Call(mainHwnd, quickAddKeyID)
		hotkeyRegistered = false
		hotkeyUnavailable = false
	}
}

func onHotkey(id uintptr) {
	if id != quickAddKeyID {
		return
	}
	showMainWindow()
	requestOpenTarget("new-expense")
}

// applyWindowBackdrop gives the window the Windows 11 Mica material behind
// the title bar. Older Windows versions ignore it.
func applyWindowBackdrop(hwnd uintptr) {
	defer recoverOptional("window backdrop")
	v := uint32(dwmBackdropMainWin)
	procDwmSetWindowAttribute.Call(hwnd, dwmSystemBackdrop, uintptr(unsafe.Pointer(&v)), 4)
}

// applyTitleBarTheme matches the title bar to the app theme the page reports.
func applyTitleBarTheme(dark bool, color string) {
	defer recoverOptional("title bar theme")
	if mainHwnd == 0 {
		return
	}
	var on uint32
	if dark {
		on = 1
	}
	if r, _, _ := procDwmSetWindowAttribute.Call(mainHwnd, dwmUseDarkMode, uintptr(unsafe.Pointer(&on)), 4); !hrOK(r) {
		procDwmSetWindowAttribute.Call(mainHwnd, dwmUseDarkModeOld, uintptr(unsafe.Pointer(&on)), 4)
	}
	if c, ok := parseHexColor(color); ok {
		procDwmSetWindowAttribute.Call(mainHwnd, dwmCaptionColor, uintptr(unsafe.Pointer(&c)), 4)
		text := uint32(0x00201A12) // near-black
		if colorIsDark(c) {
			text = 0x00FFFFFF
		}
		procDwmSetWindowAttribute.Call(mainHwnd, dwmTextColor, uintptr(unsafe.Pointer(&text)), 4)
	} else {
		def := uint32(0xFFFFFFFF) // DWMWA_COLOR_DEFAULT
		procDwmSetWindowAttribute.Call(mainHwnd, dwmCaptionColor, uintptr(unsafe.Pointer(&def)), 4)
		procDwmSetWindowAttribute.Call(mainHwnd, dwmTextColor, uintptr(unsafe.Pointer(&def)), 4)
	}
}
