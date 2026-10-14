# Triplem VIP Web Push 123

Migration 123 extends the working 122 Web Push deployment with compact notification consent, foreground delivery, and anonymous landing-page visitor subscribers.

## Deployment

1. Run `migrations/123_push_consent_foreground_and_visitor_subscribers.sql` once on the live database after 120. Versions 121 and 122 did not require SQL.
2. Deploy the updated `supabase/functions/push-notifications/index.ts` with `npx.cmd supabase functions deploy push-notifications --no-verify-jwt`. Existing VAPID secrets remain unchanged.
3. Upload `service-worker.js`, `index.html`, `Assets/app/notifications/01-web-push.js`, `Assets/style/08-landing-auth.css`, `Assets/style/11-admin-messaging.css`, and `Assets/style/app.bundle.css`.
4. Open Triplem VIP once on test devices so the v123 Service Worker activates immediately.

## Behaviour

Signed-in users who have not enabled this device receive a compact Triplem VIP prompt after unlock. Enable triggers the browser permission request; Keep Off stores a local opt-out. The compact switch beside the bell can change the device preference later.

The public landing page similarly offers opt-in visitor alerts. Anonymous subscriber records contain push capability metadata only and are protected by RLS/service-only functions. Main Admin Push Center has a Visitors audience for these subscribers.

Foreground push is intentional in v123. When Triplem VIP is open, the Service Worker displays the device notification and sends a message to the active page so the bell/messages refresh promptly.

No new VAPID keys or Edge Function secrets are required.
