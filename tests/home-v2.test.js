"use strict";
// Triplem VIP Home v2 (2026-11-11): new section icons, frameless cards, ⋮ menu to rename a card.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

test("every Home section has a safe SVG icon", () => {
  // The icons may be replaced with any artwork (2026-11-11: owner's own icon set), so only the
  // file itself is checked: present, a real SVG, and nothing that can run or load from elsewhere.
  const nav = read("Assets/app/ui/01-render-navigation.js");
  const keys = JSON.parse(nav.match(/const WORKSPACE_HOME_ICON_KEYS = (\[[^\]]*\]);/)[1]);
  assert.ok(keys.length >= 10);
  for (const key of keys) {
    const svg = read(`Assets/logo/icons/home/${key}.svg`);
    assert.match(svg, /<svg[\s>][^>]*viewBox="[^"]+"/i, `${key}: SVG with a viewBox`);
    assert.doesNotMatch(svg, /<script|<foreignObject|\son[a-z]+\s*=|javascript:/i, `${key}: no scripts`);
    for (const m of svg.matchAll(/(?:xlink:)?href\s*=\s*"([^"]*)"/gi)) {
      assert.match(m[1], /^(#|data:image\/(png|webp|jpeg|gif|svg\+xml);base64,)/, `${key}: no external links (${m[1].slice(0, 40)})`);
    }
  }
});

test("Home cards: no frame, no open icon, a ⋮ menu, names under the icon", () => {
  const nav = read("Assets/app/ui/01-render-navigation.js");
  const fn = nav.slice(nav.indexOf("function workspaceHomeCardHtml("), nav.indexOf("window.workspaceHomeCardHtml = workspaceHomeCardHtml;"));
  assert.doesNotMatch(fn, /arrow-up-right-from-square/, "no open icon in either style");
  assert.match(fn, /<button class="\$\{cls\} home-card-menu-btn" type="button" aria-label="Options for/);
  assert.match(fn, /\$\{menu\("wh2-menu"\)\}/);
  assert.match(fn, /fa-ellipsis-vertical/);
  assert.match(fn, /role="button" tabindex="0"/);
  assert.match(nav, /Assets\/logo\/icons\/home\/\$\{k\}\.svg/);
  assert.match(nav, /label: "Assets\/Depreciation"/);
  const access = read("Assets/app/inventory-v2/00-access.js");
  assert.match(access, /label: "Inventory 2\.0"/);
  assert.doesNotMatch(access, /<strong>Triplem VIP Inventory 2\.0<\/strong>/);
  const html = read("index.html");
  assert.match(html, /<span class="tab-label">Assets\/Depreciation<\/span>/);
  assert.match(html, /<script defer src="Assets\/app\/ui\/06-home-names\.js\?v=[^"]+"><\/script>/);
  assert.match(html, /id="workspaceHomeTitle"/);
  const css = read("Assets/style/66-workspace-home-v2.css");
  assert.match(css, /html body #app #workspaceHomeGrid > \.wh2-card\.wh2-card\{\s*background:transparent !important;\s*border:0 !important;\s*box-shadow:none !important;/);
  assert.match(read("scripts/build_feature_css_bundle.js"), /"Assets\/style\/66-workspace-home-v2\.css"/);
  assert.match(read("Assets/style/app.feature.bundle.css"), /SOURCE: Assets\/style\/66-workspace-home-v2\.css/);
});

test("card names: cleaned, limited, saved to the account settings (HomeNames)", () => {
  const store = {};
  const g = {
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    addEventListener() {}, dispatchEvent() {}, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
    state: { unlocked: true, sessionUser: { id: "u1", settings: {} }, sessionToken: "t" }
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(read("Assets/app/ui/06-home-names.js"), g);
  const N = g.TriplemHomeNames;
  assert.equal(N.cleanName("  Petty \n  cash "), "Petty cash");
  assert.equal(N.cleanName("x".repeat(80)).length, 32);
  assert.deepEqual({ ...N.normalizeNames({ expenses: " Cash ", "Bad Key": "x", notes: "" }) }, { expenses: "Cash" });
  assert.equal(N.label("expenses", "Expenses"), "Expenses");
  N.set("expenses", "Petty cash");
  assert.equal(N.label("expenses", "Expenses"), "Petty cash");
  const saved = JSON.parse(store["triplem-home-names-v1:u1"]);
  assert.equal(saved.names.expenses, "Petty cash");
  assert.equal(saved.synced, false);
  N.reset("expenses");
  assert.equal(N.label("expenses", "Expenses"), "Expenses");
  // a newer name from another device (account settings) wins over an older synced local copy
  store["triplem-home-names-v1:u1"] = JSON.stringify({ names: { notes: "Old" }, at: 1, synced: true });
  g.state.sessionUser.settings.HomeNames = { names: { notes: "To-do" }, at: Date.now() + 5000 };
  assert.equal(N.label("notes", "Notes"), "To-do");
  const src = read("Assets/app/ui/06-home-names.js");
  assert.match(src, /supabaseRpc\("app_update_own_settings", \{ p_settings: \{ \[SETTINGS_KEY\]: rec \} \}/);
  assert.match(src, /const SETTINGS_KEY = "HomeNames";/);
});

test("Home Icons (Theme menu): New by default, Classic restores the earlier Home, saved to the account", () => {
  const theme = read("Assets/app/core/07-theme.js");
  // selector sits below the Background Bubbles switch
  const menu = theme.slice(theme.indexOf("function renderThemeDropdown()"));
  assert.ok(menu.indexOf('data-bg-motion-toggle aria-checked') < menu.indexOf('data-home-pack="new"'));
  assert.match(menu, /role="radiogroup" aria-labelledby="homeIconPackLabel"/);
  assert.match(menu, /data-home-pack="classic"/);
  assert.match(theme, /return local\?\.pack \|\| "new";/, "New is the default");
  assert.match(theme, /supabaseRpc\("app_update_own_settings", \{ p_settings: \{ HomeIconPack: local\.pack \} \}/);
  assert.match(theme, /const TRIPLEM_HOME_PACKS = Object\.freeze\(\["new", "classic"\]\);/);
  const nav = read("Assets/app/ui/01-render-navigation.js");
  assert.match(nav, /if \(pack === "classic"\) return `Assets\/logo\/icons\/\$\{WORKSPACE_CLASSIC_ICON_FILES\[k\] \|\| "dashboard\.png"\}`;/);
  assert.match(nav, /workspace-home-card--classic/);
  assert.match(nav, /classList\.toggle\("home-pack-classic", pack === "classic"\)/);
  for (const f of ["dashboard", "expenses", "accounting", "assets", "loans", "audit", "admin", "bitcoin", "triplem_ai", "inventory", "insurance", "installments", "notes"]) {
    assert.ok(fs.existsSync(path.join(root, `Assets/logo/icons/${f}.png`)), `classic icon ${f}.png`);
  }
  const css = read("Assets/style/66-workspace-home-v2.css");
  assert.match(css, /#workspaceHome:not\(\.home-pack-classic\) #workspaceHomeGrid\{/);
  assert.match(css, /#workspaceHome\.home-pack-classic \.workspace-home-title/);
  assert.match(css, /\.theme-menu-segment button\.is-selected/);
});
