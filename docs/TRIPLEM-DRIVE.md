# Triplem Drive

Fleet management and public vehicle bookings inside Triplem VIP (2026-11-23, database update 236).

## Switching it on (Main Admin only)

1. Admin › open the account › **Sections** › **Features** › **Triplem Drive**.
2. The switch opens a dialog that asks for the **public page address** (`https://triplem.vip/triplemdrive/<address>/`). The address is checked as you type: lowercase letters, numbers and hyphens, 3 to 40 characters, not reserved, not used by another business (including earlier addresses of other businesses).
3. Optional: **Also open this business at /triplemdrive/**. Only one business can have the plain address.
4. **Change address** (in the same block) changes it later. Links to the old address open the new one.
5. Switching off hides the Home card and the module and closes the public page. Every vehicle, booking and setting is kept and comes back when it is switched on again.

Only the protected administrator (with the Admin Security Key unlocked) can do this. Every change is recorded (who and when) and shown under the switch. The account is told by a notification when Triplem Drive is switched on. Team members use the account owner's business and get no switch of their own. In this version, only the account owner opens Triplem Drive (team-member access is a later step).

## For the business

The **Triplem Drive** card appears on the Home screen only for authorised accounts. The module downloads the first time it is opened. Nothing is loaded for other users.

| Section | What it does |
|---|---|
| Overview | Pending requests, today, next 7 days, confirmed upcoming, requests by status for 7/30/90 days or 12 months, fleet by status, recent requests, next confirmed trips, public page status |
| Bookings | Search (reference, customer, mobile, email, place, vehicle), status filters, vehicle filter, date range, sort, 25 per page. Opening a booking: Confirm / Reject / Cancel / Complete / No show / Reopen, edit, internal notes, assign or reassign a driver, status history, **Copy details**, **WhatsApp** (opens wa.me with a prepared message) and **Email draft** (opens your mail app). Nothing is sent automatically. |
| Availability | 14-day board per vehicle with confirmed and pending bookings and blocks (maintenance, repairs, personal use, other). Click a free day to add a booking. |
| Fleet | Vehicles with photos (up to 12, compressed in the browser, main photo, reorder, replace, remove), section, status (Available, Booked, Reserved, Out of Service, Under Maintenance, Sold, Inactive), private registration, public visibility, price visibility, featured, specifications, internal notes |
| Fleet Sections | Create, rename, reorder, activate or deactivate, delete (vehicles stay and simply have no section) |
| Rates | Per trip, hourly, daily, weekly, monthly, route, custom quote; per vehicle, section or route; minimum and maximum duration, validity dates, extras; public or private. Without a public price the page shows **Request a Quote**. No online payments. |
| Routes | Pickup, destination, stops, distance and duration (entered by you), price, vehicle or section, public, active, notes |
| Drivers | Name, mobile, email, notes, active |
| Customers | Built from your own bookings (grouped by mobile number), private to your business |
| Business Page | Public business name (independent of the account name and the address), logo (PNG/JPG/WebP, proportions kept, the name is shown without a logo), banner, tagline, description, phone, WhatsApp, email, address, hours, map link, social links, contact instructions, terms, cancellation policy, currency, time zone, default trip length, automatic confirmation; Publish / Unpublish, Preview (a 30-minute private link before publishing), Copy link |
| Booking Form | Show or hide, require, rename and reorder fields; defaults for pickup, destination and notes; up to 12 custom questions (short text, long text, number, choice, yes/no); the message shown after sending. Name, mobile and pickup date are always asked. |

## Public page

`/triplemdrive/<address>/` (also `/triplemdrive/?b=<address>`). It shows the business header with its own logo and name, introduction, fleet by section, vehicle details with photos, routes, rates, the booking form, contact details, terms and footer.

- Only published, enabled businesses and only public vehicles, routes and rates are shown. Registration numbers, internal notes, internal ids and customer data are never sent to the page.
- Title, description, canonical address, Open Graph and structured data (AutoRental) come from the business. Unpublished or unknown addresses are `noindex`. The pages are not in the sitemap.
- A request is shown as received only after the server stored it and returned its reference (TD-000123). Default status Pending, with the message “Your booking request has been received. Our team will contact you to confirm your reservation.”. If **Confirm requests automatically** is on, a request for a specific, free vehicle is confirmed at once.
- The server checks the business, the vehicle (belongs to it, public, bookable status), every required field, the dates (not in the past, at most 2 years ahead) and the availability. Only **confirmed** bookings and blocks make a vehicle unavailable; cancelled, rejected, pending, completed and no-show bookings do not.
- Spam protection: a hidden honeypot field, at most 6 requests per network per 10 minutes and 40 per day, and at most 4 per mobile number per hour for each business. Errors are plain messages; no technical details.

## Hosting the address

`/triplemdrive/<address>/` is served by `triplemdrive/index.html`:

- Cloudflare Pages or Netlify: `_redirects` (`/triplemdrive/:slug/ /triplemdrive/index.html 200`).
- GitHub Pages: `404.html` sends `/triplemdrive/<address>/` to `/triplemdrive/?b=<address>`, and the page puts the short address back in the address bar.

## Database (update 236)

New tables only (row level security on, deny-all policies; everything goes through the functions): `app_drive_fleets`, `app_drive_slug_history`, `app_drive_audit`, `app_drive_sections`, `app_drive_vehicles`, `app_drive_media`, `app_drive_routes`, `app_drive_rates`, `app_drive_drivers`, `app_drive_bookings`, `app_drive_booking_history`, `app_drive_blocks`, `app_drive_public_hits`, and the sequence `app_drive_booking_ref_seq`.

- Private functions always use the signed-in account as the business; no function takes a business id from the browser.
- Confirmations, manual bookings, blocks and public requests lock the vehicle row (`SELECT … FOR UPDATE`) and then check for overlaps in the same transaction. Two overlapping bookings for one vehicle cannot both be confirmed (tested with two parallel connections).
- Photos, logo and banner are stored compressed in `app_drive_media` (at most 900 KB each, previews at most 120 KB). They are served as base64 and cached in the browser for the session.
- The System Backup catalogue includes the Drive tables (section `drive`). Rate-limit counters are excluded.
- The only change to an existing row is one merged key in `app_users.settings`: `TriplemDrive` = `{enabled, slug}`. The app uses it only to decide whether to draw the Home card.

Apply on a copy first. Then run `tests/db/triplem-drive-236.sql` (all in one transaction, rolled back) and `tests/db/triplem-drive-236-concurrency.sh` against that copy, never against production.

## Known limits (v1)

- Team members of an authorised account cannot open Triplem Drive yet.
- Distances and durations of routes are entered by hand (no map service).
- Images are stored in the database (compressed). For very large fleets, moving them to file storage would be a later step.
- Notifications for new requests use the existing in-app notification (bell). There are no separate emails or SMS.
- The public page is in English.
