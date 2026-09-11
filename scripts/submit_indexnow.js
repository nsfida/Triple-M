#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const HOST = "triplem.vip";
const KEY = "fe79ac427d86a8002988e0a87b9a500f";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";
const SITE_ROOT = `https://${HOST}/`;

function sitemapUrls() {
  const xml = fs.readFileSync(path.join(__dirname, "..", "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()).filter(Boolean);
}

function normalize(input) {
  const u = new URL(input, SITE_ROOT);
  if (u.hostname !== HOST && u.hostname !== `www.${HOST}`) throw new Error(`Refusing non-${HOST} URL: ${input}`);
  u.protocol = "https:";
  u.hostname = HOST;
  u.hash = "";
  return u.toString();
}

async function main() {
  const args = process.argv.slice(2);
  const urls = args.includes("--all") ? sitemapUrls() : args.filter(x => !x.startsWith("--")).map(normalize);
  if (!urls.length) {
    console.error("Usage: node scripts/submit_indexnow.js --all | <changed-url> [more-urls...]");
    process.exitCode = 2;
    return;
  }
  const unique = [...new Set(urls.map(normalize))];
  if (unique.length > 10000) throw new Error("IndexNow accepts at most 10,000 URLs per request.");
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: unique })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`IndexNow submission failed (${response.status}): ${body.slice(0, 500)}`);
  }
  console.log(`IndexNow accepted ${unique.length} URL(s) for ${HOST}.`);
}

main().catch(err => { console.error(err.message || err); process.exitCode = 1; });
