const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateInsuranceFinancials } = require('../Assets/app/lib/insurance-math.js');
const { evaluateUserPermission, normalizeAssignedModules } = require('../Assets/app/lib/permissions.js');

test('insurance commission example is calculated exactly', () => {
  const r = calculateInsuranceFinancials(1500, 1400, 1450);
  assert.equal(r.companyCommission, 100);
  assert.equal(r.customerDiscount, 50);
  assert.equal(r.actualProfit, 50);
  assert.equal(r.isLoss, false);
});

test('insurance loss remains signed and is never converted to profit', () => {
  const r = calculateInsuranceFinancials(1500, 1400, 1350);
  assert.equal(r.companyCommission, 100);
  assert.equal(r.customerDiscount, 150);
  assert.equal(r.actualProfit, -50);
  assert.equal(r.lossAmount, 50);
  assert.equal(r.isLoss, true);
});

test('insurance rejects invalid and negative financial inputs', () => {
  assert.throws(() => calculateInsuranceFinancials('x', 100, 120), /valid number/i);
  assert.throws(() => calculateInsuranceFinancials(100, -1, 120), /cannot be negative/i);
});

test('protected Main Admin always has insurance while ordinary users remain explicitly gated', () => {
  const protectedAdmin = {
    moduleName: 'insurance', action: 'view', isGuest: false, trialLocked: false, isTrial: false,
    sessionUser: { id: '1', role: 'admin', is_protected: true }, permissions: []
  };
  assert.equal(evaluateUserPermission({ ...protectedAdmin, assignedModules: normalizeAssignedModules(['dashboard']) }), true);

  const ordinary = {
    ...protectedAdmin,
    sessionUser: { id: '2', role: 'user', is_protected: false }
  };
  assert.equal(evaluateUserPermission({ ...ordinary, assignedModules: normalizeAssignedModules(['dashboard']) }), false);
  assert.equal(evaluateUserPermission({ ...ordinary,
    assignedModules: normalizeAssignedModules(['dashboard', 'insurance']),
    permissions: [{ module: 'insurance', action: 'view', allowed: true }]
  }), true);
});

const fs = require('node:fs');
const path = require('node:path');
const projectRoot = path.resolve(__dirname, '..');

test('insurance migrations are forward-only, tenant-scoped and Main Admin gated', () => {
  const sql170 = fs.readFileSync(path.join(projectRoot, 'migrations', '170_insurance_module.sql'), 'utf8');
  const sql171 = fs.readFileSync(path.join(projectRoot, 'migrations', '171_insurance_admin_access_fix.sql'), 'utf8');
  assert.match(sql170, /owner_id=public\.app_data_owner_id\(\)/i);
  assert.match(sql170, /app_require_insurance_permission\('view'\)/i);
  assert.match(sql170, /actual_profit[\s\S]*?p_sale_price-p_purchase_price/i);
  assert.match(sql171, /caller_id uuid := public\.current_app_user_id\(\)/i);
  assert.match(sql171, /main_admin_change := caller_id is not null/i);
  assert.match(sql171, /is_protected,false\) and target\.role='admin'[\s\S]*?requested_insurance := true/i);
  assert.match(sql171, /where coalesce\(u\.is_protected,false\)=true and u\.role='admin'/i);
  assert.doesNotMatch(sql170 + sql171, /drop\s+table\s+(?!if\s+exists\s+public\.insurance_)/i);
});

test('insurance UI keeps customer documents free of internal purchase and commission fields', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'insurance', '01-insurance.js'), 'utf8');
  const start = source.indexOf('function documentHtml');
  const end = source.indexOf('function openCustomerDocument', start);
  const customerDoc = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(customerDoc, /purchase_price|company_commission|actual_profit/);
  assert.match(source, /title:\s*"Invoice"/);
  assert.doesNotMatch(customerDoc, /Proforma Invoice/i);
});

test('insurance is wired into Home navigation without changing Inventory module files', () => {
  const nav = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'ui', '01-render-navigation.js'), 'utf8');
  const auth = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'auth', '01-auth-session.js'), 'utf8');
  assert.match(nav, /insurance:\s*"insurance"/);
  assert.match(nav, /insurance:\s*"insurance\.png"/);
  assert.match(auth, /insurance:\s*"insurance"/);
});

test('admin Insurance control keeps save actions outside the scrollable form', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'admin', '01-admin.js'), 'utf8');
  assert.match(source, /settings-sheet-body admin-user-access-scroll/);
  assert.match(source, /settings-sheet-footer admin-user-access-footer/);
  assert.match(source, /user\?\.is_protected \|\| tabs\.includes\("insurance"\)/);
  const css = fs.readFileSync(path.join(projectRoot, 'Assets', 'style', '54-insurance.css'), 'utf8');
  assert.match(css, /#adminEditUserModal \.admin-user-access-scroll[\s\S]*?overflow:auto/);
  assert.match(css, /#adminEditUserModal \.admin-user-access-footer[\s\S]*?flex:0 0 auto/);
});


test('insurance 172 keeps provider companies and policies independent', () => {
  const sql172 = fs.readFileSync(path.join(projectRoot, 'migrations', '172_insurance_independent_policies_compact_ui.sql'), 'utf8');
  assert.match(sql172, /alter column company_id drop not null/i);
  assert.match(sql172, /p_company_id is intentionally ignored/i);
  assert.match(sql172, /select \* into pol from public\.insurance_policies where id=p_policy_id and owner_id=own/i);
  assert.doesNotMatch(sql172, /where id=p_policy_id and company_id=p_company_id/i);
  const deleteCompanyStart = sql172.indexOf('function public.app_insurance_delete_company');
  const policyListStart = sql172.indexOf('function public.app_insurance_list_policies', deleteCompanyStart);
  const deleteCompanySql = sql172.slice(deleteCompanyStart, policyListStart);
  assert.doesNotMatch(deleteCompanySql, /update public\.insurance_policies/i);
});

test('insurance UI offers separate company and policy catalogues with compact centered actions', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'insurance', '01-insurance.js'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'Assets', 'style', '54-insurance.css'), 'utf8');
  assert.match(source, /Policies are independent from Insurance Companies/);
  assert.doesNotMatch(source, /insurancePolicyCompanyFilter/);
  assert.match(source, /policyOptions\("",true\)/);
  assert.doesNotMatch(source, /comp\.onchange=.*policyOptions/);
  assert.match(source, /p_company_id:null/);
  assert.match(source, /insurance-entry-dialog compact-entry-dialog/);
  assert.match(css, /insurance-entry-dialog \.modal-footer[\s\S]*?justify-content:center/);
  assert.match(css, /insurance-sale-meta[\s\S]*?repeat\(3,minmax\(0,1fr\)\)/);
});

test('insurance sales expose floating per-record document actions and reuse temporary invoice drafts', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'insurance', '01-insurance.js'), 'utf8');
  assert.match(source, /data-insurance-row-menu=/);
  assert.match(source, /insuranceFloatingMenu/);
  assert.match(source, /label: "View"/);
  assert.match(source, /label: "Download Invoice"/);
  assert.match(source, /label: "Download Receipt"/);
  assert.match(source, /Edit Temporary Invoice/);
  assert.match(source, /Download Temporary Invoice/);
  assert.match(source, /tempInvoiceForSale\(sale\.id\)/);
  assert.match(source, /openTempInvoiceEditor\(sale,temp\)/);
  assert.doesNotMatch(source, /data-insurance-open-sale=/);
});

test('insurance report views isolate user and company commission and drive exports', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'insurance', '01-insurance.js'), 'utf8');
  assert.match(source, /user_commission:\s*\{[^}]*fields:\s*\["actual_profit"\]/);
  assert.match(source, /company_commission:\s*\{[^}]*fields:\s*\["company_commission"\]/);
  assert.match(source, /commission:\s*\{[^}]*"company_commission","customer_discount","actual_profit"/);
  assert.match(source, /reportExportColumns\(\)/);
  assert.match(source, /financial\.map\(c=>c\.label\)/);
});

test('insurance sales and reports use the compact aligned filter bar on desktop and mobile', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'insurance', '01-insurance.js'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'Assets', 'style', '54-insurance.css'), 'utf8');
  assert.match(source, /insurance-filter-toolbar/);
  assert.match(source, /insurance-report-filter-toolbar/);
  assert.match(css, /\.insurance-filter-toolbar\{[\s\S]*?display:grid/);
  assert.match(css, /\.insurance-filter-toolbar \.input,[\s\S]*?height:30px/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('insurance desktop reports use thin financial lines with selected-date and currency totals', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'insurance', '01-insurance.js'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'Assets', 'style', '54-insurance.css'), 'utf8');
  assert.match(source, /selectedDateRangeLabel\(\)/);
  assert.match(source, /insurance-report-line-record/);
  assert.match(source, /insurance-report-line-total/);
  assert.match(source, /Selected dates: \$\{range\}/);
  assert.match(source, /head:\[\["TOTAL","Sales"/);
  assert.match(css, /\.insurance-report-line-record\{[\s\S]*?min-height:38px/);
  assert.match(css, /\.insurance-report-cols-6\{grid-template-columns:/);
});

test('insurance customer PDFs use one detailed A5 landscape document system', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'insurance', '01-insurance.js'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'Assets', 'style', '54-insurance.css'), 'utf8');
  assert.match(source, /new jsPDF\(\{orientation:"landscape",unit:"mm",format:"a5"/);
  assert.match(source, /drawInsurancePdfFrame/);
  assert.match(source, /label:"ISSUER"/);
  assert.match(source, /label:"CUSTOMER"/);
  assert.match(source, /label:"INSURANCE COMPANY"/);
  assert.match(source, /label:"POLICY DATE"/);
  assert.match(source, /policy_description/);
  assert.match(css, /\.insurance-document-party-row-three\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important\}/);
});

test('insurance controls explicitly inherit Triplem theme surfaces and remain compact', () => {
  const css = fs.readFileSync(path.join(projectRoot, 'Assets', 'style', '54-insurance.css'), 'utf8');
  assert.match(css, /--insurance-surface:var\(--surface-elevated,var\(--panel,#fff\)\)/);
  assert.match(css, /#insurancePanel :is\(\.input,\.select\)[\s\S]*?background:var\(--control-bg,var\(--insurance-surface\)\)!important/);
  assert.match(css, /#insurancePanel \.btn,\.insurance-modal \.btn\{[\s\S]*?height:27px!important/);
  assert.match(css, /\.insurance-sale-menu button\{[\s\S]*?min-height:27px!important/);
});


test('insurance 173 adds stable six-digit customer numbers with explicit duplicate confirmation', () => {
  const sql173 = fs.readFileSync(path.join(projectRoot, 'migrations', '173_insurance_customer_registry_menus_documents.sql'), 'utf8');
  const source = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'insurance', '01-insurance.js'), 'utf8');
  assert.match(sql173, /create table if not exists public\.insurance_customers/i);
  assert.match(sql173, /customer_number text not null check \(customer_number ~ '\^\[0-9\]\{6\}\$'\)/i);
  assert.match(sql173, /floor\(random\(\)\*900000\)\+100000/i);
  assert.match(sql173, /app_insurance_check_customer_duplicate/i);
  assert.match(sql173, /p_allow_duplicate_customer boolean default false/i);
  assert.match(sql173, /add column if not exists customer_number text/i);
  assert.match(source, /insuranceDuplicateCustomerModal/);
  assert.match(source, /Use Existing/);
  assert.match(source, /Create Duplicate/);
  assert.match(source, /Auto-generated 6 digits/);
  assert.match(source, /p_allow_duplicate_customer:allowDuplicate/);
});

test('insurance row actions float above lists and company policy temp records are clickable', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'insurance', '01-insurance.js'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'Assets', 'style', '54-insurance.css'), 'utf8');
  assert.match(source, /isCustomerTransactionMenu \? document\.documentElement : document\.body/);
  assert.match(source, /rowMenuButtonHtml\("company"/);
  assert.match(source, /rowMenuButtonHtml\("policy"/);
  assert.match(source, /rowMenuButtonHtml\("temp"/);
  assert.match(source, /bindClickableRows\(root,'\[data-insurance-company-row\]'/);
  assert.match(source, /bindClickableRows\(root,'\[data-insurance-policy-row\]'/);
  assert.match(source, /bindClickableRows\(root,'\[data-insurance-temp-row\]'/);
  assert.match(css, /\.insurance-floating-menu\{[\s\S]*?position:fixed[\s\S]*?z-index:2147483647!important/);
});

test('insurance customer documents share the A5 frame and compact centered document actions', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'insurance', '01-insurance.js'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'Assets', 'style', '54-insurance.css'), 'utf8');
  assert.match(source, /createInsuranceA5Pdf\(jsPDF\)/);
  assert.match(source, /drawInsurancePdfFrame\(doc,logo,title,reference,docDate,1\)/);
  assert.match(source, /Customer No\. #\$\{d\.customer_number\}/);
  assert.match(source, /System-generated Insurance document/);
  assert.match(css, /\.insurance-document-dialog \.modal-footer\{[\s\S]*?justify-content:center!important/);
  assert.match(css, /\.insurance-document-dialog \.modal-footer \.btn\{[\s\S]*?height:25px!important/);
});

test('insurance 174 creates tenant-scoped commission receivables with multi-sale partial allocation', () => {
  const sql174 = fs.readFileSync(path.join(projectRoot, 'migrations', '174_insurance_my_commission_receivables.sql'), 'utf8');
  assert.match(sql174, /create table if not exists public\.insurance_commission_receipts/i);
  assert.match(sql174, /create table if not exists public\.insurance_commission_allocations/i);
  assert.match(sql174, /owner_id=public\.app_data_owner_id\(\).*app_has_insurance_permission\('view'\)/i);
  assert.match(sql174, /greatest\(s\.actual_profit,0::numeric\) commission_due/i);
  assert.match(sql174, /when b\.commission_received<=0 then 'outstanding'[\s\S]*?when b\.commission_received>=b\.commission_due then 'received'[\s\S]*?else 'partial'/i);
  assert.match(sql174, /p_sale_ids uuid\[\]/i);
  assert.match(sql174, /order by s\.transaction_date,s\.transaction_time,s\.created_at,s\.id/i);
  assert.match(sql174, /alloc:=least\(outstanding,remaining\)/i);
  assert.match(sql174, /Received amount exceeds the selected outstanding commission total/i);
  assert.match(sql174, /All selected commissions must belong to the same Insurance Company/i);
  assert.match(sql174, /All selected commissions must use the same currency/i);
  assert.doesNotMatch(sql174, /drop\s+table/i);
});

test('My Commission UI lists every sale with due received outstanding status and batch receiving', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'insurance', '01-insurance.js'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'Assets', 'style', '54-insurance.css'), 'utf8');
  assert.match(source, /\["commission", "My Commission", "fa-hand-holding-dollar"\]/);
  assert.match(source, /<div>Gross<\/div><div>Purchase<\/div><div>Sold<\/div><div>My Commission<\/div><div>Received<\/div><div>Deducted<\/div><div>Outstanding<\/div><div>Status<\/div>/);
  assert.match(source, /Outstanding/);
  assert.match(source, /Partially Received/);
  assert.match(source, /Fully Received/);
  assert.match(source, /app_insurance_receive_commission/);
  assert.match(source, /p_sale_ids:sales\.map\(r=>r\.id\)/);
  assert.match(source, /p_opening_balance_ids:openings\.map\(r=>r\.id\)/);
  assert.match(source, /Select All/);
  assert.match(source, /opening balances first/);
  assert.match(source, /rowMenuButtonHtml\("commission",row\.id\)/);
  assert.match(css, /\.insurance-commission-line\{[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.insurance-commission-status\.partial/);
  assert.match(css, /\.insurance-commission-candidate-list\{[\s\S]*?max-height:210px/);
});

test('commission payment history is auditable and deleting a receipt restores derived outstanding balances', () => {
  const sql174 = fs.readFileSync(path.join(projectRoot, 'migrations', '174_insurance_my_commission_receivables.sql'), 'utf8');
  const source = fs.readFileSync(path.join(projectRoot, 'Assets', 'app', 'insurance', '01-insurance.js'), 'utf8');
  assert.match(sql174, /app_insurance_list_commission_receipts/i);
  assert.match(sql174, /app_insurance_get_commission\(p_sale_id uuid\)/i);
  assert.match(sql174, /update public\.insurance_commission_receipts[\s\S]*?set is_deleted=true/i);
  assert.match(source, /Commission Receiving History/);
  assert.match(source, /Payment \/ Deduction History/);
  assert.match(source, /Delete Entry/);
  assert.match(source, /outstanding balances recalculated/i);
});


test("Insurance migration 175 adds policy number and auditable cancellation deductions", () => {
  const sql = fs.readFileSync(path.join(projectRoot, "migrations/175_insurance_policy_cancellation_commission_deductions.sql"), "utf8");
  assert.match(sql, /add column if not exists policy_number text/i);
  assert.match(sql, /create table if not exists public\.insurance_policy_cancellations/i);
  assert.match(sql, /create table if not exists public\.insurance_commission_deductions/i);
  assert.match(sql, /create table if not exists public\.insurance_commission_deduction_allocations/i);
  assert.match(sql, /app_insurance_cancel_sale/i);
  assert.match(sql, /policy_used_days/i);
  assert.match(sql, /post_deduction_to_commission/i);
  assert.doesNotMatch(sql, /drop\s+table/i);
});

test("Insurance policy number and cancellation are wired into sale documents", () => {
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  assert.match(source, /name="policy_number"/);
  assert.match(source, /p_policy_number:/);
  assert.match(source, /Policy Number/);
  assert.match(source, /Cancel Policy/);
  assert.match(source, /app_insurance_cancel_sale/);
  assert.match(source, /POLICY CANCELLED/);
  assert.match(source, /policy_used_days/);
});

test("Insurance temporary invoices use INV prefix", () => {
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  const sql = fs.readFileSync(path.join(projectRoot, "migrations/175_insurance_policy_cancellation_commission_deductions.sql"), "utf8");
  assert.match(source, /invoice_number:`INV-/);
  assert.doesNotMatch(source, /invoice_number:`TMP-/);
  assert.match(sql, /TMP-/);
  assert.match(sql, /INV-/);
  assert.match(sql, /if inv='' then inv:='INV-'/);
});

test("Insurance My Commission supports cancellation deductions and combined settlement", () => {
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  const sql = fs.readFileSync(path.join(projectRoot, "migrations/175_insurance_policy_cancellation_commission_deductions.sql"), "utf8");
  assert.match(source, /Add Deduction/);
  assert.match(source, /p_deduction_ids/);
  assert.match(source, /Deducted<\/div><div>Outstanding/);
  assert.match(sql, /p_deduction_ids uuid\[\]/i);
  assert.match(sql, /amount_applied/i);
  assert.match(sql, /commission_deducted/i);
  assert.match(sql, /Fully Settled|settled/i);
});

test("Insurance mobile filters and commission columns include cancellation refinements", () => {
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/54-insurance.css"), "utf8");
  assert.match(css, /insurance-cancelled-badge/);
  assert.match(css, /insurance-document-cancellation/);
  assert.match(css, /repeat\(7,minmax\(76px/);
  assert.match(css, /@media\(max-width:480px\)/);
  assert.match(css, /input\[type="date"\]/);
});


test("Insurance migration 176 adds tenant-scoped opening commission balances without fake sales", () => {
  const sql = fs.readFileSync(path.join(projectRoot, "migrations/176_insurance_commission_opening_balances.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.insurance_commission_opening_balances/i);
  assert.match(sql, /create table if not exists public\.insurance_commission_opening_allocations/i);
  assert.match(sql, /owner_id=public\.app_data_owner_id\(\).*app_has_insurance_permission\('view'\)/i);
  assert.match(sql, /app_insurance_create_commission_opening_balance/i);
  assert.match(sql, /opening outstanding balance must be greater than zero/i);
  assert.match(sql, /opening_amount commission_due/i);
  assert.match(sql, /p_opening_balance_ids uuid\[\]/i);
  assert.match(sql, /Imported opening balances represent the oldest receivables and are cleared first/i);
  assert.match(sql, /Opening balance cannot be edited after receiving has started/i);
  assert.match(sql, /has_sales or has_opening/i);
  assert.doesNotMatch(sql, /insert into public\.insurance_sales[\s\S]*opening/i);
  assert.doesNotMatch(sql, /drop\s+table/i);
});

test("My Commission UI supports opening balances and shows the three requested top totals", () => {
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/54-insurance.css"), "utf8");
  assert.match(source, /id="insuranceAddOpeningBalance"/);
  assert.match(source, /Add Opening Balance/);
  assert.match(source, /Balance from previous insurance policies before moving to Triplem VIP/i);
  assert.match(source, /Total Commission<\/span>/);
  assert.match(source, /Total Commission Received<\/span>/);
  assert.match(source, /Balance to Receive<\/span>/);
  assert.match(source, /Opening Outstanding Balances/);
  assert.match(source, /app_insurance_list_commission_opening_balances/);
  assert.match(source, /p_opening_balance_ids:openings\.map\(r=>r\.id\)/);
  assert.match(source, /source_type:"opening"/);
  assert.match(css, /\.insurance-commission-summary-strip\{/);
  assert.match(css, /\.insurance-opening-balance-row\{/);
  assert.match(css, /@media\(max-width:600px\)[\s\S]*insurance-commission-summary-currency/);
});

test("commission receipt history includes opening-balance allocations", () => {
  const sql = fs.readFileSync(path.join(projectRoot, "migrations/176_insurance_commission_opening_balances.sql"), "utf8");
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  assert.match(sql, /opening_allocation_count/i);
  assert.match(sql, /opening_allocations/i);
  assert.match(source, /openingAllocations/);
  assert.match(source, /Opening Balance<\/strong>/);
});

test("Insurance migration 177 fixes My Commission x.created_at history regression", () => {
  const sql = fs.readFileSync(path.join(projectRoot, "migrations/177_insurance_referrals_and_commission_history_fix.sql"), "utf8");
  assert.match(sql, /create or replace function public\.app_insurance_get_commission\(p_sale_id uuid\)/i);
  assert.match(sql, /d\.cancellation_id,d\.created_at/i);
  assert.match(sql, /order by x\.deduction_date desc,x\.deduction_time desc,x\.created_at desc/i);
  const deductionSelect = sql.slice(sql.indexOf("select coalesce(jsonb_agg(to_jsonb(x) order by x.deduction_date"), sql.indexOf("return jsonb_build_object('ok',true,'item'", sql.indexOf("select coalesce(jsonb_agg(to_jsonb(x) order by x.deduction_date")));
  assert.match(deductionSelect, /d\.created_at/);
});

test("Insurance migration 177 adds referral payables without reducing My Commission", () => {
  const sql = fs.readFileSync(path.join(projectRoot, "migrations/177_insurance_referrals_and_commission_history_fix.sql"), "utf8");
  assert.match(sql, /add column if not exists referral_name text/i);
  assert.match(sql, /add column if not exists referral_commission numeric/i);
  assert.match(sql, /create table if not exists public\.insurance_referral_payments/i);
  assert.match(sql, /create or replace function public\.app_insurance_create_sale_with_referral/i);
  assert.match(sql, /Referral commission cannot exceed My Commission for this sale/i);
  assert.match(sql, /create or replace function public\.app_insurance_list_referrals/i);
  assert.match(sql, /create or replace function public\.app_insurance_pay_referral/i);
  assert.match(sql, /referral_outstanding/i);
  assert.match(sql, /referral_status/i);
  const wrapper = sql.slice(sql.indexOf("create or replace function public.app_insurance_create_sale_with_referral"), sql.indexOf("-- --------------------------------------------------------------------------\n-- Referral payables list"));
  assert.doesNotMatch(wrapper, /set\s+actual_profit\s*=/i);
  assert.doesNotMatch(wrapper, /set\s+company_commission\s*=/i);
  assert.doesNotMatch(sql, /drop\s+table/i);
});

test("Insurance sale form records optional referral and separate commission share", () => {
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  assert.match(source, /name="referral_name"/);
  assert.match(source, /insuranceReferralCommissionToggle/);
  assert.match(source, /name="referral_commission"/);
  assert.match(source, /app_insurance_create_sale_with_referral/);
  assert.match(source, /p_referral_name:referralName\|\|null/);
  assert.match(source, /p_referral_commission:referralCommission/);
  assert.match(source, /Referral commission cannot exceed My Commission for this sale/);
});

test("Insurance Referrals section keeps separate payable status and settlement history", () => {
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/54-insurance.css"), "utf8");
  assert.match(source, /\["referrals", "Referrals", "fa-user-group"\]/);
  assert.match(source, /app_insurance_list_referrer_accounts/);
  assert.match(source, /app_insurance_referrer_summary/);
  assert.match(source, /Pay Referral/);
  assert.match(source, /app_insurance_pay_referral/);
  assert.match(source, /Payment History/);
  assert.match(source, /Partially Paid/);
  assert.match(source, /Fully Paid/);
  assert.match(source, /rowMenuButtonHtml\("referrer",row\.referral_id\)/);
  assert.match(css, /\.insurance-referral-line\{/);
  assert.match(css, /\.insurance-referral-entry\{/);
  assert.match(css, /@media\(max-width:480px\)[\s\S]*insurance-referral-filter-toolbar/);
});

test("Insurance migration 178 adds reusable referrer directory and grouped ledger", () => {
  const sql = fs.readFileSync(path.join(projectRoot, "migrations/178_insurance_referrer_directory_grouped_ledger.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.insurance_referrers/i);
  assert.match(sql, /add column if not exists referral_id uuid/i);
  assert.match(sql, /insurance_referrers_owner_name_uidx/i);
  assert.match(sql, /Imported from existing Insurance referrals/i);
  assert.match(sql, /create or replace function public\.app_insurance_list_referrer_directory/i);
  assert.match(sql, /create or replace function public\.app_insurance_list_referrer_accounts/i);
  assert.match(sql, /create or replace function public\.app_insurance_get_referrer_account/i);
  assert.match(sql, /create or replace function public\.app_insurance_referrer_summary/i);
  assert.match(sql, /set referral_id=rid,referral_name=rn,referral_commission=ra/i);
  assert.doesNotMatch(sql, /drop\s+table/i);
});

test("Insurance sale referral control selects existing referrer or adds a new one", () => {
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  assert.match(source, /id="insuranceReferralSelector"/);
  assert.match(source, /\+ Add New Referral/);
  assert.match(source, /app_insurance_list_referrer_directory/);
  assert.match(source, /selectedReferralName/);
  assert.match(source, /S\.referrerDirectory\.find/);
});

test("Referrals screen groups by referrer and opens a policy transaction ledger", () => {
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/54-insurance.css"), "utf8");
  assert.match(source, /app_insurance_list_referrer_accounts/);
  assert.match(source, /openReferrerDetails/);
  assert.match(source, /app_insurance_get_referrer_account/);
  assert.match(source, /Referral ledger/);
  assert.match(source, /rowMenuButtonHtml\("referralTransaction",tx\.id\)/);
  assert.match(source, /Commission · Paid · Outstanding/);
  assert.match(css, /\.insurance-referrer-ledger-row\{/);
  assert.match(css, /\.insurance-referrer-money-line\{/);
});

test("Insurance new-referral control replaces the selector in-place without overflowing commission fields", () => {
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/54-insurance.css"), "utf8");
  assert.match(source, /id="insuranceReferralIdentityField"/);
  assert.match(source, /id="insuranceNewReferralField" class="insurance-referral-new-control hide"/);
  assert.match(source, /id="insuranceReferralChooseExisting"/);
  assert.match(source, /referralSelector\?\.classList\.toggle\("hide",isNew\)/);
  assert.match(css, /Insurance 178\.1/);
  assert.match(css, /grid-template-columns:minmax\(0,1\.2fr\) minmax\(0,1fr\) minmax\(0,\.72fr\)/);
  assert.match(css, /#insuranceReferralCommissionField\{min-width:0!important;max-width:100%!important\}/);
});



test("Insurance migration 179 adds customer receivables without rewriting prior sales", () => {
  const sql = fs.readFileSync(path.join(projectRoot, "migrations/179_insurance_customer_balances_and_payments.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.insurance_customer_payments/i);
  assert.match(sql, /Imported as fully paid from existing Insurance history/i);
  assert.match(sql, /p_not_fully_paid boolean default false/i);
  assert.match(sql, /p_amount_paid numeric default null/i);
  assert.match(sql, /create or replace function public\.app_insurance_list_customer_balances/i);
  assert.match(sql, /create or replace function public\.app_insurance_get_customer_account/i);
  assert.match(sql, /create or replace function public\.app_insurance_record_customer_payment/i);
  assert.match(sql, /customer_outstanding/i);
  assert.doesNotMatch(sql, /drop\s+table/i);
});

test("Insurance sale form defaults to fully paid and exposes an explicit partial-payment path", () => {
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  assert.match(source, /id="insuranceNotFullyPaid"/);
  assert.doesNotMatch(source, /id="insuranceNotFullyPaid"[^>]*checked/i);
  assert.match(source, /<span>Not fully paid<\/span>/);
  assert.match(source, /name="amount_paid"/);
  assert.match(source, /p_not_fully_paid:notFullyPaid/);
  assert.match(source, /p_amount_paid:amountPaid/);
  assert.match(source, /Select an existing or new customer before saving an outstanding balance|Choose an existing or new customer/);
});

test("Insurance Customers/Balances defaults to outstanding and preserves settled customer history", () => {
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/54-insurance.css"), "utf8");
  assert.match(source, /\["customers", "Customers\/Balances", "fa-users"\]/);
  assert.match(source, /customerBalanceFilters:\s*\{\s*search:\s*"",\s*status:\s*"outstanding"\s*\}/);
  assert.match(source, /Outstanding only/);
  assert.match(source, /All customers/);
  assert.match(source, /app_insurance_list_customer_balances/);
  assert.match(source, /app_insurance_get_customer_account/);
  assert.match(source, /Receive Customer Payment/);
  assert.match(source, /app_insurance_record_customer_payment/);
  assert.match(css, /\.insurance-customer-balance-toolbar\{/);
  assert.match(css, /\.insurance-customer-account-row\{/);
  assert.match(css, /@media\(max-width:480px\)[\s\S]*insurance-customer-balance-toolbar/);
});


test("Insurance customer balances expose statement PDF and per-transaction document menus", () => {
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/54-insurance.css"), "utf8");
  assert.match(source, /rowMenuButtonHtml\("customerBalance",row\.customer_number\)/);
  assert.match(source, /Download Statement PDF/);
  assert.match(source, /downloadCustomerStatementPdf/);
  assert.match(source, /Customer Statement/);
  assert.match(source, /documentMenuButtonHtml\("customerTransaction",tx\.id\)/);
  assert.match(source, /aria-label="Invoice, receipt and temporary invoice options"/);
  assert.match(source, /<span>Documents<\/span>/);
  assert.match(source, /Invoice PDF/);
  assert.match(source, /Receipt PDF/);
  assert.match(source, /Create Temporary Invoice/);
  assert.match(source, /Download Temporary Invoice/);
  assert.match(source, /Receive Payment/);
  assert.match(css, /#insuranceCustomerBalanceDetailsModal \.modal-body\{overflow-x:hidden!important\}/);
  assert.match(css, /\.insurance-customer-account-actions\{/);
  assert.match(css, /\.insurance-customer-transaction-docs\{/);
  assert.match(source, /Use Documents on any transaction/);
});


test("customer statement transaction Documents uses a compact floating dropdown", () => {
  const source = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/54-insurance.css"), "utf8");
  assert.match(source, /anchor\?\.dataset\?\.insuranceRowMenu === "customerTransaction"/);
  assert.match(source, /menu\.classList\.add\("insurance-customer-documents-dropdown"\)/);
  assert.match(source, /isCustomerTransactionMenu \? document\.documentElement : document\.body/);
  assert.match(source, /anchor\.setAttribute\("aria-expanded", "true"\)/);
  assert.doesNotMatch(source, /openCustomerTransactionInlineMenu/);
  assert.doesNotMatch(css, /insurance-customer-transaction-inline-menu/);
  assert.match(css, /\.insurance-floating-menu\.insurance-customer-documents-dropdown\{/);
  assert.match(css, /min-width:196px!important/);
  assert.match(css, /grid-template-columns:15px minmax\(0,1fr\)/);
});


test("customer statement desktop ledger keeps Documents column inside the modal", () => {
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/54-insurance.css"), "utf8");
  assert.match(css, /insurance-customer-account-head,\.insurance-customer-account-row\{display:grid;grid-template-columns:minmax\(0,2\.15fr\) repeat\(3,minmax\(0,\.82fr\)\) minmax\(0,\.9fr\) minmax\(88px,\.9fr\)/);
  assert.match(css, /#insuranceCustomerBalanceDetailsModal \.insurance-customer-account-ledger\{width:100%;max-width:100%;min-width:0;box-sizing:border-box\}/);
  assert.match(css, /#insuranceCustomerBalanceDetailsModal \.insurance-payment-status\{max-width:100%;overflow:hidden;text-overflow:ellipsis\}/);
  assert.doesNotMatch(css, /insurance-customer-account-head,\.insurance-customer-account-row\{display:grid;grid-template-columns:minmax\(245px/);
});


test("customer statement Documents menu is forced to a compact root-level vertical dropdown", () => {
  const js = fs.readFileSync(path.join(projectRoot, "Assets/app/insurance/01-insurance.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "Assets/style/54-insurance.css"), "utf8");
  const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  assert.match(js, /document\.documentElement : document\.body/);
  assert.match(js, /gridTemplateColumns: "minmax\(0, 1fr\)"/);
  assert.match(js, /width: "196px"/);
  assert.match(css, /\.insurance-floating-menu\.insurance-customer-documents-dropdown\{[\s\S]*position:fixed!important;[\s\S]*grid-auto-flow:row!important;[\s\S]*width:196px!important;/);
  assert.match(html, /54-insurance\.css\?v=20260922-insurance-customerdropdown006/);
  assert.match(html, /01-insurance\.js\?v=20260922-insurance-customerdropdown006/);
});
