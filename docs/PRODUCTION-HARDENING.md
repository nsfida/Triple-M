# Production hardening

This build keeps the application UI, database contracts and business logic unchanged while tightening the delivery process.

## Verification

Run `npm run verify` before deployment. It rebuilds the maintained feature CSS bundle, checks active frontend references and ordering, parses every active local JavaScript file, audits browser/security boundaries, and runs the complete automated test suite.

Run `npm run verify:production` to perform all verification and create `dist-production/`.

## Production output

`dist-production/` contains only browser/runtime material. Development migrations, tests, Supabase function source, internal scripts, modularization inventories, and pre-split monolith backups are intentionally excluded. A SHA-256 `production-manifest.json` is generated for release integrity and change auditing.

The full source tree remains the maintenance baseline. `dist-production/` is disposable and can always be regenerated from source.
