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
- **Persistent encrypted login:** after you sign in with your access key, refreshing the page (or closing and reopening the tab or browser) takes you straight back into the workspace. The key is only asked for again after you press **Sign out**. The Supabase Auth session JSON is AES-256-GCM encrypted before it is written to localStorage; the AES key is a non-extractable CryptoKey held in IndexedDB. The access PIN itself is never stored in browser storage.
- **Full-window light desktop UI:** the workspace uses the available browser window height and width; the spreadsheet scrolls inside its own frame.
- **Owner permissions:** the active `owner` key has unrestricted read, add, edit and delete permissions for Expenses, Received, Cash Vault counts and signed person balances, plus owner-key and alternate-key management. RLS remains enabled. This is full administrator access inside Expense Vault, not Supabase project-owner or database-superuser access.
- **Spreadsheet selection, copy and paste (Excel style):** with a mouse, click a cell to select it, or drag (or Shift+click / Shift+arrow keys) to select a rectangular block, in the Expenses, Received and Cash Vault tables. `Ctrl+C` (`Cmd+C` on Mac) copies the block as tab-separated text that pastes straight into Excel, Google Sheets or Numbers; `Ctrl+X` copies and clears; `Ctrl+V` pastes a block starting at the top-left selected cell (one copied value fills the whole selection). Click anywhere outside the selected cells, switch tabs, or press `Esc` to clear the selection (using the table scrollbars keeps it). Double-click, `Enter`, `F2`, or simply start typing to edit a cell; `Enter`/`Tab` confirm and move, `Esc` cancels the edit; `Delete` clears the selected free-entry cells. Dragging past the edge of the table scrolls it. Computed total columns are read-only and are recalculated after paste; copied totals are plain numbers. Paste accepts common date formats including ISO and day-first dates (`DD/MM/YYYY`), Excel date serials, and comma-separated AED amounts such as `1,250.50`. On touch-only devices the cells remain ordinary tap-to-edit inputs.

## Latest update (no new migration)

- **Always one empty row:** Expenses and Received keep one empty row at the bottom, dated with the working date. Start typing in it and the next empty row appears. Empty rows are never saved. "Add row" just jumps to the empty row.
- **Automatic saving:** changes save about one second after you stop typing (no more Save buttons on each sheet). The **Save** button next to the date in the top bar saves everything immediately and shows how many changes are waiting. The browser also warns before closing the page with unsaved changes.
- **One look for every button:** all buttons share the same compact, rounded style and the same green theme on every page, including the Staff Balance panel.

## Earlier update (selection sum and working date)

- **Selection sum:** select several cells (Expenses, Received or Cash Vault) and the footer line shows `Sum … · N values` for the numeric cells (amounts and totals; Cash Vault counts and totals).
- **One working date:** the Date box in the top bar (today by default; change or type any date) controls Available Cash, the date of new Expenses / Received rows, new Cash Vault counts and new Staff Balance entries. Dates older than the 3-day edit window are refused with a warning. The Recent dates picker was removed.

## Earlier update (migration 013)

- **Staff Balance entries can be edited or deleted:** open a staff member's history and use the pencil / bin icons on an entry. Only entries from the last 3 days can be changed (older entries show a lock). **Run `sql/migrations/013_staff_entry_edit_delete.sql`.**

## Earlier update (migration 012)

- **Type-ahead:** in Expenses (Supplier, Name) and Received (Name, Merchant), typing completes the text from rows above. Enter/Tab accepts; keep typing or press Backspace to discard. Choosing a Supplier also fills TRN# and Name from its latest row if those cells are empty.
- **Move rows:** press and hold a row (about half a second), then drag it up or down and release. Saved rows keep their new position. Locked (older than 3 days) rows cannot be moved.
- **Run `sql/migrations/012_row_order.sql`** in the Supabase SQL Editor.

## Earlier update (migration 011)

- **Staff Balance** (renamed from People balances): each staff member has an **+ Add** button. Enter a plus or minus amount and an optional note; it is added to / subtracted from the balance. Click a name to see its full history (date, note, amount, balance after). **+ Add New** (top of the panel) creates a staff member.
- **3-day edit window:** entries older than 3 days (today and the 2 previous days stay editable) are locked in Expenses, Received, Cash Vault and Staff Balance, in the app and in the database. Locked rows are greyed and show a warning when you try to edit or delete them. To change the number of days, edit `EDIT_WINDOW_DAYS` in `js/app.js` and `app_edit_window_start()` in migration 011.
- **Run `sql/migrations/011_staff_balance_transactions_and_edit_window.sql`** in the Supabase SQL Editor.

## Earlier update (migration 010)

- **Expenses fit the window:** all 32 columns are sized as percentages, with smaller text, so no horizontal scrolling is needed on normal desktop widths.
- **New rows go to the bottom:** Expenses, Received and Cash Vault list oldest first; Add row / Add day appends at the bottom and opens it for typing, like Excel.
- **Clear cell selection:** the active cell has a blue frame and fill, the cell being typed in has a bold green frame, and its row and column heading are highlighted.
- **Cash Vault table:** column titles are bold; cell numbers are regular.
- **Dated people balances:** every balance now has a date. The balance on a date is the latest entry on or before it. Changing today's figure leaves earlier dates unchanged; edit an earlier date's entry to change that date. **Run `sql/migrations/010_dated_person_balances.sql` in the Supabase SQL Editor before using the updated app.**

## Project structure

```text
expense_vault_project/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── spreadsheet-grid.js
│   └── secure-session-storage.js
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
│       ├── 009_signed_person_balances.sql
│       ├── 010_dated_person_balances.sql
│       ├── 011_staff_balance_transactions_and_edit_window.sql
│       ├── 012_row_order.sql
│       └── 013_staff_entry_edit_delete.sql
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

**For the already-running project described in this package:** migrations 001–009 have already been applied. This update (refresh-login fix and spreadsheet selection fix) is a front-end-only change: do not run any SQL migration and do not redeploy the Edge Function. Replace the complete static project files with this package and refresh with `Ctrl+F5`. You will need to enter your access key once after installing this update; after that, refreshing keeps you signed in until you press **Sign out**.

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
- The app never stores the plaintext access PIN in browser storage. The Edge Function verifies the PIN against a bcrypt hash in PostgreSQL. Supabase's access/refresh session tokens are encrypted with AES-256-GCM before being stored in localStorage; only the ciphertext envelope is visible there. A non-extractable CryptoKey is stored in IndexedDB, and a login marker (cookie mirrored in localStorage) gates decryption/restoration until you sign out.
- A view-only key can read Expenses, Received and Cash Vault but cannot add, update, or delete records. This rule is enforced by RLS, not only by disabled UI controls.
- The owner role always has full read/write/delete access, even if an old `can_write` flag on that owner row is false. Editable alternate keys have the same ledger CRUD permissions, but cannot manage access keys or change the owner key.

### Login persistence (refresh fix)

- **Cause of the earlier "asks for the key on every refresh" problem:** `js/app.js` called a function (`resetCashMovementForm`) that no longer exists. That raised a `ReferenceError` while the page was starting up, so the code that restores the saved login never ran. That call has been removed, and the whole project was checked for any other undefined names.
- On startup the app now restores the saved encrypted session *before* showing the key form (the form is hidden for a moment, so it does not flash), then goes straight to the Cash Vault tab.
- The login marker that unlocks the encrypted session is a long-lived cookie (180 days) mirrored in localStorage, so a browser that drops the cookie does not log you out. It is removed only by **Sign out** (or when the server confirms the session is no longer valid, for example the key was revoked).
- A temporary problem while restoring (for example being offline) does not discard the saved session; refresh to try again.
- Always reopen the app at the same exact origin (same protocol, hostname and port). For local testing, consistently use `http://localhost:8080` rather than alternating between `localhost`, `127.0.0.1`, or another port. Browser storage and cookies are origin/host scoped.

### Browser session storage and security

- The authentication session is stored as an AES-256-GCM encrypted envelope in localStorage; the plaintext PIN and plaintext Supabase access/refresh tokens are not stored there. A non-extractable AES-256-GCM CryptoKey is kept in IndexedDB, and the login marker is bound into the encryption.
- **Sign out** removes the marker and the encrypted session immediately. If you use a shared or public computer, always sign out.
- The stored CryptoKey is non-extractable, but no browser-side encryption can protect against malicious scripts running on the same origin (for example, an XSS vulnerability) or a compromised browser/extension. Keep the app hosted over HTTPS, maintain strong Content Security Policy and XSS protections, and do not install untrusted scripts on the site.
- On first launch the app removes this project's legacy default Supabase Auth key (`sb-hmtbalmgpyrnxbifnvzg-auth-token`) from localStorage/sessionStorage so an older plaintext session blob is not left behind. It does not remove other application data. If IndexedDB or Web Crypto are blocked, the app keeps the session in memory only and displays a warning instead of falling back to plaintext storage.

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
- This update does not change the database schema or Edge Function. No SQL migration or Edge Function redeployment is required; replace the full static project files and refresh with `Ctrl+F5`.
- After a person-balance RPC reports success, the app treats the database update as committed even if the subsequent screen refresh fails. Refresh the page to load the saved people and Available Cash balances. Cash Count is intentionally unchanged.
- Migration 009 retains all historical person movement rows and backfills each person's new signed balance once using `given - received`. It does not alter any physical-count rows. After the first successful application, rerunning migration 009 will not overwrite balances subsequently edited by the user.
- Test on a non-production Supabase project before using real financial data. This package has been statically checked, but the migration has not been run against your live Supabase project from this environment.
- Future SQL changes should be added as `010_...sql`, `011_...sql`, and so on. Do not edit an already-applied migration; add a new migration for each schema change.
