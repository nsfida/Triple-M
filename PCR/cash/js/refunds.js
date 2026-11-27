/*
 * Card refunds (from the bank's Merchant Transaction Report).
 *
 * The bank report sometimes also lists REFUNDS / SALES_REV lines: money paid back to a
 * customer's card for an earlier payment. They are shown in the Import panel → Refunds tab:
 *   - the customer is found from earlier card payments in Received (same card ending,
 *     closest date to the original transaction) and earlier refunds (email / phone),
 *   - each refund is posted to Expenses (Rental / FINE RF by default) with a non-cash type,
 *   - a refund record is stored (card_refunds, migration 017) so it is never posted twice
 *     and appears in Reports,
 *   - the customer can be told by email or WhatsApp with a professional, detailed message.
 */

import { cardBrand } from './daily-reports.js?v=refunds-7';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = cents => (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = iso => (iso ? iso.split('-').reverse().join('/') : '');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = iso => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : '';
};
const daysBetween = (a, b) => Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
const firstName = name => String(name || '').trim().split(/\s+/)[0] || '';
const titleCase = name => String(name || '').toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, p, c) => p + c.toUpperCase());

export const REFUND_KIND_LABEL = { refund: 'Refund', reversal: 'Sale reversal' };

// WhatsApp wants international digits only: 05x… (UAE mobile) → 9715x…, 00… → …
export function whatsappNumber(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = `971${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) digits = `971${digits}`;
  return digits;
}

// ---------------------------------------------------------------------------------------
// Customer message (email + WhatsApp)
// ---------------------------------------------------------------------------------------
export function buildRefundMessage(refund, company) {
  const name = titleCase(refund.customer_name || refund.name || '');
  const greeting = name ? `Dear ${name},` : 'Dear Customer,';
  const amount = `AED ${money(Math.round(Number(refund.amount ?? refund.cents / 100) * 100))}`;
  const brand = refund.card_brand || refund.brand || cardBrand(refund.card_number || refund.cardNo);
  const last4 = refund.card_last4 || refund.last4 || '';
  const contract = refund.contract_no || refund.contract || '';
  const refundDate = longDate(refund.refund_date || refund.refundDate);
  const originalDate = longDate(refund.original_date || refund.originalDate);
  const arn = refund.arn || '';
  const auth = refund.auth_code || refund.auth || '';
  const reversal = (refund.txn_type || refund.type || '').toUpperCase().includes('REV');
  const days = company.refund_days || '5–10 working days';
  const subject = `Refund confirmation – ${amount}${contract ? ` – Contract ${contract}` : ''} – ${company.name}`;
  const details = [
    `Refund amount: ${amount}`,
    `Refunded to: ${brand} card ending ${last4 || '----'}`,
    `Refund processed on: ${refundDate}`,
    originalDate ? `Original payment date: ${originalDate}` : '',
    contract ? `Rental agreement / contract no.: ${contract}` : '',
    arn ? `Acquirer reference number (ARN): ${arn}` : '',
    auth ? `Authorisation code: ${auth}` : '',
    `Transaction type: ${reversal ? 'Reversal of the original card payment' : 'Card refund'}`
  ].filter(Boolean);
  const contactLine = [company.phone && `call us on ${company.phone}`, company.whatsapp && `message us on WhatsApp at ${company.whatsapp}`].filter(Boolean);
  const body = [
    greeting,
    '',
    `Thank you for choosing ${company.name}. We confirm that a refund has been processed to your card${contract ? ` for rental agreement ${contract}` : ''}.`,
    '',
    'Refund details',
    ...details.map(line => `• ${line}`),
    '',
    `We have sent the refund to your card issuer. Depending on your bank, the amount usually appears on your card statement within ${days}. It may show as a credit from "${company.name.toUpperCase()}".`,
    '',
    arn ? `If the refund has not appeared after this time, please contact your bank and quote the ARN above, which lets them trace the payment.` : 'If the refund has not appeared after this time, please contact your bank or let us know.',
    '',
    `If you have any questions, please reply to this email${contactLine.length ? ` or ${contactLine.join(' or ')}` : ''}.`,
    '',
    'Kind regards,',
    company.signature || 'Accounts Team',
    company.name,
    [company.address, company.phone, company.email].filter(Boolean).join(' · ')
  ].join('\n');
  const whatsapp = [
    `${name ? `Dear ${firstName(name)}` : 'Dear Customer'},`,
    '',
    `This is ${company.name}. We confirm that your refund of *${amount}* has been processed to your ${brand} card ending *${last4 || '----'}*.`,
    '',
    `• Refund date: ${refundDate}`,
    originalDate ? `• Original payment: ${originalDate}` : null,
    contract ? `• Contract no.: ${contract}` : null,
    arn ? `• ARN (bank reference): ${arn}` : null,
    auth ? `• Authorisation code: ${auth}` : null,
    '',
    `It usually takes ${days} to appear on your statement, depending on your bank.${arn ? ' If it has not arrived by then, please give your bank the ARN above.' : ''}`,
    '',
    'Thank you,',
    `${company.signature || 'Accounts Team'} – ${company.name}`,
    company.phone || null
  ].filter(line => line !== null).join('\n');
  return { subject, body, whatsapp };
}

// ---------------------------------------------------------------------------------------
// "Notify customer" side panel (used by Import → Refunds and by Reports)
// ---------------------------------------------------------------------------------------
export function createRefundMessenger(app) {
  const panel = document.getElementById('refundMessagePanel');
  const body = document.getElementById('refundMessageBody');
  const footer = document.getElementById('refundMessageFooter');
  let refund = null;
  let channel = 'email';
  let draft = null;
  let onUpdated = null;

  function regenerate() {
    draft = buildRefundMessage({ ...refund }, app.getCompany());
  }

  function statusHtml() {
    const parts = [];
    if (refund.emailed_at) parts.push(`<span class="rm-sent">✓ Emailed ${escapeHtml(new Date(refund.emailed_at).toLocaleString('en-GB'))}</span>`);
    if (refund.whatsapp_at) parts.push(`<span class="rm-sent">✓ WhatsApp ${escapeHtml(new Date(refund.whatsapp_at).toLocaleString('en-GB'))}</span>`);
    return parts.length ? parts.join('') : '<span class="rm-pending">Customer not told yet</span>';
  }

  function render() {
    const brand = refund.card_brand || cardBrand(refund.card_number);
    body.innerHTML = `
      <div class="rm-summary">
        <div class="rm-amount"><span>${escapeHtml(REFUND_KIND_LABEL[/REV/i.test(refund.txn_type) ? 'reversal' : 'refund'])}</span><strong>AED ${money(Math.round(Number(refund.amount) * 100))}</strong><small>${escapeHtml(brand)} ****${escapeHtml(refund.card_last4 || '')}</small></div>
        <dl class="rm-facts">
          <div><dt>Refund date</dt><dd>${escapeHtml(dmy(refund.refund_date))}</dd></div>
          <div><dt>Original payment</dt><dd>${escapeHtml(dmy(refund.original_date)) || '—'}</dd></div>
          <div><dt>ARN</dt><dd class="mono">${escapeHtml(refund.arn || '—')}</dd></div>
          <div><dt>Auth code</dt><dd class="mono">${escapeHtml(refund.auth_code || '—')}</dd></div>
          <div><dt>Fee returned</dt><dd>${money(Math.round(Number(refund.fee_returned || 0) * 100))}</dd></div>
          <div><dt>Net effect</dt><dd>${money(Math.round(Number(refund.net_amount || 0) * 100))}</dd></div>
        </dl>
        <div class="rm-status">${statusHtml()}</div>
      </div>
      <div class="sp-toolbar ap-tight"><span class="sp-section-label">CUSTOMER</span></div>
      <div class="rm-contact">
        <div class="sp-field"><label for="rmName">Name</label><input id="rmName" data-field="customer_name" type="text" maxlength="200" value="${escapeHtml(refund.customer_name)}" placeholder="Customer name"></div>
        <div class="sp-field"><label for="rmContract">Contract no.</label><input id="rmContract" data-field="contract_no" type="text" maxlength="40" value="${escapeHtml(refund.contract_no)}" placeholder="e.g. 19447"></div>
        <div class="sp-field"><label for="rmEmail">Email</label><input id="rmEmail" data-field="customer_email" type="email" maxlength="200" value="${escapeHtml(refund.customer_email)}" placeholder="customer@example.com" inputmode="email"></div>
        <div class="sp-field"><label for="rmPhone">WhatsApp / mobile</label><input id="rmPhone" data-field="customer_phone" type="tel" maxlength="40" value="${escapeHtml(refund.customer_phone)}" placeholder="+971 50 123 4567" inputmode="tel"></div>
      </div>
      <div class="rm-channels" role="tablist">
        <button type="button" data-channel="email" class="${channel === 'email' ? 'on' : ''}">✉ Email</button>
        <button type="button" data-channel="whatsapp" class="${channel === 'whatsapp' ? 'on' : ''}">🟢 WhatsApp</button>
      </div>
      ${channel === 'email' ? `<div class="sp-field"><label for="rmSubject">Subject</label><input id="rmSubject" type="text" value="${escapeHtml(draft.subject)}"></div>` : ''}
      <div class="sp-field"><label for="rmText">Message <button type="button" class="sp-btn-link rm-reset" data-action="reset">Reset text</button></label>
        <textarea id="rmText" rows="${channel === 'email' ? 18 : 13}" spellcheck="true">${escapeHtml(channel === 'email' ? draft.body : draft.whatsapp)}</textarea></div>
      <p class="sp-help">${channel === 'email' ? 'Opens your email app with this message ready to send.' : 'Opens WhatsApp (app or web) with this message for the number above.'} The message can be edited first. Company details come from Settings → Company &amp; messages.</p>
      <p class="sp-message" data-role="message" role="status" aria-live="polite"></p>`;
    footer.innerHTML = `
      <button class="sp-btn" type="button" data-action="copy">Copy message</button>
      ${channel === 'email'
        ? '<button class="sp-btn sp-btn-primary" type="button" data-action="send-email">✉ Open email</button>'
        : '<button class="sp-btn sp-btn-primary rm-wa" type="button" data-action="send-whatsapp">Open WhatsApp</button>'}`;
  }

  function say(text, ok = false) {
    const node = body.querySelector('[data-role="message"]');
    if (node) { node.textContent = text; node.classList.toggle('ok', ok); }
  }

  function readContact() {
    body.querySelectorAll('input[data-field]').forEach(input => { refund[input.dataset.field] = input.value.trim(); });
  }

  async function persist(changes) {
    readContact();
    const update = {
      customer_name: refund.customer_name || '',
      contract_no: refund.contract_no || '',
      customer_email: refund.customer_email || '',
      customer_phone: refund.customer_phone || '',
      ...changes
    };
    Object.assign(refund, update);
    if (!refund.id) { onUpdated?.(refund); return; }
    try {
      const saved = await app.updateRefund(refund.id, update);
      Object.assign(refund, saved);
      onUpdated?.(refund);
    } catch (error) {
      app.showToast(`The refund record could not be updated: ${error?.message || error}`, true);
    }
  }

  async function copy() {
    const text = channel === 'email' ? `${body.querySelector('#rmSubject')?.value || ''}\n\n${body.querySelector('#rmText').value}` : body.querySelector('#rmText').value;
    try { await navigator.clipboard.writeText(text); say('Copied to the clipboard.', true); } catch (_) {
      const area = body.querySelector('#rmText');
      area.select();
      document.execCommand?.('copy');
      say('Copied.', true);
    }
  }

  async function sendEmail() {
    readContact();
    if (!refund.customer_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(refund.customer_email)) { say('Enter the customer’s email address first.'); body.querySelector('#rmEmail')?.focus(); return; }
    const subject = body.querySelector('#rmSubject').value;
    const text = body.querySelector('#rmText').value;
    const company = app.getCompany();
    const href = `mailto:${encodeURIComponent(refund.customer_email)}?subject=${encodeURIComponent(subject)}${company.email ? `&cc=${encodeURIComponent(company.email)}` : ''}&body=${encodeURIComponent(text)}`;
    window.open(href, '_blank') || (window.location.href = href);
    await persist({ emailed_at: new Date().toISOString() });
    render();
    say('Email opened in your email app. Marked as emailed.', true);
  }

  async function sendWhatsapp() {
    readContact();
    const number = whatsappNumber(refund.customer_phone);
    if (refund.customer_phone && number.length < 8) { say('The WhatsApp number looks too short. Use the full number, e.g. +971 50 123 4567.'); return; }
    const text = body.querySelector('#rmText').value;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    await persist({ whatsapp_at: new Date().toISOString() });
    render();
    say(number ? 'WhatsApp opened. Marked as sent.' : 'WhatsApp opened: choose the contact there. Marked as sent.', true);
  }

  body.addEventListener('click', event => {
    const tab = event.target.closest('[data-channel]');
    if (tab) { readContact(); channel = tab.dataset.channel; render(); return; }
    if (event.target.closest('[data-action="reset"]')) { readContact(); regenerate(); render(); }
  });
  // Name / contract change → regenerate the text (unless the text was edited by hand).
  body.addEventListener('change', event => {
    const input = event.target.closest('input[data-field]');
    if (!input) return;
    readContact();
    if (input.dataset.field === 'customer_name' || input.dataset.field === 'contract_no') {
      const area = body.querySelector('#rmText');
      const previous = channel === 'email' ? draft.body : draft.whatsapp;
      if (area.value === previous) { regenerate(); render(); }
    }
    if (refund.id) persist({});
  });
  footer.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'copy') copy();
    else if (action === 'send-email') sendEmail();
    else if (action === 'send-whatsapp') sendWhatsapp();
  });
  document.getElementById('closeRefundMessage').addEventListener('click', () => panel.close());

  return {
    open(record, options = {}) {
      refund = record;
      onUpdated = options.onUpdated || null;
      channel = options.channel || (record.customer_email || !record.customer_phone ? 'email' : 'whatsapp');
      regenerate();
      render();
      document.getElementById('refundMessageTitle').textContent = `Notify ${titleCase(record.customer_name) || 'customer'}`;
      document.getElementById('refundMessageSub').textContent = `Refund AED ${money(Math.round(Number(record.amount) * 100))} · ${dmy(record.refund_date)}`;
      if (!panel.open) panel.showModal();
    }
  };
}

// ---------------------------------------------------------------------------------------
// Import panel → Refunds tab
// ---------------------------------------------------------------------------------------
const REFUND_COLUMNS_DEFAULT = 'rental_fine_rf';

export function createRefundsImport(app, { section, footer }) {
  let bank = null;
  let items = [];
  let prior = [];       // stored refund records (for duplicates + contact details)
  let priorManaged = true;
  let busy = false;
  let phase = 'review'; // 'review' | 'done'
  let type = '';
  let defaultColumn = REFUND_COLUMNS_DEFAULT;

  try {
    const saved = JSON.parse(localStorage.getItem(app.storageKey('refund-import')) || '{}');
    type = saved.type || '';
    defaultColumn = saved.column || REFUND_COLUMNS_DEFAULT;
  } catch (_) { /* ignore */ }
  const remember = () => { try { localStorage.setItem(app.storageKey('refund-import'), JSON.stringify({ type, column: defaultColumn })); } catch (_) { /* ignore */ } };

  const lineKey = txn => `${txn.arn}|${txn.auth}|${Math.abs(txn.cents)}|${txn.last4}`;

  function guessCustomer(txn) {
    const payments = app.cardPaymentsFor(txn.last4)
      .filter(payment => payment.date && (!txn.date || payment.date <= (bank.date || payment.date)))
      .map(payment => ({ ...payment, gap: txn.date ? daysBetween(payment.date, txn.date) : 999, covers: payment.cents >= Math.abs(txn.cents) }))
      .sort((a, b) => (a.gap - b.gap) || (Number(b.covers) - Number(a.covers)));
    const best = payments.find(payment => payment.gap <= 45) || null;
    const earlier = prior.filter(record => record.card_last4 === txn.last4 && (record.customer_email || record.customer_phone || record.customer_name));
    const contactFrom = earlier.find(record => !best || !record.customer_name || record.customer_name === best.name) || earlier[0];
    return { best, payments: payments.slice(0, 5), contactFrom };
  }

  async function setBank(report) {
    bank = report;
    phase = 'review';
    const refunds = (report.refunds || report.txns.filter(txn => txn.refund));
    try {
      const loaded = await app.loadRefunds({});
      prior = loaded.rows;
      priorManaged = loaded.managed;
    } catch (_) { prior = []; }
    try { await app.ensureReceivedLoaded?.(); } catch (_) { /* matching just finds less */ }
    const invoiceRefs = app.existingInvoiceNumbers();
    items = refunds.map(txn => {
      const key = lineKey(txn);
      const stored = prior.find(record => `${record.arn}|${record.auth_code}|${Math.round(Number(record.amount) * 100)}|${record.card_last4}` === key);
      const guess = guessCustomer(txn);
      const posted = invoiceRefs.has(`RF ${txn.auth}`);
      return {
        key,
        txn,
        stored,
        status: stored || posted ? 'imported' : 'new',
        include: !(stored || posted),
        customer_name: stored?.customer_name || guess.best?.name || guess.contactFrom?.customer_name || '',
        contract_no: stored?.contract_no || guess.best?.contract || guess.contactFrom?.contract_no || '',
        customer_email: stored?.customer_email || guess.contactFrom?.customer_email || '',
        customer_phone: stored?.customer_phone || guess.contactFrom?.customer_phone || '',
        column: defaultColumn,
        guess
      };
    });
    render();
  }

  const ticked = () => items.filter(item => item.include && item.status === 'new');

  function typeOptions() {
    const types = app.expenseTypes();
    if (!type || !types.some(item => item.name === type)) {
      type = (types.find(item => /^card$/i.test(item.name)) || types.find(item => /card/i.test(item.name) && !app.isCashType(item.name)) || types.find(item => !app.isCashType(item.name)) || {}).name || '';
    }
    return types.map(item => `<option value="${escapeHtml(item.name)}" ${item.name === type ? 'selected' : ''}>${escapeHtml(item.name)}${app.isCashType(item.name) ? ' (cash)' : ''}</option>`).join('');
  }

  function columnOptions(selected) {
    return app.expenseColumns().map(([label, field]) => `<option value="${field}" ${field === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  }

  function itemHtml(item, index) {
    const txn = item.txn;
    const brand = cardBrand(txn.cardNo);
    const best = item.guess.best;
    const canTick = item.status === 'new';
    return `<div class="rf-item ${item.status} ${item.include && canTick ? 'on' : ''}" data-index="${index}">
      <div class="rf-top">
        <label class="rf-check"><input type="checkbox" data-role="include" ${item.include && canTick ? 'checked' : ''} ${canTick ? '' : 'disabled'} aria-label="Post this refund"></label>
        <div class="rf-main">
          <strong>${escapeHtml(brand)} ****${escapeHtml(txn.last4)} <span class="rf-kind ${txn.refundKind}">${REFUND_KIND_LABEL[txn.refundKind] || 'Refund'}</span></strong>
          <small>Original payment ${escapeHtml(dmy(txn.date))} · ARN <span class="mono">${escapeHtml(txn.arn)}</span> · auth ${escapeHtml(txn.auth)}</small>
        </div>
        <div class="rf-amount"><strong>${money(-txn.cents)}</strong><small>fee back ${money(-txn.feeCents)} · net ${money(txn.netCents)}</small></div>
      </div>
      ${item.status === 'imported' ? `<p class="rf-note">Already posted${item.stored?.customer_name ? ` for ${escapeHtml(item.stored.customer_name)}` : ''}.${item.stored ? ' <button type="button" class="sp-btn-link" data-role="notify">Notify customer</button>' : ''}</p>` : `
      <div class="rf-fields">
        <label><span>Customer</span><input type="text" data-field="customer_name" maxlength="200" value="${escapeHtml(item.customer_name)}" placeholder="Customer name"></label>
        <label><span>Contract</span><input type="text" data-field="contract_no" maxlength="40" value="${escapeHtml(item.contract_no)}" placeholder="—"></label>
        <label><span>Email</span><input type="email" data-field="customer_email" maxlength="200" value="${escapeHtml(item.customer_email)}" placeholder="for the refund email"></label>
        <label><span>WhatsApp</span><input type="tel" data-field="customer_phone" maxlength="40" value="${escapeHtml(item.customer_phone)}" placeholder="+971…"></label>
        <label class="rf-col"><span>Expenses column</span><select data-field="column">${columnOptions(item.column)}</select></label>
      </div>
      <p class="rf-match ${best ? 'found' : 'none'}">${best
        ? `Matched to the card payment of <strong>${escapeHtml(best.name || '—')}</strong>${best.contract ? ` (CN ${escapeHtml(best.contract)})` : ''} on ${escapeHtml(dmy(best.date))}, AED ${money(best.cents)}${best.gap ? ` · ${best.gap} day${best.gap === 1 ? '' : 's'} from the original date` : ' · same day'}${best.covers ? '' : ' · ⚠ payment smaller than the refund'}.`
        : `No earlier card payment ending ${escapeHtml(txn.last4)} found in Received: enter the customer.`}
        ${item.guess.payments.length > 1 ? `<button type="button" class="sp-btn-link" data-role="other-matches">Other matches (${item.guess.payments.length - 1})</button>` : ''}</p>
      ${item.showOthers ? `<div class="rf-others">${item.guess.payments.map((payment, i) => `<button type="button" class="rf-pick" data-role="pick" data-pick="${i}">${escapeHtml(dmy(payment.date))} · ${escapeHtml(payment.name || '—')}${payment.contract ? ` · CN ${escapeHtml(payment.contract)}` : ''} · AED ${money(payment.cents)}</button>`).join('')}</div>` : ''}`}
    </div>`;
  }

  function render() {
    if (!bank) { section.innerHTML = ''; renderFooter(); return; }
    const total = items.reduce((sum, item) => sum - item.txn.cents, 0);
    const fees = items.reduce((sum, item) => sum - item.txn.feeCents, 0);
    const net = items.reduce((sum, item) => sum + item.txn.netCents, 0);
    if (phase === 'done') { renderDone(); return; }
    section.innerHTML = `
      <div class="rf-head">
        <div><span>Card refunds in the bank report</span><strong>AED ${money(total)}</strong><small>${items.length} refund${items.length === 1 ? '' : 's'} · report ${escapeHtml(dmy(bank.date))} · fees returned ${money(fees)} · net effect ${money(net)}</small></div>
      </div>
      ${priorManaged ? '' : '<p class="ap-note ap-note-warn">Run SQL migration 017 to keep a record of refunds (prevents posting twice, shows them in Reports and remembers customer emails). Expenses entries still work without it.</p>'}
      <div class="sp-toolbar ap-tight"><span class="sp-section-label">POST TO EXPENSES AS</span></div>
      <div class="cl-types">
        <div class="cl-type-row"><span>Payment type</span><select data-role="type">${typeOptions()}</select></div>
        <div class="cl-type-row"><span>Default column</span><select data-role="default-column">${columnOptions(defaultColumn)}</select><button type="button" class="sp-btn sp-btn-small" data-role="apply-column">Apply to all</button></div>
      </div>
      <p class="ri-hint">Each refund becomes one Expenses row dated ${escapeHtml(dmy(bank.date))}: Supplier “Card refund ****1234 · CN …”, Name = customer, Inv# = “RF &lt;auth code&gt;”.</p>
      <div class="sp-toolbar ap-tight"><span class="sp-section-label">REFUNDS · ${items.length}</span></div>
      <div class="rf-list">${items.map(itemHtml).join('') || '<p class="ri-empty">No refunds in this report.</p>'}</div>`;
    renderFooter();
  }

  function renderDone() {
    section.innerHTML = `
      <div class="cl-done"><strong>✓ ${items.filter(item => item.added).length} refund${items.filter(item => item.added).length === 1 ? '' : 's'} posted to Expenses</strong><small>Saving automatically · type ${escapeHtml(type)}. Now tell the customers:</small></div>
      <div class="rf-list">${items.filter(item => item.record || item.stored).map(item => {
        const record = item.record || item.stored;
        const told = [record.emailed_at && 'Emailed', record.whatsapp_at && 'WhatsApp'].filter(Boolean).join(' · ');
        return `<div class="rf-item done" data-index="${items.indexOf(item)}"><div class="rf-top">
          <div class="rf-main"><strong>${escapeHtml(record.customer_name || 'Customer not set')}</strong><small>${escapeHtml(record.card_brand)} ****${escapeHtml(record.card_last4)}${record.contract_no ? ` · CN ${escapeHtml(record.contract_no)}` : ''}${record.customer_email ? ` · ${escapeHtml(record.customer_email)}` : ''}${record.customer_phone ? ` · ${escapeHtml(record.customer_phone)}` : ''}</small></div>
          <div class="rf-amount"><strong>${money(Math.round(Number(record.amount) * 100))}</strong><small class="${told ? 'rf-told' : 'rf-untold'}">${told || 'Not told yet'}</small></div>
          <button type="button" class="sp-btn sp-btn-small" data-role="notify">Notify</button>
        </div></div>`;
      }).join('')}</div>`;
    renderFooter();
  }

  function renderFooter() {
    const summary = footer.querySelector('[data-role="summary"]');
    const message = footer.querySelector('[data-role="message"]');
    const actions = footer.querySelector('[data-role="actions"]');
    if (phase === 'done') {
      summary.textContent = `${items.filter(item => item.added).length} refunds posted`;
      message.textContent = '';
      actions.innerHTML = '<button class="sp-btn sp-btn-primary" type="button" data-action="close">Done</button>';
      return;
    }
    const chosen = ticked();
    const total = chosen.reduce((sum, item) => sum - item.txn.cents, 0);
    summary.textContent = bank ? `${chosen.length} of ${items.length} refunds · AED ${money(total)}` : '';
    const problem = !app.canPost() ? 'Your access does not include adding Expenses.'
      : !type ? 'Choose the payment type.'
        : app.isCashType(type) ? `“${type}” counts as cash: card refunds normally use a non-cash type (e.g. Card).` : '';
    message.textContent = busy ? 'Posting…' : problem;
    actions.innerHTML = `<button class="sp-btn sp-btn-primary" type="button" data-action="post" ${busy || !chosen.length || !type || !app.canPost() ? 'disabled' : ''}>Post ${chosen.length} refund${chosen.length === 1 ? '' : 's'} to Expenses</button>`;
  }

  async function post() {
    if (busy) return;
    const chosen = ticked();
    if (!chosen.length) return;
    if (app.isCashType(type) && !window.confirm(`“${type}” counts as cash, so these refunds will reduce Available Cash. Continue?`)) return;
    const unnamed = chosen.filter(item => !item.customer_name).length;
    if (unnamed && !window.confirm(`${unnamed} refund${unnamed === 1 ? ' has' : 's have'} no customer name. Post anyway?`)) return;
    busy = true;
    renderFooter();
    try {
      await app.ensureExpensesLoaded();
      const invoiceRefs = app.existingInvoiceNumbers();
      const fresh = chosen.filter(item => !invoiceRefs.has(`RF ${item.txn.auth}`));
      const entries = fresh.map(item => ({
        entry_date: bank.date,
        supplier: `Card refund ****${item.txn.last4}${item.contract_no ? ` · CN ${item.contract_no}` : ''}`,
        spent_by: item.customer_name,
        invoice_number: `RF ${item.txn.auth}`,
        transaction_type: type,
        amounts: { [item.column]: -item.txn.cents }
      }));
      const added = app.addExpenseEntries(entries);
      fresh.forEach(item => { item.added = true; });
      const records = fresh.map(item => ({
        refund_date: bank.date,
        original_date: item.txn.date || null,
        txn_type: item.txn.type,
        card_number: item.txn.cardNo,
        card_last4: item.txn.last4,
        card_brand: cardBrand(item.txn.cardNo),
        arn: item.txn.arn,
        auth_code: item.txn.auth,
        amount: (-item.txn.cents / 100).toFixed(2),
        fee_returned: (-item.txn.feeCents / 100).toFixed(2),
        net_amount: (item.txn.netCents / 100).toFixed(2),
        customer_name: item.customer_name,
        contract_no: item.contract_no,
        customer_email: item.customer_email,
        customer_phone: item.customer_phone,
        expense_column: item.column,
        expense_type: type,
        merchant_no: bank.merchantNo || '',
        source_file: bank.fileName || ''
      }));
      let saved = null;
      try { saved = await app.insertRefunds(records); } catch (error) { app.showToast(`Refunds were posted to Expenses, but the refund records could not be saved: ${error?.message || error}`, true); }
      fresh.forEach((item, index) => {
        item.record = saved?.find(record => record.arn === item.txn.arn && record.auth_code === item.txn.auth) || { ...records[index], id: null };
      });
      phase = 'done';
      app.showToast(`Posted ${added} refund${added === 1 ? '' : 's'} to Expenses (AED ${money(fresh.reduce((sum, item) => sum - item.txn.cents, 0))}). Saving automatically.`);
      app.onRefundsChanged?.();
    } catch (error) {
      app.showToast(error?.message || 'The refunds could not be posted.', true);
    } finally {
      busy = false;
      render();
    }
  }

  function notify(item) {
    const record = item.record || item.stored;
    if (!record) return;
    app.messenger.open(record, { onUpdated: updated => { Object.assign(record, updated); render(); app.onRefundsChanged?.(); } });
  }

  section.addEventListener('input', event => {
    const field = event.target.closest('[data-field]');
    const card = event.target.closest('.rf-item');
    if (!field || !card) return;
    items[Number(card.dataset.index)][field.dataset.field] = field.value;
  });
  section.addEventListener('change', event => {
    const card = event.target.closest('.rf-item');
    if (event.target.matches('[data-role="include"]') && card) { items[Number(card.dataset.index)].include = event.target.checked; card.classList.toggle('on', event.target.checked); renderFooter(); return; }
    if (event.target.matches('select[data-field="column"]') && card) { items[Number(card.dataset.index)].column = event.target.value; return; }
    if (event.target.matches('[data-role="type"]')) { type = event.target.value; remember(); renderFooter(); return; }
    if (event.target.matches('[data-role="default-column"]')) { defaultColumn = event.target.value; remember(); }
  });
  section.addEventListener('click', event => {
    const card = event.target.closest('.rf-item');
    const role = event.target.closest('[data-role]')?.dataset.role;
    if (role === 'apply-column') { items.forEach(item => { if (item.status === 'new') item.column = defaultColumn; }); render(); return; }
    if (!card) return;
    const item = items[Number(card.dataset.index)];
    if (role === 'notify') notify(item);
    else if (role === 'other-matches') { item.showOthers = !item.showOthers; render(); }
    else if (role === 'pick') {
      const payment = item.guess.payments[Number(event.target.closest('[data-pick]').dataset.pick)];
      item.customer_name = payment.name;
      item.contract_no = payment.contract;
      item.guess.best = payment;
      item.showOthers = false;
      render();
    }
  });
  footer.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'post') post();
    else if (action === 'close') app.close();
  });

  return {
    setBank,
    render,
    hasData: () => Boolean(bank && items.length),
    count: () => items.length,
    reset() { bank = null; items = []; phase = 'review'; busy = false; section.innerHTML = ''; }
  };
}
