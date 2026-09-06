/* Compact authoritative Dashboard data. Detailed module records stay lazy. */
const DASHBOARD_SUMMARY_CACHE_MS = 60000;

function isDashboardSummaryRpcMissingError(error){
  const message = String(error?.message || error || "");
  return /app_get_my_dashboard_summary|Could not find the function|PGRST202|404/i.test(message);
}

function shouldUseDashboardSummary(){
  if (isGuestMode() || state.trialLocked) return false;
  if (state.dashboardSummary?.rpcAvailable === false) return false;
  return state.dataSource === "supabase" || (typeof databaseSessionCanLoad === "function" && databaseSessionCanLoad());
}

function resetDashboardSummaryCache(){
  state.dashboardSummary = {
    loaded: false,
    loading: false,
    rpcAvailable: state.dashboardSummary?.rpcAvailable ?? null,
    data: null,
    promise: null,
    fetchedAt: 0,
    error: ""
  };
}

async function loadDashboardSummary(options = {}){
  if (!shouldUseDashboardSummary()) return null;
  const force = options.force === true;
  const cache = state.dashboardSummary;
  if (!force && cache.loaded && cache.data && Date.now() - Number(cache.fetchedAt || 0) < DASHBOARD_SUMMARY_CACHE_MS) {
    return cache.data;
  }
  if (cache.promise) return cache.promise;
  cache.loading = true;
  cache.error = "";
  const promise = (async () => {
    try {
      const result = unwrapRpcJson(await supabaseRpc("app_get_my_dashboard_summary", {}));
      if (!result || result.ok === false || !result.sections) {
        throw new Error(result?.error || "Dashboard summary response is invalid.");
      }
      cache.rpcAvailable = true;
      cache.data = result;
      cache.loaded = true;
      cache.fetchedAt = Date.now();
      return result;
    } catch (error) {
      cache.error = String(error?.message || error || "Dashboard summary failed");
      if (isDashboardSummaryRpcMissingError(error)) {
        cache.rpcAvailable = false;
        cache.loaded = false;
        cache.data = null;
        return null;
      }
      throw error;
    } finally {
      cache.loading = false;
      cache.promise = null;
    }
  })();
  cache.promise = promise;
  return promise;
}

function invalidateDashboardSummary(options = {}){
  const available = state.dashboardSummary?.rpcAvailable ?? null;
  resetDashboardSummaryCache();
  state.dashboardSummary.rpcAvailable = available;
  if (options.refreshIfVisible && typeof getActiveTabKey === "function" && getActiveTabKey() === "dashboard") {
    loadDashboardSummary({ force: true })
      .then(() => typeof renderDetailedDashboard === "function" && renderDetailedDashboard({ preserveScroll: true }))
      .catch(error => console.warn("Dashboard summary refresh failed.", error));
  }
}

function dashboardSummaryRows(section){
  const rows = state.dashboardSummary?.data?.sections?.[section]?.rows;
  return Array.isArray(rows) ? rows : [];
}

function dashboardSummaryCurrencies(section){
  return sortCurrenciesList(dashboardSummaryRows(section).map(row => String(row.currency || "")).filter(Boolean));
}

function dashboardSummaryRow(section, currency){
  const rows = dashboardSummaryRows(section);
  return rows.find(row => String(row.currency || "") === String(currency || "")) || rows[0] || null;
}

function dashboardSummaryMonthMap(section, currency){
  const months = state.dashboardSummary?.data?.sections?.[section]?.months;
  const map = new Map();
  (Array.isArray(months) ? months : []).forEach(row => {
    if (currency && String(row.currency || "") !== String(currency)) return;
    const key = String(row.month || "");
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    const next = { ...row };
    delete next.currency;
    delete next.month;
    map.set(key, next);
  });
  return map;
}

function dashboardSummaryAmount(value, currency){
  return formatReportAmount(Number(value || 0), currency || "");
}

function dashboardExpensePayloadFromSummary(currencyHint = ""){
  const currencies = dashboardSummaryCurrencies("expenses");
  const currency = resolveDashboardSectionCurrency("expenses", currencies, currencyHint);
  const row = dashboardSummaryRow("expenses", currency);
  if (!row) return null;
  const topped = Number(row.opening_total || 0) + Number(row.topup_total || 0);
  const spent = Number(row.spend_total || 0);
  const balance = Number(row.balance_total || 0);
  return {
    accountsUniverse: [], accounts: [], currencies, selectedCurrency: currency,
    metrics: {
      wallets: Number(row.wallets || 0), activeWallets: Number(row.active_wallets || 0), currencies: currencies.length,
      toppedUp: dashboardSummaryAmount(topped, currency), spent: dashboardSummaryAmount(spent, currency),
      balance: dashboardSummaryAmount(balance, currency), toppedUpValue: topped, spentValue: spent, balanceValue: balance
    },
    walletSpend: [], monthMap: dashboardSummaryMonthMap("expenses", currency)
  };
}

function dashboardInventoryPayloadFromSummary(currencyHint = ""){
  const currencies = dashboardSummaryCurrencies("inventory");
  const currency = resolveDashboardSectionCurrency("inventory", currencies, currencyHint);
  const row = dashboardSummaryRow("inventory", currency);
  if (!row) return null;
  return {
    goodsAll: [], goodsUniverse: [], currencies, selectedCurrency: currency, itemTypeFilter: "",
    metrics: {
      items: Number(row.items || 0), stockQty: String(row.stock_qty_label || "0"),
      stockValue: dashboardSummaryAmount(row.stock_value, currency), inStock: Number(row.in_stock || 0),
      lowStock: Number(row.low_stock || 0), soldOut: Number(row.sold_out || 0),
      purchaseTotal: dashboardSummaryAmount(row.purchase_total, currency),
      salesTotal: dashboardSummaryAmount(row.sales_total, currency),
      paidTotal: dashboardSummaryAmount(row.paid_total, currency),
      profitTotal: dashboardSummaryAmount(row.profit_total, currency),
      lossTotal: dashboardSummaryAmount(row.loss_total, currency),
      outstanding: dashboardSummaryAmount(row.outstanding_total, currency),
      outstandingCount: Number(row.outstanding_count || 0),
      customers: Number(row.customer_count || 0)
    },
    statusCounts: { inStock: Number(row.in_stock || 0), lowStock: Number(row.low_stock || 0), sold: Number(row.sold_out || 0) },
    typeCounts: new Map(), brandCounts: new Map(), monthMap: dashboardSummaryMonthMap("inventory", currency)
  };
}

function dashboardLoansPayloadFromSummary(currencyHint = ""){
  const currencies = dashboardSummaryCurrencies("loans");
  const currency = resolveDashboardSectionCurrency("loans", currencies, currencyHint);
  const row = dashboardSummaryRow("loans", currency);
  if (!row) return null;
  const n = key => Number(row[key] || 0);
  return {
    currencies, selectedCurrency: currency, given: [], taken: [],
    metrics: {
      people: n("people"), givenCount: n("given_count"), takenCount: n("taken_count"),
      givenPrincipal: dashboardSummaryAmount(row.given_principal, currency),
      givenOpen: dashboardSummaryAmount(row.given_open, currency), givenPaid: dashboardSummaryAmount(row.given_paid, currency),
      takenPrincipal: dashboardSummaryAmount(row.taken_principal, currency),
      takenOpen: dashboardSummaryAmount(row.taken_open, currency), takenPaid: dashboardSummaryAmount(row.taken_paid, currency),
      givenPrincipalValue: n("given_principal"), givenOpenValue: n("given_open"), givenPaidValue: n("given_paid"),
      takenPrincipalValue: n("taken_principal"), takenOpenValue: n("taken_open"), takenPaidValue: n("taken_paid"),
      netExposureValue: n("given_open") - n("taken_open")
    },
    statusCounts: { Open: n("status_open"), Partial: n("status_partial"), Closed: n("status_closed") },
    monthMap: dashboardSummaryMonthMap("loans", currency)
  };
}

function dashboardInstallmentPayloadFromSummary(currencyHint = ""){
  const currencies = dashboardSummaryCurrencies("installments");
  const currency = resolveDashboardSectionCurrency("installments", currencies, currencyHint);
  const row = dashboardSummaryRow("installments", currency);
  if (!row) return null;
  const principal = Number(row.principal || 0);
  const paid = Number(row.paid || 0);
  const remaining = Number(row.remaining || 0);
  return {
    currencies, selectedCurrency: currency, plans: [],
    metrics: {
      plans: Number(row.plans || 0), active: Number(row.active || 0), overdue: Number(row.overdue || 0),
      completed: Number(row.completed || 0), principal: dashboardSummaryAmount(principal, currency),
      paid: dashboardSummaryAmount(paid, currency), remaining: dashboardSummaryAmount(remaining, currency),
      progressPct: principal > 0 ? Math.min(100, Math.round((paid / principal) * 100)) : 0,
      principalValue: principal, paidValue: paid, remainingValue: remaining
    },
    statusCounts: {
      Open: Number(row.status_open || 0), Partial: Number(row.status_partial || 0),
      Overdue: Number(row.status_overdue || 0), Closed: Number(row.status_closed || 0)
    },
    monthMap: dashboardSummaryMonthMap("installments", currency)
  };
}

function dashboardAssetsPayloadFromSummary(currencyHint = ""){
  const currencies = dashboardSummaryCurrencies("assets");
  const currency = resolveDashboardSectionCurrency("assets", currencies, currencyHint);
  const row = dashboardSummaryRow("assets", currency);
  if (!row) return null;
  const section = state.dashboardSummary?.data?.sections?.assets || {};
  const topRows = (Array.isArray(section.top_assets) ? section.top_assets : [])
    .filter(item => !currency || item.currency === currency)
    .map(item => ({
      asset: { id: item.id, name: item.name, asset_type: item.asset_type, asset_type_other: item.asset_type_other, status: item.status },
      sum: { investedSpent: Number(item.invested_spent || 0), revenue: Number(item.revenue || 0), net: Number(item.net || 0) }
    }));
  const net = Number(row.net || 0);
  return {
    currencies, selectedCurrency: currency, count: Number(row.assets || 0),
    metrics: {
      assets: Number(row.assets || 0), active: Number(row.active || 0), sold: Number(row.sold || 0), disposed: Number(row.disposed || 0),
      invested: dashboardSummaryAmount(row.invested, currency), investedValue: Number(row.invested || 0),
      revenue: dashboardSummaryAmount(row.revenue, currency), revenueValue: Number(row.revenue || 0),
      sale: dashboardSummaryAmount(row.sale, currency), saleValue: Number(row.sale || 0),
      net: dashboardSummaryAmount(net, currency), netValue: net,
      purchase: dashboardSummaryAmount(row.purchase, currency), purchaseValue: Number(row.purchase || 0),
      bookValue: dashboardSummaryAmount(row.depreciation_book_value, currency),
      accumulatedDepreciation: dashboardSummaryAmount(row.accumulated_depreciation, currency)
    },
    statusCounts: { active: Number(row.active || 0), sold: Number(row.sold || 0), disposed: Number(row.disposed || 0) },
    typeCounts: new Map(),
    expenseBreakdown: {
      maintenance: Number(row.maintenance || 0), repair: Number(row.repair || 0), operating: Number(row.operating || 0),
      otherExpense: Number(row.other_expense || 0), additionalInvestment: Number(row.additional_investment || 0),
      saleCosts: Number(row.sale_costs || 0), purchase: Number(row.purchase || 0)
    },
    monthMap: dashboardSummaryMonthMap("assets", currency), rows: topRows, totals: row
  };
}

function buildDashboardPayloadFromSummary(section, currencyHint = ""){
  if (!state.dashboardSummary?.loaded || !state.dashboardSummary?.data) return null;
  if (section === "expenses") return dashboardExpensePayloadFromSummary(currencyHint);
  if (section === "inventory") return dashboardInventoryPayloadFromSummary(currencyHint);
  if (section === "loans") return dashboardLoansPayloadFromSummary(currencyHint);
  if (section === "installments") return dashboardInstallmentPayloadFromSummary(currencyHint);
  if (section === "assets") return dashboardAssetsPayloadFromSummary(currencyHint);
  return null;
}
