/*
 * Reports tab.
 *
 * Period (month / quarter / year / custom) → everything below is calculated in the
 * browser from:
 *   - Received and Expenses rows (already loaded for the sheets),
 *   - saved daily reconciliations (collection_reports: bank POS / payment-link totals,
 *     charges, net settlement, differences),
 *   - card refunds (card_refunds),
 *   - daily cash counts.
 *
 * Sections: key figures with change vs the previous period, collections by channel,
 * receivable vs actually received (after bank charges and refunds), daily chart and table
 * (monthly when the period is long), Received by column (Rent, VAT, Salik…), Expenses by
 * category and type, refunds with customer notification, and data checks.
 * Downloads: PDF (jsPDF), Excel (SheetJS) and Print.
 */

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = cents => (Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = cents => {
  const value = Math.abs(cents / 100);
  const sign = cents < 0 ? '−' : '';
  if (value >= 1e6) return `${sign}${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e4) return `${sign}${(value / 1e3).toFixed(1)}k`;
  return `${sign}${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};
const dmy = iso => (iso ? iso.split('-').reverse().join('/') : '');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = n => String(n).padStart(2, '0');
const isoOf = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseIso = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, days) => { const date = parseIso(iso); date.setDate(date.getDate() + days); return isoOf(date); };
const daysIn = (from, to) => Math.round((parseIso(to) - parseIso(from)) / 86400000) + 1;
const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '—');
const toCents = value => Math.round((Number(value) || 0) * 100);

const CHANNELS = [
  { key: 'cash', label: 'Cash', color: '#c98a1a' },
  { key: 'card', label: 'Card (POS)', color: '#b5542c' },
  { key: 'link', label: 'Payment link', color: '#2b6fd6' },
  { key: 'bank', label: 'Bank transfer', color: '#126449' },
  { key: 'other', label: 'Other', color: '#8a94a6' }
];
const CHANNEL_OF = Object.fromEntries(CHANNELS.map(channel => [channel.key, channel]));

const PDF_SCRIPTS = ['./vendor/jspdf/jspdf.umd.min.js', './vendor/jspdf/jspdf.plugin.autotable.min.js'].map(path => new URL(path, import.meta.url).href);
let pdfLoading = null;
function loadPdfLibrary() {
  if (window.jspdf?.jsPDF?.API?.autoTable) return Promise.resolve(window.jspdf);
  if (!pdfLoading) {
    pdfLoading = PDF_SCRIPTS.reduce((chain, src) => chain.then(() => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('The PDF library could not be loaded.'));
      document.head.appendChild(script);
    })), Promise.resolve()).then(() => window.jspdf).catch(error => { pdfLoading = null; throw error; });
  }
  return pdfLoading;
}

export function createReports(app) {
  const pane = document.getElementById('reportsPane');
  let period = null;          // { from, to, label, preset }
  let data = null;            // computed figures
  let loading = false;
  let stale = true;
  let collectionsManaged = true;
  let refundsManaged = true;

  function presetPeriod(preset, base = null) {
    const today = parseIso(app.today());
    const y = today.getFullYear();
    const m = today.getMonth();
    if (preset === 'this-month') return { from: isoOf(new Date(y, m, 1)), to: isoOf(new Date(y, m + 1, 0)), label: `${MONTHS_LONG[m]} ${y}`, preset };
    if (preset === 'last-month') return { from: isoOf(new Date(y, m - 1, 1)), to: isoOf(new Date(y, m, 0)), label: `${MONTHS_LONG[(m + 11) % 12]} ${m === 0 ? y - 1 : y}`, preset };
    if (preset === 'quarter') { const q = Math.floor(m / 3); return { from: isoOf(new Date(y, q * 3, 1)), to: isoOf(new Date(y, q * 3 + 3, 0)), label: `Q${q + 1} ${y}`, preset }; }
    if (preset === 'year') return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Year ${y}`, preset };
    if (preset === 'last-30') return { from: addDays(isoOf(today), -29), to: isoOf(today), label: 'Last 30 days', preset };
    if (preset === 'month' && base) { const [yy, mm] = base.split('-').map(Number); return { from: isoOf(new Date(yy, mm - 1, 1)), to: isoOf(new Date(yy, mm, 0)), label: `${MONTHS_LONG[mm - 1]} ${yy}`, preset: 'month' }; }
    return null;
  }

  function customPeriod(from, to) {
    if (from > to) [from, to] = [to, from];
    return { from, to, label: `${dmy(from)} – ${dmy(to)}`, preset: 'custom' };
  }

  // ---- Calculation ----------------------------------------------------------------
  function channelOf(type) {
    const name = String(type || 'Cash');
    const map = app.collectionTypeMap();
    if (map.link && name === map.link) return 'link';
    if (map.card && name === map.card) return 'card';
    if (map.bank && name === map.bank) return 'bank';
    if (app.isCashType(name)) return 'cash';
    if (/link/i.test(name)) return 'link';
    if (/bank|transfer|cheque|check|wire/i.test(name)) return 'bank';
    if (/card|pos|visa|master|amex|debit|credit/i.test(name)) return 'card';
    return 'other';
  }

  function rowCents(row, fields) {
    return fields.reduce((sum, field) => sum + toCents(row[field]), 0);
  }

  function summarise(from, to, collections, refunds) {
    const inRange = date => date >= from && date <= to;
    const receivedFields = app.receivedColumns().map(([, field]) => field);
    const expenseFields = app.expenseColumns().map(([, field]) => field);
    const received = app.canViewReceived() ? app.receivedRows().filter(row => row.entry_date && inRange(row.entry_date) && rowCents(row, receivedFields) !== 0) : [];
    const expenses = app.canViewExpenses() ? app.expenseRows().filter(row => row.entry_date && inRange(row.entry_date) && rowCents(row, expenseFields) !== 0) : [];

    const channels = Object.fromEntries(CHANNELS.map(channel => [channel.key, { cents: 0, count: 0 }]));
    const byType = new Map();
    const byReceivedColumn = Object.fromEntries(receivedFields.map(field => [field, 0]));
    const days = new Map();
    const day = date => {
      if (!days.has(date)) days.set(date, { date, cash: 0, card: 0, link: 0, bank: 0, other: 0, received: 0, expenses: 0, expensesCash: 0, charges: 0, refunds: 0, recon: null });
      return days.get(date);
    };
    let receivedTotal = 0;
    received.forEach(row => {
      const cents = rowCents(row, receivedFields);
      const channel = channelOf(row.transaction_type);
      channels[channel].cents += cents;
      channels[channel].count += 1;
      receivedTotal += cents;
      const type = row.transaction_type || 'Cash';
      const entry = byType.get(type) || { type, channel, cents: 0, count: 0 };
      entry.cents += cents;
      entry.count += 1;
      byType.set(type, entry);
      receivedFields.forEach(field => { byReceivedColumn[field] += toCents(row[field]); });
      const d = day(row.entry_date);
      d[channel] += cents;
      d.received += cents;
    });

    let expensesTotal = 0;
    let expensesCash = 0;
    const byExpenseColumn = Object.fromEntries(expenseFields.map(field => [field, 0]));
    const byExpenseType = new Map();
    expenses.forEach(row => {
      const cents = rowCents(row, expenseFields);
      expensesTotal += cents;
      const cash = app.isCashType(row.transaction_type || 'Cash');
      if (cash) expensesCash += cents;
      expenseFields.forEach(field => { byExpenseColumn[field] += toCents(row[field]); });
      const type = row.transaction_type || 'Cash';
      const entry = byExpenseType.get(type) || { type, cents: 0, count: 0, cash };
      entry.cents += cents;
      entry.count += 1;
      byExpenseType.set(type, entry);
      const d = day(row.entry_date);
      d.expenses += cents;
      if (cash) d.expensesCash += cents;
    });

    // Saved reconciliations: charges, report totals, differences.
    const recon = { days: 0, linkFees: 0, posFees: 0, linkGross: 0, linkNet: 0, posSales: 0, posSalesNet: 0, posNet: 0, carNonCash: 0, carLink: 0, carCard: 0, carBank: 0, linkDiff: 0, posDiff: 0, diffDays: [], refundsInReports: 0 };
    collections.filter(item => inRange(item.report_date)).forEach(item => {
      const t = item.totals || {};
      recon.days += 1;
      recon.linkFees += t.linkFees || 0;
      recon.posFees += t.posFees || 0;
      recon.linkGross += t.linkReport || 0;
      recon.linkNet += t.linkNet || 0;
      recon.posSales += t.posReport || 0;
      recon.posSalesNet += t.posSalesNet ?? ((t.posReport || 0) - (t.posFees || 0));
      recon.posNet += t.posNet || 0;
      recon.carNonCash += t.nonCash || 0;
      recon.carLink += t.link || 0;
      recon.carCard += t.pos || 0;
      recon.carBank += t.bank || 0;
      recon.linkDiff += t.linkDiff || 0;
      recon.posDiff += t.posDiff || 0;
      recon.refundsInReports += t.refunds || 0;
      if ((t.linkDiff || 0) !== 0 || (t.posDiff || 0) !== 0 || (t.exceptions || 0) > 0) recon.diffDays.push(item.report_date);
      const d = day(item.report_date);
      d.charges += (t.linkFees || 0) + (t.posFees || 0);
      d.recon = { ok: !((t.linkDiff || 0) || (t.posDiff || 0) || (t.exceptions || 0)), diff: (t.linkDiff || 0) + (t.posDiff || 0), files: item.files || [] };
    });

    const refundList = refunds.filter(item => inRange(item.refund_date));
    let refundsCents = refundList.reduce((sum, item) => sum + toCents(item.amount), 0);
    let refundFees = refundList.reduce((sum, item) => sum + toCents(item.fee_returned), 0);
    refundList.forEach(item => { day(item.refund_date).refunds += toCents(item.amount); });
    if (!refundList.length && recon.refundsInReports) { refundsCents = recon.refundsInReports; refundFees = 0; }

    const nonCash = channels.card.cents + channels.link.cents + channels.bank.cents + channels.other.cents;
    const charges = recon.linkFees + recon.posFees;
    const netAfter = nonCash - charges - (refundsCents - refundFees);

    // Days with card / link money in Received but no saved reconciliation.
    const unreconciled = [...days.values()].filter(d => (d.card || d.link) && !d.recon).map(d => d.date).sort();
    const untold = refundList.filter(item => !item.emailed_at && !item.whatsapp_at);

    const cashCounts = app.cashCounts().filter(item => inRange(item.count_date));
    return {
      from, to,
      received, expenses,
      receivedTotal, expensesTotal, expensesCash,
      channels, byType: [...byType.values()].sort((a, b) => b.cents - a.cents),
      byReceivedColumn, byExpenseColumn, byExpenseType: [...byExpenseType.values()].sort((a, b) => b.cents - a.cents),
      days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      recon, refunds: refundList, refundsCents, refundFees,
      nonCash, charges, netAfter,
      unreconciled, untold, cashCounts
    };
  }

  async function load() {
    if (!period) period = presetPeriod('this-month');
    loading = true;
    render();
    try {
      await Promise.all([
        app.canViewExpenses() ? app.ensureExpensesLoaded().catch(() => {}) : null,
        app.canViewReceived() ? app.ensureReceivedLoaded().catch(() => {}) : null,
        app.ensureCashCountsLoaded?.().catch(() => {})
      ]);
      const length = daysIn(period.from, period.to);
      const previous = { from: addDays(period.from, -length), to: addDays(period.from, -1) };
      const [collections, refunds] = await Promise.all([
        app.canViewReceived() ? app.loadCollectionReports({ from: previous.from, to: period.to }).catch(() => ({ rows: [], managed: false })) : { rows: [], managed: true },
        app.loadRefunds({ from: previous.from, to: period.to }).catch(() => ({ rows: [], managed: false }))
      ]);
      collectionsManaged = collections.managed;
      refundsManaged = refunds.managed;
      data = summarise(period.from, period.to, collections.rows, refunds.rows);
      data.previous = summarise(previous.from, previous.to, collections.rows, refunds.rows);
      data.previousLabel = `${dmy(previous.from)} – ${dmy(previous.to)}`;
      stale = false;
    } catch (error) {
      app.showToast(`Reports could not be prepared: ${error?.message || error}`, true);
    } finally {
      loading = false;
      render();
    }
  }

  // ---- Rendering --------------------------------------------------------------------
  function delta(now, before, { invert = false } = {}) {
    if (!before && !now) return '';
    if (!before) return '<span class="rp-delta up">new</span>';
    const change = ((now - before) / Math.abs(before)) * 100;
    if (Math.abs(change) < 0.05) return '<span class="rp-delta flat">±0%</span>';
    const good = invert ? change < 0 : change > 0;
    return `<span class="rp-delta ${good ? 'up' : 'down'}" title="Previous period: ${money(before)}">${change > 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%</span>`;
  }

  function kpi(label, cents, note, { tone = '', prev = null, invert = false, sub = '' } = {}) {
    return `<div class="rp-kpi ${tone}"><span>${label}</span><strong>${money(cents)}</strong><small>${note}${prev != null ? ` ${delta(cents, prev, { invert })}` : ''}</small>${sub ? `<em>${sub}</em>` : ''}</div>`;
  }

  function chartSvg(days, monthly) {
    const series = monthly ? groupMonthly(days) : days;
    if (!series.length) return '<p class="rp-empty">Nothing received in this period.</p>';
    const width = 920;
    const height = 210;
    const left = 46;
    const bottom = 26;
    const top = 10;
    const max = Math.max(1, ...series.map(item => Math.max(CHANNELS.reduce((sum, channel) => sum + Math.max(0, item[channel.key]), 0), item.expenses)));
    const scale = (height - bottom - top) / max;
    const slot = (width - left - 8) / series.length;
    const barWidth = Math.max(3, Math.min(34, slot * 0.62));
    const ticks = 4;
    let svg = `<svg viewBox="0 0 ${width} ${height}" class="rp-chart" role="img" aria-label="Received per ${monthly ? 'month' : 'day'} by channel">`;
    for (let i = 0; i <= ticks; i += 1) {
      const value = (max / ticks) * i;
      const y = height - bottom - value * scale;
      svg += `<line x1="${left}" x2="${width - 4}" y1="${y}" y2="${y}" class="rp-grid"/><text x="${left - 6}" y="${y + 3}" class="rp-axis" text-anchor="end">${short(value)}</text>`;
    }
    const labelEvery = Math.ceil(series.length / 16);
    series.forEach((item, index) => {
      const x = left + slot * index + (slot - barWidth) / 2;
      let y = height - bottom;
      const tip = [`${monthly ? item.label : dmy(item.date)}`, ...CHANNELS.filter(channel => item[channel.key]).map(channel => `${channel.label}: ${money(item[channel.key])}`), `Received: ${money(item.received)}`, `Expenses: ${money(item.expenses)}`].join('\n');
      svg += `<g><title>${escapeHtml(tip)}</title>`;
      CHANNELS.forEach(channel => {
        const value = Math.max(0, item[channel.key]);
        if (!value) return;
        const h = value * scale;
        y -= h;
        svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(0.5, h)}" fill="${channel.color}" rx="1.5"/>`;
      });
      svg += `<rect x="${x}" y="${top}" width="${barWidth}" height="${height - bottom - top}" fill="transparent"/></g>`;
      if (item.expenses) {
        const ey = height - bottom - item.expenses * scale;
        svg += `<line x1="${x - 2}" x2="${x + barWidth + 2}" y1="${ey}" y2="${ey}" class="rp-exp-mark"><title>Expenses ${money(item.expenses)}</title></line>`;
      }
      if (index % labelEvery === 0) svg += `<text x="${x + barWidth / 2}" y="${height - 8}" class="rp-axis" text-anchor="middle">${monthly ? item.short : item.date.slice(8)}</text>`;
    });
    svg += '</svg>';
    return svg;
  }

  function groupMonthly(days) {
    const map = new Map();
    days.forEach(d => {
      const key = d.date.slice(0, 7);
      if (!map.has(key)) map.set(key, { key, label: `${MONTHS_LONG[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`, short: `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(2, 4)}`, cash: 0, card: 0, link: 0, bank: 0, other: 0, received: 0, expenses: 0, expensesCash: 0, charges: 0, refunds: 0, reconDays: 0, diffDays: 0 });
      const m = map.get(key);
      ['cash', 'card', 'link', 'bank', 'other', 'received', 'expenses', 'expensesCash', 'charges', 'refunds'].forEach(field => { m[field] += d[field]; });
      if (d.recon) { m.reconDays += 1; if (!d.recon.ok) m.diffDays += 1; }
    });
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  function bars(list, total, colorFor = () => '#126449') {
    return list.map(item => `<div class="rp-bar-row"><span class="rp-bar-label">${escapeHtml(item.label)}</span><span class="rp-bar"><i style="width:${total ? Math.max(0.5, (Math.abs(item.cents) / total) * 100) : 0}%;background:${colorFor(item)}"></i></span><span class="rp-bar-value">${money(item.cents)}</span><span class="rp-bar-pct">${pct(item.cents, total)}</span></div>`).join('');
  }

  function render() {
    if (!period) period = presetPeriod('this-month');
    const controls = `
      <div class="pane-heading rp-heading">
        <div>
          <p class="eyebrow">INSIGHTS</p>
          <h2>Reports</h2>
          <p class="muted heading-description">Collections, bank charges, refunds and expenses for any period. Calculated from your sheets and the saved daily reconciliations.</p>
        </div>
        <div class="rp-actions">
          <button class="button button-outline" type="button" data-rp="print">🖨 Print</button>
          <button class="button button-outline" type="button" data-rp="excel">⬇ Excel</button>
          <button class="button button-primary" type="button" data-rp="pdf">⬇ PDF report</button>
        </div>
      </div>
      <div class="rp-period">
        <div class="rp-month">
          <button type="button" class="rp-step" data-rp="prev" aria-label="Previous period">‹</button>
          <div class="rp-period-label"><strong>${escapeHtml(period.label)}</strong><small>${dmy(period.from)} – ${dmy(period.to)} · ${daysIn(period.from, period.to)} days</small></div>
          <button type="button" class="rp-step" data-rp="next" aria-label="Next period">›</button>
        </div>
        <div class="rp-presets">
          ${[['this-month', 'This month'], ['last-month', 'Last month'], ['last-30', 'Last 30 days'], ['quarter', 'This quarter'], ['year', 'This year']].map(([key, label]) => `<button type="button" data-preset="${key}" class="${period.preset === key ? 'on' : ''}">${label}</button>`).join('')}
        </div>
        <div class="rp-custom">
          <label><span>Month</span><input type="month" data-rp="month" value="${period.from.slice(0, 7)}"></label>
          <label><span>From</span><input type="date" data-rp="from" value="${period.from}"></label>
          <label><span>To</span><input type="date" data-rp="to" value="${period.to}"></label>
          <button type="button" class="sp-btn sp-btn-small" data-rp="apply">Apply</button>
        </div>
      </div>`;
    if (loading || !data) {
      pane.innerHTML = `${controls}<div class="rp-loading"><span class="rp-spinner"></span> Preparing the report…</div>`;
      return;
    }
    const d = data;
    const p = d.previous;
    const monthly = daysIn(d.from, d.to) > 62;
    const nonCashPrev = p.nonCash;
    const receivedColumns = app.receivedColumns().map(([label, field]) => ({ label, cents: d.byReceivedColumn[field] || 0 })).filter(item => item.cents).sort((a, b) => b.cents - a.cents);
    const expenseColumns = app.expenseColumns().map(([label, field]) => ({ label, cents: d.byExpenseColumn[field] || 0 })).filter(item => item.cents).sort((a, b) => b.cents - a.cents);
    const vat = d.byReceivedColumn.vat || 0;
    const channelRows = CHANNELS.filter(channel => d.channels[channel.key].count || channel.key !== 'other');
    const charges = { card: d.recon.posFees, link: d.recon.linkFees };
    const showReceived = app.canViewReceived();
    const showExpenses = app.canViewExpenses();
    const table = monthly ? groupMonthly(d.days) : d.days;
    const checks = [];
    if (showReceived && !collectionsManaged) checks.push({ tone: 'warn', text: 'Saved reconciliations are not available yet: run SQL migration 017 so bank charges and settlements appear here.' });
    if (!refundsManaged) checks.push({ tone: 'warn', text: 'Refund records are not available yet: run SQL migration 017.' });
    if (d.unreconciled.length) checks.push({ tone: 'warn', text: `${d.unreconciled.length} day${d.unreconciled.length === 1 ? '' : 's'} with card or link collections but no saved reconciliation: ${d.unreconciled.slice(0, 12).map(dmy).join(', ')}${d.unreconciled.length > 12 ? '…' : ''}. Import that day's three reports (or press Save in the Collections tab).` });
    if (d.recon.diffDays.length) checks.push({ tone: 'bad', text: `${d.recon.diffDays.length} reconciled day${d.recon.diffDays.length === 1 ? '' : 's'} with differences: ${d.recon.diffDays.map(dmy).join(', ')}.` });
    if (d.untold.length) checks.push({ tone: 'warn', text: `${d.untold.length} refund${d.untold.length === 1 ? '' : 's'} not yet communicated to the customer.` });
    if (d.channels.other.count) checks.push({ tone: 'info', text: `${d.channels.other.count} Received entr${d.channels.other.count === 1 ? 'y has' : 'ies have'} a type that is not cash, card, link or bank (${d.byType.filter(item => item.channel === 'other').map(item => item.type).join(', ')}).` });
    if (!checks.length) checks.push({ tone: 'ok', text: 'All good: every day with card or link collections is reconciled without differences, and every refund was communicated.' });

    pane.innerHTML = `${controls}
      <div class="rp-kpis">
        ${showReceived ? kpi('Total received', d.receivedTotal, `${d.received.length} entries`, { prev: p.receivedTotal, tone: 'green' }) : ''}
        ${showReceived ? kpi('Non-cash receivable', d.nonCash, `card ${short(d.channels.card.cents)} · link ${short(d.channels.link.cents)} · bank ${short(d.channels.bank.cents)}`, { prev: nonCashPrev }) : ''}
        ${showReceived ? kpi('Cash received', d.channels.cash.cents, `${d.channels.cash.count} entries`, { prev: p.channels.cash.cents }) : ''}
        ${showReceived ? kpi('Bank & link charges', d.charges, `${pct(d.charges, d.channels.card.cents + d.channels.link.cents)} of card + link · ${d.recon.days} reconciled day${d.recon.days === 1 ? '' : 's'}`, { tone: 'red', prev: p.charges, invert: true }) : ''}
        ${kpi('Card refunds', d.refundsCents, `${d.refunds.length || '—'} refund${d.refunds.length === 1 ? '' : 's'} · fees back ${short(d.refundFees)}`, { tone: 'red', prev: p.refundsCents, invert: true })}
        ${showReceived ? kpi('Actually received (net)', d.netAfter, 'non-cash − charges − refunds (net of fees back)', { tone: 'blue', prev: p.netAfter }) : ''}
        ${showExpenses ? kpi('Expenses', d.expensesTotal, `${d.expenses.length} entries · cash ${short(d.expensesCash)}`, { prev: p.expensesTotal, invert: true }) : ''}
        ${showReceived && showExpenses ? kpi('Net (received − expenses)', d.receivedTotal - d.expensesTotal, 'all types', { tone: d.receivedTotal - d.expensesTotal < 0 ? 'red' : 'green', prev: p.receivedTotal - p.expensesTotal }) : ''}
      </div>
      <p class="rp-compare">▲▼ compared with the previous period (${escapeHtml(d.previousLabel)}).</p>

      <div class="rp-checks">${checks.map(check => `<div class="rp-check ${check.tone}">${escapeHtml(check.text)}</div>`).join('')}</div>

      ${showReceived ? `
      <div class="rp-grid-2">
        <section class="rp-card">
          <header><h3>Collections by channel</h3><span>${d.received.length} entries</span></header>
          <table class="rp-table">
            <thead><tr><th>Channel</th><th class="num">Entries</th><th class="num">Received</th><th class="num">Share</th><th class="num">Charges</th><th class="num">Net</th></tr></thead>
            <tbody>
              ${channelRows.map(channel => { const c = d.channels[channel.key]; const fee = charges[channel.key] || 0; return `<tr><td><i class="rp-dot" style="background:${channel.color}"></i>${channel.label}</td><td class="num">${c.count}</td><td class="num">${money(c.cents)}</td><td class="num">${pct(c.cents, d.receivedTotal)}</td><td class="num">${fee ? `−${money(fee)}` : '—'}</td><td class="num">${money(c.cents - fee)}</td></tr>`; }).join('')}
              ${d.refundsCents ? `<tr class="rp-neg"><td><i class="rp-dot" style="background:#a3321f"></i>Card refunds</td><td class="num">${d.refunds.length || ''}</td><td class="num">−${money(d.refundsCents)}</td><td class="num"></td><td class="num">+${money(d.refundFees)}</td><td class="num">−${money(d.refundsCents - d.refundFees)}</td></tr>` : ''}
              <tr class="rp-total"><td>Total</td><td class="num">${d.received.length}</td><td class="num">${money(d.receivedTotal - d.refundsCents)}</td><td class="num"></td><td class="num">−${money(d.charges - d.refundFees)}</td><td class="num">${money(d.receivedTotal - d.refundsCents - d.charges + d.refundFees)}</td></tr>
            </tbody>
          </table>
          <div class="rp-share">${CHANNELS.map(channel => d.channels[channel.key].cents > 0 ? `<i style="width:${(d.channels[channel.key].cents / Math.max(1, d.receivedTotal)) * 100}%;background:${channel.color}" title="${channel.label} ${pct(d.channels[channel.key].cents, d.receivedTotal)}"></i>` : '').join('')}</div>
          <div class="rp-types">${d.byType.map(item => `<span><i class="rp-dot" style="background:${CHANNEL_OF[item.channel].color}"></i>${escapeHtml(item.type)} <b>${money(item.cents)}</b> <small>${item.count}</small></span>`).join('')}</div>
        </section>

        <section class="rp-card">
          <header><h3>Receivable vs actually received</h3><span>${d.recon.days} reconciled day${d.recon.days === 1 ? '' : 's'}</span></header>
          <dl class="rp-settle">
            <div><dt>Card + link + bank in Caryaati</dt><dd>${money(d.recon.carNonCash)}</dd></div>
            <div class="sub"><dt>Card machine sales (bank report)</dt><dd>${money(d.recon.posSales)}</dd></div>
            <div class="sub"><dt>Payment-link payments (provider report)</dt><dd>${money(d.recon.linkGross)}</dd></div>
            <div class="sub"><dt>Bank transfers</dt><dd>${money(d.recon.carBank)}</dd></div>
            <div class="${d.recon.posDiff || d.recon.linkDiff ? 'bad' : 'ok'}"><dt>Differences (card ${money(d.recon.posDiff)} · link ${money(d.recon.linkDiff)})</dt><dd>${money(d.recon.posDiff + d.recon.linkDiff)}</dd></div>
            <div class="neg"><dt>Card machine charges (commission + VAT)</dt><dd>−${money(d.recon.posFees)}</dd></div>
            <div class="neg"><dt>Payment-link charges</dt><dd>−${money(d.recon.linkFees)}</dd></div>
            <div class="neg"><dt>Card refunds paid (${d.refunds.length})</dt><dd>−${money(d.refundsCents)}</dd></div>
            <div class="pos"><dt>Fees returned on refunds</dt><dd>+${money(d.refundFees)}</dd></div>
            <div class="total"><dt>Expected into the bank</dt><dd>${money(d.recon.posSales + d.recon.linkGross + d.recon.carBank - d.recon.posFees - d.recon.linkFees - d.refundsCents + d.refundFees)}</dd></div>
            <div class="sub"><dt>Bank net payable (POS reports, after refunds)</dt><dd>${money(d.recon.posNet)}</dd></div>
            <div class="sub"><dt>Payment-link net</dt><dd>${money(d.recon.linkNet)}</dd></div>
            <div class="sub"><dt>Effective charge rate</dt><dd>${pct(d.recon.posFees + d.recon.linkFees, d.recon.posSales + d.recon.linkGross)}</dd></div>
          </dl>
          ${d.recon.days ? '' : '<p class="rp-empty">No saved reconciliations in this period yet. Import the daily Caryaati, payment-link and bank reports, then add (or Save) the collections.</p>'}
        </section>
      </div>

      <section class="rp-card">
        <header><h3>${monthly ? 'Monthly' : 'Daily'} received by channel</h3><span class="rp-legend">${CHANNELS.map(channel => `<i class="rp-dot" style="background:${channel.color}"></i>${channel.label}`).join('')}<i class="rp-dash"></i>Expenses</span></header>
        ${chartSvg(d.days, monthly)}
      </section>` : ''}

      <section class="rp-card">
        <header><h3>${monthly ? 'Month by month' : 'Day by day'}</h3><span>${table.length} ${monthly ? 'month' : 'day'}${table.length === 1 ? '' : 's'} with entries</span></header>
        <div class="rp-scroll"><table class="rp-table rp-daily">
          <thead><tr><th>${monthly ? 'Month' : 'Date'}</th>${showReceived ? '<th class="num">Cash</th><th class="num">Card</th><th class="num">Link</th><th class="num">Bank</th><th class="num">Other</th><th class="num">Received</th>' : ''}${showExpenses ? '<th class="num">Expenses</th>' : ''}${showReceived ? '<th class="num">Charges</th>' : ''}<th class="num">Refunds</th>${showReceived ? '<th>Reconciled</th>' : ''}</tr></thead>
          <tbody>${table.map(row => `<tr>
            <td>${monthly ? escapeHtml(row.label) : `${dmy(row.date)} <small>${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parseIso(row.date).getDay()]}</small>`}</td>
            ${showReceived ? `<td class="num">${row.cash ? money(row.cash) : ''}</td><td class="num">${row.card ? money(row.card) : ''}</td><td class="num">${row.link ? money(row.link) : ''}</td><td class="num">${row.bank ? money(row.bank) : ''}</td><td class="num">${row.other ? money(row.other) : ''}</td><td class="num strong">${row.received ? money(row.received) : ''}</td>` : ''}
            ${showExpenses ? `<td class="num">${row.expenses ? money(row.expenses) : ''}</td>` : ''}
            ${showReceived ? `<td class="num">${row.charges ? `−${money(row.charges)}` : ''}</td>` : ''}
            <td class="num">${row.refunds ? `−${money(row.refunds)}` : ''}</td>
            ${showReceived ? `<td>${monthly ? `${row.reconDays} day${row.reconDays === 1 ? '' : 's'}${row.diffDays ? ` <span class="rp-pill bad">${row.diffDays} diff</span>` : ''}` : row.recon ? (row.recon.ok ? '<span class="rp-pill ok">✓ matched</span>' : `<span class="rp-pill bad">diff ${money(row.recon.diff)}</span>`) : (row.card || row.link ? '<span class="rp-pill warn">not reconciled</span>' : '')}</td>` : ''}
          </tr>`).join('') || '<tr><td colspan="12" class="rp-empty">No entries in this period.</td></tr>'}</tbody>
          <tfoot><tr><td>Total</td>${showReceived ? `<td class="num">${money(d.channels.cash.cents)}</td><td class="num">${money(d.channels.card.cents)}</td><td class="num">${money(d.channels.link.cents)}</td><td class="num">${money(d.channels.bank.cents)}</td><td class="num">${money(d.channels.other.cents)}</td><td class="num">${money(d.receivedTotal)}</td>` : ''}${showExpenses ? `<td class="num">${money(d.expensesTotal)}</td>` : ''}${showReceived ? `<td class="num">−${money(d.charges)}</td>` : ''}<td class="num">−${money(d.refundsCents)}</td>${showReceived ? '<td></td>' : ''}</tr></tfoot>
        </table></div>
      </section>

      <div class="rp-grid-2">
        ${showReceived ? `<section class="rp-card">
          <header><h3>Received by column</h3><span>VAT collected ${money(vat)}</span></header>
          <div class="rp-bars">${bars(receivedColumns, d.receivedTotal, item => (item.label === 'VAT' ? '#7a3fc2' : '#126449'))}</div>
        </section>` : ''}
        ${showExpenses ? `<section class="rp-card">
          <header><h3>Expenses by category</h3><span>${money(d.expensesTotal)}</span></header>
          <div class="rp-bars">${bars(expenseColumns, d.expensesTotal, () => '#b5542c')}</div>
          <div class="rp-types">${d.byExpenseType.map(item => `<span><i class="rp-dot" style="background:${item.cash ? '#c98a1a' : '#5d6b82'}"></i>${escapeHtml(item.type)} <b>${money(item.cents)}</b> <small>${item.count}</small></span>`).join('')}</div>
        </section>` : ''}
      </div>

      <section class="rp-card">
        <header><h3>Card refunds</h3><span>${d.refunds.length} · ${money(d.refundsCents)}</span></header>
        ${d.refunds.length ? `<div class="rp-scroll"><table class="rp-table">
          <thead><tr><th>Refund date</th><th>Customer</th><th>Card</th><th>Original</th><th class="num">Amount</th><th class="num">Fee back</th><th>Reference</th><th>Customer told</th><th></th></tr></thead>
          <tbody>${d.refunds.map(item => `<tr>
            <td>${dmy(item.refund_date)}</td>
            <td><strong>${escapeHtml(item.customer_name || '—')}</strong>${item.contract_no ? `<small> CN ${escapeHtml(item.contract_no)}</small>` : ''}</td>
            <td>${escapeHtml(item.card_brand)} ****${escapeHtml(item.card_last4)}</td>
            <td>${dmy(item.original_date)}</td>
            <td class="num">${money(toCents(item.amount))}</td>
            <td class="num">${money(toCents(item.fee_returned))}</td>
            <td><small class="mono">ARN ${escapeHtml(item.arn)} · ${escapeHtml(item.auth_code)}</small></td>
            <td>${item.emailed_at || item.whatsapp_at ? `<span class="rp-pill ok">${[item.emailed_at && 'Email', item.whatsapp_at && 'WhatsApp'].filter(Boolean).join(' + ')}</span>` : '<span class="rp-pill warn">Not yet</span>'}</td>
            <td><button type="button" class="sp-btn sp-btn-small" data-notify="${escapeHtml(item.id)}">Notify</button></td>
          </tr>`).join('')}</tbody></table></div>` : `<p class="rp-empty">${refundsManaged ? 'No card refunds in this period.' : 'Run SQL migration 017 to keep refund records.'}</p>`}
      </section>
      <p class="rp-foot">Report for ${escapeHtml(app.getCompany().name)} · ${escapeHtml(period.label)} · created ${new Date().toLocaleString('en-GB')} · Amounts in AED.</p>`;
  }

  // ---- Downloads --------------------------------------------------------------------
  async function downloadPdf() {
    if (!data) return;
    const button = pane.querySelector('[data-rp="pdf"]');
    if (button) { button.disabled = true; button.textContent = 'Preparing PDF…'; }
    try {
      const { jsPDF } = await loadPdfLibrary();
      const d = data;
      const company = app.getCompany();
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const green = [18, 100, 73];
      const showReceived = app.canViewReceived();
      const showExpenses = app.canViewExpenses();
      const m = cents => money(cents);
      // Header band
      doc.setFillColor(...green);
      doc.rect(0, 0, W, 78, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.text(company.name || 'Expense Vault', 36, 34);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text([company.address, [company.phone, company.email].filter(Boolean).join('  ·  '), company.trn ? `TRN ${company.trn}` : ''].filter(Boolean), 36, 50);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Collections & Expenses Report', W - 36, 34, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text([`${period.label}  (${dmy(period.from)} – ${dmy(period.to)})`, `Created ${new Date().toLocaleString('en-GB')}`], W - 36, 50, { align: 'right' });
      doc.setTextColor(30, 40, 55);
      let y = 96;
      const section = title => {
        if (y > 740) { doc.addPage(); y = 50; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(...green);
        doc.text(plain(title), 36, y);
        doc.setTextColor(30, 40, 55);
        y += 8;
      };
      // Standard PDF fonts have no "−" (U+2212): use a plain hyphen-minus in the PDF.
      const plain = value => (typeof value === 'string' ? value.replace(/\u2212/g, '-') : value);
      const table = (head, rawBody, options = {}) => {
        const body = rawBody.map(row => row.map(plain));
        head = head.map(plain);
        doc.autoTable({
          startY: y, head: [head], body, margin: { left: 36, right: 36 },
          styles: { fontSize: 8.5, cellPadding: 4, lineColor: [228, 232, 240], lineWidth: 0.5 },
          headStyles: { fillColor: [240, 244, 248], textColor: [70, 80, 100], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [251, 252, 254] },
          columnStyles: options.columnStyles || {},
          didParseCell: cell => { if (options.totalRow && cell.section === 'body' && cell.row.index === body.length - 1) { cell.cell.styles.fontStyle = 'bold'; cell.cell.styles.fillColor = [236, 246, 241]; } if (cell.section === 'body' && typeof cell.cell.raw === 'string' && /^[−-]?[\d,]+\.\d{2}$|^[+−-]/.test(cell.cell.raw)) cell.cell.styles.halign = 'right'; },
          ...options.extra
        });
        y = doc.lastAutoTable.finalY + 20;
      };
      // Key figures
      section('Key figures');
      const k = [];
      if (showReceived) k.push(['Total received', m(d.receivedTotal), `${d.received.length} entries`], ['Non-cash receivable (card, link, bank)', m(d.nonCash), ''], ['Cash received', m(d.channels.cash.cents), `${d.channels.cash.count} entries`], ['Bank & payment-link charges', `−${m(d.charges)}`, `${pct(d.charges, d.channels.card.cents + d.channels.link.cents)} of card + link`]);
      k.push(['Card refunds', `−${m(d.refundsCents)}`, `${d.refunds.length} refunds · fees back ${m(d.refundFees)}`]);
      if (showReceived) k.push(['Actually received (net of charges & refunds)', m(d.netAfter), '']);
      if (showExpenses) k.push(['Expenses', m(d.expensesTotal), `${d.expenses.length} entries · cash ${m(d.expensesCash)}`]);
      if (showReceived && showExpenses) k.push(['Net (received − expenses)', m(d.receivedTotal - d.expensesTotal), '']);
      table(['Figure', 'AED', 'Notes'], k, { columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } } });
      if (showReceived) {
        section('Collections by channel');
        const rows = CHANNELS.filter(channel => d.channels[channel.key].count || channel.key !== 'other').map(channel => { const c = d.channels[channel.key]; const fee = channel.key === 'card' ? d.recon.posFees : channel.key === 'link' ? d.recon.linkFees : 0; return [channel.label, String(c.count), m(c.cents), pct(c.cents, d.receivedTotal), fee ? `−${m(fee)}` : '—', m(c.cents - fee)]; });
        if (d.refundsCents) rows.push(['Card refunds', String(d.refunds.length || ''), `−${m(d.refundsCents)}`, '', `+${m(d.refundFees)}`, `−${m(d.refundsCents - d.refundFees)}`]);
        rows.push(['Total', String(d.received.length), m(d.receivedTotal - d.refundsCents), '', `−${m(d.charges - d.refundFees)}`, m(d.receivedTotal - d.refundsCents - d.charges + d.refundFees)]);
        table(['Channel', 'Entries', 'Received', 'Share', 'Charges', 'Net'], rows, { totalRow: true, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } } });
        section(`Receivable vs actually received (${d.recon.days} reconciled days)`);
        table(['', 'AED'], [
          ['Card + link + bank transfers in Caryaati', m(d.recon.carNonCash)],
          ['   Card machine sales (bank report)', m(d.recon.posSales)],
          ['   Payment-link payments (provider report)', m(d.recon.linkGross)],
          ['   Bank transfers', m(d.recon.carBank)],
          ['Differences (card / link)', `${m(d.recon.posDiff)} / ${m(d.recon.linkDiff)}`],
          ['Less card machine charges', `−${m(d.recon.posFees)}`],
          ['Less payment-link charges', `−${m(d.recon.linkFees)}`],
          ['Less card refunds paid', `−${m(d.refundsCents)}`],
          ['Plus fees returned on refunds', `+${m(d.refundFees)}`],
          ['Expected into the bank', m(d.recon.posSales + d.recon.linkGross + d.recon.carBank - d.recon.posFees - d.recon.linkFees - d.refundsCents + d.refundFees)]
        ], { totalRow: true, columnStyles: { 1: { halign: 'right' } } });
      }
      const monthly = daysIn(d.from, d.to) > 62;
      const rowsTable = monthly ? groupMonthly(d.days) : d.days;
      section(monthly ? 'Month by month' : 'Day by day');
      const head = [monthly ? 'Month' : 'Date', ...(showReceived ? ['Cash', 'Card', 'Link', 'Bank', 'Received'] : []), ...(showExpenses ? ['Expenses'] : []), ...(showReceived ? ['Charges'] : []), 'Refunds', ...(showReceived ? ['Reconciled'] : [])];
      const blank = cents => (cents ? m(cents) : '');
      const body = rowsTable.map(row => [monthly ? row.label : dmy(row.date), ...(showReceived ? [blank(row.cash), blank(row.card), blank(row.link), blank(row.bank + row.other), blank(row.received)] : []), ...(showExpenses ? [blank(row.expenses)] : []), ...(showReceived ? [row.charges ? `−${m(row.charges)}` : ''] : []), row.refunds ? `−${m(row.refunds)}` : '', ...(showReceived ? [monthly ? `${row.reconDays} days` : row.recon ? (row.recon.ok ? 'Matched' : `Diff ${m(row.recon.diff)}`) : (row.card || row.link ? 'Not reconciled' : '')] : [])]);
      body.push(['Total', ...(showReceived ? [m(d.channels.cash.cents), m(d.channels.card.cents), m(d.channels.link.cents), m(d.channels.bank.cents + d.channels.other.cents), m(d.receivedTotal)] : []), ...(showExpenses ? [m(d.expensesTotal)] : []), ...(showReceived ? [`−${m(d.charges)}`] : []), `−${m(d.refundsCents)}`, ...(showReceived ? [''] : [])]);
      table(head, body, { totalRow: true, extra: { styles: { fontSize: 7.5, cellPadding: 3, lineColor: [228, 232, 240], lineWidth: 0.5 } } });
      if (showReceived) {
        section('Received by column');
        const cols = app.receivedColumns().map(([label, field]) => [label, d.byReceivedColumn[field] || 0]).filter(([, cents]) => cents).sort((a, b) => b[1] - a[1]);
        table(['Column', 'AED', 'Share'], [...cols.map(([label, cents]) => [label, m(cents), pct(cents, d.receivedTotal)]), ['Total', m(d.receivedTotal), '100%']], { totalRow: true, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } } });
      }
      if (showExpenses) {
        section('Expenses by category');
        const cols = app.expenseColumns().map(([label, field]) => [label, d.byExpenseColumn[field] || 0]).filter(([, cents]) => cents).sort((a, b) => b[1] - a[1]);
        table(['Category', 'AED', 'Share'], [...cols.map(([label, cents]) => [label, m(cents), pct(cents, d.expensesTotal)]), ['Total', m(d.expensesTotal), '100%']], { totalRow: true, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } } });
        section('Expenses by type');
        table(['Type', 'Entries', 'AED'], d.byExpenseType.map(item => [`${item.type}${item.cash ? ' (cash)' : ''}`, String(item.count), m(item.cents)]), { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } } });
      }
      if (d.refunds.length) {
        section('Card refunds');
        table(['Date', 'Customer', 'Card', 'Original', 'Amount', 'Fee back', 'ARN / auth', 'Told'], d.refunds.map(item => [dmy(item.refund_date), `${item.customer_name || '—'}${item.contract_no ? ` (CN ${item.contract_no})` : ''}`, `${item.card_brand} ****${item.card_last4}`, dmy(item.original_date), m(toCents(item.amount)), m(toCents(item.fee_returned)), `${item.arn} / ${item.auth_code}`, [item.emailed_at && 'Email', item.whatsapp_at && 'WhatsApp'].filter(Boolean).join(' + ') || 'No']), { extra: { styles: { fontSize: 7.5, cellPadding: 3 } }, columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } } });
      }
      // Footer on every page
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i += 1) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(130, 140, 155);
        doc.text(`${company.name} · ${period.label} · Amounts in AED`, 36, doc.internal.pageSize.getHeight() - 20);
        doc.text(`Page ${i} of ${pages}`, W - 36, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
      }
      doc.save(`Report_${period.from}_to_${period.to}.pdf`);
      app.showToast('PDF report downloaded.');
    } catch (error) {
      app.showToast(`The PDF could not be created: ${error?.message || error}`, true);
    } finally {
      if (button) { button.disabled = false; button.textContent = '⬇ PDF report'; }
    }
  }

  async function downloadExcel() {
    if (!data) return;
    try {
      const XLSX = await import(new URL('./vendor/sheetjs/xlsx.js', import.meta.url).href);
      const d = data;
      const a = cents => (cents ? Math.round(cents) / 100 : null);
      const book = XLSX.utils.book_new();
      const summary = [
        [app.getCompany().name], ['Report', period.label, `${dmy(period.from)} – ${dmy(period.to)}`], [],
        ['Total received', a(d.receivedTotal)], ['Non-cash receivable', a(d.nonCash)], ['Cash received', a(d.channels.cash.cents)],
        ['Bank & link charges', a(-d.charges)], ['Card refunds', a(-d.refundsCents)], ['Fees returned on refunds', a(d.refundFees)],
        ['Actually received (net)', a(d.netAfter)], ['Expenses', a(d.expensesTotal)], ['Net (received − expenses)', a(d.receivedTotal - d.expensesTotal)], [],
        ['Channel', 'Entries', 'Received', 'Charges', 'Net'],
        ...CHANNELS.map(channel => { const c = d.channels[channel.key]; const fee = channel.key === 'card' ? d.recon.posFees : channel.key === 'link' ? d.recon.linkFees : 0; return [channel.label, c.count, a(c.cents), a(-fee), a(c.cents - fee)]; })
      ];
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summary), 'Summary');
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Date', 'Cash', 'Card', 'Link', 'Bank', 'Other', 'Received', 'Expenses', 'Charges', 'Refunds', 'Reconciled'], ...d.days.map(row => [dmy(row.date), a(row.cash), a(row.card), a(row.link), a(row.bank), a(row.other), a(row.received), a(row.expenses), a(-row.charges), a(-row.refunds), row.recon ? (row.recon.ok ? 'Matched' : `Diff ${money(row.recon.diff)}`) : (row.card || row.link ? 'Not reconciled' : null)])]), 'Daily');
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Month', 'Cash', 'Card', 'Link', 'Bank', 'Other', 'Received', 'Expenses', 'Charges', 'Refunds'], ...groupMonthly(d.days).map(row => [row.label, a(row.cash), a(row.card), a(row.link), a(row.bank), a(row.other), a(row.received), a(row.expenses), a(-row.charges), a(-row.refunds)])]), 'Monthly');
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Received column', 'AED'], ...app.receivedColumns().map(([label, field]) => [label, a(d.byReceivedColumn[field])]), [], ['Expense category', 'AED'], ...app.expenseColumns().map(([label, field]) => [label, a(d.byExpenseColumn[field])])]), 'Columns');
      if (d.refunds.length) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Refund date', 'Customer', 'Contract', 'Card', 'Original date', 'Amount', 'Fee returned', 'Net', 'ARN', 'Auth', 'Email', 'Phone', 'Emailed', 'WhatsApp'], ...d.refunds.map(item => [dmy(item.refund_date), item.customer_name || null, item.contract_no || null, `${item.card_brand} ****${item.card_last4}`, dmy(item.original_date), Number(item.amount), Number(item.fee_returned), Number(item.net_amount), item.arn, item.auth_code, item.customer_email || null, item.customer_phone || null, item.emailed_at ? new Date(item.emailed_at).toLocaleString('en-GB') : null, item.whatsapp_at ? new Date(item.whatsapp_at).toLocaleString('en-GB') : null])]), 'Refunds');
      XLSX.writeFile(book, `Report_${period.from}_to_${period.to}.xlsx`);
    } catch (error) {
      app.showToast(`The Excel report could not be created: ${error?.message || error}`, true);
    }
  }

  // ---- Events -----------------------------------------------------------------------
  pane.addEventListener('click', event => {
    const preset = event.target.closest('[data-preset]');
    if (preset) { period = presetPeriod(preset.dataset.preset); load(); return; }
    const notify = event.target.closest('[data-notify]');
    if (notify) {
      const record = data?.refunds.find(item => item.id === notify.dataset.notify);
      if (record) app.messenger.open(record, { onUpdated: () => render() });
      return;
    }
    const action = event.target.closest('[data-rp]')?.dataset.rp;
    if (action === 'pdf') downloadPdf();
    else if (action === 'excel') downloadExcel();
    else if (action === 'print') window.print();
    else if (action === 'prev' || action === 'next') {
      const step = action === 'prev' ? -1 : 1;
      if (['this-month', 'last-month', 'month'].includes(period.preset) || (period.from.endsWith('-01') && addDays(period.to, 1).endsWith('-01') && daysIn(period.from, period.to) <= 31)) {
        const date = parseIso(period.from);
        date.setMonth(date.getMonth() + step);
        period = presetPeriod('month', isoOf(date).slice(0, 7));
      } else if (period.preset === 'year') {
        const year = Number(period.from.slice(0, 4)) + step;
        period = { from: `${year}-01-01`, to: `${year}-12-31`, label: `Year ${year}`, preset: 'year' };
      } else {
        const length = daysIn(period.from, period.to);
        period = customPeriod(addDays(period.from, step * length), addDays(period.to, step * length));
      }
      load();
    } else if (action === 'apply') {
      const from = pane.querySelector('[data-rp="from"]').value;
      const to = pane.querySelector('[data-rp="to"]').value;
      if (from && to) { period = customPeriod(from, to); load(); }
    }
  });
  pane.addEventListener('change', event => {
    if (event.target.matches('[data-rp="month"]') && event.target.value) { period = presetPeriod('month', event.target.value); load(); }
  });

  return {
    show() { load(); },
    invalidate() { stale = true; },
    refreshIfVisible() { if (!pane.classList.contains('hidden')) load(); else stale = true; }
  };
}
