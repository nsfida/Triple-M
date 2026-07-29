/* Modularized from script.js lines 32934-35230 — Notes. Load order must be preserved. */
// Notes Functions
async function saveNote() {
  const noteText = els.noteInput.value.trim();
  if (!noteText) {
    alert('Please enter a note.');
    return;
  }

  if (isGuestMode()) {
    state.notes.unshift({
      id: crypto.randomUUID(),
      content: noteText,
      createdAt: new Date().toISOString()
    });
    saveGuestNotesToStorage();
    els.noteInput.value = '';
    renderNotes();
    return;
  }

  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    alert("Please sign in with your username and password to connect to the database.");
    els.lockScreen.classList.remove("hide");
    return;
  }

  const noteId = crypto.randomUUID();
  const domainPayload = {
    id: noteId,
    owner_id: currentOwnerId(),
    content: noteText,
    notes: JSON.stringify({ content: noteText, rowType: "NOTE" }),
    meta: { rowType: "NOTE" },
    is_deleted: false,
    created_at: new Date().toISOString()
  };

  console.log('Saving note to database:', domainPayload);
  try {
    try {
      await supabase("app_notes", { method: "POST", body: JSON.stringify(domainPayload) });
    } catch (domainErr) {
      const payload = {
        id: noteId,
        group_id: noteId,
        person_name: "SYSTEM",
        direction: "taken",
        entry_kind: "principal",
        currency: "AED",
        principal_amount: 0,
        loan_date: new Date().toISOString().split("T")[0],
        action_date: new Date().toISOString().split("T")[0],
        notes: domainPayload.notes,
        created_at: domainPayload.created_at,
        owner_id: domainPayload.owner_id
      };
      await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
      console.warn("app_notes insert failed; used ledger fallback:", domainErr);
    }
    els.noteInput.value = '';
    await loadNotesFromDatabase({ force: true });
  } catch (err) {
    console.error('Failed to save note:', err);
    alert("Failed to save note to database: " + err.message);
  }
}

const noteReminderUiState = {
  pendingNoteIds: new Set(),
  pendingReminders: [],
  loadedAt: 0,
  inFlight: null,
  modalMode: "note", // "note" | "installment"
  modalNoteId: null,
  modalPlanGroupId: null,
  modalPending: [],
  wakeTimer: null,
  wakeAtMs: null,
  toastedReminderIds: new Set()
};

function clearNoteReminderWakeTimer(){
  if (noteReminderUiState.wakeTimer) {
    clearTimeout(noteReminderUiState.wakeTimer);
    noteReminderUiState.wakeTimer = null;
  }
  noteReminderUiState.wakeAtMs = null;
}

function locallyDueNoteReminders(pendingItems, graceMs = 2000){
  const cutoff = Date.now() + Math.max(0, Number(graceMs) || 0);
  return (Array.isArray(pendingItems) ? pendingItems : []).filter(r => {
    if (!r || r.is_delivered) return false;
    const t = new Date(r.remind_at).getTime();
    return Number.isFinite(t) && t <= cutoff;
  });
}

function openNoteReminderNotifyPanel(){
  try { activate("notes"); } catch (_) {}
  const btn = document.getElementById("adminNotifyBtn");
  const panel = document.getElementById("adminNotifyDropdown");
  if (!btn || !panel) return;
  if (!panel.classList.contains("open")) {
    btn.click();
  } else {
    loadAdminNotificationsDropdown().catch(() => {});
  }
}

const REMINDER_ALERT_SOUND_SRC = "Assets/sounds/reminder.mp3";

const reminderAlertState = {
  queue: [],
  current: null,
  audio: null,
  isOpen: false,
  bound: false,
  deferUntilNoteModalClose: false,
  prevBodyOverflow: "",
  escapeHandler: null
};

function ensureNoteReminderToastHost(){
  // Legacy host kept for compatibility; overlay replaces toast delivery.
  let host = document.getElementById("noteReminderToastHost");
  if (host) return host;
  host = document.createElement("div");
  host.id = "noteReminderToastHost";
  host.className = "note-reminder-toast-host";
  host.setAttribute("aria-live", "polite");
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

function stopReminderAlertSound(){
  const audio = reminderAlertState.audio;
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch (_) {}
}

function unlockReminderAlertAudio(){
  try {
    let audio = reminderAlertState.audio;
    if (!audio) {
      audio = new Audio(REMINDER_ALERT_SOUND_SRC);
      audio.preload = "auto";
      reminderAlertState.audio = audio;
    }
    const prevMuted = audio.muted;
    audio.muted = true;
    const p = audio.play();
    const finish = () => {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = prevMuted;
      } catch (_) {}
    };
    if (p && typeof p.then === "function") p.then(finish).catch(finish);
    else finish();
  } catch (_) {}
}

function ensureReminderAlertAudioUnlocked(){
  if (reminderAlertState.audioUnlocked) return;
  const unlock = () => {
    reminderAlertState.audioUnlocked = true;
    unlockReminderAlertAudio();
    document.removeEventListener("pointerdown", unlock, true);
    document.removeEventListener("keydown", unlock, true);
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
}

function startReminderAlertSound(){
  stopReminderAlertSound();
  ensureReminderAlertAudioUnlocked();
  try {
    let audio = reminderAlertState.audio;
    if (!audio) {
      audio = new Audio(REMINDER_ALERT_SOUND_SRC);
      audio.preload = "auto";
      reminderAlertState.audio = audio;
    }
    audio.muted = false;
    audio.loop = true;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Autoplay blocked until a user gesture unlocks audio.
        ensureReminderAlertAudioUnlocked();
      });
    }
  } catch (_) {}
}

function reminderAlertDedupeKey(item){
  if (!item) return "";
  if (item.key) return String(item.key);
  if (item.id) return String(item.id);
  if (item.kind === "installment_due") {
    return `installment:${item.planGroupId || ""}:${item.slotIndex || ""}:${item.dueDate || ""}:${item.offsetDays ?? ""}`;
  }
  if (item.kind === "installment_manual") {
    return `installment_manual:${item.id || item.planGroupId || ""}:${item.remindAt || ""}`;
  }
  return `note:${item.noteId || ""}:${item.remindAt || ""}:${item.message || ""}`;
}

function extractPlanGroupIdFromReminderRaw(raw){
  if (!raw) return "";
  const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : {};
  const direct = String(
    raw.related_plan_group_id || raw.relatedPlanGroupId
    || raw.plan_group_id || raw.planGroupId
    || payload.plan_group_id || payload.related_plan_group_id || ""
  ).trim();
  if (direct) return direct;
  // Pre-045 fallback stored plan id at end of preview/message.
  const blob = `${raw.note_preview || raw.notePreview || payload.note_preview || ""} ${raw.message || ""}`;
  const uuid = blob.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return uuid ? uuid[0] : "";
}

function isInstallmentManualReminderRaw(raw){
  if (!raw) return false;
  if (raw.kind === "installment_manual") return true;
  const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : {};
  if (payload.type === "installment_manual") return true;
  const planId = extractPlanGroupIdFromReminderRaw(raw);
  if (!planId) return false;
  // Rows from app_note_reminders with null note_id + plan group id / preview marker.
  if (!raw.note_id && !raw.noteId && !payload.note_id) return true;
  const preview = String(raw.note_preview || raw.notePreview || payload.note_preview || "");
  return /^Installment\b/i.test(preview.trim());
}

function normalizeReminderAlertItem(raw){
  if (!raw) return null;
  if (raw.kind === "installment_due") {
    const personName = String(raw.person_name || raw.personName || "").trim();
    const whenLabel = Number(raw.offset_days ?? raw.offsetDays) === 0
      ? "due today"
      : Number(raw.offset_days ?? raw.offsetDays) === 3
        ? "due in 3 days"
        : Number(raw.offset_days ?? raw.offsetDays) === 5
          ? "due in 5 days"
          : "due soon";
    const dueDate = String(raw.due_date || raw.dueDate || "").slice(0, 10);
    const amountLabel = String(raw.amount_label || raw.amountLabel || "").trim();
    const slotIndex = raw.slot_index ?? raw.slotIndex ?? "";
    const body = String(raw.body || raw.message || "").trim() || [
      personName || "Installment plan",
      slotIndex !== "" ? `#${slotIndex}` : "",
      dueDate,
      amountLabel
    ].filter(Boolean).join(" · ");
    return {
      kind: "installment_due",
      key: raw.key || `installment:${raw.plan_group_id || raw.planGroupId || ""}:${slotIndex}:${dueDate}:${raw.offset_days ?? raw.offsetDays ?? ""}`,
      title: String(raw.title || `Installment ${whenLabel}`).trim() || "Installment due",
      message: body,
      preview: personName ? `${personName}${slotIndex !== "" ? ` · #${slotIndex}` : ""}` : body,
      noteId: null,
      notificationId: raw.notification_id || raw.notificationId || null,
      planGroupId: raw.plan_group_id || raw.planGroupId || "",
      slotIndex,
      dueDate,
      offsetDays: raw.offset_days ?? raw.offsetDays ?? null,
      personName,
      remindAt: null
    };
  }

  if (isInstallmentManualReminderRaw(raw)) {
    const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : {};
    const planGroupId = extractPlanGroupIdFromReminderRaw(raw);
    let preview = String(raw.note_preview || raw.notePreview || payload.note_preview || "").trim();
    // Strip trailing plan uuid from pre-045 fallback previews for display.
    if (planGroupId && preview.endsWith(planGroupId)) {
      preview = preview.slice(0, -planGroupId.length).replace(/\s*[·|-]\s*$/, "").trim();
    }
    const personName = String(raw.person_name || raw.personName || payload.person_name || "").trim();
    if (!preview && personName) preview = `Installment · ${personName}`;
    if (!preview && planGroupId) {
      const plan = typeof getInstallmentPlanGroup === "function" ? getInstallmentPlanGroup(planGroupId) : null;
      preview = plan?.person_name ? `Installment · ${plan.person_name}` : "Installment reminder";
    }
    const message = String(raw.message || "").trim()
      || String(raw.body || "").trim()
      || "Installment reminder";
    return {
      kind: "installment_manual",
      key: raw.id
        ? String(raw.id)
        : `installment_manual:${planGroupId}:${raw.remind_at || raw.remindAt || ""}:${message}`,
      id: raw.id || null,
      title: String(raw.title || "Installment reminder").trim() || "Installment reminder",
      message,
      preview,
      noteId: null,
      notificationId: raw.notification_id || raw.notificationId || null,
      planGroupId,
      personName,
      remindAt: raw.remind_at || raw.remindAt || null
    };
  }

  const noteId = raw.note_id || raw.noteId || null;
  let notePreview = String(raw.note_preview || raw.notePreview || "").trim();
  if (!notePreview && noteId && Array.isArray(state.notes)) {
    const note = state.notes.find(n => String(n.id) === String(noteId));
    notePreview = String(note?.content || "").trim().slice(0, 240);
  }
  const message = String(raw.message || "").trim()
    || String(raw.body || "").trim()
    || "Reminder for your note";
  return {
    kind: "note_reminder",
    key: raw.id
      ? String(raw.id)
      : `note:${noteId || ""}:${raw.remind_at || raw.remindAt || ""}:${message}`,
    id: raw.id || null,
    title: String(raw.title || "Note reminder").trim() || "Note reminder",
    message,
    preview: notePreview,
    noteId,
    notificationId: raw.notification_id || raw.notificationId || null,
    remindAt: raw.remind_at || raw.remindAt || null,
    planGroupId: ""
  };
}

function resolveReminderNotificationId(item){
  if (!item) return null;
  if (item.notificationId) return item.notificationId;
  const list = Array.isArray(adminCommsState?.notifications) ? adminCommsState.notifications : [];
  if (!list.length) return null;
  if ((item.kind === "note_reminder" || item.kind === "installment_manual") && item.id) {
    const match = list.find(n =>
      n?.kind === "note_reminder"
      && (String(n.related_reminder_id || "") === String(item.id)
        || String(n.payload?.reminder_id || "") === String(item.id))
    );
    if (match?.id) return match.id;
  }
  if (item.kind === "note_reminder" && item.noteId) {
    const match = list.find(n =>
      n?.kind === "note_reminder"
      && String(n.related_note_id || n.payload?.note_id || "") === String(item.noteId)
      && !n.is_read
    );
    if (match?.id) return match.id;
  }
  if (item.kind === "installment_manual" && item.planGroupId) {
    const match = list.find(n => {
      if (n?.kind !== "note_reminder" || n.is_read) return false;
      const p = n.payload && typeof n.payload === "object" ? n.payload : {};
      return String(p.plan_group_id || p.related_plan_group_id || "") === String(item.planGroupId)
        && (p.type === "installment_manual" || !n.related_note_id);
    });
    if (match?.id) return match.id;
  }
  if (item.kind === "installment_due" && item.key) {
    const match = list.find(n => {
      if (n?.kind !== "installment_due" || n.is_read) return false;
      const p = n.payload && typeof n.payload === "object" ? n.payload : {};
      const k = `installment:${p.plan_group_id || ""}:${p.slot_index || ""}:${String(p.due_date || "").slice(0, 10)}:${p.offset_days ?? ""}`;
      return k === item.key;
    });
    if (match?.id) return match.id;
  }
  return null;
}

function ensureReminderAlertModal(){
  let modal = document.getElementById("reminderAlertModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "reminderAlertModal";
    modal.className = "modal hide reminder-alert-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.setAttribute("role", "alertdialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "reminderAlertTitle");
    modal.setAttribute("aria-describedby", "reminderAlertBody");
    modal.innerHTML = `
      <div class="modal-backdrop" data-reminder-alert-dismiss="done"></div>
      <div class="modal-dialog compact-entry-dialog reminder-alert-dialog">
        <div class="modal-head">
          <div>
            <h3 id="reminderAlertTitle">Reminder</h3>
            <p id="reminderAlertSubtitle" class="help">Due notification</p>
          </div>
          <button class="icon-btn ghost" type="button" data-reminder-alert-dismiss="done" aria-label="Done">×</button>
        </div>
        <div class="modal-body">
          <div id="reminderAlertPreview" class="reminder-alert-preview"></div>
          <p id="reminderAlertBody" class="reminder-alert-message"></p>
          <div class="field w12 modal-footer reminder-alert-actions">
            <button class="btn ghost" type="button" id="reminderAlertRescheduleBtn">Reschedule</button>
            <button class="btn primary" type="button" data-reminder-alert-dismiss="done">Done</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  } else {
    // Migrate older Close-based markup to Done-only actions.
    modal.querySelectorAll('[data-reminder-alert-dismiss="close"]').forEach(el => {
      el.setAttribute("data-reminder-alert-dismiss", "done");
      if (el.tagName === "BUTTON" && el.getAttribute("aria-label") === "Close") {
        el.setAttribute("aria-label", "Done");
      }
    });
    modal.querySelectorAll(".reminder-alert-actions > .btn.ghost").forEach(btn => {
      if (btn.id === "reminderAlertRescheduleBtn") return;
      if (/^close$/i.test(String(btn.textContent || "").trim())) btn.remove();
    });
  }
  bindReminderAlertModal(modal);
  return modal;
}

function bindReminderAlertModal(modal){
  if (!modal || reminderAlertState.bound) return;
  reminderAlertState.bound = true;
  modal.addEventListener("click", e => {
    const dismissEl = e.target.closest("[data-reminder-alert-dismiss]");
    if (!dismissEl || !modal.contains(dismissEl)) return;
    e.preventDefault();
    const action = dismissEl.getAttribute("data-reminder-alert-dismiss") || "done";
    dismissReminderAlert(action === "close" ? "done" : action);
  });
  modal.querySelector("#reminderAlertRescheduleBtn")?.addEventListener("click", e => {
    e.preventDefault();
    dismissReminderAlert("reschedule");
  });
  reminderAlertState.escapeHandler = e => {
    if (e.key !== "Escape") return;
    if (!reminderAlertState.isOpen) return;
    e.preventDefault();
    e.stopPropagation();
    dismissReminderAlert("done");
  };
  document.addEventListener("keydown", reminderAlertState.escapeHandler, true);
}

function hideReminderAlertModalShell(){
  stopReminderAlertSound();
  reminderAlertState.isOpen = false;
  reminderAlertState.current = null;
  const modal = document.getElementById("reminderAlertModal");
  if (modal) {
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
  }
  document.body.style.overflow = reminderAlertState.prevBodyOverflow || "";
  reminderAlertState.prevBodyOverflow = "";
}

function resetReminderAlertUi(){
  reminderAlertState.queue = [];
  reminderAlertState.deferUntilNoteModalClose = false;
  hideReminderAlertModalShell();
}

function fillReminderAlertModal(item){
  const titleEl = document.getElementById("reminderAlertTitle");
  const subtitleEl = document.getElementById("reminderAlertSubtitle");
  const previewEl = document.getElementById("reminderAlertPreview");
  const bodyEl = document.getElementById("reminderAlertBody");
  const rescheduleBtn = document.getElementById("reminderAlertRescheduleBtn");
  if (titleEl) {
    titleEl.textContent = item.title
      || (item.kind === "installment_due"
        ? "Installment due"
        : item.kind === "installment_manual"
          ? "Installment reminder"
          : "Note reminder");
  }
  if (subtitleEl) {
    if (item.kind === "installment_due") {
      subtitleEl.textContent = "Installment payment reminder";
    } else if (item.kind === "installment_manual") {
      if (item.remindAt && typeof formatNoteReminderWhen === "function") {
        const when = formatNoteReminderWhen(item.remindAt);
        subtitleEl.textContent = when ? `Scheduled ${when}` : "Installment reminder";
      } else {
        subtitleEl.textContent = "Installment reminder";
      }
    } else if (item.remindAt && typeof formatNoteReminderWhen === "function") {
      const when = formatNoteReminderWhen(item.remindAt);
      subtitleEl.textContent = when ? `Scheduled ${when}` : "Note reminder";
    } else {
      subtitleEl.textContent = "Note reminder";
    }
  }
  if (previewEl) {
    const preview = String(item.preview || "").trim();
    previewEl.textContent = preview;
    previewEl.classList.toggle("hide", !preview);
  }
  if (bodyEl) {
    const msg = String(item.message || "").trim();
    const preview = String(item.preview || "").trim();
    // Avoid duplicating the same text in preview + body.
    bodyEl.textContent = msg && msg !== preview ? msg : "";
  }
  if (rescheduleBtn) {
    rescheduleBtn.textContent = item.kind === "installment_due" ? "Open installments" : "Reschedule";
  }
}

function presentNextReminderAlert(){
  if (reminderAlertState.isOpen) return;
  if (reminderAlertState.deferUntilNoteModalClose) {
    const noteModal = document.getElementById("noteReminderModal");
    if (noteModal && !noteModal.classList.contains("hide")) return;
    reminderAlertState.deferUntilNoteModalClose = false;
  }
  const next = reminderAlertState.queue.shift();
  if (!next) {
    hideReminderAlertModalShell();
    return;
  }
  const modal = ensureReminderAlertModal();
  reminderAlertState.current = next;
  reminderAlertState.isOpen = true;
  reminderAlertState.prevBodyOverflow = document.body.style.overflow || "";
  fillReminderAlertModal(next);
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  startReminderAlertSound();
  try {
    modal.querySelector("[data-reminder-alert-dismiss='done']")?.focus?.();
  } catch (_) {}
}

function enqueueReminderAlerts(items){
  const list = Array.isArray(items) ? items : [items];
  let added = 0;
  for (const raw of list) {
    const item = normalizeReminderAlertItem(raw);
    if (!item) continue;
    const key = reminderAlertDedupeKey(item);
    if (!key || noteReminderUiState.toastedReminderIds.has(key)) continue;
    noteReminderUiState.toastedReminderIds.add(key);
    reminderAlertState.queue.push(item);
    added += 1;
  }
  if (added > 0) presentNextReminderAlert();
}

async function dismissReminderAlert(action = "done"){
  const current = reminderAlertState.current;
  const wasOpen = reminderAlertState.isOpen;
  stopReminderAlertSound();
  // Backdrop / Escape / legacy "close" all behave like Done.
  if (action === "close") action = "done";

  if (action === "done" && current) {
    let notifId = resolveReminderNotificationId(current) || current.notificationId || null;
    if (!notifId) {
      try {
        const { items } = await fetchMyNotificationsList(50);
        mergeUserNotificationsIntoCommsCache(items);
        notifId = resolveReminderNotificationId(current);
      } catch (_) {}
    }
    if (notifId) {
      try {
        await supabaseRpc("app_mark_my_notification_read", { p_notification_id: notifId });
        await refreshAdminCommsBadges();
        if (isAdminCommsDropdownOpen("admin-notify")) {
          try { await loadAdminNotificationsDropdown(); } catch (_) {}
        }
      } catch (_) {}
    }
  }

  if (action === "reschedule" && current) {
    hideReminderAlertModalShell();
    if (current.kind === "note_reminder" && current.noteId) {
      reminderAlertState.deferUntilNoteModalClose = true;
      try {
        if (typeof activate === "function") activate("notes");
      } catch (_) {}
      try {
        await window.openNoteReminderModal(current.noteId);
      } catch (_) {}
      const noteModal = document.getElementById("noteReminderModal");
      if (!noteModal || noteModal.classList.contains("hide")) {
        reminderAlertState.deferUntilNoteModalClose = false;
        presentNextReminderAlert();
      }
      return;
    }
    if (
      (current.kind === "installment_manual" || current.kind === "note_reminder")
      && current.planGroupId
    ) {
      reminderAlertState.deferUntilNoteModalClose = true;
      try {
        if (typeof activate === "function") activate("installments");
      } catch (_) {}
      try {
        await window.openInstallmentReminderModal(current.planGroupId);
      } catch (_) {}
      const noteModal = document.getElementById("noteReminderModal");
      if (!noteModal || noteModal.classList.contains("hide")) {
        reminderAlertState.deferUntilNoteModalClose = false;
        presentNextReminderAlert();
      }
      return;
    }
    try {
      if (typeof activate === "function") activate("installments");
    } catch (_) {}
    presentNextReminderAlert();
    return;
  }

  if (wasOpen) hideReminderAlertModalShell();
  else {
    reminderAlertState.current = null;
    reminderAlertState.isOpen = false;
  }
  presentNextReminderAlert();
}

/** Centered overlay alert (replaces corner toast). */
function showNoteReminderToast(title, body){
  enqueueReminderAlerts([{
    kind: "note_reminder",
    title: title || "Note reminder",
    message: body || "Reminder for your note",
    note_preview: body || ""
  }]);
}

function showNoteReminderToasts(items){
  enqueueReminderAlerts(items);
}

function mergeUserNotificationsIntoCommsCache(items){
  const incoming = Array.isArray(items) ? items : [];
  const existing = Array.isArray(adminCommsState?.notifications) ? adminCommsState.notifications : [];
  const byId = new Map();
  existing.forEach(n => {
    if (n?.id) byId.set(String(n.id), n);
  });
  incoming.forEach(n => {
    if (!n?.id) return;
    byId.set(String(n.id), { ...n, source: n.source || "user" });
  });
  adminCommsState.notifications = Array.from(byId.values())
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 50);
  return adminCommsState.notifications;
}

async function fetchMyNotificationsList(limit = 40){
  const res = unwrapRpcJson(await supabaseRpc("app_list_my_notifications", { p_limit: limit }));
  const items = Array.isArray(res?.items) ? res.items : [];
  const unread = Math.max(0, Number(res?.unread || 0));
  return { items, unread, raw: res };
}

/** Map an unread inbox row into overlay alert input (note / installment manual / due). */
function notificationRowToReminderAlertRaw(n){
  if (!n || n.is_read) return null;
  const kind = String(n.kind || "").toLowerCase();
  if (kind !== "note_reminder" && kind !== "installment_due") return null;
  const payload = n.payload && typeof n.payload === "object" ? n.payload : {};

  if (kind === "installment_due") {
    return {
      kind: "installment_due",
      title: n.title,
      body: n.body,
      message: n.body,
      notification_id: n.id,
      plan_group_id: payload.plan_group_id || payload.related_plan_group_id || "",
      person_name: payload.person_name || "",
      offset_days: payload.offset_days,
      due_date: payload.due_date,
      slot_index: payload.slot_index,
      amount_label: payload.amount_label || "",
      key: n.dedupe_key || undefined
    };
  }

  const isInstallmentManual = payload.type === "installment_manual"
    || (!!(payload.plan_group_id || payload.related_plan_group_id) && !n.related_note_id && !payload.note_id);
  return {
    kind: isInstallmentManual ? "installment_manual" : "note_reminder",
    id: n.related_reminder_id || payload.reminder_id || n.id || null,
    title: n.title,
    message: n.body || payload.message || "",
    body: n.body,
    note_id: n.related_note_id || payload.note_id || null,
    note_preview: payload.note_preview || "",
    remind_at: payload.remind_at || null,
    notification_id: n.id,
    related_plan_group_id: payload.plan_group_id || payload.related_plan_group_id || "",
    plan_group_id: payload.plan_group_id || payload.related_plan_group_id || "",
    person_name: payload.person_name || "",
    payload
  };
}

/**
 * Show the same reminder overlay for unread note/installment notifications
 * (covers page-closed-during-due: badge exists but no live wake timer ran).
 */
async function presentUnreadReminderAlertsFromNotifications(){
  if (!messagingLiveEligible()) return 0;
  try {
    const { items } = await fetchMyNotificationsList(50);
    mergeUserNotificationsIntoCommsCache(items);
    const alerts = items
      .map(notificationRowToReminderAlertRaw)
      .filter(Boolean);
    if (alerts.length) enqueueReminderAlerts(alerts);
    return alerts.length;
  } catch (err) {
    console.warn("Could not present unread reminder alerts:", err);
    return 0;
  }
}

/** On unlock / cold load: deliver due rows, then play unread reminder overlays. */
async function bootstrapReminderDeliveryOnUnlock(){
  if (!messagingLiveEligible()) return;
  try {
    await dispatchDueNoteRemindersThrottled(true);
    try { await ensurePendingNoteReminderMap(true); } catch (_) {}
    const dueLocal = locallyDueNoteReminders(noteReminderUiState.pendingReminders, 2000);
    if (dueLocal.length) showNoteReminderToasts(dueLocal);
    await presentUnreadReminderAlertsFromNotifications();
    await refreshAdminCommsBadges();
  } catch (err) {
    console.warn("Reminder bootstrap failed:", err);
  }
}

/** Fire dispatch at the local instant of the earliest pending remind_at (no poll wait). */
function scheduleNoteReminderWake(pendingItems){
  clearNoteReminderWakeTimer();
  const pending = Array.isArray(pendingItems) ? pendingItems.filter(r => r && !r.is_delivered) : [];
  let earliest = Infinity;
  for (const r of pending) {
    const t = new Date(r.remind_at).getTime();
    if (Number.isFinite(t) && t < earliest) earliest = t;
  }
  if (!Number.isFinite(earliest)) return;
  // Keep absolute wake ms; schedule from raw delta (clamped only for setTimeout limits).
  const wakeAtMs = earliest;
  noteReminderUiState.wakeAtMs = wakeAtMs;
  const MAX_DELAY = 2147483647;
  const rawMs = wakeAtMs - Date.now();
  const delay = Math.max(50, Math.min(rawMs, MAX_DELAY));
  noteReminderUiState.wakeTimer = setTimeout(async () => {
    noteReminderUiState.wakeTimer = null;
    try {
      if (Date.now() + 1000 < wakeAtMs) {
        scheduleNoteReminderWake(noteReminderUiState.pendingReminders);
        return;
      }
      // Toast immediately for locally due items (even before RPC / while tab is hidden).
      const dueLocal = locallyDueNoteReminders(noteReminderUiState.pendingReminders, 2000);
      if (dueLocal.length) showNoteReminderToasts(dueLocal);
      await dispatchDueNoteRemindersThrottled(true);
      await refreshAdminCommsBadges();
      if (isAdminCommsDropdownOpen("admin-notify")) {
        try { await loadAdminNotificationsDropdown(); } catch (_) {}
      }
      noteReminderUiState.loadedAt = 0;
      await ensurePendingNoteReminderMap(true);
      renderNotes(els.searchNotes?.value || "");
    } catch (err) {
      console.warn("Note reminder wake failed:", err);
    }
  }, delay);
}

async function ensurePendingNoteReminderMap(force = false){
  if (isGuestMode() || !state.sessionUser) {
    noteReminderUiState.pendingNoteIds = new Set();
    noteReminderUiState.pendingReminders = [];
    clearNoteReminderWakeTimer();
    noteReminderUiState.loadedAt = Date.now();
    return noteReminderUiState.pendingNoteIds;
  }
  if (!force && noteReminderUiState.inFlight) return noteReminderUiState.inFlight;
  if (!force && noteReminderUiState.loadedAt && Date.now() - noteReminderUiState.loadedAt < 20000) {
    return noteReminderUiState.pendingNoteIds;
  }
  const run = (async () => {
    try {
      const res = unwrapRpcJson(await supabaseRpc("app_list_my_note_reminders", {}));
      const items = Array.isArray(res?.pending)
        ? res.pending
        : (Array.isArray(res?.items) ? res.items : []);
      const pending = items.filter(r => !r.is_delivered);
      noteReminderUiState.pendingReminders = pending;
      noteReminderUiState.pendingNoteIds = new Set(
        pending
          .map(r => String(r.note_id || ""))
          .filter(Boolean)
      );
      noteReminderUiState.loadedAt = Date.now();
      scheduleNoteReminderWake(pending);
    } catch (_) {
      if (!noteReminderUiState.loadedAt) {
        noteReminderUiState.pendingNoteIds = new Set();
        noteReminderUiState.pendingReminders = [];
      }
    } finally {
      noteReminderUiState.inFlight = null;
    }
    return noteReminderUiState.pendingNoteIds;
  })();
  noteReminderUiState.inFlight = run;
  return run;
}

async function renderNotes(searchTerm = '') {
  if (!isGuestMode() && state.sessionUser) {
    await ensurePendingNoteReminderMap(false);
  } else {
    noteReminderUiState.pendingNoteIds = new Set();
  }

  const filteredNotes = searchTerm
    ? state.notes.filter(note =>
        note.content.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : state.notes;

  els.notesList.innerHTML = '';

  if (filteredNotes.length === 0) {
    els.notesList.innerHTML = '<div class="empty">No notes found.</div>';
    syncLegacyFixAllButtons();
    return;
  }

  filteredNotes.forEach(note => {
    const noteDate = new Date(note.createdAt);
    const formattedDate = noteDate.toLocaleDateString() + ' ' + noteDate.toLocaleTimeString();
    const noteContent = String(note.content || "");
    const needsPreview = noteContent.split(/\r?\n/).length > 2 || noteContent.length > 180;
    const hasReminder = noteReminderUiState.pendingNoteIds.has(String(note.id));

    const noteEl = document.createElement('div');
    noteEl.className = 'card';
    noteEl.style.marginBottom = '12px';
    noteEl.style.padding = '14px';
    const legacyBtn = note.is_legacy_meta && window.DomainLedger
      ? DomainLedger.legacyFixBadgeHtml("", note.id)
      : "";
    noteEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div style="flex:1;min-width:0;max-width:100%;">
          <div class="note-content-preview${needsPreview ? " is-collapsed" : ""}">${escapeHtml(noteContent)}</div>
          ${needsPreview ? '<button class="note-see-more-btn" type="button" onclick="toggleNotePreview(this)">See More</button>' : ""}
          ${legacyBtn ? `<div style="margin-top:8px;">${legacyBtn}</div>` : ""}
        </div>
        <div class="note-card-actions" style="display:flex;gap:6px;margin-left:10px;flex-shrink:0;">
          <button class="btn ghost note-reminder-bell${hasReminder ? " has-reminder" : ""}" onclick="openNoteReminderModal('${note.id}')" style="padding:4px 8px;font-size:.8rem;" title="${hasReminder ? "Reminders set" : "Reminder"}" aria-label="${hasReminder ? "Reminders set" : "Set reminder"}">
            <i class="fa-solid fa-bell"></i>
          </button>
          <button class="btn ghost" onclick="editNote('${note.id}')" style="padding:4px 8px;font-size:.8rem;" title="Edit">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn ghost" onclick="deleteNote('${note.id}')" style="padding:4px 8px;font-size:.8rem;" title="Delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <div style="font-size:.76rem;color:var(--muted);">${formattedDate}</div>
    `;
    els.notesList.appendChild(noteEl);
    noteEl.querySelectorAll("[data-legacy-fix-id]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault();
        fixLegacyMetaEntry(btn.dataset.legacyFixId, btn.dataset.legacyFixGroup);
      });
    });
  });
  syncLegacyFixAllButtons();
}

window.toggleNotePreview = function(btn) {
  const noteCard = btn?.closest('.card');
  const content = noteCard?.querySelector('.note-content-preview');
  if (!content) return;
  const expanded = content.classList.toggle('is-collapsed') === false;
  btn.textContent = expanded ? 'See Less' : 'See More';
};

window.deleteNote = async function(noteId) {
  if (!confirm('Are you sure you want to delete this note?')) return;
  
  if (isGuestMode()) {
    state.notes = state.notes.filter(note => note.id !== noteId);
    saveGuestNotesToStorage();
    renderNotes();
    return;
  }

  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    alert("Please sign in with your username and password to connect to the database.");
    els.lockScreen.classList.remove("hide");
    return;
  }

  try {
    const note = state.notes.find(n => n.id === noteId);
    // Soft-delete / remove from BOTH stores so dual-read cannot resurrect
    await supabase(`app_notes?id=eq.${encodeURIComponent(noteId)}`, {
      method: "PATCH",
      body: JSON.stringify({ is_deleted: true, updated_at: new Date().toISOString() })
    }).catch(err => console.warn("app_notes soft-delete skipped/failed:", err));

    const ledgerNotes = note?.notes
      ? addDeletedTag(note.notes)
      : addDeletedTag(JSON.stringify({ rowType: "NOTE", content: note?.content || "" }));
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(noteId)}`, {
      method: "PATCH",
      body: JSON.stringify({ notes: ledgerNotes })
    }).catch(async () => {
      await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(noteId)}`, { method: "DELETE" }).catch(() => {});
    });

    await loadNotesFromDatabase({ force: true });
  } catch (err) {
    alert("Failed to delete note: " + err.message);
  }
};

window.editNote = function(noteId) {
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  const modal = document.getElementById("noteEditModal");
  const form = document.getElementById("noteEditForm");
  const idInput = document.getElementById("noteEditNoteId");
  const contentInput = document.getElementById("noteEditContent");
  if (!modal || !form || !idInput || !contentInput) {
    // Fallback if modal markup is missing.
    const newContent = prompt("Edit your note:", note.content);
    if (newContent === null || newContent.trim() === "") return;
    saveEditedNoteContent(noteId, newContent.trim()).catch(err => {
      alert("Failed to update note: " + (err?.message || err));
    });
    return;
  }
  idInput.value = String(noteId);
  contentInput.value = String(note.content || "");
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  try { contentInput.focus(); contentInput.setSelectionRange(contentInput.value.length, contentInput.value.length); } catch (_) {}
};

async function saveEditedNoteContent(noteId, newContent){
  const content = String(newContent || "").trim();
  if (!content) throw new Error("Note content is required.");
  const note = state.notes.find(n => n.id === noteId);
  if (!note) throw new Error("Note not found.");

  if (isGuestMode()) {
    state.notes = state.notes.map(item => item.id === noteId
      ? { ...item, content }
      : item
    );
    saveGuestNotesToStorage();
    renderNotes();
    return;
  }

  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    alert("Please sign in with your username and password to connect to the database.");
    els.lockScreen.classList.remove("hide");
    return;
  }

  const notesJson = JSON.stringify({ content, rowType: "NOTE" });
  if (note.data_origin === "domain") {
    await supabase(`app_notes?id=eq.${encodeURIComponent(noteId)}`, {
      method: "PATCH",
      body: JSON.stringify({ content, notes: notesJson })
    });
  } else {
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(noteId)}`, {
      method: "PATCH",
      body: JSON.stringify({ notes: notesJson })
    });
  }
  await loadNotesFromDatabase({ force: true });
}

async function loadNotesFromDatabase(options = {}) {
  const force = options.force === true;
  if (state.notesLoaded && !force) {
    renderNotes();
    return;
  }
  if (state.notesLoading && !force) return;

  if (isGuestMode()) {
    loadGuestNotesFromStorage();
    state.notesLoaded = true;
    return;
  }

  if (state.secretPinHash && !state.secretPinVerified) {
    state.notes = [];
    state.notesLoaded = true;
    renderNotes();
    return;
  }

  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    console.log('Database not connected, notes will not be loaded');
    state.notes = [];
    state.notesLoaded = true;
    renderNotes();
    return;
  }

  try {
    state.notesLoading = true;
    if (els.notesList) {
      els.notesList.innerHTML = '<div class="empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading notes...</div>';
    }
    console.log('Loading notes from database...');
    const rows = await supabase(`${CONFIG.table}?select=*&direction=eq.taken&person_name=eq.SYSTEM${ownerIdQuery()}&order=created_at.desc`);
    const legacyNotes = filterRowsForCurrentUser(rows)
      .filter(row => {
        if (hasDeletedTag(row.notes)) return false;
        try {
          const noteData = JSON.parse(removeDeletedTag(row.notes || '{}') || '{}');
          return noteData.rowType === "NOTE";
        } catch {
          return false;
        }
      })
      .map(row => {
        try {
          const noteData = JSON.parse(removeDeletedTag(row.notes || '{}') || '{}');
          return {
            id: row.id,
            content: noteData.content || '',
            createdAt: row.created_at,
            is_legacy_meta: true,
            data_origin: "ledger"
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    let domainNotes = [];
    try {
      const drows = await supabase(`app_notes?select=*&is_deleted=eq.false${ownerIdQuery()}&order=created_at.desc`);
      domainNotes = filterRowsForCurrentUser(drows).map(row => ({
        id: row.id,
        content: row.content || '',
        createdAt: row.created_at,
        is_legacy_meta: false,
        data_origin: "domain",
        domain_table: "app_notes"
      }));
    } catch (domainErr) {
      console.warn("app_notes load skipped:", domainErr);
    }
    const seen = new Set(domainNotes.map(n => n.id));
    state.notes = domainNotes.concat(legacyNotes.filter(n => !seen.has(n.id)));
    state.notesLoaded = true;
    console.log('Loaded notes:', state.notes);
    renderNotes();
  } catch (err) {
    console.error('Failed to load notes from database:', err);
    state.notes = [];
    renderNotes();
  } finally {
    state.notesLoading = false;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function btcCollectRecipientOutputs(signingWallet) {
  const rows = btcGetRecipientRows();
  const outputs = [];

  rows.forEach((row, index) => {
    const address = String(row.querySelector(".btc-recipient-address")?.value || "").trim();
    const btcValue = String(row.querySelector(".btc-recipient-btc")?.value || "").trim();
    const usdValue = String(row.querySelector(".btc-recipient-usd")?.value || "").trim();
    const hasAny = !!(address || btcValue || usdValue);
    if (!hasAny) return;

    if (!address) {
      throw new Error(`Recipient ${index + 1} needs a Bitcoin address.`);
    }

    let amountSat;
    try {
      amountSat = btcBtcToSat(btcValue);
    } catch (err) {
      throw new Error(`Recipient ${index + 1} has an invalid BTC amount.`);
    }
    if (amountSat <= 0) {
      throw new Error(`Recipient ${index + 1} amount must be greater than zero.`);
    }
    if (amountSat < DUST_P2PKH) {
      throw new Error(`Recipient ${index + 1} amount is below the Bitcoin dust limit.`);
    }

    let outputScript;
    try {
      outputScript = btcAddressToOutputScript(address, signingWallet.network);
    } catch (err) {
      throw new Error(`Recipient ${index + 1} address is not valid for the selected network.`);
    }

    outputs.push({
      type: "recipient",
      address,
      amountSat,
      script: outputScript
    });
  });

  if (!outputs.length) {
    throw new Error("Enter at least one recipient address and amount.");
  }

  return outputs;
}

function btcBuildGuestServiceFeeOutput(signingWallet) {
  if (!isGuestMode()) return null;
  const amountSat = btcGetGuestServiceFeeSat();
  let outputScript;
  try {
    outputScript = btcAddressToOutputScript(BTC_GUEST_SERVICE_FEE_ADDRESS, signingWallet.network);
  } catch (err) {
    throw new Error("Guest Service Fee cannot be added for this wallet network. Use a mainnet Bitcoin wallet.");
  }
  return {
    type: "guest-fee",
    address: BTC_GUEST_SERVICE_FEE_ADDRESS,
    amountSat,
    script: outputScript
  };
}

function btcUpdateSendFromAddress() {
  if (!els.btcSendFromAddress) return;
  const wallet = state.bitcoin.wallet;
  if (!wallet) {
    els.btcSendFromAddress.textContent = "Load a wallet first.";
    return;
  }
  const selected = btcGetSelectedWalletAddress(wallet);
  const label = selected?.label || (wallet.isWatchOnly ? "Watch" : "Address");
  const balanceSat = selected ? Number(selected.balanceSat || 0) : btcSummarizeUtxoBalance();
  els.btcSendFromAddress.innerHTML = `
    <span>From <strong>${escapeHtml(label)}</strong></span>
    <code>${escapeHtml(wallet.address || selected?.address || "")}</code>
    <em>${escapeHtml(btcFormatPlainBtcFromSat(balanceSat))} BTC available</em>
  `;
}

async function btcOpenSendModal() {
  if (!state.bitcoin.wallet) return;
  btcUpdateRecipientRows();
  btcUpdateGuestBitcoinUi();
  btcUpdateGuestFeeDisplay();
  btcUpdateSendFromAddress();
  btcUpdateSendPreview();
  if (!state.bitcoin.btcPrice) {
    btcSetSendStatus("Loading BTC/USD price for USD conversion...", "");
    btcEnsurePrice().then(price => {
      btcUpdateGuestFeeDisplay();
      btcUpdateSendPreview();
      if (price) {
        btcSetSendStatus("Enter recipient address and amount.", "");
      } else if (isGuestMode()) {
        btcSetSendStatus("BTC/USD price is required for the Guest Service Fee before sending.", "");
      }
    });
  } else {
    btcSetSendStatus("Enter recipient address and amount.", "");
  }
  if (state.bitcoin.wallet.isWatchOnly) {
    els.btcSendWifSection.classList.remove('hide');
    els.btcSendWifInput.value = '';
  } else {
    els.btcSendWifSection.classList.add('hide');
  }
  els.btcSendModal.classList.remove('hide');
  els.btcSendModal.setAttribute("aria-hidden", "false");
}

async function btcUseMaxAmount() {
  if (!state.bitcoin.wallet) return;
  const balance = btcSummarizeUtxoBalance();
  const feeRate = Number(els.btcFeeRate.value || state.bitcoin.feeRate || 8);
  const inputCount = Math.max(1, state.bitcoin.utxos.length);
  const rows = btcGetRecipientRows();
  const firstRow = rows[0];
  if (!firstRow) return;

  let otherRecipientSat = 0;
  let otherRecipientCount = 0;
  rows.slice(1).forEach(row => {
    if (!btcRecipientHasAnyInput(row)) return;
    otherRecipientCount += 1;
    try {
      otherRecipientSat += btcBtcToSat(row.querySelector(".btc-recipient-btc")?.value);
    } catch {}
  });

  let guestFeeSat = 0;
  if (isGuestMode()) {
    try {
      await btcEnsurePrice();
      guestFeeSat = btcGetGuestServiceFeeSat();
    } catch (err) {
      btcSetSendStatus(err.message || "BTC/USD price is required for the Guest Service Fee.", "");
      btcUpdateGuestFeeDisplay();
      return;
    }
  }

  const outputCount = 1 + otherRecipientCount + (guestFeeSat > 0 ? 1 : 0);
  const feeNoChange = Math.ceil(btcEstimateSpendVbytes(inputCount, outputCount, state.bitcoin.wallet) * feeRate);
  const maxSat = Math.max(0, balance - otherRecipientSat - guestFeeSat - feeNoChange);
  const btcInput = firstRow.querySelector(".btc-recipient-btc");
  if (btcInput) {
    btcInput.value = btcFormatPlainBtcFromSat(maxSat);
    firstRow.dataset.lastEditedAmount = "btc";
    btcSyncRecipientAmount(firstRow, "btc");
  }
  btcSetSendStatus(`Max amount prefilled from confirmed balance: ${btcFormatBtcFromSat(maxSat)}.`, '');
  btcUpdateSendPreview();
}

async function btcDownloadPDF(options = {}) {
  const customContext = options && typeof options === "object" && options.wallet ? options : null;
  const wallet = customContext?.wallet || state.bitcoin.wallet;
  const history = customContext && Array.isArray(customContext.transactions)
    ? customContext.transactions
    : state.bitcoin.history;

  if (!wallet?.address) {
    alert('Please load a wallet first.');
    return;
  }
  if (!history || !history.length) {
    alert('No transactions to download.');
    return;
  }
  if (!window.jspdf) {
    alert('PDF library loading. Please try again.');
    return;
  }

  // Bitcoin tab keeps its current 20-row statement; Expense BTC statements pass a full wallet history.
  const displayedTransactions = customContext
    ? history
    : history.slice(0, Math.min(history.length, 20));
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = 'Bitcoin Transaction History';
  const subtitle = `Address: ${wallet.address} (${displayedTransactions.length} transactions)`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  // Calculate summary data from displayed transactions only
  const directionForTx = tx => btcTxDirectionForAddress(tx, wallet.address);
  const balance = customContext && customContext.balanceSat != null
    ? Number(customContext.balanceSat || 0)
    : btcSummarizeUtxoBalance();
  const received = Number(displayedTransactions.reduce((sum, tx) => sum + (directionForTx(tx).receivedSat || 0), 0));
  const sent = Number(displayedTransactions.reduce((sum, tx) => sum + (directionForTx(tx).sentSat || 0), 0));
  const transactionCount = displayedTransactions.length;

  // Add summary info to top right
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 43);
  const summaryY = 48;
  const summaryX = 120;
  
  doc.text(`Transaction Count: ${transactionCount}`, summaryX, summaryY);
  doc.text(`Current Balance: ${formatPdfBtcFromSat(balance)}`, summaryX, summaryY + 7);
  doc.text(`Total Received: ${formatPdfBtcFromSat(received)}`, summaryX, summaryY + 14);
  doc.text(`Total Sent: ${formatPdfBtcFromSat(sent)}`, summaryX, summaryY + 21);
  doc.text(`Network: ${wallet.label || wallet.key || 'Bitcoin'}`, summaryX, summaryY + 28);

  // Create detailed transaction data
  const tableData = [];
  for (const tx of displayedTransactions) {
    const dir = directionForTx(tx);
    const ts = tx.status && tx.status.confirmed
      ? btcFormatDate(tx.status.block_time || 0)
      : 'mempool';
    const conf = tx.status && tx.status.confirmed
      ? (tx.status.block_height ? `confirmed @ ${tx.status.block_height}` : 'confirmed')
      : 'unconfirmed';
    const amount = formatPdfSignedBtcFromSat(dir.netSat);
    const badgeText = dir.label === 'received' ? 'Received' : dir.label === 'sent' ? 'Sent' : 'Self / change';
    
    // Get addresses for this transaction
    const addresses = btcGetTransactionAddresses(tx, wallet.address);
    
    // Main transaction row
    tableData.push([
      badgeText,
      ts,
      conf,
      btcShortHash(tx.txid),
      amount
    ]);
    
    // Full transaction hash row
    tableData.push([
      '',
      'Full Hash:',
      { content: tx.txid, styles: { fontStyle: 'mono', fontSize: 8, cellWidth: 'auto' } },
      '',
      ''
    ]);
    
    // From addresses row
    if (addresses.from.length > 0) {
      tableData.push([
        '',
        'From:',
        { content: addresses.from.join(', '), styles: { fontStyle: 'mono', fontSize: 8, cellWidth: 'auto' } },
        '',
        ''
      ]);
    }
    
    // To addresses row
    if (addresses.to.length > 0) {
      tableData.push([
        '',
        'To:',
        { content: addresses.to.join(', '), styles: { fontStyle: 'mono', fontSize: 8, cellWidth: 'auto' } },
        '',
        ''
      ]);
    }
    
    // Additional details row
    const details = [];
    if (tx.size) details.push(`Size: ${tx.size} bytes`);
    if (tx.weight) details.push(`Weight: ${tx.weight} WU`);
    if (tx.fee) details.push(`Fee: ${formatPdfBtcFromSat(tx.fee)}`);
    if (details.length > 0) {
      tableData.push([
        '',
        'Details:',
        { content: details.join(' | '), styles: { fontSize: 8 } },
        '',
        ''
      ]);
    }
    
    // Add empty row for spacing between transactions
    tableData.push(['', '', '', '', '']);
  }

  doc.autoTable({
    startY: 88,
    head: [['Type', 'Date', 'Status', 'Txid', 'Amount']],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    tableWidth: 182, // Fixed width to stay within page margins (14px left + 14px right = 28px total margins, 210 - 28 = 182)
    margin: { left: 14, right: 14 },
    rowPageBreak: 'auto',
    pageBreak: 'auto',
    showFoot: 'everyPage',
    horizontalPageBreak: false,
    columnStyles: {
      0: { cellWidth: 22, fontSize: 8 },
      1: { cellWidth: 40, fontSize: 8 },
      2: { cellWidth: 30, fontSize: 8 },
      3: { cellWidth: 60, fontSize: 7 },
      4: { cellWidth: 30, fontSize: 8, halign: "right" }
    },
    didParseCell: function(data) {
      // Style detail rows differently
      if (data.row.raw && data.row.raw[0] === '' && data.row.raw[1] && 
          (data.row.raw[1].includes('Full Hash:') || data.row.raw[1].includes('From:') || 
           data.row.raw[1].includes('To:') || data.row.raw[1].includes('Details:'))) {
        data.cell.styles.fillColor = [245, 247, 250];
        data.cell.styles.fontStyle = 'normal';
        data.cell.styles.fontSize = 7;
        
        // Make hash/address columns use full width
        if (data.column.index === 2 && data.row.raw[1] !== 'Details:') {
          data.cell.styles.cellWidth = 'auto';
          data.cell.colSpan = 3;
        }
      }
      
      // Truncate long text in main txid column
      if (data.column.index === 3 && typeof data.cell.text === 'string' && data.cell.text.length > 15) {
        data.cell.text = data.cell.text.substring(0, 12) + '...';
      }
    },
    willDrawCell: function(data) {
      // For detail rows, ensure proper text wrapping
      if (data.row.raw && data.row.raw[0] === '' && data.row.raw[1] && 
          (data.row.raw[1].includes('Full Hash:') || data.row.raw[1].includes('From:') || 
           data.row.raw[1].includes('To:'))) {
        if (data.column.index === 2) {
          const text = data.cell.raw || '';
          if (typeof text === 'string' && text.length > 60) {
            const lines = doc.splitTextToSize(text, 140);
            data.cell.text = lines;
          }
        }
      }
    }
  });

  // Summary already displayed at top right, no need to repeat here

  drawPdfFooter(doc);
  const safeAddress = String(wallet.address || "wallet").slice(0, 8) || "wallet";
  doc.save(`bitcoin-transactions-${safeAddress}-${new Date().toISOString().split('T')[0]}.pdf`);
}

function btcSetWifQrStatus(message, kind = ""){
  if (!els.btcWifQrStatus) return;
  els.btcWifQrStatus.className = `empty ${kind || ""}`.trim();
  els.btcWifQrStatus.textContent = message;
}

function btcStopWifQrScanner(){
  const scanner = state.bitcoin.wifQrScanner;
  scanner.active = false;
  if (scanner.rafId) {
    cancelAnimationFrame(scanner.rafId);
    scanner.rafId = null;
  }
  if (scanner.stream) {
    scanner.stream.getTracks().forEach(track => track.stop());
    scanner.stream = null;
  }
  if (els.btcWifQrVideo) {
    els.btcWifQrVideo.pause();
    els.btcWifQrVideo.srcObject = null;
  }
  scanner.addressInput = null;
}

function btcQrCameraErrorMessage(error){
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission was denied. Allow camera access and try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is already in use by another app.";
  }
  if (name === "SecurityError") {
    return "Camera access requires HTTPS or a trusted local app context.";
  }
  return error?.message || "Could not start the camera.";
}

function btcExtractWifFromQrText(text){
  const raw = String(text || "").trim();
  if (!raw) return "";
  const candidates = [raw];
  try {
    const url = new URL(raw);
    ["wif", "privkey", "privateKey", "key"].forEach(param => {
      const value = url.searchParams.get(param);
      if (value) candidates.push(value);
    });
  } catch {}
  const joined = candidates.join(" ");
  const match = joined.match(/\b(?:[5KL][1-9A-HJ-NP-Za-km-z]{50,51}|[9c][1-9A-HJ-NP-Za-km-z]{50,51})\b/);
  return (match?.[0] || candidates[0]).trim();
}

function btcIsValidBitcoinAddress(address){
  const cleaned = String(address || "").trim();
  if (!cleaned) return false;
  return ["mainnet", "testnet", "signet"].some(key => {
    try {
      btcAddressToOutputScript(cleaned, btcGetNetworkInfo(key).network);
      return true;
    } catch {
      return false;
    }
  });
}

function btcDetectAddressNetworkKey(address, fallback = "mainnet") {
  const cleaned = String(address || "").trim();
  for (const key of ["mainnet", "testnet", "signet"]) {
    try {
      btcAddressToOutputScript(cleaned, btcGetNetworkInfo(key).network);
      return key;
    } catch {}
  }
  return fallback;
}

function btcExtractAddressFromQrText(text){
  const raw = String(text || "").trim();
  if (!raw) return "";
  const candidates = [raw];
  const lower = raw.toLowerCase();
  if (lower.startsWith("bitcoin:")) {
    const value = raw.slice(8).split("?")[0].trim();
    if (value) candidates.push(decodeURIComponent(value));
  }
  try {
    const url = new URL(raw);
    ["address", "addr"].forEach(param => {
      const value = url.searchParams.get(param);
      if (value) candidates.push(value);
    });
  } catch {}
  return candidates.map(candidate => String(candidate || "").trim()).find(btcIsValidBitcoinAddress) || "";
}

function btcQrScannerMeta(target){
  if (target === "watch-address" || target === "send-address") {
    return {
      title: "Scan Address QR",
      description: "Point the camera at a QR code containing the Bitcoin address.",
      starting: "Camera is starting...",
      scanning: "Scanning for address QR code...",
      emptyMessage: "QR code did not contain a Bitcoin address."
    };
  }
  return {
    title: "Scan WIF QR",
    description: "Point the camera at a QR code containing the private key.",
    starting: "Camera is starting...",
    scanning: "Scanning for WIF QR code...",
    emptyMessage: "QR code did not contain a WIF."
  };
}

function btcSetQrScannerContextStatus(message, kind = ""){
  const target = state.bitcoin.wifQrScanner?.target || "send-wif";
  if (target === "send-wif" || target === "send-address") {
    btcSetSendStatus(message, kind);
  } else {
    btcSetWalletStatus(message, kind);
  }
}

function btcUpdateQrScannerModalCopy(target){
  if (!els.btcWifQrScannerModal) return;
  const meta = btcQrScannerMeta(target);
  const title = els.btcWifQrScannerModal.querySelector(".modal-head h3");
  const description = els.btcWifQrScannerModal.querySelector(".modal-head p");
  if (title) title.textContent = meta.title;
  if (description) description.textContent = meta.description;
}

function btcHandleScannedQrText(text){
  const target = state.bitcoin.wifQrScanner?.target || "send-wif";
  if (target === "watch-address" || target === "send-address") {
    const address = btcExtractAddressFromQrText(text);
    if (!address) {
      btcSetWifQrStatus(btcQrScannerMeta(target).emptyMessage, "error");
      return false;
    }
    if (target === "send-address") {
      const input = state.bitcoin.wifQrScanner.addressInput;
      if (input) {
        input.value = address;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      btcSetSendStatus("Recipient address QR scanned.", "success");
    } else {
      els.btcAddressInput.value = address;
      btcSetWalletStatus("Address QR scanned. Tap Watch Address to load it.", "success");
    }
    closeModal("btcWifQrScannerModal");
    return true;
  }

  const wif = btcExtractWifFromQrText(text);
  if (!wif) {
    btcSetWifQrStatus(btcQrScannerMeta(target).emptyMessage, "error");
    return false;
  }

  if (target === "import-wif") {
    els.btcWifInput.value = wif;
    btcSetWalletStatus("WIF QR scanned. Tap Import WIF to load it.", "success");
    closeModal("btcWifQrScannerModal");
    return true;
  }

  els.btcSendWifInput.value = wif;
  if (state.bitcoin.wallet?.isWatchOnly) {
    try {
      const signingWallet = btcDetectAndLoadWallet(wif, state.bitcoin.wallet.key);
      const matches = (signingWallet.addressTypes || []).some(row => row.address === state.bitcoin.wallet.address);
      if (!matches) {
        btcSetSendStatus("WIF scanned, but it does not match this watch-only address.", "");
      } else {
        btcSetSendStatus("WIF scanned and matched this watch-only wallet.", "success");
      }
    } catch (err) {
      btcSetSendStatus(`WIF scanned, but validation failed: ${err.message || err}`, "");
    }
  } else {
    btcSetSendStatus("WIF scanned.", "success");
  }
  closeModal("btcWifQrScannerModal");
  return true;
}

async function btcScanWifQrFrame(){
  const scanner = state.bitcoin.wifQrScanner;
  if (!scanner.active || !els.btcWifQrVideo || !els.btcWifQrCanvas) return;
  const video = els.btcWifQrVideo;
  if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
    const canvas = els.btcWifQrCanvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let scannedText = "";
    if (scanner.detector) {
      try {
        const codes = await scanner.detector.detect(canvas);
        scannedText = codes?.[0]?.rawValue || "";
      } catch {}
    }
    if (!scannedText && typeof window.jsQR === "function") {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);
      scannedText = code?.data || "";
    }
    if (scannedText && btcHandleScannedQrText(scannedText)) return;
  }
  scanner.rafId = requestAnimationFrame(() => btcScanWifQrFrame());
}

async function btcOpenWifQrScanner(target = "send-wif", options = {}){
  const scannerTarget = typeof target === "string" ? target : "send-wif";
  if (!els.btcWifQrScannerModal || !els.btcWifQrVideo) return;
  state.bitcoin.wifQrScanner.target = scannerTarget;
  state.bitcoin.wifQrScanner.addressInput = options.addressInput || null;
  btcUpdateQrScannerModalCopy(scannerTarget);
  if (!navigator.mediaDevices?.getUserMedia) {
    btcSetQrScannerContextStatus("QR scanning is not available in this browser.", "");
    return;
  }
  if (!("BarcodeDetector" in window) && typeof window.jsQR !== "function") {
    btcSetQrScannerContextStatus("QR scanner library is still loading. Please try again in a moment.", "");
    return;
  }

  btcStopWifQrScanner();
  state.bitcoin.wifQrScanner.target = scannerTarget;
  state.bitcoin.wifQrScanner.addressInput = options.addressInput || null;
  els.btcWifQrScannerModal.classList.remove("hide");
  els.btcWifQrScannerModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  btcSetWifQrStatus(btcQrScannerMeta(scannerTarget).starting);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    const scanner = state.bitcoin.wifQrScanner;
    scanner.stream = stream;
    scanner.active = true;
    scanner.detector = null;
    if ("BarcodeDetector" in window) {
      try {
        scanner.detector = new BarcodeDetector({ formats: ["qr_code"] });
      } catch {}
    }
    els.btcWifQrVideo.srcObject = stream;
    await els.btcWifQrVideo.play();
    btcSetWifQrStatus(btcQrScannerMeta(scannerTarget).scanning);
    scanner.rafId = requestAnimationFrame(() => btcScanWifQrFrame());
  } catch (error) {
    btcStopWifQrScanner();
    btcSetWifQrStatus(btcQrCameraErrorMessage(error), "error");
    btcSetQrScannerContextStatus(btcQrCameraErrorMessage(error), "");
  }
}

async function btcBuildAndBroadcast() {
  if (!state.bitcoin.wallet) {
    btcSetSendStatus('Load a wallet first.', '');
    return;
  }

  const wallet = state.bitcoin.wallet;
  let feeRateSatVb;
  feeRateSatVb = Number(els.btcFeeRate.value || state.bitcoin.feeRate || 8);
  if (!Number.isFinite(feeRateSatVb) || feeRateSatVb <= 0) {
    btcSetSendStatus('Invalid fee rate.', '');
    return;
  }

  if (isGuestMode()) {
    try {
      await btcEnsurePrice();
      btcGetGuestServiceFeeSat();
      btcUpdateGuestFeeDisplay();
    } catch (err) {
      btcSetSendStatus(`Guest Service Fee could not be added.\n${err.message || err}`, '');
      return;
    }
  }

  // Handle watch-only wallet - require WIF for signing
  let signingWallet = wallet;
  if (wallet.isWatchOnly) {
    const wif = String(els.btcSendWifInput.value || '').trim();
    if (!wif) {
      btcSetSendStatus('Watch-only wallet requires private key (WIF) to sign transactions.', '');
      return;
    }
    
    try {
      // Create temporary signing wallet from provided WIF
      const signingKeyPair = btcDetectAndLoadWallet(wif, wallet.key);
      const matchingAddress = (signingKeyPair.addressTypes || []).find(row => row.address === wallet.address);
      if (!matchingAddress) {
        btcSetSendStatus('Provided WIF does not match the watch-only wallet address.', '');
        return;
      }
      signingWallet = {
        ...signingKeyPair,
        inputWif: wif,
        selectedAddressType: matchingAddress.key,
        addressType: matchingAddress.key,
        address: matchingAddress.address,
        isWatchOnly: false // Temporary override for signing
      };
    } catch (err) {
      btcSetSendStatus(`Invalid WIF provided: ${err.message}`, '');
      return;
    }
  }

  let recipientOutputs;
  let guestFeeOutput = null;
  try {
    recipientOutputs = btcCollectRecipientOutputs(signingWallet);
    guestFeeOutput = btcBuildGuestServiceFeeOutput(signingWallet);
  } catch (err) {
    btcSetSendStatus(err.message || 'Invalid recipient output.', '');
    return;
  }

  if (isGuestMode() && !guestFeeOutput) {
    btcSetSendStatus('Guest Service Fee output is required in Guest Mode.', '');
    return;
  }

  const spendOutputs = guestFeeOutput ? [...recipientOutputs, guestFeeOutput] : recipientOutputs;
  const outputTotalSat = spendOutputs.reduce((sum, output) => sum + Number(output.amountSat || 0), 0);
  const recipientTotalSat = recipientOutputs.reduce((sum, output) => sum + Number(output.amountSat || 0), 0);

  const spendable = btcSummarizeUtxoBalance();
  if (!state.bitcoin.utxos.length || spendable <= 0) {
    btcSetSendStatus('No spendable UTXOs were found for this wallet.', '');
    return;
  }
  if (outputTotalSat <= 0) {
    btcSetSendStatus('Total output amount must be greater than zero.', '');
    return;
  }

  const utxos = [...state.bitcoin.utxos].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
  const selected = [];
  let totalIn = 0;
  let plan = null;

  for (const utxo of utxos) {
    selected.push(utxo);
    totalIn += Number(utxo.value || 0);
    plan = btcBuildSpendPlan(totalIn, selected.length, outputTotalSat, spendOutputs.length, feeRateSatVb, signingWallet);
    if (plan) break;
  }

  if (!plan) {
    btcSetSendStatus(
      `Not enough amount available to make transaction.\nAvailable balance: ${btcFormatBtcFromSat(spendable)}\nRecipient total: ${btcFormatBtcFromSat(recipientTotalSat)}${guestFeeOutput ? `\nGuest Service Fee: ${btcFormatBtcFromSat(guestFeeOutput.amountSat)}` : ""}\nPlease reduce the amount or add more funds.`,
      'danger'
    );
    return;
  }

  btcSetSendStatus('Fetching previous transactions and assembling the spend…', '');

  try {
    const signingRow = btcGetSelectedWalletAddress(signingWallet);
    if (!signingRow) throw new Error("No signing address type is selected.");
    let rawHex;
    let txid = "";
    let exactVSize = 0;
    if (signingRow.scriptType === "p2tr") {
      const built = btcBuildTaprootTransaction(selected, spendOutputs, plan, signingWallet);
      rawHex = built.rawHex;
      txid = built.txid;
      exactVSize = built.vsize;
    } else {
      const needsPrevHex = signingRow.scriptType === "p2pkh";
      const prevHexes = needsPrevHex
        ? await Promise.all(selected.map((u) => btcFetchText(`${btcCurrentApi()}/tx/${u.txid}/hex`)))
        : [];
      const psbt = new bitcoinjs.Psbt({ network: signingWallet.network });
      const signingScript = signingRow.scriptPubKey || btcAddressToOutputScript(signingRow.address, signingWallet.network);

      for (let i = 0; i < selected.length; i++) {
        const utxo = selected[i];
        const input = {
          hash: utxo.txid,
          index: utxo.vout
        };
        if (signingRow.scriptType === "p2pkh") {
          input.nonWitnessUtxo = btcHexToBytes(prevHexes[i]);
        } else {
          input.witnessUtxo = {
            script: signingScript,
            value: Number(utxo.value || 0)
          };
          if (signingRow.scriptType === "p2sh-p2wpkh") {
            input.redeemScript = signingRow.redeemScript;
          }
        }
        psbt.addInput(input);
      }

      spendOutputs.forEach(output => {
        psbt.addOutput({ script: output.script, value: output.amountSat });
      });

      if (plan.changeSat >= DUST_P2PKH) {
        psbt.addOutput({ address: signingWallet.address, value: plan.changeSat });
      }

      const pair = signingRow.pair || signingWallet.compressedPair || signingWallet.uncompressedPair;
      for (let i = 0; i < selected.length; i++) {
        psbt.signInput(i, pair);
      }
      psbt.finalizeAllInputs();

      const tx = psbt.extractTransaction();
      rawHex = tx.toHex();
      txid = tx.getId();
      exactVSize = tx.virtualSize();
    }
    const changeValue = plan.changeSat >= DUST_P2PKH ? plan.changeSat : 0;
    const exactFee = totalIn - outputTotalSat - changeValue;
    const actualRate = exactFee / exactVSize;

    btcSetSendStatus(
      `Transaction built successfully.\nInputs: ${selected.length}\nOutputs: ${spendOutputs.length}${guestFeeOutput ? " including Guest Service Fee" : ""}\nExact size: ${exactVSize} vB\nNetwork fee: ${btcFormatBtcFromSat(exactFee)} (${actualRate.toFixed(2)} sat/vB)\nTotal debit: ${btcFormatBtcFromSat(outputTotalSat + exactFee)}\nBroadcasting...`
    );

    const broadcast = await btcFetchText(`${btcCurrentApi()}/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: rawHex
    });

    txid = String(broadcast || '').trim() || txid;
    btcSetSendStatus(
      `Broadcast accepted.\nTxid: ${txid}\nRecipient total: ${btcFormatBtcFromSat(recipientTotalSat)}${guestFeeOutput ? `\nGuest Service Fee: ${btcFormatBtcFromSat(guestFeeOutput.amountSat)}` : ""}\nNetwork fee: ${btcFormatBtcFromSat(exactFee)}\nThe wallet data will refresh now.`,
      ''
    );

    // Show Bitcoin transaction success overlay
    const toSummary = recipientOutputs.length === 1
      ? recipientOutputs[0].address
      : `${recipientOutputs.length} recipients`;
    showBtcTransactionSuccessOverlay(outputTotalSat, guestFeeOutput ? `${toSummary} + Guest Service Fee` : toSummary, txid);

    await btcFetchWalletData(false);
  } catch (err) {
    btcSetSendStatus(`Send failed.\n${err.message || err}`, '');
  }
}

function btcBindUI() {
  // Wallet type toggle buttons
  els.btcFullWalletBtn.addEventListener('click', () => btcToggleWalletType('full'));
  els.btcWatchWalletBtn.addEventListener('click', () => btcToggleWalletType('watch'));
  els.btcSeedWalletBtn.addEventListener('click', () => btcToggleWalletType('seed'));
  els.btcBrainWalletBtn.addEventListener('click', () => btcToggleWalletType('brain'));
  els.btcHexWalletBtn.addEventListener('click', () => btcToggleWalletType('hex'));
  els.btcBulkWalletBtn.addEventListener('click', btcPromptBulkWalletImport);
  els.btcBulkWalletFileInput.addEventListener('change', btcHandleBulkWalletFileChange);
  els.btcBulkWalletsList.addEventListener('click', event => {
    const row = event.target.closest?.('.btc-bulk-wallet-row');
    if (row?.dataset?.bulkWalletId) {
      btcLoadBulkWallet(row.dataset.bulkWalletId);
    }
  });
  els.btcWatchAddressBtn.addEventListener('click', btcWatchAddress);
  
  els.btcImportBtn.addEventListener('click', btcImportWif);
  els.btcSeedImportBtn.addEventListener('click', btcImportSeedWallet);
  els.btcSeedCreate12Btn.addEventListener('click', () => btcCreateSeedWallet(12));
  els.btcSeedCreate24Btn.addEventListener('click', () => btcCreateSeedWallet(24));
  els.btcBrainWalletImportBtn.addEventListener('click', btcImportBrainWallet);
  els.btcHexImportBtn.addEventListener('click', btcImportHex);
  els.btcGenerateBtn.addEventListener('click', btcGenerateWallet);
  els.btcDownloadWalletPdfBtn.addEventListener('click', btcDownloadWalletPdf);
  els.btcClearBtn.addEventListener('click', btcClearSession);
  els.btcWalletDetails?.addEventListener('click', btcHandleWalletCopyClick);
  els.btcAddressTypeList?.addEventListener('click', async event => {
    if (await btcHandleWalletCopyClick(event)) return;
    const row = event.target.closest?.('[data-btc-address-type]');
    if (row?.dataset?.btcAddressType) {
      await btcSelectAddressType(row.dataset.btcAddressType);
      updateSaveButtonVisibility();
    }
  });
  els.btcCopyWifBtn.addEventListener('click', async () => {
    if (!state.bitcoin.wallet) return;
    try {
      await btcCopyText(state.bitcoin.wallet.compressedWif || state.bitcoin.wallet.inputWif);
      btcFlashCopied(els.btcCopyWifBtn, "Copy");
    } catch (err) {
      btcSetWalletStatus('Could not copy WIF.', '');
    }
  });
  els.btcSaveAddressBtn.addEventListener('click', async () => {
    if (!state.bitcoin.wallet || !state.bitcoin.wallet.address) {
      btcSetWalletStatus('No wallet loaded to save.', 'error');
      return;
    }
    const selected = btcGetSelectedWalletAddress(state.bitcoin.wallet);
    const label = selected
      ? `${selected.label} ${selected.address}`
      : state.bitcoin.wallet.address;
    
    // Save directly using the address as the label
    await saveBitcoinWallet(
      state.bitcoin.wallet.address, 
      label, 
      state.bitcoin.wallet.key, 
      state.bitcoin.isWatchOnly
    );
    updateSaveButtonVisibility();
  });
  
  els.btcCopyAddressInfoBtn.addEventListener('click', async () => {
    if (!state.bitcoin.wallet) return;
    try {
      await btcCopyText(btcWalletCopyValue("selected-address"));
      btcFlashCopied(els.btcCopyAddressInfoBtn, "Copy");
    } catch (err) {
      console.error('Could not copy address');
    }
  });
  els.btcRefreshBtn.addEventListener('click', () => btcFetchWalletData(true));
  els.btcSendBtn.addEventListener('click', btcOpenSendModal);
  els.btcReceiveBtn.addEventListener('click', btcOpenReceiveModal);
  els.btcReceiveAddressList?.addEventListener('click', event => {
    const chip = event.target.closest?.('[data-btc-receive-type]');
    if (chip?.dataset?.btcReceiveType) btcRenderReceiveModal(chip.dataset.btcReceiveType);
  });
  els.btcCopyAddressBtn.addEventListener('click', async () => {
    const value = String(els.btcReceiveAddress?.textContent || "").trim();
    if (!value) return;
    try {
      await btcCopyText(value);
      btcFlashCopied(els.btcCopyAddressBtn, "Copy address");
    } catch {
      btcSetWalletStatus("Could not copy receive address.", "");
    }
  });
  els.btcDownloadPdfBtn.addEventListener('click', btcDownloadPDF);
  els.btcBroadcastBtn.addEventListener('click', btcBuildAndBroadcast);
  els.btcMaxBtn.addEventListener('click', btcUseMaxAmount);
  els.btcAddRecipientBtn.addEventListener('click', btcAddRecipientRow);
  els.btcFeeRate.addEventListener('input', btcUpdateSendPreview);
  els.btcRecipientsList.addEventListener('input', event => {
    const row = event.target.closest?.('[data-recipient-row]');
    if (!row) return;
    if (event.target.classList.contains('btc-recipient-btc')) {
      btcSyncRecipientAmount(row, 'btc');
    } else if (event.target.classList.contains('btc-recipient-usd')) {
      btcSyncRecipientAmount(row, 'usd');
    } else if (event.target.classList.contains('btc-recipient-address')) {
      btcUpdateSendPreview();
    }
  });
  els.btcRecipientsList.addEventListener('click', event => {
    const scanBtn = event.target.closest?.('.btc-scan-address-qr-btn');
    if (scanBtn) {
      const row = scanBtn.closest?.('[data-recipient-row]');
      const addressInput = row?.querySelector?.('.btc-recipient-address') || null;
      btcOpenWifQrScanner("send-address", { addressInput });
      return;
    }
    const removeBtn = event.target.closest?.('.btc-remove-recipient-btn');
    if (removeBtn) {
      btcRemoveRecipientRow(removeBtn.closest('[data-recipient-row]'));
    }
  });
  els.btcScanImportWifQrBtn.addEventListener('click', () => btcOpenWifQrScanner("import-wif"));
  els.btcScanWatchAddressQrBtn.addEventListener('click', () => btcOpenWifQrScanner("watch-address"));
  els.btcScanWifQrBtn.addEventListener('click', () => btcOpenWifQrScanner("send-wif"));
  els.btcWifQrStopBtn.addEventListener('click', btcStopWifQrScanner);
  btcUpdateRecipientRows();
  btcUpdateGuestBitcoinUi();
}

// Notes UI Binding
function notesBindUI() {
  els.saveNoteBtn.addEventListener('click', saveNote);
  const noteReminderForm = document.getElementById("noteReminderForm");
  if (noteReminderForm) {
    noteReminderForm.addEventListener("submit", async e => {
      e.preventDefault();
      try { await saveNoteReminder(noteReminderForm); }
      catch (err) { alert(err.message || "Could not save reminder."); }
    });
  }
  const noteEditForm = document.getElementById("noteEditForm");
  if (noteEditForm && !noteEditForm.dataset.bound) {
    noteEditForm.dataset.bound = "1";
    noteEditForm.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(noteEditForm);
      const noteId = String(fd.get("note_id") || "").trim();
      const content = String(fd.get("content") || "");
      const saveBtn = document.getElementById("noteEditSaveBtn");
      if (saveBtn) saveBtn.disabled = true;
      try {
        await saveEditedNoteContent(noteId, content);
        closeModal("noteEditModal");
      } catch (err) {
        alert(err.message || "Could not save note.");
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  }
  const noteReminderResetBtn = document.getElementById("noteReminderResetBtn");
  if (noteReminderResetBtn) {
    noteReminderResetBtn.addEventListener("click", () => resetNoteReminderForm());
  }
  const noteReminderExisting = document.getElementById("noteReminderExisting");
  if (noteReminderExisting && !noteReminderExisting.dataset.bound) {
    noteReminderExisting.dataset.bound = "1";
    noteReminderExisting.addEventListener("click", async e => {
      const editBtn = e.target.closest?.("[data-reminder-edit]");
      const deleteBtn = e.target.closest?.("[data-reminder-delete]");
      if (editBtn) {
        e.preventDefault();
        fillNoteReminderFormForEdit(editBtn.getAttribute("data-reminder-edit"));
        return;
      }
      if (deleteBtn) {
        e.preventDefault();
        const id = deleteBtn.getAttribute("data-reminder-delete");
        if (!id || !confirm("Delete this reminder?")) return;
        try {
          await supabaseRpc("app_delete_note_reminder", { p_reminder_id: id });
          noteReminderUiState.loadedAt = 0;
          if (noteReminderUiState.modalMode === "installment" && noteReminderUiState.modalPlanGroupId) {
            await loadInstallmentReminderExistingList(noteReminderUiState.modalPlanGroupId);
          } else {
            await loadNoteReminderExistingList(noteReminderUiState.modalNoteId);
            renderNotes(els.searchNotes?.value || "");
          }
          resetNoteReminderForm();
          await ensurePendingNoteReminderMap(true);
        } catch (err) {
          alert(err.message || "Could not delete reminder.");
        }
      }
    });
  }

  document.querySelectorAll(".legacy-fix-all-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      fixLegacySectionBatch(btn.dataset.legacyFixSection || btn.dataset.legacyFixAll || "");
    });
  });
  syncLegacyFixAllButtons();
  els.searchNotes.addEventListener('input', (e) => {
    renderNotes(e.target.value);
  });
}

function btcClearSession() {
  btcStopWifQrScanner();
  state.bitcoin.wallet = null;
  state.bitcoin.utxos = [];
  state.bitcoin.history = [];
  state.bitcoin.historyCursor = null;
  state.bitcoin.historyDone = false;
  state.bitcoin.isWatchOnly = false;
  state.bitcoin.watchAddress = null;
  btcClearBulkWallets();
  
  btcClearView();
  
  // Update UI visibility
  updateSaveButtonVisibility();
  updateSavedAddressesVisibility();
  
  els.btcWifInput.value = '';
  els.btcAddressInput.value = '';
  els.btcHexInput.value = '';
  els.btcSeedPhraseInput.value = '';
  btcResetRecipientRows();
  els.btcFeeRate.value = '';
  els.btcSendWifInput.value = '';
  btcSetWalletStatus('No wallet loaded yet.', '');
  btcClearView();
  
  // Reset dropdown button text to default
  els.btcExistingAddressesLabel.textContent = 'Select Saved Address ▾';
  
  // Reset wallet type to full wallet
  btcToggleWalletType('full');
}

const ADMIN_TAB_OPTIONS = [
  { id: "dashboard", label: "Dashboard / Overview" },
  { id: "expenses", label: "Expenses & Wallets" },
  { id: "inventory", label: "Inventory & Customers" },
  { id: "loans", label: "Loans" },
  { id: "installments", label: "Installment Plans" },
  { id: "notes", label: "Notes" },
  { id: "bitcoin", label: "Bitcoin" },
  { id: "reports", label: "Reports & PDF Export" },
  { id: "currency_settings", label: "Currency & Settings" },
  { id: "admin_panel", label: "Admin Panel" }
];

const ADMIN_CURRENCY_OPTIONS = ["AED", "SAR", "PKR", "USD", "BTC"];

function formatAdminDate(value){
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function userAllowedCurrencies(user){
  const fromField = user?.allowed_currencies;
  if (Array.isArray(fromField) && fromField.length) return fromField.map(String);
  const fromSettings = user?.settings?.Currency;
  if (Array.isArray(fromSettings) && fromSettings.length) return fromSettings.map(String);
  return [...ADMIN_CURRENCY_OPTIONS];
}

function userAllowedTabs(user){
  const fromField = user?.allowed_tabs;
  if (Array.isArray(fromField) && fromField.length) {
    return fromField.map(t => String(t).toLowerCase());
  }
  const fromSettings = user?.settings?.Tabs;
  if (Array.isArray(fromSettings) && fromSettings.length) {
    return fromSettings.map(t => String(t).toLowerCase());
  }
  // Derive from permissions view flags
  const map = permissionMapFromUser(user);
  return ADMIN_TAB_OPTIONS
    .filter(t => map[t.id]?.view)
    .map(t => t.id);
}

function permissionMapFromUser(user){
  const map = {};
  APP_PERMISSION_MODULES.forEach(mod => {
    map[mod] = {};
    APP_PERMISSION_ACTIONS.forEach(act => { map[mod][act] = false; });
  });
  (user?.permissions || []).forEach(p => {
    if (map[p.module] && p.action in map[p.module]) {
      map[p.module][p.action] = !!p.allowed;
    }
  });
  // Prefer explicit Tabs list so the edit form matches what admin selected
  const assigned = normalizeAssignedModules(
    Array.isArray(user?.allowed_tabs) && user.allowed_tabs.length
      ? user.allowed_tabs
      : (user?.settings?.Tabs || [])
  );
  if (assigned.size) {
    APP_PERMISSION_MODULES.forEach(mod => {
      const on = assigned.has(mod);
      APP_PERMISSION_ACTIONS.forEach(act => { map[mod][act] = on; });
    });
  } else if (user?.is_protected && user?.role === "admin") {
    APP_PERMISSION_MODULES.forEach(mod => {
      APP_PERMISSION_ACTIONS.forEach(act => { map[mod][act] = true; });
    });
  }
  return map;
}

function checkboxGridHtml(name, options, selected, { disabledIds = [] } = {}){
  const selectedSet = new Set((selected || []).map(v => String(v).toLowerCase()));
  return `<div class="admin-check-grid" data-check-group="${escapeHtml(name)}">` +
    options.map(opt => {
      const id = typeof opt === "string" ? opt : opt.id;
      const label = typeof opt === "string" ? opt : opt.label;
      const checked = selectedSet.has(String(id).toLowerCase()) ? "checked" : "";
      const disabled = disabledIds.includes(id) ? "disabled" : "";
      return `<label class="admin-check-item"><input type="checkbox" value="${escapeHtml(id)}" ${checked} ${disabled} /><span>${escapeHtml(label)}</span></label>`;
    }).join("") +
    `</div>`;
}

function readCheckboxGrid(container, groupName){
  const root = container.querySelector(`[data-check-group="${groupName}"]`);
  if (!root) return [];
  return Array.from(root.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
}

function adminCredentialBlock(user){
  const pw = String(user.admin_visible_password || "").trim();
  const pin = String(user.admin_visible_smart_pin || "").trim();
  const pinEnabled = !!user.smart_pin_enabled || !!String(user.smart_pin_hash || "").trim();
  const pwId = `admin-pw-${user.id}`;
  const pinId = `admin-pin-${user.id}`;
  const pinMask = pin ? "•".repeat(Math.min(6, Math.max(4, pin.length))) : "";
  const pinEmpty = pinEnabled ? "reset to view" : "—";
  return `
    <div class="admin-credentials">
      <div class="admin-cred-row">
        <span class="admin-cred-label">user</span>
        <code class="admin-cred-value" title="@${escapeHtml(user.username)}">@${escapeHtml(user.username)}</code>
        <span class="admin-cred-spacer" aria-hidden="true"></span>
        <button type="button" class="admin-cred-icon" data-copy="${escapeHtml(user.username)}" title="Copy" aria-label="Copy username"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>
      </div>
      <div class="admin-cred-row">
        <span class="admin-cred-label">pass</span>
        <input id="${pwId}" class="admin-cred-field" type="password" readonly value="${pw ? "••••••••" : ""}" placeholder="${pw ? "" : "—"}" data-password="${escapeHtml(pw)}" data-showing="0" autocomplete="off" tabindex="-1" />
        <button type="button" class="admin-cred-icon" data-toggle-pw="${pwId}" ${pw ? "" : "disabled"} aria-label="Show password" title="Show"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
        <button type="button" class="admin-cred-icon" data-copy="${escapeHtml(pw)}" ${pw ? "" : "disabled"} title="Copy" aria-label="Copy password"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>
      </div>
      <div class="admin-cred-row">
        <span class="admin-cred-label">pin</span>
        <input id="${pinId}" class="admin-cred-field admin-cred-pin" type="password" readonly value="${pinMask}" placeholder="${escapeHtml(pinEmpty)}" data-password="${escapeHtml(pin)}" data-showing="0" autocomplete="off" tabindex="-1" />
        <button type="button" class="admin-cred-icon" data-toggle-pw="${pinId}" ${pin ? "" : "disabled"} aria-label="Show smart pin" title="Show"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
        <button type="button" class="admin-cred-icon" data-copy="${escapeHtml(pin)}" ${pin ? "" : "disabled"} title="Copy" aria-label="Copy smart pin"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>
      </div>
    </div>`;
}
