/* Modularized from script.js lines 4574-5588 — debounce, installment/goods meta helpers. Load order must be preserved. */
function shortId(id){
  return id ? `#${String(id).slice(0,8).toUpperCase()}` : "";
}

/**
 * Place a fixed-position menu dropdown under an anchor, flipping above when
 * there is not enough room below the viewport (keeps Delete / last items visible).
 */
function positionFixedMenuDropdown(panel, anchorEl, options = {}){
  if (!panel || !anchorEl) return;
  const gap = Number(options.gap ?? 6);
  const margin = Number(options.margin ?? 10);
  const minWidth = Number(options.minWidth ?? 180);
  const panelWidth = Math.max(panel.offsetWidth || 0, minWidth);
  const panelHeight = panel.offsetHeight || 0;
  const rect = anchorEl.getBoundingClientRect();

  let left = rect.right - panelWidth;
  if (left < margin) left = Math.max(margin, rect.left);
  if (left + panelWidth > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - panelWidth - margin);
  }

  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const openUp = panelHeight > spaceBelow && spaceAbove > spaceBelow;

  let top;
  if (openUp) {
    top = rect.top - panelHeight - gap;
    if (top < margin) top = margin;
  } else {
    top = rect.bottom + gap;
    if (panelHeight > 0 && top + panelHeight > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - panelHeight - margin);
    }
  }

  panel.style.top = `${Math.round(top)}px`;
  panel.style.left = `${Math.round(left)}px`;
}

function groupSortStamp(group){
  return group.activityStamp || 0;
}

function groupByLoan(entries){
  const groups = new Map();

  for (const entry of entries){
    if (!entry.group_id) continue;

    if (!groups.has(entry.group_id)){
      groups.set(entry.group_id, {
        group_id: entry.group_id,
        direction: entry.direction,
        person_name: entry.person_name,
        currency: entry.currency,
        principal: null,
        actions: [],
        notes: entry.notes || "",
        loan_date: entry.loan_date || null,
        activityStamp: 0,
        lastActivity: null
      });
    }

    const g = groups.get(entry.group_id);

    if (entry.entry_kind === "principal"){
      g.principal = entry;
      g.loan_date = entry.loan_date || g.loan_date;
    } else {
      g.actions.push(entry);
    }

    const candidateStamp = Math.max(dateStamp(entry.loan_date), dateStamp(entry.action_date));
    if (candidateStamp >= g.activityStamp){
      g.activityStamp = candidateStamp;
      g.lastActivity = entry.action_date || entry.loan_date || g.lastActivity;
    }
  }

  for (const g of groups.values()){
    if (!g.principal && g.actions.length){
      const first = g.actions[0];
      g.principal = {
        id: first.id,
        group_id: first.group_id,
        direction: first.direction,
        entry_kind: "principal",
        person_name: first.person_name,
        currency: first.currency,
        principal_amount: first.principal_amount,
        action_amount: null,
        loan_date: first.loan_date,
        action_date: null,
        notes: first.notes || null
      };
    }

    const principalStamp = dateStamp(g.principal?.loan_date || g.loan_date);
    const actionStamps = g.actions.map(a => dateStamp(a.action_date)).filter(Boolean);
    const latestActionStamp = actionStamps.length ? Math.max(...actionStamps) : 0;

    g.activityStamp = Math.max(g.activityStamp, principalStamp, latestActionStamp);

    if (!g.lastActivity){
      g.lastActivity =
        g.actions.length
          ? g.actions.slice().sort((a, b) => dateStamp(b.action_date) - dateStamp(a.action_date))[0]?.action_date
          : g.principal?.loan_date || g.loan_date || null;
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const diff = groupSortStamp(b) - groupSortStamp(a);
    if (diff !== 0) return diff;
    return String(b.group_id || "").localeCompare(String(a.group_id || ""));
  });
}

function calculateLoan(group){
  return TripleMLoanMath.calculateLoan(group);
}

function summarizeCurrency(currency){
  const givenGroups = groupByLoan(getActiveEntries().filter(e =>
    e.currency === currency &&
    e.direction === "given" &&
    !hasGoodsTag(e.notes)
  ));
  const takenGroups = groupByLoan(getActiveEntries().filter(e =>
    e.currency === currency &&
    e.direction === "taken" &&
    !hasGoodsTag(e.notes) &&
    !hasExpenseAccountTag(e.notes)
  ));

  const givenPrincipal = givenGroups.reduce((s, g) => s + finiteMoney(g.principal?.principal_amount), 0);
  const givenOpen = givenGroups.reduce((s, g) => s + calculateLoan(g).remaining, 0);
  const takenPrincipal = takenGroups.reduce((s, g) => s + finiteMoney(g.principal?.principal_amount), 0);
  const takenOpen = takenGroups.reduce((s, g) => s + calculateLoan(g).remaining, 0);

  return { currency, givenPrincipal, givenOpen, takenPrincipal, takenOpen };
}

function summarizeExpenseByCurrency(currency){
  const accounts = getExpenseAccounts({ applyUiFilters: false }).filter(a => a.currency === currency);
  const totalAmount = accounts.reduce((sum, account) => sum + finiteMoney(account.openingBalance) + finiteMoney(account.addedMoney), 0);
  const totalExpenses = accounts.reduce((sum, account) => sum + finiteMoney(account.spentMoney), 0);
  const availableBalance = accounts.reduce((sum, account) => sum + finiteMoney(account.balance), 0);
  return { currency, totalAmount, totalExpenses, availableBalance };
}

function overviewOneLine(label, amountHtml){
  return `
    <div class="summary-line summary-line-one">
      <span class="summary-line-one-label">${escapeHtml(label)}</span>
      <span class="summary-line-one-value">${amountHtml}</span>
    </div>
  `;
}

function overviewAvailableLine(amountHtml, balance = 0, usdEquivalent = ""){
  const isNegativeOrZero = Number(balance) <= 0;
  const colorStyle = isNegativeOrZero ? "color: var(--danger) !important;" : "color: var(--success) !important;";
  const moneyClass = isNegativeOrZero ? "danger-amount" : "success-amount";
  let usdLine = "";
  if (usdEquivalent) {
    usdLine = `<div class="summary-line summary-line-one" style="margin-top: 2px;"><span class="summary-line-one-label"></span><span class="summary-line-one-value" style="color: var(--muted); font-size: 0.74rem; font-weight: 600;">≈ $${usdEquivalent}</span></div>`;
  }
  return `<div class="summary-line summary-line-one"><span class="summary-line-one-label available-label" style="${colorStyle}">Available:</span><span class="summary-line-one-value available-amount ${moneyClass}" style="${colorStyle}">${amountHtml}</span></div>${usdLine}`;
}

function overviewExpenseLine(currency, suffix, amountHtml){
  return `<div class="summary-line summary-line-one"><span class="summary-line-one-label summary-line-one-label--with-symbol"><span class="summary-currency-mark">${currencySymbolHtml(currency)}</span><span class="summary-label-suffix">${escapeHtml(suffix)}</span></span><span class="summary-line-one-value">${amountHtml}</span></div>`;
}

function overviewWatermarkCurrency(currency){
  return `<div class="summary-watermark" aria-hidden="true">${currencySymbolHtml(currency)}</div>`;
}

const DEFAULT_WALLET_LOGO_PATH = "Assets/logo/wallet_logos/triplem_default_wallet.png";

/** Per-turn memo so one Expenses render (and nested logo lookups) rebuild accounts once. */
let expenseAccountsSyncCache = null;
let expenseAccountsSyncCacheGen = 0;

function getExpenseAccountsSyncCache(){
  if (!expenseAccountsSyncCache) {
    const gen = ++expenseAccountsSyncCacheGen;
    expenseAccountsSyncCache = { unfiltered: null, logoByName: null, gen };
    queueMicrotask(() => {
      if (expenseAccountsSyncCache && expenseAccountsSyncCache.gen === gen) {
        expenseAccountsSyncCache = null;
      }
    });
  }
  return expenseAccountsSyncCache;
}

function invalidateExpenseAccountsSyncCache(){
  expenseAccountsSyncCache = null;
}

/** Instantly adjust lazy wallet summaries so UI balances update before SQL reload. */
function applyOptimisticExpenseLazySummaryForRows(rows){
  if (!isExpenseLazyMode() || !state.expenseLazy?.summaryByGroupId) return;
  let touched = false;
  for (const row of asEntryArray(rows)) {
    if (!row || row.entry_kind === "principal") continue;
    if (!hasExpenseAccountTag(row.notes) && !entryBelongsToLedgerScope(row, LEDGER_SCOPE_EXPENSES)) continue;
    const meta = expenseMetaFromNotes(row.notes);
    const rowType = String(meta.rowType || "").toUpperCase();
    if (rowType !== "TOPUP" && rowType !== "EXPENSE") continue;
    const gid = String(row.group_id || "").trim();
    if (!gid) continue;
    const prev = state.expenseLazy.summaryByGroupId.get(gid);
    if (!prev) continue;
    const amt = finiteMoney(row.action_amount);
    if (!(amt > 0)) continue;
    const next = { ...prev };
    if (rowType === "TOPUP") {
      next.topup_total = finiteMoney(prev.topup_total) + amt;
    } else {
      next.spend_total = finiteMoney(prev.spend_total) + amt;
    }
    next.balance = finiteMoney(next.opening_balance) + finiteMoney(next.topup_total) - finiteMoney(next.spend_total);
    state.expenseLazy.summaryByGroupId.set(gid, next);
    touched = true;
  }
  if (touched) invalidateExpenseAccountsSyncCache();
}

function debounce(fn, waitMs = 180){
  let timer = null;
  const wrapped = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

function walletLogoFilePath(walletName){
  const safe = String(walletName || "Wallet").trim() || "Wallet";
  return `Assets/logo/wallet_logos/${escapeHtml(safe)}.png`;
}

function escapeLogoSrc(src){
  const s = String(src ?? "");
  // Skip full HTML escaping for large data/http URLs that cannot contain markup chars.
  if ((s.startsWith("data:") || s.startsWith("https:") || s.startsWith("http:")) &&
      s.indexOf('"') === -1 && s.indexOf("<") === -1 && s.indexOf("'") === -1) {
    return s;
  }
  return escapeHtml(s);
}

function getWalletCustomLogoMap(){
  const cache = getExpenseAccountsSyncCache();
  if (cache.logoByName) return cache.logoByName;
  const map = new Map();
  for (const account of getExpenseAccounts({ applyUiFilters: false })) {
    const name = String(account.person_name || "").trim().toLowerCase();
    const logo = String(account.customLogoUrl || "").trim();
    if (name && logo) map.set(name, logo);
  }
  cache.logoByName = map;
  return map;
}

function customLogoForWalletName(walletName){
  const name = String(walletName || "").trim().toLowerCase();
  if (!name) return "";
  return getWalletCustomLogoMap().get(name) || "";
}

function resolveWalletLogoSrc(walletName, customLogoUrl = ""){
  const custom = String(customLogoUrl || "").trim();
  if (custom) return custom;
  return walletLogoFilePath(walletName);
}

function walletLogoOnErrorHandler(){
  const fallback = DEFAULT_WALLET_LOGO_PATH.replace(/'/g, "\\'");
  // One fallback attempt only — never leave onerror attached after switching to default.
  return `if(this.dataset.fallbackApplied==='1'){this.onerror=null;return;}this.dataset.fallbackApplied='1';this.onerror=null;this.src='${fallback}';`;
}

function overviewWatermarkWallet(walletName, currency, customLogoUrl = ""){
  const resolvedCustom = customLogoUrl !== "" && customLogoUrl != null
    ? customLogoUrl
    : customLogoForWalletName(walletName);
  const logoPath = resolveWalletLogoSrc(walletName, resolvedCustom);
  return `
    <div class="summary-watermark" aria-hidden="true">
      <img src="${escapeLogoSrc(logoPath)}" alt="${escapeHtml(walletName)} logo"
           style="width: 100%; height: 100%; object-fit: contain; opacity: 0.45;"
           onerror="${walletLogoOnErrorHandler()}">
    </div>
  `;
}

function getWalletIconHtml(walletName, size = 20, customLogoUrl = null){
  const resolvedCustom = customLogoUrl != null ? customLogoUrl : customLogoForWalletName(walletName);
  const logoPath = resolveWalletLogoSrc(walletName, resolvedCustom);
  return `
    <span class="wallet-icon-inline" style="display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;">
      <img src="${escapeLogoSrc(logoPath)}" alt="${escapeHtml(walletName)}"
           style="width:${size}px;height:${size}px;object-fit:contain;vertical-align:middle;"
           loading="lazy" decoding="async"
           onerror="${walletLogoOnErrorHandler()}">
    </span>
  `;
}

function walletLogoPhotoMenuHtml(groupId, walletName = "Wallet", options = {}){
  const gid = escapeHtml(groupId || "");
  const name = escapeHtml(walletName || "Wallet");
  const hasCustom = !!options.hasCustomLogo;
  return `
    <div class="menu-wrap wallet-logo-menu-wrap" data-wallet-logo-menu="${gid}">
      <button type="button" class="wallet-logo-photo-btn menu-trigger" data-wallet-logo-trigger="${gid}" title="Wallet photo" aria-label="Wallet photo for ${name}" aria-haspopup="menu" aria-expanded="false">
        <i class="fa-solid fa-camera" aria-hidden="true"></i>
      </button>
      <div class="menu-dropdown wallet-logo-menu-dropdown" data-wallet-logo-panel="${gid}">
        <button type="button" class="menu-item walletLogoMenuAction" data-action="view" data-group-id="${gid}">View</button>
        <button type="button" class="menu-item walletLogoMenuAction" data-action="change" data-group-id="${gid}">Change</button>
        <button type="button" class="menu-item walletLogoMenuAction wallet-logo-default-action${hasCustom ? "" : " hide"}" data-action="default" data-group-id="${gid}">Default</button>
      </div>
    </div>
  `;
}

function isStoredWalletLogoUrl(url){
  const u = String(url || "").trim();
  if (!u || u.startsWith("data:") || u.startsWith("Assets/")) return false;
  return /\/storage\/v1\/object\/(?:public\/)?company-logos\//i.test(u);
}

function walletLogoStorageObjectPath(url){
  const u = String(url || "").trim();
  const match = u.match(/\/storage\/v1\/object\/public\/company-logos\/([^?#]+)/i)
    || u.match(/\/storage\/v1\/object\/company-logos\/([^?#]+)/i);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Scrollable ancestors used while long-press-dragging cards on mobile. */
function findCardReorderScrollParents(startEl){
  const list = [];
  let el = startEl instanceof Element ? startEl : null;
  while (el && el !== document.documentElement) {
    if (el instanceof HTMLElement) {
      try {
        const style = window.getComputedStyle(el);
        const oy = style.overflowY || style.overflow;
        const canY = /(auto|scroll|overlay)/i.test(oy);
        if (canY && el.scrollHeight > el.clientHeight + 1) list.push(el);
      } catch (_) {}
    }
    el = el.parentElement;
  }
  const root = document.scrollingElement || document.documentElement;
  if (root && !list.includes(root)) list.push(root);
  return list;
}

/**
 * Mobile-safe drag scroll lock:
 * - blocks native page scroll via non-passive touchmove while a card is lifted
 * - programmatically scrolls near top/bottom so the list follows the finger
 */
function createCardReorderDragSession(lockClass = "card-reorder-drag-lock"){
  let active = false;
  let raf = 0;
  let scrollParents = [];
  let lastClientX = 0;
  let lastClientY = 0;
  let onAutoScroll = null;

  const blockNativeScroll = (e) => {
    if (!active) return;
    if (e.cancelable) e.preventDefault();
  };

  const tickAutoScroll = () => {
    raf = 0;
    if (!active) return;
    const vh = window.innerHeight || 0;
    if (vh < 80) return;
    const edge = Math.min(96, Math.max(56, Math.floor(vh * 0.2)));
    const maxStep = 28;
    let dy = 0;
    if (lastClientY < edge) {
      dy = -Math.max(6, Math.ceil((1 - Math.max(0, lastClientY) / edge) * maxStep));
    } else if (lastClientY > vh - edge) {
      const dist = Math.max(0, vh - lastClientY);
      dy = Math.max(6, Math.ceil((1 - dist / edge) * maxStep));
    }
    if (dy) {
      for (const scroller of scrollParents) {
        if (!scroller) continue;
        if (
          scroller === document.documentElement
          || scroller === document.body
          || scroller === document.scrollingElement
        ) {
          window.scrollBy(0, dy);
        } else {
          scroller.scrollTop += dy;
        }
      }
      try { onAutoScroll?.(lastClientX, lastClientY); } catch (_) {}
    }
    // Keep edge scrolling continuous while finger is held in the zone.
    const nearEdge = lastClientY < edge || lastClientY > vh - edge;
    if (nearEdge) raf = requestAnimationFrame(tickAutoScroll);
  };

  return {
    get active(){ return active; },
    start(anchorEl, clientY = 0, options = {}){
      if (active) this.stop();
      active = true;
      lastClientX = Number(options.clientX) || 0;
      lastClientY = Number(clientY) || 0;
      onAutoScroll = typeof options.onAutoScroll === "function" ? options.onAutoScroll : null;
      scrollParents = findCardReorderScrollParents(anchorEl);
      document.documentElement.classList.add(lockClass);
      document.body.classList.add(lockClass);
      document.addEventListener("touchmove", blockNativeScroll, { passive: false, capture: true });
      document.addEventListener("gesturestart", blockNativeScroll, { passive: false, capture: true });
    },
    update(clientX, clientY){
      if (!active) return;
      lastClientX = Number(clientX) || 0;
      lastClientY = Number(clientY) || 0;
      const vh = window.innerHeight || 0;
      const edge = Math.min(96, Math.max(56, Math.floor(vh * 0.2)));
      const nearEdge = lastClientY < edge || lastClientY > vh - edge;
      if (nearEdge && !raf) raf = requestAnimationFrame(tickAutoScroll);
      if (!nearEdge && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    stop(){
      active = false;
      onAutoScroll = null;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      document.documentElement.classList.remove(lockClass);
      document.body.classList.remove(lockClass);
      document.removeEventListener("touchmove", blockNativeScroll, { capture: true });
      document.removeEventListener("gesturestart", blockNativeScroll, { capture: true });
      scrollParents = [];
    }
  };
}

function overviewWatermarkGoods(){
  return `<div class="summary-watermark summary-watermark-goods" aria-hidden="true">🛒</div>`;
}

function overviewWatermarkExpenses(currencies){
  if (!currencies.length) return "";
  const layers = currencies.map((currency, index) =>
    `<span class="summary-watermark-symbol" style="animation-delay:${index * 0.55}s">${currencySymbolHtml(currency)}</span>`
  ).join("");
  return `<div class="summary-watermark summary-watermark-expense" aria-hidden="true">${layers}</div>`;
}

function hash01(str){
  const s = String(str || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // unsigned → [0,1)
  return ((h >>> 0) % 100000) / 100000;
}

function overviewWatermarkFloatingWalletLogos(accounts){
  const list = Array.isArray(accounts) ? accounts : [];
  if (!list.length) return "";
  
  // Ensure at least 7 logos by duplicating wallets if needed
  const logoCount = Math.max(list.length, 7);
  const logos = [];
  
  for (let i = 0; i < logoCount; i++) {
    const account = list[i % list.length];
    const name = String(account.person_name || "Wallet").trim() || "Wallet";
    
    // Use Math.random() for truly random movement (not deterministic)
    const dur = (12 + Math.random() * 24).toFixed(1); // 12..36s
    const delay = (Math.random() * -15).toFixed(1); // random negative delay
    const scale = (0.7 + Math.random() * 0.6).toFixed(2); // 0.7..1.3
    const left = (Math.random() * 95).toFixed(2); // 0..95%
    const top = (Math.random() * 95).toFixed(2); // 0..95%
    
    // Random animation variant for each logo
    const animVariant = Math.floor(Math.random() * 4); // 0..3
    const animName = `wallet-drift-${animVariant}`;
    
    const cssVars = [
      `--d:${dur}s`,
      `--delay:${delay}s`,
      `--s:${scale}`
    ].join(";");
    
    const logoPath = resolveWalletLogoSrc(name, account.customLogoUrl || "");
    logos.push(`
      <span class="wallet-float-logo" style="${cssVars}; left:${left}%; top:${top}%; animation-name: wallet-fade-in, ${animName};">
        <img src="${escapeLogoSrc(logoPath)}" alt="" aria-hidden="true" loading="lazy" decoding="async" onerror="${walletLogoOnErrorHandler()}"/>
      </span>
    `);
  }
  
  return `<div class="wallet-float-watermark" aria-hidden="true">${logos.join("")}</div>`;
}

function expenseOverviewWalletCardHtml(a){
  const totalTopup = Number(a.openingBalance || 0) + Number(a.addedMoney || 0);
  const isBtcLive = a.currency === "BTC";
  let btcUsdEquivalent = "";
  if (a.currency === "BTC") {
    const btcBalance = Number(a.balance || 0);
    if (btcBalance > 0 && state.bitcoin.btcPrice) {
      btcUsdEquivalent = (btcBalance * state.bitcoin.btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }
  const addressLine = a.btcAddress
    ? `<span class="expense-wallet-address mono" title="${escapeHtml(a.btcAddress)}">${escapeHtml(a.btcAddress)}</span>`
    : "";
  const walletEditBtn = teamCanShowEdit("entries")
    ? `<button class="tiny ghost" onclick="openEditModal('${escapeHtml(a.principal?.id || '')}')">Edit</button>`
    : "";
  const walletDeleteBtn = teamCanShowDelete("entries")
    ? `<button class="tiny danger" onclick="deleteExpenseWallet('${escapeHtml(a.group_id)}', '${escapeHtml(a.person_name || 'Wallet')}')">Delete Wallet</button>`
    : "";
  const actions = isBtcLive
    ? `
        <button class="tiny ghost walletDownloadPdfBtn" title="Download wallet transactions PDF" aria-label="Download wallet transactions PDF" onclick="downloadExpenseAccountPDF('${escapeHtml(a.group_id)}')"><i class="fa-solid fa-download"></i></button>
        ${walletEditBtn}
        ${walletDeleteBtn}
      `
    : `
        <button class="tiny ghost" onclick="openExpenseModal('topup', '${escapeHtml(a.group_id)}')">Add Money</button>
        <button class="tiny ghost" onclick="openExpenseModal('expense', '${escapeHtml(a.group_id)}')">Add Expense</button>
        <button class="tiny ghost" onclick="openTransferModal('${escapeHtml(a.group_id)}', '${escapeHtml(a.person_name || 'Wallet')}', '${escapeHtml(a.currency)}')">Transfer</button>
        <button class="tiny ghost walletDownloadPdfBtn" title="Download wallet transactions PDF" aria-label="Download wallet transactions PDF" onclick="downloadExpenseAccountPDF('${escapeHtml(a.group_id)}')"><i class="fa-solid fa-download"></i></button>
        ${walletEditBtn}
        ${walletDeleteBtn}
      `;

  return `
    <div class="summary currency-summary wallet-details-card" data-wallet-details="${escapeHtml(a.group_id)}" data-group-id="${escapeHtml(a.group_id)}" role="button" tabindex="0" title="View wallet details · Long-press to reorder">
      ${walletLogoPhotoMenuHtml(a.group_id, a.person_name || "Wallet", { hasCustomLogo: !!String(a.customLogoUrl || "").trim() })}
      ${overviewWatermarkWallet(a.person_name || "Wallet", a.currency, a.customLogoUrl || "")}
      <div class="currency-head" style="font-size:1.1rem;gap:6px;justify-content:flex-start;">
        ${currencySymbolHtml(a.currency)}
        ${getWalletIconHtml(a.person_name || "Wallet", 24, a.customLogoUrl || "")}
        <span style="font-size:.8rem;font-weight:750;line-height:1.2;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.person_name || "Wallet")}</span>
      </div>
      ${addressLine}
      ${overviewOneLine(isBtcLive ? "Received:" : "Top-up:", money(totalTopup, a.currency))}
      ${overviewOneLine(isBtcLive ? "Sent:" : "Spent:", money(a.spentMoney, a.currency))}
      ${overviewAvailableLine(money(a.balance, a.currency), a.balance, btcUsdEquivalent)}
      <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
        ${actions}
      </div>
    </div>
  `;
}

function getActiveTabKey(){
  const activePanel = document.querySelector(".panel.active");
  if (activePanel?.id && activePanel.id.endsWith("Panel")) {
    return activePanel.id.replace(/Panel$/, "");
  }
  return document.querySelector(".tab.active[data-tab]")?.dataset.tab || "dashboard";
}

function inventoryOverviewTotals(groups, selector){
  return groups.reduce((acc, group) => {
    const currency = group.currency || "";
    const amount = Number(selector(group) || 0);
    if (!amount) return acc;
    acc[currency] = (acc[currency] || 0) + amount;
    return acc;
  }, {});
}

function inventoryOverviewAmountText(totals){
  const rows = Object.entries(totals || {}).filter(([, amount]) => Number(amount || 0));
  return rows.length
    ? rows.map(([currency, amount]) => formatReportAmount(amount, currency)).join(" | ")
    : "0";
}

function setMainOverviewHeading(mode){
  if (!els.mainOverview) return;
  const title = els.mainOverview.querySelector(".overview-top h2, .overview-top h3");
  const desc = els.mainOverview.querySelector(".overview-top p");
  if (mode === "inventory"){
    if (title) title.textContent = "Inventory Overview";
    if (desc) desc.textContent = "Inventory purchase, sales, profit, and loss summary.";
    if (els.toggleMainOverviewBtn) els.toggleMainOverviewBtn.title = els.mainOverview.classList.contains("collapsed") ? "Expand Inventory Overview" : "Collapse Inventory Overview";
  } else {
    if (title) title.textContent = "Loans Overview";
    if (desc) desc.textContent = "Loan balances shown by currency.";
    if (els.toggleMainOverviewBtn) els.toggleMainOverviewBtn.title = els.mainOverview.classList.contains("collapsed") ? "Expand Loans Overview" : "Collapse Loans Overview";
  }
}

function renderInventoryOverviewCards(){
  const goodsAll = getGoodsGroups({ applyUiFilters: false });
  const boughtCount = goodsAll.length;
  const soldItemCount = goodsAll.filter(group => Number(group.soldQty || 0) > 0).length;
  const profitGroups = goodsAll.filter(group => Number(group.profitLoss || 0) > 0);
  const lossGroups = goodsAll.filter(group => Number(group.profitLoss || 0) < 0);
  const purchaseTotalText = inventoryOverviewAmountText(inventoryOverviewTotals(goodsAll, group => group.bought));
  const salesTotalText = inventoryOverviewAmountText(inventoryOverviewTotals(goodsAll, group => group.soldTotal));
  const paidTotalText = inventoryOverviewAmountText(inventoryOverviewTotals(goodsAll, group => group.paidTotal));
  const balanceTotalText = inventoryOverviewAmountText(inventoryOverviewTotals(goodsAll, group => group.balanceTotal));
  const profitTotalText = inventoryOverviewAmountText(inventoryOverviewTotals(profitGroups, group => Math.max(Number(group.profitLoss || 0), 0)));
  const lossTotalText = inventoryOverviewAmountText(inventoryOverviewTotals(lossGroups, group => Math.abs(Number(group.profitLoss || 0))));
  const boughtQty = inventoryQtySummary(goodsAll, "boughtQty");
  const soldQty = inventoryQtySummary(goodsAll, "soldQty");
  const stockQty = inventoryQtySummary(goodsAll, "remainingQty");

  els.statsGrid.innerHTML = `
    <div class="summary currency-summary goods-overview">
      ${overviewWatermarkGoods()}
      <div class="currency-head"><i class="fa-solid fa-boxes-stacked"></i></div>
      ${overviewOneLine("Purchased items:", `<strong>${escapeHtml(boughtCount)}</strong>`)}
      ${overviewOneLine("Purchase qty:", `<strong>${escapeHtml(boughtQty)}</strong>`)}
      ${overviewOneLine("Purchase total:", `<strong>${escapeHtml(purchaseTotalText)}</strong>`)}
      ${overviewOneLine("In stock qty:", `<strong>${escapeHtml(stockQty)}</strong>`)}
      <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
        <button class="tiny ghost" onclick="window.location.href='#goodsPanel'">View Inventory</button>
        <button class="tiny ghost" onclick="openGoodsModal('bought')">Add Item</button>
      </div>
    </div>
    <div class="summary currency-summary goods-overview">
      ${overviewWatermarkGoods()}
      <div class="currency-head"><i class="fa-solid fa-cash-register"></i></div>
      ${overviewOneLine("Sold items:", `<strong>${escapeHtml(soldItemCount)}</strong>`)}
      ${overviewOneLine("Sold qty:", `<strong>${escapeHtml(soldQty)}</strong>`)}
      ${overviewOneLine("Sales total:", `<strong>${escapeHtml(salesTotalText)}</strong>`)}
      ${overviewOneLine("Paid total:", `<strong>${escapeHtml(paidTotalText)}</strong>`)}
    </div>
    <div class="summary currency-summary goods-overview">
      ${overviewWatermarkGoods()}
      <div class="currency-head"><i class="fa-solid fa-arrow-trend-up"></i></div>
      ${overviewOneLine("Profit items:", `<strong>${escapeHtml(profitGroups.length)}</strong>`)}
      ${overviewOneLine("Profit total:", `<strong>${escapeHtml(profitTotalText)}</strong>`)}
      ${overviewOneLine("Balance due:", `<strong>${escapeHtml(balanceTotalText)}</strong>`)}
      ${overviewOneLine("Net stock:", `<strong>${escapeHtml(stockQty)}</strong>`)}
    </div>
    <div class="summary currency-summary goods-overview">
      ${overviewWatermarkGoods()}
      <div class="currency-head"><i class="fa-solid fa-arrow-trend-down"></i></div>
      ${overviewOneLine("Loss items:", `<strong>${escapeHtml(lossGroups.length)}</strong>`)}
      ${overviewOneLine("Loss total:", `<strong>${escapeHtml(lossTotalText)}</strong>`)}
      ${overviewOneLine("Sales total:", `<strong>${escapeHtml(salesTotalText)}</strong>`)}
      ${overviewOneLine("Balance due:", `<strong>${escapeHtml(balanceTotalText)}</strong>`)}
      <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
        <button class="tiny ghost" onclick="downloadGoodsPDF()"><i class="fa-solid fa-download"></i></button>
      </div>
    </div>
  `;
}

function renderOverviewCards(tab = getActiveTabKey()){
  const mode = tab === "goods" ? "inventory" : "loans";
  setMainOverviewHeading(mode);
  if (mode === "inventory"){
    renderInventoryOverviewCards();
    return;
  }
  const allowedCurrencies = getPageScopedCurrencies();
  const activeLoanCurrencies = getActiveEntries()
    .filter(entry => !hasGoodsTag(entry.notes) && !hasExpenseAccountTag(entry.notes))
    .map(entry => normalizeCurrencyCode(entry.currency))
    .filter(currency => allowedCurrencies.includes(currency));
  const currencies = activeLoanCurrencies.length
    ? sortCurrenciesList(activeLoanCurrencies)
    : sortCurrenciesList(allowedCurrencies);

  const currencyCards = currencies.map(currency => {
    const s = summarizeCurrency(currency);
    return `
      <div class="summary currency-summary">
        ${overviewWatermarkCurrency(currency)}
        <div class="currency-head">
          ${currencySymbolHtml(currency)}
        </div>
        ${overviewOneLine("Given Principal:", money(s.givenPrincipal, currency))}
        ${overviewOneLine("Given Open:", money(s.givenOpen, currency))}
        ${overviewOneLine("Taken Principal:", money(s.takenPrincipal, currency))}
        ${overviewOneLine("Taken Open:", money(s.takenOpen, currency))}
        <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="tiny ghost" onclick="activate('given')">View Given</button>
          <button class="tiny ghost" onclick="activate('taken')">View Taken</button>
          <button class="tiny ghost" onclick="downloadCurrencyPDF('${currency}')"><i class="fa-solid fa-download"></i></button>
        </div>
      </div>
    `;
  }).join("");

  els.statsGrid.innerHTML = currencyCards;
}

function matchesSearch(entry, term){
  if (!term) return true;
  const blob = `${entry.person_name || ""} ${entry.notes || ""} ${entry.currency || ""} ${displayDate(entry.loan_date)} ${displayDate(entry.action_date)}`.toLowerCase();
  return blob.includes(term.toLowerCase());
}

function hasInstallmentTag(noteValue){
  return String(noteValue || "").includes(INSTALLMENT_TAG);
}

function hasGoodsTag(noteValue){
  return String(noteValue || "").includes(GOODS_TAG);
}

function normalizeInstallmentNote(noteValue, markInstallment){
  const base = String(noteValue || "").replace(INSTALLMENT_TAG, "").trim();
  if (!markInstallment) return base || null;
  return base ? `${INSTALLMENT_TAG} ${base}` : INSTALLMENT_TAG;
}

function installmentMetaTagCleanRegex(){
  return /\[(ICNT|IAMT|ILAST|IFREQ|ISTART|IALLOC|IDOWN|IFIN|IPTYPE):[^\]]*\]/gi;
}

function installmentMetaFromNotes(noteValue){
  const text = String(noteValue || "");
  const readNum = (key) => {
    const m = text.match(new RegExp(`\\[${key}:([^\\]]+)\\]`, "i"));
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };
  const readText = (key) => {
    const m = text.match(new RegExp(`\\[${key}:([^\\]]*)\\]`, "i"));
    return m ? m[1].trim() : "";
  };
  return {
    count: readNum("ICNT"),
    installmentAmount: readNum("IAMT"),
    lastAmount: readNum("ILAST"),
    downPayment: readNum("IDOWN"),
    financedAmount: readNum("IFIN"),
    frequency: readText("IFREQ") || "monthly",
    startDate: readText("ISTART"),
    allocation: readText("IALLOC"),
    paymentType: readText("IPTYPE")
  };
}

function upsertInstallmentMetaInNote(noteValue, meta = {}){
  let note = normalizeInstallmentNote(noteValue, true) || INSTALLMENT_TAG;
  note = note.replace(installmentMetaTagCleanRegex(), "").replace(/\s{2,}/g, " ").trim();
  const tags = [];
  if (meta.count != null) tags.push(`[ICNT:${meta.count}]`);
  if (meta.installmentAmount != null) tags.push(`[IAMT:${meta.installmentAmount}]`);
  if (meta.lastAmount != null) tags.push(`[ILAST:${meta.lastAmount}]`);
  if (meta.downPayment != null) tags.push(`[IDOWN:${meta.downPayment}]`);
  if (meta.financedAmount != null) tags.push(`[IFIN:${meta.financedAmount}]`);
  if (meta.frequency) tags.push(`[IFREQ:${String(meta.frequency).replace(/\]/g, "")}]`);
  if (meta.startDate) tags.push(`[ISTART:${String(meta.startDate).replace(/\]/g, "")}]`);
  if (meta.allocation) tags.push(`[IALLOC:${String(meta.allocation).replace(/\]/g, "")}]`);
  if (meta.paymentType) tags.push(`[IPTYPE:${String(meta.paymentType).replace(/\]/g, "")}]`);
  return `${note} ${tags.join(" ")}`.trim();
}

function cleanInstallmentDisplayNote(noteValue){
  return String(noteValue || "")
    .replace(INSTALLMENT_TAG, "")
    .replace(installmentMetaTagCleanRegex(), "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function roundInstallmentMoney(value, currency = "AED"){
  const decimals = normalizeCurrencyCode(currency) === "BTC" ? 8 : 2;
  const factor = 10 ** decimals;
  const n = finiteMoney(value);
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

function computeInstallmentAmounts(totalAmount, count, currency = "AED"){
  const n = Math.max(1, Math.floor(finiteMoney(count)));
  const total = roundInstallmentMoney(totalAmount, currency);
  if (!(total > 0) || n < 1) {
    return { count: n, installmentAmount: 0, lastAmount: 0, total: 0 };
  }
  if (n === 1) {
    return { count: 1, installmentAmount: total, lastAmount: total, total };
  }
  const base = roundInstallmentMoney(total / n, currency);
  const last = roundInstallmentMoney(total - (base * (n - 1)), currency);
  return { count: n, installmentAmount: base, lastAmount: last, total };
}

function normalizeInstallmentDownPayment(totalAmount, downPayment, currency = "AED"){
  const total = roundInstallmentMoney(totalAmount, currency);
  const entered = roundInstallmentMoney(downPayment, currency);
  if (!(total > 0) || !(entered > 0)) return 0;
  return roundInstallmentMoney(Math.min(entered, total), currency);
}

function installmentFinancedAmount(totalAmount, downPayment, currency = "AED"){
  const total = roundInstallmentMoney(totalAmount, currency);
  const down = normalizeInstallmentDownPayment(total, downPayment, currency);
  return roundInstallmentMoney(Math.max(total - down, 0), currency);
}

function isInstallmentDownPayment(entryOrNotes){
  const notes = entryOrNotes && typeof entryOrNotes === "object"
    ? entryOrNotes.notes
    : entryOrNotes;
  const meta = installmentMetaFromNotes(notes);
  return String(meta.paymentType || "").trim().toLowerCase() === "down_payment";
}

function addMonthsToISODate(isoDate, monthsToAdd){
  const raw = String(isoDate || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const base = new Date(Date.UTC(year, month - 1, day));
  const targetMonth = base.getUTCMonth() + Number(monthsToAdd || 0);
  const target = new Date(Date.UTC(base.getUTCFullYear(), targetMonth, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, "0");
  const d = String(target.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function hasInstallmentSchedule(entryOrNotes){
  const notes = typeof entryOrNotes === "string" ? entryOrNotes : entryOrNotes?.notes;
  const meta = installmentMetaFromNotes(notes);
  return Number(meta.count || 0) >= 2 && Number(meta.installmentAmount || 0) > 0;
}

function parseInstallmentAllocation(text){
  const raw = String(text || "").trim();
  if (!raw) return [];
  return raw.split("|").map(part => {
    const [indexPart, amountPart] = String(part).split(":");
    const index = Number(indexPart);
    const amount = Number(amountPart);
    if (!Number.isFinite(index) || !Number.isFinite(amount) || amount <= 0) return null;
    return { index: Math.floor(index), amount };
  }).filter(Boolean);
}

function formatInstallmentAllocation(allocations){
  return (allocations || [])
    .filter(row => row && row.index > 0 && Number(row.amount) > 0)
    .map(row => `${row.index}:${roundInstallmentMoney(row.amount)}`)
    .join("|");
}

function buildInstallmentSchedule(principalEntry, paymentEntries = []){
  const meta = installmentMetaFromNotes(principalEntry?.notes);
  const currency = principalEntry?.currency || "AED";
  const total = roundInstallmentMoney(principalEntry?.principal_amount || 0, currency);
  const count = Math.max(0, Math.floor(Number(meta.count || 0)));
  const downPayment = normalizeInstallmentDownPayment(total, meta.downPayment, currency);
  const financedAmount = installmentFinancedAmount(total, downPayment, currency);
  if (count < 2 || !(financedAmount > 0)) return null;

  const computed = computeInstallmentAmounts(financedAmount, count, currency);
  const installmentAmount = Number(meta.installmentAmount) > 0 ? roundInstallmentMoney(meta.installmentAmount, currency) : computed.installmentAmount;
  const lastAmount = Number(meta.lastAmount) > 0 ? roundInstallmentMoney(meta.lastAmount, currency) : computed.lastAmount;
  const startDate = meta.startDate || principalEntry?.loan_date || todayISO();
  const today = todayISO();

  const slots = Array.from({ length: count }, (_, i) => {
    const index = i + 1;
    const scheduled = index === count ? lastAmount : installmentAmount;
    return {
      index,
      dueDate: addMonthsToISODate(startDate, i),
      scheduled,
      paid: 0,
      balance: scheduled,
      status: "Upcoming"
    };
  });

  const allPayments = (paymentEntries || [])
    .filter(entry => entry && entry.entry_kind !== "principal")
    .slice()
    .sort((a, b) => dateStamp(a.action_date || a.created_at) - dateStamp(b.action_date || b.created_at));
  const downPaymentEntries = allPayments.filter(isInstallmentDownPayment);
  const payments = allPayments.filter(entry => !isInstallmentDownPayment(entry));

  const applyAmountToSlots = (amount) => {
    let remaining = roundInstallmentMoney(amount, currency);
    const applied = [];
    for (const slot of slots){
      if (!(remaining > 0.00000001)) break;
      const open = roundInstallmentMoney(slot.scheduled - slot.paid, currency);
      if (!(open > 0.00000001)) continue;
      const take = roundInstallmentMoney(Math.min(open, remaining), currency);
      slot.paid = roundInstallmentMoney(slot.paid + take, currency);
      remaining = roundInstallmentMoney(remaining - take, currency);
      applied.push({ index: slot.index, amount: take });
    }
    return applied;
  };

  for (const payment of payments){
    const payMeta = installmentMetaFromNotes(payment.notes);
    const tagged = parseInstallmentAllocation(payMeta.allocation);
    const amount = roundInstallmentMoney(payment.action_amount || 0, currency);
    if (tagged.length){
      let leftover = amount;
      for (const row of tagged){
        const slot = slots.find(s => s.index === row.index);
        if (!slot) continue;
        const open = roundInstallmentMoney(slot.scheduled - slot.paid, currency);
        const take = roundInstallmentMoney(Math.min(open, row.amount, leftover), currency);
        if (!(take > 0)) continue;
        slot.paid = roundInstallmentMoney(slot.paid + take, currency);
        leftover = roundInstallmentMoney(leftover - take, currency);
      }
      if (leftover > 0.00000001) applyAmountToSlots(leftover);
    } else {
      applyAmountToSlots(amount);
    }
  }

  let paidCount = 0;
  let partialCount = 0;
  let overdueCount = 0;
  let nextOpen = null;
  for (const slot of slots){
    slot.paid = roundInstallmentMoney(slot.paid, currency);
    slot.balance = roundInstallmentMoney(Math.max(slot.scheduled - slot.paid, 0), currency);
    if (slot.balance <= 0.00000001) {
      slot.status = "Paid";
      slot.balance = 0;
      paidCount += 1;
    } else if (slot.paid > 0.00000001) {
      slot.status = "Partial";
      partialCount += 1;
      if (!nextOpen) nextOpen = slot;
    } else if (slot.dueDate && dateStamp(slot.dueDate) < dateStamp(today)) {
      slot.status = "Overdue";
      overdueCount += 1;
      if (!nextOpen) nextOpen = slot;
    } else {
      slot.status = "Upcoming";
      if (!nextOpen) nextOpen = slot;
    }
  }

  const installmentPaidTotal = roundInstallmentMoney(slots.reduce((sum, s) => sum + s.paid, 0), currency);
  const paidTotal = roundInstallmentMoney(downPayment + installmentPaidTotal, currency);
  const remainingTotal = roundInstallmentMoney(Math.max(financedAmount - installmentPaidTotal, 0), currency);
  const planStatus = remainingTotal <= 0.00000001
    ? "Closed"
    : overdueCount > 0
      ? "Overdue"
      : partialCount > 0 || paidCount > 0 || downPayment > 0
        ? "Partial"
        : "Open";

  return {
    count,
    installmentAmount,
    lastAmount,
    startDate,
    frequency: meta.frequency || "monthly",
    currency,
    total,
    downPayment,
    financedAmount,
    installmentPaidTotal,
    paidTotal,
    remainingTotal,
    paidCount,
    partialCount,
    overdueCount,
    planStatus,
    nextOpen,
    slots,
    payments,
    downPaymentEntries
  };
}

/** Map payment display notes onto schedule slots (via IALLOC or FIFO order). */
function collectInstallmentSlotNotes(schedule, paymentEntries = []){
  const notesBySlot = new Map();
  const pushNote = (index, note) => {
    const text = String(note || "").trim();
    if (!text || !(index > 0)) return;
    const prev = notesBySlot.get(index) || "";
    if (!prev) notesBySlot.set(index, text);
    else if (!prev.split(" · ").includes(text)) notesBySlot.set(index, `${prev} · ${text}`);
  };
  const payments = (paymentEntries || [])
    .filter(entry => entry && entry.entry_kind !== "principal" && !isInstallmentDownPayment(entry))
    .slice()
    .sort((a, b) => dateStamp(a.action_date || a.created_at) - dateStamp(b.action_date || b.created_at));
  const openTracker = (schedule?.slots || []).map(slot => ({
    index: slot.index,
    remaining: roundInstallmentMoney(slot.scheduled || 0, schedule?.currency)
  }));
  for (const payment of payments){
    const note = cleanInstallmentDisplayNote(payment.notes);
    if (!note) continue;
    const payMeta = installmentMetaFromNotes(payment.notes);
    const tagged = parseInstallmentAllocation(payMeta.allocation);
    const amount = roundInstallmentMoney(payment.action_amount || 0, schedule?.currency);
    if (tagged.length){
      tagged.forEach(row => pushNote(row.index, note));
      continue;
    }
    let remaining = amount;
    for (const slot of openTracker){
      if (!(remaining > 0.00000001) || !(slot.remaining > 0.00000001)) continue;
      const take = roundInstallmentMoney(Math.min(slot.remaining, remaining), schedule?.currency);
      if (!(take > 0)) continue;
      pushNote(slot.index, note);
      slot.remaining = roundInstallmentMoney(slot.remaining - take, schedule?.currency);
      remaining = roundInstallmentMoney(remaining - take, schedule?.currency);
    }
  }
  return notesBySlot;
}

function allocateInstallmentPayment(schedule, amount){
  if (!schedule?.slots?.length) return { allocations: [], applied: 0, leftover: roundInstallmentMoney(amount || 0) };
  let remaining = roundInstallmentMoney(amount || 0, schedule.currency);
  const allocations = [];
  for (const slot of schedule.slots){
    if (!(remaining > 0.00000001)) break;
    const open = roundInstallmentMoney(slot.balance > 0 ? slot.balance : (slot.scheduled - slot.paid), schedule.currency);
    if (!(open > 0.00000001)) continue;
    const take = roundInstallmentMoney(Math.min(open, remaining), schedule.currency);
    allocations.push({ index: slot.index, amount: take, dueDate: slot.dueDate, scheduled: slot.scheduled });
    remaining = roundInstallmentMoney(remaining - take, schedule.currency);
  }
  const applied = roundInstallmentMoney((amount || 0) - remaining, schedule.currency);
  return { allocations, applied, leftover: remaining };
}

function buildInstallmentScheduleMeta(totalAmount, count, currency, startDate, downPayment = 0){
  const total = roundInstallmentMoney(totalAmount, currency);
  const down = normalizeInstallmentDownPayment(total, downPayment, currency);
  const financed = installmentFinancedAmount(total, down, currency);
  const amounts = computeInstallmentAmounts(financed, count, currency);
  return {
    count: amounts.count,
    installmentAmount: amounts.installmentAmount,
    lastAmount: amounts.lastAmount,
    downPayment: down,
    financedAmount: financed,
    frequency: "monthly",
    startDate: startDate || todayISO()
  };
}

/** Rebuild FIFO IALLOC tags for existing payments against a new/updated schedule (ignores old IALLOC). */
function remapInstallmentPaymentsToSchedule(principalEntry, paymentEntries = []){
  const meta = installmentMetaFromNotes(principalEntry?.notes);
  const currency = principalEntry?.currency || "AED";
  const total = roundInstallmentMoney(principalEntry?.principal_amount || 0, currency);
  const count = Math.max(0, Math.floor(Number(meta.count || 0)));
  const downPayment = normalizeInstallmentDownPayment(total, meta.downPayment, currency);
  const financedAmount = installmentFinancedAmount(total, downPayment, currency);
  if (count < 2 || !(financedAmount > 0)) {
    return { remaps: [], leftoverTotal: 0, schedule: null };
  }
  const amounts = computeInstallmentAmounts(financedAmount, count, currency);
  const installmentAmount = Number(meta.installmentAmount) > 0
    ? roundInstallmentMoney(meta.installmentAmount, currency)
    : amounts.installmentAmount;
  const lastAmount = Number(meta.lastAmount) > 0
    ? roundInstallmentMoney(meta.lastAmount, currency)
    : amounts.lastAmount;
  const startDate = meta.startDate || principalEntry?.loan_date || todayISO();
  const slots = Array.from({ length: count }, (_, i) => {
    const index = i + 1;
    const scheduled = index === count ? lastAmount : installmentAmount;
    return { index, dueDate: addMonthsToISODate(startDate, i), scheduled, paid: 0 };
  });

  const allPayments = (paymentEntries || [])
    .filter(entry => entry && entry.entry_kind !== "principal")
    .slice()
    .sort((a, b) => dateStamp(a.action_date || a.created_at) - dateStamp(b.action_date || b.created_at));
  const downPaymentEntries = allPayments.filter(isInstallmentDownPayment);
  const payments = allPayments.filter(entry => !isInstallmentDownPayment(entry));

  let planRemaining = financedAmount;
  let leftoverTotal = 0;
  const remaps = [];

  for (const payment of payments){
    let remaining = roundInstallmentMoney(payment.action_amount || 0, currency);
    const allocations = [];
    for (const slot of slots){
      if (!(remaining > 0.00000001)) break;
      const open = roundInstallmentMoney(slot.scheduled - slot.paid, currency);
      if (!(open > 0.00000001)) continue;
      const take = roundInstallmentMoney(Math.min(open, remaining), currency);
      slot.paid = roundInstallmentMoney(slot.paid + take, currency);
      remaining = roundInstallmentMoney(remaining - take, currency);
      allocations.push({ index: slot.index, amount: take });
    }
    leftoverTotal = roundInstallmentMoney(leftoverTotal + remaining, currency);
    planRemaining = roundInstallmentMoney(Math.max(planRemaining - Number(payment.action_amount || 0), 0), currency);
    remaps.push({
      id: payment.id,
      payment,
      allocations,
      leftover: remaining,
      entry_kind: planRemaining <= 0.00000001 ? "full" : "partial",
      notes: upsertInstallmentMetaInNote(cleanInstallmentDisplayNote(payment.notes), {
        allocation: formatInstallmentAllocation(allocations)
      })
    });
  }

  const draftPrincipal = {
    ...principalEntry,
    notes: upsertInstallmentMetaInNote(cleanInstallmentDisplayNote(principalEntry.notes), {
      count,
      installmentAmount,
      lastAmount,
      downPayment,
      financedAmount,
      frequency: meta.frequency || "monthly",
      startDate
    })
  };
  const remappedPayments = downPaymentEntries.concat(remaps.map(row => ({
    ...row.payment,
    notes: row.notes,
    entry_kind: row.entry_kind
  })));
  return {
    remaps,
    leftoverTotal,
    schedule: buildInstallmentSchedule(draftPrincipal, remappedPayments)
  };
}

function getInstallmentPlanGroup(groupId){
  const id = String(groupId || "").trim();
  if (!id) return null;
  const entries = getActiveEntries().filter(e =>
    e.group_id === id &&
    e.direction === "taken" &&
    hasInstallmentTag(e.notes) &&
    !hasGoodsTag(e.notes) &&
    !hasExpenseAccountTag(e.notes)
  );
  const principal = entries.find(e => e.entry_kind === "principal");
  if (!principal) return null;
  const payments = entries.filter(e => e.entry_kind !== "principal");
  const schedule = buildInstallmentSchedule(principal, payments);
  const principalMeta = installmentMetaFromNotes(principal.notes);
  const downPayment = schedule
    ? schedule.downPayment
    : normalizeInstallmentDownPayment(principal.principal_amount, principalMeta.downPayment, principal.currency);
  const paidTotal = schedule
    ? schedule.paidTotal
    : payments.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
  const remaining = schedule
    ? schedule.remainingTotal
    : Math.max(Number(principal.principal_amount || 0) - paidTotal, 0);
  return {
    group_id: id,
    principal,
    payments,
    schedule,
    person_name: principal.person_name,
    currency: principal.currency,
    loan_date: principal.loan_date,
    principalTotal: Number(principal.principal_amount || 0),
    downPayment,
    financedAmount: schedule?.financedAmount || installmentFinancedAmount(principal.principal_amount, downPayment, principal.currency),
    paidTotal,
    remaining,
    status: schedule?.planStatus || (remaining <= 0 ? "Closed" : paidTotal > 0 ? "Partial" : "Open")
  };
}

function getInstallmentPlanGroups(){
  const principals = getActiveEntries().filter(e =>
    e.entry_kind === "principal" &&
    e.direction === "taken" &&
    hasInstallmentTag(e.notes) &&
    !hasGoodsTag(e.notes) &&
    !hasExpenseAccountTag(e.notes)
  );
  return principals.map(principal => {
    const payments = getActiveEntries().filter(e =>
      e.group_id === principal.group_id &&
      e.entry_kind !== "principal" &&
      hasInstallmentTag(e.notes)
    );
    const schedule = buildInstallmentSchedule(principal, payments);
    const principalMeta = installmentMetaFromNotes(principal.notes);
    const downPayment = schedule
      ? schedule.downPayment
      : normalizeInstallmentDownPayment(principal.principal_amount, principalMeta.downPayment, principal.currency);
    const paidTotal = schedule
      ? schedule.paidTotal
      : payments.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
    const remaining = schedule
      ? schedule.remainingTotal
      : Math.max(Number(principal.principal_amount || 0) - paidTotal, 0);
    return {
      group_id: principal.group_id,
      principal,
      payments,
      schedule,
      person_name: principal.person_name,
      currency: principal.currency,
      loan_date: principal.loan_date,
      principalTotal: Number(principal.principal_amount || 0),
      downPayment,
      financedAmount: schedule?.financedAmount || installmentFinancedAmount(principal.principal_amount, downPayment, principal.currency),
      paidTotal,
      remaining,
      status: schedule?.planStatus || (remaining <= 0 ? "Closed" : paidTotal > 0 ? "Partial" : "Open"),
      lastActivity: [...payments.map(p => p.action_date), principal.loan_date].filter(Boolean).sort((a, b) => dateStamp(b) - dateStamp(a))[0] || principal.loan_date
    };
  }).sort((a, b) => dateStamp(b.lastActivity) - dateStamp(a.lastActivity) || String(a.person_name || "").localeCompare(String(b.person_name || "")));
}
