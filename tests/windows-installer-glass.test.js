"use strict";

/* Guards for the Windows Setup and desktop app (3.9.1). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const has = rel => fs.existsSync(path.join(root, rel));
const text = rel => fs.readFileSync(path.join(root, rel), "utf8");
const skipSource = !has("scripts/windows_app/installer/glass.go") ? "installer source not present in this checkout" : false;

test("glass Setup hosts the installed WebView2 runtime without in-memory DLL loading", { skip: skipSource }, () => {
  const glass = text("scripts/windows_app/installer/glass.go");
  assert.match(glass, /go:embed ui\/setup\.html/);
  assert.match(glass, /findRuntimeDLL\(\)/);
  assert.match(glass, /procLoadLibraryExW\.Call\(uintptr\(unsafe\.Pointer\(utf16Ptr\(dll\)\)\), 0, loadWithAlteredSearchPath\)/);
  assert.match(glass, /CreateWebViewEnvironmentWithOptionsInternal/);
  assert.doesNotMatch(glass, /winloader|LoadFromMemory|VirtualAlloc|WebView2Loader\.dll/);
  assert.doesNotMatch(glass, /powershell|cmd\.exe|WScript|ExecutionPolicy|Add-MpPreference/i);
  // Hidden until ready, then falls back to the classic wizard on any start-up failure.
  assert.match(glass, /Hidden until the page reports it is ready/);
  assert.match(glass, /glassReadyTimeoutMs = 12000/);
  assert.match(glass, /return false \/\/ nothing was shown or installed: use the classic wizard/);
  const main = text("scripts/windows_app/installer/main.go");
  assert.match(main, /if runGlassSetup\(\) \{\s*return\s*\}\s*runSetupWizard\(\)/);
});

test("installation happens before the three Finish-page choices are applied", { skip: skipSource }, () => {
  const html = text("scripts/windows_app/installer/ui/setup.html");
  const glass = text("scripts/windows_app/installer/glass.go");
  const main = text("scripts/windows_app/installer/main.go");
  for (const label of ["Create Desktop Shortcut", "Create Start Menu Icon", "Pin on Taskbar"]) assert.ok(html.includes(label), label);
  assert.match(html, /send\(\{ cmd: "finish", desktop: \$\("optDesktop"\)\.checked, start: \$\("optStart"\)\.checked, pin: \$\("optPin"\)\.checked/);
  // Pinning requires a Start Menu entry (Windows rule) in both UI and native code.
  assert.match(html, /if \(pin\) \$\("optStart"\)\.checked = true;/);
  assert.match(main, /if pin \{\s*start = true\s*\}/);
  assert.match(glass, /applyIntegrations\(setupInstalledExe, dir, desktop, start, pin, true\)/);
  assert.match(main, /confirmed-by-setup-v2/);
  assert.match(text("scripts/windows_app/native/main.go"), /confirmed-by-setup-v2/);
  // The installer never pins by itself: Windows only lets the running app ask.
  assert.doesNotMatch(main + glass, /taskbarpin|TaskBar\\|User Pinned\\TaskBar/i);
});

test("Setup page is self-contained and locked down", { skip: skipSource }, () => {
  const html = text("scripts/windows_app/installer/ui/setup.html");
  assert.match(html, /Content-Security-Policy" content="default-src 'none'; img-src data:;/);
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/, "no network resources in the installer UI");
  assert.match(html, /prefers-reduced-motion/);
});

test("published Setup and app carry Windows version information", () => {
  const exe = fs.readFileSync(path.join(root, "Assets/mobile_app/Windows/TriplemVIP_Setup.exe"));
  const utf16 = s => Buffer.from(s, "utf16le");
  for (const s of ["VS_VERSION_INFO", "CompanyName", "Triplem VIP Setup", "ProductName", "3.9.1.0"]) {
    assert.ok(exe.includes(utf16(s)), `version resource contains ${s}`);
  }
  assert.ok(exe.includes(Buffer.from("PerMonitorV2")), "DPI-aware manifest embedded");
});

test("Microsoft Store package carries the reserved Partner Center identity", { skip: !has("scripts/windows_app/msix/AppxManifest.xml") && "msix source not present" }, () => {
  const m = text("scripts/windows_app/msix/AppxManifest.xml");
  assert.doesNotMatch(m, /REPLACE/);
  assert.match(m, /Name="TriplemVIP\.TriplemVIP"/);
  assert.match(m, /Publisher="CN=D58541F4-18AA-431F-869F-990A8A8D60CE"/);
  assert.match(m, /<PublisherDisplayName>Triplem VIP<\/PublisherDisplayName>/);
  assert.match(m, /Version="\d+\.\d+\.\d+\.0"/, "Store versions must end in .0");
  // Inside the package Windows owns identity and pinning; the app must not override it.
  const native = text("scripts/windows_app/native/main.go");
  assert.match(native, /GetCurrentPackageFullName/);
  assert.match(native, /func setWindowIdentity\(hwnd uintptr\) \{\s*if isPackaged\(\) \{\s*return/);
  assert.match(native, /func setAppUserModelID\(\) \{\s*if isPackaged\(\) \{\s*return/);
});

test("Windows app hides every device-notification prompt and switch; web and mobile keep them", () => {
  const html = text("index.html");
  const push = text("Assets/app/notifications/01-web-push.js");
  // Early, pre-render detection of the WebView2 host.
  assert.match(html, /if \(window\.chrome && window\.chrome\.webview\) \{\s*window\.TRIPLEM_WINDOWS_APP = true;\s*document\.documentElement\.classList\.add\("triplem-windows-app"\);/);
  for (const sel of [".landing-visitor-alert-control", ".landing-mobile-notification-row", "#pushQuickToggleBtn", ".admin-comms-device-footer", "#pushConsentModal"]) {
    assert.ok(html.includes(`html.triplem-windows-app ${sel}`), `hidden in the Windows app: ${sel}`);
  }
  assert.match(push, /function supported\(\) \{\s*if \(isWindowsApp\(\)\) return false;/);
  assert.match(push, /function openPushConsentModal\(mode\) \{\s*if \(isWindowsApp\(\)\) return;/);
  // Prompts already require supported(), so neither the visitor nor the after-login overlay can open.
  assert.match(push, /async function maybePromptSignedInUser\(\{ forceLoginPrompt = false \} = \{\}\) \{\s*if \(!supported\(\)\) return false;/);
  assert.match(push, /async function maybePromptVisitor\(\) \{\s*if \(stateLocal\.visitorPromptShown \|\| getVisitorPromptSeen\(\) \|\| !supported\(\)/);
  // Nothing outside the Windows app is affected: the rule is scoped to the marker class only.
  assert.doesNotMatch(html.replace(/html\.triplem-windows-app[^{]*\{[^}]*\}/g, ""), /\.landing-visitor-alert-control[^{]*\{\s*display:\s*none !important/);
});
