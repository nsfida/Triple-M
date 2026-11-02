//go:build windows

package main

import (
	"crypto/sha256"
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

//go:embed payload/TriplemVIP.exe
var embeddedTriplemApp []byte
var expectedPayloadSHA256 string

const (
	CS_HREDRAW               = 0x0002
	CS_VREDRAW               = 0x0001
	WS_CAPTION               = 0x00C00000
	WS_SYSMENU               = 0x00080000
	WS_MINIMIZEBOX           = 0x00020000
	CW_USEDEFAULT            = 0x80000000
	SW_SHOW                  = 5
	WM_DESTROY               = 0x0002
	WM_SETICON               = 0x0080
	WM_CLOSE                 = 0x0010
	ICON_SMALL               = 0
	ICON_BIG                 = 1
	IMAGE_ICON               = 1
	LR_DEFAULTSIZE           = 0x0040
	IDC_ARROW                = 32512
	COINIT_APARTMENTTHREADED = 0x2
	MB_OK                    = 0x00000000
	MB_ICONERROR             = 0x00000010
	MB_ICONINFORMATION       = 0x00000040
)

type guid struct {
	Data1 uint32
	Data2 uint16
	Data3 uint16
	Data4 [8]byte
}
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
	user32               = syscall.NewLazyDLL("user32.dll")
	kernel32             = syscall.NewLazyDLL("kernel32.dll")
	ole32                = syscall.NewLazyDLL("ole32.dll")
	shell32              = syscall.NewLazyDLL("shell32.dll")
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
	procLoadImageW       = user32.NewProc("LoadImageW")
	procLoadCursorW      = user32.NewProc("LoadCursorW")
	procSendMessageW     = user32.NewProc("SendMessageW")
	procMessageBoxW      = user32.NewProc("MessageBoxW")
	procGetModuleHandleW = kernel32.NewProc("GetModuleHandleW")
	procCoInitializeEx   = ole32.NewProc("CoInitializeEx")
	procCoUninitialize   = ole32.NewProc("CoUninitialize")
)

func utf16Ptr(s string) *uint16 { p, _ := syscall.UTF16PtrFromString(s); return p }
func messageBox(title, text string, flags uintptr) {
	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(utf16Ptr(text))), uintptr(unsafe.Pointer(utf16Ptr(title))), flags)
}
func messageLoop() {
	var m msg
	for {
		r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 {
			return
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}
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
	for _, base := range bases {
		entries, err := os.ReadDir(base)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			p := filepath.Join(base, entry.Name(), "EBWebView", "x64", "EmbeddedBrowserWebView.dll")
			if st, err := os.Stat(p); err == nil && !st.IsDir() {
				return p
			}
		}
	}
	return ""
}

func pinRequestFile() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		return ""
	}
	return filepath.Join(base, "Triplem VIP", "request-taskbar-pin")
}

// ---- Safe single-file setup --------------------------------------------------------
// Setup contains a separately built TriplemVIP.exe payload. The payload is SHA-256
// verified, written atomically, and never produced by copying or renaming Setup itself.
// Setup does not invoke script hosts, bypass security policy, rewrite PE resources, or
// modify Windows security settings.

const (
	appVersion = "3.3.2"

	setupWidth  = 760
	setupHeight = 548
	setupLeft   = 210

	WS_CHILD   = 0x40000000
	WS_VISIBLE = 0x10000000
	WS_TABSTOP = 0x00010000
	WS_BORDER  = 0x00800000
	WS_VSCROLL = 0x00200000

	ES_AUTOHSCROLL = 0x0080
	ES_MULTILINE   = 0x0004
	ES_READONLY    = 0x0800
	ES_AUTOVSCROLL = 0x0040

	BS_PUSHBUTTON    = 0x00000000
	BS_DEFPUSHBUTTON = 0x00000001
	BS_AUTOCHECKBOX  = 0x00000003

	SS_LEFT = 0x00000000

	WM_PAINT          = 0x000F
	WM_COMMAND        = 0x0111
	WM_SETFONT        = 0x0030
	WM_CTLCOLOREDIT   = 0x0133
	WM_CTLCOLORBTN    = 0x0135
	WM_CTLCOLORSTATIC = 0x0138

	BM_GETCHECK = 0x00F0
	BM_SETCHECK = 0x00F1
	BST_CHECKED = 1

	PBM_SETRANGE32 = 0x0406
	PBM_SETPOS     = 0x0402

	ID_SETUP_BACK    = 4101
	ID_SETUP_NEXT    = 4102
	ID_SETUP_CANCEL  = 4103
	ID_SETUP_ACCEPT  = 4110
	ID_SETUP_PATH    = 4120
	ID_SETUP_BROWSE  = 4121
	ID_SETUP_DESKTOP = 4130
	ID_SETUP_START   = 4131
	ID_SETUP_TASKBAR = 4132
	ID_SETUP_LAUNCH  = 4150

	BIF_RETURNONLYFSDIRS = 0x0001
	BIF_NEWDIALOGSTYLE   = 0x0040

	CLSCTX_INPROC_SERVER        = 0x1
	KEY_WRITE                   = 0x20006
	REG_SZ                      = 1
	REG_DWORD                   = 4
	MOVEFILE_DELAY_UNTIL_REBOOT = 0x4
	COLOR_WINDOW                = 5
	MB_YESNO                    = 0x00000004
	MB_ICONQUESTION             = 0x00000020
	IDYES                       = 6
)

const setupLicense = `TRIPLEM VIP WINDOWS APPLICATION LICENSE AGREEMENT

Please read this agreement before installing Triplem VIP for Windows.

1. License. This application is a Windows client for the Triplem VIP online service. Access remains subject to the account, subscription, privacy and service terms applicable to Triplem VIP.

2. Data. The Windows application renders the live Triplem VIP service. Your business data remains in your Triplem VIP workspace and is not converted into a separate local database by this installer.

3. Security. The application uses Microsoft Edge WebView2 as its rendering runtime and HTTPS to load triplem.vip. Keep Windows, WebView2 and your device security software updated.

4. Updates. Most Triplem VIP product updates are delivered through the live website. A new Windows installer is needed only for Windows-specific shell changes.

5. Access controls. The Windows application does not bypass Triplem VIP authentication, permissions, workspace isolation or server-side security.

6. Removal. You can uninstall the Windows client from Windows Settings. Uninstalling the client does not delete your online Triplem VIP account or cloud data.

By selecting I accept the terms and continuing, you agree to this installation agreement.`

type setupBrowseInfo struct {
	HwndOwner      uintptr
	PidlRoot       uintptr
	PszDisplayName *uint16
	LpszTitle      *uint16
	UlFlags        uint32
	Lpfn           uintptr
	LParam         uintptr
	IImage         int32
}
type setupPaintStruct struct {
	Hdc         uintptr
	Erase       int32
	RcPaint     rect
	Restore     int32
	IncUpdate   int32
	RgbReserved [32]byte
}

var (
	advapi32 = syscall.NewLazyDLL("advapi32.dll")
	gdi32    = syscall.NewLazyDLL("gdi32.dll")
	comctl32 = syscall.NewLazyDLL("comctl32.dll")
	uxtheme  = syscall.NewLazyDLL("uxtheme.dll")
	dwmapi   = syscall.NewLazyDLL("dwmapi.dll")

	procSetWindowTextW       = user32.NewProc("SetWindowTextW")
	procGetWindowTextLengthW = user32.NewProc("GetWindowTextLengthW")
	procGetWindowTextW       = user32.NewProc("GetWindowTextW")
	procEnableWindow         = user32.NewProc("EnableWindow")
	procSetWindowPos         = user32.NewProc("SetWindowPos")
	procGetSystemMetrics     = user32.NewProc("GetSystemMetrics")
	procBeginPaint           = user32.NewProc("BeginPaint")
	procEndPaint             = user32.NewProc("EndPaint")
	procFillRect             = user32.NewProc("FillRect")
	procDrawTextW            = user32.NewProc("DrawTextW")
	procDrawIconEx           = user32.NewProc("DrawIconEx")
	procInvalidateRect       = user32.NewProc("InvalidateRect")
	procSHBrowseForFolderW   = shell32.NewProc("SHBrowseForFolderW")
	procSHGetPathFromIDListW = shell32.NewProc("SHGetPathFromIDListW")
	procSHGetKnownFolderPath = shell32.NewProc("SHGetKnownFolderPath")
	procCoTaskMemFree        = ole32.NewProc("CoTaskMemFree")

	procCreateFontW      = gdi32.NewProc("CreateFontW")
	procCreateSolidBrush = gdi32.NewProc("CreateSolidBrush")
	procDeleteObject     = gdi32.NewProc("DeleteObject")
	procSelectObject     = gdi32.NewProc("SelectObject")
	procSetBkMode        = gdi32.NewProc("SetBkMode")
	procSetBkColor       = gdi32.NewProc("SetBkColor")
	procSetTextColor     = gdi32.NewProc("SetTextColor")

	procInitCommonControls    = comctl32.NewProc("InitCommonControls")
	procSetWindowTheme        = uxtheme.NewProc("SetWindowTheme")
	procDwmSetWindowAttribute = dwmapi.NewProc("DwmSetWindowAttribute")

	procRegCreateKeyExW = advapi32.NewProc("RegCreateKeyExW")
	procRegSetValueExW  = advapi32.NewProc("RegSetValueExW")
	procRegCloseKey     = advapi32.NewProc("RegCloseKey")
	procRegDeleteTreeW  = advapi32.NewProc("RegDeleteTreeW")
)

var folderDesktop = guid{0xB4BFCC3A, 0xDB2C, 0x424C, [8]byte{0xB0, 0x29, 0x7F, 0xE9, 0x9A, 0x87, 0xC6, 0x41}}
var folderPrograms = guid{0xA77F5D77, 0x2E2B, 0x44C3, [8]byte{0xA6, 0xA2, 0xAB, 0xA6, 0x01, 0x05, 0x4A, 0x51}}

var (
	setupHwnd             uintptr
	setupPage             int
	setupFont             uintptr
	setupFontSmall        uintptr
	setupFontTitle        uintptr
	setupBrandBrush       uintptr
	setupWhiteBrush       uintptr
	setupIcon             uintptr
	setupInstalledExe     string
	setupInstallOK        bool
	setupTaskbarRequested bool

	setupWelcomeText, setupLicenseEdit, setupAcceptCheck                                      uintptr
	setupPathEdit, setupBrowseBtn, setupPathHint                                              uintptr
	setupOptionsText, setupDesktopCheck, setupStartCheck, setupTaskbarCheck, setupOptionsHint uintptr
	setupReadyText, setupProgress, setupProgressText                                          uintptr
	setupCompleteText, setupLaunchCheck                                                       uintptr
	setupBackBtn, setupNextBtn, setupCancelBtn                                                uintptr
)

func setupSetText(h uintptr, s string) {
	procSetWindowTextW.Call(h, uintptr(unsafe.Pointer(utf16Ptr(s))))
}
func setupGetText(h uintptr) string {
	n, _, _ := procGetWindowTextLengthW.Call(h)
	if n == 0 {
		return ""
	}
	buf := make([]uint16, n+1)
	procGetWindowTextW.Call(h, uintptr(unsafe.Pointer(&buf[0])), n+1)
	return syscall.UTF16ToString(buf)
}
func setupShow(h uintptr, show bool) {
	if h == 0 {
		return
	}
	if show {
		procShowWindow.Call(h, SW_SHOW)
	} else {
		procShowWindow.Call(h, 0)
	}
}
func setupEnable(h uintptr, yes bool) {
	if yes {
		procEnableWindow.Call(h, 1)
	} else {
		procEnableWindow.Call(h, 0)
	}
}
func setupChecked(h uintptr) bool {
	r, _, _ := procSendMessageW.Call(h, BM_GETCHECK, 0, 0)
	return r == BST_CHECKED
}
func setupSetChecked(h uintptr, yes bool) {
	var v uintptr
	if yes {
		v = BST_CHECKED
	}
	procSendMessageW.Call(h, BM_SETCHECK, v, 0)
}
func setupLoword(v uintptr) uint16 { return uint16(v & 0xffff) }

func setupNewControl(class, text string, style uint32, x, y, w, h int32, id int) uintptr {
	hinst, _, _ := procGetModuleHandleW.Call(0)
	hwnd, _, _ := procCreateWindowExW.Call(0, uintptr(unsafe.Pointer(utf16Ptr(class))), uintptr(unsafe.Pointer(utf16Ptr(text))), uintptr(style), uintptr(x), uintptr(y), uintptr(w), uintptr(h), setupHwnd, uintptr(id), hinst, 0)
	if hwnd != 0 {
		procSendMessageW.Call(hwnd, WM_SETFONT, setupFont, 1)
		procSetWindowTheme.Call(hwnd, uintptr(unsafe.Pointer(utf16Ptr("Explorer"))), 0)
	}
	return hwnd
}

func setupDefaultDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		if h, err := os.UserHomeDir(); err == nil {
			base = filepath.Join(h, "AppData", "Local")
		}
	}
	return filepath.Join(base, "Programs", "Triplem VIP")
}

func knownFolder(id *guid) string {
	var ptr uintptr
	hr, _, _ := procSHGetKnownFolderPath.Call(uintptr(unsafe.Pointer(id)), 0, 0, uintptr(unsafe.Pointer(&ptr)))
	if int32(hr) < 0 || ptr == 0 {
		return ""
	}
	defer procCoTaskMemFree.Call(ptr)
	arr := (*[32768]uint16)(unsafe.Pointer(ptr))
	n := 0
	for n < len(arr) && arr[n] != 0 {
		n++
	}
	return syscall.UTF16ToString(arr[:n])
}

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

type iShellLinkWVtbl struct {
	iUnknownVtbl
	GetPath             comProc
	GetIDList           comProc
	SetIDList           comProc
	GetDescription      comProc
	SetDescription      comProc
	GetWorkingDirectory comProc
	SetWorkingDirectory comProc
	GetArguments        comProc
	SetArguments        comProc
	GetHotkey           comProc
	SetHotkey           comProc
	GetShowCmd          comProc
	SetShowCmd          comProc
	GetIconLocation     comProc
	SetIconLocation     comProc
	SetRelativePath     comProc
	Resolve             comProc
	SetPath             comProc
}
type iShellLinkW struct{ vtbl *iShellLinkWVtbl }

type iPersistFileVtbl struct {
	iUnknownVtbl
	GetClassID    comProc
	IsDirty       comProc
	Load          comProc
	Save          comProc
	SaveCompleted comProc
	GetCurFile    comProc
}
type iPersistFile struct{ vtbl *iPersistFileVtbl }

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

var (
	clsidShellLink       = guid{0x00021401, 0x0000, 0x0000, [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIShellLinkW       = guid{0x000214F9, 0x0000, 0x0000, [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIPersistFile      = guid{0x0000010B, 0x0000, 0x0000, [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIPropertyStore    = guid{0x886D8EEB, 0x8CF2, 0x4446, [8]byte{0x8D, 0x02, 0xCD, 0xBA, 0x1D, 0xBD, 0xCF, 0x99}}
	appModelFmtID        = guid{0x9F4C2855, 0x9F79, 0x4B39, [8]byte{0xA8, 0xD0, 0xE1, 0xD4, 0x2D, 0xE1, 0xD5, 0xF3}}
	procCoCreateInstance = ole32.NewProc("CoCreateInstance")
	procCoTaskMemAlloc   = ole32.NewProc("CoTaskMemAlloc")
)

func releaseCOM(ptr uintptr) {
	if ptr == 0 {
		return
	}
	v := *(**iUnknownVtbl)(unsafe.Pointer(ptr))
	if v != nil {
		v.Release.Call(ptr)
	}
}

func hresultError(op string, hr uintptr) error {
	if int32(hr) >= 0 {
		return nil
	}
	return fmt.Errorf("%s failed (HRESULT 0x%08X)", op, uint32(hr))
}

func allocCOMUTF16(value string) (uintptr, error) {
	buf, err := syscall.UTF16FromString(value)
	if err != nil {
		return 0, fmt.Errorf("encode COM string: %w", err)
	}
	size := uintptr(len(buf) * 2)
	mem, _, _ := procCoTaskMemAlloc.Call(size)
	if mem == 0 {
		return 0, fmt.Errorf("allocate COM string memory")
	}
	dst := unsafe.Slice((*uint16)(unsafe.Pointer(mem)), len(buf))
	copy(dst, buf)
	return mem, nil
}

func setShortcutAppID(linkPtr uintptr) error {
	link := (*iShellLinkW)(unsafe.Pointer(linkPtr))
	var storePtr uintptr
	hr, _, _ := link.vtbl.QueryInterface.Call(linkPtr, uintptr(unsafe.Pointer(&iidIPropertyStore)), uintptr(unsafe.Pointer(&storePtr)))
	if int32(hr) < 0 || storePtr == 0 {
		return hresultError("shortcut property store", hr)
	}
	defer releaseCOM(storePtr)
	store := (*iPropertyStore)(unsafe.Pointer(storePtr))

	// Construct the VT_LPWSTR PROPVARIANT directly using COM-owned
	// memory so shortcut creation works consistently across supported Windows
	// versions without resolving a helper as a runtime DLL procedure.
	valueMem, err := allocCOMUTF16("TriplemVIP.Desktop")
	if err != nil {
		return err
	}
	defer procCoTaskMemFree.Call(valueMem)
	pv := propVariant{VT: 31, Value1: valueMem} // VT_LPWSTR

	key := propertyKey{FmtID: appModelFmtID, PID: 5}
	hr, _, _ = store.vtbl.SetValue.Call(storePtr, uintptr(unsafe.Pointer(&key)), uintptr(unsafe.Pointer(&pv)))
	if int32(hr) < 0 {
		return hresultError("shortcut AppUserModelID", hr)
	}
	hr, _, _ = store.vtbl.Commit.Call(storePtr)
	return hresultError("shortcut property commit", hr)
}

// createWindowsShortcut uses the Windows Shell's documented IShellLinkW and
// IPersistFile interfaces. The saved .lnk therefore resolves to the installed
// TriplemVIP.exe exactly as Explorer, Start and the taskbar expect.
func createWindowsShortcut(shortcut, target, workdir, iconPath string) error {
	if err := os.MkdirAll(filepath.Dir(shortcut), 0755); err != nil {
		return err
	}
	_ = os.Remove(shortcut)

	var linkPtr uintptr
	hr, _, _ := procCoCreateInstance.Call(
		uintptr(unsafe.Pointer(&clsidShellLink)),
		0,
		CLSCTX_INPROC_SERVER,
		uintptr(unsafe.Pointer(&iidIShellLinkW)),
		uintptr(unsafe.Pointer(&linkPtr)),
	)
	if int32(hr) < 0 || linkPtr == 0 {
		return hresultError("create Windows shortcut", hr)
	}
	defer releaseCOM(linkPtr)
	link := (*iShellLinkW)(unsafe.Pointer(linkPtr))

	if hr, _, _ = link.vtbl.SetPath.Call(linkPtr, uintptr(unsafe.Pointer(utf16Ptr(target)))); int32(hr) < 0 {
		return hresultError("shortcut target", hr)
	}
	if hr, _, _ = link.vtbl.SetWorkingDirectory.Call(linkPtr, uintptr(unsafe.Pointer(utf16Ptr(workdir)))); int32(hr) < 0 {
		return hresultError("shortcut working directory", hr)
	}
	if hr, _, _ = link.vtbl.SetDescription.Call(linkPtr, uintptr(unsafe.Pointer(utf16Ptr("Triplem VIP")))); int32(hr) < 0 {
		return hresultError("shortcut description", hr)
	}
	if hr, _, _ = link.vtbl.SetIconLocation.Call(linkPtr, uintptr(unsafe.Pointer(utf16Ptr(iconPath))), 0); int32(hr) < 0 {
		return hresultError("shortcut icon", hr)
	}
	if hr, _, _ = link.vtbl.SetShowCmd.Call(linkPtr, 1); int32(hr) < 0 {
		return hresultError("shortcut window mode", hr)
	}
	if err := setShortcutAppID(linkPtr); err != nil {
		// AppUserModelID decoration improves taskbar grouping, but it is not
		// required for a functional Shell Link. Never abort a successful
		// installation because optional shortcut metadata could not be written.
		setupLog("shortcut AppUserModelID warning: " + err.Error())
	}

	var persistPtr uintptr
	hr, _, _ = link.vtbl.QueryInterface.Call(linkPtr, uintptr(unsafe.Pointer(&iidIPersistFile)), uintptr(unsafe.Pointer(&persistPtr)))
	if int32(hr) < 0 || persistPtr == 0 {
		return hresultError("shortcut persistence", hr)
	}
	defer releaseCOM(persistPtr)
	persist := (*iPersistFile)(unsafe.Pointer(persistPtr))
	hr, _, _ = persist.vtbl.Save.Call(persistPtr, uintptr(unsafe.Pointer(utf16Ptr(shortcut))), 1)
	if int32(hr) < 0 {
		return hresultError("save Windows shortcut", hr)
	}
	if st, err := os.Stat(shortcut); err != nil || st.Size() < 128 {
		if err != nil {
			return fmt.Errorf("shortcut was not created: %w", err)
		}
		return fmt.Errorf("shortcut was not created correctly")
	}
	return nil
}

func regSetString(h uintptr, name, value string) {
	v, _ := syscall.UTF16FromString(value)
	var namePtr uintptr
	if name != "" {
		namePtr = uintptr(unsafe.Pointer(utf16Ptr(name)))
	}
	procRegSetValueExW.Call(h, namePtr, 0, REG_SZ, uintptr(unsafe.Pointer(&v[0])), uintptr(len(v)*2))
}
func regSetDWORD(h uintptr, name string, value uint32) {
	procRegSetValueExW.Call(h, uintptr(unsafe.Pointer(utf16Ptr(name))), 0, REG_DWORD, uintptr(unsafe.Pointer(&value)), 4)
}
func registerUninstall(installDir, exePath, iconPath string) error {
	const hkcu = uintptr(0x80000001)
	key := `Software\Microsoft\Windows\CurrentVersion\Uninstall\TriplemVIP`
	var h uintptr
	var disp uint32
	r, _, _ := procRegCreateKeyExW.Call(hkcu, uintptr(unsafe.Pointer(utf16Ptr(key))), 0, 0, 0, KEY_WRITE, 0, uintptr(unsafe.Pointer(&h)), uintptr(unsafe.Pointer(&disp)))
	if r != 0 || h == 0 {
		return fmt.Errorf("uninstall registration failed: %d", r)
	}
	defer procRegCloseKey.Call(h)
	regSetString(h, "DisplayName", "Triplem VIP")
	regSetString(h, "DisplayVersion", appVersion)
	regSetString(h, "Publisher", "Triplem VIP")
	regSetString(h, "InstallLocation", installDir)
	regSetString(h, "DisplayIcon", iconPath+",0")
	regSetString(h, "UninstallString", `"`+exePath+`" --uninstall`)
	regSetString(h, "URLInfoAbout", "https://triplem.vip/")
	regSetDWORD(h, "NoModify", 1)
	regSetDWORD(h, "NoRepair", 1)
	return nil
}
func unregisterApp() {
	const hkcu = uintptr(0x80000001)
	key := `Software\Microsoft\Windows\CurrentVersion\Uninstall\TriplemVIP`
	procRegDeleteTreeW.Call(hkcu, uintptr(unsafe.Pointer(utf16Ptr(key))))
}

func setupBrowseFolder() {
	buf := make([]uint16, 260)
	bi := setupBrowseInfo{HwndOwner: setupHwnd, PszDisplayName: &buf[0], LpszTitle: utf16Ptr("Choose the Triplem VIP installation folder"), UlFlags: BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE}
	pidl, _, _ := procSHBrowseForFolderW.Call(uintptr(unsafe.Pointer(&bi)))
	if pidl == 0 {
		return
	}
	defer procCoTaskMemFree.Call(pidl)
	path := make([]uint16, 32768)
	ok, _, _ := procSHGetPathFromIDListW.Call(pidl, uintptr(unsafe.Pointer(&path[0])))
	if ok != 0 {
		setupSetText(setupPathEdit, syscall.UTF16ToString(path))
	}
}

func setupMakeFonts() {
	normalH := int32(-17)
	smallH := int32(-15)
	titleH := int32(-30)
	setupFont, _, _ = procCreateFontW.Call(uintptr(normalH), 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))))
	setupFontSmall, _, _ = procCreateFontW.Call(uintptr(smallH), 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))))
	setupFontTitle, _, _ = procCreateFontW.Call(uintptr(titleH), 0, 0, 0, 600, 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))))
	setupBrandBrush, _, _ = procCreateSolidBrush.Call(0x00302014) // BGR #142030
	setupWhiteBrush, _, _ = procCreateSolidBrush.Call(0x00FFFFFF)
}

func setupCreateControls() {
	setupMakeFonts()
	x := int32(setupLeft + 30)
	setupWelcomeText = setupNewControl("STATIC", "Install the secure Triplem VIP Windows client on this PC. The application uses its own native window and Microsoft WebView2 to display your live Triplem VIP workspace.\r\n\r\nThis setup installs per-user by default and does not require administrator rights.", WS_CHILD|SS_LEFT, x, 130, 480, 180, 0)
	setupLicenseEdit = setupNewControl("EDIT", setupLicense, WS_CHILD|WS_BORDER|WS_VSCROLL|ES_MULTILINE|ES_READONLY|ES_AUTOVSCROLL, x, 112, 480, 245, 0)
	setupAcceptCheck = setupNewControl("BUTTON", "I accept the terms of the License Agreement", WS_CHILD|WS_TABSTOP|BS_AUTOCHECKBOX, x, 370, 475, 26, ID_SETUP_ACCEPT)
	setupPathEdit = setupNewControl("EDIT", setupDefaultDir(), WS_CHILD|WS_BORDER|WS_TABSTOP|ES_AUTOHSCROLL, x, 156, 365, 30, ID_SETUP_PATH)
	setupBrowseBtn = setupNewControl("BUTTON", "Browse…", WS_CHILD|WS_TABSTOP|BS_PUSHBUTTON, x+375, 155, 105, 31, ID_SETUP_BROWSE)
	setupPathHint = setupNewControl("STATIC", "Recommended: use the default per-user folder. Choose another writable folder only if you specifically need it.", WS_CHILD|SS_LEFT, x, 202, 480, 58, 0)
	setupOptionsText = setupNewControl("STATIC", "Choose the Windows integrations you want Setup to configure:", WS_CHILD|SS_LEFT, x, 124, 480, 26, 0)
	setupDesktopCheck = setupNewControl("BUTTON", "Create Desktop shortcut", WS_CHILD|WS_TABSTOP|BS_AUTOCHECKBOX, x, 166, 470, 27, ID_SETUP_DESKTOP)
	setupStartCheck = setupNewControl("BUTTON", "Create Start Menu shortcut", WS_CHILD|WS_TABSTOP|BS_AUTOCHECKBOX, x, 205, 470, 27, ID_SETUP_START)
	setupTaskbarCheck = setupNewControl("BUTTON", "Ask to pin Triplem VIP on first launch", WS_CHILD|WS_TABSTOP|BS_AUTOCHECKBOX, x, 244, 470, 27, ID_SETUP_TASKBAR)
	setupOptionsHint = setupNewControl("STATIC", "If selected, Triplem VIP opens after setup and shows an in-app confirmation. After you choose Yes, Windows displays its official taskbar-pin prompt when supported. A Start Menu shortcut is created automatically because Windows requires one for desktop-app pinning.", WS_CHILD|SS_LEFT, x+20, 282, 455, 76, 0)
	setupReadyText = setupNewControl("STATIC", "", WS_CHILD|SS_LEFT, x, 126, 480, 235, 0)
	setupProgressText = setupNewControl("STATIC", "Preparing installation…", WS_CHILD|SS_LEFT, x, 166, 480, 24, 0)
	setupProgress = setupNewControl("msctls_progress32", "", WS_CHILD, x, 205, 480, 18, 0)
	procSendMessageW.Call(setupProgress, PBM_SETRANGE32, 0, 100)
	setupCompleteText = setupNewControl("STATIC", "", WS_CHILD|SS_LEFT, x, 135, 480, 185, 0)
	setupLaunchCheck = setupNewControl("BUTTON", "Launch Triplem VIP now", WS_CHILD|WS_TABSTOP|BS_AUTOCHECKBOX, x, 332, 470, 27, ID_SETUP_LAUNCH)
	setupSetChecked(setupDesktopCheck, true)
	setupSetChecked(setupStartCheck, true)
	setupSetChecked(setupLaunchCheck, true)

	setupBackBtn = setupNewControl("BUTTON", "Back", WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON, setupWidth-320, 468, 86, 32, ID_SETUP_BACK)
	setupNextBtn = setupNewControl("BUTTON", "Next", WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_DEFPUSHBUTTON, setupWidth-225, 468, 86, 32, ID_SETUP_NEXT)
	setupCancelBtn = setupNewControl("BUTTON", "Cancel", WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON, setupWidth-130, 468, 86, 32, ID_SETUP_CANCEL)
}

func setupAllPageControls() []uintptr {
	return []uintptr{setupWelcomeText, setupLicenseEdit, setupAcceptCheck, setupPathEdit, setupBrowseBtn, setupPathHint, setupOptionsText, setupDesktopCheck, setupStartCheck, setupTaskbarCheck, setupOptionsHint, setupReadyText, setupProgressText, setupProgress, setupCompleteText, setupLaunchCheck}
}
func setupHidePages() {
	for _, h := range setupAllPageControls() {
		setupShow(h, false)
	}
}
func setupPageTitle() string {
	return []string{"Welcome", "License Agreement", "Installation Folder", "Windows Integration", "Ready to Install", "Installing", "Installation Complete"}[setupPage]
}
func setupUpdateReady() {
	path := strings.TrimSpace(setupGetText(setupPathEdit))
	if path == "" {
		path = setupDefaultDir()
	}
	opts := []string{}
	if setupChecked(setupDesktopCheck) {
		opts = append(opts, "Desktop shortcut")
	}
	if setupChecked(setupStartCheck) {
		opts = append(opts, "Start Menu shortcut")
	}
	if setupChecked(setupTaskbarCheck) {
		opts = append(opts, "Windows taskbar pin request")
	}
	if len(opts) == 0 {
		opts = append(opts, "No shortcuts")
	}
	runtimeState := "Microsoft WebView2 Runtime detected."
	if findRuntimeDLL() == "" {
		runtimeState = "Microsoft WebView2 Runtime was not detected. Triplem VIP will direct the user to Microsoft's official runtime page on first launch."
	}
	setupSetText(setupReadyText, fmt.Sprintf("Setup is ready to install Triplem VIP.\r\n\r\nInstallation folder\r\n%s\r\n\r\nSelected integration\r\n• %s\r\n\r\nMicrosoft runtime\r\n%s", path, strings.Join(opts, "\r\n• "), runtimeState))
}
func setupShowPage(n int) {
	setupPage = n
	setupHidePages()
	setupEnable(setupBackBtn, n > 0 && n < 5)
	setupShow(setupCancelBtn, n < 6)
	setupShow(setupNextBtn, true)
	switch n {
	case 0:
		setupShow(setupWelcomeText, true)
		setupSetText(setupNextBtn, "Next")
		setupEnable(setupNextBtn, true)
	case 1:
		setupShow(setupLicenseEdit, true)
		setupShow(setupAcceptCheck, true)
		setupSetText(setupNextBtn, "Next")
		setupEnable(setupNextBtn, setupChecked(setupAcceptCheck))
	case 2:
		setupShow(setupPathEdit, true)
		setupShow(setupBrowseBtn, true)
		setupShow(setupPathHint, true)
		setupSetText(setupNextBtn, "Next")
		setupEnable(setupNextBtn, true)
	case 3:
		setupShow(setupOptionsText, true)
		setupShow(setupDesktopCheck, true)
		setupShow(setupStartCheck, true)
		setupShow(setupTaskbarCheck, true)
		setupShow(setupOptionsHint, true)
		setupSetText(setupNextBtn, "Next")
		setupEnable(setupNextBtn, true)
	case 4:
		setupUpdateReady()
		setupShow(setupReadyText, true)
		setupSetText(setupNextBtn, "Install")
		setupEnable(setupNextBtn, true)
	case 5:
		setupShow(setupProgressText, true)
		setupShow(setupProgress, true)
		setupSetText(setupNextBtn, "Installing…")
		setupEnable(setupNextBtn, false)
		setupEnable(setupBackBtn, false)
		setupEnable(setupCancelBtn, false)
	case 6:
		setupShow(setupCompleteText, true)
		setupShow(setupLaunchCheck, true)
		setupSetText(setupNextBtn, "Finish")
		setupEnable(setupNextBtn, true)
		setupShow(setupBackBtn, false)
		setupShow(setupCancelBtn, false)
	}
	procInvalidateRect.Call(setupHwnd, 0, 1)
}

func setupSetProgress(pos int, text string) {
	procSendMessageW.Call(setupProgress, PBM_SETPOS, uintptr(pos), 0)
	setupSetText(setupProgressText, text)
}

func copyInstallerAsApp(dest string) error {
	if len(embeddedTriplemApp) < 500000 {
		return fmt.Errorf("embedded application payload is incomplete")
	}
	if expectedPayloadSHA256 != "" {
		sum := fmt.Sprintf("%x", sha256.Sum256(embeddedTriplemApp))
		if !strings.EqualFold(sum, expectedPayloadSHA256) {
			return fmt.Errorf("embedded application integrity check failed")
		}
	}
	tmp := dest + ".installing"
	_ = os.Remove(tmp)
	if err := os.WriteFile(tmp, embeddedTriplemApp, 0755); err != nil {
		return fmt.Errorf("could not write application payload: %w", err)
	}
	written, err := os.ReadFile(tmp)
	if err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("could not verify installed application: %w", err)
	}
	if sha256.Sum256(written) != sha256.Sum256(embeddedTriplemApp) {
		_ = os.Remove(tmp)
		return fmt.Errorf("installed application verification failed")
	}
	_ = os.Remove(dest)
	if err := os.Rename(tmp, dest); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("could not activate installed application: %w", err)
	}
	return nil
}

func setupLogPath() string {
	base := os.Getenv("TEMP")
	if base == "" {
		base = os.TempDir()
	}
	return filepath.Join(base, "TriplemVIP-Setup.log")
}

func setupLog(line string) {
	f, err := os.OpenFile(setupLogPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s %s\r\n", time.Now().Format(time.RFC3339), line)
}

func setupInstallNow() error {
	setupLog("installation started")
	dest := strings.TrimSpace(setupGetText(setupPathEdit))
	if dest == "" {
		dest = setupDefaultDir()
	}
	setupLog("destination: " + dest)
	setupSetProgress(8, "Creating installation folder…")
	if err := os.MkdirAll(dest, 0755); err != nil {
		return fmt.Errorf("cannot create installation folder: %w", err)
	}
	exePath := filepath.Join(dest, "TriplemVIP.exe")
	setupSetProgress(25, "Installing Triplem VIP…")
	if err := copyInstallerAsApp(exePath); err != nil {
		setupLog("payload failed: " + err.Error())
		return err
	}
	setupLog("application payload installed")
	setupSetProgress(50, "Creating Windows shortcuts…")
	setupLog("creating shortcuts")
	desktop := knownFolder(&folderDesktop)
	programs := knownFolder(&folderPrograms)
	desktopLink := ""
	if desktop != "" {
		desktopLink = filepath.Join(desktop, "Triplem VIP.lnk")
	}
	startLink := ""
	if programs != "" {
		startLink = filepath.Join(programs, "Triplem VIP.lnk")
	}
	if setupChecked(setupDesktopCheck) && desktopLink != "" {
		if err := createWindowsShortcut(desktopLink, exePath, dest, exePath); err != nil {
			return err
		}
	} else if desktopLink != "" {
		_ = os.Remove(desktopLink)
	}
	needStart := setupChecked(setupStartCheck) || setupChecked(setupTaskbarCheck)
	if needStart && startLink != "" {
		if err := createWindowsShortcut(startLink, exePath, dest, exePath); err != nil {
			return err
		}
	} else if startLink != "" {
		_ = os.Remove(startLink)
	}
	setupLog("shortcuts complete")
	setupSetProgress(72, "Registering with Windows…")
	if err := registerUninstall(dest, exePath, exePath); err != nil {
		setupLog("registration failed: " + err.Error())
		return err
	}
	setupLog("Windows registration complete")
	setupTaskbarRequested = setupChecked(setupTaskbarCheck)
	if setupTaskbarRequested {
		p := pinRequestFile()
		if p != "" {
			_ = os.MkdirAll(filepath.Dir(p), 0700)
			_ = os.WriteFile(p, []byte("requested by setup\n"), 0600)
		}
	}
	setupSetProgress(100, "Installation complete.")
	setupInstalledExe = exePath
	setupInstallOK = true
	setupLog("installation completed successfully")
	return nil
}

func setupNext() {
	defer func() {
		if r := recover(); r != nil {
			setupLog(fmt.Sprintf("installer panic: %v", r))
			messageBox("Triplem VIP Setup", "Setup encountered an unexpected installation error. No Windows security settings were changed.\r\n\r\nDiagnostic log: "+setupLogPath(), MB_OK|MB_ICONERROR)
			setupShowPage(4)
		}
	}()
	switch setupPage {
	case 0:
		setupShowPage(1)
	case 1:
		if setupChecked(setupAcceptCheck) {
			setupShowPage(2)
		}
	case 2:
		if strings.TrimSpace(setupGetText(setupPathEdit)) == "" {
			messageBox("Triplem VIP Setup", "Choose a valid installation folder.", MB_OK|MB_ICONERROR)
			return
		}
		setupShowPage(3)
	case 3:
		setupShowPage(4)
	case 4:
		setupShowPage(5)
		if err := setupInstallNow(); err != nil {
			setupLog("installation error: " + err.Error())
			messageBox("Triplem VIP Setup", "Installation could not be completed.\r\n\r\n"+err.Error()+"\r\n\r\nDiagnostic log: "+setupLogPath(), MB_OK|MB_ICONERROR)
			setupShowPage(4)
			return
		}
		msg := "Triplem VIP has been installed successfully.\r\n\r\nThe native application and your selected Windows integrations have been installed. Triplem VIP does not disable or bypass Windows security controls."
		if setupTaskbarRequested {
			msg += "\r\n\r\nTriplem VIP will open when you finish Setup so Windows can display its own taskbar pin confirmation."
		}
		setupSetText(setupCompleteText, msg)
		setupShowPage(6)
	case 6:
		launch := setupInstallOK && (setupChecked(setupLaunchCheck) || setupTaskbarRequested)
		if launch && setupInstalledExe != "" {
			cmd := execCommandNoShell(setupInstalledExe)
			if err := cmd.Start(); err != nil {
				setupLog("launch after setup failed: " + err.Error())
				messageBox("Triplem VIP Setup", "Triplem VIP was installed, but Windows could not launch it automatically.\r\n\r\n"+err.Error()+"\r\n\r\nYou can open it from the Desktop or Start Menu shortcut.", MB_OK|MB_ICONERROR)
				return
			}
			setupLog("installed application launched")
		}
		procDestroyWindow.Call(setupHwnd)
	}
}
func setupBack() {
	if setupPage > 0 && setupPage < 5 {
		setupShowPage(setupPage - 1)
	}
}

// execCommandNoShell starts a directly addressed executable. It deliberately never
// invokes cmd.exe, PowerShell, WScript, or another command interpreter.
func execCommandNoShell(path string) *osExecCmd { return newOsExecCmd(path) }

// Lightweight wrapper declarations are implemented below using CreateProcessW so
// the installer does not depend on a shell or script host.
type osExecCmd struct{ path string }

func newOsExecCmd(path string) *osExecCmd { return &osExecCmd{path: path} }
func (c *osExecCmd) Start() error {
	var si startupInfo
	si.Cb = uint32(unsafe.Sizeof(si))
	var pi processInformation
	app := utf16Ptr(c.path)
	cmd, _ := syscall.UTF16FromString(`"` + c.path + `"`)
	work := utf16Ptr(filepath.Dir(c.path))
	r, _, e := procCreateProcessW.Call(uintptr(unsafe.Pointer(app)), uintptr(unsafe.Pointer(&cmd[0])), 0, 0, 0, 0, 0, uintptr(unsafe.Pointer(work)), uintptr(unsafe.Pointer(&si)), uintptr(unsafe.Pointer(&pi)))
	if r == 0 {
		return e
	}
	procCloseHandle.Call(uintptr(pi.HProcess))
	procCloseHandle.Call(uintptr(pi.HThread))
	return nil
}

type startupInfo struct {
	Cb                                                          uint32
	Reserved                                                    *uint16
	Desktop                                                     *uint16
	Title                                                       *uint16
	X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute uint32
	Flags                                                       uint32
	ShowWindow                                                  uint16
	Reserved2                                                   uint16
	Reserved2Ptr                                                *byte
	StdInput, StdOutput, StdError                               syscall.Handle
}
type processInformation struct {
	HProcess, HThread   syscall.Handle
	ProcessId, ThreadId uint32
}

var procCreateProcessW = kernel32.NewProc("CreateProcessW")
var procCloseHandle = kernel32.NewProc("CloseHandle")

func setupPaint(hwnd uintptr) {
	var ps setupPaintStruct
	hdc, _, _ := procBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	if hdc == 0 {
		return
	}
	defer procEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	left := rect{0, 0, setupLeft, setupHeight}
	right := rect{setupLeft, 0, setupWidth, setupHeight}
	procFillRect.Call(hdc, uintptr(unsafe.Pointer(&right)), setupWhiteBrush)
	procFillRect.Call(hdc, uintptr(unsafe.Pointer(&left)), setupBrandBrush)
	procSetBkMode.Call(hdc, 1)
	// Brand icon and label.
	if setupIcon != 0 {
		procDrawIconEx.Call(hdc, 54, 36, setupIcon, 82, 82, 0, 0, 3)
	}
	procSetTextColor.Call(hdc, 0x00FFFFFF)
	old, _, _ := procSelectObject.Call(hdc, setupFontTitle)
	r := rect{24, 122, 186, 162}
	txt := utf16Ptr("Triplem VIP")
	procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(txt)), uintptr(^uint32(0)), uintptr(unsafe.Pointer(&r)), 0x00000001|0x00000004|0x00000020)
	procSelectObject.Call(hdc, old)
	procSetTextColor.Call(hdc, 0x00D7DEE8)
	old, _, _ = procSelectObject.Call(hdc, setupFontSmall)
	steps := []string{"Welcome", "License", "Location", "Options", "Ready", "Install", "Complete"}
	y := 190
	for i, label := range steps {
		prefix := "○  "
		if i < setupPage {
			prefix = "✓  "
		}
		if i == setupPage {
			prefix = "●  "
		}
		rr := rect{30, int32(y), 190, int32(y + 24)}
		s := utf16Ptr(prefix + label)
		procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(s)), uintptr(^uint32(0)), uintptr(unsafe.Pointer(&rr)), 0x00000000|0x00000020)
		y += 34
	}
	procSelectObject.Call(hdc, old)
	procSetTextColor.Call(hdc, 0x00201A12)
	old, _, _ = procSelectObject.Call(hdc, setupFontTitle)
	titleRect := rect{setupLeft + 30, 34, setupWidth - 35, 75}
	title := utf16Ptr(setupPageTitle())
	procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(title)), uintptr(^uint32(0)), uintptr(unsafe.Pointer(&titleRect)), 0x00000000|0x00000020)
	procSelectObject.Call(hdc, old)
	procSetTextColor.Call(hdc, 0x00746B60)
	old, _, _ = procSelectObject.Call(hdc, setupFontSmall)
	subRect := rect{setupLeft + 31, 78, setupWidth - 35, 102}
	sub := utf16Ptr("Secure Windows client for your live Triplem VIP workspace")
	procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(sub)), uintptr(^uint32(0)), uintptr(unsafe.Pointer(&subRect)), 0x00000000|0x00000020)
	procSelectObject.Call(hdc, old)
}

func setupWndProc(hwnd uintptr, message uint32, wParam, lParam uintptr) uintptr {
	switch message {
	case WM_PAINT:
		setupPaint(hwnd)
		return 0
	case WM_CTLCOLORSTATIC, WM_CTLCOLORBTN:
		procSetTextColor.Call(wParam, 0x00201A12)
		procSetBkMode.Call(wParam, 1)
		return setupWhiteBrush
	case WM_CTLCOLOREDIT:
		procSetTextColor.Call(wParam, 0x00201A12)
		procSetBkColor.Call(wParam, 0x00FFFFFF)
		return setupWhiteBrush
	case WM_COMMAND:
		switch int(setupLoword(wParam)) {
		case ID_SETUP_NEXT:
			setupNext()
			return 0
		case ID_SETUP_BACK:
			setupBack()
			return 0
		case ID_SETUP_CANCEL:
			procDestroyWindow.Call(hwnd)
			return 0
		case ID_SETUP_ACCEPT:
			if setupPage == 1 {
				setupEnable(setupNextBtn, setupChecked(setupAcceptCheck))
			}
			return 0
		case ID_SETUP_BROWSE:
			setupBrowseFolder()
			return 0
		case ID_SETUP_TASKBAR:
			if setupChecked(setupTaskbarCheck) {
				setupSetChecked(setupStartCheck, true)
			}
			return 0
		}
	case WM_CLOSE:
		procDestroyWindow.Call(hwnd)
		return 0
	case WM_DESTROY:
		procPostQuitMessage.Call(0)
		return 0
	}
	r, _, _ := procDefWindowProcW.Call(hwnd, uintptr(message), wParam, lParam)
	return r
}

func setupLoadIcon() uintptr {
	hinst, _, _ := procGetModuleHandleW.Call(0)
	h, _, _ := procLoadImageW.Call(hinst, 1, IMAGE_ICON, 96, 96, 0)
	return h
}

func runSetupWizard() {
	runtime.LockOSThread()
	procCoInitializeEx.Call(0, COINIT_APARTMENTTHREADED)
	defer procCoUninitialize.Call()
	procInitCommonControls.Call()
	setupIcon = setupLoadIcon()
	hinst, _, _ := procGetModuleHandleW.Call(0)
	cursor, _, _ := procLoadCursorW.Call(0, IDC_ARROW)
	class := utf16Ptr("TriplemVIP.SafeSetup")
	wc := wndClassExW{CbSize: uint32(unsafe.Sizeof(wndClassExW{})), Style: CS_HREDRAW | CS_VREDRAW, LpfnWndProc: syscall.NewCallback(setupWndProc), HInstance: syscall.Handle(hinst), HIcon: syscall.Handle(setupIcon), HCursor: syscall.Handle(cursor), HbrBackground: syscall.Handle(COLOR_WINDOW + 1), LpszClassName: class, HIconSm: syscall.Handle(setupIcon)}
	atom, _, _ := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	if atom == 0 {
		messageBox("Triplem VIP Setup", "Setup could not initialize its Windows interface.", MB_OK|MB_ICONERROR)
		return
	}
	hwnd, _, _ := procCreateWindowExW.Call(0, uintptr(unsafe.Pointer(class)), uintptr(unsafe.Pointer(utf16Ptr("Triplem VIP Setup"))), WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX, CW_USEDEFAULT, CW_USEDEFAULT, setupWidth, setupHeight, 0, 0, hinst, 0)
	if hwnd == 0 {
		return
	}
	setupHwnd = hwnd
	if setupIcon != 0 {
		procSendMessageW.Call(hwnd, WM_SETICON, ICON_BIG, setupIcon)
		procSendMessageW.Call(hwnd, WM_SETICON, ICON_SMALL, setupIcon)
	}
	// Windows 11 rounded corners where supported.
	corner := uint32(2)
	procDwmSetWindowAttribute.Call(hwnd, 33, uintptr(unsafe.Pointer(&corner)), 4)
	sw, _, _ := procGetSystemMetrics.Call(0)
	sh, _, _ := procGetSystemMetrics.Call(1)
	x := (int32(sw) - setupWidth) / 2
	y := (int32(sh) - setupHeight) / 2
	procSetWindowPos.Call(hwnd, 0, uintptr(x), uintptr(y), setupWidth, setupHeight, 0x0004)
	setupCreateControls()
	setupShowPage(0)
	procShowWindow.Call(hwnd, SW_SHOW)
	procUpdateWindow.Call(hwnd)
	messageLoop()
	if setupBrandBrush != 0 {
		procDeleteObject.Call(setupBrandBrush)
	}
	if setupWhiteBrush != 0 {
		procDeleteObject.Call(setupWhiteBrush)
	}
}

func main() { runSetupWizard() }
