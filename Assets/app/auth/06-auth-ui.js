/* Triplem VIP Build 140 — unified sign-in surface + global password visibility control. */
(() => {
  "use strict";

  const safe = value => String(value ?? "");
  let activeKind = "";
  let activeHost = null;
  let activeCancel = null;

  function signInOverlay() { return document.getElementById("signInOverlay"); }
  function signInPanel() { return document.getElementById("login"); }
  function overlayVisible() {
    const overlay = signInOverlay();
    return !!(overlay && !overlay.classList.contains("hide") && overlay.getAttribute("aria-hidden") !== "true");
  }

  function ensureStageHost() {
    const panel = signInPanel();
    if (!panel) return null;
    let host = panel.querySelector(":scope > .triplem-auth-inline-stage");
    if (!host) {
      host = document.createElement("div");
      host.className = "triplem-auth-inline-stage";
      host.hidden = true;
      panel.appendChild(host);
    }
    return host;
  }

  function begin(kind = "security", { cancel = null } = {}) {
    if (!overlayVisible()) return null;
    const panel = signInPanel();
    const host = ensureStageHost();
    if (!panel || !host) return null;
    if (!activeKind) {
      const rect = panel.getBoundingClientRect();
      if (rect.height > 0) panel.style.setProperty("--triplem-auth-panel-height", `${Math.round(rect.height)}px`);
    }
    activeKind = safe(kind) || "security";
    activeHost = host;
    activeCancel = typeof cancel === "function" ? cancel : null;
    host.hidden = false;
    host.dataset.authStageKind = activeKind;
    panel.classList.add("triplem-auth-stage-active");
    panel.dataset.authStageKind = activeKind;
    return host;
  }

  function reset({ keepVisible = true } = {}) {
    const panel = signInPanel();
    const host = activeHost || panel?.querySelector?.(":scope > .triplem-auth-inline-stage");
    if (host) {
      host.innerHTML = "";
      host.hidden = true;
      host.removeAttribute("data-auth-stage-kind");
    }
    if (panel) {
      panel.classList.remove("triplem-auth-stage-active");
      panel.removeAttribute("data-auth-stage-kind");
      panel.style.removeProperty("--triplem-auth-panel-height");
    }
    activeKind = "";
    activeHost = null;
    activeCancel = null;
    if (!keepVisible) {
      const overlay = signInOverlay();
      if (overlay) {
        overlay.classList.add("hide");
        overlay.setAttribute("aria-hidden", "true");
      }
    }
  }

  function cancelActive() {
    if (!activeKind) return false;
    const fn = activeCancel;
    activeCancel = null;
    try { if (fn) fn(); } catch (_) {}
    reset({ keepVisible: true });
    return true;
  }

  function isHost(node) { return !!node?.classList?.contains("triplem-auth-inline-stage"); }
  function isActive(kind = "") { return !!activeKind && (!kind || activeKind === kind); }
  function setCancelHandler(fn) { activeCancel = typeof fn === "function" ? fn : null; }

  function recoveryShell(title, subtitle, body) {
    return `
      <div class="triplem-auth-stage-shell triplem-auth-recovery-stage">
        <button class="triplem-auth-stage-back" type="button" data-sec-recovery-top-back aria-label="Go back" title="Back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
        <div class="login-panel-top triplem-auth-stage-brand">
          <img src="Assets/logo/logo.png" alt="Triplem VIP" />
          <div><p class="login-kicker">Account recovery</p><h3>${safe(title)}</h3></div>
        </div>
        <p class="login-panel-copy">${safe(subtitle)}</p>
        <div class="triplem-auth-stage-scroll">${body}</div>
      </div>`;
  }

  function bindBack(host, handler) {
    const btn = host?.querySelector?.("[data-sec-recovery-top-back]");
    if (!btn) return;
    btn.hidden = false;
    btn.onclick = typeof handler === "function" ? handler : () => reset({ keepVisible: true });
  }

  function beginRecovery() {
    return begin("recovery", { cancel: () => reset({ keepVisible: true }) });
  }

  function smartPinMarkup() {
    return `
      <div class="triplem-auth-stage-shell triplem-auth-smartpin-stage">
        <button class="triplem-auth-stage-back" type="button" data-smartpin-inline-back aria-label="Back to sign in" title="Back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
        <div class="login-panel-top triplem-auth-stage-brand" id="secretPinGateHead">
          <img src="Assets/logo/logo.png" alt="Triplem VIP" />
          <div><p class="login-kicker">Workspace security</p><h3 id="secretPinGateHeading">Smart Pin</h3></div>
        </div>
        <p class="login-panel-copy" id="secretPinGateSubtitle">Enter your Smart Pin to load your data.</p>
        <div class="triplem-auth-stage-scroll">
          <div class="secret-pin-dialog triplem-inline-secret-pin-dialog">
            <form id="secretPinGateForm" class="login-form triplem-inline-smartpin-form">
              <div class="modal-grid">
                <div id="secretPinGateLockPanel" class="field w12 secret-pin-lock-panel hide" aria-live="polite">
                  <div class="secret-pin-lock-icon" aria-hidden="true"><i class="fa-solid fa-lock"></i></div>
                  <p id="secretPinGateLockTitle" class="secret-pin-lock-title">Access Locked</p>
                  <p id="secretPinGateLockHint" class="secret-pin-lock-hint"></p>
                  <div id="secretPinGateCountdown" class="secret-pin-countdown hide" aria-atomic="true">
                    <span class="secret-pin-countdown-label">Try again in</span>
                    <span id="secretPinGateCountdownValue" class="secret-pin-countdown-value">03:00</span>
                  </div>
                  <p id="secretPinGateWhatsApp" class="secret-pin-whatsapp hide">Contact admin on WhatsApp <a href="https://wa.me/923339004564" target="_blank" rel="noopener noreferrer">+92 333 900 4564</a> to restore your access.</p>
                  <div id="secretPinAdminRecoverWrap" class="secret-pin-admin-recover hide">
                    <label for="secretPinAdminRecoverKey">Admin Security Key</label>
                    <input id="secretPinAdminRecoverKey" class="input" type="password" inputmode="numeric" maxlength="15" autocomplete="off" placeholder="15-digit admin key" />
                    <button class="btn soft" id="secretPinAdminRecoverBtn" type="button">Reopen Smart PIN access</button>
                  </div>
                </div>
                <div id="secretPinGateEntry" class="field w12">
                  <label for="secretPinGateInput" class="form-label">Smart Pin</label>
                  <input id="secretPinGateInput" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="4 or 6 digits" />
                  <div id="secretPinGateError" class="secret-pin-error" role="alert" aria-live="polite"></div>
                </div>
                <div id="secretPinGateActions" class="field w12 secret-pin-actions secret-pin-gate-actions triplem-inline-smartpin-actions">
                  <button class="btn primary" id="secretPinUnlockBtn" type="submit">Unlock</button>
                  <div class="secret-pin-text-actions">
                    <button class="secret-pin-text-btn" id="secretPinForgotBtn" type="button">Forgot Smart Pin</button>
                    <button class="secret-pin-text-btn" id="secretPinGateLogoutBtn" type="button">Logout</button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>`;
  }

  function beginSmartPin() {
    const host = begin("smart-pin");
    if (!host) return null;
    host.innerHTML = smartPinMarkup();
    return host;
  }

  function finishSmartPin(ok) {
    if (!isActive("smart-pin")) return;
    if (!ok) reset({ keepVisible: true });
    else {
      // Keep the verified Smart PIN stage in place until the successful login
      // closes the sign-in overlay. Clear cancellation so closing the overlay
      // after successful authentication can never trigger logout.
      activeCancel = null;
      const host = activeHost;
      if (host) host.classList.add("is-complete");
    }
  }

  // ── One compact eye control inside every password input ──────────────────
  const PASSWORD_SHELL_CLASS = "triplem-password-shell";
  function existingLegacyEye(parent, input) {
    if (!parent) return null;
    const id = input?.id || "";
    return parent.querySelector?.(`.pw-eye-btn[data-toggle-form-pw="${CSS.escape(id)}"],#${id ? CSS.escape(id + "Toggle") : "__none__"},.pw-eye-btn`) || null;
  }

  function enhancePasswordInput(input) {
    if (!(input instanceof HTMLInputElement)) return;
    if (input.dataset.triplemPasswordEye === "1") return;
    if (input.type !== "password" && input.dataset.triplemPasswordVisible !== "1") return;
    input.dataset.triplemPasswordEye = "1";

    const originalParent = input.parentElement;
    let shell;
    if (originalParent?.classList?.contains("input-wrapper")) {
      shell = originalParent;
      shell.classList.add(PASSWORD_SHELL_CLASS);
    } else if (originalParent?.classList?.contains(PASSWORD_SHELL_CLASS)) {
      shell = originalParent;
    } else {
      shell = document.createElement("span");
      shell.className = PASSWORD_SHELL_CLASS;
      originalParent?.insertBefore(shell, input);
      shell.appendChild(input);
    }
    if (originalParent && originalParent !== shell) originalParent.classList.add("triplem-password-row-enhanced");

    // Keep legacy controls in the DOM for compatibility with older bindings,
    // but remove them visually. The new control is always positioned in-field.
    const legacy = existingLegacyEye(originalParent, input);
    if (legacy && !legacy.classList.contains("triplem-password-eye")) {
      legacy.classList.add("triplem-password-eye-legacy");
      legacy.setAttribute("aria-hidden", "true");
      legacy.tabIndex = -1;
    }

    let button = shell.querySelector(":scope > .triplem-password-eye");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "triplem-password-eye";
      button.setAttribute("aria-label", "Show password");
      button.title = "Show password";
      button.innerHTML = '<i class="fa-solid fa-eye" aria-hidden="true"></i>';
      shell.appendChild(button);
    }
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      input.dataset.triplemPasswordVisible = visible ? "0" : "1";
      button.setAttribute("aria-label", visible ? "Show password" : "Hide password");
      button.title = visible ? "Show password" : "Hide password";
      const icon = button.querySelector("i");
      if (icon) icon.className = visible ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
      try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
      const end = input.value?.length || 0;
      try { input.setSelectionRange(end, end); } catch (_) {}
    };
  }

  function scanPasswordInputs(root = document) {
    if (root instanceof HTMLInputElement) enhancePasswordInput(root);
    root.querySelectorAll?.('input[type="password"],input[data-triplem-password-visible="1"]').forEach(enhancePasswordInput);
  }

  function installPasswordObserver() {
    scanPasswordInputs(document);
    if (document.documentElement.dataset.triplemPasswordEyeObserver === "1") return;
    document.documentElement.dataset.triplemPasswordEyeObserver = "1";
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) scanPasswordInputs(node);
        }
      }
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  window.TriplemAuthSurface = {
    begin,
    beginRecovery,
    recoveryShell,
    bindBack,
    beginSmartPin,
    finishSmartPin,
    reset,
    cancelActive,
    isHost,
    isActive,
    setCancelHandler,
    enhancePasswords: scanPasswordInputs
  };

  const boot = () => installPasswordObserver();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
