//go:build windows && store

package main

// Microsoft Store edition: Windows installs and removes the package (Settings >
// Apps or right-click > Uninstall). The app never removes files itself, so a
// stray --uninstall argument does nothing.
func runUninstall() {}
