/* Triplem VIP · Admin › Marketing › Email and WhatsApp templates (2026-11-28)
 *
 * Builds the outreach email (subject, HTML, plain text) and the WhatsApp text for one contact.
 * The email is a complete .eml draft (X-Unsent: 1), so Outlook opens it ready to send, with the
 * Triplem VIP logo embedded (cid), the sender's signature and a personal unsubscribe link.
 * Feature statements follow the public product reference (llms-full.txt): no invented features.
 * Every value from a contact or the settings is escaped for HTML and stripped of line breaks in
 * mail headers (no header injection).
 */
(function initTriplemMarketingTemplates(global){
  "use strict";

  const SITE = "https://triplem.vip";
  const STORE = "https://apps.microsoft.com/detail/9MV028GH5NPX";
  const LOGO_CID = "triplem-logo@triplem.vip";
  const C = { teal: "#0e5a56", tealDark: "#0a3f3c", gold: "#c9a347", goldDark: "#a9832c", ink: "#1f2a30", muted: "#5d6b72", line: "#e6e1d3", bg: "#f5f3ee" };

  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const oneLine = v => String(v ?? "").replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();

  // ---- Templates ------------------------------------------------------------------------------
  const TEMPLATES = [
    { id: "overview", name: "All features (overview)", icon: "fa-solid fa-gem",
      subject: n => `${n}: one private workspace for your money, stock and books`,
      preheader: "Wallets, inventory and POS, loans, installments, assets, insurance, accounting and Triplem AI in one place. 14 days free.",
      headline: "Run your finances, stock and books in one private workspace",
      intro: "Triplem VIP is a private finance and accounting workspace for businesses and individuals. Instead of spreadsheets and separate apps, your team works in one secure place, on the web, on the phone and in our Windows app.",
      features: [
        ["Wallets & expenses", "Cash, bank and card wallets with their own currency. Expenses, receiving and internal transfers are kept apart, so reports stay honest."],
        ["Inventory 2.0 & point of sale", "Products and variants, stock by location, purchases, sales, barcodes and labels, invoices and receipts as PDF."],
        ["Loans & installment plans", "Money lent and borrowed, plans bought and sold, schedules, reminders and clear statements for every party."],
        ["Assets & insurance", "Asset lifecycle with costs, revenue and profit; insurance sales, policies, commissions and referrals."],
        ["Formal Accounting ERP", "Chart of Accounts, journals, receivables and payables, bank reconciliation, VAT views, Trial Balance, P&L and Balance Sheet."],
        ["Triplem AI", "Ask questions about your own records. Anything the AI prepares stays a draft until you approve it."]
      ],
      closing: "Many teams start with one area, for example expenses or inventory, and add the rest when they are ready." },
    { id: "inventory", name: "Inventory, POS & sales", icon: "fa-solid fa-boxes-stacked",
      subject: n => `${n}: stock, point of sale and invoices that stay in sync`,
      preheader: "Inventory 2.0: products, stock by location, POS, barcodes, labels and offline sales. 14 days free.",
      headline: "Know your stock, sell faster and invoice in seconds",
      intro: "Triplem VIP Inventory 2.0 is built for shops, traders and service businesses that need their stock, sales and customer balances to match, every day.",
      features: [
        ["Products & stock by location", "Products and variants, purchases, stock per location and low-stock signals."],
        ["Point of sale", "A fast till with barcode scanning. Sales made offline are kept and synced when the connection returns."],
        ["Barcodes & labels", "EAN-13, EAN-8, UPC-A and Code 128 labels for sheets and roll printers."],
        ["Invoices, receipts & customers", "Saved carts and proformas, customer balances, and professional PDF invoices and receipts."],
        ["Reports", "Sales, stock and profit reports, with CSV and Excel-safe exports."]
      ],
      closing: "We can set up your products and locations with you, so your team can start selling on day one." },
    { id: "accounting", name: "Accounting ERP & VAT", icon: "fa-solid fa-scale-balanced",
      subject: n => `${n}: formal accounting, VAT views and reports without the heavy ERP`,
      preheader: "Chart of Accounts, journals, AR/AP, bank reconciliation, VAT views and financial statements. 14 days free.",
      headline: "Formal double-entry accounting, made clear",
      intro: "Triplem VIP includes a formal Accounting ERP next to its day-to-day finance modules, so owners, accountants and auditors work from the same organised records.",
      features: [
        ["Chart of Accounts & journals", "Double-entry books with sales and purchases documents."],
        ["Receivables & payables", "Accounts Receivable and Payable with customer and supplier positions."],
        ["Bank reconciliation", "Match bank lines against your books and see what is still open."],
        ["VAT views", "Review VAT with the evidence behind every figure. (Returns are filed by you or your tax adviser.)"],
        ["Financial reports", "Trial Balance, Profit and Loss, Balance Sheet and General Ledger, exported as PDF."]
      ],
      closing: "Accounting firms can also use Triplem VIP to keep each client's records organised in one place." },
    { id: "insurance", name: "Insurance agencies", icon: "fa-solid fa-shield-heart",
      subject: n => `${n}: insurance sales, commissions and referrals in one system`,
      preheader: "Providers, policies, sales, customer documents, commissions, cancellations and referral settlements. 14 days free.",
      headline: "Every policy, commission and referral, accounted for",
      intro: "Triplem VIP has a dedicated Insurance area for agencies and brokers who want their sales, commissions and referral payouts to be correct and easy to check.",
      features: [
        ["Providers & policies", "Insurance companies and reusable policy types, with policy numbers on every sale."],
        ["Sales & customer documents", "Each sale with its customer, documents and invoice."],
        ["Commission tracking", "Commission per sale, received commission, deductions for cancellations and opening balances."],
        ["Referrals & settlements", "Referral partners, what they earned and what was paid."],
        ["Reports & PDFs", "Clear statements for your team, your partners and your accountant."]
      ],
      closing: "We can import your current providers and policy types so you can start right away." },
    { id: "lending", name: "Loans & installments", icon: "fa-solid fa-hand-holding-dollar",
      subject: n => `${n}: track loans and installment plans without the spreadsheets`,
      preheader: "Loans given and taken, installment plans bought and sold, schedules, reminders and statements. 14 days free.",
      headline: "Who owes what, and when, always clear",
      intro: "For merchants who sell on installments, private lenders and finance teams, Triplem VIP keeps every plan, payment and remaining balance in order.",
      features: [
        ["Loans given and taken", "Direction-aware balances: received back, returned back and what remains."],
        ["Installment plans bought and sold", "Down payments, advances, schedules and the money actually received."],
        ["Reminders & messages", "Prepared payment reminders and balance messages for each customer."],
        ["Statements", "PDF statements for every customer or counterparty."],
        ["Works offline", "Entries made without internet are kept on the device and synced later."]
      ],
      closing: "Bring your current list of plans and we will help you move it in." },
    { id: "expenses", name: "Expenses & wallets", icon: "fa-solid fa-wallet",
      subject: n => `${n}: see where every dirham and riyal goes`,
      preheader: "Cash, bank and card wallets, expenses, receiving and transfers, with clear history and reports. 14 days free.",
      headline: "Clear money movement for your business",
      intro: "Triplem VIP gives owners and teams a simple, private way to record expenses and money received, wallet by wallet, in AED, SAR, PKR, USD, EUR or INR.",
      features: [
        ["Wallets for cash, bank and cards", "Each wallet with its own currency, balance and history."],
        ["Expenses, receiving and transfers", "Kept apart, so transfers are never counted as income or expense."],
        ["Receipts & attachments", "Keep the receipt with the record, optimised automatically."],
        ["History & reports", "Search, filter and download PDF or CSV reports."],
        ["Team access", "Give staff access only to what they need."]
      ],
      closing: "It takes a few minutes to set up your first wallets." },
    { id: "assets", name: "Assets & property", icon: "fa-solid fa-building",
      subject: n => `${n}: the real return of every asset and property`,
      preheader: "Purchase, maintenance, repairs, running costs, revenue and disposal, with profit and loss per asset. 14 days free.",
      headline: "See what every asset really earns",
      intro: "For property owners, fleets and businesses with valuable equipment, Triplem VIP records each asset's full life and shows its real profit or loss.",
      features: [
        ["Full asset lifecycle", "Purchase, additional investment, maintenance, repairs and running costs."],
        ["Revenue and disposal", "Income from the asset, sale or disposal, and ownership duration."],
        ["Profit and loss per asset", "Net result and reports per asset, ready as PDF."],
        ["Depreciation & valuation", "Valuation and monthly reports where your workflow needs them."],
        ["All in one workspace", "Next to your wallets, loans and accounting."]
      ],
      closing: "We can help you add your current assets during the free trial." },
    { id: "custom", name: "Custom setup for your business", icon: "fa-solid fa-sliders",
      subject: n => `${n}: Triplem VIP, set up the way your business works`,
      preheader: "Choose the modules you need; we help configure them for your workflow. 14 days free.",
      headline: "A workspace configured around your business",
      intro: "Every business works differently. Triplem VIP lets you switch on only the modules you need, give each team member the right access, and we can configure suitable workflows with you.",
      features: [
        ["Choose your modules", "Expenses, Inventory 2.0, Assets, Loans, Installments, Notes, Insurance and Accounting."],
        ["Team and permissions", "Each team member sees only what you allow."],
        ["Your branding on documents", "Your company logo on invoices, receipts and statements."],
        ["Web, phone and Windows", "Works in the browser and as an official app on the Microsoft Store."],
        ["Personal onboarding", "We help you set up and move your current data."]
      ],
      closing: "Tell us how you work today and we will suggest the simplest setup." }
  ];
  const byId = id => TEMPLATES.find(t => t.id === id) || TEMPLATES[0];

  function greetingName(c){
    const person = oneLine(c?.contact_person);
    if (person) return person.split(" ")[0];
    return c?.kind === "individual" ? oneLine(c?.name).split(" ")[0] : "";
  }

  function utm(template){ return `${SITE}/?utm_source=email&utm_medium=outreach&utm_campaign=${encodeURIComponent(template)}`; }
  function unsubscribeUrl(token){ return `${SITE}/unsubscribe/?t=${encodeURIComponent(String(token || ""))}`; }

  // ---- Email ----------------------------------------------------------------------------------
  function buildEmail({ template, contact, settings, token, note = "", subject = "", logoSrc = `cid:${LOGO_CID}` }){
    const t = byId(template);
    const s = settings || {};
    const company = oneLine(contact?.name) || "Your business";
    const hello = greetingName(contact);
    const subj = oneLine(subject) || t.subject(company);
    const unsub = unsubscribeUrl(token);
    const cta = utm(t.id);
    const site = oneLine(s.website) || SITE;
    const sender = oneLine(s.sender_name) || "Triplem VIP Team";
    const title = oneLine(s.sender_title);
    const mail = oneLine(s.email) || "info@triplem.vip";
    const phone = oneLine(s.phone);
    const wa = String(s.whatsapp || "").replace(/[^0-9]/g, "");
    const addr = oneLine(s.address);
    const personal = String(note || "").trim();

    const feat = t.features.map(([h, d]) => `
              <tr><td valign="top" width="34" style="padding:0 12px 14px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="24" height="24" align="center" valign="middle" bgcolor="${C.teal}" style="border-radius:12px;color:#ffffff;font:bold 13px Arial,Helvetica,sans-serif;line-height:24px;">&#10003;</td></tr></table>
              </td><td valign="top" style="padding:0 0 14px 0;font:15px/22px Arial,Helvetica,sans-serif;color:${C.ink};">
                <strong style="color:${C.tealDark};">${esc(h)}</strong><br><span style="color:${C.muted};">${esc(d)}</span>
              </td></tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<title>${esc(subj)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${esc(t.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${C.line};border-radius:14px;">
    <tr><td align="center" style="padding:26px 32px 18px 32px;border-bottom:3px solid ${C.gold};">
      <a href="${esc(site)}" style="text-decoration:none;"><img src="${esc(logoSrc)}" width="220" alt="Triplem VIP" style="display:block;width:220px;max-width:100%;height:auto;border:0;"></a>
    </td></tr>
    <tr><td style="padding:30px 36px 6px 36px;font:15px/24px Arial,Helvetica,sans-serif;color:${C.ink};">
      <p style="margin:0 0 16px 0;">${hello ? `Dear ${esc(hello)},` : `Dear ${esc(company)} team,`}</p>
      ${personal ? `<p style="margin:0 0 16px 0;">${esc(personal).replace(/\r?\n/g, "<br>")}</p>` : ""}
      <h1 style="margin:0 0 12px 0;font:bold 22px/30px Arial,Helvetica,sans-serif;color:${C.tealDark};">${esc(t.headline)}</h1>
      <p style="margin:0 0 22px 0;">${esc(t.intro)}</p>
    </td></tr>
    <tr><td style="padding:0 36px 4px 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${feat}
      </table>
    </td></tr>
    <tr><td style="padding:4px 36px 8px 36px;font:15px/24px Arial,Helvetica,sans-serif;color:${C.ink};">
      <p style="margin:0 0 20px 0;">${esc(t.closing)}</p>
    </td></tr>
    <tr><td align="center" style="padding:0 36px 10px 36px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${C.gold}" style="border-radius:8px;">
        <a href="${esc(cta)}" style="display:inline-block;padding:14px 28px;font:bold 16px Arial,Helvetica,sans-serif;color:#1b1505;text-decoration:none;border-radius:8px;border:1px solid ${C.goldDark};">Start your free 14-day trial</a>
      </td></tr></table>
      <p style="margin:12px 0 0 0;font:13px/20px Arial,Helvetica,sans-serif;color:${C.muted};">No card needed. Available on the web and on the <a href="${STORE}" style="color:${C.teal};">Microsoft Store</a>.</p>
    </td></tr>
    <tr><td style="padding:22px 36px 0 36px;font:15px/24px Arial,Helvetica,sans-serif;color:${C.ink};">
      <p style="margin:0;">I would be glad to show you a short demo for ${esc(company)}. Simply reply to this email${wa ? " or message us on WhatsApp" : ""}.</p>
    </td></tr>
    <tr><td style="padding:22px 36px 28px 36px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.line};"><tr><td style="padding-top:16px;font:14px/21px Arial,Helvetica,sans-serif;color:${C.ink};">
        <span style="font-size:15px;"><strong>${esc(sender)}</strong></span>${title ? `<br><span style="color:${C.muted};">${esc(title)}</span>` : ""}<br>
        <span style="color:${C.teal};font-weight:bold;">Triplem VIP</span><br>
        <a href="mailto:${esc(mail)}" style="color:${C.teal};text-decoration:none;">${esc(mail)}</a>${phone ? ` &nbsp;|&nbsp; <a href="tel:${esc(phone.replace(/[^0-9+]/g, ""))}" style="color:${C.teal};text-decoration:none;">${esc(phone)}</a>` : ""}<br>
        ${wa ? `<a href="https://wa.me/${esc(wa)}" style="color:${C.teal};text-decoration:none;">WhatsApp</a> &nbsp;|&nbsp; ` : ""}<a href="${esc(site)}" style="color:${C.teal};text-decoration:none;">${esc(site.replace(/^https?:\/\//, ""))}</a>
      </td></tr></table>
    </td></tr>
  </table>
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;"><tr><td align="center" style="padding:16px 24px;font:12px/18px Arial,Helvetica,sans-serif;color:${C.muted};">
    You received this email because ${esc(company)} is listed as a business contact. If you prefer not to hear from us,
    <a href="${esc(unsub)}" style="color:${C.teal};">unsubscribe here</a> and we will not email you again.<br>
    Triplem VIP${addr ? ` · ${esc(addr)}` : ""} · <a href="${esc(SITE)}/seo/privacy-policy.html" style="color:${C.muted};">Privacy policy</a>
  </td></tr></table>
</td></tr></table>
</body></html>`;

    const text = [
      hello ? `Dear ${hello},` : `Dear ${company} team,`, "",
      ...(personal ? [personal, ""] : []),
      t.headline, "", t.intro, "",
      ...t.features.map(([h, d]) => `- ${h}: ${d}`), "",
      t.closing, "",
      `Start your free 14-day trial (no card needed): ${cta}`,
      `Windows app on the Microsoft Store: ${STORE}`, "",
      `I would be glad to show you a short demo for ${company}. Simply reply to this email${wa ? " or message us on WhatsApp" : ""}.`, "",
      "--", sender, ...(title ? [title] : []), "Triplem VIP", mail, ...(phone ? [phone] : []), ...(wa ? [`WhatsApp: https://wa.me/${wa}`] : []), site, "",
      `You received this email because ${company} is listed as a business contact.`,
      `Unsubscribe: ${unsub}`
    ].join("\r\n");

    return { subject: subj, html, text, unsubscribeUrl: unsub, template: t.id };
  }

  // ---- .eml (MIME) ------------------------------------------------------------------------------
  function b64utf8(str){
    const bytes = new TextEncoder().encode(String(str));
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const wrap76 = b64 => b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
  function encWord(v){ const s = oneLine(v); return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64utf8(s)}?=`; }
  function addressHeader(name, email){
    const e = oneLine(email).replace(/[<>"\s,;]/g, "");
    const n = oneLine(name).replace(/["\\]/g, "");
    return n ? `"${/^[\x20-\x7e]*$/.test(n) ? n : encWord(n)}" <${e}>` : `<${e}>`;
  }

  function buildEml({ to, toName, subject, html, text, unsubscribeUrl: unsub, replyTo, logoBase64, template }){
    const rel = "=_tm_rel_" + Math.random().toString(36).slice(2), alt = "=_tm_alt_" + Math.random().toString(36).slice(2);
    const headers = [
      "X-Unsent: 1",
      `To: ${addressHeader(toName, to)}`,
      ...(replyTo ? [`Reply-To: ${addressHeader("Triplem VIP", replyTo)}`] : []),
      `Subject: ${encWord(subject)}`,
      "MIME-Version: 1.0",
      ...(unsub ? [`List-Unsubscribe: <${oneLine(unsub).replace(/[<>\s]/g, "")}>${replyTo ? `, <mailto:${oneLine(replyTo).replace(/[<>\s]/g, "")}?subject=Unsubscribe>` : ""}`] : []),
      `X-Triplem-Template: ${oneLine(template).replace(/[^a-z0-9_-]/gi, "")}`,
      `Content-Type: multipart/related; boundary="${rel}"; type="multipart/alternative"`
    ];
    const parts = [
      `--${rel}`,
      `Content-Type: multipart/alternative; boundary="${alt}"`, "",
      `--${alt}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(b64utf8(text)), "",
      `--${alt}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(b64utf8(html)), "",
      `--${alt}--`, ""
    ];
    if (logoBase64) parts.push(`--${rel}`, 'Content-Type: image/png; name="triplem-vip.png"', "Content-Transfer-Encoding: base64",
      `Content-ID: <${LOGO_CID}>`, 'Content-Disposition: inline; filename="triplem-vip.png"', "", wrap76(logoBase64), "");
    parts.push(`--${rel}--`, "");
    return headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
  }

  // ---- WhatsApp -------------------------------------------------------------------------------
  const WA_LINES = {
    overview: "Triplem VIP is one private workspace for wallets and expenses, inventory and POS, loans, installments, assets, insurance, formal accounting and Triplem AI, on the web and on Windows.",
    inventory: "Triplem VIP Inventory 2.0 gives you products and stock by location, a fast POS with barcodes, labels, offline sales and PDF invoices and receipts.",
    accounting: "Triplem VIP includes a formal Accounting ERP: Chart of Accounts, journals, AR/AP, bank reconciliation, VAT views and financial statements.",
    insurance: "Triplem VIP has a dedicated Insurance area: providers, policies, sales, customer documents, commissions, cancellations and referral settlements.",
    lending: "Triplem VIP tracks loans given and taken and installment plans bought and sold, with schedules, reminders and PDF statements.",
    expenses: "Triplem VIP keeps cash, bank and card wallets, expenses, receiving and transfers clear, with reports and team access.",
    assets: "Triplem VIP records each asset's full life (costs, revenue, sale) and shows its real profit or loss.",
    custom: "Triplem VIP lets you switch on only the modules you need, with team permissions and your logo on documents; we help you set it up."
  };
  function buildWhatsApp({ template, contact, settings }){
    const t = byId(template);
    const s = settings || {};
    const hello = greetingName(contact);
    const company = oneLine(contact?.name);
    const sender = oneLine(s.sender_name) || "Triplem VIP Team";
    return [
      `Hello${hello ? " " + hello : company ? " " + company + " team" : ""},`,
      "",
      `This is ${sender} from Triplem VIP. ${WA_LINES[t.id] || WA_LINES.overview}`,
      "",
      `You can try it free for 14 days, no card needed: ${utm(t.id).replace("utm_source=email", "utm_source=whatsapp")}`,
      "",
      "Would a short demo be helpful? Reply STOP if you prefer not to receive messages from us."
    ].join("\n");
  }
  function whatsappUrl(number, text){
    const d = String(number || "").replace(/[^0-9]/g, "");
    return d ? `https://wa.me/${d}?text=${encodeURIComponent(String(text || ""))}` : "";
  }

  global.TriplemMarketingTemplates = Object.freeze({
    list: () => TEMPLATES.map(t => ({ id: t.id, name: t.name, icon: t.icon, preheader: t.preheader })),
    byId: id => { const t = byId(id); return { id: t.id, name: t.name, icon: t.icon }; },
    buildEmail, buildEml, buildWhatsApp, whatsappUrl, unsubscribeUrl, LOGO_CID
  });
})(typeof window !== "undefined" ? window : globalThis);
