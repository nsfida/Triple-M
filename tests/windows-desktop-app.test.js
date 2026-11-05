"use strict";

/* Guards for the Triplem VIP Windows desktop features (app 3.5.0):
 * native notifications, tray, unread badge, Jump List, Save As / print,
 * window placement, Windows Hello, offline page, ARM64 and signing. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const has = rel => fs.existsSync(path.join(root, rel));
const text = rel => fs.readFileSync(path.join(root, rel), "utf8");
const nativeDir = "scripts/windows_app/native";
const skipNative = has(`${nativeDir}/bridge.go`) ? false : "Windows app source not present in this checkout";
const nativeSource = () => fs.readdirSync(path.join(root, nativeDir)).filter(f => f.endsWith(".go")).map(f => text(`${nativeDir}/${f}`)).join("\n");

test("platform-independent native logic passes its Go unit tests", { skip: skipNative || (spawnSync("go", ["version"]).status !== 0 && "Go toolchain not installed") }, () => {
  const r = spawnSync("go", ["test", "."], { cwd: path.join(root, nativeDir), env: { ...process.env, GO111MODULE: "off" }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("web messages are accepted only from https://triplem.vip and only for known commands", { skip: skipNative }, () => {
  const src = nativeSource();
  assert.match(src, /m, ok := parseBridgeMessage\(source, raw\)/);
  assert.match(src, /func isTrustedAppSource\(source string\) bool/);
  assert.match(src, /var allowedCommands = map\[string\]bool\{/);
  assert.match(src, /source == "about:blank" \|\| strings\.HasPrefix\(source, "data:"\)\) && m\.Cmd == "retry"/);
  // Other sites never load inside the app; they open in the default browser.
  assert.match(src, /vcall\(args, navStartingSetCancel, 1\)/);
  assert.match(src, /if externalOpenAllowed\(uri\) \{\s*openURL\(uri\)/);
  // DevTools and host objects are off; web notifications are denied (native ones are used).
  assert.match(src, /vcall\(settingsPtr, settingsSetDevToolsEnabled, 0\)/);
  assert.match(src, /vcall\(settingsPtr, settingsSetHostObjects, 0\)/);
  assert.match(src, /permissionNotifications \{[\s\S]{0,200}permissionStateDeny/);
});

test("tray, close-to-tray, quit, single instance and Start with Windows are implemented natively", { skip: skipNative }, () => {
  const src = nativeSource();
  for (const item of ["Open Triplem VIP", "Quick Add Expense", "Quit Triplem VIP", "Start with Windows", "Windows notifications"]) {
    assert.ok(src.includes(`"${item}"`), `tray menu item ${item}`);
  }
  assert.match(src, /case WM_CLOSE:\s*if !quitting && settings\.CloseToTray \{\s*hideToTray\(\)/);
  assert.match(src, /procShellNotifyIconW\.Call\(NIM_ADD/);
  assert.match(src, /wmTaskbarCreated[\s\S]{0,120}addTrayIcon\(\)/, "tray icon is restored after Explorer restarts");
  assert.match(src, /Local\\TriplemVIP\.Desktop\.SingleInstance/);
  assert.match(src, /WM_COPYDATA/);
  assert.match(src, /runKeyPath\s*= `Software\\Microsoft\\Windows\\CurrentVersion\\Run`/);
  assert.match(src, /`"`\+exe\+`" --background`/);
  assert.match(src, /Windows\.ApplicationModel\.StartupTask/);
  assert.match(src, /StartupApproved/);
});

test("native notifications are de-duplicated and suppressed while the app is in the foreground", { skip: skipNative }, () => {
  const src = nativeSource();
  assert.match(src, /if !settings\.Notifications \|\| nativeDedupe\.seen\(m\.Tag\) \{/);
  assert.match(src, /if isWindowShown\(\) && isForeground\(\) \{/);
  assert.match(src, /d\.UFlags = NIF_INFO/);
  assert.match(src, /case NIN_BALLOONUSERCLICK:/);
  assert.match(src, /backgroundTickTimerID, 60\*1000/);
});

test("taskbar badge and Jump List use the documented shell interfaces", { skip: skipNative }, () => {
  const src = nativeSource();
  assert.match(src, /tbSetOverlayIcon\s*= 18/);
  assert.match(src, /TaskbarButtonCreated/);
  for (const t of ["New Expense", "New Journal Entry", "Reports", "Inventory"]) assert.ok(src.includes(`{"${t}", `), `jump task ${t}`);
  assert.match(src, /"--open="\+t\.target/);
  assert.match(src, /cdlAddUserTasks\s*= 7/);
  assert.match(src, /cdlCommitList\s*= 8/);
});

test("exports use the Windows Save As dialog with overwrite confirmation and verified completion", { skip: skipNative }, () => {
  const src = nativeSource();
  assert.match(src, /wv4AddDownloadStarting\s*= 75/);
  assert.match(src, /OFN_OVERWRITEPROMPT \| OFN_HIDEREADONLY \| OFN_NOCHANGEDIR \| OFN_PATHMUSTEXIST/);
  assert.match(src, /final := ensureExtension\(chosen, ext\)/);
  assert.match(src, /st\.Size\(\) == 0 \|\| \(rec\.total > 0 && st\.Size\(\) != rec\.total\)/);
  assert.match(src, /procSHOpenFolderAndSelectItems/);
  // Only files saved by the app can be opened through the bridge (no arbitrary paths from the page).
  assert.match(src, /path, ok := completedFiles\[id\]/);
  assert.match(src, /wv16ShowPrintUI\s*= 114/);
  assert.match(src, /vcall\(webView16, wv16ShowPrintUI, printDialogSystem\)/);
});

test("window placement is validated against connected monitors; offline page has retry and auto-reconnect", { skip: skipNative }, () => {
  const src = nativeSource();
  assert.match(src, /return fitPlacement\(saved, set\.work, set\.primary\), sp\.Maximized, true/);
  assert.match(src, /procEnumDisplayMonitors/);
  const offline = text(`${nativeDir}/offline.html`);
  assert.match(offline, /Retry connection/);
  assert.match(offline, /window\.addEventListener\("online"/);
  assert.match(offline, /connect-src https:\/\/triplem\.vip/);
  assert.match(src, /settingsSetBuiltInErrorPage, 0/);
  assert.match(src, /status == webErrorOperationCanceled \|\| !isTrustedAppSource\(currentNavigationURL\)/);
});

test("ARM64: native runtime folder, both builds embedded in Setup, architecture-neutral manifest", { skip: skipNative }, () => {
  const src = nativeSource();
  assert.match(src, /"EBWebView", runtimeArchFolder\(runtime\.GOARCH\)/);
  const setup = text("scripts/windows_app/installer/update.go");
  assert.match(setup, /go:embed payload\/TriplemVIP-arm64\.exe/);
  assert.match(setup, /nativeMachine == imageFileMachineARM64/);
  assert.match(setup, /closeRunningTriplemApp\(\)/);
  assert.match(text("scripts/windows_app/installer/main.go"), /closeRunningTriplemApp\(\)\s*if err := replaceExecutable\(tmp, dest\)/);
  const build = text("scripts/windows_app/build_windows_app.sh");
  assert.match(build, /build_app amd64 /);
  assert.match(build, /build_app arm64 /);
  assert.match(build, /-X main\.expectedPayloadSHA256ARM64=\$APP_SHA_ARM64/);
  assert.match(text("scripts/windows_app/build_resources.py"), /processorArchitecture="\*"/);
});

test("Store manifest declares the startup task and the alias used by Jump List tasks", { skip: has("scripts/windows_app/msix/AppxManifest.xml") ? false : "Store packaging source not present in this checkout" }, () => {
  const m = text("scripts/windows_app/msix/AppxManifest.xml");
  assert.match(m, /Category="windows\.startupTask"/);
  assert.match(m, /TaskId="TriplemVIPStartup" Enabled="false"/);
  assert.match(m, /<desktop:ExecutionAlias Alias="triplemvip\.exe" \/>/);
  assert.match(m, /ProcessorArchitecture="@ARCH@"/);
  assert.match(m, /Version="3\.6\.2\.0"/);
});

test("signing is wired into the build and never faked", { skip: has("scripts/windows_app/build_windows_app.sh") ? false : "Windows build scripts not present in this checkout" }, () => {
  const build = text("scripts/windows_app/build_windows_app.sh");
  assert.match(build, /"\$TRIPLEM_SIGN_CMD" "\$file"\s*python3 "\$ROOT\/scripts\/windows_app\/signing\/verify_signature\.py" "\$file"/);
  assert.match(build, /TRIPLEM_REQUIRE_SIGNING/);
  const all = [build, text("scripts/windows_app/signing/sign-jsign.sh")].join("\n");
  assert.doesNotMatch(all, /New-SelfSignedCertificate|makecert|-x509/, "no self-signed certificates in the release pipeline");
  assert.match(text("scripts/windows_app/signing/sign-jsign.sh"), /--tsmode RFC3161/);
});

test("page module is inert outside the Windows app and only uses existing app functions", () => {
  const js = text("Assets/app/desktop/01-windows-desktop.js");
  assert.match(js, /if \(!info \|\| !host \|\| info\.app !== "windows"\) return;/);
  assert.match(js, /window\.addEventListener\("triplem:unread-counts"/);
  assert.match(js, /window\.addEventListener\("triplem:comms-snapshot"/);
  assert.match(js, /refreshAdminCommsBadges\(\)/);
  assert.match(js, /TriplemAccounting\.openJournal\(null\)/);
  assert.match(js, /can\("accounting", "create"\)/);
  assert.match(js, /document\.getElementById\("openExpenseEntryBtn"\)/);
  assert.doesNotMatch(js, /supabaseRpc|supabase\(|fetch\(/, "the desktop module performs no database or network writes");
  assert.match(text("index.html"), /<script defer src="Assets\/app\/desktop\/01-windows-desktop\.js\?v=\d{8}-desktop360"><\/script>/);
  const messaging = text("Assets/app/messaging/01-messaging.js");
  assert.match(messaging, /if \(el\.id === "adminNotifyCount" \|\| el\.id === "adminMessagesCount"\) announceUnreadCounts\(\);/);
  assert.match(messaging, /new CustomEvent\("triplem:comms-snapshot"/);
  assert.match(text("Assets/app/inventory/04-inventory-barcodes-scanner.js"), /if \(window\.TriplemDesktop\?\.printHtml\?\.\(html\)\) return;/);
});

test("Windows Hello quick sign-in is offered in the app without weakening server checks", () => {
  const sec = text("Assets/app/auth/05-account-security.js");
  assert.match(sec, /PublicKeyCredential\.isUserVerifyingPlatformAuthenticatorAvailable\(\)/);
  assert.match(sec, /<span>Windows Hello<\/span>/);
  // Assertion still goes through the unchanged server verification.
  assert.match(sec, /invokeStandardWebAuthn\("quick-signin-complete"/);
  assert.match(sec, /userVerification:"required"/);
});

test("never imports Windows SDK helpers that are header-only (not exported by any DLL)", { skip: skipNative }, () => {
  // Importing one of these makes Go panic at the first call (3.5.0 pre-release
  // crash: InitPropVariantFromString in propsys.dll). They are inline functions
  // in propvarutil.h / shlwapi.h; build the PROPVARIANT manually instead.
  const headerOnly = ["InitPropVariantFromString", "InitPropVariantFromBoolean", "InitPropVariantFromInt32", "InitPropVariantFromUInt32", "InitPropVariantFromGUIDAsString", "InitVariantFromString", "PropVariantInit"];
  const src = nativeSource() + "\n" + fs.readdirSync(path.join(root, "scripts/windows_app/installer")).filter(f => f.endsWith(".go")).map(f => text(`scripts/windows_app/installer/${f}`)).join("\n");
  for (const name of headerOnly) assert.doesNotMatch(src, new RegExp(`NewProc\\("${name}"\\)`), name);
  // Optional integrations can never stop the app from starting.
  for (const fn of ["buildJumpList", "initTaskbarList", "addTrayIcon", "showToast"]) {
    assert.match(src, new RegExp(`func ${fn}\\([^)]*\\) \\{\\s*defer recoverOptional\\(`), fn);
  }
});
