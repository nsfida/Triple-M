# Triplem VIP production release checklist

This checklist complements, but does not replace, the automated test suite. No item involving a live system should be considered complete unless it has actually been tested.

## Automated checks

Run from the project root:

```sh
npm run verify
npm run seo:prepare
npm run build:production
```

The production build fails if manifest hashes are stale, developer/SQL artifacts leak into the static output, local JavaScript/CSS references are missing or have incorrect content fingerprints, required headers are absent from the `_headers` artifact, or the release manifest is inconsistent.

## Release contents

- Deploy the **contents** of the Production ZIP to the static site host, not the Source ZIP.
- The static Production ZIP does not contain Supabase Edge Function source.
- This release requires a separate deployment of `supabase/functions/push-notifications/index.ts` because it now checks the protected-admin session before using the service-role admin notification outbox operation.
- No database migration is required for this code change. Do not run the fresh-install schema or full-schema SQL bundle against an existing database.
- Preserve the existing Supabase secrets and function configuration; this change does not require new secrets. Do not change the gateway JWT verification setting as part of this patch without first validating how the application uses its custom session token.

## Staging-first checks for the push notification function

1. With no `X-Session-Token` header, call `admin_inbox_flush` directly (including a request without an `Origin` header). It must return an authorization failure and must not claim or complete any outbox items.
2. With a valid ordinary-user session, call the same action. It must return an authorization failure and must not claim or complete outbox items.
3. With the protected Main Admin session, verify `admin_inbox_flush` still sends the expected pending notifications and accurately reports the result.
4. Confirm the normal admin push center, visitor subscription, account notifications, security recovery notifications, and live-chat notifications still work.
5. Check function logs for unexpected authorization or push-delivery errors after release.

The project test suite verifies that the protected-admin session check appears before the service-role outbox operation. It does not replace these runtime tests against a staging Supabase project.

## Hosting and application smoke checks

- Inspect real production HTTP responses and confirm the host applies `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, and HSTS where appropriate. A `_headers` file only works on hosts that support it.
- Sign in as an ordinary user, company/team administrator, and protected Main Admin. Verify each sees and can access only permitted data and actions.
- Check key financial workflows: opening balances, partial payments, transfers, commissions, refunds/cancellations, and PDF/Excel exports. Reconcile displayed totals against underlying records.
- Upload a representative vehicle XLS/XLSX file and reconcile every source row as accepted, rejected, duplicate, or explicitly skipped.
- Restore a recent backup into a clean staging environment and confirm critical records, relationships, permissions, and history are present.

## Rollback

Keep the previous static deployment and current Edge Function source available. If the notification function fails its staging or smoke tests, roll back that function deployment separately. If the static build fails verification, do not deploy it. No database rollback should be needed for this release because no database changes are included.
