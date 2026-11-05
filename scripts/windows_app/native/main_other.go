//go:build !windows

// Lets the platform-independent logic be unit-tested on Linux/macOS
// (go test). The real entry point is main() in main.go (Windows only).
package main

func main() {}
