//go:build windows

package main

import (
	"bytes"
	"image"
	"image/draw"
	"image/png"
	"runtime/debug"
	"unsafe"
)

// Quieter background mode and the unread count on the notification-area icon
// (3.7).
//
// While the window is closed to the notification area, WebView2 is asked to
// use as little memory as possible (MemoryUsageTargetLevel LOW) and the host
// process returns its spare memory to Windows. When nothing on the page needs
// to run in the background (notifications off, or the Store version whose
// notifications come from Windows push), the page is paused completely
// (TrySuspend) a minute after the window was hidden. Showing the window
// restores everything.

const (
	suspendTimerID   = 0x549001
	suspendDelayMs   = 60 * 1000
	wv3TrySuspend    = 68
	wv3Resume        = 69
	wv19SetMemTarget = 120
	memoryTargetLow  = 1
	memoryTargetNorm = 0
)

var (
	iidCoreWebView2_3  = guid{0xa0d6df20, 0x3b92, 0x416d, [8]byte{0xaa, 0x0c, 0x43, 0x7a, 0x9c, 0x72, 0x78, 0x57}}
	iidCoreWebView2_19 = guid{0x6921f954, 0x79b0, 0x437f, [8]byte{0xa9, 0x97, 0xc8, 0x58, 0x11, 0x89, 0x7c, 0x68}}

	procSetProcessWorkingSetSize = kernel32.NewProc("SetProcessWorkingSetSize")
	procGetCurrentProcess        = kernel32.NewProc("GetCurrentProcess")
	procGetIconInfo              = user32.NewProc("GetIconInfo")
	procGetDIBits                = gdi32Lock.NewProc("GetDIBits")
	procCreateCompatibleDC       = gdi32Lock.NewProc("CreateCompatibleDC")
	procDeleteDC                 = gdi32Lock.NewProc("DeleteDC")

	pageSuspended bool
	hSuspended    *comHandler
	memoryLow     bool

	netOnline     = true
	netPending    int
	trayBadgeIcon uintptr
	trayBadgeFor  = -1
)

func webViewIface(iid *guid) uintptr {
	v := webViewPtr()
	if v == 0 {
		return 0
	}
	return comQuery(v, iid)
}

func setMemoryTarget(low bool) {
	defer recoverOptional("memory target")
	if low == memoryLow {
		return
	}
	wv := webViewIface(&iidCoreWebView2_19)
	if wv == 0 {
		return // older WebView2 runtime: Windows still trims a hidden WebView
	}
	defer releaseCOM(wv)
	level := uintptr(memoryTargetNorm)
	if low {
		level = memoryTargetLow
	}
	if hrOK(vcall(wv, wv19SetMemTarget, level)) {
		memoryLow = low
	}
}

// onWindowHiddenForMemory runs when the window goes to the notification area.
func onWindowHiddenForMemory() {
	if !settings.SaveMemory {
		return
	}
	setMemoryTarget(true)
	debug.FreeOSMemory()
	if p, _, _ := procGetCurrentProcess.Call(); p != 0 {
		procSetProcessWorkingSetSize.Call(p, ^uintptr(0), ^uintptr(0)) // trim the working set
	}
	if canSuspendPage(settings.SaveMemory, settings.Notifications, isPackaged(), wnsChannel != 0) {
		procSetTimer.Call(mainHwnd, suspendTimerID, suspendDelayMs, 0)
	}
}

func onWindowShownForMemory() {
	procKillTimer.Call(mainHwnd, suspendTimerID)
	setMemoryTarget(false)
	resumePage()
}

func onSuspendTimer() {
	procKillTimer.Call(mainHwnd, suspendTimerID)
	if isWindowShown() || pageSuspended || helloOp != 0 {
		return
	}
	if !canSuspendPage(settings.SaveMemory, settings.Notifications, isPackaged(), wnsChannel != 0) {
		return
	}
	defer recoverOptional("pause page")
	wv := webViewIface(&iidCoreWebView2_3)
	if wv == 0 {
		return
	}
	defer releaseCOM(wv)
	if hSuspended == nil {
		hSuspended = newHandler(func(this, hr, ok uintptr) uintptr {
			if hrOK(hr) && ok != 0 {
				pageSuspended = true
				startupLog("page paused while in the notification area")
			}
			return 0
		})
	}
	vcall(wv, wv3TrySuspend, hSuspended.ptr())
}

func resumePage() {
	if !pageSuspended {
		return
	}
	defer recoverOptional("resume page")
	pageSuspended = false
	if wv := webViewIface(&iidCoreWebView2_3); wv != 0 {
		vcall(wv, wv3Resume)
		releaseCOM(wv)
	}
}

// ---- Notification-area icon with the unread count --------------------------------------

type iconInfoNative struct {
	FIcon    int32
	XHotspot uint32
	YHotspot uint32
	HbmMask  uintptr
	HbmColor uintptr
}

// iconPixels reads a 32-bit icon's straight-alpha pixels (top-down).
func iconPixels(icon uintptr, size int) []uint32 {
	var ii iconInfoNative
	if r, _, _ := procGetIconInfo.Call(icon, uintptr(unsafe.Pointer(&ii))); r == 0 {
		return nil
	}
	defer procDeleteObject.Call(ii.HbmMask)
	if ii.HbmColor == 0 {
		return nil
	}
	defer procDeleteObject.Call(ii.HbmColor)
	dc, _, _ := procCreateCompatibleDC.Call(0)
	if dc == 0 {
		return nil
	}
	defer procDeleteDC.Call(dc)
	type bmi struct {
		Header bitmapInfoHeader
		Colors [4]uint32
	}
	info := bmi{Header: bitmapInfoHeader{BiSize: uint32(unsafe.Sizeof(bitmapInfoHeader{})), BiWidth: int32(size), BiHeight: -int32(size), BiPlanes: 1, BiBitCount: 32}}
	pix := make([]uint32, size*size)
	if r, _, _ := procGetDIBits.Call(dc, ii.HbmColor, 0, uintptr(size), uintptr(unsafe.Pointer(&pix[0])), uintptr(unsafe.Pointer(&info)), 0); int(r) != size {
		return nil
	}
	hasAlpha := false
	for _, p := range pix {
		if p>>24 != 0 {
			hasAlpha = true
			break
		}
	}
	if !hasAlpha {
		return nil
	}
	return pix
}

// logoPixels is the fallback base image: the embedded 128 px logo, scaled.
func logoPixels(size int) []uint32 {
	img, err := png.Decode(bytes.NewReader(toastLogoPNG))
	if err != nil {
		return nil
	}
	b := img.Bounds()
	n := b.Dx()
	if b.Dy() != n {
		return nil
	}
	rgba := image.NewNRGBA(image.Rect(0, 0, n, n))
	draw.Draw(rgba, rgba.Bounds(), img, b.Min, draw.Src)
	src := make([]uint32, n*n)
	for i := 0; i < n*n; i++ {
		p := rgba.Pix[i*4 : i*4+4]
		src[i] = uint32(p[3])<<24 | uint32(p[0])<<16 | uint32(p[1])<<8 | uint32(p[2])
	}
	return scaleImage(src, n, size)
}

func iconFromPixels(pix []uint32, size int) uintptr {
	hdr := bitmapInfoHeader{BiSize: uint32(unsafe.Sizeof(bitmapInfoHeader{})), BiWidth: int32(size), BiHeight: -int32(size), BiPlanes: 1, BiBitCount: 32}
	var bits uintptr
	color, _, _ := procCreateDIBSection.Call(0, uintptr(unsafe.Pointer(&hdr)), 0, uintptr(unsafe.Pointer(&bits)), 0, 0)
	if color == 0 || bits == 0 {
		return 0
	}
	defer procDeleteObject.Call(color)
	copy(unsafe.Slice((*uint32)(unsafe.Pointer(bits)), len(pix)), pix)
	maskBits := make([]byte, ((size+15)/16)*2*size) // all zero: alpha decides
	mask, _, _ := procCreateBitmap.Call(uintptr(size), uintptr(size), 1, 1, uintptr(unsafe.Pointer(&maskBits[0])))
	if mask == 0 {
		return 0
	}
	defer procDeleteObject.Call(mask)
	ii := iconInfo{FIcon: 1, HbmMask: mask, HbmColor: color}
	h, _, _ := procCreateIconIndirect.Call(uintptr(unsafe.Pointer(&ii)))
	return h
}

// refreshTrayIcon shows the unread count on the notification-area icon when
// that option is on.
func refreshTrayIcon() {
	defer recoverOptional("tray badge")
	if !trayAdded {
		return
	}
	want := settings.TrayBadge && unreadCount > 0 && !safeStart
	shown := unreadCount
	if shown > 10 {
		shown = 10 // "9+"
	}
	icon := trayIcon
	if want {
		if trayBadgeIcon == 0 || trayBadgeFor != shown {
			size := systemIconSize(SM_CXSMICON, 16)
			base := iconPixels(trayIcon, size)
			if base == nil {
				base = logoPixels(size)
			}
			if base == nil {
				return
			}
			h := iconFromPixels(trayBadgeImage(base, size, unreadCount), size)
			if h == 0 {
				return
			}
			if trayBadgeIcon != 0 {
				procDestroyIcon.Call(trayBadgeIcon)
			}
			trayBadgeIcon, trayBadgeFor = h, shown
		}
		icon = trayBadgeIcon
	}
	d := trayData()
	d.UFlags = NIF_ICON
	d.HIcon = icon
	procShellNotifyIconW.Call(NIM_MODIFY, uintptr(unsafe.Pointer(&d)))
}

func refreshTrayTooltip() {
	if !trayAdded {
		return
	}
	d := trayData()
	d.UFlags = NIF_TIP | NIF_SHOWTIP
	copyWide(d.SzTip[:], trayTooltipFull(unreadCount, netOnline, netPending, appLocked))
	procShellNotifyIconW.Call(NIM_MODIFY, uintptr(unsafe.Pointer(&d)))
}
