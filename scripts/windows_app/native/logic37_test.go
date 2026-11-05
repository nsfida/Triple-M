package main

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestLockTiming(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	if lockOnReturn(false, 0, now.Add(-time.Hour), now) {
		t.Fatal("lock off never locks")
	}
	if lockOnReturn(true, 5, time.Time{}, now) {
		t.Fatal("never away: no lock")
	}
	if !lockOnReturn(true, 0, now.Add(-time.Second), now) {
		t.Fatal("immediately: any time away locks")
	}
	if lockOnReturn(true, 5, now.Add(-4*time.Minute), now) || !lockOnReturn(true, 5, now.Add(-5*time.Minute), now) {
		t.Fatal("5 minutes: locks only after 5 minutes away")
	}
	if lockForIdle(true, 15, 14*time.Minute) || !lockForIdle(true, 15, 15*time.Minute) {
		t.Fatal("idle lock uses the chosen minutes")
	}
	if lockForIdle(true, 0, 5*time.Minute) || !lockForIdle(true, 0, 15*time.Minute) {
		t.Fatal("'immediately' never interrupts active work; idle lock after 15 minutes")
	}
	if lockForIdle(false, 1, time.Hour) {
		t.Fatal("lock off never locks for idle")
	}
	for _, n := range []int{0, 1, 5, 15, 30, 60} {
		if !validLockMinutes(n) {
			t.Fatalf("%d must be allowed", n)
		}
	}
	if validLockMinutes(2) || validLockMinutes(-1) || validLockMinutes(999) {
		t.Fatal("only the offered choices are allowed")
	}
	if helloResultText(helloVerified) != "" || helloResultText(helloNotConfigured) == "" || helloResultText(99) == "" {
		t.Fatal("result texts")
	}
}

func TestSettingsDefaultsForExistingUsers(t *testing.T) {
	// A 3.6 settings file: the new 3.7 options get their defaults.
	s := decodeSettings([]byte(`{"notifications":true,"closeToTray":false,"autoUpdate":true,"quickAddHotkey":false}`))
	if s.CloseToTray || s.QuickAddHotkey {
		t.Fatal("existing choices are kept")
	}
	if s.AppLock || s.LockMinutes != 5 || !s.LockHideDetails || !s.TrayBadge || !s.SaveMemory || !s.RecentJumpList {
		t.Fatalf("3.7 defaults: %+v", s)
	}
	s = decodeSettings([]byte(`{"appLock":true,"lockMinutes":0}`))
	if !s.AppLock || s.LockMinutes != 0 {
		t.Fatal("'immediately' (0) is a valid stored choice")
	}
	if decodeSettings([]byte(`{"lockMinutes":7}`)).LockMinutes != 5 {
		t.Fatal("an invalid stored value falls back to 5")
	}
}

func TestHotkeys(t *testing.T) {
	seen := map[uintptr]bool{}
	for _, h := range globalHotkeys {
		if seen[h.ID] || !openTargets[h.Target] || !strings.HasPrefix(h.Label, "Ctrl+Alt+Shift+") {
			t.Fatalf("bad hotkey %+v", h)
		}
		seen[h.ID] = true
	}
	if hotkeyTarget(0x5456) != "new-expense" || hotkeyTarget(0x5457) != "search" || hotkeyTarget(0x5458) != "new-invoice" || hotkeyTarget(1) != "" {
		t.Fatal("hotkey targets")
	}
}

func TestRecordTargets(t *testing.T) {
	id := "0F8FAD5B-D9CB-469F-A165-70867728950E"
	k, i, ok := parseRecordTarget("wallet:" + id)
	if !ok || k != "wallet" || i != strings.ToLower(id) {
		t.Fatal("wallet target")
	}
	for _, bad := range []string{"wallet:", "doc:123", "user:" + id, ":" + id, "wallet:" + id + "x", "doc:../" + id} {
		if _, _, ok := parseRecordTarget(bad); ok {
			t.Fatalf("%q must be refused", bad)
		}
	}
	a := parseLaunchArgs([]string{"--open=doc:" + id})
	if a.Open != "doc:"+strings.ToLower(id) {
		t.Fatalf("launch arg: %q", a.Open)
	}
	if parseLaunchArgs([]string{"--open=format:c"}).Open != "" {
		t.Fatal("unknown targets are ignored")
	}
	if !isOpenTarget("search") || !isOpenTarget("new-invoice") || isOpenTarget("delete-all") {
		t.Fatal("open targets")
	}
	// A forwarded second launch keeps the record target.
	f, ok := decodeForwardedArgs(encodeForwardedArgs(a))
	if !ok || f.Open != a.Open {
		t.Fatal("forwarded record target")
	}
}

func TestSanitizeRecent(t *testing.T) {
	id := func(n int) string { return "0f8fad5b-d9cb-469f-a165-70867728950" + string(rune('0'+n)) }
	in := []recentRecord{
		{Kind: "wallet", ID: id(1), Title: "Main wallet"},
		{Kind: "wallet", ID: id(1), Title: "Duplicate"},
		{Kind: "doc", ID: id(2), Title: "Invoice INV-0001\nsecond line"},
		{Kind: "user", ID: id(3), Title: "Not allowed"},
		{Kind: "doc", ID: "nope", Title: "Bad id"},
		{Kind: "doc", ID: id(4), Title: "   "},
		{Kind: "doc", ID: id(5), Title: strings.Repeat("x", 200)},
	}
	for n := 6; n < 10; n++ {
		in = append(in, recentRecord{Kind: "wallet", ID: id(n), Title: "W"})
	}
	out := sanitizeRecent(in, map[string]bool{"--open=wallet:" + id(6): true})
	if len(out) != maxRecentRecords {
		t.Fatalf("max %d records, got %d", maxRecentRecords, len(out))
	}
	if out[0].Title != "Main wallet" || out[1].Title != "Invoice INV-0001 second line" {
		t.Fatalf("titles: %+v", out[:2])
	}
	if len([]rune(out[2].Title)) > 60 {
		t.Fatal("titles are shortened")
	}
	for _, r := range out {
		if r.ID == id(6) {
			t.Fatal("items the user removed from the Jump List are not added again")
		}
	}
	if recentSignature(out) == recentSignature(out[:3]) {
		t.Fatal("signature changes with the list")
	}
}

func TestPrintOptions(t *testing.T) {
	o, err := sanitizePrintOptions(printOptions{Printer: "Office HP", Copies: 0, Pages: " 1 - 3 , 5 ", Orientation: "sideways", Paper: "a4", Margins: "narrow", Color: "bw", Duplex: "long", FileName: "Invoice/INV:1"}, []string{"Office HP", "Microsoft Print to PDF"})
	if err != nil {
		t.Fatal(err)
	}
	if o.Printer != "Office HP" || o.Copies != 1 || o.Pages != "1-3,5" || o.Orientation != "portrait" || o.Scale != 100 {
		t.Fatalf("defaults: %+v", o)
	}
	if !strings.HasSuffix(o.FileName, ".pdf") || strings.ContainsAny(o.FileName, `/\:`) {
		t.Fatalf("pdf name: %q", o.FileName)
	}
	if printColorMode(o) != 2 || printDuplexMode(o) != 2 {
		t.Fatal("colour / duplex mapping")
	}
	w, h, ok := pageSizeInches(o)
	if !ok || w != 8.27 || h != 11.69 {
		t.Fatal("A4 portrait")
	}
	o.Orientation = "landscape"
	if w, h, _ := pageSizeInches(o); w != 11.69 || h != 8.27 {
		t.Fatal("landscape swaps width and height")
	}
	if u, _ := sanitizePrintOptions(printOptions{Printer: "Removed printer"}, []string{"Office HP"}); u.Printer != "" {
		t.Fatal("an unknown printer falls back to the default printer")
	}
	if u, _ := sanitizePrintOptions(printOptions{Copies: 500, Paper: "tabloid", Margins: "huge", Color: "x", Duplex: "y"}, nil); u.Copies != 99 || u.Paper != "default" || u.Margins != "default" || u.Color != "default" || u.Duplex != "default" {
		t.Fatalf("unknown values fall back: %+v", u)
	}
	for _, bad := range []string{"0", "3-1", "1--2", "a", "1;2", strings.Repeat("1,", 80) + "1"} {
		if _, err := sanitizePrintOptions(printOptions{Pages: bad}, nil); err == nil {
			t.Fatalf("pages %q must be refused", bad)
		}
	}
	if _, err := sanitizePrintOptions(printOptions{Scale: 500}, nil); err == nil {
		t.Fatal("scale is limited")
	}
	raw, _ := json.Marshal(printOptions{Copies: 2})
	if d, ok := decodePrintOptions(raw); !ok || d.Copies != 2 {
		t.Fatal("decode")
	}
	if _, ok := decodePrintOptions([]byte(strings.Repeat(" ", 5000))); ok {
		t.Fatal("oversized options are refused")
	}
	if p := sortedPrinters([]string{"b", "A", "", "b"}); len(p) != 2 || p[0] != "A" {
		t.Fatalf("printers: %v", p)
	}
}

func TestBackgroundPolicy(t *testing.T) {
	if canSuspendPage(false, false, false, false) {
		t.Fatal("save memory off: never paused")
	}
	if !canSuspendPage(true, false, false, false) {
		t.Fatal("notifications off: nothing needs the page")
	}
	if canSuspendPage(true, true, false, false) {
		t.Fatal("Setup version with notifications: the page checks for them, keep it running")
	}
	if !canSuspendPage(true, true, true, true) || canSuspendPage(true, true, true, false) {
		t.Fatal("Store version: pause only when Windows push delivers notifications")
	}
}

func TestTrayBadgeImage(t *testing.T) {
	for _, size := range []int{16, 20, 24, 32} {
		bs, x, y := trayBadgeLayout(size)
		if bs < 9 || bs > size || x+bs != size || y+bs != size {
			t.Fatalf("layout %d: %d %d %d", size, bs, x, y)
		}
	}
	base := make([]uint32, 16*16)
	for i := range base {
		base[i] = 0xFF2457D6
	}
	if out := trayBadgeImage(base, 16, 0); out[15*16+15] != base[15*16+15] {
		t.Fatal("no unread: icon unchanged")
	}
	out := trayBadgeImage(base, 16, 3)
	if out[0] != base[0] {
		t.Fatal("the badge stays in the bottom-right corner")
	}
	changed := 0
	for i := range out {
		if out[i] != base[i] {
			changed++
		}
		if out[i]>>24 != 0xFF {
			t.Fatal("an opaque icon stays opaque under the badge")
		}
	}
	if changed < 40 {
		t.Fatalf("badge drawn: %d pixels changed", changed)
	}
	// Scaling keeps colour and alpha.
	src := []uint32{0xFFFF0000, 0xFFFF0000, 0xFFFF0000, 0xFFFF0000}
	if s := scaleImage(src, 2, 1); s[0] != 0xFFFF0000 {
		t.Fatalf("scale: %08X", s[0])
	}
	half := []uint32{0xFF00FF00, 0x00000000, 0x00000000, 0xFF00FF00}
	if s := scaleImage(half, 2, 1); s[0]>>24 < 120 || s[0]>>24 > 135 || s[0]&0xFFFFFF != 0x00FF00 {
		t.Fatalf("transparent pixels do not darken: %08X", s[0])
	}
}

func TestTrayTooltipFull(t *testing.T) {
	if trayTooltipFull(0, true, 0, false) != "Triplem VIP" {
		t.Fatal("plain")
	}
	got := trayTooltipFull(2, false, 3, true)
	for _, want := range []string{"2 unread", "Locked", "Offline", "3 changes waiting to sync"} {
		if !strings.Contains(got, want) {
			t.Fatalf("%q missing %q", got, want)
		}
	}
	if len([]rune(trayTooltipFull(100000, false, 999999, true))) > 127 {
		t.Fatal("tooltip fits NOTIFYICONDATA.szTip")
	}
}
