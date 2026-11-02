/* Triplem VIP self-service account recovery — Recovery Key, WebAuthn PRF passkey, trusted-device approval (v130). */
(() => {
  "use strict";

  const safe = value => String(value ?? "");
  const esc = value => {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(safe(value));
    return safe(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  };
  const recoveryDevicePrefix = "triplem.vip.recovery-device.v1:";
  const prfSaltLabel = "Triplem VIP account recovery passkey PRF v1";
  let managerPassword = "";
  let managerPasswordExpiresAt = 0;

  function rpc(name, args = {}) {
    if (typeof window.supabaseRpc !== "function") throw new Error("Secure database connection is unavailable.");
    return window.supabaseRpc(name, args);
  }

  function currentUser() {
    try { if (typeof state !== "undefined" && state?.sessionUser) return state.sessionUser; } catch (_) {}
    return window.state?.sessionUser || null;
  }

  function closeModal(modal) {
    if (!modal) return;
    if (modal._recoveryPollId) {
      clearInterval(modal._recoveryPollId);
      modal._recoveryPollId = null;
    }
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
  }

  function passwordPolicyCheck(password) {
    if (typeof window.assertPasswordPolicy === "function") return window.assertPasswordPolicy(password, "New password");
    const value = safe(password);
    if (value.length < 8 || !/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/\d/.test(value)) {
      throw new Error("Use at least 8 characters with one uppercase letter, one lowercase letter, and one number.");
    }
    return true;
  }

  function bytesToBase64Url(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  }

  function randomBytes(length = 32) {
    const out = new Uint8Array(length);
    crypto.getRandomValues(out);
    return out;
  }

  async function prfSalt() {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(prfSaltLabel)));
  }

  function officialRpId() {
    const host = safe(location.hostname).toLowerCase();
    if (host === "triplem.vip" || host.endsWith(".triplem.vip")) return "triplem.vip";
    if (host === "localhost" || host === "127.0.0.1") return host;
    return host;
  }

  async function assertPasskeyPrfSupport() {
    if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials || !crypto?.subtle) {
      throw new Error("Passkey recovery requires a secure HTTPS browser with WebAuthn support.");
    }
    if (typeof PublicKeyCredential.getClientCapabilities === "function") {
      try {
        const caps = await PublicKeyCredential.getClientCapabilities();
        if (caps && Object.prototype.hasOwnProperty.call(caps, "prf") && caps.prf === false) {
          throw new Error("This browser or authenticator does not support the secure passkey recovery extension. Use Recovery Key, 2FA, or a trusted device instead.");
        }
      } catch (err) {
        if (/does not support/i.test(safe(err?.message))) throw err;
      }
    }
  }

  function deviceStorageKey(userId = currentUser()?.id) {
    return userId ? recoveryDevicePrefix + safe(userId) : "";
  }

  function readLocalRecoveryDevice(userId = currentUser()?.id) {
    const key = deviceStorageKey(userId);
    if (!key) return null;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      if (!parsed || typeof parsed !== "object" || safe(parsed.secret).length < 32) return null;
      return parsed;
    } catch (_) { return null; }
  }

  function writeLocalRecoveryDevice(secret, label, userId = currentUser()?.id) {
    const key = deviceStorageKey(userId);
    if (!key) return;
    localStorage.setItem(key, JSON.stringify({ secret: safe(secret), label: safe(label), createdAt: new Date().toISOString() }));
  }

  function clearLocalRecoveryDevice(userId = currentUser()?.id) {
    const key = deviceStorageKey(userId);
    if (!key) return;
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function browserDeviceLabel() {
    const ua = safe(navigator.userAgent);
    let browser = "Browser";
    if (/Edg\//.test(ua)) browser = "Edge";
    else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = "Chrome";
    else if (/Firefox\//.test(ua)) browser = "Firefox";
    else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = "Safari";
    const platform = safe(navigator.userAgentData?.platform || navigator.platform || "this device").replace(/Win32/i,"Windows");
    return `${browser} on ${platform}`.slice(0,80);
  }

  function formatWhen(value) {
    if (!value) return "";
    try { return new Date(value).toLocaleString(); } catch (_) { return safe(value); }
  }

  function copyText(text) {
    const value = safe(text);
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none;left:-9999px;top:0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } finally { area.remove(); }
    return Promise.resolve();
  }

  function downloadText(filename, text) {
    const blob = new Blob([safe(text)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function ensureUnifiedRecoveryModal() {
    let modal = document.getElementById("unifiedPasswordRecoveryModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "unifiedPasswordRecoveryModal";
      modal.className = "modal hide account-recovery-modal unified-recovery-modal";
      modal.setAttribute("aria-hidden", "true");
      document.body.appendChild(modal);
    }
    return modal;
  }

  function setInlineError(modal, message, id = "unifiedRecoveryError") {
    const el = modal?.querySelector?.(`#${id}`);
    if (!el) return;
    el.textContent = safe(message);
    el.classList.toggle("show", !!message);
  }

  function recoveryMethodCard(icon, title, text, method, badge = "") {
    return `<button type="button" class="recovery-method-card" data-recovery-method="${esc(method)}">
      <span class="recovery-method-icon"><i class="${esc(icon)}" aria-hidden="true"></i></span>
      <span class="recovery-method-copy"><strong>${esc(title)}</strong><small>${esc(text)}</small></span>
      ${badge ? `<span class="recovery-method-badge">${esc(badge)}</span>` : ""}
      <i class="fa-solid fa-chevron-right recovery-method-chevron" aria-hidden="true"></i>
    </button>`;
  }

  function renderUnifiedRecoveryHome(modal, presetUsername = "") {
    if (modal._recoveryPollId) { clearInterval(modal._recoveryPollId); modal._recoveryPollId = null; }
    const preset = safe(presetUsername || document.getElementById("zipUsernameInput")?.value).trim();
    modal.innerHTML = `
      <div class="modal-backdrop" data-unified-recovery-close></div>
      <div class="modal-dialog settings-sheet account-recovery-dialog unified-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="unifiedRecoveryTitle">
        <div class="settings-sheet-head recovery-hero-head">
          <div><p class="two-factor-kicker"><i class="fa-solid fa-life-ring"></i> Account recovery</p><h3 id="unifiedRecoveryTitle">Forgot Password</h3><p>Choose a recovery proof you configured earlier. No email or SMS OTP is required.</p></div>
          <button type="button" class="btn ghost tiny" data-unified-recovery-close aria-label="Close">✕</button>
        </div>
        <div class="modal-body settings-sheet-body account-recovery-body unified-recovery-body">
          <div class="account-recovery-security-note"><i class="fa-solid fa-shield-halved"></i><div><strong>Recovery methods remain independent</strong><span>Triplem VIP does not reveal from this screen whether an account exists or which methods are configured.</span></div></div>
          <label class="settings-field">Username<input id="unifiedRecoveryUsername" class="input settings-input" autocomplete="username" value="${esc(preset)}" placeholder="Your account username" /></label>
          <div class="recovery-method-grid">
            ${recoveryMethodCard("fa-solid fa-mobile-screen-button", "Recover with 2FA", "Use your Authenticator App or a single-use 2FA recovery code.", "2fa", "Existing")}
            ${recoveryMethodCard("fa-solid fa-fingerprint", "Recover with Passkey", "Use a configured passkey with Face ID, Touch ID, Windows Hello or device biometrics.", "passkey")}
            ${recoveryMethodCard("fa-solid fa-key", "Recover with Recovery Key", "Use the high-entropy Triplem VIP Recovery Key you saved offline.", "key")}
            ${recoveryMethodCard("fa-solid fa-laptop", "Approve from another signed-in device", "Approve a matching recovery request from a browser you trusted earlier.", "device")}
            ${recoveryMethodCard("fa-solid fa-headset", "Contact Administrator", "Use Live Support or WhatsApp if no self-service method is available.", "admin")}
          </div>
          <p class="lock-error" id="unifiedRecoveryError"></p>
        </div>
      </div>`;
    const close = () => closeModal(modal);
    modal.querySelectorAll("[data-unified-recovery-close]").forEach(el => el.onclick = close);
    const input = modal.querySelector("#unifiedRecoveryUsername");
    modal.querySelectorAll("[data-recovery-method]").forEach(btn => btn.onclick = async () => {
      const method = btn.dataset.recoveryMethod;
      const username = safe(input?.value).trim();
      setInlineError(modal, "");
      if (!username && method !== "admin") {
        setInlineError(modal, "Enter your username first.");
        input?.focus();
        return;
      }
      btn.disabled = true;
      try {
        if (method === "2fa") {
          closeModal(modal);
          if (typeof window.openTwoFactorPasswordRecovery === "function") return window.openTwoFactorPasswordRecovery(username);
          throw new Error("Authenticator recovery is unavailable. Refresh and try again.");
        }
        if (method === "key") return await startRecoveryKeyFlow(modal, username);
        if (method === "passkey") return await startPasskeyRecoveryFlow(modal, username);
        if (method === "device") return await startTrustedDeviceRecoveryFlow(modal, username);
        if (method === "admin") return renderAdministratorRecovery(modal, username);
      } catch (err) {
        setInlineError(modal, err?.message || "Could not start account recovery.");
      } finally { if (btn?.isConnected) btn.disabled = false; }
    });
    setTimeout(() => input?.focus(), 60);
  }

  async function beginSelfRecovery(username) {
    const result = await rpc("app_account_self_recovery_begin", { p_username: safe(username).trim() });
    if (!result?.challenge_token) throw new Error("Secure recovery could not start.");
    return result.challenge_token;
  }

  function successRecoveryHtml(title, message) {
    return `<div class="modal-backdrop" data-unified-recovery-close></div>
      <div class="modal-dialog settings-sheet account-recovery-dialog account-recovery-success" role="dialog" aria-modal="true">
        <div class="modal-body settings-sheet-body account-recovery-body">
          <div class="two-factor-success"><i class="fa-solid fa-circle-check"></i><div><strong>${esc(title)}</strong><span>${esc(message)}</span></div></div>
          <div class="recovery-success-note"><i class="fa-solid fa-right-to-bracket"></i><span>All previous signed-in sessions were revoked. Sign in again with your new password. If 2FA is enabled, it remains enabled.</span></div>
          <div class="settings-sheet-footer"><button type="button" class="btn primary" data-unified-recovery-close>Return to sign in</button></div>
        </div>
      </div>`;
  }

  function bindSuccessClose(modal) {
    modal.querySelectorAll("[data-unified-recovery-close]").forEach(el => el.onclick = () => {
      const pw = document.getElementById("zipPasswordInput");
      if (pw) pw.value = "";
      closeModal(modal);
    });
  }

  async function startRecoveryKeyFlow(modal, username) {
    const challengeToken = await beginSelfRecovery(username);
    modal.innerHTML = `
      <div class="modal-backdrop" data-unified-recovery-close></div>
      <div class="modal-dialog settings-sheet account-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="recoveryKeyResetTitle">
        <div class="settings-sheet-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-key"></i> Offline recovery proof</p><h3 id="recoveryKeyResetTitle">Recover with Recovery Key</h3><p>Enter the key exactly as you saved it. It will be consumed after a successful password reset.</p></div><button type="button" class="btn ghost tiny" data-unified-recovery-close>✕</button></div>
        <div class="modal-body settings-sheet-body account-recovery-body">
          <label class="settings-field">Recovery Key<input id="recoveryKeyValue" class="input settings-input recovery-key-input" autocomplete="off" spellcheck="false" placeholder="TVIP-XXXXX-XXXXX-…" /></label>
          <div class="recovery-password-grid"><label class="settings-field">New password<input id="recoveryKeyNewPw" class="input settings-input" type="password" autocomplete="new-password" /></label><label class="settings-field">Confirm new password<input id="recoveryKeyConfirmPw" class="input settings-input" type="password" autocomplete="new-password" /></label></div>
          <p class="settings-hint">A used Recovery Key cannot be used again. Generate a fresh one after signing in.</p>
          <p class="lock-error" id="recoveryKeyResetError"></p>
          <div class="settings-sheet-footer"><button type="button" class="btn ghost" id="recoveryKeyBack">Back</button><button type="button" class="btn primary" id="recoveryKeyResetBtn"><i class="fa-solid fa-shield-halved"></i> Reset password</button></div>
        </div>
      </div>`;
    modal.querySelectorAll("[data-unified-recovery-close]").forEach(el => el.onclick = () => closeModal(modal));
    modal.querySelector("#recoveryKeyBack").onclick = () => renderUnifiedRecoveryHome(modal, username);
    modal.querySelector("#recoveryKeyResetBtn").onclick = async e => {
      const btn = e.currentTarget;
      const error = modal.querySelector("#recoveryKeyResetError");
      error.textContent = ""; error.classList.remove("show");
      try {
        const key = safe(modal.querySelector("#recoveryKeyValue")?.value).trim();
        const next = safe(modal.querySelector("#recoveryKeyNewPw")?.value);
        const confirm = safe(modal.querySelector("#recoveryKeyConfirmPw")?.value);
        if (key.replace(/[^A-Za-z0-9]/g,"").length < 32) throw new Error("Enter your complete Triplem VIP Recovery Key.");
        passwordPolicyCheck(next);
        if (next !== confirm) throw new Error("New passwords do not match.");
        btn.disabled = true;
        const result = await rpc("app_account_self_recovery_complete_key", { p_challenge_token: challengeToken, p_recovery_key: key, p_new_password: next });
        if (result?.ok === false) throw new Error(result.error || "Recovery Key could not be verified.");
        modal.innerHTML = successRecoveryHtml("Password reset with Recovery Key", "Your old password is no longer valid. The Recovery Key used for this reset was consumed.");
        bindSuccessClose(modal);
      } catch (err) {
        error.textContent = err?.message || "Could not reset password."; error.classList.add("show");
      } finally { if (btn?.isConnected) btn.disabled = false; }
    };
    setTimeout(() => modal.querySelector("#recoveryKeyValue")?.focus(), 60);
  }

  async function createPasskeyRecoveryProof(user) {
    await assertPasskeyPrfSupport();
    if (!user?.id || !user?.username) throw new Error("Your signed-in account identity is unavailable.");
    const rpId = officialRpId();
    if (!rpId) throw new Error("Passkey recovery requires a valid website origin.");
    const salt = await prfSalt();
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: "Triplem VIP", id: rpId },
        user: { id: new TextEncoder().encode(safe(user.id)), name: safe(user.username), displayName: safe(user.display_name || user.username) },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        timeout: 60000,
        authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
        attestation: "none",
        extensions: { prf: { eval: { first: salt } } }
      }
    });
    if (!credential) throw new Error("Passkey creation was cancelled.");
    const creationExt = credential.getClientExtensionResults?.()?.prf;
    if (creationExt && creationExt.enabled === false) {
      throw new Error("This passkey provider does not support secure PRF recovery. Use another recovery method.");
    }
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        rpId,
        timeout: 60000,
        userVerification: "required",
        allowCredentials: [{ type: "public-key", id: credential.rawId }],
        extensions: { prf: { eval: { first: salt } } }
      }
    });
    const first = assertion?.getClientExtensionResults?.()?.prf?.results?.first;
    if (!assertion?.rawId || !first) {
      throw new Error("Your browser created a passkey, but it did not provide the secure recovery proof required by Triplem VIP. This passkey was not enabled for account recovery.");
    }
    return {
      credentialId: bytesToBase64Url(assertion.rawId),
      prfSecret: bytesToBase64Url(first),
      rpId,
      label: `Passkey · ${browserDeviceLabel()}`.slice(0,80)
    };
  }

  async function getPasskeyRecoveryProof() {
    await assertPasskeyPrfSupport();
    const rpId = officialRpId();
    const salt = await prfSalt();
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        rpId,
        timeout: 60000,
        userVerification: "required",
        extensions: { prf: { eval: { first: salt } } }
      }
    });
    const first = assertion?.getClientExtensionResults?.()?.prf?.results?.first;
    if (!assertion?.rawId || !first) throw new Error("This passkey cannot provide the secure recovery proof required by Triplem VIP.");
    return { credentialId: bytesToBase64Url(assertion.rawId), prfSecret: bytesToBase64Url(first), rpId };
  }

  async function startPasskeyRecoveryFlow(modal, username) {
    const challengeToken = await beginSelfRecovery(username);
    modal.innerHTML = `
      <div class="modal-backdrop" data-unified-recovery-close></div>
      <div class="modal-dialog settings-sheet account-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="passkeyRecoveryTitle">
        <div class="settings-sheet-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-fingerprint"></i> Passkey recovery</p><h3 id="passkeyRecoveryTitle">Verify your passkey</h3><p>Your device may ask for Face ID, Touch ID, Windows Hello, PIN, or another passkey unlock method.</p></div><button type="button" class="btn ghost tiny" data-unified-recovery-close>✕</button></div>
        <div class="modal-body settings-sheet-body account-recovery-body">
          <div class="recovery-passkey-wait"><span class="recovery-passkey-orb"><i class="fa-solid fa-fingerprint"></i></span><strong>Waiting for your passkey</strong><small>Triplem VIP will only continue if the selected passkey produces the recovery proof configured for this account.</small></div>
          <p class="lock-error" id="passkeyRecoveryError"></p>
          <div class="settings-sheet-footer"><button type="button" class="btn ghost" id="passkeyRecoveryBack">Back</button><button type="button" class="btn primary" id="passkeyRecoveryTry"><i class="fa-solid fa-fingerprint"></i> Use passkey</button></div>
        </div>
      </div>`;
    modal.querySelectorAll("[data-unified-recovery-close]").forEach(el => el.onclick = () => closeModal(modal));
    modal.querySelector("#passkeyRecoveryBack").onclick = () => renderUnifiedRecoveryHome(modal, username);
    const run = async () => {
      const error = modal.querySelector("#passkeyRecoveryError");
      const btn = modal.querySelector("#passkeyRecoveryTry");
      error.textContent = ""; error.classList.remove("show");
      try {
        btn.disabled = true;
        const proof = await getPasskeyRecoveryProof();
        renderPasskeyPasswordReset(modal, username, challengeToken, proof);
      } catch (err) {
        error.textContent = err?.message || "Passkey recovery was not completed."; error.classList.add("show");
      } finally { if (btn?.isConnected) btn.disabled = false; }
    };
    modal.querySelector("#passkeyRecoveryTry").onclick = run;
    setTimeout(() => run().catch(() => {}), 120);
  }

  function renderPasskeyPasswordReset(modal, username, challengeToken, proof) {
    modal.innerHTML = `
      <div class="modal-backdrop" data-unified-recovery-close></div>
      <div class="modal-dialog settings-sheet account-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="passkeyPasswordTitle">
        <div class="settings-sheet-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-circle-check"></i> Passkey verified</p><h3 id="passkeyPasswordTitle">Create your new password</h3><p>Passkey proof is held only for this short recovery attempt.</p></div><button type="button" class="btn ghost tiny" data-unified-recovery-close>✕</button></div>
        <div class="modal-body settings-sheet-body account-recovery-body">
          <div class="two-factor-success"><i class="fa-solid fa-fingerprint"></i><div><strong>Passkey unlocked</strong><span>Finish the reset before the recovery challenge expires.</span></div></div>
          <div class="recovery-password-grid"><label class="settings-field">New password<input id="passkeyRecoveryNewPw" class="input settings-input" type="password" autocomplete="new-password" /></label><label class="settings-field">Confirm new password<input id="passkeyRecoveryConfirmPw" class="input settings-input" type="password" autocomplete="new-password" /></label></div>
          <p class="lock-error" id="passkeyPasswordError"></p>
          <div class="settings-sheet-footer"><button type="button" class="btn ghost" id="passkeyPasswordBack">Back</button><button type="button" class="btn primary" id="passkeyPasswordSave">Reset password</button></div>
        </div>
      </div>`;
    modal.querySelectorAll("[data-unified-recovery-close]").forEach(el => el.onclick = () => closeModal(modal));
    modal.querySelector("#passkeyPasswordBack").onclick = () => renderUnifiedRecoveryHome(modal, username);
    modal.querySelector("#passkeyPasswordSave").onclick = async e => {
      const btn = e.currentTarget, error = modal.querySelector("#passkeyPasswordError");
      error.textContent = ""; error.classList.remove("show");
      try {
        const next = safe(modal.querySelector("#passkeyRecoveryNewPw")?.value);
        const confirm = safe(modal.querySelector("#passkeyRecoveryConfirmPw")?.value);
        passwordPolicyCheck(next);
        if (next !== confirm) throw new Error("New passwords do not match.");
        btn.disabled = true;
        const result = await rpc("app_account_self_recovery_complete_passkey", {
          p_challenge_token: challengeToken,
          p_credential_id: proof.credentialId,
          p_prf_secret: proof.prfSecret,
          p_new_password: next
        });
        proof.prfSecret = "";
        if (result?.ok === false) throw new Error(result.error || "Passkey recovery could not be verified.");
        modal.innerHTML = successRecoveryHtml("Password reset with Passkey", "Your passkey verified account ownership without email or SMS OTP.");
        bindSuccessClose(modal);
      } catch (err) {
        error.textContent = err?.message || "Could not reset password."; error.classList.add("show");
      } finally { if (btn?.isConnected) btn.disabled = false; }
    };
    setTimeout(() => modal.querySelector("#passkeyRecoveryNewPw")?.focus(), 60);
  }

  async function startTrustedDeviceRecoveryFlow(modal, username) {
    const challengeToken = await beginSelfRecovery(username);
    const req = await rpc("app_account_self_recovery_device_begin", { p_challenge_token: challengeToken, p_user_agent: navigator.userAgent || "" });
    if (!req?.request_token || !req?.display_code) throw new Error("Trusted-device recovery could not start.");
    renderTrustedDeviceWaiting(modal, username, req.request_token, req.display_code, Number(req.expires_in || 600));
  }

  function renderTrustedDeviceWaiting(modal, username, requestToken, displayCode, expiresIn = 600) {
    if (modal._recoveryPollId) clearInterval(modal._recoveryPollId);
    const localDeadline = Date.now() + Math.max(30, Math.min(900, Number(expiresIn) || 600)) * 1000;
    modal.innerHTML = `
      <div class="modal-backdrop" data-unified-recovery-close></div>
      <div class="modal-dialog settings-sheet account-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="trustedDeviceWaitTitle">
        <div class="settings-sheet-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-laptop"></i> Trusted device approval</p><h3 id="trustedDeviceWaitTitle">Approve from another signed-in device</h3><p>Open Triplem VIP on a browser you previously trusted for recovery.</p></div><button type="button" class="btn ghost tiny" data-unified-recovery-close>✕</button></div>
        <div class="modal-body settings-sheet-body account-recovery-body">
          <div class="recovery-approval-code"><span>Matching code</span><code>${esc(displayCode)}</code><small>On the trusted device: Account Settings → Password recovery → Review recovery requests. Approve only if this code matches.</small></div>
          <div class="recovery-device-steps"><span><b>1</b> Keep this window open.</span><span><b>2</b> Approve the matching code on the trusted signed-in browser.</span><span><b>3</b> This screen will unlock the password reset automatically.</span></div>
          <div class="recovery-poll-status" id="trustedDevicePollStatus"><i class="fa-solid fa-spinner fa-spin"></i><span>Waiting for approval…</span></div>
          <p class="lock-error" id="trustedDeviceWaitError"></p>
          <div class="settings-sheet-footer"><button type="button" class="btn ghost" id="trustedDeviceWaitBack">Back</button><button type="button" class="btn soft" id="trustedDeviceCheckNow">Check now</button></div>
        </div>
      </div>`;
    const stop = () => { if (modal._recoveryPollId) { clearInterval(modal._recoveryPollId); modal._recoveryPollId = null; } };
    modal.querySelectorAll("[data-unified-recovery-close]").forEach(el => el.onclick = () => { stop(); closeModal(modal); });
    modal.querySelector("#trustedDeviceWaitBack").onclick = () => { stop(); renderUnifiedRecoveryHome(modal, username); };
    const check = async () => {
      const statusEl = modal.querySelector("#trustedDevicePollStatus");
      const error = modal.querySelector("#trustedDeviceWaitError");
      if (Date.now() >= localDeadline) {
        stop();
        if (statusEl) statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i><span>Recovery request expired. Start again.</span>`;
        if (error) { error.textContent = "This recovery request is no longer valid."; error.classList.add("show"); }
        return;
      }
      try {
        const result = await rpc("app_account_self_recovery_device_status", { p_request_token: requestToken });
        const status = safe(result?.status || "pending");
        if (status === "approved") {
          stop();
          return renderTrustedDevicePasswordReset(modal, requestToken, displayCode);
        }
        if (status === "expired" || status === "denied" || status === "used") {
          stop();
          if (statusEl) statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i><span>${status === "denied" ? "Request was denied." : "Recovery request expired. Start again."}</span>`;
          if (error) { error.textContent = status === "denied" ? "The trusted device denied this request." : "This recovery request is no longer valid."; error.classList.add("show"); }
        }
      } catch (_) {}
    };
    modal.querySelector("#trustedDeviceCheckNow").onclick = check;
    modal._recoveryPollId = setInterval(() => { if (!modal.classList.contains("hide")) check().catch(() => {}); }, 3000);
    check().catch(() => {});
  }

  function renderTrustedDevicePasswordReset(modal, requestToken, displayCode) {
    modal.innerHTML = `
      <div class="modal-backdrop" data-unified-recovery-close></div>
      <div class="modal-dialog settings-sheet account-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="trustedDeviceResetTitle">
        <div class="settings-sheet-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-circle-check"></i> ${esc(displayCode)} approved</p><h3 id="trustedDeviceResetTitle">Create your new password</h3><p>Your previously trusted signed-in device explicitly approved this recovery request.</p></div><button type="button" class="btn ghost tiny" data-unified-recovery-close>✕</button></div>
        <div class="modal-body settings-sheet-body account-recovery-body">
          <div class="two-factor-success"><i class="fa-solid fa-laptop"></i><div><strong>Trusted device approved</strong><span>Complete the password reset before this short-lived request expires.</span></div></div>
          <div class="recovery-password-grid"><label class="settings-field">New password<input id="trustedDeviceNewPw" class="input settings-input" type="password" autocomplete="new-password" /></label><label class="settings-field">Confirm new password<input id="trustedDeviceConfirmPw" class="input settings-input" type="password" autocomplete="new-password" /></label></div>
          <p class="lock-error" id="trustedDeviceResetError"></p>
          <div class="settings-sheet-footer"><button type="button" class="btn primary" id="trustedDeviceResetBtn">Reset password</button></div>
        </div>
      </div>`;
    modal.querySelectorAll("[data-unified-recovery-close]").forEach(el => el.onclick = () => closeModal(modal));
    modal.querySelector("#trustedDeviceResetBtn").onclick = async e => {
      const btn = e.currentTarget, error = modal.querySelector("#trustedDeviceResetError");
      error.textContent = ""; error.classList.remove("show");
      try {
        const next = safe(modal.querySelector("#trustedDeviceNewPw")?.value);
        const confirm = safe(modal.querySelector("#trustedDeviceConfirmPw")?.value);
        passwordPolicyCheck(next);
        if (next !== confirm) throw new Error("New passwords do not match.");
        btn.disabled = true;
        const result = await rpc("app_account_self_recovery_complete_device", { p_request_token: requestToken, p_new_password: next });
        if (result?.ok === false) throw new Error(result.error || "Trusted-device recovery could not be verified.");
        modal.innerHTML = successRecoveryHtml("Password reset after trusted-device approval", "The approved request was consumed and cannot be reused.");
        bindSuccessClose(modal);
      } catch (err) {
        error.textContent = err?.message || "Could not reset password."; error.classList.add("show");
      } finally { if (btn?.isConnected) btn.disabled = false; }
    };
  }

  function renderAdministratorRecovery(modal, username = "") {
    modal.innerHTML = `
      <div class="modal-backdrop" data-unified-recovery-close></div>
      <div class="modal-dialog settings-sheet account-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="adminRecoveryContactTitle">
        <div class="settings-sheet-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-headset"></i> Assisted recovery</p><h3 id="adminRecoveryContactTitle">Contact Administrator</h3><p>If no self-service recovery proof was configured, the protected Main Admin can verify your registered identity and issue a temporary password.</p></div><button type="button" class="btn ghost tiny" data-unified-recovery-close>✕</button></div>
        <div class="modal-body settings-sheet-body account-recovery-body">
          <div class="account-recovery-security-note"><i class="fa-solid fa-user-shield"></i><div><strong>No existing password is revealed</strong><span>Admin recovery replaces the old password with a temporary credential, revokes active sessions, and forces a new permanent password after sign-in.</span></div></div>
          <div class="recovery-contact-checklist"><span><i class="fa-solid fa-user"></i> Username${username ? `: <b>@${esc(username)}</b>` : ""}</span><span><i class="fa-solid fa-envelope"></i> Registered email address</span><span><i class="fa-solid fa-phone"></i> Registered mobile number</span></div>
          <p class="settings-hint">Never send your password, Smart PIN, Authenticator secret, 2FA recovery code, Passkey recovery proof, or Recovery Key to support.</p>
          <div class="recovery-contact-actions"><button type="button" class="btn primary" id="recoveryOpenLiveSupport"><i class="fa-solid fa-comments"></i> Open Live Support</button><a class="btn soft" href="https://wa.me/923339004564" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i> WhatsApp Admin</a></div>
          <div class="settings-sheet-footer"><button type="button" class="btn ghost" id="adminRecoveryBack">Back</button></div>
        </div>
      </div>`;
    modal.querySelectorAll("[data-unified-recovery-close]").forEach(el => el.onclick = () => closeModal(modal));
    modal.querySelector("#adminRecoveryBack").onclick = () => renderUnifiedRecoveryHome(modal, username);
    modal.querySelector("#recoveryOpenLiveSupport").onclick = () => {
      const panel = document.getElementById("landingLiveChatPanel");
      const launcher = document.getElementById("landingLiveChatLauncher");
      closeModal(modal);
      try { if (typeof window.closeSignInOverlay === "function") window.closeSignInOverlay(); else if (typeof closeSignInOverlay === "function") closeSignInOverlay(); } catch (_) {}
      if (panel && !panel.classList.contains("hide")) return;
      if (launcher) launcher.click();
      else window.open("https://wa.me/923339004564", "_blank", "noopener,noreferrer");
    };
  }

  function openUnifiedPasswordRecovery(presetUsername = "") {
    const modal = ensureUnifiedRecoveryModal();
    renderUnifiedRecoveryHome(modal, presetUsername);
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");
  }

  // ── Account Settings recovery management ─────────────────────────────────
  function ensureRecoveryManagerModal() {
    let modal = document.getElementById("accountRecoveryManagementModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "accountRecoveryManagementModal";
      modal.className = "modal hide account-recovery-modal account-recovery-management-modal";
      modal.setAttribute("aria-hidden", "true");
      document.body.appendChild(modal);
    }
    return modal;
  }

  function managerStatusPill(enabled, enabledText = "Ready", disabledText = "Not set") {
    return `<span class="settings-pill recovery-status-pill ${enabled ? "is-enabled" : ""}">${esc(enabled ? enabledText : disabledText)}</span>`;
  }

  async function fetchRecoveryStatus() {
    const local = readLocalRecoveryDevice();
    return await rpc("app_account_recovery_status", { p_device_secret: local?.secret || null });
  }

  async function fetchTrustedDevices() {
    const local = readLocalRecoveryDevice();
    const result = await rpc("app_account_recovery_trusted_devices", { p_device_secret: local?.secret || null });
    return Array.isArray(result?.devices) ? result.devices : [];
  }

  async function fetchPendingApprovals() {
    const local = readLocalRecoveryDevice();
    if (!local?.secret) return { ok:false, requests:[] };
    try { return await rpc("app_account_recovery_pending_device_requests", { p_device_secret: local.secret }); }
    catch (_) { return { ok:false, requests:[] }; }
  }

  function recoveryKeyOneTimeText(key) {
    return [`Triplem VIP Account Recovery Key`, ``, key, ``, `Keep this key offline and private.`, `It can reset your password once if other recovery methods are unavailable.`, `Triplem VIP stores only a one-way hash and cannot display this key again.`].join("\n");
  }

  function activeManagerPassword(preset = "") {
    const explicit = safe(preset);
    if (explicit) return explicit;
    if (managerPassword && Date.now() < managerPasswordExpiresAt) return managerPassword;
    managerPassword = ""; managerPasswordExpiresAt = 0;
    return "";
  }

  async function askCurrentPassword(title = "Confirm your password", description = "Enter your current password to change recovery security.", preset = "") {
    const authorized = activeManagerPassword(preset);
    if (authorized) return authorized;
    return new Promise(resolve => {
      let modal = document.getElementById("accountRecoveryPasswordConfirmModal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "accountRecoveryPasswordConfirmModal";
        modal.className = "modal hide account-recovery-modal recovery-password-confirm-modal";
        document.body.appendChild(modal);
      }
      modal.innerHTML = `<div class="modal-backdrop" data-recovery-password-cancel></div><div class="modal-dialog settings-sheet recovery-password-confirm-dialog" role="dialog" aria-modal="true"><div class="settings-sheet-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-lock"></i> Re-authentication</p><h3>${esc(title)}</h3><p>${esc(description)}</p></div><button type="button" class="btn ghost tiny" data-recovery-password-cancel>✕</button></div><div class="modal-body settings-sheet-body account-recovery-body"><label class="settings-field">Current password<input id="accountRecoveryCurrentPassword" class="input settings-input" type="password" autocomplete="current-password" /></label><p class="lock-error" id="accountRecoveryPasswordConfirmError"></p><div class="settings-sheet-footer"><button type="button" class="btn ghost" data-recovery-password-cancel>Cancel</button><button type="button" class="btn primary" id="accountRecoveryPasswordConfirmContinue">Continue</button></div></div></div>`;
      let done = false;
      const finish = value => {
        if (done) return; done = true;
        const input = modal.querySelector("#accountRecoveryCurrentPassword");
        if (input) input.value = "";
        closeModal(modal); resolve(value);
      };
      modal.querySelectorAll("[data-recovery-password-cancel]").forEach(el => el.onclick = () => finish(""));
      modal.querySelector("#accountRecoveryPasswordConfirmContinue").onclick = () => {
        const value = safe(modal.querySelector("#accountRecoveryCurrentPassword")?.value);
        if (!value) {
          const error = modal.querySelector("#accountRecoveryPasswordConfirmError"); error.textContent = "Enter your current password."; error.classList.add("show"); return;
        }
        finish(value);
      };
      modal.classList.remove("hide"); modal.setAttribute("aria-hidden","false");
      setTimeout(() => modal.querySelector("#accountRecoveryCurrentPassword")?.focus(), 60);
    });
  }

  async function confirmAction(message, title = "Confirm change") {
    if (typeof window.appConfirmDelete === "function") return !!(await window.appConfirmDelete(message, { title, confirmLabel: "Continue" }));
    return window.confirm(message);
  }

  async function showGeneratedRecoveryKey(parentModal, key, { onboarding = false } = {}) {
    parentModal.innerHTML = `
      <div class="modal-backdrop" data-recovery-manager-close></div>
      <div class="modal-dialog settings-sheet account-recovery-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="generatedRecoveryKeyTitle">
        <div class="settings-sheet-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-key"></i> Shown once</p><h3 id="generatedRecoveryKeyTitle">Save your Recovery Key</h3><p>Triplem VIP stores only a one-way hash. This exact key cannot be displayed again.</p></div></div>
        <div class="modal-body settings-sheet-body account-recovery-manager-body">
          <div class="generated-recovery-key"><span>Your Recovery Key</span><code id="generatedRecoveryKeyValue">${esc(key)}</code><div><button type="button" class="btn soft tiny" id="generatedRecoveryKeyCopy"><i class="fa-regular fa-copy"></i> Copy</button><button type="button" class="btn soft tiny" id="generatedRecoveryKeyDownload"><i class="fa-solid fa-download"></i> Save file</button></div></div>
          <div class="two-factor-recovery-note"><i class="fa-solid fa-triangle-exclamation"></i><span>Anyone who knows this key can use it as an account recovery proof. Keep it offline and never send it to support.</span></div>
          <label class="recovery-saved-confirm"><input type="checkbox" id="generatedRecoveryKeySaved" /><span>I have saved this key somewhere private.</span></label>
          <p class="lock-error" id="generatedRecoveryKeyError"></p>
          <div class="settings-sheet-footer"><button type="button" class="btn primary" id="generatedRecoveryKeyDone">I saved it</button></div>
        </div>
      </div>`;
    parentModal.querySelector("#generatedRecoveryKeyCopy").onclick = async e => {
      await copyText(key); const btn=e.currentTarget; btn.innerHTML='<i class="fa-solid fa-check"></i> Copied'; setTimeout(()=>{ if(btn?.isConnected) btn.innerHTML='<i class="fa-regular fa-copy"></i> Copy'; },1400);
    };
    parentModal.querySelector("#generatedRecoveryKeyDownload").onclick = () => downloadText("Triplem-VIP-Account-Recovery-Key.txt", recoveryKeyOneTimeText(key));
    parentModal.querySelector("#generatedRecoveryKeyDone").onclick = async () => {
      const checked = !!parentModal.querySelector("#generatedRecoveryKeySaved")?.checked;
      if (!checked) {
        const error=parentModal.querySelector("#generatedRecoveryKeyError"); error.textContent="Confirm that you saved the Recovery Key before closing this one-time view."; error.classList.add("show"); return;
      }
      await renderRecoveryManager(parentModal, { onboarding });
    };
  }

  async function setupRecoveryKey(modal, options = {}) {
    const password = await askCurrentPassword("Generate Recovery Key", "Your current password authorizes creation or replacement of this recovery credential.", activeManagerPassword(options.currentPassword));
    if (!password) return;
    const result = await rpc("app_account_recovery_key_generate", { p_password: password });
    if (!result?.recovery_key) throw new Error("Recovery Key could not be generated.");
    await showGeneratedRecoveryKey(modal, result.recovery_key, options);
  }

  async function disableRecoveryKey(modal, options = {}) {
    const proceed = await confirmAction("Turn off Recovery Key recovery? Your current saved key will stop working immediately.", "Disable Recovery Key");
    if (!proceed) return;
    const password = await askCurrentPassword("Disable Recovery Key", "Confirm your current password before revoking the active Recovery Key.", activeManagerPassword(options.currentPassword));
    if (!password) return;
    await rpc("app_account_recovery_key_disable", { p_password: password });
    await renderRecoveryManager(modal, options);
  }

  async function setupPasskeyRecovery(modal, options = {}) {
    const password = await askCurrentPassword("Enable Passkey Recovery", "Your current password authorizes a new passkey recovery credential.", activeManagerPassword(options.currentPassword));
    if (!password) return;
    const proof = await createPasskeyRecoveryProof(currentUser());
    try {
      await rpc("app_account_recovery_passkey_upsert", { p_password: password, p_credential_id: proof.credentialId, p_prf_secret: proof.prfSecret, p_rp_id: proof.rpId, p_label: proof.label });
    } finally { proof.prfSecret = ""; }
    await renderRecoveryManager(modal, options);
  }

  async function disablePasskeyRecovery(modal, options = {}) {
    const proceed = await confirmAction("Disable Passkey password recovery? The passkey may remain in your device password manager, but Triplem VIP will no longer accept it for recovery.", "Disable Passkey Recovery");
    if (!proceed) return;
    const password = await askCurrentPassword("Disable Passkey Recovery", "Confirm your current password before revoking the passkey recovery verifier.", activeManagerPassword(options.currentPassword));
    if (!password) return;
    await rpc("app_account_recovery_passkey_disable", { p_password: password });
    await renderRecoveryManager(modal, options);
  }

  async function trustCurrentRecoveryDevice(modal, options = {}) {
    const password = await askCurrentPassword("Trust this browser", "This browser will receive a random recovery approval secret stored only on this device. Your password authorizes the enrollment.", activeManagerPassword(options.currentPassword));
    if (!password) return;
    const existing = readLocalRecoveryDevice();
    const secret = existing?.secret || bytesToBase64Url(randomBytes(32));
    const label = existing?.label || browserDeviceLabel();
    await rpc("app_account_recovery_trust_device", { p_password: password, p_device_secret: secret, p_label: label, p_user_agent: navigator.userAgent || "" });
    writeLocalRecoveryDevice(secret, label);
    await renderRecoveryManager(modal, options);
  }

  async function revokeTrustedDevice(modal, device, options = {}) {
    const proceed = await confirmAction(`Revoke ${safe(device?.label || "this trusted device")}? It will no longer be allowed to approve password recovery requests.`, "Revoke trusted device");
    if (!proceed) return;
    const password = await askCurrentPassword("Revoke trusted device", "Confirm your current password before removing this recovery approval device.", activeManagerPassword(options.currentPassword));
    if (!password) return;
    await rpc("app_account_recovery_revoke_device", { p_password: password, p_device_id: device.id });
    if (device.current) clearLocalRecoveryDevice();
    await renderRecoveryManager(modal, options);
  }

  async function approvePendingRequest(modal, request, options = {}) {
    const local = readLocalRecoveryDevice();
    if (!local?.secret) throw new Error("This browser is not trusted for recovery approval.");
    const proceed = await confirmAction(`Approve password recovery request ${safe(request.display_code)}? Approve only if this code is visible on your other device.`, "Approve recovery request");
    if (!proceed) return;
    await rpc("app_account_recovery_approve_device_request", { p_request_id: request.id, p_device_secret: local.secret });
    await renderRecoveryManager(modal, options);
  }

  async function denyPendingRequest(modal, request, options = {}) {
    const local = readLocalRecoveryDevice();
    if (!local?.secret) throw new Error("This browser is not trusted for recovery approval.");
    await rpc("app_account_recovery_deny_device_request", { p_request_id: request.id, p_device_secret: local.secret });
    await renderRecoveryManager(modal, options);
  }

  function trustedDevicesHtml(devices) {
    if (!devices.length) return `<p class="recovery-empty-state">No trusted recovery device is registered yet.</p>`;
    return `<div class="trusted-recovery-device-list">${devices.map(d => `<div class="trusted-recovery-device-row"><span class="trusted-recovery-device-icon"><i class="fa-solid fa-laptop"></i></span><span><strong>${esc(d.label || "Trusted browser")}${d.current ? " · This browser" : ""}</strong><small>Trusted ${esc(formatWhen(d.created_at))}${d.last_used_at ? ` · Last used ${esc(formatWhen(d.last_used_at))}` : ""}</small></span><button type="button" class="btn ghost tiny danger-text" data-revoke-recovery-device="${esc(d.id)}" aria-label="Revoke ${esc(d.label || "trusted device")}"><i class="fa-solid fa-trash"></i></button></div>`).join("")}</div>`;
  }

  function pendingRequestsHtml(requests) {
    if (!requests.length) return `<p class="recovery-empty-state">No password recovery request is waiting for this account.</p>`;
    return `<div class="recovery-request-list">${requests.map(r => `<div class="recovery-request-row"><div><span class="recovery-request-code">${esc(r.display_code)}</span><strong>Recovery request</strong><small>${esc(r.user_agent || "Unknown browser")} · ${esc(formatWhen(r.requested_at))}</small></div><div><button type="button" class="btn primary tiny" data-approve-recovery-request="${esc(r.id)}">Approve</button><button type="button" class="btn ghost tiny danger-text" data-deny-recovery-request="${esc(r.id)}">Deny</button></div></div>`).join("")}</div>`;
  }

  async function renderRecoveryManager(modal, options = {}) {
    if (!modal) return;
    const status = await fetchRecoveryStatus();
    const devices = await fetchTrustedDevices();
    const pending = status?.current_device_trusted ? await fetchPendingApprovals() : { requests:[] };
    const requests = Array.isArray(pending?.requests) ? pending.requests : [];
    const onboarding = options.onboarding === true;
    managerPassword = activeManagerPassword(options.currentPassword) || "";
    const readyCount = [status?.two_factor_enabled, status?.recovery_key_enabled, status?.passkey_enabled, status?.trusted_device_count > 0].filter(Boolean).length;
    modal.innerHTML = `
      <div class="modal-backdrop" data-recovery-manager-close></div>
      <div class="modal-dialog settings-sheet account-recovery-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="accountRecoveryManageTitle">
        <div class="settings-sheet-head recovery-manager-head"><div><p class="two-factor-kicker"><i class="fa-solid fa-life-ring"></i> ${onboarding ? "New account protection" : "Account security"}</p><h3 id="accountRecoveryManageTitle">${onboarding ? "Set up password recovery" : "Password recovery"}</h3><p>${onboarding ? "Choose at least one self-service recovery method now, or configure them later from Account Settings." : "Configure independent recovery proofs so a forgotten password does not depend on SMS or email OTP."}</p></div><button type="button" class="btn ghost tiny" data-recovery-manager-close aria-label="Close">✕</button></div>
        <div class="modal-body settings-sheet-body account-recovery-manager-body">
          <div class="recovery-readiness-banner ${readyCount ? "is-ready" : ""}"><span><i class="fa-solid ${readyCount ? "fa-shield-heart" : "fa-triangle-exclamation"}"></i></span><div><strong>${readyCount ? `${readyCount} recovery layer${readyCount===1?"":"s"} configured` : "No self-service recovery layer configured yet"}</strong><small>For resilience, keep at least two independent methods where possible.</small></div></div>

          <section class="settings-card recovery-manager-card">
            <div class="settings-card-head"><span><i class="fa-solid fa-mobile-screen-button"></i> Authenticator App 2FA</span>${managerStatusPill(!!status?.two_factor_enabled, "Enabled", "Optional")}</div>
            <p>Adds a second factor to sign-in and can also recover a forgotten password with an Authenticator code or single-use 2FA recovery code.</p>
            <div class="recovery-manager-actions"><button type="button" class="btn ${status?.two_factor_enabled ? "soft" : "primary"} tiny" id="recoveryManageTwoFactor">${status?.two_factor_enabled ? "Manage 2FA" : "Set up 2FA"}</button></div>
          </section>

          <section class="settings-card recovery-manager-card">
            <div class="settings-card-head"><span><i class="fa-solid fa-key"></i> Recovery Key</span>${managerStatusPill(!!status?.recovery_key_enabled, status?.recovery_key_hint ? `••${status.recovery_key_hint}` : "Ready", "Not set")}</div>
            <p>High-entropy server-generated key. Only a one-way hash is stored. It is shown once and consumed when used for password recovery.</p>
            <div class="recovery-manager-actions"><button type="button" class="btn ${status?.recovery_key_enabled ? "soft" : "primary"} tiny" id="recoveryKeySetupBtn">${status?.recovery_key_enabled ? "Replace key" : "Generate key"}</button>${status?.recovery_key_enabled ? `<button type="button" class="btn ghost tiny danger-text" id="recoveryKeyDisableBtn">Disable</button>` : ""}</div>
          </section>

          <section class="settings-card recovery-manager-card">
            <div class="settings-card-head"><span><i class="fa-solid fa-fingerprint"></i> Passkey Recovery</span>${managerStatusPill(!!status?.passkey_enabled, "Enabled", "Not set")}</div>
            <p>On supported browsers, a passkey unlocked with Face ID, Touch ID, Windows Hello or device biometrics derives a recovery proof through WebAuthn PRF. Triplem VIP stores only its hash.</p>
            <div class="recovery-manager-actions"><button type="button" class="btn ${status?.passkey_enabled ? "soft" : "primary"} tiny" id="recoveryPasskeySetupBtn">${status?.passkey_enabled ? "Replace passkey" : "Set up passkey"}</button>${status?.passkey_enabled ? `<button type="button" class="btn ghost tiny danger-text" id="recoveryPasskeyDisableBtn">Disable</button>` : ""}</div>
            ${status?.passkey_enabled ? `<small class="recovery-card-footnote">${esc(status.passkey_label || "Passkey")} · ${esc(status.passkey_rp_id || "triplem.vip")}</small>` : `<small class="recovery-card-footnote">Requires a PRF-capable WebAuthn passkey provider. Unsupported browsers can use the other methods.</small>`}
          </section>

          <section class="settings-card recovery-manager-card recovery-manager-card--devices">
            <div class="settings-card-head"><span><i class="fa-solid fa-laptop"></i> Trusted signed-in devices</span>${managerStatusPill((status?.trusted_device_count || 0)>0, `${status?.trusted_device_count || 0} trusted`, "None")}</div>
            <p>A recovery request can be approved only by a browser you explicitly trusted earlier. A valid signed-in session and that browser's random local recovery secret are both required.</p>
            <div class="recovery-manager-actions">${status?.current_device_trusted ? `<span class="recovery-current-device-ok"><i class="fa-solid fa-circle-check"></i> This browser is trusted</span>` : `<button type="button" class="btn primary tiny" id="recoveryTrustThisDeviceBtn"><i class="fa-solid fa-laptop"></i> Trust this browser</button>`}<button type="button" class="btn soft tiny" id="recoveryRefreshRequestsBtn"><i class="fa-solid fa-rotate"></i> Refresh requests</button></div>
            ${trustedDevicesHtml(devices)}
            <div class="recovery-pending-wrap"><div class="recovery-subhead"><strong>Pending recovery approvals</strong>${requests.length ? `<span>${requests.length}</span>` : ""}</div>${status?.current_device_trusted ? pendingRequestsHtml(requests) : `<p class="recovery-empty-state">Trust this browser first to review and approve recovery requests.</p>`}</div>
          </section>

          <section class="settings-card recovery-manager-card recovery-manager-card--fallback">
            <div class="settings-card-head"><span><i class="fa-solid ${currentUser()?.is_protected === true ? "fa-database" : "fa-headset"}"></i> ${currentUser()?.is_protected === true ? "Project-owner fallback" : "Administrator fallback"}</span><span class="settings-pill">${currentUser()?.is_protected === true ? "Emergency" : "Available"}</span></div>
            <p>${currentUser()?.is_protected === true ? "For the protected Main Admin, no subordinate administrator can replace the password. If every configured self-service proof is lost, recovery requires verified Supabase project-owner access; Triplem VIP intentionally provides no hidden application backdoor." : "If every self-service proof is unavailable, the protected Main Admin can verify the registered username, email and mobile number and issue a temporary password. Existing passwords are never revealed."}</p>
          </section>

          <p class="lock-error" id="recoveryManagerError"></p>
          <div class="settings-sheet-footer recovery-manager-footer"><button type="button" class="btn ${onboarding ? "soft" : "ghost"}" data-recovery-manager-close>${onboarding ? "Set up later" : "Close"}</button>${onboarding ? `<button type="button" class="btn primary" id="recoveryManagerDone">Done</button>` : ""}</div>
        </div>
      </div>`;

    const close = () => { managerPassword = ""; managerPasswordExpiresAt = 0; closeModal(modal); try { window.refreshAccountRecoverySummary?.(); } catch (_) {} };
    modal.querySelectorAll("[data-recovery-manager-close]").forEach(el => el.onclick = close);
    modal.querySelector("#recoveryManagerDone")?.addEventListener("click", close);
    const run = async fn => {
      const err = modal.querySelector("#recoveryManagerError"); if (err) { err.textContent=""; err.classList.remove("show"); }
      try { await fn(); } catch (ex) { if (err) { err.textContent=ex?.message || "Recovery setting could not be updated."; err.classList.add("show"); } }
    };
    modal.querySelector("#recoveryManageTwoFactor")?.addEventListener("click", () => {
      if (typeof window.openTwoFactorManagement === "function") window.openTwoFactorManagement();
    });
    modal.querySelector("#recoveryKeySetupBtn")?.addEventListener("click", () => run(() => setupRecoveryKey(modal, options)));
    modal.querySelector("#recoveryKeyDisableBtn")?.addEventListener("click", () => run(() => disableRecoveryKey(modal, options)));
    modal.querySelector("#recoveryPasskeySetupBtn")?.addEventListener("click", () => run(() => setupPasskeyRecovery(modal, options)));
    modal.querySelector("#recoveryPasskeyDisableBtn")?.addEventListener("click", () => run(() => disablePasskeyRecovery(modal, options)));
    modal.querySelector("#recoveryTrustThisDeviceBtn")?.addEventListener("click", () => run(() => trustCurrentRecoveryDevice(modal, options)));
    modal.querySelector("#recoveryRefreshRequestsBtn")?.addEventListener("click", () => run(() => renderRecoveryManager(modal, options)));
    modal.querySelectorAll("[data-revoke-recovery-device]").forEach(btn => btn.onclick = () => {
      const device = devices.find(d => safe(d.id) === safe(btn.dataset.revokeRecoveryDevice));
      if (device) run(() => revokeTrustedDevice(modal, device, options));
    });
    modal.querySelectorAll("[data-approve-recovery-request]").forEach(btn => btn.onclick = () => {
      const request = requests.find(r => safe(r.id) === safe(btn.dataset.approveRecoveryRequest));
      if (request) run(() => approvePendingRequest(modal, request, options));
    });
    modal.querySelectorAll("[data-deny-recovery-request]").forEach(btn => btn.onclick = () => {
      const request = requests.find(r => safe(r.id) === safe(btn.dataset.denyRecoveryRequest));
      if (request) run(() => denyPendingRequest(modal, request, options));
    });
  }

  async function openAccountRecoveryManagement(options = {}) {
    if (!currentUser()?.id) throw new Error("Sign in to manage password recovery.");
    const modal = ensureRecoveryManagerModal();
    const initialPassword = safe(options.currentPassword || "");
    managerPassword = initialPassword;
    managerPasswordExpiresAt = initialPassword ? Date.now() + 5 * 60 * 1000 : 0;
    const managerOptions = { ...options, currentPassword: "" };
    modal.innerHTML = `<div class="modal-backdrop"></div><div class="modal-dialog settings-sheet account-recovery-manager-dialog"><div class="modal-body settings-sheet-body account-recovery-manager-body"><div class="recovery-loading-state"><i class="fa-solid fa-spinner fa-spin"></i><strong>Loading recovery security…</strong></div></div></div>`;
    modal.classList.remove("hide"); modal.setAttribute("aria-hidden","false");
    try { await renderRecoveryManager(modal, managerOptions); }
    catch (err) {
      modal.innerHTML = `<div class="modal-backdrop" data-recovery-manager-close></div><div class="modal-dialog settings-sheet account-recovery-manager-dialog"><div class="modal-body settings-sheet-body account-recovery-manager-body"><div class="account-recovery-security-note"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>Recovery settings could not load</strong><span>${esc(err?.message || "Check your connection and database migration.")}</span></div></div><div class="settings-sheet-footer"><button class="btn primary" data-recovery-manager-close>Close</button></div></div></div>`;
      modal.querySelectorAll("[data-recovery-manager-close]").forEach(el => el.onclick = () => closeModal(modal));
    }
  }

  async function refreshAccountRecoverySummary(accountModal = document.getElementById("accountSettingsModal")) {
    const text = accountModal?.querySelector?.("#accountRecoverySummaryText");
    const pill = accountModal?.querySelector?.("#accountRecoverySummaryPill");
    if (!text || !pill || !currentUser()?.id) return;
    pill.textContent = "Checking…"; pill.classList.remove("is-enabled");
    text.textContent = "Checking self-service recovery protection…";
    try {
      const status = await fetchRecoveryStatus();
      const methods = [];
      if (status?.two_factor_enabled) methods.push("2FA");
      if (status?.passkey_enabled) methods.push("Passkey");
      if (status?.recovery_key_enabled) methods.push("Recovery Key");
      if ((status?.trusted_device_count || 0) > 0) methods.push("Trusted device");
      if (methods.length) {
        pill.textContent = `${methods.length} ready`; pill.classList.add("is-enabled");
        text.textContent = `${methods.join(" · ")} configured for password recovery.`;
      } else {
        pill.textContent = "Set up";
        text.textContent = "Add a Recovery Key, passkey, 2FA or trusted-device approval.";
      }
    } catch (_) {
      pill.textContent = "Unavailable";
      text.textContent = "Recovery settings could not be checked.";
    }
  }

  async function openPostSignupRecoverySetup({ currentPassword = "" } = {}) {
    if (!currentUser()?.id) return;
    try { await openAccountRecoveryManagement({ onboarding:true, currentPassword:safe(currentPassword) }); }
    catch (_) {}
  }

  // Unified Forgot Password entry point. The original Authenticator-only flow is
  // preserved separately as openTwoFactorPasswordRecovery by 03-two-factor.js.
  window.openUnifiedPasswordRecovery = openUnifiedPasswordRecovery;
  window.openPasswordRecovery = openUnifiedPasswordRecovery;
  window.openAccountRecoveryManagement = openAccountRecoveryManagement;
  window.refreshAccountRecoverySummary = refreshAccountRecoverySummary;
  window.openPostSignupRecoverySetup = openPostSignupRecoverySetup;
  window.TriplemAccountRecovery = Object.freeze({
    open: openUnifiedPasswordRecovery,
    manage: openAccountRecoveryManagement,
    refreshSummary: refreshAccountRecoverySummary,
    postSignup: openPostSignupRecoverySetup,
    createPasskeyProof: createPasskeyRecoveryProof,
    getPasskeyProof: getPasskeyRecoveryProof,
    readTrustedDevice: readLocalRecoveryDevice,
    writeTrustedDevice: writeLocalRecoveryDevice,
    clearTrustedDevice: clearLocalRecoveryDevice,
    browserDeviceLabel,
    copyText
  });
})();
