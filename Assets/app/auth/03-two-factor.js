/* Triplem VIP Authenticator App 2FA — RFC 6238 TOTP + recovery codes (v127). */
(() => {
  "use strict";

  const safe = value => String(value ?? "");
  const esc = value => {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(safe(value));
    return safe(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  };

  function rpc(name, args = {}) {
    if (typeof window.supabaseRpc !== "function") throw new Error("Secure database connection is unavailable.");
    return window.supabaseRpc(name, args);
  }

  function closeModalElement(modal) {
    if (!modal) return;
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
  }

  function copyText(value) {
    const text = safe(value);
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } finally { area.remove(); }
    return Promise.resolve();
  }

  function formatManualSecret(secret) {
    return safe(secret).replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
  }

  function recoveryText(codes) {
    const list = Array.isArray(codes) ? codes : [];
    return [
      "Triplem VIP Authenticator Recovery Codes",
      "",
      "Each code works once. Store them somewhere private and offline.",
      "",
      ...list
    ].join("\n");
  }

  function downloadRecoveryCodes(codes) {
    const blob = new Blob([recoveryText(codes)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Triplem-VIP-2FA-Recovery-Codes.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function renderQr(container, uri) {
    if (!container) return;
    container.replaceChildren();
    if (typeof window.QRCode !== "function") {
      container.innerHTML = `<div class="two-factor-qr-fallback"><i class="fa-solid fa-key"></i><span>QR library unavailable. Use the manual setup key.</span></div>`;
      return;
    }
    try {
      new window.QRCode(container, {
        text: uri,
        width: 188,
        height: 188,
        correctLevel: window.QRCode.CorrectLevel?.M
      });
      // qrcodejs may append both a canvas and an image representation. Keep one
      // visual QR only so enrollment never shows a duplicated code.
      requestAnimationFrame(() => {
        const canvas = container.querySelector("canvas");
        const images = Array.from(container.querySelectorAll("img"));
        if (canvas && images.length) images.forEach(img => img.remove());
        const visuals = Array.from(container.querySelectorAll("canvas,img,table"));
        visuals.slice(1).forEach(el => el.remove());
      });
    } catch (_) {
      container.innerHTML = `<div class="two-factor-qr-fallback"><i class="fa-solid fa-key"></i><span>Use the manual setup key below.</span></div>`;
    }
  }

  function twoFactorSettingsCardHtml() {
    return `
      <div class="settings-card settings-card--two-factor" id="twoFactorSettingsCard">
        <div class="settings-card-head two-factor-settings-head">
          <span><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Authenticator App 2FA</span>
          <span class="settings-pill two-factor-status-pill is-loading" id="twoFactorStatusPill">Checking…</span>
        </div>
        <div class="two-factor-settings-summary">
          <div class="two-factor-settings-icon"><i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i></div>
          <div>
            <strong id="twoFactorStatusTitle">Protect sign-in with an authenticator app</strong>
            <p id="twoFactorStatusText">Use Google Authenticator, Microsoft Authenticator, Authy, 1Password or another TOTP-compatible app. No SMS or paid service is required.</p>
          </div>
        </div>
        <div class="two-factor-settings-actions">
          <button type="button" class="btn primary tiny" id="twoFactorEnableBtn"><i class="fa-solid fa-qrcode"></i> Set up 2FA</button>
          <button type="button" class="btn soft tiny hide" id="twoFactorReplaceBtn"><i class="fa-solid fa-rotate"></i> Replace authenticator</button>
          <button type="button" class="btn soft tiny hide" id="twoFactorRecoveryBtn"><i class="fa-solid fa-key"></i> New recovery codes</button>
          <button type="button" class="btn ghost tiny danger-text hide" id="twoFactorDisableBtn"><i class="fa-solid fa-shield"></i> Turn off</button>
        </div>
      </div>`;
  }

  function ensureTwoFactorManagementModal() {
    let modal = document.getElementById("twoFactorManagementModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "twoFactorManagementModal";
      modal.className = "modal hide two-factor-modal two-factor-management-modal";
      modal.setAttribute("aria-hidden", "true");
      document.body.appendChild(modal);
    }
    return modal;
  }

  async function refreshAccountTwoFactorSummary(accountModal = document.getElementById("accountSettingsModal")) {
    const pill = accountModal?.querySelector?.("#accountTwoFactorSummaryPill");
    const text = accountModal?.querySelector?.("#accountTwoFactorSummaryText");
    if (!pill && !text) return null;
    try {
      const status = await rpc("app_two_factor_status", {});
      const enabled = status?.enabled === true;
      const remaining = Math.max(0, Number(status?.recovery_remaining) || 0);
      pill?.classList.remove("is-loading", "is-enabled");
      pill?.classList.toggle("is-enabled", enabled);
      if (pill) pill.textContent = enabled ? "On" : "Off";
      if (text) text.textContent = enabled
        ? `Enabled · ${remaining} recovery code${remaining === 1 ? "" : "s"} remaining`
        : "Add a free authenticator app as a second sign-in factor.";
      try { window.refreshAccountRecoverySummary?.(accountModal); } catch (_) {}
      return status;
    } catch (error) {
      if (pill) { pill.textContent = "Unavailable"; pill.classList.remove("is-loading", "is-enabled"); }
      if (text) text.textContent = "Could not load two-factor status.";
      return null;
    }
  }

  function openTwoFactorManagement() {
    const modal = ensureTwoFactorManagementModal();
    modal.innerHTML = `
      <div class="modal-backdrop" data-two-factor-manage-close></div>
      <div class="modal-dialog settings-sheet two-factor-dialog two-factor-management-dialog" role="dialog" aria-modal="true" aria-labelledby="twoFactorManageTitle">
        <div class="settings-sheet-head two-factor-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-shield-halved"></i> Sign-in security</p><h3 id="twoFactorManageTitle">Authenticator App 2FA</h3><p>Manage your authenticator, recovery codes and second-factor protection.</p></div><button type="button" class="btn ghost tiny" data-two-factor-manage-close aria-label="Close">✕</button></div>
        <div class="modal-body settings-sheet-body two-factor-body two-factor-management-body">${twoFactorSettingsCardHtml()}</div>
      </div>`;
    const close = () => {
      closeModalElement(modal);
      modal.innerHTML = "";
      refreshAccountTwoFactorSummary().catch(() => {});
    };
    modal.querySelectorAll("[data-two-factor-manage-close]").forEach(el => el.addEventListener("click", close));
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");
    initTwoFactorSettingsCard(modal);
  }

  async function refreshTwoFactorSettingsCard(modal) {
    const root = modal?.querySelector?.("#twoFactorSettingsCard");
    if (!root) return null;
    const pill = root.querySelector("#twoFactorStatusPill");
    const title = root.querySelector("#twoFactorStatusTitle");
    const text = root.querySelector("#twoFactorStatusText");
    const enableBtn = root.querySelector("#twoFactorEnableBtn");
    const replaceBtn = root.querySelector("#twoFactorReplaceBtn");
    const recoveryBtn = root.querySelector("#twoFactorRecoveryBtn");
    const disableBtn = root.querySelector("#twoFactorDisableBtn");
    try {
      const status = await rpc("app_two_factor_status", {});
      const enabled = status?.enabled === true;
      const remaining = Math.max(0, Number(status?.recovery_remaining) || 0);
      pill?.classList.remove("is-loading", "is-enabled");
      pill?.classList.toggle("is-enabled", enabled);
      if (pill) pill.textContent = enabled ? "On" : "Off";
      if (title) title.textContent = enabled ? "Authenticator App 2FA is enabled" : "Protect sign-in with an authenticator app";
      if (text) text.textContent = enabled
        ? `${remaining} unused recovery code${remaining === 1 ? "" : "s"} available. Remember Me keeps this already-authorized device signed in; a fresh browser or device must verify 2FA.`
        : "Use Google Authenticator, Microsoft Authenticator, Authy, 1Password or another TOTP-compatible app. No SMS or paid service is required.";
      enableBtn?.classList.toggle("hide", enabled);
      replaceBtn?.classList.toggle("hide", !enabled);
      recoveryBtn?.classList.toggle("hide", !enabled);
      disableBtn?.classList.toggle("hide", !enabled);
      return status;
    } catch (error) {
      if (pill) { pill.textContent = "Unavailable"; pill.classList.remove("is-loading", "is-enabled"); }
      if (text) text.textContent = error?.message || "Could not load two-factor security status.";
      enableBtn?.classList.add("hide");
      replaceBtn?.classList.add("hide");
      recoveryBtn?.classList.add("hide");
      disableBtn?.classList.add("hide");
      return null;
    }
  }

  function ensureEnrollmentModal() {
    let modal = document.getElementById("twoFactorEnrollmentModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "twoFactorEnrollmentModal";
      modal.className = "modal hide two-factor-modal";
      modal.setAttribute("aria-hidden", "true");
      document.body.appendChild(modal);
    }
    return modal;
  }

  function renderRecoveryStage(modal, codes, { regenerated = false } = {}) {
    const list = Array.isArray(codes) ? codes : [];
    modal.innerHTML = `
      <div class="modal-backdrop" data-two-factor-close></div>
      <div class="modal-dialog settings-sheet two-factor-dialog" role="dialog" aria-modal="true" aria-labelledby="twoFactorRecoveryTitle">
        <div class="settings-sheet-head two-factor-head">
          <div><p class="two-factor-kicker"><i class="fa-solid fa-shield-halved"></i> Account security</p><h3 id="twoFactorRecoveryTitle">${regenerated ? "New recovery codes" : "2FA is now active"}</h3><p>Save these codes before closing this window.</p></div>
        </div>
        <div class="modal-body settings-sheet-body two-factor-body">
          <div class="two-factor-success"><i class="fa-solid fa-circle-check"></i><div><strong>${regenerated ? "Previous recovery codes are now invalid" : "Authenticator App 2FA enabled"}</strong><span>Each recovery code can be used once if your authenticator app is unavailable.</span></div></div>
          <div class="two-factor-recovery-grid" id="twoFactorRecoveryGrid">${list.map(code => `<code>${esc(code)}</code>`).join("")}</div>
          <div class="two-factor-recovery-note"><i class="fa-solid fa-triangle-exclamation"></i><span>Triplem VIP will not show these exact codes again. Keep them private and offline.</span></div>
          <div class="two-factor-inline-actions">
            <button type="button" class="btn soft" data-two-factor-copy-recovery><i class="fa-solid fa-copy"></i> Copy codes</button>
            <button type="button" class="btn soft" data-two-factor-download-recovery><i class="fa-solid fa-download"></i> Save file</button>
          </div>
          <div class="settings-sheet-footer two-factor-footer"><button type="button" class="btn primary" data-two-factor-done>Done</button></div>
        </div>
      </div>`;
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");
    const finish = () => {
      closeModalElement(modal);
      modal.innerHTML = "";
      const manageModal = document.getElementById("twoFactorManagementModal");
      if (manageModal && !manageModal.classList.contains("hide")) refreshTwoFactorSettingsCard(manageModal).catch(() => {});
      refreshAccountTwoFactorSummary().catch(() => {});
    };
    modal.querySelector("[data-two-factor-copy-recovery]")?.addEventListener("click", async e => {
      await copyText(recoveryText(list)).catch(() => {});
      const btn = e.currentTarget;
      const old = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
      setTimeout(() => { if (btn.isConnected) btn.innerHTML = old; }, 1200);
    });
    modal.querySelector("[data-two-factor-download-recovery]")?.addEventListener("click", () => downloadRecoveryCodes(list));
    modal.querySelector("[data-two-factor-done]")?.addEventListener("click", finish);
  }

  function openTwoFactorEnrollment() {
    const modal = ensureEnrollmentModal();
    modal.innerHTML = `
      <div class="modal-backdrop" data-two-factor-close></div>
      <div class="modal-dialog settings-sheet two-factor-dialog" role="dialog" aria-modal="true" aria-labelledby="twoFactorSetupTitle">
        <div class="settings-sheet-head two-factor-head">
          <div><p class="two-factor-kicker"><i class="fa-solid fa-shield-halved"></i> Account security</p><h3 id="twoFactorSetupTitle">Set up Authenticator App 2FA</h3><p>Free, standards-based TOTP protection for your Triplem VIP sign-in.</p></div>
          <button type="button" class="btn ghost tiny" data-two-factor-close aria-label="Close">✕</button>
        </div>
        <div class="modal-body settings-sheet-body two-factor-body">
          <section class="two-factor-stage" data-two-factor-stage="password">
            <div class="two-factor-step-title"><span>1</span><div><strong>Confirm your password</strong><small>This prevents another person using an unlocked workspace from enabling a new authenticator.</small></div></div>
            <label class="settings-field">Current password
              <input class="input settings-input" id="twoFactorSetupPassword" type="password" autocomplete="current-password" placeholder="Current password" />
            </label>
            <p class="lock-error" id="twoFactorSetupError"></p>
            <div class="settings-sheet-footer two-factor-footer"><button type="button" class="btn ghost" data-two-factor-close>Cancel</button><button type="button" class="btn primary" id="twoFactorBeginBtn">Continue</button></div>
          </section>
          <section class="two-factor-stage hide" data-two-factor-stage="enroll">
            <div class="two-factor-step-title"><span>2</span><div><strong>Add Triplem VIP to your authenticator</strong><small>Scan the QR code or enter the manual key. Then type the current six-digit code.</small></div></div>
            <div class="two-factor-enroll-grid">
              <div class="two-factor-qr-card"><div id="twoFactorQr"></div><small>Scan with your authenticator app</small></div>
              <div class="two-factor-manual-card"><span>Manual setup key</span><code id="twoFactorManualKey"></code><button type="button" class="btn ghost tiny" id="twoFactorCopySecret"><i class="fa-solid fa-copy"></i> Copy key</button><p>Type: Time based · 6 digits · 30 seconds · SHA-1</p></div>
            </div>
            <label class="settings-field two-factor-code-field">Authenticator code
              <input class="input settings-input two-factor-code-input" id="twoFactorSetupCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" />
            </label>
            <p class="lock-error" id="twoFactorVerifySetupError"></p>
            <div class="settings-sheet-footer two-factor-footer"><button type="button" class="btn ghost" data-two-factor-close>Cancel</button><button type="button" class="btn primary" id="twoFactorConfirmBtn"><i class="fa-solid fa-shield-halved"></i> Activate 2FA</button></div>
          </section>
        </div>
      </div>`;

    let setupSecret = "";
    const close = () => { setupSecret = ""; closeModalElement(modal); modal.innerHTML = ""; };
    modal.querySelectorAll("[data-two-factor-close]").forEach(el => el.addEventListener("click", close));
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => modal.querySelector("#twoFactorSetupPassword")?.focus(), 60);

    const beginBtn = modal.querySelector("#twoFactorBeginBtn");
    beginBtn?.addEventListener("click", async () => {
      const password = safe(modal.querySelector("#twoFactorSetupPassword")?.value);
      const error = modal.querySelector("#twoFactorSetupError");
      if (error) { error.textContent = ""; error.classList.remove("show"); }
      if (!password) { if (error) { error.textContent = "Enter your current password."; error.classList.add("show"); } return; }
      beginBtn.disabled = true;
      try {
        const result = await rpc("app_two_factor_begin_setup", { p_password: password });
        setupSecret = safe(result?.secret);
        if (!setupSecret || !result?.otpauth_uri) throw new Error("Authenticator setup could not be created.");
        modal.querySelector('[data-two-factor-stage="password"]')?.classList.add("hide");
        modal.querySelector('[data-two-factor-stage="enroll"]')?.classList.remove("hide");
        const key = modal.querySelector("#twoFactorManualKey");
        if (key) key.textContent = formatManualSecret(setupSecret);
        renderQr(modal.querySelector("#twoFactorQr"), result.otpauth_uri);
        setTimeout(() => modal.querySelector("#twoFactorSetupCode")?.focus(), 70);
      } catch (err) {
        if (error) { error.textContent = err?.message || "Could not start authenticator setup."; error.classList.add("show"); }
      } finally { beginBtn.disabled = false; }
    });

    modal.querySelector("#twoFactorCopySecret")?.addEventListener("click", async e => {
      if (!setupSecret) return;
      await copyText(setupSecret).catch(() => {});
      const btn = e.currentTarget;
      const old = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
      setTimeout(() => { if (btn.isConnected) btn.innerHTML = old; }, 1100);
    });

    const codeInput = modal.querySelector("#twoFactorSetupCode");
    codeInput?.addEventListener("input", () => { codeInput.value = codeInput.value.replace(/\D/g, "").slice(0,6); });
    const confirmBtn = modal.querySelector("#twoFactorConfirmBtn");
    const confirm = async () => {
      const code = safe(codeInput?.value).trim();
      const error = modal.querySelector("#twoFactorVerifySetupError");
      if (error) { error.textContent = ""; error.classList.remove("show"); }
      if (!/^\d{6}$/.test(code)) { if (error) { error.textContent = "Enter the current six-digit code from your authenticator app."; error.classList.add("show"); } return; }
      confirmBtn.disabled = true;
      try {
        const result = await rpc("app_two_factor_confirm_setup", { p_code: code });
        const codes = Array.isArray(result?.recovery_codes) ? result.recovery_codes : [];
        setupSecret = "";
        renderRecoveryStage(modal, codes, { regenerated: false });
      } catch (err) {
        if (error) { error.textContent = err?.message || "The authenticator code could not be verified."; error.classList.add("show"); }
        if (codeInput) { codeInput.value = ""; codeInput.focus(); }
      } finally { if (confirmBtn?.isConnected) confirmBtn.disabled = false; }
    };
    confirmBtn?.addEventListener("click", confirm);
    codeInput?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); confirm(); } });
  }

  function openTwoFactorReplacement() {
    const modal = ensureEnrollmentModal();
    modal.innerHTML = `
      <div class="modal-backdrop" data-two-factor-close></div>
      <div class="modal-dialog settings-sheet two-factor-dialog" role="dialog" aria-modal="true" aria-labelledby="twoFactorReplaceTitle">
        <div class="settings-sheet-head two-factor-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-shield-halved"></i> Account security</p><h3 id="twoFactorReplaceTitle">Replace authenticator</h3><p>Verify your current protection before binding a new authenticator app.</p></div><button type="button" class="btn ghost tiny" data-two-factor-close aria-label="Close">✕</button></div>
        <div class="modal-body settings-sheet-body two-factor-body">
          <section class="two-factor-stage" data-two-factor-replace-stage="verify">
            <div class="two-factor-step-title"><span>1</span><div><strong>Verify existing security</strong><small>Enter your current password and authenticator or recovery code.</small></div></div>
            <label class="settings-field">Current password<input class="input settings-input" id="twoFactorReplacePassword" type="password" autocomplete="current-password" /></label>
            <label class="settings-field">Authenticator or recovery code<input class="input settings-input" id="twoFactorReplaceCurrentCode" autocomplete="one-time-code" placeholder="6-digit code or recovery code" /></label>
            <p class="lock-error" id="twoFactorReplaceError"></p>
            <div class="settings-sheet-footer two-factor-footer"><button type="button" class="btn ghost" data-two-factor-close>Cancel</button><button type="button" class="btn primary" id="twoFactorReplaceBegin">Continue</button></div>
          </section>
          <section class="two-factor-stage hide" data-two-factor-replace-stage="enroll">
            <div class="two-factor-step-title"><span>2</span><div><strong>Add the new authenticator</strong><small>Scan this single QR code or use the manual key, then enter the new six-digit code.</small></div></div>
            <div class="two-factor-enroll-grid"><div class="two-factor-qr-card"><div id="twoFactorQr"></div><small>Scan with the new authenticator app</small></div><div class="two-factor-manual-card"><span>Manual setup key</span><code id="twoFactorManualKey"></code><button type="button" class="btn ghost tiny" id="twoFactorCopySecret"><i class="fa-solid fa-copy"></i> Copy key</button><p>Type: Time based · 6 digits · 30 seconds · SHA-1</p></div></div>
            <label class="settings-field two-factor-code-field">New authenticator code<input class="input settings-input two-factor-code-input" id="twoFactorReplaceNewCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" /></label>
            <p class="lock-error" id="twoFactorReplaceConfirmError"></p>
            <div class="settings-sheet-footer two-factor-footer"><button type="button" class="btn ghost" data-two-factor-close>Cancel</button><button type="button" class="btn primary" id="twoFactorReplaceConfirm"><i class="fa-solid fa-rotate"></i> Replace authenticator</button></div>
          </section>
        </div>
      </div>`;
    let setupSecret = "";
    const close = () => { setupSecret = ""; closeModalElement(modal); modal.innerHTML = ""; };
    modal.querySelectorAll("[data-two-factor-close]").forEach(el => el.addEventListener("click", close));
    modal.classList.remove("hide"); modal.setAttribute("aria-hidden", "false");
    setTimeout(() => modal.querySelector("#twoFactorReplacePassword")?.focus(), 60);
    const begin = modal.querySelector("#twoFactorReplaceBegin");
    begin?.addEventListener("click", async () => {
      const password = safe(modal.querySelector("#twoFactorReplacePassword")?.value);
      const currentCode = safe(modal.querySelector("#twoFactorReplaceCurrentCode")?.value).trim();
      const error = modal.querySelector("#twoFactorReplaceError");
      if (error) { error.textContent = ""; error.classList.remove("show"); }
      if (!password || !currentCode) { if (error) { error.textContent = "Enter your current password and authenticator or recovery code."; error.classList.add("show"); } return; }
      begin.disabled = true;
      try {
        const result = await rpc("app_two_factor_begin_replacement", { p_password: password, p_code: currentCode });
        setupSecret = safe(result?.secret);
        if (!setupSecret || !result?.otpauth_uri) throw new Error("Replacement setup could not be created.");
        modal.querySelector('[data-two-factor-replace-stage="verify"]')?.classList.add("hide");
        modal.querySelector('[data-two-factor-replace-stage="enroll"]')?.classList.remove("hide");
        const key = modal.querySelector("#twoFactorManualKey"); if (key) key.textContent = formatManualSecret(setupSecret);
        renderQr(modal.querySelector("#twoFactorQr"), result.otpauth_uri);
        setTimeout(() => modal.querySelector("#twoFactorReplaceNewCode")?.focus(), 70);
      } catch (err) { if (error) { error.textContent = err?.message || "Security verification failed."; error.classList.add("show"); } }
      finally { if (begin?.isConnected) begin.disabled = false; }
    });
    modal.querySelector("#twoFactorCopySecret")?.addEventListener("click", async e => {
      if (!setupSecret) return; await copyText(setupSecret).catch(() => {});
      const btn=e.currentTarget, old=btn.innerHTML; btn.innerHTML='<i class="fa-solid fa-check"></i> Copied'; setTimeout(()=>{ if(btn.isConnected) btn.innerHTML=old; },1100);
    });
    const newCode = modal.querySelector("#twoFactorReplaceNewCode");
    newCode?.addEventListener("input", () => { newCode.value = newCode.value.replace(/\D/g, "").slice(0,6); });
    const confirm = modal.querySelector("#twoFactorReplaceConfirm");
    const submit = async () => {
      const code = safe(newCode?.value).trim();
      const error = modal.querySelector("#twoFactorReplaceConfirmError");
      if (error) { error.textContent = ""; error.classList.remove("show"); }
      if (!/^\d{6}$/.test(code)) { if (error) { error.textContent = "Enter the current six-digit code from the new authenticator."; error.classList.add("show"); } return; }
      confirm.disabled = true;
      try {
        const result = await rpc("app_two_factor_confirm_setup", { p_code: code });
        setupSecret = "";
        renderRecoveryStage(modal, Array.isArray(result?.recovery_codes) ? result.recovery_codes : [], { regenerated: true });
      } catch (err) { if (error) { error.textContent = err?.message || "The new authenticator code could not be verified."; error.classList.add("show"); } if (newCode) { newCode.value=""; newCode.focus(); } }
      finally { if (confirm?.isConnected) confirm.disabled = false; }
    };
    confirm?.addEventListener("click", submit);
    newCode?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  }

  function ensureProtectedActionModal() {
    let modal = document.getElementById("twoFactorProtectedActionModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "twoFactorProtectedActionModal";
      modal.className = "modal hide two-factor-modal";
      modal.setAttribute("aria-hidden", "true");
      document.body.appendChild(modal);
    }
    return modal;
  }

  function openProtectedAction(action) {
    const regenerate = action === "recovery";
    const modal = ensureProtectedActionModal();
    modal.innerHTML = `
      <div class="modal-backdrop" data-two-factor-action-close></div>
      <div class="modal-dialog settings-sheet two-factor-dialog two-factor-action-dialog" role="dialog" aria-modal="true">
        <div class="settings-sheet-head two-factor-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-shield-halved"></i> Security verification</p><h3>${regenerate ? "Replace recovery codes" : "Turn off Authenticator App 2FA"}</h3><p>${regenerate ? "New codes invalidate every previous unused recovery code." : "Confirm both your password and second factor before reducing account protection."}</p></div><button type="button" class="btn ghost tiny" data-two-factor-action-close>✕</button></div>
        <div class="modal-body settings-sheet-body two-factor-body">
          <label class="settings-field">Current password<input class="input settings-input" id="twoFactorActionPassword" type="password" autocomplete="current-password" /></label>
          <label class="settings-field">Authenticator or recovery code<input class="input settings-input" id="twoFactorActionCode" autocomplete="one-time-code" placeholder="6-digit code or recovery code" /></label>
          <p class="lock-error" id="twoFactorActionError"></p>
          <div class="settings-sheet-footer two-factor-footer"><button type="button" class="btn ghost" data-two-factor-action-close>Cancel</button><button type="button" class="btn ${regenerate ? "primary" : "danger"}" id="twoFactorActionSubmit">${regenerate ? "Generate new codes" : "Turn off 2FA"}</button></div>
        </div>
      </div>`;
    const close = () => { closeModalElement(modal); modal.innerHTML = ""; };
    modal.querySelectorAll("[data-two-factor-action-close]").forEach(el => el.addEventListener("click", close));
    modal.classList.remove("hide"); modal.setAttribute("aria-hidden", "false");
    setTimeout(() => modal.querySelector("#twoFactorActionPassword")?.focus(), 60);
    modal.querySelector("#twoFactorActionSubmit")?.addEventListener("click", async e => {
      const btn = e.currentTarget;
      const password = safe(modal.querySelector("#twoFactorActionPassword")?.value);
      const code = safe(modal.querySelector("#twoFactorActionCode")?.value).trim();
      const error = modal.querySelector("#twoFactorActionError");
      if (error) { error.textContent = ""; error.classList.remove("show"); }
      if (!password || !code) { if (error) { error.textContent = "Enter your current password and authenticator or recovery code."; error.classList.add("show"); } return; }
      btn.disabled = true;
      try {
        if (regenerate) {
          const result = await rpc("app_two_factor_regenerate_recovery_codes", { p_password: password, p_code: code });
          renderRecoveryStage(modal, Array.isArray(result?.recovery_codes) ? result.recovery_codes : [], { regenerated: true });
        } else {
          await rpc("app_two_factor_disable", { p_password: password, p_code: code });
          close();
          const manageModal = document.getElementById("twoFactorManagementModal");
          if (manageModal && !manageModal.classList.contains("hide")) await refreshTwoFactorSettingsCard(manageModal);
          await refreshAccountTwoFactorSummary();
        }
      } catch (err) {
        if (error) { error.textContent = err?.message || "Security verification failed."; error.classList.add("show"); }
      } finally { if (btn?.isConnected) btn.disabled = false; }
    });
  }

  function initTwoFactorSettingsCard(modal) {
    const root = modal?.querySelector?.("#twoFactorSettingsCard");
    if (!root || root.dataset.bound === "1") return;
    root.dataset.bound = "1";
    root.querySelector("#twoFactorEnableBtn")?.addEventListener("click", openTwoFactorEnrollment);
    root.querySelector("#twoFactorReplaceBtn")?.addEventListener("click", openTwoFactorReplacement);
    root.querySelector("#twoFactorRecoveryBtn")?.addEventListener("click", () => openProtectedAction("recovery"));
    root.querySelector("#twoFactorDisableBtn")?.addEventListener("click", () => openProtectedAction("disable"));
    refreshTwoFactorSettingsCard(modal).catch(() => {});
  }

  function ensureLoginModal() {
    let modal = document.getElementById("twoFactorLoginModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "twoFactorLoginModal";
      modal.className = "two-factor-login-overlay hide";
      modal.setAttribute("aria-hidden", "true");
      document.body.appendChild(modal);
    }
    return modal;
  }

  function requestTwoFactorLogin({ challengeToken = "", username = "", displayName = "" } = {}) {
    const modal = ensureLoginModal();
    return new Promise(resolve => {
      let done = false;
      let recoveryMode = false;
      const finish = result => {
        if (done) return;
        done = true;
        closeModalElement(modal);
        modal.innerHTML = "";
        resolve(result || null);
      };
      modal.innerHTML = `
        <div class="two-factor-login-backdrop"></div>
        <div class="two-factor-login-card" role="dialog" aria-modal="true" aria-labelledby="twoFactorLoginTitle">
          <div class="two-factor-login-brand"><span><i class="fa-solid fa-shield-halved"></i></span><div><p>Triplem VIP Security</p><h3 id="twoFactorLoginTitle">Two-factor verification</h3></div></div>
          <p class="two-factor-login-copy">${esc(displayName || username || "Your account")} is protected with an authenticator app. Enter the current code to finish signing in.</p>
          <div class="two-factor-login-tabs" role="tablist"><button type="button" class="is-active" data-two-factor-login-mode="totp">Authenticator</button><button type="button" data-two-factor-login-mode="recovery">Recovery code</button></div>
          <label class="two-factor-login-field"><span id="twoFactorLoginCodeLabel">6-digit authenticator code</span><input id="twoFactorLoginCode" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" /></label>
          <p class="two-factor-login-hint" id="twoFactorLoginHint">Codes refresh every 30 seconds. A small clock difference is automatically tolerated.</p>
          <label class="two-factor-trust-browser"><input id="twoFactorTrustBrowser" type="checkbox" /><span><strong>Trust this browser for 30 days</strong><small>Skip Authenticator here next time and allow secure recovery approvals from this signed-in browser.</small></span><i class="fa-solid fa-shield-heart" aria-hidden="true"></i></label>
          <p class="lock-error two-factor-login-error" id="twoFactorLoginError"></p>
          <div class="two-factor-login-actions"><button type="button" class="btn ghost" id="twoFactorLoginCancel">Cancel</button><button type="button" class="btn primary" id="twoFactorLoginVerify"><i class="fa-solid fa-arrow-right-to-bracket"></i> Verify &amp; continue</button></div>
        </div>`;
      modal.classList.remove("hide"); modal.setAttribute("aria-hidden", "false");
      const input = modal.querySelector("#twoFactorLoginCode");
      const error = modal.querySelector("#twoFactorLoginError");
      const label = modal.querySelector("#twoFactorLoginCodeLabel");
      const hint = modal.querySelector("#twoFactorLoginHint");
      const verify = modal.querySelector("#twoFactorLoginVerify");
      const trustBrowser = modal.querySelector("#twoFactorTrustBrowser");
      const setMode = mode => {
        recoveryMode = mode === "recovery";
        modal.querySelectorAll("[data-two-factor-login-mode]").forEach(btn => btn.classList.toggle("is-active", btn.dataset.twoFactorLoginMode === mode));
        if (label) label.textContent = recoveryMode ? "Recovery code" : "6-digit authenticator code";
        if (hint) hint.textContent = recoveryMode ? "Use one unused recovery code saved when 2FA was enabled." : "Codes refresh every 30 seconds. A small clock difference is automatically tolerated.";
        if (input) {
          input.value = "";
          input.inputMode = recoveryMode ? "text" : "numeric";
          input.maxLength = recoveryMode ? 24 : 6;
          input.placeholder = recoveryMode ? "XXXX-XXXX-XXXX-XXXX" : "000000";
          input.focus();
        }
        if (error) { error.textContent = ""; error.classList.remove("show"); }
      };
      modal.querySelectorAll("[data-two-factor-login-mode]").forEach(btn => btn.addEventListener("click", () => setMode(btn.dataset.twoFactorLoginMode)));
      input?.addEventListener("input", () => {
        if (!recoveryMode) input.value = input.value.replace(/\D/g, "").slice(0,6);
        else input.value = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0,24);
      });
      const submit = async () => {
        const code = safe(input?.value).trim();
        if (error) { error.textContent = ""; error.classList.remove("show"); }
        if ((!recoveryMode && !/^\d{6}$/.test(code)) || (recoveryMode && code.replace(/[^A-Z0-9]/gi, "").length < 12)) {
          if (error) { error.textContent = recoveryMode ? "Enter one complete recovery code." : "Enter the current six-digit authenticator code."; error.classList.add("show"); }
          return;
        }
        verify.disabled = true;
        try {
          const result = await rpc("app_two_factor_complete_login", { p_challenge_token: challengeToken, p_code: code });
          if (result?.ok === false) {
            if (error) { error.textContent = result.error || "Verification failed."; error.classList.add("show"); }
            if (input) { input.value = ""; input.focus(); }
            return;
          }
          if (!result?.session_token || !result?.user?.id) throw new Error("Two-factor sign-in could not be completed.");
          result.trust_browser_requested = !!trustBrowser?.checked;
          finish(result);
        } catch (err) {
          if (error) { error.textContent = err?.message || "Two-factor verification failed."; error.classList.add("show"); }
          if (input) { input.value = ""; input.focus(); }
        } finally { if (verify?.isConnected) verify.disabled = false; }
      };
      verify?.addEventListener("click", submit);
      input?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
      modal.querySelector("#twoFactorLoginCancel")?.addEventListener("click", () => finish(null));
      setTimeout(() => input?.focus(), 70);
    });
  }



  function passwordPolicyCheck(password) {
    if (typeof window.assertPasswordPolicy === "function") return window.assertPasswordPolicy(password, "New password");
    if (String(password || "").length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      throw new Error("Use at least 8 characters with one uppercase letter, one lowercase letter, and one number.");
    }
  }

  function ensurePasswordRecoveryModal() {
    let modal = document.getElementById("passwordRecoveryModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "passwordRecoveryModal";
      modal.className = "modal hide account-recovery-modal";
      modal.setAttribute("aria-hidden", "true");
      document.body.appendChild(modal);
    }
    return modal;
  }

  function renderPasswordRecoveryIdentity(modal, presetUsername = "") {
    const preset = safe(presetUsername || document.getElementById("zipUsernameInput")?.value).trim();
    modal.innerHTML = `
      <div class="modal-backdrop" data-password-recovery-close></div>
      <div class="modal-dialog settings-sheet account-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="passwordRecoveryTitle">
        <div class="settings-sheet-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-shield-halved"></i> Secure recovery</p><h3 id="passwordRecoveryTitle">Forgot your password?</h3><p>Accounts protected by Authenticator App 2FA can reset the password without administrator access.</p></div><button type="button" class="btn ghost tiny" data-password-recovery-close aria-label="Close">✕</button></div>
        <div class="modal-body settings-sheet-body account-recovery-body">
          <div class="account-recovery-security-note"><i class="fa-solid fa-mobile-screen-button"></i><div><strong>Authenticator-protected recovery</strong><span>Enter your username first. Triplem VIP never reveals whether an account exists from this step.</span></div></div>
          <label class="settings-field">Username<input id="passwordRecoveryUsername" class="input settings-input" autocomplete="username" value="${esc(preset)}" placeholder="Your account username" /></label>
          <p class="settings-hint">If Authenticator App 2FA is not enabled, password recovery must be handled by the administrator through a temporary password.</p>
          <p class="lock-error" id="passwordRecoveryError"></p>
          <div class="settings-sheet-footer"><button type="button" class="btn ghost" data-password-recovery-close>Cancel</button><button type="button" class="btn primary" id="passwordRecoveryContinue"><i class="fa-solid fa-arrow-right"></i> Continue securely</button></div>
        </div>
      </div>`;
    const close = () => closeModalElement(modal);
    modal.querySelectorAll("[data-password-recovery-close]").forEach(el => el.onclick = close);
    const input = modal.querySelector("#passwordRecoveryUsername");
    modal.querySelector("#passwordRecoveryContinue").onclick = async e => {
      const btn = e.currentTarget;
      const error = modal.querySelector("#passwordRecoveryError");
      if (error) { error.textContent = ""; error.classList.remove("show"); }
      const username = safe(input?.value).trim();
      if (!username) { if (error) { error.textContent = "Enter your username."; error.classList.add("show"); } return; }
      btn.disabled = true;
      try {
        const result = await rpc("app_password_recovery_begin", { p_username: username });
        if (!result?.challenge_token) throw new Error("Secure recovery could not start.");
        renderPasswordRecoveryVerify(modal, result.challenge_token, username);
      } catch (err) {
        if (error) { error.textContent = err?.message || "Could not start password recovery."; error.classList.add("show"); }
      } finally { if (btn?.isConnected) btn.disabled = false; }
    };
    setTimeout(() => input?.focus(), 60);
  }

  function renderPasswordRecoveryVerify(modal, challengeToken, username) {
    let recoveryMode = false;
    modal.innerHTML = `
      <div class="modal-backdrop" data-password-recovery-close></div>
      <div class="modal-dialog settings-sheet account-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="passwordRecoveryVerifyTitle">
        <div class="settings-sheet-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-key"></i> Identity verification</p><h3 id="passwordRecoveryVerifyTitle">Verify Authenticator &amp; set a new password</h3><p>For <strong>@${esc(username)}</strong>. This recovery expires in 10 minutes.</p></div><button type="button" class="btn ghost tiny" data-password-recovery-close aria-label="Close">✕</button></div>
        <div class="modal-body settings-sheet-body account-recovery-body">
          <div class="two-factor-login-tabs" role="tablist"><button type="button" class="is-active" data-password-recovery-mode="totp">Authenticator</button><button type="button" data-password-recovery-mode="recovery">Recovery code</button></div>
          <label class="settings-field"><span id="passwordRecoveryCodeLabel">6-digit authenticator code</span><input id="passwordRecoveryCode" class="input settings-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" /></label>
          <label class="settings-field">New password<input id="passwordRecoveryNew" class="input settings-input" type="password" autocomplete="new-password" placeholder="8+ chars, upper, lower, number" /></label>
          <label class="settings-field">Confirm new password<input id="passwordRecoveryConfirm" class="input settings-input" type="password" autocomplete="new-password" placeholder="Repeat new password" /></label>
          <p class="settings-password-hint">The new password invalidates existing signed-in sessions. Your Authenticator App 2FA remains enabled.</p>
          <p class="lock-error" id="passwordRecoveryVerifyError"></p>
          <div class="settings-sheet-footer"><button type="button" class="btn ghost" id="passwordRecoveryBack">Back</button><button type="button" class="btn primary" id="passwordRecoveryReset"><i class="fa-solid fa-shield-halved"></i> Reset password</button></div>
        </div>
      </div>`;
    const close = () => closeModalElement(modal);
    modal.querySelectorAll("[data-password-recovery-close]").forEach(el => el.onclick = close);
    modal.querySelector("#passwordRecoveryBack").onclick = () => renderPasswordRecoveryIdentity(modal, username);
    const code = modal.querySelector("#passwordRecoveryCode");
    const label = modal.querySelector("#passwordRecoveryCodeLabel");
    const setMode = mode => {
      recoveryMode = mode === "recovery";
      modal.querySelectorAll("[data-password-recovery-mode]").forEach(btn => btn.classList.toggle("is-active", btn.dataset.passwordRecoveryMode === mode));
      if (label) label.textContent = recoveryMode ? "Recovery code" : "6-digit authenticator code";
      if (code) {
        code.value = "";
        code.inputMode = recoveryMode ? "text" : "numeric";
        code.maxLength = recoveryMode ? 24 : 6;
        code.placeholder = recoveryMode ? "XXXX-XXXX-XXXX-XXXX" : "000000";
      }
    };
    modal.querySelectorAll("[data-password-recovery-mode]").forEach(btn => btn.onclick = () => setMode(btn.dataset.passwordRecoveryMode));
    code?.addEventListener("input", () => { if (!recoveryMode) code.value = code.value.replace(/\D/g, "").slice(0,6); });
    modal.querySelector("#passwordRecoveryReset").onclick = async e => {
      const btn = e.currentTarget;
      const error = modal.querySelector("#passwordRecoveryVerifyError");
      if (error) { error.textContent = ""; error.classList.remove("show"); }
      const codeValue = safe(code?.value).trim();
      const next = safe(modal.querySelector("#passwordRecoveryNew")?.value);
      const confirm = safe(modal.querySelector("#passwordRecoveryConfirm")?.value);
      try {
        if ((!recoveryMode && !/^\d{6}$/.test(codeValue)) || (recoveryMode && codeValue.replace(/[^A-Z0-9]/gi, "").length < 12)) throw new Error(recoveryMode ? "Enter one complete recovery code." : "Enter the current six-digit authenticator code.");
        passwordPolicyCheck(next);
        if (next !== confirm) throw new Error("New passwords do not match.");
        btn.disabled = true;
        const result = await rpc("app_password_recovery_complete", { p_challenge_token: challengeToken, p_code: codeValue, p_new_password: next });
        if (result?.ok === false) throw new Error(result.error || "Recovery could not be verified.");
        modal.innerHTML = `<div class="modal-backdrop" data-password-recovery-close></div><div class="modal-dialog settings-sheet account-recovery-dialog account-recovery-success" role="dialog" aria-modal="true"><div class="modal-body settings-sheet-body account-recovery-body"><div class="two-factor-success"><i class="fa-solid fa-circle-check"></i><div><strong>Password reset securely</strong><span>Your previous password and existing sessions are no longer valid. Sign in with the new password and your Authenticator App.</span></div></div><div class="settings-sheet-footer"><button type="button" class="btn primary" data-password-recovery-close>Return to sign in</button></div></div></div>`;
        modal.querySelectorAll("[data-password-recovery-close]").forEach(el => el.onclick = () => closeModalElement(modal));
        const pw = document.getElementById("zipPasswordInput"); if (pw) pw.value = "";
      } catch (err) {
        if (error) { error.textContent = err?.message || "Could not reset password."; error.classList.add("show"); }
      } finally { if (btn?.isConnected) btn.disabled = false; }
    };
    setTimeout(() => code?.focus(), 60);
  }

  function openPasswordRecovery(presetUsername = "") {
    const modal = ensurePasswordRecoveryModal();
    renderPasswordRecoveryIdentity(modal, presetUsername);
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");
  }

  function requestSmartPinTwoFactorRecovery() {
    return new Promise(resolve => {
      let modal = document.getElementById("smartPinTwoFactorRecoveryModal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "smartPinTwoFactorRecoveryModal";
        modal.className = "modal hide account-recovery-modal";
        document.body.appendChild(modal);
      }
      let recoveryMode = false;
      modal.innerHTML = `
        <div class="modal-backdrop" data-smart-pin-2fa-close></div>
        <div class="modal-dialog settings-sheet account-recovery-dialog smart-pin-2fa-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="smartPin2faRecoveryTitle">
          <div class="settings-sheet-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-shield-halved"></i> Smart PIN recovery</p><h3 id="smartPin2faRecoveryTitle">Verify your second factor</h3><p>Authenticator App 2FA replaces knowledge-based recovery for this protected account.</p></div><button type="button" class="btn ghost tiny" data-smart-pin-2fa-close aria-label="Close">✕</button></div>
          <div class="modal-body settings-sheet-body account-recovery-body">
            <div class="two-factor-login-tabs" role="tablist"><button type="button" class="is-active" data-smart-pin-recovery-mode="totp">Authenticator</button><button type="button" data-smart-pin-recovery-mode="recovery">Recovery code</button></div>
            <label class="settings-field"><span id="smartPin2faCodeLabel">6-digit authenticator code</span><input id="smartPin2faCode" class="input settings-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" /></label>
            <div class="account-recovery-pin-grid"><label class="settings-field">New Smart PIN<input id="smartPin2faNew" class="input settings-input" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="4 or 6 digits" /></label><label class="settings-field">Confirm Smart PIN<input id="smartPin2faConfirm" class="input settings-input" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="Repeat PIN" /></label></div>
            <p class="lock-error" id="smartPin2faError"></p>
            <div class="settings-sheet-footer"><button type="button" class="btn ghost" data-smart-pin-2fa-close>Cancel</button><button type="button" class="btn primary" id="smartPin2faReset"><i class="fa-solid fa-key"></i> Reset Smart PIN</button></div>
          </div>
        </div>`;
      let settled = false;
      const finish = ok => { if (settled) return; settled = true; closeModalElement(modal); resolve(ok); };
      modal.querySelectorAll("[data-smart-pin-2fa-close]").forEach(el => el.onclick = () => finish(false));
      const code = modal.querySelector("#smartPin2faCode");
      const label = modal.querySelector("#smartPin2faCodeLabel");
      const setMode = mode => {
        recoveryMode = mode === "recovery";
        modal.querySelectorAll("[data-smart-pin-recovery-mode]").forEach(btn => btn.classList.toggle("is-active", btn.dataset.smartPinRecoveryMode === mode));
        if (label) label.textContent = recoveryMode ? "Recovery code" : "6-digit authenticator code";
        if (code) { code.value=""; code.inputMode=recoveryMode?"text":"numeric"; code.maxLength=recoveryMode?24:6; code.placeholder=recoveryMode?"XXXX-XXXX-XXXX-XXXX":"000000"; }
      };
      modal.querySelectorAll("[data-smart-pin-recovery-mode]").forEach(btn => btn.onclick = () => setMode(btn.dataset.smartPinRecoveryMode));
      code?.addEventListener("input", () => { if (!recoveryMode) code.value = code.value.replace(/\D/g,"").slice(0,6); });
      ["smartPin2faNew","smartPin2faConfirm"].forEach(id => modal.querySelector(`#${id}`)?.addEventListener("input", e => { e.target.value=e.target.value.replace(/\D/g,"").slice(0,6); }));
      modal.querySelector("#smartPin2faReset").onclick = async e => {
        const btn=e.currentTarget, error=modal.querySelector("#smartPin2faError");
        if (error) { error.textContent=""; error.classList.remove("show"); }
        const codeValue=safe(code?.value).trim(), pin=safe(modal.querySelector("#smartPin2faNew")?.value).trim(), confirm=safe(modal.querySelector("#smartPin2faConfirm")?.value).trim();
        try {
          if ((!recoveryMode && !/^\d{6}$/.test(codeValue)) || (recoveryMode && codeValue.replace(/[^A-Z0-9]/gi,"").length<12)) throw new Error(recoveryMode?"Enter one complete recovery code.":"Enter the current six-digit authenticator code.");
          if (!/^\d{4}$|^\d{6}$/.test(pin)) throw new Error("Smart PIN must be exactly 4 or 6 digits.");
          if (pin!==confirm) throw new Error("Smart PIN confirmation does not match.");
          btn.disabled=true;
          const result=await rpc("app_two_factor_recover_smart_pin",{p_code:codeValue,p_new_pin:pin});
          if (result?.ok===false) throw new Error(result.error||"Smart PIN recovery failed.");
          finish(true);
        } catch(err) { if (error) { error.textContent=err?.message||"Smart PIN recovery failed."; error.classList.add("show"); } }
        finally { if (btn?.isConnected) btn.disabled=false; }
      };
      modal.classList.remove("hide"); modal.setAttribute("aria-hidden","false"); setTimeout(()=>code?.focus(),60);
    });
  }

  window.twoFactorSettingsCardHtml = twoFactorSettingsCardHtml;
  window.initTwoFactorSettingsCard = initTwoFactorSettingsCard;
  window.refreshTwoFactorSettingsCard = refreshTwoFactorSettingsCard;
  window.refreshAccountTwoFactorSummary = refreshAccountTwoFactorSummary;
  window.openTwoFactorManagement = openTwoFactorManagement;
  window.requestTwoFactorLogin = requestTwoFactorLogin;
  window.openTwoFactorPasswordRecovery = openPasswordRecovery;
  window.openPasswordRecovery = openPasswordRecovery;
  window.requestSmartPinTwoFactorRecovery = requestSmartPinTwoFactorRecovery;
  window.TriplemTwoFactor = Object.freeze({
    requestLogin: requestTwoFactorLogin,
    openEnrollment: openTwoFactorEnrollment,
    openManagement: openTwoFactorManagement,
    refreshSettings: refreshTwoFactorSettingsCard,
    openPasswordRecovery,
    recoverSmartPin: requestSmartPinTwoFactorRecovery
  });

  const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  if (forgotPasswordBtn && !forgotPasswordBtn.dataset.bound) {
    forgotPasswordBtn.dataset.bound = "1";
    forgotPasswordBtn.addEventListener("click", () => {
      if (typeof window.openUnifiedPasswordRecovery === "function") window.openUnifiedPasswordRecovery();
      else openPasswordRecovery();
    });
  }
})();
