//go:build windows

package main

import (
	"syscall"
	"time"
	"unsafe"
)

// App lock with Windows Hello (3.7).
//
// When the lock is on, Triplem VIP asks for Windows Hello (face, fingerprint
// or PIN) when it starts, when the window comes back after it was closed to
// the notification area or minimised for the chosen time, after the PC was
// idle for that time, and when Windows is locked or goes to sleep.
//
// While locked, the web content is not rendered at all (the WebView2 surface
// is hidden) and the window shows a native lock screen. The page keeps
// running, so notifications still arrive (their text is hidden while locked
// unless the user chose otherwise). Only a successful Windows Hello check
// unlocks; the page cannot unlock the app itself.

const (
	helloPollTimerID  = 0x54564990
	lockIdleTimerID   = 0x54564991
	helloAvailTimerID = 0x54564992
	helloAutoTimerID  = 0x54564993

	WM_PAINT             = 0x000F
	WM_ERASEBKGND        = 0x0014
	WM_KEYDOWN           = 0x0100
	WM_MOUSEMOVE         = 0x0200
	WM_SETCURSOR         = 0x0020
	WM_WTSSESSION_CHANGE = 0x02B1
	WM_POWERBROADCAST    = 0x0218
	WTS_SESSION_LOCK     = 0x7
	PBT_APMSUSPEND       = 0x4
	VK_RETURN            = 0x0D
	VK_SPACE             = 0x20

	DT_CENTER     = 0x1
	DT_VCENTER    = 0x4
	DT_WORDBREAK  = 0x10
	DT_SINGLELINE = 0x20
	DT_NOPREFIX   = 0x800
	DT_CALCRECT   = 0x400
)

var (
	iidUserConsentVerifierInterop = guid{0x39E050C3, 0x4E74, 0x441A, [8]byte{0x8D, 0xC0, 0xB8, 0x11, 0x04, 0xDF, 0x94, 0x9C}}
	iidUserConsentVerifierStatics = guid{0xAF4F3F91, 0x564C, 0x4DDC, [8]byte{0xB8, 0xB5, 0x97, 0x34, 0x47, 0x62, 0x7C, 0x65}}
	// IAsyncOperation<UserConsentVerificationResult> (WinRT parameterized IID).
	iidAsyncOpConsentResult = guid{0xFD596FFD, 0x2318, 0x558F, [8]byte{0x9D, 0xBE, 0xD2, 0x1D, 0xF4, 0x37, 0x64, 0xA5}}

	gdi32Lock                     = syscall.NewLazyDLL("gdi32.dll")
	wtsapi32                      = syscall.NewLazyDLL("wtsapi32.dll")
	procBeginPaint                = user32.NewProc("BeginPaint")
	procEndPaint                  = user32.NewProc("EndPaint")
	procFillRect                  = user32.NewProc("FillRect")
	procDrawTextW                 = user32.NewProc("DrawTextW")
	procDrawIconEx                = user32.NewProc("DrawIconEx")
	procInvalidateRect            = user32.NewProc("InvalidateRect")
	procGetDpiForWindow           = user32.NewProc("GetDpiForWindow")
	procGetLastInputInfo          = user32.NewProc("GetLastInputInfo")
	procSetCursor                 = user32.NewProc("SetCursor")
	procCreateSolidBrush          = gdi32Lock.NewProc("CreateSolidBrush")
	procCreateFontW               = gdi32Lock.NewProc("CreateFontW")
	procSelectObject              = gdi32Lock.NewProc("SelectObject")
	procSetBkMode                 = gdi32Lock.NewProc("SetBkMode")
	procSetTextColor              = gdi32Lock.NewProc("SetTextColor")
	procRoundRect                 = gdi32Lock.NewProc("RoundRect")
	procGetStockObject            = gdi32Lock.NewProc("GetStockObject")
	procWTSRegisterSessionNotif   = wtsapi32.NewProc("WTSRegisterSessionNotification")
	procWTSUnRegisterSessionNotif = wtsapi32.NewProc("WTSUnRegisterSessionNotification")
	procGetTickCount              = kernel32.NewProc("GetTickCount")
)

type paintStruct struct {
	Hdc         uintptr
	FErase      int32
	RcPaint     rect
	FRestore    int32
	FIncUpdate  int32
	RgbReserved [32]byte
}

type lastInputInfo struct {
	CbSize uint32
	DwTime uint32
}

var (
	appLocked       bool
	awayFrom        time.Time // when the window was hidden or minimised
	helloOp         uintptr
	helloPurpose    string // unlock | enable | disable
	helloAvailable  = -1   // -1 unknown, else UserConsentVerifierAvailability
	lockMessage     string // shown under the Unlock button
	lockButtonRect  rect
	lockSignOutRect rect
	signOutAskedAt  time.Time
	lastAutoPrompt  time.Time
	themeDark       bool
	sessionNotifyOn bool
)

// ---- Lock state ---------------------------------------------------------------------

func appLockEnabled() bool { return settings.AppLock && !safeStart }

// lockApp hides the workspace behind the lock screen.
func lockApp(reason string) {
	defer recoverOptional("app lock")
	if !appLockEnabled() || appLocked {
		return
	}
	appLocked = true
	lockMessage = ""
	startupLog("app locked (" + reason + ")")
	setWebVisible(false)
	if mainHwnd != 0 {
		procSetFocus.Call(mainHwnd) // Enter / Space on the lock screen
	}
	invalidateWindow()
	refreshTrayTooltip()
	postToPage(map[string]interface{}{"type": "lock-state", "locked": true})
}

func unlockApp() {
	appLocked = false
	lockMessage = ""
	awayFrom = time.Time{}
	if isWindowShown() {
		if ic, _, _ := procIsIconic.Call(mainHwnd); ic == 0 {
			setWebVisible(true)
			focusWebView()
		}
	}
	invalidateWindow()
	refreshTrayTooltip()
	postToPage(map[string]interface{}{"type": "lock-state", "locked": false})
}

func invalidateWindow() {
	if mainHwnd != 0 {
		procInvalidateRect.Call(mainHwnd, 0, 1)
	}
}

// noteAway records that the window was hidden or minimised.
func noteAway() {
	if awayFrom.IsZero() {
		awayFrom = time.Now()
	}
	if appLockEnabled() && settings.LockMinutes <= 0 {
		lockApp("window closed")
	}
}

// noteReturn runs when the window is shown or restored again.
func noteReturn() {
	if lockOnReturn(appLockEnabled(), settings.LockMinutes, awayFrom, time.Now()) {
		lockApp("returned after away time")
	}
	awayFrom = time.Time{}
	if appLocked {
		scheduleAutoPrompt()
	}
}

// scheduleAutoPrompt opens Windows Hello shortly after a locked window is
// shown, so the user does not have to click first. Cancelling leaves the
// lock screen with its Unlock button.
func scheduleAutoPrompt() {
	if helloOp != 0 || time.Since(lastAutoPrompt) < 5*time.Second {
		return
	}
	procSetTimer.Call(mainHwnd, helloAutoTimerID, 350, 0)
}

func onHelloAutoTimer() {
	procKillTimer.Call(mainHwnd, helloAutoTimerID)
	if !appLocked || !isWindowShown() {
		return
	}
	if ic, _, _ := procIsIconic.Call(mainHwnd); ic != 0 {
		return
	}
	lastAutoPrompt = time.Now()
	requestHello("unlock")
}

func startLockMonitoring() {
	defer recoverOptional("app lock monitoring")
	procSetTimer.Call(mainHwnd, lockIdleTimerID, 20*1000, 0)
	procSetTimer.Call(mainHwnd, helloAvailTimerID, 2500, 0)
	if procWTSRegisterSessionNotif.Find() == nil {
		if r, _, _ := procWTSRegisterSessionNotif.Call(mainHwnd, 0); r != 0 { // NOTIFY_FOR_THIS_SESSION
			sessionNotifyOn = true
		}
	}
	if appLockEnabled() {
		appLocked = true // every start begins locked
		setWebVisible(false)
		if isWindowShown() {
			scheduleAutoPrompt()
		}
	}
}

func stopLockMonitoring() {
	if sessionNotifyOn {
		procWTSUnRegisterSessionNotif.Call(mainHwnd)
		sessionNotifyOn = false
	}
}

func onLockIdleTimer() {
	if !appLockEnabled() || appLocked || !isWindowShown() {
		return
	}
	info := lastInputInfo{CbSize: uint32(unsafe.Sizeof(lastInputInfo{}))}
	if r, _, _ := procGetLastInputInfo.Call(uintptr(unsafe.Pointer(&info))); r == 0 {
		return
	}
	now, _, _ := procGetTickCount.Call()
	idle := time.Duration(uint32(now)-info.DwTime) * time.Millisecond
	if lockForIdle(true, settings.LockMinutes, idle) {
		lockApp("idle")
	}
}

// ---- Windows Hello ------------------------------------------------------------------

func onHelloAvailabilityTimer() {
	procKillTimer.Call(mainHwnd, helloAvailTimerID)
	checkHelloAvailability()
	sendSettingsToPage()
}

func checkHelloAvailability() {
	defer recoverOptional("Windows Hello availability")
	statics := activationFactory("Windows.Security.Credentials.UI.UserConsentVerifier", &iidUserConsentVerifierStatics)
	if statics == 0 {
		helloAvailable = helloDeviceMissing
		return
	}
	defer releaseCOM(statics)
	var op uintptr
	if !hrOK(vcall(statics, 6, uintptr(unsafe.Pointer(&op)))) || op == 0 { // CheckAvailabilityAsync
		return
	}
	defer releaseCOM(op)
	if !waitAsync(op, 4*time.Second) {
		return
	}
	var v int32 = -1
	if hrOK(vcall(op, asyncOpGetResults, uintptr(unsafe.Pointer(&v)))) && v >= 0 {
		helloAvailable = int(v)
	}
}

// requestHello shows the Windows Hello dialog over the app window.
func requestHello(purpose string) {
	defer recoverOptional("Windows Hello")
	if helloOp != 0 {
		return
	}
	msg := "Unlock Triplem VIP"
	switch purpose {
	case "enable":
		msg = "Confirm it's you to turn on the Triplem VIP lock"
	case "disable":
		msg = "Confirm it's you to turn off the Triplem VIP lock"
	}
	if isWindowShown() {
		procSetForegroundWindow.Call(mainHwnd)
	}
	var op uintptr
	withHString(msg, func(hs uintptr) {
		// Desktop apps must name their window so the dialog is shown over it.
		interop := activationFactory("Windows.Security.Credentials.UI.UserConsentVerifier", &iidUserConsentVerifierInterop)
		if interop != 0 {
			vcall(interop, 6, mainHwnd, hs, uintptr(unsafe.Pointer(&iidAsyncOpConsentResult)), uintptr(unsafe.Pointer(&op)))
			releaseCOM(interop)
		}
		if op == 0 {
			statics := activationFactory("Windows.Security.Credentials.UI.UserConsentVerifier", &iidUserConsentVerifierStatics)
			if statics != 0 {
				vcall(statics, 7, hs, uintptr(unsafe.Pointer(&op)))
				releaseCOM(statics)
			}
		}
	})
	if op == 0 {
		finishHello(purpose, helloDeviceMissing)
		return
	}
	helloOp, helloPurpose = op, purpose
	procSetTimer.Call(mainHwnd, helloPollTimerID, 150, 0)
}

func pollHello() {
	if helloOp == 0 {
		procKillTimer.Call(mainHwnd, helloPollTimerID)
		return
	}
	info := comQuery(helloOp, &iidAsyncInfoNative)
	if info == 0 {
		return
	}
	var status int32
	ok := hrOK(vcall(info, asyncInfoStatus, uintptr(unsafe.Pointer(&status))))
	releaseCOM(info)
	if !ok || status == 0 { // Started
		return
	}
	procKillTimer.Call(mainHwnd, helloPollTimerID)
	code := -1
	if status == 1 { // Completed
		var v int32 = -1
		if hrOK(vcall(helloOp, asyncOpGetResults, uintptr(unsafe.Pointer(&v)))) {
			code = int(v)
		}
	} else if status == 2 { // Canceled
		code = helloCanceled
	}
	releaseCOM(helloOp)
	purpose := helloPurpose
	helloOp, helloPurpose = 0, ""
	finishHello(purpose, code)
}

func finishHello(purpose string, code int) {
	verified := code == helloVerified
	if code >= 0 && code != helloCanceled && code != helloRetriesUsed && code != helloDeviceBusy {
		if verified {
			helloAvailable = 0
		} else if code == helloDeviceMissing || code == helloNotConfigured || code == helloDisabledPolicy {
			helloAvailable = code
		}
	}
	switch purpose {
	case "unlock":
		if verified {
			unlockApp()
			return
		}
		if code == helloCanceled {
			lockMessage = "Verification was cancelled. Select Unlock to try again."
		} else {
			lockMessage = helloResultText(code)
		}
		invalidateWindow()
	case "enable", "disable":
		if verified {
			settings.AppLock = purpose == "enable"
			saveSettings()
			if !settings.AppLock && appLocked {
				unlockApp()
			}
			refreshJumpListForPrivacy()
			sendSettingsToPage()
			postToPage(map[string]interface{}{"type": "lock-result", "ok": true, "enabled": settings.AppLock})
			return
		}
		sendSettingsToPage()
		postToPage(map[string]interface{}{"type": "lock-result", "ok": false, "enabled": settings.AppLock, "error": helloResultText(code)})
	}
}

// ---- Lock screen --------------------------------------------------------------------

func rgb(r, g, b uint8) uintptr { return uintptr(r) | uintptr(g)<<8 | uintptr(b)<<16 }

func windowDPI() int {
	if procGetDpiForWindow.Find() == nil && mainHwnd != 0 {
		if d, _, _ := procGetDpiForWindow.Call(mainHwnd); d >= 96 && d <= 480 {
			return int(d)
		}
	}
	return 96
}

func scalePx(px, dpi int) int32 { return int32(px * dpi / 96) }

func makeFont(px int32, weight int) uintptr {
	h := -px // negative: character height in pixels
	f, _, _ := procCreateFontW.Call(uintptr(h), 0, 0, 0, uintptr(weight), 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))))
	return f
}

func drawText(hdc uintptr, text string, r *rect, flags uintptr) {
	u := utf16Bytes(text)
	procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u[0])), uintptr(len(u)-1), uintptr(unsafe.Pointer(r)), flags|DT_NOPREFIX)
}

func paintLockScreen(hwnd uintptr) {
	var ps paintStruct
	hdc, _, _ := procBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	if hdc == 0 {
		return
	}
	defer procEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	defer recoverOptional("lock screen")
	var cr rect
	procGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&cr)))
	dpi := windowDPI()
	bg, fg, muted := rgb(0xF4, 0xF6, 0xFB), rgb(0x0F, 0x17, 0x2A), rgb(0x5B, 0x67, 0x7A)
	if themeDark {
		bg, fg, muted = rgb(0x0F, 0x17, 0x2A), rgb(0xE2, 0xE8, 0xF0), rgb(0x94, 0xA3, 0xB8)
	}
	brush, _, _ := procCreateSolidBrush.Call(bg)
	procFillRect.Call(hdc, uintptr(unsafe.Pointer(&cr)), brush)
	procDeleteObject.Call(brush)
	procSetBkMode.Call(hdc, 1) // TRANSPARENT

	w := cr.Right - cr.Left
	cx := cr.Left + w/2
	iconSize := scalePx(72, dpi)
	block := iconSize + scalePx(170, dpi)
	top := cr.Top + (cr.Bottom-cr.Top-block)/2
	if top < scalePx(16, dpi) {
		top = scalePx(16, dpi)
	}
	if icon := loadAppIconSize(int(iconSize)); icon != 0 {
		procDrawIconEx.Call(hdc, uintptr(cx-iconSize/2), uintptr(top), icon, uintptr(iconSize), uintptr(iconSize), 0, 0, 3) // DI_NORMAL
		procDestroyIcon.Call(icon)
	}
	y := top + iconSize + scalePx(16, dpi)

	title := makeFont(scalePx(21, dpi), 600)
	old, _, _ := procSelectObject.Call(hdc, title)
	procSetTextColor.Call(hdc, fg)
	r := rect{cr.Left + scalePx(16, dpi), y, cr.Right - scalePx(16, dpi), y + scalePx(30, dpi)}
	drawText(hdc, "Triplem VIP is locked", &r, DT_CENTER|DT_SINGLELINE|DT_VCENTER)
	procSelectObject.Call(hdc, old)
	procDeleteObject.Call(title)
	y += scalePx(34, dpi)

	body := makeFont(scalePx(14, dpi), 400)
	old, _, _ = procSelectObject.Call(hdc, body)
	procSetTextColor.Call(hdc, muted)
	r = rect{cr.Left + scalePx(16, dpi), y, cr.Right - scalePx(16, dpi), y + scalePx(22, dpi)}
	drawText(hdc, "Use Windows Hello (face, fingerprint or PIN) to continue.", &r, DT_CENTER|DT_SINGLELINE|DT_VCENTER)
	y += scalePx(36, dpi)

	// Unlock button.
	bw, bh := scalePx(168, dpi), scalePx(40, dpi)
	lockButtonRect = rect{cx - bw/2, y, cx + bw/2, y + bh}
	btn, _, _ := procCreateSolidBrush.Call(rgb(0x24, 0x57, 0xD6))
	nullPen, _, _ := procGetStockObject.Call(8) // NULL_PEN
	oldPen, _, _ := procSelectObject.Call(hdc, nullPen)
	oldBrush, _, _ := procSelectObject.Call(hdc, btn)
	rad := uintptr(scalePx(12, dpi))
	procRoundRect.Call(hdc, uintptr(lockButtonRect.Left), uintptr(lockButtonRect.Top), uintptr(lockButtonRect.Right), uintptr(lockButtonRect.Bottom), rad, rad)
	procSelectObject.Call(hdc, oldBrush)
	procSelectObject.Call(hdc, oldPen)
	procDeleteObject.Call(btn)
	procSelectObject.Call(hdc, old)
	procDeleteObject.Call(body)

	label := makeFont(scalePx(15, dpi), 600)
	old, _, _ = procSelectObject.Call(hdc, label)
	procSetTextColor.Call(hdc, rgb(0xFF, 0xFF, 0xFF))
	br := lockButtonRect
	text := "Unlock"
	if helloOp != 0 {
		text = "Waiting for Windows Hello…"
	}
	drawText(hdc, text, &br, DT_CENTER|DT_SINGLELINE|DT_VCENTER)
	procSelectObject.Call(hdc, old)
	procDeleteObject.Call(label)
	y += bh + scalePx(14, dpi)

	small := makeFont(scalePx(13, dpi), 400)
	old, _, _ = procSelectObject.Call(hdc, small)
	if lockMessage != "" {
		procSetTextColor.Call(hdc, rgb(0xC2, 0x41, 0x0C))
		r = rect{cx - scalePx(260, dpi), y, cx + scalePx(260, dpi), y + scalePx(60, dpi)}
		drawText(hdc, lockMessage, &r, DT_CENTER|DT_WORDBREAK)
		y += scalePx(64, dpi)
	} else {
		y += scalePx(6, dpi)
	}
	procSetTextColor.Call(hdc, muted)
	lockSignOutRect = rect{cx - scalePx(180, dpi), y, cx + scalePx(180, dpi), y + scalePx(22, dpi)}
	so := lockSignOutRect
	drawText(hdc, "Can't use Windows Hello? Sign out", &so, DT_CENTER|DT_SINGLELINE|DT_VCENTER)
	procSelectObject.Call(hdc, old)
	procDeleteObject.Call(small)
}

func pointIn(r rect, x, y int32) bool {
	return x >= r.Left && x < r.Right && y >= r.Top && y < r.Bottom
}

// handleLockInput processes clicks and keys on the lock screen. It returns
// true when the message was used.
func handleLockInput(message uint32, wParam, lParam uintptr) bool {
	if !appLocked {
		return false
	}
	switch message {
	case WM_LBUTTONUP:
		x, y := int32(int16(lParam&0xFFFF)), int32(int16((lParam>>16)&0xFFFF))
		if pointIn(lockButtonRect, x, y) {
			requestHello("unlock")
			invalidateWindow()
		} else if pointIn(lockSignOutRect, x, y) {
			if messageBoxReturn("Sign out of Triplem VIP", "Sign out of your account on this PC?\n\nChanges saved on this PC stay here and sync after you sign in again.", MB_YESNO|MB_ICONQUESTION) == IDYES {
				signOutAskedAt = time.Now()
				postToPage(map[string]interface{}{"type": "lock-signout"})
			}
		}
		return true
	case WM_KEYDOWN:
		if wParam == VK_RETURN || wParam == VK_SPACE {
			requestHello("unlock")
			invalidateWindow()
		}
		return true
	case WM_SETCURSOR:
		var pt point
		procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
		procScreenToClient.Call(mainHwnd, uintptr(unsafe.Pointer(&pt)))
		if pointIn(lockButtonRect, pt.X, pt.Y) || pointIn(lockSignOutRect, pt.X, pt.Y) {
			hand, _, _ := procLoadCursorW.Call(0, 32649) // IDC_HAND
			procSetCursor.Call(hand)
			return true
		}
	}
	return false
}

// pageSignedOutFromLock unlocks after the user chose "Sign out" on the lock
// screen and the page confirms the sign-out (nothing is left to protect).
func pageSignedOutFromLock() {
	if appLocked && !signOutAskedAt.IsZero() && time.Since(signOutAskedAt) < 2*time.Minute {
		signOutAskedAt = time.Time{}
		if helloAvailable == helloDeviceMissing || helloAvailable == helloNotConfigured || helloAvailable == helloDisabledPolicy {
			// Windows Hello cannot work on this PC any more: keeping the lock
			// on would lock the user out after every start. The account itself
			// still needs its password to sign in again.
			settings.AppLock = false
			saveSettings()
			refreshJumpListForPrivacy()
		}
		unlockApp()
		sendSettingsToPage()
	}
}

var procScreenToClient = user32.NewProc("ScreenToClient")
