"use strict";
// Admin > Marketing (2026-11-28): templates, .eml drafts, WhatsApp, unsubscribe page, Main Admin only.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const exists = rel => fs.existsSync(path.join(root, rel));

function templates(){
  const ctx = { TextEncoder, btoa: s => Buffer.from(s, "binary").toString("base64") };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("Assets/app/admin/05-marketing-templates.js"), ctx);
  return ctx.TriplemMarketingTemplates;
}
const settings = { sender_name: "Sales Team", sender_title: "Partnerships", email: "info@triplem.vip", phone: "+966 59 673 9938", whatsapp: "966596739938", website: "https://triplem.vip", address: "Dubai" };
const TOKEN = "ab".repeat(32);

test("every template builds a complete, branded email with a personal unsubscribe link", () => {
  const T = templates();
  const list = T.list();
  assert.ok(list.length >= 8, "at least 8 templates");
  for (const t of list) {
    const m = T.buildEmail({ template: t.id, contact: { name: "Gulf Trading LLC", contact_person: "Ahmed Khan" }, settings, token: TOKEN });
    assert.match(m.subject, /^Gulf Trading LLC: /, t.id);
    assert.match(m.html, /src="cid:triplem-logo@triplem\.vip"/, t.id);
    assert.match(m.html, /Dear Ahmed,/, t.id);
    assert.match(m.html, /Start your free 14-day trial/, t.id);
    assert.ok(m.html.includes(`https://triplem.vip/unsubscribe/?t=${TOKEN}`), t.id);
    assert.ok(m.text.includes(`Unsubscribe: https://triplem.vip/unsubscribe/?t=${TOKEN}`), t.id);
    assert.match(m.html, /Sales Team[\s\S]*Partnerships[\s\S]*info@triplem\.vip/, t.id);
    assert.ok(m.html.includes(`https://triplem.vip/go/?t=${TOKEN}&amp;l=trial`), `${t.id}: tracked trial link`);
    const pv = T.buildEmail({ template: t.id, contact: { name: "Gulf Trading LLC" }, settings, token: "preview" });
    assert.match(pv.html, new RegExp(`utm_campaign=${t.id}`), `${t.id}: preview uses the plain link`);
    assert.doesNotMatch(m.html, new RegExp("TRIPLE" + "m"));
  }
});

test("contact and settings values are escaped; a name cannot inject HTML or mail headers", () => {
  const T = templates();
  const evil = { name: 'Evil <img src=x onerror=alert(1)> "Co"\r\nBcc: victim@x.com', contact_person: "<script>x</script>" };
  const m = T.buildEmail({ template: "overview", contact: evil, settings: { ...settings, sender_name: "<b>me</b>" }, token: TOKEN, note: "<a href=javascript:1>hi</a>" });
  assert.doesNotMatch(m.html, /<img src=x|<script>|<a href=javascript|<b>me<\/b>/);
  assert.match(m.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  const eml = T.buildEml({ to: "a@b.com\r\nBcc: victim@x.com", toName: evil.name, subject: m.subject, html: m.html, text: m.text, unsubscribeUrl: m.unsubscribeUrl, replyTo: "info@triplem.vip", logoBase64: "iVBORw0KGgo=", template: "overview" });
  const head = eml.split("\r\n\r\n")[0];
  assert.doesNotMatch(head, /\r\nBcc:/i, "no injected header");
  assert.equal((head.match(/\r\nTo: /g) || []).length, 1);
  assert.ok(head.split("\r\n").every(l => !/^\s*$/.test(l)), "no blank line inside the header");
});

test(".eml draft: opens ready to send, UTF-8 subject, List-Unsubscribe, inline logo, decodable parts", () => {
  const T = templates();
  const m = T.buildEmail({ template: "insurance", contact: { name: "شركة الخليج للتأمين" }, settings, token: TOKEN });
  const eml = T.buildEml({ to: "info@gulf.ae", toName: "شركة الخليج", subject: m.subject, html: m.html, text: m.text, unsubscribeUrl: m.unsubscribeUrl, replyTo: "info@triplem.vip", logoBase64: Buffer.from("PNGDATA").toString("base64"), template: "insurance" });
  assert.match(eml, /^X-Unsent: 1\r\n/);
  assert.match(eml, /\r\nTo: "=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=" <info@gulf\.ae>\r\n/);
  assert.match(eml, /\r\nSubject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);
  assert.ok(eml.includes(`List-Unsubscribe: <https://triplem.vip/unsubscribe/?t=${TOKEN}>, <mailto:info@triplem.vip?subject=Unsubscribe>`));
  assert.match(eml, /Content-ID: <triplem-logo@triplem\.vip>/);
  const html = /Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n\r\n/.exec(eml)[1];
  assert.equal(Buffer.from(html.replace(/\r\n/g, ""), "base64").toString("utf8"), m.html);
  assert.ok(eml.split("\r\n").every(l => l.length <= 998), "RFC 5322 line length");
});

test("WhatsApp: prepared text with opt-out, wa.me link with digits only", () => {
  const T = templates();
  const text = T.buildWhatsApp({ template: "inventory", contact: { name: "Desert Trading", kind: "company" }, settings });
  assert.match(text, /^Hello Desert Trading team,/);
  assert.match(text, /Inventory 2\.0/);
  assert.match(text, /Reply STOP/);
  assert.match(text, /utm_source=whatsapp/);
  assert.equal(T.whatsappUrl("+971 (50) 123-4567", "Hi there"), "https://wa.me/971501234567?text=Hi%20there");
  assert.equal(T.whatsappUrl("", "x"), "");
});

test("Marketing is wired for the Main Admin only and uses the shared side panel", () => {
  for (const html of ["index.html", "ar/index.html", "ur/index.html"]) {
    const s = read(html);
    assert.match(s, /<button class="btn soft tiny admin-tool-btn hide" id="adminMarketingBtn"/, html);
    assert.match(s, /admin\/05-marketing-templates\.js\?v=20261128-mk\d+"[\s\S]*admin\/06-marketing\.js\?v=20261128-mk\d+"/, html);
    assert.match(s, /connect-src[^;"]*http:\/\/127\.0\.0\.1:8765/, html);
  }
  assert.match(read("Assets/app/admin/01-admin.js"), /document\.getElementById\("adminMarketingBtn"\)\?\.classList\.toggle\("hide", !allowed\);/);
  const ui = read("Assets/app/admin/06-marketing.js");
  assert.match(ui, /if \(!dp\?\.custom\?\.open \|\| !k \|\| !isMainAdmin\(\)\) return false;/);
  assert.match(ui, /const HELPER = "http:\/\/127\.0\.0\.1:8765";/);
  assert.match(ui, /attachShadow\(\{ mode: "open" \}\)/, "preview without iframe");
  assert.doesNotMatch(ui, /<iframe/);
  assert.match(read("scripts/build_feature_css_bundle.js"), /"Assets\/style\/77-marketing\.css"/);
});

test("unsubscribe page: not indexed, strict CSP, confirm button, token never stored in the page", () => {
  const html = read("unsubscribe/index.html");
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, /default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src https:\/\/\*\.supabase\.co/);
  assert.doesNotMatch(html, /<script>(?!\s*<\/script>)|on(click|load)=/i, "no inline script");
  const js = read("unsubscribe/unsubscribe.js");
  assert.match(js, /\/\^\[0-9a-f\]\{64\}\$\//);
  assert.match(js, /rpc\/app_marketing_unsubscribe/);
  assert.match(js, /addEventListener\("click"/, "nothing happens without the click");
  assert.match(js, /history\.replaceState\(null, "", location\.pathname\)/);
  assert.match(read("scripts/build_production.js"), /"unsubscribe"/);
});

test("migration 248: closed tables, Main Admin checks, public unsubscribe by token only", { skip: !exists("migrations/248_marketing_contacts.sql") }, () => {
  const sql = read("migrations/248_marketing_contacts.sql");
  for (const t of ["marketing_contacts", "marketing_events", "marketing_unsubscribe_tokens", "marketing_suppressions", "marketing_settings"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${t} `), t);
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`), t);
  }
  assert.doesNotMatch(sql, /create policy/i, "no policies: closed to the browser");
  assert.doesNotMatch(sql, /\b(drop table|drop column|truncate|delete from|alter table [a-z_.]+ (drop|alter))\b/i);
  const fns = [...sql.matchAll(/create or replace function public\.(app_marketing_[a-z_]+)\(([\s\S]*?)\n(?:end \$\$|\$\$;)/g)];
  assert.ok(fns.length >= 15);
  for (const [, name, body] of fns) {
    if (name === "app_marketing_unsubscribe") continue;
    assert.match(body, /public\.app_require_protected_admin\(\)/, `${name} checks the Main Admin`);
    assert.match(body, /security definer set search_path to 'public'/, name);
  }
  assert.match(sql, /insert into public\.marketing_unsubscribe_tokens \(token_hash, contact_id, email\) values \(public\.app_hash_token\(tok\)/);
  assert.match(sql, /if coalesce\(p_token, ''\) !~ '\^\[0-9a-f\]\{64\}\$' then raise exception 'This unsubscribe link is not valid'/);
  assert.match(sql, /'This contact unsubscribed from emails\. Do not email them\.'/);
  assert.match(read("scripts/build_full_schema_sql.js"), /"248_marketing_contacts\.sql"/);
});

test("marketing-finder: Main Admin check first, OpenStreetMap only, safe website reading", { skip: !exists("supabase/functions/marketing-finder/index.ts") }, () => {
  const src = read("supabase/functions/marketing-finder/index.ts");
  const lib = read("supabase/functions/marketing-finder/lib.ts");
  assert.ok(src.indexOf('await callRpc("app_marketing_finder_authorize"') < src.indexOf('body?.action === "categories"'), "authorised before any work");
  assert.match(src, /redirect: "manual"/);
  assert.match(src, /if \(!safeHost\(u\)\) return null;/);
  assert.match(src, /while \(size < 600_000\)/);
  assert.match(lib, /if \(!h\.includes\("\."\) \|\| \/\^\[0-9\.\]\+\$\/\.test\(h\)/);
  assert.match(src, /© OpenStreetMap contributors \(ODbL\)/);
  assert.match(src, /const ALLOW_LOCALHOST = /);
});

test("Find new keeps working when the map services refuse the server: city list, several servers, browser fallback", () => {
  const ui = read("Assets/app/admin/06-marketing.js");
  assert.match(ui, /if \(!\/\^\(geocode_unreachable\|osm_unreachable\)\$\/\.test\(e\.code \|\| ""\)\) throw e;/);
  assert.match(ui, /finderCall\(\{ action: "plan", \.\.\.base \}\)/);
  assert.match(ui, /finderCall\(\{ action: "enrich", \.\.\.base, elements: slim, place: plan\.place, partial \}\)/);
  assert.match(ui, /scan_websites: false, scan_async: true/, "website contacts are read in the background");
  assert.match(ui, /finderCall\(\{ action: "scan", items: batch\.map/);
  assert.match(ui, /batches\.push\(todo\.slice\(i, i \+ 12\)\)/);
  for (const html of ["index.html", "ar/index.html", "ur/index.html"]) {
    const csp = /connect-src[^;"]*/.exec(read(html))[0];
    for (const host of ["https://overpass-api.de", "https://overpass.private.coffee", "https://nominatim.openstreetmap.org"]) assert.ok(csp.includes(host), `${html} ${host}`);
  }
});

test("marketing-finder tries the built-in city list, Photon, Nominatim and several Overpass servers", { skip: !exists("supabase/functions/marketing-finder/index.ts") }, () => {
  const src = read("supabase/functions/marketing-finder/index.ts");
  const lib = read("supabase/functions/marketing-finder/lib.ts");
  assert.ok(src.indexOf("const known = findCity(city, country);") < src.indexOf("new URL(PHOTON_URL)"));
  assert.ok(src.indexOf("new URL(PHOTON_URL)") < src.indexOf("new URL(NOMINATIM_URL)"));
  assert.match(src, /overpass-api\.de\/api\/interpreter,https:\/\/overpass\.private\.coffee\/api\/interpreter,https:\/\/maps\.mail\.ru/);
  assert.match(src, /"geocode_unreachable"/);
  assert.match(src, /"osm_unreachable"/);
  assert.match(src, /if \(!\["search", "plan", "enrich", "scan"\]\.includes\(action\)\)/);
  assert.match(src, /for \(const st of stepsFor\(place\.radius \|\| 15_000\)\)/, "small central area first, then wider");
  assert.ok(src.indexOf('await callRpc("app_marketing_finder_authorize"') < src.indexOf('const action = String(body?.action'), "Main Admin check before every action");
  assert.match(lib, /\[\["dubai"\], "united arab emirates"/);
  assert.match(lib, /\[\["riyadh"\], "saudi arabia"/);
});


test("template wording can be customised and still escapes contact and admin text", () => {
  const T = templates();
  const def = T.defaults("insurance");
  assert.ok(def.subject && def.headline && def.intro && def.cta, "standard wording available");
  const s2 = { ...settings, template_overrides: { insurance: { subject: "Offer for {company}", intro: "Hello {name} <b>x</b>", cta: "Try it now" } } };
  const m = T.buildEmail({ template: "insurance", contact: { name: "Gulf <Co>", contact_person: "Sara Ali" }, settings: s2, token: TOKEN });
  assert.equal(m.subject, "Offer for Gulf <Co>");
  assert.match(m.html, /Hello Sara &lt;b&gt;x&lt;\/b&gt;/);
  assert.match(m.html, /Try it now/);
  assert.doesNotMatch(m.html, /<b>x<\/b>/);
  const other = T.buildEmail({ template: "overview", contact: { name: "Gulf" }, settings: s2, token: TOKEN });
  assert.notEqual(other.subject, "Offer for Gulf", "overrides apply to one template only");
});

test("link tracking page: no-index, strict CSP, fixed destinations only", () => {
  const html = read("go/index.html");
  const js = read("go/go.js");
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.match(html, /Content-Security-Policy[^>]*default-src 'none'/);
  assert.match(js, /const ALLOWED = \/\^https:\\\/\\\/\(triplem\\\.vip\\\//);
  assert.match(js, /app_marketing_click/);
  assert.doesNotMatch(js, /location\.(href|replace)\(\s*params/, "never redirects to an address taken from the link");
  assert.ok(read("scripts/build_production.js").includes('"go"'), "go/ is published");
});

test("Marketing v2 panel: overview, campaigns, bulk actions, CSV, compact styles", () => {
  const ui = read("Assets/app/admin/06-marketing.js");
  for (const tab of ['["overview", "Overview"', '["contacts", "Contacts"', '["campaigns", "Campaigns"', '["find", "Find new"', '["templates", "Templates"', '["settings", "Settings"']) assert.ok(ui.includes(tab), tab);
  for (const rpc of ["app_marketing_stats", "app_marketing_bulk", "app_marketing_log_activity", "app_marketing_campaign_start", "app_marketing_campaign_finish", "app_marketing_campaigns", "app_marketing_export"]) assert.ok(ui.includes(`"${rpc}"`), rpc);
  assert.match(ui, /x\.email_status === "unsubscribed" \? "unsubscribed"/, "campaigns skip unsubscribed contacts");
  assert.match(ui, /a\.ok\.length > 50/, "at most 50 emails per run");
  assert.match(ui, /if \(\/\^\[=\+\\-@\\t\\r\]\/\.test\(t\)\) t = "'" \+ t;/, "CSV export is formula-safe");
  assert.equal((ui.match(/<form /g) || []).length, (ui.match(/<form class="tm-mk-form" data-dp-form/g) || []).length, "forms never submit the page");
  const css = read("Assets/style/77-marketing.css");
  assert.match(css, /--mk-h:32px/);
  assert.match(css, /@media \(pointer:coarse\)\{\.tm-mk-in\{font-size:16px\}/);
  assert.doesNotMatch(ui + css, new RegExp("TRIPLE" + "m"));
});
