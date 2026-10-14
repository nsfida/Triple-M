#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const auditScript = require.resolve('./audit_live_seo.js');
const submitScript = require.resolve('./submit_indexnow.js');

function run(label, args, { optional = false } = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  let failure = '';
  if (result.error) failure = `${label} could not start: ${result.error.message}`;
  else if (result.status !== 0) failure = `${label} failed (exit ${result.status ?? 'unknown'}).`;

  if (failure) {
    if (optional) {
      console.warn(`WARNING: ${failure} The primary live SEO audit has already passed; the optional discovery notification can be retried manually without treating the deployment as an SEO failure.`);
      return false;
    }
    console.error(failure);
    process.exit(result.status || 1);
  }
  return true;
}

// The production crawl/indexability audit is a release gate. Readiness files
// receive a larger retry budget; individual page requests use a bounded budget
// from SEO_PAGE_RETRIES so a slow origin cannot exceed the workflow timeout.
run('Live production SEO/GEO audit', [auditScript, '--retries=5', '--retry-delay=1500']);

// IndexNow is an optional notification channel. Its outage must not turn a
// verified, crawlable deployment into a failed SEO workflow/email. Errors remain
// visible in logs and the URL list can be resubmitted with `npm run seo:indexnow`.
const indexNowOk = run('Optional IndexNow URL notification', [submitScript, '--all'], { optional: true });
if (!indexNowOk) console.warn('IndexNow was not confirmed in this run. Sitemap discovery remains available; review the log and retry IndexNow if needed.');
console.log('\nProduction live SEO/GEO audit passed.');
