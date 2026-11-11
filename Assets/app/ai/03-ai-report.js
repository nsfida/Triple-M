/* Triplem VIP · Report an AI response (2026-11-06)
 *
 * Every generative AI answer in the product (Triplem AI in the workspace and
 * Aziz / the AI assistant in the live chat) has a "Report" button. The user
 * picks a reason, can add a comment, and the report goes to the Triplem VIP
 * team through the app_report_ai_content RPC (migration 206), which stores it
 * and notifies the administrators. Nothing else is read or changed.
 *
 * 2026-11-11 (Microsoft Store policy 11.16): every AI surface also shows a
 * permanent disclosure line ("AI-generated · can be wrong") with a "Report an
 * issue" link, and a flag button in its header. Those open the same dialog for
 * the latest AI answer, or, before there is one, for a general report that the
 * user describes in their own words. The same RPC and admin review queue are used.
 */
(function () {
  "use strict";

  const REASONS = [
    ["offensive", "Offensive or hateful", "Insults, hate, harassment or discrimination."],
    ["harmful", "Harmful or dangerous", "Encourages violence, self-harm, crime or unsafe actions."],
    ["sexual", "Sexual content", "Sexual or adult content."],
    ["inaccurate", "Inaccurate or misleading", "Wrong figures, invented facts or misleading advice."],
    ["privacy", "Privacy concern", "Shows information that should not be shown."],
    ["other", "Something else", "Describe the problem below."]
  ];
  const SOURCES = new Set(["triplem_ai", "aziz", "live_chat_ai"]);
  const MAX_CONTENT = 8000;
  const MAX_PROMPT = 2000;
  const MAX_DETAILS = 1000;

  const GENERAL_CONTENT = "General report about the AI assistant (no single response selected).";
  const providers = new Map();
  let current = null;
  let lastFocus = null;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function buttonHtml(attrs = "", reported = false) {
    const label = reported ? "Reported" : "Report";
    const title = reported ? "You reported this AI response" : "Report this AI response";
    return `<button type="button" class="ai-report-btn${reported ? " is-reported" : ""}" ${attrs} title="${title}" aria-label="${title}"${reported ? " disabled" : ""}><i class="${reported ? "fa-solid" : "fa-regular"} fa-flag" aria-hidden="true"></i><span>${label}</span></button>`;
  }

  function ensureModal() {
    let modal = document.getElementById("aiReportModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "aiReportModal";
    modal.className = "modal hide ai-report-modal";
    modal.setAttribute("aria-hidden", "true");
    document.body.appendChild(modal);
    modal.addEventListener("click", event => {
      if (event.target.closest("[data-ai-report-close]")) close();
    });
    // Escape closes the dialog wherever the focus is (capture: before the live chat's own Escape).
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape" || !current || modal.classList.contains("hide")) return;
      event.stopPropagation();
      event.preventDefault();
      close();
    }, true);
    return modal;
  }

  function render(modal) {
    const preview = String(current.content || "").replace(/\s+/g, " ").trim();
    modal.innerHTML = `<div class="modal-backdrop" data-ai-report-close></div>
      <div class="modal-dialog ai-report-dialog" role="dialog" aria-modal="true" aria-labelledby="aiReportTitle" aria-describedby="aiReportIntro">
        <div class="modal-head">
          <div>
            <span class="ai-report-kicker"><i class="fa-regular fa-flag" aria-hidden="true"></i> AI-generated content</span>
            <h3 id="aiReportTitle">${current.general ? "Report an issue with the AI" : "Report this AI response"}</h3>
            <p id="aiReportIntro">Tell us what is wrong. The Triplem VIP team reviews every report and acts on content that is offensive, harmful, sexual, misleading or that breaks our rules.</p>
          </div>
          <button type="button" class="icon-btn ghost" data-ai-report-close aria-label="Close">×</button>
        </div>
        <form class="modal-body ai-report-form" id="aiReportForm" novalidate>
          ${current.general ? `<p class="ai-report-general-note">There is no AI response in this conversation yet. Describe the problem below and we will review it.</p>` : `<blockquote class="ai-report-preview" dir="auto">${esc(preview.length > 280 ? `${preview.slice(0, 280)}…` : preview)}</blockquote>`}
          <fieldset class="ai-report-reasons">
            <legend>Reason</legend>
            ${REASONS.map(([id, label, help]) => `<label class="ai-report-reason"><input type="radio" name="aiReportReason" value="${id}" /><span><strong>${esc(label)}</strong><small>${esc(help)}</small></span></label>`).join("")}
          </fieldset>
          <label class="form-label" for="aiReportDetails">Details <span class="ai-report-optional" id="aiReportDetailsHint">optional</span></label>
          <textarea id="aiReportDetails" class="input" rows="3" maxlength="${MAX_DETAILS}" placeholder="What was the problem?"></textarea>
          <p class="help ai-report-privacy"><i class="fa-solid fa-lock" aria-hidden="true"></i> The AI response and the question before it are sent with your report. Never include passwords, PINs, codes or private keys.</p>
          <div class="ai-report-status" id="aiReportStatus" role="status" aria-live="polite"></div>
        </form>
        <div class="modal-footer">
          <button type="button" class="btn ghost" data-ai-report-close>Cancel</button>
          <button type="button" class="btn primary" id="aiReportSend" disabled><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Send report</button>
        </div>
      </div>`;
    const form = modal.querySelector("#aiReportForm");
    const send = modal.querySelector("#aiReportSend");
    const details = modal.querySelector("#aiReportDetails");
    const hint = modal.querySelector("#aiReportDetailsHint");
    const sync = () => {
      const reason = form.querySelector("input[name=aiReportReason]:checked")?.value || "";
      const needsText = reason === "other" || current.general;
      hint.textContent = needsText ? "required" : "optional";
      send.disabled = !reason || (needsText && !details.value.trim());
    };
    form.addEventListener("change", sync);
    details.addEventListener("input", sync);
    form.addEventListener("submit", event => { event.preventDefault(); if (!send.disabled) submit(modal); });
    send.addEventListener("click", () => submit(modal));
  }

  function setStatus(modal, text, kind = "") {
    const el = modal.querySelector("#aiReportStatus");
    if (!el) return;
    el.textContent = text;
    el.className = `ai-report-status${kind ? ` is-${kind}` : ""}`;
  }

  async function submit(modal) {
    if (!current || current.sending) return;
    const form = modal.querySelector("#aiReportForm");
    const send = modal.querySelector("#aiReportSend");
    const reason = form.querySelector("input[name=aiReportReason]:checked")?.value || "";
    const details = String(modal.querySelector("#aiReportDetails")?.value || "").trim().slice(0, MAX_DETAILS);
    if (!reason) { setStatus(modal, "Choose a reason.", "error"); return; }
    if ((reason === "other" || current.general) && !details) { setStatus(modal, "Please describe the problem.", "error"); return; }
    if (typeof supabaseRpc !== "function") { setStatus(modal, "Reporting is not available right now. Please try again later.", "error"); return; }
    current.sending = true;
    send.disabled = true;
    setStatus(modal, "Sending…");
    try {
      const result = await supabaseRpc("app_report_ai_content", {
        p_source: current.source,
        p_reason: reason,
        p_ai_content: current.content,
        p_prompt: current.prompt,
        p_details: details,
        p_context: current.context
      });
      const value = Array.isArray(result) ? result[0] : result;
      if (value && value.ok === false) throw new Error(value.error || "The report could not be sent.");
      const done = current;
      try { done.onReported?.(); } catch (_) {}
      modal.querySelector(".ai-report-dialog").innerHTML = `<div class="modal-head"><div><span class="ai-report-kicker"><i class="fa-solid fa-flag" aria-hidden="true"></i> Report sent</span><h3 id="aiReportTitle">Thank you</h3><p>Your report was sent to the Triplem VIP team. We review every report and act on content that breaks our rules.</p></div><button type="button" class="icon-btn ghost" data-ai-report-close aria-label="Close">×</button></div><div class="modal-footer"><button type="button" class="btn primary" data-ai-report-close id="aiReportDone">Done</button></div>`;
      modal.querySelector("#aiReportDone")?.focus();
    } catch (error) {
      const raw = String(error?.message || "");
      const friendly = /too many/i.test(raw) ? "Too many reports. Please try again later."
        : /describe/i.test(raw) ? "Please describe the problem."
        : (typeof navigator !== "undefined" && navigator.onLine === false) ? "You are offline. Connect to the internet and send the report again."
        : "The report could not be sent. Please try again.";
      setStatus(modal, friendly, "error");
      send.disabled = false;
    } finally {
      if (current) current.sending = false;
    }
  }

  function open(options = {}) {
    const source = String(options.source || "");
    const content = String(options.content || "").trim().slice(0, MAX_CONTENT);
    if (!SOURCES.has(source) || !content) return false;
    const context = {};
    Object.entries(options.context || {}).forEach(([k, v]) => {
      if (["session_id", "message_id", "model", "surface", "app", "message_at"].includes(k) && v != null && v !== "") context[k] = String(v).slice(0, 200);
    });
    try {
      const desktop = window.__TRIPLEM_DESKTOP__;
      if (desktop && desktop.app === "windows") context.app = desktop.packaged ? "windows-store" : "windows";
    } catch (_) {}
    try {
      if (window.TriplemStore && window.TriplemStore.active) context.app = "windows-store";
    } catch (_) {}
    current = { source, content, general: options.general === true, prompt: String(options.prompt || "").trim().slice(0, MAX_PROMPT), context, onReported: options.onReported, sending: false };
    lastFocus = document.activeElement;
    const modal = ensureModal();
    render(modal);
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => modal.querySelector("input[name=aiReportReason]")?.focus());
    return true;
  }

  function close() {
    const modal = document.getElementById("aiReportModal");
    if (!modal) return;
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = "";
    current = null;
    try { if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); } catch (_) {}
    lastFocus = null;
  }

  // ---- Always-visible reporting (header flag + disclosure line) -------------------------------
  // Each AI surface registers a function returning its latest AI answer
  // ({ content, prompt, context, onReported }) or null when there is none yet.
  function registerProvider(source, fn) {
    if (SOURCES.has(source) && typeof fn === "function") providers.set(source, fn);
  }
  function openLatest(source, surface) {
    let latest = null;
    const fn = providers.get(source) || (window.__TRIPLEM_AI_REPORT_PROVIDERS || {})[source];
    try { latest = typeof fn === "function" ? fn() || null : null; } catch (_) { latest = null; }
    if (latest && String(latest.content || "").trim()) {
      return open({ ...latest, source: latest.source || source });
    }
    // The time keeps separate general reports apart (the server counts an identical report once a day).
    return open({ source, content: `${GENERAL_CONTENT} ${new Date().toISOString()}`, general: true, context: { surface: surface || "" } });
  }
  function headerButtonHtml(source, surface = "") {
    return `<button type="button" class="ai-report-head-btn" data-ai-report-general="${esc(source)}" data-ai-report-surface="${esc(surface)}" title="Report an issue with an AI response" aria-label="Report an issue with an AI response"><i class="fa-regular fa-flag" aria-hidden="true"></i><span>Report</span></button>`;
  }
  function disclosureHtml(source, surface = "") {
    return `<p class="ai-disclosure" data-ai-disclosure><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>Answers are generated by AI and can be wrong or incomplete. Check important figures before you rely on them.</span><button type="button" class="ai-disclosure-report" data-ai-report-general="${esc(source)}" data-ai-report-surface="${esc(surface)}">Report an issue</button></p>`;
  }
  document.addEventListener("click", event => {
    const btn = event.target && event.target.closest ? event.target.closest("[data-ai-report-general]") : null;
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    openLatest(btn.getAttribute("data-ai-report-general"), btn.getAttribute("data-ai-report-surface") || "");
  });

  // ---- Admin review queue (Main Admin) ---------------------------------------------------------
  // Lists reports (app_admin_list_ai_content_reports) and records the decision with a note
  // (app_admin_set_ai_content_report_status), so every report is reviewed and acted on.
  const REASON_LABEL = Object.fromEntries(REASONS.map(r => [r[0], r[1]]));
  const SOURCE_LABEL = { triplem_ai: "Triplem AI", aziz: "Aziz", live_chat_ai: "Live chat AI" };
  const queue = { status: "open", items: [], focusId: "", busy: false };
  function fmtWhen(v) {
    const d = v ? new Date(v) : null;
    return d && !isNaN(d) ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
  }
  function queueModal() {
    let m = document.getElementById("aiReportQueueModal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "aiReportQueueModal";
    m.className = "modal hide ai-report-queue-modal";
    m.setAttribute("aria-hidden", "true");
    document.body.appendChild(m);
    m.addEventListener("click", async event => {
      if (event.target.closest("[data-aiq-close]")) { closeQueue(); return; }
      const tab = event.target.closest("[data-aiq-status]");
      if (tab) { queue.status = tab.getAttribute("data-aiq-status"); await loadQueue(); return; }
      const act = event.target.closest("[data-aiq-set]");
      if (act) {
        const id = act.getAttribute("data-aiq-id");
        const note = String(m.querySelector(`[data-aiq-note="${CSS.escape(id)}"]`)?.value || "").trim().slice(0, 1000);
        await setStatus(id, act.getAttribute("data-aiq-set"), note);
      }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !m.classList.contains("hide")) { e.preventDefault(); closeQueue(); }
    });
    return m;
  }
  function renderQueue(message = "") {
    const m = queueModal();
    const tabs = [["open", "Open"], ["reviewed", "Acted on"], ["dismissed", "Dismissed"], ["all", "All"]]
      .map(([k, t]) => `<button type="button" class="tt-tab${queue.status === k ? " is-active" : ""}" data-aiq-status="${k}">${t}</button>`).join("");
    const rows = queue.items.map(r => `<article class="aiq-item${r.id === queue.focusId ? " is-focus" : ""}" id="aiq-${esc(r.id)}">
        <header><strong>${esc(REASON_LABEL[r.reason] || r.reason)}</strong><span>${esc(SOURCE_LABEL[r.source] || r.source)} · ${esc(fmtWhen(r.created_at))} · ${esc(r.reporter_name || "Visitor")}</span><em class="aiq-status is-${esc(r.status)}">${esc(r.status)}</em></header>
        ${r.prompt ? `<p class="aiq-label">Question</p><blockquote dir="auto">${esc(String(r.prompt).slice(0, 600))}</blockquote>` : ""}
        <p class="aiq-label">AI response</p><blockquote dir="auto">${esc(String(r.ai_content || "").slice(0, 2000))}</blockquote>
        ${r.details ? `<p class="aiq-label">Reporter's comment</p><p>${esc(r.details)}</p>` : ""}
        ${r.admin_note ? `<p class="aiq-label">Decision note</p><p>${esc(r.admin_note)}</p>` : ""}
        <label class="aiq-label" for="aiqNote-${esc(r.id)}">Action taken / note</label>
        <textarea class="input" id="aiqNote-${esc(r.id)}" rows="2" maxlength="1000" data-aiq-note="${esc(r.id)}" placeholder="For example: knowledge corrected, prompt updated, AI access restricted"></textarea>
        <div class="aiq-actions">
          ${r.status !== "reviewed" ? `<button type="button" class="btn primary tiny" data-aiq-set="reviewed" data-aiq-id="${esc(r.id)}">Mark as acted on</button>` : ""}
          ${r.status !== "dismissed" ? `<button type="button" class="btn ghost tiny" data-aiq-set="dismissed" data-aiq-id="${esc(r.id)}">Dismiss</button>` : ""}
          ${r.status !== "open" ? `<button type="button" class="btn ghost tiny" data-aiq-set="open" data-aiq-id="${esc(r.id)}">Reopen</button>` : ""}
        </div>
      </article>`).join("");
    m.innerHTML = `<div class="modal-backdrop" data-aiq-close></div>
      <div class="modal-dialog ai-report-queue-dialog" role="dialog" aria-modal="true" aria-labelledby="aiqTitle">
        <div class="modal-head"><div><span class="ai-report-kicker"><i class="fa-solid fa-flag" aria-hidden="true"></i> Moderation</span><h3 id="aiqTitle">Reported AI content</h3><p class="tt-tabs">${tabs}</p></div><button type="button" class="icon-btn ghost" data-aiq-close aria-label="Close">×</button></div>
        <div class="modal-body aiq-body">${message ? `<p class="aiq-message" role="status">${esc(message)}</p>` : ""}${queue.busy ? `<p class="aiq-message">Loading…</p>` : rows || `<p class="aiq-message">No reports in this list.</p>`}</div>
      </div>`;
    if (queue.focusId) document.getElementById(`aiq-${queue.focusId}`)?.scrollIntoView?.({ block: "center" });
  }
  async function loadQueue() {
    queue.busy = true; renderQueue();
    try {
      const res = await supabaseRpc("app_admin_list_ai_content_reports", { p_status: queue.status, p_limit: 200 });
      const v = Array.isArray(res) ? res[0] : res;
      queue.items = Array.isArray(v?.items) ? v.items : [];
      queue.busy = false; renderQueue();
    } catch (e) {
      queue.busy = false; queue.items = [];
      renderQueue(/admin/i.test(String(e?.message || "")) ? "Only the Main Admin can review AI reports." : "Reports could not be loaded. Please try again.");
    }
  }
  async function setStatus(id, status, note) {
    try {
      await supabaseRpc("app_admin_set_ai_content_report_status", { p_id: id, p_status: status, p_note: note || null });
      await loadQueue();
    } catch (e) { renderQueue("The decision could not be saved. Please try again."); }
  }
  async function openAdminQueue(options = {}) {
    if (typeof supabaseRpc !== "function") return false;
    queue.focusId = String(options.focusId || "");
    if (queue.focusId) queue.status = "all";
    const m = queueModal();
    m.classList.remove("hide"); m.setAttribute("aria-hidden", "false");
    await loadQueue();
    return true;
  }
  function closeQueue() {
    const m = document.getElementById("aiReportQueueModal");
    if (!m) return;
    m.classList.add("hide"); m.setAttribute("aria-hidden", "true"); m.innerHTML = "";
  }

  window.TriplemAiReport = Object.freeze({ open, close, buttonHtml, headerButtonHtml, disclosureHtml, registerProvider, openLatest, openAdminQueue, reasons: REASONS.map(r => r[0]) });
})();
