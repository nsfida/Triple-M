"use strict";
// 2026-11-10: Background Bubbles & Animations switch, phone focus-zoom fix,
// attachment control reliability, Windows release hygiene.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const exists = rel => fs.existsSync(path.join(root, rel));

test("background animation switch: local preference, removes elements when off, respects reduced motion", () => {
  const theme = read("Assets/app/core/07-theme.js");
  assert.match(theme, /TRIPLEM_BG_MOTION_KEY = "triplem-bg-motion-v1"/);
  assert.match(theme, /prefers-reduced-motion: reduce/);
  assert.match(theme, /replaceChildren\(\)/);
  assert.match(theme, /role="switch" data-bg-motion-toggle/);
  assert.doesNotMatch(theme.slice(theme.indexOf("function applyTriplemBackgroundMotion"), theme.indexOf("function applyTriplemBackgroundMotion") + 3000), /supabaseRpc|fetch\(/, "the switch must not call the server");
  assert.match(read("Assets/app/auth/01-auth-session.js"), /classList\.contains\("triplem-bg-off"\)\) return;/);
  const css = read("Assets/style/63-motion-viewport.css");
  assert.match(css, /html\.triplem-bg-off \.floating-circles/);
  assert.match(read("Assets/style/app.feature.bundle.css"), /html\.triplem-bg-off \.floating-circles/);
});

test("phones: fields are at least 16px on touch screens and pinch-zoom stays enabled", () => {
  const css = read("Assets/style/63-motion-viewport.css");
  assert.match(css, /@media \(hover:none\) and \(pointer:coarse\)\{[\s\S]*select,textarea,\[contenteditable="true"\]\)\{font-size:16px !important\}/);
  const viewport = read("index.html").match(/<meta name="viewport" content="([^"]+)"/)[1];
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*no|maximum-scale/i);
});

test("attachment settings: only a confirmed server answer for this session is kept", () => {
  const att = read("Assets/app/attachments/02-attachments.js");
  assert.match(att, /const cfgConfirmed = \(\) => !!S\.cfg && S\.cfgToken === token\(\)/);
  assert.match(att, /cfgRetryDelay/);
  assert.match(att, /function applyCfgToControls/);
  assert.match(att, /return bestCfg\(\); \/\/ not remembered/);
  assert.doesNotMatch(att, /return \(S\.cfg = cachedCfg\(\)/, "a stand-in answer must never be cached for the page life");
  assert.match(att, /function entryById/);
  assert.match(read("index.html"), /02-attachments\.js\?v=20261110-att3/);
});

test("Windows build: release executables are stripped of debug sections; signing keys never in the project", { skip: !exists("scripts/windows_app/build_windows_app.sh") }, () => {
  const sh = read("scripts/windows_app/build_windows_app.sh");
  assert.equal((sh.match(/-ldflags=['"]-s -w -H=windowsgui -buildid=/g) || []).length, 2);
  assert.match(read("scripts/security_audit.js"), /Signing key material must not be inside the project/);
});

test("sign-in inbox start-up runs once per session and overlapping badge refreshes are coalesced", () => {
  const notes = read("Assets/app/notes/01-notes.js");
  const msg = read("Assets/app/messaging/01-messaging.js");
  const auth = read("Assets/app/auth/01-auth-session.js");
  assert.match(notes, /function triplemCoalesceAsync\(run\)/);
  assert.match(notes, /function bootstrapReminderDeliveryOnUnlock\(\)\{[\s\S]{0,200}triplemCoalesceAsync\(bootstrapReminderDeliveryOnUnlockRun\)/);
  assert.match(msg, /function refreshAdminCommsBadges\(\)\{[\s\S]{0,250}triplemCoalesceAsync\(refreshAdminCommsBadgesRun\)/);
  assert.match(auth, /applyPermissionGates\.commsStartedFor !== commsKey/);
  assert.match(msg, /function stopMessagingLiveSync\(\)\{\n  messagingLiveState\.startedFor = "";/);
  // notes loads before messaging, so the helper exists when messaging needs it
  const html = read("index.html");
  assert.ok(html.indexOf("Assets/app/notes/01-notes.js") < html.indexOf("Assets/app/messaging/01-messaging.js"));
});
