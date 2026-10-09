"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel));
const text = rel => read(rel).toString("utf8");

function peInfo(data){
  assert.equal(data[0], 0x4d);
  assert.equal(data[1], 0x5a);
  const pe = data.readUInt32LE(0x3c);
  assert.equal(data.toString("ascii", pe, pe + 4), "PE\u0000\u0000");
  const coff = pe + 4;
  const sections = data.readUInt16LE(coff + 2);
  const optionalSize = data.readUInt16LE(coff + 16);
  const opt = coff + 20;
  assert.equal(data.readUInt16LE(opt), 0x20b, "Windows setup must be PE32+ x64");
  const sizeOfImage = data.readUInt32LE(opt + 56);
  const resourceRva = data.readUInt32LE(opt + 112 + (2 * 8));
  const resourceSize = data.readUInt32LE(opt + 112 + (2 * 8) + 4);
  const sectionStart = opt + optionalSize;
  const parsed = [];
  for (let i = 0; i < sections; i++) {
    const o = sectionStart + (i * 40);
    const name = data.subarray(o, o + 8).toString("ascii").replace(/\0+$/g, "");
    parsed.push({
      name,
      virtualSize: data.readUInt32LE(o + 8),
      virtualAddress: data.readUInt32LE(o + 12),
      rawSize: data.readUInt32LE(o + 16),
      rawPointer: data.readUInt32LE(o + 20)
    });
  }
  return { sizeOfImage, resourceRva, resourceSize, sections: parsed };
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

test("Windows website package is exactly one all-in-one setup executable", () => {
  const dir = path.join(root, "Assets/mobile_app/Windows");
  assert.deepEqual(fs.readdirSync(dir).sort(), ["TriplemVIP_Setup.exe"]);
  const data = read("Assets/mobile_app/Windows/TriplemVIP_Setup.exe");
  assert.ok(data.length > 1000000, "setup should be a complete native x64 executable");
  const pe = peInfo(data);
  assert.ok(pe.resourceRva > 0, "icon/manifest resources must be embedded at build time");
  assert.ok(pe.resourceRva < pe.sizeOfImage, "resource RVA must be inside the mapped PE image");
  assert.ok(pe.resourceRva + pe.resourceSize <= pe.sizeOfImage, "resource data must fit in SizeOfImage");
  const rsrc = pe.sections.find(section => section.name === ".rsrc");
  assert.ok(rsrc, "PE must contain a normal .rsrc section");
  assert.equal(rsrc.virtualAddress, pe.resourceRva, "resource directory must point to .rsrc");
});

test("native app is a separate WebView2 client with durable Triplem VIP taskbar identity", () => {
  const source = text("scripts/windows_app/native/main.go");
  assert.match(source, /https:\/\/triplem\.vip\//);
  assert.match(source, /Microsoft.*EdgeWebView.*Application/s);
  assert.match(source, /CreateWebViewEnvironmentWithOptionsInternal/);
  assert.match(source, /SetCurrentProcessExplicitAppUserModelID/);
  assert.match(source, /TriplemVIP\.Desktop/);
  assert.match(source, /SHGetPropertyStoreForWindow/);
  assert.match(source, /setWindowProperty\(store, 3, exe\+",0"\)/);
  assert.doesNotMatch(source, /setWindowIdentity\(hwnd\)/, "window property-store COM must not run before the native window is shown");
  assert.match(source, /LoadLibraryExW/);
  assert.match(source, /LOAD_WITH_ALTERED_SEARCH_PATH/);
  assert.match(source, /TriplemVIP\.log/);
  assert.match(source, /RequestPinCurrentAppAsync/);
  assert.match(source, /GetIsPinningAllowed/);
  assert.doesNotMatch(source, /--app=/);
  assert.doesNotMatch(source, /msedge\.exe/i);
  assert.doesNotMatch(source, /LICENSE AGREEMENT/);
  assert.doesNotMatch(source, /Creating installation folder/);
});

test("setup installs a distinct verified payload and does not self-copy", () => {
  const source = text("scripts/windows_app/installer/main.go");
  assert.match(source, /go:embed payload\/TriplemVIP\.exe/);
  assert.match(source, /sha256\.Sum256\(embeddedTriplemApp\)/);
  assert.match(source, /embedded application integrity check failed/);
  assert.match(source, /os\.WriteFile\(tmp, embeddedTriplemApp/);
  assert.match(source, /TriplemVIP-Setup\.log/);
  assert.match(source, /LICENSE AGREEMENT/);
  assert.match(source, /I accept the terms/);
  assert.match(source, /Choose the Triplem VIP installation folder/);
  assert.match(source, /Create Desktop shortcut/);
  assert.match(source, /Create Start Menu shortcut/);
  assert.match(source, /Ask to pin Triplem VIP on first launch/);
  assert.match(source, /CurrentVersion\\Uninstall\\TriplemVIP/);
  assert.match(source, /Installation complete/);
  assert.match(source, /procCreateProcessW\.Call\(uintptr\(unsafe\.Pointer\(app\)\)/);
  assert.match(source, /launch after setup failed/);
  assert.doesNotMatch(source, /os\.Executable\(\).*copy/s);
  assert.doesNotMatch(source, /CopyFileW/);
  assert.match(source, /CoCreateInstance/);
  assert.match(source, /IShellLinkW/);
  assert.match(source, /IPersistFile/);
  assert.match(source, /TriplemVIP\.Desktop/);
  assert.doesNotMatch(source, /NewProc\("PowerShell|exec\.Command|ExecutionPolicy\s+Bypass|Shell\.Application/i);
  assert.doesNotMatch(source, /Defender.*exclusion|Add-MpPreference|Set-MpPreference/i);
});

test("setup creates genuine Windows Shell Link shortcuts to the installed executable", () => {
  const source = text("scripts/windows_app/installer/main.go");
  assert.match(source, /IShellLinkW/);
  assert.match(source, /IPersistFile/);
  assert.match(source, /SetPath\.Call\(linkPtr/);
  assert.match(source, /SetWorkingDirectory\.Call\(linkPtr/);
  assert.match(source, /SetIconLocation\.Call\(linkPtr/);
  assert.match(source, /persist\.vtbl\.Save\.Call/);
  assert.match(source, /AppUserModelID/);
  assert.match(source, /CoTaskMemAlloc/);
  assert.match(source, /VT: 31/);
  assert.match(source, /shortcut AppUserModelID warning/);
  assert.doesNotMatch(source, /InitPropVariantFromString/);
  assert.doesNotMatch(source, /propsys\.dll/i);
  assert.doesNotMatch(source, /WScript\.Shell|powershell\.exe/i);
  assert.doesNotMatch(source, /"os\/exec"/);
});

test("setup wizard uses clean white control surfaces and high-resolution branding", () => {
  const source = text("scripts/windows_app/installer/main.go");
  assert.match(source, /WM_CTLCOLORSTATIC/);
  assert.match(source, /WM_CTLCOLOREDIT/);
  assert.match(source, /WM_CTLCOLORBTN/);
  assert.match(source, /procSetBkColor\.Call\(wParam, 0x00FFFFFF\)/);
  assert.match(source, /procLoadImageW\.Call\(hinst, 1, IMAGE_ICON, 96, 96, 0\)/);
  assert.doesNotMatch(source, /procBeginPaint\.Call[^\n]*\n\s*hdc, _, _ := procBeginPaint\.Call/s);
});

test("PE resources are attached only by the build-time resource tool", () => {
  const builder = text("scripts/windows_app/build_resources.py");
  assert.match(builder, /Place \.rsrc immediately after the current PE image/);
  assert.match(builder, /patch_pe_checksum/);
  assert.match(builder, /RT_ICON = 3/);
  assert.match(builder, /RT_MANIFEST = 24/);
  assert.match(builder, /level="asInvoker"/);
  assert.match(builder, /PerMonitorV2/);
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
