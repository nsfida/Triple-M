/**
 * Pure admin backup JSON/CSV canonicalize + round-trip helpers (browser + Node).
 * Shape matches app_admin_export_full_backup / app_admin_import_full_backup.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.TripleMAdminBackup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ADMIN_BACKUP_FORMAT = "triple-m-admin-backup";
  const ADMIN_BACKUP_VERSION = 1;

  /** Keep in sync with the latest app_admin_backup_table_list() migration. */
  const ADMIN_BACKUP_EXPECTED_TABLES = [
    "app_organizations",
    "app_users",
    "app_permissions",
    "app_team_permissions",
    "loan_ledger_entries",
    "loans",
    "loan_payments",
    "installment_plans",
    "installment_payments",
    "goods_category_config",
    "goods_brands",
    "goods_sub_brands",
    "goods_product_lines",
    "goods_brand_variants",
    "goods_items",
    "goods_sales",
    "goods_events",
    "goods_item_barcodes",
    "expense_accounts",
    "expense_topups",
    "expense_entries",
    "expense_transfers",
    "bitcoin_wallets",
    "app_notes",
    "app_user_notifications",
    "app_note_reminders",
    "app_user_prefs",
    "app_installment_due_notices",
    "app_assets",
    "app_asset_transactions",
    "depreciation_assets",
    "depreciation_history",
    "depreciation_usage_entries",
    "app_inquiries",
    "app_inquiry_messages",
    "app_admin_notifications",
    "app_access_extensions",
    "app_plan_renewal_requests",
    "app_activity_log"
  ];

  function csvEscape(value) {
    const str = String(value ?? "");
    if (!/[",\n\r]/.test(str)) return str;
    return `"${str.replace(/"/g, '""')}"`;
  }

  function canonicalizeAdminBackupPayload(raw, options = {}) {
    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid backup file.");
    }
    if (raw.format !== ADMIN_BACKUP_FORMAT) {
      throw new Error(`Unsupported backup format (expected ${ADMIN_BACKUP_FORMAT}).`);
    }
    const version = Number(raw.version || 0);
    if (!Number.isFinite(version) || version < 1) {
      throw new Error("Unsupported backup version.");
    }
    if (!raw.tables || typeof raw.tables !== "object" || Array.isArray(raw.tables)) {
      throw new Error("Backup is missing the tables object.");
    }
    if (!Array.isArray(raw.tables.app_users)) {
      throw new Error("Backup must include tables.app_users.");
    }

    const tables = {};
    for (const [name, rows] of Object.entries(raw.tables)) {
      const key = String(name || "").trim().toLowerCase();
      if (!/^[a-z][a-z0-9_]*$/.test(key)) continue;
      tables[key] = Array.isArray(rows) ? rows : [];
    }
    if (!Array.isArray(tables.app_users)) {
      throw new Error("Backup must include tables.app_users.");
    }

    const tableOrder =
      Array.isArray(raw.tableOrder) && raw.tableOrder.length
        ? raw.tableOrder
            .map((n) => String(n || "").trim().toLowerCase())
            .filter((n) => Object.prototype.hasOwnProperty.call(tables, n))
        : Object.keys(tables);
    for (const name of Object.keys(tables)) {
      if (!tableOrder.includes(name)) tableOrder.push(name);
    }

    const counts = {};
    for (const name of tableOrder) {
      counts[name] = Array.isArray(tables[name]) ? tables[name].length : 0;
    }

    const out = {
      format: ADMIN_BACKUP_FORMAT,
      version: version || ADMIN_BACKUP_VERSION,
      exportedAt: raw.exportedAt || new Date().toISOString(),
      tableOrder,
      counts,
      tables,
    };
    if (raw.exportedBy && typeof raw.exportedBy === "object") out.exportedBy = raw.exportedBy;
    if (Array.isArray(raw.excluded)) out.excluded = raw.excluded;
    if (Array.isArray(raw.notes)) out.notes = raw.notes;
    if (options.source) out.source = options.source;
    return out;
  }

  function adminBackupCsvEncodeCell(val) {
    if (val === null || val === undefined) return "";
    if (typeof val === "boolean") return val ? "true" : "false";
    if (typeof val === "number" && Number.isFinite(val)) return String(val);
    if (typeof val === "object") return csvEscape(JSON.stringify(val));
    const s = String(val);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return `"=""${s.replace(/"/g, "")}"""`;
    }
    return csvEscape(s);
  }

  function adminBackupCsvDecodeCell(value) {
    let v = String(value ?? "");
    const excel = v.match(/^=\s*"([\s\S]*)"\s*$/);
    if (excel) v = excel[1];
    else {
      const excelSq = v.match(/^=\s*'([\s\S]*)'\s*$/);
      if (excelSq) v = excelSq[1];
      else if (v.startsWith("'")) v = v.slice(1);
    }
    if (v === "") return null;
    if (v === "true") return true;
    if (v === "false") return false;
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return Number(v);
    if (
      (v.startsWith("{") && v.endsWith("}")) ||
      (v.startsWith("[") && v.endsWith("]"))
    ) {
      try {
        return JSON.parse(v);
      } catch {
        /* keep string */
      }
    }
    return v;
  }

  function adminBackupTableColumnOrder(rows) {
    const cols = [];
    const seen = new Set();
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      for (const key of Object.keys(row)) {
        if (seen.has(key)) continue;
        seen.add(key);
        cols.push(key);
      }
    }
    return cols;
  }

  function adminBackupTablesToCsv(payload) {
    const canonical = canonicalizeAdminBackupPayload(payload);
    const tables = canonical.tables;
    const order = canonical.tableOrder;
    const lines = [
      `# format=${canonical.format}`,
      `# version=${canonical.version}`,
      `# exportedAt=${canonical.exportedAt}`,
      `# tableOrder=${order.join(",")}`,
      `# multi-section CSV: each ###TABLE:name block is one table (Upload Backup expects this exact layout)`,
    ];
    for (const name of order) {
      const rows = Array.isArray(tables[name]) ? tables[name] : [];
      lines.push(`###TABLE:${name}`);
      if (!rows.length) {
        lines.push("# empty");
        continue;
      }
      const cols = adminBackupTableColumnOrder(rows);
      lines.push(cols.map(csvEscape).join(","));
      for (const row of rows) {
        lines.push(cols.map((col) => adminBackupCsvEncodeCell(row?.[col])).join(","));
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  function parseAdminBackupCsv(text) {
    const raw = String(text || "").replace(/^\uFEFF/, "");
    const lines = raw.split(/\r?\n/);
    const tables = {};
    let current = null;
    let cols = null;
    const tableOrder = [];
    let format = null;
    let version = null;
    let exportedAt = null;
    let headerTableOrder = null;

    const parseLine = (line) => {
      const out = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"') {
            if (line[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            cur += ch;
          }
        } else if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          out.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      return out;
    };

    const ensureTable = (name) => {
      const key = String(name || "").trim().toLowerCase();
      if (!/^[a-z][a-z0-9_]*$/.test(key)) return null;
      if (!Object.prototype.hasOwnProperty.call(tables, key)) {
        tables[key] = [];
        tableOrder.push(key);
      }
      return key;
    };

    for (const rawLine of lines) {
      let line = String(rawLine ?? "").trim();
      if (!line) continue;
      if (line.length >= 2 && line.startsWith('"') && line.endsWith('"')) {
        line = line.slice(1, -1).replace(/""/g, '"').trim();
      }
      if (!line) continue;

      // Section markers must be checked before generic "#" comments
      // (###TABLE:… also starts with "#").
      const tableMatch = line.match(/^#{2,3}\s*TABLE\s*:\s*([a-z][a-z0-9_]*)\s*,?\s*$/i);
      if (tableMatch) {
        current = ensureTable(tableMatch[1]);
        cols = null;
        continue;
      }

      if (line.startsWith("#")) {
        const fmt = line.match(/^#\s*format\s*=\s*(.+)\s*$/i);
        if (fmt) {
          format = String(fmt[1] || "").trim();
          continue;
        }
        const ver = line.match(/^#\s*version\s*=\s*(\d+)\s*$/i);
        if (ver) {
          version = Number(ver[1]);
          continue;
        }
        const exp = line.match(/^#\s*exportedAt\s*=\s*(.+)\s*$/i);
        if (exp) {
          exportedAt = String(exp[1] || "").trim();
          continue;
        }
        const ord = line.match(/^#\s*tableOrder\s*=\s*(.+)\s*$/i);
        if (ord) {
          headerTableOrder = String(ord[1] || "")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter((s) => /^[a-z][a-z0-9_]*$/i.test(s));
          for (const name of headerTableOrder) ensureTable(name);
          continue;
        }
        // "# empty" (and other section comments) keep current table registered.
        continue;
      }

      if (!current) continue;
      const cells = parseLine(line);
      if (!cols) {
        cols = cells.map((c) => String(c || "").trim()).filter(Boolean);
        if (!cols.length) cols = null;
        continue;
      }
      if (cells.every((c) => String(c || "").trim() === "")) continue;
      const row = {};
      cols.forEach((col, idx) => {
        row[col] = adminBackupCsvDecodeCell(cells[idx]);
      });
      tables[current].push(row);
    }

    const finalOrder =
      Array.isArray(headerTableOrder) && headerTableOrder.length
        ? [
            ...headerTableOrder.filter((n) =>
              Object.prototype.hasOwnProperty.call(tables, n)
            ),
            ...tableOrder.filter((n) => !headerTableOrder.includes(n)),
          ]
        : tableOrder;

    if (
      !Object.prototype.hasOwnProperty.call(tables, "app_users") &&
      Array.isArray(headerTableOrder)
    ) {
      if (headerTableOrder.includes("app_users")) tables.app_users = [];
    }

    if (!format) {
      throw new Error(
        `CSV backup missing "# format=${ADMIN_BACKUP_FORMAT}" header. ` +
          "Use a file from Download Backup (CSV)."
      );
    }

    return canonicalizeAdminBackupPayload(
      {
        format,
        version: version == null ? ADMIN_BACKUP_VERSION : version,
        exportedAt: exportedAt || new Date().toISOString(),
        tableOrder: finalOrder,
        tables,
      },
      { source: "csv" }
    );
  }

  return {
    ADMIN_BACKUP_FORMAT,
    ADMIN_BACKUP_VERSION,
    ADMIN_BACKUP_EXPECTED_TABLES,
    csvEscape,
    canonicalizeAdminBackupPayload,
    adminBackupCsvEncodeCell,
    adminBackupCsvDecodeCell,
    adminBackupTableColumnOrder,
    adminBackupTablesToCsv,
    parseAdminBackupCsv,
  };
});
