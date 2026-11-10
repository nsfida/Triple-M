"use strict";

/* Insurance > My Commission > Opening Balance: 211 limited changes to the Main Admin;
 * 214 lets each account owner (not team members) change their own. Originally: only the protected Main Admin
 * can edit or delete it (2026-11-09, migration 211). Creating, viewing and
 * receiving are unchanged. SQL checks skip where migrations are not present. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const text = rel => fs.readFileSync(path.join(root, rel), "utf8");
const MIG = "migrations/211_insurance_opening_balance_main_admin_only.sql";
const skipSql = fs.existsSync(path.join(root, MIG)) && fs.existsSync(path.join(root, "migrations/176_insurance_commission_opening_balances.sql")) ? false : "Database migrations are not present in this checkout";

test("the app shows Edit and Delete for opening balances to the account owner, not to team members (214)", () => {
  const js = text("Assets/app/insurance/01-insurance.js");
  assert.match(js, /function canChangeOpeningBalance\(\) \{[\s\S]*?if \(u\.team_owner_id\) return false;\s*return can\("edit"\);/);
  assert.doesNotMatch(js, /u\.role === "admin" && u\.is_protected === true && !\(typeof isGuestMode/);
  // 213: Edit stays available after receiving; Delete still only before receiving.
  assert.match(js, /canChangeOpeningBalance\(\) \? \{ label: "Edit"/);
  assert.match(js, /canChangeOpeningBalance\(\) && n\(balance\.amount_received\) <= 0 \? \{ label: "Delete"/);
  assert.match(js, /\$\{canChangeOpeningBalance\(\)\?`<button class="btn ghost" id="insuranceOpeningBalanceEdit">Edit<\/button>`/);
  assert.match(js, /if\(existing&&!canChangeOpeningBalance\(\)\)return notify\("Only the account owner can edit an opening balance\.","error"\);/);
  assert.match(js, /async function deleteOpeningBalance\(id\) \{\s*if\(!canChangeOpeningBalance\(\)\)return notify/);
  // Creating an opening balance is unchanged.
  assert.match(js, /\$\{can\("create"\) \? `<button class="btn ghost tiny" id="insuranceAddOpeningBalance"/);
});

test("migration 211 adds the Main Admin check and otherwise keeps the 176 functions", { skip: skipSql }, () => {
  const m176 = text("migrations/176_insurance_commission_opening_balances.sql");
  const m211 = text(MIG);
  const block = (s, name) => { const i = s.indexOf(`create or replace function public.${name}(`); return s.slice(i, s.indexOf("end; $$;", i) + 8); };
  const guard = "  -- 211: only the protected Main Admin may change an opening balance.\n  perform public.app_insurance_require_main_admin_for_opening();\n";
  for (const name of ["app_insurance_update_commission_opening_balance", "app_insurance_delete_commission_opening_balance"]) {
    const b211 = block(m211, name);
    assert.ok(b211.includes(guard), name);
    assert.equal(b211.replace(guard, ""), block(m176, name), `${name} is unchanged apart from the check`);
  }
  const body = m211.replace(/^--.*$/gm, "");
  assert.doesNotMatch(body, /\b(alter table|drop |truncate|delete from|insert into)/i);
  // The only updates are the ones already inside the 176 function bodies.
  for (const m of body.matchAll(/update public\.([a-z_]+)/g)) assert.equal(m[1], "insurance_commission_opening_balances");
  assert.match(body, /u\.role = 'admin' and u\.is_active and coalesce\(u\.is_protected, false\) is true/);
  assert.match(text("scripts/build_full_schema_sql.js"), /"211_insurance_opening_balance_main_admin_only\.sql",/);
});

const MIG213 = "migrations/213_insurance_opening_balance_edit_after_receiving.sql";
test("migration 213: opening balance can be corrected after receiving; cash is moved, never lost", { skip: fs.existsSync(path.join(root, MIG213)) ? false : "Database migrations are not present in this checkout" }, () => {
  const m = text(MIG213);
  const body = m.replace(/^--.*$/gm, "");
  assert.match(body, /perform public\.app_insurance_require_main_admin_for_opening\(\);/);
  assert.doesNotMatch(body, /Opening balance cannot be edited after receiving has started/);
  assert.match(body, /Currency cannot be changed after commission has been received/);
  assert.match(body, /Insurance Company cannot be changed after commission has been received/);
  assert.match(body, /the lowest amount you can save now is/);
  assert.doesNotMatch(body, /\b(alter table|drop |truncate|create table)/i);
  // Only the one function is replaced.
  assert.equal((body.match(/create or replace function/g) || []).length, 1);
  assert.match(body, /create or replace function public\.app_insurance_update_commission_opening_balance\(/);
  // Delete is unchanged (still refused once something was received).
  assert.doesNotMatch(body, /app_insurance_delete_commission_opening_balance/);
  assert.match(text("scripts/build_full_schema_sql.js"), /"213_insurance_opening_balance_edit_after_receiving\.sql",/);
});

test("after receiving, the edit form keeps company and currency fixed and explains what happens", () => {
  const js = text("Assets/app/insurance/01-insurance.js");
  assert.match(js, /const receivedSoFar=existing\?n\(existing\.amount_received\):0,locked=receivedSoFar>0;/);
  assert.match(js, /name="company_id" required\$\{locked\?" disabled":""\}/);
  assert.match(js, /<input type="hidden" name="currency" value="\$\{esc\(existing\.currency\)\}">/);
  assert.match(js, /canChangeOpeningBalance\(\) && n\(balance\.amount_received\) <= 0 \? \{ label: "Delete"/);
});

const MIG214 = "migrations/214_insurance_opening_balance_owner_can_edit.sql";
test("migration 214: account owners (not team members) may change their own opening balances", { skip: fs.existsSync(path.join(root, MIG214)) ? false : "Database migrations are not present in this checkout" }, () => {
  const body = text(MIG214).replace(/^--.*$/gm, "");
  assert.equal((body.match(/create or replace function/g) || []).length, 1);
  assert.match(body, /create or replace function public\.app_insurance_require_main_admin_for_opening\(\)/);
  assert.match(body, /u\.team_owner_id is null/);
  assert.match(body, /public\.app_data_owner_id\(\) = uid/);
  assert.doesNotMatch(body, /\b(alter table|drop |truncate|delete from|insert into|update public)/i);
  assert.match(text("scripts/build_full_schema_sql.js"), /"214_insurance_opening_balance_owner_can_edit\.sql",/);
});
