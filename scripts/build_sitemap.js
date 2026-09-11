#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://triplem.vip';

const escapeXml = (s) => String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function publicHtmlFiles() {
  const files = ['index.html', 'Demo/index.html', 'Founder/index.html', 'Security/index.html'];
  for (const dir of ['seo', 'regions']) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).filter(n => n.endsWith('.html')).sort()) files.push(`${dir}/${name}`);
  }
  return files.filter(f => f !== '404.html' && fs.existsSync(path.join(ROOT, f)));
}

function extractCanonical(html, relPath) {
  const m = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)
    || html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  if (m) return m[1];
  if (relPath === 'index.html') return `${BASE}/`;
  if (/\/index\.html$/.test(relPath)) return `${BASE}/${relPath.replace(/index\.html$/, '')}`;
  return `${BASE}/${relPath}`;
}

function extractModified(html, relPath) {
  const meta = html.match(/<meta\b[^>]*(?:property|name)=["']article:modified_time["'][^>]*content=["'](\d{4}-\d{2}-\d{2})/i);
  if (meta) return meta[1];
  const jsonDates = [...html.matchAll(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/g)].map(m => m[1]);
  if (jsonDates.length) return jsonDates.sort().reverse()[0];
  const stat = fs.statSync(path.join(ROOT, relPath));
  return stat.mtime.toISOString().slice(0, 10);
}

function extractAlternates(html) {
  const out = [];
  const re = /<link\b[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  const re2 = /<link\b[^>]*href=["']([^"']+)["'][^>]*hreflang=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*>/gi;
  for (const m of html.matchAll(re)) out.push([m[1], m[2]]);
  for (const m of html.matchAll(re2)) out.push([m[2], m[1]]);
  const seen = new Set();
  return out.filter(([l,u]) => { const k=`${l}|${u}`; if(seen.has(k)) return false; seen.add(k); return true; });
}

const entries = [];
for (const rel of publicHtmlFiles()) {
  const html = read(rel);
  const canonical = extractCanonical(html, rel);
  if (!canonical.startsWith(BASE)) continue;
  const entry = { loc: canonical, lastmod: extractModified(html, rel), alternates: extractAlternates(html) };
  if (rel === 'index.html') {
    entry.image = {
      loc: `${BASE}/Assets/logo/logo-wide-seo.webp`,
      title: 'Triplem VIP accounting and business finance workspace',
      caption: 'Triplem VIP accounting, operational finance, reporting and multi-currency workspace.'
    };
  }
  entries.push(entry);
}

// Canonical URLs must be unique.
const byLoc = new Map();
for (const e of entries) byLoc.set(e.loc, e);
const sorted = [...byLoc.values()].sort((a,b) => a.loc.localeCompare(b.loc));

const lines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
];
for (const e of sorted) {
  lines.push('  <url>');
  lines.push(`    <loc>${escapeXml(e.loc)}</loc>`);
  lines.push(`    <lastmod>${escapeXml(e.lastmod)}</lastmod>`);
  for (const [lang,url] of e.alternates) lines.push(`    <xhtml:link rel="alternate" hreflang="${escapeXml(lang)}" href="${escapeXml(url)}" />`);
  if (e.image) {
    lines.push('    <image:image>');
    lines.push(`      <image:loc>${escapeXml(e.image.loc)}</image:loc>`);
    lines.push(`      <image:title>${escapeXml(e.image.title)}</image:title>`);
    lines.push(`      <image:caption>${escapeXml(e.image.caption)}</image:caption>`);
    lines.push('    </image:image>');
  }
  lines.push('  </url>');
}
lines.push('</urlset>', '');
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), lines.join('\n'));
console.log(`Built sitemap.xml with ${sorted.length} canonical URLs.`);
