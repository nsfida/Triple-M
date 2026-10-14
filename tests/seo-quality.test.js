'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  canonicalFromHtml,
  htmlMeta,
  matchingRobotsRules,
  parseRobotsGroups,
  pathAllowedByRules,
  pathRuleMatches,
  sitemapEntries
} = require('../scripts/audit_live_seo');
const indexNow = require('../scripts/submit_indexnow');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('live SEO helpers read meta directives and canonical URLs independent of attribute order', () => {
  const html = `<meta content="noindex, follow" name="robots"><link href="https://triplem.vip/seo/example.html" rel="canonical">`;
  assert.equal(htmlMeta(html, 'robots'), 'noindex, follow');
  assert.equal(canonicalFromHtml(html), 'https://triplem.vip/seo/example.html');
});

test('robots parser handles multiple agents, wildcard patterns, end anchors and most-specific rules', () => {
  const robots = `
User-agent: *
Allow: /
Disallow: /index.md$
Disallow: /seo/*.md$

User-agent: OAI-SearchBot
User-agent: ChatGPT-User
Allow: /
Allow: /seo/*.md$
Disallow: /Backup/
`;
  const groups = parseRobotsGroups(robots);
  const defaultRules = matchingRobotsRules(groups, 'Googlebot');
  const aiRules = matchingRobotsRules(groups, 'OAI-SearchBot');

  assert.equal(pathAllowedByRules(defaultRules, '/'), true);
  assert.equal(pathAllowedByRules(defaultRules, '/index.md'), false);
  assert.equal(pathRuleMatches('/seo/*.md$', '/seo/accounting.md'), true);
  assert.equal(pathRuleMatches('/seo/*.md$', '/seo/accounting.md/archive'), false);
  assert.equal(pathAllowedByRules(aiRules, '/seo/accounting.md'), true);
  assert.equal(pathAllowedByRules(aiRules, '/Backup/private.txt'), false);
});

test('live sitemap parser accepts unique HTTPS canonical entries and rejects malformed or off-origin URLs', () => {
  const valid = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://triplem.vip/</loc><lastmod>2026-10-14</lastmod></url><url><loc>https://triplem.vip/seo/accounting-software.html</loc><lastmod>2026-10-14T10:00:00Z</lastmod></url></urlset>`;
  assert.deepEqual(sitemapEntries(valid).map(entry => entry.url), [
    'https://triplem.vip/',
    'https://triplem.vip/seo/accounting-software.html'
  ]);
  assert.throws(() => sitemapEntries('<urlset></urlset>'), /well-formed sitemap document/);
  assert.throws(() => sitemapEntries(valid.replace('https://triplem.vip/seo/accounting-software.html', 'https://example.com/page')), /canonical HTTPS origin/);
  assert.throws(() => sitemapEntries(valid.replace('<lastmod>2026-10-14</lastmod>', '<lastmod>not-a-date</lastmod>')), /Invalid lastmod/);
  assert.throws(() => sitemapEntries(valid.replace('</urlset>', '<url><loc>https://triplem.vip/</loc></url></urlset>')), /Duplicate URL/);
});

test('IndexNow URLs are normalized to the verified host and reject URL injection', () => {
  assert.equal(indexNow.normalize('https://www.triplem.vip/seo/accounting-software.html'), 'https://triplem.vip/seo/accounting-software.html');
  assert.equal(indexNow.normalize('http://triplem.vip/seo/accounting-software.html'), 'https://triplem.vip/seo/accounting-software.html');
  assert.throws(() => indexNow.normalize('https://example.com/'), /Refusing non-triplem.vip URL/);
  assert.throws(() => indexNow.normalize('https://user:pass@triplem.vip/'), /credentials or fragment/);
  assert.throws(() => indexNow.normalize('https://triplem.vip/page#private'), /credentials or fragment/);
  assert.doesNotThrow(() => indexNow.verifyLocalKey());
});

test('sitemap, demo indexability, homepage search copy and maintained workflow runtimes stay consistent', () => {
  const homepage = read('index.html');
  const demo = read('Demo/index.html');
  const sitemap = read('sitemap.xml');
  const qualityWorkflow = read('.github/workflows/seo-quality.yml');
  const postdeployWorkflow = read('.github/workflows/seo-postdeploy.yml');
  const packageJson = JSON.parse(read('package.json'));

  assert.match(homepage, /<title>Triplem VIP \| Accounting Software, Finance ERP &amp; AI<\/title>/);
  assert.match(homepage, /name="description" content="Accounting and finance software for expenses, inventory, loans/);
  assert.match(homepage, /"dateModified": "2026-10-14"/);
  assert.match(homepage, /<meta property="og:image:width" content="895" \/>/);
  assert.match(read('index.md'), /Last reviewed: 2026-10-14/);
  assert.doesNotMatch(homepage, /name="geo\.region"|name="geo\.placename"|name="subject"|name="category"/);
  for (const agent of ['robots', 'googlebot', 'bingbot']) {
    assert.match(demo, new RegExp(`<meta name="${agent}" content="noindex, follow"`));
  }
  assert.doesNotMatch(demo, /<link\b[^>]*rel="canonical"|hreflang=/i);
  assert.doesNotMatch(sitemap, /<loc>https:\/\/triplem\.vip\/Demo\/<\/loc>/);
  assert.match(read('robots.txt'), /Keep \/Demo\/ crawlable so search engines can read its explicit noindex directive/);
  assert.match(qualityWorkflow, /actions\/checkout@v7/);
  assert.match(qualityWorkflow, /actions\/setup-node@v7[\s\S]*node-version: '24'/);
  assert.match(postdeployWorkflow, /node-version: '24'/);
  assert.match(packageJson.engines.node, />=22/);
  assert.match(read('docs/SEO_GEO_OPERATIONS.md'), /supplementary discovery\/context aids/i);
});

test('sitemap freshness comes only from explicit content dates, never deployment file timestamps', () => {
  const sitemapBuilder = require('../scripts/build_sitemap');
  assert.equal(sitemapBuilder.validIsoDate('2026-10-14'), true);
  assert.equal(sitemapBuilder.validIsoDate('2026-02-30'), false);
  assert.equal(sitemapBuilder.extractModified('<html><head></head><body>no explicit date</body></html>', 'test.html'), '');

  const entries = sitemapBuilder.buildEntries();
  assert.equal(entries.length, 48);
  assert.equal(new Set(entries.map(entry => entry.loc)).size, entries.length);
  assert.ok(entries.every(entry => entry.loc.startsWith('https://triplem.vip/')));
  assert.ok(entries.every(entry => !entry.loc.endsWith('/Demo/')));
  assert.ok(entries.every(entry => !entry.lastmod || sitemapBuilder.validIsoDate(entry.lastmod)));
  assert.equal(entries.find(entry => entry.loc === 'https://triplem.vip/').lastmod, '2026-10-14');
});

test('live sitemap validation rejects impossible dates and unsafe XML declarations', () => {
  const valid = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://triplem.vip/</loc><lastmod>2026-10-14</lastmod></url></urlset>';
  assert.throws(() => sitemapEntries(valid.replace('2026-10-14', '2026-02-30')), /Invalid calendar date/);
  assert.throws(() => sitemapEntries(valid.replace('<?xml version="1.0" encoding="UTF-8"?>', '<!DOCTYPE urlset [<!ENTITY x "y">]><?xml version="1.0" encoding="UTF-8"?>')), /DOCTYPE|entity/i);
});

test('post-deploy SEO gate stays strict while IndexNow transport failures are explicitly non-blocking', () => {
  const postdeploy = read('scripts/seo_postdeploy.js');
  const workflow = read('.github/workflows/seo-postdeploy.yml');
  const sourceWorkflow = read('.github/workflows/seo-quality.yml');
  assert.match(postdeploy, /Live production SEO\/GEO audit/);
  assert.match(postdeploy, /optional: true/);
  assert.match(postdeploy, /IndexNow was not confirmed/);
  assert.match(workflow, /SEO_AUDIT_TIMEOUT_MS: '10000'/);
  assert.match(workflow, /SEO_PAGE_RETRIES: '2'/);
  assert.match(workflow, /timeout-minutes: 15/);
  assert.match(sourceWorkflow, /workflow_dispatch:/);
  assert.match(sourceWorkflow, /persist-credentials: false/);
});

test('humans.txt and LLM discovery references have current, explicit source boundaries', () => {
  const humans = read('humans.txt');
  const llms = read('llms.txt');
  const full = read('llms-full.txt');
  assert.match(humans, /Last reviewed: 2026\/10\/14/);
  assert.match(humans, /Canonical HTML pages are authoritative/);
  assert.match(llms, /optional, concise retrieval mirrors/i);
  assert.match(llms, /not search-ranking signals/i);
  assert.match(llms, /Editorial policy/);
  assert.match(full, /Currency availability does not imply/i);
});
