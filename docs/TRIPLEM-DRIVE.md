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

## Public page (update 7)

`/<address>/` (also `/triplemdrive/?b=<address>`; Triplem Drive: `/triplemdrive/`). A premium one-page site: dark hero with gold accents, warm light sections, white cards, Inter and Manrope fonts, and the Triplem Drive logo (a business's own logo replaces it).

- **No prices on the page.** The visitor first chooses what they need: **Within the city**, **Airport transfer** or **Outside the city** (hero, Services, Destinations, or **Book now**).
- **Booking overlay** (full screen on phones), with slow, smooth steps: vehicle type (Sedan, SUV, Mini Van, drawn cars with seats and bags) → car (photo slider with thumbnails and swipe, or "Any SUV is fine") → trip (city and Transfer / Full day; airport and direction, airport filled in; or intercity route with swap; pickup and drop-off typed or picked on the map; date, time, passengers, flight number) → return trip (optional; skip = one way) → your details (and the business's custom questions) → **confirm with the price** → done (reference, "Send your location on WhatsApp").
- **Price** is shown only at the confirm step: one way = listed price (catalog.json); return trip = 2 × listed price (Outbound, Return, Total). It is stored with the request ("Listed price") and in the notes. Businesses without a catalogue show "Confirmed by us".
- Sections: how it works, services, fleet (vehicle types), fleet showcase, destinations (Makkah: the Kaaba; Madinah: the Green Dome; Riyadh: Kingdom Centre; Jeddah: Historic Jeddah, because Jeddah Tower is still under construction; Dammam & Al Khobar: Khobar Water Tower), FAQ, customer support.
- **Customer support** for Triplem Drive (catalog.json `support`): +966596739938 (call and WhatsApp chat) and customersupport@triplem.vip. A WhatsApp chat button stays at the bottom right.
- Pickup and drop-off on the map: search a place, use your location or move the map under the pin. The point is saved with the address (`address · lat,lng`) and opens in Google Maps in the trip sheet. Map: OpenStreetMap; search: Nominatim.
- Photos: cars, hero and cities come from `triplemdrive/catalog/photos/` (filled by the GitHub action "Triplem Drive catalogue photos"), otherwise straight from Wikimedia Commons. Credits: footer › Photo credits. Change a city photo by changing its file name in `catalog.json` (`cities[].photo.commons`) and running the action again.
- Only published businesses and only cars with status **Available** are offered. Registration numbers, internal notes and customer data are never sent to the page. A request is shown as received only after the server stored it and returned its reference.

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
