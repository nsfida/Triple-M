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

	DT_CENTER       = 0x1
	DT_VCENTER      = 0x4
	DT_WORDBREAK    = 0x10
	DT_SINGLELINE   = 0x20
	DT_NOPREFIX     = 0x800
	DT_CALCRECT     = 0x400
	DT_END_ELLIPSIS = 0x8000
	SRCCOPY         = 0x00CC0020
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
	procCreateCompatibleBitmap    = gdi32Lock.NewProc("CreateCompatibleBitmap")
	procBitBlt                    = gdi32Lock.NewProc("BitBlt")
	procCreatePen                 = gdi32Lock.NewProc("CreatePen")
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
	lockHover       int // 3.8: 1 = Unlock button, 2 = sign-out link
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

// paintLockScreen draws the lock screen (3.8): a centred card with the app
// icon, a short explanation, the Unlock button, an optional message, a hint
// and the sign-out link. Every text is measured first and the layout
// (layoutLockScreen) sizes the card and the button around it, so nothing
// overflows at any window size, display scale or button state. The screen is
// drawn off-screen first so it never flickers.
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
	w, h := cr.Right-cr.Left, cr.Bottom-cr.Top
	if w <= 0 || h <= 0 {
		return
	}
	dpi := windowDPI()

	// Off-screen buffer (falls back to drawing directly).
	dc := hdc
	mem, _, _ := procCreateCompatibleDC.Call(hdc)
	var bmp, oldBmp uintptr
	if mem != 0 {
		bmp, _, _ = procCreateCompatibleBitmap.Call(hdc, uintptr(w), uintptr(h))
		if bmp != 0 {
			oldBmp, _, _ = procSelectObject.Call(mem, bmp)
			dc = mem
		}
	}
	defer func() {
		if dc == mem && mem != 0 {
			procBitBlt.Call(hdc, 0, 0, uintptr(w), uintptr(h), mem, 0, 0, SRCCOPY)
			procSelectObject.Call(mem, oldBmp)
		}
		if bmp != 0 {
			procDeleteObject.Call(bmp)
		}
		if mem != 0 {
			procDeleteDC.Call(mem)
		}
	}()

	pal := lockPalette(themeDark)
	fillRectColor(dc, rect{0, 0, w, h}, pal.bg)
	procSetBkMode.Call(dc, 1) // TRANSPARENT

	waiting := helloOp != 0
	sub := "Use Windows Hello (face, fingerprint or PIN) to continue."
	hint := "Press Enter to unlock"
	if waiting {
		hint = "Complete the Windows Hello prompt to continue"
	}
	link := "Can't use Windows Hello? Sign out"

	titleF := makeFont(scalePx(22, dpi), 650)
	subF := makeFont(scalePx(14, dpi), 400)
	btnF := makeFont(scalePx(15, dpi), 600)
	smallF := makeFont(scalePx(13, dpi), 400)
	hintF := makeFont(scalePx(12, dpi), 400)
	linkF := makeFontU(scalePx(13, dpi), 600, lockHover == 2)
	defer func() {
		for _, f := range []uintptr{titleF, subF, btnF, smallF, hintF, linkF} {
			if f != 0 {
				procDeleteObject.Call(f)
			}
		}
	}()

	textW := lockCardTextWidth(w, dpi)
	_, titleH := measureText(dc, titleF, "Triplem VIP is locked", 0, DT_SINGLELINE)
	_, subH := measureText(dc, subF, sub, textW, DT_WORDBREAK|DT_CENTER)
	lw1, lh := measureText(dc, btnF, lockButtonLabel(false), 0, DT_SINGLELINE)
	lw2, _ := measureText(dc, btnF, lockButtonLabel(true), 0, DT_SINGLELINE)
	labelW := lw1
	if lw2 > labelW {
		labelW = lw2 // the button keeps one width, so it never jumps or overflows
	}
	msgH := int32(0)
	if lockMessage != "" {
		_, msgH = measureText(dc, smallF, lockMessage, textW, DT_WORDBREAK|DT_CENTER)
	}
	_, hintH := measureText(dc, hintF, hint, textW, DT_WORDBREAK|DT_CENTER)
	linkW, linkH := measureText(dc, linkF, link, 0, DT_SINGLELINE)

	lay := layoutLockScreen(lockLayoutIn{W: w, H: h, DPI: dpi, TitleH: titleH, SubH: subH, LabelW: labelW, LabelH: lh, MsgH: msgH, HintH: hintH, LinkW: linkW, LinkH: linkH})

	// Card.
	roundRectColor(dc, toRect(lay.Card), pal.card, pal.border, scalePx(18, dpi))
	if lay.ShowIcon {
		ir := toRect(lay.Icon)
		roundRectColor(dc, ir, pal.iconBg, pal.iconBg, scalePx(18, dpi))
		inner := scalePx(44, dpi)
		if icon := loadAppIconSize(int(inner)); icon != 0 {
			procDrawIconEx.Call(dc, uintptr(ir.Left+(ir.Right-ir.Left-inner)/2), uintptr(ir.Top+(ir.Bottom-ir.Top-inner)/2), icon, uintptr(inner), uintptr(inner), 0, 0, 3) // DI_NORMAL
			procDestroyIcon.Call(icon)
		}
	}
	drawTextIn(dc, titleF, pal.fg, "Triplem VIP is locked", toRect(lay.Title), DT_CENTER|DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS)
	drawTextIn(dc, subF, pal.muted, sub, toRect(lay.Sub), DT_CENTER|DT_WORDBREAK)

	// Unlock button.
	lockButtonRect = toRect(lay.Button)
	btnColor := pal.primary
	switch {
	case waiting:
		btnColor = pal.waiting
	case lockHover == 1:
		btnColor = pal.primaryHover
	}
	roundRectColor(dc, lockButtonRect, btnColor, btnColor, scalePx(12, dpi))
	br := lockButtonRect
	br.Left += scalePx(14, dpi)
	br.Right -= scalePx(14, dpi)
	drawTextIn(dc, btnF, pal.onPrimary, lockButtonLabel(waiting), br, DT_CENTER|DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS)

	if lockMessage != "" {
		drawTextIn(dc, smallF, pal.warn, lockMessage, toRect(lay.Msg), DT_CENTER|DT_WORDBREAK)
	}
	drawTextIn(dc, hintF, pal.muted, hint, toRect(lay.Hint), DT_CENTER|DT_WORDBREAK)
	fillRectColor(dc, toRect(lay.Divider), pal.border)

	lockSignOutRect = toRect(lay.Link)
	linkColor := pal.link
	if lockHover == 2 {
		linkColor = pal.linkHover
	}
	drawTextIn(dc, linkF, linkColor, link, lockSignOutRect, DT_CENTER|DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS)
}

type lockColors struct {
	bg, card, border, fg, muted, primary, primaryHover, waiting, onPrimary, warn, link, linkHover, iconBg uintptr
}

func lockPalette(dark bool) lockColors {
	if dark {
		return lockColors{
			bg: rgb(0x0B, 0x12, 0x20), card: rgb(0x14, 0x1D, 0x2E), border: rgb(0x26, 0x33, 0x48),
			fg: rgb(0xE8, 0xED, 0xF5), muted: rgb(0x9A, 0xA8, 0xBC),
			primary: rgb(0x3B, 0x6F, 0xF0), primaryHover: rgb(0x52, 0x82, 0xF5), waiting: rgb(0x3A, 0x46, 0x5A),
			onPrimary: rgb(0xFF, 0xFF, 0xFF), warn: rgb(0xF5, 0x9E, 0x6B),
			link: rgb(0x8F, 0xB0, 0xFF), linkHover: rgb(0xB5, 0xCB, 0xFF), iconBg: rgb(0x1D, 0x2A, 0x42),
		}
	}
	return lockColors{
		bg: rgb(0xEE, 0xF2, 0xF8), card: rgb(0xFF, 0xFF, 0xFF), border: rgb(0xDD, 0xE3, 0xEC),
		fg: rgb(0x0F, 0x17, 0x2A), muted: rgb(0x5B, 0x67, 0x7A),
		primary: rgb(0x24, 0x57, 0xD6), primaryHover: rgb(0x1D, 0x49, 0xB8), waiting: rgb(0x64, 0x74, 0x8B),
		onPrimary: rgb(0xFF, 0xFF, 0xFF), warn: rgb(0xC2, 0x41, 0x0C),
		link: rgb(0x24, 0x57, 0xD6), linkHover: rgb(0x16, 0x3A, 0x99), iconBg: rgb(0xE8, 0xEF, 0xFC),
	}
}

func toRect(r lkRect) rect { return rect{r.L, r.T, r.R, r.B} }

func makeFontU(px int32, weight int, underline bool) uintptr {
	u := uintptr(0)
	if underline {
		u = 1
	}
	f, _, _ := procCreateFontW.Call(uintptr(-px), 0, 0, 0, uintptr(weight), 0, u, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))))
	return f
}

// measureText returns the size of text in the given font. width > 0 wraps the
// text at that width (DT_WORDBREAK).
func measureText(dc, font uintptr, text string, width int32, flags uintptr) (int32, int32) {
	old, _, _ := procSelectObject.Call(dc, font)
	defer procSelectObject.Call(dc, old)
	r := rect{0, 0, width, 0}
	if width <= 0 {
		r.Right = 100000
	}
	drawText(dc, text, &r, flags|DT_CALCRECT)
	return r.Right - r.Left, r.Bottom - r.Top
}

func drawTextIn(dc, font, color uintptr, text string, r rect, flags uintptr) {
	old, _, _ := procSelectObject.Call(dc, font)
	procSetTextColor.Call(dc, color)
	drawText(dc, text, &r, flags)
	procSelectObject.Call(dc, old)
}

func fillRectColor(dc uintptr, r rect, color uintptr) {
	b, _, _ := procCreateSolidBrush.Call(color)
	procFillRect.Call(dc, uintptr(unsafe.Pointer(&r)), b)
	procDeleteObject.Call(b)
}

func roundRectColor(dc uintptr, r rect, fill, border uintptr, radius int32) {
	brush, _, _ := procCreateSolidBrush.Call(fill)
	pen, _, _ := procCreatePen.Call(0, 1, border) // PS_SOLID
	oldB, _, _ := procSelectObject.Call(dc, brush)
	oldP, _, _ := procSelectObject.Call(dc, pen)
	procRoundRect.Call(dc, uintptr(r.Left), uintptr(r.Top), uintptr(r.Right), uintptr(r.Bottom), uintptr(radius), uintptr(radius))
	procSelectObject.Call(dc, oldP)
	procSelectObject.Call(dc, oldB)
	procDeleteObject.Call(pen)
	procDeleteObject.Call(brush)
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
	case WM_MOUSEMOVE:
		x, y := int32(int16(lParam&0xFFFF)), int32(int16((lParam>>16)&0xFFFF))
		hover := 0
		if pointIn(lockButtonRect, x, y) {
			hover = 1
		} else if pointIn(lockSignOutRect, x, y) {
			hover = 2
		}
		if hover != lockHover {
			lockHover = hover
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
