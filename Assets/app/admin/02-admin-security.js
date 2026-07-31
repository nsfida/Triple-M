/* Admin Security Key — default protected admin only. Additive; does not alter other admin features. */

const adminSecurityState = {
  applies: false,
  configured: false,
  unlocked: false,
  checking: false,
  bound: false
};

function isAdminSecurityKeyError(err){
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("admin security key required")
    || msg.includes("invalid security key")
    || msg.includes("security key must be exactly");
}

function normalizeAdminSecurityKey(value){
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function bindAdminSecurityKeyInput(input){
  if (!input || input.dataset.adminSecurityBound === "1") return;
  input.dataset.adminSecurityBound = "1";
  input.addEventListener("input", () => {
    const digits = normalizeAdminSecurityKey(input.value);
    if (input.value !== digits) input.value = digits;
  });
  input.addEventListener("paste", e => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    input.value = normalizeAdminSecurityKey(text);
  });
}

function setAdminSecurityLockVisible(show){
  const lock = document.getElementById("adminSecurityLock");
  const content = document.getElementById("adminPanelContent");
  if (!lock || !content) return;
  lock.classList.toggle("hide", !show);
  lock.hidden = !show;
  lock.setAttribute("aria-hidden", show ? "false" : "true");
  content.classList.toggle("hide", !!show);
  if (show) {
    const err = document.getElementById("adminSecurityUnlockError");
    if (err) err.textContent = "";
    const input = document.getElementById("adminSecurityUnlockInput");
    if (input) {
      input.value = "";
      setTimeout(() => input.focus(), 30);
    }
  }
}

function updateAdminSecurityKeyButtonVisibility(){
  const btn = document.getElementById("adminSecurityKeyBtn");
  if (!btn) return;
  const show = typeof isProtectedAdminSession === "function" && isProtectedAdminSession();
  btn.classList.toggle("hide", !show);
}

function resetAdminSecuritySettingsForm(root = document){
  ["adminSecurityCurrentKeyInput", "adminSecurityNewKeyInput", "adminSecurityConfirmKeyInput"].forEach(id => {
    const el = root.querySelector ? root.querySelector(`#${id}`) : document.getElementById(id);
    if (el) el.value = "";
  });
  const err = root.querySelector ? root.querySelector("#adminSecuritySettingsError") : document.getElementById("adminSecuritySettingsError");
  const status = root.querySelector ? root.querySelector("#adminSecuritySettingsStatus") : document.getElementById("adminSecuritySettingsStatus");
  if (err) err.textContent = "";
  if (status) status.textContent = "";
}

function closeAdminSecurityKeyModal(){
  const modal = document.getElementById("adminSecurityKeyModal");
  if (!modal) return;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

async function openAdminSecurityKeyModal(){
  if (typeof isProtectedAdminSession === "function" && !isProtectedAdminSession()) {
    alert("Admin Security Key is only available for the default administrator.");
    return;
  }

  let status = {};
  try {
    status = await fetchAdminSecurityKeyStatus();
  } catch (err) {
    alert(err?.message || "Could not load security key status.");
    return;
  }
  if (status?.unavailable) {
    alert("Run migration 084_admin_security_key.sql to enable Admin Security Key.");
    return;
  }

  const configured = !!status?.configured;
  adminSecurityState.configured = configured;

  let modal = document.getElementById("adminSecurityKeyModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "adminSecurityKeyModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-backdrop" data-admin-security-key-close></div>
    <div class="modal-dialog admin-modal-dialog settings-sheet admin-security-key-dialog" role="dialog" aria-modal="true" aria-labelledby="adminSecurityKeyTitle">
      <div class="settings-sheet-head">
        <div>
          <h3 id="adminSecurityKeyTitle">${configured ? "Change security key" : "Create security key"}</h3>
          <p>${configured ? "Enter current key, then set a new 15-digit key." : "Set a 15-digit key to protect the Admin tab."}</p>
        </div>
        <button type="button" class="btn ghost tiny" data-admin-security-key-close aria-label="Close">✕</button>
      </div>
      <div class="modal-body settings-sheet-body">
        <div class="admin-security-key-fields">
          <div class="field${configured ? "" : " hide"}" id="adminSecurityCurrentKeyField">
            <label class="form-label" for="adminSecurityCurrentKeyInput">Current key</label>
            <input id="adminSecurityCurrentKeyInput" class="input admin-security-key-input" type="password" inputmode="numeric" maxlength="15" autocomplete="off" placeholder="Current 15-digit key" />
          </div>
          <div class="field">
            <label class="form-label" for="adminSecurityNewKeyInput">New 15-digit key</label>
            <input id="adminSecurityNewKeyInput" class="input admin-security-key-input" type="password" inputmode="numeric" maxlength="15" autocomplete="off" placeholder="···············" />
          </div>
          <div class="field">
            <label class="form-label" for="adminSecurityConfirmKeyInput">Confirm new key</label>
            <input id="adminSecurityConfirmKeyInput" class="input admin-security-key-input" type="password" inputmode="numeric" maxlength="15" autocomplete="off" placeholder="···············" />
          </div>
        </div>
        <p id="adminSecuritySettingsError" class="admin-security-error" role="alert" aria-live="polite"></p>
        <p id="adminSecuritySettingsStatus" class="admin-security-status" aria-live="polite"></p>
        <div class="modal-footer settings-sheet-footer">
          <button type="button" class="btn ghost tiny" data-admin-security-key-close>Cancel</button>
          <button type="button" class="btn primary tiny" id="adminSecuritySaveKeyBtn">
            <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> ${configured ? "Update key" : "Save key"}
          </button>
        </div>
      </div>
    </div>`;

  modal.querySelectorAll("[data-admin-security-key-close]").forEach(el => {
    el.onclick = () => closeAdminSecurityKeyModal();
  });

  [
    "adminSecurityCurrentKeyInput",
    "adminSecurityNewKeyInput",
    "adminSecurityConfirmKeyInput"
  ].forEach(id => {
    const input = modal.querySelector(`#${id}`);
    if (input) {
      input.dataset.adminSecurityBound = "";
      bindAdminSecurityKeyInput(input);
    }
  });

  modal.querySelector("#adminSecuritySaveKeyBtn").onclick = async () => {
    const errEl = modal.querySelector("#adminSecuritySettingsError");
    const statusEl = modal.querySelector("#adminSecuritySettingsStatus");
    const btn = modal.querySelector("#adminSecuritySaveKeyBtn");
    if (errEl) errEl.textContent = "";
    if (statusEl) statusEl.textContent = "";
    if (btn) btn.disabled = true;
    try {
      const result = await saveAdminSecurityKeyFromForm(modal);
      if (statusEl) {
        statusEl.textContent = result?.updated
          ? "Security key updated."
          : "Security key saved.";
      }
      setTimeout(() => closeAdminSecurityKeyModal(), 650);
    } catch (e) {
      if (errEl) errEl.textContent = e?.message || "Could not save security key.";
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  modal.querySelector("#adminSecurityConfirmKeyInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      modal.querySelector("#adminSecuritySaveKeyBtn")?.click();
    }
  });

  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  const focusId = configured ? "adminSecurityCurrentKeyInput" : "adminSecurityNewKeyInput";
  setTimeout(() => modal.querySelector(`#${focusId}`)?.focus(), 40);
}

async function fetchAdminSecurityKeyStatus(){
  if (typeof isProtectedAdminSession === "function" && !isProtectedAdminSession()) {
    adminSecurityState.applies = false;
    adminSecurityState.configured = false;
    adminSecurityState.unlocked = true;
    return { applies: false, configured: false, unlocked: true };
  }
  try {
    const status = await supabaseRpc("app_admin_security_key_status", {});
    adminSecurityState.applies = status?.applies !== false;
    adminSecurityState.configured = !!status?.configured;
    adminSecurityState.unlocked = !!status?.unlocked;
    return status || {};
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (msg.includes("could not find the function") || msg.includes("pgrst202") || msg.includes("404")) {
      adminSecurityState.applies = false;
      adminSecurityState.configured = false;
      adminSecurityState.unlocked = true;
      return { applies: false, configured: false, unlocked: true, unavailable: true };
    }
    throw err;
  }
}

async function lockAdminSecuritySession({ silent = true } = {}){
  if (typeof isProtectedAdminSession === "function" && !isProtectedAdminSession()) return;
  if (!adminSecurityState.configured && !adminSecurityState.applies) return;
  try {
    await supabaseRpc("app_admin_security_key_lock", {});
  } catch (err) {
    if (!silent) throw err;
  } finally {
    adminSecurityState.unlocked = false;
  }
}

async function unlockAdminSecurityWithKey(rawKey){
  const key = normalizeAdminSecurityKey(rawKey);
  if (key.length !== 15) {
    throw new Error("Enter the full 15-digit security key.");
  }
  const result = await supabaseRpc("app_admin_security_key_unlock", { p_key: key });
  adminSecurityState.configured = true;
  adminSecurityState.unlocked = true;
  return result;
}

async function saveAdminSecurityKeyFromForm(root = document){
  const q = (id) => (root.querySelector ? root.querySelector(`#${id}`) : document.getElementById(id));
  const currentEl = q("adminSecurityCurrentKeyInput");
  const newEl = q("adminSecurityNewKeyInput");
  const confirmEl = q("adminSecurityConfirmKeyInput");

  const newKey = normalizeAdminSecurityKey(newEl?.value);
  const confirmKey = normalizeAdminSecurityKey(confirmEl?.value);
  const currentKey = normalizeAdminSecurityKey(currentEl?.value);

  if (newKey.length !== 15) throw new Error("New security key must be exactly 15 digits.");
  if (newKey !== confirmKey) throw new Error("New key and confirmation do not match.");
  if (adminSecurityState.configured && currentKey.length !== 15) {
    throw new Error("Enter your current 15-digit key to update it.");
  }

  const result = await supabaseRpc("app_admin_security_key_set", {
    p_new_key: newKey,
    p_current_key: adminSecurityState.configured ? currentKey : null
  });
  adminSecurityState.configured = true;
  adminSecurityState.unlocked = true;
  adminSecurityState.applies = true;
  resetAdminSecuritySettingsForm(root);
  return result;
}

/**
 * Gate Admin tab for the default protected admin.
 * Returns true when Admin content may load; false when lock UI is showing.
 */
async function ensureAdminSecurityAccess(){
  const lock = document.getElementById("adminSecurityLock");
  const content = document.getElementById("adminPanelContent");
  if (!lock || !content) return true;

  updateAdminSecurityKeyButtonVisibility();

  if (typeof isProtectedAdminSession === "function" && !isProtectedAdminSession()) {
    adminSecurityState.applies = false;
    adminSecurityState.configured = false;
    adminSecurityState.unlocked = true;
    setAdminSecurityLockVisible(false);
    return true;
  }

  adminSecurityState.checking = true;
  try {
    const status = await fetchAdminSecurityKeyStatus();
    updateAdminSecurityKeyButtonVisibility();
    if (status?.unavailable) {
      setAdminSecurityLockVisible(false);
      return true;
    }

    if (!status?.configured) {
      setAdminSecurityLockVisible(false);
      return true;
    }

    adminSecurityState.unlocked = false;
    setAdminSecurityLockVisible(true);
    return false;
  } catch (err) {
    console.warn("Admin security status failed:", err);
    setAdminSecurityLockVisible(false);
    return true;
  } finally {
    adminSecurityState.checking = false;
  }
}

async function handleAdminSecurityUnlockClick(){
  const input = document.getElementById("adminSecurityUnlockInput");
  const err = document.getElementById("adminSecurityUnlockError");
  const btn = document.getElementById("adminSecurityUnlockBtn");
  if (err) err.textContent = "";
  if (btn) btn.disabled = true;
  try {
    await unlockAdminSecurityWithKey(input?.value);
    setAdminSecurityLockVisible(false);
    updateAdminSecurityKeyButtonVisibility();
    if (typeof loadAdminUsers === "function") {
      await loadAdminUsers();
    }
    if (typeof refreshAdminCommsBadges === "function") {
      refreshAdminCommsBadges().catch(() => {});
    }
  } catch (e) {
    if (err) err.textContent = e?.message || "Invalid security key.";
    if (input) {
      input.value = "";
      input.focus();
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function bindAdminSecurityUi(){
  if (adminSecurityState.bound) return;
  adminSecurityState.bound = true;

  bindAdminSecurityKeyInput(document.getElementById("adminSecurityUnlockInput"));

  document.getElementById("adminSecurityUnlockBtn")?.addEventListener("click", () => {
    handleAdminSecurityUnlockClick();
  });
  document.getElementById("adminSecurityUnlockInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdminSecurityUnlockClick();
    }
  });

  document.getElementById("adminSecurityKeyBtn")?.addEventListener("click", () => {
    openAdminSecurityKeyModal().catch(err => alert(err?.message || err));
  });

  updateAdminSecurityKeyButtonVisibility();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindAdminSecurityUi);
} else {
  bindAdminSecurityUi();
}
