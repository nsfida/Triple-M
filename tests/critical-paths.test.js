"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const tax = require(path.join(__dirname, "..", "Assets", "app", "lib", "tax-math.js"));
const loan = require(path.join(__dirname, "..", "Assets", "app", "lib", "loan-math.js"));
const perms = require(path.join(__dirname, "..", "Assets", "app", "lib", "permissions.js"));
const backup = require(path.join(__dirname, "..", "Assets", "app", "lib", "admin-backup.js"));
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

  it("guest cannot access admin_panel or pdf_export", () => {
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
    assert.match(result.sql, /app_admin_export_full_backup/);
    assert.match(result.sql, /app_admin_import_full_backup/);
    assert.ok(result.sql.length > 50_000);
  });
});
