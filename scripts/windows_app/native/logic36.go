package main

// Platform-independent logic added in Triplem VIP for Windows 3.6:
// triplemvip:// links, notification action buttons, signed update manifests
// and small validation helpers. Pure Go, unit-tested on any OS (logic36_test.go).

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// ---- triplemvip:// links ---------------------------------------------------------
//
//   triplemvip://open/<target>                     e.g. triplemvip://open/reports
//   triplemvip://open/messages/<conversation-id>   a specific conversation
//   triplemvip://open/notifications/<id>           a specific notification
//   triplemvip://action/<action>/<id>?t=<token>    a notification button
//
// Actions only run when <token> matches the one this app process put on its
// own notification. Any other source (a web page, an e-mail, another app) can
// at most OPEN a screen; it can never accept a chat or change data.

const (
	linkScheme    = "triplemvip"
	maxLinkLength = 300
)

var (
	uuidPattern  = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	tokenPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)
	idPattern    = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
	colorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
)

// Actions a notification button may request, and the screen each one falls
// back to when it cannot run (wrong or missing token).
var linkActions = map[string]string{
	"accept-chat":  "notifications",
	"decline-chat": "notifications",
	"mark-read":    "notifications",
	"reply":        "messages",
}

// Targets that may carry a record id.
var idTargets = map[string]bool{"messages": true, "notifications": true}

type linkRequest struct {
	Raw    string `json:"-"`
	Target string `json:"target"`
	ID     string `json:"id,omitempty"`
	Action string `json:"action,omitempty"`
	Token  string `json:"-"`
}

func parseLink(raw string) (linkRequest, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > maxLinkLength || strings.ContainsAny(raw, " \t\r\n\"'<>\\") {
		return linkRequest{}, false
	}
	u, err := url.Parse(raw)
	if err != nil || !strings.EqualFold(u.Scheme, linkScheme) || u.User != nil || u.Fragment != "" {
		return linkRequest{}, false
	}
	// triplemvip://open/x/y -> host "open", path "/x/y"
	kind := strings.ToLower(u.Host)
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" || len(parts) > 2 {
		return linkRequest{}, false
	}
	first := strings.ToLower(parts[0])
	id := ""
	if len(parts) == 2 {
		id = parts[1]
		if !uuidPattern.MatchString(id) {
			return linkRequest{}, false
		}
		id = strings.ToLower(id)
	}
	switch kind {
	case "open":
		if !openTargets[first] || (id != "" && !idTargets[first]) {
			return linkRequest{}, false
		}
		if len(u.Query()) > 0 {
			return linkRequest{}, false
		}
		return linkRequest{Raw: raw, Target: first, ID: id}, true
	case "action":
		fallback, ok := linkActions[first]
		if !ok || id == "" {
			return linkRequest{}, false
		}
		q := u.Query()
		for k := range q {
			if k != "t" {
				return linkRequest{}, false
			}
		}
		token := q.Get("t")
		if token != "" && !tokenPattern.MatchString(token) {
			return linkRequest{}, false
		}
		target := fallback
		if first == "reply" {
			target = "messages"
		}
		return linkRequest{Raw: raw, Target: target, ID: id, Action: first, Token: token}, true
	}
	return linkRequest{}, false
}

// authorizeLink keeps an action only when the token is this process's own
// notification token; otherwise the link just opens the related screen.
// "reply" never changes data (it opens the conversation with the reply box
// focused), so it needs no token.
func authorizeLink(l linkRequest, processToken string) linkRequest {
	if l.Action == "" || l.Action == "reply" {
		return l
	}
	if processToken == "" || l.Token == "" || l.Token != processToken {
		l.Action = ""
	}
	return l
}

func actionLink(action, id, token string) string {
	return linkScheme + "://action/" + action + "/" + id + "?t=" + token
}

func openLink(target, id string) string {
	if id != "" {
		return linkScheme + "://open/" + target + "/" + id
	}
	return linkScheme + "://open/" + target
}

// ---- Notification buttons -----------------------------------------------------------

type toastAction struct {
	Action string `json:"action"`
	ID     string `json:"id"`
}

// sanitizeToastActions keeps at most three known actions with valid ids.
func sanitizeToastActions(in []toastAction) []toastAction {
	out := make([]toastAction, 0, 3)
	seen := map[string]bool{}
	for _, a := range in {
		a.Action = strings.ToLower(strings.TrimSpace(a.Action))
		a.ID = strings.ToLower(strings.TrimSpace(a.ID))
		if _, ok := linkActions[a.Action]; !ok || !uuidPattern.MatchString(a.ID) || seen[a.Action] {
			continue
		}
		seen[a.Action] = true
		out = append(out, a)
		if len(out) == 3 {
			break
		}
	}
	return out
}

func toastActionLabel(action string) string {
	switch action {
	case "accept-chat":
		return "Accept"
	case "decline-chat":
		return "Decline"
	case "mark-read":
		return "Mark as read"
	case "reply":
		return "Reply"
	}
	return "Open"
}

func xmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&apos;")
	return r.Replace(s)
}

// buildToastXML returns the Windows toast document. Every activation is a
// triplemvip:// link (protocol activation), which works whether the app is
// running, hidden in the tray or closed.
func buildToastXML(title, body, target, id string, actions []toastAction, token, logoPath string) string {
	if title == "" {
		title = "Triplem VIP"
	}
	if !openTargets[target] {
		target = "notifications"
	}
	if !idTargets[target] {
		id = ""
	}
	var b strings.Builder
	b.WriteString(`<toast activationType="protocol" launch="` + xmlEscape(openLink(target, id)) + `">`)
	b.WriteString(`<visual><binding template="ToastGeneric">`)
	b.WriteString(`<text hint-maxLines="1">` + xmlEscape(title) + `</text>`)
	if strings.TrimSpace(body) != "" {
		b.WriteString(`<text>` + xmlEscape(body) + `</text>`)
	}
	if logoPath != "" {
		b.WriteString(`<image placement="appLogoOverride" hint-crop="circle" src="` + xmlEscape(fileURL(logoPath)) + `"/>`)
	}
	b.WriteString(`</binding></visual>`)
	if len(actions) > 0 {
		b.WriteString(`<actions>`)
		for _, a := range actions {
			b.WriteString(`<action activationType="protocol" content="` + xmlEscape(toastActionLabel(a.Action)) + `" arguments="` + xmlEscape(actionLink(a.Action, a.ID, token)) + `"/>`)
		}
		b.WriteString(`</actions>`)
	}
	b.WriteString(`</toast>`)
	return b.String()
}

func fileURL(path string) string {
	p := strings.ReplaceAll(path, `\`, "/")
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return "file://" + (&url.URL{Path: p}).EscapedPath()
}

// toastTag is the replace-key for a notification (<= 64 chars, Windows limit).
func toastTag(tag string) string {
	h := strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' || r == ':' {
			return r
		}
		return -1
	}, tag)
	if len(h) > 64 {
		h = h[len(h)-64:]
	}
	return h
}

// ---- Signed update manifest -----------------------------------------------------------
//
// latest.json (published next to the Setup file) contains a base64 payload
// and an Ed25519 signature over exactly those payload bytes. The public key is
// compiled into the app; the private key never leaves the release machine.
// A manifest that is unsigned, signed by another key, for another download
// location or with a malformed hash is ignored.

const updateManifestURL = "https://triplem.vip/Assets/mobile_app/Windows/latest.json"
const updateDownloadPrefix = "https://triplem.vip/Assets/mobile_app/Windows/"

// Triplem VIP update signing key (public half, key id tvip-update-1).
const updatePublicKeyB64 = "m/6uGYB8uwv1/UNlYLAku4mrfXL1Pf02T2DOz5dBWaM="

type signedManifest struct {
	Payload   string `json:"payload"`
	Signature string `json:"signature"`
	KeyID     string `json:"keyId"`
}

type updateManifest struct {
	Product   string `json:"product"`
	Version   string `json:"version"`
	URL       string `json:"url"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
	Notes     string `json:"notes"`
	Published string `json:"published"`
}

var versionPattern = regexp.MustCompile(`^\d{1,4}\.\d{1,4}\.\d{1,6}$`)

func updatePublicKey() ed25519.PublicKey {
	b, err := base64.StdEncoding.DecodeString(updatePublicKeyB64)
	if err != nil || len(b) != ed25519.PublicKeySize {
		return nil
	}
	return ed25519.PublicKey(b)
}

func verifyUpdateManifest(raw []byte, pub ed25519.PublicKey) (updateManifest, error) {
	var m updateManifest
	if len(pub) != ed25519.PublicKeySize {
		return m, errors.New("no update key")
	}
	if len(raw) == 0 || len(raw) > 16*1024 {
		return m, errors.New("manifest size")
	}
	var s signedManifest
	if err := json.Unmarshal(raw, &s); err != nil {
		return m, errors.New("manifest format")
	}
	payload, err := base64.StdEncoding.DecodeString(s.Payload)
	if err != nil || len(payload) == 0 {
		return m, errors.New("manifest payload")
	}
	sig, err := base64.StdEncoding.DecodeString(s.Signature)
	if err != nil || len(sig) != ed25519.SignatureSize || !ed25519.Verify(pub, payload, sig) {
		return m, errors.New("manifest signature")
	}
	if err := json.Unmarshal(payload, &m); err != nil {
		return m, errors.New("manifest content")
	}
	m.SHA256 = strings.ToLower(m.SHA256)
	if m.Product != "triplem-vip-windows" || !versionPattern.MatchString(m.Version) {
		return m, errors.New("manifest product/version")
	}
	if !strings.HasPrefix(m.URL, updateDownloadPrefix) || !strings.HasSuffix(strings.SplitN(m.URL, "?", 2)[0], ".exe") || strings.Contains(m.URL, "..") {
		return m, errors.New("manifest url")
	}
	if b, err := hex.DecodeString(m.SHA256); err != nil || len(b) != 32 {
		return m, errors.New("manifest hash")
	}
	if m.Size < 1<<20 || m.Size > 200<<20 {
		return m, errors.New("manifest size field")
	}
	m.Notes = clampText(m.Notes, 300)
	return m, nil
}

// versionNewer reports whether a is a higher x.y.z version than b.
func versionNewer(a, b string) bool {
	pa, pb := versionParts(a), versionParts(b)
	for i := 0; i < 3; i++ {
		if pa[i] != pb[i] {
			return pa[i] > pb[i]
		}
	}
	return false
}

func versionParts(v string) [3]int {
	var out [3]int
	for i, f := range strings.SplitN(strings.TrimSpace(v), ".", 3) {
		n, _ := strconv.Atoi(f)
		out[i] = n
	}
	return out
}

// ---- Small validators -----------------------------------------------------------------

func cleanID(s string) string {
	s = strings.TrimSpace(s)
	if !idPattern.MatchString(s) {
		return ""
	}
	return s
}

func validHexColor(s string) bool { return colorPattern.MatchString(s) }

// parseHexColor returns a Windows COLORREF (0x00BBGGRR).
func parseHexColor(s string) (uint32, bool) {
	if !validHexColor(s) {
		return 0, false
	}
	v, err := strconv.ParseUint(s[1:], 16, 32)
	if err != nil {
		return 0, false
	}
	r, g, b := uint32(v>>16)&0xff, uint32(v>>8)&0xff, uint32(v)&0xff
	return b<<16 | g<<8 | r, true
}

// colorIsDark uses the relative luminance of a COLORREF (0x00BBGGRR) to pick
// readable title-bar text.
func colorIsDark(c uint32) bool {
	r, g, b := float64(c&0xff), float64(c>>8&0xff), float64(c>>16&0xff)
	return 0.2126*r+0.7152*g+0.0722*b < 140
}

// isWNSChannel accepts only Windows Push Notification Service channel URLs.
func isWNSChannel(raw string) bool {
	if len(raw) > 2048 {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil {
		return false
	}
	h := strings.ToLower(u.Hostname())
	return strings.HasSuffix(h, ".notify.windows.com")
}

// ---- Crash recovery ---------------------------------------------------------------------
//
// If the app ends unexpectedly twice in a row within a short time after start,
// the next start runs in "safe start": optional Windows integrations are
// skipped (the web app itself is unaffected) and the user is offered an error
// report. One clean run resets the counter.

type crashState struct {
	Unclean int    `json:"unclean"`
	Last    string `json:"last,omitempty"`
}

func decodeCrashState(b []byte) crashState {
	var c crashState
	if len(b) > 0 && json.Unmarshal(b, &c) != nil {
		return crashState{}
	}
	if c.Unclean < 0 {
		c.Unclean = 0
	}
	return c
}

func safeStartNeeded(c crashState) bool { return c.Unclean >= 2 }

// redactLogLine removes anything that could identify a user or session from a
// diagnostic log line before it is put in an error report.
var (
	redactURLQuery = regexp.MustCompile(`(https?://[^\s?#]+)\?[^\s]*`)
	redactEmail    = regexp.MustCompile(`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`)
	redactUUID     = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)
	redactUser     = regexp.MustCompile(`(?i)(\\Users\\)[^\\\s]+`)
	redactToken    = regexp.MustCompile(`\b[0-9a-f]{32,}\b`)
)

func redactLogLine(s string) string {
	s = redactURLQuery.ReplaceAllString(s, "$1?[removed]")
	s = redactEmail.ReplaceAllString(s, "[email]")
	s = redactUUID.ReplaceAllString(s, "[id]")
	s = redactUser.ReplaceAllString(s, "${1}[user]")
	s = redactToken.ReplaceAllString(s, "[token]")
	return s
}
