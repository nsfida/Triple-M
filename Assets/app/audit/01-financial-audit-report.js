/* Triplem VIP Build 001 — Financial Audit & Control Report */
(function(global){
  "use strict";

  const PAGE_SIZE = 15;
  const stateAudit = {
    prepared: false,
    running: false,
    hasRun: false,
    page: 1,
    response: null,
    requestSeq: 0,
    exportBusy: false
  };

  const $ = (sel, root=document) => root.querySelector(sel);
  const esc = value => typeof global.escapeHtml === "function"
    ? global.escapeHtml(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const dateText = value => typeof global.displayDate === "function" ? global.displayDate(value || "—") : String(value || "—");
  const today = () => typeof global.todayISO === "function" ? global.todayISO() : new Date().toISOString().slice(0,10);
  const moneyHtml = (amount, currency) => {
    if (typeof global.money === "function") return global.money(num(amount), currency || "AED");
    if (typeof global.formatReportAmount === "function") return esc(global.formatReportAmount(num(amount), currency || "AED"));
    return `${esc(currency || "AED")} ${num(amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  };
  const moneyText = (amount, currency) => {
    if (typeof global.formatReportAmount === "function") return global.formatReportAmount(num(amount), currency || "AED");
    return `${currency || "AED"} ${num(amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  };
  const pdfMoney = (amount, currency) => typeof global.formatPdfAmount === "function"
    ? global.formatPdfAmount(num(amount), currency || "AED")
    : moneyText(amount, currency);

  function monthStartISO(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
  }

  function elements(){
    return {
      root: $("#financialAuditRoot"),
      from: $("#financialAuditFrom"),
      to: $("#financialAuditTo"),
      currency: $("#financialAuditCurrency"),
      run: $("#runFinancialAuditBtn"),
      pdf: $("#downloadFinancialAuditPdfBtn"),
      excel: $("#downloadFinancialAuditExcelBtn")
    };
  }

  function canExport(){
    if (typeof global.isGuestMode === "function" && global.isGuestMode()) return false;
    if (typeof global.userHasPermission !== "function") return true;
    return global.userHasPermission("pdf_export","export") || global.userHasPermission("reports","export");
  }

  function normalizeResponse(raw){
    const value = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
    return value && typeof value === "object" ? value : {};
  }

  function rpcArgs({ page=1, flow="all", limit=PAGE_SIZE }={}){
    const el = elements();
    return {
      p_from: el.from?.value || null,
      p_to: el.to?.value || null,
      p_currency: (el.currency?.value || "ALL") === "ALL" ? null : el.currency.value,
      p_flow: flow || "all",
      p_limit: limit,
      p_offset: Math.max(0,(page-1)*limit)
    };
  }

  async function fetchReport({ page=1, flow="all", limit=PAGE_SIZE }={}){
    if (typeof global.supabaseRpc !== "function") throw new Error("Database reporting service is unavailable.");
    return normalizeResponse(await global.supabaseRpc("app_financial_audit_report_page", rpcArgs({page,flow,limit})));
  }

  function setLoading(active, message="Inspecting financial records…"){
    const el = elements();
    if (el.run) {
      el.run.disabled = !!active;
      el.run.innerHTML = active
        ? `<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Running Audit`
        : `<i class="fa-solid fa-magnifying-glass-chart" aria-hidden="true"></i> Run Audit`;
    }
    if (active && el.root) {
      el.root.innerHTML = `<div class="financial-audit-loading"><i class="fa-solid fa-shield-halved fa-pulse" aria-hidden="true"></i><strong>${esc(message)}</strong><span>Reading permitted modules and reconciling classifications.</span></div>`;
    }
  }

  function flowLabel(kind){
    const map = {in:"Money In",out:"Money Out",internal:"Internal",noncash:"Non-cash",accounting:"Accounting",audit:"Audit"};
    return map[String(kind||"").toLowerCase()] || "Activity";
  }

  function cleanAuditExportText(value){
    let text=String(value??"");
    if(!text) return "";
    // Internal Triplem metadata belongs to the data model, never to customer-facing exports.
    text=text.replace(/\s*\[[A-Z][A-Z0-9_]*(?:\\?:[^\]]*)?\]/g," ");
    text=text.replace(/\\:/g,":");
    text=text.replace(/\s*[|·]\s*(?=[|·]|$)/g," ");
    text=text.replace(/\s+/g," ").trim();
    return text;
  }

  function conciseAuditDetails(row,maxLength=180){
    const core=[row?.title,row?.counterparty,row?.category]
      .map(cleanAuditExportText)
      .filter(Boolean);
    const seen=new Set();
    const parts=[];
    const add=value=>{
      const clean=cleanAuditExportText(value);
      if(!clean) return;
      const key=clean.toLocaleLowerCase();
      if(seen.has(key)) return;
      seen.add(key);
      parts.push(clean);
    };
    core.forEach(add);
    const detail=cleanAuditExportText(row?.details);
    if(detail){
      detail.split(/\s*·\s*/).forEach(part=>{
        const clean=cleanAuditExportText(part);
        if(!clean) return;
        const key=clean.toLocaleLowerCase();
        if(seen.has(key)) return;
        // Do not repeat a leading classification already represented by title/category/counterparty.
        if(core.some(existing=>existing.toLocaleLowerCase()===key)) return;
        add(clean);
      });
    }
    let result=parts.join(" · ");
    const limit=Math.max(80,Number(maxLength)||180);
    if(result.length>limit) result=`${result.slice(0,limit-1).trimEnd()}…`;
    return result||"—";
  }

  function auditPdfContact(){
    if(typeof global.getPdfCompanyContact==="function") return global.getPdfCompanyContact()||{};
    return {};
  }

  function auditPdfPageNumber(doc){
    return Number(doc?.internal?.getCurrentPageInfo?.()?.pageNumber||doc?.internal?.getNumberOfPages?.()||1);
  }

  function drawAuditPdfHeader(doc,logo,title,subtitle){
    if(typeof global.drawPdfHeader==="function"){
      global.drawPdfHeader(doc,logo,title,subtitle);
      doc.__tripleMOwnerBlockBottom=38;
      return;
    }
    const pageWidth=doc.internal.pageSize.getWidth();
    doc.setFillColor(255,255,255);doc.rect(0,0,pageWidth,38,"F");
    doc.setFillColor(15,23,42);doc.rect(0,0,pageWidth,5,"F");
    doc.setFillColor(36,87,214);doc.rect(0,5,pageWidth,1.4,"F");
    doc.setTextColor(15,23,42);doc.setFont("helvetica","bold");doc.setFontSize(14);doc.text(title,14,17);
    doc.setTextColor(71,85,105);doc.setFont("helvetica","normal");doc.setFontSize(8);doc.text(String(subtitle||""),14,24);
    doc.setDrawColor(226,232,240);doc.setLineWidth(.2);doc.line(14,36,pageWidth-14,36);
    doc.__tripleMOwnerBlockBottom=38;
  }

  function drawAuditCompanyBanner(doc){
    const contact=auditPdfContact();
    const pageWidth=doc.internal.pageSize.getWidth();
    const company=String(contact.name||"Triplem VIP").trim()||"Triplem VIP";
    const trn=String(contact.trn||"").trim();
    const contactLine=[contact.email,contact.phone].filter(Boolean).join(" · ");
    const address=String(contact.address||"").replace(/\s+/g," ").trim();
    const top=40,height=14;
    doc.setFillColor(248,250,252);doc.setDrawColor(226,232,240);doc.setLineWidth(.2);
    doc.roundedRect(14,top,pageWidth-28,height,1.4,1.4,"FD");
    doc.setTextColor(15,23,42);doc.setFont("helvetica","bold");doc.setFontSize(8.4);
    const companyLine=doc.splitTextToSize(company,trn?118:174);
    doc.text(companyLine.slice(0,1),18,top+4.4);
    if(trn){
      doc.setFont("helvetica","normal");doc.setFontSize(6.8);doc.setTextColor(15,23,42);
      doc.text(`TRN: ${trn}`,pageWidth-18,top+4.4,{align:"right"});
    }
    doc.setFont("helvetica","normal");doc.setFontSize(6.4);doc.setTextColor(71,85,105);
    if(contactLine) doc.text(doc.splitTextToSize(contactLine,pageWidth-36).slice(0,1),18,top+8.5);
    if(address) doc.text(doc.splitTextToSize(address,pageWidth-36).slice(0,1),18,top+12.1);
    return top+height;
  }

  function drawAuditPdfFooter(doc){
    const contact=auditPdfContact();
    const pageWidth=doc.internal.pageSize.getWidth();
    const pageHeight=doc.internal.pageSize.getHeight();
    const company=String(contact.name||"Triplem VIP").trim()||"Triplem VIP";
    const trn=String(contact.trn||"").trim();
    const top=pageHeight-12;
    doc.setFillColor(250,250,250);doc.rect(0,top,pageWidth,12,"F");
    doc.setDrawColor(15,23,42);doc.setLineWidth(.25);doc.line(14,top,pageWidth-14,top);
    doc.setTextColor(15,23,42);doc.setFont("helvetica","bold");doc.setFontSize(6.3);
    doc.text(`${company}${trn?` · TRN: ${trn}`:""}`,pageWidth/2,top+4.7,{align:"center"});
    doc.setFont("helvetica","normal");doc.setFontSize(5.6);doc.setTextColor(71,85,105);
    doc.text("System-generated financial audit report",14,top+8.6);
    doc.text(`Page ${auditPdfPageNumber(doc)}`,pageWidth-14,top+8.6,{align:"right"});
  }

  function drawAuditPdfChrome(doc,logo,title,subtitle){
    drawAuditPdfHeader(doc,logo,title,subtitle);
    if(auditPdfPageNumber(doc)===1) drawAuditCompanyBanner(doc);
    drawAuditPdfFooter(doc);
  }

  function rowImpact(row){
    const kind = String(row.flow_kind || "").toLowerCase();
    const cur = row.currency || "AED";
    if (kind === "in") return {html:`+ ${moneyHtml(row.money_in,cur)}`, cls:"is-in"};
    if (kind === "out") return {html:`− ${moneyHtml(row.money_out,cur)}`, cls:"is-out"};
    if (kind === "internal") {
      const incoming = num(row.internal_in);
      return {html:`${incoming>0?"+":"−"} ${moneyHtml(incoming || row.internal_out || row.activity_amount,cur)}`, cls:incoming>0?"is-in":"is-out"};
    }
    if (kind === "accounting") {
      const incoming = num(row.accounting_in);
      const outgoing = num(row.accounting_out);
      if (incoming>0) return {html:`+ ${moneyHtml(incoming,cur)}`, cls:"is-in"};
      if (outgoing>0) return {html:`− ${moneyHtml(outgoing,cur)}`, cls:"is-out"};
      return {html:moneyHtml(row.activity_amount,cur), cls:""};
    }
    if (kind === "noncash") return {html:moneyHtml(row.activity_amount,cur), cls:""};
    return {html:"—",cls:""};
  }

  function metricsHtml(summary){
    return `<div class="financial-audit-metrics">
      <div class="financial-audit-metric is-in"><small>Money In</small><strong>${moneyHtml(summary.money_in,summary.currency)}</strong></div>
      <div class="financial-audit-metric is-out"><small>Money Out</small><strong>${moneyHtml(summary.money_out,summary.currency)}</strong></div>
      <div class="financial-audit-metric is-net"><small>Net Movement</small><strong>${moneyHtml(summary.net_movement,summary.currency)}</strong></div>
      <div class="financial-audit-metric"><small>Operational VAT Collected</small><strong>${moneyHtml(summary.vat_collected,summary.currency)}</strong></div>
      <div class="financial-audit-metric"><small>Operational VAT Paid</small><strong>${moneyHtml(summary.vat_paid,summary.currency)}</strong></div>
      <div class="financial-audit-metric"><small>Operational Net VAT</small><strong>${moneyHtml(summary.net_vat,summary.currency)}</strong></div>
      <div class="financial-audit-metric"><small>Internal Transfer In</small><strong>${moneyHtml(summary.internal_in,summary.currency)}</strong></div>
      <div class="financial-audit-metric"><small>Internal Transfer Out</small><strong>${moneyHtml(summary.internal_out,summary.currency)}</strong></div>
      <div class="financial-audit-metric"><small>Non-cash Expense</small><strong>${moneyHtml(summary.noncash_expense,summary.currency)}</strong></div>
      <div class="financial-audit-metric"><small>Accounting Receipts</small><strong>${moneyHtml(summary.accounting_in,summary.currency)}</strong></div>
      <div class="financial-audit-metric"><small>Accounting Payments</small><strong>${moneyHtml(summary.accounting_out,summary.currency)}</strong></div>
      <div class="financial-audit-metric"><small>Accounting VAT Collected</small><strong>${moneyHtml(summary.accounting_vat_collected,summary.currency)}</strong></div>
      <div class="financial-audit-metric"><small>Accounting VAT Paid</small><strong>${moneyHtml(summary.accounting_vat_paid,summary.currency)}</strong></div>
      <div class="financial-audit-metric"><small>Accounting Net VAT</small><strong>${moneyHtml(summary.accounting_net_vat,summary.currency)}</strong></div>
      <div class="financial-audit-metric"><small>Activity Records</small><strong>${Number(summary.activity_count||0).toLocaleString()}</strong></div>
    </div>`;
  }

  function moduleRowsHtml(modules){
    if (!modules.length) return `<div class="financial-audit-empty">No module activity in this period.</div>`;
    return `<div class="financial-audit-module-grid">${modules.map(row => {
      const net = num(row.money_in)-num(row.money_out);
      return `<div class="financial-audit-module-row">
        <div class="financial-audit-module-row-head"><strong>${esc(row.module)}</strong><span>${esc(row.currency)} · ${Number(row.record_count||0)} records</span></div>
        <div class="financial-audit-module-values">
          <span>In<b>${moneyHtml(row.money_in,row.currency)}</b></span>
          <span>Out<b>${moneyHtml(row.money_out,row.currency)}</b></span>
          <span>Net<b>${moneyHtml(net,row.currency)}</b></span>
          <span>VAT<b>${moneyHtml(num(row.vat_collected)-num(row.vat_paid),row.currency)}</b></span>
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  function exceptionsHtml(ex){
    const vals = [
      ["Edited",ex.edited_count],["Deleted",ex.deleted_count],["Restored",ex.restored_count],["Archived",ex.archived_count],["Audit events",ex.total_count]
    ];
    return `<div class="financial-audit-exceptions">${vals.map(([label,val])=>`<div class="financial-audit-exception"><small>${esc(label)}</small><strong>${Number(val||0).toLocaleString()}</strong></div>`).join("")}</div>`;
  }

  function pageButton(page, label, opts={}){
    const active = opts.active ? " active" : "";
    const disabled = opts.disabled ? " disabled" : "";
    const attr = Number.isFinite(page) ? ` data-audit-page="${page}"` : "";
    const numAttr = opts.number ? ` data-page-number="1"` : "";
    return `<button type="button" class="financial-audit-page-btn${active}"${attr}${numAttr}${disabled}>${label}</button>`;
  }

  function paginationHtml(totalPages,current,totalCount){
    totalPages = Math.max(1,Number(totalPages||1)); current = Math.max(1,Math.min(Number(current||1),totalPages));
    if (totalCount <= PAGE_SIZE && totalPages <= 1) return "";
    const pages = new Set([1,totalPages,current-2,current-1,current,current+1,current+2]);
    const list = [...pages].filter(n=>n>=1&&n<=totalPages).sort((a,b)=>a-b);
    let last=0, html="";
    for (const p of list){
      if (last && p-last>1) html += `<span class="financial-audit-muted">…</span>`;
      html += pageButton(p,String(p),{active:p===current,number:true}); last=p;
    }
    return `<div class="financial-audit-pagination">
      ${pageButton(current-1,'<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>',{disabled:current<=1})}
      ${html}<span class="financial-audit-page-status">${current} / ${totalPages}</span>
      ${pageButton(current+1,'<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>',{disabled:current>=totalPages})}
    </div>`;
  }

  function activityTableHtml(items,totalPages,totalCount){
    if (!items.length) return `<div class="financial-audit-empty">No matching financial activity in this period.</div>${paginationHtml(totalPages,stateAudit.page,totalCount)}`;
    return `<div class="financial-audit-table-wrap"><table class="financial-audit-table">
      <thead><tr><th>Date</th><th>Module</th><th>Activity</th><th>Reference</th><th>Details</th><th>Flow</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${items.map(row=>{
        const impact=rowImpact(row); const kind=String(row.flow_kind||"audit").toLowerCase();
        return `<tr>
          <td>${esc(dateText(row.event_date))}</td>
          <td><strong>${esc(row.module)}</strong><br><span class="financial-audit-muted">${esc(row.category||"")}</span></td>
          <td>${esc(row.activity||"Activity")}</td>
          <td><span class="financial-audit-ref">${esc(row.reference||"—")}</span></td>
          <td><div class="financial-audit-maincell"><strong>${esc(row.title||row.counterparty||"Record")}</strong><span title="${esc(row.details||"")}">${esc(row.details||row.counterparty||"—")}</span></div></td>
          <td><span class="financial-audit-flow is-${esc(kind)}">${esc(flowLabel(kind))}</span></td>
          <td class="financial-audit-amount ${impact.cls}">${impact.html}</td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>${paginationHtml(totalPages,stateAudit.page,totalCount)}`;
  }

  function renderReport(response){
    const el = elements(); if (!el.root) return;
    const summary = Array.isArray(response.summary)?response.summary:[];
    const modules = Array.isArray(response.modules)?response.modules:[];
    const items = Array.isArray(response.items)?response.items:[];
    const scopes = Array.isArray(response.available_modules)?response.available_modules:[];
    const ex = response.exceptions || {};
    const flow = response.flow || "all";
    const activeModules = scopes.filter(s=>s.allowed).map(s=>s.module);
    el.root.innerHTML = `
      <div class="financial-audit-period-banner">
        <div><h4>Audit period · ${esc(dateText(response.from))} to ${esc(dateText(response.to))}</h4><p>${response.currency==="ALL"?"Currencies remain separated; no exchange-rate assumptions are made.":`${esc(response.currency)} records only.`}</p></div>
        <div class="financial-audit-scope">${scopes.map(s=>`<span class="${s.allowed?"is-on":""}">${esc(s.module)}</span>`).join("")}</div>
      </div>
      ${summary.length ? summary.map(row=>`<section class="financial-audit-currency-block"><div class="financial-audit-currency-title"><h4>${esc(row.currency)} financial movement</h4><small>${Number(row.activity_count||0).toLocaleString()} records</small></div>${metricsHtml(row)}</section>`).join("") : `<div class="financial-audit-welcome"><i class="fa-solid fa-circle-info"></i><div><strong>No financial movement found.</strong><span>The selected period can still contain audit events or Accounting-only activity.</span></div></div>`}
      <div class="financial-audit-note"><strong>Control rule:</strong> Internal wallet transfers are excluded from consolidated Money In/Out. Accounting receipts, payments and document VAT are shown separately because Accounting can mirror operational modules. This prevents the audit from manufacturing income or expense through duplicate representations.</div>
      <section class="financial-audit-module-card"><div class="financial-audit-card-head"><div class="financial-audit-card-head-main"><h4>Module reconciliation</h4><p>${esc(activeModules.join(" · ")||"No financial modules available")}</p></div></div>${moduleRowsHtml(modules)}</section>
      <section class="financial-audit-exception-card"><div class="financial-audit-card-head"><div class="financial-audit-card-head-main"><h4>Exceptions & lifecycle evidence</h4><p>Immutable Expenses edit/delete lifecycle events during this period.</p></div></div>${exceptionsHtml(ex)}</section>
      <section class="financial-audit-activity-card">
        <div class="financial-audit-card-head"><div class="financial-audit-card-head-main"><h4>Detailed audit activity</h4><p>${Number(response.total_count||0).toLocaleString()} matching records · 15 rows per page</p></div>
          <select class="select financial-audit-flow-select" id="financialAuditFlowFilter" aria-label="Filter audit activity"><option value="all">All Activity</option><option value="in">Money In</option><option value="out">Money Out</option><option value="internal">Internal Transfers</option><option value="noncash">Non-cash</option><option value="accounting">Accounting</option><option value="audit">Audit Trail</option></select>
        </div>
        <div id="financialAuditActivityBody">${activityTableHtml(items,response.total_pages,response.total_count)}</div>
      </section>`;
    const flowSelect=$("#financialAuditFlowFilter",el.root); if(flowSelect) flowSelect.value=flow;
    bindDynamicEvents();
  }

  async function runAudit({page=1,flow=null,quiet=false}={}){
    const el=elements();
    if (!el.from?.value || !el.to?.value){ global.alert?.("Choose both From and To dates."); return; }
    if (el.from.value>el.to.value){ global.alert?.("From date cannot be after To date."); return; }
    const desiredFlow = flow ?? (stateAudit.response?.flow || "all");
    const seq=++stateAudit.requestSeq;
    stateAudit.running=true;
    if (!quiet) setLoading(true);
    try{
      const response=await fetchReport({page,flow:desiredFlow,limit:PAGE_SIZE});
      if(seq!==stateAudit.requestSeq) return;
      if(response.ok===false) throw new Error(response.error||"Audit report could not be generated.");
      stateAudit.page=page; stateAudit.response=response; stateAudit.hasRun=true;
      renderReport(response);
      const exportAllowed=canExport();
      if(el.pdf) el.pdf.disabled=!exportAllowed;
      if(el.excel) el.excel.disabled=!exportAllowed;
    }catch(err){
      console.error("Financial audit report failed:",err);
      if(seq!==stateAudit.requestSeq) return;
      if(el.root) el.root.innerHTML=`<div class="financial-audit-welcome"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>Audit report could not run.</strong><span>${esc(err?.message||err||"Unknown error")}${/app_financial_audit_report_page|function.*not found|schema cache/i.test(String(err?.message||err||""))?" Run migration 156_financial_audit_report.sql first.":""}</span></div></div>`;
    }finally{
      if(seq===stateAudit.requestSeq){stateAudit.running=false;if(!quiet&&el.run){el.run.disabled=false;el.run.innerHTML='<i class="fa-solid fa-magnifying-glass-chart" aria-hidden="true"></i> Run Audit';}}
    }
  }

  function bindDynamicEvents(){
    const root=elements().root; if(!root) return;
    root.querySelectorAll("[data-audit-page]").forEach(btn=>btn.addEventListener("click",async()=>{
      if(btn.disabled||stateAudit.running)return;
      const next=Number(btn.dataset.auditPage||1); if(!Number.isFinite(next)||next<1||next===stateAudit.page)return;
      const body=$("#financialAuditActivityBody",root); if(body) body.style.opacity=".45";
      await runAudit({page:next,flow:$("#financialAuditFlowFilter",root)?.value||"all",quiet:true});
      root.querySelector(".financial-audit-activity-card")?.scrollIntoView({behavior:"smooth",block:"start"});
    }));
    $("#financialAuditFlowFilter",root)?.addEventListener("change",e=>runAudit({page:1,flow:e.target.value,quiet:true}));
  }

  async function fetchAllAuditRows(){
    const all=[]; let offsetPage=1; let first=null;
    while(true){
      const response=await fetchReport({page:offsetPage,flow:"all",limit:500});
      if(!first) first=response;
      const rows=Array.isArray(response.items)?response.items:[];
      all.push(...rows);
      if(!rows.length || all.length>=Number(response.total_count||0)) break;
      offsetPage += 1;
      if(offsetPage>500) throw new Error("Audit export is too large for one browser session. Narrow the date range.");
    }
    return {meta:first||stateAudit.response||{},rows:all};
  }

  function exportRowsForSheet(rows){
    return rows.map(r=>({
      Date:r.event_date||"",Module:r.module||"",Category:r.category||"",Activity:r.activity||"",Reference:r.reference||"",
      Title:r.title||"",Counterparty:r.counterparty||"",Currency:r.currency||"",Flow:flowLabel(r.flow_kind),
      "Activity Amount":num(r.activity_amount),"Money In":num(r.money_in),"Money Out":num(r.money_out),
      "Internal In":num(r.internal_in),"Internal Out":num(r.internal_out),"Accounting In":num(r.accounting_in),"Accounting Out":num(r.accounting_out),
      "Non-cash Expense":num(r.noncash_expense),"VAT Collected":num(r.vat_collected),"VAT Paid":num(r.vat_paid),Status:r.status||"",Details:conciseAuditDetails(r,180)
    }));
  }

  async function downloadExcel(){
    if(stateAudit.exportBusy||!stateAudit.hasRun)return;
    if(!canExport()){global.alert?.("Your account does not have report export permission.");return;}
    const XLSX=global.XLSX; if(!XLSX?.utils?.book_new) throw new Error("Excel export library is still loading.");
    const btn=elements().excel; stateAudit.exportBusy=true; if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> Building';}
    try{
      const {meta,rows}=await fetchAllAuditRows(); const wb=XLSX.utils.book_new();
      const summaryRows=(meta.summary||[]).map(s=>({From:meta.from||elements().from.value,To:meta.to||elements().to.value,Scope:meta.currency||"ALL",Currency:s.currency,"Money In":num(s.money_in),"Money Out":num(s.money_out),"Net Movement":num(s.net_movement),"Operational VAT Collected":num(s.vat_collected),"Operational VAT Paid":num(s.vat_paid),"Operational Net VAT":num(s.net_vat),"Internal In":num(s.internal_in),"Internal Out":num(s.internal_out),"Non-cash Expense":num(s.noncash_expense),"Accounting Receipts":num(s.accounting_in),"Accounting Payments":num(s.accounting_out),"Accounting VAT Collected":num(s.accounting_vat_collected),"Accounting VAT Paid":num(s.accounting_vat_paid),"Accounting Net VAT":num(s.accounting_net_vat),Records:Number(s.activity_count||0)}));
      const modules=(meta.modules||[]).map(m=>({Module:m.module,Currency:m.currency,"Money In":num(m.money_in),"Money Out":num(m.money_out),"Internal In":num(m.internal_in),"Internal Out":num(m.internal_out),"Accounting In":num(m.accounting_in),"Accounting Out":num(m.accounting_out),"Non-cash Expense":num(m.noncash_expense),"VAT Collected":num(m.vat_collected),"VAT Paid":num(m.vat_paid),Records:Number(m.record_count||0)}));
      const add=(name,data)=>{
        const safeData=data.length?data:[{Status:"No records"}];
        const ws=XLSX.utils.json_to_sheet(safeData);
        const headers=Object.keys(safeData[0]||{});
        ws["!cols"]=headers.map(key=>({wch:Math.max(10,Math.min(34,Math.max(String(key).length+2,...safeData.slice(0,200).map(row=>String(row?.[key]??"").length+2))))}));
        if(ws["!ref"]) ws["!autofilter"]={ref:ws["!ref"]};
        XLSX.utils.book_append_sheet(wb,ws,name);
      };
      add("Summary",summaryRows); add("Module Summary",modules); add("All Activity",exportRowsForSheet(rows));
      add("Money In",exportRowsForSheet(rows.filter(r=>r.flow_kind==="in"))); add("Money Out",exportRowsForSheet(rows.filter(r=>r.flow_kind==="out")));
      add("Internal Transfers",exportRowsForSheet(rows.filter(r=>r.flow_kind==="internal"))); add("Non-cash",exportRowsForSheet(rows.filter(r=>r.flow_kind==="noncash")));
      add("VAT Activity",exportRowsForSheet(rows.filter(r=>num(r.vat_collected)!==0||num(r.vat_paid)!==0)));
      add("Audit Trail",exportRowsForSheet(rows.filter(r=>r.flow_kind==="audit")));
      const moduleSheets=["Expenses","Wallets","Transfers","Inventory","Loans","Installments","Assets","Accounting"];
      moduleSheets.forEach(module=>{
        const moduleRows=rows.filter(r=>String(r.module||"")===module);
        if(moduleRows.length) add(module,exportRowsForSheet(moduleRows));
      });
      const filename=`Triplem_Financial_Audit_${meta.from||elements().from.value}_to_${meta.to||elements().to.value}.xlsx`;
      XLSX.writeFile(wb,filename,{compression:true});
    }finally{stateAudit.exportBusy=false;if(btn){btn.disabled=!canExport();btn.innerHTML='<i class="fa-solid fa-file-excel" aria-hidden="true"></i> Excel';}}
  }

  async function downloadPdf(){
    if(stateAudit.exportBusy||!stateAudit.hasRun)return;
    if(!canExport()){global.alert?.("Your account does not have report export permission.");return;}
    const jsPDF=global.jspdf?.jsPDF; if(!jsPDF) throw new Error("PDF library is still loading.");
    const btn=elements().pdf; stateAudit.exportBusy=true;if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> Building';}
    try{
      const {meta,rows}=await fetchAllAuditRows(); const doc=new jsPDF();
      if(typeof global.applyProfessionalPdfDefaults==="function")global.applyProfessionalPdfDefaults(doc);
      const logo=typeof global.getPdfLogo==="function"?await global.getPdfLogo():null;
      const title="Financial Audit & Control Report"; const subtitle=`${dateText(meta.from||elements().from.value)} to ${dateText(meta.to||elements().to.value)} · ${meta.currency||"ALL"}`;
      const chrome=()=>drawAuditPdfChrome(doc,logo,title,subtitle);
      chrome(); let y=61;
      doc.setFont("helvetica","bold");doc.setFontSize(9.6);doc.setTextColor(15,23,42);doc.text("Executive summary",14,y);y+=4;
      doc.autoTable({startY:y,head:[["Currency","Money In","Money Out","Net","Op. VAT Net","Accounting VAT Net"]],body:(meta.summary||[]).map(s=>[s.currency,pdfMoney(s.money_in,s.currency),pdfMoney(s.money_out,s.currency),pdfMoney(s.net_movement,s.currency),pdfMoney(s.net_vat,s.currency),pdfMoney(s.accounting_net_vat,s.currency)]),margin:{top:42,bottom:18},styles:{font:"helvetica",fontSize:7.2,cellPadding:1.55},didDrawPage:chrome});
      y=doc.lastAutoTable.finalY+6;doc.setFont("helvetica","bold");doc.setFontSize(9.6);doc.setTextColor(15,23,42);doc.text("Module reconciliation",14,y);y+=4;
      doc.autoTable({startY:y,head:[["Module","Cur","In","Out","Internal","Non-cash","VAT Net","Records"]],body:(meta.modules||[]).map(m=>[m.module,m.currency,pdfMoney(m.money_in,m.currency),pdfMoney(m.money_out,m.currency),pdfMoney(num(m.internal_in)+num(m.internal_out),m.currency),pdfMoney(m.noncash_expense,m.currency),pdfMoney(num(m.vat_collected)-num(m.vat_paid),m.currency),String(m.record_count||0)]),margin:{top:42,bottom:18},styles:{font:"helvetica",fontSize:7,cellPadding:1.35},didDrawPage:chrome});
      y=doc.lastAutoTable.finalY+7;doc.setFont("helvetica","bold");doc.setFontSize(9.6);doc.setTextColor(15,23,42);doc.text("Detailed audit activity",14,y);y+=4;
      doc.autoTable({startY:y,head:[["Date","Module","Activity","Reference","Flow","Amount","VAT","Details"]],body:rows.map(r=>{
        const kind=String(r.flow_kind||""); let amt="—";
        if(kind==="in")amt=typeof global.expensePdfFlowText==="function"?global.expensePdfFlowText(r.money_in,r.currency,"in"):`+ ${pdfMoney(r.money_in,r.currency)}`;
        else if(kind==="out")amt=typeof global.expensePdfFlowText==="function"?global.expensePdfFlowText(r.money_out,r.currency,"out"):`Out ${pdfMoney(r.money_out,r.currency)}`;
        else if(kind==="internal")amt=pdfMoney(num(r.internal_in)||num(r.internal_out)||r.activity_amount,r.currency);
        else if(kind==="accounting")amt=pdfMoney(num(r.accounting_in)||num(r.accounting_out)||r.activity_amount,r.currency);
        else if(kind==="noncash")amt=pdfMoney(r.activity_amount,r.currency);
        const vat=num(r.vat_collected)-num(r.vat_paid);
        return [dateText(r.event_date),r.module,r.activity,r.reference||"—",flowLabel(kind),amt,vat?pdfMoney(vat,r.currency):"—",conciseAuditDetails(r,150)];
      }),margin:{top:42,bottom:18,left:12,right:12},styles:{font:"helvetica",fontSize:6.8,cellPadding:1.15,overflow:"linebreak",valign:"middle"},columnStyles:{0:{cellWidth:16},1:{cellWidth:18},2:{cellWidth:20},3:{cellWidth:22},4:{cellWidth:15},5:{cellWidth:24,halign:"right"},6:{cellWidth:18,halign:"right"},7:{cellWidth:51}},didDrawPage:chrome});
      doc.save(`Triplem_Financial_Audit_${meta.from||elements().from.value}_to_${meta.to||elements().to.value}.pdf`);
    }finally{stateAudit.exportBusy=false;if(btn){btn.disabled=!canExport();btn.innerHTML='<i class="fa-solid fa-file-pdf" aria-hidden="true"></i> PDF';}}
  }

  function prepare(){
    const el=elements(); if(!el.root)return;
    if(!stateAudit.prepared){
      if(el.from&&!el.from.value)el.from.value=monthStartISO();
      if(el.to&&!el.to.value)el.to.value=today();
      el.run?.addEventListener("click",()=>runAudit({page:1,flow:"all"}));
      el.currency?.addEventListener("change",()=>{if(stateAudit.hasRun)runAudit({page:1,flow:"all",quiet:true});});
      el.pdf?.addEventListener("click",()=>downloadPdf().catch(err=>{console.error(err);global.alert?.(err?.message||"PDF export failed.");}));
      el.excel?.addEventListener("click",()=>downloadExcel().catch(err=>{console.error(err);global.alert?.(err?.message||"Excel export failed.");}));
      stateAudit.prepared=true;
    }
    const exportAllowed=canExport(); if(el.pdf)el.pdf.disabled=!stateAudit.hasRun||!exportAllowed;if(el.excel)el.excel.disabled=!stateAudit.hasRun||!exportAllowed;
  }

  global.prepareFinancialAuditReport=prepare;
  global.runFinancialAuditReport=runAudit;
  global.downloadFinancialAuditPdf=downloadPdf;
  global.downloadFinancialAuditExcel=downloadExcel;
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",prepare,{once:true});else prepare();
})(window);
