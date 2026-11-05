# Update 2026-11-05: no notification prompts in the Windows app

**Why:** the Windows app runs the site inside Microsoft WebView2, which cannot receive Web Push. Before this update, the app still asked users to turn notifications on, and they could never get them.

**What changed (Windows app only):**
- The page detects the Windows app before anything is shown. WebView2 exposes `window.chrome.webview`, which normal browsers and mobile do not.
- The Windows app now hides:
  - the "Enable secure alerts" overlay, both before sign-in and after sign-in;
  - the visitor "Alerts" switch, in the desktop header and in the mobile menu;
  - the signed-in quick notification switch and the "Enable device notifications" footer in the notifications menu.
- The in-app notification bell and its list still work, because they don't depend on device push.
- This works for copies of the Windows app that are already installed and for the Microsoft Store version. No new app build or reinstall is needed.

**Unchanged:**
- Web browsers and mobile keep every notification prompt and switch exactly as before.
- Admins can still send push notifications to web and mobile users.

**Files changed:**
- `index.html`: early detection script, scoped CSS rules, and a bumped push script version.
- `Assets/app/notifications/01-web-push.js`: `isWindowsApp()`; `supported()` returns false in the Windows app; the consent overlay is guarded.
- `service-worker.js`: cache version changed to `v191-windows-push1`, so returning visitors get the update.
- Tests: `tests/windows-installer-glass.test.js` (new test) and `tests/critical-release-hardening.test.js` (cache name).

**Database:** no change, and no migration is needed.
