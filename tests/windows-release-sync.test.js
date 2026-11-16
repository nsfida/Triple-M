"use strict";
/* The published Windows installer, its signed update manifest and every version
   number in the Windows sources must describe the same release. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

test("Windows release: installer, latest.json and source versions are in sync", () => {
  const version = read("scripts/windows_app/build_windows_app.sh").match(/^VERSION="([0-9.]+)"/m)[1];
  assert.match(read("scripts/windows_app/native/logic.go"), new RegExp(`appVersionNative = "${version.replace(/\./g, "\\.")}"`));
  assert.match(read("scripts/windows_app/installer/main.go"), new RegExp(`appVersion = "${version.replace(/\./g, "\\.")}"`));
  assert.match(read("scripts/windows_app/msix/AppxManifest.xml"), new RegExp(`Version="${version.replace(/\./g, "\\.")}\\.0"`));
  const exe = fs.readFileSync(path.join(root, "Assets/mobile_app/Windows/TriplemVIP_Setup.exe"));
  const manifest = JSON.parse(read("Assets/mobile_app/Windows/latest.json"));
  const payload = JSON.parse(Buffer.from(manifest.payload, "base64").toString("utf8"));
  assert.equal(payload.version, version, "latest.json announces the source version");
  assert.equal(payload.size, exe.length, "latest.json size matches the published installer");
  assert.equal(payload.sha256, crypto.createHash("sha256").update(exe).digest("hex"), "latest.json hash matches the published installer");
  assert.ok(payload.url.endsWith(`?v=${version}`));
});

test("Windows installer carries the Microsoft Store identity in its version information", () => {
  const exe = fs.readFileSync(path.join(root, "Assets/mobile_app/Windows/TriplemVIP_Setup.exe"));
  const u16 = s => Buffer.from(s, "utf16le");
  for (const s of ["Triplem VIP", "9MV028GH5NPX", "TriplemVIP.TriplemVIP_5xa2pdgfswx0g", "PublisherDisplayName"]) {
    assert.ok(exe.includes(u16(s)), `version info contains ${s}`);
  }
  const ident = read("scripts/windows_app/msix/AppxManifest.xml");
  assert.match(ident, /Name="TriplemVIP\.TriplemVIP"/);
  assert.match(ident, /Publisher="CN=D58541F4-18AA-431F-869F-990A8A8D60CE"/);
});
