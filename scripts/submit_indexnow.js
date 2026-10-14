#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const HOST = 'triplem.vip';
const KEY = 'fe79ac427d86a8002988e0a87b9a500f';
const KEY_FILE = path.join(__dirname, '..', `${KEY}.txt`);
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const SITE_ROOT = `https://${HOST}/`;
const MAX_URLS_PER_REQUEST = 10000;
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 20000;

function sitemapUrls() {
  const xml = fs.readFileSync(path.join(__dirname, '..', 'sitemap.xml'), 'utf8');
  const urls = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(match => match[1].trim().replace(/&amp;/g, '&')).filter(Boolean);
  if (!urls.length) throw new Error('sitemap.xml contains no URLs; refusing an empty IndexNow submission.');
  return urls;
}

function normalize(input) {
  const u = new URL(input, SITE_ROOT);
  if (u.username || u.password || u.hash) throw new Error(`Refusing URL with credentials or fragment: ${input}`);
  if (u.hostname.toLowerCase() !== HOST && u.hostname.toLowerCase() !== `www.${HOST}`) throw new Error(`Refusing non-${HOST} URL: ${input}`);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`Refusing non-web URL: ${input}`);
  u.protocol = 'https:';
  u.hostname = HOST;
  u.port = '';
  return u.toString();
}

function verifyLocalKey() {
  if (!fs.existsSync(KEY_FILE)) throw new Error(`IndexNow key file is missing: ${path.basename(KEY_FILE)}.`);
  const localKey = fs.readFileSync(KEY_FILE, 'utf8').trim();
  if (localKey !== KEY) throw new Error(`IndexNow key file ${path.basename(KEY_FILE)} does not match the configured key. Keep the key filename and file content identical.`);
}

async function postWithRetry(payload) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json; charset=utf-8', 'user-agent': 'TriplemVIP-IndexNow/2.0' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }

    if (response) {
      if (response.ok) return response;
      const body = await response.text().catch(() => '');
      lastError = new Error(`IndexNow returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}: ${body.slice(0, 500)}`);
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_ATTEMPTS) throw lastError;
    } else if (attempt === MAX_ATTEMPTS) {
      throw new Error(`IndexNow request failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message || 'unknown network error'}`);
    }

    const wait = Math.min(10000, 1000 * (2 ** (attempt - 1)));
    console.warn(`IndexNow request attempt ${attempt}/${MAX_ATTEMPTS} failed (${lastError?.message || 'network error'}); retrying in ${wait} ms.`);
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  throw lastError || new Error('IndexNow request did not complete.');
}

async function main() {
  const args = process.argv.slice(2);
  const urls = args.includes('--all') ? sitemapUrls() : args.filter(value => !value.startsWith('--')).map(normalize);
  if (!urls.length) {
    console.error('Usage: node scripts/submit_indexnow.js --all | <changed-url> [more-urls...]');
    process.exitCode = 2;
    return;
  }

  verifyLocalKey();
  const unique = [...new Set(urls.map(normalize))];
  if (unique.length > MAX_URLS_PER_REQUEST) throw new Error(`IndexNow accepts at most ${MAX_URLS_PER_REQUEST} URLs per request.`);

  const payload = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: unique };
  const response = await postWithRetry(payload);
  console.log(`IndexNow accepted ${unique.length} URL(s) for ${HOST} (HTTP ${response.status}).`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { KEY, KEY_FILE, KEY_LOCATION, HOST, normalize, sitemapUrls, verifyLocalKey };
