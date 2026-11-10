package main

// Platform-independent logic for the Triplem VIP Windows client. Everything in
// this file is pure Go (no Win32 calls) so it is unit-tested on any OS
// (see logic_test.go). The Windows-only files call into these helpers.

import (
	"encoding/json"
	"net/url"
	"path/filepath"
	"strings"
)

const (
	appVersionNative = "3.9.1"
	appOrigin        = "https://triplem.vip"
	maxWebMessage    = 64 * 1024
)

// ---- Launch arguments -------------------------------------------------------

// Jump List / tray / notification destinations. The website maps each one to
// an existing screen; nothing else is accepted from the command line.
var openTargets = map[string]bool{
	"new-expense":   true,
	"new-journal":   true,
	"reports":       true,
	"inventory":     true,
	"notifications": true,
	"messages":      true,
	"live-chat":     true,
	// 3.7
	"search":      true,
	"new-invoice": true,
	"offline":     true,
}

type launchArgs struct {
	Uninstall  bool
	Background bool   // started by "Start with Windows": stay in the tray
	Open       string // validated open target or ""
	Link       linkRequest
	Update     bool // relaunched by Setup after an update was applied
}

func parseLaunchArgs(args []string) launchArgs {
	var out launchArgs
	// Started from a triplemvip:// link (registered as: "exe" --link "%1"):
	// only the link is read and every other argument is ignored, so a crafted
	// link can never inject --uninstall or any other option.
	for i, a := range args {
		if strings.EqualFold(strings.TrimSpace(a), "--link") {
			if i+1 < len(args) {
				if l, ok := parseLink(args[i+1]); ok {
					out.Link = l
					out.Open = l.Target
				}
			}
			return out
		}
	}
	for _, a := range args {
		a = strings.TrimSpace(a)
		switch {
		case strings.EqualFold(a, "--uninstall"):
			out.Uninstall = true
		case strings.EqualFold(a, "--background"):
			out.Background = true
		case strings.HasPrefix(strings.ToLower(a), "--open="):
			t := strings.ToLower(strings.TrimSpace(a[len("--open="):]))
			if isOpenTarget(t) { // a fixed screen or a recent record (3.7)
				out.Open = t
			}
		case strings.EqualFold(a, "--updated"):
			out.Update = true
		case strings.HasPrefix(strings.ToLower(a), linkScheme+":"):
			if l, ok := parseLink(a); ok {
				out.Link = l
				out.Open = l.Target
			}
		}
	}
	return out
}

// encodeForwardedArgs/decodeForwardedArgs carry a second launch's arguments to
// the running instance (WM_COPYDATA). Only validated values are forwarded.
func encodeForwardedArgs(a launchArgs) string {
	parts := []string{"triplem-forward-v1"}
	if a.Open != "" {
		parts = append(parts, "--open="+a.Open)
	}
	if a.Background {
		parts = append(parts, "--background")
	}
	if a.Link.Raw != "" {
		parts = append(parts, a.Link.Raw)
	}
	return strings.Join(parts, "\n")
}

func decodeForwardedArgs(s string) (launchArgs, bool) {
	lines := strings.Split(s, "\n")
	if len(lines) == 0 || lines[0] != "triplem-forward-v1" || len(s) > 512 {
		return launchArgs{}, false
	}
	a := parseLaunchArgs(lines[1:])
	a.Uninstall = false // never accepted from another process
	return a, true
}

// ---- Web message security ---------------------------------------------------

// isTrustedAppSource reports whether a WebView2 message source is the live
// Triplem VIP site (exact origin, HTTPS, default port).
func isTrustedAppSource(source string) bool {
	u, err := url.Parse(source)
	if err != nil || u.Scheme != "https" || u.User != nil {
		return false
	}
	return strings.EqualFold(u.Host, "triplem.vip") || strings.EqualFold(u.Host, "www.triplem.vip")
}

// isAppURL decides whether a top-level navigation stays inside the app.
func isAppURL(raw string) bool {
	if raw == "about:blank" || strings.HasPrefix(raw, "data:") || strings.HasPrefix(raw, "blob:https://triplem.vip/") {
		return true
	}
	return isTrustedAppSource(raw)
}

// externalOpenAllowed limits what the app hands to the default browser/app.
func externalOpenAllowed(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	switch strings.ToLower(u.Scheme) {
	case "https", "http":
		return u.Host != ""
	case "mailto", "tel":
		return true
	}
	return false
}

type bridgeMessage struct {
	Cmd     string          `json:"cmd"`
	ID      string          `json:"id,omitempty"`
	Key     string          `json:"key,omitempty"`
	Value   json.RawMessage `json:"value,omitempty"`
	Count   int             `json:"count,omitempty"`
	Title   string          `json:"title,omitempty"`
	Body    string          `json:"body,omitempty"`
	Tag     string          `json:"tag,omitempty"`
	Target  string          `json:"target,omitempty"`
	Kind    string          `json:"kind,omitempty"`
	Visible bool            `json:"visible,omitempty"`
	// 3.6
	Actions []toastAction `json:"actions,omitempty"`
	Dark    bool          `json:"dark,omitempty"`
	Color   string        `json:"color,omitempty"`
	Channel string        `json:"channel,omitempty"`
	// 3.7
	Print   json.RawMessage `json:"print,omitempty"`
	Recent  []recentRecord  `json:"recent,omitempty"`
	Online  *bool           `json:"online,omitempty"`
	Pending int             `json:"pending,omitempty"`
	// 3.8
	Backup *backupSchedule `json:"backup,omitempty"`
	Name   string          `json:"name,omitempty"`
	Auto   bool            `json:"auto,omitempty"`
	Reason string          `json:"reason,omitempty"`
}

var allowedCommands = map[string]bool{
	"ready": true, "badge": true, "notify": true, "settings-get": true, "settings-set": true,
	"print": true, "download-open": true, "download-show": true, "retry": true, "show": true,
	// 3.6
	"update-check": true, "update-install": true, "theme": true, "report": true,
	"push-open": true, "push-close": true,
	// 3.7
	"lock-now": true, "unlock": true, "print-info": true, "print-run": true, "print-pdf": true,
	"print-system": true, "recent": true, "status": true,
	// 3.8
	"backup-schedule": true, "backup-folder": true, "backup-open-folder": true, "backup-now": true,
	"backup-expect": true, "backup-failed": true,
	// 3.9
	"file-read": true, "print-preview": true,
}

// parseBridgeMessage validates a JSON message from the page. Offline pages
// (about:blank) may only ask to retry the connection.
func parseBridgeMessage(source, raw string) (bridgeMessage, bool) {
	var m bridgeMessage
	if len(raw) == 0 || len(raw) > maxWebMessage {
		return m, false
	}
	if err := json.Unmarshal([]byte(raw), &m); err != nil || !allowedCommands[m.Cmd] {
		return bridgeMessage{}, false
	}
	if !isTrustedAppSource(source) {
		if (source == "about:blank" || strings.HasPrefix(source, "data:")) && m.Cmd == "retry" {
			return m, true
		}
		return bridgeMessage{}, false
	}
	m.Title = clampText(m.Title, 63)
	m.Body = clampText(m.Body, 255)
	m.Tag = clampText(m.Tag, 120)
	if m.Count < 0 {
		m.Count = 0
	}
	if m.Target != "" && !isOpenTarget(m.Target) {
		m.Target = ""
	}
	if m.Pending < 0 {
		m.Pending = 0
	}
	if len(m.Recent) > 20 {
		m.Recent = m.Recent[:20]
	}
	m.ID = cleanID(m.ID)
	if m.Name != "" && !validBackupFileName(m.Name) {
		m.Name = ""
	}
	m.Reason = clampText(m.Reason, 200)
	m.Actions = sanitizeToastActions(m.Actions)
	if !validHexColor(m.Color) {
		m.Color = ""
	}
	return m, true
}

func clampText(s string, max int) string {
	s = strings.Map(func(r rune) rune {
		if r < 0x20 && r != '\n' {
			return ' '
		}
		return r
	}, strings.TrimSpace(s))
	r := []rune(s)
	if len(r) > max {
		return string(r[:max-1]) + "…"
	}
	return s
}

// ---- Notification de-duplication ---------------------------------------------

// recentTags is a bounded FIFO set used as a second de-duplication layer
// (the page de-duplicates first, by notification id).
type recentTags struct {
	order []string
	set   map[string]bool
	limit int
}

func newRecentTags(limit int) *recentTags {
	return &recentTags{set: map[string]bool{}, limit: limit}
}

func (r *recentTags) seen(tag string) bool {
	if tag == "" {
		return false
	}
	if r.set[tag] {
		return true
	}
	r.set[tag] = true
	r.order = append(r.order, tag)
	if len(r.order) > r.limit {
		old := r.order[0]
		r.order = r.order[1:]
		delete(r.set, old)
	}
	return false
}

// ---- Settings -----------------------------------------------------------------

type desktopSettings struct {
	Notifications  bool   `json:"notifications"`
	CloseToTray    bool   `json:"closeToTray"`
	CloseHintShown bool   `json:"closeHintShown"`
	LastSaveDir    string `json:"lastSaveDir,omitempty"`
	// 3.6
	AutoUpdate     bool   `json:"autoUpdate"`
	QuickAddHotkey bool   `json:"quickAddHotkey"`
	DeviceID       string `json:"deviceId,omitempty"`
	// 3.6.1: version whose one-time taskbar icon check has run.
	IconRepairVersion string `json:"iconRepairVersion,omitempty"`
	// 3.7
	AppLock         bool     `json:"appLock"`
	LockMinutes     int      `json:"lockMinutes"`
	LockHideDetails bool     `json:"lockHideDetails"`
	TrayBadge       bool     `json:"trayBadge"`
	SaveMemory      bool     `json:"saveMemory"`
	RecentJumpList  bool     `json:"recentJumpList"`
	JumpRemoved     []string `json:"jumpRemoved,omitempty"`
	// 3.8: Backup & Restore in the Windows app
	Backup            backupSchedule `json:"backup"`
	BackupFolder      string         `json:"backupFolder,omitempty"`
	BackupLastDone    int64          `json:"backupLastDone,omitempty"`
	BackupLastAttempt int64          `json:"backupLastAttempt,omitempty"`
	BackupSince       int64          `json:"backupSince,omitempty"`
	BackupLastError   string         `json:"backupLastError,omitempty"`
	BackupLastFile    string         `json:"backupLastFile,omitempty"`
}

// New keys default to "on" for existing 3.5 settings files too, because
// decodeSettings starts from these defaults and only overrides stored keys.
func defaultSettings() desktopSettings {
	return desktopSettings{Notifications: true, CloseToTray: true, AutoUpdate: true, QuickAddHotkey: true,
		LockMinutes: 5, LockHideDetails: true, TrayBadge: true, SaveMemory: true, RecentJumpList: true,
		Backup: defaultBackupSchedule()}
}

// decodeSettings never fails: unknown or damaged files fall back to defaults,
// and missing keys keep their default values.
func decodeSettings(b []byte) desktopSettings {
	s := defaultSettings()
	if len(b) == 0 {
		return s
	}
	var probe map[string]json.RawMessage
	if json.Unmarshal(b, &probe) != nil {
		return defaultSettings()
	}
	_ = json.Unmarshal(b, &s)
	if !validLockMinutes(s.LockMinutes) {
		s.LockMinutes = 5
	}
	s.Backup = sanitizeBackupSchedule(s.Backup)
	if s.BackupFolder != "" && !looksLikeAbsWindowsPath(s.BackupFolder) {
		s.BackupFolder = ""
	}
	if len(s.JumpRemoved) > 50 {
		s.JumpRemoved = s.JumpRemoved[len(s.JumpRemoved)-50:]
	}
	return s
}

// ---- Window placement -----------------------------------------------------------

type irect struct{ L, T, R, B int32 }

func (r irect) w() int32 { return r.R - r.L }
func (r irect) h() int32 { return r.B - r.T }
func (r irect) intersect(o irect) irect {
	out := irect{max32(r.L, o.L), max32(r.T, o.T), min32(r.R, o.R), min32(r.B, o.B)}
	if out.R < out.L {
		out.R = out.L
	}
	if out.B < out.T {
		out.B = out.T
	}
	return out
}

func max32(a, b int32) int32 {
	if a > b {
		return a
	}
	return b
}
func min32(a, b int32) int32 {
	if a < b {
		return a
	}
	return b
}

type savedPlacement struct {
	Version   int   `json:"v"`
	Left      int32 `json:"left"`
	Top       int32 `json:"top"`
	Right     int32 `json:"right"`
	Bottom    int32 `json:"bottom"`
	Maximized bool  `json:"maximized"`
}

const (
	minWindowW = 640
	minWindowH = 480
)

// fitPlacement returns a normal-state window rectangle that is guaranteed to
// be visible on one of the connected monitors' work areas. The saved rectangle
// is kept when its title bar is reachable on some monitor; otherwise it is
// moved (and shrunk if needed) onto the monitor it overlaps most, or onto the
// primary monitor if it overlaps none (e.g. a disconnected second screen).
func fitPlacement(saved irect, workAreas []irect, primary int) irect {
	if len(workAreas) == 0 {
		return saved
	}
	if primary < 0 || primary >= len(workAreas) {
		primary = 0
	}
	best, bestArea := -1, int64(0)
	for i, wa := range workAreas {
		in := saved.intersect(wa)
		if a := int64(in.w()) * int64(in.h()); a > bestArea {
			best, bestArea = i, a
		}
	}
	target := primary
	if best >= 0 {
		target = best
	}
	wa := workAreas[target]
	w := saved.w()
	h := saved.h()
	if w < minWindowW || h < minWindowH || best < 0 && (w <= 0 || h <= 0) {
		w, h = defaultSize(wa)
	}
	if w > wa.w() {
		w = wa.w()
	}
	if h > wa.h() {
		h = wa.h()
	}
	r := irect{saved.L, saved.T, saved.L + w, saved.T + h}
	if best < 0 {
		// Previously used monitor is gone: centre on the primary work area.
		r.L = wa.L + (wa.w()-w)/2
		r.T = wa.T + (wa.h()-h)/2
		return irect{r.L, r.T, r.L + w, r.T + h}
	}
	// Keep fully inside the chosen work area (title bar always reachable).
	if r.R > wa.R {
		r.L -= r.R - wa.R
	}
	if r.B > wa.B {
		r.T -= r.B - wa.B
	}
	if r.L < wa.L {
		r.L = wa.L
	}
	if r.T < wa.T {
		r.T = wa.T
	}
	return irect{r.L, r.T, r.L + w, r.T + h}
}

func defaultSize(wa irect) (int32, int32) {
	w := wa.w() * 85 / 100
	h := wa.h() * 85 / 100
	if w > 1440 {
		w = 1440
	}
	if h > 920 {
		h = 920
	}
	if w < minWindowW {
		w = min32(minWindowW, wa.w())
	}
	if h < minWindowH {
		h = min32(minWindowH, wa.h())
	}
	return w, h
}

// ---- Save As helpers -----------------------------------------------------------

type saveFilter struct{ Label, Pattern string }

var knownExtensions = map[string]saveFilter{
	".pdf":  {"PDF document", "*.pdf"},
	".xlsx": {"Excel workbook", "*.xlsx"},
	".xls":  {"Excel 97-2003 workbook", "*.xls"},
	".csv":  {"CSV file", "*.csv"},
	".json": {"JSON file", "*.json"},
	".txt":  {"Text file", "*.txt"},
	".png":  {"PNG image", "*.png"},
	".zip":  {"ZIP archive", "*.zip"},
}

// sanitizeFileName makes a suggested download name safe for the Save dialog.
func sanitizeFileName(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if r < 0x20 || strings.ContainsRune(`<>:"/\|?*`, r) {
			return '_'
		}
		return r
	}, name)
	name = strings.Trim(name, " .")
	if name == "" {
		name = "Triplem VIP export"
	}
	if len([]rune(name)) > 180 {
		ext := filepath.Ext(name)
		r := []rune(strings.TrimSuffix(name, ext))
		name = string(r[:180-len([]rune(ext))]) + ext
	}
	return name
}

// ensureExtension keeps the export's real file type: if the user typed a
// different (or no) extension, the original one is appended.
func ensureExtension(chosen, originalExt string) string {
	if originalExt == "" {
		return chosen
	}
	if strings.EqualFold(filepath.Ext(chosen), originalExt) {
		return chosen
	}
	return chosen + strings.ToLower(originalExt)
}

// saveDialogFilter builds the double-NUL separated filter string.
func saveDialogFilter(ext string) string {
	var b strings.Builder
	if f, ok := knownExtensions[strings.ToLower(ext)]; ok {
		b.WriteString(f.Label + " (" + f.Pattern + ")\x00" + f.Pattern + "\x00")
	} else if ext != "" {
		p := "*" + strings.ToLower(ext)
		b.WriteString(strings.ToUpper(strings.TrimPrefix(ext, ".")) + " file (" + p + ")\x00" + p + "\x00")
	}
	b.WriteString("All files (*.*)\x00*.*\x00\x00")
	return b.String()
}

// ---- Badge --------------------------------------------------------------------------

func badgeText(n int) string {
	switch {
	case n <= 0:
		return ""
	case n > 9:
		return "9+"
	default:
		return string(rune('0' + n))
	}
}

func trayTooltip(n int, signedOutOrUnknown bool) string {
	if n <= 0 || signedOutOrUnknown {
		return "Triplem VIP"
	}
	if n == 1 {
		return "Triplem VIP - 1 unread notification"
	}
	return "Triplem VIP - " + itoa(n) + " unread notifications"
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

func runtimeArchFolder(goarch string) string {
	switch goarch {
	case "arm64":
		return "arm64"
	case "386":
		return "x86"
	default:
		return "x64"
	}
}
