//go:build windows

package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

// Diagnostics and automatic recovery (3.6).
//
//  * Every start is recorded as "not yet clean"; a normal quit, a Windows
//    sign-out or two minutes of normal running mark it clean again.
//  * Two unexpected endings in a row turn on "safe start" for the next run:
//    optional Windows integrations (Jump List, taskbar badge, modern
//    notifications, shortcut key, Store push) are skipped, the workspace
//    itself works normally, and the user is offered an error report.
//  * "Create error report" writes a text file with the app/Windows/WebView2
//    versions and the recent diagnostic log with personal details removed,
//    shows it in Explorer and opens an e-mail to support. Nothing is uploaded
//    automatically.

const (
	crashCleanTimerID = 0x54564971
	crashCleanAfter   = 2 * time.Minute
	maxLogBytes       = 1 << 20
	supportEmail      = "info@triplem.vip"
)

var (
	safeStart  bool
	crashFile  = func() string { return filepath.Join(appDataDir(), "run-state.json") }
	ntdll      = syscall.NewLazyDLL("ntdll.dll")
	rtlVersion = ntdll.NewProc("RtlGetVersion")
)

// beginRunState is called once at startup, before any optional integration.
func beginRunState() {
	rotateLog()
	b, _ := os.ReadFile(crashFile())
	c := decodeCrashState(b)
	if safeStartNeeded(c) {
		safeStart = true
		startupLog(fmt.Sprintf("safe start: %d unexpected endings in a row", c.Unclean))
	}
	c.Unclean++
	c.Last = time.Now().Format(time.RFC3339)
	writeRunState(c)
}

func writeRunState(c crashState) {
	if b, err := json.Marshal(c); err == nil {
		_ = writeFileAtomic(crashFile(), b)
	}
}

func markRunClean() {
	writeRunState(crashState{Unclean: 0, Last: time.Now().Format(time.RFC3339)})
}

func startCleanRunTimer() {
	procSetTimer.Call(mainHwnd, crashCleanTimerID, uintptr(crashCleanAfter/time.Millisecond), 0)
}

func onCleanRunTimer() {
	procKillTimer.Call(mainHwnd, crashCleanTimerID)
	markRunClean()
}

func rotateLog() {
	p := filepath.Join(appDataDir(), "TriplemVIP.log")
	if st, err := os.Stat(p); err == nil && st.Size() > maxLogBytes {
		_ = os.Remove(p + ".old")
		_ = os.Rename(p, p+".old")
	}
}

type osVersionInfo struct {
	Size, Major, Minor, Build, Platform uint32
	CSD                                 [128]uint16
}

func windowsVersion() string {
	var v osVersionInfo
	v.Size = uint32(unsafe.Sizeof(v))
	if r, _, _ := rtlVersion.Call(uintptr(unsafe.Pointer(&v))); r != 0 {
		return "unknown"
	}
	name := "Windows 10"
	if v.Major == 10 && v.Build >= 22000 {
		name = "Windows 11"
	}
	return fmt.Sprintf("%s (%d.%d.%d)", name, v.Major, v.Minor, v.Build)
}

func webViewRuntimeVersion() string {
	p := findRuntimeDLL()
	if p == "" {
		return "not found"
	}
	// ...\Application\<version>\EBWebView\<arch>\EmbeddedBrowserWebView.dll
	return filepath.Base(filepath.Dir(filepath.Dir(filepath.Dir(p))))
}

func recentLogLines(max int) []string {
	var lines []string
	for _, name := range []string{"TriplemVIP.log.old", "TriplemVIP.log"} {
		b, err := os.ReadFile(filepath.Join(appDataDir(), name))
		if err != nil {
			continue
		}
		lines = append(lines, strings.Split(strings.ReplaceAll(string(b), "\r\n", "\n"), "\n")...)
	}
	if len(lines) > max {
		lines = lines[len(lines)-max:]
	}
	for i, l := range lines {
		lines[i] = redactLogLine(l)
	}
	return lines
}

// createErrorReport writes the report and returns its path.
func createErrorReport() string {
	dir := filepath.Join(appDataDir(), "Reports")
	_ = os.MkdirAll(dir, 0700)
	path := filepath.Join(dir, "TriplemVIP-error-report-"+time.Now().Format("2006-01-02-150405")+".txt")
	b, _ := os.ReadFile(crashFile())
	c := decodeCrashState(b)
	var r strings.Builder
	fmt.Fprintf(&r, "Triplem VIP for Windows - error report\r\n")
	fmt.Fprintf(&r, "Created: %s\r\n\r\n", time.Now().Format(time.RFC1123))
	fmt.Fprintf(&r, "App version: %s (%s)\r\n", appVersionNative, runtimeArchFolder(runtime.GOARCH))
	fmt.Fprintf(&r, "Installed from: %s\r\n", map[bool]string{true: "Microsoft Store", false: "Triplem VIP Setup"}[isPackaged()])
	fmt.Fprintf(&r, "Windows: %s\r\n", windowsVersion())
	fmt.Fprintf(&r, "WebView2 Runtime: %s\r\n", webViewRuntimeVersion())
	fmt.Fprintf(&r, "Safe start: %v (unexpected endings in a row: %d)\r\n", safeStart, c.Unclean)
	fmt.Fprintf(&r, "Settings: notifications=%v, background=%v, startWithWindows=%v, autoUpdate=%v, shortcutKey=%v\r\n",
		settings.Notifications, settings.CloseToTray, startWithWindowsEnabled(), settings.AutoUpdate, settings.QuickAddHotkey)
	fmt.Fprintf(&r, "\r\nThis report contains no passwords, account data or business records.\r\nE-mail addresses, record ids, user names and links were removed from the log below.\r\n")
	fmt.Fprintf(&r, "\r\n---- Recent diagnostic log ----\r\n")
	for _, l := range recentLogLines(400) {
		r.WriteString(l + "\r\n")
	}
	if err := os.WriteFile(path, []byte(r.String()), 0600); err != nil {
		return ""
	}
	return path
}

// sendErrorReport creates the report, shows it in Explorer and opens a
// pre-addressed e-mail; the user decides whether to attach and send it.
func sendErrorReport() {
	path := createErrorReport()
	if path == "" {
		messageBox("Triplem VIP", "The error report could not be created.", MB_OK|MB_ICONERROR)
		return
	}
	pidl, _, _ := procILCreateFromPathW.Call(uintptr(unsafe.Pointer(utf16Ptr(path))))
	if pidl != 0 {
		procSHOpenFolderAndSelectItems.Call(pidl, 0, 0, 0)
		procILFree.Call(pidl)
	}
	subject := "Triplem VIP for Windows " + appVersionNative + " - error report"
	body := "Hello Triplem VIP support,\r\n\r\nPlease describe what happened:\r\n\r\n\r\nThe error report file is attached (" + filepath.Base(path) + ").\r\n"
	mail := "mailto:" + supportEmail + "?subject=" + url.PathEscape(subject) + "&body=" + url.PathEscape(body)
	openURL(mail)
	postToPage(map[string]string{"type": "report-created", "name": filepath.Base(path)})
}

func announceSafeStart() {
	if !safeStart {
		return
	}
	postToPage(map[string]string{"type": "safe-start"})
}
