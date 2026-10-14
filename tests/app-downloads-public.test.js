"use strict";

// Public-checkout tests intentionally avoid reading the private/native Windows
// implementation sources. They validate only artifacts and browser-facing UI
// that are actually published in the public repository.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative));
const text = relative => read(relative).toString("utf8");

function peInfo(data) {
  assert.equal(data[0], 0x4d, "setup must start with the MZ signature");
  assert.equal(data[1], 0x5a, "setup must start with the MZ signature");
  const peOffset = data.readUInt32LE(0x3c);
  assert.equal(data.toString("ascii", peOffset, peOffset + 4), "PE\u0000\u0000");
  const coff = peOffset + 4;
  const sectionCount = data.readUInt16LE(coff + 2);
  const optionalSize = data.readUInt16LE(coff + 16);
  const optional = coff + 20;
  assert.equal(data.readUInt16LE(optional), 0x20b, "setup must be PE32+ x64");
  const imageSize = data.readUInt32LE(optional + 56);
  const resourceRva = data.readUInt32LE(optional + 112 + (2 * 8));
  const resourceSize = data.readUInt32LE(optional + 112 + (2 * 8) + 4);
  const sectionStart = optional + optionalSize;
  const sections = [];
  for (let index = 0; index < sectionCount; index++) {
    const offset = sectionStart + (index * 40);
    sections.push({
      name: data.subarray(offset, offset + 8).toString("ascii").replace(/\0+$/g, ""),
      virtualAddress: data.readUInt32LE(offset + 12)
    });
  }
  return { imageSize, resourceRva, resourceSize, sections };
}

test("Windows download is wired into landing and authenticated account UI", () => {
  const html = text("index.html");
  assert.match(html, /id="windowsDownloadBtn"/);
  assert.match(html, /id="downloadAppBtn"/);
  assert.match(html, /data-app-platform="android"/);
  assert.match(html, /data-app-platform="ios"/);
  assert.match(html, /data-app-platform="windows"/);
  assert.match(html, /Assets\/mobile_app\/Windows\/TriplemVIP_Setup\.exe\?v=20260921-shortcutfix8/);
  assert.match(html, /Accept the license, choose the installation folder/);
  assert.match(html, /approve the Windows confirmation after first launch/);
  assert.match(html, /Assets\/app\/ui\/04-app-downloads\.js/);
});

test("published Windows setup is a single complete x64 executable with embedded resources", () => {
  const directory = path.join(root, "Assets/mobile_app/Windows");
  assert.deepEqual(fs.readdirSync(directory).sort(), ["TriplemVIP_Setup.exe"]);
  const data = read("Assets/mobile_app/Windows/TriplemVIP_Setup.exe");
  assert.ok(data.length > 1000000, "setup should be a complete native x64 executable");
  const pe = peInfo(data);
  assert.ok(pe.resourceRva > 0, "icon/manifest resources must be embedded");
  assert.ok(pe.resourceRva < pe.imageSize, "resource RVA must be within the PE image");
  assert.ok(pe.resourceRva + pe.resourceSize <= pe.imageSize, "resource data must fit within the image");
  const resourceSection = pe.sections.find(section => section.name === ".rsrc");
  assert.ok(resourceSection, "PE must contain a normal .rsrc section");
  assert.equal(resourceSection.virtualAddress, pe.resourceRva, "resource directory must point to .rsrc");
});

test("app download overlay is moved to body and strictly centered on mobile", () => {
  const css = text("Assets/style/55-app-downloads.css");
  const js = text("Assets/app/ui/04-app-downloads.js");
  assert.match(js, /document\.body\.appendChild\(overlay\)/);
  assert.match(js, /triplem-apps-open/);
  assert.match(css, /height:100dvh!important/);
  assert.match(css, /display:grid!important/);
  assert.match(css, /place-items:center!important/);
  assert.match(css, /top:auto!important;bottom:auto!important/);
  assert.match(css, /max-height:calc\(100dvh/);
});
