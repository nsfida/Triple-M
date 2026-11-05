"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const pdfSource = fs.readFileSync(path.join(root, "Assets/app/reports/01-pdf.js"), "utf8");

function loanPdfHelpersFor(entries) {
  const start = pdfSource.indexOf("function calculateLoanPdfSignedTotal(");
  const end = pdfSource.indexOf("async function downloadLoanTransactionsSelectionPDF(", start);
  assert.ok(start >= 0 && end > start, "loan PDF calculation helpers must be present");
  const source = pdfSource.slice(start, end);
  const sandbox = {
    state: { entries },
    dateStamp(value) {
      if (!value) return 0;
      const normalized = String(value).length === 10 ? `${value}T00:00:00Z` : String(value);
      const stamp = new Date(normalized).getTime();
      return Number.isFinite(stamp) ? stamp : 0;
    },
    formatPdfAmount(amount, currency) {
      const formatted = Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `${currency} ${formatted}`;
    }
  };
  vm.runInNewContext(source, sandbox, { filename: "loan-pdf-calculations.js" });
  return sandbox;
}

function ismailEntries(direction) {
  return [
    { id: `${direction}-given-800`, group_id: `${direction}-group-800`, direction, entry_kind: "principal", person_name: "Ismail", currency: "AED", principal_amount: 800, loan_date: "2026-01-01" },
    { id: `${direction}-received-800`, group_id: `${direction}-group-800`, direction, entry_kind: "full", person_name: "Ismail", currency: "AED", action_amount: 800, action_date: "2026-01-02" },
    { id: `${direction}-given-3000`, group_id: `${direction}-group-3000`, direction, entry_kind: "principal", person_name: "Ismail", currency: "AED", principal_amount: 3000, loan_date: "2026-01-03" },
    { id: `${direction}-returned-1500-a`, group_id: `${direction}-group-3000`, direction, entry_kind: "partial", person_name: "Ismail", currency: "AED", action_amount: 1500, action_date: "2026-01-04" },
    { id: `${direction}-returned-1500-b`, group_id: `${direction}-group-3000`, direction, entry_kind: "full", person_name: "Ismail", currency: "AED", action_amount: 1500, action_date: "2026-01-05" }
  ];
}

for (const direction of ["given", "taken"]) {
  test(`${direction}: signed loan rows and full statement running balance use principal plus repayments minus`, () => {
    const entries = ismailEntries(direction);
    const before = JSON.stringify(entries);
    const api = loanPdfHelpersFor(entries);
    const data = api.buildPersonPdfData("Ismail", direction);

    assert.ok(data);
    assert.deepEqual(
      JSON.parse(JSON.stringify(data.rows.map(row => ({ id: row.id, amount: row.amount, sign: row.sign, remainingAfter: row.remainingAfter })))),
      [
        { id: `${direction}-given-800`, amount: 800, sign: "+", remainingAfter: 800 },
        { id: `${direction}-received-800`, amount: -800, sign: "-", remainingAfter: 0 },
        { id: `${direction}-given-3000`, amount: 3000, sign: "+", remainingAfter: 3000 },
        { id: `${direction}-returned-1500-a`, amount: -1500, sign: "-", remainingAfter: 1500 },
        { id: `${direction}-returned-1500-b`, amount: -1500, sign: "-", remainingAfter: 0 }
      ]
    );
    assert.equal(data.signedTotal, 0);
    assert.equal(data.remaining, 0);
    assert.equal(JSON.stringify(entries), before, "building a statement must not mutate source records");
  });

  test(`${direction}: selecting all transactions matches the full statement signed total`, () => {
    const api = loanPdfHelpersFor(ismailEntries(direction));
    const data = api.buildPersonPdfData("Ismail", direction);
    const ids = data.rows.map(row => row.id);
    const selected = api.selectLoanPdfRows(data.rows, ids);
    assert.equal(api.calculateLoanPdfSignedTotal(selected), data.signedTotal);
    assert.equal(api.calculateLoanPdfSignedTotal(selected), 0);
  });

  test(`${direction}: Ismail selection excluding the 800 principal and 800 return totals zero`, () => {
    const api = loanPdfHelpersFor(ismailEntries(direction));
    const data = api.buildPersonPdfData("Ismail", direction);
    const selected = api.selectLoanPdfRows(data.rows, [
      `${direction}-given-3000`,
      `${direction}-returned-1500-a`,
      `${direction}-returned-1500-b`
    ]);
    assert.equal(api.calculateLoanPdfSignedTotal(selected), 0);
    assert.deepEqual(
      JSON.parse(JSON.stringify(selected.map(row => row.selectedBalanceAfter))),
      [3000, 1500, 0]
    );
  });

  test(`${direction}: one transaction retains its own sign`, () => {
    const api = loanPdfHelpersFor(ismailEntries(direction));
    const data = api.buildPersonPdfData("Ismail", direction);
    const onePrincipal = api.selectLoanPdfRows(data.rows, [`${direction}-given-3000`]);
    const oneReturn = api.selectLoanPdfRows(data.rows, [`${direction}-returned-1500-a`]);
    assert.equal(api.calculateLoanPdfSignedTotal(onePrincipal), 3000);
    assert.equal(api.calculateLoanPdfSignedTotal(oneReturn), -1500);
    assert.equal(onePrincipal[0].selectedBalanceAfter, 3000);
    assert.equal(oneReturn[0].selectedBalanceAfter, -1500);
  });

  test(`${direction}: returns-only selection is negative and empty selection stays empty`, () => {
    const api = loanPdfHelpersFor(ismailEntries(direction));
    const data = api.buildPersonPdfData("Ismail", direction);
    const returns = api.selectLoanPdfRows(data.rows, [
      `${direction}-received-800`,
      `${direction}-returned-1500-a`,
      `${direction}-returned-1500-b`
    ]);
    assert.equal(api.calculateLoanPdfSignedTotal(returns), -3800);
    assert.deepEqual(
      JSON.parse(JSON.stringify(returns.map(row => row.selectedBalanceAfter))),
      [-800, -2300, -3800]
    );
    assert.deepEqual(JSON.parse(JSON.stringify(api.selectLoanPdfRows(data.rows, []))), []);
    assert.deepEqual(JSON.parse(JSON.stringify(api.selectLoanPdfRows(data.rows, null))), []);
  });
}

test("loan PDF formatting explicitly prefixes transaction signs", () => {
  const api = loanPdfHelpersFor([]);
  assert.equal(api.formatLoanPdfSignedAmount(800, "AED", "+"), "+ AED 800.00");
  assert.equal(api.formatLoanPdfSignedAmount(-1500, "AED", "-"), "- AED 1,500.00");
});

test("both loan PDF exporters use shared signed totals and display signed transaction amounts", () => {
  assert.match(pdfSource, /const total = calculateLoanPdfSignedTotal\(rows\)/);
  assert.match(pdfSource, /const rows = selectLoanPdfRows\(data\.rows, selectedIds\)/);
  assert.match(pdfSource, /formatLoanPdfSignedAmount\(r\.amount, data\.currency, r\.sign\)/);
  assert.match(pdfSource, /formatLoanPdfSignedAmount\(r\.remainingAfter\)|formatMon\(r\.remainingAfter\)/);
  assert.match(pdfSource, /formatLoanPdfSignedAmount\(-data\.paidTotal, data\.currency, "-"\)/);
  assert.match(pdfSource, /head: \[\["Date","Type","Notes","Recorded","Amount","Balance"\]\]/);
});
