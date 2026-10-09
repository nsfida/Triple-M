#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const BASE='https://triplem.vip';
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

const pages=['index.html','Demo/index.html','Founder/index.html','Security/index.html',...fs.readdirSync(path.join(ROOT,'seo')).filter(x=>x.endsWith('.html')).sort().map(x=>'seo/'+x),...fs.readdirSync(path.join(ROOT,'regions')).filter(x=>x.endsWith('.html')).sort().map(x=>'regions/'+x)];
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
  else { if(canonicals.has(canonical)) err(file,`duplicate canonical also used by ${canonicals.get(canonical)}`); canonicals.set(canonical,file); if(!sitemap.includes(`<loc>${canonical.replace(/&/g,'&amp;')}</loc>`)) err(file,'canonical missing from sitemap'); }
  if(!robotsMeta.toLowerCase().includes('index')) err(file,'page is not explicitly indexable');
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
if(!/Sitemap:\s*https:\/\/triplem\.vip\/sitemap\.xml/i.test(robots)) err('robots.txt','sitemap directive missing');
if(!robots.includes('Disallow: /seo/*.md$')||!robots.includes('Disallow: /regions/*.md$')) err('robots.txt','canonical HTML protection for generic crawlers is incomplete');
if(!fs.existsSync(path.join(ROOT,'llms.txt'))||!fs.existsSync(path.join(ROOT,'seo/llms.txt'))||!fs.existsSync(path.join(ROOT,'regions/llms.txt'))) err('llms','discovery maps incomplete');
for (const publicFile of ['Security/index.html']) {
  const publicHtml=read(publicFile);
  if(/"@type"\s*:\s*"FAQPage"/.test(publicHtml)) err(publicFile,'deprecated FAQPage structured data remains');
}
const e404=read('404.html'); if(!/noindex\s*,?\s*follow/i.test(e404)) err('404.html','404 page must be noindex,follow');

console.log(`SEO audit checked ${pages.length} indexable HTML pages.`);
if(warnings.length){ console.log(`Warnings (${warnings.length}):`); warnings.forEach(x=>console.log('  WARN '+x)); }
if(errors.length){ console.error(`Errors (${errors.length}):`); errors.forEach(x=>console.error('  ERROR '+x)); process.exit(1); }
console.log('SEO/GEO source audit passed.');
