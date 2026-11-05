package main

import "testing"

const testAppID = "TriplemVIP.Desktop"
const testExe = `C:\Users\Ana\AppData\Local\Programs\Triplem VIP\TriplemVIP.exe`

func TestRelaunchProperties(t *testing.T) {
	cmd, icon, name := relaunchProperties(testExe)
	if cmd != `"`+testExe+`"` || icon != testExe+",0" || name != "Triplem VIP" {
		t.Fatalf("unexpected relaunch properties: %q %q %q", cmd, icon, name)
	}
	if c, i, n := relaunchProperties(""); c != "" || i != "" || n != "" {
		t.Fatal("no executable path must give no properties")
	}
}

func TestSameWindowsPath(t *testing.T) {
	if !sameWindowsPath(testExe, `"c:/users/ana/appdata/local/programs/triplem vip/triplemvip.exe"`) {
		t.Fatal("paths differing only in case, quotes and slashes are the same file")
	}
	if sameWindowsPath(testExe, `C:\Other\TriplemVIP.exe`) || sameWindowsPath("", "") {
		t.Fatal("different or empty paths must not match")
	}
}

func TestPinnedLinkFix(t *testing.T) {
	cases := []struct {
		name                    string
		link                    pinnedLink
		ours, setIcon, setAppID bool
	}{
		{"blank app-ID pin gets the icon", pinnedLink{AppID: testAppID}, true, true, false},
		{"shortcut to the app without icon or ID", pinnedLink{Target: testExe}, true, true, true},
		{"icon file missing", pinnedLink{Target: testExe, AppID: testAppID, IconPath: `C:\gone.ico`}, true, true, false},
		{"healthy pin is left alone", pinnedLink{Target: testExe, AppID: testAppID, IconPath: testExe, IconExists: true}, true, false, false},
		{"another program is never touched", pinnedLink{Target: `C:\Windows\notepad.exe`}, false, false, false},
		{"another app ID is never touched", pinnedLink{AppID: "Microsoft.Edge"}, false, false, false},
	}
	for _, c := range cases {
		ours, icon, id := pinnedLinkFix(c.link, testExe, testAppID)
		if ours != c.ours || icon != c.setIcon || id != c.setAppID {
			t.Errorf("%s: got ours=%v icon=%v id=%v", c.name, ours, icon, id)
		}
	}
}

func TestIconRepairDue(t *testing.T) {
	if !iconRepairDue("", appVersionNative) || !iconRepairDue("3.6.0", "3.6.1") || iconRepairDue(appVersionNative, appVersionNative) {
		t.Fatal("the repair runs once for every new version")
	}
}

// 3.6.2 regression: the Save As filter contains NUL separators. Encoding it
// with syscall.UTF16FromString returned nothing and the PDF export crashed
// the app with "index out of range [0] with length 0".
func TestSaveDialogFilterEncoding(t *testing.T) {
	for _, ext := range []string{".pdf", ".xlsx", ".csv", ".zip", ".weird", ""} {
		f := saveDialogFilter(ext)
		u := utf16MultiString(f)
		if len(u) < 4 || u[len(u)-1] != 0 || u[len(u)-2] != 0 {
			t.Fatalf("%q: filter must end with a double NUL", ext)
		}
		// Every entry survives: label, pattern, ..., "All files", "*.*".
		var parts []string
		start := 0
		for i, c := range u {
			if c == 0 {
				if i == start {
					break
				}
				parts = append(parts, string(utf16Decode16(u[start:i])))
				start = i + 1
			}
		}
		if len(parts)%2 != 0 || parts[len(parts)-1] != "*.*" {
			t.Fatalf("%q: unexpected filter entries %v", ext, parts)
		}
		if ext == ".pdf" && (len(parts) != 4 || parts[1] != "*.pdf") {
			t.Fatalf("pdf filter: %v", parts)
		}
	}
	if u := utf16MultiString(""); len(u) != 2 {
		t.Fatal("an empty list is two NULs")
	}
}

func TestUTF16NoNULNeverEmpty(t *testing.T) {
	for _, s := range []string{"", "\x00", "a\x00b", "Triplem VIP"} {
		u := utf16NoNUL(s)
		if len(u) == 0 || u[len(u)-1] != 0 {
			t.Fatalf("%q: must be NUL-terminated and non-empty", s)
		}
		for _, c := range u[:len(u)-1] {
			if c == 0 {
				t.Fatalf("%q: embedded NUL kept", s)
			}
		}
	}
}

func utf16Decode16(u []uint16) []rune {
	out := make([]rune, 0, len(u))
	for _, c := range u {
		out = append(out, rune(c))
	}
	return out
}
