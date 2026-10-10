/**
 * Pure tax / VAT math helpers (browser + Node).
 * Mirrors Assets/app/script.js tax helpers — no DOM or app state.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.TripleMTaxMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TAX_MODE_ADD = "ADD";
  const TAX_MODE_INCLUDE = "INCLUDE";

  function normalizeTaxRate(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 100);
  }

  function normalizeTaxMode(value) {
    return String(value || "").trim().toUpperCase() === TAX_MODE_INCLUDE
      ? TAX_MODE_INCLUDE
      : TAX_MODE_ADD;
  }

  function roundTaxMoney(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return Number(n.toFixed(8));
  }

  /** Coerce ledger money fields; never return NaN/Infinity. */
  function finiteMoney(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * Resolve VAT-on flag from stored [VATP:…] token.
   * true/false = explicit; null = legacy/missing → infer from rate/amount.
   */
  function parseVatAppliedToken(raw) {
    const v = String(raw ?? "").trim().toLowerCase();
    if (v === "" || v === "null" || v === "undefined") return null;
    if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
    if (v === "0" || v === "false" || v === "no" || v === "off") return false;
    return null;
  }

  /**
   * Resolve VAT-on flag from stored meta.
   * true/false = explicit; otherwise infer from rate/amount.
   */
  function isTaxAppliedFromMeta(meta = {}) {
    if (meta.taxApplied === true) return true;
    if (meta.taxApplied === false) return false;
    const rate = normalizeTaxRate(meta.taxRate);
    const taxAmount = Number(meta.taxAmount);
    return rate > 0 || (Number.isFinite(taxAmount) && taxAmount > 0);
  }

  function calculateTaxBreakdown(amount, rateValue, modeValue, applied = true) {
    const inputAmount = Math.max(finiteMoney(amount), 0);
    const rate = applied ? normalizeTaxRate(rateValue) : 0;
    const mode = normalizeTaxMode(modeValue);
    if (!applied || rate <= 0 || inputAmount <= 0) {
      return {
        net: roundTaxMoney(inputAmount),
        tax: 0,
        total: roundTaxMoney(inputAmount),
        rate: 0,
        mode,
        applied: false,
      };
    }
    if (mode === TAX_MODE_INCLUDE) {
      const tax = (inputAmount * rate) / (100 + rate);
      const net = inputAmount - tax;
      return {
        net: roundTaxMoney(net),
        tax: roundTaxMoney(tax),
        total: roundTaxMoney(inputAmount),
        rate,
        mode,
        applied: true,
      };
    }
    const tax = (inputAmount * rate) / 100;
    return {
      net: roundTaxMoney(inputAmount),
      tax: roundTaxMoney(tax),
      total: roundTaxMoney(inputAmount + tax),
      rate,
      mode,
      applied: true,
    };
  }

  function calculateTaxBreakdownFromGross(totalValue, rateValue, modeValue, applied = true) {
    const total = Math.max(finiteMoney(totalValue), 0);
    const rate = applied ? normalizeTaxRate(rateValue) : 0;
    const mode = normalizeTaxMode(modeValue);
    if (!applied || rate <= 0 || total <= 0) {
      return {
        net: roundTaxMoney(total),
        tax: 0,
        total: roundTaxMoney(total),
        rate: 0,
        mode,
        applied: false,
      };
    }
    const tax = (total * rate) / (100 + rate);
    return {
      net: roundTaxMoney(total - tax),
      tax: roundTaxMoney(tax),
      total: roundTaxMoney(total),
      rate,
      mode,
      applied: true,
    };
  }

  function taxMetaFromBreakdown(breakdown) {
    return {
      taxApplied: !!breakdown.applied,
      taxRate: normalizeTaxRate(breakdown.rate),
      taxMode: normalizeTaxMode(breakdown.mode),
      taxAmount: roundTaxMoney(breakdown.tax),
      netAmount: roundTaxMoney(breakdown.net),
      grossAmount: roundTaxMoney(breakdown.total),
    };
  }

  function taxBreakdownFromMeta(meta = {}, totalValue = 0) {
    const total = Math.max(finiteMoney(totalValue || meta.grossAmount || 0), 0);
    const taxAmount = Number(meta.taxAmount);
    const netAmount = Number(meta.netAmount);
    const rate = normalizeTaxRate(meta.taxRate);
    const mode = normalizeTaxMode(meta.taxMode);
    const applied = isTaxAppliedFromMeta(meta);
    if (!applied) {
      return {
        net: roundTaxMoney(total),
        tax: 0,
        total: roundTaxMoney(total),
        rate: 0,
        mode,
        applied: false,
      };
    }
    if (Number.isFinite(taxAmount) || Number.isFinite(netAmount)) {
      return {
        net: roundTaxMoney(
          Number.isFinite(netAmount)
            ? netAmount
            : Math.max(total - (Number.isFinite(taxAmount) ? taxAmount : 0), 0)
        ),
        tax: roundTaxMoney(
          Number.isFinite(taxAmount)
            ? taxAmount
            : Math.max(total - (Number.isFinite(netAmount) ? netAmount : 0), 0)
        ),
        total: roundTaxMoney(total),
        rate,
        mode,
        applied: true,
      };
    }
    return calculateTaxBreakdownFromGross(total, rate, mode, true);
  }

  return {
    TAX_MODE_ADD,
    TAX_MODE_INCLUDE,
    normalizeTaxRate,
    normalizeTaxMode,
    roundTaxMoney,
    finiteMoney,
    parseVatAppliedToken,
    isTaxAppliedFromMeta,
    calculateTaxBreakdown,
    calculateTaxBreakdownFromGross,
    taxMetaFromBreakdown,
    taxBreakdownFromMeta,
  };
});
