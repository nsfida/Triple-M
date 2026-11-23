/* Triplem Drive - public business page (2026-11-23, update 7: premium one-page site with booking overlay).
 *
 * https://triplem.vip/<address>/ (Triplem Drive itself: https://triplem.vip/triplemdrive/). Other addresses reach
 * this page through 404.html (/<address>/ -> /triplemdrive/?b=<address>); the short address is put back in the
 * address bar. Earlier /triplemdrive/<address>/ links still work.
 *
 * The page never shows prices. A visitor first says what they need (within the city, airport transfer, outside
 * the city); the booking overlay then walks through: vehicle type -> car (photo slider) -> trip (pickup and
 * drop-off typed or picked on a map, date and time) -> optional return -> customer details -> price confirmation.
 * The price appears only at that last step: one way = listed price, return trip = 2 x listed price.
 *
 * Data: app_drive_public_site (published businesses only; never registrations, notes, ids or customer data) and,
 * for Triplem Drive, triplemdrive/catalog/catalog.json (types, services, listed prices, cities, FAQ, support).
 * A request is shown as received only after the server stored it and returned its reference; then the business
 * gets a push notification (push-notifications Edge Function, one-time token from the server).
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
  const ASSETS = "/triplemdrive/assets/";
  const LOGO = ASSETS + "logo.svg";
  const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
  const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
  const GEO = "https://nominatim.openstreetmap.org";
  const STEP_MS = 680; // overlay step animation (slow and smooth on purpose)

  const app = document.getElementById("tdsApp");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qs = new URLSearchParams(location.search);
  const preview = qs.get("preview") || "";
  const reduceMotion = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } })();
  const S = { slug: "", site: null, cat: null, credits: {}, media: new Map(), stack: [] };

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
  function seo({ title, description, url, index, business, contact }) {
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
      if (contact?.phone) data.telephone = contact.phone;
      if (contact?.email) data.email = contact.email;
      if (business.address) data.address = business.address;
      if (business.hours) data.openingHours = business.hours;
      const same = Object.values(business.social || {}).filter(Boolean);
      if (same.length) data.sameAs = same;
      ld.textContent = JSON.stringify(data);
    } else if (ld) ld.textContent = "{}";
  }

  // ---- images ------------------------------------------------------------------------------------
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
    const want = size === "auto" ? null : size;
    const full = imgs.filter(i => (want || i.dataset.size || "thumb") === "full"), thumbs = imgs.filter(i => !full.includes(i));
    await Promise.all([loadMedia(thumbs.map(i => i.dataset.k), "thumb"), loadMedia(full.map(i => i.dataset.k), "full")]);
    imgs.forEach(i => {
      const sz = full.includes(i) ? "full" : "thumb";
      const u = S.media.get(`${sz}:${i.dataset.k}`) || S.media.get(`thumb:${i.dataset.k}`);
      if (u) { i.src = u; i.classList.add("is-in"); } else i.closest(".tdx-ph")?.classList.add("is-none");
    });
  }
  // Catalogue photos: the copy on this website first, otherwise the same picture from Wikimedia Commons.
  const commonsFile = (name, w = 1600) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${w}`;
  const commonsPage = name => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(String(name).replace(/ /g, "_"))}`;
  function onImgError(e) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.commons && !img.dataset.tried) { img.dataset.tried = "1"; img.src = commonsFile(img.dataset.commons, +img.dataset.w || 1600); return; }
    if (img.dataset.commons || img.dataset.k || img.dataset.local) { img.closest(".tdx-ph")?.classList.add("is-none"); img.remove(); }
  }
  function onImgLoad(e) { const img = e.target; if (img instanceof HTMLImageElement && img.closest(".tdx-ph")) img.classList.add("is-in"); }
  // photo({key} | {file, commons}, alt, cls, size, w)
  function photo(p, alt = "", cls = "", size = "thumb", w = 1600) {
    if (!p) return `<span class="tdx-ph is-none ${cls}"><i class="fa-solid fa-car-side" aria-hidden="true"></i></span>`;
    if (p.key) return `<span class="tdx-ph ${cls}"><img data-k="${esc(p.key)}" data-size="${size}" alt="${esc(alt)}" decoding="async"><i class="fa-solid fa-car-side" aria-hidden="true"></i></span>`;
    return `<span class="tdx-ph ${cls}"><img src="${esc(CAT_BASE + "photos/" + p.file)}" data-local="1" data-commons="${esc(p.commons || "")}" data-w="${w}" alt="${esc(alt)}" loading="lazy" decoding="async"><i class="fa-solid fa-car-side" aria-hidden="true"></i></span>`;
  }

  // ---- money and data --------------------------------------------------------------------------------
  function money(v, cur) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    const c = cur || S.cat?.currency || S.site?.business?.currency || "SAR";
    return `${c} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
  }
  const waDigits = n => String(n || "").replace(/[^\d]/g, "");
  const waLink = (n, text = "") => { const d = waDigits(n); return d.length >= 7 ? `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}` : ""; };
  const today = () => S.site.today || new Date().toISOString().slice(0, 10);
  // Contact for the page: the support details in catalog.json (Triplem Drive), otherwise the business's own.
  function contact() {
    const b = S.site.business, sp = S.cat?.support || {};
    return { phone: sp.phone || b.phone || "", whatsapp: sp.whatsapp || b.whatsapp || "", email: sp.email || b.email || "" };
  }

  // Cars: listed cars are vehicles of the fleet since database update 240 (keys "cat-<model>"); a fleet car
  // belongs to a vehicle type by its key or by its section name. Before 240 they come from catalog.json.
  const catVehicle = v => (S.cat && String(v.key || "").startsWith("cat-") ? S.cat.vehicles.find(x => "cat-" + x.key === v.key) : null);
  function classOf(v) {
    if (!S.cat) { const sec = (S.site.sections || []).find(x => x.key === v.section); return sec ? "s:" + sec.key : "all"; }
    const cv = catVehicle(v); if (cv) return cv.class;
    const sec = (S.site.sections || []).find(x => x.key === v.section);
    const k = sec && (S.cat.classes || []).find(c => c.name.trim().toLowerCase() === sec.name.trim().toLowerCase());
    return k ? k.key : "";
  }
  let carsMemo = null;
  function cars() {
    if (carsMemo) return carsMemo;
    const out = [], db = S.site.vehicles || [];
    const fleetModels = S.cat ? db.filter(v => classOf(v)) : db;
    if (S.cat && !fleetModels.length && !(S.cat.vehicles_in_database && db.length)) {
      for (const v of S.cat.vehicles) out.push({ id: "c:" + v.key, dbKey: "", name: v.name, cls: v.class, photos: v.photos || [], bookable: true, v: {} });
    }
    for (const v of db) {
      const cls = classOf(v); if (!cls) continue;
      const own = (v.photos || []).map(k => ({ key: k }));
      out.push({ id: "d:" + v.key, dbKey: v.key, name: v.name, cls, photos: own.length ? own : (catVehicle(v)?.photos || []), bookable: v.bookable !== false, v });
    }
    return (carsMemo = out.filter(c => c.bookable));
  }
  // Vehicle types shown on the page and in the overlay.
  function classes() {
    if (S.cat) return (S.cat.classes || []).filter(k => cars().some(c => c.cls === k.key));
    const secs = (S.site.sections || []).filter(s => cars().some(c => c.cls === "s:" + s.key)).map(s => ({ key: "s:" + s.key, name: s.name, tagline: s.description || "", art: "class-suv.svg" }));
    return secs.length ? secs : (cars().length ? [{ key: "all", name: "Our cars", tagline: "Choose your car", art: "class-suv.svg" }] : []);
  }
  const classByKey = k => classes().find(c => c.key === k) || (S.cat?.classes || []).find(c => c.key === k);
  const carsOf = cls => cars().filter(c => c.cls === cls);
  const service = key => S.cat?.services.find(s => s.key === key);
  const cityByKey = k => (S.cat?.cities || []).find(c => c.key === k);
  // Cities offered for city rides and airport transfers (catalog.json service_types[].cities).
  const typeDef = k => (S.cat?.service_types || []).find(t => t.key === k);
  const TYPES = () => S.cat?.service_types?.length ? S.cat.service_types : [
    { key: "city", name: "Within the city", short: "City ride", icon: "fa-city", text: "Point to point rides inside the city." },
    { key: "airport", name: "Airport transfer", short: "Airport", icon: "fa-plane-departure", text: "To or from the airport, on time." },
    { key: "intercity", name: "Outside the city", short: "Intercity", icon: "fa-road", text: "Trips to other cities." }
  ];
  // Riyadh is the start of every listed intercity route ("Riyadh ⇄ X", either direction).
  const routeEnds = s => ({ from: s.from, to: s.to });

  // ---- page ----------------------------------------------------------------------------------------
  function messagePage(icon, title, text, extra = "") {
    app.innerHTML = `<main id="tdsMain" class="tdx-msg"><div class="tdx-msg-card"><img src="${LOGO}" alt="Triplem Drive" class="tdx-msg-logo"><span class="tdx-msg-ico"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><h1>${esc(title)}</h1><p>${esc(text)}</p>${extra}</div>
      <footer class="tdx-foot is-min"><span>Powered by <a href="${CANON_ORIGIN}/" rel="noopener">Triplem Drive · Triplem VIP</a></span></footer></main>`;
    app.removeAttribute("aria-busy");
  }

  function render() {
    const s = S.site, b = s.business, ct = contact(), cat = S.cat;
    const hero = cat?.hero || {};
    const title = hero.title || b.tagline || `Book your ride with ${b.name}`;
    const sub = hero.subtitle || b.description || "Comfortable, on-time rides with professional chauffeurs.";
    const desc = `${b.name}: ${sub}`.replace(/\s+/g, " ").trim().slice(0, 155);
    seo({ title: `${b.name} · Chauffeur rides, airport transfers and intercity trips`, description: desc, url: addressOf(s.slug), index: !s.preview, business: b, contact: ct });
    const wa = waLink(ct.whatsapp, `Hello ${b.name}, I would like to book a ride.`);
    const ks = classes();
    const cities = (cat?.cities || []);
    const heroPhoto = hero.photo ? `<img class="tdx-hero-img" src="${esc(CAT_BASE + "photos/" + hero.photo.file)}" data-local="1" data-commons="${esc(hero.photo.commons || "")}" data-w="1920" alt="" fetchpriority="high">` : "";
    app.innerHTML = `
      ${s.preview ? `<div class="tdx-preview"><i class="fa-solid fa-eye" aria-hidden="true"></i> Preview · this page is not published yet. Requests are switched off.</div>` : ""}
      <header class="tdx-top" data-top>
        <a class="tdx-brand" href="${esc(addressOf(s.slug))}" aria-label="${esc(b.name)}">
          ${b.logo ? `<span class="tdx-logo is-own"><img data-k="${esc(b.logo)}" alt=""></span>` : `<span class="tdx-logo"><img src="${LOGO}" alt=""></span>`}
          <span class="tdx-brand-text"><strong>${esc(b.name)}</strong><small>Chauffeur · Airport · Intercity</small></span>
        </a>
        <nav class="tdx-nav" aria-label="Sections"><a href="#services">Services</a><a href="#fleet">Fleet</a>${cities.length ? `<a href="#destinations">Destinations</a>` : ""}<a href="#faq">FAQ</a><a href="#contact">Contact</a></nav>
        <div class="tdx-top-actions">
          ${ct.phone ? `<a class="tdx-top-phone" href="tel:${esc(ct.phone)}"><i class="fa-solid fa-phone" aria-hidden="true"></i><span>${esc(ct.phone)}</span></a>` : ""}
          ${wa ? `<a class="tdx-icon is-wa" href="${esc(wa)}" target="_blank" rel="noopener" title="WhatsApp" aria-label="Chat on WhatsApp"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a>` : ""}
          <button type="button" class="tdx-btn is-gold" data-book><span>Book now</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
        </div>
      </header>
      <main id="tdsMain">
        <section class="tdx-hero">
          <div class="tdx-hero-bg" aria-hidden="true">${heroPhoto}${b.banner ? `<img class="tdx-hero-img" data-k="${esc(b.banner)}" data-size="full" alt="">` : ""}</div>
          <div class="tdx-wrap tdx-hero-in">
            <span class="tdx-kicker" data-reveal><i class="fa-solid fa-crown" aria-hidden="true"></i> ${esc(b.name)} · Saudi Arabia</span>
            <h1 data-reveal>${esc(title)}</h1>
            <p class="tdx-hero-sub" data-reveal>${esc(sub)}</p>
            <div class="tdx-picker" data-reveal role="group" aria-label="What do you need?">
              <div class="tdx-picker-head"><b>Book a ride</b><span>What do you need?</span></div>
              <div class="tdx-picker-opts">${TYPES().map((t, i) => `<button type="button" class="tdx-opt" data-type="${esc(t.key)}"><span class="tdx-opt-ico"><i class="fa-solid ${esc(t.icon || "fa-car-side")}" aria-hidden="true"></i></span><span class="tdx-opt-txt"><b>${esc(t.name)}</b><small>${esc(t.text || "")}</small></span><i class="fa-solid fa-arrow-right tdx-opt-go" aria-hidden="true"></i></button>`).join("")}</div>
            </div>
            <ul class="tdx-trust" data-reveal>
              <li><i class="fa-regular fa-clock" aria-hidden="true"></i>${esc(cat?.terms?.timing ? `${cat.terms.timing} service` : b.hours || "Every day")}</li>
              <li><i class="fa-solid fa-user-tie" aria-hidden="true"></i>Professional chauffeurs</li>
              <li><i class="fa-solid fa-tag" aria-hidden="true"></i>Fixed prices, no surprises</li>
              <li><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>No online payment</li>
            </ul>
          </div>
        </section>

        <section class="tdx-sec tdx-how" id="how">
          <div class="tdx-wrap"><div class="tdx-steps">
            ${[["Book your ride", "Choose the service and your car, add the trip and your details. You see the final price before you send."], ["Meet your chauffeur", "We confirm by phone or WhatsApp. Your chauffeur is on time at the pickup point."], ["Enjoy the journey", "Relax in a clean, comfortable car all the way to your destination."]].map(([t, x], i) => `<div class="tdx-step" data-reveal style="--d:${i * 120}ms"><span class="tdx-step-n">${i + 1}.</span><div><h3>${esc(t)}</h3><p>${esc(x)}</p></div></div>`).join("")}
          </div></div>
        </section>

        <section class="tdx-sec" id="services">
          <div class="tdx-wrap">
            <div class="tdx-head" data-reveal><h2>Our services</h2><p>One trusted team for every ride in the Kingdom.</p></div>
            <div class="tdx-services">${TYPES().map((t, i) => {
              const pics = { city: cities.find(c => c.key === "riyadh")?.photo, airport: (S.cat?.vehicles || []).find(v => v.key === "gmc-yukon-xl")?.photos?.[0], intercity: (S.cat?.vehicles || []).find(v => v.key === "chevrolet-suburban")?.photos?.[0] };
              return `<button type="button" class="tdx-service" data-type="${esc(t.key)}" data-reveal style="--d:${i * 120}ms">${photo(pics[t.key], "", "tdx-service-ph", "thumb", 1200)}<span class="tdx-service-txt"><span class="tdx-service-ico"><i class="fa-solid ${esc(t.icon)}" aria-hidden="true"></i></span><b>${esc(t.name)}</b><small>${esc(t.text || "")}</small><span class="tdx-link">Book this ride <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span></span></button>`;
            }).join("")}</div>
          </div>
        </section>

        <section class="tdx-sec tdx-fleet" id="fleet">
          <div class="tdx-wrap">
            <div class="tdx-head is-split" data-reveal><h2>Maximum comfort<br>for every trip</h2><p>Licensed vehicles, professional chauffeurs</p></div>
            ${ks.length ? `<div class="tdx-classes">${ks.map((k, i) => `<button type="button" class="tdx-class" data-class="${esc(k.key)}" data-reveal style="--d:${i * 110}ms">
                <span class="tdx-class-art"><img src="${ASSETS}${esc(k.art || "class-suv.svg")}" alt="" loading="lazy"></span>
                <b>${esc(k.name)}</b><small>${esc(k.similar || k.tagline || "")}</small>
                <span class="tdx-class-meta">${k.seats ? `<span><i class="fa-solid fa-user" aria-hidden="true"></i>${esc(String(k.seats))}</span>` : ""}${k.bags ? `<span><i class="fa-solid fa-suitcase-rolling" aria-hidden="true"></i>${esc(String(k.bags))}</span>` : ""}<span class="tdx-class-cars">${carsOf(k.key).length} car${carsOf(k.key).length === 1 ? "" : "s"}</span></span>
              </button>`).join("")}</div>` : `<p class="tdx-muted">Our vehicles will be listed here soon. You can still send a booking request.</p>`}
          </div>
        </section>

        ${cat ? `<section class="tdx-sec tdx-show">
          <div class="tdx-wrap tdx-show-in">
            <div class="tdx-show-art" data-reveal><img src="${ASSETS}showcase.jpg" alt="${esc(b.name)} fleet: Lexus, GMC Yukon and BMW with the Riyadh skyline" loading="lazy"></div>
            <div class="tdx-show-txt" data-reveal style="--d:140ms">
              <span class="tdx-eyebrow">Luxury · Comfort · Reliability</span>
              <h2>Arrive in style, every time</h2>
              <p>Late-model SUVs, business sedans and spacious vans, kept spotless and driven by experienced chauffeurs who know every road between Riyadh, Jeddah, Makkah, Madinah and the Eastern Province.</p>
              <ul class="tdx-ticks"><li>Meet and greet at the airport</li><li>Child seats and extra luggage on request</li><li>Fixed price confirmed before the trip</li><li>Support on WhatsApp ${esc(cat.terms?.timing || "")}</li></ul>
              <button type="button" class="tdx-btn is-dark" data-book><span>Book your ride</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
            </div>
          </div>
        </section>` : ""}

        ${cities.length ? `<section class="tdx-sec" id="destinations">
          <div class="tdx-wrap">
            <div class="tdx-head is-split" data-reveal><div><h2>Destinations</h2><p>Private transfers to the holy cities and across the Kingdom</p></div>
              <div class="tdx-head-links"><button type="button" data-type="intercity">Intercity <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button><button type="button" data-type="airport">Airports <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button><button type="button" data-type="city">City rides <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div></div>
            <div class="tdx-cities">${cities.map((c, i) => `<button type="button" class="tdx-city is-${esc(c.key)}" data-city="${esc(c.key)}" data-reveal style="--d:${i * 100}ms">
                ${c.photo ? `<span class="tdx-ph tdx-city-ph"><img src="${esc(CAT_BASE + "photos/" + c.photo.file)}" data-local="1" data-commons="${esc(c.photo.commons || "")}" data-w="1280" alt="${esc(c.landmark || c.name)}" loading="lazy"><i class="fa-solid fa-mosque" aria-hidden="true"></i></span>` : ""}
                <span class="tdx-city-txt"><b>${esc(c.name)}</b><small>${esc(c.landmark || "")}${c.airport ? ` · ${esc(c.airport.code)}` : ""}</small></span>
                <span class="tdx-city-go" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>
              </button>`).join("")}</div>
          </div>
        </section>` : ""}

        <section class="tdx-sec tdx-faqsec" id="faq">
          <div class="tdx-wrap tdx-faq-in">
            <div class="tdx-head" data-reveal><h2>Questions, answered</h2><p>Everything you need to know before you ride.</p>
              <button type="button" class="tdx-btn is-line" data-act="inquiry"><i class="fa-regular fa-comment-dots" aria-hidden="true"></i><span>Ask a question</span></button></div>
            <div class="tdx-faq" data-reveal>${faqItems().map((x, i) => `<details${i === 0 ? " open" : ""}><summary><span>${esc(x.q)}</span><i class="fa-solid fa-plus" aria-hidden="true"></i></summary><p>${esc(x.a)}</p></details>`).join("")}</div>
          </div>
        </section>

        <section class="tdx-contact" id="contact">
          <div class="tdx-wrap tdx-contact-in" data-reveal>
            <div><span class="tdx-eyebrow is-gold">Customer support</span><h2>We are here ${esc(cat?.terms?.timing || "for you")}</h2><p>${esc(b.contact_note || "Questions about a trip, a group booking or a special request? Chat with us on WhatsApp, call or send an email.")}</p></div>
            <div class="tdx-contact-cards">
              ${wa ? `<a class="tdx-ccard is-wa" href="${esc(waLink(ct.whatsapp, `Hello ${b.name}, I have a question.`))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span><small>WhatsApp chat</small><b>${esc(ct.whatsapp)}</b></span></a>` : ""}
              ${ct.phone ? `<a class="tdx-ccard" href="tel:${esc(ct.phone)}"><i class="fa-solid fa-phone" aria-hidden="true"></i><span><small>Call us</small><b>${esc(ct.phone)}</b></span></a>` : ""}
              ${ct.email ? `<a class="tdx-ccard" href="mailto:${esc(ct.email)}"><i class="fa-regular fa-envelope" aria-hidden="true"></i><span><small>Email</small><b>${esc(ct.email)}</b></span></a>` : ""}
              <button type="button" class="tdx-ccard" data-act="inquiry"><i class="fa-regular fa-comment-dots" aria-hidden="true"></i><span><small>Send a message</small><b>Ask a question</b></span></button>
            </div>
          </div>
        </section>
      </main>
      <footer class="tdx-foot"><div class="tdx-wrap tdx-foot-in"><span class="tdx-foot-brand"><img src="${LOGO}" alt=""> © ${new Date().getFullYear()} ${esc(b.name)}</span>
        <span>${cat ? `<button type="button" class="tdx-linkbtn" data-act="credits">Photo credits</button> · ` : ""}Powered by <a href="${CANON_ORIGIN}/" rel="noopener">Triplem Drive · Triplem VIP</a></span></div></footer>
      ${wa ? `<a class="tdx-fab" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>Chat with us</span></a>` : ""}
      <div class="tdx-layer" data-layer><div class="tdx-backdrop" data-close-top></div></div>`;
    app.removeAttribute("aria-busy");
    fillImages(app.querySelector(".tdx-top"));
    fillImages(app.querySelector(".tdx-hero-bg"));
    fillImages(app.querySelector("#services"));
    reveal();
  }
  function faqItems() {
    const b = S.site.business, items = [...(S.cat?.faq || [])];
    if (!S.cat) items.push({ q: "How do I book?", a: "Tap Book now, choose the service, your car and the trip. We contact you to confirm." }, { q: "Do I pay online?", a: "No. Payment is arranged directly with us." });
    if (b.cancellation_policy) items.push({ q: "What is the cancellation policy?", a: b.cancellation_policy });
    if (b.terms) items.push({ q: "Terms and conditions", a: b.terms });
    return items;
  }
  // Fade-in on scroll.
  function reveal() {
    const els = [...app.querySelectorAll("[data-reveal]")];
    if (reduceMotion || !("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("is-shown")); return; }
    const io = new IntersectionObserver(list => list.forEach(x => { if (x.isIntersecting) { x.target.classList.add("is-shown"); io.unobserve(x.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(e => io.observe(e));
  }

  // ---- sheets (map, question, credits) - side panels above the page and the booking overlay -------------
  function panel(def) {
    const layer = app.querySelector("[data-layer]");
    const el = document.createElement("aside");
    el.className = "tdx-pnl"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.dataset.pid = def.id || "";
    el._def = { ...def };
    paintPanel(el);
    layer.appendChild(el);
    S.stack.push(el);
    layer.classList.add("is-on");
    document.documentElement.classList.add("tdx-lock");
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-open")));
    setTimeout(() => el.querySelector("[data-autofocus]")?.focus({ preventScroll: true }), 460);
    return el;
  }
  function paintPanel(el) {
    const d = el._def;
    el.innerHTML = `<header class="tdx-pnl-head">
        <span class="tdx-pnl-ava"><i class="fa-solid ${d.icon || "fa-car-side"}" aria-hidden="true"></i></span>
        <div class="tdx-pnl-id"><strong>${esc(d.title)}</strong>${d.sub ? `<small>${esc(d.sub)}</small>` : ""}</div>
        <button type="button" class="tdx-pnl-x" data-close-top aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </header>
      <div class="tdx-pnl-body">${d.body()}</div>
      ${d.foot ? `<footer class="tdx-pnl-foot">${d.foot()}</footer>` : ""}`;
    d.mount?.(el);
  }
  function closeTop() {
    const el = S.stack.pop(); if (!el) return false;
    el.classList.remove("is-open");
    el._def.onClose?.();
    setTimeout(() => el.remove(), 380);
    if (!S.stack.length) { app.querySelector("[data-layer]")?.classList.remove("is-on"); if (!W.open) document.documentElement.classList.remove("tdx-lock"); }
    return true;
  }

  // ---- booking overlay ---------------------------------------------------------------------------------
  // W: the request being built. Steps: service (only when not chosen yet) -> category -> car -> trip -> return
  // (not for a full day) -> details -> confirm -> done.
  let W = { open: false };
  const STEP_TITLES = { service: "Service", category: "Vehicle type", car: "Your car", trip: "Your trip", ret: "Return", details: "Your details", confirm: "Confirm", done: "Done" };
  function freshW(o = {}) {
    const ct = (S.cat?.cities || [])[0];
    return {
      open: true, type: o.type || "", cls: o.cls || "", car: "", city: o.city || "", rideKind: "transfer", dir: "from", route: o.route || "", reverse: false,
      pickup: "", destination: "", places: {}, date: "", time: "", pax: "", flight: "",
      ret: false, rdate: "", rtime: "", name: "", mobile: "", email: "", notes: "", answers: {},
      step: "", busy: false, err: "", result: null, slide: 0, cityDefault: ct?.key || ""
    };
  }
  function steps() {
    const list = [];
    if (W.askType) list.push("service");
    if (classes().length > 1 || !W.cls) list.push("category");
    if (W.cls ? carsOf(W.cls).length > 0 : cars().length > 0) list.push("car");
    list.push("trip");
    if (!(W.type === "city" && W.rideKind === "fullday")) list.push("ret");
    list.push("details", "confirm");
    return list;
  }
  function openWizard(o = {}) {
    if (W.open) return;
    W = freshW(o);
    W.askType = !o.type;
    if (!W.cls && classes().length === 1) W.cls = classes()[0].key;
    if (o.city && !o.type) { const c = cityByKey(o.city); if (c?.route && service(c.route)) { W.type = "intercity"; W.route = c.route; W.askType = false; } }
    if (o.city && W.type === "intercity" && !W.route) { const c = cityByKey(o.city); if (c?.route) W.route = c.route; }
    if (W.type === "intercity" && W.route) W.reverse = false;
    W.step = steps()[0];
    const ov = document.createElement("div");
    ov.className = "tdx-wz"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Book a ride");
    ov.innerHTML = `<div class="tdx-wz-backdrop" data-wz-close></div>
      <div class="tdx-wz-card">
        <header class="tdx-wz-head">
          <span class="tdx-wz-brand"><img src="${LOGO}" alt=""><span><b>${esc(S.site.business.name)}</b><small data-wz-sub></small></span></span>
          <ol class="tdx-wz-prog" data-wz-prog></ol>
          <button type="button" class="tdx-wz-x" data-wz-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </header>
        <div class="tdx-wz-stage" data-wz-stage></div>
        <footer class="tdx-wz-foot" data-wz-foot></footer>
      </div>`;
    document.body.appendChild(ov);
    W.el = ov;
    document.documentElement.classList.add("tdx-lock");
    paintStep(0);
    requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add("is-open")));
    ov.addEventListener("click", onWizardClick);
    ov.addEventListener("input", onWizardInput);
    ov.addEventListener("change", onWizardInput);
    ov.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input:not([type=checkbox]):not([type=radio])")) { e.preventDefault(); next(); } });
  }
  function closeWizard() {
    if (!W.open || !W.el) return;
    const el = W.el; W.open = false;
    el.classList.remove("is-open"); el.classList.add("is-closing");
    setTimeout(() => el.remove(), reduceMotion ? 0 : 520);
    if (!S.stack.length) document.documentElement.classList.remove("tdx-lock");
  }
  // Render the current step; dir: 1 forward, -1 back, 0 first.
  function paintStep(dir) {
    const stage = W.el.querySelector("[data-wz-stage]");
    const list = steps(), i = list.indexOf(W.step);
    const prog = W.el.querySelector("[data-wz-prog]");
    prog.innerHTML = W.step === "done" ? "" : list.map((s, k) => `<li class="${k < i ? "is-done" : k === i ? "is-now" : ""}"><span>${k < i ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : k + 1}</span><em>${esc(STEP_TITLES[s])}</em></li>`).join("");
    W.el.querySelector("[data-wz-sub]").textContent = W.step === "done" ? "Request sent" : `Step ${i + 1} of ${list.length} · ${STEP_TITLES[W.step]}`;
    const old = stage.querySelector(".tdx-wz-step.is-current");
    const node = document.createElement("section");
    node.className = "tdx-wz-step";
    node.dataset.step = W.step;
    node.innerHTML = `<div class="tdx-wz-scroll">${STEPS[W.step]()}</div>`;
    if (dir === 0 || reduceMotion || !old) {
      old?.remove(); node.classList.add("is-current"); stage.appendChild(node);
    } else {
      node.classList.add(dir > 0 ? "is-from-right" : "is-from-left");
      stage.appendChild(node);
      void node.offsetWidth; // start from the "from" position
      requestAnimationFrame(() => {
        old.classList.remove("is-current"); old.classList.add(dir > 0 ? "is-to-left" : "is-to-right");
        node.classList.remove("is-from-right", "is-from-left"); node.classList.add("is-current");
      });
      setTimeout(() => old.remove(), STEP_MS + 60);
    }
    paintFoot();
    mountStep(node);
    const f = node.querySelector("[data-autofocus]"); if (f && !matchMedia("(max-width: 640px)").matches) setTimeout(() => { try { f.focus({ preventScroll: true }); } catch (_) {} }, dir ? STEP_MS : 300);
    node.querySelector(".tdx-wz-scroll").scrollTop = 0;
  }
  function paintFoot() {
    const foot = W.el.querySelector("[data-wz-foot]");
    const list = steps(), i = list.indexOf(W.step);
    if (W.step === "done") { foot.innerHTML = `<span></span><button type="button" class="tdx-btn is-gold" data-wz-close><span>Done</span><i class="fa-solid fa-check" aria-hidden="true"></i></button>`; return; }
    const chosen = [typeDef(W.type)?.short || (W.type ? TYPES().find(t => t.key === W.type)?.short : ""), classByKey(W.cls)?.name, W.car ? cars().find(c => c.id === W.car)?.name : ""].filter(Boolean);
    const nextLabel = W.step === "confirm" ? (W.busy ? "Sending…" : "Confirm booking") : W.step === "car" ? "Choose this car" : W.step === "ret" ? (W.ret ? "Continue" : "Continue one way") : (W.step === "category" || W.step === "service") ? "" : "Continue";
    foot.innerHTML = `${i > 0 ? `<button type="button" class="tdx-btn is-ghost" data-wz-back><i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Back</span></button>` : `<span></span>`}
      <span class="tdx-wz-chosen">${chosen.map(c => `<em>${esc(c)}</em>`).join('<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>')}</span>
      ${nextLabel ? `<button type="button" class="tdx-btn is-gold" data-wz-next${W.busy || S.site.preview && W.step === "confirm" ? " disabled" : ""}><span>${esc(nextLabel)}</span><i class="fa-solid ${W.step === "confirm" ? "fa-paper-plane" : "fa-arrow-right"}" aria-hidden="true"></i></button>` : `<span></span>`}`;
  }
  function go(stepName, dir) { W.err = ""; W.step = stepName; paintStep(dir); }
  function next() {
    const list = steps(), i = list.indexOf(W.step);
    const problem = check(W.step);
    if (problem) return showErr(problem.text, problem.field);
    if (W.step === "confirm") return send();
    if (W.step === "car") { const c = carsOf(W.cls)[W.slide]; W.car = c ? c.id : ""; }
    if (i < list.length - 1) go(list[i + 1], 1);
  }
  function back() { const list = steps(), i = list.indexOf(W.step); if (i > 0) go(list[i - 1], -1); }
  function showErr(text, field) {
    const box = W.el.querySelector(".tdx-wz-step.is-current [data-err]");
    if (box) { box.textContent = text; box.hidden = false; box.classList.remove("is-shake"); void box.offsetWidth; box.classList.add("is-shake"); }
    if (field) { const f = W.el.querySelector(`.tdx-wz-step.is-current [name="${field}"]`) || W.el.querySelector(`.tdx-wz-step.is-current [data-field="${field}"]`); if (f) { f.classList.add("is-bad"); f.scrollIntoView({ block: "center", behavior: "smooth" }); try { f.focus({ preventScroll: true }); } catch (_) {} } }
  }

  // Prices (only shown at the confirm step).
  function serviceKey() {
    if (!S.cat) return "";
    if (W.type === "intercity") return W.route;
    if (W.type === "airport") return (typeDef("airport")?.services || ["airport"])[0];
    return W.rideKind === "fullday" ? "full-day" : (typeDef("city")?.services || ["inside-city"])[0];
  }
  function onePrice() { const s = service(serviceKey()); const v = s ? Number(s.prices?.[W.cls]) : NaN; return Number.isFinite(v) ? v : null; }
  function serviceLabel() {
    const s = service(serviceKey()), city = cityByKey(W.city);
    if (W.type === "intercity" && s) { const e = routeEnds(s); return W.reverse ? `${e.to} → ${e.from}` : `${e.from} → ${e.to}`; }
    if (W.type === "airport") return `Airport transfer · ${W.dir === "from" ? "from" : "to"} ${city?.airport?.code || "airport"}${city ? " · " + city.name : ""}`;
    if (W.type === "city") return `${W.rideKind === "fullday" ? "Full day" : "City transfer"}${city ? " · " + city.name : ""}`;
    return "Ride";
  }

  const STEPS = {
    service() {
      return `<div class="tdx-wz-intro"><h2>What do you need?</h2><p>Choose the kind of ride. You will see the price at the end, before you send.</p></div>
        <div class="tdx-wz-types">${TYPES().map((t, i) => `<button type="button" class="tdx-wz-type${W.type === t.key ? " is-on" : ""}" data-wz-type="${esc(t.key)}" style="--d:${i * 90}ms">
          <span class="tdx-wz-type-ico"><i class="fa-solid ${esc(t.icon)}" aria-hidden="true"></i></span><b>${esc(t.name)}</b><small>${esc(t.text || "")}</small><i class="fa-solid fa-arrow-right tdx-wz-type-go" aria-hidden="true"></i></button>`).join("")}</div>`;
    },
    category() {
      const ks = classes();
      return `<div class="tdx-wz-intro"><h2>Choose your vehicle type</h2><p>${esc(TYPES().find(t => t.key === W.type)?.name || "")}</p></div>
        ${ks.length ? `<div class="tdx-wz-classes">${ks.map((k, i) => `<button type="button" class="tdx-wz-class${W.cls === k.key ? " is-on" : ""}" data-wz-class="${esc(k.key)}" style="--d:${i * 90}ms">
            <span class="tdx-class-art"><img src="${ASSETS}${esc(k.art || "class-suv.svg")}" alt=""></span>
            <span class="tdx-wz-class-txt"><b>${esc(k.name)}</b><small>${esc(k.tagline || "")}</small><em>${esc(k.similar || `${carsOf(k.key).length} cars`)}</em></span>
            <span class="tdx-class-meta">${k.seats ? `<span><i class="fa-solid fa-user" aria-hidden="true"></i>${esc(String(k.seats))}</span>` : ""}${k.bags ? `<span><i class="fa-solid fa-suitcase-rolling" aria-hidden="true"></i>${esc(String(k.bags))}</span>` : ""}</span>
          </button>`).join("")}</div>` : `<p class="tdx-muted">We will suggest a suitable car.</p>`}`;
    },
    car() {
      const list = carsOf(W.cls), k = classByKey(W.cls);
      if (!W.car && list.length) W.slide = Math.min(W.slide || 0, list.length - 1);
      const cur = Math.max(0, list.findIndex(c => c.id === W.car));
      if (W.car) W.slide = cur;
      return `<div class="tdx-wz-intro"><h2>Choose your car</h2><p>${esc(k?.name || "")}${k?.similar ? ` · ${esc(k.similar)}` : ""}</p></div>
        <div class="tdx-slider" data-slider tabindex="0" aria-roledescription="carousel" aria-label="Cars">
          <div class="tdx-slides" data-slides style="--i:${W.slide}">${list.map((c, i) => `<figure class="tdx-slide" aria-roledescription="slide" aria-label="${esc(c.name)} (${i + 1} of ${list.length})">
              ${photo(c.photos[0], c.name, "tdx-slide-ph", "full", 1600)}
              <figcaption><b>${esc(c.name)}</b>${c.v?.capacity ? `<small><i class="fa-solid fa-user" aria-hidden="true"></i> ${esc(String(c.v.capacity))} seats</small>` : k?.seats ? `<small><i class="fa-solid fa-user" aria-hidden="true"></i> up to ${esc(String(k.seats))} passengers</small>` : ""}</figcaption>
            </figure>`).join("")}</div>
          ${list.length > 1 ? `<button type="button" class="tdx-slide-nav is-prev" data-slide-go="-1" aria-label="Previous car"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button><button type="button" class="tdx-slide-nav is-next" data-slide-go="1" aria-label="Next car"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>` : ""}
        </div>
        ${list.length > 1 ? `<div class="tdx-thumbs" role="tablist">${list.map((c, i) => `<button type="button" role="tab" class="tdx-thumb" data-slide-to="${i}" aria-selected="${i === W.slide}" aria-label="${esc(c.name)}">${photo(c.photos[0], "", "", "thumb", 400)}<span>${esc(c.name)}</span></button>`).join("")}</div>` : ""}
        <div class="tdx-wz-choice"><span class="tdx-wz-pick"><small>Selected</small><b data-slide-name>${esc(list[W.slide]?.name || "")}</b></span>
          <button type="button" class="tdx-btn is-line" data-wz-any-car><i class="fa-solid fa-shuffle" aria-hidden="true"></i><span>Any ${esc(k?.name || "car")} is fine</span></button>
        </div>`;
    },
    trip() {
      const t = W.type, cat = S.cat;
      const cityList = (typeDef(t)?.cities || []).map(cityByKey).filter(Boolean);
      if ((t === "city" || t === "airport") && cityList.length && !W.city) W.city = cityList[0].key;
      const city = cityByKey(W.city);
      let top = "";
      if ((t === "city" || t === "airport") && cityList.length) {
        top += `<div class="tdx-f is-wide"><span>City</span><div class="tdx-chips" role="radiogroup" aria-label="City">${cityList.map(c => `<button type="button" role="radio" class="tdx-chip" data-wz-city="${esc(c.key)}" aria-checked="${W.city === c.key}">${esc(c.name)}</button>`).join("")}</div></div>`;
      }
      if (t === "city" && cat) {
        top += `<div class="tdx-f is-wide"><span>Ride</span><div class="tdx-seg2">
          <button type="button" class="tdx-seg2-o" data-wz-kind="transfer" aria-pressed="${W.rideKind === "transfer"}"><i class="fa-solid fa-location-arrow" aria-hidden="true"></i><b>Transfer</b><small>From A to B in the city</small></button>
          <button type="button" class="tdx-seg2-o" data-wz-kind="fullday" aria-pressed="${W.rideKind === "fullday"}"><i class="fa-regular fa-clock" aria-hidden="true"></i><b>Full day</b><small>A car and chauffeur for the day</small></button></div></div>`;
      }
      if (t === "airport") {
        top += `<div class="tdx-f is-wide"><span>Direction</span><div class="tdx-seg2">
          <button type="button" class="tdx-seg2-o" data-wz-dir="from" aria-pressed="${W.dir === "from"}"><i class="fa-solid fa-plane-arrival" aria-hidden="true"></i><b>From the airport</b><small>${esc(city?.airport?.name || "Pickup at arrivals")}</small></button>
          <button type="button" class="tdx-seg2-o" data-wz-dir="to" aria-pressed="${W.dir === "to"}"><i class="fa-solid fa-plane-departure" aria-hidden="true"></i><b>To the airport</b><small>${esc(city?.airport?.name || "Drop-off at departures")}</small></button></div></div>`;
      }
      if (t === "intercity" && cat) {
        const routes = (typeDef("intercity")?.services || []).map(service).filter(Boolean);
        if (!W.route && routes.length) W.route = routes[0].key;
        const s = service(W.route), e = s ? routeEnds(s) : { from: "", to: "" };
        top += `<div class="tdx-f is-wide"><span>Route</span><div class="tdx-route">
            <label class="tdx-route-end"><small>From</small>${W.reverse ? `<select name="route" data-wz-route aria-label="From">${routes.map(r => `<option value="${esc(r.key)}"${r.key === W.route ? " selected" : ""}>${esc(r.to)}</option>`).join("")}</select>` : `<b>${esc(e.from)}</b>`}</label>
            <button type="button" class="tdx-route-swap" data-wz-swap aria-label="Swap direction" title="Swap direction"><i class="fa-solid fa-right-left" aria-hidden="true"></i></button>
            <label class="tdx-route-end"><small>To</small>${W.reverse ? `<b>${esc(e.from)}</b>` : `<select name="route" data-wz-route aria-label="To">${routes.map(r => `<option value="${esc(r.key)}"${r.key === W.route ? " selected" : ""}>${esc(r.to)}</option>`).join("")}</select>`}</label>
          </div></div>`;
      }
      const ap = city?.airport;
      const pickLabel = t === "airport" && W.dir === "from" ? "Pickup (airport)" : "Pickup location";
      const dropLabel = t === "airport" && W.dir === "to" ? "Drop-off (airport)" : W.rideKind === "fullday" && t === "city" ? "Main destination (optional)" : "Drop-off location";
      if (t === "airport" && ap) {
        const apText = `${ap.name} (${ap.code})`;
        if (W.dir === "from" && (!W.pickup || W.places.pickup?.airport)) { W.pickup = apText; W.places.pickup = { lat: ap.lat, lng: ap.lng, label: apText, airport: true }; if (W.places.destination?.airport) { W.destination = ""; delete W.places.destination; } }
        if (W.dir === "to" && (!W.destination || W.places.destination?.airport)) { W.destination = apText; W.places.destination = { lat: ap.lat, lng: ap.lng, label: apText, airport: true }; if (W.places.pickup?.airport) { W.pickup = ""; delete W.places.pickup; } }
      }
      const minT = today();
      return `<div class="tdx-wz-intro"><h2>Where and when?</h2><p>Type the address or pick it on the map.</p></div>
        <div class="tdx-fgrid">${top}
          ${placeField("pickup", pickLabel, W.pickup, "Hotel, home, address…")}
          ${placeField("destination", dropLabel, W.destination, "Where are you going?")}
          <label class="tdx-f"><span>Pickup date <em>*</em></span><input name="date" type="date" min="${esc(minT)}" value="${esc(W.date)}" required data-autofocus></label>
          <label class="tdx-f"><span>Pickup time <em>*</em></span><input name="time" type="time" value="${esc(W.time)}" required></label>
          <label class="tdx-f"><span>Passengers</span><input name="pax" type="number" min="1" max="60" inputmode="numeric" value="${esc(W.pax)}" placeholder="${esc(String(classByKey(W.cls)?.seats || 1))}"></label>
          ${t === "airport" ? `<label class="tdx-f"><span>Flight number (optional)</span><input name="flight" maxlength="20" value="${esc(W.flight)}" placeholder="e.g. SV 1020"></label>` : ""}
        </div>
        <p class="tdx-err" data-err role="alert" hidden></p>
        ${S.cat?.terms?.min_notice_minutes ? `<p class="tdx-wz-note"><i class="fa-regular fa-clock" aria-hidden="true"></i> Please book at least ${esc(minsText(S.cat.terms.min_notice_minutes))} before the trip.</p>` : ""}`;
    },
    ret() {
      return `<div class="tdx-wz-intro"><h2>Return trip?</h2><p>Add the way back now, or skip it. You can always book it later.</p></div>
        <div class="tdx-seg2 is-big">
          <button type="button" class="tdx-seg2-o" data-wz-ret="0" aria-pressed="${!W.ret}"><i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i><b>One way</b><small>Just this trip</small></button>
          <button type="button" class="tdx-seg2-o" data-wz-ret="1" aria-pressed="${W.ret}"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i><b>Add a return trip</b><small>${esc(placeLabel(W.destination) || "Destination")} → ${esc(placeLabel(W.pickup) || "pickup")}</small></button>
        </div>
        <div class="tdx-ret${W.ret ? " is-on" : ""}" data-ret-box><div class="tdx-fgrid">
          <label class="tdx-f"><span>Return date <em>*</em></span><input name="rdate" type="date" min="${esc(W.date || today())}" value="${esc(W.rdate)}"></label>
          <label class="tdx-f"><span>Return time <em>*</em></span><input name="rtime" type="time" value="${esc(W.rtime)}"></label>
        </div></div>
        <p class="tdx-err" data-err role="alert" hidden></p>`;
    },
    details() {
      const F = fields(), em = F.customer_email;
      const qs2 = (S.site.form?.questions || []).map(x => {
        const name = `q_${esc(x.id)}`, val = W.answers[x.id] ?? "", star = x.required ? " <em>*</em>" : "", req = x.required ? " required" : "";
        if (x.type === "checkbox") return `<label class="tdx-check is-wide"><input type="checkbox" name="${name}"${val === "yes" ? " checked" : ""}${req}><span>${esc(x.label)}${star}</span></label>`;
        if (x.type === "select") return `<label class="tdx-f"><span>${esc(x.label)}${star}</span><select name="${name}"${req}><option value="">Choose…</option>${(x.choices || []).map(o => `<option${o === val ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
        if (x.type === "textarea") return `<label class="tdx-f is-wide"><span>${esc(x.label)}${star}</span><textarea name="${name}" rows="2" maxlength="500"${req}>${esc(val)}</textarea></label>`;
        return `<label class="tdx-f"><span>${esc(x.label)}${star}</span><input name="${name}" ${x.type === "number" ? 'type="number" inputmode="decimal"' : 'type="text"'} maxlength="500" value="${esc(val)}"${req}></label>`;
      }).join("");
      return `<div class="tdx-wz-intro"><h2>Your details</h2><p>So your chauffeur can reach you. We use them only for this booking.</p></div>
        <div class="tdx-fgrid">
          <label class="tdx-f"><span>Full name <em>*</em></span><input name="name" autocomplete="name" maxlength="80" value="${esc(W.name)}" required data-autofocus></label>
          <label class="tdx-f"><span>Mobile (WhatsApp) <em>*</em></span><input name="mobile" type="tel" autocomplete="tel" inputmode="tel" maxlength="24" value="${esc(W.mobile)}" placeholder="+966 5x xxx xxxx" required></label>
          <label class="tdx-f is-wide"><span>Email${em?.enabled && em.required ? " <em>*</em>" : " (optional)"}</span><input name="email" type="email" autocomplete="email" maxlength="160" value="${esc(W.email)}"></label>
          ${qs2}
          <label class="tdx-f is-wide"><span>Notes for the chauffeur (optional)</span><textarea name="notes" rows="3" maxlength="1500" placeholder="Child seat, extra luggage, meeting point…">${esc(W.notes)}</textarea></label>
        </div>
        <label class="tdx-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
        <p class="tdx-err" data-err role="alert" hidden></p>`;
    },
    confirm() {
      const k = classByKey(W.cls), car = cars().find(c => c.id === W.car), one = onePrice(), cur = S.cat?.currency || "SAR";
      const when = (d, t) => `${fmtDay(d)}${t ? " · " + t : ""}`;
      const row = (icon, label, value) => `<div class="tdx-sum-row"><i class="fa-solid ${icon}" aria-hidden="true"></i><span><small>${esc(label)}</small><b>${value}</b></span></div>`;
      return `<div class="tdx-wz-intro"><h2>Confirm your booking</h2><p>Check the details. The price is final; payment is arranged directly with us.</p></div>
        <div class="tdx-confirm">
          <div class="tdx-sum">
            ${row(TYPES().find(t => t.key === W.type)?.icon || "fa-car-side", "Service", esc(serviceLabel()))}
            ${row("fa-car-side", "Car", esc(`${k?.name || "Car"} · ${car ? car.name : `any ${k?.name || "car"}`}`))}
            ${row("fa-location-dot", "Pickup", esc(placeLabel(W.pickup)) + (W.places.pickup && !W.places.pickup.airport ? ' <small class="tdx-pin">pinned</small>' : ""))}
            ${W.destination ? row("fa-flag-checkered", "Drop-off", esc(placeLabel(W.destination)) + (W.places.destination && !W.places.destination.airport ? ' <small class="tdx-pin">pinned</small>' : "")) : ""}
            ${row("fa-regular fa-calendar", "Pickup", esc(when(W.date, W.time)))}
            ${W.ret ? row("fa-arrows-rotate", "Return", esc(when(W.rdate, W.rtime))) : ""}
            ${row("fa-regular fa-user", "Passenger", esc(`${W.name} · ${W.mobile}`) + (W.pax ? ` · ${esc(W.pax)} passenger${+W.pax === 1 ? "" : "s"}` : ""))}
          </div>
          <div class="tdx-price">
            <span class="tdx-eyebrow is-gold">${W.ret ? "Return trip" : "One way"}</span>
            ${one != null ? (W.ret ? `
                <div class="tdx-price-row"><span>Outbound</span><b>${esc(money(one, cur))}</b></div>
                <div class="tdx-price-row"><span>Return</span><b>${esc(money(one, cur))}</b></div>
                <div class="tdx-price-total"><span>Total</span><strong>${esc(money(one * 2, cur))}</strong></div>
                <small class="tdx-muted">2 × ${esc(money(one, cur))}</small>`
              : `<div class="tdx-price-total"><span>Total</span><strong>${esc(money(one, cur))}</strong></div>`)
              : `<div class="tdx-price-total"><span>Price</span><strong>Confirmed by us</strong></div><small class="tdx-muted">We send you the price before the trip.</small>`}
            <ul class="tdx-price-notes">${(S.cat?.terms?.lines || []).filter(l => /invoice|cash|transfer/i.test(l.label)).map(l => `<li><b>${esc(l.label)}:</b> ${esc(l.value)}</li>`).join("")}<li>No payment is taken online.</li></ul>
          </div>
        </div>
        <p class="tdx-err" data-err role="alert" hidden></p>`;
    },
    done() {
      const r = W.result || {}, ct = contact();
      const wa = waLink(ct.whatsapp, `Hello ${S.site.business.name}, about my booking ${r.reference}. My pickup location: `);
      return `<div class="tdx-done">
          <span class="tdx-done-ring"><i class="fa-solid ${r.status === "confirmed" ? "fa-check" : "fa-paper-plane"}" aria-hidden="true"></i></span>
          <h2>${r.status === "confirmed" ? "Booking confirmed" : "Request received"}</h2>
          <p>${esc(r.message || "Thank you. We will contact you shortly to confirm your ride.")}</p>
          ${r.reference ? `<p class="tdx-ref">Your reference<b>${esc(r.reference)}</b></p>` : ""}
          <div class="tdx-done-acts">${wa ? `<a class="tdx-btn is-wa" href="${esc(wa)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>Send your location on WhatsApp</span></a>` : ""}
            ${ct.phone ? `<a class="tdx-btn is-line" href="tel:${esc(ct.phone)}"><i class="fa-solid fa-phone" aria-hidden="true"></i><span>${esc(ct.phone)}</span></a>` : ""}</div>
        </div>`;
    }
  };
  const minsText = m => { m = Number(m) || 0; if (m % 60 === 0) return `${m / 60} hour${m === 60 ? "" : "s"}`; return `${m} minutes`; };
  const fmtDay = d => { if (!d) return ""; try { return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); } catch (_) { return d; } };
  const fields = () => Object.fromEntries((S.site.form?.fields || []).map(f => [f.key, f]));
  const pinOf = t => { const m = String(t || "").match(/^(.*?)\s*·\s*(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)\s*$/); return m ? m[1] : null; };
  const placeLabel = t => pinOf(t) || String(t || "").trim();
  function placeField(key, label, value, ph) {
    const pin = W.places[key];
    const optional = /optional/i.test(label);
    return `<div class="tdx-f is-wide" data-field="${key}"><span>${esc(label)}${optional ? "" : " <em>*</em>"}</span><div class="tdx-place">
        <i class="fa-solid ${key === "pickup" ? "fa-location-dot" : "fa-flag-checkered"} tdx-place-ico" aria-hidden="true"></i>
        <input name="${key}" maxlength="150" value="${esc(value)}" placeholder="${esc(ph)}" autocomplete="street-address">
        <button type="button" class="tdx-place-btn" data-map="${key}" title="Pick on the map" aria-label="Pick ${esc(label)} on the map"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i><span>Map</span></button>
      </div><small class="tdx-place-hint" data-place-hint="${key}"${pin && !pin.airport ? "" : " hidden"}><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> Pinned on the map${pin && !pin.airport ? ` (${Number(pin.lat).toFixed(5)}, ${Number(pin.lng).toFixed(5)})` : ""}</small></div>`;
  }
  // Validation per step; returns { text, field } or null.
  function check(step) {
    if (step === "service" && !W.type) return { text: "Choose the kind of ride." };
    if (step === "category" && !W.cls) return { text: "Choose a vehicle type." };
    if (step === "trip") {
      if ((W.type === "city" || W.type === "airport") && (typeDef(W.type)?.cities || []).length && !W.city) return { text: "Choose the city." };
      if (W.type === "intercity" && S.cat && !service(W.route)) return { text: "Choose the route.", field: "route" };
      if (!W.pickup.trim()) return { text: "Enter the pickup location or pick it on the map.", field: "pickup" };
      const destOptional = W.type === "city" && W.rideKind === "fullday";
      if (!destOptional && !W.destination.trim()) return { text: "Enter the drop-off location or pick it on the map.", field: "destination" };
      if (!W.date) return { text: "Choose the pickup date.", field: "date" };
      if (!W.time) return { text: "Choose the pickup time.", field: "time" };
      const mins = Number(S.cat?.terms?.min_notice_minutes) || 0;
      const at = new Date(`${W.date}T${W.time}`);
      if (at - Date.now() < Math.max(mins, 0) * 60000) return { text: mins ? `Please book at least ${minsText(mins)} before the trip.` : "Choose a time in the future.", field: "time" };
      if (W.pax && (+W.pax < 1 || +W.pax > 60)) return { text: "Check the number of passengers.", field: "pax" };
    }
    if (step === "ret" && W.ret) {
      if (!W.rdate) return { text: "Choose the return date, or continue one way.", field: "rdate" };
      if (!W.rtime) return { text: "Choose the return time.", field: "rtime" };
      if (new Date(`${W.rdate}T${W.rtime}`) <= new Date(`${W.date}T${W.time}`)) return { text: "The return must be after the pickup.", field: "rtime" };
    }
    if (step === "details") {
      if (!W.name.trim()) return { text: "Enter your name.", field: "name" };
      if (waDigits(W.mobile).length < 7) return { text: "Enter a valid mobile number.", field: "mobile" };
      const em = fields().customer_email;
      if (W.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(W.email)) return { text: "Enter a valid email address.", field: "email" };
      if (em?.enabled && em.required && !W.email) return { text: "Enter your email address.", field: "email" };
      for (const q of S.site.form?.questions || []) if (q.required && !String(W.answers[q.id] || "").trim()) return { text: `Answer: ${q.label}`, field: `q_${q.id}` };
    }
    return null;
  }
  function placeValue(key) {
    const t = String(W[key] || "").trim(), pl = W.places[key];
    if (!pl) return t;
    const tail = ` · ${Number(pl.lat).toFixed(6)},${Number(pl.lng).toFixed(6)}`;
    return (t || pl.label || "Pinned location").slice(0, 200 - tail.length) + tail;
  }
  async function send() {
    if (W.busy) return;
    const one = onePrice(), cur = S.cat?.currency || "SAR", car = cars().find(c => c.id === W.car), k = classByKey(W.cls);
    const noteLines = [
      W.ret ? `Return trip: ${fmtDay(W.rdate)} ${W.rtime}, from ${placeLabel(W.destination) || "the destination"} back to ${placeLabel(W.pickup)}` : "One way",
      W.flight ? `Flight: ${W.flight}` : "",
      one != null ? `Price shown: ${W.ret ? `${money(one * 2, cur)} (2 × ${money(one, cur)}, return trip)` : money(one, cur)}` : "",
      W.notes.trim()
    ].filter(Boolean);
    const F = fields();
    const p = {
      customer_name: W.name.trim(), customer_mobile: W.mobile.trim(), customer_email: W.email.trim(),
      pickup: placeValue("pickup"), destination: placeValue("destination") || (W.type === "city" && W.rideKind === "fullday" ? "Full day in " + (cityByKey(W.city)?.name || "the city") : ""),
      pickup_date: W.date, pickup_time: W.time, passengers: W.pax || (F.passengers?.required ? "1" : ""),
      customer_notes: noteLines.join("\n").slice(0, 2000), website: W.el.querySelector('[name="website"]')?.value || "",
      answers: { ...W.answers }
    };
    if (W.ret) { p.return_date = W.rdate; p.return_time = W.rtime; }
    if (car?.dbKey) p.vehicle = car.dbKey;
    if (S.cat) p.catalog = { vehicle: `${k?.name || W.cls} · ${car ? car.name : "Any model"}`, service: `${serviceLabel()}${W.ret ? " · Return trip" : ""}`.slice(0, 160), price: one != null ? (W.ret ? `${money(one * 2, cur)} · return` : money(one, cur)) : "" };
    W.busy = true; paintFoot();
    try {
      const r = await rpc("app_drive_public_book", { p_slug: S.slug, p });
      if (r && r.ok && r.reference) {
        notifyBusiness(r.push_token);
        W.result = r; W.busy = false; go("done", 1);
        return;
      }
      W.busy = false; paintFoot();
      const where = { pickup: "trip", destination: "trip", pickup_date: "trip", pickup_time: "trip", passengers: "trip", return_date: "ret", customer_name: "details", customer_mobile: "details", customer_email: "details", vehicle: "car" }[r?.field];
      showErr(r?.error || "Your request could not be sent. Please try again.");
      if (where && steps().includes(where)) {
        const msg = r?.error || "";
        setTimeout(() => { go(where, -1); setTimeout(() => showErr(msg), STEP_MS); }, 900);
      }
    } catch (_) { W.busy = false; paintFoot(); showErr("Your request could not be sent. Check your connection and try again."); }
  }

  // Overlay events.
  function onWizardClick(e) {
    const t = e.target;
    if (t.closest("[data-wz-close]")) { if (W.step !== "done" && (W.name || W.pickup) && !confirm("Close the booking? Your details will be lost.")) return; return closeWizard(); }
    if (t.closest("[data-wz-next]")) return next();
    if (t.closest("[data-wz-back]")) return back();
    const ty = t.closest("[data-wz-type]"); if (ty) { W.type = ty.dataset.wzType; W.el.querySelectorAll("[data-wz-type]").forEach(b => b.classList.toggle("is-on", b === ty)); return setTimeout(next, 260); }
    const cl = t.closest("[data-wz-class]"); if (cl) { if (W.cls !== cl.dataset.wzClass) { W.car = ""; W.slide = 0; } W.cls = cl.dataset.wzClass; W.el.querySelectorAll("[data-wz-class]").forEach(b => b.classList.toggle("is-on", b === cl)); return setTimeout(next, 260); }
    const sg = t.closest("[data-slide-go]"); if (sg) return slideTo(W.slide + Number(sg.dataset.slideGo));
    const st = t.closest("[data-slide-to]"); if (st) return slideTo(Number(st.dataset.slideTo));
    if (t.closest("[data-wz-any-car]")) { const l = steps(); W.car = ""; W.err = ""; return go(l[l.indexOf("car") + 1], 1); }
    const ci = t.closest("[data-wz-city]"); if (ci) { W.city = ci.dataset.wzCity; if (W.type === "airport") { if (W.places.pickup?.airport) { W.pickup = ""; delete W.places.pickup; } if (W.places.destination?.airport) { W.destination = ""; delete W.places.destination; } } return repaint(); }
    const kd = t.closest("[data-wz-kind]"); if (kd) { W.rideKind = kd.dataset.wzKind; if (W.rideKind === "fullday") W.ret = false; return repaint(); }
    const dr = t.closest("[data-wz-dir]"); if (dr) { W.dir = dr.dataset.wzDir; return repaint(); }
    if (t.closest("[data-wz-swap]")) { W.reverse = !W.reverse; const a = W.pickup, ap = W.places.pickup; W.pickup = W.destination; W.destination = a; const bp = W.places.destination; delete W.places.pickup; delete W.places.destination; if (bp) W.places.pickup = bp; if (ap) W.places.destination = ap; return repaint(); }
    const rt = t.closest("[data-wz-ret]"); if (rt) { W.ret = rt.dataset.wzRet === "1"; W.el.querySelectorAll("[data-wz-ret]").forEach(b => b.setAttribute("aria-pressed", String(b === rt))); W.el.querySelector("[data-ret-box]")?.classList.toggle("is-on", W.ret); paintFoot(); if (W.ret) setTimeout(() => W.el.querySelector('[name="rdate"]')?.focus({ preventScroll: true }), 400); return; }
    const mp = t.closest("[data-map]"); if (mp) { const key = mp.dataset.map; return openMap(key, W.places[key], pl => { W.places[key] = pl; W[key] = pl.label; repaint(); }); }
  }
  function onWizardInput(e) {
    const el = e.target, n = el.name; if (!n) return;
    el.classList.remove("is-bad");
    const err = W.el.querySelector(".tdx-wz-step.is-current [data-err]"); if (err && !err.hidden) err.hidden = true;
    if (n === "route") { W.route = el.value; return; }
    if (n.startsWith("q_")) { W.answers[n.slice(2)] = el.type === "checkbox" ? (el.checked ? "yes" : "") : el.value; return; }
    if (n === "website") return;
    if (n === "pickup" || n === "destination") { W[n] = el.value; if (W.places[n] && e.type === "input") { delete W.places[n]; const h = W.el.querySelector(`[data-place-hint="${n}"]`); if (h) h.hidden = true; } return; }
    if (n === "date") { W.date = el.value; return; }
    if (n in W) W[n] = el.value;
  }
  function repaint() {
    const node = W.el.querySelector(".tdx-wz-step.is-current"); if (!node) return;
    const sc = node.querySelector(".tdx-wz-scroll"), y = sc.scrollTop;
    sc.innerHTML = STEPS[W.step]();
    sc.scrollTop = y; mountStep(node); paintFoot();
  }
  function mountStep(node) {
    if (W.step === "car") {
      fillImages(node, "auto");
      const sl = node.querySelector("[data-slider]"); if (!sl) return;
      let x0 = null, dx = 0;
      sl.addEventListener("pointerdown", e => { x0 = e.clientX; dx = 0; sl.classList.add("is-drag"); });
      sl.addEventListener("pointermove", e => { if (x0 == null) return; dx = e.clientX - x0; sl.querySelector("[data-slides]").style.setProperty("--dx", dx + "px"); });
      const end = () => { if (x0 == null) return; sl.classList.remove("is-drag"); sl.querySelector("[data-slides]").style.setProperty("--dx", "0px"); if (Math.abs(dx) > 50) slideTo(W.slide + (dx < 0 ? 1 : -1)); x0 = null; };
      sl.addEventListener("pointerup", end); sl.addEventListener("pointercancel", end); sl.addEventListener("pointerleave", end);
      sl.addEventListener("keydown", e => { if (e.key === "ArrowRight") slideTo(W.slide + 1); if (e.key === "ArrowLeft") slideTo(W.slide - 1); });
    } else fillImages(node);
  }
  function slideTo(i) {
    const list = carsOf(W.cls); if (!list.length) return;
    W.slide = (i + list.length) % list.length;
    const node = W.el.querySelector(".tdx-wz-step.is-current");
    node.querySelector("[data-slides]")?.style.setProperty("--i", W.slide);
    node.querySelectorAll("[data-slide-to]").forEach(b => b.setAttribute("aria-selected", String(+b.dataset.slideTo === W.slide)));
    node.querySelector(`[data-slide-to="${W.slide}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    const nm = node.querySelector("[data-slide-name]"); if (nm) nm.textContent = list[W.slide].name;
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
    return [...new Set(parts.filter(Boolean))].join(", ") || String(j?.display_name || "").split(",").slice(0, 3).join(",").trim();
  };
  function openMap(field, current, onPick) {
    const label = field === "pickup" ? "Pickup" : "Drop-off";
    const st = { pl: current && !current.airport ? current : null, map: null, timer: 0, seq: 0, quiet: false };
    const city = cityByKey(W.city) || null;
    const center = st.pl ? [st.pl.lat, st.pl.lng] : city?.airport && W.type !== "intercity" ? [city.airport.lat, city.airport.lng] : (S.cat ? [24.7136, 46.6753] : [25.2048, 55.2708]);
    panel({
      id: "map", title: `${label} on the map`, sub: "Move the map so the pin sits on the place", icon: "fa-map-location-dot",
      body: () => `<div class="tdx-mapbox">
          <div class="tdx-map-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Search a place or address" data-msearch data-autofocus aria-label="Search a place"><button type="button" class="tdx-icon is-sm" data-mlocate title="Use my location" aria-label="Use my location"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i></button></div>
          <ul class="tdx-map-results" data-mresults hidden></ul>
          <div class="tdx-map" data-map-el><div class="tdx-map-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading the map…</div></div>
          <span class="tdx-map-pin" aria-hidden="true"><i class="fa-solid fa-location-dot"></i></span>
        </div>`,
      foot: () => `<span class="tdx-foot-note" data-mlabel><small>Selected place</small><b>${esc(st.pl?.label || "Move the map")}</b></span>
        <button type="button" class="tdx-btn is-gold" data-muse disabled><i class="fa-solid fa-check" aria-hidden="true"></i><span>Use this place</span></button>`,
      onClose: () => { try { st.map?.remove(); } catch (_) {} },
      async mount(el) {
        const lab = el.querySelector("[data-mlabel] b"), use = el.querySelector("[data-muse]");
        const setPl = (lat, lng, name) => { st.pl = { lat, lng, label: name || "Pinned location" }; lab.textContent = st.pl.label; use.disabled = false; };
        const reverse = async (lat, lng) => {
          const my = ++st.seq; lab.textContent = "Finding the address…"; use.disabled = true;
          try { const j = await geo(`/reverse?lat=${lat}&lon=${lng}&zoom=18`); if (my === st.seq) setPl(lat, lng, shortName(j)); }
          catch (_) { if (my === st.seq) setPl(lat, lng, "Pinned location"); }
        };
        try {
          const L = await leaflet();
          const box = el.querySelector("[data-map-el]"); box.innerHTML = "";
          st.map = L.map(box, { zoomControl: false, attributionControl: true }).setView(center, st.pl ? 16 : 12);
          L.control.zoom({ position: "bottomright" }).addTo(st.map);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(st.map);
          st.map.on("moveend", () => { clearTimeout(st.timer); if (st.quiet) { st.quiet = false; return; } const c = st.map.getCenter(); st.timer = setTimeout(() => reverse(c.lat, c.lng), 450); });
          st.map.on("click", e => st.map.panTo(e.latlng));
          if (st.pl) setPl(st.pl.lat, st.pl.lng, st.pl.label);
          setTimeout(() => st.map.invalidateSize(), 460);
        } catch (_) {
          el.querySelector("[data-map-el]").innerHTML = `<div class="tdx-map-loading"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> The map could not be loaded. You can still type the address.</div>`;
        }
        const search = el.querySelector("[data-msearch]"), results = el.querySelector("[data-mresults]");
        let t = 0;
        search.addEventListener("input", () => {
          clearTimeout(t);
          const q = search.value.trim();
          if (q.length < 3) { results.hidden = true; return; }
          t = setTimeout(async () => {
            try {
              const list = await geo(`/search?q=${encodeURIComponent(q)}&limit=6&addressdetails=1${S.cat ? "&countrycodes=sa" : ""}`);
              results.innerHTML = (list || []).map((x, i) => `<li><button type="button" data-mres="${i}"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span><b>${esc(shortName(x))}</b><small>${esc(x.display_name)}</small></span></button></li>`).join("") || `<li class="tdx-muted">No places found</li>`;
              results.hidden = false;
              results.querySelectorAll("[data-mres]").forEach(b => b.addEventListener("click", () => {
                const x = list[+b.dataset.mres]; results.hidden = true; search.value = shortName(x);
                const lat = Number(x.lat), lng = Number(x.lon);
                st.seq++; clearTimeout(st.timer); setPl(lat, lng, shortName(x));
                if (st.map) { st.quiet = true; st.map.setView([lat, lng], 17); }
              }));
            } catch (_) { results.innerHTML = `<li class="tdx-muted">Search is not available right now. Move the map instead.</li>`; results.hidden = false; }
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

  // ---- question (inquiry) ----------------------------------------------------------------------------
  function openInquiry() {
    const st = { done: null };
    const el = panel({
      id: "ask", title: "Ask a question", sub: S.site.business.name, icon: "fa-comment-dots",
      body: () => st.done ? `<div class="tdx-done is-small"><span class="tdx-done-ring"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></span><h2>Message sent</h2><p>${esc(st.done.message || "Thank you. We will get back to you soon.")}</p></div>` : `<form id="tdxAsk" class="tdx-form" novalidate>
          <div class="tdx-fgrid">
            <label class="tdx-f is-wide"><span>Subject</span><input name="subject" maxlength="120" placeholder="e.g. Group trip to Makkah" data-autofocus></label>
            <label class="tdx-f is-wide"><span>Message <em>*</em></span><textarea name="message" rows="5" maxlength="2000" required></textarea></label>
            <label class="tdx-f"><span>Name <em>*</em></span><input name="name" maxlength="80" autocomplete="name" required></label>
            <label class="tdx-f"><span>Mobile</span><input name="mobile" type="tel" inputmode="tel" maxlength="24" autocomplete="tel" placeholder="+966 5x xxx xxxx"></label>
            <label class="tdx-f is-wide"><span>Email</span><input name="email" type="email" maxlength="160" autocomplete="email"></label>
          </div><small class="tdx-muted">Give a mobile number or an email so we can answer.</small>
          <label class="tdx-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
          <p class="tdx-err" data-err role="alert" hidden></p></form>`,
      foot: () => st.done ? `<span></span><button type="button" class="tdx-btn is-gold" data-close-top>Done</button>`
        : `<span class="tdx-foot-note"><small>Answer</small><b>As soon as possible</b></span><button type="submit" form="tdxAsk" class="tdx-btn is-gold" data-send${S.site.preview ? " disabled" : ""}><i class="fa-solid fa-paper-plane" aria-hidden="true"></i><span>Send</span></button>`,
      mount(el) {
        const form = el.querySelector("#tdxAsk"); if (!form) return;
        const err = (text, f) => { const box = el.querySelector("[data-err]"); box.textContent = text; box.hidden = false; if (f) { f.classList.add("is-bad"); f.focus(); } };
        form.addEventListener("input", e => { e.target.classList.remove("is-bad"); });
        form.addEventListener("submit", async e => {
          e.preventDefault();
          const p = Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v).trim()]));
          if (!p.message) return err("Write your message.", form.elements.message);
          if (!p.name) return err("Enter your name.", form.elements.name);
          if (!p.mobile && !p.email) return err("Enter your mobile number or email so we can answer.", form.elements.mobile);
          const btn = el.querySelector("[data-send]"); btn.disabled = true; btn.classList.add("is-busy");
          try {
            const r = await rpc("app_drive_public_inquiry", { p_slug: S.slug, p });
            if (r && r.ok) { notifyBusiness(r.push_token); st.done = r; el._def.title = "Message sent"; paintPanel(el); return; }
            err(r?.error || "Your message could not be sent. Please try again.", r?.field ? form.elements[r.field] : null);
          } catch (_) { err("Your message could not be sent. Check your connection and try again."); }
          finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove("is-busy"); } }
        });
      }
    });
    return el;
  }

  function openCredits() {
    const items = [
      ...(S.cat?.hero?.photo ? [{ name: "Home page", p: S.cat.hero.photo }] : []),
      ...(S.cat?.cities || []).filter(c => c.photo).map(c => ({ name: c.name, p: c.photo })),
      ...(S.cat?.vehicles || []).flatMap(v => (v.photos || []).map(p => ({ name: v.name, p })))
    ].filter(x => x.p.commons || S.credits[x.p.file]);
    panel({
      id: "credits", title: "Photo credits", sub: "Wikimedia Commons, free licences", icon: "fa-camera",
      body: () => `<ul class="tdx-credits">${items.map(({ name, p }) => {
        const cr = S.credits[p.file] || {}, file = cr.file || p.commons;
        return `<li><b>${esc(name)}</b><small><a href="${esc(cr.page || commonsPage(file))}" target="_blank" rel="noopener nofollow">${esc(file)}</a>${cr.author ? ` · ${esc(cr.author)}` : ""} · ${esc(cr.license || "free licence (see the file page)")}</small></li>`;
      }).join("")}<li><b>Fleet showcase</b><small>${esc(S.site.business.name)}</small></li><li><b>Vehicle type drawings</b><small>Triplem Drive</small></li></ul>`
    });
  }

  // ---- events --------------------------------------------------------------------------------------
  function bind() {
    document.addEventListener("error", onImgError, true);
    document.addEventListener("load", onImgLoad, true);
    app.addEventListener("click", e => {
      const t = e.target;
      if (t.closest("[data-close-top]")) return closeTop();
      const ty = t.closest("[data-type]"); if (ty && !t.closest(".tdx-wz")) return openWizard({ type: ty.dataset.type });
      const cl = t.closest("[data-class]"); if (cl) return openWizard({ cls: cl.dataset.class });
      const ci = t.closest("[data-city]"); if (ci) { const c = cityByKey(ci.dataset.city); return openWizard(c?.route ? { type: "intercity", route: c.route, city: c.key } : { type: "city", city: c?.key }); }
      if (t.closest("[data-book]")) return openWizard({});
      const act = t.closest("[data-act]");
      if (act) { const a = act.dataset.act; if (a === "inquiry") return openInquiry(); if (a === "credits") return openCredits(); }
      const nav = t.closest(".tdx-nav a"); if (nav) { const sec = document.querySelector(nav.getAttribute("href")); if (sec) { e.preventDefault(); sec.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); } }
    });
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      if (S.stack.length) { e.preventDefault(); closeTop(); return; }
      if (W.open) { e.preventDefault(); if (W.step === "done" || !(W.name || W.pickup) || confirm("Close the booking? Your details will be lost.")) closeWizard(); }
    });
    const top = app.querySelector("[data-top]");
    const onScroll = () => top?.classList.toggle("is-solid", scrollY > 40);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
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
      seo({ title: "Triplem Drive", description: "Chauffeur rides by Triplem Drive.", index: false });
      return messagePage("fa-wifi", "This page could not be loaded", "Check your connection and try again.", `<button class="tdx-btn is-gold" onclick="location.reload()">Try again</button>`);
    }
    if (r && r.ok) {
      S.site = r; S.slug = r.slug; S.cat = await loadCatalogue(r);
      render(); bind();
      const h = (location.hash || "").replace("#", "");
      if (h === "book") openWizard({}); else if (h === "ask") openInquiry();
      else if (["city", "airport", "intercity"].includes(h)) openWizard({ type: h });
      return;
    }
    if (r && r.reason === "moved" && r.slug) { location.replace(`/${encodeURIComponent(r.slug)}/${location.hash}`); return; }
    seo({ title: r?.reason === "unpublished" ? `${r.business_name || "Triplem Drive"} · Not available` : "Page not found · Triplem Drive", description: "This Triplem Drive page is not available.", index: false });
    if (r && r.reason === "unpublished") return messagePage("fa-eye-slash", r.business_name || "Not available yet", "This booking page is not available at the moment. Please contact the business directly.");
    return messagePage("fa-route", "Page not found", qs.get("nf") ? "The page you are looking for could not be found." : "There is no booking page at this address.", `<a class="tdx-btn is-gold" href="${CANON_ORIGIN}/">Go to Triplem VIP</a>`);
  }
  start();
})();
