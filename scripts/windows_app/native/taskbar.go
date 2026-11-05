//go:build windows

package main

import (
	"os"
	"path/filepath"
	"unsafe"
)

// Taskbar integration: unread-count overlay badge (ITaskbarList3) and the
// Jump List tasks (ICustomDestinationList).

var (
	clsidTaskbarList                = guid{0x56FDF344, 0xFD6D, 0x11d0, [8]byte{0x95, 0x8A, 0x00, 0x60, 0x97, 0xC9, 0xA0, 0x90}}
	iidTaskbarList3                 = guid{0xEA1AFB91, 0x9E28, 0x4B86, [8]byte{0x90, 0xE9, 0x9E, 0x9F, 0x8A, 0x5E, 0xEF, 0xAF}}
	clsidDestinationList            = guid{0x77F10CF0, 0x3DB5, 0x4966, [8]byte{0xB5, 0x20, 0xB7, 0xC5, 0x4F, 0xD3, 0x5E, 0xD6}}
	iidCustomDestinationList        = guid{0x6332DEBF, 0x87B5, 0x4670, [8]byte{0x90, 0xC0, 0x5E, 0x57, 0xB4, 0x08, 0xA4, 0x9E}}
	clsidEnumerableObjectCollection = guid{0x2D3468C1, 0x36A7, 0x43B6, [8]byte{0xAC, 0x24, 0xD3, 0xF0, 0x2F, 0xD9, 0x60, 0x7A}}
	iidObjectCollection             = guid{0x5632B1A4, 0xE38A, 0x400A, [8]byte{0x92, 0x8A, 0xD4, 0xCD, 0x63, 0x23, 0x02, 0x95}}
	iidObjectArray                  = guid{0x92CA9DCD, 0x5622, 0x4BBA, [8]byte{0xA8, 0x05, 0x5E, 0x9F, 0x54, 0x1B, 0xD8, 0xC9}}
	clsidShellLinkNative            = guid{0x00021401, 0x0000, 0x0000, [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidShellLinkW                   = guid{0x000214F9, 0x0000, 0x0000, [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	pkeyTitleFmt                    = guid{0xF29F85E0, 0x4FF9, 0x1068, [8]byte{0xAB, 0x91, 0x08, 0x00, 0x2B, 0x27, 0xB3, 0xD9}}
)

const (
	CLSCTX_INPROC_SERVER = 0x1

	tbHrInit         = 3
	tbSetOverlayIcon = 18

	cdlSetAppID       = 3
	cdlBeginList      = 4
	cdlAddUserTasks   = 7
	cdlCommitList     = 8
	cdlDeleteList     = 10
	cdlAbortList      = 11
	ocAddObject       = 5
	slSetArguments    = 11
	slSetDescription  = 7
	slSetIconLocation = 17
	slSetPath         = 20
)

var (
	taskbarList      uintptr
	taskbarReady     bool
	overlayIcon      uintptr
	overlayIconCount = -1
)

func initTaskbarList() {
	defer recoverOptional("taskbar badge")
	if taskbarList != 0 {
		return
	}
	var p uintptr
	r, _, _ := procCoCreateInstanceNative.Call(uintptr(unsafe.Pointer(&clsidTaskbarList)), 0, CLSCTX_INPROC_SERVER, uintptr(unsafe.Pointer(&iidTaskbarList3)), uintptr(unsafe.Pointer(&p)))
	if !hrOK(r) || p == 0 {
		return
	}
	if !hrOK(vcall(p, tbHrInit)) {
		releaseCOM(p)
		return
	}
	taskbarList = p
}

// updateUnreadBadge is called with the live unread count from the page.
func updateUnreadBadge(n int) {
	if n < 0 {
		n = 0
	}
	if n > 100000 {
		n = 100000
	}
	unreadCount = n
	updateTrayTooltip()
	refreshOverlayBadge()
}

func refreshOverlayBadge() {
	defer recoverOptional("taskbar badge")
	if !taskbarReady || taskbarList == 0 || mainHwnd == 0 {
		return
	}
	text := badgeText(unreadCount)
	if text == "" {
		clearOverlayBadge()
		return
	}
	shown := unreadCount
	if shown > 10 {
		shown = 10 // all values above 9 render the same "9+" icon
	}
	if overlayIcon == 0 || overlayIconCount != shown {
		icon := createBadgeIcon(text)
		if icon == 0 {
			return
		}
		if overlayIcon != 0 {
			procDestroyIcon.Call(overlayIcon)
		}
		overlayIcon, overlayIconCount = icon, shown
	}
	desc := trayTooltip(unreadCount, false)
	vcall(taskbarList, tbSetOverlayIcon, mainHwnd, overlayIcon, uintptr(unsafe.Pointer(utf16Ptr(desc))))
}

func clearOverlayBadge() {
	if taskbarList != 0 && mainHwnd != 0 {
		vcall(taskbarList, tbSetOverlayIcon, mainHwnd, 0, 0)
	}
	if overlayIcon != 0 {
		procDestroyIcon.Call(overlayIcon)
		overlayIcon, overlayIconCount = 0, -1
	}
}

type bitmapInfoHeader struct {
	BiSize          uint32
	BiWidth         int32
	BiHeight        int32
	BiPlanes        uint16
	BiBitCount      uint16
	BiCompression   uint32
	BiSizeImage     uint32
	BiXPelsPerMeter int32
	BiYPelsPerMeter int32
	BiClrUsed       uint32
	BiClrImportant  uint32
}

type iconInfo struct {
	FIcon    int32
	XHotspot uint32
	YHotspot uint32
	HbmMask  uintptr
	HbmColor uintptr
}

func createBadgeIcon(text string) uintptr {
	size, _, _ := procGetSystemMetrics.Call(SM_CXSMICON)
	if size < 16 || size > 64 {
		size = 16
	}
	bm := renderBadge(int(size), text)
	hdr := bitmapInfoHeader{BiSize: uint32(unsafe.Sizeof(bitmapInfoHeader{})), BiWidth: int32(size), BiHeight: -int32(size), BiPlanes: 1, BiBitCount: 32}
	var bits uintptr
	color, _, _ := procCreateDIBSection.Call(0, uintptr(unsafe.Pointer(&hdr)), 0, uintptr(unsafe.Pointer(&bits)), 0, 0)
	if color == 0 || bits == 0 {
		return 0
	}
	defer procDeleteObject.Call(color)
	dst := unsafe.Slice((*uint32)(unsafe.Pointer(bits)), len(bm.Pix))
	copy(dst, bm.Pix) // 0xAARRGGBB == BGRA little-endian DIB layout
	mask, _, _ := procCreateBitmap.Call(size, size, 1, 1, 0)
	if mask == 0 {
		return 0
	}
	defer procDeleteObject.Call(mask)
	ii := iconInfo{FIcon: 1, HbmMask: mask, HbmColor: color}
	h, _, _ := procCreateIconIndirect.Call(uintptr(unsafe.Pointer(&ii)))
	return h
}

// ---- Jump List ------------------------------------------------------------------------

type jumpTask struct{ title, description, target string }

var jumpTasks = []jumpTask{
	{"New Expense", "Open Triplem VIP and add a new expense", "new-expense"},
	{"New Journal Entry", "Open a new balanced journal entry in Accounting", "new-journal"},
	{"Reports", "Open Accounting reports", "reports"},
	{"Inventory", "Open Inventory", "inventory"},
}

// jumpListTarget returns the program the Jump List tasks start. MSIX installs
// use the package's app execution alias so the task runs with package identity.
func jumpListTarget() string {
	if isPackaged() {
		if local := os.Getenv("LOCALAPPDATA"); local != "" {
			alias := filepath.Join(local, "Microsoft", "WindowsApps", "triplemvip.exe")
			if _, err := os.Stat(alias); err == nil {
				return alias
			}
		}
	}
	exe, _ := os.Executable()
	return exe
}

func newDestinationList() uintptr {
	var p uintptr
	r, _, _ := procCoCreateInstanceNative.Call(uintptr(unsafe.Pointer(&clsidDestinationList)), 0, CLSCTX_INPROC_SERVER, uintptr(unsafe.Pointer(&iidCustomDestinationList)), uintptr(unsafe.Pointer(&p)))
	if !hrOK(r) {
		return 0
	}
	if !isPackaged() {
		vcall(p, cdlSetAppID, uintptr(unsafe.Pointer(utf16Ptr(appUserModelID))))
	}
	return p
}

func buildJumpList() {
	defer recoverOptional("jump list")
	target := jumpListTarget()
	icon, _ := os.Executable()
	if target == "" {
		return
	}
	list := newDestinationList()
	if list == 0 {
		startupLog("jump list: destination list unavailable")
		return
	}
	defer releaseCOM(list)
	var minSlots uint32
	var removed uintptr
	if !hrOK(vcall(list, cdlBeginList, uintptr(unsafe.Pointer(&minSlots)), uintptr(unsafe.Pointer(&iidObjectArray)), uintptr(unsafe.Pointer(&removed)))) {
		startupLog("jump list: BeginList failed")
		return
	}
	releaseCOM(removed)
	var coll uintptr
	r, _, _ := procCoCreateInstanceNative.Call(uintptr(unsafe.Pointer(&clsidEnumerableObjectCollection)), 0, CLSCTX_INPROC_SERVER, uintptr(unsafe.Pointer(&iidObjectCollection)), uintptr(unsafe.Pointer(&coll)))
	if !hrOK(r) || coll == 0 {
		vcall(list, cdlAbortList)
		return
	}
	defer releaseCOM(coll)
	for _, t := range jumpTasks {
		link := newJumpLink(target, icon, t)
		if link == 0 {
			continue
		}
		vcall(coll, ocAddObject, link)
		releaseCOM(link)
	}
	arr := comQuery(coll, &iidObjectArray)
	if arr == 0 {
		vcall(list, cdlAbortList)
		return
	}
	defer releaseCOM(arr)
	if !hrOK(vcall(list, cdlAddUserTasks, arr)) || !hrOK(vcall(list, cdlCommitList)) {
		vcall(list, cdlAbortList)
		startupLog("jump list: commit failed")
		return
	}
	startupLog("jump list ready")
}

func newJumpLink(target, icon string, t jumpTask) uintptr {
	var link uintptr
	r, _, _ := procCoCreateInstanceNative.Call(uintptr(unsafe.Pointer(&clsidShellLinkNative)), 0, CLSCTX_INPROC_SERVER, uintptr(unsafe.Pointer(&iidShellLinkW)), uintptr(unsafe.Pointer(&link)))
	if !hrOK(r) || link == 0 {
		return 0
	}
	ok := hrOK(vcall(link, slSetPath, uintptr(unsafe.Pointer(utf16Ptr(target))))) &&
		hrOK(vcall(link, slSetArguments, uintptr(unsafe.Pointer(utf16Ptr("--open="+t.target))))) &&
		hrOK(vcall(link, slSetDescription, uintptr(unsafe.Pointer(utf16Ptr(t.description))))) &&
		hrOK(vcall(link, slSetIconLocation, uintptr(unsafe.Pointer(utf16Ptr(icon))), 0))
	if ok {
		ok = setLinkTitle(link, t.title)
	}
	if !ok {
		releaseCOM(link)
		return 0
	}
	return link
}

// setLinkTitle sets System.Title, which is what the Jump List displays.
func setLinkTitle(link uintptr, title string) bool {
	store := comQuery(link, &iidIPropertyStore)
	if store == 0 {
		return false
	}
	defer releaseCOM(store)
	var pv propVariant
	if !initPropVariantString(title, &pv) {
		return false
	}
	defer procPropVariantClear.Call(uintptr(unsafe.Pointer(&pv)))
	key := propertyKey{FmtID: pkeyTitleFmt, PID: 2}
	if !hrOK(vcall(store, 6, uintptr(unsafe.Pointer(&key)), uintptr(unsafe.Pointer(&pv)))) { // SetValue
		return false
	}
	return hrOK(vcall(store, 7)) // Commit
}

func deleteJumpList() {
	list := newDestinationList()
	if list == 0 {
		return
	}
	defer releaseCOM(list)
	if isPackaged() {
		vcall(list, cdlDeleteList, 0)
	} else {
		vcall(list, cdlDeleteList, uintptr(unsafe.Pointer(utf16Ptr(appUserModelID))))
	}
}
