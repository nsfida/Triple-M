package main

// Platform-independent logic added in Triplem VIP for Windows 3.8: the layout
// of the Windows Hello lock screen (so nothing can overflow at any window size
// or display scale), the app-only two-key shortcuts and the automatic backup
// schedule.

import (
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// ---- Lock screen layout -----------------------------------------------------------------

type lkRect struct{ L, T, R, B int32 }

func (r lkRect) W() int32 { return r.R - r.L }
func (r lkRect) H() int32 { return r.B - r.T }

// lockLayoutIn holds the window size and the measured text sizes (pixels).
// Measuring needs GDI, so the Windows code measures and this code places.
type lockLayoutIn struct {
	W, H         int32
	DPI          int
	TitleH       int32 // single line
	SubH         int32 // wrapped to the text width
	LabelW       int32 // widest button label ("Unlock" / "Waiting for Windows Hello…")
	LabelH       int32
	MsgH         int32 // wrapped message (0 when there is none)
	HintH        int32
	LinkW, LinkH int32
}

type lockLayoutOut struct {
	Card, Icon, Title, Sub, Button, Msg, Hint, Divider, Link lkRect
	ShowIcon                                                 bool
	TextW                                                    int32 // width given to wrapped text
}

func lkScale(px, dpi int) int32 {
	if dpi < 96 {
		dpi = 96
	}
	return int32(px * dpi / 96)
}

// lockCardTextWidth returns the width the wrapped texts get on this window
// (needed before measuring them).
func lockCardTextWidth(w int32, dpi int) int32 {
	cw := lockCardWidth(w, dpi)
	tw := cw - 2*lkScale(28, dpi)
	if tw < lkScale(80, dpi) {
		tw = lkScale(80, dpi)
	}
	return tw
}

func lockCardWidth(w int32, dpi int) int32 {
	margin := lkScale(16, dpi)
	cw := lkScale(440, dpi)
	if cw > w-2*margin {
		cw = w - 2*margin
	}
	if cw < lkScale(120, dpi) {
		cw = lkScale(120, dpi)
	}
	return cw
}

func layoutLockScreen(in lockLayoutIn) lockLayoutOut {
	d := in.DPI
	s := func(px int) int32 { return lkScale(px, d) }
	pad := s(28)
	cw := lockCardWidth(in.W, d)
	tw := lockCardTextWidth(in.W, d)
	btnH := s(44)
	if in.LabelH+s(16) > btnH {
		btnH = in.LabelH + s(16)
	}
	btnW := in.LabelW + s(56)
	if btnW < s(200) {
		btnW = s(200)
	}
	if btnW > tw {
		btnW = tw // the label is drawn with an ellipsis if it still does not fit
	}
	content := func(icon bool) int32 {
		h := int32(0)
		if icon {
			h += s(64) + s(16)
		}
		h += in.TitleH + s(6) + in.SubH + s(22) + btnH
		if in.MsgH > 0 {
			h += s(12) + in.MsgH
		}
		h += s(10) + in.HintH + s(16) + 1 + s(12) + in.LinkH
		return h
	}
	showIcon := true
	ch := content(true) + 2*pad
	if ch > in.H-2*s(16) {
		showIcon = false
		ch = content(false) + 2*pad
	}
	left := (in.W - cw) / 2
	top := (in.H - ch) / 2
	if top < s(16) {
		top = s(16)
	}
	out := lockLayoutOut{ShowIcon: showIcon, TextW: tw}
	out.Card = lkRect{left, top, left + cw, top + ch}
	cx := left + cw/2
	tl := left + pad
	y := top + pad
	if showIcon {
		out.Icon = lkRect{cx - s(32), y, cx + s(32), y + s(64)}
		y += s(64) + s(16)
	}
	out.Title = lkRect{tl, y, tl + tw, y + in.TitleH}
	y += in.TitleH + s(6)
	out.Sub = lkRect{tl, y, tl + tw, y + in.SubH}
	y += in.SubH + s(22)
	out.Button = lkRect{cx - btnW/2, y, cx + btnW/2, y + btnH}
	y += btnH
	if in.MsgH > 0 {
		y += s(12)
		out.Msg = lkRect{tl, y, tl + tw, y + in.MsgH}
		y += in.MsgH
	}
	y += s(10)
	out.Hint = lkRect{tl, y, tl + tw, y + in.HintH}
	y += in.HintH + s(16)
	out.Divider = lkRect{tl, y, tl + tw, y + 1}
	y += 1 + s(12)
	lw := in.LinkW + s(12)
	if lw > tw {
		lw = tw
	}
	out.Link = lkRect{cx - lw/2, y, cx + lw/2, y + in.LinkH}
	return out
}

// lockButtonLabel is the text on the lock screen button.
func lockButtonLabel(waiting bool) string {
	if waiting {
		return "Waiting for Windows Hello…"
	}
	return "Unlock"
}

// ---- Backup schedule --------------------------------------------------------------------

// backupSchedule is chosen in the Windows app menu (Backup & Restore). The
// page builds the backup ZIP exactly like Account > Backup & Restore; the app
// only remembers the schedule and saves the file into the chosen folder.
type backupSchedule struct {
	Freq     string `json:"freq"`     // off | daily | weekly | monthly
	Time     string `json:"time"`     // HH:MM, local time
	Weekday  int    `json:"weekday"`  // 0 Sunday … 6 Saturday (weekly)
	Monthday int    `json:"monthday"` // 1 … 28 (monthly)
	Keep     int    `json:"keep"`     // how many backups to keep in the folder (0 = all)
}

func defaultBackupSchedule() backupSchedule {
	return backupSchedule{Freq: "off", Time: "21:00", Weekday: 5, Monthday: 1, Keep: 10}
}

// looksLikeAbsWindowsPath accepts "C:\\…" and "\\\\server\\share\\…" folders.
func looksLikeAbsWindowsPath(p string) bool {
	if len(p) >= 3 && ((p[0] >= 'A' && p[0] <= 'Z') || (p[0] >= 'a' && p[0] <= 'z')) && p[1] == ':' && (p[2] == '\\' || p[2] == '/') {
		return true
	}
	return strings.HasPrefix(p, `\\`) && len(p) > 4
}

var hhmmRe = regexp.MustCompile(`^([01]\d|2[0-3]):([0-5]\d)$`)

func sanitizeBackupSchedule(s backupSchedule) backupSchedule {
	switch s.Freq {
	case "daily", "weekly", "monthly":
	default:
		s.Freq = "off"
	}
	if !hhmmRe.MatchString(s.Time) {
		s.Time = "21:00"
	}
	if s.Weekday < 0 || s.Weekday > 6 {
		s.Weekday = 5
	}
	if s.Monthday < 1 || s.Monthday > 28 {
		s.Monthday = 1
	}
	if s.Keep < 0 || s.Keep > 120 {
		s.Keep = 0
	}
	return s
}

func scheduleClock(s backupSchedule) (int, int) {
	var h, m int
	if mm := hhmmRe.FindStringSubmatch(s.Time); mm != nil {
		h = int(mm[1][0]-'0')*10 + int(mm[1][1]-'0')
		m = int(mm[2][0]-'0')*10 + int(mm[2][1]-'0')
	}
	return h, m
}

// lastScheduledBackup is the most recent moment at or before now when a
// backup was due (zero when the schedule is off).
func lastScheduledBackup(s backupSchedule, now time.Time) time.Time {
	s = sanitizeBackupSchedule(s)
	if s.Freq == "off" {
		return time.Time{}
	}
	h, m := scheduleClock(s)
	loc := now.Location()
	at := time.Date(now.Year(), now.Month(), now.Day(), h, m, 0, 0, loc)
	switch s.Freq {
	case "daily":
		if at.After(now) {
			at = at.AddDate(0, 0, -1)
		}
	case "weekly":
		diff := (int(now.Weekday()) - s.Weekday + 7) % 7
		at = at.AddDate(0, 0, -diff)
		if at.After(now) {
			at = at.AddDate(0, 0, -7)
		}
	case "monthly":
		at = time.Date(now.Year(), now.Month(), s.Monthday, h, m, 0, 0, loc)
		if at.After(now) {
			at = time.Date(now.Year(), now.Month()-1, s.Monthday, h, m, 0, 0, loc)
		}
	}
	return at
}

// nextScheduledBackup is the next due moment after now.
func nextScheduledBackup(s backupSchedule, now time.Time) time.Time {
	s = sanitizeBackupSchedule(s)
	if s.Freq == "off" {
		return time.Time{}
	}
	last := lastScheduledBackup(s, now)
	h, m := scheduleClock(s)
	switch s.Freq {
	case "daily":
		return last.AddDate(0, 0, 1)
	case "weekly":
		return last.AddDate(0, 0, 7)
	default:
		return time.Date(last.Year(), last.Month()+1, s.Monthday, h, m, 0, 0, now.Location())
	}
}

// backupDue says whether a scheduled backup should run now: the latest due
// moment has passed and no backup was made since then. A missed backup (PC
// off or asleep) therefore runs as soon as the app is running again.
func backupDue(s backupSchedule, lastDone, now time.Time) bool {
	due := lastScheduledBackup(s, now)
	if due.IsZero() {
		return false
	}
	return lastDone.Before(due)
}

var backupNameRe = regexp.MustCompile(`^Triplem-VIP-backup-[A-Za-z0-9._-]{1,80}(?: \(\d{1,3}\))?\.zip$`)

// validBackupFileName accepts only the names the page gives backups, so the
// app never writes any other kind of file into the backup folder.
func validBackupFileName(name string) bool {
	return backupNameRe.MatchString(name) && filepath.Base(name) == name && !strings.Contains(name, "..")
}

// backupsToPrune returns the oldest backup files to delete so that only
// `keep` remain. Only files of the same account as the backup just saved are
// considered (same "Triplem-VIP-backup-<user>-" prefix), and only names with
// the backup pattern, so other files in the folder are never touched. Names
// of one account sort by date because they end with the creation time.
func backupsToPrune(names []string, keep int, justSaved string) []string {
	if keep <= 0 || !validBackupFileName(justSaved) {
		return nil
	}
	prefix := backupAccountPrefix(justSaved)
	var mine []string
	for _, n := range names {
		if validBackupFileName(n) && backupAccountPrefix(n) == prefix {
			mine = append(mine, n)
		}
	}
	if len(mine) <= keep {
		return nil
	}
	sortStrings(mine)
	return mine[:len(mine)-keep]
}

var backupStampRe = regexp.MustCompile(`-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}(?: \(\d+\))?\.zip$`)

// backupAccountPrefix is the file name without its date part, e.g.
// "Triplem-VIP-backup-nadeem" for "Triplem-VIP-backup-nadeem-2026-11-06-21-00.zip".
func backupAccountPrefix(name string) string {
	if loc := backupStampRe.FindStringIndex(name); loc != nil {
		return name[:loc[0]]
	}
	return strings.TrimSuffix(name, ".zip")
}

// uniqueBackupPath returns folder\name, or folder\name (2).zip … when a file
// with that name already exists (an existing backup is never overwritten).
func uniqueBackupPath(folder, name string, exists func(string) bool) string {
	p := filepath.Join(folder, name)
	if !exists(p) {
		return p
	}
	base := strings.TrimSuffix(name, ".zip")
	for i := 2; i < 1000; i++ {
		c := filepath.Join(folder, base+" ("+itoa(i)+").zip")
		if !exists(c) {
			return c
		}
	}
	return filepath.Join(folder, base+"-"+itoa(int(time.Now().Unix()))+".zip")
}

// matchesExpectedBackup tells whether a download is the backup the page
// announced. WebView2 may add " (1)" to the default name when the Downloads
// folder already has that file.
func matchesExpectedBackup(downloadName, expected string) bool {
	if expected == "" || !validBackupFileName(expected) {
		return false
	}
	if downloadName == expected {
		return true
	}
	base := strings.TrimSuffix(expected, ".zip")
	return strings.HasPrefix(downloadName, base+" (") && strings.HasSuffix(downloadName, ").zip")
}

func sortStrings(a []string) {
	for i := 1; i < len(a); i++ {
		for j := i; j > 0 && a[j] < a[j-1]; j-- {
			a[j], a[j-1] = a[j-1], a[j]
		}
	}
}
