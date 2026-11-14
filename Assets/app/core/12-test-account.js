/* Triplem VIP protected test accounts (2026-11-14).
 *
 * A shared test account (khawrai_pro, Khawrai Professionals) is signed in by many people.
 * Everything stays visible and usable: adding entries and editing work as usual. Changing
 * the account's security (password, Smart PIN, authenticator, passkeys, recovery, username)
 * and deleting records or wallets / emptying the Recycle Bin are stopped with a short
 * explanation before anything happens.
 *
 * The server enforces the same rules (migration 226, hint TRIPLEM_TEST_ACCOUNT); this file
 * gives the friendly message first and is a second safety net for the database calls.
 * The account list comes from the server (app_my_account_restrictions); khawrai_pro is also
 * known here so the protection works even before migration 226 is applied.
 */
(function initTriplemTestAccount(global){
  "use strict";

  const KNOWN = new Set(["khawrai_pro"]);
  const HINT = "TRIPLEM_TEST_ACCOUNT";

  let serverFlag = null;      // true / false once asked; null = not asked for this session
  let askedFor = "";

  function st(){ try { return typeof state !== "undefined" ? state : global.state; } catch (_) { return global.state; } }
  function sessionKey(){ const s = st(); return String(s?.sessionUser?.id || ""); }
  function username(){ const s = st(); return String(s?.sessionUser?.username || s?.currentUsername || "").trim().toLowerCase(); }

  function isTestAccount(){
    const s = st();
    if (!s?.unlocked || !s?.sessionUser) return false;
    if (KNOWN.has(username())) return true;
    askServer();
    return serverFlag === true;
  }
  function askServer(){
    const key = sessionKey();
    if (!key || askedFor === key || typeof global.supabaseRpc !== "function") return;
    askedFor = key; serverFlag = null;
    Promise.resolve(originalRpc ? originalRpc("app_my_account_restrictions", {}) : null)
      .then(r => { if (sessionKey() === key) serverFlag = !!(r && r.test_account); syncBadge(); })
      .catch(() => { /* database without migration 226: only the built-in list applies */ });
  }

  // ── Message ───────────────────────────────────────────────────────────────
  const TEXT = {
    security: { title: "Security settings are locked", body: "This is a shared test account used by the Khawrai Professionals team. To keep it available for everyone, its password, Smart PIN, authenticator, passkeys, recovery options and sign-in details cannot be changed." },
    delete: { title: "Deleting is not available", body: "This is a shared test account used by the Khawrai Professionals team. To keep the test data complete for everyone, records and wallets cannot be deleted and the Recycle Bin cannot be emptied." }
  };
  let noticeEl = null;
  function notice(kind = "delete"){
    const t = TEXT[kind] || TEXT.delete;
    if (!noticeEl) {
      noticeEl = document.createElement("div");
      noticeEl.className = "tm-test-notice";
      noticeEl.setAttribute("role", "alertdialog");
      noticeEl.setAttribute("aria-modal", "true");
      noticeEl.setAttribute("aria-labelledby", "tmTestNoticeTitle");
      noticeEl.setAttribute("aria-describedby", "tmTestNoticeBody");
      noticeEl.innerHTML = `
        <div class="tm-test-notice-backdrop" data-tm-test-close></div>
        <div class="tm-test-notice-card">
          <span class="tm-test-notice-icon" aria-hidden="true"><i class="fa-solid fa-shield-halved"></i></span>
          <span class="tm-test-notice-kicker">Test account</span>
          <h3 id="tmTestNoticeTitle"></h3>
          <p id="tmTestNoticeBody"></p>
          <ul class="tm-test-notice-allowed" aria-label="What you can do">
            <li><i class="fa-solid fa-check" aria-hidden="true"></i>Add new entries in every section</li>
            <li><i class="fa-solid fa-check" aria-hidden="true"></i>Edit existing records</li>
            <li><i class="fa-solid fa-check" aria-hidden="true"></i>View reports, download PDF and CSV</li>
          </ul>
          <button type="button" class="tm-test-notice-ok" data-tm-test-close>OK, understood</button>
        </div>`;
      noticeEl.addEventListener("click", e => { if (e.target.closest("[data-tm-test-close]")) closeNotice(); });
      noticeEl.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); closeNotice(); } });
      document.body.appendChild(noticeEl);
    }
    noticeEl.querySelector("#tmTestNoticeTitle").textContent = t.title;
    noticeEl.querySelector("#tmTestNoticeBody").textContent = t.body;
    noticeEl.classList.add("is-open");
    requestAnimationFrame(() => noticeEl.querySelector(".tm-test-notice-ok")?.focus({ preventScroll: true }));
  }
  function closeNotice(){ noticeEl?.classList.remove("is-open"); }

  // ── What is stopped (before anything happens) ──────────────────────────────
  const SECURITY_SELECTOR = [
    "#securityChangePassword", "#securityManage2fa", "#securitySetupPasskey", "#securityManageSmartPin",
    "#securityRemoveSmartPin", "#securityManageRecovery", "#securityTrustCurrent", "#securityRemoveOtherTrustedBrowsers",
    "#securitySignOutOthers", "#securityDeleteLoginHistory", "#securityQuickToggle", "#securityPinBypassToggle",
    "[data-revoke-session]", "[data-revoke-2fa-device]", "#secretPinBtn", "#deleteSmartPinBtn",
    "#accountProfileEditBtn", "#weakPasswordBannerBtn"
  ].join(",");
  const DELETE_WORDS = /\b(delete|deleted|remove|empty|purge|erase|permanently)\b/i;
  const DELETE_ICONS = "i.fa-trash, i.fa-trash-can, i.fa-trash-alt, i.fa-dumpster, i.fa-eraser";

  function labelOf(el){
    return [el.textContent, el.getAttribute("title"), el.getAttribute("aria-label")].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  function classify(target){
    const el = target.closest?.("button, [role='menuitem'], [role='button'], a, label, input[type='checkbox']");
    if (!el || el.closest(".tm-test-notice")) return null;
    if (el.matches(SECURITY_SELECTOR) || el.closest(SECURITY_SELECTOR)) return "security";
    // A card or row that only contains a delete button is not itself a delete control.
    if (el.querySelector("button, a[href], [role='menuitem'], [role='button']")) return null;
    if (el.id === "emptyRecycleBinBtn" || el.closest("#emptyRecycleBinBtn")) return "delete";
    // Removing a line or a picture inside a form that is being filled in is editing, not deleting.
    if (el.closest("form") && !/\bdelete\b/i.test(labelOf(el))) return null;
    if (el.closest(".dgs, .ws-switch-menu, .home-style-panel, .expenses-style-panel, #walletLogoPickerModal")) return null;
    const text = labelOf(el);
    if (/\b(restore|undo|cancel|close)\b/i.test(text) && !/\bdelete\b/i.test(text)) return null;
    if (DELETE_WORDS.test(text) || el.matches(DELETE_ICONS) || el.querySelector(DELETE_ICONS)) return "delete";
    return null;
  }
  function onActivate(e){
    if (!isTestAccount()) return;
    const kind = classify(e.target);
    if (!kind) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    notice(kind);
  }
  document.addEventListener("click", onActivate, true);
  document.addEventListener("change", e => {
    if (!isTestAccount() || !e.target.matches?.(SECURITY_SELECTOR)) return;
    e.stopImmediatePropagation();
    if ("checked" in e.target) e.target.checked = !e.target.checked;
    notice("security");
  }, true);

  // ── Safety net for the database calls ───────────────────────────────────────
  const RPC_SECURITY = /^app_(change_password|set_smart_pin|clear_smart_pin|two_factor_(begin_setup|confirm_setup|begin_replacement|regenerate_recovery_codes|disable)|account_security_set_standard_biometric_preferences|account_recovery_.*(set|create|rotate|revoke|remove|delete).*|account_security_revoke.*|revoke_.*session.*|sign_out_other.*)$/;
  const RPC_DELETE = /^app_.*(delete|purge|empty_recycle|remove)_?/;
  function refused(kind, message){
    notice(kind);
    const err = new Error(message || (kind === "security" ? TEXT.security.body : TEXT.delete.body));
    err.code = HINT; err.hint = HINT; err.testAccount = true; err.permanent = true;
    return err;
  }
  let originalRpc = null;
  function wrap(){
    if (typeof global.supabaseRpc === "function" && !global.supabaseRpc.__tmTest) {
      originalRpc = global.supabaseRpc;
      const rpc = function(fnName, args, options){
        if (isTestAccount()) {
          const n = String(fnName || "");
          if (RPC_SECURITY.test(n)) return Promise.reject(refused("security"));
          if (RPC_DELETE.test(n) && !/^app_(delete_my_notification|delete_my_inquiry)$/.test(n)) return Promise.reject(refused("delete"));
        }
        return originalRpc.apply(this, arguments).catch(err => {
          if (String(err?.hint || err?.message || "").includes(HINT) || /shared test account/i.test(String(err?.message || ""))) notice(/password|pin|passkey|authenticator|recovery/i.test(String(err?.message)) ? "security" : "delete");
          throw err;
        });
      };
      rpc.__tmTest = true;
      global.supabaseRpc = rpc;
    }
    if (typeof global.supabase === "function" && !global.supabase.__tmTest) {
      const original = global.supabase;
      const rest = function(path, options = {}){
        if (isTestAccount()) {
          const method = String(options?.method || "GET").toUpperCase();
          const body = typeof options?.body === "string" ? options.body : "";
          if (method === "DELETE" || (method === "PATCH" && /"is_deleted"\s*:\s*true/.test(body))) {
            return Promise.reject(refused("delete"));
          }
        }
        return original.apply(this, arguments);
      };
      rest.__tmTest = true;
      global.supabase = rest;
    }
  }

  // ── Small badge in the account menu so testers know where they are ─────────
  function syncBadge(){
    const on = isTestAccount();
    document.documentElement.classList.toggle("tm-test-account", on);
    const host = document.getElementById("accountMenuUserName");
    if (!host) return;
    let badge = document.getElementById("tmTestAccountBadge");
    if (on && !badge) {
      badge = document.createElement("span");
      badge.id = "tmTestAccountBadge";
      badge.className = "tm-test-badge";
      badge.textContent = "Test account";
      host.after(badge);
    } else if (!on && badge) badge.remove();
  }

  function start(){ wrap(); syncBadge(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  global.addEventListener("load", wrap);
  document.addEventListener("click", e => { if (e.target.closest?.("#accountMenuBtn, [data-entry-menu='account']")) syncBadge(); }, true);
  setInterval(() => { if (st()?.unlocked && !document.hidden) { wrap(); syncBadge(); } }, 10000);

  global.TriplemTestAccount = Object.freeze({ isTestAccount, notice, classify, KNOWN });
})(typeof window !== "undefined" ? window : globalThis);
