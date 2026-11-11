/* Triplem VIP Inventory 2.0 - Phase 8: price and barcode labels.
 *
 * Pick items (search, a received purchase, a category or everything in stock), set how many of
 * each, choose a label size and print. Barcodes are drawn here as SVG (EAN-13, EAN-8, UPC-A and
 * Code 128), so labels work offline, in the Windows app and in any browser, on any printer
 * driver: label-roll printers (one label per page) or A4 sheets. No printer model is assumed;
 * "Nudge" moves everything a few millimetres to match a particular printer or sheet.
 *
 * Prices on labels include tax when the product's price is entered without it, so the shelf
 * price matches what the till charges.
 */
(function () {
  "use strict";
  const I = () => window.TriplemInv2;
  const Shell = () => window.TriplemInventoryV2Shell;
  const Pr = () => window.TriplemInv2Print;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---- barcode encoders ----------------------------------------------------------------------
  const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  const EAN_R = EAN_L.map(p => p.replace(/./g, c => (c === "0" ? "1" : "0")));
  const EAN_G = EAN_R.map(p => p.split("").reverse().join(""));
  const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
  function eanCheck(body) { let s = 0; const n = body.length; for (let i = 0; i < n; i++) s += Number(body[n - 1 - i]) * (i % 2 ? 1 : 3); return String((10 - (s % 10)) % 10); }
  function ean13Modules(code) {
    if (!/^\d{13}$/.test(code) || eanCheck(code.slice(0, 12)) !== code[12]) return null;
    const par = PARITY[Number(code[0])];
    let m = "101";
    for (let i = 1; i <= 6; i++) m += (par[i - 1] === "L" ? EAN_L : EAN_G)[Number(code[i])];
    m += "01010";
    for (let i = 7; i <= 12; i++) m += EAN_R[Number(code[i])];
    return m + "101";
  }
  function ean8Modules(code) {
    if (!/^\d{8}$/.test(code) || eanCheck(code.slice(0, 7)) !== code[7]) return null;
    let m = "101";
    for (let i = 0; i < 4; i++) m += EAN_L[Number(code[i])];
    m += "01010";
    for (let i = 4; i < 8; i++) m += EAN_R[Number(code[i])];
    return m + "101";
  }
  const C128 = ["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112"];
  function code128Values(text) {
    const s = String(text);
    if (!s.length || s.length > 48 || !/^[\x20-\x7e]+$/.test(s)) return null;
    if (/^\d+$/.test(s) && s.length % 2 === 0 && s.length >= 4) { // set C: two digits per symbol
      const v = [105]; for (let i = 0; i < s.length; i += 2) v.push(Number(s.slice(i, i + 2))); return v;
    }
    const v = [104]; for (const ch of s) v.push(ch.charCodeAt(0) - 32); return v;
  }
  function code128Modules(text) {
    const v = code128Values(text); if (!v) return null;
    let sum = v[0]; for (let i = 1; i < v.length; i++) sum += v[i] * i;
    const all = [...v, sum % 103, 106];
    let m = "";
    for (const val of all) { const w = C128[val]; for (let i = 0; i < w.length; i++) m += (i % 2 ? "0" : "1").repeat(Number(w[i])); }
    return m;
  }
  // Returns { type, modules, text, guards } for the best symbology, or null.
  function encode(code) {
    const c = String(code || "").trim();
    if (!c) return null;
    if (/^\d{13}$/.test(c) && ean13Modules(c)) return { type: "EAN-13", modules: ean13Modules(c), text: c };
    if (/^\d{12}$/.test(c) && ean13Modules("0" + c)) return { type: "UPC-A", modules: ean13Modules("0" + c), text: c };
    if (/^\d{8}$/.test(c) && ean8Modules(c)) return { type: "EAN-8", modules: ean8Modules(c), text: c };
    const m = code128Modules(c);
    return m ? { type: "Code 128", modules: m, text: c } : null;
  }
  // SVG in millimetres; a quiet zone of 10 modules each side is added.
  function barcodeSvg(code, widthMm, heightMm, opts = {}) {
    const e = encode(code); if (!e) return "";
    const n = e.modules.length + 20, mw = widthMm / n;
    const textH = opts.text === false ? 0 : Math.min(3.2, heightMm * 0.28);
    const barH = Math.max(heightMm - textH, 3);
    let x = 10, rects = "";
    for (let i = 0; i < e.modules.length;) {
      if (e.modules[i] === "1") { let j = i; while (j < e.modules.length && e.modules[j] === "1") j++; rects += `<rect x="${((10 + i) * mw).toFixed(3)}" y="0" width="${((j - i) * mw).toFixed(3)}" height="${barH.toFixed(2)}"/>`; i = j; } else i++;
    }
    void x;
    const txt = textH ? `<text x="${(widthMm / 2).toFixed(2)}" y="${(barH + textH * 0.86).toFixed(2)}" font-size="${(textH * 0.92).toFixed(2)}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" letter-spacing="0.2">${esc(e.text)}</text>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthMm.toFixed(2)} ${heightMm.toFixed(2)}" width="${widthMm.toFixed(2)}mm" height="${heightMm.toFixed(2)}mm" shape-rendering="crispEdges" role="img" aria-label="${esc(e.type)} ${esc(e.text)}"><g fill="#000">${rects}</g>${txt}</svg>`;
  }

  // ---- label sizes -----------------------------------------------------------------------------
  // Roll labels print one label per page. A4 sheets use common layouts (sizes in mm); "Nudge" adjusts.
  const TEMPLATES = {
    "38x25": { label: "Roll 38 × 25 mm", w: 38, h: 25 },
    "50x25": { label: "Roll 50 × 25 mm", w: 50, h: 25 },
    "50x30": { label: "Roll 50 × 30 mm", w: 50, h: 30 },
    "58x40": { label: "Roll 58 × 40 mm", w: 58, h: 40 },
    "a4-21": { label: "A4 sheet, 21 per page (63.5 × 38.1 mm)", sheet: true, w: 63.5, h: 38.1, cols: 3, rows: 7, top: 15.15, left: 7.25, px: 66.0, py: 38.1 },
    "a4-24": { label: "A4 sheet, 24 per page (63.5 × 33.9 mm)", sheet: true, w: 63.5, h: 33.9, cols: 3, rows: 8, top: 12.9, left: 7.25, px: 66.0, py: 33.9 },
    "a4-65": { label: "A4 sheet, 65 per page (38.1 × 21.2 mm)", sheet: true, w: 38.1, h: 21.2, cols: 5, rows: 13, top: 10.7, left: 4.65, px: 40.6, py: 21.2 }
  };
  const DEFAULTS = { template: "50x30", show_business: false, show_name: true, show_variant: true, show_price: true, show_sku: false, show_barcode: true, show_tax_note: true, offset_x: 0, offset_y: 0 };
  const S = { items: [], opts: null, start: 1, source: "" };
  const opts = () => (S.opts = S.opts || { ...DEFAULTS, ...((I().settings() || {}).label_settings || {}) });
  const r2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  // Shelf price: what the till charges, including tax.
  const shelfPrice = it => it.price == null ? null : (it.price_includes_tax === false && Number(it.tax_rate) > 0 ? r2(Number(it.price) * (1 + Number(it.tax_rate) / 100)) : r2(it.price));

  function labelInner(it, t, o) {
    const pad = Math.max(1.2, Math.min(t.w, t.h) * 0.06), w = t.w - pad * 2;
    const small = t.h < 26;
    const name = [it.product, o.show_variant && it.variant ? it.variant : ""].filter(Boolean).join(" - ");
    const price = shelfPrice(it), code = it.barcode || (o.show_barcode ? it.sku : "");
    const hasCode = o.show_barcode && code && encode(code);
    const nameFs = Math.max(2.3, Math.min(3.6, t.h * 0.12)), priceFs = Math.max(3.2, Math.min(6.5, t.h * 0.2));
    const bh = hasCode ? Math.max(6, t.h * (small ? 0.42 : 0.4)) : 0;
    const biz = o.show_business ? (Pr()?.business?.().name || "") : "";
    const note = o.show_tax_note && Number(it.tax_rate) > 0 && price != null ? `incl. ${Number(it.tax_rate)}% tax` : "";
    return `<div class="lab-in" style="padding:${pad.toFixed(2)}mm">
      ${biz ? `<div class="biz" dir="auto" style="font-size:${(nameFs * 0.8).toFixed(2)}mm">${esc(biz)}</div>` : ""}
      ${o.show_name ? `<div class="nm" dir="auto" style="font-size:${nameFs.toFixed(2)}mm;-webkit-line-clamp:${small ? 1 : 2}">${esc(name)}</div>` : ""}
      ${o.show_price && price != null ? `<div class="pr" style="font-size:${priceFs.toFixed(2)}mm">${esc(I().money(price))}${note ? `<small style="font-size:${(nameFs * 0.72).toFixed(2)}mm">${esc(note)}</small>` : ""}</div>` : ""}
      ${o.show_sku && it.sku ? `<div class="sk" style="font-size:${(nameFs * 0.8).toFixed(2)}mm">${esc(it.sku)}</div>` : ""}
      ${hasCode ? `<div class="bc">${barcodeSvg(code, w, bh)}</div>` : ""}</div>`;
  }

  // The full print document: one page per roll label, or A4 sheets with absolute positions.
  function labelsHtml(items = S.items, o = opts(), start = S.start) {
    const t = TEMPLATES[o.template] || TEMPLATES[DEFAULTS.template];
    const list = []; items.forEach(it => { for (let i = 0; i < Math.max(0, Math.min(999, Math.floor(Number(it.copies) || 0))); i++) list.push(it); });
    const dx = Number(o.offset_x) || 0, dy = Number(o.offset_y) || 0;
    const css = `*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#000;background:#fff}
      .lab{overflow:hidden;position:relative}.lab-in{height:100%;display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center;gap:.4mm}
      .biz{font-weight:600;line-height:1.1;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .nm{font-weight:600;line-height:1.15;max-width:100%;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
      .pr{font-weight:800;line-height:1;display:flex;flex-direction:column;align-items:center}.pr small{font-weight:500;margin-top:.3mm}
      .sk{line-height:1.1;color:#222}.bc svg{display:block}`;
    let body = "";
    if (!t.sheet) {
      body = list.map(it => `<div class="lab page" style="width:${t.w}mm;height:${t.h}mm;transform:translate(${dx}mm,${dy}mm)">${labelInner(it, t, o)}</div>`).join("");
      return `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>@page{size:${t.w}mm ${t.h}mm;margin:0}${css}.page{page-break-after:always;break-after:page}.page:last-child{page-break-after:auto;break-after:auto}</style></head><body>${body}</body></html>`;
    }
    const per = t.cols * t.rows, skip = Math.max(0, Math.min(per - 1, (Number(start) || 1) - 1));
    const cells = Array(skip).fill(null).concat(list);
    const pages = []; for (let i = 0; i < cells.length; i += per) pages.push(cells.slice(i, i + per));
    body = pages.map(pg => `<div class="sheet">${pg.map((it, i) => it ? `<div class="lab" style="left:${(t.left + dx + (i % t.cols) * t.px).toFixed(2)}mm;top:${(t.top + dy + Math.floor(i / t.cols) * t.py).toFixed(2)}mm;width:${t.w}mm;height:${t.h}mm">${labelInner(it, t, o)}</div>` : "").join("")}</div>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>@page{size:A4;margin:0}${css}
      .sheet{position:relative;width:210mm;height:296.5mm;page-break-after:always;break-after:page;overflow:hidden}.sheet:last-child{page-break-after:auto;break-after:auto}.sheet .lab{position:absolute}</style></head><body>${body}</body></html>`;
  }

  // ---- view -----------------------------------------------------------------------------------
  async function render(el, params) {
    await I().loadBoot();
    if (I().needsSetup(el)) return;
    const o = opts();
    const cats = (I().boot()?.categories || []).filter(c => c.is_active !== false);
    el.innerHTML = `
      <div class="inv2-section-head inv2-head-row"><h1><i class="fa-solid fa-tags" aria-hidden="true"></i> Labels &amp; Barcodes</h1>
        <div class="inv2-head-actions"><button type="button" class="inv2-btn primary" data-print disabled><i class="fa-solid fa-print" aria-hidden="true"></i> Print labels</button></div></div>
      <div class="inv2-lab-grid">
        <section class="inv2-card inv2-lab-items">
          <h2 class="inv2-card-title">Items</h2>
          <div class="inv2-lab-add">
            <label class="inv2-search inv2-search-inline"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="Add by name, SKU or barcode" aria-label="Find a product to add" autocomplete="off"></label>
            <div class="inv2-lab-results" data-results hidden></div>
            <div class="inv2-lab-quick">
              <button type="button" class="inv2-btn small" data-src="in_stock"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i> Everything in stock</button>
              <button type="button" class="inv2-btn small" data-src="purchase"><i class="fa-solid fa-truck-ramp-box" aria-hidden="true"></i> From received goods</button>
              ${cats.length ? `<select class="inv2-input small" data-cat aria-label="Add a category"><option value="">Add a category…</option>${cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select>` : ""}
            </div>
          </div>
          <div data-list></div>
        </section>
        <section class="inv2-card inv2-lab-setup">
          <h2 class="inv2-card-title">Label</h2>
          <label class="inv2-field"><span>Size</span><select class="inv2-input" data-o="template">${Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}"${o.template === k ? " selected" : ""}>${esc(t.label)}</option>`).join("")}</select></label>
          <div class="inv2-lab-checks">${[["show_name", "Product name"], ["show_variant", "Variant"], ["show_price", "Price"], ["show_tax_note", "“incl. tax” note"], ["show_barcode", "Barcode"], ["show_sku", "SKU"], ["show_business", "Business name"]]
            .map(([k, v]) => `<label class="inv2-check"><input type="checkbox" data-o="${k}"${o[k] ? " checked" : ""}> ${v}</label>`).join("")}</div>
          <div class="inv2-lab-row" data-sheetonly><label class="inv2-field"><span>Start at label</span><input class="inv2-input" type="number" min="1" max="65" step="1" value="${S.start}" data-start></label></div>
          <details class="inv2-lab-nudge"><summary>Nudge for your printer</summary>
            <div class="inv2-lab-row"><label class="inv2-field"><span>Right (mm)</span><input class="inv2-input" type="number" step="0.5" min="-10" max="10" value="${Number(o.offset_x) || 0}" data-o="offset_x"></label>
            <label class="inv2-field"><span>Down (mm)</span><input class="inv2-input" type="number" step="0.5" min="-10" max="10" value="${Number(o.offset_y) || 0}" data-o="offset_y"></label></div></details>
          ${I().isOwner() ? `<button type="button" class="inv2-btn small" data-save>Use as default</button>` : ""}
          <h2 class="inv2-card-title">Preview</h2>
          <div class="inv2-lab-preview" data-preview aria-live="polite"></div>
          <p class="inv2-note" data-summary></p>
        </section>
      </div>`;
    const q = el.querySelector("[data-q]"), res = el.querySelector("[data-results]"); let t = 0, seq = 0;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(async () => {
      const term = q.value.trim(); const my = ++seq;
      if (!term) { res.hidden = true; return; }
      let rows = [];
      try { rows = await I().rpc("app_inv2_pos_items", { p_search: term, p_category_id: null, p_location_id: null, p_limit: 12 }); } catch (e) { rows = []; }
      if (my !== seq) return;
      res.hidden = false;
      res.innerHTML = rows.length ? rows.map((r, i) => `<button type="button" data-pick="${i}"><span dir="auto"><strong>${esc(r.name)}${r.variant_name ? ` - ${esc(r.variant_name)}` : ""}</strong><small>${esc([r.sku, r.barcode].filter(Boolean).join(" · "))}</small></span><span>${esc(I().money(r.sell_price))}</span></button>`).join("") : `<p class="inv2-note">No products found.</p>`;
      res.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => { add(el, { variant_ids: [rows[Number(b.dataset.pick)].variant_id] }); q.value = ""; res.hidden = true; q.focus(); }));
    }, 220); });
    q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); res.querySelector("[data-pick]")?.click(); } if (e.key === "Escape") res.hidden = true; });
    el.querySelector('[data-src="in_stock"]').addEventListener("click", () => add(el, { in_stock: true, location_id: I().location() || null }, "everything in stock"));
    el.querySelector('[data-src="purchase"]').addEventListener("click", () => pickPurchase(el));
    el.querySelector("[data-cat]")?.addEventListener("change", e => { if (e.target.value) { add(el, { category_id: e.target.value }); e.target.value = ""; } });
    el.querySelectorAll("[data-o]").forEach(inp => inp.addEventListener(inp.type === "checkbox" ? "change" : "input", () => {
      const k = inp.dataset.o; o[k] = inp.type === "checkbox" ? inp.checked : inp.type === "number" ? Math.max(-10, Math.min(10, Number(inp.value) || 0)) : inp.value; refresh(el);
    }));
    el.querySelector("[data-start]").addEventListener("input", e => { S.start = Math.max(1, Math.floor(Number(e.target.value) || 1)); refresh(el); });
    el.querySelector("[data-print]").addEventListener("click", () => { if (S.items.length) Pr().print(labelsHtml()); });
    el.querySelector("[data-save]")?.addEventListener("click", async () => {
      try { const r = await I().rpc("app_inv2_report_settings_save", { p: { label_settings: o } }); if (I().settings()) I().settings().label_settings = r.label_settings; Shell().toast("Saved as the default label."); }
      catch (e) { Shell().toast(e.message || String(e)); }
    });
    if (params && params.purchase_id) await add(el, { purchase_id: params.purchase_id }, "received goods");
    else if (params && params.variant_ids) await add(el, { variant_ids: params.variant_ids });
    refresh(el);
  }

  async function add(el, source, what) {
    let r;
    try { r = await I().rpc("app_inv2_label_items", { p_source: source }); } catch (e) { Shell().toast(e.message || String(e)); return; }
    let added = 0;
    for (const it of r.items || []) {
      const have = S.items.find(x => x.variant_id === it.variant_id);
      if (have) { if (source.purchase_id || source.in_stock) have.copies = it.copies; } else { S.items.push({ ...it, copies: source.variant_ids || source.category_id ? 1 : it.copies }); added++; }
    }
    if (what) Shell().toast(r.items?.length ? `Added ${r.items.length} item${r.items.length === 1 ? "" : "s"} from ${what}.` : `Nothing found in ${what}.`);
    void added;
    refresh(el);
  }

  async function pickPurchase(el) {
    let r;
    try { r = await I().rpc("app_inv2_purchases_list", { p_type: "purchase", p_status: null, p_search: null, p_supplier_id: null, p_limit: 20, p_offset: 0 }); } catch (e) { Shell().toast(e.message || String(e)); return; }
    const rows = (r.rows || []).filter(x => x.status === "completed");
    I().dialog({ title: "Labels for received goods", subtitle: "One label for every unit received.", submitLabel: "Close",
      body: rows.length ? `<div class="inv2-lab-results is-static">${rows.map((x, i) => `<button type="button" data-pu="${i}"><span dir="auto"><strong>${esc(x.doc_no)}</strong><small>${esc(x.supplier_name || "")} · ${esc(x.doc_date || "")}</small></span><span>${esc(I().money(x.total))}</span></button>`).join("")}</div>` : `<p class="inv2-note">No received goods yet.</p>`,
      onOpen: box => box.querySelectorAll("[data-pu]").forEach(b => b.addEventListener("click", () => { const x = rows[Number(b.dataset.pu)]; box.closest(".inv2-dialog-wrap")?.remove(); add(el, { purchase_id: x.id }, x.doc_no); })),
      onSubmit: async () => true });
  }

  function refresh(el) {
    const list = el.querySelector("[data-list]"), o = opts(), t = TEMPLATES[o.template] || TEMPLATES[DEFAULTS.template];
    el.querySelector("[data-sheetonly]").hidden = !t.sheet;
    const total = S.items.reduce((a, it) => a + Math.max(0, Math.floor(Number(it.copies) || 0)), 0);
    el.querySelector("[data-print]").disabled = !total;
    list.innerHTML = S.items.length ? `<div class="inv2-lab-list">${S.items.map((it, i) => `<div class="inv2-lab-item">
        <span dir="auto"><strong>${esc(it.product)}${it.variant ? ` - ${esc(it.variant)}` : ""}</strong><small>${esc([it.sku, it.barcode || (it.sku ? "SKU as barcode" : "no barcode"), shelfPrice(it) != null ? I().money(shelfPrice(it)) : ""].filter(Boolean).join(" · "))}</small></span>
        <label class="inv2-lab-copies"><span class="sr-only">Copies</span><input class="inv2-input" type="number" min="0" max="999" step="1" value="${it.copies}" data-copies="${i}" aria-label="Copies of ${esc(it.product)}"></label>
        <button type="button" class="inv2-icon-btn" data-remove="${i}" aria-label="Remove ${esc(it.product)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`).join("")}</div>
        <button type="button" class="inv2-btn small" data-clear>Clear list</button>`
      : `<div class="inv2-empty"><i class="fa-solid fa-tags" aria-hidden="true"></i><p>Add products to print their labels.</p></div>`;
    list.querySelectorAll("[data-copies]").forEach(inp => inp.addEventListener("input", () => { S.items[Number(inp.dataset.copies)].copies = Math.max(0, Math.min(999, Math.floor(Number(inp.value) || 0))); summary(el); el.querySelector("[data-print]").disabled = !S.items.some(x => x.copies > 0); }));
    list.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", () => { S.items.splice(Number(b.dataset.remove), 1); refresh(el); }));
    list.querySelector("[data-clear]")?.addEventListener("click", () => { S.items = []; refresh(el); });
    const pv = el.querySelector("[data-preview]");
    const sample = S.items[0] || { product: "Sample product", variant: "", sku: "SKU-001", barcode: "2000000000015", price: 10, tax_rate: 5, price_includes_tax: false };
    const scale = Math.min(1, 240 / (t.w * 3.78));
    pv.innerHTML = `<div class="inv2-lab-sample" style="width:${t.w}mm;height:${t.h}mm;transform:scale(${Math.max(scale, 0.6).toFixed(3)})">${labelInner(sample, t, o)}</div>`;
    summary(el);
  }
  function summary(el) {
    const o = opts(), t = TEMPLATES[o.template] || TEMPLATES[DEFAULTS.template];
    const total = S.items.reduce((a, it) => a + Math.max(0, Math.floor(Number(it.copies) || 0)), 0);
    const pages = t.sheet ? Math.ceil((total + Math.max(0, S.start - 1)) / (t.cols * t.rows)) : total;
    const missing = S.items.filter(it => o.show_barcode && !(it.barcode || it.sku)).length;
    el.querySelector("[data-summary]").textContent = total ? `${total} label${total === 1 ? "" : "s"} on ${pages} ${t.sheet ? "sheet" : "label"}${pages === 1 ? "" : "s"}.${missing ? ` ${missing} item${missing === 1 ? " has" : "s have"} no barcode or SKU.` : ""}` : "";
  }

  function init() { Shell()?.register("labels", { render }); }
  window.TriplemInv2Labels = { encode, barcodeSvg, ean13Modules, ean8Modules, code128Modules, labelsHtml, shelfPrice, TEMPLATES, state: S, add: (src) => add(document.getElementById("inv2App"), src) };
  if (window.TriplemInventoryV2Shell) init(); else document.addEventListener("DOMContentLoaded", init);
})();
