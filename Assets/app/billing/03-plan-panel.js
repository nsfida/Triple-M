/* Triplem VIP · Plan & Subscription side panel (2026-11-18)
 *
 * Opens Plan & Subscription in the app's side panel (the same one as wallets and expenses):
 *   Overview  – current access, days left, pending request, team seats, quick actions
 *   Extend    – plan, then payment method: Credit / debit card (Paddle; "Coming soon" until the
 *               Main Admin switches card payments on) or Bank transfer (pick a bank, see its
 *               details, attach the receipt, submit for approval)
 *   Billing   – card renewal (manage / update card / stop renewal), card payments with invoices,
 *               the latest bank-transfer request
 * Server calls are the existing ones (app_my_subscription_status, app_request_pro_subscription_v2
 * with its fallback, app_my_card_billing and the paddle-billing function). The previous dialog stays
 * as a fallback when the side panel is not available.
 */
(function initTriplemPlanPanel(global){
  "use strict";

  const DP = () => global.TriplemDetailPanels || null;
  const CP = () => global.TriplemCardPayments || null;
  const esc = v => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const BILLING_EMAIL = "billing@triplem.vip";
  const RECEIPT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
  const BANKS = [
    { key: "hbl", name: "HBL", logo: "Assets/logo/wallet_logos/HBL.png", where: "Pakistan",
      rows: [["Account title", "NADEEM"], ["Account number", "19227900107403"], ["IBAN", "PK87HABB0019227900107403"], ["Branch", "KHAWARI"]] },
    { key: "enbd", name: "Emirates NBD", logo: "Assets/logo/wallet_logos/Emirates NBD.png", where: "United Arab Emirates",
      rows: [["Name", "Nadeem Shahzad Fida"], ["IBAN", "AE060260001015884837801"], ["Account number", "1015884837801"]] }
  ];

  const prices = () => { try { return TRIPLEM_SUBSCRIPTION_PRICES; } catch (_) { return null; } };
  const teamPrices = () => { try { return TRIPLEM_TEAM_PRICES; } catch (_) { return null; } };
  const regional = () => { try { return typeof getRegionalCurrency === "function" ? getRegionalCurrency() : "USD"; } catch (_) { return "USD"; } };
  const moneyHtml = (v, c) => { try { return regionalMoneyHtml(v, c); } catch (_) { return esc(`${c} ${Number(v || 0).toFixed(2)}`); } };
  const expiryText = v => { try { return formatTrialExpiry(v); } catch (_) { return v ? String(v).slice(0, 10) : "—"; } };
  const day = v => { if (!v) return "—"; try { return new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (_) { return String(v).slice(0, 10); } };
  const daysLeft = v => { const t = Date.parse(v || ""); return Number.isFinite(t) ? Math.max(0, Math.ceil((t - Date.now()) / 86400000)) : null; };
  const periodName = p => (p === "yearly" ? "Pro Yearly" : "Pro Monthly");

  let def = null, st = null;
  const isOpen = () => !!def && DP()?.custom?.current?.() === def;
  const paint = () => { if (isOpen()) DP().custom.render({ keepScroll: true }); };

  // ── derived view of the subscription ─────────────────────────────────────────────────
  function view(){
    const sub = st.sub || {};
    let access = sub.access;
    if (!access) { try { access = getUserAccessFlags(); } catch (_) { access = {}; } }
    const user = global.state?.sessionUser || {};
    let teamMember = sub.account_type === "team_member";
    if (!teamMember) { try { teamMember = isTeamMemberAccount(user); } catch (_) {} }
    const pending = !!sub.pending || sub.status === "pending";
    const period = sub.current_paid_period || (!pending ? sub.plan : null);
    const label = access.is_trial ? "Free 14-Day Trial" : access.unlimited_access ? "Pro Unlimited" : period ? periodName(period) : "Pro";
    const left = access.unlimited_access ? null : daysLeft(access.trial_expires_at);
    let life = null; try { life = global.TriplemLimitedAccess?.bannerText?.(getUserAccessFlags(user)) || null; } catch (_) {}
    const seats = Number(sub.team_seats || 0);
    const seatAdd = sub.request_context === "team_seat_addition";
    const card = CP();
    const subCard = st.bill?.subscription || null;
    const renewing = !!subCard && ["active", "trialing", "past_due"].includes(subCard.status) && subCard.scheduled_action !== "cancel";
    return {
      sub, access, pending, period, label, left, life, seats, seatAdd, teamMember, protectedAdmin: !!user.is_protected,
      expiry: access.unlimited_access ? "No expiry" : expiryText(access.trial_expires_at),
      total: access.is_trial ? 14 : period === "yearly" ? 365 : 31,
      promo: sub.promotion_available !== false,
      canBuy: !pending && !teamMember && !user.is_protected,
      cardShown: !!card && card.offered(),
      cardOn: !!card && card.enabled(),
      cardTester: !!card?.status?.().tester && !card?.status?.().enabled,
      renewing, subCard,
      accountType: teamMember ? "Team member" : sub.account_type === "company" ? "Company" : "Individual"
    };
  }

  // ── loading ──────────────────────────────────────────────────────────────────────────
  async function load(soft){
    if (!soft) { st.loading = true; st.err = ""; paint(); }
    try {
      const [sub] = await Promise.all([
        supabaseRpc("app_my_subscription_status", {}),
        Promise.resolve(global.TRIPLEM_REGIONAL_CURRENCY_READY).catch(() => {}),
        CP()?.refreshStatus?.(true)?.catch?.(() => {})
      ]);
      st.sub = sub || {}; st.err = "";
    } catch (e) {
      if (!soft || !st.sub) st.err = String(e?.message || e || "Could not load subscription details.");
    }
    st.loading = false;
    paint();
    loadBilling();
  }
  async function loadBilling(){
    const card = CP(); if (!card) { st.billState = "none"; paint(); return; }
    st.billState = st.bill ? "ready" : "loading";
    try { st.bill = await card.billing(); st.billState = st.bill ? "ready" : "none"; }
    catch (_) { st.billState = st.bill ? "ready" : "error"; }
    paint();
  }

  // ── pieces ───────────────────────────────────────────────────────────────────────────
  const K = () => DP().kit;
  const go = (act, label, icon, opts) => K().btn(act, label, icon, opts);
  const tag = (t, cls = "") => `<em class="tm-pp-tag${cls ? " " + cls : ""}">${esc(t)}</em>`;
  const copyBtn = value => `<button type="button" class="tm-dp-icon-btn" data-dp-act="pp-copy" data-v="${esc(value)}" title="Copy" aria-label="Copy"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>`;
  const refundLink = () => `<a class="signup-terms-link" href="${esc(CP()?.config?.refundUrl || "https://triplem.vip/seo/refund-policy.html")}" target="_blank" rel="noopener">Refund Policy</a>`;
  const termsLinks = refund => `<button type="button" class="signup-terms-link" data-open-terms="terms">Terms and Conditions</button>${refund ? ` · ${refundLink()}` : ""}`;

  function hero(v){
    const k = K();
    const tone = v.pending || v.life ? "is-transfer" : v.access.is_trial ? "is-transfer" : "is-in";
    const leftTxt = v.left == null ? "No expiry" : v.left === 1 ? "1 day left" : `${v.left} days left`;
    return `<div class="tm-dp-txhero ${tone}"><small>Current access</small><strong>${esc(v.label)}</strong><span>${esc(v.expiry)}</span>
      <div class="tm-dp-txsplit"><span><small>Days left</small><b>${esc(v.left == null ? "∞" : String(v.left))}</b></span><span><small>Account</small><b>${esc(v.accountType)}</b></span><span><small>Team seats</small><b>${esc(String(v.seats))}</b></span></div></div>`
      + (v.left != null ? k.progress(Math.max(0, Math.min(100, Math.round((v.left / v.total) * 100))), leftTxt) : "");
  }
  function pendingNote(v){
    const s = v.sub, k = K();
    const plan = v.seatAdd ? "Team seat addition" : periodName(s.plan);
    return k.note(`<b>Payment approval pending</b><br>${esc(plan)} · ${moneyHtml(s.amount, s.currency || regional())}${s.team_enabled ? ` · ${esc(`${s.team_seats} paid team seat${Number(s.team_seats) === 1 ? "" : "s"}`)}` : ""}<br>`
      + (v.seatAdd ? esc("Company plan expiry remains unchanged while the additional seats are reviewed.") : `${esc("Proposed expiry")}: <b>${esc(s.proposed_expires_at ? expiryText(s.proposed_expires_at) : v.expiry)}</b>. ${esc("Your workspace remains available while the administrator verifies the receipt.")}`),
      "warn", "fa-solid fa-clock");
  }
  function lifeNote(v){
    if (!v.life || v.pending) return "";
    return K().note(`<b>${esc(v.life.title)}</b><br>${esc(v.life.message)}<br><button type="button" class="signup-terms-link" data-banner-details>What is available and what is paused</button> · <button type="button" class="signup-terms-link" data-open-terms="trial">Free Trial Terms</button>`,
      v.life.kind === "limited" ? "bad" : "warn", v.life.kind === "limited" ? "fa-solid fa-lock" : "fa-solid fa-hourglass-half");
  }

  function overview(v){
    const k = K();
    const acts = [];
    if (v.canBuy) acts.push(go("pp-tab", v.access.is_trial ? "Upgrade to Pro" : "Extend plan", "fa-solid fa-crown", { primary: true, data: 'data-tab="extend"' }));
    acts.push(go("pp-tab", "Billing", "fa-solid fa-file-invoice", { data: 'data-tab="billing"' }));
    acts.push(`<a class="aum-btn" href="mailto:${BILLING_EMAIL}"><i class="fa-regular fa-envelope" aria-hidden="true"></i> ${esc("Email billing")}</a>`);
    const method = v.renewing ? "Card · renews automatically" : v.sub.payment_bank ? "Bank transfer" : "—";
    return hero(v)
      + (v.pending ? pendingNote(v) : "") + lifeNote(v)
      + (v.teamMember ? k.note(`<b>${esc("Managed by company account")}</b><br>${esc("Your plan and paid team access are controlled by the company main account.")}`, "info", "fa-solid fa-building-shield") : "")
      + (v.protectedAdmin ? k.note(`<b>${esc("Protected administrator")}</b><br>${esc("This account does not require self-service subscription renewal.")}`, "info", "fa-solid fa-shield-halved") : "")
      + k.section("Actions", `<div class="tm-dp-txacts">${acts.join("")}</div>`)
      + k.section("Details", k.kv([
        ["Current plan", esc(v.label)],
        ["Expires", esc(v.expiry)],
        ["Account type", esc(v.accountType)],
        v.seats ? ["Paid team members", esc(String(v.seats))] : null,
        ["Payment method", esc(method)],
        v.canBuy ? ["First paid-plan bonus", v.promo ? k.pill("Available", "ok", "fa-solid fa-bolt") : esc("Used")] : null,
        v.sub.has_request && !v.pending ? ["Last request", `${esc(periodName(v.sub.plan))} · ${esc(day(v.sub.resolved_at || v.sub.created_at))}`] : null
      ]))
      + k.section("Billing assistance", `<p class="aum-muted">${esc("For subscription, receipt or payment questions, email")} <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a>.</p>`);
  }

  function planCards(v){
    const P = prices(), cur = regional();
    const card = (p, icon) => {
      const bonus = v.promo ? (p === "yearly" ? "First approval includes 2 additional months free" : "First approval includes 1 additional month free") : (p === "yearly" ? "Adds 12 months from your current expiry" : "Adds 1 month from your current expiry");
      return `<button type="button" class="tm-pp-plan${st.period === p ? " is-on" : ""}" data-dp-act="pp-period" data-v="${p}" aria-pressed="${st.period === p}">
        <i class="${icon}" aria-hidden="true"></i><b>${esc(periodName(p))}</b><span>${P ? moneyHtml(P[p][cur], cur) : ""}</span><small>${esc(bonus)}</small>${p === "yearly" ? tag("Best value") : ""}</button>`;
    };
    return `<div class="tm-pp-plans">${card("monthly", "fa-regular fa-calendar")}${card("yearly", "fa-solid fa-crown")}</div>`;
  }
  function methods(v){
    const cardTag = !v.cardOn ? tag("Coming soon", "is-soon") : v.renewing ? tag("Renews by card") : v.seats ? tag("Not for team plans") : v.cardTester ? tag("Test") : "";
    const cardOff = !v.cardOn || v.renewing || v.seats > 0;
    const opt = (key, icon, title, sub, extra = "", off = false) => `<button type="button" class="tm-pp-method${st.method === key ? " is-on" : ""}" data-dp-act="pp-method" data-v="${key}" aria-pressed="${st.method === key}"${off ? " disabled" : ""}>
      <i class="${icon}" aria-hidden="true"></i><span><b>${esc(title)}</b><small>${esc(sub)}</small></span>${extra}<i class="fa-solid fa-chevron-right tm-pp-go" aria-hidden="true"></i></button>`;
    return `<div class="tm-pp-methods" role="group" aria-label="Payment method">
      ${v.cardShown ? opt("card", "fa-regular fa-credit-card", "Credit / debit card", "Pro starts right away · renews automatically · cancel any time", cardTag, cardOff) : ""}
      ${opt("bank", "fa-solid fa-building-columns", "Bank transfer", "Upload the receipt · approved by an administrator")}
    </div>`;
  }
  function cardBox(v){
    const k = K(), card = CP(), p = st.period, price = card.config.usd[p], bonus = v.promo ? (p === "yearly" ? 2 : 1) : 0;
    if (st.pay === "wait") return k.note(`<b>${esc("Payment received by Paddle")}</b><br>${esc("Switching on Pro for your account… This usually takes a few seconds.")}${st.secs ? ` <small>${esc(`${st.secs} s`)}</small>` : ""}`, "info", "fa-solid fa-circle-notch fa-spin");
    if (st.pay === "late") return k.note(`<b>${esc("Waiting for Paddle's confirmation")}</b><br>${esc("Your payment went through and you will not be charged twice. Pro switches on automatically as soon as Paddle's confirmation reaches Triplem VIP, and you will get a notification. You can close this panel.")}`, "warn", "fa-solid fa-hourglass-half")
      + `<div class="tm-dp-txacts">${go("pp-check", "Check again", "fa-solid fa-rotate")}${go("pp-close", "Close", "", { primary: true })}</div>`;
    return `<div class="tm-pp-total"><small>${esc("Total to pay by card")}</small><strong>${esc(card.usd(price))} <em>/ ${esc(p === "yearly" ? "year" : "month")}</em></strong>
        <span>${esc(bonus ? `Now: ${p === "yearly" ? "12 months" : "1 month"} + ${bonus} bonus month${bonus > 1 ? "s" : ""}.` : `Now: ${p === "yearly" ? "12 months" : "1 month"} added to your plan.`)} ${esc("Paddle shows the price in your currency and adds any sales tax before you pay.")}</span></div>
      <label class="tm-pp-agree"><input type="checkbox" data-pp="agree"${st.agree ? " checked" : ""}><span>${esc(`I am buying ${periodName(p)} for ${card.usd(price)} per ${p === "yearly" ? "year" : "month"}.`)} ${esc("Paddle.com is the Merchant of Record for this order. The plan renews automatically until I cancel it in Manage billing. Full refund within 14 days.")} ${termsLinks(true)}</span></label>
      ${st.error ? k.note(esc(st.error), "bad", "fa-solid fa-triangle-exclamation") : ""}
      <p class="tm-pp-secure"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ${esc("Secure checkout by Paddle. Triplem VIP never sees your card number.")}</p>
      <div class="tm-dp-txacts">${go("pp-card", st.busy ? (st.payMsg || "Opening secure checkout…") : "Pay by card", st.busy ? "" : "fa-solid fa-lock", { primary: true, disabled: st.busy })}</div>`;
  }
  function bankBox(v){
    const k = K(), P = prices(), T = teamPrices(), cur = regional(), p = st.period;
    const base = P ? Number(P[p][cur]) || 0 : 0, unit = T ? Number(T[p][cur]) || 0 : 0, team = v.seats * unit;
    const bonus = v.promo ? (p === "yearly" ? 2 : 1) : 0;
    const bank = BANKS.find(b => b.key === st.bank);
    const list = `<div class="tm-pp-banks" role="group" aria-label="Bank">${BANKS.map(b => `<button type="button" class="tm-pp-bank${st.bank === b.key ? " is-on" : ""}" data-dp-act="pp-bank" data-v="${b.key}" aria-pressed="${st.bank === b.key}">
        <img src="${esc(b.logo)}" alt="" loading="lazy" decoding="async"><span><b>${esc(b.name)}</b><small>${esc(b.where)}</small></span><i class="fa-solid ${st.bank === b.key ? "fa-circle-check" : "fa-circle"}" aria-hidden="true"></i></button>`).join("")}</div>`;
    if (!bank) return k.section("Choose your bank", list);
    return k.section("Choose your bank", list)
      + k.section(`Transfer to ${bank.name}`, `<ul class="tm-pp-acct">${bank.rows.map(([a, b]) => `<li><small>${esc(a)}</small><b class="tm-dp-mono" translate="no">${esc(b)}</b>${copyBtn(b)}</li>`).join("")}</ul>`)
      + k.section("Amount", `<div class="tm-pp-total"><small>${esc("Total to transfer")}</small><strong>${moneyHtml(base + team, cur)}</strong>
          <span>${v.seats ? `${esc(`${periodName(p)}`)} ${moneyHtml(base, cur)} + ${esc(`${v.seats} team member${v.seats === 1 ? "" : "s"}`)} × ${moneyHtml(unit, cur)} · ` : ""}${esc(bonus ? `On approval: ${p === "yearly" ? "12 paid months" : "1 paid month"} + ${bonus} bonus month${bonus === 1 ? "" : "s"}` : `On approval: ${p === "yearly" ? "12 months" : "1 month"} added to your plan`)}</span></div>`)
      + k.section("Payment receipt", `<label class="tm-pp-drop${st.file ? " is-on" : ""}"><input type="file" data-pp="file" accept="${RECEIPT_TYPES.join(",")}">
          <i class="fa-solid ${st.file ? "fa-file-circle-check" : "fa-cloud-arrow-up"}" aria-hidden="true"></i><span><b>${esc(st.file ? st.file.name : "Attach the transfer receipt")}</b><small>${esc(st.file ? `${Math.max(1, Math.round(st.file.size / 1024))} KB · tap to change` : "PNG, JPG, WebP or PDF, maximum 5MB. The receipt remains private for administrator review.")}</small></span></label>`)
      + `<label class="tm-pp-agree"><input type="checkbox" data-pp="agree"${st.agree ? " checked" : ""}><span>${esc("I am starting a purchase of the selected plan for the total shown. I pay by bank transfer directly to Triplem VIP (payment provider: the bank account selected above); the plan does not renew automatically.")}${global.TriplemStore?.active ? ` ${esc("Microsoft is not the seller of Triplem VIP plans.")}` : ""} ${termsLinks(false)}</span></label>`
      + (st.error ? k.note(esc(st.error), "bad", "fa-solid fa-triangle-exclamation") : "")
      + `<div class="tm-dp-txacts">${go("pp-submit", st.busy ? "Submitting…" : "Submit payment for approval", st.busy ? "" : "fa-solid fa-paper-plane", { primary: true, disabled: st.busy })}</div>`;
  }
  function extend(v){
    const k = K();
    if (!v.canBuy) return (v.pending ? pendingNote(v) : "")
      + (v.teamMember ? k.note(esc("Your plan and paid team access are controlled by the company main account."), "info", "fa-solid fa-building-shield") : "")
      + (v.protectedAdmin ? k.note(esc("This account does not require self-service subscription renewal."), "info", "fa-solid fa-shield-halved") : "")
      + `<div class="tm-dp-txacts">${go("pp-tab", "Overview", "fa-solid fa-gauge-high", { data: 'data-tab="overview"' })}</div>`;
    const locked = st.pay === "wait" || st.pay === "late";
    return (locked ? "" : k.section(v.access.is_trial ? "Upgrade to Pro" : "Extend your Pro plan", planCards(v)
        + (v.seats ? `<p class="tm-pp-team"><i class="fa-solid fa-users" aria-hidden="true"></i> ${esc(`${v.seats} paid team member${v.seats === 1 ? "" : "s"} included in the bank-transfer total`)}</p>` : "")
        + (v.promo ? `<p class="tm-pp-promo"><i class="fa-solid fa-bolt" aria-hidden="true"></i> ${esc("First paid-plan bonus available")}</p>` : "")))
      + (locked ? "" : k.section("Payment method", methods(v)))
      + (st.method === "card" && v.cardOn ? k.section("Pay by card", cardBox(v)) : "")
      + (st.method === "bank" ? bankBox(v) : "");
  }

  function billing(v){
    const k = K(), card = CP();
    const s = v.sub;
    const bankReq = s.has_request ? k.section("Bank transfer requests", k.kv([
      ["Plan", esc(s.request_context === "team_seat_addition" ? "Team seat addition" : periodName(s.plan))],
      ["Amount", moneyHtml(s.amount, s.currency || regional())],
      ["Status", k.pill(v.pending ? "Pending approval" : s.admin_action === "approve" ? "Approved" : s.admin_action === "reject" ? "Rejected" : String(s.status || "—"), v.pending ? "warn" : s.admin_action === "approve" ? "ok" : s.admin_action === "reject" ? "bad" : "")],
      ["Bank", esc(BANKS.find(b => b.key === s.payment_bank)?.name || s.payment_bank || "—")],
      s.receipt_name ? ["Receipt", esc(s.receipt_name)] : null,
      ["Submitted", esc(day(s.created_at))],
      s.resolved_at ? ["Reviewed", esc(day(s.resolved_at))] : null,
      s.admin_note ? ["Administrator note", esc(s.admin_note)] : null
    ])) : "";
    if (st.billState === "loading" || st.billState === "idle") return k.section("Card billing", k.skel(4)) + bankReq;
    const sub = st.bill?.subscription, pays = st.bill?.payments || [];
    let cardHtml = "";
    if (sub) {
      const S = card.statusOf(sub), live = ["active", "trialing", "past_due", "paused"].includes(sub.status);
      cardHtml = k.section("Card billing · Paddle", k.statusCard(esc(card.periodName(sub.period)), esc(S.text), S.cls === "muted" ? "plain" : S.cls)
        + k.kv([
          ["Status", k.pill(S.label, S.cls === "muted" ? "" : S.cls)],
          sub.card_last4 ? ["Card", `${esc(String(sub.card_brand || "Card").replace(/^./, c => c.toUpperCase()))} •••• ${esc(sub.card_last4)}`] : null,
          sub.next_billed_at && sub.scheduled_action !== "cancel" ? ["Next payment", `${esc(card.money(sub.amount, sub.currency))} · ${esc(card.day(sub.next_billed_at))}`] : null
        ])
        + `<div class="tm-dp-txacts">${go("pp-portal", "Manage billing", "fa-solid fa-gear", { data: 'data-v="url"' })}${live ? go("pp-portal", "Update card", "fa-regular fa-credit-card", { data: 'data-v="update_card_url"' }) : ""}${live && sub.scheduled_action !== "cancel" ? go("pp-portal", "Stop renewal", "fa-solid fa-ban", { danger: true, data: 'data-v="cancel_url"' }) : ""}</div>`);
    }
    const payHtml = pays.length ? k.section("Card payments", `<ul class="tm-dp-rows">${pays.map(p => {
      const tone = p.status === "completed" ? "in" : "bad";
      const label = p.status === "refunded" ? "Refunded" : p.status === "charged_back" ? "Charged back" : p.status === "partially_refunded" ? "Part refunded" : "Paid";
      return `<li><span class="tm-dp-row-ico is-${tone}" aria-hidden="true"><i class="fa-regular fa-credit-card"></i></span>
        <span class="tm-dp-row-main"><b>${esc(card.periodName(p.period))}</b><small>${esc(card.day(p.paid_at))}${p.promotion_months ? ` · ${esc(`+${p.promotion_months} bonus month${p.promotion_months > 1 ? "s" : ""}`)}` : ""} · ${esc(label)}</small></span>
        <span class="tm-dp-row-amt"><b>${esc(card.money(p.amount, p.currency))}</b></span>
        <span class="tm-dp-row-act"><button type="button" class="tm-dp-icon-btn" data-dp-act="pp-invoice" data-v="${esc(p.transaction_id)}" title="Invoice (PDF)" aria-label="Invoice (PDF)"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i></button></span></li>`;
    }).join("")}</ul>`) : "";
    const none = !cardHtml && !payHtml && !bankReq ? k.empty("No payments yet.") : "";
    return cardHtml + payHtml + bankReq + none
      + (cardHtml || payHtml ? `<p class="tm-pp-secure"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ${esc("Card payments are processed by Paddle.com, our Merchant of Record. Refunds within 14 days:")} ${refundLink()}</p>` : "")
      + k.section("Billing assistance", `<p class="aum-muted">${esc("For subscription, receipt or payment questions, email")} <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a>.</p>`);
  }

  // ── actions ──────────────────────────────────────────────────────────────────────────
  const fail = m => { st.error = m; st.busy = false; st.payMsg = ""; paint(); };
  async function payCard(opts = {}){
    const card = CP(); if (!card || st.busy) return;
    st.error = "";
    if (!st.agree) return fail("Please confirm the purchase first.");
    st.busy = true; st.payMsg = "Opening secure checkout…"; paint();
    const ui = {
      error: m => fail(m),
      waiting: m => { st.busy = true; st.payMsg = m; paint(); },
      reset: () => { st.busy = false; st.payMsg = ""; paint(); },
      status: (kind, secs) => { st.pay = kind; st.secs = secs || 0; paint(); },
      onCheck: fn => { st.check = fn; }
    };
    try { await card.checkout(st.period, ui, opts); }
    catch (e) { fail(String(e?.message || "The card checkout could not be started.")); card.finish(opts); }
  }
  async function submitBank(){
    if (st.busy) return;
    st.error = "";
    const file = st.file;
    if (!st.bank) return fail("Please choose a bank.");
    if (!file) return fail("Please attach your bank transfer receipt.");
    if (!st.agree) return fail("Please confirm that you are starting a purchase.");
    if (file.size > 5 * 1024 * 1024) return fail("Payment receipt must be 5MB or smaller.");
    if (!RECEIPT_TYPES.includes(file.type)) return fail("Receipt must be PNG, JPG, WebP, or PDF.");
    st.busy = true; paint();
    try {
      const payload = {
        p_period: st.period, p_billing_currency: regional(), p_payment_bank: st.bank,
        p_receipt_name: file.name, p_receipt_mime: file.type, p_receipt_base64: await subscriptionFileBase64(file),
        p_country_code: typeof getRegionalCountryCode === "function" ? getRegionalCountryCode() : "ZZ"
      };
      try { await supabaseRpc("app_request_pro_subscription_v2", payload); }
      catch (e) {
        if (!/app_request_pro_subscription_v2|function.*does not exist|could not find the function|pgrst202|schema cache/i.test(String(e?.message || e || ""))) throw e;
        const fb = { ...payload }; delete fb.p_country_code;
        await supabaseRpc("app_request_pro_subscription", fb);
      }
      try { const r = await supabaseRpc("app_validate_session", {}); if (r?.user) applyUserProfileToConfig(r.user); } catch (_) {}
      try { updateAccessBanner(); } catch (_) {}
      Object.assign(st, { busy: false, file: null, agree: false, method: null, bank: null, error: "" });
      DP().toast("Payment submitted. Your request is pending administrator approval.");
      await load(true);
      if (isOpen()) DP().custom.tab("overview");
    } catch (e) { fail(String(e?.message || "Could not submit your payment.")); }
  }
  async function copy(value){
    try { await navigator.clipboard.writeText(value); DP().toast("Copied"); }
    catch (_) { DP().toast("Copy failed. Select the text and copy it.", false); }
  }

  // ── open ─────────────────────────────────────────────────────────────────────────────
  let fallback = null;
  async function open(opts = {}){
    try { if (isGuestMode()) return alert("Plan & Subscription is available after sign-in."); } catch (_) {}
    const dp = DP();
    if (!dp?.custom?.open || !dp.kit) return fallback ? fallback.apply(global, arguments) : undefined;
    if (isOpen()) { if (opts.tab) dp.custom.tab(opts.tab); await load(true); return claimSignup(); }
    st = { loading: true, err: "", sub: null, bill: null, billState: "idle", period: "monthly", method: null, bank: null, file: null, agree: false, busy: false, payMsg: "", pay: null, secs: 0, error: "", check: null };
    const k = dp.kit;
    def = {
      icon: "plan",
      tabs: [["overview", "Overview", "fa-solid fa-gauge-high"], ["extend", "Upgrade", "fa-solid fa-crown"], ["billing", "Billing", "fa-solid fa-file-invoice"]],
      tab: opts.tab || "overview", state: st,
      head(){
        const avatar = `<span class="tm-dp-txico" style="--t:#d97706"><i class="fa-solid fa-crown"></i></span>`;
        if (st.loading && !st.sub) return { title: "Plan & Subscription", avatar, sub: esc("Upgrade, extend and review your Triplem VIP access"), pills: [] };
        const v = view();
        const pills = [v.pending ? k.pill("Payment pending", "warn", "fa-solid fa-clock") : v.life?.kind === "limited" ? k.pill("Limited access", "bad") : v.life?.kind === "grace" ? k.pill("Grace period", "warn") : k.pill("Active", "ok", "fa-solid fa-circle-check")];
        if (v.renewing) pills.push(k.pill("Renews by card", "info", "fa-regular fa-credit-card"));
        return { title: "Plan & Subscription", avatar, sub: `${esc(v.label)} · ${esc(v.expiry)}`, pills };
      },
      render(tab){
        if (st.loading && !st.sub) return `<div class="tm-dp-txhero is-transfer">${k.skel(3)}</div>` + k.section("Details", k.skel(5));
        if (st.err && !st.sub) return k.note(esc(st.err), "bad", "fa-solid fa-triangle-exclamation") + `<div class="tm-dp-txacts">${go("pp-retry", "Try again", "fa-solid fa-rotate")}</div>`;
        const v = view();
        if (tab === "extend") return extend(v);
        if (tab === "billing") return billing(v);
        return overview(v);
      },
      onChange(e){
        const f = e.target.closest?.("[data-pp]"); if (!f) return;
        if (f.dataset.pp === "agree") { st.agree = !!f.checked; if (st.error) { st.error = ""; paint(); } }
        if (f.dataset.pp === "file") { st.file = f.files?.[0] || st.file; st.error = ""; paint(); }
      },
      actions: {
        "pp-tab": b => DP().custom.tab(b.dataset.tab),
        "pp-period": b => { st.period = b.dataset.v === "yearly" ? "yearly" : "monthly"; st.error = ""; paint(); },
        "pp-method": b => { st.method = b.dataset.v; st.error = ""; st.agree = false; paint(); },
        "pp-bank": b => { st.bank = b.dataset.v; st.error = ""; paint(); },
        "pp-copy": b => copy(b.dataset.v),
        "pp-card": () => payCard(),
        "pp-submit": () => submitBank(),
        "pp-check": () => st.check?.(),
        "pp-close": () => DP().close(),
        "pp-retry": () => load(),
        "pp-portal": async b => { b.classList.add("is-busy"); try { await CP().openPortal(b.dataset.v); } catch (e) { DP().toast(String(e?.message || "Billing could not be opened."), false); } finally { b.classList.remove("is-busy"); } },
        "pp-invoice": async b => { b.disabled = true; try { await CP().openInvoice(b.dataset.v); } catch (e) { DP().toast(String(e?.message || "The invoice could not be opened."), false); } finally { b.disabled = false; } }
      }
    };
    dp.custom.open(def);
    await load();
    return claimSignup();
  }
  // After sign-up with "Pay by card": the plan is chosen and Paddle's checkout starts at once.
  function claimSignup(){
    const card = CP(); const p = card?.takeSignup?.(); if (!p) return;
    const v = st?.sub ? view() : null;
    if (!isOpen() || !v || !v.canBuy || !v.cardOn || v.seats > 0) {
      try { DP()?.toast?.("Your account is ready. You can pay by card any time from Plan & Subscription."); } catch (_) {}
      card.finish(p); return;
    }
    st.period = p.period; st.method = "card"; st.agree = true;
    DP().custom.tab("extend");
    setTimeout(() => payCard({ context: p.context, onDone: p.onDone }), 60);
  }

  // Card payment confirmed (TriplemCardPayments): show the new expiry on Overview.
  async function reload(){
    if (!isOpen()) return;
    const paid = !!st.pay;
    Object.assign(st, { pay: null, busy: false, payMsg: "", method: paid ? null : st.method, agree: paid ? false : st.agree });
    await load(true);
    if (paid && isOpen()) DP().custom.tab("overview");
  }

  function install(){
    const prev = global.openPlanSubscriptionModal;
    if (typeof prev !== "function" || prev.__tmPlanPanel) return false;
    fallback = prev;
    const f = function(){ return open.apply(this, arguments); };
    f.__tmPlanPanel = true;
    global.openPlanSubscriptionModal = f;
    return true;
  }
  if (!install()) document.addEventListener("DOMContentLoaded", install, { once: true });

  global.TriplemPlanPanel = Object.freeze({ open, isOpen, reload });
})(window);
