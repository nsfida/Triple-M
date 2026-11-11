/* Triplem VIP · Microsoft Store edition of the Windows app (2026-11-11)
 *
 * The Windows app from the Microsoft Store (MSIX) tells the page it is the Store
 * edition (window.__TRIPLEM_DESKTOP__.edition === "store", or packaged === true for
 * older Store builds). The Store edition has its own feature set:
 *
 *   * No cryptocurrency features of any kind (Microsoft Store policy 10.2.6): the
 *     related section, currencies, wallets, marketing text, help and AI answers are
 *     not part of this edition, and the app never contacts any cryptocurrency service.
 *   * Updates come only from the Microsoft Store (the app has no self-updater).
 *   * Its own pages: /windows-store/ (about, trial terms, terms, privacy, AI).
 *
 * Nothing here changes stored data: records created on the website stay in the
 * account and appear there as before. The website, phones and the direct-download
 * Windows app are unchanged (this file does nothing outside the Store edition).
 *
 * Loaded as an ordinary script in <head>, after the edition flag is set and before
 * any deferred application script, so every later script can rely on it.
 */
(function () {
  "use strict";

  let desktop = null;
  try { desktop = window.__TRIPLEM_DESKTOP__ || null; } catch (_) { desktop = null; }
  const active = window.TRIPLEM_STORE_APP === true
    || !!(desktop && desktop.app === "windows" && (desktop.edition === "store" || desktop.packaged === true));
  if (active) {
    window.TRIPLEM_STORE_APP = true;
    document.documentElement.classList.add("triplem-store-app");
  }

  const PRODUCT_ID = "9MV028GH5NPX";
  const STORE_PAGE = `ms-windows-store://pdp/?ProductId=${PRODUCT_ID}`;
  const CRYPTO_CODES = new Set(["BTC", "XBT", "ETH", "USDT", "USDC", "BNB", "XRP", "SOL", "ADA", "DOGE", "LTC", "TRX", "DOT", "MATIC"]);
  const WORD = /\b(bit ?coins?|btc|xbt|crypto(?:[- ]?currenc(?:y|ies))?|crypto[- ]?wallets?|blockchains?|satoshis?|sats|ethereum|usdt|tether|binance|altcoins?|web3|nfts?|seed phrases?|wif|xprv)\b|₿/i;
  // ", client-side Bitcoin wallet tools" / " and Bitcoin" / " · BTC blockchain records"
  const LIST_ITEM = /(?:\s*,\s*|\s+(?:and|or)\s+|\s*·\s*|\s*&\s*|\s*\/\s*|\s*\+\s*)(?:(?:client-side|watch-only|local|live|spendable)\s+)?(?:bit ?coins?|btc|crypto(?:[- ]?currenc(?:y|ies))?|blockchains?|satoshis?|ethereum|usdt)(?:\s+(?:wallets?|wallet|tools?|keys?|key control|records?|statements?|transactions?|integration|support|send|receive|balances?|addresses?|prices?|workflows?|tracking|blockchain|records))*(?=[\s,.;:!?)\]·]|$)/gi;
  const BLOCKED_HOSTS = ["blockstream.info", "api.coingecko.com", "mempool.space", "blockchain.info", "api.blockcypher.com", "api.coinbase.com", "api.binance.com"];
  const REMOVE = ".store-hide-crypto,[data-store-remove],option[value=\"BTC\" i],option[value=\"Crypto Wallet\"],[data-currency=\"BTC\" i],[data-section-csv-download=\"bitcoin\"],[data-section-csv-upload=\"bitcoin\"],[data-legacy-fix-section=\"bitcoin\"],.tab[data-tab=\"bitcoin\"],[data-workspace-tab=\"bitcoin\"],[data-dashboard-filter=\"bitcoin\"],img[src*=\"wallet_logos/Bitcoin\"],#windowsDownloadBtn,#iosDownloadBtn,#androidDownloadBtn,a[href*=\"mobile_app/\"],[data-app-panel=\"windows\"],[data-app-panel=\"android\"],[data-app-panel=\"ios\"],[data-app-tab=\"windows\"]";
  // (App downloads are not offered inside the Microsoft Store edition: the Store installs and updates this app.)
  // Containers kept (their ids are used by shared code) but emptied and hidden.
  const EMPTY = "#bitcoinPanel,#btcSendModal,#btcReceiveModal,#btcTransactionSuccessOverlay,#btcWifQrModal,#btcQrScannerModal,#btcSeedModal,.expense-btc-only,#expenseBtcAddressGroup";
  const SKIP = "script,style,noscript,template,textarea,input,[contenteditable=\"true\"],[data-store-keep]";
  const ITEM = "li,option,button,label,summary,details,tr,.currency-chip,.chip,.inv2-chip,[role=\"listitem\"],[role=\"menuitem\"],[role=\"option\"],.live-chat-quick-reply,.live-chat-chip";

  function mentionsCrypto(text) { return WORD.test(String(text || "")); }
  function isCryptoCode(code) { return CRYPTO_CODES.has(String(code || "").trim().toUpperCase()); }
  function tidy(text) {
    return String(text)
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/([,;:])\s*([,.;])/g, "$2")
      .replace(/\(\s*\)/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/^\s*[,;·]\s*/, "")
      .trimEnd() + (/\s$/.test(text) ? " " : "");
  }
  // Removes crypto list items, then whole sentences that still mention crypto.
  function cleanText(text) {
    const src = String(text ?? "");
    if (!active || !WORD.test(src)) return src;
    let out = src.replace(LIST_ITEM, "");
    if (!WORD.test(out)) return tidy(out);
    const lead = (out.match(/^\s*/) || [""])[0];
    const sentences = out.trim().split(/(?<=[.!?])\s+/);
    out = sentences.filter(s => !WORD.test(s)).join(" ");
    if (out && !WORD.test(out)) return lead + tidy(out);
    return "";
  }
  function filterCurrencyCodes(list) {
    return active ? (Array.isArray(list) ? list.filter(c => !isCryptoCode(c)) : list) : list;
  }

  const api = Object.freeze({
    active,
    edition: active ? "store" : (desktop && desktop.app === "windows" ? "direct" : "web"),
    productId: PRODUCT_ID,
    storePage: STORE_PAGE,
    pages: Object.freeze({ home: "/windows-store/", trial: "/windows-store/trial-terms.html", terms: "/windows-store/terms.html", privacy: "/windows-store/privacy.html", ai: "/windows-store/ai.html" }),
    isCryptoCode, mentionsCrypto, cleanText, filterCurrencyCodes,
    clientTag: active ? "windows-store" : (desktop && desktop.app === "windows" ? "windows" : "web")
  });
  Object.defineProperty(window, "TriplemStore", { value: api, configurable: false, writable: false });
  if (!active) return;

  // ---- 1. Network: no cryptocurrency service is ever contacted ------------------------------
  const blocked = url => {
    try {
      const u = new URL(String(url && url.url ? url.url : url), location.href);
      return BLOCKED_HOSTS.some(h => u.hostname === h || u.hostname.endsWith("." + h));
    } catch (_) { return false; }
  };
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      if (blocked(input)) return Promise.reject(new TypeError("Not available in the Microsoft Store edition"));
      return nativeFetch(input, init);
    };
  }
  if (window.XMLHttpRequest) {
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (blocked(url)) throw new TypeError("Not available in the Microsoft Store edition");
      return open.apply(this, arguments);
    };
  }

  // ---- 2. Page content ------------------------------------------------------------------------
  const style = document.createElement("style");
  style.textContent = `${REMOVE},${EMPTY}{display:none!important}html.triplem-store-app .store-only[hidden]{display:revert!important}`;
  (document.head || document.documentElement).appendChild(style);

  let busy = false;
  function cleanAttrs(el) {
    for (const a of ["title", "aria-label", "placeholder", "alt", "data-tooltip"]) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && WORD.test(v)) {
        const c = cleanText(v);
        if (c.trim()) el.setAttribute(a, c); else el.removeAttribute(a);
      }
    }
  }
  function removeItemFor(node) {
    const el = node.parentElement;
    if (!el) return;
    const item = el.closest(ITEM);
    if (item && !item.textContent.trim()) item.remove();
    else if (!el.textContent.trim() && !el.children.length && el !== document.body) el.remove();
  }
  function cleanTree(root) {
    if (!root || (root.nodeType !== 1 && root.nodeType !== 11)) return;
    if (root.nodeType === 1 && root.closest && root.closest(SKIP)) return;
    // Rewritten Store copy written into the page.
    const withText = [];
    if (root.matches && root.matches("[data-store-text]")) withText.push(root);
    root.querySelectorAll && withText.push(...root.querySelectorAll("[data-store-text]"));
    for (const el of withText) { el.textContent = el.getAttribute("data-store-text"); el.removeAttribute("data-store-text"); }
    for (const el of (root.matches && root.matches(".store-only[hidden]") ? [root] : []).concat([...(root.querySelectorAll ? root.querySelectorAll(".store-only[hidden]") : [])])) el.hidden = false;
    // Whole crypto items and sections.
    if (root.matches && root.matches(REMOVE)) { root.remove(); return; }
    root.querySelectorAll && root.querySelectorAll(REMOVE).forEach(el => el.remove());
    const empties = [];
    if (root.matches && root.matches(EMPTY)) empties.push(root);
    root.querySelectorAll && empties.push(...root.querySelectorAll(EMPTY));
    for (const el of empties) { if (el.firstChild) el.replaceChildren(); el.hidden = true; el.setAttribute("aria-hidden", "true"); }
    // Any remaining text (dynamic content, help, server and AI answers).
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const fix = [];
    let n;
    while ((n = walker.nextNode())) if (WORD.test(n.nodeValue) && !(n.parentElement && n.parentElement.closest(SKIP))) fix.push(n);
    for (const t of fix) {
      const c = cleanText(t.nodeValue);
      t.nodeValue = c;
      if (!c.trim()) removeItemFor(t);
    }
    if (root.nodeType === 1) cleanAttrs(root);
    root.querySelectorAll && root.querySelectorAll("[title],[aria-label],[placeholder],[alt],[data-tooltip]").forEach(cleanAttrs);
    if (root.nodeType === 1 && root.tagName === "TITLE" && WORD.test(document.title)) document.title = cleanText(document.title) || "Triplem VIP";
  }
  function run(records) {
    if (busy) return;
    busy = true;
    try {
      if (!records) { cleanTree(document.documentElement); return; }
      for (const r of records) {
        if (r.type === "characterData") {
          const t = r.target;
          if (WORD.test(t.nodeValue) && !(t.parentElement && t.parentElement.closest(SKIP))) { t.nodeValue = cleanText(t.nodeValue); if (!t.nodeValue.trim()) removeItemFor(t); }
        } else if (r.type === "attributes") {
          cleanAttrs(r.target);
        } else {
          r.addedNodes.forEach(node => {
            if (node.nodeType === 3) {
              if (WORD.test(node.nodeValue) && !(node.parentElement && node.parentElement.closest(SKIP))) { node.nodeValue = cleanText(node.nodeValue); if (!node.nodeValue.trim()) removeItemFor(node); }
            } else cleanTree(node);
          });
        }
      }
    } finally { busy = false; }
  }
  const observer = new MutationObserver(run);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["title", "aria-label", "placeholder", "alt", "data-tooltip"] });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => run(null), { once: true });
  else run(null);
})();
