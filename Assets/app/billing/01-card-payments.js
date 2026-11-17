/* Triplem VIP · Pay for Pro by card (Paddle), 2026-11-17
 *
 * Adds card payments to Plan & Subscription next to the existing bank transfer:
 *   - "Credit / debit card" or "Bank transfer" choice above the payment details;
 *   - "Pay by card" opens Paddle's secure checkout (Paddle is the Merchant of Record). Pro is
 *     switched on by our server when Paddle confirms the payment (migration 231 and the
 *     paddle-billing server function), never by this page;
 *   - "Card billing" card: renewal status, next payment, Manage billing / Update card / Stop
 *     renewal (Paddle's customer portal) and the card payments with their invoices.
 *
 * Bank transfers are unchanged. Nothing changes until migration 231 is installed: if the server
 * does not know app_my_card_billing() the panel looks exactly as before. The Microsoft Store
 * edition keeps bank transfer only. Plans with paid team seats keep bank transfer for now.
 *
 * Test mode: while CONFIG.env is "sandbox" the card option is shown only on a device where it
 * was switched on (open the site once with ?cardtest=1; ?cardtest=0 switches it off). The server
 * gives Pro for test-card payments only to the accounts listed in PADDLE_TEST_USERNAMES.
 * Only public values live here (client-side token and price ids); secret keys stay on the server.
 */
(function initTriplemCardPayments(global){
  "use strict";

  const CONFIG = Object.freeze({
    env: "sandbox",                                   // "production" when Paddle is live
    token: "test_2dcf5b1a0109ec4478823906792",        // Paddle client-side token (public)
    prices: Object.freeze({ monthly: "pri_01m7mthdxc6wg8873h23chyt0w", yearly: "pri_01m7mtjy48nw8pzvef7dxfq0be" }),
    usd: Object.freeze({ monthly: 13.99, yearly: 149 }),
    script: "https://cdn.paddle.com/paddle/v2/paddle.js",
    refundUrl: "https://triplem.vip/seo/refund-policy.html"
  });
  const TEST_KEY = "triplem.cardTest";
  try {
    const q = new URLSearchParams(location.search).get("cardtest");
    if (q === "1") localStorage.setItem(TEST_KEY, "1");
    if (q === "0") localStorage.removeItem(TEST_KEY);
  } catch (_) {}

  const esc = v => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const testMode = () => CONFIG.env !== "production";
  const storeEdition = () => !!global.TriplemStore?.active;
  function enabled(){
    if (storeEdition()) return false;
    if (!testMode()) return true;
    try { return localStorage.getItem(TEST_KEY) === "1"; } catch (_) { return false; }
  }
  const usd = n => `US$${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const LOC = () => ({ ar: "ar-AE-u-nu-latn-ca-gregory", ur: "ur-PK-u-nu-latn-ca-gregory" })[String(document.documentElement.lang || "").slice(0, 2)] || undefined;
  const money = (amount, currency) => {
    const c = String(currency || "USD").toUpperCase();
    try { return new Intl.NumberFormat(LOC(), { style: "currency", currency: c }).format(Number(amount) || 0); }
    catch (_) { return `${c} ${(Number(amount) || 0).toFixed(2)}`; }
  };
  const day = v => { if (!v) return ""; try { return new Date(v).toLocaleDateString(LOC(), { day: "numeric", month: "short", year: "numeric" }); } catch (_) { return String(v).slice(0, 10); } };
  const periodName = p => (p === "yearly" ? "Pro Yearly" : "Pro Monthly");
  const notify = (m, ok = true) => {
    try { if (typeof showEntryConfirmation === "function") { showEntryConfirmation(m, ok ? "success" : "error"); return; } } catch (_) {}
    try { global.TriplemDetailPanels?.toast(m, ok); } catch (_) {}
  };

  // ── server ──────────────────────────────────────────────────────────────────────────────
  async function rpc(name, args = {}){ return await supabaseRpc(name, args); }
  async function billing(){
    try { return await rpc("app_my_card_billing", {}); }
    catch (e) {
      // Not installed yet (migration 231): the feature stays hidden.
      if (/app_my_card_billing|does not exist|could not find the function|pgrst202|schema cache/i.test(String(e?.message || e))) return null;
      throw e;
    }
  }
  async function fn(body){
    const cfg = typeof getSupabaseConfig === "function" ? getSupabaseConfig() : null;
    const token = String(global.state?.sessionToken || "").trim();
    if (!cfg?.supabaseUrl || !token) throw new Error("Please sign in again.");
    let res;
    try {
      res = await fetch(`${String(cfg.supabaseUrl).replace(/\/$/, "")}/functions/v1/paddle-billing`, {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, "X-Session-Token": token },
        body: JSON.stringify(body)
      });
    } catch (_) { throw new Error("Card billing could not be reached. Please check your connection and try again."); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.error || `Request failed (${res.status}).`);
    return data;
  }
  // Opens a link from a click without being blocked as a pop-up: the tab is opened first.
  async function openLink(getUrl){
    const w = global.open("about:blank", "_blank");
    try {
      const url = await getUrl();
      if (!/^https:\/\//i.test(url || "")) throw new Error("The link is not available yet.");
      if (w && !w.closed) { try { w.opener = null; } catch (_) {} w.location.href = url; }
      else global.location.assign(url);
    } catch (e) { try { w?.close(); } catch (_) {} throw e; }
  }

  // ── Paddle.js ───────────────────────────────────────────────────────────────────────────
  let paddleReady = null, onPaddleEvent = null;
  function loadPaddle(){
    if (paddleReady) return paddleReady;
    paddleReady = new Promise((resolve, reject) => {
      const init = () => {
        try {
          if (testMode()) global.Paddle.Environment.set("sandbox");
          global.Paddle.Initialize({ token: CONFIG.token, eventCallback: ev => { try { onPaddleEvent?.(ev); } catch (_) {} } });
          resolve(global.Paddle);
        } catch (e) { reject(e); }
      };
      if (global.Paddle?.Checkout) return init();
      const s = document.createElement("script");
      s.src = CONFIG.script; s.async = true;
      s.onload = init;
      s.onerror = () => reject(new Error("The secure card checkout could not be loaded. Please check your connection or turn off content blockers for this page."));
      document.head.appendChild(s);
    }).catch(e => { paddleReady = null; throw e; });
    return paddleReady;
  }
  function checkoutLocale(){
    const l = String(document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    return ["ar", "de", "es", "fr", "it", "nl", "pt", "ja", "ko", "zh", "ru", "tr", "pl", "sv", "da", "no", "hu", "id", "th", "vi", "uk", "cs", "fi", "el", "he", "ro", "sk"].includes(l) ? l : "en";
  }

  // Sign-up checkouts are marked so the paid time starts at the payment (migration 234); an older
  // database without app_card_checkout_start_v2 uses the first version.
  async function startCheckout(period, context){
    try { return await rpc("app_card_checkout_start_v2", { p_period: period, p_context: context || null }); }
    catch (e) {
      if (!/app_card_checkout_start_v2|could not find the function|pgrst202|schema cache/i.test(String(e?.message || e))) throw e;
      return await rpc("app_card_checkout_start", { p_period: period });
    }
  }
  async function payByCard(period, ui, opts = {}){
    const start = await startCheckout(period, opts.context);
    const Paddle = await loadPaddle();
    const dark = String(document.documentElement.dataset.triplemThemeMode || "light") === "dark";
    let completedTxn = null;
    const done = new Promise(resolve => {
      onPaddleEvent = ev => {
        const name = ev?.name || "";
        if (name === "checkout.completed") { completedTxn = ev?.data?.transaction_id || null; resolve("completed"); }
        else if (name === "checkout.closed") resolve(completedTxn ? "completed" : "closed");
        else if (name === "checkout.error") ui.error(ev?.error?.detail || "The card checkout reported a problem. Please try again.");
      };
    });
    Paddle.Checkout.open({
      items: [{ priceId: CONFIG.prices[period], quantity: 1 }],
      customer: start?.email ? { email: start.email } : undefined,
      customData: { triplem_ref: String(start.reference) },
      settings: { displayMode: "overlay", theme: dark ? "dark" : "light", locale: checkoutLocale(), allowLogout: !start?.email, showAddDiscounts: false }
    });
    ui.waiting("Complete the payment in the secure Paddle window…");
    const outcome = await done;
    onPaddleEvent = null;
    if (outcome !== "completed") { ui.reset(); finish(opts); return; }
    try { Paddle.Checkout.close(); } catch (_) {}
    await confirmActivation(period, completedTxn, ui);
    finish(opts);
  }

  // After Paddle's success screen: Pro is switched on when Paddle's signed notification reaches our
  // server. The panel shows that step instead of a frozen button, and keeps checking in the
  // background if the confirmation is late.
  function finish(opts){ const f = opts?.onDone; if (opts) opts.onDone = null; try { f?.(); } catch (_) {} }

  // After sign-up with "Pay by card": Plan & Subscription opens with the plan chosen and Paddle's
  // checkout starts at once (the purchase was already confirmed in the sign-up panel).
  let pendingSignup = null;
  async function payFromSignup(period, opts = {}){
    pendingSignup = { period: period === "yearly" ? "yearly" : "monthly", onDone: opts.onDone || null, context: "signup" };
    try { await global.openPlanSubscriptionModal(); }
    catch (_) { dropSignup("Your account is ready. You can pay by card any time from Plan & Subscription."); }
    if (pendingSignup) dropSignup("Your account is ready. You can pay by card any time from Plan & Subscription.");
  }
  function dropSignup(message){
    const p = pendingSignup; pendingSignup = null;
    if (!p) return;
    if (message) notify(message, true);
    finish(p);
  }

  async function confirmActivation(period, txn, ui){
    const started = Date.now();
    ui.status("wait");
    const tick = setInterval(() => ui.status("wait", Math.round((Date.now() - started) / 1000)), 1000);
    let hit = await waitForActivation(txn, 45000);
    clearInterval(tick);
    if (hit) return activated(period, hit);
    ui.status("late");
    ui.onCheck(async () => {
      ui.status("wait");
      const h = await waitForActivation(txn, 15000);
      if (h) activated(period, h); else ui.status("late");
    });
    // keep checking quietly for 10 minutes
    const until = Date.now() + 600000;
    (async () => {
      while (Date.now() < until) {
        hit = await waitForActivation(txn, 15000);
        if (hit) { if (!activated.done) activated(period, hit); return; }
      }
    })();
  }
  async function activated(period, ok){
    if (activated.done === ok.transaction_id) return;
    activated.done = ok.transaction_id;
    try { const v = await rpc("app_validate_session", {}); if (v?.user) applyUserProfileToConfig(v.user); } catch (_) {}
    try { updateAccessBanner(); } catch (_) {}
    notify(`Thank you! ${periodName(period)} is active${ok.new_expires_at ? ` until ${day(ok.new_expires_at)}` : ""}.`);
    const m = document.getElementById("planSubscriptionModal");
    if (m && !m.classList.contains("hide")) { try { await global.openPlanSubscriptionModal(); } catch (_) {} }
  }
  async function waitForActivation(txn, ms = 45000){
    const until = Date.now() + ms;
    while (Date.now() < until) {
      await sleep(2500);
      try {
        const b = await billing();
        const hit = (b?.payments || []).find(p => (txn ? p.transaction_id === txn : Date.now() - new Date(p.paid_at).getTime() < 300000));
        if (hit) return hit;
      } catch (_) {}
    }
    return null;
  }

  // ── Plan & Subscription panel ───────────────────────────────────────────────────────────
  function statusOf(sub){
    const s = String(sub?.status || "");
    if (s === "past_due") return { cls: "bad", label: "Payment problem", text: "The last renewal payment failed. Update your card to keep Pro." };
    if (s === "paused") return { cls: "warn", label: "Paused", text: "Card renewal is paused." };
    if (s === "canceled") return { cls: "muted", label: "Renewal stopped", text: "Automatic card renewal has ended. Your Pro access stays until its current end date." };
    if (sub?.scheduled_action === "cancel") return { cls: "warn", label: "Ends soon", text: `Renewal stopped. Pro stays active until ${day(sub.scheduled_effective_at || sub.current_period_ends_at)}; you will not be charged again.` };
    return { cls: "ok", label: "Renews automatically", text: sub?.next_billed_at ? `Next payment ${money(sub.amount, sub.currency)} on ${day(sub.next_billed_at)}.` : "Renews automatically by card." };
  }
  function payStatus(p){
    if (p.status === "refunded") return `<span class="settings-pill muted">Refunded</span>`;
    if (p.status === "charged_back") return `<span class="settings-pill bad">Charged back</span>`;
    if (p.status === "partially_refunded") return `<span class="settings-pill warn">Part refunded</span>`;
    return `<span class="settings-pill ok">Paid</span>`;
  }
  function billingCardHtml(b){
    const sub = b?.subscription, pays = b?.payments || [];
    if (!sub && !pays.length) return "";
    const st = sub ? statusOf(sub) : null;
    const live = sub && ["active", "trialing", "past_due", "paused"].includes(sub.status);
    const card = sub?.card_last4 ? `<span class="tm-card-chip"><i class="fa-regular fa-credit-card" aria-hidden="true"></i> ${esc(String(sub.card_brand || "Card").replace(/^./, c => c.toUpperCase()))} •••• ${esc(sub.card_last4)}</span>` : "";
    return `<section class="tm-card-billing" aria-label="Card billing">
      <div class="tm-card-billing-head"><div><span class="section-kicker">Card billing · Paddle</span><h4>${sub ? esc(periodName(sub.period)) : "Card payments"}</h4></div>${st ? `<span class="settings-pill ${st.cls}">${esc(st.label)}</span>` : ""}</div>
      ${st ? `<p class="tm-card-billing-text">${esc(st.text)}</p>` : ""}
      ${card ? `<div class="tm-card-billing-meta">${card}</div>` : ""}
      ${sub ? `<div class="tm-card-billing-actions">
        <button type="button" class="btn ghost tiny" data-card-portal="url"><i class="fa-solid fa-gear" aria-hidden="true"></i> Manage billing</button>
        ${live ? `<button type="button" class="btn ghost tiny" data-card-portal="update_card_url"><i class="fa-regular fa-credit-card" aria-hidden="true"></i> Update card</button>` : ""}
        ${live && sub.scheduled_action !== "cancel" ? `<button type="button" class="btn ghost tiny danger" data-card-portal="cancel_url"><i class="fa-solid fa-ban" aria-hidden="true"></i> Stop renewal</button>` : ""}
      </div>` : ""}
      ${pays.length ? `<div class="tm-card-pays"><span class="tm-card-pays-title">Card payments</span><ul>${pays.slice(0, 6).map(p => `
        <li><div><strong>${esc(money(p.amount, p.currency))}</strong><small>${esc(periodName(p.period))} · ${esc(day(p.paid_at))}${p.promotion_months ? ` · +${esc(p.promotion_months)} bonus month${p.promotion_months > 1 ? "s" : ""}` : ""}</small></div>
          ${payStatus(p)}
          <button type="button" class="icon-btn ghost tm-card-inv" data-card-invoice="${esc(p.transaction_id)}" title="Invoice (PDF)" aria-label="Invoice (PDF)"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i></button></li>`).join("")}</ul></div>` : ""}
      <p class="tm-card-billing-foot">Card payments are processed by Paddle.com, our Merchant of Record. Refunds within 14 days: <a href="${esc(CONFIG.refundUrl)}" target="_blank" rel="noopener">Refund Policy</a>.</p>
    </section>`;
  }

  async function enhance(){
    const modal = document.getElementById("planSubscriptionModal");
    const body = modal?.querySelector(".settings-sheet-body");
    if (!body || modal.classList.contains("hide") || body.querySelector(".plan-sub-loading")) return;
    let b;
    try { b = await billing(); } catch (_) { b = null; }
    if (!b || !body.isConnected) return;

    // Card billing card under "Current access".
    const html = billingCardHtml(b);
    if (html) {
      body.querySelector(".tm-card-billing")?.remove();
      const anchor = body.querySelector(".plan-sub-pending") || body.querySelector(".plan-sub-lifecycle") || body.querySelector(".plan-sub-current-card");
      anchor?.insertAdjacentHTML("afterend", html);
      body.querySelectorAll("[data-card-portal]").forEach(btn => btn.onclick = async () => {
        const which = btn.dataset.cardPortal; btn.disabled = true;
        try { await openLink(async () => { const r = await fn({ action: "portal" }); return r[which] || r.url; }); }
        catch (e) { notify(e.message || "Billing could not be opened.", false); }
        finally { btn.disabled = false; }
      });
      body.querySelectorAll("[data-card-invoice]").forEach(btn => btn.onclick = async () => {
        btn.disabled = true;
        try { await openLink(async () => (await fn({ action: "invoice", transaction_id: btn.dataset.cardInvoice })).url); }
        catch (e) { notify(e.message || "The invoice could not be opened.", false); }
        finally { btn.disabled = false; }
      });
    }

    // Payment method choice in the offer.
    const bankGrid = body.querySelector(".plan-bank-grid");
    const submit = body.querySelector("#planSubscriptionSubmit");
    if (!bankGrid || !submit || !enabled()) return;
    const sub = b.subscription;
    const renewing = sub && ["active", "trialing", "past_due"].includes(sub.status) && sub.scheduled_action !== "cancel";
    const seats = !body.querySelector(".plan-sub-team-summary")?.classList.contains("hide");
    if (seats) return;
    if (renewing) {
      bankGrid.insertAdjacentHTML("beforebegin", `<div class="tm-pay-note"><i class="fa-regular fa-credit-card" aria-hidden="true"></i><span>Your plan already renews by card. You can still add time by bank transfer below.</span></div>`);
      return;
    }
    const selectedPeriod = () => body.querySelector(".plan-sub-card.selected[data-plan-period]")?.dataset.planPeriod === "yearly" ? "yearly" : "monthly";
    bankGrid.insertAdjacentHTML("beforebegin", `
      <div class="tm-pay-method" role="radiogroup" aria-label="Payment method">
        <label class="tm-pay-opt"><input type="radio" name="tmPayMethod" value="card" checked><i class="fa-regular fa-credit-card" aria-hidden="true"></i><span><strong>Credit / debit card</strong><small>Pro starts right away · renews automatically · cancel any time</small></span>${testMode() ? `<em class="tm-pay-test">Test mode</em>` : ""}</label>
        <label class="tm-pay-opt"><input type="radio" name="tmPayMethod" value="bank"><i class="fa-solid fa-building-columns" aria-hidden="true"></i><span><strong>Bank transfer</strong><small>Upload the receipt · approved by an administrator</small></span></label>
      </div>
      <div class="tm-pay-card-box">
        <div class="plan-sub-total tm-pay-total"></div>
        <label class="signup-purchase-confirm tm-pay-confirm"><input type="checkbox" class="tm-pay-agree"><span class="tm-pay-agree-text"></span></label>
        <div class="lock-error tm-pay-error"></div>
        <p class="tm-pay-secure"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Secure checkout by Paddle. Triplem VIP never sees your card number.</p>
        <div class="settings-sheet-footer plan-sub-footer"><button type="button" class="btn ghost" data-plan-sub-close>Cancel</button><button type="button" class="btn primary tm-pay-go"><i class="fa-solid fa-lock" aria-hidden="true"></i> <span>Pay by card</span></button></div>
      </div>`);
    const box = body.querySelector(".tm-pay-card-box");
    const bankParts = [bankGrid, body.querySelector(".plan-receipt-field"), body.querySelector("label[for='planPurchaseConfirm']"), body.querySelector("#planSubscriptionError"), submit.closest(".plan-sub-footer"), body.querySelector("#planSubscriptionTotal"), body.querySelector("#planBillingCurrency")?.closest(".plan-sub-controls")].filter(Boolean);
    const promo = !!body.querySelector(".plan-promo-pill");
    const render = () => {
      const card = body.querySelector("input[name='tmPayMethod']:checked")?.value !== "bank";
      bankParts.forEach(el => el.classList.toggle("hide", card));
      box.classList.toggle("hide", !card);
      body.querySelectorAll(".tm-pay-opt").forEach(l => l.classList.toggle("selected", !!l.querySelector("input")?.checked));
      const p = selectedPeriod(), price = CONFIG.usd[p], bonus = promo ? (p === "yearly" ? 2 : 1) : 0;
      box.querySelector(".tm-pay-total").innerHTML = `<span>Total to pay by card</span><strong>${esc(usd(price))} <small>/ ${p === "yearly" ? "year" : "month"}</small></strong><small>${bonus ? `Now: ${p === "yearly" ? "12 months" : "1 month"} + ${bonus} bonus month${bonus > 1 ? "s" : ""}. ` : `Now: ${p === "yearly" ? "12 months" : "1 month"} added to your plan. `}Paddle shows the price in your currency and adds any sales tax before you pay.</small>`;
      box.querySelector(".tm-pay-agree-text").innerHTML = `I am buying ${esc(periodName(p))} for ${esc(usd(price))} per ${p === "yearly" ? "year" : "month"}. Paddle.com is the Merchant of Record for this order. The plan renews automatically until I cancel it in Manage billing. Full refund within 14 days. <button type="button" class="signup-terms-link" data-open-terms="terms">Terms and Conditions</button> · <a class="signup-terms-link" href="${esc(CONFIG.refundUrl)}" target="_blank" rel="noopener">Refund Policy</a>`;
    };
    body.querySelectorAll("input[name='tmPayMethod']").forEach(r => r.onchange = render);
    box.querySelector(".tm-pay-agree").addEventListener("change", () => { const e = box.querySelector(".tm-pay-error"); e.textContent = ""; e.classList.remove("show"); });
    body.querySelectorAll("[data-plan-period]").forEach(c => c.addEventListener("click", () => setTimeout(render, 0)));
    box.querySelectorAll("[data-plan-sub-close]").forEach(el => el.onclick = () => modal.querySelector(".settings-sheet-head [data-plan-sub-close]")?.click());
    render();

    const go = box.querySelector(".tm-pay-go"), err = box.querySelector(".tm-pay-error");
    const goHtml = go.innerHTML;
    const ui = {
      error(m){ err.textContent = m; err.classList.add("show"); },
      waiting(m){ go.disabled = true; go.innerHTML = `<i class="fa-solid fa-spinner btn-loader" aria-hidden="true"></i> <span>${esc(m)}</span>`; },
      reset(){ go.disabled = false; go.innerHTML = goHtml; },
      status(kind, secs){
        let st = box.querySelector(".tm-pay-status");
        if (!st) {
          box.insertAdjacentHTML("afterbegin", `<div class="tm-pay-status" role="status" aria-live="polite"></div>`);
          st = box.querySelector(".tm-pay-status");
          box.querySelectorAll(":scope > :not(.tm-pay-status)").forEach(el => el.classList.add("hide"));
          body.querySelector(".tm-pay-method")?.classList.add("hide");
        }
        if (kind === "wait") {
          st.className = "tm-pay-status is-wait";
          st.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i><div><strong>Payment received by Paddle</strong><p>Switching on Pro for your account… This usually takes a few seconds.</p>${secs ? `<small>${esc(secs)} s</small>` : ""}</div>`;
        } else {
          st.className = "tm-pay-status is-late";
          st.innerHTML = `<i class="fa-solid fa-hourglass-half" aria-hidden="true"></i><div><strong>Waiting for Paddle's confirmation</strong><p>Your payment went through and you will not be charged twice. Pro switches on automatically as soon as Paddle's confirmation reaches Triplem VIP, and you will get a notification. You can close this panel.</p><div class="tm-pay-status-actions"><button type="button" class="btn ghost tiny" data-pay-check><i class="fa-solid fa-rotate" aria-hidden="true"></i> Check again</button><button type="button" class="btn primary tiny" data-pay-close>Close</button></div></div>`;
          st.querySelector("[data-pay-close]").onclick = () => modal.querySelector(".settings-sheet-head [data-plan-sub-close]")?.click();
          st.querySelector("[data-pay-check]").onclick = () => ui._check?.();
        }
      },
      onCheck(fn){ ui._check = fn; }
    };
    const pay = async (opts = {}) => {
      err.textContent = ""; err.classList.remove("show");
      if (!box.querySelector(".tm-pay-agree")?.checked) return ui.error("Please confirm the purchase first.");
      ui.waiting("Opening secure checkout…");
      try { await payByCard(selectedPeriod(), ui, opts); }
      catch (e) { onPaddleEvent = null; ui.reset(); ui.error(e?.message || "The card checkout could not be started."); finish(opts); }
    };
    go.onclick = () => pay();
    if (pendingSignup) {
      const p = pendingSignup; pendingSignup = null;
      body.querySelector(`[data-plan-period="${p.period}"]`)?.click();
      const agree = box.querySelector(".tm-pay-agree"); if (agree) agree.checked = true;
      setTimeout(() => { render(); pay({ context: p.context, onDone: p.onDone }); }, 60);
    }
  }

  // Wrap the app's Plan & Subscription panel (its own code keeps doing everything it did).
  function install(){
    const orig = global.openPlanSubscriptionModal;
    if (typeof orig !== "function" || orig.__tmCard) return false;
    const wrapped = async function(...args){
      const r = await orig.apply(this, args);
      try { await enhance(); } catch (e) { console.warn("card billing", e); }
      return r;
    };
    wrapped.__tmCard = true;
    global.openPlanSubscriptionModal = wrapped;
    return true;
  }
  if (!install()) document.addEventListener("DOMContentLoaded", install, { once: true });

  const openInvoice = transactionId => openLink(async () => (await fn({ action: "invoice", transaction_id: transactionId })).url);
  global.TriplemCardPayments = Object.freeze({ config: CONFIG, enabled, billing, enhance, payFromSignup, openInvoice });
})(window);
