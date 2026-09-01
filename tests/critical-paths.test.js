"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const tax = require(path.join(__dirname, "..", "Assets", "app", "lib", "tax-math.js"));
const loan = require(path.join(__dirname, "..", "Assets", "app", "lib", "loan-math.js"));
const perms = require(path.join(__dirname, "..", "Assets", "app", "lib", "permissions.js"));
const backup = require(path.join(__dirname, "..", "Assets", "app", "lib", "admin-backup.js"));
const assetMath = require(path.join(__dirname, "..", "Assets", "app", "lib", "asset-math.js"));
const {
  resolveMigrationFiles,
  buildFullSchema,
  migrationPrefixKey,
  CANONICAL_MIGRATION_FILES,
  MUST_HAVE_MARKERS,
} = require(path.join(__dirname, "..", "scripts", "build_full_schema_sql.js"));

describe("tax-math", () => {
  it("adds VAT on ADD mode", () => {
    const b = tax.calculateTaxBreakdown(100, 5, "ADD", true);
    assert.equal(b.net, 100);
    assert.equal(b.tax, 5);
    assert.equal(b.total, 105);
    assert.equal(b.applied, true);
  });

  it("extracts included VAT", () => {
    const b = tax.calculateTaxBreakdown(105, 5, "INCLUDE", true);
    assert.equal(b.total, 105);
    assert.ok(Math.abs(b.tax - 5) < 1e-6);
    assert.ok(Math.abs(b.net - 100) < 1e-6);
  });

  it("returns off breakdown when rate is 0", () => {
    const b = tax.calculateTaxBreakdown(50, 0, "ADD", true);
    assert.equal(b.applied, false);
    assert.equal(b.tax, 0);
    assert.equal(b.total, 50);
  });

  it("finiteMoney never returns NaN", () => {
    assert.equal(tax.finiteMoney(Number.NaN, 7), 7);
    assert.equal(tax.finiteMoney("12.5"), 12.5);
  });

  it("respects explicit taxApplied false in meta", () => {
    const b = tax.taxBreakdownFromMeta({ taxApplied: false, taxRate: 5, taxAmount: 5 }, 105);
    assert.equal(b.applied, false);
    assert.equal(b.tax, 0);
  });

  it("round-trips tax meta", () => {
    const breakdown = tax.calculateTaxBreakdown(200, 10, "ADD", true);
    const meta = tax.taxMetaFromBreakdown(breakdown);
    const back = tax.taxBreakdownFromMeta(meta, meta.grossAmount);
    assert.equal(back.tax, breakdown.tax);
    assert.equal(back.net, breakdown.net);
    assert.equal(back.total, breakdown.total);
  });
});

describe("loan-math", () => {
  it("tracks remaining and Partial status", () => {
    const result = loan.calculateLoan({
      principal: { principal_amount: 1000, loan_date: "2024-01-01", id: "p1", notes: "start" },
      actions: [
        { action_amount: 250, action_date: "2024-02-01", entry_kind: "partial", id: "a1", notes: "p1" },
        { action_amount: 250, action_date: "2024-01-15", entry_kind: "partial", id: "a2", notes: "p2" },
      ],
    });
    assert.equal(result.principal, 1000);
    assert.equal(result.paid, 500);
    assert.equal(result.remaining, 500);
    assert.equal(result.status, "Partial");
    // Actions sorted by date: Jan 15 then Feb 01
    assert.equal(result.rows[1].entryId, "a2");
    assert.equal(result.rows[2].entryId, "a1");
  });

  it("marks Closed when fully repaid", () => {
    const result = loan.calculateLoan({
      principal: { principal_amount: 100, loan_date: "2024-01-01" },
      actions: [{ action_amount: 100, action_date: "2024-02-01", entry_kind: "full" }],
    });
    assert.equal(result.status, "Closed");
    assert.equal(result.remaining, 0);
  });

  it("marks Open with no payments", () => {
    const result = loan.calculateLoan({
      principal: { principal_amount: 80, loan_date: "2024-01-01" },
      actions: [],
    });
    assert.equal(result.status, "Open");
    assert.equal(result.paid, 0);
  });
});

describe("permissions", () => {
  it("normalizes tab aliases and implied modules", () => {
    const set = perms.normalizeAssignedModules(["goods", "expense", "reports"]);
    assert.ok(set.has("inventory"));
    assert.ok(set.has("customers"));
    assert.ok(set.has("expenses"));
    assert.ok(set.has("wallets"));
    assert.ok(set.has("reports"));
    assert.ok(set.has("pdf_export"));
  });

  it("guest cannot access admin_panel, pdf_export, or assets", () => {
    assert.equal(
      perms.evaluateUserPermission({ moduleName: "loans", action: "view", isGuest: true }),
      true
    );
    assert.equal(
      perms.evaluateUserPermission({ moduleName: "admin_panel", action: "view", isGuest: true }),
      false
    );
    assert.equal(
      perms.evaluateUserPermission({ moduleName: "pdf_export", action: "export", isGuest: true }),
      false
    );
    assert.equal(
      perms.evaluateUserPermission({ moduleName: "assets", action: "view", isGuest: true }),
      false
    );
  });

  it("protected admin bypasses tab gates", () => {
    assert.equal(
      perms.evaluateUserPermission({
        moduleName: "bitcoin",
        action: "view",
        sessionUser: { role: "admin", is_protected: true },
        assignedModules: new Set(["loans"]),
        permissions: [],
      }),
      true
    );
  });

  it("trial users cannot get admin_panel", () => {
    assert.equal(
      perms.evaluateUserPermission({
        moduleName: "admin_panel",
        action: "view",
        sessionUser: { role: "user" },
        isTrial: true,
        assignedModules: new Set(["admin_panel"]),
        permissions: [{ module: "admin_panel", action: "view", allowed: true }],
      }),
      false
    );
  });

  it("uses assigned tabs for view gates", () => {
    const assigned = perms.normalizeAssignedModules(["loans", "notes"]);
    assert.equal(
      perms.evaluateUserPermission({
        moduleName: "loans",
        action: "view",
        sessionUser: { role: "user" },
        assignedModules: assigned,
        permissions: [],
      }),
      true
    );
    assert.equal(
      perms.evaluateUserPermission({
        moduleName: "bitcoin",
        action: "view",
        sessionUser: { role: "user" },
        assignedModules: assigned,
        permissions: [],
      }),
      false
    );
    assert.equal(
      perms.evaluateUserPermission({
        moduleName: "assets",
        action: "view",
        sessionUser: { role: "user" },
        assignedModules: assigned,
        permissions: [],
      }),
      false
    );
    assert.equal(
      perms.evaluateUserPermission({
        moduleName: "assets",
        action: "view",
        sessionUser: { role: "user" },
        assignedModules: perms.normalizeAssignedModules(["assets"]),
        permissions: [],
      }),
      true
    );
  });

  it("teamCapability restricts members only", () => {
    assert.equal(perms.teamCapability("can_edit_entries", { id: "solo" }), true);
    assert.equal(
      perms.teamCapability("can_edit_entries", {
        team_owner_id: "owner-1",
        team_permissions: { can_edit_entries: false },
      }),
      false
    );
    assert.equal(
      perms.teamCapability("can_edit_entries", {
        team_owner_id: "owner-1",
        team_permissions: { can_edit_entries: true },
      }),
      true
    );
  });
});

describe("asset-math", () => {
  it("computes expenses, income, and net without double-counting purchase", () => {
    const asset = {
      purchase_price: 100000,
      purchase_date: "2024-01-01",
      status: "sold",
      sale_price: 120000,
      sale_costs: 2000,
      sale_date: "2025-01-01",
    };
    const txs = [
      { tx_type: "maintenance", amount: 500, tx_date: "2024-06-01" },
      { tx_type: "repair", amount: 1500, tx_date: "2024-08-01" },
      { tx_type: "revenue", amount: 12000, tx_date: "2024-12-01" },
    ];
    const sum = assetMath.summarizeAsset(asset, txs);
    assert.equal(sum.purchasePrice, 100000);
    assert.equal(sum.maintenance, 500);
    assert.equal(sum.repair, 1500);
    assert.equal(sum.revenue, 12000);
    assert.equal(sum.salePrice, 120000);
    assert.equal(sum.saleCosts, 2000);
    assert.equal(sum.totalExpenses, 104000);
    assert.equal(sum.investedSpent, 4000);
    assert.equal(sum.totalIncome, 132000);
    assert.equal(sum.net, 28000);
    assert.equal(sum.ownership.days, 366);
  });

  it("shows zero revenue and ongoing ownership for active assets", () => {
    const asset = {
      purchase_price: 50,
      purchase_date: "2026-01-01",
      status: "active",
    };
    const sum = assetMath.summarizeAsset(asset, [], { now: new Date(2026, 6, 1) });
    assert.equal(sum.revenue, 0);
    assert.equal(sum.totalIncome, 0);
    assert.equal(sum.net, -50);
    assert.ok(sum.ownership.ongoing);
    assert.ok(sum.ownership.days > 0);
  });
});

describe("admin-backup canonicalize + CSV round-trip", () => {
  function samplePayload() {
    return {
      format: backup.ADMIN_BACKUP_FORMAT,
      version: 1,
      exportedAt: "2026-07-24T10:00:00.000Z",
      tableOrder: ["app_users", "loans", "app_notes"],
      tables: {
        app_users: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            username: "demo",
            is_active: true,
            settings: { Company: "Acme" },
          },
        ],
        loans: [
          {
            id: "22222222-2222-2222-2222-222222222222",
            principal_amount: 1500.5,
            loan_date: "2024-03-15",
            notes: "hello, \"world\"",
          },
        ],
        app_notes: [],
      },
    };
  }

  it("canonicalizes counts and order", () => {
    const out = backup.canonicalizeAdminBackupPayload(samplePayload());
    assert.equal(out.format, backup.ADMIN_BACKUP_FORMAT);
    assert.equal(out.counts.app_users, 1);
    assert.equal(out.counts.loans, 1);
    assert.equal(out.counts.app_notes, 0);
    assert.deepEqual(out.tableOrder, ["app_users", "loans", "app_notes"]);
  });

  it("rejects invalid format / missing app_users", () => {
    assert.throws(() => backup.canonicalizeAdminBackupPayload({ format: "nope", version: 1, tables: { app_users: [] } }), /Unsupported backup format/);
    assert.throws(
      () =>
        backup.canonicalizeAdminBackupPayload({
          format: backup.ADMIN_BACKUP_FORMAT,
          version: 1,
          tables: { loans: [] },
        }),
      /app_users/
    );
  });

  it("CSV encode/decode round-trips cell types", () => {
    assert.equal(backup.adminBackupCsvDecodeCell(backup.adminBackupCsvEncodeCell(true)), true);
    assert.equal(backup.adminBackupCsvDecodeCell(backup.adminBackupCsvEncodeCell(false)), false);
    assert.equal(backup.adminBackupCsvDecodeCell(backup.adminBackupCsvEncodeCell(42)), 42);
    assert.equal(backup.adminBackupCsvDecodeCell(backup.adminBackupCsvEncodeCell(null)), null);

    // Quoted/escaped cells need one CSV unwrap pass (same as row import).
    function unwrapCsvCell(encoded) {
      const s = String(encoded ?? "");
      if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/""/g, '"');
      return s;
    }
    assert.deepEqual(
      backup.adminBackupCsvDecodeCell(unwrapCsvCell(backup.adminBackupCsvEncodeCell({ a: 1 }))),
      { a: 1 }
    );
    assert.equal(
      backup.adminBackupCsvDecodeCell(unwrapCsvCell(backup.adminBackupCsvEncodeCell("2024-03-15"))),
      "2024-03-15"
    );
  });

  it("tables → CSV → parse restores envelope and rows", () => {
    const original = backup.canonicalizeAdminBackupPayload(samplePayload());
    const csv = backup.adminBackupTablesToCsv(original);
    assert.match(csv, new RegExp(`# format=${backup.ADMIN_BACKUP_FORMAT}`));
    assert.match(csv, /###TABLE:app_users/);
    assert.match(csv, /###TABLE:app_notes/);
    assert.match(csv, /# empty/);

    const restored = backup.parseAdminBackupCsv(csv);
    assert.equal(restored.format, original.format);
    assert.equal(restored.version, original.version);
    assert.equal(restored.source, "csv");
    assert.deepEqual(restored.tableOrder, original.tableOrder);
    assert.equal(restored.tables.app_users.length, 1);
    assert.equal(restored.tables.app_users[0].username, "demo");
    assert.equal(restored.tables.app_users[0].is_active, true);
    assert.deepEqual(restored.tables.app_users[0].settings, { Company: "Acme" });
    assert.equal(restored.tables.loans[0].principal_amount, 1500.5);
    assert.equal(restored.tables.loans[0].loan_date, "2024-03-15");
    assert.equal(restored.tables.loans[0].notes, 'hello, "world"');
    assert.deepEqual(restored.tables.app_notes, []);
    assert.equal(restored.counts.app_notes, 0);
  });

  it("JSON canonicalize is idempotent", () => {
    const once = backup.canonicalizeAdminBackupPayload(samplePayload());
    const twice = backup.canonicalizeAdminBackupPayload(once);
    assert.deepEqual(twice.tables, once.tables);
    assert.deepEqual(twice.counts, once.counts);
    assert.deepEqual(twice.tableOrder, once.tableOrder);
  });
});

describe("migrations + schema build smoke", () => {
  it("lists unique numbered prefixes and includes 001a before 002", () => {
    const { files, extras, prefixKeys } = resolveMigrationFiles();
    assert.equal(extras.length, 0, "all on-disk migrations should be in CANONICAL_MIGRATION_FILES");
    assert.ok(files[0] === "schema.sql");
    const i001 = files.indexOf("001_multi_user_auth.sql");
    const i001a = files.indexOf("001a_fix_pgcrypto_extensions.sql");
    const i002 = files.indexOf("002_admin_user_management.sql");
    const i038 = files.indexOf("038_expense_account_custom_logo.sql");
    assert.ok(i001 > 0 && i001a === i001 + 1 && i002 === i001a + 1);
    assert.ok(i038 > 0);
    assert.equal(new Set(prefixKeys).size, prefixKeys.length);
    assert.equal(migrationPrefixKey("001a_fix_pgcrypto_extensions.sql"), "001a");
    assert.equal(migrationPrefixKey("038_expense_account_custom_logo.sql"), "038");
  });

  it("canonical list matches on-disk numbered SQL files", () => {
    const numbered = CANONICAL_MIGRATION_FILES.filter((f) => f !== "schema.sql");
    const { files } = resolveMigrationFiles();
    assert.deepEqual(
      files.filter((f) => f !== "schema.sql"),
      numbered
    );
  });

  it("buildFullSchema runs without live DB and includes markers", () => {
    const result = buildFullSchema({ write: false });
    assert.equal(result.missingMarkers.length, 0, result.missingMarkers.join(", "));
    for (const marker of MUST_HAVE_MARKERS) {
      assert.ok(result.sql.includes(marker), "missing marker: " + marker);
    }
    assert.match(result.sql, /BEGIN migrations\/038_expense_account_custom_logo\.sql/);
    assert.match(result.sql, /BEGIN migrations\/070_inventory_category_taxonomy_meta\.sql/);
    assert.match(result.sql, /BEGIN migrations\/071_admin_backup_table_coverage\.sql/);
    assert.match(result.sql, /BEGIN migrations\/072_fix_backup_restore_password_and_reminder_fk\.sql/);
    assert.match(result.sql, /BEGIN migrations\/093_security_hardening_session_login_rpc\.sql/);
    assert.match(result.sql, /BEGIN migrations\/094_expense_item_history_accuracy\.sql/);
    assert.match(result.sql, /BEGIN migrations\/095_expense_global_smart_search\.sql/);
    assert.match(result.sql, /app_login_throttle/);
    assert.match(result.sql, /app_admin_export_full_backup/);
    assert.match(result.sql, /app_admin_import_full_backup/);
    assert.match(result.sql, /app_admin_backup_sanitize_fk_rows/);
    assert.match(result.sql, /goods_category_config/);
    assert.match(result.sql, /goods_sub_brands/);
    assert.ok(result.sql.length > 50_000);
  });

  it("093 security hardening is additive and closes direct session minting", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "093_security_hardening_session_login_rpc.sql"),
      "utf8"
    );
    const executable = migration.replace(/--.*$/gm, "");
    assert.match(migration, /revoke all on function public\.app_create_session\(uuid, text, text, boolean\)[\s\S]*from public, anon, authenticated/i);
    assert.match(migration, /grant execute on function public\.app_create_session\(uuid, text, text, boolean\)[\s\S]*to service_role/i);
    assert.match(migration, /app\.session_create_authorized/);
    assert.match(migration, /create table if not exists public\.app_login_throttle/i);
    assert.ok(migration.includes("safe_fragment text := $frag$'smart_pin_hash', ''$frag$;"));
    assert.doesNotMatch(executable, /\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

    const loginClient = fs.readFileSync(
      path.join(__dirname, "..", "Assets", "app", "auth", "02-auth-welcome-trial.js"),
      "utf8"
    );
    assert.match(loginClient, /result\?\.ok === false/);
    assert.match(loginClient, /Invalid username or password/);
  });

  it("094 expense item history is read-only and keeps grouped totals independent of lazy pages", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "094_expense_item_history_accuracy.sql"),
      "utf8"
    );
    const executable = migration.replace(/--.*$/gm, "");
    assert.match(migration, /app_list_my_expense_item_summaries/i);
    assert.match(migration, /app_list_my_expense_item_history_page/i);
    assert.match(migration, /app_has_permission\('expenses',\s*'view'\)/i);
    assert.doesNotMatch(executable, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

    const expensesClient = fs.readFileSync(
      path.join(__dirname, "..", "Assets", "app", "expenses", "01-expenses-wallets.js"),
      "utf8"
    );
    assert.match(expensesClient, /mergeExactExpenseItemSummaries/);
    assert.match(expensesClient, /transactionCount\s*\?\?/);
    assert.match(expensesClient, /ensureExpenseItemHistoryLoaded/);
  });

  it("095 expense search is global, read-only, and matches smart fields", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "095_expense_global_smart_search.sql"),
      "utf8"
    );
    const executable = migration.replace(/--.*$/gm, "");
    assert.match(migration, /app_expense_search_matches/i);
    assert.match(migration, /app_list_my_expense_activity_page/i);
    assert.match(migration, /e\.amount::text/i);
    assert.match(migration, /e\.currency/i);
    assert.match(migration, /e\.expense_date::text/i);
    assert.match(migration, /app_has_permission\('expenses',\s*'view'\)/i);
    assert.doesNotMatch(executable, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

    const expensesClient = fs.readFileSync(
      path.join(__dirname, "..", "Assets", "app", "expenses", "01-expenses-wallets.js"),
      "utf8"
    );
    assert.match(expensesClient, /label:\s*"All history",\s*mode:\s*"search"/);
    assert.match(expensesClient, /fetchExpenseGlobalSearchActivityRpc/);
    assert.match(expensesClient, /if \(String\(state\.search\.expenses \|\| ""\)\.trim\(\)\) return true/);
  });

  it("schema reset drops inventory catalog and reminder tables", () => {
    const result = buildFullSchema({ write: false });
    for (const table of [
      "goods_brands",
      "goods_brand_variants",
      "goods_product_lines",
      "goods_sub_brands",
      "goods_category_config",
      "app_note_reminders",
      "app_user_notifications",
      "app_installment_due_notices",
    ]) {
      assert.match(
        result.sql,
        new RegExp(`drop table if exists public\\.${table}\\b`, "i"),
        `reset missing drop for ${table}`
      );
    }
  });

  it("client backup expected tables include inventory catalog coverage", () => {
    assert.ok(backup.ADMIN_BACKUP_EXPECTED_TABLES.includes("goods_brands"));
    assert.ok(backup.ADMIN_BACKUP_EXPECTED_TABLES.includes("goods_category_config"));
    assert.ok(backup.ADMIN_BACKUP_EXPECTED_TABLES.includes("goods_sub_brands"));
    assert.ok(backup.ADMIN_BACKUP_EXPECTED_TABLES.includes("app_note_reminders"));
    assert.ok(backup.ADMIN_BACKUP_EXPECTED_TABLES.includes("app_installment_due_notices"));
    const notesIdx = backup.ADMIN_BACKUP_EXPECTED_TABLES.indexOf("app_notes");
    const notifIdx = backup.ADMIN_BACKUP_EXPECTED_TABLES.indexOf("app_user_notifications");
    const remindIdx = backup.ADMIN_BACKUP_EXPECTED_TABLES.indexOf("app_note_reminders");
    assert.ok(notesIdx >= 0 && notifIdx > notesIdx && remindIdx > notifIdx);
  });
});

describe("performance client integration", () => {
  const root = path.join(__dirname, "..");
  const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

  it("ships the complete theme system in the delivered application bundle", () => {
    const index = read("index.html");
    const theme = read("Assets", "app", "core", "07-theme.js");
    const themeStyles = read("Assets", "style", "20-themes-performance.css");
    const bundle = read("Assets", "style", "app.bundle.css");
    assert.match(index, /app\.bundle\.css\?v=20260828-theme-immediate/);
    assert.match(index, /triplem-theme-v1/);
    assert.match(index, /earlyThemeTokens/);
    for (const themeId of ["default", "neon", "navy", "red", "pink", "green"]) {
      assert.match(theme, new RegExp(`id: "${themeId}"`));
    }
    assert.match(themeStyles, /data-triplem-theme="neon"/);
    assert.match(themeStyles, /html\[data-triplem-theme="pink"\]/);
    assert.match(themeStyles, /--surface-glass:/);
    assert.match(themeStyles, /without extra\s+decorative artwork or saturated card fills/);
    assert.doesNotMatch(themeStyles, /data:image\/svg\+xml;base64/);
    assert.match(theme, /TRIPLEM_THEME_TOKENS/);
    assert.match(theme, /themeUsesDarkColorScheme/);
    assert.match(bundle, /===== 20-themes-performance\.css =====/);
    assert.match(bundle, /data-triplem-theme="neon"/);
  });

  it("uses compact dashboard data and a persistent idempotent offline queue", () => {
    const dashboard = read("Assets", "app", "core", "09-dashboard-summary.js");
    const navigation = read("Assets", "app", "ui", "01-render-navigation.js");
    const offline = read("Assets", "app", "core", "08-offline-sync.js");
    assert.match(dashboard, /app_get_my_dashboard_summary/);
    assert.match(navigation, /async function warmDashboardData/);
    assert.match(navigation, /warmDashboardLegacyData\(\)/);
    assert.match(offline, /triplem-offline-entry-queue-v1/);
    assert.match(offline, /crypto\.randomUUID/);
    assert.match(offline, /window\.addEventListener\("online"/);
  });
});
