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
    required: ['contract', 'start']
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
    company_name: 'Caryaati', company_phone: '', currency: 'AED', min_outstanding: 5,
    claim_after_days: 3, claim_after_reminders: 2, claim_deadline_days: 30, default_country_code: '971',
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
  not_covered:     { label: 'Not covered',           tone: 'rose',   group: 'collect', order: 5, hint: 'No active Cardoo booking — collect directly' },
  claim_rejected:  { label: 'Claim rejected',        tone: 'rose',   group: 'collect', order: 6, hint: 'Cardoo claim cancelled/declined — collect directly' },
  need_update:     { label: 'Claim · need update',   tone: 'orange', group: 'claim',   order: 7, hint: 'Cardoo requested more information' },
  claim_submitted: { label: 'Claim submitted',       tone: 'violet', group: 'claim',   order: 8, hint: 'Marked as submitted — waiting for Excess report' },
  recovery:        { label: 'In recovery',           tone: 'green',  group: 'claim',   order: 9, hint: 'Cardoo is recovering the amount' },
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
      for (const key of REPORT_ORDER) {
        const spec = REPORTS[key];
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
      const ph = U.phone(C(row, ci, 'mobile'), g.default_country_code);
      stats.phones[ph.kind] = (stats.phones[ph.kind] || 0) + 1;
      const vehicle = U.clean(C(row, ci, 'vehicle'));
      const my = U.num(C(row, ci, 'model'));
      const em = U.clean(C(row, ci, 'email'));
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

  /** Combine the five normalised reports into DB-ready tables (contracts & payments trimmed to linked contracts) */
  prepareSync(norm) {
    const linked = new Set();
    norm.waivers.rows.forEach(r => linked.add(r.contract_no));
    norm.bookings.rows.forEach(r => linked.add(r.contract_no));
    norm.claims.rows.forEach(r => linked.add(r.contract_no));
    const contracts = norm.contracts.rows.filter(r => linked.has(r.contract_no));
    const payments = norm.payments.rows.filter(r => linked.has(r.contract_no));
    const cset = new Set(norm.contracts.rows.map(r => r.contract_no));
    const missingContracts = [...linked].filter(n => !cset.has(n));
    // cross-check cleaned waiver names against the contracts report (the correct source)
    const cmap = new Map(contracts.map(c => [c.contract_no, c]));
    const nameMismatch = [];
    for (const w of norm.waivers.rows) {
      const c = cmap.get(w.contract_no);
      if (c && Engine.nameKey(c.customer_name) !== Engine.nameKey(w.customer_name)) nameMismatch.push({ contract_no: w.contract_no, waiver: w.customer_name, contract: c.customer_name });
    }
    return {
      tables: { waivers: norm.waivers.rows, contracts, payments, bookings: norm.bookings.rows, claims: norm.claims.rows },
      summary: {
        linkedContracts: linked.size, contractsKept: contracts.length, contractsTotal: norm.contracts.rows.length,
        paymentsKept: payments.length, paymentsTotal: norm.payments.rows.length, missingContracts, nameMismatch
      }
    };
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
      const ph = U.phone(k.phone_override || (c && (c.mobile || c.mobile_raw)), g.default_country_code);

      const r = {
        contract_no: no, waiver: w, contract: c, case: k, payments, bookings, claims,
        name: (c && c.customer_name) || w.customer_name,
        name_waiver: w.customer_name,
        email: c ? c.email : null,
        phone: ph.digits, phone_display: ph.display, phone_valid: ph.valid, phone_kind: ph.kind, phone_overridden: !!k.phone_override,
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
      // Claims summary
      const live = claims.filter(x => !/cancel|declin|reject/i.test(x.status));
      const primary = live[0] || claims[0] || null;
      r.claim = primary;
      r.claim_state = primary ? primary.status : null;
      r.claim_live = !!live.length;
      r.claim_excess = primary ? +primary.excess_sum : null;
      r.claim_approved = U.sum(live, x => x.approved_amount);
      // Dates & money
      r.days_since_close = r.close_date ? today - U.dayNum(r.close_date) : null;
      r.claim_deadline = r.close_date ? U.addDaysISO(r.close_date, +g.claim_deadline_days || 30) : null;
      r.days_to_deadline = r.claim_deadline ? U.dayNum(r.claim_deadline) - today : null;
      r.claimable = r.outstanding > 0 ? U.r2(Math.min(r.outstanding, r.coverage || 0)) : 0;
      r.uncovered = r.outstanding > 0 ? U.r2(Math.max(0, r.outstanding - (r.coverage || 0))) : 0;
      r.payment_link = k.payment_link || '';
      r.contact_count = +k.contact_count || 0;
      r.days_since_contact = k.first_contact_at ? today - U.dayNum(new Date(k.first_contact_at)) : null;
      r.last_contact_at = k.last_contact_at || null;
      Engine.assignStage(r, g, today, minOut);
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

    const model = { records, byNo, settings, orphanBookings, claimRows, bookingRows, paymentRows, contracts, lastBatch: ds.last_batch || null, user: ds.user || null };
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
    else if (r.claim_live && /recover|paid|approved|settled/i.test(r.claim_state)) s = 'recovery';
    else if (r.claim_live && /update|info|pending|review/i.test(r.claim_state)) s = 'need_update';
    else if (r.claim_live) s = 'recovery';
    else if (k.claim_submitted_at && (!r.claims.length || U.dayNum(k.claim_submitted_at) >= Math.max(...r.claims.map(x => U.dayNum(x.claim_date) || 0)))) s = 'claim_submitted';
    else if (k.on_hold) s = 'on_hold';
    else if (r.claims.length && !r.claim_live) s = 'claim_rejected';
    else if (r.booking_state !== 'active') s = 'not_covered';
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
    } else {
      if (r.outstanding > 0 && r.booking_state === 'active' && !r.claims.length && r.days_to_deadline != null && r.days_to_deadline <= 7 && !['settled', 'paid_marked', 'claim_submitted'].includes(r.stage))
        f.push({ t: r.days_to_deadline < 0 ? `Claim window passed ${-r.days_to_deadline}d` : `Claim due in ${r.days_to_deadline}d`, tone: r.days_to_deadline < 0 ? 'rose' : 'amber' });
      if (r.booking_running_after_close) f.push({ t: 'Close booking in Cardoo', tone: 'slate' });
    }
    if (k.promise_date && U.dayNum(k.promise_date) < today && r.stage !== 'settled' && r.status === 'Closed') f.push({ t: 'Promise missed', tone: 'rose' });
    if (r.status === 'Closed' && r.outstanding > 0 && !r.phone_valid) f.push({ t: 'Check phone', tone: 'amber' });
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
    add('deadline', 'Covered contracts close to / past the claim window', 'high',
      'Closed, outstanding, covered by Cardoo and no claim yet. Window = close date + configured days.',
      R.filter(r => r.status === 'Closed' && r.outstanding > 0 && r.booking_state === 'active' && !r.claims.length && !['settled', 'paid_marked', 'claim_submitted'].includes(r.stage) && r.days_to_deadline != null && r.days_to_deadline <= 7));
    add('close_booking', 'Closed contracts whose Cardoo booking is still running', 'medium',
      'The Cardoo booking has no close date and ends more than a day after the contract closed — close it in Cardoo (monthly bookings keep accruing fees).',
      R.filter(r => r.booking_running_after_close));
    add('orphan_booking', 'Cardoo bookings with no matching waiver contract', 'medium',
      'Booked in Cardoo but not in the Caryaati Deposit Waivers report — check whether a waiver fee was charged.',
      model.orphanBookings, 'bookings');
    add('orphan_claim', 'Cardoo claims for contracts not in the waiver report', 'low',
      'Claims exist in Cardoo for contracts missing from the waiver report.',
      model.claimRows.filter(x => !x._inWaivers), 'claims');
    add('multi_booking', 'Contracts with more than one active Cardoo booking', 'low',
      'Usually a short-term booking converted to long-term — make sure only the right one is billed.',
      R.filter(r => r.bookings.filter(b => !b.cancelled).length > 1));
    add('phone', 'Outstanding customers with a phone that needs checking', 'medium',
      'Not a recognisable UAE mobile or international number — set a corrected number in the side panel.',
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
    const owing = closed.filter(r => r.outstanding > minOut);
    const collect = owing.filter(r => STAGES[r.stage].group === 'collect');
    const ready = owing.filter(r => r.stage === 'ready_to_claim');
    const inRecovery = model.claimRows.filter(x => /recover/i.test(x.status));
    const stageCounts = {};
    for (const r of R) stageCounts[r.stage] = (stageCounts[r.stage] || 0) + 1;
    return {
      total: R.length, open: open.length, closed: closed.length,
      waiverFees: U.sum(R, r => r.waiver_amount),
      cardooFees: U.sum(R, r => r.cardoo_fee),
      owingCount: owing.length, owingAmount: U.sum(owing, r => r.outstanding),
      collectCount: collect.length, collectAmount: U.sum(collect, r => r.outstanding),
      readyCount: ready.length, readyAmount: U.sum(ready, r => r.claimable),
      recoveryCount: inRecovery.length, recoveryApproved: U.sum(inRecovery, x => x.approved_amount),
      needUpdate: model.claimRows.filter(x => /update/i.test(x.status)).length,
      coveredExposure: U.sum(open, r => r.coverage),
      noBookingOpen: open.filter(r => r.booking_state !== 'active').length,
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
      contract: r.contract_no, amount: U.money(r.outstanding), currency: g.currency || 'AED',
      vehicle: r.vehicle || '', plate: r.plate || '', open_date: U.fmtDate(r.open_date), close_date: U.fmtDate(r.close_date),
      payment_link: r.payment_link || '[payment link]', company: g.company_name || '', company_phone: g.company_phone || '',
      waiver_amount: U.money(r.waiver_amount), today: U.fmtDate(U.todayISO())
    };
    return String(body || '').replace(/\{(\w+)\}/g, (m, k) => (k in map ? String(map[k]) : m));
  },
  waLink(phone, text) { return `https://wa.me/${String(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`; }
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
    return `<span class="cell-main" title="${U.esc(r.name)}">${U.esc(r.name)}</span><span class="cell-sub">${r.phone ? U.esc(r.phone_display) : '<span class="pos">No phone</span>'}${r.phone && !r.phone_valid ? ' · <span style="color:var(--amber)">check</span>' : ''}</span>`;
  },
  cno(no) { return `<span class="cno">#${no}</span>`; },
  date(v, sub) { return v ? `<span class="nowrap">${U.fmtDate(v)}</span>${sub ? `<span class="cell-sub">${sub}</span>` : ''}` : '<span class="zero">—</span>'; },
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
  claims:      ['Cardoo Claims', 'Claim-ready contracts and the status of submitted claims'],
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
    API.clearSession(); API.token = null; State.user = null; State.ds = null; this.model = null; State.model = null;
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
  route() {
    if ($('#app').hidden) return;
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
      const ds = await API.call('dw_get_dataset');
      State.user = ds.user || State.user;
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
    const always = ['dashboard', 'checks'];               // cheap, always fresh
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
        ${this.kpi('t-teal', 'wallet', 'Waiver fees charged', `<small>${cur}</small>${U.compact(k.waiverFees)}`, `Cardoo fees est. ${cur} ${U.compact(k.cardooFees)} · margin ${cur} ${U.compact(k.waiverFees - k.cardooFees)}`)}
        ${this.kpi('t-rose', 'alert', 'Outstanding · closed', `<small>${cur}</small>${U.compact(k.owingAmount)}`, `${U.plural(k.owingCount, 'contract')} above ${cur} ${g.min_outstanding}`, '#/collections')}
        ${this.kpi('t-blue', 'whatsapp', 'In collection queue', `<small>${cur}</small>${U.compact(k.collectAmount)}`, `${U.int(k.collectCount)} customers to remind / collect`, '#/collections')}
        ${this.kpi('t-amber', 'file-check', 'Ready to claim', `<small>${cur}</small>${U.compact(k.readyAmount)}`, `${U.plural(k.readyCount, 'contract')} · ${U.plural(k.needUpdate, 'claim')} need update`, '#/claims')}
        ${this.kpi('t-green', 'shield', 'Cardoo in recovery', `<small>${cur}</small>${U.compact(k.recoveryApproved)}`, `${U.int(k.recoveryCount)} approved claims`, '#/claims')}
        ${this.kpi('t-violet', 'car', 'Open-contract cover', `<small>${cur}</small>${U.compact(k.coveredExposure)}`, `${k.noBookingOpen ? `<span class="chip sm t-rose">${k.noBookingOpen} without booking</span>` : 'All open contracts booked'}`)}
        ${this.kpi('t-orange', 'radar', 'Needs attention', U.int(k.criticalChecks), 'High-priority reconciliation items', '#/checks')}
      </div>
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
    this.pipeline(); this.attention(); this.top(); this.charts();
  },
  kpi(tone, ic, label, value, sub, href) {
    return `<div class="card kpi ${tone} ${href ? 'click' : ''}" ${href ? `data-href="${href}"` : ''}><div class="kpi-top"><span class="kpi-ico">${icon(ic)}</span><span class="kpi-label">${label}</span></div>
      <div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
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
        { key: 'close_date', label: 'Closed', type: 'date', get: r => r.close_date, html: r => R.date(r.close_date, R.ago(r.days_since_close)) },
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
    ['not_covered', 'Not covered', 'rose', r => r.stage === 'not_covered'],
    ['claim_rejected', 'Claim rejected', 'rose', r => r.stage === 'claim_rejected'],
    ['on_hold', 'On hold', 'slate', r => r.stage === 'on_hold'],
    ['claims', 'With Cardoo', 'green', r => ['recovery', 'need_update', 'claim_submitted'].includes(r.stage)],
    ['paid_marked', 'Marked paid', 'green', r => r.stage === 'paid_marked'],
    ['all', 'All outstanding', 'slate', () => true]
  ],
  base() { const min = +App.model.settings.general.min_outstanding || 0; return App.model.records.filter(r => r.status === 'Closed' && r.outstanding > min); },
  build(el) {
    if (!App.model.records.length) { State.built.collections = false; return Views.emptyData(el); }
    const f = State.ui.collections;
    el.innerHTML = `<div class="filter-chips" id="colChips"></div>
      <div class="filters">
        <label>${icon('filter')}Amount</label><input class="input input-sm" type="number" id="cMin" placeholder="Min" value="${f.min}"><input class="input input-sm" type="number" id="cMax" placeholder="Max" value="${f.max}">
        <label>Closed</label><input class="input input-sm" type="date" id="cFrom" value="${f.from}"><span class="muted">→</span><input class="input input-sm" type="date" id="cTo" value="${f.to}">
        <select class="select input-sm" id="cLink"><option value="">Payment link: any</option><option value="has">Has payment link</option><option value="none">Missing payment link</option></select>
        <select class="select input-sm" id="cPhone"><option value="">Phone: any</option><option value="ok">Valid WhatsApp number</option><option value="bad">Needs checking</option></select>
        <button class="btn btn-sm btn-ghost" id="cReset">Reset</button>
      </div>
      <div id="colTable"></div>`;
    $('#cLink', el).value = f.link; $('#cPhone', el).value = f.phone;
    const upd = () => { Object.assign(f, { min: $('#cMin', el).value, max: $('#cMax', el).value, from: $('#cFrom', el).value, to: $('#cTo', el).value, link: $('#cLink', el).value, phone: $('#cPhone', el).value }); this.update(el); };
    ['#cMin', '#cMax', '#cFrom', '#cTo', '#cLink', '#cPhone'].forEach(s => $(s, el).addEventListener('change', upd));
    ['#cMin', '#cMax'].forEach(s => $(s, el).addEventListener('input', U.debounce(upd, 300)));
    $('#cReset', el).addEventListener('click', () => { Object.assign(f, { min: '', max: '', from: '', to: '', link: '', phone: '' }); State.built.collections = false; Views.render('collections'); });
    $('#colChips', el).addEventListener('click', e => { const c = e.target.closest('[data-chip]'); if (c) { f.chip = c.dataset.chip; this.update(el); } });

    const cur = App.model.settings.general.currency;
    const t = State.tables.collections = new DataTable($('#colTable', el), {
      selectable: true, title: 'Collections', exportName: 'collections', sort: { key: 'outstanding', dir: 'desc' },
      bulk: `<button class="btn btn-xs btn-wa" data-bulk="wa">${icon('whatsapp')}WhatsApp queue</button><button class="btn btn-xs" data-bulk="copy">${icon('copy')}Copy messages</button><button class="btn btn-xs" data-bulk="hold">${icon('pause')}Hold</button>`,
      toolbar: `<button class="btn btn-sm" id="pasteLinks">${icon('link')}Paste payment links</button>`,
      columns: [
        ...Views.recordColumns(),
        { key: 'vehicle', label: 'Vehicle', get: r => r.vehicle, hidden: true },
        { key: 'close_date', label: 'Closed', type: 'date', get: r => r.close_date, sortGet: r => U.dayNum(r.close_date), html: r => R.date(r.close_date, R.ago(r.days_since_close)) },
        { key: 'outstanding', label: `Outstanding`, plain: `Outstanding (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.outstanding, html: r => R.owe(r.outstanding) },
        { key: 'coverage', label: 'Cardoo', plain: 'Cardoo cover', get: r => r.coverage, exp: r => r.booking_state === 'active' ? r.coverage : 0, type: 'num', html: R.booking, numeric: true },
        { key: 'stage', label: 'Stage', get: r => STAGES[r.stage].label, sortGet: r => STAGES[r.stage].order, html: r => `${R.stage(r.stage)}${R.flags(r.flags.filter(x => !/Close booking/.test(x.t)))}` },
        { key: 'contacts', label: 'Contacts', get: r => r.contact_count, numeric: true, html: r => r.contact_count ? `<b>${r.contact_count}×</b><span class="cell-sub">${r.last_contact_at ? U.esc(R.ago(U.todayNum() - U.dayNum(new Date(r.last_contact_at)))) : ''}</span>` : '<span class="zero">0</span>' },
        { key: 'payment_link', label: 'Payment link', get: r => r.payment_link, sortable: true, html: r => `<input class="link-input ${r.payment_link ? 'has' : ''}" data-link="${r.contract_no}" value="${U.esc(r.payment_link)}" placeholder="Paste link…" title="${U.esc(r.payment_link || 'Paste the payment link for this customer')}">` },
        { key: 'actions', label: '', sortable: false, export: false, html: r => `<div class="row-actions">
          <button class="icon-btn sm wa" data-act="wa" data-no="${r.contract_no}" title="WhatsApp">${icon('whatsapp')}</button>
          <button class="icon-btn sm" data-act="copy" data-no="${r.contract_no}" title="Copy message">${icon('copy')}</button>
          <button class="icon-btn sm" data-act="open" data-no="${r.contract_no}" title="Open panel">${icon('more')}</button></div>` }
      ],
      onRowClick: r => Drawer.open(r.contract_no)
    });
    Views.bindRowActions(t.el);
    t.el.addEventListener('click', async e => {
      const b = e.target.closest('[data-bulk]'); if (!b) return;
      const rows = t.selectedRows(); if (!rows.length) return;
      if (b.dataset.bulk === 'wa') Actions.queue(rows);
      if (b.dataset.bulk === 'copy') Actions.copyMany(rows);
      if (b.dataset.bulk === 'hold') { for (const r of rows) await App.saveCase(r.contract_no, { on_hold: true }); Toast.ok(`${rows.length} put on hold`); t.clearSel(); }
    });
    $('#pasteLinks', el).addEventListener('click', () => Actions.pasteLinks());
  },
  update(el) {
    if (!App.model.records.length) return;
    const f = State.ui.collections, base = this.base();
    const fil = base.filter(r => {
      if (f.min !== '' && r.outstanding < +f.min) return false;
      if (f.max !== '' && r.outstanding > +f.max) return false;
      if (f.from && (U.dayNum(r.close_date) || 0) < U.dayNum(f.from)) return false;
      if (f.to && (U.dayNum(r.close_date) || 0) > U.dayNum(f.to)) return false;
      if (f.link === 'has' && !r.payment_link) return false;
      if (f.link === 'none' && r.payment_link) return false;
      if (f.phone === 'ok' && !r.phone_valid) return false;
      if (f.phone === 'bad' && r.phone_valid) return false;
      return true;
    });
    $('#colChips', el).innerHTML = this.chips.map(([id, label, tone, fn]) => {
      const n = fil.filter(fn).length;
      return `<button class="fchip t-${tone} ${f.chip === id ? 'active' : ''}" data-chip="${id}"><span class="dot"></span>${label}<i>${n}</i></button>`;
    }).join('');
    const chip = this.chips.find(c => c[0] === f.chip) || this.chips[0];
    State.tables.collections.setRows(fil.filter(chip[3]));
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
    ['ready', 'Ready to claim', 'amber'], ['need_update', 'Need update', 'orange'], ['submitted', 'Submitted (awaiting report)', 'violet'],
    ['recovery', 'In recovery', 'green'], ['rejected', 'Cancelled / declined', 'rose'], ['all', 'All Cardoo claims', 'slate']
  ],
  build(el) {
    if (!App.model.records.length && !App.model.claimRows.length) { State.built.claims = false; return Views.emptyData(el); }
    const g = App.model.settings.general, cur = g.currency;
    el.innerHTML = `<div class="notice" style="margin-bottom:14px">${icon('info')}<span>A contract becomes <b>Ready to claim</b> after ${g.claim_after_reminders} WhatsApp reminders or ${g.claim_after_days} days since the first reminder without payment — only for closed contracts with an active Cardoo booking. Claimable = lower of outstanding and the Cardoo deposit cover. Rules can be changed in Settings.</span></div>
      <div class="filter-chips" id="clTabs"></div><div id="clRec"></div><div id="clRows"></div>`;
    $('#clTabs', el).addEventListener('click', e => { const c = e.target.closest('[data-tab]'); if (c) { State.ui.claims.tab = c.dataset.tab; this.update(el); } });
    const rec = State.tables.claimsRec = new DataTable($('#clRec', el), {
      selectable: true, title: 'Claims - ready to claim', exportName: 'cardoo_claims_ready', sort: { key: 'claimable', dir: 'desc' },
      bulk: `<button class="btn btn-xs btn-primary" data-bulk="submit">${icon('check')}Mark submitted</button><button class="btn btn-xs" data-bulk="packs">${icon('pdf')}Claim packs</button>`,
      columns: [
        ...Views.recordColumns(),
        { key: 'period', label: 'Rental period', get: r => `${U.fmtDate(r.open_date)} - ${U.fmtDate(r.close_date)}`, html: r => `<span class="nowrap">${U.fmtDate(r.open_date)}</span><span class="cell-sub">→ ${U.fmtDate(r.close_date)}</span>` },
        { key: 'outstanding', label: 'Outstanding', plain: `Outstanding (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.outstanding, html: r => R.owe(r.outstanding) },
        { key: 'coverage', label: 'Cover', plain: `Cardoo cover (${cur})`, align: 'right', type: 'num', numeric: true, get: r => r.coverage, html: r => R.amt(r.coverage) },
        { key: 'claimable', label: 'Claimable', plain: `Claimable (${cur})`, align: 'right', type: 'num', sum: true, numeric: true, get: r => r.claimable, html: r => `<span class="amt big" style="color:var(--amber)">${U.money(r.claimable)}</span>` },
        { key: 'deadline', label: 'Claim window', type: 'date', get: r => r.claim_deadline, sortGet: r => r.days_to_deadline, html: r => r.claim_deadline ? `<span class="nowrap">${U.fmtDate(r.claim_deadline)}</span><span class="cell-sub" style="color:var(--${r.days_to_deadline < 0 ? 'rose' : r.days_to_deadline <= 7 ? 'amber' : 'muted'})">${r.days_to_deadline < 0 ? `passed ${-r.days_to_deadline}d ago` : `${r.days_to_deadline}d left`}</span>` : '—' },
        { key: 'contacts', label: 'Reminders', numeric: true, get: r => r.contact_count, html: r => `${r.contact_count}×` },
        { key: 'stage', label: 'Stage', get: r => STAGES[r.stage].label, html: r => R.stage(r.stage) },
        { key: 'act', label: '', sortable: false, export: false, html: r => `<div class="row-actions">
          <button class="btn btn-xs" data-act="pack" data-no="${r.contract_no}">${icon('pdf')}Pack</button>
          <button class="icon-btn sm" data-act="claimtxt" data-no="${r.contract_no}" title="Copy claim details">${icon('copy')}</button>
          ${r.stage === 'ready_to_claim' ? `<button class="btn btn-xs btn-soft" data-act="submit" data-no="${r.contract_no}">${icon('check')}Submitted</button>` : ''}</div>` }
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
      submitted: m.records.filter(r => r.stage === 'claim_submitted'),
      need_update: m.claimRows.filter(x => /update/i.test(x.status)),
      recovery: m.claimRows.filter(x => /recover/i.test(x.status)),
      rejected: m.claimRows.filter(x => /cancel|declin|reject/i.test(x.status)),
      all: m.claimRows
    };
    $('#clTabs', el).innerHTML = this.tabs.map(([id, l, tone]) => `<button class="fchip t-${tone} ${tab === id ? 'active' : ''}" data-tab="${id}"><span class="dot"></span>${l}<i>${sets[id].length}</i></button>`).join('');
    const recTab = tab === 'ready' || tab === 'submitted';
    $('#clRec', el).hidden = !recTab; $('#clRows', el).hidden = recTab;
    if (recTab) { State.tables.claimsRec.o.title = tab === 'ready' ? 'Claims - ready to claim' : 'Claims - submitted'; State.tables.claimsRec.setRows(sets[tab]); }
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
    let cols;
    if (c.kind === 'bookings') cols = Views.bookings.cols();
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
  labels: { whatsapp: ['WhatsApp sent', 'green'], call: ['Call logged', 'teal'], case_update: ['Case updated', 'indigo'], sync: ['Reports synced', 'violet'], login: ['Signed in', 'slate'], settings: ['Settings changed', 'amber'], note: ['Note', 'sky'], claim_pack: ['Claim pack', 'orange'], statement: ['Statement PDF', 'sky'] },
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
    try { const a = await API.call('dw_get_activity', { p_contract: no, p_limit: 200 }); if (no === this.no) { this.activity = a || []; if (this.tab === 'timeline' || this.tab === 'overview') this.render(); } }
    catch (e) { this.activity = []; }
  },
  render() {
    const r = App.model.byNo.get(this.no);
    if (!r) return this.close();
    const g = App.model.settings.general, cur = g.currency, k = r.case || {};
    const d = $('#drawer');
    const tabs = [['overview', 'Overview'], ['cardoo', 'Cardoo', r.bookings.length + r.claims.length], ['payments', 'Payments', r.payments.length], ['timeline', 'Timeline', this.activity ? this.activity.length : '']];
    d.innerHTML = `
      <div class="dr-head">
        <button class="icon-btn ghost close" id="drClose">${icon('x')}</button>
        <div class="dr-id"><span class="avatar">${U.esc(U.initials(r.name))}</span>
          <div><h2>${U.esc(r.name)}</h2><p><span class="cno">#${r.contract_no}</span>·<span>${U.esc(r.vehicle)}</span>${r.source_tag ? `<span class="tag">${U.esc(r.source_tag)}</span>` : ''}</p></div></div>
        <div class="dr-chips">${R.status(r.status)}${R.stage(r.stage)}${R.booking(r)}${r.claim_state ? R.claimChip(r.claim_state) : ''}${r.flags.map(x => `<span class="flag t-${x.tone}">${U.esc(x.t)}</span>`).join('')}</div>
        <div class="dr-actions">
          <button class="btn btn-sm btn-wa" id="drWa" ${r.phone ? '' : 'disabled'}>${icon('whatsapp')}WhatsApp</button>
          <button class="btn btn-sm" id="drCopy">${icon('copy')}Copy message</button>
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
      <div class="panel">
        <h4>${icon('wallet')}Collection workflow<span class="spacer"></span>${k.updated_by ? `<span class="small muted" style="text-transform:none;letter-spacing:0;font-weight:600">updated by ${U.esc(k.updated_by)} · ${U.fmtTS(k.updated_at)}</span>` : ''}</h4>
        <div class="grid" style="gap:12px">
          <label class="field"><span>Payment link</span><div class="inline-form"><input class="input" id="fLink" placeholder="https://…" value="${U.esc(k.payment_link || '')}">
            <button class="btn" id="fLinkSave">${icon('check')}Save</button>${k.payment_link ? `<a class="icon-btn" href="${U.esc(k.payment_link)}" target="_blank" rel="noopener" title="Open link">${icon('external')}</a>` : ''}</div></label>
          <label class="field"><span>WhatsApp number ${r.phone_overridden ? '<span class="tag">corrected</span>' : ''}${!r.phone_valid ? ' <span class="flag t-amber">check</span>' : ''}</span>
            <div class="inline-form"><input class="input mono" id="fPhone" value="${U.esc(k.phone_override || (r.contract && r.contract.mobile_raw) || '')}" placeholder="e.g. 0501234567 or +44…">
            <button class="btn" id="fPhoneSave">${icon('check')}Save</button></div>
            <small>Normalised: <b class="mono">${r.phone ? U.esc(r.phone_display) : '—'}</b> · original in report: <span class="mono">${U.esc((r.contract && r.contract.mobile_raw) || '—')}</span></small></label>
          <div class="form-grid" style="grid-template-columns:1fr 1fr">
            <label class="field"><span>Promise to pay on</span><input class="input" type="date" id="fPromise" value="${k.promise_date || ''}" min="${today}"></label>
            <label class="field"><span>Claim submitted on</span><input class="input" type="date" id="fClaimed" value="${k.claim_submitted_at || ''}"></label>
          </div>
          <label class="field"><span>Notes</span><textarea class="input" id="fNotes" placeholder="Conversation notes, disputes, agreements…">${U.esc(k.notes || '')}</textarea></label>
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
          <dt>Waiver open / close</dt><dd>${U.fmtDate(r.open_date)} → ${r.close_date ? U.fmtDate(r.close_date) : '<span class="chip t-sky">open</span>'}${r.days_since_close != null ? ` <span class="muted">(${R.ago(r.days_since_close)})</span>` : ''}</dd>
          <dt>Rental type</dt><dd>${U.esc(r.rental_type || '—')}${r.days ? ` · ${r.days} days` : ''}</dd>
          ${r.contract ? `<dt>Charges</dt><dd class="mono small">Rent ${U.money(r.contract.rent)} · Salik ${U.money(r.contract.salik)} · Fines ${U.money(r.contract.fine)} · Other ${U.money(r.contract.other_charges)} · VAT ${U.money(r.contract.vat)}</dd>
          <dt>Total / paid</dt><dd class="mono small">${U.money(r.contract.total_amount)} / ${U.money(r.contract.paid_amount)} → balance ${U.money(r.contract.balance)}</dd>` : '<dt>Contracts report</dt><dd class="pos">Not found in Rental Contracts report</dd>'}
          ${r.claim_deadline && r.status === 'Closed' ? `<dt>Claim window</dt><dd>${U.fmtDate(r.claim_deadline)} <span class="muted">(${r.days_to_deadline < 0 ? `passed ${-r.days_to_deadline}d ago` : `${r.days_to_deadline}d left`})</span></dd>` : ''}
        </dl></div>`;
  },
  tab_cardoo(r, g, cur) {
    return `<div class="panel"><h4>${icon('shield')}Cardoo bookings</h4>${r.bookings.length ? `<div class="mini-list">${r.bookings.map(b => `<div class="mini-item">
        <div class="grow"><b>${U.esc(b.booking_type || 'Booking')} ${b.contract_variant ? `<span class="tag">${U.esc(b.contract_variant)}</span>` : ''}</b>
        <div class="small muted">${U.fmtDT(b.start_at)} → ${U.fmtDT(b.end_at)}${b.close_at ? ` · closed ${U.fmtDT(b.close_at)}` : ' · not closed'}</div>
        <div class="small muted">Booked ${U.fmtDT(b.booked_at)} by ${U.esc(b.user_label || '')}${b.comment ? ` · ${U.esc(b.comment)}` : ''}</div></div>
        <div class="right"><b class="mono">${cur} ${U.money(b.deposit_covered)}</b><div class="small muted">fee ${U.money(Engine.bookingFee(b))}</div>${b.cancelled ? '<span class="chip sm t-rose">Cancelled</span>' : '<span class="chip sm t-teal">Active</span>'}</div></div>`).join('')}</div>`
      : `<div class="notice rose">${icon('alert')}<span>No Cardoo booking for this contract. ${r.status === 'Open' ? 'Register it in Cardoo so the deposit is covered.' : 'Any outstanding must be collected directly.'}</span></div>`}</div>
      <div class="panel"><h4>${icon('file-check')}Cardoo claims</h4>${r.claims.length ? `<div class="mini-list">${r.claims.map(c => `<div class="mini-item" style="align-items:flex-start">
        <div class="grow"><b>${U.esc(c.title)}</b><div class="small muted">Claimed ${U.fmtDate(c.claim_date)} · deposit ${U.money(c.deposit_amount)}</div>
        ${c.last_comment ? `<div class="small" style="margin-top:6px;color:var(--text-2)">💬 ${U.esc(c.last_comment)}</div>` : ''}</div>
        <div class="right"><div class="mono"><b>${U.money(c.excess_sum)}</b></div>${c.approved_amount != null ? `<div class="small" style="color:var(--green)">approved ${U.money(c.approved_amount)}</div>` : ''}${R.claimChip(c.status)}</div></div>`).join('')}</div>`
      : `<p class="muted">No claim submitted yet.${r.stage === 'ready_to_claim' ? ' This contract is <b>ready to claim</b>.' : ''}</p>`}
      <div class="btn-group mt-sm"><button class="btn btn-sm" id="drPack2">${icon('pdf')}Claim pack PDF</button><button class="btn btn-sm" id="drClaimTxt">${icon('copy')}Copy claim details</button>
      ${!r.claims.length || !r.claim_live ? `<button class="btn btn-sm btn-soft" id="drSubmitted">${icon('check')}Mark claim submitted</button>` : ''}</div></div>`;
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
    const key = e => e.ts ? new Date(e.at).getTime() / 86400000 : (U.dayFrac(e.at) || 0) - 4 / 24;
    ev.sort((a, b) => key(b) - key(a));
    return `<div class="panel"><h4>${icon('clock')}Timeline</h4>${this.activity === null ? '<div class="skeleton" style="height:60px"></div>' : ''}
      <div class="timeline">${ev.filter(e => e.at).map(e => `<div class="tl" style="--t:var(${e.tone})"><b>${U.esc(e.t)}</b><small>${e.ts ? U.fmtTS(e.at) : (String(e.at).length > 10 ? U.fmtDT(e.at) : U.fmtDate(e.at))}${e.s ? ' · ' + U.esc(e.s) : ''}</small>${e.msg ? `<div class="msg">${U.esc(e.msg)}</div>` : ''}</div>`).join('')}</div></div>`;
  },
  bind(r, d) {
    const no = r.contract_no;
    const on = (id, fn) => { const el = $(id, d); if (el) el.addEventListener('click', fn); };
    on('#fLinkSave', () => { const v = $('#fLink', d).value.trim(); if (v && !/^https?:\/\//i.test(v)) Toast.warn('Payment link should start with https://'); App.saveCase(no, { payment_link: v }, 'Payment link saved'); });
    on('#fPhoneSave', () => {
      const v = $('#fPhone', d).value.trim(); const orig = (r.contract && r.contract.mobile_raw) || '';
      const ph = U.phone(v, App.model.settings.general.default_country_code);
      if (v && !ph.valid) Toast.warn('Number still looks unusual', ph.display);
      App.saveCase(no, { phone_override: v && v !== orig ? v : '' }, 'Phone number saved');
    });
    on('#fSave', () => App.saveCase(no, { promise_date: $('#fPromise', d).value, claim_submitted_at: $('#fClaimed', d).value, notes: $('#fNotes', d).value, payment_link: $('#fLink', d).value.trim() }, 'Changes saved'));
    on('#fCall', () => Actions.logCall(r));
    on('#fHold', () => App.saveCase(no, { on_hold: !(r.case && r.case.on_hold) }, r.case && r.case.on_hold ? 'Resumed' : 'Put on hold'));
    on('#fPaid', async () => { if (await Modal.confirm('Mark as paid?', `This hides #${no} from the collection queue until the next Deposit Waivers report confirms the balance.`, 'Mark paid')) App.saveCase(no, { paid_marked_at: U.todayISO() }, 'Marked as paid'); });
    on('#fUnpaid', () => App.saveCase(no, { paid_marked_at: '' }, 'Paid mark removed'));
    on('#drPack2', () => Actions.claimPack(r));
    on('#drClaimTxt', () => Actions.copyClaim(r));
    on('#drSubmitted', () => Actions.markSubmitted([r]));
  }
};

/* =====================================================================
   Actions — WhatsApp, copy, claims, PDFs
   ===================================================================== */
const Actions = {
  tplId: null,
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
      title: `${icon('whatsapp')} WhatsApp · ${U.esc(r.name)}`, sub: `#${r.contract_no} · outstanding <b>${App.model.settings.general.currency} ${U.money(r.outstanding)}</b> · contacted ${r.contact_count}×`, size: 'wide',
      body: `<div class="grid g-2" style="gap:18px;align-items:start">
        <div class="grid" style="gap:12px">
          <div class="tpl-tabs" id="waTpl">${tpls.map(t => `<button data-t="${t.id}" class="${t.id === tplId ? 'on' : ''}">${U.esc(t.name)}</button>`).join('')}</div>
          <label class="field"><span>Phone (WhatsApp)</span><input class="input mono" id="waPhone" value="${U.esc(r.phone ? '+' + r.phone : '')}" placeholder="+9715…"></label>
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
          if (!ph.digits) return Toast.err('Enter a phone number');
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
          await App.logActivity(r.contract_no, 'whatsapp', { template: tplId, template_name: t ? t.name : 'custom', phone: ph.digits, amount: U.money(r.outstanding), message: txt.value, edited: custom !== null });
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
            <div class="grow"><b>${U.esc(r.name)}</b><div class="small muted">#${r.contract_no} · +${r.phone} · ${U.money(r.outstanding)} · ${U.esc((tpls.find(t => t.id === tplFor(r)) || {}).name || '')}</div></div>
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
          await App.logActivity(r.contract_no, 'whatsapp', { template: t, template_name: tt ? tt.name : t, phone: r.phone, amount: U.money(r.outstanding), message: msg, queue: true });
        });
        draw();
      }
    });
  },

  pasteLinks() {
    Modal.open({ title: 'Paste payment links', sub: 'One per line: <b>contract number</b>, then the link (comma, tab or space separated). Copy two columns straight from Excel.', size: 'wide',
      body: `<textarea class="input mono" id="plText" style="min-height:220px" placeholder="19025, https://pay.example.com/abc123&#10;18920	https://pay.example.com/xyz789"></textarea><div id="plPrev"></div>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="plSave" disabled>${icon('check')}Save links</button>`,
      onOpen: m => {
        let parsed = [];
        const parse = () => {
          parsed = $('#plText', m).value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
            const mm = l.match(/#?(\d{3,})\D+?(https?:\/\/\S+)/i) || l.match(/(https?:\/\/\S+)\D+?#?(\d{3,})/i);
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
        $('#plSave', m).addEventListener('click', async () => {
          const good = parsed.filter(p => p.ok); const b = $('#plSave', m); b.classList.add('loading'); b.disabled = true;
          let n = 0; for (const p of good) { try { await API.call('dw_save_case', { p_contract: p.no, p_patch: { payment_link: p.url } }).then(k => { const list = State.ds.cases || (State.ds.cases = []); const i = list.findIndex(x => +x.contract_no === p.no); if (i >= 0) list[i] = k; else list.push(k); }); n++; } catch (e) { Toast.err(`#${p.no}: ${e.message}`); } }
          App.rebuild(true); Modal.close(); Toast.ok(`${n} payment links saved`);
        });
      } });
  },

  markSubmitted(rows) {
    const cur = App.model.settings.general.currency;
    Modal.open({ title: 'Mark claim submitted to Cardoo', sub: `${rows.length} contract(s) · they move to “Claim submitted” until the next Excess report arrives`, size: 'narrow',
      body: `<label class="field"><span>Submitted on</span><input class="input" type="date" id="msDate" value="${U.todayISO()}"></label>
        <div class="mini-list">${rows.slice(0, 6).map(r => `<div class="mini-item"><div class="grow"><b>#${r.contract_no}</b> ${U.esc(r.name)}</div><span class="mono">${cur} ${U.money(r.claimable)}</span></div>`).join('')}${rows.length > 6 ? `<p class="small muted">+ ${rows.length - 6} more</p>` : ''}</div>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="msGo">${icon('check')}Confirm</button>`,
      onOpen: m => $('#msGo', m).addEventListener('click', async () => {
        const d = $('#msDate', m).value || U.todayISO(); const b = $('#msGo', m); b.classList.add('loading'); b.disabled = true;
        for (const r of rows) { try { await App.saveCase(r.contract_no, { claim_submitted_at: d, claim_amount: r.claimable }); } catch (e) { /* toast shown */ } }
        Modal.close(); Toast.ok(`${rows.length} claim(s) marked as submitted`);
        if (State.tables.claimsRec) State.tables.claimsRec.clearSel();
      }) });
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
  build(el) {
    const imp = State.imports;
    const n = REPORT_ORDER.filter(t => imp[t] && imp[t].norm).length;
    el.innerHTML = `
      <div class="section-head"><div><h2>Import reports</h2><p>Drop all five Excel files at once — file names don't matter. Each report is recognised by its columns, then cleaned and linked.</p></div>
        <span class="spacer"></span>${n ? `<button class="btn btn-ghost" id="impClear">${icon('trash')}Clear files</button>` : ''}</div>
      <label class="dropzone" id="dz"><input type="file" id="dzInput" multiple accept=".xlsx,.xls,.xlsm,.csv">
        <div class="dz-ico">${icon('upload')}</div><h3>Drop the 5 reports here, or click to browse</h3><p>.xlsx · .xls · .csv — any order, any file names</p></label>
      <div class="slots">${REPORT_ORDER.map((t, i) => this.slot(t, i)).join('')}</div>
      <div id="impQuality"></div>
      <div class="card mt"><div class="card-head"><div><h3>Sync history</h3><p>Every import replaces the report data; your notes, payment links and contact history are kept.</p></div></div><div class="card-body" id="impHist"><div class="skeleton" style="height:40px"></div></div></div>`;
    const dz = $('#dz', el), inp = $('#dzInput', el);
    inp.addEventListener('change', () => { this.files(inp.files); inp.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => this.files(e.dataTransfer.files));
    $$('[data-pick]', el).forEach(b => b.addEventListener('click', e => { e.preventDefault(); const i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls,.xlsm,.csv'; i.onchange = () => this.files(i.files, b.dataset.pick); i.click(); }));
    $$('[data-rm]', el).forEach(b => b.addEventListener('click', () => { delete State.imports[b.dataset.rm]; State.prepared = null; this.build(el); }));
    const clr = $('#impClear', el); if (clr) clr.addEventListener('click', () => { State.imports = {}; State.prepared = null; this.build(el); });
    if (n === 5) this.quality(el);
    this.history();
  },
  slot(t, i) {
    const spec = REPORTS[t], s = State.imports[t];
    const ok = s && s.norm, err = s && s.error;
    let meta = '';
    if (ok) {
      const st = s.norm.stats;
      meta = `<div class="file" title="${U.esc(s.file.name)}">${icon('xls')} ${U.esc(s.file.name)}</div><div class="meta"><span><b>${U.int(s.norm.rows.length)}</b> rows</span><span>sheet “${U.esc(s.det.sheet)}”</span>${st.skipped ? `<span>${st.skipped} skipped</span>` : ''}</div>`;
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
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: false, dense: false });
        const det = Engine.detectWorkbook(wb, XLSX);
        if (!det) { Toast.err(`Not recognised: ${f.name}`, 'None of the 5 report layouts matched its column headers.'); if (forced) State.imports[forced] = { file: f, error: 'Columns do not match this report.' }; continue; }
        if (forced && det.type !== forced) Toast.warn(`${f.name} looks like “${REPORTS[det.type].label}”`, 'It was placed in the matching slot.');
        const norm = Engine.normalize(det.type, det, App.model ? App.model.settings : {});
        if (State.imports[det.type] && State.imports[det.type].norm && State.imports[det.type].file.name !== f.name) Toast.warn(`Replaced ${REPORTS[det.type].label}`, `${State.imports[det.type].file.name} → ${f.name}`);
        det.rows = null; // free memory
        State.imports[det.type] = { file: f, det, norm };
      } catch (e) {
        console.error(e);
        Toast.err(`Could not read ${f.name}`, e.message);
      }
    }
    State.prepared = null;
    this.build(el);
    const n = REPORT_ORDER.filter(t => State.imports[t] && State.imports[t].norm).length;
    if (n === 5) { Toast.ok('All 5 reports recognised', 'Review the clean-up summary, then sync.'); setTimeout(() => { const q = $('#impQuality'); if (q) q.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120); }
    else Toast.show(`${n} of 5 reports ready`, 'info', `Still missing: ${REPORT_ORDER.filter(t => !(State.imports[t] && State.imports[t].norm)).map(t => REPORTS[t].label).join(', ')}`);
  },
  quality(el) {
    const norm = {}; REPORT_ORDER.forEach(t => { norm[t] = State.imports[t].norm; });
    const prep = State.prepared = Engine.prepareSync(norm);
    const s = prep.summary, w = norm.waivers.stats;
    const issues = [];
    issues.push({ level: 'fix', text: `Removed source tags from ${U.int(w.tagsName)} customer names and ${U.int(w.tagsContract)} contract numbers (${Object.entries(w.tagCounts).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'}).` });
    if (w.textNumbers) issues.push({ level: 'fix', text: `${U.int(w.textNumbers)} waiver amounts / ledger balances were text with thousands separators — converted to numbers.` });
    issues.push({ level: 'fix', text: `Dates unified to one format across all reports (dd-Mmm-yyyy text, Excel serials, dd.mm.yy titles, 12-hour times).` });
    const ph = norm.contracts.stats.phones;
    issues.push({ level: 'fix', text: `Phone numbers normalised to WhatsApp format: ${U.int(ph.uae)} UAE mobiles, ${U.int(ph.intl)} international, ${U.int(ph.landline || 0)} landlines, ${U.int(ph.check)} need checking, ${U.int(ph.missing)} missing (across the full contracts report).` });
    REPORT_ORDER.forEach(t => norm[t].issues.forEach(i => issues.push(Object.assign({ src: REPORTS[t].label }, i))));
    issues.push({ level: 'info', text: `Rental Contracts trimmed from ${U.int(s.contractsTotal)} to the ${U.int(s.contractsKept)} contracts linked to a waiver, Cardoo booking or claim. Rent payments: ${U.int(s.paymentsKept)} of ${U.int(s.paymentsTotal)} rows kept.` });
    if (s.missingContracts.length) issues.push({ level: 'warn', text: `${s.missingContracts.length} linked contract(s) are missing from the Rental Contracts report (no phone/email): ${s.missingContracts.slice(0, 12).join(', ')}${s.missingContracts.length > 12 ? '…' : ''}` });
    issues.push(s.nameMismatch.length ? { level: 'warn', text: `${s.nameMismatch.length} customer name(s) differ between the cleaned waiver report and the contracts report — the contracts name is used. e.g. ${s.nameMismatch.slice(0, 3).map(x => `#${x.contract_no}: “${x.waiver}” vs “${x.contract}”`).join('; ')}` }
      : { level: 'fix', text: `All ${U.int(norm.waivers.rows.length)} cleaned waiver names match the Rental Contracts report exactly — tag removal verified.` });
    const preview = Engine.buildModel(Object.assign({}, prep.tables, { cases: (State.ds && State.ds.cases) || [], settings: (State.ds && State.ds.settings) || {} }));
    const k = preview.kpi;
    const canSync = App.canManage();
    $('#impQuality', el).innerHTML = `
      <div class="card mt"><div class="card-head"><div><h3>Clean-up &amp; validation</h3><p>What was detected and fixed while unifying the five reports</p></div></div>
        <div class="card-body grid" style="gap:16px">
          <div class="stat-row">${REPORT_ORDER.map(t => `<div class="stat"><small>${REPORTS[t].label}</small><b>${U.int(prep.tables[t].length)}</b><span>${t === 'contracts' || t === 'payments' ? `of ${U.int(norm[t].rows.length)} rows` : 'rows'}</span></div>`).join('')}</div>
          <div class="quality">${issues.map(i => `<div class="q-row"><span class="lvl ${i.level}">${i.level === 'fix' ? 'fixed' : i.level}</span><span>${i.src ? `<b>${U.esc(i.src)}:</b> ` : ''}${U.esc(i.text)}</span></div>`).join('')}</div>
          <div class="stat-row">
            <div class="stat"><small>Waiver contracts</small><b>${U.int(k.total)}</b><span>${k.open} open · ${k.closed} closed</span></div>
            <div class="stat"><small>Outstanding · closed</small><b>${U.compact(k.owingAmount)}</b><span>${k.owingCount} contracts</span></div>
            <div class="stat"><small>Collection queue</small><b>${U.int(k.collectCount)}</b><span>${U.compact(k.collectAmount)}</span></div>
            <div class="stat"><small>Claims in recovery</small><b>${U.int(k.recoveryCount)}</b><span>approved ${U.compact(k.recoveryApproved)}</span></div>
            <div class="stat"><small>Attention items</small><b>${U.int(k.criticalChecks)}</b><span>high priority</span></div>
          </div>
          <div class="sync-box"><div class="grow"><h3>${icon('database')} Ready to sync</h3><p class="muted">Replaces the report data in Supabase in one atomic step. Payment links, notes, promises and WhatsApp history are preserved.</p>
            <div class="progress mt-sm" id="syncProg" hidden><span></span></div><small class="muted" id="syncMsg"></small></div>
            <div class="btn-group"><button class="btn" id="impLocal">${icon('eye')}Preview without saving</button>
            <button class="btn btn-primary btn-lg" id="impSync" ${canSync ? '' : 'disabled title="Only managers/admins can sync"'}><span class="btn-label">${icon('upload')} Sync to database</span><span class="spinner"></span></button></div></div>
          ${canSync ? '' : `<div class="notice amber">${icon('alert')}<span>Your role (${U.esc(State.user.role)}) can preview but not sync. Ask a manager or admin.</span></div>`}
        </div></div>`;
    $('#impLocal', el).addEventListener('click', () => {
      const ds = Object.assign({}, prep.tables, { cases: (State.ds && State.ds.cases) || [], settings: (State.ds && State.ds.settings) || {}, last_batch: null, user: State.user });
      App.setData(JSON.parse(JSON.stringify(ds)), 'local', false);
      State.built = { import: true };
      Toast.ok('Previewing imported data', 'Not saved — click “Sync to database” to store it.');
      location.hash = '#/dashboard';
    });
    $('#impSync', el).addEventListener('click', () => this.sync(el));
  },
  async sync(el) {
    const prep = State.prepared; if (!prep) return;
    const btn = $('#impSync', el), bar = $('#syncProg', el), msg = $('#syncMsg', el);
    btn.classList.add('loading'); btn.disabled = true; bar.hidden = false;
    const files = REPORT_ORDER.map(t => ({ type: t, fileName: State.imports[t].file.name, size: State.imports[t].file.size, rows: State.imports[t].norm.rows.length, kept: prep.tables[t].length }));
    const summary = { nameMismatch: prep.summary.nameMismatch.length, missingContracts: prep.summary.missingContracts.length, issues: REPORT_ORDER.flatMap(t => State.imports[t].norm.issues.map(i => `${t}: ${i.text}`)) };
    let batch = null;
    try {
      msg.textContent = 'Starting import batch…';
      batch = await API.call('dw_sync_begin', { p_files: files, p_summary: summary });
      const chunks = [];
      REPORT_ORDER.forEach(t => { const rows = prep.tables[t]; if (!rows.length) chunks.push([t, []]); for (let i = 0; i < rows.length; i += CONFIG.CHUNK_SIZE) chunks.push([t, rows.slice(i, i + CONFIG.CHUNK_SIZE)]); });
      for (let i = 0; i < chunks.length; i++) {
        const [t, rows] = chunks[i];
        msg.textContent = `Uploading ${REPORTS[t].label} (${i + 1}/${chunks.length})…`;
        await API.call('dw_sync_rows', { p_batch: batch, p_table: t, p_rows: rows });
        bar.firstElementChild.style.width = ((i + 1) / (chunks.length + 1) * 100) + '%';
      }
      msg.textContent = 'Swapping data in one transaction…';
      const stored = await API.call('dw_sync_finish', { p_batch: batch });
      bar.firstElementChild.style.width = '100%';
      msg.textContent = `Done — ${Object.entries(stored).map(([k, v]) => `${k} ${v}`).join(' · ')}`;
      Toast.ok('Reports synced to database', Object.entries(stored).map(([k, v]) => `${k}: ${v}`).join(' · '));
      State.imports = {}; State.prepared = null;
      await App.load(false);
      State.built = {};
      location.hash = '#/dashboard';
    } catch (e) {
      Toast.err('Sync failed — nothing was changed', e.message);
      msg.textContent = 'Failed: ' + e.message;
      if (batch) { try { await API.call('dw_sync_abort', { p_batch: batch }); } catch (x) { /* ignore */ } }
    } finally { btn.classList.remove('loading'); btn.disabled = false; }
  },
  async history() {
    const box = $('#impHist'); if (!box) return;
    try {
      const rows = await API.call('dw_list_batches', { p_limit: 12 }) || [];
      box.innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>#</th><th>When</th><th>By</th><th>Status</th><th>Files</th><th>Stored</th></tr></thead><tbody>${rows.map(b => `<tr>
        <td class="mono">${b.id}</td><td class="nowrap">${U.fmtTS(b.completed_at || b.started_at)}</td><td>${U.esc(b.started_by_name || '')}</td>
        <td><span class="chip t-${b.status === 'completed' ? 'green' : b.status === 'failed' ? 'rose' : 'amber'}">${b.status}</span></td>
        <td class="small">${(b.files || []).map(f => `<span title="${U.esc(f.type)}">${U.esc(f.fileName)}</span>`).join('<br>')}</td>
        <td class="small mono">${b.summary && b.summary.stored ? Object.entries(b.summary.stored).map(([k, v]) => `${k} ${v}`).join('<br>') : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No syncs yet.</p>';
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
            <label class="field"><span>Claim window (days after close)</span><input class="input" type="number" min="1" id="sDead" value="${g.claim_deadline_days}"><small>Set to your Cardoo agreement</small></label>
          </div>
          <label class="field"><span>Source tags removed from names &amp; contract numbers</span><div class="tag-editor" id="sTags"></div><small>Press Enter to add. Tags with a hyphen match case-insensitively; others must match exactly. Unlisted glued tags (e.g. “NAMEPartner-App”) are still auto-detected and reported.</small></label>
          <div><button class="btn btn-primary" id="sSaveG" ${canEdit ? '' : 'disabled'}>${icon('check')}Save company &amp; rules</button></div>
        </div></div>

        <div class="card"><div class="card-head"><div><h3>Account</h3><p>Signed in as <b>${U.esc(State.user.username)}</b> (${U.esc(State.user.role)})</p></div></div><div class="card-body grid" style="gap:14px">
          <label class="field"><span>Current password</span><input class="input" type="password" id="pOld" autocomplete="current-password"></label>
          <label class="field"><span>New password</span><input class="input" type="password" id="pNew" autocomplete="new-password"><small>At least 8 characters. Other sessions will be signed out.</small></label>
          <label class="field"><span>Repeat new password</span><input class="input" type="password" id="pNew2" autocomplete="new-password"></label>
          <div><button class="btn" id="pSave">${icon('lock')}Change password</button></div>
          <hr style="border:0;border-top:1px solid var(--border);width:100%">
          <div><h3 style="font-size:15px">Full export</h3><p class="muted small" style="margin:4px 0 10px">Download every unified table in one Excel workbook.</p>
          <button class="btn" id="sExportAll">${icon('xls')}Download unified workbook</button></div>
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
        claim_after_days: Math.max(0, +$('#sDays', el).value || 0), claim_deadline_days: Math.max(1, +$('#sDead', el).value || 30), tags: this.tags });
      try { await API.call('dw_save_setting', { p_key: 'general', p_value: v }); State.ds.settings = Object.assign({}, State.ds.settings, { general: v }); App.rebuild(false); Toast.ok('Settings saved'); }
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
  },
  drawTags(el) {
    const box = $('#sTags', el);
    box.innerHTML = this.tags.map((t, i) => `<span class="t">${U.esc(t)}<button data-i="${i}" title="Remove">×</button></span>`).join('') + '<input placeholder="Add tag…">';
    $$('button', box).forEach(b => b.addEventListener('click', () => { this.tags.splice(+b.dataset.i, 1); this.drawTags(el); }));
    const inp = $('input', box);
    inp.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ',') && inp.value.trim()) { e.preventDefault(); const v = inp.value.trim().replace(/,$/, ''); if (!this.tags.includes(v)) this.tags.push(v); this.drawTags(el); $('#sTags input', el).focus(); } });
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
      'Stage': STAGES[r.stage].label, 'Contacts': r.contact_count, 'Payment link': r.payment_link, 'Promise date': (r.case || {}).promise_date || '', 'Notes': (r.case || {}).notes || '', 'Flags': r.flags.map(f => f.t).join('; '), 'Source tag': r.source_tag || '' })));
    add('Cardoo bookings', m.bookingRows.map(b => { const o = Object.assign({}, b); delete o._rec; return o; }));
    add('Cardoo claims', m.claimRows.map(c => { const o = Object.assign({}, c); delete o._rec; return o; }));
    add('Rent payments', m.paymentRows.map(p => { const o = Object.assign({}, p); delete o._rec; return o; }));
    add('Checks', m.checks.flatMap(c => c.rows.map(r => ({ check: c.title, severity: c.severity, contract: r.contract_no, customer: r.name || r._name || '' }))));
    XLSX.writeFile(wb, `deposit_waiver_unified_${U.todayISO()}.xlsx`, { compression: true });
    Toast.ok('Unified workbook downloaded');
  }
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
