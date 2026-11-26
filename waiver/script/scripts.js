/* =====================================================================
   Deposit Waiver Control Center — scripts.js
   ---------------------------------------------------------------------
   1. CONFIG & UTILITIES  – formatting, parsing (numbers / dates / phones)
   2. ENGINE              – report detection, normalisation, unification,
                            workflow stages, reconciliation checks
   3. API                 – Supabase RPC wrapper (session-token based)
   4. UI                  – login, views, tables, side panel, WhatsApp,
                            exports (Excel / CSV / PDF)
   ===================================================================== */
(function (global) {
'use strict';

/* =====================================================================
   1. CONFIG & UTILITIES
   ===================================================================== */
const CONFIG = Object.assign({
  SUPABASE_URL: 'https://fplgpqalwhyhextdnaor.supabase.co',
  SUPABASE_KEY: 'sb_publishable_Zcrg6tey3ENeMplqxy0fzg_smZP57q6',
  CHUNK_SIZE: 400,
  PDFJS: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  PDFJS_WORKER: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  APP_NAME: 'Deposit Waiver Control Center'
}, (global && global.DW_CONFIG) || {});

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12,
  january:1, february:2, march:3, april:4, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const U = {
  /** HTML-escape anything */
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  },
  /** Normalise a header: lower-case, alphanumerics only ("Contract no." → "contractno") */
  norm(h) { return String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, ''); },
  /** Collapse whitespace / non-breaking spaces */
  clean(s) { return s == null ? '' : String(s).replace(/[   \t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim(); },
  isBlank(v) { return v == null || (typeof v === 'string' && v.trim() === ''); },

  /** Robust number parser: 1,234.50 | "AED 1,234" | (123.00) | "-" | "" */
  num(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    let s = String(v).trim();
    if (!s || s === '-' || s === '--') return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
    s = s.replace(/[^0-9.\-]/g, '');
    if (!s || s === '.' || s === '-') return null;
    const n = parseFloat(s);
    if (!isFinite(n)) return null;
    return neg ? -Math.abs(n) : n;
  },
  num0(v) { const n = U.num(v); return n == null ? 0 : n; },
  r2(n) { return n == null ? null : Math.round((+n + Number.EPSILON) * 100) / 100; },

  /* ---------- dates: every format → {y,m,d,H,M,S} ---------- */
  fromSerial(v) {
    const ms = Math.round(v * 86400) * 1000;
    const d = new Date(Date.UTC(1899, 11, 30) + ms);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), H: d.getUTCHours(), M: d.getUTCMinutes(), S: d.getUTCSeconds() };
  },
  _year(y) { y = +y; return y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y; },
  _hour(h, ap) { h = +h; if (!ap) return h; ap = ap.toLowerCase(); if (ap === 'pm' && h < 12) return h + 12; if (ap === 'am' && h === 12) return 0; return h; },
  _valid(o) {
    if (!o || !o.y || o.m < 1 || o.m > 12 || o.d < 1 || o.d > 31 || o.y < 1950 || o.y > 2150) return null;
    const t = new Date(Date.UTC(o.y, o.m - 1, o.d));
    if (t.getUTCMonth() !== o.m - 1) return null;
    o.H = o.H || 0; o.M = o.M || 0; o.S = o.S || 0;
    if (o.H > 23 || o.M > 59 || o.S > 59) return null;
    return o;
  },
  /** Parse any date/time cell. Day-first for ambiguous numeric dates (UAE convention). */
  parseDT(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) {
      if (isNaN(v)) return null;
      return U._valid({ y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate(), H: v.getHours(), M: v.getMinutes(), S: v.getSeconds() });
    }
    if (typeof v === 'number') return (v > 18000 && v < 90000) ? U._valid(U.fromSerial(v)) : null;
    let s = U.clean(v);
    if (!s) return null;
    if (/^\d{5}(\.\d+)?$/.test(s)) return U.parseDT(parseFloat(s));
    const T = '(?:[ T,]+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?(?:\\.\\d+)?\\s*([AaPp]\\.?[Mm]\\.?)?)?';
    let m;
    // 25-Nov-2026 [6:37 PM] | 25 Nov 2026 | 25/Nov/26
    if ((m = s.match(new RegExp('^(\\d{1,2})[-\\s/.]+([A-Za-z]{3,9})[-\\s/.,]+(\\d{2,4})' + T + '$')))) {
      const mo = MONTHS[m[2].toLowerCase()]; if (!mo) return null;
      return U._valid({ y: U._year(m[3]), m: mo, d: +m[1], H: U._hour(m[4] || 0, m[7] && m[7].replace(/\./g, '')), M: +(m[5] || 0), S: +(m[6] || 0) });
    }
    // Nov 25, 2026 [time]
    if ((m = s.match(new RegExp('^([A-Za-z]{3,9})[-\\s/.]+(\\d{1,2})(?:st|nd|rd|th)?,?[-\\s/.]+(\\d{2,4})' + T + '$')))) {
      const mo = MONTHS[m[1].toLowerCase()]; if (!mo) return null;
      return U._valid({ y: U._year(m[3]), m: mo, d: +m[2], H: U._hour(m[4] || 0, m[7] && m[7].replace(/\./g, '')), M: +(m[5] || 0), S: +(m[6] || 0) });
    }
    // ISO 2026-11-25[T18:37[:00]][Z|+04:00]
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/))) {
      return U._valid({ y: +m[1], m: +m[2], d: +m[3], H: +(m[4] || 0), M: +(m[5] || 0), S: +(m[6] || 0) });
    }
    // Numeric d/m/y — day-first unless impossible
    if ((m = s.match(new RegExp('^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{2,4})' + T + '$')))) {
      let a = +m[1], b = +m[2], d, mo;
      if (a > 12) { d = a; mo = b; } else if (b > 12) { d = b; mo = a; } else { d = a; mo = b; }
      return U._valid({ y: U._year(m[3]), m: mo, d, H: U._hour(m[4] || 0, m[7] && m[7].replace(/\./g, '')), M: +(m[5] || 0), S: +(m[6] || 0) });
    }
    return null;
  },
  pad(n) { return String(n).padStart(2, '0'); },
  isoDate(v) { const o = U.parseDT(v); return o ? `${o.y}-${U.pad(o.m)}-${U.pad(o.d)}` : null; },
  isoDT(v) { const o = U.parseDT(v); return o ? `${o.y}-${U.pad(o.m)}-${U.pad(o.d)} ${U.pad(o.H)}:${U.pad(o.M)}:${U.pad(o.S)}` : null; },
  /** integer day number for date math (timezone-safe) */
  dayNum(v) { const o = U.parseDT(v); return o ? Math.floor(Date.UTC(o.y, o.m - 1, o.d) / 86400000) : null; },
  /** fractional days incl. time */
  dayFrac(v) { const o = U.parseDT(v); return o ? Date.UTC(o.y, o.m - 1, o.d, o.H, o.M, o.S) / 86400000 : null; },
  todayISO() { const d = new Date(); return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`; },
  todayNum() { return U.dayNum(U.todayISO()); },
  addDaysISO(iso, n) { const dn = U.dayNum(iso); if (dn == null) return null; const d = new Date((dn + n) * 86400000); return `${d.getUTCFullYear()}-${U.pad(d.getUTCMonth() + 1)}-${U.pad(d.getUTCDate())}`; },
  fmtDate(v) { const o = U.parseDT(v); return o ? `${U.pad(o.d)} ${MON_SHORT[o.m - 1]} ${o.y}` : ''; },
  fmtTime(o) { const h = o.H % 12 || 12; return `${h}:${U.pad(o.M)} ${o.H < 12 ? 'AM' : 'PM'}`; },
  fmtDT(v) { const o = U.parseDT(v); return o ? `${U.pad(o.d)} ${MON_SHORT[o.m - 1]} ${o.y}, ${U.fmtTime(o)}` : ''; },
  /** timestamptz from the DB → local display */
  fmtTS(v) { if (!v) return ''; const d = new Date(v); return isNaN(d) ? U.fmtDT(v) : U.fmtDT(d); },
  monthKey(v) { const o = U.parseDT(v); return o ? `${o.y}-${U.pad(o.m)}` : null; },
  monthLabel(k) { const [y, m] = k.split('-'); return `${MON_SHORT[+m - 1]} ${String(y).slice(2)}`; },
  toJSDate(v) { const o = U.parseDT(v); return o ? new Date(o.y, o.m - 1, o.d, o.H, o.M, o.S) : null; },

  money(v, cur) {
    if (v == null || v === '') return '';
    if (Math.abs(+v) < 0.005) v = 0;
    const s = Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return cur ? `${cur} ${s}` : s;
  },
  int(v) { return v == null ? '' : Number(v).toLocaleString('en-US'); },
  compact(v) {
    const n = Number(v) || 0, a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.0+$/, '') + 'M';
    if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  },
  plural(n, w, p) { return `${U.int(n)} ${n === 1 ? w : (p || w + 's')}`; },
  initials(name) { return U.clean(name).split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?'; },
  titleCase(s) {
    return U.clean(s).toLowerCase().replace(/(^|[\s\-'(])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  },
  escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); },
  sum(arr, f) { let t = 0; for (const x of arr) t += +(f ? f(x) : x) || 0; return U.r2(t); },
  groupBy(arr, f) { const m = new Map(); for (const x of arr) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; },
  debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  /* ---------- phones → WhatsApp-ready digits ---------- */
  phone(raw, cc) {
    cc = String(cc || '971');
    if (raw == null || raw === '') return { digits: '', valid: false, kind: 'missing', display: '' };
    let s = typeof raw === 'number' ? String(Math.round(raw)) : String(raw);
    let d = s.replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (!d) return { digits: '', valid: false, kind: 'missing', display: U.clean(s) };
    let out = d, kind = 'check';
    if (cc === '971') {
      if (/^9710\d{9}$/.test(d)) out = '971' + d.slice(4);
      else if (/^05\d{8}$/.test(d)) out = '971' + d.slice(1);
      else if (/^5\d{8}$/.test(d)) out = '971' + d;
      if (/^9715\d{8}$/.test(out)) kind = 'uae';
      else if (/^971[234679]\d{7}$/.test(out) || /^0?[234679]\d{7}$/.test(d)) kind = 'landline';
      else if (!out.startsWith('971') && /^[1-9]\d{10,14}$/.test(out)) kind = 'intl';
    } else {
      if (d.startsWith('0')) out = cc + d.slice(1);
      else if (!d.startsWith(cc)) out = cc + d;
      kind = /^\d{10,15}$/.test(out) ? 'local' : 'check';
    }
    const valid = kind === 'uae' || kind === 'intl' || kind === 'local';
    let display = '+' + out;
    if (kind === 'uae') display = `+971 ${out.slice(3, 5)} ${out.slice(5, 8)} ${out.slice(8)}`;
    return { digits: out, valid, kind, display };
  }
};

/* =====================================================================
   2. ENGINE
   ===================================================================== */

/* ---- report signatures: header aliases (normalised) per field ---- */
const REPORTS = {
  waivers: {
    key: 'waivers', label: 'Deposit Waivers', source: 'Caryaati', file: 'Caryaati Deposit Waivers Report',
    desc: 'Waiver contracts, open/close dates, waiver fee and ledger balance',
    signature: [['depositwieveramount', 'depositwaiveramount', 'waiveramount', 'depositwaiver', 'dwamount', 'waiverfee'], ['contractno', 'contractnumber', 'contract']],
    fields: {
      customer: ['customer', 'customername', 'name', 'client'],
      contract: ['contractno', 'contractnumber', 'contract', 'agreementno'],
      vehicle: ['vehicleno', 'vehicle', 'car', 'vehicledetails'],
      open: ['opendate', 'open', 'pickupdate', 'startdate'],
      close: ['closedate', 'close', 'dropoffdate', 'enddate'],
      status: ['status', 'contractstatus'],
      waiver: ['depositwieveramount', 'depositwaiveramount', 'waiveramount', 'depositwaiver', 'dwamount', 'waiverfee'],
      ledger: ['ledgerbalance', 'balance', 'outstanding', 'outstandingbalance']
    },
    required: ['customer', 'contract', 'waiver']
  },
  contracts: {
    key: 'contracts', label: 'Rental Contracts', source: 'Caryaati', file: 'Caryaati Rental Contracts Report',
    desc: 'Master contract data: phones, emails, pickup/drop-off, charges, balances',
    signature: [['contractno', 'contractnumber'], ['customername', 'customer'], ['pickup', 'pickupdate', 'pickupdatetime']],
    fields: {
      contract: ['contractno', 'contractnumber'], model: ['model', 'modelyear'], vehicle: ['vehicle'],
      plate: ['carno', 'plate', 'plateno', 'platenumber'], customer: ['customername', 'customer'],
      email: ['email', 'emailaddress', 'emailid'], mobile: ['mobile', 'mobileno', 'phone', 'phoneno', 'contactno', 'mobilenumber'],
      pickup: ['pickup', 'pickupdate', 'pickupdatetime'], dropoff: ['dropoff', 'dropoffdate', 'dropoffdatetime', 'returndate'],
      km: ['kmout', 'km'], days: ['days', 'noofdays'], deposit: ['deposit'], rent: ['rent'], salik: ['salik'],
      fine: ['fine', 'fines'], other: ['othercharges'], vat: ['vat'], total: ['totalamount', 'total'],
      paid: ['paidamount', 'paid'], vatPaid: ['vatpaidamount'], balance: ['balance'],
      status: ['contractstatus', 'status'], ctype: ['contracttype'], source: ['source'],
      rtype: ['rentaltype'], company: ['companyname', 'company']
    },
    required: ['contract', 'customer']
  },
  payments: {
    key: 'payments', label: 'Rental Payments', source: 'Caryaati', file: 'Caryaati Rental Payment Report',
    desc: 'Rent receipts already paid (amount + VAT)',
    signature: [['invoiceno', 'invoicenumber', 'receiptno'], ['netamount', 'invoiceamount', 'amount']],
    fields: {
      date: ['invoicedate', 'date', 'receiptdate'], contract: ['contractno', 'contractnumber', 'contract'],
      type: ['type', 'rentaltype'], debtor: ['debitorname', 'debtorname', 'customername', 'customer', 'name'],
      invoice: ['invoiceno', 'invoicenumber', 'receiptno'], amount: ['invoiceamount', 'amount'], vat: ['vat'],
      net: ['netamount', 'net', 'totalamount', 'total']
    },
    required: ['contract', 'invoice']
  },
  bookings: {
    key: 'bookings', label: 'Cardoo Bookings', source: 'Cardoo', file: 'Cardoo Booking Report',
    desc: 'Deposit-free bookings registered with Cardoo and the deposit they cover',
    signature: [['depositfreeid', 'bookingtype', 'bookingnumber'], ['contractnumber', 'contractno', 'contract']],
    fields: {
      partner: ['partner'], user: ['userlabel', 'user'], btype: ['bookingtype'], cancelled: ['cancelled', 'iscancelled'],
      contract: ['contractnumber', 'contractno', 'contract'], booking: ['bookingnumber', 'bookingno'],
      start: ['startlocal', 'start', 'startdate'], end: ['endlocal', 'end', 'enddate'], close: ['closelocal', 'close', 'closedate'],
      deposit: ['deposit', 'depositamount'], total: ['totalprice'], monthly: ['monthlyprice'], currency: ['currency'],
      comment: ['comment', 'comments'], bookedAt: ['bookedatlocal', 'bookedat'], dfid: ['depositfreeid', 'id']
    },
    required: ['contract', 'start'],
    exclude: ['invoiceprice', 'invoicecurrency']
  },
  po_lines: {
    key: 'po_lines', label: 'Cardoo PO lines', source: 'Cardoo', file: 'booking_details_PO_xxxxx',
    desc: '15-day Cardoo invoice detail: every booking billed or credited in the period',
    signature: [['invoiceprice'], ['depositfreeid', 'contractnumber']],
    fields: {
      partner: ['partner'], user: ['userlabel', 'user'], btype: ['bookingtype'], cancelled: ['cancelled'],
      contract: ['contractnumber', 'contractno', 'contract'], booking: ['bookingnumber', 'bookingno'],
      start: ['startlocal', 'start'], end: ['endlocal', 'end'], close: ['closelocal', 'close'],
      deposit: ['deposit'], price: ['price'], currency: ['currency'], invPrice: ['invoiceprice'], invCurrency: ['invoicecurrency'],
      comment: ['comment'], bookedAt: ['bookedatlocal', 'bookedat'], dfid: ['depositfreeid']
    },
    required: ['contract', 'price', 'invPrice']
  },
  claims: {
    key: 'claims', label: 'Cardoo Excess Claims', source: 'Cardoo', file: 'Cardoo Excess Report',
    desc: 'Claims already submitted to Cardoo and their status',
    signature: [['excesssum', 'approvedamount', 'excessamount']],
    fields: {
      partner: ['partner'], contract: ['contract', 'contractnumber', 'contractno'], title: ['title'], currency: ['currency'],
      deposit: ['depositamount', 'deposit'], excess: ['excesssum', 'excessamount'], status: ['status'],
      approved: ['approvedamount'], comment: ['lastcardoocomment', 'comment', 'lastcomment']
    },
    required: ['contract', 'status']
  }
};
const REPORT_ORDER = ['waivers', 'contracts', 'payments', 'bookings', 'claims'];

const DEFAULT_SETTINGS = {
  general: {
    company_name: 'Premium Car Rentals', company_phone: '', currency: 'AED', min_outstanding: 5,
    claim_after_days: 3, claim_after_reminders: 2, claim_deadline_days: 60, expiring_soon_days: 10, default_country_code: '971',
    link_order_name: 'Outstanding Balance', link_message: 'Please pay the amount.', link_expiry_days: 5, link_expiry_time: '15:00:00',
    link_language: 'en', link_invoice_type: 'Once',
    remark_categories: ['Promised to pay', 'Disputes charges', 'No answer', 'Wrong number', 'Left the country', 'Partial payment', 'Paid - awaiting report', 'Legal / police', 'Other'],
    tags: ['Walk-in', 'Caryaati-Web', 'Caryaati-App', 'Vendor-Web', 'Vendor-App', 'Mobile-App', 'Website', 'Corporate', 'Referral', 'Broker']
  },
  templates: [
    { id: 'reminder1', name: '1 · Friendly reminder', body: 'Dear {name},\n\nGreetings from {company}.\n\nOur records show an outstanding balance of *{currency} {amount}* on your closed rental agreement *#{contract}* ({vehicle}, {open_date} – {close_date}).\n\nYou can settle it securely using this link:\n{payment_link}\n\nIf you have already paid, please share the receipt and kindly ignore this message.\n\nThank you,\n{company}' },
    { id: 'reminder2', name: '2 · Second reminder', body: 'Dear {name},\n\nThis is a follow-up regarding the unpaid balance of *{currency} {amount}* on rental agreement *#{contract}* ({vehicle}), closed on {close_date}.\n\nPlease complete the payment today using the secure link below:\n{payment_link}\n\nFor any questions about the charges, just reply to this message and our team will help.\n\nRegards,\n{company}' },
    { id: 'final', name: '3 · Final notice', body: 'Dear {name},\n\n*Final notice* — rental agreement *#{contract}* still has an outstanding balance of *{currency} {amount}*.\n\nAs this rental was issued under our deposit-free (deposit waiver) program, if the balance is not settled within 48 hours the amount will be forwarded to our deposit-protection partner for recovery.\n\nPay now: {payment_link}\n\n{company}' }
  ]
};

/* ---- workflow stages ---- */
const STAGES = {
  to_contact:      { label: 'To contact',            tone: 'blue',   group: 'collect', order: 1, hint: 'Outstanding balance, customer not contacted yet' },
  contacted:       { label: 'Contacted',             tone: 'indigo', group: 'collect', order: 2, hint: 'Reminder sent, waiting for payment' },
  promised:        { label: 'Promised to pay',       tone: 'teal',   group: 'collect', order: 3, hint: 'Customer promised a payment date' },
  ready_to_claim:  { label: 'Ready to claim',        tone: 'amber',  group: 'claim',   order: 4, hint: 'Reminders exhausted — submit claim to Cardoo' },
  claim_expired:   { label: 'Claim window expired',  tone: 'rose',   group: 'collect', order: 4.5, hint: 'Closed longer than the claim window — Cardoo will not accept a claim, collect directly' },
  not_covered:     { label: 'Not covered',           tone: 'rose',   group: 'collect', order: 5, hint: 'No active Cardoo booking — collect directly' },
  claim_rejected:  { label: 'Claim rejected',        tone: 'rose',   group: 'collect', order: 6, hint: 'Cardoo claim cancelled/declined — collect directly' },
  need_update:     { label: 'Claim · need update',   tone: 'orange', group: 'claim',   order: 7, hint: 'Cardoo requested more information' },
  claim_submitted: { label: 'Claim submitted',       tone: 'violet', group: 'claim',   order: 8, hint: 'Marked as submitted — waiting for Excess report' },
  recovered_partial: { label: 'Cardoo paid · rest due', tone: 'teal', group: 'collect', order: 8.5, hint: 'Cardoo approved/paid its part — collect the remainder from the customer' },
  recovery:        { label: 'Recovered by Cardoo',   tone: 'green',  group: 'done',    order: 9, hint: 'Claim approved or paid by Cardoo (In Recovery)' },
  on_hold:         { label: 'On hold',               tone: 'slate',  group: 'collect', order: 10, hint: 'Paused manually' },
  paid_marked:     { label: 'Marked paid',           tone: 'green',  group: 'done',    order: 11, hint: 'Marked paid — will clear when the next Waiver report shows zero' },
  settled:         { label: 'Settled',               tone: 'green',  group: 'done',    order: 12, hint: 'No outstanding balance' },
  active:          { label: 'Open contract',         tone: 'sky',    group: 'active',  order: 13, hint: 'Rental still running' }
};

const Engine = {
  REPORTS, REPORT_ORDER, STAGES, DEFAULT_SETTINGS, U,

  /* ---------- detection ---------- */
  /** Find header row + report type in an array-of-arrays sheet */
  detectTable(rows) {
    let best = null;
    const maxScan = Math.min(rows.length, 30);
    for (let r = 0; r < maxScan; r++) {
      const row = rows[r] || [];
      const headers = row.map(U.norm);
      if (headers.filter(Boolean).length < 2) continue;
      for (const key of ['po_lines', ...REPORT_ORDER]) {
        const spec = REPORTS[key];
        if (spec.exclude && spec.exclude.some(x => headers.includes(x))) continue;
        const sigOk = spec.signature.every(g => g.some(a => headers.includes(a)));
        if (!sigOk) continue;
        const colIndex = Engine.mapColumns(headers, spec.fields);
        const matched = Object.keys(colIndex).length;
        const reqOk = spec.required.every(f => colIndex[f] != null);
        if (!reqOk) continue;
        const score = matched / Object.keys(spec.fields).length;
        if (!best || score > best.score) best = { type: key, headerRow: r, colIndex, score, headers: row.map(h => U.clean(h)) };
      }
    }
    return best;
  },
  mapColumns(headers, fields) {
    const used = new Set(), out = {};
    // pass 1: exact alias match in alias priority order
    for (const [f, aliases] of Object.entries(fields)) {
      for (const a of aliases) {
        const i = headers.findIndex((h, idx) => h === a && !used.has(idx));
        if (i >= 0) { out[f] = i; used.add(i); break; }
      }
    }
    // pass 2: prefix match for long aliases only ("startlocaltime" → start)
    for (const [f, aliases] of Object.entries(fields)) {
      if (out[f] != null) continue;
      for (const a of aliases) {
        if (a.length < 6) continue;
        const i = headers.findIndex((h, idx) => !used.has(idx) && h && h.startsWith(a));
        if (i >= 0) { out[f] = i; used.add(i); break; }
      }
    }
    return out;
  },
  /** workbook (SheetJS) → [{type, rows, headerRow, colIndex, sheet}] */
  detectWorkbook(wb, XLSX) {
    const found = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      if (!ws || !ws['!ref']) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
      const det = Engine.detectTable(rows);
      if (det) found.push(Object.assign(det, { sheet: name, rows }));
    }
    found.sort((a, b) => b.score - a.score || b.rows.length - a.rows.length);
    return found[0] || null;
  },

  /* ---------- cleaners ---------- */
  /** Remove source tags glued to names/contract numbers ("JACK BROWNWalk-in" → "JACK BROWN") */
  stripTag(raw, tags) {
    const s = U.clean(raw);
    if (!s) return { value: '', tag: null };
    const sorted = [...(tags || [])].filter(Boolean).sort((a, b) => b.length - a.length);
    for (const t of sorted) {
      // hyphenated tags are distinctive → case-insensitive; single words must match case exactly
      const re = new RegExp('^(.*?\\S)\\s*[-–|/(\\[]?\\s*' + U.escapeRe(t) + '\\s*[)\\]]?$', /-/.test(t) ? 'i' : '');
      const m = s.match(re);
      if (m && m[1].replace(/[\s\-–|/([]+$/, '').length) return { value: m[1].replace(/[\s\-–|/([]+$/, '').trim(), tag: t };
    }
    // Generic fallback: CamelCase-hyphen word glued without a space (e.g. "NAMEPartner-App")
    const g = s.match(/^(.*\S)(?<![\s-])([A-Z][a-z]+(?:-[A-Za-z]+)+)$/);
    if (g && g[1].length > 1) return { value: g[1].trim(), tag: g[2], unknown: true };
    return { value: s, tag: null };
  },
  /** "17104Walk-in" → {no:17104, suffix:"Walk-in"}; "18483-long" → {no:18483, suffix:"long"} */
  parseContract(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) && v > 0 ? { no: Math.trunc(v), suffix: '', raw: String(Math.trunc(v)) } : null;
    const s = U.clean(v);
    const m = s.match(/^\D{0,6}?(\d{2,})(?:\.0+)?\s*[-_/ ]*\s*(.*)$/);
    if (!m) return null;
    return { no: parseInt(m[1], 10), suffix: m[2] ? m[2].trim() : '', raw: s };
  },
  plateFromVehicle(v) {
    const parts = U.clean(v).split(' ');
    const last = parts[parts.length - 1] || '';
    return /^[A-Z]{1,3}\d{2,6}$/i.test(last) ? last.toUpperCase() : null;
  },
  nameKey(s) { return U.clean(s).toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim(); },

  /* ---------- per-report normalisers ---------- */
  normalize(type, det, settings) {
    const g = Object.assign({}, DEFAULT_SETTINGS.general, settings && settings.general);
    const fn = Engine['_norm_' + type];
    const res = fn(det, g);
    res.type = type;
    return res;
  },
  _cell(row, ci, f) { const i = ci[f]; return i == null ? null : row[i]; },

  _norm_waivers(det, g) {
    const { rows, headerRow, colIndex: ci } = det, C = Engine._cell;
    const out = [], issues = [], seen = new Map();
    const stats = { rows: 0, skipped: 0, tagsName: 0, tagsContract: 0, unknownTags: new Set(), textNumbers: 0, duplicates: 0, tagCounts: {} };
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const rawC = C(row, ci, 'contract');
      const pc = Engine.parseContract(rawC);
      if (!pc) { if (row.some(v => !U.isBlank(v))) stats.skipped++; continue; }
      stats.rows++;
      const nm = Engine.stripTag(C(row, ci, 'customer'), g.tags);
      if (nm.tag) { stats.tagsName++; stats.tagCounts[nm.tag] = (stats.tagCounts[nm.tag] || 0) + 1; if (nm.unknown) stats.unknownTags.add(nm.tag); }
      if (pc.suffix) { stats.tagsContract++; }
      const waiverRaw = C(row, ci, 'waiver'), ledgerRaw = C(row, ci, 'ledger');
      if (typeof waiverRaw === 'string') stats.textNumbers++;
      if (typeof ledgerRaw === 'string' && ledgerRaw.trim()) stats.textNumbers++;
      const statusRaw = U.clean(C(row, ci, 'status'));
      const closeD = U.isoDate(C(row, ci, 'close'));
      const status = /clos/i.test(statusRaw) ? 'Closed' : /open/i.test(statusRaw) ? 'Open' : (closeD ? 'Closed' : 'Open');
      const vehicle = U.clean(C(row, ci, 'vehicle'));
      const rec = {
        contract_no: pc.no, customer_name: nm.value, raw_customer: U.clean(C(row, ci, 'customer')), raw_contract: U.clean(rawC),
        source_tag: pc.suffix || nm.tag || null, vehicle, plate: Engine.plateFromVehicle(vehicle),
        open_date: U.isoDate(C(row, ci, 'open')), close_date: closeD, status,
        waiver_amount: U.r2(U.num0(waiverRaw)), ledger_balance: U.r2(U.num0(ledgerRaw))
      };
      if (seen.has(pc.no)) { stats.duplicates++; issues.push({ level: 'warn', text: `Duplicate waiver row for contract ${pc.no} — kept the last one` }); out[seen.get(pc.no)] = rec; continue; }
      seen.set(pc.no, out.length); out.push(rec);
    }
    if (stats.unknownTags.size) issues.push({ level: 'info', text: `Unlisted tags auto-detected and removed: ${[...stats.unknownTags].join(', ')} (add them in Settings → Tags to make this explicit)` });
    return { rows: out, stats, issues };
  },

  _norm_contracts(det, g) {
    const { rows, headerRow, colIndex: ci } = det, C = Engine._cell;
    const out = [], issues = [];
    const stats = { rows: 0, skipped: 0, phones: { uae: 0, intl: 0, landline: 0, check: 0, missing: 0 }, shift: null, balanceCheck: 0 };
    // --- detect the VAT / TotalAmount column shift on the raw data ---
    let stdOk = 0, shiftOk = 0, dupOther = 0, tested = 0;
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row || !Engine.parseContract(C(row, ci, 'contract'))) continue;
      const base = U.num0(C(row, ci, 'rent')) + U.num0(C(row, ci, 'salik')) + U.num0(C(row, ci, 'fine')) + U.num0(C(row, ci, 'other'));
      const bal = U.num(C(row, ci, 'balance')), paid = U.num0(C(row, ci, 'paid'));
      if (bal == null) continue;
      tested++;
      if (Math.abs(base + U.num0(C(row, ci, 'vat')) - paid - bal) < 0.05) stdOk++;
      if (ci.total != null && Math.abs(base + U.num0(C(row, ci, 'total')) - paid - bal) < 0.05) shiftOk++;
      if (ci.vat != null && ci.other != null && U.num0(C(row, ci, 'vat')) === U.num0(C(row, ci, 'other'))) dupOther++;
    }
    const shifted = tested > 0 && shiftOk > stdOk && shiftOk / tested >= 0.9;
    stats.shift = { tested, stdOk, shiftOk, dupOther, shifted };
    if (shifted) {
      issues.push({ level: 'fix', text: `Column shift corrected: the "TotalAmount" column holds VAT and "VAT" repeats OtherCharges. Verified — balance formula matches ${U.int(shiftOk)} of ${U.int(tested)} rows. Total is recalculated as Rent + Salik + Fine + Other + VAT.` });
    } else if (tested && stdOk / tested < 0.9) {
      issues.push({ level: 'warn', text: `Balance formula matched only ${U.int(Math.max(stdOk, shiftOk))} of ${U.int(tested)} rows — amounts are taken as labelled; Balance column is used as-is.` });
    }
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const pc = Engine.parseContract(C(row, ci, 'contract'));
      if (!pc) { if (row.some(v => !U.isBlank(v))) stats.skipped++; continue; }
      stats.rows++;
      const rent = U.num0(C(row, ci, 'rent')), salik = U.num0(C(row, ci, 'salik')), fine = U.num0(C(row, ci, 'fine')), other = U.num0(C(row, ci, 'other'));
      const vat = shifted ? U.num0(C(row, ci, 'total')) : U.num0(C(row, ci, 'vat'));
      const total = shifted ? rent + salik + fine + other + vat : (ci.total != null ? U.num0(C(row, ci, 'total')) : rent + salik + fine + other + vat);
      const em = U.clean(C(row, ci, 'email'));
      const ph = U.phone(C(row, ci, 'mobile'), g.default_country_code, { email: em });
      stats.phones[ph.kind] = (stats.phones[ph.kind] || 0) + 1;
      const vehicle = U.clean(C(row, ci, 'vehicle'));
      const my = U.num(C(row, ci, 'model'));
      out.push({
        contract_no: pc.no, customer_name: U.clean(C(row, ci, 'customer')),
        email: em && /@/.test(em) ? em.toLowerCase().replace(/(\.[a-z]{2,})\d+$/, '$1') : (em || null),
        mobile_raw: C(row, ci, 'mobile') == null ? null : String(C(row, ci, 'mobile')),
        mobile: ph.digits || null, mobile_valid: ph.valid,
        vehicle, plate: U.clean(C(row, ci, 'plate')) || Engine.plateFromVehicle(vehicle),
        model_year: my && my > 1950 && my < 2100 ? Math.trunc(my) : null,
        pickup_at: U.isoDT(C(row, ci, 'pickup')), dropoff_at: U.isoDT(C(row, ci, 'dropoff')),
        km_out: C(row, ci, 'km') == null ? null : String(C(row, ci, 'km')),
        days: Math.trunc(U.num0(C(row, ci, 'days'))),
        deposit: U.r2(U.num0(C(row, ci, 'deposit'))), rent: U.r2(rent), salik: U.r2(salik), fine: U.r2(fine),
        other_charges: U.r2(other), vat: U.r2(vat), total_amount: U.r2(total),
        paid_amount: U.r2(U.num0(C(row, ci, 'paid'))), vat_paid: U.r2(U.num0(C(row, ci, 'vatPaid'))),
        balance: U.r2(U.num0(C(row, ci, 'balance'))),
        status: U.clean(C(row, ci, 'status')) || null, contract_type: U.clean(C(row, ci, 'ctype')) || null,
        rental_type: U.clean(C(row, ci, 'rtype')) || null, source: U.clean(C(row, ci, 'source')) || null,
        company_name: U.clean(C(row, ci, 'company')) || null
      });
    }
    return { rows: out, stats, issues };
  },

  _norm_payments(det) {
    const { rows, headerRow, colIndex: ci } = det, C = Engine._cell;
    const out = [], issues = [], keys = new Map();
    const stats = { rows: 0, skipped: 0, serialDates: 0, textDates: 0, badDates: 0, textNumbers: 0, netMismatch: 0 };
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const pc = Engine.parseContract(C(row, ci, 'contract'));
      const inv = U.clean(C(row, ci, 'invoice'));
      if (!pc || !inv) { if (row.some(v => !U.isBlank(v))) stats.skipped++; continue; }
      stats.rows++;
      const dRaw = C(row, ci, 'date');
      if (typeof dRaw === 'number') stats.serialDates++; else if (dRaw) stats.textDates++;
      const d = U.isoDate(dRaw); if (!d) stats.badDates++;
      const a = C(row, ci, 'amount'), v = C(row, ci, 'vat'), n = C(row, ci, 'net');
      if ([a, v, n].some(x => typeof x === 'string' && x.trim())) stats.textNumbers++;
      const amount = U.num0(a), vat = U.num0(v);
      const net = n == null || n === '' ? amount + vat : U.num0(n);
      if (Math.abs(amount + vat - net) > 0.05) stats.netMismatch++;
      let key = inv; const c = keys.get(inv) || 0; if (c) key = `${inv}#${c + 1}`; keys.set(inv, c + 1);
      out.push({ row_key: key, invoice_no: inv, contract_no: pc.no, invoice_date: d, rental_type: U.clean(C(row, ci, 'type')) || null,
        debtor_name: U.clean(C(row, ci, 'debtor')), invoice_amount: U.r2(amount), vat: U.r2(vat), net_amount: U.r2(net) });
    }
    if (stats.serialDates && stats.textDates) issues.push({ level: 'fix', text: `Mixed date formats unified: ${U.int(stats.serialDates)} Excel serial dates + ${U.int(stats.textDates)} text dates (dd-Mmm-yyyy).` });
    if (stats.textNumbers) issues.push({ level: 'fix', text: `${U.int(stats.textNumbers)} rows had amounts stored as text with thousands separators — converted to numbers.` });
    if (stats.badDates) issues.push({ level: 'warn', text: `${U.int(stats.badDates)} payment rows have an unreadable date.` });
    if (stats.netMismatch) issues.push({ level: 'warn', text: `${U.int(stats.netMismatch)} payment rows where Amount + VAT ≠ Net Amount.` });
    return { rows: out, stats, issues };
  },

  _norm_bookings(det) {
    const { rows, headerRow, colIndex: ci } = det, C = Engine._cell;
    const out = [], issues = [], keys = new Map();
    const stats = { rows: 0, skipped: 0, variants: 0, cancelled: 0, serialDates: 0 };
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const rawC = C(row, ci, 'contract');
      const pc = Engine.parseContract(rawC);
      if (!pc) { if (row.some(v => !U.isBlank(v))) stats.skipped++; continue; }
      stats.rows++;
      if (pc.suffix) stats.variants++;
      if (typeof C(row, ci, 'start') === 'number') stats.serialDates++;
      const cancelled = /^(yes|y|true|1|cancel+ed)$/i.test(U.clean(C(row, ci, 'cancelled')));
      if (cancelled) stats.cancelled++;
      const start = U.isoDT(C(row, ci, 'start'));
      let key = U.clean(C(row, ci, 'dfid')) || `${U.clean(rawC)}|${start}`;
      const c = keys.get(key) || 0; keys.set(key, c + 1); if (c) key = `${key}#${c + 1}`;
      const tp = U.num(C(row, ci, 'total')), mp = U.num(C(row, ci, 'monthly'));
      out.push({ row_key: key, contract_no: pc.no, contract_raw: U.clean(rawC), contract_variant: pc.suffix ? pc.suffix.toLowerCase() : null,
        booking_no: U.clean(C(row, ci, 'booking')) || null, booking_type: U.clean(C(row, ci, 'btype')) || null, cancelled,
        start_at: start, end_at: U.isoDT(C(row, ci, 'end')), close_at: U.isoDT(C(row, ci, 'close')),
        deposit_covered: U.r2(U.num0(C(row, ci, 'deposit'))), total_price: tp == null ? null : U.r2(tp), monthly_price: mp == null ? null : U.r2(mp),
        currency: U.clean(C(row, ci, 'currency')) || null, comment: U.clean(C(row, ci, 'comment')) || null,
        booked_at: U.isoDT(C(row, ci, 'bookedAt')), user_label: U.clean(C(row, ci, 'user')) || null, partner: U.clean(C(row, ci, 'partner')) || null });
    }
    if (stats.serialDates) issues.push({ level: 'fix', text: `${U.int(stats.serialDates)} bookings had Excel serial date-times — converted to exact local date & time.` });
    if (stats.variants) issues.push({ level: 'fix', text: `${stats.variants} booking contract numbers had suffixes (e.g. "18483-long") — linked to the base contract.` });
    return { rows: out, stats, issues };
  },

  _norm_claims(det) {
    const { rows, headerRow, colIndex: ci } = det, C = Engine._cell;
    const out = [], issues = [], keys = new Map();
    const stats = { rows: 0, skipped: 0, statuses: {} };
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const rawC = C(row, ci, 'contract');
      const pc = Engine.parseContract(rawC);
      if (!pc) { if (row.some(v => !U.isBlank(v))) stats.skipped++; continue; }
      stats.rows++;
      const title = U.clean(C(row, ci, 'title'));
      const dm = title.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\s*$/);
      const claimDate = dm ? U.isoDate(`${dm[1]}/${dm[2]}/${dm[3]}`) : null;
      const status = U.clean(C(row, ci, 'status')) || 'Unknown';
      stats.statuses[status] = (stats.statuses[status] || 0) + 1;
      let key = `${U.clean(rawC)}|${title}`;
      const c = keys.get(key) || 0; keys.set(key, c + 1); if (c) key = `${key}#${c + 1}`;
      const ap = U.num(C(row, ci, 'approved'));
      out.push({ row_key: key, contract_no: pc.no, contract_raw: U.clean(rawC), title, claim_date: claimDate,
        currency: U.clean(C(row, ci, 'currency')) || null, deposit_amount: U.r2(U.num0(C(row, ci, 'deposit'))),
        excess_sum: U.r2(U.num0(C(row, ci, 'excess'))), status, approved_amount: ap == null ? null : U.r2(ap),
        last_comment: U.clean(C(row, ci, 'comment')) || null, partner: U.clean(C(row, ci, 'partner')) || null });
    }
    issues.push({ level: 'fix', text: `Claim dates extracted from titles (dd.mm.yy → full date).` });
    return { rows: out, stats, issues };
  },

  /** Prepare uploaded reports (any subset) for a merge sync. Contracts & payments are trimmed to linked contracts. */
  prepareSync(norm, existing) {
    existing = existing || {};
    const has = t => !!(norm[t] && norm[t].rows);
    const linked = new Set();
    ['waivers', 'bookings', 'claims'].forEach(t => {
      (has(t) ? norm[t].rows : []).forEach(r => linked.add(+r.contract_no));
      (existing[t] || []).forEach(r => linked.add(+r.contract_no));
    });
    const tables = {};
    if (has('waivers')) tables.waivers = norm.waivers.rows;
    if (has('bookings')) tables.bookings = norm.bookings.rows;
    if (has('claims')) tables.claims = norm.claims.rows;
    if (has('contracts')) tables.contracts = norm.contracts.rows.filter(r => linked.has(r.contract_no));
    if (has('payments')) tables.payments = norm.payments.rows.filter(r => linked.has(r.contract_no));
    const allContracts = new Map((existing.contracts || []).map(c => [+c.contract_no, c]));
    (tables.contracts || []).forEach(c => allContracts.set(c.contract_no, c));
    const missingContracts = [...linked].filter(n => !allContracts.has(n)).sort((a, b) => a - b);
    const nameMismatch = [];
    const waivers = tables.waivers || existing.waivers || [];
    for (const w of waivers) {
      const c = allContracts.get(+w.contract_no);
      if (c && Engine.nameKey(c.customer_name) !== Engine.nameKey(w.customer_name)) nameMismatch.push({ contract_no: w.contract_no, waiver: w.customer_name, contract: c.customer_name });
    }
    return {
      tables,
      diff: Engine.diff(tables, existing),
      summary: {
        linkedContracts: linked.size,
        contractsKept: tables.contracts ? tables.contracts.length : null, contractsTotal: has('contracts') ? norm.contracts.rows.length : null,
        paymentsKept: tables.payments ? tables.payments.length : null, paymentsTotal: has('payments') ? norm.payments.rows.length : null,
        missingContracts, nameMismatch
      }
    };
  },
  KEYS: { waivers: 'contract_no', contracts: 'contract_no', payments: 'row_key', bookings: 'row_key', claims: 'row_key' },
  /** comparable value: DB returns '2026-11-24T18:37:00', normalised rows use '2026-11-24 18:37:00' */
  cmpVal(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) return s.replace('T', ' ').slice(0, 19);
    if (/^-?\d+(\.\d+)?$/.test(s)) return +s;
    return s;
  },
  /** Same rules as the database merge: new rows, changed fields (non-empty new values only), unchanged */
  diff(tables, existing) {
    const out = {};
    for (const [t, rows] of Object.entries(tables)) {
      const key = Engine.KEYS[t];
      const old = new Map((existing[t] || []).map(r => [String(r[key]), r]));
      const seen = new Set();
      const res = { received: 0, inserted: 0, updated: 0, unchanged: 0, changes: [] };
      for (const r of rows) {
        const k = String(r[key]);
        if (seen.has(k)) continue; seen.add(k);
        res.received++;
        const o = old.get(k);
        if (!o) { res.inserted++; continue; }
        let changed = false;
        for (const [f, v] of Object.entries(r)) {
          const nv = Engine.cmpVal(v);
          if (nv === null) continue;
          const ov = Engine.cmpVal(o[f]);
          if (ov !== nv) { changed = true; if (res.changes.length < 3000) res.changes.push({ tbl: t, row_key: k, contract_no: r.contract_no, field: f, old_value: o[f] == null ? null : o[f], new_value: v }); }
        }
        changed ? res.updated++ : res.unchanged++;
      }
      out[t] = res;
    }
    return out;
  },
  /** Apply a merge locally (for "preview without saving") */
  mergeLocal(existing, tables) {
    const ds = Object.assign({}, existing);
    for (const [t, rows] of Object.entries(tables)) {
      const key = Engine.KEYS[t];
      const map = new Map((existing[t] || []).map(r => [String(r[key]), Object.assign({}, r)]));
      for (const r of rows) {
        const k = String(r[key]), o = map.get(k) || {};
        const n = Object.assign({}, o);
        for (const [f, v] of Object.entries(r)) if (v != null && v !== '') n[f] = v; else if (!(f in n)) n[f] = v;
        map.set(k, n);
      }
      ds[t] = [...map.values()];
    }
    return ds;
  },

  /* ---------- unification: DB dataset → working model ---------- */
  buildModel(ds) {
    const settings = {
      general: Object.assign({}, DEFAULT_SETTINGS.general, (ds.settings && ds.settings.general) || {}),
      templates: (ds.settings && Array.isArray(ds.settings.templates) && ds.settings.templates.length) ? ds.settings.templates : DEFAULT_SETTINGS.templates
    };
    const g = settings.general;
    const minOut = +g.min_outstanding || 0;
    const today = U.todayNum();
    const contracts = new Map((ds.contracts || []).map(c => [+c.contract_no, c]));
    const pay = U.groupBy(ds.payments || [], p => +p.contract_no);
    const book = U.groupBy(ds.bookings || [], b => +b.contract_no);
    const clm = U.groupBy(ds.claims || [], c => +c.contract_no);
    const cases = new Map((ds.cases || []).map(k => [+k.contract_no, k]));
    const waiverSet = new Set((ds.waivers || []).map(w => +w.contract_no));

    const records = [];
    for (const w of ds.waivers || []) {
      const no = +w.contract_no;
      const c = contracts.get(no) || null;
      const k = cases.get(no) || {};
      const payments = (pay.get(no) || []).slice().sort((a, b) => (U.dayNum(b.invoice_date) || 0) - (U.dayNum(a.invoice_date) || 0));
      const bookings = (book.get(no) || []).slice().sort((a, b) => (U.dayFrac(a.start_at) || 0) - (U.dayFrac(b.start_at) || 0));
      const active = bookings.filter(b => !b.cancelled);
      const claims = (clm.get(no) || []).slice().sort((a, b) => (U.dayNum(b.claim_date) || 0) - (U.dayNum(a.claim_date) || 0));
      const ph = U.phone(k.phone_override || (c && (c.mobile_raw || c.mobile)), g.default_country_code, { email: c && c.email });

      const r = {
        contract_no: no, waiver: w, contract: c, case: k, payments, bookings, claims,
        name: (c && c.customer_name) || w.customer_name,
        name_waiver: w.customer_name,
        email: c ? c.email : null,
        phone: ph.digits, phone_display: ph.display, phone_valid: ph.valid, phone_kind: ph.kind, phone_overridden: !!k.phone_override,
        phone_auto: !!ph.auto, phone_auto_reason: ph.auto_reason || '', phone_suggest: ph.suggest || [], phone_raw: ph.raw_digits || (c && c.mobile_raw) || '', phone_country: ph.country || '',
        vehicle: w.vehicle || (c && c.vehicle) || '', plate: w.plate || (c && c.plate) || '',
        status: w.status, open_date: w.open_date, close_date: w.close_date,
        pickup_at: c ? c.pickup_at : null, dropoff_at: c ? c.dropoff_at : null,
        rental_type: c ? c.rental_type : null, days: c ? c.days : null,
        waiver_amount: +w.waiver_amount || 0,
        outstanding: U.r2(+w.ledger_balance || 0),
        contract_balance: c ? +c.balance : null,
        rent_total: c ? +c.total_amount : null,
        rent_paid: U.sum(payments, p => p.net_amount),
        last_payment: payments[0] ? payments[0].invoice_date : null,
        source_tag: w.source_tag
      };
      // Cardoo booking summary
      r.booking_state = !bookings.length ? 'none' : active.length ? 'active' : 'cancelled';
      r.coverage = active.length ? Math.max(...active.map(b => +b.deposit_covered || 0)) : 0;
      r.booking_start = active.length ? active[0].start_at : null;
      r.booking_end = active.length ? active.reduce((m, b) => (U.dayFrac(b.end_at) || 0) > (U.dayFrac(m) || 0) ? b.end_at : m, active[0].end_at) : null;
      r.booking_closed = active.length ? active.every(b => !!b.close_at) : false;
      // Cardoo still treats the booking as running after the contract was closed → should be closed in Cardoo
      const closeF = U.dayFrac(w.close_date ? w.close_date + ' 23:59:59' : null);
      r.booking_running_after_close = w.status === 'Closed' && closeF != null &&
        active.some(b => !b.close_at && (U.dayFrac(b.end_at) || 0) > closeF + 1);
      r.booking_close = active.length ? active.map(b => b.close_at).filter(Boolean).sort().pop() || null : null;
      r.cardoo_fee = U.sum(active, b => Engine.bookingFee(b));
      // Caryaati vs Cardoo closing
      r.caryaati_close_at = w.status === 'Closed' ? ((c && c.dropoff_at && U.isoDate(c.dropoff_at) === w.close_date) ? c.dropoff_at : w.close_date) : null;
      r.cardoo_status = !active.length ? 'none' : r.booking_closed ? 'closed' : 'open';
      r.cardoo_close_at = r.cardoo_status === 'closed' ? r.booking_close : null;
      r.close_sync = !active.length ? 'no_booking'
        : w.status === 'Closed' ? (r.cardoo_status === 'closed' ? 'both_closed' : 'caryaati_only')
        : (r.cardoo_status === 'closed' ? 'cardoo_only' : 'both_open');
      r.close_diff_days = r.close_sync === 'both_closed' && w.close_date ? U.dayNum(r.cardoo_close_at) - U.dayNum(w.close_date) : null;
      // Claims summary
      const live = claims.filter(x => !/cancel|declin|reject/i.test(x.status));
      const primary = live[0] || claims[0] || null;
      r.claim = primary;
      r.claim_state = primary ? primary.status : null;
      r.claim_live = !!live.length;
      r.claim_excess = primary ? +primary.excess_sum : null;
      r.claim_approved = U.sum(live, x => x.approved_amount);
      // Dates & money
      // Waiver (Cardoo cover) end: Cardoo counts the claim window from the booking end in Cardoo.
      // Use the Cardoo end (or its earlier close) when it is within 7 days of the Caryaati close;
      // a booking left running much longer (e.g. monthly prolongation) falls back to the Caryaati close.
      r.cover_end_at = null; r.cover_end_src = r.close_date ? 'caryaati' : null;
      if (active.length && r.close_date) {
        let ce = r.booking_end;
        if (r.booking_close && U.dayFrac(r.booking_close) < (U.dayFrac(ce) || Infinity)) ce = r.booking_close;
        const diff = ce ? U.dayNum(ce) - U.dayNum(r.close_date) : null;
        if (diff != null && Math.abs(diff) <= 7) { r.cover_end_at = ce; r.cover_end_src = 'cardoo'; }
        r.cover_end_diff = diff;
      }
      r.waiver_close = r.cover_end_at ? U.isoDate(r.cover_end_at) : r.close_date;
      r.days_since_close = r.waiver_close ? today - U.dayNum(r.waiver_close) : null;
      r.days_since_caryaati_close = r.close_date ? today - U.dayNum(r.close_date) : null;
      r.claim_deadline = r.waiver_close ? U.addDaysISO(r.waiver_close, +g.claim_deadline_days || 60) : null;
      r.days_to_deadline = r.claim_deadline ? U.dayNum(r.claim_deadline) - today : null;
      // claim window state — only meaningful for closed, covered, owing contracts with no live claim
      r.claim_window = (w.status === 'Closed' && r.booking_state === 'active' && !r.claim_live && (+w.ledger_balance || 0) > minOut && r.days_to_deadline != null)
        ? (r.days_to_deadline < 0 ? 'expired' : r.days_to_deadline <= (+g.expiring_soon_days || 10) ? 'soon' : 'open') : null;
      r.claimable = r.outstanding > 0 ? U.r2(Math.min(r.outstanding, r.coverage || 0)) : 0;
      r.uncovered = r.outstanding > 0 ? U.r2(Math.max(0, r.outstanding - (r.coverage || 0))) : 0;
      r.payment_link = k.payment_link || '';
      r.contact_count = +k.contact_count || 0;
      r.days_since_contact = k.first_contact_at ? today - U.dayNum(new Date(k.first_contact_at)) : null;
      r.last_contact_at = k.last_contact_at || null;
      r.remark = k.last_remark || '';
      r.remark_cat = k.last_remark_category || '';
      r.remark_at = k.last_remark_at || null;
      r.link_batch_at = k.link_batch_at || null;
      Engine.assignStage(r, g, today, minOut);
      // what the customer still has to pay us
      r.due = ['settled', 'paid_marked', 'recovery', 'active'].includes(r.stage) ? 0
        : r.stage === 'recovered_partial' ? (g.claims_posted_in_ledger ? r.outstanding : U.r2(r.outstanding - (r.claim_approved || 0))) : r.outstanding;
      if (r.stage === 'claim_submitted') {
        r.claim_window = 'submitted';
        r.submitted_days = today - U.dayNum(k.claim_submitted_at);
        r.submitted_late = r.claim_deadline ? U.dayNum(k.claim_submitted_at) > U.dayNum(r.claim_deadline) : false;
      }
      r.followup_due = r.stage === 'contacted' && r.last_contact_at && (today - U.dayNum(new Date(r.last_contact_at))) >= 2;
      r.link_overdue = !r.payment_link && r.link_batch_at && (today - U.dayNum(new Date(r.link_batch_at))) >= 2 && r.status === 'Closed' && r.outstanding > minOut;
      r.promise_due = !!(k.promise_date && U.dayNum(k.promise_date) <= today && r.status === 'Closed' && r.outstanding > minOut && !['paid_marked', 'settled'].includes(r.stage));
      r.flags = Engine.flags(r, today);
      r.search = [no, r.name, r.name_waiver, r.phone, c && c.mobile_raw, r.email, r.vehicle, r.plate].filter(Boolean).join(' ').toLowerCase();
      records.push(r);
    }
    records.sort((a, b) => b.contract_no - a.contract_no);
    const byNo = new Map(records.map(r => [r.contract_no, r]));

    // Cardoo rows that do not belong to a waiver contract
    const orphanBookings = (ds.bookings || []).filter(b => !waiverSet.has(+b.contract_no)).map(b => Object.assign({}, b, { _name: (contracts.get(+b.contract_no) || {}).customer_name || '' }));
    const claimRows = (ds.claims || []).map(x => {
      const rec = byNo.get(+x.contract_no);
      const c = contracts.get(+x.contract_no);
      return Object.assign({}, x, { _rec: rec || null, _name: rec ? rec.name : (c ? c.customer_name : ''), _outstanding: rec ? rec.outstanding : null, _inWaivers: !!rec });
    }).sort((a, b) => (U.dayNum(b.claim_date) || 0) - (U.dayNum(a.claim_date) || 0));
    const bookingRows = (ds.bookings || []).map(b => {
      const rec = byNo.get(+b.contract_no), c = contracts.get(+b.contract_no);
      return Object.assign({}, b, { _rec: rec || null, _name: rec ? rec.name : (c ? c.customer_name : ''), _inWaivers: !!rec, _fee: Engine.bookingFee(b) });
    }).sort((a, b) => (U.dayFrac(b.booked_at) || 0) - (U.dayFrac(a.booked_at) || 0));
    const paymentRows = (ds.payments || []).map(p => Object.assign({}, p, { _rec: byNo.get(+p.contract_no) || null }))
      .sort((a, b) => (U.dayNum(b.invoice_date) || 0) - (U.dayNum(a.invoice_date) || 0));

    // Cardoo bookings whose contract is not a waiver contract, grouped per contract
    const byC = U.groupBy(bookingRows.filter(b => !b._inWaivers), b => +b.contract_no);
    const cardooOnly = [...byC.entries()].map(([no, bs]) => {
      const c = contracts.get(no) || null, act = bs.filter(b => !b.cancelled);
      return { contract_no: no, row_key: 'c' + no, contract_raw: bs.map(b => b.contract_raw).join(', '), bookings: bs, contract: c,
        name: c ? c.customer_name : '', in_caryaati: !!c, caryaati_status: c ? c.status : null, pickup_at: c ? c.pickup_at : null, dropoff_at: c ? c.dropoff_at : null,
        booking_type: [...new Set(bs.map(b => b.booking_type))].join(' / '), start_at: bs[0].start_at, end_at: bs.map(b => b.end_at).sort().pop(),
        close_at: act.length && act.every(b => b.close_at) ? act.map(b => b.close_at).sort().pop() : null,
        cover: act.length ? Math.max(...act.map(b => +b.deposit_covered || 0)) : 0, fee: U.sum(act, b => Engine.bookingFee(b)),
        cancelled: !act.length, booked_at: bs[0].booked_at,
        search: [no, c && c.customer_name, c && c.mobile].filter(Boolean).join(' ').toLowerCase() };
    }).sort((a, b) => b.contract_no - a.contract_no);
    const model = { records, byNo, settings, orphanBookings, claimRows, bookingRows, paymentRows, contracts, cardooOnly,
      missingInCaryaati: cardooOnly.filter(x => !x.in_caryaati), bookedNoWaiver: cardooOnly.filter(x => x.in_caryaati),
      lastBatch: ds.last_batch || null, user: ds.user || null };
    model.checks = Engine.reconcile(model, ds);
    model.kpi = Engine.kpis(model);
    return model;
  },

  bookingFee(b) {
    if (b.cancelled) return 0;
    if (b.total_price != null && b.total_price !== '') return +b.total_price || 0;
    if (b.monthly_price != null && b.monthly_price !== '') {
      const s = U.dayFrac(b.start_at), e = U.dayFrac(b.close_at || b.end_at);
      const months = s != null && e != null ? Math.max(1, Math.ceil((e - s - 0.01) / 30)) : 1;
      return U.r2((+b.monthly_price || 0) * months);
    }
    return 0;
  },

  assignStage(r, g, today, minOut) {
    const k = r.case || {};
    let s;
    if (r.status !== 'Closed') s = 'active';
    else if (r.outstanding <= minOut) s = 'settled';
    else if (k.paid_marked_at) s = 'paid_marked';
    else if (r.claim_live && /recover|paid|approved|settled/i.test(r.claim_state)) s = ((g.claims_posted_in_ledger ? r.outstanding : r.outstanding - (r.claim_approved || 0)) > minOut) ? 'recovered_partial' : 'recovery';
    else if (r.claim_live && /update|info|pending|review/i.test(r.claim_state)) s = 'need_update';
    else if (r.claim_live) s = 'recovery';
    else if (k.claim_submitted_at && (!r.claims.length || U.dayNum(k.claim_submitted_at) >= Math.max(...r.claims.map(x => U.dayNum(x.claim_date) || 0)))) s = 'claim_submitted';
    else if (k.on_hold) s = 'on_hold';
    else if (r.claims.length && !r.claim_live) s = 'claim_rejected';
    else if (r.booking_state !== 'active') s = 'not_covered';
    else if (r.days_to_deadline != null && r.days_to_deadline < 0) s = 'claim_expired';
    else if (k.promise_date && U.dayNum(k.promise_date) >= today) s = 'promised';
    else if (!r.contact_count) s = 'to_contact';
    else if (r.contact_count >= (+g.claim_after_reminders || 2) || (r.days_since_contact != null && r.days_since_contact >= (+g.claim_after_days || 3))) s = 'ready_to_claim';
    else s = 'contacted';
    r.stage = s;
    r.stage_info = STAGES[s];
  },

  flags(r, today) {
    const f = [];
    const k = r.case || {};
    if (r.status === 'Open') {
      if (r.booking_state === 'none') f.push({ t: 'No Cardoo booking', tone: 'rose' });
      if (r.booking_state === 'cancelled') f.push({ t: 'Booking cancelled', tone: 'rose' });
      if (r.booking_state === 'active' && r.dropoff_at && r.booking_end && U.dayFrac(r.booking_end) + 0.04 < U.dayFrac(r.dropoff_at)) f.push({ t: 'Extend booking', tone: 'amber' });
      if (r.booking_state === 'active' && r.booking_end && U.dayFrac(r.booking_end) < today) f.push({ t: 'Booking period ended', tone: 'amber' });
      if (r.close_sync === 'cardoo_only') f.push({ t: 'Closed in Cardoo only', tone: 'rose' });
    } else {
      if (r.claim_window === 'soon' && !['settled', 'paid_marked', 'claim_submitted'].includes(r.stage)) f.push({ t: `Claim in ${r.days_to_deadline}d`, tone: 'amber' });
      if (r.close_sync === 'caryaati_only') f.push({ t: 'Close in Cardoo', tone: 'slate' });
      if (r.close_diff_days) f.push({ t: `Cardoo close ${r.close_diff_days > 0 ? '+' : ''}${r.close_diff_days}d`, tone: 'slate' });
    }
    if (k.promise_date && U.dayNum(k.promise_date) < today && r.stage !== 'settled' && r.status === 'Closed') f.push({ t: 'Promise missed', tone: 'rose' });
    if (r.status === 'Closed' && r.outstanding > 0 && !r.phone_valid) f.push({ t: r.phone_kind === 'nocc' ? 'Add country code' : r.phone_kind === 'missing' ? 'No phone' : 'Check phone', tone: 'amber' });
    if (r.followup_due) f.push({ t: 'Follow-up due', tone: 'indigo' });
    if (r.link_overdue) f.push({ t: 'Link not received', tone: 'violet' });
    if (r.stage === 'claim_submitted' && r.submitted_days >= 7) f.push({ t: `Not in Cardoo report ${r.submitted_days}d`, tone: 'orange' });
    if (r.submitted_late) f.push({ t: 'Submitted after window', tone: 'rose' });
    if (r.contract && r.contract.status && r.contract.status.toLowerCase() !== r.status.toLowerCase()) f.push({ t: 'Status mismatch', tone: 'slate' });
    return f;
  },

  reconcile(model) {
    const R = model.records;
    const today = U.todayNum();
    const list = [];
    const add = (id, title, severity, desc, rows, kind) => list.push({ id, title, severity, desc, rows, kind: kind || 'records' });
    add('no_booking_open', 'Open waiver contracts without a Cardoo booking', 'critical',
      'A waiver fee was charged but the deposit is not registered with Cardoo — create the booking now.',
      R.filter(r => r.status === 'Open' && r.booking_state !== 'active'));
    add('no_booking_closed', 'Closed waiver contracts that were never covered by Cardoo', 'high',
      'No active Cardoo booking existed — any outstanding must be collected directly.',
      R.filter(r => r.status === 'Closed' && r.booking_state !== 'active'));
    add('extend', 'Open contracts that need a Cardoo booking extension', 'high',
      'Contract drop-off is later than the Cardoo booking end — extend the booking so the deposit stays covered.',
      R.filter(r => r.status === 'Open' && r.booking_state === 'active' && r.dropoff_at && r.booking_end && U.dayFrac(r.booking_end) + 0.04 < U.dayFrac(r.dropoff_at)));
    const gg = model.settings.general;
    add('deadline', `Claim window closing within ${gg.expiring_soon_days || 10} days`, 'critical',
      `Closed, outstanding, covered by Cardoo, no claim yet — submit before the ${gg.claim_deadline_days || 60}-day window ends.`,
      R.filter(r => r.claim_window === 'soon' && !['settled', 'paid_marked', 'claim_submitted'].includes(r.stage)));
    add('expired', 'Claim window expired — cannot claim from Cardoo', 'high',
      `Closed more than ${gg.claim_deadline_days || 60} days ago with an outstanding balance and no claim — collect directly from the customer.`,
      R.filter(r => r.stage === 'claim_expired'));
    add('close_booking', 'Closed in Caryaati but still open in Cardoo', 'medium',
      'Close the booking in Cardoo too (monthly bookings keep accruing fees).',
      R.filter(r => r.close_sync === 'caryaati_only'));
    add('close_mismatch', 'Closing date differs between Caryaati and Cardoo', 'low',
      'Both are closed but on different dates.',
      R.filter(r => r.close_diff_days));
    add('cardoo_only_closed', 'Closed in Cardoo but still open in Caryaati', 'high',
      'The deposit is no longer covered while the rental is still running.',
      R.filter(r => r.close_sync === 'cardoo_only'));
    add('missing_caryaati', 'Cardoo bookings whose contract is missing in Caryaati', 'high',
      'Booked in Cardoo but the contract number is not in the Caryaati Rental Contracts data — check the contract number in Cardoo.',
      model.missingInCaryaati, 'cardoo');
    add('orphan_booking', 'Booked in Cardoo but no waiver fee in Caryaati', 'medium',
      'The contract exists in Caryaati but is not in the Deposit Waivers report — check whether a waiver fee was charged.',
      model.bookedNoWaiver, 'cardoo');
    add('orphan_claim', 'Cardoo claims for contracts not in the waiver report', 'low',
      'Claims exist in Cardoo for contracts missing from the waiver report.',
      model.claimRows.filter(x => !x._inWaivers), 'claims');
    add('multi_booking', 'Contracts with more than one active Cardoo booking', 'low',
      'Usually a short-term booking converted to long-term — make sure only the right one is billed.',
      R.filter(r => r.bookings.filter(b => !b.cancelled).length > 1));
    add('phone', 'Outstanding customers with a phone that needs checking', 'medium',
      'Caryaati exports mobiles without the country code. UAE mobiles are fixed automatically; foreign numbers need the country confirmed — use “Fix country codes” (suggestions from number pattern and e-mail domain).',
      R.filter(r => r.status === 'Closed' && r.outstanding > 0 && !r.phone_valid));
    add('status_mismatch', 'Status differs between Waiver report and Contracts report', 'low',
      'One report says Open and the other Closed — usually fixed by the next export.',
      R.filter(r => r.contract && r.contract.status && r.contract.status.toLowerCase() !== r.status.toLowerCase()));
    add('name_mismatch', 'Customer name differs after tag removal', 'low',
      'Cleaned waiver name ≠ name in Rental Contracts report (the contracts name is used everywhere).',
      R.filter(r => r.contract && Engine.nameKey(r.name) !== Engine.nameKey(r.name_waiver)));
    add('promise_missed', 'Missed payment promises', 'medium',
      'Promise date has passed and the balance is still outstanding.',
      R.filter(r => r.case && r.case.promise_date && U.dayNum(r.case.promise_date) < today && r.status === 'Closed' && r.outstanding > (+model.settings.general.min_outstanding || 0) && r.stage !== 'paid_marked'));
    return list;
  },

  kpis(model) {
    const R = model.records;
    const closed = R.filter(r => r.status === 'Closed'), open = R.filter(r => r.status === 'Open');
    const minOut = +model.settings.general.min_outstanding || 0;
    const owing = closed.filter(r => r.outstanding > minOut && STAGES[r.stage].group !== 'done');
    const collect = owing.filter(r => STAGES[r.stage].group === 'collect');
    const ready = owing.filter(r => r.stage === 'ready_to_claim');
    const inRecovery = model.claimRows.filter(x => /recover/i.test(x.status));
    const partial = R.filter(r => r.stage === 'recovered_partial');
    const stageCounts = {};
    for (const r of R) stageCounts[r.stage] = (stageCounts[r.stage] || 0) + 1;
    return {
      total: R.length, open: open.length, closed: closed.length,
      waiverFees: U.sum(R, r => r.waiver_amount),
      cardooFees: U.sum(R, r => r.cardoo_fee),
      owingCount: owing.length, owingAmount: U.sum(owing, r => r.outstanding),
      collectCount: collect.length, collectAmount: U.sum(collect, r => r.due),
      readyCount: ready.length, readyAmount: U.sum(ready, r => r.claimable),
      recoveryCount: inRecovery.length, recoveryApproved: U.sum(inRecovery, x => x.approved_amount),
      partialCount: partial.length, partialDue: U.sum(partial, r => r.due),
      needUpdate: model.claimRows.filter(x => /update/i.test(x.status)).length,
      coveredExposure: U.sum(open, r => r.coverage),
      noBookingOpen: open.filter(r => r.booking_state !== 'active').length,
      expiredCount: owing.filter(r => r.stage === 'claim_expired').length, expiredAmount: U.sum(owing.filter(r => r.stage === 'claim_expired'), r => r.outstanding),
      soonCount: owing.filter(r => r.claim_window === 'soon').length,
      closeInCardoo: R.filter(r => r.close_sync === 'caryaati_only').length,
      missingInCaryaati: model.missingInCaryaati.length,
      openOutstanding: U.sum(open.filter(r => r.outstanding > 0), r => r.outstanding),
      stageCounts,
      criticalChecks: model.checks.filter(c => (c.severity === 'critical' || c.severity === 'high') && c.rows.length).reduce((a, c) => a + c.rows.length, 0)
    };
  },

  /* ---------- WhatsApp message ---------- */
  fillTemplate(body, r, settings) {
    const g = settings.general;
    const map = {
      name: U.titleCase(r.name || ''), first_name: U.titleCase((r.name || '').split(' ')[0] || ''),
      contract: r.contract_no, amount: U.money(r.due != null ? r.due : r.outstanding), currency: g.currency || 'AED', ledger_balance: U.money(r.outstanding),
      vehicle: r.vehicle || '', plate: r.plate || '', open_date: U.fmtDate(r.open_date), close_date: U.fmtDate(r.close_date),
      payment_link: r.payment_link || '[payment link]', company: g.company_name || '', company_phone: g.company_phone || '',
      waiver_amount: U.money(r.waiver_amount), today: U.fmtDate(U.todayISO())
    };
    return String(body || '').replace(/\{(\w+)\}/g, (m, k) => (k in map ? String(map[k]) : m));
  },
  waLink(phone, text) { return `https://wa.me/${String(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`; }
};

/* =====================================================================
   1a. PHONES – country codes
   Caryaati exports mobiles WITHOUT the country code (UAE 5xxxxxxxx and
   foreign numbers alike). UAE mobiles are recognised directly; foreign
   numbers get a country suggestion from the number pattern and the
   customer's e-mail domain (.de, .it, .co.uk …). Only a suggestion that
   both patterns agree on is applied automatically – everything else is
   shown as "Add country code" with one-click suggestions.
   ===================================================================== */
const PHONE_COUNTRIES = [
  // iso, name, dial code, national lengths, national mobile pattern, e-mail TLDs, prior (how common among customers)
  ['AE', 'UAE', '971', [9], /^5[024568]/, ['ae'], 9],
  ['IN', 'India', '91', [10], /^[6-9]/, ['in'], 6],
  ['PK', 'Pakistan', '92', [10], /^3[0-4]/, ['pk'], 5],
  ['GB', 'United Kingdom', '44', [10], /^7[1-9]/, ['uk'], 5],
  ['RU', 'Russia', '7', [10], /^9/, ['ru', 'su'], 5],
  ['DE', 'Germany', '49', [10, 11], /^1[5-7]/, ['de'], 4],
  ['IT', 'Italy', '39', [9, 10], /^3/, ['it'], 3],
  ['FR', 'France', '33', [9], /^[67]/, ['fr'], 3],
  ['ES', 'Spain', '34', [9], /^[67]/, ['es'], 2],
  ['SA', 'Saudi Arabia', '966', [9], /^5/, ['sa'], 3],
  ['EG', 'Egypt', '20', [10], /^1[0125]/, ['eg'], 3],
  ['PH', 'Philippines', '63', [10], /^9/, ['ph'], 3],
  ['TR', 'Turkey', '90', [10], /^5/, ['tr'], 3],
  ['LB', 'Lebanon', '961', [7, 8], /^(3|7[0169]|81)/, ['lb'], 2],
  ['JO', 'Jordan', '962', [9], /^7[789]/, ['jo'], 2],
  ['SY', 'Syria', '963', [9], /^9/, ['sy'], 1],
  ['IQ', 'Iraq', '964', [10], /^7/, ['iq'], 1],
  ['IR', 'Iran', '98', [10], /^9/, ['ir'], 1],
  ['OM', 'Oman', '968', [8], /^[79]/, ['om'], 2],
  ['QA', 'Qatar', '974', [8], /^[3-7]/, ['qa'], 1],
  ['KW', 'Kuwait', '965', [8], /^[569]/, ['kw'], 2],
  ['BH', 'Bahrain', '973', [8], /^3/, ['bh'], 1],
  ['MA', 'Morocco', '212', [9], /^[67]/, ['ma'], 1],
  ['TN', 'Tunisia', '216', [8], /^[2459]/, ['tn'], 1],
  ['DZ', 'Algeria', '213', [9], /^[567]/, ['dz'], 1],
  ['BD', 'Bangladesh', '880', [10], /^1[3-9]/, ['bd'], 2],
  ['LK', 'Sri Lanka', '94', [9], /^7/, ['lk'], 1],
  ['NP', 'Nepal', '977', [10], /^9[78]/, ['np'], 1],
  ['NG', 'Nigeria', '234', [10], /^[789]/, ['ng'], 1],
  ['KE', 'Kenya', '254', [9], /^[17]/, ['ke'], 1],
  ['ZA', 'South Africa', '27', [9], /^[6-8]/, ['za'], 1],
  ['US', 'USA / Canada', '1', [10], /^[2-9]\d\d[2-9]/, ['us', 'ca'], 2],
  ['IE', 'Ireland', '353', [9], /^8[3-9]/, ['ie'], 1],
  ['NL', 'Netherlands', '31', [9], /^6/, ['nl'], 1],
  ['BE', 'Belgium', '32', [9], /^4/, ['be'], 1],
  ['CH', 'Switzerland', '41', [9], /^7[5-9]/, ['ch'], 1],
  ['AT', 'Austria', '43', [10, 11, 12], /^6/, ['at'], 1],
  ['PL', 'Poland', '48', [9], /^[4-8]/, ['pl'], 1],
  ['RO', 'Romania', '40', [9], /^7/, ['ro'], 1],
  ['GR', 'Greece', '30', [10], /^69/, ['gr'], 1],
  ['PT', 'Portugal', '351', [9], /^9[1236]/, ['pt'], 1],
  ['SE', 'Sweden', '46', [9], /^7/, ['se'], 1],
  ['NO', 'Norway', '47', [8], /^[49]/, ['no'], 1],
  ['DK', 'Denmark', '45', [8], /^[2-9]/, ['dk'], 1],
  ['FI', 'Finland', '358', [9, 10], /^(4|50)/, ['fi'], 1],
  ['UA', 'Ukraine', '380', [9], /^[3-9]/, ['ua'], 1],
  ['KZ', 'Kazakhstan', '7', [10], /^7/, ['kz'], 1],
  ['UZ', 'Uzbekistan', '998', [9], /^9/, ['uz'], 1],
  ['AZ', 'Azerbaijan', '994', [9], /^[4-7]/, ['az'], 1],
  ['GE', 'Georgia', '995', [9], /^5/, ['ge'], 1],
  ['AM', 'Armenia', '374', [8], /^[4-9]/, ['am'], 1],
  ['IL', 'Israel', '972', [9], /^5/, ['il'], 1],
  ['CN', 'China', '86', [11], /^1[3-9]/, ['cn'], 1],
  ['AU', 'Australia', '61', [9], /^4/, ['au'], 1],
  ['NZ', 'New Zealand', '64', [8, 9, 10], /^2/, ['nz'], 1],
  ['SG', 'Singapore', '65', [8], /^[89]/, ['sg'], 1],
  ['MY', 'Malaysia', '60', [9, 10], /^1/, ['my'], 1],
  ['ID', 'Indonesia', '62', [9, 10, 11, 12], /^8/, ['id'], 1],
  ['TH', 'Thailand', '66', [9], /^[689]/, ['th'], 1],
  ['BR', 'Brazil', '55', [11], /^\d\d9/, ['br'], 1],
  ['MX', 'Mexico', '52', [10], /^[1-9]/, ['mx'], 1],
  ['SD', 'Sudan', '249', [9], /^9/, ['sd'], 1],
  ['ET', 'Ethiopia', '251', [9], /^9/, ['et'], 1],
  ['UG', 'Uganda', '256', [9], /^7/, ['ug'], 1],
  ['HU', 'Hungary', '36', [9], /^[237]0/, ['hu'], 1],
  ['CZ', 'Czechia', '420', [9], /^[67]/, ['cz'], 1]
].map(([iso, name, cc, lens, re, tlds, prior]) => ({ iso, name, cc, lens, re, tlds, prior }));
const PHONE_BY_CC = PHONE_COUNTRIES.slice().sort((a, b) => b.cc.length - a.cc.length);

Object.assign(U, {
  phoneCountry(iso) { return PHONE_COUNTRIES.find(c => c.iso === iso) || null; },
  emailTld(email) {
    const m = /\.([a-z]{2,6})\d*\s*$/i.exec(String(email || '').trim());
    return m ? m[1].toLowerCase() : '';
  },
  /** split full international digits into {country, national} */
  phoneSplit(d) {
    if (/^9715\d{8}$/.test(d)) return { country: U.phoneCountry('AE'), national: d.slice(3) };
    for (const c of PHONE_BY_CC) {
      if (!d.startsWith(c.cc)) continue;
      const n = d.slice(c.cc.length);
      if (c.lens.includes(n.length)) return { country: c, national: n };
    }
    return { country: null, national: d };
  },
  phoneFmt(d) {
    const s = U.phoneSplit(d);
    if (s.country && s.country.iso === 'AE') return `+971 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
    return s.country ? `+${s.country.cc} ${s.national}` : '+' + d;
  },
  /** ranked country suggestions for a number that has no country code */
  phoneSuggest(d, email) {
    const tld = U.emailTld(email);
    const nat = d.replace(/^0+/, '');
    const out = [];
    for (const c of PHONE_COUNTRIES) {
      const tldHit = tld && c.tlds.includes(tld);
      // a) number is national (no code)
      if (c.lens.includes(nat.length) && c.re.test(nat)) out.push({ iso: c.iso, name: c.name, cc: c.cc, national: nat, digits: c.cc + nat, tld: !!tldHit, score: 10 + c.prior + (tldHit ? 30 : 0), reason: tldHit ? `e-mail ends .${tld}` : 'number pattern' });
      // b) number already carries the code (no + sign in the report)
      if (d.startsWith(c.cc) && c.iso !== 'AE') {
        const n = d.slice(c.cc.length);
        if (c.lens.includes(n.length) && c.re.test(n)) out.push({ iso: c.iso, name: c.name, cc: c.cc, national: n, digits: d, tld: !!tldHit, score: 8 + c.prior + (tldHit ? 30 : 0), reason: tldHit ? `already has +${c.cc} · e-mail .${tld}` : `already starts with ${c.cc}` });
      }
    }
    // e-mail country even if the pattern is unusual (lower score)
    if (tld) {
      const c = PHONE_COUNTRIES.find(x => x.tlds.includes(tld));
      if (c && !out.some(x => x.iso === c.iso)) out.push({ iso: c.iso, name: c.name, cc: c.cc, national: nat, digits: c.cc + nat, tld: true, score: 6, reason: `e-mail ends .${tld} (length unusual)` });
    }
    out.sort((a, b) => b.score - a.score);
    const seen = new Set();
    return out.filter(x => { const k = x.digits; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
  },

  /* ---------- phones → WhatsApp-ready digits ---------- */
  phone(raw, cc, opts) {
    cc = String(cc || '971');
    opts = opts || {};
    if (raw == null || raw === '') return { digits: '', valid: false, kind: 'missing', display: '', suggest: [] };
    const s = typeof raw === 'number' ? String(Math.round(raw)) : String(raw).trim();
    let d = s.replace(/\D/g, '');
    const explicit = /^\s*(\+|00)/.test(s);           // typed with + / 00 → trust the country code
    if (d.startsWith('00')) d = d.slice(2);
    if (!d) return { digits: '', valid: false, kind: 'missing', display: U.clean(s), suggest: [] };
    const res = (digits, kind, extra) => {
      const valid = kind === 'uae' || kind === 'intl' || kind === 'local';
      const sp = U.phoneSplit(digits);
      return Object.assign({ digits, valid, kind, display: valid || kind === 'landline' ? U.phoneFmt(digits) : d, country: sp.country ? sp.country.name : '', iso: sp.country ? sp.country.iso : '', national: sp.national, suggest: [] }, extra || {});
    };
    if (explicit) {
      if (/^9715\d{8}$/.test(d)) return res(d, 'uae');
      if (/^9710\d{9}$/.test(d)) return res('971' + d.slice(4), 'uae');
      return res(d, /^[1-9]\d{7,14}$/.test(d) ? 'intl' : 'check');
    }
    if (cc !== '971') {
      let out = d;
      if (d.startsWith('0')) out = cc + d.slice(1); else if (!d.startsWith(cc)) out = cc + d;
      return res(out, /^\d{10,15}$/.test(out) ? 'local' : 'check');
    }
    // UAE numbers
    if (/^9710\d{9}$/.test(d)) return res('971' + d.slice(4), 'uae');
    if (/^9715\d{8}$/.test(d)) return res(d, 'uae');
    if (/^05\d{8}$/.test(d)) return res('971' + d.slice(1), 'uae');
    if (/^5\d{8}$/.test(d)) return res('971' + d, 'uae');
    if (/^971[234679]\d{7}$/.test(d)) return res(d, 'landline');
    if (/^0[234679]\d{7}$/.test(d)) return res('971' + d.slice(1), 'landline');
    // foreign number without its country code
    const sug = U.phoneSuggest(d, opts.email);
    const top = sug[0];
    const sure = top && top.tld && top.score >= 40 && !(sug[1] && sug[1].tld && sug[1].score >= 40 && sug[1].iso !== top.iso);
    if (sure) return res(top.digits, 'intl', { auto: true, auto_reason: top.reason, suggest: sug, raw_digits: d });
    return { digits: '', valid: false, kind: 'nocc', display: d, raw_digits: d, suggest: sug, country: '', iso: '', national: d };
  }
});

/* ---------- Profitability analysis ---------- */
Engine.profit = function (model, opt) {
  opt = opt || {};
  const a = opt.from ? U.dayNum(opt.from) : null, b = opt.to ? U.dayNum(opt.to) : null;
  const inRange = d => { const n = U.dayNum(d); if (n == null) return !a && !b; return (a == null || n >= a) && (b == null || n <= b); };
  const g = model.settings.general, minOut = +g.min_outstanding || 0;
  const R = model.records.filter(r => inRange(r.open_date));
  const recSet = new Set(R.map(r => r.contract_no));
  const B = model.bookingRows.filter(x => !x.cancelled && inRange(x.start_at));
  const Bc = model.bookingRows.filter(x => x.cancelled && inRange(x.start_at));
  const CL = model.claimRows.filter(x => x._rec ? recSet.has(+x.contract_no) : inRange(x.claim_date));
  const P = model.paymentRows.filter(p => p._rec && recSet.has(+p.contract_no));
  const isRec = x => /recover/i.test(x.status), isRej = x => /cancel|declin|reject/i.test(x.status);

  const fees = U.sum(R, r => r.waiver_amount);
  let cost = U.sum(B, x => x._fee);
  const costLinked = U.sum(B.filter(x => x._inWaivers), x => x._fee);
  const costNoWaiver = U.sum(B.filter(x => !x._inWaivers), x => x._fee);
  const costShort = U.sum(B.filter(x => /short/i.test(x.booking_type)), x => x._fee);
  const costLong = U.sum(B.filter(x => /long/i.test(x.booking_type)), x => x._fee);
  let approved = U.sum(CL.filter(isRec), x => x.approved_amount);
  const claimedExcess = U.sum(CL.filter(x => !isRej(x)), x => x.excess_sum);
  const rejectedExcess = U.sum(CL.filter(isRej), x => x.excess_sum);
  const needUpd = CL.filter(x => /update/i.test(x.status));
  const rentCollected = U.sum(P, p => p.net_amount);
  const rentVat = U.sum(P, p => p.vat);
  const rentBilled = U.sum(R.filter(r => r.contract), r => r.contract.total_amount);
  const closed = R.filter(r => r.status === 'Closed');
  const owing = closed.filter(r => r.outstanding > minOut);
  const pendingClaim = owing.filter(r => r.claim_window === 'open' || r.claim_window === 'soon');
  const expired = owing.filter(r => r.stage === 'claim_expired');
  const notCovered = owing.filter(r => r.booking_state !== 'active');
  // Actual figures from the Cardoo balance statement (when imported) replace the estimates
  const C = model.cardoo, stRows = C && C.statementRows ? C.statementRows.filter(x => inRange(x.entry_date)) : [];
  const basis = stRows.length ? 'actual' : 'estimate';
  const costEst = cost, approvedEst = approved;
  const sumT = t => U.r2(U.sum(stRows.filter(x => x.type === t), x => +x.amount_aed));
  const actual = basis === 'actual' ? {
    invoiced: sumT('Invoice'), excess: sumT('Excess'), compensation: sumT('Over deposit compensation'), fees: U.r2(-sumT('Bank fees')),
    paid: U.r2(-sumT('Invoice payment')), offset: U.r2(-sumT('Invoice offset')), card: U.r2(-sumT('Card charge')), transfer: U.r2(-sumT('Excess payment')),
    customer: U.r2(-sumT('Excess paid by customer')), from: C.summary.statement.from, to: C.summary.statement.to } : null;
  if (actual) { cost = U.r2(actual.invoiced + actual.fees); approved = U.r2(actual.excess + actual.compensation - actual.customer); }
  const margin = U.r2(fees - cost);
  const net = U.r2(margin + approved);
  const potential = U.r2(net + U.sum(pendingClaim, r => r.claimable));

  // monthly series (open month for fees, booking start month for cost, claim month for recoveries, invoice month for rent)
  const months = new Map();
  const M = k => { if (!k) return null; if (!months.has(k)) months.set(k, { month: k, contracts: 0, fees: 0, cost: 0, approved: 0, rent: 0, claims: 0 }); return months.get(k); };
  R.forEach(r => { const m = M(U.monthKey(r.open_date)); if (m) { m.contracts++; m.fees += r.waiver_amount; } });
  if (actual) {
    stRows.forEach(x => { const m = M(U.monthKey(x.entry_date)); if (!m) return; if (x.type === 'Invoice' || x.type === 'Bank fees') m.cost += Math.abs(+x.amount_aed) * (x.type === 'Invoice' ? 1 : 1); if (x.type === 'Excess' || x.type === 'Over deposit compensation') m.approved += +x.amount_aed; });
    CL.forEach(x => { const m = M(U.monthKey(x.claim_date)); if (m) m.claims++; });
  } else {
    B.forEach(x => { const m = M(U.monthKey(x.start_at)); if (m) m.cost += x._fee; });
    CL.forEach(x => { const m = M(U.monthKey(x.claim_date)); if (m) { m.claims++; if (isRec(x)) m.approved += +x.approved_amount || 0; } });
  }
  P.forEach(p => { const m = M(U.monthKey(p.invoice_date)); if (m) m.rent += +p.net_amount || 0; });
  const monthly = [...months.values()].sort((x, y) => x.month.localeCompare(y.month)).map(m => Object.assign(m, {
    fees: U.r2(m.fees), cost: U.r2(m.cost), approved: U.r2(m.approved), rent: U.r2(m.rent), margin: U.r2(m.fees - m.cost), net: U.r2(m.fees - m.cost + m.approved) }));

  // by booking type & cover level (per waiver contract)
  const group = (keyFn) => {
    const mp = new Map();
    R.forEach(r => {
      const k = keyFn(r); if (!mp.has(k)) mp.set(k, { key: k, contracts: 0, fees: 0, cost: 0, approved: 0, owing: 0, claims: 0 });
      const o = mp.get(k); o.contracts++; o.fees += r.waiver_amount; o.cost += r.cardoo_fee; o.approved += r.claim_approved || 0;
      if (r.status === 'Closed' && r.outstanding > minOut) o.owing += r.outstanding;
      if (r.claims.length) o.claims++;
    });
    return [...mp.values()].map(o => Object.assign(o, { fees: U.r2(o.fees), cost: U.r2(o.cost), approved: U.r2(o.approved), owing: U.r2(o.owing),
      margin: U.r2(o.fees - o.cost), net: U.r2(o.fees - o.cost + o.approved), avgFee: o.contracts ? U.r2(o.fees / o.contracts) : 0, avgCost: o.contracts ? U.r2(o.cost / o.contracts) : 0 }));
  };
  const primaryType = r => { const act = r.bookings.filter(x => !x.cancelled); if (!act.length) return 'No Cardoo booking'; return act.some(x => /long/i.test(x.booking_type)) ? 'Long term' : 'Short term'; };
  const byType = group(primaryType).sort((x, y) => y.contracts - x.contracts);
  const byCover = group(r => r.booking_state === 'active' ? `AED ${U.int(r.coverage)}` : 'Not covered').sort((x, y) => (parseInt(x.key.replace(/\D/g, '')) || 0) - (parseInt(y.key.replace(/\D/g, '')) || 0));
  const byRental = group(r => r.rental_type || 'Unknown').sort((x, y) => y.contracts - x.contracts);

  return {
    range: { from: opt.from || null, to: opt.to || null }, contracts: R.length, open: R.length - closed.length, closed: closed.length,
    bookings: B.length, bookingsCancelled: Bc.length, bookingsNoWaiver: B.filter(x => !x._inWaivers).length,
    fees, cost, costLinked, costNoWaiver, costShort, costLong, margin, marginPct: fees ? U.r2(margin / fees * 100) : 0,
    feeCoverage: cost ? U.r2(fees / cost) : null, avgFee: R.length ? U.r2(fees / R.length) : 0, avgCost: B.length ? U.r2(cost / B.length) : 0,
    approved, claimedExcess, rejectedExcess, claims: CL.length, claimsRecovery: CL.filter(isRec).length, claimsRejected: CL.filter(isRej).length, claimsNeedUpdate: needUpd.length,
    recoveryRate: claimedExcess ? U.r2(approved / claimedExcess * 100) : 0,
    claimRate: closed.length ? U.r2(new Set(CL.map(x => +x.contract_no)).size / closed.length * 100) : 0,
    rentCollected, rentVat, rentBilled,
    owingAmount: U.sum(owing, r => r.outstanding), owingCount: owing.length,
    pendingClaimAmount: U.sum(pendingClaim, r => r.claimable), pendingClaimCount: pendingClaim.length,
    expiredAmount: U.sum(expired, r => r.outstanding), expiredCount: expired.length,
    notCoveredAmount: U.sum(notCovered, r => r.outstanding), notCoveredCount: notCovered.length,
    uncoveredAbove: U.sum(owing.filter(r => r.booking_state === 'active'), r => r.uncovered),
    net, potential, profitable: net > 0, basis, actual, costEst, approvedEst,
    monthly, byType, byCover, byRental
  };
};

/* ---------- Payment-link batch CSV (provider eInvoice batch upload format) ---------- */
Engine.LINK_COLUMNS = ['OrderID', 'OrderName', 'OrderInfo', 'Amount', 'Currency', 'EffectiveStartDate', 'ExpiryDate', 'CardHolderName', 'CardHolderEmail', 'CardHolderMobile', 'Language', 'InvoiceType', 'Message'];
Engine.orderInfo = function (r) {
  const c = r.contract;
  if (!c) return 'Outstanding balance';
  const parts = [];
  if (+c.rent > 0) parts.push('rent');
  if (+c.salik > 0) parts.push('salik');
  if (+c.fine > 0) parts.push('fines');
  if (+c.other_charges > 0) parts.push('other charges');
  if (!parts.length) return 'Outstanding balance';
  const s = parts.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
Engine.linkMobile = function (r) {
  if (!r.phone) return '';
  if (r.phone_kind === 'uae' && r.phone.startsWith('971')) return r.phone.slice(3);   // 501695692 as in the provider sample
  return r.phone;
};
Engine.linkExpiry = function (g, base) {
  const days = +g.link_expiry_days || 5, t = String(g.link_expiry_time || '15:00:00');
  const d = base ? new Date(base) : new Date();
  d.setDate(d.getDate() + days);
  const tt = /^\d{1,2}:\d{2}(:\d{2})?$/.test(t) ? (t.length <= 5 ? t + ':00' : t).padStart(8, '0') : '15:00:00';
  return `${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}-${d.getFullYear()} ${tt}`;
};
Engine.linkRow = function (r, g, o) {
  o = o || {};
  const amount = o.amount != null ? +o.amount : (r.due != null ? r.due : r.outstanding);
  return {
    OrderID: 'Cno' + r.contract_no,
    OrderName: o.orderName != null ? o.orderName : (g.link_order_name || 'Outstanding Balance'),
    OrderInfo: o.orderInfo != null ? o.orderInfo : Engine.orderInfo(r),
    Amount: String(U.r2(amount)),
    Currency: g.currency || 'AED',
    EffectiveStartDate: '',
    ExpiryDate: o.expiry || Engine.linkExpiry(g),
    CardHolderName: U.clean(r.name),
    CardHolderEmail: r.email || '',
    CardHolderMobile: Engine.linkMobile(r),
    Language: g.link_language || 'en',
    InvoiceType: g.link_invoice_type || 'Once',
    Message: o.message != null ? o.message : (g.link_message || 'Please pay the amount.')
  };
};
Engine.csv = function (rows, cols) {
  const esc = v => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\r\n') + '\r\n';
};

/* ---------- Today's tasks ---------- */
Engine.TASKS = [
  { id: 'promise', label: 'Payment promises due', hint: 'Promise date is today or has passed', tone: 'teal', icon: 'calendar', fn: r => r.promise_due },
  { id: 'soon', label: 'Claim windows closing', hint: 'Submit to Cardoo before the window ends', tone: 'orange', icon: 'clock', fn: r => r.claim_window === 'soon' && !['paid_marked', 'on_hold'].includes(r.stage) },
  { id: 'ready', label: 'Ready to claim', hint: 'Reminders done — submit the claim', tone: 'amber', icon: 'file-check', fn: r => r.stage === 'ready_to_claim' },
  { id: 'followup', label: 'Follow-ups due', hint: 'Contacted 2+ days ago, still unpaid', tone: 'indigo', icon: 'whatsapp', fn: r => r.followup_due },
  { id: 'contact', label: 'Customers to contact', hint: 'Outstanding, never contacted', tone: 'blue', icon: 'send', fn: r => r.stage === 'to_contact' },
  { id: 'links', label: 'Payment links not received', hint: 'Batch CSV sent 2+ days ago, no link saved', tone: 'violet', icon: 'link', fn: r => r.link_overdue },
  { id: 'claimwait', label: 'Submitted, not in Cardoo report', hint: 'Claim marked submitted 7+ days ago', tone: 'rose', icon: 'alert', fn: r => r.stage === 'claim_submitted' && r.submitted_days >= 7 }
];

/* ---------- Cardoo 15-day invoices (PO) ---------- */
Engine.poFromName = function (name) {
  const m = String(name || '').match(/PO[\s_-]?(\d{3,})/i);
  return m ? 'PO_' + m[1] : null;
};
Engine._norm_po_lines = function (det) {
  const { rows, headerRow, colIndex: ci } = det, C = Engine._cell;
  const out = [], issues = [], keys = new Map();
  const stats = { rows: 0, skipped: 0, credits: 0, variants: 0 };
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue;
    const rawC = C(row, ci, 'contract');
    const pc = Engine.parseContract(rawC);
    if (!pc) { if (row.some(v => !U.isBlank(v))) stats.skipped++; continue; }
    stats.rows++;
    if (pc.suffix) stats.variants++;
    const price = U.num(C(row, ci, 'price')), inv = U.num(C(row, ci, 'invPrice'));
    if ((price || 0) < 0) stats.credits++;
    let key = U.clean(C(row, ci, 'dfid')) || `${U.clean(rawC)}|${U.isoDT(C(row, ci, 'start'))}`;
    const c = keys.get(key) || 0; keys.set(key, c + 1); if (c) key = `${key}#${c + 1}`;
    out.push({ row_key: key, contract_no: pc.no, contract_raw: U.clean(rawC), booking_no: U.clean(C(row, ci, 'booking')) || null,
      booking_type: U.clean(C(row, ci, 'btype')) || null, cancelled: /^(yes|y|true|1)$/i.test(U.clean(C(row, ci, 'cancelled'))),
      start_at: U.isoDT(C(row, ci, 'start')), end_at: U.isoDT(C(row, ci, 'end')), close_at: U.isoDT(C(row, ci, 'close')),
      deposit: U.r2(U.num0(C(row, ci, 'deposit'))), price_aed: price == null ? 0 : Math.round(price * 10000) / 10000,
      price_currency: U.clean(C(row, ci, 'currency')) || 'AED', invoice_price: inv == null ? 0 : Math.round(inv * 1e6) / 1e6,
      invoice_currency: U.clean(C(row, ci, 'invCurrency')) || 'USD', comment: U.clean(C(row, ci, 'comment')) || null,
      booked_at: U.isoDT(C(row, ci, 'bookedAt')), deposit_free_id: U.clean(C(row, ci, 'dfid')) || null,
      user_label: U.clean(C(row, ci, 'user')) || null, partner: U.clean(C(row, ci, 'partner')) || null });
  }
  const tAed = out.reduce((a, x) => a + x.price_aed, 0), tUsd = out.reduce((a, x) => a + x.invoice_price, 0);
  stats.total_aed = U.r2(tAed); stats.total_usd = U.r2(tUsd);
  issues.push({ level: 'info', text: `${out.length} billed lines · AED ${U.money(tAed)} = USD ${U.money(tUsd)}${stats.credits ? ` · ${stats.credits} credit line(s) for early closures` : ''}.` });
  return { rows: out, stats, issues };
};
/** Text of a Cardoo PO invoice PDF → header fields */
Engine.parsePoText = function (t) {
  t = String(t || '').replace(/\s+/g, ' ');
  const num = s => s == null ? null : (s.trim() === '-' ? 0 : U.num(s));
  const g = (re, i = 1) => { const m = t.match(re); return m ? m[i] : null; };
  const po = g(/Invoice\s*No\.?\s*:?\s*(PO[\s_-]?\d+)/i);
  const per = t.match(/(?:Suretyship|period)\s*for\s*(\d{4}-\d{2}-\d{2})\s*[—–-]+\s*(\d{4}-\d{2}-\d{2})/i);
  const aed = g(/Total\s*AED\s*([\d,]+(?:\.\d+)?)/i);
  const qtyUsd = t.match(/Total\s*AED\s*[\d,]+(?:\.\d+)?\s*\)\s*(\d+)\s+([\d,]+\.\d{2})/i);
  const res = {
    po_no: po ? 'PO_' + po.replace(/\D/g, '') : null,
    issue_date: U.isoDate(g(/Issue\s*date\s*:?\s*(\d{4}-\d{2}-\d{2})/i)),
    period_from: per ? per[1] : null, period_to: per ? per[2] : null,
    total_aed: num(aed), qty: qtyUsd ? +qtyUsd[1] : null, total_usd: qtyUsd ? num(qtyUsd[2]) : null,
    subtotal_usd: num(g(/SUBTOTAL\s*([\d,]+\.\d{2})/i)), vat_usd: num(g(/\bVAT\s+(-|[\d,]+\.\d{2})\s+BALANCE/i)),
    balance_due_usd: num(g(/BALANCE\s*DUE\s*([\d,]+\.\d{2})/i)),
    currency: /TOTAL,?\s*USD/i.test(t) ? 'USD' : (g(/TOTAL,?\s*([A-Z]{3})/) || 'USD'),
    agreement_no: g(/agreement\s*No\.?\s*([\w-]+)/i),
    payment_terms_days: +(g(/within\s*(\d+)\s*business\s*days/i) || 3),
    raw_text: t.slice(0, 4000)
  };
  if (res.total_usd == null) res.total_usd = res.subtotal_usd != null ? res.subtotal_usd : res.balance_due_usd;
  return res;
};
Engine.addBusinessDays = function (iso, n) {
  if (!iso) return null;
  let dn = U.dayNum(iso), added = 0;
  while (added < n) { dn++; const wd = new Date(dn * 86400000).getUTCDay(); if (wd !== 0 && wd !== 6) added++; }
  const d = new Date(dn * 86400000);
  return `${d.getUTCFullYear()}-${U.pad(d.getUTCMonth() + 1)}-${U.pad(d.getUTCDate())}`;
};
Engine.DEFAULT_FX = 3.6725;


/* =====================================================================
   Cardoo balance statement ("Balance_from_…xlsx")
   ---------------------------------------------------------------------
   One amount column holds two open-item ledgers:
     invoice side : Invoice (+) settled by Invoice payment / Invoice offset / Bank fees (−)
     excess side  : Excess, Over deposit compensation, charge reversals (+)
                    settled by Card charge / Excess offset / Excess payment / Excess paid by customer (−)
   Each side nets to zero once everything is settled.
   ===================================================================== */
Engine.STMT_INVOICE = ['Invoice', 'Invoice payment', 'Invoice offset', 'Bank fees'];
Engine.STMT_EXCESS = ['Excess', 'Card charge', 'Excess offset', 'Excess payment', 'Excess paid by customer', 'Over deposit compensation'];
Engine.STMT_LABEL = {
  'Invoice': 'Cardoo invoice', 'Invoice payment': 'We paid (transfer)', 'Invoice offset': 'Invoice offset vs excess', 'Bank fees': 'Bank fees',
  'Excess': 'Excess credited to us', 'Card charge': 'Received (card charge)', 'Excess offset': 'Excess offset vs invoice', 'Excess payment': 'Received (Cardoo transfer)',
  'Excess paid by customer': 'Paid by customer', 'Over deposit compensation': 'Over-deposit compensation'
};
Engine.stmtSide = function (type) {
  if (Engine.STMT_INVOICE.includes(type)) return 'invoice';
  if (Engine.STMT_EXCESS.includes(type)) return 'excess';
  if (/invoice|bank/i.test(type)) return 'invoice';
  if (/excess|card|deposit|claim|compens/i.test(type)) return 'excess';
  return 'other';
};
Engine.stmtAmount = function (v) {
  if (typeof v === 'number') return U.r2(v);
  const m = String(v == null ? '' : v).replace(/\s/g, '').match(/-?[\d,]*\.?\d+(?:E[-+]?\d+)?/i);
  return m ? U.r2(parseFloat(m[0].replace(/,/g, ''))) : null;
};
Engine.isStatement = function (wb, XLSX) {
  for (const n of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false });
    const flat = rows.slice(0, 400).map(r => (r || []).map(x => String(x == null ? '' : x).trim().toLowerCase()));
    if (flat.some(r => r.includes('balance brought forward')) && flat.some(r => r.includes('period'))) return { sheet: n, rows };
  }
  return null;
};
Engine.parseStatement = function (rows, fileName) {
  const out = [], balances = [], occ = new Map(), totals = {}, issues = [];
  let from = null, to = null, month = null;
  for (const r of rows) {
    if (!r) continue;
    const c = r.map(x => (x == null ? '' : typeof x === 'string' ? U.clean(x) : x));
    const pIdx = c.findIndex(x => String(x).toLowerCase() === 'period');
    if (pIdx >= 0) { from = U.isoDate(c[pIdx + 1]); to = U.isoDate(c[pIdx + 2]); continue; }
    if (c[0] && !c[1] && /^[A-Za-z]+\s+\d{4}$/.test(String(c[0]))) { month = String(c[0]); continue; }
    const type = String(c[1] || '');
    if (!type) continue;
    const date = U.isoDate(c[0]);
    const amount = Engine.stmtAmount(c[3]);
    if (/^balance\s+(brought|carried)\s+forward$/i.test(type)) {
      let b = balances.find(x => x.month === month); if (!b) balances.push(b = { month, date });
      b[/brought/i.test(type) ? 'bf' : 'cf'] = amount; continue;
    }
    if (!date || amount == null) continue;
    const desc = String(c[2] || '');
    const side = Engine.stmtSide(type);
    const poM = desc.match(/PO[\s_-]?(\d{3,})/i), usdM = desc.match(/\(([\d.,]+)\s*USD\)/i);
    const clM = desc.match(/^([\w-]+?)\s*:\s*(\d{1,2}\.\d{1,2}\.\d{2,4})$/);
    const only = desc.match(/^(\d{3,7}(?:-\w+)?)$/);
    const pc = clM ? Engine.parseContract(clM[1]) : only ? Engine.parseContract(only[1]) : null;
    const base = `${date}|${type}|${desc}|${amount}`;
    const n = (occ.get(base) || 0) + 1; occ.set(base, n);
    const cur = (String(c[3]).match(/[A-Z]{3}/) || ['AED'])[0];
    out.push({ row_key: `${base}|#${n}`, entry_date: date, type, description: desc || null, amount_aed: amount, currency: cur, side,
      po_no: poM ? 'PO_' + poM[1] : null, usd_amount: usdM ? U.num(usdM[1]) : null, contract_no: pc ? pc.no : null,
      claim_key: clM ? `${clM[1]}|${desc}` : null, seq: out.length + 1 });
    totals[type] = U.r2((totals[type] || 0) + amount);
  }
  if (!from && out.length) from = out[0].entry_date;
  if (!to && out.length) to = out[out.length - 1].entry_date;
  const sides = { invoice: U.sum(out.filter(x => x.side === 'invoice'), x => x.amount_aed), excess: U.sum(out.filter(x => x.side === 'excess'), x => x.amount_aed), other: U.sum(out.filter(x => x.side === 'other'), x => x.amount_aed) };
  const lastCf = balances.length ? balances[balances.length - 1].cf : null;
  const unknown = [...new Set(out.filter(x => x.side === 'other').map(x => x.type))];
  if (unknown.length) issues.push({ level: 'warn', text: `Unknown transaction type(s): ${unknown.join(', ')} — kept but not counted in the two balances.` });
  return { file: fileName, period_from: from, period_to: to, rows: out, balances, totals, sides, lastCf, issues };
};

/** Allocate settlements to items (FIFO, with exact matches first) */
Engine.stmtLedger = function (rows) {
  const ord = (a, b) => (U.dayNum(a.entry_date) - U.dayNum(b.entry_date)) || ((a.seq || 0) - (b.seq || 0));
  const R = (rows || []).slice().sort(ord);
  const mk = x => ({ key: x.row_key, date: x.entry_date, type: x.type, desc: x.description, amount: +x.amount_aed, po_no: x.po_no, usd: x.usd_amount != null ? +x.usd_amount : null,
    contract_no: x.contract_no ? +x.contract_no : null, claim_key: x.claim_key, parts: [], settled: 0, open: +x.amount_aed });
  const run = (side) => {
    const items = [], pool = [];     // pool = payments received before the item they belong to existed (credits carried forward)
    const apply = (i, cr) => { const t = U.r2(Math.min(cr.aed, i.open)); if (t <= 0) return; i.open = U.r2(i.open - t); i.settled = U.r2(i.settled + t); i.parts.push({ type: cr.type, date: cr.date, aed: t, desc: cr.desc, carried: !!cr.carried }); cr.aed = U.r2(cr.aed - t); };
    for (const x of R.filter(y => y.side === side)) {
      const amt = +x.amount_aed;
      if (amt > 0) {
        const it = mk(x); items.push(it);
        // consume carried-forward credits: same claim / contract first, then any
        pool.filter(c => c.aed > 0.004 && ((c.claim_key && c.claim_key === it.claim_key) || (c.contract_no && c.contract_no === it.contract_no) || (c.po_no && c.po_no === it.po_no))).forEach(c => it.open > 0.004 && apply(it, c));
        pool.filter(c => c.aed > 0.004 && !c.claim_key && !c.contract_no && !c.po_no).forEach(c => it.open > 0.004 && apply(it, c));
        continue;
      }
      const cr = { type: x.type, date: x.entry_date, aed: -amt, desc: x.description, claim_key: x.claim_key, contract_no: x.contract_no ? +x.contract_no : null, po_no: x.po_no };
      const dn = U.dayNum(x.entry_date);
      const openItems = () => items.filter(i => i.open > 0.004);
      if (cr.claim_key) openItems().filter(i => i.claim_key === cr.claim_key).forEach(i => cr.aed > 0.004 && apply(i, cr));
      if (cr.aed > 0.004 && cr.contract_no && side === 'excess') openItems().filter(i => i.contract_no === cr.contract_no).forEach(i => cr.aed > 0.004 && apply(i, cr));
      if (cr.aed > 0.004 && cr.po_no) openItems().filter(i => i.po_no === cr.po_no).forEach(i => cr.aed > 0.004 && apply(i, cr));
      // a reference to a claim/contract that is not credited yet waits for it
      // the referenced claim is not credited yet → wait for it; if it was already settled, the amount is a deduction from other open items
      const seen = items.some(i => (cr.claim_key && i.claim_key === cr.claim_key) || (cr.contract_no && i.contract_no === cr.contract_no));
      if (cr.aed > 0.004 && (cr.claim_key || (cr.contract_no && side === 'excess')) && !seen) { cr.carried = true; pool.push(cr); continue; }
      if (cr.aed > 0.004 && seen && cr.contract_no) cr.desc = `${cr.desc || ''} (claim already settled — deducted)`.trim();
      if (cr.aed > 0.004 && x.type === 'Card charge') { const ex = openItems().find(i => Math.abs(i.open - cr.aed) < 0.01 && U.dayNum(i.date) <= dn); if (ex) apply(ex, cr); }
      if (cr.aed > 0.004) openItems().filter(i => U.dayNum(i.date) <= dn).forEach(i => cr.aed > 0.004 && apply(i, cr));
      if (cr.aed > 0.004) openItems().forEach(i => cr.aed > 0.004 && apply(i, cr));
      if (cr.aed > 0.004) { cr.carried = true; if (seen) { cr.claim_key = null; cr.contract_no = null; cr.po_no = null; } pool.push(cr); }
    }
    return { items, unalloc: pool.filter(c => c.aed > 0.004).map(c => ({ type: c.type, date: c.date, aed: c.aed, desc: c.desc })) };
  };
  return { invoice: run('invoice'), excess: run('excess') };
};

/* =====================================================================
   Cardoo account model — statement first, PO invoices + manual entries after it
   ===================================================================== */
Engine.cardoo = function (model, cd) {
  cd = cd || {};
  const today = U.todayNum();
  const st = cd.statement || [], imports = cd.statement_imports || [];
  const stTo = imports.length ? imports.map(i => i.period_to).sort().pop() : st.length ? st.map(x => x.entry_date).sort().pop() : null;
  const stFrom = imports.length ? imports.map(i => i.period_from).sort()[0] : st.length ? st.map(x => x.entry_date).sort()[0] : null;
  const stToN = stTo ? U.dayNum(stTo) : null;
  const L = Engine.stmtLedger(st);
  const POS = cd.invoices || [];
  const poMap = new Map(POS.map(i => [i.po_no, i]));
  const fxOf = (aed, usd) => (aed && usd) ? aed / usd : null;
  const defFx = (() => { const a = U.sum(POS, i => +i.total_aed || 0), b = U.sum(POS, i => +i.total_usd || 0); return a && b ? a / b : Engine.DEFAULT_FX; })();

  // manual entries: superseded when the statement already covers their date
  const manual = (cd.settlements || []).map(s => Object.assign({}, s, { superseded: stToN != null && U.dayNum(s.entry_date) <= stToN }));
  const active = manual.filter(s => !s.superseded);
  const toAed = (s, fx) => s.amount_aed != null && s.amount_aed !== '' ? +s.amount_aed : (+s.amount_usd || 0) * (+s.fx || fx || defFx);

  /* ---------- invoices ---------- */
  const invoices = [];
  const seenPo = new Set();
  // Older statement invoices carry no PO number: match the imported PO invoices to them by date + amount.
  // POs imported without the PDF have no issue date — their date window is estimated from neighbouring
  // PO numbers (Cardoo numbers POs in order) and from the booking dates in their lines.
  const poForItem = new Map();
  const poNum = p => parseInt(String(p.po_no).replace(/\D/g, ''), 10) || 0;
  const linesByPoAll = U.groupBy(cd.lines || [], l => l.po_no);
  const poWindow = p => {
    if (p.issue_date) return { lo: U.dayNum(p.issue_date), hi: U.dayNum(p.issue_date), est: false };
    const dated = POS.filter(x => x.issue_date && x.po_no !== p.po_no).map(x => ({ n: poNum(x), d: U.dayNum(x.issue_date) }));
    const n = poNum(p);
    const lower = dated.filter(x => x.n < n).sort((a, b) => b.n - a.n)[0], higher = dated.filter(x => x.n > n).sort((a, b) => a.n - b.n)[0];
    let lo = lower ? lower.d : null, hi = higher ? higher.d : null;
    const ls = linesByPoAll.get(p.po_no) || [];
    const booked = ls.map(l => U.dayNum(l.booked_at || l.start_at)).filter(x => x != null);
    if (booked.length) { const mx = Math.max(...booked); lo = lo == null ? mx : Math.max(lo, mx); }
    if (lo == null && hi == null) return null;
    if (lo == null) lo = hi - 45; if (hi == null) hi = lo + 45;
    if (hi < lo) hi = lo + 16;
    return { lo, hi, est: true };
  };
  POS.forEach(p => { const w = poWindow(p); p._win = w; if (w && w.est) p._est_date = (() => { const d = new Date(Math.round((w.lo + w.hi) / 2) * 86400000); return `${d.getUTCFullYear()}-${U.pad(d.getUTCMonth() + 1)}-${U.pad(d.getUTCDate())}`; })(); });
  {
    const numbered = new Set(L.invoice.items.filter(i => i.po_no).map(i => i.po_no));
    const freeItems = L.invoice.items.filter(i => !i.po_no);
    const freePos = POS.filter(p => !numbered.has(p.po_no) && p._win && (p.total_aed != null || p.lines_total_aed != null));
    const cand = [];
    freePos.forEach(p => {
      const pt = p.total_aed != null ? +p.total_aed : +p.lines_total_aed;
      freeItems.forEach(it => {
        const dn = U.dayNum(it.date), w = p._win;
        const dd = dn < w.lo ? w.lo - dn : dn > w.hi ? dn - w.hi : 0;
        if (dd > 5) return;
        const ad = Math.abs(it.amount - pt), tol = Math.max(3, Math.abs(pt) * 0.015);
        if (w.est && ad > tol) return;                     // undated POs must match on amount
        cand.push({ p, it, dd, ad, strong: ad <= tol, est: w.est });
      });
    });
    cand.sort((x, y) => (y.strong - x.strong) || (x.est - y.est) || (x.ad - y.ad) || (x.dd - y.dd));
    const usedP = new Set(), usedI = new Set();
    cand.forEach(c => {
      if (usedP.has(c.p.po_no) || usedI.has(c.it.key)) return;
      if (!c.strong) {
        const others = cand.filter(o => (o.p === c.p || o.it === c.it) && o !== c && !usedP.has(o.p.po_no) && !usedI.has(o.it.key));
        if (others.length) return;
      }
      usedP.add(c.p.po_no); usedI.add(c.it.key);
      poForItem.set(c.it.key, { po: c.p, strong: c.strong, ad: c.ad, est: c.est });
    });
  }
  const addManual = (row) => {
    const ms = active.filter(s => s.po_no && s.po_no === row.po_no && ['payment', 'offset', 'adjustment'].includes(s.kind));
    ms.forEach(s => { const a = U.r2(toAed(s, row.fx)); row.parts.push({ type: s.kind === 'payment' ? 'Invoice payment' : s.kind === 'offset' ? 'Invoice offset' : 'Adjustment', date: s.entry_date, aed: a, manual: true, id: s.id }); });
    row.manual = ms;
  };
  const finish = (row) => {
    const sumT = re => U.r2(U.sum(row.parts.filter(p => re.test(p.type)), p => p.aed));
    row.paid_aed = sumT(/payment/i); row.offset_aed = sumT(/offset/i); row.fees_aed = sumT(/fee/i); row.adj_aed = sumT(/adjust/i);
    row.balance_aed = U.r2(row.total_aed - row.paid_aed - row.offset_aed - row.fees_aed - row.adj_aed);
    row.balance_usd = row.fx ? U.r2(row.balance_aed / row.fx) : null;
    row.paid_usd = row.fx ? U.r2(row.paid_aed / row.fx) : null; row.offset_usd = row.fx ? U.r2(row.offset_aed / row.fx) : null;
    row.due_date = Engine.addBusinessDays(row.issue_date, +row.payment_terms_days || 3);
    const lastPart = row.parts.map(p => p.date).sort().pop() || null;
    row.settled_on = row.balance_aed <= 0.01 ? lastPart : null;
    if (row.balance_aed <= 0.01) row.status = row.offset_aed > 0 && row.paid_aed > 0 ? 'Paid + offset' : row.offset_aed > 0 ? 'Settled by offset' : 'Paid';
    else if (row.parts.length) row.status = 'Partly settled';
    else row.status = row.due_date && U.dayNum(row.due_date) < today ? 'Overdue' : 'Unpaid';
    row.overdue_days = row.balance_aed > 0.01 && row.due_date && U.dayNum(row.due_date) < today ? today - U.dayNum(row.due_date) : 0;
    row.search = [row.po_no, row.label, row.notes].filter(Boolean).join(' ').toLowerCase();
    invoices.push(row);
  };
  L.invoice.items.forEach(it => {
    const matched = !it.po_no ? poForItem.get(it.key) : null;
    if (matched) it.po_no = matched.po.po_no;
    const po = it.po_no ? poMap.get(it.po_no) : null;
    if (it.po_no) seenPo.add(it.po_no);
    const row = Object.assign({}, po || {}, {
      key: it.po_no || 'ST|' + it.key, po_no: it.po_no || null, label: it.po_no || `Invoice ${U.fmtDate(it.date)}`, source: matched ? (!matched.strong ? 'statement (matched by date — amount differs)' : matched.est ? 'statement (matched by amount — PO had no PDF date)' : 'statement (matched by date & amount)') : 'statement',
      issue_date: (po && po.issue_date) || it.date, stmt_date: it.date, total_aed: it.amount, total_usd: it.usd != null ? it.usd : po ? +po.total_usd : null,
      pdf_total_aed: po ? +po.total_aed : null, payment_terms_days: (po && po.payment_terms_days) || 3,
      parts: it.parts.slice(), has_pdf: !!(po && po.has_pdf), has_lines: !!(po && po.has_lines)
    });
    if (matched && !matched.strong) { row.pdf_total_usd = row.total_usd; row.total_usd = it.usd != null ? it.usd : U.r2(it.amount / defFx); }
    row.fx = fxOf(row.total_aed, row.total_usd) || (po && fxOf(+po.total_aed, +po.total_usd)) || defFx;
    if (!row.period_from) {
      const o = U.parseDT(it.date);
      if (o && o.d === 16) { row.period_from = `${o.y}-${U.pad(o.m)}-01`; row.period_to = `${o.y}-${U.pad(o.m)}-15`; row.period_inferred = true; }
      else if (o && o.d === 1) { const pm = o.m === 1 ? 12 : o.m - 1, py = o.m === 1 ? o.y - 1 : o.y; const last = new Date(Date.UTC(py, pm, 0)).getUTCDate(); row.period_from = `${py}-${U.pad(pm)}-16`; row.period_to = `${py}-${U.pad(pm)}-${U.pad(last)}`; row.period_inferred = true; }
    }
    addManual(row); finish(row);
  });
  POS.filter(p => !seenPo.has(p.po_no)).forEach(p => {
    const total = p.total_aed != null ? +p.total_aed : +p.lines_total_aed || 0;
    const refDay = p.issue_date ? U.dayNum(p.issue_date) : (p._win ? p._win.lo : null);
    const inside = !!(stTo && (refDay == null || refDay <= stToN));   // undated PO while a statement exists → do not assume it is unpaid
    const row = Object.assign({}, p, { key: p.po_no, label: p.po_no, source: inside ? (p.issue_date ? 'not on statement' : 'not on statement (no PDF date)') : 'po', est_issue: p.issue_date ? null : p._est_date || null,
      total_aed: total, total_usd: p.total_usd != null ? +p.total_usd : +p.lines_total_usd || null, pdf_total_aed: total, parts: [] });
    row.fx = fxOf(row.total_aed, row.total_usd) || defFx;
    addManual(row); finish(row);
    if (inside) {   // the statement covers this date but does not list the invoice: never count it as money owed
      row.not_on_statement = true; row.status = 'Not on statement'; row.overdue_days = 0; row.excluded_aed = row.balance_aed; row.balance_aed = 0; row.balance_usd = 0;
    }
  });
  invoices.sort((a, b) => (U.dayNum(b.issue_date) || 0) - (U.dayNum(a.issue_date) || 0));
  const invByPo = new Map(invoices.filter(i => i.po_no).map(i => [i.po_no, i]));
  invoices.forEach(i => {
    const p = i.po_no && poMap.get(i.po_no);
    i.check = !p ? 'statement only' : p.has_pdf && p.has_lines ? (Math.abs((+p.lines_total_aed || 0) - (+p.total_aed || 0)) < 0.05 ? 'ok' : 'mismatch') : p.has_pdf ? 'no_lines' : 'no_pdf';
    const pTot = p ? (p.total_aed != null ? +p.total_aed : p.lines_total_aed != null ? +p.lines_total_aed : null) : null;
    i.stmt_diff = /^statement/.test(i.source) && pTot != null ? U.r2(i.total_aed - pTot) : 0;
    if (/^statement/.test(i.source) && p && p.total_aed == null) i.pdf_total_aed = pTot;
  });

  /* ---------- claims / excess receivable ---------- */
  const claimByKey = new Map(model.claimRows.map(x => [x.row_key, x]));
  const allocs = new Map();     // claim key → [{aed, date, kind, id}]
  active.filter(s => s.kind === 'offset' || s.kind === 'claim_payout').forEach(s => {
    const list = Array.isArray(s.claim_allocs) && s.claim_allocs.length ? s.claim_allocs : (Array.isArray(s.claim_keys) ? s.claim_keys.map(k => ({ key: k, aed: null })) : []);
    list.forEach(a => { if (!allocs.has(a.key)) allocs.set(a.key, []); allocs.get(a.key).push({ aed: a.aed, date: s.entry_date, kind: s.kind, id: s.id }); });
  });
  const applyManual = (c) => {
    (allocs.get(c.key) || []).forEach(a => { const v = a.aed == null ? c.open : Math.min(+a.aed, c.open); if (v <= 0) return; c.parts.push({ type: a.kind === 'offset' ? 'Excess offset' : 'Excess payment', date: a.date, aed: U.r2(v), manual: true, id: a.id }); c.open = U.r2(c.open - v); c.settled = U.r2(c.settled + v); });
  };
  const claims = [];
  const onStmt = new Set();
  L.excess.items.forEach(it => {
    const cl = it.claim_key ? claimByKey.get(it.claim_key) : null;
    if (it.claim_key) onStmt.add(it.claim_key);
    const rec = model.byNo.get(it.contract_no) || null;
    const c = { key: it.claim_key || it.key, stmt_key: it.key, source: 'statement', type: it.type, contract_no: it.contract_no, contract_raw: cl ? cl.contract_raw : it.contract_no,
      title: it.desc || it.type, claim: cl, _rec: rec, _name: rec ? rec.name : cl ? cl._name : (model.contracts.get(it.contract_no) || {}).customer_name || '',
      credited_date: it.date, amount: it.amount, approved: cl ? cl.approved_amount : null, status_cardoo: cl ? cl.status : null,
      parts: it.parts.slice(), settled: it.settled, open: it.open };
    applyManual(c); claims.push(c);
  });
  model.claimRows.filter(x => /recover/i.test(x.status) && !onStmt.has(x.row_key)).forEach(x => {
    const c = { key: x.row_key, source: 'approved', type: 'Approved claim', contract_no: +x.contract_no, contract_raw: x.contract_raw, title: x.title, claim: x, _rec: x._rec, _name: x._name,
      credited_date: null, amount: +x.approved_amount || 0, approved: x.approved_amount, status_cardoo: x.status, parts: [], settled: 0, open: +x.approved_amount || 0 };
    applyManual(c); claims.push(c);
  });
  claims.forEach(c => {
    const rcv = re => U.r2(U.sum(c.parts.filter(p => re.test(p.type)), p => p.aed));
    c.by_card = rcv(/card/i); c.by_offset = rcv(/offset/i); c.by_transfer = rcv(/^excess payment/i); c.by_customer = rcv(/customer/i);
    c.state = c.open <= 0.01 ? 'Received' : c.settled > 0 ? 'Partly received' : c.source === 'approved' ? 'Approved · not on statement' : 'Credited · awaiting';
    c.how = [c.by_card && 'card', c.by_offset && 'offset', c.by_transfer && 'transfer', c.by_customer && 'customer'].filter(Boolean).join(' + ');
    c.received_on = c.open <= 0.01 ? (c.parts.map(p => p.date).sort().pop() || null) : null;
    c.diff = c.source === 'statement' && c.approved != null && c.type === 'Excess' ? U.r2(c.amount - c.approved) : 0;
    c.search = [c.contract_no, c._name, c.title].join(' ').toLowerCase();
  });
  claims.sort((a, b) => (U.dayNum(b.credited_date || (b.claim || {}).claim_date) || 0) - (U.dayNum(a.credited_date || (a.claim || {}).claim_date) || 0));

  /* ---------- lines (PO detail) ---------- */
  const lines = (cd.lines || []).map(l => {
    const rec = model.byNo.get(+l.contract_no) || null, c = model.contracts.get(+l.contract_no) || null, inv = poMap.get(l.po_no) || {};
    const flags = [];
    const carClose = rec && rec.status === 'Closed' ? rec.close_date : (c && /clos/i.test(c.status || '') ? U.isoDate(c.dropoff_at) : null);
    let avoidable = 0;
    if (!c && !rec) flags.push('Not in Caryaati'); else if (!rec) flags.push('No waiver fee');
    if (+l.price_aed > 0 && carClose && inv.period_from && U.dayNum(carClose) < U.dayNum(inv.period_from) && !l.close_at) { flags.push('Billed after Caryaati close'); avoidable = +l.price_aed; }
    if (+l.price_aed < 0) flags.push('Credit');
    return Object.assign({}, l, { _rec: rec, _name: rec ? rec.name : c ? c.customer_name : '', _car_close: carClose, _flags: flags, _avoidable: avoidable,
      search: [l.po_no, l.contract_no, rec ? rec.name : c ? c.customer_name : ''].join(' ').toLowerCase() });
  });
  const billed = new Map();
  lines.forEach(l => { const k = +l.contract_no; const o = billed.get(k) || { aed: 0, n: 0 }; o.aed += +l.price_aed || 0; o.n++; billed.set(k, o); });
  model.records.forEach(r => {
    const b = billed.get(r.contract_no); r.cardoo_billed = b ? U.r2(b.aed) : 0; r.cardoo_billed_lines = b ? b.n : 0;
    const cs = claims.filter(c => c.contract_no === r.contract_no && c.type === 'Excess');
    r.cardoo_credited = U.sum(cs, c => c.amount); r.cardoo_received = U.sum(cs, c => c.settled);
  });

  /* ---------- monthly flows ---------- */
  const months = new Map();
  const M = k => { if (!months.has(k)) months.set(k, { month: k, invoiced: 0, paid: 0, inv_offset: 0, fees: 0, excess: 0, compensation: 0, card: 0, exc_offset: 0, transfer: 0, customer: 0, reversal: 0 }); return months.get(k); };
  st.forEach(x => {
    const m = M(U.monthKey(x.entry_date)), a = +x.amount_aed;
    switch (x.type) {
      case 'Invoice': m.invoiced += a; break; case 'Invoice payment': m.paid -= a; break; case 'Invoice offset': m.inv_offset -= a; break; case 'Bank fees': m.fees -= a; break;
      case 'Excess': m.excess += a; break; case 'Over deposit compensation': m.compensation += a; break; case 'Card charge': m.card -= a; break;
      case 'Excess offset': if (a < 0) m.exc_offset -= a; else m.reversal += a; break; case 'Excess payment': m.transfer -= a; break; case 'Excess paid by customer': m.customer -= a; break;
      default: break;
    }
  });
  const monthly = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map(m => { Object.keys(m).forEach(k => { if (k !== 'month') m[k] = U.r2(m[k]); }); m.net_cardoo = U.r2(m.excess + m.compensation - m.invoiced); return m; });

  /* ---------- summary ---------- */
  const T = t => U.r2(U.sum(st.filter(x => x.type === t), x => +x.amount_aed));
  const openInv = invoices.filter(i => i.balance_aed > 0.01);
  const openClaims = claims.filter(c => c.open > 0.01);
  const summary = {
    statement: st.length ? { from: stFrom, to: stTo, rows: st.length, imports: imports.length, last: imports[0] || null,
      invoiceSide: U.sum(st.filter(x => x.side === 'invoice'), x => +x.amount_aed), excessSide: U.sum(st.filter(x => x.side === 'excess'), x => +x.amount_aed),
      unallocInvoice: L.invoice.unalloc, unallocExcess: L.excess.unalloc } : null,
    invoices: invoices.length,
    billedAed: U.sum(invoices.filter(i => !i.not_on_statement), i => i.total_aed), billedUsd: U.sum(invoices.filter(i => i.total_usd != null), i => i.total_usd),
    paidAed: U.sum(invoices, i => i.paid_aed), offsetAed: U.sum(invoices, i => i.offset_aed), feesAed: U.sum(invoices, i => i.fees_aed),
    paidUsd: U.sum(invoices, i => i.paid_usd || 0), offsetUsd: U.sum(invoices, i => i.offset_usd || 0),
    balanceAed: U.r2(U.sum(openInv, i => i.balance_aed) - U.sum(L.invoice.unalloc, c => c.aed)), balanceUsd: U.sum(openInv, i => i.balance_usd || 0),
    unpaid: openInv, overdue: openInv.filter(i => i.overdue_days > 0),
    excessCredited: T('Excess'), compensation: T('Over deposit compensation'),
    receivedCard: U.r2(-T('Card charge')), receivedTransfer: U.r2(-T('Excess payment')), paidByCustomer: U.r2(-T('Excess paid by customer')),
    excessOffset: U.r2(-U.sum(st.filter(x => x.type === 'Excess offset' && +x.amount_aed < 0), x => +x.amount_aed)),
    claimsApproved: U.sum(claims.filter(c => c.type === 'Excess' || c.type === 'Approved claim'), c => c.amount),
    claimsReceived: U.sum(claims, c => c.settled),
    unappliedExcess: U.sum(L.excess.unalloc, c => c.aed), unappliedInvoice: U.sum(L.invoice.unalloc, c => c.aed),
    claimsReceivable: U.r2(U.sum(openClaims, c => c.open) - U.sum(L.excess.unalloc, c => c.aed)), claimsOpen: openClaims.length,
    notOnStatement: claims.filter(c => c.source === 'approved'), amountDiffs: claims.filter(c => Math.abs(c.diff) > 0.01),
    invoicesNotOnStatement: invoices.filter(i => i.not_on_statement), invoicesMatchedWeak: invoices.filter(i => /amount differs/.test(i.source || '')),
    superseded: manual.filter(s => s.superseded).length,
    avoidable: U.sum(lines, l => l._avoidable), avoidableLines: lines.filter(l => l._avoidable).length,
    credits: U.sum(lines.filter(l => +l.price_aed < 0), l => l.price_aed), fx: Math.round(defFx * 10000) / 10000,
    cover: stFrom ? { from: stFrom, to: stTo } : (() => { const p = POS.filter(i => i.period_from); return p.length ? { from: p.map(i => i.period_from).sort()[0], to: p.map(i => i.period_to).sort().pop() } : null; })()
  };
  summary.netPosition = U.r2(summary.claimsReceivable - summary.balanceAed);
  const claimByKeyOut = new Map(claims.map(c => [c.key, c]));
  return { invoices, invByPo, lines, settlements: manual, claims, claimByKey: claimByKeyOut, monthly, statementRows: st, imports, summary };
};

/* =====================================================================
   3. API — Supabase RPC wrapper
   ===================================================================== */
const STORE_KEY = 'dw_session';
const API = {
  client: null,
  token: null,
  init() {
    if (this.client) return this.client;
    if (!global.supabase || !global.supabase.createClient) throw new Error('Supabase library failed to load. Check your internet connection.');
    this.client = global.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    return this.client;
  },
  async rpc(fn, params) {
    this.init();
    const { data, error } = await this.client.rpc(fn, params || {});
    if (error) {
      const msg = error.message || String(error);
      if (/SESSION_EXPIRED/.test(msg)) { App.sessionExpired(); throw new Error('Your session has expired. Please sign in again.'); }
      if (/Could not find the function|schema cache/i.test(msg)) throw new Error('Database is not set up yet — run migrations/SQL_001.sql and credentials.sql in Supabase.');
      if (/Failed to fetch|NetworkError/i.test(msg)) throw new Error('Cannot reach the database. Check your connection.');
      throw new Error(msg);
    }
    return data;
  },
  call(fn, params) { return this.rpc(fn, Object.assign({ p_token: this.token }, params || {})); },
  saveSession(s, remember) {
    try {
      const v = JSON.stringify(s);
      (remember ? localStorage : sessionStorage).setItem(STORE_KEY, v);
      (remember ? sessionStorage : localStorage).removeItem(STORE_KEY);
    } catch (e) { /* storage unavailable */ }
  },
  loadSession() {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
  },
  clearSession() { try { localStorage.removeItem(STORE_KEY); sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }
};

/* =====================================================================
   4. UI
   ===================================================================== */
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const icon = (name, cls) => `<svg viewBox="0 0 24 24"${cls ? ` class="${cls}"` : ''}><use href="#i-${name}"/></svg>`;

const State = {
  user: null,
  ds: null,            // raw dataset from DB (or local preview)
  model: null,         // unified model
  source: 'db',        // 'db' | 'local'
  view: 'dashboard',
  imports: {},         // type → {file, det, norm, error}
  poImports: {},       // PO_xxxxx → {pdf, lines}
  cd: null,            // Cardoo invoices / lines / settlements
  prepared: null,
  charts: {},
  tables: {},
  drawerNo: null,
  ui: {
    collections: { chip: 'action', min: '', max: '', link: '', phone: '', from: '', to: '' },
    claims: { tab: 'ready' },
    contracts: { status: '', stage: '', booking: '', month: '' },
    bookings: { status: '', type: '', waiver: '' },
    payments: { from: '', to: '', linked: 'waiver' },
    activity: { action: '', user: '' },
    checksOpen: {}
  }
};

/* ---------- toasts ---------- */
const Toast = {
  show(msg, type = 'info', sub = '', ms = 4200) {
    const ic = { success: 'check', error: 'alert', warn: 'alert', info: 'info' }[type] || 'info';
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${icon(ic)}<div>${U.esc(msg)}${sub ? `<small>${U.esc(sub)}</small>` : ''}</div>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
  },
  ok(m, s) { this.show(m, 'success', s); }, err(m, s) { this.show(m, 'error', s, 6500); }, warn(m, s) { this.show(m, 'warn', s, 5500); }
};

/* ---------- modal ---------- */
const Modal = {
  open({ title, sub = '', body = '', foot = '', size = '', onOpen }) {
    const m = $('#modal');
    m.className = 'modal ' + size;
    m.innerHTML = `<div class="m-head"><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div><button class="icon-btn ghost" data-close>${icon('x')}</button></div>
      <div class="m-body">${body}</div>${foot ? `<div class="m-foot">${foot}</div>` : ''}`;
    $('#modalWrap').hidden = false;
    m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => Modal.close()));
    if (onOpen) onOpen(m);
    const f = m.querySelector('input:not([type=hidden]),textarea,select');
    if (f) setTimeout(() => f.focus(), 60);
    return m;
  },
  close() { $('#modalWrap').hidden = true; $('#modal').innerHTML = ''; if (Modal._onClose) { const f = Modal._onClose; Modal._onClose = null; f(); } },
  confirm(title, text, okLabel = 'Confirm', danger = false) {
    return new Promise(res => {
      Modal._onClose = () => res(false);
      Modal.open({ title, size: 'narrow', body: `<p class="muted">${text}</p>`,
        foot: `<button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="mOk">${okLabel}</button>`,
        onOpen: m => m.querySelector('#mOk').addEventListener('click', () => { Modal._onClose = null; Modal.close(); res(true); }) });
    });
  }
};

/* ---------- small renderers ---------- */
const R = {
  stage(s) { const st = STAGES[s] || { label: s, tone: 'slate' }; return `<span class="chip t-${st.tone}" title="${U.esc(st.hint || '')}">${U.esc(st.label)}</span>`; },
  claimChip(status) {
    if (!status) return '<span class="muted small">—</span>';
    const t = /recover/i.test(status) ? 'green' : /update/i.test(status) ? 'orange' : /cancel|declin|reject/i.test(status) ? 'rose' : 'violet';
    return `<span class="chip t-${t}">${U.esc(status)}</span>`;
  },
  booking(r) {
    if (r.booking_state === 'active') return `<span class="chip t-teal" title="Cardoo covers ${U.money(r.coverage)}">Covered · ${U.compact(r.coverage)}</span>`;
    if (r.booking_state === 'cancelled') return '<span class="chip t-rose">Cancelled</span>';
    return '<span class="chip t-rose">No booking</span>';
  },
  status(s) { return s === 'Open' ? '<span class="chip t-sky">Open</span>' : '<span class="chip t-slate">Closed</span>'; },
  flags(f) { return f && f.length ? `<div class="flags">${f.map(x => `<span class="flag t-${x.tone}">${U.esc(x.t)}</span>`).join('')}</div>` : ''; },
  amt(v, cls = '') {
    if (v == null || v === '') return '<span class="zero">—</span>';
    const n = +v;
    return `<span class="amt ${cls} ${n > 0.004 ? '' : 'zero'}">${U.money(n)}</span>`;
  },
  owe(v) { const n = +v || 0; return `<span class="amt big ${n > 0.004 ? 'pos' : n < -0.004 ? 'neg' : 'zero'}">${U.money(n)}</span>`; },
  cust(r) {
    return `<span class="cell-main" title="${U.esc(r.name)}">${U.esc(r.name)}</span><span class="cell-sub">${r.phone ? U.esc(r.phone_display) : r.phone_kind === 'nocc' ? `${U.esc(r.phone_raw)} · <span style="color:var(--amber)">add country code</span>` : '<span class="pos">No phone</span>'}${r.phone && !r.phone_valid ? ' · <span style="color:var(--amber)">check</span>' : ''}</span>`;
  },
  cno(no) { return `<span class="cno">#${no}</span>`; },
  date(v, sub) { return v ? `<span class="nowrap">${U.fmtDate(v)}</span>${sub ? `<span class="cell-sub">${sub}</span>` : ''}` : '<span class="zero">—</span>'; },
  window(r) {
    if (!r.claim_deadline) return '<span class="zero">—</span>';
    if (r.claim_live) return `<span class="cell-sub">claimed</span>`;
    if (r.claim_window === 'submitted') return `<span class="nowrap">submitted</span><span class="cell-sub" style="color:var(--${r.submitted_late ? 'rose' : 'violet'})">${U.fmtDate(r.case.claim_submitted_at)}${r.submitted_late ? ' · late' : ''}</span>`;
    if (r.claims.length) return `<span class="cell-sub">claim rejected</span>`;
    if (r.booking_state !== 'active') return `<span class="cell-sub">not covered</span>`;
    const d = r.days_to_deadline, tone = d < 0 ? 'rose' : d <= (+App.model.settings.general.expiring_soon_days || 10) ? 'amber' : 'muted';
    return `<span class="nowrap">${U.fmtDate(r.claim_deadline)}</span><span class="cell-sub" style="color:var(--${tone})">${d < 0 ? `expired ${-d}d ago` : `${d}d left`}</span>`;
  },
  remark(r) {
    const add = `<button class="remark-add" data-act="remark" data-no="${r.contract_no}" title="Add remark">+ remark</button>`;
    if (!r.remark && !r.remark_cat) return add;
    return `<span class="remark" title="${U.esc((r.remark_cat ? r.remark_cat + ': ' : '') + (r.remark || ''))}">${r.remark_cat ? `<span class="tag">${U.esc(r.remark_cat)}</span> ` : ''}${U.esc(r.remark || '')}</span><span class="cell-sub">${r.remark_at ? U.esc(R.ago(U.todayNum() - U.dayNum(new Date(r.remark_at)))) : ''} · <a href="#" data-act="remark" data-no="${r.contract_no}">add</a></span>`;
  },
  ago(days) { if (days == null) return ''; if (days === 0) return 'today'; if (days < 0) return `in ${-days}d`; return `${days}d ago`; }
};

/* =====================================================================
   DataTable — sortable, searchable, paginated, selectable, exportable
   ===================================================================== */
class DataTable {
  constructor(el, o) {
    this.el = typeof el === 'string' ? $(el) : el;
    this.o = Object.assign({ pageSize: 25, selectable: false, search: true, rowKey: r => r.contract_no, title: 'Export', exportName: 'export', toolbar: '', bulk: '', emptyText: 'No records match the current filters.', totals: true }, o);
    this.allCols = this.o.columns;
    this.cols = this.allCols.filter(c => !c.hidden);
    this.rows = [];
    this.view = [];
    this.q = '';
    this.page = 1;
    this.pageSize = +(localStorage.getItem('dw_ps') || this.o.pageSize);
    this.sort = this.o.sort || null;
    this.sel = new Set();
    this.build();
  }
  build() {
    const exp = `<div class="dd" data-dd><button class="btn btn-sm">${icon('download')}Export<svg viewBox="0 0 24 24" style="transform:rotate(90deg);font-size:12px"><use href="#i-chevron"/></svg></button>
      <div class="dd-menu"><button data-exp="xlsx">${icon('xls')}Excel (.xlsx)</button><button data-exp="csv">${icon('doc')}CSV</button><button data-exp="pdf">${icon('pdf')}PDF report</button>
      ${this.o.selectable ? '<hr><button data-exp="xlsx-sel">' + icon('xls') + 'Selected rows → Excel</button>' : ''}</div></div>`;
    this.el.classList.add('card', 'dt');
    this.el.innerHTML = `<div class="dt-bar">
        ${this.o.search ? `<div class="dt-search">${icon('search')}<input type="search" placeholder="Search in table…"></div>` : ''}
        <div class="dt-sel"><span class="dt-sel-n"></span>${this.o.bulk}<button class="icon-btn sm ghost" data-clear title="Clear selection">${icon('x')}</button></div>
        <span class="spacer"></span>${this.o.toolbar}${exp}</div>
      <div class="dt-scroll"><table class="tbl"><thead></thead><tbody></tbody><tfoot></tfoot></table></div>
      <div class="dt-foot"><span class="dt-count"></span><span class="spacer"></span>
        <label class="nowrap">Rows <select class="select input-sm dt-ps" style="width:76px;display:inline-block;margin-left:6px">${[10, 25, 50, 100, 250].map(n => `<option ${n === this.pageSize ? 'selected' : ''}>${n}</option>`).join('')}<option value="100000" ${this.pageSize > 1000 ? 'selected' : ''}>All</option></select></label>
        <div class="pager"></div></div>`;
    const s = this.el.querySelector('.dt-search input');
    if (s) s.addEventListener('input', U.debounce(() => { this.q = s.value.trim().toLowerCase(); this.page = 1; this.apply(); }, 160));
    this.el.querySelector('.dt-ps').addEventListener('change', e => { this.pageSize = +e.target.value; try { localStorage.setItem('dw_ps', this.pageSize); } catch (x) { /* */ } this.page = 1; this.render(); });
    this.el.addEventListener('click', e => this.onClick(e));
    this.el.addEventListener('change', e => {
      if (e.target.matches('.row-cb')) { const k = e.target.dataset.k; e.target.checked ? this.sel.add(k) : this.sel.delete(k); e.target.closest('tr').classList.toggle('selected', e.target.checked); this.updSel(); }
      if (e.target.matches('.all-cb')) { const pageRows = this.pageRows(); pageRows.forEach(r => { const k = String(this.o.rowKey(r)); e.target.checked ? this.sel.add(k) : this.sel.delete(k); }); this.render(); }
    });
  }
  setRows(rows) { this.rows = rows || []; const keys = new Set(this.rows.map(r => String(this.o.rowKey(r)))); for (const k of [...this.sel]) if (!keys.has(k)) this.sel.delete(k); this.apply(); }
  apply() {
    let v = this.rows;
    if (this.q) {
      const terms = this.q.split(/\s+/).filter(Boolean);
      v = v.filter(r => {
        const hay = (r.search || '') + ' ' + this.cols.map(c => { try { return c.get ? c.get(r) : r[c.key]; } catch (e) { return ''; } }).join(' ').toLowerCase();
        return terms.every(t => hay.includes(t));
      });
    }
    if (this.sort) {
      const c = this.cols.find(x => x.key === this.sort.key);
      if (c) {
        const get = c.sortGet || c.get || (r => r[c.key]);
        const dir = this.sort.dir === 'desc' ? -1 : 1;
        v = v.slice().sort((a, b) => {
          let x = get(a), y = get(b);
          if (x == null || x === '') return 1; if (y == null || y === '') return -1;
          if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
          return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
        });
      }
    }
    this.view = v;
    const maxPage = Math.max(1, Math.ceil(v.length / this.pageSize));
    if (this.page > maxPage) this.page = maxPage;
    this.render();
  }
  pageRows() { const s = (this.page - 1) * this.pageSize; return this.view.slice(s, s + this.pageSize); }
  render() {
    const thead = this.el.querySelector('thead'), tbody = this.el.querySelector('tbody'), tfoot = this.el.querySelector('tfoot');
    const pr = this.pageRows();
    const allSel = pr.length && pr.every(r => this.sel.has(String(this.o.rowKey(r))));
    thead.innerHTML = `<tr>${this.o.selectable ? `<th class="cb"><label class="check"><input type="checkbox" class="all-cb" ${allSel ? 'checked' : ''}><span></span></label></th>` : ''}${this.cols.map(c => {
      const sorted = this.sort && this.sort.key === c.key;
      const sortable = c.sortable !== false;
      return `<th class="${c.align || ''} ${sortable ? 'sortable' : ''} ${sorted ? 'sorted' : ''}" ${sortable ? `data-sort="${c.key}"` : ''} style="${c.width ? `width:${c.width}` : ''}">${c.label}${sortable ? `<span class="sort">${sorted ? (this.sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>` : ''}</th>`;
    }).join('')}</tr>`;
    if (!this.view.length) {
      tbody.innerHTML = `<tr><td colspan="${this.cols.length + (this.o.selectable ? 1 : 0)}"><div class="dt-empty">${icon('search')}<b>Nothing here</b>${U.esc(this.o.emptyText)}</div></td></tr>`;
    } else {
      tbody.innerHTML = pr.map(r => {
        const k = String(this.o.rowKey(r));
        const sel = this.sel.has(k);
        return `<tr class="${this.o.onRowClick ? 'click' : ''} ${sel ? 'selected' : ''}" data-k="${U.esc(k)}">${this.o.selectable ? `<td class="cb"><label class="check" onclick="event.stopPropagation()"><input type="checkbox" class="row-cb" data-k="${U.esc(k)}" ${sel ? 'checked' : ''}><span></span></label></td>` : ''}${this.cols.map(c => `<td class="${c.align || ''} ${c.cls || ''}">${c.html ? c.html(r) : U.esc(c.get ? c.get(r) : r[c.key])}</td>`).join('')}</tr>`;
      }).join('');
    }
    const sums = this.cols.filter(c => c.sum);
    if (this.o.totals && sums.length && this.view.length) {
      tfoot.innerHTML = `<tr>${this.o.selectable ? '<td></td>' : ''}${this.cols.map((c, i) => {
        if (c.sum) { const t = U.sum(this.view, c.get || (r => r[c.key])); return `<td class="right"><span class="amt">${U.money(t)}</span></td>`; }
        return i === 0 ? `<td>Total · ${U.int(this.view.length)}</td>` : '<td></td>';
      }).join('')}</tr>`;
    } else tfoot.innerHTML = '';
    // footer
    const from = this.view.length ? (this.page - 1) * this.pageSize + 1 : 0, to = Math.min(this.view.length, this.page * this.pageSize);
    this.el.querySelector('.dt-count').textContent = `Showing ${U.int(from)}–${U.int(to)} of ${U.int(this.view.length)}${this.view.length !== this.rows.length ? ` (filtered from ${U.int(this.rows.length)})` : ''}`;
    const pages = Math.max(1, Math.ceil(this.view.length / this.pageSize));
    const p = this.page, btns = [];
    const push = (n, l) => btns.push(`<button data-page="${n}" class="${n === p ? 'on' : ''}" ${n < 1 || n > pages ? 'disabled' : ''}>${l || n}</button>`);
    push(p - 1, '‹');
    const set = new Set([1, pages, p - 1, p, p + 1].filter(n => n >= 1 && n <= pages));
    let last = 0; [...set].sort((a, b) => a - b).forEach(n => { if (n - last > 1) btns.push('<button disabled>…</button>'); push(n); last = n; });
    push(p + 1, '›');
    this.el.querySelector('.pager').innerHTML = pages > 1 ? btns.join('') : '';
    this.updSel();
    if (this.o.afterRender) this.o.afterRender(this);
  }
  updSel() {
    const box = this.el.querySelector('.dt-sel');
    box.classList.toggle('on', this.sel.size > 0);
    this.el.querySelector('.dt-sel-n').textContent = `${this.sel.size} selected`;
    if (this.o.onSel) this.o.onSel(this.sel.size);
  }
  selectedRows() { return this.rows.filter(r => this.sel.has(String(this.o.rowKey(r)))); }
  clearSel() { this.sel.clear(); this.render(); }
  onClick(e) {
    const dd = e.target.closest('[data-dd]');
    $$('.dd.open').forEach(d => { if (d !== dd) d.classList.remove('open'); });
    if (dd && e.target.closest('[data-dd] > .btn')) { dd.classList.toggle('open'); e.stopPropagation(); return; }
    const exp = e.target.closest('[data-exp]');
    if (exp) { dd && dd.classList.remove('open'); this.export(exp.dataset.exp); return; }
    const th = e.target.closest('th[data-sort]');
    if (th) { const k = th.dataset.sort; this.sort = this.sort && this.sort.key === k ? { key: k, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: (this.cols.find(c => c.key === k) || {}).numeric ? 'desc' : 'asc' }; this.apply(); return; }
    const pg = e.target.closest('[data-page]');
    if (pg && !pg.disabled) { this.page = +pg.dataset.page; this.render(); this.el.querySelector('.dt-scroll').scrollTop = 0; return; }
    if (e.target.closest('[data-clear]')) { this.clearSel(); return; }
    if (e.target.closest('button, a, input, select, textarea, label')) return;
    const tr = e.target.closest('tbody tr[data-k]');
    if (tr && this.o.onRowClick) { const r = this.view.find(x => String(this.o.rowKey(x)) === tr.dataset.k); if (r) this.o.onRowClick(r); }
  }
  exportCols() { return this.allCols.filter(c => c.export !== false && (c.exp || c.get || c.key)); }
  export(kind) {
    const rows = kind === 'xlsx-sel' ? this.selectedRows() : this.view;
    if (!rows.length) { Toast.warn('Nothing to export'); return; }
    const cols = this.exportCols();
    const name = `${this.o.exportName}_${U.todayISO()}`;
    if (kind === 'pdf') return Exporter.pdfTable(this.o.title, cols, rows, name, this.o.pdfSub);
    return Exporter.sheet(cols, rows, name, kind === 'csv' ? 'csv' : 'xlsx', this.o.title);
  }
}

/* =====================================================================
   Exporter — Excel / CSV / PDF
   ===================================================================== */
const Exporter = {
  value(c, r) {
    const v = c.exp ? c.exp(r) : c.get ? c.get(r) : r[c.key];
    if (c.type === 'date') return v ? U.toJSDate(v) : null;
    if (c.type === 'num') return v == null || v === '' ? null : +v;
    return v == null ? '' : v;
  },
  text(c, r) {
    const v = c.exp ? c.exp(r) : c.get ? c.get(r) : r[c.key];
    if (c.type === 'date') return v ? (c.dt ? U.fmtDT(v) : U.fmtDate(v)) : '';
    if (c.type === 'num') return v == null || v === '' ? '' : U.money(v);
    return v == null ? '' : String(v);
  },
  sheet(cols, rows, name, fmt = 'xlsx', title = 'Data') {
    if (!global.XLSX) return Toast.err('Excel library not loaded');
    const data = rows.map(r => { const o = {}; cols.forEach(c => { o[c.xlabel || c.plain || U.clean(c.label.replace(/<[^>]+>/g, ''))] = Exporter.value(c, r); }); return o; });
    const ws = XLSX.utils.json_to_sheet(data, { cellDates: true, dateNF: 'dd-mmm-yyyy' });
    const hdr = Object.keys(data[0] || {});
    ws['!cols'] = hdr.map(h => ({ wch: Math.min(48, Math.max(10, h.length + 2, ...data.slice(0, 200).map(d => String(d[h] == null ? '' : (d[h] instanceof Date ? '00-Mmm-0000' : d[h])).length + 1))) }));
    // number format for money columns
    cols.forEach((c, i) => { if (c.type === 'num') { for (let r = 1; r <= data.length; r++) { const ref = XLSX.utils.encode_cell({ r, c: i }); if (ws[ref] && ws[ref].t === 'n') ws[ref].z = '#,##0.00'; } } });
    if (fmt === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      Exporter.download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), name + '.csv');
    } else {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, String(title).replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Data');
      XLSX.writeFile(wb, name + '.xlsx', { compression: true });
    }
    Toast.ok(`Exported ${U.int(rows.length)} rows`, name + (fmt === 'csv' ? '.csv' : '.xlsx'));
  },
  download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  },
  pdfDoc(orientation = 'landscape') {
    if (!global.jspdf || !global.jspdf.jsPDF) { Toast.err('PDF library not loaded'); return null; }
    const doc = new global.jspdf.jsPDF({ orientation, unit: 'pt', format: 'a4' });
    if (typeof doc.autoTable !== 'function') { Toast.err('PDF table plugin not loaded'); return null; }
    return doc;
  },
  pdfHeader(doc, title, sub) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(15, 21, 48); doc.rect(0, 0, W, 64, 'F');
    doc.setFillColor(79, 70, 229); doc.rect(0, 64, W, 3, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(Exporter.ascii(title), 32, 30);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(199, 208, 234);
    const g = (App.model && App.model.settings.general) || {};
    doc.text(Exporter.ascii(`${g.company_name || ''}  |  Generated ${U.fmtDT(new Date())} by ${State.user ? State.user.username : ''}${sub ? '  |  ' + sub : ''}`), 32, 48);
    doc.setTextColor(15, 23, 42);
    return 86;
  },
  pdfFooter(doc) {
    const n = doc.internal.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120, 130, 150);
      doc.text(`Deposit Waiver Control Center`, 32, H - 18);
      doc.text(`Page ${i} of ${n}`, W - 32, H - 18, { align: 'right' });
    }
  },
  /** jsPDF core fonts are WinAnsi only — map common unicode to safe characters */
  ascii(s) { return String(s == null ? '' : s).replace(/[–—]/g, '-').replace(/[·•]/g, '|').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/→/g, '->').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, ''); },
  pdfTable(title, cols, rows, name, sub) {
    const doc = Exporter.pdfDoc('landscape'); if (!doc) return;
    const y = Exporter.pdfHeader(doc, title, sub || `${U.int(rows.length)} rows`);
    const head = [cols.map(c => Exporter.ascii(c.plain || U.clean(c.label.replace(/<[^>]+>/g, ''))))];
    const body = rows.map(r => cols.map(c => Exporter.ascii(Exporter.text(c, r))));
    const sums = cols.map(c => c.sum ? U.money(U.sum(rows, c.get || (r => r[c.key]))) : '');
    const foot = cols.some(c => c.sum) ? [sums.map((s, i) => i === 0 && !s ? `Total (${rows.length})` : s)] : undefined;
    doc.autoTable({
      startY: y, head, body, foot, theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 4, lineColor: [228, 232, 240], lineWidth: .5, textColor: [30, 41, 59], overflow: 'linebreak' },
      headStyles: { fillColor: [241, 244, 249], textColor: [71, 85, 105], fontStyle: 'bold', fontSize: 7.5 },
      footStyles: { fillColor: [238, 240, 255], textColor: [55, 48, 163], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      columnStyles: Object.fromEntries(cols.map((c, i) => [i, c.type === 'num' ? { halign: 'right' } : {}])),
      margin: { left: 28, right: 28, bottom: 34 }
    });
    Exporter.pdfFooter(doc);
    doc.save(name + '.pdf');
    Toast.ok('PDF downloaded', name + '.pdf');
  }
};

/* =====================================================================
   App shell — boot, auth, routing, data loading
   ===================================================================== */
const VIEW_META = {
  dashboard:   ['Dashboard', 'Live overview of waivers, collections and Cardoo claims'],
  import:      ['Import & Sync', 'Attach the 5 reports, review the clean-up, sync to the database'],
  collections: ['Collections', 'Closed waiver contracts with an outstanding balance'],
  cardoo:      ['Cardoo Account', '15-day Cardoo invoices, payments, claim offsets and balance'],
  claims:      ['Cardoo Claims', '60-day claim window, claim-ready contracts and submitted claims'],
  matching:    ['Cardoo Matching', 'Caryaati ↔ Cardoo: missing bookings, missing contracts and closing dates'],
  profit:      ['Profitability', 'Is the Cardoo deposit-waiver program paying off?'],
  checks:      ['Reconciliation', 'Cross-report checks that need attention'],
  contracts:   ['Waiver Contracts', 'Every deposit-waiver contract, unified across all reports'],
  bookings:    ['Cardoo Bookings', 'Deposit-free bookings registered with Cardoo'],
  payments:    ['Rent Payments', 'Rent receipts for waiver-linked contracts'],
  activity:    ['Activity Log', 'Messages, updates, syncs and logins'],
  settings:    ['Settings', 'Company details, rules, tags, message templates and account']
};

const App = {
  model: null,

  async boot() {
    this.bindLogin();
    this.bindShell();
    const s = API.loadSession();
    try { API.init(); } catch (e) { this.showLogin(e.message); return this.hideBoot(); }
    if (s && s.token) {
      API.token = s.token;
      try {
        const r = await API.rpc('dw_session', { p_token: s.token });
        State.user = r.user;
        await this.enterApp();
      } catch (e) { API.clearSession(); API.token = null; this.showLogin(); }
    } else this.showLogin();
    this.hideBoot();
  },
  hideBoot() { const b = $('#boot'); b.classList.add('out'); setTimeout(() => b.remove(), 350); },

  /* ---------- login ---------- */
  showLogin(msg) {
    $('#app').hidden = true; $('#login').hidden = false;
    if (msg) this.loginError(msg);
    setTimeout(() => $('#loginUser').focus(), 50);
  },
  loginError(msg) { const el = $('#loginError'); el.innerHTML = `${icon('alert')}<span>${U.esc(msg)}</span>`; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; },
  bindLogin() {
    const f = $('#loginForm'), pass = $('#loginPass');
    $('#passToggle').addEventListener('click', () => {
      const show = pass.type === 'password'; pass.type = show ? 'text' : 'password';
      $('#passToggle').innerHTML = icon(show ? 'eye-off' : 'eye'); pass.focus();
    });
    pass.addEventListener('keyup', e => { $('#capsWarn').hidden = !(e.getModifierState && e.getModifierState('CapsLock')); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const u = $('#loginUser').value.trim(), p = pass.value;
      $('#loginError').hidden = true;
      if (!u || !p) return this.loginError('Enter your user ID and password.');
      const btn = $('#loginBtn'); btn.classList.add('loading'); btn.disabled = true;
      try {
        const r = await API.rpc('dw_login', { p_username: u, p_password: p, p_user_agent: navigator.userAgent });
        if (!r || r.error) throw new Error((r && r.error) || 'Login failed');
        API.token = r.token; State.user = r.user;
        API.saveSession({ token: r.token, user: r.user }, $('#loginRemember').checked);
        pass.value = '';
        await this.enterApp();
        Toast.ok(`Welcome, ${r.user.full_name || r.user.username}`);
      } catch (err) { this.loginError(err.message); pass.select(); }
      finally { btn.classList.remove('loading'); btn.disabled = false; }
    });
  },
  async logout() {
    try { if (API.token) await API.rpc('dw_logout', { p_token: API.token }); } catch (e) { /* ignore */ }
    API.clearSession(); API.token = null; State.user = null; State.ds = null; this.model = null; State.model = null; State.cd = null; State.poImports = {}; State.stmtImport = null;
    Object.values(State.charts).forEach(c => c && c.destroy && c.destroy()); State.charts = {};
    State.tables = {}; State.built = {};
    $$('.view').forEach(v => { v.innerHTML = ''; });
    Drawer.close();
    this.showLogin();
  },
  sessionExpired() {
    if (!API.token) return;
    API.clearSession(); API.token = null;
    Toast.warn('Session expired', 'Please sign in again.');
    this.logout();
  },

  /* ---------- shell ---------- */
  async enterApp() {
    try { const u = JSON.parse(localStorage.getItem('dw_ui') || 'null'); if (u) Object.keys(u).forEach(k => { if (u[k] && typeof u[k] === 'object' && typeof State.ui[k] === 'object') Object.assign(State.ui[k], u[k]); else State.ui[k] = u[k]; }); } catch (e) { /* */ }
    State.ui.collections.task = '';
    $('#login').hidden = true; $('#app').hidden = false;
    const u = State.user || {};
    $('#userName').textContent = u.full_name || u.username;
    $('#userRole').textContent = u.role || '';
    $('#userAvatar').textContent = U.initials(u.full_name || u.username);
    if (localStorage.getItem('dw_side') === 'collapsed') $('#app').classList.add('collapsed');
    State.built = {};
    await this.load(true);
    this.route();
  },
  bindShell() {
    window.addEventListener('hashchange', () => this.route());
    $('#logoutBtn').addEventListener('click', async () => { if (await Modal.confirm('Sign out?', 'You will need your user ID and password to sign in again.', 'Sign out')) this.logout(); });
    $('#refreshBtn').addEventListener('click', () => this.load(false, true));
    $('#themeBtn').addEventListener('click', () => {
      const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('dw_theme', t); } catch (e) { /* */ }
      this.themeIcon();
      if (State.view === 'dashboard' && this.model) Views.render('dashboard');
    });
    this.themeIcon();
    $('#sideCollapse').addEventListener('click', () => { const c = $('#app').classList.toggle('collapsed'); try { localStorage.setItem('dw_side', c ? 'collapsed' : ''); } catch (e) { /* */ } });
    $('#menuBtn').addEventListener('click', () => $('#app').classList.toggle('menu-open'));
    $('#nav').addEventListener('click', () => $('#app').classList.remove('menu-open'));
    $('#syncPill').addEventListener('click', () => { location.hash = '#/import'; });
    $('#scrim').addEventListener('click', () => Drawer.close());
    $('#modalWrap').addEventListener('mousedown', e => { if (e.target.id === 'modalWrap') Modal.close(); });
    document.addEventListener('click', e => { if (!e.target.closest('[data-dd]')) $$('.dd.open').forEach(d => d.classList.remove('open')); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (!$('#modalWrap').hidden) Modal.close(); else if ($('#drawer').classList.contains('open')) Drawer.close(); else $('#gsResults').hidden = true; }
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('#app').hidden) { e.preventDefault(); $('#gsInput').focus(); }
    });
    this.bindGlobalSearch();
  },
  themeIcon() { $('#themeBtn').innerHTML = icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon'); },

  bindGlobalSearch() {
    const inp = $('#gsInput'), box = $('#gsResults');
    let idx = 0, results = [];
    const draw = () => {
      if (!results.length) { box.innerHTML = `<div class="gs-empty">No matching waiver contract</div>`; return; }
      box.innerHTML = results.map((r, i) => `<div class="gs-item ${i === idx ? 'active' : ''}" data-no="${r.contract_no}">
        <span class="avatar">${U.esc(U.initials(r.name))}</span><div style="min-width:0"><b>${U.esc(r.name)}</b><small>#${r.contract_no} · ${U.esc(r.vehicle)} · ${U.esc(r.phone_display || 'no phone')}</small></div>
        <span class="stage">${R.stage(r.stage)}</span></div>`).join('');
    };
    inp.addEventListener('input', U.debounce(() => {
      const q = inp.value.trim().toLowerCase();
      if (!q || !this.model) { box.hidden = true; return; }
      const terms = q.split(/\s+/);
      const qd = q.replace(/\D/g, '');
      results = this.model.records.filter(r => terms.every(t => r.search.includes(t)) || (qd.length >= 5 && r.phone && r.phone.includes(qd))).slice(0, 8);
      idx = 0; draw(); box.hidden = false;
    }, 120));
    inp.addEventListener('keydown', e => {
      if (box.hidden) return;
      if (e.key === 'ArrowDown') { idx = Math.min(results.length - 1, idx + 1); draw(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
      if (e.key === 'Enter' && results[idx]) { Drawer.open(results[idx].contract_no); box.hidden = true; inp.blur(); }
    });
    box.addEventListener('click', e => { const it = e.target.closest('[data-no]'); if (it) { Drawer.open(+it.dataset.no); box.hidden = true; } });
    document.addEventListener('click', e => { if (!e.target.closest('#globalSearch')) box.hidden = true; });
  },

  /* ---------- routing ---------- */
  saveUI() { try { const u = Object.assign({}, State.ui); delete u.checksOpen; localStorage.setItem('dw_ui', JSON.stringify(u)); } catch (e) { /* */ } },
  route() {
    if ($('#app').hidden) return;
    this.saveUI();
    let v = (location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard');
    if (!VIEW_META[v]) v = 'dashboard';
    State.view = v;
    $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === v));
    $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    $('#pageTitle').textContent = VIEW_META[v][0];
    $('#pageSub').textContent = VIEW_META[v][1];
    Views.render(v);
    $('.views').scrollTop = 0; window.scrollTo(0, 0);
  },

  /* ---------- data ---------- */
  async load(initial, manual) {
    const btn = $('#refreshBtn');
    btn.disabled = true; btn.firstElementChild && (btn.firstElementChild.style.animation = 'spin .8s linear infinite');
    try {
      const [ds, cd] = await Promise.all([API.call('dw_get_dataset'), API.call('dw_get_cardoo').catch(e => { if (!/not set up/i.test(e.message)) Toast.warn('Cardoo invoices not loaded', e.message); return null; })]);
      State.user = ds.user || State.user;
      State.cd = cd || { invoices: [], lines: [], settlements: [], missing: !cd };
      this.setData(ds, 'db', !initial);
      if (manual) Toast.ok('Data reloaded from database');
    } catch (e) {
      if (!/session has expired/i.test(e.message)) Toast.err('Could not load data', e.message);
      if (!State.ds) this.setData({ waivers: [], contracts: [], payments: [], bookings: [], claims: [], cases: [], settings: {} }, 'db', false);
    } finally { btn.disabled = false; btn.firstElementChild && (btn.firstElementChild.style.animation = ''); }
  },
  setData(ds, source, rerender = true) {
    State.ds = ds; State.source = source;
    this.rebuild(rerender);
  },
  /** Recompute the unified model (fast) and refresh what is visible */
  rebuild(rerender = true) {
    const t0 = performance.now();
    this.model = State.model = Engine.buildModel(State.ds);
    this.model.cardoo = Engine.cardoo(this.model, State.cd);
    // Cardoo statement checks (need the Cardoo model, so added after it is built)
    const cs = this.model.cardoo.summary;
    if (cs.statement) {
      const asClaim = c => Object.assign({}, c.claim || {}, { row_key: c.key, contract_no: c.contract_no, contract_raw: c.contract_raw, _name: c._name, title: c.title,
        claim_date: (c.claim || {}).claim_date || c.credited_date, excess_sum: c.amount, status: c.state, _inWaivers: !!c._rec });
      this.model.checks.push({ id: 'cardoo_amount_diff', title: 'Cardoo credited a different amount than approved', severity: 'medium', kind: 'claims',
        desc: 'The excess credited on the Cardoo statement differs from the approved amount in the Excess report — ask Cardoo why.', rows: cs.amountDiffs.map(asClaim) });
      const late = cs.notOnStatement.filter(c => c.claim && c.claim.claim_date && U.todayNum() - U.dayNum(c.claim.claim_date) > 30);
      this.model.checks.push({ id: 'cardoo_not_credited', title: 'Approved claims not credited by Cardoo after 30 days', severity: 'high', kind: 'claims',
        desc: `In Recovery in the Excess report for more than 30 days but not on the Cardoo statement (up to ${U.fmtDate(cs.statement.to)}).`, rows: late.map(asClaim) });
      this.model.kpi.criticalChecks += late.length;
      if (cs.invoicesNotOnStatement.length) this.model.checks.push({ id: 'cardoo_po_missing', title: 'PO invoices not found on the Cardoo statement', severity: 'medium', kind: 'claims',
        desc: 'Imported PO invoice dated inside the statement period but no matching invoice line on the statement — not counted as owed. Ask Cardoo.',
        rows: cs.invoicesNotOnStatement.map(i => ({ row_key: i.po_no, contract_raw: i.po_no, contract_no: '', _name: `Invoice ${U.fmtDate(i.issue_date)}`, title: i.po_no, claim_date: i.issue_date, excess_sum: i.excluded_aed, status: 'Not on statement' })) });
      const unposted = this.model.cardoo.claims.filter(c => c.type === 'Excess' && c.open <= 0.01 && c._rec && c._rec.status === 'Closed' && c._rec.outstanding >= c.amount - 1);
      this.model.checks.push({ id: 'cardoo_unposted', title: 'Paid by Cardoo but not posted in the Caryaati ledger', severity: 'medium', kind: 'claims',
        desc: 'Cardoo has paid (card / offset / transfer) but the customer ledger in Caryaati still shows at least that amount outstanding — post the Cardoo receipt in Caryaati so balances are correct.',
        rows: unposted.map(c => Object.assign(asClaim(c), { status: `Received ${c.received_on ? U.fmtDate(c.received_on) : ''} · ${c.how}`, _outstanding: c._rec.outstanding })) });
    }
    this.chrome();
    if (rerender && !$('#app').hidden) Views.render(State.view, true);
    if (Drawer.no && $('#drawer').classList.contains('open')) Drawer.render();
    if (global.DW_DEBUG) console.log('model built in', Math.round(performance.now() - t0), 'ms');
  },
  chrome() {
    const k = this.model.kpi;
    const setB = (n, v) => { const el = $(`[data-badge="${n}"]`); if (el) el.textContent = v ? U.int(v) : ''; };
    setB('collections', k.collectCount);
    setB('claims', k.readyCount + k.needUpdate);
    setB('checks', k.criticalChecks);
    setB('cardoo', this.model.cardoo.summary.overdue.length + this.model.cardoo.summary.unpaid.filter(i => i.status !== 'Overdue').length);
    setB('matching', k.noBookingOpen + k.missingInCaryaati + (App.model.checks.find(c => c.id === 'cardoo_only_closed') || { rows: [] }).rows.length);
    const pill = $('#syncPill'), txt = $('#syncText');
    pill.className = 'sync-pill';
    if (State.source === 'local') { pill.classList.add('local'); txt.textContent = 'Local preview · not saved'; }
    else if (this.model.lastBatch && this.model.lastBatch.completed_at) {
      const d = new Date(this.model.lastBatch.completed_at), hrs = (Date.now() - d) / 36e5;
      pill.classList.add(hrs < 30 ? 'ok' : 'stale');
      txt.textContent = 'Synced ' + (hrs < 1 ? Math.max(1, Math.round(hrs * 60)) + 'm ago' : hrs < 48 ? Math.round(hrs) + 'h ago' : U.fmtDate(d));
      pill.title = `Last sync: ${U.fmtTS(this.model.lastBatch.completed_at)}`;
    } else txt.textContent = 'No data synced yet';
  },
  /** Patch a case locally after a save, then rebuild */
  patchCase(k) {
    if (!k || !k.contract_no) return;
    const list = State.ds.cases || (State.ds.cases = []);
    const i = list.findIndex(x => +x.contract_no === +k.contract_no);
    if (i >= 0) list[i] = k; else list.push(k);
    this.rebuild(true);
  },
  async saveCase(no, patch, okMsg) {
    try {
      const k = await API.call('dw_save_case', { p_contract: no, p_patch: patch });
      this.patchCase(k);
      if (okMsg) Toast.ok(okMsg);
      return k;
    } catch (e) { Toast.err('Could not save', e.message); throw e; }
  },
  async logActivity(no, action, details) {
    try {
      const k = await API.call('dw_log_activity', { p_contract: no, p_action: action, p_details: details || {} });
      if (k) this.patchCase(k);
      return k;
    } catch (e) { Toast.err('Could not log activity', e.message); return null; }
  },
  canManage() { return State.user && (State.user.role === 'admin' || State.user.role === 'manager'); }
};

/* =====================================================================
   Views
   ===================================================================== */
const Views = {
  render(v, dataChanged) {
    const el = $('#view-' + v);
    if (!el || !App.model) return;
    const always = ['dashboard', 'checks', 'profit', 'cardoo'];               // cheap, always fresh
    const onNavigate = ['settings', 'import', 'activity']; // rebuilt when opened, not on data refresh
    if (always.includes(v) || !State.built[v] || (onNavigate.includes(v) && !dataChanged)) {
      Views[v].build(el);
      State.built[v] = true;
    }
    if (Views[v].update) Views[v].update(el);
  },
  emptyData(el) {
    el.innerHTML = `<div class="card empty-state"><div class="dz-ico">${icon('upload')}</div><h3>No report data yet</h3>
      <p>Attach the five reports (Deposit Waivers, Rental Contracts, Rental Payments, Cardoo Booking, Cardoo Excess) to build the unified workspace.</p>
      <a class="btn btn-primary" href="#/import">${icon('upload')}Import reports</a></div>`;
  },
  recordColumns(extra) {
    return [
      { key: 'contract_no', label: 'Contract', plain: 'Contract No', get: r => r.contract_no, html: r => `${R.cno(r.contract_no)}${r.source_tag ? `<span class="cell-sub">${U.esc(r.source_tag)}</span>` : ''}`, numeric: true },
      { key: 'name', label: 'Customer', get: r => r.name, html: R.cust },
      { key: 'phone', label: 'Phone', get: r => r.phone ? '+' + r.phone : '', html: r => r.phone ? `<span class="mono small">${U.esc(r.phone_display)}</span>` : '—', export: true, hidden: true },
      ...(extra || [])
    ];
  }
};

/* ------------------------------ Dashboard ------------------------------ */
Views.dashboard = {
  build(el) {
    const m = App.model, k = m.kpi, g = m.settings.general, cur = g.currency;
    if (!m.records.length) return Views.emptyData(el);
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const toContact = k.stageCounts.to_contact || 0;
    el.innerHTML = `
      <div class="hero">
        <div class="grow"><h2>${greet}, ${U.esc((State.user.full_name || State.user.username).split(' ')[0])} 👋</h2>
        <p>${U.int(k.collectCount)} customers owe <b>${cur} ${U.money(k.collectAmount)}</b> in the collection queue · ${U.int(k.readyCount)} ready to claim from Cardoo · ${U.int(k.criticalChecks)} items need attention.</p></div>
        <div class="btn-group">
          <a class="btn" href="#/import">${icon('upload')}Import reports</a>
          ${toContact ? `<button class="btn btn-wa" id="dbRemind">${icon('whatsapp')}Remind ${toContact} customers</button>` : ''}
        </div>
      </div>
      <div class="kpis">
        ${this.kpi('t-indigo', 'doc', 'Waiver contracts', U.int(k.total), `<span class="chip sm t-sky">${k.open} open</span><span class="chip sm t-slate">${k.closed} closed</span>`, '#/contracts')}
        ${this.kpi('t-teal', 'wallet', 'Waiver fees charged', `<small>${cur}</small>${U.compact(k.waiverFees)}`, (App.model.cardoo && App.model.cardoo.summary.statement ? `Cardoo invoiced ${cur} ${U.compact(App.model.cardoo.summary.billedAed)} (actual) · margin ${cur} ${U.compact(k.waiverFees - App.model.cardoo.summary.billedAed)}` : `Cardoo fees est. ${cur} ${U.compact(k.cardooFees)} · margin ${cur} ${U.compact(k.waiverFees - k.cardooFees)}`))}
        ${this.kpi('t-rose', 'alert', 'Outstanding · closed', `<small>${cur}</small>${U.compact(k.owingAmount)}`, `${U.plural(k.owingCount, 'contract')} above ${cur} ${g.min_outstanding}`, '#/collections')}
        ${this.kpi('t-blue', 'whatsapp', 'In collection queue', `<small>${cur}</small>${U.compact(k.collectAmount)}`, `${U.int(k.collectCount)} customers to remind / collect`, '#/collections')}
        ${this.kpi('t-amber', 'file-check', 'Ready to claim', `<small>${cur}</small>${U.compact(k.readyAmount)}`, `${U.plural(k.readyCount, 'contract')} · ${k.soonCount ? `<span class="chip sm t-amber">${k.soonCount} window closing</span>` : `${U.plural(k.needUpdate, 'claim')} need update`}`, '#/claims')}
        ${this.kpi('t-green', 'shield', 'Recovered by Cardoo', `<small>${cur}</small>${U.compact(k.recoveryApproved)}`, `${U.int(k.recoveryCount)} approved / paid claims${App.model.cardoo && App.model.cardoo.summary.claimsReceivable > 0 ? ` · ${U.compact(App.model.cardoo.summary.claimsReceivable)} not received yet` : ''}`, '#/cardoo')}
        ${this.kpi('t-violet', 'car', 'Open-contract cover', `<small>${cur}</small>${U.compact(k.coveredExposure)}`, `${k.noBookingOpen ? `<span class="chip sm t-rose">${k.noBookingOpen} without booking</span>` : 'All open contracts booked'}`)}
        ${this.kpi('t-rose', 'clock', 'Claim window expired', `<small>${cur}</small>${U.compact(k.expiredAmount)}`, `${U.plural(k.expiredCount, 'contract')} past ${g.claim_deadline_days} days · collect directly`, '#/claims')}
      </div>
      <div class="card" style="margin-bottom:14px"><div class="card-head"><div><h3>Today's tasks</h3><p>${U.fmtDate(U.todayISO())} · click a task to open the list</p></div></div>
        <div class="card-body"><div class="pf-grid" id="tasks"></div></div></div>
      <div class="grid g-12">
        <div class="card"><div class="card-head"><div><h3>Waiver fees by month</h3><p>Fee charged (bars) and number of contracts (line), by contract open month</p></div></div>
          <div class="card-body"><div class="chart-box"><canvas id="chMonthly"></canvas></div></div></div>
        <div class="card"><div class="card-head"><div><h3>Collection pipeline</h3><p>Closed contracts with outstanding, by workflow stage</p></div></div>
          <div class="card-body"><div class="pipeline" id="pipeline"></div></div></div>
      </div>
      <div class="grid g-3 mt">
        <div class="card"><div class="card-head"><div><h3>Outstanding aging</h3><p>Days since contract close</p></div></div><div class="card-body"><div class="chart-box sm"><canvas id="chAging"></canvas></div></div></div>
        <div class="card"><div class="card-head"><div><h3>Cardoo claims</h3><p>By status (count)</p></div></div><div class="card-body"><div class="chart-box sm"><canvas id="chClaims"></canvas></div></div></div>
        <div class="card"><div class="card-head"><div><h3>Needs attention</h3><p>Open the reconciliation view for details</p></div></div><div class="card-body"><div class="attn" id="attn"></div></div></div>
      </div>
      <div class="card mt"><div class="card-head"><div><h3>Largest balances to collect</h3><p>Not yet with Cardoo · click a row for the full customer panel</p></div><span class="spacer"></span><a class="btn btn-sm" href="#/collections">Open collections ${icon('arrow-right')}</a></div>
        <div class="card-body" style="padding:10px 0 0"><div id="dbTop"></div></div></div>`;
    el.querySelectorAll('[data-href]').forEach(c => c.addEventListener('click', () => { location.hash = c.dataset.href; }));
    const rb = $('#dbRemind', el); if (rb) rb.addEventListener('click', () => { State.ui.collections.chip = 'to_contact'; location.hash = '#/collections'; });
    this.pipeline(); this.attention(); this.top(); this.charts(); this.tasks();
  },
  kpi(tone, ic, label, value, sub, href) {
    return `<div class="card kpi ${tone} ${href ? 'click' : ''}" ${href ? `data-href="${href}"` : ''}><div class="kpi-top"><span class="kpi-ico">${icon(ic)}</span><span class="kpi-label">${label}</span></div>
      <div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
  },
  tasks() {
    const R = App.model.records;
    $('#tasks').innerHTML = Engine.TASKS.map(t => { const rs = R.filter(t.fn); return `<div class="attn-item t-${t.tone}" data-task="${t.id}" style="${rs.length ? '' : 'opacity:.5'}"><span class="ico">${icon(t.icon)}</span>
      <div class="grow"><b>${t.label}</b><small>${t.hint}${rs.length ? ' · ' + U.compact(U.sum(rs, r => r.outstanding)) : ''}</small></div><span class="count">${rs.length}</span></div>`; }).join('');
    const cs = App.model.cardoo.summary;
    $('#tasks').insertAdjacentHTML('beforeend', `<div class="attn-item t-rose" data-href="#/cardoo" style="${cs.unpaid.length ? '' : 'opacity:.5'}"><span class="ico">${icon('receipt')}</span><div class="grow"><b>Cardoo invoices to settle</b><small>${cs.overdue.length} overdue · USD ${U.money(cs.balanceUsd)} open</small></div><span class="count">${cs.unpaid.length}</span></div>
      <div class="attn-item t-green" data-href="#/cardoo" style="${cs.claimsOpen ? '' : 'opacity:.5'}"><span class="ico">${icon('shield')}</span><div class="grow"><b>Approved claims not received</b><small>Record as offset or payout · ${U.compact(cs.claimsReceivable)}</small></div><span class="count">${cs.claimsOpen}</span></div>`);
    $$('#tasks [data-href]').forEach(a => a.addEventListener('click', () => { State.ui.cardooTab = a.querySelector('b').textContent.startsWith('Approved') ? 'claims' : 'invoices'; location.hash = a.dataset.href; }));
    $$('#tasks [data-task]').forEach(a => a.addEventListener('click', () => { State.ui.collections.task = a.dataset.task; State.ui.collections.chip = 'all'; location.hash = '#/collections'; if (State.view === 'collections') Views.render('collections'); }));
  },
  pipeline() {
    const m = App.model, min = +m.settings.general.min_outstanding || 0;
    const owing = m.records.filter(r => r.status === 'Closed' && r.outstanding > min);
    const groups = Object.keys(STAGES).filter(s => !['settled', 'active'].includes(s)).map(s => {
      const rs = owing.filter(r => r.stage === s); return { s, n: rs.length, amt: U.sum(rs, r => r.outstanding) };
    }).filter(x => x.n);
    const max = Math.max(1, ...groups.map(x => x.amt));
    $('#pipeline').innerHTML = groups.length ? groups.sort((a, b) => STAGES[a.s].order - STAGES[b.s].order).map(x => `<div class="pipe t-${STAGES[x.s].tone}" data-stage="${x.s}">
      <span class="pipe-label"><i></i>${STAGES[x.s].label}</span><span class="pipe-bar"><span style="width:${Math.max(3, x.amt / max * 100)}%"></span></span>
      <span class="pipe-val"><small>${x.n}×</small>${U.money(x.amt)}</span></div>`).join('') : '<p class="muted">Nothing outstanding 🎉</p>';
    $$('#pipeline .pipe').forEach(p => p.addEventListener('click', () => {
      const s = p.dataset.stage;
      if (['recovery', 'need_update', 'claim_submitted', 'ready_to_claim'].includes(s)) { State.ui.claims.tab = s === 'ready_to_claim' ? 'ready' : s === 'claim_submitted' ? 'submitted' : s === 'need_update' ? 'need_update' : 'recovery'; location.hash = '#/claims'; }
      else { State.ui.collections.chip = s; location.hash = '#/collections'; }
    }));
  },
  attention() {
    const sevTone = { critical: 'rose', high: 'orange', medium: 'amber', low: 'slate' };
    const list = App.model.checks.filter(c => c.rows.length).sort((a, b) => ['critical', 'high', 'medium', 'low'].indexOf(a.severity) - ['critical', 'high', 'medium', 'low'].indexOf(b.severity)).slice(0, 5);
    $('#attn').innerHTML = list.length ? list.map(c => `<div class="attn-item t-${sevTone[c.severity]}" data-check="${c.id}"><span class="ico">${icon(c.severity === 'critical' ? 'alert' : 'info')}</span>
      <div class="grow"><b>${U.esc(c.title)}</b><small>${c.severity}</small></div><span class="count">${c.rows.length}</span></div>`).join('') : '<p class="muted">All checks are clear ✅</p>';
    $$('#attn [data-check]').forEach(a => a.addEventListener('click', () => { State.ui.checksOpen = { [a.dataset.check]: true }; location.hash = '#/checks'; }));
  },
  top() {
    const rows = App.model.records.filter(r => r.status === 'Closed' && (STAGES[r.stage].group === 'collect' || r.stage === 'ready_to_claim') && r.stage !== 'on_hold' && r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 8);
    const t = new DataTable($('#dbTop'), {
      search: false, pageSize: 8, title: 'Largest balances', exportName: 'largest_balances', totals: false,
      columns: [
        ...Views.recordColumns(),
        { key: 'close_date', label: 'Closed', type: 'date', get: r => r.close_date, html: r => R.date(r.close_date, R.ago(r.days_since_caryaati_close)) },
        { key: 'outstanding', label: 'Outstanding', align: 'right', type: 'num', get: r => r.outstanding, html: r => R.owe(r.outstanding), numeric: true },
        { key: 'booking', label: 'Cardoo', get: r => r.booking_state, html: R.booking },
        { key: 'stage', label: 'Stage', get: r => STAGES[r.stage].label, html: r => R.stage(r.stage) }
      ],
      onRowClick: r => Drawer.open(r.contract_no)
    });
    t.el.classList.remove('card'); t.el.style.boxShadow = 'none';
    t.el.querySelector('.dt-bar').style.display = 'none';
    t.setRows(rows);
  },
  charts() {
    if (!global.Chart) return;
    Object.values(State.charts).forEach(c => c && c.destroy()); State.charts = {};
    const css = getComputedStyle(document.documentElement);
    const v = n => css.getPropertyValue(n).trim();
    Chart.defaults.font.family = v('--font'); Chart.defaults.color = v('--muted');
    Chart.defaults.borderColor = v('--border');
    const m = App.model;
    // monthly
    const byM = new Map();
    m.records.forEach(r => { const k = U.monthKey(r.open_date); if (!k) return; const o = byM.get(k) || { fee: 0, n: 0 }; o.fee += r.waiver_amount; o.n++; byM.set(k, o); });
    const keys = [...byM.keys()].sort().slice(-14);
    State.charts.monthly = new Chart($('#chMonthly'), {
      data: { labels: keys.map(U.monthLabel), datasets: [
        { type: 'bar', label: 'Waiver fees', data: keys.map(k => U.r2(byM.get(k).fee)), backgroundColor: 'rgba(99,102,241,.78)', hoverBackgroundColor: '#4f46e5', borderRadius: 7, maxBarThickness: 34, yAxisID: 'y' },
        { type: 'line', label: 'Contracts', data: keys.map(k => byM.get(k).n), borderColor: '#14b8a6', backgroundColor: '#14b8a6', tension: .35, pointRadius: 3, borderWidth: 2.5, yAxisID: 'y1' }
      ] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => c.dataset.yAxisID === 'y' ? ` ${c.dataset.label}: ${U.money(c.raw)}` : ` ${c.dataset.label}: ${c.raw}` } } },
        scales: { y: { grid: { color: v('--border') }, ticks: { callback: x => U.compact(x) } }, y1: { position: 'right', grid: { display: false } }, x: { grid: { display: false } } } }
    });
    // aging
    const min = +m.settings.general.min_outstanding || 0;
    const owing = m.records.filter(r => r.status === 'Closed' && r.outstanding > min && STAGES[r.stage].group !== 'done');
    const buckets = [['0–30', 0, 30], ['31–60', 31, 60], ['61–90', 61, 90], ['91–180', 91, 180], ['180+', 181, 1e9]];
    State.charts.aging = new Chart($('#chAging'), {
      type: 'bar',
      data: { labels: buckets.map(b => b[0] + ' d'), datasets: [{ label: 'Outstanding', data: buckets.map(b => U.sum(owing.filter(r => r.days_since_close >= b[1] && r.days_since_close <= b[2]), r => r.outstanding)),
        backgroundColor: ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#e11d48'], borderRadius: 8, maxBarThickness: 42 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${U.money(c.raw)} · ${owing.filter(r => r.days_since_close >= buckets[c.dataIndex][1] && r.days_since_close <= buckets[c.dataIndex][2]).length} contracts` } } },
        scales: { y: { grid: { color: v('--border') }, ticks: { callback: x => U.compact(x) } }, x: { grid: { display: false } } } }
    });
    // claims doughnut
    const st = {}; m.claimRows.forEach(c => { st[c.status] = (st[c.status] || 0) + 1; });
    const labels = Object.keys(st);
    const col = s => /recover/i.test(s) ? '#10b981' : /update/i.test(s) ? '#f97316' : /cancel/i.test(s) ? '#94a3b8' : /declin/i.test(s) ? '#e11d48' : '#8b5cf6';
    State.charts.claims = new Chart($('#chClaims'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data: labels.map(l => st[l]), backgroundColor: labels.map(col), borderWidth: 2, borderColor: v('--surface'), hoverOffset: 6 }] },
      options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, padding: 12 } } } }
    });
  }
};

/* ------------------------------ Collections ------------------------------ */
Views.collections = {
  chips: [
    ['action', 'Action needed', 'blue', r => ['collect'].includes(STAGES[r.stage].group) && r.stage !== 'on_hold' || r.stage === 'ready_to_claim'],
    ['to_contact', 'To contact', 'blue', r => r.stage === 'to_contact'],
    ['contacted', 'Contacted', 'indigo', r => r.stage === 'contacted'],
    ['promised', 'Promised', 'teal', r => r.stage === 'promised'],
    ['ready_to_claim', 'Ready to claim', 'amber', r => r.stage === 'ready_to_claim'],
    ['claim_expired', 'Window expired', 'rose', r => r.stage === 'claim_expired'],
    ['not_covered', 'Not covered', 'rose', r => r.stage === 'not_covered'],
    ['claim_rejected', 'Claim rejected', 'rose', r => r.stage === 'claim_rejected'],
    ['on_hold', 'On hold', 'slate', r => r.stage === 'on_hold'],
    ['recovered_partial', 'Cardoo paid · rest due', 'teal', r => r.stage === 'recovered_partial'],
    ['claims', 'With Cardoo', 'green', r => ['recovery', 'need_update', 'claim_submitted'].includes(r.stage)],
    ['paid_marked', 'Marked paid', 'green', r => r.stage === 'paid_marked'],
    ['all', 'All outstanding', 'slate', () => true]
  ],
  base() { const min = +App.model.settings.general.min_outstanding || 0; return App.model.records.filter(r => r.status === 'Closed' && r.outstanding > min); },
  build(el) {
    if (!App.model.records.length) { State.built.collections = false; return Views.emptyData(el); }
    const f = State.ui.collections;
    const g0 = App.model.settings.general;
    el.innerHTML = `<div id="colTask"></div><div class="filter-chips" id="colChips"></div>
      <div class="filters">
        <label>${icon('filter')}Amount</label><input class="input input-sm" type="number" id="cMin" placeholder="Min" value="${f.min}"><input class="input input-sm" type="number" id="cMax" placeholder="Max" value="${f.max}">
        <label>Closed</label><input class="input input-sm" type="date" id="cFrom" value="${f.from}"><span class="muted">→</span><input class="input input-sm" type="date" id="cTo" value="${f.to}">
        <select class="select input-sm" id="cLink"><option value="">Payment link: any</option><option value="has">Has payment link</option><option value="none">Missing payment link</option></select>
        <select class="select input-sm" id="cPhone"><option value="">Phone: any</option><option value="ok">Valid WhatsApp number</option><option value="bad">Needs checking</option></select>
        <select class="select input-sm" id="cWin"><option value="">Claim window: any</option><option value="open">Within ${g0.claim_deadline_days} days</option><option value="soon">Closing in ≤ ${g0.expiring_soon_days} days</option><option value="expired">Expired</option></select>
        <select class="select input-sm" id="cRem"><option value="">Remarks: any</option><option value="has">Has remark</option><option value="none">No remark</option>${(g0.remark_categories || []).map(c => `<option value="cat:${U.esc(c)}">${U.esc(c)}</option>`).join('')}</select>
        <button class="btn btn-sm btn-ghost" id="cReset">Reset</button>
      </div>
      <div id="colTable"></div>`;
    $('#cLink', el).value = f.link; $('#cPhone', el).value = f.phone; $('#cWin', el).value = f.win || ''; $('#cRem', el).value = f.rem || '';
    const upd = () => { Object.assign(f, { min: $('#cMin', el).value, max: $('#cMax', el).value, from: $('#cFrom', el).value, to: $('#cTo', el).value, link: $('#cLink', el).value, phone: $('#cPhone', el).value, win: $('#cWin', el).value, rem: $('#cRem', el).value }); this.update(el); };
    ['#cMin', '#cMax', '#cFrom', '#cTo', '#cLink', '#cPhone', '#cWin', '#cRem'].forEach(s => $(s, el).addEventListener('change', upd));
    ['#cMin', '#cMax'].forEach(s => $(s, el).addEventListener('input', U.debounce(upd, 300)));
    $('#cReset', el).addEventListener('click', () => { Object.assign(f, { min: '', max: '', from: '', to: '', link: '', phone: '', win: '', rem: '' }); State.built.collections = false; Views.render('collections'); });
    $('#colChips', el).addEventListener('click', e => { const c = e.target.closest('[data-chip]'); if (c) { f.chip = c.dataset.chip; this.update(el); } });

    const cur = App.model.settings.general.currency;
    const t = State.tables.collections = new DataTable($('#colTable', el), {
      selectable: true, title: 'Collections', exportName: 'collections', sort: { key: 'outstanding', dir: 'desc' },
      bulk: `<button class="btn btn-xs btn-wa" data-bulk="wa">${icon('whatsapp')}WhatsApp queue</button><button class="btn btn-xs" data-bulk="copy">${icon('copy')}Copy messages</button><button class="btn btn-xs" data-bulk="hold">${icon('pause')}Hold</button>`,
      toolbar: `<button class="btn btn-sm" id="linkBatch" title="Download the provider batch CSV to generate payment links">${icon('download')}Link batch CSV</button><button class="btn btn-sm" id="pasteLinks">${icon('link')}Import payment links</button>`,
      columns: [
        ...Views.recordColumns(),
        { key: 'vehicle', label: 'Vehicle', get: r => r.vehicle, hidden: true },
        { key: 'close_date', label: 'Closed', type: 'date', get: r => r.close_date, sortGet: r => U.dayNum(r.close_date), html: r => R.date(r.close_date, R.ago(r.days_since_caryaati_close)) },
        { key: 'due', label: `Due`, plain: `Due from customer (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.due, html: r => `${R.owe(r.due)}<span class="cell-sub" style="color:var(--${r.stage === 'recovered_partial' ? 'teal' : r.booking_state === 'active' ? 'muted' : 'rose'})">${r.stage === 'recovered_partial' ? `ledger ${U.compact(r.outstanding)} − Cardoo ${U.compact(r.claim_approved)}` : r.booking_state === 'active' ? 'cover ' + U.compact(r.coverage) : r.booking_state === 'cancelled' ? 'booking cancelled' : 'no Cardoo booking'}</span>` },
        { key: 'outstanding', label: 'Ledger balance', type: 'num', get: r => r.outstanding, hidden: true },
        { key: 'coverage', label: 'Cardoo cover', get: r => r.booking_state === 'active' ? r.coverage : 0, type: 'num', hidden: true },
        { key: 'stage', label: 'Stage', get: r => STAGES[r.stage].label, sortGet: r => STAGES[r.stage].order, html: r => `${R.stage(r.stage)}${R.flags(r.flags.filter(x => !/Close in Cardoo|Cardoo close|Claim in/.test(x.t)))}` },
        { key: 'deadline', label: 'Claim window', type: 'date', get: r => r.claim_deadline, sortGet: r => r.days_to_deadline, html: r => R.window(r) },
        { key: 'contacts', label: 'Contacts', get: r => r.contact_count, numeric: true, html: r => r.contact_count ? `${r.contact_count}×<span class="cell-sub">${r.last_contact_at ? U.esc(R.ago(U.todayNum() - U.dayNum(new Date(r.last_contact_at)))) : ''}</span>` : '<span class="zero">0</span>' },
        { key: 'remark', label: 'Remarks', get: r => [r.remark_cat, r.remark].filter(Boolean).join(': '), html: R.remark },
        { key: 'payment_link', label: 'Payment link', get: r => r.payment_link, sortable: true, html: r => `<input class="link-input ${r.payment_link ? 'has' : ''}" data-link="${r.contract_no}" value="${U.esc(r.payment_link)}" placeholder="${r.link_batch_at ? 'Requested ' + U.fmtDate(new Date(r.link_batch_at)) : 'Paste link…'}" title="${U.esc(r.payment_link || (r.link_batch_at ? 'In a link batch CSV on ' + U.fmtTS(r.link_batch_at) : 'Paste the payment link for this customer'))}">` },
        { key: 'actions', label: '', sortable: false, export: false, html: r => `<div class="row-actions">
          <button class="icon-btn sm wa" data-act="wa" data-no="${r.contract_no}" title="WhatsApp">${icon('whatsapp')}</button>
          <button class="icon-btn sm" data-act="copy" data-no="${r.contract_no}" title="Copy message">${icon('copy')}</button>
          <button class="icon-btn sm" data-act="open" data-no="${r.contract_no}" title="Open panel">${icon('more')}</button></div>` }
      ],
      onRowClick: r => Drawer.open(r.contract_no)
    });
    Views.bindRowActions(t.el);
    t.o.onSel = n => { const lb = $('#linkBatch', el); if (lb) lb.innerHTML = `${icon('download')}Link batch CSV${n ? ` (${n} selected)` : ''}`; };
    t.el.addEventListener('click', async e => {
      const b = e.target.closest('[data-bulk]'); if (!b) return;
      const rows = t.selectedRows(); if (!rows.length) return;
      if (b.dataset.bulk === 'wa') Actions.queue(rows);
      if (b.dataset.bulk === 'copy') Actions.copyMany(rows);
      if (b.dataset.bulk === 'batch') Actions.linkBatch(rows);
      if (b.dataset.bulk === 'hold') { for (const r of rows) await App.saveCase(r.contract_no, { on_hold: true }); Toast.ok(`${rows.length} put on hold`); t.clearSel(); }
    });
    $('#pasteLinks', el).addEventListener('click', () => Actions.pasteLinks());
    $('#linkBatch', el).addEventListener('click', () => {
      const sel = t.selectedRows();
      if (sel.length) return Actions.linkBatch(sel);
      const pool = t.view.filter(r => !r.payment_link);
      if (!pool.length) return Toast.warn('Select customers first', 'Everyone in the current list already has a payment link.');
      Actions.linkBatch(pool, true);
    });
  },
  update(el) {
    if (!App.model.records.length) return;
    const f = State.ui.collections;
    const task = f.task && Engine.TASKS.find(t => t.id === f.task);
    $('#colTask', el).innerHTML = task ? `<div class="notice t-${task.tone}" style="margin-bottom:10px">${icon(task.icon)}<span style="flex:1">Task: <b>${task.label}</b> — ${task.hint}</span><button class="btn btn-xs" id="taskClear">${icon('x')}Show all</button></div>` : '';
    const tc = $('#taskClear', el); if (tc) tc.addEventListener('click', () => { f.task = ''; this.update(el); App.saveUI(); });
    const base = task ? App.model.records.filter(task.fn) : this.base();
    const fil = base.filter(r => {
      if (f.min !== '' && r.outstanding < +f.min) return false;
      if (f.max !== '' && r.outstanding > +f.max) return false;
      if (f.from && (U.dayNum(r.close_date) || 0) < U.dayNum(f.from)) return false;
      if (f.to && (U.dayNum(r.close_date) || 0) > U.dayNum(f.to)) return false;
      if (f.link === 'has' && !r.payment_link) return false;
      if (f.link === 'none' && r.payment_link) return false;
      if (f.phone === 'ok' && !r.phone_valid) return false;
      if (f.phone === 'bad' && r.phone_valid) return false;
      if (f.win && r.claim_window !== f.win && !(f.win === 'open' && r.claim_window === 'soon')) return false;
      if (f.rem === 'has' && !r.remark && !r.remark_cat) return false;
      if (f.rem === 'none' && (r.remark || r.remark_cat)) return false;
      if (f.rem && f.rem.startsWith('cat:') && r.remark_cat !== f.rem.slice(4)) return false;
      return true;
    });
    $('#colChips', el).innerHTML = this.chips.map(([id, label, tone, fn]) => {
      const n = fil.filter(fn).length;
      return `<button class="fchip t-${tone} ${f.chip === id ? 'active' : ''}" data-chip="${id}"><span class="dot"></span>${label}<i>${n}</i></button>`;
    }).join('');
    const chip = this.chips.find(c => c[0] === f.chip) || this.chips[0];
    State.tables.collections.setRows(fil.filter(chip[3]));
    const lb = $('#linkBatch', el); if (lb) lb.innerHTML = `${icon('download')}Link batch CSV${State.tables.collections.sel.size ? ` (${State.tables.collections.sel.size} selected)` : ''}`;
    App.saveUI();
  }
};

/** shared delegation for record row buttons + payment-link inputs */
Views.bindRowActions = function (root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    e.stopPropagation();
    const r = App.model.byNo.get(+b.dataset.no); if (!r) return;
    const a = b.dataset.act;
    if (a === 'wa') Actions.compose(r);
    if (a === 'copy') Actions.copyMessage(r);
    if (a === 'open') Drawer.open(r.contract_no);
    if (a === 'pack') Actions.claimPack(r);
    if (a === 'claimtxt') Actions.copyClaim(r);
    if (a === 'submit') Actions.markSubmitted([r]);
    if (a === 'unsubmit') Actions.unsubmit(r);
    if (a === 'remark') { e.preventDefault(); Actions.remark(r); }
  });
  root.addEventListener('keydown', e => { if (e.target.matches('.link-input') && e.key === 'Enter') e.target.blur(); });
  root.addEventListener('change', async e => {
    const inp = e.target.closest('.link-input'); if (!inp) return;
    const no = +inp.dataset.link, v = inp.value.trim();
    if (v && !/^https?:\/\//i.test(v)) { Toast.warn('Payment link should start with https://'); }
    try { await App.saveCase(no, { payment_link: v }, v ? `Payment link saved for #${no}` : `Payment link removed for #${no}`); } catch (x) { /* toast shown */ }
  });
};

/* ------------------------------ Claims ------------------------------ */
Views.claims = {
  tabs: [
    ['ready', 'Ready to claim', 'amber'], ['soon', 'Window closing soon', 'orange'], ['window', 'Within claim window', 'teal'], ['expired', 'Window expired', 'rose'],
    ['need_update', 'Need update', 'orange'], ['submitted', 'Submitted (awaiting report)', 'violet'],
    ['recovery', 'Approved / paid (In Recovery)', 'green'], ['rejected', 'Cancelled / declined', 'rose'], ['all', 'All Cardoo claims', 'slate']
  ],
  build(el) {
    if (!App.model.records.length && !App.model.claimRows.length) { State.built.claims = false; return Views.emptyData(el); }
    const g = App.model.settings.general, cur = g.currency;
    el.innerHTML = `<div class="notice" style="margin-bottom:14px">${icon('info')}<span>Claims must reach Cardoo within <b>${g.claim_deadline_days} days</b> of the contract closing. A contract is <b>Ready to claim</b> after ${g.claim_after_reminders} reminders or ${g.claim_after_days} days without payment. <b>Window closing soon</b> = ${g.expiring_soon_days} days or less left; <b>Window expired</b> contracts can no longer be claimed and must be collected directly. Claimable = lower of outstanding and Cardoo cover.</span></div>
      <div class="filter-chips" id="clTabs"></div><div id="clRec"></div><div id="clRows"></div>`;
    $('#clTabs', el).addEventListener('click', e => { const c = e.target.closest('[data-tab]'); if (c) { State.ui.claims.tab = c.dataset.tab; this.update(el); } });
    const rec = State.tables.claimsRec = new DataTable($('#clRec', el), {
      selectable: true, title: 'Claims - ready to claim', exportName: 'cardoo_claims_ready', sort: { key: 'claimable', dir: 'desc' },
      bulk: `<button class="btn btn-xs btn-primary" data-bulk="submit">${icon('send')}Submit claims</button><button class="btn btn-xs" data-bulk="packs">${icon('pdf')}Claim packs</button>`,
      columns: [
        ...Views.recordColumns(),
        { key: 'period', label: 'Rental period', get: r => `${U.fmtDate(r.open_date)} - ${U.fmtDate(r.close_date)}`, html: r => `<span class="nowrap">${U.fmtDate(r.open_date)}</span><span class="cell-sub">→ ${U.fmtDate(r.close_date)}</span>` },
        { key: 'outstanding', label: 'Outstanding', plain: `Outstanding (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.outstanding, html: r => R.owe(r.outstanding) },
        { key: 'coverage', label: 'Cover', plain: `Cardoo cover (${cur})`, align: 'right', type: 'num', numeric: true, get: r => r.coverage, html: r => R.amt(r.coverage) },
        { key: 'claimable', label: 'Claimable', plain: `Claimable (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.claimable, html: r => `<span class="amt big" style="color:var(--amber)">${U.money(r.claimable)}</span>` },
        { key: 'deadline', label: 'Claim window', type: 'date', get: r => r.claim_deadline, sortGet: r => r.days_to_deadline, html: r => R.window(r) },
        { key: 'remark', label: 'Remarks', get: r => [r.remark_cat, r.remark].filter(Boolean).join(': '), html: R.remark },
        { key: 'submitted', label: 'Submitted', type: 'date', get: r => (r.case || {}).claim_submitted_at || '', sortGet: r => U.dayNum((r.case || {}).claim_submitted_at), html: r => r.case && r.case.claim_submitted_at ? `<span class="nowrap">${U.fmtDate(r.case.claim_submitted_at)}</span><span class="cell-sub">${U.money(r.case.claim_amount)} · ${r.submitted_days}d waiting</span>` : '<span class="zero">—</span>' },
        { key: 'contacts', label: 'Reminders', numeric: true, get: r => r.contact_count, html: r => `${r.contact_count}×` },
        { key: 'stage', label: 'Stage', get: r => STAGES[r.stage].label, html: r => R.stage(r.stage) },
        { key: 'act', label: '', sortable: false, export: false, html: r => `<div class="row-actions">
          <button class="btn btn-xs" data-act="pack" data-no="${r.contract_no}">${icon('pdf')}Pack</button>
          <button class="icon-btn sm" data-act="claimtxt" data-no="${r.contract_no}" title="Copy claim details">${icon('copy')}</button>
          ${r.claim_window && r.claim_window !== 'expired' && !['claim_submitted'].includes(r.stage) ? `<button class="btn btn-xs btn-primary" data-act="submit" data-no="${r.contract_no}">${icon('send')}Submit</button>` : ''}
          ${r.stage === 'claim_submitted' ? `<button class="btn btn-xs" data-act="submit" data-no="${r.contract_no}">Edit</button><button class="btn btn-xs btn-ghost" data-act="unsubmit" data-no="${r.contract_no}">Undo</button>` : ''}</div>` }
      ],
      onRowClick: r => Drawer.open(r.contract_no)
    });
    Views.bindRowActions(rec.el);
    rec.el.addEventListener('click', e => {
      const b = e.target.closest('[data-bulk]'); if (!b) return;
      const rows = rec.selectedRows(); if (!rows.length) return;
      if (b.dataset.bulk === 'submit') Actions.markSubmitted(rows);
      if (b.dataset.bulk === 'packs') Actions.claimPacks(rows);
    });
    const cr = State.tables.claimsRows = new DataTable($('#clRows', el), {
      title: 'Cardoo claims', exportName: 'cardoo_claims', rowKey: r => r.row_key, sort: { key: 'claim_date', dir: 'desc' },
      columns: [
        { key: 'claim_date', label: 'Claim date', type: 'date', get: r => r.claim_date, sortGet: r => U.dayNum(r.claim_date), html: r => R.date(r.claim_date) },
        { key: 'contract_no', label: 'Contract', plain: 'Contract No', numeric: true, get: r => r.contract_raw || r.contract_no, html: r => `${R.cno(r.contract_raw || r.contract_no)}${r._inWaivers ? '' : '<span class="cell-sub" style="color:var(--amber)">not in waivers</span>'}` },
        { key: '_name', label: 'Customer', get: r => r._name, html: r => `<span class="cell-main">${U.esc(r._name || '—')}</span>` },
        { key: 'deposit_amount', label: 'Deposit', plain: `Deposit (${cur})`, align: 'right', type: 'num', numeric: true, get: r => r.deposit_amount, html: r => R.amt(r.deposit_amount) },
        { key: 'excess_sum', label: 'Excess sum', plain: `Excess sum (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.excess_sum, html: r => R.amt(r.excess_sum, 'big') },
        { key: 'approved_amount', label: 'Approved', plain: `Approved (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.approved_amount, html: r => r.approved_amount != null ? `<span class="amt big" style="color:var(--green)">${U.money(r.approved_amount)}</span>` : '<span class="zero">—</span>' },
        { key: 'status', label: 'Status', get: r => r.status, html: r => R.claimChip(r.status) },
        { key: '_cardoo', label: 'Cardoo payment', get: r => { const c = App.model.cardoo && App.model.cardoo.claimByKey.get(r.row_key); return c ? c.state : ''; },
          html: r => { const c = App.model.cardoo && App.model.cardoo.claimByKey.get(r.row_key); if (!c) return '<span class="zero">—</span>'; return `<span class="chip t-${Views.cardoo.claimTone(c.state)}">${c.state}</span><span class="cell-sub">${c.open > 0.01 ? 'open ' + U.money(c.open) : c.how + (c.received_on ? ' · ' + U.fmtDate(c.received_on) : '')}</span>`; } },
        { key: '_outstanding', label: 'Outstanding now', plain: `Outstanding now (${cur})`, align: 'right', type: 'num', numeric: true, get: r => r._outstanding, html: r => r._outstanding == null ? '<span class="zero">—</span>' : R.owe(r._outstanding) },
        { key: 'last_comment', label: 'Cardoo comment', get: r => r.last_comment || '', html: r => r.last_comment ? `<span class="cell-sub" style="white-space:normal;max-width:340px;color:var(--text-2)">${U.esc(r.last_comment)}</span>` : '' }
      ],
      onRowClick: r => r._rec && Drawer.open(r.contract_no)
    });
  },
  update(el) {
    if (!State.tables.claimsRec) return;
    const m = App.model, tab = State.ui.claims.tab;
    const min = +m.settings.general.min_outstanding || 0;
    const sets = {
      ready: m.records.filter(r => r.stage === 'ready_to_claim'),
      soon: m.records.filter(r => r.claim_window === 'soon' && !['claim_submitted', 'paid_marked', 'on_hold'].includes(r.stage)),
      window: m.records.filter(r => (r.claim_window === 'open' || r.claim_window === 'soon') && !['claim_submitted', 'paid_marked'].includes(r.stage)),
      expired: m.records.filter(r => r.stage === 'claim_expired'),
      submitted: m.records.filter(r => r.stage === 'claim_submitted'),
      need_update: m.claimRows.filter(x => /update/i.test(x.status)),
      recovery: m.claimRows.filter(x => /recover/i.test(x.status)),
      rejected: m.claimRows.filter(x => /cancel|declin|reject/i.test(x.status)),
      all: m.claimRows
    };
    $('#clTabs', el).innerHTML = this.tabs.map(([id, l, tone]) => `<button class="fchip t-${tone} ${tab === id ? 'active' : ''}" data-tab="${id}"><span class="dot"></span>${l}<i>${sets[id].length}</i></button>`).join('');
    const recTab = ['ready', 'soon', 'window', 'expired', 'submitted'].includes(tab);
    $('#clRec', el).hidden = !recTab; $('#clRows', el).hidden = recTab;
    if (recTab) { const tb = State.tables.claimsRec; tb.allCols.forEach(c => { if (c.key === 'submitted') c.hidden = tab !== 'submitted'; if (c.key === 'contacts' || c.key === 'coverage') c.hidden = tab === 'submitted'; if (c.key === 'phone') c.hidden = true; }); tb.cols = tb.allCols.filter(c => !c.hidden);
      State.tables.claimsRec.o.title = 'Claims - ' + this.tabs.find(t => t[0] === tab)[1]; State.tables.claimsRec.o.exportName = 'claims_' + tab; State.tables.claimsRec.setRows(sets[tab]); }
    else { State.tables.claimsRows.o.title = 'Cardoo claims - ' + this.tabs.find(t => t[0] === tab)[1]; State.tables.claimsRows.setRows(sets[tab]); }
    void min;
  }
};

/* ------------------------------ Checks ------------------------------ */
Views.checks = {
  build(el) {
    const m = App.model;
    if (!m.records.length) return Views.emptyData(el);
    const sevTone = { critical: 'rose', high: 'orange', medium: 'amber', low: 'slate' };
    const order = ['critical', 'high', 'medium', 'low'];
    const list = m.checks.slice().sort((a, b) => (b.rows.length ? 1 : 0) - (a.rows.length ? 1 : 0) || order.indexOf(a.severity) - order.indexOf(b.severity));
    el.innerHTML = `<div class="section-head"><div><h2>Reconciliation checks</h2><p>Cross-checks between the Caryaati and Cardoo reports. Click a card to see the contracts and export them.</p></div></div>
      <div class="grid" id="ckList">${list.map(c => `<div class="card check-card t-${sevTone[c.severity]} ${c.rows.length ? '' : 'zero'} ${State.ui.checksOpen[c.id] && c.rows.length ? 'open' : ''}" data-id="${c.id}">
        <div class="check-head"><span class="sev">${icon(c.rows.length ? (c.severity === 'critical' || c.severity === 'high' ? 'alert' : 'info') : 'check')}</span>
          <div class="grow"><b>${U.esc(c.title)}</b><p>${U.esc(c.desc)}</p></div><span class="chip t-${sevTone[c.severity]}">${c.severity}</span>
          <span class="check-count">${c.rows.length}</span>${c.rows.length ? `<span class="chev">${icon('chevron')}</span>` : ''}</div>
        <div class="check-body"></div></div>`).join('')}</div>`;
    $$('.check-card', el).forEach(card => {
      const c = m.checks.find(x => x.id === card.dataset.id);
      const open = () => { if (!card.querySelector('.check-body').dataset.built) this.table(card, c); };
      if (card.classList.contains('open')) open();
      card.querySelector('.check-head').addEventListener('click', () => {
        if (!c.rows.length) return;
        card.classList.toggle('open'); State.ui.checksOpen[c.id] = card.classList.contains('open'); open();
      });
    });
  },
  table(card, c) {
    const body = card.querySelector('.check-body'); body.dataset.built = '1';
    const div = document.createElement('div'); body.appendChild(div);
    if (c.id === 'phone') {
      const bar = document.createElement('div'); bar.className = 'notice'; bar.style.margin = '0 0 10px';
      bar.innerHTML = `${icon('info')}<span>Caryaati exports foreign mobiles without the country code. <button class="btn btn-sm btn-primary" id="ckPhoneFix" style="margin-left:8px">Fix country codes</button></span>`;
      body.insertBefore(bar, div); bar.querySelector('#ckPhoneFix').addEventListener('click', e => { e.stopPropagation(); Actions.phoneFix(c.rows); });
    }
    let cols;
    if (c.kind === 'bookings') cols = Views.bookings.cols();
    else if (c.kind === 'cardoo') cols = Views.matching.cardooCols();
    else if (c.kind === 'claims') cols = Views.claims && State.tables.claimsRows ? State.tables.claimsRows.cols : [
      { key: 'claim_date', label: 'Claim date', type: 'date', get: r => r.claim_date, html: r => R.date(r.claim_date) },
      { key: 'contract_no', label: 'Contract', get: r => r.contract_raw, html: r => R.cno(r.contract_raw) },
      { key: '_name', label: 'Customer', get: r => r._name },
      { key: 'excess_sum', label: 'Excess', align: 'right', type: 'num', get: r => r.excess_sum, html: r => R.amt(r.excess_sum) },
      { key: 'status', label: 'Status', get: r => r.status, html: r => R.claimChip(r.status) }];
    else cols = [
      ...Views.recordColumns(),
      { key: 'status', label: 'Status', get: r => r.status, html: r => R.status(r.status) },
      { key: 'open_date', label: 'Opened', type: 'date', get: r => r.open_date, sortGet: r => U.dayNum(r.open_date), html: r => R.date(r.open_date) },
      { key: 'close_date', label: 'Closed / drop-off', type: 'date', get: r => r.close_date || r.dropoff_at, sortGet: r => U.dayNum(r.close_date || r.dropoff_at), html: r => r.close_date ? R.date(r.close_date) : `<span class="nowrap">${U.fmtDT(r.dropoff_at)}</span><span class="cell-sub">drop-off</span>` },
      { key: 'booking_end', label: 'Cardoo booking', get: r => r.booking_end || '', html: r => r.booking_state === 'active' ? `<span class="nowrap">${U.fmtDT(r.booking_start)}</span><span class="cell-sub">→ ${U.fmtDT(r.booking_end)}</span>` : R.booking(r) },
      { key: 'waiver_amount', label: 'Waiver fee', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.waiver_amount, html: r => R.amt(r.waiver_amount) },
      { key: 'outstanding', label: 'Outstanding', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.outstanding, html: r => R.owe(r.outstanding) },
      { key: 'stage', label: 'Stage', get: r => STAGES[r.stage].label, html: r => R.stage(r.stage) }
    ];
    const t = new DataTable(div, { columns: cols, title: c.title, exportName: 'check_' + c.id, rowKey: r => r.row_key || r.contract_no, pageSize: 10,
      onRowClick: r => { const no = r.contract_no; if (App.model.byNo.get(+no)) Drawer.open(+no); } });
    t.el.classList.remove('card'); t.el.style.boxShadow = 'none'; t.el.style.border = '0';
    t.setRows(c.rows);
  }
};

/* ------------------------------ Waiver contracts ------------------------------ */
Views.contracts = {
  build(el) {
    if (!App.model.records.length) { State.built.contracts = false; return Views.emptyData(el); }
    const f = State.ui.contracts, cur = App.model.settings.general.currency;
    const months = [...new Set(App.model.records.map(r => U.monthKey(r.open_date)).filter(Boolean))].sort().reverse();
    el.innerHTML = `<div class="filters">
        <label>${icon('filter')}Status</label><select class="select input-sm" id="ctStatus"><option value="">All</option><option>Open</option><option>Closed</option></select>
        <select class="select input-sm" id="ctStage"><option value="">Any stage</option>${Object.entries(STAGES).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('')}</select>
        <select class="select input-sm" id="ctBooking"><option value="">Cardoo: any</option><option value="active">Covered</option><option value="none">No booking</option><option value="cancelled">Cancelled</option></select>
        <select class="select input-sm" id="ctMonth"><option value="">Opened: any month</option>${months.map(k => `<option value="${k}">${U.monthLabel(k)}</option>`).join('')}</select>
        <select class="select input-sm" id="ctFlag"><option value="">Flags: any</option><option value="flag">Has any flag</option><option value="phone">Phone needs checking</option><option value="extend">Extend booking</option></select>
      </div><div id="ctTable"></div>`;
    [['#ctStatus', 'status'], ['#ctStage', 'stage'], ['#ctBooking', 'booking'], ['#ctMonth', 'month'], ['#ctFlag', 'flag']].forEach(([s, k]) => { const x = $(s, el); x.value = f[k] || ''; x.addEventListener('change', () => { f[k] = x.value; this.update(el); }); });
    const t = State.tables.contracts = new DataTable($('#ctTable', el), {
      title: 'Waiver contracts', exportName: 'waiver_contracts', selectable: true, sort: { key: 'contract_no', dir: 'desc' },
      bulk: `<button class="btn btn-xs btn-wa" data-bulk="wa">${icon('whatsapp')}WhatsApp queue</button>`,
      columns: [
        ...Views.recordColumns(),
        { key: 'email', label: 'Email', get: r => r.email || '', hidden: true, export: true },
        { key: 'vehicle', label: 'Vehicle', get: r => r.vehicle, html: r => `<span class="cell-main" style="font-weight:600">${U.esc(r.vehicle)}</span>` },
        { key: 'open_date', label: 'Opened', type: 'date', get: r => r.open_date, sortGet: r => U.dayNum(r.open_date), html: r => R.date(r.open_date) },
        { key: 'close_date', label: 'Closed', type: 'date', get: r => r.close_date, sortGet: r => U.dayNum(r.close_date), html: r => R.date(r.close_date) },
        { key: 'status', label: 'Status', get: r => r.status, html: r => R.status(r.status) },
        { key: 'waiver_amount', label: 'Waiver fee', plain: `Waiver fee (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.waiver_amount, html: r => R.amt(r.waiver_amount) },
        { key: 'rent_paid', label: 'Rent paid', plain: `Rent paid (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.rent_paid, html: r => R.amt(r.rent_paid) },
        { key: 'outstanding', label: 'Ledger bal.', plain: `Ledger balance (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.outstanding, html: r => R.owe(r.outstanding) },
        { key: 'coverage', label: 'Cardoo', plain: `Cardoo cover (${cur})`, type: 'num', numeric: true, get: r => r.coverage, html: R.booking },
        { key: 'claim_state', label: 'Claim', get: r => r.claim_state || '', html: r => R.claimChip(r.claim_state) },
        { key: 'stage', label: 'Stage', get: r => STAGES[r.stage].label, sortGet: r => STAGES[r.stage].order, html: r => `${R.stage(r.stage)}${R.flags(r.flags)}` }
      ],
      onRowClick: r => Drawer.open(r.contract_no)
    });
    t.el.addEventListener('click', e => { const b = e.target.closest('[data-bulk="wa"]'); if (b) Actions.queue(t.selectedRows()); });
  },
  update() {
    if (!State.tables.contracts) return;
    const f = State.ui.contracts;
    State.tables.contracts.setRows(App.model.records.filter(r =>
      (!f.status || r.status === f.status) && (!f.stage || r.stage === f.stage) && (!f.booking || r.booking_state === f.booking) &&
      (!f.month || U.monthKey(r.open_date) === f.month) &&
      (!f.flag || (f.flag === 'flag' ? r.flags.length : f.flag === 'phone' ? !r.phone_valid : r.flags.some(x => /Extend/.test(x.t))))));
  }
};

/* ------------------------------ Cardoo bookings ------------------------------ */
Views.bookings = {
  cols() {
    const cur = App.model.settings.general.currency;
    return [
      { key: 'booked_at', label: 'Booked at', type: 'date', dt: true, get: r => r.booked_at, sortGet: r => U.dayFrac(r.booked_at), html: r => `<span class="nowrap">${U.fmtDT(r.booked_at)}</span><span class="cell-sub">${U.esc(r.user_label || '')}</span>` },
      { key: 'contract_no', label: 'Contract', plain: 'Contract', numeric: true, get: r => r.contract_raw || r.contract_no, sortGet: r => r.contract_no, html: r => `${R.cno(r.contract_raw || r.contract_no)}${r._inWaivers ? '' : '<span class="cell-sub" style="color:var(--amber)">no waiver</span>'}` },
      { key: '_name', label: 'Customer', get: r => r._name || '', html: r => `<span class="cell-main">${U.esc(r._name || '—')}</span>` },
      { key: 'booking_type', label: 'Type', get: r => r.booking_type || '', html: r => `<span class="tag">${U.esc(r.booking_type || '')}</span>` },
      { key: 'start_at', label: 'Start', type: 'date', dt: true, get: r => r.start_at, sortGet: r => U.dayFrac(r.start_at), html: r => `<span class="nowrap">${U.fmtDT(r.start_at)}</span>` },
      { key: 'end_at', label: 'End', type: 'date', dt: true, get: r => r.end_at, sortGet: r => U.dayFrac(r.end_at), html: r => `<span class="nowrap">${U.fmtDT(r.end_at)}</span>` },
      { key: 'close_at', label: 'Closed', type: 'date', dt: true, get: r => r.close_at, sortGet: r => U.dayFrac(r.close_at), html: r => r.close_at ? `<span class="nowrap">${U.fmtDT(r.close_at)}</span>` : '<span class="zero">open</span>' },
      { key: 'deposit_covered', label: 'Deposit cover', plain: `Deposit cover (${cur})`, align: 'right', type: 'num', numeric: true, get: r => r.deposit_covered, html: r => R.amt(r.deposit_covered) },
      { key: '_fee', label: 'Cardoo fee', plain: `Cardoo fee est. (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r._fee, html: r => `${R.amt(r._fee)}<span class="cell-sub">${r.total_price != null ? 'total' : r.monthly_price != null ? `${U.money(r.monthly_price)}/mo` : ''}</span>` },
      { key: 'cancelled', label: 'Status', get: r => r.cancelled ? 'Cancelled' : 'Active', html: r => r.cancelled ? '<span class="chip t-rose">Cancelled</span>' : '<span class="chip t-teal">Active</span>' }
    ];
  },
  build(el) {
    if (!App.model.bookingRows.length) { State.built.bookings = false; return Views.emptyData(el); }
    const f = State.ui.bookings;
    el.innerHTML = `<div class="filters"><label>${icon('filter')}Filter</label>
      <select class="select input-sm" id="bkStatus"><option value="">Active &amp; cancelled</option><option value="active">Active only</option><option value="cancelled">Cancelled only</option></select>
      <select class="select input-sm" id="bkType"><option value="">Any type</option>${[...new Set(App.model.bookingRows.map(b => b.booking_type).filter(Boolean))].map(t => `<option>${U.esc(t)}</option>`).join('')}</select>
      <select class="select input-sm" id="bkWaiver"><option value="">Any</option><option value="yes">Linked to a waiver</option><option value="no">No waiver contract</option></select>
      <select class="select input-sm" id="bkOpen"><option value="">Open &amp; closed</option><option value="open">Not closed in Cardoo</option><option value="closed">Closed in Cardoo</option></select></div><div id="bkTable"></div>`;
    [['#bkStatus', 'status'], ['#bkType', 'type'], ['#bkWaiver', 'waiver'], ['#bkOpen', 'open']].forEach(([s, k]) => { const x = $(s, el); x.value = f[k] || ''; x.addEventListener('change', () => { f[k] = x.value; this.update(); }); });
    State.tables.bookings = new DataTable($('#bkTable', el), { title: 'Cardoo bookings', exportName: 'cardoo_bookings', rowKey: r => r.row_key, columns: this.cols(), sort: { key: 'booked_at', dir: 'desc' },
      onRowClick: r => r._rec && Drawer.open(r.contract_no) });
  },
  update() {
    if (!State.tables.bookings) return;
    const f = State.ui.bookings;
    State.tables.bookings.setRows(App.model.bookingRows.filter(b =>
      (!f.status || (f.status === 'active' ? !b.cancelled : b.cancelled)) && (!f.type || b.booking_type === f.type) &&
      (!f.waiver || (f.waiver === 'yes' ? b._inWaivers : !b._inWaivers)) && (!f.open || (f.open === 'open' ? !b.close_at : !!b.close_at))));
  }
};

/* ------------------------------ Payments ------------------------------ */
Views.payments = {
  build(el) {
    if (!App.model.paymentRows.length) { State.built.payments = false; return Views.emptyData(el); }
    const f = State.ui.payments, cur = App.model.settings.general.currency;
    el.innerHTML = `<div class="filters"><label>${icon('calendar')}Invoice date</label><input class="input input-sm" type="date" id="pyFrom" value="${f.from}"><span class="muted">→</span><input class="input input-sm" type="date" id="pyTo" value="${f.to}">
      <select class="select input-sm" id="pyLinked"><option value="waiver">Waiver contracts only</option><option value="">All linked contracts</option></select></div><div id="pyTable"></div>`;
    $('#pyLinked', el).value = f.linked;
    [['#pyFrom', 'from'], ['#pyTo', 'to'], ['#pyLinked', 'linked']].forEach(([s, k]) => $(s, el).addEventListener('change', e => { f[k] = e.target.value; this.update(); }));
    State.tables.payments = new DataTable($('#pyTable', el), {
      title: 'Rent payments', exportName: 'rent_payments', rowKey: r => r.row_key, sort: { key: 'invoice_date', dir: 'desc' },
      columns: [
        { key: 'invoice_date', label: 'Date', type: 'date', get: r => r.invoice_date, sortGet: r => U.dayNum(r.invoice_date), html: r => R.date(r.invoice_date) },
        { key: 'invoice_no', label: 'Receipt', get: r => r.invoice_no, html: r => `<span class="mono small">${U.esc(r.invoice_no)}</span>` },
        { key: 'contract_no', label: 'Contract', numeric: true, get: r => r.contract_no, html: r => R.cno(r.contract_no) },
        { key: 'debtor_name', label: 'Customer', get: r => r.debtor_name, html: r => `<span class="cell-main">${U.esc(r.debtor_name)}</span>` },
        { key: 'rental_type', label: 'Type', get: r => r.rental_type || '', html: r => `<span class="tag">${U.esc(r.rental_type || '')}</span>` },
        { key: 'invoice_amount', label: 'Amount', plain: `Amount (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.invoice_amount, html: r => R.amt(r.invoice_amount) },
        { key: 'vat', label: 'VAT', plain: `VAT (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.vat, html: r => R.amt(r.vat) },
        { key: 'net_amount', label: 'Total paid', plain: `Total paid (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.net_amount, html: r => R.amt(r.net_amount, 'big') }
      ],
      onRowClick: r => r._rec && Drawer.open(r.contract_no)
    });
  },
  update() {
    if (!State.tables.payments) return;
    const f = State.ui.payments, a = f.from ? U.dayNum(f.from) : null, b = f.to ? U.dayNum(f.to) : null;
    State.tables.payments.setRows(App.model.paymentRows.filter(p => (!f.linked || p._rec) && (a == null || (U.dayNum(p.invoice_date) || 0) >= a) && (b == null || (U.dayNum(p.invoice_date) || 0) <= b)));
  }
};

/* ------------------------------ Activity ------------------------------ */
Views.activity = {
  labels: { whatsapp: ['WhatsApp sent', 'green'], call: ['Call logged', 'teal'], case_update: ['Case updated', 'indigo'], sync: ['Reports synced', 'violet'], login: ['Signed in', 'slate'], settings: ['Settings changed', 'amber'], note: ['Note', 'sky'], claim_pack: ['Claim pack', 'orange'], statement: ['Statement PDF', 'sky'], remark: ['Remark', 'teal'], link_batch: ['Link batch CSV', 'violet'], po_import: ['Cardoo invoice imported', 'violet'], cardoo_settlement: ['Cardoo settlement', 'green'], cardoo_settlement_deleted: ['Settlement deleted', 'rose'] },
  build(el) {
    el.innerHTML = `<div class="filters"><label>${icon('filter')}Show</label><select class="select input-sm" id="acAction"><option value="">All actions</option>${Object.entries(this.labels).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select>
      <button class="btn btn-sm" id="acReload">${icon('refresh')}Reload</button></div><div id="acTable"></div>`;
    $('#acAction', el).value = State.ui.activity.action;
    $('#acAction', el).addEventListener('change', e => { State.ui.activity.action = e.target.value; this.filter(); });
    $('#acReload', el).addEventListener('click', () => this.fetch());
    State.tables.activity = new DataTable($('#acTable', el), {
      title: 'Activity log', exportName: 'activity_log', rowKey: r => r.id, sort: { key: 'created_at', dir: 'desc' }, pageSize: 50,
      columns: [
        { key: 'created_at', label: 'When', get: r => U.fmtTS(r.created_at), sortGet: r => r.created_at, html: r => `<span class="nowrap">${U.fmtTS(r.created_at)}</span>` },
        { key: 'username', label: 'User', get: r => r.username || '', html: r => `<b>${U.esc(r.username || '')}</b>` },
        { key: 'action', label: 'Action', get: r => (this.labels[r.action] || [r.action])[0], html: r => { const l = this.labels[r.action] || [r.action, 'slate']; return `<span class="chip t-${l[1]}">${U.esc(l[0])}</span>`; } },
        { key: 'contract_no', label: 'Contract', get: r => r.contract_no || '', html: r => r.contract_no ? R.cno(r.contract_no) : '<span class="zero">—</span>' },
        { key: 'customer', label: 'Customer', get: r => { const x = r.contract_no && App.model.byNo.get(+r.contract_no); return x ? x.name : ''; } },
        { key: 'details', label: 'Details', get: r => Views.activity.describe(r), html: r => `<span class="cell-sub" style="white-space:normal;max-width:420px;color:var(--text-2)">${U.esc(Views.activity.describe(r))}</span>` }
      ],
      onRowClick: r => r.contract_no && App.model.byNo.get(+r.contract_no) && Drawer.open(+r.contract_no)
    });
    this.fetch();
  },
  describe(a) {
    const d = a.details || {};
    if (a.action === 'whatsapp') return `Template: ${d.template_name || d.template || 'custom'} · to +${d.phone || ''}${d.amount ? ` · ${d.amount}` : ''}`;
    if (a.action === 'case_update') return Object.entries(d).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v === null || v === '' ? '(cleared)' : v}`).join(' · ');
    if (a.action === 'sync') return d.stored ? Object.entries(d.stored).map(([k, v]) => `${k} ${v}`).join(' · ') : '';
    if (a.action === 'call') return d.note || '';
    if (a.action === 'po_import') return `${d.po_no}${d.new ? ' (new)' : ' (updated)'}${d.lines != null ? ` · ${d.lines} lines` : ''}${d.pdf ? ' · PDF' : ''}`;
    if (a.action === 'cardoo_settlement') return `${d.kind} · ${d.po_no || ''} · ${d.amount_usd != null ? 'USD ' + U.money(d.amount_usd) : ''} ${d.amount_aed != null ? 'AED ' + U.money(d.amount_aed) : ''}`;
    if (a.action === 'remark') return [d.category, d.text].filter(Boolean).join(': ');
    if (a.action === 'link_batch') return `${d.order_id || ''} · ${d.amount != null ? U.money(d.amount) : ''}`;
    if (a.action === 'sync' && d.merge) return Object.entries(d.merge).map(([k, v]) => `${k}: +${v.inserted} new, ${v.updated} updated`).join(' · ');
    if (a.action === 'settings') return d.key || '';
    return Object.keys(d).length ? JSON.stringify(d) : '';
  },
  async fetch() {
    try { this.rows = await API.call('dw_get_activity', { p_contract: null, p_limit: 1500 }) || []; this.filter(); }
    catch (e) { Toast.err('Could not load activity', e.message); }
  },
  filter() { if (!State.tables.activity) return; const a = State.ui.activity.action; State.tables.activity.setRows((this.rows || []).filter(r => !a || r.action === a)); }
};

/* =====================================================================
   Drawer — customer / contract 360° side panel
   ===================================================================== */
const Drawer = {
  no: null, tab: 'overview', activity: null,
  open(no) {
    const r = App.model && App.model.byNo.get(+no);
    if (!r) return Toast.warn('Contract not found in waiver data');
    if (this.no !== +no) { this.tab = 'overview'; this.activity = null; }
    this.no = +no;
    this.render();
    $('#scrim').hidden = false;
    requestAnimationFrame(() => $('#drawer').classList.add('open'));
    $('#drawer').setAttribute('aria-hidden', 'false');
    this.loadActivity();
  },
  close() {
    $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true');
    $('#scrim').hidden = true;
  },
  async loadActivity() {
    const no = this.no;
    try {
      const [a, ch] = await Promise.all([API.call('dw_get_activity', { p_contract: no, p_limit: 300 }), API.call('dw_get_changes', { p_batch: null, p_contract: no, p_limit: 300 }).catch(() => [])]);
      if (no === this.no) { this.activity = a || []; this.changes = ch || []; this.render(); }
    } catch (e) { this.activity = []; this.changes = []; }
  },
  render() {
    const r = App.model.byNo.get(this.no);
    if (!r) return this.close();
    const g = App.model.settings.general, cur = g.currency, k = r.case || {};
    const d = $('#drawer');
    const nRem = (this.activity || []).filter(a => a.action === 'remark').length || (k.remark_count || 0);
    const tabs = [['overview', 'Overview'], ['remarks', 'Remarks', nRem], ['cardoo', 'Cardoo', r.bookings.length + r.claims.length], ['payments', 'Payments', r.payments.length], ['timeline', 'Timeline', this.activity ? this.activity.length : '']];
    d.innerHTML = `
      <div class="dr-head">
        <button class="icon-btn ghost close" id="drClose">${icon('x')}</button>
        <div class="dr-id"><span class="avatar">${U.esc(U.initials(r.name))}</span>
          <div><h2>${U.esc(r.name)}</h2><p><span class="cno">#${r.contract_no}</span>·<span>${U.esc(r.vehicle)}</span>${r.source_tag ? `<span class="tag">${U.esc(r.source_tag)}</span>` : ''}</p></div></div>
        <div class="dr-chips">${R.status(r.status)}${R.stage(r.stage)}${R.booking(r)}${r.claim_state ? R.claimChip(r.claim_state) : ''}${r.flags.map(x => `<span class="flag t-${x.tone}">${U.esc(x.t)}</span>`).join('')}</div>
        <div class="dr-actions">
          <button class="btn btn-sm btn-wa" id="drWa" ${r.phone ? '' : 'disabled'}>${icon('whatsapp')}WhatsApp</button>
          <button class="btn btn-sm" id="drCopy">${icon('copy')}Copy message</button>
          <button class="btn btn-sm" id="drRemark">${icon('note')}Remark</button>
          ${r.phone ? `<a class="btn btn-sm" href="tel:+${r.phone}" id="drCall">${icon('phone')}Call</a>` : ''}
          ${r.email ? `<a class="btn btn-sm" href="mailto:${U.esc(r.email)}?subject=${encodeURIComponent(`Outstanding balance - rental agreement #${r.contract_no}`)}&body=${encodeURIComponent(Engine.fillTemplate((App.model.settings.templates[0] || {}).body || '', r, App.model.settings).replace(/\*/g, ''))}">${icon('mail')}Email</a>` : ''}
          <div class="dd" data-dd><button class="btn btn-sm">${icon('pdf')}PDF</button><div class="dd-menu">
            <button id="drStmt">${icon('receipt')}Customer statement</button><button id="drPack">${icon('file-check')}Cardoo claim pack</button></div></div>
        </div>
      </div>
      <div class="dr-tabs">${tabs.map(([id, l, n]) => `<button class="${this.tab === id ? 'on' : ''}" data-tab="${id}">${l}${n !== undefined && n !== '' ? `<i>${n}</i>` : ''}</button>`).join('')}</div>
      <div class="dr-body">${this['tab_' + this.tab](r, g, cur, k)}</div>`;
    $('#drClose').addEventListener('click', () => this.close());
    $$('.dr-tabs button', d).forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.render(); }));
    $('#drWa').addEventListener('click', () => Actions.compose(r));
    $('#drCopy').addEventListener('click', () => Actions.copyMessage(r));
    $('#drRemark').addEventListener('click', () => { this.tab = 'remarks'; this.render(); setTimeout(() => { const t = $('#rmText'); if (t) t.focus(); }, 30); });
    $('#drStmt').addEventListener('click', () => Actions.statement(r));
    $('#drPack').addEventListener('click', () => Actions.claimPack(r));
    const call = $('#drCall'); if (call) call.addEventListener('click', () => Actions.logCall(r));
    d.querySelector('[data-dd] > .btn').addEventListener('click', e => { e.stopPropagation(); e.currentTarget.parentElement.classList.toggle('open'); });
    this.bind(r, d);
  },
  tab_overview(r, g, cur, k) {
    const today = U.todayISO();
    return `
      <div class="money-grid">
        <div class="money ${r.outstanding > 0 ? 'hl' : 'ok'}"><small>Outstanding (ledger)</small><b>${U.money(r.outstanding)}</b></div>
        <div class="money"><small>Cardoo cover</small><b>${r.booking_state === 'active' ? U.money(r.coverage) : '—'}</b></div>
        <div class="money"><small>Claimable</small><b style="color:var(--amber)">${U.money(r.claimable)}</b></div>
        <div class="money"><small>Waiver fee charged</small><b>${U.money(r.waiver_amount)}</b></div>
        <div class="money"><small>Rent paid (receipts)</small><b>${U.money(r.rent_paid)}</b></div>
        <div class="money"><small>Contract balance</small><b>${r.contract_balance == null ? '—' : U.money(r.contract_balance)}</b></div>
      </div>
      ${r.status === 'Closed' && r.outstanding > 0 ? `<div class="notice ${r.stage === 'ready_to_claim' ? 'amber' : r.booking_state !== 'active' ? 'rose' : ''}">${icon('info')}<span><b>${STAGES[r.stage].label}:</b> ${STAGES[r.stage].hint}.${r.uncovered > 0 && r.booking_state === 'active' ? ` ${cur} ${U.money(r.uncovered)} is above the Cardoo cover and must be collected directly.` : ''}</span></div>` : ''}
      ${r.remark || r.remark_cat ? `<div class="rm-item"><div class="meta">${r.remark_cat ? `<span class="tag">${U.esc(r.remark_cat)}</span>` : ''}<span>Last remark · ${U.esc(k.last_remark_by || '')} · ${U.fmtTS(r.remark_at)}</span></div>${U.esc(r.remark || '')}</div>` : ''}
      <div class="panel">
        <h4>${icon('wallet')}Collection workflow<span class="spacer"></span>${k.updated_by ? `<span class="small muted" style="text-transform:none;letter-spacing:0;font-weight:600">updated by ${U.esc(k.updated_by)} · ${U.fmtTS(k.updated_at)}</span>` : ''}</h4>
        <div class="grid" style="gap:12px">
          <label class="field"><span>Payment link</span><div class="inline-form"><input class="input" id="fLink" placeholder="https://…" value="${U.esc(k.payment_link || '')}">
            <button class="btn" id="fLinkSave">${icon('check')}Save</button>${k.payment_link ? `<a class="icon-btn" href="${U.esc(k.payment_link)}" target="_blank" rel="noopener" title="Open link">${icon('external')}</a>` : ''}</div></label>
          ${R.phoneField(r, k)}
          <div class="form-grid" style="grid-template-columns:1fr 1fr">
            <label class="field"><span>Promise to pay on</span><input class="input" type="date" id="fPromise" value="${k.promise_date || ''}" min="${today}"></label>
            <label class="field"><span>Claim submitted on</span><input class="input" type="date" id="fClaimed" value="${k.claim_submitted_at || ''}"></label>
          </div>
          <label class="field"><span>Notes (general)</span><textarea class="input" id="fNotes" placeholder="Conversation notes, disputes, agreements…">${U.esc(k.notes || '')}</textarea></label>
          <div class="btn-group">
            <button class="btn btn-primary btn-sm" id="fSave">${icon('check')}Save changes</button>
            <button class="btn btn-sm" id="fCall">${icon('phone')}Log a call</button>
            <button class="btn btn-sm" id="fHold">${icon('pause')}${k.on_hold ? 'Resume' : 'Put on hold'}</button>
            ${k.paid_marked_at ? `<button class="btn btn-sm" id="fUnpaid">Undo “paid”</button>` : `<button class="btn btn-sm" id="fPaid">${icon('check')}Mark paid</button>`}
          </div>
          <p class="small muted">Contacted <b>${r.contact_count}×</b>${k.first_contact_at ? ` · first ${U.fmtTS(k.first_contact_at)}` : ''}${k.last_contact_at ? ` · last ${U.fmtTS(k.last_contact_at)}` : ''}</p>
        </div>
      </div>
      <div class="panel"><h4>${icon('doc')}Contract</h4>
        <dl class="kv">
          <dt>Customer</dt><dd>${U.esc(r.name)}${r.name_waiver && Engine.nameKey(r.name_waiver) !== Engine.nameKey(r.name) ? `<br><small class="muted">Waiver report: ${U.esc(r.name_waiver)}</small>` : ''}</dd>
          <dt>Original (waiver)</dt><dd class="mono small">${U.esc(r.waiver.raw_customer || '')} · ${U.esc(r.waiver.raw_contract || '')}</dd>
          <dt>Email</dt><dd>${r.email ? `<a href="mailto:${U.esc(r.email)}">${U.esc(r.email)}</a>` : '—'}</dd>
          <dt>Vehicle / plate</dt><dd>${U.esc(r.vehicle)} ${r.plate ? `<span class="tag">${U.esc(r.plate)}</span>` : ''}</dd>
          <dt>Pick-up</dt><dd>${U.fmtDT(r.pickup_at) || U.fmtDate(r.open_date)}</dd>
          <dt>Drop-off</dt><dd>${U.fmtDT(r.dropoff_at) || '—'}</dd>
          <dt>Caryaati open / close</dt><dd>${U.fmtDate(r.open_date)} → ${r.close_date ? U.fmtDate(r.close_date) : '<span class="chip t-sky">open</span>'}</dd>
          <dt>Waiver cover (Cardoo)</dt><dd>${r.booking_state === 'active'
            ? `${U.fmtDT(r.booking_start)} → ${U.fmtDT(r.cover_end_at || r.booking_close || r.booking_end)}${r.days_since_close != null && r.cover_end_src === 'cardoo' ? ` <span class="muted">(${R.ago(r.days_since_close)})</span>` : ''}${r.cover_end_diff != null && r.cover_end_diff !== 0 ? ` <span class="tag" title="Cardoo booking end vs Caryaati close">${r.cover_end_diff > 0 ? '+' : ''}${r.cover_end_diff}d vs Caryaati</span>` : ''}${r.cover_end_src === 'caryaati' && r.cover_end_diff != null ? `<br><small class="muted">Booking runs ${r.cover_end_diff}d past the Caryaati close — claim window counted from the Caryaati close; close the booking in Cardoo.</small>` : ''}`
            : R.booking(r)}</dd>
          <dt>Rental type</dt><dd>${U.esc(r.rental_type || '—')}${r.days ? ` · ${r.days} days` : ''}</dd>
          ${r.contract ? `<dt>Charges</dt><dd class="mono small">Rent ${U.money(r.contract.rent)} · Salik ${U.money(r.contract.salik)} · Fines ${U.money(r.contract.fine)} · Other ${U.money(r.contract.other_charges)} · VAT ${U.money(r.contract.vat)}</dd>
          <dt>Total / paid</dt><dd class="mono small">${U.money(r.contract.total_amount)} / ${U.money(r.contract.paid_amount)} → balance ${U.money(r.contract.balance)}</dd>` : '<dt>Contracts report</dt><dd class="pos">Not found in Rental Contracts report</dd>'}
          ${r.claim_deadline && r.status === 'Closed' ? `<dt>Claim window</dt><dd>${U.fmtDate(r.claim_deadline)} <span class="muted">(${r.days_to_deadline < 0 ? `passed ${-r.days_to_deadline}d ago` : `${r.days_to_deadline}d left`} · ${g.claim_deadline_days || 60} days from ${r.cover_end_src === 'cardoo' ? 'Cardoo booking end' : 'Caryaati close'})</span></dd>` : ''}
        </dl></div>`;
  },
  tab_remarks(r, g) {
    const cats = g.remark_categories || [];
    const list = (this.activity || []).filter(a => a.action === 'remark' || a.action === 'call');
    return `<div class="panel"><h4>${icon('note')}Add remark</h4>
        <div class="grid" style="gap:10px">
          <div class="tpl-tabs" id="rmCats">${cats.map(c => `<button data-c="${U.esc(c)}">${U.esc(c)}</button>`).join('')}</div>
          <textarea class="input" id="rmText" placeholder="Write a remark about this customer…" style="min-height:80px"></textarea>
          <div><button class="btn btn-primary btn-sm" id="rmSave">${icon('check')}Save remark</button></div>
        </div></div>
      <div class="panel"><h4>${icon('clock')}Remarks &amp; call notes</h4>
        ${this.activity === null ? '<div class="skeleton" style="height:50px"></div>' : list.length ? `<div class="grid" style="gap:8px">${list.map(a => { const d = a.details || {}; return `<div class="rm-item"><div class="meta">${d.category ? `<span class="tag">${U.esc(d.category)}</span>` : a.action === 'call' ? '<span class="tag">Call</span>' : ''}<span>${U.esc(a.username)} · ${U.fmtTS(a.created_at)}</span></div>${U.esc(d.text || d.note || '')}</div>`; }).join('')}</div>` : '<p class="muted small">No remarks yet.</p>'}
        ${r.case && r.case.notes ? `<div class="rm-item mt-sm"><div class="meta"><span class="tag">Notes</span></div>${U.esc(r.case.notes)}</div>` : ''}</div>`;
  },
  tab_cardoo(r, g, cur) {
    const syncTxt = { both_closed: 'Closed in both', caryaati_only: 'Closed in Caryaati · still open in Cardoo', cardoo_only: 'Closed in Cardoo · still open in Caryaati', both_open: 'Open in both', no_booking: 'No Cardoo booking' }[r.close_sync];
    const syncTone = { both_closed: r.close_diff_days ? 'amber' : 'green', caryaati_only: 'amber', cardoo_only: 'rose', both_open: 'sky', no_booking: 'rose' }[r.close_sync];
    const cmp = `<div class="panel"><h4>${icon('swap')}Caryaati vs Cardoo<span class="spacer"></span><span class="chip t-${syncTone}" style="text-transform:none;letter-spacing:0">${syncTxt}</span></h4>
      <table class="ledger"><tr><td>Caryaati status</td><td>${r.status}</td></tr>
      <tr><td>Caryaati closed</td><td>${r.close_date ? (String(r.caryaati_close_at).length > 10 ? U.fmtDT(r.caryaati_close_at) : U.fmtDate(r.close_date)) : '—'}</td></tr>
      <tr><td>Cardoo booking period</td><td>${r.booking_start ? `${U.fmtDate(r.booking_start)} → ${U.fmtDate(r.booking_end)}` : '—'}</td></tr>
      <tr><td>Cardoo closed</td><td>${r.cardoo_close_at ? U.fmtDT(r.cardoo_close_at) : r.cardoo_status === 'open' ? 'not closed' : '—'}</td></tr>
      ${r.close_diff_days ? `<tr><td>Difference</td><td class="${r.close_diff_days > 0 ? 'diff-pos' : 'diff-neg'}">${r.close_diff_days > 0 ? '+' : ''}${r.close_diff_days} days</td></tr>` : ''}
      ${r.claim_deadline ? `<tr><td>Claim window (${g.claim_deadline_days} days)</td><td>${U.fmtDate(r.claim_deadline)} · ${r.days_to_deadline < 0 ? `expired ${-r.days_to_deadline}d ago` : `${r.days_to_deadline}d left`}</td></tr>` : ''}</table></div>`;
    const bl = (App.model.cardoo ? App.model.cardoo.lines : []).filter(l => +l.contract_no === r.contract_no).sort((a, b) => String(b.po_no).localeCompare(String(a.po_no)));
    const billed = bl.length ? `<div class="panel"><h4>${icon('receipt')}Charged by Cardoo (invoices)<span class="spacer"></span><span class="mono" style="text-transform:none">AED ${U.money(U.sum(bl, l => l.price_aed))}</span></h4>
      <table class="ledger">${bl.map(l => `<tr><td>${U.esc(l.po_no)} · ${U.esc(l.booking_type || '')}${l._flags.length ? ' ' + l._flags.map(f => `<span class="flag t-${/Credit/.test(f) ? 'green' : 'rose'}">${f}</span>`).join(' ') : ''}<span class="cell-sub">${(App.model.cardoo.invByPo.get(l.po_no) || {}).period_from ? U.fmtDate(App.model.cardoo.invByPo.get(l.po_no).period_from) + ' → ' + U.fmtDate(App.model.cardoo.invByPo.get(l.po_no).period_to) : ''}</span></td><td>${U.money(l.price_aed)}</td></tr>`).join('')}</table>
      <p class="small muted mt-sm">Waiver fee charged to customer: AED ${U.money(r.waiver_amount)} · Cardoo charged so far: AED ${U.money(U.sum(bl, l => l.price_aed))}</p></div>` : '';
    return cmp + billed + `<div class="panel"><h4>${icon('shield')}Cardoo bookings</h4>${r.bookings.length ? `<div class="mini-list">${r.bookings.map(b => `<div class="mini-item">
        <div class="grow"><b>${U.esc(b.booking_type || 'Booking')} ${b.contract_variant ? `<span class="tag">${U.esc(b.contract_variant)}</span>` : ''}</b>
        <div class="small muted">${U.fmtDT(b.start_at)} → ${U.fmtDT(b.end_at)}${b.close_at ? ` · closed ${U.fmtDT(b.close_at)}` : ' · not closed'}</div>
        <div class="small muted">Booked ${U.fmtDT(b.booked_at)} by ${U.esc(b.user_label || '')}${b.comment ? ` · ${U.esc(b.comment)}` : ''}</div></div>
        <div class="right"><b class="mono">${cur} ${U.money(b.deposit_covered)}</b><div class="small muted">fee ${U.money(Engine.bookingFee(b))}</div>${b.cancelled ? '<span class="chip sm t-rose">Cancelled</span>' : '<span class="chip sm t-teal">Active</span>'}</div></div>`).join('')}</div>`
      : `<div class="notice rose">${icon('alert')}<span>No Cardoo booking for this contract. ${r.status === 'Open' ? 'Register it in Cardoo so the deposit is covered.' : 'Any outstanding must be collected directly.'}</span></div>`}</div>
      <div class="panel"><h4>${icon('file-check')}Cardoo claims</h4>${r.claims.length ? `<div class="mini-list">${r.claims.map(c => `<div class="mini-item" style="align-items:flex-start">
        <div class="grow"><b>${U.esc(c.title)}</b><div class="small muted">Claimed ${U.fmtDate(c.claim_date)} · deposit ${U.money(c.deposit_amount)}</div>
        ${c.last_comment ? `<div class="small" style="margin-top:6px;color:var(--text-2)">💬 ${U.esc(c.last_comment)}</div>` : ''}</div>
        <div class="right"><div class="mono"><b>${U.money(c.excess_sum)}</b></div>${c.approved_amount != null ? `<div class="small" style="color:var(--green)">approved ${U.money(c.approved_amount)}</div>` : ''}${R.claimChip(c.status)}${(() => { const k = App.model.cardoo && App.model.cardoo.claimByKey.get(c.row_key); return k ? `<div class="small" style="margin-top:4px"><span class="chip sm t-${Views.cardoo.claimTone(k.state)}">${k.state}</span>${k.how ? ' ' + U.esc(k.how) : ''}${k.received_on ? ' · ' + U.fmtDate(k.received_on) : ''}</div>` : ''; })()}</div></div>`).join('')}</div>`
      : `<p class="muted">No claim submitted yet.${r.stage === 'ready_to_claim' ? ' This contract is <b>ready to claim</b>.' : ''}</p>`}
      <div class="btn-group mt-sm"><button class="btn btn-sm" id="drPack2">${icon('pdf')}Claim pack PDF</button><button class="btn btn-sm" id="drClaimTxt">${icon('copy')}Copy claim details</button>
      ${(!r.claims.length || !r.claim_live) && r.status === 'Closed' ? `<button class="btn btn-sm btn-primary" id="drSubmitted">${icon('send')}${r.case && r.case.claim_submitted_at ? 'Edit submission' : 'Submit claim'}</button>` : ''}
      ${r.case && r.case.claim_submitted_at ? `<p class="small muted mt-sm">Submitted ${U.fmtDate(r.case.claim_submitted_at)} · ${U.money(r.case.claim_amount)} · ${r.submitted_days != null ? r.submitted_days + 'd waiting for the Excess report' : ''}</p>` : ''}</div></div>`;
  },
  tab_payments(r, g, cur) {
    return `<div class="panel"><h4>${icon('receipt')}Rent payments received<span class="spacer"></span><span class="mono" style="text-transform:none">${cur} ${U.money(r.rent_paid)}</span></h4>
      ${r.payments.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Receipt</th><th class="right">Amount</th><th class="right">VAT</th><th class="right">Total</th></tr></thead><tbody>
      ${r.payments.map(p => `<tr><td>${U.fmtDate(p.invoice_date)}</td><td class="mono small">${U.esc(p.invoice_no)}</td><td class="right amt">${U.money(p.invoice_amount)}</td><td class="right amt">${U.money(p.vat)}</td><td class="right amt"><b>${U.money(p.net_amount)}</b></td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">No rent receipts found for this contract in the payment report.</p>'}</div>`;
  },
  tab_timeline(r) {
    const ev = [];
    ev.push({ at: r.pickup_at || r.open_date, t: 'Contract opened', s: r.vehicle, tone: '--sky' });
    r.bookings.forEach(b => ev.push({ at: b.booked_at, t: `Cardoo booking${b.cancelled ? ' (cancelled)' : ''}`, s: `${b.booking_type || ''} · cover ${U.money(b.deposit_covered)}`, tone: b.cancelled ? '--rose' : '--teal' }));
    r.payments.forEach(p => ev.push({ at: p.invoice_date, t: `Payment ${p.invoice_no}`, s: U.money(p.net_amount), tone: '--green' }));
    if (r.close_date) ev.push({ at: r.dropoff_at || r.close_date, t: 'Contract closed', s: `Outstanding ${U.money(r.outstanding)}`, tone: '--slate' });
    r.claims.forEach(c => ev.push({ at: c.claim_date, t: `Claim · ${c.status}`, s: `Excess ${U.money(c.excess_sum)}${c.approved_amount != null ? ` · approved ${U.money(c.approved_amount)}` : ''}`, tone: '--amber' }));
    (this.activity || []).filter(a => a.action !== 'login').forEach(a => ev.push({ at: a.created_at, ts: true, t: (Views.activity.labels[a.action] || [a.action])[0] + ` · ${a.username}`, s: Views.activity.describe(a), msg: a.details && a.details.message, tone: a.action === 'whatsapp' ? '--wa' : '--indigo' }));
    (this.changes || []).forEach(c => ev.push({ at: c.created_at, ts: true, t: `Report update · ${c.tbl} · ${c.field.replace(/_/g, ' ')}`, s: `${Views.import.fmtVal(c.old_value)} → ${Views.import.fmtVal(c.new_value)}`, tone: '--amber' }));
    const key = e => e.ts ? new Date(e.at).getTime() / 86400000 : (U.dayFrac(e.at) || 0) - 4 / 24;
    ev.sort((a, b) => key(b) - key(a));
    return `<div class="panel"><h4>${icon('clock')}Timeline</h4>${this.activity === null ? '<div class="skeleton" style="height:60px"></div>' : ''}
      <div class="timeline">${ev.filter(e => e.at).map(e => `<div class="tl" style="--t:var(${e.tone})"><b>${U.esc(e.t)}</b><small>${e.ts ? U.fmtTS(e.at) : (String(e.at).length > 10 ? U.fmtDT(e.at) : U.fmtDate(e.at))}${e.s ? ' · ' + U.esc(e.s) : ''}</small>${e.msg ? `<div class="msg">${U.esc(e.msg)}</div>` : ''}</div>`).join('')}</div></div>`;
  },
  bind(r, d) {
    const no = r.contract_no;
    const on = (id, fn) => { const el = $(id, d); if (el) el.addEventListener('click', fn); };
    on('#fLinkSave', () => { const v = $('#fLink', d).value.trim(); if (v && !/^https?:\/\//i.test(v)) Toast.warn('Payment link should start with https://'); App.saveCase(no, { payment_link: v }, 'Payment link saved'); });
    R.phoneBind(d, r);
    on('#fSave', () => App.saveCase(no, { promise_date: $('#fPromise', d).value, claim_submitted_at: $('#fClaimed', d).value, notes: $('#fNotes', d).value, payment_link: $('#fLink', d).value.trim() }, 'Changes saved'));
    on('#fCall', () => Actions.logCall(r));
    on('#fHold', () => App.saveCase(no, { on_hold: !(r.case && r.case.on_hold) }, r.case && r.case.on_hold ? 'Resumed' : 'Put on hold'));
    on('#fPaid', async () => { if (await Modal.confirm('Mark as paid?', `This hides #${no} from the collection queue until the next Deposit Waivers report confirms the balance.`, 'Mark paid')) App.saveCase(no, { paid_marked_at: U.todayISO() }, 'Marked as paid'); });
    on('#fUnpaid', () => App.saveCase(no, { paid_marked_at: '' }, 'Paid mark removed'));
    on('#drPack2', () => Actions.claimPack(r));
    on('#drClaimTxt', () => Actions.copyClaim(r));
    on('#drSubmitted', () => Actions.markSubmitted([r]));
    let cat = '';
    $$('#rmCats button', d).forEach(b => b.addEventListener('click', () => { cat = cat === b.dataset.c ? '' : b.dataset.c; $$('#rmCats button', d).forEach(x => x.classList.toggle('on', x.dataset.c === cat)); }));
    on('#rmSave', async () => { const t = $('#rmText', d).value.trim(); if (!t && !cat) return Toast.warn('Write a remark or pick a category'); await Actions.saveRemark(no, t, cat); });
  }
};

/* =====================================================================
   Actions — WhatsApp, copy, claims, PDFs
   ===================================================================== */
const Actions = {
  tplId: null,
  async saveRemark(no, text, cat) {
    try {
      const k = await API.call('dw_add_remark', { p_contract: no, p_text: text, p_category: cat || null });
      App.patchCase(k); Toast.ok('Remark saved');
      if (Drawer.no === no) Drawer.loadActivity();
      return k;
    } catch (e) { Toast.err('Could not save remark', e.message); }
  },
  remark(r) {
    const cats = App.model.settings.general.remark_categories || [];
    let cat = '';
    Modal.open({ title: 'Add remark', sub: `#${r.contract_no} · ${U.esc(r.name)}`, size: 'narrow',
      body: `<div class="tpl-tabs" id="qrCats">${cats.map(c => `<button data-c="${U.esc(c)}">${U.esc(c)}</button>`).join('')}</div>
        <textarea class="input" id="qrText" placeholder="Remark…" style="min-height:90px"></textarea>
        ${r.remark ? `<div class="rm-item"><div class="meta">Previous · ${U.fmtTS(r.remark_at)}</div>${U.esc(r.remark)}</div>` : ''}`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="qrSave">${icon('check')}Save</button>`,
      onOpen: m => {
        $$('#qrCats button', m).forEach(b => b.addEventListener('click', () => { cat = cat === b.dataset.c ? '' : b.dataset.c; $$('#qrCats button', m).forEach(x => x.classList.toggle('on', x.dataset.c === cat)); }));
        $('#qrSave', m).addEventListener('click', async () => {
          const t = $('#qrText', m).value.trim(); if (!t && !cat) return Toast.warn('Write a remark or pick a category');
          Modal.close(); await this.saveRemark(r.contract_no, t, cat);
        });
      } });
  },

  /** Provider batch CSV (eInvoice batch upload) for selected customers */
  linkBatch(rows, auto) {
    const g = App.model.settings.general, cur = g.currency;
    rows = rows.filter(r => r && r.due > 0);
    if (!rows.length) return Toast.warn('No customers with an outstanding balance in the selection');
    const st = { orderName: g.link_order_name || 'Outstanding Balance', message: g.link_message || 'Please pay the amount.', days: +g.link_expiry_days || 5, time: g.link_expiry_time || '15:00:00', skipLinked: true, amounts: {}, infos: {}, excl: new Set() };
    Modal.open({
      title: `${icon('download')} Payment-link batch CSV`, size: 'wide',
      sub: `${rows.length} customer(s)${auto ? ' — all customers in the current list without a payment link' : ' selected'} · upload the file to your payment-link provider, then import the generated links back`,
      body: `<div class="form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
          <label class="field"><span>OrderName</span><input class="input" id="lbName" value="${U.esc(st.orderName)}"></label>
          <label class="field"><span>Message</span><input class="input" id="lbMsg" value="${U.esc(st.message)}"></label>
          <label class="field"><span>Link expires after (days)</span><input class="input" type="number" min="1" id="lbDays" value="${st.days}"></label>
          <label class="field"><span>Expiry time</span><input class="input" id="lbTime" value="${U.esc(st.time)}" placeholder="15:00:00"></label>
        </div>
        <div class="toolbar"><label class="check"><input type="checkbox" id="lbSkip" checked><span></span>Skip customers who already have a payment link</label><span class="spacer"></span><span class="small muted" id="lbSum"></span></div>
        <div class="dt-scroll card" style="max-height:340px"><table class="tbl"><thead><tr><th class="cb"></th><th>OrderID</th><th>Customer</th><th>Mobile</th><th>Email</th><th>OrderInfo</th><th class="right">Amount (${cur})</th><th>Expiry</th></tr></thead><tbody id="lbBody"></tbody></table></div>
        <div id="lbWarn"></div>`,
      foot: `<span class="small muted">Format: OrderID, OrderName, OrderInfo, Amount, Currency, EffectiveStartDate, ExpiryDate, CardHolderName, CardHolderEmail, CardHolderMobile, Language, InvoiceType, Message</span><span class="spacer"></span>
        <button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="lbGo">${icon('download')}Download CSV</button>`,
      onOpen: m => {
        const list = () => rows.filter(r => !(st.skipLinked && r.payment_link));
        const exp = () => Engine.linkExpiry(Object.assign({}, g, { link_expiry_days: st.days, link_expiry_time: st.time }));
        const build = () => list().filter(r => !st.excl.has(r.contract_no)).map(r => ({ r, row: Engine.linkRow(r, g, { orderName: st.orderName, message: st.message, expiry: exp(), amount: st.amounts[r.contract_no], orderInfo: st.infos[r.contract_no] }) }));
        const draw = () => {
          const L = list(), ex = exp();
          $('#lbBody', m).innerHTML = L.map(r => { const row = Engine.linkRow(r, g, { expiry: ex, amount: st.amounts[r.contract_no], orderInfo: st.infos[r.contract_no] }); const off = st.excl.has(r.contract_no);
            return `<tr style="${off ? 'opacity:.45' : ''}"><td class="cb"><label class="check"><input type="checkbox" data-inc="${r.contract_no}" ${off ? '' : 'checked'}><span></span></label></td>
              <td class="mono small">${row.OrderID}</td><td><span class="cell-main">${U.esc(row.CardHolderName)}</span>${r.payment_link ? '<span class="cell-sub" style="color:var(--green)">has link</span>' : r.link_batch_at ? `<span class="cell-sub">requested ${U.fmtDate(new Date(r.link_batch_at))}</span>` : ''}</td>
              <td class="mono small">${row.CardHolderMobile || '<span class="pos">missing</span>'}</td><td class="small">${U.esc(row.CardHolderEmail) || '<span class="pos">missing</span>'}</td>
              <td><input class="link-input" style="width:150px" data-info="${r.contract_no}" value="${U.esc(row.OrderInfo)}"></td>
              <td class="right"><input class="link-input mono" style="width:90px;text-align:right" type="number" step="0.01" data-amt="${r.contract_no}" value="${row.Amount}"></td><td class="mono small nowrap">${row.ExpiryDate}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted" style="padding:20px;text-align:center">Nothing to include.</td></tr>';
          const B = build();
          $('#lbSum', m).textContent = `${B.length} rows · total ${cur} ${U.money(U.sum(B, x => +x.row.Amount))}`;
          const noMob = B.filter(x => !x.row.CardHolderMobile).length, noMail = B.filter(x => !x.row.CardHolderEmail).length;
          $('#lbWarn', m).innerHTML = noMob || noMail ? `<div class="notice amber">${icon('alert')}<span>${noMob ? `${noMob} without mobile` : ''}${noMob && noMail ? ' · ' : ''}${noMail ? `${noMail} without email` : ''} — the provider may reject those rows.</span></div>` : '';
          $('#lbGo', m).disabled = !B.length;
        };
        $('#lbName', m).addEventListener('input', e => { st.orderName = e.target.value; });
        $('#lbMsg', m).addEventListener('input', e => { st.message = e.target.value; });
        $('#lbDays', m).addEventListener('input', e => { st.days = Math.max(1, +e.target.value || 1); draw(); });
        $('#lbTime', m).addEventListener('change', e => { st.time = e.target.value.trim(); draw(); });
        $('#lbSkip', m).addEventListener('change', e => { st.skipLinked = e.target.checked; draw(); });
        $('#lbBody', m).addEventListener('change', e => {
          const t = e.target;
          if (t.dataset.inc) { t.checked ? st.excl.delete(+t.dataset.inc) : st.excl.add(+t.dataset.inc); draw(); }
          if (t.dataset.amt) { st.amounts[+t.dataset.amt] = +t.value; draw(); }
          if (t.dataset.info) { st.infos[+t.dataset.info] = t.value; }
        });
        draw();
        $('#lbGo', m).addEventListener('click', async () => {
          const B = build(); if (!B.length) return;
          const csv = Engine.csv(B.map(x => x.row), Engine.LINK_COLUMNS);
          const d = new Date(), stamp = `${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}-${d.getFullYear()}`;
          Exporter.download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `eInvoice_Batch_Upload-${stamp}.csv`);
          Modal.close();
          Toast.ok(`Batch CSV with ${B.length} customers downloaded`, 'Upload it to the payment-link provider');
          try {
            const ks = await API.call('dw_mark_link_batch', { p_items: B.map(x => ({ contract_no: x.r.contract_no, amount: +x.row.Amount, order_id: x.row.OrderID })) });
            (ks || []).forEach(k => { const list2 = State.ds.cases || (State.ds.cases = []); const i = list2.findIndex(y => +y.contract_no === +k.contract_no); if (i >= 0) list2[i] = k; else list2.push(k); });
            App.rebuild(true);
          } catch (e) { Toast.warn('CSV downloaded, but could not record the batch', e.message); }
        });
      }
    });
  },
  templates() { return App.model.settings.templates; },
  pickTemplate(r) {
    const t = this.templates();
    if (this.tplId && t.find(x => x.id === this.tplId)) return this.tplId;
    const n = r.contact_count || 0;
    return (t[Math.min(n, t.length - 1)] || t[0] || {}).id;
  },
  message(r, tplId) {
    const t = this.templates().find(x => x.id === tplId) || this.templates()[0];
    return Engine.fillTemplate(t ? t.body : '', r, App.model.settings);
  },
  async copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* */ } ta.remove(); return ok;
    }
  },
  async copyMessage(r) {
    const txt = this.message(r, this.pickTemplate(r));
    if (await this.copy(txt)) Toast.ok('Message copied', r.payment_link ? '' : 'Note: no payment link set yet'); else Toast.err('Copy failed');
  },
  async copyMany(rows) {
    const txt = rows.map(r => `━━ #${r.contract_no} · ${r.name} · +${r.phone || '—'}\n${this.message(r, this.pickTemplate(r))}`).join('\n\n');
    if (await this.copy(txt)) Toast.ok(`${rows.length} messages copied`);
  },
  logCall(r) {
    Modal.open({ title: 'Log a call', sub: `#${r.contract_no} · ${U.esc(r.name)}`, size: 'narrow',
      body: `<label class="field"><span>Outcome / note</span><textarea class="input" id="callNote" placeholder="e.g. Will pay on Thursday, asked for invoice copy…"></textarea></label>
        <label class="field"><span>Promise to pay on (optional)</span><input class="input" type="date" id="callPromise" min="${U.todayISO()}"></label>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="callSave">${icon('check')}Save</button>`,
      onOpen: m => $('#callSave', m).addEventListener('click', async () => {
        const note = $('#callNote', m).value.trim(), pd = $('#callPromise', m).value;
        await App.logActivity(r.contract_no, 'call', { note });
        if (pd) await App.saveCase(r.contract_no, { promise_date: pd });
        Modal.close(); Toast.ok('Call logged'); if (Drawer.no === r.contract_no) Drawer.loadActivity();
      }) });
  },

  /** Single WhatsApp composer with live preview */
  compose(r) {
    const tpls = this.templates();
    let tplId = this.pickTemplate(r);
    let custom = null;
    const k = r.case || {};
    Modal.open({
      title: `${icon('whatsapp')} WhatsApp · ${U.esc(r.name)}`, sub: `#${r.contract_no} · due <b>${App.model.settings.general.currency} ${U.money(r.due)}</b>${r.due !== r.outstanding ? ` (ledger ${U.money(r.outstanding)})` : ''} · contacted ${r.contact_count}×`, size: 'wide',
      body: `<div class="grid g-2" style="gap:18px;align-items:start">
        <div class="grid" style="gap:12px">
          <div class="tpl-tabs" id="waTpl">${tpls.map(t => `<button data-t="${t.id}" class="${t.id === tplId ? 'on' : ''}">${U.esc(t.name)}</button>`).join('')}</div>
          <label class="field"><span>Phone (WhatsApp)</span><input class="input mono" id="waPhone" value="${U.esc(r.phone ? '+' + r.phone : '')}" placeholder="${r.phone_kind === 'nocc' ? `+<country code> ${U.esc(r.phone_raw)}` : '+9715…'}">${!r.phone && r.phone_kind === 'nocc' ? `<small style="color:var(--amber)">Report number ${U.esc(r.phone_raw)} has no country code${(r.phone_suggest || [])[0] ? ` — likely +${r.phone_suggest[0].cc} ${U.esc(r.phone_suggest[0].name)}` : ''}. Type it with + and the country code.</small>` : ''}</label>
          <label class="field"><span>Payment link ${r.payment_link ? '<span class="flag t-green">saved</span>' : '<span class="flag t-amber">missing</span>'}</span><input class="input" id="waLink" value="${U.esc(k.payment_link || '')}" placeholder="Paste the customer's payment link"></label>
          <label class="field"><span>Message <small class="muted">(edit freely — *bold* works in WhatsApp)</small></span><textarea class="input" id="waText" style="min-height:230px"></textarea></label>
        </div>
        <div><div class="field"><span>Preview</span></div><div class="wa-preview mt-sm"><div class="wa-bubble" id="waPrev"></div></div>
          <div id="waWarn" class="mt-sm"></div></div></div>`,
      foot: `<span class="small muted">Opens WhatsApp Web / app with the message ready — just press send.</span><span class="spacer"></span>
        <button class="btn" id="waCopy">${icon('copy')}Copy</button><button class="btn btn-wa" id="waGo">${icon('send')}Open WhatsApp</button>`,
      onOpen: m => {
        const txt = $('#waText', m), link = $('#waLink', m), phone = $('#waPhone', m);
        const cur = () => Object.assign({}, r, { payment_link: link.value.trim() });
        const fill = () => { if (custom === null) txt.value = this.message(cur(), tplId); prev(); };
        const prev = () => {
          $('#waPrev', m).innerHTML = U.esc(txt.value).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>');
          const w = [];
          if (!link.value.trim()) w.push('No payment link — the message will contain “[payment link]”.');
          if (/\[payment link\]/.test(txt.value) && link.value.trim()) w.push('Message still contains “[payment link]”.');
          const ph = U.phone(phone.value, App.model.settings.general.default_country_code);
          if (!ph.valid) w.push(`Phone number needs checking (${ph.kind}).`);
          $('#waWarn', m).innerHTML = w.map(x => `<div class="notice amber" style="margin-bottom:6px">${icon('alert')}<span>${U.esc(x)}</span></div>`).join('');
        };
        $('#waTpl', m).addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; tplId = b.dataset.t; this.tplId = null; custom = null; $$('#waTpl button', m).forEach(x => x.classList.toggle('on', x === b)); fill(); });
        txt.addEventListener('input', () => { custom = txt.value; prev(); });
        link.addEventListener('input', () => { if (custom === null) fill(); else prev(); });
        phone.addEventListener('input', prev);
        fill();
        $('#waCopy', m).addEventListener('click', async () => { if (await this.copy(txt.value)) Toast.ok('Message copied'); });
        $('#waGo', m).addEventListener('click', async () => {
          const ph = U.phone(phone.value, App.model.settings.general.default_country_code);
          if (!ph.digits) return Toast.err(ph.kind === 'nocc' ? 'Add the country code (start with +)' : 'Enter a phone number');
          const lk = link.value.trim();
          const win = window.open(Engine.waLink(ph.digits, txt.value), '_blank', 'noopener');
          if (!win) Toast.warn('Pop-up blocked', 'Allow pop-ups for this site to open WhatsApp directly.');
          const patch = {};
          if (lk !== (k.payment_link || '')) patch.payment_link = lk;
          const orig = (r.contract && r.contract.mobile_raw) || '';
          if (ph.digits !== r.phone) patch.phone_override = phone.value.trim() !== orig ? phone.value.trim() : '';
          Modal.close();
          if (Object.keys(patch).length) await App.saveCase(r.contract_no, patch);
          const t = this.templates().find(x => x.id === tplId);
          await App.logActivity(r.contract_no, 'whatsapp', { template: tplId, template_name: t ? t.name : 'custom', phone: ph.digits, amount: U.money(r.due), message: txt.value, edited: custom !== null });
          Toast.ok(`WhatsApp opened for ${U.titleCase(r.name)}`, 'Logged as contact attempt');
          if (Drawer.no === r.contract_no) Drawer.loadActivity();
        });
      }
    });
  },

  /** Step-by-step WhatsApp queue for many customers (browsers allow one window per click) */
  queue(rows) {
    rows = rows.filter(Boolean);
    if (!rows.length) return;
    const tpls = this.templates();
    let tplId = 'auto', i = 0;
    const done = new Set();
    const ok = rows.filter(r => r.phone);
    const missingLink = rows.filter(r => !r.payment_link).length;
    Modal.open({
      title: `${icon('whatsapp')} WhatsApp queue`, sub: `${rows.length} customers · ${rows.length - ok.length} without phone · ${missingLink} without payment link`, size: 'wide',
      body: `<div class="toolbar"><label class="field" style="min-width:260px"><span>Template</span><select class="select" id="qTpl"><option value="auto">Auto — based on reminders already sent</option>${tpls.map(t => `<option value="${t.id}">${U.esc(t.name)}</option>`).join('')}</select></label>
          <div class="spacer"></div><div style="min-width:220px"><div class="small muted" id="qProg">0 of ${ok.length} sent</div><div class="progress mt-sm"><span id="qBar"></span></div></div></div>
        ${missingLink ? `<div class="notice amber">${icon('alert')}<span>${missingLink} customer(s) have no payment link — paste links first (Collections → “Paste payment links”) or their message will contain “[payment link]”.</span></div>` : ''}
        <div class="queue" id="qList"></div>`,
      foot: `<span class="small muted">Each click opens one chat with the message ready. Press send in WhatsApp, come back, click Next.</span><span class="spacer"></span>
        <button class="btn" id="qSkip">Skip</button><button class="btn btn-wa" id="qNext">${icon('send')}Open next</button>`,
      onOpen: m => {
        const tplFor = r => tplId === 'auto' ? this.pickTemplate(r) : tplId;
        const draw = () => {
          $('#qList', m).innerHTML = ok.map((r, idx) => `<div class="q-item ${done.has(r.contract_no) ? 'done' : ''} ${idx === i ? 'current' : ''}">
            <span class="avatar" style="width:34px;height:34px;font-size:12px">${done.has(r.contract_no) ? icon('check') : U.esc(U.initials(r.name))}</span>
            <div class="grow"><b>${U.esc(r.name)}</b><div class="small muted">#${r.contract_no} · +${r.phone} · ${U.money(r.due)} · ${U.esc((tpls.find(t => t.id === tplFor(r)) || {}).name || '')}</div></div>
            ${r.payment_link ? '<span class="flag t-green">link</span>' : '<span class="flag t-amber">no link</span>'}<span class="chip sm t-slate plain">${r.contact_count}× sent</span></div>`).join('') || '<p class="muted">No customers with a phone number in the selection.</p>';
          $('#qProg', m).textContent = `${done.size} of ${ok.length} sent`;
          $('#qBar', m).style.width = (ok.length ? done.size / ok.length * 100 : 0) + '%';
          const cur = $('.q-item.current', m); if (cur) cur.scrollIntoView({ block: 'nearest' });
          $('#qNext', m).disabled = i >= ok.length; $('#qSkip', m).disabled = i >= ok.length;
          if (i >= ok.length) $('#qNext', m).innerHTML = `${icon('check')}All done`;
        };
        $('#qTpl', m).addEventListener('change', e => { tplId = e.target.value; draw(); });
        $('#qSkip', m).addEventListener('click', () => { i++; draw(); });
        $('#qNext', m).addEventListener('click', async () => {
          const r = ok[i]; if (!r) return;
          const t = tplFor(r), msg = this.message(r, t);
          window.open(Engine.waLink(r.phone, msg), '_blank', 'noopener');
          done.add(r.contract_no); i++; draw();
          const tt = tpls.find(x => x.id === t);
          await App.logActivity(r.contract_no, 'whatsapp', { template: t, template_name: tt ? tt.name : t, phone: r.phone, amount: U.money(r.due), message: msg, queue: true });
        });
        draw();
      }
    });
  },

  pasteLinks() {
    Modal.open({ title: 'Import payment links', sub: 'Upload the file returned by the payment-link provider (CSV / Excel with OrderID like <b>Cno19254</b> and the link), or paste lines of contract number + link.', size: 'wide',
      body: `<div class="toolbar"><button class="btn btn-sm" id="plFile">${icon('upload')}Choose provider file…</button><span class="small muted" id="plFileName"></span></div>
        <textarea class="input mono" id="plText" style="min-height:200px" placeholder="Cno19254, https://pay.example.com/abc123&#10;18920	https://pay.example.com/xyz789"></textarea><div id="plPrev"></div>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="plSave" disabled>${icon('check')}Save links</button>`,
      onOpen: m => {
        let parsed = [];
        const parse = () => {
          parsed = $('#plText', m).value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
            const cn = l.match(/cno\s*(\d{3,})/i), ur = l.match(/https?:\/\/[^\s,;"]+/i);
            if (cn && ur) { const rec0 = App.model.byNo.get(+cn[1]); return { no: +cn[1], url: ur[0], line: l, ok: !!rec0, rec: rec0 }; }
            const mm = l.match(/(?:cno|#)?\s*(\d{3,})\D+?(https?:\/\/[^\s,;]+)/i) || l.match(/(https?:\/\/[^\s,;]+)\D+?(?:cno|#)?(\d{3,})/i);
            if (!mm) return { line: l, ok: false };
            const a = /^https?:/i.test(mm[1]) ? { no: +mm[2], url: mm[1] } : { no: +mm[1], url: mm[2] };
            const rec = App.model.byNo.get(a.no);
            return Object.assign(a, { line: l, ok: !!rec, rec });
          });
          const good = parsed.filter(p => p.ok);
          $('#plPrev', m).innerHTML = parsed.length ? `<div class="notice ${good.length === parsed.length ? 'green' : 'amber'}">${icon('info')}<span>${good.length} of ${parsed.length} lines matched a waiver contract.${parsed.filter(p => !p.ok).slice(0, 4).map(p => `<br><span class="mono small">✗ ${U.esc(p.line.slice(0, 70))}</span>`).join('')}</span></div>` : '';
          $('#plSave', m).disabled = !good.length;
        };
        $('#plText', m).addEventListener('input', U.debounce(parse, 200));
        $('#plFile', m).addEventListener('click', () => {
          const i = document.createElement('input'); i.type = 'file'; i.accept = '.csv,.xlsx,.xls,.txt';
          i.onchange = async () => {
            const f = i.files[0]; if (!f) return;
            try {
              const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', raw: true });
              const rowsX = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
              const lines = [];
              rowsX.forEach(rw => {
                const cells = rw.map(x => String(x || '').trim());
                const url = cells.find(x => /^https?:\/\//i.test(x));
                const id = cells.find(x => /^cno\s*\d{3,}$/i.test(x)) || cells.find(x => /^\d{4,6}$/.test(x));
                if (url && id) lines.push(`${id.replace(/\D/g, '')}, ${url}`);
              });
              $('#plText', m).value = lines.join('\n'); $('#plFileName', m).textContent = `${f.name} · ${lines.length} links found`; parse();
            } catch (e) { Toast.err('Could not read file', e.message); }
          };
          i.click();
        });
        $('#plSave', m).addEventListener('click', async () => {
          const good = parsed.filter(p => p.ok); const b = $('#plSave', m); b.classList.add('loading'); b.disabled = true;
          let n = 0; for (const p of good) { try { await API.call('dw_save_case', { p_contract: p.no, p_patch: { payment_link: p.url } }).then(k => { const list = State.ds.cases || (State.ds.cases = []); const i = list.findIndex(x => +x.contract_no === p.no); if (i >= 0) list[i] = k; else list.push(k); }); n++; } catch (e) { Toast.err(`#${p.no}: ${e.message}`); } }
          App.rebuild(true); Modal.close(); Toast.ok(`${n} payment links saved`);
        });
      } });
  },

  markSubmitted(rows) {
    const cur = App.model.settings.general.currency;
    const first = rows[0], k0 = (first && first.case) || {};
    const editing = rows.length === 1 && k0.claim_submitted_at;
    const amounts = {};
    rows.forEach(r => { amounts[r.contract_no] = r.case && r.case.claim_amount != null && editing ? +r.case.claim_amount : r.claimable; });
    Modal.open({ title: editing ? 'Edit claim submission' : 'Submit claim to Cardoo', size: '',
      sub: `${rows.length} contract(s) · record the date you submitted in the Cardoo portal; the contract moves to “Claim submitted” until the next Excess report confirms it`,
      body: `<div class="form-grid" style="grid-template-columns:1fr 2fr"><label class="field"><span>Submitted on</span><input class="input" type="date" id="msDate" value="${editing ? k0.claim_submitted_at : U.todayISO()}" max="${U.todayISO()}"></label>
          <label class="field"><span>Note (optional, saved as a remark)</span><input class="input" id="msNote" placeholder="e.g. Claim ref, documents attached…"></label></div>
        <div class="dt-scroll card" style="max-height:300px"><table class="tbl"><thead><tr><th>Contract</th><th>Customer</th><th>Window ends</th><th class="right">Outstanding</th><th class="right">Claim amount (${cur})</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${R.cno(r.contract_no)}</td><td><span class="cell-main">${U.esc(r.name)}</span></td><td class="small" data-dl="${r.contract_no}">${r.claim_deadline ? U.fmtDate(r.claim_deadline) : '—'}</td><td class="right amt">${U.money(r.outstanding)}</td>
          <td class="right"><input class="link-input mono" style="width:100px;text-align:right" type="number" step="0.01" data-ma="${r.contract_no}" value="${U.r2(amounts[r.contract_no])}"></td></tr>`).join('')}</tbody></table></div>
        <div id="msWarn"></div>`,
      foot: `<span class="small muted" id="msTot"></span><span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="msGo">${icon('check')}${editing ? 'Save' : 'Confirm submission'}</button>`,
      onOpen: m => {
        const check = () => {
          const d = U.dayNum($('#msDate', m).value);
          const late = rows.filter(r => r.claim_deadline && d > U.dayNum(r.claim_deadline));
          $('#msWarn', m).innerHTML = late.length ? `<div class="notice rose">${icon('alert')}<span>${late.length} contract(s) are past the claim window on this date: ${late.slice(0, 6).map(r => '#' + r.contract_no).join(', ')} — Cardoo may decline them.</span></div>` : '';
          $('#msTot', m).textContent = `Total claimed ${cur} ${U.money(U.sum(Object.values(amounts)))}`;
        };
        $('#msDate', m).addEventListener('change', check);
        m.addEventListener('input', e => { if (e.target.dataset.ma) { amounts[+e.target.dataset.ma] = +e.target.value || 0; check(); } });
        check();
        $('#msGo', m).addEventListener('click', async () => {
          const d = $('#msDate', m).value || U.todayISO(), note = $('#msNote', m).value.trim();
          const b = $('#msGo', m); b.classList.add('loading'); b.disabled = true;
          const list = State.ds.cases || (State.ds.cases = []);
          const put = k => { const i = list.findIndex(x => +x.contract_no === +k.contract_no); if (i >= 0) list[i] = k; else list.push(k); };
          const saved = [];
          await Promise.all(rows.map(r => API.call('dw_save_case', { p_contract: r.contract_no, p_patch: { claim_submitted_at: d, claim_amount: U.r2(amounts[r.contract_no]) } })
            .then(k => { put(k); saved.push(r); }).catch(e => Toast.err(`#${r.contract_no}: ${e.message}`))));
          App.rebuild(true); Modal.close();
          if (note) Promise.all(saved.map(r => API.call('dw_add_remark', { p_contract: r.contract_no, p_text: note, p_category: 'Claim submitted' }).then(put).catch(() => null))).then(() => App.rebuild(true));
          Toast.ok(editing ? 'Submission updated' : `${rows.length} claim(s) submitted`, `Date ${U.fmtDate(d)} — see the “Submitted” tab`);
          if (State.tables.claimsRec) State.tables.claimsRec.clearSel();
        });
      } });
  },
  async unsubmit(r) {
    if (!await Modal.confirm('Undo claim submission?', `#${r.contract_no} goes back to its previous stage.`, 'Undo')) return;
    await App.saveCase(r.contract_no, { claim_submitted_at: '', claim_amount: '' }, 'Submission removed');
  },

  claimText(r) {
    const g = App.model.settings.general, cur = g.currency, c = r.contract || {};
    const b = r.bookings.filter(x => !x.cancelled);
    return [
      `Excess claim — contract ${r.contract_no}`,
      `Customer: ${r.name}`, `Phone: ${r.phone ? '+' + r.phone : '-'}${r.email ? ` | Email: ${r.email}` : ''}`,
      `Vehicle: ${r.vehicle}`,
      `Rental: ${U.fmtDT(r.pickup_at) || U.fmtDate(r.open_date)} -> ${U.fmtDT(r.dropoff_at) || U.fmtDate(r.close_date)} (closed ${U.fmtDate(r.close_date)})`,
      `Cardoo booking: ${b.map(x => `${x.booking_type || ''} ${U.fmtDate(x.start_at)}-${U.fmtDate(x.end_at)}, cover ${cur} ${U.money(x.deposit_covered)}`).join('; ') || 'none'}`,
      c.contract_no ? `Charges: Rent ${U.money(c.rent)}, Salik ${U.money(c.salik)}, Fines ${U.money(c.fine)}, Other ${U.money(c.other_charges)}, VAT ${U.money(c.vat)} | Paid ${U.money(c.paid_amount)}` : '',
      `Outstanding (customer ledger): ${cur} ${U.money(r.outstanding)}`,
      `Amount claimed: ${cur} ${U.money(r.claimable)}${r.uncovered > 0 ? ` (above cover: ${cur} ${U.money(r.uncovered)})` : ''}`,
      `Customer contacted ${r.contact_count} time(s) via WhatsApp${r.case && r.case.first_contact_at ? ` since ${U.fmtTS(r.case.first_contact_at)}` : ''}; no payment received.`
    ].filter(Boolean).join('\n');
  },
  async copyClaim(r) { if (await this.copy(this.claimText(r))) Toast.ok('Claim details copied', 'Paste into the Cardoo claim form'); },

  /* ---------- PDFs ---------- */
  async claimPack(r, docIn) {
    const doc = docIn || Exporter.pdfDoc('portrait'); if (!doc) return;
    let acts = [];
    try { acts = await API.call('dw_get_activity', { p_contract: r.contract_no, p_limit: 200 }) || []; } catch (e) { /* offline */ }
    const g = App.model.settings.general, cur = g.currency, A = Exporter.ascii;
    let y = Exporter.pdfHeader(doc, `Cardoo Excess Claim Pack - #${r.contract_no}`, A(r.name));
    const kv = (rows, title) => {
      doc.autoTable({ startY: y, head: [[{ content: title, colSpan: 2 }]], body: rows.map(([a, b]) => [A(a), A(b)]), theme: 'plain',
        styles: { fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: [238, 240, 255], textColor: [55, 48, 163], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 150, textColor: [100, 116, 139], fontStyle: 'bold' } }, margin: { left: 36, right: 36 } });
      y = doc.lastAutoTable.finalY + 12;
    };
    const c = r.contract || {};
    kv([['Customer', r.name], ['Phone', r.phone ? '+' + r.phone : '-'], ['Email', r.email || '-'], ['Contract no.', String(r.contract_no)], ['Vehicle', r.vehicle],
      ['Pick-up', U.fmtDT(r.pickup_at) || U.fmtDate(r.open_date)], ['Drop-off', U.fmtDT(r.dropoff_at) || U.fmtDate(r.close_date)], ['Closed', U.fmtDate(r.close_date)],
      ['Waiver fee charged', `${cur} ${U.money(r.waiver_amount)}`]], 'Rental contract');
    kv(r.bookings.map(b => [`${b.booking_type || 'Booking'}${b.cancelled ? ' (cancelled)' : ''}`, `${U.fmtDT(b.start_at)} -> ${U.fmtDT(b.end_at)} | cover ${cur} ${U.money(b.deposit_covered)} | booked ${U.fmtDT(b.booked_at)}`]).concat(r.bookings.length ? [] : [['Booking', 'No Cardoo booking found']]), 'Cardoo deposit-free booking');
    kv([['Rent', U.money(c.rent)], ['Salik', U.money(c.salik)], ['Traffic fines', U.money(c.fine)], ['Other charges', U.money(c.other_charges)], ['VAT', U.money(c.vat)],
      ['Total charged', U.money(c.total_amount)], ['Paid', U.money(c.paid_amount)], ['Outstanding (customer ledger)', `${cur} ${U.money(r.outstanding)}`],
      ['Cardoo cover', `${cur} ${U.money(r.coverage)}`], ['AMOUNT CLAIMED', `${cur} ${U.money(r.claimable)}`]], 'Amounts');
    if (r.payments.length) {
      doc.autoTable({ startY: y, head: [['Date', 'Receipt', 'Amount', 'VAT', 'Total']], body: r.payments.map(p => [U.fmtDate(p.invoice_date), p.invoice_no, U.money(p.invoice_amount), U.money(p.vat), U.money(p.net_amount)]),
        theme: 'grid', styles: { fontSize: 8.5 }, headStyles: { fillColor: [241, 244, 249], textColor: [71, 85, 105] }, columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }, margin: { left: 36, right: 36 } });
      y = doc.lastAutoTable.finalY + 12;
    }
    const contacts = acts.filter(a => ['whatsapp', 'call'].includes(a.action));
    doc.autoTable({ startY: y, head: [['When', 'By', 'Channel', 'Details']], body: contacts.length ? contacts.map(a => [U.fmtTS(a.created_at), a.username, a.action === 'whatsapp' ? 'WhatsApp' : 'Call', A(a.action === 'whatsapp' ? `${(a.details || {}).template_name || ''} to +${(a.details || {}).phone || ''}` : (a.details || {}).note || '')]) : [['-', '-', '-', 'No contact attempts logged']],
      theme: 'grid', styles: { fontSize: 8.5 }, headStyles: { fillColor: [241, 244, 249], textColor: [71, 85, 105] }, margin: { left: 36, right: 36 } });
    y = doc.lastAutoTable.finalY + 12;
    const lastMsg = contacts.find(a => a.action === 'whatsapp' && a.details && a.details.message);
    if (lastMsg) {
      doc.setFontSize(8.5);
      const lines = doc.splitTextToSize(A(lastMsg.details.message), doc.internal.pageSize.getWidth() - 72);
      if (y + 20 + lines.length * 11 > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 40; }
      doc.setFontSize(9); doc.setTextColor(100, 116, 139); doc.text('Last WhatsApp message sent:', 36, y + 4);
      doc.setTextColor(30, 41, 59); doc.setFontSize(8.5);
      doc.text(lines, 36, y + 18);
    }
    if (!docIn) {
      Exporter.pdfFooter(doc); doc.save(`claim_pack_${r.contract_no}.pdf`);
      App.logActivity(r.contract_no, 'claim_pack', { amount: U.money(r.claimable) });
      Toast.ok('Claim pack downloaded');
    }
  },
  async claimPacks(rows) {
    const doc = Exporter.pdfDoc('portrait'); if (!doc) return;
    for (let i = 0; i < rows.length; i++) { if (i) doc.addPage(); await this.claimPack(rows[i], doc); }
    Exporter.pdfFooter(doc); doc.save(`claim_packs_${U.todayISO()}.pdf`);
    Toast.ok(`${rows.length} claim packs in one PDF`);
  },
  statement(r) {
    const doc = Exporter.pdfDoc('portrait'); if (!doc) return;
    const g = App.model.settings.general, cur = g.currency, A = Exporter.ascii, c = r.contract || {};
    let y = Exporter.pdfHeader(doc, `Statement of Account - Rental #${r.contract_no}`, A(r.name));
    doc.setFontSize(10); doc.setTextColor(30, 41, 59);
    doc.text(A(`Dear ${U.titleCase(r.name)},`), 36, y + 6);
    doc.setTextColor(71, 85, 105);
    doc.text(doc.splitTextToSize(A(`Please find below the summary of your rental agreement #${r.contract_no} (${r.vehicle}). The outstanding balance is ${cur} ${U.money(r.outstanding)}.`), doc.internal.pageSize.getWidth() - 72), 36, y + 24);
    y += 50;
    doc.autoTable({ startY: y, head: [['Description', `Amount (${cur})`]], theme: 'grid', styles: { fontSize: 9.5, cellPadding: 6 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255 }, columnStyles: { 1: { halign: 'right' } }, margin: { left: 36, right: 36 },
      body: [['Rental period', `${U.fmtDate(r.open_date)} - ${U.fmtDate(r.close_date) || 'open'}`], ['Rent', U.money(c.rent)], ['Salik (tolls)', U.money(c.salik)], ['Traffic fines', U.money(c.fine)],
        ['Other charges', U.money(c.other_charges)], ['VAT', U.money(c.vat)], ['Total charges', U.money(c.total_amount)], ['Payments received', U.money(c.paid_amount)]],
      foot: [['Outstanding balance', U.money(r.outstanding)]], footStyles: { fillColor: [255, 233, 238], textColor: [225, 29, 72], fontStyle: 'bold', halign: 'right' } });
    y = doc.lastAutoTable.finalY + 18;
    if (r.payment_link) {
      doc.setFontSize(11); doc.setTextColor(79, 70, 229); doc.setFont('helvetica', 'bold');
      doc.textWithLink('Pay securely online: ' + A(r.payment_link).slice(0, 80), 36, y, { url: r.payment_link });
      y += 18;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100, 116, 139);
    doc.text(A(`${g.company_name}${g.company_phone ? ' | ' + g.company_phone : ''}  -  Note: the customer ledger balance may include charges posted after the contract report.`), 36, y + 6);
    Exporter.pdfFooter(doc); doc.save(`statement_${r.contract_no}.pdf`);
    App.logActivity(r.contract_no, 'statement', {});
  }
};

/* =====================================================================
   Import & Sync view
   ===================================================================== */
Views.import = {
  fmtVal(v) {
    if (v == null || v === '') return '—';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : U.money(v);
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return U.fmtDate(s);
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) return U.fmtDT(s);
    return s.length > 70 ? s.slice(0, 67) + '…' : s;
  },
  build(el) {
    const imp = State.imports;
    const n = REPORT_ORDER.filter(t => imp[t] && imp[t].norm).length;
    el.innerHTML = `
      <div class="section-head"><div><h2>Import reports</h2><p>Attach one or more of the five reports — file names don't matter. New records are added, changed records are updated, and records missing from a file are left as they are.</p></div>
        <span class="spacer"></span>${n ? `<button class="btn btn-ghost" id="impClear">${icon('trash')}Clear files</button>` : ''}</div>
      <label class="dropzone" id="dz"><input type="file" id="dzInput" multiple accept=".xlsx,.xls,.xlsm,.csv,.pdf">
        <div class="dz-ico">${icon('upload')}</div><h3>Drop reports here, or click to browse</h3><p>The 5 reports, Cardoo 15-day invoices (PO PDF + booking_details Excel) and the Cardoo balance statement — any order, any file names</p></label>
      <div id="freshness"></div>
      <div class="slots">${REPORT_ORDER.map((t, i) => this.slot(t, i)).join('')}</div>
      <div id="stPanel"></div>
      <div id="poPanel"></div>
      <div id="impQuality"></div>
      <div class="card mt"><div class="card-head"><div><h3>Sync history</h3><p>Every sync merges into the database. Notes, remarks, payment links and contact history are never touched.</p></div></div><div class="card-body" id="impHist"><div class="skeleton" style="height:40px"></div></div></div>`;
    const dz = $('#dz', el), inp = $('#dzInput', el);
    inp.addEventListener('change', () => { this.files(inp.files); inp.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => this.files(e.dataTransfer.files));
    $$('[data-pick]', el).forEach(b => b.addEventListener('click', e => { e.preventDefault(); const i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls,.xlsm,.csv'; i.onchange = () => this.files(i.files, b.dataset.pick); i.click(); }));
    $$('[data-rm]', el).forEach(b => b.addEventListener('click', () => { delete State.imports[b.dataset.rm]; State.prepared = null; this.build(el); }));
    const clr = $('#impClear', el); if (clr) clr.addEventListener('click', () => { State.imports = {}; State.prepared = null; this.build(el); });
    if (n) this.quality(el);
    STMT.panel(el);
    PO.panel(el);
    this.history();
  },
  slot(t, i) {
    const spec = REPORTS[t], s = State.imports[t];
    const ok = s && s.norm, err = s && s.error;
    let meta = '';
    if (ok) {
      const st = s.norm.stats;
      meta = `<div class="file" title="${U.esc(s.file.name)}">${icon('xls')} ${U.esc(s.file.name)}</div><div class="meta"><span>${U.int(s.norm.rows.length)} rows</span><span>sheet “${U.esc(s.det.sheet)}”</span>${st.skipped ? `<span>${st.skipped} skipped</span>` : ''}</div>`;
    } else if (err) meta = `<div class="notice rose small">${icon('alert')}<span>${U.esc(err)}</span></div>`;
    return `<div class="slot ${ok ? 'ok' : err ? 'err' : ''}"><div class="slot-top"><span class="slot-num">${ok ? icon('check') : i + 1}</span><div><span class="src">${spec.source}</span><h4>${spec.label}</h4></div></div>
      ${meta || `<p class="desc">${spec.desc}</p>`}
      <div class="slot-act"><button class="btn btn-xs" data-pick="${t}">${icon('upload')}${ok ? 'Replace' : 'Attach'}</button>${ok ? `<button class="btn btn-xs btn-ghost" data-rm="${t}">${icon('x')}</button>` : ''}</div></div>`;
  },
  async files(list, forced) {
    if (!global.XLSX) return Toast.err('Excel library not loaded', 'Check your internet connection and reload.');
    const files = Array.from(list || []);
    if (!files.length) return;
    const el = $('#view-import');
    Toast.show(`Reading ${files.length} file(s)…`, 'info', '', 1800);
    for (const f of files) {
      try {
        await U.sleep(20);
        if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') { const po = await PO.addPdf(f); Toast.ok(`Cardoo invoice ${po} read`, f.name); continue; }
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false, dense: false });
        const stm = Engine.isStatement(wb, XLSX);
        if (stm) { const p = STMT.add(f, stm); Toast.ok('Cardoo balance statement read', `${p.rows.length} transactions · ${U.fmtDate(p.period_from)} → ${U.fmtDate(p.period_to)}`); continue; }
        const det = Engine.detectWorkbook(wb, XLSX);
        if (det && det.type === 'po_lines') { const po = PO.addLines(f, det); det.rows = null; Toast.ok(`Cardoo invoice lines ${po}`, f.name); continue; }
        if (!det) { Toast.err(`Not recognised: ${f.name}`, 'None of the 5 report layouts matched its column headers.'); if (forced) State.imports[forced] = { file: f, error: 'Columns do not match this report.' }; continue; }
        if (forced && det.type !== forced) Toast.warn(`${f.name} looks like “${REPORTS[det.type].label}”`, 'It was placed in the matching slot.');
        const norm = Engine.normalize(det.type, det, App.model ? App.model.settings : {});
        det.rows = null;
        State.imports[det.type] = { file: f, det, norm };
      } catch (e) { console.error(e); Toast.err(`Could not read ${f.name}`, e.message); }
    }
    State.prepared = null;
    this.build(el);
    const ready = REPORT_ORDER.filter(t => State.imports[t] && State.imports[t].norm);
    if (!ready.length && (Object.keys(State.poImports).length || State.stmtImport)) setTimeout(() => { const q = $(State.stmtImport ? '#stPanel' : '#poPanel'); if (q) q.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120);
    if (ready.length) { Toast.ok(`${ready.length} report(s) ready`, 'Review the changes, then sync.'); setTimeout(() => { const q = $('#impQuality'); if (q) q.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120); }
  },
  quality(el) {
    const types = REPORT_ORDER.filter(t => State.imports[t] && State.imports[t].norm);
    const norm = {}; types.forEach(t => { norm[t] = State.imports[t].norm; });
    const existing = (State.source === 'db' && State.ds) ? State.ds : (State.dbDs || State.ds || {});
    const prep = State.prepared = Engine.prepareSync(norm, existing);
    const s = prep.summary;
    const issues = [];
    if (norm.waivers) {
      const w = norm.waivers.stats;
      issues.push({ level: 'fix', src: 'Deposit Waivers', text: `Removed source tags from ${U.int(w.tagsName)} customer names and ${U.int(w.tagsContract)} contract numbers (${Object.entries(w.tagCounts).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'}).` });
      if (w.textNumbers) issues.push({ level: 'fix', src: 'Deposit Waivers', text: `${U.int(w.textNumbers)} amounts were text with thousands separators — converted to numbers.` });
    }
    if (norm.contracts) {
      const ph = norm.contracts.stats.phones;
      issues.push({ level: 'fix', src: 'Rental Contracts', text: `Phones normalised: ${U.int(ph.uae)} UAE mobiles, ${U.int(ph.intl)} international (country from e-mail domain), ${U.int(ph.landline || 0)} landlines, ${U.int(ph.nocc || 0)} foreign numbers without country code (confirm in Reconciliation → Fix country codes), ${U.int(ph.check || 0)} need checking, ${U.int(ph.missing)} missing.` });
      issues.push({ level: 'info', src: 'Rental Contracts', text: `${U.int(s.contractsKept)} of ${U.int(s.contractsTotal)} contracts are linked to a waiver, Cardoo booking or claim and will be stored.` });
    }
    if (norm.payments) issues.push({ level: 'info', src: 'Rental Payments', text: `${U.int(s.paymentsKept)} of ${U.int(s.paymentsTotal)} payment rows belong to linked contracts and will be stored.` });
    types.forEach(t => norm[t].issues.forEach(i => issues.push(Object.assign({ src: REPORTS[t].label }, i))));
    if (s.missingContracts.length) issues.push({ level: 'warn', text: `${s.missingContracts.length} linked contract(s) are not in any Rental Contracts report yet (no phone/email): ${s.missingContracts.slice(0, 12).join(', ')}${s.missingContracts.length > 12 ? '…' : ''}` });
    if (s.nameMismatch.length) issues.push({ level: 'warn', text: `${s.nameMismatch.length} customer name(s) differ between the waiver report and the contracts report — the contracts name is used. e.g. ${s.nameMismatch.slice(0, 3).map(x => `#${x.contract_no}: “${x.waiver}” vs “${x.contract}”`).join('; ')}` });

    const d = prep.diff;
    const allChanges = Object.values(d).flatMap(x => x.changes);
    const fieldCounts = {};
    allChanges.forEach(c => { const k = `${c.tbl}.${c.field}`; fieldCounts[k] = (fieldCounts[k] || 0) + 1; });
    const canSync = App.canManage();
    const totNew = U.sum(Object.values(d), x => x.inserted), totUpd = U.sum(Object.values(d), x => x.updated);
    $('#impQuality', el).innerHTML = `
      <div class="card mt"><div class="card-head"><div><h3>What will change</h3><p>Compared with the data already in the database</p></div></div>
        <div class="card-body grid" style="gap:12px">
          <div class="stat-row">${REPORT_ORDER.map(t => d[t] ? `<div class="stat"><small>${REPORTS[t].label}</small><b>${U.int(d[t].received)}</b>
            <span><span style="color:var(--green)">+${U.int(d[t].inserted)} new</span> · <span style="color:var(--amber)">${U.int(d[t].updated)} updated</span> · ${U.int(d[t].unchanged)} same</span></div>`
            : `<div class="stat" style="opacity:.55"><small>${REPORTS[t].label}</small><b>—</b><span>not attached · stays as is</span></div>`).join('')}</div>
          ${allChanges.length ? `<div><div class="toolbar" style="margin-bottom:8px"><b class="small">Changed fields</b>${Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `<span class="tag">${U.esc(k.replace(/_/g, ' '))} · ${v}</span>`).join('')}</div>
            <div class="dt-scroll card" style="max-height:260px"><table class="tbl"><thead><tr><th>Report</th><th>Contract</th><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>
            ${allChanges.slice(0, 300).map(c => `<tr><td class="small">${REPORTS[c.tbl].label}</td><td>${R.cno(c.contract_no || c.row_key)}</td><td class="small">${U.esc(c.field.replace(/_/g, ' '))}</td><td><span class="chg-old">${U.esc(this.fmtVal(c.old_value))}</span></td><td><span class="chg-new">${U.esc(this.fmtVal(c.new_value))}</span></td></tr>`).join('')}
            </tbody></table></div>${allChanges.length > 300 ? `<p class="small muted mt-sm">Showing 300 of ${U.int(allChanges.length)} field changes.</p>` : ''}</div>`
            : `<div class="notice green">${icon('check')}<span>No existing record changed. ${totNew ? `${U.int(totNew)} new record(s) will be added.` : 'Everything is already up to date.'}</span></div>`}
        </div></div>
      <div class="card mt"><div class="card-head"><div><h3>Clean-up &amp; validation</h3><p>What was detected and fixed while reading the files</p></div></div>
        <div class="card-body"><div class="quality">${issues.map(i => `<div class="q-row"><span class="lvl ${i.level}">${i.level === 'fix' ? 'fixed' : i.level}</span><span>${i.src ? `<b>${U.esc(i.src)}:</b> ` : ''}${U.esc(i.text)}</span></div>`).join('')}</div></div></div>
      <div class="sync-box mt"><div class="grow"><h3>${icon('database')} Ready to merge · ${U.int(totNew)} new · ${U.int(totUpd)} updated</h3><p class="muted small">Only the attached report(s) are merged in one transaction. Records not in these files are kept unchanged.</p>
          <div class="progress mt-sm" id="syncProg" hidden><span></span></div><small class="muted" id="syncMsg"></small></div>
        <div class="btn-group"><button class="btn" id="impLocal">${icon('eye')}Preview without saving</button>
        <button class="btn btn-primary btn-lg" id="impSync" ${canSync ? '' : 'disabled title="Only managers/admins can sync"'}><span class="btn-label">${icon('upload')} Sync to database</span><span class="spinner"></span></button></div></div>
      ${canSync ? '' : `<div class="notice amber mt-sm">${icon('alert')}<span>Your role (${U.esc(State.user.role)}) can preview but not sync.</span></div>`}`;
    $('#impLocal', el).addEventListener('click', () => {
      if (State.source === 'db') State.dbDs = State.ds;
      const merged = Engine.mergeLocal(JSON.parse(JSON.stringify(existing)), JSON.parse(JSON.stringify(prep.tables)));
      merged.user = State.user;
      App.setData(merged, 'local', false);
      State.built = { import: true };
      Toast.ok('Previewing merged data', 'Not saved — sync to store it. Reload to discard.');
      location.hash = '#/dashboard';
    });
    $('#impSync', el).addEventListener('click', () => this.sync(el));
  },
  async sync(el) {
    const prep = State.prepared; if (!prep) return;
    const types = Object.keys(prep.tables);
    const btn = $('#impSync', el), bar = $('#syncProg', el), msg = $('#syncMsg', el);
    btn.classList.add('loading'); btn.disabled = true; bar.hidden = false;
    const files = types.map(t => ({ type: t, fileName: State.imports[t].file.name, size: State.imports[t].file.size, rows: State.imports[t].norm.rows.length, kept: prep.tables[t].length }));
    const summary = { mode: 'merge', preview: Object.fromEntries(Object.entries(prep.diff).map(([k, v]) => [k, { inserted: v.inserted, updated: v.updated, unchanged: v.unchanged }])),
      issues: types.flatMap(t => State.imports[t].norm.issues.map(i => `${t}: ${i.text}`)) };
    let batch = null;
    try {
      msg.textContent = 'Starting import batch…';
      batch = await API.call('dw_sync_begin', { p_files: files, p_summary: summary });
      const chunks = [];
      types.forEach(t => { const rows = prep.tables[t]; if (!rows.length) chunks.push([t, []]); for (let i = 0; i < rows.length; i += CONFIG.CHUNK_SIZE) chunks.push([t, rows.slice(i, i + CONFIG.CHUNK_SIZE)]); });
      for (let i = 0; i < chunks.length; i++) {
        const [t, rows] = chunks[i];
        msg.textContent = `Uploading ${REPORTS[t].label} (${i + 1}/${chunks.length})…`;
        await API.call('dw_sync_rows', { p_batch: batch, p_table: t, p_rows: rows });
        bar.firstElementChild.style.width = ((i + 1) / (chunks.length + 1) * 100) + '%';
      }
      msg.textContent = 'Merging in one transaction…';
      const res = await API.call('dw_sync_merge', { p_batch: batch });
      bar.firstElementChild.style.width = '100%';
      const line = Object.entries(res).map(([k, v]) => `${REPORTS[k].label}: +${v.inserted} new, ${v.updated} updated`).join(' · ');
      msg.textContent = 'Done — ' + line;
      Toast.ok('Reports merged into the database', line);
      State.imports = {}; State.prepared = null; State.dbDs = null;
      await App.load(false);
      State.built = {};
      this.showChanges(batch, res);
      location.hash = '#/dashboard';
    } catch (e) {
      Toast.err('Sync failed — nothing was changed', e.message);
      msg.textContent = 'Failed: ' + e.message;
      if (batch) { try { await API.call('dw_sync_abort', { p_batch: batch }); } catch (x) { /* ignore */ } }
    } finally { btn.classList.remove('loading'); btn.disabled = false; }
  },
  async showChanges(batch, res) {
    let rows = [];
    try { rows = await API.call('dw_get_changes', { p_batch: batch, p_contract: null, p_limit: 5000 }) || []; } catch (e) { /* older batch */ }
    const sum = res ? Object.entries(res).map(([k, v]) => `<div class="stat"><small>${REPORTS[k] ? REPORTS[k].label : k}</small><b>${U.int(v.received)}</b><span><span style="color:var(--green)">+${v.inserted}</span> · <span style="color:var(--amber)">${v.updated} upd</span> · ${v.unchanged} same</span></div>`).join('') : '';
    Modal.open({ title: `Sync #${batch} — changes`, sub: `${U.int(rows.length)} field change(s) to existing records`, size: 'wide',
      body: `${sum ? `<div class="stat-row">${sum}</div>` : ''}<div id="chgTable"></div>`,
      foot: `<button class="btn" data-close>Close</button>`,
      onOpen: m => {
        const t = new DataTable($('#chgTable', m), { title: `Sync ${batch} changes`, exportName: `sync_${batch}_changes`, rowKey: r => r.id, pageSize: 10,
          emptyText: 'No existing record was changed in this sync.',
          columns: [
            { key: 'tbl', label: 'Report', get: r => (REPORTS[r.tbl] || {}).label || r.tbl },
            { key: 'contract_no', label: 'Contract', get: r => r.contract_no || r.row_key, html: r => R.cno(r.contract_no || r.row_key) },
            { key: 'customer', label: 'Customer', get: r => { const x = r.contract_no && App.model.byNo.get(+r.contract_no); return x ? x.name : ''; } },
            { key: 'field', label: 'Field', get: r => r.field.replace(/_/g, ' ') },
            { key: 'old_value', label: 'Before', get: r => this.fmtVal(r.old_value), html: r => `<span class="chg-old">${U.esc(this.fmtVal(r.old_value))}</span>` },
            { key: 'new_value', label: 'After', get: r => this.fmtVal(r.new_value), html: r => `<span class="chg-new">${U.esc(this.fmtVal(r.new_value))}</span>` }
          ] });
        t.el.classList.remove('card'); t.el.style.border = '1px solid var(--border)'; t.el.style.borderRadius = '10px';
        t.setRows(rows);
      } });
  },
  freshness(batches) {
    const box = $('#freshness'); if (!box) return;
    const last = {};
    (batches || []).filter(b => b.status === 'completed').forEach(b => (b.files || []).forEach(f => { if (!last[f.type] || new Date(b.completed_at) > new Date(last[f.type].at)) last[f.type] = { at: b.completed_at, file: f.fileName }; }));
    const cd = State.cd || {}, invs = cd.invoices || [], st = (cd.statement_imports || [])[0];
    const lastPo = invs.slice().sort((a, b) => String(b.period_to || '').localeCompare(String(a.period_to || '')))[0];
    const age = at => { if (!at) return ['never', 'rose']; const d = Math.floor((Date.now() - new Date(at)) / 864e5); return [d === 0 ? 'today' : d + 'd ago', d <= 2 ? 'green' : d <= 7 ? 'amber' : 'rose']; };
    const cell = (label, at, sub) => { const [t, tone] = age(at); return `<div class="stat"><small>${label}</small><b style="font-size:14px"><span class="chip t-${tone}">${t}</span></b><span>${U.esc(sub || '')}</span></div>`; };
    box.innerHTML = `<div class="card mt"><div class="card-head"><div><h3>Data freshness</h3><p>When each source was last imported</p></div></div><div class="card-body"><div class="pf-grid" style="grid-template-columns:repeat(7,minmax(0,1fr))">
      ${REPORT_ORDER.map(t => cell(REPORTS[t].label, last[t] && last[t].at, last[t] ? U.fmtTS(last[t].at) : 'not imported')).join('')}
      ${cell('Cardoo invoices (PO)', lastPo && lastPo.updated_at, lastPo ? `latest ${lastPo.po_no} · to ${U.fmtDate(lastPo.period_to)}` : 'not imported')}
      ${cell('Cardoo statement', st && st.imported_at, st ? `covers to ${U.fmtDate(st.period_to)}` : 'not imported')}</div></div></div>`;
  },
  async history() {
    const box = $('#impHist'); if (!box) return;
    try {
      const rows = await API.call('dw_list_batches', { p_limit: 60 }) || [];
      this.freshness(rows);
      box.innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>#</th><th>When</th><th>By</th><th>Status</th><th>Files</th><th>Result</th><th></th></tr></thead><tbody>${rows.map(b => {
        const sm = b.summary || {};
        const res = sm.merge ? Object.entries(sm.merge).map(([k, v]) => `${(REPORTS[k] || {}).label || k}: +${v.inserted} / ${v.updated} upd`).join('<br>')
          : sm.stored ? 'full replace<br>' + Object.entries(sm.stored).map(([k, v]) => `${k} ${v}`).join(' · ') : '—';
        return `<tr><td class="mono">${b.id}</td><td class="nowrap">${U.fmtTS(b.completed_at || b.started_at)}</td><td>${U.esc(b.started_by_name || '')}</td>
          <td><span class="chip t-${b.status === 'completed' ? 'green' : b.status === 'failed' ? 'rose' : 'amber'}">${b.status}</span></td>
          <td class="small">${(b.files || []).map(f => U.esc(f.fileName)).join('<br>')}</td><td class="small">${res}</td>
          <td>${sm.merge ? `<button class="btn btn-xs" data-chg="${b.id}">Changes</button>` : ''}</td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">No syncs yet.</p>';
      $$('[data-chg]', box).forEach(x => x.addEventListener('click', () => { const b = rows.find(y => String(y.id) === x.dataset.chg); this.showChanges(+x.dataset.chg, b && b.summary && b.summary.merge); }));
    } catch (e) { box.innerHTML = `<p class="muted">${U.esc(e.message)}</p>`; }
  }
};

/* =====================================================================
   Settings view
   ===================================================================== */
Views.settings = {
  build(el) {
    const s = App.model.settings, g = s.general, canEdit = App.canManage();
    this.tpls = JSON.parse(JSON.stringify(s.templates));
    this.tags = [...(g.tags || [])];
    this.cats = [...(g.remark_categories || DEFAULT_SETTINGS.general.remark_categories)];
    const ph = ['name', 'first_name', 'contract', 'amount', 'currency', 'vehicle', 'plate', 'open_date', 'close_date', 'payment_link', 'company', 'company_phone', 'waiver_amount', 'today'];
    el.innerHTML = `
      ${canEdit ? '' : `<div class="notice amber" style="margin-bottom:14px">${icon('lock')}<span>Settings are read-only for your role. Ask a manager or admin to make changes.</span></div>`}
      <div class="grid g-2">
        <div class="card"><div class="card-head"><div><h3>Company &amp; rules</h3><p>Used in messages, PDFs and the workflow stages</p></div></div><div class="card-body grid" style="gap:14px">
          <div class="form-grid">
            <label class="field"><span>Company name</span><input class="input" id="sCo" value="${U.esc(g.company_name)}"></label>
            <label class="field"><span>Company phone</span><input class="input" id="sCoPh" value="${U.esc(g.company_phone || '')}" placeholder="+971 …"></label>
            <label class="field"><span>Currency</span><input class="input" id="sCur" value="${U.esc(g.currency)}"></label>
            <label class="field"><span>Default country code</span><input class="input" id="sCc" value="${U.esc(g.default_country_code)}"><small>Local numbers (05…, 5…) get this prefix</small></label>
            <label class="field"><span>Ignore balances up to</span><input class="input" type="number" step="0.01" id="sMin" value="${g.min_outstanding}"><small>Rounding dust is treated as settled</small></label>
            <label class="field"><span>Ready to claim after (reminders)</span><input class="input" type="number" min="1" id="sRem" value="${g.claim_after_reminders}"></label>
            <label class="field"><span>…or days after first reminder</span><input class="input" type="number" min="0" id="sDays" value="${g.claim_after_days}"></label>
            <label class="field"><span>Claim window (days after close)</span><input class="input" type="number" min="1" id="sDead" value="${g.claim_deadline_days}"><small>Cardoo accepts claims up to this many days after close</small></label>
            <label class="field"><span>“Closing soon” warning (days left)</span><input class="input" type="number" min="1" id="sSoon" value="${g.expiring_soon_days || 10}"></label>
          </div>
          <label class="check"><input type="checkbox" id="sPosted" ${g.claims_posted_in_ledger ? 'checked' : ''}><span></span>Cardoo claim payments are already posted in the Caryaati customer ledger</label>
          <small class="muted" style="margin-top:-8px">Off (default): amount due from a customer = ledger balance − approved Cardoo claim. On: the ledger balance is already net of Cardoo payments.</small>
          <label class="field"><span>Remark categories</span><div class="tag-editor" id="sCats"></div><small>Quick-pick categories when writing a remark.</small></label>
          <label class="field"><span>Source tags removed from names &amp; contract numbers</span><div class="tag-editor" id="sTags"></div><small>Press Enter to add. Tags with a hyphen match case-insensitively; others must match exactly. Unlisted glued tags (e.g. “NAMEPartner-App”) are still auto-detected and reported.</small></label>
          <div><button class="btn btn-primary" id="sSaveG" ${canEdit ? '' : 'disabled'}>${icon('check')}Save company &amp; rules</button></div>
        </div></div>
        <div class="card"><div class="card-head"><div><h3>Payment-link batch CSV</h3><p>Defaults for the provider upload file (OrderName, Message, expiry, language, invoice type)</p></div></div><div class="card-body grid" style="gap:12px">
          <div class="form-grid">
            <label class="field"><span>OrderName</span><input class="input" id="lOrder" value="${U.esc(g.link_order_name || 'Outstanding Balance')}"></label>
            <label class="field"><span>Message</span><input class="input" id="lMsg" value="${U.esc(g.link_message || 'Please pay the amount.')}"></label>
            <label class="field"><span>Expires after (days)</span><input class="input" type="number" min="1" id="lDays" value="${g.link_expiry_days || 5}"></label>
            <label class="field"><span>Expiry time</span><input class="input" id="lTime" value="${U.esc(g.link_expiry_time || '15:00:00')}"></label>
            <label class="field"><span>Language</span><input class="input" id="lLang" value="${U.esc(g.link_language || 'en')}"></label>
            <label class="field"><span>InvoiceType</span><input class="input" id="lType" value="${U.esc(g.link_invoice_type || 'Once')}"></label>
          </div>
          <p class="small muted">Saved together with “Save company &amp; rules”.</p>
        </div></div>

        <div class="card"><div class="card-head"><div><h3>Account</h3><p>Signed in as <b>${U.esc(State.user.username)}</b> (${U.esc(State.user.role)})</p></div></div><div class="card-body grid" style="gap:14px">
          <label class="field"><span>Current password</span><input class="input" type="password" id="pOld" autocomplete="current-password"></label>
          <label class="field"><span>New password</span><input class="input" type="password" id="pNew" autocomplete="new-password"><small>At least 8 characters. Other sessions will be signed out.</small></label>
          <label class="field"><span>Repeat new password</span><input class="input" type="password" id="pNew2" autocomplete="new-password"></label>
          <div><button class="btn" id="pSave">${icon('lock')}Change password</button></div>
          <hr style="border:0;border-top:1px solid var(--border);width:100%">
          <div><h3 style="font-size:15px">Full export</h3><p class="muted small" style="margin:4px 0 10px">Download every unified table in one Excel workbook.</p>
          <button class="btn" id="sExportAll">${icon('xls')}Download unified workbook</button>
          <button class="btn" id="sBackup">${icon('database')}Full backup (JSON)</button></div>
        </div></div>
      </div>
      <div class="card mt"><div class="card-head"><div><h3>WhatsApp message templates</h3><p>Click a placeholder to insert it. The first reminder is used for customers not contacted yet, the second after one reminder, and so on.</p></div><span class="spacer"></span>
        <button class="btn btn-sm" id="tAdd" ${canEdit ? '' : 'disabled'}>${icon('plus')}Add template</button><button class="btn btn-primary btn-sm" id="tSave" ${canEdit ? '' : 'disabled'}>${icon('check')}Save templates</button></div>
        <div class="card-body"><div class="ph-list" style="margin-bottom:12px">${ph.map(p => `<button data-ph="${p}">{${p}}</button>`).join('')}</div><div class="grid g-2" id="tList"></div></div></div>`;
    this.drawTags(el); this.drawTpls(el);
    let lastTa = null;
    el.addEventListener('focusin', e => { if (e.target.matches('#tList textarea')) lastTa = e.target; });
    $$('[data-ph]', el).forEach(b => b.addEventListener('click', () => {
      const ta = lastTa || $('#tList textarea', el); if (!ta) return;
      const p = `{${b.dataset.ph}}`, s0 = ta.selectionStart, s1 = ta.selectionEnd;
      ta.value = ta.value.slice(0, s0) + p + ta.value.slice(s1); ta.focus(); ta.selectionStart = ta.selectionEnd = s0 + p.length; ta.dispatchEvent(new Event('input'));
    }));
    $('#sSaveG', el).addEventListener('click', async () => {
      const v = Object.assign({}, g, { company_name: $('#sCo', el).value.trim(), company_phone: $('#sCoPh', el).value.trim(), currency: $('#sCur', el).value.trim() || 'AED',
        default_country_code: $('#sCc', el).value.replace(/\D/g, '') || '971', min_outstanding: +$('#sMin', el).value || 0, claim_after_reminders: Math.max(1, +$('#sRem', el).value || 1),
        claim_after_days: Math.max(0, +$('#sDays', el).value || 0), claim_deadline_days: Math.max(1, +$('#sDead', el).value || 60), expiring_soon_days: Math.max(1, +$('#sSoon', el).value || 10),
        tags: this.tags, remark_categories: this.cats, claims_posted_in_ledger: $('#sPosted', el).checked,
        link_order_name: $('#lOrder', el).value.trim() || 'Outstanding Balance', link_message: $('#lMsg', el).value.trim(), link_expiry_days: Math.max(1, +$('#lDays', el).value || 5),
        link_expiry_time: $('#lTime', el).value.trim() || '15:00:00', link_language: $('#lLang', el).value.trim() || 'en', link_invoice_type: $('#lType', el).value.trim() || 'Once' });
      try { await API.call('dw_save_setting', { p_key: 'general', p_value: v }); State.ds.settings = Object.assign({}, State.ds.settings, { general: v }); State.built = { settings: true }; App.rebuild(false); Toast.ok('Settings saved'); }
      catch (e) { Toast.err('Could not save', e.message); }
    });
    $('#tAdd', el).addEventListener('click', () => { this.tpls.push({ id: 't' + Date.now().toString(36), name: 'New template', body: 'Dear {name},\n\n…\n\n{payment_link}\n\n{company}' }); this.drawTpls(el); });
    $('#tSave', el).addEventListener('click', async () => {
      if (!this.tpls.length) return Toast.warn('Keep at least one template');
      try { await API.call('dw_save_setting', { p_key: 'templates', p_value: this.tpls }); State.ds.settings = Object.assign({}, State.ds.settings, { templates: JSON.parse(JSON.stringify(this.tpls)) }); App.rebuild(false); Toast.ok('Templates saved'); }
      catch (e) { Toast.err('Could not save', e.message); }
    });
    $('#pSave', el).addEventListener('click', async () => {
      const o = $('#pOld', el).value, n = $('#pNew', el).value, n2 = $('#pNew2', el).value;
      if (n !== n2) return Toast.err('New passwords do not match');
      if (n.length < 8) return Toast.err('Use at least 8 characters');
      try { await API.call('dw_change_password', { p_old: o, p_new: n }); Toast.ok('Password changed'); ['#pOld', '#pNew', '#pNew2'].forEach(s => { $(s, el).value = ''; }); }
      catch (e) { Toast.err('Password not changed', e.message); }
    });
    $('#sExportAll', el).addEventListener('click', () => this.exportAll());
    $('#sBackup', el).addEventListener('click', async () => {
      try {
        const [ds, cd, act] = await Promise.all([API.call('dw_get_dataset'), API.call('dw_get_cardoo').catch(() => null), API.call('dw_get_activity', { p_contract: null, p_limit: 2000 }).catch(() => [])]);
        const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), by: State.user.username, dataset: ds, cardoo: cd, activity: act }, null, 1)], { type: 'application/json' });
        Exporter.download(blob, `deposit_waiver_backup_${U.todayISO()}.json`);
        Toast.ok('Backup downloaded', 'Keep it somewhere safe — it contains customer data.');
      } catch (e) { Toast.err('Backup failed', e.message); }
    });
  },
  drawTags(el) { this.drawList(el, '#sTags', this.tags, 'Add tag…'); this.drawList(el, '#sCats', this.cats, 'Add category…'); },
  drawList(el, sel, arr, ph) {
    const box = $(sel, el); if (!box) return;
    box.innerHTML = arr.map((t, i) => `<span class="t">${U.esc(t)}<button data-i="${i}" title="Remove">×</button></span>`).join('') + `<input placeholder="${ph}">`;
    $$('button', box).forEach(b => b.addEventListener('click', () => { arr.splice(+b.dataset.i, 1); this.drawList(el, sel, arr, ph); }));
    const inp = $('input', box);
    inp.addEventListener('keydown', e => { if ((e.key === 'Enter' || (e.key === ',' && sel === '#sTags')) && inp.value.trim()) { e.preventDefault(); const v = inp.value.trim().replace(/,$/, ''); if (!arr.includes(v)) arr.push(v); this.drawList(el, sel, arr, ph); $(sel + ' input', el).focus(); } });
  },
  drawTpls(el) {
    const sample = App.model.records.find(r => r.stage === 'to_contact') || App.model.records[0];
    $('#tList', el).innerHTML = this.tpls.map((t, i) => `<div class="tpl-card"><div class="inline-form"><input class="input" data-tn="${i}" value="${U.esc(t.name)}"><button class="icon-btn" data-up="${i}" title="Move up" ${i ? '' : 'disabled'}>▲</button><button class="icon-btn" data-del="${i}" title="Delete">${icon('trash')}</button></div>
      <textarea class="input mono" data-tb="${i}">${U.esc(t.body)}</textarea>
      ${sample ? `<details><summary class="small muted" style="cursor:pointer">Preview with #${sample.contract_no}</summary><div class="wa-preview mt-sm"><div class="wa-bubble" data-pv="${i}"></div></div></details>` : ''}</div>`).join('');
    const pv = i => { const p = $(`[data-pv="${i}"]`, el); if (p && sample) p.innerHTML = U.esc(Engine.fillTemplate(this.tpls[i].body, sample, App.model.settings)).replace(/\*([^*\n]+)\*/g, '<b>$1</b>'); };
    this.tpls.forEach((t, i) => pv(i));
    $$('[data-tn]', el).forEach(x => x.addEventListener('input', () => { this.tpls[+x.dataset.tn].name = x.value; }));
    $$('[data-tb]', el).forEach(x => x.addEventListener('input', () => { this.tpls[+x.dataset.tb].body = x.value; pv(+x.dataset.tb); }));
    $$('[data-del]', el).forEach(b => b.addEventListener('click', () => { this.tpls.splice(+b.dataset.del, 1); this.drawTpls(el); }));
    $$('[data-up]', el).forEach(b => b.addEventListener('click', () => { const i = +b.dataset.up; if (!i) return; [this.tpls[i - 1], this.tpls[i]] = [this.tpls[i], this.tpls[i - 1]]; this.drawTpls(el); }));
  },
  exportAll() {
    if (!global.XLSX) return;
    const m = App.model, wb = XLSX.utils.book_new();
    const add = (name, rows) => { const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ info: 'no rows' }]); XLSX.utils.book_append_sheet(wb, ws, name); };
    add('Unified', m.records.map(r => ({ 'Contract': r.contract_no, 'Customer': r.name, 'Phone': r.phone ? '+' + r.phone : '', 'Phone valid': r.phone_valid ? 'yes' : 'check', 'Email': r.email || '', 'Vehicle': r.vehicle, 'Plate': r.plate,
      'Status': r.status, 'Opened': r.open_date, 'Closed': r.close_date || '', 'Waiver fee': r.waiver_amount, 'Ledger balance': r.outstanding, 'Contract balance': r.contract_balance, 'Rent paid': r.rent_paid,
      'Cardoo booking': r.booking_state, 'Cardoo cover': r.coverage, 'Cardoo fee est.': r.cardoo_fee, 'Claimable': r.claimable, 'Claim status': r.claim_state || '', 'Claim approved': r.claim_approved,
      'Caryaati closed': r.close_date || '', 'Cardoo closed': r.cardoo_close_at ? U.isoDate(r.cardoo_close_at) : '', 'Close sync': r.close_sync, 'Claim deadline': r.claim_deadline || '', 'Claim window': r.claim_window || '',
      'Stage': STAGES[r.stage].label, 'Contacts': r.contact_count, 'Remark category': r.remark_cat, 'Last remark': r.remark, 'Payment link': r.payment_link, 'Promise date': (r.case || {}).promise_date || '', 'Notes': (r.case || {}).notes || '', 'Flags': r.flags.map(f => f.t).join('; '), 'Source tag': r.source_tag || '' })));
    add('Cardoo bookings', m.bookingRows.map(b => { const o = Object.assign({}, b); delete o._rec; return o; }));
    add('Cardoo claims', m.claimRows.map(c => { const o = Object.assign({}, c); delete o._rec; return o; }));
    add('Rent payments', m.paymentRows.map(p => { const o = Object.assign({}, p); delete o._rec; return o; }));
    add('Checks', m.checks.flatMap(c => c.rows.map(r => ({ check: c.title, severity: c.severity, contract: r.contract_no, customer: r.name || r._name || '' }))));
    XLSX.writeFile(wb, `deposit_waiver_unified_${U.todayISO()}.xlsx`, { compression: true });
    Toast.ok('Unified workbook downloaded');
  }
};

/* =====================================================================
   4b. PHONE UI – country picker in the side panel + bulk "Fix country codes"
   ===================================================================== */
Object.assign(R, {
  ccOptions(sel) {
    const list = [PHONE_COUNTRIES[0], ...PHONE_COUNTRIES.slice(1).sort((a, b) => a.name.localeCompare(b.name))];
    return `<option value="">Country…</option>` + list.map(c => `<option value="${c.iso}" ${c.iso === sel ? 'selected' : ''}>${U.esc(c.name)} +${c.cc}</option>`).join('');
  },
  /** current country + national number to show in the editor */
  phoneParts(r) {
    if (r.phone && (r.phone_valid || r.phone_kind === 'landline')) {
      const sp = U.phoneSplit(r.phone);
      return { iso: sp.country ? sp.country.iso : '', nat: sp.country ? sp.national : '+' + r.phone };
    }
    const t = (r.phone_suggest || [])[0];
    const raw = String(r.phone_raw || '').replace(/\D/g, '').replace(/^0+/, '');
    return t ? { iso: t.iso, nat: t.national, guess: true } : { iso: '', nat: raw };
  },
  phoneTags(r) {
    if (r.phone_overridden) return '<span class="tag">corrected</span>';
    if (r.phone_auto) return `<span class="tag" title="Country code added automatically">${U.esc(r.phone_country)} · ${U.esc(r.phone_auto_reason)}</span>`;
    if (r.phone_kind === 'nocc') return '<span class="flag t-amber">add country code</span>';
    if (r.phone_kind === 'missing') return '<span class="flag t-amber">no phone</span>';
    if (!r.phone_valid) return '<span class="flag t-amber">check number</span>';
    return '';
  },
  phoneField(r, k) {
    const p = R.phoneParts(r);
    const sug = !r.phone_valid ? (r.phone_suggest || []) : [];
    return `<div class="field"><span>WhatsApp number ${R.phoneTags(r)}</span>
      <div class="inline-form"><select class="select" id="fCc" style="max-width:190px;flex:0 0 auto">${R.ccOptions(p.iso)}</select>
        <input class="input mono" id="fPhone" value="${U.esc(p.nat)}" placeholder="Number (or full +code number)">
        <button class="btn" id="fPhoneSave">${icon('check')}Save</button></div>
      <small id="fPhoneInfo">${R.phoneInfo(r)}</small>
      ${sug.length ? `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px"><small class="muted">Suggested country:</small>${sug.map(x => `<button type="button" class="btn btn-xs" data-ph-iso="${x.iso}" data-ph-nat="${U.esc(x.national)}" title="${U.esc(x.reason)}">+${x.cc} ${U.esc(x.name)}${x.tld ? ' ★' : ''}</button>`).join('')}</div>
        <small class="muted">Caryaati exports mobiles without the country code — pick the customer's country (★ = matches the e-mail domain). Check the name / nationality if unsure.</small>` : ''}</div>`;
  },
  phoneInfo(r) {
    return r.phone ? `WhatsApp: <b class="mono">${U.esc(r.phone_display)}</b>${r.phone_country ? ` · ${U.esc(r.phone_country)}` : ''} · original in report: <span class="mono">${U.esc((r.contract && r.contract.mobile_raw) || '—')}</span>`
      : `<span style="color:var(--amber)">Not usable for WhatsApp yet — country code missing.</span> Original in report: <span class="mono">${U.esc((r.contract && r.contract.mobile_raw) || '—')}</span>`;
  },
  /** build the full number from a country iso + typed number */
  phoneBuild(iso, val) {
    const v = String(val || '').trim();
    if (!v) return { empty: true };
    if (/^\s*(\+|00)/.test(v)) return U.phone(v);
    const c = U.phoneCountry(iso);
    if (!c) return null;
    let n = v.replace(/\D/g, '').replace(/^0+/, '');
    if (n.startsWith(c.cc) && !c.lens.includes(n.length) && c.lens.includes(n.length - c.cc.length)) n = n.slice(c.cc.length);
    return U.phone('+' + c.cc + n);
  },
  /** what to store: '' when the number equals what the report already gives */
  phoneOverrideFor(r, ph) {
    const g = App.model.settings.general;
    const base = U.phone(r.contract && r.contract.mobile_raw, g.default_country_code, { email: r.email });
    return base.valid && base.digits === ph.digits ? '' : '+' + ph.digits;
  },
  phoneBind(d, r) {
    const sel = $('#fCc', d), inp = $('#fPhone', d), info = $('#fPhoneInfo', d), btn = $('#fPhoneSave', d);
    if (!sel) return;
    const preview = () => {
      const ph = R.phoneBuild(sel.value, inp.value);
      if (!ph || ph.empty) { info.innerHTML = ph && ph.empty ? 'Empty — saving clears the corrected number.' : '<span style="color:var(--amber)">Select the country.</span>'; return; }
      info.innerHTML = `Will save as <b class="mono">${U.esc(U.phoneFmt(ph.digits))}</b>${ph.country ? ` · ${U.esc(ph.country)}` : ''}${ph.valid ? '' : ' · <span style="color:var(--amber)">looks unusual</span>'}`;
    };
    const save = async () => {
      const ph = R.phoneBuild(sel.value, inp.value);
      if (!ph) return Toast.warn('Select the country first');
      if (ph.empty) return App.saveCase(r.contract_no, { phone_override: '' }, 'Corrected number cleared');
      if (!ph.valid) Toast.warn('Number still looks unusual', U.phoneFmt(ph.digits));
      await App.saveCase(r.contract_no, { phone_override: R.phoneOverrideFor(r, ph) }, `Saved ${U.phoneFmt(ph.digits)}`);
    };
    sel.addEventListener('change', preview); inp.addEventListener('input', preview);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    btn.addEventListener('click', save);
    $$('[data-ph-iso]', d).forEach(b => b.addEventListener('click', () => { sel.value = b.dataset.phIso; inp.value = b.dataset.phNat; preview(); save(); }));
  }
});

Object.assign(Actions, {
  /** bulk: confirm country codes for numbers Caryaati exported without one */
  phoneFix(rows) {
    const g = App.model.settings.general;
    rows = (rows || App.model.records.filter(r => r.status === 'Closed' && r.outstanding > (+g.min_outstanding || 0)))
      .filter(r => !r.phone_valid && r.phone_kind !== 'missing' && r.phone_raw);
    if (!rows.length) return Toast.ok('All outstanding customers have a usable WhatsApp number');
    const pick = {};
    rows.forEach(r => { const p = R.phoneParts(r); pick[r.contract_no] = { iso: p.iso, nat: p.nat, on: !!(r.phone_suggest || []).length && (r.phone_suggest[0].tld || r.phone_suggest.length === 1) }; });
    Modal.open({ title: 'Fix country codes', size: 'wide',
      sub: `${rows.length} customer(s) whose number in Caryaati has no country code. Suggestions come from the number pattern and the e-mail domain (★). Tick the rows you have checked and save.`,
      body: `<div class="dt-scroll card" style="max-height:440px"><table class="tbl"><thead><tr><th><input type="checkbox" id="pfAll"></th><th>Contract</th><th>Customer · e-mail</th><th>In report</th><th>Country</th><th>Number</th><th>WhatsApp as</th></tr></thead><tbody>
        ${rows.map(r => { const p = pick[r.contract_no]; return `<tr data-no="${r.contract_no}"><td><input type="checkbox" class="pfOn" ${p.on ? 'checked' : ''}></td><td>${R.cno(r.contract_no)}</td>
          <td style="max-width:260px"><span class="cell-main">${U.esc(r.name)}</span><span class="cell-sub">${U.esc(r.email || 'no e-mail')} · ${U.money(r.outstanding)} due</span></td>
          <td class="mono small">${U.esc(r.phone_raw)}</td>
          <td><select class="select input-sm pfCc" style="max-width:170px">${R.ccOptions(p.iso)}</select>${(r.phone_suggest || []).length > 1 ? `<span class="cell-sub">${r.phone_suggest.slice(1, 3).map(x => `+${x.cc} ${U.esc(x.name)}`).join(' · ')}</span>` : ''}</td>
          <td><input class="input input-sm mono pfNum" style="width:120px" value="${U.esc(p.nat)}"></td><td class="mono small pfOut"></td></tr>`; }).join('')}</tbody></table></div>`,
      foot: `<span class="muted small" id="pfCount"></span><span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="pfSave">${icon('check')}Save ticked numbers</button>`,
      onOpen: m => {
        const upd = tr => {
          const ph = R.phoneBuild($('.pfCc', tr).value, $('.pfNum', tr).value);
          $('.pfOut', tr).innerHTML = !ph || ph.empty ? '<span class="muted">—</span>' : `${U.esc(U.phoneFmt(ph.digits))}${ph.valid ? '' : ' <span style="color:var(--amber)">?</span>'}`;
        };
        const count = () => { $('#pfCount', m).textContent = `${$$('.pfOn:checked', m).length} ticked`; };
        $$('tbody tr', m).forEach(tr => { upd(tr); ['change', 'input'].forEach(ev => tr.addEventListener(ev, e => { if (!e.target.classList.contains('pfOn')) { $('.pfOn', tr).checked = true; } upd(tr); count(); })); });
        $('#pfAll', m).addEventListener('change', e => { $$('.pfOn', m).forEach(c => { c.checked = e.target.checked; }); count(); });
        count();
        $('#pfSave', m).addEventListener('click', async () => {
          const todo = $$('tbody tr', m).filter(tr => $('.pfOn', tr).checked);
          if (!todo.length) return Toast.warn('Tick at least one row');
          const b = $('#pfSave', m); b.classList.add('loading'); b.disabled = true;
          let n = 0, bad = 0;
          for (const tr of todo) {
            const r = rows.find(x => x.contract_no === +tr.dataset.no);
            const ph = R.phoneBuild($('.pfCc', tr).value, $('.pfNum', tr).value);
            if (!ph || ph.empty || !ph.valid) { bad++; continue; }
            try {
              const k = await API.call('dw_save_case', { p_contract: r.contract_no, p_patch: { phone_override: R.phoneOverrideFor(r, ph) } });
              const list = State.ds.cases || (State.ds.cases = []); const i = list.findIndex(x => +x.contract_no === r.contract_no); if (i >= 0) list[i] = k; else list.push(k);
              n++;
            } catch (e) { Toast.err(`#${r.contract_no}: ${e.message}`); }
          }
          App.rebuild(true); Modal.close();
          Toast.ok(`${n} number(s) saved`, bad ? `${bad} skipped — country missing or number unusual` : '');
        });
      } });
  }
});

/* =====================================================================
   Cardoo ↔ Caryaati matching
   ===================================================================== */
Views.matching = {
  tabs: [
    ['missing_cardoo', 'Missing in Cardoo', 'rose', 'Waiver contracts in Caryaati with no active Cardoo booking — the deposit is not covered.'],
    ['missing_caryaati', 'Missing in Caryaati', 'rose', 'Cardoo bookings whose contract number is not found in the Caryaati Rental Contracts data. Check the contract number used in Cardoo (re-import the Rental Contracts report if it is recent).'],
    ['no_waiver', 'Booked, no waiver fee', 'amber', 'The contract exists in Caryaati and is booked in Cardoo, but it is not in the Deposit Waivers report — check whether the waiver fee was charged.'],
    ['close_cardoo', 'Close in Cardoo', 'amber', 'Closed in Caryaati but the Cardoo booking is still open — close it in Cardoo with the same date.'],
    ['close_mismatch', 'Closing date mismatch', 'orange', 'Closed in both systems but on different dates.'],
    ['cardoo_only', 'Closed in Cardoo only', 'rose', 'Cardoo booking is closed while the Caryaati contract is still open — the deposit is no longer covered.'],
    ['matched', 'Fully matched', 'green', 'Closed in both systems on the same date.']
  ],
  rows(tab) {
    const m = App.model, R = m.records;
    return {
      missing_cardoo: () => R.filter(r => r.booking_state !== 'active' && (!State.ui.matchStatus || r.status === State.ui.matchStatus)),
      missing_caryaati: () => m.missingInCaryaati,
      no_waiver: () => m.bookedNoWaiver,
      close_cardoo: () => R.filter(r => r.close_sync === 'caryaati_only'),
      close_mismatch: () => R.filter(r => r.close_diff_days),
      cardoo_only: () => R.filter(r => r.close_sync === 'cardoo_only'),
      matched: () => R.filter(r => r.close_sync === 'both_closed' && !r.close_diff_days)
    }[tab]();
  },
  cardooCols() {
    const cur = App.model.settings.general.currency;
    return [
      { key: 'contract_no', label: 'Contract', numeric: true, get: r => r.contract_raw || r.contract_no, sortGet: r => r.contract_no, html: r => R.cno(r.contract_raw || r.contract_no) },
      { key: 'name', label: 'Customer (Caryaati)', get: r => r.name || '', html: r => r.in_caryaati ? `<span class="cell-main">${U.esc(r.name)}</span><span class="cell-sub">${U.esc(r.caryaati_status || '')}${r.pickup_at ? ' · ' + U.fmtDate(r.pickup_at) + ' → ' + U.fmtDate(r.dropoff_at) : ''}</span>` : '<span class="chip t-rose">Not found in Caryaati</span>' },
      { key: 'booking_type', label: 'Cardoo type', get: r => r.booking_type },
      { key: 'booked_at', label: 'Booked', type: 'date', get: r => r.booked_at, sortGet: r => U.dayFrac(r.booked_at), html: r => R.date(r.booked_at) },
      { key: 'start_at', label: 'Cardoo period', type: 'date', get: r => r.start_at, sortGet: r => U.dayFrac(r.start_at), html: r => `<div class="dates2">${U.fmtDate(r.start_at)}<span>→ ${U.fmtDate(r.end_at)}</span></div>` },
      { key: 'close_at', label: 'Cardoo closed', type: 'date', get: r => r.close_at, sortGet: r => U.dayFrac(r.close_at), html: r => r.close_at ? R.date(r.close_at) : '<span class="zero">open</span>' },
      { key: 'cover', label: 'Cover', plain: `Cover (${cur})`, align: 'right', type: 'num', numeric: true, get: r => r.cover, html: r => R.amt(r.cover) },
      { key: 'fee', label: 'Cardoo fee', plain: `Cardoo fee est. (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.fee, html: r => R.amt(r.fee) },
      { key: 'cancelled', label: 'Status', get: r => r.cancelled ? 'Cancelled' : 'Active', html: r => r.cancelled ? '<span class="chip t-rose">Cancelled</span>' : '<span class="chip t-teal">Active</span>' }
    ];
  },
  recCols(tab) {
    const cur = App.model.settings.general.currency;
    const base = Views.recordColumns();
    const car = { key: 'close_date', label: 'Caryaati closed', type: 'date', get: r => r.close_date, sortGet: r => U.dayNum(r.close_date), html: r => r.close_date ? `<div class="dates2">${String(r.caryaati_close_at).length > 10 ? U.fmtDT(r.caryaati_close_at) : U.fmtDate(r.close_date)}<span>${R.ago(r.days_since_caryaati_close)}</span></div>` : '<span class="chip t-sky">open</span>' };
    const per = { key: 'booking_end', label: 'Cardoo booking', get: r => r.booking_start ? `${U.fmtDate(r.booking_start)} - ${U.fmtDate(r.booking_end)}` : '', sortGet: r => U.dayFrac(r.booking_end), html: r => r.booking_start ? `<div class="dates2">${U.fmtDate(r.booking_start)}<span>→ ${U.fmtDate(r.booking_end)}</span></div>` : R.booking(r) };
    const cdc = { key: 'cardoo_close_at', label: 'Cardoo closed', type: 'date', dt: true, get: r => r.cardoo_close_at, sortGet: r => U.dayFrac(r.cardoo_close_at), html: r => r.cardoo_close_at ? `<div class="dates2">${U.fmtDT(r.cardoo_close_at)}</div>` : '<span class="zero">not closed</span>' };
    const diff = { key: 'close_diff_days', label: 'Difference', numeric: true, get: r => r.close_diff_days, html: r => r.close_diff_days ? `<span class="${r.close_diff_days > 0 ? 'diff-pos' : 'diff-neg'}">${r.close_diff_days > 0 ? '+' : ''}${r.close_diff_days} days</span><span class="cell-sub">${r.close_diff_days > 0 ? 'Cardoo later' : 'Cardoo earlier'}</span>` : '<span class="zero">same day</span>' };
    const type = { key: 'btype', label: 'Type', get: r => [...new Set(r.bookings.filter(b => !b.cancelled).map(b => b.booking_type))].join(' / ') };
    const out = { key: 'outstanding', label: 'Outstanding', plain: `Outstanding (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.outstanding, html: r => R.owe(r.outstanding) };
    const fee = { key: 'cardoo_fee', label: 'Cardoo fee', plain: `Cardoo fee est. (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.cardoo_fee, html: r => R.amt(r.cardoo_fee) };
    const status = { key: 'status', label: 'Caryaati', get: r => r.status, html: r => R.status(r.status) };
    const opened = { key: 'open_date', label: 'Opened', type: 'date', get: r => r.open_date, sortGet: r => U.dayNum(r.open_date), html: r => R.date(r.open_date) };
    const drop = { key: 'dropoff_at', label: 'Caryaati drop-off', type: 'date', dt: true, get: r => r.dropoff_at, sortGet: r => U.dayFrac(r.dropoff_at), html: r => r.dropoff_at ? `<div class="dates2">${U.fmtDT(r.dropoff_at)}<span>${r.status === 'Open' ? 'expected' : ''}</span></div>` : '—' };
    const wf = { key: 'waiver_amount', label: 'Waiver fee', plain: `Waiver fee (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.waiver_amount, html: r => R.amt(r.waiver_amount) };
    const stage = { key: 'stage', label: 'Stage', get: r => STAGES[r.stage].label, html: r => R.stage(r.stage) };
    const bstate = { key: 'booking_state', label: 'Cardoo', get: r => r.booking_state, html: R.booking };
    return {
      missing_cardoo: [...base, status, opened, car, drop, wf, out, bstate, stage],
      close_cardoo: [...base, type, car, per, fee, out, stage],
      close_mismatch: [...base, type, car, cdc, diff, out],
      cardoo_only: [...base, opened, drop, per, cdc, wf],
      matched: [...base, car, cdc, out, stage]
    }[tab];
  },
  build(el) {
    if (!App.model.records.length && !App.model.bookingRows.length) { State.built.matching = false; return Views.emptyData(el); }
    State.ui.matchTab = State.ui.matchTab || 'missing_cardoo';
    el.innerHTML = `<div class="filter-chips" id="mtTabs"></div><div class="notice" id="mtDesc" style="margin-bottom:12px"></div>
      <div class="filters" id="mtFilt" hidden><label>${icon('filter')}Caryaati status</label><select class="select input-sm" id="mtStatus"><option value="">Open &amp; closed</option><option>Open</option><option>Closed</option></select></div>
      ${this.tabs.map(t => `<div id="mt_${t[0]}" hidden></div>`).join('')}`;
    $('#mtTabs', el).addEventListener('click', e => { const c = e.target.closest('[data-tab]'); if (c) { State.ui.matchTab = c.dataset.tab; this.update(el); } });
    $('#mtStatus', el).value = State.ui.matchStatus || '';
    $('#mtStatus', el).addEventListener('change', e => { State.ui.matchStatus = e.target.value; this.update(el); });
    this.tabs.forEach(([id, label]) => {
      const cardoo = id === 'missing_caryaati' || id === 'no_waiver';
      State.tables['mt_' + id] = new DataTable($('#mt_' + id, el), {
        title: 'Cardoo matching - ' + label, exportName: 'cardoo_matching_' + id, rowKey: r => r.row_key || r.contract_no,
        columns: cardoo ? this.cardooCols() : this.recCols(id), selectable: !cardoo,
        bulk: cardoo ? '' : `<button class="btn btn-xs" data-bulk="remark">${icon('note')}Remark</button>`,
        sort: id === 'close_mismatch' ? { key: 'close_diff_days', dir: 'desc' } : id === 'close_cardoo' ? { key: 'close_date', dir: 'asc' } : { key: 'contract_no', dir: 'desc' },
        onRowClick: r => App.model.byNo.get(+r.contract_no) && Drawer.open(+r.contract_no)
      });
      Views.bindRowActions(State.tables['mt_' + id].el);
    });
  },
  update(el) {
    const tab = State.ui.matchTab;
    if (!State.tables['mt_' + tab]) return;
    $('#mtTabs', el).innerHTML = this.tabs.map(([id, l, tone]) => `<button class="fchip t-${tone} ${tab === id ? 'active' : ''}" data-tab="${id}"><span class="dot"></span>${l}<i>${this.rows(id).length}</i></button>`).join('');
    const t = this.tabs.find(x => x[0] === tab);
    $('#mtDesc', el).innerHTML = `${icon('info')}<span>${t[3]}</span>`;
    $('#mtFilt', el).hidden = tab !== 'missing_cardoo';
    this.tabs.forEach(([id]) => { $('#mt_' + id, el).hidden = id !== tab; });
    State.tables['mt_' + tab].setRows(this.rows(tab));
  }
};

/* =====================================================================
   Profitability report
   ===================================================================== */
Views.profit = {
  build(el) {
    const m = App.model, g = m.settings.general, cur = g.currency;
    if (!m.records.length) return Views.emptyData(el);
    const f = State.ui.profit || (State.ui.profit = { from: '', to: '' });
    const P = this.data = Engine.profit(m, f);
    const M = v => `${cur} ${U.money(v)}`;
    const verdictTone = P.net > 0 ? (P.margin > 0 ? 'green' : 'amber') : 'rose';
    const verdict = P.net > 0
      ? (P.margin > 0 ? `Profitable — the waiver fees alone cover Cardoo's cost (${P.feeCoverage}× coverage, ${P.marginPct}% margin), and Cardoo recoveries add ${M(P.approved)} on top.`
        : `Profitable only because of claim recoveries — fees do not cover Cardoo's cost (margin ${M(P.margin)}), but approved recoveries of ${M(P.approved)} make the program net positive.`)
      : `Not profitable in this period — Cardoo's cost exceeds waiver fees plus recoveries by ${M(-P.net)}.`;
    const today = U.todayISO();
    el.innerHTML = `
      <div class="filters"><label>${icon('calendar')}Contracts opened</label><input class="input input-sm" type="date" id="pfFrom" value="${f.from}"><span class="muted">→</span><input class="input input-sm" type="date" id="pfTo" value="${f.to}">
        <button class="btn btn-sm" data-pre="all">All time</button><button class="btn btn-sm" data-pre="ytd">This year</button><button class="btn btn-sm" data-pre="12m">Last 12 months</button><button class="btn btn-sm" data-pre="90d">Last 90 days</button>
        <span class="spacer" style="flex:1"></span><button class="btn btn-sm" id="pfXls">${icon('xls')}Excel</button><button class="btn btn-sm btn-primary" id="pfPdf">${icon('pdf')}PDF report</button></div>
      <div class="verdict t-${verdictTone}"><span class="big">${icon(P.net > 0 ? 'check' : 'alert')}</span><div><h3>${P.net > 0 ? 'Cardoo program is profitable' : 'Cardoo program is not profitable'} · net ${M(P.net)}</h3><p>${verdict} <span class="chip sm t-${P.basis === 'actual' ? 'green' : 'amber'}">${P.basis === 'actual' ? `actual Cardoo figures · statement ${U.fmtDate(P.actual.from)} → ${U.fmtDate(P.actual.to)}` : 'estimated Cardoo cost'}</span></p></div></div>
      <div class="pf-grid">
        ${Views.dashboard.kpi('t-teal', 'wallet', 'Waiver fees charged', `<small>${cur}</small>${U.compact(P.fees)}`, `${U.int(P.contracts)} contracts · avg ${U.money(P.avgFee)}`)}
        ${P.basis === 'actual' ? Views.dashboard.kpi('t-rose', 'shield', 'Charged by Cardoo (actual)', `<small>${cur}</small>${U.compact(P.cost)}`, `from Cardoo statement · estimate was ${U.compact(P.costEst)}`)
          : Views.dashboard.kpi('t-rose', 'shield', 'Paid to Cardoo (est.)', `<small>${cur}</small>${U.compact(P.cost)}`, `${U.int(P.bookings)} bookings · avg ${U.money(P.avgCost)} · import the Cardoo statement for actuals`)}
        ${Views.dashboard.kpi(P.margin >= 0 ? 't-green' : 't-rose', 'chart', 'Fee margin', `<small>${cur}</small>${U.compact(P.margin)}`, `${P.marginPct}% of fees · ${P.feeCoverage == null ? '—' : P.feeCoverage + '×'} cost coverage`)}
        ${P.basis === 'actual' ? Views.dashboard.kpi('t-green', 'file-check', 'Recovered from Cardoo (actual)', `<small>${cur}</small>${U.compact(P.approved)}`, `excess ${U.compact(P.actual.excess)} + compensation ${U.compact(P.actual.compensation)} − paid by customers ${U.compact(P.actual.customer)}`)
          : Views.dashboard.kpi('t-green', 'file-check', 'Cardoo recoveries', `<small>${cur}</small>${U.compact(P.approved)}`, `${P.claimsRecovery} approved claims · ${P.recoveryRate}% of excess claimed`)}
        ${Views.dashboard.kpi(P.net >= 0 ? 't-indigo' : 't-rose', 'sparkle', 'Net program value', `<small>${cur}</small>${U.compact(P.net)}`, 'Fee margin + approved recoveries')}
        ${Views.dashboard.kpi('t-sky', 'receipt', 'Rent collected', `<small>${cur}</small>${U.compact(P.rentCollected)}`, `from waiver customers · VAT ${U.compact(P.rentVat)}`)}
        ${Views.dashboard.kpi('t-amber', 'clock', 'Still claimable', `<small>${cur}</small>${U.compact(P.pendingClaimAmount)}`, `${P.pendingClaimCount} contracts inside the ${g.claim_deadline_days}-day window`)}
        ${Views.dashboard.kpi('t-orange', 'alert', 'Not recoverable via Cardoo', `<small>${cur}</small>${U.compact(P.expiredAmount + P.notCoveredAmount)}`, `${P.expiredCount} window expired · ${P.notCoveredCount} not covered`)}
      </div>
      <div class="grid g-12 mt">
        <div class="card"><div class="card-head"><div><h3>Monthly performance</h3><p>${P.basis === 'actual' ? 'Fees (by open month) vs Cardoo invoices and recoveries from the Cardoo statement (by transaction month)' : 'Fees (by open month) vs Cardoo cost (by booking start) and net incl. recoveries (by claim month)'}</p></div></div><div class="card-body"><div class="chart-box"><canvas id="pfChart"></canvas></div></div></div>
        <div class="card"><div class="card-head"><div><h3>Program P&amp;L</h3><p>${f.from || f.to ? `${f.from ? U.fmtDate(f.from) : 'start'} → ${f.to ? U.fmtDate(f.to) : 'today'}` : 'All time'}</p></div></div><div class="card-body">
          <table class="ledger">
            <tr><td>Waiver fees charged to customers</td><td>${U.money(P.fees)}</td></tr>
            ${P.basis === 'actual' ? `<tr><td>Cardoo invoices (actual, statement)</td><td>−${U.money(P.actual.invoiced)}</td></tr>
            <tr class="sub"><td>bank fees</td><td>−${U.money(P.actual.fees)}</td></tr>
            <tr class="sub"><td>estimate from bookings was</td><td>${U.money(P.costEst)}</td></tr>`
            : `<tr><td>Cardoo fees — short-term bookings (est.)</td><td>−${U.money(P.costShort)}</td></tr>
            <tr><td>Cardoo fees — long-term bookings (est.)</td><td>−${U.money(P.costLong)}</td></tr>
            <tr class="sub"><td>of which bookings without a waiver fee (${P.bookingsNoWaiver})</td><td>${U.money(P.costNoWaiver)}</td></tr>`}
            <tr class="total"><td>Fee margin</td><td>${U.money(P.margin)}</td></tr>
            ${P.basis === 'actual' ? `<tr><td>Excess credited by Cardoo</td><td>+${U.money(P.actual.excess)}</td></tr>
            <tr><td>Over-deposit compensation</td><td>+${U.money(P.actual.compensation)}</td></tr>
            <tr class="sub"><td>less: excess paid directly by customers</td><td>−${U.money(P.actual.customer)}</td></tr>`
            : `<tr><td>Cardoo claim recoveries (approved)</td><td>+${U.money(P.approved)}</td></tr>`}
            <tr class="total"><td>Net program value</td><td>${U.money(P.net)}</td></tr>
            <tr><td>Still claimable inside the window</td><td>+${U.money(P.pendingClaimAmount)}</td></tr>
            <tr class="total"><td>Potential value</td><td>${U.money(P.potential)}</td></tr>
          </table>
          <div class="mt-sm">
            <div class="ratio"><span>Fee coverage (fees ÷ Cardoo cost)</span><b>${P.feeCoverage == null ? '—' : P.feeCoverage + '×'}</b></div>
            <div class="ratio"><span>Closed contracts with a claim</span><b>${P.claimRate}%</b></div>
            <div class="ratio"><span>Recovery rate (approved ÷ excess claimed)</span><b>${P.recoveryRate}%</b></div>
            <div class="ratio"><span>Claims: recovery / rejected / need update</span><b>${P.claimsRecovery} / ${P.claimsRejected} / ${P.claimsNeedUpdate}</b></div>
            <div class="ratio"><span>Excess rejected by Cardoo</span><b>${U.money(P.rejectedExcess)}</b></div>
            <div class="ratio"><span>Cancelled bookings</span><b>${P.bookingsCancelled}</b></div>
          </div></div></div>
      </div>
      ${this.actualCard()}
      <div class="grid g-3 mt">
        <div class="card"><div class="card-head"><div><h3>Customer exposure</h3><p>Closed waiver contracts still owing</p></div></div><div class="card-body"><table class="ledger">
          <tr><td>Outstanding (${P.owingCount} contracts)</td><td>${U.money(P.owingAmount)}</td></tr>
          <tr class="sub"><td>claimable within window</td><td>${U.money(P.pendingClaimAmount)}</td></tr>
          <tr class="sub"><td>above Cardoo cover (collect directly)</td><td>${U.money(P.uncoveredAbove)}</td></tr>
          <tr class="sub"><td>window expired (${P.expiredCount})</td><td>${U.money(P.expiredAmount)}</td></tr>
          <tr class="sub"><td>never covered by Cardoo (${P.notCoveredCount})</td><td>${U.money(P.notCoveredAmount)}</td></tr>
          <tr class="total"><td>Rent billed / collected</td><td>${U.compact(P.rentBilled)} / ${U.compact(P.rentCollected)}</td></tr></table></div></div>
        <div class="card"><div class="card-head"><div><h3>By Cardoo booking type</h3></div></div><div class="card-body" id="pfType"></div></div>
        <div class="card"><div class="card-head"><div><h3>By deposit cover</h3></div></div><div class="card-body" id="pfCover"></div></div>
      </div>
      <div class="card mt"><div class="card-head"><div><h3>Monthly breakdown</h3><p>Export for accounting</p></div></div><div class="card-body" style="padding:8px 0 0"><div id="pfMonthly"></div></div></div>
      <div class="card mt"><div class="card-head"><div><h3>By rental type</h3></div></div><div class="card-body" style="padding:8px 0 0"><div id="pfRental"></div></div></div>
      <div class="notice mt">${icon('info')}<span>${P.basis === 'actual' ? 'Cardoo cost and recoveries come from the imported Cardoo balance statement (filtered by transaction date). ' : ''}How the estimate works: Cardoo fees use the short-term <i>Total price</i>, or the long-term <i>Monthly price</i> × months from start to close (or end). Recoveries are the approved amounts of claims <i>In Recovery</i>. Waiver fees and Cardoo fees are compared as reported (check whether both include VAT). Rent collected = rent receipts of waiver contracts. The date filter uses the contract open date (Cardoo cost by booking start).</span></div>`;
    $$('[data-pre]', el).forEach(b => b.addEventListener('click', () => {
      const p = b.dataset.pre;
      f.to = p === 'all' ? '' : today;
      f.from = p === 'all' ? '' : p === 'ytd' ? `${today.slice(0, 4)}-01-01` : U.addDaysISO(today, p === '12m' ? -365 : -90);
      this.build(el);
    }));
    ['#pfFrom', '#pfTo'].forEach(s => $(s, el).addEventListener('change', () => { f.from = $('#pfFrom', el).value; f.to = $('#pfTo', el).value; this.build(el); }));
    $('#pfPdf', el).addEventListener('click', () => this.pdf());
    $('#pfXls', el).addEventListener('click', () => this.xlsx());
    const grpTable = (rows) => `<table class="ledger"><tr style="color:var(--muted)"><td>Group</td><td>Fees / Cost / Net</td></tr>${rows.map(x => `<tr><td>${U.esc(x.key)}<span class="cell-sub">${x.contracts} contracts · ${x.claims} claimed</span></td><td>${U.compact(x.fees)} / ${U.compact(x.cost)} / <b style="color:var(--${x.net >= 0 ? 'green' : 'rose'})">${U.compact(x.net)}</b></td></tr>`).join('')}</table>`;
    $('#pfType', el).innerHTML = grpTable(P.byType);
    $('#pfCover', el).innerHTML = grpTable(P.byCover);
    const mcols = [
      { key: 'month', label: 'Month', get: r => U.monthLabel(r.month), sortGet: r => r.month },
      { key: 'contracts', label: 'Contracts', align: 'right', numeric: true, get: r => r.contracts },
      { key: 'fees', label: 'Waiver fees', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.fees, html: r => R.amt(r.fees) },
      { key: 'cost', label: 'Cardoo cost', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.cost, html: r => R.amt(r.cost) },
      { key: 'margin', label: 'Fee margin', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.margin, html: r => `<span class="amt" style="color:var(--${r.margin >= 0 ? 'green' : 'rose'})">${U.money(r.margin)}</span>` },
      { key: 'claims', label: 'Claims', align: 'right', numeric: true, get: r => r.claims },
      { key: 'approved', label: 'Recoveries', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.approved, html: r => R.amt(r.approved) },
      { key: 'net', label: 'Net', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.net, html: r => `<span class="amt big" style="color:var(--${r.net >= 0 ? 'green' : 'rose'})">${U.money(r.net)}</span>` },
      { key: 'rent', label: 'Rent collected', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.rent, html: r => R.amt(r.rent) }
    ];
    const mt = new DataTable($('#pfMonthly', el), { title: 'Profitability by month', exportName: 'profitability_monthly', rowKey: r => r.month, columns: mcols, search: false, pageSize: 100, sort: { key: 'month', dir: 'desc' } });
    mt.el.classList.remove('card'); mt.el.style.boxShadow = 'none'; mt.setRows(P.monthly);
    const gcols = [
      { key: 'key', label: 'Rental type', get: r => r.key },
      { key: 'contracts', label: 'Contracts', align: 'right', numeric: true, get: r => r.contracts },
      { key: 'avgFee', label: 'Avg fee', align: 'right', type: 'num', numeric: true, get: r => r.avgFee, html: r => R.amt(r.avgFee) },
      { key: 'avgCost', label: 'Avg Cardoo cost', align: 'right', type: 'num', numeric: true, get: r => r.avgCost, html: r => R.amt(r.avgCost) },
      { key: 'fees', label: 'Fees', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.fees, html: r => R.amt(r.fees) },
      { key: 'cost', label: 'Cardoo cost', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.cost, html: r => R.amt(r.cost) },
      { key: 'approved', label: 'Recoveries', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.approved, html: r => R.amt(r.approved) },
      { key: 'net', label: 'Net', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.net, html: r => `<span class="amt big" style="color:var(--${r.net >= 0 ? 'green' : 'rose'})">${U.money(r.net)}</span>` },
      { key: 'owing', label: 'Still owing', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.owing, html: r => R.amt(r.owing) }
    ];
    const rt = new DataTable($('#pfRental', el), { title: 'Profitability by rental type', exportName: 'profitability_rental_type', rowKey: r => r.key, columns: gcols, search: false, pageSize: 50 });
    rt.el.classList.remove('card'); rt.el.style.boxShadow = 'none'; rt.setRows(P.byRental);
    this.chart(P);
  },
  /** Actual Cardoo invoices vs estimate, for the period the imported invoices cover */
  actualCard() {
    const C = App.model.cardoo; if (!C || !C.invoices.length) return `<div class="notice mt">${icon('info')}<span>Import Cardoo's 15-day invoices (PO PDF + booking_details Excel) to replace the estimated Cardoo cost with what Cardoo actually charged.</span></div>`;
    const s = C.summary, cur = App.model.settings.general.currency, cv = s.cover;
    const billed = new Map(); C.lines.forEach(l => billed.set(+l.contract_no, (billed.get(+l.contract_no) || 0) + (+l.price_aed || 0)));
    const recs = App.model.records.filter(r => billed.has(r.contract_no));
    const fees = U.sum(recs, r => r.waiver_amount), costW = U.sum(recs, r => billed.get(r.contract_no));
    const costNo = U.r2(s.billedAed - costW);
    const net = U.r2(fees - costW);
    return `<div class="card mt"><div class="card-head"><div><h3>Actual Cardoo charges · invoices ${U.fmtDate(cv.from)} → ${U.fmtDate(cv.to)}</h3><p>Contracts Cardoo actually billed: waiver fee charged to the customer vs what Cardoo charged for them so far</p></div><span class="spacer"></span><a class="btn btn-sm" href="#/cardoo">Cardoo account ${icon('arrow-right')}</a></div>
      <div class="card-body"><div class="grid g-2" style="gap:18px"><table class="ledger">
        <tr><td>Waiver contracts billed by Cardoo</td><td>${recs.length}</td></tr>
        <tr><td>Waiver fees charged on these contracts</td><td>${U.money(fees)}</td></tr>
        <tr><td>Cardoo charges on these contracts (imported invoices)</td><td>−${U.money(costW)}</td></tr>
        <tr class="total"><td>Margin on billed contracts so far</td><td style="color:var(--${net >= 0 ? 'green' : 'rose'})">${U.money(net)}</td></tr>
        <tr><td>Billed for bookings without a waiver fee</td><td>−${U.money(costNo)}</td></tr>
        <tr class="sub"><td>credits for early closures (included)</td><td>${U.money(s.credits)}</td></tr>
        <tr class="sub"><td>avoidable (billed after Caryaati close)</td><td>${U.money(s.avoidable)}</td></tr></table>
        <div><div class="ratio"><span>Paid to Cardoo (all invoices)</span><b>${cur} ${U.money(s.paidAed)}</b></div><div class="ratio"><span>Offset against claims</span><b>${cur} ${U.money(s.offsetAed)}</b></div>
          <div class="ratio"><span>Still due to Cardoo</span><b>USD ${U.money(s.balanceUsd)}</b></div><div class="ratio"><span>Claims approved, not received</span><b>${cur} ${U.money(s.claimsReceivable)}</b></div>
          <div class="ratio"><span>Net cash position with Cardoo</span><b style="color:var(--${s.netPosition >= 0 ? 'green' : 'rose'})">${cur} ${U.money(s.netPosition)}</b></div>
          <p class="small muted mt-sm">Long-term bookings are billed every period, so this margin moves as more 15-day invoices are imported. Import older invoices to see the full actual cost.</p></div></div></div></div>`;
  },
  chart(P) {
    if (!global.Chart) return;
    if (State.charts.profit) State.charts.profit.destroy();
    const css = getComputedStyle(document.documentElement), v = n => css.getPropertyValue(n).trim();
    const rows = P.monthly.slice(-15);
    State.charts.profit = new Chart($('#pfChart'), {
      data: { labels: rows.map(r => U.monthLabel(r.month)), datasets: [
        { type: 'bar', label: 'Waiver fees', data: rows.map(r => r.fees), backgroundColor: 'rgba(20,184,166,.75)', borderRadius: 5, maxBarThickness: 22 },
        { type: 'bar', label: 'Cardoo cost', data: rows.map(r => r.cost), backgroundColor: 'rgba(244,63,94,.65)', borderRadius: 5, maxBarThickness: 22 },
        { type: 'line', label: 'Net incl. recoveries', data: rows.map(r => r.net), borderColor: '#6366f1', backgroundColor: '#6366f1', tension: .3, pointRadius: 2.5, borderWidth: 2 }
      ] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, font: { size: 11 } } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${U.money(c.raw)}` } } },
        scales: { y: { grid: { color: v('--border') }, ticks: { callback: x => U.compact(x), font: { size: 10.5 } } }, x: { grid: { display: false }, ticks: { font: { size: 10.5 } } } } }
    });
  },
  xlsx() {
    const P = this.data, wb = XLSX.utils.book_new();
    const sum = [['Metric', 'Value'], ['Period', `${P.range.from || 'start'} to ${P.range.to || 'today'}`], ['Waiver contracts', P.contracts], ['Waiver fees charged', P.fees], ['Cardoo bookings', P.bookings],
      ['Cardoo cost (est.)', P.cost], ['  short-term', P.costShort], ['  long-term', P.costLong], ['  bookings without waiver fee', P.costNoWaiver], ['Fee margin', P.margin], ['Fee margin %', P.marginPct],
      ['Fee coverage (x)', P.feeCoverage], ['Cardoo recoveries approved', P.approved], ['Net program value', P.net], ['Still claimable', P.pendingClaimAmount], ['Potential value', P.potential],
      ['Excess claimed', P.claimedExcess], ['Excess rejected', P.rejectedExcess], ['Recovery rate %', P.recoveryRate], ['Claim rate %', P.claimRate],
      ['Rent collected', P.rentCollected], ['Rent VAT', P.rentVat], ['Outstanding (closed)', P.owingAmount], ['Window expired', P.expiredAmount], ['Not covered', P.notCoveredAmount], ['Profitable', P.profitable ? 'Yes' : 'No']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(P.monthly), 'Monthly');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(P.byType), 'By booking type');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(P.byCover), 'By cover');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(P.byRental), 'By rental type');
    XLSX.writeFile(wb, `cardoo_profitability_${U.todayISO()}.xlsx`, { compression: true });
    Toast.ok('Profitability workbook downloaded');
  },
  pdf() {
    const P = this.data, doc = Exporter.pdfDoc('portrait'); if (!doc) return;
    const cur = App.model.settings.general.currency, A = Exporter.ascii;
    let y = Exporter.pdfHeader(doc, 'Cardoo Deposit-Waiver Profitability', `${P.range.from || 'start'} to ${P.range.to || 'today'}`);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(P.net > 0 ? 5 : 225, P.net > 0 ? 150 : 29, P.net > 0 ? 105 : 72);
    doc.text(A(P.net > 0 ? `PROFITABLE - net ${cur} ${U.money(P.net)}` : `NOT PROFITABLE - net ${cur} ${U.money(P.net)}`), 36, y + 4);
    doc.setFont('helvetica', 'normal'); y += 16;
    const tbl = (head, body, opts) => { doc.autoTable(Object.assign({ startY: y, head: [head], body, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 4 }, headStyles: { fillColor: [241, 244, 249], textColor: [71, 85, 105] }, margin: { left: 36, right: 36 } }, opts || {})); y = doc.lastAutoTable.finalY + 12; };
    tbl(['Program P&L', `Amount (${cur})`], [['Waiver fees charged', U.money(P.fees)], ['Cardoo fees - short-term', '-' + U.money(P.costShort)], ['Cardoo fees - long-term', '-' + U.money(P.costLong)],
      [`  of which without waiver fee (${P.bookingsNoWaiver})`, U.money(P.costNoWaiver)], ['Fee margin', U.money(P.margin)], ['Cardoo recoveries (approved)', '+' + U.money(P.approved)], ['Net program value', U.money(P.net)],
      ['Still claimable inside window', U.money(P.pendingClaimAmount)], ['Potential value', U.money(P.potential)]], { columnStyles: { 1: { halign: 'right' } } });
    tbl(['Key ratios', 'Value'], [['Waiver contracts', U.int(P.contracts)], ['Avg waiver fee', U.money(P.avgFee)], ['Avg Cardoo cost per booking', U.money(P.avgCost)], ['Fee coverage', P.feeCoverage == null ? '-' : P.feeCoverage + 'x'],
      ['Fee margin', P.marginPct + '%'], ['Closed contracts with a claim', P.claimRate + '%'], ['Recovery rate', P.recoveryRate + '%'], ['Rent collected (waiver customers)', U.money(P.rentCollected)],
      ['Outstanding on closed contracts', U.money(P.owingAmount)], ['Window expired (not claimable)', U.money(P.expiredAmount)], ['Never covered by Cardoo', U.money(P.notCoveredAmount)]], { columnStyles: { 1: { halign: 'right' } } });
    tbl(['Booking type', 'Contracts', 'Fees', 'Cardoo cost', 'Recoveries', 'Net'], P.byType.map(x => [x.key, x.contracts, U.money(x.fees), U.money(x.cost), U.money(x.approved), U.money(x.net)]), { columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } } });
    tbl(['Month', 'Contracts', 'Fees', 'Cardoo cost', 'Margin', 'Recoveries', 'Net'], P.monthly.map(x => [U.monthLabel(x.month), x.contracts, U.money(x.fees), U.money(x.cost), U.money(x.margin), U.money(x.approved), U.money(x.net)]), { columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } } });
    doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
    doc.text(doc.splitTextToSize('Cardoo fees are estimated: short-term Total price; long-term Monthly price x months from start to close (or end). Recoveries = approved amounts of claims In Recovery.', doc.internal.pageSize.getWidth() - 72), 36, Math.min(y, doc.internal.pageSize.getHeight() - 50));
    Exporter.pdfFooter(doc); doc.save(`cardoo_profitability_${U.todayISO()}.pdf`);
    Toast.ok('Profitability PDF downloaded');
  }
};

/* =====================================================================
   Cardoo 15-day invoices (PO) — import helpers
   ===================================================================== */
const PO = {
  pdfjs() {
    if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = CONFIG.PDFJS;
      s.onload = () => { try { global.pdfjsLib.GlobalWorkerOptions.workerSrc = CONFIG.PDFJS_WORKER; } catch (e) { /* */ } res(global.pdfjsLib); };
      s.onerror = () => rej(new Error('PDF reader could not be loaded (check internet connection).'));
      document.head.appendChild(s);
    });
  },
  async pdfText(file) {
    const lib = await PO.pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let t = '';
    for (let i = 1; i <= doc.numPages; i++) { const c = await (await doc.getPage(i)).getTextContent(); t += c.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n'; }
    return t;
  },
  slot(po) { return State.poImports[po] || (State.poImports[po] = { po_no: po, pdf: null, lines: null }); },
  async addPdf(f) {
    const h = Engine.parsePoText(await PO.pdfText(f));
    if (!h.po_no) h.po_no = Engine.poFromName(f.name);
    if (!h.po_no) throw new Error('No Cardoo invoice number (PO_xxxxx) found in this PDF.');
    PO.slot(h.po_no).pdf = { file: f, header: h };
    return h.po_no;
  },
  addLines(f, det) {
    const norm = Engine._norm_po_lines(det);
    let po = Engine.poFromName(f.name);
    if (!po) {   // pair with a PDF that has no lines yet
      const lonely = Object.values(State.poImports).filter(x => x.pdf && !x.lines);
      if (lonely.length === 1) po = lonely[0].po_no;
    }
    if (!po) po = 'PO_?' + (Object.keys(State.poImports).length + 1);
    PO.slot(po).lines = { file: f, norm };
    return po;
  },
  /** compare a pending PO with what is already stored */
  state(x) {
    const inv = (State.cd && State.cd.invoices || []).find(i => i.po_no === x.po_no);
    const h = x.pdf ? x.pdf.header : {};
    const lt = x.lines ? x.lines.norm.stats : null;
    const issues = [];
    if (/\?/.test(x.po_no)) issues.push('PO number unknown — type it in');
    if (h.total_aed != null && lt && Math.abs(h.total_aed - lt.total_aed) > 0.05) issues.push(`PDF total AED ${U.money(h.total_aed)} ≠ lines AED ${U.money(lt.total_aed)}`);
    if (h.qty && x.lines && h.qty !== x.lines.norm.rows.length) issues.push(`PDF qty ${h.qty} ≠ ${x.lines.norm.rows.length} lines`);
    if (h.total_usd != null && lt && Math.abs(h.total_usd - lt.total_usd) > 0.05) issues.push(`PDF USD ${U.money(h.total_usd)} ≠ lines USD ${U.money(lt.total_usd)}`);
    let status = inv ? 'update' : 'new';
    if (inv && (!x.pdf || inv.has_pdf) && (!x.lines || (inv.has_lines && +inv.lines_count === x.lines.norm.rows.length && Math.abs((+inv.lines_total_aed || 0) - lt.total_aed) < 0.01))) status = 'same';
    return { inv, h, lt, issues, status };
  },
  async save(list) {
    const out = [];
    for (const x of list) {
      const h = x.pdf ? Object.assign({}, x.pdf.header, { has_pdf: true, pdf_file: x.pdf.file.name }) : {};
      const inv = Object.assign({ po_no: x.po_no }, h, x.lines ? { lines_file: x.lines.file.name } : {});
      const lines = x.lines ? x.lines.norm.rows.map(l => Object.assign({}, l, { row_key: `${x.po_no}|${l.row_key}`, po_no: x.po_no })) : null;
      out.push(await API.call('dw_import_po', { p_invoice: inv, p_lines: lines }));
    }
    return out;
  },
  panel(el) {
    const box = $('#poPanel', el); if (!box) return;
    const list = Object.values(State.poImports).sort((a, b) => a.po_no.localeCompare(b.po_no));
    if (!list.length) { box.innerHTML = ''; return; }
    const canSync = App.canManage();
    box.innerHTML = `<div class="card mt"><div class="card-head"><div><h3>Cardoo 15-day invoices</h3><p>PDF invoice + booking_details Excel per PO. Old and new POs can be imported in any order; the same PO is updated, never duplicated.</p></div></div>
      <div class="card-body" style="padding:0"><table class="tbl"><thead><tr><th>PO</th><th>Issue date</th><th>Period</th><th>PDF</th><th>Lines (Excel)</th><th class="right">Total AED</th><th class="right">Total USD</th><th>Check</th><th>Database</th><th></th></tr></thead><tbody>
      ${list.map(x => { const s = PO.state(x); const h = s.h, lt = s.lt;
        return `<tr><td>${/\?/.test(x.po_no) ? `<input class="link-input mono" style="width:110px" data-po-fix="${U.esc(x.po_no)}" placeholder="PO_27480">` : `<span class="mono">${U.esc(x.po_no)}</span>`}</td>
          <td>${h.issue_date ? U.fmtDate(h.issue_date) : s.inv && s.inv.issue_date ? `<span class="muted">${U.fmtDate(s.inv.issue_date)}</span>` : '—'}</td>
          <td class="nowrap">${h.period_from ? `${U.fmtDate(h.period_from)} → ${U.fmtDate(h.period_to)}` : s.inv && s.inv.period_from ? `<span class="muted">${U.fmtDate(s.inv.period_from)} → ${U.fmtDate(s.inv.period_to)}</span>` : '—'}</td>
          <td class="small">${x.pdf ? `${icon('check')} ${U.esc(x.pdf.file.name)}` : s.inv && s.inv.has_pdf ? '<span class="muted">stored</span>' : '<span style="color:var(--amber)">missing</span>'}</td>
          <td class="small">${x.lines ? `${icon('check')} ${x.lines.norm.rows.length} lines${x.lines.norm.stats.credits ? ` · ${x.lines.norm.stats.credits} credits` : ''}` : s.inv && s.inv.has_lines ? `<span class="muted">${s.inv.lines_count} stored</span>` : '<span style="color:var(--amber)">missing</span>'}</td>
          <td class="right amt">${h.total_aed != null ? U.money(h.total_aed) : lt ? U.money(lt.total_aed) : '—'}</td>
          <td class="right amt">${h.total_usd != null ? U.money(h.total_usd) : lt ? U.money(lt.total_usd) : '—'}</td>
          <td>${s.issues.length ? `<span class="flag t-rose" title="${U.esc(s.issues.join('\n'))}">${s.issues.length} issue(s)</span>` : x.pdf && x.lines ? '<span class="flag t-green">PDF = lines</span>' : '<span class="flag t-slate">partial</span>'}</td>
          <td>${s.status === 'new' ? '<span class="chip t-green">new</span>' : s.status === 'same' ? '<span class="chip t-slate">already stored</span>' : '<span class="chip t-amber">update</span>'}</td>
          <td><button class="icon-btn sm ghost" data-po-rm="${U.esc(x.po_no)}" title="Remove">${icon('x')}</button></td></tr>
          ${s.issues.length ? `<tr><td colspan="10" class="small" style="color:var(--rose);padding-top:0">${s.issues.map(U.esc).join(' · ')}</td></tr>` : ''}`; }).join('')}
      </tbody></table>
      <div class="toolbar" style="padding:10px 14px"><span class="small muted">Payments and claim offsets are recorded on the Cardoo Account page after import.</span><span class="spacer"></span>
        <button class="btn btn-primary" id="poSave" ${canSync ? '' : 'disabled title="Only managers/admins can import"'}><span class="btn-label">${icon('database')} Save ${list.length} invoice(s)</span><span class="spinner"></span></button></div></div></div>`;
    $$('[data-po-rm]', box).forEach(b => b.addEventListener('click', () => { delete State.poImports[b.dataset.poRm]; PO.panel(el); }));
    $$('[data-po-fix]', box).forEach(inp => inp.addEventListener('change', () => {
      const v = Engine.poFromName(inp.value) || (inp.value.replace(/\D/g, '') ? 'PO_' + inp.value.replace(/\D/g, '') : null);
      if (!v) return Toast.warn('Enter a PO number like PO_27480');
      const old = State.poImports[inp.dataset.poFix]; delete State.poImports[inp.dataset.poFix];
      const t = PO.slot(v); t.lines = t.lines || old.lines; t.pdf = t.pdf || old.pdf; PO.panel(el);
    }));
    $('#poSave', box).addEventListener('click', async () => {
      const bad = list.filter(x => /\?/.test(x.po_no));
      if (bad.length) return Toast.warn('Type the missing PO number first');
      const b = $('#poSave', box); b.classList.add('loading'); b.disabled = true;
      try {
        const res = await PO.save(list);
        Toast.ok(`${res.length} Cardoo invoice(s) saved`, res.map(r => `${r.po_no}${r.new ? ' (new)' : ''}`).join(' · '));
        State.poImports = {};
        await App.load(false);
        State.ui.cardooTab = 'invoices'; location.hash = '#/cardoo';
      } catch (e) { Toast.err('Invoice import failed', e.message); }
      finally { b.classList.remove('loading'); b.disabled = false; }
    });
  }
};


/* =====================================================================
   Cardoo balance statement — import panel
   ===================================================================== */
const STMT = {
  add(f, det) {
    const p = Engine.parseStatement(det.rows, f.name);
    if (!p.rows.length) throw new Error('No transactions found in this statement.');
    p.fileObj = f;
    State.stmtImport = p;
    return p;
  },
  diff(p) {
    const cur = (State.cd && State.cd.statement) || [];
    const a = U.dayNum(p.period_from), b = U.dayNum(p.period_to);
    const inP = cur.filter(x => U.dayNum(x.entry_date) >= a && U.dayNum(x.entry_date) <= b);
    const oldK = new Set(inP.map(x => x.row_key)), newK = new Set(p.rows.map(x => x.row_key));
    return { existing: inP.length, inserted: p.rows.filter(x => !oldK.has(x.row_key)).length, unchanged: p.rows.filter(x => oldK.has(x.row_key)).length, removed: inP.filter(x => !newK.has(x.row_key)).length,
      newRows: p.rows.filter(x => !oldK.has(x.row_key)) };
  },
  panel(el) {
    const box = $('#stPanel', el); if (!box) return;
    const p = State.stmtImport;
    if (!p) { box.innerHTML = ''; return; }
    const d = STMT.diff(p), canSync = App.canManage();
    const types = Object.entries(p.totals).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const ok = Math.abs(p.sides.invoice) < 0.05 && Math.abs(p.sides.excess) < 0.05;
    const linkedPo = p.rows.filter(x => x.po_no).length, linkedClaims = p.rows.filter(x => x.claim_key && App.model.claimRows.some(c => c.row_key === x.claim_key)).length, claimRows = p.rows.filter(x => x.claim_key).length;
    box.innerHTML = `<div class="card mt"><div class="card-head"><div><h3>Cardoo balance statement · ${U.esc(p.file)}</h3><p>${U.fmtDate(p.period_from)} → ${U.fmtDate(p.period_to)} · ${U.int(p.rows.length)} transactions · ${p.balances.length} months</p></div><span class="spacer"></span>
        <button class="icon-btn sm ghost" id="stRm" title="Remove">${icon('x')}</button></div>
      <div class="card-body grid" style="gap:12px">
        <div class="stat-row">
          <div class="stat"><small>Invoice side (we owe Cardoo)</small><b>${U.money(p.sides.invoice)}</b><span>open at statement end</span></div>
          <div class="stat"><small>Excess side (Cardoo owes us)</small><b>${U.money(p.sides.excess)}</b><span>open at statement end</span></div>
          <div class="stat"><small>Closing balance printed</small><b>${p.lastCf == null ? '—' : U.money(p.lastCf)}</b><span>${p.lastCf != null && Math.abs(p.lastCf - p.sides.invoice - p.sides.excess) < 0.05 ? 'matches the transactions' : 'check'}</span></div>
          <div class="stat"><small>Linked</small><b>${linkedPo} PO</b><span>${linkedClaims} of ${claimRows} excess lines matched to claims</span></div>
          <div class="stat"><small>Database</small><b>${d.existing ? `+${d.inserted}` : 'new'}</b><span>${d.unchanged} same · ${d.removed} replaced</span></div>
        </div>
        <div class="notice ${ok ? 'green' : 'amber'}">${icon(ok ? 'check' : 'info')}<span>${ok ? 'Both sides net to zero by the statement date — every invoice and every excess in this file is settled, except what is listed as open.' : `Open at statement end: invoices ${U.money(p.sides.invoice)}, excesses ${U.money(p.sides.excess)}. They will show as open on the Cardoo Account page.`}
          Importing refreshes all statement rows from ${U.fmtDate(p.period_from)} to ${U.fmtDate(p.period_to)}; older rows stay. Manual payments/offsets dated inside this period are replaced by the statement.</span></div>
        <div class="dt-scroll card" style="max-height:240px"><table class="tbl"><thead><tr><th>Type</th><th>Meaning</th><th class="right">Lines</th><th class="right">Total AED</th></tr></thead><tbody>
          ${types.map(([t, v]) => `<tr><td>${U.esc(t)}</td><td class="small muted">${U.esc(Engine.STMT_LABEL[t] || '')} · ${Engine.stmtSide(t)} side</td><td class="right">${p.rows.filter(x => x.type === t).length}</td><td class="right amt">${U.money(v)}</td></tr>`).join('')}</tbody></table></div>
        ${p.issues.map(i => `<div class="notice amber">${icon('alert')}<span>${U.esc(i.text)}</span></div>`).join('')}
        <div class="toolbar"><span class="small muted">${d.inserted ? `${d.inserted} new transaction(s) since the last import.` : 'No new transactions compared with the database.'}</span><span class="spacer"></span>
          <button class="btn btn-primary" id="stSave" ${canSync ? '' : 'disabled title="Only managers/admins can import"'}><span class="btn-label">${icon('database')} Save statement</span><span class="spinner"></span></button></div>
      </div></div>`;
    $('#stRm', box).addEventListener('click', () => { State.stmtImport = null; STMT.panel(el); });
    $('#stSave', box).addEventListener('click', async () => {
      const b = $('#stSave', box); b.classList.add('loading'); b.disabled = true;
      try {
        const r = await API.call('dw_import_statement', { p_meta: { period_from: p.period_from, period_to: p.period_to, file_name: p.file, totals: p.totals, balances: p.balances }, p_rows: p.rows });
        Toast.ok('Cardoo statement imported', `${r.rows} rows · ${r.inserted} new · ${r.removed} replaced`);
        State.stmtImport = null;
        await App.load(false);
        State.ui.cardooTab = 'invoices'; location.hash = '#/cardoo';
      } catch (e) { Toast.err('Statement import failed', e.message); }
      finally { b.classList.remove('loading'); b.disabled = false; }
    });
  }
};

/* =====================================================================
   Cardoo Account view
   ===================================================================== */
Views.cardoo = {
  tabs: [['invoices', 'Invoices', 'indigo'], ['claims', 'Claims & excess', 'teal'], ['statement', 'Statement', 'slate'], ['monthly', 'Monthly', 'violet'], ['manual', 'Manual entries', 'green'], ['lines', 'Invoice lines', 'slate'], ['avoidable', 'Avoidable charges', 'rose']],
  statusTone: s => /overdue/i.test(s) ? 'rose' : /not on statement/i.test(s) ? 'slate' : /unpaid/i.test(s) ? 'amber' : /partly/i.test(s) ? 'orange' : 'green',
  claimTone: s => /^received/i.test(s) ? 'green' : /partly/i.test(s) ? 'orange' : /not on statement/i.test(s) ? 'violet' : 'amber',
  build(el) {
    const C = App.model.cardoo, s = C.summary, cur = App.model.settings.general.currency;
    if (State.cd && State.cd.missing) { el.innerHTML = `<div class="card empty-state"><div class="dz-ico">${icon('database')}</div><h3>Run the Cardoo migrations first</h3><p>Run migrations/SQL_003.sql and SQL_004.sql in the Supabase SQL Editor, then reload.</p></div>`; State.built.cardoo = false; return; }
    if (!C.invoices.length && !C.claims.length && !C.statementRows.length) { el.innerHTML = `<div class="card empty-state"><div class="dz-ico">${icon('receipt')}</div><h3>No Cardoo data yet</h3><p>Import the Cardoo balance statement (Balance_from_…xlsx) and/or the 15-day invoices (PO PDF + booking_details Excel) on the Import page.</p><a class="btn btn-primary" href="#/import">${icon('upload')}Import</a></div>`; State.built.cardoo = false; return; }
    State.ui.cardooTab = State.ui.cardooTab || 'invoices';
    const net = s.netPosition, st = s.statement;
    el.innerHTML = `
      <div class="verdict t-${Math.abs(net) < 0.01 ? 'green' : net > 0 ? 'teal' : 'amber'}"><span class="big">${icon('swap')}</span><div style="flex:1">
        <h3>${Math.abs(net) < 0.01 ? 'All settled with Cardoo' : net > 0 ? `Cardoo owes you ${cur} ${U.money(net)} (net)` : `You owe Cardoo ${cur} ${U.money(-net)} (net)`}</h3>
        <p>Open invoices ${cur} ${U.money(s.balanceAed)} (USD ${U.money(s.balanceUsd)}) · open claims receivable ${cur} ${U.money(s.claimsReceivable)}.
        ${st ? `Statement imported up to <b>${U.fmtDate(st.to)}</b>; anything after that comes from PO invoices and manual entries.` : 'No balance statement imported yet — balances come from PO invoices and manual entries.'}</p></div>
        <div class="btn-group"><button class="btn btn-primary btn-sm" id="cdPay">${icon('plus')}Record payment / offset</button>
        <div class="dd" data-dd><button class="btn btn-sm">${icon('download')}Export</button><div class="dd-menu"><button id="cdXls">${icon('xls')}Excel statement</button><button id="cdPdf">${icon('pdf')}PDF statement</button></div></div></div></div>
      <div class="pf-grid">
        ${Views.dashboard.kpi(s.overdue.length ? 't-rose' : 't-amber', 'clock', 'Open invoices (we owe)', `<small>${cur}</small>${U.money(s.balanceAed)}`, `USD ${U.money(s.balanceUsd)} · ${s.unpaid.length} open${s.overdue.length ? ` · <span class="chip sm t-rose">${s.overdue.length} overdue</span>` : ''}`)}
        ${Views.dashboard.kpi('t-teal', 'wallet', 'Receivable from Cardoo', `<small>${cur}</small>${U.money(s.claimsReceivable)}`, `${s.claimsOpen} open claim(s)${s.notOnStatement.length ? ` · ${s.notOnStatement.length} approved, not on statement` : ''}`)}
        ${Views.dashboard.kpi('t-indigo', 'receipt', 'Invoiced by Cardoo', `<small>${cur}</small>${U.compact(s.billedAed)}`, `${s.invoices} invoices${st ? ` since ${U.fmtDate(st.from)}` : ''}`)}
        ${Views.dashboard.kpi('t-sky', 'send', 'Paid to Cardoo', `<small>${cur}</small>${U.compact(s.paidAed)}`, `transfers · offset ${U.compact(s.offsetAed)} · bank fees ${U.money(s.feesAed)}`)}
        ${Views.dashboard.kpi('t-green', 'shield', 'Excess credited to us', `<small>${cur}</small>${U.compact(s.excessCredited)}`, `+ over-deposit compensation ${U.compact(s.compensation)}`)}
        ${Views.dashboard.kpi('t-green', 'check', 'Received from Cardoo', `<small>${cur}</small>${U.compact(s.receivedCard + s.receivedTransfer + s.excessOffset)}`, `card ${U.compact(s.receivedCard)} · offset ${U.compact(s.excessOffset)} · transfer ${U.compact(s.receivedTransfer)}`)}
        ${Views.dashboard.kpi('t-orange', 'user', 'Excess paid by customers', `<small>${cur}</small>${U.compact(s.paidByCustomer)}`, 'deducted by Cardoo — customer paid directly')}
        ${Views.dashboard.kpi('t-rose', 'alert', 'Avoidable charges', `<small>${cur}</small>${U.compact(s.avoidable)}`, `${s.avoidableLines} PO line(s) billed after Caryaati close`)}
      </div>
      ${s.amountDiffs.length || s.notOnStatement.length || s.superseded || s.invoicesNotOnStatement.length || s.invoicesMatchedWeak.length ? `<div class="grid g-3 mt" style="gap:10px">
        ${s.invoicesNotOnStatement.length ? `<div class="notice amber">${icon('alert')}<span><b>${s.invoicesNotOnStatement.length}</b> PO invoice(s) dated inside the statement period are not on the Cardoo statement (${s.invoicesNotOnStatement.slice(0, 4).map(i => i.po_no).join(', ')}) — not counted as owed. Ask Cardoo whether they were cancelled or re-issued.</span></div>` : ''}
        ${s.invoicesMatchedWeak.length ? `<div class="notice">${icon('info')}<span><b>${s.invoicesMatchedWeak.length}</b> PO invoice(s) linked to a statement line by date although the amount differs: ${s.invoicesMatchedWeak.slice(0, 4).map(i => `${i.po_no} (PDF ${U.money(i.pdf_total_aed)} vs ${U.money(i.total_aed)})`).join(', ')}.</span></div>` : ''}
        ${s.notOnStatement.length ? `<div class="notice">${icon('info')}<span><b>${s.notOnStatement.length}</b> claim(s) are In Recovery in the Excess report but not credited on the statement yet (${cur} ${U.money(U.sum(s.notOnStatement, c => c.open))}).</span></div>` : ''}
        ${s.amountDiffs.length ? `<div class="notice amber">${icon('alert')}<span><b>${s.amountDiffs.length}</b> claim(s) credited with a different amount than approved: ${s.amountDiffs.slice(0, 3).map(c => `#${c.contract_raw} ${U.money(c.amount)} vs ${U.money(c.approved)}`).join(', ')}.</span></div>` : ''}
        ${s.superseded ? `<div class="notice">${icon('info')}<span><b>${s.superseded}</b> manual entr${s.superseded === 1 ? 'y is' : 'ies are'} dated inside the statement period and replaced by the statement (kept for reference).</span></div>` : ''}</div>` : ''}
      <div class="filter-chips mt" id="cdTabs"></div>
      ${this.tabs.map(t => `<div id="cd_${t[0]}" hidden></div>`).join('')}`;
    $('#cdTabs', el).addEventListener('click', e => { const c = e.target.closest('[data-tab]'); if (c) { State.ui.cardooTab = c.dataset.tab; this.update(el); App.saveUI(); } });
    $('#cdPay', el).addEventListener('click', () => Actions.settle({}));
    $('#cdXls', el).addEventListener('click', () => this.xlsx());
    $('#cdPdf', el).addEventListener('click', () => this.pdf());
    el.querySelector('.verdict [data-dd] > .btn').addEventListener('click', e => { e.stopPropagation(); e.currentTarget.parentElement.classList.toggle('open'); });
    const mk = (id, o) => { State.tables['cd_' + id] = new DataTable($('#cd_' + id, el), o); return State.tables['cd_' + id]; };

    /* invoices */
    const inv = mk('invoices', { title: 'Cardoo invoices', exportName: 'cardoo_invoices', rowKey: r => r.key, sort: { key: 'issue_date', dir: 'desc' },
      columns: [
        { key: 'label', label: 'Invoice', get: r => r.label, html: r => `<span class="mono">${U.esc(r.label)}</span>${r.disputed ? ' <span class="flag t-rose">disputed</span>' : ''}<span class="cell-sub" title="${U.esc(r.source)}">${/^statement/.test(r.source) ? 'statement' + (/matched/.test(r.source) ? ' (linked)' : '') : U.esc(r.source)}${r.has_pdf ? ' · PDF' : ''}${r.has_lines ? ' · lines' : ''}</span>` },
        { key: 'issue_date', label: 'Issued', type: 'date', get: r => r.issue_date, sortGet: r => U.dayNum(r.issue_date), html: r => R.date(r.issue_date) },
        { key: 'period_from', label: 'Period', get: r => r.period_from ? `${r.period_from} - ${r.period_to}` : '', sortGet: r => U.dayNum(r.period_from), html: r => r.period_from ? `<div class="dates2" title="${r.period_inferred ? 'Worked out from the invoice date (Cardoo bills on the 1st and 16th)' : ''}">${r.period_inferred ? '~ ' : ''}${U.fmtDate(r.period_from)}<span>→ ${U.fmtDate(r.period_to)}</span></div>` : '<span class="zero">—</span>' },
        { key: 'total_aed', label: 'Total AED', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.total_aed, html: r => `${R.amt(r.total_aed, 'big')}${r.stmt_diff ? `<span class="cell-sub" title="Statement and PDF differ by ${U.money(r.stmt_diff)}">PDF ${U.money(r.pdf_total_aed)}</span>` : ''}` },
        { key: 'total_usd', label: 'USD', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.total_usd, html: r => R.amt(r.total_usd) },
        { key: 'paid_aed', label: 'Paid AED', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.paid_aed, html: r => R.amt(r.paid_aed) },
        { key: 'offset_aed', label: 'Offset AED', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.offset_aed, html: r => R.amt(r.offset_aed) },
        { key: 'balance_aed', label: 'Balance AED', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.balance_aed, html: r => `<span class="amt big" style="color:var(--${r.balance_aed > 0.01 ? 'rose' : 'green'})">${U.money(r.balance_aed)}</span>${r.balance_aed > 0.01 && r.balance_usd != null ? `<span class="cell-sub">USD ${U.money(r.balance_usd)}</span>` : ''}` },
        { key: 'balance_usd', label: 'Balance USD', type: 'num', get: r => r.balance_usd, hidden: true },
        { key: 'due_date', label: 'Due', type: 'date', get: r => r.due_date, sortGet: r => U.dayNum(r.due_date), html: r => r.not_on_statement ? '<span class="cell-sub">check with Cardoo</span>' : r.balance_aed > 0.01 ? `<span class="nowrap">${U.fmtDate(r.due_date)}</span>${r.overdue_days ? `<span class="cell-sub" style="color:var(--rose)">${r.overdue_days}d overdue</span>` : ''}` : `<span class="cell-sub">settled ${U.fmtDate(r.settled_on)}</span>` },
        { key: 'status', label: 'Status', get: r => r.status, html: r => `<span class="chip t-${this.statusTone(r.status)}">${r.status}</span>` },
        { key: 'act', label: '', sortable: false, export: false, html: r => `<div class="row-actions">${r.balance_aed > 0.01 ? `<button class="btn btn-xs btn-primary" data-pay="${U.esc(r.key)}">Pay</button><button class="btn btn-xs" data-off="${U.esc(r.key)}">Offset</button>` : ''}<button class="icon-btn sm" data-detail="${U.esc(r.key)}" title="Details">${icon('more')}</button></div>` }
      ],
      onRowClick: r => this.invoiceDetail(r) });
    inv.el.addEventListener('click', e => {
      const t = e.target.closest('[data-pay],[data-off],[data-detail]'); if (!t) return;
      const r = App.model.cardoo.invoices.find(x => x.key === (t.dataset.pay || t.dataset.off || t.dataset.detail));
      if (t.dataset.pay) Actions.settle({ kind: 'payment', inv: r.key });
      if (t.dataset.off) Actions.settle({ kind: 'offset', inv: r.key });
      if (t.dataset.detail) this.invoiceDetail(r);
    });

    /* claims & excess */
    const cl = mk('claims', { title: 'Cardoo claims & excess', exportName: 'cardoo_claims_excess', rowKey: r => r.key, selectable: true, sort: { key: 'credited_date', dir: 'desc' },
      bulk: `<button class="btn btn-xs btn-primary" data-bulk="offset">${icon('swap')}Offset vs invoice</button><button class="btn btn-xs" data-bulk="payout">${icon('check')}Payout received</button>`,
      toolbar: `<select class="select input-sm" id="cdClF" style="width:auto;min-width:170px"><option value="">All claims</option><option value="open">Open (not fully received)</option><option value="received">Received</option><option value="approved">Approved, not on statement</option><option value="diff">Amount differs</option></select>`,
      columns: [
        { key: 'contract_no', label: 'Contract', numeric: true, get: r => r.contract_raw || r.contract_no, sortGet: r => +r.contract_no, html: r => R.cno(r.contract_raw || r.contract_no || '—') },
        { key: '_name', label: 'Customer', get: r => r._name, html: r => `<span class="cell-main">${U.esc(r._name || '—')}</span><span class="cell-sub">${U.esc(r.type === 'Excess' ? r.title : r.type + (r.title && r.title !== r.type ? ' · ' + r.title : ''))}</span>` },
        { key: 'credited_date', label: 'Credited', type: 'date', get: r => r.credited_date, sortGet: r => U.dayNum(r.credited_date || (r.claim || {}).claim_date), html: r => r.credited_date ? R.date(r.credited_date) : '<span class="zero">not yet</span>' },
        { key: 'approved', label: 'Approved', align: 'right', type: 'num', numeric: true, get: r => r.approved, html: r => r.approved == null ? '<span class="zero">—</span>' : R.amt(r.approved) },
        { key: 'amount', label: 'Credited AED', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.amount, html: r => `${R.amt(r.amount, 'big')}${Math.abs(r.diff) > 0.01 ? `<span class="cell-sub" style="color:var(--amber)">${r.diff > 0 ? '+' : ''}${U.money(r.diff)} vs approved</span>` : ''}` },
        { key: 'settled', label: 'Received', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.settled, html: r => `${R.amt(r.settled)}${r.how ? `<span class="cell-sub">${U.esc(r.how)}</span>` : ''}` },
        { key: 'open', label: 'Open AED', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.open, html: r => `<span class="amt big" style="color:var(--${r.open > 0.01 ? 'amber' : 'green'})">${U.money(r.open)}</span>` },
        { key: 'state', label: 'Status', get: r => r.state, html: r => `<span class="chip t-${this.claimTone(r.state)}">${r.state}</span>${r.received_on ? `<span class="cell-sub">${U.fmtDate(r.received_on)}</span>` : ''}` }
      ],
      onRowClick: r => this.claimDetail(r) });
    $('#cdClF', el).value = State.ui.cdClaimF || '';
    $('#cdClF', el).addEventListener('change', e => { State.ui.cdClaimF = e.target.value; this.update(el); });
    cl.el.addEventListener('click', e => {
      const b = e.target.closest('[data-bulk]'); if (!b) return;
      const rows = cl.selectedRows().filter(x => x.open > 0.01);
      if (!rows.length) return Toast.warn('Select claims that still have an open amount');
      Actions.settle({ kind: b.dataset.bulk === 'offset' ? 'offset' : 'claim_payout', claim_keys: rows.map(x => x.key) });
    });

    /* statement */
    mk('statement', { title: 'Cardoo statement', exportName: 'cardoo_statement', rowKey: r => r.row_key, sort: { key: 'entry_date', dir: 'desc' }, pageSize: 50,
      toolbar: `<select class="select input-sm" id="cdStT" style="width:auto;min-width:170px"><option value="">All types</option>${[...new Set(C.statementRows.map(x => x.type))].map(t => `<option>${U.esc(t)}</option>`).join('')}</select>`,
      columns: [
        { key: 'entry_date', label: 'Date', type: 'date', get: r => r.entry_date, sortGet: r => U.dayNum(r.entry_date) * 1000 + (r.seq || 0), html: r => R.date(r.entry_date) },
        { key: 'type', label: 'Type', get: r => r.type, html: r => `<span class="chip t-${r.side === 'invoice' ? (r.type === 'Invoice' ? 'indigo' : 'sky') : r.type === 'Excess' || r.type === 'Over deposit compensation' ? 'teal' : 'green'}">${U.esc(r.type)}</span><span class="cell-sub">${U.esc(Engine.STMT_LABEL[r.type] || '')}</span>` },
        { key: 'description', label: 'Description', get: r => r.description || '', html: r => `${U.esc(r.description || '')}${r.contract_no && App.model.byNo.get(+r.contract_no) ? `<span class="cell-sub">${U.esc(App.model.byNo.get(+r.contract_no).name)}</span>` : ''}` },
        { key: 'side', label: 'Side', get: r => r.side === 'invoice' ? 'We owe Cardoo' : r.side === 'excess' ? 'Cardoo owes us' : r.side },
        { key: 'amount_aed', label: 'Amount AED', align: 'right', type: 'num', numeric: true, get: r => +r.amount_aed, html: r => `<span class="amt" style="color:var(--${+r.amount_aed < 0 ? 'green' : 'text'})">${U.money(r.amount_aed)}</span>` }
      ],
      onRowClick: r => r.contract_no && App.model.byNo.get(+r.contract_no) && Drawer.open(+r.contract_no) });
    $('#cdStT', el).value = State.ui.cdStType || '';
    $('#cdStT', el).addEventListener('change', e => { State.ui.cdStType = e.target.value; this.update(el); });

    /* monthly */
    const mon = mk('monthly', { title: 'Cardoo monthly summary', exportName: 'cardoo_monthly', rowKey: r => r.month, search: false, pageSize: 100, sort: { key: 'month', dir: 'desc' },
      columns: [
        { key: 'month', label: 'Month', get: r => U.monthLabel(r.month), sortGet: r => r.month },
        { key: 'invoiced', label: 'Invoiced', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.invoiced, html: r => R.amt(r.invoiced) },
        { key: 'paid', label: 'We paid', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.paid, html: r => R.amt(r.paid) },
        { key: 'inv_offset', label: 'Offset', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.inv_offset, html: r => R.amt(r.inv_offset) },
        { key: 'excess', label: 'Excess credited', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.excess, html: r => R.amt(r.excess) },
        { key: 'compensation', label: 'Compensation', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.compensation, html: r => R.amt(r.compensation) },
        { key: 'card', label: 'Card received', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.card, html: r => R.amt(r.card) },
        { key: 'transfer', label: 'Transfer received', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.transfer, html: r => R.amt(r.transfer) },
        { key: 'customer', label: 'Paid by customer', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.customer, html: r => R.amt(r.customer) },
        { key: 'net_cardoo', label: 'Excess − invoices', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.net_cardoo, html: r => `<span class="amt big" style="color:var(--${r.net_cardoo >= 0 ? 'green' : 'rose'})">${U.money(r.net_cardoo)}</span>` }
      ] });
    mon.el.classList.add('mt-sm');

    /* manual entries */
    const kinds = { payment: ['Payment to Cardoo', 'sky'], offset: ['Offset vs claims', 'teal'], claim_payout: ['Claim payout received', 'green'], adjustment: ['Adjustment', 'slate'] };
    const led = mk('manual', { title: 'Manual Cardoo entries', exportName: 'cardoo_manual_entries', rowKey: r => r.id, sort: { key: 'entry_date', dir: 'desc' },
      columns: [
        { key: 'entry_date', label: 'Date', type: 'date', get: r => r.entry_date, sortGet: r => U.dayNum(r.entry_date), html: r => `${R.date(r.entry_date)}${r.superseded ? '<span class="cell-sub" style="color:var(--muted)">replaced by statement</span>' : ''}` },
        { key: 'kind', label: 'Type', get: r => (kinds[r.kind] || [r.kind])[0], html: r => `<span class="chip t-${r.superseded ? 'slate' : (kinds[r.kind] || [0, 'slate'])[1]}">${(kinds[r.kind] || [r.kind])[0]}</span>` },
        { key: 'po_no', label: 'Invoice', get: r => r.po_no || '', html: r => r.po_no ? `<span class="mono">${U.esc(r.po_no)}</span>` : '—' },
        { key: 'amount_aed', label: 'AED', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.amount_aed, html: r => R.amt(r.amount_aed) },
        { key: 'amount_usd', label: 'USD', align: 'right', type: 'num', sum: true, numeric: true, get: r => r.amount_usd, html: r => R.amt(r.amount_usd) },
        { key: 'claims', label: 'Claims', get: r => (r.claim_allocs && r.claim_allocs.length ? r.claim_allocs : r.claim_keys || []).length, html: r => { const a = r.claim_allocs && r.claim_allocs.length ? r.claim_allocs : (r.claim_keys || []).map(k => ({ key: k })); return a.length ? `${a.length} claim(s)<span class="cell-sub">${a.slice(0, 3).map(x => '#' + String(x.key).split('|')[0] + (x.aed != null ? ' ' + U.money(x.aed) : '')).join(', ')}</span>` : '—'; } },
        { key: 'reference', label: 'Reference', get: r => r.reference || '' },
        { key: 'created_by', label: 'By', get: r => r.created_by || '' },
        { key: 'act', label: '', sortable: false, export: false, html: r => `<div class="row-actions"><button class="btn btn-xs" data-edit="${r.id}">Edit</button><button class="icon-btn sm" data-del="${r.id}" title="Delete">${icon('trash')}</button></div>` }
      ] });
    led.el.addEventListener('click', async e => {
      const ed = e.target.closest('[data-edit]'), dl = e.target.closest('[data-del]');
      if (ed) Actions.settle(App.model.cardoo.settlements.find(x => String(x.id) === ed.dataset.edit));
      if (dl && await Modal.confirm('Delete this entry?', 'Invoice balances and claim status are recalculated.', 'Delete', true)) {
        try { await API.call('dw_delete_settlement', { p_id: +dl.dataset.del }); await App.reloadCardoo(); Toast.ok('Entry deleted'); } catch (x) { Toast.err('Could not delete', x.message); }
      }
    });

    /* PO lines + avoidable */
    const lineCols = [
      { key: 'po_no', label: 'PO', get: r => r.po_no, html: r => `<span class="mono small">${U.esc(r.po_no)}</span>` },
      { key: 'contract_no', label: 'Contract', numeric: true, get: r => r.contract_raw || r.contract_no, sortGet: r => +r.contract_no, html: r => R.cno(r.contract_raw || r.contract_no) },
      { key: '_name', label: 'Customer', get: r => r._name, html: r => `<span class="cell-main">${U.esc(r._name || '—')}</span>` },
      { key: 'booking_type', label: 'Type', get: r => r.booking_type || '' },
      { key: 'start_at', label: 'Booking', get: r => r.start_at, sortGet: r => U.dayFrac(r.start_at), html: r => `<div class="dates2">${U.fmtDate(r.start_at)}<span>→ ${U.fmtDate(r.end_at)}</span></div>` },
      { key: 'close_at', label: 'Cardoo closed', type: 'date', get: r => r.close_at, html: r => r.close_at ? R.date(r.close_at) : '<span class="zero">open</span>' },
      { key: '_car_close', label: 'Caryaati closed', type: 'date', get: r => r._car_close, html: r => r._car_close ? R.date(r._car_close) : '<span class="zero">—</span>' },
      { key: 'price_aed', label: 'Charged AED', align: 'right', type: 'num', sum: true, numeric: true, get: r => +r.price_aed, html: r => `<span class="amt" style="color:var(--${+r.price_aed < 0 ? 'green' : 'text'})">${U.money(r.price_aed)}</span>` },
      { key: '_flags', label: 'Checks', get: r => r._flags.join(', '), html: r => r._flags.map(f => `<span class="flag t-${/Credit/.test(f) ? 'green' : /after/.test(f) ? 'rose' : 'amber'}">${f}</span>`).join(' ') }
    ];
    mk('lines', { title: 'Cardoo invoice lines', exportName: 'cardoo_invoice_lines', rowKey: r => r.row_key, columns: lineCols, sort: { key: 'contract_no', dir: 'desc' },
      toolbar: `<select class="select input-sm" id="cdPoSel" style="width:auto;min-width:150px"><option value="">All PO invoices</option>${[...new Set(C.lines.map(l => l.po_no))].sort().reverse().map(p => `<option>${U.esc(p)}</option>`).join('')}</select>`,
      emptyText: 'Import PO booking_details Excel files to see line-by-line charges.',
      onRowClick: r => r._rec && Drawer.open(+r.contract_no) });
    $('#cdPoSel', el).addEventListener('change', e => { State.ui.cardooPo = e.target.value; this.update(el); });
    mk('avoidable', { title: 'Avoidable Cardoo charges', exportName: 'cardoo_avoidable_charges', rowKey: r => r.row_key, columns: lineCols, sort: { key: 'price_aed', dir: 'desc' },
      toolbar: `<button class="btn btn-sm" id="cdDispute">${icon('copy')}Copy dispute text</button>`, emptyText: 'No charges after the Caryaati contract closed. 👍',
      onRowClick: r => r._rec && Drawer.open(+r.contract_no) });
    $('#cdDispute', el).addEventListener('click', async () => {
      const Ls = App.model.cardoo.lines.filter(l => l._avoidable);
      if (!Ls.length) return Toast.warn('Nothing to dispute');
      const txt = `Dear Cardoo team,\n\nThe following bookings were charged although the rental contracts were already closed on our side before the billing period. Please close these bookings and credit the charges:\n\n${Ls.map(l => `- ${l.po_no} · contract ${l.contract_raw || l.contract_no} · closed ${U.fmtDate(l._car_close)} · charged AED ${U.money(l.price_aed)}`).join('\n')}\n\nTotal: AED ${U.money(U.sum(Ls, l => l.price_aed))}\n\nThank you,\n${App.model.settings.general.company_name}`;
      if (await Actions.copy(txt)) Toast.ok('Dispute text copied');
    });
  },
  update(el) {
    const C = App.model.cardoo; if (!State.tables.cd_invoices) return;
    const tab = State.ui.cardooTab;
    const cf = State.ui.cdClaimF || '';
    const claims = C.claims.filter(c => !cf || (cf === 'open' ? c.open > 0.01 : cf === 'received' ? c.open <= 0.01 : cf === 'approved' ? c.source === 'approved' : Math.abs(c.diff) > 0.01));
    const sets = { invoices: C.invoices, claims, statement: C.statementRows.filter(x => !State.ui.cdStType || x.type === State.ui.cdStType), monthly: C.monthly, manual: C.settlements,
      lines: C.lines.filter(l => !State.ui.cardooPo || l.po_no === State.ui.cardooPo), avoidable: C.lines.filter(l => l._avoidable) };
    const counts = { invoices: C.invoices.length, claims: C.claims.length, statement: C.statementRows.length, monthly: C.monthly.length, manual: C.settlements.length, lines: C.lines.length, avoidable: sets.avoidable.length };
    $('#cdTabs', el).innerHTML = this.tabs.map(([id, l, tone]) => `<button class="fchip t-${tone} ${tab === id ? 'active' : ''}" data-tab="${id}"><span class="dot"></span>${l}<i>${counts[id]}</i></button>`).join('');
    this.tabs.forEach(([id]) => { $('#cd_' + id, el).hidden = id !== tab; });
    const ps = $('#cdPoSel', el); if (ps) ps.value = State.ui.cardooPo || '';
    State.tables['cd_' + tab].setRows(sets[tab]);
  },
  partsTable(parts, total) {
    const lab = t => Engine.STMT_LABEL[t] || t;
    return parts.length ? `<table class="ledger">${parts.map(p => `<tr><td>${U.fmtDate(p.date)} · ${U.esc(lab(p.type))}${p.manual ? ' <span class="flag t-slate">manual</span>' : ''}${p.carried ? ' <span class="flag t-violet">carried</span>' : ''}<span class="cell-sub">${U.esc(p.desc || '')}</span></td><td>${U.money(p.aed)}</td></tr>`).join('')}
      <tr class="total"><td>Remaining</td><td>${U.money(total - U.sum(parts, p => p.aed))}</td></tr></table>` : '<p class="muted small">Nothing settled yet.</p>';
  },
  invoiceDetail(r) {
    const cur = App.model.settings.general.currency;
    Modal.open({ title: `${U.esc(r.label)} · ${r.status}`, sub: `Issued ${U.fmtDate(r.issue_date)}${r.period_from ? ` · period ${U.fmtDate(r.period_from)} → ${U.fmtDate(r.period_to)}` : ''} · ${r.source}`,
      body: `<div class="money-grid"><div class="money"><small>Total</small><b>${cur} ${U.money(r.total_aed)}</b></div><div class="money"><small>USD</small><b>${U.money(r.total_usd)}</b></div><div class="money ${r.balance_aed > 0.01 ? 'hl' : 'ok'}"><small>Balance</small><b>${cur} ${U.money(r.balance_aed)}</b></div></div>
        ${r.stmt_diff ? `<div class="notice amber">${icon('info')}<span>Statement amount ${U.money(r.total_aed)} vs PDF ${U.money(r.pdf_total_aed)} (difference ${U.money(r.stmt_diff)}). The statement amount is used.</span></div>` : ''}
        <div class="panel"><h4>${icon('swap')}How it was settled</h4>${this.partsTable(r.parts, r.total_aed)}</div>
        ${r.notes ? `<div class="rm-item"><div class="meta">Notes</div>${U.esc(r.notes)}</div>` : ''}`,
      foot: `${r.po_no && App.model.cardoo.lines.some(l => l.po_no === r.po_no) ? `<button class="btn" id="idLines">${icon('doc')}Lines</button>` : ''}${r.po_no && (State.cd.invoices || []).some(i => i.po_no === r.po_no) ? `<button class="btn" id="idNote">${icon('note')}Notes / dispute</button>` : ''}<span class="spacer"></span>
        ${r.balance_aed > 0.01 ? `<button class="btn" id="idOff">Offset</button><button class="btn btn-primary" id="idPay">Pay</button>` : ''}<button class="btn" data-close>Close</button>`,
      onOpen: m => {
        const on = (id, fn) => { const b = $(id, m); if (b) b.addEventListener('click', fn); };
        on('#idLines', () => { Modal.close(); State.ui.cardooPo = r.po_no; State.ui.cardooTab = 'lines'; Views.render('cardoo'); });
        on('#idNote', () => { Modal.close(); Actions.invoiceNote((State.cd.invoices || []).find(i => i.po_no === r.po_no)); });
        on('#idPay', () => { Modal.close(); Actions.settle({ kind: 'payment', inv: r.key }); });
        on('#idOff', () => { Modal.close(); Actions.settle({ kind: 'offset', inv: r.key }); });
      } });
  },
  claimDetail(c) {
    const cur = App.model.settings.general.currency;
    Modal.open({ title: `${U.esc(c.title)} · ${c.state}`, sub: `${U.esc(c._name || '')}${c.credited_date ? ` · credited ${U.fmtDate(c.credited_date)}` : ''}`,
      body: `<div class="money-grid"><div class="money"><small>Approved (Excess report)</small><b>${c.approved == null ? '—' : U.money(c.approved)}</b></div><div class="money"><small>Credited by Cardoo</small><b>${U.money(c.amount)}</b></div><div class="money ${c.open > 0.01 ? 'hl' : 'ok'}"><small>Open</small><b>${cur} ${U.money(c.open)}</b></div></div>
        <div class="panel"><h4>${icon('check')}Received</h4>${this.partsTable(c.parts, c.amount)}</div>`,
      foot: `${c._rec ? `<button class="btn" id="cdOpen">Customer panel</button>` : ''}<span class="spacer"></span>${c.open > 0.01 ? `<button class="btn btn-primary" id="cdRec">Record received</button>` : ''}<button class="btn" data-close>Close</button>`,
      onOpen: m => {
        const o = $('#cdOpen', m); if (o) o.addEventListener('click', () => { Modal.close(); Drawer.open(+c.contract_no); });
        const rr = $('#cdRec', m); if (rr) rr.addEventListener('click', () => { Modal.close(); Actions.settle({ kind: 'claim_payout', claim_keys: [c.key] }); });
      } });
  },
  xlsx() {
    const C = App.model.cardoo, s = C.summary, wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Cardoo account', U.fmtDate(U.todayISO())], [], ['Open invoices AED', s.balanceAed], ['Open invoices USD', s.balanceUsd], ['Receivable from Cardoo AED', s.claimsReceivable],
      ['Net position AED (+ Cardoo owes us)', s.netPosition], ['Invoiced AED', s.billedAed], ['Paid AED', s.paidAed], ['Offset AED', s.offsetAed], ['Bank fees AED', s.feesAed], ['Excess credited AED', s.excessCredited],
      ['Over-deposit compensation AED', s.compensation], ['Received by card AED', s.receivedCard], ['Received by transfer AED', s.receivedTransfer], ['Excess offset AED', s.excessOffset], ['Paid by customers AED', s.paidByCustomer],
      ['Statement period', s.statement ? `${s.statement.from} to ${s.statement.to}` : '-']]), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(C.invoices.map(i => ({ invoice: i.label, source: i.source, issued: i.issue_date, period_from: i.period_from || '', period_to: i.period_to || '', total_aed: i.total_aed, total_usd: i.total_usd,
      paid_aed: i.paid_aed, offset_aed: i.offset_aed, fees_aed: i.fees_aed, balance_aed: i.balance_aed, balance_usd: i.balance_usd, due: i.due_date, status: i.status, settled_on: i.settled_on || '' }))), 'Invoices');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(C.claims.map(c => ({ contract: c.contract_raw, customer: c._name, title: c.title, type: c.type, credited: c.credited_date || '', approved: c.approved, credited_aed: c.amount,
      received_aed: c.settled, open_aed: c.open, received_by: c.how, status: c.state, received_on: c.received_on || '' }))), 'Claims & excess');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(C.monthly), 'Monthly');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(C.statementRows.map(x => ({ date: x.entry_date, type: x.type, description: x.description, amount_aed: +x.amount_aed, side: x.side, po: x.po_no || '', claim: x.claim_key || '' }))), 'Statement');
    if (C.settlements.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(C.settlements.map(x => ({ date: x.entry_date, kind: x.kind, po: x.po_no || '', aed: x.amount_aed, usd: x.amount_usd, reference: x.reference || '', superseded: x.superseded ? 'yes' : '' }))), 'Manual entries');
    XLSX.writeFile(wb, `cardoo_account_${U.todayISO()}.xlsx`, { compression: true });
    Toast.ok('Cardoo account workbook downloaded');
  },
  pdf() {
    const C = App.model.cardoo, s = C.summary, doc = Exporter.pdfDoc('portrait'); if (!doc) return;
    let y = Exporter.pdfHeader(doc, 'Cardoo Account Statement', s.statement ? `statement to ${s.statement.to}` : '');
    const tbl = (head, body, cs) => { doc.autoTable({ startY: y, head: [head], body, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 3 }, headStyles: { fillColor: [241, 244, 249], textColor: [71, 85, 105] }, columnStyles: cs || {}, margin: { left: 30, right: 30 } }); y = doc.lastAutoTable.finalY + 12; };
    const R2 = { 1: { halign: 'right' } };
    tbl(['Summary', 'AED'], [['Open invoices (we owe Cardoo)', U.money(s.balanceAed)], ['Receivable from Cardoo', U.money(s.claimsReceivable)], ['Net position (+ Cardoo owes us)', U.money(s.netPosition)],
      ['Invoiced by Cardoo', U.money(s.billedAed)], ['Paid by transfer', U.money(s.paidAed)], ['Offset', U.money(s.offsetAed)], ['Excess credited', U.money(s.excessCredited)], ['Over-deposit compensation', U.money(s.compensation)],
      ['Received by card', U.money(s.receivedCard)], ['Received by transfer', U.money(s.receivedTransfer)], ['Paid directly by customers', U.money(s.paidByCustomer)]], R2);
    const open = C.invoices.filter(i => i.balance_aed > 0.01);
    if (open.length) tbl(['Open invoice', 'Issued', 'Total AED', 'Balance AED', 'Due', 'Status'], open.map(i => [i.label, U.fmtDate(i.issue_date), U.money(i.total_aed), U.money(i.balance_aed), U.fmtDate(i.due_date), i.status]), { 2: { halign: 'right' }, 3: { halign: 'right' } });
    const oc = C.claims.filter(c => c.open > 0.01);
    if (oc.length) tbl(['Open claim', 'Customer', 'Credited', 'Open AED', 'Status'], oc.map(c => [Exporter.ascii(c.title), Exporter.ascii(c._name || ''), c.credited_date ? U.fmtDate(c.credited_date) : '-', U.money(c.open), c.state]), { 3: { halign: 'right' } });
    tbl(['Month', 'Invoiced', 'Paid', 'Offset', 'Excess', 'Card', 'By customer', 'Excess - invoices'], C.monthly.map(m => [U.monthLabel(m.month), U.money(m.invoiced), U.money(m.paid), U.money(m.inv_offset), U.money(m.excess + m.compensation), U.money(m.card + m.transfer), U.money(m.customer), U.money(m.net_cardoo)]),
      { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } });
    Exporter.pdfFooter(doc); doc.save(`cardoo_account_${U.todayISO()}.pdf`); Toast.ok('Cardoo account PDF downloaded');
  }
};

App.reloadCardoo = async function () {
  try { State.cd = await API.call('dw_get_cardoo'); } catch (e) { Toast.err('Could not reload Cardoo data', e.message); }
  App.rebuild(true);
};

/* ---------- payment / offset / payout form (AED first, per-claim partial amounts) ---------- */
Actions.settle = function (pre) {
  pre = pre || {};
  const C = App.model.cardoo, s = C.summary, cur = App.model.settings.general.currency;
  const editing = !!pre.id;
  let kind = pre.kind || 'payment';
  const invKey = pre.inv || (pre.po_no ? (C.invByPo.get(pre.po_no) || {}).key : null);
  const openInv = C.invoices.filter(i => i.balance_aed > 0.01 || i.key === invKey);
  // claim allocations: existing (when editing) or preselected keys
  const alloc = new Map();
  if (editing) (pre.claim_allocs && pre.claim_allocs.length ? pre.claim_allocs : (pre.claim_keys || []).map(k => ({ key: k, aed: null }))).forEach(a => alloc.set(a.key, a.aed));
  (pre.claim_keys && !editing ? pre.claim_keys : []).forEach(k => { const c = C.claims.find(x => x.key === k); if (c) alloc.set(k, c.open); });
  const ownAlloc = k => editing ? (alloc.get(k) || 0) : 0;   // when editing, this entry's own allocation is already deducted from c.open
  const avail = C.claims.filter(c => c.open > 0.01 || alloc.has(c.key));
  const stTo = s.statement ? s.statement.to : null;
  Modal.open({ title: editing ? 'Edit Cardoo entry' : 'Record Cardoo payment / offset', size: 'wide',
    sub: 'Amounts in AED (USD is converted with the invoice rate). Claims can be settled partly — the rest stays open.',
    body: `<div class="tpl-tabs" id="stKind">${[['payment', 'We paid Cardoo'], ['offset', 'Offset invoice vs claims'], ['claim_payout', 'Cardoo paid us (claims)'], ['adjustment', 'Adjustment / credit']].map(([k, l]) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="form-grid" style="grid-template-columns:2fr 1fr 1fr 1fr">
        <label class="field" id="stInvF"><span>Invoice</span><select class="select" id="stInv"><option value="">— none —</option>${openInv.map(i => `<option value="${U.esc(i.key)}" ${i.key === invKey || (editing && i.po_no === pre.po_no) ? 'selected' : ''}>${U.esc(i.label)} · open ${cur} ${U.money(i.balance_aed)}${i.balance_usd != null ? ` (USD ${U.money(i.balance_usd)})` : ''}</option>`).join('')}</select></label>
        <label class="field"><span>Date</span><input class="input" type="date" id="stDate" value="${pre.entry_date || U.todayISO()}"></label>
        <label class="field"><span>Amount AED</span><input class="input mono" type="number" step="0.01" id="stAed" value="${pre.amount_aed != null ? pre.amount_aed : ''}"></label>
        <label class="field"><span>Amount USD</span><input class="input mono" type="number" step="0.01" id="stUsd" value="${pre.amount_usd != null ? pre.amount_usd : ''}"></label>
      </div>
      <div class="form-grid" style="grid-template-columns:1fr 2fr"><label class="field"><span>Reference</span><input class="input" id="stRef" value="${U.esc(pre.reference || '')}" placeholder="Transfer ref / Cardoo offset date"></label>
        <label class="field"><span>Note</span><input class="input" id="stNote" value="${U.esc(pre.note || '')}"></label></div>
      <div id="stClaims"></div><div id="stWarn"></div><div class="small muted" id="stFx"></div>`,
    foot: `<span class="small muted" id="stSum"></span><span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="stGo">${icon('check')}Save</button>`,
    onOpen: m => {
      const inv = () => C.invoices.find(i => i.key === $('#stInv', m).value) || null;
      const fx = () => { const i = inv(); return (i && i.fx) || s.fx || Engine.DEFAULT_FX; };
      const claimMode = () => kind === 'offset' || kind === 'claim_payout';
      const allocTotal = () => U.r2([...alloc.values()].reduce((a, v) => a + (+v || 0), 0));
      const setAed = v => { $('#stAed', m).value = v ? U.r2(v) : ''; $('#stUsd', m).value = v ? U.r2(v / fx()) : ''; };
      const check = () => {
        const w = [], i = inv(), a = +$('#stAed', m).value || 0;
        if (stTo && U.dayNum($('#stDate', m).value) <= U.dayNum(stTo)) w.push(`This date is inside the imported Cardoo statement (up to ${U.fmtDate(stTo)}) — the entry will be shown but not counted, because the statement already contains what happened. Use a later date, or import a newer statement.`);
        if (i && (kind === 'payment' || kind === 'offset') && a - (i.balance_aed + (editing ? +pre.amount_aed || 0 : 0)) > 0.01) w.push(`Amount is more than the invoice's open balance (${cur} ${U.money(i.balance_aed)}).`);
        if (kind === 'offset' && Math.abs(allocTotal() - a) > 0.01 && alloc.size) w.push(`Claims selected total ${cur} ${U.money(allocTotal())}, amount entered ${cur} ${U.money(a)}.`);
        [...alloc.entries()].forEach(([k, v]) => { const c = C.claims.find(x => x.key === k); if (c && +v - (c.open + ownAlloc(k)) > 0.01) w.push(`#${c.contract_raw}: ${U.money(v)} is more than its open ${U.money(c.open + ownAlloc(k))}.`); });
        $('#stWarn', m).innerHTML = w.map(t => `<div class="notice amber" style="margin-bottom:6px">${icon('alert')}<span>${U.esc(t)}</span></div>`).join('');
        $('#stFx', m).textContent = `Exchange rate: 1 USD = ${Math.round(fx() * 10000) / 10000} AED${i ? ` (from ${i.label})` : ''}.`;
        $('#stSum', m).textContent = claimMode() ? `${alloc.size} claim(s) · ${cur} ${U.money(allocTotal())}` : '';
      };
      const drawClaims = () => {
        if (!claimMode()) { $('#stClaims', m).innerHTML = ''; return; }
        $('#stClaims', m).innerHTML = `<div class="field"><span>Claims settled by this entry — tick and adjust the amount (partial is fine, the rest stays open)</span></div>
          <div class="dt-scroll card" style="max-height:250px"><table class="tbl"><thead><tr><th class="cb"></th><th>Contract</th><th>Customer</th><th>Credited</th><th class="right">Open AED</th><th class="right">Apply AED</th></tr></thead><tbody>
          ${avail.length ? avail.map(c => { const on = alloc.has(c.key), open = U.r2(c.open + ownAlloc(c.key)); return `<tr><td class="cb"><label class="check"><input type="checkbox" data-ck="${U.esc(c.key)}" ${on ? 'checked' : ''}><span></span></label></td>
            <td>${R.cno(c.contract_raw || c.contract_no)}</td><td><span class="cell-main">${U.esc(c._name || '')}</span><span class="cell-sub">${U.esc(c.title)}</span></td><td class="small">${c.credited_date ? U.fmtDate(c.credited_date) : 'approved'}</td>
            <td class="right amt">${U.money(open)}</td><td class="right"><input class="link-input mono" style="width:100px;text-align:right" type="number" step="0.01" data-ca="${U.esc(c.key)}" value="${on ? U.r2(alloc.get(c.key) == null ? open : alloc.get(c.key)) : ''}" ${on ? '' : 'disabled'}></td></tr>`; }).join('')
            : '<tr><td colspan="6" class="muted" style="padding:16px;text-align:center">No open claims.</td></tr>'}</tbody></table></div>`;
      };
      $('#stKind', m).addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; $$('#stKind button', m).forEach(x => x.classList.toggle('on', x === b)); $('#stInvF', m).style.opacity = kind === 'claim_payout' ? .5 : 1; drawClaims(); check(); });
      $('#stAed', m).addEventListener('input', () => { const v = $('#stAed', m).value; $('#stUsd', m).value = v === '' ? '' : U.r2(+v / fx()); check(); });
      $('#stUsd', m).addEventListener('input', () => { const v = $('#stUsd', m).value; $('#stAed', m).value = v === '' ? '' : U.r2(+v * fx()); check(); });
      $('#stDate', m).addEventListener('change', check);
      $('#stInv', m).addEventListener('change', () => { const i = inv(); if (i && !editing && kind === 'payment') setAed(i.balance_aed); check(); });
      m.addEventListener('change', e => {
        if (e.target.dataset.ck) { const k = e.target.dataset.ck, c = C.claims.find(x => x.key === k); if (e.target.checked) alloc.set(k, U.r2(c.open + ownAlloc(k))); else alloc.delete(k); drawClaims(); setAed(allocTotal()); check(); }
      });
      m.addEventListener('input', e => { if (e.target.dataset.ca) { alloc.set(e.target.dataset.ca, +e.target.value || 0); $('#stSum', m).textContent = ''; setAed(allocTotal()); check(); } });
      $('#stInvF', m).style.opacity = kind === 'claim_payout' ? .5 : 1;
      drawClaims();
      if (!editing) { if (alloc.size) setAed(allocTotal()); else { const i = inv(); if (i && kind === 'payment') setAed(i.balance_aed); } }
      check();
      $('#stGo', m).addEventListener('click', async () => {
        const i = inv();
        const allocs = claimMode() ? [...alloc.entries()].filter(([, v]) => +v > 0).map(([k, v]) => ({ key: k, aed: U.r2(+v) })) : [];
        const entry = { kind, po_no: kind === 'claim_payout' ? null : (i ? i.po_no : null), entry_date: $('#stDate', m).value || U.todayISO(),
          amount_aed: $('#stAed', m).value === '' ? null : U.r2(+$('#stAed', m).value), amount_usd: $('#stUsd', m).value === '' ? null : U.r2(+$('#stUsd', m).value), fx: fx(),
          reference: $('#stRef', m).value.trim() || null, note: $('#stNote', m).value.trim() || null, claim_allocs: allocs, claim_keys: allocs.map(a => a.key) };
        if (pre.id) entry.id = pre.id;
        if (!entry.amount_aed && !entry.amount_usd) return Toast.warn('Enter an amount');
        if ((kind === 'payment' || kind === 'offset') && !entry.po_no) return Toast.warn(i && !i.po_no ? 'Older statement invoices are settled by the statement itself — choose a PO invoice' : 'Choose the invoice this settles');
        if (claimMode() && !allocs.length) return Toast.warn('Tick at least one claim');
        const b = $('#stGo', m); b.classList.add('loading'); b.disabled = true;
        try { await API.call('dw_save_settlement', { p_entry: entry }); Modal.close(); await App.reloadCardoo(); Toast.ok('Saved', `${cur} ${U.money(entry.amount_aed)}`); }
        catch (e) { Toast.err('Could not save', e.message); b.classList.remove('loading'); b.disabled = false; }
      });
    } });
};
Actions.invoiceNote = function (i) {
  if (!i) return;
  Modal.open({ title: `${i.po_no} · notes`, size: 'narrow',
    body: `<label class="field"><span>Notes</span><textarea class="input" id="inNote">${U.esc(i.notes || '')}</textarea></label>
      <label class="check"><input type="checkbox" id="inDisp" ${i.disputed ? 'checked' : ''}><span></span>Disputed with Cardoo</label>
      <label class="field"><span>Payment terms (business days)</span><input class="input" type="number" min="0" id="inTerms" value="${i.payment_terms_days || 3}"></label>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="inGo">${icon('check')}Save</button>`,
    onOpen: m => $('#inGo', m).addEventListener('click', async () => {
      try { await API.call('dw_update_invoice', { p_po: i.po_no, p_patch: { notes: $('#inNote', m).value, disputed: $('#inDisp', m).checked, payment_terms_days: +$('#inTerms', m).value || 3 } }); Modal.close(); await App.reloadCardoo(); Toast.ok('Invoice updated'); }
      catch (e) { Toast.err('Could not save', e.message); }
    }) });
};

/* =====================================================================
   Boot
   ===================================================================== */
global.DW = { Engine, U, App, State, API, Views, Actions, Drawer };
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.boot());
  else App.boot();
}
})(typeof window !== 'undefined' ? window : globalThis);
