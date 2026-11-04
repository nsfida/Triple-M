/* Persistent, owner-scoped offline queue + compact entry confirmations.
 *
 * Reliability rules (2026-11 hardening):
 *  - The queue lives in localStorage so a write is durable the moment it
 *    returns (no async gap before a refresh or tab close can lose it).
 *  - Every mutation re-reads the stored queue and changes it by operationId,
 *    so an entry saved while a sync is running is never overwritten.
 *  - Only one tab replays at a time (Web Locks when available, plus a short
 *    storage lease as a fallback). Other tabs follow along via storage events.
 *  - Replay is idempotent: inserts are skipped when the record id already
 *    exists; duplicate-key responses are re-checked by id.
 *  - Operations carry a status: pending, failed (needs attention), conflict
 *    (server copy changed after the offline edit). Nothing is silently dropped.
 *  - Stored format stays version 1 so entries queued by the previous release
 *    are still read and synced after this update.
 */
const OFFLINE_QUEUE_STORAGE_KEY = "triplem-offline-entry-queue-v1";
const OFFLINE_QUEUE_VERSION = 1;
const OFFLINE_SYNC_BASE_DELAY_MS = 5000;
const OFFLINE_SYNC_MAX_DELAY_MS = 5 * 60 * 1000;
const OFFLINE_SYNC_MAX_AUTO_ATTEMPTS = 6;
const OFFLINE_SYNC_LEASE_KEY = "triplem-offline-sync-lease-v1";
const OFFLINE_SYNC_LEASE_MS = 45000;
const OFFLINE_SYNC_TAB_ID = (() => {
  try { return crypto.randomUUID(); } catch (_) { return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
})();
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
  if (error.isOfflineConflict === true) return false;
  if (error.isConnectivityError === true || error.code === "NETWORK_ERROR") return true;
  const status = Number(error.status || 0);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(error.message || error || "");
  return /failed to fetch|network(?:error| request failed)|database request failed|load failed|connection|offline|timed?\s*out|ERR_(?:INTERNET|NETWORK|CONNECTION)/i.test(message);
}

/** Session rejected by the server: keep the work and wait for a new sign-in. */
function isOfflineSyncAuthFailure(error){
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || "");
  if (status === 401) return true;
  return /session expired|session is invalid|authentication required|jwt expired/i.test(message);
}

function isDuplicateKeyFailure(error){
  const status = Number(error?.status || 0);
  const code = String(error?.responseData?.code || "");
  return status === 409 || code === "23505" || /duplicate key value/i.test(String(error?.message || ""));
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
  const duration = Math.max(1200, Number(options.duration || (tone === "success" ? 2000 : 3600)));
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

// ── Durable storage ─────────────────────────────────────────────────────────

function readOfflineQueue(){
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(item => item && item.version === OFFLINE_QUEUE_VERSION) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Write the full queue. Entries from a newer/unknown version are preserved so
 * an older open tab can never erase work queued by a newer build.
 */
function writeOfflineQueue(queue){
  try {
    let foreign = [];
    try {
      const raw = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY) || "[]");
      if (Array.isArray(raw)) foreign = raw.filter(item => item && item.version !== OFFLINE_QUEUE_VERSION);
    } catch (_) { foreign = []; }
    const list = Array.isArray(queue) ? queue : [];
    localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(foreign.concat(list)));
    return true;
  } catch (error) {
    console.error("Offline queue could not be persisted.", error);
    showEntryConfirmation("Local save failed because browser storage is full or unavailable.", "error");
    return false;
  }
}

/** Read-modify-write against the current stored queue (never a stale copy). */
function mutateOfflineQueue(mutator){
  const queue = readOfflineQueue();
  const result = mutator(queue);
  if (result === false) return false;
  return writeOfflineQueue(queue);
}

function patchOfflineOperation(operationId, fields){
  if (!operationId) return false;
  return mutateOfflineQueue(queue => {
    const item = queue.find(op => op.operationId === operationId);
    if (!item) return false;
    Object.assign(item, fields || {});
    return true;
  });
}

function removeOfflineOperation(operationId){
  if (!operationId) return false;
  return mutateOfflineQueue(queue => {
    const index = queue.findIndex(op => op.operationId === operationId);
    if (index < 0) return false;
    queue.splice(index, 1);
    return true;
  });
}

function requestPersistentOfflineStorage(){
  try {
    if (navigator.storage?.persist && !requestPersistentOfflineStorage.asked) {
      requestPersistentOfflineStorage.asked = true;
      navigator.storage.persisted?.().then(already => {
        if (!already) navigator.storage.persist().catch(() => {});
      }).catch(() => {});
    }
  } catch (_) {}
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
  if (operation?.targetId) ids.add(String(operation.targetId));
  return [...ids];
}

function operationMatchesEntity(operation, entityId){
  const id = String(entityId || "");
  return !!id && offlineOperationEntityIds(operation).includes(id);
}

function offlineOperationStatus(operation){
  const status = String(operation?.status || "pending");
  return ["pending", "failed", "conflict"].includes(status) ? status : "pending";
}

function newOfflineOperation(fields){
  return {
    version: OFFLINE_QUEUE_VERSION,
    operationId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: 0,
    lastError: "",
    status: "pending",
    ...fields
  };
}

// ── Queueing ────────────────────────────────────────────────────────────────

function queueOfflineLedgerInsert(rows, label = "Entry"){
  const ownerId = offlineQueueOwnerId();
  const list = (Array.isArray(rows) ? rows : [rows]).filter(Boolean);
  if (!ownerId || !offlineQueueRowsAreSafe(list)) return false;
  const rowIds = list.map(row => String(row.id)).sort();
  const ok = mutateOfflineQueue(queue => {
    const duplicate = queue.some(item =>
      item.ownerId === ownerId
      && item.type === "ledger-insert"
      && Array.isArray(item.rows)
      && item.rows.map(row => String(row.id)).sort().join("|") === rowIds.join("|")
    );
    if (duplicate) return false;
    queue.push(newOfflineOperation({
      ownerId,
      type: "ledger-insert",
      label: String(label || "Entry").slice(0, 80),
      rows: list.map(sanitizeOfflineLedgerRow),
      entityIds: rowIds
    }));
    return true;
  });
  // A duplicate is already safely queued; only a storage failure is a failure.
  if (!ok && !queuedOperationsForCurrentOwner().some(op => rowIds.every(id => operationMatchesEntity(op, id)))) return false;
  list.forEach(row => {
    row._syncStatus = "pending";
    if (row.id) state.pendingDbSyncIds.add(row.id);
  });
  requestPersistentOfflineStorage();
  updateOfflineSyncStatus();
  if (navigator.onLine && state.unlocked) scheduleOfflineSync(900);
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
  const signature = entityIds.slice().sort().join("|");
  const ok = mutateOfflineQueue(queue => {
    const duplicate = queue.some(item => item.ownerId === ownerId && item.type === "table-insert" && offlineOperationEntityIds(item).slice().sort().join("|") === signature);
    if (duplicate) return false;
    queue.push(newOfflineOperation({
      ownerId,
      type: "table-insert",
      label: String(label || "Entry").slice(0, 80),
      steps,
      entityIds
    }));
    return true;
  });
  if (!ok && !queuedOperationsForCurrentOwner().some(op => offlineOperationEntityIds(op).slice().sort().join("|") === signature)) return false;
  entityIds.forEach(id => state.pendingDbSyncIds.add(id));
  requestPersistentOfflineStorage();
  updateOfflineSyncStatus();
  if (navigator.onLine && state.unlocked) scheduleOfflineSync(900);
  return true;
}

/**
 * Queue an edit or soft delete of an existing ledger/domain record.
 *  - If the record itself is still waiting to be created, the change is merged
 *    into that queued insert (one clean write when the internet returns).
 *  - Consecutive offline edits of the same record are merged into one patch so
 *    the user's own earlier edit is never mistaken for a conflict.
 */
function queueOfflineLedgerPatch(id, body, entry, label = "Entry", options = {}){
  const ownerId = offlineQueueOwnerId();
  const targetId = String(id || "");
  if (!ownerId || !targetId || !body || typeof body !== "object") return false;
  const patchBody = safeOfflineClone(body);
  if (!patchBody || !offlinePayloadIsSafe(patchBody)) return false;
  const snapshot = sanitizeOfflineLedgerRow(entry || { id: targetId });
  snapshot.id = targetId;
  if (!offlinePayloadIsSafe(snapshot)) return false;
  const ok = mutateOfflineQueue(queue => {
    const ownerOps = queue.filter(item => item.ownerId === ownerId);
    const pendingInsert = ownerOps.find(item => item.type === "ledger-insert"
      && offlineOperationStatus(item) === "pending"
      && (item.rows || []).some(row => String(row?.id || "") === targetId));
    if (pendingInsert) {
      const row = pendingInsert.rows.find(r => String(r?.id || "") === targetId);
      Object.assign(row, sanitizeOfflineLedgerRow({ ...row, ...patchBody }));
      return true;
    }
    const pendingPatch = ownerOps.find(item => item.type === "ledger-patch"
      && offlineOperationStatus(item) === "pending"
      && String(item.targetId || "") === targetId);
    if (pendingPatch) {
      pendingPatch.body = { ...(pendingPatch.body || {}), ...patchBody };
      pendingPatch.entry = { ...(pendingPatch.entry || {}), ...snapshot };
      pendingPatch.label = String(label || pendingPatch.label || "Entry").slice(0, 80);
      return true;
    }
    queue.push(newOfflineOperation({
      ownerId,
      type: "ledger-patch",
      label: String(label || "Entry").slice(0, 80),
      targetId,
      body: patchBody,
      entry: snapshot,
      baseUpdatedAt: String(options.baseUpdatedAt || entry?.updated_at || ""),
      entityIds: [targetId]
    }));
    return true;
  });
  if (!ok) return false;
  state.pendingDbSyncIds.add(targetId);
  requestPersistentOfflineStorage();
  updateOfflineSyncStatus();
  if (navigator.onLine && state.unlocked) scheduleOfflineSync(900);
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
  const id = String(entityId || "");
  if (!id) return "";
  const op = queuedOperationsForCurrentOwner().find(operation => operationMatchesEntity(operation, id));
  if (!op) return "";
  const status = offlineOperationStatus(op);
  if (status === "conflict") {
    return `<span class="offline-entry-pending offline-entry-pending--conflict"><i class="fa-solid fa-code-compare" aria-hidden="true"></i> Needs review</span>`;
  }
  if (status === "failed") {
    return `<span class="offline-entry-pending offline-entry-pending--failed"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Not synced</span>`;
  }
  return `<span class="offline-entry-pending"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Saved locally</span>`;
}

function offlineSyncButtonHtml(entityId, label = "Save"){
  const id = String(entityId || "");
  if (!id || !hasPendingOfflineEntity(id)) return "";
  return `<button type="button" class="offline-entry-save-btn" data-offline-sync-id="${offlineEscape(id)}" title="Save this local entry to database" aria-label="Save this local entry to database"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i><span>${offlineEscape(label || "Save")}</span></button>`;
}

function offlineQueueSummary(operations = queuedOperationsForCurrentOwner()){
  const summary = { total: operations.length, pending: 0, failed: 0, conflict: 0 };
  operations.forEach(op => { summary[offlineOperationStatus(op)] += 1; });
  return summary;
}

function updateOfflineSyncStatus(){
  const pending = queuedOperationsForCurrentOwner();
  const summary = offlineQueueSummary(pending);
  state.offlineSync.pendingCount = pending.length;
  state.offlineSync.attentionCount = summary.failed + summary.conflict;
  state.offlineSync.pendingPatchCount = pending.filter(op => op.type === "ledger-patch").length;
  const button = document.getElementById("offlineSyncStatus");
  const count = document.getElementById("offlineSyncCount");
  try { window.TriplemOfflineCache?.refreshBanner?.(); } catch (_) {}
  if (!button || !count) return;
  const visible = !!state.unlocked && pending.length > 0;
  button.classList.toggle("hide", !visible);
  button.classList.toggle("is-syncing", !!state.offlineSync.syncing);
  button.classList.toggle("is-error", (summary.failed + summary.conflict > 0 || !!state.offlineSync.lastError) && !state.offlineSync.syncing);
  count.textContent = String(pending.length);
  let title;
  if (state.offlineSync.syncing) {
    title = `Synchronizing ${pending.length} pending operation${pending.length === 1 ? "" : "s"}`;
  } else if (summary.conflict || summary.failed) {
    const parts = [];
    if (summary.conflict) parts.push(`${summary.conflict} need${summary.conflict === 1 ? "s" : ""} review`);
    if (summary.failed) parts.push(`${summary.failed} could not sync`);
    if (summary.pending) parts.push(`${summary.pending} waiting`);
    title = `Saved on this device: ${parts.join(", ")}. Click for details.`;
  } else if (state.offlineSync.authBlocked) {
    title = `${pending.length} operation${pending.length === 1 ? "" : "s"} saved on this device. Sign in again to sync.`;
  } else {
    title = `${pending.length} operation${pending.length === 1 ? "" : "s"} saved on this device${navigator.onLine ? ", syncing automatically" : ", will sync when online"}. Click for details.`;
  }
  button.title = title;
  button.setAttribute("aria-label", title);
}

function applyOfflinePatchToRow(row, body){
  if (!row || !body) return;
  Object.keys(body).forEach(key => {
    if (key === "id" || key === "owner_id") return;
    row[key] = body[key];
  });
}

/**
 * After a reload, put queued work back on screen: queued inserts are restored
 * as pending rows and queued edits are re-applied over the freshly loaded rows.
 */
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
  reapplyOfflinePatchesToLoadedEntries(operations);
  updateOfflineSyncStatus();
  return restored.length;
}

function reapplyOfflinePatchesToLoadedEntries(operations = queuedOperationsForCurrentOwner()){
  let applied = 0;
  operations.filter(operation => operation.type === "ledger-patch").forEach(operation => {
    const id = String(operation.targetId || "");
    if (!id) return;
    state.pendingDbSyncIds.add(id);
    [state.entries, state.recycleBin].forEach(collection => {
      (collection || []).forEach(row => {
        if (String(row?.id || "") !== id) return;
        applyOfflinePatchToRow(row, operation.body);
        row._syncStatus = offlineOperationStatus(operation);
        applied += 1;
      });
    });
  });
  return applied;
}

// ── Replay ──────────────────────────────────────────────────────────────────

async function offlineRecordExists(table, id){
  if (!table || !id) return false;
  try {
    const rows = await supabase(`${table}?id=eq.${encodeURIComponent(id)}&select=id`, { offlineCache: false });
    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    if (isConnectivityFailure(error) || isOfflineSyncAuthFailure(error)) throw error;
    // Missing legacy table / column: treat as "not present" and let the write decide.
    return false;
  }
}

async function offlineLedgerRowAlreadySaved(row){
  let domainTable = "";
  try {
    const mapped = window.DomainLedger?.domainInsertPayload?.(row);
    if (mapped && !mapped.useLedger && mapped.table && mapped.table !== CONFIG.table) domainTable = mapped.table;
  } catch (_) {}
  if (domainTable && await offlineRecordExists(domainTable, row.id)) return true;
  return offlineRecordExists(CONFIG.table, row.id);
}

async function replayOfflineLedgerRows(rows){
  for (const row of rows || []) {
    if (!row?.id) continue;
    // Idempotency: a record with this id already exists (an earlier attempt
    // succeeded but the response was lost, or another tab synced it). Never
    // overwrite it with the older offline copy.
    if (await offlineLedgerRowAlreadySaved(row)) continue;
    try {
      if (window.DomainLedger?.insertDomainEntry && typeof writeLedgerRowToDatabase === "function") {
        await writeLedgerRowToDatabase(row, "Offline entry");
      } else {
        await supabase(CONFIG.table, {
          method: "POST",
          body: JSON.stringify(databaseInsertPayload(row)),
          headers: { Prefer: "return=minimal" }
        });
      }
    } catch (error) {
      if (isDuplicateKeyFailure(error) && await offlineLedgerRowAlreadySaved(row)) continue;
      throw error;
    }
  }
}

async function replayOfflineTableSteps(steps){
  for (const step of steps || []) {
    if (!OFFLINE_DIRECT_TABLES.has(step?.table)) throw new Error("Unsupported offline table operation.");
    for (const row of step.rows || []) {
      if (!row) continue;
      if (row.id && await offlineRecordExists(step.table, row.id)) continue;
      try {
        await supabase(step.table, {
          method: "POST",
          body: JSON.stringify(row),
          headers: { Prefer: "return=minimal" }
        });
      } catch (error) {
        if (row.id && isDuplicateKeyFailure(error) && await offlineRecordExists(step.table, row.id)) continue;
        throw error;
      }
    }
  }
}

function offlineConflictError(message){
  const error = new Error(message);
  error.isOfflineConflict = true;
  return error;
}

/**
 * Replay a queued edit. Before writing, the current server copy is compared
 * with the version the user edited offline. If someone changed or deleted it
 * in the meantime the operation is held for review instead of overwriting.
 */
async function replayOfflineLedgerPatch(operation){
  const id = String(operation.targetId || "");
  const entry = { ...(operation.entry || {}), id };
  const body = operation.body || {};
  if (!id) throw new Error("Queued change has no record id.");
  if (!operation.forceApply) {
    let table = "";
    if (entry.data_origin === "domain" && entry.domain_table) table = entry.domain_table;
    else {
      try { table = window.DomainLedger?.resolveDomainTable?.(entry) || ""; } catch (_) { table = ""; }
    }
    const candidates = [table, CONFIG.table].filter(Boolean);
    let server = null;
    for (const candidate of candidates) {
      try {
        const rows = await supabase(`${candidate}?id=eq.${encodeURIComponent(id)}&select=*`, { offlineCache: false });
        if (Array.isArray(rows) && rows.length) { server = rows[0]; break; }
      } catch (error) {
        if (isConnectivityFailure(error) || isOfflineSyncAuthFailure(error)) throw error;
      }
    }
    if (!server) {
      throw offlineConflictError("This record no longer exists on the server (it may have been deleted on another device).");
    }
    if (server.is_deleted === true && !Object.prototype.hasOwnProperty.call(body, "is_deleted")) {
      const isSoftDelete = Object.prototype.hasOwnProperty.call(body, "notes") && typeof hasDeletedTag === "function" && hasDeletedTag(body.notes);
      if (!isSoftDelete) throw offlineConflictError("This record was deleted on another device after your offline change.");
    }
    const base = Date.parse(operation.baseUpdatedAt || "");
    const current = Date.parse(server.updated_at || "");
    if (Number.isFinite(base) && Number.isFinite(current) && current > base + 1000) {
      throw offlineConflictError("This record was changed on another device after your offline change.");
    }
  }
  await writeLedgerPatchToDatabase(id, body, entry, operation.label || "Entry");
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
  [state.notes, state.assets, state.assetTransactions, state.recycleBin].forEach(collection => {
    (collection || []).forEach(item => {
      if (ids.has(String(item?.id || ""))) delete item._syncStatus;
    });
  });
  const stillQueued = new Set(queuedOperationsForCurrentOwner().flatMap(offlineOperationEntityIds));
  ids.forEach(id => { if (!stillQueued.has(id)) state.pendingDbSyncIds.delete(id); });
  try {
    window.dispatchEvent(new CustomEvent("triplem:offline-entry-synced", {
      detail: { ids: [...ids], operationId: operation.operationId, label: operation.label, steps: operation.steps || [] }
    }));
  } catch (_) {}
}

/** Cross-tab exclusivity: Web Locks when available, a storage lease otherwise. */
async function withOfflineSyncLock(task){
  if (navigator.locks?.request) {
    return navigator.locks.request("triplem-offline-sync", { ifAvailable: true }, async lock => {
      if (!lock) return { skipped: true };
      return task();
    });
  }
  const now = Date.now();
  try {
    const lease = JSON.parse(localStorage.getItem(OFFLINE_SYNC_LEASE_KEY) || "null");
    if (lease && lease.tab !== OFFLINE_SYNC_TAB_ID && Number(lease.until || 0) > now) return { skipped: true };
    localStorage.setItem(OFFLINE_SYNC_LEASE_KEY, JSON.stringify({ tab: OFFLINE_SYNC_TAB_ID, until: now + OFFLINE_SYNC_LEASE_MS }));
  } catch (_) {}
  try { return await task(); }
  finally {
    try {
      const lease = JSON.parse(localStorage.getItem(OFFLINE_SYNC_LEASE_KEY) || "null");
      if (lease?.tab === OFFLINE_SYNC_TAB_ID) localStorage.removeItem(OFFLINE_SYNC_LEASE_KEY);
    } catch (_) {}
  }
}

async function syncOfflineQueue(options = {}){
  if (state.offlineSync.syncing || !state.unlocked || isGuestMode() || !state.sessionToken) return false;
  if (state.offlineSync.offlineSession && !options.allowOfflineSession) return false;
  const ownerId = offlineQueueOwnerId();
  if (!ownerId) return false;
  const requestedIds = new Set((options.entityIds || (options.entityId ? [options.entityId] : [])).filter(Boolean).map(String));
  const matchesRequested = operation => !requestedIds.size || [...requestedIds].some(id => operationMatchesEntity(operation, id));
  const isDue = operation => {
    const status = offlineOperationStatus(operation);
    if (options.force) return status === "pending" || options.includeAttention === true || (requestedIds.size > 0);
    return status === "pending" && Number(operation.nextAttemptAt || 0) <= Date.now();
  };
  const due = readOfflineQueue().filter(item => item.ownerId === ownerId && matchesRequested(item) && isDue(item));
  if (!due.length) {
    updateOfflineSyncStatus();
    if (options.userInitiated && requestedIds.size && !hasPendingOfflineEntity([...requestedIds][0])) {
      showEntryConfirmation("This entry is already saved to the database.", "success");
    }
    return true;
  }
  if (!navigator.onLine) {
    state.offlineSync.lastError = "No internet connection";
    updateOfflineSyncStatus();
    if (options.userInitiated) showEntryConfirmation("Still offline. Your entries remain safely saved on this device.", "warning");
    return false;
  }

  const outcome = await withOfflineSyncLock(async () => {
    state.offlineSync.syncing = true;
    state.offlineSync.lastError = "";
    updateOfflineSyncStatus();
    const result = { synced: 0, firstLabel: "", attention: 0, stoppedForConnectivity: false };
    const blockedEntities = new Set();
    try {
      // Re-read inside the lock: another tab may have finished some of these.
      const live = readOfflineQueue();
      const runList = due.filter(op => live.some(item => item.operationId === op.operationId));
      for (const queued of runList) {
        const operation = readOfflineQueue().find(item => item.operationId === queued.operationId) || queued;
        const entityIds = offlineOperationEntityIds(operation);
        // Keep per-record order: never apply a later change while an earlier one for the same record is unresolved.
        if (entityIds.some(id => blockedEntities.has(id))) continue;
        try {
          if (operation.type === "ledger-insert") await replayOfflineLedgerRows(operation.rows || []);
          else if (operation.type === "table-insert") await replayOfflineTableSteps(operation.steps || []);
          else if (operation.type === "ledger-patch") await replayOfflineLedgerPatch(operation);
          else throw new Error("Unsupported offline operation.");

          if (operation.type === "ledger-insert") markDbSnapshotRows((operation.rows || []).filter(Boolean));
          removeOfflineOperation(operation.operationId);
          markOfflineOperationSyncedInMemory(operation);
          result.synced += 1;
          if (!result.firstLabel) result.firstLabel = operation.label || "Entry";
        } catch (error) {
          entityIds.forEach(id => blockedEntities.add(id));
          const message = String(error?.message || error || "Synchronization failed").slice(0, 500);
          if (isConnectivityFailure(error)) {
            const attempts = Number(operation.attempts || 0) + 1;
            patchOfflineOperation(operation.operationId, { attempts, lastError: message, nextAttemptAt: Date.now() + offlineRetryDelay(attempts) });
            state.offlineSync.lastError = message;
            result.stoppedForConnectivity = true;
            break;
          }
          if (isOfflineSyncAuthFailure(error)) {
            // Session expired: do not burn retry attempts; resume after the next sign-in.
            patchOfflineOperation(operation.operationId, { lastError: "Sign in again to finish syncing." });
            state.offlineSync.authBlocked = true;
            state.offlineSync.lastError = "Sign in again to finish syncing.";
            break;
          }
          if (error?.isOfflineConflict) {
            patchOfflineOperation(operation.operationId, { status: "conflict", lastError: message, nextAttemptAt: 0 });
            result.attention += 1;
            continue;
          }
          const attempts = Number(operation.attempts || 0) + 1;
          const exhausted = attempts >= OFFLINE_SYNC_MAX_AUTO_ATTEMPTS;
          patchOfflineOperation(operation.operationId, {
            attempts,
            lastError: message,
            status: exhausted ? "failed" : "pending",
            nextAttemptAt: exhausted ? 0 : Date.now() + offlineRetryDelay(attempts)
          });
          if (exhausted) result.attention += 1;
          state.offlineSync.lastError = message;
          if (options.userInitiated) showEntryConfirmation(`${operation.label || "Entry"} could not sync: ${message}`, "error");
        }
      }
    } finally {
      state.offlineSync.syncing = false;
    }
    return result;
  });

  if (outcome?.skipped) {
    // Another tab holds the sync lock; it will update the shared queue.
    scheduleOfflineSync(OFFLINE_SYNC_BASE_DELAY_MS * 2);
    return false;
  }

  if (outcome.synced > 0) state.offlineSync.authBlocked = false;
  updateOfflineSyncStatus();
  if (outcome.synced > 0) {
    if (typeof invalidateDashboardSummary === "function") invalidateDashboardSummary({ refreshIfVisible: true });
    if (typeof invalidateAndRefreshExpenseLazy === "function") invalidateAndRefreshExpenseLazy({
      refreshActivity: typeof getActiveTabKey === "function" && getActiveTabKey() === "expenses"
    }).catch(() => {});
    if (typeof invalidateAndRefreshInventoryLazy === "function") invalidateAndRefreshInventoryLazy().catch(() => {});
    if (typeof renderAll === "function") renderAll();
    if (typeof renderNotes === "function") Promise.resolve(renderNotes()).catch(() => {});
    if (typeof renderAssetsList === "function") renderAssetsList();
    if (options.userInitiated && requestedIds.size) {
      showEntryConfirmation(`${outcome.firstLabel || "Entry"} saved to database.`, "success");
    } else {
      showEntryConfirmation(`${outcome.synced} offline change${outcome.synced === 1 ? "" : "s"} synchronized.`, "success");
    }
  }
  if (outcome.attention > 0) {
    showEntryConfirmation(`${outcome.attention} offline change${outcome.attention === 1 ? "" : "s"} need${outcome.attention === 1 ? "s" : ""} your review. Open the sync indicator for details.`, "warning", { duration: 5200 });
  }
  const next = queuedOperationsForCurrentOwner()
    .filter(item => offlineOperationStatus(item) === "pending")
    .map(item => Number(item.nextAttemptAt || 0))
    .filter(Boolean)
    .sort((a, b) => a - b)[0];
  if (next && !state.offlineSync.authBlocked) scheduleOfflineSync(Math.min(OFFLINE_SYNC_MAX_DELAY_MS, Math.max(1000, next - Date.now())));
  return !state.offlineSync.lastError && outcome.attention === 0;
}

function syncOfflineEntryById(entityId){
  return syncOfflineQueue({ force: true, entityId, userInitiated: true });
}

// ── Review panel (pending / failed / conflict) ─────────────────────────────

function retryOfflineOperation(operationId, { forceApply = false } = {}){
  patchOfflineOperation(operationId, { status: "pending", attempts: 0, nextAttemptAt: 0, lastError: "", ...(forceApply ? { forceApply: true } : {}) });
  updateOfflineSyncStatus();
  return syncOfflineQueue({ force: true, userInitiated: true });
}

function discardOfflineOperation(operationId){
  const operation = readOfflineQueue().find(op => op.operationId === operationId);
  if (!operation) return false;
  removeOfflineOperation(operationId);
  const remaining = new Set(queuedOperationsForCurrentOwner().flatMap(offlineOperationEntityIds));
  offlineOperationEntityIds(operation).forEach(id => { if (!remaining.has(id)) state.pendingDbSyncIds.delete(id); });
  if (operation.type === "ledger-insert") {
    const ids = new Set((operation.rows || []).map(row => String(row?.id || "")));
    state.entries = (state.entries || []).filter(row => !ids.has(String(row?.id || "")) || !row._syncStatus);
  }
  updateOfflineSyncStatus();
  // Reload authoritative data so a discarded local edit disappears from screen.
  try { if (typeof invalidateDashboardSummary === "function") invalidateDashboardSummary({ refreshIfVisible: true }); } catch (_) {}
  try { if (typeof invalidateAndRefreshExpenseLazy === "function") invalidateAndRefreshExpenseLazy({ refreshActivity: true }).catch(() => {}); } catch (_) {}
  try { if (typeof renderAll === "function") renderAll(); } catch (_) {}
  return true;
}

function offlineOperationTimeText(value){
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return "";
  try { return new Date(time).toLocaleString(); } catch (_) { return new Date(time).toISOString(); }
}

function renderOfflineSyncPanel(){
  const panel = document.getElementById("offlineSyncPanel");
  if (!panel) return;
  const list = panel.querySelector("[data-offline-panel-list]");
  const operations = queuedOperationsForCurrentOwner();
  const summary = offlineQueueSummary(operations);
  const head = panel.querySelector("[data-offline-panel-summary]");
  if (head) {
    head.textContent = operations.length
      ? `${summary.pending} waiting · ${summary.failed} could not sync · ${summary.conflict} need review${navigator.onLine ? "" : " · You are offline"}`
      : "Everything on this device is saved to the database.";
  }
  if (!list) return;
  if (!operations.length) {
    list.innerHTML = `<p class="offline-panel-empty">No unsynced changes.</p>`;
    return;
  }
  const typeText = { "ledger-insert": "New entry", "table-insert": "New entry", "ledger-patch": "Edit" };
  list.innerHTML = operations.map(op => {
    const status = offlineOperationStatus(op);
    const statusText = status === "conflict" ? "Needs review" : status === "failed" ? "Could not sync" : (op.lastError ? "Retrying" : "Waiting");
    const actions = status === "conflict"
      ? `<button type="button" class="btn ghost tiny" data-offline-op-action="keep" data-offline-op-id="${offlineEscape(op.operationId)}">Apply my change</button>
         <button type="button" class="btn ghost tiny danger-text" data-offline-op-action="discard" data-offline-op-id="${offlineEscape(op.operationId)}">Discard my change</button>`
      : status === "failed"
        ? `<button type="button" class="btn ghost tiny" data-offline-op-action="retry" data-offline-op-id="${offlineEscape(op.operationId)}">Retry</button>
           <button type="button" class="btn ghost tiny danger-text" data-offline-op-action="discard" data-offline-op-id="${offlineEscape(op.operationId)}">Discard</button>`
        : `<button type="button" class="btn ghost tiny" data-offline-op-action="retry" data-offline-op-id="${offlineEscape(op.operationId)}">Sync now</button>`;
    return `<div class="offline-panel-item offline-panel-item--${status}">
      <div class="offline-panel-item-main">
        <strong>${offlineEscape(op.label || "Entry")}</strong>
        <span>${offlineEscape(typeText[op.type] || "Change")} · ${offlineEscape(offlineOperationTimeText(op.createdAt))}</span>
        <span class="offline-panel-status">${offlineEscape(statusText)}${op.lastError ? ` — ${offlineEscape(op.lastError)}` : ""}</span>
      </div>
      <div class="offline-panel-item-actions">${actions}</div>
    </div>`;
  }).join("");
}

function openOfflineSyncPanel(){
  let panel = document.getElementById("offlineSyncPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "offlineSyncPanel";
    panel.className = "modal hide offline-sync-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "offlineSyncPanelTitle");
    panel.innerHTML = `<div class="modal-backdrop" data-offline-panel-close></div>
      <div class="modal-dialog settings-sheet offline-sync-sheet">
        <div class="settings-sheet-head">
          <div><h3 id="offlineSyncPanelTitle"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Changes saved on this device</h3>
          <p data-offline-panel-summary></p></div>
          <button type="button" class="btn ghost tiny" data-offline-panel-close aria-label="Close">✕</button>
        </div>
        <div class="modal-body settings-sheet-body">
          <div class="offline-panel-list" data-offline-panel-list></div>
          <div class="offline-panel-footer">
            <button type="button" class="btn primary" data-offline-op-action="sync-all"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Sync now</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(panel);
    panel.addEventListener("click", event => {
      if (event.target.closest("[data-offline-panel-close]")) {
        panel.classList.add("hide");
        panel.setAttribute("aria-hidden", "true");
        return;
      }
      const btn = event.target.closest("[data-offline-op-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-offline-op-action");
      const id = btn.getAttribute("data-offline-op-id") || "";
      let work = Promise.resolve();
      if (action === "sync-all") work = syncOfflineQueue({ force: true, userInitiated: true });
      else if (action === "retry") work = retryOfflineOperation(id);
      else if (action === "keep") {
        if (!confirm("Apply your offline change on top of the newer server version? The other device's change to the same fields will be replaced.")) return;
        work = retryOfflineOperation(id, { forceApply: true });
      } else if (action === "discard") {
        if (!confirm("Discard this unsynced change? It will be removed from this device and cannot be recovered.")) return;
        discardOfflineOperation(id);
      }
      btn.disabled = true;
      Promise.resolve(work).catch(() => {}).finally(() => { btn.disabled = false; renderOfflineSyncPanel(); });
    });
  }
  renderOfflineSyncPanel();
  panel.classList.remove("hide");
  panel.setAttribute("aria-hidden", "false");
}

/** Used by the sign-out button so unsynced work is never abandoned silently. */
function confirmLogoutWithPendingOfflineWork(){
  try {
    if (!state.unlocked || isGuestMode()) return true;
    const count = queuedOperationsForCurrentOwner().length;
    if (!count) return true;
    return confirm(`${count} change${count === 1 ? " is" : "s are"} saved on this device but not yet synced.\n\nThey stay on this device and sync the next time you sign in here. Sign out anyway?`);
  } catch (_) {
    return true;
  }
}

function startOfflineSyncForSession(){
  state.offlineSync.authBlocked = false;
  rehydrateOfflineEntriesForCurrentUser();
  updateOfflineSyncStatus();
  if (navigator.onLine) scheduleOfflineSync(900);
}

function initOfflineSync(){
  window.addEventListener("online", () => {
    state.offlineSync.lastError = "";
    updateOfflineSyncStatus();
    scheduleOfflineSync(700);
  });
  window.addEventListener("offline", () => {
    state.offlineSync.lastError = "No internet connection";
    updateOfflineSyncStatus();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && queuedOperationsForCurrentOwner().some(op => offlineOperationStatus(op) === "pending")) scheduleOfflineSync(1200);
  });
  // Another tab changed the shared queue (queued or synced something).
  window.addEventListener("storage", event => {
    if (event.key !== OFFLINE_QUEUE_STORAGE_KEY) return;
    updateOfflineSyncStatus();
    if (document.getElementById("offlineSyncPanel") && !document.getElementById("offlineSyncPanel").classList.contains("hide")) renderOfflineSyncPanel();
  });
  document.getElementById("offlineSyncStatus")?.addEventListener("click", () => {
    openOfflineSyncPanel();
    if (!state.offlineSync.syncing && navigator.onLine) syncOfflineQueue({ force: true }).catch(() => {}).finally(renderOfflineSyncPanel);
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
  // Pending operations are scheduled when queued, on reconnect/visibility, and at retry deadlines.
  // No periodic scan is needed while the workspace sits idle.
}

initOfflineSync();
