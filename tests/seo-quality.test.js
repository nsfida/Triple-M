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
  const sitemapIndex = read('sitemap-index.xml');
  const qualityWorkflow = read('.github/workflows/seo-quality.yml');
  const postdeployWorkflow = read('.github/workflows/seo-postdeploy.yml');
  const packageJson = JSON.parse(read('package.json'));

  assert.match(homepage, /<title>Triplem VIP \| Accounting Software, Finance ERP &amp; AI<\/title>/);
  assert.match(homepage, /name="description" content="Accounting software for expenses, inventory, loans/);
  assert.match(homepage, /"dateModified": "2026-10-31"/);
  assert.match(homepage, /<meta property="og:image:width" content="895" \/>/);
  assert.match(read('index.md'), /Last reviewed: 2026-10-31/);
  assert.doesNotMatch(homepage, /name="geo\.region"|name="geo\.placename"|name="subject"|name="category"/);
  for (const agent of ['robots', 'googlebot', 'bingbot']) {
    assert.match(demo, new RegExp(`<meta name="${agent}" content="noindex, follow"`));
  }
  assert.doesNotMatch(demo, /<link\b[^>]*rel="canonical"|hreflang=/i);
  assert.doesNotMatch(sitemap, /<loc>https:\/\/triplem\.vip\/Demo\/<\/loc>/);
  assert.match(read('robots.txt'), /The Demo is crawlable so engines can read its explicit noindex directive/);
  assert.match(qualityWorkflow, /actions\/checkout@v7/);
  assert.match(qualityWorkflow, /actions\/setup-node@v7[\s\S]*node-version: '24'/);
  assert.match(postdeployWorkflow, /node-version: '24'/);
  assert.match(packageJson.engines.node, />=22/);
  // Operational documentation is helpful but is not required for the public website build.
  // Validate its guidance when present; do not fail production SEO checks just because
  // a public branch omits this optional documentation file.
  const seoOpsDocPath = path.join(ROOT, 'docs', 'SEO_GEO_OPERATIONS.md');
  if (fs.existsSync(seoOpsDocPath)) {
    assert.match(fs.readFileSync(seoOpsDocPath, 'utf8'), /supplementary discovery\/context aids/i);
  } else {
    console.log('[seo-test] Optional docs/SEO_GEO_OPERATIONS.md not present; skipping documentation-only assertion.');
  }
});

test('sitemap freshness comes only from explicit content dates, never deployment file timestamps', () => {
  const sitemapBuilder = require('../scripts/build_sitemap');
  assert.equal(sitemapBuilder.validIsoDate('2026-10-14'), true);
  assert.equal(sitemapBuilder.validIsoDate('2026-02-30'), false);
  assert.equal(sitemapBuilder.extractModified('<html><head></head><body>no explicit date</body></html>', 'test.html'), '');

  const entries = sitemapBuilder.buildEntries();
  assert.equal(entries.length, 49);
  assert.equal(new Set(entries.map(entry => entry.loc)).size, entries.length);
  assert.ok(entries.every(entry => entry.loc.startsWith('https://triplem.vip/')));
  assert.ok(entries.every(entry => !entry.loc.endsWith('/Demo/')));
  assert.ok(entries.some(entry => entry.loc === 'https://triplem.vip/seo/faq.html'));
  assert.ok(entries.every(entry => !entry.lastmod || sitemapBuilder.validIsoDate(entry.lastmod)));
  assert.equal(entries.find(entry => entry.loc === 'https://triplem.vip/').lastmod, '2026-10-31');
  assert.ok(entries.every(entry => ['always','hourly','daily','weekly','monthly','yearly','never'].includes(entry.changefreq)));
  assert.ok(entries.every(entry => Number(entry.priority) >= 0 && Number(entry.priority) <= 1));
});

test('live sitemap validation rejects impossible dates and unsafe XML declarations', () => {
  const valid = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://triplem.vip/</loc><lastmod>2026-10-14</lastmod></url></urlset>';
  assert.throws(() => sitemapEntries(valid.replace('2026-10-14', '2026-02-30')), /Invalid calendar date/);
  assert.throws(() => sitemapEntries(valid.replace('<?xml version="1.0" encoding="UTF-8"?>', '<!DOCTYPE urlset [<!ENTITY x "y">]><?xml version="1.0" encoding="UTF-8"?>')), /DOCTYPE|entity/i);
});

test('sitemap index points only to the verified full HTTPS sitemap', () => {
  const { sitemapIndexEntries } = require('../scripts/audit_live_seo');
  const valid = '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://triplem.vip/sitemap.xml</loc></sitemap></sitemapindex>';
  assert.deepEqual(sitemapIndexEntries(valid), ['https://triplem.vip/sitemap.xml']);
  assert.throws(() => sitemapIndexEntries(valid.replace('https://triplem.vip/sitemap.xml', 'https://other.example/sitemap.xml')), /clean HTTPS URL/);
  assert.throws(() => sitemapIndexEntries(valid.replace('<?xml version="1.0" encoding="UTF-8"?>', '<!DOCTYPE sitemapindex [<!ENTITY x "y">]><?xml version="1.0" encoding="UTF-8"?>')), /DOCTYPE|entity/i);
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
  assert.match(humans, /Last reviewed: 2026\/10\/31/);
  assert.match(humans, /Canonical HTML pages are authoritative/);
  assert.match(llms, /Markdown pages are supplementary reading copies/i);
  assert.match(llms, /optional context files, not ranking signals/i);
  assert.match(llms, /Editorial policy/);
  assert.match(full, /Currency availability does not imply/i);
});


test('public SEO metadata, manifest icons and FAQ schema stay complete', () => {
  const root = path.resolve(__dirname, '..');
  const { buildEntries, publicHtmlFiles } = require('../scripts/build_sitemap');
  const files = publicHtmlFiles().filter(file => file !== 'Demo/index.html');
  const manifest = JSON.parse(read('site.webmanifest'));
  assert.equal(files.length, 49);
  assert.ok(files.every(file => fs.existsSync(path.join(root, file))));
  for (const file of files) {
    const html = read(file);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const desc = (html.match(/<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/i) || [])[0] || '';
    const canonical = (html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i) || [])[0] || '';
    assert.equal([...html.matchAll(/<title\b/gi)].length, 1, file);
    const visibleTitle = title.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, '\'');
    assert.ok(visibleTitle.length >= 50 && visibleTitle.length <= 60, file);
    assert.equal([...html.matchAll(/<meta\b(?=[^>]*\bname=["']description["'])/gi)].length, 1, file);
    const description = desc.match(/content=["']([^"']*)["']/i)?.[1] || '';
    assert.ok(description.length >= 140 && description.length <= 160, file);
    assert.equal([...html.matchAll(/<link\b(?=[^>]*\brel=["']canonical["'])/gi)].length, 1, file);
    assert.match(canonical, /rel=["']canonical["']/i);
    assert.equal([...html.matchAll(/<h1\b/gi)].length, 1, file);
    assert.match(html, /<html\b[^>]*lang=["'][^"']+["']/i);
    assert.match(html, /<link\b[^>]*rel=["']manifest["']/i);
    if (file !== 'index.html') {
      const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      const types = scripts.flatMap(match => {
        const data = JSON.parse(match[1]);
        return (data['@graph'] || [data]).map(node => node['@type']);
      });
      assert.ok(types.includes('BreadcrumbList'), `${file} must have BreadcrumbList JSON-LD`);
    }
  }
  assert.equal(manifest.icons.filter(icon => icon.sizes === '192x192').length, 1);
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  const faq = read('seo/faq.html');
  assert.match(faq, /Frequently Asked Questions About Triplem VIP/);
  assert.match(faq, /<script type="application\/ld\+json">/);
  assert.match(faq, /"@type": "FAQPage"/);
  assert.match(faq, /Bitcoin private keys leave my browser/);
  const robots = read('robots.txt');
  for (const bot of ['GPTBot','OAI-SearchBot','ChatGPT-User','ClaudeBot','Claude-SearchBot','PerplexityBot','Google-Extended','Applebot-Extended','CCBot']) {
    assert.match(robots, new RegExp(`User-agent: ${bot}`));
  }
  assert.ok(buildEntries().some(entry => entry.loc === 'https://triplem.vip/seo/faq.html'));
});
