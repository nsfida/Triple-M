/* Persistent, owner-scoped offline queue + compact entry confirmations. */
const OFFLINE_QUEUE_STORAGE_KEY = "triplem-offline-entry-queue-v1";
const OFFLINE_QUEUE_VERSION = 1;
const OFFLINE_SYNC_BASE_DELAY_MS = 5000;
const OFFLINE_SYNC_MAX_DELAY_MS = 5 * 60 * 1000;
const OFFLINE_DIRECT_TABLES = new Set([
  "app_notes",
  "app_assets",
  "app_asset_transactions",
  "depreciation_assets",
  "depreciation_history",
  "depreciation_usage_entries"
]);

function isConnectivityFailure(error){
  if (!error) return !navigator.onLine;
  if (error.isConnectivityError === true || error.code === "NETWORK_ERROR") return true;
  const status = Number(error.status || 0);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(error.message || error || "");
  return /failed to fetch|network(?:error| request failed)|database request failed|load failed|connection|offline|timed?\s*out|ERR_(?:INTERNET|NETWORK|CONNECTION)/i.test(message);
}

function offlineEscape(value){
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureEntryToastRegion(){
  let region = document.getElementById("entryToastRegion");
  if (region) return region;
  region = document.createElement("div");
  region.id = "entryToastRegion";
  region.className = "entry-toast-region";
  region.setAttribute("aria-live", "polite");
  region.setAttribute("aria-atomic", "true");
  document.body.appendChild(region);
  return region;
}

function showEntryConfirmation(message, type = "success", options = {}){
  const text = String(message || "").trim();
  if (!text) return null;
  const region = ensureEntryToastRegion();
  const tone = ["success", "error", "warning"].includes(type) ? type : "success";
  const now = Date.now();
  const duplicate = [...region.querySelectorAll(".entry-toast")].find(item =>
    item.dataset.toastMessage === text
    && item.dataset.toastTone === tone
    && Number(item.dataset.toastExpiresAt || 0) > now
  );
  if (duplicate) return duplicate;
  const toast = document.createElement("div");
  toast.className = `entry-toast entry-toast--${tone}`;
  toast.setAttribute("role", tone === "error" ? "alert" : "status");
  const icon = tone === "error" ? "fa-circle-exclamation" : tone === "warning" ? "fa-cloud-arrow-up" : "fa-circle-check";
  toast.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span>${offlineEscape(text)}</span>`;
  const duration = Math.max(1200, Number(options.duration || 2000));
  toast.dataset.toastMessage = text;
  toast.dataset.toastTone = tone;
  toast.dataset.toastExpiresAt = String(now + duration + 250);
  region.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  const remove = () => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 220);
  };
  setTimeout(remove, duration);
  return toast;
}

function readOfflineQueue(){
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(item => item && item.version === OFFLINE_QUEUE_VERSION) : [];
  } catch (_) {
    return [];
  }
}

function writeOfflineQueue(queue){
  try {
    localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(Array.isArray(queue) ? queue : []));
    return true;
  } catch (error) {
    console.error("Offline queue could not be persisted.", error);
    showEntryConfirmation("Local save failed because browser storage is unavailable.", "error");
    return false;
  }
}

function offlineQueueOwnerId(){
  try { return String((typeof currentOwnerId === "function" ? currentOwnerId() : "") || state.sessionUser?.team_owner_id || state.sessionUser?.id || ""); }
  catch (_) { return String(state.sessionUser?.team_owner_id || state.sessionUser?.id || ""); }
}

function sanitizeOfflineLedgerRow(row){
  const allowed = [
    "id", "group_id", "direction", "entry_kind", "person_name", "currency",
    "principal_amount", "action_amount", "loan_date", "action_date", "notes",
    "created_at", "updated_at", "owner_id", "meta", "domain_table", "data_origin", "is_legacy_meta"
  ];
  return allowed.reduce((out, key) => {
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) out[key] = row[key];
    return out;
  }, {});
}

function safeOfflineClone(value){
  try { return JSON.parse(JSON.stringify(value)); }
  catch (_) { return null; }
}

function offlinePayloadIsSafe(value){
  let text = "";
  try { text = JSON.stringify(value || {}); } catch (_) { return false; }
  return !/(?:private[_\s-]?key|seed[_\s-]?phrase|mnemonic|\bWIF\b|xprv|BITCOIN_WALLET)/i.test(text);
}

function offlineQueueRowsAreSafe(rows){
  if (!Array.isArray(rows) || !rows.length || !window.DomainLedger?.classifyLedgerEntry) return false;
  const supported = new Set(["expenses", "inventory", "installments", "loans_given", "loans_taken"]);
  return rows.every(row => {
    if (!row?.id || !row?.group_id) return false;
    if (!supported.has(DomainLedger.classifyLedgerEntry(row))) return false;
    return offlinePayloadIsSafe(sanitizeOfflineLedgerRow(row));
  });
}

function offlineOperationEntityIds(operation){
  const ids = new Set();
  (operation?.entityIds || []).forEach(id => id && ids.add(String(id)));
  (operation?.rows || []).forEach(row => row?.id && ids.add(String(row.id)));
  (operation?.steps || []).forEach(step => (step?.rows || []).forEach(row => row?.id && ids.add(String(row.id))));
  return [...ids];
}

function operationMatchesEntity(operation, entityId){
  const id = String(entityId || "");
  return !!id && offlineOperationEntityIds(operation).includes(id);
}

function queueOfflineLedgerInsert(rows, label = "Entry"){
  const ownerId = offlineQueueOwnerId();
  const list = (Array.isArray(rows) ? rows : [rows]).filter(Boolean);
  if (!ownerId || !offlineQueueRowsAreSafe(list)) return false;
  const queue = readOfflineQueue();
  const rowIds = list.map(row => String(row.id)).sort();
  const duplicate = queue.some(item =>
    item.ownerId === ownerId
    && item.type === "ledger-insert"
    && Array.isArray(item.rows)
    && item.rows.map(row => String(row.id)).sort().join("|") === rowIds.join("|")
  );
  if (!duplicate) {
    queue.push({
      version: OFFLINE_QUEUE_VERSION,
      operationId: crypto.randomUUID(),
      ownerId,
      type: "ledger-insert",
      label: String(label || "Entry").slice(0, 80),
      rows: list.map(sanitizeOfflineLedgerRow),
      entityIds: rowIds,
      createdAt: new Date().toISOString(),
      attempts: 0,
      nextAttemptAt: 0,
      lastError: ""
    });
    if (!writeOfflineQueue(queue)) return false;
  }
  list.forEach(row => {
    row._syncStatus = "pending";
    if (row.id) state.pendingDbSyncIds.add(row.id);
  });
  updateOfflineSyncStatus();
  return true;
}

function queueOfflineTableInsert(table, rows, label = "Entry", options = {}){
  const ownerId = offlineQueueOwnerId();
  const normalizedTable = String(table || "").trim();
  const list = (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(safeOfflineClone).filter(Boolean);
  const providedSteps = Array.isArray(options.steps) ? options.steps : null;
  const steps = providedSteps
    ? providedSteps.map(step => ({
        table: String(step?.table || "").trim(),
        rows: (Array.isArray(step?.rows) ? step.rows : [step?.rows]).filter(Boolean).map(safeOfflineClone).filter(Boolean)
      }))
    : [{ table: normalizedTable, rows: list }];
  if (!ownerId || !steps.length || steps.some(step => !OFFLINE_DIRECT_TABLES.has(step.table) || !step.rows.length || !offlinePayloadIsSafe(step.rows))) return false;
  const entityIds = [...new Set((options.entityIds || steps.flatMap(step => step.rows.map(row => row?.id))).filter(Boolean).map(String))];
  if (!entityIds.length) return false;
  const queue = readOfflineQueue();
  const signature = entityIds.slice().sort().join("|");
  const duplicate = queue.some(item => item.ownerId === ownerId && item.type === "table-insert" && offlineOperationEntityIds(item).slice().sort().join("|") === signature);
  if (!duplicate) {
    queue.push({
      version: OFFLINE_QUEUE_VERSION,
      operationId: crypto.randomUUID(),
      ownerId,
      type: "table-insert",
      label: String(label || "Entry").slice(0, 80),
      steps,
      entityIds,
      createdAt: new Date().toISOString(),
      attempts: 0,
      nextAttemptAt: 0,
      lastError: ""
    });
    if (!writeOfflineQueue(queue)) return false;
  }
  entityIds.forEach(id => state.pendingDbSyncIds.add(id));
  updateOfflineSyncStatus();
  return true;
}

function queuedOperationsForCurrentOwner(){
  const ownerId = offlineQueueOwnerId();
  return ownerId ? readOfflineQueue().filter(item => item.ownerId === ownerId) : [];
}

function getOfflineTableRows(table){
  const wanted = String(table || "").trim();
  if (!wanted) return [];
  const rows = [];
  queuedOperationsForCurrentOwner().forEach(operation => {
    (operation.steps || []).forEach(step => {
      if (step?.table !== wanted) return;
      (step.rows || []).forEach(row => rows.push({ ...safeOfflineClone(row), _syncStatus: "pending" }));
    });
  });
  return rows.filter(Boolean);
}

function hasPendingOfflineEntity(entityId){
  const id = String(entityId || "");
  return !!id && queuedOperationsForCurrentOwner().some(operation => operationMatchesEntity(operation, id));
}

function offlinePendingEntryIdForGroup(groupId){
  const gid = String(groupId || "");
  if (!gid) return "";
  const row = (state.entries || []).find(entry => String(entry?.group_id || "") === gid && entry?.id && hasPendingOfflineEntity(entry.id));
  return row?.id ? String(row.id) : "";
}

function offlinePendingBadgeHtml(entityId){
  if (!hasPendingOfflineEntity(entityId)) return "";
  return `<span class="offline-entry-pending"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Saved locally</span>`;
}

function offlineSyncButtonHtml(entityId, label = "Save"){
  const id = String(entityId || "");
  if (!id || !hasPendingOfflineEntity(id)) return "";
  return `<button type="button" class="offline-entry-save-btn" data-offline-sync-id="${offlineEscape(id)}" title="Save this local entry to database" aria-label="Save this local entry to database"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i><span>${offlineEscape(label || "Save")}</span></button>`;
}

function updateOfflineSyncStatus(){
  const pending = queuedOperationsForCurrentOwner();
  state.offlineSync.pendingCount = pending.length;
  const button = document.getElementById("offlineSyncStatus");
  const count = document.getElementById("offlineSyncCount");
  if (!button || !count) return;
  const visible = !!state.unlocked && pending.length > 0;
  button.classList.toggle("hide", !visible);
  button.classList.toggle("is-syncing", !!state.offlineSync.syncing);
  button.classList.toggle("is-error", !!state.offlineSync.lastError && !state.offlineSync.syncing);
  count.textContent = String(pending.length);
  button.title = state.offlineSync.syncing
    ? `Synchronizing ${pending.length} pending operation${pending.length === 1 ? "" : "s"}`
    : `${pending.length} operation${pending.length === 1 ? "" : "s"} saved locally`;
  button.setAttribute("aria-label", button.title);
}

function rehydrateOfflineEntriesForCurrentUser(){
  const operations = queuedOperationsForCurrentOwner();
  if (!operations.length) {
    updateOfflineSyncStatus();
    return 0;
  }
  const existingIds = new Set((state.entries || []).map(row => row?.id).filter(Boolean));
  const restored = [];
  operations.filter(operation => operation.type === "ledger-insert").forEach(operation => {
    (operation.rows || []).forEach(stored => {
      if (!stored?.id) return;
      state.pendingDbSyncIds.add(stored.id);
      const live = state.entries.find(row => row?.id === stored.id);
      if (live) {
        live._syncStatus = "pending";
        return;
      }
      if (!existingIds.has(stored.id)) {
        restored.push({ ...stored, _syncStatus: "pending", data_origin: stored.data_origin || "domain", is_legacy_meta: !!stored.is_legacy_meta });
        existingIds.add(stored.id);
      }
    });
  });
  operations.filter(operation => operation.type === "table-insert").forEach(operation => {
    offlineOperationEntityIds(operation).forEach(id => state.pendingDbSyncIds.add(id));
  });
  if (restored.length) state.entries.unshift(...restored);
  updateOfflineSyncStatus();
  return restored.length;
}

async function replayOfflineLedgerRows(rows){
  for (const row of rows || []) {
    if (window.DomainLedger?.upsertDomainEntry) {
      const result = await DomainLedger.upsertDomainEntry(row);
      if (!result?.usedLedger) continue;
    }
    const existing = await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(row.id)}&select=id`);
    if (Array.isArray(existing) && existing.length) continue;
    await supabase(CONFIG.table, {
      method: "POST",
      body: JSON.stringify(databaseInsertPayload(row)),
      headers: { Prefer: "return=minimal" }
    });
  }
}

async function replayOfflineTableSteps(steps){
  for (const step of steps || []) {
    if (!OFFLINE_DIRECT_TABLES.has(step?.table)) throw new Error("Unsupported offline table operation.");
    for (const row of step.rows || []) {
      if (!row) continue;
      if (row.id) {
        const existing = await supabase(`${step.table}?id=eq.${encodeURIComponent(row.id)}&select=id`);
        if (Array.isArray(existing) && existing.length) continue;
      }
      await supabase(step.table, {
        method: "POST",
        body: JSON.stringify(row),
        headers: { Prefer: "return=minimal" }
      });
    }
  }
}

function offlineRetryDelay(attempts){
  const exp = Math.min(OFFLINE_SYNC_MAX_DELAY_MS, OFFLINE_SYNC_BASE_DELAY_MS * (2 ** Math.min(6, Math.max(0, attempts - 1))));
  return Math.round(exp * (0.85 + Math.random() * 0.3));
}

function scheduleOfflineSync(delayMs = 1200){
  if (state.offlineSync.retryTimer) clearTimeout(state.offlineSync.retryTimer);
  state.offlineSync.retryTimer = setTimeout(() => {
    state.offlineSync.retryTimer = null;
    syncOfflineQueue().catch(() => {});
  }, Math.max(250, Number(delayMs) || 1200));
}

function markOfflineOperationSyncedInMemory(operation){
  const ids = new Set(offlineOperationEntityIds(operation));
  (state.entries || []).forEach(row => {
    if (!ids.has(String(row?.id || ""))) return;
    delete row._syncStatus;
    row.data_origin = row.data_origin || "domain";
  });
  [state.notes, state.assets, state.assetTransactions].forEach(collection => {
    (collection || []).forEach(item => {
      if (ids.has(String(item?.id || ""))) delete item._syncStatus;
    });
  });
  ids.forEach(id => state.pendingDbSyncIds.delete(id));
  try {
    window.dispatchEvent(new CustomEvent("triplem:offline-entry-synced", {
      detail: { ids: [...ids], operationId: operation.operationId, label: operation.label, steps: operation.steps || [] }
    }));
  } catch (_) {}
}

async function syncOfflineQueue(options = {}){
  if (state.offlineSync.syncing || !state.unlocked || isGuestMode() || !state.sessionToken) return false;
  const ownerId = offlineQueueOwnerId();
  if (!ownerId) return false;
  const all = readOfflineQueue();
  const requestedIds = new Set((options.entityIds || (options.entityId ? [options.entityId] : [])).filter(Boolean).map(String));
  const matchesRequested = operation => !requestedIds.size || [...requestedIds].some(id => operationMatchesEntity(operation, id));
  const due = all.filter(item => item.ownerId === ownerId && matchesRequested(item) && (options.force || Number(item.nextAttemptAt || 0) <= Date.now()));
  if (!due.length) {
    updateOfflineSyncStatus();
    if (options.userInitiated && requestedIds.size) showEntryConfirmation("This entry is already saved to the database.", "success");
    return true;
  }
  if (!navigator.onLine) {
    state.offlineSync.lastError = "No internet connection";
    updateOfflineSyncStatus();
    if (options.userInitiated) showEntryConfirmation("Still offline. The entry remains safely saved on this device.", "warning");
    return false;
  }
  state.offlineSync.syncing = true;
  state.offlineSync.lastError = "";
  updateOfflineSyncStatus();
  let changed = false;
  let syncedCount = 0;
  let firstSyncedLabel = "";
  try {
    for (const operation of due) {
      try {
        if (operation.type === "ledger-insert") await replayOfflineLedgerRows(operation.rows || []);
        else if (operation.type === "table-insert") await replayOfflineTableSteps(operation.steps || []);
        else throw new Error("Unsupported offline operation.");

        if (operation.type === "ledger-insert") markDbSnapshotRows((operation.rows || []).filter(Boolean));
        markOfflineOperationSyncedInMemory(operation);
        const index = all.findIndex(item => item.operationId === operation.operationId);
        if (index >= 0) all.splice(index, 1);
        changed = true;
        syncedCount += 1;
        if (!firstSyncedLabel) firstSyncedLabel = operation.label || "Entry";
      } catch (error) {
        operation.attempts = Number(operation.attempts || 0) + 1;
        operation.lastError = String(error?.message || error || "Synchronization failed").slice(0, 500);
        operation.nextAttemptAt = Date.now() + offlineRetryDelay(operation.attempts);
        state.offlineSync.lastError = operation.lastError;
        if (options.userInitiated) showEntryConfirmation(`${operation.label || "Entry"} could not sync: ${operation.lastError}`, "error");
        if (isConnectivityFailure(error)) break;
      }
    }
  } finally {
    writeOfflineQueue(all);
    state.offlineSync.syncing = false;
    updateOfflineSyncStatus();
    if (changed) {
      if (typeof invalidateDashboardSummary === "function") invalidateDashboardSummary({ refreshIfVisible: true });
      if (typeof invalidateAndRefreshExpenseLazy === "function") invalidateAndRefreshExpenseLazy({
        refreshActivity: typeof getActiveTabKey === "function" && getActiveTabKey() === "expenses"
      }).catch(() => {});
      if (typeof invalidateAndRefreshInventoryLazy === "function") invalidateAndRefreshInventoryLazy().catch(() => {});
      if (typeof renderAll === "function") renderAll();
      if (typeof renderNotes === "function") Promise.resolve(renderNotes()).catch(() => {});
      if (typeof renderAssetsList === "function") renderAssetsList();
      if (options.userInitiated) {
        showEntryConfirmation(`${firstSyncedLabel || "Entry"} saved to database.`, "success");
      } else if (syncedCount > 0) {
        showEntryConfirmation(`${syncedCount} local entr${syncedCount === 1 ? "y" : "ies"} synchronized.`, "success");
      }
    }
    const next = all
      .filter(item => item.ownerId === ownerId)
      .map(item => Number(item.nextAttemptAt || 0))
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    if (next) scheduleOfflineSync(Math.min(OFFLINE_SYNC_MAX_DELAY_MS, Math.max(1000, next - Date.now())));
  }
  return !state.offlineSync.lastError;
}

function syncOfflineEntryById(entityId){
  return syncOfflineQueue({ force: true, entityId, userInitiated: true });
}

function startOfflineSyncForSession(){
  rehydrateOfflineEntriesForCurrentUser();
  updateOfflineSyncStatus();
  if (navigator.onLine) scheduleOfflineSync(900);
}

function initOfflineSync(){
  window.addEventListener("online", () => scheduleOfflineSync(700));
  window.addEventListener("offline", () => {
    state.offlineSync.lastError = "No internet connection";
    updateOfflineSyncStatus();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && queuedOperationsForCurrentOwner().length) scheduleOfflineSync(1200);
  });
  document.getElementById("offlineSyncStatus")?.addEventListener("click", () => {
    if (!state.offlineSync.syncing) syncOfflineQueue({ force: true, userInitiated: true }).catch(() => {});
  });
  document.addEventListener("click", event => {
    const btn = event.target.closest?.("[data-offline-sync-id]");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add("is-syncing");
    syncOfflineEntryById(btn.getAttribute("data-offline-sync-id"))
      .catch(() => {})
      .finally(() => {
        btn.disabled = false;
        btn.classList.remove("is-syncing");
      });
  });
  setInterval(() => {
    if (!document.hidden && queuedOperationsForCurrentOwner().length && !state.offlineSync.syncing) {
      syncOfflineQueue().catch(() => {});
    }
  }, 45000);
}

initOfflineSync();
