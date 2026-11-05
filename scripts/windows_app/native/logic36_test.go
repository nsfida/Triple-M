package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
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

func signManifest(t *testing.T, priv ed25519.PrivateKey, m map[string]interface{}) []byte {
	payload, _ := json.Marshal(m)
	b, _ := json.Marshal(signedManifest{Payload: base64.StdEncoding.EncodeToString(payload), Signature: base64.StdEncoding.EncodeToString(ed25519.Sign(priv, payload)), KeyID: "tvip-update-1"})
	return b
}

func goodManifest() map[string]interface{} {
	return map[string]interface{}{
		"product": "triplem-vip-windows", "version": "3.6.1",
		"url":    "https://triplem.vip/Assets/mobile_app/Windows/TriplemVIP_Setup.exe?v=3.6.1",
		"sha256": strings.Repeat("ab", 32), "size": 12 << 20, "notes": "Fixes",
	}
}

func TestUpdateManifestSignatureAndContent(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	m, err := verifyUpdateManifest(signManifest(t, priv, goodManifest()), pub)
	if err != nil || m.Version != "3.6.1" {
		t.Fatalf("valid manifest rejected: %v", err)
	}
	_, other, _ := ed25519.GenerateKey(rand.Reader)
	if _, err := verifyUpdateManifest(signManifest(t, other, goodManifest()), pub); err == nil {
		t.Fatal("manifest signed by another key accepted")
	}
	// Tampered payload with the original signature.
	raw := signManifest(t, priv, goodManifest())
	var s signedManifest
	_ = json.Unmarshal(raw, &s)
	p, _ := base64.StdEncoding.DecodeString(s.Payload)
	p = []byte(strings.Replace(string(p), "3.6.1", "9.9.9", 1))
	s.Payload = base64.StdEncoding.EncodeToString(p)
	tampered, _ := json.Marshal(s)
	if _, err := verifyUpdateManifest(tampered, pub); err == nil {
		t.Fatal("tampered manifest accepted")
	}
	for key, val := range map[string]interface{}{
		"url":     "https://evil.example/TriplemVIP_Setup.exe",
		"product": "other",
		"version": "3.6",
		"sha256":  "zz",
		"size":    10,
	} {
		bad := goodManifest()
		bad[key] = val
		if _, err := verifyUpdateManifest(signManifest(t, priv, bad), pub); err == nil {
			t.Fatalf("manifest with bad %s accepted", key)
		}
	}
	bad := goodManifest()
	bad["url"] = "https://triplem.vip/Assets/mobile_app/Windows/../../x.exe"
	if _, err := verifyUpdateManifest(signManifest(t, priv, bad), pub); err == nil {
		t.Fatal("path traversal accepted")
	}
	if _, err := verifyUpdateManifest([]byte(`{"payload":"x"}`), pub); err == nil {
		t.Fatal("unsigned manifest accepted")
	}
}

func TestCompiledUpdateKeyIsValid(t *testing.T) {
	if len(updatePublicKey()) != ed25519.PublicKeySize {
		t.Fatal("compiled update public key is malformed")
	}
}

func TestVersionNewer(t *testing.T) {
	if !versionNewer("3.6.1", "3.6.0") || !versionNewer("3.10.0", "3.9.9") || versionNewer("3.6.0", "3.6.0") || versionNewer("3.5.9", "3.6.0") {
		t.Fatal("version comparison")
	}
	if versionNewer("3.6.0", appVersionNative) {
		t.Fatal("app version")
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
