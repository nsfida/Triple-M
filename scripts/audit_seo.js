#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const BASE='https://triplem.vip';
const { sitemapEntries, parseRobotsGroups, matchingRobotsRules, pathAllowedByRules } = require('./audit_live_seo');
let errors=[]; let warnings=[];
const err=(file,msg)=>errors.push(`${file}: ${msg}`);
const warn=(file,msg)=>warnings.push(`${file}: ${msg}`);
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const text=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const tagAttr=(tag,name)=>{ const m=tag.match(new RegExp('\\b'+name+'=[\"\']([^\"\']+)[\"\']','i')); return m?m[1]:''; };
const linkTags=html=>[...html.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]);
const attr=(html, tag, key, value, wanted) => {
  const re=new RegExp(`<${tag}\\b[^>]*${key}=["']${value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["'][^>]*${wanted}=["']([^"']+)["'][^>]*>`, 'i');
  const re2=new RegExp(`<${tag}\\b[^>]*${wanted}=["']([^"']+)["'][^>]*${key}=["']${value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["'][^>]*>`, 'i');
  return (html.match(re)||html.match(re2)||[])[1]||'';
};


function publicPathExists(rawUrl, fromFile) {
  if (!rawUrl || /^(?:https?:|mailto:|tel:|javascript:|data:)/i.test(rawUrl) || rawUrl.startsWith('#')) return true;
  let pathname;
  try {
    const baseUrl = new URL(fromFile === 'index.html' ? `${BASE}/` : `${BASE}/${fromFile}`);
    const u = new URL(rawUrl, baseUrl);
    if (u.origin !== BASE) return true;
    pathname = decodeURIComponent(u.pathname);
  } catch { return false; }
  let rel = pathname.replace(/^\/+/, '');
  if (!rel) rel = 'index.html';
  const candidates = [rel];
  if (pathname.endsWith('/')) candidates.push(path.posix.join(rel, 'index.html'));
  else if (!path.posix.extname(rel)) candidates.push(`${rel}.html`, path.posix.join(rel, 'index.html'));
  return candidates.some(c => fs.existsSync(path.join(ROOT, c)));
}

const pages=['index.html','Founder/index.html','Security/index.html',...fs.readdirSync(path.join(ROOT,'seo')).filter(x=>x.endsWith('.html')).sort().map(x=>'seo/'+x),...fs.readdirSync(path.join(ROOT,'regions')).filter(x=>x.endsWith('.html')).sort().map(x=>'regions/'+x)];
function expectedCanonicalFor(file){ if(file==='index.html') return `${BASE}/`; if(path.posix.basename(file)==='index.html') return `${BASE}/${path.posix.dirname(file)}/`; return `${BASE}/${file}`; }
const canonicals=new Map();
const sitemap=read('sitemap.xml');
const robots=read('robots.txt');

for(const file of pages){
  const html=read(file);
  const title=text((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]);
  const desc=attr(html,'meta','name','description','content');
  const canonical=attr(html,'link','rel','canonical','href');
  const robotsMeta=attr(html,'meta','name','robots','content');
  const h1s=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if(!title) err(file,'missing <title>'); else if(title.length>72) warn(file,`long title (${title.length} chars)`);
  if(!desc) err(file,'missing meta description'); else if(desc.length<70||desc.length>190) warn(file,`description length ${desc.length}`);
  if(!canonical||!canonical.startsWith(BASE)) err(file,'missing or non-production canonical');
  else { if(canonical!==expectedCanonicalFor(file)) err(file,`canonical does not match this page URL; expected ${expectedCanonicalFor(file)}`); if(canonicals.has(canonical)) err(file,`duplicate canonical also used by ${canonicals.get(canonical)}`); canonicals.set(canonical,file); if(!sitemap.includes(`<loc>${canonical.replace(/&/g,'&amp;')}</loc>`)) err(file,'canonical missing from sitemap'); }
  if(/\bnoindex\b/i.test(robotsMeta) || !/(?:^|[,\s])index(?:$|[,\s])/i.test(robotsMeta)) err(file,'page is not explicitly indexable');
  if(h1s.length!==1) err(file,`expected exactly one H1, found ${h1s.length}`);
  for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try { const obj=JSON.parse(m[1]); if(JSON.stringify(obj).includes('FAQPage')) err(file,'deprecated FAQPage structured data remains'); }
    catch(e){ err(file,`invalid JSON-LD: ${e.message}`); }
  }
  if(file.startsWith('seo/')||file.startsWith('regions/')){
    const mdTag=linkTags(html).find(t=>tagAttr(t,'rel')==='alternate' && tagAttr(t,'type')==='text/markdown');
    const md=mdTag?tagAttr(mdTag,'href'):'';
    if(!/\.md(?:$|[?#])/.test(md)) err(file,'missing Markdown alternate');
    else {
      const u=new URL(md,BASE); const local=u.pathname.replace(/^\//,'');
      if(!fs.existsSync(path.join(ROOT,local))) err(file,`Markdown alternate not found: ${local}`);
    }
  }
  for(const m of html.matchAll(/<img\b([^>]*)>/gi)) if(!/\balt=["'][^"']*["']/i.test(m[1])) warn(file,'image without alt attribute');
  for (const m of html.matchAll(/<(?:a|link)\b[^>]*(?:href)=["']([^"']+)["'][^>]*>/gi)) {
    const href=m[1];
    if (!publicPathExists(href,file)) err(file,`broken internal href: ${href}`);
  }
  for (const m of html.matchAll(/<(?:img|script|source)\b[^>]*(?:src)=["']([^"']+)["'][^>]*>/gi)) {
    const src=m[1];
    if (!publicPathExists(src,file)) err(file,`broken internal src: ${src}`);
  }
}

// The interactive demo remains available to visitors, but its app shell is not a distinct indexable landing page.
const demoHtml=read('Demo/index.html');
for(const directive of ['robots','googlebot','bingbot']){
  const value=attr(demoHtml,'meta','name',directive,'content');
  if(!/\bnoindex\b/i.test(value) || !/\bfollow\b/i.test(value)) err('Demo/index.html',`expected ${directive} noindex,follow directive`);
}
if(/<link\b[^>]*rel=[\"']canonical[\"']/i.test(demoHtml)) err('Demo/index.html','noindex demo should not declare a canonical URL');
if(/<link\b[^>]*hreflang=/i.test(demoHtml)) err('Demo/index.html','noindex demo should not declare hreflang alternates');
if(sitemap.includes('<loc>https://triplem.vip/Demo/</loc>')) err('sitemap.xml','noindex Demo page must not be included in the sitemap');

// Regional hreflang quality and reciprocity.
const regionFiles=pages.filter(f=>f.startsWith('regions/')&&f!=='regions/index.html');
const regionData=new Map();
for(const file of regionFiles){
  const html=read(file); const canonical=attr(html,'link','rel','canonical','href');
  const alts=linkTags(html).filter(t=>tagAttr(t,'rel')==='alternate' && tagAttr(t,'hreflang')).map(t=>[tagAttr(t,'hreflang'),tagAttr(t,'href')]);
  regionData.set(canonical,alts);
  if(!alts.some(([l])=>l==='x-default')) err(file,'missing x-default hreflang');
  const lang=(html.match(/<html\b[^>]*lang=["']([^"']+)/i)||[])[1];
  if(lang&&!alts.some(([l,u])=>l.toLowerCase()===lang.toLowerCase()&&u===canonical)) err(file,'missing self-referencing hreflang');
}
for(const [canonical,alts] of regionData){
  for(const [lang,target] of alts){
    if(lang==='x-default'||!regionData.has(target)) continue;
    const back=regionData.get(target);
    if(!back.some(([,u])=>u===canonical)) err(canonicals.get(canonical)||canonical,`hreflang target ${target} does not link back`);
  }
}

if(!/User-agent:\s*OAI-SearchBot/i.test(robots)) err('robots.txt','OAI-SearchBot policy missing');
if(!/User-agent:\s*Claude-SearchBot/i.test(robots)) err('robots.txt','Claude-SearchBot policy missing');
if(!/User-agent:\s*PerplexityBot/i.test(robots)) err('robots.txt','PerplexityBot policy missing');
if(!/Allow:\s*\/Demo\//i.test(robots)) err('robots.txt','Demo must remain crawlable so search engines can read its noindex directive');
if(!/Sitemap:\s*https:\/\/triplem\.vip\/sitemap\.xml/i.test(robots)) err('robots.txt','sitemap directive missing');
if(!robots.includes('Disallow: /seo/*.md$')||!robots.includes('Disallow: /regions/*.md$')) err('robots.txt','canonical HTML protection for generic crawlers is incomplete');
const robotGroups=parseRobotsGroups(robots);
for(const agent of ['Googlebot','Bingbot']){
  const rules=matchingRobotsRules(robotGroups,agent);
  for(const p of ['/','/seo/accounting-software.html','/regions/uae.html']) if(!rules.length||!pathAllowedByRules(rules,p)) err('robots.txt',`${agent} must be able to crawl public canonical HTML (${p})`);
  for(const p of ['/scripts/','/migrations/','/supabase/']) if(pathAllowedByRules(rules,p)) err('robots.txt',`${agent} must not be directed to crawl source/private implementation paths (${p})`);
  if(pathAllowedByRules(rules,'/index.md')||pathAllowedByRules(rules,'/seo/accounting-software.md')) err('robots.txt',`${agent} should receive canonical HTML rather than Markdown mirrors in ordinary search results`);
}
for(const agent of ['OAI-SearchBot','ChatGPT-User','PerplexityBot','Perplexity-User','Claude-SearchBot','Claude-User']){
  const rules=matchingRobotsRules(robotGroups,agent);
  for(const p of ['/','/seo/accounting-software.html','/index.md','/seo/accounting-software.md']) if(!rules.length||!pathAllowedByRules(rules,p)) err('robots.txt',`${agent} must be able to retrieve approved public content (${p})`);
  for(const p of ['/Backup/','/scripts/','/migrations/','/supabase/']) if(pathAllowedByRules(rules,p)) err('robots.txt',`${agent} must not be directed to retrieve excluded implementation paths (${p})`);
}
if(!fs.existsSync(path.join(ROOT,'llms.txt'))||!fs.existsSync(path.join(ROOT,'llms-full.txt'))||!fs.existsSync(path.join(ROOT,'humans.txt'))||!fs.existsSync(path.join(ROOT,'seo/llms.txt'))||!fs.existsSync(path.join(ROOT,'regions/llms.txt'))) err('discovery','root humans/llms files or sectional discovery maps are missing');
for(const file of ['llms.txt','llms-full.txt','seo/llms.txt','regions/llms.txt']){
  const content=read(file);
  if(file!=='llms-full.txt'&&!/^#\s+Triplem VIP\b/m.test(content)) err(file,'missing a clear Triplem VIP heading');
  for(const link of content.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)){
    const target=link[1];
    if(!publicPathExists(target,file)) err(file,`broken internal discovery link: ${target}`);
  }
}
const humans=read('humans.txt');
if(!/^\/\*\s*TEAM\s*\*\//im.test(humans)||!/^\/\*\s*SITE\s*\*\//im.test(humans)) err('humans.txt','expected the standard TEAM and SITE sections');
if(!/Last reviewed:\s*\d{4}\/\d{2}\/\d{2}/i.test(humans)) err('humans.txt','missing a valid Last reviewed date (YYYY/MM/DD)');
if(!/https:\/\/triplem\.vip\/humans\.txt/.test(read('index.html'))) err('index.html','missing the rel=author discovery link for humans.txt');
try{
  const sitemapData=sitemapEntries(sitemap);
  const sitemapSet=new Set(sitemapData.map(entry=>entry.url));
  for(const [canonical,file] of canonicals) if(!sitemapSet.has(canonical)) err('sitemap.xml',`indexable canonical missing from sitemap: ${file} (${canonical})`);
  for(const entry of sitemapData) if(!canonicals.has(entry.url)) err('sitemap.xml',`URL is not an indexable source page: ${entry.url}`);
  if(sitemapSet.size!==canonicals.size) err('sitemap.xml',`URL count mismatch: sitemap=${sitemapSet.size}; indexable HTML=${canonicals.size}`);
}catch(error){err('sitemap.xml',error.message);}
for (const publicFile of ['Security/index.html']) {
  const publicHtml=read(publicFile);
  if(/"@type"\s*:\s*"FAQPage"/.test(publicHtml)) err(publicFile,'deprecated FAQPage structured data remains');
}
const e404=read('404.html'); if(!/noindex\s*,?\s*follow/i.test(e404)) err('404.html','404 page must be noindex,follow');

console.log(`SEO audit checked ${pages.length} canonical HTML pages, the sitemap/source URL set, crawler policy, and public AI/human discovery files.`);
if(warnings.length){ console.log(`Warnings (${warnings.length}):`); warnings.forEach(x=>console.log('  WARN '+x)); }
if(errors.length){ console.error(`Errors (${errors.length}):`); errors.forEach(x=>console.error('  ERROR '+x)); process.exit(1); }
console.log('SEO/GEO source audit passed.');
