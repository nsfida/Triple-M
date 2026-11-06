package main

import (
	"strings"
	"testing"
	"time"
)

// The lock screen never overflows: every element stays inside the card, the
// card stays inside the window (when it fits at all), and the button is wide
// enough for its longest label at every size and display scale.
func TestLockLayoutNeverOverflows(t *testing.T) {
	sizes := [][2]int32{{640, 480}, {800, 600}, {1024, 768}, {1366, 768}, {1920, 1080}, {3840, 2160}, {500, 420}, {360, 640}}
	for _, dpi := range []int{96, 120, 144, 192, 240} {
		for _, sz := range sizes {
			s := func(px int) int32 { return lkScale(px, dpi) }
			tw := lockCardTextWidth(sz[0], dpi)
			// Measured sizes as GDI would report them (Segoe UI approximations).
			in := lockLayoutIn{W: sz[0], H: sz[1], DPI: dpi,
				TitleH: s(30), SubH: wrapHeight(s(380), tw, s(20)), LabelW: s(196), LabelH: s(20),
				MsgH: wrapHeight(s(520), tw, s(18)), HintH: wrapHeight(s(150), tw, s(16)), LinkW: s(232), LinkH: s(18)}
			out := layoutLockScreen(in)
			card := out.Card
			for name, r := range map[string]lkRect{"title": out.Title, "sub": out.Sub, "button": out.Button, "msg": out.Msg, "hint": out.Hint, "divider": out.Divider, "link": out.Link} {
				if r == (lkRect{}) {
					continue
				}
				if r.L < card.L || r.R > card.R || r.T < card.T || r.B > card.B {
					t.Fatalf("dpi %d size %v: %s %v outside card %v", dpi, sz, name, r, card)
				}
			}
			if out.Button.W() < in.LabelW+s(16) && out.Button.W() < tw {
				t.Fatalf("dpi %d size %v: button %d too narrow for label %d", dpi, sz, out.Button.W(), in.LabelW)
			}
			if out.Button.W() > tw {
				t.Fatalf("dpi %d size %v: button wider than the text area", dpi, sz)
			}
			if card.L < 0 || card.R > sz[0] {
				t.Fatalf("dpi %d size %v: card %v wider than window", dpi, sz, card)
			}
			if card.H() <= sz[1]-2*s(16) && (card.T < 0 || card.B > sz[1]) {
				t.Fatalf("dpi %d size %v: card %v not inside the window", dpi, sz, card)
			}
			// Order: icon, title, text, button, message, hint, divider, link.
			if out.Title.T >= out.Sub.T || out.Sub.B > out.Button.T || out.Button.B > out.Hint.T || out.Hint.B > out.Divider.T || out.Divider.B > out.Link.T {
				t.Fatalf("dpi %d size %v: elements overlap or are out of order", dpi, sz)
			}
		}
	}
}

func wrapHeight(textW, width, lineH int32) int32 {
	if width <= 0 {
		return lineH
	}
	lines := (textW + width - 1) / width
	if lines < 1 {
		lines = 1
	}
	return lines * lineH
}

func TestLockButtonLabels(t *testing.T) {
	if lockButtonLabel(false) != "Unlock" || !strings.HasPrefix(lockButtonLabel(true), "Waiting") {
		t.Fatal("labels")
	}
}

func TestBackupScheduleSanitize(t *testing.T) {
	s := sanitizeBackupSchedule(backupSchedule{Freq: "hourly", Time: "25:00", Weekday: 9, Monthday: 31, Keep: -1})
	if s.Freq != "off" || s.Time != "21:00" || s.Weekday != 5 || s.Monthday != 1 || s.Keep != 0 {
		t.Fatalf("%+v", s)
	}
	d := defaultBackupSchedule()
	if d.Freq != "off" || d.Keep != 10 {
		t.Fatalf("default %+v", d)
	}
	// Old settings files (3.7) have no backup key: the default is used.
	if got := decodeSettings([]byte(`{"notifications":true,"appLock":false}`)); got.Backup != d {
		t.Fatalf("decode default %+v", got.Backup)
	}
	got := decodeSettings([]byte(`{"backup":{"freq":"weekly","time":"08:30","weekday":1,"monthday":3,"keep":4},"backupFolder":"C:\\Users\\a\\Backups"}`))
	if got.Backup.Freq != "weekly" || got.Backup.Time != "08:30" || got.BackupFolder != `C:\Users\a\Backups` {
		t.Fatalf("decode %+v", got)
	}
	if bad := decodeSettings([]byte(`{"backupFolder":"relative\\dir"}`)); bad.BackupFolder != "" {
		t.Fatal("relative folder accepted")
	}
}

func TestBackupDueTimes(t *testing.T) {
	loc := time.FixedZone("GST", 4*3600)
	at := func(s string) time.Time { v, _ := time.ParseInLocation("2006-01-02 15:04", s, loc); return v }
	daily := backupSchedule{Freq: "daily", Time: "21:00"}
	if got := lastScheduledBackup(daily, at("2026-11-06 20:59")); !got.Equal(at("2026-11-05 21:00")) {
		t.Fatal(got)
	}
	if got := lastScheduledBackup(daily, at("2026-11-06 21:00")); !got.Equal(at("2026-11-06 21:00")) {
		t.Fatal(got)
	}
	if got := nextScheduledBackup(daily, at("2026-11-06 21:01")); !got.Equal(at("2026-11-07 21:00")) {
		t.Fatal(got)
	}
	// Done yesterday after 21:00, now 22:00 today -> due; after today's run -> not due.
	if !backupDue(daily, at("2026-11-05 21:05"), at("2026-11-06 22:00")) {
		t.Fatal("should be due")
	}
	if backupDue(daily, at("2026-11-06 21:01"), at("2026-11-06 22:00")) {
		t.Fatal("already done")
	}
	// Missed for days (PC off): due once as soon as the app runs.
	if !backupDue(daily, at("2026-11-01 21:05"), at("2026-11-06 09:00")) {
		t.Fatal("missed backup should run")
	}
	weekly := backupSchedule{Freq: "weekly", Time: "09:00", Weekday: 5}                                 // Friday
	if got := lastScheduledBackup(weekly, at("2026-11-06 10:00")); !got.Equal(at("2026-11-06 09:00")) { // 2026-11-06 is a Friday
		t.Fatal(got)
	}
	if got := lastScheduledBackup(weekly, at("2026-11-06 08:00")); !got.Equal(at("2026-10-30 09:00")) {
		t.Fatal(got)
	}
	if got := nextScheduledBackup(weekly, at("2026-11-06 10:00")); !got.Equal(at("2026-11-13 09:00")) {
		t.Fatal(got)
	}
	monthly := backupSchedule{Freq: "monthly", Time: "07:15", Monthday: 1}
	if got := lastScheduledBackup(monthly, at("2026-11-06 10:00")); !got.Equal(at("2026-11-01 07:15")) {
		t.Fatal(got)
	}
	if got := lastScheduledBackup(monthly, at("2026-01-01 07:00")); !got.Equal(at("2025-12-01 07:15")) {
		t.Fatal(got)
	}
	if got := nextScheduledBackup(monthly, at("2026-12-05 10:00")); !got.Equal(at("2027-01-01 07:15")) {
		t.Fatal(got)
	}
	if backupDue(backupSchedule{Freq: "off"}, time.Time{}, at("2026-11-06 10:00")) {
		t.Fatal("off is never due")
	}
}

func TestBackupFileNamesAndPruning(t *testing.T) {
	ok := []string{"Triplem-VIP-backup-nadeem-2026-11-06-21-00.zip", "Triplem-VIP-backup-account-2026-01-01-00-00 (2).zip"}
	for _, n := range ok {
		if !validBackupFileName(n) {
			t.Fatal("should accept", n)
		}
	}
	for _, n := range []string{"report.pdf", "Triplem-VIP-backup-x.zip.exe", `..\Triplem-VIP-backup-x.zip`, "Triplem-VIP-backup-../x.zip", "triplem-vip-backup-x.zip", ""} {
		if validBackupFileName(n) {
			t.Fatal("should refuse", n)
		}
	}
	names := []string{
		"Triplem-VIP-backup-nadeem-2026-11-01-21-00.zip",
		"Triplem-VIP-backup-nadeem-2026-11-03-21-00.zip",
		"Triplem-VIP-backup-nadeem-2026-11-02-21-00.zip",
		"Triplem-VIP-backup-nadeem-2026-11-04-21-00.zip",
		"Triplem-VIP-backup-other-2026-10-01-21-00.zip", // another account: never pruned
		"notes.txt",
		"Triplem-VIP-backup-nadeem-2026-11-05-21-00.zip",
	}
	got := backupsToPrune(names, 3, "Triplem-VIP-backup-nadeem-2026-11-05-21-00.zip")
	if strings.Join(got, ",") != "Triplem-VIP-backup-nadeem-2026-11-01-21-00.zip,Triplem-VIP-backup-nadeem-2026-11-02-21-00.zip" {
		t.Fatal(got)
	}
	if backupsToPrune(names, 0, names[0]) != nil || backupsToPrune(names, 10, names[0]) != nil {
		t.Fatal("keep 0 = all, or nothing to prune")
	}
	if backupAccountPrefix("Triplem-VIP-backup-a-b-2026-11-05-21-00 (2).zip") != "Triplem-VIP-backup-a-b" {
		t.Fatal(backupAccountPrefix("Triplem-VIP-backup-a-b-2026-11-05-21-00 (2).zip"))
	}
	if !matchesExpectedBackup("Triplem-VIP-backup-a-2026-11-05-21-00 (1).zip", "Triplem-VIP-backup-a-2026-11-05-21-00.zip") ||
		matchesExpectedBackup("Other.zip", "Triplem-VIP-backup-a-2026-11-05-21-00.zip") || matchesExpectedBackup("x", "") {
		t.Fatal("match")
	}
	existing := map[string]bool{`D:\B\Triplem-VIP-backup-a.zip`: true, `D:\B\Triplem-VIP-backup-a (2).zip`: true}
	p := uniqueBackupPath(`D:\B`, "Triplem-VIP-backup-a.zip", func(s string) bool { return existing[strings.ReplaceAll(s, "/", `\`)] })
	if !strings.HasSuffix(p, "Triplem-VIP-backup-a (3).zip") {
		t.Fatal(p)
	}
}

func TestBridgeAcceptsBackupCommands(t *testing.T) {
	m, ok := parseBridgeMessage(appOrigin+"/", `{"cmd":"backup-schedule","backup":{"freq":"daily","time":"06:00","keep":5}}`)
	if !ok || m.Backup == nil || m.Backup.Freq != "daily" {
		t.Fatal("backup-schedule")
	}
	m, ok = parseBridgeMessage(appOrigin+"/", `{"cmd":"backup-expect","name":"evil.exe","auto":true}`)
	if !ok || m.Name != "" {
		t.Fatal("bad names are dropped")
	}
	if _, ok := parseBridgeMessage("https://example.com/", `{"cmd":"backup-now"}`); ok {
		t.Fatal("other sites cannot start backups")
	}
}
