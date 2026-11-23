/* Triplem Drive - public business page (2026-11-23, Triplem VIP look).
 *
 * https://triplem.vip/<address>/ (Triplem Drive itself: https://triplem.vip/triplemdrive/). Other addresses
 * reach this page through 404.html (/<address>/ -> /triplemdrive/?b=<address>); the short address is put
 * back in the address bar. Earlier /triplemdrive/<address>/ links still work.
 *
 * Layout like Triplem VIP: a header with round icon buttons, tabs (Vehicles, Prices, Routes, FAQ, Contact),
 * and every detail in a side panel: car details, booking (car selection, pickup and drop-off typed or
 * picked on a map), inquiries and photo credits.
 *
 * Data: app_drive_public_site (published businesses only; never registrations, notes, ids or customer
 * data) and, for Triplem Drive, triplemdrive/catalog/catalog.json (listed cars, routes, prices, FAQ).
 * A request is shown as received only after the server stored it and returned its reference; then the
 * business gets a push notification (push-notifications Edge Function, one-time token from the server).
 */
(function () {
  "use strict";

  // Public (anon) project settings - the same values the Triplem VIP app embeds.
  const HOST = ["iymzt", "qbscfo", "delovd", "rnn"].join("");
  const SUPABASE_URL = ["https://", HOST, ".supabase.co"].join("");
  const ANON = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5bXp0cWJzY2ZvZGVsb3Zkcm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjcxNDAsImV4cCI6MjA5NDMwMzE0MH0",
    "eASEqmcC9-eDDgjYFsa3Ne8idK-6KmfXHbxvhWVwZSA"].join(".");
  const CANON_ORIGIN = "https://triplem.vip";
  const CAT_BASE = "/triplemdrive/catalog/";
  const LOGO = "/triplemdrive/assets/logo.svg";
  const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
  const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
  const GEO = "https://nominatim.openstreetmap.org";

  const app = document.getElementById("tdsApp");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qs = new URLSearchParams(location.search);
  const preview = qs.get("preview") || "";
  const S = { slug: "", site: null, cat: null, credits: {}, media: new Map(), tab: "vehicles", filter: "", group: "", stack: [] };

  async function rpc(fn, args) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
      body: JSON.stringify(args || {})
    });
    if (!res.ok) throw new Error("The page could not be loaded. Please try again.");
    return res.json();
  }
  // Push notification to the business after a request was stored (one-time token from the server).
  function notifyBusiness(token) {
    if (!token) return;
    try {
      fetch(`${SUPABASE_URL}/functions/v1/push-notifications`, {
        method: "POST", keepalive: true,
        headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ action: "drive_notify", token })
      }).catch(() => {});
    } catch (_) {}
  }

  // ---- address -----------------------------------------------------------------------------------
  function resolveSlug() {
    const keep = preview ? `?preview=${encodeURIComponent(preview)}` : "";
    const put = v => { try { history.replaceState(null, "", `/${v}/${keep}${location.hash}`); } catch (_) {} return v; };
    const b = (qs.get("b") || "").toLowerCase();
    if (/^[a-z0-9-]{3,40}$/.test(b)) return put(b);
    let m = location.pathname.match(/^\/triplemdrive\/([a-z0-9-]{3,40})\/?$/i);
    if (m) return put(m[1].toLowerCase());
    m = location.pathname.match(/^\/([a-z0-9-]{3,40})\/?$/i);
    if (m) return m[1].toLowerCase();
    return "triplemdrive";
  }
  const addressOf = v => `${CANON_ORIGIN}/${v}/`;

  // ---- SEO ---------------------------------------------------------------------------------------
  function meta(sel, attr, value) {
    let el = document.head.querySelector(sel);
    if (!el) { el = document.createElement("meta"); const [, k, v] = sel.match(/\[(\w+(?::\w+)?)="([^"]+)"\]/) || []; if (k) el.setAttribute(k, v); document.head.appendChild(el); }
    el.setAttribute(attr, value);
  }
  function seo({ title, description, url, index, business }) {
    document.title = title;
    meta('meta[name="description"]', "content", description);
    meta('meta[name="robots"]', "content", index ? "index,follow" : "noindex,nofollow");
    meta('meta[property="og:title"]', "content", title);
    meta('meta[property="og:description"]', "content", description);
    if (url) { meta('meta[property="og:url"]', "content", url); document.head.querySelector('link[rel="canonical"]')?.setAttribute("href", url); }
    if (business) meta('meta[property="og:site_name"]', "content", business.name);
    const ld = document.getElementById("tdLd");
    if (ld && business && index) {
      const data = { "@context": "https://schema.org", "@type": "AutoRental", name: business.name, url, description };
      if (business.phone) data.telephone = business.phone;
      if (business.email) data.email = business.email;
      if (business.address) data.address = business.address;
      if (business.hours) data.openingHours = business.hours;
      if (business.location_url) data.hasMap = business.location_url;
      const same = Object.values(business.social || {}).filter(Boolean);
      if (same.length) data.sameAs = same;
      ld.textContent = JSON.stringify(data);
    } else if (ld) ld.textContent = "{}";
  }

  // ---- images ------------------------------------------------------------------------------------
  // Database photos (business uploads) by key, through the public function.
  async function loadMedia(keys, size = "thumb") {
    const want = [...new Set(keys.filter(Boolean))].filter(k => !S.media.has(`${size}:${k}`));
    for (let i = 0; i < want.length; i += 24) {
      try {
        const rows = await rpc("app_drive_public_media", { p_slug: S.slug, p_keys: want.slice(i, i + 24), p_size: size, p_preview: preview || null });
        for (const r of rows || []) {
          const bin = atob(r.data); const u8 = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j);
          S.media.set(`${size}:${r.key}`, URL.createObjectURL(new Blob([u8], { type: r.mime })));
        }
      } catch (_) {}
    }
  }
  async function fillImages(root, size = "thumb") {
    const imgs = [...root.querySelectorAll("img[data-k]")];
    if (!imgs.length) return;
    await loadMedia(imgs.map(i => i.dataset.k), size);
    imgs.forEach(i => { const u = S.media.get(`${size}:${i.dataset.k}`) || S.media.get(`thumb:${i.dataset.k}`); if (u) { i.src = u; i.classList.add("is-in"); } else i.closest(".tdp-ph")?.classList.add("is-none"); });
  }
  // Catalogue photos: the uploaded file first, otherwise the same picture from Wikimedia Commons.
  const commonsFile = name => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=1600`;
  const commonsPage = name => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(String(name).replace(/ /g, "_"))}`;
  function onImgError(e) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.commons && !img.dataset.tried) { img.dataset.tried = "1"; img.src = commonsFile(img.dataset.commons); return; }
    if (img.dataset.commons || img.dataset.k) { img.closest(".tdp-ph")?.classList.add("is-none"); img.remove(); }
  }
  function onImgLoad(e) { const img = e.target; if (img instanceof HTMLImageElement && img.closest(".tdp-ph")) img.classList.add("is-in"); }
  function photo(p, alt = "", cls = "") {
    if (!p) return `<span class="tdp-ph is-none ${cls}"><i class="fa-solid fa-car-side" aria-hidden="true"></i></span>`;
    if (p.key) return `<span class="tdp-ph ${cls}"><img data-k="${esc(p.key)}" alt="${esc(alt)}" loading="lazy" decoding="async"><i class="fa-solid fa-car-side" aria-hidden="true"></i></span>`;
    return `<span class="tdp-ph ${cls}"><img src="${esc(CAT_BASE + "photos/" + p.file)}" data-commons="${esc(p.commons || "")}" alt="${esc(alt)}" loading="lazy" decoding="async"><i class="fa-solid fa-car-side" aria-hidden="true"></i></span>`;
  }

  // ---- money and data --------------------------------------------------------------------------------
  const PER = { per_trip: "per trip", hourly: "per hour", daily: "per day", weekly: "per week", monthly: "per month", route: "per trip", custom_quote: "" };
  function money(v, cur) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    const c = cur || S.site?.business?.currency || "USD";
    if (S.cat && c === S.cat.currency) return `${c} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); } catch (_) { return `${c} ${n.toLocaleString()}`; }
  }
  const catMoney = v => (v === null || v === undefined || v === "" ? "On request" : money(v, S.cat?.currency || "SAR"));
  const waLink = (n, text = "") => { const d = String(n || "").replace(/[^\d]/g, ""); return d.length >= 7 ? `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}` : ""; };
  const minsText = m => { m = Number(m) || 0; if (!m) return ""; const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ` ${r} min` : ""}` : `${r} min`; };
  const serviceName = s => s.name || `${s.from} ⇄ ${s.to}`;
  const today = () => S.site.today || new Date().toISOString().slice(0, 10);

  // Cars. The listed cars (catalog.json) live in the fleet of the business since database update 240
  // (keys "cat-<model>"), so the business manages them in Triplem VIP › Triplem Drive › Fleet. A fleet car
  // belongs to a listed vehicle type (SUV, Sedan, Mini Van) by its key or by its section name; those are
  // the models in the booking panel and they use the listed prices. Until the business uploads photos,
  // a listed car shows its listed photo. Before update 240 the listed cars come from catalog.json itself.
  const catVehicle = v => (S.cat && String(v.key || "").startsWith("cat-") ? S.cat.vehicles.find(x => "cat-" + x.key === v.key) : null);
  function classOf(v) {
    if (!S.cat) return "";
    const cv = catVehicle(v); if (cv) return cv.class;
    const sec = (S.site.sections || []).find(x => x.key === v.section);
    const k = sec && (S.cat.classes || []).find(c => c.name.trim().toLowerCase() === sec.name.trim().toLowerCase());
    return k ? k.key : "";
  }
  const className = key => (S.cat?.classes || []).find(c => c.key === key)?.name || key;
  function classFrom(key) {
    const prices = (S.cat?.services || []).map(s => Number(s.prices?.[key])).filter(Number.isFinite);
    return prices.length ? catMoney(Math.min(...prices)) : "";
  }
  let carsMemo = null;
  function cars() {
    if (carsMemo) return carsMemo;
    const out = [], db = S.site.vehicles || [];
    const fleetModels = S.cat ? db.filter(v => classOf(v)) : [];
    // Listed cars straight from catalog.json only while the fleet has none of them (before update 240).
    if (S.cat && !fleetModels.length && !(S.cat.vehicles_in_database && db.length)) {
      for (const v of S.cat.vehicles) out.push({ id: "c:" + v.key, key: v.key, dbKey: "", name: v.name, cls: v.class, group: v.class, groupName: className(v.class),
        photos: v.photos || [], from: classFrom(v.class), bookable: true });
    }
    for (const v of db) {
      const cls = S.cat ? classOf(v) : "";
      const sec = (S.site.sections || []).find(x => x.key === v.section);
      const own = (v.photos || []).map(k => ({ key: k }));
      const priced = v.show_price ? (v.rates || []).filter(r => r.amount != null) : [];
      const best = priced.slice().sort((a, b) => Number(a.amount) - Number(b.amount))[0];
      out.push({ id: "d:" + v.key, key: v.key, dbKey: v.key, name: v.name, cls, group: cls || (sec ? "s:" + sec.key : ""),
        groupName: cls ? className(cls) : sec?.name || [v.make, v.model].filter(Boolean).join(" ") || "Vehicle",
        photos: own.length ? own : (catVehicle(v)?.photos || []),
        from: cls ? (v.show_price === false ? "" : classFrom(cls)) : best ? `${money(best.amount)} ${PER[best.type] || ""}`.trim() : "",
        bookable: v.bookable !== false, v });
    }
    return (carsMemo = out);
  }
  const carById = id => cars().find(c => c.id === id);
  const models = cls => cars().filter(c => c.cls && c.bookable && (!cls || c.cls === cls));
  function filters() {
    const list = [];
    if (S.cat) (S.cat.classes || []).filter(c => cars().some(x => x.cls === c.key)).forEach(c => list.push([c.key, c.name]));
    (S.site.sections || []).filter(s => cars().some(x => x.group === "s:" + s.key)).forEach(s => list.push(["s:" + s.key, s.name]));
    return list;
  }

  // ---- page ----------------------------------------------------------------------------------------
  function messagePage(icon, title, text, extra = "") {
    app.innerHTML = `<main id="tdsMain" class="tdp-msg"><div class="tdp-msg-card"><img src="${LOGO}" alt="Triplem Drive" class="tdp-msg-logo"><span class="tdp-msg-ico"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><h1>${esc(title)}</h1><p>${esc(text)}</p>${extra}</div>
      <footer class="tdp-foot is-min"><span>Powered by <a href="${CANON_ORIGIN}/" rel="noopener">Triplem Drive · Triplem VIP</a></span></footer></main>`;
    app.removeAttribute("aria-busy");
  }

  const TABS = () => [
    ["vehicles", "Vehicles", "fa-car-side"],
    ["prices", "Prices", "fa-tags"],
    ...((S.site.routes || []).length ? [["routes", "Routes", "fa-route"]] : []),
    ["faq", "FAQ", "fa-circle-question"],
    ["contact", "Contact", "fa-headset"]
  ];

  function render() {
    const s = S.site, b = s.business;
    const desc = (b.tagline || b.description || `Book vehicles from ${b.name} online.`).replace(/\s+/g, " ").trim().slice(0, 155);
    seo({ title: `${b.name} · Vehicle Bookings`, description: desc, url: addressOf(s.slug), index: !s.preview, business: b });
    const wa = waLink(b.whatsapp, `Hello ${b.name}, I would like to book a vehicle.`);
    const timing = S.cat?.terms?.timing;
    const n = cars().length;
    app.innerHTML = `
      ${s.preview ? `<div class="tdp-preview"><i class="fa-solid fa-eye" aria-hidden="true"></i> Preview · this page is not published yet. Requests are switched off.</div>` : ""}
      <header class="tdp-top">
        <a class="tdp-brand" href="${esc(addressOf(s.slug))}" aria-label="${esc(b.name)}">
          ${b.logo ? `<span class="tdp-logo is-own"><img data-k="${esc(b.logo)}" alt=""></span>` : `<span class="tdp-logo"><img src="${LOGO}" alt=""></span>`}
          <span class="tdp-brand-text"><strong>${esc(b.name)}</strong><small>Fleet &amp; Vehicle Bookings</small></span>
        </a>
        <div class="tdp-top-actions">
          ${b.phone ? `<a class="tdp-icon" href="tel:${esc(b.phone)}" title="Call" aria-label="Call"><i class="fa-solid fa-phone" aria-hidden="true"></i></a>` : ""}
          ${wa ? `<a class="tdp-icon" href="${esc(wa)}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a>` : ""}
          <button type="button" class="tdp-icon" data-act="inquiry" title="Ask a question" aria-label="Ask a question"><i class="fa-regular fa-comment-dots" aria-hidden="true"></i></button>
          <button type="button" class="tdp-btn is-primary" data-act="book"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i><span>Book</span></button>
        </div>
      </header>
      <main id="tdsMain" class="tdp-main">
        <section class="tdp-hero">
          ${b.banner ? `<span class="tdp-hero-art"><img data-k="${esc(b.banner)}" alt=""></span>` : ""}
          <div class="tdp-hero-copy">
            <span class="tdp-kicker"><i class="fa-solid fa-car-side" aria-hidden="true"></i> Triplem Drive</span>
            <h1>${esc(b.name)}</h1>
            ${b.tagline ? `<p>${esc(b.tagline)}</p>` : ""}
            <div class="tdp-chips">
              ${n ? `<span><i class="fa-solid fa-car-side" aria-hidden="true"></i>${n} vehicle${n === 1 ? "" : "s"}</span>` : ""}
              ${timing ? `<span><i class="fa-regular fa-clock" aria-hidden="true"></i>${esc(timing)}</span>` : b.hours ? `<span><i class="fa-regular fa-clock" aria-hidden="true"></i>${esc(b.hours)}</span>` : ""}
              <span><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>No online payment</span>
              ${b.address ? `<span><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${esc(b.address.split("\n")[0])}</span>` : ""}
            </div>
            <div class="tdp-actions">
              <button type="button" class="tdp-btn is-primary" data-act="book"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i><span>Book a ride</span></button>
              <button type="button" class="tdp-btn" data-tab-go="prices"><i class="fa-solid fa-tags" aria-hidden="true"></i><span>See prices</span></button>
              <button type="button" class="tdp-btn" data-act="inquiry"><i class="fa-regular fa-comment-dots" aria-hidden="true"></i><span>Ask a question</span></button>
            </div>
          </div>
        </section>
        <nav class="tdp-tabs" role="tablist" aria-label="${esc(b.name)}">${TABS().map(([k, t, i]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${S.tab === k}"><i class="fa-solid ${i}" aria-hidden="true"></i><span>${esc(t)}</span></button>`).join("")}</nav>
        <section class="tdp-view" data-view role="tabpanel"></section>
      </main>
      <footer class="tdp-foot"><span>© ${new Date().getFullYear()} ${esc(b.name)}</span>
        <span>${S.cat ? `<button type="button" class="tdp-link" data-act="credits">Photo credits</button> · ` : ""}Powered by <a href="${CANON_ORIGIN}/" rel="noopener">Triplem Drive · Triplem VIP</a></span></footer>
      <div class="tdp-layer" data-layer><div class="tdp-backdrop" data-close-top></div></div>`;
    app.removeAttribute("aria-busy");
    showTab(S.tab);
    fillImages(app.querySelector(".tdp-top"));
    const art = app.querySelector(".tdp-hero-art img"); if (art) loadMedia([art.dataset.k], "full").then(() => { const u = S.media.get(`full:${art.dataset.k}`); if (u) { art.src = u; art.classList.add("is-in"); } });
  }

  function showTab(tab) {
    if (!TABS().some(t => t[0] === tab)) tab = "vehicles";
    S.tab = tab;
    app.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", String(x.dataset.tab === tab)));
    const v = app.querySelector("[data-view]");
    v.innerHTML = VIEWS[tab]();
    v.dataset.view = tab;
    fillImages(v);
  }

  const VIEWS = {
    vehicles() {
      const list = cars().filter(c => !S.filter || c.group === S.filter);
      const f = filters();
      return `<div class="tdp-bar">
          ${f.length > 1 ? `<div class="tdp-seg" role="radiogroup" aria-label="Vehicle type"><button type="button" role="radio" aria-checked="${!S.filter}" data-filter="">All</button>${f.map(([k, t]) => `<button type="button" role="radio" aria-checked="${S.filter === k}" data-filter="${esc(k)}">${esc(t)}</button>`).join("")}</div>` : "<span></span>"}
          <small class="tdp-muted">${list.length} vehicle${list.length === 1 ? "" : "s"}</small></div>
        ${list.length ? `<div class="tdp-grid">${list.map(c => `<article class="tdp-card" data-car="${esc(c.id)}" tabindex="0" role="button" aria-label="${esc(c.name)} details">
            ${photo(c.photos[0], c.name)}
            <div class="tdp-card-body">
              <div class="tdp-card-title"><b>${esc(c.name)}</b><span class="tdp-pill">${esc(c.groupName)}</span></div>
              <div class="tdp-card-foot"><span class="tdp-price">${c.from ? `<small>From</small> ${esc(c.from)}` : "Request a quote"}</span>
                ${c.bookable ? `<button type="button" class="tdp-btn is-primary is-sm" data-book-car="${esc(c.id)}"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i><span>Book</span></button>` : `<span class="tdp-muted">Not available</span>`}</div>
            </div></article>`).join("")}</div>`
          : `<div class="tdp-empty"><i class="fa-solid fa-car-side" aria-hidden="true"></i><b>Our vehicles will be listed here soon</b><p>You can still send a booking request.</p><button type="button" class="tdp-btn is-primary" data-act="book">Book</button></div>`}`;
    },
    prices() {
      let html = "";
      if (S.cat) {
        const groups = (S.cat.service_groups || []).filter(g => S.cat.services.some(s => s.group === g.key));
        if (!S.group || !groups.some(g => g.key === S.group)) S.group = groups[0]?.key || "";
        const g = groups.find(x => x.key === S.group);
        const classes = S.cat.classes || [];
        const rows = S.cat.services.filter(s => s.group === S.group);
        html += `<div class="tdp-bar"><div class="tdp-seg" role="radiogroup" aria-label="Price list">${groups.map(x => `<button type="button" role="radio" aria-checked="${x.key === S.group}" data-group="${esc(x.key)}">${esc(x.name)}</button>`).join("")}</div>
            ${g?.note ? `<small class="tdp-muted">${esc(g.note)}</small>` : ""}</div>
          <div class="tdp-card is-flat"><div class="tdp-table-wrap"><table class="tdp-table"><thead><tr><th>Service</th>${classes.map(c => `<th>${esc(c.name)}</th>`).join("")}<th></th></tr></thead>
            <tbody>${rows.map(s => `<tr><th scope="row">${s.from ? `${esc(s.from)} <i class="fa-solid fa-right-left" aria-hidden="true"></i> ${esc(s.to)}` : esc(serviceName(s))}</th>
              ${classes.map(c => `<td>${esc(catMoney(s.prices?.[c.key]))}</td>`).join("")}
              <td><button type="button" class="tdp-btn is-sm" data-book-service="${esc(s.key)}">Book</button></td></tr>`).join("")}</tbody></table></div>
          <div class="tdp-plist">${rows.map(s => `<button type="button" class="tdp-prow" data-book-service="${esc(s.key)}"><b>${esc(serviceName(s))}</b>
              <span>${classes.map(c => `<em><small>${esc(c.name)}</small>${esc(catMoney(s.prices?.[c.key]))}</em>`).join("")}</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`).join("")}</div></div>
          <p class="tdp-muted tdp-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Prices in ${esc(S.cat.currency || "SAR")}. Payment is arranged directly with us; nothing is charged online.${S.cat.terms?.lines?.length ? ` <button type="button" class="tdp-link" data-tab-go="faq">Payment terms</button>` : ""}</p>`;
      }
      const rates = S.site.rates || [];
      if (rates.length) html += `<h2 class="tdp-h2">${S.cat ? "Other rates" : "Rates"}</h2><div class="tdp-card is-flat"><ul class="tdp-rows">${rates.map(r => `<li><span><b>${esc(r.label)}</b>${r.extras ? `<small>${esc(r.extras)}</small>` : ""}</span><span class="tdp-price">${r.amount != null ? `${esc(money(r.amount))} <small>${esc(PER[r.type] || "")}</small>` : "Request a quote"}</span></li>`).join("")}</ul></div>`;
      if (!html) html = `<div class="tdp-empty"><i class="fa-solid fa-tags" aria-hidden="true"></i><b>Prices on request</b><p>Send a booking request or a question and we will send you a quote.</p><button type="button" class="tdp-btn is-primary" data-act="book">Book</button></div>`;
      return html;
    },
    routes() {
      return `<div class="tdp-grid is-routes">${(S.site.routes || []).map(r => `<article class="tdp-card tdp-route">
          <div class="tdp-route-line"><b>${esc(r.pickup)}</b><i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i><b>${esc(r.destination)}</b></div>
          ${(r.stops || []).length ? `<small class="tdp-muted">via ${esc(r.stops.join(", "))}</small>` : ""}
          <div class="tdp-chips is-muted">${r.distance_km ? `<span><i class="fa-solid fa-road" aria-hidden="true"></i>${esc(r.distance_km)} km</span>` : ""}${r.duration_min ? `<span><i class="fa-regular fa-clock" aria-hidden="true"></i>${esc(minsText(r.duration_min))}</span>` : ""}</div>
          <div class="tdp-card-foot"><span class="tdp-price">${r.price != null ? esc(money(r.price)) : "Request a quote"}</span><button type="button" class="tdp-btn is-primary is-sm" data-book-route="${esc(r.key)}">Book</button></div></article>`).join("")}</div>`;
    },
    faq() {
      const b = S.site.business, items = [...(S.cat?.faq || [])];
      if (!S.cat) items.push({ q: "How do I book?", a: "Choose a vehicle and tap Book, or tap Book at the top. We contact you to confirm your reservation." }, { q: "Do I pay online?", a: "No. Payment is arranged directly with us." });
      if (b.cancellation_policy) items.push({ q: "What is the cancellation policy?", a: b.cancellation_policy });
      if (b.terms) items.push({ q: "Terms and conditions", a: b.terms });
      const t = S.cat?.terms;
      return `<div class="tdp-card is-flat"><div class="tdp-faq">${items.map((x, i) => `<details${i === 0 ? " open" : ""}><summary><span>${esc(x.q)}</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><p>${esc(x.a)}</p></details>`).join("")}</div></div>
        ${t?.lines?.length ? `<h2 class="tdp-h2">Good to know</h2><div class="tdp-terms">${t.timing ? `<div><i class="fa-regular fa-clock" aria-hidden="true"></i><span><small>Timing</small><b>${esc(t.timing)}</b></span></div>` : ""}${t.lines.map(l => `<div><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span><small>${esc(l.label)}</small><b>${esc(l.value)}</b></span></div>`).join("")}</div>` : ""}
        <div class="tdp-cta"><span><b>Still have a question?</b><small>Send it and we will get back to you.</small></span><button type="button" class="tdp-btn is-primary" data-act="inquiry"><i class="fa-regular fa-comment-dots" aria-hidden="true"></i><span>Ask a question</span></button></div>`;
    },
    contact() {
      const b = S.site.business, wa = waLink(b.whatsapp);
      const icons = { website: "fa-solid fa-globe", instagram: "fa-brands fa-instagram", facebook: "fa-brands fa-facebook", x: "fa-brands fa-x-twitter", tiktok: "fa-brands fa-tiktok", youtube: "fa-brands fa-youtube", linkedin: "fa-brands fa-linkedin" };
      const social = Object.entries(b.social || {}).filter(([k, v]) => v && icons[k]);
      const row = (href, icon, label, value, ext) => `<${href ? `a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}` : "div"} class="tdp-crow"><span class="tdp-crow-ico"><i class="${icon}" aria-hidden="true"></i></span><span><small>${esc(label)}</small><b>${esc(value)}</b></span>${href ? `<i class="fa-solid fa-chevron-right tdp-crow-go" aria-hidden="true"></i>` : ""}</${href ? "a" : "div"}>`;
      return `<div class="tdp-two"><div class="tdp-card is-flat"><div class="tdp-crows">
          ${b.phone ? row(`tel:${b.phone}`, "fa-solid fa-phone", "Phone", b.phone) : ""}
          ${wa ? row(wa, "fa-brands fa-whatsapp", "WhatsApp", b.whatsapp, true) : ""}
          ${b.email ? row(`mailto:${b.email}`, "fa-regular fa-envelope", "Email", b.email) : ""}
          ${b.address ? row(b.location_url || "", "fa-solid fa-location-dot", "Address", b.address, true) : ""}
          ${b.hours ? row("", "fa-regular fa-clock", "Hours", b.hours) : S.cat?.terms?.timing ? row("", "fa-regular fa-clock", "Hours", S.cat.terms.timing) : ""}
        </div>${social.length ? `<div class="tdp-social">${social.map(([k, v]) => `<a class="tdp-icon" href="${esc(v)}" target="_blank" rel="noopener nofollow" aria-label="${esc(k)}"><i class="${icons[k]}" aria-hidden="true"></i></a>`).join("")}</div>` : ""}</div>
        <div class="tdp-card is-flat tdp-ask"><span class="tdp-ask-ico"><i class="fa-regular fa-comment-dots" aria-hidden="true"></i></span><b>Send us a message</b><p>${esc(b.contact_note || "Questions about a trip, a group booking or a quote? Write to us and we will answer by phone, WhatsApp or email.")}</p>
          <button type="button" class="tdp-btn is-primary" data-act="inquiry"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i><span>Ask a question</span></button></div></div>`;
    }
  };

  // ---- side panels (Triplem VIP look) ----------------------------------------------------------------
  // panel({ id, icon | avatar, title, sub, pills, tabs:[[key,label,icon]], tab, body(tab) -> html, foot(tab) -> html, mount(el, tab) })
  function panel(def) {
    const layer = app.querySelector("[data-layer]");
    const el = document.createElement("aside");
    el.className = "tdp-pnl"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.dataset.pid = def.id || "";
    const d = { tab: def.tabs?.[0]?.[0] || "main", ...def };
    el._def = d;
    paintPanel(el);
    layer.appendChild(el);
    S.stack.push(el);
    layer.classList.add("is-on");
    document.documentElement.classList.add("tdp-lock");
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-open")));
    setTimeout(() => el.querySelector("[data-autofocus]")?.focus({ preventScroll: true }), 420);
    return el;
  }
  function paintPanel(el, { keepScroll = false } = {}) {
    const d = el._def;
    const y = keepScroll ? el.querySelector(".tdp-pnl-body")?.scrollTop || 0 : 0;
    el.innerHTML = `<header class="tdp-pnl-head">
        <span class="tdp-pnl-ava">${d.avatar || `<i class="fa-solid ${d.icon || "fa-car-side"}" aria-hidden="true"></i>`}</span>
        <div class="tdp-pnl-id"><strong>${esc(d.title)}</strong>${d.sub ? `<small>${esc(d.sub)}</small>` : ""}${(d.pills || []).length ? `<div class="tdp-pills">${d.pills.join("")}</div>` : ""}</div>
        <button type="button" class="tdp-pnl-x" data-close-top aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </header>
      ${(d.tabs || []).length > 1 ? `<nav class="tdp-pnl-tabs" role="tablist">${d.tabs.map(([k, t, i]) => `<button type="button" role="tab" data-ptab="${k}" aria-selected="${d.tab === k}"><i class="fa-solid ${i}" aria-hidden="true"></i>${esc(t)}</button>`).join("")}</nav>` : ""}
      <div class="tdp-pnl-body">${d.body(d.tab)}</div>
      ${d.foot ? `<footer class="tdp-pnl-foot">${d.foot(d.tab)}</footer>` : ""}`;
    const body = el.querySelector(".tdp-pnl-body"); body.scrollTop = y;
    fillImages(el);
    d.mount?.(el, d.tab);
  }
  function closeTop() {
    const el = S.stack.pop(); if (!el) return;
    el.classList.remove("is-open");
    el._def.onClose?.();
    setTimeout(() => el.remove(), 340);
    if (!S.stack.length) {
      app.querySelector("[data-layer]")?.classList.remove("is-on");
      document.documentElement.classList.remove("tdp-lock");
    }
  }
  function closeAll() { while (S.stack.length) closeTop(); }
  const pill = (t, i, tone = "") => `<span class="tdp-pill${tone ? " is-" + tone : ""}">${i ? `<i class="fa-solid ${i}" aria-hidden="true"></i>` : ""}${esc(t)}</span>`;

  // ---- car details panel ---------------------------------------------------------------------------
  function openCar(id) {
    const c = carById(id); if (!c) return;
    const classPrices = () => {
      if (c.cls) return S.cat.services.filter(s => Number.isFinite(Number(s.prices?.[c.group])));
      return [];
    };
    panel({
      id: "car", title: c.name, sub: c.groupName, avatar: c.photos[0] ? photo(c.photos[0], "", "is-ava") : "",
      pills: [pill(c.groupName, "fa-car-side", "info"), c.from ? pill(`From ${c.from}`, "fa-tag") : "", ...(c.v?.capacity ? [pill(`${c.v.capacity} seats`, "fa-user-group")] : [])].filter(Boolean),
      tabs: [["overview", "Overview", "fa-circle-info"], ["prices", "Prices", "fa-tags"]],
      body(tab) {
        if (tab === "prices") {
          const rows = classPrices();
          if (rows.length) return `<section class="tdp-psec"><h3>${esc(c.groupName)} prices</h3><ul class="tdp-rows">${rows.map(s => `<li><span><b>${esc(serviceName(s))}</b></span><span class="tdp-price">${esc(catMoney(s.prices[c.group]))}</span><button type="button" class="tdp-btn is-sm" data-book-car="${esc(c.id)}" data-service="${esc(s.key)}">Book</button></li>`).join("")}</ul></section>`;
          const rates = c.v?.show_price ? c.v.rates || [] : [];
          return rates.length ? `<section class="tdp-psec"><h3>Rates</h3><ul class="tdp-rows">${rates.map(r => `<li><span><b>${esc(r.label)}</b>${r.extras ? `<small>${esc(r.extras)}</small>` : ""}</span><span class="tdp-price">${r.amount != null ? `${esc(money(r.amount))} <small>${esc(PER[r.type] || "")}</small>` : "Request a quote"}</span></li>`).join("")}</ul></section>`
            : `<p class="tdp-muted">Prices on request. Send a booking request and we will send you a quote.</p>`;
        }
        const v = c.v || {};
        const facts = [["Type", c.groupName], ["Passengers", v.capacity], ["Transmission", v.transmission], ["Fuel", v.fuel], ["Year", v.year], ...(v.specs || []).map(s => [s.label, s.value])].filter(([, x]) => x);
        return `<div class="tdp-gallery">${photo(c.photos[0], c.name, "is-big")}${c.photos.length > 1 ? `<div class="tdp-thumbs">${c.photos.map((p, i) => `<button type="button" data-thumb="${i}" aria-label="Photo ${i + 1}"${i === 0 ? ' aria-current="true"' : ""}>${photo(p, "")}</button>`).join("")}</div>` : ""}</div>
          <section class="tdp-psec"><h3>Details</h3><dl class="tdp-kv">${facts.map(([k, x]) => `<div><dt>${esc(k)}</dt><dd>${esc(x)}</dd></div>`).join("")}</dl></section>
          ${v.description ? `<section class="tdp-psec"><h3>About this car</h3><p class="tdp-pre">${esc(v.description)}</p></section>` : ""}
          ${c.cls ? `<section class="tdp-psec"><h3>Popular prices</h3><ul class="tdp-rows">${classPrices().slice(0, 4).map(s => `<li><span><b>${esc(serviceName(s))}</b></span><span class="tdp-price">${esc(catMoney(s.prices[c.group]))}</span></li>`).join("")}</ul>
            <button type="button" class="tdp-link" data-ptab-go="prices">All prices</button></section>` : ""}`;
      },
      foot: () => c.bookable ? `<span class="tdp-foot-note">${c.from ? `<small>From</small><b>${esc(c.from)}</b>` : `<small>Price</small><b>On request</b>`}</span><button type="button" class="tdp-btn is-primary" data-book-car="${esc(c.id)}"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i><span>Book this car</span></button>` : `<span class="tdp-muted">This vehicle cannot be booked at the moment.</span>`,
      mount(el) {
        el.querySelectorAll("[data-thumb]").forEach(b => b.addEventListener("click", () => {
          const p = c.photos[+b.dataset.thumb], main = el.querySelector(".tdp-gallery > .tdp-ph");
          el.querySelectorAll("[data-thumb]").forEach(x => x.toggleAttribute("aria-current", x === b));
          main.outerHTML = photo(p, c.name, "is-big"); fillImages(el.querySelector(".tdp-gallery"));
        }));
        el.querySelector("[data-ptab-go]")?.addEventListener("click", () => { el._def.tab = "prices"; paintPanel(el); });
      }
    });
  }

  // ---- booking panel -------------------------------------------------------------------------------
  const F = () => S.site.form || { fields: [], questions: [] };
  const fieldCfg = key => (F().fields || []).find(f => f.key === key) || { key, enabled: false };
  function input(key, html) {
    const f = fieldCfg(key);
    if (!f.enabled) return "";
    return html(f, f.required ? " required" : "", `<span>${esc(f.label)}${f.required ? ' <em aria-hidden="true">*</em>' : ""}</span>`);
  }
  function placeField(key) {
    return input(key, (f, req, lab) => `<div class="tdp-f is-wide">${lab}<div class="tdp-place">
        <input name="${key}" maxlength="150" value="${esc(f.default || "")}" placeholder="${key === "pickup" ? "Type the pickup address" : "Type the drop-off address"}" autocomplete="street-address"${req}>
        <button type="button" class="tdp-place-btn" data-map="${key}" title="Pick on map" aria-label="Pick ${esc(f.label)} on map"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i><span>Map</span></button>
      </div><small class="tdp-place-hint" data-place-hint="${key}" hidden></small></div>`);
  }
  function bookingBody(st) {
    const c = S.cat, withCars = (c?.classes || []).filter(k => models(k.key).length), classes = withCars.length ? withCars : (c?.classes || []);
    const svc = c?.services.find(s => s.key === st.service);
    const dbCars = (S.site.vehicles || []).filter(v => v.bookable && !(c && classOf(v)));
    const routes = S.site.routes || [];
    let html = "";
    if (c) {
      const groups = (c.service_groups || []).filter(g => c.services.some(s => s.group === g.key));
      html += `<section class="tdp-psec"><h3>Trip</h3><div class="tdp-f is-wide"><span>Service <em aria-hidden="true">*</em></span>
          <select name="cat_service" data-autofocus required><option value="">Choose a route or service</option>${groups.map(g => `<optgroup label="${esc(g.name)}">${c.services.filter(s => s.group === g.key).map(s => `<option value="${esc(s.key)}"${s.key === st.service ? " selected" : ""}>${esc(serviceName(s))}</option>`).join("")}</optgroup>`).join("")}</select></div></section>
        <section class="tdp-psec"><h3>Vehicle</h3>
          <div class="tdp-types" role="radiogroup" aria-label="Vehicle type">${classes.map(k => {
            const list = models(k.key), first = list.find(m => m.photos[0]) || list[0];
            const price = svc ? catMoney(svc.prices?.[k.key]) : "";
            return `<button type="button" role="radio" class="tdp-type" data-type="${esc(k.key)}" aria-checked="${st.cls === k.key}">${photo(first?.photos?.[0], "")}<b>${esc(k.name)}</b><small>${price ? esc(price) : `${list.length} model${list.length === 1 ? "" : "s"}`}</small></button>`;
          }).join("")}</div>
          ${st.cls ? `<div class="tdp-models" role="radiogroup" aria-label="Model"><button type="button" role="radio" class="tdp-model" data-model="" aria-checked="${!st.model}"><i class="fa-solid fa-shuffle" aria-hidden="true"></i><span>Any model</span></button>${models(st.cls).map(m => `<button type="button" role="radio" class="tdp-model" data-model="${esc(m.id)}" aria-checked="${st.model === m.id}">${photo(m.photos[0], "")}<span>${esc(m.name)}</span></button>`).join("")}</div>` : `<p class="tdp-muted">Choose a vehicle type to see its models.</p>`}
          ${dbCars.length ? input("vehicle", (f, req) => `<div class="tdp-f is-wide"><span>Or a specific car</span><select name="vehicle"><option value="">—</option>${dbCars.map(v => `<option value="${esc(v.key)}"${st.vehicle === v.key ? " selected" : ""}>${esc(v.name)}</option>`).join("")}</select></div>`) : ""}
        </section>`;
    } else {
      html += `<section class="tdp-psec"><h3>Vehicle</h3>${dbCars.length ? input("vehicle", (f, req, lab) => `<div class="tdp-f is-wide">${lab}<select name="vehicle" data-autofocus${req}><option value="">${f.required ? "Choose a car" : "Any suitable car"}</option>${dbCars.map(v => `<option value="${esc(v.key)}"${st.vehicle === v.key ? " selected" : ""}>${esc(v.name)}${v.capacity ? ` · ${esc(v.capacity)} seats` : ""}</option>`).join("")}</select></div>`) : `<p class="tdp-muted">We will suggest a suitable car.</p>`}
        ${routes.length ? input("route", (f, req, lab) => `<div class="tdp-f is-wide">${lab}<select name="route"${req}><option value="">${f.required ? "Choose a route" : "No fixed route"}</option>${routes.map(r => `<option value="${esc(r.key)}"${st.route === r.key ? " selected" : ""}>${esc(r.pickup)} → ${esc(r.destination)}${r.price != null ? " · " + esc(money(r.price)) : ""}</option>`).join("")}</select></div>`) : ""}</section>`;
    }
    html += `<section class="tdp-psec"><h3>Pickup and drop-off</h3><div class="tdp-fgrid">
        ${placeField("pickup")}${placeField("destination")}
        ${input("pickup_date", (f, req, lab) => `<label class="tdp-f">${lab}<input name="pickup_date" type="date" min="${esc(today())}"${req}></label>`)}
        ${input("pickup_time", (f, req, lab) => `<label class="tdp-f">${lab}<input name="pickup_time" type="time"${req}></label>`)}
        ${input("return_date", (f, req, lab) => `<label class="tdp-f">${lab}<input name="return_date" type="date" min="${esc(today())}"${req}></label>`)}
        ${input("return_time", (f, req, lab) => `<label class="tdp-f">${lab}<input name="return_time" type="time"${req}></label>`)}
        ${input("passengers", (f, req, lab) => `<label class="tdp-f">${lab}<input name="passengers" type="number" min="1" max="500" inputmode="numeric"${req}></label>`)}
      </div></section>
      <section class="tdp-psec"><h3>Your details</h3><div class="tdp-fgrid">
        ${input("customer_name", (f, req, lab) => `<label class="tdp-f">${lab}<input name="customer_name" autocomplete="name" maxlength="80"${req}></label>`)}
        ${input("customer_mobile", (f, req, lab) => `<label class="tdp-f">${lab}<input name="customer_mobile" type="tel" autocomplete="tel" inputmode="tel" maxlength="24" placeholder="+966 50 123 4567"${req}></label>`)}
        ${input("customer_email", (f, req, lab) => `<label class="tdp-f is-wide">${lab}<input name="customer_email" type="email" autocomplete="email" maxlength="160"${req}></label>`)}
      </div></section>`;
    const q = (F().questions || []).map(x => {
      const req = x.required ? " required" : "", star = x.required ? ' <em aria-hidden="true">*</em>' : "", name = `q_${esc(x.id)}`;
      if (x.type === "checkbox") return `<label class="tdp-check is-wide"><input type="checkbox" name="${name}"${req}><span>${esc(x.label)}${star}</span></label>`;
      if (x.type === "select") return `<label class="tdp-f"><span>${esc(x.label)}${star}</span><select name="${name}"${req}><option value="">Choose…</option>${(x.choices || []).map(o => `<option>${esc(o)}</option>`).join("")}</select></label>`;
      if (x.type === "textarea") return `<label class="tdp-f is-wide"><span>${esc(x.label)}${star}</span><textarea name="${name}" rows="2" maxlength="500"${req}></textarea></label>`;
      return `<label class="tdp-f"><span>${esc(x.label)}${star}</span><input name="${name}" ${x.type === "number" ? 'type="number" inputmode="decimal"' : 'type="text"'} maxlength="500"${req}></label>`;
    }).join("");
    const notes = input("notes", (f, req, lab) => `<label class="tdp-f is-wide">${lab}<textarea name="customer_notes" rows="3" maxlength="2000">${esc(f.default || "")}</textarea></label>`);
    if (q || notes) html += `<section class="tdp-psec"><h3>Anything else</h3><div class="tdp-fgrid">${q}${notes}</div></section>`;
    html += `<label class="tdp-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      <p class="tdp-err" data-err role="alert" hidden></p>
      <p class="tdp-muted tdp-privacy"><i class="fa-solid fa-lock" aria-hidden="true"></i> We use your details only for this booking. No payment is taken online.</p>`;
    return `<form id="tdpBook" class="tdp-form" novalidate>${html}</form>`;
  }
  function quote(st) {
    if (!S.cat) return "";
    const s = S.cat.services.find(x => x.key === st.service);
    return s && st.cls ? catMoney(s.prices?.[st.cls]) : "";
  }

  function openBooking(preset = {}) {
    const st = { service: preset.service || "", cls: preset.cls || "", model: preset.model || "", vehicle: preset.vehicle || "", route: preset.route || "", places: {}, done: null, values: null };
    const p = panel({
      id: "book", title: "Book your trip", sub: S.site.business.name, icon: "fa-calendar-check",
      pills: [S.cat?.terms?.timing ? pill(S.cat.terms.timing, "fa-clock", "info") : "", pill("No online payment", "fa-shield-halved")].filter(Boolean).concat(S.site.preview ? [pill("Preview", "fa-eye", "warn")] : []),
      body: () => st.done ? doneHtml(st.done) : bookingBody(st),
      foot: () => st.done
        ? `${waLink(S.site.business.whatsapp) ? `<a class="tdp-btn" href="${esc(waLink(S.site.business.whatsapp, `Hello ${S.site.business.name}, about my booking ${st.done.reference}.`))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>WhatsApp us</span></a>` : "<span></span>"}<button type="button" class="tdp-btn is-primary" data-close-top>Done</button>`
        : `<span class="tdp-foot-note" data-quote>${S.cat ? `<small>Listed price</small><b>${esc(quote(st) || "—")}</b>` : `<small>Price</small><b>Confirmed by us</b>`}</span>
           <button type="submit" form="tdpBook" class="tdp-btn is-primary" data-send${S.site.preview ? " disabled" : ""}><i class="fa-solid fa-paper-plane" aria-hidden="true"></i><span>Send request</span></button>`,
      mount(el) {
        const form = el.querySelector("#tdpBook"); if (!form) return;
        if (st.values) restore(form, st.values);
        Object.entries(st.places).forEach(([k, pl]) => { if (form.elements[k] && pl) hint(form, k, pl); });
        const save = () => { st.values = snapshot(form); };
        form.addEventListener("input", e => { if ((e.target.name === "pickup" || e.target.name === "destination") && st.places[e.target.name]) { delete st.places[e.target.name]; hint(form, e.target.name, null); } save(); });
        form.addEventListener("change", e => {
          save();
          if (e.target.name === "cat_service") { st.service = e.target.value; paintPanel(el, { keepScroll: true }); }
          if (e.target.name === "route") { const r = (S.site.routes || []).find(x => x.key === e.target.value); if (r) { if (form.elements.pickup && !form.elements.pickup.value) form.elements.pickup.value = r.pickup; if (form.elements.destination && !form.elements.destination.value) form.elements.destination.value = r.destination; save(); } }
          if (e.target.name === "pickup_date" && form.elements.return_date) form.elements.return_date.min = e.target.value || today();
        });
        el.querySelectorAll("[data-type]").forEach(b => b.addEventListener("click", () => { save(); st.cls = b.dataset.type; if (st.model && !models(st.cls).some(m => m.id === st.model)) st.model = ""; paintPanel(el, { keepScroll: true }); }));
        el.querySelectorAll("[data-model]").forEach(b => b.addEventListener("click", () => { save(); st.model = b.dataset.model; paintPanel(el, { keepScroll: true }); }));
        el.querySelectorAll("[data-map]").forEach(b => b.addEventListener("click", () => { save(); openMap(b.dataset.map, st.places[b.dataset.map], pl => { st.places[b.dataset.map] = pl; const f2 = el.querySelector("#tdpBook"); if (f2?.elements[b.dataset.map]) { f2.elements[b.dataset.map].value = pl.label; hint(f2, b.dataset.map, pl); st.values = snapshot(f2); } }); }));
        form.addEventListener("submit", e => { e.preventDefault(); save(); sendBooking(el, st); });
      }
    });
    return p;
  }
  function hint(form, key, pl) {
    const h = form.querySelector(`[data-place-hint="${key}"]`); if (!h) return;
    if (!pl) { h.hidden = true; h.textContent = ""; return; }
    h.hidden = false; h.innerHTML = `<i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> Pinned on the map (${pl.lat.toFixed(5)}, ${pl.lng.toFixed(5)})`;
  }
  const snapshot = form => { const o = {}; for (const el of form.elements) if (el.name) o[el.name] = el.type === "checkbox" ? el.checked : el.value; return o; };
  const restore = (form, o) => { for (const el of form.elements) if (el.name && el.name in o && el.name !== "cat_service") { if (el.type === "checkbox") el.checked = !!o[el.name]; else el.value = o[el.name]; } };
  function doneHtml(r) {
    return `<div class="tdp-done" role="status" tabindex="-1"><span class="tdp-done-ico ${r.status === "confirmed" ? "is-ok" : ""}"><i class="fa-solid ${r.status === "confirmed" ? "fa-circle-check" : "fa-paper-plane"}" aria-hidden="true"></i></span>
      <h2>${r.status === "confirmed" ? "Booking confirmed" : r.inquiry ? "Message sent" : "Request received"}</h2><p>${esc(r.message)}</p>
      ${r.reference ? `<p class="tdp-ref">Your reference<b>${esc(r.reference)}</b></p>` : ""}</div>`;
  }
  function showErr(el, text, field) {
    const err = el.querySelector("[data-err]"); if (!err) return;
    err.textContent = text; err.hidden = false;
    el.querySelectorAll(".is-bad").forEach(x => x.classList.remove("is-bad"));
    if (field) { field.classList.add("is-bad"); field.scrollIntoView({ block: "center", behavior: "smooth" }); try { field.focus({ preventScroll: true }); } catch (_) {} }
    else err.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function placeValue(form, st, key) {
    const t = String(form.elements[key]?.value || "").trim();
    const pl = st.places[key];
    if (!pl) return t;
    const tail = ` · ${pl.lat.toFixed(6)},${pl.lng.toFixed(6)}`;
    return (t || "Pinned location").slice(0, 200 - tail.length) + tail;
  }
  async function sendBooking(el, st) {
    const form = el.querySelector("#tdpBook"), btn = el.querySelector("[data-send]");
    el.querySelector("[data-err]").hidden = true;
    const fd = new FormData(form), p = { answers: {} };
    for (const [k, v] of fd.entries()) { if (k.startsWith("q_")) p.answers[k.slice(2)] = String(v).trim(); else if (!k.startsWith("cat_")) p[k] = String(v).trim(); }
    form.querySelectorAll('input[type="checkbox"][name^="q_"]').forEach(c => { p.answers[c.name.slice(2)] = c.checked ? "yes" : ""; });
    if (form.elements.pickup) p.pickup = placeValue(form, st, "pickup");
    if (form.elements.destination) p.destination = placeValue(form, st, "destination");
    if (S.cat) {
      const svc = S.cat.services.find(x => x.key === st.service);
      if (!svc) return showErr(el, "Choose the route or service.", form.elements.cat_service);
      if (!st.cls) return showErr(el, "Choose the vehicle type.", el.querySelector("[data-type]"));
      const k = (S.cat.classes || []).find(x => x.key === st.cls), m = models(st.cls).find(x => x.id === st.model);
      if (m?.dbKey) p.vehicle = m.dbKey; else delete p.vehicle;
      p.catalog = { vehicle: `${k?.name || st.cls} · ${m ? m.name : "Any model"}`, service: serviceName(svc), price: quote(st) };
      const mins = Number(S.cat.terms?.min_notice_minutes) || 0;
      if (mins && p.pickup_date && p.pickup_time && new Date(`${p.pickup_date}T${p.pickup_time}`) - Date.now() < mins * 60000) {
        return showErr(el, `Please book at least ${mins % 60 === 0 ? `${mins / 60} hour${mins === 60 ? "" : "s"}` : `${mins} minutes`} before the trip.`, form.elements.pickup_time);
      }
    }
    const missing = [...form.querySelectorAll("[required]")].find(x => x.type === "checkbox" ? !x.checked : !String(x.value || "").trim());
    if (missing) return showErr(el, "Please fill in the required fields.", missing);
    btn.disabled = true; btn.classList.add("is-busy");
    try {
      const r = await rpc("app_drive_public_book", { p_slug: S.slug, p });
      if (r && r.ok && r.reference) {
        notifyBusiness(r.push_token);
        st.done = r; el._def.title = r.status === "confirmed" ? "Booking confirmed" : "Request received";
        paintPanel(el); el.querySelector(".tdp-done")?.focus();
        return;
      }
      const f = r?.field ? form.querySelector(`[name="${r.field === "notes" ? "customer_notes" : r.field}"]`) : null;
      showErr(el, r?.error || "Your request could not be sent. Please try again.", f);
    } catch (_) { showErr(el, "Your request could not be sent. Check your connection and try again."); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove("is-busy"); } }
  }

  // ---- map picker (OpenStreetMap; address search and names by Nominatim) ------------------------------
  let leafletP = null;
  function leaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletP) return leafletP;
    leafletP = new Promise((resolve, reject) => {
      const l = document.createElement("link"); l.rel = "stylesheet"; l.href = LEAFLET_CSS; document.head.appendChild(l);
      const s = document.createElement("script"); s.src = LEAFLET_JS; s.async = true;
      s.onload = () => window.L ? resolve(window.L) : reject(new Error("map")); s.onerror = () => { leafletP = null; reject(new Error("map")); };
      document.head.appendChild(s);
    });
    return leafletP;
  }
  async function geo(path) {
    const r = await fetch(`${GEO}${path}${path.includes("?") ? "&" : "?"}format=jsonv2&accept-language=en`, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("geo");
    return r.json();
  }
  const shortName = j => {
    const a = j?.address || {};
    const street = a.road || a.pedestrian || a.neighbourhood || "";
    const parts = j?.name ? [j.name, a.city || a.town || a.village || a.state] : [street || a.suburb, street ? a.suburb : "", a.city || a.town || a.village || a.state];
    parts.splice(0, parts.length, ...parts.filter(Boolean));
    return [...new Set(parts)].join(", ") || String(j?.display_name || "").split(",").slice(0, 3).join(",").trim();
  };
  function openMap(field, current, onPick) {
    const label = fieldCfg(field).label || (field === "pickup" ? "Pickup" : "Drop-off");
    const st = { pl: current || null, map: null, timer: 0, seq: 0 };
    const center = current ? [current.lat, current.lng] : (S.cat ? [24.7136, 46.6753] : [25.2048, 55.2708]);
    panel({
      id: "map", title: `${label} on the map`, sub: "Move the map so the pin sits on the place", icon: "fa-map-location-dot",
      body: () => `<div class="tdp-mapbox">
          <div class="tdp-map-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Search a place or address" data-msearch data-autofocus aria-label="Search a place"><button type="button" class="tdp-icon is-sm" data-mlocate title="Use my location" aria-label="Use my location"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i></button></div>
          <ul class="tdp-map-results" data-mresults hidden></ul>
          <div class="tdp-map" data-map-el><div class="tdp-map-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading the map…</div></div>
          <span class="tdp-map-pin" aria-hidden="true"><i class="fa-solid fa-location-dot"></i></span>
        </div>`,
      foot: () => `<span class="tdp-foot-note" data-mlabel><small>Selected place</small><b>${esc(current?.label || "Move the map")}</b></span>
        <button type="button" class="tdp-btn is-primary" data-muse disabled><i class="fa-solid fa-check" aria-hidden="true"></i><span>Use this place</span></button>`,
      onClose: () => { try { st.map?.remove(); } catch (_) {} },
      async mount(el) {
        const lab = el.querySelector("[data-mlabel] b"), use = el.querySelector("[data-muse]");
        const setPl = (lat, lng, name) => { st.pl = { lat, lng, label: name || `Pinned location` }; lab.textContent = st.pl.label; use.disabled = false; };
        const reverse = async (lat, lng) => {
          const my = ++st.seq; lab.textContent = "Finding the address…"; use.disabled = true;
          try { const j = await geo(`/reverse?lat=${lat}&lon=${lng}&zoom=18`); if (my === st.seq) setPl(lat, lng, shortName(j)); }
          catch (_) { if (my === st.seq) setPl(lat, lng, `Pinned location`); }
        };
        try {
          const L = await leaflet();
          const box = el.querySelector("[data-map-el]"); box.innerHTML = "";
          st.map = L.map(box, { zoomControl: false, attributionControl: true }).setView(center, current ? 16 : 12);
          L.control.zoom({ position: "bottomright" }).addTo(st.map);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(st.map);
          st.map.on("moveend", () => { clearTimeout(st.timer); if (st.quiet) { st.quiet = false; return; } const c = st.map.getCenter(); st.timer = setTimeout(() => reverse(c.lat, c.lng), 450); });
          st.map.on("click", e => st.map.panTo(e.latlng));
          if (current) setPl(current.lat, current.lng, current.label);
          setTimeout(() => st.map.invalidateSize(), 420);
        } catch (_) {
          el.querySelector("[data-map-el]").innerHTML = `<div class="tdp-map-loading"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> The map could not be loaded. You can still type the address.</div>`;
        }
        const search = el.querySelector("[data-msearch]"), results = el.querySelector("[data-mresults]");
        let t = 0;
        search.addEventListener("input", () => {
          clearTimeout(t);
          const q = search.value.trim();
          if (q.length < 3) { results.hidden = true; return; }
          t = setTimeout(async () => {
            try {
              const list = await geo(`/search?q=${encodeURIComponent(q)}&limit=6&addressdetails=1`);
              results.innerHTML = (list || []).map((x, i) => `<li><button type="button" data-mres="${i}"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span><b>${esc(shortName(x))}</b><small>${esc(x.display_name)}</small></span></button></li>`).join("") || `<li class="tdp-muted">No places found</li>`;
              results.hidden = false;
              results.querySelectorAll("[data-mres]").forEach(b => b.addEventListener("click", () => {
                const x = list[+b.dataset.mres]; results.hidden = true; search.value = shortName(x);
                const lat = Number(x.lat), lng = Number(x.lon);
                st.seq++; clearTimeout(st.timer); setPl(lat, lng, shortName(x));
                if (st.map) { st.quiet = true; st.map.setView([lat, lng], 17); }
              }));
            } catch (_) { results.innerHTML = `<li class="tdp-muted">Search is not available right now. Move the map instead.</li>`; results.hidden = false; }
          }, 600);
        });
        el.querySelector("[data-mlocate]").addEventListener("click", () => {
          if (!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition(pos => { st.map?.setView([pos.coords.latitude, pos.coords.longitude], 17); },
            () => { lab.textContent = "Your location is not available. Move the map instead."; }, { enableHighAccuracy: true, timeout: 10000 });
        });
        use.addEventListener("click", () => { if (!st.pl) return; const pl = st.pl; closeTop(); onPick(pl); });
      }
    });
  }

  // ---- inquiry panel -------------------------------------------------------------------------------
  function openInquiry() {
    const st = { done: null, values: null };
    panel({
      id: "ask", title: "Ask a question", sub: S.site.business.name, icon: "fa-comment-dots",
      pills: [pill("We reply by phone, WhatsApp or email", "fa-reply", "info")],
      body: () => st.done ? doneHtml({ ...st.done, inquiry: true }) : `<form id="tdpAsk" class="tdp-form" novalidate>
          <section class="tdp-psec"><h3>Your message</h3><div class="tdp-fgrid">
            <label class="tdp-f is-wide"><span>Subject</span><input name="subject" maxlength="120" placeholder="e.g. Group trip to Makkah" data-autofocus></label>
            <label class="tdp-f is-wide"><span>Message <em aria-hidden="true">*</em></span><textarea name="message" rows="5" maxlength="2000" required></textarea></label>
          </div></section>
          <section class="tdp-psec"><h3>Your details</h3><div class="tdp-fgrid">
            <label class="tdp-f"><span>Name <em aria-hidden="true">*</em></span><input name="name" maxlength="80" autocomplete="name" required></label>
            <label class="tdp-f"><span>Mobile</span><input name="mobile" type="tel" inputmode="tel" maxlength="24" autocomplete="tel" placeholder="+966 50 123 4567"></label>
            <label class="tdp-f is-wide"><span>Email</span><input name="email" type="email" maxlength="160" autocomplete="email"></label>
          </div><small class="tdp-muted">Give a mobile number or an email so we can answer.</small></section>
          <label class="tdp-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
          <p class="tdp-err" data-err role="alert" hidden></p></form>`,
      foot: () => st.done ? `<span></span><button type="button" class="tdp-btn is-primary" data-close-top>Done</button>`
        : `<span class="tdp-foot-note"><small>Answer</small><b>As soon as possible</b></span><button type="submit" form="tdpAsk" class="tdp-btn is-primary" data-send${S.site.preview ? " disabled" : ""}><i class="fa-solid fa-paper-plane" aria-hidden="true"></i><span>Send</span></button>`,
      mount(el) {
        const form = el.querySelector("#tdpAsk"); if (!form) return;
        form.addEventListener("submit", async e => {
          e.preventDefault();
          const p = Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v).trim()]));
          if (!p.message) return showErr(el, "Write your message.", form.elements.message);
          if (!p.name) return showErr(el, "Enter your name.", form.elements.name);
          if (!p.mobile && !p.email) return showErr(el, "Enter your mobile number or email so we can answer.", form.elements.mobile);
          const btn = el.querySelector("[data-send]"); btn.disabled = true; btn.classList.add("is-busy");
          try {
            const r = await rpc("app_drive_public_inquiry", { p_slug: S.slug, p });
            if (r && r.ok) { notifyBusiness(r.push_token); st.done = r; el._def.title = "Message sent"; paintPanel(el); return; }
            showErr(el, r?.error || "Your message could not be sent. Please try again.", r?.field ? form.elements[r.field] : null);
          } catch (_) { showErr(el, "Your message could not be sent. Check your connection and try again."); }
          finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove("is-busy"); } }
        });
      }
    });
  }

  function openCredits() {
    const items = (S.cat?.vehicles || []).flatMap(v => (v.photos || []).filter(p => p.commons).map(p => ({ v, p })));
    panel({
      id: "credits", title: "Photo credits", sub: "Vehicle photos", icon: "fa-camera",
      body: () => `<section class="tdp-psec"><h3>Wikimedia Commons</h3><ul class="tdp-rows">${items.map(({ v, p }) => {
        const cr = S.credits[p.file] || {};
        return `<li><span><b>${esc(v.name)}</b><small><a href="${esc(commonsPage(p.commons))}" target="_blank" rel="noopener nofollow">${esc(p.commons)}</a>${cr.author ? ` · ${esc(cr.author)}` : ""} · ${esc(cr.license || "free licence (see the file page)")}</small></span></li>`;
      }).join("")}</ul></section>`
    });
  }

  // ---- events --------------------------------------------------------------------------------------
  function bind() {
    app.addEventListener("error", onImgError, true);
    app.addEventListener("load", onImgLoad, true);
    app.addEventListener("click", e => {
      const t = e.target;
      if (t.closest("[data-close-top]")) return closeTop();
      const tab = t.closest("[data-tab]"); if (tab) return showTab(tab.dataset.tab);
      const go = t.closest("[data-tab-go]"); if (go) { closeAll(); showTab(go.dataset.tabGo); app.querySelector(".tdp-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      const ptab = t.closest("[data-ptab]"); if (ptab) { const el = ptab.closest(".tdp-pnl"); el._def.tab = ptab.dataset.ptab; return paintPanel(el); }
      const flt = t.closest("[data-filter]"); if (flt) { S.filter = flt.dataset.filter; return showTab("vehicles"); }
      const grp = t.closest("[data-group]"); if (grp) { S.group = grp.dataset.group; return showTab("prices"); }
      const act = t.closest("[data-act]");
      if (act) { const a = act.dataset.act; if (a === "book") return openBooking(); if (a === "inquiry") return openInquiry(); if (a === "credits") return openCredits(); }
      const bc = t.closest("[data-book-car]");
      if (bc) {
        const c = carById(bc.dataset.bookCar); if (!c) return;
        if (S.stack.length && S.stack[S.stack.length - 1]._def.id === "car") closeTop();
        return openBooking(c.cls ? { cls: c.cls, model: c.id, service: bc.dataset.service || "" } : { vehicle: c.key });
      }
      const bs = t.closest("[data-book-service]"); if (bs) return openBooking({ service: bs.dataset.bookService });
      const br = t.closest("[data-book-route]"); if (br) return openBooking({ route: br.dataset.bookRoute });
      const card = t.closest("[data-car]"); if (card) return openCar(card.dataset.car);
    });
    app.addEventListener("input", e => {
      const f = e.target.closest?.(".tdp-form"); if (!f || !e.target.classList.contains("is-bad")) return;
      e.target.classList.remove("is-bad"); const err = f.querySelector("[data-err]"); if (err) err.hidden = true;
    });
    app.addEventListener("keydown", e => {
      const card = e.target.closest?.("[data-car]");
      if (card && (e.key === "Enter" || e.key === " ") && e.target === card) { e.preventDefault(); openCar(card.dataset.car); }
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && S.stack.length) { e.preventDefault(); closeTop(); } });
  }

  // ---- start ---------------------------------------------------------------------------------------
  async function loadCatalogue(site) {
    try {
      const r = await fetch(`${CAT_BASE}catalog.json?v=${Date.now().toString(36).slice(0, 5)}`, { cache: "no-cache" });
      if (!r.ok) return null;
      const c = await r.json(), to = c.apply_to || {};
      if (!((to.root && site.is_root) || (Array.isArray(to.slugs) && to.slugs.includes(site.slug)))) return null;
      if (!Array.isArray(c.vehicles) || !Array.isArray(c.services)) return null;
      try { const cr = await fetch(`${CAT_BASE}credits.json`, { cache: "no-cache" }); if (cr.ok) S.credits = await cr.json(); } catch (_) {}
      return c;
    } catch (_) { return null; }
  }
  async function start() {
    S.slug = resolveSlug();
    let r;
    try {
      r = await rpc("app_drive_public_site", { p_slug: S.slug, p_preview: preview || null });
      if (r && !r.ok && r.reason === "not_found" && S.slug === "triplemdrive") r = await rpc("app_drive_public_site", { p_slug: null, p_preview: preview || null });
    } catch (e) {
      seo({ title: "Triplem Drive", description: "Vehicle bookings by Triplem Drive.", index: false });
      return messagePage("fa-wifi", "This page could not be loaded", "Check your connection and try again.", `<button class="tdp-btn is-primary" onclick="location.reload()">Try again</button>`);
    }
    if (r && r.ok) {
      S.site = r; S.slug = r.slug; S.cat = await loadCatalogue(r);
      const h = (location.hash || "").replace("#", "");
      if (["vehicles", "prices", "routes", "faq", "contact"].includes(h)) S.tab = h;
      render(); bind();
      if (h === "book") openBooking(); else if (h === "ask") openInquiry();
      return;
    }
    if (r && r.reason === "moved" && r.slug) { location.replace(`/${encodeURIComponent(r.slug)}/${location.hash}`); return; }
    seo({ title: r?.reason === "unpublished" ? `${r.business_name || "Triplem Drive"} · Not available` : "Page not found · Triplem Drive", description: "This Triplem Drive page is not available.", index: false });
    if (r && r.reason === "unpublished") return messagePage("fa-eye-slash", r.business_name || "Not available yet", "This booking page is not available at the moment. Please contact the business directly.");
    return messagePage("fa-route", "Page not found", qs.get("nf") ? "The page you are looking for could not be found." : "There is no booking page at this address.", `<a class="tdp-btn is-primary" href="${CANON_ORIGIN}/">Go to Triplem VIP</a>`);
  }
  start();
})();
