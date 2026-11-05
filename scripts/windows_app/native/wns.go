//go:build windows

package main

import (
	"crypto/rand"
	"encoding/hex"
	"syscall"
	"time"
	"unsafe"
)

// Notifications while Triplem VIP is closed - Microsoft Store version (3.6).
//
// The Store app asks Windows for a push channel (Windows Push Notification
// Services). The page registers that channel for the signed-in account; the
// Triplem VIP server then sends a Windows notification through WNS when there
// is no running app to show it. While the app IS running, incoming push
// notifications are cancelled here and the app shows its own (richer,
// de-duplicated) notification instead, so nothing ever appears twice.
// Setup installs have no package identity and keep using the tray app.

var (
	iidPushChannelManagerStatics = guid{0x8baf9b65, 0x77a1, 0x4588, [8]byte{0xbd, 0x19, 0x86, 0x15, 0x29, 0xa9, 0xdc, 0xf0}}
	// TypedEventHandler<PushNotificationChannel, PushNotificationReceivedEventArgs>
	// (WinRT parameterized interface id, computed from its signature).
	iidPushReceivedHandler = guid{0x55fa217d, 0x1fc3, 0x5863, [8]byte{0xb9, 0x80, 0x70, 0x94, 0xd4, 0x37, 0x96, 0x94}}
	iidIUnknown            = guid{0x00000000, 0x0000, 0x0000, [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIAgileObject        = guid{0x94ea2b94, 0xe9cc, 0x49e0, [8]byte{0xc0, 0xff, 0xee, 0x64, 0xca, 0x8f, 0x5b, 0x90}}

	procWindowsGetStringRawBuffer = combase.NewProc("WindowsGetStringRawBuffer")
)

const (
	pcmCreateForApplicationAsync = 6
	channelURI                   = 6
	channelExpiration            = 7
	channelClose                 = 8
	channelAddReceived           = 9
	pushArgsSetCancel            = 6
	wnsPollTimerID               = 0x54564972
	ticksUnixEpoch               = 116444736000000000
)

var (
	wnsOperation   uintptr
	wnsChannel     uintptr
	wnsStarted     time.Time
	wnsInfo        = map[string]string{}
	pushHandlerObj strictHandler
	pushHandlerVt  strictHandlerVtbl
)

// strictHandler is a delegate that only answers QueryInterface for IUnknown,
// IAgileObject and its own delegate interface. (Push events arrive on a
// Windows thread, so the object must never claim interfaces it does not
// implement, such as IMarshal.)
type strictHandlerVtbl struct{ QueryInterface, AddRef, Release, Invoke uintptr }
type strictHandler struct{ vtbl *strictHandlerVtbl }

func guidEqual(p uintptr, g *guid) bool {
	if p == 0 {
		return false
	}
	return *(*guid)(unsafe.Pointer(p)) == *g
}

func strictQueryInterface(this, riid, out uintptr) uintptr {
	if out == 0 {
		return 0x80004003 // E_POINTER
	}
	if guidEqual(riid, &iidIUnknown) || guidEqual(riid, &iidIAgileObject) || guidEqual(riid, &iidPushReceivedHandler) {
		*(*uintptr)(unsafe.Pointer(out)) = this
		return 0
	}
	*(*uintptr)(unsafe.Pointer(out)) = 0
	return 0x80004002 // E_NOINTERFACE
}

func onPushReceived(this, sender, args uintptr) uintptr {
	if args != 0 {
		vcall(args, pushArgsSetCancel, 1) // the running app shows its own notification
	}
	dispatchUI(func() {
		if pageReady {
			postToPage(map[string]interface{}{"type": "tick", "visible": isWindowShown(), "force": true})
		}
	})
	return 0
}

func ensureDeviceID() string {
	if settings.DeviceID == "" {
		b := make([]byte, 16)
		if _, err := rand.Read(b); err == nil {
			settings.DeviceID = hex.EncodeToString(b)
			saveSettings()
		}
	}
	return settings.DeviceID
}

// startPushChannel requests the channel asynchronously (Store version only).
func startPushChannel() {
	defer recoverOptional("store push channel")
	if !isPackaged() || safeStart || wnsOperation != 0 {
		return
	}
	if hr, _, _ := procRoInitialize.Call(0); int32(hr) < 0 && uint32(hr) != 0x80010106 {
		return
	}
	statics := activationFactory("Windows.Networking.PushNotifications.PushNotificationChannelManager", &iidPushChannelManagerStatics)
	if statics == 0 {
		startupLog("store push: channel manager unavailable")
		return
	}
	defer releaseCOM(statics)
	var op uintptr
	if !hrOK(vcall(statics, pcmCreateForApplicationAsync, uintptr(unsafe.Pointer(&op)))) || op == 0 {
		startupLog("store push: channel request failed")
		return
	}
	wnsOperation = op
	wnsStarted = time.Now()
	procSetTimer.Call(mainHwnd, wnsPollTimerID, 500, 0)
}

func pollPushChannel() {
	defer recoverOptional("store push channel")
	if wnsOperation == 0 {
		procKillTimer.Call(mainHwnd, wnsPollTimerID)
		return
	}
	info := comQuery(wnsOperation, &iidAsyncInfoNative)
	if info == 0 {
		return
	}
	var status int32
	vcall(info, asyncInfoStatus, uintptr(unsafe.Pointer(&status)))
	releaseCOM(info)
	if status == 0 && time.Since(wnsStarted) < 60*time.Second {
		return // still running
	}
	procKillTimer.Call(mainHwnd, wnsPollTimerID)
	op := wnsOperation
	wnsOperation = 0
	defer releaseCOM(op)
	if status != 1 {
		startupLog("store push: channel unavailable (no network or Store identity)")
		return
	}
	var ch uintptr
	if !hrOK(vcall(op, asyncOpGetResults, uintptr(unsafe.Pointer(&ch)))) || ch == 0 {
		return
	}
	if wnsChannel != 0 {
		releaseCOM(wnsChannel)
	}
	wnsChannel = ch // kept for the life of the app so the event stays registered
	var h uintptr
	vcall(ch, channelURI, uintptr(unsafe.Pointer(&h)))
	uri := hstringToString(h)
	procWindowsDeleteString.Call(h)
	var expires int64
	vcall(ch, channelExpiration, uintptr(unsafe.Pointer(&expires)))
	if !isWNSChannel(uri) {
		startupLog("store push: unexpected channel address ignored")
		return
	}
	pushHandlerVt = strictHandlerVtbl{
		syscall.NewCallback(strictQueryInterface),
		syscall.NewCallback(addRef),
		syscall.NewCallback(release),
		syscall.NewCallback(onPushReceived),
	}
	pushHandlerObj.vtbl = &pushHandlerVt
	var token int64
	vcall(ch, channelAddReceived, uintptr(unsafe.Pointer(&pushHandlerObj)), uintptr(unsafe.Pointer(&token)))
	exp := ""
	if expires > ticksUnixEpoch {
		exp = time.Unix((expires-ticksUnixEpoch)/10000000, 0).UTC().Format(time.RFC3339)
	}
	wnsInfo = map[string]string{"type": "push-channel", "uri": uri, "expires": exp, "deviceId": ensureDeviceID()}
	startupLog("store push: channel ready")
	sendPushChannelToPage()
}

// closePushChannel invalidates this device's channel at Microsoft (sign-out,
// or Windows notifications turned off): anything still sent to it is dropped
// by WNS and the server removes the row on its next attempt.
func closePushChannel() {
	defer recoverOptional("store push channel")
	if wnsChannel != 0 {
		vcall(wnsChannel, channelClose)
		releaseCOM(wnsChannel)
		wnsChannel = 0
	}
	wnsInfo = map[string]string{}
}

func sendPushChannelToPage() {
	if len(wnsInfo) > 0 && pageReady {
		postToPage(wnsInfo)
	}
}

func hstringToString(h uintptr) string {
	if h == 0 {
		return ""
	}
	var n uint32
	p, _, _ := procWindowsGetStringRawBuffer.Call(h, uintptr(unsafe.Pointer(&n)))
	if p == 0 || n == 0 {
		return ""
	}
	return syscall.UTF16ToString(unsafe.Slice((*uint16)(unsafe.Pointer(p)), n))
}
