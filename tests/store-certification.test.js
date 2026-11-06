"use strict";

/* Microsoft Store certification (2026-11-06):
 *  - 11.16 Live Generative AI Content: every AI answer can be reported.
 *  - 10.2.6 Cryptocurrency: the Bitcoin wallet is not offered in the Microsoft
 *    Store version of the Windows app (website, phones and Setup unchanged). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const text = rel => fs.readFileSync(path.join(root, rel), "utf8");

test("migration 206 is additive and only adds the AI report table and RPCs", () => {
  const sql = text("migrations/206_ai_content_reports.sql");
  assert.match(sql, /create table if not exists public\.app_ai_content_reports/);
  const body = sql.replace(/^--.*$/gm, "");
  assert.doesNotMatch(body, /\bdrop\s+table\b/i);
  assert.doesNotMatch(body, /\btruncate\b/i);
  assert.doesNotMatch(body, /\bdelete\s+from\b/i);
  for (const m of body.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?([\w.]+)/gi)) assert.equal(m[1], "public.app_ai_content_reports");
  for (const m of body.matchAll(/update\s+([\w.]+)\s+set/gi)) assert.equal(m[1], "public.app_ai_content_reports");
  assert.match(body, /create policy app_ai_content_reports_deny_all/);
  assert.match(body, /grant execute on function public\.app_report_ai_content\(text,text,text,text,text,jsonb\) to anon, authenticated, service_role/);
  assert.match(body, /public\.app_require_admin_comms\(\)/, "admin list/status need an administrator");
  assert.match(body, /perform public\.app_notify_admins\(\s*'system'/);
  assert.match(text("scripts/build_full_schema_sql.js"), /"206_ai_content_reports\.sql"/);
});

test("Triplem AI answers and live chat AI answers carry a Report button", () => {
  const ai = text("Assets/app/ai/02-triplem-ai.js");
  assert.match(ai, /window\.TriplemAiReport\.buttonHtml\(`data-triplem-ai-report="\$\{index\}"`/);
  assert.match(ai, /source: "triplem_ai"/);
  assert.match(ai, /generated: !!response\.answer/);
  const chat = text("Assets/app/landing/02-live-chat.js");
  assert.match(chat, /const report = isAi && safeText\(m\.body\) && window\.TriplemAiReport/);
  assert.match(chat, /source: isAzizSession\(\) \? "aziz" : "live_chat_ai"/);
  const html = text("index.html");
  assert.match(html, /<script defer src="Assets\/app\/ai\/03-ai-report\.js\?v=\d{8}-aireport\d+"><\/script>/);
  assert.match(text("scripts/build_feature_css_bundle.js"), /60-ai-report\.css/);
  assert.match(text("Assets/app/messaging/01-messaging.js"), /\|\| isAiContentReportNotification\(item\)/);
});

test("report dialog refuses unknown sources and empty answers; offers the same reasons as the server", async () => {
  const calls = [];
  const els = new Map();
  const mkEl = (id) => {
    const el = {
      id, className: "", innerHTML: "", attrs: {}, listeners: {}, classList: {
        set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); }
      },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
      querySelector: () => null
    };
    return el;
  };
  const g = {
    calls,
    document: {
      getElementById: id => els.get(id) || null,
      createElement: () => mkEl(""),
      body: { appendChild(el) { els.set(el.id, el); } },
      activeElement: null,
      contains: () => false
    },
    requestAnimationFrame: () => 0,
    supabaseRpc: async (name, args) => { calls.push([name, args]); return { ok: true }; },
    navigator: { onLine: true }
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(text("Assets/app/ai/03-ai-report.js"), g);
  const R = g.TriplemAiReport;
  assert.equal(R.open({ source: "unknown", content: "x" }), false, "unknown source refused");
  assert.equal(R.open({ source: "aziz", content: "   " }), false, "empty answer refused");
  assert.match(R.buttonHtml('data-x="1"'), /Report this AI response/);
  assert.match(R.buttonHtml('data-x="1"', true), /disabled/);
  // The full dialog (reasons, required comment for "Something else", sending,
  // thank-you state) is exercised in a real browser against PostgREST.
  assert.deepEqual(JSON.parse(JSON.stringify(R.reasons)), ["offensive", "harmful", "sexual", "inaccurate", "privacy", "other"]);
  assert.equal(calls.length, 0);
});

test("Bitcoin is hidden only in the Microsoft Store version of the Windows app", () => {
  const html = text("index.html");
  assert.match(html, /if \(d && d\.app === "windows" && d\.packaged === true\) \{\s*window\.TRIPLEM_STORE_APP = true;/);
  assert.match(html, /html\.triplem-store-app \.tab\[data-tab="bitcoin"\],\s*html\.triplem-store-app #bitcoinPanel,\s*html\.triplem-store-app \.store-hide-crypto,\s*html\.triplem-store-app option\[value="BTC"\]:not\(:checked\) \{ display: none !important; \}/);
  const session = text("Assets/app/auth/01-auth-session.js");
  assert.match(session, /if \(String\(moduleName \|\| ""\)\.toLowerCase\(\) === "bitcoin" && cryptoFeaturesHidden\(\)\) return false;/);
  assert.match(session, /if \(mod === "bitcoin" && cryptoFeaturesHidden\(\)\) allowed = false;/);
  const nav = text("Assets/app/ui/01-render-navigation.js");
  assert.match(nav, /if \(key === "bitcoin" && typeof cryptoFeaturesHidden === "function" && cryptoFeaturesHidden\(\)\) return false;/);
  assert.match(nav, /if \(tab === "bitcoin" && typeof cryptoFeaturesHidden === "function" && cryptoFeaturesHidden\(\)\) return;/);
  // The admin's user editor (userAllowedTabs) is not gated, so saving a user never removes Bitcoin access.
  assert.doesNotMatch(text("Assets/app/notes/01-notes.js"), /cryptoFeaturesHidden/);
  // No server or data change for this: the gate is page-side only.
  assert.doesNotMatch(text("migrations/206_ai_content_reports.sql"), /bitcoin/i);
});
