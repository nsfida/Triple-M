/* Triplem Drive - website catalogue (2026-11-23).
 * Reads triplemdrive/catalog/catalog.json: vehicle types, the listed models with their photos, routes and
 * prices, and the terms. These are shown on the public page of the business the file applies to
 * (apply_to.root = the business at /triplemdrive/, apply_to.slugs = other addresses). Cars added later
 * live in the database and are shown by site.js as before.
 * Photos: triplemdrive/catalog/photos/<file>. Until a photo file is uploaded, the same picture is shown
 * from Wikimedia Commons (free licence; credits at the bottom of the page).
 */
(function () {
  "use strict";
  const BASE = "/triplemdrive/catalog/";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const commonsFile = name => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=1600`;
  const commonsPage = name => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(String(name).replace(/ /g, "_"))}`;
  let C = null, credits = {};

  async function getJson(path) {
    const r = await fetch(`${BASE}${path}?v=${Date.now().toString(36).slice(0, 5)}`, { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }
  async function load(site) {
    try {
      const c = await getJson("catalog.json");
      const to = c.apply_to || {};
      const applies = (to.root && site.is_root) || (Array.isArray(to.slugs) && to.slugs.includes(site.slug));
      if (!applies || !Array.isArray(c.vehicles) || !Array.isArray(c.services)) return null;
      C = c;
      try { credits = await getJson("credits.json"); } catch (_) { credits = {}; }
      return C;
    } catch (_) { return null; }
  }

  const fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const price = v => (v === null || v === undefined || v === "" ? "On request" : `${C.currency || "SAR"} ${fmt.format(Number(v))}`);
  const cls = key => (C.classes || []).find(c => c.key === key) || { key, name: key };
  const vehicle = key => C.vehicles.find(v => v.key === key);
  const serviceName = s => s.name || `${s.from} ⇄ ${s.to}`;
  const minFor = key => Math.min(...C.services.map(s => Number(s.prices?.[key])).filter(Number.isFinite));

  function photoHtml(p, alt, extra = "") {
    if (!p) return `<span class="tds-ph is-none${extra}"><i class="fa-solid fa-car-side" aria-hidden="true"></i></span>`;
    return `<span class="tds-ph${extra}"><img src="${esc(BASE + "photos/" + p.file)}" data-commons="${esc(p.commons || "")}" alt="${esc(alt)}" loading="lazy" decoding="async"><i class="fa-solid fa-car-side" aria-hidden="true"></i></span>`;
  }
  // Local photo first; if it is not uploaded yet, the Wikimedia Commons copy; otherwise the placeholder.
  function onImgError(e) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.commons) return;
    if (!img.dataset.tried) { img.dataset.tried = "1"; img.src = commonsFile(img.dataset.commons); return; }
    img.closest(".tds-ph")?.classList.add("is-none"); img.remove();
  }
  function onImgLoad(e) { const img = e.target; if (img instanceof HTMLImageElement && img.dataset.commons) img.classList.add("is-in"); }

  function vehiclesHtml() {
    return `<div class="tds-cat-classes">${(C.classes || []).map(c => {
      const models = (c.models || []).map(vehicle).filter(Boolean);
      const from = minFor(c.key);
      return `<div class="tds-cat-class" data-cat-class="${esc(c.key)}">
        <div class="tds-cat-class-head"><h3>${esc(c.name)}</h3>${Number.isFinite(from) ? `<span class="tds-price"><small>From</small> ${esc(price(from))}</span>` : ""}</div>
        <div class="tds-grid">${models.map(v => `<article class="tds-card">
            <button type="button" class="tds-card-media" data-cat-open="${esc(v.key)}" aria-label="View ${esc(v.name)}">${photoHtml(v.photos?.[0], v.name)}
              ${v.photos?.length > 1 ? `<span class="tds-count"><i class="fa-regular fa-images" aria-hidden="true"></i>${v.photos.length}</span>` : ""}</button>
            <div class="tds-card-body"><h3>${esc(v.name)}</h3><small class="tds-muted">${esc(c.name)}</small>
              <div class="tds-card-foot"><span class="tds-price">${Number.isFinite(from) ? `<small>From</small> ${esc(price(from))}` : "Request a Quote"}</span>
                <button type="button" class="tds-btn is-primary" data-cat-book="${esc(v.key)}">Book</button></div></div>
          </article>`).join("")}</div></div>`;
    }).join("")}</div>`;
  }

  function priceListHtml() {
    const classes = C.classes || [];
    const head = `<tr><th scope="col">Service</th>${classes.map(c => `<th scope="col">${esc(c.name)}</th>`).join("")}<th></th></tr>`;
    return (C.service_groups || []).map(g => {
      const rows = C.services.filter(s => s.group === g.key);
      if (!rows.length) return "";
      return `<div class="tds-cat-group"><div class="tds-cat-group-head"><h3>${esc(g.name)}</h3>${g.note ? `<small>${esc(g.note)}</small>` : ""}</div>
        <div class="tds-table-wrap"><table class="tds-table"><thead>${head}</thead><tbody>${rows.map(s => `<tr>
          <th scope="row">${s.from ? `${esc(s.from)} <i class="fa-solid fa-right-left" aria-hidden="true"></i> ${esc(s.to)}` : esc(serviceName(s))}</th>
          ${classes.map(c => `<td><b>${esc(price(s.prices?.[c.key]))}</b></td>`).join("")}
          <td><button type="button" class="tds-btn" data-cat-service="${esc(s.key)}">Book</button></td></tr>`).join("")}</tbody></table></div>
        <div class="tds-cat-cards">${rows.map(s => `<div class="tds-route"><div class="tds-route-line"><b>${esc(serviceName(s))}</b></div>
          <div class="tds-cat-prices">${classes.map(c => `<span><small>${esc(c.name)}</small><b>${esc(price(s.prices?.[c.key]))}</b></span>`).join("")}</div>
          <div class="tds-route-foot"><span></span><button type="button" class="tds-btn" data-cat-service="${esc(s.key)}">Book</button></div></div>`).join("")}</div></div>`;
    }).join("");
  }

  function termsHtml() {
    const t = C.terms || {};
    if (!t.timing && !(t.lines || []).length) return "";
    return `<div class="tds-cat-terms">${t.timing ? `<div class="tds-cat-term is-key"><i class="fa-regular fa-clock" aria-hidden="true"></i><span><small>Timing</small><b>${esc(t.timing)}</b></span></div>` : ""}
      ${(t.lines || []).map(l => `<div class="tds-cat-term"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span><small>${esc(l.label)}</small><b>${esc(l.value)}</b></span></div>`).join("")}</div>`;
  }

  function sectionsHtml() {
    return `<section class="tds-sec" id="fleet"><div class="tds-wrap"><div class="tds-sec-head"><h2>Our vehicles</h2>
        <div class="tds-chips" role="radiogroup" aria-label="Vehicle types"><button type="button" role="radio" aria-checked="true" data-cat-filter="">All</button>${(C.classes || []).map(c => `<button type="button" role="radio" aria-checked="false" data-cat-filter="${esc(c.key)}">${esc(c.name)}</button>`).join("")}</div></div>
        ${vehiclesHtml()}</div></section>
      <section class="tds-sec is-tint" id="rates"><div class="tds-wrap"><h2>Prices</h2>${priceListHtml()}
        <p class="tds-muted">Prices in ${esc(C.currency || "SAR")}. Payment is arranged directly with us; nothing is charged online.</p>
        ${termsHtml()}</div></section>`;
  }

  // ---- booking form fields --------------------------------------------------------------------
  function formHtml() {
    const groups = C.service_groups || [];
    return `<section class="tds-psec tds-cat-form"><h3>Choose your trip</h3><div class="tds-fgrid">
      <label class="tds-f is-wide"><span>Service <em aria-hidden="true">*</em></span><select name="cat_service" required><option value="">Choose a route or service</option>
        ${groups.map(g => { const rows = C.services.filter(s => s.group === g.key); return rows.length ? `<optgroup label="${esc(g.name)}">${rows.map(s => `<option value="${esc(s.key)}">${esc(serviceName(s))}</option>`).join("")}</optgroup>` : ""; }).join("")}
      </select></label>
      <label class="tds-f"><span>Vehicle type <em aria-hidden="true">*</em></span><select name="cat_class" required><option value="">Choose</option>${(C.classes || []).map(c => `<option value="${esc(c.key)}">${esc(c.name)}</option>`).join("")}</select></label>
      <label class="tds-f"><span>Preferred model</span><select name="cat_model"><option value="">Any model</option></select></label>
      <div class="tds-cat-quote is-wide" data-cat-quote aria-live="polite"><span>Listed price</span><b>—</b></div>
    </div></section>`;
  }
  function syncForm(form) {
    const c = form.elements.cat_class?.value || "", m = form.elements.cat_model;
    if (m) {
      const cur = m.value;
      const list = c ? (cls(c).models || []).map(vehicle).filter(Boolean) : C.vehicles;
      m.innerHTML = `<option value="">Any model</option>${list.map(v => `<option value="${esc(v.key)}">${esc(v.name)}</option>`).join("")}`;
      if (list.some(v => v.key === cur)) m.value = cur;
    }
    const s = C.services.find(x => x.key === form.elements.cat_service?.value);
    const q = form.querySelector("[data-cat-quote] b");
    if (q) q.textContent = s && c ? price(s.prices?.[c]) : "—";
  }
  function preset(form, { model, service } = {}) {
    if (model) { const v = vehicle(model); if (v) { form.elements.cat_class.value = v.class; syncForm(form); form.elements.cat_model.value = v.key; } }
    if (service) form.elements.cat_service.value = service;
    syncForm(form);
  }
  function payload(form) {
    const s = C.services.find(x => x.key === form.elements.cat_service.value);
    const c = cls(form.elements.cat_class.value), v = vehicle(form.elements.cat_model.value);
    if (!s || !form.elements.cat_class.value) return null;
    return { vehicle: `${c.name} · ${v ? v.name : "Any model"}`, service: serviceName(s), price: price(s.prices?.[c.key]) };
  }
  function minNoticeMinutes() { return Number(C?.terms?.min_notice_minutes) || 0; }

  function creditsHtml() {
    const items = C.vehicles.flatMap(v => (v.photos || []).filter(p => p.commons).map(p => ({ v, p })));
    if (!items.length) return "";
    return `<details class="tds-credits"><summary>Vehicle photo credits</summary><ul>${items.map(({ v, p }) => {
      const cr = credits[p.file] || {};
      return `<li>${esc(v.name)}: <a href="${esc(commonsPage(p.commons))}" target="_blank" rel="noopener nofollow">${esc(p.commons)}</a>${cr.author ? ` · ${esc(cr.author)}` : ""}${cr.license ? ` · ${esc(cr.license)}` : " · Wikimedia Commons (free licence; see the file page)"}</li>`;
    }).join("")}</ul></details>`;
  }

  function dialog(dlg, key, bookable) {
    const v = vehicle(key); if (!v || !dlg) return;
    const c = cls(v.class);
    const rows = C.services.filter(s => Number.isFinite(Number(s.prices?.[c.key])));
    dlg.innerHTML = `<div class="tds-dlg-card">
      <button type="button" class="tds-dlg-x" data-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      <div class="tds-gallery">${photoHtml(v.photos?.[0], v.name, " is-big").replace("<img ", "<img data-cat-main ")}
        ${v.photos?.length > 1 ? `<div class="tds-thumbs">${v.photos.map((p, i) => `<button type="button" data-cat-thumb="${i}" aria-label="Photo ${i + 1}"${i === 0 ? ' aria-current="true"' : ""}>${photoHtml(p, "")}</button>`).join("")}</div>` : ""}</div>
      <div class="tds-dlg-body"><h2 id="tdsDlgTitle">${esc(v.name)}</h2><p class="tds-muted">${esc(c.name)}</p>
        <div class="tds-rates is-compact">${rows.map(s => `<div class="tds-rate"><div><b>${esc(serviceName(s))}</b></div><span class="tds-price">${esc(price(s.prices[c.key]))}</span></div>`).join("")}</div>
        ${bookable ? `<button type="button" class="tds-btn is-primary is-lg is-block" data-cat-book="${esc(v.key)}"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i> Book this vehicle</button>` : ""}
      </div></div>`;
    dlg.querySelectorAll("[data-cat-thumb]").forEach(b => b.addEventListener("click", () => {
      const p = v.photos[+b.dataset.catThumb], main = dlg.querySelector("[data-cat-main]");
      dlg.querySelectorAll("[data-cat-thumb]").forEach(x => x.toggleAttribute("aria-current", x === b));
      if (main) { main.removeAttribute("data-tried"); main.dataset.commons = p.commons || ""; main.src = BASE + "photos/" + p.file; }
    }));
    dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
  }

  window.TDCatalog = Object.freeze({ load, get: () => C, sectionsHtml, formHtml, syncForm, preset, payload, creditsHtml, dialog, onImgError, onImgLoad, minNoticeMinutes, count: () => C?.vehicles.length || 0 });
})();
