/*
 * Import panel → "Collections" (Received).
 *
 * Takes the day's Caryaati report (+ optional payment-link report and bank POS report),
 * shows the reconciliation, lets the user choose the Received payment type for each
 * channel (Link / Card / Bank transfer) and adds one Received entry per customer payment.
 * After adding, the reconciliation stays on screen, is saved as "last reconciliation"
 * and can be downloaded as Excel.
 */

import { reconcile, RECEIVED_COLUMN_LABELS } from './daily-reports.js?v=collections-1';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = cents => (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = iso => (iso ? iso.split('-').reverse().join('/') : '');
const SHEETJS_URL = new URL('./vendor/sheetjs/xlsx.js', import.meta.url).href;

const CHANNELS = {
  link: { label: 'Payment link', short: 'Link', guess: [/^link$/i, /payment\s*link/i, /\blink\b/i] },
  card: { label: 'Card machine (POS)', short: 'Card', guess: [/^card$/i, /^credit\s*card$/i, /^debit\s*card$/i, /card/i, /^pos$/i] },
  bank: { label: 'Bank transfer', short: 'Bank', guess: [/^bank$/i, /bank\s*transfer/i, /transfer/i, /bank/i] }
};
const STATUS = {
  matched: { label: 'Matched', css: 'ok' },
  unverified: { label: 'Not in these reports', css: 'grey' },
  unmatched: { label: 'Not found in bank / link', css: 'bad' },
  unknown: { label: 'Payment method unknown', css: 'warn' },
  imported: { label: 'Already in Received', css: 'grey' },
  old: { label: 'Before edit window', css: 'warn' }
};

export function createCollectionsImport(app, { section, footer }) {
  let reports = { caryaati: null, link: null, bank: null };
  let result = null;
  let include = new Map();       // entry key → ticked
  let filter = 'all';
  let useWorkDate = false;
  let phase = 'review';          // 'review' | 'done' | 'last'
  let snapshot = null;           // reconciliation shown in 'done' / 'last'
  let busy = false;
  let typeMap = loadTypeMap();

  function loadTypeMap() {
    try { return JSON.parse(localStorage.getItem(app.storageKey('collection-types')) || '{}') || {}; } catch (_) { return {}; }
  }
  function saveTypeMap() {
    try { localStorage.setItem(app.storageKey('collection-types'), JSON.stringify(typeMap)); } catch (_) { /* private mode */ }
  }

  // ---- Data ---------------------------------------------------------------------
  function addReport(kind, report) {
    const replaced = Boolean(reports[kind]);
    reports[kind] = report;
    phase = 'review';
    recompute();
    return replaced;
  }

  function recompute() {
    result = reports.caryaati ? reconcile(reports) : null;
    include = new Map();
    if (result) refreshStatuses(true);
  }

  // Duplicate / edit-window checks against the Received sheet as it is now.
  function refreshStatuses(resetTicks = false) {
    const existing = app.existingReceivedVouchers();
    const cutoff = app.editCutoffDate();
    result.entries.forEach(entry => {
      entry.uiStatus = entry.status;
      if (entry.vouchers.some(voucher => existing.has(voucher))) entry.uiStatus = 'imported';
      else if (entry.date && entry.date < cutoff && !useWorkDate) entry.uiStatus = 'old';
      if (resetTicks || !include.has(entry.key)) {
        include.set(entry.key, !['imported', 'old', 'unknown'].includes(entry.uiStatus));
      }
      if (['imported', 'old'].includes(entry.uiStatus)) include.set(entry.key, false);
    });
  }

  const ticked = () => result ? result.entries.filter(entry => include.get(entry.key) && !['imported', 'old'].includes(entry.uiStatus) && entry.channel !== 'unknown') : [];

  // Received payment type for each channel: remembered choice, else a sensible guess.
  function typeFor(channel) {
    const all = app.allTypes();
    const remembered = typeMap[channel];
    if (remembered && all.some(type => type.name === remembered)) return remembered;
    for (const pattern of CHANNELS[channel].guess) {
      const hit = all.find(type => pattern.test(type.name) && !(channel === 'card' && /link/i.test(type.name)) && !(channel === 'link' && !/link/i.test(type.name)));
      if (hit) return hit.name;
    }
    return '';
  }

  function channelsInUse() {
    return Object.keys(CHANNELS).filter(channel => ticked().some(entry => entry.channel === channel));
  }

  function typeProblems() {
    const problems = [];
    for (const channel of channelsInUse()) {
      const name = typeFor(channel);
      if (!name) problems.push(`Choose the Received type for ${CHANNELS[channel].label}.`);
      else if (app.isCashType(name)) problems.push(`“${name}” counts as cash. Choose a non-cash type for ${CHANNELS[channel].label}.`);
    }
    return problems;
  }

  function merchantText(entry) {
    const how = entry.channel === 'link' ? `Link ****${entry.last4 || '----'}`
      : entry.channel === 'card' ? `POS ****${entry.last4 || '----'}`
        : `Transfer ${entry.ref || ''}`.trim();
    return `CN ${entry.contract} · ${how} · ${entry.vouchers.join(', ')}`;
  }

  // ---- Snapshot (what the reconciliation report shows / saves / exports) ---------
  function buildSnapshot(addedCount = 0) {
    const entryOf = new Map(result.entries.filter(entry => entry.match).map(entry => [entry.match, entry]));
    const cash = app.receivedCashOn(result.date);
    return {
      savedAt: new Date().toISOString(),
      date: result.date,
      files: Object.values(reports).filter(Boolean).map(report => ({ kind: report.kind, fileName: report.fileName })),
      totals: result.totals,
      cash: { cents: result.cash.cents, vouchers: result.cash.vouchers.length, customers: result.cash.customers, sheetCents: cash.cents, sheetCount: cash.count },
      warnings: result.warnings,
      exceptions: result.exceptions.map(item => ({ title: item.title, detail: item.detail, severity: item.severity, cents: item.cents })),
      counts: {
        link: reports.link?.txns.length ?? null,
        linkMatched: result.link.matched.length,
        pos: reports.bank ? reports.bank.txns.filter(txn => !txn.voided).length : null,
        posMatched: result.pos.matched.length,
        voided: result.pos.voided.length
      },
      added: addedCount,
      types: Object.fromEntries(Object.keys(CHANNELS).map(channel => [channel, typeFor(channel)])),
      entries: result.entries.map(entry => ({
        date: entry.date, name: entry.name, contract: entry.contract, vouchers: entry.vouchers, channel: entry.channel,
        status: entry.uiStatus || entry.status, cents: entry.cents, last4: entry.last4, ref: entry.ref, columns: entry.columns,
        matchRef: entry.match ? (entry.match.source === 'link' ? `Link ${entry.match.rrn}` : `POS auth ${entry.match.auth}`) : '',
        notes: entry.notes, added: Boolean(entry.added)
      })),
      bank: reports.bank ? reports.bank.txns.map(txn => ({
        date: txn.date, card: txn.cardNo, type: txn.type, auth: txn.auth, arn: txn.arn, cents: txn.cents, netCents: txn.netCents,
        status: txn.voided ? 'voided' : entryOf.has(txn) ? 'matched' : 'unmatched',
        name: entryOf.get(txn)?.name || '', contract: entryOf.get(txn)?.contract || ''
      })) : [],
      link: reports.link ? reports.link.txns.map(txn => ({
        date: txn.date, order: txn.order, card: txn.cardNo, rrn: txn.rrn, cents: txn.cents, netCents: txn.netCents,
        status: entryOf.has(txn) ? 'matched' : 'unmatched', name: entryOf.get(txn)?.name || '', contract: entryOf.get(txn)?.contract || txn.contract
      })) : []
    };
  }

  function saveLast(snap) {
    try { localStorage.setItem(app.storageKey('last-reconciliation'), JSON.stringify(snap)); } catch (_) { /* too large / private */ }
  }

  function readLast() {
    try { return JSON.parse(localStorage.getItem(app.storageKey('last-reconciliation')) || 'null'); } catch (_) { return null; }
  }

  // ---- Rendering ------------------------------------------------------------------
  function statusPill(snap) {
    const issues = snap.exceptions.filter(item => item.severity === 'error').length;
    const diffs = ['linkDiff', 'posDiff'].filter(key => snap.totals[key] != null && snap.totals[key] !== 0).length;
    if (!issues && !diffs && snap.totals.linkReport != null && snap.totals.posReport != null) return '<span class="rc-pill ok">All matched</span>';
    if (issues || diffs) return `<span class="rc-pill bad">${issues + diffs} difference${issues + diffs === 1 ? '' : 's'}</span>`;
    return '<span class="rc-pill grey">Partly checked</span>';
  }

  function diffCell(diff) {
    if (diff == null) return '<td class="num muted">—</td>';
    if (diff === 0) return '<td class="num rc-ok">✓ 0.00</td>';
    return `<td class="num rc-bad">${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}</td>`;
  }

  function reconciliationHtml(snap) {
    const t = snap.totals;
    const cashDiff = snap.cash.sheetCents - snap.cash.cents;
    const settlement = (t.linkNet ?? 0) + (t.posNet ?? 0);
    const reportSum = t.linkReport != null && t.posReport != null ? t.linkReport + t.posReport + t.bank : null;
    return `
      <div class="rc-card">
        <div class="rc-head"><div><strong>Collections · ${escapeHtml(dmy(snap.date))}</strong><small>${snap.files.map(file => escapeHtml(file.fileName)).join(' · ')}</small></div>${statusPill(snap)}</div>
        <table class="rc-table">
          <thead><tr><th>Channel</th><th class="num">Caryaati</th><th class="num">Report</th><th class="num">Diff</th></tr></thead>
          <tbody>
            <tr><td>Payment link<small>${snap.counts.link == null ? 'link report not uploaded' : `${snap.counts.linkMatched} of ${snap.counts.link} payments identified`}</small></td><td class="num">${money(t.link)}</td><td class="num">${t.linkReport == null ? '—' : money(t.linkReport)}</td>${diffCell(t.linkDiff)}</tr>
            <tr><td>Card machine (POS)<small>${snap.counts.pos == null ? 'bank report not uploaded' : `${snap.counts.posMatched} of ${snap.counts.pos} transactions matched${snap.counts.voided ? ` · ${snap.counts.voided} voided` : ''}`}</small></td><td class="num">${money(t.pos)}</td><td class="num">${t.posReport == null ? '—' : money(t.posReport)}</td>${diffCell(t.posDiff)}</tr>
            <tr><td>Bank transfer<small>not in these reports: check the bank statement</small></td><td class="num">${money(t.bank)}</td><td class="num muted">—</td><td class="num muted">—</td></tr>
            ${t.unknown ? `<tr><td>Unknown method</td><td class="num">${money(t.unknown)}</td><td class="num muted">—</td><td class="num muted">—</td></tr>` : ''}
            <tr class="rc-total"><td>Total non-cash<small>link + POS + bank transfer</small></td><td class="num">${money(t.nonCash)}</td><td class="num">${reportSum == null ? '—' : money(reportSum)}</td>${diffCell(reportSum == null ? null : t.nonCash - reportSum)}</tr>
          </tbody>
        </table>
        <div class="rc-grid">
          <div><span>Cash in Caryaati</span><strong>${money(snap.cash.cents)}</strong><small>not imported · entered manually</small></div>
          <div class="${cashDiff === 0 ? 'ok' : 'warn'}"><span>Cash in Received ${escapeHtml(dmy(snap.date))}</span><strong>${money(snap.cash.sheetCents)}</strong><small>${cashDiff === 0 ? '✓ matches Caryaati' : `${cashDiff > 0 ? '+' : '−'}${money(Math.abs(cashDiff))} vs Caryaati`} · ${snap.cash.sheetCount} row${snap.cash.sheetCount === 1 ? '' : 's'}</small></div>
          ${t.linkFees != null ? `<div><span>Link fees</span><strong>${money(t.linkFees)}</strong><small>net ${money(t.linkNet)}</small></div>` : ''}
          ${t.posFees != null ? `<div><span>POS fees</span><strong>${money(t.posFees)}</strong><small>net payable ${money(t.posNet)}</small></div>` : ''}
          ${t.linkNet != null || t.posNet != null ? `<div class="rc-wide"><span>Expected card settlement (net)</span><strong>${money(settlement)}</strong><small>link net + POS net payable${t.linkNet == null || t.posNet == null ? ' (one report missing)' : ''}</small></div>` : ''}
        </div>
        ${snap.warnings.length ? `<ul class="rc-notes">${snap.warnings.map(text => `<li>${escapeHtml(text)}</li>`).join('')}</ul>` : ''}
        ${snap.exceptions.length ? `<div class="rc-exceptions"><strong>Needs attention (${snap.exceptions.length})</strong>${snap.exceptions.map(item => `<div class="rc-ex ${item.severity}"><span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.detail)}</small></div>`).join('')}</div>` : ''}
      </div>`;
  }

  function typeSelectHtml(channel) {
    const selected = typeFor(channel);
    const received = app.receivedTypes().map(type => type.name);
    const all = app.allTypes();
    const options = all.map(type => {
      const note = app.isCashType(type.name) ? ' (cash)' : received.includes(type.name) ? '' : ' (not in Received list yet)';
      return `<option value="${escapeHtml(type.name)}" ${type.name === selected ? 'selected' : ''}>${escapeHtml(type.name + note)}</option>`;
    }).join('');
    const missingLink = channel === 'link' && !all.some(type => /link/i.test(type.name));
    return `<div class="cl-type-row">
        <span>${CHANNELS[channel].label}</span>
        <select data-channel="${channel}"><option value="" ${selected ? '' : 'selected'}>Choose…</option>${options}</select>
        ${missingLink && app.canManageTypes() ? '<button class="sp-btn sp-btn-small" type="button" data-action="create-link-type">+ Create “Link”</button>' : ''}
      </div>`;
  }

  function columnsText(columns) {
    return Object.entries(columns).filter(([, cents]) => cents).map(([field, cents]) => `${RECEIVED_COLUMN_LABELS[field] || field} ${money(cents)}`).join(' · ');
  }

  function entryRowHtml(entry) {
    const status = STATUS[entry.uiStatus] || STATUS.matched;
    const canTick = !['imported', 'old'].includes(entry.uiStatus) && entry.channel !== 'unknown';
    const channel = entry.channel === 'unknown' ? '?' : CHANNELS[entry.channel].short;
    const matchText = entry.match ? (entry.match.source === 'link' ? `link ${entry.match.order || entry.match.rrn}` : `POS auth ${entry.match.auth}`) : '';
    return `<tr class="cl-${status.css}">
      <td class="ri-check"><input type="checkbox" data-key="${escapeHtml(entry.key)}" ${include.get(entry.key) && canTick ? 'checked' : ''} ${canTick ? '' : 'disabled'} aria-label="Add ${escapeHtml(entry.name)}"></td>
      <td><strong class="cl-name">${escapeHtml(entry.name)}</strong>
        <div class="ri-sub">CN ${escapeHtml(entry.contract)} · ${escapeHtml(entry.vouchers.join(', '))}${entry.last4 ? ` · ****${escapeHtml(entry.last4)}` : ''}${entry.ref ? ` · ref ${escapeHtml(entry.ref)}` : ''}</div>
        <div class="ri-sub">${escapeHtml(columnsText(entry.columns))}</div>
        ${entry.notes.length || entry.others.length ? `<div class="ri-sub ri-note">${[...entry.notes, ...entry.others.map(text => `OTHERS: ${text}`)].map(escapeHtml).join('<br>')}</div>` : ''}</td>
      <td class="num"><span class="strong">${money(entry.cents)}</span>
        <div><span class="cl-chan cl-chan-${entry.channel}">${channel}</span></div>
        <div><span class="ri-pill cl-st-${status.css}">${status.label}</span></div>
        ${matchText ? `<div class="ri-sub">${escapeHtml(matchText)}</div>` : ''}</td>
    </tr>`;
  }

  function render() {
    if (phase === 'done' || phase === 'last') { renderReport(); return; }
    if (!result) {
      const pending = Object.entries(reports).filter(([, report]) => report).map(([kind]) => kind);
      section.innerHTML = pending.length
        ? `<p class="ap-note ap-note-warn">Add the <strong>Caryaati</strong> report for the day as well: Received entries are made from it. The ${pending.map(kind => kind === 'link' ? 'payment-link' : 'bank POS').join(' and ')} report${pending.length > 1 ? 's are' : ' is'} used to check it.</p>`
        : '';
      renderFooter();
      return;
    }
    refreshStatuses();
    const counts = { all: result.entries.length };
    ['link', 'card', 'bank'].forEach(channel => { counts[channel] = result.entries.filter(entry => entry.channel === channel).length; });
    counts.issues = result.entries.filter(entry => !['matched', 'unverified'].includes(entry.uiStatus)).length;
    const shown = result.entries.filter(entry => filter === 'all' ? true : filter === 'issues' ? !['matched', 'unverified'].includes(entry.uiStatus) : entry.channel === filter);
    const oldCount = result.entries.filter(entry => entry.date && entry.date < app.editCutoffDate()).length;
    const snap = buildSnapshot();

    section.innerHTML = `
      ${reconciliationHtml(snap)}
      <div class="sp-toolbar ap-tight"><span class="sp-section-label">RECEIVED TYPE FOR EACH CHANNEL</span></div>
      <div class="cl-types">${Object.keys(CHANNELS).map(typeSelectHtml).join('')}</div>
      <p class="ri-hint">Cash postings are not imported: you enter cash yourself when it is received.</p>
      ${oldCount ? `<label class="ri-old"><input type="checkbox" data-action="use-work-date" ${useWorkDate ? 'checked' : ''}> <span>${oldCount} entr${oldCount === 1 ? 'y is' : 'ies are'} dated before ${escapeHtml(dmy(app.editCutoffDate()))} (outside the edit window). Enter ${oldCount === 1 ? 'it' : 'them'} on the working date (${escapeHtml(dmy(app.workDate()))}) instead</span></label>` : ''}
      <div class="sp-toolbar ap-tight"><span class="sp-section-label">ENTRIES FROM CARYAATI</span>
        <span class="cl-bulk"><button type="button" class="sp-btn-link" data-action="tick-all">Tick all</button> · <button type="button" class="sp-btn-link" data-action="tick-none">None</button></span></div>
      <div class="cl-filters">${[['all', 'All'], ['link', 'Link'], ['card', 'Card'], ['bank', 'Bank'], ['issues', 'Issues']].map(([key, label]) => `<button type="button" class="cl-filter ${filter === key ? 'on' : ''}" data-filter="${key}">${label} <span>${counts[key]}</span></button>`).join('')}</div>
      <div class="ri-table-wrap ri-entries-wrap cl-entries">
        <table class="ri-table"><thead><tr><th></th><th>Customer · contract · vouchers</th><th class="num">Amount</th></tr></thead>
        <tbody>${shown.map(entryRowHtml).join('') || '<tr><td colspan="3" class="ri-empty">Nothing in this view.</td></tr>'}</tbody></table>
      </div>`;
    renderFooter();
  }

  function renderReport() {
    const snap = snapshot;
    if (!snap) { section.innerHTML = ''; renderFooter(); return; }
    section.innerHTML = `
      ${phase === 'done'
        ? `<div class="cl-done"><strong>✓ ${snap.added} entr${snap.added === 1 ? 'y' : 'ies'} added to Received</strong><small>Saving automatically. Link → ${escapeHtml(snap.types.link || '—')} · Card → ${escapeHtml(snap.types.card || '—')} · Bank transfer → ${escapeHtml(snap.types.bank || '—')}</small></div>`
        : `<p class="ap-note">Last reconciliation, saved ${escapeHtml(new Date(snap.savedAt).toLocaleString('en-GB'))}${snap.added ? ` · ${snap.added} entries were added` : ''}.</p>`}
      ${reconciliationHtml(snap)}
      <div class="sp-toolbar ap-tight"><span class="sp-section-label">BANK POS · ${snap.bank.length}</span></div>
      ${snap.bank.length ? `<div class="ri-table-wrap"><table class="ri-table"><tbody>${snap.bank.map(txn => `<tr class="cl-${txn.status === 'matched' ? 'ok' : txn.status === 'voided' ? 'grey' : 'bad'}"><td><span class="mono">${escapeHtml(txn.card)}</span><div class="ri-sub">${escapeHtml(txn.type)} · auth ${escapeHtml(txn.auth)}${txn.name ? ` · ${escapeHtml(txn.name)} · CN ${escapeHtml(txn.contract)}` : ''}</div></td><td class="num"><span class="strong">${money(txn.cents)}</span><div><span class="ri-pill cl-st-${txn.status === 'matched' ? 'ok' : txn.status === 'voided' ? 'grey' : 'bad'}">${txn.status === 'matched' ? 'Matched' : txn.status === 'voided' ? 'Voided' : 'Not in Caryaati'}</span></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="ri-hint">Bank POS report not added.</p>'}
      <div class="sp-toolbar ap-tight"><span class="sp-section-label">PAYMENT LINK · ${snap.link.length}</span></div>
      ${snap.link.length ? `<div class="ri-table-wrap"><table class="ri-table"><tbody>${snap.link.map(txn => `<tr class="cl-${txn.status === 'matched' ? 'ok' : 'bad'}"><td>${escapeHtml(txn.order || txn.rrn)}<div class="ri-sub"><span class="mono">${escapeHtml(txn.card)}</span> · ${escapeHtml(dmy(txn.date))}${txn.name ? ` · ${escapeHtml(txn.name)}` : ''}</div></td><td class="num"><span class="strong">${money(txn.cents)}</span><div><span class="ri-pill cl-st-${txn.status === 'matched' ? 'ok' : 'bad'}">${txn.status === 'matched' ? 'Matched' : 'Not in Caryaati'}</span></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="ri-hint">Payment-link report not added.</p>'}`;
    renderFooter();
  }

  // Footer: summary + buttons for the current phase.
  function renderFooter() {
    const summary = footer.querySelector('[data-role="summary"]');
    const message = footer.querySelector('[data-role="message"]');
    const actions = footer.querySelector('[data-role="actions"]');
    if (phase === 'done' || phase === 'last') {
      summary.textContent = snapshot ? `Collections ${dmy(snapshot.date)} · non-cash AED ${money(snapshot.totals.nonCash)}` : '';
      message.textContent = '';
      actions.innerHTML = `<button class="sp-btn" type="button" data-action="download">⬇ Reconciliation (Excel)</button>${phase === 'done' ? '<button class="sp-btn" type="button" data-action="open-received">Open Received</button>' : '<button class="sp-btn" type="button" data-action="back-review">Back</button>'}<button class="sp-btn sp-btn-primary" type="button" data-action="close">Done</button>`;
      return;
    }
    if (!result) {
      summary.textContent = '';
      message.textContent = '';
      const last = readLast();
      actions.innerHTML = last ? `<button class="sp-btn" type="button" data-action="show-last">View last reconciliation (${escapeHtml(dmy(last.date))})</button>` : '';
      return;
    }
    const chosen = ticked();
    const total = chosen.reduce((sum, entry) => sum + entry.cents, 0);
    summary.textContent = `${chosen.length} of ${result.entries.length} entries · AED ${money(total)}`;
    const problems = typeProblems();
    message.textContent = busy ? 'Adding entries…' : (!app.canAddReceived() ? 'Your access does not include editing Received.' : problems[0] || '');
    const disabled = busy || !chosen.length || problems.length || !app.canAddReceived();
    actions.innerHTML = `<button class="sp-btn" type="button" data-action="download">⬇ Excel</button><button class="sp-btn sp-btn-primary" type="button" data-action="add" ${disabled ? 'disabled' : ''}>Add ${chosen.length} entr${chosen.length === 1 ? 'y' : 'ies'} to Received</button>`;
  }

  // ---- Actions --------------------------------------------------------------------
  async function addEntries() {
    if (busy) return;
    busy = true;
    renderFooter();
    try {
      await app.ensureReceivedLoaded();
      refreshStatuses();
      const chosen = ticked();
      if (!chosen.length) { app.showToast('Nothing to add: the ticked entries are already in Received.', true); return; }
      if (typeProblems().length) return;
      // Make sure each chosen type is offered in the Received TYPE list.
      for (const channel of channelsInUse()) {
        const name = typeFor(channel);
        if (!app.receivedTypes().some(type => type.name === name) && app.canManageTypes()) await app.enableTypeForReceived(name);
      }
      const rows = chosen.map(entry => ({
        entry_date: entry.uiStatus === 'old' || (useWorkDate && entry.date < app.editCutoffDate()) ? app.workDate() : entry.date,
        name: entry.name,
        merchant: merchantText(entry),
        transaction_type: typeFor(entry.channel),
        amounts: entry.columns
      }));
      if (rows.some(row => !app.isDateEditable(row.entry_date))) {
        app.showToast('Some entries are dated before the edit window. Tick the working-date option or untick them.', true);
        return;
      }
      const added = app.addReceivedEntries(rows);
      chosen.forEach(entry => { entry.added = true; });
      snapshot = buildSnapshot(added);
      saveLast(snapshot);
      phase = 'done';
      app.showToast(`Added ${added} Received entr${added === 1 ? 'y' : 'ies'} (AED ${money(chosen.reduce((sum, entry) => sum + entry.cents, 0))}). Saving automatically.`);
    } catch (error) {
      app.showToast(error?.message || 'The entries could not be added.', true);
    } finally {
      busy = false;
      render();
    }
  }

  async function download() {
    const snap = phase === 'review' ? buildSnapshot() : snapshot;
    if (!snap) return;
    try {
      const XLSX = await import(SHEETJS_URL);
      const book = XLSX.utils.book_new();
      const t = snap.totals;
      const amount = cents => cents == null ? '' : Math.round(cents) / 100;
      const summary = [
        ['Collections reconciliation', dmy(snap.date)],
        ['Files', snap.files.map(file => file.fileName).join(', ')],
        [],
        ['Channel', 'Caryaati', 'Report', 'Difference', 'Details'],
        ['Payment link', amount(t.link), amount(t.linkReport), amount(t.linkDiff), snap.counts.link == null ? 'Link report not uploaded' : `${snap.counts.linkMatched} of ${snap.counts.link} identified`],
        ['Card machine (POS)', amount(t.pos), amount(t.posReport), amount(t.posDiff), snap.counts.pos == null ? 'Bank report not uploaded' : `${snap.counts.posMatched} of ${snap.counts.pos} matched, ${snap.counts.voided} voided`],
        ['Bank transfer', amount(t.bank), '', '', 'Check with bank statement'],
        ['Total non-cash', amount(t.nonCash), t.linkReport != null && t.posReport != null ? amount(t.linkReport + t.posReport + t.bank) : '', t.linkReport != null && t.posReport != null ? amount(t.nonCash - t.linkReport - t.posReport - t.bank) : '', 'Bank transfers counted on both sides'],
        [],
        ['Cash in Caryaati (not imported)', amount(snap.cash.cents)],
        ['Cash in Received sheet', amount(snap.cash.sheetCents), '', amount(snap.cash.sheetCents - snap.cash.cents), `${snap.cash.sheetCount} rows`],
        ['Link fees', amount(t.linkFees), 'Link net', amount(t.linkNet)],
        ['POS fees', amount(t.posFees), 'POS net payable', amount(t.posNet)],
        [],
        ['Warnings'], ...snap.warnings.map(text => [text]),
        [],
        ['Needs attention'], ...snap.exceptions.map(item => [item.title, item.detail])
      ];
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summary), 'Summary');
      const fields = Object.keys(RECEIVED_COLUMN_LABELS);
      const entries = [['Date', 'Customer', 'Contract', 'Vouchers', 'Channel', 'Status', 'Card', 'Ref', 'Matched to', 'Added', 'Amount', ...fields.map(field => RECEIVED_COLUMN_LABELS[field]), 'Notes'],
        ...snap.entries.map(entry => [dmy(entry.date), entry.name, entry.contract, entry.vouchers.join(', '), entry.channel, entry.status, entry.last4 ? `****${entry.last4}` : '', entry.ref, entry.matchRef, entry.added ? 'Yes' : '', amount(entry.cents), ...fields.map(field => entry.columns[field] ? amount(entry.columns[field]) : ''), entry.notes.join(' ')])];
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(entries), 'Entries');
      if (snap.bank.length) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Date', 'Card', 'Type', 'Auth', 'ARN', 'Amount', 'Net', 'Status', 'Customer', 'Contract'], ...snap.bank.map(txn => [dmy(txn.date), txn.card, txn.type, txn.auth, txn.arn, amount(txn.cents), amount(txn.netCents), txn.status, txn.name, txn.contract])]), 'Bank POS');
      if (snap.link.length) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Date', 'Order', 'Card', 'RRN', 'Amount', 'Net', 'Status', 'Customer', 'Contract'], ...snap.link.map(txn => [dmy(txn.date), txn.order, txn.card, txn.rrn, amount(txn.cents), amount(txn.netCents), txn.status, txn.name, txn.contract])]), 'Payment link');
      XLSX.writeFile(book, `Reconciliation_${snap.date || 'collections'}.xlsx`);
    } catch (error) {
      app.showToast(`The Excel file could not be created: ${error?.message || error}`, true);
    }
  }

  function onClick(event) {
    const target = event.target.closest('[data-action], [data-filter]');
    if (!target) return;
    if (target.dataset.filter) { filter = target.dataset.filter; render(); return; }
    const action = target.dataset.action;
    if (action === 'add') addEntries();
    else if (action === 'download') download();
    else if (action === 'tick-all' || action === 'tick-none') {
      result.entries.forEach(entry => include.set(entry.key, action === 'tick-all' && !['imported', 'old', 'unknown'].includes(entry.uiStatus)));
      render();
    } else if (action === 'create-link-type') {
      app.addPaymentType('Link').then(() => { typeMap.link = 'Link'; saveTypeMap(); render(); app.showToast('“Link” type created for Expenses and Received.'); })
        .catch(error => app.showToast(error?.message || 'The type could not be created.', true));
    } else if (action === 'show-last') { snapshot = readLast(); phase = 'last'; render(); }
    else if (action === 'back-review') { phase = 'review'; render(); }
    else if (action === 'open-received') { app.close(); app.openReceived(); }
    else if (action === 'close') app.close();
  }

  function onChange(event) {
    const box = event.target.closest('input[type="checkbox"][data-key]');
    if (box) { include.set(box.dataset.key, box.checked); renderFooter(); return; }
    const select = event.target.closest('select[data-channel]');
    if (select) { typeMap[select.dataset.channel] = select.value; saveTypeMap(); render(); return; }
    if (event.target.closest('[data-action="use-work-date"]')) { useWorkDate = event.target.checked; render(); }
  }

  section.addEventListener('click', onClick);
  section.addEventListener('change', onChange);
  footer.addEventListener('click', onClick);

  return {
    addReport,
    render,
    hasData: () => Boolean(result) || Object.values(reports).some(Boolean),
    hasLast: () => Boolean(readLast()),
    isShowingReport: () => phase !== 'review' && Boolean(snapshot),
    entryCount: () => (result ? result.entries.length : 0),
    showLast() { snapshot = readLast(); phase = snapshot ? 'last' : 'review'; },
    reset() {
      reports = { caryaati: null, link: null, bank: null };
      result = null;
      include = new Map();
      filter = 'all';
      useWorkDate = false;
      phase = 'review';
      snapshot = null;
      busy = false;
      typeMap = loadTypeMap();
      section.innerHTML = '';
    },
    summaryLabel() {
      if (!result) return 'Collections';
      return `Received · Collections (${result.entries.length})`;
    }
  };
}
