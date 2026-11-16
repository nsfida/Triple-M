#!/usr/bin/env node
"use strict";
/*
 * Right-to-left stylesheets for the Arabic and Urdu pages (2026-11-16).
 *
 * Writes Assets/style/app.bundle.rtl.css and Assets/style/app.feature.bundle.rtl.css from the
 * left-to-right bundles by mirroring horizontal values: left/right properties and keywords,
 * 4-value margin/padding/inset/border shorthands, border-radius corners, float/clear,
 * text-align, horizontal background positions and translateX in transforms that position
 * (not centre) an element. Zero dependencies, like the rest of the build.
 *
 * Not mirrored:
 *  - rules whose selector already mentions [dir=rtl] / :dir(rtl) (written for RTL on purpose);
 *  - declarations after a /*rtl:ignore*\/ comment, or blocks under /*rtl:begin:ignore*\/ … /*rtl:end:ignore*\/;
 *  - `left:50%` / `right:50%` with translateX(-50%) (centring stays centring);
 *  - `left:auto !important` / `right:auto !important` resets in rules with no other left/right
 *    (they make room for positions set by script from on-screen measurements).
 *
 * Usage: node scripts/build_rtl_css.js [--check]
 */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const PAIRS = [
  ["Assets/style/app.bundle.css", "Assets/style/app.bundle.rtl.css"],
  ["Assets/style/app.feature.bundle.css", "Assets/style/app.feature.bundle.rtl.css"]
];

const swapWord = s => s.replace(/\b(left|right)\b/g, m => (m === "left" ? "right" : "left"));
const PROP_SWAP = /^(-webkit-|-moz-)?(margin|padding|border|inset|scroll-margin|scroll-padding)-(left|right)(-|$)|^(left|right)$|^border-(top|bottom)-(left|right)-radius$/;

function split4(v){
  // split a value by top-level spaces (not inside parentheses)
  const parts = []; let depth = 0, cur = "";
  for (const ch of v) {
    if (ch === "(") depth++; if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) { parts.push(cur); cur = ""; } } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}
function flipBox(v){
  const imp = /\s*!important\s*$/i.exec(v); const core = imp ? v.slice(0, imp.index) : v;
  const p = split4(core.trim());
  if (p.length === 4 && p[1] !== p[3]) return [p[0], p[3], p[2], p[1]].join(" ") + (imp ? imp[0] : "");
  return v;
}
function flipRadius(v){
  const imp = /\s*!important\s*$/i.exec(v); const core = imp ? v.slice(0, imp.index) : v;
  const flipSet = s => {
    const p = split4(s.trim());
    if (p.length === 4) return [p[1], p[0], p[3], p[2]].join(" ");
    if (p.length === 3) return [p[1], p[0], p[1], p[2]].join(" ");
    if (p.length === 2) return [p[1], p[0]].join(" ");
    return s.trim();
  };
  return core.split("/").map(flipSet).join(" / ") + (imp ? imp[0] : "");
}
function negate(x){ return /^-/.test(x) ? x.slice(1) : x === "0" || /^0[a-z%]*$/.test(x) ? x : "-" + x; }
function flipTransform(v){
  return v.replace(/translateX\(\s*([^)]+?)\s*\)/g, (m, a) => (/^-?50%$/.test(a) ? m : `translateX(${negate(a)})`))
          .replace(/translate\(\s*([^,)]+?)\s*(,\s*[^)]+)?\)/g, (m, a, b) => (/^-?50%$/.test(a) ? m : `translate(${negate(a)}${b || ""})`));
}
function flipBgPos(v){
  return v.replace(/(^|\s|,)(\d+(?:\.\d+)?)%/g, (m, pre, n) => pre + (100 - parseFloat(n)) + "%");
}

function flipDecl(prop, value, ctx){
  const p = prop.toLowerCase();
  let np = p, nv = value;
  if (/^(-webkit-|-moz-)?(margin|padding|border|inset|scroll-margin|scroll-padding)-(left|right)/.test(p) || /^(left|right)$/.test(p)) np = swapWord(p);
  else if (/^border-(top|bottom)-(left|right)-radius$/.test(p)) np = swapWord(p);
  if (p === "left" || p === "right") {
    if (/^50%/.test(value.trim()) && ctx.centred) np = p; // centring
  }
  if (/^(margin|padding|inset|border-width|border-style|border-color|scroll-margin|scroll-padding)$/.test(p)) nv = flipBox(value);
  else if (p === "border-radius") nv = flipRadius(value);
  else if (/^(float|clear|text-align|caption-side|justify-self|justify-items|text-align-last)$/.test(p)) nv = swapWord(value);
  else if (/^(transform|-webkit-transform)$/.test(p) && !ctx.centred) nv = flipTransform(value);
  else if (/^(background-position|background-position-x|-webkit-mask-position|mask-position|object-position)$/.test(p)) nv = flipBgPos(swapWord(value));
  else if (p === "background" && /\b(left|right)\b/.test(value)) nv = swapWord(value);
  else if (/^(transform-origin|perspective-origin)$/.test(p)) nv = swapWord(value);
  else if (p === "cursor") nv = value.replace(/\b(e|w|ne|nw|se|sw)-resize\b/g, m => ({ "e-resize": "w-resize", "w-resize": "e-resize", "ne-resize": "nw-resize", "nw-resize": "ne-resize", "se-resize": "sw-resize", "sw-resize": "se-resize" })[m]);
  else if ((p === "left" || p === "right") && /\b(left|right)\b/.test(value)) nv = swapWord(value);
  return [np, nv];
}

function flipBlock(body){
  // body: declarations text of one rule (no nested rules)
  const centred = /translate(X)?\(\s*-50%/.test(body);
  // `left:auto !important` / `right:auto !important` alone in a rule is a reset that lets
  // script code place the element with an inline left/right measured on screen. Screen
  // coordinates are the same in RTL, so such a reset must keep its side (flipping it would
  // cancel the script's inline position and push menus off the window).
  const sides = body.match(/(^|[;{\s])(left|right)\s*:\s*[^;}]+/g) || [];
  const onlyAutoReset = sides.length > 0 && sides.every(d => /:\s*auto\s*!important/i.test(d));
  let ignoreNext = false;
  return body.replace(/(\/\*[\s\S]*?\*\/)|([-\w]+)\s*:\s*((?:[^;{}"'()]|"[^"]*"|'[^']*'|\([^()]*(?:\([^()]*\)[^()]*)*\))*)(;?)/g, (m, comment, prop, value, semi) => {
    if (comment) { if (/rtl:ignore/.test(comment)) ignoreNext = true; return m; }
    if (ignoreNext) { ignoreNext = false; return m; }
    if (prop.startsWith("--")) return m; // custom properties: values are used elsewhere
    if (onlyAutoReset && /^(left|right)$/i.test(prop)) return m;
    const [np, nv] = flipDecl(prop, value, { centred });
    return `${np}:${nv}${semi}`;
  });
}

function flipCss(css){
  let out = "", i = 0, ignoreDepth = 0;
  // Tokenise into comments, at-rule headers, selectors and blocks.
  const stack = []; // selector strings of open rules
  let buf = "";
  while (i < css.length) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2); const c = css.slice(i, end + 2);
      if (/rtl:begin:ignore/.test(c)) ignoreDepth++; if (/rtl:end:ignore/.test(c)) ignoreDepth = Math.max(0, ignoreDepth - 1);
      buf += c; i = end + 2; continue;
    }
    if (ch === '"' || ch === "'") { const end = css.indexOf(ch, i + 1); buf += css.slice(i, end + 1); i = end + 1; continue; }
    if (ch === "{") {
      const head = buf; out += head + "{"; stack.push(head.trim()); buf = ""; i++; continue;
    }
    if (ch === "}") {
      const sel = stack.pop() || "";
      const isAt = /^@/.test(sel);
      const rtlAware = /\[dir=("|')?rtl\1\]|:dir\(rtl\)|\[dir="rtl"\]/.test(sel) || stack.some(s => /\[dir=("|')?rtl\1\]|:dir\(rtl\)/.test(s));
      const keyframes = /^@(-webkit-)?keyframes/.test(stack[stack.length - 1] || "");
      out += (isAt || rtlAware || ignoreDepth || /^@(font-face|property|counter-style|page)/.test(sel)) ? buf : (keyframes ? flipBlock(buf) : flipBlock(buf));
      out += "}"; buf = ""; i++; continue;
    }
    buf += ch; i++;
  }
  return out + buf;
}

function build({ check = false } = {}){
  let stale = [];
  for (const [src, dst] of PAIRS) {
    const input = fs.readFileSync(path.join(root, src), "utf8");
    const header = `/* GENERATED by scripts/build_rtl_css.js from ${path.basename(src)} for the Arabic and Urdu pages. Do not edit. */\n`;
    const next = header + flipCss(input);
    const target = path.join(root, dst);
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
    if (current !== next) { if (check) stale.push(dst); else fs.writeFileSync(target, next, "utf8"); }
  }
  if (check && stale.length) { console.error("RTL stylesheets are out of date: " + stale.join(", ") + ". Run npm run build:styles."); process.exit(1); }
  console.log(check ? "RTL stylesheets are up to date." : "RTL stylesheets written.");
}
if (require.main === module) build({ check: process.argv.includes("--check") });
module.exports = { flipCss, flipDecl, build };
