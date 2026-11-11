#!/usr/bin/env node
// Triplem VIP Home section icons (2026-11-11). Writes Assets/logo/icons/home/<key>.svg.
// Every icon is a jewel-coloured tile with a thin gold rim (the logo's teal, navy and gold),
// a glossy top light, and a white + gold glyph with a soft shadow. Run: node scripts/build_home_icons.js
"use strict";
const fs = require("fs");
const path = require("path");
const OUT = path.resolve(__dirname, "../Assets/logo/icons/home");

// [top-left light, middle, bottom-right dark]
const TILES = {
  dashboard: ["#4f8cff", "#1f55d6", "#0d2a78"],
  expenses: ["#34d399", "#0f9f72", "#064e3b"],
  inventory2: ["#2bc2b0", "#118a7d", "#063f3a"],
  goods: ["#38bdf8", "#0c84b8", "#0b3a5e"],
  accounting: ["#3a5a9e", "#1a2f63", "#0a1430"],
  audit: ["#8b8cf8", "#5048e5", "#24207a"],
  assets: ["#8fb4da", "#3f6894", "#16273f"],
  loans: ["#b892ff", "#7c4ddb", "#3b1a85"],
  installments: ["#fb7192", "#e11d58", "#7a0b2f"],
  notes: ["#ffd76a", "#eaa520", "#8a5208"],
  "triplem-ai": ["#d18bff", "#9b3fe0", "#4c1490"],
  insurance: ["#5fd0ff", "#1489d6", "#0b3f7a"],
  bitcoin: ["#ffb347", "#f28a12", "#9a4a05"],
  admin: ["#64748b", "#334155", "#0f172a"],
  messages: ["#4fd1c5", "#1592b8", "#0d3f6e"]
};

const W = "url(#w)";   // white glyph
const G = "url(#g)";   // gold glyph
const D = "#0b1d3a";   // dark detail

const GLYPHS = {
  dashboard: `
    <g opacity=".22" stroke="#fff" stroke-width="1"><path d="M24 68H78M24 56H78M24 44H78"/></g>
    <rect x="27" y="50" width="11" height="22" rx="3" fill="${W}"/>
    <rect x="44.5" y="40" width="11" height="32" rx="3" fill="${W}"/>
    <rect x="62" y="30" width="11" height="42" rx="3" fill="${W}"/>
    <path d="M24 52 L40 40 L52 45 L72 26" fill="none" stroke="${G}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M64 24.5 L75.5 22.5 L73.5 34" fill="none" stroke="${G}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  expenses: `
    <rect x="32" y="22" width="34" height="22" rx="4" transform="rotate(-12 49 33)" fill="${G}"/>
    <path d="M36 30 l22 -4.6" stroke="#9a6a12" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>
    <rect x="22" y="34" width="56" height="42" rx="9" fill="${W}"/>
    <path d="M22 44 a9 9 0 0 1 9 -10 h38" fill="none" stroke="#c9d6ea" stroke-width="2"/>
    <rect x="58" y="47" width="24" height="17" rx="6" fill="${G}"/>
    <circle cx="66" cy="55.5" r="3.4" fill="#fff8dc"/>`,
  inventory2: `
    <path d="M50 21 L76 34 L50 47 L24 34 Z" fill="#ffffff"/>
    <path d="M24 34 L50 47 L50 79 L24 66 Z" fill="#eef3fa"/>
    <path d="M50 47 L76 34 L76 66 L50 79 Z" fill="#cfdbec"/>
    <path d="M35.6 28.7 L40.4 26.3 L64.4 38.6 L59.6 41 Z" fill="${G}"/>
    <path d="M59.6 41 L64.4 38.6 L64.4 70.6 L59.6 73 Z" fill="#d9a22f"/>
    <path d="M29 51.5 v9 M31.6 52.8 v9 M33.4 53.7 v9 M36 55 v9 M38 56 v9 M40.6 57.3 v9" stroke="${D}" stroke-width="1.3" opacity=".7"/>`,
  goods: `
    <path d="M19 27 h8 l7.5 32 h33.5 l6.5 -24 H31" fill="none" stroke="${W}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M33.5 38 h38 l-5 18 H37.5 Z" fill="#ffffff" opacity=".28"/>
    <path d="M45 38 v18 M57 38 v18" stroke="#fff" stroke-width="2.4" opacity=".6"/>
    <circle cx="39" cy="70" r="5.5" fill="${G}"/>
    <circle cx="64" cy="70" r="5.5" fill="${G}"/>
    <circle cx="39" cy="70" r="2" fill="#8a5a0c"/><circle cx="64" cy="70" r="2" fill="#8a5a0c"/>`,
  accounting: `
    <rect x="29" y="18" width="42" height="64" rx="8" fill="${W}"/>
    <rect x="34" y="24" width="32" height="14" rx="3.5" fill="#0d2147"/>
    <path d="M44 33 h4 M50 33 h4 M56 33 h6" stroke="${G}" stroke-width="2.6" stroke-linecap="round"/>
    <g fill="#c6d3e8">
      <rect x="34" y="43" width="8" height="7" rx="2"/><rect x="46" y="43" width="8" height="7" rx="2"/>
      <rect x="34" y="54" width="8" height="7" rx="2"/><rect x="46" y="54" width="8" height="7" rx="2"/>
      <rect x="34" y="65" width="8" height="7" rx="2"/><rect x="46" y="65" width="8" height="7" rx="2"/>
    </g>
    <rect x="58" y="43" width="8" height="7" rx="2" fill="#c6d3e8"/>
    <rect x="58" y="54" width="8" height="18" rx="2" fill="${G}"/>
    <path d="M60 61 h4 M60 64.5 h4" stroke="#7a4f08" stroke-width="1.6" stroke-linecap="round"/>`,
  audit: `
    <path d="M27 20 h26 l12 12 v42 a5 5 0 0 1 -5 5 H27 a5 5 0 0 1 -5 -5 V25 a5 5 0 0 1 5 -5 Z" fill="${W}"/>
    <path d="M53 20 v9 a3 3 0 0 0 3 3 h9" fill="#c9d6ea"/>
    <path d="M30 40 h22 M30 48 h16 M30 56 h12" stroke="#9fb2d0" stroke-width="3" stroke-linecap="round"/>
    <circle cx="60" cy="60" r="13" fill="#2a2585" fill-opacity=".55" stroke="${G}" stroke-width="5"/>
    <path d="M69.5 69.5 L79 79" stroke="${G}" stroke-width="7" stroke-linecap="round"/>
    <path d="M54.5 60 l4 4 l7.5 -8" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  assets: `
    <rect x="22" y="30" width="32" height="50" rx="4" fill="${W}"/>
    <rect x="30" y="20" width="16" height="12" rx="3" fill="#e6edf7"/>
    <g fill="#8aa2c4">
      <rect x="27" y="37" width="7" height="6" rx="1.5"/><rect x="41" y="37" width="7" height="6" rx="1.5"/>
      <rect x="27" y="48" width="7" height="6" rx="1.5"/><rect x="41" y="48" width="7" height="6" rx="1.5"/>
      <rect x="27" y="59" width="7" height="6" rx="1.5"/><rect x="41" y="59" width="7" height="6" rx="1.5"/>
    </g>
    <rect x="33" y="69" width="10" height="11" rx="2" fill="${G}"/>
    <path d="M58 32 L66 46 L71 41 L80 58" fill="none" stroke="${G}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M72 57.5 L80.5 59.5 L82 51" fill="none" stroke="${G}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  loans: `
    <path d="M26 46 A24 24 0 0 1 68 31" fill="none" stroke="${W}" stroke-width="5" stroke-linecap="round"/>
    <path d="M60 26.5 L70 30.5 L67.5 41" fill="none" stroke="${W}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M74 54 A24 24 0 0 1 32 69" fill="none" stroke="${W}" stroke-width="5" stroke-linecap="round"/>
    <path d="M40 73.5 L30 69.5 L32.5 59" fill="none" stroke="${W}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="50" cy="50" r="15" fill="${G}"/>
    <circle cx="50" cy="50" r="11" fill="none" stroke="#a8740f" stroke-width="1.6" opacity=".7"/>
    <path d="M44.5 55.5 L55.5 44.5" stroke="#6b4705" stroke-width="2.8" stroke-linecap="round"/>
    <circle cx="45" cy="45" r="2.6" fill="#6b4705"/><circle cx="55" cy="55" r="2.6" fill="#6b4705"/>`,
  installments: `
    <rect x="21" y="26" width="58" height="52" rx="9" fill="${W}"/>
    <path d="M21 35 a9 9 0 0 1 9 -9 h40 a9 9 0 0 1 9 9 v5 H21 Z" fill="${G}"/>
    <rect x="33" y="19" width="5" height="13" rx="2.5" fill="#fff"/><rect x="62" y="19" width="5" height="13" rx="2.5" fill="#fff"/>
    <g fill="#b9c8de">
      <rect x="28" y="46" width="9" height="8" rx="2"/><rect x="41" y="46" width="9" height="8" rx="2"/><rect x="54" y="46" width="9" height="8" rx="2"/>
      <rect x="28" y="59" width="9" height="8" rx="2"/><rect x="41" y="59" width="9" height="8" rx="2"/>
    </g>
    <circle cx="64" cy="64" r="11" fill="#e11d58"/>
    <path d="M58.5 64 l4 4 l7 -8" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  notes: `
    <path d="M26 20 h38 a6 6 0 0 1 6 6 v34 l-18 18 H26 a6 6 0 0 1 -6 -6 V26 a6 6 0 0 1 6 -6 Z" fill="${W}"/>
    <path d="M52 78 V64 a4 4 0 0 1 4 -4 h14 Z" fill="#cdd9eb"/>
    <path d="M29 33 h28 M29 42 h28 M29 51 h18" stroke="#9fb2d0" stroke-width="3" stroke-linecap="round"/>
    <g transform="rotate(45 64 50)">
      <rect x="59" y="22" width="10" height="40" rx="2.5" fill="#1e3a8a"/><rect x="59" y="22" width="4" height="40" fill="#3b63c4"/>
      <rect x="59" y="22" width="10" height="7" rx="2.5" fill="#f2a7b8"/><rect x="59" y="28" width="10" height="3" fill="${G}"/>
      <path d="M59 62 h10 l-5 9 Z" fill="#f4e3c1"/>
      <path d="M62.4 68 h3.2 l-1.6 3 Z" fill="#2b2b2b"/>
    </g>`,
  "triplem-ai": `
    <path d="M44 22 C46 38 50 42 66 44 C50 46 46 50 44 66 C42 50 38 46 22 44 C38 42 42 38 44 22 Z" fill="${W}"/>
    <path d="M68 52 C69 60 71 62 79 63 C71 64 69 66 68 74 C67 66 65 64 57 63 C65 62 67 60 68 52 Z" fill="${G}"/>
    <path d="M66 22 C66.6 26 67.6 27 71.5 27.6 C67.6 28.2 66.6 29.2 66 33 C65.4 29.2 64.4 28.2 60.5 27.6 C64.4 27 65.4 26 66 22 Z" fill="${G}"/>`,
  insurance: `
    <path d="M50 18 L76 28 V48 C76 64 65 75 50 82 C35 75 24 64 24 48 V28 Z" fill="${W}"/>
    <path d="M50 24 L70 31.5 V48 C70 60.5 61.5 69.5 50 75 Z" fill="#dbe6f4"/>
    <path d="M50 64 C38 56 34 50 34 44.5 C34 39.5 38 36 42.5 36 C46 36 48.5 38 50 40.5 C51.5 38 54 36 57.5 36 C62 36 66 39.5 66 44.5 C66 50 62 56 50 64 Z" fill="${G}"/>`,
  bitcoin: `
    <circle cx="50" cy="50" r="27" fill="${G}"/>
    <circle cx="50" cy="50" r="21.5" fill="none" stroke="#a86a06" stroke-width="2" opacity=".65"/>
    <text x="50.5" y="62" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="900" fill="#fff">&#x20BF;</text>`,
  admin: `
    <path d="M50 17 L77 27 V47 C77 64 65 76 50 83 C35 76 23 64 23 47 V27 Z" fill="none" stroke="${G}" stroke-width="5.5" stroke-linejoin="round"/>
    <circle cx="50" cy="42" r="10" fill="${W}"/>
    <path d="M32 70 C34 59 41 54 50 54 C59 54 66 59 68 70 C62 75 56 77 50 78 C44 77 38 75 32 70 Z" fill="${W}"/>`,
  messages: `
    <path d="M22 30 a8 8 0 0 1 8 -8 h30 a8 8 0 0 1 8 8 v18 a8 8 0 0 1 -8 8 H38 l-11 9 v-9 h0 a8 8 0 0 1 -5 -7 Z" fill="${W}"/>
    <path d="M31 35 h28 M31 43 h20" stroke="#9fb2d0" stroke-width="3" stroke-linecap="round"/>
    <path d="M78 52 a7 7 0 0 0 -7 -7 h-7 v5 a12 12 0 0 1 -12 12 h-4 v4 a7 7 0 0 0 7 7 h12 l9 7 v-7 a7 7 0 0 0 2 -5 Z" fill="${G}"/>`
};

function svg(key) {
  const [a, b, c] = TILES[key];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-hidden="true">
  <defs>
    <linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
    <radialGradient id="l" cx=".28" cy=".18" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".55" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#e9b949"/><stop offset="1" stop-color="#9c6a14"/></linearGradient>
    <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dbe5f3"/></linearGradient>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b3"/><stop offset=".5" stop-color="#f2c14e"/><stop offset="1" stop-color="#b8821c"/></linearGradient>
    <filter id="f" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2.2" stdDeviation="1.8" flood-color="#000" flood-opacity=".32"/></filter>
    <clipPath id="c"><rect x="2" y="2" width="96" height="96" rx="26"/></clipPath>
  </defs>
  <g clip-path="url(#c)">
    <rect x="2" y="2" width="96" height="96" fill="url(#t)"/>
    <rect x="2" y="2" width="96" height="96" fill="url(#l)"/>
    <circle cx="86" cy="92" r="30" fill="#000" opacity=".12"/>
    <path d="M2 2 H98 V40 C70 50 30 50 2 40 Z" fill="url(#s)" opacity=".55"/>
  </g>
  <rect x="2.6" y="2.6" width="94.8" height="94.8" rx="25.4" fill="none" stroke="url(#r)" stroke-width="1.4" opacity=".85"/>
  <rect x="4.4" y="4.4" width="91.2" height="91.2" rx="23.8" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1"/>
  <g filter="url(#f)">${GLYPHS[key]}
  </g>
</svg>
`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const key of Object.keys(TILES)) fs.writeFileSync(path.join(OUT, `${key}.svg`), svg(key));
console.log(`Wrote ${Object.keys(TILES).length} icons to ${path.relative(process.cwd(), OUT)}`);
