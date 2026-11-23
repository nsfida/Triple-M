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
  assert.match(dlg, /app_admin_drive_set", \{ p_user_id: user\.id, p_enabled: true, p_slug: okSlug, p_is_root: null \}/);
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
  assert.match(js, /history\.replaceState\(null, "", `\/\$\{v\}\/\$\{keep\}/);
  assert.match(js, /return "triplemdrive";/);
  assert.match(js, /data-book>/);
  assert.match(js, /el\.className = "tdx-pnl"; el\.setAttribute\("role", "dialog"\); el\.setAttribute\("aria-modal", "true"\)/);
  assert.match(js, /ov\.className = "tdx-wz"; ov\.setAttribute\("role", "dialog"\); ov\.setAttribute\("aria-modal", "true"\)/);
  assert.match(js, /index \? "index,follow" : "noindex,nofollow"/);
  assert.match(js, /"@type": "AutoRental"/);
  assert.match(js, /name="website" tabindex="-1"/);
  assert.match(js, /if \(r && r\.ok && r\.reference\)/, "success only after the server stored the request");
  assert.doesNotMatch(js, /innerHTML = [^`]*\$\{(?!esc\()/, "dynamic values are escaped");
  assert.doesNotMatch(read("sitemap.xml"), /triplemdrive/);
  assert.match(read("scripts/build_production.js"), /"triplemdrive", "windows-store"\]/);
  assert.match(read("_redirects"), /^\/triplemdrive\/:slug\/\s+\/triplemdrive\/index\.html\s+200$/m);
  assert.match(read("404.html"), /\/triplemdrive\/\?b=/);
  assert.match(read("404.html"), /p\.match\(\/\^\\\/\(\[a-z0-9-\]\{3,40\}\)\\\/\?\$\/\)/, "top-level business addresses");
  assert.match(read("Assets/app/drive/00-drive-access.js"), /"https:\/\/triplem\.vip"\}\/\$\{encodeURIComponent/);
  assert.ok(exists(".github/workflows/drive-catalog-photos.yml"));
});

test("brand spelling: Triplem / TRIPLEM / Triplem Drive only", () => {
  const files = ["Assets/app/drive/00-drive-access.js", "Assets/app/drive/01-drive-admin.js", "Assets/app/drive/02-drive-app.js", "Assets/app/drive/03-drive-ops.js",
    "Assets/app/drive/04-drive-setup.js", "Assets/drive/drive-app.css", "triplemdrive/index.html", "triplemdrive/site.js", "triplemdrive/site.css", "docs/TRIPLEM-DRIVE.md"];
  if (exists(MIG)) files.push(MIG);
  for (const f of files) if (exists(f)) assert.doesNotMatch(read(f), /TRIPLEm/, f);
});

test("website catalogue: the listed cars, routes and prices; photos local first, Commons as fallback", () => {
  const cat = JSON.parse(read("triplemdrive/catalog/catalog.json"));
  assert.deepEqual(cat.classes.map(c => c.name), ["Sedan", "SUV", "Mini Van"]);
  assert.deepEqual(cat.vehicles.map(v => v.name), ["GMC Yukon", "GMC Yukon XL", "Chevrolet Tahoe", "Chevrolet Suburban", "Lexus ES", "Ford Taurus", "BMW 7 Series", "Hyundai Staria", "Toyota HiAce"]);
  const price = (k, c) => cat.services.find(s => s.key === k).prices[c];
  assert.equal(cat.currency, "SAR");
  assert.equal(cat.services.length, 11);
  assert.deepEqual([price("riyadh-jeddah", "suv"), price("riyadh-jeddah", "sedan"), price("riyadh-jeddah", "minivan")], [1900, 1425, 1710]);
  assert.deepEqual([price("airport", "suv"), price("inside-city", "sedan"), price("full-day", "minivan")], [145, 70, 1100]);
  assert.equal(cat.terms.timing, "24/7");
  assert.equal(cat.terms.min_notice_minutes, 60);
  for (const v of cat.vehicles) for (const p of v.photos) { assert.match(p.file, /^[a-z0-9-]+\.jpg$/); assert.ok(p.commons, v.name); }
  const js = read("triplemdrive/site.js");
  assert.match(js, /Special:FilePath/);
  assert.match(js, /Photo credits/);
  assert.match(js, /p\.catalog = \{ vehicle: /);
  assert.ok(!exists("triplemdrive/catalog.js"), "the catalogue code is part of site.js");
  assert.ok(Array.isArray(cat.faq) && cat.faq.length >= 8, "FAQ tab content");
  assert.ok(exists("scripts/fetch_drive_catalog_photos.js"));
});

test("migration 237 re-declares only the address check and the public booking function", { skip: !exists("migrations/237_triplem_drive_catalog_bookings.sql") }, () => {
  const code = read("migrations/237_triplem_drive_catalog_bookings.sql").replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /\b(create|alter|drop)\s+table\b|\btruncate\b|\bdelete\s+from\s+public\.(?!app_drive_public_hits)/i);
  assert.equal((code.match(/create or replace function/g) || []).length, 2);
  const slug = code.slice(code.indexOf("app_drive__slug_problem("), code.indexOf("$$;", code.indexOf("app_drive__slug_problem(")));
  assert.doesNotMatch(slug, /'triplemdrive'/, "triplemdrive is allowed");
  assert.match(slug, /'windows-store'/);
  assert.match(code, /create or replace function public\.app_drive_public_book\(p_slug text, p jsonb\)/);
  assert.match(code, /left\(nullif\(btrim\(coalesce\(p->'catalog'->>'vehicle', ''\)\), ''\), 120\)/);
  assert.match(code, /interval '1 hour'/);
});

test("migration 238 only moves the test address book -> triplemdrive, guarded", { skip: !exists("migrations/238_triplem_drive_assign_triplemdrive.sql") }, () => {
  const code = read("migrations/238_triplem_drive_assign_triplemdrive.sql").replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /\b(create|alter|drop)\s+table\b|\btruncate\b|\bdelete\b/i);
  assert.match(code, /if n <> 1 then/);
  assert.match(code, /lower\(slug\) = 'triplemdrive'\) then/);
  assert.match(code, /set slug = 'triplemdrive', is_root = false/);
  assert.match(read("Assets/app/drive/01-drive-admin.js"), /drive\.slug \|\| \(enable \? "triplemdrive" : suggest\(user\)\)/);
  assert.doesNotMatch(read("Assets/app/drive/01-drive-admin.js"), /data-td-root|\/triplemdrive\/<\/em>/);
});

test("public page (update 7): no prices on the page, booking overlay, return = 2 x price, map picker, support contact", () => {
  const js = read("triplemdrive/site.js"), css = read("triplemdrive/site.css"), cat = JSON.parse(read("triplemdrive/catalog/catalog.json"));
  for (const k of ["service", "category", "car", "trip", "ret", "details", "confirm", "done"]) assert.match(js, new RegExp(`\\b${k}\\(\\) \\{`), k);
  assert.match(js, /const STEP_MS = 680;/, "slow step animation");
  assert.match(css, /--slow: \.68s;/);
  assert.match(css, /\.tdx-wz-step\.is-from-right \{ transform: translateX\(9%\); opacity: 0;/);
  // Prices: only in the confirm step (onePrice is used only there and in send).
  const uses = js.split("onePrice()").length - 1;
  assert.equal(uses, 3, "onePrice() is called in confirm and send only");
  assert.match(js, /money\(one \* 2, cur\)/, "return trip = 2 x one-way price");
  assert.doesNotMatch(js, /data-tab="prices"|\["prices", "Prices"/, "no Prices tab");
  assert.deepEqual(cat.service_types.map(t => t.key), ["city", "airport", "intercity"]);
  assert.deepEqual(cat.support, { phone: "+966596739938", whatsapp: "+966596739938", email: "customersupport@triplem.vip", note: cat.support.note });
  for (const c of cat.cities) assert.ok(c.photo && (c.photo.commons || c.photo.search), c.name);
  assert.equal(cat.cities.find(c => c.key === "makkah").photo.commons, "The Kaaba during Hajj.jpg");
  assert.equal(cat.cities.find(c => c.key === "madinah").photo.commons, "The Green Dome, Masjid Nabawi, Madina.jpg");
  for (const a of ["class-sedan.svg", "class-suv.svg", "class-minivan.svg", "showcase.jpg", "logo.svg"]) assert.ok(exists("triplemdrive/assets/" + a), a);
  assert.match(js, /class="tdx-slider" data-slider/, "car photo slider");
  assert.match(js, /data-map="\$\{key\}"/, "map button beside the typed address");
  assert.match(js, /name="\$\{key\}" maxlength="150"/, "pickup and drop-off can still be typed");
  assert.match(js, /\(t \|\| pl\.label \|\| "Pinned location"\)\.slice\(0, 200 - tail\.length\) \+ tail/);
  assert.match(js, /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/leaflet\.min\.js/);
  assert.match(js, /© OpenStreetMap contributors/);
  assert.match(js, /app_drive_public_inquiry/);
  assert.match(js, /action: "drive_notify", token/);
  assert.match(js, /notifyBusiness\(r\.push_token\)/);
  assert.match(js, /class="tdx-fab"/, "WhatsApp chat button");
  assert.match(read("_headers"), /connect-src 'self' https:\/\/\*\.supabase\.co https:\/\/nominatim\.openstreetmap\.org/);
  assert.match(read("scripts/fetch_drive_catalog_photos.js"), /gsrsearch=/, "city photos found on Commons by the GitHub action");
});

test("migration 243: cars stay available; no fixed trip length; only Available cars bookable", () => {
  const code = read("migrations/243_triplem_drive_cars_always_available.sql").replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /\b(alter|drop)\s+table\b|\btruncate\b|\bdrop\s+column\b/i);
  assert.doesNotMatch(code.replace(/delete from public\.app_drive_(public_hits|push_dispatches)\b/g, ""), /\bdelete\s+from\b/i, "only the rate-limit and push-token cleanup of the re-declared booking function");
  assert.doesNotMatch(code.slice(code.indexOf("app_drive__clash("), code.indexOf("$$;")), /app_drive_bookings/, "bookings never block a car");
  assert.match(code, /elsif t0 is not null then e := s \+ interval '1 minute';/);
  assert.match(code, /'bookable', v\.status = 'available'/);
  assert.match(code, /if v\.status <> 'available' then/);
  assert.match(read("scripts/build_full_schema_sql.js"), /243_triplem_drive_cars_always_available\.sql/);
  assert.doesNotMatch(read("Assets/app/drive/04-drive-setup.js"), /default_trip_hours/, "no Default trip length setting");
  assert.doesNotMatch(read("Assets/app/drive/03-drive-ops.js"), /lasts \$\{/, "no 4-hour text");
});

test("Triplem Drive manager: inquiries, ding and push for every booking and inquiry", () => {
  const acc = read("Assets/app/drive/00-drive-access.js");
  assert.match(acc, /drive_ding\.mp3/);
  assert.match(acc, /triplem-drive-seen-v1/);
  assert.match(acc, /TRIPLEM_PUSH_RECEIVED/);
  assert.match(acc, /drive_inquiry/);
  assert.ok(exists("Assets/sounds/drive_ding.mp3"));
  const ops = read("Assets/app/drive/03-drive-ops.js");
  assert.match(ops, /app_drive_inquiries_list/);
  assert.match(ops, /app_drive_inquiry_set/);
  const fn = read("supabase/functions/push-notifications/index.ts");
  assert.match(fn, /action === "drive_notify"/);
  assert.match(fn, /app_push_service_drive_dispatch/);
  assert.match(read("index.html"), /00-drive-access\.js\?v=20261123-td8/);
});

test("migration 239 is additive: two new tables, no change to existing data", { skip: !exists("migrations/239_triplem_drive_inquiries_push.sql") }, () => {
  const code = read("migrations/239_triplem_drive_inquiries_push.sql").replace(/--.*$/gm, "").replace("'alter table public.%I enable row level security'", "");
  assert.match(read("migrations/239_triplem_drive_inquiries_push.sql"), /foreach t in array array\['app_drive_inquiries','app_drive_push_dispatches'\]/, "row level security only on the two new tables");
  assert.doesNotMatch(code, /\b(alter|drop)\s+table\b|\btruncate\b|\bdrop\s+column\b/i);
  assert.equal((code.match(/create table if not exists/g) || []).length, 2);
  assert.doesNotMatch(code.replace(/delete from public\.app_drive_(push_dispatches|public_hits) where created_at < now\(\) - interval '2 days';/g, ""), /\bdelete\s+from\b/i, "only expired push tokens and rate-limit hits are cleaned up");
  assert.match(code, /grant execute on function public\.app_push_service_drive_dispatch\(text\) to service_role/);
  assert.match(code, /revoke all on function public\.app_push_service_drive_dispatch\(text\) from public, anon, authenticated/);
  assert.match(code, /notify pgrst, 'reload schema'/);
});

test("migration 240: listed cars into the Triplem Drive fleet, inserts only, once", () => {
  const raw = read("migrations/240_triplem_drive_listed_cars_to_fleet.sql"), code = raw.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /\b(alter|drop)\s+table\b|\btruncate\b|\bdelete\s+from\b|\bupdate\s+public\./i);
  assert.match(code, /where lower\(slug\) = 'triplemdrive'/);
  assert.match(code, /if exists \(select 1 from public\.app_drive_vehicles where pkey = car\.pkey\) then continue; end if;/);
  const cat = JSON.parse(read("triplemdrive/catalog/catalog.json"));
  for (const v of cat.vehicles) assert.ok(code.includes(`'cat-${v.key}'`), v.key);
  assert.equal(cat.vehicles_in_database, true);
  for (const v of cat.vehicles) for (const p of v.photos) assert.match(p.upload, /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\//);
  const js = read("triplemdrive/site.js");
  assert.match(js, /startsWith\("cat-"\)/);
  assert.match(js, /if \(car\?\.dbKey\) p\.vehicle = car\.dbKey;/, "a chosen model books the fleet car");
  const app = read("Assets/app/drive/02-drive-app.js");
  assert.match(app, /"cat-photos"/);
  assert.match(app, /Add the listed photos/);
  assert.match(read("scripts/build_full_schema_sql.js"), /240_triplem_drive_listed_cars_to_fleet\.sql/);
});

test("migration 242: 4 photos per vehicle, smaller photos, replace in place; only re-declares media_add", () => {
  const sql = read("migrations/242_triplem_drive_photo_limits.sql"), code = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /\b(alter|drop)\s+table\b|\btruncate\b|\bdrop\s+column\b/i);
  assert.match(code, /kind = 'vehicle'\) >= 4 then/);
  assert.match(code, /p_kind = 'vehicle' and octet_length\(b\) > 400 \* 1024/);
  assert.match(code, /create or replace function public\.app_drive_media_replace\(/);
  assert.match(code, /where id = p_id and owner_id = o and kind = 'vehicle'/);
  const app = read("Assets/app/drive/02-drive-app.js");
  assert.match(app, /const MAX_PHOTOS = 4;/);
  assert.match(app, /compressImage\(file, \{ max: 1280, thumb: 360, target: 230 \* 1024/);
  assert.match(app, /"np-add"/, "photos when adding a vehicle");
  assert.match(app, /api\("app_drive_media_replace"/);
  assert.doesNotMatch(app, /photos\?\.length \|\| 0\) \+ n >= 12/);
});

test("Drive notification centre and trip sheet for the driver", () => {
  const ops = read("Assets/app/drive/03-drive-ops.js"), app = read("Assets/app/drive/02-drive-app.js"), acc = read("Assets/app/drive/00-drive-access.js");
  assert.match(ops, /A\.openNotificationCentre = \(\) =>/);
  assert.match(ops, /function openTripSheet\(id\)/);
  assert.match(ops, /function driverText\(b\)/);
  assert.match(ops, /https:\/\/www\.google\.com\/maps\?q=\$\{p\.lat\},\$\{p\.lng\}/);
  assert.match(ops, /app_mark_my_notification_read/);
  assert.match(ops, /"ts-copy"/);
  assert.match(ops, /https:\/\/wa\.me\/\$\{num\}\?text=/);
  assert.match(app, /data-td-act="notif"/);
  assert.match(acc, /\{ booking: id, sheet: true \}/, "push opens the trip sheet");
});
