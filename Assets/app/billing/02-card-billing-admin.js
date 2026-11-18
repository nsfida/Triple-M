/* Triplem VIP · Admin › Card Payments (2026-11-18)
 *
 * The Main Admin (protected administrator) switches card payments through Paddle on or off for
 * everyone. While off, users see the card option marked "Coming soon" and pay by bank transfer;
 * the accounts on the test list can already pay by card. Changing the switch needs the unlocked
 * Admin Security Key AND the admin's current password (checked by the server, migration 235);
 * every change is recorded. Payments, renewals and refunds of existing card plans always continue.
 */
(function initTriplemCardBillingAdmin(global){
  "use strict";

  const DP = () => global.TriplemDetailPanels || null;
  const esc = v => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const avatar = icon => `<span class="tm-dp-txico tm-ap-ico" style="--t:var(--primary,#2563eb)"><i class="${icon}"></i></span>`;
  const when = v => { if (!v) return "—"; try { return new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (_) { return String(v); } };
  const money = (a, c) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: String(c || "USD").toUpperCase() }).format(Number(a) || 0); } catch (_) { return `${c} ${a}`; } };
  const isMainAdmin = () => { try { return !!(state.sessionUser && state.sessionUser.role === "admin" && state.sessionUser.is_protected === true); } catch (_) { return false; } };
  const keyLocked = msg => /security key/i.test(String(msg || ""));

  async function open(){
    const dp = DP(); const k = dp?.kit;
    if (!dp?.custom?.open || !k || !isMainAdmin()) return false;
    const st = { loading: true, err: "", data: null, payments: null, want: null, testers: "", pw: "", note: "", saving: false };

    async function load(){
      st.loading = true; st.err = ""; dp.custom.render({ keepScroll: true });
      try {
        st.data = await supabaseRpc("app_admin_card_billing_get", {});
        st.want = st.data.enabled ? "on" : "off";
        st.testers = (st.data.test_usernames || []).join(", ");
      } catch (e) { st.err = String(e?.message || e || "Could not load card payments."); }
      st.loading = false; dp.custom.render({ keepScroll: true });
    }
    async function loadPayments(){
      if (st.payments) return;
      try { st.payments = (await supabaseRpc("app_admin_list_card_payments", { p_limit: 50 }))?.items || []; }
      catch (e) { st.payments = []; st.err = String(e?.message || e || ""); }
      dp.custom.render({ keepScroll: true });
    }
    async function save(){
      if (st.saving) return;
      const enable = st.want === "on";
      if (!st.pw) { dp.toast("Enter your current password to confirm.", false); return; }
      st.saving = true; dp.custom.render({ keepScroll: true });
      try {
        const testers = st.testers.split(/[\s,;]+/).map(t => t.replace(/^@/, "").trim()).filter(Boolean);
        await supabaseRpc("app_admin_card_billing_set", { p_enabled: enable, p_password: st.pw, p_test_usernames: testers, p_note: st.note || null });
        st.pw = ""; st.note = ""; st.saving = false;
        try { await global.TriplemCardPayments?.refreshStatus?.(true); } catch (_) {}
        dp.toast(enable ? "Card payments are ON for everyone." : "Card payments are OFF. Users see “Coming soon”.");
        await load();
      } catch (e) {
        st.pw = ""; st.saving = false;
        dp.custom.render({ keepScroll: true });
        dp.toast(String(e?.message || e || "Could not save."), false);
      }
    }

    const lockedNote = () => k.note(`The Admin Security Key is locked. Unlock it, then open Card Payments again. ${k.btn("cb-unlock", "Unlock", "fa-solid fa-lock-open", { primary: true })}`, "warn", "fa-solid fa-lock");

    dp.custom.open({
      icon: "card",
      tabs: [["switch", "Switch", "fa-solid fa-toggle-on"], ["payments", "Payments", "fa-solid fa-receipt"], ["history", "History", "fa-solid fa-clock-rotate-left"]],
      tab: "switch", state: st,
      head: () => {
        const on = !!st.data?.enabled;
        return { title: "Card Payments", avatar: avatar("fa-regular fa-credit-card"), sub: "Paddle · Merchant of Record",
          pills: st.data ? [k.pill(on ? "ON" : "OFF", on ? "ok" : "muted", on ? "fa-solid fa-circle-check" : "fa-solid fa-circle-pause")] : [] };
      },
      render(tab){
        if (st.loading) return k.skel(6);
        if (st.err && keyLocked(st.err)) return lockedNote();
        if (st.err && !st.data) return k.note(esc(st.err), "warn", "fa-solid fa-triangle-exclamation") + k.btn("cb-retry", "Try again", "fa-solid fa-rotate");
        const d = st.data || {};
        if (tab === "payments") {
          if (!st.payments) { loadPayments(); return k.skel(5); }
          if (!st.payments.length) return k.empty("No card payments yet.");
          return k.section("Latest card payments", `<ul class="tm-cb-list">${st.payments.map(p => `
            <li><div><b>${esc(money(p.amount, p.currency))}</b><small>@${esc(p.username || "—")} · ${esc(p.period === "yearly" ? "Pro Yearly" : "Pro Monthly")} · ${esc(when(p.paid_at))}</small></div>
              ${k.pill(p.status === "completed" ? "Paid" : p.status === "refunded" ? "Refunded" : p.status === "charged_back" ? "Charged back" : "Part refunded", p.status === "completed" ? "ok" : "muted")}</li>`).join("")}</ul>`);
        }
        if (tab === "history") {
          const h = d.history || [];
          if (!h.length) return k.empty("No changes yet.");
          return k.section("Changes", `<ul class="tm-cb-list">${h.map(x => `
            <li><div><b>${x.to ? "Switched ON" : "Switched OFF"}${x.from === x.to ? " (test list changed)" : ""}</b><small>@${esc(x.by || "—")} · ${esc(when(x.at))}${(x.testers || []).length ? ` · test: ${esc(x.testers.join(", "))}` : ""}${x.note ? ` · ${esc(x.note)}` : ""}</small></div>
              ${k.pill(x.to ? "ON" : "OFF", x.to ? "ok" : "muted")}</li>`).join("")}</ul>`);
        }
        const on = !!d.enabled, want = st.want, changed = (want === "on") !== on || st.testers.split(/[\s,;]+/).filter(Boolean).join(",").toLowerCase() !== (d.test_usernames || []).join(",");
        return k.statusCard(on ? "Card payments are ON" : "Card payments are OFF",
            on ? "Every user can pay for Pro by card at sign-up and in Plan &amp; Subscription." : "Users see the card option marked “Coming soon” and pay by bank transfer.", on ? "ok" : "plain")
          + k.stats([[esc(String(d.payments ?? 0)), "Card payments"], [esc(String(d.active_subscriptions ?? 0)), "Active card renewals"], [esc(String((d.test_usernames || []).length)), "Test accounts"]])
          + k.kv([["Last change", d.updated_by ? `${esc(when(d.updated_at))} · @${esc(d.updated_by)}` : "—"], ["Paddle", esc(global.TriplemCardPayments?.config?.env === "production" ? "Live" : "Sandbox (test)")]])
          + k.section("Change", `
            <div class="tm-cb-seg" role="radiogroup" aria-label="Card payments">
              <button type="button" class="tm-cb-opt${want === "on" ? " is-on" : ""}" role="radio" aria-checked="${want === "on"}" data-dp-act="cb-want" data-v="on"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> On</button>
              <button type="button" class="tm-cb-opt${want === "off" ? " is-on" : ""}" role="radio" aria-checked="${want === "off"}" data-dp-act="cb-want" data-v="off"><i class="fa-solid fa-circle-pause" aria-hidden="true"></i> Off</button>
            </div>
            <label class="tm-cb-field"><span>Test accounts <em>can pay by card while off</em></span><input class="input" data-cb="testers" value="${esc(st.testers)}" placeholder="username, username" autocomplete="off" spellcheck="false" /></label>
            <label class="tm-cb-field"><span>Note <em>optional</em></span><input class="input" data-cb="note" value="${esc(st.note)}" maxlength="300" autocomplete="off" /></label>
            <label class="tm-cb-field"><span>Your current password</span><input class="input" type="password" data-cb="pw" autocomplete="current-password" /></label>
            <div class="tm-ap-foot">
              ${changed ? `<span class="tm-ap-dirty"><i class="fa-solid fa-circle" aria-hidden="true"></i> ${want === "on" && !on ? "Will switch ON for everyone" : want === "off" && on ? "Will switch OFF" : "Test list changed"}</span>` : `<span class="tm-ap-dirty is-clean"><i class="fa-solid fa-check" aria-hidden="true"></i> Saved</span>`}
              ${k.btn("cb-save", st.saving ? "Saving…" : "Save", "fa-solid fa-shield-halved", { primary: true, disabled: st.saving, danger: want === "off" && on })}
            </div>`)
          + k.note("Payments, renewals and refunds of existing card plans continue whatever the switch says. Before switching on, the Paddle account must be approved.", "info");
      },
      onInput(e){
        const f = e.target.closest?.("[data-cb]"); if (!f) return;
        st[f.dataset.cb] = f.value;
      },
      actions: {
        "cb-want": b => { st.want = b.dataset.v; st.pw = ""; dp.custom.render({ keepScroll: true }); },
        "cb-save": () => save(),
        "cb-retry": () => load(),
        "cb-unlock": () => { dp.close(); setTimeout(() => document.getElementById("adminSecurityKeyBtn")?.click() || document.getElementById("adminSecurityUnlockBtn")?.click(), 0); }
      }
    });
    load();
    return true;
  }

  function bind(){
    const btn = document.getElementById("adminCardPaymentsBtn");
    if (!btn || btn.dataset.cbBound) return;
    btn.dataset.cbBound = "1";
    btn.addEventListener("click", () => { open(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true }); else bind();

  global.TriplemCardBillingAdmin = Object.freeze({ open });
})(window);
