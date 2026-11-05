package main

// Platform-independent logic added in Triplem VIP for Windows 3.6.1: the
// taskbar relaunch identity and the one-time repair of pinned shortcuts that
// showed a blank "white page" icon after the window was closed to the
// notification area. Pure Go, unit-tested on any OS (logic361_test.go).

import (
	"strings"
)

const appDisplayName = "Triplem VIP"

// relaunchProperties returns the values Windows stores in a pin made from the
// running window: the command line, the icon (resource index 0 of the app)
// and the display name.
func relaunchProperties(exe string) (command, icon, name string) {
	if exe == "" {
		return "", "", ""
	}
	return `"` + exe + `"`, exe + ",0", appDisplayName
}

// sameWindowsPath compares two Windows paths the way the file system does
// (case-insensitive, either slash, surrounding quotes and spaces ignored).
func sameWindowsPath(a, b string) bool {
	norm := func(s string) string {
		s = strings.TrimSpace(s)
		s = strings.Trim(s, `"`)
		s = strings.ReplaceAll(s, "/", `\`)
		s = strings.TrimRight(s, `\`)
		return strings.ToLower(s)
	}
	na, nb := norm(a), norm(b)
	return na != "" && na == nb
}

// pinnedLink describes a shortcut found in the user's pinned taskbar folder.
type pinnedLink struct {
	Target     string // resolved program path ("" for an app-ID-only pin)
	AppID      string // System.AppUserModel.ID stored in the shortcut
	IconPath   string // icon location path ("" when not set)
	IconExists bool   // the icon file exists on disk
}

// pinnedLinkFix decides whether a pinned shortcut belongs to this app and what
// must be added so the taskbar can draw its icon when the app has no window:
// an explicit icon location (the app's own executable) and, for a plain
// shortcut to the app, the AppUserModelID that groups it with the window.
func pinnedLinkFix(l pinnedLink, exe, appID string) (ours, setIcon, setAppID bool) {
	targetIsApp := sameWindowsPath(l.Target, exe)
	idIsApp := strings.EqualFold(strings.TrimSpace(l.AppID), appID)
	if !targetIsApp && !idIsApp {
		return false, false, false
	}
	iconOK := l.IconPath != "" && l.IconExists
	setIcon = !iconOK
	setAppID = targetIsApp && strings.TrimSpace(l.AppID) == ""
	return true, setIcon, setAppID
}

// iconRepairDue reports whether the once-per-version icon repair should run.
func iconRepairDue(lastRepairedVersion, current string) bool {
	return strings.TrimSpace(lastRepairedVersion) != current
}
