# Triplem VIP — Push Notification & Background Sync Optimization
**Prepared:** 31 October 2026  
**Scope:** Frontend notification and messaging request reduction. No live Supabase project was contacted or modified.

## What the source review confirmed

The browser's native Web Push path is already event-driven:

- Supabase sends a Web Push message only after a real event/request is dispatched.
- The Service Worker handles the browser `push` event and posts the received payload to open Triplem VIP pages.
- The page refreshes the relevant notification/message UI from that event.
- The Service Worker itself does not poll Supabase for notifications.

The excessive activity was in fallback/background reconciliation code, not a one-second loop inside the Web Push Service Worker.

## Changes included

| Area | Previous behaviour | Updated behaviour |
|---|---|---|
| General messaging/notification fallback | 15 seconds (original source: 900 ms) | 30 seconds |
| Messages-tab fallback | 5 seconds (original source: 550 ms) | 10 seconds |
| Due-note reminder dispatch throttle | 5 seconds | 60 seconds |
| Live Chat visitor-presence sweep throttle | 5 seconds | 30 seconds |
| Trusted-device recovery approval fallback | 12 seconds | 60 seconds |
| Push-client presence heartbeat | Supabase RPC update every 45 seconds | Local-only tab touch every 45 seconds; no recurring Supabase request |

Real browser Push events and Live Chat Broadcast events continue to refresh the relevant UI immediately. The slower polling remains as a fallback for browsers/devices without working Web Push and for reconciliation tasks that cannot safely use `postgres_changes` with Triplem's custom session/RLS model.

The three-second check inside the active trusted-device password-recovery flow remains unchanged. It only runs while a user is actively completing that recovery flow and is needed to detect approval promptly.

## Expected request reduction

For a continuously visible browser tab, the messaging fallback cadence is now:

- General tabs: 900 ms → 30 seconds, about **97% fewer polls** compared with the original submitted source.
- Messages tab: 550 ms → 10 seconds, about **94.5% fewer polls** compared with the original submitted source.
- Compared with the previous optimization ZIP: 15 s → 30 s generally and 5 s → 10 s on Messages, halving those fallback poll counts again.
- Repeated push-presence RPC writes from the 45-second timer are eliminated. Only tab-local storage is refreshed by that timer; a server open/close presence update is retained at the actual page lifecycle boundary.
- Trusted-device approval fallback polling is reduced by 80% (12 s → 60 s).

These are cadence-based estimates, not measured billing savings. Actual Supabase log ingestion depends on traffic and server-side log settings/categories.

## Safety / data impact

- No SQL migration is required for these frontend changes.
- No database tables, columns, triggers, functions, policies, or permissions were changed.
- No existing records, user accounts, financial data, messages, or notification rows were modified or deleted.
- No notification subscription is disabled or removed.
- Web Push delivery, Service Worker handling, message sending, and the Live Chat Realtime transport remain enabled.
- Both the production and Demo copies of the active modules were updated, and cache-busting query strings were advanced.

## Deployment note

Deploy the full updated project ZIP. The changed asset URLs use new version strings so browsers should request the updated JavaScript rather than reuse cached versions. No Supabase SQL editor action is needed for this package.

After deployment, compare Supabase log-ingestion usage over a comparable period. This code change should reduce repeated requests, but it cannot by itself guarantee a 1 GB/month log-ingestion ceiling; the Supabase Logs Explorer category breakdown is still needed to identify server-side logging volume.
