//go:build windows

package main

// Small COM helpers shared by the Windows integration files.
//
// Vtable indices below were taken from Microsoft's published metadata
// (webview2-com-sys bindings generated from WebView2.winmd, and the windows
// crate generated from Win32/WinRT metadata) - see docs/WINDOWS-APP-3.5.md.

import (
	"fmt"
	"runtime/debug"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

// ICoreWebView2 (and _4, _16) vtable indices.
const (
	wvSettings                    = 3
	wvNavigate                    = 5
	wvNavigateToString            = 6
	wvAddNavigationStarting       = 7
	wvAddNavigationCompleted      = 15
	wvAddPermissionRequested      = 23
	wvAddProcessFailed            = 25
	wvAddScriptOnDocumentCreated  = 27
	wvExecuteScript               = 29
	wvReload                      = 31
	wvPostWebMessageAsString      = 33
	wvAddWebMessageReceived       = 34
	wvAddNewWindowRequested       = 44
	wv4AddDownloadStarting        = 75  // ICoreWebView2_4
	wv16ShowPrintUI               = 114 // ICoreWebView2_16
	settingsSetIsStatusBarEnabled = 10
	settingsSetDevToolsEnabled    = 12
	settingsSetHostObjects        = 16
	settingsSetBuiltInErrorPage   = 20

	controllerSetIsVisible = 4

	msgArgsSource    = 3
	msgArgsTryString = 5

	navCompletedIsSuccess   = 3
	navCompletedErrorStatus = 4
	navStartingUri          = 3
	navStartingSetCancel    = 8

	newWindowUri        = 3
	newWindowSetHandled = 6

	permArgsKind     = 4
	permArgsSetState = 7

	procFailedKind = 3

	dlStartOperation     = 3
	dlStartSetCancel     = 5
	dlStartResultPath    = 6
	dlStartSetResultPath = 7
	dlStartSetHandled    = 9
	dlStartGetDeferral   = 10

	dlOpAddStateChanged = 7
	dlOpTotalBytes      = 12
	dlOpResultFilePath  = 15
	dlOpState           = 16
	dlOpInterruptReason = 17

	deferralComplete = 3
)

var (
	iidCoreWebView2_4  = guid{0x20d02d59, 0x6df2, 0x42dc, [8]byte{0xbd, 0x06, 0xf9, 0x8a, 0x69, 0x4b, 0x13, 0x02}}
	iidCoreWebView2_16 = guid{0x0eb34dc9, 0x9f91, 0x41e1, [8]byte{0x86, 0x39, 0x95, 0xcd, 0x59, 0x43, 0x90, 0x6b}}
)

// WebView2 enum values (COREWEBVIEW2_*).
const (
	webErrorOperationCanceled = 14
	permissionNotifications   = 4
	permissionStateDeny       = 2
	downloadInProgress        = 0
	downloadInterrupted       = 1
	downloadCompleted         = 2
	interruptUserCanceled     = 26
	printDialogSystem         = 1
	processBrowserExited      = 0
	processRenderExited       = 1
	processRenderUnresponsive = 2
)

var ptrSize = unsafe.Sizeof(uintptr(0))

// vcall invokes method idx of the COM object obj.
//
//go:uintptrescapes
func vcall(obj uintptr, idx int, args ...uintptr) uintptr {
	if obj == 0 {
		return 0x80004003 // E_POINTER
	}
	vtbl := *(*uintptr)(unsafe.Pointer(obj))
	fn := *(*uintptr)(unsafe.Pointer(vtbl + uintptr(idx)*ptrSize))
	all := append([]uintptr{obj}, args...)
	r, _, _ := syscall.SyscallN(fn, all...)
	return r
}

func hrOK(r uintptr) bool { return int32(r) >= 0 }

func comAddRef(obj uintptr) {
	if obj != 0 {
		vcall(obj, 1)
	}
}

func comQuery(obj uintptr, iid *guid) uintptr {
	var out uintptr
	if obj == 0 || !hrOK(vcall(obj, 0, uintptr(unsafe.Pointer(iid)), uintptr(unsafe.Pointer(&out)))) {
		return 0
	}
	return out
}

// Generic host-implemented COM handler: QueryInterface returns itself for any
// interface (WebView2 only asks for the handler interface it expects).
type comHandlerVtbl struct{ QueryInterface, AddRef, Release, Invoke uintptr }
type comHandler struct{ vtbl *comHandlerVtbl }

var (
	handlerOnce  sync.Once
	handlerQI    uintptr
	handlerAdd   uintptr
	handlerRel   uintptr
	handlersKeep []*comHandler
)

func newHandler(invoke func(this, a, b uintptr) uintptr) *comHandler {
	handlerOnce.Do(func() {
		handlerQI = syscall.NewCallback(queryInterface)
		handlerAdd = syscall.NewCallback(addRef)
		handlerRel = syscall.NewCallback(release)
	})
	// A bug in one WebView2 event handler must never close the app: the
	// error is logged (with its location) and the event is reported handled.
	guarded := func(this, a, b uintptr) (r uintptr) {
		defer func() {
			if p := recover(); p != nil {
				logRecoveredPanic("WebView2 event", p)
				r = 0
			}
		}()
		return invoke(this, a, b)
	}
	h := &comHandler{vtbl: &comHandlerVtbl{handlerQI, handlerAdd, handlerRel, syscall.NewCallback(guarded)}}
	handlersKeep = append(handlersKeep, h) // COM keeps raw pointers: never let GC free these
	return h
}

func (h *comHandler) ptr() uintptr { return uintptr(unsafe.Pointer(h)) }

var procCoTaskMemFree = ole32.NewProc("CoTaskMemFree")

// takeCoString converts a CoTaskMem-allocated LPWSTR and frees it.
func takeCoString(p uintptr) string {
	if p == 0 {
		return ""
	}
	s := wideToString(p)
	procCoTaskMemFree.Call(p)
	return s
}

func wideToString(p uintptr) string {
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

// getString calls a "get_X(LPWSTR*)" property getter.
func getString(obj uintptr, idx int) string {
	var p uintptr
	if !hrOK(vcall(obj, idx, uintptr(unsafe.Pointer(&p)))) {
		return ""
	}
	return takeCoString(p)
}

func getInt32(obj uintptr, idx int) int32 {
	var v int32
	vcall(obj, idx, uintptr(unsafe.Pointer(&v)))
	return v
}

// UI-thread dispatch for work started on other threads/callbacks.
const wmAppTask = 0x8000 + 0x51

var (
	taskMu    sync.Mutex
	taskQueue []func()
)

func dispatchUI(f func()) {
	taskMu.Lock()
	taskQueue = append(taskQueue, f)
	taskMu.Unlock()
	procPostMessageW.Call(mainHwnd, wmAppTask, 0, 0)
}

func runUITasks() {
	taskMu.Lock()
	q := taskQueue
	taskQueue = nil
	taskMu.Unlock()
	for _, f := range q {
		func() {
			defer func() {
				if r := recover(); r != nil {
					logRecoveredPanic("UI task", r)
				}
			}()
			f()
		}()
	}
}

var procCoTaskMemAllocNative = ole32.NewProc("CoTaskMemAlloc")

// initPropVariantString fills a VT_LPWSTR PROPVARIANT. This is what the
// Windows SDK's InitPropVariantFromString does - that helper is an inline
// function in propvarutil.h and is NOT exported by propsys.dll, so it must
// never be imported. The string is CoTaskMem-allocated and freed by
// PropVariantClear.
func initPropVariantString(s string, pv *propVariant) bool {
	u := utf16Bytes(s)
	size := uintptr(len(u)) * 2
	mem, _, _ := procCoTaskMemAllocNative.Call(size)
	if mem == 0 {
		return false
	}
	copy(unsafe.Slice((*uint16)(unsafe.Pointer(mem)), len(u)), u)
	*pv = propVariant{VT: 31} // VT_LPWSTR
	pv.Value1 = mem
	return true
}

// logRecoveredPanic writes a recovered error and where it happened to the
// diagnostic log, so a problem can be fixed without the app closing.
func logRecoveredPanic(where string, p interface{}) {
	stack := string(debug.Stack())
	if len(stack) > 4000 {
		stack = stack[:4000]
	}
	startupLog(fmt.Sprintf("recovered error in %s: %v\r\n%s", where, p, strings.ReplaceAll(stack, "\n", "\r\n")))
}

// recoverOptional keeps an optional Windows integration (tray icon, badge,
// Jump List, notification) from ever stopping the app: a failure is logged
// and the app keeps running without that feature.
func recoverOptional(feature string) {
	if r := recover(); r != nil {
		startupLog(fmt.Sprintf("%s unavailable: %v", feature, r))
	}
}
