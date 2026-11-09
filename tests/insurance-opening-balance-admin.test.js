"use strict";

/* Insurance > My Commission > Opening Balance: only the protected Main Admin
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

test("the app shows Edit and Delete for opening balances only to the Main Admin", () => {
  const js = text("Assets/app/insurance/01-insurance.js");
  assert.match(js, /function canChangeOpeningBalance\(\) \{[\s\S]*?u\.role === "admin" && u\.is_protected === true/);
  assert.match(js, /canChangeOpeningBalance\(\) && n\(balance\.amount_received\) <= 0 \? \{ label: "Edit"/);
  assert.match(js, /canChangeOpeningBalance\(\) && n\(balance\.amount_received\) <= 0 \? \{ label: "Delete"/);
  assert.match(js, /\$\{canChangeOpeningBalance\(\)&&n\(row\.amount_received\)<=0\?`<button class="btn ghost" id="insuranceOpeningBalanceEdit">Edit<\/button>`/);
  assert.match(js, /if\(existing&&!canChangeOpeningBalance\(\)\)return notify\("Only the Main Admin can edit an opening balance\.","error"\);/);
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
