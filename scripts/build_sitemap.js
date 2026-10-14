#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://triplem.vip';
const MAX_URLS = 50000;
const MAX_URL_LENGTH = 2048;

const escapeXml = value => String(value).replace(/[<>&"']/g, char => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
}[char]));
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([^\s=<>/]+)\s*=\s*(["'])(.*?)\2/g)) {
    result[match[1].toLowerCase()] = match[3];
  }
  return result;
}

function tags(html, name) {
  const expression = new RegExp(`<${name}\\b[^>]*>`, 'gi');
  return [...html.matchAll(expression)].map(match => match[0]);
}

function publicHtmlFiles() {
  const files = ['index.html', 'Demo/index.html', 'Founder/index.html', 'Security/index.html'];
  for (const directory of ['seo', 'regions']) {
    const absolute = path.join(ROOT, directory);
    if (!fs.existsSync(absolute)) continue;
    for (const name of fs.readdirSync(absolute).filter(entry => entry.endsWith('.html')).sort()) {
      files.push(`${directory}/${name}`);
    }
  }
  return files.filter(file => file !== '404.html' && fs.existsSync(path.join(ROOT, file)));
}

function extractCanonical(html, relativePath) {
  for (const tag of tags(html, 'link')) {
    const attrs = attributes(tag);
    if ((attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical')) return attrs.href || '';
  }
  throw new Error(`${relativePath}: canonical link is missing; refusing to invent a sitemap URL.`);
}

function isNoindex(html) {
  const directives = tags(html, 'meta').map(attributes)
    .filter(attrs => ['robots', 'googlebot', 'bingbot'].includes((attrs.name || '').toLowerCase()))
    .map(attrs => attrs.content || '');
  return directives.some(content => /(?:^|[,\s])noindex(?:$|[,\s])/i.test(content));
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function extractModified(html, relativePath) {
  const candidates = [];
  for (const tag of tags(html, 'meta')) {
    const attrs = attributes(tag);
    if ((attrs.property || '').toLowerCase() === 'article:modified_time' || (attrs.name || '').toLowerCase() === 'dateModified'.toLowerCase()) {
      const value = (attrs.content || '').slice(0, 10);
      if (validIsoDate(value)) candidates.push(value);
    }
  }
  // Only use author-maintained dateModified/modified-time facts. File mtimes are
  // deployment artifacts and must not masquerade as meaningful content updates.
  for (const match of html.matchAll(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})(?:T[^"]*)?"/g)) {
    if (validIsoDate(match[1])) candidates.push(match[1]);
  }
  if (!candidates.length) return '';
  const distinct = [...new Set(candidates)];
  if (distinct.length > 1) {
    // Structured data can describe multiple entities. Prefer the newest valid
    // explicit content date, but never infer a date from build/deploy time.
    console.warn(`${relativePath}: multiple explicit modification dates found (${distinct.join(', ')}); using the newest date.`);
  }
  return distinct.sort().at(-1);
}

function extractAlternates(html, relativePath) {
  const alternates = [];
  for (const tag of tags(html, 'link')) {
    const attrs = attributes(tag);
    if (!(attrs.rel || '').toLowerCase().split(/\s+/).includes('alternate') || !attrs.hreflang || !attrs.href) continue;
    const target = new URL(attrs.href, BASE);
    if (target.protocol !== 'https:' || target.origin !== BASE || target.username || target.password || target.hash || target.search) {
      throw new Error(`${relativePath}: hreflang target must be a clean canonical HTTPS URL on ${BASE}: ${attrs.href}`);
    }
    alternates.push([attrs.hreflang, target.href]);
  }
  const seen = new Set();
  return alternates.filter(([language, url]) => {
    const key = `${language}|${url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildEntries() {
  const entries = [];
  for (const relativePath of publicHtmlFiles()) {
    const html = read(relativePath);
    if (isNoindex(html)) continue;

    const canonical = extractCanonical(html, relativePath);
    let parsed;
    try { parsed = new URL(canonical); }
    catch { throw new Error(`${relativePath}: invalid canonical URL: ${canonical}`); }
    if (parsed.protocol !== 'https:' || parsed.origin !== BASE || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error(`${relativePath}: canonical must use the clean HTTPS origin ${BASE}: ${canonical}`);
    }
    if (canonical.length > MAX_URL_LENGTH) throw new Error(`${relativePath}: canonical URL exceeds ${MAX_URL_LENGTH} characters.`);
    if (canonical !== parsed.href) throw new Error(`${relativePath}: canonical URL is not normalized: ${canonical}`);

    const entry = {
      loc: canonical,
      lastmod: extractModified(html, relativePath),
      alternates: extractAlternates(html, relativePath)
    };
    if (relativePath === 'index.html') {
      entry.image = {
        loc: `${BASE}/Assets/logo/logo-wide-seo.webp`,
        title: 'Triplem VIP accounting and business finance workspace',
        caption: 'Triplem VIP accounting, operational finance, reporting and multi-currency workspace.'
      };
    }
    entries.push(entry);
  }

  const byLoc = new Map();
  for (const entry of entries) {
    if (byLoc.has(entry.loc)) {
      throw new Error(`Duplicate canonical URL in sitemap source pages: ${entry.loc} (${byLoc.get(entry.loc)} and another page).`);
    }
    byLoc.set(entry.loc, entry);
  }
  const sorted = [...byLoc.values()].sort((a, b) => a.loc.localeCompare(b.loc));
  if (!sorted.length) throw new Error('Refusing to generate an empty sitemap.');
  if (sorted.length > MAX_URLS) throw new Error(`Sitemap has ${sorted.length} URLs; maximum for one sitemap is ${MAX_URLS}.`);
  return sorted;
}

function generateXml(entries) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
  ];
  for (const entry of entries) {
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(entry.loc)}</loc>`);
    if (entry.lastmod) lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
    for (const [language, url] of entry.alternates) {
      lines.push(`    <xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(url)}" />`);
    }
    if (entry.image) {
      lines.push('    <image:image>');
      lines.push(`      <image:loc>${escapeXml(entry.image.loc)}</image:loc>`);
      lines.push(`      <image:title>${escapeXml(entry.image.title)}</image:title>`);
      lines.push(`      <image:caption>${escapeXml(entry.image.caption)}</image:caption>`);
      lines.push('    </image:image>');
    }
    lines.push('  </url>');
  }
  lines.push('</urlset>', '');
  return lines.join('\n');
}

function buildSitemap() {
  const entries = buildEntries();
  const output = path.join(ROOT, 'sitemap.xml');
  fs.writeFileSync(output, generateXml(entries), 'utf8');
  console.log(`Built sitemap.xml with ${entries.length} unique canonical, indexable URLs.`);
  return entries.length;
}

if (require.main === module) {
  try { buildSitemap(); }
  catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { buildSitemap, buildEntries, extractAlternates, extractCanonical, extractModified, generateXml, isNoindex, publicHtmlFiles, validIsoDate };
