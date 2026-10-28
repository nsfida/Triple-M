// Shared admin actions used by the public list (index.html) and the admin page (admin.html).
// Every action is enforced by the database (RLS + RPC), these screens only call it.
(function () {
  const C = window.KMR, $ = id => document.getElementById(id);
  let ready = false;

  const HTML = `
<dialog id="kPay"><form method="dialog" id="kPayF"><h2>Confirm payment</h2><p class="dlg-sub" id="kPayWho"></p>
  <label for="kPa">Amount received (Rs.) - enter 0 for status-only confirmation</label><input id="kPa" type="number" min="0" step="1" inputmode="numeric" required>
  <label for="kPm">Mohallah</label><input id="kPm" required maxlength="100">
  <p class="msg bad" id="kPayE" hidden></p><div class="row"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn">Confirm payment</button></div></form></dialog>

<dialog id="kEdit"><form method="dialog" id="kEditF"><h2>Edit runner</h2><p class="dlg-sub" id="kEditWho"></p>
  <div class="two"><div><label for="kEn">Name</label><input id="kEn" required maxlength="100"></div><div><label for="kEf">Father's name</label><input id="kEf" required maxlength="100"></div></div>
  <div class="two"><div><label for="kEc">CNIC / B-Form</label><input id="kEc" required inputmode="numeric" maxlength="15" placeholder="35202-1234567-1"></div><div><label for="kEm">Mobile</label><input id="kEm" type="tel" required maxlength="12" placeholder="03XX-XXXXXXX"></div></div>
  <div class="two"><div><label for="kEg">Gender</label><select id="kEg"><option>Male</option><option>Female</option></select></div><div><label for="kEd">Date of birth</label><input id="kEd" type="date" required></div></div>
  <label for="kEe">Email</label><input id="kEe" type="email" maxlength="150">
  <label for="kEa">Permanent address</label><input id="kEa" required maxlength="200">
  <div class="two"><div><label for="kEt">District / Tehsil</label><input id="kEt" required maxlength="100"></div><div><label for="kEs">Sport</label><input id="kEs" required maxlength="100"></div></div>
  <label for="kEp">Payment receipt / reference</label><input id="kEp" maxlength="80">
  <div class="k-edit-photo"><div class="k-edit-photo-preview" id="kEditPhotoFrame"><img id="kEditPhotoPreview" alt="Current player photo" hidden><span id="kEditPhotoInitial">K</span></div><div class="k-edit-photo-copy"><label for="kEditPhoto">Replace player photo (optional)</label><input id="kEditPhoto" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"><small>High-quality optimized copy used on the website. The original file is kept privately for admin records until replacement is saved, then the previous photo and its original are deleted.</small></div></div>
  <p class="msg bad" id="kEditE" hidden></p><div class="row"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">Save changes</button></div></form></dialog>

<dialog id="kFund"><form method="dialog" id="kFundF"><h2 id="kFundH">Funds received</h2>
  <label for="kFn">Name</label><input id="kFn" required maxlength="100"><label for="kFm">Mohallah</label><input id="kFm" required maxlength="100">
  <label for="kFa">Amount (Rs.)</label><input id="kFa" type="number" min="1" step="1" inputmode="numeric" required>
  <p class="msg bad" id="kFundE" hidden></p><div class="row"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" id="kFundB">Save entry</button></div></form></dialog>

<dialog id="kExpense"><form method="dialog" id="kExpenseF"><h2 id="kExpenseH">Record expense</h2><p class="dlg-sub">Expenses are recorded independently of collections. You can record spending even when expenses exceed receipts.</p>
  <label for="kExDate">Expense date</label><input id="kExDate" type="date" required>
  <label for="kExCategory">Category</label><select id="kExCategory" required><option>Equipment</option><option>Venue</option><option>Refreshments</option><option>Medical</option><option>Transport</option><option>Printing</option><option>Awards</option><option>Administration</option><option>Other</option></select>
  <label for="kExDesc">Description</label><input id="kExDesc" required maxlength="240" placeholder="What was purchased or paid for?">
  <label for="kExPaid">Paid to (optional)</label><input id="kExPaid" maxlength="120">
  <label for="kExAmount">Amount (Rs.)</label><input id="kExAmount" type="number" min="1" step="1" inputmode="numeric" required>
  <label for="kExMethod">Payment method</label><select id="kExMethod"><option>Cash</option><option>Bank transfer</option><option>Mobile wallet</option><option>Other</option></select>
  <label for="kExRef">Receipt / reference (optional)</label><input id="kExRef" maxlength="120">
  <p class="msg bad" id="kExpenseE" hidden></p><div class="row"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn">Save expense</button></div></form></dialog>

<dialog id="kDet"><div id="kDetB"></div><div class="row"><button type="button" class="btn ghost" data-close>Close</button></div></dialog>`;

  function init() {
    if (ready) return; ready = true;
    const w = document.createElement("div"); w.innerHTML = HTML; document.body.append(...w.children);
    document.querySelectorAll("dialog [data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());
    document.querySelectorAll("dialog").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));
    $("kDet").addEventListener("close", () => { activeDetailRow = null; activeDetailAll = []; detailRequestId++; });
    $("kEc").addEventListener("input", e => { const d = e.target.value.replace(/\D/g, "").slice(0, 13); e.target.value = d.length > 12 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; });
    $("kEm").addEventListener("input", e => { const d = e.target.value.replace(/\D/g, "").slice(0, 11); e.target.value = d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d; });
    $("kEditPhoto").addEventListener("change", previewEditPhoto);
    $("kEdit").addEventListener("close", resetEditPhotoPreview);
    syncOutbox();
    cleanupPendingImageDeletes();
    window.addEventListener("online", cleanupPendingImageDeletes);
  }
  const fmtCnic = d => { d = String(d || ""); return d.length === 13 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : d; };
  const fmtMob = d => { d = String(d || ""); return d.length === 11 ? `${d.slice(0, 4)}-${d.slice(4)}` : d; };
  const busy = (form, on) => form.querySelectorAll("button").forEach(b => b.disabled = on);

  // Persist pending admin writes before starting their network requests. The UI can
  // update immediately, while the RPC/table write is synced now or when connectivity returns.
  const OUTBOX_KEY = "kmr-s3-admin-outbox-v1";
  const outboxCallbacks = new Map();
  let syncingOutbox = false;
  function readOutbox() { try { const q = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); return Array.isArray(q) ? q : []; } catch (e) { return []; } }
  function writeOutbox(q) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(q)); return true; } catch (e) { return false; } }
  function enqueue(action, done) {
    action.user = KMRAuth.hint() || ""; action.queuedAt = new Date().toISOString();
    const q = readOutbox().filter(x => x.id !== action.id); q.push(action);
    if (!writeOutbox(q)) return false;
    if (done) outboxCallbacks.set(action.id, done);
    return true;
  }
  function dequeue(id) { const q = readOutbox().filter(x => x.id !== id); writeOutbox(q); outboxCallbacks.delete(id); }
  function persistRegistration(row) {
    for (const key of ["admin-registrations", "admin-runners"]) {
      const isList = KMRStore.get(key, true);
      if (Array.isArray(isList)) { const next = isList.map(x => x.id === row.id ? { ...x, ...row } : x); KMRStore.set(key, next, true); }
    }
  }
  function publishRegistration(row) {
    persistRegistration(row);
    window.dispatchEvent(new CustomEvent("kmr:optimistic-registration", { detail: { row } }));
  }
  function mutateFundCaches(row, opts = {}) {
    const { removeId = null, syntheticId = null, removeRegistrationId = null, removeReference = null, removeOnly = false } = opts;
    for (const [key, priv] of [["admin-funds", true], ["public-funds", false]]) {
      const current = KMRStore.get(key, priv); if (!Array.isArray(current)) continue;
      let next = current.filter(x => x.id !== removeId && (!syntheticId || x.id !== syntheticId) && !((removeRegistrationId && x.registration_id === removeRegistrationId || removeReference && x.reference === removeReference) && x.source === "registration"));
      if (row && !removeOnly) {
        const idx = next.findIndex(x => x.id === row.id);
        if (idx >= 0) next[idx] = { ...next[idx], ...row }; else next.push(row);
      }
      KMRStore.set(key, next, priv);
    }
    window.dispatchEvent(new CustomEvent("kmr:optimistic-funds"));
  }
  function mutateExpenseCaches(row, opts = {}) {
    const { removeId = null } = opts;
    for (const [key, priv] of [["admin-expenses", true], ["public-expenses", false]]) {
      const current = KMRStore.get(key, priv); if (!Array.isArray(current)) continue;
      let next = current.filter(x => x.id !== removeId);
      if (row) { const idx = next.findIndex(x => x.id === row.id); if (idx >= 0) next[idx] = { ...next[idx], ...row }; else next.push(row); }
      KMRStore.set(key, next, priv);
    }
    window.dispatchEvent(new CustomEvent("kmr:optimistic-expenses"));
  }
  function optimisticFee(action, row, remove = false) {
    const syntheticId = `local-confirm-${row.id}`;
    const localFund = !remove && Number(action.amount) > 0 ? {
      id: syntheticId, registration_id: row.id, donor_name: row.name,
      mohallah: action.mohallah || row.district_tehsil || "—", amount: Math.round(Number(action.amount)),
      source: "registration", reference: row.reg_no, created_at: action.queuedAt || new Date().toISOString(), recorded_by: action.user || "pending sync"
    } : null;
    mutateFundCaches(localFund, { syntheticId, removeRegistrationId: remove ? row.id : null, removeReference: remove ? row.reg_no : null, removeOnly: !localFund });
  }
  const transientError = error => !navigator.onLine || /failed to fetch|network|timeout|load failed|connection|fetch is aborted|aborterror/i.test(String(error && (error.message || error) || ""));
  async function processAction(action) {
    if (action.type === "confirm") {
      const q = await sb.from("registrations").select("id,status").eq("id", action.rowId).maybeSingle();
      if (q.error) return { retry: true, error: q.error };
      if (!q.data) return { retry: true, error: new Error("Registration not found while syncing confirmation.") };
      if (q.data.status === "confirmed") {
        const fq = await sb.from("funds").select("amount").eq("registration_id", action.rowId).eq("source", "registration");
        if (fq.error) return { retry: true, error: fq.error };
        const amounts = (fq.data || []).map(f => Number(f.amount));
        const completed = Number(action.amount) === 0 ? amounts.length === 0 : amounts.includes(Math.round(Number(action.amount)));
        return completed ? { done: true } : { conflict: true, error: new Error("This player is already confirmed with a different funds entry. Please review the project funds before retrying.") };
      }
      const { error } = await sb.rpc("confirm_payment", { p_id: action.rowId, p_amount: Number(action.amount), p_mohallah: action.mohallah });
      if (error) {
        if (/already confirmed/i.test(error.message || "")) return processAction(action);
        return { retry: true, error };
      }
      return { done: true };
    }
    if (action.type === "unconfirm") {
      const q = await sb.from("registrations").select("id,status").eq("id", action.rowId).maybeSingle();
      if (q.error) return { retry: true, error: q.error };
      if (q.data && q.data.status === "pending") return { done: true };
      const { error } = await sb.rpc("unconfirm_payment", { p_id: action.rowId });
      return error ? { retry: true, error } : { done: true };
    }
    if (action.type === "player-cancel") {
      const q = await sb.from("registrations").select("id,is_cancelled").eq("id", action.rowId).maybeSingle();
      if (q.error) return { retry: true, error: q.error };
      if (!q.data) return { retry: true, error: new Error("Registration not found while syncing cancellation.") };
      if (!!q.data.is_cancelled === !!action.isCancelled) return { done: true };
      const { error } = await sb.rpc("set_registration_cancelled", { p_id: action.rowId, p_cancelled: !!action.isCancelled });
      return error ? { retry: true, error } : { done: true };
    }
    if (action.type === "expense-save") {
      let result;
      if (action.isNew) result = await sb.from("expenses").insert({ id: action.recordId, ...action.row }).select();
      else result = await sb.from("expenses").update(action.row).eq("id", action.recordId).select();
      if (result.error && action.isNew && result.error.code === "23505") {
        const existing = await sb.from("expenses").select("id,expense_date,category,description,paid_to,amount").eq("id", action.recordId).maybeSingle();
        if (!existing.error && existing.data && existing.data.description === action.row.description && Number(existing.data.amount) === Number(action.row.amount)) return { done: true };
      }
      if (result.error) return { retry: true, error: result.error };
      if (!result.data || (Array.isArray(result.data) && !result.data.length)) return { retry: true, error: new Error("The expense is waiting for an authorised admin session.") };
      return { done: true };
    }
    if (action.type === "registration-edit") {
      const { data, error } = await sb.from("registrations").update(action.row).eq("id", action.rowId).select();
      if (error && error.code === "23505") return { invalid: true, error: new Error("Another player already has this CNIC/B-Form number.") };
      if (error) return { retry: true, error };
      if (!data || !data.length) return { retry: true, error: new Error("The edit is waiting for an authorised admin session.") };
      Object.assign(action.row, data[0]); return { done: true };
    }
    if (action.type === "fund-save") {
      let result;
      if (action.isNew) result = await sb.from("funds").insert({ id: action.recordId, ...action.row, source: "donation" }).select();
      else result = await sb.from("funds").update(action.row).eq("id", action.recordId).select();
      if (result.error && action.isNew && result.error.code === "23505") {
        const existing = await sb.from("funds").select("id,donor_name,mohallah,amount").eq("id", action.recordId).maybeSingle();
        if (!existing.error && existing.data && existing.data.donor_name === action.row.donor_name && Number(existing.data.amount) === Number(action.row.amount)) return { done: true };
      }
      if (result.error) return { retry: true, error: result.error };
      if (!result.data || (Array.isArray(result.data) && !result.data.length)) return { retry: true, error: new Error("The funds entry is waiting for an authorised admin session.") };
      return { done: true };
    }
    return { retry: true, error: new Error("Unknown pending action.") };
  }
  async function syncOutbox() {
    if (syncingOutbox || !navigator.onLine) return;
    syncingOutbox = true;
    try {
      const currentUser = await KMRAuth.current(); if (!currentUser) return;
      const queue = readOutbox();
      for (const action of queue) {
        if (action.user && action.user !== currentUser) continue;
        if (!navigator.onLine) break;
        const result = await processAction(action);
        if (result.done) {
          const cb = outboxCallbacks.get(action.id); dequeue(action.id);
          if (cb) cb(); else window.dispatchEvent(new CustomEvent("kmr:admin-sync-complete", { detail: { action } }));
        } else if (result.conflict) {
          const cb = outboxCallbacks.get(action.id); dequeue(action.id);
          if (action.type === "confirm" && action.row) { action.row.status = "confirmed"; publishRegistration(action.row); mutateFundCaches(null, { syntheticId: `local-confirm-${action.row.id}`, removeOnly: true }); }
          toast(result.error.message, true);
          if (cb) cb(); else window.dispatchEvent(new CustomEvent("kmr:admin-sync-complete", { detail: { action } }));
        } else if (result.invalid) {
          const cb = outboxCallbacks.get(action.id); dequeue(action.id);
          if (action.oldRow) publishRegistration(action.oldRow);
          toast(result.error.message, true);
          if (cb) cb(); else window.dispatchEvent(new CustomEvent("kmr:admin-sync-complete", { detail: { action } }));
        } else if (result.retry) {
          action.lastError = String(result.error && result.error.message || "Sync pending");
          writeOutbox(readOutbox().map(x => x.id === action.id ? action : x));
          if (!transientError(result.error)) toast("Saved locally; sync is pending: " + action.lastError, true);
          break;
        }
      }
    } catch (e) { /* Keep pending writes for the next online event or admin page load. */ }
    finally { syncingOutbox = false; }
  }
  window.addEventListener("online", syncOutbox);

  // ---- confirm / unconfirm ----
  let payRow = null, payDone = null;
  function pay(r, done) {
    init(); payRow = r; payDone = done;
    $("kPayWho").textContent = `${r.reg_no} · ${r.name}`; $("kPa").value = C.FEE; $("kPm").value = r.district_tehsil || ""; $("kPayE").hidden = true;
    $("kPay").showModal(); $("kPa").select();
    $("kPayF").onsubmit = async e => {
      e.preventDefault();
      const rawAmount = $("kPa").value.trim(), amount = Number(rawAmount);
      if (rawAmount === "" || !Number.isFinite(amount) || amount < 0) {
        $("kPayE").textContent = "Enter 0 or a positive whole-number amount."; $("kPayE").hidden = false; return;
      }
      const action = { id: `confirm:${payRow.id}`, type: "confirm", rowId: payRow.id, row: { ...payRow }, oldStatus: payRow.status,
        amount: Math.round(amount), mohallah: $("kPm").value.trim() || payRow.district_tehsil || "" };
      if (!enqueue(action, payDone)) { $("kPayE").textContent = "Local storage is unavailable. No change was made."; $("kPayE").hidden = false; return; }
      payRow.status = "confirmed"; publishRegistration(payRow); optimisticFee(action, payRow);
      $("kPay").close(); toast(navigator.onLine ? `${payRow.reg_no} confirmed locally; syncing…` : `${payRow.reg_no} saved locally; sync will resume online`);
      syncOutbox();
    };
  }
  async function unconfirm(r, done) {
    if (!confirm(`Mark ${r.reg_no} as pending? Its fee entry will be removed from the project funds.`)) return;
    const action = { id: `unconfirm:${r.id}`, type: "unconfirm", rowId: r.id, row: { ...r }, oldStatus: r.status };
    if (!enqueue(action, done)) return toast("Local storage is unavailable. No change was made.", true);
    r.status = "pending"; publishRegistration(r); optimisticFee(action, r, true);
    toast(navigator.onLine ? `${r.reg_no} marked pending locally; syncing…` : `${r.reg_no} marked pending locally; sync will resume online`);
    syncOutbox();
  }

  async function cancel(r, done, forceState) {
    const nextState = typeof forceState === "boolean" ? forceState : !r.is_cancelled;
    const verb = nextState ? "Cancel" : "restore";
    const message = nextState
      ? `Cancel ${r.reg_no} (${r.name})? It will remain visible in the public All list with a cancellation mark. Any existing payment records will be preserved.`
      : `Restore ${r.reg_no} (${r.name})? The cancellation mark will be removed.`;
    if (!confirm(message)) return;
    const action = { id: `player-cancel:${r.id}`, type: "player-cancel", rowId: r.id, row: { ...r }, oldRow: { ...r }, isCancelled: nextState };
    if (!enqueue(action, done)) return toast("Local storage is unavailable. No change was made.", true);
    r.is_cancelled = nextState;
    r.cancelled_at = nextState ? new Date().toISOString() : null;
    r.cancelled_by = nextState ? (KMRAuth.hint() || "pending sync") : null;
    publishRegistration(r);
    toast(navigator.onLine ? `${r.reg_no} ${nextState ? "cancelled" : "restored"} locally; syncing…` : `${r.reg_no} ${nextState ? "cancelled" : "restored"} locally; sync will resume online`);
    syncOutbox();
  }

  // ---- storage file replacement / stale-object cleanup ------------------------
  const IMAGE_CLEANUP_KEY = "kmr-s3-image-cleanup-v1";
  let editPhotoPreviewUrl = null;
  function readImageCleanupQueue() { try { const q = JSON.parse(localStorage.getItem(IMAGE_CLEANUP_KEY) || "[]"); return Array.isArray(q) ? q : []; } catch (_) { return []; } }
  function writeImageCleanupQueue(q) { try { localStorage.setItem(IMAGE_CLEANUP_KEY, JSON.stringify(q)); return true; } catch (_) { return false; } }
  function queueImageCleanup(bucket, paths) {
    const clean = [...new Set((paths || []).filter(p => typeof p === "string" && p.trim()))];
    if (!clean.length) return;
    const queue = readImageCleanupQueue();
    const key = `${bucket}:${clean.slice().sort().join("|")}`;
    if (!queue.some(item => item.key === key)) queue.push({ key, bucket, paths: clean, queuedAt: new Date().toISOString() });
    writeImageCleanupQueue(queue);
  }
  async function removeStorageFiles(bucket, paths, attempts = 3) {
    const clean = [...new Set((paths || []).filter(Boolean))];
    if (!clean.length) return null;
    let lastError = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const { error } = await sb.storage.from(bucket).remove(clean);
        if (!error) return null;
        lastError = error;
      } catch (error) { lastError = error; }
      if (i + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 250 * (i + 1)));
    }
    return lastError || new Error("Storage cleanup failed.");
  }
  async function cleanupPendingImageDeletes() {
    if (!navigator.onLine) return;
    const current = await Promise.resolve().then(() => KMRAuth.current()).catch(() => null);
    if (!current) return;
    const queue = readImageCleanupQueue(); if (!queue.length) return;
    const remaining = [];
    for (const item of queue) {
      // Local storage is not trusted input; restrict retries to the two photo buckets.
      if (!item || !["photos", "originals"].includes(item.bucket) || !Array.isArray(item.paths)) continue;
      const error = await removeStorageFiles(item.bucket, item.paths, 2);
      if (error) remaining.push(item);
    }
    writeImageCleanupQueue(remaining);
  }
  function resetEditPhotoPreview() {
    if (editPhotoPreviewUrl) URL.revokeObjectURL(editPhotoPreviewUrl);
    editPhotoPreviewUrl = null;
    const input = $("kEditPhoto"), img = $("kEditPhotoPreview"), initial = $("kEditPhotoInitial");
    if (input) input.value = "";
    if (img) { img.removeAttribute("src"); img.hidden = true; }
    if (initial) initial.hidden = false;
  }
  function previewEditPhoto() {
    const input = $("kEditPhoto"), file = input && input.files && input.files[0];
    const img = $("kEditPhotoPreview"), initial = $("kEditPhotoInitial");
    if (editPhotoPreviewUrl) URL.revokeObjectURL(editPhotoPreviewUrl);
    editPhotoPreviewUrl = null;
    if (!file) return;
    try { if (!window.KMRImageOptimizer) throw new Error("Image optimizer has not loaded. Refresh and try again."); window.KMRImageOptimizer.validate(file); }
    catch (error) { input.value = ""; toast(error.message, true); return; }
    editPhotoPreviewUrl = URL.createObjectURL(file);
    img.src = editPhotoPreviewUrl; img.hidden = false; initial.hidden = true;
    $("kEditE").hidden = true;
  }
  async function uploadReplacement(bucket, path, blob, contentType) {
    const { error } = await sb.storage.from(bucket).upload(path, blob, { contentType, upsert: false, cacheControl: "31536000" });
    if (error) throw new Error(`Could not upload replacement ${bucket} file: ${error.message}`);
  }

  // ---- edit ----
  function edit(r, done) {
    init();
    resetEditPhotoPreview();
    $("kEditWho").textContent = `${r.reg_no} · registered ${fmtDate(r.created_at)}`;
    $("kEn").value = r.name || ""; $("kEf").value = r.father_name || ""; $("kEc").value = fmtCnic(r.cnic); $("kEm").value = fmtMob(r.mobile);
    $("kEg").value = r.gender || "Male"; $("kEd").value = r.dob || ""; $("kEe").value = r.email || ""; $("kEa").value = r.address || "";
    $("kEt").value = r.district_tehsil || ""; $("kEs").value = r.sport || ""; $("kEp").value = r.payment_ref || ""; $("kEditE").hidden = true;
    $("kEd").max = new Date().toISOString().slice(0, 10);
    const currentImg = $("kEditPhotoPreview"), initial = $("kEditPhotoInitial");
    if (r.photo_path) { currentImg.src = photoUrl(r.photo_path); currentImg.hidden = false; initial.hidden = true; }
    else { currentImg.removeAttribute("src"); currentImg.hidden = true; initial.textContent = String(r.name || "K").trim().slice(0, 1).toUpperCase(); initial.hidden = false; }
    $("kEdit").showModal();
    $("kEditF").onsubmit = async e => {
      e.preventDefault(); const form = $("kEditF");
      const bad = m => { $("kEditE").textContent = m; $("kEditE").hidden = false; };
      const cnic = $("kEc").value.replace(/\D/g, ""), mobile = $("kEm").value.replace(/\D/g, "");
      if (cnic.length !== 13) return bad("CNIC/B-Form number must have 13 digits.");
      if (mobile.length !== 11) return bad("Mobile number must have 11 digits.");
      const upd = { name: $("kEn").value.trim(), father_name: $("kEf").value.trim(), cnic, mobile, email: $("kEe").value.trim() || null, gender: $("kEg").value, dob: $("kEd").value,
        address: $("kEa").value.trim(), district_tehsil: $("kEt").value.trim(), sport: $("kEs").value.trim(), payment_ref: $("kEp").value.trim() || null };
      const photoFile = $("kEditPhoto").files && $("kEditPhoto").files[0];

      // Photo changes are deliberately online-only: the old image is kept until the database
      // safely points to the newly uploaded image, then the old objects are deleted.
      if (photoFile) {
        if (!navigator.onLine) return bad("Replacing a photo requires an internet connection. Your existing photo has not been changed.");
        if (!window.KMRImageOptimizer) return bad("Image optimization has not loaded. Refresh the page and try again.");
        let newPhotoPath = null, newOriginalPath = null, committed = false, outcomeUnknown = false;
        const previousPhotoPath = r.photo_path || null, previousPhotoOriginalPath = r.photo_original_path || null;
        busy(form, true);
        const saveButton = form.querySelector('button[type="submit"]');
        const oldSaveLabel = saveButton ? saveButton.textContent : "Save changes";
        if (saveButton) saveButton.textContent = "Optimizing photo…";
        try {
          const currentUser = await KMRAuth.current();
          if (!currentUser) throw new Error("Your admin session has expired. Sign in again before changing a photo.");
          window.KMRImageOptimizer.validate(photoFile);
          const optimized = await window.KMRImageOptimizer.optimize(photoFile, "photo");
          const token = crypto.randomUUID();
          newPhotoPath = `${r.id}/photo-${token}.jpg`;
          newOriginalPath = `${r.id}/photo_original-${token}.${window.KMRImageOptimizer.extension(photoFile)}`;
          if (saveButton) saveButton.textContent = "Uploading securely…";
          await uploadReplacement("photos", newPhotoPath, optimized, "image/jpeg");
          try {
            await uploadReplacement("originals", newOriginalPath, photoFile, window.KMRImageOptimizer.mime(photoFile));
          } catch (error) {
            await removeStorageFiles("photos", [newPhotoPath], 2); newPhotoPath = null; throw error;
          }
          if (saveButton) saveButton.textContent = "Saving player record…";
          const updatePayload = { ...upd, photo_path: newPhotoPath, photo_original_path: newOriginalPath };
          const { data, error } = await sb.from("registrations").update(updatePayload).eq("id", r.id).select("*");
          let savedRow = !error && data && data.length ? data[0] : null;
          if (!savedRow) {
            // A network interruption can hide a successful commit from the browser. Verify the
            // stored paths before deleting any new upload, so we never leave a broken photo link.
            const check = await sb.from("registrations").select("*").eq("id", r.id).maybeSingle();
            if (!check.error && check.data && check.data.photo_path === newPhotoPath && check.data.photo_original_path === newOriginalPath) {
              savedRow = check.data;
            } else if (check.error) {
              outcomeUnknown = true;
              throw new Error("The connection dropped while saving. The new files were retained to protect the player's photo. Refresh the player record before retrying.");
            } else if (error && error.code === "23505") {
              throw new Error("Another player already has this CNIC/B-Form number.");
            } else if (error) {
              throw new Error("The database did not accept the update: " + error.message);
            } else {
              throw new Error("The player record was not updated. Check that you are signed in with an authorized admin account.");
            }
          }
          committed = true;
          Object.assign(r, savedRow); publishRegistration(r);
          $("kEdit").close();

          const oldPaths = { photos: [], originals: [] };
          if (previousPhotoPath && previousPhotoPath !== newPhotoPath) oldPaths.photos.push(previousPhotoPath);
          if (previousPhotoOriginalPath && previousPhotoOriginalPath !== newOriginalPath) oldPaths.originals.push(previousPhotoOriginalPath);
          const cleanupErrors = [];
          for (const [bucket, paths] of Object.entries(oldPaths)) {
            const error = await removeStorageFiles(bucket, paths, 3);
            if (error) { queueImageCleanup(bucket, paths); cleanupErrors.push(bucket); }
          }
          if (cleanupErrors.length) {
            toast("Player saved with the new photo, but old-file cleanup is pending: " + cleanupErrors.join(", ") + ". The system will retry when an admin page is online.", true);
          } else {
            toast(`${r.reg_no} details and photo saved. The previous photo and original were deleted.`);
          }
          if (done) done(r);
        } catch (error) {
          if (!committed && !outcomeUnknown) {
            const rollbackErrors = [];
            if (newPhotoPath) { const x = await removeStorageFiles("photos", [newPhotoPath], 2); if (x) rollbackErrors.push("photos"); }
            if (newOriginalPath) { const x = await removeStorageFiles("originals", [newOriginalPath], 2); if (x) rollbackErrors.push("originals"); }
            if (rollbackErrors.length) {
              if (newPhotoPath) queueImageCleanup("photos", [newPhotoPath]);
              if (newOriginalPath) queueImageCleanup("originals", [newOriginalPath]);
            }
          }
          bad(error && error.message ? error.message : "Could not update this player.");
        } finally {
          busy(form, false); if (saveButton) saveButton.textContent = oldSaveLabel;
        }
        return;
      }

      const action = { id: `registration-edit:${r.id}`, type: "registration-edit", rowId: r.id, row: { ...upd }, oldRow: { ...r } };
      if (!enqueue(action, () => { done && done(r); })) return bad("Local storage is unavailable. No change was made.");
      Object.assign(r, upd); publishRegistration(r); $("kEdit").close();
      toast(navigator.onLine ? `${r.reg_no} saved locally; syncing…` : `${r.reg_no} saved locally; sync will resume online`); syncOutbox();
    };
  }

  // ---- delete ----
  async function remove(r, done) {
    if (!confirm(`Delete ${r.reg_no} (${r.name})? This cannot be undone.`)) return;
    const { data, error } = await sb.from("registrations").delete().eq("id", r.id).select();
    if (error || !data.length) return toast("Delete was not allowed.", true);
    const rm = async (bk, ps) => { const l = ps.filter(Boolean); if (l.length) await sb.storage.from(bk).remove(l); };
    await rm("photos", [r.photo_path]); await rm("originals", [r.photo_original_path, r.cnic_front_original_path, r.cnic_back_original_path]);
    await rm("documents", [r.cnic_front_path, r.cnic_back_path, r.certificate_path, r.other_doc_path, r.signature_path]);
    toast(`${r.reg_no} deleted`); done && done(r);
  }

  // ---- PDF (jsPDF and pdf.js load only when first needed) ----
  const loadScript = src => new Promise((res, rej) => { if ([...document.scripts].some(s => s.src.endsWith(src))) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load " + src)); document.head.appendChild(s); });
  async function pdf(list, name, btn) {
    const old = btn && btn.textContent; if (btn) btn.disabled = true;
    try {
      if (!window.jspdf) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
      if (!window.KMRPDF) await loadScript("js/pdf.js");
      const doc = await KMRPDF.build(list, (i, n) => { if (btn) btn.textContent = `Building ${i}/${n}…`; });
      doc.save(name);
    } catch (e) { toast("PDF failed: " + e.message, true); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }

  // ---- files, full player details and contextual admin actions ------------------
  let activeDetailRow = null, activeDetailAll = [], detailRequestId = 0;
  async function details(r, all) {
    init(); activeDetailRow = r; activeDetailAll = all || [];
    const requestId = ++detailRequestId;
    const box = $("kDetB");
    box.innerHTML = `<div class="detail-loading"><span class="mini-spinner"></span><span>Preparing secure player details and files…</span></div>`;
    if (!$("kDet").open) $("kDet").showModal();
    const ext = p => (String(p || "jpg").split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const fn = (k, p) => `${r.reg_no}_${slug(r.name)}_${k}.${ext(p)}`;
    const dls = [
      ["Player photo", "photo", r.photo_original_path, "originals", r.photo_path, "photos"],
      ["CNIC front", "cnic_front", r.cnic_front_original_path, "originals", r.cnic_front_path, "documents"],
      ["CNIC back", "cnic_back", r.cnic_back_original_path, "originals", r.cnic_back_path, "documents"]
    ];
    const urls = [];
    const dl = await Promise.all(dls.map(async ([label, key, originalPath, originalBucket, standardPath, standardBucket]) => {
      const original = !!originalPath, path = original ? originalPath : standardPath, bucket = original ? originalBucket : standardBucket;
      if (!path) return `<span class="chipl unavailable" aria-disabled="true">${label}<small>Not uploaded</small></span>`;
      try {
        const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 600, { download: fn(key, path) });
        if (error || !data?.signedUrl) return `<span class="chipl unavailable" aria-disabled="true">${label}<small>Unavailable</small></span>`;
        urls.push(data.signedUrl);
        return `<a class="chipl" href="${esc(data.signedUrl)}" download>${label}<small>${original ? "original file" : "standard copy"}</small></a>`;
      } catch (e) { return `<span class="chipl unavailable" aria-disabled="true">${label}<small>Unavailable</small></span>`; }
    }));
    const items = [["Certificate", r.certificate_path], ["Other document", r.other_doc_path], ["Signature", r.signature_path]].filter(i => i[1]);
    const vw = await Promise.all(items.map(async ([label, path]) => {
      try { const { data } = await sb.storage.from("documents").createSignedUrl(path, 300, { download: fn(label.toLowerCase().replace(/\s+/g, "_"), path) });
        return data?.signedUrl ? `<a class="chipl" target="_blank" rel="noopener" href="${esc(data.signedUrl)}">${label}<small>view file</small></a>` : "";
      } catch (e) { return ""; }
    }));
    if (requestId !== detailRequestId) return;
    const same = activeDetailAll.filter(x => x.id !== r.id && x.fingerprint && x.fingerprint === r.fingerprint).map(x => x.reg_no);
    const where = r.lat != null && r.lng != null ? `<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${Number(r.lat)},${Number(r.lng)}">Open location in Google Maps</a> <small>(${Number(r.lat).toFixed(5)}, ${Number(r.lng).toFixed(5)}, about ${Math.round(r.location_accuracy || 0)} m)</small>` : "No location recorded";
    const by = r.entered_by ? `Recorded by admin ${r.entered_by}` : `Self-registered, device ${(r.device_id || "—").slice(0, 8)}${r.device_id ? "…" : ""}`;
    const age = ageOf(r.dob);
    box.innerHTML = `<div class="detail-hero">
        <div class="detail-person-photo">${r.photo_path ? `<img src="${esc(photoUrl(r.photo_path))}" alt="Player portrait" onerror="this.style.display='none'">` : `<span>${esc(String(r.name || "K").trim().slice(0,1).toUpperCase())}</span>`}</div>
        <div class="detail-person-copy"><span class="detail-eyebrow">PLAYER RECORD · ${esc(r.reg_no)}</span><h2>${esc(r.name)}</h2><p class="dlg-sub">${esc(by)}</p><span class="tag ${r.is_cancelled ? "cancelled" : r.status}"><span class="status-dot"></span>${r.is_cancelled ? "Cancelled" : r.status === "confirmed" ? "Confirmed" : "Pending"}</span></div>
      </div>
      <div class="detail-section-title"><h3>Player information</h3><span>Official registration details</span></div>
      <dl class="kv">
        <dt>Father's name</dt><dd>${esc(r.father_name || "—")}</dd>
        <dt>Age / gender</dt><dd>${age == null ? "—" : esc(age)} years · ${esc(r.gender || "—")}</dd>
        <dt>CNIC / B-Form</dt><dd>${esc(fmtCnic(r.cnic) || "—")}</dd>
        <dt>Mobile</dt><dd>${esc(fmtMob(r.mobile) || "—")}</dd>
        ${r.email ? `<dt>Email</dt><dd>${esc(r.email)}</dd>` : ""}
        <dt>Address</dt><dd>${esc(r.address || "—")}, ${esc(r.district_tehsil || "—")}</dd>
        <dt>Sport</dt><dd>${esc(r.sport || "—")}</dd>
        <dt>Payment reference</dt><dd>${esc(r.payment_ref || "—")}</dd>
        <dt>Location</dt><dd>${where}</dd>
      </dl>
      ${same.length ? `<p class="msg bad">Same device fingerprint as ${esc(same.join(", "))} - please review this registration.</p>` : ""}
      <div class="detail-section-title"><h3>Documents &amp; downloads</h3><span>Secure, time-limited links</span></div>
      <div class="chiprow">${dl.join("")}${vw.join("")}</div>
      <div class="detail-actions">
        <button type="button" class="btn ghost" id="kDetEdit">Edit details</button>
        <button type="button" class="btn alt" id="kDetPdf">Download registration PDF</button>
        ${!r.is_cancelled ? `<button type="button" class="btn" id="kDetPayment">${r.status === "confirmed" ? "Mark as pending" : "Confirm payment"}</button>` : ""}
        <button type="button" class="btn ${r.is_cancelled ? "alt" : "danger"}" id="kDetCancel">${r.is_cancelled ? "Restore player" : "Cancel player"}</button>
        <button type="button" class="btn danger" id="kDetDelete">Delete player</button>
        ${urls.length ? `<button type="button" class="btn ghost" id="kDlAll">Download photo + CNIC files</button>` : ""}
      </div>`;
    const downloadAll = $("kDlAll"); if (downloadAll) downloadAll.onclick = () => urls.forEach((url, i) => setTimeout(() => { const a = document.createElement("a"); a.href = url; a.download = ""; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); }, i * 600));
    $("kDetEdit").onclick = () => edit(r, () => { if (activeDetailRow?.id === r.id) details(r, activeDetailAll); });
    $("kDetPdf").onclick = e => pdf([r], `${r.reg_no}_${slug(r.name)}.pdf`, e.currentTarget);
    const paymentAction = $("kDetPayment"); if (paymentAction) paymentAction.onclick = () => {
      if (r.status === "confirmed") unconfirm(r, () => { if (activeDetailRow?.id === r.id) details(r, activeDetailAll); });
      else { const payDialog = $("kPay"); payDialog.addEventListener("close", () => { if (activeDetailRow?.id === r.id) details(r, activeDetailAll); }, { once: true }); pay(r, () => { if (activeDetailRow?.id === r.id) details(r, activeDetailAll); }); }
    };
    $("kDetCancel").onclick = () => cancel(r, () => { if (activeDetailRow?.id === r.id) details(r, activeDetailAll); }, !r.is_cancelled);
    $("kDetDelete").onclick = () => remove(r, () => { $("kDet").close(); window.dispatchEvent(new CustomEvent("kmr:admin-sync-complete")); });
  }
  window.addEventListener("kmr:optimistic-registration", e => {
    const row = e.detail && e.detail.row;
    if (row && activeDetailRow && row.id === activeDetailRow.id) {
      Object.assign(activeDetailRow, row);
      details(activeDetailRow, activeDetailAll);
    }
  });

  // ---- project funds ----
  function fund(f, done) {
    init(); $("kFundH").textContent = f ? "Edit entry" : "Funds received"; $("kFundE").hidden = true;
    $("kFn").value = f ? f.donor_name : ""; $("kFm").value = f ? f.mohallah : ""; $("kFa").value = f ? Math.round(f.amount) : "";
    $("kFund").showModal(); $("kFn").focus();
    $("kFundF").onsubmit = async e => {
      e.preventDefault(); const row = { donor_name: $("kFn").value.trim(), mohallah: $("kFm").value.trim(), amount: Math.round(Number($("kFa").value)) };
      const recordId = f ? f.id : crypto.randomUUID();
      const action = { id: `fund-save:${recordId}`, type: "fund-save", recordId, isNew: !f, row, oldRow: f ? { ...f } : null };
      const localRow = { id: recordId, ...row, source: f ? f.source : "donation", reference: f ? f.reference : null,
        registration_id: f ? f.registration_id : null, created_at: f ? f.created_at : new Date().toISOString(), recorded_by: f ? f.recorded_by : (KMRAuth.hint() || "pending sync") };
      if (!enqueue(action, done)) { $("kFundE").textContent = "Local storage is unavailable. No change was made."; $("kFundE").hidden = false; return; }
      mutateFundCaches(localRow); $("kFund").close();
      toast(navigator.onLine ? (f ? "Entry updated locally; syncing…" : "Entry saved locally; syncing…") : "Entry saved locally; sync will resume online"); syncOutbox();
    };
  }
  async function removeFund(f, done) {
    if (!confirm(`Delete the entry of ${f.donor_name} (${rs(f.amount)})?`)) return;
    const { data, error } = await sb.from("funds").delete().eq("id", f.id).select();
    if (error || !data.length) return toast("Delete was not allowed.", true);
    toast("Entry deleted"); done && done();
  }

  // ---- expenses ----
  function expense(x, done) {
    init(); $("kExpenseH").textContent = x ? "Edit expense" : "Record expense"; $("kExpenseE").hidden = true;
    $("kExDate").value = x ? (x.expense_date || String(x.created_at || "").slice(0, 10)) : new Date().toISOString().slice(0, 10);
    $("kExCategory").value = x ? x.category : "Other";
    // A previously entered custom category remains editable by using the Other option as a safe fallback.
    if (x && ![...$("kExCategory").options].some(o => o.value === x.category)) {
      const o = document.createElement("option"); o.value = x.category; o.textContent = x.category; $("kExCategory").appendChild(o); $("kExCategory").value = x.category;
    }
    $("kExDesc").value = x ? x.description : ""; $("kExPaid").value = x ? (x.paid_to || "") : "";
    $("kExAmount").value = x ? Math.round(x.amount) : ""; $("kExMethod").value = x ? (x.payment_method || "Cash") : "Cash";
    $("kExRef").value = x ? (x.receipt_reference || "") : "";
    $("kExpense").showModal(); $("kExDate").focus();
    $("kExpenseF").onsubmit = async e => {
      e.preventDefault();
      const amount = Number($("kExAmount").value);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) { $("kExpenseE").textContent = "Enter a positive whole-number amount."; $("kExpenseE").hidden = false; return; }
      const row = { expense_date: $("kExDate").value, category: $("kExCategory").value.trim(), description: $("kExDesc").value.trim(), paid_to: $("kExPaid").value.trim(), amount: Math.round(amount), payment_method: $("kExMethod").value, receipt_reference: $("kExRef").value.trim() || null };
      if (!row.expense_date || row.category.length < 2 || row.description.length < 2) { $("kExpenseE").textContent = "Enter the date, category and a description."; $("kExpenseE").hidden = false; return; }
      const recordId = x ? x.id : crypto.randomUUID();
      const action = { id: `expense-save:${recordId}`, type: "expense-save", recordId, isNew: !x, row, oldRow: x ? { ...x } : null };
      const localRow = { id: recordId, ...row, created_at: x ? x.created_at : new Date().toISOString(), recorded_by: x ? x.recorded_by : (KMRAuth.hint() || "pending sync") };
      if (!enqueue(action, done)) { $("kExpenseE").textContent = "Local storage is unavailable. No change was made."; $("kExpenseE").hidden = false; return; }
      mutateExpenseCaches(localRow); $("kExpense").close();
      toast(navigator.onLine ? (x ? "Expense updated locally; syncing…" : "Expense saved locally; syncing…") : "Expense saved locally; sync will resume online"); syncOutbox();
    };
  }
  async function removeExpense(x, done) {
    if (!confirm(`Delete expense “${x.description}” (${rs(x.amount)})?`)) return;
    const { data, error } = await sb.from("expenses").delete().eq("id", x.id).select();
    if (error || !data || !data.length) return toast("Expense could not be deleted. Check your admin session and connection.", true);
    mutateExpenseCaches(null, { removeId: x.id }); toast("Expense deleted"); done && done();
  }

  // Ledger PDFs are generated locally in the browser and include summary totals and a dated detail table.
  async function fundsPdf(kind, receiveRows, expenseRows, btn) {
    const old = btn && btn.textContent; if (btn) btn.disabled = true;
    try {
      const src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      if (!window.jspdf) await new Promise((resolve, reject) => { const existing = [...document.scripts].find(x => x.src === src); if (existing) { existing.addEventListener("load", resolve, { once: true }); existing.addEventListener("error", reject, { once: true }); return; } const script = document.createElement("script"); script.src = src; script.onload = resolve; script.onerror = () => reject(new Error("Could not load the PDF generator. Check your internet connection.")); document.head.appendChild(script); });
      if (!window.jspdf) throw new Error("PDF generator is unavailable.");
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
      const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight(), margin = 34;
      // Sum each ledger independently. The net/ending balance is allowed to go below zero.
      const totals = KMRFunds.totals(receiveRows, expenseRows);
      const received = totals.received, spent = totals.expenses, netBalance = totals.netBalance;
      const money = n => rs(Number(n || 0));
      const date = v => { if (!v) return "-"; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); };
      const generated = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const title = kind === "receiving" ? "Project Funds - Receiving Report" : kind === "expenses" ? "Project Funds - Expenses Report" : "Project Funds - Combined Statement";
      doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(22, 60, 74); doc.text("Khawrai Marathon Race - Season Three", margin, 34);
      doc.setFontSize(13); doc.text(title, margin, 55); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(90, 108, 118); doc.text(`Generated ${generated}`, pageW - margin, 34, { align: "right" });
      doc.setDrawColor(210, 222, 225); doc.line(margin, 66, pageW - margin, 66);
      let y = 85;
      if (kind === "statement") {
        const boxes = [
          ["TOTAL RECEIVED", received], ["TOTAL EXPENSES", spent], ["ENDING BALANCE", netBalance]
        ];
        const boxGap = 12, boxW = (pageW - margin * 2 - boxGap * 2) / 3;
        boxes.forEach((b, i) => {
          const x = margin + i * (boxW + boxGap);
          doc.setFillColor(246, 249, 249); doc.setDrawColor(220, 229, 231); doc.roundedRect(x, y, boxW, 46, 7, 7, "FD");
          doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(94, 111, 119); doc.text(b[0], x + 12, y + 15);
          doc.setFontSize(15); doc.setTextColor(i === 2 && b[1] < 0 ? 170 : 22, i === 2 && b[1] < 0 ? 45 : 60, i === 2 && b[1] < 0 ? 45 : 74); doc.text(money(b[1]), x + 12, y + 35);
        });
        y += 63;
        const ledger = [];
        (receiveRows || []).forEach(r => ledger.push({ date: r.created_at, sort: new Date(r.created_at || 0).getTime(), type: "Receiving", detail: r.source === "registration" ? `Entry fee ${r.reference || ""}` : "Donation", party: r.donor_name || "-", inflow: Number(r.amount || 0), outflow: 0 }));
        (expenseRows || []).forEach(r => ledger.push({ date: r.expense_date || r.created_at, sort: new Date(r.expense_date || r.created_at || 0).getTime(), type: "Expense", detail: `${r.category || ""}: ${r.description || ""}`, party: r.paid_to || "-", inflow: 0, outflow: Number(r.amount || 0) }));
        ledger.sort((a, b) => a.sort - b.sort);
        let balance = 0;
        const tableRows = ledger.map(r => { balance += r.inflow - r.outflow; return [date(r.date), r.type, r.detail, r.party, r.inflow ? money(r.inflow) : "-", r.outflow ? money(r.outflow) : "-", money(balance)]; });
        const tableEndY = drawTable(["Date", "Type", "Details", "Name / Payee", "Received", "Expense", "Balance"], tableRows, [70, 62, 245, 135, 80, 80, 82], y);
        let endingY = tableEndY + 25;
        if (endingY > pageH - 30) { doc.addPage(); endingY = 42; }
        doc.setDrawColor(210, 222, 225); doc.line(margin, endingY - 12, pageW - margin, endingY - 12);
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(38, 68, 79);
        doc.text("ENDING BALANCE (TOTAL RECEIVED - TOTAL EXPENSES)", margin, endingY);
        doc.setTextColor(netBalance < 0 ? 170 : 22, netBalance < 0 ? 45 : 60, netBalance < 0 ? 45 : 74);
        doc.text(money(netBalance), pageW - margin, endingY, { align: "right" });
      } else if (kind === "receiving") {
        const data = (receiveRows || []).slice().sort((a,b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)).map(r => [date(r.created_at), r.donor_name || "-", r.mohallah || "-", r.source === "registration" ? `Entry fee ${r.reference || ""}` : "Donation", money(r.amount)]);
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(22,60,74); doc.text(`Entries: ${data.length}     Total received: ${money(received)}`, margin, y); y += 14;
        drawTable(["Date", "Name", "Mohallah", "Type / Reference", "Amount"], data, [82, 175, 175, 230, 100], y);
      } else {
        const data = (expenseRows || []).slice().sort((a,b) => new Date(a.expense_date || a.created_at || 0) - new Date(b.expense_date || b.created_at || 0)).map(r => [date(r.expense_date || r.created_at), r.category || "-", r.description || "-", r.paid_to || "-", r.payment_method || "-", money(r.amount)]);
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(22,60,74); doc.text(`Entries: ${data.length}     Total expenses: ${money(spent)}`, margin, y); y += 14;
        drawTable(["Date", "Category", "Description", "Paid to", "Payment method", "Amount"], data, [82, 115, 260, 150, 105, 100], y);
      }
      function drawTable(headers, rows, widths, startY) {
        const totalW = widths.reduce((a,b) => a+b, 0), x0 = margin;
        if (totalW > pageW - margin*2) { const scale = (pageW - margin*2) / totalW; widths = widths.map(w => w * scale); }
        let y0 = startY, rowH;
        const header = () => { doc.setFillColor(233, 241, 242); doc.setDrawColor(215, 225, 228); doc.rect(x0, y0, widths.reduce((a,b)=>a+b,0), 23, "FD"); let x=x0; doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(38,68,79); headers.forEach((h,i)=>{ doc.text(String(h),x+6,y0+14,{maxWidth:widths[i]-10}); x+=widths[i]; }); y0 += 23; };
        header();
        if (!rows.length) { doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(90,108,118); doc.text("No entries recorded.", x0+5, y0+18); return y0 + 25; }
        rows.forEach((row, ri) => {
          const wrapped = row.map((v,i) => doc.splitTextToSize(String(v ?? "-"), Math.max(22,widths[i]-12)));
          rowH = Math.max(24, Math.max(...wrapped.map(t => t.length)) * 10 + 10);
          if (y0 + rowH > pageH - 35) { doc.addPage(); y0 = 35; header(); }
          if (ri % 2 === 1) { doc.setFillColor(249,251,251); doc.rect(x0,y0,widths.reduce((a,b)=>a+b,0),rowH,"F"); }
          doc.setDrawColor(232,238,239); doc.line(x0,y0+rowH,x0+widths.reduce((a,b)=>a+b,0),y0+rowH);
          let x=x0; doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(48,65,73);
          wrapped.forEach((t,i)=>{ doc.text(t,x+6,y0+13); x+=widths[i]; }); y0+=rowH;
        });
        return y0;
      }
      const fileName = kind === "receiving" ? "Khawrai-S3-receiving.pdf" : kind === "expenses" ? "Khawrai-S3-expenses.pdf" : "Khawrai-S3-funds-statement.pdf";
      doc.save(fileName);
    } catch (e) { toast("PDF failed: " + (e.message || e), true); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }

  window.KMRAdmin = { init, pay, unconfirm, cancel, edit, remove, pdf, details, fund, removeFund, expense, removeExpense, fundsPdf, syncOutbox };
})();
