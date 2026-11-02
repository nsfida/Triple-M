/**
 * Pure loan remaining / status helpers (browser + Node).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.TripleMLoanMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function finiteMoney(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function dateStamp(value) {
    if (!value) return 0;
    const str = String(value).trim();
    const normalized = str.length === 10 ? `${str}T23:59:59` : str;
    const time = new Date(normalized).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  /**
   * @param {{ principal?: object, loan_date?: string, notes?: string, actions?: object[] }} group
   */
  function calculateLoan(group) {
    const principal = Math.max(finiteMoney(group?.principal?.principal_amount), 0);
    const actions = (group?.actions || [])
      .slice()
      .sort((a, b) => {
        const ad = dateStamp(a.action_date);
        const bd = dateStamp(b.action_date);
        if (ad !== bd) return ad - bd;
        // Stable tie-break so same-day payments replay deterministically
        return String(a.id || "").localeCompare(String(b.id || ""));
      });

    let remaining = principal;
    const rows = [];

    rows.push({
      kind: "principal",
      date: group?.principal?.loan_date || group?.loan_date || "—",
      amount: principal,
      remainingAfter: principal,
      note: group?.principal?.notes || group?.notes || "—",
      entryId: group?.principal?.id || "",
    });

    for (const a of actions) {
      const pay = Math.max(finiteMoney(a.action_amount), 0);
      remaining = Math.max(remaining - pay, 0);
      rows.push({
        kind: a.entry_kind === "partial" ? "partial" : "full",
        date: a.action_date || "—",
        amount: pay,
        remainingAfter: remaining,
        note: a.notes || "—",
        entryId: a.id,
      });
    }

    const paid = Math.max(principal - remaining, 0);
    const status = remaining <= 0 ? "Closed" : paid > 0 ? "Partial" : "Open";
    return { principal, paid, remaining, status, rows };
  }

  return { dateStamp, finiteMoney, calculateLoan };
});
