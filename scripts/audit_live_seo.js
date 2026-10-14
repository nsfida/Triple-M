#!/usr/bin/env node
'use strict';

const DEFAULT_BASE = 'https://triplem.vip';
const TIMEOUT_MS = Math.max(2000, Math.min(30000, Number(process.env.SEO_AUDIT_TIMEOUT_MS || 10000)));
const PAGE_RETRIES = Math.max(0, Math.min(3, Number(process.env.SEO_PAGE_RETRIES ?? 2)));
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const INDEXNOW_KEY = 'fe79ac427d86a8002988e0a87b9a500f';

function argValue(prefix, fallback) {
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

let baseUrl;
try {
  baseUrl = new URL(argValue('--base=', DEFAULT_BASE));
  if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('Only HTTP(S) is supported');
  if (baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash) throw new Error('Base URL must be an origin, such as https://triplem.vip');
} catch (error) {
  console.error(`Invalid --base option: ${error.message}`);
  process.exit(2);
}
const BASE = baseUrl.origin;
const RETRIES = Math.max(0, Math.min(8, Number(argValue('--retries=', DEFAULT_RETRIES)) || 0));
const RETRY_DELAY_MS = Math.max(100, Math.min(10000, Number(argValue('--retry-delay=', DEFAULT_RETRY_DELAY_MS)) || DEFAULT_RETRY_DELAY_MS));
const USER_AGENT = 'TriplemVIP-SEO-Audit/2.0 (+https://triplem.vip/)';
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_SITEMAP_URLS = 50000;
const MAX_URL_LENGTH = 2048;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function get(url, options = {}) {
  const retries = options.retries ?? RETRIES;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, 'accept': options.accept || '*/*' }
      });
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }

    let serverSuggestedWait = 0;
    if (response) {
      const retryable = TRANSIENT_STATUS.has(response.status) || (options.retry404 && response.status === 404);
      if (!retryable || attempt === retries) return response;
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        const seconds = Number(retryAfter);
        const parsedDate = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter);
        if (Number.isFinite(parsedDate)) serverSuggestedWait = Math.max(0, parsedDate - Date.now());
      }
      lastError = new Error(`HTTP ${response.status}`);
    } else if (attempt === retries) {
      throw new Error(`GET ${url} failed after ${attempt + 1} attempt(s): ${lastError?.message || 'unknown network error'}`);
    }

    const backoff = Math.min(8000, RETRY_DELAY_MS * (2 ** attempt));
    const wait = Math.min(10000, Math.max(backoff, serverSuggestedWait));
    console.warn(`Temporary response for ${url}: ${lastError?.message || 'network error'}; retrying in ${wait} ms (${attempt + 1}/${retries}).`);
    await sleep(wait);
  }
  throw new Error(`GET ${url} failed: retry loop ended unexpectedly`);
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([^\s=<>/]+)\s*=\s*(["'])(.*?)\2/g)) {
    result[match[1].toLowerCase()] = match[3];
  }
  return result;
}

function htmlMeta(html, name) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if ((attrs.name || '').toLowerCase() === name.toLowerCase()) return attrs.content || '';
  }
  return '';
}

function canonicalFromHtml(html) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if ((attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical')) return attrs.href || '';
  }
  return '';
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function sitemapEntries(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('sitemap.xml must not contain a DOCTYPE or custom entity declaration.');
  if (!/^\s*<\?xml\b/i.test(xml) || !/<urlset\b[^>]*>/i.test(xml) || !/<\/urlset>\s*$/i.test(xml)) {
    throw new Error('sitemap.xml is not a well-formed sitemap document (expected XML declaration and urlset root).');
  }
  const entries = [...xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)].map(match => match[1]);
  if (!entries.length) throw new Error('sitemap.xml contains no <url> entries.');
  if (entries.length > MAX_SITEMAP_URLS) throw new Error(`sitemap.xml has ${entries.length} URLs; maximum for a single sitemap is ${MAX_SITEMAP_URLS}.`);

  const urls = entries.map((entry, index) => {
    const loc = (entry.match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i) || [])[1];
    if (!loc) throw new Error(`sitemap.xml URL entry ${index + 1} is missing <loc>.`);
    if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/i.test(loc)) throw new Error(`sitemap.xml URL entry ${index + 1} contains an unescaped ampersand.`);
    const url = decodeXml(loc.trim());
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error(`Invalid sitemap URL: ${url}`); }
    if (parsed.protocol !== 'https:' || parsed.origin !== BASE) throw new Error(`Sitemap URL must use the canonical HTTPS origin ${BASE}: ${url}`);
    if (parsed.username || parsed.password || parsed.hash) throw new Error(`Sitemap URL must not include credentials or a fragment: ${url}`);
    if (url.length > MAX_URL_LENGTH) throw new Error(`Sitemap URL exceeds ${MAX_URL_LENGTH} characters: ${url}`);
    const lastmod = (entry.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i) || [])[1];
    if (lastmod) {
      const isoDate = lastmod.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:?\d{2})?)?$/);
      if (!isoDate) throw new Error(`Invalid lastmod value for ${url}: ${lastmod}`);
      const date = new Date(`${isoDate[1]}T00:00:00.000Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate[1]) throw new Error(`Invalid calendar date in lastmod for ${url}: ${lastmod}`);
      if (isoDate[2] && (Number(isoDate[2].slice(0, 2)) > 23 || Number(isoDate[2].slice(3, 5)) > 59)) throw new Error(`Invalid time in lastmod for ${url}: ${lastmod}`);
    }
    return { url, lastmod };
  });

  const seen = new Set();
  for (const { url } of urls) {
    if (seen.has(url)) throw new Error(`Duplicate URL in sitemap.xml: ${url}`);
    seen.add(url);
  }
  if (entries.length !== [...xml.matchAll(/<loc>/gi)].length) {
    throw new Error('sitemap.xml contains a <loc> element outside a <url> entry or an unmatched URL entry.');
  }
  return urls;
}

function parseRobotsGroups(text) {
  const groups = [];
  let agents = [];
  let rules = [];
  const flush = () => {
    if (agents.length) groups.push({ agents: agents.map(a => a.toLowerCase()), rules: [...rules] });
    agents = [];
    rules = [];
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (key === 'user-agent') {
      if (rules.length) flush();
      agents.push(value);
    } else if (['allow', 'disallow'].includes(key) && agents.length && value) {
      rules.push({ type: key, path: value });
    }
  }
  flush();
  return groups;
}

function pathRuleMatches(rulePath, pathname) {
  if (!rulePath) return false;
  const anchored = rulePath.endsWith('$');
  const rawPath = anchored ? rulePath.slice(0, -1) : rulePath;
  let expression = rawPath.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  if (anchored) expression += '$';
  else expression += '.*';
  try { return new RegExp(`^${expression}`).test(pathname); } catch { return false; }
}

function pathAllowedByRules(rules, pathname) {
  const matches = rules.filter(rule => pathRuleMatches(rule.path, pathname));
  if (!matches.length) return true;
  const longest = Math.max(...matches.map(rule => rule.path.replace(/\*|\$/g, '').length));
  const mostSpecific = matches.filter(rule => rule.path.replace(/\*|\$/g, '').length === longest);
  return mostSpecific.some(rule => rule.type === 'allow');
}

function matchingRobotsRules(groups, agentName) {
  const exact = groups.filter(group => group.agents.includes(agentName.toLowerCase()));
  if (exact.length) return exact.flatMap(group => group.rules);
  return groups.filter(group => group.agents.includes('*')).flatMap(group => group.rules);
}

function requireHealthyResource(response, url, acceptedTypes, failures) {
  if (!response.ok) {
    failures.push(`${url} returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`);
    return null;
  }
  let finalUrl;
  try { finalUrl = new URL(response.url); } catch { failures.push(`${url} returned an invalid final URL.`); return null; }
  if (finalUrl.origin !== BASE) failures.push(`${url} redirected outside the expected origin to ${response.url}.`);
  const contentType = response.headers.get('content-type') || '';
  if (acceptedTypes.length && !acceptedTypes.some(type => contentType.toLowerCase().includes(type))) {
    failures.push(`${url} returned unexpected content-type "${contentType || '(missing)'}".`);
  }
  return response;
}

if (require.main === module) {
(async () => {
  const failures = [];
  const readinessRetries = Math.max(RETRIES, 5);
  console.log(`Live SEO audit target: ${BASE}; request timeout ${TIMEOUT_MS} ms; retry budget ${readinessRetries} for root discovery files.`);

  let robotsText = '';
  try {
    const response = await get(`${BASE}/robots.txt`, { retries: readinessRetries, retry404: true, accept: 'text/plain' });
    const healthy = requireHealthyResource(response, `${BASE}/robots.txt`, ['text/plain'], failures);
    if (healthy) robotsText = await healthy.text();
  } catch (error) { failures.push(error.message); }

  let sitemapText = '';
  try {
    const response = await get(`${BASE}/sitemap.xml`, { retries: readinessRetries, retry404: true, accept: 'application/xml,text/xml,*/*' });
    const healthy = requireHealthyResource(response, `${BASE}/sitemap.xml`, ['application/xml', 'text/xml'], failures);
    if (healthy) sitemapText = await healthy.text();
  } catch (error) { failures.push(error.message); }

  const extraResources = [
    { path: '/llms.txt', types: ['text/plain', 'text/markdown'], label: 'llms.txt' },
    { path: '/llms-full.txt', types: ['text/plain', 'text/markdown'], label: 'llms-full.txt' },
    { path: '/humans.txt', types: ['text/plain'], label: 'humans.txt' },
    { path: `/${INDEXNOW_KEY}.txt`, types: ['text/plain'], label: 'IndexNow key file' }
  ];
  const extraResults = await Promise.all(extraResources.map(async resource => {
    const url = `${BASE}${resource.path}`;
    try {
      const response = await get(url, { retries: readinessRetries, retry404: true, accept: resource.types.join(',') });
      const healthy = requireHealthyResource(response, url, resource.types, failures);
      if (!healthy) return null;
      const body = await healthy.text();
      if (resource.label === 'IndexNow key file' && body.trim() !== INDEXNOW_KEY) failures.push(`${url} does not contain the configured IndexNow key.`);
      if (resource.label === 'llms.txt' && !/^#\s+Triplem VIP\b/m.test(body)) failures.push(`${url} does not look like the expected Triplem VIP Markdown discovery file.`);
      if (resource.label === 'llms-full.txt' && !/^#\s+Triplem VIP\b/m.test(body)) failures.push(`${url} does not look like the expected full product reference.`);
      if (resource.label === 'humans.txt' && (!/\/\*\s*TEAM\s*\*\//i.test(body) || !/\/\*\s*SITE\s*\*\//i.test(body))) failures.push(`${url} is missing the expected humans.txt TEAM/SITE sections.`);
      return resource.label;
    } catch (error) { failures.push(error.message); return null; }
  }));

  if (robotsText) {
    const groups = parseRobotsGroups(robotsText);
    for (const agent of ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot']) {
      const rules = matchingRobotsRules(groups, agent);
      const expectedPublicPaths = ['/', '/seo/accounting-software.html', '/index.md', '/seo/accounting-software.md'];
      if (!rules.length) {
        failures.push(`robots.txt has no applicable crawl rules for ${agent}.`);
      } else if (expectedPublicPaths.some(pathname => !pathAllowedByRules(rules, pathname))) {
        failures.push(`robots.txt appears to block public HTML or the intended Markdown discovery mirror for ${agent}.`);
      } else if (pathAllowedByRules(rules, '/Backup/')) {
        failures.push(`robots.txt unexpectedly allows the excluded Backup path for ${agent}.`);
      }
    }
    const genericRules = matchingRobotsRules(groups, 'Googlebot');
    for (const agent of ['Googlebot', 'Bingbot']) {
      const rules = matchingRobotsRules(groups, agent);
      if (!rules.length || ['/', '/seo/accounting-software.html', '/regions/uae.html'].some(pathname => !pathAllowedByRules(rules, pathname))) {
        failures.push(`robots.txt must allow public canonical HTML pages for ${agent}.`);
      }
      if (pathAllowedByRules(rules, '/scripts/audit_live_seo.js') || pathAllowedByRules(rules, '/migrations/')) {
        failures.push(`robots.txt unexpectedly allows developer/source paths for ${agent}.`);
      }
    }
    if (pathAllowedByRules(genericRules, '/index.md') || pathAllowedByRules(genericRules, '/seo/accounting-software.md')) {
      failures.push('robots.txt must keep Markdown mirrors out of generic crawler results so canonical HTML remains the main search result.');
    }
    if (pathAllowedByRules(genericRules, '/Demo/')) failures.push('robots.txt must not block /Demo/ because crawlers need to read its noindex directive.');
    if (!/Sitemap:\s*https:\/\/triplem\.vip\/sitemap\.xml/i.test(robotsText)) failures.push('robots.txt is missing the canonical sitemap directive.');
  }

  let entries = [];
  if (sitemapText) {
    try { entries = sitemapEntries(sitemapText); }
    catch (error) { failures.push(error.message); }
  }

  if (entries.length) {
    console.log(`Live audit discovered ${entries.length} unique canonical sitemap URLs; checking HTTP status, final URLs, content type, robots directives and canonical tags (page retry budget ${PAGE_RETRIES}).`);
    for (let start = 0; start < entries.length; start += 8) {
      const batch = entries.slice(start, start + 8);
      const results = await Promise.all(batch.map(async ({ url }) => {
        try { return { url, response: await get(url, { retries: PAGE_RETRIES }) }; }
        catch (error) { return { url, error }; }
      }));

      for (const result of results) {
        if (result.error) { failures.push(result.error.message); continue; }
        const { url, response } = result;
        const healthy = requireHealthyResource(response, url, ['text/html'], failures);
        if (!healthy) continue;
        if (!response.ok) continue;
        if (response.url !== url) failures.push(`${url} redirected to ${response.url}; sitemap URLs should resolve directly to their final canonical URL.`);
        const html = await healthy.text();
        const robotDirectives = ['robots', 'googlebot', 'bingbot'].map(name => htmlMeta(html, name)).filter(Boolean).join(',').toLowerCase();
        const headerDirectives = (response.headers.get('x-robots-tag') || '').toLowerCase();
        if (/(?:^|[,\s])noindex(?:$|[,\s])/i.test(robotDirectives) || /(?:^|[,\s])noindex(?:$|[,\s])/i.test(headerDirectives)) {
          failures.push(`${url} is marked noindex by a meta tag or X-Robots-Tag but is included in the sitemap.`);
        }
        const canonical = canonicalFromHtml(html);
        if (!canonical) failures.push(`${url} is missing a live canonical tag.`);
        else if (canonical !== url) failures.push(`${url} canonical mismatch: ${canonical}`);
      }
    }
  }

  if (failures.length) {
    console.error(`Live SEO audit failed with ${failures.length} issue(s):`);
    failures.forEach(failure => console.error(`  - ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Live SEO audit passed. Discovery resources verified: ${extraResults.filter(Boolean).join(', ')}. Sitemap pages checked: ${entries.length}.`);
})().catch(error => {
  console.error(`Live SEO audit could not complete: ${error.stack || error.message || error}`);
  process.exitCode = 1;
});
}

module.exports = { attributes, canonicalFromHtml, decodeXml, htmlMeta, matchingRobotsRules, parseRobotsGroups, pathAllowedByRules, pathRuleMatches, sitemapEntries };
