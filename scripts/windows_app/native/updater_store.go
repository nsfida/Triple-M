//go:build windows && store

package main

// Microsoft Store edition: the Store installs every update, so this build has
// no updater at all (no download, no manifest, no Setup launch). These stand-ins
// keep the shared window, tray and bridge code identical in both editions.

const updateTimerID = 0x54564970 // never armed in this edition

func updatesSupported() bool        { return false }
func startUpdateSchedule()          {}
func onUpdateTimer()                {}
func sendUpdateStateToPage()        {}
func checkForUpdates(manual bool)   {}
func installStagedUpdate()          {}
func updateMenuLabel() string       { return "" }
