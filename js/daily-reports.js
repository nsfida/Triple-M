/*
 * Daily collection reports → Received entries + reconciliation.
 *
 * Three reports for the same day:
 *   1. Caryaati "receipts" report (rental software, .xlsx/.xls/.csv): every posting line
 *      with voucher, customer, contract, description (which contains the payment method:
 *      "Payment:cc,visa,<name>,7090****", "Payment:bank Transfer:123456", "Payment:cash")
 *      and amount.  → Received entries are made from this report only.
 *   2. Payment-link report (.xls text / .xlsx/.csv): one row per link payment with the
 *      contract number in Order Id ("CN# 18843", "Cno19622"), card last digits, amount,
 *      commission, VAT and net.  → identifies which Caryaati card payments were links.
 *   3. Bank POS report (Network International "Merchant Transaction Report" PDF): every
 *      card-machine transaction with card first-6/last-4, amount, fees and net, plus the
 *      day's grand totals.  → verifies the remaining card payments.
 *
 * Cash postings are not imported (cash is entered manually when it is received) but are
 * reported so they can be compared with the cash already in the Received sheet.
 *
 * Pure module (no DOM): runs in the browser and in Node for testing.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export const toCents = value => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Math.round(value * 100);
  let text = String(value).trim().replace(/,/g, '').replace(/\s/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1); }
  const number = Number(text);
  if (!Number.isFinite(number)) return NaN;
  return (negative ? -1 : 1) * Math.round(number * 100);
};

const norm = text => String(text ?? '').toLowerCase().replace(/[^a-z0-9#]+/g, '');

// Unwraps Excel text formulas some exports use: =CONCATENATE("CN# 18843", " ") → CN# 18843
export function cleanCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  let text = String(value);
  const formula = /^\s*=\s*CONCATENATE\s*\((.*)\)\s*$/i.exec(text);
  if (formula) {
    const parts = [...formula[1].matchAll(/"((?:[^"]|"")*)"/g)].map(match => match[1].replace(/""/g, '"'));
    text = parts.join('');
  } else if (/^\s*=\s*"(.*)"\s*$/.test(text)) {
    text = text.replace(/^\s*=\s*"(.*)"\s*$/, '$1');
  } else if (/^\s*=/.test(text)) {
    return ''; // other formulas (e.g. =SUBTOTAL) carry no value in a text export
  }
  return text.replace(/ /g, ' ').trim();
}

const pad = number => String(number).padStart(2, '0');

// dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, Excel serial numbers and Date objects → yyyy-mm-dd
export function toIsoDate(value, fallbackYear) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }
  const text = String(value ?? '').trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (match) return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
  match = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/.exec(text);
  if (match) {
    let year = match[3] ? Number(match[3]) : fallbackYear;
    if (!year) return '';
    if (year < 100) year += 2000;
    const day = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${year}-${pad(month)}-${pad(day)}`;
  }
  return '';
}

function mostCommon(values) {
  const counts = new Map();
  values.filter(Boolean).forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function findHeader(rows, required) {
  for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
    const cells = rows[index].map(cell => norm(cleanCell(cell)));
    if (required.every(name => cells.includes(norm(name)))) return { index, cells };
  }
  return null;
}

const columnIndex = (header, ...names) => {
  for (const name of names) {
    const index = header.cells.indexOf(norm(name));
    if (index >= 0) return index;
  }
  return -1;
};

// ---------------------------------------------------------------------------
// Text spreadsheets (.xls files that are really tab-separated text, .csv)
// ---------------------------------------------------------------------------
export function parseDelimitedText(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const sample = lines.slice(0, 5).join('\n');
  const delimiter = (sample.match(/\t/g) || []).length >= (sample.match(/,/g) || []).length ? '\t' : ',';
  return lines.filter(line => line.trim() !== '').map(line => delimiter === '\t' ? line.split('\t') : splitCsvLine(line));
}

function splitCsvLine(line) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { current += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { out.push(current); current = ''; }
    else current += char;
  }
  out.push(current);
  return out;
}

// ---------------------------------------------------------------------------
// 1. Caryaati report
// ---------------------------------------------------------------------------
export function isCaryaatiRows(rows) {
  return Boolean(findHeader(rows, ['Voucher No.', 'Contract#', 'Description', 'Net Amount']));
}

// Which Received column a Caryaati posting line belongs to.
const RECEIVED_RULES = [
  { field: 'vat', test: text => /^\s*vat\b/i.test(text) || /\bvat\s+against\b/i.test(text) },
  { field: 'salik', test: text => /^\s*salik\b/i.test(text) },
  { field: 'fine_deposit', test: text => /fine\s+deposit|deposit\s+(?:against|for)\s+fine/i.test(text) },
  { field: 'fines', test: text => /^\s*fines?\b|\bfine\s+against\b|^\s*fine\s+no/i.test(text) },
  { field: 'waiver', test: text => /deposit\s+w(?:ai|ie|ia)ver|\bwaiver\b/i.test(text) },
  { field: 'rent', test: text => /^\s*rent\b/i.test(text) },
  { field: 'add_dri', test: text => /add\.?\s*driver|additional\s+driver/i.test(text) },
  { field: 'low_fuel', test: text => /\bfuel\b/i.test(text) },
  { field: 'pickup_delivery', test: text => /deliver|pick[\s-]*up|drop[\s-]*off|collection\s+charge/i.test(text) },
  { field: 'cdw', test: text => /\bcdw\b|collision\s+damage/i.test(text) },
  { field: 'ins_exc', test: text => /insurance\s+excess|\bins\.?\s*exc/i.test(text) },
  { field: 'damage', test: text => /damage/i.test(text) },
  { field: 'tyre', test: text => /\btyres?\b|\btires?\b/i.test(text) },
  { field: 'ex_km', test: text => /(?:extra|excess|ex)\.?\s*k\.?m/i.test(text) },
  { field: 'freeze_amount', test: text => /freez/i.test(text) },
  { field: 'sold_cars', test: text => /sold\s+car|sale\s+of\s+(?:car|vehicle)/i.test(text) },
  { field: 'withdraw', test: text => /withdraw/i.test(text) }
];

export const RECEIVED_COLUMN_LABELS = {
  rent: 'Rent', salik: 'Salik', fines: 'Fines', vat: 'VAT', cdw: 'CDW', add_dri: 'ADD DRI', low_fuel: 'Low Fuel',
  fine_deposit: 'Fine Deposit', waiver: 'Waiver', withdraw: 'Withdraw', sold_cars: 'Sold Cars', pickup_delivery: 'P.UP / DEL',
  ins_exc: 'INS EXC.', freeze_amount: 'FREEZE', tyre: 'TYRE', damage: 'DAMAGE', ex_km: 'EX KM', others: 'OTHERS'
};

export function receivedColumnFor(description) {
  const rule = RECEIVED_RULES.find(item => item.test(description));
  return rule ? rule.field : 'others';
}

// "Payment:cc,visa,ahmad Anwar Faour,7090****"  → card, visa, last4 7090
// "Payment:bank Transfer:123456"                → bank transfer, ref 123456
// "Payment:cash"                                → cash
export function parsePayment(description) {
  const match = /payment\s*:\s*(.+)$/i.exec(String(description ?? ''));
  if (!match) return null;
  const text = match[1].trim();
  if (/^cash\b/i.test(text)) return { method: 'cash' };
  const transfer = /^bank\s*transfer\s*:?\s*([A-Za-z0-9/-]*)/i.exec(text);
  if (transfer) return { method: 'bank', ref: transfer[1] || '' };
  if (/^(?:cc|card|credit|debit|visa|master|amex)\b/i.test(text)) {
    const parts = text.split(',').map(part => part.trim());
    const brandText = (parts[1] || parts[0] || '').toLowerCase();
    const brand = /master/.test(brandText) ? 'Mastercard' : /visa/.test(brandText) ? 'Visa' : /amex|american/.test(brandText) ? 'Amex' : '';
    const last4 = /(\d{4})\s*\*{2,}/.exec(text)?.[1] || /\*{2,}\s*(\d{4})/.exec(text)?.[1] || '';
    return { method: 'card', brand, last4, holder: parts[2] || '' };
  }
  if (/link/i.test(text)) return { method: 'card', viaLink: true, brand: '', last4: '' };
  if (/cheque|check/i.test(text)) return { method: 'bank', ref: 'cheque' };
  return { method: 'other', raw: text };
}

export function parseCaryaati(rows, fileName = '') {
  const header = findHeader(rows, ['Voucher No.', 'Contract#', 'Description', 'Net Amount']);
  if (!header) throw new Error('This is not a Caryaati receipts report (Voucher No. / Contract# / Description / Net Amount columns not found).');
  const col = {
    account: columnIndex(header, 'Account'),
    date: columnIndex(header, 'Voucher Date', 'Date'),
    voucher: columnIndex(header, 'Voucher No.', 'Voucher No'),
    customer: columnIndex(header, 'Customer'),
    contract: columnIndex(header, 'Contract#', 'Contract'),
    vehicle: columnIndex(header, 'Vehicle'),
    description: columnIndex(header, 'Description'),
    amount: columnIndex(header, 'Net Amount', 'Amount')
  };
  const lines = [];
  const problems = [];
  rows.slice(header.index + 1).forEach((row, offset) => {
    const voucher = String(cleanCell(row[col.voucher]) || '').trim();
    const description = String(cleanCell(row[col.description]) || '').replace(/\s+/g, ' ').trim();
    const rawAmount = cleanCell(row[col.amount]);
    if (!voucher && !description) return;
    if (!voucher || /^total/i.test(voucher)) return; // total / footer rows
    const cents = toCents(rawAmount);
    if (!Number.isFinite(cents)) { problems.push(`Row ${header.index + offset + 2}: amount “${rawAmount}” could not be read.`); return; }
    lines.push({
      row: header.index + offset + 2,
      account: String(cleanCell(row[col.account]) || '').trim(),
      date: toIsoDate(cleanCell(row[col.date])),
      voucher,
      customer: String(cleanCell(row[col.customer]) || '').replace(/\s+/g, ' ').trim(),
      contract: String(cleanCell(row[col.contract]) || '').trim(),
      vehicle: String(cleanCell(row[col.vehicle]) || '').trim(),
      description,
      cents,
      payment: parsePayment(description),
      field: receivedColumnFor(description)
    });
  });
  if (!lines.length) throw new Error('The Caryaati report has no posting lines.');

  // Vouchers: every line of a voucher shares one payment (some lines omit the text).
  const vouchers = new Map();
  lines.forEach(line => {
    let voucher = vouchers.get(line.voucher);
    if (!voucher) {
      voucher = { voucher: line.voucher, date: line.date, customer: line.customer, contract: line.contract, vehicle: line.vehicle, account: line.account, lines: [], cents: 0, columns: {}, payments: [] };
      vouchers.set(line.voucher, voucher);
    }
    voucher.lines.push(line);
    voucher.cents += line.cents;
    voucher.columns[line.field] = (voucher.columns[line.field] || 0) + line.cents;
    if (line.payment) voucher.payments.push(line.payment);
  });
  vouchers.forEach(voucher => {
    const payment = voucher.payments.find(item => item.last4) || voucher.payments[0] || null;
    if (payment) {
      voucher.method = payment.method;
      Object.assign(voucher, { brand: payment.brand || '', last4: payment.last4 || '', ref: payment.ref || '', viaLink: Boolean(payment.viaLink) });
    } else if (/cash/i.test(voucher.account)) {
      voucher.method = 'cash';
    } else {
      voucher.method = 'unknown';
    }
    const methods = new Set(voucher.payments.map(item => item.method));
    if (methods.size > 1) voucher.mixed = true;
  });

  const date = mostCommon(lines.map(line => line.date));
  return { kind: 'caryaati', fileName, date, dates: [...new Set(lines.map(line => line.date))].sort(), lines, vouchers: [...vouchers.values()], problems };
}

// ---------------------------------------------------------------------------
// 2. Payment-link report
// ---------------------------------------------------------------------------
export function isLinkReportRows(rows) {
  return Boolean(findHeader(rows, ['Order Id', 'Txn Amount']) || findHeader(rows, ['Order Id', 'Card No']));
}

export function contractFromReference(text) {
  const value = String(text ?? '');
  const match = /(?:c\s*\.?\s*n\s*\.?\s*o?|contract|cont)\s*(?:no\.?|number)?\s*[#:.\-]?\s*(\d{3,8})/i.exec(value)
    || /^\s*#?\s*(\d{4,8})\s*$/.exec(value);
  return match ? match[1] : '';
}

export function parseLinkReport(rows, fileName = '') {
  const header = findHeader(rows, ['Order Id', 'Txn Amount']) || findHeader(rows, ['Order Id', 'Card No']);
  if (!header) throw new Error('This is not a payment-link report (Order Id / Txn Amount columns not found).');
  const col = {
    date: columnIndex(header, 'Txn Date', 'Transaction Date', 'Date'),
    rrn: columnIndex(header, 'Voucher Nbr / RRN', 'RRN', 'Voucher Nbr'),
    cardType: columnIndex(header, 'Card Type'),
    cardNo: columnIndex(header, 'Card No', 'Card Number'),
    auth: columnIndex(header, 'Auth Id', 'Auth Code'),
    currency: columnIndex(header, 'Txn Ccy', 'Currency'),
    amount: columnIndex(header, 'Txn Amount', 'Amount'),
    commission: columnIndex(header, 'Comm Amount', 'Commission'),
    vat: columnIndex(header, 'VAT Amount', 'VAT'),
    net: columnIndex(header, 'Net Amount', 'Net'),
    order: columnIndex(header, 'Order Id'),
    orderRef: columnIndex(header, 'Order Reference'),
    arn: columnIndex(header, 'ARN')
  };
  const txns = [];
  const problems = [];
  rows.slice(header.index + 1).forEach((row, offset) => {
    const date = toIsoDate(cleanCell(row[col.date]));
    const amountRaw = cleanCell(row[col.amount]);
    if (!date || amountRaw === '') return; // total / blank rows
    const cents = toCents(amountRaw);
    if (!Number.isFinite(cents)) { problems.push(`Row ${header.index + offset + 2}: amount could not be read.`); return; }
    const cardNo = String(cleanCell(row[col.cardNo]) || '');
    const order = String(cleanCell(row[col.order]) || '');
    const orderRef = col.orderRef >= 0 ? String(cleanCell(row[col.orderRef]) || '') : '';
    txns.push({
      source: 'link',
      row: header.index + offset + 2,
      date,
      rrn: String(cleanCell(row[col.rrn]) || ''),
      cardType: String(cleanCell(row[col.cardType]) || ''),
      cardNo,
      last4: /(\d{4})\s*$/.exec(cardNo)?.[1] || '',
      auth: String(cleanCell(row[col.auth]) || ''),
      cents,
      commissionCents: col.commission >= 0 ? Math.abs(toCents(cleanCell(row[col.commission])) || 0) : 0,
      vatCents: col.vat >= 0 ? Math.abs(toCents(cleanCell(row[col.vat])) || 0) : 0,
      netCents: col.net >= 0 ? toCents(cleanCell(row[col.net])) || 0 : cents,
      order,
      orderRef,
      contract: contractFromReference(order) || contractFromReference(orderRef),
      arn: String(cleanCell(row[col.arn]) || '')
    });
  });
  if (!txns.length) throw new Error('The payment-link report has no payments.');
  return { kind: 'link', fileName, date: mostCommon(txns.map(txn => txn.date)), dates: [...new Set(txns.map(txn => txn.date))].sort(), txns, problems };
}

// ---------------------------------------------------------------------------
// 3. Bank POS report (Network International PDF)
// ---------------------------------------------------------------------------
async function pdfLines(pdf) {
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items
      .filter(item => String(item.str).trim())
      .map(item => ({ str: String(item.str).trim(), x: item.transform[4], y: viewport.height - item.transform[5] }));
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    items.forEach(item => {
      const line = lines.find(existing => Math.abs(existing.y - item.y) <= 3);
      if (line) line.items.push(item); else lines.push({ y: item.y, items: [item] });
    });
    lines.forEach(line => { line.items.sort((a, b) => a.x - b.x); line.text = line.items.map(item => item.str).join(' ').replace(/\s+/g, ' '); });
    pages.push(lines.map(line => line.text));
    page.cleanup?.();
  }
  return pages.flat();
}

export function isBankPosText(lines) {
  const text = lines.slice(0, 60).join('\n');
  return /MERCHANT TRANSACTION REPORT/i.test(text) && /(TRXN|TRAN)\s*(TYPE|AMT)|GRAND TOTAL/i.test(lines.join('\n'));
}

const NUM = '-?[\\d,]+\\.\\d{2}';
const BANK_ROW = new RegExp(`^(\\d{2}/\\d{2}(?:/\\d{2,4})?)\\s+(\\S+)\\s+(\\d{4,6}X+\\d{4})\\s+([A-Z_]+)\\s+(\\S+)\\s+(\\S+)\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s*(.*)$`);

export function parseBankPosLines(lines, fileName = '') {
  if (!isBankPosText(lines)) throw new Error('This is not a bank POS merchant transaction report.');
  const all = lines.join('\n');
  const from = /FROM\s+(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(all)?.[1] || '';
  const to = /TO\s+(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(all)?.[1] || from;
  const fromIso = toIsoDate(from);
  const year = Number(fromIso.slice(0, 4)) || undefined;
  const grab = regex => { const match = regex.exec(all); return match ? toCents(match[1]) : null; };
  const txns = [];
  lines.forEach(line => {
    const match = BANK_ROW.exec(line.trim());
    if (!match) return;
    const [, dateText, terminal, card, type, arn, auth, amount, msf, fee, vat, net, desc] = match;
    txns.push({
      source: 'pos',
      date: toIsoDate(dateText, year),
      terminal,
      cardNo: card,
      bin: /^(\d{4,6})/.exec(card)?.[1] || '',
      last4: /(\d{4})$/.exec(card)?.[1] || '',
      type,
      arn,
      auth,
      cents: toCents(amount),
      commissionCents: Math.abs(toCents(msf)) + Math.abs(toCents(fee)),
      vatCents: Math.abs(toCents(vat)),
      netCents: toCents(net),
      desc: desc.trim()
    });
  });
  if (!txns.length) throw new Error('No transactions were found in the bank POS report.');
  const totals = {
    count: grab(/GRAND TOTAL OF POS TRANSACTIONS\s*:?\s*(\d+)/i) != null ? Number(/GRAND TOTAL OF POS TRANSACTIONS\s*:?\s*(\d+)/i.exec(all)[1]) : null,
    grossCents: grab(new RegExp(`GRAND TOTAL VALUE OF POS TRANSACTIONS\\s*:?\\s*(${NUM})`, 'i')),
    commissionCents: grab(new RegExp(`GRAND TOTAL VALUE OF COMMISSION\\s*:?\\s*(${NUM})`, 'i')),
    vatCents: grab(new RegExp(`GRAND TOTAL VALUE OF VAT\\s*:?\\s*(${NUM})`, 'i')),
    netCents: grab(new RegExp(`NET PAYABLE\\s*/?\\s*RECEIVABLE\\s*:?\\s*(${NUM})`, 'i'))
  };
  const sumCents = txns.reduce((sum, txn) => sum + txn.cents, 0);
  const problems = [];
  if (totals.grossCents != null && totals.grossCents !== sumCents) {
    problems.push(`Transactions add up to ${(sumCents / 100).toFixed(2)} but the report total is ${(totals.grossCents / 100).toFixed(2)}.`);
  }
  if (totals.count != null && totals.count !== txns.length) problems.push(`The report lists ${totals.count} transactions but ${txns.length} were read.`);

  // A sale and its reversal (same card, reference and amount) cancel each other out.
  txns.forEach(txn => { txn.voided = false; });
  txns.filter(txn => /REV|VOID|REFUND/i.test(txn.type) || txn.cents < 0).forEach(reversal => {
    const sale = txns.find(txn => !txn.voided && txn !== reversal && txn.cents === -reversal.cents && txn.cardNo === reversal.cardNo && (txn.arn === reversal.arn || txn.auth === reversal.auth));
    if (sale) { sale.voided = true; reversal.voided = true; sale.pair = reversal; reversal.pair = sale; }
  });
  const merchantNo = /Merchant No\s*:?\s*(\d+)/i.exec(all)?.[1] || '';
  return { kind: 'bank', fileName, date: fromIso, dateTo: toIsoDate(to), merchantNo, txns, totals, sumCents, problems };
}

export async function parseBankPosPdf(pdf, fileName = '') {
  return parseBankPosLines(await pdfLines(pdf), fileName);
}

export async function isBankPosPdf(pdf) {
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map(item => item.str).join(' ');
  return /MERCHANT TRANSACTION REPORT/i.test(text);
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

// Subset of vouchers whose totals add up exactly to `target` (small sets, exact search).
function findSubset(vouchers, target) {
  const total = vouchers.reduce((sum, voucher) => sum + voucher.cents, 0);
  if (total === target) return vouchers.slice();
  const list = vouchers.slice(0, 18);
  const n = list.length;
  let best = null;
  const search = (index, sum, chosen) => {
    if (best) return;
    if (sum === target && chosen.length) { best = chosen.slice(); return; }
    if (index >= n) return;
    chosen.push(list[index]);
    search(index + 1, sum + list[index].cents, chosen);
    chosen.pop();
    search(index + 1, sum, chosen);
  };
  if (n <= 18) search(0, 0, []);
  return best;
}

const sumCents = list => list.reduce((sum, item) => sum + (item.cents || 0), 0);

function groupBy(list, keyOf) {
  const map = new Map();
  list.forEach(item => {
    const key = keyOf(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

function makeEntry(channel, vouchers, extra = {}) {
  const first = vouchers[0];
  const columns = {};
  vouchers.forEach(voucher => Object.entries(voucher.columns).forEach(([field, cents]) => { columns[field] = (columns[field] || 0) + cents; }));
  const names = vouchers.map(voucher => voucher.customer).filter(Boolean);
  const name = names.sort((a, b) => a.length - b.length)[0] || first.customer || '';
  const last4 = vouchers.find(voucher => voucher.last4)?.last4 || '';
  const brand = vouchers.find(voucher => voucher.brand)?.brand || '';
  const ref = vouchers.find(voucher => voucher.ref)?.ref || '';
  const lines = vouchers.flatMap(voucher => voucher.lines);
  return {
    key: `${channel}:${vouchers.map(voucher => voucher.voucher).join('+')}`,
    channel,
    date: first.date,
    name,
    contract: first.contract,
    vehicle: first.vehicle,
    vouchers: vouchers.map(voucher => voucher.voucher),
    last4,
    brand,
    ref,
    columns,
    cents: sumCents(vouchers),
    others: lines.filter(line => line.field === 'others').map(line => line.description),
    notes: [],
    ...extra
  };
}

/**
 * @param {{caryaati?, link?, bank?}} reports parsed reports (any may be missing)
 * @returns reconciliation result: entries to add, matches, exceptions and totals
 */
export function reconcile({ caryaati = null, link = null, bank = null }) {
  const result = {
    date: caryaati?.date || link?.date || bank?.date || '',
    entries: [],
    exceptions: [],
    cash: { cents: 0, vouchers: [] },
    link: { report: Boolean(link), matched: [], unmatched: [] },
    pos: { report: Boolean(bank), matched: [], unmatched: [], voided: [] },
    warnings: []
  };
  if (!caryaati) return result;

  const vouchers = caryaati.vouchers;
  const card = vouchers.filter(voucher => voucher.method === 'card');
  const used = new Set();
  const free = list => list.filter(voucher => !used.has(voucher));

  // Cash: reported only (entered manually in Received).
  const cashVouchers = vouchers.filter(voucher => voucher.method === 'cash');
  result.cash = { cents: sumCents(cashVouchers), vouchers: cashVouchers, customers: new Set(cashVouchers.map(voucher => voucher.contract || voucher.customer)).size };

  // 1) Payment links: contract number in the order id, then card digits, then amount.
  const pendingLinks = [];
  if (link) {
    const order = link.txns.slice().sort((a, b) => b.cents - a.cents);
    order.forEach(txn => {
      let chosen = null;
      const byContract = txn.contract ? free(card).filter(voucher => voucher.contract === txn.contract) : [];
      const sameCard = byContract.filter(voucher => !txn.last4 || !voucher.last4 || voucher.last4 === txn.last4);
      chosen = findSubset(sameCard, txn.cents) || findSubset(byContract, txn.cents);
      if (!chosen && txn.last4) {
        const byCard = free(card).filter(voucher => voucher.last4 === txn.last4);
        for (const group of groupBy(byCard, voucher => voucher.contract).values()) {
          chosen = findSubset(group, txn.cents);
          if (chosen) break;
        }
      }
      if (chosen) {
        chosen.forEach(voucher => used.add(voucher));
        const how = [txn.contract && chosen[0].contract === txn.contract ? 'contract' : '', txn.last4 && chosen.some(voucher => voucher.last4 === txn.last4) ? 'card digits' : '', 'amount'].filter(Boolean);
        const entry = makeEntry('link', chosen, { status: 'matched', match: txn, matchedBy: how });
        if (txn.date && entry.date && txn.date !== entry.date) entry.notes.push(`Link paid on ${txn.date.split('-').reverse().join('/')}, posted in Caryaati on ${entry.date.split('-').reverse().join('/')}.`);
        if (txn.last4 && entry.last4 && txn.last4 !== entry.last4) entry.notes.push(`Card digits differ: link ****${txn.last4}, Caryaati ****${entry.last4}.`);
        result.entries.push(entry);
        result.link.matched.push({ txn, entry });
      } else {
        pendingLinks.push(txn); // retried after the card-machine matching (split postings)
      }
    });
  }

  // 2) Bank POS (card machine): card digits + amount, per contract first.
  if (bank) {
    const live = bank.txns.filter(txn => !txn.voided);
    result.pos.voided = bank.txns.filter(txn => txn.voided && txn.cents > 0);
    live.slice().sort((a, b) => b.cents - a.cents).forEach(txn => {
      if (txn.cents <= 0) {
        result.pos.unmatched.push(txn);
        result.exceptions.push({ kind: 'pos-refund', severity: 'warn', txn, cents: txn.cents, title: `Bank ${txn.type.toLowerCase().replace(/_/g, ' ')} of AED ${(Math.abs(txn.cents) / 100).toFixed(2)}`, detail: `Card ****${txn.last4} · no matching sale in the report` });
        return;
      }
      let chosen = null;
      const pool = free(card).filter(voucher => voucher.last4 === txn.last4 && !voucher.viaLink);
      const groups = [...groupBy(pool, voucher => voucher.contract).values()].sort((a, b) => Math.abs(sumCents(a) - txn.cents) - Math.abs(sumCents(b) - txn.cents));
      for (const group of groups) { chosen = findSubset(group, txn.cents); if (chosen) break; }
      if (!chosen) chosen = findSubset(pool, txn.cents);
      if (chosen) {
        chosen.forEach(voucher => used.add(voucher));
        result.entries.push(makeEntry('card', chosen, { status: 'matched', match: txn, matchedBy: ['card digits', 'amount'] }));
        result.pos.matched.push({ txn });
      } else {
        result.pos.unmatched.push(txn);
        const near = free(card).filter(voucher => voucher.last4 === txn.last4);
        result.exceptions.push({ kind: 'pos-unmatched', severity: 'error', txn, cents: txn.cents, title: `Bank POS payment not found in Caryaati`, detail: `AED ${(txn.cents / 100).toFixed(2)} · card ${txn.bin}…${txn.last4} · auth ${txn.auth}${near.length ? ` · Caryaati has ****${txn.last4} for AED ${(sumCents(near) / 100).toFixed(2)}` : ''}` });
      }
    });
  }

  // 2b) Payment links still unmatched: one link payment may have been posted in Caryaati over
  //     several contracts (or under a different contract / card). Search the card postings
  //     left after the card-machine matching: first those related by contract, card digits or
  //     customer, then (amount only) any leftover card posting.
  pendingLinks.forEach(txn => {
    const pool = free(card);
    const norm = text => String(text || '').toUpperCase().replace(/[^A-Z]/g, '');
    const contractVouchers = txn.contract ? vouchers.filter(voucher => voucher.contract === txn.contract) : [];
    const customers = new Set(contractVouchers.map(voucher => norm(voucher.customer)).filter(Boolean));
    const related = pool.filter(voucher => (txn.contract && voucher.contract === txn.contract)
      || (txn.last4 && voucher.last4 === txn.last4)
      || customers.has(norm(voucher.customer)));
    let chosen = related.length ? findSubset(related, txn.cents) : null;
    let how = chosen ? ['related contract / card / customer', 'amount'] : null;
    if (!chosen && pool.length && pool.length <= 18) {
      chosen = findSubset(pool, txn.cents);
      how = chosen ? ['amount only'] : null;
    }
    if (!chosen) {
      result.link.unmatched.push(txn);
      result.exceptions.push({ kind: 'link-unmatched', severity: 'error', txn, cents: txn.cents, title: `Payment link ${txn.order || txn.rrn} not found in Caryaati`, detail: `AED ${(txn.cents / 100).toFixed(2)} · card ****${txn.last4 || '----'} · ${txn.date}${txn.contract ? ` · contract ${txn.contract}` : ''}` });
      return;
    }
    chosen.forEach(voucher => used.add(voucher));
    const groups = [...groupBy(chosen, voucher => voucher.contract || voucher.customer).values()];
    const label = txn.order || txn.rrn;
    const parts = groups.map(group => `${group[0].contract || group[0].customer} (${(sumCents(group) / 100).toFixed(2)})`);
    groups.forEach(group => {
      const entry = makeEntry('link', group, { status: 'matched', match: txn, matchedBy: how, split: groups.length > 1 });
      entry.notes.push(groups.length > 1
        ? `Part of one payment-link payment ${label} of AED ${(txn.cents / 100).toFixed(2)}, posted over ${groups.length} contracts: ${parts.join(', ')}.`
        : `Payment link ${label} (contract ${txn.contract || '—'}) was posted in Caryaati under contract ${entry.contract}.`);
      if (how[0] === 'amount only') entry.notes.push('Matched by amount only: please check.');
      result.entries.push(entry);
    });
    result.link.matched.push({ txn, entries: groups.length });
    result.exceptions.push({
      kind: groups.length > 1 ? 'link-split' : 'link-other-contract',
      severity: how[0] === 'amount only' ? 'warn' : 'info',
      txn,
      cents: txn.cents,
      title: groups.length > 1
        ? `Payment link ${label} was posted over ${groups.length} contracts`
        : `Payment link ${label} was posted under another contract`,
      detail: `AED ${(txn.cents / 100).toFixed(2)} · card ****${txn.last4 || '----'}${txn.contract ? ` · link contract ${txn.contract}` : ''} · Caryaati: ${parts.join(', ')}${how[0] === 'amount only' ? ' · matched by amount only' : ''}`
    });
  });

  // 3) Card postings not found in either report (still entered, flagged).
  const leftoverCard = free(card);
  groupBy(leftoverCard, voucher => `${voucher.contract}|${voucher.last4}`).forEach(group => {
    const viaLink = group.some(voucher => voucher.viaLink);
    const entry = makeEntry(viaLink ? 'link' : 'card', group, { status: (link || bank) ? 'unmatched' : 'unverified' });
    if (link || bank) {
      entry.notes.push(`Not found in the ${[link ? 'payment-link' : '', bank ? 'bank POS' : ''].filter(Boolean).join(' or ')} report.`);
      result.exceptions.push({ kind: 'caryaati-unmatched', severity: 'error', entry, cents: entry.cents, title: `Caryaati card payment not found in ${bank && link ? 'bank or link report' : bank ? 'bank report' : 'link report'}`, detail: `${entry.name} · CN ${entry.contract} · ****${entry.last4 || '----'} · AED ${(entry.cents / 100).toFixed(2)}` });
    }
    group.forEach(voucher => used.add(voucher));
    result.entries.push(entry);
  });

  // 4) Bank transfers: entered, not verifiable with these reports.
  const transfers = vouchers.filter(voucher => voucher.method === 'bank');
  groupBy(transfers, voucher => `${voucher.contract}|${voucher.ref}`).forEach(group => {
    result.entries.push(makeEntry('bank', group, { status: 'unverified' }));
  });

  // 5) Anything else (unknown / other payment text) → shown, not added by default.
  vouchers.filter(voucher => voucher.method === 'unknown' || voucher.method === 'other').forEach(voucher => {
    const entry = makeEntry('unknown', [voucher], { status: 'unknown' });
    entry.notes.push('Payment method could not be read from Caryaati.');
    result.entries.push(entry);
    result.exceptions.push({ kind: 'unknown-method', severity: 'warn', entry, cents: entry.cents, title: `Payment method unknown for ${voucher.voucher}`, detail: `${voucher.customer} · AED ${(voucher.cents / 100).toFixed(2)}` });
  });

  // Sort entries like the Caryaati report (by first voucher).
  const order = new Map(vouchers.map((voucher, index) => [voucher.voucher, index]));
  result.entries.sort((a, b) => order.get(a.vouchers[0]) - order.get(b.vouchers[0]));

  // Totals and comparisons.
  const byChannel = channel => result.entries.filter(entry => entry.channel === channel).reduce((sum, entry) => sum + entry.cents, 0);
  const linkTotal = link ? link.txns.reduce((sum, txn) => sum + txn.cents, 0) : null;
  const posTotal = bank ? (bank.totals.grossCents ?? bank.sumCents) : null;
  result.totals = {
    caryaati: sumCents(vouchers),
    cash: result.cash.cents,
    card: sumCents(card),
    link: byChannel('link'),
    pos: byChannel('card'),
    bank: byChannel('bank'),
    unknown: byChannel('unknown'),
    nonCash: sumCents(vouchers) - result.cash.cents,
    linkReport: linkTotal,
    // Fees shown as gross − net so the figures on screen always add up.
    linkFees: link ? linkTotal - link.txns.reduce((sum, txn) => sum + txn.netCents, 0) : null,
    linkNet: link ? link.txns.reduce((sum, txn) => sum + txn.netCents, 0) : null,
    posReport: posTotal,
    posFees: bank && bank.totals.netCents != null ? posTotal - bank.totals.netCents : null,
    posNet: bank ? bank.totals.netCents : null
  };
  result.totals.linkDiff = linkTotal == null ? null : result.totals.link - linkTotal;
  result.totals.posDiff = posTotal == null ? null : result.totals.pos - posTotal;
  result.totals.cardDiff = (linkTotal == null || posTotal == null) ? null : result.totals.card - linkTotal - posTotal;

  // Report dates should agree.
  const iso = value => value ? value.split('-').reverse().join('/') : '';
  if (link && caryaati.date && link.dates.some(date => date !== caryaati.date)) {
    const other = link.txns.filter(txn => txn.date !== caryaati.date);
    result.warnings.push(`${other.length} payment-link payment${other.length === 1 ? ' is' : 's are'} dated ${[...new Set(other.map(txn => iso(txn.date)))].join(', ')} (Caryaati report: ${iso(caryaati.date)}).`);
  }
  if (bank && caryaati.date && bank.date && bank.date !== caryaati.date) result.warnings.push(`The bank report is for ${iso(bank.date)} but the Caryaati report is for ${iso(caryaati.date)}.`);
  if (caryaati.dates.length > 1) result.warnings.push(`The Caryaati report contains several dates: ${caryaati.dates.map(iso).join(', ')}.`);
  if (!link) result.warnings.push('No payment-link report: link payments cannot be told apart from card-machine payments.');
  if (!bank) result.warnings.push('No bank POS report: card payments are entered without bank verification.');
  return result;
}
