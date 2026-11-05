"use strict";

/* Guards for Triplem VIP for Windows 3.7 (Windows Hello lock, quieter
 * background mode, tray unread count, global shortcuts + Jump List recent
 * records, native print and PDF options, the Windows app bar, offline access)
 * and for the long-press card order on Triplem VIP Home and the Dashboard. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const has = rel => fs.existsSync(path.join(root, rel));
const text = rel => fs.readFileSync(path.join(root, rel), "utf8");
const nativeDir = "scripts/windows_app/native";
const skipNative = has(`${nativeDir}/applock.go`) ? false : "Windows app source not present in this checkout";
const native = () => fs.readdirSync(path.join(root, nativeDir)).filter(f => f.endsWith(".go") && !f.endsWith("_test.go")).map(f => text(`${nativeDir}/${f}`)).join("\n");

test("3.7 Windows Hello lock: only Windows Hello unlocks, nothing of the workspace is shown while locked", { skip: skipNative }, () => {
  const src = native();
  assert.match(src, /UserConsentVerifierInterop/);
  assert.match(src, /0xFD596FFD, 0x2318, 0x558F/, "IAsyncOperation<UserConsentVerificationResult> IID");
  assert.match(src, /if v && appLocked \{\s*v = false \/\/ nothing of the workspace is rendered while locked/);
  assert.match(src, /case "unlock":\s*if m\.Kind == "signed-out" \{\s*pageSignedOutFromLock\(\)/, "the page can only unlock after the user chose Sign out on the lock screen");
  assert.match(src, /time\.Since\(signOutAskedAt\) < 2\*time\.Minute/);
  // Turning the lock on or off needs Windows Hello first.
  assert.match(src, /requestHello\("enable"\)/);
  assert.match(src, /requestHello\("disable"\)/);
  // Locks on start, after the away time, when idle, Windows lock and sleep.
  assert.match(src, /appLocked = true \/\/ every start begins locked/);
  assert.match(src, /case WM_WTSSESSION_CHANGE:\s*if wParam == WTS_SESSION_LOCK/);
  assert.match(src, /case WM_POWERBROADCAST:\s*if wParam == PBT_APMSUSPEND/);
  assert.match(src, /lockOnReturn\(appLockEnabled\(\), settings\.LockMinutes, awayFrom, time\.Now\(\)\)/);
  // Notification text is hidden while locked (when chosen).
  assert.match(src, /if appLocked && settings\.LockHideDetails \{/);
  // Never locks a user out when Windows Hello stops working on this PC.
  assert.match(src, /helloAvailable == helloNotConfigured/);
});

test("3.7 background: memory target, pause only when nothing needs the page, tray unread count", { skip: skipNative }, () => {
  const src = native();
  assert.match(src, /wv19SetMemTarget\s*= 120/);
  assert.match(src, /wv3TrySuspend\s*= 68/);
  assert.match(src, /canSuspendPage\(settings\.SaveMemory, settings\.Notifications, isPackaged\(\), wnsChannel != 0\)/);
  assert.match(src, /func onWindowShownForMemory\(\) \{\s*procKillTimer\.Call\(mainHwnd, suspendTimerID\)\s*setMemoryTarget\(false\)\s*resumePage\(\)/);
  assert.match(src, /want := settings\.TrayBadge && unreadCount > 0 && !safeStart/);
  assert.match(src, /trayTooltipFull\(unreadCount, netOnline, netPending, appLocked\)/);
});

test("3.7 shortcuts and Jump List recent records", { skip: skipNative }, () => {
  const src = native();
  for (const k of ["'E', Target: \"new-expense\"", "'F', Target: \"search\"", "'I', Target: \"new-invoice\""]) assert.ok(src.includes(k), k);
  assert.match(src, /cdlAppendCategory = 5/);
  assert.match(src, /rememberRemovedJumpItems\(removed\)/);
  assert.match(src, /if !settings\.RecentJumpList \|\| appLockEnabled\(\) \{\s*return nil/, "no recent names in the taskbar while the lock is on");
  assert.match(src, /if isOpenTarget\(t\) \{ \/\/ a fixed screen or a recent record \(3\.7\)/);
});

test("3.7 native print and PDF options", { skip: skipNative }, () => {
  const src = native();
  assert.match(src, /wv16Print\s*= 113/);
  assert.match(src, /wv7PrintToPdf\s*= 80/);
  assert.match(src, /env6CreatePS\s*= 14/);
  assert.match(src, /ps2SetPrinter\s*= 44/);
  assert.match(src, /func floatPrintSettingsSupported\(\) bool \{ return runtime\.GOARCH == "amd64" \}/, "floating-point settings only where Go passes them correctly");
  assert.match(src, /o, err := sanitizePrintOptions\(o, installedPrinters\(\)\)/);
  assert.match(src, /EnumPrintersW/);
});

test("3.7 page side: app bar under the header icons with the Windows app menu", () => {
  const js = text("Assets/app/desktop/01-windows-desktop.js");
  assert.match(js, /const chips = document\.querySelector\("#app \.header \.chips"\);/);
  assert.match(js, /function alignAppBar\(\)/);
  assert.doesNotMatch(js, /getElementById\("adminNotifyDropdown"\)/, "no longer inside the notifications menu");
  assert.match(js, /send\("settings-set", \{ key: "appLock", value: want \}\)/);
  assert.match(js, /e\.target\.checked = !!local\.settings\.appLock; \/\/ changes only after Windows Hello confirms/);
  assert.match(js, /if \(caps\.has\("printplus"\)\) \{ openPrintPanel\(context\); return; \}/);
  assert.match(js, /send\(action === "pdf" \? "print-pdf" : "print-run"/);
  assert.match(js, /function openSearchPalette\(\)/);
  assert.match(js, /TriplemAccounting\.openDocument\("sales"\)/);
  assert.match(js, /if \(typeof ensureAllLedgerDataLoaded === "function"\) await ensureAllLedgerDataLoaded\(\{\}\);/);
  assert.doesNotMatch(js, /supabaseRpc|supabase\(|fetch\(/, "the desktop module performs no database or network calls of its own");
});

test("Windows app: Remember me starts ticked only on first use in the app", () => {
  const cfg = text("Assets/app/core/01-config-constants.js");
  assert.match(cfg, /els\.rememberMeCheckbox\.checked = pref === "1" \|\| \(pref === null && windowsApp\);/);
});

test("card order: Home and Dashboard use the account settings RPC, no new tables", () => {
  const js = text("Assets/app/ui/05-card-order.js");
  assert.match(js, /supabaseRpc\("app_update_own_settings", \{ p_settings: \{ \[settingsKey\]: rec \} \}/);
  assert.match(js, /settingsKey: "HomeOrder"/);
  assert.match(js, /settingsKey: "DashboardOrder"/);
  assert.match(js, /const LONG_MS = 450;/, "same long-press time as wallets");
  const nav = text("Assets/app/ui/01-render-navigation.js");
  assert.match(nav, /window\.orderHomeTabs\(tabs\)/);
  assert.match(nav, /window\.bindHomeReorder\?\.\(grid\)/);
  assert.match(nav, /window\.orderDashboardSections\(list\)/);
  const html = text("index.html");
  assert.match(html, /<script defer src="Assets\/app\/ui\/05-card-order\.js\?v=\d{8}-cardorder\d+"><\/script>/);
  assert.match(text("scripts/build_feature_css_bundle.js"), /59-card-order\.css/);
});

test("card order store: offline changes win until synced, newer account changes win, invalid ids dropped", async () => {
  const store = new Map();
  const g = {
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { onLine: false },
    state: { unlocked: true, sessionToken: "t", sessionUser: { id: "u1", settings: {} } },
    calls: []
  };
  g.window = g;
  g.addEventListener = () => {};
  g.supabaseRpc = async (name, args) => { g.calls.push([name, args]); return null; };
  const vm = require("node:vm");
  const ctx = vm.createContext(g);
  vm.runInContext(text("Assets/app/ui/05-card-order.js"), ctx);
  const { createOrderStore } = g.TriplemCardOrder._test;
  const plain = v => JSON.parse(JSON.stringify(v)); // arrays from the test context
  const s = createOrderStore({ settingsKey: "HomeOrder", localPrefix: "t-home:", validId: id => /^[a-z][a-z0-9-]*$/.test(id) });
  assert.deepEqual(plain(s.effectiveOrder()), []);
  const tabs = ["dashboard", "expenses", "goods", "notes"].map(tab => ({ dataset: { tab } }));
  assert.deepEqual(plain(s.sort(tabs, t => t.dataset.tab).map(t => t.dataset.tab)), ["dashboard", "expenses", "goods", "notes"], "no saved order: default");
  await s.save(["notes", "dashboard", "BAD id", "expenses", "notes"]);
  assert.deepEqual(plain(s.effectiveOrder()), ["notes", "dashboard", "expenses"]);
  assert.equal(g.calls.length, 0, "offline: nothing sent yet");
  assert.deepEqual(plain(s.sort(tabs, t => t.dataset.tab).map(t => t.dataset.tab)), ["notes", "dashboard", "expenses", "goods"], "unknown cards keep their place after the saved ones");
  g.navigator.onLine = true;
  await s.pushPending();
  assert.equal(g.calls.length, 1);
  assert.equal(g.calls[0][0], "app_update_own_settings");
  assert.deepEqual(plain(g.calls[0][1].p_settings.HomeOrder.order), ["notes", "dashboard", "expenses"]);
  assert.equal(s.readLocal().synced, true);
  // Another device saved a newer order: it wins.
  g.state.sessionUser.settings.HomeOrder = { order: ["goods", "notes"], at: Date.now() + 60000 };
  assert.deepEqual(plain(s.effectiveOrder()), ["goods", "notes"]);
  // Guest: kept on this device only.
  g.isGuestMode = () => true;
  const before = g.calls.length;
  await s.save(["expenses", "goods"]);
  assert.equal(g.calls.length, before);
});
