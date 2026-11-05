# Triplem VIP Windows client security model

The public Windows download is a single `TriplemVIP_Setup.exe`. Setup contains one native
`TriplemVIP.exe` payload compiled specifically for the Windows client. The installed app renders
`https://triplem.vip/` inside Microsoft's Evergreen WebView2 Runtime.

## Installation safety

- Setup and the installed application are separate binaries. The installer never copies itself as the app.
- The application payload is embedded at build time and SHA-256 verified before and after extraction.
- Installation is per-user by default and does not require elevation.
- No PowerShell, command shell, WScript, execution-policy changes, Defender exclusions, firewall changes, PE rewriting, or Windows-security bypasses are used.
- Desktop and Start Menu `.lnk` files are written directly according to Microsoft's Shell Link file format, avoiding script hosts and fragile installer-time COM automation.
- Setup writes an installation diagnostic log to `%TEMP%\\TriplemVIP-Setup.log`; installation errors are shown instead of intentionally terminating silently.
- Icon and manifest resources are embedded at build time, never rewritten on the user's PC.
- Taskbar pinning is requested by the running app through Windows' supported taskbar API and remains subject to Windows confirmation/policy.

## Runtime

Triplem VIP uses the installed Evergreen WebView2 Runtime and stores WebView2 user data under the
current user's local app-data directory. The runtime receives Microsoft servicing updates.

## Production signing

Public releases should be Authenticode-signed with a trusted publisher certificate. Signing is the
correct production path for Publisher identity and SmartScreen reputation; the app never attempts
to suppress or weaken Windows reputation/security checks.

## Setup interface (3.4.0)

Setup shows a glass-style interface rendered by the already-installed Microsoft Edge WebView2 Runtime. The runtime is loaded from its Program Files location with `LoadLibraryExW`, exactly as the installed app does. Nothing is downloaded and nothing is loaded from memory. The page is embedded in the executable and locked by a `default-src 'none'` Content-Security-Policy with no network access. If the runtime is missing or the interface cannot start within 12 seconds, the classic native wizard runs instead.

Installation (verified payload + Apps & features registration) runs first. Desktop shortcut, Start Menu icon and taskbar pin are chosen on the final page and applied when the user clicks Finish. Setup never pins anything itself. If Pin on Taskbar was chosen, the app opens and asks Windows, which shows its own confirmation, as Microsoft requires.

Both executables carry version information (company, product, description, version). Code signing is documented in `docs/WINDOWS-APP-SIGNING.md`.

## Desktop integration (3.5.0)

- The page can talk to the app only through `chrome.webview.postMessage`, and the
  app accepts messages only from `https://triplem.vip` and only a fixed list of
  commands (`native/logic.go: parseBridgeMessage`). The offline page may only ask
  to retry the connection.
- Other websites never load inside the app; links open in the default browser
  (http/https/mailto/tel only). DevTools and host objects are disabled.
- Files can be opened from the page only by the id of a file the app itself saved
  through the Save As dialog - never by a path supplied by the page.
- A second launch forwards only validated `--open=` targets to the running app;
  another process can never trigger uninstall.
- No elevation, no script hosts, no security-setting changes. "Start with Windows"
  uses the per-user Run key (or the MSIX StartupTask) and respects the user's
  choice in Windows Settings > Apps > Startup.
