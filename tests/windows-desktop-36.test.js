"use strict";

/* Guards for Triplem VIP for Windows 3.6: signed auto-update, modern
 * notifications with buttons, triplemvip:// links, Store push (WNS),
 * shortcut key, drag and drop, title bar theme and diagnostics. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const has = rel => fs.existsSync(path.join(root, rel));
const text = rel => fs.readFileSync(path.join(root, rel), "utf8");
const nativeDir = "scripts/windows_app/native";
const skipNative = has(`${nativeDir}/logic36.go`) ? false : "Windows app source not present in this checkout";
const native = () => fs.readdirSync(path.join(root, nativeDir)).filter(f => f.endsWith(".go") && !f.endsWith("_test.go")).map(f => text(`${nativeDir}/${f}`)).join("\n");

test("updates are only installed from a signed manifest and a matching SHA-256", { skip: skipNative }, () => {
  const src = native();
  assert.match(src, /appVersionNative = "3\.6\.1"/);
  assert.match(src, /ed25519\.Verify\(pub, payload, sig\)/);
  assert.match(src, /updatePublicKeyB64 = "[A-Za-z0-9+/]{43}="/);
  assert.match(src, /strings\.HasPrefix\(m\.URL, updateDownloadPrefix\)/);
  assert.match(src, /counter\.n != m\.Size \|\| hex\.EncodeToString\(h\.Sum\(nil\)\) != m\.SHA256/);
  // Re-checked right before Setup runs, and never for the Store version.
  assert.match(src, /if !fileMatches\(path, size, lines\[0\]\) \{/);
  assert.match(src, /func updatesSupported\(\) bool \{ return !isPackaged\(\) \}/);
  // Windows' own HTTPS stack, no redirects to other hosts.
  assert.match(src, /winhttpRedirectPolicyNever/);
  assert.doesNotMatch(src, /"net\/http"/, "the app uses WinHTTP (system proxy + certificate store), not a bundled TLS stack");
  // The private key is never part of the source tree.
  for (const dir of ["scripts", "Assets", "supabase"]) {
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    if (!has(dir)) continue;
    for (const f of walk(path.join(root, dir))) {
      if (/\.(exe|msix|png|jpg|ico|webp|pdf|woff2?|zip)$/i.test(f)) continue;
      assert.doesNotMatch(fs.readFileSync(f, "utf8"), /TRIPLEM-VIP-UPDATE-SIGNING-KEY-V1\s*\n\s*[A-Za-z0-9+/]{43}=/, `private update key must never be committed (${f})`);
    }
  }
});

test("Setup's silent update keeps the installation folder, settings and data", { skip: skipNative }, () => {
  const setup = text("scripts/windows_app/installer/update.go");
  assert.match(setup, /func runSilentUpdate\(dir string\)/);
  assert.match(setup, /if !validUpdateDir\(dir\) \{/);
  assert.match(setup, /startWithArgs\(exePath, "--updated"\)/);
  assert.match(text("scripts/windows_app/installer/main.go"), /if dir, ok := updateModeArgs\(os\.Args\[1:\]\); ok \{/);
  const build = text("scripts/windows_app/build_windows_app.sh");
  assert.match(build, /TRIPLEM_UPDATE_KEY_FILE/);
  assert.match(build, /the update signing key does not match the public key compiled into the app/);
});

test("notification buttons and links can only open screens unless the app itself issued them", { skip: skipNative }, () => {
  const src = native();
  assert.match(src, /func authorizeLink\(l linkRequest, processToken string\) linkRequest/);
  assert.match(src, /l = authorizeLink\(l, processToken\)/);
  assert.match(src, /pendingLink = authorizeLink\(args\.Link, processToken\)/);
  assert.match(src, /`"`\+exe\+`" --link "%1"`/);
  assert.match(src, /strings\.EqualFold\(strings\.TrimSpace\(a\), "--link"\)/);
  // Modern toasts with a tray fallback; every activation is a protocol link.
  assert.match(src, /activationType="protocol" launch=/);
  assert.match(src, /if showModernToast\(m\.Title, m\.Body, m\.Target, m\.ID, m\.Actions, m\.Tag\) \{\s*return\s*\}\s*showToast\(/);
  // The Windows "notifications off" setting is respected (no fallback).
  assert.match(src, /setting != notificationSettingEnabled \{[\s\S]{0,200}return true/);
  // Uninstall removes the new registrations.
  assert.match(src, /removeAppIdentity\(\)/);
});

test("Store push: strict COM handler, cancelled while running, closed on sign-out", { skip: skipNative }, () => {
  const src = native();
  assert.match(src, /0x55fa217d, 0x1fc3, 0x5863/, "TypedEventHandler<PushNotificationChannel, PushNotificationReceivedEventArgs>");
  assert.match(src, /return 0x80004002 \/\/ E_NOINTERFACE/);
  assert.match(src, /vcall\(args, pushArgsSetCancel, 1\)/);
  assert.match(src, /case "push-close":\s*closePushChannel\(\)/);
  assert.match(src, /if !isPackaged\(\) \|\| safeStart \|\| wnsOperation != 0 \{/);
  const manifest = text("scripts/windows_app/msix/AppxManifest.xml");
  assert.match(manifest, /Version="3\.6\.1\.0"/);
  assert.match(manifest, /<uap3:Protocol Name="triplemvip" Parameters="--link &quot;%1&quot;">/);
});

test("crash recovery and error reports never include personal data", { skip: skipNative }, () => {
  const src = native();
  assert.match(src, /func beginRunState\(\)/);
  assert.match(src, /markRunClean\(\) \/\/ Windows sign-out \/ restart is not a crash/);
  assert.match(src, /for _, l := range recentLogLines\(400\)/);
  assert.match(src, /lines\[i\] = redactLogLine\(l\)/);
  assert.match(src, /if !safeStart \{\s*buildJumpList\(\)/);
  assert.match(src, /MOD_CONTROL\|MOD_ALT\|MOD_SHIFT\|MOD_NOREPEAT/);
});

test("migration 204 is additive and locked down", { skip: has("migrations/204_windows_store_push_channels.sql") ? false : "migrations not present" }, () => {
  const sql = text("migrations/204_windows_store_push_channels.sql");
  const body = sql.replace(/^--.*$/gm, "");
  assert.doesNotMatch(body, /\bdrop\s+(table|column)\b|\btruncate\b|\balter\s+table\s+public\.(?!app_push_windows_channels)/i);
  assert.match(body, /create table if not exists public\.app_push_windows_channels/);
  assert.match(body, /enable row level security/);
  assert.match(body, /revoke all on table public\.app_push_windows_channels from public, anon, authenticated;/);
  assert.match(body, /uid uuid := public\.current_app_user_id\(\);/);
  assert.match(body, /\\\.notify\\\.windows\\\.com/);
  assert.match(text("scripts/build_full_schema_sql.js"), /"204_windows_store_push_channels\.sql"/);
});

test("push function sends to Windows only when configured and never changes the web push result", { skip: has("supabase/functions/push-notifications/index.ts") ? false : "Edge Function source not present" }, () => {
  const fn = text("supabase/functions/push-notifications/index.ts");
  assert.match(fn, /return Boolean\(WNS_PACKAGE_SID && WNS_CLIENT_SECRET\);/);
  assert.match(fn, /return \{ \.\.\.web, windows \};/);
  assert.match(fn, /"X-WNS-Type": "wns\/toast"/);
  assert.match(fn, /function xmlEscape\(value: unknown\)/);
  assert.match(fn, /if \(status === 404 \|\| status === 410\) invalid\.push/);
});

test("page side: buttons reuse existing actions, no direct database calls in the desktop module", () => {
  const js = text("Assets/app/desktop/01-windows-desktop.js");
  assert.doesNotMatch(js, /supabaseRpc|supabase\(|fetch\(/);
  assert.match(js, /runNotificationAction\(n, action === "accept-chat" \? "live-accept" : "live-decline"\)/);
  assert.match(js, /new CustomEvent\("triplem:notification-mark-read"/);
  assert.match(js, /e\.preventDefault\(\); \/\/ never let the window navigate to the dropped file/);
  assert.match(js, /const panel = document\.createElement\("details"\);/);
  assert.match(js, /beforeLogout,/);
  const push = text("Assets/app/notifications/01-web-push.js");
  assert.match(push, /window\.addEventListener\("triplem:windows-push-channel"/);
  assert.match(push, /Date\.now\(\) - Number\(last\.at \|\| 0\) < DAY/, "at most one registration write per device per day");
  assert.match(text("Assets/app/messaging/01-messaging.js"), /document\.addEventListener\("triplem:notification-mark-read"/);
  assert.match(text("Assets/app/auth/02-auth-welcome-trial.js"), /window\.TriplemDesktop\?\.beforeLogout\?\.\(\)/);
});

// 3.6.1: the pinned taskbar button keeps the app icon when the window is
// closed to the notification area (no blank "white page" icon).
test("3.6.1 pinned taskbar icon: relaunch identity, icon repair and classic icon images", { skip: skipNative }, () => {
  const src = native();
  // Full relaunch identity (command, icon, display name, app ID) before the window is shown.
  assert.match(src, /setWindowProperty\(store, 2, cmd\)/);
  assert.match(src, /setWindowProperty\(store, 3, icon\)/);
  assert.match(src, /setWindowProperty\(store, 4, name\)/);
  const run = src.slice(src.indexOf("func runNativeApp("));
  assert.ok(run.indexOf("setWindowIdentity(mainHwnd)") > run.indexOf("createMainWindow()"), "identity is applied once the window exists and is shown");
  assert.match(src, /clearWindowIdentity\(hwnd\)/);
  // Repair touches only this app's own shortcuts, once per version.
  assert.match(src, /pinnedLinkFix\(info, exe, appUserModelID\)/);
  assert.match(src, /iconRepairDue\(settings\.IconRepairVersion, appVersionNative\)/);
  assert.match(src, /SHCNE_ASSOCCHANGED/);
  // Sharp icons at the real sizes for the title bar, taskbar and notification area.
  assert.match(src, /loadAppIconSize\(systemIconSize\(SM_CXSMICON, 16\)\)/);
  // Window behaviour fixes.
  assert.match(src, /NotifyParentWindowPositionChanged\.Call/);
  assert.match(src, /case WM_DPICHANGED:/);
  assert.match(src, /MoveFocus\.Call/);
});

test("3.6.1 app icon: classic bitmaps below 256 px (PNG only at 256 px)", { skip: has("scripts/windows_app/assets/TriplemVIP.ico") ? false : "icon source not present" }, () => {
  const b = fs.readFileSync(path.join(root, "scripts/windows_app/assets/TriplemVIP.ico"));
  const count = b.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i += 1) {
    const e = 6 + i * 16;
    const w = b[e] || 256;
    const planes = b.readUInt16LE(e + 4);
    const off = b.readUInt32LE(e + 12);
    const isPng = b.slice(off, off + 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    assert.equal(planes, 1, `${w}px entry has planes=1`);
    assert.equal(isPng, w === 256, `${w}px entry is ${w === 256 ? "PNG" : "a classic bitmap"}`);
    sizes.push(w);
  }
  for (const s of [16, 20, 24, 32, 40, 48, 256]) assert.ok(sizes.includes(s), `icon has ${s}px`);
});
