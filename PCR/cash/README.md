# Expense Vault

A single-page, Excel-style expense register using Supabase. The project is split into separate HTML, CSS, JavaScript, SQL migration, and Edge Function files.

## Included

- **Cash Vault, Expenses, Received** tabs. Cash Vault is the default tab after every successful sign-in. All three sections are functional.
- **Expenses register:** the exact 32 visible columns requested, inline cell editing, today's date by default, date suggestions for today and the previous five days, manual date selection, Cash/Bank type selector, and an automatically calculated row total. Amount columns have been narrowed and each sheet scrolls inside its own frame so the page itself does not expand horizontally.
- **Received register:** the exact 23 visible columns requested, inline cell editing, today's date by default, date suggestions for today and the previous five days, manual date selection, Cash/Bank type selector, a Merchant text column, and an automatically calculated row total.
- **Cash Vault:** Available Cash is Cash-type Received minus Cash-type Expenses minus the total of all signed people balances. Bank entries are excluded. The denomination register stores one daily count per date for 1,000, 500, 200, 100, 50, 20, 10, 5, 1, 0.50 and 0.25 notes/coins. The app compares Available Cash with Cash Counted and highlights both values in red when they differ.
- **People balances:** add a person's name and enter one signed AED amount. A positive amount (for example `+1,000`) means cash is with that person and reduces Available Cash; it is displayed in red. A negative amount (for example `-500`) increases Available Cash; it is displayed in green. Edit the person's name or amount at any time. The people balances never change the physical note/coin quantities. There are no separate Given/Received movement types or transaction-history list in the current workflow.
- **Automatic saving:** there is no Save button. Every change is kept on this device instantly and written to the database in the background about half a second after you stop typing. New and existing records are inserted/updated individually; no existing tables are dropped or replaced.
- **Owner access key:** the first key is seeded in the database migration as a salted bcrypt hash. The Auth account is provisioned on the first successful sign-in.
- **Alternate keys:** the owner can create view-only or editable alternate keys, change their permission, and revoke them.
- **RLS:** all financial tables have row-level security policies. The public browser key cannot read the access-key table or bypass ledger permissions. People balances are written only through a permission-checked SECURITY DEFINER RPC. It updates the one signed balance on the selected person; it never writes to `cash_vault_counts`. The cash balance RPC is SECURITY INVOKER, so the caller's SELECT grants and RLS policies still apply.
- **Persistent encrypted login:** after you sign in with your access key, refreshing the page (or closing and reopening the tab or browser) takes you straight back into the workspace. The key is only asked for again after you press **Sign out**. The Supabase Auth session JSON is AES-256-GCM encrypted before it is written to localStorage; the AES key is a non-extractable CryptoKey held in IndexedDB. The access PIN itself is never stored in browser storage.
- **Full-window light desktop UI:** the workspace uses the available browser window height and width; the spreadsheet scrolls inside its own frame.
- **Owner permissions:** the active `owner` key has unrestricted read, add, edit and delete permissions for Expenses, Received, Cash Vault counts and signed person balances, plus owner-key and alternate-key management. RLS remains enabled. This is full administrator access inside Expense Vault, not Supabase project-owner or database-superuser access.
- **Spreadsheet selection, copy and paste (Excel style):** with a mouse, click a cell to select it, or drag (or Shift+click / Shift+arrow keys) to select a rectangular block, in the Expenses, Received and Cash Vault tables. `Ctrl+C` (`Cmd+C` on Mac) copies the block as tab-separated text that pastes straight into Excel, Google Sheets or Numbers; `Ctrl+X` copies and clears; `Ctrl+V` pastes a block starting at the top-left selected cell (one copied value fills the whole selection). Click anywhere outside the selected cells, switch tabs, or press `Esc` to clear the selection (using the table scrollbars keeps it). Double-click, `Enter`, `F2`, or simply start typing to edit a cell; `Enter`/`Tab` confirm and move, `Esc` cancels the edit; `Delete` clears the selected free-entry cells. Dragging past the edge of the table scrolls it. Computed total columns are read-only and are recalculated after paste; copied totals are plain numbers. Paste accepts common date formats including ISO and day-first dates (`DD/MM/YYYY`), Excel date serials, and comma-separated AED amounts such as `1,250.50`. On touch-only devices the cells remain ordinary tap-to-edit inputs.

## Latest update: Import → daily collections + smoother arrow keys (no new migration)

**No SQL to run.** Nothing in the database changes; existing rows are untouched.

### One "⇪ Import" button
The Expenses button is now just **Import**, and Received has one too. Drop any mix of files; each file's type is detected:

| File | Goes to |
|---|---|
| RTA vehicle renewal receipt PDF | Expenses (works exactly as before) |
| Caryaati daily report (Excel) | Received: the entries are made from this file |
| Payment-link provider report (.xls/.xlsx/.csv) | Matching only: identifies link payments |
| Bank merchant (POS) report PDF | Matching only: checks the card-machine total |

If RTA receipts and collections are loaded together, the panel shows two tabs.

### Collections → Received
* One Received entry per customer payment (vouchers paid together are combined), dated with the Caryaati voucher date.
  * Name = customer.
  * Merchant = `CN <contract> · Link/POS ****<card> or Transfer <ref> · RCV-… numbers`.
  * The amounts go into the matching columns (Rent, VAT, Salik, Fines, CDW, …). Anything unrecognised goes to OTHERS.
* **Cash postings are skipped**, because cash is entered by hand.
* Each entry gets a **channel**:
  * **Link**: identified from the payment-link report by contract number, then card's last 4 digits, then amount.
  * **Card**: matched to a bank POS transaction by card digits and amount.
  * **Bank transfer.**
* You choose which Received TYPE each channel uses; the choice is remembered. The owner can create a "Link" type in one click. A type that isn't yet enabled for Received is enabled automatically.
* Re-importing the same day is safe: vouchers already in Received (by RCV number) are greyed out.
* Entries dated outside the edit window can be put on the working date instead.

### Matching section
* Payment link: Caryaati vs link report.
* Card machine: Caryaati vs bank POS (voided sale/reversal pairs are ignored).
* Total non-cash, with any differences highlighted.
* Cash in Caryaati compared with cash already entered in Received for that date.
* Link and POS fees, and the expected net card settlement.
* Date warnings, and a "needs attention" list: link/POS payments not found in Caryaati, Caryaati card postings not found in either report, unknown payment methods.
* Filters: All / Link / Card / Bank / Issues. Tick or untick any entry.
* **⬇ Reconciliation (Excel)** downloads Summary, Entries, Bank POS and Payment link sheets.
* The last reconciliation is kept and can be reopened from the Import panel ("View last reconciliation").

### Arrow keys
Holding an arrow key in Expenses / Received now moves the selection without the small lag:
* The copy buffer is updated after you stop moving.
* Rows are re-rendered only when the selection leaves the drawn area.

## Earlier update: settings panel, users & access, payment types, change type

**Three steps to install, in this order. No existing data is changed.**

1. **Run the SQL migration**: open Supabase → SQL Editor, paste the whole of `sql/migrations/014_users_profiles_payment_types.sql` and run it once (it is safe to run again).
2. **Redeploy the access Edge Function**:
   `npx --yes supabase@latest functions deploy access --project-ref hmtbalmgpyrnxbifnvzg --use-api`
3. **Replace the website files** and refresh once with `Ctrl+F5`.

The new website keeps working if step 1 or 2 hasn't been done yet (Cash/Bank only, old key behaviour); the new options appear once both are done.

### User menu and side panels
The *Access keys* and *Sign out* buttons are replaced by your **name and photo** in the top bar. Its menu has: **Settings**, **Name & photo**, **Password**, **Payment types** (owner), **Users & access** (owner) and **Sign out**. Every view opens in the same right-hand side panel. Staff Balance, Import RTA receipts and Change type use the same panel with the same size and design (`--panel-width` in `css/styles.css`, 480 px).

- **Name & photo**: set a display name; upload a photo and **drag to move / zoom** to choose the look before saving. Photos are stored as a small 256×256 image (about 5–30 KB).
- **Password**: every user can change their own access key (current key required).

### Users & access (owner)
- **New user**: name, access key, and for each section (**Cash Vault** incl. Staff Balance, **Expenses**, **Received**): *No access*, *View* or *Edit*. Plus *Can download the Excel file* and *Can import RTA receipts* (needs Expenses: Edit).
- **Edit** a user: change the name or access, or set a new key for them.
- **Disable / Enable**: a disabled user is signed out and can't sign in until enabled again.
- **Delete**: removes the key permanently. Entries the user created are kept (their sign-in account is deleted, or permanently blocked if their entries still refer to it).
- The database enforces the access (row-level security), not just the screen: a user without access to a section cannot read or change it at all. Existing keys keep exactly what they had: editor keys → Edit everywhere, view-only keys → View everywhere.

### Payment types (owner)
Cash and Bank are built in. **Card, Credit Card, Debit Card and Travel Card** are already added (unticked); tick them to use them, or add your own (e.g. Cheque).
- Tick **Expenses** and/or **Received** to choose where a type appears in the TYPE column. Unticking only hides it from the list; rows already using it keep it.
- **Counts as cash**: only these types change Available Cash. By default only Cash does, exactly as before; Cash always counts as cash.
- A type that is used by any entry can't be deleted (untick it instead); Cash and Bank can't be deleted.
- The import screen offers every type enabled for Expenses.

### Change type of many rows at once
**Expenses / Received → ⇄ Change type**
1. **Rows**: either the rows you selected in the sheet (click a cell in the first row, then Shift+click / Shift+↓ to the last, or drag), or **all rows of a date**. Optionally only rows that are currently a given type (e.g. only Bank).
2. **New type**: pick it. The panel shows how many rows change, which are skipped (older than the edit window, already that type, empty), and the exact effect on Available Cash, before you confirm.
3. Saved rows are updated together, one database request per 300 rows (101 rows in about a second). If anything fails, the rows are saved one by one automatically. Rows older than the 3-day edit window stay locked, as always.

Example: you imported receipts as **Bank** but they were paid by card → Change type → *All rows dated 26/11/2026*, *only rows that are currently Bank* → **Card**.

## Earlier update: Import RTA receipts (no new migration)

Front-end only. **No SQL to run and no Edge Function redeploy.** Replace the static files (including the new `js/vendor/pdfjs/` folder) and refresh once with `Ctrl+F5`.

**Expenses → ⇪ Import RTA receipts** reads the *Receipt for Vehicle Renewal* PDFs downloaded from the RTA portal (one or many files at once, by choosing or dragging them in) and adds them as expense entries.

1. **Reading.** Every receipt in every file is read, including receipts that continue onto a second page. The fee lines must add up exactly to the printed *Total Amount*; a receipt that doesn't is shown as *Cannot read* and is not imported. Files that are not RTA receipts are rejected.
2. **Paid by Cash or Bank: required.** Nothing can be added until you choose. *Cash* entries reduce Available Cash. *Bank* entries are recorded only; they never affect the cash figures. The receipts' own payment method (e.g. Credit Card) is shown as a hint.
3. **Preview.** You see each receipt (date, renewal, fines, total, status) and every entry that will be created before anything is added. Receipts can be unticked.
4. **Add.** Entries are added to the bottom of Expenses (above the empty row) dated with the receipt's **Payment Date**, and save automatically like typed rows.

**Where amounts go**

| Receipt line | Expenses column |
|---|---|
| Light vehicle register, Issue Vehicle Registration Card, Vehicle Renewal Fee, Renewal Light Vehicle Private, Delivery Fee | **Renewal** |
| Every fine (RTA Parking, Bus Lane, Dubai Police violations, Abu Dhabi Police, Abu Dhabi DoT, Sharjah Police, Sharjah Municipality, Ajman Police, …) | **Fines** |
| Knowledge & Innovation fees (AED 20 per Dubai item) | Added to the item it was charged for: the renewal's AED 20 to **Renewal**, each Dubai fine's AED 20 to that fine in **Fines**. Fines from other emirates carry none. |
| Vehicle test / inspection fees (if ever present) | **RTA Passing** |
| Anything else | **Misc Exp.** (flagged in the preview first) |

**Entry layout** (choose in the dialog):
- *Renewal + each fine on its own row* (default). Renewal row: Supplier `RTA Renewal`, Inv# = Receipt No. Fine rows: Supplier = issuing authority (Dubai Police rows also name the violation, e.g. `Dubai Police · Speeding +30 km/h`), Inv# = the fine number, or the Receipt No for Dubai Police fines (they have no fine number on the receipt).
- *One row per receipt*. Supplier `RTA`, Inv# = Receipt No, amounts split across Renewal and Fines.

Either way, a receipt's entries add up exactly to its printed total. The *Name* column can optionally be filled for all imported rows; TRN# stays `---`.

**Safety**
- **No double imports.** A receipt whose Receipt No or any of its fine numbers is already in Expenses is shown as *Already imported* and unticked. The same receipt appearing twice in one upload is imported once.
- **Edit window.** Receipts paid before the 3-day edit window can't be saved on their own date (the database enforces this). They are shown as *Too old*; you can choose to enter them on the working date instead.
- Existing rows are never changed; the import only adds new rows.
- **Plate numbers are not printed on RTA renewal receipts** (the QR code only links to the RTA website), so the Receipt No and fine numbers are used as references.
- The PDFs are read entirely in the browser (PDF.js, bundled in `js/vendor/pdfjs/`) and are not uploaded anywhere.

## Earlier update: speed and instant saving (no new migration)

Front-end only. **Do not run any SQL migration and do not redeploy the Edge Function.** Replace the static files and refresh once with `Ctrl+F5`. Existing data is not touched.

- **Save button removed; everything saves straight away.** Each edit is stored on this device immediately and saved to the database in the background ~0.5 s after you stop typing. The pill in the top bar shows *Saving…*, *All changes saved*, or *Not saved yet · retrying* / *Offline* if the connection drops. In that case the changes stay on this device and are retried automatically (2 s, 5 s, 15 s, 30 s, then every minute), and on the next visit if the page is closed. The browser warns before closing while a save is still in progress.
- **Cash Vault difference is now real-time and always correct.** Cash Counted and the difference update on every keystroke, with no save needed. Available Cash also changes the instant you type in Expenses or Received. **Cause of the old wrong-difference bug:** Available Cash was calculated only from what had already reached the database, but edits were synced only every 5 minutes, so the figure was stale until a refresh. Available Cash is now the database summary plus every local change, calculated in whole fils so rounding never causes a false difference. Database writes and summary queries run one after another, so a change is never counted twice or missed.
- **Much faster sheets.** Only the rows on screen are drawn (about 40), however many records exist. Locked rows (older than the edit window) are drawn as plain text instead of disabled inputs. Measured with 6,000 rows: Expenses ready in 0.5 s (was 3.6 s), tab switch ~0.15 s (was ~4 s), moving between cells ~6× faster.
- **All rows load.** Supabase returns at most 1,000 rows per request, and the sheets previously loaded only the first 1,000 (oldest) rows. All pages are now loaded in parallel. The Excel export uses the same loader and saves any pending changes first.
- **Background loading:** Expenses and Received load right after sign-in, so the first visit to those tabs is instant.
- **Lighter requests:** the encrypted login session is decrypted once per page instead of before every database request (it is still stored encrypted; another tab's refresh is picked up automatically).
- Copy, selection sums and Delete/Ctrl+X clearing work from the data itself, so they include rows scrolled out of view.

## Earlier update (blank rows and autosave)

- **Always one empty row:** Expenses and Received keep one empty row at the bottom, dated with the working date. Start typing in it and the next empty row appears. Empty rows are never saved. "Add row" just jumps to the empty row.
- **Automatic saving:** changes save about one second after you stop typing (no more Save buttons on each sheet). *(Superseded: see the latest update. The top Save button has also been removed.)*
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
│   ├── virtual-sheet.js
│   ├── rta-receipt-parser.js
│   ├── receipt-import.js    (Import panel: file detection + RTA receipts)
│   ├── daily-reports.js     (Caryaati / payment-link / bank POS readers + matching)
│   ├── collections-import.js (Import → Received collections and reconciliation)
│   ├── account-panel.js     (user menu, settings, users & access, payment types)
│   ├── vendor/pdfjs/        (PDF.js 4.10.38, Apache-2.0; loaded only when importing)
│   ├── vendor/sheetjs/      (SheetJS 0.18.5, Apache-2.0; reads Excel files, writes exports)
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
│       ├── 013_staff_entry_edit_delete.sql
│       └── 014_users_profiles_payment_types.sql
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
