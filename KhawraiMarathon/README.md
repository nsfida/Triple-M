# Khawrai Marathon Race - Season Three

Static website (no build step) + Supabase backend. The interface uses a refreshed light theme with responsive public, registration, and admin layouts; no frontend build step is required.

| File | Purpose |
|---|---|
| `index.html` | Official home page with key race details, quick links, prize information, Season Two photos and live registration-deadline banner (`/`) |
| `participants/index.html` | Public runner directory, clickable player detail overlay, and admin-only player-list PDF exports (`/participants/`) |
| `results/index.html` | Public live race status, official leaderboard, podium prizes, and results PDF download (`/results/`) |
| `about/index.html` | Detailed race story, Season One to Three timeline, invited communities, Season Two gallery and organiser contacts (`/about/`) |
| `register/index.html` | Public registration page - the official Player Registration Form, with no fee or payment information (`/register/`) |
| `admin/index.html` | Admin sign-in, registrations, cancellation, registration confirmation, owner-only project funds (receiving and expense ledgers), race control and PDF reports (`/admin/`) |
| `sql/schema.sql` | Tables, Row Level Security, storage buckets and policies |
| `sql/verify_marathon_results.sql` | Verifies result tables, RLS, blocked direct writes, and Realtime publication |
| `sql/migrations/` | **Safe, re-runnable migrations. Run new files here in date order.** Migrations are additive and avoid destructive data changes. |
| `js/common.js`, `js/admin-tools.js`, `js/admin-race.js`, `js/results.js` | Shared login, registration tools, secure race administration, and the public live leaderboard |
| `sql/add_funds.sql` | Project funds only - run it if you installed before funds existed |
| `sql/add_device_location.sql` | One registration per device, location, original images - run it if you installed before this update |
| `sql/create_admin_users.sql` | Creates the two admin logins |
| `assets/` | Shared styles, homepage styling, About/results page styling, logos and the original form artwork used for the PDFs |
| `images/` | Season Two race photographs used in the About gallery (credited to Sagar Studio) |
| `js/config.js` | Supabase URL / anon key, logo URL, admin usernames |

## Setup (about 5 minutes)
1. Supabase dashboard > **SQL Editor**: run `sql/schema.sql`, then each forward migration in `sql/migrations/` in date order, then `sql/create_admin_users.sql` (delete that file afterwards because it holds passwords). Ensure `20261026_003_public_player_details.sql` follows `20261026_002_local_first_zero_payment.sql`, then run migrations `20261027_004_cancellations_expenses.sql`, `20261028_005_registration_deadline.sql`, `20261028_006_marathon_results.sql`, and `20261029_007_registration_number_only_results.sql`. Migration 005 enforces the 05 November 2026, 11:59 PM Pakistan Standard Time public registration cutoff. `sql/verify_migration_003.sql` checks the earlier public-details migration.
   **Existing install:** run only migrations that have not already been applied. Run migration 007 after migration 006. It replaces the public results view and admin result-write RPC to use registration numbers exclusively. Existing result rows, registrations, times, and statuses are preserved. Any non-null historical bib values are copied to a private archive table with client access revoked, then the unused bib column is removed from the live results table. Run `sql/verify_marathon_results.sql` after migration 007.
2. **Authentication > Sign In / Providers**: turn **off** "Allow new users to sign up".
3. Upload the whole folder to any static host (Netlify, Vercel, GitHub Pages, cPanel). Opening via `https://` is required for camera/photo upload on phones.
4. Share `/register/` with participants; keep `/admin/` for the organisers. The root URL `/` serves the official home page directly, without redirecting visitors to the participants list.

## Who can do what (enforced by the database, not just the screens)
| | Public | waseemfida | nsfida |
|---|---|---|---|
| See name, age, photo, status, gender and registered address | yes | yes | yes |
| Register (insert) | yes, always saved as *Pending* | - | - |
| See CNIC, mobile, email and private documents | no | yes | yes |
| Download filled registration PDFs | no | yes | yes |
| View live official results and prize standings | yes | yes | yes |
| Change race status, runner status and finish times | no | yes | yes |
| Download official results PDF | yes | yes | yes |
| Project Funds (receiving and expenses) | **no** | only if nsfida allows | yes |
| Edit / confirm / cancel / delete a registration | no | only if nsfida allows (defaults: waseemfida can) | yes |

## Project funds (permission-controlled)
- **Project Funds are hidden from the public and from every admin unless nsfida allows it** (see "Per-admin permissions" at the end of this file). There is no public funds view any more. The database enforces every right, not only the screens.
- Confirming a registration needs the *Edit registrations* right; entering an amount while confirming also needs *Make funds entries*.
- Project Funds now has two ledgers: **Receiving** (the existing contributions and registration-fee flow) and **Expenses** (expense date, category, description, payee, payment method, amount and optional receipt/reference).
- Both ledgers support adding, editing and deleting entries for nsfida and for admins allowed to, on `/admin/` (Project funds tab) and on `/participants/#funds`.
- Receiving and spending are independent ledgers. Expenses can be recorded even when they exceed collections; the net balance is total received minus total expenses and may be negative. The summary keeps the two totals separate and shows that signed net balance, plus donation and entry-fee subtotals.
- **Receiving PDF**, **Expenses PDF**, and **Full statement PDF** are available to every admin allowed to view funds, from the admin control centre and the participants page. The combined statement includes separate totals, a dated ledger with running balance, and a clearly labeled ending balance that displays a minus sign when expenses exceed receipts.
- When nsfida confirms a registration with an amount above zero, a linked entry row is created; **Mark pending** by nsfida removes that linked row. The amount now defaults to 0 because the registration form no longer mentions any fee. Expense records are stored in a separate `expenses` table and do not alter the existing `funds` data.

## One registration per device, location, original images
- Each browser gets a random device ID stored in three places (local storage, cookie, IndexedDB). The server stores it with a unique rule, so a second registration from the same device is refused, and the form checks this before the person starts.
- The form needs consent, then the browser's location permission, before it can be submitted. The latitude, longitude and accuracy are saved and the admin gets an "Open location in Google Maps" link.
- A web page cannot read a phone's hardware ID. Clearing site data, private mode or a different browser gives a new device ID. A browser fingerprint is saved as well, and the admin sees a warning when two registrations share one.
- Original photo, CNIC front and CNIC back are stored untouched (private, up to 25 MB each). Admin > **Files** has download links and **Download all 3**. Older registrations only have the standard-quality copy.

## Admin features (migration 20261024_001)
- **Unlimited entries for admins.** While signed in, the one-per-device rule and public location step are skipped, and **Add another registration** is available after each save. Public visitors keep the one-per-device rule. Admin rows are tagged `entered_by`. The CNIC must still be unique (it identifies a person).
- **Login saved locally.** One session is stored in this browser's local storage and shared by `/participants/`, `/register/` and `/admin/`, so a refresh never signs you out. Sign out only ends it on this device.
- **Admin-only player-list PDFs.** From the public runner directory, signed-in admins can download All, Confirmed, Pending, or Cancelled player lists. Each landscape PDF includes the player photo, registration number, name, age, gender, public address and status; private contact details and identity documents are excluded. The branded title/logo appears on the first page, and the table is paginated to avoid overflow.
- **Clickable player details.** Public visitors can open each runner card to view the name, age, gender and registered address. Signed-in admins get the secure full-detail overlay with edit, payment confirmation, registration PDF, photo/CNIC front/back downloads and other document links. The three-dot menu remains available for quick actions; the Admin registrations table consolidates each runner's PDF, files, edit, payment/status, cancel/restore and delete actions into one floating dropdown. Donations in the funds tab have edit/delete too.
- **Reliable registration PDFs on clean routes.** The PDF builder and registration-form template resolve relative to their script files, so downloads work from nested routes such as `/admin/` and `/participants/`. jsPDF loading also has a fallback CDN.
- **Project funds tab (only for allowed admins).** Signed in as nsfida or an admin allowed to view funds, `/participants/` shows *Runners* and *Project funds* tabs (`/participants/#funds` opens the funds tab). Everyone else sees only the runner directory.
- **Reversible cancellation.** Admins can cancel or restore a runner without deleting the registration or changing its payment status. Cancelled runners remain in the public *All* list with clear red crossing lines; existing receiving records are preserved.

## Registration deadline (migration 20261028_005)
- The public registration deadline is **05 November 2026 at 11:59 PM Pakistan Standard Time (UTC+05:00)**. The shared `js/registration-ui.js` component shows the same second-by-second countdown and right-to-left announcement strip on Participants, Results, About, Register and Admin routes. After the cutoff, all public registration links are replaced by **Registration Ends**, and the direct registration page displays a closed state. Verified admins retain their post-deadline registration path.
- Deadline enforcement is server-side: PostgreSQL rejects new non-admin registration RPC calls and storage uploads after the cutoff. Only the two verified admin JWT emails can continue creating registrations after the deadline. Changing page HTML, JavaScript, or browser time does not bypass the database check. Existing registrations and funds are not rewritten.

## Fast loading and local-first saving
- Public participant/fund data is cached in local storage and drawn before a fresh background refresh. Admin list caches use session storage because they include private contact fields.
- Registration form fields autosave as a local draft. On submit, the form and attached file blobs are committed to IndexedDB first, then uploaded and submitted to Supabase. If offline or interrupted, the queue retries when the connection returns or the registration page is reopened. A local queued entry is clearly labeled **Sync pending** and is not considered an official registration until the server returns a registration number.
- Admin confirmations, edits, and donation entries are written to a small local outbox before the database request. The UI updates immediately and the outbox retries while online or when an admin page is reopened. Keep the same browser profile and do not clear site data until pending syncs finish.
- The page headers and loading screens use the original Khawrai Unity brand mark from `https://triplem.vip/KhawraiUnity/logo.png`; each logo links to the home page. A shared profile menu includes account navigation, sign-out, password changes and a browser-local admin profile picture. Runner photography is used as a low-contrast part of the shared visual theme.

## Public player detail migration
- `20261026_003_public_player_details.sql` replaces the participant view in-place while preserving its existing columns and adding `gender`, `address` and `district_tehsil` at the end. It does not alter or delete rows. Because the requested public player overlay displays the registered address, that address becomes visible to public visitors; CNIC, mobile, email and location coordinates remain excluded. To verify the migration actually exists in the live database, run `sql/verify_migration_003.sql` in Supabase SQL Editor and confirm it returns `PASS`. A local ZIP cannot apply a migration to Supabase by itself.

## Cancellation and expenses migration
- Run `sql/migrations/20261027_004_cancellations_expenses.sql` in the Supabase SQL Editor after your previously applied migrations.
- The migration adds `is_cancelled`, `cancelled_at` and `cancelled_by` to registrations, creates the independent `expenses` ledger and its admin-only write policies, and adds a public read-only expenses view. It does not delete registration rows, update their payment status, or modify existing receiving records.
- The migration file is safe to re-run. For new installations, `sql/schema.sql` and the public-details migration include compatible definitions; still run forward migrations in date order as listed in Setup.

## Notes
- Logins: usernames map to `<username>@khawrai.app` in Supabase Auth.
- Names in the PDF use a standard font, so English letters only (the form says so).
- Display copies of player photos are optimized to a maximum 1600 px and high-quality JPEG; CNIC/document working copies use up to 2400 px. Upload size targets remain below the 3 MB bucket limit. Exact source files are preserved privately for admin retrieval; the public participant list uses only optimized player-photo copies and loads up to 1000 runners.

## About Khawrai Marathon Race
- `/about/` is linked from the header on all public and admin pages. It describes the first two Khawrai Village editions, Season Three on **15 November 2026**, the expanded invitation to Dargai, Petao, Kati Miana, New Khawrai, Jehangira, Shaidu, Khairabad and surrounding villages, plus the Season Three management and organisation roles.
- Season Three is managed by **Waseem Shahzad Fida** and organised by **District Sports Office Nowshera, Directorate General of Sports, Government of Khyber Pakhtunkhwa**. Contact: **+92 333 9095878**.
- The Season Two photographs in `images/image1.jpg`, `images/image2.jpg` and `images/image3.jpg` are credited to **Sagar Studio**.


## Marathon results and race control (migrations 20261028_006 and 20261029_007)
- Race date is fixed to **15 November 2026 at 04:00 PM Pakistan Time (UTC+05:00)**. Each runner is identified only by their official registration number. The later migration archives non-null historical bib values in a private table and removes the legacy column from the live results table and public view. The public `/results/` board shows scheduled/in-progress/completed state, a countdown, current leaderboard, podium and prize details, with branded PDF download.
- Only the verified admin accounts can change race state, public announcements, runner status or finish times. Result writes use SECURITY DEFINER RPCs that check the authenticated JWT email; direct table writes are revoked for all client roles.
- Public visitors can only read the public-safe race control and results fields; direct result writes are revoked from all client roles. The results view does not expose CNIC, phone, email, address or private documents. Only confirmed, non-cancelled runners may be saved to official results.
- Positions are automatically recomputed from ascending finish times. First prize is **Rs. 15,000 + Winning Trophy**, second prize **Rs. 10,000 + Trophy**, and third prize **Rs. 5,000 + Trophy**. Finish times use `HH:MM:SS`.
- Supabase Realtime updates the public board without a manual refresh; a 15-second background polling fallback is enabled. Run migrations 006 and 007 in Supabase SQL Editor after migrations 001 through 005, then execute `sql/verify_marathon_results.sql` to check the access boundaries and Realtime publication. ZIP deployment by itself does not apply database migrations.


### Pretty routes and race-roster controls

- Public pages are served from `/`, `/participants/`, `/results/`, `/about/`, `/register/`, and `/admin/`. The root URL `/` serves the dedicated home page and does not redirect to the participants page. Route folders provide clean URLs such as `/results/` and `/about/`. `.htaccess` redirects legacy `.html` links and direct route-folder `index.html` requests on Apache-compatible hosting. Keep each route-folder `index.html` together with its assets when deploying.
- The Race Results admin roster lists every confirmed, non-cancelled runner sorted by registration number by default. Search by player name or registration number, filter by result status, sort by name/finish time/current position/recent update, and jump to the next runner awaiting an entry. The old summary/count tiles and CSV export control have been removed from the workspace. Each runner row has an action dropdown for editing details, marking statuses, recording a finish time, or removing an existing result. All changes call authenticated database RPC functions; the public `/results/` page remains read-only.
- Custom player/ledger kebab menus are rendered in a fixed body-level layer so table overflow and stacking contexts do not clip or cover their menu items. Primary navigation remains visible on mobile.


## Image optimization and player-photo replacement

New registration uploads now generate optimized JPEG copies for the public player photo and the private working copies of CNIC front/back images. Player photos are capped at 1600 pixels on the longest side and CNIC/document images at 2400 pixels, using high JPEG quality with adaptive size reduction to stay below the Storage upload limit. The exact uploaded player photo and CNIC front/back files are retained in the private `originals` bucket, so administrators can still retrieve the original without re-encoding loss. Only the optimized player photo is served from the public `photos` bucket; originals and identity documents remain private.

Administrators can replace a runner's photo from **Admin Panel → Runner registrations → Edit** (and from the participant list when signed in as an administrator). The replacement is uploaded under a new versioned path, the database is updated using the existing admin-only registration RLS, then the previous public photo and private original are deleted. If Storage temporarily refuses cleanup, the old object paths are queued locally for retry when an admin page comes online. Photo replacement requires an active internet connection; ordinary field edits retain the existing offline queue behavior. No SQL migration is required because the project already contains `photo_path` and `photo_original_path` columns and administrator-only update/delete policies.


## Results management, live positions, finalization, and secondary admins (migration 008)

The organiser-only results workspace is available at `/results/manage/`; the public `/results/` page remains a public read-only board. The **Manage Results** navigation link appears only after a verified, active admin session with Results permission. Database RPCs repeat the permission checks, so hiding a link is not the access boundary.

Run `sql/migrations/20261029_008_admin_results_permissions_and_finalization.sql` in the Supabase SQL Editor **after** migration 007. This new, transactional migration adds current on-course positions and official-finalization fields, creates feature-scoped admin permission records, updates admin-only policies/RPC checks, and rebuilds the explicitly public results view. It does not rewrite previous migration files or registration/funds rows. Back up the database first and inspect the SQL before production execution. Then run `sql/verify_marathon_results.sql` after updating that verification script for migration 008, and confirm the view stays publicly readable while client writes remain denied.

Only `nsfida@khawrai.app` can create additional admin auth users or change their assigned feature flags. The `supabase/functions/admin-account/` Edge Function creates each Auth user and its feature-permission row together; if the permission insert fails, it deletes the newly-created Auth user. Before using account creation, deploy the function from the repository root with `supabase functions deploy admin-account --project-ref <your-project-ref>` and ensure `SUPABASE_SERVICE_ROLE_KEY` is configured as a Supabase Edge Function secret. Never place the service-role key in `js/config.js`, HTML, or any public file. The function verifies the caller's JWT and the exact owner email itself in addition to platform JWT verification. Existing built-in admin accounts retain their prior registration, funds, and results access; only nsfida receives admin-account management permission.

Race results can be edited after the race is marked Completed while they remain provisional. An authorised Results admin can finalize after the race is completed and no runners remain marked Running. Finalization locks result writes; only `nsfida` can reopen editing. Live on-course positions are updated per runner and shown publicly, while finish places are calculated from finish times. Public result and public funds views remain intentionally accessible without admin login.


## Latest public-navigation and bulk-results refinements (29 October 2026)

- The privileged **Manage Results** navigation link is hidden by default and is shown only after the shared authentication code receives an affirmative `admin_my_permissions` response for an account with Results access. The navigation CSS preserves the browser's hidden state even against legacy `display: !important` rules.
- When authorised, **Manage Results** shares the same navigation row immediately after About; mobile navigation uses compact labels to fit all five links in one row. Public Results and Manage Results now use the same shared header layout and registration CTA as the other routes.
- The Results management roster supports selecting multiple confirmed runners or selecting all currently visible runners. The bulk status action uses the existing `admin_upsert_marathon_result` RPC for each selected player and confirms status changes before saving. Failed rows remain selected for retry; successful rows are removed from the selection.
- Bulk **Finished** updates open an individual finish-time form for every selected runner. Existing finish times are prefilled; each time is validated separately before writing, preventing one shared timestamp from being assigned to every finisher.
- No SQL migration is required for this UI update. Existing RPC permission checks remain the enforcement layer for all race-result changes. Bulk updates call the RPC sequentially; if a request fails mid-batch, the page reports successes/failures because completed RPC calls cannot be automatically rolled back as one transaction.


## Admin account overlay and final results workspace polish (29 October 2026)

- Removed the admin-account management panel from `/results/manage/`. `Admin accounts & feature access` now appears only inside the profile/user menu when the authenticated session and server permission response identify `nsfida` with owner/admin-management permissions. The action opens a responsive modal matching the site’s dark-green and lime theme.
- The account modal re-checks the current session and permissions every time it opens. Admin account creation and feature access changes continue to use the existing protected Edge Function and database RPCs; no SQL migration was added for this styling/navigation change.
- Public `/results/` and `/results/manage/` use the same shared header/registration button layout as other site routes. The separate public-results header override is no longer loaded.
- Removed the Runner result updates summary/counts, result metrics tiles, and CSV export UI/logic. Runner searching, status filters, sorting, individual results, and bulk status updates remain available.


## Registration fee removal and owner-only Project Funds (30 October 2026)

**Registration form** (`/register/`): the Rs. 500 registration-fee notice, the Easypaisa payment block (logo, account number and account name) and the "Fee receipt / transaction no." field were removed completely, and `assets/easypaisa.png` was deleted. The form now shows only the English-letters reminder. New registrations send no payment reference. Existing `payment_ref` values stay in the database untouched; the admin screens no longer display or edit them.

**Admin and public pages**: "Confirm payment" is now **Confirm registration**, the *Payment ref* column and payment-reference fields were removed, and `KMR.FEE` was removed from `js/config.js`.

**Project Funds restricted to nsfida**
- Run `sql/migrations/20261030_009_funds_owner_only.sql` after migration 008, then `sql/verify_funds_owner_only.sql` (all rows should show `ok = expected`).
- The migration adds `is_funds_owner()`, makes `admin_has_feature('funds')` and `admin_my_permissions()` true for nsfida only, rebuilds the `funds` and `expenses` row-level-security policies around `is_funds_owner()`, drops the public `public_funds` and `public_expenses` views, clears `can_funds` on every managed admin account and blocks it with a check constraint, and updates `confirm_payment` / `unconfirm_payment` so that non-owner admins can only change status. Managed accounts that had *only* funds access are deactivated, because they would have no remaining feature.
- The **Funds and expenses** checkbox was removed from *Admin accounts & access*, and the `admin-account` Edge Function now always creates accounts without funds access. **Redeploy the Edge Function** (`supabase functions deploy admin-account`).
- Existing funds and expenses rows are preserved. Old cached public funds lists in visitors' browsers are purged automatically.
- Home page: the "Project funds" shortcut was removed and the remaining cards were renumbered.

**Migration 010** (`20261030_010_service_role_schema_access.sql`): run after 009. It grants the Edge Function's `service_role` access to the `public` schema and the managed-admin table. Without it, creating an admin fails with "permission denied for schema public".


## Per-admin permissions (30 October 2026, migration 011)

nsfida decides, for **every other admin, new or existing, including waseemfida**, exactly what that admin may do. Open *Admin accounts & permissions* from the profile menu: tick the switches and press **Save permissions** (or choose them when creating an admin).

| Area | Switch | Allows |
|---|---|---|
| Registrations | View registrations | Runner list, details, documents, registration PDFs |
| | Edit registrations | Change details and photo, confirm / mark pending, cancel / restore (needs View) |
| | Delete registrations | Permanently delete a registration and its files (needs View) |
| Project funds | View funds | See receiving and expenses entries, totals and PDFs |
| | Make funds entries | Record receiving entries and expenses, enter an amount when confirming (needs View) |
| | Edit funds entries | Change existing entries (needs View) |
| | Delete funds entries | Delete entries (needs View) |
| Race results | Manage race results | Manage Results page |

- Nothing is allowed unless ticked. *Quick set* buttons fill **Full access**, **View only** or **Clear all**. Switches that depend on another switch are greyed out until their parent is ticked.
- nsfida always has full access and is never restricted. An admin can also be switched off completely with **Account active**.
- Existing managed admins keep their current access (they receive Edit and Delete registrations, as they could before) and get no funds access. waseemfida keeps registrations (including edit and delete) and results, with no funds access, until nsfida changes it.
- Changes apply the next time that admin opens or refreshes a page.
- Adding a brand-new registration from the admin side remains available to anyone with *View registrations*.
- Setup: run `sql/migrations/20261030_011_granular_admin_permissions.sql` (after 009 and 010), redeploy the `admin-account` Edge Function, then run `sql/verify_funds_owner_only.sql`.
