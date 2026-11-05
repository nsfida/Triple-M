package main

// Platform-independent logic added in Triplem VIP for Windows 3.7: app lock
// (Windows Hello) timing, native print options, Jump List recent records,
// extra global shortcuts, background memory policy and the unread count on
// the notification-area icon. Pure Go, unit-tested on any OS (logic37_test.go).

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ---- App lock --------------------------------------------------------------------------

// lockMinuteChoices are the "Lock after" options offered in the app. 0 means
// "as soon as the window is closed or minimised".
var lockMinuteChoices = []int{0, 1, 5, 15, 30, 60}

func validLockMinutes(n int) bool {
	for _, v := range lockMinuteChoices {
		if v == n {
			return true
		}
	}
	return false
}

// lockOnReturn decides whether the window must be locked when it is shown
// again after it was hidden (closed to the tray) or minimised at awayFrom.
func lockOnReturn(enabled bool, minutes int, awayFrom, now time.Time) bool {
	if !enabled || awayFrom.IsZero() {
		return false
	}
	if minutes <= 0 {
		return true
	}
	return now.Sub(awayFrom) >= time.Duration(minutes)*time.Minute
}

// lockForIdle decides whether a visible, unlocked window must lock because
// nobody used the PC for the chosen time. "Immediately" (0) only locks when
// the window is hidden or minimised, so it never interrupts active work; it
// still locks after 15 idle minutes.
func lockForIdle(enabled bool, minutes int, idle time.Duration) bool {
	if !enabled {
		return false
	}
	if minutes <= 0 {
		minutes = 15
	}
	return idle >= time.Duration(minutes)*time.Minute
}

// Windows Hello results (UserConsentVerificationResult / ...Availability).
const (
	helloVerified       = 0
	helloDeviceMissing  = 1
	helloNotConfigured  = 2
	helloDisabledPolicy = 3
	helloDeviceBusy     = 4
	helloRetriesUsed    = 5
	helloCanceled       = 6
)

func helloResultText(code int) string {
	switch code {
	case helloVerified:
		return ""
	case helloDeviceMissing:
		return "No Windows Hello device (camera, fingerprint reader or PIN) is available on this PC."
	case helloNotConfigured:
		return "Windows Hello is not set up for your Windows account. Set up a PIN, face or fingerprint in Windows Settings > Accounts > Sign-in options."
	case helloDisabledPolicy:
		return "Windows Hello is turned off by your organisation's policy."
	case helloDeviceBusy:
		return "Windows Hello is busy. Try again in a moment."
	case helloRetriesUsed:
		return "Too many attempts. Wait a moment, then try again."
	case helloCanceled:
		return "Verification was cancelled."
	default:
		return "Windows Hello could not verify you."
	}
}

// ---- Global shortcuts ------------------------------------------------------------------

type hotkeyDef struct {
	ID     uintptr
	Key    uint16 // virtual-key code (letter)
	Target string // open target
	Label  string
}

// All shortcuts use Ctrl+Alt+Shift so they do not collide with common
// application shortcuts. Each is registered separately: if another program
// owns one combination, only that one is reported as unavailable.
var globalHotkeys = []hotkeyDef{
	{ID: 0x5456, Key: 'E', Target: "new-expense", Label: "Ctrl+Alt+Shift+E"},
	{ID: 0x5457, Key: 'F', Target: "search", Label: "Ctrl+Alt+Shift+F"},
	{ID: 0x5458, Key: 'I', Target: "new-invoice", Label: "Ctrl+Alt+Shift+I"},
}

func hotkeyTarget(id uintptr) string {
	for _, h := range globalHotkeys {
		if h.ID == id {
			return h.Target
		}
	}
	return ""
}

// ---- Jump List recent records ----------------------------------------------------------

type recentRecord struct {
	Kind  string `json:"kind"` // "doc" (accounting document) or "wallet"
	ID    string `json:"id"`
	Title string `json:"title"`
}

const maxRecentRecords = 6

var recentKinds = map[string]bool{"doc": true, "wallet": true}

// recordTarget is the --open value of a recent record ("wallet:<uuid>").
func recordTarget(kind, id string) string {
	return kind + ":" + strings.ToLower(id)
}

// parseRecordTarget validates "doc:<uuid>" / "wallet:<uuid>".
func parseRecordTarget(s string) (kind, id string, ok bool) {
	i := strings.IndexByte(s, ':')
	if i <= 0 {
		return "", "", false
	}
	kind, id = strings.ToLower(s[:i]), s[i+1:]
	if !recentKinds[kind] || !uuidPattern.MatchString(id) {
		return "", "", false
	}
	return kind, strings.ToLower(id), true
}

func isOpenTarget(s string) bool {
	if openTargets[s] {
		return true
	}
	_, _, ok := parseRecordTarget(s)
	return ok
}

// sanitizeRecent keeps at most six valid, distinct records with short,
// single-line titles. blocked holds Jump List arguments the user removed.
func sanitizeRecent(in []recentRecord, blocked map[string]bool) []recentRecord {
	out := make([]recentRecord, 0, maxRecentRecords)
	seen := map[string]bool{}
	for _, r := range in {
		kind := strings.ToLower(strings.TrimSpace(r.Kind))
		id := strings.ToLower(strings.TrimSpace(r.ID))
		if !recentKinds[kind] || !uuidPattern.MatchString(id) {
			continue
		}
		t := recordTarget(kind, id)
		if seen[t] || blocked["--open="+t] {
			continue
		}
		title := clampText(strings.ReplaceAll(r.Title, "\n", " "), 60)
		if title == "" {
			continue
		}
		seen[t] = true
		out = append(out, recentRecord{Kind: kind, ID: id, Title: title})
		if len(out) == maxRecentRecords {
			break
		}
	}
	return out
}

func recentSignature(list []recentRecord) string {
	parts := make([]string, len(list))
	for i, r := range list {
		parts[i] = r.Kind + ":" + r.ID + ":" + r.Title
	}
	return strings.Join(parts, "|")
}

// ---- Native print options --------------------------------------------------------------

type printOptions struct {
	Printer     string `json:"printer"`
	Copies      int    `json:"copies"`
	Pages       string `json:"pages"`       // "" = all, else "1-3,5"
	Orientation string `json:"orientation"` // portrait | landscape
	Paper       string `json:"paper"`       // default | a4 | a5 | a3 | letter | legal
	Margins     string `json:"margins"`     // default | none | narrow | normal | wide
	Color       string `json:"color"`       // default | color | bw
	Duplex      string `json:"duplex"`      // default | one | long | short
	Scale       int    `json:"scale"`       // percent, 10-200 (100 = actual size)
	Backgrounds bool   `json:"backgrounds"`
	Headers     bool   `json:"headers"`
	FileName    string `json:"fileName"` // suggested PDF name
}

type paperSize struct{ W, H float64 } // inches, portrait

var paperSizes = map[string]paperSize{
	"a3":     {11.69, 16.54},
	"a4":     {8.27, 11.69},
	"a5":     {5.83, 8.27},
	"letter": {8.5, 11},
	"legal":  {8.5, 14},
}

// marginInches maps the margin choices to inches (all four sides).
var marginInches = map[string]float64{
	"none":   0,
	"narrow": 0.25,
	"normal": 0.4,
	"wide":   0.75,
}

var pageRangePattern = regexp.MustCompile(`^\s*\d{1,4}(\s*-\s*\d{1,4})?(\s*,\s*\d{1,4}(\s*-\s*\d{1,4})?)*\s*$`)

// normalizePageRanges validates a page selection such as "1-3, 5" and returns
// it in WebView2's format ("1-3,5"), or "" for all pages.
func normalizePageRanges(s string) (string, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", true
	}
	if len(s) > 120 || !pageRangePattern.MatchString(s) {
		return "", false
	}
	parts := strings.Split(strings.ReplaceAll(s, " ", ""), ",")
	for _, p := range parts {
		a, b := p, p
		if i := strings.IndexByte(p, '-'); i >= 0 {
			a, b = p[:i], p[i+1:]
		}
		x, _ := strconv.Atoi(a)
		y, _ := strconv.Atoi(b)
		if x < 1 || y < x {
			return "", false
		}
	}
	return strings.Join(parts, ","), true
}

// sanitizePrintOptions fills defaults and rejects values WebView2 would not
// accept. printers lists the installed printers (an unknown name prints to
// the default printer instead of failing).
func sanitizePrintOptions(o printOptions, printers []string) (printOptions, error) {
	if o.Printer != "" {
		found := false
		for _, p := range printers {
			if p == o.Printer {
				found = true
				break
			}
		}
		if !found {
			o.Printer = ""
		}
	}
	if o.Copies < 1 {
		o.Copies = 1
	}
	if o.Copies > 99 {
		o.Copies = 99
	}
	pages, ok := normalizePageRanges(o.Pages)
	if !ok {
		return o, fmt.Errorf("Pages must look like 1-3, 5")
	}
	o.Pages = pages
	if o.Orientation != "landscape" {
		o.Orientation = "portrait"
	}
	if _, ok := paperSizes[o.Paper]; !ok {
		o.Paper = "default"
	}
	if _, ok := marginInches[o.Margins]; !ok {
		o.Margins = "default"
	}
	switch o.Color {
	case "color", "bw":
	default:
		o.Color = "default"
	}
	switch o.Duplex {
	case "one", "long", "short":
	default:
		o.Duplex = "default"
	}
	if o.Scale == 0 {
		o.Scale = 100
	}
	if o.Scale < 10 || o.Scale > 200 {
		return o, fmt.Errorf("Scale must be between 10 and 200 percent")
	}
	o.FileName = sanitizeFileName(o.FileName)
	if !strings.HasSuffix(strings.ToLower(o.FileName), ".pdf") {
		o.FileName = strings.TrimSuffix(o.FileName, ".") + ".pdf"
	}
	return o, nil
}

// pageSizeInches returns the paper size for the chosen orientation.
func pageSizeInches(o printOptions) (w, h float64, ok bool) {
	p, ok := paperSizes[o.Paper]
	if !ok {
		return 0, 0, false
	}
	if o.Orientation == "landscape" {
		return p.H, p.W, true
	}
	return p.W, p.H, true
}

func printColorMode(o printOptions) int32 {
	switch o.Color {
	case "color":
		return 1
	case "bw":
		return 2
	}
	return 0
}

func printDuplexMode(o printOptions) int32 {
	switch o.Duplex {
	case "one":
		return 1
	case "long":
		return 2
	case "short":
		return 3
	}
	return 0
}

func decodePrintOptions(raw json.RawMessage) (printOptions, bool) {
	var o printOptions
	if len(raw) == 0 || len(raw) > 4096 || json.Unmarshal(raw, &o) != nil {
		return o, false
	}
	return o, true
}

func sortedPrinters(names []string) []string {
	out := make([]string, 0, len(names))
	seen := map[string]bool{}
	for _, n := range names {
		n = strings.TrimSpace(n)
		if n == "" || seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, n)
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i]) < strings.ToLower(out[j]) })
	return out
}

// ---- Background memory -----------------------------------------------------------------

// canSuspendPage reports whether the page may be paused completely while the
// app sits in the notification area. The Setup version checks for new
// notifications from the page, so it is only paused when notifications are
// off. The Store version receives notifications through Windows (push), so it
// can always be paused once the push channel is active.
func canSuspendPage(saveMemory, notifications, packaged, pushActive bool) bool {
	if !saveMemory {
		return false
	}
	if !notifications {
		return true
	}
	return packaged && pushActive
}

// ---- Notification-area unread count ----------------------------------------------------

// trayBadgeLayout returns the size and top-left position of the unread badge
// drawn over an icon of the given size (bottom-right corner).
func trayBadgeLayout(icon int) (size, x, y int) {
	size = (icon*10 + 8) / 16 // ~62%: 10 px on a 16 px icon
	if size < 9 {
		size = 9
	}
	if size > icon {
		size = icon
	}
	return size, icon - size, icon - size
}

// composeOver draws src (straight-alpha 0xAARRGGBB) over dst at (ox, oy).
func composeOver(dst []uint32, dstSize int, src []uint32, srcSize, ox, oy int) {
	for y := 0; y < srcSize; y++ {
		for x := 0; x < srcSize; x++ {
			dx, dy := ox+x, oy+y
			if dx < 0 || dy < 0 || dx >= dstSize || dy >= dstSize {
				continue
			}
			s := src[y*srcSize+x]
			sa := float64(s>>24) / 255
			if sa <= 0 {
				continue
			}
			d := dst[dy*dstSize+dx]
			da := float64(d>>24) / 255
			oa := sa + da*(1-sa)
			if oa <= 0 {
				dst[dy*dstSize+dx] = 0
				continue
			}
			ch := func(shift uint) uint32 {
				sc := float64((s >> shift) & 0xFF)
				dc := float64((d >> shift) & 0xFF)
				return uint32((sc*sa+dc*da*(1-sa))/oa+0.5) & 0xFF
			}
			dst[dy*dstSize+dx] = uint32(oa*255+0.5)<<24 | ch(16)<<16 | ch(8)<<8 | ch(0)
		}
	}
}

// scaleImage downsamples a straight-alpha square image with area averaging
// (alpha-weighted, so transparent edges do not darken).
func scaleImage(src []uint32, srcSize, dstSize int) []uint32 {
	dst := make([]uint32, dstSize*dstSize)
	if srcSize <= 0 || dstSize <= 0 {
		return dst
	}
	ratio := float64(srcSize) / float64(dstSize)
	for y := 0; y < dstSize; y++ {
		for x := 0; x < dstSize; x++ {
			x0, x1 := float64(x)*ratio, float64(x+1)*ratio
			y0, y1 := float64(y)*ratio, float64(y+1)*ratio
			var sa, sr, sg, sb, area float64
			for sy := int(y0); sy < int(y1+0.999) && sy < srcSize; sy++ {
				for sx := int(x0); sx < int(x1+0.999) && sx < srcSize; sx++ {
					wx := minF(x1, float64(sx+1)) - maxF(x0, float64(sx))
					wy := minF(y1, float64(sy+1)) - maxF(y0, float64(sy))
					if wx <= 0 || wy <= 0 {
						continue
					}
					w := wx * wy
					p := src[sy*srcSize+sx]
					a := float64(p>>24) / 255
					sa += a * w
					sr += float64((p>>16)&0xFF) * a * w
					sg += float64((p>>8)&0xFF) * a * w
					sb += float64(p&0xFF) * a * w
					area += w
				}
			}
			if area <= 0 || sa <= 0 {
				continue
			}
			alpha := sa / area
			dst[y*dstSize+x] = uint32(alpha*255+0.5)<<24 | uint32(sr/sa+0.5)<<16 | uint32(sg/sa+0.5)<<8 | uint32(sb/sa+0.5)
		}
	}
	return dst
}

func minF(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// trayBadgeImage draws the unread count over the app icon (size x size).
func trayBadgeImage(base []uint32, size, unread int) []uint32 {
	out := append([]uint32(nil), base...)
	text := badgeText(unread)
	if text == "" {
		return out
	}
	bs, x, y := trayBadgeLayout(size)
	b := renderBadge(bs, text)
	composeOver(out, size, b.Pix, bs, x, y)
	return out
}

// trayTooltipFull adds the connection and sync state reported by the page.
func trayTooltipFull(unread int, online bool, pending int, locked bool) string {
	t := trayTooltip(unread, false)
	var extra []string
	if locked {
		extra = append(extra, "Locked")
	}
	if !online {
		extra = append(extra, "Offline")
	}
	if pending > 0 {
		if pending == 1 {
			extra = append(extra, "1 change waiting to sync")
		} else {
			extra = append(extra, fmt.Sprintf("%d changes waiting to sync", pending))
		}
	}
	if len(extra) > 0 {
		t += " · " + strings.Join(extra, " · ")
	}
	r := []rune(t)
	if len(r) > 127 {
		t = string(r[:126]) + "…"
	}
	return t
}
