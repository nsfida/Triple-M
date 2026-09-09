/* Triplem VIP · Triplem AI private authenticated financial assistant
 * Gemini BYOK credentials are never persisted in browser storage.
 */
(() => {
  "use strict";

  const MODELS = [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", hint: "Recommended · strongest Flash reasoning" },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", hint: "Stable high-throughput intelligence" },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", hint: "Lower-cost, lightweight analysis" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Compatibility option" }
  ];

  function aiState() {
    if (!window.state) return null;
    if (!state.triplemAi || typeof state.triplemAi !== "object") {
      state.triplemAi = {
        access: false,
        configured: false,
        keyMask: "",
        model: "gemini-3.8-flash",
        configuredAt: null,
        lastTestedAt: null,
        lastUsedAt: null,
        statusLoaded: false,
        statusLoading: false,
        statusPromise: null,
        messages: [],
        drafts: [],
        origins: [],
        draftsLoaded: false,
        draftsLoading: false,
        sending: false,
        panelReady: false,
        lastError: ""
      };
    }
    return state.triplemAi;
  }

  function esc(value) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(String(value ?? ""));
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  function fmtDate(value) {
    if (!value) return "Never";
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    } catch (_) {
      return String(value);
    }
  }

  function modelOptions(selected) {
    return MODELS.map(model => `<option value="${esc(model.id)}" ${model.id === selected ? "selected" : ""}>${esc(model.label)}</option>`).join("");
  }

  function selectedModelLabel(id) {
    return MODELS.find(model => model.id === id)?.label || id || "Gemini";
  }

  function getFunctionUrl() {
    const cfg = typeof getSupabaseConfig === "function" ? getSupabaseConfig() : null;
    if (!cfg?.supabaseUrl || !cfg?.supabaseKey) throw new Error("Triplem AI connection is unavailable.");
    return { ...cfg, url: `${String(cfg.supabaseUrl).replace(/\/$/, "")}/functions/v1/triplem-ai` };
  }

  async function invoke(action, payload = {}) {
    const ai = aiState();
    if (!ai?.access) throw new Error("Triplem AI access is not enabled for this account.");
    const token = String(state.sessionToken || "").trim();
    if (!token) throw new Error("Your session has expired. Sign in again.");
    const cfg = getFunctionUrl();
    const response = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "apikey": cfg.supabaseKey,
        "Authorization": `Bearer ${cfg.supabaseKey}`,
        "Content-Type": "application/json",
        "X-Session-Token": token
      },
      cache: "no-store",
      body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      const error = new Error(String(data?.error || `Triplem AI request failed (${response.status}).`));
      error.status = response.status;
      if (response.status === 403) {
        resetTriplemAiState({ keepMessages: false });
        try { applyPermissionGates(); } catch (_) {}
      }
      throw error;
    }
    return data || {};
  }

  function applyStatus(status) {
    const ai = aiState();
    if (!ai) return;
    ai.access = status?.allowed === true;
    ai.configured = ai.access && status?.configured === true;
    ai.keyMask = ai.access ? String(status?.key_mask || "") : "";
    ai.model = String(status?.model || "gemini-3.8-flash");
    ai.configuredAt = status?.configured_at || null;
    ai.lastTestedAt = status?.last_tested_at || null;
    ai.lastUsedAt = status?.last_used_at || null;
    ai.statusLoaded = true;
    ai.lastError = "";
    if (!ai.access) {
      ai.configured = false;
      ai.messages = [];
    }
    try { applyPermissionGates(); } catch (_) {}
    renderTriplemAiWorkspace();
  }

  async function refreshTriplemAiAccessState({ force = false } = {}) {
    const ai = aiState();
    if (!ai) return null;
    if (!state.sessionToken || !state.sessionUser || isGuestMode?.()) {
      resetTriplemAiState({ keepMessages: false });
      try { applyPermissionGates(); } catch (_) {}
      return ai;
    }
    if (ai.statusLoaded && !force) return ai;
    if (ai.statusLoading && ai.statusPromise) return ai.statusPromise;
    ai.statusLoading = true;
    ai.statusPromise = (async () => {
      try {
        if (typeof supabaseRpc !== "function") throw new Error("Database session is unavailable.");
        const status = await supabaseRpc("app_triplem_ai_access_status", {});
        applyStatus(status || {});
      } catch (error) {
        ai.access = false;
        ai.configured = false;
        ai.keyMask = "";
        ai.statusLoaded = true;
        ai.lastError = String(error?.message || "Could not verify Triplem AI access.");
        try { applyPermissionGates(); } catch (_) {}
      } finally {
        ai.statusLoading = false;
        ai.statusPromise = null;
      }
      return ai;
    })();
    return ai.statusPromise;
  }

  function resetTriplemAiState({ keepMessages = false } = {}) {
    const ai = aiState();
    if (!ai) return;
    ai.access = false;
    ai.configured = false;
    ai.keyMask = "";
    ai.model = "gemini-3.8-flash";
    ai.configuredAt = null;
    ai.lastTestedAt = null;
    ai.lastUsedAt = null;
    ai.statusLoaded = false;
    ai.statusLoading = false;
    ai.statusPromise = null;
    ai.sending = false;
    ai.drafts = [];
    ai.origins = [];
    ai.draftsLoaded = false;
    ai.draftsLoading = false;
    ai.panelReady = false;
    ai.lastError = "";
    if (!keepMessages) ai.messages = [];
  }

  function canUseTriplemAi() {
    const ai = aiState();
    return !!(state.unlocked && !isGuestMode?.() && !state.trialLocked && ai?.access);
  }

  function setupCardHtml() {
    return `<div class="triplem-ai-setup-state">
      <div class="triplem-ai-orb" aria-hidden="true"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
      <span class="triplem-ai-eyebrow">Private financial intelligence</span>
      <h4>Connect your Gemini API</h4>
      <p>Your Main Admin has enabled Triplem AI. Add your own Gemini API key once to activate intelligent, permission-aware analysis across Triplem VIP.</p>
      <div class="triplem-ai-privacy-row"><i class="fa-solid fa-vault"></i><span>The API key is encrypted in Supabase Vault. After saving, Triplem VIP shows only a masked identifier and never returns the key to your browser.</span></div>
      <button type="button" class="btn primary triplem-ai-connect-btn" data-triplem-ai-settings><i class="fa-solid fa-key"></i> Connect Gemini API</button>
    </div>`;
  }

  function assistantWelcome() {
    const user = state.sessionUser?.display_name || state.sessionUser?.username || "there";
    return `Good to see you, ${user}. I’m Triplem AI, your private financial intelligence assistant. Ask me to inspect your authorized Triplem VIP data, explain a period, compare activity, review VAT, find transactions, or interpret business performance.`;
  }

  function formatAssistantText(value) {
    return esc(value || "")
      .split(/\n/)
      .map(line => {
        const summary = line.match(/^\s*Summary:\s*(.*)$/i);
        if (summary) return `<span class="triplem-ai-answer-summary"><strong>Summary:</strong> ${summary[1]}</span>`;
        const tip = line.match(/^\s*Tip:\s*(.*)$/i);
        if (tip) return `<span class="triplem-ai-answer-tip"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i><span><strong>Tip:</strong> ${tip[1]}</span></span>`;
        return line;
      })
      .join("<br>");
  }

  const AI_ORIGIN_TAG = "[AI_CREATED]";

  function aiOriginNote(value) {
    const clean = String(value || "").replace(/\s*\[AI_CREATED\]\s*/gi, " ").replace(/\s{2,}/g, " ").trim();
    return `${AI_ORIGIN_TAG}${clean ? ` ${clean}` : ""}`.trim();
  }

  function aiOriginBadgeHtml(label = "AI") {
    return `<span class="triplem-ai-origin-badge"><i class="fa-solid fa-sparkles" aria-hidden="true"></i>${esc(label)}</span>`;
  }

  function isAiOriginRecord(module, recordId = "", groupId = "") {
    const ai = aiState();
    const mod = String(module || "").trim().toLowerCase();
    const rid = String(recordId || "").trim();
    const gid = String(groupId || "").trim();
    return (ai?.origins || []).some(origin => {
      if (String(origin?.module || "").trim().toLowerCase() !== mod) return false;
      if (rid && String(origin?.record_id || "") === rid) return true;
      return !!gid && String(origin?.group_id || "") === gid;
    });
  }

  function rememberAiOrigin(module, recordType, recordId, groupId = null) {
    const ai = aiState();
    if (!ai || !recordId) return;
    const row = { module, record_type: recordType, record_id: recordId, group_id: groupId || null, created_at: new Date().toISOString() };
    ai.origins = [row, ...(ai.origins || []).filter(origin => !(String(origin?.module || "") === String(module || "") && String(origin?.record_id || "") === String(recordId || "")))];
  }

  function referenceDetailText(record) {
    const d = record?.details || {};
    const parts = [];
    const preferred = ["person","item","wallet","from_wallet","to_wallet","asset","document_no","reference","currency","amount","principal","purchase_price","total_sale","date","purchase_date","status"];
    preferred.forEach(key => {
      const value = d[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") parts.push(`${key.replace(/_/g," ")}: ${String(value)}`);
    });
    return parts.slice(0, 5).join(" · ");
  }

  function renderRecordCards(records = []) {
    if (!Array.isArray(records) || !records.length) return "";
    return `<div class="triplem-ai-records">${records.slice(0, 12).map(record => {
      const key = `${record.module || ""}|${record.record_type || ""}|${record.record_id || ""}`;
      return `<button type="button" class="triplem-ai-record-card" data-triplem-ai-record-key="${esc(key)}">
        <span class="triplem-ai-record-icon"><i class="fa-solid fa-receipt"></i></span>
        <span class="triplem-ai-record-copy"><span class="triplem-ai-record-top"><strong>${esc(record.title || record.record_type || "Record")}</strong>${record.ai_origin ? aiOriginBadgeHtml() : ""}</span><small>${esc(String(record.module || "").replace(/_/g," "))} · ${esc(String(record.record_type || "").replace(/_/g," "))}${record.record_date ? ` · ${esc(fmtDate(record.record_date))}` : ""}</small>${referenceDetailText(record) ? `<em>${esc(referenceDetailText(record))}</em>` : ""}</span>
        <i class="fa-solid fa-chevron-right triplem-ai-record-open" aria-hidden="true"></i>
      </button>`;
    }).join("")}</div>`;
  }

  function renderReferences(message) {
    if (message.role === "user") return "";
    const records = Array.isArray(message.records) ? message.records : [];
    const refs = Array.isArray(message.references) && message.references.length
      ? message.references
      : [{ source: "Triplem VIP", detail: "Authenticated product knowledge and workspace policy" }];
    const lines = [];
    records.slice(0, 12).forEach((record, index) => {
      lines.push(`<div class="triplem-ai-reference-line"><span>${index + 1}</span><p><strong>${esc(record.title || record.record_type || "Record")}</strong><small>${esc(String(record.module || "").replace(/_/g," "))} · ${esc(String(record.record_type || "").replace(/_/g," "))}${referenceDetailText(record) ? ` · ${esc(referenceDetailText(record))}` : ""}</small></p></div>`);
    });
    refs.slice(0, 12).forEach((ref, index) => {
      const duplicate = records.length && String(ref.source || "").toLowerCase().includes("workspace search");
      if (duplicate) return;
      lines.push(`<div class="triplem-ai-reference-line"><span>${records.length + index + 1}</span><p><strong>${esc(ref.source || "Triplem VIP")}</strong><small>${esc(ref.detail || "Authorized workspace source")}${Number.isFinite(Number(ref.count)) ? ` · ${esc(String(ref.count))} result(s)` : ""}</small></p></div>`);
    });
    return `<div class="triplem-ai-reference-box"><div class="triplem-ai-reference-title"><i class="fa-solid fa-link"></i><strong>References</strong></div>${lines.join("")}</div>`;
  }

  function draftTitle(draft) {
    const p = draft?.payload || {};
    return p.item_name || p.person_name || p.name || p.title || p.customer_name || String(draft?.record_type || "AI Draft").replace(/_/g," ");
  }

  function draftSummary(draft) {
    const p = draft?.payload || {};
    const amount = p.amount ?? p.from_amount ?? p.purchase_price ?? p.unit_price;
    const bits = [String(draft?.record_type || "").replace(/_/g," ")];
    if (p.currency && amount !== undefined && amount !== "") bits.push(`${p.currency} ${amount}`);
    if (p.date || p.purchase_date) bits.push(p.date || p.purchase_date);
    return bits.filter(Boolean).join(" · ");
  }

  function renderDraftCards(drafts = [], compact = false) {
    if (!Array.isArray(drafts) || !drafts.length) return "";
    return `<div class="triplem-ai-drafts ${compact ? "is-compact" : ""}">${drafts.slice(0, 12).map(draft => `<button type="button" class="triplem-ai-draft-card" data-triplem-ai-draft-id="${esc(draft.id)}"><span class="triplem-ai-draft-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></span><span><span class="triplem-ai-draft-title"><strong>${esc(draftTitle(draft))}</strong>${aiOriginBadgeHtml("AI Draft")}</span><small>${esc(draftSummary(draft))}</small></span><i class="fa-solid fa-pen-to-square"></i></button>`).join("")}</div>`;
  }

  function findRecordByKey(key) {
    const ai = aiState();
    const target = String(key || "");
    for (const message of ai?.messages || []) {
      for (const record of message.records || []) {
        if (`${record.module || ""}|${record.record_type || ""}|${record.record_id || ""}` === target) return record;
      }
    }
    return null;
  }

  function triplemAiRecordDetailRows(record) {
    const details = record?.details && typeof record.details === "object" ? record.details : {};
    const rows = [];
    const seen = new Set();
    const push = (key, value) => {
      if (value === null || value === undefined || value === "") return;
      if (typeof value === "object") return;
      const id = String(key || "").toLowerCase();
      if (seen.has(id)) return;
      seen.add(id);
      const label = String(key || "Detail").replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
      const text = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
      rows.push({ label, text });
    };
    push("Module", String(record?.module || "").replace(/_/g, " "));
    push("Record type", String(record?.record_type || "").replace(/_/g, " "));
    push("Date", record?.record_date ? fmtDate(record.record_date) : "");
    Object.entries(details).forEach(([key, value]) => push(key, value));
    return rows.slice(0, 30);
  }

  function openTriplemAiRecordDetail(record) {
    if (!record) return;
    let modal = document.getElementById("triplemAiRecordDetailModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "triplemAiRecordDetailModal";
      modal.className = "modal hide triplem-ai-record-detail-modal";
      modal.setAttribute("aria-hidden", "true");
      document.body.appendChild(modal);
    }
    const rows = triplemAiRecordDetailRows(record);
    modal.innerHTML = `<div class="modal-backdrop" data-ai-record-close></div><div class="modal-dialog triplem-ai-record-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="triplemAiRecordDetailTitle"><div class="modal-head"><div><span class="triplem-ai-settings-kicker">Verified workspace record</span><h3 id="triplemAiRecordDetailTitle">${esc(record.title || record.record_type || "Record")} ${record.ai_origin ? aiOriginBadgeHtml("AI") : ""}</h3><p>${esc(String(record.module || "").replace(/_/g," "))} · ${esc(String(record.record_type || "").replace(/_/g," "))}</p></div><button type="button" class="icon-btn ghost" data-ai-record-close aria-label="Close">×</button></div><div class="modal-body"><div class="triplem-ai-record-detail-grid">${rows.map(row => `<div><span>${esc(row.label)}</span><strong>${esc(row.text)}</strong></div>`).join("")}</div></div><div class="modal-footer"><button type="button" class="btn ghost" data-ai-record-close>Close</button></div></div>`;
    const close = () => { modal.classList.add("hide"); modal.setAttribute("aria-hidden","true"); if (!document.querySelector(".modal:not(.hide)")) document.body.style.overflow=""; };
    modal.querySelectorAll("[data-ai-record-close]").forEach(el => el.addEventListener("click", close));
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";
  }

  async function openTriplemAiRecord(record) {
    if (!record) return;
    const module = String(record.module || "").toLowerCase();
    const type = String(record.record_type || "").toLowerCase();
    try {
      if (module === "expenses" || module === "wallets") {
        if (typeof activate === "function") activate("expenses");
        if (record.group_id && typeof ensureExpenseWalletDetailLoaded === "function") {
          try { await ensureExpenseWalletDetailLoaded(record.group_id, { force: true }); } catch (_) {}
        }
        if (type === "wallet" && typeof openExpenseAccountDetailsOverlay === "function") return openExpenseAccountDetailsOverlay(record.group_id);
        if (type === "expense" && typeof openExpenseTransactionDetail === "function") return openExpenseTransactionDetail(record.record_id);
        if (type === "top_up" && typeof openExpenseRecordDetail === "function") return openExpenseRecordDetail("topup", record.record_id);
        if (type === "wallet_transfer" && typeof openExpenseRecordDetail === "function") return openExpenseRecordDetail("transfer", record.record_id);
      }
      if (module === "loans") {
        if (typeof activate === "function") activate("loans");
        const person = record.details?.person || record.title;
        const direction = record.details?.direction || "taken";
        if (record.record_id && typeof window.openLoanTransactionDetail === "function") return window.openLoanTransactionDetail(record.record_id, person, direction);
      }
      if (module === "installments") {
        if (typeof activate === "function") activate("installments");
        if (type === "installment_plan" && record.group_id && typeof openInstallmentItemDetailsOverlay === "function") return openInstallmentItemDetailsOverlay(record.group_id);
      }
      if (module === "inventory") {
        if (typeof activate === "function") activate("goods");
        if (type === "inventory_sale" && record.record_id && typeof openInventoryReceiptEditor === "function" && (typeof teamCanShowEdit !== "function" || teamCanShowEdit("invoices"))) return openInventoryReceiptEditor(record.record_id);
        if (type === "inventory_item" && record.group_id && typeof openInventoryItemDetailsOverlay === "function") return openInventoryItemDetailsOverlay(record.group_id);
      }
      if (module === "assets") {
        if (typeof activate === "function") activate("assets");
        if (type === "asset") {
          const assetId = record.parent_id || record.record_id;
          if (assetId && typeof openAssetDetail === "function") return openAssetDetail(assetId);
        }
      }
      if (module === "notes") {
        if (typeof activate === "function") activate("notes");
        if (type === "note") {
          const noteId = record.parent_id || record.record_id;
          if (noteId && typeof window.openNoteDetailModal === "function") return window.openNoteDetailModal(noteId);
        }
      }
      if (module === "accounting") {
        if (typeof activate === "function") activate("accounting");
        if (window.TriplemAccounting?.load) { try { await window.TriplemAccounting.load({ force: false }); } catch (_) {} }
        if (type === "journal" && record.record_id && window.TriplemAccounting?.viewJournal) return window.TriplemAccounting.viewJournal(record.record_id);
        if (type === "document" && record.record_id && window.TriplemAccounting?.viewDocument) return window.TriplemAccounting.viewDocument(record.record_id);
      }
      if (module === "bitcoin" && typeof activate === "function") activate("bitcoin");
    } catch (error) {
      console.warn("Triplem AI native record open failed:", error);
    }
    return openTriplemAiRecordDetail(record);
  }

  async function loadAiDrafts({ force = false } = {}) {
    const ai = aiState();
    if (!ai?.access || ai.draftsLoading || (ai.draftsLoaded && !force)) return ai?.drafts || [];
    ai.draftsLoading = true;
    try {
      const result = await invoke("list_drafts");
      ai.drafts = Array.isArray(result.drafts) ? result.drafts : [];
      ai.origins = Array.isArray(result.origins) ? result.origins : [];
      ai.draftsLoaded = true;
    } catch (error) {
      console.warn("Could not load Triplem AI drafts:", error);
    } finally {
      ai.draftsLoading = false;
    }
    return ai.drafts;
  }

  function findAiDraft(id) {
    return (aiState()?.drafts || []).find(draft => String(draft.id) === String(id));
  }

  function allowedCurrencyOptions(selected) {
    let currencies = ["AED","SAR","PKR","USD","BTC"];
    try {
      const allowed = typeof getAllowedCurrencies === "function" ? getAllowedCurrencies() : [];
      if (Array.isArray(allowed) && allowed.length) currencies = currencies.filter(c => allowed.includes(c));
    } catch (_) {}
    return currencies.map(currency => `<option value="${currency}" ${String(selected || "AED").toUpperCase() === currency ? "selected" : ""}>${currency}</option>`).join("");
  }

  function aiWalletOptions(selected, nameHint = "") {
    let rows = [];
    try { rows = typeof getExpenseAccounts === "function" ? getExpenseAccounts({ applyUiFilters: false }) : []; } catch (_) {}
    let selectedId = String(selected || "");
    if (!selectedId && nameHint) selectedId = String(rows.find(row => String(row.person_name || "").trim().toLowerCase() === String(nameHint).trim().toLowerCase())?.group_id || "");
    return `<option value="">Skip / select later</option>${rows.filter(row => row.currency !== "BTC").map(row => `<option value="${esc(row.group_id)}" ${String(row.group_id) === selectedId ? "selected" : ""}>${esc(row.person_name)} · ${esc(row.currency)}</option>`).join("")}`;
  }

  function aiInventoryOptions(selected, nameHint = "") {
    let groups = [];
    try { groups = typeof getGoodsGroups === "function" ? getGoodsGroups({ applyUiFilters: false }) : []; } catch (_) {}
    groups = groups.filter(group => Number(group.remainingQty || 0) > 0.00000001);
    let selectedId = String(selected || "");
    if (!selectedId && nameHint) {
      const matches = groups.filter(group => String(group.person_name || "").trim().toLowerCase() === String(nameHint).trim().toLowerCase());
      if (matches.length === 1) selectedId = String(matches[0].group_id || "");
    }
    return `<option value="">Select in-stock item</option>${groups.map(group => `<option value="${esc(group.group_id)}" ${String(group.group_id) === selectedId ? "selected" : ""}>${esc(group.person_name)} · ${esc(inventoryQtyLabel(group.remainingQty, group.itemCategory, group))} left · ${esc(group.currency)}</option>`).join("")}`;
  }

  function field(label, name, value = "", type = "text", attrs = "") {
    return `<label class="triplem-ai-draft-field"><span>${esc(label)}</span><input class="input" name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${attrs}></label>`;
  }

  function draftFieldsHtml(draft) {
    const p = draft?.payload || {};
    const type = draft?.record_type;
    if (type === "expense") return `${field("Item / description","item_name",p.item_name,"text","required")}${field("Amount","amount",p.amount,"number",'step="0.00000001" min="0" required')}${field("Date","date",p.date || new Date().toISOString().slice(0,10),"date","required")}<label class="triplem-ai-draft-field"><span>Wallet</span><select class="input" name="wallet_id" required>${aiWalletOptions(p.wallet_id,p.wallet_name).replace('Skip / select later','Select wallet')}</select></label>${field("Expense type","expense_type",p.expense_type || "Other")}${field("Notes","notes",p.notes || "")}`;
    if (type === "top_up") return `${field("Amount","amount",p.amount,"number",'step="0.00000001" min="0" required')}${field("Date","date",p.date || new Date().toISOString().slice(0,10),"date","required")}<label class="triplem-ai-draft-field"><span>Wallet</span><select class="input" name="wallet_id" required>${aiWalletOptions(p.wallet_id,p.wallet_name).replace('Skip / select later','Select wallet')}</select></label>${field("Notes","notes",p.notes || "")}`;
    if (type === "wallet_transfer") return `<label class="triplem-ai-draft-field"><span>From wallet</span><select class="input" name="from_wallet_id" required>${aiWalletOptions(p.from_wallet_id,p.from_wallet_name).replace('Skip / select later','Select wallet')}</select></label><label class="triplem-ai-draft-field"><span>To wallet</span><select class="input" name="to_wallet_id" required>${aiWalletOptions(p.to_wallet_id,p.to_wallet_name).replace('Skip / select later','Select wallet')}</select></label>${field("Amount sent","from_amount",p.from_amount || p.amount,"number",'step="0.00000001" min="0" required')}${field("Amount received","to_amount",p.to_amount || "","number",'step="0.00000001" min="0"')}${field("Conversion rate","conversion_rate",p.conversion_rate || "1","number",'step="0.00000001" min="0"')}${field("Date","date",p.date || new Date().toISOString().slice(0,10),"date","required")}${field("Notes","notes",p.notes || "")}`;
    if (type === "loan") return `${field("Person","person_name",p.person_name,"text","required")}<label class="triplem-ai-draft-field"><span>Direction</span><select class="input" name="direction"><option value="given" ${p.direction === "given" ? "selected" : ""}>Given</option><option value="taken" ${p.direction !== "given" ? "selected" : ""}>Taken</option></select></label><label class="triplem-ai-draft-field"><span>Currency</span><select class="input" name="currency">${allowedCurrencyOptions(p.currency)}</select></label>${field("Principal amount","amount",p.amount || p.principal_amount,"number",'step="0.00000001" min="0" required')}${field("Date","date",p.date || p.loan_date || new Date().toISOString().slice(0,10),"date","required")}<label class="triplem-ai-draft-field"><span>Linked wallet</span><select class="input" name="wallet_id">${aiWalletOptions(p.wallet_id,p.wallet_name)}</select></label>${field("Notes","notes",p.notes || "")}`;
    if (type === "installment_plan") return `${field("Person","person_name",p.person_name,"text","required")}<label class="triplem-ai-draft-field"><span>Currency</span><select class="input" name="currency">${allowedCurrencyOptions(p.currency)}</select></label>${field("Plan amount","amount",p.amount || p.principal_amount,"number",'step="0.00000001" min="0" required')}${field("Start date","date",p.date || p.loan_date || new Date().toISOString().slice(0,10),"date","required")}${field("Installments","installment_count",p.installment_count || 12,"number",'min="2" max="120" required')}${field("Down payment","down_payment",p.down_payment || 0,"number",'step="0.00000001" min="0"')}${field("Notes","notes",p.notes || "")}`;
    if (type === "inventory_item") return `${field("Item name","item_name",p.item_name,"text","required")}<label class="triplem-ai-draft-field"><span>Currency</span><select class="input" name="currency">${allowedCurrencyOptions(p.currency)}</select></label>${field("Quantity","quantity",p.quantity || 1,"number",'step="0.00000001" min="0" required')}${field("Unit purchase price","unit_price",p.unit_price,"number",'step="0.00000001" min="0" required')}${field("Selling price","selling_price",p.selling_price || "","number",'step="0.00000001" min="0"')}${field("Purchase date","date",p.date || new Date().toISOString().slice(0,10),"date","required")}${field("Item type","item_type",p.item_type || "General")}${field("Category","item_category",p.item_category || "Count")}${field("Description","description",p.description || p.notes || "")}`;
    if (type === "inventory_sale") return `<label class="triplem-ai-draft-field is-wide"><span>Inventory item</span><select class="input" name="item_group_id" required>${aiInventoryOptions(p.item_group_id,p.item_name)}</select></label>${field("Customer","customer_name",p.customer_name || "Walk-in customer","text","required")}${field("Quantity","quantity",p.quantity || 1,"number",'step="0.00000001" min="0" required')}${field("Unit selling price","unit_price",p.unit_price || p.selling_price,"number",'step="0.00000001" min="0" required')}${field("Sale date","date",p.date || new Date().toISOString().slice(0,10),"date","required")}${field("Notes","notes",p.notes || "")}`;
    if (type === "asset") return `${field("Asset name","name",p.name,"text","required")}<label class="triplem-ai-draft-field"><span>Currency</span><select class="input" name="currency">${allowedCurrencyOptions(p.currency)}</select></label>${field("Purchase price","purchase_price",p.purchase_price,"number",'step="0.00000001" min="0" required')}${field("Purchase date","purchase_date",p.purchase_date || new Date().toISOString().slice(0,10),"date","required")}${field("Asset type","asset_type",p.asset_type || "other")}<label class="triplem-ai-draft-field"><span>Linked wallet</span><select class="input" name="wallet_id">${aiWalletOptions(p.wallet_id,p.wallet_name)}</select></label>${field("Description","description",p.description || "")}`;
    if (type === "note") return `${field("Title","title",p.title,"text","required")}<label class="triplem-ai-draft-field is-wide"><span>Note</span><textarea class="input" name="content" rows="6" required>${esc(p.content || "")}</textarea></label>`;
    return `<div class="triplem-ai-draft-unsupported">This AI Draft type is not available for finalization.</div>`;
  }

  function collectDraftPayload(form, draft) {
    const payload = { ...(draft?.payload || {}) };
    new FormData(form).forEach((value, key) => { payload[key] = String(value).trim(); });
    return payload;
  }

  function ensureDraftModal() {
    let modal = document.getElementById("triplemAiDraftModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "triplemAiDraftModal";
    modal.className = "modal hide triplem-ai-draft-modal";
    modal.setAttribute("aria-hidden","true");
    document.body.appendChild(modal);
    return modal;
  }

  function renderDraftModal(modal, draft) {
    modal.innerHTML = `<div class="modal-backdrop" data-ai-draft-close></div><div class="modal-dialog triplem-ai-draft-dialog" role="dialog" aria-modal="true"><div class="modal-head"><div><span class="triplem-ai-settings-kicker">Review before posting</span><h3>${esc(draftTitle(draft))} ${aiOriginBadgeHtml("AI Draft")}</h3><p>Draft only. It does not affect balances, reports, VAT, inventory or accounting until finalized.</p></div><button type="button" class="icon-btn ghost" data-ai-draft-close aria-label="Close">×</button></div><form id="triplemAiDraftForm" class="modal-body triplem-ai-draft-form">${draftFieldsHtml(draft)}<div id="triplemAiDraftStatus" class="triplem-ai-settings-message"></div></form><div class="modal-footer triplem-ai-draft-actions"><button type="button" class="btn ghost danger" id="triplemAiDraftDelete"><i class="fa-solid fa-trash"></i> Delete Draft</button><div><button type="button" class="btn ghost" id="triplemAiDraftSave">Save Draft</button><button type="button" class="btn primary" id="triplemAiDraftFinalize"><i class="fa-solid fa-circle-check"></i> Finalize</button></div></div></div>`;
    const close = () => { modal.classList.add("hide"); modal.setAttribute("aria-hidden","true"); if (!document.querySelector(".modal:not(.hide)")) document.body.style.overflow=""; };
    modal.querySelectorAll("[data-ai-draft-close]").forEach(el => el.addEventListener("click", close));
    const status = modal.querySelector("#triplemAiDraftStatus");
    const setBusy = (busy, text="") => { modal.querySelectorAll("button,input,select,textarea").forEach(el => { if (!el.matches("[data-ai-draft-close]")) el.disabled=!!busy; }); if (status) status.textContent=text; };
    modal.querySelector("#triplemAiDraftSave")?.addEventListener("click", async () => {
      try { setBusy(true,"Saving AI Draft…"); const payload=collectDraftPayload(modal.querySelector("#triplemAiDraftForm"),draft); const res=await invoke("update_draft",{draft_id:draft.id,payload}); const ai=aiState(); ai.drafts=ai.drafts.map(d=>String(d.id)===String(draft.id)?res.draft:d); setBusy(false,"Draft saved."); renderTriplemAiWorkspace(); setTimeout(()=>renderDraftModal(modal,res.draft),350); } catch(error){ setBusy(false,String(error?.message||"Could not save draft.")); }
    });
    modal.querySelector("#triplemAiDraftDelete")?.addEventListener("click", async () => {
      const confirmed = typeof appConfirmDelete === "function" ? await appConfirmDelete("Delete this AI Draft permanently? It has not been finalized, so it will be erased completely.",{title:"Delete AI Draft?",confirmLabel:"Delete permanently"}) : confirm("Delete this AI Draft permanently?");
      if (!confirmed) return;
      try { setBusy(true,"Permanently deleting AI Draft…"); await invoke("delete_draft",{draft_id:draft.id}); const ai=aiState(); ai.drafts=ai.drafts.filter(d=>String(d.id)!==String(draft.id)); close(); renderTriplemAiWorkspace(); if(typeof showEntryConfirmation==="function") showEntryConfirmation("AI Draft permanently deleted.","success"); } catch(error){ setBusy(false,String(error?.message||"Could not delete draft.")); }
    });
    modal.querySelector("#triplemAiDraftFinalize")?.addEventListener("click", async () => {
      try {
        if (navigator.onLine === false) throw new Error("Connect to the internet before finalizing an AI Draft.");
        setBusy(true,"Validating and finalizing…");
        let payload=collectDraftPayload(modal.querySelector("#triplemAiDraftForm"),draft);
        if (!payload._group_id && ["loan","installment_plan","inventory_item"].includes(draft.record_type)) payload._group_id=crypto.randomUUID();
        if (draft.record_type === "wallet_transfer" && !payload._receive_record_id) payload._receive_record_id=crypto.randomUUID();
        const saved=await invoke("update_draft",{draft_id:draft.id,payload});
        const currentDraft=saved.draft || {...draft,payload};
        const finalized=await finalizeAiDraftNative(currentDraft);
        await invoke("mark_finalized",{draft_id:draft.id,record_id:finalized.record_id,group_id:finalized.group_id||null});
        rememberAiOrigin(draft.module,draft.record_type,finalized.record_id,finalized.group_id||null);
        const ai=aiState(); ai.drafts=ai.drafts.filter(d=>String(d.id)!==String(draft.id));
        close(); renderTriplemAiWorkspace();
        if(typeof showEntryConfirmation==="function") showEntryConfirmation("AI Draft finalized. Normal edit and delete audit rules now apply.","success");
        if(finalized.open) await finalized.open();
      } catch(error){ setBusy(false,String(error?.message||"Could not finalize AI Draft.")); }
    });
  }

  async function openAiDraft(id) {
    const draft=findAiDraft(id); if(!draft) return;
    const modal=ensureDraftModal(); renderDraftModal(modal,draft); modal.classList.remove("hide"); modal.setAttribute("aria-hidden","false"); document.body.style.overflow="hidden";
  }

  function ensurePositive(value,label){ const n=Number(value); if(!Number.isFinite(n)||n<=0) throw new Error(`${label} must be greater than zero.`); return n; }
  function findAiWallet(id, nameHint="") { const rows=typeof getExpenseAccounts==="function"?getExpenseAccounts({applyUiFilters:false}):[]; return rows.find(r=>String(r.group_id)===String(id)) || rows.find(r=>String(r.person_name||"").trim().toLowerCase()===String(nameHint||"").trim().toLowerCase()); }

  async function finalizeAiDraftNative(draft) {
    const p=draft.payload||{}; const type=draft.record_type; const recordId=String(draft.id);
    if (["expense","top_up","wallet_transfer","loan","installment_plan","inventory_item","inventory_sale"].includes(type) && state.entries?.some(e=>String(e.id)===recordId)) {
      const existing=state.entries.find(e=>String(e.id)===recordId); return {record_id:recordId,group_id:existing?.group_id||p._group_id||null,open:()=>openTriplemAiRecord({module:draft.module,record_type:type==="top_up"?"top_up":type==="inventory_item"?"inventory_item":type,record_id:recordId,group_id:existing?.group_id||p._group_id||null,title:draftTitle(draft),details:{person:p.person_name,direction:p.direction}})};
    }
    if(type==="expense"){
      const wallet=findAiWallet(p.wallet_id,p.wallet_name); if(!wallet) throw new Error("Select a valid wallet."); if(wallet.currency==="BTC") throw new Error("BTC wallet transactions are blockchain-managed."); const amount=ensurePositive(p.amount,"Amount"); if(amount>Number(wallet.balance||0)) throw new Error(`Insufficient wallet balance. Available: ${formatReportAmount(wallet.balance,wallet.currency)}.`); if(!p.item_name||!p.date) throw new Error("Item, amount, wallet and date are required.");
      const row={id:recordId,group_id:wallet.group_id,direction:"taken",entry_kind:"partial",person_name:wallet.person_name,currency:wallet.currency,principal_amount:null,action_amount:amount,loan_date:wallet.principal?.loan_date||p.date,action_date:p.date,notes:upsertExpenseMetaInNote(aiOriginNote(p.notes),{accountType:wallet.accountType,rowType:"EXPENSE",itemName:p.item_name,expenseType:p.expense_type||"Other"})}; await saveEntriesImmediately(row,{label:"Expense",awaitSync:true}); return {record_id:recordId,group_id:wallet.group_id,open:()=>openExpenseTransactionDetail(recordId)};
    }
    if(type==="top_up"){
      const wallet=findAiWallet(p.wallet_id,p.wallet_name); if(!wallet) throw new Error("Select a valid wallet."); if(wallet.currency==="BTC") throw new Error("BTC wallet transactions are blockchain-managed."); const amount=ensurePositive(p.amount,"Amount"); if(!p.date) throw new Error("Amount, wallet and date are required."); const principal=wallet.principal; const row={id:recordId,group_id:wallet.group_id,direction:"taken",entry_kind:"partial",person_name:wallet.person_name,currency:wallet.currency,principal_amount:null,action_amount:amount,loan_date:principal?.loan_date||p.date,action_date:p.date,notes:upsertExpenseMetaInNote(aiOriginNote(p.notes),{accountType:wallet.accountType,rowType:"TOPUP"})}; await saveEntriesImmediately(row,{label:"Top-up",awaitSync:true}); return {record_id:recordId,group_id:wallet.group_id,open:()=>openExpenseRecordDetail("topup",recordId)};
    }
    if(type==="wallet_transfer"){
      const from=findAiWallet(p.from_wallet_id,p.from_wallet_name),to=findAiWallet(p.to_wallet_id,p.to_wallet_name); if(!from||!to) throw new Error("Select both wallets."); if(from.group_id===to.group_id) throw new Error("Cannot transfer to the same wallet."); if(from.currency==="BTC"||to.currency==="BTC") throw new Error("BTC wallet transfers are blockchain-managed."); const amount=ensurePositive(p.from_amount||p.amount,"Amount sent"); if(amount>Number(from.balance||0)) throw new Error(`Insufficient wallet balance. Available: ${formatReportAmount(from.balance,from.currency)}.`); const rate=Number(p.conversion_rate||1); if(from.currency!==to.currency && (!(rate>0))) throw new Error("Enter a valid conversion rate."); const received=Number(p.to_amount)>0?Number(p.to_amount):amount*(from.currency===to.currency?1:rate); if(!p.date) throw new Error("Transfer date is required."); const generated=buildExpenseTransferNotes(from,to,amount,received,from.currency===to.currency?1:rate,p.notes||""); const out={id:recordId,group_id:from.group_id,direction:"taken",entry_kind:"full",person_name:from.person_name,currency:from.currency,principal_amount:null,action_amount:amount,loan_date:from.principal?.loan_date||p.date,action_date:p.date,notes:upsertExpenseMetaInNote(aiOriginNote(generated.expense),{rowType:"EXPENSE",expenseType:"Transfer"})}; const incoming={id:p._receive_record_id,group_id:to.group_id,direction:"taken",entry_kind:"full",person_name:to.person_name,currency:to.currency,principal_amount:null,action_amount:received,loan_date:to.principal?.loan_date||p.date,action_date:p.date,notes:upsertExpenseMetaInNote(aiOriginNote(generated.topup),{rowType:"TOPUP",expenseType:"Transfer"})}; await saveEntriesImmediately([out,incoming],{label:"Transfer",awaitSync:true}); return {record_id:recordId,group_id:from.group_id,open:()=>openExpenseRecordDetail("transfer",recordId)};
    }
    if(type==="loan"){
      if(!p.person_name||!p.date) throw new Error("Person, direction, currency, amount and date are required."); const amount=ensurePositive(p.amount||p.principal_amount,"Principal amount"); const currency=String(p.currency||"").toUpperCase(); const direction=p.direction==="given"?"given":"taken"; const groupId=p._group_id||crypto.randomUUID(); const wallet=p.wallet_id?findAiWallet(p.wallet_id,p.wallet_name):null; if(wallet&&direction==="given"){ if(wallet.currency!==currency) throw new Error("Linked wallet currency does not match the loan currency."); if(amount>Number(wallet.balance||0)) throw new Error(`Insufficient wallet balance. Available: ${formatReportAmount(wallet.balance,wallet.currency)}.`); }
      const row={id:recordId,group_id:groupId,direction,entry_kind:"principal",person_name:p.person_name,currency,principal_amount:amount,action_amount:null,loan_date:p.date,action_date:null,notes:aiOriginNote(p.notes)}; await saveEntriesImmediately(row,{label:"Loan",awaitSync:true}); if(wallet) await createWalletEntryForLoanPrincipal(wallet.group_id,amount,p.date,p.person_name,direction,currency); return {record_id:recordId,group_id:groupId,open:()=>openLoanDetailsOverlay(p.person_name,direction)};
    }
    if(type==="installment_plan"){
      if(!p.person_name||!p.date) throw new Error("Person, currency, amount, date and installment count are required."); const amount=ensurePositive(p.amount||p.principal_amount,"Plan amount"); const count=Math.floor(Number(p.installment_count)); if(count<2||count>120) throw new Error("Installment count must be between 2 and 120."); const down=Number(p.down_payment||0); if(down<0||down>=amount) throw new Error("Down payment must be zero or less than the total plan amount."); const currency=String(p.currency||"").toUpperCase(); const groupId=p._group_id||crypto.randomUUID(); let notes=upsertInstallmentMetaInNote(aiOriginNote(p.notes),buildInstallmentScheduleMeta(amount,count,currency,p.date,down)); const rows=[{id:recordId,group_id:groupId,direction:"taken",entry_kind:"principal",person_name:p.person_name,currency,principal_amount:amount,action_amount:null,loan_date:p.date,action_date:null,notes}]; if(down>0) rows.push({id:crypto.randomUUID(),group_id:groupId,direction:"taken",entry_kind:"partial",person_name:p.person_name,currency,principal_amount:null,action_amount:down,loan_date:p.date,action_date:p.date,notes:upsertInstallmentMetaInNote(aiOriginNote("Down payment"),{paymentType:"down_payment"})}); await saveEntriesImmediately(rows,{label:"Installment plan",awaitSync:true}); return {record_id:recordId,group_id:groupId,open:()=>openInstallmentItemDetailsOverlay(groupId)};
    }
    if(type==="inventory_item"){
      if(!p.item_name||!p.date) throw new Error("Item name, currency, quantity, unit price and date are required."); const qty=ensurePositive(p.quantity,"Quantity"), unit=ensurePositive(p.unit_price,"Unit price"); const currency=String(p.currency||"").toUpperCase(); const groupId=p._group_id||crypto.randomUUID(); const category=typeof normalizeInventoryCategory==="function"?normalizeInventoryCategory(p.item_category||"Count"):(p.item_category||"Count"); const itemType=typeof normalizeInventoryItemType==="function"?normalizeInventoryItemType(p.item_type||"General"):(p.item_type||"General"); const unitName=typeof inventoryBaseUnitForCategory==="function"?inventoryBaseUnitForCategory(category):"unit"; const used=typeof getExistingInventoryCodes==="function"?getExistingInventoryCodes():[]; const itemCode=typeof nextPrefixedHexCode==="function"?nextPrefixedHexCode("ITM",used):`AI-${recordId.slice(0,8)}`; const total=qty*unit; const row={id:recordId,group_id:groupId,direction:"taken",entry_kind:"principal",person_name:p.item_name,currency,principal_amount:total,action_amount:null,loan_date:p.date,action_date:null,notes:upsertGoodsMetaInNote(normalizeGoodsNote(aiOriginNote(p.description||p.notes),true),{boughtQty:qty,unitActualPrice:unit,unitSoldPrice:Number(p.selling_price)>0?Number(p.selling_price):null,itemCode,itemDescription:p.description||"",itemType,itemCategory:category,quantityUnit:unitName,transactionType:"ITEM"})}; await saveEntriesImmediately(row,{label:"Inventory item",awaitSync:true}); return {record_id:recordId,group_id:groupId,open:()=>openInventoryItemDetailsOverlay(groupId)};
    }
    if(type==="inventory_sale"){
      const groups=typeof getGoodsGroups==="function"?getGoodsGroups({applyUiFilters:false}):[];
      let group=groups.find(g=>String(g.group_id)===String(p.item_group_id||""));
      if(!group&&p.item_name){ const matches=groups.filter(g=>String(g.person_name||"").trim().toLowerCase()===String(p.item_name).trim().toLowerCase()&&Number(g.remainingQty||0)>0.00000001); if(matches.length===1) group=matches[0]; }
      if(!group) throw new Error("Select a valid in-stock inventory item.");
      const category=typeof normalizeInventoryCategory==="function"?normalizeInventoryCategory(group.itemCategory||"Count"):(group.itemCategory||"Count");
      const qty=typeof normalizeStoredInventoryQty==="function"?normalizeStoredInventoryQty(p.quantity,category,0):Number(p.quantity);
      if(!Number.isFinite(qty)||qty<=0) throw new Error("Quantity must be greater than zero.");
      if(qty>Number(group.remainingQty||0)+0.00000001) throw new Error(`Only ${inventoryQtyLabel(group.remainingQty,category,group)} remains in stock.`);
      const unit=ensurePositive(p.unit_price||p.selling_price||group.defaultUnitSoldPrice,"Unit selling price");
      if(!p.date) throw new Error("Sale date is required.");
      const customerName=String(p.customer_name||"Walk-in customer").trim()||"Walk-in customer";
      const principal=group.principal; if(!principal) throw new Error("Inventory item could not be resolved.");
      const meta=goodsMetaFromNotes(principal.notes);
      const taxDefault=typeof inventoryTaxDefaultsForGroup==="function"?inventoryTaxDefaultsForGroup(group):{rate:0,mode:"exclusive"};
      const tax=calculateTaxBreakdown(unit*qty,taxDefault.rate,taxDefault.mode,Number(taxDefault.rate||0)>0);
      const invoiceNumber=typeof nextInvoiceNumber==="function"?nextInvoiceNumber():`AI-${recordId.slice(0,8)}`;
      const paymentReceiptNumber=typeof nextPaymentReceiptNumber==="function"?nextPaymentReceiptNumber([invoiceNumber]):"";
      const customer=typeof getInventoryCustomerContact==="function"?getInventoryCustomerContact(customerName):{phone:"",address:"",company:"",trn:"",email:""};
      const saleLineId=crypto.randomUUID(), saleSetId=crypto.randomUUID();
      const notes=upsertGoodsMetaInNote(normalizeGoodsNote(aiOriginNote(p.notes),true),{
        soldQty:qty,unitSoldPrice:unit,itemCode:meta.itemCode,itemCategory:category,quantityUnit:typeof inventoryBaseUnitForCategory==="function"?inventoryBaseUnitForCategory(category):group.quantityUnit,
        brand:meta.brand||"",brandId:meta.brandId||"",subBrand:meta.subBrand||"",subBrandId:meta.subBrandId||"",productLine:meta.productLine||"",productLineId:meta.productLineId||"",variantLabel:meta.variantLabel||"",variantId:meta.variantId||"",variantStorage:meta.variantStorage||"",variantColor:meta.variantColor||"",variantOther:meta.variantOther||"",itemType:meta.itemType||group.itemType||"",
        customerName,customerPhone:customer.phone||"",customerAddress:customer.address||"",customerCompany:customer.company||"",customerTrn:customer.trn||"",customerEmail:customer.email||"",
        receiptNumber:invoiceNumber,invoiceNumber,paymentReceiptNumber,transactionType:"SALE",saleLineNo:1,saleLineId,saleSetId,paidAmount:tax.total,balanceAmount:0,paymentStatus:"FULL",...taxMetaFromBreakdown(tax)
      });
      const row={id:recordId,group_id:group.group_id,direction:"taken",entry_kind:"full",person_name:principal.person_name,currency:principal.currency,principal_amount:null,action_amount:tax.total,loan_date:principal.loan_date,action_date:p.date,notes};
      await saveEntriesImmediately(row,{label:"Sales invoice",awaitSync:true});
      return {record_id:recordId,group_id:group.group_id,open:()=>typeof openInventoryReceiptEditor==="function"?openInventoryReceiptEditor(recordId):openInventoryItemDetailsOverlay(group.group_id)};
    }
    if(type==="asset"){
      if(state.assets?.some(a=>String(a.id)===recordId)) return {record_id:recordId,group_id:null,open:()=>openAssetDetail(recordId)}; if(!p.name||!p.purchase_date) throw new Error("Asset name, currency, purchase price and purchase date are required."); const price=Number(p.purchase_price); if(!Number.isFinite(price)||price<0) throw new Error("Purchase price must be zero or greater."); let assetType=String(p.asset_type||"other").trim().toLowerCase()||"other", other=null; if(typeof resolveAssetTypeSelection==="function"){ const r=resolveAssetTypeSelection(assetType,assetType==="other"?(p.asset_type_other||"AI Asset"):""); if(r?.ok){assetType=r.asset_type;other=r.asset_type_other;} else {other=p.asset_type||"AI Asset";assetType="other";} } const payload={id:recordId,owner_id:currentOwnerId(),name:p.name,asset_type:assetType,asset_type_other:assetType==="other"?other:null,description:p.description||null,currency:String(p.currency||"AED").toUpperCase(),purchase_date:p.purchase_date,purchase_price:price,status:"active",meta:{created_by_ai:true,ai_draft_id:draft.id},is_deleted:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}; const wallet=p.wallet_id?findAiWallet(p.wallet_id,p.wallet_name):null; if(wallet&&typeof validateAssetPurchaseWallet==="function") validateAssetPurchaseWallet(wallet.group_id,price,payload.currency); await supabase("app_assets",{method:"POST",body:JSON.stringify(payload)}); if(wallet) await createAssetPurchaseWalletEntry(wallet.group_id,payload); if(typeof loadAssetsFromDatabase==="function") await loadAssetsFromDatabase({force:true}); return {record_id:recordId,group_id:null,open:()=>openAssetDetail(recordId)};
    }
    if(type==="note"){
      if(state.notes?.some(n=>String(n.id)===recordId)) return {record_id:recordId,group_id:null,open:()=>window.openNoteDetailModal(recordId)}; const title=String(p.title||"").trim().slice(0,120),content=String(p.content||"").trim(); if(!title||!content) throw new Error("Note title and text are required."); const createdAt=new Date().toISOString(); await supabase("app_notes",{method:"POST",body:JSON.stringify({id:recordId,owner_id:currentOwnerId(),content,notes:JSON.stringify({title,content,rowType:"NOTE"}),meta:{rowType:"NOTE",title,created_by_ai:true,ai_draft_id:draft.id},is_deleted:false,created_at:createdAt,updated_at:createdAt})}); if(typeof loadNotesFromDatabase==="function") await loadNotesFromDatabase({force:true}); return {record_id:recordId,group_id:null,open:()=>window.openNoteDetailModal(recordId)};
    }
    throw new Error("This AI Draft type is not supported for finalization yet.");
  }

  function renderMessage(message) {
    const isUser = message.role === "user";
    const text = isUser ? esc(message.text || "").replace(/\n/g, "<br>") : formatAssistantText(message.text || "");
    return `<article class="triplem-ai-message ${isUser ? "is-user" : "is-ai"}">
      <div class="triplem-ai-message-avatar" aria-hidden="true">${isUser ? `<i class="fa-solid fa-user"></i>` : `<i class="fa-solid fa-sparkles"></i>`}</div>
      <div class="triplem-ai-message-content"><div class="triplem-ai-message-label">${isUser ? "You" : "Triplem AI"}</div><div class="triplem-ai-message-text">${text}</div>${isUser ? "" : renderRecordCards(message.records)}${isUser ? "" : renderDraftCards(message.drafts,true)}${isUser ? "" : renderReferences(message)}</div>
    </article>`;
  }

  function suggestionHtml() {
    const prompts = [
      ["Financial pulse", "How am I doing financially right now?"],
      ["This month", "Summarize my financial activity this month and highlight what deserves attention."],
      ["VAT position", "Review my VAT position for this month and separate VAT collected from VAT paid."],
      ["Expense review", "What changed most in my expenses recently?"],
      ["Inventory", "Review my inventory performance and identify anything I should pay attention to."],
      ["Audit", "Run a concise financial audit analysis for this month." ]
    ];
    return prompts.map(([label, prompt]) => `<button type="button" class="triplem-ai-suggestion" data-triplem-ai-prompt="${esc(prompt)}"><i class="fa-solid fa-arrow-trend-up"></i><span>${esc(label)}</span></button>`).join("");
  }

  let triplemAiViewportBound = false;
  let triplemAiViewportRaf = 0;

  function syncTriplemAiViewport() {
    const panel = document.getElementById("triplem-aiPanel");
    const section = panel?.querySelector(".triplem-ai-section");
    if (!panel || !section || panel.hidden || panel.classList.contains("hide")) return;
    const style = window.getComputedStyle(panel);
    if (style.display === "none" || style.visibility === "hidden") return;
    const rect = section.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportTop = visualViewport ? visualViewport.offsetTop : 0;
    const viewportBottom = visualViewport ? visualViewport.offsetTop + visualViewport.height : window.innerHeight;
    const bottomGap = window.matchMedia("(max-width: 720px)").matches ? 8 : 14;
    const available = Math.floor(viewportBottom - Math.max(rect.top, viewportTop) - bottomGap);
    if (available > 0) section.style.setProperty("--triplem-ai-viewport-height", `${Math.max(240, available)}px`);
  }

  function scheduleTriplemAiViewportSync() {
    if (triplemAiViewportRaf) cancelAnimationFrame(triplemAiViewportRaf);
    triplemAiViewportRaf = requestAnimationFrame(() => {
      triplemAiViewportRaf = 0;
      syncTriplemAiViewport();
    });
  }

  function ensureTriplemAiViewportBinding() {
    if (triplemAiViewportBound) return;
    triplemAiViewportBound = true;
    window.addEventListener("resize", scheduleTriplemAiViewportSync, { passive: true });
    window.addEventListener("scroll", scheduleTriplemAiViewportSync, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleTriplemAiViewportSync, { passive: true });
    window.visualViewport?.addEventListener("scroll", scheduleTriplemAiViewportSync, { passive: true });
  }

  function chatWorkspaceHtml(ai) {
    const messages = ai.messages.length ? ai.messages : [{ role: "assistant", text: assistantWelcome(), seed: true }];
    return `<div class="triplem-ai-shell">
      <div class="triplem-ai-console-head">
        <div class="triplem-ai-console-brand"><span class="triplem-ai-mini-orb"><i class="fa-solid fa-wand-magic-sparkles"></i></span><div><strong>Triplem AI</strong><small><span class="triplem-ai-status-dot" aria-hidden="true"></span>Private workspace intelligence · ${esc(selectedModelLabel(ai.model))}</small></div></div>
        <div class="triplem-ai-console-actions">
          <span class="triplem-ai-secure-pill"><i class="fa-solid fa-vault"></i> Private key secured</span>
          <button type="button" class="icon-btn ghost" data-triplem-ai-clear title="Clear this chat" aria-label="Clear this chat"><i class="fa-solid fa-eraser"></i></button>
          <button type="button" class="icon-btn ghost" data-triplem-ai-settings title="Triplem AI settings" aria-label="Triplem AI settings"><i class="fa-solid fa-gear"></i></button>
        </div>
      </div>
      ${ai.drafts?.length ? `<div class="triplem-ai-pending"><span><i class="fa-solid fa-clock-rotate-left"></i> Pending AI Drafts</span>${renderDraftCards(ai.drafts,true)}</div>` : ""}
      <div class="triplem-ai-thread" id="triplemAiThread" aria-live="polite">${messages.map(renderMessage).join("")}${ai.sending ? `<div class="triplem-ai-thinking"><span></span><span></span><span></span><em>Triplem AI is typing</em></div>` : ""}</div>
      ${ai.messages.length ? "" : `<div class="triplem-ai-suggestions">${suggestionHtml()}</div>`}
      <form class="triplem-ai-composer" id="triplemAiComposer">
        <textarea id="triplemAiInput" rows="1" maxlength="6000" placeholder="Ask Triplem AI about anything in your Triplem VIP workspace…" aria-label="Ask Triplem AI"></textarea>
        <button type="submit" class="triplem-ai-send" ${ai.sending ? "disabled" : ""} aria-label="Send"><i class="fa-solid fa-arrow-up"></i></button>
        <div class="triplem-ai-composer-foot"><span>Enter to send · Shift + Enter for a new line</span><span id="triplemAiCharCount">0 / 6000</span></div>
      </form>
    </div>`;
  }

  function renderTriplemAiWorkspace() {
    const root = document.getElementById("triplemAiRoot");
    const ai = aiState();
    if (!root || !ai) return;
    if (!state.unlocked || !ai.access) {
      root.innerHTML = `<div class="triplem-ai-unavailable"><i class="fa-solid fa-lock"></i><strong>Triplem AI is not enabled for this account.</strong><span>The protected Main Admin controls access.</span></div>`;
      return;
    }
    root.innerHTML = ai.configured ? chatWorkspaceHtml(ai) : setupCardHtml();
    bindWorkspace(root);
    ensureTriplemAiViewportBinding();
    requestAnimationFrame(() => {
      syncTriplemAiViewport();
      const thread = root.querySelector("#triplemAiThread");
      if (thread) thread.scrollTop = thread.scrollHeight;
    });
  }

  function resizeTextarea(input) {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(132, Math.max(44, input.scrollHeight))}px`;
  }

  function bindWorkspace(root) {
    root.querySelectorAll("[data-triplem-ai-settings]").forEach(btn => btn.addEventListener("click", openTriplemAiSettingsModal));
    root.querySelectorAll("[data-triplem-ai-record-key]").forEach(btn => btn.addEventListener("click", async () => { await openTriplemAiRecord(findRecordByKey(btn.dataset.triplemAiRecordKey)); }));
    root.querySelectorAll("[data-triplem-ai-draft-id]").forEach(btn => btn.addEventListener("click", () => openAiDraft(btn.dataset.triplemAiDraftId)));
    root.querySelector("[data-triplem-ai-clear]")?.addEventListener("click", () => {
      const ai = aiState();
      if (!ai || ai.sending) return;
      ai.messages = [];
      renderTriplemAiWorkspace();
    });
    root.querySelectorAll("[data-triplem-ai-prompt]").forEach(btn => btn.addEventListener("click", () => {
      const input = root.querySelector("#triplemAiInput");
      if (!input) return;
      input.value = btn.dataset.triplemAiPrompt || "";
      input.dispatchEvent(new Event("input"));
      input.focus();
    }));
    const form = root.querySelector("#triplemAiComposer");
    const input = root.querySelector("#triplemAiInput");
    const count = root.querySelector("#triplemAiCharCount");
    const shell = root.querySelector(".triplem-ai-shell");
    const thread = root.querySelector("#triplemAiThread");
    shell?.addEventListener("wheel", event => {
      if (!thread || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("textarea, input, select, .triplem-ai-drafts.is-compact")) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const maxScroll = Math.max(0, thread.scrollHeight - thread.clientHeight);
      if (maxScroll <= 0) {
        event.preventDefault();
        return;
      }
      thread.scrollTop = Math.max(0, Math.min(maxScroll, thread.scrollTop + event.deltaY));
      event.preventDefault();
    }, { passive: false });
    input?.addEventListener("input", () => {
      resizeTextarea(input);
      if (count) count.textContent = `${input.value.length} / 6000`;
    });
    input?.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form?.requestSubmit();
      }
    });
    form?.addEventListener("submit", async event => {
      event.preventDefault();
      await sendMessage(input?.value || "");
    });
  }

  async function sendMessage(raw) {
    const ai = aiState();
    const message = String(raw || "").trim().slice(0, 6000);
    if (!ai || !message || ai.sending || !ai.configured) return;
    const history = ai.messages.slice(-10).map(item => ({ role: item.role, text: item.text }));
    ai.messages.push({ role: "user", text: message });
    ai.sending = true;
    ai.lastError = "";
    renderTriplemAiWorkspace();
    try {
      const response = await invoke("chat", { message, history });
      ai.messages.push({ role: "assistant", text: String(response.answer || "I could not produce an answer."), records: Array.isArray(response.records) ? response.records : [], references: Array.isArray(response.references) ? response.references : [], drafts: Array.isArray(response.drafts) ? response.drafts : [] });
      if (Array.isArray(response.drafts) && response.drafts.length) {
        const byId = new Map((ai.drafts || []).map(d => [String(d.id), d]));
        response.drafts.forEach(d => byId.set(String(d.id), d));
        ai.drafts = Array.from(byId.values()).sort((a,b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
        ai.draftsLoaded = true;
      }
      ai.model = response.model || ai.model;
      ai.lastUsedAt = new Date().toISOString();
    } catch (error) {
      ai.messages.push({ role: "assistant", text: `I couldn’t complete that analysis. ${String(error?.message || "Please try again.")}` });
    } finally {
      ai.sending = false;
      renderTriplemAiWorkspace();
    }
  }

  async function prepareTriplemAiWorkspace() {
    const ai = await refreshTriplemAiAccessState();
    if (!ai?.access) return;
    await loadAiDrafts();
    renderTriplemAiWorkspace();
  }

  function ensureSettingsModal() {
    let modal = document.getElementById("triplemAiSettingsModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "triplemAiSettingsModal";
    modal.className = "modal hide triplem-ai-settings-modal";
    modal.setAttribute("aria-hidden", "true");
    document.body.appendChild(modal);
    return modal;
  }

  function settingsBodyHtml(ai) {
    const configured = ai.configured;
    return `<div class="triplem-ai-settings-hero">
      <span class="triplem-ai-settings-icon"><i class="fa-solid fa-vault"></i></span>
      <div><strong>Your Gemini key remains private</strong><p>The complete key is accepted only while you save it, then encrypted server-side in Supabase Vault. Triplem VIP never exposes it again.</p></div>
    </div>
    <div class="triplem-ai-settings-grid">
      <div class="triplem-ai-settings-field">
        <label>Gemini connection</label>
        <div class="triplem-ai-key-display ${configured ? "is-configured" : ""}"><i class="fa-solid ${configured ? "fa-shield-check" : "fa-key"}"></i><div><strong>${configured ? esc(ai.keyMask || "Configured") : "Not configured"}</strong><small>${configured ? `Connected ${esc(fmtDate(ai.configuredAt))}` : "Add your own Gemini API key to activate Triplem AI."}</small></div></div>
      </div>
      <label class="triplem-ai-settings-field"><span>Gemini model</span><select class="input" id="triplemAiModel">${modelOptions(ai.model)}</select><small>${esc(MODELS.find(m => m.id === ai.model)?.hint || "Choose a supported Gemini model.")}</small></label>
    </div>
    ${configured ? `<div class="triplem-ai-settings-status-grid"><div><span>Last tested</span><strong>${esc(fmtDate(ai.lastTestedAt))}</strong></div><div><span>Last used</span><strong>${esc(fmtDate(ai.lastUsedAt))}</strong></div></div>` : ""}
    <div class="triplem-ai-key-entry ${configured ? "is-replace" : ""}">
      <label for="triplemAiApiKey">${configured ? "Replace API key" : "Gemini API key"}</label>
      <div class="triplem-ai-secret-input"><input class="input" id="triplemAiApiKey" name="triplem_ai_gemini_key" type="password" autocomplete="off" spellcheck="false" autocapitalize="none" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" placeholder="${configured ? "Enter a new key only if you want to replace it" : "Paste Gemini API key"}" /><button type="button" class="icon-btn ghost triplem-ai-key-eye" id="triplemAiEntryEye" aria-label="Show key while typing" title="Show while typing"><i class="fa-solid fa-eye"></i></button></div>
      <p>The key is never written to browser storage. After saving, only the masked identifier above can be displayed.</p>
    </div>
    <div class="triplem-ai-settings-notice"><i class="fa-solid fa-circle-info"></i><span>Triplem AI can prepare isolated AI Drafts only when you explicitly ask it to record something. Drafts never affect live finances until you review and finalize them.</span></div>
    <div id="triplemAiSettingsStatus" class="triplem-ai-settings-message" role="status"></div>`;
  }

  function renderSettingsModal(modal) {
    const ai = aiState();
    modal.innerHTML = `<div class="modal-backdrop" data-triplem-ai-settings-close></div>
      <div class="modal-dialog settings-sheet triplem-ai-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="triplemAiSettingsTitle">
        <div class="settings-sheet-head"><div><span class="triplem-ai-settings-kicker">Bring your own AI</span><h3 id="triplemAiSettingsTitle">Triplem AI Settings</h3><p>Private Gemini integration for your authenticated workspace.</p></div><button type="button" class="icon-btn ghost triplem-ai-settings-close" data-triplem-ai-settings-close aria-label="Close" title="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>
        <div class="modal-body settings-sheet-body">${settingsBodyHtml(ai)}</div>
        <div class="modal-footer triplem-ai-settings-actions">
          ${ai.configured ? `<button type="button" class="btn ghost triplem-ai-delete-key" id="triplemAiDeleteKey"><i class="fa-solid fa-trash-can"></i> Delete Key</button><button type="button" class="btn ghost" id="triplemAiTestKey"><i class="fa-solid fa-plug-circle-check"></i> Test Connection</button>` : ""}
          <button type="button" class="btn primary" id="triplemAiSaveKey"><i class="fa-solid fa-shield-halved"></i> ${ai.configured ? "Save Changes" : "Save & Test"}</button>
        </div>
      </div>`;
    bindSettingsModal(modal);
  }

  function setSettingsBusy(modal, busy, message = "") {
    modal.querySelectorAll("button, input, select").forEach(el => { if (!el.matches("[data-triplem-ai-settings-close]")) el.disabled = !!busy; });
    const status = modal.querySelector("#triplemAiSettingsStatus");
    if (status) status.textContent = message || "";
  }

  function bindSettingsModal(modal) {
    const close = () => {
      const key = modal.querySelector("#triplemAiApiKey");
      if (key) key.value = "";
      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
      if (!document.querySelector(".modal:not(.hide)")) document.body.style.overflow = "";
    };
    modal.querySelectorAll("[data-triplem-ai-settings-close]").forEach(el => el.addEventListener("click", close));
    const keyInput = modal.querySelector("#triplemAiApiKey");
    modal.querySelector("#triplemAiEntryEye")?.addEventListener("click", event => {
      if (!keyInput) return;
      const show = keyInput.type === "password";
      keyInput.type = show ? "text" : "password";
      event.currentTarget.innerHTML = `<i class="fa-solid ${show ? "fa-eye-slash" : "fa-eye"}"></i>`;
      event.currentTarget.setAttribute("aria-label", show ? "Hide key" : "Show key while typing");
    });
    modal.querySelector("#triplemAiTestKey")?.addEventListener("click", async () => {
      try {
        setSettingsBusy(modal, true, "Testing the encrypted Gemini connection…");
        const result = await invoke("test_key");
        const ai = aiState();
        ai.lastTestedAt = new Date().toISOString();
        ai.model = result.model || ai.model;
        setSettingsBusy(modal, false, "Connection successful.");
        setTimeout(() => renderSettingsModal(modal), 700);
      } catch (error) {
        setSettingsBusy(modal, false, String(error?.message || "Connection test failed."));
      }
    });
    modal.querySelector("#triplemAiSaveKey")?.addEventListener("click", async () => {
      const ai = aiState();
      const key = String(keyInput?.value || "").trim();
      const model = String(modal.querySelector("#triplemAiModel")?.value || ai.model);
      try {
        if (!ai.configured && !key) throw new Error("Enter your Gemini API key first.");
        setSettingsBusy(modal, true, key ? "Testing and encrypting the Gemini API key…" : "Testing the selected Gemini model…");
        let result;
        if (key) result = await invoke("save_key", { api_key: key, model });
        else if (model !== ai.model) result = await invoke("update_model", { model });
        else result = await invoke("test_key");
        if (keyInput) keyInput.value = "";
        await refreshTriplemAiAccessState({ force: true });
        setSettingsBusy(modal, false, "Triplem AI connection saved securely.");
        renderSettingsModal(modal);
        renderTriplemAiWorkspace();
      } catch (error) {
        if (keyInput) keyInput.value = "";
        setSettingsBusy(modal, false, String(error?.message || "Could not save the Gemini connection."));
      }
    });
    modal.querySelector("#triplemAiDeleteKey")?.addEventListener("click", async () => {
      if (!confirm("Delete your encrypted Gemini API key from Triplem VIP? Triplem AI will remain available but disconnected until you add another key.")) return;
      try {
        setSettingsBusy(modal, true, "Deleting the encrypted Gemini credential…");
        await invoke("delete_key");
        const ai = aiState();
        ai.messages = [];
        await refreshTriplemAiAccessState({ force: true });
        renderSettingsModal(modal);
        renderTriplemAiWorkspace();
      } catch (error) {
        setSettingsBusy(modal, false, String(error?.message || "Could not delete the Gemini key."));
      }
    });
  }

  async function openTriplemAiSettingsModal() {
    const ai = await refreshTriplemAiAccessState();
    if (!ai?.access) {
      alert("Triplem AI is not enabled for this account. The protected Main Admin must grant access first.");
      return;
    }
    const modal = ensureSettingsModal();
    renderSettingsModal(modal);
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function accountSettingsCardHtml() {
    const ai = aiState();
    if (!ai?.access) return "";
    const status = ai.configured ? "Connected" : "Setup required";
    const note = ai.configured ? `${selectedModelLabel(ai.model)} · ${ai.keyMask || "Secure key"}` : "Connect your own Gemini API key securely.";
    return `<section class="settings-card account-security-card triplem-ai-account-card">
      <div class="settings-card-head"><span><i class="fa-solid fa-wand-magic-sparkles"></i> Triplem AI</span><span class="settings-pill ${ai.configured ? "is-ok" : ""}">${esc(status)}</span></div>
      <button type="button" class="account-settings-action-row triplem-ai-account-settings-row" id="accountTriplemAiBtn"><span class="account-settings-action-icon"><i class="fa-solid fa-brain"></i></span><span><strong>Gemini AI Integration</strong><small>${esc(note)}</small></span><i class="fa-solid fa-chevron-right"></i></button>
    </section>`;
  }

  window.refreshTriplemAiAccessState = refreshTriplemAiAccessState;
  window.resetTriplemAiState = resetTriplemAiState;
  window.triplemAiCanUse = canUseTriplemAi;
  window.prepareTriplemAiWorkspace = prepareTriplemAiWorkspace;
  window.renderTriplemAiWorkspace = renderTriplemAiWorkspace;
  window.openTriplemAiSettingsModal = openTriplemAiSettingsModal;
  window.openTriplemAiRecord = openTriplemAiRecord;
  window.openTriplemAiDraft = openAiDraft;
  window.aiOriginBadgeHtml = aiOriginBadgeHtml;
  window.isTriplemAiOrigin = isAiOriginRecord;
  window.isTriplemAiCreatedNote = value => /\[AI_CREATED\]/i.test(String(value || ""));
  window.triplemAiAccountSettingsCardHtml = accountSettingsCardHtml;
})();
