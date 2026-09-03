# Triplem VIP Web Push Setup — Migration 118

This implementation uses the standard Web Push protocol, a root Service Worker, VAPID signing, Triplem VIP's existing opaque application sessions, and one Supabase Edge Function. It does not require Firebase, OneSignal, OpenAI, or another paid notification provider.

## 1. Run the new database migration

Run only:

`migrations/118_secure_web_push_notifications.sql`

This migration is additive. It creates isolated push-subscription metadata and RPCs. It does not rewrite existing user or financial data.

## 2. Generate one VAPID key pair

From the project directory:

`npx @pushforge/builder@2.0.5 vapid`

Keep the private JWK secret. The public VAPID key is safe to expose to browsers.

## 3. Add Supabase Edge Function secrets

Set these project secrets in Supabase Edge Functions:

`VAPID_PUBLIC_KEY=<public key from the generator>`

`VAPID_PRIVATE_KEY=<the complete private JWK JSON on one line>`

`VAPID_SUBJECT=https://triplem.vip/`

Do not place the private key in index.html, JavaScript, SQL, Git, or hosting files.

## 4. Deploy the Edge Function

The function is included at:

`supabase/functions/push-notifications/index.ts`

Deploy with custom JWT verification disabled because Triplem VIP uses its own opaque X-Session-Token authentication and the function revalidates that session server-side:

`supabase functions deploy push-notifications --no-verify-jwt`

The function still requires the project API gateway key and restricts browser origins to triplem.vip. Main Admin broadcast requests are authorized again by `app_require_protected_admin()` inside PostgreSQL. Visitor Live Chat pushes require the existing hashed two-hour guest capability and a genuinely pending Agent handoff.

## 5. Deploy the website files

Deploy `service-worker.js` at the website root. The Service Worker must remain under the same HTTPS origin as Triplem VIP.

Each signed-in user must opt in once by opening Notifications and choosing Enable device notifications. Browser permission cannot be granted silently by a website.

For Live Chat handoffs, the server sends Web Push to opted-in Agent devices. If Triplem VIP is already open in that browser, the Service Worker suppresses the operating-system push and the existing realtime invitation/sound handles the alert. If the browser is closed, the operating-system notification is shown.

Smart PIN is never bypassed. Tapping a push notification opens Triplem VIP normally; the existing authentication/Smart PIN flow continues to protect private workspace content.

## Security notes

Push subscription capabilities are isolated behind RLS and SECURITY DEFINER RPCs. The registration RPC accepts only standard browser Push service endpoint families, preventing an authenticated client from turning the Edge Function into an arbitrary HTTPS relay. Live Chat Agent push fan-out is replay-safe: one push dispatch is allowed per authoritative AI-to-Agent handoff generation, so repeating a valid guest request cannot continuously spam Agents.


After migration 119, the database `client_open` flag is retained only as diagnostic metadata and is no longer used to exclude devices from delivery. Agent and private-message pushes are sent to subscribed target devices; the root Service Worker is authoritative for foreground suppression and hides the operating-system notification whenever an actual Triplem VIP window exists. This avoids unreliable browser unload/close signals blocking closed-browser notifications. See `WEB-PUSH-SETUP-119.md`.

On iPhone and iPad, standards-based Web Push requires Triplem VIP to be added to the Home Screen and notification permission to be granted by the user. Browser and operating-system notification settings always remain authoritative.
