/* Triplem VIP · Bitcoin section, new layout (2026-11-16)
 *
 * The Bitcoin section now looks and works like the other sections: a page with a portfolio
 * overview and one card per saved wallet, and every wallet opening in the same side panel
 * (same size, header, tabs and buttons as Loans, Installments, Assets, Expenses ...).
 *
 *   Page    · Portfolio (live balance of every saved wallet, in BTC and USD), Bitcoin price with
 *             24-hour change, network fees, search and filters, wallet cards.
 *   Panel   · Overview · Activity · Receive · Send · Addresses & keys · Insights · Details.
 *   Add     · Watch an address · Private key (WIF) · Seed phrase · Hex key · Brain wallet ·
 *             Create a wallet · Bulk import — in the same panel, no separate pop-ups.
 *
 * New: portfolio total, per-wallet live balance and value, network fee guide and one-click fee
 * presets, payment requests (amount + label + message as a bitcoin: link and QR code, with
 * download), activity filters, search and CSV export, monthly received/sent chart, balance
 * history, rename saved wallets, block-explorer links.
 *
 * All wallet logic (keys, signing, broadcasting, PDFs, saving) is the existing code in
 * 01-bitcoin.js and notes/01-notes.js. The existing forms are moved into the panel while they
 * are used and returned afterwards, so their checks and handlers are unchanged. Private keys
 * never leave the browser, exactly as before.
 */
(function initTriplemBitcoinV2(global){
  "use strict";

  const D = () => global.TriplemDetailPanels;
  const K = () => D()?.kit;
  const doc = global.document;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const st = () => global.state?.bitcoin || {};
  const has = name => typeof global[name] === "function";
  const call = (name, ...a) => (has(name) ? global[name](...a) : undefined);
  const SAT = 1e8;
  const fmtBtc = sats => `${(num(sats) / SAT).toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC`;
  const fmtBtcShort = sats => { const v = num(sats) / SAT; return `${v.toLocaleString("en-US", { minimumFractionDigits: v && Math.abs(v) < 0.001 ? 8 : 4, maximumFractionDigits: 8 })} BTC`; };
  const usd = n => `$${num(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const usdOf = sats => (st().btcPrice ? usd((num(sats) / SAT) * st().btcPrice) : "—");
  const short = (s, a = 8, b = 6) => { s = String(s || ""); return s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s; };
  const netLabel = k => ({ mainnet: "Mainnet", testnet: "Testnet", signet: "Signet" })[k] || "Mainnet";
  const explorerTx = (net, txid) => `https://mempool.space/${net && net !== "mainnet" ? net + "/" : ""}tx/${encodeURIComponent(txid)}`;
  const explorerAddr = (net, a) => `https://mempool.space/${net && net !== "mainnet" ? net + "/" : ""}address/${encodeURIComponent(a)}`;
  const guest = () => { try { return typeof isGuestMode === "function" && isGuestMode(); } catch (_) { return false; } };
  const storeEdition = () => !!global.TriplemStore?.active;

  // ── live data for saved wallets (balance, received, sent, transactions) ─────────────
  const LIVE = new Map();          // address → { at, loading, error, balanceSat, receivedSat, sentSat, txCount }
  const LIVE_TTL = 5 * 60 * 1000;
  let liveQueue = [], liveRunning = 0;
  function liveFor(w){ return LIVE.get(w.address) || null; }
  function queueLive(list, force = false){
    for (const w of list) {
      const cur = LIVE.get(w.address);
      if (!force && cur && (cur.loading || Date.now() - cur.at < LIVE_TTL)) continue;
      LIVE.set(w.address, Object.assign({}, cur || {}, { loading: true, error: "" }));
      if (!liveQueue.some(x => x.address === w.address)) liveQueue.push(w);
    }
    pumpLive();
  }
  function pumpLive(){
    while (liveRunning < 3 && liveQueue.length) {
      const w = liveQueue.shift(); liveRunning++;
      Promise.resolve(call("btcFetchAddressStats", w.address, w.network || "mainnet"))
        .then(d => { LIVE.set(w.address, { at: Date.now(), loading: false, error: "", balanceSat: num(d?.balanceSat), receivedSat: num(d?.receivedSat), sentSat: num(d?.sentSat), txCount: num(d?.txCount) }); })
        .catch(err => { LIVE.set(w.address, Object.assign({}, LIVE.get(w.address) || {}, { at: Date.now(), loading: false, error: String(err?.message || err || "Could not load") })); })
        .finally(() => { liveRunning--; schedulePage(); pumpLive(); });
    }
  }

  // ── price and network fees ────────────────────────────────────────────────────────────
  const MARKET = { fees: null, feesAt: 0, feesNet: "", priceAt: 0, loading: false };
  async function refreshMarket(force = false){
    if (storeEdition() || MARKET.loading) return;
    MARKET.loading = true;
    try {
      if (force || !st().btcPrice || Date.now() - MARKET.priceAt > 60000) {
        const p = await call("btcFetchPrice");
        if (p) { st().priceChange = p.change; MARKET.priceAt = Date.now(); }
      }
      const net = st().wallet?.key || "mainnet";
      if (force || !MARKET.fees || MARKET.feesNet !== net || Date.now() - MARKET.feesAt > 120000) {
        const api = call("btcGetNetworkInfo", net)?.api;
        if (api) {
          const f = await call("btcFetchJson", `${api}/fee-estimates`).catch(() => null);
          if (f && typeof f === "object") { MARKET.fees = { fast: num(f["1"] || f["2"]), normal: num(f["3"] || f["6"]), slow: num(f["6"] || f["12"] || f["24"]), economy: num(f["144"] || f["504"] || f["24"]) }; MARKET.feesAt = Date.now(); MARKET.feesNet = net; }
        }
      }
    } catch (_) {} finally { MARKET.loading = false; schedulePage(); D()?.refresh?.(); refreshOpenPanel(); }
  }
  const feeTxt = v => (v ? `${v >= 10 ? Math.round(v) : v.toFixed(1)} sat/vB` : "—");

  // ── page ──────────────────────────────────────────────────────────────────────────────
  const PAGE = { q: "", filter: "all", menu: "" };
  let pageTimer = 0;
  function schedulePage(){ clearTimeout(pageTimer); pageTimer = setTimeout(renderPage, 80); }
  function savedWallets(){ return (global.state?.bitcoinWallets || []).filter(w => w && w.address && !w.is_deleted); }
  function sessionWallet(){ const w = st().wallet; return w && w.address ? w : null; }
  function sessionStats(){
    const w = sessionWallet(); if (!w) return null;
    const sel = call("btcGetSelectedWalletAddress", w);
    if (sel && w.addressTypes?.length) { const s = call("btcAddressStatsFromRow", sel) || {}; return { balance: num(s.balance), received: num(s.received), sent: num(s.sent), txCount: num(s.txCount) }; }
    const utx = num(call("btcSummarizeUtxoBalance"));
    const cs = st().lastChainStats || {};
    return { balance: utx, received: num(cs.funded_txo_sum), sent: num(cs.spent_txo_sum), txCount: num(st().historyTotal || cs.tx_count) };
  }
  function savedFor(address){ const a = String(address || "").toLowerCase(); return savedWallets().find(w => String(w.address).toLowerCase() === a) || null; }
  function sessionMatches(addr){
    const w = sessionWallet(); if (!w) return false;
    const a = String(addr || "").toLowerCase();
    if (String(w.address).toLowerCase() === a) return true;
    return (w.addressTypes || []).some(r => String(r.address || "").toLowerCase() === a);
  }

  function host(){
    const panel = doc.getElementById("bitcoinPanel");
    if (!panel || storeEdition()) return null;
    let h = doc.getElementById("btcV2");
    if (!h) {
      h = doc.createElement("div");
      h.id = "btcV2"; h.className = "btc2";
      panel.insertBefore(h, panel.firstChild);
      panel.classList.add("btc-v2-on");
      h.addEventListener("click", onPageClick);
      h.addEventListener("input", e => { if (e.target.matches("[data-btc2-search]")) { PAGE.q = e.target.value; renderList(); } });
      doc.addEventListener("click", e => { if (PAGE.menu && !e.target.closest(".btc2-menu-wrap")) { PAGE.menu = ""; renderPage(); } });
    }
    return h;
  }

  function priceTile(){
    const p = st().btcPrice, ch = st().priceChange;
    const chg = Number.isFinite(ch) ? `<small class="btc2-chg ${ch >= 0 ? "is-up" : "is-down"}"><i class="fa-solid ${ch >= 0 ? "fa-arrow-trend-up" : "fa-arrow-trend-down"}" aria-hidden="true"></i> <span dir="ltr">${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%</span> <span>24h</span></small>` : `<small>Live price</small>`;
    return `<div class="btc2-tile"><span class="btc2-tile-ico is-gold" aria-hidden="true"><i class="fa-brands fa-bitcoin"></i></span><div><span class="btc2-tile-k">Bitcoin price</span><b>${p ? usd(p) : "—"}</b>${chg}</div></div>`;
  }
  function portfolio(){
    const list = savedWallets();
    let sat = 0, known = 0, loading = 0;
    const seen = new Set();
    for (const w of list) {
      if (seen.has(w.address)) continue; seen.add(w.address);
      const l = liveFor(w);
      if (l && !l.error && l.at) { sat += num(l.balanceSat); known++; }
      if (l?.loading) loading++;
    }
    return { sat, known, total: seen.size, loading };
  }
  function renderPage(){
    const h = host(); if (!h) return;
    const pf = portfolio(), list = savedWallets();
    const watch = list.filter(w => w.is_watch_only).length;
    const f = MARKET.fees;
    const sess = sessionWallet();
    const sessSaved = sess ? savedFor(sess.address) || (sess.addressTypes || []).map(r => savedFor(r.address)).find(Boolean) : null;
    const menu = PAGE.menu;
    h.innerHTML = `
      <header class="btc2-head">
        <div class="btc2-title"><h3>Bitcoin</h3><p>Your Bitcoin wallets, live balances and payments. Private keys stay in this browser.</p></div>
        <div class="btc2-actions">
          <div class="btc2-menu-wrap">
            <button type="button" class="aum-btn is-primary" data-btc2="menu" data-v="add" aria-haspopup="menu" aria-expanded="${menu === "add"}"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add wallet <i class="fa-solid fa-chevron-down btc2-caret" aria-hidden="true"></i></button>
            ${menu === "add" ? `<div class="btc2-menu" role="menu">
              ${[["watch", "fa-solid fa-eye", "Watch an address", "Follow any address without its private key"],
                 ["full", "fa-solid fa-key", "Private key (WIF)", "Open a wallet with its WIF key"],
                 ["seed", "fa-solid fa-seedling", "Seed phrase", "Restore a 12 or 24 word wallet"],
                 ["create", "fa-solid fa-wand-magic-sparkles", "Create a wallet", "New key or new seed phrase"],
                 ["hex", "fa-solid fa-code", "Hex private key", "Import a raw 64-character key"],
                 ["brain", "fa-solid fa-brain", "Brain wallet", "Derive a wallet from a passphrase"],
                 ["bulk", "fa-solid fa-file-import", "Bulk import", "Open many keys from a text file"]].map(([k, i, t, s]) =>
                 `<button type="button" role="menuitem" class="btc2-menu-item" data-btc2="add" data-v="${k}"><i class="${i}" aria-hidden="true"></i><span><b>${t}</b><small>${s}</small></span></button>`).join("")}
            </div>` : ""}
          </div>
          <div class="btc2-menu-wrap">
            <button type="button" class="aum-btn" data-btc2="menu" data-v="more" aria-haspopup="menu" aria-expanded="${menu === "more"}" title="More"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i><span class="btc2-hide-sm"> More</span></button>
            ${menu === "more" ? `<div class="btc2-menu is-small" role="menu">
              <button type="button" role="menuitem" class="btc2-menu-item" data-btc2="refresh-all"><i class="fa-solid fa-rotate" aria-hidden="true"></i><span><b>Refresh balances</b></span></button>
              <button type="button" role="menuitem" class="btc2-menu-item" data-btc2="csv-down"><i class="fa-solid fa-download" aria-hidden="true"></i><span><b>Download CSV</b></span></button>
              <button type="button" role="menuitem" class="btc2-menu-item" data-btc2="csv-up"><i class="fa-solid fa-upload" aria-hidden="true"></i><span><b>Upload CSV</b></span></button>
            </div>` : ""}
          </div>
        </div>
      </header>
      <div class="btc2-tiles">
        <div class="btc2-tile is-main"><span class="btc2-tile-ico" aria-hidden="true"><i class="fa-solid fa-wallet"></i></span><div><span class="btc2-tile-k">Portfolio</span><b>${pf.known ? fmtBtcShort(pf.sat) : pf.total ? (pf.loading ? "Loading…" : "—") : fmtBtcShort(0)}</b><small>${pf.known ? `<span dir="ltr">≈ ${usdOf(pf.sat)}</span>` : "<span>Saved wallets</span>"}${pf.total && pf.known < pf.total ? ` · <span dir="ltr">${pf.known}/${pf.total}</span>` : ""}</small></div></div>
        ${priceTile()}
        <div class="btc2-tile"><span class="btc2-tile-ico is-blue" aria-hidden="true"><i class="fa-solid fa-layer-group"></i></span><div><span class="btc2-tile-k">Wallets</span><b>${list.length}</b><small>${watch} watch-only · ${list.length - watch} with keys</small></div></div>
        <div class="btc2-tile"><span class="btc2-tile-ico is-green" aria-hidden="true"><i class="fa-solid fa-gauge-high"></i></span><div><span class="btc2-tile-k">Network fees</span><b dir="ltr">${f ? feeTxt(f.normal) : "—"}</b><small>${f ? `<span>Fast</span> <span dir="ltr">${feeTxt(f.fast)}</span> · <span>Economy</span> <span dir="ltr">${feeTxt(f.economy || f.slow)}</span>` : "Next blocks"}</small></div></div>
      </div>
      ${sess ? `<button type="button" class="btc2-session" data-btc2="open-session">
          <span class="btc2-session-ico" aria-hidden="true"><i class="fa-solid fa-bolt"></i></span>
          <span class="btc2-session-main">${sessSaved?.label ? `<b translate="no">${esc(sessSaved.label)}</b>` : `<b>${sess.isWatchOnly ? "Watch-only wallet" : "Open wallet"}</b>`}<small class="btc2-mono" dir="ltr">${esc(short(sess.address, 12, 10))}</small></span>
          <span class="btc2-session-bal"><b dir="ltr">${esc(fmtBtcShort(sessionStats()?.balance))}</b><small>${esc(usdOf(sessionStats()?.balance))}</small></span>
          <span class="btc2-pill is-live">Open now</span><i class="fa-solid fa-chevron-right btc2-chev" aria-hidden="true"></i>
        </button>` : ""}
      <div class="btc2-note"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span>Private keys and seed phrases are used only in this browser and are never sent or saved online. Back them up safely: lost keys cannot be recovered.</span></div>
      <div class="btc2-tools">
        <label class="btc2-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-btc2-search placeholder="Search name or address" value="${esc(PAGE.q)}" /></label>
        <div class="btc2-chips" role="group" aria-label="Filter">
          ${[["all", "All"], ["mainnet", "Mainnet"], ["test", "Testnet"], ["watch", "Watch-only"], ["keys", "With keys"]].map(([k, t]) => `<button type="button" class="aum-chip" data-btc2="filter" data-v="${k}" aria-pressed="${PAGE.filter === k}">${t}</button>`).join("")}
        </div>
      </div>
      <div class="btc2-list" data-btc2-list></div>`;
    renderList();
  }
  function filtered(){
    const q = PAGE.q.trim().toLowerCase();
    return savedWallets().filter(w => {
      if (PAGE.filter === "mainnet" && (w.network || "mainnet") !== "mainnet") return false;
      if (PAGE.filter === "test" && (w.network || "mainnet") === "mainnet") return false;
      if (PAGE.filter === "watch" && !w.is_watch_only) return false;
      if (PAGE.filter === "keys" && w.is_watch_only) return false;
      if (q && !String(w.label || "").toLowerCase().includes(q) && !String(w.address || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function renderList(){
    const box = doc.querySelector("#btcV2 [data-btc2-list]"); if (!box) return;
    const all = savedWallets(), list = filtered();
    if (!global.state?.bitcoinWalletsLoaded && !all.length) { box.innerHTML = K()?.skel?.(3) || ""; return; }
    if (!all.length) {
      box.innerHTML = `<div class="btc2-empty"><span class="btc2-empty-ico" aria-hidden="true"><i class="fa-brands fa-bitcoin"></i></span>
        <h4>${guest() ? "Open a Bitcoin wallet" : "No saved wallets yet"}</h4>
        <p>${guest() ? "Guest Mode can open wallets but cannot save them." : "Watch an address, open a wallet with its key, or create a new one. Saved wallets appear here with their live balance."}</p>
        <div class="btc2-empty-actions">
          <button type="button" class="aum-btn is-primary" data-btc2="add" data-v="watch"><i class="fa-solid fa-eye" aria-hidden="true"></i> Watch an address</button>
          <button type="button" class="aum-btn" data-btc2="add" data-v="full"><i class="fa-solid fa-key" aria-hidden="true"></i> Private key (WIF)</button>
          <button type="button" class="aum-btn" data-btc2="add" data-v="create"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Create a wallet</button>
        </div></div>`;
      return;
    }
    if (!list.length) { box.innerHTML = `<p class="btc2-none">No wallets match this search.</p>`; return; }
    queueLive(list);
    box.innerHTML = list.map((w, i) => {
      const l = liveFor(w), net = w.network || "mainnet";
      const bal = l && l.at && !l.error ? fmtBtcShort(l.balanceSat) : l?.loading ? "Loading…" : l?.error ? "Unavailable" : "—";
      const val = l && l.at && !l.error ? usdOf(l.balanceSat) : "—";
      const open = sessionMatches(w.address);
      return `<article class="btc2-card${open ? " is-open" : ""}" data-btc2="open" data-id="${esc(w.id)}" tabindex="0" role="button" aria-label="${esc(w.label || w.address)}">
        <div class="btc2-card-id">
          <span class="btc2-idx">${i + 1}</span>
          <span class="btc2-card-ico${net === "mainnet" ? "" : " is-test"}" aria-hidden="true"><i class="fa-brands fa-bitcoin"></i></span>
          <span class="btc2-card-name">${w.label ? `<b translate="no">${esc(w.label)}</b>` : "<b>Bitcoin wallet</b>"}<small class="btc2-mono" dir="ltr">${esc(short(w.address, 10, 8))}</small>
            <span class="btc2-pills"><span class="btc2-pill">${netLabel(net)}</span><span class="btc2-pill ${w.is_watch_only ? "is-watch" : "is-keys"}">${w.is_watch_only ? "Watch-only" : "With keys"}</span>${open ? `<span class="btc2-pill is-live">Open now</span>` : ""}</span></span>
        </div>
        <div class="btc2-cell"><small>Balance</small><b dir="ltr">${esc(bal)}</b></div>
        <div class="btc2-cell"><small>Value</small><b dir="ltr">${esc(val)}</b></div>
        <div class="btc2-cell btc2-hide-sm"><small>Received</small><b dir="ltr">${l && l.at && !l.error ? esc(fmtBtcShort(l.receivedSat)) : "—"}</b></div>
        <div class="btc2-cell btc2-hide-sm"><small>Transactions</small><b>${l && l.at && !l.error ? num(l.txCount) : "—"}</b></div>
        <div class="btc2-card-act">
          <button type="button" class="tm-dp-icon-btn" data-btc2="receive" data-id="${esc(w.id)}" title="Receive" aria-label="Receive"><i class="fa-solid fa-qrcode" aria-hidden="true"></i></button>
          <button type="button" class="tm-dp-icon-btn" data-btc2="copy" data-id="${esc(w.id)}" title="Copy address" aria-label="Copy address"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>
          <button type="button" class="tm-dp-icon-btn" data-btc2="open" data-id="${esc(w.id)}" title="Open" aria-label="Open"><i class="fa-solid fa-chevron-right btc2-chev" aria-hidden="true"></i></button>
        </div>
      </article>`;
    }).join("");
  }
  async function onPageClick(e){
    const a = e.target.closest("[data-btc2]"); if (!a) return;
    const act = a.dataset.btc2, v = a.dataset.v || "", id = a.dataset.id || "";
    const w = id ? savedWallets().find(x => String(x.id) === id) : null;
    if (act !== "menu") { if (PAGE.menu) { PAGE.menu = ""; } }
    if (act === "menu") { e.stopPropagation(); PAGE.menu = PAGE.menu === v ? "" : v; renderPage(); return; }
    if (act === "filter") { PAGE.filter = v; renderPage(); return; }
    if (act === "add") { renderPage(); openAdd(v); return; }
    if (act === "refresh-all") { renderPage(); queueLive(savedWallets(), true); refreshMarket(true); return; }
    if (act === "csv-down") { renderPage(); doc.querySelector('[data-section-csv-download="bitcoin"]')?.click(); return; }
    if (act === "csv-up") { renderPage(); doc.querySelector('[data-section-csv-upload="bitcoin"]')?.click(); return; }
    if (act === "open-session") { openWalletPanel("overview"); return; }
    if (act === "copy" && w) { e.stopPropagation(); await copy(w.address, "Address copied"); return; }
    if (act === "receive" && w) { e.stopPropagation(); await openSaved(w, "receive"); return; }
    if (act === "open" && w) { e.stopPropagation(); await openSaved(w, "overview"); return; }
  }
  doc.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("#btcV2 .btc2-card")) { e.preventDefault(); e.target.click(); }
  });
  async function copy(text, msg){
    try { await (has("btcCopyText") ? global.btcCopyText(text) : navigator.clipboard.writeText(text)); D()?.toast?.(msg || "Copied"); if (!D()?.isOpen?.()) flash(msg || "Copied"); }
    catch (_) { D()?.toast?.("Could not copy", false); }
  }
  function flash(msg){
    let t = doc.getElementById("btc2Flash");
    if (!t) { t = doc.createElement("div"); t.id = "btc2Flash"; t.className = "btc2-flash"; t.setAttribute("role", "status"); doc.body.appendChild(t); }
    t.textContent = msg; t.classList.add("is-on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("is-on"), 1800);
  }

  // Opens a saved wallet: it is loaded (watch-only, as before) unless it is already open.
  const LOAD = { busy: false, label: "" };
  async function openSaved(w, tab){
    if (!sessionMatches(w.address)) {
      LOAD.busy = true; LOAD.label = w.label || "";
      openWalletPanel(tab);
      try { await call("loadSavedBitcoinWallet", w.address, w.network || "mainnet", true); }
      finally { LOAD.busy = false; refreshOpenPanel(); schedulePage(); }
    } else openWalletPanel(tab);
  }

  // ── moving the existing forms into the panel and back ───────────────────────────────
  const MOVED = [];   // { node, parent, next }
  function borrow(node, into){
    if (!node || !into) return;
    if (!MOVED.some(m => m.node === node)) MOVED.push({ node, parent: node.parentNode, next: node.nextSibling });
    into.appendChild(node);
  }
  function giveBack(){
    while (MOVED.length) {
      const m = MOVED.pop();
      try { if (m.parent) m.parent.insertBefore(m.node, m.next && m.next.parentNode === m.parent ? m.next : null); } catch (_) {}
    }
    const send = doc.getElementById("btcSendModal");
    if (send) { send.classList.add("hide"); send.setAttribute("aria-hidden", "true"); }
  }

  // ── "Add wallet" panel ────────────────────────────────────────────────────────────────
  const ADD_TABS = [["watch", "Watch", "fa-solid fa-eye"], ["full", "Private key", "fa-solid fa-key"], ["seed", "Seed phrase", "fa-solid fa-seedling"], ["create", "Create", "fa-solid fa-wand-magic-sparkles"], ["hex", "Hex key", "fa-solid fa-code"], ["brain", "Brain wallet", "fa-solid fa-brain"], ["bulk", "Bulk import", "fa-solid fa-file-import"]];
  const ADD_HELP = {
    watch: "Follow the balance and transactions of any Bitcoin address. No private key is needed; to send later you sign with the key at that moment.",
    full: "Paste the private key in WIF format. It is checked and used only in this browser.",
    seed: "Paste a 12 or 24 word seed phrase to restore its first wallet (m/44'/0'/0'/0/0).",
    create: "Create a brand-new wallet. Write the key or seed phrase down and keep it offline before you receive any bitcoin.",
    hex: "Paste a 64-character hexadecimal private key.",
    brain: "A brain wallet is derived from a passphrase. Use only a long, private and unique phrase: short phrases are guessed and emptied quickly.",
    bulk: "Choose a text file with one private key (WIF) per line. Each wallet is checked live; click a row to open it."
  };
  let addDef = null;
  function openAdd(tab = "watch"){
    const kit = K(); if (!kit || !D()?.custom) return;
    addDef = {
      icon: "bitcoin",
      tab: ADD_TABS.some(t => t[0] === tab) ? tab : "watch",
      tabs: ADD_TABS,
      head(){ return { title: "Add a Bitcoin wallet", sub: "Keys stay in this browser", pills: [kit.pill("Private", "ok", "fa-solid fa-lock")] }; },
      render(t){
        return `${kit.note(esc(ADD_HELP[t] || ""), t === "brain" || t === "create" ? "warn" : "info", t === "brain" || t === "create" ? "fa-solid fa-triangle-exclamation" : "fa-solid fa-circle-info")}
          ${t === "create" ? `<div class="btc2-create">
              <button type="button" class="btc2-choice" data-dp-act="create-key"><i class="fa-solid fa-key" aria-hidden="true"></i><span><b>New private key</b><small>One key with five address types (Legacy, SegWit, Taproot …)</small></span></button>
              <button type="button" class="btc2-choice" data-dp-act="create-seed" data-v="12"><i class="fa-solid fa-seedling" aria-hidden="true"></i><span><b>New 12-word seed phrase</b><small>Easy to write down</small></span></button>
              <button type="button" class="btc2-choice" data-dp-act="create-seed" data-v="24"><i class="fa-solid fa-seedling" aria-hidden="true"></i><span><b>New 24-word seed phrase</b><small>Maximum strength</small></span></button>
            </div>` : ""}
          ${t === "bulk" ? `<div class="aum-actions"><button type="button" class="aum-btn is-primary" data-dp-act="bulk-pick"><i class="fa-solid fa-file-arrow-up" aria-hidden="true"></i> Choose a text file</button></div>` : ""}
          <div class="tm-dp-formhost btc2-formhost" data-btc2-host></div>
          ${!guest() && savedWallets().length ? `<section class="aum-section"><h3>Saved wallets</h3><ul class="tm-dp-rows">${savedWallets().slice(0, 6).map(w => `<li>
              <span class="tm-dp-row-ico is-in" aria-hidden="true"><i class="fa-brands fa-bitcoin"></i></span>
              <span class="tm-dp-row-main">${w.label ? `<b translate="no">${esc(w.label)}</b>` : "<b>Bitcoin wallet</b>"}<small class="btc2-mono" dir="ltr">${esc(short(w.address, 10, 8))}</small></span>
              <span class="tm-dp-row-act"><button type="button" class="aum-btn" data-dp-act="open-saved" data-id="${esc(w.id)}">Open</button></span></li>`).join("")}</ul></section>` : ""}`;
      },
      after(t, body){
        const box = body.querySelector("[data-btc2-host]"); if (!box) return;
        const map = { watch: "btcWatchWalletSection", full: "btcFullWalletSection", seed: "btcSeedWalletSection", hex: "btcHexWalletSection", brain: "btcBrainWalletSection" };
        if (map[t]) {
          call("btcToggleWalletType", t);
          const sec = doc.getElementById(map[t]);
          if (sec) { sec.classList.remove("hide"); borrow(sec, box); }
        }
        if (t === "bulk") { const bulk = doc.getElementById("btcBulkWalletsSection"); if (bulk) borrow(bulk, box); }
        const status = doc.getElementById("btcWalletStatus");
        if (status && t !== "create") borrow(status, box);
        if (t === "create" && status) borrow(status, box);
        requestAnimationFrame(() => { const f = box.querySelector("textarea:not([readonly]), input:not([type=hidden]):not([type=file])"); if (f && !("ontouchstart" in global)) f.focus({ preventScroll: true }); });
      },
      onLeave(){ giveBack(); },
      actions: {
        "create-key": () => { call("btcToggleWalletType", "full"); return call("btcGenerateWallet"); },
        "create-seed": a => { call("btcToggleWalletType", "seed"); return call("btcCreateSeedWallet", Number(a.dataset.v) === 24 ? 24 : 12); },
        "bulk-pick": () => call("btcPromptBulkWalletImport"),
        "open-saved": async a => { const w = savedWallets().find(x => String(x.id) === a.dataset.id); if (w) await openSaved(w, "overview"); }
      }
    };
    D().custom.open(addDef);
  }

  // ── wallet panel ─────────────────────────────────────────────────────────────────────
  const W_TABS = [["overview", "Overview", "fa-solid fa-gauge-high"], ["activity", "Activity", "fa-solid fa-list"], ["receive", "Receive", "fa-solid fa-qrcode"], ["send", "Send", "fa-solid fa-paper-plane"], ["addresses", "Keys", "fa-solid fa-key"], ["insights", "Insights", "fa-solid fa-chart-column"], ["details", "Details", "fa-solid fa-sliders"]];
  let walletDef = null;
  const PST = { filter: "all", q: "", req: { amount: "", label: "", message: "" }, reveal: false, qr: "", qrFor: "", qrErr: false, rename: null, more: false };
  function refreshOpenPanel(){
    const cur = D()?.custom?.current?.();
    if (cur && (cur === walletDef || cur === addDef) && D().custom.currentTab() !== "send") D().custom.render({ keepScroll: true });
  }
  function txView(tx){
    const dir = call("btcTxDirection", tx) || {};
    const net = num(dir.netSat);
    const conf = !!tx?.status?.confirmed;
    const t = num(tx?.status?.block_time) * 1000;
    return { tx, id: tx.txid, net, kind: net > 0 ? "in" : net < 0 ? "out" : "self", conf, t, fee: num(tx.fee), height: tx?.status?.block_height || 0 };
  }
  const dateTxt = ms => { if (!ms) return "Pending"; try { return new Date(ms).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }); } catch (_) { return new Date(ms).toISOString().slice(0, 10); } };
  const timeTxt = ms => { if (!ms) return ""; try { return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch (_) { return ""; } };

  function bip21(addr){
    const p = new URLSearchParams();
    const amt = String(PST.req.amount || "").trim();
    if (amt && num(amt) > 0) p.set("amount", String(Number(num(amt).toFixed(8))));
    if (PST.req.label.trim()) p.set("label", PST.req.label.trim());
    if (PST.req.message.trim()) p.set("message", PST.req.message.trim());
    const qs = p.toString().replace(/\+/g, "%20");
    return `bitcoin:${addr}${qs ? "?" + qs : ""}`;
  }
  function receiveAddress(){
    const w = sessionWallet(); if (!w) return "";
    if (w.isWatchOnly || !w.addressTypes?.length) return w.address;
    return (call("btcGetSelectedWalletAddress", w) || {}).address || w.address;
  }
  async function makeQr(text){
    if (PST.qrFor === text && (PST.qr || PST.qrErr)) return;
    PST.qrFor = text; PST.qr = ""; PST.qrErr = false;
    try {
      if (typeof global.QRCode !== "function") throw new Error("QR library unavailable");
      PST.qr = await call("btcGenerateQRCodeDataURL", text);
    } catch (_) { PST.qr = ""; PST.qrErr = true; }
    const fig = D()?.custom?.body?.()?.querySelector(".btc2-qr");
    if (!fig || PST.qrFor !== text) return;
    fig.classList.remove("is-loading");
    if (PST.qr) { const img = fig.querySelector("[data-btc2-qr]"); if (img) img.src = PST.qr; }
    else fig.innerHTML = `<span class="btc2-qr-off"><i class="fa-solid fa-qrcode" aria-hidden="true"></i>QR code unavailable offline</span>`;
  }

  function openWalletPanel(tab = "overview"){
    const kit = K(); if (!kit || !D()?.custom) return;
    if (!walletDef) walletDef = makeWalletDef(kit);
    walletDef.tab = W_TABS.some(t => t[0] === tab) ? tab : "overview";
    PST.reveal = false; PST.askReveal = false; PST.rename = null; PST.more = false;
    D().custom.open(walletDef);
    refreshMarket();
  }
  function makeWalletDef(kit){
    const { pill, section, kv, btn, iconBtn, note, stats, empty, barChart, lineChart, skel } = kit;
    return {
      icon: "bitcoin",
      tabs: W_TABS,
      state: { filter: "all", q: "" },
      head(){
        const w = sessionWallet();
        if (!w) {
          if (LOAD.busy) return { title: LOAD.label || "Bitcoin wallet", userTitle: !!LOAD.label, sub: "Loading live data…", pills: [pill("Loading", "info", "fa-solid fa-spinner fa-spin")] };
          return null;
        }
        const saved = savedFor(w.address) || (w.addressTypes || []).map(r => savedFor(r.address)).find(Boolean);
        const s = sessionStats() || {};
        const sel = call("btcGetSelectedWalletAddress", w);
        return {
          title: saved?.label || (w.isWatchOnly ? "Watch-only wallet" : "Bitcoin wallet"), userTitle: !!saved?.label,
          sub: `${netLabel(w.key)} · <span class="btc2-mono" dir="ltr">${esc(short(receiveAddress(), 10, 8))}</span>`,
          pills: [pill(w.isWatchOnly ? "Watch-only" : "With keys", w.isWatchOnly ? "info" : "ok", w.isWatchOnly ? "fa-solid fa-eye" : "fa-solid fa-key"),
            sel && !w.isWatchOnly ? pill(sel.label || "") : "",
            pill("\u2066" + fmtBtcShort(s.balance) + "\u2069"),
            saved ? pill("Saved", "", "fa-solid fa-cloud") : guest() ? "" : pill("Not saved", "warn", "fa-solid fa-cloud-arrow-up")]
        };
      },
      render(tab, ps){
        const w = sessionWallet();
        if (!w) return skel(5);
        const s = sessionStats() || { balance: 0, received: 0, sent: 0, txCount: 0 };
        const hist = (st().history || []).map(txView);
        const net = w.key || "mainnet";
        const saved = savedFor(w.address) || (w.addressTypes || []).map(r => savedFor(r.address)).find(Boolean);
        const f = MARKET.fees;
        if (tab === "overview") {
          const pending = hist.filter(x => !x.conf);
          const recent = hist.slice(0, 5);
          return `${section("Balance", `<div class="aum-status is-ok btc2-balance"><b dir="ltr">${esc(fmtBtc(s.balance))}</b><span>≈ ${esc(usdOf(s.balance))}${st().btcPrice ? ` · 1 BTC = ${esc(usd(st().btcPrice))}` : ""}</span></div>
              ${pending.length ? note(`${pending.length} transaction${pending.length > 1 ? "s are" : " is"} waiting for confirmation.`, "warn", "fa-regular fa-clock") : ""}
              <div class="aum-actions is-wrap">
                ${btn("go-send", "Send", "fa-solid fa-paper-plane", { primary: true })}${btn("go-receive", "Receive", "fa-solid fa-qrcode")}${btn("refresh", "Refresh", "fa-solid fa-rotate")}${btn("pdf", "Statement", "fa-solid fa-file-pdf", { disabled: !hist.length })}
              </div>`)}
            ${section("Summary", kv([["Total received", `<span dir="ltr">${esc(fmtBtcShort(s.received))}</span>`], ["Total sent", `<span dir="ltr">${esc(fmtBtcShort(s.sent))}</span>`], ["Transactions", String(s.txCount)], ["Value", esc(usdOf(s.balance))], ["Network", netLabel(net)], ["Network fee now", f ? `<span dir="ltr">${esc(feeTxt(f.normal))}</span>` : "—"]]))}
            ${!saved && !guest() ? note(`This wallet is not saved yet. Save its address to see it on the Bitcoin page with a live balance. <button type="button" class="aum-btn" data-dp-act="save">Save address</button>`, "info", "fa-solid fa-cloud-arrow-up") : ""}
            ${section("Recent activity", recent.length ? rows(recent, net) + (hist.length > 5 ? `<div class="aum-actions">${btn("go-activity", "All activity", "fa-solid fa-list")}</div>` : "") : LOAD.busy ? skel(3) : empty("No transactions yet."))}`;
        }
        if (tab === "activity") {
          const q = String(ps.q || "").trim().toLowerCase();
          ps.filter = ps.filter || "all";
          const list = hist.filter(x => (ps.filter === "all" || (ps.filter === "pending" ? !x.conf : x.kind === ps.filter)) && (!q || x.id.toLowerCase().includes(q)));
          const total = num(st().historyTotal);
          return `<div class="aum-chips">${[["all", "All"], ["in", "Received"], ["out", "Sent"], ["pending", "Pending"]].map(([k, t]) => `<button type="button" class="aum-chip" data-dp-act="filter" data-v="${k}" aria-pressed="${ps.filter === k}">${t}</button>`).join("")}</div>
            <label class="aum-field btc2-inline-search"><span>Search transaction ID</span><input type="search" data-btc2-txq value="${esc(ps.q)}" placeholder="txid" dir="ltr" /></label>
            ${list.length ? rows(list, net, true) : empty(hist.length ? "No transactions match." : "No transactions yet.")}
            <div class="aum-actions is-wrap">
              ${!st().historyDone && hist.length ? btn("more", `Load more${total ? ` (${hist.length}/${total})` : ""}`, "fa-solid fa-angles-down") : ""}
              ${btn("csv", "Export CSV", "fa-solid fa-file-csv", { disabled: !hist.length })}${btn("pdf", "Statement PDF", "fa-solid fa-file-pdf", { disabled: !hist.length })}
            </div>`;
        }
        if (tab === "receive") {
          const addr = receiveAddress();
          const uri = bip21(addr);
          makeQr(uri);
          const types = !w.isWatchOnly && w.addressTypes?.length ? `<div class="aum-chips btc2-types">${w.addressTypes.map(r => `<button type="button" class="aum-chip" data-dp-act="addr-type" data-v="${esc(r.key)}" aria-pressed="${r.address === addr}">${esc(r.label)}</button>`).join("")}</div>` : "";
          return `${types}
            <div class="btc2-receive">
              <figure class="btc2-qr${PST.qr && PST.qrFor === uri || PST.qrErr && PST.qrFor === uri ? "" : " is-loading"}">${PST.qrErr && PST.qrFor === uri ? `<span class="btc2-qr-off"><i class="fa-solid fa-qrcode" aria-hidden="true"></i>QR code unavailable offline</span>` : `<img data-btc2-qr alt="QR code" src="${PST.qr && PST.qrFor === uri ? PST.qr : "data:image/gif;base64,R0lGODlhAQABAAAAACw="}" />`}</figure>
              <div class="btc2-receive-main">
                <small>Address</small>
                <code class="btc2-addr" dir="ltr">${esc(addr)}</code>
                <div class="aum-actions is-wrap">${btn("copy-addr", "Copy address", "fa-regular fa-copy", { primary: true })}${btn("copy-uri", "Copy payment link", "fa-solid fa-link")}${btn("qr-png", "Download QR", "fa-solid fa-download")}${navigator.share ? btn("share", "Share", "fa-solid fa-share-nodes") : ""}</div>
              </div>
            </div>
            ${section("Payment request", `<p class="aum-muted">Add an amount, a label and a message. They go into the QR code and the link, so the payer's wallet fills them in.</p>
              <div class="btc2-req">
                <label class="aum-field"><span>Amount (BTC)</span><input type="number" min="0" step="0.00000001" inputmode="decimal" data-btc2-req="amount" value="${esc(PST.req.amount)}" dir="ltr" placeholder="0.001" /></label>
                <label class="aum-field"><span>Amount (USD)</span><input type="number" min="0" step="0.01" inputmode="decimal" data-btc2-req="usd" value="${PST.req.amount && st().btcPrice ? (num(PST.req.amount) * st().btcPrice).toFixed(2) : ""}" dir="ltr" placeholder="${st().btcPrice ? "50.00" : "—"}" ${st().btcPrice ? "" : "disabled"} /></label>
                <label class="aum-field"><span>Label</span><input type="text" maxlength="60" data-btc2-req="label" value="${esc(PST.req.label)}" placeholder="Invoice 1024" /></label>
                <label class="aum-field"><span>Message</span><input type="text" maxlength="120" data-btc2-req="message" value="${esc(PST.req.message)}" placeholder="Thank you" /></label>
              </div>
              <code class="btc2-uri" dir="ltr">${esc(uri)}</code>`)}
            ${note(w.key === "mainnet" ? "Send only Bitcoin (BTC) to this address. Other coins sent here are lost." : `This is a ${netLabel(w.key)} address: send only ${netLabel(w.key)} coins, never real bitcoin.`, "warn", "fa-solid fa-triangle-exclamation")}`;
        }
        if (tab === "send") {
          return `${f ? `<div class="btc2-fees" role="group" aria-label="Network fee">${[["fast", "Fast", "~10 min", f.fast], ["normal", "Normal", "~30 min", f.normal], ["slow", "Slow", "~1 hour", f.slow], ["economy", "Economy", "1 day+", f.economy || f.slow]].map(([k, t, eta, v]) => `<button type="button" class="btc2-fee" data-dp-act="fee" data-v="${v}"><b>${t}</b><span dir="ltr">${esc(feeTxt(v))}</span><small>${eta}</small></button>`).join("")}</div>` : ""}
            <div class="tm-dp-formhost btc2-formhost btc2-send" data-btc2-send></div>`;
        }
        if (tab === "addresses") {
          const typesHtml = w.isWatchOnly || !w.addressTypes?.length
            ? rowsAddr([{ key: "watch", label: "Watch address", address: w.address, balanceSat: s.balance, txCount: s.txCount }], w.address, true)
            : rowsAddr(w.addressTypes, (call("btcGetSelectedWalletAddress", w) || {}).key, false);
          const keys = w.isWatchOnly ? note("Watch-only: no private key is loaded. To send, you sign with the key in the Send tab.", "info", "fa-solid fa-eye")
            : section("Private keys", `${note("Anyone with these keys can spend this wallet. Show them only when nobody can see your screen.", "warn", "fa-solid fa-triangle-exclamation")}
              ${PST.reveal ? kv([["Private key (WIF, compressed)", keyCell(w.compressedWif, "wif-c")], ["Private key (WIF, uncompressed)", keyCell(w.uncompressedWif, "wif-u")], ["Private key (hex)", keyCell(w.privateKeyHex, "hex")]])
                : PST.askReveal ? `<div class="aum-note is-bad btc2-ask"><i class="fa-solid fa-user-secret" aria-hidden="true"></i><div><b>Make sure nobody can see your screen.</b> Show the private keys now?<div class="aum-actions">${btn("reveal-yes", "Show keys", "fa-solid fa-eye", { danger: true })}${btn("reveal-no", "Cancel", "fa-solid fa-xmark")}</div></div></div>`
                : `<div class="aum-actions">${btn("reveal", "Show private keys", "fa-solid fa-eye")}</div>`}
              <div class="aum-actions is-wrap">${PST.reveal ? btn("hide-keys", "Hide keys", "fa-solid fa-eye-slash") : ""}${btn("paper", "Paper wallet PDF", "fa-solid fa-file-pdf")}</div>`);
          return `${section(w.isWatchOnly ? "Address" : "Address types", `<p class="aum-muted">${w.isWatchOnly ? "" : "One key, five address formats. The selected one is used to receive, send and for the activity list."}</p>${typesHtml}`)}${keys}`;
        }
        if (tab === "insights") {
          const months = kit.lastMonths(12);
          const inM = Object.fromEntries(months.map(k => [k, 0])), outM = Object.fromEntries(months.map(k => [k, 0]));
          for (const x of hist) { if (!x.t) continue; const k = new Date(x.t).toISOString().slice(0, 7); if (k in inM) { if (x.net > 0) inM[k] += x.net / SAT; else if (x.net < 0) outM[k] += -x.net / SAT; } }
          const pts = k => months.map(m => ({ label: kit.monthLabel(m), short: kit.monthLabel(m), value: k[m] }));
          // balance history: walk back from today's balance
          const conf = hist.filter(x => x.t).slice().sort((a, b) => a.t - b.t);
          let bal = s.balance - conf.reduce((sum, x) => sum + x.net, 0);
          const line = conf.map(x => { bal += x.net; return { t: x.t, label: dateTxt(x.t), value: Math.max(0, bal) / SAT }; });
          const fees = hist.filter(x => x.kind === "out" && x.fee);
          const avgFee = fees.length ? fees.reduce((a, x) => a + x.fee, 0) / fees.length : 0;
          const first = conf[0]?.t, last = conf[conf.length - 1]?.t;
          const loaded = hist.length < num(st().historyTotal);
          return `${loaded ? note(`Based on the ${hist.length} most recent transactions. Load more in Activity for a longer history.`, "info") : ""}
            ${stats([[esc(fmtBtcShort(s.received)), "Received"], [esc(fmtBtcShort(s.sent)), "Sent"], [String(hist.filter(x => x.kind === "in").length), "Payments in"], [String(hist.filter(x => x.kind === "out").length), "Payments out"], [avgFee ? esc(`${Math.round(avgFee).toLocaleString("en-US")} sat`) : "—", "Average fee paid"], [first ? esc(dateTxt(first)) : "—", "First activity"]])}
            ${barChart(pts(inM), "BTC", "Received per month", btcFmt)}
            ${barChart(pts(outM), "BTC", "Sent per month", btcFmt)}
            ${lineChart(line, "BTC", "Balance over time", "now", btcFmt)}
            ${last ? `<p class="aum-muted">Last activity ${esc(dateTxt(last))}.</p>` : ""}`;
        }
        if (tab === "details") {
          return `${section("Wallet", kv([["Name", saved ? `<span translate="no">${esc(saved.label || "")}</span>` : "—"], ["Type", w.isWatchOnly ? "Watch-only" : "With keys"], ["Network", netLabel(net)], ["Address", `<code class="btc2-mono" dir="ltr">${esc(receiveAddress())}</code>`], ["Saved", saved ? "Yes" : guest() ? "Not in Guest Mode" : "No"], ["Live data", "Blockstream / mempool.space"]]))}
            ${saved ? section("Rename", `<form data-dp-form class="btc2-rename"><label class="aum-field"><span>Name</span><input type="text" name="label" maxlength="80" value="${esc(PST.rename ?? saved.label ?? "")}" data-btc2-rename /></label><div class="aum-actions"><button type="submit" class="aum-btn is-primary"><i class="fa-solid fa-check" aria-hidden="true"></i> Save name</button></div></form>`) : ""}
            ${section("Links", `<div class="aum-actions is-wrap"><a class="aum-btn" href="${esc(explorerAddr(net, receiveAddress()))}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> View on mempool.space</a>${btn("copy-addr", "Copy address", "fa-regular fa-copy")}</div>`)}
            ${section("Session", `<p class="aum-muted">Closing the wallet removes its keys and data from this browser tab. Saved addresses stay saved.</p><div class="aum-actions is-wrap">${!saved && !guest() ? btn("save", "Save address", "fa-solid fa-cloud-arrow-up", { primary: true }) : ""}${btn("close-wallet", "Close wallet", "fa-solid fa-right-from-bracket")}${saved ? btn("delete", "Remove saved address", "fa-solid fa-trash", { danger: true }) : ""}</div>`)}`;
        }
        return "";
      },
      after(tab, body){
        if (tab === "send") {
          const box = body.querySelector("[data-btc2-send]");
          const modal = doc.getElementById("btcSendModal");
          const dialog = modal?.querySelector(".modal-dialog") || MOVED.find(m => m.node.classList?.contains("btc2-send-dialog"))?.node;
          if (!box || !modal) return;
          call("btcOpenSendModal");
          modal.classList.add("hide"); modal.setAttribute("aria-hidden", "true");
          const form = doc.getElementById("btcSendForm")?.closest(".modal-body") || null;
          const target = form || dialog;
          if (target) { target.classList.add("btc2-send-dialog"); borrow(target, box); }
        }
      },
      onLeave(){ giveBack(); },
      onInput(e, ps){
        if (e.target.matches("[data-btc2-txq]")) { ps.q = e.target.value; const pos = e.target.selectionStart; D().custom.render({ keepScroll: true }); const i = D().custom.body()?.querySelector("[data-btc2-txq]"); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (_) {} } return; }
        if (e.target.matches("[data-btc2-rename]")) { PST.rename = e.target.value; return; }
        const r = e.target.dataset.btc2Req;
        if (r) {
          if (r === "usd") { const p = st().btcPrice; PST.req.amount = p && num(e.target.value) > 0 ? (num(e.target.value) / p).toFixed(8) : ""; }
          else PST.req[r] = e.target.value;
          const body = D().custom.body(); if (!body) return;
          const addr = receiveAddress(), uri = bip21(addr);
          const u = body.querySelector(".btc2-uri"); if (u) u.textContent = uri;
          if (r === "amount") { const usdIn = body.querySelector('[data-btc2-req="usd"]'); if (usdIn && st().btcPrice) usdIn.value = num(PST.req.amount) > 0 ? (num(PST.req.amount) * st().btcPrice).toFixed(2) : ""; }
          if (r === "usd") { const btcIn = body.querySelector('[data-btc2-req="amount"]'); if (btcIn) btcIn.value = PST.req.amount; }
          clearTimeout(PST._qt); PST._qt = setTimeout(() => { body.querySelector(".btc2-qr")?.classList.add("is-loading"); makeQr(uri); }, 250);
        }
      },
      async onSubmit(form){
        const saved = savedFor(sessionWallet()?.address) || (sessionWallet()?.addressTypes || []).map(r => savedFor(r.address)).find(Boolean);
        const label = String(new FormData(form).get("label") || "").trim();
        if (!saved || !label) return;
        await renameSaved(saved, label);
      },
      actions: {
        "go-send": () => D().custom.tab("send"),
        "go-receive": () => D().custom.tab("receive"),
        "go-activity": () => D().custom.tab("activity"),
        refresh: async () => { D().toast("Refreshing…"); await call("btcFetchWalletData", true); refreshMarket(true); refreshOpenPanel(); },
        pdf: () => call("btcDownloadPDF"),
        paper: () => call("btcDownloadWalletPdf"),
        more: async a => { a.disabled = true; await call("btcLoadMoreTransactions"); refreshOpenPanel(); },
        csv: () => exportCsv(),
        filter: (a, ps) => { ps.filter = a.dataset.v; D().custom.render({ keepScroll: true }); },
        "tx-pdf": a => { const tx = (st().history || []).find(t => t.txid === a.dataset.id); if (tx) call("btcDownloadTransactionPDF", tx); },
        "tx-copy": a => copy(a.dataset.id, "Transaction ID copied"),
        "addr-type": async a => { await call("btcSelectAddressType", a.dataset.v); call("updateSaveButtonVisibility"); PST.qrFor = ""; refreshOpenPanel(); },
        "copy-addr": () => copy(receiveAddress(), "Address copied"),
        "copy-key": a => { const w = sessionWallet(); const v = { "wif-c": w?.compressedWif, "wif-u": w?.uncompressedWif, hex: w?.privateKeyHex }[a.dataset.v]; if (v) copy(v, "Key copied"); },
        "copy-uri": () => copy(bip21(receiveAddress()), "Payment link copied"),
        "qr-png": () => { if (!PST.qr) return; const a = doc.createElement("a"); a.href = PST.qr; a.download = `bitcoin-${receiveAddress().slice(0, 10)}.png`; doc.body.appendChild(a); a.click(); a.remove(); },
        share: async () => { try { await navigator.share({ title: "Bitcoin payment", text: bip21(receiveAddress()) }); } catch (_) {} },
        fee: a => { const i = doc.getElementById("btcFeeRate"); if (i) { i.value = String(Number(num(a.dataset.v).toFixed(1))); i.dispatchEvent(new Event("input", { bubbles: true })); } D().custom.body()?.querySelectorAll(".btc2-fee").forEach(b => b.classList.toggle("is-on", b === a)); },
        reveal: () => { PST.askReveal = true; D().custom.render({ keepScroll: true }); },
        "reveal-yes": () => { PST.askReveal = false; PST.reveal = true; D().custom.render({ keepScroll: true }); },
        "reveal-no": () => { PST.askReveal = false; D().custom.render({ keepScroll: true }); },
        "hide-keys": () => { PST.reveal = false; D().custom.render({ keepScroll: true }); },
        save: async () => { global.els?.btcSaveAddressBtn?.click(); setTimeout(() => { refreshOpenPanel(); schedulePage(); }, 1200); },
        "close-wallet": () => { call("btcClearSession"); D().close(); schedulePage(); },
        delete: async () => {
          const saved = savedFor(sessionWallet()?.address) || (sessionWallet()?.addressTypes || []).map(r => savedFor(r.address)).find(Boolean);
          if (!saved) return;
          const ok = typeof appConfirmDelete === "function" ? await appConfirmDelete(`Remove the saved address "${saved.label}"? The wallet itself is not affected.`, { title: "Remove saved address?", confirmLabel: "Remove" }) : global.confirm("Remove this saved address?");
          if (!ok) return;
          await call("deleteBitcoinWallet", saved.id); D().toast("Saved address removed"); refreshOpenPanel(); schedulePage();
        }
      }
    };
    function btcFmt(v){ return `${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} BTC`; }
    function keyCell(v, k){ return v ? `<span class="btc2-key"><code dir="ltr">${esc(v)}</code>${iconBtn("copy-key", "Copy", "fa-regular fa-copy", `data-v="${k}"`)}</span>` : "—"; }
    function rows(list, net, full = false){
      return `<ul class="tm-dp-rows btc2-rows">${list.map(x => `<li>
        <span class="tm-dp-row-ico is-${x.kind === "in" ? "in" : x.kind === "out" ? "out" : "self"}" aria-hidden="true"><i class="fa-solid ${x.kind === "in" ? "fa-arrow-down" : x.kind === "out" ? "fa-arrow-up" : "fa-arrows-rotate"}"></i></span>
        <span class="tm-dp-row-main"><b>${x.kind === "in" ? "Received" : x.kind === "out" ? "Sent" : "Self / change"}${x.conf ? "" : ` <span class="btc2-pill is-warn">Pending</span>`}</b>
          <small>${esc(dateTxt(x.t))}${x.t ? ` · ${esc(timeTxt(x.t))}` : ""} · <span class="btc2-mono" dir="ltr">${esc(short(x.id, 8, 6))}</span></small></span>
        <span class="tm-dp-row-amt"><b dir="ltr" class="${x.kind === "in" ? "is-in" : x.kind === "out" ? "is-out" : ""}">${x.net > 0 ? "+" : x.net < 0 ? "−" : ""}${esc(fmtBtcShort(Math.abs(x.net)))}</b><small>${st().btcPrice ? esc(usdOf(Math.abs(x.net))) : x.height ? `#${x.height}` : ""}</small></span>
        <span class="tm-dp-row-act">${full ? `${iconBtn("tx-pdf", "Receipt PDF", "fa-solid fa-file-pdf", `data-id="${esc(x.id)}"`)}${iconBtn("tx-copy", "Copy transaction ID", "fa-regular fa-copy", `data-id="${esc(x.id)}"`)}` : ""}<a class="tm-dp-icon-btn" href="${esc(explorerTx(net, x.id))}" target="_blank" rel="noopener" title="View on mempool.space" aria-label="View on mempool.space"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a></span>
      </li>`).join("")}</ul>`;
    }
    function rowsAddr(list, selKey, watch){
      return `<ul class="tm-dp-rows btc2-rows">${list.map(r => { const s2 = call("btcAddressStatsFromRow", r) || { balance: num(r.balanceSat), txCount: num(r.txCount) }; const sel = watch || r.key === selKey; return `<li class="${sel ? "is-selected" : ""}">
        <span class="tm-dp-row-ico is-${sel ? "in" : "self"}" aria-hidden="true"><i class="fa-solid ${sel ? "fa-circle-check" : "fa-circle"}"></i></span>
        <span class="tm-dp-row-main"><b>${esc(r.label)}</b><small class="btc2-mono" dir="ltr">${esc(r.address || "")}</small></span>
        <span class="tm-dp-row-amt"><b dir="ltr">${r.loading ? "…" : esc(fmtBtcShort(s2.balance))}</b><small>${r.loading ? "" : `${num(s2.txCount)} tx`}</small></span>
        <span class="tm-dp-row-act">${!watch && !sel ? `<button type="button" class="aum-btn" data-dp-act="addr-type" data-v="${esc(r.key)}">Use</button>` : ""}<button type="button" class="tm-dp-icon-btn" data-dp-act="copy-any" data-v="${esc(r.address || "")}" title="Copy address" aria-label="Copy address"><i class="fa-regular fa-copy" aria-hidden="true"></i></button></span>
      </li>`; }).join("")}</ul>`;
    }
  }
  function exportCsv(){
    const w = sessionWallet(); if (!w) return;
    const lines = [["Date", "Time", "Type", "Amount (BTC)", "Fee (sat)", "Status", "Block", "Transaction ID"]];
    for (const x of (st().history || []).map(txView)) {
      const d = x.t ? new Date(x.t) : null;
      lines.push([d ? d.toISOString().slice(0, 10) : "", d ? d.toISOString().slice(11, 16) : "", x.kind === "in" ? "Received" : x.kind === "out" ? "Sent" : "Self", (x.net / SAT).toFixed(8), String(x.fee || ""), x.conf ? "Confirmed" : "Pending", String(x.height || ""), x.id]);
    }
    const csv = lines.map(r => r.map(c => /[",\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = doc.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `bitcoin-${w.address.slice(0, 10)}-activity.csv`;
    doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  async function renameSaved(saved, label){
    try {
      if (guest()) throw new Error("Not available in Guest Mode.");
      await supabase(`bitcoin_wallets?id=eq.${encodeURIComponent(saved.id)}`, { method: "PATCH", body: JSON.stringify({ label, updated_at: new Date().toISOString() }) });
      saved.label = label; PST.rename = null;
      await call("loadBitcoinWalletsFromDatabase", { force: true });
      D().toast("Name saved"); refreshOpenPanel(); schedulePage();
    } catch (err) { D().toast(String(err?.message || err || "Could not save the name."), false); }
  }

  // ── keep everything in step with the existing code ──────────────────────────────────
  function wrapGlobal(name, after){
    const fn = global[name];
    if (typeof fn !== "function" || fn.__btc2) return;
    const w = function(){
      const r = fn.apply(this, arguments);
      if (r && typeof r.then === "function") return r.then(v => { try { after(); } catch (_) {} return v; });
      try { after(); } catch (_) {}
      return r;
    };
    w.__btc2 = true;
    global[name] = w;
  }
  function onWalletChanged(){
    const cur = D()?.custom?.current?.();
    if (sessionWallet() && cur === addDef && addDef) { openWalletPanel("overview"); }
    else refreshOpenPanel();
    schedulePage();
  }
  function install(){
    if (storeEdition() || !doc.getElementById("bitcoinPanel") || !global.TriplemDetailPanels?.custom) return false;
    if (install.done) return true;
    install.done = true;
    wrapGlobal("btcUpdateWalletView", onWalletChanged);
    wrapGlobal("btcRenderHistory", refreshOpenPanel);
    wrapGlobal("btcUpdateUsdValues", () => { refreshOpenPanel(); schedulePage(); });
    wrapGlobal("btcClearView", () => { schedulePage(); });
    wrapGlobal("renderExistingAddressesDropdown", schedulePage);
    wrapGlobal("btcRenderBulkWallets", refreshOpenPanel);
    // A send that finishes (or is cancelled) closes the old dialog: return to the overview.
    const baseClose = global.closeModal;
    if (typeof baseClose === "function" && !baseClose.__btc2) {
      const c = function(id){
        const r = baseClose.apply(this, arguments);
        if (id === "btcSendModal" && D()?.custom?.current?.() === walletDef && D().custom.currentTab() === "send") { giveBack(); D().custom.tab("overview"); }
        return r;
      };
      c.__btc2 = true; global.closeModal = c;
    }
    // Old buttons that opened pop-ups now open the panel.
    global.btcOpenReceiveModal = function(){ if (sessionWallet()) openWalletPanel("receive"); };
    const panel = doc.getElementById("bitcoinPanel");
    const onShow = () => { if (panel.classList.contains("active")) { renderPage(); refreshMarket(); if (!global.state?.bitcoinWalletsLoaded) call("loadBitcoinWalletsFromDatabase"); } };
    new MutationObserver(onShow).observe(panel, { attributes: true, attributeFilter: ["class"] });
    renderPage(); onShow();
    setInterval(() => { if (panel.classList.contains("active") && !doc.hidden) refreshMarket(); }, 90000);
    return true;
  }
  // copy-any (address rows) is handled at panel level as well
  doc.addEventListener("click", e => { const b = e.target.closest?.("#tmDetailPanel [data-dp-act='copy-any']"); if (b) { e.stopPropagation(); copy(b.dataset.v, "Address copied"); } }, true);

  function boot(){ if (!install()) setTimeout(boot, 400); }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();

  global.TriplemBitcoinV2 = Object.freeze({ openAdd, openWallet: openWalletPanel, render: renderPage });
})(typeof window !== "undefined" ? window : globalThis);
