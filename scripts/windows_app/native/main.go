//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

const (
	triplemURL     = "https://triplem.vip/"
	appUserModelID = "TriplemVIP.Desktop"

	CS_HREDRAW = 0x0002
	CS_VREDRAW = 0x0001

	WS_OVERLAPPED       = 0x00000000
	WS_CAPTION          = 0x00C00000
	WS_SYSMENU          = 0x00080000
	WS_THICKFRAME       = 0x00040000
	WS_MINIMIZEBOX      = 0x00020000
	WS_MAXIMIZEBOX      = 0x00010000
	WS_OVERLAPPEDWINDOW = WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX

	CW_USEDEFAULT    = 0x80000000
	SW_SHOWMAXIMIZED = 3
	SW_SHOW          = 5

	WM_DESTROY  = 0x0002
	WM_SIZE     = 0x0005
	WM_SETICON  = 0x0080
	WM_CLOSE    = 0x0010
	WM_ACTIVATE = 0x0006

	ICON_SMALL      = 0
	ICON_BIG        = 1
	IMAGE_ICON      = 1
	LR_LOADFROMFILE = 0x0010
	LR_DEFAULTSIZE  = 0x0040

	IDC_ARROW = 32512

	COINIT_APARTMENTTHREADED = 0x2

	MB_OK              = 0x00000000
	MB_ICONERROR       = 0x00000010
	MB_ICONINFORMATION = 0x00000040

	ERROR_SUCCESS                 syscall.Errno = 0
	LOAD_WITH_ALTERED_SEARCH_PATH               = 0x00000008
)

type comProc uintptr

//go:uintptrescapes
func (p comProc) Call(a ...uintptr) (r1, r2 uintptr, lastErr error) {
	return syscall.SyscallN(uintptr(p), a...)
}

type iUnknownVtbl struct {
	QueryInterface comProc
	AddRef         comProc
	Release        comProc
}

type guid struct {
	Data1 uint32
	Data2 uint16
	Data3 uint16
	Data4 [8]byte
}

type propertyKey struct {
	FmtID guid
	PID   uint32
}

type propVariant struct {
	VT        uint16
	Reserved1 uint16
	Reserved2 uint16
	Reserved3 uint16
	Value1    uintptr
	Value2    uintptr
}

type iPropertyStoreVtbl struct {
	iUnknownVtbl
	GetCount comProc
	GetAt    comProc
	GetValue comProc
	SetValue comProc
	Commit   comProc
}

type iPropertyStore struct{ vtbl *iPropertyStoreVtbl }

var iidIPropertyStore = guid{0x886D8EEB, 0x8CF2, 0x4446, [8]byte{0x8D, 0x02, 0xCD, 0xBA, 0x1D, 0xBD, 0xCF, 0x99}}
var appModelFmtID = guid{0x9F4C2855, 0x9F79, 0x4B39, [8]byte{0xA8, 0xD0, 0xE1, 0xD4, 0x2D, 0xE1, 0xD5, 0xF3}}

func setWindowProperty(store *iPropertyStore, pid uint32, value string) {
	if store == nil || value == "" {
		return
	}
	var pv propVariant
	if !initPropVariantString(value, &pv) {
		return
	}
	defer procPropVariantClear.Call(uintptr(unsafe.Pointer(&pv)))
	key := propertyKey{FmtID: appModelFmtID, PID: pid}
	store.vtbl.SetValue.Call(uintptr(unsafe.Pointer(store)), uintptr(unsafe.Pointer(&key)), uintptr(unsafe.Pointer(&pv)))
}

// isPackaged reports whether the app runs from its Microsoft Store (MSIX)
// package. Windows then owns the app's identity, Start entry, taskbar pinning
// and updates, so the classic-install identity code below must stay out of
// the way (an explicit relaunch command into WindowsApps would break pins).
func isPackaged() bool {
	proc := kernel32.NewProc("GetCurrentPackageFullName")
	if proc.Find() != nil {
		return false // Windows older than 8: never packaged
	}
	var n uint32
	r, _, _ := proc.Call(uintptr(unsafe.Pointer(&n)), 0)
	return r != 15700 // APPMODEL_ERROR_NO_PACKAGE
}

// setWindowIdentity gives the window the full set of taskbar relaunch
// properties (command, icon, display name and AppUserModelID). Windows reads
// them when the user pins the running app, so the pinned button keeps the
// Triplem VIP icon and starts the right program after the window is closed or
// hidden in the notification area. Without them a pin made from the running
// window could fall back to a blank "white page" icon. Store installs get all
// of this from their package and are left alone.
func setWindowIdentity(hwnd uintptr) {
	if isPackaged() {
		return
	}
	defer recoverOptional("window identity")
	if hwnd == 0 {
		return
	}
	var storePtr uintptr
	hr, _, _ := procSHGetPropertyStoreForWindow.Call(hwnd, uintptr(unsafe.Pointer(&iidIPropertyStore)), uintptr(unsafe.Pointer(&storePtr)))
	if int32(hr) < 0 || storePtr == 0 {
		return
	}
	store := (*iPropertyStore)(unsafe.Pointer(storePtr))
	defer store.vtbl.Release.Call(storePtr)
	exe, err := os.Executable()
	if err != nil {
		return
	}
	// Relaunch properties are deliberately set before AppUserModel.ID. Windows uses
	// them to preserve the app's own executable and icon when a taskbar pin is made.
	cmd, icon, name := relaunchProperties(exe)
	setWindowProperty(store, 2, cmd)  // System.AppUserModel.RelaunchCommand
	setWindowProperty(store, 3, icon) // System.AppUserModel.RelaunchIconResource
	setWindowProperty(store, 4, name) // System.AppUserModel.RelaunchDisplayNameResource
	setWindowProperty(store, 5, appUserModelID)
	store.vtbl.Commit.Call(storePtr)
}

// clearWindowIdentity removes the window properties again before the window
// is destroyed, as Windows asks for (the property store would otherwise keep
// the strings until the window handle is reused).
func clearWindowIdentity(hwnd uintptr) {
	defer recoverOptional("window identity")
	if isPackaged() || hwnd == 0 {
		return
	}
	var storePtr uintptr
	hr, _, _ := procSHGetPropertyStoreForWindow.Call(hwnd, uintptr(unsafe.Pointer(&iidIPropertyStore)), uintptr(unsafe.Pointer(&storePtr)))
	if int32(hr) < 0 || storePtr == 0 {
		return
	}
	store := (*iPropertyStore)(unsafe.Pointer(storePtr))
	defer store.vtbl.Release.Call(storePtr)
	var empty propVariant // VT_EMPTY
	for _, pid := range []uint32{2, 3, 4, 5} {
		key := propertyKey{FmtID: appModelFmtID, PID: pid}
		store.vtbl.SetValue.Call(storePtr, uintptr(unsafe.Pointer(&key)), uintptr(unsafe.Pointer(&empty)))
	}
	store.vtbl.Commit.Call(storePtr)
}

type iCoreWebView2EnvironmentVtbl struct {
	iUnknownVtbl
	CreateCoreWebView2Controller     comProc
	CreateWebResourceResponse        comProc
	GetBrowserVersionString          comProc
	AddNewBrowserVersionAvailable    comProc
	RemoveNewBrowserVersionAvailable comProc
}

type iCoreWebView2Environment struct {
	vtbl *iCoreWebView2EnvironmentVtbl
}

type iCoreWebView2ControllerVtbl struct {
	iUnknownVtbl
	GetIsVisible                      comProc
	PutIsVisible                      comProc
	GetBounds                         comProc
	PutBounds                         comProc
	GetZoomFactor                     comProc
	PutZoomFactor                     comProc
	AddZoomFactorChanged              comProc
	RemoveZoomFactorChanged           comProc
	SetBoundsAndZoomFactor            comProc
	MoveFocus                         comProc
	AddMoveFocusRequested             comProc
	RemoveMoveFocusRequested          comProc
	AddGotFocus                       comProc
	RemoveGotFocus                    comProc
	AddLostFocus                      comProc
	RemoveLostFocus                   comProc
	AddAcceleratorKeyPressed          comProc
	RemoveAcceleratorKeyPressed       comProc
	GetParentWindow                   comProc
	PutParentWindow                   comProc
	NotifyParentWindowPositionChanged comProc
	Close                             comProc
	GetCoreWebView2                   comProc
}

type iCoreWebView2Controller struct {
	vtbl *iCoreWebView2ControllerVtbl
}

type iCoreWebView2Vtbl struct {
	iUnknownVtbl
	GetSettings      comProc
	GetSource        comProc
	Navigate         comProc
	NavigateToString comProc
}

type iCoreWebView2 struct {
	vtbl *iCoreWebView2Vtbl
}

type envHandlerVtbl struct {
	iUnknownVtbl
	Invoke comProc
}

type envHandler struct{ vtbl *envHandlerVtbl }

type controllerHandlerVtbl struct {
	iUnknownVtbl
	Invoke comProc
}

type controllerHandler struct{ vtbl *controllerHandlerVtbl }

type rect struct{ Left, Top, Right, Bottom int32 }
type point struct{ X, Y int32 }
type msg struct {
	Hwnd     syscall.Handle
	Message  uint32
	WParam   uintptr
	LParam   uintptr
	Time     uint32
	Pt       point
	LPrivate uint32
}

type wndClassExW struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     syscall.Handle
	HIcon         syscall.Handle
	HCursor       syscall.Handle
	HbrBackground syscall.Handle
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       syscall.Handle
}

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	ole32    = syscall.NewLazyDLL("ole32.dll")
	shell32  = syscall.NewLazyDLL("shell32.dll")
	propsys  = syscall.NewLazyDLL("propsys.dll")

	procRegisterClassExW = user32.NewProc("RegisterClassExW")
	procCreateWindowExW  = user32.NewProc("CreateWindowExW")
	procDefWindowProcW   = user32.NewProc("DefWindowProcW")
	procShowWindow       = user32.NewProc("ShowWindow")
	procUpdateWindow     = user32.NewProc("UpdateWindow")
	procDestroyWindow    = user32.NewProc("DestroyWindow")
	procPostQuitMessage  = user32.NewProc("PostQuitMessage")
	procGetMessageW      = user32.NewProc("GetMessageW")
	procTranslateMessage = user32.NewProc("TranslateMessage")
	procDispatchMessageW = user32.NewProc("DispatchMessageW")
	procGetClientRect    = user32.NewProc("GetClientRect")
	procLoadImageW       = user32.NewProc("LoadImageW")
	procLoadCursorW      = user32.NewProc("LoadCursorW")
	procSendMessageW     = user32.NewProc("SendMessageW")
	procMessageBoxW      = user32.NewProc("MessageBoxW")
	procSetFocus         = user32.NewProc("SetFocus")

	procGetModuleHandleW                        = kernel32.NewProc("GetModuleHandleW")
	procLoadLibraryExW                          = kernel32.NewProc("LoadLibraryExW")
	procGetProcAddress                          = kernel32.NewProc("GetProcAddress")
	procCoInitializeEx                          = ole32.NewProc("CoInitializeEx")
	procCoUninitialize                          = ole32.NewProc("CoUninitialize")
	procSetCurrentProcessExplicitAppUserModelID = shell32.NewProc("SetCurrentProcessExplicitAppUserModelID")
	procShellExecuteW                           = shell32.NewProc("ShellExecuteW")
	procSHGetPropertyStoreForWindow             = shell32.NewProc("SHGetPropertyStoreForWindow")
	procPropVariantClear                        = ole32.NewProc("PropVariantClear")

	mainHwnd         uintptr
	webController    *iCoreWebView2Controller
	webView          *iCoreWebView2
	webEnvironment   *iCoreWebView2Environment
	initialized      uint32
	webRuntimeModule uintptr

	envHandlerObject        envHandler
	controllerHandlerObject controllerHandler
	envHandlerVTable        envHandlerVtbl
	controllerHandlerVTable controllerHandlerVtbl
)

// utf16Ptr returns a NUL-terminated UTF-16 copy of s; never nil.
func utf16Ptr(s string) *uint16 {
	return &utf16NoNUL(s)[0]
}

func messageBox(title, text string, flags uintptr) {
	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(utf16Ptr(text))), uintptr(unsafe.Pointer(utf16Ptr(title))), flags)
}

func openURL(url string) {
	procShellExecuteW.Call(0, uintptr(unsafe.Pointer(utf16Ptr("open"))), uintptr(unsafe.Pointer(utf16Ptr(url))), 0, 0, SW_SHOW)
}

func setAppUserModelID() {
	if isPackaged() {
		return
	}
	p := utf16Ptr(appUserModelID)
	procSetCurrentProcessExplicitAppUserModelID.Call(uintptr(unsafe.Pointer(p)))
}

func queryInterface(this, _, object uintptr) uintptr {
	if object != 0 {
		*(*uintptr)(unsafe.Pointer(object)) = this
	}
	return 0
}
func addRef(uintptr) uintptr  { return 1 }
func release(uintptr) uintptr { return 1 }

func environmentCreated(_ uintptr, result uintptr, envPtr uintptr) uintptr {
	startupLog(fmt.Sprintf("WebView2 environment callback: 0x%08X", uint32(result)))
	if int32(result) < 0 || envPtr == 0 {
		messageBox("Triplem VIP", fmt.Sprintf("The Windows WebView2 environment could not be created.\n\nError: 0x%08X", uint32(result)), MB_OK|MB_ICONERROR)
		return result
	}
	env := (*iCoreWebView2Environment)(unsafe.Pointer(envPtr))
	webEnvironment = env
	env.vtbl.AddRef.Call(envPtr)
	r, _, _ := env.vtbl.CreateCoreWebView2Controller.Call(
		envPtr,
		mainHwnd,
		uintptr(unsafe.Pointer(&controllerHandlerObject)),
	)
	return r
}

func controllerCreated(_ uintptr, result uintptr, controllerPtr uintptr) uintptr {
	startupLog(fmt.Sprintf("WebView2 controller callback: 0x%08X", uint32(result)))
	if int32(result) < 0 || controllerPtr == 0 {
		messageBox("Triplem VIP", fmt.Sprintf("The Triplem VIP window could not initialize WebView2.\n\nError: 0x%08X", uint32(result)), MB_OK|MB_ICONERROR)
		return result
	}
	controller := (*iCoreWebView2Controller)(unsafe.Pointer(controllerPtr))
	webController = controller
	controller.vtbl.AddRef.Call(controllerPtr)

	var viewPtr uintptr
	r, _, _ := controller.vtbl.GetCoreWebView2.Call(controllerPtr, uintptr(unsafe.Pointer(&viewPtr)))
	if r != 0 || viewPtr == 0 {
		messageBox("Triplem VIP", "WebView2 loaded, but the web surface could not be created.", MB_OK|MB_ICONERROR)
		return r
	}
	webView = (*iCoreWebView2)(unsafe.Pointer(viewPtr))
	webView.vtbl.AddRef.Call(viewPtr)

	resizeWebView()
	controller.vtbl.PutIsVisible.Call(controllerPtr, 1)
	if !isWindowShown() {
		setWebVisible(false) // started hidden in the tray (Start with Windows)
	}
	configureWebView(viewPtr)

	url := utf16Ptr(triplemURL)
	webView.vtbl.Navigate.Call(viewPtr, uintptr(unsafe.Pointer(url)))
	atomic.StoreUint32(&initialized, 1)
	startupLog("Triplem VIP web surface initialized")
	return 0
}

func initCallbacks() {
	envHandlerVTable = envHandlerVtbl{
		iUnknownVtbl{comProc(syscall.NewCallback(queryInterface)), comProc(syscall.NewCallback(addRef)), comProc(syscall.NewCallback(release))},
		comProc(syscall.NewCallback(environmentCreated)),
	}
	controllerHandlerVTable = controllerHandlerVtbl{
		iUnknownVtbl{comProc(syscall.NewCallback(queryInterface)), comProc(syscall.NewCallback(addRef)), comProc(syscall.NewCallback(release))},
		comProc(syscall.NewCallback(controllerCreated)),
	}
	envHandlerObject.vtbl = &envHandlerVTable
	controllerHandlerObject.vtbl = &controllerHandlerVTable
}

func focusWebView() {
	if c := webController; c != nil {
		c.vtbl.MoveFocus.Call(uintptr(unsafe.Pointer(c)), 0) // COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC
		return
	}
	if mainHwnd != 0 {
		procSetFocus.Call(mainHwnd)
	}
}

func resizeWebView() {
	controller := webController
	if controller == nil || mainHwnd == 0 {
		return
	}
	var r rect
	ok, _, _ := procGetClientRect.Call(mainHwnd, uintptr(unsafe.Pointer(&r)))
	if ok == 0 {
		return
	}
	controller.vtbl.PutBounds.Call(uintptr(unsafe.Pointer(controller)), uintptr(unsafe.Pointer(&r)))
}

const SIZE_MINIMIZED = 1

var wmTaskbarButtonCreated uintptr

// wndProc runs every window message inside a guard: if one feature hits an
// unexpected error, it is written to the diagnostic log and the app keeps
// running instead of closing (3.6.2).
func wndProc(hwnd uintptr, message uint32, wParam, lParam uintptr) (result uintptr) {
	defer func() {
		if p := recover(); p != nil {
			logRecoveredPanic(fmt.Sprintf("window message 0x%04X", message), p)
			result, _, _ = procDefWindowProcW.Call(hwnd, uintptr(message), wParam, lParam)
		}
	}()
	return handleWindowMessage(hwnd, message, wParam, lParam)
}

func handleWindowMessage(hwnd uintptr, message uint32, wParam, lParam uintptr) uintptr {
	switch message {
	case WM_SIZE:
		resizeWebView()
		if wParam == SIZE_MINIMIZED {
			setWebVisible(false) // nothing to render while minimised
		} else if v, _, _ := procIsWindowVisible.Call(hwnd); v != 0 {
			setWebVisible(true)
		}
		return 0
	case WM_ACTIVATE:
		// Give keyboard focus back to the page (not just the frame window) when
		// the window is activated, e.g. after Alt+Tab or reopening it from the
		// notification area, so typing works without clicking first.
		if wParam&0xFFFF != WA_INACTIVE && atomic.LoadUint32(&initialized) != 0 && webController != nil {
			if ic, _, _ := procIsIconic.Call(hwnd); ic == 0 {
				focusWebView()
				return 0 // DefWindowProc would move the focus back to the frame
			}
		}
	case WM_SETFOCUS:
		if webController != nil && atomic.LoadUint32(&initialized) != 0 {
			focusWebView()
			return 0
		}
	case WM_MOVE:
		// Lets WebView2 place drop-down lists, menus and tooltips correctly
		// after the window was moved.
		if c := webController; c != nil {
			c.vtbl.NotifyParentWindowPositionChanged.Call(uintptr(unsafe.Pointer(c)))
		}
	case WM_DPICHANGED:
		// Per-monitor DPI: take the size Windows suggests for the new monitor's
		// scaling, otherwise the window keeps the wrong size after it is
		// dragged between monitors with different scaling.
		if r := (*rect)(unsafe.Pointer(lParam)); r != nil {
			procSetWindowPos.Call(hwnd, 0, uintptr(r.Left), uintptr(r.Top), uintptr(r.Right-r.Left), uintptr(r.Bottom-r.Top), SWP_NOZORDER|SWP_NOACTIVATE)
		}
		return 0
	case WM_TIMER:
		if wParam == pinStartTimerID {
			promptTaskbarPinRequest()
			return 0
		}
		if wParam == pinPollTimerID {
			pollTaskbarPinRequest()
			return 0
		}
		if wParam == backgroundTickTimerID {
			backgroundTick()
			return 0
		}
		if wParam == iconRepairTimerID {
			onIconRepairTimer()
			return 0
		}
		switch wParam {
		case updateTimerID:
			onUpdateTimer()
			return 0
		case crashCleanTimerID:
			onCleanRunTimer()
			return 0
		case wnsPollTimerID:
			pollPushChannel()
			return 0
		}
	case WM_HOTKEY:
		onHotkey(wParam)
		return 0
	case WM_EXITSIZEMOVE:
		saveWindowPlacement()
	case WM_COPYDATA:
		return handleCopyData(lParam)
	case wmAppTask:
		runUITasks()
		return 0
	case wmSaveAs:
		completeSaveAs(int(wParam))
		return 0
	case wmTrayCallback:
		handleTrayCallback(wParam, lParam)
		return 0
	case wmTriplemQuit:
		// Sent by Setup (update) and the uninstaller: exit completely.
		quitApplication()
		return 0
	case WM_QUERYENDSESSION:
		return 1
	case WM_ENDSESSION:
		if wParam != 0 {
			if isWindowShown() {
				saveWindowPlacement()
			}
			removeTrayIcon()
			markRunClean() // Windows sign-out / restart is not a crash
		}
		return 0
	case WM_CLOSE:
		if !quitting && settings.CloseToTray {
			hideToTray()
			return 0
		}
		quitApplication()
		return 0
	case WM_DESTROY:
		procKillTimer.Call(hwnd, backgroundTickTimerID)
		procKillTimer.Call(hwnd, updateTimerID)
		if hotkeyRegistered {
			procUnregisterHotKey.Call(hwnd, quickAddKeyID)
		}
		removeTrayIcon()
		clearOverlayBadge()
		clearWindowIdentity(hwnd)
		procPostQuitMessage.Call(0)
		return 0
	}
	if wmTaskbarCreated != 0 && uintptr(message) == wmTaskbarCreated {
		trayAdded = false // Explorer restarted: the icon must be added again
		addTrayIcon()
		return 0
	}
	if wmTaskbarButtonCreated != 0 && uintptr(message) == wmTaskbarButtonCreated {
		if safeStart {
			return 0 // safe start: no taskbar badge
		}
		initTaskbarList()
		taskbarReady = taskbarList != 0
		overlayIconCount = -1
		refreshOverlayBadge()
		return 0
	}
	r, _, _ := procDefWindowProcW.Call(hwnd, uintptr(message), wParam, lParam)
	return r
}

func loadAppIcon() uintptr {
	return loadAppIconSize(0)
}

// loadAppIconSize loads icon resource 1 (embedded at build time) at exactly
// size x size pixels, so Windows picks the matching image instead of scaling
// the 32 px one (sharp title bar, taskbar and notification-area icons).
// size 0 means the system's default large icon size.
func loadAppIconSize(size int) uintptr {
	hInstance, _, _ := procGetModuleHandleW.Call(0)
	flags := uintptr(0)
	if size <= 0 {
		size, flags = 0, LR_DEFAULTSIZE
	}
	if h, _, _ := procLoadImageW.Call(hInstance, 1, IMAGE_ICON, uintptr(size), uintptr(size), flags); h != 0 {
		return h
	}
	if size != 0 {
		return loadAppIconSize(0)
	}
	return 0
}

func systemIconSize(metric uintptr, fallback int) int {
	n, _, _ := procGetSystemMetrics.Call(metric)
	if int(n) < 16 || int(n) > 256 {
		return fallback
	}
	return int(n)
}

func createMainWindow() bool {
	hInstance, _, _ := procGetModuleHandleW.Call(0)
	className := utf16Ptr("TriplemVIP.NativeWindow")
	title := utf16Ptr("Triplem VIP")
	icon := loadAppIconSize(systemIconSize(SM_CXICON, 32))
	smallIcon := loadAppIconSize(systemIconSize(SM_CXSMICON, 16))
	if smallIcon == 0 {
		smallIcon = icon
	}
	cursor, _, _ := procLoadCursorW.Call(0, IDC_ARROW)

	wc := wndClassExW{
		CbSize:        uint32(unsafe.Sizeof(wndClassExW{})),
		Style:         CS_HREDRAW | CS_VREDRAW,
		LpfnWndProc:   syscall.NewCallback(wndProc),
		HInstance:     syscall.Handle(hInstance),
		HIcon:         syscall.Handle(icon),
		HCursor:       syscall.Handle(cursor),
		LpszClassName: className,
		HIconSm:       syscall.Handle(smallIcon),
	}
	atom, _, _ := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	if atom == 0 {
		return false
	}

	hwnd, _, _ := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(title)),
		WS_OVERLAPPEDWINDOW,
		CW_USEDEFAULT, CW_USEDEFAULT,
		1280, 820,
		0, 0, hInstance, 0,
	) // created hidden; shown below at its remembered size and position
	if hwnd == 0 {
		return false
	}
	mainHwnd = hwnd
	// Window identity uses the process-level AppUserModelID set before window creation.
	// Avoid property-store COM calls here so the native window can never fail silently before it is shown.
	if icon != 0 {
		procSendMessageW.Call(hwnd, WM_SETICON, ICON_BIG, icon)
		procSendMessageW.Call(hwnd, WM_SETICON, ICON_SMALL, smallIcon)
	}
	initialShowCmd = applyInitialPlacement(hwnd)
	if backgroundLaunched {
		// Start with Windows: run in the notification area without a window.
		return true
	}
	procShowWindow.Call(hwnd, uintptr(initialShowCmd))
	windowEverShown = true
	procUpdateWindow.Call(hwnd)
	// Taskbar pin requests are scheduled from the visible foreground native window.
	// They no longer depend on the web surface finishing initialization first.
	scheduleTaskbarPinIfRequested()
	return true
}

var initialShowCmd uintptr = SW_SHOWMAXIMIZED

type versionDir struct {
	path  string
	parts [4]int
}

func parseVersion(s string) [4]int {
	var out [4]int
	fields := strings.Split(s, ".")
	for i := 0; i < len(fields) && i < 4; i++ {
		n, _ := strconv.Atoi(fields[i])
		out[i] = n
	}
	return out
}

func compareVersion(a, b [4]int) bool {
	for i := 0; i < 4; i++ {
		if a[i] != b[i] {
			return a[i] > b[i]
		}
	}
	return false
}

func findRuntimeDLL() string {
	bases := []string{}
	if p := os.Getenv("PROGRAMFILES(X86)"); p != "" {
		bases = append(bases, filepath.Join(p, "Microsoft", "EdgeWebView", "Application"))
	}
	if p := os.Getenv("PROGRAMFILES"); p != "" {
		bases = append(bases, filepath.Join(p, "Microsoft", "EdgeWebView", "Application"))
	}
	if p := os.Getenv("LOCALAPPDATA"); p != "" {
		bases = append(bases, filepath.Join(p, "Microsoft", "EdgeWebView", "Application"))
	}

	var candidates []versionDir
	for _, base := range bases {
		entries, err := os.ReadDir(base)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			dll := filepath.Join(base, entry.Name(), "EBWebView", runtimeArchFolder(runtime.GOARCH), "EmbeddedBrowserWebView.dll")
			if st, err := os.Stat(dll); err == nil && !st.IsDir() {
				candidates = append(candidates, versionDir{path: dll, parts: parseVersion(entry.Name())})
			}
		}
	}
	if len(candidates) == 0 {
		return ""
	}
	sort.Slice(candidates, func(i, j int) bool { return compareVersion(candidates[i].parts, candidates[j].parts) })
	return candidates[0].path
}

func startupLog(line string) {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "Triplem VIP")
	_ = os.MkdirAll(dir, 0700)
	f, err := os.OpenFile(filepath.Join(dir, "TriplemVIP.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s %s\r\n", time.Now().Format(time.RFC3339), line)
}

func startWebView2() bool {
	startupLog("WebView2 bootstrap started")
	dllPath := findRuntimeDLL()
	if dllPath == "" {
		messageBox("Triplem VIP", "Microsoft Edge WebView2 Runtime is required to run Triplem VIP for Windows.\n\nInstall the WebView2 Runtime from Microsoft, then open Triplem VIP again.", MB_OK|MB_ICONINFORMATION)
		openURL("https://developer.microsoft.com/microsoft-edge/webview2/consumer/")
		return false
	}

	// Load the runtime COM server from its own folder so sibling runtime DLLs resolve
	// exactly as Microsoft expects. This avoids depending on the process working directory.
	h, _, loadErr := procLoadLibraryExW.Call(uintptr(unsafe.Pointer(utf16Ptr(dllPath))), 0, LOAD_WITH_ALTERED_SEARCH_PATH)
	if h == 0 {
		startupLog(fmt.Sprintf("WebView2 runtime load failed: %v", loadErr))
		messageBox("Triplem VIP", "The installed Microsoft WebView2 Runtime could not be loaded.\n\nA diagnostic log was written to %LOCALAPPDATA%\\Triplem VIP\\TriplemVIP.log", MB_OK|MB_ICONERROR)
		return false
	}
	webRuntimeModule = h // keep the runtime loaded for the complete application lifetime
	procName := append([]byte("CreateWebViewEnvironmentWithOptionsInternal"), 0)
	procAddr, _, procErr := procGetProcAddress.Call(h, uintptr(unsafe.Pointer(&procName[0])))
	if procAddr == 0 {
		startupLog(fmt.Sprintf("WebView2 runtime entrypoint missing: %v", procErr))
		messageBox("Triplem VIP", "The installed Microsoft WebView2 Runtime is incompatible with this Triplem VIP build.", MB_OK|MB_ICONERROR)
		return false
	}

	dataDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "Triplem VIP", "WebView2")
	_ = os.MkdirAll(dataDir, 0755)
	dataPtr := utf16Ptr(dataDir)

	// runtimeType 0 = installed Evergreen WebView2 Runtime.
	r, _, _ := syscall.SyscallN(
		procAddr,
		1, // checkRunningInstance
		0, // installed Evergreen Runtime
		uintptr(unsafe.Pointer(dataPtr)),
		0,
		uintptr(unsafe.Pointer(&envHandlerObject)),
	)
	if int32(r) < 0 {
		startupLog(fmt.Sprintf("WebView2 environment start failed: 0x%08X", uint32(r)))
		messageBox("Triplem VIP", fmt.Sprintf("WebView2 could not start.\n\nError: 0x%08X\n\nA diagnostic log was written to %%LOCALAPPDATA%%\\Triplem VIP\\TriplemVIP.log", uint32(r)), MB_OK|MB_ICONERROR)
		return false
	}
	startupLog("WebView2 environment request accepted")
	return true
}

func messageLoop() {
	var m msg
	for {
		r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}
}

// Microsoft-supported taskbar pin request. The installer never edits the taskbar
// directly. It writes a one-time request marker; the foreground application then
// asks Windows.UI.Shell.TaskbarManager to display the system confirmation dialog.
const (
	WM_TIMER        = 0x0113
	pinStartTimerID = 0x54564950
	pinPollTimerID  = 0x54564951
)

type iInspectableVtbl struct {
	QueryInterface, AddRef, Release, GetIids, GetRuntimeClassName, GetTrustLevel comProc
}
type iTaskbarManagerStaticsVtbl struct {
	iInspectableVtbl
	GetDefault comProc
}
type iTaskbarManagerStatics struct{ vtbl *iTaskbarManagerStaticsVtbl }
type iTaskbarManagerVtbl struct {
	iInspectableVtbl
	GetIsSupported, GetIsPinningAllowed, IsCurrentAppPinnedAsync, IsAppListEntryPinnedAsync, RequestPinCurrentAppAsync, RequestPinAppListEntryAsync comProc
}
type iTaskbarManager struct{ vtbl *iTaskbarManagerVtbl }
type iAsyncInfoVtbl struct {
	iInspectableVtbl
	GetID, GetStatus, GetErrorCode, Cancel, Close comProc
}
type iAsyncInfo struct{ vtbl *iAsyncInfoVtbl }
type iAsyncOperationBoolVtbl struct {
	iInspectableVtbl
	PutCompleted, GetCompleted, GetResults comProc
}
type iAsyncOperationBool struct{ vtbl *iAsyncOperationBoolVtbl }

var (
	combase                    = syscall.NewLazyDLL("combase.dll")
	procRoInitialize           = combase.NewProc("RoInitialize")
	procRoUninitialize         = combase.NewProc("RoUninitialize")
	procRoGetActivationFactory = combase.NewProc("RoGetActivationFactory")
	procWindowsCreateString    = combase.NewProc("WindowsCreateString")
	procWindowsDeleteString    = combase.NewProc("WindowsDeleteString")
	procSetTimer               = user32.NewProc("SetTimer")
	procKillTimer              = user32.NewProc("KillTimer")
	procSetForegroundWindow    = user32.NewProc("SetForegroundWindow")
	pinOperation               uintptr
	pinRoInitialized           bool
)

var iidTaskbarManagerStatics = guid{0xDB32AB74, 0xDE52, 0x4FE6, [8]byte{0xB7, 0xB6, 0x95, 0xFF, 0x9F, 0x83, 0x95, 0xDF}}
var iidAsyncInfo = guid{0x00000036, 0x0000, 0x0000, [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}

func pinRequestFile() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		return ""
	}
	return filepath.Join(base, "Triplem VIP", "request-taskbar-pin")
}
func clearPinRequest() {
	if p := pinRequestFile(); p != "" {
		_ = os.Remove(p)
	}
}
func scheduleTaskbarPinIfRequested() {
	p := pinRequestFile()
	if p == "" {
		return
	}
	if _, err := os.Stat(p); err != nil {
		return
	}
	procSetTimer.Call(mainHwnd, pinStartTimerID, 1400, 0)
}
func releaseCOM(ptr uintptr) {
	if ptr == 0 {
		return
	}
	v := *(**iUnknownVtbl)(unsafe.Pointer(ptr))
	if v != nil {
		v.Release.Call(ptr)
	}
}
func promptTaskbarPinRequest() {
	procKillTimer.Call(mainHwnd, pinStartTimerID)
	procSetForegroundWindow.Call(mainHwnd)
	if isPackaged() {
		return // Store installs are pinned by the user from Start; no Setup request applies
	}
	// Setup 3.4+ records an explicit "Pin on Taskbar" choice made by the user on
	// its final page. Go straight to Windows' own confirmation dialog instead of
	// asking the same question twice.
	if p := pinRequestFile(); p != "" {
		if b, err := os.ReadFile(p); err == nil && strings.HasPrefix(strings.TrimSpace(string(b)), "confirmed-by-setup-v2") {
			beginTaskbarPinRequest()
			return
		}
	}
	if messageBoxReturn("Pin Triplem VIP", "You selected taskbar pinning during Setup.\n\nWould you like Windows to pin Triplem VIP to the taskbar now?", MB_YESNO|MB_ICONQUESTION) != IDYES {
		clearPinRequest()
		return
	}
	beginTaskbarPinRequest()
}

func beginTaskbarPinRequest() {
	procKillTimer.Call(mainHwnd, pinStartTimerID)
	procSetForegroundWindow.Call(mainHwnd)

	// Initialize WinRT in the same STA as the native UI. S_FALSE is success too.
	// Keep WinRT initialized until the asynchronous pin operation completes.
	hr, _, _ := procRoInitialize.Call(0)
	if int32(hr) < 0 {
		clearPinRequest()
		messageBox("Triplem VIP", "Windows could not open the taskbar pin confirmation. You can still right-click the Triplem VIP taskbar icon and choose Pin to taskbar.", MB_OK|MB_ICONINFORMATION)
		return
	}
	pinRoInitialized = true
	finishPinRuntime := func() {
		if pinRoInitialized {
			procRoUninitialize.Call()
			pinRoInitialized = false
		}
	}

	className := "Windows.UI.Shell.TaskbarManager"
	classUTF16, _ := syscall.UTF16FromString(className)
	var hs uintptr
	r, _, _ := procWindowsCreateString.Call(uintptr(unsafe.Pointer(&classUTF16[0])), uintptr(len(className)), uintptr(unsafe.Pointer(&hs)))
	if int32(r) < 0 || hs == 0 {
		finishPinRuntime()
		clearPinRequest()
		return
	}
	defer procWindowsDeleteString.Call(hs)

	var staticsPtr uintptr
	r, _, _ = procRoGetActivationFactory.Call(hs, uintptr(unsafe.Pointer(&iidTaskbarManagerStatics)), uintptr(unsafe.Pointer(&staticsPtr)))
	if int32(r) < 0 || staticsPtr == 0 {
		finishPinRuntime()
		clearPinRequest()
		messageBox("Triplem VIP", "This Windows version does not expose the supported taskbar pin request API. Right-click the running Triplem VIP taskbar icon and choose Pin to taskbar.", MB_OK|MB_ICONINFORMATION)
		return
	}
	statics := (*iTaskbarManagerStatics)(unsafe.Pointer(staticsPtr))
	defer releaseCOM(staticsPtr)

	var managerPtr uintptr
	r, _, _ = statics.vtbl.GetDefault.Call(staticsPtr, uintptr(unsafe.Pointer(&managerPtr)))
	if int32(r) < 0 || managerPtr == 0 {
		finishPinRuntime()
		clearPinRequest()
		return
	}
	manager := (*iTaskbarManager)(unsafe.Pointer(managerPtr))
	defer releaseCOM(managerPtr)

	var supported uint8
	r, _, _ = manager.vtbl.GetIsSupported.Call(managerPtr, uintptr(unsafe.Pointer(&supported)))
	if int32(r) < 0 || supported == 0 {
		finishPinRuntime()
		clearPinRequest()
		messageBox("Triplem VIP", "Taskbar pinning is not supported on this Windows configuration. You can pin Triplem VIP manually from its running taskbar icon.", MB_OK|MB_ICONINFORMATION)
		return
	}
	var allowed uint8
	r, _, _ = manager.vtbl.GetIsPinningAllowed.Call(managerPtr, uintptr(unsafe.Pointer(&allowed)))
	if int32(r) < 0 || allowed == 0 {
		finishPinRuntime()
		clearPinRequest()
		messageBox("Triplem VIP", "Windows did not allow an automatic pin request. You can right-click the Triplem VIP taskbar icon and choose Pin to taskbar.", MB_OK|MB_ICONINFORMATION)
		return
	}

	var op uintptr
	r, _, _ = manager.vtbl.RequestPinCurrentAppAsync.Call(managerPtr, uintptr(unsafe.Pointer(&op)))
	if int32(r) < 0 || op == 0 {
		finishPinRuntime()
		clearPinRequest()
		messageBox("Triplem VIP", "Windows could not start the taskbar pin confirmation. You can pin Triplem VIP manually from the taskbar.", MB_OK|MB_ICONINFORMATION)
		return
	}
	pinOperation = op // owns the returned reference until polling completes
	procSetTimer.Call(mainHwnd, pinPollTimerID, 180, 0)
}

func pollTaskbarPinRequest() {
	if pinOperation == 0 {
		procKillTimer.Call(mainHwnd, pinPollTimerID)
		return
	}
	op := pinOperation
	base := *(**iUnknownVtbl)(unsafe.Pointer(op))
	if base == nil {
		return
	}
	var infoPtr uintptr
	hr, _, _ := base.QueryInterface.Call(op, uintptr(unsafe.Pointer(&iidAsyncInfo)), uintptr(unsafe.Pointer(&infoPtr)))
	if int32(hr) < 0 || infoPtr == 0 {
		return
	}
	info := (*iAsyncInfo)(unsafe.Pointer(infoPtr))
	var status int32
	hr, _, _ = info.vtbl.GetStatus.Call(infoPtr, uintptr(unsafe.Pointer(&status)))
	releaseCOM(infoPtr)
	if int32(hr) < 0 || status == 0 {
		return
	}

	procKillTimer.Call(mainHwnd, pinPollTimerID)
	clearPinRequest()
	if status == 1 { // Completed
		async := (*iAsyncOperationBool)(unsafe.Pointer(op))
		var result uint8
		hr, _, _ = async.vtbl.GetResults.Call(op, uintptr(unsafe.Pointer(&result)))
		if int32(hr) >= 0 && result != 0 {
			// Windows confirmed the pin. No extra dialog is needed.
		} else {
			messageBox("Triplem VIP", "Triplem VIP was not pinned. You can right-click its taskbar icon and choose Pin to taskbar at any time.", MB_OK|MB_ICONINFORMATION)
		}
	} else {
		messageBox("Triplem VIP", "The Windows taskbar pin request was cancelled or unavailable. You can pin Triplem VIP manually from its taskbar icon.", MB_OK|MB_ICONINFORMATION)
	}
	releaseCOM(op)
	pinOperation = 0
	if pinRoInitialized {
		procRoUninitialize.Call()
		pinRoInitialized = false
	}
}

func runNativeApp(args launchArgs) {
	defer func() {
		if r := recover(); r != nil {
			logRecoveredPanic("application", r)
			what := "a startup error"
			if atomic.LoadUint32(&initialized) != 0 {
				what = "an unexpected error"
			}
			messageBox("Triplem VIP", "Triplem VIP encountered "+what+".\n\nA diagnostic log was written to %LOCALAPPDATA%\\Triplem VIP\\TriplemVIP.log", MB_OK|MB_ICONERROR)
		}
	}()
	startupLog("application process started")
	runtime.LockOSThread()
	setAppUserModelID()
	startupLog("AppUserModelID set")
	procCoInitializeEx.Call(0, COINIT_APARTMENTTHREADED)
	defer procCoUninitialize.Call()

	initCallbacks()
	loadSettings()
	beginRunState()
	wmTaskbarCreated, _, _ = procRegisterWindowMessageW.Call(uintptr(unsafe.Pointer(utf16Ptr("TaskbarCreated"))))
	wmTaskbarButtonCreated, _, _ = procRegisterWindowMessageW.Call(uintptr(unsafe.Pointer(utf16Ptr("TaskbarButtonCreated"))))
	backgroundLaunched = args.Background || launchedByStartupTask()
	if args.Open != "" {
		backgroundLaunched = false
		pendingOpen = args.Open
	}
	if args.Link.Target != "" {
		pendingOpen = ""
		pendingLink = authorizeLink(args.Link, processToken) // a new process: actions only open
	}
	justUpdated = args.Update
	if !createMainWindow() {
		startupLog("native window creation failed")
		messageBox("Triplem VIP", "The Triplem VIP Windows application window could not be created.", MB_OK|MB_ICONERROR)
		return
	}
	startupLog("native window created")
	// Taskbar relaunch identity (3.6.1). Deliberately applied only after the
	// window exists and is shown: a property-store problem can then never stop
	// the window from appearing. Windows reads these values when the user pins
	// the button, so the pin keeps the app icon after the window is closed.
	setWindowIdentity(mainHwnd)
	applyWindowBackdrop(mainHwnd)
	registerAppIdentity()
	initToasts()
	applyQuickAddHotkey()
	addTrayIcon()
	if !startWebView2() {
		removeTrayIcon()
		procDestroyWindow.Call(mainHwnd)
		return
	}
	startBackgroundTick()
	if !safeStart {
		buildJumpList()
		startPushChannel()
	}
	startUpdateSchedule()
	startCleanRunTimer()
	scheduleIconRepair()
	messageLoop()

	// Keep callback vtables and COM pointers alive until the native loop exits.
	runtime.KeepAlive(envHandlerObject)
	runtime.KeepAlive(controllerHandlerObject)
	runtime.KeepAlive(webEnvironment)
	runtime.KeepAlive(webController)
	runtime.KeepAlive(webView)
}

const (
	MB_YESNO                    = 0x00000004
	MB_ICONQUESTION             = 0x00000020
	IDYES                       = 6
	MOVEFILE_DELAY_UNTIL_REBOOT = 0x4
)

var (
	advapi32Native                 = syscall.NewLazyDLL("advapi32.dll")
	procRegDeleteTreeWNative       = advapi32Native.NewProc("RegDeleteTreeW")
	procSHGetKnownFolderPathNative = shell32.NewProc("SHGetKnownFolderPath")
	procCoTaskMemFreeNative        = ole32.NewProc("CoTaskMemFree")
	procMoveFileExWNative          = kernel32.NewProc("MoveFileExW")
)

var folderDesktopNative = guid{0xB4BFCC3A, 0xDB2C, 0x424C, [8]byte{0xB0, 0x29, 0x7F, 0xE9, 0x9A, 0x87, 0xC6, 0x41}}
var folderProgramsNative = guid{0xA77F5D77, 0x2E2B, 0x44C3, [8]byte{0xA6, 0xA2, 0xAB, 0xA6, 0x01, 0x05, 0x4A, 0x51}}

func knownFolderNative(id *guid) string {
	var ptr uintptr
	hr, _, _ := procSHGetKnownFolderPathNative.Call(uintptr(unsafe.Pointer(id)), 0, 0, uintptr(unsafe.Pointer(&ptr)))
	if int32(hr) < 0 || ptr == 0 {
		return ""
	}
	defer procCoTaskMemFreeNative.Call(ptr)
	arr := (*[32768]uint16)(unsafe.Pointer(ptr))
	n := 0
	for n < len(arr) && arr[n] != 0 {
		n++
	}
	return syscall.UTF16ToString(arr[:n])
}

func unregisterAppNative() {
	const hkcu = uintptr(0x80000001)
	key := `Software\Microsoft\Windows\CurrentVersion\Uninstall\TriplemVIP`
	procRegDeleteTreeWNative.Call(hkcu, uintptr(unsafe.Pointer(utf16Ptr(key))))
}

func messageBoxReturn(title, text string, flags uintptr) int {
	r, _, _ := procMessageBoxW.Call(0, uintptr(unsafe.Pointer(utf16Ptr(text))), uintptr(unsafe.Pointer(utf16Ptr(title))), flags)
	return int(r)
}

func runUninstall() {
	if messageBoxReturn("Triplem VIP Uninstall", "Remove the Triplem VIP Windows application from this computer?\n\nYour online Triplem VIP account and cloud data will not be deleted.", MB_YESNO|MB_ICONQUESTION) != IDYES {
		return
	}
	if desktop := knownFolderNative(&folderDesktopNative); desktop != "" {
		_ = os.Remove(filepath.Join(desktop, "Triplem VIP.lnk"))
	}
	if programs := knownFolderNative(&folderProgramsNative); programs != "" {
		_ = os.Remove(filepath.Join(programs, "Triplem VIP.lnk"))
	}
	closeRunningInstance()
	removeStartupRegistration()
	procCoInitializeEx.Call(0, COINIT_APARTMENTTHREADED)
	deleteJumpList()
	unregisterAppNative()
	removeAppIdentity()
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		_ = os.RemoveAll(filepath.Join(local, "Triplem VIP", "WebView2"))
		_ = os.RemoveAll(filepath.Join(local, "Triplem VIP", "Updates"))
		_ = os.Remove(filepath.Join(local, "Triplem VIP", "desktop-settings.json"))
		_ = os.Remove(filepath.Join(local, "Triplem VIP", "window.json"))
		_ = os.Remove(filepath.Join(local, "Triplem VIP", "toast-logo.png"))
		_ = os.Remove(filepath.Join(local, "Triplem VIP", "run-state.json"))
	}
	self, _ := os.Executable()
	dir := filepath.Dir(self)
	procMoveFileExWNative.Call(uintptr(unsafe.Pointer(utf16Ptr(self))), 0, MOVEFILE_DELAY_UNTIL_REBOOT)
	procMoveFileExWNative.Call(uintptr(unsafe.Pointer(utf16Ptr(dir))), 0, MOVEFILE_DELAY_UNTIL_REBOOT)
	messageBox("Triplem VIP", "Triplem VIP has been removed from Windows. Windows may finish deleting the final executable after restart. Your online account and cloud data were not changed.", MB_OK|MB_ICONINFORMATION)
}

func main() {
	args := parseLaunchArgs(os.Args[1:])
	if args.Uninstall {
		runUninstall()
		return
	}
	if !acquireSingleInstance() {
		// Triplem VIP is already running (possibly hidden in the tray): hand
		// over this launch (e.g. a Jump List task) and exit.
		if forwardToRunningInstance(args) {
			return
		}
		startupLog("running instance did not answer; starting normally")
	}
	runNativeApp(args)
}

// closeRunningInstance asks a running Triplem VIP (which may be hidden in the
// tray) to exit before its files are removed.
func closeRunningInstance() {
	for i := 0; i < 50; i++ {
		h := findRunningWindow()
		if h == 0 {
			return
		}
		if i == 0 {
			procPostMessageW.Call(h, wmTriplemQuit, 0, 0)
		}
		time.Sleep(100 * time.Millisecond)
	}
}
