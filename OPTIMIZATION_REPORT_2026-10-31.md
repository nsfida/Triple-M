# Triplem VIP — Database Log / Request Optimization
**Prepared:** 31 October 2026  
**Scope:** Frontend request-volume and notification-sync optimization. No live Supabase project was contacted or modified.

## Main findings

A source audit identified repeated network activity that could be reduced without changing stored data:

1. `Assets/app/analytics/01-site-tracker.js` sent an analytics RPC heartbeat every 25 seconds, including when the page was idle or hidden, and logged generic clicks across the authenticated finance workspace.
2. `Assets/app/messaging/01-messaging.js` originally ran its fallback sync every 900 ms generally and every 550 ms on the Messages tab. Each poll could call `app_messaging_sync_state` and trigger reminder, receipt, and visitor-presence reconciliation paths.
3. The Web Push client updated `app_push_subscriptions` presence every 45 seconds even though migration 119 removed `client_open` from server-side push-delivery decisions.
4. Trusted-device recovery approval checked the server every 12 seconds in the background, even though real Web Push already wakes the receiving browser immediately when such an approval request is dispatched.

## Changes made

| Area | Original source | Previous optimization ZIP | Current updated project |
|---|---:|---:|---:|
| Analytics heartbeat | 25 seconds | 5 minutes | 5 minutes, only while active |
| General messaging sync | 900 ms | 15 seconds | 30 seconds |
| Messages-tab sync | 550 ms | 5 seconds | 10 seconds |
| Due-note reminder dispatch throttle | 5 seconds | 5 seconds | 60 seconds |
| Live Chat presence sweep throttle | 5 seconds | 5 seconds | 30 seconds |
| Trusted-device approval fallback | 12 seconds | 12 seconds | 60 seconds |
| Push-client remote presence heartbeat | 45 seconds | 45 seconds | Removed; timer now only updates local tab storage |

Additional analytics changes retained from the previous optimization:
- Hidden and idle tabs do not generate periodic analytics heartbeat RPCs.
- Pagehide/close flushes queued analytics without a heartbeat-only RPC.
- Generic click-event tracking is skipped in authenticated finance workspace sessions; explicitly marked controls and public landing-page analytics remain trackable.
- Hidden Notifications and Messages dropdowns are no longer prefetched at login; their contents are fetched when the user opens the relevant menu.

### Push notification behaviour

The native Web Push path is event-driven, not polled. Supabase dispatches a push only after a real event/request; the Service Worker handles the browser `push` event and posts the payload to open Triplem VIP pages. The relevant page then refreshes the notification/message UI.

The slower messaging RPC poll remains as a fallback for browsers/devices without working Web Push and for reconciliation tasks that cannot safely use `postgres_changes` with Triplem's custom session/RLS model. Push and Live Chat Broadcast events still wake the UI immediately.

The three-second check inside the active trusted-device password-recovery flow is intentionally unchanged. It only runs while a user is actively completing that recovery flow and is needed to detect approval promptly.

## Expected request reduction

Cadence-based estimates per continuously visible browser tab:
- General messaging fallback: 900 ms → 30 seconds, about **97% fewer polls** than the original source.
- Messages-tab fallback: 550 ms → 10 seconds, about **94.5% fewer polls** than the original source.
- Compared with the previous optimization ZIP, fallback polling is halved again (15 → 30 seconds generally; 5 → 10 seconds on Messages).
- Repeated server-side push presence updates from the 45-second timer are eliminated.
- Trusted-device approval background fallback polling is reduced by 80% (12 → 60 seconds).
- Analytics heartbeat cadence is 12x lower (25 seconds → 5 minutes), and it is suppressed while hidden/idle.

These are cadence estimates, not measured billing savings. Actual Supabase log ingestion depends on real traffic and server-side logging settings/categories.

## Data and deployment safety

- No SQL migration is required for these frontend changes.
- No database tables, columns, triggers, functions, policies, or permissions were changed.
- No existing records, user accounts, financial data, messages, or notification rows were modified or deleted.
- No notification subscription is disabled or removed.
- Web Push delivery, Service Worker handling, message sending, and the Live Chat Realtime transport remain enabled.
- Production and Demo copies of the affected active modules were updated.
- Updated script URLs have cache-busting version strings so browsers fetch the modified JavaScript.

Deploy the full updated project ZIP. No Supabase SQL Editor action is needed for this package.

## Important limitation / next diagnostic

These code changes reduce repeated API/RPC activity but cannot guarantee a 1 GB/month log-ingestion ceiling. After deployment, compare the same period in Supabase Logs Explorer / Usage and identify whether Postgres, API Gateway, Auth, Realtime, Storage, or Edge Function logs dominate. Do not disable security/audit logging blindly; inspect the top log categories/messages first.
