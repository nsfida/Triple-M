# Triplem VIP — Idle Request / Log-Ingestion Optimization

**Date:** 31 October 2026  
**Scope:** Production app and Demo copy  
**Approach:** Frontend request reduction; no database/schema changes

## Objective

Reduce unnecessary Supabase/API activity when Triplem VIP is left open but unattended, while retaining normal workflows when a user returns and keeping explicit user actions, pending writes, and browser Push delivery working.

## Main change: local activity state

Added `Assets/app/core/00-activity.js` and its Demo equivalent. This is a local-only activity tracker. It does not make requests, write to Supabase, or persist activity. It treats the page as idle after two minutes without user activity, and emits local `triplem:idle` / `triplem:activity` events for app modules.

### Request reductions

| Area | New behaviour |
|---|---|
| Authenticated messaging fallback | Pauses after two minutes idle or when the tab is hidden. On return, performs a catch-up reconciliation, then polls every 120 seconds normally or every 30 seconds while the Messages tab is active. |
| Admin Live Chat Realtime bridge | WebSocket is closed after two minutes idle and while the tab is hidden. Reconnects and reconciles when the user returns. Its 25-second Realtime protocol heartbeat therefore stops while idle. |
| Live Chat presence reconciliation | Existing presence sweep is throttled to at most once every 120 seconds while the foreground messaging sync is active. |
| Public support chat | Polls only while the support panel is open, visible, and the visitor is active. Polling stops on idle/close/hidden; resumes on activity or when the tab becomes visible. |
| Offline write queue | Removed recurring queue-scan interval. Pending writes are scheduled when queued, when connectivity returns, when the page resumes, or when a retry deadline is reached. |
| Installment due notices | Due-notice RPC checks run every six hours while active, and retry after a long idle only when the user returns. Successful due-check keys are cached per user to avoid repeating the same checks. |
| Note reminders | Reminder dispatch is no longer attached to every messaging reconciliation. The existing due-time scheduler handles the due-time dispatch path. |
| Site analytics | Heartbeat interval is ten minutes and flushes only for a visible page with recent activity. Explicit pageviews and meaningful analytics events continue to be recorded. |
| Admin analytics modal | Refreshes at most every 60 seconds and only while the modal is open and the user is active. |
| Trusted-device recovery fallback | Background check interval is five minutes and checks only while the user is active. The short polling used inside an actively open recovery flow remains intact. |
| Notification dropdowns | Hidden Notifications / Messages dropdown contents are not prefetched at login; they are loaded when opened. |
| Support configuration | Uses a five-minute in-memory cache and is refreshed on demand/focus rather than by a one-minute timer. |

The idle threshold is two minutes. There can be one in-flight request when a page becomes idle; this change prevents subsequent scheduled requests rather than cancelling a request already sent.

## Push and live-feature behaviour

- The Service Worker `push` event handler and browser Push subscription implementation were not replaced or disabled. Push remains event-driven; it is not implemented as a one-second database check.
- Admin Live Chat Realtime is paused while idle/hidden and reconciled when the user returns. This intentionally trades unattended live UI updates for lower background traffic.
- When browser Push is unavailable, disabled, or not subscribed, notification/message fallback reconciliation happens when the app becomes active again rather than polling continuously in the background.
- An actively used support panel continues to poll so the conversation remains responsive. If the visitor leaves it unattended for two minutes, polling pauses until activity resumes.
- Existing user-triggered writes, financial operations, permissions, and offline queue semantics were not intentionally changed.

## Files updated

Production and Demo copies were updated where applicable:

- `Assets/app/core/00-activity.js`
- `Assets/app/core/08-offline-sync.js`
- `Assets/app/messaging/01-messaging.js`
- `Assets/app/landing/02-live-chat.js`
- `Assets/app/admin/03-admin-analytics.js`
- `Assets/app/auth/05-account-security.js`
- `Assets/app/analytics/01-site-tracker.js` (production tracker)
- `index.html` and `Demo/index.html` (script inclusion/cache-busting)
- `tests/critical-paths.test.js` (regression coverage)

Other earlier notification/logging optimizations from the supplied source package have been retained.

## Timers retained by design

A source-wide timer review found a few timers that remain because they are tied to an explicit open feature or do not issue Supabase requests while idle:

- The authenticated Live Chat Realtime heartbeat runs only while the user is active; the socket now closes on idle/hidden and is restored on return.
- The public support conversation poll remains at its fast cadence only while the support panel is open and the page is active; it pauses on idle/hidden/close.
- The admin analytics refresh runs only while its modal is open and the user is active.
- Trusted-device approval polling is active-only. The short approval/recovery modal checks remain only while the corresponding security flow is open.
- Barcode scanning timers run only while the user is actively using the scanner.
- Smart PIN/recovery countdowns are local UI timers. Bitcoin price refreshes use the external price source, not the Supabase database.
- The local idle detector and reminder deadline timers may wake JavaScript, but they do not make Supabase requests while idle.

## Database and data safety

- No SQL migration was added or edited for this optimization.
- No table, column, index, trigger, function, RLS policy, or database configuration was changed.
- No records were read-modified, migrated, deleted, or recreated as part of packaging.
- No Supabase credentials or project secrets were intentionally changed.

## Verification

All checks passed against the complete source tree:

- `npm run audit:syntax` — passed (64 local scripts)
- `npm test` — passed (263 tests, 0 failures)
- `npm run audit:frontend` — passed (903 unique IDs, 3 active stylesheets, 78 active resource references)
- `npm run audit:security` — passed (72 deferred runtime scripts; no public secret literals detected)

These are source-level automated checks, not a live production load test. The project must still be deployed and exercised in the actual Supabase environment.

## Important limits and measurement

This optimization targets recurring client-side requests identified in the supplied source. It cannot by itself control Supabase Auth token refresh, external browser/platform traffic, server-side triggers/functions, Postgres logging configuration, or other clients/integrations using the same Supabase project.

A reduction to **1 GB/month cannot be guaranteed from source inspection alone**. After deployment, compare Supabase Log Drain / Log Ingestion by source (Postgres, API Gateway, Auth, Realtime, Storage, Edge Functions) across a representative period. If Postgres logs still dominate, inspect database logging settings and server-side SQL activity separately; do not disable security/audit logging blindly.
