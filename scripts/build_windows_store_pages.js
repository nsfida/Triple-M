#!/usr/bin/env node
"use strict";
/*
 * Builds the public pages of the Microsoft Store edition of the Windows app:
 *
 *   windows-store/index.html        About the Microsoft Store edition (listing companion)
 *   windows-store/trial-terms.html  Free Trial Terms and Conditions
 *   windows-store/terms.html        Terms and Conditions
 *   windows-store/privacy.html      Privacy Policy (Microsoft Store edition)
 *   windows-store/ai.html           AI features, disclosure and reporting
 *
 * The terms come from Assets/app/core/04-trial-terms.js (the same text as the in-app
 * overlay) and the prices from Assets/config/currencies.json, so the pages, the app and
 * the Store listing always say the same thing. The Store app opens these pages instead
 * of the marketing site (scripts/windows_app/native/logic_store.go).
 *
 * The only cryptocurrency wording on these pages is the single statement that the
 * Microsoft Store edition does not include such features.
 *
 * Usage: node scripts/build_windows_store_pages.js [--check]
 *   --check  fails when the files on disk differ from what would be generated.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "windows-store");
const BASE = "https://triplem.vip";
const MODIFIED = "2026-11-11";
const PRODUCT_ID = "9MV028GH5NPX";
const STORE_WEB = `https://apps.microsoft.com/detail/${PRODUCT_ID}`;
const T = require(path.join(ROOT, "Assets/app/core/04-trial-terms.js"));

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function prices() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "Assets/config/currencies.json"), "utf8"));
  const list = Array.isArray(cfg) ? cfg : cfg.currencies || [];
  return list
    .filter(c => c && c.billing && c.billing.billingEnabled !== false && Number(c.billing.monthly) > 0)
    .map(c => ({ code: c.code, monthly: c.billing.monthly, yearly: c.billing.yearly, teamMonthly: c.billing.teamMonthly, teamYearly: c.billing.teamYearly }));
}

const NAV = [
  ["index.html", "Microsoft Store edition", "/windows-store/"],
  ["trial-terms.html", "Free Trial Terms", "/windows-store/trial-terms.html"],
  ["terms.html", "Terms and Conditions", "/windows-store/terms.html"],
  ["privacy.html", "Privacy Policy", "/windows-store/privacy.html"],
  ["ai.html", "AI features", "/windows-store/ai.html"]
];

function page({ file, title, description, h1, lead, body, jsonld }) {
  const url = file === "index.html" ? `${BASE}/windows-store/` : `${BASE}/windows-store/${file}`;
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        description,
        dateModified: MODIFIED,
        inLanguage: "en",
        isPartOf: { "@id": `${BASE}/#website` },
        publisher: { "@id": `${BASE}/#organization` },
        breadcrumb: { "@id": `${url}#breadcrumb` }
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Triplem VIP", item: `${BASE}/` },
          { "@type": "ListItem", position: 2, name: "Windows app (Microsoft Store)", item: `${BASE}/windows-store/` },
          ...(file === "index.html" ? [] : [{ "@type": "ListItem", position: 3, name: h1, item: url }])
        ]
      },
      ...(jsonld || [])
    ]
  };
  const nav = NAV.map(([f, label, href]) => `<a href="${href}"${f === file ? ' aria-current="page"' : ""}>${esc(label)}</a>`).join("");
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
<meta name="author" content="Nadeem Shahzad Fida"/><meta name="publisher" content="Triplem VIP"/>
<meta name="theme-color" content="#2457d6"/><meta name="robots" content="index,follow,max-snippet:-1"/>
<link rel="canonical" href="${url}"/><link rel="alternate" hreflang="en" href="${url}"/><link rel="alternate" hreflang="x-default" href="${url}"/>
<link rel="icon" href="/Assets/logo/logo.png" type="image/png"/><link rel="manifest" href="/site.webmanifest"/>
<meta property="og:type" content="article"/><meta property="og:site_name" content="Triplem VIP"/><meta property="og:title" content="${esc(title)}"/><meta property="og:description" content="${esc(description)}"/><meta property="og:url" content="${url}"/><meta property="og:image" content="${BASE}/Assets/logo/og-card.jpg"/><meta property="article:modified_time" content="${MODIFIED}"/>
<meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${esc(title)}"/><meta name="twitter:description" content="${esc(description)}"/><meta name="twitter:image" content="${BASE}/Assets/logo/og-card.jpg"/>
<link rel="stylesheet" href="/windows-store/store.css?v=${MODIFIED}"/>
<script type="application/ld+json">${JSON.stringify(graph, null, 2).replace(/</g, "\\u003c")}</script>
</head>
<body>
<header class="ws-top">
  <a class="ws-brand" href="/windows-store/"><img src="/Assets/logo/logo.png" alt="" width="32" height="32"/><span>Triplem VIP <small>for Windows · Microsoft Store edition</small></span></a>
  <nav class="ws-nav" aria-label="Microsoft Store edition pages">${nav}</nav>
</header>
<main class="ws-main" id="main">
  <p class="ws-kicker">Triplem VIP · updated ${MODIFIED}</p>
  <h1>${esc(h1)}</h1>
  ${lead ? `<p class="ws-lead">${lead}</p>` : ""}
  ${body}
</main>
<footer class="ws-foot">
  <p>Triplem VIP is operated by Nadeem Shahzad Fida · <a href="mailto:info@triplem.vip">info@triplem.vip</a> · <a href="/">Sign in</a></p>
  <p>Microsoft, Windows and Microsoft Store are trademarks of the Microsoft group of companies. Microsoft is not the provider of the Triplem VIP service.</p>
</footer>
</body>
</html>
`;
}

const section = (title, inner, id) => `<section class="ws-section"${id ? ` id="${id}"` : ""}><h2>${esc(title)}</h2>${inner}</section>`;
const ul = items => `<ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>`;

function indexPage() {
  const features = [
    ["Expenses & Wallets", "Record spending and income, keep wallets and bank accounts in step, move money between them and keep receipts with each entry."],
    ["Inventory 2.0", "Products and variants, stock by location, purchases, sales, point of sale, barcodes and labels, stock reports."],
    ["Assets", "An asset register with depreciation schedules."],
    ["Loans and Installments", "Money lent and borrowed, repayment plans, due dates and balances."],
    ["Accounting (optional)", "Double-entry books, chart of accounts, journals and statements."],
    ["Notes & Reminders", "Notes, checklists and reminders linked to your work."],
    ["Reports and PDF export", "Dashboards, period reports, a financial audit view and PDF/CSV exports."],
    ["Multi-currency", "Workspaces in AED, SAR, USD, PKR, EUR, INR and more, with regional billing."],
    ["Windows integration", "Windows notifications, taskbar jump list, tray icon, Windows Hello app lock, keyboard shortcuts, backups to a folder you choose and an offline copy of recent records."]
  ];
  const body = [
    section("Before you install", ul([
      "<b>A Triplem VIP account is required.</b> You can create one in the app with a free 14-day trial (no card). The app opens your account at triplem.vip.",
      "<b>An internet connection is required</b> to sign in, sync and back up. Recently opened records stay available during short outages and sync later.",
      "Windows 10 version 1809 or later, or Windows 11 (x64 or Arm64).",
      "Microsoft Edge WebView2 Runtime (included with Windows 11 and current versions of Windows 10).",
      "Generative AI: the app includes AI assistants (Google Gemini). See <a href=\"/windows-store/ai.html\">AI features</a>."
    ]), "requirements"),
    section("What you can do", `<div class="ws-grid">${features.map(([t, d]) => `<div class="ws-card"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</div>`, "features"),
    section("Free trial, grace period and limited access", `<p>New accounts start with a free trial. In short:</p>
      <ol class="ws-timeline">
        <li><strong>Days 1 to 14 · Free trial</strong><span>Full access to the modules you choose (by default Expenses &amp; Wallets, Inventory 2.0, Assets, Loans, Installments and Notes; Accounting is optional). No card and no automatic charge; the trial never turns into a paid plan by itself.</span></li>
        <li><strong>Next 3 days · Grace period</strong><span>Everything keeps working. The app shows the exact date and time the grace period ends.</span></li>
        <li><strong>Afterwards · Limited access</strong><span>The account stays active and nothing is deleted. You can sign in, view, search and download every record, report, PDF, CSV export, receipt, invoice, document and backup. New entries, changes and deletions are paused in every section until a Pro plan is approved.</span></li>
        <li><strong>Any time · Full access again</strong><span>Choose Pro Monthly or Pro Yearly in Plan &amp; Subscription; full access returns as soon as the payment is approved.</span></li>
      </ol>${ul([
      "Limits during the trial: Triplem AI is enabled on request and uses your own Google Gemini API key; the Insurance module and the Classic inventory are enabled on request; an internet connection is required.",
      "A banner in the app counts down the remaining days, explains the grace period and limited access, and links to the full Free Trial Terms."
    ])}<p><a class="ws-btn" href="/windows-store/trial-terms.html">Read the Free Trial Terms</a></p>`, "trial"),
    section("Plans and prices", `<p>The app is free to download. After the trial you can choose a Pro plan. Plans are bought from Triplem VIP, not from Microsoft: you pay by bank transfer directly to Triplem VIP, the app shows the plan, amount and bank account and asks you to confirm the purchase, and an administrator approves the payment. Plans do not renew automatically.</p>${T.priceHtml(prices(), "")}<p>Limited-time offer: Pro Monthly includes 30 additional days and Pro Yearly 60 additional days after approval. Team member seats are priced per seat.</p>`, "plans"),
    section("Updates", `<p>The Microsoft Store edition is updated only by the Microsoft Store. It has no updater of its own and never downloads or installs other software. Windows installs Store updates automatically, or you can check in the Microsoft Store under Library.</p><p><a class="ws-btn" href="${STORE_WEB}">Triplem VIP in the Microsoft Store</a></p>`, "updates"),
    section("Features not included in this edition", `<p>The Microsoft Store edition does not include cryptocurrency features. They are not available, shown or described in the app. Records created elsewhere stay in your account and are not changed.</p>`, "not-included"),
    section("What the app does on your PC", ul([
      "Installs per user from the Microsoft Store and needs no administrator rights.",
      "Opens your Triplem VIP account in a secure window (Microsoft Edge WebView2) and only loads triplem.vip and its own help pages.",
      "Optional features you control in the Windows app menu: Windows notifications, keep running in the tray, start with Windows (off by default), Windows Hello app lock, backups to a folder you choose.",
      "Keeps its settings and an offline copy of recent records in its own app storage in your Windows profile. Uninstalling the app removes them; your account stays online."
    ]), "on-your-pc"),
    section("Support, privacy and terms", ul([
      "Support: Live Support in the app or on <a href=\"https://triplem.vip/\">triplem.vip</a>, or email <a href=\"mailto:info@triplem.vip\">info@triplem.vip</a>.",
      "<a href=\"/windows-store/privacy.html\">Privacy Policy</a> · <a href=\"/windows-store/terms.html\">Terms and Conditions</a> · <a href=\"/windows-store/trial-terms.html\">Free Trial Terms</a> · <a href=\"/windows-store/ai.html\">AI features and reporting</a>"
    ]), "support")
  ].join("");
  return page({
    file: "index.html",
    title: "Triplem VIP for Windows, Microsoft Store Edition Guide",
    description: "Triplem VIP for Windows from the Microsoft Store: requirements, features, the 14-day free trial and its limits, plans, Store-only updates, privacy and AI.",
    h1: "Triplem VIP for Windows, Microsoft Store edition",
    lead: "A private workspace for expenses, inventory, assets, loans, installments, accounting and reports, as a Windows app. Requires a Triplem VIP account (free 14-day trial) and an internet connection.",
    body,
    jsonld: [{
      "@type": "SoftwareApplication",
      "@id": `${BASE}/windows-store/#app`,
      name: "Triplem VIP",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Windows 10 version 1809 or later, Windows 11",
      url: `${BASE}/windows-store/`,
      installUrl: STORE_WEB,
      softwareRequirements: "Triplem VIP account, internet connection, Microsoft Edge WebView2 Runtime",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free download; 14-day free trial of the Triplem VIP service; paid plans from Triplem VIP." },
      publisher: { "@id": `${BASE}/#organization` }
    }]
  });
}

function termsPage(kind) {
  const trial = kind === "trial";
  const body = T.sectionsHtml(trial ? T.TRIAL : T.TERMS, { prices: prices(), regional: "", headingTag: "h2", toc: true })
    .replace(/<section class="tt-section/g, '<section class="ws-section tt-section')
    .replace(/ data-store-keep/g, "");
  return page({
    file: trial ? "trial-terms.html" : "terms.html",
    title: trial ? "Triplem VIP Free Trial Terms: 14 Days, Limits and Plans" : "Triplem VIP Terms and Conditions for Web, Mobile, Windows",
    description: trial
      ? "The Triplem VIP 14-day free trial in detail: what it includes, its limits, the grace period and limited access after it ends, your data and paid plans."
      : "Terms and Conditions for Triplem VIP on web, mobile and Windows, including the Microsoft Store edition: accounts, plans, payment, acceptable use, data, AI.",
    h1: trial ? "Free Trial Terms and Conditions" : "Terms and Conditions",
    lead: `Version ${esc(T.VERSION)}, effective ${esc(T.EFFECTIVE)}. ${trial ? "These terms apply to the free trial of every new Triplem VIP account, including accounts created in the Windows app from the Microsoft Store." : "These terms apply to every edition of Triplem VIP."}`,
    body
  });
}

function privacyPage() {
  const s = [
    section("Who we are", "<p>Triplem VIP is operated by Nadeem Shahzad Fida, who is responsible for the information described here. Contact: <a href=\"mailto:info@triplem.vip\">info@triplem.vip</a>. This policy covers the Windows app from the Microsoft Store; the general policy is at <a href=\"https://triplem.vip/seo/privacy-policy.html\">triplem.vip/seo/privacy-policy.html</a>.</p>"),
    section("Information we collect", ul([
      "Account details: name, username, email address, mobile number and, for company accounts, company name, address and optional tax registration number and logo.",
      "Records you create: expenses, income, wallets, inventory, customers, loans, installments, assets, accounting entries, notes, attachments and photos.",
      "Security data: passwords are stored only as salted hashes; two-factor settings, passkeys, sign-in sessions and security events.",
      "Support conversations with Live Support and the AI assistants, and AI content reports you send.",
      "Payment requests: the plan, amount, chosen bank account and the transfer receipt you attach. We never ask for card numbers.",
      "Windows app diagnostics: an error report is created only when you choose \"Create error report\"; personal details are removed from it before you decide whether to send it."
    ])),
    section("How we use information", ul([
      "To provide, secure and support your workspace, sync your devices and approve payments.",
      "We do not sell personal or financial information and do not use it for advertising.",
      "Records are isolated per account and organisation; other customers cannot see them."
    ])),
    section("Service providers", ul([
      "Supabase: database, file storage and server functions that hold your account and records.",
      "Google Gemini API: when you use an AI assistant, your question and the context needed to answer it are sent to Google to generate the reply. Triplem AI uses your own Gemini API key.",
      "Microsoft: the Microsoft Store distributes and updates the app; Windows delivers notifications you enable. Microsoft's own privacy statement applies to the Store.",
      "Website hosting and content delivery networks serve the website files, fonts and icons."
    ])),
    section("Data on your PC", "<p>The app keeps its settings, a sign-in session and an offline copy of recently opened records in its own app storage in your Windows user profile, so it is fast and works through short outages. Backups are written only to a folder you choose. Uninstalling the app removes its app storage; your account and records stay online.</p>"),
    section("Retention and deletion", "<p>Records are kept while your account exists, including after a trial or plan ends; they are not deleted automatically. You can export them and make backups at any time. To delete your account and records, email <a href=\"mailto:info@triplem.vip\">info@triplem.vip</a> from your registered email address; we delete them within 30 days of a verified request, except information we must keep by law.</p>"),
    section("Your rights", "<p>Depending on where you live, you may have rights to access, correct, export, restrict or delete your personal data and to object to processing. Contact <a href=\"mailto:info@triplem.vip\">info@triplem.vip</a>; we respond within 30 days.</p>"),
    section("Security", "<p>Connections use HTTPS. Access is protected by hashed passwords, optional Authenticator two-factor sign-in and passkeys, session controls, database row-level security and, in the Windows app, an optional Windows Hello app lock. Details: <a href=\"https://triplem.vip/Security/\">triplem.vip/Security/</a>.</p>"),
    section("Children", "<p>Triplem VIP is a business tool for adults and is not directed to anyone under 18.</p>"),
    section("Changes", "<p>We update the date on this page when the policy changes and notify signed-in users of material changes.</p>")
  ].join("");
  return page({
    file: "privacy.html",
    title: "Triplem VIP Privacy Policy for the Microsoft Store App",
    description: "How the Triplem VIP Windows app from the Microsoft Store and the Triplem VIP service collect, use, store and protect your data, and how to delete it.",
    h1: "Privacy Policy",
    lead: "For the Windows app from the Microsoft Store and the Triplem VIP account it opens.",
    body: s
  });
}

function aiPage() {
  const s = [
    section("Where AI is used", ul([
      "<b>Aziz and the Live Support assistant</b> answer questions about Triplem VIP on the website and in the app. You can ask for a human agent at any time.",
      "<b>Triplem AI</b> answers questions about your own workspace (for example spending this month or open loans) and can prepare drafts. It is enabled per account on request and uses your own Google Gemini API key.",
      "Answers are generated live by Google Gemini models in response to what you type. They are labelled as AI."
    ])),
    section("Limits and safeguards", ul([
      "AI answers can be wrong or incomplete. Check important figures in your records before you rely on them.",
      "Triplem AI only reads data you are allowed to see, cannot change finalised records and only creates drafts that you review and finalise yourself.",
      "The assistants answer only about Triplem VIP and your workspace and decline other topics.",
      "Do not share passwords, PINs, Authenticator codes or recovery keys with an assistant; it never needs them."
    ])),
    section("Report AI content", `<p>You can report any AI answer that is offensive, harmful, sexual, misleading, inaccurate or a privacy concern:</p>${ul([
      "Every AI answer has a <b>Report</b> button under it.",
      "Every AI screen has a permanent <b>Report an issue</b> link and a flag button in its header, also before any answer is shown.",
      "In the Windows app: Windows app menu › <b>Report AI content</b>.",
      "Or email <a href=\"mailto:info@triplem.vip\">info@triplem.vip</a>."
    ])}<p>Reports go to the Triplem VIP team with the reported answer and the question before it. The team reviews every report, records the outcome and acts on it, for example by correcting the assistant's knowledge or instructions, blocking the content or, where needed, restricting AI access for an account.</p>`),
    section("Data sent to the AI provider", "<p>Your question, the recent conversation and, for Triplem AI, the workspace data needed to answer are sent to Google to generate the reply. See the <a href=\"/windows-store/privacy.html\">Privacy Policy</a>.</p>")
  ].join("");
  return page({
    file: "ai.html",
    title: "Triplem VIP AI Features: Disclosure and How to Report",
    description: "How Triplem VIP uses live generative AI (Google Gemini) in Aziz, Live Support and Triplem AI, its limits and safeguards, and how to report AI content.",
    h1: "AI features and how to report AI content",
    lead: "Triplem VIP includes live generative AI. This page explains where it is used and how to report a problem.",
    body: s
  });
}

const CSS = `:root{--bg:#f6f8fc;--surface:#fff;--soft:#f1f4fa;--text:#14213d;--muted:#5b6475;--line:#dde3ee;--primary:#2457d6;--ok:#15803d;--ok-bg:#effaf3;--warn:#b45309;--warn-bg:#fff7eb;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0e1424;--surface:#151d31;--soft:#1b2540;--text:#e6ebf5;--muted:#9aa6bd;--line:#26314b;--primary:#7aa2ff;--ok:#4ade80;--ok-bg:#132a20;--warn:#fbbf24;--warn-bg:#2d2412}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}
a{color:var(--primary)}a:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.ws-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 18px;padding:14px 20px;background:var(--surface);border-bottom:1px solid var(--line)}
.ws-brand{display:flex;align-items:center;gap:10px;color:var(--text);text-decoration:none;font-weight:700}
.ws-brand small{display:block;font-weight:500;color:var(--muted);font-size:.78rem}
.ws-nav{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:.9rem}
.ws-nav a{text-decoration:none;padding:4px 0}.ws-nav a[aria-current=page]{font-weight:700;text-decoration:underline}
.ws-main{max-width:920px;margin:0 auto;padding:28px 20px 40px}
.ws-kicker{margin:0;color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}
h1{margin:.2em 0 .4em;font-size:clamp(1.6rem,4vw,2.2rem);line-height:1.2}
.ws-lead{font-size:1.08rem;color:var(--muted)}
.ws-section{margin:18px 0;padding:18px 20px;background:var(--surface);border:1px solid var(--line);border-radius:14px}
.ws-section h2{margin:0 0 8px;font-size:1.2rem}.ws-section h3{margin:0 0 4px;font-size:1rem}
.ws-section ul{padding-left:20px;margin:6px 0}.ws-section li{margin:4px 0}
.tt-summary{border-color:var(--primary)}
.ws-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.ws-card{padding:12px 14px;border:1px solid var(--line);border-radius:12px}.ws-card p{margin:0;color:var(--muted);font-size:.93rem}
.ws-btn{display:inline-block;padding:8px 14px;border-radius:999px;background:var(--primary);color:#fff;text-decoration:none;font-weight:600}
.tt-table-wrap{overflow-x:auto;margin:8px 0 12px;border:1px solid var(--line);border-radius:12px}
.tt-prices{width:100%;border-collapse:collapse;font-size:.93rem;min-width:460px}
.tt-prices th,.tt-prices td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
.tt-prices tbody tr:last-child th,.tt-prices tbody tr:last-child td{border-bottom:0}
.tt-prices thead th{color:var(--muted);font-size:.78rem;text-transform:uppercase;letter-spacing:.03em;background:var(--soft)}
.tt-toc{margin:18px 0;padding:16px 20px;border:1px dashed var(--line);border-radius:14px;background:var(--surface)}
.tt-toc strong{display:block;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:6px}
.tt-toc ol{margin:0;padding-left:22px;columns:2 240px;column-gap:28px}
.tt-toc li{break-inside:avoid;margin:2px 0}
.tt-toc a{text-decoration:none}.tt-toc a:hover{text-decoration:underline}
.tt-section{scroll-margin-top:16px}
.ws-section ul.tt-list-ok,.ws-section ul.tt-list-paused{list-style:none;padding:12px 14px;border-radius:12px;border:1px solid var(--line)}
.tt-list-ok{background:var(--ok-bg)}.tt-list-paused{background:var(--warn-bg)}
.tt-list-ok li,.tt-list-paused li{position:relative;padding-left:24px}
.tt-list-ok li::before{content:"✓";position:absolute;left:2px;color:var(--ok);font-weight:800}
.tt-list-paused li::before{content:"Ⅱ";position:absolute;left:2px;color:var(--warn);font-weight:800}
.ws-timeline{list-style:none;margin:10px 0 12px;padding:0;display:grid;gap:10px;counter-reset:step}
.ws-timeline li{position:relative;padding:12px 14px 12px 52px;border:1px solid var(--line);border-radius:12px;background:var(--soft)}
.ws-timeline li::before{counter-increment:step;content:counter(step);position:absolute;left:14px;top:12px;width:26px;height:26px;border-radius:50%;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700;font-size:.85rem}
.ws-timeline strong{display:block}.ws-timeline span{display:block;color:var(--muted);font-size:.95rem}
.ws-foot{max-width:920px;margin:0 auto;padding:0 20px 30px;color:var(--muted);font-size:.85rem}
@media (max-width:560px){.ws-main{padding:20px 16px 32px}.ws-section{padding:14px 14px}.ws-top{padding:12px 16px}}
`;

function build() {
  return {
    "index.html": indexPage(),
    "trial-terms.html": termsPage("trial"),
    "terms.html": termsPage("terms"),
    "privacy.html": privacyPage(),
    "ai.html": aiPage(),
    "store.css": CSS
  };
}

if (require.main === module) {
  const files = build();
  const check = process.argv.includes("--check");
  let stale = [];
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(OUT, name);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== content) stale.push(name);
    } else fs.writeFileSync(target, content);
  }
  if (check && stale.length) { console.error(`windows-store pages are out of date: ${stale.join(", ")}. Run node scripts/build_windows_store_pages.js`); process.exit(1); }
  console.log(check ? "windows-store pages are up to date." : `Built ${Object.keys(files).length} files in windows-store/.`);
}

module.exports = { build, NAV };
