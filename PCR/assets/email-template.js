/* Traffic-fine notification email (same wording/design as the Word template) + .eml draft builder.
   Works in the browser and in Node (for testing). Needs assets/email-assets.js for the images. */
(function (root) {
"use strict";

const CFG = {
  cc: ['billing@pcr.ae', 'mo@pcr.ae'],
  signName: 'Zafar Yousuf',
  signTitle: 'Accounts Team / Collection',
  web: 'www.pcr.ae', webUrl: 'http://www.pcr.ae', phone: '+971 4 360 9991',
  address: 'Jumeirah Lakes Tower | Cluster G | Building: JBC-1 | Ground Floor Lobby',
  facebook: 'https://www.facebook.com/Premium-Car-Rentals-337880546714873',
  instagram: 'https://www.instagram.com/premiumcarrentalsdmcc/?hl=en'
};
const TERMS = [
  'Fine payments are automatically processed from the registered card only if your rental account is active/open.',
  'If your rental account is closed, fines under AED 1000 will be deducted from your deposit. For fines exceeding AED 1000, payment will still be processed from your registered card.',
  'Should your card decline payment for any reason, you have 24 hours to settle the fine manually. Failure to do so within this timeframe may result in vehicle immobilization (Only for fines over AED 400).'
];
const REGRET = 'We regret to inform you that a new traffic fine has been issued in your rental account. Attached, you\'ll find the relevant Fine Ticket and Payment Invoice for your reference.';
const REGRET_MANY = 'We regret to inform you that new traffic fines have been issued in your rental account. Attached, you\'ll find the relevant Fine Tickets and Payment Invoice for your reference.';
const THANKS = 'We appreciate your attention to this matter and we thank you for your cooperation. If you have any questions or concerns, please do not hesitate to contact us.';
const DISCLAIMER = 'Disclaimer: This email and any files transmitted with it are confidential and intended solely for the use of the individual or entity to whom they are addressed. If you have received this email in error please notify the system manager. This message contains confidential information and is intended only for the individual named. If you are not the named addressee you should not disseminate, distribute or copy this e-mail. Please notify the sender immediately by e-mail if you have received this e-mail by mistake and delete this e-mail from your system. If you are not the intended recipient you are notified that disclosing, copying, distributing or taking any action in reliance on the contents of this information is strictly prohibited.';
const GREEN = 'Save Environment Initiative: PCR operates in a paperless environment, saving thousands of trees. Please do NOT print this email unless you really need to';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = s => String(s == null ? '' : s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const money = n => (Math.round((+n + Number.EPSILON) * 100) / 100).toFixed(2);

/* d = {name, contract, amount, fineNo, to, count} */
function subject(d) {
  const n = String(d.count || 1).padStart(2, '0');
  return `${n} New Traffic Ticket ✦✦✦ CNo${clean(d.contract)} ${clean(d.name)} ✦ (AED ${money(d.amount)}) ✦ (${d.fineNo})`;
}

function html(d, mode, assets) {
  assets = assets || root.EMAIL_ASSETS;
  const img = (k, w, h, alt, extra) => {
    const a = assets[k], src = mode === 'cid' ? 'cid:' + k + '@pcr.ae' : `data:${a.mime};base64,${a.b64}`;
    return `<img src="${src}" width="${w}" height="${h}" alt="${alt || ''}" border="0" style="display:block;border:0;outline:none;${extra || ''}">`;
  };
  const F = 'font-family:Calibri,\'Segoe UI\',Arial,sans-serif;font-size:16px;line-height:1.45;color:#000000;';
  const P = `margin:0 0 14px 0;${F}`;
  const name = esc(clean(d.name)), amt = 'AED ' + money(d.amount);
  const fines = (d.fines && d.fines.length) ? d.fines : [{ fineNo: d.fineNo, amount: d.amount }];
  const many = fines.length > 1;
  const headline = many ? `You have <u>${fines.length} new Traffic Fines</u> with a total of <u>${amt}</u>` : `You have a new <u>Traffic Fine</u> of <u>${amt}</u>`;
  const breakdown = many ? '<div style="margin-top:8px;font-size:14px">' + fines.map(f => `Fine No. <b>${esc(clean(f.fineNo))}</b> &ndash; AED ${money(f.amount)}`).join('<br>') + '</div>' : '';
  const regret = many ? REGRET_MANY : REGRET;
  const social = [['yt', 11, 7, 'YouTube', ''], ['tw', 11, 12, 'Twitter', ''], ['ig', 11, 12, 'Instagram', CFG.instagram],
                  ['fb', 11, 12, 'Facebook', CFG.facebook], ['in', 11, 12, 'LinkedIn', '']]
    .map(s => `<td style="padding-right:9px" valign="middle">${s[4] ? `<a href="${s[4]}" target="_blank">` : ''}${img(s[0], s[1], s[2], s[3])}${s[4] ? '</a>' : ''}</td>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(subject(d))}</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="557" cellpadding="0" cellspacing="0" border="0" style="width:557px;max-width:100%;background:#ffffff;${F}">
<tr><td>${img('banner', 557, 85, 'Premium Car Rentals')}</td></tr>
<tr><td style="padding:30px 50px 0 50px;${F}">
  <p style="${P}"><b>Dear ${name},</b></p>
  <p style="${P}">We hope this email finds you well.</p>
</td></tr>
<tr><td style="padding:6px 50px 18px 50px">${img('bar', 44, 4, '')}</td></tr>
<tr><td style="padding:0 50px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
   <tr><td bgcolor="#EEEEEE" style="background:#EEEEEE;padding:14px 12px;${F}">${headline}${breakdown}</td></tr>
   <tr><td bgcolor="#FFE599" style="background:#FFE599;padding:10px 12px">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
       <td width="75" valign="middle" style="width:75px">${img('pdf', 61, 61, 'PDF')}</td>
       <td valign="middle" style="${F}">Please <b>Download</b> attached PDF bill and traffic fine ${many ? 'tickets' : 'ticket'} for details<b>!</b></td>
     </tr></table></td></tr>
  </table>
</td></tr>
<tr><td style="padding:32px 50px 0 50px;${F}">
  <p style="${P}">${esc(regret)}</p>
  <p style="${P};margin-top:26px"><b><u>Please be aware of our “Traffic Fines Payment” process terms:</u></b></p>
  <ul style="margin:0 0 14px 0;padding-left:34px;${F}">
    ${TERMS.map(t => `<li style="margin:0 0 10px 0;${F}">${esc(t)}</li>`).join('\n    ')}
  </ul>
  <p style="${P};margin-top:26px">${esc(THANKS)}</p>
  <p style="${P};margin-top:26px">Sincerely,</p>
  <p style="margin:0 0 2px 0;${F}"><b>${esc(CFG.signName)}</b></p>
  <p style="margin:0 0 20px 0;${F}">${esc(CFG.signTitle)}</p>
</td></tr>
<tr><td style="padding:0 20px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #cccccc;border-bottom:1px solid #cccccc">
   <tr><td style="padding:14px 30px 12px 30px" valign="middle">
     <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
       <td valign="middle" style="padding-right:30px">
         <div style="${F}font-size:14px"><a href="${CFG.webUrl}" style="color:#0563C1">${CFG.web}</a> &nbsp;|&nbsp; ${CFG.phone}</div>
         <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px"><tr>${social}</tr></table>
       </td>
       <td valign="middle">${img('logo', 123, 30, 'Premium Car Rentals')}</td>
     </tr></table>
   </td></tr>
  </table>
  <p style="margin:12px 0 10px 0;${F}font-size:14px"><b>${esc(CFG.address)}</b></p>
  <div style="border:1px solid #dddddd;padding:10px 12px;${F}font-size:13px;line-height:1.5">
    <p style="margin:0 0 8px 0">${esc(DISCLAIMER)}</p>
    <p style="margin:0">${esc(GREEN)}</p>
  </div>
</td></tr>
<tr><td style="height:20px">&nbsp;</td></tr>
</table></body></html>`;
}

/* full=false -> shorter text for mailto: links (URL length limits) */
function text(d, full) {
  const fines = (d.fines && d.fines.length) ? d.fines : [{ fineNo: d.fineNo, amount: d.amount }];
  const many = fines.length > 1;
  const L = [
    `Dear ${clean(d.name)},`, '', 'We hope this email finds you well.', '',
    many ? `You have ${fines.length} new Traffic Fines with a total of AED ${money(d.amount)}` : `You have a new Traffic Fine of AED ${money(d.amount)}`,
    ...(many ? fines.map(f => `Fine No. ${clean(f.fineNo)} - AED ${money(f.amount)}`) : []), '',
    `Please Download attached PDF bill and traffic fine ${many ? 'tickets' : 'ticket'} for details!`, '',
    many ? REGRET_MANY : REGRET, '', 'Please be aware of our “Traffic Fines Payment” process terms:', '',
    ...TERMS.map(t => '• ' + t), '', THANKS, '', 'Sincerely,', CFG.signName, CFG.signTitle, '',
    `${CFG.web} | ${CFG.phone}`
  ];
  if (full) L.push(CFG.address, '', DISCLAIMER, '', GREEN);
  return L.join('\r\n');
}

/* over = optional {to, cc:[...], subject} typed by the user in the overlay */
function build(d, over) {
  return Object.assign({ to: clean(d.to || ''), cc: CFG.cc.slice(), subject: subject(d), html: html(d, 'data'), text: text(d, true) }, over || {});
}

function mailto(d, over) {
  const e = build(d, over);
  const mk = body => `mailto:${encodeURIComponent(e.to).replace(/%40/g, '@')}?` +
    [`cc=${encodeURIComponent(e.cc.join(','))}`, `subject=${encodeURIComponent(e.subject)}`, `body=${encodeURIComponent(body)}`].join('&');
  let url = mk(text(d, false));
  if (url.length > 1950) url = mk(text(d, false).split('\r\n').filter(l => !l.startsWith(CFG.web)).join('\r\n'));   // keep the link short enough for mail apps
  return url;
}

/* ---------- .eml draft (opens as an editable, unsent message in Outlook / Apple Mail / Thunderbird) ---------- */
function b64bytes(u8) {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
const utf8 = s => new TextEncoder().encode(s);
const fold = b => b.replace(/(.{76})/g, '$1\r\n').replace(/\r\n$/, '');
function encWord(s) {                       // RFC 2047, split on character boundaries
  const parts = []; let cur = '', curLen = 0;
  for (const ch of s) {
    const l = utf8(ch).length;
    if (curLen + l > 36) { parts.push(cur); cur = ''; curLen = 0; }
    cur += ch; curLen += l;
  }
  if (cur) parts.push(cur);
  return parts.map(p => `=?UTF-8?B?${b64bytes(utf8(p))}?=`).join('\r\n ');
}
const asciiName = n => n.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
let _bn = 0;
const boundary = p => `----=_${p}_${Date.now().toString(36)}_${(++_bn).toString(36)}`;

/* e = {to, cc[], subject, html, text}; attachments = [{name, mime, bytes:Uint8Array}] */
function buildEml(e, attachments, assets) {
  assets = assets || root.EMAIL_ASSETS;
  const bm = boundary('mixed'), br = boundary('rel'), ba = boundary('alt');
  const out = [];
  out.push('X-Unsent: 1', 'MIME-Version: 1.0');
  if (e.to) out.push('To: ' + e.to);
  out.push('Cc: ' + e.cc.join(', '));
  out.push('Subject: ' + encWord(e.subject));
  out.push(`Content-Type: multipart/mixed; boundary="${bm}"`, '');
  out.push(`--${bm}`, `Content-Type: multipart/related; boundary="${br}"`, '');
  out.push(`--${br}`, `Content-Type: multipart/alternative; boundary="${ba}"`, '');
  out.push(`--${ba}`, 'Content-Type: text/plain; charset="utf-8"', 'Content-Transfer-Encoding: base64', '', fold(b64bytes(utf8(e.text))), '');
  const htmlCid = html(e._d, 'cid', assets);
  out.push(`--${ba}`, 'Content-Type: text/html; charset="utf-8"', 'Content-Transfer-Encoding: base64', '', fold(b64bytes(utf8(htmlCid))), '');
  out.push(`--${ba}--`, '');
  Object.keys(assets).forEach(k => {
    const a = assets[k];
    out.push(`--${br}`, `Content-Type: ${a.mime}; name="${k}.${a.mime.split('/')[1]}"`, 'Content-Transfer-Encoding: base64',
      `Content-ID: <${k}@pcr.ae>`, `Content-Disposition: inline; filename="${k}.${a.mime.split('/')[1]}"`, '', fold(a.b64), '');
  });
  out.push(`--${br}--`, '');
  (attachments || []).forEach(a => {
    const fn = asciiName(a.name), enc = encodeURIComponent(a.name);
    out.push(`--${bm}`, `Content-Type: ${a.mime}; name="${fn}"`, 'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${fn}"; filename*=UTF-8''${enc}`, '', fold(b64bytes(a.bytes)), '');
  });
  out.push(`--${bm}--`, '');
  return out.join('\r\n');
}
function makeEml(d, attachments, over) {
  const e = build(d, over); e._d = d;
  return buildEml(e, attachments);
}

root.EmailTpl = { CFG, subject, html, text, build, mailto, makeEml, money, clean };
if (typeof module !== 'undefined' && module.exports) module.exports = root.EmailTpl;
})(typeof window !== 'undefined' ? window : globalThis);
