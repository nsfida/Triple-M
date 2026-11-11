//go:build windows && !store

package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unsafe"
)

// Automatic updates for the Setup (non-Store) version, 3.6+.
//
//  1. A signed manifest (latest.json) is read from triplem.vip. Its Ed25519
//     signature must match the public key compiled into this app.
//  2. A newer Setup is downloaded in the background to
//     %LOCALAPPDATA%\Triplem VIP\Updates and its size and SHA-256 must match
//     the signed manifest exactly; otherwise it is deleted.
//  3. The user chooses "Restart to update". Setup then replaces only
//     TriplemVIP.exe (settings, sign-in and all data are kept) and restarts it.
//
// The Microsoft Store version is updated by the Store and never runs this.

const (
	updateTimerID        = 0x54564970
	updateFirstCheck     = 90 * time.Second
	updateCheckInterval  = 6 * time.Hour
	maxManifestBytes     = 16 * 1024
	updateUserAgentProto = "TriplemVIP-Windows/"
)

type updateStatus struct {
	State   string `json:"state"` // idle | checking | none | downloading | ready | error | unsupported
	Version string `json:"version,omitempty"`
	Notes   string `json:"notes,omitempty"`
	Error   string `json:"error,omitempty"`
}

var (
	updateMu       sync.Mutex
	updateBusy     bool
	updateState    = updateStatus{State: "idle"}
	updateReadyFor string // staged Setup path
	updateNotified string // version already announced
)

func updatesSupported() bool { return !isPackaged() }

func updatesDir() string { return filepath.Join(appDataDir(), "Updates") }

func startUpdateSchedule() {
	if !updatesSupported() {
		return
	}
	cleanupStagedUpdates()
	procSetTimer.Call(mainHwnd, updateTimerID, uintptr(updateFirstCheck/time.Millisecond), 0)
}

func onUpdateTimer() {
	// After the first check, check every 6 hours.
	procSetTimer.Call(mainHwnd, updateTimerID, uintptr(updateCheckInterval/time.Millisecond), 0)
	if settings.AutoUpdate {
		checkForUpdates(false)
	}
}

// cleanupStagedUpdates removes downloads that are not newer than this version
// (for example after an update was installed) and unfinished downloads.
func cleanupStagedUpdates() {
	entries, err := os.ReadDir(updatesDir())
	if err != nil {
		return
	}
	for _, e := range entries {
		name := e.Name()
		ver := strings.TrimSuffix(strings.TrimSuffix(strings.TrimPrefix(name, "TriplemVIP_Setup-"), ".verified"), ".exe")
		if strings.HasSuffix(name, ".part") || !strings.HasPrefix(name, "TriplemVIP_Setup-") || !versionNewer(ver, appVersionNative) {
			_ = os.Remove(filepath.Join(updatesDir(), name))
		}
	}
}

func setUpdateState(s updateStatus) {
	updateMu.Lock()
	updateState = s
	updateMu.Unlock()
	dispatchUI(func() { sendUpdateStateToPage() })
}

func sendUpdateStateToPage() {
	updateMu.Lock()
	s := updateState
	updateMu.Unlock()
	if !updatesSupported() {
		s = updateStatus{State: "unsupported"}
	}
	postToPage(map[string]interface{}{"type": "update", "state": s.State, "version": s.Version, "notes": s.Notes, "error": s.Error, "current": appVersionNative, "auto": settings.AutoUpdate})
}

// checkForUpdates runs in the background. manual=true reports "up to date".
func checkForUpdates(manual bool) {
	if !updatesSupported() {
		return
	}
	updateMu.Lock()
	if updateBusy || updateState.State == "ready" {
		updateMu.Unlock()
		if manual {
			dispatchUI(sendUpdateStateToPage)
		}
		return
	}
	updateBusy = true
	updateMu.Unlock()
	if manual {
		setUpdateState(updateStatus{State: "checking"})
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				startupLog(fmt.Sprintf("update check failed: %v", r))
			}
			updateMu.Lock()
			updateBusy = false
			updateMu.Unlock()
		}()
		m, err := fetchUpdateManifest()
		if err != nil {
			startupLog("update check: " + err.Error())
			if manual {
				setUpdateState(updateStatus{State: "error", Error: "Could not check for updates. Check your internet connection and try again."})
			}
			return
		}
		if !versionNewer(m.Version, appVersionNative) {
			if manual {
				setUpdateState(updateStatus{State: "none", Version: appVersionNative})
			}
			return
		}
		setUpdateState(updateStatus{State: "downloading", Version: m.Version, Notes: m.Notes})
		path, err := downloadUpdate(m)
		if err != nil {
			startupLog("update download: " + err.Error())
			setUpdateState(updateStatus{State: "error", Version: m.Version, Error: "The update could not be downloaded. It will be tried again later."})
			return
		}
		updateMu.Lock()
		updateReadyFor = path
		updateMu.Unlock()
		setUpdateState(updateStatus{State: "ready", Version: m.Version, Notes: m.Notes})
		dispatchUI(func() { announceUpdate(m.Version) })
	}()
}

func fetchUpdateManifest() (updateManifest, error) {
	u := updateManifestURL + "?t=" + fmt.Sprint(time.Now().Unix()/300)
	var buf bytes.Buffer
	status, err := httpsGet(u, maxManifestBytes, &buf)
	if err != nil {
		return updateManifest{}, err
	}
	if status != 200 {
		return updateManifest{}, fmt.Errorf("manifest HTTP %d", status)
	}
	return verifyUpdateManifest(buf.Bytes(), updatePublicKey())
}

func stagedPath(version string) string {
	return filepath.Join(updatesDir(), "TriplemVIP_Setup-"+version+".exe")
}

func fileMatches(path string, size int64, sum string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || st.Size() != size {
		return false
	}
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return false
	}
	return hex.EncodeToString(h.Sum(nil)) == sum
}

func downloadUpdate(m updateManifest) (string, error) {
	dest := stagedPath(m.Version)
	if fileMatches(dest, m.Size, m.SHA256) {
		writeVerified(dest, m)
		return dest, nil
	}
	if !isTriplemHTTPS(m.URL) {
		return "", errors.New("update address refused")
	}
	if err := os.MkdirAll(updatesDir(), 0700); err != nil {
		return "", err
	}
	part := dest + ".part"
	_ = os.Remove(part)
	f, err := os.OpenFile(part, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return "", err
	}
	h := sha256.New()
	counter := &countingWriter{}
	status, getErr := httpsGet(m.URL, m.Size, io.MultiWriter(f, h, counter))
	closeErr := f.Close()
	if getErr != nil || closeErr != nil || status != 200 || counter.n != m.Size || hex.EncodeToString(h.Sum(nil)) != m.SHA256 {
		_ = os.Remove(part)
		if getErr == nil && status != 200 {
			return "", fmt.Errorf("download HTTP %d", status)
		}
		return "", errors.New("downloaded file did not match the signed update")
	}
	_ = os.Remove(dest)
	if err := os.Rename(part, dest); err != nil {
		_ = os.Remove(part)
		return "", err
	}
	writeVerified(dest, m)
	return dest, nil
}

// writeVerified remembers what the signed manifest promised, so the file is
// checked again right before it is run.
func writeVerified(dest string, m updateManifest) {
	_ = writeFileAtomic(dest+".verified", []byte(m.SHA256+"\n"+fmt.Sprint(m.Size)+"\n"+m.Version+"\n"))
}

func announceUpdate(version string) {
	if updateNotified == version {
		return
	}
	updateNotified = version
	if pageReady {
		sendUpdateStateToPage()
	}
	if !isWindowShown() && settings.Notifications {
		notify(bridgeMessage{Title: "Triplem VIP update ready", Body: "Version " + version + " is ready. Restart Triplem VIP to finish updating.", Target: "notifications", Tag: "update-" + version})
	}
}

// installStagedUpdate verifies the staged Setup again and hands over to it.
func installStagedUpdate() {
	updateMu.Lock()
	path := updateReadyFor
	ver := updateState.Version
	updateMu.Unlock()
	if path == "" || !updatesSupported() {
		return
	}
	meta, err := os.ReadFile(path + ".verified")
	lines := strings.Split(strings.TrimSpace(string(meta)), "\n")
	if err != nil || len(lines) < 3 || lines[2] != ver {
		setUpdateState(updateStatus{State: "error", Error: "The update must be downloaded again."})
		return
	}
	var size int64
	fmt.Sscan(lines[1], &size)
	if !fileMatches(path, size, lines[0]) {
		_ = os.Remove(path)
		_ = os.Remove(path + ".verified")
		updateMu.Lock()
		updateReadyFor = ""
		updateMu.Unlock()
		setUpdateState(updateStatus{State: "error", Error: "The downloaded update was changed on disk and was removed. It will be downloaded again."})
		return
	}
	exe, err := os.Executable()
	if err != nil {
		return
	}
	params := `--update "--dir=` + filepath.Dir(exe) + `"`
	startupLog("installing update " + ver)
	if isWindowShown() {
		saveWindowPlacement()
	}
	r, _, _ := procShellExecuteW.Call(0, uintptr(unsafe.Pointer(utf16Ptr("open"))), uintptr(unsafe.Pointer(utf16Ptr(path))), uintptr(unsafe.Pointer(utf16Ptr(params))), uintptr(unsafe.Pointer(utf16Ptr(filepath.Dir(path)))), SW_SHOW)
	if r <= 32 {
		setUpdateState(updateStatus{State: "error", Version: ver, Error: "Windows could not start the update."})
		return
	}
	// Setup replaces the executable after this process has exited.
	quitApplication()
}

type countingWriter struct{ n int64 }

func (c *countingWriter) Write(p []byte) (int, error) { c.n += int64(len(p)); return len(p), nil }

func updateMenuLabel() string {
	updateMu.Lock()
	defer updateMu.Unlock()
	if updateState.State == "ready" {
		return "Restart to update to " + updateState.Version
	}
	return ""
}
