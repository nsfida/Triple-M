"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

const sourceTables = [
  "loans",
  "loan_payments",
  "installment_plans",
  "installment_payments",
  "goods_items",
  "goods_sales",
  "expense_accounts",
  "expense_topups",
  "expense_entries",
  "loan_ledger_entries"
];

test("forward-only migration switches unified loan ledger view to security invoker and verifies RLS prerequisites", () => {
  const sql = read("migrations/199_secure_loan_ledger_unified_view.sql");
  assert.match(sql, /alter\s+view\s+public\.v_loan_ledger_unified\s+set\s*\(\s*security_invoker\s*=\s*true\s*\)/i);
  assert.match(sql, /coalesce\(c\.reloptions,[\s\S]*security_invoker=true/i);
  assert.match(sql, /notify\s+pgrst\s*,\s*'reload schema'/i);
  assert.match(sql, /^\s*--[\s\S]*?\bbegin;/i);
  assert.match(sql.trimEnd(), /commit;$/i);

  for (const table of sourceTables) {
    assert.ok(sql.includes(`'${table}'`), `RLS preflight must include ${table}`);
  }
  assert.match(sql, /not\s+c\.relrowsecurity/i);
  assert.match(sql, /app_owns_or_admin/i);
  for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    assert.ok(sql.includes(`('${operation}')`), `preflight must verify ${operation} isolation`);
  }
  assert.match(sql, /unsafe_permissive_policies/i);
  assert.match(sql, /p\.permissive = 'PERMISSIVE'/i);
  const bundle = read("developer-artifacts/fresh-install-only/triplem_full_schema.sql");
  assert.match(bundle, /alter\s+view\s+public\.v_loan_ledger_unified\s+set\s*\(\s*security_invoker\s*=\s*true\s*\)/i);
  assert.ok(read("scripts/build_full_schema_sql.js").includes("199_secure_loan_ledger_unified_view.sql"));
});

test("existing RLS migrations define owner-aware policies for all unified ledger source tables", () => {
  const auth = read("migrations/001_multi_user_auth.sql");
  const domain = read("migrations/020_domain_tables_owner_rls.sql");
  const team = read("migrations/030_company_team_members_and_activity.sql");
  const hardening = read("migrations/039_production_security_hardening.sql");

  for (const table of sourceTables) {
    assert.ok(auth.includes(`'${table}'`) || domain.includes(`'${table}'`), `${table} must be handled by an RLS migration`);
  }
  assert.match(auth, /alter table public\.%I enable row level security/i);
  assert.match(domain, /create policy %I on public\.%I for select[^;]*app_owns_or_admin\(owner_id\)/i);
  assert.match(team, /return coalesce\(u\.team_owner_id, u\.id\)/i);
  assert.match(hardening, /p_owner_id = uid[\s\S]*p_owner_id = public\.app_data_owner_id\(\)/i);
});
