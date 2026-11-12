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

test("Home Style: 6 icon packs, 4 layouts, size and spacing, saved to the account", () => {
  const theme = read("Assets/app/core/07-theme.js");
  const menu = theme.slice(theme.indexOf("function renderThemeDropdown()"));
  assert.ok(menu.indexOf("data-bg-motion-toggle aria-checked") < menu.indexOf("data-home-customize"), "below the bubbles switch");
  assert.match(menu, /window\.TriplemHomeStyle\?\.open\?\.\(\)/);
  const src = read("Assets/app/ui/07-home-style.js");
  assert.match(src, /const SETTINGS_KEY = "HomeStyle";/);
  assert.match(src, /supabaseRpc\("app_update_own_settings", \{ p_settings: \{ \[SETTINGS_KEY\]: value, HomeIconPack: legacy \} \}/);
  assert.match(read("index.html"), /<script defer src="Assets\/app\/ui\/07-home-style\.js\?v=[^"]+"><\/script>/);
  // behaviour
  const store = {};
  const g = {
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    addEventListener() {}, dispatchEvent() {}, CustomEvent: class {},
    navigator: { onLine: true }, document: { getElementById: () => null, querySelectorAll: () => [] },
    state: { unlocked: true, sessionUser: { id: "u1", settings: {} } }
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(src, g);
  const H = g.TriplemHomeStyle;
  assert.equal(JSON.stringify(H.PACKS.map(p => p.id)), JSON.stringify(["standard", "classic", "jewel", "pastel", "neon", "luxe"]));
  assert.equal(JSON.stringify(H.LAYOUTS.map(l => l.id)), JSON.stringify(["grid", "cards", "list", "compact"]));
  assert.equal(JSON.stringify(H.get()), JSON.stringify({ pack: "standard", layout: "grid", size: 100, gap: 100 }), "defaults");
  assert.equal(JSON.stringify(H.normalize({ pack: "x", layout: "y", size: 999, gap: 3 })), JSON.stringify({ pack: "standard", layout: "grid", size: 140, gap: 40 }));
  g.state.sessionUser.settings.HomeIconPack = "classic";
  assert.equal(H.get().pack, "classic"); assert.equal(H.get().layout, "cards");
  g.state.sessionUser.settings.HomeStyle = { pack: "neon", layout: "compact", size: 120, gap: 80, at: Date.now() + 1000 };
  assert.equal(H.get().pack, "neon");
  assert.equal(H.iconSrc("notes", "neon"), "Assets/logo/icons/packs/neon/notes.svg?v=20261112");
  assert.equal(H.iconSrc("notes", "classic"), "Assets/logo/icons/notes.png");
  assert.match(H.iconSrc("notes", "standard"), /^Assets\/logo\/icons\/home\/notes\.svg/);
  for (const pack of ["jewel", "pastel", "neon", "luxe"]) {
    for (const key of ["dashboard", "expenses", "inventory2", "goods", "accounting", "audit", "assets", "loans", "installments", "notes", "triplem-ai", "insurance", "bitcoin", "admin", "messages"]) {
      const svg = read(`Assets/logo/icons/packs/${pack}/${key}.svg`);
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100"/, `${pack}/${key}`);
      assert.doesNotMatch(svg, /<script|href=/i);
    }
  }
  const nav = read("Assets/app/ui/01-render-navigation.js");
  assert.match(nav, /if \(layout === "cards"\) \{/);
  const css = read("Assets/style/66-workspace-home-v2.css");
  for (const l of ["list", "compact", "cards"]) assert.match(css, new RegExp(`#workspaceHome\\.home-layout-${l} #workspaceHomeGrid\\{`));
  assert.match(css, /width:calc\(92px \* var\(--wh-icon-scale,1\)\)/);
  assert.match(css, /column-gap:calc\(clamp\(10px,1\.6vw,22px\) \* var\(--wh-gap-scale,1\)\)/);
  assert.match(css, /\.home-style-panel\{/);
});
