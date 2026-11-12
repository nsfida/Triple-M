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
const { TILES, GLYPHS, svg: jewelSvg } = require("./build_home_icons.js");

const OUT = path.resolve(__dirname, "../Assets/logo/icons/packs");

function hex(c){ c = c.replace("#", ""); if (c.length === 3) c = c.split("").map(x => x + x).join(""); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16)); }
function toHex(rgb){ return "#" + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join(""); }
function mix(a, b, t){ const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); }

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
  const glyph = recolor(GLYPHS[key], {
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
  const glyph = recolor(GLYPHS[key], {
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
