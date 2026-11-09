"use strict";
// One password field = one eye button. The app adds one in-field eye to every
// password input (06-auth-ui.js); older per-screen toggles are hidden, and the
// browser's own reveal control (Microsoft Edge / Windows WebView2) is switched off.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

test("native Edge / WebView2 reveal eye is hidden on every input (source and bundle)", () => {
  for (const f of ["Assets/style/29-auth-surface-security-assets.css", "Assets/style/app.bundle.css"]) {
    assert.match(read(f), /^input::-ms-reveal\{display:none!important;width:0!important;height:0!important\}$/m, f);
  }
});

test("every older toggle style is recognised and hidden, so no field shows two eyes", () => {
  const ui = read("Assets/app/auth/06-auth-ui.js");
  assert.match(ui, /const LEGACY_EYE_SELECTOR = "\.pw-eye-btn,\[data-toggle-form-pw\],\[data-team-pw-eye\],\[data-password-toggle\],\.triplem-ai-key-eye";/);
  assert.match(ui, /for \(const legacy of existingLegacyEyes\(originalParent, input\)\)/);
  assert.match(ui, /:scope > button/); // generic eye icons only next to the field
  assert.match(ui, /input\.dataset\.triplemPasswordEye === "1"\) return;/); // never initialised twice
  assert.match(ui, /button\.type = "button";/); // the eye never submits the form
  // The toggles that exist in the app are all covered by the selector.
  const sources = ["Assets/app/ai/02-triplem-ai.js", "Assets/app/auth/01-auth-session.js", "Assets/app/auth/02-auth-welcome-trial.js", "Assets/app/admin/01-admin.js"].map(read).join("\n");
  assert.match(sources, /triplem-ai-key-eye/);
  assert.match(sources, /data-team-pw-eye/);
  assert.match(sources, /data-toggle-form-pw/);
});

test("the legacy eye stays hidden by CSS", () => {
  assert.match(read("Assets/style/app.bundle.css"), /\.triplem-password-eye-legacy\{display:none!important\}/);
});
