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
const text=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const count=(html,re)=>[...html.matchAll(re)].length;
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

const pages=['index.html','Founder/index.html','Security/index.html',...fs.readdirSync(path.join(ROOT,'seo')).filter(x=>x.endsWith('.html')).sort().map(x=>'seo/'+x),...fs.readdirSync(path.join(ROOT,'regions')).filter(x=>x.endsWith('.html')).sort().map(x=>'regions/'+x),...(fs.existsSync(path.join(ROOT,'windows-store'))?fs.readdirSync(path.join(ROOT,'windows-store')).filter(x=>x.endsWith('.html')).sort().map(x=>'windows-store/'+x):[])];
function expectedCanonicalFor(file){ if(file==='index.html') return `${BASE}/`; if(path.posix.basename(file)==='index.html') return `${BASE}/${path.posix.dirname(file)}/`; return `${BASE}/${file}`; }
const canonicals=new Map();
const sitemap=read('sitemap.xml');
const sitemapIndex=read('sitemap-index.xml');
const robots=read('robots.txt');

for(const file of pages){
  const html=read(file);
  const title=text((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]);
  const desc=attr(html,'meta','name','description','content');
  const canonical=attr(html,'link','rel','canonical','href');
  const robotsMeta=attr(html,'meta','name','robots','content');
  const h1s=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if(count(html,/<title\b/gi)!==1) err(file,'expected exactly one <title> element');
  if(!title) err(file,'missing <title>'); else if(title.length<50||title.length>60) err(file,`title should be about 50–60 characters (found ${title.length})`);
  if(count(html,/<meta\b(?=[^>]*\bname=["']description["'])/gi)!==1) err(file,'expected exactly one meta description');
  if(!desc) err(file,'missing meta description'); else if(desc.length<140||desc.length>160) err(file,`meta description should be about 140–160 characters (found ${desc.length})`);
  if(count(html,/<link\b(?=[^>]*\brel=["']canonical["'])/gi)!==1) err(file,'expected exactly one canonical link');
  if(!canonical||!canonical.startsWith(BASE)) err(file,'missing or non-production canonical');
  else { if(canonical!==expectedCanonicalFor(file)) err(file,`canonical does not match this page URL; expected ${expectedCanonicalFor(file)}`); if(canonicals.has(canonical)) err(file,`duplicate canonical also used by ${canonicals.get(canonical)}`); canonicals.set(canonical,file); if(!sitemap.includes(`<loc>${canonical.replace(/&/g,'&amp;')}</loc>`)) err(file,'canonical missing from sitemap'); }
  if(/\bnoindex\b/i.test(robotsMeta) || !/(?:^|[,\s])index(?:$|[,\s])/i.test(robotsMeta)) err(file,'page is not explicitly indexable');
  if(h1s.length!==1) err(file,`expected exactly one H1, found ${h1s.length}`);
  if(count(html,/<html\b(?=[^>]*\blang=["'][^"']+["'])/gi)!==1) err(file,'expected an explicit html lang attribute');
  if(count(html,/<meta\b(?=[^>]*\bname=["']viewport["'])/gi)!==1) err(file,'expected exactly one viewport meta tag');
  for(const [property,label] of [['og:title','og:title'],['og:description','og:description'],['og:image','og:image'],['og:url','og:url'],['og:type','og:type']]){
    if(count(html,new RegExp(`<meta\\b(?=[^>]*\\bproperty=["']${property.replace(':','\\:')}["'])`,'gi'))!==1) err(file,`expected exactly one ${label} tag`);
  }
  for(const name of ['twitter:card','twitter:title','twitter:description','twitter:image']){
    if(count(html,new RegExp(`<meta\\b(?=[^>]*\\bname=["']${name.replace(':','\\:')}["'])`,'gi'))!==1) err(file,`expected exactly one ${name} tag`);
  }
  if(count(html,/<link\b(?=[^>]*\brel=["']manifest["'])/gi)!==1) err(file,'expected exactly one site manifest link');
  let hasBreadcrumb=false;
  for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try {
      const obj=JSON.parse(m[1]);
      const nodes=Array.isArray(obj['@graph'])?obj['@graph']:[obj];
      if(nodes.some(node=>node&&node['@type']==='BreadcrumbList')) hasBreadcrumb=true;
      const hasFaq=JSON.stringify(obj).includes('FAQPage');
      if(hasFaq && file!=='seo/faq.html') err(file,'FAQPage structured data must only appear on the visible dedicated FAQ page');
      if(file==='seo/faq.html' && !hasFaq) err(file,'dedicated FAQ page must describe its visible FAQs with FAQPage JSON-LD');
    } catch(e){ err(file,`invalid JSON-LD: ${e.message}`); }
  }
  if(file!=='index.html'&&!hasBreadcrumb) err(file,'inner public pages must include a BreadcrumbList JSON-LD node');
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
for (const file of ['Demo/index.html','404.html']) {
  const html=read(file);
  if(count(html,/<link\b(?=[^>]*\brel=["']manifest["'])/gi)!==1) err(file,'expected exactly one site manifest link');
}
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

const aiAgents=['GPTBot','OAI-SearchBot','ChatGPT-User','ClaudeBot','Claude-SearchBot','PerplexityBot','Google-Extended','Applebot-Extended','CCBot','Perplexity-User','Claude-User'];
if(!/Allow:\s*\/Demo\//i.test(robots)) err('robots.txt','Demo must remain crawlable so search engines can read its noindex directive');
if(!/Sitemap:\s*https:\/\/triplem\.vip\/sitemap-index\.xml/i.test(robots)) err('robots.txt','multilingual sitemap index directive missing');
if(!/Sitemap:\s*https:\/\/triplem\.vip\/sitemap\.xml/i.test(robots)) err('robots.txt','backward-compatible full sitemap directive missing');
if(!/^<\?xml[^>]*>\s*<sitemapindex\b/i.test(sitemapIndex)) err('sitemap-index.xml','expected a valid sitemapindex document');
const sitemapIndexLocations=[...sitemapIndex.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m=>m[1]);
if(sitemapIndexLocations.length!==1 || sitemapIndexLocations[0]!=='https://triplem.vip/sitemap.xml') err('sitemap-index.xml','index must point to the full hreflang-aware sitemap.xml');
if(!/sitemapindex\s*>\s*$/i.test(sitemapIndex.trim())) err('sitemap-index.xml','sitemap index is not properly closed');
if(!robots.includes('Disallow: /seo/*.md$')||!robots.includes('Disallow: /regions/*.md$')) err('robots.txt','canonical HTML protection for generic crawlers is incomplete');
const robotGroups=parseRobotsGroups(robots);
const publicPaths=['/','/seo/faq.html','/seo/accounting-software.html','/regions/uae.html','/Demo/','/Founder/','/Security/'];
const privatePaths=['/login/','/dashboard/','/account/','/settings/','/admin/','/app/','/private/','/api/','/auth/','/billing/','/Backup/','/scripts/','/migrations/','/supabase/','/tests/'];
for(const agent of ['Googlebot','Bingbot',...aiAgents]){
  const rules=matchingRobotsRules(robotGroups,agent);
  for(const target of publicPaths) if(!rules.length||!pathAllowedByRules(rules,target)) err('robots.txt',`${agent} must be able to crawl public content (${target})`);
  for(const target of privatePaths) if(pathAllowedByRules(rules,target)) err('robots.txt',`${agent} must not be directed to crawl private/source paths (${target})`);
  if(['Googlebot','Bingbot'].includes(agent) && (pathAllowedByRules(rules,'/index.md')||pathAllowedByRules(rules,'/seo/faq.md'))) err('robots.txt',`${agent} should receive canonical HTML rather than Markdown mirrors in ordinary search results`);
  if(aiAgents.includes(agent)) for(const target of ['/index.md','/seo/faq.md','/seo/accounting-software.md']) if(!rules.length||!pathAllowedByRules(rules,target)) err('robots.txt',`${agent} must be able to retrieve approved public Markdown (${target})`);
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
// Validate the PWA manifest and ensure every referenced icon exists at the declared dimensions.
try {
  const manifest=JSON.parse(read('site.webmanifest'));
  for(const key of ['name','short_name','description','start_url','scope','display','background_color','theme_color','lang','id','categories','icons']){
    if(manifest[key]===undefined || manifest[key]===null || manifest[key]==='') err('site.webmanifest',`missing required manifest field: ${key}`);
  }
  const icons=manifest.icons||[];
  for(const expected of [{size:'192x192',purpose:'any'},{size:'512x512',purpose:'any'},{size:'512x512',purpose:'maskable'}]){
    if(!icons.some(icon=>icon.sizes===expected.size && (icon.purpose||'any').split(/\s+/).includes(expected.purpose))) err('site.webmanifest',`missing ${expected.size} ${expected.purpose} icon declaration`);
  }
  for(const icon of icons){
    const local=icon.src.startsWith('/')?icon.src.slice(1):icon.src;
    const iconPath=path.join(ROOT,local);
    if(!fs.existsSync(iconPath)){err('site.webmanifest',`manifest icon file does not exist: ${icon.src}`);continue;}
    const bytes=fs.readFileSync(iconPath);
    if(icon.type==='image/png' && (bytes.length<24 || bytes.toString('hex',0,8)!=='89504e470d0a1a0a')) err('site.webmanifest',`icon is not a valid PNG: ${icon.src}`);
    else if(icon.type==='image/png'){
      const dims=`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
      if(dims!==icon.sizes) err('site.webmanifest',`icon dimensions ${dims} do not match declared ${icon.sizes}: ${icon.src}`);
    }
  }
}catch(e){err('site.webmanifest',`invalid JSON or icon metadata: ${e.message}`);}

// Ensure every sitemap URL resolves to a local canonical HTML source file, with valid hint values.
try{
  const sitemapData=sitemapEntries(sitemap);
  const sitemapSet=new Set(sitemapData.map(entry=>entry.url));
  for(const [canonical,file] of canonicals) if(!sitemapSet.has(canonical)) err('sitemap.xml',`indexable canonical missing from sitemap: ${file} (${canonical})`);
  for(const entry of sitemapData){
    if(!canonicals.has(entry.url)) err('sitemap.xml',`URL is not an indexable source page: ${entry.url}`);
    const pathname=new URL(entry.url).pathname;
    const local=pathname.endsWith('/')?path.join(pathname.slice(1),'index.html'):pathname.slice(1);
    if(!fs.existsSync(path.join(ROOT,local))) err('sitemap.xml',`URL has no local source HTML: ${entry.url}`);
  }
  if(sitemapSet.size!==canonicals.size) err('sitemap.xml',`URL count mismatch: sitemap=${sitemapSet.size}; indexable HTML=${canonicals.size}`);
  const urlBlocks=[...sitemap.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)].map(m=>m[1]);
  for(const block of urlBlocks){
    const cf=(block.match(/<changefreq>([^<]+)<\/changefreq>/i)||[])[1];
    const pr=(block.match(/<priority>([^<]+)<\/priority>/i)||[])[1];
    if(!['always','hourly','daily','weekly','monthly','yearly','never'].includes(cf)) err('sitemap.xml',`invalid or missing changefreq: ${cf||'(missing)'}`);
    if(!pr||!/^0(?:\.\d)?$|^1(?:\.0)?$/.test(pr)) err('sitemap.xml',`invalid or missing priority: ${pr||'(missing)'}`);
  }
}catch(error){err('sitemap.xml',error.message);}
const faqHtml=read('seo/faq.html');
const faqMarkup=faqHtml.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
if(!faqMarkup) err('seo/faq.html','FAQ page is missing JSON-LD');
else try{
  const data=JSON.parse(faqMarkup[1]);
  const graph=data['@graph']||[];
  const faqNode=graph.find(node=>node['@type']==='FAQPage');
  const visibleQuestions=[...faqHtml.matchAll(/<article class="faq-item"><h3>([\s\S]*?)<\/h3>/gi)].length;
  if(!faqNode) err('seo/faq.html','FAQPage node missing');
  else if((faqNode.mainEntity||[]).length!==visibleQuestions) err('seo/faq.html',`FAQ schema question count does not match visible HTML (${(faqNode.mainEntity||[]).length} vs ${visibleQuestions})`);
}catch(e){err('seo/faq.html',`invalid FAQ JSON-LD: ${e.message}`);}
const e404=read('404.html'); if(!/noindex\s*,?\s*follow/i.test(e404)) err('404.html','404 page must be noindex,follow');

console.log(`SEO audit checked ${pages.length} canonical HTML pages, the sitemap/source URL set, crawler policy, manifest icons, JSON-LD and public AI/human discovery files.`);
if(warnings.length){ console.log(`Warnings (${warnings.length}):`); warnings.forEach(x=>console.log('  WARN '+x)); }
if(errors.length){ console.error(`Errors (${errors.length}):`); errors.forEach(x=>console.error('  ERROR '+x)); process.exit(1); }
console.log('SEO/GEO source audit passed.');
