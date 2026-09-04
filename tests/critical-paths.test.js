"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const vm = require("vm");

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
    assert.match(result.sql, /BEGIN migrations\/098_subscription_receipt_archive_and_details\.sql/);
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

  it("096 signup + Pro payment workflow keeps receipts private and admin-gated", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "096_free_signup_pro_payment_approvals.sql"),
      "utf8"
    );
    assert.match(migration, /app_signup_v2/i);
    assert.match(migration, /app_subscription_requests/i);
    assert.match(migration, /app_subscription_requests_deny_all/i);
    assert.match(migration, /app_admin_get_subscription_receipt/i);
    assert.match(migration, /perform public\.app_require_admin\(\)/i);
    assert.match(migration, /admin_visible_password,display_name/i);
    assert.match(migration, /extensions\.crypt\(p_password/i);
    assert.match(migration, /,null,trim\(p_display_name\)/i);
    assert.match(migration, /octet_length\(receipt\)>5242880/i);
    assert.match(migration, /Pro payment awaiting approval/i);
    assert.match(migration, /interval '2 months'/i);
    assert.match(migration, /interval '14 months'/i);
  });

  it("097 subscription lifecycle is install-safe and supports plan portal + receipt deletion", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "097_subscription_lifecycle_and_plan_portal.sql"),
      "utf8"
    );
    const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
    assert.match(migration, /app_request_pro_subscription/i);
    assert.match(migration, /app_admin_delete_subscription_receipt/i);
    assert.match(migration, /app_subscription_notify_user/i);
    assert.match(migration, /payment_approval_pending/i);
    assert.match(migration, /promotion_available/i);
    assert.match(migration, /request_context/i);
    assert.match(migration, /receipt_bytes\s*=\s*null/i);
    assert.doesNotMatch(topLevel, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

    const adminClient = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "admin", "01-admin.js"), "utf8");
    const authClient = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "auth", "02-auth-welcome-trial.js"), "utf8");
    const coreClient = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "core", "03-els.js"), "utf8");
    assert.match(adminClient, /openPlanSubscriptionModal/);
    assert.match(adminClient, /app_request_pro_subscription/);
    assert.match(adminClient, /app_admin_delete_subscription_receipt/);
    assert.match(authClient, /Workspace startup/);
    assert.match(coreClient, /Pro payment pending approval/);
  });

  it("097 login access flags do not reference pending signup state before initialization", () => {
    const corePath = path.join(__dirname, "..", "Assets", "app", "core", "03-els.js");
    const coreClient = fs.readFileSync(corePath, "utf8");
    const start = coreClient.indexOf("function getUserAccessFlags");
    const end = coreClient.indexOf("\nfunction accessPeriodDaysFromUi", start);
    assert.ok(start >= 0 && end > start, "getUserAccessFlags function must exist");

    const context = { state: { sessionUser: null }, console };
    vm.createContext(context);
    vm.runInContext(`${coreClient.slice(start, end)}\nthis.getUserAccessFlags = getUserAccessFlags;`, context);
    const flags = context.getUserAccessFlags({
      access_plan: "full",
      period_expired: false,
      grace_active: false,
      has_access_period: false,
      lock_active: false,
      period_active: false,
      unlimited_access: true,
      data_access_allowed: true,
      trial_expires_at: null,
    });
    assert.equal(flags.access_plan, "full");
    assert.equal(flags.data_access_allowed, true);
  });

  it("098 subscription archive is install-safe and keeps receipt bytes protected", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "098_subscription_receipt_archive_and_details.sql"),
      "utf8"
    );
    const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
    assert.match(migration, /app_admin_list_subscription_receipts/i);
    assert.match(migration, /app_admin_delete_subscription_receipts/i);
    assert.match(migration, /app_my_subscription_request_details/i);
    assert.match(migration, /perform public\.app_require_admin\(\)/i);
    assert.match(migration, /where id=p_request_id and user_id=uid/i);
    assert.doesNotMatch(topLevel, /insert\s+into|update\s+public\.|delete\s+from|truncate|drop\s+table|drop\s+column/i);

    const adminClient = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "admin", "01-admin.js"), "utf8");
    const messagingClient = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "messaging", "01-messaging.js"), "utf8");
    const navigation = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "ui", "01-render-navigation.js"), "utf8");
    assert.match(adminClient, /adminReceiptArchiveState/);
    assert.match(adminClient, /app_admin_delete_subscription_receipts/);
    assert.match(messagingClient, /openSubscriptionNotificationDetails/);
    assert.match(messagingClient, /app_my_subscription_request_details/);
    assert.match(navigation, /No data to summarize yet/);
    assert.match(navigation, /No chart data to load yet/);
  });

  it("099 live chat is capability-scoped, install-safe, and allows short messages", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "099_live_chat_support_and_message_flexibility.sql"),
      "utf8"
    );
    const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
    assert.match(migration, /app_live_chat_guest_access/i);
    assert.match(migration, /token_hash\s+text\s+not null\s+unique/i);
    assert.match(migration, /expires_at\s+timestamptz\s+not null/i);
    assert.match(migration, /app_public_live_chat_start/i);
    assert.match(migration, /app_public_live_chat_thread/i);
    assert.match(migration, /app_public_live_chat_reply/i);
    assert.match(migration, /interval '2 hours'/i);
    assert.match(migration, /Asia\/Dubai/i);
    assert.match(migration, /char_length\(msg\)\s*<\s*1/i);
    assert.doesNotMatch(topLevel, /\binsert\s+into\s+public\.app_(?:users|wallets|expenses|inquiries|inquiry_messages)\b|\bupdate\s+public\.app_(?:users|wallets|expenses|inquiries|inquiry_messages)\b|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

    const landingChat = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "landing", "02-live-chat.js"), "utf8");
    const messaging = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "messaging", "01-messaging.js"), "utf8");
    const admin = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "admin", "01-admin.js"), "utf8");
    const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    assert.match(landingChat, /triplem_landing_live_chat_v1/);
    assert.match(landingChat, /app_public_live_chat_start/);
    assert.match(landingChat, /app_public_live_chat_thread/);
    assert.match(landingChat, /app_public_live_chat_reply/);
    assert.match(messaging, /isLandingLiveChatThread/);
    assert.match(admin, /adminReceiptViewerModal/);
    assert.doesNotMatch(admin, /window\.open\(blobUrl/);
    assert.match(index, /landingLiveChatLauncher/);
    assert.match(index, /Pro Month \+ 30 Days Free/);
    assert.match(index, /Pro Year \+ 60 Days Free/);
  });

  it("100 live chat routing is install-safe and supports agent handoff + idle follow-up", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "100_live_chat_routing_agents_and_idle_followup.sql"),
      "utf8"
    );
    const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
    assert.match(migration, /app_live_chat_agents/i);
    assert.match(migration, /app_live_chat_routes/i);
    assert.match(migration, /app_live_chat_accept_assignment/i);
    assert.match(migration, /app_admin_set_live_chat_agents/i);
    assert.match(migration, /interval '5 minutes'/i);
    assert.match(migration, /interval '7 minutes'/i);
    assert.match(migration, /interval '9 minutes'/i);
    assert.match(migration, /sender_id is not null/i);
    assert.doesNotMatch(topLevel, /\binsert\s+into\s+public\.app_(?:users|wallets|expenses|inquiries|inquiry_messages|subscription_requests)\b|\bupdate\s+public\.app_(?:users|wallets|expenses|inquiries|inquiry_messages|subscription_requests)\b|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

    const messaging = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "messaging", "01-messaging.js"), "utf8");
    const landing = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "landing", "02-live-chat.js"), "utf8");
    const admin = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "admin", "01-admin.js"), "utf8");
    assert.match(messaging, /isAssignedSupportThread/);
    assert.match(messaging, /app_live_chat_accept_assignment/);
    assert.match(messaging, /isUserVisibleMessageThread/);
    assert.match(landing, /Assets\/logo\/logo\.png/);
    assert.match(admin, /app_admin_live_chat_agent_settings/);
    assert.match(admin, /app_admin_set_live_chat_agents/);
  });

  it("101 live chat workbench is install-safe and adds decline, introduction, records, and quick replies", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "101_live_chat_agent_workbench_and_records.sql"),
      "utf8"
    );
    const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
    assert.match(migration, /app_live_chat_decline_assignment/i);
    assert.match(migration, /app_live_chat_accept_assignment/i);
    assert.match(migration, /This is %s from Triplem VIP Support/i);
    assert.match(migration, /app_admin_live_chat_records/i);
    assert.match(migration, /app_admin_live_chat_transcript/i);
    assert.match(migration, /app_admin_delete_live_chat_record/i);
    assert.doesNotMatch(topLevel, /\binsert\s+into\s+public\.app_(?:users|wallets|expenses|inquiries|inquiry_messages|subscription_requests)\b|\bupdate\s+public\.app_(?:users|wallets|expenses|inquiries|inquiry_messages|subscription_requests)\b|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

    const messaging = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "messaging", "01-messaging.js"), "utf8");
    const admin = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "admin", "01-admin.js"), "utf8");
    const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    assert.match(messaging, /LIVE_CHAT_QUICK_REPLIES/);
    assert.match(messaging, /app_live_chat_decline_assignment/);
    assert.match(messaging, /live-support-active-switcher/);
    assert.match(admin, /app_admin_live_chat_records/);
    assert.match(admin, /app_admin_live_chat_transcript/);
    assert.match(admin, /app_admin_delete_live_chat_record/);
    assert.match(index, /adminLiveChatRecordsBtn/);
  });

  it("102 live chat transfer is install-safe and stabilizes read refreshes", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "102_live_chat_transfer_and_stable_read.sql"),
      "utf8"
    );
    const topLevel = migration
      .replace(/\$fn\$[\s\S]*?\$fn\$/g, "")
      .replace(/\$policy\$[\s\S]*?\$policy\$/g, "")
      .replace(/--.*$/gm, "");
    assert.match(migration, /app_live_chat_transfers/i);
    assert.match(migration, /app_live_chat_request_transfer/i);
    assert.match(migration, /app_live_chat_accept_transfer/i);
    assert.match(migration, /app_live_chat_decline_transfer/i);
    assert.match(migration, /reading an already-read thread no longer writes updated_at/i);
    assert.doesNotMatch(topLevel, /\binsert\s+into\s+public\.app_(?:users|wallets|expenses|inquiries|inquiry_messages|subscription_requests)\b|\bupdate\s+public\.app_(?:users|wallets|expenses|inquiries|inquiry_messages|subscription_requests)\b|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

    const messaging = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "messaging", "01-messaging.js"), "utf8");
    const styles = fs.readFileSync(path.join(__dirname, "..", "Assets", "style", "app.bundle.css"), "utf8");
    assert.match(messaging, /syncLiveChatOfferDock/);
    assert.match(messaging, /app_live_chat_transfer_candidates/);
    assert.match(messaging, /messagePreviewSignature/);
    assert.match(styles, /live-support-offer-dock/);
    assert.match(styles, /\.lock::-webkit-scrollbar/);
  });

  it("103 admin live chat queue and credential vault are forward-only and protected", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "103_live_chat_admin_queue_ui_and_encrypted_credentials.sql"),
      "utf8"
    );
    const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/\$\$[\s\S]*?\$\$/g, "").replace(/--.*$/gm, "");
    assert.match(migration, /app_admin_credential_vault/i);
    assert.match(migration, /app_require_protected_admin\(\)/i);
    assert.match(migration, /app_live_chat_notify_available_agents/i);
    assert.match(migration, /u\.role='admin'/i);
    assert.match(migration, /app_live_chat_transfer_candidates/i);
    assert.doesNotMatch(topLevel, /\binsert\s+into\s+public\.app_users\b|\bupdate\s+public\.app_users\b|\bdelete\s+from\s+public\.app_users\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

    const messaging = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "messaging", "01-messaging.js"), "utf8");
    const admin = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "admin", "01-admin.js"), "utf8");
    const notes = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "notes", "01-notes.js"), "utf8");
    const landing = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "landing", "02-live-chat.js"), "utf8");
    const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    assert.doesNotMatch(messaging, /!messagingLiveEligible\(\) \|\| isAppAdminSession\(\)/);
    assert.match(messaging, /Company team pricing/);
    assert.match(admin, /admin-users-grid/);
    assert.match(admin, /openAdminUserDetailsOverlay/);
    assert.doesNotMatch(notes, /app_admin_get_user_credentials/);
    assert.match(notes, /Passwords, Smart PINs and authenticator secrets are never available to administrators/);
    assert.match(landing, /restartButton/);
    assert.match(index, /landingLiveChatRestartButton/);
  });

  it("104 transfer offers, compact quick replies, user search, and bulk chat records are forward-only", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "104_live_chat_transfer_notifications_bulk_records.sql"),
      "utf8"
    );
    const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
    assert.match(migration, /app_live_chat_my_actionable_offers/i);
    assert.match(migration, /app_live_chat_request_transfer/i);
    assert.match(migration, /app_live_chat_decline_transfer/i);
    assert.match(migration, /app_admin_delete_live_chat_records/i);
    assert.doesNotMatch(migration, /handoff is not available at the moment/i);
    assert.doesNotMatch(topLevel, /\binsert\s+into\b|\bupdate\s+public\.app_|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

    const messaging = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "messaging", "01-messaging.js"), "utf8");
    const admin = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "admin", "01-admin.js"), "utf8");
    const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const styles = fs.readFileSync(path.join(__dirname, "..", "Assets", "style", "app.bundle.css"), "utf8");
    assert.match(messaging, /app_live_chat_my_actionable_offers/);
    assert.match(messaging, /data-live-quick-toggle/);
    assert.match(messaging, /live-chat-quick-menu/);
    assert.match(admin, /adminUsersSearch/);
    assert.match(admin, /app_admin_delete_live_chat_records/);
    assert.match(index, /Search username or full name/);
    assert.match(styles, /admin-live-record-bulkbar/);
  });

  it("105 reconciles Live Chat lifecycle without installation-time data mutation", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "105_live_chat_lifecycle_reconciliation.sql"),
      "utf8"
    );
    const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
    assert.match(migration, /app_live_chat_reconcile_lifecycle/i);
    assert.match(migration, /interval '10 minutes'/i);
    assert.match(migration, /app_live_chat_transfer_candidates/i);
    assert.match(migration, /app_live_chat_agent_end/i);
    assert.match(migration, /assignment_status','cancelled'/i);
    assert.doesNotMatch(topLevel, /\binsert\s+into\b|\bupdate\s+public\.app_|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

    const messaging = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "messaging", "01-messaging.js"), "utf8");
    const styles = fs.readFileSync(path.join(__dirname, "..", "Assets", "style", "app.bundle.css"), "utf8");
    const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    assert.match(messaging, /dismissLiveChatOfferLocally/);
    assert.match(messaging, /data-live-offer-dismiss/);
    assert.match(messaging, /directResult\?\.available/);
    assert.match(messaging, /openAcceptedLiveChatImmediately/);
    assert.match(styles, /live-support-offer-close/);
    assert.match(index, /live-chat(?:106|=20260902-(?:polish107|ai108)|=20260903-(?:ai(?:111|113|114)|bgnotify117|webpush(?:118|119|120|123|124)))|polish107|ai108|ai111|ai113|ai114|bgnotify117|webpush(?:118|119|120|123|124)/);
  });

  it("106 keeps accepted transfers visible, clears open-chat unread state, and is installation-safe", () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "migrations", "106_live_chat_transfer_delivery_read_state_and_records.sql"),
      "utf8"
    );
    const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
    assert.match(migration, /app_admin_list_inquiries/i);
    assert.match(migration, /r\.assigned_user_id=admin\.id/i);
    assert.match(migration, /app_mark_inquiry_read/i);
    assert.match(migration, /app_admin_live_chat_transcript/i);
    assert.match(migration, /transfers/i);
    assert.doesNotMatch(topLevel, /\binsert\s+into\b|\bupdate\s+public\.app_|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

    const messaging = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "messaging", "01-messaging.js"), "utf8");
    const admin = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "admin", "01-admin.js"), "utf8");
    const styles = fs.readFileSync(path.join(__dirname, "..", "Assets", "style", "app.bundle.css"), "utf8");
    const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    assert.match(messaging, /openAcceptedLiveChatImmediately/);
    assert.match(messaging, /app_mark_inquiry_read/);
    assert.match(messaging, /personalMessageServerUnreadCount/);
    assert.match(messaging, /Pro Monthly plan/);
    assert.match(admin, /adminRawStateHtml/);
    assert.match(admin, /Support handoff history/);
    assert.match(styles, /admin-raw-empty-state/);
    assert.match(styles, /live-chat-quick-item>span>small/);
    assert.match(index, /live-chat(?:106|=20260902-(?:polish107|ai108)|=20260903-(?:ai(?:111|113|114)|bgnotify117|webpush(?:118|119|120|123|124)))|polish107|ai108|ai111|ai113|ai114|bgnotify117|webpush(?:118|119|120|123|124)/);
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


it("post-106 live chat polish preserves dropdown scroll and toggle semantics", () => {
  const projectRoot = path.join(__dirname, "..");
  const messaging = fs.readFileSync(path.join(projectRoot, "Assets/app/messaging/01-messaging.js"), "utf8");
  const landing = fs.readFileSync(path.join(projectRoot, "Assets/app/landing/02-live-chat.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  assert.match(messaging, /notificationDropdownSignature/);
  assert.match(messaging, /previousScrollTop/);
  assert.match(messaging, /isAssignedSupportThread\(thread\) && floatingMessageState\.openIds\.has/);
  assert.match(landing, /launcherToggle && panelOpen/);
  assert.match(css, /z-index:2147483646/);
  assert.match(css, /message-float-transfer.*background:var\(--surface-elevated\)/s);
});

it("107 keeps Main Admin-owned Live Chat in live sync and removes guest-poll timestamp churn", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(
    path.join(projectRoot, "migrations", "107_admin_live_chat_sync_visibility.sql"),
    "utf8"
  );
  const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
  assert.match(migration, /create or replace function public\.app_messaging_sync_state/i);
  assert.match(migration, /r\.assigned_user_id<>uid/i);
  assert.match(migration, /create or replace function public\.app_public_live_chat_thread/i);
  assert.match(migration, /has_unread_support/i);
  assert.doesNotMatch(migration, /set\s+user_last_read_at=now\(\)\s*,\s*updated_at=now\(\)/i);
  assert.doesNotMatch(topLevel, /\binsert\s+into\b|\bupdate\s+public\.app_|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

  const builder = fs.readFileSync(path.join(projectRoot, "scripts", "build_full_schema_sql.js"), "utf8");
  assert.match(builder, /107_admin_live_chat_sync_visibility\.sql/);
});


it("108 adds zero-cost, Triplem-only AI Live Support with explicit human handoff and no installation-time data rewrite", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(
    path.join(projectRoot, "migrations", "108_live_chat_ai_assistant.sql"),
    "utf8"
  );
  const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
  assert.match(migration, /app_live_chat_ai_state/i);
  assert.match(migration, /support_actor/i);
  assert.match(migration, /app_live_chat_ai_answer/i);
  assert.match(migration, /app_live_chat_ai_human_requested/i);
  assert.match(migration, /app_live_chat_ai_sensitive_handoff_reason/i);
  assert.match(migration, /Triplem VIP AI Assistant/i);
  assert.match(migration, /14-day free trial/i);
  assert.match(migration, /Pro Monthly/i);
  assert.match(migration, /Pro Yearly/i);
  assert.match(migration, /coalesce\(ai\.mode,'legacy_human'\)<>'ai'/i);
  assert.match(migration, /next_mode='human_pending'/i);
  assert.doesNotMatch(topLevel, /\binsert\s+into\b|\bupdate\s+public\.app_|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);
  assert.doesNotMatch(migration, /api\.openai\.com|generativelanguage\.googleapis|api\.groq\.com|api\.huggingface\.co/i);

  const landing = fs.readFileSync(path.join(projectRoot, "Assets/app/landing/02-live-chat.js"), "utf8");
  const messaging = fs.readFileSync(path.join(projectRoot, "Assets/app/messaging/01-messaging.js"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");
  assert.match(landing, /support_mode/);
  assert.match(landing, /Agent support requested/);
  assert.match(landing, /AI replies are paused/);
  assert.match(landing, /landing-live-chat-actor-badge/);
  assert.match(messaging, /AI handoff requested/);
  assert.match(messaging, /chat-actor-badge is-ai/);
  assert.match(index, /Triplem VIP AI Assistant/);
  assert.match(index, /request an Agent anytime|ask for an agent anytime/i);
  assert.match(css, /landing-live-chat-identity/);
  assert.match(css, /chat-bubble\.from-ai/);
  assert.match(builder, /108_live_chat_ai_assistant\.sql/);
});

it("109 makes zero-cost Live Chat AI more conversational, concise, confidential, and Enter-to-send", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(
    path.join(projectRoot, "migrations", "109_live_chat_ai_intelligence_and_input.sql"),
    "utf8"
  );
  const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
  assert.match(migration, /app_live_chat_ai_confidential_request/i);
  assert.match(migration, /app_live_chat_ai_private_data_request/i);
  assert.match(migration, /p_previous_intent/i);
  assert.match(migration, /how does it work/i);
  assert.match(migration, /Record activity once and related balances, history and reporting stay connected/i);
  assert.match(migration, /source code, credentials, keys, database internals, vulnerabilities, or bypass methods/i);
  assert.match(migration, /Start free for 14 days with no card/i);
  assert.doesNotMatch(topLevel, /\binsert\s+into\b|\bupdate\s+public\.app_|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);
  assert.doesNotMatch(migration, /api\.openai\.com|generativelanguage\.googleapis|api\.groq\.com|api\.huggingface\.co/i);

  const landing = fs.readFileSync(path.join(projectRoot, "Assets/app/landing/02-live-chat.js"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts", "build_full_schema_sql.js"), "utf8");
  assert.match(landing, /submitOnEnter/);
  assert.match(landing, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(landing, /requestSubmit/);
  assert.match(css, /landing-live-chat-reply textarea\{[^}]*scrollbar-width:none/i);
  assert.match(css, /landing-live-chat-reply textarea::\-webkit\-scrollbar\{[^}]*display:none/i);
  assert.match(index, /02-live-chat\.js\?v=20260903-(?:ai(?:109|110|111|112|113|114)|livechat117|webpush(?:118|119|120|123|124))/);
  assert.match(builder, /109_live_chat_ai_intelligence_and_input\.sql/);
});


it("110 adds weighted multi-intent Live Chat AI with visible generation state and no paid inference", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(
    path.join(projectRoot, "migrations", "110_live_chat_ai_intent_engine_and_thinking_state.sql"),
    "utf8"
  );
  const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
  assert.match(migration, /weighted intent understanding/i);
  assert.match(migration, /app_live_chat_ai_feature_summary/i);
  assert.match(migration, /secondary_intent/i);
  assert.match(migration, /p_previous_message/i);
  assert.match(migration, /preceding guest turn contributes only a small contextual/i);
  assert.match(migration, /I cannot verify that as a current Triplem VIP feature, so I will not guess/i);
  assert.match(migration, /You set up your workspace and wallets, then record expenses, transfers, stock, loans, installments or assets/i);
  assert.match(migration, /source code, credentials, keys, database internals, vulnerabilities or bypass methods/i);
  assert.doesNotMatch(topLevel, /\binsert\s+into\b|\bupdate\s+public\.app_|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);
  assert.doesNotMatch(migration, /api\.openai\.com|generativelanguage\.googleapis|api\.groq\.com|api\.huggingface\.co|transformers\.js|webllm/i);

  const landing = fs.readFileSync(path.join(projectRoot, "Assets/app/landing/02-live-chat.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts", "build_full_schema_sql.js"), "utf8");
  assert.match(landing, /aiGenerating/);
  assert.match(landing, /Generating a response|Understanding your question|Preparing your AI answer/);
  assert.match(landing, /aiThinkingDelay/);
  assert.match(landing, /optimisticMessage/);
  assert.match(landing, /modeBeforeSend === "ai"/);
  assert.match(css, /landingLiveChatAiThink/);
  assert.match(css, /landing-live-chat-thinking-dots/);
  assert.match(index, /02-live-chat\.js\?v=20260903-(?:ai(?:110|111|112|113|114)|livechat117|webpush(?:118|119|120|123|124))/);
  assert.match(index, /livechat=20260903-(?:ai(?:110|111|112|113|114)|bgnotify117|webpush(?:118|119|120|123|124)|ui124|ui125|ui126)/);
  assert.match(builder, /110_live_chat_ai_intent_engine_and_thinking_state\.sql/);
});


it("111 deepens local-context AI, auto-hands repeated uncertainty to online agents, and fixes mobile chat readability/containment", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(
    path.join(projectRoot, "migrations", "111_live_chat_ai_context_confidence_and_mobile_polish.sql"),
    "utf8"
  );
  const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
  assert.match(migration, /uncertainty_streak integer not null default 0/i);
  assert.match(migration, /offset 1 limit 3/i);
  assert.match(migration, /app_live_chat_ai_availability|app_live_chat_availability/i);
  assert.match(migration, /next_uncertainty>=2 and support_open/i);
  assert.match(migration, /ai_uncertain_repeated/i);
  assert.match(migration, /I am still learning, so I may occasionally make mistakes and will avoid guessing/i);
  assert.match(migration, /question_kind/i);
  assert.match(migration, /explicit_capability_question/i);
  assert.match(migration, /I cannot verify that as a current Triplem VIP feature, so I will not guess/i);
  assert.match(migration, /source code, credentials, database\/API internals, private records, vulnerabilities or bypass methods/i);
  assert.doesNotMatch(topLevel, /\binsert\s+into\b|\bupdate\s+public\.app_|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);
  assert.doesNotMatch(migration, /api\.openai\.com|generativelanguage\.googleapis|api\.groq\.com|api\.huggingface\.co|transformers\.js|webllm/i);

  const landing = fs.readFileSync(path.join(projectRoot, "Assets/app/landing/02-live-chat.js"), "utf8");
  const messaging = fs.readFileSync(path.join(projectRoot, "Assets/app/messaging/01-messaging.js"), "utf8");
  const visitorCss = fs.readFileSync(path.join(projectRoot, "Assets/style/08-landing-auth.css"), "utf8");
  const agentCss = fs.readFileSync(path.join(projectRoot, "Assets/style/11-admin-messaging.css"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");
  assert.match(landing, /Understanding your question|Preparing your AI answer/);
  assert.match(landing, /Math\.max\(1750,\s*Math\.min\(4300/);
  assert.match(messaging, /function syncFloatingMobileCardViewport\(\)/);
  assert.match(messaging, /focus: !isFloatingMobile\(\)/);
  assert.match(visitorCss, /landing-live-chat-message p\{font-size:\.82rem;line-height:1\.48;\}/i);
  assert.match(agentCss, /message-float-vv-width/i);
  assert.match(agentCss, /message-float-dock\.has-open-card\{[\s\S]*transform:none !important;[\s\S]*will-change:auto !important;/i);
  assert.match(index, /02-live-chat\.js\?v=20260903-(?:ai(?:111|112|113|114)|livechat117|webpush(?:118|119|120|123|124))/);
  assert.match(index, /(?:01-messaging\.js\?v=20260903-(?:ai(?:111|113|114)|livechat(?:115|116|117)|webpush(?:118|119|120|123|124)|fastnotify127|recovery129)|01-messaging\.js\?v=20260904-reliability139|01-messaging\.js\?v=20260905-audio141)/);
  assert.match(index, /livechat=20260903-(?:ai(?:111|113|114)|bgnotify117|webpush(?:118|119|120|123|124)|ui124|ui125|ui126)/);
  assert.match(builder, /111_live_chat_ai_context_confidence_and_mobile_polish\.sql/);
});

it("112 uses real local transformer semantic understanding with grounded server answers and zero paid AI API", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(
    path.join(projectRoot, "migrations", "112_live_chat_neural_semantic_ai.sql"),
    "utf8"
  );
  const semantic = fs.readFileSync(
    path.join(projectRoot, "Assets/app/ai/01-live-chat-semantic-ai.js"),
    "utf8"
  );
  const landing = fs.readFileSync(path.join(projectRoot, "Assets/app/landing/02-live-chat.js"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");
  const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");

  assert.match(semantic, /@huggingface\/transformers@3\.8\.1/);
  assert.match(semantic, /Xenova\/all-MiniLM-L6-v2/);
  assert.match(semantic, /pipeline\("feature-extraction"/);
  assert.match(semantic, /pooling:\s*"mean",\s*normalize:\s*true/);
  assert.match(semantic, /What are the Triplem VIP plans and prices/);
  assert.match(semantic, /How do I subscribe to a Triplem VIP Pro plan/);
  assert.match(semantic, /What is Triplem VIP and what is it used for/);

  const semanticSandbox = { window: {}, console };
  vm.createContext(semanticSandbox);
  vm.runInContext(semantic, semanticSandbox);
  const fallbackAnalyze = semanticSandbox.window.TriplemLiveChatAI.fallbackAnalyze;
  assert.equal(fallbackAnalyze("Triplem VIP plans?").intents[0].intent, "pricing");
  assert.equal(fallbackAnalyze("How to subscribe?").intents[0].intent, "payment_method");
  assert.equal(fallbackAnalyze("What is it for?").intents[0].intent, "overview");
  assert.equal(fallbackAnalyze("How does Triplem VIP works?").intents[0].intent, "overview");
  assert.deepEqual(
    Array.from(fallbackAnalyze("Can I manage stock and invoices?").intents, row => row.intent),
    ["inventory", "invoices"]
  );

  assert.match(landing, /app_public_live_chat_start_semantic/);
  assert.match(landing, /app_public_live_chat_reply_semantic/);
  assert.match(migration, /app_live_chat_ai_semantic_answer/i);
  assert.match(migration, /app_live_chat_ai_process_semantic/i);
  assert.match(migration, /Plan & Subscription/);
  assert.match(migration, /Pro Monthly:/);
  assert.match(migration, /I use AI to understand your question, but I am still learning/i);
  assert.match(migration, /guarded_server_policy/);
  assert.doesNotMatch(topLevel, /\binsert\s+into\b|\bupdate\s+public\.app_|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);
  assert.doesNotMatch(semantic, /api\.openai\.com|generativelanguage\.googleapis|api\.groq\.com|api\.huggingface\.co/i);
  assert.match(index, /02-live-chat\.js\?v=20260903-(?:ai(?:112|113|114)|livechat117|webpush(?:118|119|120|123|124))/);
  assert.match(builder, /112_live_chat_neural_semantic_ai\.sql/);
});



it("113 fixes neural ESM loading, contextual transcript failures, Agent terminology, and preserves zero-cost grounded AI", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(path.join(projectRoot, "migrations", "113_live_chat_ai_contextual_neural_agent_refinement.sql"), "utf8");
  const semantic = fs.readFileSync(path.join(projectRoot, "Assets/app/ai/01-live-chat-semantic-ai.js"), "utf8");
  const landing = fs.readFileSync(path.join(projectRoot, "Assets/app/landing/02-live-chat.js"), "utf8");
  const messaging = fs.readFileSync(path.join(projectRoot, "Assets/app/messaging/01-messaging.js"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");
  const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");

  assert.match(semantic, /@huggingface\/transformers@3\.8\.1\/\+esm/);
  assert.match(semantic, /browser_language_model/);
  assert.match(semantic, /What is this for\?/);
  assert.match(semantic, /payment_security/);
  assert.match(migration, /support person/);
  assert.match(migration, /primary_intent='payment_security'/);
  assert.match(migration, /Pro payment is handled through the listed bank-transfer workflow/);
  assert.match(migration, /Agent Support operates 10:00 AM to 5:00 PM GST/);
  assert.match(migration, /Waiting for an Agent/);
  assert.match(landing, /Agent support is online/);
  assert.match(landing, /Agent support requested/);
  assert.match(messaging, />Agent<\/em>/);
  assert.match(index, /AI available 24\/7 · Agent support 10:00 AM/);
  assert.match(index, /02-live-chat\.js\?v=20260903-(?:ai(?:113|114)|livechat117|webpush(?:118|119|120|123|124))/);
  assert.match(index, /(?:01-messaging\.js\?v=20260903-(?:ai113|livechat(?:115|116|117)|webpush(?:118|119|120|123|124)|fastnotify127|recovery129)|01-messaging\.js\?v=20260904-reliability139|01-messaging\.js\?v=20260905-audio141)/);
  assert.match(builder, /113_live_chat_ai_contextual_neural_agent_refinement\.sql/);
  assert.doesNotMatch(topLevel, /\binsert\s+into\b|\bupdate\s+public\.app_|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);
  assert.doesNotMatch(semantic, /api\.openai\.com|generativelanguage\.googleapis|api\.groq\.com|api\.huggingface\.co/i);

  const semanticSandbox = { window: {}, console, setTimeout, globalThis: {} };
  vm.createContext(semanticSandbox);
  vm.runInContext(semantic, semanticSandbox);
  const fallback = semanticSandbox.window.TriplemLiveChatAI.fallbackAnalyze;
  assert.equal(fallback("What is this for?").intents[0].intent, "overview");
  assert.equal(fallback("How do I get the plan?").intents[0].intent, "payment_method");
  assert.equal(fallback("What is the security of my payment?").intents[0].intent, "payment_security");
});

it("114 replaces free-form visitor AI prompts with guided questions and unlocks typing only for an accepted Agent", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(path.join(projectRoot, "migrations", "114_live_chat_guided_ai_agent_unlock.sql"), "utf8");
  const landing = fs.readFileSync(path.join(projectRoot, "Assets/app/landing/02-live-chat.js"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");
  const topLevel = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");

  assert.match(migration, /app_public_live_chat_start_guided/i);
  assert.match(migration, /app_public_live_chat_choose/i);
  assert.match(migration, /app_live_chat_guided_options/i);
  assert.match(migration, /Please choose one of the available support questions/i);
  assert.match(migration, /Typing will unlock as soon as an Agent accepts the chat/i);
  assert.match(migration, /Talk to an Agent/);
  assert.match(migration, /I am still learning and may occasionally make mistakes/i);
  assert.match(migration, /Pro Monthly costs AED 49/);
  assert.match(migration, /does not ask you to enter card details/i);
  assert.doesNotMatch(topLevel, /\binsert\s+into\b|\bupdate\s+public\.app_|\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

  assert.match(index, /Start AI Support/);
  assert.match(index, /landingLiveChatGuided/);
  assert.doesNotMatch(index, /id="landingLiveChatMessage"/);
  assert.doesNotMatch(index, /01-live-chat-semantic-ai\.js/);
  assert.match(index, /02-live-chat\.js\?v=20260903-(?:ai114|livechat117|webpush(?:118|119|120|123|124))/);
  assert.match(index, /livechat=20260903-(?:ai114|bgnotify117|webpush(?:118|119|120|123|124)|ui124|ui125|ui126)/);
  assert.match(landing, /app_public_live_chat_start_guided/);
  assert.match(landing, /app_public_live_chat_choose/);
  assert.match(landing, /const canType = !closed && \(mode === "human" \|\| mode === "legacy_human"\)/);
  assert.match(landing, /Choose a question/);
  assert.match(landing, /No typing needed while AI is assisting/);
  assert.match(css, /landing-live-chat-guided-chip/);
  assert.match(css, /landing-live-chat-agent-wait/);
  assert.match(builder, /114_live_chat_guided_ai_agent_unlock\.sql/);
});

it("116 loops the OPUS Agent Live Chat invitation sound and stops/dismisses immediately on accepted chat", () => {
  const projectRoot = path.join(__dirname, "..");
  const messaging = fs.readFileSync(path.join(projectRoot, "Assets/app/messaging/01-messaging.js"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

  assert.match(messaging, /Assets\/sounds\/live_notification\.opus\?v=20260903-livechat(?:116|117)/);
  assert.match(messaging, /audio\.loop\s*=\s*true/);
  assert.match(messaging, /bindLiveChatNotificationAudioUnlock/);
  assert.match(messaging, /primeLiveChatNotificationAudio/);
  assert.match(messaging, /syncLiveChatNotificationSound\(allPending\)/);
  assert.match(messaging, /silenceLiveChatOfferInquiryImmediately\(inquiryId\);[\s\S]*app_live_chat_accept_assignment/);
  assert.match(messaging, /broadcastLiveChatOfferResolved\(inquiryId\)/);
  assert.match(messaging, /realtime:triplem-live-chat-agent-events-v1/);
  assert.match(messaging, /event:\s*"phx_join"/);
  assert.match(messaging, /LIVE_CHAT_REALTIME_EVENT_RESOLVED/);
  assert.match(messaging, /silenceLiveChatOfferInquiryImmediately\(inquiryId, \{ dismissUi: true \}\)/);
  assert.match(messaging, /refreshAdminCommsBadges\(\)\.catch/);
  assert.match(messaging, /startLiveChatRealtimeBridge\(\)/);
  assert.match(messaging, /stopLiveChatRealtimeBridge\(\)/);
  assert.match(index, /(?:01-messaging\.js\?v=20260903-(?:livechat(?:116|117)|webpush(?:118|119|120|123|124)|fastnotify127|recovery129)|01-messaging\.js\?v=20260904-reliability139|01-messaging\.js\?v=20260905-audio141)/);
});



it("117 wakes minimized Agent tabs through Realtime Broadcast and makes stale bell invitations read-only", () => {
  const projectRoot = path.join(__dirname, "..");
  const landing = fs.readFileSync(path.join(projectRoot, "Assets/app/landing/02-live-chat.js"), "utf8");
  const messaging = fs.readFileSync(path.join(projectRoot, "Assets/app/messaging/01-messaging.js"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");

  assert.match(landing, /realtime\/v1\/api\/broadcast/);
  assert.match(landing, /LIVE_CHAT_AGENT_EVENT_AVAILABLE\s*=\s*"offer_available"/);
  assert.match(landing, /broadcastAgentOfferAvailable\(session\.inquiry_id\)/);
  assert.match(landing, /keepalive:\s*true/);
  assert.match(messaging, /LIVE_CHAT_REALTIME_EVENT_AVAILABLE\s*=\s*"offer_available"/);
  assert.match(messaging, /reconcileLiveChatOffersFromRealtime\(inquiryId\)/);
  assert.match(messaging, /authenticated routing RPC confirms a genuinely actionable offer/);
  assert.match(messaging, /directLiveOffers\.available/);
  assert.match(messaging, /liveChatNotificationResolution/);
  assert.match(messaging, /No longer awaiting your response/);
  assert.match(messaging, /Conversation ended/);
  assert.match(messaging, /Accepted by another Agent/);
  assert.match(messaging, /app_live_chat_accept_transfer/);
  assert.match(messaging, /app_live_chat_decline_transfer/);
  assert.match(messaging, /data-live-assignment-close><i class="fa-solid fa-check"><\/i> Done/);
  assert.match(css, /live-chat-assignment-resolution/);
  assert.match(index, /02-live-chat\.js\?v=20260903-(?:livechat117|webpush(?:118|119|120|123|124)|fastnotify127|recovery129)/);
  assert.match(index, /(?:01-messaging\.js\?v=20260903-(?:livechat117|webpush(?:118|119|120|123|124)|fastnotify127|recovery129)|01-messaging\.js\?v=20260904-reliability139|01-messaging\.js\?v=20260905-audio141)/);
  assert.match(index, /livechat=20260903-(?:bgnotify117|webpush(?:118|119|120|123|124)|ui124|ui125|ui126)/);
});


it("118 implements secure opt-in Web Push, Main Admin multi-user broadcasts, closed-browser Agent alerts, and compact bell controls", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(path.join(projectRoot, "migrations", "118_secure_web_push_notifications.sql"), "utf8");
  const edge = fs.readFileSync(path.join(projectRoot, "supabase/functions/push-notifications/index.ts"), "utf8");
  const sw = fs.readFileSync(path.join(projectRoot, "service-worker.js"), "utf8");
  const pushClient = fs.readFileSync(path.join(projectRoot, "Assets/app/notifications/01-web-push.js"), "utf8");
  const landing = fs.readFileSync(path.join(projectRoot, "Assets/app/landing/02-live-chat.js"), "utf8");
  const messaging = fs.readFileSync(path.join(projectRoot, "Assets/app/messaging/01-messaging.js"), "utf8");
  const auth = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/02-auth-welcome-trial.js"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");

  const installOnly = migration
    .replace(/\$fn\$[\s\S]*?\$fn\$/g, "")
    .replace(/--.*$/gm, "");
  assert.match(migration, /create table if not exists public\.app_push_subscriptions/i);
  assert.match(migration, /alter table public\.app_push_subscriptions enable row level security/i);
  assert.match(migration, /app_register_push_subscription/i);
  assert.match(migration, /app_unregister_push_subscription/i);
  assert.match(migration, /app_set_push_client_presence/i);
  assert.match(migration, /app_push_admin_prepare_custom_notification/i);
  assert.match(migration, /app_require_protected_admin\(\)/i);
  assert.match(migration, /app_push_service_live_chat_recipients/i);
  assert.match(migration, /app_live_chat_validate_guest\(p_inquiry_id,p_guest_token\)/i);
  assert.match(migration, /route_row\.status<>'pending'/i);
  assert.match(migration, /ai_row\.mode<>'human_pending'/i);
  assert.match(migration, /app_push_service_subscriptions_for_users/i);
  assert.match(migration, /app_push_live_chat_dispatches/i);
  assert.match(migration, /should_send/i);
  assert.match(migration, /fcm\\.googleapis|fcm\.googleapis/i);
  assert.match(migration, /revoke all on table public\.app_push_subscriptions from public, anon, authenticated/i);
  assert.doesNotMatch(installOnly, /\bupdate\s+public\.app_|\bdelete\s+from\s+public\.app_|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

  assert.match(edge, /@pushforge\/builder@2\.0\.5/);
  assert.match(edge, /VAPID_PRIVATE_KEY/);
  assert.match(edge, /X-Session-Token/i);
  assert.match(edge, /app_push_admin_prepare_custom_notification/);
  assert.match(edge, /app_push_service_live_chat_recipients/);
  assert.match(edge, /authorized\?\.should_send === false/);
  assert.match(edge, /EdgeRuntime/);
  assert.match(edge, /waitUntil/);
  assert.match(edge, /suppressWhenOpen:\s*(?:true|false)/);
  assert.match(edge, /body:\s*"A visitor is waiting for an Agent\./);
  assert.doesNotMatch(pushClient, /VAPID_PRIVATE_KEY|privateJWK/);

  assert.match(sw, /self\.addEventListener\("push"/);
  assert.match(sw, /clients\.matchAll\(\{ type: "window", includeUncontrolled: true \}\)/);
  assert.match(sw, /registration\.showNotification/);
  assert.match(sw, /notificationclick/);

  assert.match(pushClient, /Notification\.requestPermission\(\)/);
  assert.match(pushClient, /pushManager\.subscribe/);
  assert.match(pushClient, /app_register_push_subscription/);
  assert.match(pushClient, /startClientPresence/);
  assert.match(pushClient, /app_set_push_client_presence/);
  assert.match(pushClient, /pagehide/);
  assert.match(pushClient, /keepalive:\s*true/);
  assert.match(pushClient, /adminPushNotificationsBtn/);
  assert.match(pushClient, /data-admin-push-mode="all"/);
  assert.match(pushClient, /data-admin-push-mode="selected"/);
  assert.match(pushClient, /adminPushUserSearch/);
  assert.match(pushClient, /selectedUsers:\s*new Set\(\)/);
  assert.match(pushClient, /requestLiveChatAgentPush/);
  assert.match(landing, /requestClosedBrowserAgentPush\(session\.inquiry_id\)/);
  assert.match(auth, /TriplemPush\?\.syncExistingSubscription/);
  assert.match(index, /service-worker\.js|01-web-push\.js\?v=(?:20260903-(?:webpush(?:118|119|120|123|124)|pushux127)|20260904-reliability139|20260905-audio141)/);
  assert.match(index, /adminPushNotificationsBtn/);
  assert.match(index, /pushNotificationToggleBtn/);
  assert.match(index, /admin-comms-read-all/);
  assert.match(messaging, /admin-notif-read-btn/);
  assert.match(css, /admin-push-dialog/);
  assert.match(css, /admin-comms-device-toggle/);
  assert.match(builder, /118_secure_web_push_notifications\.sql/);
});


it("119 makes Web Push delivery window-state reliable, self-heals VAPID subscriptions, and notifies private Messages", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(path.join(projectRoot, "migrations", "119_web_push_delivery_reliability_and_messages.sql"), "utf8");
  const edge = fs.readFileSync(path.join(projectRoot, "supabase/functions/push-notifications/index.ts"), "utf8");
  const sw = fs.readFileSync(path.join(projectRoot, "service-worker.js"), "utf8");
  const pushClient = fs.readFileSync(path.join(projectRoot, "Assets/app/notifications/01-web-push.js"), "utf8");
  const messaging = fs.readFileSync(path.join(projectRoot, "Assets/app/messaging/01-messaging.js"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");

  const installOnly = migration
    .replace(/\$fn\$[\s\S]*?\$fn\$/g, "")
    .replace(/--.*$/gm, "");

  assert.match(migration, /create table if not exists public\.app_push_message_dispatches/i);
  assert.match(migration, /app_push_prepare_message_dispatch/i);
  assert.match(migration, /latest\.sender_id is distinct from uid/i);
  assert.match(migration, /latest\.sender_role='user'/i);
  assert.match(migration, /latest\.sender_role='admin'/i);
  assert.match(migration, /on conflict\(message_id\) do nothing/i);
  assert.match(migration, /coalesce\(inquiry_row\.source,'app'\) <> 'app'/i);
  assert.doesNotMatch(installOnly, /\bupdate\s+public\.app_|\bdelete\s+from\s+public\.app_|\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

  assert.match(edge, /publicVapidKeyFromPrivateJWK/);
  assert.match(edge, /configured_public_key_matches_private/);
  assert.match(edge, /action === "message_notify"/);
  assert.match(edge, /app_push_prepare_message_dispatch/);
  assert.match(edge, /Web Push delivery summary/);
  assert.match(edge, /recipients\.length <= 25/);
  assert.doesNotMatch(edge, /closedOnly/);
  assert.doesNotMatch(edge, /row\.client_open !== true/);

  assert.match(pushClient, /ensureSubscriptionForVapid/);
  assert.match(pushClient, /subscriptionUsesPublicKey/);
  assert.match(pushClient, /app_unregister_push_subscription/);
  assert.match(pushClient, /requestMessagePush/);
  assert.match(pushClient, /invoke\("message_notify"/);
  assert.match(pushClient, /service-worker\.js\?v=(?:119|120|123)/);

  assert.match(messaging, /TriplemPush\?\.requestMessagePush/);
  assert.match(sw, /Web Push Service Worker — v(?:119|120|123)/);
  assert.match(sw, /registration\.showNotification/);
  assert.match(index, /01-messaging\.js\?v=(?:20260903-(?:webpush(?:119|120|123|124)|fastnotify127|recovery129)|20260904-reliability139|20260905-audio141)/);
  assert.match(index, /01-web-push\.js\?v=(?:20260903-(?:webpush(?:119|120|123|124)|pushux127)|20260904-reliability139|20260905-audio141)/);
  assert.match(builder, /119_web_push_delivery_reliability_and_messages\.sql/);
});


it("120 exposes Admin broadcasts in the bell and adds dual Web Push transport verification", () => {
  const migration = fs.readFileSync(path.join(__dirname, "..", "migrations", "120_web_push_transport_and_notification_center_fix.sql"), "utf8");
  const messaging = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "messaging", "01-messaging.js"), "utf8");
  const pushClient = fs.readFileSync(path.join(__dirname, "..", "Assets", "app", "notifications", "01-web-push.js"), "utf8");
  const edge = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "push-notifications", "index.ts"), "utf8");
  const sw = fs.readFileSync(path.join(__dirname, "..", "service-worker.js"), "utf8");
  const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  assert.match(migration, /notification_count integer/i);
  assert.match(migration, /get diagnostics notification_count = row_count/i);
  assert.match(migration, /notification_count <> recipient_count/i);
  assert.doesNotMatch(migration, /^\s*(update|delete|truncate)\s+public\.(app_users|app_inquiries|app_inquiry_messages|app_user_notifications)/im);

  assert.match(messaging, /function isAdminBroadcastNotification\(item\)/);
  assert.match(messaging, /admin_broadcast/);
  assert.match(messaging, /\|\| isAdminBroadcastNotification\(item\)/);

  assert.match(edge, /@pushforge\/builder@2\.0\.5/);
  assert.match(edge, /@block65\/webcrypto-web-push@1\.0\.2/);
  assert.match(edge, /sendWithPushForge/);
  assert.match(edge, /sendWithWebCrypto/);
  assert.match(edge, /webcrypto-fallback/);
  assert.match(edge, /Web Push accepted on fallback/);

  assert.match(sw, /skipWaiting\(\)/);
  assert.match(sw, /clients\.claim\(\)/);
  assert.match(pushClient, /service-worker\.js\?v=(?:120|123)/);
  assert.match(index, /01-messaging\.js\?v=(?:20260903-(?:webpush(?:120|123|124)|fastnotify127|recovery129)|20260904-reliability139|20260905-audio141)/);
  assert.match(index, /01-web-push\.js\?v=(?:20260903-(?:webpush(?:120|123|124)|pushux127)|20260904-reliability139|20260905-audio141)/);
});


it("121 uses direct protected subscription-table lookup after recipient authorization", () => {
  const edge = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "push-notifications", "index.ts"), "utf8");
  assert.match(edge, /from\("app_push_subscriptions"\)/);
  assert.match(edge, /select\("id,owner_id,endpoint,p256dh,auth_secret"\)/);
  assert.doesNotMatch(edge, /adminClient\.rpc\("app_push_service_subscriptions_for_users"/);
  assert.match(edge, /Web Push subscription lookup/);
});


it('web push omits Topic header for Apple Web Push endpoints', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'push-notifications', 'index.ts'), 'utf8');
  assert.match(src, /host === ["']web\.push\.apple\.com["']/);
  assert.match(src, /filter\(\(\[key\]\) => key !== ["']topic["']\)/);
  assert.match(src, /sendWithPushForge\(subscription, payload, deliveryOptions, privateJWK\)/);
  assert.match(src, /sendWithWebCrypto\(subscription, payload, deliveryOptions, privateJWK\)/);
});


it("123 adds opt-in login/landing consent, compact bell switch, foreground push, and anonymous visitor broadcasts", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(path.join(projectRoot, "migrations", "123_push_consent_foreground_and_visitor_subscribers.sql"), "utf8");
  const pushClient = fs.readFileSync(path.join(projectRoot, "Assets/app/notifications/01-web-push.js"), "utf8");
  const edge = fs.readFileSync(path.join(projectRoot, "supabase/functions/push-notifications/index.ts"), "utf8");
  const sw = fs.readFileSync(path.join(projectRoot, "service-worker.js"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");

  const installOnly = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");
  assert.match(migration, /create table if not exists public\.app_push_visitor_subscriptions/i);
  assert.match(migration, /visitor_token_hash/i);
  assert.match(migration, /app_push_service_register_visitor_subscription/i);
  assert.match(migration, /app_push_admin_prepare_visitor_notification/i);
  assert.match(migration, /app_push_admin_visitor_subscriber_count/i);
  assert.match(migration, /app_require_protected_admin\(\)/i);
  assert.match(migration, /delete from public\.app_push_visitor_subscriptions where endpoint=ep/i);
  assert.doesNotMatch(installOnly, /\b(update|delete|truncate)\s+public\.(app_users|app_inquiries|app_inquiry_messages|app_user_notifications|wallets|expenses)/i);

  assert.match(pushClient, /USER_PUSH_PREF_PREFIX/);
  assert.match(pushClient, /VISITOR_PUSH_PREF_KEY/);
  assert.match(pushClient, /enableVisitorNotifications/);
  assert.match(pushClient, /syncVisitorSubscription/);
  assert.match(pushClient, /maybePromptSignedInUser/);
  assert.match(pushClient, /maybePromptVisitor/);
  assert.match(pushClient, /pushConsentModal/);
  assert.match(pushClient, /data-admin-push-mode="visitors"/);
  assert.match(pushClient, /admin_visitor_count/);
  assert.match(pushClient, /audience:\s*stateLocal\.adminMode === "visitors"/);
  assert.match(pushClient, /service-worker\.js\?v=123/);

  assert.match(edge, /action === "visitor_register"/);
  assert.match(edge, /app_push_service_register_visitor_subscription/);
  assert.match(edge, /action === "admin_visitor_count"/);
  assert.match(edge, /app_push_admin_prepare_visitor_notification/);
  assert.match(edge, /fanOutVisitors/);
  assert.match(edge, /from\("app_push_visitor_subscriptions"\)/);
  assert.doesNotMatch(edge, /suppressWhenOpen:\s*true/);

  assert.match(sw, /Web Push Service Worker — v123/);
  assert.match(sw, /TRIPLEM_PUSH_RECEIVED/);
  assert.match(sw, /registration\.showNotification/);
  assert.doesNotMatch(sw, /suppressWhenOpen && windowClients\.length > 0/);

  assert.match(index, /pushQuickToggleBtn/);
  assert.match(index, /01-web-push\.js\?v=(?:20260903-(?:webpush(?:123|124)|pushux127)|20260904-reliability139|20260905-audio141)/);
  assert.match(css, /push-quick-toggle/);
  assert.match(css, /push-consent-overlay/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(builder, /123_push_consent_foreground_and_visitor_subscribers\.sql/);
});

it("124 stabilizes Admin Live Chat records, notification prompt placement, and user logos", () => {
  const projectRoot = path.join(__dirname, "..");
  const core = fs.readFileSync(path.join(projectRoot, "Assets/app/core/03-els.js"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "Assets/app/admin/01-admin.js"), "utf8");
  const push = fs.readFileSync(path.join(projectRoot, "Assets/app/notifications/01-web-push.js"), "utf8");
  const auth = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/02-auth-welcome-trial.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

  assert.match(core, /document\.body\.appendChild\(modal\)/);
  assert.match(css, /z-index:2147483646/);
  assert.match(css, /#adminLiveChatRecordsModal\.modal\{z-index:2147483300!important\}/);
  assert.match(css, /#adminLiveChatTranscriptModal\.modal\{z-index:2147483400!important\}/);
  assert.match(css, /admin-live-records-sheet\{[^}]*height:min\(78dvh,720px\)/);
  assert.match(css, /admin-live-records-list[^}]*scrollbar-width:none/);
  assert.match(css, /admin-live-records-list::-webkit-scrollbar/);

  assert.match(admin, /const btn = e\.currentTarget;[\s\S]*await appConfirmDelete\("Permanently delete this complete Live Chat record/);
  assert.match(admin, /if \(btn\?\.isConnected\) btn\.disabled = false/);
  assert.match(admin, /function adminUserLogoUrl\(user\)/);
  assert.match(admin, /Assets\/logo\/logo\.png/);
  assert.match(admin, /admin-user-tile-logo/);
  assert.match(admin, /admin-live-agent-logo/);
  assert.match(push, /adminPushUserLogo/);
  assert.match(push, /promptAfterLogin/);
  assert.match(push, /Keep (?:off for now|notifications off)/);
  assert.match(push, /(?:important security updates|security notices)/);
  assert.match(auth, /TriplemPush\?\.promptAfterLogin/);

  const togglePos = index.indexOf('id="pushQuickToggleBtn"');
  const bellPos = index.indexOf('id="adminNotifyBtn"');
  assert.ok(togglePos >= 0 && bellPos >= 0 && togglePos < bellPos, "notification toggle should render left of the bell");
  assert.match(index, /01-web-push\.js\?v=(?:20260903-(?:webpush124|pushux127)|20260904-reliability139|20260905-audio141)/);
  assert.match(index, /01-admin\.js\?v=(?:20260903-(?:admin-ui(?:124|125|126)|auth2fa127|account-security128|recovery129)|20260904-(?:self-recovery137|account-security138|reliability139))/);
});


it("125 compacts Live Chat transcripts and keeps mobile record overlays centered with safe margins", () => {
  const projectRoot = path.join(__dirname, "..");
  const admin = fs.readFileSync(path.join(projectRoot, "Assets/app/admin/01-admin.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

  assert.match(admin, /liveRecordLifecycleEvent/);
  assert.match(admin, /admin-live-record-event/);
  assert.match(admin, /Chat closed/);
  assert.match(admin, /Inactivity notice/);
  assert.match(css, /v125 · Live Chat transcript compact audit styling \+ mobile centering/);
  assert.match(css, /\.admin-live-record-summary>div\{[\s\S]*?border:0!important/);
  assert.match(css, /\.admin-live-record-event\{/);
  assert.match(css, /#adminLiveChatRecordsModal\.modal,#adminLiveChatTranscriptModal\.modal\{[\s\S]*?align-items:center;justify-content:center/);
  assert.match(css, /width:min\(100%,calc\(100vw - 24px\)\)!important/);
  assert.match(css, /scrollbar-width:none/);
  assert.match(index, /livechat=20260903-ui(?:125|126)/);
  assert.match(index, /01-admin\.js\?v=(?:20260903-(?:admin-ui(?:125|126)|auth2fa127|account-security128|recovery129)|20260904-(?:self-recovery137|account-security138|reliability139))/);
});


it("126 fixes transcript sizing and guarantees confirmation stacking", () => {
  const projectRoot = path.join(__dirname, "..");
  const core = fs.readFileSync(path.join(projectRoot, "Assets/app/core/03-els.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

  assert.match(css, /v126 · Live Chat transcript structural correction \+ topmost confirmation portal/);
  assert.match(css, /#adminLiveChatTranscriptModal \.admin-live-record-thread-body\{[\s\S]*?display:flex!important/);
  assert.match(css, /#adminLiveChatTranscriptModal \.admin-live-record-thread-sheet\{[\s\S]*?height:auto!important/);
  assert.match(css, /#adminLiveChatTranscriptModal \.admin-live-record-transcript\{[\s\S]*?max-height:min\(48dvh,400px\)!important/);
  assert.match(css, /#adminLiveChatTranscriptModal \.admin-live-record-thread-actions>\.btn\{[\s\S]*?height:28px!important/);
  assert.match(css, /\.modal\.app-confirm-modal\{[\s\S]*?z-index:2147483647!important/);
  assert.match(core, /modal\.style\.setProperty\("z-index", "2147483647", "important"\)/);
  assert.match(index, /livechat=20260903-ui126/);
  assert.match(index, /03-els\.js\?v=20260903-admin-overlay126/);
});


it("127 adds free TOTP Authenticator App 2FA with trusted Remember Me sessions and instant notification UX", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(path.join(projectRoot, "migrations", "127_authenticator_app_2fa_and_ux_performance.sql"), "utf8");
  const twoFactor = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/03-two-factor.js"), "utf8");
  const auth = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/02-auth-welcome-trial.js"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "Assets/app/admin/01-admin.js"), "utf8");
  const messaging = fs.readFileSync(path.join(projectRoot, "Assets/app/messaging/01-messaging.js"), "utf8");
  const push = fs.readFileSync(path.join(projectRoot, "Assets/app/notifications/01-web-push.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");
  const installOnly = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");

  assert.match(migration, /create table if not exists public\.app_two_factor_accounts/i);
  assert.match(migration, /create table if not exists public\.app_two_factor_recovery_codes/i);
  assert.match(migration, /create table if not exists public\.app_two_factor_login_challenges/i);
  assert.match(migration, /pgp_sym_encrypt/i);
  assert.match(migration, /extensions\.hmac\(int8send\(counter\),secret_raw,'sha1'\)/i);
  assert.match(migration, /app_two_factor_begin_setup/i);
  assert.match(migration, /app_two_factor_confirm_setup/i);
  assert.match(migration, /app_two_factor_complete_login/i);
  assert.match(migration, /two_factor_required/i);
  assert.match(migration, /where user_id=u\.id and id<>sess\.id and revoked_at is null/i);
  assert.match(migration, /used_at is null/i);
  assert.match(migration, /failed_attempts integer not null default 0/i);
  assert.match(migration, /locked_until timestamptz/i);
  assert.match(migration, /failed_attempts\+1 >= 8/i);
  assert.match(migration, /interval '10 minutes'/i);
  assert.match(migration, /delete from public\.app_two_factor_login_challenges where user_id=u\.id/i);
  assert.doesNotMatch(installOnly, /\b(update|delete|truncate)\s+public\.(app_users|app_sessions|wallets|expenses|goods_items|loans|assets|app_inquiries|app_inquiry_messages)/i);

  assert.match(twoFactor, /Authenticator App 2FA/);
  assert.match(twoFactor, /app_two_factor_begin_setup/);
  assert.match(twoFactor, /app_two_factor_confirm_setup/);
  assert.match(twoFactor, /twoFactorQr/);
  assert.match(twoFactor, /Manual setup key/);
  assert.match(twoFactor, /Recovery Codes/);
  assert.match(twoFactor, /app_two_factor_complete_login/);
  assert.doesNotMatch(twoFactor, /localStorage[^\n]*(secret|recovery)/i);
  assert.match(auth, /result\?\.two_factor_required === true/);
  assert.match(auth, /requestTwoFactorLogin/);
  assert.match(admin, /accountSecurityBtn/);
  assert.match(index, /auth\/03-two-factor\.js\?v=(?:20260903-(?:auth2fa(?:127|128)|auth-recovery129)|20260904-(?:self-recovery137|account-security138))/);
  assert.match(builder, /127_authenticator_app_2fa_and_ux_performance\.sql/);

  assert.match(messaging, /requestIdleCallback/);
  assert.match(messaging, /optimisticMarkAllNotificationsRead/);
  assert.match(messaging, /runNotificationMutationInBackground/);
  assert.match(push, /togglePending/);
  assert.match(push, /Keep important updates within reach/);
  assert.match(push, /Enable secure alerts/);
  assert.match(css, /v127 · Push consent theme certainty/);
  assert.match(css, /data-dashboard-view-section="expenses"/);
});

it("128 redesigns Account Settings, renders one TOTP QR, and removes recoverable Admin credentials", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(path.join(projectRoot, "migrations", "128_account_settings_and_nonrecoverable_credentials.sql"), "utf8");
  const twoFactor = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/03-two-factor.js"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "Assets/app/admin/01-admin.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");

  assert.match(twoFactor, /qrcodejs may append both a canvas and an image representation/);
  assert.match(twoFactor, /images\.forEach\(img => img\.remove\(\)\)/);
  assert.match(twoFactor, /openTwoFactorManagement/);
  assert.match(twoFactor, /openTwoFactorReplacement/);
  assert.match(twoFactor, /app_two_factor_begin_replacement/);
  assert.match(twoFactor, /refreshAccountTwoFactorSummary/);
  assert.match(admin, /account-settings-overview/);
  assert.match(admin, /openAccountProfileEditModal/);
  assert.match(admin, /openAccountCompanyEditModal/);
  assert.match(admin, /openAccountPasswordChangeModal/);
  assert.match(admin, /accountSecurityBtn/);
  assert.doesNotMatch(admin, /data-admin-action="view_credentials"/);
  assert.doesNotMatch(admin, /#adminEditPassword/);
  assert.doesNotMatch(admin, /Shown to administrators only when revealed/);
  assert.match(admin, /authentication credential as a one-way hash/);
  assert.match(admin, /Recoverable passwords and Smart PINs are never embedded/);

  assert.match(migration, /update public\.app_users[\s\S]*admin_visible_password=null[\s\S]*admin_visible_smart_pin=null/i);
  assert.match(migration, /update public\.app_admin_credential_vault[\s\S]*password_cipher=null[\s\S]*smart_pin_cipher=null/i);
  assert.match(migration, /credential_viewing_disabled',true/i);
  assert.match(migration, /app_two_factor_begin_replacement/i);
  assert.match(migration, /public\.app_user_public_profile\(u, false\)[\s\S]*- 'smart_pin_hash'/i);
  assert.doesNotMatch(migration, /'smart_pin_hash',\s*coalesce\(u\.smart_pin_hash/i);
  assert.doesNotMatch(migration, /'password'\s*,\s*pw/i);
  assert.match(migration, /'password_hash',admin\.password_hash/i);
  assert.doesNotMatch(migration, /'admin_visible_password',\s*coalesce\(admin\.admin_visible_password/i);
  assert.match(builder, /128_account_settings_and_nonrecoverable_credentials\.sql/);
  assert.match(index, /auth\/03-two-factor\.js\?v=(?:20260903-(?:auth2fa128|auth-recovery129)|20260904-(?:self-recovery137|account-security138))/);
  assert.match(index, /01-admin\.js\?v=(?:20260903-(?:account-security128|recovery129)|20260904-(?:self-recovery137|account-security138|reliability139))/);
  assert.match(index, /auth\/01-auth-session\.js\?v=(?:20260903-(?:credential-privacy128|auth-recovery129)|20260904-(?:account-security138|authsurface140)|20260905-audio141)/);
  assert.match(index, /notes\/01-notes\.js\?v=(?:20260903-credential-privacy128|20260905-audio141)/);
  assert.match(css, /v128 · Account Settings hierarchy \+ credential privacy polish/);
  assert.match(css, /account-settings-edit-icon/);
  assert.match(css, /account-settings-action-row/);
});

it("129 adds Authenticator recovery, protected Admin temporary passwords, and responsive/SEO polish without installation-time user mutation", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(path.join(projectRoot, "migrations", "129_authenticator_recovery_admin_temp_password_and_experience.sql"), "utf8");
  const twoFactor = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/03-two-factor.js"), "utf8");
  const authSession = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/01-auth-session.js"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "Assets/app/admin/01-admin.js"), "utf8");
  const signup = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/02-auth-welcome-trial.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const sitemap = fs.readFileSync(path.join(projectRoot, "sitemap.xml"), "utf8");
  const llms = fs.readFileSync(path.join(projectRoot, "llms.txt"), "utf8");
  const seo = fs.readFileSync(path.join(projectRoot, "seo", "security-and-support.html"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");
  const installOnly = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/--.*$/gm, "");

  assert.match(migration, /create table if not exists public\.app_password_recovery_challenges/i);
  assert.match(migration, /create table if not exists public\.app_admin_password_recovery_audit/i);
  assert.match(migration, /temporary_password_expires_at/i);
  assert.match(migration, /temporary_password_used_at/i);
  assert.match(migration, /app_password_recovery_begin/i);
  assert.match(migration, /app_password_recovery_complete/i);
  assert.match(migration, /app_two_factor_verify_user_code\(u\.id,p_code,true\)/i);
  assert.match(migration, /app_two_factor_recover_smart_pin/i);
  assert.match(migration, /app_admin_create_temporary_password/i);
  assert.match(migration, /lower\(trim\(p_email\)\)/i);
  assert.match(migration, /regexp_replace\(coalesce\(p_mobile/i);
  assert.match(migration, /must_change_password=true/i);
  assert.match(migration, /temporary_password_expires_at=now\(\)\+interval '24 hours'/i);
  assert.match(migration, /update public\.app_sessions set revoked_at=now\(\)/i);
  assert.match(migration, /target\.is_protected/i);
  assert.match(migration, /temporary_password',temp_password/i);
  assert.doesNotMatch(installOnly, /\bupdate\s+public\.(app_users|app_sessions|wallets|expenses|goods_items|loans|assets|app_inquiries|app_inquiry_messages)\b/i);
  assert.doesNotMatch(installOnly, /\btruncate\b|\bdrop\s+table\b|\bdrop\s+column\b/i);

  assert.match(twoFactor, /openPasswordRecovery/);
  assert.match(twoFactor, /app_password_recovery_complete/);
  assert.match(twoFactor, /requestSmartPinTwoFactorRecovery/);
  assert.match(twoFactor, /Recovery code/);
  assert.match(authSession, /app_two_factor_status/);
  assert.match(authSession, /requestSmartPinTwoFactorRecovery/);
  assert.match(authSession, /Legacy recovery is retained only for accounts that have not enabled 2FA/);
  assert.match(admin, /adminPasswordRecoveryBtn/);
  assert.match(admin, /app_admin_create_temporary_password/);
  assert.match(admin, /No existing password is revealed/);
  assert.match(admin, /shown once/i);
  assert.match(index, /id="forgotPasswordBtn"/);
  assert.match(index, /Passwords and Smart PINs are never visible to administrators/);
  assert.doesNotMatch(index, /Credentials stay locked — tap the lock icon to reveal/);

  assert.match(css, /\.admin-user-tile-logo\{[\s\S]*?object-fit:cover!important[\s\S]*?clip-path:circle/);
  assert.match(css, /#accountSettingsModal \.account-settings-overview\{width:calc\(100vw - 30px\)!important/);
  assert.match(css, /\.landing-live-chat-launcher\{width:50px!important;height:50px!important/);
  assert.match(css, /@media\(min-width:821px\)\{#trialSignupModal \.signup-v2-dialog\{width:min\(980px/);
  assert.match(signup, /signup-v2-value-strip/);
  assert.match(signup, /Authenticator 2FA/);

  assert.match(seo, /Authenticator App 2FA/);
  assert.match(seo, /Web Push notifications/);
  assert.match(seo, /AI-to-Agent|AI to Agent/);
  assert.match(seo, /private in-app support messaging/i);
  assert.match(sitemap, /seo\/security-and-support\.html/);
  assert.match(llms, /Security, 2FA, notifications and support/);
  assert.match(builder, /129_authenticator_recovery_admin_temp_password_and_experience\.sql/);
});


it("130 adds zero-cost self-service password recovery without mutating existing accounts", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(path.join(projectRoot, "migrations", "130_self_service_password_recovery_passkey_key_trusted_device.sql"), "utf8");
  const recovery = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/04-account-recovery.js"), "utf8");
  const twoFactor = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/03-two-factor.js"), "utf8");
  const signup = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/02-auth-welcome-trial.js"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "Assets/app/admin/01-admin.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");
  const installOnly = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/\$do\$[\s\S]*?\$do\$/g, "").replace(/--.*$/gm, "");

  assert.match(migration, /create table if not exists public\.app_account_recovery_keys/i);
  assert.match(migration, /create table if not exists public\.app_account_recovery_passkeys/i);
  assert.match(migration, /create table if not exists public\.app_account_recovery_trusted_devices/i);
  assert.match(migration, /create table if not exists public\.app_account_self_recovery_challenges/i);
  assert.match(migration, /create table if not exists public\.app_account_recovery_device_requests/i);
  assert.match(migration, /create table if not exists public\.app_account_recovery_audit/i);
  assert.match(migration, /app_account_recovery_new_key/i);
  assert.match(migration, /gen_random_bytes\(20\)/i);
  assert.match(migration, /app_account_recovery_key_hash/i);
  assert.match(migration, /app_account_recovery_passkey_upsert/i);
  assert.match(migration, /app_account_recovery_trust_device/i);
  assert.match(migration, /app_account_self_recovery_begin/i);
  assert.match(migration, /app_request_network_fingerprint\(null\)/i);
  assert.match(migration, /app_login_throttle_scope_key\('account','recovery:'\|\|normalized_username\)/i);
  assert.match(migration, /app_login_throttle_scope_key\('network','recovery:'\|\|network_fp\)/i);
  assert.doesNotMatch(migration, /update public\.app_account_recovery_device_requests set status='denied'[\s\S]{0,180}status='pending' and expires_at>now\(\)/i);
  assert.match(migration, /app_account_self_recovery_complete_key/i);
  assert.match(migration, /app_account_self_recovery_complete_passkey/i);
  assert.match(migration, /app_account_self_recovery_complete_device/i);
  assert.match(migration, /update public\.app_sessions set revoked_at=now\(\) where user_id=p_user_id/i);
  assert.match(migration, /for all to anon, authenticated using \(false\) with check \(false\)/i);
  assert.match(migration, /fail_count integer not null default 0/i);
  assert.match(migration, /locked_until timestamptz/i);
  assert.doesNotMatch(installOnly, /\b(update|delete|truncate)\s+public\.(app_users|app_sessions|expense_entries|expense_accounts|goods_items|loans|app_assets|app_inquiries|app_inquiry_messages)\b/i);
  assert.doesNotMatch(installOnly, /\bdrop\s+(table|column)\b/i);

  assert.match(recovery, /Recover with 2FA/);
  assert.match(recovery, /Recover with Passkey/);
  assert.match(recovery, /Recover with Recovery Key/);
  assert.match(recovery, /Approve from another signed-in device/);
  assert.match(recovery, /Contact Administrator/);
  assert.match(recovery, /PublicKeyCredential/);
  assert.match(recovery, /extensions:\s*\{\s*prf:/);
  assert.match(recovery, /app_account_self_recovery_begin/);
  assert.match(recovery, /app_account_recovery_key_generate/);
  assert.match(recovery, /app_account_recovery_pending_device_requests/);
  assert.match(recovery, /recoveryDevicePrefix/);
  assert.doesNotMatch(recovery, /localStorage\.setItem\([^\n]*(recovery[_-]?key|prf)/i);
  assert.match(twoFactor, /openTwoFactorPasswordRecovery/);
  assert.match(twoFactor, /openUnifiedPasswordRecovery/);
  assert.doesNotMatch(twoFactor, /Add a free authenticator app as a second sign-in factor[\s\S]{0,160}refreshAccountTwoFactorSummary\(\)/);
  assert.match(twoFactor, /refreshAccountRecoverySummary/);

  assert.match(admin, /id="accountSecurityBtn"/);
  assert.match(admin, /refreshAccountSecuritySummary/);
  assert.match(signup, /id="trialRecoverySetup"/);
  assert.match(signup, /openPostSignupRecoverySetup/);
  assert.match(css, /26-account-recovery\.css/);
  assert.match(css, /#unifiedPasswordRecoveryModal\.modal/);
  assert.match(css, /#twoFactorManagementModal\.modal\{z-index:2147483642!important\}/);
  assert.match(recovery, /Project-owner fallback/);
  assert.match(index, /auth\/04-account-recovery\.js\?v=20260904-(?:self-recovery137|reliability139)/);
  assert.ok(index.indexOf("auth/03-two-factor.js") < index.indexOf("auth/04-account-recovery.js"));
  assert.ok(index.indexOf("auth/04-account-recovery.js") < index.indexOf("auth/02-auth-welcome-trial.js"));
  assert.match(builder, /130_self_service_password_recovery_passkey_key_trusted_device\.sql/);
});


it("131 adds verified recovery identity, trusted 2FA browsers, biometric quick sign-in, Smart PIN integration, and device history", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(path.join(projectRoot, "migrations", "131_account_security_quick_signin_devices.sql"), "utf8");
  const security = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/05-account-security.js"), "utf8");
  const recovery = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/04-account-recovery.js"), "utf8");
  const auth = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/02-auth-welcome-trial.js"), "utf8");
  const twoFactor = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/03-two-factor.js"), "utf8");
  const smartPin = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/01-auth-session.js"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "Assets/app/admin/01-admin.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts", "build_full_schema_sql.js"), "utf8");
  const installOnly = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/\$do\$[\s\S]*?\$do\$/g, "").replace(/--.*$/gm, "");

  assert.match(migration, /identity_verified_at timestamptz/i);
  assert.match(migration, /app_account_self_recovery_identity_verify/i);
  assert.match(migration, /p_username text,p_email text,p_mobile text,p_full_name text/i);
  assert.match(migration, /app_account_self_recovery_complete_key_v2/i);
  assert.match(migration, /app_account_self_recovery_complete_passkey_v2/i);
  assert.match(migration, /app_account_self_recovery_complete_two_factor_v2/i);
  assert.match(migration, /app_account_self_recovery_device_begin_v2/i);
  assert.match(migration, /create table if not exists public\.app_two_factor_trusted_devices/i);
  assert.match(migration, /app_two_factor_complete_trusted_login/i);
  assert.match(migration, /trg_revoke_two_factor_trusted_on_password_change/i);
  assert.match(migration, /create table if not exists public\.app_biometric_auth_challenges/i);
  assert.match(migration, /app_biometric_quick_signin_complete/i);
  assert.match(migration, /app_biometric_workspace_complete/i);
  assert.match(migration, /app_account_security_sessions/i);
  assert.match(migration, /app_account_security_revoke_session/i);
  assert.match(migration, /auth_method text not null default 'password'/i);
  assert.doesNotMatch(installOnly, /\b(update|delete|truncate)\s+public\.(app_users|app_sessions|expense_entries|expense_accounts|goods_items|loans|app_assets|app_inquiries|app_inquiry_messages)\b/i);
  assert.doesNotMatch(installOnly, /\bdrop\s+(table|column)\b/i);

  assert.match(security, /Verify registered details/);
  assert.match(security, /p_full_name:full/);
  assert.match(security, /only recovery methods already configured/i);
  assert.match(security, /attemptTrustedTwoFactorLogin/);
  assert.match(security, /Trust this browser/);
  assert.match(security, /performBiometricQuickSignIn/);
  assert.match(security, /tryBiometricWorkspaceUnlock/);
  assert.match(security, /Logged-in devices/);
  assert.match(security, /Login history/);
  assert.match(security, /app_account_recovery_pending_device_requests/);
  assert.match(recovery, /createPasskeyProof: createPasskeyRecoveryProof/);
  assert.match(twoFactor, /twoFactorTrustBrowser/);
  assert.match(auth, /attemptTrustedTwoFactorLogin/);
  assert.match(auth, /tryBiometricWorkspaceUnlock/);
  assert.match(smartPin, /TriplemSmartPinSecurity/);
  assert.match(admin, /Account Security/);
  assert.match(admin, /accountSecurityBtn/);
  assert.match(css, /Triplem VIP unified Account Security v138/);
  assert.match(index, /auth\/05-account-security\.js\?v=(?:20260904-(?:account-security138|reliability139|authsurface140)|20260905-webauthn141)/);
  assert.ok(index.indexOf("auth/04-account-recovery.js") < index.indexOf("auth/05-account-security.js"));
  assert.ok(index.indexOf("auth/05-account-security.js") < index.indexOf("auth/02-auth-welcome-trial.js"));
  assert.match(builder, /131_account_security_quick_signin_devices\.sql/);
});

it("132 hardens trusted-browser recovery, Account Security stacking, Assets menus, keyboard parity, and Inventory themes", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(path.join(projectRoot, "migrations", "132_account_security_recovery_ui_reliability.sql"), "utf8");
  const security = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/05-account-security.js"), "utf8");
  const recovery = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/04-account-recovery.js"), "utf8");
  const welcome = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/02-auth-welcome-trial.js"), "utf8");
  const admin = fs.readFileSync(path.join(projectRoot, "Assets/app/admin/01-admin.js"), "utf8");
  const assets = fs.readFileSync(path.join(projectRoot, "Assets/app/assets/01-assets.js"), "utf8");
  const messaging = fs.readFileSync(path.join(projectRoot, "Assets/app/messaging/01-messaging.js"), "utf8");
  const push = fs.readFileSync(path.join(projectRoot, "Assets/app/notifications/01-web-push.js"), "utf8");
  const edge = fs.readFileSync(path.join(projectRoot, "supabase/functions/push-notifications/index.ts"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");
  const installOnly = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/\$do\$[\s\S]*?\$do\$/g, "").replace(/--.*$/gm, "");

  assert.match(migration, /push_dispatch_count integer not null default 0/i);
  assert.match(migration, /interval '15 minutes'/i);
  assert.match(migration, /security_recovery_approval/i);
  assert.match(migration, /app_push_service_security_recovery_dispatch/i);
  assert.match(migration, /grant execute on function public\.app_push_service_security_recovery_dispatch\(text\) to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.app_push_service_security_recovery_dispatch\(text\) to (?:anon|authenticated)/i);
  assert.doesNotMatch(installOnly, /\b(update|delete|truncate)\s+public\.(app_users|app_sessions|expense_entries|expense_accounts|goods_items|loans|app_assets|app_inquiries|app_inquiry_messages)\b/i);
  assert.doesNotMatch(installOnly, /\bdrop\s+(table|column)\b/i);

  assert.match(security, /requestSecurityRecoveryPush/);
  assert.match(security, /Number\.isFinite\(expiresMs\)/);
  assert.match(security, /openTrustedRecoveryApprovalById/);
  assert.match(security, /currentFullyTrusted/);
  assert.match(security, /This browser is trusted/);
  assert.doesNotMatch(security, /fa-laptop-shield|fa-dial/);
  assert.match(recovery, /This browser is trusted/);
  assert.match(recovery, /const existing = readLocalRecoveryDevice\(\)/);

  assert.match(welcome, /submitForcedPassword/);
  assert.match(welcome, /event\.key === "Enter"/);
  assert.match(admin, /submitAccountPasswordChange/);
  assert.match(admin, /event\.key === "Enter"/);

  assert.match(assets, /assetUi\.bound/);
  assert.match(assets, /asset-card-dropdown-portal/);
  assert.match(assets, /DOMContentLoaded", assetsBindUI/);
  assert.match(messaging, /security_recovery_approval/);
  assert.match(messaging, /openTrustedRecoveryApprovalById/);
  assert.match(push, /requestSecurityRecoveryPush/);
  assert.match(push, /security_recovery_request/);
  assert.match(edge, /action === "security_recovery_request"/);
  assert.match(edge, /app_push_service_security_recovery_dispatch/);

  assert.match(css, /28-security-assets-inventory-reliability\.css/);
  assert.match(css, /#accountSecurityCenterModal\.account-security-center-modal\.modal\{z-index:2147483300!important\}/);
  assert.match(css, /asset-card-dropdown\.asset-card-dropdown-portal/);
  assert.match(css, /inventory-brand-card/);
  assert.match(css, /scrollbar-width:none!important/);
  assert.match(index, /reliability139/);
  assert.match(builder, /132_account_security_recovery_ui_reliability\.sql/);
});


it("140 unifies recovery and Smart PIN inside sign-in, embeds password eyes, fixes Assets binding, and stabilizes Account Security layout", () => {
  const projectRoot = path.join(__dirname, "..");
  const ui = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/06-auth-ui.js"), "utf8");
  const security = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/05-account-security.js"), "utf8");
  const session = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/01-auth-session.js"), "utf8");
  const landing = fs.readFileSync(path.join(projectRoot, "Assets/app/landing/01-landing.js"), "utf8");
  const assets = fs.readFileSync(path.join(projectRoot, "Assets/app/assets/01-assets.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const sourceCss = fs.readFileSync(path.join(projectRoot, "Assets/style/29-auth-surface-security-assets.css"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

  assert.match(ui, /window\.TriplemAuthSurface/);
  assert.match(ui, /beginRecovery/);
  assert.match(ui, /beginSmartPin/);
  assert.match(ui, /--triplem-auth-panel-height/);
  assert.match(ui, /MutationObserver/);
  assert.match(ui, /triplem-password-eye/);
  assert.match(security, /TriplemAuthSurface\?\.beginRecovery/);
  assert.match(security, /TriplemAuthSurface\.recoveryShell/);
  assert.match(session, /TriplemAuthSurface\?\.beginSmartPin/);
  assert.match(landing, /TriplemAuthSurface\?\.cancelActive/);

  assert.match(assets, /function bindRenderedAssetCardInteractions/);
  assert.match(assets, /bindRenderedAssetCardInteractions\(listEl\)/);
  assert.match(assets, /root\.querySelectorAll\("\[data-asset-menu-trigger\]"\)/);
  assert.match(assets, /card\.onclick = event/);

  assert.match(sourceCss, /#accountSecurityCenterModal \.account-security-dialog/);
  assert.match(sourceCss, /width:min\(650px,calc\(100vw - 32px\)\)/);
  assert.match(sourceCss, /scrollbar-width:none!important/);
  assert.match(sourceCss, /width:calc\(100vw - 30px\)!important/);
  assert.match(sourceCss, /\.smart-pin-security-actions \.btn/);
  assert.match(sourceCss, /\.triplem-password-eye/);
  assert.match(css, /Triplem VIP Build 140/);
  assert.match(index, /auth\/06-auth-ui\.js\?v=20260904-authsurface140/);
  assert.match(index, /assets\/01-assets\.js\?v=20260904-assets140/);
  assert.match(index, /authsurface=20260904-v140/);
});

it("133 uses standard WebAuthn for cross-platform biometric sign-in and never primes alert audio on login", () => {
  const projectRoot = path.join(__dirname, "..");
  const migration = fs.readFileSync(path.join(projectRoot, "migrations", "133_standard_webauthn_quick_signin.sql"), "utf8");
  const security = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/05-account-security.js"), "utf8");
  const messaging = fs.readFileSync(path.join(projectRoot, "Assets/app/messaging/01-messaging.js"), "utf8");
  const notes = fs.readFileSync(path.join(projectRoot, "Assets/app/notes/01-notes.js"), "utf8");
  const authSession = fs.readFileSync(path.join(projectRoot, "Assets/app/auth/01-auth-session.js"), "utf8");
  const edge = fs.readFileSync(path.join(projectRoot, "supabase/functions/account-security-webauthn/index.ts"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts/build_full_schema_sql.js"), "utf8");
  const installOnly = migration.replace(/\$fn\$[\s\S]*?\$fn\$/g, "").replace(/\$do\$[\s\S]*?\$do\$/g, "").replace(/--.*$/gm, "");

  assert.match(migration, /create table if not exists public\.app_account_security_passkeys/i);
  assert.match(migration, /create table if not exists public\.app_account_security_webauthn_challenges/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /app_account_security_set_standard_biometric_preferences/i);
  assert.match(migration, /app_account_security_webauthn_issue_session/i);
  assert.match(migration, /revoke all on function public\.app_biometric_quick_signin_complete/i);
  assert.doesNotMatch(installOnly, /\b(update|delete|truncate)\s+public\.(app_users|app_sessions|expense_entries|expense_accounts|goods_items|loans|app_assets|app_inquiries|app_inquiry_messages)\b/i);
  assert.doesNotMatch(installOnly, /\bdrop\s+(table|column)\b/i);

  assert.match(security, /STANDARD_WEBAUTHN_FUNCTION = "account-security-webauthn"/);
  assert.match(security, /navigator\.credentials\.create/);
  assert.match(security, /pubKeyCredParams:\[\{type:"public-key",alg:-7\}\]/);
  assert.match(security, /navigator\.credentials\.get/);
  assert.match(security, /app_account_security_set_standard_biometric_preferences/);
  assert.match(security, /Turning on Quick Sign-In or biometric Smart PIN verification will securely create a standard device passkey first/);
  assert.doesNotMatch(security, /securityQuickToggle[^\n]+disabled/);
  assert.doesNotMatch(security, /securityPinBypassToggle[^\n]+disabled/);

  assert.match(edge, /webauthn\.create/);
  assert.match(edge, /webauthn\.get/);
  assert.match(edge, /Biometric or device verification is required/);
  assert.match(edge, /crypto\.subtle\.verify/);
  assert.match(edge, /app_account_security_webauthn_issue_session/);
  assert.match(edge, /quick-signin-complete/);
  assert.match(edge, /workspace-complete/);
  assert.match(edge, /This passkey is already registered to another account/);

  assert.doesNotMatch(messaging, /audio\.muted\s*=\s*true/);
  assert.match(messaging, /Only after a real pending offer was blocked/);
  assert.doesNotMatch(notes, /audio\.muted\s*=\s*true/);
  assert.doesNotMatch(authSession, /ensureReminderAlertAudioUnlocked\s*\(\s*\)/, "auth-session does not prime reminder audio");
  assert.match(notes, /remain deliberately inert until/);
  assert.match(index, /auth\/01-auth-session\.js\?v=20260905-audio141/);
  assert.match(index, /auth\/05-account-security\.js\?v=20260905-webauthn141/);
  assert.match(index, /notes\/01-notes\.js\?v=20260905-audio141/);
  assert.match(index, /messaging\/01-messaging\.js\?v=20260905-audio141/);
  assert.match(builder, /133_standard_webauthn_quick_signin\.sql/);
});


it("142 stabilizes mobile Expenses custom dates and themes the Inventory category overlay without database changes", () => {
  const projectRoot = path.join(__dirname, "..");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/app.bundle.css"), "utf8");
  const sourceCss = fs.readFileSync(path.join(projectRoot, "Assets/style/30-expenses-inventory-mobile-polish.css"), "utf8");
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const builder = fs.readFileSync(path.join(projectRoot, "scripts", "optimize-homepage-seo.js"), "utf8");

  assert.match(sourceCss, /#expensesPanel \.compact-filter-main\{/);
  assert.match(sourceCss, /grid-template-columns:minmax\(0,1fr\) minmax\(104px,118px\)/);
  assert.match(sourceCss, /#expensesPanel \.expense-date-custom-range\{/);
  assert.match(sourceCss, /grid-column:1 \/ -1!important/);
  assert.match(sourceCss, /#inventorySectionModal \.inventory-section-modal-dialog/);
  assert.match(sourceCss, /#inventorySectionModal :is\([\s\S]*\.inventory-brand-row/);
  assert.match(sourceCss, /background:var\(--surface-elevated\)!important/);
  assert.match(css, /30-expenses-inventory-mobile-polish\.css/);
  assert.match(index, /mobilepolish=20260905-v142/);
  assert.match(builder, /30-expenses-inventory-mobile-polish\.css/);

  const migrations = fs.readdirSync(path.join(projectRoot, "migrations")).filter(name => /^\d+.*\.sql$/i.test(name));
  assert.ok(migrations.includes("133_standard_webauthn_quick_signin.sql"));
  assert.ok(!migrations.some(name => /^134[_-]/i.test(name)), "Build 142 is frontend-only and adds no migration 134");
});
