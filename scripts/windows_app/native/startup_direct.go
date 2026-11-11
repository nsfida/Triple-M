//go:build windows && !store

package main

import "os"

// "Start with Windows" for the direct-download edition: a per-user Run value,
// written only when the user turns the option on. Windows' own Startup Apps
// switch (StartupApproved) is respected.

const (
	runKeyPath          = `Software\Microsoft\Windows\CurrentVersion\Run`
	startupApprovedPath = `Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`
	runValueName        = "Triplem VIP"
)

func directStartupEnabled() bool {
	if regReadBytes(runKeyPath, runValueName) == nil {
		return false
	}
	// Disabled in Task Manager / Settings > Apps > Startup: first byte 0x03.
	if b := regReadBytes(startupApprovedPath, runValueName); len(b) > 0 && b[0]&1 == 1 {
		return false
	}
	return true
}

func setDirectStartup(on bool) {
	if !on {
		regDeleteValue(runKeyPath, runValueName)
		return
	}
	exe, err := os.Executable()
	if err != nil {
		return
	}
	regSetStringValue(runKeyPath, runValueName, `"`+exe+`" --background`)
	// Clear a previous "disabled" mark so the user's explicit choice applies.
	regDeleteValue(startupApprovedPath, runValueName)
}

// removeStartupRegistration is used by the uninstaller.
func removeStartupRegistration() {
	regDeleteValue(runKeyPath, runValueName)
	regDeleteValue(startupApprovedPath, runValueName)
}
