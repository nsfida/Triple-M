//go:build windows

package main

import (
	"unsafe"
)

// Notification-area (system tray) icon, its menu, close-to-tray behaviour and
// native Windows notifications (Shell_NotifyIcon NIF_INFO toasts, which
// Windows 10/11 show as notifications and keep in the Action Centre/
// notification centre, honouring Focus Assist / Do Not Disturb).

type notifyIconData struct {
	CbSize           uint32
	HWnd             uintptr
	UID              uint32
	UFlags           uint32
	UCallbackMessage uint32
	HIcon            uintptr
	SzTip            [128]uint16
	DwState          uint32
	DwStateMask      uint32
	SzInfo           [256]uint16
	UVersion         uint32
	SzInfoTitle      [64]uint16
	DwInfoFlags      uint32
	GuidItem         guid
	HBalloonIcon     uintptr
}

const (
	NIM_ADD        = 0
	NIM_MODIFY     = 1
	NIM_DELETE     = 2
	NIM_SETVERSION = 4

	NIF_MESSAGE  = 0x1
	NIF_ICON     = 0x2
	NIF_TIP      = 0x4
	NIF_INFO     = 0x10
	NIF_SHOWTIP  = 0x80
	NIIF_USER    = 0x4
	NIIF_NOSOUND = 0x10
	NIIF_LARGE   = 0x20
	NIIF_QUIET   = 0x80 // NIIF_RESPECT_QUIET_TIME

	NOTIFYICON_VERSION_4 = 4
	NIN_SELECT           = WM_USER + 0
	NIN_KEYSELECT        = WM_USER + 1
	NIN_BALLOONUSERCLICK = WM_USER + 5

	MF_STRING    = 0x0
	MF_SEPARATOR = 0x800
	MF_CHECKED   = 0x8
	MF_GRAYED    = 0x1

	TPM_RIGHTBUTTON = 0x2
	TPM_RETURNCMD   = 0x100
	TPM_NONOTIFY    = 0x80

	trayIconID = 1

	cmdOpen          = 1001
	cmdQuickExpense  = 1002
	cmdNotifications = 1003
	cmdStartup       = 1004
	cmdCloseToTray   = 1005
	cmdQuit          = 1006
	cmdNewJournal    = 1007
	cmdReports       = 1008
	cmdInventory     = 1009
	cmdUpdate        = 1010
	cmdReport        = 1011
)

var (
	trayAdded          bool
	trayIcon           uintptr
	balloonIcon        uintptr
	toastTarget        string
	unreadCount        int
	wmTaskbarCreated   uintptr
	quitting           bool
	backgroundLaunched bool
	windowEverShown    bool
)

func trayData() notifyIconData {
	return notifyIconData{CbSize: uint32(unsafe.Sizeof(notifyIconData{})), HWnd: mainHwnd, UID: trayIconID}
}

func copyWide(dst []uint16, s string) {
	u := utf16Bytes(s)
	if len(u) > len(dst) {
		u = append(u[:len(dst)-1], 0)
	}
	copy(dst, u)
}

func addTrayIcon() {
	defer recoverOptional("tray icon")
	if mainHwnd == 0 {
		return
	}
	if trayIcon == 0 {
		// The notification area shows small icons: load the matching size
		// rather than shrinking the 32 px image.
		trayIcon = loadAppIconSize(systemIconSize(SM_CXSMICON, 16))
	}
	d := trayData()
	d.UFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP | NIF_SHOWTIP
	d.UCallbackMessage = wmTrayCallback
	d.HIcon = trayIcon
	copyWide(d.SzTip[:], trayTooltip(unreadCount, false))
	if r, _, _ := procShellNotifyIconW.Call(NIM_ADD, uintptr(unsafe.Pointer(&d))); r == 0 {
		// Explorer may not be ready yet (e.g. autostart): retried on TaskbarCreated.
		startupLog("tray icon could not be added yet")
		return
	}
	d.UVersion = NOTIFYICON_VERSION_4
	procShellNotifyIconW.Call(NIM_SETVERSION, uintptr(unsafe.Pointer(&d)))
	trayAdded = true
}

func removeTrayIcon() {
	if !trayAdded {
		return
	}
	d := trayData()
	procShellNotifyIconW.Call(NIM_DELETE, uintptr(unsafe.Pointer(&d)))
	trayAdded = false
}

func updateTrayTooltip() {
	if !trayAdded {
		return
	}
	d := trayData()
	d.UFlags = NIF_TIP | NIF_SHOWTIP
	copyWide(d.SzTip[:], trayTooltip(unreadCount, false))
	procShellNotifyIconW.Call(NIM_MODIFY, uintptr(unsafe.Pointer(&d)))
}

// showToast displays a native Windows notification. Clicking it opens the
// window at target (notifications or messages).
func showToast(title, body, target string) {
	defer recoverOptional("notification")
	if !trayAdded {
		addTrayIcon()
		if !trayAdded {
			return
		}
	}
	if title == "" {
		title = "Triplem VIP"
	}
	if body == "" {
		body = " "
	}
	d := trayData()
	d.UFlags = NIF_INFO
	copyWide(d.SzInfoTitle[:], title)
	copyWide(d.SzInfo[:], body)
	d.DwInfoFlags = NIIF_USER | NIIF_LARGE | NIIF_QUIET
	if balloonIcon == 0 {
		balloonIcon = loadAppIcon() // NIIF_LARGE uses the large icon size
	}
	d.HBalloonIcon = balloonIcon
	if r, _, _ := procShellNotifyIconW.Call(NIM_MODIFY, uintptr(unsafe.Pointer(&d))); r != 0 {
		toastTarget = target
	}
}

func handleTrayCallback(wParam, lParam uintptr) {
	event := uint32(lParam & 0xFFFF)
	switch event {
	case NIN_SELECT, NIN_KEYSELECT, WM_LBUTTONUP:
		showMainWindow()
	case WM_CONTEXTMENU, WM_RBUTTONUP:
		showTrayMenu()
	case NIN_BALLOONUSERCLICK:
		showMainWindow()
		t := toastTarget
		toastTarget = ""
		if t == "" {
			t = "notifications"
		}
		requestOpenTarget(t)
	}
}

func showTrayMenu() {
	menu, _, _ := procCreatePopupMenu.Call()
	if menu == 0 {
		return
	}
	defer procDestroyMenu.Call(menu)
	add := func(flags uintptr, id uintptr, text string) {
		procAppendMenuW.Call(menu, flags, id, uintptr(unsafe.Pointer(utf16Ptr(text))))
	}
	check := func(on bool) uintptr {
		if on {
			return MF_CHECKED
		}
		return 0
	}
	add(MF_STRING, cmdOpen, "Open Triplem VIP")
	add(MF_STRING, cmdQuickExpense, "Quick Add Expense")
	add(MF_STRING, cmdNewJournal, "New Journal Entry")
	add(MF_STRING, cmdReports, "Reports")
	add(MF_STRING, cmdInventory, "Inventory")
	add(MF_SEPARATOR, 0, "")
	add(MF_STRING|check(settings.Notifications), cmdNotifications, "Windows notifications")
	add(MF_STRING|check(startWithWindowsEnabled()), cmdStartup, "Start with Windows")
	add(MF_STRING|check(settings.CloseToTray), cmdCloseToTray, "Keep running in the notification area when closed")
	add(MF_SEPARATOR, 0, "")
	if updatesSupported() {
		if label := updateMenuLabel(); label != "" {
			add(MF_STRING, cmdUpdate, label)
		} else {
			add(MF_STRING, cmdUpdate, "Check for updates")
		}
	}
	add(MF_STRING, cmdReport, "Create error report…")
	add(MF_SEPARATOR, 0, "")
	add(MF_STRING, cmdQuit, "Quit Triplem VIP")
	procSetMenuDefaultItem.Call(menu, cmdOpen, 0)

	var pt point
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	procSetForegroundWindow.Call(mainHwnd) // required so the menu closes on outside click
	cmd, _, _ := procTrackPopupMenu.Call(menu, TPM_RIGHTBUTTON|TPM_RETURNCMD|TPM_NONOTIFY, uintptr(pt.X), uintptr(pt.Y), 0, mainHwnd, 0)
	procPostMessageW.Call(mainHwnd, WM_NULL, 0, 0)
	handleMenuCommand(cmd)
}

func handleMenuCommand(cmd uintptr) {
	switch cmd {
	case cmdOpen:
		showMainWindow()
	case cmdQuickExpense:
		showMainWindow()
		requestOpenTarget("new-expense")
	case cmdNewJournal:
		showMainWindow()
		requestOpenTarget("new-journal")
	case cmdReports:
		showMainWindow()
		requestOpenTarget("reports")
	case cmdInventory:
		showMainWindow()
		requestOpenTarget("inventory")
	case cmdNotifications:
		applySetting("notifications", !settings.Notifications)
		sendSettingsToPage()
	case cmdStartup:
		applySetting("startWithWindows", !startWithWindowsEnabled())
		sendSettingsToPage()
	case cmdCloseToTray:
		applySetting("closeToTray", !settings.CloseToTray)
		sendSettingsToPage()
	case cmdUpdate:
		if updateMenuLabel() != "" {
			installStagedUpdate()
		} else {
			showMainWindow()
			checkForUpdates(true)
		}
	case cmdReport:
		sendErrorReport()
	case cmdQuit:
		quitApplication()
	}
}

// refreshTrayMenuState exists for symmetry: the menu is rebuilt from current
// settings every time it opens, so nothing is cached.
func refreshTrayMenuState() {}

// ---- Window visibility --------------------------------------------------------------

func setWebVisible(v bool) {
	if webController == nil {
		return
	}
	flag := uintptr(0)
	if v {
		flag = 1
	}
	vcall(uintptr(unsafe.Pointer(webController)), controllerSetIsVisible, flag)
}

func showMainWindow() {
	if mainHwnd == 0 {
		return
	}
	if ic, _, _ := procIsIconic.Call(mainHwnd); ic != 0 {
		procShowWindow.Call(mainHwnd, SW_RESTORE)
	} else if v, _, _ := procIsWindowVisible.Call(mainHwnd); v == 0 {
		if !windowEverShown {
			// First show after a background start: remembered size/state.
			procShowWindow.Call(mainHwnd, uintptr(initialShowCmd))
		} else {
			// Back from the tray: keep the window exactly as the user left it.
			procShowWindow.Call(mainHwnd, SW_SHOW)
		}
	}
	windowEverShown = true
	setWebVisible(true)
	procBringWindowToTop.Call(mainHwnd)
	if r, _, _ := procSetForegroundWindow.Call(mainHwnd); r == 0 {
		procFlashWindow.Call(mainHwnd, 1)
	}
	refreshOverlayBadge()
	if pageReady {
		postToPage(map[string]interface{}{"type": "visibility", "visible": true})
	}
}

// hideToTray keeps the app (and its notifications) running without a window.
func hideToTray() {
	saveWindowPlacement()
	if !trayAdded {
		addTrayIcon()
	}
	if !trayAdded {
		// No notification area available: minimise instead of hiding so the
		// app can always be found again.
		procShowWindow.Call(mainHwnd, SW_SHOWMINIMIZED)
		return
	}
	procShowWindow.Call(mainHwnd, SW_HIDE)
	setWebVisible(false)
	if pageReady {
		postToPage(map[string]interface{}{"type": "visibility", "visible": false})
	}
	if !settings.CloseHintShown {
		settings.CloseHintShown = true
		saveSettings()
		showToast("Triplem VIP is still running", "Notifications keep arriving here. Right-click the Triplem VIP icon in the notification area and choose Quit to exit completely.", "")
	}
}

func quitApplication() {
	if quitting {
		return
	}
	quitting = true
	markRunClean()
	if isWindowShown() {
		saveWindowPlacement()
	}
	removeTrayIcon()
	clearOverlayBadge()
	procDestroyWindow.Call(mainHwnd)
}
