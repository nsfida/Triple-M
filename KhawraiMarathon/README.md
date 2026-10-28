# Khawrai Marathon Race - Season Three

Static website (no build step) + Supabase backend. The interface uses a refreshed light theme with responsive public, registration, and admin layouts; no frontend build step is required.

| File | Purpose |
|---|---|
| `index.html` | Public runner directory, project funds, clickable player detail overlay, and admin-only player-list PDF exports |
| `about.html` | Detailed race story, Season One to Three timeline, invited communities, Season Two gallery and organiser contacts |
| `register.html` | Public registration page - the official Player Registration Form, with Rs. 500 fee notice |
| `admin.html` | Admin sign-in, registrations, cancellation, payment management, receiving and expense ledgers, and PDF reports |
| `sql/schema.sql` | Tables, Row Level Security, storage buckets and policies |
| `sql/migrations/` | **Safe, re-runnable migrations. Run new files here in date order.** Migrations are additive and avoid destructive data changes. |
| `js/common.js`, `js/admin-tools.js` | Shared login (saved locally) and the admin actions used by every page |
| `sql/add_funds.sql` | Project funds only - run it if you installed before funds existed |
| `sql/add_device_location.sql` | One registration per device, location, original images - run it if you installed before this update |
| `sql/create_admin_users.sql` | Creates the two admin logins |
| `assets/` | Shared styles, About page styling, logos and the original form artwork used for the PDFs |
| `images/` | Season Two race photographs used in the About gallery (credited to Sagar Studio) |
| `js/config.js` | Supabase URL / anon key, logo URL, admin usernames |

## Setup (about 5 minutes)
1. Supabase dashboard > **SQL Editor**: run `sql/schema.sql`, then every forward migration in `sql/migrations/` in date order, then `sql/create_admin_users.sql` (delete that file afterwards - it holds passwords). Run `20261026_003_public_player_details.sql` after `20261026_002_local_first_zero_payment.sql` to enable the public player overlay, then `20261027_004_cancellations_expenses.sql` and `20261028_005_registration_deadline.sql`. Migration 005 enforces the 05 November 2026, 11:59 PM Pakistan Standard Time public registration cutoff in PostgreSQL and storage upload policies, while verified admins can continue registering runners. `sql/verify_migration_003.sql` remains available to verify the earlier public-details migration.
   **Existing install:** run only migrations that have not already been applied. In particular, run `20261026_002_local_first_zero_payment.sql` after `20261024_001_admin_multi_entries.sql`, then run `20261028_005_registration_deadline.sql` to activate the database-side deadline enforcement. Migration 005 is safe to re-run and does not delete, reset or rewrite existing records.
2. **Authentication > Sign In / Providers**: turn **off** "Allow new users to sign up".
3. Upload the whole folder to any static host (Netlify, Vercel, GitHub Pages, cPanel). Opening via `https://` is required for camera/photo upload on phones.
4. Share `register.html` with participants; keep `admin.html` for the organisers.

## Who can do what (enforced by the database, not just the screens)
| | Public | waseemfida | nsfida |
|---|---|---|---|
| See name, age, photo, status, gender and registered address | yes | yes | yes |
| Register (insert) | yes, always saved as *Pending* | - | - |
| See CNIC, mobile, email and private documents | no | yes | yes |
| Download filled registration PDFs | no | yes | yes |
| Download receiving, expenses and combined statement PDFs | yes | yes | yes |
| Confirm payment / edit / delete | no | yes | yes |

## Project funds
- Project Funds now has two ledgers: **Receiving** (the existing contributions and registration-fee flow) and **Expenses** (expense date, category, description, payee, payment method, amount and optional receipt/reference).
- Both admin entry screens support adding, editing and deleting expense entries. The public funds page is read-only and shows the records and totals.
- Receiving and spending are independent ledgers. Expenses can be recorded even when they exceed collections; the net balance is total received minus total expenses and may be negative. The summary keeps the two totals separate and shows that signed net balance, plus donation and entry-fee subtotals.
- **Receiving PDF**, **Expenses PDF**, and **Full statement PDF** are available from both the public funds page and the admin control centre. The combined statement includes separate totals, a dated ledger with running balance, and a clearly labeled ending balance that displays a minus sign when expenses exceed receipts.
- **Confirm payment** keeps the existing behavior: positive amounts create a linked entry-fee row, and **Mark pending** removes that linked entry fee. Expense records are stored in a separate `expenses` table and do not alter the existing `funds` data.

## One registration per device, location, original images
- Each browser gets a random device ID stored in three places (local storage, cookie, IndexedDB). The server stores it with a unique rule, so a second registration from the same device is refused, and the form checks this before the person starts.
- The form needs consent, then the browser's location permission, before it can be submitted. The latitude, longitude and accuracy are saved and the admin gets an "Open location in Google Maps" link.
- A web page cannot read a phone's hardware ID. Clearing site data, private mode or a different browser gives a new device ID. A browser fingerprint is saved as well, and the admin sees a warning when two registrations share one.
- Original photo, CNIC front and CNIC back are stored untouched (private, up to 25 MB each). Admin > **Files** has download links and **Download all 3**. Older registrations only have the standard-quality copy.

## Admin features (migration 20261024_001)
- **Unlimited entries for admins.** While signed in, the one-per-device rule and public location step are skipped, and **Add another registration** is available after each save. Public visitors keep the one-per-device rule. Admin rows are tagged `entered_by`. The CNIC must still be unique (it identifies a person).
- **Login saved locally.** One session is stored in this browser's local storage and shared by `index.html`, `register.html` and `admin.html`, so a refresh never signs you out. Sign out only ends it on this device.
- **Admin-only player-list PDFs.** From the public runner directory, signed-in admins can download All, Confirmed, Pending, or Cancelled player lists. Each landscape PDF includes the player photo, registration number, name, age, gender, public address and status; private contact details and identity documents are excluded. The branded title/logo appears on the first page, and the table is paginated to avoid overflow.
- **Clickable player details.** Public visitors can open each runner card to view the name, age, gender and registered address. Signed-in admins get the secure full-detail overlay with edit, payment confirmation, registration PDF, photo/CNIC front/back downloads and other document links. The three-dot menu remains available for quick actions; donations in the funds tab have edit/delete too.
- **Project funds tabs.** The public page has *Runners* and *Project funds* tabs (`index.html#funds` opens the funds tab directly); Project Funds is divided into *Receiving* and *Expenses*.
- **Reversible cancellation.** Admins can cancel or restore a runner without deleting the registration or changing its payment status. Cancelled runners remain in the public *All* list with clear red crossing lines; existing receiving records are preserved.

## Registration deadline (migration 20261028_005)
- The public registration deadline is **05 November 2026 at 11:59 PM Pakistan Standard Time (UTC+05:00)**. The home page shows a second-by-second countdown and a right-to-left announcement strip; after the cutoff, the public Register CTA is replaced by **Registration Ends** and the direct registration page displays a closed state.
- Deadline enforcement is server-side: PostgreSQL rejects new non-admin registration RPC calls and storage uploads after the cutoff. Only the two verified admin JWT emails can continue creating registrations after the deadline. Changing page HTML, JavaScript, or browser time does not bypass the database check. Existing registrations and funds are not rewritten.
- The public Project Funds receiving ledger now shows a **Type** column (Donation or Entry fee) using fields already exposed by the public-safe `public_funds` view.

## Fast loading and local-first saving
- Public participant/fund data is cached in local storage and drawn before a fresh background refresh. Admin list caches use session storage because they include private contact fields.
- Registration form fields autosave as a local draft. On submit, the form and attached file blobs are committed to IndexedDB first, then uploaded and submitted to Supabase. If offline or interrupted, the queue retries when the connection returns or the registration page is reopened. A local queued entry is clearly labeled **Sync pending** and is not considered an official registration until the server returns a registration number.
- Admin confirmations, edits, and donation entries are written to a small local outbox before the database request. The UI updates immediately and the outbox retries while online or when an admin page is reopened. Keep the same browser profile and do not clear site data until pending syncs finish.
- The page headers and loading screens use the original Khawrai Unity brand mark from `https://triplem.vip/KhawraiUnity/logo.png`; each logo links to the public participant list. A shared profile menu includes account navigation, sign-out, password changes and a browser-local admin profile picture. Runner photography is used as a low-contrast part of the shared visual theme.

## Public player detail migration
- `20261026_003_public_player_details.sql` replaces the participant view in-place while preserving its existing columns and adding `gender`, `address` and `district_tehsil` at the end. It does not alter or delete rows. Because the requested public player overlay displays the registered address, that address becomes visible to public visitors; CNIC, mobile, email and location coordinates remain excluded. To verify the migration actually exists in the live database, run `sql/verify_migration_003.sql` in Supabase SQL Editor and confirm it returns `PASS`. A local ZIP cannot apply a migration to Supabase by itself.

## Cancellation and expenses migration
- Run `sql/migrations/20261027_004_cancellations_expenses.sql` in the Supabase SQL Editor after your previously applied migrations.
- The migration adds `is_cancelled`, `cancelled_at` and `cancelled_by` to registrations, creates the independent `expenses` ledger and its admin-only write policies, and adds a public read-only expenses view. It does not delete registration rows, update their payment status, or modify existing receiving records.
- The migration file is safe to re-run. For new installations, `sql/schema.sql` and the public-details migration include compatible definitions; still run forward migrations in date order as listed in Setup.

## Notes
- Logins: usernames map to `<username>@khawrai.app` in Supabase Auth.
- Names in the PDF use a standard font, so English letters only (the form says so).
- Uploaded images are shrunk to 1280 px JPEG; max 3 MB per file; the public list loads up to 1000 runners.

## About Khawrai Marathon Race
- `about.html` is linked from the header on the public, registration and admin pages. It describes the first two Khawrai Village editions, Season Three on **15 November 2026**, the expanded invitation to Dargai, Petao, Kati Miana, New Khawrai, Jehangira, Shaidu, Khairabad and surrounding villages, plus the Season Three management and organisation roles.
- Season Three is managed by **Waseem Shahzad Fida** and organised by **District Sports Office Nowshera, Directorate General of Sports, Government of Khyber Pakhtunkhwa**. Contact: **+92 333 9095878**.
- The Season Two photographs in `images/image1.jpg`, `images/image2.jpg` and `images/image3.jpg` are credited to **Sagar Studio**.
