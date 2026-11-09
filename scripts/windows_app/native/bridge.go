//go:build windows

package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"strings"
	"time"
	"unsafe"
)

// WebView2 integration: settings, document-created script, the web-message
// bridge, navigation policy, permissions, crash recovery and the offline page.

//go:embed offline.html
var offlinePageHTML string

var (
	pageReady      bool
	pendingOpen    string
	offlineShown   bool
	lastAppURL     = triplemURL
	appStartedAt   = time.Now()
	nativeDedupe   = newRecentTags(400)
	hWebMessage    *comHandler
	hNavStarting   *comHandler
	hNavCompleted  *comHandler
	hNewWindow     *comHandler
	hPermission    *comHandler
	hProcessFailed *comHandler
	hScriptAdded   *comHandler
	hDownloadStart *comHandler
	hDownloadState *comHandler
	webView4       uintptr
	webView16      uintptr
)

func desktopInitScript() string {
	caps := []string{"notifications", "badge", "tray", "jumplist", "saveas", "print", "autostart", "offline", "placement",
		// 3.6
		"toasts", "links", "hotkey", "theme", "report", "dragdrop",
		// 3.7
		"appbar", "applock", "printplus", "recent", "shortcuts", "savememory", "traybadge", "offlineprep",
		// 3.8
		"backup", "appkeys",
		// 3.9
		"pdfview"}
	if updatesSupported() {
		caps = append(caps, "update")
	}
	if isPackaged() {
		caps = append(caps, "push")
	}
	if webView16 == 0 {
		caps = removeString(caps, "print")
	}
	if webView4 == 0 {
		caps = removeString(caps, "saveas")
	}
	if webView16 == 0 {
		caps = removeString(caps, "printplus")
	}
	if webView7 != 0 {
		caps = append(caps, "printpdf")
	}
	hotkeys := make([]map[string]string, 0, len(globalHotkeys))
	for _, h := range globalHotkeys {
		hotkeys = append(hotkeys, map[string]string{"target": h.Target, "keys": h.Label})
	}
	info := map[string]interface{}{
		"app":      "windows",
		"version":  appVersionNative,
		"arch":     runtimeArchFolder(runtime.GOARCH),
		"packaged": isPackaged(),
		"caps":     caps,
		"shortcut": quickAddShortcutTxt,
		"hotkeys":  hotkeys,
	}
	b, _ := json.Marshal(info)
	return `(function(){try{var d=JSON.parse(` + jsString(string(b)) + `);Object.freeze(d.caps);Object.defineProperty(window,"__TRIPLEM_DESKTOP__",{value:Object.freeze(d),configurable:false,writable:false,enumerable:false});}catch(e){}})();`
}

func removeString(list []string, s string) []string {
	out := list[:0]
	for _, v := range list {
		if v != s {
			out = append(out, v)
		}
	}
	return out
}

func jsString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// configureWebView runs once, right after the controller is created and before
// the first navigation.
func configureWebView(viewPtr uintptr) {
	var settingsPtr uintptr
	if hrOK(vcall(viewPtr, wvSettings, uintptr(unsafe.Pointer(&settingsPtr)))) && settingsPtr != 0 {
		vcall(settingsPtr, settingsSetIsStatusBarEnabled, 0)
		vcall(settingsPtr, settingsSetDevToolsEnabled, 0)
		vcall(settingsPtr, settingsSetHostObjects, 0)
		vcall(settingsPtr, settingsSetBuiltInErrorPage, 0) // our branded offline page replaces it
		releaseCOM(settingsPtr)
	}
	webView4 = comQuery(viewPtr, &iidCoreWebView2_4)
	webView16 = comQuery(viewPtr, &iidCoreWebView2_16)
	webView7 = comQuery(viewPtr, &iidCoreWebView2_7)

	hScriptAdded = newHandler(func(this, hr, id uintptr) uintptr { return 0 })
	hWebMessage = newHandler(onWebMessage)
	hNavStarting = newHandler(onNavigationStarting)
	hNavCompleted = newHandler(onNavigationCompleted)
	hNewWindow = newHandler(onNewWindowRequested)
	hPermission = newHandler(onPermissionRequested)
	hProcessFailed = newHandler(onProcessFailed)

	vcall(viewPtr, wvAddScriptOnDocumentCreated, uintptr(unsafe.Pointer(utf16Ptr(desktopInitScript()))), hScriptAdded.ptr())
	var token int64
	vcall(viewPtr, wvAddWebMessageReceived, hWebMessage.ptr(), uintptr(unsafe.Pointer(&token)))
	vcall(viewPtr, wvAddNavigationStarting, hNavStarting.ptr(), uintptr(unsafe.Pointer(&token)))
	vcall(viewPtr, wvAddNavigationCompleted, hNavCompleted.ptr(), uintptr(unsafe.Pointer(&token)))
	vcall(viewPtr, wvAddNewWindowRequested, hNewWindow.ptr(), uintptr(unsafe.Pointer(&token)))
	vcall(viewPtr, wvAddPermissionRequested, hPermission.ptr(), uintptr(unsafe.Pointer(&token)))
	vcall(viewPtr, wvAddProcessFailed, hProcessFailed.ptr(), uintptr(unsafe.Pointer(&token)))
	if webView4 != 0 {
		hDownloadStart = newHandler(onDownloadStarting)
		hDownloadState = newHandler(onDownloadStateChanged)
		vcall(webView4, wv4AddDownloadStarting, hDownloadStart.ptr(), uintptr(unsafe.Pointer(&token)))
	} else {
		startupLog("WebView2 runtime without ICoreWebView2_4: exports use the default download flow")
	}
	if webView16 == 0 {
		startupLog("WebView2 runtime without ICoreWebView2_16: printing uses the browser print preview")
	}
}

func webViewPtr() uintptr {
	if webView == nil {
		return 0
	}
	return uintptr(unsafe.Pointer(webView))
}

func navigateTo(url string) {
	if v := webViewPtr(); v != 0 {
		vcall(v, wvNavigate, uintptr(unsafe.Pointer(utf16Ptr(url))))
	}
}

// postToPage sends a JSON message to the page (window.chrome.webview "message").
func postToPage(v interface{}) {
	view := webViewPtr()
	if view == 0 || offlineShown {
		return
	}
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	vcall(view, wvPostWebMessageAsString, uintptr(unsafe.Pointer(utf16Ptr(string(b)))))
}

func sendSettingsToPage() {
	postToPage(map[string]interface{}{
		"type":             "settings",
		"notifications":    settings.Notifications,
		"closeToTray":      settings.CloseToTray,
		"startWithWindows": startWithWindowsEnabled(),
		"autostartManaged": autostartManagedByWindows(),
		// 3.6
		"autoUpdate":        settings.AutoUpdate,
		"updatesSupported":  updatesSupported(),
		"quickAddHotkey":    settings.QuickAddHotkey,
		"hotkeyUnavailable": hotkeyUnavailable,
		"safeStart":         safeStart,
		// 3.7
		"hotkeysUnavailable": unavailableHotkeyTargets(),
		"appLock":            settings.AppLock,
		"lockMinutes":        settings.LockMinutes,
		"lockHideDetails":    settings.LockHideDetails,
		"helloAvailable":     helloAvailable,
		"locked":             appLocked,
		"trayBadge":          settings.TrayBadge,
		"saveMemory":         settings.SaveMemory,
		"recentJumpList":     settings.RecentJumpList,
		"canPausePage":       canSuspendPage(true, settings.Notifications, isPackaged(), wnsChannel != 0),
		// 3.8
		"backup": backupSettingsForPage(),
	})
}

func requestOpenTarget(target string) {
	if !isOpenTarget(target) {
		return
	}
	if pageReady && !offlineShown {
		postToPage(map[string]string{"type": "open", "target": target})
		return
	}
	pendingOpen = target
}

func onWebMessage(this, sender, args uintptr) uintptr {
	source := getString(args, msgArgsSource)
	var p uintptr
	if !hrOK(vcall(args, msgArgsTryString, uintptr(unsafe.Pointer(&p)))) {
		return 0
	}
	raw := takeCoString(p)
	m, ok := parseBridgeMessage(source, raw)
	if !ok {
		return 0
	}
	// Handle outside the WebView2 event callback: some actions show dialogs
	// or wait for Windows (Save As, Start with Windows in the Store version).
	dispatchUI(func() { handleBridgeMessage(m) })
	return 0
}

func handleBridgeMessage(m bridgeMessage) {
	switch m.Cmd {
	case "ready":
		pageReady = true
		offlineShown = false
		sendSettingsToPage()
		if pendingOpen != "" {
			t := pendingOpen
			pendingOpen = ""
			postToPage(map[string]string{"type": "open", "target": t})
		}
		if pendingLink.Target != "" {
			l := pendingLink
			pendingLink = linkRequest{}
			postLinkToPage(l)
		}
		if justUpdated {
			justUpdated = false
			postToPage(map[string]string{"type": "updated", "version": appVersionNative})
		}
		if updatesSupported() {
			sendUpdateStateToPage()
		}
		sendPushChannelToPage()
		announceSafeStart()
		if appLocked {
			postToPage(map[string]interface{}{"type": "lock-state", "locked": true})
		}
	case "badge":
		updateUnreadBadge(m.Count)
	case "notify":
		if !settings.Notifications || nativeDedupe.seen(m.Tag) {
			return
		}
		if isWindowShown() && isForeground() && !appLocked {
			return // the user is looking at Triplem VIP: the in-app bell is enough
		}
		if appLocked && settings.LockHideDetails {
			// Locked: say that something arrived, not what it says.
			m.Title = "Triplem VIP"
			m.Body = "You have a new notification. Unlock Triplem VIP to see it."
			if m.Target == "messages" {
				m.Body = "You have a new message. Unlock Triplem VIP to read it."
			}
			m.Actions = nil
		}
		notify(m)
	case "settings-get":
		sendSettingsToPage()
	case "settings-set":
		if m.Key == "lockMinutes" {
			var n int
			if json.Unmarshal(m.Value, &n) == nil && validLockMinutes(n) {
				settings.LockMinutes = n
				saveSettings()
			}
			sendSettingsToPage()
			return
		}
		var v bool
		if json.Unmarshal(m.Value, &v) != nil {
			return
		}
		applySetting(m.Key, v)
		sendSettingsToPage()
	case "print", "print-system":
		showSystemPrintDialog()
	case "print-info":
		sendPrintInfo()
	case "print-run":
		runDirectPrint(m.Print)
	case "print-pdf":
		runPrintToPdf(m.Print)
	case "print-preview":
		runPrintPreview(m.Print)
	case "lock-now":
		lockApp("requested")
	case "unlock":
		if m.Kind == "signed-out" {
			pageSignedOutFromLock()
		}
	case "recent":
		setRecentRecords(m.Recent)
	case "status":
		if m.Online != nil {
			netOnline = *m.Online
		}
		netPending = m.Pending
		refreshTrayTooltip()
	case "download-open":
		openDownload(m.ID, false)
	case "download-show":
		openDownload(m.ID, true)
	case "file-read":
		readFileForViewer(m.ID)
	case "retry":
		retryConnection()
	case "show":
		showMainWindow()
	case "update-check":
		checkForUpdates(true)
	case "update-install":
		installStagedUpdate()
	case "theme":
		applyTitleBarTheme(m.Dark, m.Color)
	case "report":
		sendErrorReport()
	case "push-open":
		if wnsChannel == 0 && settings.Notifications {
			startPushChannel()
		} else {
			sendPushChannelToPage()
		}
	case "push-close":
		closePushChannel()
	// 3.8: Backup & Restore
	case "backup-schedule":
		if m.Backup != nil {
			setBackupSchedule(*m.Backup)
		}
	case "backup-folder":
		chooseBackupFolder()
	case "backup-open-folder":
		openBackupFolder()
	case "backup-now":
		if !backupBusy() {
			runBackupNow(false)
		}
	case "backup-expect":
		expectBackup(m.Name, m.Auto)
	case "backup-failed":
		backupFailed(m.Reason, m.Auto)
	}
}

func applySetting(key string, v bool) {
	switch key {
	case "notifications":
		settings.Notifications = v
		if !v {
			closePushChannel() // also no Store notifications while the app is closed
		}
	case "closeToTray":
		settings.CloseToTray = v
	case "startWithWindows":
		setStartWithWindows(v)
	case "autoUpdate":
		settings.AutoUpdate = v
		if v {
			checkForUpdates(false)
		}
	case "quickAddHotkey":
		settings.QuickAddHotkey = v
		applyQuickAddHotkey()
	// 3.7
	case "appLock":
		// Turning the lock on or off always needs Windows Hello first; the
		// result arrives as "lock-result" and the setting changes only then.
		if v != settings.AppLock {
			if v {
				requestHello("enable")
			} else {
				requestHello("disable")
			}
		}
		return
	case "lockHideDetails":
		settings.LockHideDetails = v
	case "trayBadge":
		settings.TrayBadge = v
		refreshTrayIcon()
	case "saveMemory":
		settings.SaveMemory = v
		if !v {
			onWindowShownForMemory()
		}
	case "recentJumpList":
		settings.RecentJumpList = v
		refreshJumpListForPrivacy()
	default:
		return
	}
	saveSettings()
	refreshTrayMenuState()
}

var procGetForegroundWindow = user32.NewProc("GetForegroundWindow")

func isForeground() bool {
	h, _, _ := procGetForegroundWindow.Call()
	return h == mainHwnd
}

// ---- Navigation policy --------------------------------------------------------------

var currentNavigationURL string

func onNavigationStarting(this, sender, args uintptr) uintptr {
	uri := getString(args, navStartingUri)
	if uri == "" || isAppURL(uri) {
		currentNavigationURL = uri
		if isTrustedAppSource(uri) {
			lastAppURL = uri
			pageReady = false
		}
		return 0
	}
	// Never turn the app into a general browser: other sites open in the
	// user's default browser.
	vcall(args, navStartingSetCancel, 1)
	if externalOpenAllowed(uri) {
		openURL(uri)
	}
	return 0
}

func onNavigationCompleted(this, sender, args uintptr) uintptr {
	var ok int32
	vcall(args, navCompletedIsSuccess, uintptr(unsafe.Pointer(&ok)))
	if ok != 0 {
		return 0
	}
	status := getInt32(args, navCompletedErrorStatus)
	if status == webErrorOperationCanceled || !isTrustedAppSource(currentNavigationURL) {
		return 0
	}
	startupLog(fmt.Sprintf("navigation failed (status %d): showing offline page", status))
	showOfflinePage(status)
	return 0
}

func showOfflinePage(status int32) {
	view := webViewPtr()
	if view == 0 {
		return
	}
	kind := "offline"
	switch status {
	case 6, 7, 8, 9, 10, 12, 15, 16: // server unreachable / timeout / bad response / reset / cannot connect
		kind = "unreachable"
	case 1, 2, 3, 4, 5:
		kind = "certificate"
	}
	page := strings.ReplaceAll(offlinePageHTML, "{{KIND}}", kind)
	page = strings.ReplaceAll(page, "{{VERSION}}", appVersionNative)
	offlineShown = true
	pageReady = false
	vcall(view, wvNavigateToString, uintptr(unsafe.Pointer(utf16Ptr(page))))
}

func retryConnection() {
	offlineShown = false
	target := lastAppURL
	if !isTrustedAppSource(target) {
		target = triplemURL
	}
	navigateTo(target)
}

func onNewWindowRequested(this, sender, args uintptr) uintptr {
	uri := getString(args, newWindowUri)
	if uri == "" || uri == "about:blank" || isTrustedAppSource(uri) || strings.HasPrefix(uri, "blob:https://triplem.vip/") {
		return 0 // same-site pop-ups (e.g. receipt preview) keep WebView2's default window
	}
	vcall(args, newWindowSetHandled, 1)
	if externalOpenAllowed(uri) {
		openURL(uri)
	}
	return 0
}

func onPermissionRequested(this, sender, args uintptr) uintptr {
	if getInt32(args, permArgsKind) == permissionNotifications {
		// Web notifications cannot work in WebView2; the app uses native
		// Windows notifications instead.
		vcall(args, permArgsSetState, permissionStateDeny)
	}
	return 0
}

var renderRecoveries int

func onProcessFailed(this, sender, args uintptr) uintptr {
	kind := getInt32(args, procFailedKind)
	startupLog(fmt.Sprintf("WebView2 process failed: kind %d", kind))
	switch kind {
	case processRenderExited, processRenderUnresponsive:
		if renderRecoveries < 5 {
			renderRecoveries++
			dispatchUI(func() {
				if v := webViewPtr(); v != 0 {
					vcall(v, wvReload)
				}
			})
		}
	case processBrowserExited:
		if time.Since(appStartedAt) > 30*time.Second {
			dispatchUI(func() {
				// Close this instance first (window + single-instance lock) so
				// the relaunched process becomes the primary instance.
				quitApplication()
				releaseSingleInstance()
				if exe, err := os.Executable(); err == nil {
					launchDetached(exe, "")
				}
			})
		}
	}
	return 0
}

func launchDetached(exe, params string) {
	var p uintptr
	if params != "" {
		p = uintptr(unsafe.Pointer(utf16Ptr(params)))
	}
	procShellExecuteW.Call(0, uintptr(unsafe.Pointer(utf16Ptr("open"))), uintptr(unsafe.Pointer(utf16Ptr(exe))), p, 0, SW_SHOW)
}

// ---- Print -------------------------------------------------------------------------

func showSystemPrintDialog() {
	if webView16 == 0 {
		postToPage(map[string]string{"type": "print-unavailable"})
		return
	}
	if !hrOK(vcall(webView16, wv16ShowPrintUI, printDialogSystem)) {
		postToPage(map[string]string{"type": "print-unavailable"})
	}
}

// ---- Background tick ----------------------------------------------------------------

const backgroundTickTimerID = 0x54564960

func startBackgroundTick() {
	procSetTimer.Call(mainHwnd, backgroundTickTimerID, 60*1000, 0)
}

func backgroundTick() {
	if !pageReady {
		return
	}
	postToPage(map[string]interface{}{"type": "tick", "visible": isWindowShown()})
}
