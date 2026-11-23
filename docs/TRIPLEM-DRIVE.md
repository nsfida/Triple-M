# Triplem Drive

Fleet management and public vehicle bookings inside Triplem VIP (2026-11-23, database update 236).

## Switching it on (Main Admin only)

1. Admin › open the account › **Sections** › **Features** › **Triplem Drive**.
2. The switch opens a dialog that asks for the **public page address**, which comes directly after the domain: `https://triplem.vip/<address>/`. Triplem Drive itself uses `triplemdrive` (`https://triplem.vip/triplemdrive/`); every other business gets its own address, for example `https://triplem.vip/city-star/`. The address is checked as you type: lowercase letters, numbers and hyphens, 3 to 40 characters, not reserved, not used by another business (including earlier addresses of other businesses).
3. Website pages and folders (Demo, Founder, Security, seo, regions, ar, ur, windows-store, …) are reserved and cannot be used as addresses.
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
| Fleet | Vehicles with photos (up to 4, made small in the browser, main photo, reorder, replace, remove), section, status (Available, Booked, Reserved, Out of Service, Under Maintenance, Sold, Inactive), private registration, public visibility, price visibility, featured, specifications, internal notes |
| Fleet Sections | Create, rename, reorder, activate or deactivate, delete (vehicles stay and simply have no section) |
| Rates | Per trip, hourly, daily, weekly, monthly, route, custom quote; per vehicle, section or route; minimum and maximum duration, validity dates, extras; public or private. Without a public price the page shows **Request a Quote**. No online payments. |
| Routes | Pickup, destination, stops, distance and duration (entered by you), price, vehicle or section, public, active, notes |
| Drivers | Name, mobile, email, notes, active |
| Customers | Built from your own bookings (grouped by mobile number), private to your business |
| Business Page | Public business name (independent of the account name and the address), logo (PNG/JPG/WebP, proportions kept, the name is shown without a logo), banner, tagline, description, phone, WhatsApp, email, address, hours, map link, social links, contact instructions, terms, cancellation policy, currency, time zone, default trip length, automatic confirmation; Publish / Unpublish, Preview (a 30-minute private link before publishing), Copy link |
| Inquiries | Questions sent from the public page: status chips (New, Answered, Closed), search, the message and contact details, **Reply on WhatsApp** / **Reply by email**, status, internal notes and **New booking** from an inquiry. The menu shows the number of new inquiries. |
| Booking Form | Show or hide, require, rename and reorder fields; defaults for pickup, destination and notes; up to 12 custom questions (short text, long text, number, choice, yes/no); the message shown after sending. Name, mobile and pickup date are always asked. |

## Website catalogue (`triplemdrive/catalog/catalog.json`)

The listed vehicles and prices come from a JSON file instead of the database: SUV (GMC Yukon, GMC Yukon XL, Chevrolet Tahoe, Chevrolet Suburban), Sedan (Lexus ES, Ford Taurus, BMW 7 Series), Mini Van (Hyundai Staria, Toyota HiAce). It also holds the 8 intercity routes from Riyadh, airport and inside-city transfers, full-day bookings (SAR) and the terms (24/7; 15% on the final invoice when an invoice is needed; 5% for cash; 0% with advance payment to an individual account; at least 1 hour before the trip; pickup location by WhatsApp after payment; complaints by WhatsApp with a picture or by the official Triplem email). Cars added later are added in the dashboard (database) and appear in the same Vehicles tab.

- `apply_to.slugs: ["triplemdrive"]` shows it on Triplem Drive's page (`https://triplem.vip/triplemdrive/`). It is not shown on other businesses.
- To change a price, edit `services[].prices` (`suv`, `sedan`, `minivan`). To add a model, add it to `vehicles` and to its class in `classes`.
- The booking form gets "Service", "Vehicle type", "Preferred model" and the listed price. The request is stored with those choices (database update 237) and waits for your confirmation.
- Photos: `triplemdrive/catalog/photos/<file>`. One click on GitHub: Actions › **Triplem Drive catalogue photos** › Run workflow. It downloads the photos and commits them with `credits.json`. Or run `node scripts/fetch_drive_catalog_photos.js` on your computer. It downloads the Wikimedia Commons photos named in the JSON (free licences) and writes `credits.json` (authors and licences shown under "Photo credits" in the footer). Check each photo, then upload the folder. Until a photo file is uploaded, the page shows the same picture directly from Wikimedia Commons. To use your own photo, save it under the same file name (JPG, about 1600 px wide).

## Public page

`/<address>/` (also `/triplemdrive/?b=<address>`; Triplem Drive: `/triplemdrive/`). It uses the Triplem VIP default look (light background, glass cards, Inter, small pill buttons, round icon buttons) with the Triplem Drive logo (`triplemdrive/assets/logo.svg`; a business's own logo replaces it).

- **Header:** logo and name, Call, WhatsApp, Ask a question and **Book**.
- **Tabs:** Vehicles (filter by type; each card opens the car), Prices (price list by group; Book on each row), Routes (when the business has public routes), FAQ (questions from `catalog.json`, the cancellation policy and terms of the business), Contact.
- **Side panels** (same style as Triplem VIP; from the bottom on phones): car details (photos, details, prices, **Book this car**), booking, map picker, Ask a question, photo credits. Panels stack; Esc or × closes the top one.
- **Booking panel:** service, vehicle type tiles with the price for the chosen service, model chips with photos (or Any model), pickup and drop-off, date and time, details and the questions of the Booking Form. The footer shows the listed price and **Send request**.
- **Pickup and drop-off:** type the address as before, or tap **Map**: search a place, use your location or move the map under the pin, then **Use this place**. The address name is filled in and the point is saved with it (`address · lat,lng`); in Triplem Drive › Bookings it opens in Google Maps. Map: OpenStreetMap; address search: Nominatim (`https://nominatim.openstreetmap.org` is allowed in `_headers`).
- Only published, enabled businesses and only public vehicles, routes and rates are shown. Registration numbers, internal notes, internal ids and customer data are never sent to the page.
- Title, description, canonical address, Open Graph and structured data (AutoRental) come from the business. Unpublished or unknown addresses are `noindex`. The pages are not in the sitemap.
- A request is shown as received only after the server stored it and returned its reference (TD-000123). Default status Pending. If **Confirm requests automatically** is on, a request for a specific, free vehicle is confirmed at once.
- The server checks the business, the vehicle, every required field, the dates and the availability. Only **confirmed** bookings and blocks make a vehicle unavailable.
- Spam protection: a hidden honeypot field, at most 6 requests per network per 10 minutes and 40 per day, and at most 4 per mobile number per hour for each business.

## Notification centre and trip sheet

- The bell in the Triplem Drive header shows the number of new booking requests and inquiries. It opens the **Notifications** side panel (All, Bookings, Inquiries; Mark all as read).
- A booking notification (from the panel, the Triplem VIP bell or a push notification) opens the **trip sheet**: pickup date and time, pickup and drop-off with Google Maps links (exact point when the customer pinned it on the map), customer name, mobile (call, WhatsApp), email, vehicle, passengers, service and notes.
- **Message for the driver**: a short ready-made text with the map links. **Copy for driver** copies it; **Send on WhatsApp** opens WhatsApp with the text, to the chosen driver (from Drivers) or to any contact. **Full booking** opens the complete booking.

## Vehicle photos (update 242)

- Up to **4 photos** per vehicle, also when adding a new vehicle (Fleet › Add vehicle › Photos).
- Photos are made small in the browser before upload: at most 1280 px, WebP (JPEG where WebP is not available), about 100-250 KB, with a 360 px preview. The server refuses more than 4 photos and vehicle photos over 400 KB.
- **Replace** overwrites the old photo in the database (same position); **Remove** deletes it. Nothing old is kept.

## Listed cars in the fleet (update 240)

The 9 cars of the price sheet are ordinary vehicles of the Triplem Drive fleet after database update 240 (keys `cat-<model>`, sections SUV, Sedan, Mini Van). The business manages them in Triplem Drive › Fleet like any other vehicle: edit, photos, hide from the public page, out of service, bookings.

- **Photos:** the Fleet page shows "Add the listed photos" while listed cars have no photos. It takes each listed photo from `triplemdrive/catalog/photos/` (filled by the GitHub action) or, if missing, from Wikimedia Commons, and stores it as a normal vehicle photo (replace, reorder, remove). Until then the public page shows the listed photo.
- **Public page:** the fleet cars are the models of each vehicle type in the booking panel and use the listed prices (catalog.json). A fleet car is in a type by its key or by its section name (SUV, Sedan, Mini Van), so new cars added to those sections appear as models too. A booking for a chosen model is linked to that car (availability and calendar apply); "Any model" is not linked to a car.
- Prices and services stay in `catalog.json`. Before update 240 the public page shows the listed cars straight from `catalog.json`.

## Notifications for the business (update 239)

Every booking request and every inquiry:

1. adds a bell notification in Triplem VIP (opens the booking or the inquiry);
2. sends a **push notification** to the business owner's devices where push is switched on (Settings › Notifications), even when Triplem VIP is closed. Tapping it opens the booking or the inquiry;
3. plays a short **ding** (`Assets/sounds/drive_ding.mp3`) when Triplem VIP is open, once per new item (not for items already seen on this device).

The page cannot send pushes by itself: it passes a one-time token from the server to the `push-notifications` Edge Function, which asks the database who to notify (service role only). Deploy the Edge Function after running 239.

## Hosting the address

- `/triplemdrive/` is a real page (`triplemdrive/index.html`) and shows the business whose address is `triplemdrive`.
- Any other `/<address>/` does not exist as a file, so the host serves `404.html`. It sends the visitor to `/triplemdrive/?b=<address>`, and the page puts `/<address>/` back in the address bar. This works on GitHub Pages, Cloudflare Pages and Netlify. Earlier `/triplemdrive/<address>/` links work the same way (and through `_redirects` on Cloudflare Pages / Netlify).
- Search engines: `/triplemdrive/` is indexed normally. Other addresses first answer "not found" before the page loads, so search engines may not index them. If another business needs search visibility, give it its own folder (a copy of `triplemdrive/index.html` saved as `<address>/index.html`).

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
- Distances and durations of routes are entered by hand (the map is used only to pick pickup and drop-off points).
- Images are stored in the database (compressed). For very large fleets, moving them to file storage would be a later step.
- Notifications: bell, push and ding (update 239). There are no emails or SMS.
- The public page is in English.
