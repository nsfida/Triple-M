/* 163 — Bought / Sold installment plans + structured optional details. */
(function(global){
  "use strict";

  const baseRenderInstallmentPlans = global.renderInstallmentPlans;
  const baseOpenEntryModal = global.openEntryModal;
  const baseOpenInstallmentEditModal = global.openInstallmentEditModal;
  const baseRenderInstallmentPlanOverlayBody = global.renderInstallmentPlanOverlayBody;
  const baseRenderInstallmentItemDetailsOverlay = global.renderInstallmentItemDetailsOverlay;
  const baseOpenInstallmentItemDetailsOverlay = global.openInstallmentItemDetailsOverlay;
  const baseRenderLoanSelectors = global.renderLoanSelectors;
  const baseOpenInstallmentPlanOverlay = global.openInstallmentPlanOverlay;
  const baseBuildInstallmentDetailsPayload = global.buildInstallmentDetailsPayload;
  const baseRenderInstallmentDetailsOverlay = global.renderInstallmentDetailsOverlay;
  const baseUpdateInstallmentEditPreview = global.updateInstallmentEditPreview;
  const baseCreatePrincipal = global.createPrincipal;
  const baseCreatePayment = global.createPayment;

  const DETAIL_FIELDS = [
    ["party_type","Party type"],["phone","Mobile / phone"],["email","Email"],["address","Address"],
    ["reference","Agreement / reference"],["item","Product / service"],["tax_id","ID / TRN / VAT No."],
    ["guarantor","Guarantor"],["guarantor_contact","Guarantor contact"],["terms","Payment terms"],["document_ref","Document reference"]
  ];

  function typeOf(value){ return normalizeInstallmentPlanType(value?.plan_type || value?.installment_plan_type || (value?.direction === "given" ? "sold" : "bought")); }
  function activeType(){ return normalizeInstallmentPlanType(state.installmentPlanView || "bought"); }
  function typeDirection(type){ return normalizeInstallmentPlanType(type) === "sold" ? "given" : "taken"; }
  function isSold(value){ return typeOf(value) === "sold"; }
  function detailPrefix(edit){ return edit ? "installment_edit_detail_" : "installment_detail_"; }
  function closeInstallmentEntryMenus(){
    document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
    document.querySelectorAll(".menu-wrap.open").forEach(wrap => wrap.classList.remove("open"));
    document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
  }

  function collectDetails(form, edit=false){
    const prefix = detailPrefix(edit);
    const out = {};
    DETAIL_FIELDS.forEach(([key]) => { out[key] = String(form?.elements?.namedItem?.(`${prefix}${key}`)?.value || "").trim(); });
    return normalizeInstallmentDetails(out);
  }
  function populateDetails(form, details, edit=false){
    const prefix = detailPrefix(edit);
    const src = normalizeInstallmentDetails(details);
    DETAIL_FIELDS.forEach(([key]) => {
      const el = form?.elements?.namedItem?.(`${prefix}${key}`);
      if (el) el.value = src[key] || "";
    });
    const detailsEl = form?.querySelector(".installment-optional-details");
    if (detailsEl) detailsEl.open = false;
  }
  function detailsRows(details){
    const src = normalizeInstallmentDetails(details);
    return DETAIL_FIELDS.map(([key,label]) => [label, src[key]]).filter(([,value]) => String(value || "").trim());
  }
  function detailsHtml(details, title="Optional details"){
    const rows = detailsRows(details);
    if (!rows.length) return "";
    return `<div class="installment-details-card"><h4>${escapeHtml(title)}</h4><div class="installment-details-grid">${rows.map(([label,value]) => `<div class="installment-detail-row"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join("")}</div></div>`;
  }
  function replaceTextNodes(root, pairs){
    if (!root || !global.document?.createTreeWalker) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => { let value = node.nodeValue || ""; pairs.forEach(([from,to]) => { value = value.replace(from,to); }); node.nodeValue = value; });
  }

  function syncModeUi(){
    const type = activeType();
    document.querySelectorAll("[data-installment-plan-view]").forEach(btn => {
      const on = btn.dataset.installmentPlanView === type;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    const desc = document.getElementById("installmentsSectionDesc");
    if (desc) desc.textContent = type === "sold"
      ? "Track installment sales and money expected from customers or companies."
      : "Track purchases you pay over time. Existing installment records remain Bought plans.";
    const newPlan = document.getElementById("installmentNewPlanBtn");
    const newPay = document.getElementById("installmentNewPaymentBtn");
    if (newPlan) newPlan.innerHTML = type === "sold" ? '<i class="fa-solid fa-calendar-plus"></i> New Sold Plan' : '<i class="fa-solid fa-calendar-plus"></i> New Bought Plan';
    if (newPay) newPay.innerHTML = type === "sold" ? '<i class="fa-solid fa-money-bill-wave"></i> Receive Installment' : '<i class="fa-solid fa-money-bill-wave"></i> Pay Installment';
  }

  function setPlanView(type){
    state.installmentPlanView = normalizeInstallmentPlanType(type);
    syncModeUi();
    renderInstallmentPlans();
  }
  global.setInstallmentPlanView = setPlanView;

  global.renderInstallmentPlans = function(){
    if (typeof baseRenderInstallmentPlans !== "function") return;
    const originalGetter = global.getInstallmentPlanGroups;
    const filtered = originalGetter().filter(plan => typeOf(plan) === activeType());
    global.getInstallmentPlanGroups = () => filtered;
    try { baseRenderInstallmentPlans(); } finally { global.getInstallmentPlanGroups = originalGetter; }
    syncModeUi();
    const sold = activeType() === "sold";
    document.querySelectorAll("#installmentsList .installment-plan-card").forEach(card => {
      const plan = getInstallmentPlanGroup(card.dataset.groupId);
      const planSold = isSold(plan);
      card.dataset.planType = planSold ? "sold" : "bought";
      const name = card.querySelector(".loan-name");
      if (name && !name.querySelector(".installment-type-badge")) {
        name.insertAdjacentHTML("beforeend", `<span class="badge installment-type-badge ${planSold ? "is-sold" : "is-bought"}">${planSold ? "Sold" : "Bought"}</span>`);
      }
      const metrics = card.querySelectorAll(".ip-metric");
      if (planSold && metrics.length >= 4) {
        metrics[0].querySelector("small").textContent = "Sale total";
        metrics[1].querySelector("small").textContent = "Received";
        metrics[2].querySelector("small").textContent = "Receivable";
      }
      const progress = card.querySelector(".ip-progress-label span:first-child");
      if (progress && planSold) progress.textContent = progress.textContent.replace(/paid/gi,"received");
      const meta = card.querySelector(".ip-card-meta");
      if (meta && planSold) meta.innerHTML = meta.innerHTML.replace(/ paid/gi," received").replace(/Down /g,"Advance ");
      card.querySelectorAll(".installmentActionBtn").forEach(btn => {
        if (btn.dataset.action === "pay") btn.innerHTML = planSold ? '<i class="fa-solid fa-money-bill"></i> Receive installment' : '<i class="fa-solid fa-money-bill"></i> Pay installment';
        if (btn.dataset.action === "delete") {
          const safeBtn = btn.cloneNode(true);
          safeBtn.dataset.groupId = plan.group_id;
          safeBtn.removeAttribute("data-person");
          safeBtn.removeAttribute("data-direction");
          safeBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete plan';
          btn.replaceWith(safeBtn);
          safeBtn.addEventListener("click", async e => {
            e.preventDefault(); e.stopPropagation();
            if (!teamCapability("can_delete_entries")) return alert("You do not have permission to delete entries.");
            const rows = state.entries.filter(x => x.group_id === plan.group_id);
            if (!rows.length) return;
            const ok = await appConfirmDelete(`Move this ${planSold ? "sold" : "bought"} installment plan for ${plan.person_name || "this counterpart"} to recycle bin?`, { title: "Delete installment plan?", confirmLabel: "Move to recycle bin" });
            if (!ok) return;
            rows.forEach(addToRecycleBin); unmarkDbSnapshotRows(rows);
            state.entries = state.entries.filter(x => x.group_id !== plan.group_id);
            if (isBackupMode()) refreshBackupView(); else persistDeleteGroup(plan.group_id, { label: "Installment plan delete", entries: rows }).catch(err => console.error("Installment delete sync failed", err));
            renderAll(); renderRecycleBinDropdown();
          });
        }
      });
    });
    const empty = document.querySelector("#installmentsList .empty");
    if (empty) empty.textContent = sold ? "No sold installment plans found." : "No bought installment plans found.";
  };

  global.renderLoanSelectors = function(){
    if (!state.modalInstallment) return baseRenderLoanSelectors();
    const type = normalizeInstallmentPlanType(state.modalInstallmentType || activeType());
    const plans = getInstallmentPlanGroups().filter(p => typeOf(p) === type && Number(p.remaining || 0) > 0.00000001);
    const select = els.modalLoanSelect;
    if (!select) return;
    select.innerHTML = plans.length
      ? `<option value="">Choose one</option>` + plans.map(p => `<option value="${escapeHtml(p.group_id)}" data-currency="${escapeHtml(p.currency || "")}">${escapeHtml(p.person_name || "Plan")} — ${escapeHtml(formatReportAmount(p.remaining, p.currency))} ${type === "sold" ? "receivable" : "remaining"}</option>`).join("")
      : `<option value="">No open ${type} installment plans available</option>`;
    syncCurrencySelectFonts(select);
    select.disabled = !plans.length;
    els.paymentSubmitBtn.disabled = !plans.length;
  };

  global.openEntryModal = function(mode, direction, options={}){
    const installment = !!options.installment;
    const type = installment ? normalizeInstallmentPlanType(options.installmentType || state.installmentPlanView || (direction === "given" ? "sold" : "bought")) : "bought";
    if (installment) {
      state.modalInstallmentType = type;
      direction = typeDirection(type);
    }
    baseOpenEntryModal(mode, direction, { ...options, installment });
    if (!installment) return;
    state.modalInstallmentType = type;
    const sold = type === "sold";
    const optional = document.getElementById("installmentOptionalDetailsSection");
    optional?.classList.toggle("hide", mode !== "principal");
    if (mode === "principal") {
      populateDetails(els.principalModalForm, {}, false);
      if (els.modalTitle) els.modalTitle.textContent = sold ? "New installment plan (Sold)" : "New installment plan (Bought)";
      if (els.principalSubmitBtn) els.principalSubmitBtn.textContent = sold ? "Save sold plan" : "Save bought plan";
      const personLabel = document.getElementById("principalPersonLabel"); if (personLabel) personLabel.textContent = sold ? "Buyer / Customer" : "Seller / Provider";
      const person = els.principalModalForm?.querySelector('[name="person_name"]'); if (person) person.placeholder = sold ? "Customer or company name" : "Seller or provider name";
      const amountLabel = document.getElementById("installmentPrincipalAmountLabel"); if (amountLabel) amountLabel.textContent = sold ? "Selling amount" : "Purchase amount";
      const down = document.getElementById("installmentDownPaymentLabel"); if (down) down.innerHTML = `${sold ? "Advance received" : "Down payment"} <span class="optional-label">optional</span>`;
      const monthly = document.getElementById("installmentMonthlyLabel"); if (monthly) monthly.textContent = sold ? "Monthly receivable after advance" : "Monthly installment after down payment";
      const odt = document.getElementById("installmentOptionalDetailsTitle"); if (odt) odt.textContent = sold ? "Buyer / sale details" : "Seller / purchase details";
      const badge = document.getElementById("principalWalletBadge");
      if (badge) { badge.textContent = sold ? "Advance received → Add to wallet" : "Down payment → Deduct from wallet"; badge.className = `badge ${sold ? "green" : "orange"}`; }
    } else {
      if (els.modalTitle) els.modalTitle.textContent = sold ? "Receive installment" : "Pay installment";
      if (els.paymentSubmitBtn) els.paymentSubmitBtn.textContent = sold ? "Save receipt" : "Save payment";
      const label = document.getElementById("paymentRelatedLabel"); if (label) label.textContent = sold ? "Related Sold Plan" : "Related Bought Plan";
      const badge = document.getElementById("paymentWalletBadge"); if (badge) { badge.textContent = sold ? "Installment received → Add to wallet" : "Installment payment → Deduct from wallet"; badge.className = `badge ${sold ? "green" : "orange"}`; }
      renderLoanSelectors();
      if (options.groupId) { els.modalLoanSelect.value = options.groupId; syncCurrencySelectFonts(els.modalLoanSelect); }
    }
    updateInstallmentPlanPreview();
  };

  global.updateInstallmentPlanPreview = function(){
    const previewInput = document.getElementById("installmentMonthlyPreview");
    const previewWrap = document.getElementById("installmentSchedulePreview");
    if (!previewInput || !previewWrap || !state.modalInstallment) return;
    const form = els.principalModalForm;
    const total = Number(form?.querySelector('[name="principal_amount"]')?.value || 0);
    const upfront = Math.max(0, Number(document.getElementById("installmentDownPaymentInput")?.value || 0));
    const count = Math.floor(Number(document.getElementById("installmentCountInput")?.value || 0));
    const currency = String(form?.querySelector('[name="currency"]')?.value || "AED");
    const startDate = String(document.getElementById("entryPrincipalDateInline")?.value || todayISO());
    const sold = normalizeInstallmentPlanType(state.modalInstallmentType) === "sold";
    if (!(total > 0) || count < 2 || upfront >= total) {
      previewInput.value = "";
      previewWrap.innerHTML = `<strong>Schedule preview</strong><p>Enter total amount, an optional ${sold ? "advance" : "down payment"} below the total, and at least 2 installments.</p>`;
      return;
    }
    const meta = buildInstallmentScheduleMeta(total,count,currency,startDate,upfront);
    previewInput.value = `${moneyText(meta.installmentAmount,currency)} × ${count-1} + last ${moneyText(meta.lastAmount,currency)}`;
    applyCurrencyFontClass(previewInput,currency);
    const sample = Array.from({length:Math.min(count,4)},(_,i)=>`<li><span>#${i+1} · ${escapeHtml(displayDate(addMonthsToISODate(startDate,i)))}</span><strong>${money(i===count-1?meta.lastAmount:meta.installmentAmount,currency)}</strong></li>`).join("");
    const more = count>4 ? `<li class="installment-preview-more">+ ${count-4} more monthly installments</li>` : "";
    previewWrap.innerHTML = `<strong>${sold ? "Receivable" : "Payment"} schedule preview</strong><p>Total ${money(total,currency)} · ${sold ? "advance received" : "down payment"} ${money(meta.downPayment,currency)} · ${sold ? "receivable" : "financed"} ${money(meta.financedAmount,currency)} across ${count} months.</p><ul class="installment-preview-list">${sample}${more}</ul>`;
  };

  async function createInstallmentWalletMovement(walletGroupId, amount, date, planName, currency, type, initial=false){
    const value = finiteMoney(amount); if (!walletGroupId || !(value > 0)) return;
    const account = getExpenseAccounts({applyUiFilters:false}).find(a=>a.group_id===walletGroupId);
    if (!account) throw new Error("Selected wallet was not found.");
    if (account.currency === "BTC") throw new Error("BTC wallet balances and transactions are loaded directly from the blockchain.");
    if (account.currency !== currency) throw new Error("Selected wallet currency does not match the installment currency.");
    const sold = type === "sold";
    if (!sold && value > Number(account.balance||0)) throw new Error(`Insufficient wallet balance. Available: ${formatReportAmount(account.balance,account.currency)}.`);
    const noteLabel = sold ? (initial ? "Installment advance received" : "Installment received") : (initial ? "Installment down payment" : "Installment payment");
    const payload = { group_id:walletGroupId,direction:"taken",entry_kind:"partial",person_name:account.person_name,currency:account.currency,principal_amount:null,action_amount:value,loan_date:account.principal?.loan_date||date,action_date:date,
      notes:upsertExpenseMetaInNote(`${noteLabel} — ${planName}`,{accountType:account.accountType,rowType:sold?"TOPUP":"EXPENSE",itemName:planName,expenseType:sold?"Installment Received":"Installment Payment"}) };
    await saveEntriesImmediately(payload,{label:noteLabel,awaitSync:true});
  }

  global.createPrincipal = async function(form){
    if (!state.modalInstallment) return baseCreatePrincipal(form);
    const fd=new FormData(form); const type=normalizeInstallmentPlanType(state.modalInstallmentType||activeType()); const direction=typeDirection(type);
    const groupId=crypto.randomUUID(); const walletId=String(fd.get("loan_wallet_id")||"").trim();
    const upfront=roundInstallmentMoney(fd.get("down_payment"),String(fd.get("currency")||"AED"));
    const payload={group_id:groupId,direction,installment_plan_type:type,installment_details:collectDetails(form,false),entry_kind:"principal",person_name:String(fd.get("person_name")||"").trim(),currency:String(fd.get("currency")||"").trim(),principal_amount:finiteMoney(fd.get("principal_amount")),action_amount:null,loan_date:fd.get("loan_date"),action_date:null,notes:String(fd.get("notes")||"").trim()||null};
    const count=Math.floor(finiteMoney(fd.get("installment_count")));
    if (!payload.person_name||!payload.currency||!(payload.principal_amount>0)||!payload.loan_date) throw new Error("Complete all required fields.");
    if (count<2||count>120) throw new Error("Enter between 2 and 120 installments.");
    if (upfront<0||upfront>=payload.principal_amount) throw new Error(`${type==="sold"?"Advance received":"Down payment"} must be zero or less than the total plan amount.`);
    validateCurrencyForForm(fd);
    payload.notes=upsertInstallmentMetaInNote(payload.notes,buildInstallmentScheduleMeta(payload.principal_amount,count,payload.currency,payload.loan_date,upfront));
    if (walletId) {
      if (!(upfront>0)) throw new Error(`Enter an ${type==="sold"?"advance received":"down payment"} before selecting a wallet, or choose Skip wallet entry.`);
      const account=getExpenseAccounts({applyUiFilters:false}).find(a=>a.group_id===walletId); if(!account) throw new Error("Selected wallet was not found.");
      if(account.currency!==payload.currency) throw new Error("Selected wallet currency does not match the installment currency.");
      if(type==="bought"&&upfront>account.balance) throw new Error(`Insufficient wallet balance. Available: ${formatReportAmount(account.balance,account.currency)}.`);
    }
    const rows=[payload];
    if(upfront>0) rows.push({group_id:groupId,direction,installment_plan_type:type,entry_kind:"partial",person_name:payload.person_name,currency:payload.currency,principal_amount:null,action_amount:upfront,loan_date:payload.loan_date,action_date:payload.loan_date,notes:upsertInstallmentMetaInNote(type==="sold"?"Advance received":"Down payment",{paymentType:"down_payment"})});
    await saveEntriesImmediately(rows.length===1?rows[0]:rows,{label:type==="sold"?"Sold installment plan":"Bought installment plan",awaitSync:!!walletId});
    if(walletId&&upfront>0) await createInstallmentWalletMovement(walletId,upfront,payload.loan_date,payload.person_name,payload.currency,type,true);
    form.reset(); setCurrencyChoice(form,"AED"); defaultDateInputs(form); closeModal("entryModal"); state.installmentPlanView=type; state.modalInstallment=false; state.modalInstallmentType="bought"; activate("installments"); renderInstallmentPlans();
  };

  global.createPayment = async function(form){
    if (!state.modalInstallment) return baseCreatePayment(form);
    const fd=new FormData(form); const groupId=String(fd.get("group_id")||""); const walletId=String(fd.get("payment_wallet_id")||"").trim();
    const plan=getInstallmentPlanGroup(groupId); if(!plan?.principal) throw new Error("Selected installment plan could not be found.");
    const type=typeOf(plan); const direction=typeDirection(type); const scheduled=!!plan.schedule;
    const amt=roundInstallmentMoney(fd.get("action_amount_0"),plan.currency); const dt=fd.get("action_date_0"); const nt=String(fd.get("notes_0")||"").trim()||null;
    const currentRemaining=Number(scheduled?plan.schedule.remainingTotal:plan.remaining||0);
    if(!(amt>0)||!dt) throw new Error("Enter a valid amount and date.");
    if(amt>currentRemaining+0.00000001) throw new Error(`Amount (${moneyText(amt,plan.currency)}) exceeds remaining balance (${moneyText(currentRemaining,plan.currency)}).`);
    if(walletId){ const account=getExpenseAccounts({applyUiFilters:false}).find(a=>a.group_id===walletId); if(!account) throw new Error("Selected wallet was not found."); if(account.currency!==plan.currency) throw new Error("Selected wallet currency does not match the installment currency."); if(type==="bought"&&amt>account.balance) throw new Error(`Insufficient wallet balance. Available: ${formatReportAmount(account.balance,account.currency)}.`); }
    let applied=amt, notes=nt;
    if(scheduled){ const allocation=allocateInstallmentPayment(plan.schedule,amt); if(!(allocation.applied>0)) throw new Error("No open installments to apply this amount to."); if(allocation.leftover>0.00000001) throw new Error(`Amount exceeds open installments by ${moneyText(allocation.leftover,plan.currency)}.`); applied=allocation.applied; notes=upsertInstallmentMetaInNote(nt,{allocation:formatInstallmentAllocation(allocation.allocations)}); }
    else notes=normalizeInstallmentNote(nt,true);
    const remainingAfter=roundInstallmentMoney(currentRemaining-applied,plan.currency);
    const payload={group_id:groupId,direction,installment_plan_type:type,entry_kind:remainingAfter<=0.00000001?"full":"partial",person_name:plan.person_name,currency:plan.currency,principal_amount:null,action_amount:applied,loan_date:plan.loan_date,action_date:dt,notes};
    await saveEntriesImmediately(payload,{label:type==="sold"?"Installment receipt":"Installment payment",awaitSync:!!walletId});
    if(walletId) await createInstallmentWalletMovement(walletId,applied,dt,plan.person_name,plan.currency,type,false);
    form.reset(); els.multiEntryCount.value=1; renderMultiEntries(1); closeModal("entryModal"); state.installmentPlanView=type; state.modalInstallment=false; state.modalInstallmentType="bought"; activate("installments"); renderInstallmentPlans();
  };

  global.openInstallmentPaymentModal = function(groupId, amount=null){
    const plan=getInstallmentPlanGroup(groupId); const type=typeOf(plan||{plan_type:activeType()});
    global.openEntryModal("payment",typeDirection(type),{installment:true,installmentType:type,groupId,amount});
  };

  global.openInstallmentEditModal = function(groupId){
    baseOpenInstallmentEditModal(groupId);
    const plan=getInstallmentPlanGroup(groupId); if(!plan?.principal) return;
    const type=typeOf(plan), sold=type==="sold"; state.modalInstallmentType=type;
    populateDetails(els.installmentEditForm,plan.details||plan.principal.installment_details,true);
    const title=document.getElementById("installmentEditTitle"); if(title) title.textContent=`Edit installment plan (${sold?"Sold":"Bought"})`;
    const nameLabel=document.getElementById("installmentEditNameLabel"); if(nameLabel) nameLabel.textContent=sold?"Buyer / Customer":"Seller / Provider";
    const amountLabel=document.getElementById("installmentEditAmountLabel"); if(amountLabel) amountLabel.textContent=sold?"Selling amount":"Purchase amount";
    const upfrontLabel=document.getElementById("installmentEditDownPaymentLabel"); if(upfrontLabel) upfrontLabel.innerHTML=`${sold?"Advance received":"Down payment"} <span class="optional-label">optional</span>`;
    const monthly=document.getElementById("installmentEditMonthlyLabel"); if(monthly) monthly.textContent=sold?"Monthly receivable after advance":"Monthly installment after down payment";
    const opt=document.getElementById("installmentEditOptionalDetailsTitle"); if(opt) opt.textContent=sold?"Buyer / sale details":"Seller / purchase details";
    if(els.installmentEditSummary){ els.installmentEditSummary.querySelectorAll("small").forEach(el=>{ if(sold) el.textContent=el.textContent.replace("Paid so far","Received so far").replace("Down payment","Advance received").replace("Remaining","Receivable"); }); }
  };

  global.submitInstallmentEdit = async function(){
    assertTeamCapability("can_edit_entries","You do not have permission to edit entries.");
    const form=els.installmentEditForm; const groupId=String(form?.querySelector('[name="group_id"]')?.value||"").trim(); const plan=getInstallmentPlanGroup(groupId); if(!plan?.principal) throw new Error("Installment plan not found.");
    const type=typeOf(plan), direction=typeDirection(type), sold=type==="sold";
    const personName=String(form.querySelector('[name="person_name"]')?.value||"").trim(); const currency=String(form.querySelector('[name="currency"]')?.value||"").trim(); const amount=Number(form.querySelector('[name="principal_amount"]')?.value||0); const loanDate=String(document.getElementById("installmentEditDateInline")?.value||"").trim(); const count=Math.floor(Number(form.querySelector('[name="installment_count"]')?.value||0)); const upfront=Math.max(0,Number(form.querySelector('[name="down_payment"]')?.value||0)); const displayNote=String(form.querySelector('[name="notes"]')?.value||"").trim(); const details=collectDetails(form,true);
    if(!personName||!currency||!(amount>0)||!loanDate) throw new Error("Complete all required fields."); if(count<2||count>120) throw new Error("Enter between 2 and 120 installments."); if(upfront>=amount) throw new Error(`${sold?"Advance received":"Down payment"} must be less than the total plan amount.`);
    const existingUpfront=plan.payments.find(isInstallmentDownPayment)||null; const regular=plan.payments.filter(r=>!isInstallmentDownPayment(r)); const regularTotal=regular.reduce((s,r)=>s+Number(r.action_amount||0),0); const financed=installmentFinancedAmount(amount,upfront,currency); if(financed+0.00000001<regularTotal) throw new Error(`${sold?"Receivable":"Financed"} amount cannot be less than installments already ${sold?"received":"paid"} (${moneyText(regularTotal,currency)}).`); if(existingUpfront&&!(upfront>0)) throw new Error(`A recorded ${sold?"advance":"down payment"} cannot be removed here.`);
    const scheduleMeta=buildInstallmentScheduleMeta(amount,count,currency,loanDate,upfront); const principalNotes=upsertInstallmentMetaInNote(displayNote,scheduleMeta); const draftPrincipal={...plan.principal,direction,installment_plan_type:type,installment_details:details,person_name:personName,currency,principal_amount:amount,loan_date:loanDate,notes:principalNotes};
    let nextUpfront=existingUpfront;
    if(upfront>0){ const upNotes=upsertInstallmentMetaInNote(cleanInstallmentDisplayNote(existingUpfront?.notes||(sold?"Advance received":"Down payment")),{paymentType:"down_payment"}); nextUpfront=existingUpfront?{...existingUpfront,direction,installment_plan_type:type,person_name:personName,currency,action_amount:upfront,loan_date:loanDate,action_date:existingUpfront.action_date||loanDate,entry_kind:"partial",notes:upNotes}:{id:crypto.randomUUID(),group_id:groupId,direction,installment_plan_type:type,entry_kind:"partial",person_name:personName,currency,principal_amount:null,action_amount:upfront,loan_date:loanDate,action_date:loanDate,notes:upNotes}; }
    const remapped=remapInstallmentPaymentsToSchedule(draftPrincipal,regular.concat(nextUpfront?[nextUpfront]:[])); if(remapped.leftoverTotal>0.00000001&&!confirm(`${moneyText(remapped.leftoverTotal,currency)} of existing ${sold?"receipts":"payments"} exceeds the new schedule. Continue?`)) return;
    state.entries=state.entries.map(e=>e.id===plan.principal.id?draftPrincipal:e);
    if(!isBackupMode()) await queueDatabasePatch(plan.principal.id,{person_name:personName,currency,principal_amount:amount,loan_date:loanDate,notes:principalNotes,installment_plan_type:type,installment_details:details},"Installment plan",draftPrincipal);
    if(nextUpfront){ if(existingUpfront){ state.entries=state.entries.map(e=>e.id===existingUpfront.id?nextUpfront:e); if(!isBackupMode()) queueDatabasePatch(existingUpfront.id,{person_name:personName,currency,action_amount:upfront,loan_date:loanDate,action_date:nextUpfront.action_date,entry_kind:"partial",notes:nextUpfront.notes,installment_plan_type:type},sold?"Installment advance":"Installment down payment",nextUpfront,{silent:true}); } else saveEntriesImmediately(nextUpfront,{label:sold?"Installment advance":"Installment down payment",notify:false}); }
    for(const row of remapped.remaps){ const updated={...row.payment,direction,installment_plan_type:type,person_name:personName,currency,loan_date:loanDate,entry_kind:row.entry_kind,notes:row.notes}; state.entries=state.entries.map(e=>e.id===row.id?updated:e); if(!isBackupMode()) queueDatabasePatch(row.id,{person_name:personName,currency,loan_date:loanDate,entry_kind:row.entry_kind,notes:row.notes,installment_plan_type:type},"Installment payment remap",updated,{silent:true}); }
    closeModal("installmentEditModal"); if(isBackupMode()) refreshBackupView(); else renderAll(); logCompanyActivity("edit","installments",`Updated ${type} installment plan \"${personName}\" (${moneyText(amount,currency)}, ${sold?"advance":"down payment"} ${moneyText(upfront,currency)}, ${count} installments)`,{entityType:"installment",entityId:groupId}); state.installmentPlanView=type; activate("installments"); renderInstallmentPlans();
  };

  global.renderInstallmentPlanOverlayBody = function(plan){
    let html=baseRenderInstallmentPlanOverlayBody(plan); const sold=isSold(plan); const detailBlock=detailsHtml(plan.details||plan.principal?.installment_details,sold?"Buyer / sale details":"Seller / purchase details");
    if(sold){ html=html.replace(/<small>Total<\/small>/g,"<small>Sale total</small>").replace(/<small>Down payment<\/small>/g,"<small>Advance received</small>").replace(/<small>Paid<\/small>/g,"<small>Received</small>").replace(/<small>Left<\/small>/g,"<small>Receivable</small>").replace(/% paid/g,"% received").replace(/>Pay </g,">Receive ").replace(/>Pay<\/button>/g,">Receive</button>").replace(/Payments \(/g,"Receipts (").replace(/No payments yet/g,"No receipts yet").replace(/Down payment/g,"Advance received").replace(/Final<\/span>/g,"Final receipt</span>").replace(/Partial<\/span>/g,"Partial receipt</span>"); }
    if(detailBlock) html=html.replace('<div class="ipo-tabs" role="tablist">',`${detailBlock}<div class="ipo-tabs" role="tablist">`);
    return html;
  };

  global.openInstallmentItemDetailsOverlay = function(groupId){
    baseOpenInstallmentItemDetailsOverlay(groupId); const plan=getInstallmentPlanGroup(groupId); if(!plan) return; const sold=isSold(plan);
    if(els.sectionDetailsDesc) els.sectionDetailsDesc.innerHTML=`${sold?"Sold · receivable":"Bought · payable"} · ${escapeHtml(plan.status)} · ${sold?"Receivable":"Remaining"} ${money(plan.remaining,plan.currency)} · ${escapeHtml(plan.currency||"—")}`;
    const payBtn=els.sectionDetailsActions?.querySelector('[data-action="pay"]'); if(payBtn){ payBtn.title=sold?"Receive next installment":"Pay next installment"; payBtn.setAttribute("aria-label",payBtn.title); }
  };

  global.renderInstallmentItemDetailsOverlay = function(groupId){
    baseRenderInstallmentItemDetailsOverlay(groupId); const plan=getInstallmentPlanGroup(groupId); if(!plan||!els.sectionDetailsBody) return; const sold=isSold(plan); const block=detailsHtml(plan.details||plan.principal?.installment_details,sold?"Buyer / sale details":"Seller / purchase details");
    if(sold) replaceTextNodes(els.sectionDetailsBody, [[/Principal/g,"Sale total"],[/Down payment/g,"Advance received"],[/Paid/g,"Received"],[/Remaining/g,"Receivable"],[/payments/gi,"receipts"]]);
    if(block){ const metrics=els.sectionDetailsBody.querySelector(".section-details-metrics"); metrics?.insertAdjacentHTML("afterend",block); }
  };


  global.openInstallmentPlanOverlay = function(groupId){
    baseOpenInstallmentPlanOverlay(groupId);
    const plan=getInstallmentPlanGroup(groupId); if(!plan) return;
    const sold=isSold(plan), upfront=Number(plan.downPayment||plan.schedule?.downPayment||0);
    if(els.installmentPlanDesc){
      const started=displayDate(plan.loan_date||"—");
      els.installmentPlanDesc.innerHTML=plan.schedule
        ? `${escapeHtml(String(plan.schedule.count))} installments${upfront>0?` · ${sold?"advance received":"down payment"} ${money(upfront,plan.currency)}`:""} · ${sold?"receivable":"payable"} · started ${escapeHtml(started)}`
        : `${sold?"Sold / receivable":"Bought / payable"} · started ${escapeHtml(started)}`;
    }
  };

  global.buildInstallmentDetailsPayload = function(){
    const original=global.getInstallmentPlanGroups;
    const plans=original().filter(p=>typeOf(p)===activeType());
    global.getInstallmentPlanGroups=()=>plans;
    try{return baseBuildInstallmentDetailsPayload();}finally{global.getInstallmentPlanGroups=original;}
  };

  global.renderInstallmentDetailsOverlay = function(){
    baseRenderInstallmentDetailsOverlay();
    if(activeType()!=="sold"||!els.sectionDetailsBody) return;
    if(els.sectionDetailsDesc) els.sectionDetailsDesc.textContent="Live sold-plan receivables, overdue status, and receipt activity.";
    replaceTextNodes(els.sectionDetailsBody, [[/Principal/g,"Sales total"],[/Paid/g,"Received"],[/Remaining/g,"Receivable"],[/Payments over time/g,"Receipts over time"],[/payments/gi,"receipts"]]);
  };

  global.updateInstallmentEditPreview = function(){
    baseUpdateInstallmentEditPreview();
    if(normalizeInstallmentPlanType(state.modalInstallmentType)!=="sold") return;
    const preview=document.getElementById("installmentEditPreview");
    if(preview) preview.innerHTML=preview.innerHTML.replace(/down payment/gi,"advance received").replace(/financed/gi,"receivable").replace(/paid/gi,"received").replace(/payments/gi,"receipts");
  };

  global.downloadInstallmentPlanPDF = async function(groupId){
    const plan=getInstallmentPlanGroup(groupId); if(!plan){alert("Installment plan not found.");return;} if(!window.jspdf){alert("PDF library loading. Please try again.");return;}
    const sold=isSold(plan), {jsPDF}=window.jspdf, doc=new jsPDF(); await loadCustomFontsForPdf(doc); const logoData=await getPdfLogo(); const title=sold?"Installment Sale Statement":"Installment Purchase Statement"; const subtitle=plan.person_name||"Plan"; const currency=plan.currency||"AED"; const fm=a=>formatPdfAmount(a,currency); const schedule=plan.schedule; const total=Number(plan.principalTotal||0), upfront=Number(plan.downPayment||schedule?.downPayment||0), financed=Number(plan.financedAmount||schedule?.financedAmount||Math.max(total-upfront,0)), paid=Number(plan.paidTotal||0), remaining=Number(plan.remaining||0), next=schedule?.nextOpen; const status=plan.status||"Open";
    drawPdfHeader(doc,logoData,title,subtitle); const partiesBottom=drawCompactPdfPartiesAndMeta(doc,{rightLabel:sold?"BUYER / CUSTOMER":"SELLER / PROVIDER",partyName:subtitle,meta:[{label:"Plan type",value:sold?"Sold / Receivable":"Bought / Payable"},{label:"Start date",value:displayDate(plan.loan_date||"—")},{label:"Currency",value:pdfCurrencyLabel(currency)},{label:"Installments",value:schedule?String(schedule.count):"Legacy"},...(upfront>0?[{label:sold?"Advance received":"Down payment",value:fm(upfront)}]:[]),{label:sold?"Receivable":"Financed",value:fm(financed)}]});
    let y=partiesBottom+6; const drows=detailsRows(plan.details||plan.principal?.installment_details); if(drows.length){ doc.autoTable({startY:y,head:[[sold?"Sale / customer details":"Purchase / provider details","Value"]],body:drows,theme:"grid",headStyles:{fillColor:[15,23,42],textColor:255,fontStyle:"bold",fontSize:7},styles:{font:"helvetica",fontSize:7,cellPadding:1.4,overflow:"linebreak"},margin:{left:14,right:14}}); y=(doc.lastAutoTable?.finalY||y)+6; }
    doc.setFont("helvetica","bold");doc.setFontSize(8.2);doc.setTextColor(15,23,42);doc.text("Installment schedule",14,y); y+=4;
    if(schedule){ doc.autoTable({startY:y,head:[["#","Due date","Amount due",sold?"Received":"Paid",sold?"Receivable":"Balance","Status"]],body:schedule.slots.map(slot=>[String(slot.index),displayDate(slot.dueDate),fm(slot.scheduled),fm(slot.paid),fm(slot.balance),slot.status]),theme:"grid",headStyles:{fillColor:[15,23,42],textColor:255,fontStyle:"bold",fontSize:6.8},styles:{font:"helvetica",fontSize:6.8,cellPadding:1.3},margin:{top:42,bottom:42,left:14,right:14},didDrawPage:()=>drawPdfHeaderAndFooter(doc,logoData,title,subtitle,false)}); }
    else { let running=total; const rows=(plan.payments||[]).slice().sort((a,b)=>dateStamp(a.action_date)-dateStamp(b.action_date)).map(row=>{running=Math.max(running-Number(row.action_amount||0),0);return[displayDate(row.action_date||"—"),sold?"Receipt":"Payment",fm(row.action_amount||0),fm(running),cleanInstallmentDisplayNote(row.notes)||"—"]}); doc.autoTable({startY:y,head:[["Date","Type","Amount",sold?"Receivable after":"Balance after","Notes"]],body:rows.length?rows:[["—",sold?"No receipts yet":"No payments yet","—",fm(total),"—"]],theme:"grid",headStyles:{fillColor:[15,23,42],textColor:255,fontStyle:"bold",fontSize:7},styles:{font:"helvetica",fontSize:7,cellPadding:1.4},margin:{left:14,right:14}}); }
    let sy=(doc.lastAutoTable?.finalY||y)+8; const safe=doc.internal.pageSize.getHeight()-38; if(sy+64>safe){doc.addPage();drawPdfHeaderAndFooter(doc,logoData,title,subtitle,false);sy=48;} doc.setFont("helvetica","bold");doc.setFontSize(8.2);doc.text("Plan summary",14,sy); drawCompactPdfTotals(doc,sy+5,[{label:sold?"Sale total":"Purchase total",value:fm(total)},...(upfront>0?[{label:sold?"Advance received":"Down payment",value:fm(upfront)}]:[]),{label:sold?"Total received":"Total paid",value:fm(paid)},{label:"Next due",value:next?`#${next.index} · ${displayDate(next.dueDate)} · ${fm(next.balance)}`:(remaining>0?"Open balance":"Complete")},{label:"Status",value:status},{label:sold?"Outstanding receivable":"Remaining balance",value:fm(remaining),strong:true}]); doc.save(`${sold?"Installment_Sold":"Installment_Bought"}_${String(subtitle).replace(/\s+/g,"_")}.pdf`);
  };

  document.addEventListener("DOMContentLoaded",()=>{
    document.querySelectorAll("[data-installment-plan-view]").forEach(btn=>btn.addEventListener("click",()=>setPlanView(btn.dataset.installmentPlanView)));
    document.getElementById("installmentNewPlanBtn")?.addEventListener("click",()=>{ closeInstallmentEntryMenus(); global.openEntryModal("principal",typeDirection(activeType()),{installment:true,installmentType:activeType()}); });
    document.getElementById("installmentNewPaymentBtn")?.addEventListener("click",()=>{ closeInstallmentEntryMenus(); global.openEntryModal("payment",typeDirection(activeType()),{installment:true,installmentType:activeType()}); });
    syncModeUi();
  });
})(window);
