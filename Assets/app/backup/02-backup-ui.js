/* Triplem VIP - Backup & Restore window (Account menu > Backup & Restore).
 *
 * Uses TriplemBackupEngine (01-backup-engine.js) and the migration-205 server
 * functions. Nothing is added to the account until the user has reviewed the
 * preview and confirmed; existing records are never changed.
 */
(() => {
  "use strict";
  if (window.TriplemBackup) return;

  const FFLATE_URL = "Assets/app/lib/fflate-0.8.2.min.js?v=0.8.2";
  const PAGE = 50;
  const LAST_KEY = "triplem-last-backup-v1:";

  const SECTIONS = {
    expenses: ["Expenses & wallets", "fa-wallet"],
    loans: ["Loans", "fa-hand-holding-dollar"],
    installments: ["Installments", "fa-calendar-check"],
    inventory: ["Inventory", "fa-boxes-stacked"],
    inventory_v2: ["Inventory 2.0", "fa-cubes"],
    assets: ["Assets", "fa-building"],
    depreciation: ["Depreciation", "fa-chart-line"],
    notes: ["Notes & reminders", "fa-note-sticky"],
    bitcoin: ["Bitcoin wallets", "fa-bitcoin-sign"],
    accounting: ["Accounting", "fa-scale-balanced"],
    insurance: ["Insurance", "fa-shield-heart"],
    settings: ["Settings", "fa-sliders"],
    history: ["History (for reference)", "fa-clock-rotate-left"]
  };
  const TABLES = {
    expense_accounts: "Wallets", expense_entries: "Expenses", expense_topups: "Top-ups", expense_transfers: "Transfers",
    loans: "Loans", loan_payments: "Loan payments", loan_ledger_entries: "Loan ledger",
    installment_plans: "Installment plans", installment_payments: "Installment payments",
    goods_category_config: "Categories", goods_brands: "Brands", goods_sub_brands: "Sub-brands", goods_product_lines: "Product lines",
    goods_brand_variants: "Variants", goods_items: "Items", goods_item_barcodes: "Barcodes", goods_sales: "Sales", goods_events: "Stock movements",
    app_assets: "Assets", app_asset_transactions: "Asset transactions",
    depreciation_assets: "Depreciable assets", depreciation_history: "Depreciation history", depreciation_usage_entries: "Usage entries",
    app_notes: "Notes", app_note_reminders: "Reminders", bitcoin_wallets: "Watch wallets",
    accounting_accounts: "Chart of accounts", accounting_contacts: "Customers & suppliers", accounting_dimensions: "Dimensions",
    accounting_tax_codes: "Tax codes", accounting_journals: "Journal entries", accounting_journal_lines: "Journal lines",
    accounting_documents: "Invoices & documents", accounting_document_lines: "Document lines", accounting_payments: "Payments",
    accounting_bank_transactions: "Bank transactions",
    insurance_companies: "Companies", insurance_customers: "Customers", insurance_referrers: "Referrers", insurance_policies: "Policies",
    insurance_sales: "Sales", insurance_temp_invoices: "Temporary invoices", insurance_customer_payments: "Customer payments",
    insurance_referral_payments: "Referral payments", insurance_commission_receipts: "Commission receipts",
    insurance_commission_allocations: "Commission allocations", insurance_commission_opening_balances: "Opening balances",
    insurance_commission_opening_allocations: "Opening allocations", insurance_policy_cancellations: "Cancellations",
    insurance_cancellation_refunds: "Refunds", insurance_commission_deductions: "Deductions",
    insurance_commission_deduction_allocations: "Deduction allocations", insurance_commission_deduction_settlements: "Deduction settlements",
    app_user_prefs: "Preferences", accounting_settings: "Accounting settings", accounting_counters: "Number sequences",
    expense_transaction_audit_events: "Expense audit trail", accounting_audit_log: "Accounting audit log", app_activity_log: "Activity log",
    app_triplem_ai_drafts: "AI drafts", app_triplem_ai_provenance: "AI history",
    inventory_v2_settings: "Inventory 2.0 settings", inventory_v2_units: "Units", inventory_v2_locations: "Shops & warehouses",
    inventory_v2_categories: "Categories", inventory_v2_brands: "Brands", inventory_v2_products: "Products",
    inventory_v2_variants: "Variants", inventory_v2_product_units: "Pack sizes", inventory_v2_barcodes: "Barcodes",
    inventory_v2_batches: "Batches & expiry", inventory_v2_serials: "Serial & IMEI numbers", inventory_v2_stock_movements: "Stock movements",
    inventory_v2_stock_balances: "Stock on hand", inventory_v2_cost_layers: "Cost layers", inventory_v2_client_operations: "Sync receipts",
    inventory_v2_customers: "Customers", inventory_v2_suppliers: "Suppliers", inventory_v2_counters: "Number sequences",
    inventory_v2_sales: "Sales & quotations", inventory_v2_sale_lines: "Sale lines", inventory_v2_purchases: "Purchases",
    inventory_v2_purchase_lines: "Purchase lines", inventory_v2_payments: "Payments", inventory_v2_payment_allocations: "Payment links",
    inventory_v2_postings: "Accounting postings", inventory_v2_sync_issues: "Offline review notes", inventory_v2_audit_log: "Inventory 2.0 activity"
  };
  const KEY_WORDS = { code: "account code", journal_no: "journal number", "doc_type, document_no": "document number", document_uuid: "document id",
    reference_no: "reference number", "lower(company_name)": "company name", customer_number: "customer number", barcode: "barcode",
    group_id: "internal group id", "lower(name)": "name", "lower(TRIM(BOTH FROM name))": "name", "lower(slug)": "category",
    pref_key: "setting", period_date: "period", sku: "SKU", serial_no: "serial / IMEI number", doc_no: "document number",
    "doc_key": "number sequence", client_op_id: "sync receipt", import_fingerprint: "bank statement line", sale_id: "sale", cancellation_id: "cancellation" };
  const WHY = {
    recycle_bin: "This record is in your Recycle Bin. Restore it from the Recycle Bin; the backup never overwrites it.",
    other_account: "This record id belongs to another account and cannot be restored here.",
    parent_deleted: "The record it belongs to is in your Recycle Bin. Restore that first from the Recycle Bin.",
    parent_missing: "The record it belongs to is missing and is not in this backup.",
    parent_conflict: "The record it belongs to cannot be restored.",
    parent_blocked: "The record it belongs to cannot be restored.",
    parent_failed: "The record it belongs to could not be restored.",
    parent: "The record it belongs to is missing.",
    part_of_existing: "It is part of a journal, document or asset that already exists. Adding it would change that existing record.",
    part_blocked: "One of its lines cannot be restored, so it cannot be restored completely.",
    signature: "This record was changed after the backup was made.",
    unreadable: "This record could not be read.",
    same_key: "Another record in your account already uses the same number or code."
  };
  const TITLE_KEYS = ["item_name", "account_name", "person_name", "journal_no", "document_no", "reference_no", "name", "label", "company_name", "customer_name", "policy_name", "content", "pref_key", "counter_key", "code", "barcode", "message", "tx_label", "description", "entry_kind", "payment_kind", "tx_type"];
  const DATE_KEYS = ["expense_date", "payment_date", "loan_date", "sold_date", "bought_date", "topup_date", "transfer_date", "tx_date", "event_date", "journal_date", "issue_date", "transaction_date", "period_date", "purchase_date", "account_date", "action_date", "remind_at", "created_at"];
  const AMOUNT_KEYS = ["amount", "payment_amount", "principal_amount", "total_amount", "total_sold_price", "total_actual_price", "action_amount", "sale_price", "gross_premium", "opening_balance", "debit", "credit", "depreciation_amount", "purchase_price", "net_amount"];
  const DESC_KEYS = ["notes", "description", "details", "expense_type", "direction", "status", "doc_type", "account_type", "item_category", "note_preview"];
  const HIDE_FIELDS = new Set(["owner_id", "meta", "item_meta", "details", "account_details", "created_by"]);

  const S = {
    view: "home", backup: null, model: null, fileName: "", abort: null, busy: false,
    query: "", filter: "all", open: new Set(), shown: new Map(), expanded: new Set(), includeSettings: false,
    result: null, lastError: ""
  };

  // ---- helpers ----------------------------------------------------------------------------
  const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const $ = (sel, root = document) => root.querySelector(sel);
  const st = () => { try { return typeof state !== "undefined" ? state : window.state; } catch (_) { return window.state; } };
  const fmtInt = n => Number(n || 0).toLocaleString();
  function userId() { return String(st()?.sessionUser?.id || ""); }
  function isOwner() {
    const s = st();
    if (!s?.unlocked || !s?.sessionUser || !s?.sessionToken) return false;
    try { if (typeof isGuestMode === "function" && isGuestMode()) return false; } catch (_) {}
    return !s.sessionUser.team_owner_id;
  }
  function loadFflate() {
    if (window.fflate && typeof window.fflate.zip === "function") return Promise.resolve(window.fflate);
    if (loadFflate.p) return loadFflate.p;
    loadFflate.p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = FFLATE_URL;
      s.async = true;
      s.onload = () => window.fflate ? resolve(window.fflate) : reject(new Error("ZIP component unavailable"));
      s.onerror = () => { loadFflate.p = null; reject(new Error("The backup component could not be loaded. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
    return loadFflate.p;
  }
  function storageBase() {
    try { const c = typeof getSupabaseConfig === "function" ? getSupabaseConfig() : null; return c && c.supabaseUrl ? c : null; } catch (_) { return null; }
  }
  const encodePath = p => String(p).split("/").map(encodeURIComponent).join("/");
  async function deps() {
    const fflate = await loadFflate();
    const cfg = storageBase();
    const uid = userId();
    return {
      fflate,
      rpc: (fn, args) => window.supabaseRpc(fn, args),
      currentUserId: uid,
      iconPack: async () => {
        const res = await fetch("Assets/inventory-v2/icons/icon-manifest.json", { cache: "no-store" }).catch(() => null);
        if (!res || !res.ok) return null;
        const j = await res.json().catch(() => null);
        return j ? { version: j.version, source: j.source } : null;
      },
      appVersion: String(document.documentElement.dataset.build || ""),
      platform: window.__TRIPLEM_DESKTOP__ ? "windows-app" : (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile-web" : "web"),
      fetchFile: async path => {
        if (!cfg) return { ok: false };
        const res = await fetch(`${cfg.supabaseUrl}/storage/v1/object/public/company-logos/${encodePath(path)}`, { cache: "no-store" });
        if (!res.ok) return { ok: false, status: res.status };
        return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()) };
      },
      fileExists: async path => {
        if (!cfg) return true;
        const res = await fetch(`${cfg.supabaseUrl}/storage/v1/object/public/company-logos/${encodePath(path)}`, { method: "HEAD", cache: "no-store" });
        return res.ok;
      },
      uploadFile: async (path, bytes, type) => {
        if (!cfg || !path.startsWith(uid + "/")) return false;
        const res = await fetch(`${cfg.supabaseUrl}/storage/v1/object/company-logos/${encodePath(path)}`, {
          method: "POST", // no upsert: an existing file is never replaced
          headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, "Content-Type": type },
          body: bytes
        });
        if (res.ok) return true;
        if (res.status === 409 || res.status === 400) return "exists";
        return false;
      }
    };
  }
  function download(bytes, name, type = "application/zip") {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function lastBackupText() {
    try {
      const iso = localStorage.getItem(LAST_KEY + userId());
      if (!iso) return "No backup made on this device yet.";
      const d = new Date(iso);
      return `Last backup on this device: ${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
    } catch (_) { return ""; }
  }

  // ---- record presentation ------------------------------------------------------------------
  function pick(row, keys) { for (const k of keys) { const v = row[k]; if (v !== null && v !== undefined && v !== "" && typeof v !== "object") return [k, v]; } return [null, null]; }
  function fmtDate(v) {
    if (!v) return "";
    const s = String(v);
    const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
    return isNaN(d) ? s : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtAmount(row) {
    const [k, v] = pick(row, AMOUNT_KEYS);
    if (k === null) return "";
    const n = Number(v);
    if (!isFinite(n)) return "";
    const cur = row.currency ? String(row.currency).toUpperCase() + " " : "";
    return cur + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function present(r) {
    if (r.view) return r.view;
    const row = r.row || {};
    const [, title] = pick(row, TITLE_KEYS);
    const [, date] = pick(row, DATE_KEYS);
    const [, desc] = pick(row, DESC_KEYS.filter(k => !TITLE_KEYS.includes(k) || k === "description"));
    const ref = String(row.id || r.key || "").slice(0, 8);
    r.view = {
      title: String(title ?? TABLES[r.table] ?? "Record").slice(0, 120),
      date: fmtDate(date),
      amount: fmtAmount(row),
      desc: desc && String(desc) !== String(title) ? String(desc).slice(0, 140) : "",
      ref
    };
    r.search = `${r.view.title} ${r.view.desc} ${r.view.amount} ${r.view.date} ${row.id || ""} ${TABLES[r.table] || ""}`.toLowerCase();
    return r.view;
  }
  function statusChip(r) {
    if (r.mode === "history") return ["Reference", "st-history"];
    switch (r.st) {
      case "new": return r.row && r.row.is_deleted === true ? ["New · was in bin", "st-new"] : ["New", "st-new"];
      case "existing": return [r.restored ? "Restored" : "Already in account", "st-existing"];
      case "deleted": return ["In Recycle Bin", "st-bin"];
      case "blocked": return ["Needs parent", "st-blocked"];
      case "invalid": return ["Changed", "st-conflict"];
      default: return ["Conflict", "st-conflict"];
    }
  }
  function reasonText(r) {
    const why = String(r.resultWhy || r.why || "");
    if (why.startsWith("same_key:")) {
      const cols = why.slice(9).replace(/owner_id,\s*/g, "").trim();
      return `Another record in your account already uses the same ${KEY_WORDS[cols] || cols.replace(/_/g, " ")}. Nothing was replaced.`;
    }
    return WHY[why] || (why ? why : "");
  }

  // ---- modal -------------------------------------------------------------------------------
  function modal() {
    let m = document.getElementById("userBackupModal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "userBackupModal";
    m.className = "modal hide user-backup-modal";
    m.setAttribute("aria-hidden", "true");
    m.innerHTML = `<div class="modal-backdrop" data-tvb-close></div>
      <div class="modal-dialog tvb-dialog" role="dialog" aria-modal="true" aria-labelledby="tvbTitle">
        <header class="tvb-head">
          <div class="tvb-head-text"><p class="tvb-kicker">Account</p><h3 id="tvbTitle">Backup &amp; Restore</h3><p class="tvb-sub" id="tvbSub">Keep a complete copy of your records and bring back anything that is missing.</p></div>
          <button class="tvb-icon-btn" type="button" data-tvb-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </header>
        <div class="tvb-body" id="tvbBody"></div>
        <footer class="tvb-foot hide" id="tvbFoot"></footer>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener("click", onClick);
    m.addEventListener("change", onChange);
    m.addEventListener("input", onInput);
    m.addEventListener("toggle", onToggle, true);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !m.classList.contains("hide")) { e.preventDefault(); requestClose(); }
    });
    return m;
  }
  function open() {
    const m = modal();
    if (!S.busy && (S.view === "result" || S.view === "error")) S.view = "home";
    render();
    m.classList.remove("hide");
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => $(".tvb-dialog button, .tvb-dialog input", m)?.focus(), 60);
  }
  function close() {
    const m = document.getElementById("userBackupModal");
    if (!m) return;
    m.classList.add("hide");
    m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = document.querySelector(".modal:not(.hide)") ? "hidden" : "";
    if (S.view === "preview" || S.view === "confirm" || S.view === "password") resetRestore();
  }
  function requestClose() {
    if (S.busy) {
      if (S.view === "restoring") { stopRun(); return; }
      if (!window.confirm("Stop and close?")) return;
      stopRun();
    }
    close();
  }
  function resetRestore() { S.backup = null; S.model = null; S.fileName = ""; S.query = ""; S.filter = "all"; S.open.clear(); S.shown.clear(); S.expanded.clear(); S.includeSettings = false; S.view = "home"; }
  function stopRun() { if (S.abort) S.abort.abort(); }

  // ---- views -------------------------------------------------------------------------------
  function render() {
    const body = $("#tvbBody"), foot = $("#tvbFoot");
    if (!body) return;
    const v = S.view;
    $(".tvb-dialog").classList.toggle("is-wide", v === "preview" || v === "confirm" || v === "result");
    $(".tvb-dialog").classList.toggle("is-tall", v === "preview");
    $("#tvbSub").textContent = {
      home: "Keep a complete copy of your records and bring back anything that is missing.",
      preview: "Choose what to add. Records already in your account are never changed.",
      confirm: "Check the summary, then start the restore.",
      result: "Restore finished.",
      password: "This backup is protected with a password."
    }[v] || "Working…";
    foot.classList.toggle("hide", !["preview", "confirm", "result", "password"].includes(v));
    if (v === "home") { body.innerHTML = homeHtml(); foot.innerHTML = ""; return; }
    if (v === "progress" || v === "restoring") { body.innerHTML = progressHtml(); foot.innerHTML = ""; return; }
    if (v === "password") { body.innerHTML = passwordHtml(); foot.innerHTML = `<button class="btn ghost" type="button" data-tvb="cancel-restore">Cancel</button><button class="btn primary tvb-primary" type="button" data-tvb="unlock">Open backup</button>`; setTimeout(() => $("#tvbOpenPassword")?.focus(), 30); return; }
    if (v === "preview") { body.innerHTML = previewHtml(); foot.innerHTML = previewFootHtml(); body.querySelectorAll("[data-indeterminate]").forEach(cb => { cb.indeterminate = true; }); return; }
    if (v === "confirm") { body.innerHTML = confirmHtml(); foot.innerHTML = `<button class="btn ghost" type="button" data-tvb="back-preview">Back</button><button class="btn primary tvb-primary" type="button" data-tvb="start-restore"><i class="fa-solid fa-rotate-left"></i> Restore now</button>`; return; }
    if (v === "result") { body.innerHTML = resultHtml(); foot.innerHTML = `${S.result && S.result.items.length ? `<button class="btn ghost" type="button" data-tvb="report"><i class="fa-solid fa-file-csv"></i> Download report</button>` : ""}<button class="btn primary tvb-primary" type="button" data-tvb="done">Done</button>`; return; }
    if (v === "error") { body.innerHTML = errorHtml(); foot.innerHTML = ""; }
  }

  function homeHtml() {
    if (!isOwner()) {
      return `<div class="tvb-empty"><i class="fa-solid fa-user-lock"></i><h4>Owner only</h4><p>Only the account owner can back up and restore the company workspace. Ask the owner to make a backup.</p></div>`;
    }
    return `<div class="tvb-home">
      <section class="tvb-card" aria-labelledby="tvbBackupTitle">
        <div class="tvb-card-top"><span class="tvb-card-icon"><i class="fa-solid fa-cloud-arrow-down"></i></span><h4 id="tvbBackupTitle">Create a backup</h4></div>
        <p>One ZIP file with all your records, settings, history and logos. Nothing in your account changes.</p>
        <label class="tvb-check"><input type="checkbox" id="tvbProtect"> <span>Protect with a password</span></label>
        <div class="tvb-password hide" id="tvbPasswordBox">
          <label class="tvb-field"><span>Password</span><input class="tvb-input" type="password" id="tvbPw1" autocomplete="new-password" minlength="8"></label>
          <label class="tvb-field"><span>Repeat password</span><input class="tvb-input" type="password" id="tvbPw2" autocomplete="new-password"></label>
          <p class="tvb-hint">At least 8 characters. Keep it safe: without it the backup cannot be opened, and it cannot be recovered.</p>
        </div>
        <p class="tvb-error" id="tvbBackupError" role="alert"></p>
        <button class="btn primary tvb-primary" type="button" data-tvb="backup"><i class="fa-solid fa-download"></i> Download backup</button>
        <p class="tvb-meta">${esc(lastBackupText())}</p>
      </section>
      <section class="tvb-card" aria-labelledby="tvbRestoreTitle">
        <div class="tvb-card-top"><span class="tvb-card-icon is-restore"><i class="fa-solid fa-clock-rotate-left"></i></span><h4 id="tvbRestoreTitle">Restore from a backup</h4></div>
        <p>Choose a Triplem VIP backup ZIP. You will see exactly what is new before anything is added. Existing records are never changed or deleted.</p>
        <ul class="tvb-points"><li><i class="fa-solid fa-check"></i> Adds only missing records</li><li><i class="fa-solid fa-check"></i> Safe to run more than once</li><li><i class="fa-solid fa-check"></i> Only backups of this account</li></ul>
        <p class="tvb-error" id="tvbRestoreError" role="alert">${esc(S.lastError)}</p>
        <button class="btn tvb-secondary" type="button" data-tvb="choose"><i class="fa-solid fa-folder-open"></i> Choose backup file</button>
        <input type="file" id="tvbFile" accept=".zip,application/zip,application/x-zip-compressed" hidden>
      </section>
    </div>`;
  }

  function progressHtml() {
    const p = S.progress || {};
    const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
    const counts = S.view === "restoring"
      ? `<div class="tvb-counts"><span><strong>${fmtInt(p.restored)}</strong> restored</span><span><strong>${fmtInt(p.skipped)}</strong> already there</span><span class="${p.attention ? "is-warn" : ""}"><strong>${fmtInt(p.attention)}</strong> need attention</span></div>`
      : (p.total ? `<p class="tvb-meta">${fmtInt(p.done)} of ${fmtInt(p.total)}</p>` : "");
    return `<div class="tvb-progress" aria-live="polite">
      <div class="tvb-spinner" aria-hidden="true"></div>
      <h4>${esc(p.title || "Working…")}</h4>
      <p class="tvb-step">${esc(p.text || "")}</p>
      <div class="tvb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      ${counts}
      <button class="btn ghost" type="button" data-tvb="stop">${S.view === "restoring" ? "Stop after this step" : "Cancel"}</button>
      ${S.view === "restoring" ? `<p class="tvb-hint">Stopping is safe. Records already restored stay; run the restore again later to continue without duplicates.</p>` : ""}
    </div>`;
  }

  function passwordHtml() {
    return `<div class="tvb-narrow"><div class="tvb-empty"><i class="fa-solid fa-lock"></i><h4>Protected backup</h4><p>${esc(S.fileName)}</p></div>
      <label class="tvb-field"><span>Backup password</span><input class="tvb-input" type="password" id="tvbOpenPassword" autocomplete="current-password"></label>
      <p class="tvb-error" id="tvbPasswordError" role="alert">${esc(S.lastError)}</p></div>`;
  }

  function errorHtml() {
    return `<div class="tvb-empty is-error"><i class="fa-solid fa-triangle-exclamation"></i><h4>${esc(S.errorTitle || "Something went wrong")}</h4><p>${esc(S.lastError)}</p>
      <button class="btn primary tvb-primary" type="button" data-tvb="home">Back</button></div>`;
  }

  // Preview -----------------------------------------------------------------------------
  function sectionStats(sec) {
    const o = { found: 0, new: 0, existing: 0, bin: 0, conflicts: 0, selected: 0, selectable: 0 };
    for (const t of S.model.tables) if (t.section === sec) for (const r of t.records) {
      o.found += 1;
      if (r.st === "new") o.new += 1; else if (r.st === "existing") o.existing += 1; else if (r.st === "deleted") o.bin += 1; else if (r.st !== "history") o.conflicts += 1;
      if (r.selected) o.selected += 1;
      if (E().selectable(r)) o.selectable += 1;
    }
    return o;
  }
  function matches(r) {
    present(r);
    const f = S.filter;
    if (f === "new" && r.st !== "new") return false;
    if (f === "selected" && !r.selected) return false;
    if (f === "existing" && r.st !== "existing") return false;
    if (f === "conflict" && ["new", "existing", "history"].includes(r.st)) return false;
    if (S.query && !r.search.includes(S.query)) return false;
    return true;
  }
  function previewHtml() {
    const m = S.model, man = m.manifest;
    const t = E().summary(m).totals;
    const created = new Date(man.createdAt);
    const sections = [...new Set(m.tables.map(x => x.section))];
    return `<div class="tvb-preview">
      <div class="tvb-file"><i class="fa-solid fa-file-zipper"></i><div><strong>${esc(S.fileName)}</strong><span>Made ${esc(isNaN(created) ? man.createdAt : created.toLocaleString())} · ${esc(man.owner.username)}${S.backup.encrypted ? " · password protected" : ""}</span></div></div>
      <div class="tvb-stats">
        ${stat("In backup", t.found)}${stat("New", t.new, "is-new")}${stat("Already in account", t.existing)}${stat("In Recycle Bin", t.deleted)}${stat("Conflicts", t.conflicts, t.conflicts ? "is-warn" : "")}${stat("Attachments", t.attachments)}
      </div>
      <p class="tvb-note"><i class="fa-solid fa-circle-info"></i> Only the records you select are added. Records already in your account stay exactly as they are, and nothing is deleted.</p>
      <div class="tvb-toolbar">
        <label class="tvb-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="tvbSearch" placeholder="Search records" value="${esc(S.query)}" aria-label="Search records"></label>
        <select id="tvbFilter" class="tvb-select" aria-label="Show">
          ${[["all", "All records"], ["new", "New"], ["selected", "Selected"], ["existing", "Already in account"], ["conflict", "Conflicts & blocked"]].map(([v, l]) => `<option value="${v}"${S.filter === v ? " selected" : ""}>${l}</option>`).join("")}
        </select>
        <div class="tvb-toolbar-btns"><button class="btn ghost tiny" type="button" data-tvb="select-all">Select all new</button><button class="btn ghost tiny" type="button" data-tvb="select-none">Clear</button></div>
      </div>
      <div class="tvb-sections">${sections.map(sectionHtml).join("")}${attachmentsHtml()}</div>
    </div>`;
  }
  const stat = (label, n, cls = "") => `<div class="tvb-stat ${cls}"><strong>${fmtInt(n)}</strong><span>${esc(label)}</span></div>`;
  function sectionHtml(sec) {
    const [label, icon] = SECTIONS[sec] || [sec, "fa-folder"];
    const s = sectionStats(sec);
    const mode = S.model.tables.find(t => t.section === sec)?.mode;
    const anyMatch = (S.query || S.filter !== "all") ? S.model.tables.some(t => t.section === sec && t.records.some(matches)) : true;
    if (!anyMatch) return "";
    const isOpen = S.open.has(sec) || (S.query && anyMatch);
    let control = "";
    if (mode === "data") {
      const all = s.selectable > 0 && s.selected >= s.selectable;
      control = `<input type="checkbox" class="tvb-sec-check" data-tvb-sec="${esc(sec)}" ${s.selectable ? "" : "disabled"} ${all ? "checked" : ""} ${s.selected && !all ? "data-indeterminate=\"1\"" : ""} aria-label="Select all new ${esc(label)}">`;
    } else if (mode === "settings") {
      control = `<span class="tvb-sec-icon"><i class="fa-solid ${icon}"></i></span>`;
    } else control = `<span class="tvb-sec-icon"><i class="fa-solid ${icon}"></i></span>`;
    return `<details class="tvb-section" data-section="${esc(sec)}"${isOpen ? " open" : ""}>
      <summary>${control}<span class="tvb-sec-name">${mode === "data" ? `<i class="fa-solid ${icon}"></i>` : ""}${esc(label)}</span>
        <span class="tvb-sec-counts">${mode === "history" ? `<span class="tvb-pill">${fmtInt(s.found)} kept for reference</span>` :
          `<span class="tvb-pill" title="In backup">${fmtInt(s.found)}</span><span class="tvb-pill is-new" title="New">${fmtInt(s.new)} new</span>${s.bin ? `<span class="tvb-pill is-bin" title="In Recycle Bin">${fmtInt(s.bin)} in bin</span>` : ""}${s.conflicts ? `<span class="tvb-pill is-warn" title="Conflicts">${fmtInt(s.conflicts)} conflict${s.conflicts === 1 ? "" : "s"}</span>` : ""}${s.selected ? `<span class="tvb-pill is-sel">${fmtInt(s.selected)} selected</span>` : ""}`}</span>
        <i class="fa-solid fa-chevron-down tvb-caret" aria-hidden="true"></i></summary>
      <div class="tvb-section-body">${isOpen ? sectionBodyHtml(sec, mode) : ""}</div>
    </details>`;
  }
  function sectionBodyHtml(sec, mode) {
    let html = "";
    if (mode === "settings") {
      const n = S.model.tables.filter(t => t.section === sec).reduce((a, t) => a + t.records.filter(r => r.st === "new").length, 0);
      html += `<label class="tvb-switch-row"><input type="checkbox" role="switch" id="tvbIncludeSettings" ${S.includeSettings ? "checked" : ""} ${n ? "" : "disabled"}>
        <span><strong>Also add missing settings (${fmtInt(n)})</strong><small>Only settings you do not have now are added. Your current settings are never replaced.</small></span></label>`;
    }
    if (mode === "history") html += `<p class="tvb-hint tvb-pad">History and audit logs are included in the backup for your records. They are not restored, because history must show what really happened in this account.</p>`;
    for (const t of S.model.tables.filter(x => x.section === sec)) {
      if (!t.records.length) continue;
      const list = t.records.filter(matches);
      if (!list.length) continue;
      const shown = S.shown.get(t.table) || PAGE;
      const comp = t.wholeParent ? ` <span class="tvb-table-note">restored together with their ${t.table === "depreciation_history" ? "asset" : t.table === "accounting_journal_lines" ? "journal entry" : "document"}</span>` : "";
      html += `<div class="tvb-table"><div class="tvb-table-head"><span>${esc(TABLES[t.table] || t.table)}</span><span class="tvb-table-count">${fmtInt(list.length)}${list.length !== t.records.length ? ` of ${fmtInt(t.records.length)}` : ""}</span>${comp}</div>
        <ul class="tvb-records">${list.slice(0, shown).map(r => recordHtml(r)).join("")}</ul>
        ${list.length > shown ? `<button class="tvb-more" type="button" data-tvb-more="${esc(t.table)}">Show ${fmtInt(Math.min(PAGE, list.length - shown))} more of ${fmtInt(list.length - shown)}</button>` : ""}</div>`;
    }
    return html || `<p class="tvb-hint tvb-pad">Nothing matches.</p>`;
  }
  function recordHtml(r) {
    const v = present(r);
    const [chip, cls] = statusChip(r);
    const id = `${r.table}:${r.i}`;
    const canPick = E().selectable(r) && r.mode === "data";
    const expanded = S.expanded.has(id);
    const lock = r.component ? `<span class="tvb-lock" title="Restored together with the record it belongs to"><i class="fa-solid fa-link"></i></span>` : "";
    const why = ["new", "existing", "history"].includes(r.st) ? "" : reasonText(r);
    const needs = r.st === "new" && r.deps.length ? r.deps.filter(p => p.st === "new").length : 0;
    return `<li class="tvb-rec ${cls}${r.selected ? " is-selected" : ""}" data-rec="${esc(id)}">
      <span class="tvb-rec-check">${canPick ? `<input type="checkbox" data-tvb-rec="${esc(id)}" ${r.selected ? "checked" : ""} aria-label="Restore ${esc(v.title)}">` : lock || `<input type="checkbox" disabled aria-hidden="true" tabindex="-1">`}</span>
      <button class="tvb-rec-main" type="button" data-tvb-expand="${esc(id)}" aria-expanded="${expanded}">
        <span class="tvb-rec-title">${esc(v.title)}</span>
        <span class="tvb-rec-sub">${[v.date, v.desc].filter(Boolean).map(esc).join(" · ")}${needs ? ` · <em>needs ${needs} linked record${needs > 1 ? "s" : ""}</em>` : ""}</span>
      </button>
      <span class="tvb-rec-amt">${esc(v.amount)}</span>
      <span class="tvb-chip ${cls}">${esc(chip)}</span>
      ${why ? `<p class="tvb-rec-why">${esc(why)}</p>` : ""}
      ${expanded ? detailHtml(r) : ""}
    </li>`;
  }
  function detailHtml(r) {
    const row = r.row || {};
    const fields = Object.keys(row).filter(k => !HIDE_FIELDS.has(k) && row[k] !== null && row[k] !== "" && typeof row[k] !== "object").slice(0, 18);
    return `<dl class="tvb-detail">${fields.map(k => `<div><dt>${esc(k.replace(/_/g, " "))}</dt><dd>${esc(/_(date|at)$/.test(k) ? fmtDate(row[k]) : row[k])}</dd></div>`).join("")}
      <div><dt>original id</dt><dd class="tvb-mono">${esc(row.id || r.key)}</dd></div></dl>`;
  }
  function attachmentsHtml() {
    const a = S.model.attachments;
    if (!a.length) return "";
    const open = S.open.has("__attachments");
    return `<details class="tvb-section" data-section="__attachments"${open ? " open" : ""}>
      <summary><span class="tvb-sec-icon"><i class="fa-solid fa-paperclip"></i></span><span class="tvb-sec-name">Attachments &amp; logos</span>
        <span class="tvb-sec-counts"><span class="tvb-pill">${fmtInt(a.length)}</span><span class="tvb-pill is-new">${fmtInt(a.filter(x => x.st === "new").length)} missing</span></span><i class="fa-solid fa-chevron-down tvb-caret" aria-hidden="true"></i></summary>
      <div class="tvb-section-body"><ul class="tvb-records">${a.map((f, i) => `<li class="tvb-rec ${f.st === "new" ? "st-new" : "st-existing"}">
        <span class="tvb-rec-check">${f.st === "new" ? `<input type="checkbox" data-tvb-att="${i}" ${f.selected ? "checked" : ""} aria-label="Restore ${esc(f.path.split("/").pop())}">` : `<input type="checkbox" disabled aria-hidden="true" tabindex="-1">`}</span>
        <span class="tvb-rec-main"><span class="tvb-rec-title">${esc(f.path.split("/").pop())}</span><span class="tvb-rec-sub">${esc(f.type)} · ${(f.size / 1024).toFixed(0)} KB</span></span>
        <span class="tvb-rec-amt"></span><span class="tvb-chip ${f.st === "new" ? "st-new" : "st-existing"}">${f.st === "new" ? "Missing – will be restored" : "Already stored"}</span></li>`).join("")}</ul></div></details>`;
  }
  function previewFootHtml() {
    const t = E().summary(S.model).totals;
    const settingsN = S.includeSettings ? t.settings : 0;
    const records = t.selected - (S.includeSettings ? 0 : t.settings);
    const files = t.attachmentsSelected;
    const total = records + files;
    return `<div class="tvb-foot-info"><strong>${fmtInt(records)}</strong> record${records === 1 ? "" : "s"} selected${t.components ? ` <span>(includes ${fmtInt(t.components)} lines/payments that belong to them)</span>` : ""}${files ? ` · <strong>${fmtInt(files)}</strong> file${files === 1 ? "" : "s"}` : ""}${settingsN ? ` · settings` : ""}</div>
      <div class="tvb-foot-btns"><button class="btn ghost" type="button" data-tvb="cancel-restore">Cancel</button><button class="btn primary tvb-primary" type="button" data-tvb="review" ${total ? "" : "disabled"}>Review &amp; restore</button></div>`;
  }
  function confirmHtml() {
    const sum = E().summary(S.model);
    const rows = sum.sections.filter(s => s.selected && (s.mode === "data" || (s.mode === "settings" && S.includeSettings)));
    const files = S.model.attachments.filter(a => a.selected).length;
    const total = rows.reduce((n, s) => n + s.selected, 0);
    return `<div class="tvb-narrow">
      <div class="tvb-empty"><i class="fa-solid fa-list-check"></i><h4>Add ${fmtInt(total)} record${total === 1 ? "" : "s"}${files ? ` and ${fmtInt(files)} file${files === 1 ? "" : "s"}` : ""}?</h4><p>Nothing that already exists in your account will be changed or deleted.</p></div>
      <table class="tvb-confirm-table"><thead><tr><th>Section</th><th>To add</th></tr></thead><tbody>
      ${rows.map(s => `<tr><td>${esc((SECTIONS[s.section] || [s.section])[0])}</td><td>${fmtInt(s.selected)}</td></tr>`).join("")}
      ${files ? `<tr><td>Attachments &amp; logos</td><td>${fmtInt(files)}</td></tr>` : ""}</tbody></table>
      <p class="tvb-hint">You can keep using Triplem VIP while this runs. If it stops, run the restore again: records already added are recognised and skipped.</p></div>`;
  }
  function resultHtml() {
    const r = S.result;
    const ok = !r.stopped && !r.attention && !r.attachments.failed;
    const items = r.items.slice(0, 300);
    return `<div class="tvb-result">
      <div class="tvb-empty ${ok ? "is-ok" : "is-warn"}"><i class="fa-solid ${ok ? "fa-circle-check" : "fa-circle-exclamation"}"></i>
        <h4>${r.stopped ? "Restore stopped" : ok ? "Restore complete" : "Restore finished with notes"}</h4>
        <p>${r.stopped ? "Records restored so far are kept. Run the restore again to continue; nothing will be duplicated." : "Your account has been updated. Existing records were not changed."}</p></div>
      <div class="tvb-stats">${stat("Restored", r.restored, "is-new")}${stat("Already there", r.skipped)}${stat("Need attention", r.attention, r.attention ? "is-warn" : "")}${stat("Files restored", r.attachments.restored)}</div>
      ${items.length ? `<h5 class="tvb-subhead">Need attention</h5><ul class="tvb-records">${items.map(it => {
        const v = present({ table: it.table, row: it.row || {}, key: it.key });
        return `<li class="tvb-rec st-conflict"><span class="tvb-rec-check"><i class="fa-solid fa-triangle-exclamation"></i></span><span class="tvb-rec-main"><span class="tvb-rec-title">${esc(v.title)}</span><span class="tvb-rec-sub">${esc(TABLES[it.table] || it.table)}${v.date ? " · " + esc(v.date) : ""}</span></span><span class="tvb-rec-amt">${esc(v.amount)}</span><p class="tvb-rec-why">${esc(reasonText({ why: it.why }) || it.why)}</p></li>`;
      }).join("")}</ul>${r.items.length > items.length ? `<p class="tvb-hint">${fmtInt(r.items.length - items.length)} more in the report.</p>` : ""}` : ""}
      ${r.attachments.failed ? `<p class="tvb-error">${fmtInt(r.attachments.failed)} file(s) could not be uploaded. Try the restore again later.</p>` : ""}
    </div>`;
  }

  // ---- events -------------------------------------------------------------------------------
  function findRec(id) {
    const [table, i] = String(id).split(":");
    return S.model?.byTable.get(table)?.records[Number(i)] || null;
  }
  function rerenderPreview() {
    const body = $("#tvbBody");
    const y = body.scrollTop;
    body.innerHTML = previewHtml();
    $("#tvbFoot").innerHTML = previewFootHtml();
    body.scrollTop = y;
    body.querySelectorAll("[data-indeterminate]").forEach(cb => { cb.indeterminate = true; });
  }
  function onClick(e) {
    if (e.target.closest("[data-tvb-close]")) { requestClose(); return; }
    const more = e.target.closest("[data-tvb-more]");
    if (more) { const t = more.dataset.tvbMore; S.shown.set(t, (S.shown.get(t) || PAGE) + PAGE); rerenderPreview(); return; }
    const ex = e.target.closest("[data-tvb-expand]");
    if (ex) { const id = ex.dataset.tvbExpand; if (S.expanded.has(id)) S.expanded.delete(id); else S.expanded.add(id); rerenderPreview(); return; }
    const secCheck = e.target.closest("summary input[data-tvb-sec]");
    if (secCheck) {
      // A click on the section checkbox selects the section; it must not fold
      // or unfold the panel, so the default <summary> toggle is cancelled.
      e.preventDefault();
      if (secCheck.disabled) return;
      const sec = secCheck.dataset.tvbSec;
      const recs = S.model.tables.filter(t => t.section === sec).flatMap(t => t.records).filter(r => E().selectable(r));
      const on = !(recs.length && recs.every(r => r.selected));
      for (const r of recs) E().setSelected(S.model, r, on);
      rerenderPreview();
      return;
    }
    const b = e.target.closest("[data-tvb]");
    if (!b) return;
    const a = b.dataset.tvb;
    if (a === "backup") runBackup();
    else if (a === "choose") $("#tvbFile")?.click();
    else if (a === "stop") stopRun();
    else if (a === "home" || a === "cancel-restore") { resetRestore(); S.lastError = ""; render(); }
    else if (a === "unlock") openProtected();
    else if (a === "select-all") {
      for (const t of S.model.tables) if (t.mode === "data") for (const r of t.records) if (E().selectable(r) && !r.selected) E().setSelected(S.model, r, true);
      S.model.attachments.forEach(x => { if (x.st === "new") x.selected = true; });
      rerenderPreview();
    }
    else if (a === "select-none") { for (const t of S.model.tables) for (const r of t.records) r.selected = false; S.includeSettings = false; S.model.attachments.forEach(x => { x.selected = false; }); rerenderPreview(); }
    else if (a === "review") { S.view = "confirm"; render(); $("#tvbBody").scrollTop = 0; }
    else if (a === "back-preview") { S.view = "preview"; render(); }
    else if (a === "start-restore") runRestore();
    else if (a === "report") downloadReport();
    else if (a === "done") { const changed = S.result && (S.result.restored || S.result.attachments.restored); resetRestore(); S.result = null; close(); if (changed) refreshAppData(); }
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === "tvbProtect") { $("#tvbPasswordBox")?.classList.toggle("hide", !t.checked); if (t.checked) setTimeout(() => $("#tvbPw1")?.focus(), 20); return; }
    if (t.id === "tvbFile") { const f = t.files && t.files[0]; t.value = ""; if (f) openFile(f); return; }
    if (t.id === "tvbFilter") { S.filter = t.value; S.shown.clear(); rerenderPreview(); return; }
    if (t.id === "tvbIncludeSettings") { S.includeSettings = t.checked; E().setSettingsIncluded(S.model, t.checked); rerenderPreview(); return; }
    if (t.dataset.tvbRec) { const r = findRec(t.dataset.tvbRec); if (r) E().setSelected(S.model, r, t.checked); rerenderPreview(); return; }
    if (t.dataset.tvbAtt) { const f = S.model.attachments[Number(t.dataset.tvbAtt)]; if (f) f.selected = t.checked; rerenderPreview(); return; }
  }
  let searchTimer = null;
  function onInput(e) {
    if (e.target.id !== "tvbSearch") return;
    clearTimeout(searchTimer);
    const v = e.target.value;
    searchTimer = setTimeout(() => {
      S.query = v.trim().toLowerCase(); S.shown.clear();
      rerenderPreview();
      const input = $("#tvbSearch"); if (input) { input.focus(); input.setSelectionRange(v.length, v.length); }
    }, 180);
  }
  function onToggle(e) {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.classList.contains("tvb-section")) return;
    const sec = d.dataset.section;
    const wasOpen = S.open.has(sec);
    if (d.open && !wasOpen) {
      S.open.add(sec);
      const body = d.querySelector(".tvb-section-body");
      if (body && !body.innerHTML.trim()) body.innerHTML = sec === "__attachments" ? body.innerHTML : sectionBodyHtml(sec, S.model.tables.find(t => t.section === sec)?.mode);
    } else if (!d.open && wasOpen) S.open.delete(sec);
  }

  // ---- runs ------------------------------------------------------------------------------
  const STEP_TEXT = { start: "Preparing…", export: "Copying records", attachments: "Copying logos and files", sign: "Securing the backup", zip: "Creating the ZIP file", verify: "Checking the finished backup", done: "Done", analyze: "Comparing with your account", restore: "Adding records" };
  function setProgress(p) {
    S.progress = p;
    if (S.view !== "progress" && S.view !== "restoring") return;
    const body = $("#tvbBody");
    if (!body) return;
    const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
    const bar = body.querySelector(".tvb-bar span");
    if (!bar) { body.innerHTML = progressHtml(); return; }
    body.querySelector("h4").textContent = p.title || "Working…";
    body.querySelector(".tvb-step").textContent = p.text || "";
    bar.style.width = pct + "%";
    body.querySelector(".tvb-bar").setAttribute("aria-valuenow", String(pct));
    const counts = body.querySelector(".tvb-counts");
    if (counts && S.view === "restoring") counts.innerHTML = `<span><strong>${fmtInt(p.restored)}</strong> restored</span><span><strong>${fmtInt(p.skipped)}</strong> already there</span><span class="${p.attention ? "is-warn" : ""}"><strong>${fmtInt(p.attention)}</strong> need attention</span>`;
    const meta = body.querySelector(".tvb-meta");
    if (meta && S.view === "progress") meta.textContent = p.total ? `${fmtInt(p.done)} of ${fmtInt(p.total)}` : "";
  }
  function fail(title, err) {
    S.busy = false; S.abort = null;
    if (err && err.code === "aborted") { S.view = "home"; render(); return; }
    S.errorTitle = title;
    S.lastError = String(err && err.message || err || "Unknown error");
    S.view = "error";
    render();
  }

  async function runBackup() {
    const protect = $("#tvbProtect")?.checked;
    const pw1 = $("#tvbPw1")?.value || "", pw2 = $("#tvbPw2")?.value || "";
    const errEl = $("#tvbBackupError");
    if (protect) {
      if (pw1.length < 8) { errEl.textContent = "Use a password of at least 8 characters."; return; }
      if (pw1 !== pw2) { errEl.textContent = "The two passwords do not match."; return; }
    }
    S.busy = true; S.abort = new AbortController(); S.view = "progress";
    S.progress = { title: "Creating your backup", text: "Preparing…", done: 0, total: 0 };
    render();
    try {
      const d = await deps();
      const out = await E().createBackup(d, {
        password: protect ? pw1 : "", signal: S.abort.signal,
        onProgress: p => setProgress({ title: "Creating your backup", text: STEP_TEXT[p.step] + (p.table ? ` · ${TABLES[p.table] || ""}` : ""), done: p.done, total: p.total })
      });
      download(out.bytes, out.filename);
      try { localStorage.setItem(LAST_KEY + userId(), new Date().toISOString()); } catch (_) {}
      S.busy = false; S.abort = null;
      S.view = "home";
      render();
      const n = out.manifest.totals.records;
      const files = out.manifest.totals.attachments;
      notify(`Backup ready: ${fmtInt(n)} record${n === 1 ? "" : "s"}${files ? ` and ${fmtInt(files)} file${files === 1 ? "" : "s"}` : ""} saved as ${out.filename}`, "success");
    } catch (e) { fail("The backup was not created", e); }
  }
  function notify(msg, kind) {
    try { if (typeof window.showToast === "function") { window.showToast(msg, kind); return; } } catch (_) {}
    const el = document.createElement("div");
    el.className = `tvb-toast ${kind || ""}`; el.setAttribute("role", "status"); el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add("show"), 10);
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 6000);
  }

  async function openFile(file, password = "") {
    S.fileName = file.name; S.file = file; S.lastError = "";
    if (file.size > E().LIMITS.zipBytes) { S.lastError = "This file is larger than the 512 MB backup limit."; render(); return; }
    S.busy = true; S.abort = new AbortController(); S.view = "progress";
    S.progress = { title: "Checking the backup", text: "Reading the file…", done: 0, total: 0 };
    render();
    try {
      const d = await deps();
      const bytes = new Uint8Array(await file.arrayBuffer());
      let backup;
      try {
        backup = await E().readBackup(d, bytes, { password, onProgress: f => setProgress({ title: "Checking the backup", text: "Unpacking and checking every file", done: Math.round(f * 100), total: 100 }) });
      } catch (e) {
        if (e.code === "needs_password" || (e.code === "password" && password)) {
          S.busy = false; S.abort = null; S.pendingBytes = bytes;
          S.lastError = e.code === "password" ? e.message : ""; S.view = "password"; render(); return;
        }
        throw e;
      }
      await afterRead(d, backup);
    } catch (e) { S.busy = false; S.abort = null; S.view = "home"; S.lastError = e.message || String(e); render(); }
  }
  async function openProtected() {
    const pw = $("#tvbOpenPassword")?.value || "";
    if (!pw) { $("#tvbPasswordError").textContent = "Enter the backup password."; return; }
    S.busy = true; S.abort = new AbortController(); S.view = "progress";
    S.progress = { title: "Opening the protected backup", text: "Checking the password…", done: 0, total: 0 };
    render();
    try {
      const d = await deps();
      const backup = await E().readBackup(d, S.pendingBytes, { password: pw });
      S.pendingBytes = null;
      await afterRead(d, backup);
    } catch (e) {
      S.busy = false; S.abort = null;
      if (e.code === "password") { S.lastError = e.message; S.view = "password"; render(); return; }
      S.view = "home"; S.lastError = e.message || String(e); render();
    }
  }
  async function afterRead(d, backup) {
    setProgress({ title: "Checking the backup", text: "Confirming it belongs to this account", done: 0, total: 1 });
    await E().verifyWithServer(d, backup.manifest);
    const model = await E().analyze(d, backup, {
      signal: S.abort.signal,
      onProgress: p => setProgress({ title: "Comparing with your account", text: p.step === "attachments" ? "Checking logos and files" : `Checking ${TABLES[p.table] || "records"}`, done: p.done, total: p.total })
    });
    S.backup = backup; S.model = model; S.busy = false; S.abort = null;
    S.open.clear(); S.shown.clear(); S.expanded.clear(); S.query = ""; S.filter = "all"; S.includeSettings = false;
    // Open the sections that have something new.
    for (const s of E().summary(model).sections) if (s.new && s.mode === "data") S.open.add(s.section);
    if (S.open.size > 3) S.open.clear();
    S.view = "preview";
    render();
    $("#tvbBody").scrollTop = 0;
    $("#tvbBody").querySelectorAll("[data-indeterminate]").forEach(cb => { cb.indeterminate = true; });
  }

  async function runRestore() {
    S.busy = true; S.abort = new AbortController(); S.view = "restoring";
    S.progress = { title: "Restoring", text: "Starting…", done: 0, total: 1, restored: 0, skipped: 0, attention: 0 };
    render();
    try {
      const d = await deps();
      const res = await E().restore(d, S.model, {
        includeSettings: S.includeSettings, signal: S.abort.signal,
        onProgress: p => setProgress({ title: "Restoring your records", text: p.step === "attachments" ? "Restoring logos and files" : `${(SECTIONS[p.section] || [""])[0]} · ${TABLES[p.table] || ""}`, ...p })
      });
      S.result = res; S.busy = false; S.abort = null; S.view = "result";
      render();
      $("#tvbBody").scrollTop = 0;
      if (res.restored || res.attachments.restored) refreshAppData();
    } catch (e) { fail("The restore stopped", e); }
  }
  function downloadReport() {
    const rows = [["Section", "Type", "Record", "Date", "Amount", "Original id", "Reason"]];
    for (const it of S.result.items) {
      const v = present({ table: it.table, row: it.row || {}, key: it.key });
      rows.push([(SECTIONS[it.section] || [it.section])[0], TABLES[it.table] || it.table, v.title, v.date, v.amount, (it.row && it.row.id) || it.key, reasonText({ why: it.why }) || it.why]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    download(new TextEncoder().encode("﻿" + csv), `Triplem-VIP-restore-report-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
  }

  // Bring the restored records into the open workspace without signing out.
  async function refreshAppData() {
    const tryRun = async f => { try { await f(); } catch (_) {} };
    await tryRun(() => window.TriplemOfflineCache?.clearAll?.());
    await tryRun(() => typeof resetLazyDataState === "function" && resetLazyDataState({ clearEntries: true }));
    await tryRun(() => typeof ensureTabDataLoaded === "function" && typeof getActiveTabKey === "function" && ensureTabDataLoaded(getActiveTabKey(), { force: true }));
    await tryRun(() => typeof loadAssetsFromDatabase === "function" && loadAssetsFromDatabase({ force: true }));
    await tryRun(() => typeof loadNotesFromDatabase === "function" && loadNotesFromDatabase({ force: true }));
    await tryRun(() => typeof loadBitcoinWalletsFromDatabase === "function" && loadBitcoinWalletsFromDatabase({ force: true }));
    await tryRun(() => window.TriplemAccounting?.load?.({ force: true }));
    await tryRun(() => typeof renderAll === "function" && renderAll());
  }

  const E = () => window.TriplemBackupEngine;

  // ---- menu entry --------------------------------------------------------------------------
  function bindMenu() {
    const btn = document.getElementById("userBackupRestoreBtn");
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
      document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(t => t.setAttribute("aria-expanded", "false"));
      open();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindMenu, { once: true });
  else bindMenu();

  // ---- used by the Windows app (3.8): "Back up now" and scheduled backups ------------------
  // Builds exactly the same backup as "Download backup" (no password: the file
  // is saved into the backup folder the user chose on this PC).
  let quietRun = null;
  async function createFile({ onProgress } = {}) {
    if (!isOwner()) { const e = new Error("Only the account owner can back up this workspace."); e.code = "owner"; throw e; }
    if (S.busy || quietRun) { const e = new Error("A backup or restore is already running."); e.code = "busy"; throw e; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { const e = new Error("No internet connection. The backup needs your online account."); e.code = "offline"; throw e; }
    quietRun = new AbortController();
    try {
      const d = await deps();
      const out = await E().createBackup(d, { password: "", signal: quietRun.signal, onProgress: p => { try { onProgress && onProgress(p); } catch (_) {} } });
      return out;
    } finally { quietRun = null; }
  }
  function markBackedUp(iso) {
    try { localStorage.setItem(LAST_KEY + userId(), iso || new Date().toISOString()); } catch (_) {}
    if (S.view === "home" && !document.getElementById("userBackupModal")?.classList.contains("hide")) render();
  }

  window.TriplemBackup = Object.freeze({ open, close, _state: S, _refresh: refreshAppData, createFile, save: download, markBackedUp, isOwner, lastBackupText });
})();
