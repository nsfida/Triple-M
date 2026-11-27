/*
 * Reads Dubai RTA "Receipt for Vehicle Renewal" PDFs (the receipts downloaded from the
 * RTA portal) and turns each receipt into structured data.
 *
 * Works on PDF.js text items (text + position), so it does not depend on the order in
 * which the PDF stores its text:
 *   - Header values (Payment Date, Receipt No, ...) are the items to the right of
 *     their English label on the same line.
 *   - Fee rows: the English description is in the left column and the amount is the
 *     right-aligned number on the same line. Descriptions that wrap onto a second line
 *     (no amount on that line) are joined to the row above.
 *   - A receipt can continue on the next page (page "1 of 2"): pages without a
 *     "Receipt No" header belong to the receipt before them.
 *   - Every receipt is checked: the fee lines must add up exactly to the printed
 *     Total Amount, otherwise the receipt is flagged and not imported.
 *
 * Pure module (no DOM), so it runs in the browser and in Node for testing.
 */

const LINE_TOLERANCE = 3.5; // points: items whose vertical centres are this close share a line
const AMOUNT_RE = /^\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$|^\d+(?:\.\d{1,2})?$/;

function toCents(text) {
  return Math.round(Number(String(text).replace(/,/g, '')) * 100);
}

function clean(text) {
  return String(text ?? '')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '') // bidi control marks
    .replace(/\s+/g, ' ')
    .trim();
}

function hasArabic(text) {
  return /[؀-ۿﭐ-﷿ﹰ-﻿]/.test(text);
}

function dmyToIso(text) {
  const match = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(String(text ?? ''));
  if (!match) return '';
  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Fee line classification
// ---------------------------------------------------------------------------
// category: 'renewal' | 'fine' | 'knowledge' | 'passing' | 'other'

const KNOWLEDGE_RE = /knowledge|innovation/i;
const PASSING_RE = /technical\s+(?:inspection|test)|vehicle\s+(?:inspection|test(?:ing)?)|testing\s+fee|passing/i;
const RENEWAL_RE = /renewal|\bregister\b|registration|delivery\s+fee|\bplates?\b|ownership|possession\s+certificate/i;
const FINE_RE = /\bfines?\b|violation|penalt/i;
// Dubai Police violations are listed by their description only (no "Fine No.").
const VIOLATION_RE = /exceed|speed|fail(?:ure|ed|ing)?\b|abide|lane|signal|red\s+light|overtak|seat\s*belt|mobile|phone|tint|noise|reckless|stopping|parking|priority|traffic\s+sign|instruction|block|tailgat|distance|u-?turn|pedestrian|overload|expired|without\s+(?:a\s+)?licen[cs]e|black\s*point|impound|smoke|horn|light/i;

function fineAuthority(description) {
  const text = description.toLowerCase();
  if (/rta\s*\(parking/.test(text) || /parking\s+fines?/.test(text)) return { authority: 'RTA Parking', dubai: true };
  if (/bus\s+lane/.test(text)) return { authority: 'RTA Bus Lane', dubai: true };
  if (/salik/.test(text)) return { authority: 'Salik', dubai: true };
  if (/\brta\b/.test(text)) return { authority: 'RTA', dubai: true };
  if (/dubai\s+police/.test(text)) return { authority: 'Dubai Police', dubai: true };
  if (/department\s+of\s+transport/.test(text) && /abu\s*dhabi/.test(text)) return { authority: 'Abu Dhabi DoT', dubai: false };
  if (/abu\s*dhabi/.test(text)) return { authority: 'Abu Dhabi Police', dubai: false };
  if (/sharjah\s+municipality/.test(text)) return { authority: 'Sharjah Municipality', dubai: false };
  if (/sharjah/.test(text)) return { authority: 'Sharjah Police', dubai: false };
  if (/ajman/.test(text)) return { authority: 'Ajman Police', dubai: false };
  if (/ras\s+al|rak\b/.test(text)) return { authority: 'RAK Police', dubai: false };
  if (/umm\s+al|uaq\b/.test(text)) return { authority: 'UAQ Police', dubai: false };
  if (/fujairah/.test(text)) return { authority: 'Fujairah Police', dubai: false };
  if (/dubai\s+municipality/.test(text)) return { authority: 'Dubai Municipality', dubai: true };
  if (/fine\s+no/.test(text)) {
    const prefix = clean(description.replace(/fines?\s+no\.?.*$/i, '').replace(/\btraffic\b/i, ''));
    return { authority: prefix ? `${prefix} Fine`.slice(0, 40) : 'Traffic Fine', dubai: false };
  }
  // Description-only violations on Dubai receipts are Dubai Police fines.
  return { authority: 'Dubai Police', dubai: true };
}

function shortViolation(description) {
  const text = description.replace(/\/\s*$/, '').trim();
  const speed = /speed\s+limit\s+by\s+not\s+more\s+than\s+(\d+)/i.exec(text);
  if (speed) return `Speeding +${speed[1]} km/h`;
  if (/lane\s+discipline/i.test(text)) return 'Lane discipline';
  if (/traffic\s+signs/i.test(text)) return 'Traffic signs';
  if (/priority/i.test(text)) return 'Not giving priority';
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export function classifyFeeLine(description) {
  const text = clean(description);
  if (KNOWLEDGE_RE.test(text)) return { category: 'knowledge' };
  const fineNumber = /fines?\s+no\.?\s*[:#]?\s*([A-Za-z0-9-]{4,})/i.exec(text)?.[1] || '';
  if (fineNumber || FINE_RE.test(text)) {
    return { category: 'fine', fineNumber, ...fineAuthority(text), violation: fineNumber ? '' : shortViolation(text) };
  }
  if (PASSING_RE.test(text)) return { category: 'passing' };
  if (RENEWAL_RE.test(text)) return { category: 'renewal' };
  if (VIOLATION_RE.test(text)) {
    return { category: 'fine', fineNumber: '', ...fineAuthority(text), violation: shortViolation(text) };
  }
  return { category: 'other' };
}

// ---------------------------------------------------------------------------
// Page reading
// ---------------------------------------------------------------------------

async function readPageItems(page) {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = [];
  for (const item of content.items) {
    const str = clean(item.str);
    if (!str) continue;
    const height = Math.abs(item.transform[3]) || item.height || 8;
    const x = item.transform[4];
    const top = viewport.height - item.transform[5] - height;
    items.push({ str, x, right: x + (item.width || 0), y: top + height / 2, width: item.width || 0, pageWidth: viewport.width });
  }
  return { items, width: viewport.width, height: viewport.height };
}

function sameLine(a, b) {
  return Math.abs(a.y - b.y) <= LINE_TOLERANCE;
}

function findLabel(items, regex) {
  return items.filter(item => regex.test(item.str)).sort((a, b) => a.y - b.y);
}

// Value of a header field: the left-most item to the right of the label on its line.
function headerValue(items, labelRegex, { valueRegex = null, index = 0, allowArabic = false } = {}) {
  const labels = findLabel(items, labelRegex);
  const label = labels[index];
  if (!label) return '';
  const candidates = items
    .filter(item => item !== label && item.x > label.right + 2 && item.x < label.pageWidth * 0.84 && Math.abs(item.y - label.y) <= 6 && (allowArabic || !hasArabic(item.str)))
    .filter(item => !valueRegex || valueRegex.test(item.str))
    .sort((a, b) => Math.abs(a.y - label.y) - Math.abs(b.y - label.y) || a.x - b.x);
  return candidates[0]?.str || '';
}

function parseHeader(items) {
  const receiptNo = headerValue(items, /^Receipt No\s*:?$/i, { valueRegex: /^\d{6,}$/ });
  if (!receiptNo) return null;
  const dateTime = headerValue(items, /^Date\s*:?$/i, { valueRegex: /\d{1,2}-\d{1,2}-\d{4}/ });
  const paymentDate = headerValue(items, /^Payment Date\s*:?$/i, { valueRegex: /\d{1,2}-\d{1,2}-\d{4}/ });
  const methodText = headerValue(items, /^Payment Method\s*:?$/i, { allowArabic: true, valueRegex: /[A-Za-z]/ });
  return {
    receiptNo,
    referenceNo: headerValue(items, /^Reference No\s*:?$/i, { valueRegex: /^[A-Z]{2,}-?\d+|^\d+$/ }),
    trafficFileNo: headerValue(items, /^Traffic File No\s*:?$/i, { valueRegex: /^\d+$/ }),
    receivedFrom: items.find(item => /^Received From/i.test(item.str))
      ? (items.filter(item => !hasArabic(item.str) && /[A-Za-z]/.test(item.str) && item.x > item.pageWidth * 0.6 && item.x < item.pageWidth * 0.84)
        .find(item => { const label = findLabel(items, /^Received From/i)[0]; return item.y > label.y + 4 && item.y < label.y + 40; })?.str || '')
      : '',
    paymentDate: dmyToIso(paymentDate) || dmyToIso(dateTime),
    dateTime: clean(dateTime),
    paymentMethod: clean(methodText.replace(/[()]/g, ' ').replace(/[؀-ۿﭐ-﷿ﹰ-﻿]+/g, '')),
    serviceTitle: items.some(item => /Receipt for Vehicle Renewal/i.test(item.str)) ? 'Vehicle Renewal' : ''
  };
}

// Reads the fee rows of one page. Returns { lines, totalCents|null }.
function parseFeeTable(items, pageWidth) {
  const header = findLabel(items, /^Fees Description$/i)[0];
  if (!header) return { lines: [], totalCents: null, found: false };
  const totalLabel = items.find(item => /Total Amount/i.test(item.str) && item.y > header.y);
  const footer = findLabel(items, /^Customer copy$/i).find(item => item.y > header.y);
  const bottom = totalLabel ? totalLabel.y - LINE_TOLERANCE : (footer ? footer.y - 6 : Infinity);
  const top = header.y + LINE_TOLERANCE;

  const region = items.filter(item => item.y > top && item.y < bottom);
  // Amounts: numbers right-aligned in the "Fee" column (right part of the page).
  const amounts = region
    .filter(item => AMOUNT_RE.test(item.str) && item.x > pageWidth * 0.82)
    .sort((a, b) => a.y - b.y);
  // English descriptions: left column (the Arabic text is in the middle column).
  const english = region
    .filter(item => item.x < pageWidth * 0.45 && !hasArabic(item.str))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const lines = [];
  amounts.forEach(amount => {
    const parts = english.filter(item => sameLine(item, amount));
    parts.forEach(item => { item.used = true; });
    lines.push({ y: amount.y, description: clean(parts.map(item => item.str).join(' ')), cents: toCents(amount.str) });
  });
  // Wrapped description lines (no amount on their own line) belong to the row above.
  english.filter(item => !item.used).forEach(item => {
    const owner = [...lines].reverse().find(line => line.y < item.y);
    if (owner) owner.description = clean(`${owner.description} ${item.str}`);
    else if (lines[0]) lines[0].description = clean(`${item.str} ${lines[0].description}`);
  });

  let totalCents = null;
  if (totalLabel) {
    const totalAmount = items
      .filter(item => AMOUNT_RE.test(item.str) && item.x > pageWidth * 0.82 && Math.abs(item.y - totalLabel.y) <= 6)
      .sort((a, b) => Math.abs(a.y - totalLabel.y) - Math.abs(b.y - totalLabel.y))[0];
    if (totalAmount) totalCents = toCents(totalAmount.str);
  }
  return { lines: lines.map(({ description, cents }) => ({ description, cents })), totalCents, found: true };
}

// ---------------------------------------------------------------------------
// Knowledge & Innovation fees
// ---------------------------------------------------------------------------
// RTA charges AED 20 "Knowledge & Innovation" per Dubai service on the receipt: the
// renewal itself and each Dubai fine (RTA parking, bus lane, Dubai Police). Fines from
// other emirates do not carry it. When the receipt matches that pattern exactly, each
// fee is attached to the item it belongs to; otherwise it stays with the renewal (or,
// on a fines-only receipt, is spread over the fines) and a note is added.
const KNOWLEDGE_FEE_CENTS = 2000;

function allocateKnowledge(receipt) {
  const knowledge = receipt.lines.filter(line => line.category === 'knowledge');
  const knowledgeCents = knowledge.reduce((sum, line) => sum + line.cents, 0);
  receipt.knowledgeCents = knowledgeCents;
  const fines = receipt.lines.filter(line => line.category === 'fine');
  fines.forEach(line => { line.knowledgeCents = 0; });
  receipt.renewalKnowledgeCents = 0;
  if (!knowledgeCents) { receipt.knowledgeRule = 'none'; return; }
  const hasRenewal = receipt.lines.some(line => line.category === 'renewal');
  const dubaiFines = fines.filter(line => line.dubai);
  const expected = KNOWLEDGE_FEE_CENTS * ((hasRenewal ? 1 : 0) + dubaiFines.length);
  if (expected === knowledgeCents) {
    if (hasRenewal) receipt.renewalKnowledgeCents = KNOWLEDGE_FEE_CENTS;
    dubaiFines.forEach(line => { line.knowledgeCents = KNOWLEDGE_FEE_CENTS; });
    receipt.knowledgeRule = 'per-item';
    return;
  }
  receipt.knowledgeRule = 'fallback';
  if (hasRenewal || !fines.length) {
    receipt.renewalKnowledgeCents = knowledgeCents;
  } else {
    // Fines-only receipt with an unexpected amount: spread evenly (remainder on the first).
    const share = Math.floor(knowledgeCents / fines.length);
    fines.forEach((line, i) => { line.knowledgeCents = share + (i === 0 ? knowledgeCents - share * fines.length : 0); });
  }
  receipt.warnings.push(`Knowledge & Innovation fees (AED ${(knowledgeCents / 100).toFixed(2)}) did not match the usual AED 20 per Dubai item, so they were ${hasRenewal || !fines.length ? 'kept with the renewal' : 'spread across the fines'}.`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {object} pdf  A PDF.js document (from pdfjs.getDocument(...).promise)
 * @param {string} fileName  For messages only
 * @returns {Promise<{fileName, receipts: object[], errors: string[], isRtaReceipt: boolean}>}
 */
export async function parseRtaReceiptPdf(pdf, fileName = '') {
  const receipts = [];
  const errors = [];
  let current = null;
  let sawRtaMarker = false;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const { items, width } = await readPageItems(page);
    page.cleanup?.();
    if (items.some(item => /Receipt for Vehicle Renewal|Fees Description|rta\.ae/i.test(item.str))) sawRtaMarker = true;

    const header = parseHeader(items);
    const table = parseFeeTable(items, width);
    if (header) {
      current = { ...header, fileName, pages: [pageNumber], lines: [], totalCents: null, warnings: [] };
      receipts.push(current);
    } else if (current && table.found) {
      current.pages.push(pageNumber); // continuation page of the previous receipt
    } else {
      if (table.found) errors.push(`Page ${pageNumber}: fee table found without a receipt header; skipped.`);
      continue;
    }
    current.lines.push(...table.lines);
    if (table.totalCents != null) current.totalCents = table.totalCents;
  }

  receipts.forEach(receipt => {
    receipt.lines = receipt.lines.map(line => ({ ...line, ...classifyFeeLine(line.description) }));
    receipt.linesCents = receipt.lines.reduce((sum, line) => sum + line.cents, 0);
    if (!receipt.paymentDate) receipt.warnings.push('Payment date could not be read.');
    if (receipt.totalCents == null) {
      receipt.error = 'The Total Amount could not be found on this receipt.';
    } else if (receipt.totalCents !== receipt.linesCents) {
      receipt.error = `Fee lines add up to AED ${(receipt.linesCents / 100).toFixed(2)} but the receipt total is AED ${(receipt.totalCents / 100).toFixed(2)}.`;
    } else if (!receipt.lines.length) {
      receipt.error = 'No fee lines were found on this receipt.';
    }
    receipt.lines.filter(line => !line.description).forEach(() => receipt.warnings.push('A fee line had no description.'));
    receipt.lines.filter(line => line.category === 'other').forEach(line => {
      receipt.warnings.push(`“${line.description}” is not a renewal fee or a fine; it will go to Misc Exp.`);
    });
    allocateKnowledge(receipt);
  });

  return { fileName, receipts, errors, isRtaReceipt: sawRtaMarker && receipts.length > 0 };
}
