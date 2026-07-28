/* Modularized from script.js lines 5589-8997 — inventory meta + stock helpers. Load order must be preserved. */
function normalizeGoodsNote(noteValue, markGoods){
  const base = String(noteValue || "").replace(GOODS_TAG, "").trim();
  if (!markGoods) return base || null;
  return base ? `${GOODS_TAG} ${base}` : GOODS_TAG;
}

function goodsMetaFromNotes(noteValue){
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
    boughtQty: readNum("BQTY"),
    soldQty: readNum("SQTY"),
    unitActualPrice: readNum("UAP"),
    unitSoldPrice: readNum("USP"),
    itemCode: readText("ICODE"),
    itemDescription: readText("IDESC"),
    itemType: readText("ITYPE"),
    customerName: readText("CUST"),
    customerPhone: readText("CPHONE"),
    customerAddress: readText("CADDR"),
    customerCompany: readText("CCMP"),
    customerTrn: readText("CTRN"),
    customerEmail: readText("CEMAIL"),
    receiptNumber: readText("RCPT"),
    invoiceNumber: readText("INV"),
    paymentReceiptNumber: readText("PAYRCPT"),
    transactionType: readText("TX"),
    itemCategory: readText("UCAT"),
    quantityUnit: readText("UOM"),
    brand: readText("BRAND"),
    variantLabel: readText("VARIANT"),
    brandId: readText("BRANDID"),
    variantId: readText("VARIANTID"),
    productLine: readText("PLINE"),
    productLineId: readText("PLINEID"),
    subBrand: readText("SBRAND"),
    subBrandId: readText("SBRANDID"),
    variantStorage: readText("STOR"),
    variantColor: readText("COLOR"),
    variantOther: readText("VOTHER"),
    sellBy: readText("SELLBY"),
    bottleSizeQty: readNum("BSIZE"),
    bottleSizeUnit: readText("BUNIT"),
    categorySlug: readText("CSLUG"),
    paidAmount: readNum("PAID"),
    balanceAmount: readNum("BAL"),
    paymentStatus: readText("PSTAT"),
    settlementForEntryId: readText("SID"),
    settlementId: readText("SETID"),
    taxApplied: parseVatAppliedToken(readText("VATP")),
    taxRate: readNum("VATR"),
    taxMode: readText("VATM"),
    taxAmount: readNum("VATA"),
    netAmount: readNum("NET"),
    grossAmount: readNum("GROSS"),
    saleLineNo: readNum("SLNO"),
    saleLineId: readText("SLID"),
    saleSetId: readText("SSET")
  };
}

function goodsMetaTagCleanRegex(){
  return /\[(BQTY|SQTY|UAP|USP|ICODE|IDESC|ITYPE|CUST|CPHONE|CADDR|CCMP|CTRN|CEMAIL|RCPT|INV|PAYRCPT|TX|UCAT|UOM|BRAND|VARIANT|BRANDID|VARIANTID|PLINE|PLINEID|SBRAND|SBRANDID|STOR|COLOR|VOTHER|SELLBY|BSIZE|BUNIT|CSLUG|PAID|BAL|PSTAT|SID|SETID|VATP|VATR|VATM|VATA|NET|GROSS|SLNO|SLID|SSET):[^\]]*\]/gi;
}

function upsertGoodsMetaInNote(noteValue, meta = {}){
  let note = normalizeGoodsNote(noteValue, true) || GOODS_TAG;
  note = note.replace(goodsMetaTagCleanRegex(), "").replace(/\s{2,}/g, " ").trim();
  const tags = [];
  if (meta.boughtQty != null) tags.push(`[BQTY:${meta.boughtQty}]`);
  if (meta.soldQty != null) tags.push(`[SQTY:${meta.soldQty}]`);
  if (meta.unitActualPrice != null) tags.push(`[UAP:${meta.unitActualPrice}]`);
  if (meta.unitSoldPrice != null) tags.push(`[USP:${meta.unitSoldPrice}]`);
  if (meta.itemCode) tags.push(`[ICODE:${String(meta.itemCode).replace(/\]/g, "")}]`);
  if (meta.itemDescription) tags.push(`[IDESC:${String(meta.itemDescription).replace(/\]/g, "")}]`);
  if (meta.itemType) tags.push(`[ITYPE:${String(meta.itemType).replace(/\]/g, "")}]`);
  if (meta.brand) tags.push(`[BRAND:${String(meta.brand).replace(/\]/g, "")}]`);
  if (meta.variantLabel) tags.push(`[VARIANT:${String(meta.variantLabel).replace(/\]/g, "")}]`);
  if (meta.brandId) tags.push(`[BRANDID:${String(meta.brandId).replace(/\]/g, "")}]`);
  if (meta.variantId) tags.push(`[VARIANTID:${String(meta.variantId).replace(/\]/g, "")}]`);
  if (meta.productLine) tags.push(`[PLINE:${String(meta.productLine).replace(/\]/g, "")}]`);
  if (meta.productLineId) tags.push(`[PLINEID:${String(meta.productLineId).replace(/\]/g, "")}]`);
  if (meta.subBrand) tags.push(`[SBRAND:${String(meta.subBrand).replace(/\]/g, "")}]`);
  if (meta.subBrandId) tags.push(`[SBRANDID:${String(meta.subBrandId).replace(/\]/g, "")}]`);
  if (meta.variantStorage) tags.push(`[STOR:${String(meta.variantStorage).replace(/\]/g, "")}]`);
  if (meta.variantColor) tags.push(`[COLOR:${String(meta.variantColor).replace(/\]/g, "")}]`);
  if (meta.variantOther) tags.push(`[VOTHER:${String(meta.variantOther).replace(/\]/g, "")}]`);
  if (meta.sellBy) tags.push(`[SELLBY:${String(meta.sellBy).replace(/\]/g, "")}]`);
  if (meta.bottleSizeQty != null) tags.push(`[BSIZE:${meta.bottleSizeQty}]`);
  if (meta.bottleSizeUnit) tags.push(`[BUNIT:${String(meta.bottleSizeUnit).replace(/\]/g, "")}]`);
  if (meta.categorySlug) tags.push(`[CSLUG:${String(meta.categorySlug).replace(/\]/g, "")}]`);
  if (meta.customerName) tags.push(`[CUST:${String(meta.customerName).replace(/\]/g, "")}]`);
  if (meta.customerPhone) tags.push(`[CPHONE:${String(meta.customerPhone).replace(/\]/g, "")}]`);
  if (meta.customerAddress) tags.push(`[CADDR:${String(meta.customerAddress).replace(/\]/g, "")}]`);
  if (meta.customerCompany) tags.push(`[CCMP:${String(meta.customerCompany).replace(/\]/g, "")}]`);
  if (meta.customerTrn) tags.push(`[CTRN:${String(meta.customerTrn).replace(/\]/g, "")}]`);
  if (meta.customerEmail) tags.push(`[CEMAIL:${String(meta.customerEmail).replace(/\]/g, "")}]`);
  if (meta.receiptNumber) tags.push(`[RCPT:${String(meta.receiptNumber).replace(/\]/g, "")}]`);
  if (meta.invoiceNumber) tags.push(`[INV:${String(meta.invoiceNumber).replace(/\]/g, "")}]`);
  if (meta.paymentReceiptNumber) tags.push(`[PAYRCPT:${String(meta.paymentReceiptNumber).replace(/\]/g, "")}]`);
  if (meta.transactionType) tags.push(`[TX:${String(meta.transactionType).replace(/\]/g, "")}]`);
  if (meta.itemCategory) tags.push(`[UCAT:${String(meta.itemCategory).replace(/\]/g, "")}]`);
  if (meta.quantityUnit) tags.push(`[UOM:${String(meta.quantityUnit).replace(/\]/g, "")}]`);
  if (meta.paidAmount != null) tags.push(`[PAID:${meta.paidAmount}]`);
  if (meta.balanceAmount != null) tags.push(`[BAL:${meta.balanceAmount}]`);
  if (meta.paymentStatus) tags.push(`[PSTAT:${String(meta.paymentStatus).replace(/\]/g, "")}]`);
  if (meta.settlementForEntryId) tags.push(`[SID:${String(meta.settlementForEntryId).replace(/\]/g, "")}]`);
  if (meta.settlementId) tags.push(`[SETID:${String(meta.settlementId).replace(/\]/g, "")}]`);
  if (meta.taxApplied != null) tags.push(`[VATP:${meta.taxApplied ? 1 : 0}]`);
  if (meta.taxRate != null) tags.push(`[VATR:${normalizeTaxRate(meta.taxRate)}]`);
  if (meta.taxMode) tags.push(`[VATM:${normalizeTaxMode(meta.taxMode)}]`);
  if (meta.taxAmount != null) tags.push(`[VATA:${roundTaxMoney(meta.taxAmount)}]`);
  if (meta.netAmount != null) tags.push(`[NET:${roundTaxMoney(meta.netAmount)}]`);
  if (meta.grossAmount != null) tags.push(`[GROSS:${roundTaxMoney(meta.grossAmount)}]`);
  if (meta.saleLineNo != null) tags.push(`[SLNO:${meta.saleLineNo}]`);
  if (meta.saleLineId) tags.push(`[SLID:${String(meta.saleLineId).replace(/\]/g, "")}]`);
  if (meta.saleSetId) tags.push(`[SSET:${String(meta.saleSetId).replace(/\]/g, "")}]`);
  return `${note} ${tags.join(" ")}`.trim();
}

function cleanGoodsDisplayNote(noteValue){
  return String(noteValue || "")
    .replace(GOODS_TAG, "")
    .replace(goodsMetaTagCleanRegex(), "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeInventoryItemType(value){
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  return cleaned || "General";
}

function getInventoryItemTypes(){
  const found = new Set(INVENTORY_DEFAULT_ITEM_TYPES.map(normalizeInventoryItemType));
  for (const entry of state.entries){
    if (!hasGoodsTag(entry.notes) || entry.entry_kind !== "principal") continue;
    const type = normalizeInventoryItemType(goodsMetaFromNotes(entry.notes).itemType);
    if (type) found.add(type);
  }
  return [...found].sort((a, b) => a.localeCompare(b));
}

function inventoryItemTypeOptionsHtml(selectedType = "General", includeCustom = true){
  const selected = normalizeInventoryItemType(selectedType);
  const types = getInventoryItemTypes();
  const hasSelected = types.some(type => type.toLowerCase() === selected.toLowerCase());
  const options = [];
  for (const type of types){
    options.push(`<option value="${escapeHtml(type)}" ${type.toLowerCase() === selected.toLowerCase() ? "selected" : ""}>${escapeHtml(type)}</option>`);
  }
  if (!hasSelected && selected){
    options.unshift(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`);
  }
  if (includeCustom){
    options.push(`<option value="${INVENTORY_CUSTOM_TYPE_VALUE}">+ Custom type…</option>`);
  }
  return options.join("");
}

function readGoodsBoughtItemType(form = els.goodsBoughtForm){
  if (!form) return "General";
  const select = form.querySelector('[name="item_type"]');
  const customInput = form.querySelector('[name="item_type_custom"]');
  const selected = String(select?.value || "").trim();
  if (selected === INVENTORY_CUSTOM_TYPE_VALUE){
    return normalizeInventoryItemType(customInput?.value);
  }
  return normalizeInventoryItemType(selected);
}

function syncInventoryItemTypeFields(form, preferredType = ""){
  if (!form) return;
  const typeSelect = form.querySelector('[name="item_type"]');
  const customWrap = form.querySelector("[data-inventory-custom-type-wrap]");
  const customInput = form.querySelector('[name="item_type_custom"]');
  if (!typeSelect) return;
  const current = preferredType || (typeSelect.value === INVENTORY_CUSTOM_TYPE_VALUE
    ? (customInput?.value || "General")
    : (typeSelect.value || "General"));
  const normalized = normalizeInventoryItemType(current);
  const knownTypes = getInventoryItemTypes();
  const known = knownTypes.some(type => type.toLowerCase() === normalized.toLowerCase());
  typeSelect.innerHTML = inventoryItemTypeOptionsHtml(known ? normalized : "General");
  if (known){
    typeSelect.value = knownTypes.find(type => type.toLowerCase() === normalized.toLowerCase()) || normalized;
    if (customWrap) customWrap.classList.add("hide");
    if (customInput) {
      customInput.value = "";
      customInput.required = false;
    }
  } else {
    typeSelect.value = INVENTORY_CUSTOM_TYPE_VALUE;
    if (customWrap) customWrap.classList.remove("hide");
    if (customInput) {
      customInput.value = normalized;
      customInput.required = true;
    }
  }
}

function syncGoodsBoughtItemTypeFields(preferredType = ""){
  syncInventoryItemTypeFields(els.goodsBoughtForm, preferredType);
}

function refreshInventoryTypeFilterOptions(){
  const select = document.getElementById("inventoryTypeFilter");
  if (!select) return;
  const current = String(state.inventoryItemTypeFilter || "all");
  const types = getInventoryItemTypes();
  select.innerHTML = [
    `<option value="all">All</option>`,
    ...types.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
  ].join("");
  const stillValid = current === "all" || types.some(type => type.toLowerCase() === current.toLowerCase());
  state.inventoryItemTypeFilter = stillValid ? current : "all";
  select.value = state.inventoryItemTypeFilter;
}

function hasExpenseAccountTag(noteValue){
  return noteValue && noteValue.includes(EXPENSE_ACCOUNT_TAG);
}

function hasDeletedTag(noteValue){
  return noteValue && noteValue.includes(DELETED_TAG);
}

function addDeletedTag(noteValue){
  if (!noteValue) return DELETED_TAG;
  if (hasDeletedTag(noteValue)) return noteValue;
  return noteValue + " " + DELETED_TAG;
}

function removeDeletedTag(noteValue){
  if (!noteValue || !hasDeletedTag(noteValue)) return noteValue;
  return noteValue.replace(DELETED_TAG, "").trim();
}

const EXPENSE_META_TAG_KEYS = "ATYPE|ETYPE|ITEM|XTYPE|BADDR|BNET|CLOGO|VATP|VATR|VATM|VATA|NET|GROSS";

function expenseMetaFromNotes(noteValue){
  const text = String(noteValue || "");
  const readText = key => {
    const m = text.match(new RegExp(`\\[${key}:([^\\]]*)\\]`, "i"));
    return m ? m[1] : "";
  };
  const readNum = key => {
    const m = text.match(new RegExp(`\\[${key}:([^\\]]+)\\]`, "i"));
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };
  return {
    accountType: readText("ATYPE"),
    rowType: readText("ETYPE"),
    itemName: readText("ITEM"),
    expenseType: readText("XTYPE"),
    btcAddress: readText("BADDR"),
    btcNetwork: readText("BNET"),
    customLogoUrl: readText("CLOGO"),
    taxApplied: parseVatAppliedToken(readText("VATP")),
    taxRate: readNum("VATR"),
    taxMode: readText("VATM"),
    taxAmount: readNum("VATA"),
    netAmount: readNum("NET"),
    grossAmount: readNum("GROSS")
  };
}

function upsertExpenseMetaInNote(noteValue, meta = {}){
  // Merge with existing tags so partial updates (lazy activity hydrate, transfers)
  // never wipe VAT / item meta that was already saved in notes.
  const existing = expenseMetaFromNotes(noteValue);
  const pick = (key, fallback = undefined) => (
    Object.prototype.hasOwnProperty.call(meta, key) ? meta[key] : (fallback !== undefined ? fallback : existing[key])
  );
  const merged = {
    accountType: pick("accountType"),
    rowType: pick("rowType"),
    itemName: pick("itemName"),
    expenseType: pick("expenseType"),
    btcAddress: pick("btcAddress"),
    btcNetwork: pick("btcNetwork"),
    customLogoUrl: pick("customLogoUrl"),
    taxApplied: pick("taxApplied"),
    taxRate: pick("taxRate"),
    taxMode: pick("taxMode"),
    taxAmount: pick("taxAmount"),
    netAmount: pick("netAmount"),
    grossAmount: pick("grossAmount")
  };
  const tagValue = value => String(value || "").replace(/\]/g, "").trim();
  const base = String(noteValue || "")
    .replace(EXPENSE_ACCOUNT_TAG, "")
    .replace(new RegExp(`\\[(${EXPENSE_META_TAG_KEYS}):[^\\]]*\\]`, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const tags = [];
  if (merged.accountType) tags.push(`[ATYPE:${tagValue(merged.accountType)}]`);
  if (merged.rowType) tags.push(`[ETYPE:${tagValue(merged.rowType)}]`);
  if (merged.itemName) tags.push(`[ITEM:${tagValue(merged.itemName)}]`);
  if (merged.expenseType) tags.push(`[XTYPE:${tagValue(merged.expenseType)}]`);
  if (merged.btcAddress) tags.push(`[BADDR:${tagValue(merged.btcAddress)}]`);
  if (merged.btcNetwork) tags.push(`[BNET:${tagValue(merged.btcNetwork)}]`);
  if (merged.customLogoUrl) tags.push(`[CLOGO:${tagValue(merged.customLogoUrl)}]`);
  if (merged.taxApplied != null) tags.push(`[VATP:${merged.taxApplied ? 1 : 0}]`);
  if (merged.taxRate != null) tags.push(`[VATR:${normalizeTaxRate(merged.taxRate)}]`);
  if (merged.taxMode) tags.push(`[VATM:${normalizeTaxMode(merged.taxMode)}]`);
  if (merged.taxAmount != null) tags.push(`[VATA:${roundTaxMoney(merged.taxAmount)}]`);
  if (merged.netAmount != null) tags.push(`[NET:${roundTaxMoney(merged.netAmount)}]`);
  if (merged.grossAmount != null) tags.push(`[GROSS:${roundTaxMoney(merged.grossAmount)}]`);
  const withTag = `${EXPENSE_ACCOUNT_TAG} ${base}`.trim();
  return `${withTag} ${tags.join(" ")}`.trim();
}

function cleanExpenseNote(noteValue){
  return String(noteValue || "")
    .replace(EXPENSE_ACCOUNT_TAG, "")
    .replace(new RegExp(`\\[(${EXPENSE_META_TAG_KEYS}):[^\\]]*\\]`, "gi"), "")
    .replace(/→/g, "->")
    .replace(/\s{2,}/g, " ")
    .trim() || "—";
}

function cleanExpenseNoteForEdit(noteValue){
  const cleaned = cleanExpenseNote(noteValue);
  return cleaned === "—" ? "" : cleaned;
}

function wrapTextForPdf(text, maxLength = 50){
  const str = String(text || "");
  if (str.length <= maxLength) return str;
  const words = str.split(' ');
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxLength) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.join('\n');
}

function expenseBtcTrimAmount(value){
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return n.toFixed(8).replace(/\.?0+$/, "");
}

function expenseBtcCacheKey(address, networkKey = "mainnet"){
  return `${String(networkKey || "mainnet").trim()}:${String(address || "").trim().toLowerCase()}`;
}

function expenseBtcGetCache(address, networkKey = "mainnet"){
  return state.expenseBtcCache[expenseBtcCacheKey(address, networkKey)] || null;
}

function expenseBtcSetCache(address, networkKey, data){
  state.expenseBtcCache[expenseBtcCacheKey(address, networkKey)] = {
    ...(data || {}),
    address: String(address || "").trim(),
    networkKey: String(networkKey || "mainnet").trim() || "mainnet"
  };
}

function expenseBtcIsCacheFresh(cache, maxAgeMs = 120000){
  return cache && !cache.loading && !cache.error && cache.fetchedAt && (Date.now() - cache.fetchedAt) < maxAgeMs;
}

function expenseBtcDetectNetwork(address){
  const cleaned = String(address || "").trim();
  if (!cleaned) throw new Error("Bitcoin wallet address is required.");
  const candidates = ["mainnet", "testnet", "signet"];
  for (const key of candidates){
    try {
      bitcoinjs.address.toOutputScript(cleaned, btcGetNetworkInfo(key).network);
      return key;
    } catch {
      // keep trying the next Bitcoin network
    }
  }
  const lower = cleaned.toLowerCase();
  if (lower.startsWith("bc1") || /^[13]/.test(cleaned)) return "mainnet";
  if (lower.startsWith("tb1") || /^[mn2]/i.test(cleaned)) return "testnet";
  throw new Error("Enter a valid Bitcoin wallet address.");
}

function expenseBtcNetworkFromMeta(meta = {}){
  const key = String(meta.btcNetwork || "mainnet").trim().toLowerCase();
  return BTC_NETWORKS[key] ? key : "mainnet";
}

async function fetchExpenseBtcWalletData(address, networkKey = ""){
  const cleaned = String(address || "").trim();
  const detectedNetwork = networkKey && BTC_NETWORKS[networkKey] ? networkKey : expenseBtcDetectNetwork(cleaned);
  const api = btcGetNetworkInfo(detectedNetwork).api;
  const [stats, utxos, txs] = await Promise.all([
    btcFetchJson(`${api}/address/${encodeURIComponent(cleaned)}`),
    btcFetchJson(`${api}/address/${encodeURIComponent(cleaned)}/utxo`),
    btcFetchJson(`${api}/address/${encodeURIComponent(cleaned)}/txs`)
  ]);
  const chainStats = stats?.chain_stats || {};
  const mempoolStats = stats?.mempool_stats || {};
  const fundedSat = Number(chainStats.funded_txo_sum || 0) + Number(mempoolStats.funded_txo_sum || 0);
  const sentSat = Number(chainStats.spent_txo_sum || 0) + Number(mempoolStats.spent_txo_sum || 0);
  const balanceSat = Array.isArray(utxos)
    ? utxos.reduce((sum, utxo) => sum + Number(utxo.value || 0), 0)
    : Math.max(fundedSat - sentSat, 0);
  const txCount = Number(chainStats.tx_count || 0) + Number(mempoolStats.tx_count || 0);
  return {
    address: cleaned,
    networkKey: detectedNetwork,
    balanceSat,
    fundedSat,
    sentSat,
    txCount,
    utxos: Array.isArray(utxos) ? utxos : [],
    transactions: Array.isArray(txs) ? txs : [],
    fetchedAt: Date.now(),
    loading: false,
    error: ""
  };
}

async function fetchExpenseBtcAllWalletData(address, networkKey = ""){
  const data = await fetchExpenseBtcWalletData(address, networkKey);
  const api = btcGetNetworkInfo(data.networkKey).api;
  const all = Array.isArray(data.transactions) ? data.transactions.slice() : [];
  const seen = new Set(all.map(tx => tx?.txid).filter(Boolean));
  let confirmed = all.filter(tx => tx?.status?.confirmed);
  let cursor = all.length >= 25 && confirmed.length ? confirmed[confirmed.length - 1].txid : "";

  while (cursor && all.length < MAX_BTC_HISTORY) {
    const batch = await btcFetchJson(`${api}/address/${encodeURIComponent(data.address)}/txs/chain/${encodeURIComponent(cursor)}`);
    if (!Array.isArray(batch) || !batch.length) break;

    let added = 0;
    for (const tx of batch) {
      if (!tx?.txid || seen.has(tx.txid)) continue;
      all.push(tx);
      seen.add(tx.txid);
      added += 1;
      if (all.length >= MAX_BTC_HISTORY) break;
    }

    const confirmedBatch = batch.filter(tx => tx?.status?.confirmed);
    const nextCursor = confirmedBatch.length ? confirmedBatch[confirmedBatch.length - 1].txid : "";
    if (batch.length < 25 || !nextCursor || nextCursor === cursor || !added) break;
    cursor = nextCursor;
  }

  return {
    ...data,
    transactions: all,
    txCount: Math.max(Number(data.txCount || 0), all.length)
  };
}

function refreshExpenseBtcWallets(accounts, options = {}){
  const force = options.force === true;
  const targets = [];
  const seen = new Set();
  for (const account of accounts || []){
    if (account.currency !== "BTC" || !account.btcAddress) continue;
    const key = expenseBtcCacheKey(account.btcAddress, account.btcNetwork || "mainnet");
    if (seen.has(key)) continue;
    seen.add(key);
    const cache = expenseBtcGetCache(account.btcAddress, account.btcNetwork || "mainnet");
    if (!force && (expenseBtcIsCacheFresh(cache) || cache?.loading)) continue;
    if (!force && cache?.error && cache.fetchedAt && (Date.now() - cache.fetchedAt) < 120000) continue;
    targets.push({ address: account.btcAddress, networkKey: account.btcNetwork || "mainnet", key });
  }
  if (!targets.length) return false;

  for (const target of targets){
    expenseBtcSetCache(target.address, target.networkKey, {
      ...(state.expenseBtcCache[target.key] || {}),
      loading: true,
      error: ""
    });
  }

  Promise.allSettled(targets.map(async target => {
    try {
      const data = await fetchExpenseBtcWalletData(target.address, target.networkKey);
      expenseBtcSetCache(target.address, data.networkKey, data);
      if (data.networkKey !== target.networkKey) {
        delete state.expenseBtcCache[target.key];
      }
    } catch (err) {
      expenseBtcSetCache(target.address, target.networkKey, {
        ...(state.expenseBtcCache[target.key] || {}),
        loading: false,
        error: err.message || String(err),
        fetchedAt: Date.now()
      });
    }
  })).then(() => {
    renderAll();
  });
  return true;
}

function syncExpenseBtcAccountFields(form = els.expenseAccountForm){
  if (!form || form !== els.expenseAccountForm) return;
  const currency = String(
    form.querySelector('select[name="currency"]')?.value ||
    form.querySelector('input[name="currency"]')?.value ||
    ""
  ).trim();
  const isBtc = currency === "BTC";
  const addressInput = form.querySelector('input[name="btc_address"]');
  const balanceInput = form.querySelector('input[name="opening_balance"]');
  const balanceLabel = balanceInput?.closest(".field")?.querySelector("label");
  const accountTypeSelect = form.querySelector('select[name="account_type"]');

  // Prefer Crypto Wallet when BTC is chosen; user can still change the type after.
  if (isBtc && accountTypeSelect) {
    const hasCryptoOption = Array.from(accountTypeSelect.options).some(opt => opt.value === "Crypto Wallet");
    if (hasCryptoOption) accountTypeSelect.value = "Crypto Wallet";
  }

  if (els.expenseBtcAddressField) els.expenseBtcAddressField.classList.toggle("hide", !isBtc);
  if (addressInput) addressInput.required = isBtc;
  if (balanceInput) {
    balanceInput.readOnly = isBtc;
    balanceInput.placeholder = isBtc ? "Fetched from blockchain" : "0.00";
    if (isBtc && !balanceInput.value) balanceInput.value = "0";
  }
  if (balanceLabel) balanceLabel.textContent = isBtc ? "Live blockchain balance" : "Available balance";
  if (els.expenseBtcBalanceStatus) {
    els.expenseBtcBalanceStatus.className = "expense-btc-help";
    els.expenseBtcBalanceStatus.textContent = isBtc
      ? "Balance and transactions will be loaded directly from the blockchain."
      : "";
  }
}

async function previewExpenseBtcBalance(){
  const form = els.expenseAccountForm;
  if (!form) return;
  const addressInput = form.querySelector('input[name="btc_address"]');
  const balanceInput = form.querySelector('input[name="opening_balance"]');
  const address = String(addressInput?.value || "").trim();
  if (!address) return;

  if (els.expenseBtcBalanceStatus) {
    els.expenseBtcBalanceStatus.className = "expense-btc-help";
    els.expenseBtcBalanceStatus.textContent = "Loading live BTC balance...";
  }

  try {
    const data = await fetchExpenseBtcWalletData(address);
    expenseBtcSetCache(data.address, data.networkKey, data);
    if (balanceInput) balanceInput.value = expenseBtcTrimAmount(btcSatToBtc(data.balanceSat));
    if (els.expenseBtcBalanceStatus) {
      els.expenseBtcBalanceStatus.className = "expense-btc-help success";
      els.expenseBtcBalanceStatus.textContent = `Live balance: ${btcFormatBtcFromSat(data.balanceSat)} · ${data.txCount} transaction${data.txCount === 1 ? "" : "s"}`;
    }
  } catch (err) {
    if (els.expenseBtcBalanceStatus) {
      els.expenseBtcBalanceStatus.className = "expense-btc-help error";
      els.expenseBtcBalanceStatus.textContent = err.message || String(err);
    }
  }
}

function sortCurrenciesList(values){
  const allowedCurrencies = getAllowedCurrencies();
  const rank = c => {
    const i = allowedCurrencies.indexOf(String(c || "").toUpperCase());
    return i === -1 ? 100 : i;
  };
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    rank(a) - rank(b) || String(a).localeCompare(String(b))
  );
}

function findTransferPartnerForExpense(expenseEntry){
  const transferMatch = String(expenseEntry.notes || "").match(/Transfer to ([^:]+)/);
  if (!transferMatch) return null;
  const toWalletName = transferMatch[1].trim();
  return state.entries.find(e =>
    e.id !== expenseEntry.id &&
    hasExpenseAccountTag(e.notes) &&
    expenseMetaFromNotes(e.notes).rowType === "TOPUP" &&
    String(e.person_name || "").trim() === toWalletName &&
    e.notes.includes(`Transfer from ${expenseEntry.person_name}`)
  ) || null;
}

function parseTransferExpenseDetails(tx, fromAccount){
  const raw = String(tx.notes || "");
  const detailed = raw.match(/Transfer to ([^:]+):\s*([\d.]+)\s+(\w+)\s*→\s*([\d.]+)\s+(\w+)\s*\(\s*Rate:\s*([\d.]+)\s*\)/);
  const simple = raw.match(/Transfer to ([^:]+)/);
  const toWallet = detailed ? detailed[1].trim() : (simple ? simple[1].trim() : "—");
  const amtOut = Number(tx.action_amount || 0);
  const curOut = fromAccount.currency || "AED";
  if (detailed){
    const amtIn = Number(detailed[4]);
    const curIn = detailed[5];
    const rate = Number(detailed[6]);
    return {
      toWallet,
      amtOut,
      curOut,
      amtIn,
      curIn,
      rate: Number.isFinite(rate) && rate > 0 ? rate : 1,
      sameCurrency: String(detailed[3]).toUpperCase() === String(detailed[5]).toUpperCase()
    };
  }
  return {
    toWallet,
    amtOut,
    curOut,
    amtIn: amtOut,
    curIn: curOut,
    rate: 1,
    sameCurrency: true
  };
}

function inferGoodsActionType(entry){
  if (!entry || entry.entry_kind === "principal") return "ITEM";
  const meta = goodsMetaFromNotes(entry.notes);
  return String(meta.transactionType || INVENTORY_TX_SALE).trim().toUpperCase();
}

function isInventorySaleAction(entry){
  const type = inferGoodsActionType(entry);
  return type === INVENTORY_TX_SALE;
}

function isInventorySettlementAction(entry){
  return inferGoodsActionType(entry) === INVENTORY_TX_SETTLEMENT;
}

function isInventoryCustomerOnlyEntry(entry){
  return hasGoodsTag(entry?.notes) && inferGoodsActionType(entry) === INVENTORY_TX_CUSTOMER;
}

function getExistingInventoryCodes(){
  return new Set(
    state.entries
      .filter(e => hasGoodsTag(e.notes))
      .map(e => goodsMetaFromNotes(e.notes).itemCode)
      .filter(Boolean)
      .map(code => String(code).trim().toUpperCase())
  );
}

function getExistingInventoryReceipts(){
  return new Set(state.entries
    .filter(e => hasGoodsTag(e.notes) && e.entry_kind !== "principal")
    .map(e => goodsMetaFromNotes(e.notes).receiptNumber)
    .filter(Boolean)
    .map(receipt => String(receipt).trim().toUpperCase()));
}

function getExistingInventoryDocumentNumbers(extraNumbers = []){
  const numbers = new Set();
  state.entries
    .filter(e => hasGoodsTag(e.notes))
    .forEach(entry => {
      const meta = goodsMetaFromNotes(entry.notes);
      [meta.receiptNumber, meta.invoiceNumber, meta.paymentReceiptNumber].forEach(value => {
        const code = String(value || "").trim();
        if (code) numbers.add(code.toUpperCase());
      });
    });
  extraNumbers.forEach(value => {
    const code = String(value || "").trim();
    if (code) numbers.add(code.toUpperCase());
  });
  return numbers;
}

function randomHex12(){
  const bytes = new Uint8Array(6);
  if (window.crypto?.getRandomValues){
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function nextPrefixedHexCode(prefix, existingCodes = new Set()){
  const used = new Set(Array.from(existingCodes || []).map(code => String(code).trim().toUpperCase()));
  let candidate = "";
  do {
    candidate = `${prefix}#${randomHex12()}`;
  } while (used.has(candidate.toUpperCase()));
  used.add(candidate.toUpperCase());
  return candidate;
}

function nextInventoryCode(){
  return nextPrefixedHexCode("ITM", getExistingInventoryCodes());
}

function nextInvoiceNumber(extraNumbers = []){
  return nextPrefixedHexCode("INV", getExistingInventoryDocumentNumbers(extraNumbers));
}

function nextPaymentReceiptNumber(extraNumbers = []){
  return nextPrefixedHexCode("RCP", getExistingInventoryDocumentNumbers(extraNumbers));
}

function nextReceiptNumber(extraNumbers = []){
  return nextPaymentReceiptNumber(extraNumbers);
}

function stableInventoryHex12(value){
  const text = String(value || "inventory-document");
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1){
    const code = text.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= code + i;
    hashB = Math.imul(hashB, 0x85ebca6b);
  }
  return `${(hashA >>> 0).toString(16).padStart(8, "0")}${(hashB >>> 0).toString(16).padStart(8, "0")}`.slice(0, 12).toUpperCase();
}

function inventoryInvoiceNumberFromMeta(meta = {}, entry = null){
  return String(meta.invoiceNumber || meta.receiptNumber || shortId(entry?.id) || "N/A").trim();
}

function inventoryPaymentReceiptNumberFromMeta(meta = {}, entry = null, seed = ""){
  const explicit = String(meta.paymentReceiptNumber || "").trim();
  if (explicit) return explicit;
  const seedValue = seed || meta.settlementId || entry?.id || meta.receiptNumber || meta.invoiceNumber || "payment";
  return `RCP#${stableInventoryHex12(`payment:${seedValue}`)}`;
}

function normalizeInventoryCategory(value){
  const raw = String(value || "").trim().toLowerCase();
  if (raw === INVENTORY_CATEGORY_WEIGHT || raw === "kg" || raw === "gram" || raw === "g") {
    return INVENTORY_CATEGORY_WEIGHT;
  }
  if (raw === INVENTORY_CATEGORY_LENGTH || raw === "meter" || raw === "metre" || raw === "m" || raw === "cm") {
    return INVENTORY_CATEGORY_LENGTH;
  }
  if (
    raw === INVENTORY_CATEGORY_VOLUME
    || raw === "liter"
    || raw === "litre"
    || raw === "l"
    || raw === "ml"
    || raw === "milliliter"
    || raw === "millilitre"
  ) {
    return INVENTORY_CATEGORY_VOLUME;
  }
  return INVENTORY_CATEGORY_COUNT;
}

function inventoryCategoryLabel(value){
  const category = normalizeInventoryCategory(value);
  if (category === INVENTORY_CATEGORY_WEIGHT) return "Weight";
  if (category === INVENTORY_CATEGORY_LENGTH) return "Length";
  if (category === INVENTORY_CATEGORY_VOLUME) return "Volume";
  return "Numbers";
}

function inventoryIsDecimalCategory(category){
  const normalized = normalizeInventoryCategory(category);
  return normalized === INVENTORY_CATEGORY_WEIGHT
    || normalized === INVENTORY_CATEGORY_LENGTH
    || normalized === INVENTORY_CATEGORY_VOLUME;
}

function inventoryQtyFieldLabel(category){
  const normalized = normalizeInventoryCategory(category);
  if (normalized === INVENTORY_CATEGORY_WEIGHT) return "Weight";
  if (normalized === INVENTORY_CATEGORY_LENGTH) return "Length";
  if (normalized === INVENTORY_CATEGORY_VOLUME) return "Volume";
  return "Quantity";
}

function inventoryPurchasePriceLabel(category){
  const normalized = normalizeInventoryCategory(category);
  if (normalized === INVENTORY_CATEGORY_WEIGHT) return "Purchase price / KG";
  if (normalized === INVENTORY_CATEGORY_LENGTH) return "Purchase price / m";
  if (normalized === INVENTORY_CATEGORY_VOLUME) return "Cost/ml";
  return "Purchase price";
}

function inventorySellingPriceLabel(category){
  const normalized = normalizeInventoryCategory(category);
  if (normalized === INVENTORY_CATEGORY_WEIGHT) return "Selling price / KG";
  if (normalized === INVENTORY_CATEGORY_LENGTH) return "Selling price / m";
  if (normalized === INVENTORY_CATEGORY_VOLUME) return "Sell/ml";
  return "Selling price";
}

function inventorySalePricePlaceholder(category){
  const normalized = normalizeInventoryCategory(category);
  if (normalized === INVENTORY_CATEGORY_WEIGHT) return "Price / KG";
  if (normalized === INVENTORY_CATEGORY_LENGTH) return "Price / m";
  if (normalized === INVENTORY_CATEGORY_VOLUME) return "Sell price per ml";
  return "Unit price";
}

function parseInventorySizeHint(label){
  const raw = String(label || "").trim().toLowerCase().replace(/,/g, ".");
  if (!raw) return null;
  let match = raw.match(/(\d+(?:\.\d+)?)\s*ml\b/);
  if (match) return { qty: Number(match[1]), unit: INVENTORY_UNIT_ML };
  match = raw.match(/(\d+(?:\.\d+)?)\s*(?:l|liter|litre|liters|litres)\b/);
  if (match) return { qty: Number(match[1]), unit: INVENTORY_UNIT_L };
  return null;
}

function inventoryVolumeBottleLabels(qtyDisplay, unit){
  const priceUnit = normalizeInventoryUnit(unit || INVENTORY_UNIT_ML, INVENTORY_CATEGORY_VOLUME);
  const per = priceUnit === INVENTORY_UNIT_L ? "L" : "ml";
  return {
    cost: `Cost/${per}`,
    sell: `Sell/${per}`,
    qty: "Bottle size",
    priceUnit: per
  };
}

/** Labels when cost/sell are entered per whole bottle (perfume sizes). */
function inventoryVolumeBottleCostLabels(){
  return {
    cost: "Bottle cost",
    sell: "Bottle sell",
    qty: "Bottles",
    priceUnit: "bottle"
  };
}

/** Convert a UI cost/sell entered in ml or L into stored per-liter price. */
function inventoryVolumePriceToPerLiter(enteredPrice, priceUnit){
  const n = Number(enteredPrice || 0);
  if (!(n > 0)) return 0;
  const unit = normalizeInventoryUnit(priceUnit || INVENTORY_UNIT_ML, INVENTORY_CATEGORY_VOLUME);
  return unit === INVENTORY_UNIT_ML ? n * 1000 : n;
}

/** Convert whole-bottle price into stored per-liter price (qty already in liters). */
function inventoryBottlePriceToPerLiter(bottlePrice, bottleQtyLiters){
  const price = Number(bottlePrice || 0);
  const liters = Number(bottleQtyLiters || 0);
  if (!(price > 0) || !(liters > 0)) return 0;
  return price / liters;
}

function normalizeInventorySellBy(value, fallback = "volume"){
  const v = String(value || "").trim().toLowerCase();
  if (v === "bottle" || v === "bottles" || v === "unit") return "bottle";
  if (v === "volume" || v === "pour" || v === "ml") return "volume";
  return fallback === "bottle" ? "bottle" : "volume";
}

/** Perfumes sell by pour (ml). Other volume categories (e.g. Liquids/shampoo) default to whole bottles. */
function inventoryIsPerfumeCategory(groupOrType = null, categorySlug = ""){
  const fromGroup = groupOrType && typeof groupOrType === "object" ? groupOrType : null;
  const slug = String(
    fromGroup?.categorySlug
    || categorySlug
    || ""
  ).trim().toLowerCase();
  const type = String(
    fromGroup?.itemType
    || (!fromGroup ? groupOrType : "")
    || ""
  ).trim().toLowerCase();
  if (slug === "perfumes" || /perfume/.test(slug)) return true;
  if (/perfume/.test(type)) return true;
  return false;
}

/**
 * Default sell mode for new volume stock.
 * Perfumes → volume (pours). Liquids / other volume → bottle (whole units).
 */
function defaultInventorySellBy({ categorySlug = "", categoryName = "", qtyPattern = "" } = {}){
  const pattern = String(qtyPattern || "").toLowerCase();
  if (pattern && pattern !== "volume" && pattern !== INVENTORY_CATEGORY_VOLUME) return "volume";
  if (inventoryIsPerfumeCategory({ categorySlug, itemType: categoryName }, categorySlug)) return "volume";
  if (pattern === "volume" || pattern === INVENTORY_CATEGORY_VOLUME || /liquid|shampoo|oil|attar/i.test(String(categoryName || ""))) {
    return "bottle";
  }
  return "volume";
}

/** Resolve bottle size for a stock group (meta → variant label → null). Qty is display unit (ml/L). */
function inventoryBottleSizeFromGroup(group){
  if (!group) return null;
  const metaQty = Number(group.bottleSizeQty);
  const metaUnit = normalizeInventoryUnit(group.bottleSizeUnit || INVENTORY_UNIT_ML, INVENTORY_CATEGORY_VOLUME);
  if (Number.isFinite(metaQty) && metaQty > 0) {
    return { qty: metaQty, unit: metaUnit };
  }
  const fromVariant = parseInventorySizeHint(group.variantLabel || group.person_name || "");
  if (fromVariant) return fromVariant;
  return null;
}

/** Bottle size expressed in base liters (for stock math). */
function inventoryBottleSizeLiters(groupOrHint){
  const hint = groupOrHint && typeof groupOrHint === "object" && ("qty" in groupOrHint || "unit" in groupOrHint)
    ? groupOrHint
    : inventoryBottleSizeFromGroup(groupOrHint);
  if (!hint || !(Number(hint.qty) > 0)) return 0;
  return normalizeInventoryQuantityInput(hint.qty, INVENTORY_CATEGORY_VOLUME, hint.unit || INVENTORY_UNIT_ML);
}

/**
 * Explicit SELLBY wins. Otherwise: perfume → pours; other volume SKUs with a known bottle size → bottles.
 */
function resolveInventorySellBy(group){
  const raw = String(group?.sellBy || "").trim();
  if (raw) return normalizeInventorySellBy(raw, "volume");
  if (inventoryIsPerfumeCategory(group)) return "volume";
  const category = resolveInventoryItemCategory(group);
  if (category !== INVENTORY_CATEGORY_VOLUME) return "volume";
  // Shampoo / liquids etc.: only bottle-mode when size is known (meta or "400 ml" variant).
  if (inventoryBottleSizeLiters(group) > 0) return "bottle";
  return "volume";
}

function inventorySellsByBottle(group){
  return resolveInventorySellBy(group) === "bottle";
}

function resolveInventoryItemCategory(groupOrType, fallbackCategory = ""){
  const fromGroup = groupOrType && typeof groupOrType === "object" ? groupOrType : null;
  const raw = String(
    fromGroup?.itemCategory
    || fallbackCategory
    || (!fromGroup ? groupOrType : "")
    || ""
  ).trim();
  if (raw) {
    const normalized = normalizeInventoryCategory(raw);
    if (normalized !== INVENTORY_CATEGORY_COUNT) return normalized;
  }
  const itemType = String(
    fromGroup?.itemType
    || fromGroup?.item_type
    || (typeof groupOrType === "string" ? groupOrType : "")
    || ""
  ).trim();
  if (itemType && typeof getCategoryConfig === "function") {
    const pattern = normalizeInventoryCategory(getCategoryConfig(itemType)?.qtyPattern || "");
    if (pattern !== INVENTORY_CATEGORY_COUNT) return pattern;
  }
  if (/perfume|liquid|oil|attar/i.test(itemType)) return INVENTORY_CATEGORY_VOLUME;
  const uom = String(fromGroup?.quantityUnit || fromGroup?.quantity_unit || "").trim().toLowerCase();
  if (uom === INVENTORY_UNIT_ML || uom === INVENTORY_UNIT_L || /^(ml|l|liter|litre|liters|litres)$/i.test(uom)) {
    return INVENTORY_CATEGORY_VOLUME;
  }
  const variant = String(fromGroup?.variantLabel || fromGroup?.variant_label || "").toLowerCase();
  if (/\d+(\.\d+)?\s*ml\b|\b\d+(\.\d+)?\s*(l|liter|litre|liters|litres)\b/i.test(variant)) {
    return INVENTORY_CATEGORY_VOLUME;
  }
  return INVENTORY_CATEGORY_COUNT;
}

function inventoryLineRateForDisplay(unitPricePerBase, qtyBase, category, displayUnit = "", bottleLiters = 0){
  const cat = normalizeInventoryCategory(category);
  const price = Number(unitPricePerBase || 0);
  const unit = normalizeInventoryUnit(
    displayUnit || preferredDraftQtyUnit(cat, qtyBase),
    cat
  );
  if (cat === INVENTORY_CATEGORY_VOLUME && unit === INVENTORY_UNIT_BOTTLE) {
    const liters = Number(bottleLiters || 0);
    return liters > 0 ? price * liters : 0;
  }
  if (cat === INVENTORY_CATEGORY_VOLUME && unit === INVENTORY_UNIT_ML) return price / 1000;
  if (cat === INVENTORY_CATEGORY_WEIGHT && unit === INVENTORY_UNIT_GRAM) return price / 1000;
  if (cat === INVENTORY_CATEGORY_LENGTH && unit === INVENTORY_UNIT_CM) return price / 100;
  return price;
}

function inventoryDisplayRateToUnitPrice(displayRate, category, displayUnit = "", qtyBase = 0, bottleLiters = 0){
  const cat = normalizeInventoryCategory(category);
  const rate = Math.max(0, Number(displayRate || 0));
  const unit = normalizeInventoryUnit(
    displayUnit || preferredDraftQtyUnit(cat, qtyBase),
    cat
  );
  if (cat === INVENTORY_CATEGORY_VOLUME && unit === INVENTORY_UNIT_BOTTLE) {
    const liters = Number(bottleLiters || 0);
    return liters > 0 ? rate / liters : 0;
  }
  if (cat === INVENTORY_CATEGORY_VOLUME && unit === INVENTORY_UNIT_ML) return rate * 1000;
  if (cat === INVENTORY_CATEGORY_WEIGHT && unit === INVENTORY_UNIT_GRAM) return rate * 1000;
  if (cat === INVENTORY_CATEGORY_LENGTH && unit === INVENTORY_UNIT_CM) return rate * 100;
  return rate;
}

function inventoryBaseUnitForCategory(category){
  const normalized = normalizeInventoryCategory(category);
  if (normalized === INVENTORY_CATEGORY_WEIGHT) return INVENTORY_UNIT_KG;
  if (normalized === INVENTORY_CATEGORY_LENGTH) return INVENTORY_UNIT_M;
  if (normalized === INVENTORY_CATEGORY_VOLUME) return INVENTORY_UNIT_L;
  return INVENTORY_UNIT_ITEM;
}

function inventoryUnitSelectOptionsHtml(category, selectedUnit = ""){
  const normalized = normalizeInventoryCategory(category);
  if (normalized === INVENTORY_CATEGORY_WEIGHT){
    const unit = normalizeInventoryUnit(selectedUnit, normalized);
    return [
      `<option value="${INVENTORY_UNIT_KG}"${unit === INVENTORY_UNIT_KG ? " selected" : ""}>KG</option>`,
      `<option value="${INVENTORY_UNIT_GRAM}"${unit === INVENTORY_UNIT_GRAM ? " selected" : ""}>g</option>`
    ].join("");
  }
  if (normalized === INVENTORY_CATEGORY_LENGTH){
    const unit = normalizeInventoryUnit(selectedUnit, normalized);
    return [
      `<option value="${INVENTORY_UNIT_M}"${unit === INVENTORY_UNIT_M ? " selected" : ""}>m</option>`,
      `<option value="${INVENTORY_UNIT_CM}"${unit === INVENTORY_UNIT_CM ? " selected" : ""}>cm</option>`
    ].join("");
  }
  if (normalized === INVENTORY_CATEGORY_VOLUME){
    const unit = normalizeInventoryUnit(selectedUnit, normalized);
    if (unit === INVENTORY_UNIT_BOTTLE) {
      return `<option value="${INVENTORY_UNIT_BOTTLE}" selected>Bottle</option>`;
    }
    return [
      `<option value="${INVENTORY_UNIT_ML}"${unit === INVENTORY_UNIT_ML ? " selected" : ""}>ml</option>`,
      `<option value="${INVENTORY_UNIT_L}"${unit === INVENTORY_UNIT_L ? " selected" : ""}>L</option>`
    ].join("");
  }
  return `<option value="${INVENTORY_UNIT_ITEM}" selected>Pcs</option>`;
}

function normalizeInventoryUnit(value, category){
  const normalizedCategory = normalizeInventoryCategory(category);
  const unit = String(value || "").trim().toLowerCase();
  if (normalizedCategory === INVENTORY_CATEGORY_WEIGHT){
    if (unit === INVENTORY_UNIT_GRAM || unit === "gram" || unit === "grams") return INVENTORY_UNIT_GRAM;
    return INVENTORY_UNIT_KG;
  }
  if (normalizedCategory === INVENTORY_CATEGORY_LENGTH){
    if (unit === INVENTORY_UNIT_CM || unit === "cm" || unit === "centimeter" || unit === "centimetre") return INVENTORY_UNIT_CM;
    return INVENTORY_UNIT_M;
  }
  if (normalizedCategory === INVENTORY_CATEGORY_VOLUME){
    if (unit === INVENTORY_UNIT_BOTTLE || unit === "bottles") return INVENTORY_UNIT_BOTTLE;
    if (unit === INVENTORY_UNIT_ML || unit === "ml" || unit === "milliliter" || unit === "millilitre") return INVENTORY_UNIT_ML;
    return INVENTORY_UNIT_L;
  }
  return INVENTORY_UNIT_ITEM;
}

function trimInventoryNumber(value, decimals = 8){
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  const places = Math.max(0, Number(decimals) || 0);
  if (places === 0) return n.toFixed(0);
  return n.toFixed(places).replace(/\.?0+$/, "");
}

function normalizeInventoryQuantityInput(value, category, unit, bottleLiters = 0){
  const normalizedCategory = normalizeInventoryCategory(category);
  const raw = Number(value || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (normalizedCategory === INVENTORY_CATEGORY_WEIGHT){
    return normalizeInventoryUnit(unit, normalizedCategory) === INVENTORY_UNIT_GRAM ? raw / 1000 : raw;
  }
  if (normalizedCategory === INVENTORY_CATEGORY_LENGTH){
    return normalizeInventoryUnit(unit, normalizedCategory) === INVENTORY_UNIT_CM ? raw / 100 : raw;
  }
  if (normalizedCategory === INVENTORY_CATEGORY_VOLUME){
    const u = normalizeInventoryUnit(unit, normalizedCategory);
    if (u === INVENTORY_UNIT_BOTTLE) {
      const liters = Number(bottleLiters || 0);
      const bottles = Math.max(0, Math.floor(raw));
      return bottles > 0 && liters > 0 ? bottles * liters : 0;
    }
    return u === INVENTORY_UNIT_ML ? raw / 1000 : raw;
  }
  return Math.max(0, Math.floor(raw));
}

function normalizeStoredInventoryQty(value, category, fallback = 0){
  const normalizedCategory = normalizeInventoryCategory(category);
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0){
    return inventoryIsDecimalCategory(normalizedCategory) ? 0 : Math.max(0, Number(fallback) || 0);
  }
  if (inventoryIsDecimalCategory(normalizedCategory)) return n;
  return Math.max(0, Math.floor(n));
}

function formatInventoryQty(value, category){
  const normalizedCategory = normalizeInventoryCategory(category);
  const qty = normalizeStoredInventoryQty(value, normalizedCategory, 0);
  if (normalizedCategory === INVENTORY_CATEGORY_WEIGHT) return `${trimInventoryNumber(qty, 3)} KG`;
  if (normalizedCategory === INVENTORY_CATEGORY_LENGTH) return `${trimInventoryNumber(qty, 3)} m`;
  if (normalizedCategory === INVENTORY_CATEGORY_VOLUME) {
    if (qty > 0 && qty < 1) return `${trimInventoryNumber(qty * 1000, 3)} ml`;
    return `${trimInventoryNumber(qty, 3)} L`;
  }
  return `${trimInventoryNumber(qty, 0)} pcs`;
}

function inventoryQtyLabel(value, category, group = null){
  if (group && inventorySellsByBottle(group)) {
    const bottleLiters = inventoryBottleSizeLiters(group);
    if (bottleLiters > 0) {
      const bottles = Number(value || 0) / bottleLiters;
      const size = inventoryBottleSizeFromGroup(group);
      const sizeText = size
        ? ` · ${trimInventoryNumber(size.qty, 3)}${size.unit === INVENTORY_UNIT_L ? "L" : "ml"}`
        : "";
      return `${trimInventoryNumber(bottles, bottles % 1 === 0 ? 0 : 2)} bottle${Math.abs(bottles - 1) < 0.0001 ? "" : "s"}${sizeText}`;
    }
  }
  return formatInventoryQty(value, category);
}

function inventoryQtyInUnit(baseQty, category, unit, bottleLiters = 0){
  const cat = normalizeInventoryCategory(category);
  const u = normalizeInventoryUnit(unit, cat);
  const q = Number(baseQty || 0);
  if (!Number.isFinite(q)) return 0;
  if (cat === INVENTORY_CATEGORY_WEIGHT && u === INVENTORY_UNIT_GRAM) return q * 1000;
  if (cat === INVENTORY_CATEGORY_LENGTH && u === INVENTORY_UNIT_CM) return q * 100;
  if (cat === INVENTORY_CATEGORY_VOLUME && u === INVENTORY_UNIT_BOTTLE) {
    const liters = Number(bottleLiters || 0);
    return liters > 0 ? q / liters : 0;
  }
  if (cat === INVENTORY_CATEGORY_VOLUME && u === INVENTORY_UNIT_ML) return q * 1000;
  return q;
}

function preferredDraftQtyUnit(category, baseQty){
  const cat = normalizeInventoryCategory(category);
  if (cat === INVENTORY_CATEGORY_VOLUME && Number(baseQty) > 0 && Number(baseQty) < 1) return INVENTORY_UNIT_ML;
  if (cat === INVENTORY_CATEGORY_WEIGHT && Number(baseQty) > 0 && Number(baseQty) < 1) return INVENTORY_UNIT_GRAM;
  if (cat === INVENTORY_CATEGORY_LENGTH && Number(baseQty) > 0 && Number(baseQty) < 1) return INVENTORY_UNIT_CM;
  return inventoryBaseUnitForCategory(cat);
}

function inventoryCustomerDirectory({ search = "", offset = 0, limit = 20 } = {}){
  const q = String(search || "").trim().toLowerCase();
  const names = getInventoryCustomerNames();
  const filtered = q
    ? names.filter(name => {
        if (name.toLowerCase().includes(q)) return true;
        const contact = getInventoryCustomerContact(name);
        return [contact.phone, contact.company, contact.email, contact.trn]
          .some(v => String(v || "").toLowerCase().includes(q));
      })
    : names;
  const slice = filtered.slice(offset, offset + limit);
  return {
    total: filtered.length,
    offset,
    limit,
    hasMore: offset + slice.length < filtered.length,
    items: slice.map(name => {
      const contact = getInventoryCustomerContact(name);
      return { name, ...contact };
    })
  };
}

function inventoryQtySummary(groups, key){
  const rows = Array.isArray(groups) ? groups : [];
  const totals = {
    [INVENTORY_CATEGORY_COUNT]: 0,
    [INVENTORY_CATEGORY_WEIGHT]: 0,
    [INVENTORY_CATEGORY_LENGTH]: 0,
    [INVENTORY_CATEGORY_VOLUME]: 0
  };
  for (const group of rows){
    const category = normalizeInventoryCategory(group.itemCategory);
    totals[category] += Number(group[key] || 0);
  }
  const parts = [];
  if (totals[INVENTORY_CATEGORY_COUNT]) parts.push(formatInventoryQty(totals[INVENTORY_CATEGORY_COUNT], INVENTORY_CATEGORY_COUNT));
  if (totals[INVENTORY_CATEGORY_WEIGHT]) parts.push(formatInventoryQty(totals[INVENTORY_CATEGORY_WEIGHT], INVENTORY_CATEGORY_WEIGHT));
  if (totals[INVENTORY_CATEGORY_LENGTH]) parts.push(formatInventoryQty(totals[INVENTORY_CATEGORY_LENGTH], INVENTORY_CATEGORY_LENGTH));
  if (totals[INVENTORY_CATEGORY_VOLUME]) parts.push(formatInventoryQty(totals[INVENTORY_CATEGORY_VOLUME], INVENTORY_CATEGORY_VOLUME));
  return parts.length ? parts.join(" | ") : "0";
}

function inventoryLinePaidAmount(meta = {}, lineTotal = 0){
  const total = Math.max(finiteMoney(lineTotal), 0);
  const paid = Number(meta.paidAmount);
  if (Number.isFinite(paid)) return Math.min(Math.max(paid, 0), total);
  const balance = Number(meta.balanceAmount);
  if (Number.isFinite(balance)) return Math.min(Math.max(total - Math.max(balance, 0), 0), total);
  return total;
}

function inventoryLineBalanceAmount(meta = {}, lineTotal = 0){
  const total = Math.max(finiteMoney(lineTotal), 0);
  // Prefer paid-derived balance when PAID is explicit so paid + balance === total
  if (Number.isFinite(Number(meta.paidAmount))) {
    return Math.max(total - inventoryLinePaidAmount(meta, total), 0);
  }
  const balance = Number(meta.balanceAmount);
  if (Number.isFinite(balance)) return Math.min(Math.max(balance, 0), total);
  return Math.max(total - inventoryLinePaidAmount(meta, total), 0);
}

function inventoryPaymentStatus(meta = {}, lineTotal = 0){
  const status = String(meta.paymentStatus || "").trim().toUpperCase();
  if (status === "FULL" || status === "FULL PAID") return "Full Paid";
  if (status === "PARTIAL" || status === "PARTIAL PAID") return "Partial Paid";
  return inventoryLineBalanceAmount(meta, lineTotal) <= 0.00000001 ? "Full Paid" : "Partial Paid";
}

function getInventoryReceiptEntries(receiptNumber, fallbackEntry = null){
  const fallbackMeta = goodsMetaFromNotes(fallbackEntry?.notes || "");
  const receipt = String(receiptNumber || "").trim();
  const invoiceHint = String(
    fallbackMeta.invoiceNumber || fallbackMeta.receiptNumber || receipt || ""
  ).trim();
  const saleSetHint = String(fallbackMeta.saleSetId || "").trim();
  // Prefer sale-set identity so unrelated invoices never merge into one receipt.
  const entries = state.entries.filter(e => {
    if (e.entry_kind === "principal" || !hasGoodsTag(e.notes)) return false;
    const meta = goodsMetaFromNotes(e.notes);
    const rcpt = String(meta.receiptNumber || "").trim();
    const inv = String(meta.invoiceNumber || "").trim();
    const sset = String(meta.saleSetId || "").trim();
    if (saleSetHint) return !!sset && sset === saleSetHint;
    if (invoiceHint) return (inv && inv === invoiceHint) || (rcpt && rcpt === invoiceHint);
    if (receipt) return (rcpt && rcpt === receipt) || (inv && inv === receipt) || (sset && sset === receipt);
    return false;
  });
  // If tags were lost on reload, still keep every locally known sibling from the same finalize.
  if (fallbackEntry && !entries.some(e => e.id === fallbackEntry.id)) {
    entries.push(fallbackEntry);
  }
  // Drop accidental duplicate rows (same sale line id / same set + line no).
  const deduped = dedupeInventoryActionEntries(entries);
  if (deduped.length) {
    return deduped.sort((a, b) => {
      const aMeta = goodsMetaFromNotes(a.notes);
      const bMeta = goodsMetaFromNotes(b.notes);
      const aNo = Number(aMeta.saleLineNo);
      const bNo = Number(bMeta.saleLineNo);
      if (Number.isFinite(aNo) && Number.isFinite(bNo) && aNo !== bNo) return aNo - bNo;
      return dateStamp(a.action_date || a.created_at) - dateStamp(b.action_date || b.created_at)
        || String(a.created_at || "").localeCompare(String(b.created_at || ""))
        || String(a.id || "").localeCompare(String(b.id || ""));
    });
  }
  return fallbackEntry ? [fallbackEntry] : [];
}

/** Remove duplicate sale/settlement rows kept by lazy merge races. */
function dedupeInventoryActionEntries(entries){
  const out = [];
  const seenIds = new Set();
  const seenLineKeys = new Set();
  for (const entry of entries || []) {
    if (!entry) continue;
    const id = String(entry.id || "");
    if (id && seenIds.has(id)) continue;
    const meta = goodsMetaFromNotes(entry.notes || "");
    const slid = String(meta.saleLineId || "").trim();
    const sset = String(meta.saleSetId || "").trim();
    const lineNo = Number(meta.saleLineNo);
    const lineKey = slid
      ? `slid:${slid}`
      : (sset && Number.isFinite(lineNo) ? `sset:${sset}:${lineNo}` : "");
    if (lineKey && seenLineKeys.has(lineKey)) continue;
    if (id) seenIds.add(id);
    if (lineKey) seenLineKeys.add(lineKey);
    out.push(entry);
  }
  return out;
}

function dedupeSaleDraftLines(lines){
  const out = [];
  const seen = new Set();
  for (const line of lines || []) {
    if (!line) continue;
    const key = String(line.lineId || "").trim()
      || `${line.groupId}|${line.qty}|${line.unitPrice}|${line.grossAmount}|${line.displayUnit || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function getInventoryReceiptData(receiptNumber, fallbackEntry = null){
  const entries = getInventoryReceiptEntries(receiptNumber, fallbackEntry);
  const saleEntries = entries.filter(isInventorySaleAction);
  const settlementEntries = entries.filter(isInventorySettlementAction);
  const settlementsBySaleId = new Map();
  settlementEntries.forEach(entry => {
    const meta = goodsMetaFromNotes(entry.notes);
    const saleId = meta.settlementForEntryId || "";
    if (!saleId) return;
    if (!settlementsBySaleId.has(saleId)) settlementsBySaleId.set(saleId, []);
    settlementsBySaleId.get(saleId).push(entry);
  });

  const saleRows = saleEntries.map((entry, index) => {
    const principalEntry = state.entries.find(e => e.group_id === entry.group_id && e.entry_kind === "principal");
    const entryMeta = goodsMetaFromNotes(entry.notes);
    const principalMeta = goodsMetaFromNotes(principalEntry?.notes);
    const invoiceNumber = inventoryInvoiceNumberFromMeta(entryMeta, entry);
    const initialReceiptNumber = inventoryPaymentReceiptNumberFromMeta(entryMeta, entry, `${invoiceNumber || entry.id}:initial`);
    const itemCategory = normalizeInventoryCategory(entryMeta.itemCategory || principalMeta.itemCategory);
    const qty = normalizeStoredInventoryQty(entryMeta.soldQty, itemCategory, 0);
    const total = Number(entry.action_amount || 0);
    const tax = taxBreakdownFromMeta(entryMeta, total);
    const unitPrice = entryMeta.unitSoldPrice != null
      ? Number(entryMeta.unitSoldPrice)
      : (qty ? Number(tax.net || total) / qty : 0);
    const lineSettlements = settlementsBySaleId.get(entry.id) || [];
    const initialPaid = inventoryLinePaidAmount(entryMeta, total);
    const settlementPaid = lineSettlements.reduce((sum, settlement) => sum + Number(settlement.action_amount || 0), 0);
    const paid = Math.min(total, initialPaid + settlementPaid);
    const balance = Math.max(total - paid, 0);
    return {
      sr: index + 1,
      entry,
      entryMeta,
      invoiceNumber,
      initialReceiptNumber,
      principalEntry,
      principalMeta,
      itemCode: principalMeta.itemCode || entryMeta.itemCode || "",
      itemName: (() => {
        const base = principalEntry?.person_name || entry.person_name || "Goods item";
        const parts = [
          principalMeta.brand || entryMeta.brand || "",
          principalMeta.productLine || entryMeta.productLine || "",
          principalMeta.variantLabel || entryMeta.variantLabel || ""
        ].map(v => String(v || "").trim()).filter(Boolean);
        const labeled = parts.length ? parts.join(" · ") : base;
        // Always keep repeated pours as distinct invoice rows (draft + finalized).
        const lineNo = entryMeta.saleLineNo != null ? Number(entryMeta.saleLineNo) : (index + 1);
        return `${labeled} (#${lineNo})`;
      })(),
      customerPhone: entryMeta.customerPhone || "",
      customerAddress: entryMeta.customerAddress || "",
      customerCompany: entryMeta.customerCompany || "",
      customerTrn: entryMeta.customerTrn || "",
      customerEmail: entryMeta.customerEmail || "",
      itemCategory,
      qty,
      qtyDisplay: inventoryQtyLabel(qty, itemCategory),
      unitPrice,
      netAmount: tax.net,
      taxAmount: tax.tax,
      taxRate: tax.rate,
      taxMode: tax.mode,
      taxApplied: tax.applied,
      total,
      initialPaid,
      settlementPaid,
      paid,
      balance,
      paymentStatus: balance <= 0.00000001 ? "Full Paid" : "Partial Paid",
      currency: entry.currency
    };
  });

  const totalsByCurrency = saleRows.reduce((acc, row) => {
    const currencyKey = row.currency || "AED";
    if (!acc.has(currencyKey)) acc.set(currencyKey, { net: 0, tax: 0, total: 0, paid: 0, balance: 0 });
    const bucket = acc.get(currencyKey);
    bucket.net += Number(row.netAmount || 0);
    bucket.tax += Number(row.taxAmount || 0);
    bucket.total += Number(row.total || 0);
    bucket.paid += Number(row.paid || 0);
    bucket.balance += Number(row.balance || 0);
    return acc;
  }, new Map());

  const settlementGroups = new Map();
  settlementEntries.forEach(entry => {
    const meta = goodsMetaFromNotes(entry.notes);
    const key = meta.settlementId || entry.id || `${entry.action_date || ""}-${entry.created_at || ""}`;
    if (!settlementGroups.has(key)){
      const paymentReceiptNumber = inventoryPaymentReceiptNumberFromMeta(meta, entry, key);
      settlementGroups.set(key, {
        key,
        date: entry.action_date,
        currency: entry.currency,
        amount: 0,
        paymentReceiptNumber,
        notes: cleanGoodsDisplayNote(entry.notes) || "Balance settlement"
      });
    }
    const row = settlementGroups.get(key);
    row.amount += Number(entry.action_amount || 0);
    if (!row.date) row.date = entry.action_date;
  });

  const currency = totalsByCurrency.size === 1 ? Array.from(totalsByCurrency.keys())[0] : (saleRows[0]?.currency || fallbackEntry?.currency || "AED");
  const receiptNumberValue = receiptNumber || goodsMetaFromNotes(fallbackEntry?.notes).receiptNumber || shortId(fallbackEntry?.id) || "N/A";
  const invoiceNumber = saleRows.find(row => row.invoiceNumber)?.invoiceNumber || inventoryInvoiceNumberFromMeta(goodsMetaFromNotes(fallbackEntry?.notes), fallbackEntry) || receiptNumberValue;
  const totalAmount = saleRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const initialPaidTotal = saleRows.reduce((sum, row) => sum + Number(row.initialPaid || 0), 0);
  const initialPaymentReceiptNumber = saleRows.find(row => row.initialPaid > 0.00000001)?.initialReceiptNumber || inventoryPaymentReceiptNumberFromMeta(goodsMetaFromNotes(fallbackEntry?.notes), fallbackEntry, `${invoiceNumber}:initial`);
  const saleDates = saleRows.map(row => row.entry.action_date).filter(Boolean).sort((a, b) => dateStamp(a) - dateStamp(b));
  const paymentRows = [];
  if (saleRows.length && totalsByCurrency.size <= 1){
    let cumulativePaid = initialPaidTotal;
    paymentRows.push({
      type: "First payment",
      date: saleDates[0] || fallbackEntry?.action_date || "—",
      receiptNumber: initialPaymentReceiptNumber,
      amount: initialPaidTotal,
      balanceAfter: Math.max(totalAmount - cumulativePaid, 0),
      currency
    });
    Array.from(settlementGroups.values())
      .sort((a, b) => {
        const diff = dateStamp(a.date) - dateStamp(b.date);
        if (diff !== 0) return diff;
        return String(a.key).localeCompare(String(b.key));
      })
      .forEach(row => {
        cumulativePaid = Math.min(totalAmount, cumulativePaid + Number(row.amount || 0));
        paymentRows.push({
          type: "Balance settlement",
          date: row.date || "—",
          receiptNumber: row.paymentReceiptNumber,
          amount: Number(row.amount || 0),
          balanceAfter: Math.max(totalAmount - cumulativePaid, 0),
          currency: row.currency || currency,
          notes: row.notes
        });
      });
  }

  return {
    receiptNumber: receiptNumberValue,
    invoiceNumber,
    entries,
    saleEntries,
    settlementEntries,
    saleRows,
    totalsByCurrency,
    paymentRows,
    currency,
    totalAmount,
    paidTotal: saleRows.reduce((sum, row) => sum + Number(row.paid || 0), 0),
    balanceTotal: saleRows.reduce((sum, row) => sum + Number(row.balance || 0), 0),
    customerName: saleRows[0]?.entryMeta.customerName || goodsMetaFromNotes(fallbackEntry?.notes).customerName || "Walk-in customer",
    customerPhone: saleRows.find(row => row.customerPhone)?.customerPhone || goodsMetaFromNotes(fallbackEntry?.notes).customerPhone || "",
    customerAddress: saleRows.find(row => row.customerAddress)?.customerAddress || goodsMetaFromNotes(fallbackEntry?.notes).customerAddress || "",
    customerCompany: saleRows.find(row => row.customerCompany)?.customerCompany || goodsMetaFromNotes(fallbackEntry?.notes).customerCompany || "",
    customerTrn: saleRows.find(row => row.customerTrn)?.customerTrn || goodsMetaFromNotes(fallbackEntry?.notes).customerTrn || "",
    customerEmail: saleRows.find(row => row.customerEmail)?.customerEmail || goodsMetaFromNotes(fallbackEntry?.notes).customerEmail || ""
  };
}

function addCurrencyTotal(target, currency, amount){
  const key = currency || "AED";
  target.set(key, Number(target.get(key) || 0) + Number(amount || 0));
}

function inventoryCurrencyTotalsText(totals, options = {}){
  const rows = totals instanceof Map ? Array.from(totals.entries()) : Object.entries(totals || {});
  return rows
    .filter(([, amount]) => Math.abs(Number(amount || 0)) > 0.00000001)
    .map(([currency, amount]) => moneyText(amount, currency, options))
    .join(" | ");
}

function collectOutstandingInventoryInvoices(){
  const seenReceipts = new Set();
  const saleEntries = state.entries.filter(e => e.entry_kind !== "principal" && hasGoodsTag(e.notes) && isInventorySaleAction(e));
  const invoices = [];

  for (const entry of saleEntries){
    const meta = goodsMetaFromNotes(entry.notes);
    const receiptNumber = meta.receiptNumber || meta.invoiceNumber || meta.saleSetId || shortId(entry.id) || "";
    const receiptKey = receiptNumber || entry.id;
    if (seenReceipts.has(receiptKey)) continue;
    seenReceipts.add(receiptKey);

    const receiptData = getInventoryReceiptData(receiptNumber, entry);
    if (!receiptData.saleRows.length || receiptData.balanceTotal <= 0.00000001) continue;

    const balanceByCurrency = new Map();
    receiptData.totalsByCurrency.forEach((amounts, currency) => {
      addCurrencyTotal(balanceByCurrency, currency, amounts.balance || 0);
    });
    const outstandingSaleRow = receiptData.saleRows.find(row => row.balance > 0.00000001) || receiptData.saleRows[0];
    const dateValue = receiptData.saleRows
      .map(row => row.entry.action_date)
      .filter(Boolean)
      .sort((a, b) => dateStamp(b) - dateStamp(a))[0] || entry.action_date || entry.loan_date || "";
    const oldestDate = receiptData.saleRows
      .map(row => row.entry.action_date)
      .filter(Boolean)
      .sort((a, b) => dateStamp(a) - dateStamp(b))[0] || entry.action_date || entry.loan_date || "";
    const itemNames = receiptData.saleRows.map(row => {
      const qty = row.qtyDisplay ? ` ${row.qtyDisplay}` : "";
      return `${row.itemName || "Item"}${qty}`;
    }).filter(Boolean);

    invoices.push({
      receiptNumber: receiptData.receiptNumber || receiptNumber || shortId(entry.id),
      invoiceNumber: receiptData.invoiceNumber || receiptData.receiptNumber || receiptNumber || shortId(entry.id),
      customerName: receiptData.customerName || meta.customerName || "Walk-in customer",
      entryId: outstandingSaleRow?.entry?.id || entry.id,
      date: dateValue,
      oldestDate,
      lineCount: receiptData.saleRows.length,
      itemSummary: itemNames.slice(0, 3).join(", ") + (itemNames.length > 3 ? ` +${itemNames.length - 3}` : ""),
      taxText: formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "tax") || "-",
      totalText: formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "total") || moneyText(receiptData.totalAmount, receiptData.currency),
      paidText: formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "paid") || moneyText(receiptData.paidTotal, receiptData.currency),
      balanceText: inventoryCurrencyTotalsText(balanceByCurrency) || moneyText(receiptData.balanceTotal, receiptData.currency),
      totalAmount: receiptData.totalAmount,
      paidTotal: receiptData.paidTotal,
      balanceTotal: receiptData.balanceTotal,
      currency: receiptData.totalsByCurrency.size === 1 ? Array.from(receiptData.totalsByCurrency.keys())[0] : receiptData.currency,
      totalsByCurrency: receiptData.totalsByCurrency,
      balanceByCurrency,
      canSettle: receiptData.totalsByCurrency.size === 1
    });
  }

  return invoices.sort((a, b) =>
    String(a.customerName).localeCompare(String(b.customerName)) ||
    dateStamp(b.date) - dateStamp(a.date) ||
    String(a.receiptNumber).localeCompare(String(b.receiptNumber))
  );
}

function renderInventoryOutstandingBanner(){
  // Show every saved customer, including customer-only records with no invoice yet.
  const nameSet = new Set(getInventoryCustomerNames());
  for (const entry of state.entries) {
    if (entry.entry_kind === "principal" || !hasGoodsTag(entry.notes) || !isInventorySaleAction(entry)) continue;
    const cust = String(goodsMetaFromNotes(entry.notes).customerName || "").trim() || "Walk-in customer";
    nameSet.add(cust);
  }
  const customerNames = [...nameSet].sort((a, b) => a.localeCompare(b));
  const memberRows = customerNames.map(name => {
    const record = getInventoryCustomerRecord(name);
    const invoiceCount = record.invoices.length;
    const outstandingCount = record.invoices.filter(inv => {
      let bal = 0;
      inv.balanceByCurrency?.forEach?.(amount => { bal += Number(amount || 0); });
      return bal > 0.00000001 || Number(inv.balanceTotal || 0) > 0.00000001;
    }).length;
    const invoiceSearch = record.invoices.map(invoice =>
      `${invoice.invoiceNumber || invoice.receiptNumber} ${invoice.itemSummary} ${invoice.totalText} ${invoice.paidText} ${invoice.balanceText}`
    ).join(" ");
    return {
      name: record.customerName || name,
      invoices: record.invoices,
      invoiceCount,
      outstandingCount,
      totalByCurrency: record.totalByCurrency,
      paidByCurrency: record.paidByCurrency,
      balanceByCurrency: record.balanceByCurrency,
      hasInvoices: invoiceCount > 0,
      searchText: [
        record.customerName || name,
        invoiceSearch,
        record.contact?.phone || "",
        record.contact?.company || "",
        record.contact?.email || "",
        record.contact?.trn || "",
        record.contact?.address || ""
      ].join(" ")
    };
  }).filter(Boolean);

  if (!memberRows.length){
    return `<div class="inventory-outstanding-empty-state">No customer records yet. Use Add Customer to save a customer before their first invoice.</div>`;
  }

  const totalBalance = new Map();
  let outstandingInvoices = 0;
  const invoiceCount = memberRows.reduce((count, member) => count + member.invoiceCount, 0);
  memberRows.forEach(member => {
    member.balanceByCurrency.forEach((amount, currency) => addCurrencyTotal(totalBalance, currency, amount));
    outstandingInvoices += member.outstandingCount;
  });

  return `
    <details class="inventory-outstanding-banner inventory-outstanding-panel" open>
      <summary class="inventory-outstanding-top">
        <div>
          <p>${escapeHtml(memberRows.length)} customer${memberRows.length === 1 ? "" : "s"} · ${escapeHtml(invoiceCount)} invoice${invoiceCount === 1 ? "" : "s"}${outstandingInvoices ? ` · ${escapeHtml(outstandingInvoices)} open` : (invoiceCount ? " · all settled" : " · no invoices yet")}.</p>
        </div>
        <div class="inventory-outstanding-top-actions">
          <div class="inventory-outstanding-total">
            <small>Open balance</small>
            <strong>${escapeHtml(inventoryCurrencyTotalsText(totalBalance) || "0")}</strong>
          </div>
        </div>
      </summary>
      <div class="inventory-outstanding-body">
        <div class="inventory-outstanding-search">
          <div class="inventory-outstanding-search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input class="input inventoryOutstandingSearchInput" type="search" placeholder="Search name, mobile, company, email, invoice, or item" />
          </div>
          <button class="tiny inventoryOutstandingSearchBtn" type="button">Search</button>
          <button class="tiny ghost inventoryOutstandingClearSearchBtn" type="button">Clear</button>
        </div>
        <div class="inventory-outstanding-members">
        ${memberRows.map(member => {
          const balanceText = inventoryCurrencyTotalsText(member.balanceByCurrency) || "0";
          const statusLabel = !member.hasInvoices
            ? "No invoices yet"
            : member.outstandingCount
              ? `${member.outstandingCount} open · ${balanceText}`
              : `${member.invoiceCount} paid`;
          return `
          <details class="inventory-outstanding-member" data-search="${escapeHtml(member.searchText)}">
            <summary>
              <button class="inventory-outstanding-name inventoryOutstandingCustomerOpenBtn" type="button" data-customer="${escapeHtml(member.name)}" title="Open customer record">${escapeHtml(member.name)}</button>
              <strong>${escapeHtml(String(member.invoiceCount))} invoice${member.invoiceCount === 1 ? "" : "s"} · ${escapeHtml(statusLabel)}</strong>
            </summary>
            <div class="inventory-outstanding-list">
              <div class="inventory-outstanding-row">
                <div class="inventory-outstanding-main">
                  <strong>${member.hasInvoices ? (member.outstandingCount ? "Customer invoices" : "Paid customer record") : "Customer record"}</strong>
                  <span>${member.hasInvoices
                    ? `${escapeHtml(member.invoiceCount)} invoice${member.invoiceCount === 1 ? "" : "s"} for ${escapeHtml(member.name)}${member.outstandingCount ? " · open balances listed in record" : ""}`
                    : `No invoices yet for ${escapeHtml(member.name)}. Customer details are saved and ready for a future sale.`}</span>
                </div>
                <div class="inventory-outstanding-money"><small>Total</small><strong>${escapeHtml(inventoryCurrencyTotalsText(member.totalByCurrency) || "0")}</strong></div>
                <div class="inventory-outstanding-money"><small>Paid</small><strong>${escapeHtml(inventoryCurrencyTotalsText(member.paidByCurrency) || "0")}</strong></div>
                <div class="inventory-outstanding-money${member.outstandingCount ? " is-due" : ""}"><small>Balance</small><strong>${escapeHtml(balanceText)}</strong></div>
                <div class="inventory-outstanding-actions">
                  <button class="tiny inventoryOutstandingCustomerOpenBtn" type="button" data-customer="${escapeHtml(member.name)}" title="Open invoices & receipts">Open</button>
                  <button class="tiny ghost inventoryOutstandingCustomerStatementBtn" type="button" data-customer="${escapeHtml(member.name)}" title="Download full customer statement">Statement</button>
                  ${member.outstandingCount ? `<button class="tiny ghost inventoryOutstandingCustomerSettleBtn" type="button" data-customer="${escapeHtml(member.name)}" title="Select one or more invoices and record settlement">Settle</button>` : ""}
                </div>
              </div>
            </div>
          </details>
        `;
        }).join("")}
          <div class="inventory-outstanding-empty hide">No matching customers.</div>
        </div>
      </div>
    </details>
  `;
}

function applyInventoryOutstandingSearch(root = els.inventoryOutstandingList || els.goodsList){
  const banner = root?.querySelector(".inventory-outstanding-banner");
  const input = banner?.querySelector(".inventoryOutstandingSearchInput");
  const members = Array.from(banner?.querySelectorAll(".inventory-outstanding-member") || []);
  const empty = banner?.querySelector(".inventory-outstanding-empty");
  const term = String(input?.value || "").trim().toLowerCase();
  let visible = 0;
  members.forEach(member => {
    const haystack = String(member.dataset.search || "").toLowerCase();
    const isVisible = !term || haystack.includes(term);
    member.classList.toggle("hide", !isVisible);
    if (isVisible) visible += 1;
    else member.open = false;
  });
  if (empty) empty.classList.toggle("hide", !term || visible > 0);
}

function openInventoryAddCustomer(){
  activate("goods");
  openGoodsModal("sold", { addCustomer: true });
}

function bindInventoryAddCustomerButtons(){
  document.querySelectorAll(".inventoryAddCustomerBtn").forEach(btn => {
    if (btn.dataset.boundAddCustomer === "1") return;
    btn.dataset.boundAddCustomer = "1";
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      openInventoryAddCustomer();
    });
  });
}

function bindInventoryOutstandingBanner(root = els.inventoryOutstandingList || els.goodsList){
  if (!root) return;
  root.querySelectorAll(".inventoryOutstandingCustomerOpenBtn").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    openInventoryCustomerModal(btn.dataset.customer);
  }));
  root.querySelectorAll(".inventoryOutstandingCustomerStatementBtn").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    downloadInventoryCustomerStatementPDF(btn.dataset.customer);
  }));
  root.querySelectorAll(".inventoryOutstandingSearchBtn").forEach(btn => btn.addEventListener("click", () => applyInventoryOutstandingSearch(root)));
  root.querySelectorAll(".inventoryOutstandingClearSearchBtn").forEach(btn => btn.addEventListener("click", () => {
    const input = root.querySelector(".inventoryOutstandingSearchInput");
    if (input) input.value = "";
    applyInventoryOutstandingSearch(root);
  }));
  root.querySelectorAll(".inventoryOutstandingSearchInput").forEach(input => input.addEventListener("input", () => applyInventoryOutstandingSearch(root)));
  root.querySelectorAll(".inventoryOutstandingSearchInput").forEach(input => input.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    applyInventoryOutstandingSearch(root);
  }));
}

async function setInventorySubView(view = "stock"){
  const next = view === "customers" ? "customers" : (view === "drafts" ? "drafts" : "stock");
  state.inventoryView = next;
  const showCustomers = next === "customers";
  const showDrafts = next === "drafts";
  els.inventoryStockView?.classList.toggle("hide", showCustomers || showDrafts);
  els.inventoryDraftsView?.classList.toggle("hide", !showDrafts);
  els.inventoryCustomersView?.classList.toggle("hide", !showCustomers);
  if (els.inventorySectionDesc) {
    els.inventorySectionDesc.textContent = showCustomers
      ? "Saved customers, invoices, receipts, settlements, and statements — including customers with no sale yet."
      : showDrafts
        ? "Saved carts / proforma — finalize later without reducing stock until then."
        : "Category → Brand → Type → Variant — add to cart, save, then finalize.";
  }
  if (showCustomers) {
    const root = els.inventoryOutstandingList;
    if (root) {
      root.innerHTML = `<div class="empty inventory-loading-hint">Loading customers &amp; invoices…</div>`;
    }
    // Always refresh sales when opening Customers so the list never stays blank
    // after a stock-only lazy refresh. Retry briefly if session is still warming up.
    let loaded = false;
    for (let attempt = 0; attempt < 3 && !loaded; attempt += 1) {
      loaded = await loadInventorySalesForCustomers({ force: true });
      if (!loaded) await new Promise(resolve => setTimeout(resolve, 220 * (attempt + 1)));
    }
    renderInventoryOutstandingSection();
  } else if (showDrafts) {
    loadSaleDraftLibrary();
    renderInventoryDraftsSection();
  } else {
    renderInventoryList();
  }
}

function renderInventoryOutstandingSection(){
  const root = els.inventoryOutstandingList;
  if (!root) return;
  root.innerHTML = renderInventoryOutstandingBanner();
  root.querySelectorAll(".inventoryOutstandingCustomerPdfBtn").forEach(btn => btn.addEventListener("click", () => downloadOutstandingCustomerInvoicePDF(btn.dataset.customer)));
  root.querySelectorAll(".inventoryOutstandingCustomerSettleBtn").forEach(btn => btn.addEventListener("click", () => openGoodsCustomerSettlementModal(btn.dataset.customer)));
  bindInventoryOutstandingBanner(root);
}

function outstandingInvoicesForCustomer(customerName){
  const target = String(customerName || "").trim().toLowerCase();
  return collectOutstandingInventoryInvoices()
    .filter(invoice => String(invoice.customerName || "").trim().toLowerCase() === target)
    .sort((a, b) => dateStamp(a.oldestDate || a.date) - dateStamp(b.oldestDate || b.date) || String(a.receiptNumber).localeCompare(String(b.receiptNumber)));
}

async function downloadOutstandingCustomerInvoicePDF(customerName){
  const invoices = outstandingInvoicesForCustomer(customerName);
  if (!invoices.length){
    alert("No outstanding invoices found for this customer.");
    return;
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = "Outstanding Inventory Invoice";
  const subtitle = `Customer: ${customerName}`;
  const contact = getInventoryCustomerContact(customerName);
  const totalBalance = new Map();
  const totalAmounts = new Map();
  const paidAmounts = new Map();
  invoices.forEach(invoice => {
    invoice.totalsByCurrency.forEach((amounts, currency) => {
      addCurrencyTotal(totalAmounts, currency, amounts.total || 0);
      addCurrencyTotal(paidAmounts, currency, amounts.paid || 0);
    });
    invoice.balanceByCurrency.forEach((amount, currency) => addCurrencyTotal(totalBalance, currency, amount));
  });
  drawPdfHeader(doc, logoData, title, subtitle);
  const partiesBottom = drawInventoryPdfPartiesAndMeta(doc, {
    customerName,
    customerCompany: contact.company || "",
    customerTrn: contact.trn || "",
    customerPhone: contact.phone || "",
    customerEmail: contact.email || "",
    customerAddress: contact.address || "",
    meta: [
      { label: "Invoices", value: String(invoices.length) },
      { label: "Total", value: inventoryCurrencyTotalsText(totalAmounts, { forPdf: true }) || "—" },
      { label: "Paid", value: inventoryCurrencyTotalsText(paidAmounts, { forPdf: true }) || "—" },
      { label: "Balance", value: inventoryCurrencyTotalsText(totalBalance, { forPdf: true }) || "—" }
    ]
  });

  doc.autoTable({
    startY: partiesBottom + 5,
    head: [["Invoice", "Date", "Items", "VAT", "Total", "Paid", "Balance"]],
    body: invoices.map(invoice => [
      invoice.invoiceNumber || invoice.receiptNumber,
      displayDate(invoice.oldestDate || invoice.date || "—"),
      `${invoice.lineCount} item${invoice.lineCount === 1 ? "" : "s"}${invoice.itemSummary ? ` · ${invoice.itemSummary}` : ""}`,
      formatInventoryTotalsByCurrency(invoice.totalsByCurrency, "tax", { forPdf: true }) || "—",
      formatInventoryTotalsByCurrency(invoice.totalsByCurrency, "total", { forPdf: true }) || "—",
      formatInventoryTotalsByCurrency(invoice.totalsByCurrency, "paid", { forPdf: true }) || "—",
      inventoryCurrencyTotalsText(invoice.balanceByCurrency, { forPdf: true }) || "—"
    ]),
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7.6 },
    styles: { font: "helvetica", fontSize: 7.6, cellPadding: 1.7, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 24 },
      2: { cellWidth: 48 },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 21, halign: "right" },
      6: { cellWidth: 21, halign: "right" }
    },
    margin: { top: 42, bottom: 32 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  doc.save(`Outstanding_Invoice_${String(customerName || "customer").replace(/\s+/g, "_")}.pdf`);
}

function normalizeInventoryCustomerKey(name){
  return String(name || "").trim().toLowerCase();
}

function getInventoryCustomerInvoices(customerName){
  const target = normalizeInventoryCustomerKey(customerName);
  if (!target) return [];
  const seenReceipts = new Set();
  return state.entries
    .filter(entry => entry.entry_kind !== "principal" && hasGoodsTag(entry.notes) && isInventorySaleAction(entry))
    .filter(entry => normalizeInventoryCustomerKey(goodsMetaFromNotes(entry.notes).customerName || "Walk-in customer") === target)
    .sort((a, b) => dateStamp(a.action_date || a.created_at) - dateStamp(b.action_date || b.created_at))
    .map(entry => {
      const meta = goodsMetaFromNotes(entry.notes);
      const receiptNumber = meta.receiptNumber || meta.invoiceNumber || meta.saleSetId || shortId(entry.id) || "";
      const receiptKey = receiptNumber || entry.id;
      if (seenReceipts.has(receiptKey)) return null;
      seenReceipts.add(receiptKey);
      const receiptData = getInventoryReceiptData(receiptNumber, entry);
      if (!receiptData.saleRows.length) return null;
      if (normalizeInventoryCustomerKey(receiptData.customerName || meta.customerName || "Walk-in customer") !== target) return null;
      const balanceByCurrency = new Map();
      receiptData.totalsByCurrency.forEach((amounts, currency) => addCurrencyTotal(balanceByCurrency, currency, amounts.balance || 0));
      const dates = receiptData.saleRows.map(row => row.entry.action_date).filter(Boolean);
      const oldestDate = dates.slice().sort((a, b) => dateStamp(a) - dateStamp(b))[0] || entry.action_date || "";
      const latestDate = dates.slice().sort((a, b) => dateStamp(b) - dateStamp(a))[0] || entry.action_date || "";
      const itemNames = receiptData.saleRows.map(row => {
        const qty = row.qtyDisplay ? ` ${row.qtyDisplay}` : "";
        return `${row.itemName || "Item"}${qty}`;
      }).filter(Boolean);
      return {
        receiptNumber: receiptData.receiptNumber || receiptNumber || shortId(entry.id),
        invoiceNumber: receiptData.invoiceNumber || receiptData.receiptNumber || receiptNumber || shortId(entry.id),
        entryId: receiptData.saleRows[0]?.entry?.id || entry.id,
        customerName: receiptData.customerName || meta.customerName || "Walk-in customer",
        oldestDate,
        date: latestDate,
        lineCount: receiptData.saleRows.length,
        itemSummary: itemNames.slice(0, 4).join(", ") + (itemNames.length > 4 ? ` +${itemNames.length - 4}` : ""),
        taxText: formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "tax") || "-",
        totalText: formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "total") || moneyText(receiptData.totalAmount, receiptData.currency),
        paidText: formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "paid") || moneyText(receiptData.paidTotal, receiptData.currency),
        balanceText: inventoryCurrencyTotalsText(balanceByCurrency) || moneyText(receiptData.balanceTotal, receiptData.currency),
        totalsByCurrency: receiptData.totalsByCurrency,
        balanceByCurrency,
        receiptData
      };
    })
    .filter(Boolean)
    .sort((a, b) => dateStamp(a.oldestDate || a.date) - dateStamp(b.oldestDate || b.date) || String(a.receiptNumber).localeCompare(String(b.receiptNumber)));
}

function inventoryReceiptSettlementGroups(receiptData){
  const groups = new Map();
  receiptData.settlementEntries.forEach(entry => {
    const meta = goodsMetaFromNotes(entry.notes);
    const key = meta.settlementId || entry.id;
    if (!groups.has(key)){
      const paymentReceiptNumber = inventoryPaymentReceiptNumberFromMeta(meta, entry, key);
      groups.set(key, {
        key,
        date: entry.action_date || entry.created_at || "",
        currency: entry.currency || receiptData.currency,
        receiptNumber: meta.receiptNumber || receiptData.receiptNumber,
        invoiceNumber: inventoryInvoiceNumberFromMeta(meta, entry) || receiptData.invoiceNumber,
        paymentReceiptNumber,
        entryIds: [],
        itemNames: new Set(),
        amountByCurrency: new Map(),
        notes: cleanGoodsDisplayNote(entry.notes) || "Balance settlement"
      });
    }
    const group = groups.get(key);
    group.entryIds.push(entry.id);
    if (entry.person_name) group.itemNames.add(entry.person_name);
    addCurrencyTotal(group.amountByCurrency, entry.currency || receiptData.currency, Number(entry.action_amount || 0));
    if (!group.date) group.date = entry.action_date || entry.created_at || "";
  });
  const rows = Array.from(groups.values()).sort((a, b) => dateStamp(a.date) - dateStamp(b.date) || String(a.key).localeCompare(String(b.key)));
  const paymentRows = receiptData.paymentRows.filter(row => row.type === "Balance settlement");
  rows.forEach((group, index) => {
    const paymentRow = paymentRows.find(row => row.receiptNumber === group.paymentReceiptNumber) || paymentRows[index];
    if (paymentRow){
      group.balanceText = formatReportAmount(paymentRow.balanceAfter || 0, paymentRow.currency || group.currency || receiptData.currency);
      group.balancePdfText = formatPdfAmount(paymentRow.balanceAfter || 0, paymentRow.currency || group.currency || receiptData.currency);
    }
  });
  return rows;
}

function getInventoryCustomerRecord(customerName){
  const invoices = getInventoryCustomerInvoices(customerName);
  const customer = invoices[0]?.customerName || customerName || "Walk-in customer";
  const contact = getInventoryCustomerContact(customer);
  const totalByCurrency = new Map();
  const taxByCurrency = new Map();
  const paidByCurrency = new Map();
  const balanceByCurrency = new Map();
  const statementRows = [];

  invoices.forEach(invoice => {
    invoice.totalsByCurrency.forEach((amounts, currency) => {
      addCurrencyTotal(totalByCurrency, currency, amounts.total || 0);
      addCurrencyTotal(taxByCurrency, currency, amounts.tax || 0);
      addCurrencyTotal(paidByCurrency, currency, amounts.paid || 0);
      addCurrencyTotal(balanceByCurrency, currency, amounts.balance || 0);
    });

    statementRows.push({
      date: invoice.oldestDate || invoice.date || "",
      type: "Invoice",
      receiptNumber: invoice.invoiceNumber || invoice.receiptNumber,
      sortInvoiceNumber: invoice.invoiceNumber || invoice.receiptNumber,
      details: `${invoice.lineCount} item${invoice.lineCount === 1 ? "" : "s"}${invoice.itemSummary ? ` - ${invoice.itemSummary}` : ""}`,
      taxText: invoice.taxText || "-",
      debitText: invoice.totalText,
      creditText: "-",
      balanceText: invoice.totalText,
      taxPdfText: formatInventoryTotalsByCurrency(invoice.totalsByCurrency, "tax", { forPdf: true }) || "-",
      debitPdfText: formatInventoryTotalsByCurrency(invoice.totalsByCurrency, "total", { forPdf: true }) || "-",
      creditPdfText: "-",
      balancePdfText: formatInventoryTotalsByCurrency(invoice.totalsByCurrency, "total", { forPdf: true }) || "-",
      entryId: invoice.entryId,
      action: "invoice"
    });

    const initialPaidByCurrency = new Map();
    const initialBalanceByCurrency = new Map();
    invoice.receiptData.saleRows.forEach(row => {
      addCurrencyTotal(initialPaidByCurrency, row.currency, row.initialPaid || 0);
      addCurrencyTotal(initialBalanceByCurrency, row.currency, Math.max(Number(row.total || 0) - Number(row.initialPaid || 0), 0));
    });
    const initialPaidText = inventoryCurrencyTotalsText(initialPaidByCurrency);
    if (initialPaidText){
      const initialPaymentRow = invoice.receiptData.paymentRows.find(row => row.type === "First payment");
      const firstSaleEntry = state.entries.find(entry => entry.id === invoice.entryId);
      statementRows.push({
        date: invoice.oldestDate || invoice.date || "",
        type: "First Payment",
        receiptNumber: initialPaymentRow?.receiptNumber || inventoryPaymentReceiptNumberFromMeta(goodsMetaFromNotes(firstSaleEntry?.notes), firstSaleEntry, `${invoice.invoiceNumber || invoice.receiptNumber}:initial`),
        sortInvoiceNumber: invoice.invoiceNumber || invoice.receiptNumber,
        details: "Initial payment on invoice",
        taxText: "-",
        debitText: "-",
        creditText: initialPaidText,
        balanceText: inventoryCurrencyTotalsText(initialBalanceByCurrency) || "-",
        taxPdfText: "-",
        debitPdfText: "-",
        creditPdfText: inventoryCurrencyTotalsText(initialPaidByCurrency, { forPdf: true }),
        balancePdfText: inventoryCurrencyTotalsText(initialBalanceByCurrency, { forPdf: true }) || "-",
        entryId: invoice.entryId,
        action: "receipt"
      });
    }

    inventoryReceiptSettlementGroups(invoice.receiptData).forEach(payment => {
      statementRows.push({
        date: payment.date,
        type: "Balance Payment",
        receiptNumber: payment.paymentReceiptNumber || payment.receiptNumber,
        sortInvoiceNumber: invoice.invoiceNumber || invoice.receiptNumber,
        details: payment.itemNames.size ? Array.from(payment.itemNames).join(", ") : payment.notes,
        taxText: "-",
        debitText: "-",
        creditText: inventoryCurrencyTotalsText(payment.amountByCurrency),
        balanceText: payment.balanceText || "",
        taxPdfText: "-",
        debitPdfText: "-",
        creditPdfText: inventoryCurrencyTotalsText(payment.amountByCurrency, { forPdf: true }),
        balancePdfText: payment.balancePdfText || payment.balanceText || "",
        entryId: payment.entryIds[0],
        action: "receipt"
      });
    });
  });

  const typeOrder = { "Invoice": 1, "First Payment": 2, "Balance Payment": 3 };
  statementRows.sort((a, b) =>
    dateStamp(a.date) - dateStamp(b.date) ||
    String(a.sortInvoiceNumber || a.receiptNumber).localeCompare(String(b.sortInvoiceNumber || b.receiptNumber)) ||
    (typeOrder[a.type] || 9) - (typeOrder[b.type] || 9) ||
    String(a.receiptNumber).localeCompare(String(b.receiptNumber))
  );

  return { customerName: customer, contact, invoices, statementRows, totalByCurrency, taxByCurrency, paidByCurrency, balanceByCurrency };
}

function renderInventoryCustomerEditCard(record){
  const contact = record.contact || {};
  return `
    <details class="inventory-customer-edit-card" id="inventoryCustomerEditCard">
      <summary>
        <div>
          <strong>Customer details</strong>
          <p>Edit name and optional company / TRN / mobile / email</p>
        </div>
        <span class="inventory-customer-edit-toggle">Edit</span>
      </summary>
      <form id="inventoryCustomerEditForm" class="inventory-customer-edit-form">
        <div class="inventory-customer-edit-grid">
          <label class="inventory-customer-edit-field">
            <span>Customer name</span>
            <input class="input" name="customer_name" required value="${escapeHtml(record.customerName || "")}" autocomplete="name" />
          </label>
          <label class="inventory-customer-edit-field">
            <span>Company name <em>optional</em></span>
            <input class="input" name="customer_company" value="${escapeHtml(contact.company || "")}" autocomplete="organization" placeholder="Optional" />
          </label>
          <label class="inventory-customer-edit-field">
            <span>TRN number <em>optional</em></span>
            <input class="input" name="customer_trn" value="${escapeHtml(contact.trn || "")}" placeholder="Optional" />
          </label>
          <label class="inventory-customer-edit-field">
            <span>Mobile number <em>optional</em></span>
            <input class="input" name="customer_phone" value="${escapeHtml(contact.phone || "")}" autocomplete="tel" placeholder="Optional" />
          </label>
          <label class="inventory-customer-edit-field">
            <span>Email address <em>optional</em></span>
            <input class="input" name="customer_email" type="email" value="${escapeHtml(contact.email || "")}" autocomplete="email" placeholder="Optional" />
          </label>
          <label class="inventory-customer-edit-field inventory-customer-edit-field-wide">
            <span>Address <em>optional</em></span>
            <input class="input" name="customer_address" value="${escapeHtml(contact.address || "")}" autocomplete="street-address" placeholder="Optional" />
          </label>
        </div>
        <div class="inventory-customer-edit-actions">
          <button class="btn ghost tiny" type="button" id="inventoryCustomerEditCancel">Cancel</button>
          <button class="btn primary tiny" type="submit">Save details</button>
        </div>
        <p class="inventory-customer-edit-hint">Optional fields can stay empty. Saved details update this customer across inventory invoices and receipts.</p>
      </form>
    </details>
  `;
}

function renderInventoryCustomerRecord(record){
  const contactBits = [
    record.contact.company ? `<span><strong>Company:</strong> ${escapeHtml(record.contact.company)}</span>` : "",
    record.contact.trn ? `<span><strong>TRN:</strong> ${escapeHtml(record.contact.trn)}</span>` : "",
    record.contact.phone ? `<span><strong>Mobile:</strong> ${escapeHtml(record.contact.phone)}</span>` : "",
    record.contact.email ? `<span><strong>Email:</strong> ${escapeHtml(record.contact.email)}</span>` : "",
    record.contact.address ? `<span><strong>Address:</strong> ${escapeHtml(record.contact.address)}</span>` : ""
  ].filter(Boolean).join("");
  if (!record.invoices.length){
    return `
      ${renderInventoryCustomerEditCard(record)}
      <div class="inventory-customer-contact">
        <span><strong>Bill To:</strong> ${escapeHtml(record.customerName)}</span>
        ${contactBits}
      </div>
      <div class="empty">No inventory invoices found for this customer.</div>
    `;
  }
  return `
    ${renderInventoryCustomerEditCard(record)}
    <div class="inventory-customer-summary">
      <div><small>Total Invoiced</small><strong>${escapeHtml(inventoryCurrencyTotalsText(record.totalByCurrency) || "0")}</strong></div>
      <div><small>Total VAT</small><strong>${escapeHtml(inventoryCurrencyTotalsText(record.taxByCurrency) || "0")}</strong></div>
      <div><small>Total Paid</small><strong>${escapeHtml(inventoryCurrencyTotalsText(record.paidByCurrency) || "0")}</strong></div>
      <div><small>Outstanding</small><strong>${escapeHtml(inventoryCurrencyTotalsText(record.balanceByCurrency) || "0")}</strong></div>
    </div>
    <div class="inventory-customer-contact">
      <span><strong>Bill To:</strong> ${escapeHtml(record.customerName)}</span>
      ${contactBits}
    </div>
    <div class="inventory-customer-section">
      <h4>Invoices</h4>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Invoice</th><th>Items</th><th>VAT</th><th>Total</th><th>Paid</th><th>Balance</th><th>Action</th></tr></thead>
          <tbody>
            ${record.invoices.map(invoice => `
              <tr>
                <td>${escapeHtml(displayDate(invoice.oldestDate || invoice.date || "-"))}</td>
                <td>${escapeHtml(invoice.invoiceNumber || invoice.receiptNumber)}</td>
                <td>${escapeHtml(invoice.itemSummary || `${invoice.lineCount} item${invoice.lineCount === 1 ? "" : "s"}`)}</td>
                <td>${escapeHtml(invoice.taxText || "-")}</td>
                <td>${escapeHtml(invoice.totalText)}</td>
                <td>${escapeHtml(invoice.paidText)}</td>
                <td>${escapeHtml(invoice.balanceText || "-")}</td>
                <td>
                  <div class="inventory-history-actions">
                    <button class="tiny inventoryCustomerInvoicePdfBtn" type="button" data-entry-id="${escapeHtml(invoice.entryId)}" title="Download invoice PDF"><i class="fa-solid fa-download"></i></button>
                    ${teamCanShowEdit("invoices") ? `<button class="tiny ghost inventoryCustomerInvoiceEditBtn" type="button" data-entry-id="${escapeHtml(invoice.entryId)}" title="Edit invoice">✎</button>` : ""}
                    ${teamCanShowDelete("invoices") ? `<button class="tiny danger inventoryCustomerInvoiceDeleteBtn" type="button" data-entry-id="${escapeHtml(invoice.entryId)}" title="Delete invoice (restores stock)">✕</button>` : ""}
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="inventory-customer-section">
      <h4>Payment Statement</h4>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Invoice / Receipt</th><th>Details</th><th>VAT</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Download</th></tr></thead>
          <tbody>
            ${record.statementRows.map(row => `
              <tr>
                <td>${escapeHtml(displayDate(row.date || "-"))}</td>
                <td>${escapeHtml(row.type)}</td>
                <td>${escapeHtml(row.receiptNumber)}</td>
                <td class="inventory-stmt-details" title="${escapeHtml(row.details || "")}">${escapeHtml(row.details || "-")}</td>
                <td>${escapeHtml(row.taxText || "-")}</td>
                <td>${escapeHtml(row.debitText || "-")}</td>
                <td>${escapeHtml(row.creditText || "-")}</td>
                <td>${escapeHtml(row.balanceText || "-")}</td>
                <td>
                  <div class="inventory-history-actions">
                    ${row.action === "invoice"
                      ? `<button class="tiny inventoryCustomerInvoicePdfBtn" type="button" data-entry-id="${escapeHtml(row.entryId)}" title="Invoice PDF"><i class="fa-solid fa-file-invoice"></i></button>
                         ${teamCanShowEdit("invoices") ? `<button class="tiny ghost inventoryCustomerInvoiceEditBtn" type="button" data-entry-id="${escapeHtml(row.entryId)}" title="Edit">✎</button>` : ""}
                         ${teamCanShowDelete("invoices") ? `<button class="tiny danger inventoryCustomerInvoiceDeleteBtn" type="button" data-entry-id="${escapeHtml(row.entryId)}" title="Delete (restores stock)">✕</button>` : ""}`
                      : `<button class="tiny ghost inventoryCustomerReceiptPdfBtn" type="button" data-entry-id="${escapeHtml(row.entryId)}" title="Payment receipt"><i class="fa-solid fa-receipt"></i></button>`}
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function bindInventoryCustomerRecordActions(record){
  if (!els.inventoryCustomerBody) return;
  els.inventoryCustomerBody.querySelectorAll(".inventoryCustomerInvoicePdfBtn").forEach(btn => {
    btn.addEventListener("click", () => downloadInventoryReceiptPDF(btn.dataset.entryId));
  });
  els.inventoryCustomerBody.querySelectorAll(".inventoryCustomerReceiptPdfBtn").forEach(btn => {
    btn.addEventListener("click", () => downloadInventoryPaymentReceiptPDF(btn.dataset.entryId));
  });
  els.inventoryCustomerBody.querySelectorAll(".inventoryCustomerInvoiceEditBtn").forEach(btn => {
    btn.addEventListener("click", () => openInventoryReceiptEditor(btn.dataset.entryId));
  });
  els.inventoryCustomerBody.querySelectorAll(".inventoryCustomerInvoiceDeleteBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const deleted = await deleteInventoryReceipt(btn.dataset.entryId);
      if (deleted) {
        const name = state.inventoryDraft.customerRecordName || record.customerName;
        openInventoryCustomerModal(name);
      }
    });
  });
  const editCard = els.inventoryCustomerBody.querySelector("#inventoryCustomerEditCard");
  const editForm = els.inventoryCustomerBody.querySelector("#inventoryCustomerEditForm");
  const cancelBtn = els.inventoryCustomerBody.querySelector("#inventoryCustomerEditCancel");
  cancelBtn?.addEventListener("click", () => {
    if (editCard) editCard.open = false;
    if (editForm) {
      editForm.customer_name.value = record.customerName || "";
      editForm.customer_company.value = record.contact.company || "";
      editForm.customer_trn.value = record.contact.trn || "";
      editForm.customer_phone.value = record.contact.phone || "";
      editForm.customer_email.value = record.contact.email || "";
      editForm.customer_address.value = record.contact.address || "";
    }
  });
  editForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const details = {
        name: String(editForm.customer_name.value || "").trim(),
        company: String(editForm.customer_company.value || "").trim(),
        trn: String(editForm.customer_trn.value || "").trim(),
        phone: String(editForm.customer_phone.value || "").trim(),
        email: String(editForm.customer_email.value || "").trim(),
        address: String(editForm.customer_address.value || "").trim()
      };
      const savedName = saveInventoryCustomerDetails(state.inventoryDraft.customerRecordName || record.customerName, details);
      openInventoryCustomerModal(savedName);
    } catch (err) {
      alert(err.message || "Could not save customer details.");
    }
  });
}

function openInventoryCustomerModal(customerName){
  const record = getInventoryCustomerRecord(customerName);
  state.inventoryDraft.customerRecordName = record.customerName || customerName || "";
  if (els.inventoryCustomerTitle) els.inventoryCustomerTitle.textContent = record.customerName || "Customer record";
  if (els.inventoryCustomerDesc) {
    els.inventoryCustomerDesc.textContent = `${record.invoices.length} invoice${record.invoices.length === 1 ? "" : "s"} sorted by date with receipts and payment statement.`;
  }
  if (els.inventoryCustomerBody) {
    els.inventoryCustomerBody.innerHTML = renderInventoryCustomerRecord(record);
    bindInventoryCustomerRecordActions(record);
  }
  if (els.inventoryCustomerModal) {
    els.inventoryCustomerModal.classList.remove("hide");
    els.inventoryCustomerModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
}

async function downloadInventoryPaymentReceiptPDF(entryId){
  const sourceEntry = state.entries.find(entry => entry.id === entryId && entry.entry_kind !== "principal" && hasGoodsTag(entry.notes));
  if (!sourceEntry){
    alert("Payment receipt entry not found.");
    return;
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again.");
    return;
  }
  const sourceMeta = goodsMetaFromNotes(sourceEntry.notes);
  const receiptNumber = sourceMeta.receiptNumber || sourceMeta.invoiceNumber || sourceMeta.saleSetId || shortId(sourceEntry.id) || "N/A";
  const receiptData = getInventoryReceiptData(receiptNumber, sourceEntry);
  const invoiceNumber = receiptData.invoiceNumber || inventoryInvoiceNumberFromMeta(sourceMeta, sourceEntry);
  const paymentReceiptNumber = inventoryPaymentReceiptNumberFromMeta(sourceMeta, sourceEntry, sourceMeta.settlementId || `${invoiceNumber}:initial`);
  const rows = [];
  const paidByCurrency = new Map();
  let receiptDate = sourceEntry.action_date || sourceEntry.created_at || "";
  let receiptLabel = isInventorySettlementAction(sourceEntry) ? "Balance Payment Receipt" : "Initial Payment Receipt";

  if (isInventorySettlementAction(sourceEntry)){
    const settlementId = sourceMeta.settlementId || "";
    const settlementRows = receiptData.settlementEntries.filter(entry => {
      const meta = goodsMetaFromNotes(entry.notes);
      return settlementId ? meta.settlementId === settlementId : entry.id === sourceEntry.id;
    });
    settlementRows.forEach(entry => {
      const meta = goodsMetaFromNotes(entry.notes);
      const amount = Number(entry.action_amount || 0);
      addCurrencyTotal(paidByCurrency, entry.currency || receiptData.currency, amount);
      rows.push([
        displayDate(entry.action_date || receiptDate || "-"),
        inventoryInvoiceNumberFromMeta(meta, entry) || invoiceNumber,
        entry.person_name || meta.itemCode || "Inventory item",
        formatPdfAmount(amount, entry.currency || receiptData.currency),
        formatPdfAmount(meta.balanceAmount || 0, entry.currency || receiptData.currency)
      ]);
    });
  } else {
    receiptData.saleRows.filter(row => row.initialPaid > 0.00000001).forEach(row => {
      addCurrencyTotal(paidByCurrency, row.currency || receiptData.currency, row.initialPaid || 0);
      rows.push([
        displayDate(row.entry.action_date || receiptDate || "-"),
        invoiceNumber,
        row.itemName || row.itemCode || "Inventory item",
        formatPdfAmount(row.initialPaid || 0, row.currency || receiptData.currency),
        formatPdfAmount(Math.max(row.total - row.initialPaid, 0), row.currency || receiptData.currency)
      ]);
    });
  }

  if (!rows.length){
    alert("No payment amount found for this receipt.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = receiptLabel;
  const subtitle = `Receipt ${paymentReceiptNumber}`;
  const customerName = receiptData.customerName || sourceMeta.customerName || "Walk-in customer";
  drawPdfHeader(doc, logoData, title, subtitle);
  const partiesBottom = drawInventoryPdfPartiesAndMeta(doc, {
    customerName,
    customerCompany: receiptData.customerCompany || sourceMeta.customerCompany || "",
    customerTrn: receiptData.customerTrn || sourceMeta.customerTrn || "",
    customerPhone: receiptData.customerPhone || sourceMeta.customerPhone || "",
    customerEmail: receiptData.customerEmail || sourceMeta.customerEmail || "",
    customerAddress: receiptData.customerAddress || sourceMeta.customerAddress || "",
    meta: [
      { label: "Receipt", value: paymentReceiptNumber },
      { label: "Date", value: displayDate(receiptDate || "—") },
      { label: "Invoice", value: invoiceNumber },
      { label: "Paid", value: inventoryCurrencyTotalsText(paidByCurrency, { forPdf: true }) || "—" }
    ]
  });

  doc.autoTable({
    startY: partiesBottom + 5,
    head: [["Date", "Invoice", "Item / Notes", "Paid", "Balance"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7.6 },
    styles: { font: "helvetica", fontSize: 7.8, cellPadding: 1.8, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 28 },
      2: { cellWidth: 66 },
      3: { cellWidth: 31, halign: "right" },
      4: { cellWidth: 31, halign: "right" }
    },
    margin: { top: 42, bottom: 32 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  const tableEndY = doc.lastAutoTable.finalY;
  drawInventoryPdfTotals(doc, tableEndY + 5, [
    { label: "Amount paid", value: inventoryCurrencyTotalsText(paidByCurrency, { forPdf: true }) || "—", strong: true },
    {
      label: "Invoice VAT",
      value: formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "tax", { forPdf: true }) || "—"
    }
  ]);

  const noteText = cleanGoodsDisplayNote(sourceEntry.notes) || "";
  if (noteText){
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfClampLines(doc, `Note: ${noteText}`, 108, 2), 14, tableEndY + 9);
  }
  doc.save(`Payment_Receipt_${String(paymentReceiptNumber).replace(/\s+/g, "_")}.pdf`);
}

async function downloadInventoryCustomerStatementPDF(customerName){
  const record = getInventoryCustomerRecord(customerName);
  if (!record.invoices.length){
    alert("No inventory records found for this customer.");
    return;
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = "Inventory Customer Statement";
  const subtitle = `Customer: ${record.customerName}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  const partiesBottom = drawInventoryPdfPartiesAndMeta(doc, {
    customerName: record.customerName,
    customerCompany: record.contact?.company || "",
    customerTrn: record.contact?.trn || "",
    customerPhone: record.contact?.phone || "",
    customerEmail: record.contact?.email || "",
    customerAddress: record.contact?.address || "",
    meta: [
      { label: "Invoices", value: String(record.invoices.length) },
      { label: "Total", value: inventoryCurrencyTotalsText(record.totalByCurrency, { forPdf: true }) || "0" },
      { label: "Paid", value: inventoryCurrencyTotalsText(record.paidByCurrency, { forPdf: true }) || "0" },
      { label: "Balance", value: inventoryCurrencyTotalsText(record.balanceByCurrency, { forPdf: true }) || "0" }
    ]
  });

  doc.autoTable({
    startY: partiesBottom + 5,
    head: [["Date", "Type", "Ref", "Details", "VAT", "Debit", "Credit", "Balance"]],
    body: record.statementRows.map(row => [
      displayDate(row.date || "-"),
      row.action === "receipt" ? "Receipt" : row.type,
      row.receiptNumber,
      row.details || "-",
      row.taxPdfText || row.taxText || "-",
      row.debitPdfText || row.debitText || "-",
      row.creditPdfText || row.creditText || "-",
      row.balancePdfText || row.balanceText || "-"
    ]),
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7.2 },
    styles: { font: "helvetica", fontSize: 7.2, cellPadding: 1.5, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 22 },
      2: { cellWidth: 25 },
      3: { cellWidth: 33 },
      4: { cellWidth: 20, halign: "right" },
      5: { cellWidth: 20, halign: "right" },
      6: { cellWidth: 20, halign: "right" },
      7: { cellWidth: 20, halign: "right" }
    },
    margin: { top: 42, bottom: 32 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });
  doc.save(`Inventory_Customer_Statement_${String(record.customerName || "customer").replace(/\s+/g, "_")}.pdf`);
}

function inventoryTaxDefaultsForGroup(group) {
  const setting = getTaxSettingForCurrency(group?.currency || state.lastCurrency || "AED");
  const rate = group?.defaultTaxRate != null ? group.defaultTaxRate : setting.rate;
  const mode = group?.defaultTaxMode || setting.mode;
  return { rate: normalizeTaxRate(rate), mode: normalizeTaxMode(mode) };
}

function inventoryPurchaseCurrencyOptionsHtml(selected = ""){
  const preferred = String(selected || state.lastCurrency || "AED").trim() || "AED";
  const currencies = getPageScopedCurrencies();
  const list = currencies.length ? currencies : SUPPORTED_CURRENCIES;
  return list.map(currency =>
    `<option value="${escapeHtml(currency)}" ${currency === preferred ? "selected" : ""}>${escapeHtml(currency)}</option>`
  ).join("");
}

function getInventoryBrandCatalog(){
  return Array.isArray(state.inventoryBrands) ? state.inventoryBrands : [];
}

function findInventoryBrandById(brandId){
  const id = String(brandId || "").trim();
  if (!id) return null;
  return getInventoryBrandCatalog().find(b => String(b.id) === id) || null;
}

function inventoryBrandOptionsHtml(selectedBrandId = "", selectedBrandName = ""){
  const brands = getInventoryBrandCatalog();
  const selectedId = String(selectedBrandId || "").trim();
  const selectedName = String(selectedBrandName || "").trim();
  const known = brands.some(b => String(b.id) === selectedId);
  const useCustom = !known && !!selectedName;
  return [
    `<option value="">No brand</option>`,
    ...brands.map(b => `<option value="${escapeHtml(b.id)}" ${String(b.id) === selectedId ? "selected" : ""}>${escapeHtml(b.name)}</option>`),
    `<option value="${INVENTORY_CUSTOM_BRAND_VALUE}" ${useCustom ? "selected" : ""}>+ New brand…</option>`
  ].join("");
}

function inventoryVariantOptionsHtml(brandId = "", selectedVariantId = "", selectedVariantLabel = ""){
  const brand = findInventoryBrandById(brandId);
  const variants = Array.isArray(brand?.variants) ? brand.variants : [];
  const selectedId = String(selectedVariantId || "").trim();
  const selectedLabel = String(selectedVariantLabel || "").trim();
  const known = variants.some(v => String(v.id) === selectedId);
  const useCustom = !known && !!selectedLabel;
  if (!brandId || brandId === INVENTORY_CUSTOM_BRAND_VALUE) {
    return [
      `<option value="">No variant</option>`,
      `<option value="${INVENTORY_CUSTOM_VARIANT_VALUE}" ${useCustom ? "selected" : ""}>+ Custom variant…</option>`
    ].join("");
  }
  return [
    `<option value="">No variant</option>`,
    ...variants.map(v => `<option value="${escapeHtml(v.id)}" ${String(v.id) === selectedId ? "selected" : ""}>${escapeHtml(v.label)}</option>`),
    `<option value="${INVENTORY_CUSTOM_VARIANT_VALUE}" ${useCustom ? "selected" : ""}>+ Custom variant…</option>`
  ].join("");
}

function readGoodsPurchaseLineBrand(line){
  if (!line) return { brand: "", brandId: "", variantLabel: "", variantId: "" };
  const brandSelect = line.querySelector(".goods-buy-brand");
  const brandCustom = line.querySelector(".goods-buy-brand-custom");
  const variantSelect = line.querySelector(".goods-buy-variant");
  const variantCustom = line.querySelector(".goods-buy-variant-custom");
  const brandValue = String(brandSelect?.value || "").trim();
  let brand = "";
  let brandId = "";
  if (brandValue === INVENTORY_CUSTOM_BRAND_VALUE) {
    brand = String(brandCustom?.value || "").trim();
  } else if (brandValue) {
    brandId = brandValue;
    brand = findInventoryBrandById(brandId)?.name || String(brandCustom?.value || "").trim();
  }
  const variantValue = String(variantSelect?.value || "").trim();
  let variantLabel = "";
  let variantId = "";
  if (variantValue === INVENTORY_CUSTOM_VARIANT_VALUE) {
    variantLabel = String(variantCustom?.value || "").trim();
  } else if (variantValue) {
    variantId = variantValue;
    const brandObj = findInventoryBrandById(brandId);
    variantLabel = (brandObj?.variants || []).find(v => String(v.id) === variantId)?.label
      || String(variantCustom?.value || "").trim();
  }
  return { brand, brandId, variantLabel, variantId };
}

function applyInventoryVariantToPurchaseLine(line, variant){
  if (!line || !variant) return;
  const categorySelect = line.querySelector(".goods-buy-category");
  const qtyInput = line.querySelector(".goods-buy-qty");
  const unitSelect = line.querySelector(".goods-buy-unit");
  const nameInput = line.querySelector(".goods-buy-name");
  const brandInfo = readGoodsPurchaseLineBrand(line);
  const category = normalizeInventoryCategory(variant.item_category || variant.itemCategory || INVENTORY_CATEGORY_COUNT);
  if (categorySelect) categorySelect.value = category;
  syncGoodsPurchaseLineCategoryFields(line, { rebuildUnits: true });
  const unit = normalizeInventoryUnit(variant.quantity_unit || variant.quantityUnit, category);
  const qtyValue = Number(variant.quantity_value ?? variant.quantityValue ?? 1);
  if (unitSelect) {
    unitSelect.disabled = !inventoryIsDecimalCategory(category);
    unitSelect.innerHTML = inventoryUnitSelectOptionsHtml(category, unit);
    unitSelect.value = unit;
  }
  if (qtyInput && Number.isFinite(qtyValue) && qtyValue > 0) {
    // Show ml when stored as L base < 1, or the variant's display unit.
    if (category === INVENTORY_CATEGORY_VOLUME && unit === INVENTORY_UNIT_ML) {
      qtyInput.value = trimInventoryNumber(qtyValue, 3);
    } else if (category === INVENTORY_CATEGORY_VOLUME && unit === INVENTORY_UNIT_L && qtyValue < 1) {
      qtyInput.value = trimInventoryNumber(qtyValue * 1000, 3);
      if (unitSelect) unitSelect.value = INVENTORY_UNIT_ML;
    } else {
      qtyInput.value = trimInventoryNumber(qtyValue, inventoryIsDecimalCategory(category) ? 3 : 0);
    }
  }
  if (nameInput && brandInfo.brand && variant.label) {
    const current = String(nameInput.value || "").trim();
    if (!current || /·/.test(current)) {
      nameInput.value = `${brandInfo.brand} · ${variant.label}`;
    }
  }
}

function syncGoodsPurchaseLineBrandFields(line){
  if (!line) return;
  const brandSelect = line.querySelector(".goods-buy-brand");
  const brandCustom = line.querySelector(".goods-buy-brand-custom");
  const variantSelect = line.querySelector(".goods-buy-variant");
  const variantCustom = line.querySelector(".goods-buy-variant-custom");
  if (!brandSelect || !variantSelect) return;
  const brandValue = String(brandSelect.value || "").trim();
  const isCustomBrand = brandValue === INVENTORY_CUSTOM_BRAND_VALUE;
  brandCustom?.classList.toggle("hide", !isCustomBrand);
  if (brandCustom) brandCustom.required = isCustomBrand;
  const prevVariant = String(variantSelect.value || "");
  const prevLabel = String(variantCustom?.value || "");
  variantSelect.innerHTML = inventoryVariantOptionsHtml(
    isCustomBrand ? "" : brandValue,
    prevVariant === INVENTORY_CUSTOM_VARIANT_VALUE ? "" : prevVariant,
    prevVariant === INVENTORY_CUSTOM_VARIANT_VALUE ? prevLabel : ""
  );
  if (prevVariant === INVENTORY_CUSTOM_VARIANT_VALUE) variantSelect.value = INVENTORY_CUSTOM_VARIANT_VALUE;
  const isCustomVariant = String(variantSelect.value || "") === INVENTORY_CUSTOM_VARIANT_VALUE;
  variantCustom?.classList.toggle("hide", !isCustomVariant);
  if (variantCustom) variantCustom.required = isCustomVariant;
}

async function ensureInventoryBrandsLoaded(force = false){
  if (isGuestMode() || !state.sessionUser) {
    state.inventoryBrands = [];
    state.inventoryBrandsLoaded = true;
    return [];
  }
  if (!force && state.inventoryBrandsLoaded) return state.inventoryBrands;
  if (state.inventoryBrandsLoading) return state.inventoryBrands;
  state.inventoryBrandsLoading = true;
  try {
    const res = unwrapRpcJson(await supabaseRpc("app_list_my_goods_brands", {}));
    state.inventoryBrands = Array.isArray(res?.items) ? res.items : [];
    state.inventoryBrandsLoaded = true;
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (/app_list_my_goods_brands|Could not find the function|PGRST202|404/i.test(msg)) {
      state.inventoryBrands = [];
      state.inventoryBrandsLoaded = true;
      console.warn("Inventory brands RPC unavailable.", err);
    } else {
      console.warn("Failed to load inventory brands:", err);
    }
  } finally {
    state.inventoryBrandsLoading = false;
  }
  refreshInventoryBrandFilterOptions();
  return state.inventoryBrands;
}

function refreshInventoryBrandFilterOptions(){
  const select = document.getElementById("inventoryBrandFilter");
  if (!select) return;
  const current = String(state.inventoryBrandFilter || "all");
  const fromCatalog = getInventoryBrandCatalog().map(b => String(b.name || "").trim()).filter(Boolean);
  const fromItems = getGoodsGroups({ applyUiFilters: false })
    .map(g => String(g.brand || "").trim())
    .filter(Boolean);
  const brands = [...new Set([...fromCatalog, ...fromItems])].sort((a, b) => a.localeCompare(b));
  select.innerHTML = [
    `<option value="all">All brands</option>`,
    ...brands.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
  ].join("");
  const stillValid = current === "all" || brands.some(name => name.toLowerCase() === current.toLowerCase());
  state.inventoryBrandFilter = stillValid ? current : "all";
  select.value = state.inventoryBrandFilter;
}

function getInventoryBrandNamesFromState(){
  return getInventoryBrandCatalog().map(b => b.name).filter(Boolean);
}

async function openInventoryBrandsModal(){
  await ensureInventoryBrandsLoaded(true);
  let modal = document.getElementById("inventoryBrandsModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "inventoryBrandsModal";
    modal.className = "modal hide";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="modal-backdrop" data-close-modal="inventoryBrandsModal"></div>
      <div class="modal-dialog compact-entry-dialog">
        <div class="modal-head">
          <div>
            <h3>Brands &amp; variants</h3>
            <p class="help">Create brands (e.g. brand name) and variants (3 ml, 5 ml, custom).</p>
          </div>
          <button class="icon-btn ghost" type="button" data-close-modal="inventoryBrandsModal" aria-label="Close">×</button>
        </div>
        <div class="modal-body inventory-brands-modal-body">
          <form id="inventoryBrandCreateForm" class="inventory-brand-create-form">
            <div class="inventory-brand-create-grid">
              <input class="input" name="brand_name" required placeholder="Brand name" autocomplete="off" />
              <select class="select" name="item_type" aria-label="Default type">${inventoryItemTypeOptionsHtml("General", false)}</select>
              <button class="btn primary" type="submit">Add brand</button>
            </div>
          </form>
          <div id="inventoryBrandsList" class="inventory-brands-list"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-close-modal]").forEach(el => {
      el.addEventListener("click", e => {
        e.preventDefault();
        closeModal(el.dataset.closeModal || "inventoryBrandsModal");
      });
    });
    modal.addEventListener("click", e => {
      if (e.target && e.target.matches(".modal-backdrop")) closeModal("inventoryBrandsModal");
    });
    modal.querySelector("#inventoryBrandCreateForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      const form = e.currentTarget;
      const name = String(new FormData(form).get("brand_name") || "").trim();
      const itemType = String(new FormData(form).get("item_type") || "General").trim();
      if (!name) return;
      try {
        await supabaseRpc("app_upsert_goods_brand", {
          p_id: null,
          p_name: name,
          p_item_type: itemType || "General",
          p_notes: null
        });
        form.reset();
        await ensureInventoryBrandsLoaded(true);
        renderInventoryBrandsList();
      } catch (err) {
        alert(err?.message || "Could not save brand.");
      }
    });
    modal.querySelector("#inventoryBrandsList")?.addEventListener("click", async e => {
      const addVar = e.target.closest("[data-add-variant]");
      const delBrand = e.target.closest("[data-delete-brand]");
      const delVar = e.target.closest("[data-delete-variant]");
      try {
        if (addVar) {
          const brandId = addVar.dataset.addVariant;
          const label = prompt("Variant label (e.g. 3 ml bottle):");
          if (!label) return;
          const qtyRaw = prompt("Quantity value (e.g. 3 for 3 ml):", "3");
          if (qtyRaw == null) return;
          const unit = prompt("Unit (ml, L, pcs, kg, g, m, cm):", "ml") || "ml";
          let category = INVENTORY_CATEGORY_COUNT;
          const u = unit.toLowerCase();
          if (u === "ml" || u === "l") category = INVENTORY_CATEGORY_VOLUME;
          else if (u === "kg" || u === "g") category = INVENTORY_CATEGORY_WEIGHT;
          else if (u === "m" || u === "cm") category = INVENTORY_CATEGORY_LENGTH;
          let qty = Number(qtyRaw);
          if (category === INVENTORY_CATEGORY_VOLUME && u === "ml") {
            // Store display qty in variant as entered; unit ml
          }
          await supabaseRpc("app_upsert_goods_brand_variant", {
            p_id: null,
            p_brand_id: brandId,
            p_label: label.trim(),
            p_item_category: category,
            p_quantity_value: qty,
            p_quantity_unit: normalizeInventoryUnit(unit, category),
            p_sort_order: 0
          });
          await ensureInventoryBrandsLoaded(true);
          renderInventoryBrandsList();
          return;
        }
        if (delBrand) {
          if (!confirm("Delete this brand and its variants?")) return;
          await supabaseRpc("app_delete_goods_brand", { p_id: delBrand.dataset.deleteBrand });
          await ensureInventoryBrandsLoaded(true);
          renderInventoryBrandsList();
          return;
        }
        if (delVar) {
          if (!confirm("Delete this variant?")) return;
          await supabaseRpc("app_delete_goods_brand_variant", { p_id: delVar.dataset.deleteVariant });
          await ensureInventoryBrandsLoaded(true);
          renderInventoryBrandsList();
        }
      } catch (err) {
        alert(err?.message || "Brand action failed.");
      }
    });
  }
  renderInventoryBrandsList();
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function renderInventoryBrandsList(){
  const host = document.getElementById("inventoryBrandsList");
  if (!host) return;
  const brands = getInventoryBrandCatalog();
  if (!brands.length) {
    host.innerHTML = `<div class="empty">No brands yet. Add one above.</div>`;
    return;
  }
  host.innerHTML = brands.map(brand => {
    const variants = Array.isArray(brand.variants) ? brand.variants : [];
    return `
      <article class="inventory-brand-card">
        <div class="inventory-brand-card-head">
          <div>
            <strong>${escapeHtml(brand.name)}</strong>
            <span class="help">${escapeHtml(brand.item_type || "General")}</span>
          </div>
          <div class="inventory-brand-card-actions">
            <button type="button" class="tiny ghost" data-add-variant="${escapeHtml(brand.id)}">+ Variant</button>
            <button type="button" class="tiny danger" data-delete-brand="${escapeHtml(brand.id)}">Delete</button>
          </div>
        </div>
        <ul class="inventory-brand-variants">
          ${variants.length
            ? variants.map(v => `
              <li>
                <span>${escapeHtml(v.label)} · ${escapeHtml(String(v.quantity_value))} ${escapeHtml(v.quantity_unit)} · ${escapeHtml(v.item_category)}</span>
                <button type="button" class="tiny danger" data-delete-variant="${escapeHtml(v.id)}">✕</button>
              </li>`).join("")
            : `<li class="help">No variants yet</li>`}
        </ul>
      </article>`;
  }).join("");
}

function readGoodsPurchaseLineItemType(line){
  if (!line) return "General";
  const select = line.querySelector(".goods-buy-type");
  const customInput = line.querySelector(".goods-buy-type-custom");
  const selected = String(select?.value || "").trim();
  if (selected === INVENTORY_CUSTOM_TYPE_VALUE){
    return normalizeInventoryItemType(customInput?.value);
  }
  return normalizeInventoryItemType(selected);
}

function syncGoodsPurchaseLineTypeFields(line, preferredType = ""){
  if (!line) return;
  const typeSelect = line.querySelector(".goods-buy-type");
  const customInput = line.querySelector(".goods-buy-type-custom");
  if (!typeSelect) return;
  const current = preferredType || (typeSelect.value === INVENTORY_CUSTOM_TYPE_VALUE
    ? (customInput?.value || "General")
    : (typeSelect.value || "General"));
  const normalized = normalizeInventoryItemType(current);
  const knownTypes = getInventoryItemTypes();
  const known = knownTypes.some(type => type.toLowerCase() === normalized.toLowerCase());
  typeSelect.innerHTML = inventoryItemTypeOptionsHtml(known ? normalized : "General");
  if (known){
    typeSelect.value = knownTypes.find(type => type.toLowerCase() === normalized.toLowerCase()) || normalized;
    customInput?.classList.add("hide");
    if (customInput) {
      customInput.value = "";
      customInput.required = false;
    }
  } else {
    typeSelect.value = INVENTORY_CUSTOM_TYPE_VALUE;
    customInput?.classList.remove("hide");
    if (customInput) {
      customInput.value = normalized;
      customInput.required = true;
    }
  }
}

function syncGoodsPurchaseTaxDefaults(force = false) {
  if (!els.goodsPurchaseLines) return;
  els.goodsPurchaseLines.querySelectorAll(".inventory-purchase-line").forEach(line => {
    if (force) line.dataset.taxManual = "false";
    updateGoodsPurchaseLine(line);
  });
  updateGoodsBoughtTotal();
}

function getGoodsPurchaseTotalsByCurrency(){
  const totalsByCurrency = new Map();
  if (!els.goodsPurchaseLines) return totalsByCurrency;
  els.goodsPurchaseLines.querySelectorAll(".inventory-purchase-line").forEach(line => {
    const currency = String(line.querySelector(".goods-buy-currency")?.value || "").trim();
    const amount = Number(line.querySelector(".goods-buy-line-total")?.dataset.rawTotal || 0);
    if (!currency || !amount) return;
    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + amount);
  });
  return totalsByCurrency;
}

function updateGoodsBoughtTotal(){
  if (!els.goodsBoughtTotalAmount) return;
  const totalsByCurrency = getGoodsPurchaseTotalsByCurrency();
  els.goodsBoughtTotalAmount.value = totalsByCurrency.size
    ? formatInventoryTotalsByCurrency(totalsByCurrency)
    : "";
  const onlyCurrency = totalsByCurrency.size === 1 ? Array.from(totalsByCurrency.keys())[0] : "";
  applyCurrencyFontClass(els.goodsBoughtTotalAmount, onlyCurrency);
  updateGoodsPurchaseWalletSelector(totalsByCurrency);
}

function syncGoodsPurchaseLineCategoryFields(line, { rebuildUnits = false } = {}){
  if (!line) return;
  const categorySelect = line.querySelector(".goods-buy-category");
  const unitSelect = line.querySelector(".goods-buy-unit");
  const qtyInput = line.querySelector(".goods-buy-qty");
  const priceInput = line.querySelector(".goods-buy-price");
  const sellingInput = line.querySelector(".goods-buy-selling");
  const category = normalizeInventoryCategory(categorySelect?.value);
  const isMeasured = inventoryIsDecimalCategory(category);
  const prevCategory = String(line.dataset.categoryKey || "");
  const categoryChanged = prevCategory !== category;
  line.dataset.categoryKey = category;
  const selectedUnit = unitSelect
    ? normalizeInventoryUnit(unitSelect.value, category)
    : inventoryBaseUnitForCategory(category);

  if (unitSelect){
    unitSelect.disabled = !isMeasured;
    if (rebuildUnits || categoryChanged || !prevCategory) {
      unitSelect.innerHTML = inventoryUnitSelectOptionsHtml(category, selectedUnit);
      unitSelect.value = selectedUnit;
      // Re-assert after browser parses options (fixes blank/unselected display)
      if (unitSelect.value !== selectedUnit) {
        const match = Array.from(unitSelect.options).find(opt => opt.value === selectedUnit);
        if (match) match.selected = true;
        unitSelect.value = selectedUnit;
      }
    }
  }
  if (qtyInput){
    qtyInput.min = isMeasured ? "0.001" : "1";
    qtyInput.step = isMeasured ? "0.001" : "1";
    qtyInput.placeholder = inventoryQtyFieldLabel(category);
  }
  if (priceInput) priceInput.placeholder = inventoryPurchasePriceLabel(category);
  if (sellingInput) sellingInput.placeholder = inventorySellingPriceLabel(category);
}

function buildGoodsPurchaseLine(prefill = {}){
  const currency = String(prefill.currency || state.lastCurrency || "AED").trim() || "AED";
  const category = normalizeInventoryCategory(prefill.itemCategory || INVENTORY_CATEGORY_COUNT);
  const isMeasured = inventoryIsDecimalCategory(category);
  const taxDefault = inventoryTaxDefaultsForGroup({
    currency,
    defaultTaxRate: prefill.defaultTaxRate,
    defaultTaxMode: prefill.defaultTaxMode
  });
  const vatRateLabel = taxDefault.rate > 0 ? `${trimInventoryNumber(taxDefault.rate, 2)}%` : "";
  const restockGroupId = String(prefill.restockGroupId || "").trim();
  const locked = !!prefill.locked || !!restockGroupId;
  return `
    <div class="inventory-sale-line inventory-purchase-line" data-tax-manual="false" data-locked="${locked ? "true" : "false"}" data-restock-group-id="${escapeHtml(restockGroupId)}">
      ${restockGroupId ? `<div class="inventory-purchase-restock-tag"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Restock this item</div>` : ""}
      <div class="inventory-sale-line-top">
        <input class="input goods-buy-name" type="text" placeholder="Item name" aria-label="Item name" value="${escapeHtml(prefill.itemName || "")}" ${locked ? "readonly" : "required"} />
        <button class="icon-btn ghost goods-sale-remove goods-buy-remove" type="button" aria-label="Remove item" title="Remove" ${locked ? "disabled" : ""}>
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="inventory-purchase-line-attrs">
        <select class="select goods-buy-type" aria-label="Item type" ${locked ? "disabled" : ""}>${inventoryItemTypeOptionsHtml(prefill.itemType || "General")}</select>
        <input class="input goods-buy-type-custom hide" type="text" placeholder="Custom type" aria-label="Custom type" autocomplete="off" />
        <select class="select goods-buy-brand" aria-label="Brand" ${locked ? "disabled" : ""}>${inventoryBrandOptionsHtml(prefill.brandId || "", prefill.brand || "")}</select>
        <input class="input goods-buy-brand-custom hide" type="text" placeholder="Brand name" aria-label="Custom brand" autocomplete="off" value="${escapeHtml(prefill.brand && !prefill.brandId ? prefill.brand : "")}" />
        <select class="select goods-buy-variant" aria-label="Variant" ${locked ? "disabled" : ""}>${inventoryVariantOptionsHtml(prefill.brandId || "", prefill.variantId || "", prefill.variantLabel || "")}</select>
        <input class="input goods-buy-variant-custom hide" type="text" placeholder="Variant (e.g. 3 ml)" aria-label="Custom variant" autocomplete="off" value="${escapeHtml(prefill.variantLabel && !prefill.variantId ? prefill.variantLabel : "")}" />
        <select class="select goods-buy-category" aria-label="Category" ${locked ? "disabled" : ""}>
          <option value="count" ${category === INVENTORY_CATEGORY_COUNT ? "selected" : ""}>Numbers (pcs)</option>
          <option value="weight" ${category === INVENTORY_CATEGORY_WEIGHT ? "selected" : ""}>Weight (KG)</option>
          <option value="length" ${category === INVENTORY_CATEGORY_LENGTH ? "selected" : ""}>Length (m)</option>
          <option value="volume" ${category === INVENTORY_CATEGORY_VOLUME ? "selected" : ""}>Volume (L / ml)</option>
        </select>
        <select class="select goods-buy-currency" aria-label="Currency" ${locked ? "disabled" : ""}>${inventoryPurchaseCurrencyOptionsHtml(currency)}</select>
      </div>
      <div class="inventory-sale-line-main inventory-purchase-line-main">
        <div class="goods-sale-qty-unit" title="Quantity">
          <input class="input goods-sale-qty goods-buy-qty" type="number" min="${isMeasured ? "0.001" : "1"}" step="${isMeasured ? "0.001" : "1"}" value="${escapeHtml(prefill.boughtQty != null ? String(prefill.boughtQty) : "1")}" placeholder="Qty" aria-label="Qty" required />
          <select class="select goods-sale-unit goods-buy-unit" ${isMeasured ? "" : "disabled"} aria-label="Unit">${inventoryUnitSelectOptionsHtml(category, prefill.quantityUnit)}</select>
        </div>
        <input class="input goods-buy-price" type="number" min="0" step="0.01" placeholder="Cost" aria-label="Purchase price" title="Purchase price" value="${escapeHtml(prefill.unitActualPrice != null && prefill.unitActualPrice !== "" ? String(prefill.unitActualPrice) : "")}" required />
        <input class="input goods-buy-selling" type="number" min="0" step="0.01" placeholder="Sell" aria-label="Selling price" title="Selling price" value="${escapeHtml(prefill.sellingPrice != null && prefill.sellingPrice !== "" ? String(prefill.sellingPrice) : "")}" />
        <input class="input goods-buy-line-total hide" type="text" readonly tabindex="-1" aria-hidden="true" />
        <label class="inventory-sale-vat-toggle" title="Applies the VAT % saved in settings for this currency">
          <input class="goods-buy-tax-applied" type="checkbox" ${taxDefault.rate > 0 ? "checked" : ""} />
          <span>VAT</span>
          <em class="goods-buy-tax-rate-label">${escapeHtml(vatRateLabel)}</em>
        </label>
        <select class="select goods-buy-tax-mode" aria-label="VAT mode" title="VAT treatment">
          <option value="ADD" ${taxDefault.mode === TAX_MODE_ADD ? "selected" : ""}>Add</option>
          <option value="INCLUDE" ${taxDefault.mode === TAX_MODE_INCLUDE ? "selected" : ""}>Incl</option>
        </select>
      </div>
      <input class="input goods-buy-desc" type="text" placeholder="Description (optional)" aria-label="Description" value="${escapeHtml(prefill.itemDescription || "")}" />
      <div class="inventory-sale-line-meta">Enter purchase details</div>
    </div>
  `;
}

function syncGoodsPurchaseLineMeta(line){
  if (!line) return;
  const meta = line.querySelector(".inventory-sale-line-meta");
  const totalInput = line.querySelector(".goods-buy-line-total");
  const currency = String(line.querySelector(".goods-buy-currency")?.value || "").trim();
  if (!meta) return;
  const name = String(line.querySelector(".goods-buy-name")?.value || "").trim();
  if (!name) {
    meta.textContent = "Enter item name";
    return;
  }
  const totalText = totalInput?.value ? `Total ${totalInput.value}` : "";
  const taxBit = totalInput?.dataset.taxApplied === "1" && Number(totalInput.dataset.rawTax || 0)
    ? `VAT ${formatReportAmount(Number(totalInput.dataset.rawTax || 0), currency)}`
    : "";
  meta.textContent = [totalText, taxBit, currency].filter(Boolean).join(" · ") || "Enter purchase details";
}

function updateGoodsPurchaseLine(line, sourceEl = null){
  if (!line) return;
  const typeSelect = line.querySelector(".goods-buy-type");
  const customInput = line.querySelector(".goods-buy-type-custom");
  const categorySelect = line.querySelector(".goods-buy-category");
  const currencySelect = line.querySelector(".goods-buy-currency");
  const qtyInput = line.querySelector(".goods-buy-qty");
  const unitSelect = line.querySelector(".goods-buy-unit");
  const priceInput = line.querySelector(".goods-buy-price");
  const totalInput = line.querySelector(".goods-buy-line-total");
  const taxAppliedInput = line.querySelector(".goods-buy-tax-applied");
  const taxModeInput = line.querySelector(".goods-buy-tax-mode");
  const taxRateLabel = line.querySelector(".goods-buy-tax-rate-label");
  const typeChanged = sourceEl?.classList?.contains("goods-buy-type");
  const brandChanged = sourceEl?.classList?.contains("goods-buy-brand");
  const variantChanged = sourceEl?.classList?.contains("goods-buy-variant");
  const categoryChanged = sourceEl?.classList?.contains("goods-buy-category");
  const currencyChanged = sourceEl?.classList?.contains("goods-buy-currency");
  const taxChanged = sourceEl?.classList?.contains("goods-buy-tax-applied") ||
    sourceEl?.classList?.contains("goods-buy-tax-mode");

  if (taxChanged) line.dataset.taxManual = "true";

  if (typeChanged && typeSelect) {
    const isCustom = typeSelect.value === INVENTORY_CUSTOM_TYPE_VALUE;
    customInput?.classList.toggle("hide", !isCustom);
    if (customInput) {
      customInput.required = isCustom;
      if (isCustom) customInput.focus();
      else customInput.value = "";
    }
  }

  if (brandChanged || variantChanged || !sourceEl) {
    syncGoodsPurchaseLineBrandFields(line);
  }
  if (brandChanged) {
    const brand = findInventoryBrandById(line.querySelector(".goods-buy-brand")?.value);
    const typeSel = line.querySelector(".goods-buy-type");
    if (brand?.item_type && typeSel && typeSel.value !== INVENTORY_CUSTOM_TYPE_VALUE) {
      syncGoodsPurchaseLineTypeFields(line, brand.item_type);
    }
  }
  if (variantChanged) {
    const brandId = String(line.querySelector(".goods-buy-brand")?.value || "");
    const variantId = String(line.querySelector(".goods-buy-variant")?.value || "");
    const brand = findInventoryBrandById(brandId);
    const variant = (brand?.variants || []).find(v => String(v.id) === variantId);
    if (variant) applyInventoryVariantToPurchaseLine(line, variant);
  }

  if (categoryChanged || !sourceEl) {
    syncGoodsPurchaseLineCategoryFields(line, { rebuildUnits: categoryChanged || !sourceEl });
  } else if (unitSelect) {
    // Keep measured unit choice stable when editing qty/price/VAT
    const category = normalizeInventoryCategory(categorySelect?.value);
    unitSelect.disabled = !inventoryIsDecimalCategory(category);
  }

  const category = normalizeInventoryCategory(categorySelect?.value);
  const isMeasured = inventoryIsDecimalCategory(category);
  const currency = String(currencySelect?.value || state.lastCurrency || "AED").trim() || "AED";
  const unitValue = unitSelect
    ? normalizeInventoryUnit(unitSelect.value, category)
    : inventoryBaseUnitForCategory(category);
  if (unitSelect && isMeasured && unitSelect.value !== unitValue) {
    unitSelect.value = unitValue;
  }
  const rawQtyValue = String(qtyInput?.value || "").trim();
  const qty = rawQtyValue
    ? normalizeInventoryQuantityInput(rawQtyValue, category, unitValue)
    : 0;
  const visibleQty = isMeasured ? Number(qtyInput?.value || 0) : qty;
  if (qtyInput && document.activeElement !== qtyInput && visibleQty > 0) {
    qtyInput.value = trimInventoryNumber(visibleQty, isMeasured ? 3 : 0);
  }

  const taxDefault = inventoryTaxDefaultsForGroup({ currency });
  if (currencyChanged || line.dataset.taxManual !== "true") {
    if (taxAppliedInput) taxAppliedInput.checked = taxDefault.rate > 0;
    if (taxModeInput) taxModeInput.value = taxDefault.mode;
    if (currencyChanged) line.dataset.taxManual = "false";
  }
  if (taxRateLabel) {
    taxRateLabel.textContent = taxDefault.rate > 0 ? `${trimInventoryNumber(taxDefault.rate, 2)}%` : "";
  }

  const lineBase = qty * Number(priceInput?.value || 0);
  const breakdown = calculateTaxBreakdown(
    lineBase,
    taxDefault.rate,
    taxModeInput?.value || taxDefault.mode,
    !!taxAppliedInput?.checked
  );
  if (totalInput) {
    totalInput.dataset.rawNet = String(breakdown.net);
    totalInput.dataset.rawTax = String(breakdown.tax);
    totalInput.dataset.rawTotal = String(breakdown.total);
    totalInput.dataset.taxRate = String(breakdown.rate);
    totalInput.dataset.taxMode = breakdown.mode;
    totalInput.dataset.taxApplied = breakdown.applied ? "1" : "0";
    totalInput.value = breakdown.total ? moneyText(breakdown.total, currency) : "";
    applyCurrencyFontClass(totalInput, currency);
    totalInput.title = formatTaxSummary(breakdown, currency);
  }
  if (currencyChanged) state.lastCurrency = currency;
  syncGoodsPurchaseLineMeta(line);
  updateGoodsBoughtTotal();
}

function addGoodsPurchaseLine(prefill = {}){
  if (!els.goodsPurchaseLines) return;
  els.goodsPurchaseLines.insertAdjacentHTML("beforeend", buildGoodsPurchaseLine(prefill));
  const line = els.goodsPurchaseLines.lastElementChild;
  syncGoodsPurchaseLineTypeFields(line, prefill.itemType || "General");
  syncGoodsPurchaseLineBrandFields(line);
  updateGoodsPurchaseLine(line);
  toggleGoodsPurchaseRemoveButtons();
  try {
    line?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (!prefill.locked) line?.querySelector(".goods-buy-name")?.focus({ preventScroll: true });
  } catch {}
}

function inventoryPurchaseLineSeedPrefill(){
  const seedType = String(state.inventoryDraft.purchaseSeedType || "").trim();
  const seedCategory = String(state.inventoryDraft.purchaseSeedCategory || "").trim();
  const seedCurrency = String(state.inventoryDraft.purchaseSeedCurrency || state.lastCurrency || "AED").trim();
  return {
    itemType: seedType || "General",
    itemCategory: seedCategory || INVENTORY_CATEGORY_COUNT,
    currency: seedCurrency || "AED"
  };
}

function syncGoodsPurchaseAddButtonLabel(){
  if (!els.addGoodsPurchaseLineBtn) return;
  const seeded = !!String(state.inventoryDraft.purchaseSeedType || "").trim();
  els.addGoodsPurchaseLineBtn.innerHTML = seeded
    ? `<i class="fa-solid fa-plus" aria-hidden="true"></i> Add brand / variant`
    : `<i class="fa-solid fa-plus" aria-hidden="true"></i> Add item`;
}

function toggleGoodsPurchaseRemoveButtons(){
  if (!els.goodsPurchaseLines) return;
  const lines = els.goodsPurchaseLines.querySelectorAll(".inventory-purchase-line");
  const restockOnly = !!state.inventoryDraft.purchaseGroupId;
  lines.forEach(line => {
    const btn = line.querySelector(".goods-buy-remove");
    const isRestockLine = !!String(line.dataset.restockGroupId || "").trim();
    if (btn) btn.disabled = restockOnly || isRestockLine || lines.length === 1;
  });
  if (els.addGoodsPurchaseLineBtn) {
    // Restock-only mode keeps a single locked line. Family / new purchase can add more SKUs.
    els.addGoodsPurchaseLineBtn.classList.toggle("hide", restockOnly);
    els.addGoodsPurchaseLineBtn.disabled = restockOnly;
  }
  syncGoodsPurchaseAddButtonLabel();
}

function renderGoodsPurchaseLines(prefill = null){
  if (!els.goodsPurchaseLines) return;
  const seed = prefill || { currency: state.lastCurrency || "AED" };
  els.goodsPurchaseLines.innerHTML = buildGoodsPurchaseLine(seed);
  const line = els.goodsPurchaseLines.firstElementChild;
  syncGoodsPurchaseLineTypeFields(line, seed.itemType || "General");
  syncGoodsPurchaseLineBrandFields(line);
  updateGoodsPurchaseLine(line);
  toggleGoodsPurchaseRemoveButtons();
}

function collectGoodsPurchaseLines(){
  if (!els.goodsPurchaseLines) return [];
  return Array.from(els.goodsPurchaseLines.querySelectorAll(".inventory-purchase-line")).map(line => {
    const category = normalizeInventoryCategory(line.querySelector(".goods-buy-category")?.value);
    const unit = line.querySelector(".goods-buy-unit")?.value || inventoryBaseUnitForCategory(category);
    const qty = normalizeInventoryQuantityInput(line.querySelector(".goods-buy-qty")?.value, category, unit);
    const totalInput = line.querySelector(".goods-buy-line-total");
    const currency = String(line.querySelector(".goods-buy-currency")?.value || "").trim();
    const taxDefault = inventoryTaxDefaultsForGroup({ currency });
    const brandInfo = readGoodsPurchaseLineBrand(line);
    const restockGroupId = String(line.dataset.restockGroupId || "").trim();
    return {
      restockGroupId,
      itemName: String(line.querySelector(".goods-buy-name")?.value || "").trim(),
      itemType: readGoodsPurchaseLineItemType(line),
      itemCategory: category,
      quantityUnit: inventoryBaseUnitForCategory(category),
      brand: brandInfo.brand,
      brandId: brandInfo.brandId,
      variantLabel: brandInfo.variantLabel,
      variantId: brandInfo.variantId,
      currency,
      unitActualPrice: Number(line.querySelector(".goods-buy-price")?.value || 0),
      sellingPrice: Number(line.querySelector(".goods-buy-selling")?.value || 0),
      boughtQty: qty,
      itemDescription: String(line.querySelector(".goods-buy-desc")?.value || "").trim(),
      taxApplied: totalInput?.dataset.taxApplied === "1",
      taxRate: normalizeTaxRate(totalInput?.dataset.taxRate ?? taxDefault.rate),
      taxMode: normalizeTaxMode(totalInput?.dataset.taxMode || taxDefault.mode),
      netAmount: Number(totalInput?.dataset.rawNet || 0),
      taxAmount: Number(totalInput?.dataset.rawTax || 0),
      grossAmount: Number(totalInput?.dataset.rawTotal || 0)
    };
  });
}

function getInventoryCustomerNames(){
  const names = new Set();
  for (const entry of state.entries) {
    if (!hasGoodsTag(entry.notes) || entry.entry_kind === "principal") continue;
    const meta = goodsMetaFromNotes(entry.notes);
    const tx = String(meta.transactionType || "").toUpperCase();
    const fromTag = String(meta.customerName || "").trim();
    if (fromTag) {
      names.add(fromTag);
      continue;
    }
    // Sales without CUST tag still belong to Walk-in.
    if (isInventorySaleAction(entry) || tx === "SALE") {
      names.add("Walk-in customer");
      continue;
    }
    // CUSTOMER ledger rows sometimes store the name as person_name.
    if (tx === "CUSTOMER") {
      const fromPerson = String(entry.person_name || "").trim();
      if (fromPerson) names.add(/^walk-?in/i.test(fromPerson) ? "Walk-in customer" : fromPerson);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function getInventoryCustomerContact(name){
  const target = String(name || "").trim().toLowerCase();
  if (!target) {
    return { phone: "", address: "", company: "", trn: "", email: "" };
  }
  const rows = state.entries
    .filter(e => hasGoodsTag(e.notes) && e.entry_kind !== "principal")
    .map(entry => ({ entry, meta: goodsMetaFromNotes(entry.notes) }))
    .filter(row => String(row.meta.customerName || "").trim().toLowerCase() === target)
    .sort((a, b) => dateStamp(b.entry.action_date || b.entry.created_at) - dateStamp(a.entry.action_date || a.entry.created_at));
  const pick = (key) => rows.find(row => row.meta[key])?.meta[key] || "";
  return {
    phone: pick("customerPhone"),
    address: pick("customerAddress"),
    company: pick("customerCompany"),
    trn: pick("customerTrn"),
    email: pick("customerEmail")
  };
}

function inventoryCustomerEntriesForName(customerName){
  const target = String(customerName || "").trim().toLowerCase();
  if (!target) return [];
  return state.entries.filter(entry => {
    if (!hasGoodsTag(entry.notes) || entry.entry_kind === "principal") return false;
    const meta = goodsMetaFromNotes(entry.notes);
    return String(meta.customerName || "").trim().toLowerCase() === target;
  });
}

function applyInventoryCustomerDetailsToNote(noteValue, details = {}){
  const existing = goodsMetaFromNotes(noteValue);
  return upsertGoodsMetaInNote(noteValue, {
    ...existing,
    customerName: details.name || existing.customerName || "",
    customerPhone: details.phone || "",
    customerAddress: details.address || "",
    customerCompany: details.company || "",
    customerTrn: details.trn || "",
    customerEmail: details.email || ""
  });
}

function saveInventoryCustomerDetails(oldName, details){
  const previousName = String(oldName || "").trim();
  const nextName = String(details?.name || "").trim();
  if (!nextName) throw new Error("Customer name is required.");
  const rows = inventoryCustomerEntriesForName(previousName);
  if (!rows.length){
    // Create a customer-only record when editing a name that has no rows yet.
    const today = todayISO();
    const allowedCurrencies = getPageScopedCurrencies();
    const currency = allowedCurrencies.includes(state.lastCurrency)
      ? state.lastCurrency
      : (allowedCurrencies[0] || "AED");
    saveEntriesImmediately({
      group_id: crypto.randomUUID(),
      direction: "taken",
      entry_kind: "partial",
      person_name: nextName,
      currency,
      principal_amount: null,
      action_amount: 0,
      loan_date: today,
      action_date: today,
      notes: upsertGoodsMetaInNote(normalizeGoodsNote("Customer record", true), {
        customerName: nextName,
        customerPhone: details.phone || "",
        customerAddress: details.address || "",
        customerCompany: details.company || "",
        customerTrn: details.trn || "",
        customerEmail: details.email || "",
        transactionType: INVENTORY_TX_CUSTOMER
      })
    }, { label: "Customer" });
    return nextName;
  }

  const contactPayload = {
    name: nextName,
    phone: String(details.phone || "").trim(),
    address: String(details.address || "").trim(),
    company: String(details.company || "").trim(),
    trn: String(details.trn || "").trim(),
    email: String(details.email || "").trim()
  };

  for (const entry of rows){
    const nextNotes = applyInventoryCustomerDetailsToNote(entry.notes, contactPayload);
    const updatedEntry = {
      ...entry,
      notes: nextNotes,
      person_name: isInventoryCustomerOnlyEntry(entry) ? nextName : entry.person_name
    };
    state.entries = state.entries.map(row => row.id === entry.id ? updatedEntry : row);
    const patch = { notes: nextNotes };
    if (isInventoryCustomerOnlyEntry(entry)) patch.person_name = nextName;
    queueDatabasePatch(entry.id, patch, "Customer details", updatedEntry);
  }
  renderAll();
  return nextName;
}

function buildTransferEvents(accountsOverride = null){
  const wf = state.expenseWalletFilter;
  const accounts = accountsOverride || getExpenseAccounts({ applyUiFilters: false });
  const accountsByGroup = new Map(accounts.map(a => [a.group_id, a]));
  const out = [];
  for (const account of accounts){
    if (account.currency === "BTC") continue;
    for (const row of account.spends){
      const meta = expenseMetaFromNotes(row.notes);
      if (meta.expenseType !== "Transfer") continue;
      if (!isInDateRange(row.action_date)) continue;
      const partner = findTransferPartnerForExpense(row);
      if (wf !== "all"){
        const hit = account.group_id === wf || (partner && partner.group_id === wf);
        if (!hit) continue;
      }
      const p = parseTransferExpenseDetails(row, account);
      const toAcc = partner ? accountsByGroup.get(partner.group_id) : null;
      out.push({
        expenseId: row.id,
        topupId: partner?.id || null,
        date: row.action_date,
        fromWallet: account.person_name,
        toWallet: p.toWallet,
        fromAccountType: account.accountType,
        toAccountType: toAcc?.accountType || "",
        amtOut: p.amtOut,
        curOut: p.curOut,
        amtIn: p.amtIn,
        curIn: p.curIn,
        rate: p.rate,
        sameCurrency: p.sameCurrency,
        notesExpense: row.notes,
        notesTopup: partner?.notes || ""
      });
    }
  }
  return out.sort((a, b) => dateStamp(b.date) - dateStamp(a.date));
}

function getTransferRowsForCurrency(cur, events){
  const showOtherCurrencyLeg = isPageCurrencyAll();
  const rows = [];
  for (const ev of events){
    if (ev.curOut === cur){
      rows.push({
        kind: "Sent",
        date: ev.date,
        walletName: ev.fromWallet,
        walletLabel: `${ev.fromWallet}${ev.fromAccountType ? ` (${ev.fromAccountType})` : ""}`,
        counterparty: ev.toWallet,
        amount: ev.amtOut,
        rateDisplay: ev.sameCurrency ? "1" : String(ev.rate),
        otherLegDisplay: ev.sameCurrency || !showOtherCurrencyLeg ? "—" : `${moneyText(ev.amtIn, ev.curIn)}`,
        otherLegPdfDisplay: ev.sameCurrency || !showOtherCurrencyLeg ? "—" : `${moneyText(ev.amtIn, ev.curIn, { forPdf: true })}`,
        notes: cleanExpenseNote(ev.notesExpense),
        editId: ev.expenseId
      });
    }
    if (ev.curIn === cur){
      rows.push({
        kind: "Received",
        date: ev.date,
        walletName: ev.toWallet,
        walletLabel: `${ev.toWallet}${ev.toAccountType ? ` (${ev.toAccountType})` : ""}`,
        counterparty: ev.fromWallet,
        amount: ev.amtIn,
        rateDisplay: ev.sameCurrency ? "1" : String(ev.rate),
        otherLegDisplay: ev.sameCurrency || !showOtherCurrencyLeg ? "—" : `${moneyText(ev.amtOut, ev.curOut)}`,
        otherLegPdfDisplay: ev.sameCurrency || !showOtherCurrencyLeg ? "—" : `${moneyText(ev.amtOut, ev.curOut, { forPdf: true })}`,
        notes: cleanExpenseNote(ev.notesTopup || ev.notesExpense),
        editId: ev.topupId || ev.expenseId
      });
    }
  }
  return rows.sort((a, b) => dateStamp(b.date) - dateStamp(a.date));
}

function transferCurrencyTotals(cur, events){
  let sent = 0;
  let received = 0;
  for (const ev of events){
    if (ev.curOut === cur) sent += Number(ev.amtOut || 0);
    if (ev.curIn === cur) received += Number(ev.amtIn || 0);
  }
  return { sent, received };
}

function collectTopupTransactionsFlat(accounts){
  const wf = state.expenseWalletFilter;
  const topupTransactions = [];
  for (const account of accounts){
    if (wf !== "all" && account.group_id !== wf) continue;
    if (account.currency === "BTC") continue;
    if (account.principal && Number(account.principal.principal_amount || 0) > 0){
      if (isInDateRange(account.principal.loan_date)){
        topupTransactions.push({
          ...account.principal,
          action_date: account.principal.loan_date,
          action_amount: account.principal.principal_amount,
          person_name: account.person_name,
          currency: account.currency,
          accountType: account.accountType,
          isOpeningBalance: true
        });
      }
    }
    for (const topup of account.topups){
      if (!isInDateRange(topup.action_date)) continue;
      topupTransactions.push({
        ...topup,
        person_name: account.person_name,
        currency: account.currency,
        accountType: account.accountType,
        isTopup: true
      });
    }
  }
  return topupTransactions;
}

function filterPrincipal(direction, searchKey = direction){
  return groupByLoan(getActiveEntries().filter(e => e.direction === direction))
    .filter(group => matchesSearch(group.principal || group.actions[0] || {}, state.search[searchKey]));
}

function groupByPerson(direction, searchKey = direction){
  const personMap = new Map();
  const directionEntries = getActiveEntries().filter(e => e.direction === direction);
  const searchTerm = state.search[searchKey];
  const selectedCurrency = state.currencyFilter[searchKey] || "All";

  for (const entry of directionEntries){
    if (!matchesSearch(entry, searchTerm)) continue;
    if (selectedCurrency !== "All" && entry.currency !== selectedCurrency) continue;

    const personKey = String(entry.person_name || "").trim();
    if (!personMap.has(personKey)){
      personMap.set(personKey, {
        person_name: personKey,
        entries: [],
        groupIds: new Set(),
        activityStamp: 0,
        lastActivity: null
      });
    }

    const person = personMap.get(personKey);
    person.entries.push(entry);
    if (entry.group_id) person.groupIds.add(entry.group_id);

    const stamp = Math.max(dateStamp(entry.loan_date), dateStamp(entry.action_date));
    if (stamp >= person.activityStamp){
      person.activityStamp = stamp;
      person.lastActivity = entry.action_date || entry.loan_date || person.lastActivity;
    }
  }

  const people = [];
  for (const person of personMap.values()){
    const principalRows = person.entries.filter(e => e.entry_kind === "principal");
    const actionRows = person.entries.filter(e => e.entry_kind !== "principal");

    const principalTotal = principalRows.reduce((sum, e) => sum + Number(e.principal_amount || 0), 0);
    const paidTotal = actionRows.reduce((sum, e) => sum + Number(e.action_amount || 0), 0);
    const remaining = Math.max(principalTotal - paidTotal, 0);
    const status = remaining <= 0 ? "Closed" : paidTotal > 0 ? "Partial" : "Open";

    const currency = principalRows[0]?.currency || actionRows[0]?.currency || "";

    const timeline = person.entries
      .slice()
      .sort((a, b) => {
        const aStamp = dateStamp(a.entry_kind === "principal" ? a.loan_date : a.action_date);
        const bStamp = dateStamp(b.entry_kind === "principal" ? b.loan_date : b.action_date);
        if (aStamp !== bStamp) return aStamp - bStamp;
        return (a.entry_kind === "principal" ? -1 : 1) - (b.entry_kind === "principal" ? -1 : 1);
      });

    let runningRemaining = 0;
    const rows = timeline.map(entry => {
      const isPrincipal = entry.entry_kind === "principal";
      const amount = Number(isPrincipal ? entry.principal_amount : entry.action_amount || 0);
      runningRemaining = isPrincipal
        ? runningRemaining + amount
        : Math.max(runningRemaining - amount, 0);

      return {
        kind: isPrincipal ? "principal" : (entry.entry_kind === "partial" ? "partial" : "full"),
        date: isPrincipal ? (entry.loan_date || "—") : (entry.action_date || "—"),
        amount,
        remainingAfter: runningRemaining,
        note: entry.notes || "—",
        entryId: entry.id
      };
    });

    const firstDate = timeline[0]
      ? (timeline[0].entry_kind === "principal" ? timeline[0].loan_date : timeline[0].action_date)
      : null;

    people.push({
      person_name: person.person_name,
      currency,
      principalTotal,
      paidTotal,
      remaining,
      status,
      rows,
      entries: person.entries,
      loan_date: firstDate || null,
      activityStamp: person.activityStamp,
      lastActivity: person.lastActivity,
      groupCount: person.groupIds.size,
      primaryGroupId: principalRows[0]?.group_id || actionRows[0]?.group_id || ""
    });
  }

  return people.sort((a, b) => {
    const diff = (b.activityStamp || 0) - (a.activityStamp || 0);
    if (diff !== 0) return diff;
    return String(a.person_name || "").localeCompare(String(b.person_name || ""));
  });
}

function getFilteredGroups(direction, searchKey, options = {}){
  let groups = groupByPerson(direction, searchKey);
  if (typeof options.groupFilter === "function"){
    groups = groups.filter(options.groupFilter);
  }
  const filterValue = state.statusFilter[searchKey];
  if (filterValue !== "All"){
    if (filterValue === "Active"){
      groups = groups.filter(g => g.status === "Open" || g.status === "Partial");
    } else {
      groups = groups.filter(g => g.status.toLowerCase() === filterValue.toLowerCase());
    }
  }
  return groups;
}
