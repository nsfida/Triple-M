#!/usr/bin/env node
// Triplem Drive: downloads the website catalogue photos (triplemdrive/catalog/catalog.json) from
// Wikimedia Commons into triplemdrive/catalog/photos/, and writes their authors and licences to
// triplemdrive/catalog/credits.json (shown under "Vehicle photo credits" on the public page).
// Run once on your computer, check every photo, then upload the photos folder and credits.json:
//   node scripts/fetch_drive_catalog_photos.js            (skips photos that already exist)
//   node scripts/fetch_drive_catalog_photos.js --force    (downloads again)
// Needs Node.js 18 or later (built-in fetch). Only the files named in catalog.json are downloaded.
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const dir = path.join(root, "triplemdrive", "catalog");
const photos = path.join(dir, "photos");
const force = process.argv.includes("--force");
const UA = "TriplemDrive-catalogue/1.0 (https://triplem.vip)";
const strip = s => String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

(async () => {
  const cat = JSON.parse(fs.readFileSync(path.join(dir, "catalog.json"), "utf8"));
  fs.mkdirSync(photos, { recursive: true });
  const creditsFile = path.join(dir, "credits.json");
  const credits = fs.existsSync(creditsFile) ? JSON.parse(fs.readFileSync(creditsFile, "utf8")) : {};
  let ok = 0, failed = 0;
  for (const v of cat.vehicles) {
    for (const p of v.photos || []) {
      if (!p.commons || !/^[\w.-]+\.(jpe?g|png|webp)$/i.test(p.file)) continue;
      const target = path.join(photos, p.file);
      try {
        const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1600&titles=${encodeURIComponent("File:" + p.commons)}`;
        const info = await (await fetch(api, { headers: { "User-Agent": UA } })).json();
        const page = Object.values(info.query.pages)[0];
        const ii = page && page.imageinfo && page.imageinfo[0];
        if (!ii) throw new Error("file not found on Wikimedia Commons");
        const meta = ii.extmetadata || {};
        credits[p.file] = { file: p.commons, author: strip(meta.Artist && meta.Artist.value), license: strip(meta.LicenseShortName && meta.LicenseShortName.value), page: ii.descriptionurl };
        if (!fs.existsSync(target) || force) {
          const res = await fetch(ii.thumburl || ii.url, { headers: { "User-Agent": UA } });
          if (!res.ok) throw new Error(`download failed (${res.status})`);
          fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
        }
        ok++;
        console.log(`OK    ${v.name}: ${p.file}  (${credits[p.file].license || "licence on file page"}; ${credits[p.file].author || "author on file page"})`);
      } catch (e) {
        failed++;
        console.log(`FAIL  ${v.name}: ${p.file} - ${e.message}`);
      }
    }
  }
  fs.writeFileSync(creditsFile, JSON.stringify(credits, null, 2) + "\n");
  console.log(`\n${ok} photo(s) ready, ${failed} failed. Check each photo before uploading triplemdrive/catalog/photos and credits.json.`);
  if (failed) process.exitCode = 1;
})();
