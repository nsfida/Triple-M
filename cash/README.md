# Expense Vault

A single-page, Excel-style expense register using Supabase. The project is split into separate HTML, CSS, JavaScript, SQL migration, and Edge Function files.

## Included

- **Cash Vault, Expenses, Received** tabs. Cash Vault is the default tab after every successful sign-in. All three sections are functional.
- **Expenses register:** the exact 32 visible columns requested, inline cell editing, today's date by default, date suggestions for today and the previous five days, manual date selection, Cash/Bank type selector, and an automatically calculated row total. Amount columns have been narrowed and each sheet scrolls inside its own frame so the page itself does not expand horizontally.
- **Received register:** the exact 23 visible columns requested, inline cell editing, today's date by default, date suggestions for today and the previous five days, manual date selection, Cash/Bank type selector, a Merchant text column, and an automatically calculated row total.
- **Cash Vault:** Available Cash is Cash-type Received minus Cash-type Expenses minus the total of all signed people balances. Bank entries are excluded. The denomination register stores one daily count per date for 1,000, 500, 200, 100, 50, 20, 10, 5, 1, 0.50 and 0.25 notes/coins. The app compares Available Cash with Cash Counted and highlights both values in red when they differ.
- **People balances:** add a person's name and enter one signed AED amount. A positive amount (for example `+1,000`) means cash is with that person and reduces Available Cash; it is displayed in red. A negative amount (for example `-500`) increases Available Cash; it is displayed in green. Edit the person's name or amount at any time. The people balances never change the physical note/coin quantities. There are no separate Given/Received movement types or transaction-history list in the current workflow.
- **Save changes:** edits are held in the page until you click Save changes. New and existing records are inserted/updated individually; no existing tables are dropped or replaced.
- **Owner access key:** the first key is seeded in the database migration as a salted bcrypt hash. The Auth account is provisioned on the first successful sign-in.
- **Alternate keys:** the owner can create view-only or editable alternate keys, change their permission, and revoke them.
- **RLS:** all financial tables have row-level security policies. The public browser key cannot read the access-key table or bypass ledger permissions. People balances are written only through a permission-checked SECURITY DEFINER RPC. It updates the one signed balance on the selected person; it never writes to `cash_vault_counts`. The cash balance RPC is SECURITY INVOKER, so the caller's SELECT grants and RLS policies still apply.
- **No persistent browser login:** the Supabase client is configured with `persistSession: false`. A new page session requires the access key again.
- **Full-window light desktop UI:** the workspace uses the available browser window height and width; the spreadsheet scrolls inside its own frame.
- **Owner permissions:** the active `owner` key has unrestricted read, add, edit and delete permissions for Expenses, Received, Cash Vault counts and signed person balances, plus owner-key and alternate-key management. RLS remains enabled. This is full administrator access inside Expense Vault, not Supabase project-owner or database-superuser access.
- **Spreadsheet copy/paste:** drag across cells to select a rectangular range. `Ctrl+C` copies the selection as tab-separated values for Excel; `Ctrl+V` pastes a tab-separated block into the selected starting cell. Computed total columns are read-only and are recalculated after paste. Paste accepts common date formats including ISO and day-first dates (`DD/MM/YYYY`), Excel date serials, and comma-separated AED amounts such as `1,250.50`.

## Project structure

```text
expense_vault_project/
├── index.html
├── css/
│   └── styles.css
├── js/
│   └── app.js
├── sql/
│   └── migrations/
│       ├── 001_init_expenses.sql
│       ├── 002_service_role_public_schema_usage.sql
│       ├── 003_create_received_records.sql
│       ├── 004_fix_public_schema_access.sql
│       ├── 005_cash_vault_counts_and_balance.sql
│       ├── 006_cash_person_accounts_and_denomination_adjustments.sql
│       ├── 007_cash_people_amount_only.sql
│       ├── 008_separate_person_movements_from_physical_cash_count.sql
│       └── 009_signed_person_balances.sql
└── supabase/
    ├── config.toml
    └── functions/
        └── access/
            └── index.ts
```

## Setup — Supabase

The HTML already contains the supplied project URL and **publishable** key. A publishable key is expected to be visible in a browser; RLS is what restricts its database access. Never put a Supabase secret key or legacy `service_role` key in `index.html`, `js/app.js`, or any other browser file.

### 1. Apply the database migrations

1. Open the Supabase Dashboard and select project `hmtbalmgpyrnxbifnvzg`.
2. Open **SQL Editor**.
3. For a brand-new setup, run `sql/migrations/001_init_expenses.sql` first. It creates the initial access-key system and Expenses ledger. It does not drop or truncate existing tables.
4. Run `sql/migrations/002_service_role_public_schema_usage.sql` once. It adds the service-role schema permission needed by the login function.
5. Run `sql/migrations/003_create_received_records.sql` once. This creates the separate `received_records` table with RLS and the same owner/editor/view-only permissions as Expenses. It does not alter or delete expense records.
6. Run `sql/migrations/004_fix_public_schema_access.sql`. This repairs missing `USAGE` permission on the `public` schema for the Supabase API roles, reasserts ledger table grants, and reinstates the RLS policies. It does not disable RLS or grant the `anon` role access to ledger rows.
7. Run `sql/migrations/005_cash_vault_counts_and_balance.sql`. This adds the daily denomination-count table, generated cash-count total, RLS policies, and the RLS-aware `get_cash_vault_summary(date)` function.
8. Run `sql/migrations/006_cash_person_accounts_and_denomination_adjustments.sql`. This adds the people register and person cash movements, atomic denomination-count adjustment functions, and updates the available-balance calculation. It does not delete or rewrite historical Expense, Received or daily denomination-count records.
9. Run `sql/migrations/007_cash_people_amount_only.sql`. This changes the person-movement workflow to amount-only entry. It retains legacy denomination columns only as an internal way to store the movement amount in the existing generated `total_cash` field.
10. Run `sql/migrations/008_separate_person_movements_from_physical_cash_count.sql`. This separates the former person movement ledger from physical cash counts. Existing transaction and cash-count rows are preserved.
11. Run `sql/migrations/009_signed_person_balances.sql`. This adds one signed balance to each person, backfills it from the previous movement totals once, replaces the Available Cash formula, and disables the old movement RPCs for browser users. The legacy history table is retained; no existing expense, received or denomination-count records are deleted or modified.

**For your already-running project:** migrations 001–008 have already been applied. For this update, run **only migration 009**. Do not rerun 001–008. Open `sql/migrations/009_signed_person_balances.sql`, copy all its SQL, paste it into Supabase SQL Editor, and click **Run**. Then replace your local project files with this complete package and refresh the app with `Ctrl+F5`. No Edge Function redeployment is required.

The initial owner PIN `356425023663338` appears in the migration only as an input to `pgcrypto`'s bcrypt hash function. The database stores the hash, not the plaintext PIN. Keep the migration file private until you have applied it; remove the literal from any public copy or repository history if you publish the source.

### 2. Deploy the access Edge Function (required for the PIN to work)

The SQL migration creates the hashed owner key in the database. The PIN login endpoint must also be deployed; otherwise the page cannot verify the key.

On Windows:

1. Install **Node.js 20 or later** from https://nodejs.org/ .
2. Open the extracted `expense_vault_project` folder in File Explorer. Click the folder address bar, type `powershell`, and press Enter.
3. Run these commands one at a time:

```powershell
npx --yes supabase@latest login
npx --yes supabase@latest functions deploy access --project-ref hmtbalmgpyrnxbifnvzg --use-api
```

4. When the login command asks for a Supabase access token, create one at https://supabase.com/dashboard/account/tokens, copy it, and paste it into PowerShell. Treat this token as a password.
5. Wait for the deployment command to report that the `access` function was deployed successfully. In the Supabase Dashboard, open **Edge Functions** and confirm that `access` appears there.

**Do not run a command to create `SUPABASE_SECRET_KEY` or `SUPABASE_PUBLISHABLE_KEY` yourself.** Supabase automatically provides the `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS` environment variables to hosted Edge Functions. The function in this project reads those values automatically. Never put a secret key or CLI access token in the HTML or JavaScript files.

Supabase's official instructions: [CLI installation](https://supabase.com/docs/guides/local-development/cli/getting-started), [deploying Edge Functions](https://supabase.com/docs/guides/functions/deploy), and [Edge Function environment variables](https://supabase.com/docs/guides/functions/secrets).

### 3. Run the web page

Do not open `index.html` directly using `file://`; ES modules and browser security rules require a local or hosted web server. For a quick local test on Windows, open PowerShell in the project folder and run:

```bash
py -m http.server 8080
```

Then visit `http://localhost:8080` in your browser. For regular use, host the folder on an HTTPS static host such as your own website. No build step is required.

## Access-key rules

- Initial owner key: `356425023663338`.
- New owner and alternate keys must be **8–32 digits**.
- The owner can change the owner key after signing in.
- Alternate keys can be created as view-only or with ledger editing/deletion permission. The owner can toggle that permission or revoke an alternate key. Revocation disables the key while retaining its Auth identity for audit-history integrity.
- The app does not store a plaintext access key in browser storage. The Edge Function hashes keys in PostgreSQL using bcrypt.
- A view-only key can read Expenses, Received and Cash Vault but cannot add, update, or delete records. This rule is enforced by RLS, not only by disabled UI controls.
- The owner role always has full read/write/delete access, even if an old `can_write` flag on that owner row is false. Editable alternate keys have the same ledger CRUD permissions, but cannot manage access keys or change the owner key.

## Expense columns

`Date`, `Supplier`, `TRN#`, `Name`, `Inv#`, `Salik`, `Renewal`, `New Reg`, `RTA Passing`, `Fines`, `Fuel`, `Taxi`, `Metro`, `Parking`, `Wash`, `Rental / FINE RF`, `FD REFUND`, `Lunch`, `Marketing`, `Salary`, `Servicing`, `Drawing`, `Director`, `Heyaza`, `Office Supplies`, `Misc Exp.`, `OTHER`, `Al Insaf`, `Charity`, `VAT`, `Total`, `TYPE`.

`Total` is generated by PostgreSQL from the 25 amount columns, so the saved total is calculated in the database as well as displayed live in the sheet. `TYPE` is restricted to `Cash` or `Bank`.

## Received columns

`Date`, `Name`, `Rent`, `Salik`, `Fines`, `VAT`, `CDW`, `ADD DRI`, `Low Fuel`, `Fine Deposit`, `Waiver`, `Withdraw`, `Sold Cars`, `P.UP / DEL`, `INS EXC.`, `FREEZE`, `TYRE`, `DAMAGE`, `EX KM`, `OTHERS`, `TOTAL`, `TYPE`, `Merchant`.

`TOTAL` is generated by PostgreSQL from the 18 amount columns and also updates live while typing. The `TYPE` dropdown uses `Cash` and `Bank`, matching the Expenses register.

## Cash Vault calculation and denominations

- **Available cash** = `Cash Received - Cash Expenses - SUM(Person Balances)`. Only ledger rows dated on or before the selected as-of date and marked `TYPE = Cash` are included; Bank rows are excluded. Person balances are current signed account values and are applied to the selected cash position regardless of the selected as-of date.
- The balance uses PostgreSQL aggregation via `public.get_cash_vault_summary(date)`, avoiding the browser's row-download limit. The function is `SECURITY INVOKER`; the signed-in user's SELECT privileges and RLS policies still apply.
- **Cash counted** is the physical note/coin count for the selected date. It is calculated only from the 11 quantities entered in the daily denomination table. Signed person balances never change this table and do not require a daily count to be saved. A reconciliation banner shows `Cash Counted - Available Cash`; if the difference is non-zero, both the Available Cash and Cash Counted values are highlighted in red.
- The daily count columns are quantities, not money values: `1000`, `500`, `200`, `100`, `50`, `20`, `10`, `5`, `1`, `0.5`, `0.25`. The row total is the sum of each quantity multiplied by its denomination. The database stores integer quantities and generates `total_cash` itself.
- Only one daily count per date is allowed. To correct a day, edit its existing row. All date counts are shared with authorized users of this Expense Vault workspace.
- **People balances:** Each person has exactly one editable signed amount. Positive amounts are shown in red and reduce Available Cash. Negative amounts are shown in green and increase Available Cash. Zero leaves Available Cash unchanged. The formula is `Cash Received - Cash Expenses - SUM(person cash_adjustment)`. There are no movement dates, Given/Received categories, descriptions, or transaction history in the current side panel.
- Editing a person's amount changes only `cash_people.cash_adjustment`. It does not create, lock, adjust, reverse, or delete a physical denomination-count row. Cash Count remains calculated exclusively from the 11 denomination quantities entered by the user.
- Do not enter the same person adjustment again in Expenses or Received, or the effect will be counted twice. Use the person list only for a signed balance adjustment. The previous `cash_person_transactions` table is retained as historical data and used once to initialize each person's new signed balance during migration 009; the current app no longer reads or writes it.
- Cash-count edits use `updated_at` as an optimistic lock. If another user changes the same count after it was loaded, a stale save is rejected rather than overwriting the newer denomination quantities. Person balance edits do not lock or change a cash-count row.

## Important deployment notes

- The Edge Function is required. PIN login and alternate-key management will not work by hosting the HTML alone. The current access function also matches the `verify_access_key` SQL return shape: that function filters out inactive keys, so the Edge Function does not expect an `is_active` column in its return value.
- Keep the Supabase secret key and `RATE_LIMIT_SALT` exclusively in Supabase Edge Function secrets. Never share them or commit them to source control.
- The provided Supabase project URL and publishable key are public client configuration. Their exposure does not grant database access on their own; the RLS policies and signed-in access record are required.
- For the current previously installed project that already has migrations 001–008, apply only migration 009. No Edge Function redeployment is required because this update does not change the access function.
- After a person-balance RPC reports success, the app treats the database update as committed even if the subsequent screen refresh fails. Refresh the page to load the saved people and Available Cash balances. Cash Count is intentionally unchanged.
- Migration 009 retains all historical person movement rows and backfills each person's new signed balance once using `given - received`. It does not alter any physical-count rows. After the first successful application, rerunning migration 009 will not overwrite balances subsequently edited by the user.
- Test on a non-production Supabase project before using real financial data. This package has been statically checked, but the migration has not been run against your live Supabase project from this environment.
- Future SQL changes should be added as `010_...sql`, `011_...sql`, and so on. Do not edit an already-applied migration; add a new migration for each schema change.
