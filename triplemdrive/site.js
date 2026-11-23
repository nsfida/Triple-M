/* Triplem Drive - public business page (2026-11-23).
 * https://triplem.vip/triplemdrive/<address>/ (or /triplemdrive/?b=<address>, or /triplemdrive/ for the
 * business the Main Admin chose). Everything shown comes from app_drive_public_site, which returns
 * only published, enabled businesses and only their public vehicles, routes and rates (never
 * registration numbers, internal notes, internal ids or customer data). A booking request is shown
 * as received only after app_drive_public_book has stored it and returned its reference.
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

  const app = document.getElementById("tdsApp");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qs = new URLSearchParams(location.search);
  const preview = qs.get("preview") || "";
  const S = { slug: "", site: null, media: new Map(), section: "", vehicle: null };

  async function rpc(fn, args) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
      body: JSON.stringify(args || {})
    });
    if (!res.ok) throw new Error("The page could not be loaded. Please try again.");
    return res.json();
  }

  // ---- address -------------------------------------------------------------------------------
  function resolveSlug() {
    const m = location.pathname.match(/^\/triplemdrive\/([a-z0-9-]{3,40})\/?$/i);
    if (m) return m[1].toLowerCase();
    const b = (qs.get("b") || "").toLowerCase();
    if (/^[a-z0-9-]{3,40}$/.test(b)) {
      const keep = preview ? `?preview=${encodeURIComponent(preview)}` : "";
      try { history.replaceState(null, "", `/triplemdrive/${b}/${keep}${location.hash}`); } catch (_) {}
      return b;
    }
    return "";
  }

  // ---- SEO -------------------------------------------------------------------------------------
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
      const data = { "@context": "https://schema.org", "@type": "AutoRental", name: business.name, url, description: description };
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

  // ---- images ----------------------------------------------------------------------------------
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
    const imgs = [...root.querySelectorAll("img[data-k]")].filter(i => !i.src || i.dataset.size !== size);
    if (!imgs.length) return;
    // Visible first: load what is on screen, the rest when it scrolls into view.
    const load = async list => {
      await loadMedia(list.map(i => i.dataset.k), size);
      list.forEach(i => { const u = S.media.get(`${size}:${i.dataset.k}`); if (u) { i.src = u; i.dataset.size = size; i.classList.add("is-in"); } else i.closest(".tds-ph")?.classList.add("is-none"); });
    };
    if (!("IntersectionObserver" in window)) return load(imgs);
    const io = new IntersectionObserver(entries => {
      const vis = entries.filter(e => e.isIntersecting).map(e => e.target);
      vis.forEach(v => io.unobserve(v));
      if (vis.length) load(vis);
    }, { rootMargin: "300px" });
    imgs.forEach(i => io.observe(i));
  }

  // ---- formatting ------------------------------------------------------------------------------
  const cur = () => S.site?.business?.currency || "USD";
  function money(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur(), maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
    catch (_) { return `${cur()} ${n.toLocaleString()}`; }
  }
  const PER = { per_trip: "per trip", hourly: "per hour", daily: "per day", weekly: "per week", monthly: "per month", route: "per trip", custom_quote: "" };
  function fromPrice(v) {
    if (!v.show_price) return null;
    const priced = (v.rates || []).filter(r => r.amount != null);
    if (!priced.length) return null;
    const best = priced.slice().sort((a, b) => Number(a.amount) - Number(b.amount))[0];
    return { amount: money(best.amount), per: PER[best.type] || "" };
  }
  const waLink = (n, text = "") => { const d = String(n || "").replace(/[^\d]/g, ""); return d.length >= 7 ? `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}` : ""; };
  const minsText = m => { m = Number(m) || 0; if (!m) return ""; const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ` ${r} min` : ""}` : `${r} min`; };

  // ---- page ------------------------------------------------------------------------------------
  function messagePage(icon, title, text, extra = "") {
    app.innerHTML = `<main id="tdsMain" class="tds-msg"><div class="tds-msg-card"><span class="tds-msg-ico"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><h1>${esc(title)}</h1><p>${esc(text)}</p>${extra}</div>
      <footer class="tds-foot is-min"><span>Powered by <a href="${CANON_ORIGIN}/" rel="noopener">Triplem Drive · Triplem VIP</a></span></footer></main>`;
    app.removeAttribute("aria-busy");
  }

  function render() {
    const s = S.site, b = s.business;
    const url = `${CANON_ORIGIN}/triplemdrive/${s.slug}/`;
    const desc = (b.tagline || b.description || `Book vehicles from ${b.name} online.`).replace(/\s+/g, " ").trim().slice(0, 155);
    seo({ title: `${b.name} · Vehicle Bookings`, description: desc, url, index: !s.preview, business: b });
    const vehicles = s.vehicles || [];
    const sections = s.sections || [];
    const wa = waLink(b.whatsapp, `Hello ${b.name}, I would like to book a vehicle.`);
    const socialIcons = { website: "fa-solid fa-globe", instagram: "fa-brands fa-instagram", facebook: "fa-brands fa-facebook", x: "fa-brands fa-x-twitter", tiktok: "fa-brands fa-tiktok", youtube: "fa-brands fa-youtube", linkedin: "fa-brands fa-linkedin" };
    const social = Object.entries(b.social || {}).filter(([k, v]) => v && socialIcons[k]);
    app.innerHTML = `
      ${s.preview ? `<div class="tds-preview"><i class="fa-solid fa-eye" aria-hidden="true"></i> Preview · this page is not published yet. Booking requests are switched off.</div>` : ""}
      <header class="tds-head">
        <a class="tds-brand" href="#top" aria-label="${esc(b.name)}">
          ${b.logo ? `<span class="tds-logo"><img data-k="${esc(b.logo)}" alt="${esc(b.name)} logo"></span>` : `<span class="tds-logo is-text" aria-hidden="true">${esc(b.name.trim().charAt(0).toUpperCase())}</span>`}
          <span class="tds-brand-name">${esc(b.name)}</span>
        </a>
        <nav class="tds-nav" aria-label="Page">
          ${vehicles.length ? `<a href="#fleet">Fleet</a>` : ""}${(s.routes || []).length ? `<a href="#routes">Routes</a>` : ""}${(s.rates || []).length ? `<a href="#rates">Rates</a>` : ""}<a href="#contact">Contact</a>
        </nav>
        <a class="tds-btn is-primary tds-head-cta" href="#book"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i><span>Book now</span></a>
      </header>
      <main id="tdsMain">
        <section class="tds-hero${b.banner ? " has-banner" : ""}" id="top">
          ${b.banner ? `<img class="tds-hero-img" data-k="${esc(b.banner)}" data-size-hint="full" alt="">` : ""}
          <div class="tds-hero-inner">
            <h1>${esc(b.name)}</h1>
            ${b.tagline ? `<p class="tds-tagline">${esc(b.tagline)}</p>` : ""}
            <div class="tds-hero-cta">
              <a class="tds-btn is-primary is-lg" href="#book"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i> Request a booking</a>
              ${wa ? `<a class="tds-btn is-wa is-lg" href="${esc(wa)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a>` : b.phone ? `<a class="tds-btn is-ghost is-lg" href="tel:${esc(b.phone)}"><i class="fa-solid fa-phone" aria-hidden="true"></i> Call us</a>` : ""}
            </div>
            <ul class="tds-hero-facts">
              ${vehicles.length ? `<li><i class="fa-solid fa-car-side" aria-hidden="true"></i>${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"}</li>` : ""}
              ${b.hours ? `<li><i class="fa-regular fa-clock" aria-hidden="true"></i>${esc(b.hours)}</li>` : ""}
              ${b.address ? `<li><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${esc(b.address.split("\n")[0])}</li>` : ""}
            </ul>
          </div>
        </section>

        ${b.description ? `<section class="tds-sec tds-about"><div class="tds-wrap"><h2>About us</h2><p class="tds-pre">${esc(b.description)}</p></div></section>` : ""}

        <section class="tds-sec" id="fleet"><div class="tds-wrap">
          <div class="tds-sec-head"><h2>Our fleet</h2>${sections.length > 1 ? `<div class="tds-chips" role="radiogroup" aria-label="Fleet sections"><button type="button" role="radio" aria-checked="true" data-sec="">All</button>${sections.map(x => `<button type="button" role="radio" aria-checked="false" data-sec="${esc(x.key)}">${esc(x.name)}</button>`).join("")}</div>` : ""}</div>
          ${vehicles.length ? `<div class="tds-grid" data-grid>${vehicles.map(vehicleCard).join("")}</div>` : `<p class="tds-muted">Our vehicles will be listed here soon. You can still send a booking request below.</p>`}
        </div></section>

        ${(s.routes || []).length ? `<section class="tds-sec is-tint" id="routes"><div class="tds-wrap"><h2>Popular routes</h2>
          <div class="tds-routes">${s.routes.map(r => `<article class="tds-route">
              <div class="tds-route-line"><b>${esc(r.pickup)}</b><i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i><b>${esc(r.destination)}</b></div>
              ${(r.stops || []).length ? `<small>via ${esc(r.stops.join(", "))}</small>` : ""}
              <div class="tds-route-meta">${r.distance_km ? `<span><i class="fa-solid fa-road" aria-hidden="true"></i>${esc(r.distance_km)} km</span>` : ""}${r.duration_min ? `<span><i class="fa-regular fa-clock" aria-hidden="true"></i>${esc(minsText(r.duration_min))}</span>` : ""}</div>
              <div class="tds-route-foot"><span class="tds-price">${r.price != null ? esc(money(r.price)) : "Request a Quote"}</span><button type="button" class="tds-btn" data-book-route="${esc(r.key)}">Book</button></div>
            </article>`).join("")}</div></div></section>` : ""}

        ${(s.rates || []).length ? `<section class="tds-sec" id="rates"><div class="tds-wrap"><h2>Rates</h2>
          <div class="tds-rates">${s.rates.map(r => `<div class="tds-rate"><div><b>${esc(r.label)}</b>${r.section ? `<small>${esc((sections.find(x => x.key === r.section) || {}).name || "")}</small>` : ""}${r.extras ? `<small>${esc(r.extras)}</small>` : ""}</div>
            <span class="tds-price">${r.amount != null ? `${esc(money(r.amount))} <small>${esc(PER[r.type] || "")}</small>` : "Request a Quote"}</span></div>`).join("")}</div>
          <p class="tds-muted">Prices in ${esc(cur())}. Payment is arranged directly with us; nothing is charged online.</p></div></section>` : ""}

        <section class="tds-sec is-tint" id="book"><div class="tds-wrap tds-book">
          <div class="tds-book-intro"><h2>Request a booking</h2><p>Send your request and we will contact you to confirm your reservation.</p>
            ${b.contact_note ? `<p class="tds-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i>${esc(b.contact_note)}</p>` : ""}
          </div>
          <form class="tds-form" data-form novalidate>${formHtml()}</form>
        </div></section>

        <section class="tds-sec" id="contact"><div class="tds-wrap"><h2>Contact</h2>
          <div class="tds-contact">
            ${b.phone ? `<a class="tds-cbox" href="tel:${esc(b.phone)}"><i class="fa-solid fa-phone" aria-hidden="true"></i><span><small>Phone</small><b>${esc(b.phone)}</b></span></a>` : ""}
            ${wa ? `<a class="tds-cbox" href="${esc(waLink(b.whatsapp))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span><small>WhatsApp</small><b>${esc(b.whatsapp)}</b></span></a>` : ""}
            ${b.email ? `<a class="tds-cbox" href="mailto:${esc(b.email)}"><i class="fa-regular fa-envelope" aria-hidden="true"></i><span><small>Email</small><b>${esc(b.email)}</b></span></a>` : ""}
            ${b.address ? `<${b.location_url ? `a href="${esc(b.location_url)}" target="_blank" rel="noopener"` : "div"} class="tds-cbox"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span><small>Address</small><b class="tds-pre">${esc(b.address)}</b></span></${b.location_url ? "a" : "div"}>` : ""}
            ${b.hours ? `<div class="tds-cbox"><i class="fa-regular fa-clock" aria-hidden="true"></i><span><small>Hours</small><b>${esc(b.hours)}</b></span></div>` : ""}
          </div>
          ${social.length ? `<div class="tds-social">${social.map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener nofollow" aria-label="${esc(k)}"><i class="${socialIcons[k]}" aria-hidden="true"></i></a>`).join("")}</div>` : ""}
          ${b.terms || b.cancellation_policy ? `<div class="tds-terms">${b.terms ? `<details><summary>Terms and conditions</summary><p class="tds-pre">${esc(b.terms)}</p></details>` : ""}${b.cancellation_policy ? `<details><summary>Cancellation policy</summary><p class="tds-pre">${esc(b.cancellation_policy)}</p></details>` : ""}</div>` : ""}
        </div></section>
      </main>
      <footer class="tds-foot"><div class="tds-wrap"><span>© ${new Date().getFullYear()} ${esc(b.name)}</span><span>Powered by <a href="${CANON_ORIGIN}/" rel="noopener">Triplem Drive · Triplem VIP</a></span></div></footer>
      <dialog class="tds-dlg" data-dlg aria-labelledby="tdsDlgTitle"></dialog>`;
    app.removeAttribute("aria-busy");
    bind();
    fillImages(app, "thumb");
    const hero = app.querySelector(".tds-hero-img");
    if (hero) loadMedia([hero.dataset.k], "full").then(() => { const u = S.media.get(`full:${hero.dataset.k}`); if (u) { hero.src = u; hero.classList.add("is-in"); } });
    if (location.hash && location.hash.length > 1) { try { document.querySelector(location.hash)?.scrollIntoView(); } catch (_) {} }
  }

  function vehicleCard(v) {
    const p = fromPrice(v);
    const facts = [v.capacity ? `<span><i class="fa-solid fa-user-group" aria-hidden="true"></i>${esc(v.capacity)}</span>` : "", v.transmission ? `<span><i class="fa-solid fa-gears" aria-hidden="true"></i>${esc(v.transmission)}</span>` : "", v.fuel ? `<span><i class="fa-solid fa-gas-pump" aria-hidden="true"></i>${esc(v.fuel)}</span>` : "", v.year ? `<span><i class="fa-regular fa-calendar" aria-hidden="true"></i>${esc(v.year)}</span>` : ""].join("");
    return `<article class="tds-card" data-sec-of="${esc(v.section || "")}">
      <button type="button" class="tds-card-media" data-open="${esc(v.key)}" aria-label="View ${esc(v.name)}">
        <span class="tds-ph">${v.photos?.[0] ? `<img data-k="${esc(v.photos[0])}" alt="${esc(v.name)}" loading="lazy">` : ""}<i class="fa-solid fa-car-side" aria-hidden="true"></i></span>
        ${v.featured ? `<span class="tds-badge">Featured</span>` : ""}${v.photos?.length > 1 ? `<span class="tds-count"><i class="fa-regular fa-images" aria-hidden="true"></i>${v.photos.length}</span>` : ""}
      </button>
      <div class="tds-card-body">
        <h3>${esc(v.name)}</h3>
        ${[v.make, v.model].filter(Boolean).length ? `<small class="tds-muted">${esc([v.make, v.model].filter(Boolean).join(" "))}</small>` : ""}
        ${facts ? `<div class="tds-facts">${facts}</div>` : ""}
        <div class="tds-card-foot">
          <span class="tds-price">${p ? `<small>From</small> ${esc(p.amount)} <small>${esc(p.per)}</small>` : "Request a Quote"}</span>
          ${v.bookable ? `<button type="button" class="tds-btn is-primary" data-book="${esc(v.key)}">Book</button>` : `<span class="tds-muted">Not available</span>`}
        </div>
      </div>
    </article>`;
  }

  function vehicleDialog(key) {
    const v = (S.site.vehicles || []).find(x => x.key === key);
    const dlg = app.querySelector("[data-dlg]");
    if (!v || !dlg) return;
    const p = fromPrice(v);
    dlg.innerHTML = `<div class="tds-dlg-card">
      <button type="button" class="tds-dlg-x" data-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      <div class="tds-gallery">${v.photos?.length ? `<span class="tds-ph is-big"><img data-k="${esc(v.photos[0])}" alt="${esc(v.name)}" data-main><i class="fa-solid fa-car-side"></i></span>
        ${v.photos.length > 1 ? `<div class="tds-thumbs">${v.photos.map((k, i) => `<button type="button" data-thumb="${esc(k)}" aria-label="Photo ${i + 1}"${i === 0 ? ' aria-current="true"' : ""}><span class="tds-ph"><img data-k="${esc(k)}" alt=""></span></button>`).join("")}</div>` : ""}` : `<span class="tds-ph is-big is-none"><i class="fa-solid fa-car-side"></i></span>`}</div>
      <div class="tds-dlg-body">
        <h2 id="tdsDlgTitle">${esc(v.name)}</h2>
        ${[v.make, v.model, v.year].filter(Boolean).length ? `<p class="tds-muted">${esc([v.make, v.model, v.year].filter(Boolean).join(" · "))}</p>` : ""}
        <dl class="tds-specs">${[["Passengers", v.capacity], ["Transmission", v.transmission], ["Fuel", v.fuel], ...(v.specs || []).map(s => [s.label, s.value])].filter(([, x]) => x).map(([k, x]) => `<div><dt>${esc(k)}</dt><dd>${esc(x)}</dd></div>`).join("")}</dl>
        ${v.description ? `<p class="tds-pre">${esc(v.description)}</p>` : ""}
        ${v.show_price && (v.rates || []).length ? `<div class="tds-rates is-compact">${v.rates.map(r => `<div class="tds-rate"><div><b>${esc(r.label)}</b>${r.extras ? `<small>${esc(r.extras)}</small>` : ""}</div><span class="tds-price">${r.amount != null ? `${esc(money(r.amount))} <small>${esc(PER[r.type] || "")}</small>` : "Request a Quote"}</span></div>`).join("")}</div>` : `<p class="tds-price">${p ? esc(p.amount) : "Request a Quote"}</p>`}
        ${v.bookable ? `<button type="button" class="tds-btn is-primary is-lg is-block" data-book="${esc(v.key)}"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i> Book this vehicle</button>` : `<p class="tds-muted">This vehicle cannot be booked at the moment.</p>`}
      </div></div>`;
    dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
    fillImages(dlg, "thumb").then(() => {
      const main = dlg.querySelector("[data-main]");
      if (main) loadMedia([main.dataset.k], "full").then(() => { const u = S.media.get(`full:${main.dataset.k}`); if (u) { main.src = u; main.classList.add("is-in"); } });
    });
  }

  // ---- booking form ----------------------------------------------------------------------------
  const today = () => S.site.today || new Date().toISOString().slice(0, 10);
  function formHtml() {
    const f = S.site.form, vehicles = (S.site.vehicles || []).filter(v => v.bookable), routes = S.site.routes || [];
    const field = x => {
      if (!x.enabled) return "";
      const req = x.required ? " required" : "", star = x.required ? ' <em aria-hidden="true">*</em>' : "";
      const lab = `<span>${esc(x.label)}${star}</span>`;
      const def = esc(x.default || "");
      switch (x.key) {
        case "customer_name": return `<label class="tds-f">${lab}<input name="customer_name" autocomplete="name" maxlength="80"${req}></label>`;
        case "customer_mobile": return `<label class="tds-f">${lab}<input name="customer_mobile" type="tel" autocomplete="tel" inputmode="tel" maxlength="24" placeholder="+971 50 123 4567"${req}></label>`;
        case "customer_email": return `<label class="tds-f">${lab}<input name="customer_email" type="email" autocomplete="email" maxlength="160"${req}></label>`;
        case "vehicle": return vehicles.length ? `<label class="tds-f is-wide">${lab}<select name="vehicle"${req}><option value="">${x.required ? "Choose a vehicle" : "Any suitable vehicle"}</option>${vehicles.map(v => `<option value="${esc(v.key)}">${esc(v.name)}${v.capacity ? ` · ${esc(v.capacity)} seats` : ""}</option>`).join("")}</select></label>` : "";
        case "route": return routes.length ? `<label class="tds-f is-wide">${lab}<select name="route"${req}><option value="">${x.required ? "Choose a route" : "No fixed route"}</option>${routes.map(r => `<option value="${esc(r.key)}">${esc(r.pickup)} → ${esc(r.destination)}${r.price != null ? " · " + esc(money(r.price)) : ""}</option>`).join("")}</select></label>` : "";
        case "pickup": return `<label class="tds-f">${lab}<input name="pickup" maxlength="200" value="${def}"${req}></label>`;
        case "destination": return `<label class="tds-f">${lab}<input name="destination" maxlength="200" value="${def}"${req}></label>`;
        case "pickup_date": return `<label class="tds-f">${lab}<input name="pickup_date" type="date" min="${esc(today())}"${req}></label>`;
        case "pickup_time": return `<label class="tds-f">${lab}<input name="pickup_time" type="time"${req}></label>`;
        case "return_date": return `<label class="tds-f">${lab}<input name="return_date" type="date" min="${esc(today())}"${req}></label>`;
        case "return_time": return `<label class="tds-f">${lab}<input name="return_time" type="time"${req}></label>`;
        case "passengers": return `<label class="tds-f">${lab}<input name="passengers" type="number" min="1" max="500" inputmode="numeric"${req}></label>`;
        case "notes": return `<label class="tds-f is-wide">${lab}<textarea name="customer_notes" rows="3" maxlength="2000">${def}</textarea></label>`;
        default: return "";
      }
    };
    const q = x => {
      const req = x.required ? " required" : "", star = x.required ? ' <em aria-hidden="true">*</em>' : "";
      const name = `q_${esc(x.id)}`;
      if (x.type === "checkbox") return `<label class="tds-check is-wide"><input type="checkbox" name="${name}"${req}><span>${esc(x.label)}${star}</span></label>`;
      if (x.type === "select") return `<label class="tds-f">${`<span>${esc(x.label)}${star}</span>`}<select name="${name}"${req}><option value="">Choose…</option>${(x.choices || []).map(c => `<option>${esc(c)}</option>`).join("")}</select></label>`;
      if (x.type === "textarea") return `<label class="tds-f is-wide"><span>${esc(x.label)}${star}</span><textarea name="${name}" rows="2" maxlength="500"${req}></textarea></label>`;
      return `<label class="tds-f"><span>${esc(x.label)}${star}</span><input name="${name}" ${x.type === "number" ? 'type="number" inputmode="decimal"' : 'type="text"'} maxlength="500"${req}></label>`;
    };
    return `<div class="tds-fgrid">${f.fields.map(field).join("")}${(f.questions || []).map(q).join("")}</div>
      <label class="tds-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      <p class="tds-err" data-err role="alert" hidden></p>
      <button type="submit" class="tds-btn is-primary is-lg is-block" data-submit${S.site.preview ? " disabled" : ""}><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Send booking request</button>
      <p class="tds-muted tds-small">We use your details only to handle this booking. No payment is taken online.</p>`;
  }

  async function submit(form) {
    const err = form.querySelector("[data-err]"), btn = form.querySelector("[data-submit]");
    err.hidden = true;
    form.querySelectorAll(".is-bad").forEach(x => x.classList.remove("is-bad"));
    const fd = new FormData(form), p = { answers: {} };
    for (const [k, v] of fd.entries()) { if (k.startsWith("q_")) p.answers[k.slice(2)] = String(v).trim(); else p[k] = String(v).trim(); }
    form.querySelectorAll('input[type="checkbox"][name^="q_"]').forEach(c => { p.answers[c.name.slice(2)] = c.checked ? "yes" : ""; });
    // Browser checks first (the server checks everything again).
    const missing = [...form.querySelectorAll("[required]")].find(el => el.type === "checkbox" ? !el.checked : !String(el.value || "").trim());
    if (missing) { showErr(form, "Please fill in the required fields.", missing); return; }
    btn.disabled = true; btn.classList.add("is-busy");
    try {
      const r = await rpc("app_drive_public_book", { p_slug: S.slug, p });
      if (r && r.ok && r.reference) {
        form.closest(".tds-book").innerHTML = `<div class="tds-done" role="status" tabindex="-1">
            <span class="tds-done-ico ${r.status === "confirmed" ? "is-ok" : ""}"><i class="fa-solid ${r.status === "confirmed" ? "fa-circle-check" : "fa-paper-plane"}" aria-hidden="true"></i></span>
            <h2>${r.status === "confirmed" ? "Booking confirmed" : "Request received"}</h2>
            <p>${esc(r.message)}</p>
            <p class="tds-ref">Your reference<b>${esc(r.reference)}</b></p>
            <div class="tds-hero-cta">${waLink(S.site.business.whatsapp) ? `<a class="tds-btn is-wa" href="${esc(waLink(S.site.business.whatsapp, `Hello ${S.site.business.name}, about my booking ${r.reference}.`))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp us</a>` : ""}<a class="tds-btn" href="#top">Back to top</a></div>
          </div>`;
        const done = app.querySelector(".tds-done"); done?.focus(); done?.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      const el = r?.field ? form.querySelector(`[name="${r.field === "notes" ? "customer_notes" : r.field}"]`) : null;
      showErr(form, r?.error || "Your request could not be sent. Please try again.", el);
    } catch (_) {
      showErr(form, "Your request could not be sent. Check your connection and try again.");
    } finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove("is-busy"); } }
  }
  function showErr(form, text, el) {
    const err = form.querySelector("[data-err]");
    err.textContent = text; err.hidden = false;
    if (el) { el.classList.add("is-bad"); el.focus({ preventScroll: false }); }
    else err.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function bind() {
    const form = app.querySelector("[data-form]");
    form?.addEventListener("submit", e => { e.preventDefault(); submit(form); });
    form?.addEventListener("change", e => {
      if (e.target.name === "route") {
        const r = (S.site.routes || []).find(x => x.key === e.target.value);
        if (r) { const a = form.elements.pickup, b = form.elements.destination; if (a && !a.value) a.value = r.pickup; if (b && !b.value) b.value = r.destination; }
      }
      if (e.target.name === "pickup_date" && form.elements.return_date) form.elements.return_date.min = e.target.value || today();
    });
    app.addEventListener("click", e => {
      const t = e.target;
      const sec = t.closest("[data-sec]");
      if (sec) {
        S.section = sec.dataset.sec;
        app.querySelectorAll("[data-sec]").forEach(x => x.setAttribute("aria-checked", String(x === sec)));
        app.querySelectorAll("[data-sec-of]").forEach(c => { c.hidden = !!S.section && c.dataset.secOf !== S.section; });
        return;
      }
      const op = t.closest("[data-open]"); if (op) return vehicleDialog(op.dataset.open);
      const bk = t.closest("[data-book]");
      if (bk) { const d = app.querySelector("[data-dlg]"); if (d?.open) d.close(); pick("vehicle", bk.dataset.book); return; }
      const br = t.closest("[data-book-route]"); if (br) return pick("route", br.dataset.bookRoute);
      const th = t.closest("[data-thumb]");
      if (th) {
        const dlg = th.closest("dialog"), main = dlg.querySelector("[data-main]");
        dlg.querySelectorAll("[data-thumb]").forEach(x => x.toggleAttribute("aria-current", x === th));
        main.dataset.k = th.dataset.thumb; main.classList.remove("is-in");
        loadMedia([th.dataset.thumb], "full").then(() => { const u = S.media.get(`full:${th.dataset.thumb}`) || S.media.get(`thumb:${th.dataset.thumb}`); if (u) { main.src = u; main.classList.add("is-in"); } });
        return;
      }
      if (t.closest("[data-close]") || t.matches("dialog")) t.closest("dialog")?.close();
    });
  }
  function pick(name, value) {
    const form = app.querySelector("[data-form]");
    const sel = form?.elements[name];
    if (sel) { sel.value = value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
    document.getElementById("book")?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => form?.querySelector("input:not([type=hidden]):not([tabindex='-1'])")?.focus({ preventScroll: true }), 450);
  }

  // ---- start -----------------------------------------------------------------------------------
  async function start() {
    S.slug = resolveSlug();
    let r;
    try { r = await rpc("app_drive_public_site", { p_slug: S.slug || null, p_preview: preview || null }); }
    catch (e) { seo({ title: "Triplem Drive", description: "Vehicle bookings by Triplem Drive.", index: false }); return messagePage("fa-wifi", "This page could not be loaded", "Check your connection and try again.", `<button class="tds-btn is-primary" onclick="location.reload()">Try again</button>`); }
    if (r && r.ok) { S.site = r; if (!S.slug) S.slug = r.slug; return render(); }
    if (r && r.reason === "moved" && r.slug) { location.replace(`/triplemdrive/${encodeURIComponent(r.slug)}/${location.hash}`); return; }
    seo({ title: r?.reason === "unpublished" ? `${r.business_name || "Triplem Drive"} · Not available` : "Page not found · Triplem Drive", description: "This Triplem Drive page is not available.", index: false });
    if (r && r.reason === "unpublished") return messagePage("fa-eye-slash", r.business_name || "Not available yet", "This booking page is not available at the moment. Please contact the business directly.");
    return messagePage("fa-route", "Page not found", "There is no booking page at this address.", `<a class="tds-btn is-primary" href="${CANON_ORIGIN}/">Go to Triplem VIP</a>`);
  }
  start();
})();
