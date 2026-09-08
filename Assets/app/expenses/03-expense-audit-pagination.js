/* Triplem VIP — Expenses immutable audit lifecycle + compact record pagination. */
(() => {
  const PAGE_SIZE = 10;
  const auditState = () => state.expenseAudit || (state.expenseAudit = {
    rpcAvailable: null, inactiveQueryKey: "", inactiveEntries: [], historyCache: new Map(), loading: false, lastError: ""
  });
  const pageState = () => state.expensePagination || (state.expensePagination = {
    signature: "", pages: new Map(), pageSize: PAGE_SIZE
  });

  const esc = value => typeof escapeHtml === "function" ? escapeHtml(String(value ?? "")) : String(value ?? "");
  const asArray = value => Array.isArray(value) ? value : [];
  const unwrap = value => typeof unwrapRpcJson === "function" ? unwrapRpcJson(value) : value;
  const isMissingRpc = err => /does not exist|could not find|schema cache|42883|PGRST202/i.test(String(err?.message || err || ""));
  const statusRank = status => status === "archived" ? 2 : status === "deleted" ? 1 : 0;
  const publicStatus = status => status === "archived" ? "Permanently Deleted" : status === "deleted" ? "Deleted" : "";
  const statusClass = status => status === "archived" ? "is-archived" : status === "deleted" ? "is-deleted" : "";

  function queryKey(){
    const bounds = typeof expenseActivityQueryBounds === "function" ? expenseActivityQueryBounds() : { from:"", to:"", mode:"history" };
    return JSON.stringify({
      from: bounds?.from || "", to: bounds?.to || "", mode: bounds?.mode || "history",
      search: String(state.search?.expenses || "").trim().toLowerCase(),
      group: String(state.expenseWalletFilter || "all")
    });
  }

  function buildInactiveEntry(row){
    if (!row?.id) return null;
    let entry = typeof expenseActivityToEntry === "function" ? expenseActivityToEntry(row) : null;
    if (!entry) return null;
    const deletedNotes = typeof addDeletedTag === "function" ? addDeletedTag(entry.notes || "") : `${entry.notes || ""} [DELETED]`;
    entry = {
      ...entry,
      notes: deletedNotes,
      is_deleted: true,
      _expenseAuditInactive: true,
      _expenseAuditStatus: String(row.audit_status || "deleted").toLowerCase() === "archived" ? "archived" : "deleted",
      _expenseAuditEditCount: Math.max(0, Number(row.edit_count || 0)),
      _expenseAuditStatusAt: row.status_at || entry.updated_at || entry.created_at || null,
      account_type: row.account_type || ""
    };
    return entry;
  }

  function stripPriorInactive(){
    state.entries = state.entries.filter(row => !row?._expenseAuditInactive);
  }

  function syncRecycleBin(inactive){
    if (!Array.isArray(state.recycleBin)) return;
    const byId = new Map(state.recycleBin.map(item => [String(item?.id || ""), item]));
    let changed = false;
    for (const entry of inactive){
      const id = String(entry.id || "");
      if (!id) continue;
      if (entry._expenseAuditStatus === "archived") {
        if (byId.has(id)) {
          state.recycleBin = state.recycleBin.filter(item => String(item?.id || "") !== id);
          byId.delete(id); changed = true;
        }
        continue;
      }
      if (!byId.has(id)) {
        state.recycleBin.push({
          ...entry,
          deletedAt: entry._expenseAuditStatusAt || new Date().toISOString(),
          originalSection: "expenses",
          _expenseAuditSynced: true
        });
        byId.set(id, entry); changed = true;
      }
    }
    if (changed && typeof saveRecycleBinToStorage === "function") saveRecycleBinToStorage();
    if (changed && typeof renderRecycleBinDropdown === "function") renderRecycleBinDropdown();
  }

  async function refreshInactiveForCurrentQuery({ force = false } = {}){
    const s = auditState();
    if (s.rpcAvailable === false) return [];
    const key = queryKey();
    if (!force && s.inactiveQueryKey === key) return s.inactiveEntries || [];
    const bounds = typeof expenseActivityQueryBounds === "function" ? expenseActivityQueryBounds() : { from:null,to:null };
    if (bounds?.mode === "history" && state.expenseHistoryRange === "custom" && !bounds.from && !bounds.to) {
      stripPriorInactive(); s.inactiveEntries = []; s.inactiveQueryKey = key; return [];
    }
    s.loading = true;
    try {
      const payload = unwrap(await supabaseRpc("app_list_my_expense_inactive_activity", {
        p_from: bounds?.from || null,
        p_to: bounds?.to || null,
        p_search: String(state.search?.expenses || "").trim() || null,
        p_group_id: state.expenseWalletFilter && state.expenseWalletFilter !== "all" ? String(state.expenseWalletFilter) : null,
        p_limit: 2000,
        p_offset: 0
      }));
      const rows = asArray(payload?.items || payload);
      const inactive = rows.map(buildInactiveEntry).filter(Boolean);
      stripPriorInactive();
      state.entries.push(...inactive);
      s.rpcAvailable = true;
      s.inactiveEntries = inactive;
      s.inactiveQueryKey = key;
      s.lastError = "";
      syncRecycleBin(inactive);
      return inactive;
    } catch (err) {
      if (isMissingRpc(err)) { s.rpcAvailable = false; return []; }
      s.lastError = String(err?.message || err || "Audit activity load failed");
      console.warn("Expenses audit activity could not be loaded.", err);
      return [];
    } finally { s.loading = false; }
  }

  function getInactiveEntries(){ return asArray(auditState().inactiveEntries); }
  function inactiveStatus(record){ return String(record?._expenseAuditStatus || record?.auditStatus || "").toLowerCase(); }
  function isInactive(record){ return statusRank(inactiveStatus(record)) > 0; }
  function badgeHtml(status, { count = 0, clickable = false } = {}){
    status = String(status || "").toLowerCase();
    if (status === "edited") {
      const label = count > 1 ? `Edited ${count} times` : "Edited";
      return `<button type="button" class="expense-audit-badge is-edited${clickable ? " is-clickable" : ""}" ${clickable ? "data-expense-audit-history" : "disabled"}><i class="fa-solid fa-pen-to-square"></i>${esc(label)}</button>`;
    }
    const label = publicStatus(status);
    if (!label) return "";
    return `<span class="expense-audit-badge ${statusClass(status)}"><i class="fa-solid ${status === "archived" ? "fa-ban" : "fa-trash-can"}"></i>${esc(label)}</span>`;
  }

  function accountForGroup(groupId){
    const gid = String(groupId || "");
    return (typeof getExpenseAccounts === "function" ? getExpenseAccounts({ applyUiFilters:false }) : []).find(a => String(a.group_id || "") === gid) || null;
  }

  function inactiveExpenseTransactionById(id){
    const row = getInactiveEntries().find(e => String(e.id) === String(id));
    if (!row) return null;
    const meta = expenseMetaFromNotes(row.notes || "");
    if (String(meta.rowType || "").toUpperCase() !== "EXPENSE" || String(meta.expenseType || "").toLowerCase() === "transfer") return null;
    const account = accountForGroup(row.group_id);
    const gross = Number(row.action_amount || 0);
    const tax = typeof taxBreakdownFromMeta === "function" ? taxBreakdownFromMeta(meta, gross) : {net:gross,tax:0,rate:0,mode:""};
    return {
      id: row.id, date: row.action_date, createdAt: row.created_at || row.updated_at || null,
      wallet: account?.person_name || row.person_name || "Wallet", group_id: row.group_id,
      amount: gross, netAmount: Number(tax.net || 0), taxAmount: Number(tax.tax || 0), taxRate: Number(tax.rate || 0), taxMode: tax.mode,
      expenseType: meta.expenseType || "Other", itemName: meta.itemName || row.item_name || "Expense",
      currency: account?.currency || row.currency || "AED", notes: cleanExpenseNote(row.notes || ""),
      details: normalizeExpenseDetails(meta.details || {}), auditStatus: inactiveStatus(row), editCount: row._expenseAuditEditCount || 0
    };
  }

  function mergeInactiveItems(items){
    const byKey = new Map((items || []).map(item => [item.key, item]));
    const activeGroups = new Set((typeof getExpenseAccounts === "function" ? getExpenseAccounts({ applyUiFilters:false }) : []).map(a => String(a.group_id || "")));
    for (const row of getInactiveEntries()) {
      if (!activeGroups.has(String(row.group_id || ""))) continue;
      const tx = inactiveExpenseTransactionById(row.id);
      if (!tx) continue;
      const key = `${tx.currency}||${String(tx.itemName || "Expense").trim().toLowerCase()}`;
      let item = byKey.get(key);
      if (!item) {
        item = { key, displayName: tx.itemName || "Expense", expenseType: tx.expenseType || "Other", currency:tx.currency, total:0, taxTotal:0, netTotal:0, txs:[], transactionCount:0, detailComplete:true };
        byKey.set(key,item);
      }
      if (!(item.txs || []).some(t => String(t.id) === String(tx.id))) item.txs.push(tx);
      item.inactiveCount = Number(item.inactiveCount || 0) + 1;
      item.txs.sort((a,b) => (dateStamp(b.date) - dateStamp(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    }
    return [...byKey.values()].sort((a,b) => Number(b.total||0)-Number(a.total||0) || String(a.displayName||"").localeCompare(String(b.displayName||"")));
  }

  function inactiveTopupsForAccounts(accounts){
    const byGroup = new Map((accounts || []).map(a => [String(a.group_id || ""), a]));
    return getInactiveEntries().filter(row => {
      const meta = expenseMetaFromNotes(row.notes || "");
      return String(meta.rowType || "").toUpperCase() === "TOPUP" && byGroup.has(String(row.group_id || ""));
    }).map(row => {
      const account = byGroup.get(String(row.group_id || ""));
      return {
        ...row,
        person_name: account?.person_name || row.person_name,
        currency: account?.currency || row.currency,
        accountType: account?.accountType || row.account_type || "",
        isTopup: true,
        auditStatus: inactiveStatus(row)
      };
    });
  }

  function appendInactiveToAccounts(accounts){
    const inactive = getInactiveEntries();
    if (!inactive.length) return accounts || [];
    const clones = (accounts || []).map(a => ({ ...a, spends:[...(a.spends||[])], topups:[...(a.topups||[])] }));
    const byGroup = new Map(clones.map(a => [String(a.group_id || ""), a]));
    for (const row of inactive){
      const account = byGroup.get(String(row.group_id || "")); if (!account) continue;
      const meta = expenseMetaFromNotes(row.notes || "");
      const rt = String(meta.rowType || "").toUpperCase();
      const target = rt === "TOPUP" ? account.topups : rt === "EXPENSE" ? account.spends : null;
      if (target && !target.some(x => String(x.id) === String(row.id))) target.push(row);
    }
    return clones;
  }

  function historyCacheKey(id){ return String(id || ""); }
  async function loadHistory(ids, { force = false } = {}){
    const s = auditState();
    const unique = [...new Set(asArray(ids).map(String).filter(Boolean))];
    const all = [];
    for (const id of unique) {
      if (!force && s.historyCache.has(historyCacheKey(id))) { all.push(...s.historyCache.get(historyCacheKey(id))); continue; }
      try {
        const payload = unwrap(await supabaseRpc("app_list_my_expense_audit_history", { p_transaction_id:id }));
        const rows = asArray(payload?.items || payload);
        s.historyCache.set(historyCacheKey(id), rows); all.push(...rows);
      } catch (err) { if (!isMissingRpc(err)) console.warn("Expense audit history load failed.", err); }
    }
    return all.sort((a,b) => String(b.created_at||"").localeCompare(String(a.created_at||"")) || String(b.id||"").localeCompare(String(a.id||"")));
  }

  function logicalEditCount(events){
    const edited = asArray(events).filter(e => e.event_type === "edited")
      .slice().sort((a,b) => String(a.created_at||"").localeCompare(String(b.created_at||"")));
    const groups = [];
    for (const ev of edited) {
      const stamp = new Date(ev.created_at || 0).getTime();
      const last = groups[groups.length - 1];
      const txId = String(ev.transaction_id || "");
      if (last && Number.isFinite(stamp) && Math.abs(stamp - last.stamp) <= 1500 && !last.transactionIds.has(txId)) {
        last.transactionIds.add(txId); last.stamp = Math.max(last.stamp, stamp);
      } else {
        groups.push({ stamp:Number.isFinite(stamp) ? stamp : 0, transactionIds:new Set([txId || String(ev.id || "")]) });
      }
    }
    return groups.length;
  }

  const FRIENDLY_FIELDS = [
    ["amount","Amount"],["action_amount","Amount"],["expense_date","Date"],["topup_date","Date"],["action_date","Date"],
    ["account_name","Wallet"],["item_name","Item"],["expense_type","Type"],["currency","Currency"],["notes","Notes"],["details","Optional details"]
  ];
  function displayAuditValue(key,value){
    if (value == null || value === "") return "—";
    if (key === "details" && typeof value === "object") return JSON.stringify(value);
    if (/amount/.test(key)) return String(value);
    return String(value);
  }
  function friendlyChanges(ev){
    const before = ev?.snapshot_before || {}, after = ev?.snapshot_after || {};
    const seen = new Set(); const rows = [];
    for (const [key,label] of FRIENDLY_FIELDS){
      if (seen.has(label)) continue;
      const a = before[key], b = after[key];
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      seen.add(label); rows.push({label, before:displayAuditValue(key,a), after:displayAuditValue(key,b)});
    }
    return rows;
  }
  function eventTitle(type){ return ({edited:"Edited",deleted:"Deleted",restored:"Restored",archived:"Permanently Deleted"})[type] || "Changed"; }
  function historyHtml(events){
    if (!events.length) return `<div class="expense-audit-empty"><i class="fa-solid fa-clock-rotate-left"></i><p>No recorded revisions are available for this legacy transaction.</p></div>`;
    return `<div class="expense-audit-history">${events.map(ev => {
      const changes = friendlyChanges(ev);
      const when = expenseRecordedText(ev.created_at);
      return `<article class="expense-audit-event ${statusClass(ev.event_type)}">
        <header><span class="expense-audit-event-title">${esc(eventTitle(ev.event_type))}</span><small>${esc(when)} · ${esc(ev.actor || "System")}</small></header>
        ${changes.length ? `<div class="expense-audit-diff">${changes.map(c => `<div><small>${esc(c.label)}</small><span>${esc(c.before)}</span><i class="fa-solid fa-arrow-right"></i><strong>${esc(c.after)}</strong></div>`).join("")}</div>` : `<p class="expense-audit-event-note">Lifecycle status changed; the financial values were preserved.</p>`}
        <details class="expense-audit-raw"><summary>Raw record</summary><div><label>Before</label><pre>${esc(JSON.stringify(ev.snapshot_before || {}, null, 2))}</pre><label>After</label><pre>${esc(JSON.stringify(ev.snapshot_after || {}, null, 2))}</pre></div></details>
      </article>`;
    }).join("")}</div>`;
  }

  async function decorateDetailModal(modal, { ids = [], status = "", recordType = "expense", recordId = "" } = {}){
    if (!modal) return;
    modal.dataset.expenseAuditRecordType = String(recordType || "expense");
    modal.dataset.expenseAuditRecordId = String(recordId || ids?.[0] || "");
    let host = modal.querySelector(".expense-audit-badge-host");
    if (!host) {
      host = document.createElement("div"); host.className = "expense-audit-badge-host";
      modal.querySelector(".modal-head > div")?.appendChild(host);
    }
    host.innerHTML = status ? badgeHtml(status) : "";
    // Always refresh on open so an edit made earlier in this session is reflected immediately.
    const events = await loadHistory(ids, { force: true });
    if (!modal.classList.contains("hide")) {
      const edits = logicalEditCount(events);
      if (edits) host.insertAdjacentHTML("beforeend", badgeHtml("edited", {count:edits, clickable:true}));
      const button = host.querySelector("[data-expense-audit-history]");
      if (button) button.onclick = () => showHistoryInSameModal(modal, events);
    }
  }
  function showHistoryInSameModal(modal, events){
    const title = modal.querySelector("#expenseTxDetailTitle"); const meta = modal.querySelector("#expenseTxDetailMeta"); const body = modal.querySelector("#expenseTxDetailBody");
    if (!title || !body) return;
    title.textContent = "Transaction history"; if (meta) meta.textContent = "Immutable edit and lifecycle record";
    body.innerHTML = `<div class="expense-audit-history-toolbar"><button type="button" class="btn ghost" data-expense-audit-back><i class="fa-solid fa-angle-left"></i> Back to transaction</button></div>${historyHtml(events)}`;
    body.querySelector("[data-expense-audit-back]")?.addEventListener("click", () => {
      const type = String(modal.dataset.expenseAuditRecordType || "expense");
      const id = String(modal.dataset.expenseAuditRecordId || "");
      if (!id) return;
      if (type === "expense") openExpenseTransactionDetail(id);
      else openExpenseRecordDetail(type, id);
    });
  }
  function resetModalAuditSnapshot(modal){ if (modal) { delete modal.dataset.expenseAuditRecordType; delete modal.dataset.expenseAuditRecordId; } }

  function isAuditableEntry(item){
    if (!item?.id || item?.entry_kind === "principal" || !hasExpenseAccountTag(item.notes || "")) return false;
    const meta = expenseMetaFromNotes(item.notes || "");
    const rowType = String(meta.rowType || "").toUpperCase();
    return rowType === "EXPENSE" || rowType === "TOPUP";
  }
  function isAuditableRecycleItem(item){
    return item?.originalSection === "expenses" && isAuditableEntry(item);
  }
  function relatedRecycleIds(item){
    if (!item?.id) return [];
    if (item._expenseRecyclePairId) return [...new Set([String(item.id),String(item._expenseRecyclePairId)].filter(Boolean))];
    const meta = expenseMetaFromNotes(item.notes || "");
    if (String(meta.expenseType || "").toLowerCase() !== "transfer") return [String(item.id)];
    const rt = String(meta.rowType || "").toUpperCase();
    const clean = cleanExpenseNote(item.notes || "");
    const counterpart = state.recycleBin.find(candidate => {
      if (!candidate?.id || String(candidate.id) === String(item.id)) return false;
      const cm = expenseMetaFromNotes(candidate.notes || "");
      if (String(cm.expenseType || "").toLowerCase() !== "transfer" || String(cm.rowType || "").toUpperCase() === rt) return false;
      if (String(candidate.action_date || candidate.loan_date || "") !== String(item.action_date || item.loan_date || "")) return false;
      const otherClean = cleanExpenseNote(candidate.notes || "");
      if (rt === "EXPENSE") return clean.includes(`Transfer to ${candidate.person_name}`) && otherClean.includes(`Transfer from ${item.person_name}`);
      return clean.includes(`Transfer from ${candidate.person_name}`) && otherClean.includes(`Transfer to ${item.person_name}`);
    });
    return [...new Set([String(item.id), counterpart?.id ? String(counterpart.id) : ""].filter(Boolean))];
  }
  async function softDeleteIds(ids){
    const unique=[...new Set(asArray(ids).map(String).filter(Boolean))]; if(!unique.length) return;
    await supabaseRpc("app_soft_delete_my_expense_transactions", {p_ids:unique});
    auditState().historyCache = new Map(); auditState().inactiveQueryKey="";
  }
  async function archiveIds(ids){
    const unique=[...new Set(asArray(ids).map(String).filter(Boolean))]; if(!unique.length) return;
    await supabaseRpc("app_archive_my_expense_transactions", {p_ids:unique});
    auditState().historyCache = new Map(); auditState().inactiveQueryKey="";
  }
  async function restoreIds(ids){
    const unique=[...new Set(asArray(ids).map(String).filter(Boolean))]; if(!unique.length) return;
    await supabaseRpc("app_restore_my_expense_transactions", {p_ids:unique});
    auditState().historyCache = new Map(); auditState().inactiveQueryKey="";
  }
  async function refreshAfterLifecycle(){
    if (typeof invalidateAndRefreshExpenseLazy === "function") {
      try { await invalidateAndRefreshExpenseLazy({refreshActivity:true}); } catch (_) {}
    }
    await refreshInactiveForCurrentQuery({force:true});
    if (typeof invalidateExpenseAccountsSyncCache === "function") invalidateExpenseAccountsSyncCache();
    if (typeof renderExpenseOverviewWallets === "function") renderExpenseOverviewWallets();
    if (typeof renderExpensesList === "function" && (typeof getActiveTabKey !== "function" || getActiveTabKey()==="expenses")) renderExpensesList();
  }

  const ExpenseAudit = {
    refreshInactiveForCurrentQuery, getInactiveEntries, inactiveStatus, isInactive, badgeHtml, publicStatus,
    mergeInactiveItems, inactiveTopupsForAccounts, appendInactiveToAccounts, inactiveExpenseTransactionById,
    loadHistory, decorateDetailModal, resetModalAuditSnapshot, isAuditableEntry, isAuditableRecycleItem, relatedRecycleIds, softDeleteIds, archiveIds, restoreIds, refreshAfterLifecycle
  };
  window.ExpenseAudit = ExpenseAudit;

  function signature(){
    return JSON.stringify({view:state.expenseRecordView,search:state.search?.expenses||"",wallet:state.expenseWalletFilter||"all",from:state.expenseDateFrom||"",to:state.expenseDateTo||"",range:state.expenseHistoryRange||"",cf:state.expenseHistoryCustomFrom||"",ct:state.expenseHistoryCustomTo||""});
  }
  function prepare(){ const p=pageState(), sig=signature(); if(p.signature!==sig){p.signature=sig;p.pages=new Map();} }
  function getPage(key){ return Math.max(1, Number(pageState().pages.get(String(key)) || 1)); }
  function setPage(key,page,totalPages){ pageState().pages.set(String(key),Math.max(1,Math.min(Number(page)||1,Math.max(1,Number(totalPages)||1)))); }
  function slice(key, rows){
    prepare(); const list=asArray(rows), total=list.length, totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE)); let page=getPage(key); if(page>totalPages){page=totalPages;setPage(key,page,totalPages);} const start=(page-1)*PAGE_SIZE;
    return {items:list.slice(start,start+PAGE_SIZE),page,totalPages,total,start,end:Math.min(total,start+PAGE_SIZE)};
  }
  function visiblePages(page,total){
    if(total<=5) return Array.from({length:total},(_,i)=>i+1);
    const set=new Set([1,total,page-1,page,page+1]); return [...set].filter(n=>n>=1&&n<=total).sort((a,b)=>a-b);
  }
  function html(key, pageInfo){
    if(!pageInfo || pageInfo.totalPages<=1) return "";
    const safe=esc(key); const nums=visiblePages(pageInfo.page,pageInfo.totalPages); let previous=0;
    const pages=nums.map(n=>{const gap=previous&&n-previous>1?`<span class="expense-page-ellipsis">…</span>`:"";previous=n;return `${gap}<button type="button" class="expense-page-number${n===pageInfo.page?" is-active":""}" data-expense-page-key="${safe}" data-expense-page="${n}" aria-label="Page ${n}">${n}</button>`;}).join("");
    return `<nav class="expense-pagination" aria-label="Transaction pages"><button type="button" class="expense-page-nav" data-expense-page-key="${safe}" data-expense-page="${pageInfo.page-1}" ${pageInfo.page<=1?"disabled":""} aria-label="Previous page"><i class="fa-solid fa-angle-left"></i></button><div class="expense-pagination-pages">${pages}</div><span class="expense-pagination-mobile">${pageInfo.page} / ${pageInfo.totalPages}</span><button type="button" class="expense-page-nav" data-expense-page-key="${safe}" data-expense-page="${pageInfo.page+1}" ${pageInfo.page>=pageInfo.totalPages?"disabled":""} aria-label="Next page"><i class="fa-solid fa-angle-right"></i></button></nav>`;
  }
  window.ExpensePagination = {prepare,slice,html,setPage,getPage,PAGE_SIZE};

  document.addEventListener("click", e => {
    const btn=e.target.closest?.("[data-expense-page-key][data-expense-page]"); if(!btn) return;
    e.preventDefault(); const key=btn.dataset.expensePageKey; const page=Number(btn.dataset.expensePage||1); setPage(key,page,999999); if(typeof renderExpensesList==="function") renderExpensesList();
  });
})();
