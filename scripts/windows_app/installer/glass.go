//go:build windows

package main

// Premium "glass" Setup interface.
//
// The window is a borderless, rounded Win32 popup that hosts Microsoft Edge
// WebView2 and renders ui/setup.html (embedded at build time). WebView2 is
// loaded exactly like the installed Triplem VIP app does: from the Evergreen
// runtime already installed on the PC (LoadLibraryExW on the runtime's own
// EmbeddedBrowserWebView.dll). Nothing is downloaded, unpacked to disk or
// loaded from memory, and no script host is used.
//
// If the runtime is missing or the interface cannot start within a few
// seconds, runGlassSetup returns false and the classic native wizard runs.
//
// COM interface layouts follow Microsoft's WebView2.idl (cross-checked against
// github.com/jchv/go-webview2, MIT licence).

import (
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

//go:embed ui/setup.html
var glassSetupHTML string

//go:embed ui/setup-logo.png
var glassSetupLogo []byte

const (
	glassWidth  = 860
	glassHeight = 560

	WS_POPUP          = 0x80000000
	CS_DROPSHADOW     = 0x00020000
	WM_TIMER          = 0x0113
	WM_NCLBUTTONDOWN  = 0x00A1
	HTCAPTION         = 2
	SW_MINIMIZE       = 6
	WM_GLASS_DISPATCH = 0x8000 + 0x51 // WM_APP + 0x51

	glassReadyTimerID   = 0x47535455
	glassReadyTimeoutMs = 12000

	loadWithAlteredSearchPath = 0x00000008
)

// ---- WebView2 COM layouts -------------------------------------------------

type wv2EnvironmentVtbl struct {
	iUnknownVtbl
	CreateCoreWebView2Controller     comProc
	CreateWebResourceResponse        comProc
	GetBrowserVersionString          comProc
	AddNewBrowserVersionAvailable    comProc
	RemoveNewBrowserVersionAvailable comProc
}
type wv2Environment struct{ vtbl *wv2EnvironmentVtbl }

type wv2ControllerVtbl struct {
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
type wv2Controller struct{ vtbl *wv2ControllerVtbl }

type wv2WebViewVtbl struct {
	iUnknownVtbl
	GetSettings                            comProc
	GetSource                              comProc
	Navigate                               comProc
	NavigateToString                       comProc
	AddNavigationStarting                  comProc
	RemoveNavigationStarting               comProc
	AddContentLoading                      comProc
	RemoveContentLoading                   comProc
	AddSourceChanged                       comProc
	RemoveSourceChanged                    comProc
	AddHistoryChanged                      comProc
	RemoveHistoryChanged                   comProc
	AddNavigationCompleted                 comProc
	RemoveNavigationCompleted              comProc
	AddFrameNavigationStarting             comProc
	RemoveFrameNavigationStarting          comProc
	AddFrameNavigationCompleted            comProc
	RemoveFrameNavigationCompleted         comProc
	AddScriptDialogOpening                 comProc
	RemoveScriptDialogOpening              comProc
	AddPermissionRequested                 comProc
	RemovePermissionRequested              comProc
	AddProcessFailed                       comProc
	RemoveProcessFailed                    comProc
	AddScriptToExecuteOnDocumentCreated    comProc
	RemoveScriptToExecuteOnDocumentCreated comProc
	ExecuteScript                          comProc
	CapturePreview                         comProc
	Reload                                 comProc
	PostWebMessageAsJSON                   comProc
	PostWebMessageAsString                 comProc
	AddWebMessageReceived                  comProc
	RemoveWebMessageReceived               comProc
}
type wv2WebView struct{ vtbl *wv2WebViewVtbl }

type wv2SettingsVtbl struct {
	iUnknownVtbl
	GetIsScriptEnabled                comProc
	PutIsScriptEnabled                comProc
	GetIsWebMessageEnabled            comProc
	PutIsWebMessageEnabled            comProc
	GetAreDefaultScriptDialogsEnabled comProc
	PutAreDefaultScriptDialogsEnabled comProc
	GetIsStatusBarEnabled             comProc
	PutIsStatusBarEnabled             comProc
	GetAreDevToolsEnabled             comProc
	PutAreDevToolsEnabled             comProc
	GetAreDefaultContextMenusEnabled  comProc
	PutAreDefaultContextMenusEnabled  comProc
	GetAreHostObjectsAllowed          comProc
	PutAreHostObjectsAllowed          comProc
	GetIsZoomControlEnabled           comProc
	PutIsZoomControlEnabled           comProc
}
type wv2Settings struct{ vtbl *wv2SettingsVtbl }

type wv2MessageArgsVtbl struct {
	iUnknownVtbl
	GetSource                comProc
	GetWebMessageAsJSON      comProc
	TryGetWebMessageAsString comProc
}
type wv2MessageArgs struct{ vtbl *wv2MessageArgsVtbl }

type wv2HandlerVtbl struct {
	iUnknownVtbl
	Invoke comProc
}
type wv2Handler struct{ vtbl *wv2HandlerVtbl }

// ---- State -------------------------------------------------------------------

var (
	procReleaseCapture      = user32.NewProc("ReleaseCapture")
	procSetTimer            = user32.NewProc("SetTimer")
	procKillTimer           = user32.NewProc("KillTimer")
	procPostMessageW        = user32.NewProc("PostMessageW")
	procGetClientRect       = user32.NewProc("GetClientRect")
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	procGetDpiForSystem     = user32.NewProc("GetDpiForSystem")
	procLoadLibraryExW      = kernel32.NewProc("LoadLibraryExW")
	procGetProcAddress      = kernel32.NewProc("GetProcAddress")
	procShellExecuteW       = shell32.NewProc("ShellExecuteW")

	glassHwnd       uintptr
	glassController *wv2Controller
	glassView       *wv2WebView
	glassReady      bool
	glassFailed     bool
	glassInstalling bool
	glassFinishing  bool
	glassInstallDir string

	glassEnvHandler, glassCtrlHandler, glassMsgHandler wv2Handler
	glassEnvVtbl, glassCtrlVtbl, glassMsgVtbl          wv2HandlerVtbl

	glassQueueMu sync.Mutex
	glassQueue   []func()
)

func glassQI(this, _, object uintptr) uintptr {
	if object != 0 {
		*(*uintptr)(unsafe.Pointer(object)) = this
	}
	return 0
}
func glassAddRef(uintptr) uintptr  { return 1 }
func glassRelease(uintptr) uintptr { return 1 }

// glassDispatch runs f on the UI thread (outside any WebView2 callback).
func glassDispatch(f func()) {
	glassQueueMu.Lock()
	glassQueue = append(glassQueue, f)
	glassQueueMu.Unlock()
	procPostMessageW.Call(glassHwnd, WM_GLASS_DISPATCH, 0, 0)
}

func glassRunQueue() {
	glassQueueMu.Lock()
	q := glassQueue
	glassQueue = nil
	glassQueueMu.Unlock()
	for _, f := range q {
		f()
	}
}

// glassSend delivers a JSON message to the page (UI thread only).
func glassSend(v interface{}) {
	if glassView == nil {
		return
	}
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	script := "window.__setup && window.__setup.receive(" + string(b) + ")"
	glassView.vtbl.ExecuteScript.Call(uintptr(unsafe.Pointer(glassView)), uintptr(unsafe.Pointer(utf16Ptr(script))), 0)
}

func glassFail(reason string) {
	setupLog("glass setup unavailable: " + reason)
	glassFailed = true
	if glassHwnd != 0 {
		procDestroyWindow.Call(glassHwnd)
	}
}

func glassEnvironmentCreated(_ uintptr, result uintptr, envPtr uintptr) uintptr {
	if int32(result) < 0 || envPtr == 0 {
		glassFail(fmt.Sprintf("environment 0x%08X", uint32(result)))
		return 0
	}
	env := (*wv2Environment)(unsafe.Pointer(envPtr))
	env.vtbl.AddRef.Call(envPtr)
	r, _, _ := env.vtbl.CreateCoreWebView2Controller.Call(envPtr, glassHwnd, uintptr(unsafe.Pointer(&glassCtrlHandler)))
	if int32(r) < 0 {
		glassFail(fmt.Sprintf("controller request 0x%08X", uint32(r)))
	}
	return 0
}

func glassControllerCreated(_ uintptr, result uintptr, controllerPtr uintptr) uintptr {
	if int32(result) < 0 || controllerPtr == 0 {
		glassFail(fmt.Sprintf("controller 0x%08X", uint32(result)))
		return 0
	}
	glassController = (*wv2Controller)(unsafe.Pointer(controllerPtr))
	glassController.vtbl.AddRef.Call(controllerPtr)
	var viewPtr uintptr
	r, _, _ := glassController.vtbl.GetCoreWebView2.Call(controllerPtr, uintptr(unsafe.Pointer(&viewPtr)))
	if int32(r) < 0 || viewPtr == 0 {
		glassFail("web view surface")
		return 0
	}
	glassView = (*wv2WebView)(unsafe.Pointer(viewPtr))
	glassView.vtbl.AddRef.Call(viewPtr)

	var settingsPtr uintptr
	if r, _, _ := glassView.vtbl.GetSettings.Call(viewPtr, uintptr(unsafe.Pointer(&settingsPtr))); int32(r) >= 0 && settingsPtr != 0 {
		st := (*wv2Settings)(unsafe.Pointer(settingsPtr))
		st.vtbl.PutAreDevToolsEnabled.Call(settingsPtr, 0)
		st.vtbl.PutAreDefaultContextMenusEnabled.Call(settingsPtr, 0)
		st.vtbl.PutIsZoomControlEnabled.Call(settingsPtr, 0)
		st.vtbl.PutIsStatusBarEnabled.Call(settingsPtr, 0)
		st.vtbl.PutAreHostObjectsAllowed.Call(settingsPtr, 0)
		releaseCOM(settingsPtr)
	}
	var token int64
	glassView.vtbl.AddWebMessageReceived.Call(viewPtr, uintptr(unsafe.Pointer(&glassMsgHandler)), uintptr(unsafe.Pointer(&token)))

	var rc rect
	procGetClientRect.Call(glassHwnd, uintptr(unsafe.Pointer(&rc)))
	glassController.vtbl.PutBounds.Call(controllerPtr, uintptr(unsafe.Pointer(&rc)))
	glassController.vtbl.PutIsVisible.Call(controllerPtr, 1)

	html := strings.ReplaceAll(glassSetupHTML, "{{LOGO}}", "data:image/png;base64,"+base64.StdEncoding.EncodeToString(glassSetupLogo))
	html = strings.ReplaceAll(html, "{{VERSION}}", appVersion)
	glassView.vtbl.NavigateToString.Call(viewPtr, uintptr(unsafe.Pointer(utf16Ptr(html))))
	return 0
}

func glassMessageReceived(_ uintptr, _ uintptr, argsPtr uintptr) uintptr {
	if argsPtr == 0 {
		return 0
	}
	args := (*wv2MessageArgs)(unsafe.Pointer(argsPtr))
	var strPtr uintptr
	if r, _, _ := args.vtbl.TryGetWebMessageAsString.Call(argsPtr, uintptr(unsafe.Pointer(&strPtr))); int32(r) < 0 || strPtr == 0 {
		return 0
	}
	raw := utf16PtrToString(strPtr)
	procCoTaskMemFree.Call(strPtr)
	var m struct {
		Cmd       string `json:"cmd"`
		Path      string `json:"path"`
		Desktop   bool   `json:"desktop"`
		Start     bool   `json:"start"`
		Pin       bool   `json:"pin"`
		Launch    bool   `json:"launch"`
		Installed bool   `json:"installed"`
	}
	if json.Unmarshal([]byte(raw), &m) != nil {
		return 0
	}
	// Window moves, dialogs and installation steps run from the window
	// procedure, never inside this WebView2 event callback.
	glassDispatch(func() { glassHandle(m.Cmd, m.Path, m.Desktop, m.Start, m.Pin, m.Launch) })
	return 0
}

func utf16PtrToString(p uintptr) string {
	if p == 0 {
		return ""
	}
	n := 0
	for *(*uint16)(unsafe.Pointer(p + uintptr(n)*2)) != 0 {
		n++
		if n > 1<<20 {
			break
		}
	}
	return syscall.UTF16ToString(unsafe.Slice((*uint16)(unsafe.Pointer(p)), n))
}

func glassPayloadMB() int {
	mb := (len(embeddedTriplemApp) + 1024*1024 - 1) / (1024 * 1024)
	if mb < 1 {
		mb = 1
	}
	return mb
}

func runtimeVersionFromPath(dll string) string {
	// ...\EdgeWebView\Application\<version>\EBWebView\x64\EmbeddedBrowserWebView.dll
	return filepath.Base(filepath.Dir(filepath.Dir(filepath.Dir(dll))))
}

func glassHandle(cmd, path string, desktop, start, pin, launch bool) {
	switch cmd {
	case "ready":
		if glassReady {
			return
		}
		glassReady = true
		procKillTimer.Call(glassHwnd, glassReadyTimerID)
		glassSend(map[string]interface{}{
			"type":           "info",
			"defaultDir":     setupDefaultDir(),
			"license":        setupLicense,
			"webview2":       true,
			"webview2Version": runtimeVersionFromPath(findRuntimeDLL()),
			"payloadMB":      glassPayloadMB(),
		})
		procShowWindow.Call(glassHwnd, SW_SHOW)
		procSetForegroundWindow.Call(glassHwnd)
		setupLog("glass setup interface shown")
	case "drag":
		procReleaseCapture.Call()
		procSendMessageW.Call(glassHwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0)
	case "minimize":
		procShowWindow.Call(glassHwnd, SW_MINIMIZE)
	case "close":
		if glassInstalling || glassFinishing {
			return
		}
		procDestroyWindow.Call(glassHwnd)
	case "browse":
		setupHwnd = glassHwnd // owner for the folder dialog
		if p := glassBrowseFolder(); p != "" {
			glassSend(map[string]string{"type": "browse", "path": p})
		}
	case "install":
		if glassInstalling || setupInstallOK {
			return
		}
		dest := strings.TrimSpace(path)
		if dest == "" {
			dest = setupDefaultDir()
		}
		glassInstalling = true
		glassInstallDir = dest
		go func() {
			exe, err := installCore(dest, func(pct int, text string) {
				glassDispatch(func() { glassSend(map[string]interface{}{"type": "progress", "pct": pct, "text": text}) })
			})
			glassDispatch(func() {
				glassInstalling = false
				if err != nil {
					setupLog("installation error: " + err.Error())
					glassSend(map[string]string{"type": "installError", "error": err.Error(), "log": setupLogPath()})
					return
				}
				glassSend(map[string]string{"type": "installed", "path": filepath.Dir(exe)})
			})
		}()
	case "finish":
		if !setupInstallOK || glassFinishing {
			return
		}
		glassFinishing = true
		dir := glassInstallDir
		if dir == "" {
			dir = filepath.Dir(setupInstalledExe)
		}
		if err := applyIntegrations(setupInstalledExe, dir, desktop, start, pin, true); err != nil {
			setupLog("integration error: " + err.Error())
			glassFinishing = false
			glassSend(map[string]string{"type": "finishError", "error": "Triplem VIP is installed, but a shortcut could not be created: " + err.Error() + ". You can open Triplem VIP from " + setupInstalledExe})
			return
		}
		// Pinning is requested by the running app (Windows requires the app
		// itself to be in the foreground), so the app is opened when pin is on.
		if launch || pin {
			if err := execCommandNoShell(setupInstalledExe).Start(); err != nil {
				setupLog("launch after setup failed: " + err.Error())
			} else {
				setupLog("installed application launched")
			}
		}
		procDestroyWindow.Call(glassHwnd)
	}
}

func glassBrowseFolder() string {
	buf := make([]uint16, 260)
	bi := setupBrowseInfo{HwndOwner: glassHwnd, PszDisplayName: &buf[0], LpszTitle: utf16Ptr("Choose the Triplem VIP installation folder"), UlFlags: BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE}
	pidl, _, _ := procSHBrowseForFolderW.Call(uintptr(unsafe.Pointer(&bi)))
	if pidl == 0 {
		return ""
	}
	defer procCoTaskMemFree.Call(pidl)
	out := make([]uint16, 32768)
	if ok, _, _ := procSHGetPathFromIDListW.Call(pidl, uintptr(unsafe.Pointer(&out[0]))); ok == 0 {
		return ""
	}
	chosen := syscall.UTF16ToString(out)
	// Keep the conventional "...\Triplem VIP" sub-folder when a parent folder is chosen.
	if !strings.EqualFold(filepath.Base(chosen), "Triplem VIP") {
		chosen = filepath.Join(chosen, "Triplem VIP")
	}
	return chosen
}

func glassWndProc(hwnd uintptr, message uint32, wParam, lParam uintptr) uintptr {
	switch message {
	case WM_GLASS_DISPATCH:
		glassRunQueue()
		return 0
	case WM_TIMER:
		if wParam == glassReadyTimerID {
			procKillTimer.Call(hwnd, glassReadyTimerID)
			if !glassReady {
				glassFail("interface did not become ready in time")
			}
			return 0
		}
	case WM_CLOSE:
		if glassInstalling || glassFinishing {
			return 0
		}
		procDestroyWindow.Call(hwnd)
		return 0
	case WM_DESTROY:
		procPostQuitMessage.Call(0)
		return 0
	}
	r, _, _ := procDefWindowProcW.Call(hwnd, uintptr(message), wParam, lParam)
	return r
}

func glassScale(v int32) int32 {
	dpi := uintptr(96)
	if procGetDpiForSystem.Find() == nil {
		if d, _, _ := procGetDpiForSystem.Call(); d >= 96 {
			dpi = d
		}
	}
	return int32(int64(v) * int64(dpi) / 96)
}

// runGlassSetup returns true when the glass interface ran (the user finished
// or closed it) and false when the classic wizard should be used instead.
func runGlassSetup() (handled bool) {
	defer func() {
		if r := recover(); r != nil {
			setupLog(fmt.Sprintf("glass setup panic: %v", r))
			handled = setupInstallOK // never re-run Setup after a completed install
		}
	}()
	runtime.LockOSThread()
	dll := findRuntimeDLL()
	if dll == "" {
		setupLog("glass setup: WebView2 runtime not found; using classic wizard")
		return false
	}
	procCoInitializeEx.Call(0, COINIT_APARTMENTTHREADED)
	defer procCoUninitialize.Call()

	glassEnvVtbl = wv2HandlerVtbl{iUnknownVtbl{comProc(syscall.NewCallback(glassQI)), comProc(syscall.NewCallback(glassAddRef)), comProc(syscall.NewCallback(glassRelease))}, comProc(syscall.NewCallback(glassEnvironmentCreated))}
	glassCtrlVtbl = wv2HandlerVtbl{iUnknownVtbl{comProc(syscall.NewCallback(glassQI)), comProc(syscall.NewCallback(glassAddRef)), comProc(syscall.NewCallback(glassRelease))}, comProc(syscall.NewCallback(glassControllerCreated))}
	glassMsgVtbl = wv2HandlerVtbl{iUnknownVtbl{comProc(syscall.NewCallback(glassQI)), comProc(syscall.NewCallback(glassAddRef)), comProc(syscall.NewCallback(glassRelease))}, comProc(syscall.NewCallback(glassMessageReceived))}
	glassEnvHandler.vtbl = &glassEnvVtbl
	glassCtrlHandler.vtbl = &glassCtrlVtbl
	glassMsgHandler.vtbl = &glassMsgVtbl

	setupIcon = setupLoadIcon()
	hinst, _, _ := procGetModuleHandleW.Call(0)
	cursor, _, _ := procLoadCursorW.Call(0, IDC_ARROW)
	bg, _, _ := procCreateSolidBrush.Call(0x00180B05) // BGR of #050b18, matches the page
	class := utf16Ptr("TriplemVIP.GlassSetup")
	wc := wndClassExW{CbSize: uint32(unsafe.Sizeof(wndClassExW{})), Style: CS_HREDRAW | CS_VREDRAW | CS_DROPSHADOW, LpfnWndProc: syscall.NewCallback(glassWndProc), HInstance: syscall.Handle(hinst), HIcon: syscall.Handle(setupIcon), HCursor: syscall.Handle(cursor), HbrBackground: syscall.Handle(bg), LpszClassName: class, HIconSm: syscall.Handle(setupIcon)}
	if atom, _, _ := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc))); atom == 0 {
		return false
	}
	w, h := glassScale(glassWidth), glassScale(glassHeight)
	sw, _, _ := procGetSystemMetrics.Call(0)
	sh, _, _ := procGetSystemMetrics.Call(1)
	x, y := (int32(sw)-w)/2, (int32(sh)-h)/2
	// Hidden until the page reports it is ready, so no blank frame is ever shown.
	hwnd, _, _ := procCreateWindowExW.Call(0, uintptr(unsafe.Pointer(class)), uintptr(unsafe.Pointer(utf16Ptr("Triplem VIP Setup"))), WS_POPUP|WS_SYSMENU|WS_MINIMIZEBOX, uintptr(x), uintptr(y), uintptr(w), uintptr(h), 0, 0, hinst, 0)
	if hwnd == 0 {
		return false
	}
	glassHwnd = hwnd
	setupHwnd = hwnd
	if setupIcon != 0 {
		procSendMessageW.Call(hwnd, WM_SETICON, ICON_BIG, setupIcon)
		procSendMessageW.Call(hwnd, WM_SETICON, ICON_SMALL, setupIcon)
	}
	corner := uint32(2) // DWMWCP_ROUND (Windows 11)
	procDwmSetWindowAttribute.Call(hwnd, 33, uintptr(unsafe.Pointer(&corner)), 4)
	dark := uint32(1) // DWMWA_USE_IMMERSIVE_DARK_MODE
	procDwmSetWindowAttribute.Call(hwnd, 20, uintptr(unsafe.Pointer(&dark)), 4)

	mod, _, loadErr := procLoadLibraryExW.Call(uintptr(unsafe.Pointer(utf16Ptr(dll))), 0, loadWithAlteredSearchPath)
	if mod == 0 {
		setupLog(fmt.Sprintf("glass setup: runtime load failed: %v", loadErr))
		procDestroyWindow.Call(hwnd)
		messageLoop()
		return false
	}
	name := append([]byte("CreateWebViewEnvironmentWithOptionsInternal"), 0)
	entry, _, _ := procGetProcAddress.Call(mod, uintptr(unsafe.Pointer(&name[0])))
	if entry == 0 {
		procDestroyWindow.Call(hwnd)
		messageLoop()
		return false
	}
	dataDir := filepath.Join(os.TempDir(), "TriplemVIP-Setup-WebView2")
	_ = os.MkdirAll(dataDir, 0700)
	r, _, _ := syscall.SyscallN(entry, 1, 0, uintptr(unsafe.Pointer(utf16Ptr(dataDir))), 0, uintptr(unsafe.Pointer(&glassEnvHandler)))
	if int32(r) < 0 {
		setupLog(fmt.Sprintf("glass setup: environment start 0x%08X", uint32(r)))
		procDestroyWindow.Call(hwnd)
		messageLoop()
		return false
	}
	procSetTimer.Call(hwnd, glassReadyTimerID, glassReadyTimeoutMs, 0)
	messageLoop()

	if glassFailed && !glassReady {
		return false // nothing was shown or installed: use the classic wizard
	}
	if glassController != nil {
		glassController.vtbl.Close.Call(uintptr(unsafe.Pointer(glassController)))
	}
	return true
}
