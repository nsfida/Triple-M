/* Triplem VIP · Notifications in the side panel (2026-11-18)
 *
 * A notification opened from the bell (or the desktop notification centre) shows in the app's
 * side panel instead of a centred overlay:
 *   • Subscription decisions (bank transfer approved / declined) – status, plan, amount, expiry,
 *     bonus, bank, administrator note; Plan & Subscription, Billing and Email billing.
 *   • Card billing events (paid, refunded, renewal stopped, payment failed) – amount, card,
 *     invoice, active-until; Invoice, Manage billing, Plan & Subscription.
 *   • Member access requests – person, email, phone, message; Open conversation, Email, WhatsApp.
 *   • Everything else – the message, its fields and its actions (accept / decline a live chat,
 *     review a payment, open a user, open a reminder…), Copy and Delete.
 * A "Recent" tab lists the other notifications so they can be read one after another.
 * The existing functions (runNotificationAction, the RPCs) do the work; the previous overlays stay
 * as a fallback when the side panel is not available.
 */
(function initTriplemNotificationPanels(global){
  "use strict";

  const DP = () => global.TriplemDetailPanels || null;
  const esc = v => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const call = (name, ...a) => { try { const f = global[name]; return typeof f === "function" ? f(...a) : undefined; } catch (_) { return undefined; } };
  const payloadOf = n => call("notificationPayloadObject", n) || {};
  const when = v => { if (!v) return "—"; try { return new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (_) { return String(v); } };
  const ago = v => call("formatRelativeTime", v) || "";
  const expiry = v => (v ? (call("formatTrialExpiry", v) || when(v)) : "—");
  const money = (a, c) => { try { return regionalMoneyHtml(a, c || "USD"); } catch (_) { return esc(`${c || ""} ${a}`); } };
  const planName = p => (p === "yearly" ? "Pro Yearly" : p === "monthly" ? "Pro Monthly" : "Pro");
  const TONES = { warn: "#d97706", renewal: "#d97706", inquiry: "#0891b2", ok: "#16a34a", danger: "#dc2626" };
  const all = () => { try { return Array.isArray(adminCommsState?.notifications) ? adminCommsState.notifications : []; } catch (_) { return []; } };

  let def = null, st = null;
  const isOpen = () => !!def && DP()?.custom?.current?.() === def;
  const paint = () => { if (isOpen()) DP().custom.render({ keepScroll: true }); };

  function kindOf(n){
    const p = payloadOf(n), type = String(p.type || "").toLowerCase();
    if (call("isSubscriptionUserNotification", n) && type.startsWith("subscription_card_")) return "card";
    if (call("isSubscriptionUserNotification", n) && call("notificationSource", n) === "user") return "subscription";
    if (n?.kind === "inquiry" && call("isMemberAccessRequestNotification", n) && n.related_inquiry_id) return "access";
    return "generic";
  }

  // ── data for the rich kinds (loaded once per notification, skeleton meanwhile) ──────────
  async function loadExtra(n, kind){
    const p = payloadOf(n);
    try {
      if (kind === "subscription" && p.request_id) st.extra = call("unwrapRpcJson", await supabaseRpc("app_my_subscription_request_details", { p_request_id: String(p.request_id) })) || null;
      else if (kind === "card") {
        const b = await global.TriplemCardPayments?.billing?.();
        st.extra = { bill: b || null, payment: (b?.payments || []).find(x => String(x.id) === String(p.payment_id || "")) || null };
      } else if (kind === "access") {
        st.extra = await supabaseRpc("app_get_inquiry_thread", { p_inquiry_id: n.related_inquiry_id });
        try { call("noteMessagingLocalMutation"); call("refreshAdminCommsBadges")?.catch?.(() => {}); } catch (_) {}
      }
    } catch (e) { st.extraErr = String(e?.message || e || ""); }
    st.loaded = true;
    paint();
  }

  // ── renderers ────────────────────────────────────────────────────────────────────────
  const K = () => DP().kit;
  const acts = list => `<div class="tm-dp-txacts">${list.filter(Boolean).join("")}</div>`;
  const hero = (cls, label, big, sub) => `<div class="tm-dp-txhero ${cls}"><small>${esc(label)}</small><strong>${big}</strong>${sub ? `<span>${sub}</span>` : ""}</div>`;
  const loading = () => hero("is-transfer", "Loading", "&nbsp;", "") + K().skel(5);
  const copyDelete = () => [K().btn("nf-copy", "Copy", "fa-regular fa-copy"), K().btn("nf-delete", "Delete", "fa-solid fa-trash", { danger: true })];

  function subscriptionView(n){
    const k = K(), p = payloadOf(n), d = st.extra || {};
    if (!st.loaded && p.request_id) return loading();
    const type = String(p.type || "").toLowerCase();
    const approved = type === "subscription_approved" || d.status === "approved";
    const declined = type === "subscription_declined" || d.status === "declined";
    const plan = planName(d.plan || p.plan);
    const promo = Number(d.promotion_months ?? p.promotion_months ?? 0) || 0;
    const until = d.proposed_expires_at || p.expires_at || null;
    const current = d.access?.trial_expires_at || null;
    const note = String(d.admin_note || p.admin_note || "").trim();
    const text = call("localizeServerDates", n.body) || n.body || "";
    return hero(approved ? "is-in" : declined ? "" : "is-transfer", approved ? "Approved" : declined ? "Declined" : "Subscription update", esc(plan), esc(text))
      + k.section("Details", k.kv([
        ["Decision", k.pill(approved ? "Approved" : declined ? "Declined" : "Update", approved ? "ok" : declined ? "bad" : "info")],
        ["Plan", esc(plan)],
        d.amount != null ? ["Payment", money(d.amount, d.currency)] : null,
        ["Request", esc(d.request_context === "renewal" ? "Plan extension" : "New Pro signup")],
        approved && until ? ["Activated until", esc(expiry(until))] : null,
        !approved && current ? ["Current access until", esc(expiry(current))] : null,
        promo ? ["Promotion", esc(`+${promo} bonus month${promo === 1 ? "" : "s"}`)] : null,
        d.payment_bank ? ["Paid to", esc(String(d.payment_bank) === "enbd" ? "Emirates NBD" : String(d.payment_bank).toUpperCase())] : null,
        ["Decision time", esc(when(d.resolved_at || n.created_at))]
      ]))
      + (note ? k.section("Administrator note", k.note(esc(note), declined ? "warn" : "info", "fa-solid fa-user-shield")) : "")
      + (declined ? k.note(esc("You can submit a new payment from Plan & Subscription, or email billing@triplem.vip if you have questions."), "info") : "")
      + k.section("Actions", acts([k.btn("nf-plan", declined ? "Try again" : "Plan & Subscription", "fa-solid fa-crown", { primary: true }), k.btn("nf-billing", "Billing", "fa-solid fa-file-invoice"),
          `<a class="aum-btn" href="mailto:billing@triplem.vip"><i class="fa-regular fa-envelope" aria-hidden="true"></i> ${esc("Email billing")}</a>`, ...copyDelete()]));
  }

  function cardView(n){
    const k = K(), p = payloadOf(n);
    if (!st.loaded) return loading();
    const type = String(p.type || "").toLowerCase();
    const kind = type.startsWith("subscription_card_paid") ? "paid" : type.startsWith("subscription_card_refunded") ? "refunded" : type.startsWith("subscription_card_cancelled") ? "cancelled" : type.startsWith("subscription_card_past_due") ? "failed" : "other";
    const pay = st.extra?.payment || null, sub = st.extra?.bill?.subscription || null;
    const plan = planName(pay?.period || p.plan);
    const until = p.expires_at || pay?.new_expires_at || null;
    const promo = Number(pay?.promotion_months ?? p.promotion_months ?? 0) || 0;
    const label = { paid: "Payment received", refunded: "Payment refunded", cancelled: "Renewal stopped", failed: "Renewal payment failed", other: "Card billing" }[kind];
    const text = kind === "paid" ? (until ? `Thank you. Your ${plan} card payment was received. Pro is active until ${expiry(until)}.` : `Thank you. Your ${plan} card payment was received.`)
      : kind === "refunded" ? (until ? `Your card payment was refunded. Pro access now ends ${expiry(until)}.` : "Your card payment was refunded.")
      : (call("localizeServerDates", n.body) || n.body || "");
    const card = pay?.card_last4 ? `${String(pay.card_brand || "Card").replace(/^./, c => c.toUpperCase())} •••• ${pay.card_last4}` : sub?.card_last4 ? `${String(sub.card_brand || "Card").replace(/^./, c => c.toUpperCase())} •••• ${sub.card_last4}` : "";
    const live = sub && ["active", "trialing", "past_due", "paused"].includes(sub.status);
    return hero(kind === "paid" ? "is-in" : kind === "failed" ? "" : "is-transfer", label, pay ? money(pay.amount, pay.currency) : esc(plan), esc(text))
      + k.section("Details", k.kv([
        ["Method", esc("Card · Paddle")],
        ["Plan", esc(plan)],
        card ? ["Card", esc(card)] : null,
        kind === "paid" && until ? ["Active until", esc(expiry(until))] : null,
        kind === "paid" && promo ? ["Bonus", esc(`+${promo} month${promo === 1 ? "" : "s"}`)] : null,
        pay?.invoice_number ? ["Invoice", `<span class="tm-dp-mono">${esc(pay.invoice_number)}</span>`] : null,
        ["Date", esc(when(n.created_at || pay?.paid_at))]
      ]))
      + (kind === "failed" ? k.note(esc("Update your card in Manage billing to keep Pro. Paddle retries the payment automatically."), "warn", "fa-solid fa-triangle-exclamation") : "")
      + k.section("Actions", acts([
        pay?.transaction_id && kind !== "other" ? k.btn("nf-invoice", "Invoice", "fa-solid fa-file-invoice", { primary: kind === "paid", data: `data-v="${esc(pay.transaction_id)}"` }) : "",
        live ? k.btn("nf-portal", kind === "failed" ? "Update card" : "Manage billing", kind === "failed" ? "fa-regular fa-credit-card" : "fa-solid fa-gear", { primary: kind === "failed", data: `data-v="${kind === "failed" ? "update_card_url" : "url"}"` }) : "",
        k.btn("nf-plan", "Plan & Subscription", "fa-solid fa-crown"), ...copyDelete()]));
  }

  function accessView(n){
    const k = K();
    if (!st.loaded) return loading();
    if (st.extraErr && !st.extra) return k.note(esc(st.extraErr), "bad", "fa-solid fa-triangle-exclamation") + acts(copyDelete());
    const r = st.extra || {}, q = r.inquiry || {}, msgs = Array.isArray(r.messages) ? r.messages : [];
    const name = q.sender_display_name || q.guest_name || "Visitor";
    const email = q.sender_email || q.guest_email || "", phone = q.sender_phone || q.guest_phone || "";
    const message = msgs.find(m => m.sender_role === "guest")?.body || q.body || n.body || "";
    const wa = String(phone).replace(/[^\d]/g, "");
    return hero("is-transfer", "Member access request", esc(name), esc(email || "No email supplied"))
      + k.section("Contact", k.kv([["Email", email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : esc("Not supplied")], ["Mobile / WhatsApp", esc(phone || "Not supplied")], ["Submitted", esc(`${when(q.created_at || n.created_at)} · ${ago(q.created_at || n.created_at)}`)], msgs.length > 1 ? ["Messages", esc(String(msgs.length))] : null]))
      + k.section("Request message", `<p class="tm-nf-text" dir="auto">${esc(message)}</p>`)
      + k.section("Actions", acts([k.btn("nf-thread", "Open conversation", "fa-solid fa-comments", { primary: true }),
          email ? `<a class="aum-btn" href="mailto:${esc(email)}"><i class="fa-regular fa-envelope" aria-hidden="true"></i> ${esc("Email")}</a>` : "",
          wa.length >= 7 ? `<a class="aum-btn" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> ${esc("WhatsApp")}</a>` : "", ...copyDelete()]));
  }

  function genericView(n){
    const k = K();
    const fields = call("notificationDetailFields", n) || [];
    const body = String(call("localizeServerDates", String(n.body || "").trim()) || "").trim();
    const p = payloadOf(n);
    const amount = n.kind === "subscription_payment" && p.amount ? money(p.amount, p.currency) : "";
    const offer = call("isLiveChatOfferNotification", n) ? call("liveChatNotificationResolution", n, call("liveChatOfferStillOpen", n)) : null;
    const list = (call("notificationActions", n) || []).map(a => k.btn("nf-act", a.label, `fa-solid ${a.icon}`, { primary: !!a.primary, danger: !!a.danger, data: `data-a="${esc(a.id)}"` }));
    return (body && !fields.some(([, v]) => v === body) ? `<div class="tm-nf-message"><p dir="auto">${esc(body)}</p></div>` : "")
      + (offer ? k.note(esc(offer.label), offer.code === "pending" ? "warn" : "info", "fa-solid fa-circle-info") : "")
      + (fields.length || amount ? k.section("Details", k.kv([...fields.map(([a, b]) => [a, `<span dir="auto">${esc(b)}</span>`]), amount ? ["Amount", amount] : null])) : "")
      + k.section("Received", k.kv([["Date", esc(when(n.created_at))], ago(n.created_at) ? ["When", esc(ago(n.created_at))] : null, ["From", esc(call("notificationSource", n) === "admin" ? "Administration" : "Your account")]]))
      + k.section("Actions", acts([...list, ...copyDelete()]));
  }

  function recentView(n){
    const k = K();
    const rows = all().filter(x => String(x.id) !== String(n.id)).slice(0, 20);
    if (!rows.length) return k.empty("No other notifications.");
    return k.section("Other notifications", `<ul class="tm-dp-rows">${rows.map(x => {
      const v = call("notificationVisual", x) || { cls: "", icon: "fa-bell" };
      const prev = String(call("notificationPreviewText", x) || "").slice(0, 90);
      return `<li class="tm-nf-row${x.is_read ? "" : " is-unread"}" data-dp-act="nf-go" data-id="${esc(x.id)}" role="button" tabindex="0">
        <span class="tm-dp-row-ico" style="--t:${TONES[v.cls] || "var(--primary)"}" aria-hidden="true"><i class="fa-solid ${esc(v.icon)}"></i></span>
        <span class="tm-dp-row-main"><b>${esc(call("notificationTitleText", x) || "Notification")}</b><small>${esc(prev)}</small></span>
        <span class="tm-dp-row-amt"><small>${esc(call("notificationShortTime", x) || "")}</small></span></li>`;
    }).join("")}</ul>`);
  }

  // ── open ─────────────────────────────────────────────────────────────────────────────
  function open(n){
    const dp = DP();
    if (!n || !dp?.custom?.open || !dp.kit) return false;
    document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
    const kind = kindOf(n);
    st = { n, kind, extra: null, extraErr: "", loaded: kind === "generic" };
    const k = dp.kit;
    def = {
      icon: "notifications", notificationId: String(n.id),
      tabs: [["details", "Details", "fa-solid fa-bell"], ["recent", "Recent", "fa-solid fa-clock-rotate-left"]],
      tab: "details", state: st,
      head(){
        const v = call("notificationVisual", n) || { cls: "", icon: "fa-bell" };
        const pills = [];
        if (kind === "subscription") pills.push(k.pill("Subscription", "info", "fa-solid fa-crown"));
        else if (kind === "card") pills.push(k.pill("Card billing", "info", "fa-regular fa-credit-card"));
        else if (kind === "access") pills.push(k.pill("Access request", "info", "fa-solid fa-user-lock"));
        pills.push(k.pill(call("notificationSource", n) === "admin" ? "Admin" : "Account", "", call("notificationSource", n) === "admin" ? "fa-solid fa-user-shield" : "fa-solid fa-user"));
        return { title: call("notificationTitleText", n) || "Notification", sub: esc(`${when(n.created_at)} · ${ago(n.created_at)}`),
          avatar: `<span class="tm-dp-txico" style="--t:${TONES[v.cls] || "var(--primary,#2563eb)"}"><i class="fa-solid ${esc(v.icon)}"></i></span>`, pills };
      },
      render(tab){
        if (tab === "recent") return recentView(n);
        if (kind === "subscription") return subscriptionView(n);
        if (kind === "card") return cardView(n);
        if (kind === "access") return accessView(n);
        return genericView(n);
      },
      actions: {
        "nf-act": async b => { await global.runNotificationAction(n, b.dataset.a); },
        "nf-delete": async () => { await global.runNotificationAction(n, "delete"); },
        "nf-copy": async () => {
          const text = [call("notificationTitleText", n), call("localizeServerDates", n.body) || n.body, ...(call("notificationDetailFields", n) || []).map(([a, b]) => `${a}: ${b}`), when(n.created_at)].filter(Boolean).join("\n");
          try { await navigator.clipboard.writeText(text); DP().toast("Copied"); } catch (_) { DP().toast("Copy failed. Select the text and copy it.", false); }
        },
        "nf-plan": () => { DP().close(); global.openPlanSubscriptionModal?.(); },
        "nf-billing": () => { DP().close(); global.TriplemPlanPanel ? global.TriplemPlanPanel.open({ tab: "billing" }) : global.openPlanSubscriptionModal?.(); },
        "nf-invoice": async b => { b.classList.add("is-busy"); try { await global.TriplemCardPayments.openInvoice(b.dataset.v); } catch (e) { DP().toast(String(e?.message || "The invoice could not be opened."), false); } finally { b.classList.remove("is-busy"); } },
        "nf-portal": async b => { b.classList.add("is-busy"); try { await global.TriplemCardPayments.openPortal(b.dataset.v); } catch (e) { DP().toast(String(e?.message || "Billing could not be opened."), false); } finally { b.classList.remove("is-busy"); } },
        "nf-thread": () => { DP().close(); call("goToMessagesTab", n.related_inquiry_id); },
        "nf-go": b => {
          const x = all().find(y => String(y.id) === String(b.dataset.id)); if (!x) return;
          if (!x.is_read) {
            x.is_read = true;
            const rpc = call("notificationSource", x) === "user" ? "app_mark_my_notification_read" : "app_admin_mark_notification_read";
            Promise.resolve(supabaseRpc(rpc, { p_notification_id: x.id })).then(() => call("refreshAdminCommsBadges")).catch(() => {});
          }
          open(x);
        }
      }
    };
    dp.custom.open(def);
    if (kind !== "generic") loadExtra(n, kind);
    return true;
  }

  // ── install over the app's overlays ─────────────────────────────────────────────────
  function install(){
    const base = {
      detail: global.openNotificationDetail, sub: global.openSubscriptionNotificationDetails,
      access: global.openAccessRequestDetails, close: global.closeNotificationDetail
    };
    if (typeof base.detail !== "function" || base.detail.__tmNf) return false;
    const wrap = (fb, fn) => { const f = function(){ return fn.apply(this, arguments) ? undefined : fb?.apply(this, arguments); }; f.__tmNf = true; return f; };
    global.openNotificationDetail = wrap(base.detail, n => open(n));
    if (typeof base.sub === "function") global.openSubscriptionNotificationDetails = wrap(base.sub, n => open(n));
    if (typeof base.access === "function") global.openAccessRequestDetails = wrap(base.access, n => (n?.related_inquiry_id ? open(n) : false));
    if (typeof base.close === "function") {
      const c = function(){ const r = base.close.apply(this, arguments); if (isOpen()) DP().close(); return r; };
      c.__tmNf = true; global.closeNotificationDetail = c;
    }
    return true;
  }
  if (!install()) document.addEventListener("DOMContentLoaded", install, { once: true });

  global.TriplemNotificationPanels = Object.freeze({ open, isOpen });
})(window);
