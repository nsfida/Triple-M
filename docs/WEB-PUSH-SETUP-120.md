# Triplem VIP Web Push 120 deployment

Version 120 fixes two production issues found during live testing after 119.

First, Main Admin broadcast rows were being created as `system/admin_broadcast`, but the notification-center client filter did not include that subtype. Version 120 exposes those rows in the normal bell and keeps Read/Read All behavior unchanged.

Second, the Edge Function now uses two standards-based Web Crypto delivery builders. PushForge remains the primary transport. If the push service rejects or the runtime fails to build that request, `@block65/webcrypto-web-push` retries the same browser subscription with the same VAPID pair. Expired 404/410 subscriptions are not retried and continue to be removed.

## Deploy

1. Run `migrations/120_web_push_transport_and_notification_center_fix.sql` after 119.
2. Redeploy the existing Edge Function:

   `npx.cmd supabase functions deploy push-notifications --no-verify-jwt`

3. Upload these runtime files:

   - `service-worker.js`
   - `index.html`
   - `Assets/app/messaging/01-messaging.js`
   - `Assets/app/notifications/01-web-push.js`
   - `supabase/functions/push-notifications/index.ts` (this is deployed by the CLI command above)

No new VAPID pair is required. Keep the existing `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` secrets.

Selected-user Admin sends now synchronously report the number of in-app notifications created and browser push requests accepted/failed. Failure hints include only the push-service host and HTTP status, never subscription endpoints or cryptographic keys.
