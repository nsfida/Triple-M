# Khawrai Marathon Race - Season Three

Static website (no build step) + Supabase backend.

| File | Purpose |
|---|---|
| `index.html` | Public list of runners: photo, name, age, status (Confirmed / Pending) |
| `register.html` | Public registration page - the official Player Registration Form, with Rs. 500 fee notice |
| `admin.html` | Admin sign-in, confirm payment, download the filled PDF form (one, selected, or all) |
| `sql/schema.sql` | Tables, Row Level Security, storage buckets and policies |
| `sql/add_funds.sql` | Project funds only - run it if you installed before funds existed |
| `sql/add_device_location.sql` | One registration per device, location, original images - run it if you installed before this update |
| `sql/create_admin_users.sql` | Creates the two admin logins |
| `assets/` | Logos and the original form artwork used for the PDFs |
| `js/config.js` | Supabase URL / anon key, logo URL, admin usernames |

## Setup (about 5 minutes)
1. Supabase dashboard > **SQL Editor**: run `sql/schema.sql`, then `sql/create_admin_users.sql` (delete that file afterwards - it holds passwords).
2. **Authentication > Sign In / Providers**: turn **off** "Allow new users to sign up".
3. Upload the whole folder to any static host (Netlify, Vercel, GitHub Pages, cPanel). Opening via `https://` is required for camera/photo upload on phones.
4. Share `register.html` with participants; keep `admin.html` for the organisers.

## Who can do what (enforced by the database, not just the screens)
| | Public | waseemfida | nsfida |
|---|---|---|---|
| See name, age, photo, status | yes | yes | yes |
| Register (insert) | yes, always saved as *Pending* | - | - |
| See CNIC, phone, address, documents | no | yes | yes |
| Download PDFs | no | yes | yes |
| Confirm payment / edit / delete | no | yes | yes |

## Project funds
- Admin > **Project funds** > **Funds Received**: enter Name, Mohallah and Amount. Both admins can add and delete donations.
- **Confirm payment** now asks for the amount received (default Rs. 500) and adds the player to the funds list as an entry fee. **Mark pending** removes that entry.
- The public page lists every entry (name, mohallah, amount) with the total at the bottom. Only admins can write; the public can only read.

## One registration per device, location, original images
- Each browser gets a random device ID stored in three places (local storage, cookie, IndexedDB). The server stores it with a unique rule, so a second registration from the same device is refused, and the form checks this before the person starts.
- The form needs consent, then the browser's location permission, before it can be submitted. The latitude, longitude and accuracy are saved and the admin gets an "Open location in Google Maps" link.
- A web page cannot read a phone's hardware ID. Clearing site data, private mode or a different browser gives a new device ID. A browser fingerprint is saved as well, and the admin sees a warning when two registrations share one.
- Original photo, CNIC front and CNIC back are stored untouched (private, up to 25 MB each). Admin > **Files** has download links and **Download all 3**. Older registrations only have the standard-quality copy.

## Notes
- Logins: usernames map to `<username>@khawrai.app` in Supabase Auth.
- The logo `http://triplem.vip/KhawraiUnity/logo.png` is plain http; on an https site browsers may block it. Ask for an https URL (or copy it into `assets/`) and update `LOGO_URL`.
- Names in the PDF use a standard font, so English letters only (the form says so).
- Uploaded images are shrunk to 1280 px JPEG; max 3 MB per file; the public list loads up to 1000 runners.
