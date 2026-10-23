/* Fines Tax Invoice PDF generator — replicates "Fines Invoice.pdf" (A4, Poppins, PCR logo).
   Works in the browser (needs jsPDF + invoice-assets.js) and in Node for testing. */
(function (root) {
"use strict";

const COMPANY = {
  name: 'Premium Car Rental DMCC',
  addr1: 'JBC-1 Cluster G - JLT , Lobby area',
  addr2: 'DUBAI UAE',
  trn: '100035111200003'
};

/* ---- small helpers ---- */
const num = v => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v == null ? '' : v).replace(/[,\s\u00a0]/g, ''));
  return isNaN(n) ? 0 : n;
};
const fmt = n => String(Math.round((n + Number.EPSILON) * 100) / 100);           // 353.5 / 300 / 187.75
const clean = s => String(s == null ? '' : s).replace(/\u00a0/g, ' ')
  .replace(/[^\u0020-\u007E\u00A0-\u017F\u2010-\u2027\u2030-\u203A\u20AC]/g, '').replace(/\s+/g, ' ').trim();
function today() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/* ---- geometry (taken from the reference PDF, points, origin top-left) ---- */
const X0 = 14.7, X1 = 240.6, X2 = 325.2, X3 = 387.3, X4 = 489.9, X5 = 543.0, X6 = 579.9;   // vertical lines
const ROW = 15.3, LW = 0.9, ROWS_PER_PAGE = 24;
const GREY = [129, 130, 133];

function build(JsPDF, inv, assets) {
  assets = assets || root.INV_ASSETS;
  const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
  doc.addFileToVFS('Poppins-Regular.ttf', assets.poppinsRegular);
  doc.addFont('Poppins-Regular.ttf', 'Poppins', 'normal');
  doc.setProperties({ title: 'Fines Tax Invoice - ' + inv.customer, author: COMPANY.name });

  const T = (s, x, y, o) => {
    o = o || {};
    doc.setFont('Poppins', 'normal');
    doc.setFontSize(o.size || 9);
    const c = o.color || [0, 0, 0];
    doc.setTextColor(c[0], c[1], c[2]);
    if (o.bold || o.sw) {                       // the reference PDF fakes bold with a thin stroke
      doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(o.sw || 0.35);
      doc.text(String(s), x, y, { align: o.align || 'left', renderingMode: 'fillThenStroke' });
    } else doc.text(String(s), x, y, { align: o.align || 'left' });
  };
  const W = (s, size) => { doc.setFont('Poppins', 'normal'); doc.setFontSize(size); return doc.getTextWidth(String(s)); };
  const rect = (x, y, w, h, col) => { doc.setFillColor.apply(doc, col || [0, 0, 0]); doc.rect(x, y, w, h, 'F'); };
  const hl = (xa, xb, y) => rect(xa, y, xb - xa + LW, LW);
  const vl = (x, ya, yb) => rect(x, ya, LW, yb - ya + LW);
  const wrap = (s, size, maxW) => {
    const words = String(s).split(' '), lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (cur && W(t, size) > maxW) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur); return lines;
  };

  /* ---------- header (first page only) ---------- */
  T(COMPANY.name, 21.9, 38.1, { bold: true });
  T(COMPANY.addr1, 21.9, 65.1, { bold: true });
  T(COMPANY.addr2, 21.9, 92.1, { bold: true });
  doc.addImage(assets.logo, 'PNG', 249.75, 15, 96, 69.3);                       // logo.png (centred)
  T('PREMIUM CAR RENTALS', 297.75, 97, { size: 7.2, bold: true, align: 'center' });   // company name as text under the logo
  T('Fines Tax Invoice', 297.75, 130.8, { size: 19.2, align: 'center', sw: 0.25 });
  T('TRN No: ' + COMPANY.trn, 297.7, 147.9, { bold: true, align: 'center' });

  /* ---------- bill-to block ---------- */
  T('BILL TO CUSTOMER ID : ' + (inv.customerId || ''), 20.1, 170.4, { size: 10.8, color: [16, 15, 15] });
  const S = 10.8, LX = 20.1, VX = 76.0;
  // Customer name (shrinks if very long so it never touches the right-hand block)
  const custLbl = 'Customer:';
  let cs = S; const cw = () => W(custLbl, cs) + W(inv.customer, cs);
  while (cw() > 296 - LX && cs > 7) cs -= 0.2;
  T(custLbl, LX, 187.5, { size: cs });
  T(inv.customer, LX + W(custLbl, cs), 187.5, { size: cs });
  T('Mobile No.', LX, 203.7, { size: S });
  T(inv.mobile, LX + W('Mobile No.', S), 203.7, { size: S });
  T('Email', LX, 219.9, { size: S });
  T(inv.email, VX, 219.9, { size: S });
  T('Vehicle:', LX, 236.1, { size: S });
  let vs = S; while (W(inv.vehicle, vs) > 296 - VX && vs > 7) vs -= 0.2;
  T(inv.vehicle, VX, 236.1, { size: vs });
  T('Address', LX, 252.3, { size: S });
  T(inv.address || '', VX, 252.3, { size: S });

  T('Date', 319.0, 185.7, { size: S });            T(inv.date, 575.4, 185.7, { size: S, align: 'right' });
  T('Invoice#', 319.0, 201.9, { size: S });
  let is = S; const invMax = 575.4 - 319.0 - W('Invoice#', S) - 8;           // shrink if several invoice numbers are combined
  while (W(inv.invoiceNo || '', is) > invMax && is > 5.5) is -= 0.2;
  T(inv.invoiceNo || '', 575.4, 201.9, { size: is, align: 'right' });
  T('Contract No.', 319.0, 218.1, { size: S });    T(inv.contract, 575.4, 218.1, { size: S, align: 'right' });
  T('LPO/BID #', 319.0, 234.3, { size: S });       T('-', 575.4, 234.3, { size: S, align: 'right' });

  /* ---------- table ---------- */
  const lines = inv.lines;
  const chunks = [];
  for (let i = 0; i < lines.length; i += ROWS_PER_PAGE) chunks.push(lines.slice(i, i + ROWS_PER_PAGE));
  if (!chunks.length) chunks.push([]);
  const sub = lines.reduce((s, l) => s + l.total, 0);

  chunks.forEach((chunk, ci) => {
    const first = ci === 0, last = ci === chunks.length - 1;
    if (!first) doc.addPage();
    const y0 = first ? 262.2 : 40;                     // top line of table header
    // header row 1 (DESCRIPTION | CALCULATION)
    rect(X0 + LW, y0 + LW, 565.2 - 0, ROW, GREY);
    T('DESCRIPTION', 15.6, y0 + 10.8, { bold: true, color: [16, 15, 15] });
    T('CALCULATION', 241.7, y0 + 10.8, { bold: true, color: [255, 255, 255] });
    hl(X0, X6, y0); vl(X0, y0, y0 + ROW); vl(X1, y0, y0 + ROW); vl(X6, y0, y0 + ROW);
    // header row 2 (Fine | Fine Charge | RTA Fees | Surcharge)
    const y1 = y0 + ROW;
    rect(X1 + LW, y1 + LW, X4 - X1 - LW, ROW - LW, GREY);
    T('Fine', 15.6, y1 + 10.8);
    T('Fine Charge', (X1 + X2) / 2 + 0.45, y1 + 10.8, { bold: true, align: 'center', color: [16, 15, 15] });
    T('RTA Fees', (X2 + X3) / 2 + 0.45, y1 + 10.8, { bold: true, align: 'center', color: [16, 15, 15] });
    T('Surcharge', (X3 + X4) / 2 + 0.45, y1 + 10.8, { bold: true, align: 'center', color: [16, 15, 15] });
    hl(X0, X6, y1);
    [X0, X1, X2, X3, X4, X5, X6].forEach(x => vl(x, y1, y1 + ROW));
    // item rows
    let y = y1 + ROW;
    chunk.forEach(l => {
      hl(X0, X6, y);
      [X0, X1, X2, X3, X4, X5, X6].forEach(x => vl(x, y, y + ROW));
      const by = y + 10.8;
      let ds = 9; const desc = `Fine Payment for Fine no. ${l.fineNo} (${l.plate})`;
      while (W(desc, ds) > X1 - 18 && ds > 6) ds -= 0.2;
      T(desc, 15.6, by, { size: ds });
      T(fmt(l.fine), (X1 + X2) / 2 + 0.45, by, { align: 'center' });
      T(fmt(l.rta), (X2 + X3) / 2 + 0.45, by, { align: 'center' });
      T(fmt(l.sur), (X3 + X4) / 2 + 0.45, by, { align: 'center' });
      T(fmt(l.total), 579.9, by, { align: 'right' });
      y += ROW;
    });
    hl(X0, X6, y);

    if (!last) {                                       // continuation page: close the table
      hl(X0, X6, y); return;
    }

    /* ---------- lower block (signature area + totals) ---------- */
    const t = y;                                       // top of lower block
    [X0, X4, X5, X6].forEach(x => vl(x, t, t + 110.7));
    [21.6, 43.2, 58.5, 80.1, 109.8].forEach(d => hl(X4, X6, t + d));
    hl(X0, X6, t + 109.8);
    let ts = 13.5; while (W(fmt(sub), ts) > 36 && ts > 7) ts -= 0.25;       // keep long totals inside the narrow cell
    T('Subtotal', 490.9, t + 14.4);                    T(fmt(sub), 579.9, t + 16.2, { size: ts, align: 'right' });
    T('Discount', 490.9, t + 36.0);                    T('0', 579.9, t + 37.8, { size: 13.5, align: 'right' });
    T('VAT', 490.9, t + 54.0);                         T('5%', 579.9, t + 54.0, { align: 'right' });
    T('TOTAL', 490.9, t + 72.9, { bold: true });       T(fmt(sub), 579.9, t + 74.7, { size: ts, align: 'right' });
    T('Amount', 490.9, t + 90.9);                      T('Paid', 490.9, t + 105.3);
    T('0', 579.9, t + 100.8, { size: 13.5, align: 'right' });

    // customer name above the signature line (wrapped like the original)
    let ns = 9, nl = wrap(inv.customer, ns, 113.4);
    while (nl.length > 3 && ns > 6) { ns -= 0.5; nl = wrap(inv.customer, ns, 113.4); }
    const lastBase = t + 44.1;
    nl.forEach((s, i) => T(s, 29.8, lastBase - (nl.length - 1 - i) * 14.4, { size: ns }));
    rect(30.0, t + 48.6, 113.4, LW);  T('Customer Sign.', 86.7, t + 59.4, { align: 'center' });
    rect(352.2, t + 48.6, 128.7, LW); T('Officer Sign.', 416.55, t + 59.4, { align: 'center' });
    T('Thank You For Your Business!', 252.8, t + 88.2, { bold: true, align: 'center' });
  });
  return doc;
}

/* group spreadsheet rows -> invoice objects.  rows: parsed fine rows (see index.html) */
function makeInvoices(rows, combine, date) {
  const groups = new Map();
  rows.forEach((r, i) => {
    const key = combine ? clean(r.customer).toUpperCase() + '|' + r.contract : 'row' + i;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  const uniq = a => [...new Set(a.filter(Boolean))];
  const out = [];
  groups.forEach(g => {
    const f = g[0];
    out.push({
      customer: clean(f.customer),
      customerId: '',
      mobile: clean(f.mobile).replace(/\s+/g, ''),
      email: clean(f.email),
      vehicle: uniq(g.map(r => clean(r.plate))).join(', '),
      address: '',
      invoiceNo: uniq(g.map(r => clean(r.invoiceNo)))[0] || '',      // several fines -> just one invoice number (the first one)
      date: date || today(),
      contract: uniq(g.map(r => clean(r.contract))).join(', '),
      lines: g.map(r => ({ fineNo: r.fineNo, plate: clean(r.plate), fine: r.fine, rta: r.rta, sur: r.sur, total: r.total }))
    });
  });
  return out;
}

root.InvoicePDF = { build, makeInvoices, num, fmt, clean, today };
if (typeof module !== 'undefined' && module.exports) module.exports = root.InvoicePDF;
})(typeof window !== 'undefined' ? window : globalThis);
