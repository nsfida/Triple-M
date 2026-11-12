#!/usr/bin/env node
// Triplem VIP Home icon packs (2026-11-12). Writes Assets/logo/icons/packs/<pack>/<key>.svg.
// The glyphs are shared with scripts/build_home_icons.js; each pack restyles them:
//   jewel   jewel-coloured tile, white + gold glyph, gold rim (the Triplem VIP logo colours)
//   pastel  soft tinted tile, glyph in the section colour, gold accents
//   neon    midnight tile with a coloured edge, glowing glyph
//   luxe    one deep teal tile for every section (the logo teal), white + gold glyph, gold rim
// Run: node scripts/build_home_icon_packs.js
"use strict";
const fs = require("fs");
const path = require("path");
const { TILES, GLYPHS, svg: jewelSvgBase } = require("./build_home_icons.js");
const jewelSvg = key => jewelSvgBase(key, GLYPHS2);

const OUT = path.resolve(__dirname, "../Assets/logo/icons/packs");

function hex(c){ c = c.replace("#", ""); if (c.length === 3) c = c.split("").map(x => x + x).join(""); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16)); }
function toHex(rgb){ return "#" + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join(""); }
function mix(a, b, t){ const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); }

// Glyphs drawn to follow the owner's Standard icons (2026-11-12): the same symbol for every
// section, restyled by each pack. Colour tokens: W main (url(#w)), G gold accent (url(#g)),
// "#dbe6f4"/"#c9d6ea"/"#c6d3e8" secondary faces, "#9fb2d0" lines, "#0d2147" dark details.
const W = "url(#w)", G = "url(#g)", F = "#dbe6f4", F2 = "#c9d6ea", L = "#9fb2d0", DK = "#0d2147";
function gearPath(cx, cy, rOut, rIn, teeth){
  const pts = [];
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a0 = (Math.PI * i) / teeth - Math.PI / (teeth * 2.6);
    const a1 = (Math.PI * i) / teeth + Math.PI / (teeth * 2.6);
    pts.push([cx + r * Math.cos(a0), cy + r * Math.sin(a0)], [cx + r * Math.cos(a1), cy + r * Math.sin(a1)]);
  }
  return "M" + pts.map(p => p.map(v => v.toFixed(2)).join(" ")).join(" L") + " Z";
}
const M_MARK = `
    <g transform="translate(13.5 30) scale(.19)" stroke-linejoin="round">
      <path d="M18 26 L62 62 V302 H18 Z" fill="${W}"/>
      <path d="M366 26 L322 62 V302 H366 Z" fill="${W}"/>
      <path d="M68 192 L106 224 V302 H68 Z" fill="${G}"/>
      <path d="M316 192 L278 224 V302 H316 Z" fill="${G}"/>
      <path d="M62 146 L192 254 L322 146 V178 L192 286 L62 178 Z" fill="${F}"/>
      <path d="M62 120 L192 228 L322 120 V146 L192 254 L62 146 Z" fill="${G}"/>
      <path d="M18 26 L192 170 L366 26 L322 120 L192 228 L62 120 Z" fill="${W}"/>
      <path d="M192 12 L278 98 L254 120 L192 58 L130 120 L106 98 Z" fill="${W}"/>
      <path d="M192 66 L236 110 L192 158 L148 110 Z" fill="${G}"/>
    </g>`;
const GLYPHS2 = {
  dashboard: `
    <path d="M20 77 H80" stroke="${L}" stroke-width="3.2" stroke-linecap="round"/>
    <rect x="26" y="54" width="11" height="20" rx="3" fill="${W}"/>
    <rect x="43.5" y="45" width="11" height="29" rx="3" fill="${W}"/>
    <rect x="61" y="35" width="11" height="39" rx="3" fill="${W}"/>
    <path d="M22 46 C36 43 52 36 66 24" fill="none" stroke="${G}" stroke-width="4.6" stroke-linecap="round"/>
    <path d="M60 21.5 L72.5 19.5 L69.5 31.5 Z" fill="${G}" stroke="${G}" stroke-width="1.6" stroke-linejoin="round"/>`,
  expenses: `
    <rect x="24" y="20" width="56" height="38" rx="6" transform="rotate(-9 52 39)" fill="${F}"/>
    <rect x="17" y="30" width="66" height="44" rx="7" fill="${W}"/>
    <rect x="17" y="38" width="66" height="9" fill="${L}"/>
    <rect x="24" y="53" width="34" height="5" rx="2.5" fill="${F2}"/>
    <rect x="24" y="62" width="12" height="7" rx="2" fill="${G}"/>
    <g fill="${L}"><circle cx="61" cy="65.5" r="2.3"/><circle cx="68" cy="65.5" r="2.3"/><circle cx="75" cy="65.5" r="2.3"/></g>`,
  inventory2: `
    <rect x="17" y="36" width="60" height="37" rx="4" fill="${DK}"/>
    <rect x="21" y="40" width="52" height="29" rx="2" fill="${F}"/>
    <path d="M10 73 H84 L80 80 H14 Z" fill="${W}"/>
    <path d="M42 76 h10" stroke="${L}" stroke-width="2" stroke-linecap="round"/>
    <path d="M47 30 c-1 -10 15 -10 14 0" fill="none" stroke="${G}" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M41 29 H67 L71 64 H37 Z" fill="${G}"/>
    <circle cx="49" cy="40" r="3" fill="none" stroke="#7a4f08" stroke-width="2"/>
    <circle cx="59" cy="51" r="3" fill="none" stroke="#7a4f08" stroke-width="2"/>
    <path d="M60 37 L48 54" stroke="#7a4f08" stroke-width="2.2" stroke-linecap="round"/>`,
  goods: `
    <path d="M28.5 38 C28.5 24 49.5 24 49.5 38" fill="none" stroke="${W}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M20 35 H58 L60.5 80 H17.5 Z" fill="${W}" stroke="${W}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="28.5" cy="41" r="1.8" fill="${L}"/><circle cx="49.5" cy="41" r="1.8" fill="${L}"/>
    <path d="M53 52 C53 39 73 39 73 52" fill="none" stroke="${G}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M43.5 49 H82.5 L84.5 83 H41.5 Z" fill="${G}" stroke="${G}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="53" cy="55" r="1.8" fill="#7a4f08"/><circle cx="73" cy="55" r="1.8" fill="#7a4f08"/>`,
  accounting: `
    <rect x="27" y="17" width="46" height="66" rx="8" fill="${W}"/>
    <rect x="32.5" y="23" width="35" height="14" rx="3.5" fill="${DK}"/>
    <path d="M52 30 h11" stroke="${G}" stroke-width="2.6" stroke-linecap="round"/>
    <g fill="${L}"><circle cx="37.5" cy="47" r="4.2"/><circle cx="50" cy="47" r="4.2"/><circle cx="37.5" cy="58.5" r="4.2"/><circle cx="50" cy="58.5" r="4.2"/><rect x="33" y="66" width="21.5" height="8.5" rx="4.25"/></g>
    <g fill="${G}"><circle cx="62.5" cy="47" r="4.2"/><circle cx="62.5" cy="58.5" r="4.2"/><circle cx="62.5" cy="70.2" r="4.2"/></g>`,
  audit: `
    <rect x="31" y="23" width="36" height="50" rx="4" fill="${F}"/>
    <path d="M25 17 h23 l11 11 v42 a4 4 0 0 1 -4 4 H25 a4 4 0 0 1 -4 -4 V21 a4 4 0 0 1 4 -4 Z" fill="${W}"/>
    <path d="M48 17 v8 a3 3 0 0 0 3 3 h8" fill="${F2}"/>
    <path d="M27 36 h18 M27 43 h14 M27 50 h12 M27 57 h10 M27 64 h12" stroke="${L}" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="57" cy="57" r="12.5" fill="#ffffff" fill-opacity=".4" stroke="${G}" stroke-width="5"/>
    <path d="M66 66 L77 77" stroke="${G}" stroke-width="7" stroke-linecap="round"/>`,
  assets: `
    <g fill="${W}">
      <rect x="18" y="42" width="6.5" height="38" rx="1.6"/><rect x="27" y="49" width="6.5" height="31" rx="1.6"/>
      <rect x="36" y="54" width="6.5" height="26" rx="1.6"/><rect x="45" y="51" width="6.5" height="29" rx="1.6"/>
      <rect x="54" y="61" width="6.5" height="19" rx="1.6"/><rect x="63" y="58" width="6.5" height="22" rx="1.6"/>
      <rect x="72" y="66" width="6.5" height="14" rx="1.6"/>
    </g>
    <path d="M18 23 L32 37 L42 29 L56 43 L63 37 L71 45" fill="none" stroke="${G}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M80 54 L66 52 L77 41 Z" fill="${G}" stroke="${G}" stroke-width="1.6" stroke-linejoin="round"/>`,
  loans: `
    <path d="M39 18 C43 21 45 19 50 21 C55 19 57 21 61 18 C63 22 59 26 57 29 H43 C41 26 37 22 39 18 Z" fill="${W}"/>
    <rect x="40" y="28" width="20" height="5.5" rx="2.75" fill="${G}"/>
    <path d="M43 34 C29 41 20 54 21 66 C22 77 33 83 50 83 C67 83 78 77 79 66 C80 54 71 41 57 34 Z" fill="${W}"/>
    <path d="M57.5 50 C57 46 54 44.5 50 44.5 C45 44.5 42.5 47 42.5 50.5 C42.5 58 57.5 55 57.5 63 C57.5 66.5 54.5 69 50 69 C45.5 69 42.5 67 42 63 M50 40 V73" fill="none" stroke="${L}" stroke-width="4.2" stroke-linecap="round"/>`,
  installments: `
    <rect x="31" y="30" width="51" height="48" rx="7" fill="${W}"/>
    <path d="M31 37 a7 7 0 0 1 7 -7 h37 a7 7 0 0 1 7 7 v6 H31 Z" fill="${L}"/>
    <rect x="66" y="24" width="5" height="12" rx="2.5" fill="${F2}"/>
    <g fill="${F2}"><rect x="46" y="50" width="8" height="7" rx="1.6"/><rect x="58" y="50" width="8" height="7" rx="1.6"/><rect x="70" y="50" width="7" height="7" rx="1.6"/>
      <rect x="46" y="62" width="8" height="7" rx="1.6"/><rect x="58" y="62" width="8" height="7" rx="1.6"/><rect x="70" y="62" width="7" height="7" rx="1.6"/></g>
    <circle cx="33" cy="35" r="15.5" fill="${W}" stroke="${G}" stroke-width="4.5"/>
    <path d="M33 26 V35.5 L39.5 40" fill="none" stroke="${DK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  notes: `
    <rect x="21" y="25" width="46" height="57" rx="6" fill="${W}"/>
    <g fill="${DK}"><circle cx="29" cy="30" r="2.4"/><circle cx="37" cy="30" r="2.4"/><circle cx="45" cy="30" r="2.4"/><circle cx="53" cy="30" r="2.4"/><circle cx="61" cy="30" r="2.4"/></g>
    <g fill="${G}"><rect x="27.6" y="18" width="2.8" height="12" rx="1.4"/><rect x="35.6" y="18" width="2.8" height="12" rx="1.4"/><rect x="43.6" y="18" width="2.8" height="12" rx="1.4"/><rect x="51.6" y="18" width="2.8" height="12" rx="1.4"/><rect x="59.6" y="18" width="2.8" height="12" rx="1.4"/></g>
    <path d="M27 42 h34 M27 49 h34 M27 56 h30 M27 63 h26 M27 70 h16" stroke="${L}" stroke-width="2.6" stroke-linecap="round"/>
    <g transform="rotate(32 69 52)">
      <rect x="64" y="24" width="10" height="40" rx="2.5" fill="#f26b4f"/>
      <rect x="64" y="24" width="4" height="40" fill="#fc8a6f"/>
      <rect x="64" y="20" width="10" height="7" rx="2.5" fill="#4ec4a5"/>
      <path d="M64 64 h10 l-5 9 Z" fill="#fcd131"/>
      <path d="M67.4 70 h3.2 l-1.6 3 Z" fill="#44394a"/>
    </g>`,
  "triplem-ai": M_MARK + `
    <rect x="58" y="14" width="27" height="15" rx="7.5" fill="${G}"/>
    <text x="71.5" y="25.5" text-anchor="middle" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="10.5" font-weight="900" fill="${DK}">AI</text>`,
  insurance: `
    <path d="M50 25 L30 32 V49 C30 61 38 70 50 77 Z" fill="${W}"/>
    <path d="M50 25 L70 32 V49 C70 61 62 70 50 77 Z" fill="${F2}"/>
    <path d="M60 17 A24 24 0 0 1 77 36" fill="none" stroke="${G}" stroke-width="4.2" stroke-linecap="round"/>
    <path d="M71.5 33.5 L77.5 38.5 L81 31" fill="none" stroke="${G}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M40 83 A24 24 0 0 1 23 64" fill="none" stroke="${G}" stroke-width="4.2" stroke-linecap="round"/>
    <path d="M28.5 66.5 L22.5 61.5 L19 69" fill="none" stroke="${G}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  bitcoin: GLYPHS.bitcoin,
  admin: `
    <path d="${gearPath(61, 40, 20, 15, 8)}" fill="${G}"/>
    <circle cx="61" cy="40" r="6.5" fill="${F}"/>
    <circle cx="36" cy="52" r="11" fill="${W}"/>
    <path d="M17 82 C17 69 25 64 36 64 C47 64 55 69 55 82 Z" fill="${W}"/>`,
  messages: `
    <path d="M46 44 H72 a10 10 0 0 1 10 10 v11 a10 10 0 0 1 -6 9.2 L79 83 L67 75 H56 a10 10 0 0 1 -10 -10 Z" fill="${G}"/>
    <path d="M30 20 H58 a12 12 0 0 1 12 12 v14 a12 12 0 0 1 -12 12 H35 L21 68 L24 56.5 A12 12 0 0 1 18 46 V32 a12 12 0 0 1 12 -12 Z" fill="${W}"/>
    <g fill="${L}"><circle cx="33" cy="39" r="3.6"/><circle cx="44" cy="39" r="3.6"/><circle cx="55" cy="39" r="3.6"/></g>`
};

const LIGHT_FACES = ["#ffffff", "#eef3fa", "#cfdbec", "#dbe6f4", "#e6edf7", "#c9d6ea", "#cdd9eb", "#dbe5f3", "#c6d3e8", "#b9c8de"];
const LINES = ["#9fb2d0", "#8aa2c4"];
const DARKS = ["#0d2147", "#0b1d3a"];

/** Replaces the glyph colours. map: { w: fill for url(#w), face(c): light faces, line, dark } */
function recolor(glyph, map){
  let g = glyph;
  for (const c of LIGHT_FACES) g = g.split(`"${c}"`).join(`"${map.face(c)}"`);
  for (const c of LINES) g = g.split(`"${c}"`).join(`"${map.line}"`);
  for (const c of DARKS) g = g.split(`"${c}"`).join(`"${map.dark}"`);
  return g;
}

const COMMON_DEFS = `
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b3"/><stop offset=".5" stop-color="#f2c14e"/><stop offset="1" stop-color="#b8821c"/></linearGradient>
    <linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#e9b949"/><stop offset="1" stop-color="#9c6a14"/></linearGradient>
    <clipPath id="c"><rect x="2" y="2" width="96" height="96" rx="26"/></clipPath>`;

function pastel(key){
  const [a, b, c] = TILES[key];
  const glyph = recolor(GLYPHS2[key], {
    face: col => (col === "#ffffff" ? mix(a, "#ffffff", .2) : col === "#eef3fa" ? b : col === "#cfdbec" ? mix(b, c, .4) : mix(b, "#ffffff", .55)),
    line: "#ffffff",
    dark: c
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" aria-hidden="true">
  <defs>${COMMON_DEFS}
    <linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(a, "#ffffff", .86)}"/><stop offset="1" stop-color="${mix(b, "#ffffff", .74)}"/></linearGradient>
    <linearGradient id="w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <filter id="f" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.4" flood-color="${c}" flood-opacity=".28"/></filter>
  </defs>
  <rect x="2" y="2" width="96" height="96" rx="26" fill="url(#t)"/>
  <rect x="2.6" y="2.6" width="94.8" height="94.8" rx="25.4" fill="none" stroke="${mix(b, "#ffffff", .5)}" stroke-opacity=".7" stroke-width="1.2"/>
  <path d="M8 30 C8 16 16 8 30 8 H70" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2.2" stroke-linecap="round"/>
  <g filter="url(#f)">${glyph}
  </g>
</svg>
`;
}

function neon(key){
  const [a, b, c] = TILES[key];
  const glyph = recolor(GLYPHS2[key], {
    face: col => (col === "#ffffff" ? mix(a, "#ffffff", .25) : mix(b, "#0b1226", .15)),
    line: "#0b1226",
    dark: "#0b1226"
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" aria-hidden="true">
  <defs>${COMMON_DEFS}
    <linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a2244"/><stop offset="1" stop-color="#070b1a"/></linearGradient>
    <radialGradient id="l" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="${b}" stop-opacity=".42"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>
    <linearGradient id="e" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}" stop-opacity=".35"/></linearGradient>
    <linearGradient id="w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(a, "#ffffff", .35)}"/><stop offset="1" stop-color="${a}"/></linearGradient>
    <filter id="f" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="2.4" flood-color="${a}" flood-opacity=".75"/></filter>
  </defs>
  <g clip-path="url(#c)">
    <rect x="2" y="2" width="96" height="96" fill="url(#t)"/>
    <rect x="2" y="2" width="96" height="96" fill="url(#l)"/>
  </g>
  <rect x="2.75" y="2.75" width="94.5" height="94.5" rx="25.3" fill="none" stroke="url(#e)" stroke-width="1.5"/>
  <g filter="url(#f)">${glyph}
  </g>
</svg>
`;
}

function luxe(key){
  // jewel construction with one teal tile for every section
  const saved = TILES[key];
  TILES[key] = ["#2aa397", "#11706a", "#062f2d"];
  try { return jewelSvg(key); } finally { TILES[key] = saved; }
}

const PACKS = { jewel: jewelSvg, pastel, neon, luxe };

if (require.main === module) {
  let n = 0;
  for (const [pack, make] of Object.entries(PACKS)) {
    const dir = path.join(OUT, pack);
    fs.mkdirSync(dir, { recursive: true });
    for (const key of Object.keys(TILES)) { fs.writeFileSync(path.join(dir, `${key}.svg`), make(key)); n++; }
  }
  console.log(`Wrote ${n} icons in ${Object.keys(PACKS).length} packs to ${path.relative(process.cwd(), OUT)}`);
}
module.exports = { PACKS };
