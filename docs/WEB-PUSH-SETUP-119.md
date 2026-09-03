# Triplem VIP Web Push Setup — Reliability Update 119

Run `migrations/119_web_push_delivery_reliability_and_messages.sql` after 118, then redeploy `supabase/functions/push-notifications/index.ts` and the updated website files.

Version 119 keeps the same Supabase secrets already configured for 118. You do not need to generate new VAPID keys.

## Why 119 is required

Browser close/unload events are not reliable enough to keep a database `client_open` flag authoritative. Version 119 therefore sends Agent and private-message pushes to all subscribed target devices and lets the root Service Worker decide whether an operating-system notification should be shown. If a Triplem VIP window is actually open, the Service Worker suppresses the OS notification. If no Triplem VIP window exists, it displays the push.

The Edge Function now derives the browser VAPID public key directly from the configured private JWK. If a browser subscription was created with a mismatched/older application-server key, the signed-in client silently unregisters and replaces that subscription after normal login/unlock while notification permission is already granted. No new permission prompt is required.

## Private Messages

Registered-user Messages now request Web Push only after the message has been persisted successfully. PostgreSQL verifies the current opaque Triplem VIP session, the conversation participant, the latest persisted sender and the legitimate recipient set. The browser never chooses notification recipients. Each persisted message can authorize at most one push dispatch.

Lock-screen message payloads are deliberately generic and do not contain message text, financial information or private workspace content. Smart PIN and normal authentication remain required when the notification is opened.

## Deployment after 118

1. Run `migrations/119_web_push_delivery_reliability_and_messages.sql`.
2. Redeploy the Edge Function with `supabase functions deploy push-notifications --no-verify-jwt`.
3. Upload the updated root `service-worker.js`, `index.html`, `Assets/app/notifications/01-web-push.js` and `Assets/app/messaging/01-messaging.js`.
4. Open Triplem VIP once on each previously-enabled test device and complete normal login/Smart PIN. Version 119 will repair an older VAPID subscription automatically if needed.
5. Close the receiving browser and test a selected-user Admin Push, a registered-user private message, and a visitor-to-Agent handoff.

For selected-user Admin Push tests, the Push Center now waits for the Push service response and reports how many device pushes were accepted or failed. Edge Function logs also include safe delivery status summaries without exposing subscription keys.
