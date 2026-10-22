/**
 * Triplem VIP Insurance financial calculations.
 * Pure helper shared by browser UI and Node tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TripleMInsuranceMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function number(value, label) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new TypeError(`${label || "Value"} must be a valid number.`);
    return n;
  }

  function calculateInsuranceFinancials(grossPremium, purchasePrice, salePrice) {
    const gross = number(grossPremium, "Gross Premium");
    const purchase = number(purchasePrice, "Purchase Price");
    const sale = number(salePrice, "Sale Price");
    if (gross < 0 || purchase < 0 || sale < 0) {
      throw new RangeError("Insurance prices cannot be negative.");
    }
    // Sale Price below Gross Premium is a Customer Discount. Sale Price above
    // Gross Premium is an Additional Charge (markup / service fee). The two are
    // mutually exclusive and never negative, so a markup is never shown as a
    // "negative discount" on invoices, receipts, reports or exports.
    const difference = sale - gross;
    return {
      grossPremium: gross,
      purchasePrice: purchase,
      salePrice: sale,
      companyCommission: gross - purchase,
      customerDiscount: difference < 0 ? -difference : 0,
      customerMarkup: difference > 0 ? difference : 0,
      actualProfit: sale - purchase,
      isLoss: sale < purchase,
      lossAmount: sale < purchase ? purchase - sale : 0
    };
  }

  return { calculateInsuranceFinancials };
});
