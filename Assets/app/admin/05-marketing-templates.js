/* Triplem VIP · Admin › Marketing › Email and WhatsApp templates (2026-11-28, v3: 39 email and 30 WhatsApp
 *   templates in groups, letter and feature layouts, Arabic (right-to-left), one email with Bcc, your own templates)
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
  const PRODUCT = [
    { group: "Product introductions", layout: "features", id: "overview", name: "All features (overview)", icon: "fa-solid fa-gem",
      subject: "{company}: one private workspace for your money, stock and books",
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
    { group: "Product introductions", layout: "features", id: "inventory", name: "Inventory, POS & sales", icon: "fa-solid fa-boxes-stacked",
      subject: "{company}: stock, point of sale and invoices that stay in sync",
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
    { group: "Product introductions", layout: "features", id: "accounting", name: "Accounting ERP & VAT", icon: "fa-solid fa-scale-balanced",
      subject: "{company}: formal accounting, VAT views and reports without the heavy ERP",
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
    { group: "Product introductions", layout: "features", id: "insurance", name: "Insurance agencies", icon: "fa-solid fa-shield-heart",
      subject: "{company}: insurance sales, commissions and referrals in one system",
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
    { group: "Product introductions", layout: "features", id: "lending", name: "Loans & installments", icon: "fa-solid fa-hand-holding-dollar",
      subject: "{company}: track loans and installment plans without the spreadsheets",
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
    { group: "Product introductions", layout: "features", id: "expenses", name: "Expenses & wallets", icon: "fa-solid fa-wallet",
      subject: "{company}: see where every dirham and riyal goes",
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
    { group: "Product introductions", layout: "features", id: "assets", name: "Assets & property", icon: "fa-solid fa-building",
      subject: "{company}: the real return of every asset and property",
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
    { group: "Product introductions", layout: "features", id: "custom", name: "Custom setup for your business", icon: "fa-solid fa-sliders",
      subject: "{company}: Triplem VIP, set up the way your business works",
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

  // Industry introductions (features layout). Only features that exist in Triplem VIP.
  const F = {
    assets: ["Assets with their real result", "Purchase, maintenance, repairs, running costs, revenue and sale for every asset, with profit or loss per asset."],
    expenses: ["Wallets & expenses", "Cash, bank and card wallets in their own currency; expenses, receiving and transfers kept apart."],
    inventory: ["Inventory 2.0 & POS", "Products, stock by location, a fast till with barcodes, offline sales and PDF invoices and receipts."],
    accounting: ["Accounting ERP & VAT views", "Chart of Accounts, journals, receivables and payables, bank reconciliation and VAT views with evidence."],
    reports: ["Reports & PDFs", "Clear reports and statements as PDF, with CSV and Excel-safe exports."],
    team: ["Team access", "Each team member sees only what you allow."],
    installments: ["Installments & loans", "Plans sold to customers, schedules, reminders and statements for every customer."],
    currencies: ["Several currencies", "AED, SAR, PKR, USD, EUR and INR wallets side by side."],
    offline: ["Works on web, phone and Windows", "Also as an official app on the Microsoft Store; entries made offline are synced later."]
  };
  const industry = (id, name, icon, subject, preheader, headline, intro, feats, closing) =>
    ({ group: "Industry introductions", layout: "features", id, name, icon, subject, preheader, headline, intro, features: feats.map(k => F[k]), closing });
  const INDUSTRY = [
    industry("ind_car_rental", "Car rental & fleets", "fa-solid fa-car", "{company}: the real profit of every car in your fleet",
      "Costs, revenue and profit per vehicle, expenses and accounting in one place. 14 days free.",
      "See what every vehicle really earns", "Rental companies and fleet owners use Triplem VIP to follow each vehicle's costs and revenue and to keep the books clean.",
      ["assets", "expenses", "installments", "accounting", "team"], "We can help you add your current vehicles during the free trial."),
    industry("ind_real_estate", "Real estate & property", "fa-solid fa-city", "{company}: rent, costs and profit per property, without spreadsheets",
      "Each property's purchase, maintenance, running costs and income, with profit per asset. 14 days free.",
      "Every property's numbers, always clear", "Property owners, brokers and managers use Triplem VIP to see the full story of each unit: what it cost, what it earns and what remains.",
      ["assets", "expenses", "installments", "accounting", "reports"], "Bring your list of properties and we will help you move it in."),
    industry("ind_restaurant", "Restaurants & cafés", "fa-solid fa-utensils", "{company}: stock, sales and daily expenses in one place",
      "A fast till that keeps working offline, stock and daily expenses. 14 days free.",
      "Know your stock and your margins every day", "Restaurants and cafés use Triplem VIP to sell, track supplies and see daily expenses without juggling separate apps.",
      ["inventory", "expenses", "reports", "team", "offline"], "We can set up your menu items and locations with you."),
    industry("ind_clinic", "Clinics & pharmacies", "fa-solid fa-stethoscope", "{company}: expenses, supplies and accounting in one private workspace",
      "Wallets, stock of supplies, accounting and VAT views with team permissions. 14 days free.",
      "Clear finances for your clinic", "Clinics and pharmacies use Triplem VIP for expenses, supplies and formal accounting, with each staff member seeing only what they need.",
      ["expenses", "inventory", "accounting", "team", "reports"], "We can help you organise your first wallets and supplies during the trial."),
    industry("ind_trading", "Trading & wholesale", "fa-solid fa-truck-ramp-box", "{company}: stock, invoices and customer balances that always match",
      "Inventory by location, invoices, receivables and payables, several currencies. 14 days free.",
      "Stock and balances you can trust", "Traders and wholesalers use Triplem VIP to keep stock, invoices and customer and supplier balances in one place.",
      ["inventory", "accounting", "currencies", "reports", "team"], "We can import your products and customers with you."),
    industry("ind_logistics", "Logistics & transport", "fa-solid fa-truck-fast", "{company}: vehicle costs, expenses and books in one system",
      "Vehicles as assets, running costs, expenses and accounting. 14 days free.",
      "Control the costs behind every delivery", "Logistics and transport companies use Triplem VIP to follow vehicle costs, daily expenses and the company books.",
      ["assets", "expenses", "accounting", "team", "reports"], "We can help you add your vehicles and wallets during the trial."),
    industry("ind_travel", "Travel agencies", "fa-solid fa-plane-departure", "{company}: wallets in several currencies and clean receivables",
      "Multi-currency wallets, customer balances and formal accounting. 14 days free.",
      "Money in several currencies, always clear", "Travel agencies use Triplem VIP to keep wallets in several currencies, customer balances and the books in order.",
      ["currencies", "expenses", "accounting", "installments", "reports"], "We can set up your wallets and currencies with you.")
  ];

  // Letter-style emails: short, personal, fewer images (good for follow-ups and greetings).
  const L = (group, id, name, icon, subject, intro, body, closing, cta = "", extra = {}) =>
    ({ group, layout: "letter", id, name, icon, subject, preheader: intro.slice(0, 120), headline: "", intro, body, closing, cta, ...extra });
  const LETTERS = [
    L("Follow-ups", "fu_1", "Follow-up 1 · quick check", "fa-solid fa-reply", "Quick follow-up for {company}",
      "I wrote to you a few days ago about Triplem VIP and wanted to make sure my email reached you.",
      ["In short: one private workspace for wallets and expenses, inventory and POS, loans and installments, assets, insurance and formal accounting, on the web, the phone and Windows."],
      "Would a 15-minute demo this week be useful? Simply reply with a day that suits you.", "Start your free 14-day trial"),
    L("Follow-ups", "fu_2", "Follow-up 2 · one useful idea", "fa-solid fa-lightbulb", "One idea for {company}",
      "Many businesses we speak with keep their expenses, stock and customer balances in separate files, and spend hours each month making them match.",
      ["With Triplem VIP these live in one place, so reports stay correct without the extra work. Teams usually start with one area and add the rest later."],
      "If it helps, I can show you how it would look with your own numbers.", "See how it works"),
    L("Follow-ups", "fu_3", "Follow-up 3 · last note", "fa-solid fa-flag-checkered", "Should I close your file, {name}?",
      "I have not heard back, so I will assume the timing is not right and will not follow up again.",
      ["If things change, you can start a free 14-day trial at any time, no card needed, or reply to this email and I will gladly help."],
      "Thank you for your time, and best wishes for {company}.", "Try it when you are ready"),
    L("Offers & invitations", "demo_invite", "Demo invitation", "fa-solid fa-display", "{company}: a 15-minute Triplem VIP demo?",
      "I would like to invite you to a short online demo of Triplem VIP, focused only on the parts that matter for {company}.",
      ["In 15 minutes you will see how wallets, stock, customer balances and reports work together, and you can ask anything."],
      "Reply with two times that suit you this week and I will send an invitation.", "Or start the free trial now"),
    L("Offers & invitations", "setup_help", "Free setup help", "fa-solid fa-screwdriver-wrench", "{company}: we can set Triplem VIP up with you",
      "Moving to a new system is easier with help, so during your free trial we can set things up together with your team.",
      ["We help you choose the modules you need, create your wallets, products or assets, and move your current data in."],
      "Tell me how you work today and I will suggest the simplest setup.", "Start your free 14-day trial"),
    L("Offers & invitations", "trial_open", "Free trial reminder", "fa-solid fa-hourglass-start", "Your free 14 days of Triplem VIP, whenever you are ready",
      "Just a reminder that you can try Triplem VIP free for 14 days, with no card needed.",
      ["You can start with one area, for example expenses or inventory, and invite your team when you are ready."],
      "If you have questions before you start, simply reply to this email.", "Start your free trial"),
    L("Offers & invitations", "windows_app", "Windows app announcement", "fa-brands fa-windows", "Triplem VIP is on the Microsoft Store",
      "Triplem VIP is available as an official Windows app on the Microsoft Store, next to the web and phone versions.",
      ["Your records stay the same everywhere, and entries made offline are synced when the connection returns."],
      "It takes a minute to install.", "Get it on the Microsoft Store", { link: "store" }),
    L("Seasonal greetings", "ramadan", "Ramadan Kareem", "fa-solid fa-moon", "Ramadan Kareem from Triplem VIP",
      "On behalf of the Triplem VIP team, we wish you, your family and everyone at {company} a blessed Ramadan.",
      ["May this month bring peace, health and success."],
      "With warm regards.", ""),
    L("Seasonal greetings", "eid_fitr", "Eid al-Fitr Mubarak", "fa-solid fa-star-and-crescent", "Eid Mubarak from Triplem VIP",
      "Eid Mubarak! We wish you and the whole {company} team a joyful Eid al-Fitr with your loved ones.",
      ["Thank you for being part of our community this year."], "Warm wishes from all of us.", ""),
    L("Seasonal greetings", "eid_adha", "Eid al-Adha Mubarak", "fa-solid fa-kaaba", "Eid al-Adha Mubarak",
      "Wishing you and everyone at {company} a blessed Eid al-Adha, full of joy and peace.",
      ["May the coming days bring happiness to you and your families."], "Eid Mubarak.", ""),
    L("Seasonal greetings", "uae_day", "UAE National Day", "fa-solid fa-flag", "Happy UAE National Day",
      "Congratulations on UAE National Day. We are proud to support businesses across the Emirates.",
      ["Wishing {company} continued growth and success."], "With best wishes.", ""),
    L("Seasonal greetings", "saudi_day", "Saudi National Day", "fa-solid fa-flag", "Happy Saudi National Day",
      "Congratulations on Saudi National Day. We are glad to work with businesses across the Kingdom.",
      ["Wishing {company} continued growth and success."], "With best wishes.", ""),
    L("Seasonal greetings", "new_year", "Happy New Year", "fa-solid fa-champagne-glasses", "Happy New Year from Triplem VIP",
      "As the year begins, we wish you and the {company} team a healthy, happy and successful year.",
      ["If clearer numbers are on your list for this year, we are happy to help."], "Happy New Year.", "Start your free trial"),
    L("Relationship", "thanks_meeting", "Thank you after a meeting", "fa-solid fa-handshake", "Thank you for your time, {name}",
      "Thank you for meeting with us. It was good to learn how {company} works today.",
      ["As discussed, Triplem VIP can bring your daily records, reports and accounting into one place. I will send the next steps we agreed on."],
      "If anything is unclear, simply reply to this email.", "Start your free trial"),
    L("Relationship", "after_call", "Summary after a call", "fa-solid fa-phone", "Our call today: next steps for {company}",
      "Thank you for the call today. Here is a short summary so nothing gets lost.",
      ["We spoke about how Triplem VIP could help with your daily records and reports. The next step is a short demo or a free trial with your own data."],
      "Reply with what suits you best and I will arrange it.", "Start your free trial"),
    L("Relationship", "trial_checkin", "Trial check-in", "fa-solid fa-circle-question", "How is your Triplem VIP trial going, {name}?",
      "I wanted to check how your first days with Triplem VIP are going.",
      ["If something is unclear or you would like help importing data, I can join a short call with your team."],
      "Just reply to this email with any question.", "Open Triplem VIP"),
    L("Relationship", "welcome_client", "Welcome a new client", "fa-solid fa-champagne-glasses", "Welcome to Triplem VIP, {company}",
      "Welcome! Thank you for choosing Triplem VIP.",
      ["Our guides cover every area step by step, and you can reach us by email or WhatsApp whenever you need help."],
      "We look forward to working with you.", "Open the guides", { link: "guides" }),
    L("Relationship", "referral", "Ask for a referral", "fa-solid fa-user-plus", "A small favour, {name}?",
      "I hope Triplem VIP is helping {company}.",
      ["If you know another business owner who would benefit from clearer numbers, I would be grateful for an introduction. Simply reply with their name and email, or forward this message."],
      "Thank you for your trust.", ""),
    L("Relationship", "feedback", "Ask for feedback", "fa-solid fa-comment-dots", "Two minutes of feedback, {name}?",
      "Your opinion helps us improve Triplem VIP.",
      ["What do you like most, and what would make your work easier? A short reply is enough."],
      "Thank you in advance.", ""),
    L("Relationship", "reengage", "Re-engage (it has been a while)", "fa-solid fa-rotate-right", "It has been a while, {name}",
      "It has been some time since we last spoke, so here is what Triplem VIP offers today.",
      ["Inventory 2.0 with point of sale and offline sales, formal accounting with VAT views, insurance commissions, installments and Triplem AI, on the web, the phone and the Windows app."],
      "Would it be worth a fresh look for {company}?", "Start your free trial"),
    // Arabic letters (right-to-left)
    L("Arabic", "ar_intro", "تعريف بـ Triplem VIP (عربي)", "fa-solid fa-language", "{company}: مساحة عمل خاصة لأموالك ومخزونك وحساباتك",
      "يسعدنا أن نعرّفكم بـ Triplem VIP، مساحة عمل مالية ومحاسبية خاصة للشركات والأفراد.",
      ["في مكان واحد: المحافظ والمصروفات، المخزون ونقاط البيع، القروض والأقساط، الأصول، التأمين، والمحاسبة الرسمية مع عرض ضريبة القيمة المضافة. يعمل على الويب والهاتف وتطبيق ويندوز."],
      "يسعدنا أن نعرض عليكم عرضاً قصيراً. يكفي الرد على هذه الرسالة.", "ابدأ التجربة المجانية لمدة 14 يوماً", { lang: "ar" }),
    L("Arabic", "ar_followup", "متابعة (عربي)", "fa-solid fa-language", "متابعة سريعة لـ {company}",
      "أرسلت إليكم قبل أيام رسالة عن Triplem VIP وأردت التأكد من وصولها.",
      ["هل يناسبكم عرض توضيحي مدته 15 دقيقة هذا الأسبوع؟"],
      "يكفي الرد باليوم المناسب لكم.", "ابدأ التجربة المجانية", { lang: "ar" }),
    L("Arabic", "ar_ramadan", "رمضان كريم (عربي)", "fa-solid fa-moon", "رمضان كريم من Triplem VIP",
      "بالنيابة عن فريق Triplem VIP، نتمنى لكم ولأسرة {company} شهراً مباركاً.",
      ["كل عام وأنتم بخير."], "مع أطيب التحيات.", "", { lang: "ar" }),
    L("Arabic", "ar_eid", "عيد مبارك (عربي)", "fa-solid fa-star-and-crescent", "عيد مبارك من Triplem VIP",
      "عيدكم مبارك! نتمنى لكم ولفريق {company} عيداً سعيداً مع أحبائكم.",
      ["كل عام وأنتم بخير."], "مع أطيب التمنيات.", "", { lang: "ar" })
  ];
  const ALL = PRODUCT.concat(INDUSTRY, LETTERS);
  let CUSTOM = [];          // the admin's own templates (Marketing > Templates > My templates)
  let CUSTOM_WA = [];
  const GROUPS = ["Product introductions", "Industry introductions", "Follow-ups", "Offers & invitations", "Seasonal greetings", "Relationship", "Arabic", "My templates"];
  const byId = id => CUSTOM.find(t => t.id === id) || ALL.find(t => t.id === id) || ALL[0];

  // ---- WhatsApp templates -----------------------------------------------------------------------
  const W = (group, id, name, text, lang = "en") => ({ group, id, name, text, lang });
  const WA = [
    W("Introductions", "wa_intro", "Introduction (short)", "Hello {name},\n\nThis is {sender} from Triplem VIP. We help businesses like {company} keep wallets, stock, customer balances and accounting in one private workspace, on the web, the phone and Windows.\n\nYou can try it free for 14 days, no card needed: {link}\n\nWould a short demo be helpful?"),
    W("Follow-ups", "wa_followup", "Follow-up", "Hello {name}, just following up on my message about Triplem VIP for {company}. Would a 15-minute demo this week suit you?"),
    W("Follow-ups", "wa_last", "Last follow-up", "Hello {name}, I will not message again about Triplem VIP. If it becomes useful later, the free trial is here: {link}\n\nAll the best to {company}."),
    W("Offers", "wa_demo", "Demo invitation", "Hello {name}, would you like a short online demo of Triplem VIP focused on {company}? 15 minutes is enough. Which day suits you?"),
    W("Offers", "wa_setup", "Free setup help", "Hello {name}, during the free trial we can set Triplem VIP up with your team and help move your current data. Shall we start? {link}"),
    W("Offers", "wa_windows", "Windows app", "Hello {name}, Triplem VIP is now on the Microsoft Store as an official Windows app: https://apps.microsoft.com/detail/9MV028GH5NPX"),
    W("Relationship", "wa_thanks", "Thank you after a meeting", "Thank you for your time today, {name}. As agreed, I will send the next steps for {company} shortly."),
    W("Relationship", "wa_after_call", "After a call", "Thank you for the call, {name}. The next step is a short demo or the free trial with your own data: {link}. What suits you best?"),
    W("Relationship", "wa_trial", "Trial check-in", "Hello {name}, how are your first days with Triplem VIP going? If you need help importing data, I can join a short call."),
    W("Relationship", "wa_referral", "Ask for a referral", "Hello {name}, if you know another business owner who would benefit from Triplem VIP, I would be grateful for an introduction. Thank you!"),
    W("Relationship", "wa_reengage", "Re-engage", "Hello {name}, it has been a while! Triplem VIP now includes Inventory 2.0 with POS, formal accounting, insurance commissions and a Windows app. Worth a fresh look for {company}? {link}"),
    W("Seasonal greetings", "wa_ramadan", "Ramadan Kareem", "Ramadan Kareem, {name}! Wishing you and everyone at {company} a blessed month. – {sender}, Triplem VIP"),
    W("Seasonal greetings", "wa_eid", "Eid Mubarak", "Eid Mubarak, {name}! Wishing you and your family a joyful Eid. – {sender}, Triplem VIP"),
    W("Seasonal greetings", "wa_uae_day", "UAE National Day", "Happy UAE National Day, {name}! Wishing {company} continued success. – {sender}, Triplem VIP"),
    W("Seasonal greetings", "wa_saudi_day", "Saudi National Day", "Happy Saudi National Day, {name}! Wishing {company} continued success. – {sender}, Triplem VIP"),
    W("Seasonal greetings", "wa_new_year", "Happy New Year", "Happy New Year, {name}! Wishing you and {company} a healthy and successful year. – {sender}, Triplem VIP"),
    W("Arabic", "wa_ar_intro", "تعريف (عربي)", "مرحباً {name}،\n\nمعك {sender} من Triplem VIP. نساعد الشركات مثل {company} على إدارة المحافظ والمخزون وأرصدة العملاء والمحاسبة في مساحة عمل خاصة واحدة، على الويب والهاتف وويندوز.\n\nيمكنكم التجربة مجاناً لمدة 14 يوماً دون بطاقة: {link}\n\nهل يناسبكم عرض توضيحي قصير؟", "ar"),
    W("Arabic", "wa_ar_followup", "متابعة (عربي)", "مرحباً {name}، أتابع رسالتي السابقة عن Triplem VIP لـ {company}. هل يناسبكم عرض توضيحي مدته 15 دقيقة هذا الأسبوع؟", "ar"),
    W("Arabic", "wa_ar_demo", "عرض توضيحي (عربي)", "مرحباً {name}، هل ترغبون في عرض توضيحي قصير عبر الإنترنت لـ Triplem VIP؟ أي يوم يناسبكم؟", "ar"),
    W("Arabic", "wa_ar_thanks", "شكر بعد اجتماع (عربي)", "شكراً لوقتكم اليوم يا {name}. سأرسل لكم الخطوات التالية لـ {company} قريباً.", "ar"),
    W("Arabic", "wa_ar_ramadan", "رمضان كريم (عربي)", "رمضان كريم يا {name}! نتمنى لكم ولفريق {company} شهراً مباركاً. – {sender}، Triplem VIP", "ar"),
    W("Arabic", "wa_ar_eid", "عيد مبارك (عربي)", "عيدكم مبارك يا {name}! كل عام وأنتم بخير. – {sender}، Triplem VIP", "ar")
  ];
  const WA_GROUPS = ["Product messages", "Introductions", "Follow-ups", "Offers", "Relationship", "Seasonal greetings", "Arabic", "My templates"];

  function greetingName(c){
    const person = oneLine(c?.contact_person);
    if (person) return person.split(" ")[0];
    return c?.kind === "individual" ? oneLine(c?.name).split(" ")[0] : "";
  }
  const LINKS = { trial: SITE + "/", store: STORE, guides: SITE + "/seo/", pricing: SITE + "/#pricing" };
  function utm(template, link = "trial"){
    if (link === "store") return STORE;
    if (link === "guides") return `${SITE}/seo/?utm_source=email&utm_medium=outreach&utm_campaign=${encodeURIComponent(template)}`;
    return `${SITE}/?utm_source=email&utm_medium=outreach&utm_campaign=${encodeURIComponent(template)}`;
  }
  function unsubscribeUrl(token){ return `${SITE}/unsubscribe/?t=${encodeURIComponent(String(token || ""))}`; }
  const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(v || ""));
  // Personal emails: /go/?t=<token>; one Bcc email: /go/?c=<campaign>; previews: the plain address.
  const trackedUrl = (token, link, template, campaign) => /^[0-9a-f]{64}$/.test(String(token || "")) ? `${SITE}/go/?t=${token}&l=${link}`
    : isUuid(campaign) ? `${SITE}/go/?c=${campaign}&l=${link}` : utm(template, link);

  // ---- wording (saved overrides replace the standard text) -------------------------------------
  function wording(t, settings, contact, bcc = false){
    const ov = (settings?.template_overrides && settings.template_overrides[t.id]) || {};
    const ar = t.lang === "ar";
    const company = oneLine(contact?.name) || (ar ? "شركتكم" : "your business");
    const name = greetingName(contact) || (bcc ? (ar ? "" : "there") : company);
    const fill = v => String(v || "").replace(/\{company\}/gi, company).replace(/\{name\}/gi, name).replace(/\s+([,.!?،])/g, "$1");
    let subject = ov.subject || t.subject || "";
    if (bcc || !oneLine(contact?.name)) subject = subject.replace(/^\{company\}:\s*/i, "");
    subject = oneLine(fill(subject));
    if (subject) subject = subject[0].toUpperCase() + subject.slice(1);
    return {
      subject,
      preheader: fill(t.preheader || ""),
      headline: fill(ov.headline || t.headline || ""),
      intro: fill(ov.intro || t.intro || ""),
      body: (t.body || []).map(fill),
      closing: fill(ov.closing || t.closing || ""),
      cta: oneLine(fill(ov.cta || t.cta || (t.layout === "features" ? (ar ? "ابدأ التجربة المجانية" : "Start your free 14-day trial") : ""))),
      custom: !!(ov.subject || ov.headline || ov.intro || ov.closing || ov.cta)
    };
  }

  function signature(s, ar){
    const sender = oneLine(s.sender_name) || "Triplem VIP Team";
    const title = oneLine(s.sender_title);
    const mail = oneLine(s.email) || "info@triplem.vip";
    const phone = oneLine(s.phone);
    const wa = String(s.whatsapp || "").replace(/[^0-9]/g, "");
    const site = oneLine(s.website) || SITE;
    const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.line};"><tr><td style="padding-top:16px;font:14px/21px Arial,Helvetica,sans-serif;color:${C.ink};">
        <span style="font-size:15px;"><strong>${esc(sender)}</strong></span>${title ? `<br><span style="color:${C.muted};">${esc(title)}</span>` : ""}<br>
        <span style="color:${C.teal};font-weight:bold;">Triplem VIP</span><br>
        <a href="mailto:${esc(mail)}" style="color:${C.teal};text-decoration:none;">${esc(mail)}</a>${phone ? ` &nbsp;|&nbsp; <a href="tel:${esc(phone.replace(/[^0-9+]/g, ""))}" style="color:${C.teal};text-decoration:none;">${esc(phone)}</a>` : ""}<br>
        ${wa ? `<a href="https://wa.me/${esc(wa)}" style="color:${C.teal};text-decoration:none;">WhatsApp</a> &nbsp;|&nbsp; ` : ""}<a href="${esc(site)}" style="color:${C.teal};text-decoration:none;">${esc(site.replace(/^https?:\/\//, ""))}</a>
      </td></tr></table>`;
    const text = ["--", sender, ...(title ? [title] : []), "Triplem VIP", mail, ...(phone ? [phone] : []), ...(wa ? [`WhatsApp: https://wa.me/${wa}`] : []), site];
    return { html, text, mail, wa: !!wa, sender, ar };
  }

  // ---- Email ----------------------------------------------------------------------------------
  // bcc: one email for many people (no personal name, no personal unsubscribe link: the footer
  // offers "reply Unsubscribe" and the List-Unsubscribe header points to the reply address).
  function buildEmail({ template, contact, settings, token, note = "", subject = "", logoSrc = `cid:${LOGO_CID}`, bcc = false, campaign = null }){
    const t = byId(template);
    const ar = t.lang === "ar";
    const w = wording(t, settings, contact, bcc);
    const s = settings || {};
    const company = oneLine(contact?.name);
    const hello = bcc ? "" : greetingName(contact);
    const subj = oneLine(subject) || w.subject;
    const unsub = bcc ? "" : unsubscribeUrl(token);
    const link = t.link || "trial";
    const cta = trackedUrl(bcc ? "" : token, link, t.id, campaign);
    const site = oneLine(s.website) || SITE;
    const addr = oneLine(s.address);
    const personal = String(note || "").trim();
    const sig = signature(s, ar);
    const dir = ar ? "rtl" : "ltr", align = ar ? "right" : "left";
    const greet = ar ? (hello ? `مرحباً ${hello}،` : company && !bcc ? `السادة ${company} المحترمين،` : "مرحباً،")
      : hello ? `Dear ${hello},` : company && !bcc ? `Dear ${company} team,` : "Hello,";
    const p = v => `<p style="margin:0 0 16px 0;">${esc(v).replace(/\r?\n/g, "<br>")}</p>`;
    const button = w.cta ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${ar ? "right" : "left"}"><tr><td align="center" bgcolor="${C.gold}" style="border-radius:8px;">
        <a href="${esc(cta)}" style="display:inline-block;padding:13px 26px;font:bold 15px Arial,Helvetica,sans-serif;color:#1b1505;text-decoration:none;border-radius:8px;border:1px solid ${C.goldDark};">${esc(w.cta)}</a>
      </td></tr></table>` : "";
    const footer = bcc
      ? (ar ? `وصلتكم هذه الرسالة لأن عنوانكم مدرج كجهة اتصال تجارية. لإيقاف الرسائل، يكفي الرد بكلمة <strong>إلغاء الاشتراك</strong>.`
            : `You received this email because your address is listed as a business contact. To stop receiving our emails, simply reply with <strong>Unsubscribe</strong>.`)
      : (ar ? `وصلتكم هذه الرسالة لأن ${esc(company || "شركتكم")} مدرجة كجهة اتصال تجارية. إذا كنتم لا ترغبون في تلقي رسائلنا، <a href="${esc(unsub)}" style="color:${C.teal};">يمكنكم إلغاء الاشتراك من هنا</a> ولن نراسلكم مجدداً.`
            : `You received this email because ${esc(company || "your business")} is listed as a business contact. If you prefer not to hear from us, <a href="${esc(unsub)}" style="color:${C.teal};">unsubscribe here</a> and we will not email you again.`);

    let main;
    if (t.layout === "features") {
      const feat = (t.features || []).map(([h, d]) => `
              <tr><td valign="top" width="34" style="padding:0 12px 14px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="24" height="24" align="center" valign="middle" bgcolor="${C.teal}" style="border-radius:12px;color:#ffffff;font:bold 13px Arial,Helvetica,sans-serif;line-height:24px;">&#10003;</td></tr></table>
              </td><td valign="top" style="padding:0 0 14px 0;font:15px/22px Arial,Helvetica,sans-serif;color:${C.ink};">
                <strong style="color:${C.tealDark};">${esc(h)}</strong><br><span style="color:${C.muted};">${esc(d)}</span>
              </td></tr>`).join("");
      main = `
    <tr><td style="padding:30px 36px 6px 36px;font:15px/24px Arial,Helvetica,sans-serif;color:${C.ink};">
      <p style="margin:0 0 16px 0;">${esc(greet)}</p>
      ${personal ? p(personal) : ""}
      <h1 style="margin:0 0 12px 0;font:bold 22px/30px Arial,Helvetica,sans-serif;color:${C.tealDark};">${esc(w.headline)}</h1>
      ${p(w.intro)}
    </td></tr>
    <tr><td style="padding:0 36px 4px 36px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${feat}
      </table></td></tr>
    <tr><td style="padding:4px 36px 8px 36px;font:15px/24px Arial,Helvetica,sans-serif;color:${C.ink};">${p(w.closing)}</td></tr>
    <tr><td align="center" style="padding:0 36px 10px 36px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${C.gold}" style="border-radius:8px;">
        <a href="${esc(cta)}" style="display:inline-block;padding:14px 28px;font:bold 16px Arial,Helvetica,sans-serif;color:#1b1505;text-decoration:none;border-radius:8px;border:1px solid ${C.goldDark};">${esc(w.cta)}</a>
      </td></tr></table>
      <p style="margin:12px 0 0 0;font:13px/20px Arial,Helvetica,sans-serif;color:${C.muted};">No card needed. Available on the web and on the <a href="${STORE}" style="color:${C.teal};">Microsoft Store</a>.</p>
    </td></tr>
    <tr><td style="padding:22px 36px 0 36px;font:15px/24px Arial,Helvetica,sans-serif;color:${C.ink};">
      <p style="margin:0;">I would be glad to show you a short demo${company && !bcc ? ` for ${esc(company)}` : ""}. Simply reply to this email${sig.wa ? " or message us on WhatsApp" : ""}.</p>
    </td></tr>`;
    } else {
      main = `
    <tr><td dir="${dir}" style="padding:28px 36px 4px 36px;font:15px/25px Arial,Helvetica,sans-serif;color:${C.ink};text-align:${align};">
      <p style="margin:0 0 16px 0;">${esc(greet)}</p>
      ${personal ? p(personal) : ""}
      ${w.headline ? `<h1 style="margin:0 0 12px 0;font:bold 20px/28px Arial,Helvetica,sans-serif;color:${C.tealDark};">${esc(w.headline)}</h1>` : ""}
      ${p(w.intro)}${w.body.map(p).join("")}${w.closing ? p(w.closing) : ""}
    </td></tr>
    ${button ? `<tr><td dir="${dir}" style="padding:2px 36px 8px 36px;">${button}</td></tr>` : ""}`;
    }

    const html = `<!DOCTYPE html>
<html lang="${ar ? "ar" : "en"}" dir="${dir}" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<title>${esc(subj)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${esc(w.preheader || w.intro.slice(0, 120))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${C.line};border-radius:14px;">
    <tr><td align="center" style="padding:${t.layout === "features" ? "26px 32px 18px" : "20px 32px 14px"} 32px;border-bottom:3px solid ${C.gold};">
      <a href="${esc(site)}" style="text-decoration:none;"><img src="${esc(logoSrc)}" width="${t.layout === "features" ? 220 : 170}" alt="Triplem VIP" style="display:block;width:${t.layout === "features" ? 220 : 170}px;max-width:100%;height:auto;border:0;"></a>
    </td></tr>${main}
    <tr><td dir="${dir}" style="padding:22px 36px 28px 36px;text-align:${align};">${sig.html}</td></tr>
  </table>
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;"><tr><td dir="${dir}" align="center" style="padding:16px 24px;font:12px/18px Arial,Helvetica,sans-serif;color:${C.muted};">
    ${footer}<br>
    Triplem VIP${addr ? ` · ${esc(addr)}` : ""} · <a href="${esc(SITE)}/seo/privacy-policy.html" style="color:${C.muted};">${ar ? "سياسة الخصوصية" : "Privacy policy"}</a>
  </td></tr></table>
</td></tr></table>
</body></html>`;

    const text = [greet, "", ...(personal ? [personal, ""] : []),
      ...(w.headline ? [w.headline, ""] : []), w.intro, "",
      ...(t.layout === "features" ? [...(t.features || []).map(([h, d]) => `- ${h}: ${d}`), ""] : w.body.flatMap(x => [x, ""])),
      ...(w.closing ? [w.closing, ""] : []),
      ...(w.cta ? [`${w.cta}: ${cta}`, ""] : []),
      ...(t.layout === "features" ? [`Windows app on the Microsoft Store: ${STORE}`, ""] : []),
      ...sig.text, "",
      bcc ? (ar ? "لإيقاف الرسائل، يكفي الرد بكلمة: إلغاء الاشتراك" : "To stop receiving our emails, reply with: Unsubscribe")
          : `${ar ? "إلغاء الاشتراك" : "Unsubscribe"}: ${unsub}`
    ].join("\r\n");

    return { subject: subj, html, text, unsubscribeUrl: unsub, template: t.id, lang: t.lang || "en" };
  }

  // ---- .eml (MIME) ------------------------------------------------------------------------------
  function b64utf8(str){
    const bytes = new TextEncoder().encode(String(str));
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const wrap76 = b64 => b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
  function encWord(v){ const s = oneLine(v); return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64utf8(s)}?=`; }
  const cleanAddr = e => oneLine(e).replace(/[<>"\s,;]/g, "");
  function addressHeader(name, email){
    const e = cleanAddr(email);
    const n = oneLine(name).replace(/["\\]/g, "");
    return n ? `"${/^[\x20-\x7e]*$/.test(n) ? n : encWord(n)}" <${e}>` : `<${e}>`;
  }

  // bcc: list of addresses for one email (To = your own address, everyone else hidden in Bcc).
  function buildEml({ to, toName, subject, html, text, unsubscribeUrl: unsub, replyTo, logoBase64, template, bcc = null }){
    const rel = "=_tm_rel_" + Math.random().toString(36).slice(2), alt = "=_tm_alt_" + Math.random().toString(36).slice(2);
    const bccList = Array.isArray(bcc) ? [...new Set(bcc.map(cleanAddr).filter(e => /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)))] : [];
    const listUnsub = [unsub ? `<${oneLine(unsub).replace(/[<>\s]/g, "")}>` : "", replyTo ? `<mailto:${oneLine(replyTo).replace(/[<>\s]/g, "")}?subject=Unsubscribe>` : ""].filter(Boolean).join(", ");
    const headers = [
      "X-Unsent: 1",
      `To: ${addressHeader(toName, to)}`,
      ...(bccList.length ? [`Bcc: ${bccList.map(e => `<${e}>`).join(",\r\n ")}`] : []),
      ...(replyTo ? [`Reply-To: ${addressHeader("Triplem VIP", replyTo)}`] : []),
      `Subject: ${encWord(subject)}`,
      "MIME-Version: 1.0",
      ...(listUnsub ? [`List-Unsubscribe: ${listUnsub}`] : []),
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
  const waLink = id => `${SITE}/?utm_source=whatsapp&utm_medium=outreach&utm_campaign=${encodeURIComponent(id)}`;
  const waById = id => CUSTOM_WA.find(t => t.id === id) || WA.find(t => t.id === id) || null;
  function buildWhatsApp({ template, contact, settings }){
    const s = settings || {};
    const sender = oneLine(s.sender_name) || "Triplem VIP Team";
    const hello = greetingName(contact);
    const company = oneLine(contact?.name);
    const w = waById(template);
    if (w) {
      const ar = w.lang === "ar";
      const text = String(w.text)
        .replace(/\{name\}/gi, hello || (company ? (ar ? `فريق ${company}` : `${company} team`) : (ar ? "" : "there")))
        .replace(/\{company\}/gi, company || (ar ? "شركتكم" : "your business"))
        .replace(/\{sender\}/gi, sender).replace(/\{link\}/gi, waLink(w.id))
        .replace(/[ \t]+([,.!?،])/g, "$1").replace(/مرحباً ،/g, "مرحباً،");
      return text + (ar ? "\n\nلإيقاف الرسائل أرسل STOP." : "\n\nReply STOP if you prefer not to receive messages from us.");
    }
    const t = byId(template);
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

  // The admin's own templates (server: marketing_templates, migration 250).
  function setCustom(items){
    const list = Array.isArray(items) ? items : [];
    CUSTOM = list.filter(x => x.channel === "email" && /^my-[a-z0-9]{6,20}$/.test(x.code)).map(x => ({
      group: "My templates", layout: "letter", id: x.code, dbId: x.id, name: oneLine(x.name), icon: "fa-solid fa-pen-nib", lang: x.lang === "ar" ? "ar" : "en",
      subject: x.subject || "", preheader: "", headline: x.headline || "", intro: x.intro || "",
      body: String(x.body || "").split(/\r?\n\s*\r?\n/).map(v => v.trim()).filter(Boolean), closing: x.closing || "", cta: x.cta || "" }));
    CUSTOM_WA = list.filter(x => x.channel === "whatsapp" && /^my-[a-z0-9]{6,20}$/.test(x.code)).map(x => ({
      group: "My templates", id: x.code, dbId: x.id, name: oneLine(x.name), lang: x.lang === "ar" ? "ar" : "en", text: String(x.body || "") }));
  }
  const info = t => ({ id: t.id, name: t.name, icon: t.icon, group: t.group, layout: t.layout, lang: t.lang || "en", preheader: t.preheader || "" });

  global.TriplemMarketingTemplates = Object.freeze({
    list: () => CUSTOM.concat(ALL).map(info),
    groups: () => GROUPS.slice(),
    waList: () => CUSTOM_WA.concat(WA).map(w => ({ id: w.id, name: w.name, group: w.group, lang: w.lang })).concat(PRODUCT.map(t => ({ id: t.id, name: t.name, group: "Product messages", lang: "en" }))),
    waGroups: () => WA_GROUPS.slice(),
    isWhatsApp: id => !!waById(id) || PRODUCT.some(t => t.id === id),
    defaults: id => { const t = byId(id); return { subject: t.subject, headline: t.headline || "", intro: t.intro, closing: t.closing, cta: t.cta || (t.layout === "features" ? "Start your free 14-day trial" : "") }; },
    wording: (id, settings, contact) => wording(byId(id), settings, contact),
    byId: id => info(byId(id)),
    waById: id => { const w = waById(id); return w ? { id: w.id, name: w.name, group: w.group, lang: w.lang } : null; },
    setCustom, buildEmail, buildEml, buildWhatsApp, whatsappUrl, unsubscribeUrl, LOGO_CID
  });
})(typeof window !== "undefined" ? window : globalThis);
