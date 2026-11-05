//go:build windows

package main

import (
	"os"
	"time"
	"unsafe"
)

// "Start with Windows".
//   * Direct (Setup) install: HKCU\...\Run value with --background. Windows'
//     own Startup Apps switch (StartupApproved) is respected and reported.
//   * Microsoft Store (MSIX) install: the manifest declares a StartupTask
//     (TaskId TriplemVIPStartup); it is enabled/disabled through the WinRT
//     Windows.ApplicationModel.StartupTask API, which is the only supported
//     way for packaged apps.

const (
	runKeyPath          = `Software\Microsoft\Windows\CurrentVersion\Run`
	startupApprovedPath = `Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`
	runValueName        = "Triplem VIP"
	startupTaskID       = "TriplemVIPStartup"
)

var (
	iidStartupTaskStatics = guid{0xee5b60bd, 0xa148, 0x41a7, [8]byte{0xb2, 0x6e, 0xe8, 0xb8, 0x8a, 0x1e, 0x62, 0xf8}}
	iidAppInstanceStatics = guid{0x9d11e77f, 0x9ea6, 0x47af, [8]byte{0xa6, 0xec, 0x46, 0x78, 0x4c, 0x5b, 0xa2, 0x54}}
	iidAsyncInfoNative    = guid{0x00000036, 0x0000, 0x0000, [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
)

const (
	startupStatsGetAsync     = 7
	startupTaskRequestEnable = 6
	startupTaskDisable       = 7
	startupTaskState         = 8
	asyncInfoStatus          = 7
	asyncOpGetResults        = 8
	appInstGetActivatedArgs  = 7
	activatedArgsKind        = 6
	activationKindStartup    = 1020

	startupStateEnabled         = 2
	startupStateEnabledByPolicy = 4
)

func autostartManagedByWindows() bool { return isPackaged() }

// packagedStartupCache avoids a WinRT round trip every time the menu opens.
var packagedStartupCache = -1

func startWithWindowsEnabled() bool {
	if isPackaged() {
		if packagedStartupCache < 0 {
			st, ok := packagedStartupState()
			packagedStartupCache = 0
			if ok && (st == startupStateEnabled || st == startupStateEnabledByPolicy) {
				packagedStartupCache = 1
			}
		}
		return packagedStartupCache == 1
	}
	if regReadBytes(runKeyPath, runValueName) == nil {
		return false
	}
	// Disabled in Task Manager / Settings > Apps > Startup: first byte 0x03.
	if b := regReadBytes(startupApprovedPath, runValueName); len(b) > 0 && b[0]&1 == 1 {
		return false
	}
	return true
}

func setStartWithWindows(on bool) {
	if isPackaged() {
		setPackagedStartup(on)
		packagedStartupCache = -1
		return
	}
	if !on {
		regDeleteValue(runKeyPath, runValueName)
		return
	}
	exe, err := os.Executable()
	if err != nil {
		return
	}
	regSetStringValue(runKeyPath, runValueName, `"`+exe+`" --background`)
	// Clear a previous "disabled" mark so the user's explicit choice applies.
	regDeleteValue(startupApprovedPath, runValueName)
}

// removeStartupRegistration is used by the uninstaller.
func removeStartupRegistration() {
	regDeleteValue(runKeyPath, runValueName)
	regDeleteValue(startupApprovedPath, runValueName)
}

// ---- WinRT helpers (packaged only) -------------------------------------------------

func withHString(s string, f func(h uintptr)) bool {
	u := utf16Bytes(s) // never empty, even if s contains a NUL
	var h uintptr
	r, _, _ := procWindowsCreateString.Call(uintptr(unsafe.Pointer(&u[0])), uintptr(len(u)-1), uintptr(unsafe.Pointer(&h)))
	if !hrOK(r) || h == 0 {
		return false
	}
	defer procWindowsDeleteString.Call(h)
	f(h)
	return true
}

func activationFactory(class string, iid *guid) uintptr {
	var out uintptr
	withHString(class, func(h uintptr) {
		procRoGetActivationFactory.Call(h, uintptr(unsafe.Pointer(iid)), uintptr(unsafe.Pointer(&out)))
	})
	return out
}

// waitAsync waits (pumping messages) for a WinRT async operation and returns
// its completed status.
func waitAsync(op uintptr, timeout time.Duration) bool {
	info := comQuery(op, &iidAsyncInfoNative)
	if info == 0 {
		return false
	}
	defer releaseCOM(info)
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		var status int32
		if !hrOK(vcall(info, asyncInfoStatus, uintptr(unsafe.Pointer(&status)))) {
			return false
		}
		if status == 1 { // Completed
			return true
		}
		if status > 1 { // Canceled / Error
			return false
		}
		pumpMessagesBriefly()
		time.Sleep(15 * time.Millisecond)
	}
	return false
}

var procPeekMessageW = user32.NewProc("PeekMessageW")

func pumpMessagesBriefly() {
	var m msg
	for i := 0; i < 20; i++ {
		r, _, _ := procPeekMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0, 1) // PM_REMOVE
		if r == 0 {
			return
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}
}

func withStartupTask(f func(task uintptr)) bool {
	if hr, _, _ := procRoInitialize.Call(0); int32(hr) < 0 && uint32(hr) != 0x80010106 { // RPC_E_CHANGED_MODE is fine (already STA)
		return false
	}
	statics := activationFactory("Windows.ApplicationModel.StartupTask", &iidStartupTaskStatics)
	if statics == 0 {
		return false
	}
	defer releaseCOM(statics)
	var op uintptr
	ok := withHString(startupTaskID, func(h uintptr) {
		vcall(statics, startupStatsGetAsync, h, uintptr(unsafe.Pointer(&op)))
	})
	if !ok || op == 0 {
		return false
	}
	defer releaseCOM(op)
	if !waitAsync(op, 5*time.Second) {
		return false
	}
	var task uintptr
	if !hrOK(vcall(op, asyncOpGetResults, uintptr(unsafe.Pointer(&task)))) || task == 0 {
		return false
	}
	defer releaseCOM(task)
	f(task)
	return true
}

func packagedStartupState() (int32, bool) {
	var st int32 = -1
	ok := withStartupTask(func(task uintptr) {
		vcall(task, startupTaskState, uintptr(unsafe.Pointer(&st)))
	})
	return st, ok && st >= 0
}

func setPackagedStartup(on bool) {
	withStartupTask(func(task uintptr) {
		if !on {
			vcall(task, startupTaskDisable)
			return
		}
		var op uintptr
		if hrOK(vcall(task, startupTaskRequestEnable, uintptr(unsafe.Pointer(&op)))) && op != 0 {
			waitAsync(op, 10*time.Second)
			var st int32
			vcall(op, asyncOpGetResults, uintptr(unsafe.Pointer(&st)))
			releaseCOM(op)
			if st == 1 { // DisabledByUser: only Windows Settings can re-enable it
				messageBox("Triplem VIP", "Start with Windows was turned off in Windows Settings.\n\nTo allow it, open Settings > Apps > Startup and switch Triplem VIP on.", MB_OK|MB_ICONINFORMATION)
			}
		}
	})
}

// launchedByStartupTask reports whether Windows started the packaged app at
// sign-in (StartupTask activation): the app then stays in the tray.
func launchedByStartupTask() bool {
	if !isPackaged() {
		return false
	}
	if hr, _, _ := procRoInitialize.Call(0); int32(hr) < 0 && uint32(hr) != 0x80010106 {
		return false
	}
	statics := activationFactory("Windows.ApplicationModel.AppInstance", &iidAppInstanceStatics)
	if statics == 0 {
		return false
	}
	defer releaseCOM(statics)
	var args uintptr
	if !hrOK(vcall(statics, appInstGetActivatedArgs, uintptr(unsafe.Pointer(&args)))) || args == 0 {
		return false
	}
	defer releaseCOM(args)
	var kind int32
	vcall(args, activatedArgsKind, uintptr(unsafe.Pointer(&kind)))
	return kind == activationKindStartup
}
