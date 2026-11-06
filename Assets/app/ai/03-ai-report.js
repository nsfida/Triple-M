/* Triplem VIP · Report an AI response (2026-11-06)
 *
 * Every generative AI answer in the product (Triplem AI in the workspace and
 * Aziz / the AI assistant in the live chat) has a "Report" button. The user
 * picks a reason, can add a comment, and the report goes to the Triplem VIP
 * team through the app_report_ai_content RPC (migration 206), which stores it
 * and notifies the administrators. Nothing else is read or changed.
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
            <h3 id="aiReportTitle">Report this AI response</h3>
            <p id="aiReportIntro">Tell us what is wrong. The Triplem VIP team reviews every report and uses it to make the AI safer.</p>
          </div>
          <button type="button" class="icon-btn ghost" data-ai-report-close aria-label="Close">×</button>
        </div>
        <form class="modal-body ai-report-form" id="aiReportForm" novalidate>
          <blockquote class="ai-report-preview" dir="auto">${esc(preview.length > 280 ? `${preview.slice(0, 280)}…` : preview)}</blockquote>
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
      const needsText = reason === "other";
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
    if (reason === "other" && !details) { setStatus(modal, "Please describe the problem.", "error"); return; }
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
    current = { source, content, prompt: String(options.prompt || "").trim().slice(0, MAX_PROMPT), context, onReported: options.onReported, sending: false };
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

  window.TriplemAiReport = Object.freeze({ open, close, buttonHtml, reasons: REASONS.map(r => r[0]) });
})();
