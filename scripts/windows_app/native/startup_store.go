//go:build windows && store

package main

// Microsoft Store edition: "Start with Windows" is the package's StartupTask,
// managed by Windows (Settings > Apps > Startup). No registry Run value is ever
// written by this edition.

func directStartupEnabled() bool { return false }
func setDirectStartup(on bool)   {}
