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
