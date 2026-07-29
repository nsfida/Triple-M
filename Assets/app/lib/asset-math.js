/**
 * Pure asset financial / ownership helpers (browser + Node).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.TripleMAssetMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EXPENSE_TX_TYPES = new Set([
    "maintenance",
    "repair",
    "operating",
    "other_expense",
    "additional_investment",
  ]);
  const REVENUE_TX_TYPES = new Set(["revenue"]);

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function parseDateOnly(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function ownershipDuration(purchaseDate, endDate, now = new Date()) {
    const start = parseDateOnly(purchaseDate);
    if (!start) {
      return { days: 0, months: 0, years: 0, label: "—", end: null, ongoing: true };
    }
    const endRaw = parseDateOnly(endDate) || startOfDay(now);
    const end = endRaw < start ? start : endRaw;
    const days = Math.max(0, Math.round((end - start) / 86400000));
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    const remDays = days - years * 365 - months * 30;
    const parts = [];
    if (years) parts.push(`${years}y`);
    if (months) parts.push(`${months}mo`);
    if (!years && !months) parts.push(`${days}d`);
    else if (remDays && years < 2) parts.push(`${remDays}d`);
    return {
      days,
      months: years * 12 + months,
      years,
      label: parts.join(" ") || "0d",
      end: end,
      ongoing: !parseDateOnly(endDate),
    };
  }

  function sumByType(transactions, type) {
    return (Array.isArray(transactions) ? transactions : [])
      .filter((t) => String(t.tx_type || t.txType || "") === type && !t.is_deleted)
      .reduce((s, t) => s + Math.abs(num(t.amount)), 0);
  }

  function filterByDateRange(transactions, fromDate, toDate) {
    const from = parseDateOnly(fromDate);
    const to = parseDateOnly(toDate);
    return (Array.isArray(transactions) ? transactions : []).filter((t) => {
      if (t.is_deleted) return false;
      const d = parseDateOnly(t.tx_date || t.txDate);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  function summarizeAsset(asset, transactions, options = {}) {
    const txs = Array.isArray(transactions) ? transactions.filter((t) => !t.is_deleted) : [];
    const status = String(asset?.status || "active").toLowerCase();
    const purchasePrice = Math.abs(num(asset?.purchase_price ?? asset?.purchasePrice));
    const salePrice =
      status === "sold" ? Math.abs(num(asset?.sale_price ?? asset?.salePrice)) : 0;
    const saleCosts =
      status === "sold" || status === "disposed"
        ? Math.abs(num(asset?.sale_costs ?? asset?.saleCosts))
        : 0;

    const maintenance = sumByType(txs, "maintenance");
    const repair = sumByType(txs, "repair");
    const operating = sumByType(txs, "operating");
    const otherExpense = sumByType(txs, "other_expense");
    const additionalInvestment = sumByType(txs, "additional_investment");
    const revenue = sumByType(txs, "revenue");

    const totalExpenses =
      purchasePrice +
      maintenance +
      repair +
      operating +
      otherExpense +
      additionalInvestment +
      saleCosts;
    const totalIncome = revenue + salePrice;
    const net = totalIncome - totalExpenses;
    const ownershipEnd =
      status === "sold" || status === "disposed"
        ? asset?.sale_date || asset?.saleDate || null
        : null;
    const ownership = ownershipDuration(
      asset?.purchase_date || asset?.purchaseDate,
      ownershipEnd,
      options.now
    );

    const rangeTxs = filterByDateRange(txs, options.fromDate, options.toDate);
    const rangeRevenue = sumByType(rangeTxs, "revenue");
    const rangeExpenses = rangeTxs
      .filter((t) => EXPENSE_TX_TYPES.has(String(t.tx_type || t.txType)))
      .reduce((s, t) => s + Math.abs(num(t.amount)), 0);

    return {
      status,
      purchasePrice,
      salePrice,
      saleCosts,
      maintenance,
      repair,
      operating,
      otherExpense,
      additionalInvestment,
      revenue,
      totalExpenses,
      totalIncome,
      net,
      isProfit: net > 0,
      isLoss: net < 0,
      ownership,
      rangeRevenue,
      rangeExpenses,
      rangeNet: rangeRevenue - rangeExpenses,
    };
  }

  function monthlyBuckets(transactions, options = {}) {
    const map = new Map();
    const txs = filterByDateRange(transactions, options.fromDate, options.toDate);
    txs.forEach((t) => {
      const raw = String(t.tx_date || t.txDate || "");
      const key = raw.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) return;
      if (!map.has(key)) map.set(key, { revenue: 0, expense: 0 });
      const row = map.get(key);
      const amt = Math.abs(num(t.amount));
      const type = String(t.tx_type || t.txType || "");
      if (REVENUE_TX_TYPES.has(type)) row.revenue += amt;
      else if (EXPENSE_TX_TYPES.has(type)) row.expense += amt;
    });
    return [...map.keys()]
      .sort()
      .map((key) => ({ month: key, ...map.get(key) }));
  }

  function yearlyBuckets(transactions, options = {}) {
    const map = new Map();
    const txs = filterByDateRange(transactions, options.fromDate, options.toDate);
    txs.forEach((t) => {
      const raw = String(t.tx_date || t.txDate || "");
      const key = raw.slice(0, 4);
      if (!/^\d{4}$/.test(key)) return;
      if (!map.has(key)) map.set(key, { revenue: 0, expense: 0 });
      const row = map.get(key);
      const amt = Math.abs(num(t.amount));
      const type = String(t.tx_type || t.txType || "");
      if (REVENUE_TX_TYPES.has(type)) row.revenue += amt;
      else if (EXPENSE_TX_TYPES.has(type)) row.expense += amt;
    });
    return [...map.keys()]
      .sort()
      .map((key) => ({ year: key, ...map.get(key) }));
  }

  function cumulativeSeries(transactions, options = {}) {
    const txs = filterByDateRange(transactions, options.fromDate, options.toDate)
      .slice()
      .sort((a, b) =>
        String(a.tx_date || a.txDate || "").localeCompare(String(b.tx_date || b.txDate || ""))
      );
    let rev = 0;
    let exp = 0;
    const points = [];
    txs.forEach((t) => {
      const amt = Math.abs(num(t.amount));
      const type = String(t.tx_type || t.txType || "");
      if (REVENUE_TX_TYPES.has(type)) rev += amt;
      else if (EXPENSE_TX_TYPES.has(type)) exp += amt;
      else return;
      points.push({
        date: String(t.tx_date || t.txDate || "").slice(0, 10),
        revenue: rev,
        expense: exp,
        net: rev - exp,
      });
    });
    return points;
  }

  return {
    EXPENSE_TX_TYPES,
    REVENUE_TX_TYPES,
    num,
    parseDateOnly,
    ownershipDuration,
    sumByType,
    filterByDateRange,
    summarizeAsset,
    monthlyBuckets,
    yearlyBuckets,
    cumulativeSeries,
  };
});
