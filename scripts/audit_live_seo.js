#!/usr/bin/env node
'use strict';

const baseArg=process.argv.find(a=>a.startsWith('--base='));
const BASE=(baseArg?baseArg.slice(7):'https://triplem.vip').replace(/\/$/,'');
const TIMEOUT=15000;
async function get(url){
  const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),TIMEOUT);
  try{return await fetch(url,{redirect:'follow',signal:ctl.signal,headers:{'user-agent':'TriplemVIP-SEO-Audit/1.0'}});}finally{clearTimeout(t);}
}
function locs(xml){return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replace(/&amp;/g,'&'));}
(async()=>{
  const failures=[];
  const robots=await get(`${BASE}/robots.txt`); if(!robots.ok) failures.push(`robots.txt HTTP ${robots.status}`); else {const t=await robots.text(); if(!/OAI-SearchBot/i.test(t)) failures.push('OAI-SearchBot policy missing from live robots.txt');}
  const sm=await get(`${BASE}/sitemap.xml`); if(!sm.ok) failures.push(`sitemap.xml HTTP ${sm.status}`); else {
    const urls=locs(await sm.text()).filter(u=>u.startsWith(BASE));
    console.log(`Live audit discovered ${urls.length} sitemap URLs.`);
    for(let i=0;i<urls.length;i+=6){
      const batch=urls.slice(i,i+6);
      const rs=await Promise.all(batch.map(async u=>{try{return [u,await get(u)]}catch(e){return [u,e]}}));
      for(const [u,r] of rs){
        if(r instanceof Error){failures.push(`${u} ${r.message}`);continue;}
        if(!r.ok){failures.push(`${u} HTTP ${r.status}`);continue;}
        const ct=r.headers.get('content-type')||''; if(!ct.includes('text/html')) failures.push(`${u} unexpected content-type ${ct}`);
        const html=await r.text();
        if(/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)) failures.push(`${u} is noindex`);
        const canon=(html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)||[])[1];
        if(!canon) failures.push(`${u} missing live canonical`);
      }
    }
  }
  if(failures.length){console.error('Live SEO audit failed:');failures.forEach(x=>console.error('  '+x));process.exit(1);}
  console.log('Live SEO audit passed.');
})().catch(e=>{console.error(e);process.exit(1)});
