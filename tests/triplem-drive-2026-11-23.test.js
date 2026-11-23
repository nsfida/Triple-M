// Triplem Drive: fleet management and public vehicle bookings (2026-11-23, migration 236).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const exists = p => fs.existsSync(path.join(root, p));
const MIG = "migrations/236_triplem_drive.sql";
const TABLES = ["app_drive_fleets", "app_drive_slug_history", "app_drive_audit", "app_drive_sections", "app_drive_vehicles", "app_drive_media",
  "app_drive_routes", "app_drive_rates", "app_drive_drivers", "app_drive_bookings", "app_drive_booking_history", "app_drive_blocks", "app_drive_public_hits"];
const fnBody = (sql, name) => { const i = sql.indexOf(`create or replace function public.${name}(`); assert.ok(i >= 0, name); return sql.slice(i, sql.indexOf("$$;", sql.indexOf("$$", i) + 2)); };

test("migration 236 is additive: new tables only, deny-all RLS, no destructive statements", { skip: !exists(MIG) }, () => {
  const sql = read(MIG);
  const code = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /\bdrop\s+(table|column|schema)\b/i);
  assert.doesNotMatch(code, /\btruncate\b/i);
  assert.doesNotMatch(code, /\balter\s+table\s+public\.(?!app_drive_|%I)/i, "no existing table is altered");
  // DELETE only touches Triplem Drive's own rows (replaced logo/banner, removed photos/blocks, rate-limit counters).
  for (const m of code.matchAll(/\bdelete\s+from\s+public\.(\w+)/gi)) assert.match(m[1], /^app_drive_/, m[0]);
  for (const t of TABLES) {
    assert.match(code, new RegExp(`create table if not exists public\\.${t}\\(`), t);
    assert.ok(code.includes(`'${t}'`), `${t} gets RLS + deny-all + revoke`);
  }
  assert.match(code, /enable row level security/);
  assert.match(code, /for all using \(false\) with check \(false\)/);
  assert.match(code, /revoke all on public\.%I from anon, authenticated/);
  // existing rows: only app_users.settings gets the merged TriplemDrive key
  assert.match(code, /settings = coalesce\(settings, '\{\}'::jsonb\) \|\| jsonb_build_object\('TriplemDrive'/);
  assert.match(code, /app_system_backup__catalog\(\)[\s\S]*'app_drive_bookings', 'user', 'drive'/);
});

test("every function is SECURITY DEFINER with a fixed search_path; private helpers are not granted", { skip: !exists(MIG) }, () => {
  const sql = read(MIG).replace(/--.*$/gm, "");
  const defs = [...sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)\s*returns[\s\S]*?as \$\$/g)];
  assert.ok(defs.length > 40);
  for (const [whole, name] of defs) {
    assert.match(whole, /set search_path = public/, name);
    if (/^app_drive_|^app_admin_drive_/.test(name) && !name.startsWith("app_drive__")) {
      assert.match(whole, /security definer/, name);
      assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(`), `${name} granted`);
    }
    if (name.startsWith("app_drive__")) assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${name}\\(`), `${name} stays private`);
  }
});

test("authorisation: Main Admin only, owner resolved from the session, public by address only", { skip: !exists(MIG) }, () => {
  const sql = read(MIG);
  for (const f of ["app_admin_drive_get", "app_admin_drive_set", "app_admin_drive_check_slug"]) assert.match(fnBody(sql, f), /app_require_protected_admin\(\)/, f);
  const owner = fnBody(sql, "app_drive__owner");
  assert.match(owner, /current_app_user\(\)/);
  assert.match(owner, /team_owner_id is not null/);
  assert.match(owner, /not enabled for this account/);
  // every private RPC starts from the session owner, never from a parameter
  for (const m of sql.matchAll(/create or replace function public\.(app_drive_(?!public_|_)\w+)\(/g)) {
    if (m[1] === "app_drive_preview_link" || m[1] === "app_drive_context") { assert.match(fnBody(sql, m[1]), /app_drive__owner\(\)/); continue; }
    assert.match(fnBody(sql, m[1]), /o uuid := public\.app_drive__owner\(\)/, m[1]);
  }
});

test("public functions never return registrations, internal notes, owner ids or customer data", { skip: !exists(MIG) }, () => {
  const sql = read(MIG);
  const site = fnBody(sql, "app_drive_public_site");
  assert.doesNotMatch(site, /registration|internal_notes|owner_id'|customer_|to_jsonb\(v\)|to_jsonb\(r\)/);
  assert.match(site, /app_drive__visible\(f, p_preview\)/);
  assert.match(site, /v\.is_public/);
  const media = fnBody(sql, "app_drive_public_media");
  assert.match(media, /app_drive__visible\(f, p_preview\)/);
  assert.match(media, /v\.is_public/);
  const book = fnBody(sql, "app_drive_public_book");
  assert.match(book, /website/, "honeypot");
  assert.match(book, /app_request_network_fingerprint/, "rate limit by network");
  assert.match(book, /interval '10 minutes'\) >= 6/);
  assert.match(book, /for update/, "vehicle row locked before the overlap check");
  assert.match(book, /app_drive__clash\(/);
  assert.match(book, /not f\.published/);
  assert.doesNotMatch(book, /'error', sqlerrm\)/, "no raw database errors returned");
  assert.match(book, /else generic end/);
});

test("bookings: DB references, statuses, overlap only against confirmed bookings and blocks", { skip: !exists(MIG) }, () => {
  const sql = read(MIG);
  assert.match(sql, /create sequence if not exists public\.app_drive_booking_ref_seq/);
  assert.match(fnBody(sql, "app_drive__next_ref"), /'TD-' \|\| case when n < 1000000 then lpad\(n::text, 6, '0'\)/);
  assert.match(sql, /check \(status in \('pending','confirmed','rejected','cancelled','completed','no_show'\)\)/);
  assert.match(sql, /check \(status in \('available','booked','reserved','out_of_service','maintenance','sold','inactive'\)\)/);
  const clash = fnBody(sql, "app_drive__clash");
  assert.match(clash, /b\.status = 'confirmed'/);
  assert.match(clash, /app_drive_blocks/);
  for (const f of ["app_drive_booking_set_status", "app_drive_booking_save", "app_drive_block_save"]) assert.match(fnBody(sql, f), /for update/, f);
  assert.match(fnBody(sql, "app_drive_booking_set_status"), /insert into public\.app_drive_booking_history/);
  assert.match(fnBody(sql, "app_drive_public_book"), /Your booking request has been received|success_message/);
  assert.match(fnBody(sql, "app_drive__form"), /Your booking request has been received\. Our team will contact you to confirm your reservation\./);
});

test("app: only the small access file loads with the page; the rest loads when Triplem Drive is opened", () => {
  const html = read("index.html");
  assert.match(html, /<script defer src="Assets\/app\/drive\/00-drive-access\.js\?v=[^"]+"><\/script>/);
  assert.doesNotMatch(html, /drive\/0[1-4]-drive-|drive-app\.css/);
  assert.doesNotMatch(read("scripts/build_feature_css_bundle.js"), /drive-app\.css/);
  const acc = read("Assets/app/drive/00-drive-access.js");
  assert.match(acc, /f && f\.enabled === true/);
  assert.match(acc, /if \(!u \|\| u\.team_owner_id\) return null;/);
  assert.match(acc, /"Assets\/app\/drive\/02-drive-app\.js", "Assets\/app\/drive\/03-drive-ops\.js", "Assets\/app\/drive\/04-drive-setup\.js"/);
  assert.match(acc, /Manage vehicles, publish your fleet, receive reservations, and coordinate trips\./);
  assert.match(acc, /"Fleet Management & Vehicle Bookings"/);
  const nav = read("Assets/app/ui/01-render-navigation.js");
  assert.match(nav, /window\.TriplemDrive\?\.decorateHome\?\.\(grid\)/);
  assert.match(nav, /if \(tab === "drive"\) \{ try \{ window\.TriplemDrive\?\.open\?\.\(\); \}/);
  assert.ok(exists("Assets/logo/icons/home/drive.svg"));
});

test("Main Admin switch with activation dialog; no switch for team members", () => {
  const aum = read("Assets/app/admin/04-admin-user-manager.js");
  assert.match(aum, /main && !u\.team_owner_id \? sw\("feature:drive", "Triplem Drive"/);
  assert.match(aum, /key === "feature:drive"[\s\S]*?openDriveDialog\("enable"\)/);
  assert.match(aum, /app_admin_drive_set", \{ p_user_id: u\.id, p_enabled: false/);
  const dlg = read("Assets/app/drive/01-drive-admin.js");
  assert.match(dlg, /app_admin_drive_check_slug/);
  assert.match(dlg, /app_admin_drive_set", \{ p_user_id: user\.id, p_enabled: true, p_slug: okSlug, p_is_root: !!root\.checked \}/);
});

test("booking details: exact copy header, WhatsApp/email prepared (never claimed as sent)", () => {
  const ops = read("Assets/app/drive/03-drive-ops.js");
  assert.match(ops, /"TRIPLEM DRIVE — BOOKING DETAILS"/);
  assert.match(ops, /https:\/\/wa\.me\/\$\{esc\(wa\)\}\?text=/);
  assert.match(ops, /mailto:/);
  assert.match(ops, /nothing is sent until you send it there/);
  assert.doesNotMatch(ops, /message sent|email sent/i);
});

test("public page: address routing, SEO, escaping, honeypot; not in the sitemap", () => {
  const page = read("triplemdrive/index.html");
  assert.match(page, /<link rel="canonical"/);
  assert.match(page, /\/triplemdrive\/site\.js\?v=/);
  const js = read("triplemdrive/site.js");
  assert.match(js, /app_drive_public_site/);
  assert.match(js, /history\.replaceState\(null, "", `\/triplemdrive\/\$\{b\}\//);
  assert.match(js, /index \? "index,follow" : "noindex,nofollow"/);
  assert.match(js, /"@type": "AutoRental"/);
  assert.match(js, /name="website" tabindex="-1"/);
  assert.match(js, /if \(r && r\.ok && r\.reference\)/, "success only after the server stored the request");
  assert.doesNotMatch(js, /innerHTML = [^`]*\$\{(?!esc\()/, "dynamic values are escaped");
  assert.doesNotMatch(read("sitemap.xml"), /triplemdrive/);
  assert.match(read("scripts/build_production.js"), /"triplemdrive", "windows-store"\]/);
  assert.match(read("_redirects"), /^\/triplemdrive\/:slug\/\s+\/triplemdrive\/index\.html\s+200$/m);
  assert.match(read("404.html"), /\/triplemdrive\/\?b=/);
});

test("brand spelling: Triplem / TRIPLEM / Triplem Drive only", () => {
  const files = ["Assets/app/drive/00-drive-access.js", "Assets/app/drive/01-drive-admin.js", "Assets/app/drive/02-drive-app.js", "Assets/app/drive/03-drive-ops.js",
    "Assets/app/drive/04-drive-setup.js", "Assets/drive/drive-app.css", "triplemdrive/index.html", "triplemdrive/site.js", "triplemdrive/site.css", "docs/TRIPLEM-DRIVE.md"];
  if (exists(MIG)) files.push(MIG);
  for (const f of files) if (exists(f)) assert.doesNotMatch(read(f), /TRIPLEm/, f);
});
