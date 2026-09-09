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

  function renderMessage(message) {
    const isUser = message.role === "user";
    const text = isUser ? esc(message.text || "").replace(/\n/g, "<br>") : formatAssistantText(message.text || "");
    return `<article class="triplem-ai-message ${isUser ? "is-user" : "is-ai"}">
      <div class="triplem-ai-message-avatar" aria-hidden="true">${isUser ? `<i class="fa-solid fa-user"></i>` : `<i class="fa-solid fa-sparkles"></i>`}</div>
      <div class="triplem-ai-message-content"><div class="triplem-ai-message-label">${isUser ? "You" : "Triplem AI"}</div><div class="triplem-ai-message-text">${text}</div></div>
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
    requestAnimationFrame(() => {
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
      ai.messages.push({ role: "assistant", text: String(response.answer || "I could not produce an answer.") });
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
      <div class="triplem-ai-secret-input"><input class="input" id="triplemAiApiKey" type="password" autocomplete="new-password" spellcheck="false" placeholder="${configured ? "Enter a new key only if you want to replace it" : "Paste Gemini API key"}" /><button type="button" class="icon-btn ghost" id="triplemAiEntryEye" aria-label="Show key while typing" title="Show while typing"><i class="fa-solid fa-eye"></i></button></div>
      <p>The key is never written to browser storage. After saving, only the masked identifier above can be displayed.</p>
    </div>
    <div class="triplem-ai-settings-notice"><i class="fa-solid fa-circle-info"></i><span>Triplem AI is read-only. It can inspect authorized Triplem VIP information and explain it, but it cannot silently create, edit, delete, post or transfer financial records.</span></div>
    <div id="triplemAiSettingsStatus" class="triplem-ai-settings-message" role="status"></div>`;
  }

  function renderSettingsModal(modal) {
    const ai = aiState();
    modal.innerHTML = `<div class="modal-backdrop" data-triplem-ai-settings-close></div>
      <div class="modal-dialog settings-sheet triplem-ai-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="triplemAiSettingsTitle">
        <div class="settings-sheet-head"><div><span class="triplem-ai-settings-kicker">Bring your own AI</span><h3 id="triplemAiSettingsTitle">Triplem AI Settings</h3><p>Private Gemini integration for your authenticated workspace.</p></div><button type="button" class="btn ghost tiny" data-triplem-ai-settings-close aria-label="Close">✕</button></div>
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
  window.triplemAiAccountSettingsCardHtml = accountSettingsCardHtml;
})();
