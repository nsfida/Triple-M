package main

import (
	"strings"
	"testing"
)

const testID = "0f8fad5b-d9cb-469f-a165-70867728950e"
const testToken = "0123456789abcdef0123456789abcdef"

func TestParseLinkOpenTargets(t *testing.T) {
	cases := map[string]linkRequest{
		"triplemvip://open/reports":                                     {Target: "reports"},
		"TRIPLEMVIP://OPEN/Reports/":                                    {Target: "reports"},
		"triplemvip://open/messages/" + testID:                          {Target: "messages", ID: testID},
		"triplemvip://open/notifications/" + testID:                     {Target: "notifications", ID: testID},
		"triplemvip://open/live-chat":                                   {Target: "live-chat"},
		"triplemvip://action/reply/" + testID:                           {Target: "messages", ID: testID, Action: "reply"},
		"triplemvip://action/accept-chat/" + testID + "?t=" + testToken: {Target: "notifications", ID: testID, Action: "accept-chat", Token: testToken},
	}
	for raw, want := range cases {
		got, ok := parseLink(raw)
		if !ok {
			t.Fatalf("%s rejected", raw)
		}
		if got.Target != want.Target || got.ID != want.ID || got.Action != want.Action || got.Token != want.Token {
			t.Fatalf("%s: got %+v want %+v", raw, got, want)
		}
	}
}

func TestParseLinkRejectsUnsafeInput(t *testing.T) {
	bad := []string{
		"", "https://triplem.vip/", "triplemvip:open/reports", "triplemvip://open/settings",
		"triplemvip://open/reports/" + testID, // ids only for messages/notifications
		"triplemvip://open/messages/not-a-uuid",
		"triplemvip://open/messages/" + testID + "/extra",
		"triplemvip://open/reports?x=1",
		"triplemvip://action/delete-account/" + testID,
		"triplemvip://action/accept-chat",
		"triplemvip://action/accept-chat/" + testID + "?t=XYZ",
		"triplemvip://action/accept-chat/" + testID + "?t=" + testToken + "&cmd=calc",
		"triplemvip://user:pw@open/reports",
		"triplemvip://open/reports#frag",
		"triplemvip://open/reports\" --uninstall",
		"triplemvip://open/" + strings.Repeat("a", 400),
	}
	for _, raw := range bad {
		if _, ok := parseLink(raw); ok {
			t.Fatalf("accepted unsafe link %q", raw)
		}
	}
}

func TestActionsNeedThisProcessToken(t *testing.T) {
	l, _ := parseLink("triplemvip://action/accept-chat/" + testID + "?t=" + testToken)
	if got := authorizeLink(l, testToken); got.Action != "accept-chat" {
		t.Fatal("own token must authorize the action")
	}
	if got := authorizeLink(l, "ffffffffffffffffffffffffffffffff"); got.Action != "" || got.Target != "notifications" {
		t.Fatal("foreign token must downgrade to opening the screen")
	}
	if got := authorizeLink(l, ""); got.Action != "" {
		t.Fatal("no process token must downgrade")
	}
	noTok, _ := parseLink("triplemvip://action/mark-read/" + testID)
	if got := authorizeLink(noTok, testToken); got.Action != "" {
		t.Fatal("missing token must downgrade")
	}
	reply, _ := parseLink("triplemvip://action/reply/" + testID)
	if got := authorizeLink(reply, ""); got.Action != "reply" {
		t.Fatal("reply only opens the conversation and needs no token")
	}
}

func TestLaunchArgsCarryLinksAndForwardThem(t *testing.T) {
	a := parseLaunchArgs([]string{"triplemvip://open/messages/" + testID})
	if a.Open != "messages" || a.Link.ID != testID {
		t.Fatalf("link launch: %+v", a)
	}
	b, ok := decodeForwardedArgs(encodeForwardedArgs(a))
	if !ok || b.Link.ID != testID || b.Open != "messages" {
		t.Fatalf("forwarded link lost: %+v", b)
	}
	if c := parseLaunchArgs([]string{"triplemvip://open/evil"}); c.Open != "" || c.Link.Raw != "" {
		t.Fatal("invalid link must be ignored")
	}
	if d := parseLaunchArgs([]string{"--updated"}); !d.Update {
		t.Fatal("--updated flag")
	}
}

func TestToastXMLIsEscapedAndUsesProtocolActivation(t *testing.T) {
	x := buildToastXML(`A & <b>"x"</b>`, "line <script>", "messages", testID,
		[]toastAction{{Action: "reply", ID: testID}, {Action: "mark-read", ID: testID}}, testToken, `C:\Users\a b\AppData\Local\Triplem VIP\toast-logo.png`)
	for _, want := range []string{
		`launch="triplemvip://open/messages/` + testID + `"`,
		`activationType="protocol"`,
		`A &amp; &lt;b&gt;&quot;x&quot;&lt;/b&gt;`,
		`line &lt;script&gt;`,
		`content="Reply"`, `content="Mark as read"`,
		`arguments="triplemvip://action/mark-read/` + testID + `?t=` + testToken + `"`,
		`src="file:///C:/Users/a%20b/AppData/Local/Triplem%20VIP/toast-logo.png"`,
	} {
		if !strings.Contains(x, want) {
			t.Fatalf("toast xml missing %s\n%s", want, x)
		}
	}
	if strings.Contains(x, "<script>") {
		t.Fatal("unescaped markup")
	}
	if y := buildToastXML("t", "b", "reports", testID, nil, "", ""); !strings.Contains(y, `launch="triplemvip://open/reports"`) || strings.Contains(y, "<actions>") {
		t.Fatalf("ids only for id targets; no empty actions: %s", y)
	}
}

func TestSanitizeToastActions(t *testing.T) {
	in := []toastAction{{"accept-chat", testID}, {"accept-chat", testID}, {"rm-rf", testID}, {"mark-read", "nope"}, {"decline-chat", strings.ToUpper(testID)}, {"reply", testID}, {"mark-read", testID}}
	out := sanitizeToastActions(in)
	if len(out) != 3 || out[0].Action != "accept-chat" || out[1].Action != "decline-chat" || out[1].ID != testID || out[2].Action != "reply" {
		t.Fatalf("got %+v", out)
	}
}

func TestSettingsDefaultsForExisting35Files(t *testing.T) {
	s := decodeSettings([]byte(`{"notifications":false,"closeToTray":true}`))
	if s.Notifications || !s.AutoUpdate || !s.QuickAddHotkey {
		t.Fatalf("3.5 settings must keep their values and get 3.6 defaults: %+v", s)
	}
	s = decodeSettings([]byte(`{"autoUpdate":false,"quickAddHotkey":false}`))
	if s.AutoUpdate || s.QuickAddHotkey {
		t.Fatal("explicit choices must be kept")
	}
}

func TestBridgeMessageSanitizesNewFields(t *testing.T) {
	m, ok := parseBridgeMessage("https://triplem.vip/", `{"cmd":"notify","title":"x","actions":[{"action":"accept-chat","id":"`+testID+`"},{"action":"x","id":"y"}],"color":"red","id":"../../etc"}`)
	if !ok || len(m.Actions) != 1 || m.Color != "" || m.ID != "" {
		t.Fatalf("got %+v", m)
	}
	if _, ok := parseBridgeMessage("https://evil.example/", `{"cmd":"update-install"}`); ok {
		t.Fatal("foreign origin must not trigger an update")
	}
	if c, ok := parseHexColor("#102030"); !ok || c != 0x302010 {
		t.Fatalf("color %x", c)
	}
}

func TestWNSChannelValidation(t *testing.T) {
	if !isWNSChannel("https://wns2-db5p.notify.windows.com/w/?token=AwYAAAB") {
		t.Fatal("valid channel")
	}
	for _, bad := range []string{"http://x.notify.windows.com/", "https://notify.windows.com.evil.io/", "https://evil.io/?x=.notify.windows.com", "https://u:p@a.notify.windows.com/"} {
		if isWNSChannel(bad) {
			t.Fatalf("accepted %s", bad)
		}
	}
}

func TestCrashStateAndRedaction(t *testing.T) {
	if safeStartNeeded(decodeCrashState([]byte(`{"unclean":1}`))) || !safeStartNeeded(decodeCrashState([]byte(`{"unclean":2}`))) {
		t.Fatal("safe start threshold")
	}
	if decodeCrashState([]byte("garbage")).Unclean != 0 {
		t.Fatal("damaged crash file")
	}
	line := `navigation https://triplem.vip/?push=messages&inquiry=` + testID + ` user a.b@x.com C:\Users\Nadeem\AppData token ` + strings.Repeat("a1", 20)
	r := redactLogLine(line)
	for _, leak := range []string{testID, "a.b@x.com", "Nadeem", "inquiry=", strings.Repeat("a1", 20)} {
		if strings.Contains(r, leak) {
			t.Fatalf("report leaks %q: %s", leak, r)
		}
	}
}

func TestToastTag(t *testing.T) {
	if got := toastTag("uid:n:" + testID + "<x>"); strings.ContainsAny(got, "<>") || len(got) > 64 {
		t.Fatalf("tag %q", got)
	}
}

func TestLinkLaunchIgnoresInjectedArguments(t *testing.T) {
	a := parseLaunchArgs([]string{"--link", "triplemvip://open/reports", "--uninstall", "--background"})
	if a.Uninstall || a.Background || a.Open != "reports" {
		t.Fatalf("link launch must ignore other arguments: %+v", a)
	}
	b := parseLaunchArgs([]string{"--uninstall", "--link", "triplemvip://open/evil"})
	if b.Uninstall || b.Open != "" {
		t.Fatalf("invalid link launch must do nothing: %+v", b)
	}
}

func TestTitleBarTextContrast(t *testing.T) {
	dark, _ := parseHexColor("#0f172a")
	light, _ := parseHexColor("#f8fafc")
	if !colorIsDark(dark) || colorIsDark(light) {
		t.Fatal("title bar text colour must contrast with the caption colour")
	}
}
