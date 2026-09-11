"use strict";

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (value = "") => String(value).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const deepClone = obj => JSON.parse(JSON.stringify(obj));
  const fmtMoney = (amount, cur = "AED") => `${Number(amount || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} ${esc(cur)}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const QA_FACTOR = new URLSearchParams(location.search).has("qa") ? 0.018 : 1;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const refs = {
    moduleTabs: $("#demoModuleTabs"), moduleSelect: $("#moduleSelect"), tabs: $("#productTabs"), content: $("#productContent"),
    viewport: $("#productViewport"), stageTitle: $("#stageTitle"), stageNote: $("#stageNote"), chapterCount: $("#chapterCount"), completedCount: $("#completedCount"),
    deviceBadge: $("#demoDeviceBadge"), themeSelect: $("#demoThemeSelect"), coachChapter: $("#coachChapter"), coachTitle: $("#coachTitle"), coachText: $("#coachText"),
    coachIcon: $("#coachIcon"), coachState: $("#coachState"), tutorialTitle: $("#tutorialTitle"), tutorialSteps: $("#tutorialSteps"),
    prev: $("#prevChapterBtn"), next: $("#nextChapterBtn"), play: $("#playPauseBtn"), restart: $("#restartBtn"), speed: $("#speedSelect"), progressTitle: $("#progressTitle"), progressValue: $("#progressValue"), progressBar: $("#progressBar"), progressTrack: $(".progress-track"),
    modal: $("#demoModal"), modalKicker: $("#demoModalKicker"), modalTitle: $("#demoModalTitle"), modalBody: $("#demoModalBody"), modalPrimary: $("#modalPrimaryBtn"), modalClose: $("#modalCloseBtn"),
    toast: $("#demoToast"), cursor: $("#demoCursor"), pointerLabel: $("#demoPointerLabel"), accountBtn: $("#demoAccountBtn")
  };

  const ICONS = {
    dashboard:"fa-chart-pie", wallet:"fa-wallet", expenses:"fa-receipt", transactions:"fa-clock-rotate-left", inventory:"fa-boxes-stacked",
    sale:"fa-cart-shopping", customers:"fa-users", assets:"fa-building-columns", depreciation:"fa-arrow-trend-down", loans:"fa-hand-holding-dollar",
    installments:"fa-calendar-check", notes:"fa-note-sticky", bitcoin:"fa-bitcoin-sign", messages:"fa-comments", reports:"fa-file-lines"
  };

  const APP_TABS = [
    ["dashboard","Dashboard","fa-chart-pie"],["expenses","Expenses","fa-receipt"],["goods","Inventory","fa-boxes-stacked"],["assets","Assets","fa-building-columns"],
    ["loans","Loans","fa-hand-holding-dollar"],["installments","Installments","fa-calendar-check"],["notes","Notes","fa-note-sticky"],["bitcoin","Bitcoin","fa-bitcoin-sign"],["messages","Messages","fa-comments"]
  ];

  const INITIAL_STATE = {
    wallets:[
      {id:"w1",name:"Daily Cash",type:"Cash",currency:"AED",opening:4200,added:800,spent:1360,balance:3640,logo:"../Assets/logo/wallet_logos/Cash.png"},
      {id:"w2",name:"Emirates NBD",type:"Bank Account",currency:"AED",opening:22500,added:3500,spent:4880,balance:21120,logo:"../Assets/logo/wallet_logos/Emirates NBD.png"},
    ],
    expenses:[
      {id:"e1",wallet:"w1",item:"Fuel",type:"Transport",amount:180,date:"2026-08-29",note:"Fuel refill"},
      {id:"e2",wallet:"w2",item:"Office Internet",type:"Bills",amount:349,date:"2026-08-28",note:"Monthly internet"},
      {id:"e3",wallet:"w1",item:"Groceries",type:"Food",amount:265,date:"2026-08-27",note:"Weekly groceries"},
      {id:"e4",wallet:"w2",item:"Cloud Hosting",type:"Bills",amount:92,date:"2026-08-26",note:"Hosting renewal"}
    ],
    inventory:[
      {id:"p1",sku:"TVP-101",name:"Wireless Keyboard",category:"Electronics",qty:18,cost:58,price:89,currency:"AED"},
      {id:"p2",sku:"TVP-202",name:"USB-C Hub",category:"Electronics",qty:11,cost:72,price:119,currency:"AED"},
      {id:"p3",sku:"TVP-303",name:"Notebook Set",category:"Office",qty:32,cost:12,price:24,currency:"AED"}
    ],
    customers:[
      {id:"c1",name:"Horizon Trading",phone:"+971 50 555 0147",email:"accounts@horizon.example",sales:3280,due:640},
      {id:"c2",name:"Aster Studio",phone:"+971 55 555 0932",email:"hello@aster.example",sales:1760,due:0}
    ],
    assets:[
      {id:"a1",name:"MacBook Pro",type:"Equipment",buy:7200,spent:280,revenue:0,sale:0,status:"Owned",currency:"AED"},
      {id:"a2",name:"DJI Camera Kit",type:"Photography",buy:4800,spent:150,revenue:950,sale:0,status:"Owned",currency:"AED"}
    ],
    depreciation:[
      {id:"d1",name:"Delivery Van",category:"Vehicle",cost:86000,salvage:12000,life:5,method:"Straight Line",book:56400,annual:14800,currency:"AED"}
    ],
    loans:{given:[{id:"lg1",name:"Adeel",principal:5000,paid:1800,status:"Active",date:"2026-06-12",currency:"AED"}],taken:[{id:"lt1",name:"Business Advance",principal:12000,paid:4000,status:"Active",date:"2026-05-04",currency:"AED"}]},
    installments:[{id:"i1",name:"Laptop Purchase",total:6400,monthly:800,paidCount:4,count:8,next:"2026-09-05",currency:"AED"}],
    notes:[{id:"n1",title:"Month-end checklist",text:"Review wallets, export expense report, verify installment schedule.",tag:"Finance",updated:"Today"},{id:"n2",title:"Supplier follow-up",text:"Confirm next electronics delivery and update stock costs.",tag:"Inventory",updated:"Yesterday"}],
    messages:[{from:"Support",mine:false,text:"Welcome to Triplem VIP. How can we help today?"},{from:"You",mine:true,text:"I would like guidance on exporting my monthly report."}],
    bitcoin:{mode:"watch",address:"bc1qtriplemdemoonly7x4qv9n2z5example",balance:"0.01482500",received:"0.02130000",sent:"0.00647500",tx:8},
    activity:[
      ["Expense added","Fuel from Daily Cash","180.00 AED","fa-receipt"],["Wallet top-up","Emirates NBD","3,500.00 AED","fa-wallet"],["Installment paid","Laptop Purchase","800.00 AED","fa-calendar-check"],["Inventory sale","USB-C Hub x2","238.00 AED","fa-cart-shopping"]
    ]
  };
  let state = deepClone(INITIAL_STATE);

  const CHAPTERS = [
    {id:"dashboard",label:"Dashboard",appTab:"dashboard",icon:ICONS.dashboard,minDuration:35000,steps:[
      ["Open the financial overview","The Dashboard combines the major modules into one production-style summary."],
      ["Review Expenses at a glance","Wallet balances and recent spending are visible without opening a separate page."],
      ["Inspect business modules","Inventory, Assets, Loans and Installments surface their key totals in the same overview."],
      ["Read recent activity","Recent actions provide quick context before moving into a detailed module."],
      ["Adapt to the current device","On narrow screens the production layout prioritizes one summary section at a time."]]},
    {id:"wallets",label:"Wallets",appTab:"expenses",icon:ICONS.wallet,minDuration:52000,steps:[
      ["Open Wallets Overview","Wallets live inside Expenses in the real application, above the transaction sections."],
      ["Create a wallet","Use New Entry and Add Account, then enter a name, account type, currency and opening balance."],
      ["Manage wallet logos","A matching predefined logo is used automatically, while the wallet photo menu can upload a custom logo or restore the default."],
      ["Rename and edit","Wallet details can be edited while keeping the rest of the expense history intact."],
      ["Add money","A top-up updates the available wallet balance."],
      ["Transfer between wallets","The real wallet details provide a Transfer action with source, destination and amount."],
      ["Review wallet details","Top-up, spent and available figures remain visible with quick actions."],
      ["Delete with confirmation","Destructive actions are deliberate and confirmed before the demo record is removed."]]},
    {id:"expenses",label:"Expenses",appTab:"expenses",icon:ICONS.expenses,minDuration:47000,steps:[
      ["Start Add Expense","The Expenses entry menu opens the same compact workflow used by the production app."],
      ["Select wallet and category","The expense is linked to a wallet so balances remain meaningful."],
      ["Enter amount and note","A realistic item, amount, date and note make the record understandable."],
      ["Save and inspect the result","The new expense appears in Transactions History and reduces the selected wallet balance."],
      ["Edit the transaction","Amounts and descriptions can be corrected from the transaction controls."],
      ["Delete the transaction","A confirmed deletion removes the fictional transaction and restores the simulated balance."]]},
    {id:"transactions",label:"Transactions",appTab:"expenses",icon:ICONS.transactions,minDuration:43000,steps:[
      ["Expand Transactions History","The real application groups spending inside an expandable history section."],
      ["Change the date range","Today, Yesterday, Last 7 Days, This Month, All and Custom ranges are available."],
      ["Filter the history","Search, balance, currency and date filters narrow large histories without leaving Expenses."],
      ["Open a grouped item","Each expense item can reveal its individual dated entries."],
      ["Use row actions","Edit and delete controls remain attached to the exact transaction row."],
      ["Open PDF options","Detailed and summarized PDF exports are available from the history toolbar."]]},
    {id:"inventory",label:"Inventory",appTab:"goods",icon:ICONS.inventory,minDuration:43000,steps:[
      ["Open Inventory","The inventory workspace combines stock totals, filters and product actions."],
      ["Add a product","Create an item with SKU, category, stock, cost and selling price."],
      ["Inspect the product card","Quantity and pricing stay together for quick operational review."],
      ["Edit stock and price","The product can be adjusted without rebuilding the inventory list."],
      ["Open inventory tools","Sales, cart, scanner, barcodes, saved carts, CSV and reports are available from Actions."]]},
    {id:"sale",label:"Sale & Cart",appTab:"goods",icon:ICONS.sale,minDuration:44000,steps:[
      ["Create a sale","Choose Create Sale from the inventory actions."],
      ["Select a customer","Sales may be associated with a saved customer where appropriate."],
      ["Add products and quantity","The cart calculates line totals from the selected stock."],
      ["Choose payment details","The simulated sale can record its payment wallet and status."],
      ["Complete the sale","Inventory quantity falls and the sale total is summarized before closing."]]},
    {id:"customers",label:"Customers",appTab:"goods",icon:ICONS.customers,minDuration:39000,steps:[
      ["Open Customers","Customer records sit alongside inventory sales and invoice workflows."],
      ["Inspect a customer","Contact information, total sales and outstanding amount are shown together."],
      ["Review account activity","Recent invoices and payments explain the outstanding balance."],
      ["Record a payment","A customer payment reduces the fictional outstanding balance."],
      ["Confirm the updated account","The customer summary immediately reflects the new simulated balance."]]},
    {id:"assets",label:"Assets",appTab:"assets",icon:ICONS.assets,minDuration:45000,steps:[
      ["Open Owned Assets","The production Assets module separates owned assets from depreciation assets."],
      ["Create an asset","Record an asset name, type, purchase value and date."],
      ["Review asset metrics","Buy value, spending, revenue, sale value and net position are kept on the card."],
      ["Add an asset transaction","Expenses or revenue can be attached to the selected asset."],
      ["Open asset actions","Edit, sell, PDF and delete controls remain attached to the asset card."],
      ["Confirm the updated value","The simulated asset summary recalculates after the transaction."]]},
    {id:"depreciation",label:"Depreciation",appTab:"assets",icon:ICONS.depreciation,minDuration:42000,steps:[
      ["Switch to Depreciation","Depreciation assets use a dedicated subview rather than ordinary asset cards."],
      ["Create a depreciating asset","Cost, salvage value, useful life and method define the schedule."],
      ["Review book value","Current book value and annual depreciation remain visible at a glance."],
      ["Open the schedule","A period-by-period schedule explains how value changes."],
      ["Open report tools","Depreciation reports can be exported from the dedicated view."]]},
    {id:"loans",label:"Loans",appTab:"loans",icon:ICONS.loans,minDuration:48000,steps:[
      ["Review Loan Given","Given loans show principal, received amount and remaining balance."],
      ["Record a repayment","A received-back entry reduces the amount still owed to you."],
      ["Switch to Loan Taken","The mode switch separates money you lent from money you borrowed."],
      ["Inspect a taken loan","Principal, returned amount and remaining liability are shown with status."],
      ["Open the timeline","Dated loan events explain how the balance changed."],
      ["Use card actions","PDF, edit, installment conversion and delete options are available where applicable."]]},
    {id:"installments",label:"Installments",appTab:"installments",icon:ICONS.installments,minDuration:47000,steps:[
      ["Open installment plans","Each plan shows total, paid, remaining, next date and progress."],
      ["Create a plan","A schedule is defined by total amount, installment size, count and due dates."],
      ["View the schedule","Paid and unpaid installments are clearly distinguished."],
      ["Pay an installment","Recording a payment updates the count, remaining amount and progress bar."],
      ["Open plan actions","Charts, schedule, edit, reminder, statement and delete actions stay together."],
      ["Review updated progress","The plan card immediately reflects the fictional payment."]]},
    {id:"notes",label:"Notes",appTab:"notes",icon:ICONS.notes,minDuration:36000,steps:[
      ["Open Notes","Notes provide lightweight private reminders inside the same application shell."],
      ["Create a note","Add a title, category and useful text."],
      ["Review the note card","The newest note appears with its tag and update time."],
      ["Edit the note","The text can be refined without creating a second record."],
      ["Delete the note","The demo confirms the destructive action before removing it locally."]]},
    {id:"bitcoin",label:"Bitcoin",appTab:"bitcoin",icon:ICONS.bitcoin,minDuration:47000,steps:[
      ["Open Bitcoin tools","The production interface supports WIF, Watch, Seed, Brain, Bulk and Hex modes."],
      ["Use Watch mode","A public address can be inspected without exposing a private key."],
      ["Load the demo address","The local simulation shows balance, received, sent and transaction count."],
      ["Inspect receive information","The receive view presents the address clearly for copying or sharing."],
      ["Review wallet controls","Send, Receive, PDF, Refresh and Clear controls match the real wallet workspace."],
      ["Clear the local session","The demo removes its fictional address without touching production data."]]},
    {id:"messages",label:"Messages",appTab:"messages",icon:ICONS.messages,minDuration:37000,steps:[
      ["Open Messages","The message workspace keeps conversation context beside the active thread."],
      ["Choose a conversation","Selecting a thread loads its existing messages."],
      ["Write a reply","The composer keeps focus on the selected conversation."],
      ["Send the message","The local fictional reply appears immediately in the thread."],
      ["Read the response","A simulated support reply demonstrates the complete conversation flow."]]},
    {id:"reports",label:"Reports",appTab:"dashboard",icon:ICONS.reports,minDuration:39000,steps:[
      ["Open account reporting","The real account menu exposes full-report and data export tools."],
      ["Choose Full Report","A consolidated report can be requested without changing a production module."],
      ["Preview the report scope","The demo summarizes the modules included in the fictional export."],
      ["Review section PDF tools","Expenses, wallets, assets, loans and installments also provide contextual PDF actions."],
      ["Finish with safe exports","This walkthrough creates no real file or backend record; it only demonstrates the production workflow."]]},
  ];

  let chapterIndex = 0;
  const completed = new Set();
  let activeStep = -1;
  let activeTarget = null;
  let currentDevice = "desktop";
  let toastTimer = null;
  const playback = {token:0,running:false,paused:false,speed:1,start:0};

  class Cancelled extends Error {}
  const rawSleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  function assertToken(token){ if(token !== playback.token) throw new Cancelled(); }
  async function sleep(ms, token){
    let remaining = Math.max(0, ms * QA_FACTOR / playback.speed);
    let last = performance.now();
    while(remaining > 0){
      assertToken(token);
      if(playback.paused){ await rawSleep(Math.min(80, Math.max(12, 80 * QA_FACTOR))); last = performance.now(); continue; }
      const slice = Math.min(remaining, Math.max(12, 72 * QA_FACTOR));
      await rawSleep(slice);
      const now = performance.now();
      remaining -= Math.max(0, now - last);
      last = now;
    }
  }

  function getDevice(){ const w = innerWidth; return w <= 700 ? "mobile" : w <= 1100 ? "tablet" : "desktop"; }
  function syncDevice(){
    currentDevice = getDevice();
    refs.viewport.dataset.device = currentDevice;
    document.body.dataset.demoDevice = currentDevice;
    const icon = currentDevice === "mobile" ? "fa-mobile-screen-button" : currentDevice === "tablet" ? "fa-tablet-screen-button" : "fa-desktop";
    refs.deviceBadge.innerHTML = `<i class="fa-solid ${icon}"></i><span>${currentDevice[0].toUpperCase()+currentDevice.slice(1)}</span>`;
    refs.stageNote.innerHTML = `<i class="fa-solid ${icon}"></i> ${currentDevice === "desktop" ? "Desktop production layout" : currentDevice === "tablet" ? "Tablet responsive layout" : "Mobile production layout"}`;
  }

  function renderChrome(){
    refs.chapterCount.textContent = CHAPTERS.length;
    refs.coachChapter.textContent = `Chapter ${chapterIndex + 1} of ${CHAPTERS.length}`;
    refs.completedCount.textContent = completed.size;
    refs.moduleTabs.innerHTML = CHAPTERS.map((c,i)=>`<button type="button" class="module-tab ${i===chapterIndex?"active":""} ${completed.has(c.id)?"done":""}" data-chapter-index="${i}" aria-current="${i===chapterIndex?"page":"false"}"><i class="fa-solid ${c.icon}"></i><span>${esc(c.label)}</span></button>`).join("");
    refs.moduleSelect.innerHTML = CHAPTERS.map((c,i)=>`<option value="${i}" ${i===chapterIndex?"selected":""}>${i+1}. ${esc(c.label)}</option>`).join("");
    refs.stageTitle.textContent = CHAPTERS[chapterIndex].label;
    refs.progressTitle.textContent = CHAPTERS[chapterIndex].label;
    refs.coachIcon.innerHTML = `<i class="fa-solid ${CHAPTERS[chapterIndex].icon}"></i>`;
    refs.tutorialTitle.textContent = `${CHAPTERS[chapterIndex].label} steps`;
    refs.tutorialSteps.innerHTML = CHAPTERS[chapterIndex].steps.map((s,i)=>`<li class="tutorial-step ${i===activeStep?"active":""} ${i<activeStep?"complete":""}" data-step="${i}"><strong>${esc(s[0])}</strong>${esc(s[1])}</li>`).join("");
    renderProductTabs();
  }

  function renderProductTabs(){
    const active = CHAPTERS[chapterIndex].appTab;
    refs.tabs.innerHTML = APP_TABS.map(([id,label,icon])=>`<button type="button" class="tab ${id===active?"active":""}" data-app-tab="${id}"><i class="fa-solid ${icon}"></i><span class="tab-label">${esc(label)}</span></button>`).join("");
  }

  function updateStep(index, title, text){
    activeStep = index;
    const step = CHAPTERS[chapterIndex].steps[index] || [title,text];
    refs.coachTitle.textContent = title || step[0];
    refs.coachText.textContent = text || step[1];
    refs.tutorialSteps.innerHTML = CHAPTERS[chapterIndex].steps.map((s,i)=>`<li class="tutorial-step ${i===index?"active":""} ${i<index?"complete":""}" data-step="${i}"><strong>${esc(s[0])}</strong>${esc(s[1])}</li>`).join("");
    const active = $(`.tutorial-step[data-step="${index}"]`, refs.tutorialSteps); active?.scrollIntoView({block:"nearest"});
    const pct = Math.round((index / Math.max(1, CHAPTERS[chapterIndex].steps.length)) * 100);
    setProgress(pct);
  }

  function setProgress(pct){ pct=clamp(Math.round(pct),0,100); refs.progressBar.style.width = `${pct}%`; refs.progressValue.textContent = `${pct}%`; refs.progressTrack?.setAttribute("aria-valuenow",String(pct)); }
  function setCoachState(kind){
    refs.coachState.classList.remove("is-running","is-paused");
    if(kind === "running"){ refs.coachState.classList.add("is-running"); refs.coachState.innerHTML='<span class="state-dot"></span><span>Playing</span>'; }
    else if(kind === "paused"){ refs.coachState.classList.add("is-paused"); refs.coachState.innerHTML='<span class="state-dot"></span><span>Paused</span>'; }
    else if(kind === "complete") refs.coachState.innerHTML='<span class="state-dot" style="background:var(--success)"></span><span>Chapter complete</span>';
    else refs.coachState.innerHTML='<span class="state-dot"></span><span>Ready</span>';
  }
  function syncPlayButton(){
    const icon = refs.play.querySelector("i"), label = refs.play.querySelector("span");
    if(playback.running && !playback.paused){ icon.className="fa-solid fa-pause"; label.textContent="Pause"; refs.play.setAttribute("aria-label","Pause chapter"); }
    else { icon.className="fa-solid fa-play"; label.textContent=playback.paused?"Resume":"Play"; refs.play.setAttribute("aria-label",playback.paused?"Resume chapter":"Play chapter"); }
  }

  function walletById(id){ return state.wallets.find(w=>w.id===id); }
  function walletLogo(name, fallback="../Assets/logo/wallet_logos/triplem_default_wallet.png"){
    const known = ["Cash","Emirates NBD","ADCB","Rak Bank","UBL","HBL","Meezan Bank","Easypaisa","NayaPay","Bitcoin","Cryptocurrency"];
    const match = known.find(x=>x.toLowerCase()===String(name).toLowerCase()); return match ? `../Assets/logo/wallet_logos/${match}.png` : fallback;
  }
  function stat(label,value,cls=""){ return `<div class="metric ${cls}"><span>${esc(label)}</span><strong>${value}</strong></div>`; }
  function field(id,label,value="",type="text",width="w6",extra=""){ return `<label class="field ${width}" for="${id}"><span>${esc(label)}</span><input class="input" id="${id}" name="${id}" type="${type}" value="${esc(value)}" ${extra}></label>`; }
  function selectField(id,label,options,value="",width="w6"){
    return `<label class="field ${width}" for="${id}"><span>${esc(label)}</span><select class="select" id="${id}" name="${id}">${options.map(x=>`<option value="${esc(x)}" ${x===value?"selected":""}>${esc(x)}</option>`).join("")}</select></label>`;
  }
  function textArea(id,label,value="",width="w12"){ return `<label class="field ${width}" for="${id}"><span>${esc(label)}</span><textarea class="textarea" id="${id}" name="${id}" rows="3">${esc(value)}</textarea></label>`; }

  function renderWalletCard(w, detail=false){
    const totalTopup = Number(w.opening)+Number(w.added);
    const safeId=`demo_wallet_${w.id}`;
    return `<div class="expense-wallet-card-wrap" data-wallet-card="${w.id}">
      <div class="menu-wrap wallet-logo-menu-wrap">
        <button type="button" class="wallet-logo-photo-btn menu-trigger" data-logo-btn="${w.id}" title="Wallet photo" aria-label="Wallet photo for ${esc(w.name)}"><i class="fa-solid fa-camera"></i></button>
        <div class="menu-dropdown wallet-logo-menu-dropdown" data-logo-menu="${w.id}">
          <button type="button" class="menu-item" data-logo-action="view" data-wallet="${w.id}">View</button>
          <button type="button" class="menu-item" data-logo-action="change" data-wallet="${w.id}">Change</button>
          ${w.customLogo?`<button type="button" class="menu-item" data-logo-action="default" data-wallet="${w.id}">Default</button>`:""}
        </div>
      </div>
      <input type="radio" id="${safeId}" name="f_exp_wallet" class="filter-radio expense-wallet-radio">
      <label for="${safeId}" class="expense-wallet-card wallet-details-card" data-group-id="${w.id}" data-wallet-details="${w.id}">
        <span class="expense-wallet-title"><img src="${esc(w.logo)}" alt="" style="width:18px;height:18px;object-fit:contain;vertical-align:middle"> ${esc(w.name)} (${fmtMoney(w.balance,w.currency)})</span>
        <span class="expense-wallet-sub">${esc(w.type)} · ${w.currency==='AED'?'د.إ':esc(w.currency)}</span>
        <div class="expense-wallet-stats"><span><em>Top-up</em> <strong>${fmtMoney(totalTopup,w.currency)}</strong></span><span><em>Spent</em> <strong>${fmtMoney(w.spent,w.currency)}</strong></span><span class="available-label"><em style="color:var(--success)!important">Available</em> <strong class="available-amount">${fmtMoney(w.balance,w.currency)}</strong></span></div>
      </label>
      <div class="expense-wallet-actions">
        <button type="button" class="expenseWalletQuick" data-wallet-action="details" data-wallet="${w.id}">Details</button>
        <button type="button" class="expenseWalletQuick" data-wallet-action="topup" data-wallet="${w.id}">Add money</button>
        <button type="button" class="expenseWalletQuick" data-wallet-action="expense" data-wallet="${w.id}">Add expense</button>
        <button type="button" class="expenseWalletQuick" data-wallet-action="pdf" data-wallet="${w.id}">PDF</button>
        <button type="button" class="expenseWalletQuick" data-wallet-action="edit" data-wallet="${w.id}">Edit</button>
        <button type="button" class="expenseWalletQuick danger" data-wallet-action="delete" data-wallet="${w.id}">Delete</button>
      </div>
    </div>`;
  }

  function walletDetailsBody(w){
    return `<div class="summary currency-summary wallet-details-card" data-wallet-detail-modal="${w.id}"><div class="currency-head"><img src="${esc(w.logo)}" alt="" style="width:26px;height:26px;object-fit:contain"><strong>${esc(w.name)}</strong></div><p class="help">${esc(w.type)} · ${esc(w.currency)}</p><div class="overview-grid">${stat("Top-up",fmtMoney(w.opening+w.added,w.currency))}${stat("Spent",fmtMoney(w.spent,w.currency))}${stat("Available",fmtMoney(w.balance,w.currency),"good")}</div><div class="overview-card-actions" style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><button class="tiny ghost" data-detail-action="topup">Add Money</button><button class="tiny ghost" data-detail-action="expense">Add Expense</button><button class="tiny ghost" data-detail-action="transfer">Transfer</button><button class="tiny ghost" data-detail-action="pdf"><i class="fa-solid fa-download"></i></button><button class="tiny ghost" data-detail-action="edit">Edit</button><button class="tiny danger" data-detail-action="delete">Delete Wallet</button></div></div>`;
  }

  function expensesToolbar(){
    return `<div class="section-head expense-section-head"><div class="section-head-top"><div class="title-group"><div class="title-row"><h3>Expenses</h3><button type="button" class="tiny ghost sectionDetailsBtn" id="expenseDetailsBtn"><i class="fa-solid fa-chart-pie"></i> Details</button><div class="menu-wrap"><button type="button" class="tiny ghost menu-trigger" id="expenseNewEntryBtn">New Entry <span aria-hidden="true">▾</span></button><div class="menu-dropdown" id="expenseEntryMenu"><button type="button" data-entry="account"><i class="fa-solid fa-wallet"></i> Add Account</button><button type="button" data-entry="topup"><i class="fa-solid fa-money-bill-transfer"></i> Add Money</button><button type="button" data-entry="expense"><i class="fa-solid fa-receipt"></i> Add Expense</button><button type="button" data-entry="csv-download"><i class="fa-solid fa-file-csv"></i> Download CSV</button><button type="button" data-entry="csv-upload"><i class="fa-solid fa-file-arrow-up"></i> Upload CSV</button><button type="button" data-entry="pdf"><i class="fa-solid fa-file-pdf"></i> Download PDF</button></div></div></div><p>Wallets show top-up, spent, and balance. The list is an expense statement by item; open an item for wallet-level transactions.</p></div></div></div>`;
  }

  function expenseFilters(){
    return `<div class="filter-inline-row compact-filter-row" id="expenseFilters"><div class="compact-filter-main"><label class="search compact-search"><i class="fa-solid fa-magnifying-glass"></i><input id="searchExpenses" type="search" placeholder="Item, wallet, note" autocomplete="off"></label><select class="select" id="expenseBalanceFilter" aria-label="Balance filter"><option>All</option><option>Active Balance</option><option>Zero Balance</option></select><select class="select" id="expenseCurrencyFilter" aria-label="Currency filter"><option>All</option><option>AED</option><option>SAR</option><option>PKR</option><option>USD</option><option>BTC</option></select></div><div class="filter-inline-section compact-filter-dates"><span class="filter-inline-label">Date</span><input class="input" id="expenseDateFrom" type="date" value="2026-08-01"><span class="filter-inline-label">to</span><input class="input" id="expenseDateTo" type="date" value="2026-08-30"><button type="button" class="tiny ghost" id="expenseDateClear">Clear</button></div></div>`;
  }

  function allWalletCard(){
    return `<div class="expense-wallet-card-wrap expense-wallet-all-wrap"><input type="radio" id="demo_wallet_all" name="f_exp_wallet" class="filter-radio expense-wallet-radio" value="all" checked><label for="demo_wallet_all" class="expense-wallet-card expense-wallet-card-all"><span class="expense-wallet-title">All wallets</span><span class="expense-wallet-sub">Expense statement includes every wallet below.</span></label></div>`;
  }

  function transactionDetails(open=false){
    const grouped={}; state.expenses.forEach(e=>(grouped[e.item] ||= []).push(e));
    const rangeBtns=[['today','Today'],['yesterday','Yesterday'],['last7','Last 7 Days'],['month','This Month'],['all','All'],['custom','Custom']];
    return `<details class="expense-collapsible-section" id="transactionsHistorySection" ${open?'open':''}><summary class="expense-collapsible-header expense-history-header"><h4 class="expense-section-title"><i class="fa-solid fa-list-ul"></i> Transactions History</h4><span class="expense-history-controls" id="transactionRanges">${rangeBtns.map(([v,l])=>`<button type="button" class="tiny ghost expense-history-range-btn ${v==='month'?'active':''}" data-expense-history-range="${v}">${l}</button>`).join('')}<span class="expense-history-download-wrap menu-wrap"><button type="button" class="icon-btn ghost expenseActionBtn expense-history-download" id="transactionPdfBtn" aria-label="Download transaction history"><i class="fa-solid fa-download"></i></button><div class="expense-history-pdf-menu menu-dropdown" id="transactionPdfMenu"><button type="button" data-pdf="detailed"><i class="fa-solid fa-file-pdf"></i> Detailed PDF</button><button type="button" data-pdf="summary"><i class="fa-solid fa-file-lines"></i> Summarize PDF</button></div></span></span><span class="expand-icon">▶</span></summary><div class="expense-collapsible-content"><div class="expense-section-toolbar"><span class="help">Showing fictional local transactions for the selected period.</span></div><div class="expense-history-list">${Object.entries(grouped).map(([name,rows],idx)=>{const total=rows.reduce((sum,row)=>sum+row.amount,0);return `<details class="loan expense-item-row" data-expense-group="${esc(name)}" ${idx===0&&open?'open':''}><summary><div class="loan-top"><div class="lt-main"><div class="loan-name">${esc(name)}</div><div class="loan-sub"><span class="badge blue">${esc(rows[0]?.type||'Other')}</span><span>${rows.length} transaction(s)</span><span>AED</span></div></div><div class="cell expense-item-total"><small>Total spent</small><strong>${fmtMoney(total,'AED')}</strong></div><div class="lt-action"><button type="button" class="icon-btn ghost" aria-label="Download item statement"><i class="fa-solid fa-download"></i></button></div></div></summary><div class="detail"><div class="table-wrap demo-table-scroll"><table><thead><tr><th>Date</th><th>Wallet</th><th>Type</th><th>Amount</th><th>VAT</th><th>Notes</th><th>Action</th></tr></thead><tbody>${rows.map(r=>`<tr data-transaction-row="${r.id}"><td>${esc(r.date)}</td><td>${esc(walletById(r.wallet)?.name||'Wallet')}</td><td>${esc(r.type)}</td><td>${fmtMoney(r.amount,'AED')}</td><td>0.00 AED</td><td>${esc(r.note)}</td><td><button type="button" class="tiny ghost editRowBtn" data-tx-edit="${r.id}"><i class="fa-solid fa-pen"></i> Edit</button> <button type="button" class="tiny danger delRowBtn" data-tx-delete="${r.id}"><i class="fa-solid fa-trash"></i> Delete</button></td></tr>`).join('')}</tbody></table></div></div></details>`}).join('')}</div></div></details>`;
  }

  function renderDashboard(){
    const mobile = currentDevice === "mobile";
    const walletTotal = state.wallets.reduce((s,w)=>s+w.balance,0);
    const invProfit = state.inventory.reduce((s,p)=>s+p.qty*(p.price-p.cost),0);
    const assetNet = state.assets.reduce((s,a)=>s+(a.revenue+a.sale)-(a.buy+a.spent),0);
    const givenRemaining = state.loans.given.reduce((s,l)=>s+l.principal-l.paid,0);
    const takenRemaining = state.loans.taken.reduce((s,l)=>s+l.principal-l.paid,0);
    const inst = state.installments[0];
    const instPct = Math.round((inst.monthly*inst.paidCount)/inst.total*100);
    const switcher = mobile ? `<div class="dashboard-section-switch" id="dashboardMobileSwitcher" role="tablist">${[["Expenses","fa-receipt"],["Inventory","fa-boxes-stacked"],["Assets","fa-building-columns"],["Loans","fa-hand-holding-dollar"],["Installments","fa-calendar-check"]].map(([x,icon],i)=>`<button class="dashboard-section-switch-btn ${i===0?'active':''}" aria-selected="${i===0?'true':'false'}"><i class="fa-solid ${icon}"></i><span>${x}</span></button>`).join("")}</div>` : "";
    const heroCards = [
      `<article class="dashboard-hero-card is-expenses" data-dash-card="expenses"><small>Wallet balance</small><strong>${fmtMoney(walletTotal)}</strong><div class="dashboard-hero-meta">AED · ${state.wallets.length} wallets</div></article>`,
      `<article class="dashboard-hero-card is-inventory" data-dash-card="inventory"><small>Inventory profit</small><strong>${fmtMoney(invProfit)}</strong><div class="dashboard-hero-meta">AED · ${state.inventory.length} items</div></article>`,
      `<article class="dashboard-hero-card is-assets ${assetNet>=0?'is-up':'is-down'}" data-dash-card="assets"><small>Asset net P/L</small><strong>${fmtMoney(assetNet)}</strong><div class="dashboard-hero-meta">AED · ${state.assets.length} active · ${state.assets.length} total</div></article>`,
      `<article class="dashboard-hero-card is-loans" data-dash-card="loans"><small>Loans outstanding</small><strong>${fmtMoney(givenRemaining)}</strong><div class="dashboard-hero-meta">Given open · Taken open ${fmtMoney(takenRemaining)}</div></article>`,
      `<article class="dashboard-hero-card is-installments" data-dash-card="installments"><small>Installment progress</small><strong>${instPct}%</strong><div class="dashboard-hero-meta">1 active · 0 overdue</div></article>`
    ];
    return `<section class="panel active" id="dashboardPanel"><div class="card section dashboard-section" id="dashboardRoot"><div class="section-head"><div><h2>Dashboard</h2><p class="help">A concise financial and operational overview.</p></div><span class="badge">Demo data</span></div><div class="dashboard-root">${switcher}<div class="dashboard-hero ${mobile?'dashboard-hero-single':''}" id="dashboardHero" data-dashboard-hero="1" style="--dashboard-hero-cols:${mobile?1:5}">${mobile?heroCards[0]:heroCards.join('')}</div><div class="dashboard-grid"><article class="dashboard-block" id="dashChartBlock"><div class="dashboard-block-head"><div><h3>Financial movement</h3><p class="help">Recent activity by period</p></div></div><div class="demo-chart-grid">${[38,66,49,81,54,72,45,88,64,76,57,92].map(h=>`<span style="--h:${h}%"></span>`).join("")}</div></article><article class="dashboard-block" id="dashActivityBlock"><div class="dashboard-block-head"><div><h3>Recent activity</h3><p class="help">Latest actions across modules</p></div></div><div class="demo-activity-list">${state.activity.map(([a,b,c,icon])=>`<div class="demo-activity-row"><i class="fa-solid ${icon}"></i><div><strong>${esc(a)}</strong><small>${esc(b)}</small></div><b>${esc(c)}</b></div>`).join("")}</div></article></div></div></div></section>`;
  }


  function renderExpenseOverviewWalletCard(w){
    const totalTopup=Number(w.opening||0)+Number(w.added||0);
    return `<div class="summary currency-summary wallet-details-card" data-wallet-card="${w.id}" data-wallet-details="${w.id}" data-group-id="${w.id}" role="button" tabindex="0" title="View wallet details"><div class="menu-wrap wallet-logo-menu-wrap"><button type="button" class="wallet-logo-photo-btn menu-trigger" data-logo-btn="${w.id}" title="Wallet photo" aria-label="Wallet photo for ${esc(w.name)}"><i class="fa-solid fa-camera"></i></button><div class="menu-dropdown wallet-logo-menu-dropdown" data-logo-menu="${w.id}"><button type="button" class="menu-item" data-logo-action="view" data-wallet="${w.id}">View</button><button type="button" class="menu-item" data-logo-action="change" data-wallet="${w.id}">Change</button>${w.customLogo?`<button type="button" class="menu-item" data-logo-action="default" data-wallet="${w.id}">Default</button>`:''}</div></div><div class="currency-head" style="font-size:1.1rem;gap:6px;justify-content:flex-start"><span class="summary-currency-mark">${w.currency==='AED'?'د.إ':esc(w.currency)}</span><img src="${esc(w.logo)}" alt="" style="width:24px;height:24px;object-fit:contain"><span style="font-size:.8rem;font-weight:750;line-height:1.2;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.name)}</span></div><div class="summary-line summary-line-one"><span class="summary-line-one-label">Top-up:</span><span class="summary-line-one-value">${fmtMoney(totalTopup,w.currency)}</span></div><div class="summary-line summary-line-one"><span class="summary-line-one-label">Spent:</span><span class="summary-line-one-value">${fmtMoney(w.spent,w.currency)}</span></div><div class="summary-line summary-line-one available-label"><span class="summary-line-one-label strong-success">Available Balance:</span><span class="summary-line-one-value available-amount strong-success">${fmtMoney(w.balance,w.currency)}</span></div><div class="overview-card-actions" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="tiny ghost" data-wallet-action="topup" data-wallet="${w.id}">Add Money</button><button class="tiny ghost" data-wallet-action="expense" data-wallet="${w.id}">Add Expense</button><button class="tiny ghost" data-wallet-action="transfer" data-wallet="${w.id}">Transfer</button><button class="tiny ghost walletDownloadPdfBtn" data-wallet-action="pdf" data-wallet="${w.id}" aria-label="Download wallet transactions PDF"><i class="fa-solid fa-download"></i></button><button class="tiny ghost" data-wallet-action="edit" data-wallet="${w.id}">Edit</button><button class="tiny danger" data-wallet-action="delete" data-wallet="${w.id}">Delete Wallet</button></div></div>`;
  }

  function renderExpenseOverview(){
    const totalTopup=state.wallets.reduce((sum,w)=>sum+Number(w.opening||0)+Number(w.added||0),0), totalSpent=state.wallets.reduce((sum,w)=>sum+Number(w.spent||0),0), totalBalance=state.wallets.reduce((sum,w)=>sum+Number(w.balance||0),0);
    const summary=`<div class="summary currency-summary expense-overview"><div class="currency-head">Summary <span class="summary-currency-mark">د.إ</span></div><div class="summary-line summary-line-one"><span class="summary-line-one-label">Total Amount:</span><span class="summary-line-one-value">${fmtMoney(totalTopup)}</span></div><div class="summary-line summary-line-one"><span class="summary-line-one-label">Total Expenses:</span><span class="summary-line-one-value">${fmtMoney(totalSpent)}</span></div><div class="summary-line summary-line-one available-label"><span class="summary-line-one-label strong-success">Available Balance:</span><span class="summary-line-one-value available-amount strong-success">${fmtMoney(totalBalance)}</span></div><div class="overview-card-actions" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="tiny ghost" id="overviewViewExpenses">View Expenses</button><button class="tiny ghost" id="overviewAddAccount">Add Account</button><button class="tiny ghost" aria-label="Download expenses PDF"><i class="fa-solid fa-download"></i></button></div></div>`;
    const cards=state.wallets.map(renderExpenseOverviewWalletCard).join('');
    return `<section class="overview wallets-overview-section expanded" id="walletsOverviewSection"><div class="overview-top" id="walletsBanner"><div><h3>Wallets Overview</h3><p>Account balances and expense tracking by wallet.</p></div><div class="tools"><button class="icon-btn ghost" id="toggleWalletsBtn" type="button" title="Collapse Wallets Overview">▼</button></div></div><div class="wallets-content" id="walletsContent"><div id="expenseOverviewWallets">${currentDevice==='mobile'?summary+cards:`<div class="wallets-desktop-layout"><div class="summary-column">${summary}</div><div class="wallets-column"><div class="wallets-grid">${cards}</div></div></div>`}</div></div></section>`;
  }

  function renderExpenses(mode="expenses"){
    const openHistory=mode==='transactions'||mode==='expenses';
    return `<section class="panel active" id="expensesPanel">${renderExpenseOverview()}<div class="card section" id="expensesWorkspace">${expensesToolbar()}${expenseFilters()}${transactionDetails(openHistory)}<details class="expense-collapsible-section" id="topupRecords"><summary class="expense-collapsible-header"><h4 class="expense-section-title"><i class="fa-solid fa-arrow-down"></i> Top-Up Records</h4><span class="expand-icon">▶</span></summary><div class="expense-collapsible-content"><p class="help">Money added to wallets is retained separately for audit clarity.</p></div></details><details class="expense-collapsible-section" id="transferRecords"><summary class="expense-collapsible-header"><h4 class="expense-section-title"><i class="fa-solid fa-right-left"></i> Transfer Records</h4><span class="expand-icon">▶</span></summary><div class="expense-collapsible-content"><p class="help">Wallet-to-wallet transfers preserve their source and destination context.</p></div></details></div></section>`;
  }

  function inventoryCard(p){
    return `<article class="loan inventory-item-card" data-product="${p.id}"><div class="loan-top"><div><strong>${esc(p.name)}</strong><span>${esc(p.sku)} · ${esc(p.category)}</span></div><span class="status ${p.qty<5?'warn':'good'}">${p.qty} in stock</span></div><div class="loan-metrics">${stat("Cost",fmtMoney(p.cost,p.currency))}${stat("Selling",fmtMoney(p.price,p.currency))}${stat("Stock value",fmtMoney(p.qty*p.cost,p.currency))}</div><div class="loan-actions"><button class="tiny ghost" data-product-edit="${p.id}">Edit</button><button class="tiny ghost" data-product-stock="${p.id}">Stock</button><button class="tiny ghost">Details</button></div></article>`;
  }

  function renderInventory(sub="inventory"){
    if(sub === "customers") return renderCustomers();
    const inventoryTotal=state.inventory.reduce((s,p)=>s+p.qty*p.cost,0);
    return `<section class="panel active" id="goodsPanel"><div class="card section" id="inventoryWorkspace"><div class="section-head"><div><h2>Inventory</h2><p class="help">Products, stock, sales, carts, customers and reporting.</p></div><div class="menu-wrap"><button class="btn primary" id="inventoryActionsBtn"><i class="fa-solid fa-bolt"></i> Actions</button><div class="menu-dropdown" id="inventoryActionsMenu"><button data-inv-action="add"><i class="fa-solid fa-plus"></i> Add item</button><button data-inv-action="sale"><i class="fa-solid fa-cart-plus"></i> Create sale</button><button data-inv-action="cart"><i class="fa-solid fa-cart-shopping"></i> Open cart</button><button data-inv-action="scanner"><i class="fa-solid fa-barcode"></i> Scanner</button><button data-inv-action="barcodes">Product Barcodes</button><button data-inv-action="saved">Saved carts</button><button data-inv-action="csv">CSV</button><button data-inv-action="pdf">PDF report</button><button data-inv-action="audit">Audit Report</button></div></div></div><div class="overview"><div class="overview-grid">${stat("Products",String(state.inventory.length))}${stat("Units",String(state.inventory.reduce((s,p)=>s+p.qty,0)))}${stat("Stock cost",fmtMoney(inventoryTotal))}${stat("Potential sales",fmtMoney(state.inventory.reduce((s,p)=>s+p.qty*p.price,0)))}</div></div><div class="filters"><label class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="inventorySearch" placeholder="Search products or SKU"></label><select class="select"><option>All categories</option><option>Electronics</option><option>Office</option></select><select class="select"><option>All stock</option><option>Low stock</option></select></div><div class="loans" id="inventoryCards">${state.inventory.map(inventoryCard).join("")}</div></div></section>`;
  }

  function renderCustomers(){
    return `<section class="panel active" id="goodsPanel"><div class="card section" id="customerWorkspace"><div class="section-head"><div><h2>Customers</h2><p class="help">Customer sales, invoices and outstanding balances.</p></div><button class="btn primary" id="addCustomerBtn"><i class="fa-solid fa-user-plus"></i> Add Customer</button></div><div class="filters"><label class="search"><i class="fa-solid fa-magnifying-glass"></i><input placeholder="Search customers"></label><select class="select"><option>All balances</option><option>Outstanding</option><option>Settled</option></select></div><div class="loans">${state.customers.map(c=>`<article class="loan" data-customer="${c.id}"><div class="loan-top"><div><strong>${esc(c.name)}</strong><span>${esc(c.phone)} · ${esc(c.email)}</span></div><span class="status ${c.due?'warn':'good'}">${c.due?'Outstanding':'Settled'}</span></div><div class="loan-metrics">${stat("Total sales",fmtMoney(c.sales))}${stat("Outstanding",fmtMoney(c.due),c.due?'warn':'good')}${stat("Invoices",c.id==='c1'?'6':'3')}</div><div class="loan-actions"><button class="tiny ghost" data-customer-view="${c.id}">View account</button>${c.due?`<button class="tiny primary" data-customer-pay="${c.id}">Record payment</button>`:""}<button class="tiny ghost">Statement</button></div></article>`).join("")}</div><div id="customerActivity"></div></div></section>`;
  }

  function assetCard(a){
    const net=(a.revenue+a.sale)-(a.buy+a.spent), netClass=net>0?'asset-net-profit':net<0?'asset-net-loss':'asset-net-flat';
    return `<article class="asset-card" data-asset="${a.id}"><div class="asset-card-top"><button type="button" class="asset-card-main" data-asset-open="${a.id}"><h4 class="asset-card-title">${esc(a.name)}</h4><div class="asset-card-meta"><span>${esc(a.type)}</span><span class="asset-status asset-status-active">Active</span><span class="asset-card-owned">Owned</span></div></button><div class="asset-card-aside"><div class="asset-card-net ${netClass}"><small>Net</small><strong>${fmtMoney(net,a.currency)}</strong></div><div class="menu-wrap"><button type="button" class="icon-btn ghost" data-asset-menu="${a.id}" aria-label="Asset actions"><i class="fa-solid fa-ellipsis-vertical"></i></button><div class="asset-card-dropdown menu-dropdown" data-asset-dropdown="${a.id}"><button data-asset-action="open">Open</button><button data-asset-action="tx">Add transaction</button><button data-asset-action="edit">Edit</button><button data-asset-action="sell">Sell asset</button><button data-asset-action="pdf">PDF</button><button data-asset-action="delete" class="danger">Delete</button></div></div></div></div><button type="button" class="asset-card-stats" data-asset-open="${a.id}"><span><em>Buy</em><strong>${fmtMoney(a.buy,a.currency)}</strong></span><span><em>Spent</em><strong>${fmtMoney(a.spent,a.currency)}</strong></span><span><em>Revenue</em><strong>${fmtMoney(a.revenue,a.currency)}</strong></span><span><em>Sale</em><strong>${fmtMoney(a.sale,a.currency)}</strong></span></button></article>`;
  }

  function renderAssets(dep=false){
    if(dep) return renderDepreciation();
    return `<section class="panel active" id="assetsPanel"><div class="card section" id="assetsWorkspace"><div class="section-head"><div><h3>Assets</h3><p>Track owned assets, their purchase cost, running expenses, revenue and eventual sale.</p></div><button class="btn primary" id="addAssetBtn"><i class="fa-solid fa-plus"></i> Add Asset</button></div><div class="assets-module-tabs" id="assetsSubTabs"><button class="btn ghost active" data-assets-sub="owned">Owned Assets</button><button class="btn ghost" data-assets-sub="depreciation">Depreciation</button></div><div class="filter-inline-row" id="assetFilters"><div class="filter-inline-section"><span class="filter-inline-label">Status</span><label class="filter-chip"><input type="radio" name="assetStatusFilterDemo" value="all" checked> All</label><label class="filter-chip"><input type="radio" name="assetStatusFilterDemo" value="active"> Active</label><label class="filter-chip"><input type="radio" name="assetStatusFilterDemo" value="sold"> Sold</label><label class="filter-chip"><input type="radio" name="assetStatusFilterDemo" value="disposed"> Disposed</label></div></div><div class="assets-summary overview"><div class="overview-grid">${stat('Owned assets',String(state.assets.length))}${stat('Purchase value',fmtMoney(state.assets.reduce((sum,a)=>sum+a.buy,0)))}${stat('Asset expenses',fmtMoney(state.assets.reduce((sum,a)=>sum+a.spent,0)))}${stat('Asset revenue',fmtMoney(state.assets.reduce((sum,a)=>sum+a.revenue,0)))}</div></div><div class="assets-grid" id="assetCards">${state.assets.map(assetCard).join('')}</div></div></section>`;
  }

  function renderDepreciation(scheduleOpen=false){
    const d=state.depreciation[0];
    return `<section class="panel active" id="assetsPanel"><div class="card section" id="depreciationWorkspace"><div class="section-head"><div><h2>Assets</h2><p class="help">Owned assets and depreciation assets remain separated for clarity.</p></div><div class="menu-wrap"><button class="btn primary" id="depActionsBtn"><i class="fa-solid fa-plus"></i> New</button><div class="menu-dropdown" id="depActionsMenu"><button data-dep-action="add">Add depreciating asset</button><button data-dep-action="report">Depreciation report</button></div></div></div><div class="assets-module-tabs" id="assetsSubTabs"><button class="btn ghost" data-assets-sub="owned">Owned Assets</button><button class="btn ghost active" data-assets-sub="depreciation">Depreciation</button></div><article class="loan dep-asset-card" data-dep="${d.id}"><div class="loan-top"><div><strong>${esc(d.name)}</strong><span>${esc(d.category)} · ${esc(d.method)}</span></div><span class="status good">Active</span></div><div class="loan-metrics">${stat("Original cost",fmtMoney(d.cost,d.currency))}${stat("Book value",fmtMoney(d.book,d.currency))}${stat("Annual depreciation",fmtMoney(d.annual,d.currency))}${stat("Salvage value",fmtMoney(d.salvage,d.currency))}</div><div class="loan-actions"><button class="tiny ghost" id="depScheduleBtn">View schedule</button><button class="tiny ghost" id="depReportBtn">PDF report</button><button class="tiny ghost">Edit</button></div></article>${scheduleOpen?`<div class="card" id="depSchedule" style="margin-top:10px"><div class="section-head"><div><h3>Depreciation Schedule</h3><p class="help">Straight-line forecast for the fictional asset.</p></div></div><div class="demo-table-scroll"><table><thead><tr><th>Year</th><th>Opening</th><th>Depreciation</th><th>Closing</th></tr></thead><tbody>${[[2026,86000,14800,71200],[2027,71200,14800,56400],[2028,56400,14800,41600],[2029,41600,14800,26800],[2030,26800,14800,12000]].map(r=>`<tr><td>${r[0]}</td><td>${fmtMoney(r[1])}</td><td>${fmtMoney(r[2])}</td><td>${fmtMoney(r[3])}</td></tr>`).join("")}</tbody></table></div></div>`:""}</div></section>`;
  }

  function loanCard(l,type){ const remain=l.principal-l.paid; return `<article class="loan loan-details-card" data-loan="${l.id}"><div class="loan-top"><div><strong>${esc(l.name)}</strong><span>${type==='given'?'Loan Given':'Loan Taken'} · ${esc(l.date)}</span></div><div class="menu-wrap"><button class="icon-btn ghost" data-loan-menu="${l.id}"><i class="fa-solid fa-ellipsis-vertical"></i></button><div class="menu-dropdown" data-loan-dropdown="${l.id}"><button data-loan-act="pdf">PDF</button><button data-loan-act="edit">Edit name</button>${type==='taken'?'<button data-loan-act="installment">Move to Installments</button>':''}<button data-loan-act="delete">Delete</button></div></div></div><div class="loan-metrics">${stat("Principal",fmtMoney(l.principal,l.currency))}${stat(type==='given'?"Received":"Returned",fmtMoney(l.paid,l.currency))}${stat("Remaining",fmtMoney(remain,l.currency),remain?"warn":"good")}</div><div class="loan-actions">${type==='given'?`<button class="tiny primary" data-loan-payment="${l.id}">Received Back</button>`:`<button class="tiny primary" data-loan-payment="${l.id}">Returned Back</button>`}<button class="tiny ghost" data-loan-timeline="${l.id}">Timeline</button></div></article>`; }

  function renderLoans(mode="given",timeline=false){
    const list=state.loans[mode];
    return `<section class="panel active" id="loansPanel"><div class="card section" id="loansWorkspace"><div class="section-head"><div><h2>Loans</h2><p class="help">Track money lent, money borrowed and repayments separately.</p></div><button class="btn primary" id="addLoanBtn"><i class="fa-solid fa-plus"></i> New Loan</button></div><div class="loan-mode-switch" id="loanModeSwitch"><button class="btn ${mode==='given'?'primary':'ghost'}" data-loan-mode="given">Loan Given / Received Back</button><button class="btn ${mode==='taken'?'primary':'ghost'}" data-loan-mode="taken">Loan Taken / Returned Back</button></div><div class="loans" id="loanCards">${list.map(l=>loanCard(l,mode)).join("")}</div>${timeline?`<div class="card" id="loanTimeline" style="margin-top:10px"><div class="section-head"><div><h3>Loan Timeline</h3><p class="help">Dated movements for ${esc(list[0]?.name||'loan')}.</p></div></div><div class="demo-table-scroll"><table><thead><tr><th>Date</th><th>Event</th><th>Amount</th><th>Balance</th></tr></thead><tbody><tr><td>${esc(list[0].date)}</td><td>Principal created</td><td>${fmtMoney(list[0].principal)}</td><td>${fmtMoney(list[0].principal)}</td></tr><tr><td>2026-07-18</td><td>${mode==='given'?'Received back':'Returned back'}</td><td>${fmtMoney(list[0].paid)}</td><td>${fmtMoney(list[0].principal-list[0].paid)}</td></tr></tbody></table></div></div>`:""}</div></section>`;
  }

  function installmentCard(i){ const paid=i.monthly*i.paidCount, remain=i.total-paid, pct=Math.round(paid/i.total*100); return `<article class="installment-plan-card loan" data-plan="${i.id}"><div class="ip-card-head loan-top"><div><strong>${esc(i.name)}</strong><span>${i.paidCount} of ${i.count} paid · Next ${esc(i.next)}</span></div><div class="menu-wrap"><button class="icon-btn ghost" id="installmentMenuBtn"><i class="fa-solid fa-ellipsis-vertical"></i></button><div class="menu-dropdown" id="installmentMenu"><button>View charts</button><button id="viewScheduleAction">View schedule</button><button>Edit plan / schedule</button><button data-plan-pay="${i.id}">Pay installment</button><button>Reminder</button><button>Download statement</button><button class="danger">Delete</button></div></div></div><div class="loan-metrics">${stat("Total",fmtMoney(i.total,i.currency))}${stat("Paid",fmtMoney(paid,i.currency),"good")}${stat("Remaining",fmtMoney(remain,i.currency))}${stat("Next",fmtMoney(i.monthly,i.currency))}</div><div class="ip-progress"><div class="progress-track"><span style="width:${pct}%"></span></div><div class="help" style="margin-top:4px">${pct}% complete</div></div><div class="loan-actions"><button class="tiny primary" data-plan-pay="${i.id}">Pay installment</button><button class="tiny ghost" data-plan-schedule="${i.id}">View schedule</button></div></article>`; }

  function renderInstallments(schedule=false){ const i=state.installments[0]; return `<section class="panel active" id="installmentsPanel"><div class="card section" id="installmentWorkspace"><div class="section-head"><div><h2>Installments</h2><p class="help">Schedules, payments, reminders and statements.</p></div><button class="btn primary" id="addInstallmentBtn"><i class="fa-solid fa-plus"></i> New Plan</button></div><div class="overview"><div class="overview-grid">${stat("Plans",String(state.installments.length))}${stat("Total",fmtMoney(state.installments.reduce((s,x)=>s+x.total,0)))}${stat("Paid",fmtMoney(state.installments.reduce((s,x)=>s+x.monthly*x.paidCount,0)))}${stat("Remaining",fmtMoney(state.installments.reduce((s,x)=>s+x.total-x.monthly*x.paidCount,0)))}</div></div><div class="loans">${state.installments.map(installmentCard).join("")}</div>${schedule?`<div class="card" id="installmentSchedule" style="margin-top:10px"><div class="section-head"><div><h3>Installment Schedule</h3><p class="help">Paid and upcoming installments for ${esc(i.name)}.</p></div></div><div class="demo-table-scroll"><table><thead><tr><th>#</th><th>Due date</th><th>Amount</th><th>Status</th></tr></thead><tbody>${Array.from({length:i.count},(_,n)=>`<tr><td>${n+1}</td><td>2026-${String(5+n).padStart(2,'0')}-05</td><td>${fmtMoney(i.monthly)}</td><td><span class="status ${n<i.paidCount?'good':'warn'}">${n<i.paidCount?'Paid':'Due'}</span></td></tr>`).join("")}</tbody></table></div></div>`:""}</div></section>`; }

  function renderNotes(){ return `<section class="panel active" id="notesPanel"><div class="card section" id="notesWorkspace"><div class="section-head"><div><h2>Notes</h2><p class="help">Private working notes and reminders.</p></div><button class="btn primary" id="addNoteBtn"><i class="fa-solid fa-plus"></i> New Note</button></div><div class="filters"><label class="search"><i class="fa-solid fa-magnifying-glass"></i><input placeholder="Search notes"></label><select class="select"><option>All tags</option><option>Finance</option><option>Inventory</option></select></div><div class="overview-grid" id="noteGrid">${state.notes.map(n=>`<article class="card" data-note="${n.id}" style="padding:12px"><div class="section-head"><div><span class="badge">${esc(n.tag)}</span><h3 style="margin-top:7px">${esc(n.title)}</h3></div><div class="menu-wrap"><button class="icon-btn ghost" data-note-menu="${n.id}"><i class="fa-solid fa-ellipsis-vertical"></i></button><div class="menu-dropdown" data-note-dropdown="${n.id}"><button data-note-edit="${n.id}">Edit</button><button data-note-delete="${n.id}" class="danger">Delete</button></div></div></div><p class="help">${esc(n.text)}</p><small class="help">Updated ${esc(n.updated)}</small></article>`).join("")}</div></div></section>`; }

  function renderBitcoin(loaded=true,receive=false){ const b=state.bitcoin; return `<section class="panel active" id="bitcoinPanel"><div class="card section" id="bitcoinWorkspace"><div class="section-head"><div><h2>Bitcoin</h2><p class="help">Client-side wallet utilities and watch-only inspection.</p></div><span class="badge">Demo only</span></div><div class="demo-btc-warning"><strong>Security notice:</strong> Private keys and seed phrases require extreme care. This walkthrough uses a fictional public address and never connects to a production wallet.</div><div class="demo-btc-modes" id="bitcoinModes">${[["wif","WIF"],["watch","Watch"],["seed","Seed"],["brain","Brain"],["bulk","Bulk"],["hex","Hex"]].map(([id,label])=>`<button class="btn ${b.mode===id?'primary':'ghost'}" data-btc-mode="${id}">${label}</button>`).join("")}</div><div class="card" style="margin-top:10px;padding:12px" id="bitcoinEntry"><div class="form-grid">${field("btcAddress","Public address",loaded?b.address:"","text","w12")}<div class="field w12"><span>Wallet action</span><button class="btn primary" id="loadBitcoinBtn"><i class="fa-solid fa-magnifying-glass"></i> Load wallet</button></div></div></div>${loaded?`<div class="card" id="bitcoinWalletCard" style="margin-top:10px;padding:12px"><div class="section-head"><div><h3>Watch-only wallet</h3><p class="help">Public address information only.</p></div><span class="status good">Loaded</span></div><div class="demo-btc-address" id="bitcoinAddressDisplay">${esc(b.address)}</div><div class="overview-grid" style="margin-top:10px">${stat("Balance",`${b.balance} BTC`)}${stat("Received",`${b.received} BTC`)}${stat("Sent",`${b.sent} BTC`)}${stat("Transactions",String(b.tx))}</div><div class="loan-actions" style="margin-top:10px"><button class="btn ghost" id="btcSendBtn">Send</button><button class="btn primary" id="btcReceiveBtn">Receive</button><button class="btn ghost" id="btcPdfBtn"><i class="fa-solid fa-download"></i> Download PDF</button><button class="btn ghost" id="btcRefreshBtn">Refresh</button><button class="btn ghost danger" id="btcClearBtn">Clear</button></div>${receive?`<div class="card" id="btcReceivePanel" style="margin-top:10px;padding:12px;text-align:center"><div class="demo-doughnut" style="width:112px;background:repeating-conic-gradient(#111 0 8deg,#fff 8deg 14deg)"></div><strong>Receive Bitcoin</strong><p class="demo-btc-address">${esc(b.address)}</p><button class="tiny ghost">Copy address</button></div>`:""}</div>`:""}</div></section>`; }

  function renderMessages(){ return `<section class="panel active" id="messagesPanel"><div class="card section" id="messagesWorkspace"><div class="section-head"><div><h2>Messages</h2><p class="help">Keep support or team conversations in context.</p></div><button class="btn ghost"><i class="fa-solid fa-rotate-right"></i></button></div><div class="demo-message-shell"><aside class="demo-message-list" id="messageList"><button class="demo-message-item active" data-thread="support"><strong>Support</strong><small class="help">Report export guidance</small></button><button class="demo-message-item" data-thread="team"><strong>Team</strong><small class="help">Inventory review</small></button></aside><div class="demo-chat"><div class="demo-chat-head"><strong>Support</strong><div class="help">Conversation</div></div><div class="demo-chat-body" id="chatBody">${state.messages.map(m=>`<div class="demo-bubble ${m.mine?'mine':''}">${esc(m.text)}</div>`).join("")}</div><div class="demo-chat-reply"><input class="input" id="messageReply" placeholder="Write a message"><button class="btn primary" id="sendMessageBtn"><i class="fa-solid fa-paper-plane"></i></button></div></div></div></div></section>`; }

  function renderReports(menuOpen=false,preview=false){
    return `<section class="panel active" id="dashboardPanel"><div class="card section" id="reportsWorkspace"><div class="section-head"><div><h2>Reporting & Exports</h2><p class="help">The production application exposes reports contextually and from the account menu.</p></div><span class="badge">Guided overview</span></div><div class="overview-grid">${stat("Expenses","Detailed / Summary PDF")}${stat("Wallets","Wallet transaction PDF")}${stat("Assets","Asset reports")}${stat("Loans","Loan statement PDF")}</div><div class="card" style="margin-top:10px;padding:12px"><h3>Account exports</h3><p class="help">Use the Account button in the application header to access consolidated reporting and portable data exports.</p><div class="menu-wrap" style="display:inline-block"><button class="btn primary" id="reportAccountProxy"><i class="fa-solid fa-user"></i> Account reporting</button><div class="menu-dropdown ${menuOpen?'demo-menu-open':''}" id="reportAccountMenu"><button id="fullReportAction"><i class="fa-solid fa-file-pdf"></i> Full Report</button><button><i class="fa-solid fa-file-code"></i> Export JSON</button><button><i class="fa-solid fa-file-csv"></i> Export CSV</button></div></div></div>${preview?`<div class="card demo-review-state" id="reportPreview" style="margin-top:10px;padding:12px"><div class="section-head"><div><h3>Full Report Preview</h3><p class="help">Fictional scope preview only.</p></div><span class="status good">Ready</span></div><div class="overview-grid">${stat("Wallets",String(state.wallets.length))}${stat("Transactions",String(state.expenses.length))}${stat("Inventory items",String(state.inventory.length))}${stat("Assets",String(state.assets.length+state.depreciation.length))}${stat("Loans",String(state.loans.given.length+state.loans.taken.length))}${stat("Installment plans",String(state.installments.length))}</div></div>`:""}</div></section>`;
  }

  function renderCurrent(options={}){
    syncDevice();
    const c=CHAPTERS[chapterIndex];
    if(!options.preserveScroll) refs.viewport.scrollTop=0;
    if(c.id==="dashboard") refs.content.innerHTML=renderDashboard();
    else if(["wallets","expenses","transactions"].includes(c.id)) refs.content.innerHTML=renderExpenses(c.id);
    else if(["inventory","sale"].includes(c.id)) refs.content.innerHTML=renderInventory("inventory");
    else if(c.id==="customers") refs.content.innerHTML=renderInventory("customers");
    else if(c.id==="assets") refs.content.innerHTML=renderAssets(false);
    else if(c.id==="depreciation") refs.content.innerHTML=renderAssets(true);
    else if(c.id==="loans") refs.content.innerHTML=renderLoans("given",false);
    else if(c.id==="installments") refs.content.innerHTML=renderInstallments(false);
    else if(c.id==="notes") refs.content.innerHTML=renderNotes();
    else if(c.id==="bitcoin") refs.content.innerHTML=renderBitcoin(false,false);
    else if(c.id==="messages") refs.content.innerHTML=renderMessages();
    else if(c.id==="reports") refs.content.innerHTML=renderReports(false,false);
    renderChrome(); bindManualSimulation();
  }

  function showToast(message, tone="success"){
    clearTimeout(toastTimer); refs.toast.textContent=message; refs.toast.dataset.tone=tone; refs.toast.classList.add("show");
    toastTimer=setTimeout(()=>refs.toast.classList.remove("show"), Math.max(500, 2300*QA_FACTOR));
  }

  function closeMenus(){ $$(".demo-menu-open", refs.content).forEach(x=>x.classList.remove("demo-menu-open")); }
  function openMenu(selector){ closeMenus(); const el=$(selector); if(el) el.classList.add("demo-menu-open"); return el; }
  function closeModal(){ refs.modal.classList.add("hide"); refs.modal.setAttribute("aria-hidden","true"); refs.modalPrimary.classList.remove("danger"); }
  function openModal({title,kicker="Entry",body,primary="Save",danger=false}){
    refs.modalKicker.textContent=kicker; refs.modalTitle.textContent=title; refs.modalBody.innerHTML=body; refs.modalPrimary.textContent=primary; refs.modalPrimary.classList.toggle("danger",danger); refs.modal.classList.remove("hide"); refs.modal.setAttribute("aria-hidden","false");
  }
  function confirmBody(icon,title,text){ return `<div class="demo-confirm-box"><i class="fa-solid ${icon}"></i><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`; }

  function logoPickerBody(selected="../Assets/logo/wallet_logos/triplem_default_wallet.png"){
    const logos=["triplem_default_wallet.png","Cash.png","Emirates NBD.png","ADCB.png","Rak Bank.png","UBL.png","HBL.png","Meezan Bank.png","Easypaisa.png","NayaPay.png","Bitcoin.png","Cryptocurrency.png"];
    return `<div><p class="help">Choose a predefined wallet logo. Custom uploads remain a separate production option.</p><div class="demo-logo-grid">${logos.map(file=>{const src=`../Assets/logo/wallet_logos/${file}`;return `<button type="button" class="demo-logo-choice ${src===selected?'active':''}" data-logo-choice="${esc(src)}"><img src="${esc(src)}" alt=""><span>${esc(file.replace('.png',''))}</span></button>`}).join("")}</div><div class="field w12" style="margin-top:10px"><span>Custom logo</span><button type="button" class="btn ghost" id="customLogoBtn"><i class="fa-solid fa-upload"></i> Upload image</button><p class="help">This demo never uploads a file. The control is shown to mirror production capability.</p></div></div>`;
  }

  function walletFormBody(w={name:"",type:"Bank Account",currency:"AED",opening:0,customLogo:false}){
    const types=["Bank Account","Cash Account","Travel Card","Prepaid Card","Credit Card","Debit Card","Cheque Account","Savings Account","Digital Wallet","Crypto Wallet","Other"];
    return `<form class="form-grid goods-sale-form-grid" id="walletDemoForm">${field("walletName","Account name",w.name)}${selectField("walletType","Account type",types,w.type)}${selectField("walletCurrency","Currency",["AED","SAR","PKR","USD","BTC"],w.currency)}${field("walletOpening","Available balance",w.opening||"","number","w6",'step="0.01" min="0"')}${field("walletDate","Account date",today(),"date")}${field("walletNotes","Notes",w.notes||"","text","w6",'placeholder="Optional note"')}<label class="field w12 admin-check-item expense-custom-logo-check"><span><input type="checkbox" id="walletUseCustomLogo" ${w.customLogo?'checked':''}> Use custom logo</span></label><div class="field w12 ${w.customLogo?'':'hide'}" id="walletCustomLogoField"><span>Custom logo <small>PNG / JPG</small></span><input class="input" id="walletCustomLogoFile" type="file" accept="image/png,image/jpeg,image/webp,image/*"><img class="expense-custom-logo-preview" src="${esc(w.logo||'assets/demo-custom-wallet.svg')}" alt="Custom wallet logo preview" style="width:58px;height:58px;object-fit:contain;margin-top:6px"></div></form>`;
  }

  function topupFormBody(w){ return `<form class="form-grid goods-sale-form-grid">${selectField("topupWallet","Account",state.wallets.map(x=>x.name),w.name)}${field("topupAmount","Amount to add","","number","w6",'step="0.01" min="0"')}${field("topupDate","Date",today(),"date")}${field("topupNote","Notes","Wallet top-up","text","w6",'placeholder="Optional note"')}</form>`; }

  function transferFormBody(w){ const other=state.wallets.find(x=>x.id!==w.id); return `<form class="form-grid">${selectField("transferFrom","From Wallet",state.wallets.map(x=>x.name),w.name)}${selectField("transferTo","To Wallet",state.wallets.filter(x=>x.id!==w.id).map(x=>x.name),other?.name||"")}${field("transferAmount","Amount","","number","w6",'step="0.01" min="0.01"')}${field("transferRate","Conversion Rate","1.000000","number","w6",'step="0.000001" min="0.000001"')}${field("transferReceived","Received Amount","","number","w6",'readonly placeholder="0.00"')}${field("transferDate","Date",today(),"date")}${field("transferNote","Notes","Internal wallet transfer","text","w12",'placeholder="Optional transfer note"')}</form>`; }

  function expenseFormBody(e={wallet:"w1",item:"",type:"",amount:"",date:today(),note:""}){ return `<form class="form-grid goods-sale-form-grid">${field("expenseItem","Item name",e.item,"text","w6",'placeholder="What did you buy/pay?"')}${field("expenseAmount","Amount spent",e.amount,"number","w6",'step="0.01" min="0"')}${selectField("expenseCurrency","Currency",["AED","SAR","PKR","USD","BTC"],"AED","w4")}${selectField("expenseWallet","From account",state.wallets.map(x=>x.name),walletById(e.wallet)?.name||state.wallets[0].name,"w8")}${selectField("expenseType","Expense type",["Select type","Food","Transport","Bills","Shopping","Health","Education","Other"],e.type||"Select type")}${field("expenseCustomType","Or new type","","text","w6",'placeholder="Custom type"')}<label class="field w4"><span class="checkbox-line"><input type="checkbox" id="expenseVatPaid"> VAT paid</span><small class="tax-preview">VAT is not applied.</small></label>${field("expenseVatRate","VAT %","0","number","w4",'min="0" max="100" step="0.01"')}${selectField("expenseVatMode","VAT mode",["Incl","Add"],"Incl","w4")}${field("expenseDate","Expense date",e.date||today(),"date")}${field("expenseNote","Notes",e.note||"","text","w6",'placeholder="Optional note"')}</form>`; }

  function productFormBody(p={sku:"",name:"",category:"Electronics",qty:"",cost:"",price:""}){ return `<form class="form-grid">${field("productName","Product name",p.name)}${field("productSku","SKU",p.sku)}${selectField("productCategory","Category",["Electronics","Office","Accessories","Other"],p.category)}${field("productQty","Opening stock",p.qty,"number")}${field("productCost","Unit cost",p.cost,"number")}${field("productPrice","Selling price",p.price,"number")}</form>`; }
  function assetFormBody(a={name:"",type:"Equipment",buy:""}){ return `<form class="form-grid">${field("assetName","Asset name",a.name)}${selectField("assetType","Asset type",["Equipment","Vehicle","Photography","Property","Other"],a.type)}${field("assetValue","Purchase value",a.buy,"number")}${field("assetDate","Purchase date","2026-08-20","date")}${textArea("assetNote","Notes","Tracked owned asset")}</form>`; }
  function depFormBody(d={name:"",category:"Vehicle",cost:"",salvage:"",life:5,method:"Straight Line"}){ return `<form class="form-grid">${field("depName","Asset name",d.name)}${selectField("depCategory","Category",["Vehicle","Equipment","Property","Technology"],d.category)}${field("depCost","Original cost",d.cost,"number")}${field("depSalvage","Salvage value",d.salvage,"number")}${field("depLife","Useful life (years)",d.life,"number")}${selectField("depMethod","Method",["Straight Line","Reducing Balance"],d.method)}</form>`; }
  function installmentFormBody(i={name:"",total:"",monthly:"",count:"",next:"2026-09-05"}){ return `<form class="form-grid">${field("planName","Plan name",i.name)}${field("planTotal","Total amount",i.total,"number")}${field("planMonthly","Installment amount",i.monthly,"number")}${field("planCount","Number of installments",i.count,"number")}${field("planNext","First / next due date",i.next,"date")}</form>`; }
  function noteFormBody(n={title:"",tag:"Finance",text:""}){ return `<form class="form-grid">${field("noteTitle","Title",n.title)}${selectField("noteTag","Tag",["Finance","Inventory","Personal","Reminder"],n.tag)}${textArea("noteText","Note",n.text)}</form>`; }

  async function ensureVisible(el, token){
    assertToken(token); if(!el) return;
    const modalBody=el.closest('#demoModal .modal-body');
    if(modalBody){
      const mr=modalBody.getBoundingClientRect(), r=el.getBoundingClientRect(), pad=18;
      if(r.top<mr.top+pad || r.bottom>mr.bottom-pad){
        modalBody.scrollTo({top:Math.max(0,modalBody.scrollTop+(r.top<mr.top+pad?r.top-(mr.top+pad)-24:r.bottom-(mr.bottom-pad)+24)),behavior:reducedMotion?'auto':'smooth'});
        await sleep(reducedMotion?120:420,token);
      }
      return;
    }
    if(!refs.viewport.contains(el)){
      const r=el.getBoundingClientRect();
      if(r.top<10 || r.bottom>innerHeight-10){ el.scrollIntoView({block:'center',inline:'nearest',behavior:reducedMotion?'auto':'smooth'}); await sleep(reducedMotion?120:420,token); }
      return;
    }
    const vr=refs.viewport.getBoundingClientRect(), r=el.getBoundingClientRect(), pad=24;
    if(r.top<vr.top+pad || r.bottom>vr.bottom-pad){
      const delta=r.top<vr.top+pad?r.top-(vr.top+pad)-36:r.bottom-(vr.bottom-pad)+36;
      refs.viewport.scrollTo({top:Math.max(0,refs.viewport.scrollTop+delta),behavior:reducedMotion?'auto':'smooth'});
      await sleep(reducedMotion?150:520,token);
    }
    const visibleRect=el.getBoundingClientRect(), pagePad=currentDevice==='mobile'?64:34;
    if(visibleRect.top<pagePad || visibleRect.bottom>innerHeight-pagePad){
      const pageDelta=visibleRect.top<pagePad?visibleRect.top-pagePad-18:visibleRect.bottom-(innerHeight-pagePad)+18;
      window.scrollBy({top:pageDelta,behavior:reducedMotion?'auto':'smooth'});
      await sleep(reducedMotion?140:460,token);
    }
  }
  function clearTarget(){ $$('.demo-target').forEach(x=>x.classList.remove('demo-target')); activeTarget=null; refs.pointerLabel.classList.remove('show'); }
  function pointFor(el){
    const r=el.getBoundingClientRect();
    const interactive=el.matches('button,input,select,textarea,label,a,summary,[role="button"]');
    const x=interactive?r.left+r.width*.5:r.left+Math.min(Math.max(r.width*.42,16),r.width-12);
    const y=interactive?r.top+r.height*.5:r.top+Math.min(Math.max(r.height*.42,14),r.height-10);
    return {x:clamp(x,8,innerWidth-8),y:clamp(y,8,innerHeight-8),rect:r};
  }
  function setCursorPoint(p,instant=false){
    refs.cursor.classList.toggle('instant',instant);
    refs.cursor.style.setProperty('--cursor-x',`${p.x}px`); refs.cursor.style.setProperty('--cursor-y',`${p.y}px`);
    requestAnimationFrame(()=>refs.cursor.classList.remove('instant'));
  }
  function placeLabel(p,title,text){
    if(currentDevice==='mobile'){ refs.pointerLabel.classList.remove('show'); return; }
    refs.pointerLabel.innerHTML=`<strong>${esc(title||'')}</strong><span>${esc(text||'')}</span>`;
    const lw=Math.min(320,innerWidth-20),approxH=72;let left=p.x+22,top=p.y+20;
    if(left+lw>innerWidth-8)left=Math.max(8,p.x-lw-18);if(top+approxH>innerHeight-8)top=Math.max(8,p.y-approxH-18);
    refs.pointerLabel.style.left=`${left}px`;refs.pointerLabel.style.top=`${top}px`;refs.pointerLabel.classList.add('show');
  }
  async function retarget(selector,token,instant=false){
    assertToken(token);const el=$(selector);if(!el)throw new Error(`Demo target disappeared: ${selector}`);await ensureVisible(el,token);assertToken(token);const fresh=$(selector);if(!fresh)throw new Error(`Demo target disappeared: ${selector}`);const p=pointFor(fresh);setCursorPoint(p,instant);return {el:fresh,p};
  }
  async function moveTo(selector, token, opts={}){
    assertToken(token);clearTarget();let el=$(selector);if(!el)throw new Error(`Demo target not found: ${selector}`);
    await ensureVisible(el,token);({el}=await retarget(selector,token));activeTarget=selector;refs.cursor.classList.add('visible');el.classList.add('demo-target');
    placeLabel(pointFor(el),opts.title||CHAPTERS[chapterIndex].steps[activeStep]?.[0]||'Action',opts.text||CHAPTERS[chapterIndex].steps[activeStep]?.[1]||'');
    await sleep(opts.duration||760,token);return el;
  }
  async function clickTarget(selector, token, opts={}){
    await moveTo(selector,token,opts);const {el,p}=await retarget(selector,token,true);setCursorPoint(p,true);await sleep(70,token);refs.cursor.classList.add('clicking');
    el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:p.x,clientY:p.y}));el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:p.x,clientY:p.y}));
    await sleep(150,token);refs.cursor.classList.remove('clicking');await sleep(190,token);return el;
  }
  function setControlValue(el,value){
    const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set; if(setter)setter.call(el,value);else el.value=value;
    el.dispatchEvent(new Event('input',{bubbles:true}));
  }
  async function typeText(selector,text,token,clear=true){
    const el=await clickTarget(selector,token,{duration:300});el.focus();const str=String(text);if(clear)setControlValue(el,'');
    let built=clear?'':String(el.value||'');
    for(let i=0;i<str.length;i++){assertToken(token);while(playback.paused)await sleep(80,token);built+=str[i];setControlValue(el,built);await sleep(46+(i%3)*8,token);}
    if(el.value!==built)setControlValue(el,built);el.dispatchEvent(new Event('change',{bubbles:true}));await sleep(230,token);
  }
  async function chooseSelect(selector,value,token){ const el=await clickTarget(selector,token,{duration:330}); el.value=value; el.dispatchEvent(new Event("change",{bubbles:true})); await sleep(420,token); }
  async function clickAndOpen(triggerSel, menuSel, token){ await clickTarget(triggerSel,token); openMenu(menuSel); await sleep(600,token); }
  async function pulsePause(ms,token){ clearTarget(); await sleep(ms,token); }

  function resetForChapter(){ state=deepClone(INITIAL_STATE); activeStep=-1; closeModal(); clearTarget(); closeMenus(); refs.cursor.classList.remove("visible","clicking"); refs.pointerLabel.classList.remove("show"); setProgress(0); }

  function cancelPlayback(){ playback.token++; playback.running=false; playback.paused=false; clearTarget(); refs.cursor.classList.remove("visible","clicking"); refs.pointerLabel.classList.remove("show"); closeModal(); syncPlayButton(); setCoachState("ready"); }
  function switchChapter(index,autoPlay=false){
    cancelPlayback(); chapterIndex=(Number(index)+CHAPTERS.length)%CHAPTERS.length; resetForChapter(); renderCurrent(); refs.coachTitle.textContent="Ready when you are"; refs.coachText.textContent="Press Play to follow the complete workflow at a calm tutorial pace."; renderChrome(); if(autoPlay) startPlayback();
  }

  function markComplete(){ completed.add(CHAPTERS[chapterIndex].id); activeStep=CHAPTERS[chapterIndex].steps.length; setProgress(100); setCoachState("complete"); refs.coachTitle.textContent="Chapter complete"; refs.coachText.textContent="The workflow finished using local fictional state only."; document.body.dataset.demoTestStatus="complete"; renderChrome(); bindManualSimulation(); }

  function formValue(id){ return $(`#${id}`,refs.modal)?.value||""; }

  async function runDashboard(token){
    updateStep(0); await clickTarget('[data-app-tab="dashboard"]',token); await pulsePause(900,token);
    updateStep(1); await moveTo('[data-dash-card="expenses"]',token); await pulsePause(1100,token);
    updateStep(2); await moveTo(currentDevice==='mobile'?'#dashboardMobileSwitcher':'[data-dash-card="inventory"]',token); await pulsePause(1000,token); if(currentDevice!=='mobile'){await moveTo('[data-dash-card="assets"]',token); await pulsePause(650,token);}
    updateStep(3); await moveTo('#dashActivityBlock',token); await pulsePause(1300,token);
    updateStep(4); await moveTo(currentDevice==='mobile'?'#dashboardMobileSwitcher':'#dashChartBlock',token); await pulsePause(1600,token);
  }

  async function runWallets(token){
    updateStep(0); await clickTarget('[data-app-tab="expenses"]',token); await moveTo('#walletsOverviewSection',token); await pulsePause(900,token);

    updateStep(1); await clickAndOpen('#expenseNewEntryBtn','#expenseEntryMenu',token); await clickTarget('[data-entry="account"]',token);
    openModal({title:'Add Expense Account',kicker:'Expenses · Wallets',body:walletFormBody(),primary:'Save Account'}); await sleep(500,token);
    await typeText('#walletName','NayaPay',token); await chooseSelect('#walletType','Digital Wallet',token); await chooseSelect('#walletCurrency','AED',token); await typeText('#walletOpening','12000',token); await typeText('#walletNotes','Travel reserve wallet',token); await clickTarget('#modalPrimaryBtn',token);
    state.wallets.push({id:'w3',name:'NayaPay',type:'Digital Wallet',currency:'AED',opening:12000,added:0,spent:0,balance:12000,logo:'../Assets/logo/wallet_logos/NayaPay.png',customLogo:false,notes:'Travel reserve wallet'}); closeModal(); refs.content.innerHTML=renderExpenses('wallets'); bindManualSimulation(); showToast('NayaPay account created'); await sleep(900,token); await moveTo('[data-wallet-card="w3"]',token); await pulsePause(750,token);

    updateStep(2); await clickAndOpen('[data-logo-btn="w3"]','[data-logo-menu="w3"]',token); await clickTarget('[data-logo-action="change"][data-wallet="w3"]',token);
    openModal({title:'Change Wallet Logo',kicker:'NayaPay · Wallet photo',body:`<div class="form-grid"><div class="field w12"><span>Custom logo <small>PNG / JPG</small></span><div class="card" style="padding:10px;display:flex;align-items:center;gap:10px"><img src="assets/demo-custom-wallet.svg" alt="Custom wallet logo preview" style="width:56px;height:56px;object-fit:contain"><div><strong>demo-custom-wallet.svg</strong><p class="help">Local fictional image selected for this walkthrough.</p></div></div></div></div>`,primary:'Use Logo'}); await sleep(650,token); await clickTarget('#modalPrimaryBtn',token); walletById('w3').logo='assets/demo-custom-wallet.svg';walletById('w3').customLogo=true;closeModal();refs.content.innerHTML=renderExpenses('wallets');bindManualSimulation();showToast('Custom wallet logo applied');await sleep(750,token);
    await clickAndOpen('[data-logo-btn="w3"]','[data-logo-menu="w3"]',token); await clickTarget('[data-logo-action="default"][data-wallet="w3"]',token); openModal({title:'Restore default logo?',kicker:'Wallet photo',body:confirmBody('fa-image','Restore the default logo?','The uploaded wallet logo will be removed and the predefined NayaPay logo will be applied.'),primary:'Restore Default'});await sleep(700,token);await clickTarget('#modalPrimaryBtn',token);walletById('w3').logo='../Assets/logo/wallet_logos/NayaPay.png';walletById('w3').customLogo=false;closeModal();refs.content.innerHTML=renderExpenses('wallets');bindManualSimulation();showToast('Predefined NayaPay logo restored');await sleep(850,token);

    updateStep(3); await clickTarget('[data-wallet-action="edit"][data-wallet="w3"]',token); openModal({title:'Edit Expense Account',kicker:'Wallet details',body:walletFormBody(walletById('w3')),primary:'Save Changes'}); await sleep(450,token); await typeText('#walletName','Travel Reserve',token); await clickTarget('#modalPrimaryBtn',token); walletById('w3').name='Travel Reserve'; walletById('w3').logo='../Assets/logo/wallet_logos/triplem_default_wallet.png'; closeModal(); refs.content.innerHTML=renderExpenses('wallets'); bindManualSimulation(); showToast('Wallet renamed'); await sleep(850,token);

    updateStep(4); await clickTarget('[data-wallet-action="topup"][data-wallet="w3"]',token); openModal({title:'Add Money',kicker:'Travel Reserve',body:topupFormBody(walletById('w3')),primary:'Add Money'}); await sleep(420,token); await typeText('#topupAmount','2500',token); await typeText('#topupNote','Travel reserve top-up',token); await clickTarget('#modalPrimaryBtn',token); walletById('w3').added+=2500; walletById('w3').balance+=2500; closeModal(); refs.content.innerHTML=renderExpenses('wallets'); bindManualSimulation(); showToast('2,500.00 AED added'); await sleep(900,token);

    updateStep(5); await clickTarget('[data-wallet-details="w3"]',token); openModal({title:'Travel Reserve',kicker:'Wallet Details',body:walletDetailsBody(walletById('w3')),primary:'Close'}); await sleep(700,token); await clickTarget('[data-detail-action="transfer"]',token); openModal({title:'Transfer Money',kicker:'Move money from Travel Reserve to another wallet.',body:transferFormBody(walletById('w3')),primary:'Transfer Money'}); await sleep(450,token); await chooseSelect('#transferTo','Daily Cash',token); await typeText('#transferAmount','1000',token); $('#transferReceived').value='1000.00'; await moveTo('#transferReceived',token); await clickTarget('#modalPrimaryBtn',token); walletById('w3').balance-=1000; walletById('w1').balance+=1000; closeModal(); refs.content.innerHTML=renderExpenses('wallets'); bindManualSimulation(); showToast('Transfer completed: Travel Reserve to Daily Cash'); await sleep(1000,token);

    updateStep(6); await clickTarget('[data-wallet-details="w3"]',token); openModal({title:'Travel Reserve',kicker:'Wallet Details',body:walletDetailsBody(walletById('w3')),primary:'Close'}); await moveTo('[data-wallet-detail-modal="w3"]',token); await pulsePause(1050,token); await moveTo('[data-detail-action="pdf"]',token); await pulsePause(650,token); await clickTarget('#modalPrimaryBtn',token);closeModal();

    updateStep(7); await clickTarget('[data-wallet-action="delete"][data-wallet="w3"]',token); openModal({title:'Delete Wallet',kicker:'Confirmation',body:confirmBody('fa-triangle-exclamation','Delete Travel Reserve?','This local demo action removes the fictional wallet after confirmation. Production deletion remains protected by its own validation.'),primary:'Delete Wallet',danger:true}); await sleep(950,token); await clickTarget('#modalPrimaryBtn',token); closeModal(); state.wallets=state.wallets.filter(w=>w.id!=='w3'); refs.content.innerHTML=renderExpenses('wallets'); bindManualSimulation(); showToast('Fictional wallet deleted'); await sleep(1200,token);
  }

  async function runExpenses(token){
    updateStep(0); await clickAndOpen('#expenseNewEntryBtn','#expenseEntryMenu',token); await clickTarget('[data-entry="expense"]',token); openModal({title:'Add Expense',kicker:'Expenses · New Entry',body:expenseFormBody(),primary:'Save Expense'}); await sleep(500,token);
    updateStep(1); await chooseSelect('#expenseWallet','Daily Cash',token); await chooseSelect('#expenseType','Transport',token);
    updateStep(2); await typeText('#expenseItem','Parking',token); await typeText('#expenseAmount','35',token); await typeText('#expenseNote','Client meeting parking',token); await pulsePause(700,token);
    updateStep(3); await clickTarget('#modalPrimaryBtn',token); state.expenses.unshift({id:'e5',wallet:'w1',item:'Parking',type:'Transport',amount:35,date:today(),note:'Client meeting parking'}); walletById('w1').spent+=35; walletById('w1').balance-=35; closeModal(); refs.content.innerHTML=renderExpenses('expenses'); bindManualSimulation(); showToast('Expense saved and wallet balance updated'); await sleep(1000,token); await moveTo('[data-expense-group="Parking"]',token); await pulsePause(900,token);
    updateStep(4); const group=$('[data-expense-group="Parking"]'); if(group) group.open=true; await clickTarget('[data-tx-edit="e5"]',token); openModal({title:'Edit Expense',kicker:'Transaction',body:expenseFormBody(state.expenses.find(e=>e.id==='e5')),primary:'Save Changes'}); await sleep(450,token); await typeText('#expenseAmount','42',token); await typeText('#expenseNote','Client meeting parking and toll',token); await clickTarget('#modalPrimaryBtn',token); const e=state.expenses.find(x=>x.id==='e5'); walletById('w1').balance-=7; walletById('w1').spent+=7; e.amount=42;e.note='Client meeting parking and toll'; closeModal(); refs.content.innerHTML=renderExpenses('expenses'); bindManualSimulation(); showToast('Expense updated'); await sleep(900,token);
    updateStep(5); const g2=$('[data-expense-group="Parking"]'); if(g2) g2.open=true; await clickTarget('[data-tx-delete="e5"]',token); openModal({title:'Delete Expense',kicker:'Confirmation',body:confirmBody('fa-trash','Delete this transaction?','The demo restores the linked wallet balance when this fictional expense is removed.'),primary:'Delete',danger:true}); await sleep(850,token); await clickTarget('#modalPrimaryBtn',token); closeModal(); walletById('w1').balance+=42;walletById('w1').spent-=42;state.expenses=state.expenses.filter(x=>x.id!=='e5');refs.content.innerHTML=renderExpenses('expenses');bindManualSimulation();showToast('Expense deleted and balance restored');await sleep(1200,token);
  }

  async function runTransactions(token){
    updateStep(0); const history=$('#transactionsHistorySection'); if(history) history.open=false; await clickTarget('#transactionsHistorySection > summary',token); if(history) history.open=true; await sleep(700,token);
    updateStep(1); await clickTarget('[data-expense-history-range="last7"]',token); $$('#transactionRanges button').forEach(b=>b.classList.toggle('active',b.dataset.expenseHistoryRange==='last7')); await pulsePause(900,token);
    updateStep(2); await typeText('#searchExpenses','Fuel',token); await chooseSelect('#expenseBalanceFilter','Active Balance',token); await chooseSelect('#expenseCurrencyFilter','AED',token); await pulsePause(750,token); const search=$('#searchExpenses'); if(search) setControlValue(search,''); $('#expenseBalanceFilter').value='All'; $('#expenseCurrencyFilter').value='All';
    updateStep(3); const fuel=$('[data-expense-group="Fuel"]'); if(fuel) fuel.open=false; await clickTarget('[data-expense-group="Fuel"] > summary',token); if(fuel) fuel.open=true; await sleep(800,token);
    updateStep(4); await moveTo('[data-transaction-row="e1"]',token); await clickTarget('[data-tx-edit="e1"]',token); openModal({title:'Edit Expense',kicker:'Transaction row',body:expenseFormBody(state.expenses.find(e=>e.id==='e1')),primary:'Save Changes'}); await sleep(650,token); await clickTarget('#modalCloseBtn',token); closeModal();
    updateStep(5); await clickAndOpen('#transactionPdfBtn','#transactionPdfMenu',token); await moveTo('[data-pdf="detailed"]',token); await pulsePause(600,token); await moveTo('[data-pdf="summary"]',token); await pulsePause(900,token); closeMenus();
  }

  async function runInventory(token){
    updateStep(0); await clickTarget('[data-app-tab="goods"]',token); await moveTo('#inventoryWorkspace',token); await pulsePause(800,token);
    updateStep(1); await clickAndOpen('#inventoryActionsBtn','#inventoryActionsMenu',token); await clickTarget('[data-inv-action="add"]',token); openModal({title:'Add Inventory Item',kicker:'Inventory',body:productFormBody(),primary:'Save Item'}); await typeText('#productName','Portable SSD 1TB',token); await typeText('#productSku','TVP-404',token); await chooseSelect('#productCategory','Electronics',token); await typeText('#productQty','8',token); await typeText('#productCost','210',token); await typeText('#productPrice','279',token); await clickTarget('#modalPrimaryBtn',token); state.inventory.push({id:'p4',sku:'TVP-404',name:'Portable SSD 1TB',category:'Electronics',qty:8,cost:210,price:279,currency:'AED'}); closeModal(); refs.content.innerHTML=renderInventory();bindManualSimulation();showToast('Inventory item created');await sleep(900,token);
    updateStep(2); await moveTo('[data-product="p4"]',token); await pulsePause(1100,token);
    updateStep(3); await clickTarget('[data-product-edit="p4"]',token); openModal({title:'Edit Inventory Item',kicker:'Product details',body:productFormBody(state.inventory.find(p=>p.id==='p4')),primary:'Save Changes'}); await typeText('#productPrice','289',token); await typeText('#productQty','12',token); await clickTarget('#modalPrimaryBtn',token); const p=state.inventory.find(x=>x.id==='p4');p.price=289;p.qty=12;closeModal();refs.content.innerHTML=renderInventory();bindManualSimulation();showToast('Stock and selling price updated');await sleep(850,token);
    updateStep(4); await clickAndOpen('#inventoryActionsBtn','#inventoryActionsMenu',token); for(const sel of ['[data-inv-action="sale"]','[data-inv-action="scanner"]','[data-inv-action="pdf"]']){await moveTo(sel,token);await sleep(520,token);} await pulsePause(800,token);closeMenus();
  }

  async function runSale(token){
    updateStep(0); await clickAndOpen('#inventoryActionsBtn','#inventoryActionsMenu',token); await clickTarget('[data-inv-action="sale"]',token); openModal({title:'Create Sale',kicker:'Inventory · Sales',body:`<form class="form-grid">${selectField('saleCustomer','Customer',state.customers.map(c=>c.name),'Horizon Trading')}${selectField('saleProduct','Product',state.inventory.map(p=>p.name),'USB-C Hub')}${field('saleQty','Quantity','2','number')}${selectField('salePayment','Payment wallet',state.wallets.map(w=>w.name),'Emirates NBD')}${selectField('saleStatus','Payment status',['Paid','Partially paid','Unpaid'],'Paid')}<div class="field w12"><span>Cart total</span><strong id="saleTotal">238.00 AED</strong></div></form>`,primary:'Complete Sale'});await sleep(600,token);
    updateStep(1); await chooseSelect('#saleCustomer','Horizon Trading',token);
    updateStep(2); await chooseSelect('#saleProduct','USB-C Hub',token); await typeText('#saleQty','2',token); await moveTo('#saleTotal',token);await pulsePause(650,token);
    updateStep(3); await chooseSelect('#salePayment','Emirates NBD',token); await chooseSelect('#saleStatus','Paid',token);
    updateStep(4); await clickTarget('#modalPrimaryBtn',token); const p=state.inventory.find(x=>x.id==='p2');p.qty-=2;walletById('w2').balance+=238;closeModal();refs.content.innerHTML=renderInventory();bindManualSimulation();showToast('Sale completed: 238.00 AED');await sleep(850,token);await moveTo('[data-product="p2"]',token);await pulsePause(1200,token);
  }

  async function runCustomers(token){
    updateStep(0); await clickTarget('[data-app-tab="goods"]',token); await moveTo('#customerWorkspace',token);await pulsePause(800,token);
    updateStep(1); await moveTo('[data-customer="c1"]',token);await pulsePause(900,token);
    updateStep(2); await clickTarget('[data-customer-view="c1"]',token); $('#customerActivity').innerHTML=`<div class="card" id="customerLedger" style="margin-top:10px;padding:12px"><div class="section-head"><div><h3>Horizon Trading · Account Activity</h3><p class="help">Recent invoices and customer payments</p></div></div><div class="demo-table-scroll"><table><thead><tr><th>Date</th><th>Reference</th><th>Type</th><th>Amount</th></tr></thead><tbody><tr><td>2026-08-24</td><td>INV-1042</td><td>Invoice</td><td>1,180.00 AED</td></tr><tr><td>2026-08-26</td><td>PAY-331</td><td>Payment</td><td>540.00 AED</td></tr></tbody></table></div></div>`; await moveTo('#customerLedger',token);await pulsePause(1100,token);
    updateStep(3); await clickTarget('[data-customer-pay="c1"]',token);openModal({title:'Record Customer Payment',kicker:'Customer account',body:`<form class="form-grid">${field('customerPayAmount','Amount','640','number')}${selectField('customerPayWallet','Received into',state.wallets.map(w=>w.name),'Emirates NBD')}${field('customerPayDate','Date',today(),'date')}${textArea('customerPayNote','Note','Outstanding invoice payment')}</form>`,primary:'Record Payment'});await sleep(500,token);await typeText('#customerPayAmount','640',token);await clickTarget('#modalPrimaryBtn',token);state.customers.find(c=>c.id==='c1').due=0;walletById('w2').balance+=640;closeModal();refs.content.innerHTML=renderCustomers();bindManualSimulation();showToast('Customer balance settled');await sleep(900,token);
    updateStep(4); await moveTo('[data-customer="c1"]',token);await pulsePause(1300,token);
  }

  async function runAssets(token){
    updateStep(0); await clickTarget('[data-app-tab="assets"]',token);await moveTo('#assetsSubTabs',token);await pulsePause(750,token);
    updateStep(1); await clickTarget('#addAssetBtn',token);openModal({title:'Add Asset',kicker:'Owned Assets',body:assetFormBody(),primary:'Save Asset'});await typeText('#assetName','Studio Camera',token);await chooseSelect('#assetType','Photography',token);await typeText('#assetValue','6300',token);await clickTarget('#modalPrimaryBtn',token);state.assets.push({id:'a3',name:'Studio Camera',type:'Photography',buy:6300,spent:0,revenue:0,sale:0,status:'Owned',currency:'AED'});closeModal();refs.content.innerHTML=renderAssets(false);bindManualSimulation();showToast('Asset added');await sleep(850,token);
    updateStep(2);await moveTo('[data-asset="a3"]',token);await pulsePause(1000,token);
    updateStep(3);await clickAndOpen('[data-asset-menu="a3"]','[data-asset-dropdown="a3"]',token);await clickTarget('[data-asset-dropdown="a3"] [data-asset-action="tx"]',token);openModal({title:'Add Asset Transaction',kicker:'Studio Camera',body:`<form class="form-grid">${selectField('assetTxType','Transaction type',['Expense','Revenue'],'Revenue')}${field('assetTxAmount','Amount','750','number')}${field('assetTxDate','Date',today(),'date')}${textArea('assetTxNote','Note','Photography booking revenue')}</form>`,primary:'Save Transaction'});await sleep(500,token);await clickTarget('#modalPrimaryBtn',token);state.assets.find(a=>a.id==='a3').revenue+=750;closeModal();refs.content.innerHTML=renderAssets(false);bindManualSimulation();showToast('Asset revenue recorded');await sleep(900,token);
    updateStep(4);await clickAndOpen('[data-asset-menu="a3"]','[data-asset-dropdown="a3"]',token);for(const sel of ['[data-asset-action="edit"]','[data-asset-action="sell"]','[data-asset-action="pdf"]','[data-asset-action="delete"]']){await moveTo(`[data-asset-dropdown="a3"] ${sel}`,token);await sleep(480,token);}closeMenus();
    updateStep(5);await moveTo('[data-asset="a3"]',token);await pulsePause(1300,token);
  }

  async function runDepreciation(token){
    updateStep(0);await clickTarget('[data-assets-sub="depreciation"]',token);await moveTo('[data-dep="d1"]',token);await pulsePause(800,token);
    updateStep(1);await clickAndOpen('#depActionsBtn','#depActionsMenu',token);await clickTarget('[data-dep-action="add"]',token);openModal({title:'Add Depreciating Asset',kicker:'Depreciation',body:depFormBody(),primary:'Create Asset'});await typeText('#depName','Office Printer',token);await chooseSelect('#depCategory','Equipment',token);await typeText('#depCost','4200',token);await typeText('#depSalvage','400',token);await typeText('#depLife','4',token);await chooseSelect('#depMethod','Straight Line',token);await clickTarget('#modalPrimaryBtn',token);closeModal();showToast('Depreciation schedule calculated locally');await sleep(800,token);
    updateStep(2);await moveTo('[data-dep="d1"]',token);await pulsePause(1100,token);
    updateStep(3);await clickTarget('#depScheduleBtn',token);refs.content.innerHTML=renderDepreciation(true);bindManualSimulation();await moveTo('#depSchedule',token);await pulsePause(1500,token);
    updateStep(4);await clickTarget('#depReportBtn',token);showToast('Depreciation report preview ready');await pulsePause(1200,token);
  }

  async function runLoans(token){
    updateStep(0);await clickTarget('[data-loan-mode="given"]',token);await moveTo('[data-loan="lg1"]',token);await pulsePause(900,token);
    updateStep(1);await clickTarget('[data-loan-payment="lg1"]',token);openModal({title:'Received Back',kicker:'Loan Given · Adeel',body:`<form class="form-grid">${field('loanPayment','Amount','700','number')}${field('loanPayDate','Date',today(),'date')}${textArea('loanPayNote','Note','Partial repayment received')}</form>`,primary:'Save Repayment'});await sleep(450,token);await clickTarget('#modalPrimaryBtn',token);state.loans.given[0].paid+=700;closeModal();refs.content.innerHTML=renderLoans('given');bindManualSimulation();showToast('Repayment recorded');await sleep(850,token);await moveTo('[data-loan="lg1"]',token);
    updateStep(2);await clickTarget('[data-loan-mode="taken"]',token);refs.content.innerHTML=renderLoans('taken');bindManualSimulation();await sleep(750,token);
    updateStep(3);await moveTo('[data-loan="lt1"]',token);await pulsePause(950,token);
    updateStep(4);await clickTarget('[data-loan-timeline="lt1"]',token);refs.content.innerHTML=renderLoans('taken',true);bindManualSimulation();await moveTo('#loanTimeline',token);await pulsePause(1350,token);
    updateStep(5);await clickAndOpen('[data-loan-menu="lt1"]','[data-loan-dropdown="lt1"]',token);for(const sel of ['[data-loan-act="pdf"]','[data-loan-act="edit"]','[data-loan-act="installment"]','[data-loan-act="delete"]']){await moveTo(`[data-loan-dropdown="lt1"] ${sel}`,token);await sleep(500,token);}closeMenus();await pulsePause(750,token);
  }

  async function runInstallments(token){
    updateStep(0);await clickTarget('[data-app-tab="installments"]',token);await moveTo('[data-plan="i1"]',token);await pulsePause(850,token);
    updateStep(1);await clickTarget('#addInstallmentBtn',token);openModal({title:'New Installment Plan',kicker:'Installments',body:installmentFormBody(),primary:'Create Plan'});await typeText('#planName','Office Furniture',token);await typeText('#planTotal','3600',token);await typeText('#planMonthly','600',token);await typeText('#planCount','6',token);await clickTarget('#modalPrimaryBtn',token);closeModal();showToast('Installment plan created in demo state');await sleep(800,token);
    updateStep(2);await clickTarget('[data-plan-schedule="i1"]',token);refs.content.innerHTML=renderInstallments(true);bindManualSimulation();await moveTo('#installmentSchedule',token);await pulsePause(1400,token);
    updateStep(3);await clickTarget('.loan-actions [data-plan-pay="i1"]',token);openModal({title:'Pay Installment',kicker:'Laptop Purchase',body:`<form class="form-grid">${field('installmentAmount','Amount','800','number')}${selectField('installmentWallet','Pay from',state.wallets.map(w=>w.name),'Emirates NBD')}${field('installmentDate','Date',today(),'date')}${textArea('installmentNote','Note','Scheduled installment payment')}</form>`,primary:'Mark Paid'});await sleep(500,token);await clickTarget('#modalPrimaryBtn',token);state.installments[0].paidCount=Math.min(state.installments[0].count,state.installments[0].paidCount+1);walletById('w2').balance-=800;closeModal();refs.content.innerHTML=renderInstallments(false);bindManualSimulation();showToast('Installment marked paid');await sleep(900,token);
    updateStep(4);await clickAndOpen('#installmentMenuBtn','#installmentMenu',token);for(const text of ['View charts','View schedule','Edit plan / schedule','Reminder','Download statement']){const el=$$('#installmentMenu button').find(b=>b.textContent.includes(text));if(el){await moveTo(`#installmentMenu button:nth-child(${$$('#installmentMenu button').indexOf(el)+1})`,token);await sleep(430,token);}}closeMenus();
    updateStep(5);await moveTo('[data-plan="i1"]',token);await pulsePause(1400,token);
  }

  async function runNotes(token){
    updateStep(0);await clickTarget('[data-app-tab="notes"]',token);await moveTo('#noteGrid',token);await pulsePause(750,token);
    updateStep(1);await clickTarget('#addNoteBtn',token);openModal({title:'New Note',kicker:'Notes',body:noteFormBody(),primary:'Save Note'});await typeText('#noteTitle','Quarterly review',token);await chooseSelect('#noteTag','Finance',token);await typeText('#noteText','Reconcile wallet balances and archive the quarterly reports.',token);await clickTarget('#modalPrimaryBtn',token);state.notes.unshift({id:'n3',title:'Quarterly review',tag:'Finance',text:'Reconcile wallet balances and archive the quarterly reports.',updated:'Just now'});closeModal();refs.content.innerHTML=renderNotes();bindManualSimulation();showToast('Note created');await sleep(800,token);
    updateStep(2);await moveTo('[data-note="n3"]',token);await pulsePause(950,token);
    updateStep(3);await clickAndOpen('[data-note-menu="n3"]','[data-note-dropdown="n3"]',token);await clickTarget('[data-note-edit="n3"]',token);openModal({title:'Edit Note',kicker:'Notes',body:noteFormBody(state.notes.find(n=>n.id==='n3')),primary:'Save Changes'});await typeText('#noteText','Reconcile wallet balances, verify statements and archive the quarterly reports.',token);await clickTarget('#modalPrimaryBtn',token);state.notes.find(n=>n.id==='n3').text='Reconcile wallet balances, verify statements and archive the quarterly reports.';closeModal();refs.content.innerHTML=renderNotes();bindManualSimulation();showToast('Note updated');await sleep(800,token);
    updateStep(4);await clickAndOpen('[data-note-menu="n3"]','[data-note-dropdown="n3"]',token);await clickTarget('[data-note-delete="n3"]',token);openModal({title:'Delete Note',kicker:'Confirmation',body:confirmBody('fa-trash','Delete Quarterly review?','This removes only the fictional note from the local walkthrough.'),primary:'Delete',danger:true});await sleep(750,token);await clickTarget('#modalPrimaryBtn',token);closeModal();state.notes=state.notes.filter(n=>n.id!=='n3');refs.content.innerHTML=renderNotes();bindManualSimulation();showToast('Note deleted');await sleep(1050,token);
  }

  async function runBitcoin(token){
    updateStep(0);await clickTarget('[data-app-tab="bitcoin"]',token);await moveTo('#bitcoinModes',token);await pulsePause(800,token);for(const mode of ['wif','seed','brain','bulk','hex']){await moveTo(`[data-btc-mode="${mode}"]`,token);await sleep(260,token);}
    updateStep(1);await clickTarget('[data-btc-mode="watch"]',token);state.bitcoin.mode='watch';refs.content.innerHTML=renderBitcoin(false,false);bindManualSimulation();await sleep(650,token);
    updateStep(2);await typeText('#btcAddress',state.bitcoin.address,token);await clickTarget('#loadBitcoinBtn',token);refs.content.innerHTML=renderBitcoin(true,false);bindManualSimulation();showToast('Fictional watch-only address loaded');await moveTo('#bitcoinWalletCard',token);await pulsePause(1100,token);
    updateStep(3);await clickTarget('#btcReceiveBtn',token);refs.content.innerHTML=renderBitcoin(true,true);bindManualSimulation();await moveTo('#btcReceivePanel',token);await pulsePause(1250,token);
    updateStep(4);for(const sel of ['#btcSendBtn','#btcReceiveBtn','#btcPdfBtn','#btcRefreshBtn','#btcClearBtn']){await moveTo(sel,token);await sleep(440,token);}
    updateStep(5);await clickTarget('#btcClearBtn',token);openModal({title:'Clear Bitcoin Session',kicker:'Bitcoin',body:confirmBody('fa-shield-halved','Clear local wallet view?','This clears only the fictional watch-only address from the browser demo.'),primary:'Clear',danger:true});await sleep(700,token);await clickTarget('#modalPrimaryBtn',token);closeModal();refs.content.innerHTML=renderBitcoin(false,false);bindManualSimulation();showToast('Local Bitcoin demo session cleared');await sleep(1050,token);
  }

  async function runMessages(token){
    updateStep(0);await clickTarget('[data-app-tab="messages"]',token);await moveTo('#messagesWorkspace',token);await pulsePause(700,token);
    updateStep(1);await clickTarget('[data-thread="support"]',token);await moveTo('#chatBody',token);await pulsePause(800,token);
    updateStep(2);await typeText('#messageReply','Please show me where the detailed expense PDF is available.',token);
    updateStep(3);await clickTarget('#sendMessageBtn',token);state.messages.push({from:'You',mine:true,text:'Please show me where the detailed expense PDF is available.'});refs.content.innerHTML=renderMessages();bindManualSimulation();await moveTo('#chatBody',token);showToast('Message sent locally');await pulsePause(850,token);
    updateStep(4);state.messages.push({from:'Support',mine:false,text:'Open Expenses, expand Transactions History, then use the download menu and choose Detailed PDF.'});refs.content.innerHTML=renderMessages();bindManualSimulation();await moveTo('#chatBody .demo-bubble:last-child',token);await pulsePause(1450,token);
  }

  async function runReports(token){
    updateStep(0);await moveTo('#demoAccountBtn',token,{title:'Account menu',text:'Production reporting and portable data exports are surfaced from the account controls.'});refs.accountBtn.classList.add('demo-target');await pulsePause(650,token);refs.content.innerHTML=renderReports(true,false);bindManualSimulation();await moveTo('#reportAccountProxy',token);await pulsePause(700,token);
    updateStep(1);await clickTarget('#fullReportAction',token);refs.content.innerHTML=renderReports(true,true);bindManualSimulation();showToast('Full report preview prepared with fictional data');await sleep(700,token);
    updateStep(2);await moveTo('#reportPreview',token);await pulsePause(1250,token);
    updateStep(3);for(const block of ['#reportsWorkspace .overview-grid .metric:nth-child(1)','#reportsWorkspace .overview-grid .metric:nth-child(2)','#reportsWorkspace .overview-grid .metric:nth-child(3)','#reportsWorkspace .overview-grid .metric:nth-child(4)']){await moveTo(block,token);await sleep(430,token);}
    updateStep(4);await moveTo('#reportAccountMenu',token);await pulsePause(1200,token);closeMenus();
  }

  const RUNNERS={dashboard:runDashboard,wallets:runWallets,expenses:runExpenses,transactions:runTransactions,inventory:runInventory,sale:runSale,customers:runCustomers,assets:runAssets,depreciation:runDepreciation,loans:runLoans,installments:runInstallments,notes:runNotes,bitcoin:runBitcoin,messages:runMessages,reports:runReports};

  async function startPlayback(){
    if(playback.running){ playback.paused=!playback.paused; setCoachState(playback.paused?'paused':'running'); syncPlayButton(); return; }
    if(playback.paused){ playback.paused=false; playback.running=true; setCoachState('running');syncPlayButton();return; }
    resetForChapter();renderCurrent();document.body.dataset.demoTestStatus='running';playback.running=true;playback.paused=false;playback.speed=Number(refs.speed.value)||1;const token=++playback.token;playback.start=performance.now();setCoachState('running');syncPlayButton();
    try{
      await RUNNERS[CHAPTERS[chapterIndex].id](token);assertToken(token);
      const minMs=CHAPTERS[chapterIndex].minDuration||35000;const elapsed=performance.now()-playback.start;const targetMin=minMs*QA_FACTOR/playback.speed;if(elapsed<targetMin) await sleep((targetMin-elapsed)*playback.speed/QA_FACTOR,token);
      assertToken(token);playback.running=false;playback.paused=false;clearTarget();refs.cursor.classList.remove('visible');refs.pointerLabel.classList.remove('show');markComplete();syncPlayButton();
    }catch(err){
      if(!(err instanceof Cancelled)){ console.error(err); playback.running=false;playback.paused=false;setCoachState('ready');syncPlayButton();document.body.dataset.demoTestStatus='error';document.body.dataset.demoTestError=err?.message||String(err);showToast('Demo recovered from an unexpected step. Restart the chapter to replay it.','error'); }
    }
  }

  function bindOnce(el,type,handler,key=type){
    if(!el) return; const mark=`bound${key.replace(/[^a-z0-9]/gi,'')}`; if(el.dataset[mark]) return; el.dataset[mark]='1'; el.addEventListener(type,handler);
  }

  function bindManualSimulation(){
    $$('.module-tab',refs.moduleTabs).forEach(btn=>bindOnce(btn,'click',()=>switchChapter(Number(btn.dataset.chapterIndex)),'chapter'));
    $$('.tab',refs.tabs).forEach(btn=>bindOnce(btn,'click',()=>{const id=btn.dataset.appTab;const idx=CHAPTERS.findIndex(c=>c.appTab===id);if(idx>=0)switchChapter(idx);},'apptab'));
    bindOnce($('#expenseNewEntryBtn'),'click',()=>$('#expenseEntryMenu')?.classList.toggle('demo-menu-open'),'menu');
    bindOnce($('#inventoryActionsBtn'),'click',()=>$('#inventoryActionsMenu')?.classList.toggle('demo-menu-open'),'menu');
    bindOnce($('#depActionsBtn'),'click',()=>$('#depActionsMenu')?.classList.toggle('demo-menu-open'),'menu');
    bindOnce($('#transactionPdfBtn'),'click',()=>$('#transactionPdfMenu')?.classList.toggle('demo-menu-open'),'menu');
    bindOnce($('#installmentMenuBtn'),'click',()=>$('#installmentMenu')?.classList.toggle('demo-menu-open'),'menu');
    $$('[data-asset-menu]').forEach(btn=>bindOnce(btn,'click',()=> $(`[data-asset-dropdown="${btn.dataset.assetMenu}"]`)?.classList.toggle('demo-menu-open'),'assetmenu'));
    $$('[data-loan-menu]').forEach(btn=>bindOnce(btn,'click',()=> $(`[data-loan-dropdown="${btn.dataset.loanMenu}"]`)?.classList.toggle('demo-menu-open'),'loanmenu'));
    $$('[data-note-menu]').forEach(btn=>bindOnce(btn,'click',()=> $(`[data-note-dropdown="${btn.dataset.noteMenu}"]`)?.classList.toggle('demo-menu-open'),'notemenu'));
    $$('[data-assets-sub]').forEach(btn=>bindOnce(btn,'click',()=>{if(playback.running)return;refs.content.innerHTML=btn.dataset.assetsSub==='depreciation'?renderDepreciation(false):renderAssets(false);bindManualSimulation();},'assetssub'));
    $$('[data-loan-mode]').forEach(btn=>bindOnce(btn,'click',()=>{if(playback.running)return;refs.content.innerHTML=renderLoans(btn.dataset.loanMode,false);bindManualSimulation();},'loanmode'));
    $$('[data-btc-mode]').forEach(btn=>bindOnce(btn,'click',()=>{if(playback.running)return;state.bitcoin.mode=btn.dataset.btcMode;refs.content.innerHTML=renderBitcoin(false,false);bindManualSimulation();},'btcmode'));
    bindOnce($('#loadBitcoinBtn'),'click',()=>{if(playback.running)return;state.bitcoin.address=$('#btcAddress')?.value||state.bitcoin.address;refs.content.innerHTML=renderBitcoin(true,false);bindManualSimulation();},'btcload');
    bindOnce($('#btcReceiveBtn'),'click',()=>{if(playback.running)return;refs.content.innerHTML=renderBitcoin(true,true);bindManualSimulation();},'btcreceive');
    bindOnce($('#btcClearBtn'),'click',()=>{if(playback.running)return;refs.content.innerHTML=renderBitcoin(false,false);bindManualSimulation();},'btcclear');
    bindOnce($('#sendMessageBtn'),'click',()=>{if(playback.running)return;const input=$('#messageReply');const text=input?.value.trim();if(!text)return;state.messages.push({from:'You',mine:true,text});refs.content.innerHTML=renderMessages();bindManualSimulation();},'sendmessage');
  }

  refs.moduleSelect.addEventListener('change',e=>switchChapter(Number(e.target.value)));
  refs.prev.addEventListener('click',()=>switchChapter(chapterIndex-1));
  refs.next.addEventListener('click',()=>switchChapter(chapterIndex+1));
  refs.restart.addEventListener('click',()=>switchChapter(chapterIndex,true));
  refs.play.addEventListener('click',startPlayback);
  refs.speed.addEventListener('change',()=>{playback.speed=Number(refs.speed.value)||1;});
  refs.themeSelect.addEventListener('change',()=>{const theme=refs.themeSelect.value;document.documentElement.dataset.demoTheme=theme;document.documentElement.dataset.triplemTheme=theme;});
  refs.modalClose.addEventListener('click',closeModal);
  $$('[data-demo-close]',refs.modal).forEach(el=>el.addEventListener('click',closeModal));
  refs.accountBtn.addEventListener('click',()=>{const idx=CHAPTERS.findIndex(c=>c.id==='reports');if(idx>=0)switchChapter(idx);});

  window.addEventListener('keydown',e=>{
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
    if(e.code==='Space'){e.preventDefault();startPlayback();}
    if(e.key==='ArrowLeft')switchChapter(chapterIndex-1);
    if(e.key==='ArrowRight')switchChapter(chapterIndex+1);
  });

  let resizeTimer=0;
  window.addEventListener('resize',()=>{
    clearTimeout(resizeTimer); resizeTimer=setTimeout(()=>{const before=currentDevice;syncDevice();if(!playback.running&&before!==currentDevice)renderCurrent({preserveScroll:true});else if(playback.running&&activeTarget){const el=$(activeTarget);if(el){const p=pointFor(el);setCursorPoint(p,true);}}},120);
  });

  document.addEventListener('click',e=>{
    if(!e.target.closest('.menu-wrap')&&!e.target.closest('#demoAccountBtn')) closeMenus();
  });

  syncDevice(); renderCurrent(); setCoachState('ready'); syncPlayButton(); document.body.dataset.demoTestStatus='ready';
  const testParams=new URLSearchParams(location.search);
  if(testParams.has('qa') && testParams.get('autoplay')==='1'){ const requested=Number(testParams.get('chapter')||0); chapterIndex=clamp(Number.isFinite(requested)?requested:0,0,CHAPTERS.length-1); resetForChapter(); renderCurrent(); setTimeout(startPlayback,20); }
})();
