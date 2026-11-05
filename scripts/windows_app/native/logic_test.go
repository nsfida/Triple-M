package main

import (
	"strings"
	"testing"
)

func TestParseLaunchArgs(t *testing.T) {
	a := parseLaunchArgs([]string{"--open=new-expense", "--background"})
	if a.Open != "new-expense" || !a.Background || a.Uninstall {
		t.Fatalf("unexpected %+v", a)
	}
	if parseLaunchArgs([]string{"--open=javascript:alert(1)"}).Open != "" {
		t.Fatal("unknown open target must be rejected")
	}
	if parseLaunchArgs([]string{"--OPEN=Reports"}).Open != "reports" {
		t.Fatal("targets are case-insensitive")
	}
	if !parseLaunchArgs([]string{"--uninstall"}).Uninstall {
		t.Fatal("uninstall flag")
	}
	for _, target := range []string{"new-expense", "new-journal", "reports", "inventory"} {
		if parseLaunchArgs([]string{"--open=" + target}).Open != target {
			t.Fatalf("jump list target %s must be accepted", target)
		}
	}
}

func TestForwardedArgsRoundTrip(t *testing.T) {
	enc := encodeForwardedArgs(launchArgs{Open: "inventory"})
	got, ok := decodeForwardedArgs(enc)
	if !ok || got.Open != "inventory" || got.Background {
		t.Fatalf("round trip failed: %q -> %+v", enc, got)
	}
	if _, ok := decodeForwardedArgs("--uninstall"); ok {
		t.Fatal("messages without the protocol header must be rejected")
	}
	got, ok = decodeForwardedArgs("triplem-forward-v1\n--uninstall")
	if !ok || got.Uninstall {
		t.Fatal("another process can never trigger uninstall")
	}
	if _, ok := decodeForwardedArgs("triplem-forward-v1\n" + strings.Repeat("x", 600)); ok {
		t.Fatal("oversized forward must be rejected")
	}
}

func TestTrustedSources(t *testing.T) {
	good := []string{"https://triplem.vip/", "https://triplem.vip/?x=1#y", "https://www.triplem.vip/seo/"}
	bad := []string{"http://triplem.vip/", "https://triplem.vip.evil.com/", "https://evil.com/?https://triplem.vip/", "https://user@triplem.vip/", "about:blank", "data:text/html,x", "", "https://triplem.vip:8443/"}
	for _, s := range good {
		if !isTrustedAppSource(s) {
			t.Errorf("should trust %q", s)
		}
	}
	for _, s := range bad {
		if isTrustedAppSource(s) {
			t.Errorf("must not trust %q", s)
		}
	}
	if !isAppURL("about:blank") || isAppURL("https://wa.me/123") {
		t.Fatal("app URL policy")
	}
	if !externalOpenAllowed("https://wa.me/923339004564") || !externalOpenAllowed("mailto:info@triplem.vip") {
		t.Fatal("external links should open in the default browser/app")
	}
	for _, s := range []string{"file:///C:/Windows/System32/calc.exe", "javascript:alert(1)", "ms-settings:", "\\\\server\\share"} {
		if externalOpenAllowed(s) {
			t.Errorf("must not hand %q to the shell", s)
		}
	}
}

func TestBridgeMessageValidation(t *testing.T) {
	if _, ok := parseBridgeMessage("https://evil.com/", `{"cmd":"notify","title":"x"}`); ok {
		t.Fatal("foreign origin accepted")
	}
	if _, ok := parseBridgeMessage("https://triplem.vip/", `{"cmd":"exec","value":"calc"}`); ok {
		t.Fatal("unknown command accepted")
	}
	if _, ok := parseBridgeMessage("about:blank", `{"cmd":"notify"}`); ok {
		t.Fatal("offline page may only retry")
	}
	if _, ok := parseBridgeMessage("about:blank", `{"cmd":"retry"}`); !ok {
		t.Fatal("offline page retry rejected")
	}
	m, ok := parseBridgeMessage("https://triplem.vip/", `{"cmd":"notify","title":"`+strings.Repeat("A", 300)+`","body":"line\u0007two","target":"bogus","count":-4}`)
	if !ok {
		t.Fatal("valid message rejected")
	}
	if len([]rune(m.Title)) > 63 || strings.ContainsRune(m.Body, 7) || m.Target != "" || m.Count != 0 {
		t.Fatalf("message not sanitised: %+v", m)
	}
	if _, ok := parseBridgeMessage("https://triplem.vip/", strings.Repeat("x", maxWebMessage+1)); ok {
		t.Fatal("oversized message accepted")
	}
}

func TestRecentTagsDedupe(t *testing.T) {
	r := newRecentTags(3)
	if r.seen("a") || !r.seen("a") {
		t.Fatal("dedupe failed")
	}
	r.seen("b")
	r.seen("c")
	r.seen("d") // evicts "a"
	if r.seen("a") {
		t.Fatal("evicted tag should be accepted again")
	}
	if r.seen("") || r.seen("") {
		t.Fatal("empty tags are never de-duplicated")
	}
}

func TestSettingsDecoding(t *testing.T) {
	if s := decodeSettings(nil); !s.Notifications || !s.CloseToTray {
		t.Fatal("defaults")
	}
	if s := decodeSettings([]byte("{broken")); !s.Notifications || !s.CloseToTray {
		t.Fatal("damaged file must fall back to defaults")
	}
	s := decodeSettings([]byte(`{"notifications":false}`))
	if s.Notifications || !s.CloseToTray {
		t.Fatalf("partial file must keep other defaults: %+v", s)
	}
}

func TestFitPlacement(t *testing.T) {
	primary := irect{0, 0, 1920, 1040}
	second := irect{1920, 0, 3840, 1040}
	// Saved on the second monitor and still connected: unchanged.
	saved := irect{2000, 100, 3200, 900}
	if got := fitPlacement(saved, []irect{primary, second}, 0); got != saved {
		t.Fatalf("visible placement changed: %+v", got)
	}
	// Second monitor disconnected: centred on primary, same size.
	got := fitPlacement(saved, []irect{primary}, 0)
	if got.L < 0 || got.R > 1920 || got.w() != 1200 || got.h() != 800 {
		t.Fatalf("not moved onto primary: %+v", got)
	}
	// Partly off the bottom-right edge: pulled fully inside.
	got = fitPlacement(irect{1500, 800, 2700, 1600}, []irect{primary}, 0)
	if got.R > 1920 || got.B > 1040 || got.L < 0 || got.T < 0 {
		t.Fatalf("not clamped: %+v", got)
	}
	// Larger than the work area (lower resolution now): shrunk.
	got = fitPlacement(irect{0, 0, 4000, 3000}, []irect{{0, 0, 1366, 728}}, 0)
	if got.w() > 1366 || got.h() > 728 {
		t.Fatalf("not shrunk: %+v", got)
	}
	// Tiny/invalid saved size: replaced by a sensible default.
	got = fitPlacement(irect{10, 10, 50, 40}, []irect{primary}, 0)
	if got.w() < minWindowW || got.h() < minWindowH {
		t.Fatalf("too small: %+v", got)
	}
	// Negative-coordinate monitor to the left of primary.
	left := irect{-1600, 0, 0, 860}
	saved = irect{-1500, 50, -300, 800}
	if got := fitPlacement(saved, []irect{primary, left}, 0); got != saved {
		t.Fatalf("left monitor placement changed: %+v", got)
	}
}

func TestSaveAsHelpers(t *testing.T) {
	if n := sanitizeFileName(`..\..\Windows\evil:name?.pdf`); strings.ContainsAny(n, `\/:?`) || !strings.HasSuffix(n, ".pdf") {
		t.Fatalf("unsafe name: %q", n)
	}
	if sanitizeFileName("   ") != "Triplem VIP export" {
		t.Fatal("empty name fallback")
	}
	if got := ensureExtension(`C:\Exports\Report`, ".pdf"); got != `C:\Exports\Report.pdf` {
		t.Fatalf("extension not appended: %s", got)
	}
	if got := ensureExtension(`C:\Exports\Report.PDF`, ".pdf"); got != `C:\Exports\Report.PDF` {
		t.Fatalf("matching extension changed: %s", got)
	}
	if got := ensureExtension(`C:\Exports\Report.final`, ".xlsx"); got != `C:\Exports\Report.final.xlsx` {
		t.Fatalf("wrong extension kept: %s", got)
	}
	f := saveDialogFilter(".xlsx")
	if !strings.HasPrefix(f, "Excel workbook (*.xlsx)\x00*.xlsx\x00") || !strings.HasSuffix(f, "\x00\x00") {
		t.Fatalf("filter: %q", f)
	}
}

func TestBadgeTextAndTooltip(t *testing.T) {
	cases := map[int]string{-1: "", 0: "", 1: "1", 9: "9", 10: "9+", 250: "9+"}
	for n, want := range cases {
		if got := badgeText(n); got != want {
			t.Errorf("badgeText(%d)=%q want %q", n, got, want)
		}
	}
	if trayTooltip(0, false) != "Triplem VIP" || trayTooltip(1, false) != "Triplem VIP - 1 unread notification" || trayTooltip(12, false) != "Triplem VIP - 12 unread notifications" {
		t.Fatal("tooltip text")
	}
	if len(trayTooltip(1<<30, false)) >= 128 {
		t.Fatal("tooltip must fit NOTIFYICONDATA.szTip")
	}
}

func TestRenderBadge(t *testing.T) {
	for _, size := range []int{16, 20, 24, 32} {
		bm := renderBadge(size, "9+")
		if len(bm.Pix) != size*size {
			t.Fatal("bitmap size")
		}
		corner := bm.Pix[0] >> 24
		centre := bm.Pix[(size/2)*size+size/2] >> 24
		if corner != 0 || centre != 255 {
			t.Fatalf("size %d: corner alpha %d centre alpha %d", size, corner, centre)
		}
		var white, red int
		for _, p := range bm.Pix {
			if p>>24 == 255 {
				switch p & 0xFFFFFF {
				case 0xFFFFFF:
					white++
				case badgeColorFill:
					red++
				}
			}
		}
		if white == 0 || red == 0 {
			t.Fatalf("size %d: digits or fill missing (white %d red %d)", size, white, red)
		}
	}
	if empty := renderBadge(16, ""); empty.Pix[8*16+8] != 0 {
		t.Fatal("zero count must render nothing")
	}
}

func TestRuntimeArchFolder(t *testing.T) {
	if runtimeArchFolder("amd64") != "x64" || runtimeArchFolder("arm64") != "arm64" || runtimeArchFolder("386") != "x86" {
		t.Fatal("WebView2 runtime folder per architecture")
	}
}
