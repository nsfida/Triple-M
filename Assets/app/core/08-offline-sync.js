/* Persistent, owner-scoped queue for connectivity-failed financial entry inserts. */
const OFFLINE_QUEUE_STORAGE_KEY = "triplem-offline-entry-queue-v1";
const OFFLINE_QUEUE_VERSION = 1;
const OFFLINE_SYNC_BASE_DELAY_MS = 5000;
const OFFLINE_SYNC_MAX_DELAY_MS = 5 * 60 * 1000;

function isConnectivityFailure(error){
  if (!error) return !navigator.onLine;
  if (error.isConnectivityError === true || error.code === "NETWORK_ERROR") return true;
  const status = Number(error.status || 0);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(error.message || error || "");
  return /failed to fetch|network(?:error| request failed)|database request failed|load failed|connection|offline|timed?\s*out|ERR_(?:INTERNET|NETWORK|CONNECTION)/i.test(message);
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
    "created_at", "owner_id", "meta"
  ];
  return allowed.reduce((out, key) => {
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) out[key] = row[key];
    return out;
  }, {});
}

function offlineQueueRowsAreSafe(rows){
  if (!Array.isArray(rows) || !rows.length || !window.DomainLedger?.classifyLedgerEntry) return false;
  const supported = new Set(["expenses", "inventory", "installments", "loans_given", "loans_taken"]);
  return rows.every(row => {
    if (!row?.id || !row?.group_id) return false;
    if (!supported.has(DomainLedger.classifyLedgerEntry(row))) return false;
    const sensitiveText = (() => {
      try { return JSON.stringify(sanitizeOfflineLedgerRow(row)); }
      catch (_) { return `${row.person_name || ""} ${row.notes || ""}`; }
    })();
    return !/(?:private[_\s-]?key|seed[_\s-]?phrase|mnemonic|\bWIF\b|xprv|BITCOIN_WALLET)/i.test(sensitiveText);
  });
}

function queueOfflineLedgerInsert(rows, label = "Entry"){
  const ownerId = offlineQueueOwnerId();
  const list = (Array.isArray(rows) ? rows : [rows]).filter(Boolean);
  if (!ownerId || !offlineQueueRowsAreSafe(list)) return false;
  const queue = readOfflineQueue();
  const rowIds = list.map(row => String(row.id)).sort();
  const duplicate = queue.some(item =>
    item.ownerId === ownerId
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

function queuedOperationsForCurrentOwner(){
  const ownerId = offlineQueueOwnerId();
  return ownerId ? readOfflineQueue().filter(item => item.ownerId === ownerId) : [];
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
    : `${pending.length} operation${pending.length === 1 ? "" : "s"} pending synchronization`;
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
  operations.forEach(operation => {
    (operation.rows || []).forEach(stored => {
      if (!stored?.id) return;
      state.pendingDbSyncIds.add(stored.id);
      const live = state.entries.find(row => row?.id === stored.id);
      if (live) {
        live._syncStatus = "pending";
        return;
      }
      if (!existingIds.has(stored.id)) {
        restored.push({ ...stored, _syncStatus: "pending", data_origin: "domain", is_legacy_meta: false });
        existingIds.add(stored.id);
      }
    });
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

async function syncOfflineQueue(options = {}){
  if (state.offlineSync.syncing || !state.unlocked || isGuestMode() || !state.sessionToken) return false;
  const ownerId = offlineQueueOwnerId();
  if (!ownerId) return false;
  const all = readOfflineQueue();
  const due = all.filter(item => item.ownerId === ownerId && (options.force || Number(item.nextAttemptAt || 0) <= Date.now()));
  if (!due.length) {
    updateOfflineSyncStatus();
    return true;
  }
  state.offlineSync.syncing = true;
  state.offlineSync.lastError = "";
  updateOfflineSyncStatus();
  let changed = false;
  try {
    for (const operation of due) {
      try {
        await replayOfflineLedgerRows(operation.rows || []);
        const ids = new Set((operation.rows || []).map(row => row.id).filter(Boolean));
        state.entries.forEach(row => {
          if (!ids.has(row?.id)) return;
          delete row._syncStatus;
          row.data_origin = row.data_origin || "domain";
        });
        (operation.rows || []).forEach(row => {
          if (row?.id) state.pendingDbSyncIds.delete(row.id);
        });
        markDbSnapshotRows((operation.rows || []).filter(Boolean));
        const index = all.findIndex(item => item.operationId === operation.operationId);
        if (index >= 0) all.splice(index, 1);
        changed = true;
      } catch (error) {
        operation.attempts = Number(operation.attempts || 0) + 1;
        operation.lastError = String(error?.message || error || "Synchronization failed").slice(0, 500);
        operation.nextAttemptAt = Date.now() + offlineRetryDelay(operation.attempts);
        state.offlineSync.lastError = operation.lastError;
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

function startOfflineSyncForSession(){
  rehydrateOfflineEntriesForCurrentUser();
  updateOfflineSyncStatus();
  if (navigator.onLine) scheduleOfflineSync(900);
}

function initOfflineSync(){
  window.addEventListener("online", () => scheduleOfflineSync(700));
  window.addEventListener("offline", updateOfflineSyncStatus);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && queuedOperationsForCurrentOwner().length) scheduleOfflineSync(1200);
  });
  document.getElementById("offlineSyncStatus")?.addEventListener("click", () => {
    if (!state.offlineSync.syncing) syncOfflineQueue({ force: true }).catch(() => {});
  });
  setInterval(() => {
    if (!document.hidden && queuedOperationsForCurrentOwner().length && !state.offlineSync.syncing) {
      syncOfflineQueue().catch(() => {});
    }
  }, 45000);
}

initOfflineSync();
