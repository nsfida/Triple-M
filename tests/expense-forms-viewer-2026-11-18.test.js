// Spend / Receive / Transfer in a wallet's panel and the attachment viewer (2026-11-18).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const read = p => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("a wallet's own forms keep that wallet (shown as a card); pickers stay in the form for saving", () => {
  const dp = read("Assets/app/ui/10-detail-panels.js");
  assert.match(dp, /lockWallet\(entry\.querySelector\("#expenseSpendAccountSelect"\), \[entry\.querySelector\("#expenseCurrencySelect"\)\], "Paying from"\)/);
  assert.match(dp, /lockWallet\(topup\.querySelector\("#expenseTopupAccountSelect"\), \[\], "Adding to"\)/);
  assert.match(dp, /lockWallet\(f\.querySelector\("#transferFromWallet"\), \[\], "Sending from"\)/);
  assert.match(dp, /!entry\.dataset\.editEntryId/, "editing keeps the wallet picker");
  assert.match(dp, /function undock\(\)\{\n    const d = P\.dock; if \(!d\) return;\n    undecorate\(\);/);
  const css = read("Assets/style/69-admin-user-manager.css");
  assert.match(css, /\.modal-grid > \.tm-dp-locked-field\{display:none !important\}/);
  assert.match(css, /\.tm-dp-vat\{display:grid !important;grid-template-columns:/);
});

test("attachment viewer: one file, Save and close, cached links, prefetch", () => {
  const js = read("Assets/app/attachments/02-attachments.js");
  assert.match(js, /const LIST_TTL = 60000, LINK_TTL = 240000;/);
  assert.match(js, /data-tm-att-save/);
  assert.match(js, /async function prefetch\(module, id\)/);
  assert.doesNotMatch(js, /tm-att-viewer-list/, "no file list beside the photo");
  assert.match(read("Assets/app/ui/10-detail-panels.js"), /TriplemAttachments\.prefetch\?\.\("expense"/);
});
