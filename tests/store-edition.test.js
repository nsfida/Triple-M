"use strict";
// Microsoft Store edition (2026-11-11): certification fixes for 10.2.6 (no cryptocurrency),
// 10.8.4 (trial scope and limits), 11.16 (AI disclosure and reporting), Store-only updates,
// sign-up with module choice and recorded acceptance of the terms (migration 223).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const exists = rel => fs.existsSync(path.join(root, rel));
const M223 = "migrations/223_signup_modules_and_trial_terms.sql";
const skipSql = exists(M223) ? false : "Database migrations are not present in this checkout";
const skipFn = exists("supabase/functions/aziz-live-support/index.ts") ? false : "Edge functions are not present in this checkout";
const CRYPTO = /\b(bit ?coins?|btc|crypto\w*|blockchains?|satoshis?|ethereum|usdt|wallet address|seed phrase|private key)\b|₿/i;
const STATEMENT = /The Microsoft Store edition does not include cryptocurrency features\./g;

function storeContext(desktop) {
  const g = {
    document: {
      documentElement: { classList: { add() {} } },
      head: { appendChild() {} },
      createElement: () => ({ set textContent(v) {} }),
      readyState: "complete",
      createTreeWalker: () => ({ nextNode: () => null })
    },
    location: { href: "https://triplem.vip/" },
    MutationObserver: class { observe() {} },
    NodeFilter: { SHOW_TEXT: 4 },
    URL
  };
  g.window = g;
  if (desktop) g.__TRIPLEM_DESKTOP__ = desktop;
  vm.createContext(g);
  vm.runInContext(read("Assets/app/core/00-store-edition.js"), g);
  return g;
}

test("the Store edition flag, client tag and text cleaner behave per edition", () => {
  const store = storeContext({ app: "windows", edition: "store", packaged: true }).TriplemStore;
  assert.equal(store.active, true);
  assert.equal(store.clientTag, "windows-store");
  assert.equal(store.isCryptoCode("btc"), true);
  assert.deepEqual([...store.filterCurrencyCodes(["AED", "BTC", "USD"])], ["AED", "USD"]);
  assert.equal(store.cleanText("Expenses, loans and Bitcoin wallets in one place."), "Expenses, loans in one place.");
  assert.equal(store.cleanText("Track stock. Send Bitcoin from your wallet."), "Track stock.");
  assert.equal(CRYPTO.test(store.cleanText("Bitcoin integration")), false);

  const direct = storeContext({ app: "windows", edition: "direct", packaged: false }).TriplemStore;
  assert.equal(direct.active, false);
  assert.equal(direct.clientTag, "windows");
  assert.equal(direct.cleanText("Bitcoin wallets"), "Bitcoin wallets");

  const web = storeContext(null).TriplemStore;
  assert.equal(web.active, false);
  assert.equal(web.clientTag, "web");
  assert.deepEqual([...web.filterCurrencyCodes(["AED", "BTC"])], ["AED", "BTC"]);
});

test("the Store edition removes app downloads, keeps the statement and blocks crypto services", () => {
  const src = read("Assets/app/core/00-store-edition.js");
  for (const sel of ["#windowsDownloadBtn", "a[href*=\\\"mobile_app/\\\"]", "[data-store-remove]", ".store-hide-crypto"]) assert.ok(src.includes(sel), sel);
  assert.match(src, /\[data-store-keep\]/);
  assert.match(src, /blockstream\.info/);
  assert.match(src, /api\.coingecko\.com/);
  const html = read("index.html");
  // loaded first, synchronously, right after the inline edition flag
  assert.ok(html.indexOf("00-store-edition.js") < html.indexOf("Assets/app/core/02-state.js"));
  assert.match(html, /<li data-store-keep>The Microsoft Store edition does not include cryptocurrency features\.<\/li>/);
  assert.match(html, /<section class="store-only store-edition-card" hidden/);
});

test("trial and general terms: one source, accurate lifecycle, crypto-free except the one statement", () => {
  const T = require(path.join(root, "Assets/app/core/04-trial-terms.js"));
  assert.match(T.VERSION, /^\d{4}-\d{2}-\d{2}(\.\d+)?$/);
  assert.equal(T.TRIAL_DAYS, 14);
  assert.equal(T.GRACE_DAYS, 3);
  assert.equal(T.LOCK_DAYS, undefined, "there is no locked day any more (migration 224)");
  const trial = T.plainText(T.TRIAL);
  for (const needle of [/14 days/, /no card/i, /3-day grace period/, /limited access/i, /not switched off/i, /not deleted/i, /Triplem AI/, /own Google Gemini API key/, /Insurance/, /internet connection/i, /bank transfer directly to Triplem VIP/, /do not renew automatically/, /Microsoft is not the seller/, /Updates for the Microsoft Store edition come only from the Microsoft Store/]) {
    assert.match(trial, needle, String(needle));
  }
  for (const text of [trial, T.plainText(T.TERMS)]) {
    assert.equal(CRYPTO.test(text.replace(STATEMENT, "")), false, "no crypto wording beyond the statement");
    assert.equal((text.match(STATEMENT) || []).length, 1);
  }
  // the statement is rendered so that the Store edition keeps it
  assert.match(T.sectionsHtml(T.TRIAL), /<li data-store-keep>The Microsoft Store edition does not include cryptocurrency features\./);
  // the price table uses the configured prices
  assert.match(T.priceHtml([{ code: "AED", monthly: 49, yearly: 449, teamMonthly: 10, teamYearly: 80 }], "AED"), /<th scope="row">AED<\/th><td>49<\/td><td>449<\/td><td>10 \/ 80<\/td>/);
});

test("the windows-store pages are generated, current, in the build and in the sitemap", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/build_windows_store_pages.js"), "--check"], { stdio: "pipe" });
  const pages = ["index.html", "trial-terms.html", "terms.html", "privacy.html", "ai.html"];
  for (const p of pages) {
    const html = read(`windows-store/${p}`);
    assert.match(html, /<link rel="canonical" href="https:\/\/triplem\.vip\/windows-store\//, p);
    assert.match(html, /<meta name="description" content="[^"]{60,}"/, p);
    assert.match(html, /application\/ld\+json/, p);
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
    assert.equal(CRYPTO.test(visible.replace(STATEMENT, "")), false, `${p}: crypto wording`);
  }
  assert.match(read("windows-store/index.html"), /Updates[\s\S]*only by the Microsoft Store/);
  assert.match(read("windows-store/index.html"), /does not include cryptocurrency features/);
  assert.match(read("windows-store/ai.html"), /Report an issue/);
  assert.match(read("scripts/build_production.js"), /"windows-store"\]/);
  const sitemap = read("sitemap.xml");
  for (const loc of ["windows-store/", "windows-store/trial-terms.html", "windows-store/terms.html", "windows-store/privacy.html", "windows-store/ai.html"]) {
    assert.ok(sitemap.includes(`<loc>https://triplem.vip/${loc}</loc>`), loc);
  }
});

test("sign-up: module choice, trial facts, required terms, purchase confirmation, v4 with safe fallback", () => {
  const src = read("Assets/app/auth/02-auth-welcome-trial.js");
  for (const key of ["expenses", "inventory_v2", "assets", "loans", "installments", "notes", "accounting"]) {
    assert.match(src, new RegExp(`key: "${key}"`), key);
  }
  assert.match(src, /\.\.\.\(storeNoCrypto \? \[\] : \[\{ key: "bitcoin"/);
  assert.match(src, /id="trialTermsAccept"/);
  assert.match(src, /data-open-terms="trial"/);
  assert.match(src, /How the free trial works/);
  assert.match(src, /id="trialPurchaseConfirm"/);
  assert.match(src, /supabaseRpc\("app_signup_v4", \{[\s\S]*p_modules: modules,[\s\S]*p_client:[\s\S]*p_terms_accepted: true,[\s\S]*p_terms_version: termsVersion/);
  assert.match(src, /if \(!missingFn\(v4Error\)\) throw v4Error;/);
  assert.match(src, /Please accept the Terms and Conditions and the Free Trial Terms\./);
  // renewals also ask for the purchase confirmation
  assert.match(read("Assets/app/admin/01-admin.js"), /id="planPurchaseConfirm"[\s\S]*Please confirm that you are starting a purchase\./);
});

test("trial banner: Trial Terms link, trial countdown with what happens next, grace notice", () => {
  const html = read("index.html");
  assert.match(html, /<button type="button" id="accessBannerTerms" class="access-banner-terms" data-open-terms="trial">Trial Terms and Conditions<\/button>/);
  assert.match(html, /<script defer src="Assets\/app\/core\/04-trial-terms\.js\?v=[^"]+"><\/script>/);
  const els = read("Assets/app/core/03-els.js");
  assert.match(els, /accessBannerTerms: document\.getElementById\("accessBannerTerms"\)/);
  assert.match(els, /const showGrace = lifecycle\?\.kind === "grace";/);
  assert.match(els, /const showLimited = lifecycle\?\.kind === "limited";/);
  assert.match(els, /3-day grace period; then new entries are paused until you choose a plan/);
  const la = read("Assets/app/core/05-limited-access.js");
  assert.match(la, /Your free trial has ended · grace period/);
  assert.match(la, /Limited access · new entries are paused/);
});

test("AI: disclosure and always-visible reporting in every AI surface, admin review queue", () => {
  const html = read("index.html");
  assert.match(html, /data-ai-report-general="aziz" data-ai-report-surface="live_chat"/);
  assert.ok((html.match(/class="ai-disclosure/g) || []).length >= 2);
  const ai = read("Assets/app/ai/02-triplem-ai.js");
  assert.match(ai, /headerButtonHtml\("triplem_ai", "workspace"\)/);
  assert.match(ai, /disclosureHtml\("triplem_ai", "workspace"\)/);
  assert.match(ai, /client: \(window\.TriplemStore && window\.TriplemStore\.clientTag\) \|\| "web"/);
  assert.match(read("Assets/app/landing/02-live-chat.js"), /client: \(window\.TriplemStore && window\.TriplemStore\.clientTag\) \|\| "web"/);
  assert.match(read("Assets/app/messaging/01-messaging.js"), /id: "review-ai-report"/);
  assert.match(read("Assets/app/desktop/01-windows-desktop.js"), /accItem\("ai", "Report AI content"/);
});

test("Windows app menu: Store edition shows Store updates and edition notes, never the updater", () => {
  const d = read("Assets/app/desktop/01-windows-desktop.js");
  assert.match(d, /if \(storeEdition && !caps\.has\("update"\)\)/);
  assert.match(d, /Updates are delivered only by the Microsoft Store/);
  assert.match(d, /<p class="dam-note" data-store-keep>The Microsoft Store edition does not include cryptocurrency features\.<\/p>/);
});

test("edge functions: Store client gets a crypto-free prompt, currencies and answers", { skip: skipFn }, () => {
  for (const f of ["supabase/functions/aziz-live-support/index.ts", "supabase/functions/triplem-ai/index.ts"]) {
    const src = read(f);
    assert.match(src, /"windows-store"/, f);
    assert.match(src, /STORE_CRYPTO_CODES/, f);
    assert.match(src, /storeCleanText\(/, f);
    assert.match(src, /That feature is not part of the Microsoft Store edition of Triplem VIP\./, f);
  }
  assert.match(read("supabase/functions/aziz-live-support/index.ts"), /if \(storeEdition && answer\) answer = storeAnswer\(answer\);/);
  assert.match(read("supabase/functions/triplem-ai/index.ts"), /ctx\.store_edition = String\(body\?\.client \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "windows-store";/);
});

test("migration 223 is additive, wraps v3 and never gives the Store client crypto", { skip: skipSql }, () => {
  const sql = read(M223);
  assert.doesNotMatch(sql, /\b(drop\s+(table|function|column|index|trigger|policy)|truncate|delete from|alter table|create table)\b/i);
  assert.match(sql, /create or replace function public\.app_signup_v4\(/);
  assert.match(sql, /res := public\.app_signup_v3\(/);
  assert.match(sql, /if store_client and m = 'bitcoin' then continue; end if;/);
  assert.match(sql, /if cur = any\(crypto_codes\) and \(store_client or not 'bitcoin' = any\(mods\)\) then continue; end if;/);
  assert.match(sql, /Please accept the Terms and Conditions and the Free Trial Terms to continue\./);
  assert.match(sql, /insert into public\.inventory_v2_access\([\s\S]*on conflict \(owner_id\) do nothing;/);
  assert.match(sql, /grant execute on function public\.app_signup_v4\([^)]*\) to anon, authenticated, service_role;/);
  assert.match(read("scripts/build_full_schema_sql.js"), /"223_signup_modules_and_trial_terms\.sql"/);
});
