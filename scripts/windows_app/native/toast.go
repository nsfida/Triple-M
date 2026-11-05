//go:build windows

package main

import (
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"os"
	"path/filepath"
	"unsafe"
)

// Modern Windows notifications (3.6).
//
// Notifications use the Windows toast API (Windows.UI.Notifications), so they
// stay in the notification centre, show the Triplem VIP logo and can have
// buttons. Every click is a triplemvip:// link (protocol activation), so it
// works whether Triplem VIP is open, hidden in the tray or closed. Buttons
// that change something (Accept, Decline, Mark as read) carry a random token
// that only this running app knows; any other triplemvip:// link can only
// open a screen. If the toast API is unavailable the 3.5 tray notification is
// used instead, so a notification is never lost.

//go:embed toast-logo.png
var toastLogoPNG []byte

var (
	procRoActivateInstance = combase.NewProc("RoActivateInstance")

	iidToastManagerStatics = guid{0x50ac103f, 0xd235, 0x4598, [8]byte{0xbb, 0xef, 0x98, 0xfe, 0x4d, 0x1a, 0x3a, 0xd4}}
	iidToastFactory        = guid{0x04124b20, 0x82c6, 0x4229, [8]byte{0xb1, 0x09, 0xfd, 0x9e, 0xd4, 0x66, 0x2b, 0x53}}
	iidToastNotification2  = guid{0x9dfb9fd1, 0x143a, 0x490e, [8]byte{0x90, 0xbf, 0xb9, 0xfb, 0xa7, 0x13, 0x2d, 0xe7}}
	iidXmlDocumentIO       = guid{0x6cd0e74e, 0xee65, 0x4489, [8]byte{0x9e, 0xbf, 0xca, 0x43, 0xe8, 0x7b, 0xa6, 0x37}}
	iidXmlDocument         = guid{0xf7f3a506, 0x1e87, 0x42d6, [8]byte{0xbc, 0xfb, 0xb8, 0xc8, 0x09, 0xfa, 0x54, 0x94}}

	// processToken authorizes notification buttons for this app run only.
	processToken = newProcessToken()
	toastLogo    string
	toastReady   bool
)

// Vtable indices verified against Microsoft's Windows metadata (windows crate 0.58).
const (
	tmsCreateToastNotifier       = 6
	tmsCreateToastNotifierWithID = 7
	notifierShow                 = 6
	notifierSetting              = 8
	toastFactoryCreate           = 6
	toast2SetTag                 = 6
	toast2SetGroup               = 8
	xmlIOLoadXml                 = 6

	notificationSettingEnabled = 0
	toastGroup                 = "triplem"
)

func newProcessToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "" // no token: buttons simply open the related screen
	}
	return hex.EncodeToString(b)
}

// registerAppIdentity makes the unpackaged app known to Windows for
// notifications (display name and logo) and registers the triplemvip:// link
// handler. All values live under HKCU\Software\Classes and are removed by the
// uninstaller. Store installs get both from the package manifest instead.
func registerAppIdentity() {
	defer recoverOptional("app identity")
	toastLogo = filepath.Join(appDataDir(), "toast-logo.png")
	if b, err := os.ReadFile(toastLogo); err != nil || len(b) != len(toastLogoPNG) {
		if writeFileAtomic(toastLogo, toastLogoPNG) != nil {
			toastLogo = ""
		}
	}
	if isPackaged() {
		return
	}
	key := `Software\Classes\AppUserModelId\` + appUserModelID
	regSetStringValue(key, "DisplayName", "Triplem VIP")
	if toastLogo != "" {
		regSetStringValue(key, "IconUri", toastLogo)
	}
	regSetStringValue(key, "IconBackgroundColor", "FFFFFFFF")
	registerLinkProtocol()
}

func registerLinkProtocol() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	base := `Software\Classes\` + linkScheme
	regSetStringValue(base, "", "URL:Triplem VIP")
	regSetStringValue(base, "URL Protocol", "")
	regSetStringValue(base+`\DefaultIcon`, "", `"`+exe+`",0`)
	// --link makes the app ignore every other argument (no argument injection).
	regSetStringValue(base+`\shell\open\command`, "", `"`+exe+`" --link "%1"`)
}

func initToasts() {
	if hr, _, _ := procRoInitialize.Call(0); int32(hr) < 0 && uint32(hr) != 0x80010106 {
		return
	}
	toastReady = true
}

// showModernToast returns false only when the toast API itself failed, so the
// caller can fall back to the tray notification.
func showModernToast(title, body, target, id string, actions []toastAction, tag string) (shown bool) {
	defer func() {
		if r := recover(); r != nil {
			startupLog("modern notification failed; using tray notification")
			shown = false
		}
	}()
	if !toastReady || safeStart {
		return false
	}
	statics := activationFactory("Windows.UI.Notifications.ToastNotificationManager", &iidToastManagerStatics)
	if statics == 0 {
		return false
	}
	defer releaseCOM(statics)

	var notifier uintptr
	if isPackaged() {
		vcall(statics, tmsCreateToastNotifier, uintptr(unsafe.Pointer(&notifier)))
	} else {
		withHString(appUserModelID, func(h uintptr) {
			vcall(statics, tmsCreateToastNotifierWithID, h, uintptr(unsafe.Pointer(&notifier)))
		})
	}
	if notifier == 0 {
		return false
	}
	defer releaseCOM(notifier)
	var setting int32 = -1
	if hrOK(vcall(notifier, notifierSetting, uintptr(unsafe.Pointer(&setting)))) && setting != notificationSettingEnabled {
		// The user (or policy) turned Triplem VIP notifications off in Windows
		// Settings: respect that choice and show nothing.
		return true
	}

	doc := newXMLDocument(buildToastXML(title, body, target, id, actions, processToken, toastLogo))
	if doc == 0 {
		return false
	}
	defer releaseCOM(doc)
	factory := activationFactory("Windows.UI.Notifications.ToastNotification", &iidToastFactory)
	if factory == 0 {
		return false
	}
	defer releaseCOM(factory)
	var toast uintptr
	if !hrOK(vcall(factory, toastFactoryCreate, doc, uintptr(unsafe.Pointer(&toast)))) || toast == 0 {
		return false
	}
	defer releaseCOM(toast)
	if t2 := comQuery(toast, &iidToastNotification2); t2 != 0 {
		if tg := toastTag(tag); tg != "" {
			withHString(tg, func(h uintptr) { vcall(t2, toast2SetTag, h) })
			withHString(toastGroup, func(h uintptr) { vcall(t2, toast2SetGroup, h) })
		}
		releaseCOM(t2)
	}
	return hrOK(vcall(notifier, notifierShow, toast))
}

func newXMLDocument(xml string) uintptr {
	var inst uintptr
	withHString("Windows.Data.Xml.Dom.XmlDocument", func(h uintptr) {
		procRoActivateInstance.Call(h, uintptr(unsafe.Pointer(&inst)))
	})
	if inst == 0 {
		return 0
	}
	defer releaseCOM(inst)
	io := comQuery(inst, &iidXmlDocumentIO)
	if io == 0 {
		return 0
	}
	ok := false
	withHString(xml, func(h uintptr) { ok = hrOK(vcall(io, xmlIOLoadXml, h)) })
	releaseCOM(io)
	if !ok {
		return 0
	}
	return comQuery(inst, &iidXmlDocument)
}

// notify shows one notification: modern toast first, tray notification as fallback.
func notify(m bridgeMessage) {
	if showModernToast(m.Title, m.Body, m.Target, m.ID, m.Actions, m.Tag) {
		return
	}
	showToast(m.Title, m.Body, m.Target)
}

// ---- triplemvip:// links ---------------------------------------------------------------

var (
	pendingLink linkRequest
	justUpdated bool
)

// handleLink opens the app at a link's screen. Actions run only with this
// process's token (see authorizeLink).
func handleLink(l linkRequest) {
	if l.Target == "" {
		return
	}
	l = authorizeLink(l, processToken)
	showMainWindow()
	if pageReady && !offlineShown {
		postLinkToPage(l)
		return
	}
	pendingLink = l
}

func postLinkToPage(l linkRequest) {
	postToPage(map[string]string{"type": "open", "target": l.Target, "id": l.ID, "action": l.Action})
}

func removeAppIdentity() {
	regDeleteTree(`Software\Classes\AppUserModelId\` + appUserModelID)
	regDeleteTree(`Software\Classes\` + linkScheme)
}

func regDeleteTree(path string) {
	procRegDeleteTreeWNative.Call(hkeyCurrentUser, uintptr(unsafe.Pointer(utf16Ptr(path))))
}
