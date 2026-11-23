/* Triplem Drive - application shell, shared helpers, Overview, Fleet and Fleet Sections.
 * Loaded on demand by 00-drive-access.js the first time the Home card is opened.
 * Every list is read from the server page by page; nothing polls. Detail views open in the
 * Triplem VIP side panel (TriplemDetailPanels.custom). 03-drive-ops.js and 04-drive-setup.js add
 * the other sections through TriplemDriveApp.register().
 */
(function (global) {
  "use strict";

  const NAV = [
    { key: "overview", label: "Overview", icon: "fa-gauge-high" },
    { key: "bookings", label: "Bookings", icon: "fa-calendar-check" },
    { key: "calendar", label: "Availability", icon: "fa-calendar-days" },
    { key: "fleet", label: "Fleet", icon: "fa-car-side" },
    { key: "sections", label: "Fleet Sections", icon: "fa-layer-group" },
    { key: "rates", label: "Rates", icon: "fa-tags" },
    { key: "routes", label: "Routes", icon: "fa-route" },
    { key: "drivers", label: "Drivers", icon: "fa-id-card" },
    { key: "customers", label: "Customers", icon: "fa-user-group" },
    { key: "profile", label: "Business Page", icon: "fa-store" },
    { key: "form", label: "Booking Form", icon: "fa-list-check" }
  ];
  const TABS = ["overview", "bookings", "fleet", "calendar", "more"];
  const VIEWS = {};
  const S = { root: null, ctx: null, view: "overview", opts: null, prevOverflow: "", media: new Map(), mediaWait: new Map() };

  // ---- small helpers ------------------------------------------------------------------------
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const api = (fn, args) => global.supabaseRpc(fn, args || {}, { offlineCache: false });
  const errText = e => String(e?.message || e || "Something went wrong.").replace(/^Error:\s*/, "");
  const DP = () => global.TriplemDetailPanels;
  function toast(msg, ok = true) {
    try { if (DP()?.isOpen?.()) return DP().toast(msg, ok); } catch (_) {}
    const t = S.root?.querySelector(".td-toast");
    if (!t) return;
    t.className = `td-toast is-on${ok ? "" : " is-bad"}`;
    t.innerHTML = `<i class="fa-solid ${ok ? "fa-circle-check" : "fa-triangle-exclamation"}" aria-hidden="true"></i><span>${esc(msg)}</span>`;
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("is-on"), ok ? 2600 : 5200);
  }
  const currency = () => S.ctx?.fleet?.currency || "USD";
  function money(v, cur = currency()) {
    if (v === null || v === undefined || v === "") return "";
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
    catch (_) { return `${cur} ${n.toLocaleString()}`; }
  }
  // Booking times are business-local wall-clock values ("2026-12-03T09:00:00"); never shifted.
  function parseLocal(v) {
    const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
  }
  const fmtDate = v => { const d = parseLocal(v); return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"; };
  const fmtTime = v => { const d = parseLocal(v); return d ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""; };
  const fmtWhen = v => { if (!v) return "—"; try { return new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (_) { return String(v); } };
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = () => { const n = parseLocal(S.ctx?.now); return n || new Date(); };

  const B_STATUS = {
    pending: ["Pending", "warn", "fa-hourglass-half"], confirmed: ["Confirmed", "ok", "fa-circle-check"],
    rejected: ["Rejected", "bad", "fa-ban"], cancelled: ["Cancelled", "bad", "fa-circle-xmark"],
    completed: ["Completed", "info", "fa-flag-checkered"], no_show: ["No Show", "bad", "fa-user-slash"]
  };
  const V_STATUS = {
    available: ["Available", "ok"], booked: ["Booked", "info"], reserved: ["Reserved", "info"],
    out_of_service: ["Out of Service", "bad"], maintenance: ["Under Maintenance", "warn"], sold: ["Sold", ""], inactive: ["Inactive", ""]
  };
  const pill = (text, tone = "", icon = "") => `<span class="td-pill${tone ? " is-" + tone : ""}">${icon ? `<i class="fa-solid ${icon}" aria-hidden="true"></i>` : ""}${esc(text)}</span>`;
  const bPill = s => { const x = B_STATUS[s] || [s, ""]; return pill(x[0], x[1], x[2]); };
  const vPill = s => { const x = V_STATUS[s] || [s, ""]; return pill(x[0], x[1]); };
  const skel = n => `<div class="td-skel">${Array.from({ length: n }, () => "<span></span>").join("")}</div>`;
  const empty = (icon, title, text, action = "") => `<div class="td-empty"><i class="fa-solid ${icon}" aria-hidden="true"></i><b>${esc(title)}</b><p>${esc(text)}</p>${action}</div>`;
  const btn = (act, label, icon, { primary = false, danger = false, data = "", disabled = false, cls = "" } = {}) =>
    `<button type="button" class="td-btn${primary ? " is-primary" : ""}${danger ? " is-danger" : ""}${cls ? " " + cls : ""}" data-td-act="${act}"${data ? " " + data : ""}${disabled ? " disabled" : ""}>${icon ? `<i class="fa-solid ${icon}" aria-hidden="true"></i>` : ""}<span>${esc(label)}</span></button>`;

  // Form fields used inside side panels (read back with formValues()).
  const F = {
    text: (name, label, value, { type = "text", max = 120, req = false, ph = "", wide = false, hint = "", attrs = "" } = {}) =>
      `<label class="aum-field td-f${wide ? " is-wide" : ""}"><span>${esc(label)}${req ? ' <em class="td-req">*</em>' : ""}</span><input name="${name}" type="${type}" maxlength="${max}" value="${esc(value ?? "")}"${req ? " required" : ""}${ph ? ` placeholder="${esc(ph)}"` : ""} ${attrs}>${hint ? `<small>${esc(hint)}</small>` : ""}</label>`,
    num: (name, label, value, { min = 0, max = 100000000, step = "any", hint = "", ph = "" } = {}) =>
      `<label class="aum-field td-f"><span>${esc(label)}</span><input name="${name}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${esc(value ?? "")}"${ph ? ` placeholder="${esc(ph)}"` : ""}>${hint ? `<small>${esc(hint)}</small>` : ""}</label>`,
    area: (name, label, value, { max = 3000, rows = 3, hint = "", ph = "" } = {}) =>
      `<label class="aum-field td-f is-wide"><span>${esc(label)}</span><textarea name="${name}" rows="${rows}" maxlength="${max}"${ph ? ` placeholder="${esc(ph)}"` : ""}>${esc(value ?? "")}</textarea>${hint ? `<small>${esc(hint)}</small>` : ""}</label>`,
    select: (name, label, value, options, { req = false, wide = false, hint = "" } = {}) =>
      `<label class="aum-field td-f${wide ? " is-wide" : ""}"><span>${esc(label)}${req ? ' <em class="td-req">*</em>' : ""}</span><select name="${name}">${options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value ?? "") ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>${hint ? `<small>${esc(hint)}</small>` : ""}</label>`,
    sw: (name, label, on, note = "") =>
      `<label class="td-switch"><input type="checkbox" name="${name}"${on ? " checked" : ""}><span class="td-switch-track" aria-hidden="true"><i></i></span><span class="td-switch-copy"><b>${esc(label)}</b>${note ? `<small>${esc(note)}</small>` : ""}</span></label>`
  };
  function formValues(form) {
    const out = {};
    if (!form) return out;
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === "checkbox") out[el.name] = el.checked;
      else out[el.name] = el.value.trim();
    }
    return out;
  }
  const panelForm = () => DP()?.custom?.body()?.querySelector("form.td-pform");

  // Opens a side panel with the Triplem VIP look; avatar is an icon.
  function panel(def) {
    const dp = DP();
    if (!dp?.custom) { alert("Please reload the page and try again."); return null; }
    const d = { icon: "home", tabs: [["main", def.title || "", "fa-solid fa-circle-info"]], tab: "main", state: {}, ...def };
    const head = d.head;
    d.head = () => { const h = head(); return h && { ...h, avatar: `<i class="fa-solid ${h.icon || "fa-car-side"}" aria-hidden="true"></i>` }; };
    dp.custom.open(d);
    return d;
  }
  const rerender = () => DP()?.custom?.render({ keepScroll: true });
  const closePanel = () => { try { DP()?.close(); } catch (_) {} };

  async function confirmBox(text, { title = "Please confirm", ok = "Continue", danger = false } = {}) {
    try { if (typeof global.appConfirmDelete === "function" && danger) return await global.appConfirmDelete(text, { title, confirmLabel: ok }); } catch (_) {}
    return global.confirm(text);
  }

  // ---- images: compressed in the browser before upload ----------------------------------------
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This image could not be opened. Use a PNG, JPG or WebP file.")); };
      img.src = url;
    });
  }
  function canvasBlob(img, maxSide, type, quality) {
    const r = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * r)), h = Math.max(1, Math.round(img.naturalHeight * r));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    if (type === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); }
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, w, h);
    return new Promise(res => c.toBlob(b => res({ blob: b, w, h }), type, quality));
  }
  const b64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = () => rej(new Error("The image could not be read.")); fr.readAsDataURL(blob); });
  async function compressImage(file, { max = 1600, thumb = 480, keepAlpha = false } = {}) {
    if (!file) throw new Error("Choose an image.");
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error("Use a PNG, JPG or WebP image.");
    if (file.size > 15 * 1024 * 1024) throw new Error("The image is larger than 15 MB.");
    const img = await readImage(file);
    if (img.naturalWidth < 16 || img.naturalHeight < 16) throw new Error("The image is too small.");
    let type = "image/webp";
    let q = 0.84, full = await canvasBlob(img, max, type, q);
    if (!full.blob || full.blob.type !== "image/webp") { type = keepAlpha ? "image/png" : "image/jpeg"; full = await canvasBlob(img, max, type, q); }
    while (full.blob && full.blob.size > 850 * 1024 && q > 0.45 && type !== "image/png") { q -= 0.12; full = await canvasBlob(img, max, type, q); }
    if (full.blob && full.blob.size > 850 * 1024) full = await canvasBlob(img, Math.round(max * 0.7), type, 0.7);
    if (!full.blob || full.blob.size > 880 * 1024) throw new Error("The image is too large even after compression. Try a smaller image.");
    const th = await canvasBlob(img, thumb, type, 0.78);
    return { mime: type, width: full.w, height: full.h, data: await b64(full.blob), thumb: th.blob && th.blob.size < 115 * 1024 ? await b64(th.blob) : null };
  }
  function pickFiles({ multiple = false } = {}) {
    return new Promise(resolve => {
      const i = document.createElement("input");
      i.type = "file"; i.accept = "image/png,image/jpeg,image/webp"; i.multiple = multiple;
      i.onchange = () => resolve([...(i.files || [])]);
      i.click();
    });
  }
  // Private images by key, cached for the session as blob URLs.
  async function mediaUrls(keys, size = "thumb") {
    const want = [...new Set(keys.filter(Boolean))].filter(k => !S.media.has(`${size}:${k}`));
    for (let i = 0; i < want.length; i += 24) {
      const batch = want.slice(i, i + 24);
      try {
        const rows = await api("app_drive_media_get", { p_keys: batch, p_size: size });
        for (const r of rows || []) {
          const bin = atob(r.data); const u8 = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j);
          S.media.set(`${size}:${r.key}`, URL.createObjectURL(new Blob([u8], { type: r.mime })));
        }
      } catch (_) {}
    }
    const out = {};
    keys.forEach(k => { const u = S.media.get(`${size}:${k}`); if (u) out[k] = u; });
    return out;
  }
  // Fills <img data-td-media="key"> inside root once loaded (lazy, one request per screen).
  async function fillMedia(root, size = "thumb") {
    const imgs = [...(root?.querySelectorAll?.("img[data-td-media]") || [])];
    if (!imgs.length) return;
    const urls = await mediaUrls(imgs.map(i => i.dataset.tdMedia), size);
    imgs.forEach(i => { const u = urls[i.dataset.tdMedia]; if (u) { i.src = u; i.classList.add("is-in"); } else i.closest(".td-ph")?.classList.add("is-none"); });
  }

  // ---- context ------------------------------------------------------------------------------
  async function loadContext() {
    S.ctx = await api("app_drive_context");
    paintBrand();
    return S.ctx;
  }
  const ctx = () => S.ctx;
  const sectionName = id => (S.ctx?.sections || []).find(s => s.id === id)?.name || "";
  const vehicleName = id => (S.ctx?.vehicles || []).find(v => v.id === id)?.name || "";
  const publicUrl = () => global.TriplemDriveAdmin?.publicUrl?.(S.ctx?.fleet?.slug) || "";
  const sectionOptions = (blank = "No section") => [["", blank], ...(S.ctx?.sections || []).map(s => [s.id, s.name + (s.active ? "" : " (inactive)")])];
  const vehicleOptions = (blank = "Any vehicle") => [["", blank], ...(S.ctx?.vehicles || []).map(v => [v.id, v.name + (v.registration ? ` · ${v.registration}` : "")])];

  // ---- shell --------------------------------------------------------------------------------
  function build() {
    if (S.root) return;
    const r = document.createElement("div");
    r.className = "td-app"; r.hidden = true;
    r.setAttribute("role", "application"); r.setAttribute("aria-label", "Triplem Drive");
    r.innerHTML = `
      <aside class="td-side">
        <div class="td-brand" data-td-brand></div>
        <nav class="td-nav" aria-label="Triplem Drive">${NAV.map(n => `<button type="button" class="td-nav-item" data-td-view="${n.key}"><i class="fa-solid ${n.icon}" aria-hidden="true"></i><span>${esc(n.label)}</span></button>`).join("")}</nav>
        <div class="td-side-foot"><button type="button" class="td-nav-item" data-td-home><i class="fa-solid fa-house" aria-hidden="true"></i><span>Triplem VIP Home</span></button></div>
      </aside>
      <div class="td-main">
        <header class="td-top">
          <button type="button" class="td-icon-btn td-home-btn" data-td-home title="Back to Triplem VIP" aria-label="Back to Triplem VIP"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
          <div class="td-top-title"><small>Triplem Drive</small><h1 data-td-title>Overview</h1></div>
          <div class="td-top-actions">
            <button type="button" class="td-btn td-hide-sm" data-td-act="open-public"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i><span>Public page</span></button>
            <button type="button" class="td-btn is-primary" data-td-act="new-booking"><i class="fa-solid fa-plus" aria-hidden="true"></i><span>New booking</span></button>
          </div>
        </header>
        <main class="td-content" data-td-content tabindex="-1"></main>
      </div>
      <nav class="td-tabbar" aria-label="Triplem Drive sections">${TABS.map(k => { const n = NAV.find(x => x.key === k) || { key: "more", label: "More", icon: "fa-ellipsis" }; return `<button type="button" data-td-tab="${k}"><i class="fa-solid ${n.icon}" aria-hidden="true"></i><span>${esc(k === "calendar" ? "Calendar" : n.label)}</span></button>`; }).join("")}</nav>
      <div class="td-more" data-td-more hidden><div class="td-more-sheet">${NAV.filter(n => !TABS.includes(n.key)).map(n => `<button type="button" data-td-view="${n.key}"><i class="fa-solid ${n.icon}" aria-hidden="true"></i><span>${esc(n.label)}</span></button>`).join("")}</div></div>
      <div class="td-toast" role="status" aria-live="polite"></div>`;
    document.body.appendChild(r);
    S.root = r;
    r.addEventListener("click", onClick);
    r.addEventListener("keydown", e => {
      if (e.key === "Escape" && !DP()?.isOpen?.() && !document.querySelector(".modal:not(.hide)")) { e.preventDefault(); close(); }
    });
  }
  function paintBrand() {
    const el = S.root?.querySelector("[data-td-brand]");
    if (!el) return;
    const f = S.ctx?.fleet || {};
    el.innerHTML = `<span class="td-brand-logo">${f.logo ? `<img data-td-media="${esc(f.logo)}" alt="">` : `<img src="Assets/logo/icons/home/drive.svg" alt="">`}</span>
      <span class="td-brand-text"><strong>${esc(f.business_name || "Triplem Drive")}</strong><span>${f.business_name && f.business_name !== "Triplem Drive" ? "Triplem Drive" : "Fleet Management & Vehicle Bookings"}</span></span>`;
    fillMedia(el);
  }

  async function open(view, opts) {
    build();
    const r = S.root;
    if (r.hidden) {
      r.hidden = false;
      S.prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.documentElement.classList.add("td-open");
      document.getElementById("app")?.setAttribute("aria-hidden", "true");
    }
    S.view = view || S.view || "overview";
    content().innerHTML = `<div class="td-loading-state">${skel(6)}</div>`;
    try { await loadContext(); }
    catch (e) {
      content().innerHTML = empty("fa-lock", "Triplem Drive is not available", errText(e), btn("home", "Back to Triplem VIP", "fa-house", { primary: true }));
      return;
    }
    show(S.view, opts);
  }
  function close() {
    if (!S.root || S.root.hidden) return;
    closePanel();
    S.root.hidden = true;
    document.body.style.overflow = S.prevOverflow || "";
    document.documentElement.classList.remove("td-open");
    document.getElementById("app")?.removeAttribute("aria-hidden");
    try { if (typeof showWorkspaceHome === "function") showWorkspaceHome(); } catch (_) {}
  }
  const content = () => S.root.querySelector("[data-td-content]");
  function show(view, opts) {
    if (!VIEWS[view]) view = "overview";
    S.view = view; S.opts = opts || null;
    const n = NAV.find(x => x.key === view);
    S.root.querySelector("[data-td-title]").textContent = n?.label || "Triplem Drive";
    S.root.querySelectorAll("[data-td-view]").forEach(b => b.classList.toggle("active", b.dataset.tdView === view));
    S.root.querySelectorAll("[data-td-tab]").forEach(b => b.classList.toggle("active", b.dataset.tdTab === view || (b.dataset.tdTab === "more" && !TABS.includes(view))));
    S.root.querySelector("[data-td-more]").hidden = true;
    const el = content();
    el.scrollTop = 0;
    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = `td-view td-view-${view}`;
    el.appendChild(wrap);
    try { VIEWS[view].render(wrap, A, opts || {}); } catch (e) { console.error(e); wrap.innerHTML = empty("fa-triangle-exclamation", "This section could not be shown", errText(e)); }
  }
  const refresh = () => { if (S.root && !S.root.hidden) show(S.view, null); };

  function onClick(e) {
    const t = e.target;
    if (t.closest("[data-td-home]")) return close();
    const v = t.closest("[data-td-view]");
    if (v) return show(v.dataset.tdView);
    const tab = t.closest("[data-td-tab]");
    if (tab) {
      if (tab.dataset.tdTab === "more") { const m = S.root.querySelector("[data-td-more]"); m.hidden = !m.hidden; return; }
      return show(tab.dataset.tdTab);
    }
    if (t.closest("[data-td-more]") && !t.closest(".td-more-sheet")) { S.root.querySelector("[data-td-more]").hidden = true; return; }
    const a = t.closest("[data-td-act]");
    if (!a || a.disabled) return;
    const act = a.dataset.tdAct;
    if (act === "home") return close();
    if (act === "open-public") { const u = publicUrl(); if (u) global.open(u, "_blank", "noopener"); return; }
    if (act === "new-booking") return A.openBookingForm?.(null);
    const h = A.actions[act];
    if (h) Promise.resolve(h(a, e)).catch(err => toast(errText(err), false));
  }

  // ---- Overview -----------------------------------------------------------------------------
  VIEWS.overview = {
    render(el) {
      const st = S.ovr || (S.ovr = { range: 30 });
      const now = today();
      const to = ymd(now), from = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (st.range - 1)));
      const f = S.ctx.fleet;
      el.innerHTML = `
        ${!f.published ? `<div class="td-callout is-warn"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i><div><b>Your public page is not published yet</b><span>Add your vehicles, set your business details, then publish the page so customers can send booking requests.</span></div>${btn("go-profile", "Business Page", "fa-store")}</div>` : ""}
        <div class="td-ov-filters" role="radiogroup" aria-label="Period">
          ${[[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "12 months"]].map(([d, t]) => `<button type="button" role="radio" aria-checked="${st.range === d}" data-td-act="ov-range" data-d="${d}">${t}</button>`).join("")}
        </div>
        <div data-td-ov>${skel(8)}</div>`;
      api("app_drive_overview", { p_from: from, p_to: to }).then(o => {
        if (!el.isConnected) return;
        const vs = o.vehicles?.by_status || {};
        const r = o.range || {};
        const rangeTotal = Object.values(r).reduce((a, b) => a + Number(b || 0), 0);
        const stat = (v, label, icon, tone = "", act = "") => `<button type="button" class="td-stat${tone ? " is-" + tone : ""}"${act ? ` data-td-act="${act}"` : " disabled"}><i class="fa-solid ${icon}" aria-hidden="true"></i><b>${esc(String(v ?? 0))}</b><small>${esc(label)}</small></button>`;
        const row = b => `<li class="td-row" data-td-act="open-booking" data-id="${esc(b.id)}" role="button" tabindex="0">
            <span class="td-row-main"><b>${esc(b.customer_name)}</b><small>${esc(b.reference)} · ${esc(b.vehicle || "Any vehicle")}</small></span>
            <span class="td-row-side"><small>${esc(fmtDate(b.start_at))}${b.pickup ? "" : ""}</small>${bPill(b.status)}</span></li>`;
        el.querySelector("[data-td-ov]").innerHTML = `
          <section class="td-card"><h2>Bookings</h2>
            <div class="td-stats">
              ${stat(o.pending, "Pending requests", "fa-hourglass-half", "warn", "go-pending")}
              ${stat(o.today, "Today", "fa-sun", "", "go-today")}
              ${stat(o.upcoming_7, "Next 7 days", "fa-calendar-week")}
              ${stat(o.confirmed_upcoming, "Confirmed upcoming", "fa-circle-check", "ok", "go-confirmed")}
            </div>
            <div class="td-range"><span>Requests received in the last ${esc(st.range === 365 ? "12 months" : st.range + " days")}: <b>${rangeTotal}</b></span>
              <div class="td-range-bar" role="img" aria-label="Requests by status">${Object.keys(B_STATUS).filter(k => r[k]).map(k => `<i class="is-${B_STATUS[k][1] || "plain"}" style="flex:${Number(r[k])}" title="${esc(B_STATUS[k][0])}: ${r[k]}"></i>`).join("") || "<i class='is-empty' style='flex:1'></i>"}</div>
              <div class="td-range-legend">${Object.keys(B_STATUS).map(k => `<span><i class="is-${B_STATUS[k][1] || "plain"}"></i>${esc(B_STATUS[k][0])} <b>${Number(r[k] || 0)}</b></span>`).join("")}</div>
            </div>
          </section>
          <section class="td-card"><h2>Fleet</h2>
            <div class="td-stats is-6">
              ${stat(o.vehicles?.total || 0, "Vehicles", "fa-car-side", "", "go-fleet")}
              ${stat(vs.available || 0, "Available", "fa-circle-check", "ok")}
              ${stat((vs.booked || 0) + (vs.reserved || 0), "Booked / Reserved", "fa-key", "info")}
              ${stat((vs.maintenance || 0) + (vs.out_of_service || 0), "Maintenance / Out", "fa-screwdriver-wrench", "warn")}
              ${stat(o.vehicles?.public || 0, "On public page", "fa-globe")}
              ${stat((vs.sold || 0) + (vs.inactive || 0), "Sold / Inactive", "fa-box-archive")}
            </div>
          </section>
          <div class="td-two">
            <section class="td-card"><h2>Recent requests</h2>${(o.recent || []).length ? `<ul class="td-rows">${o.recent.map(row).join("")}</ul>` : empty("fa-inbox", "No booking requests yet", "Requests from your public page appear here.")}</section>
            <section class="td-card"><h2>Next confirmed trips</h2>${(o.next || []).length ? `<ul class="td-rows">${o.next.map(b => row({ ...b, start_at: b.start_at })).join("")}</ul>` : empty("fa-road", "No confirmed trips coming up", "Confirm a request to see it here.")}</section>
          </div>
          <section class="td-card td-public-card"><h2>Public page</h2>
            <div class="td-public"><div><b>${esc(f.business_name)}</b><a href="${esc(publicUrl())}" target="_blank" rel="noopener">${esc(publicUrl().replace(/^https?:\/\//, ""))}</a>
              <span>${f.published ? pill("Published", "ok", "fa-globe") : pill("Not published", "warn", "fa-eye-slash")}</span></div>
              <div class="td-actions">${btn("copy-url", "Copy link", "fa-regular fa-copy")}${btn("open-public", "Open", "fa-arrow-up-right-from-square")}${btn("go-profile", "Edit page", "fa-pen")}</div></div>
          </section>`;
      }).catch(e => { if (el.isConnected) el.querySelector("[data-td-ov]").innerHTML = empty("fa-triangle-exclamation", "The overview could not be loaded", errText(e), btn("ov-retry", "Try again", "fa-rotate")); });
    }
  };

  // ---- Fleet ---------------------------------------------------------------------------------
  const TRANSMISSIONS = [["", "—"], ["Automatic", "Automatic"], ["Manual", "Manual"], ["Other", "Other"]];
  const FUELS = [["", "—"], ["Petrol", "Petrol"], ["Diesel", "Diesel"], ["Hybrid", "Hybrid"], ["Electric", "Electric"], ["Other", "Other"]];
  VIEWS.fleet = {
    render(el) {
      const st = S.fleet || (S.fleet = { q: "", status: "", section: "", rows: [], total: 0, offset: 0 });
      el.innerHTML = `
        <div class="td-toolbar">
          <label class="td-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Search name, make, model or registration" value="${esc(st.q)}" data-td-fleet-q aria-label="Search vehicles"></label>
          <select data-td-fleet-status aria-label="Status"><option value="">All statuses</option>${Object.entries(V_STATUS).map(([k, v]) => `<option value="${k}"${st.status === k ? " selected" : ""}>${esc(v[0])}</option>`).join("")}</select>
          <select data-td-fleet-section aria-label="Section"><option value="">All sections</option><option value="none"${st.section === "none" ? " selected" : ""}>No section</option>${(S.ctx.sections || []).map(s => `<option value="${esc(s.id)}"${st.section === s.id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
          ${btn("vehicle-new", "Add vehicle", "fa-plus", { primary: true })}
        </div>
        <div data-td-fleet-list>${skel(6)}</div>`;
      const q = el.querySelector("[data-td-fleet-q]");
      let tm = 0;
      q.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(() => { st.q = q.value.trim(); load(true); }, 260); });
      el.querySelector("[data-td-fleet-status]").addEventListener("change", e => { st.status = e.target.value; load(true); });
      el.querySelector("[data-td-fleet-section]").addEventListener("change", e => { st.section = e.target.value; load(true); });
      async function load(reset) {
        if (reset) { st.rows = []; st.offset = 0; }
        const list = el.querySelector("[data-td-fleet-list]");
        if (reset) list.innerHTML = skel(6);
        try {
          const r = await api("app_drive_vehicles_list", { p: { q: st.q, status: st.status, section_id: st.section, limit: 30, offset: st.offset } });
          st.rows = st.rows.concat(r.rows || []); st.total = r.total || 0; st.offset = st.rows.length;
          paint();
        } catch (e) { list.innerHTML = empty("fa-triangle-exclamation", "The fleet could not be loaded", errText(e)); }
      }
      function paint() {
        const list = el.querySelector("[data-td-fleet-list]");
        if (!list) return;
        if (!st.rows.length) {
          list.innerHTML = (st.q || st.status || st.section) ? empty("fa-filter", "No vehicles match", "Change the search or filters.")
            : empty("fa-car-side", "Add your first vehicle", "Vehicles you add here can be shown on your public page and booked by customers.", btn("vehicle-new", "Add vehicle", "fa-plus", { primary: true }));
          return;
        }
        list.innerHTML = `<div class="td-vgrid">${st.rows.map(v => `
          <button type="button" class="td-vcard" data-td-act="open-vehicle" data-id="${esc(v.id)}">
            <span class="td-ph">${v.photos?.[0] ? `<img data-td-media="${esc(v.photos[0].key)}" alt="" loading="lazy">` : ""}<i class="fa-solid fa-car-side" aria-hidden="true"></i></span>
            <span class="td-vcard-body"><b>${esc(v.name)}</b><small>${esc([v.make, v.model, v.year].filter(Boolean).join(" · ") || "—")}</small>
              <span class="td-vcard-pills">${vPill(v.status)}${v.is_public ? pill("Public", "", "fa-globe") : pill("Private", "", "fa-lock")}${v.section_name ? pill(v.section_name, "", "fa-layer-group") : ""}</span>
              <small class="td-muted">${v.registration ? `<i class="fa-solid fa-id-card" aria-hidden="true"></i> ${esc(v.registration)}` : ""}${v.upcoming ? ` · ${v.upcoming} upcoming` : ""}</small></span>
          </button>`).join("")}</div>
          <div class="td-more-row"><span>${st.rows.length} of ${st.total}</span>${st.rows.length < st.total ? btn("fleet-more", "Load more", "fa-angles-down") : ""}</div>`;
        fillMedia(list);
      }
      A.actions["fleet-more"] = () => load(false);
      S.fleetReload = () => load(true);
      load(true);
    }
  };

  function vehicleForm(v = {}) {
    const specs = (v.specs || []).concat([{ label: "", value: "" }]);
    return `<form class="td-pform" novalidate>
      <div class="td-fgrid">
        ${F.text("name", "Vehicle name", v.name, { req: true, max: 80, ph: "e.g. Toyota Land Cruiser 2024", wide: true })}
        ${F.text("make", "Make", v.make, { max: 60 })}${F.text("model", "Model", v.model, { max: 60 })}
        ${F.num("year", "Year", v.year, { min: 1900, max: 2100, step: 1 })}${F.num("capacity", "Passengers", v.capacity, { min: 1, max: 500, step: 1 })}
        ${F.select("section_id", "Fleet section", v.section_id || "", sectionOptions())}
        ${F.select("status", "Status", v.status || "available", Object.entries(V_STATUS).map(([k, x]) => [k, x[0]]), { hint: "The vehicle's condition. Dates are checked separately when bookings are confirmed." })}
        ${F.select("transmission", "Transmission", v.transmission || "", TRANSMISSIONS)}${F.select("fuel", "Fuel", v.fuel || "", FUELS)}
        ${F.text("registration", "Registration / plate (private)", v.registration, { max: 40, hint: "Never shown on the public page." })}
        ${F.area("description", "Description (public)", v.description, { rows: 3 })}
      </div>
      <div class="td-specs"><b>Specifications</b><small>Shown on the public page, e.g. Luggage · 4 bags</small>
        ${specs.map((s, i) => `<div class="td-spec"><input name="spec_label_${i}" maxlength="40" placeholder="Feature" value="${esc(s.label)}" aria-label="Feature"><input name="spec_value_${i}" maxlength="120" placeholder="Value" value="${esc(s.value)}" aria-label="Value"></div>`).join("")}
        <button type="button" class="td-link" data-dp-act="spec-add"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add a line</button>
      </div>
      <div class="td-switches">
        ${F.sw("is_public", "Show on the public page", v.is_public)}
        ${F.sw("show_price", "Show prices", v.show_price !== false, "Off: visitors see Request a Quote.")}
        ${F.sw("featured", "Featured", v.featured, "Shown first on the public page.")}
      </div>
      ${F.area("internal_notes", "Internal notes (private)", v.internal_notes, { rows: 2 })}
    </form>`;
  }
  function vehiclePayload(form, id) {
    const d = formValues(form);
    const specs = [];
    Object.keys(d).filter(k => k.startsWith("spec_label_")).forEach(k => { const i = k.slice(11); if (d[k]) specs.push({ label: d[k], value: d[`spec_value_${i}`] || "" }); });
    return { id: id || null, name: d.name, make: d.make, model: d.model, year: d.year, capacity: d.capacity, section_id: d.section_id, status: d.status,
      transmission: d.transmission, fuel: d.fuel, registration: d.registration, description: d.description, specs,
      is_public: d.is_public, show_price: d.show_price, featured: d.featured, internal_notes: d.internal_notes };
  }

  async function openVehicle(id, tab = "details") {
    const st = { v: null, err: "", saving: false };
    const load = async () => { try { st.v = await api("app_drive_vehicle_get", { p_id: id }); st.err = ""; } catch (e) { st.err = errText(e); } rerender(); };
    panel({
      tabs: [["details", "Details", "fa-solid fa-circle-info"], ["photos", "Photos", "fa-solid fa-images"], ["edit", "Edit", "fa-solid fa-pen"]], tab, state: st,
      head: () => ({ title: st.v?.name || "Vehicle", icon: "fa-car-side", sub: esc([st.v?.make, st.v?.model, st.v?.year].filter(Boolean).join(" · ") || "Triplem Drive"),
        pills: st.v ? [vPill(st.v.status), st.v.is_public ? pill("On public page", "", "fa-globe") : pill("Private", "", "fa-lock")] : [] }),
      render(tabKey) {
        if (st.err) return `<div class="aum-note is-bad"><i class="fa-solid fa-triangle-exclamation"></i><div>${esc(st.err)}</div></div>`;
        const v = st.v;
        if (!v) return skel(6);
        if (tabKey === "edit") return vehicleForm(v) + `<div class="td-pfoot">${btn("v-delete", "Delete", "fa-trash", { danger: true })}<span></span>${btn("v-save", st.saving ? "Saving…" : "Save", "fa-check", { primary: true, disabled: st.saving }).replace(/data-td-act/g, "data-dp-act")}</div>`.replace(/data-td-act/g, "data-dp-act");
        if (tabKey === "photos") return photosHtml(v);
        const K = DP().kit;
        return `${v.photos?.length ? `<div class="td-hero-ph"><span class="td-ph"><img data-td-media="${esc(v.photos[0].key)}" data-td-size="full" alt=""><i class="fa-solid fa-car-side"></i></span></div>` : ""}`
          + K.section("Vehicle", K.kv([
            ["Section", esc(v.section_name || "—")], ["Make / model", esc([v.make, v.model].filter(Boolean).join(" ") || "—")], ["Year", esc(v.year || "—")],
            ["Passengers", esc(v.capacity || "—")], ["Transmission", esc(v.transmission || "—")], ["Fuel", esc(v.fuel || "—")],
            ["Registration", esc(v.registration || "—") + ' <small class="td-muted">private</small>'], ["Upcoming bookings", esc(String(v.upcoming || 0))]]))
          + (v.specs?.length ? K.section("Specifications", K.kv(v.specs.map(s => [s.label, esc(s.value || "")]))) : "")
          + (v.description ? K.section("Description", `<p class="td-pre">${esc(v.description)}</p>`) : "")
          + (v.internal_notes ? K.section("Internal notes", `<p class="td-pre">${esc(v.internal_notes)}</p>`) : "")
          + K.section("Public page", K.kv([["Visible", v.is_public ? "Yes" : "No"], ["Prices", v.show_price ? "Shown" : "Request a Quote"], ["Featured", v.featured ? "Yes" : "No"]]))
          + `<div class="td-pacts">${K.btn("v-edit", "Edit", "fa-solid fa-pen", { primary: true })}${K.btn("v-photos", "Photos", "fa-solid fa-images")}${K.btn("v-book", "New booking", "fa-solid fa-calendar-plus")}${K.btn("v-block", "Block dates", "fa-solid fa-ban")}</div>`;
      },
      after(tabKey, body) { fillMedia(body, "thumb"); body.querySelectorAll("img[data-td-size='full']").forEach(i => mediaUrls([i.dataset.tdMedia], "full").then(u => { if (u[i.dataset.tdMedia]) i.src = u[i.dataset.tdMedia]; })); },
      actions: {
        "v-edit": () => DP().custom.tab("edit"),
        "v-photos": () => DP().custom.tab("photos"),
        "v-book": () => A.openBookingForm?.(null, { vehicle_id: id }),
        "v-block": () => A.openBlockForm?.(null, { vehicle_id: id }),
        "spec-add": () => { const box = panelForm()?.querySelector(".td-specs"); const n = box.querySelectorAll(".td-spec").length; box.querySelector("[data-dp-act='spec-add']").insertAdjacentHTML("beforebegin", `<div class="td-spec"><input name="spec_label_${n}" maxlength="40" placeholder="Feature" aria-label="Feature"><input name="spec_value_${n}" maxlength="120" placeholder="Value" aria-label="Value"></div>`); },
        "v-save": async () => {
          const p = vehiclePayload(panelForm(), id);
          if (!p.name) throw new Error("Enter the vehicle name.");
          st.saving = true; rerender();
          try { st.v = await api("app_drive_vehicle_save", { p }); st.saving = false; DP().toast("Vehicle saved"); await loadContext(); S.fleetReload?.(); DP().custom.tab("details"); }
          catch (e) { st.saving = false; rerender(); throw e; }
        },
        "v-delete": async () => {
          if (!(await confirmBox(`Delete ${st.v?.name || "this vehicle"} and its photos? A vehicle with bookings cannot be deleted; set it to Inactive or Sold instead.`, { title: "Delete vehicle?", ok: "Delete vehicle", danger: true }))) return;
          await api("app_drive_vehicle_delete", { p_id: id });
          closePanel(); toast("Vehicle deleted"); await loadContext(); S.fleetReload?.();
        },
        ...photoActions(st, id, load)
      }
    });
    load();
  }

  function photosHtml(v) {
    const ph = v.photos || [];
    return `<div class="aum-note is-info"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><div>The first photo is the main photo. Photos are compressed before upload (PNG, JPG or WebP, up to 12 per vehicle).</div></div>
      <div class="td-photos">${ph.map((p, i) => `
        <figure class="td-photo">
          <span class="td-ph"><img data-td-media="${esc(p.key)}" alt="Photo ${i + 1}"><i class="fa-solid fa-image"></i></span>
          ${i === 0 ? `<span class="td-photo-main">Main photo</span>` : ""}
          <figcaption>
            ${i > 0 ? `<button type="button" data-dp-act="ph-main" data-i="${i}" title="Make main photo" aria-label="Make main photo"><i class="fa-solid fa-star"></i></button>` : ""}
            ${i > 0 ? `<button type="button" data-dp-act="ph-left" data-i="${i}" title="Move left" aria-label="Move left"><i class="fa-solid fa-arrow-left"></i></button>` : ""}
            ${i < ph.length - 1 ? `<button type="button" data-dp-act="ph-right" data-i="${i}" title="Move right" aria-label="Move right"><i class="fa-solid fa-arrow-right"></i></button>` : ""}
            <button type="button" data-dp-act="ph-replace" data-i="${i}" title="Replace" aria-label="Replace"><i class="fa-solid fa-arrows-rotate"></i></button>
            <button type="button" data-dp-act="ph-remove" data-i="${i}" title="Remove" aria-label="Remove" class="is-danger"><i class="fa-solid fa-trash"></i></button>
          </figcaption>
        </figure>`).join("")}
        ${ph.length < 12 ? `<button type="button" class="td-photo-add" data-dp-act="ph-add"><i class="fa-solid fa-plus" aria-hidden="true"></i><span>Add photos</span></button>` : ""}
      </div>`;
  }
  function photoActions(st, vehicleId, reload) {
    const order = ids => api("app_drive_media_order", { p_vehicle_id: vehicleId, p_ids: ids });
    const ids = () => (st.v?.photos || []).map(p => p.id);
    const move = async (from, to) => { const a = ids(); const [x] = a.splice(from, 1); a.splice(to, 0, x); await order(a); await reload(); S.fleetReload?.(); };
    async function upload(files) {
      let n = 0;
      for (const f of files) {
        if ((st.v?.photos?.length || 0) + n >= 12) { DP().toast("A vehicle can have at most 12 photos.", false); break; }
        DP().toast(`Uploading ${n + 1} of ${files.length}…`);
        const img = await compressImage(f);
        await api("app_drive_media_add", { p_kind: "vehicle", p_vehicle_id: vehicleId, p_mime: img.mime, p_width: img.width, p_height: img.height, p_data: img.data, p_thumb: img.thumb });
        n++;
      }
      return n;
    }
    return {
      "ph-add": async () => { const files = await pickFiles({ multiple: true }); if (!files.length) return; const n = await upload(files); await reload(); S.fleetReload?.(); if (n) DP().toast(`${n} photo${n === 1 ? "" : "s"} added`); },
      "ph-main": b => move(+b.dataset.i, 0),
      "ph-left": b => move(+b.dataset.i, +b.dataset.i - 1),
      "ph-right": b => move(+b.dataset.i, +b.dataset.i + 1),
      "ph-replace": async b => {
        const i = +b.dataset.i, old = st.v.photos[i];
        const [file] = await pickFiles(); if (!file) return;
        const img = await compressImage(file);
        const added = await api("app_drive_media_add", { p_kind: "vehicle", p_vehicle_id: vehicleId, p_mime: img.mime, p_width: img.width, p_height: img.height, p_data: img.data, p_thumb: img.thumb });
        const a = ids(); a.splice(i, 1, added.id);
        await api("app_drive_media_delete", { p_id: old.id });
        await order(a); await reload(); S.fleetReload?.(); DP().toast("Photo replaced");
      },
      "ph-remove": async b => {
        const p = st.v.photos[+b.dataset.i];
        if (!(await confirmBox("Remove this photo?", { title: "Remove photo?", ok: "Remove", danger: true }))) return;
        await api("app_drive_media_delete", { p_id: p.id }); await reload(); S.fleetReload?.(); DP().toast("Photo removed");
      }
    };
  }

  function newVehicle() {
    const st = { saving: false };
    panel({
      tabs: [["edit", "New vehicle", "fa-solid fa-plus"]], tab: "edit", state: st,
      head: () => ({ title: "Add vehicle", icon: "fa-car-side", sub: "Add photos after saving", pills: [] }),
      render: () => vehicleForm({ status: "available", is_public: true, show_price: true }) + `<div class="td-pfoot"><span></span>${btn("v-create", st.saving ? "Saving…" : "Save vehicle", "fa-check", { primary: true, disabled: st.saving }).replace(/data-td-act/g, "data-dp-act")}</div>`,
      actions: {
        "spec-add": () => { const box = panelForm()?.querySelector(".td-specs"); const n = box.querySelectorAll(".td-spec").length; box.querySelector("[data-dp-act='spec-add']").insertAdjacentHTML("beforebegin", `<div class="td-spec"><input name="spec_label_${n}" maxlength="40" placeholder="Feature" aria-label="Feature"><input name="spec_value_${n}" maxlength="120" placeholder="Value" aria-label="Value"></div>`); },
        "v-create": async () => {
          const p = vehiclePayload(panelForm(), null);
          if (!p.name) throw new Error("Enter the vehicle name.");
          st.saving = true;
          try { const v = await api("app_drive_vehicle_save", { p }); await loadContext(); S.fleetReload?.(); toast("Vehicle added"); openVehicle(v.id, "photos"); }
          catch (e) { st.saving = false; throw e; }
        }
      }
    });
  }

  // ---- Fleet sections -------------------------------------------------------------------------
  VIEWS.sections = {
    render(el) {
      const list = S.ctx.sections || [];
      el.innerHTML = `<div class="td-toolbar"><p class="td-muted">Group your vehicles (e.g. Economy, SUV, Luxury, Buses). Sections with public vehicles appear on your public page.</p>${btn("section-new", "Add section", "fa-plus", { primary: true })}</div>
        ${list.length ? `<ul class="td-list">${list.map((s, i) => `
          <li class="td-list-row">
            <span class="td-list-ico"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></span>
            <span class="td-list-main"><b>${esc(s.name)}</b><small>${s.vehicles} vehicle${s.vehicles === 1 ? "" : "s"}${s.description ? " · " + esc(s.description) : ""}</small></span>
            ${s.active ? pill("Active", "ok") : pill("Inactive", "")}
            <span class="td-list-acts">
              <button type="button" class="td-icon-btn" data-td-act="section-up" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move up" title="Move up"><i class="fa-solid fa-arrow-up"></i></button>
              <button type="button" class="td-icon-btn" data-td-act="section-down" data-i="${i}" ${i === list.length - 1 ? "disabled" : ""} aria-label="Move down" title="Move down"><i class="fa-solid fa-arrow-down"></i></button>
              <button type="button" class="td-icon-btn" data-td-act="section-edit" data-id="${esc(s.id)}" aria-label="Edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
            </span>
          </li>`).join("")}</ul>` : empty("fa-layer-group", "No sections yet", "Sections are optional. Add one to group your vehicles on the public page.")}`;
    }
  };
  function openSection(s) {
    const st = { saving: false };
    panel({
      tabs: [["main", s ? "Section" : "New section", "fa-solid fa-layer-group"]], tab: "main", state: st,
      head: () => ({ title: s ? s.name : "Add section", icon: "fa-layer-group", sub: s ? `${s.vehicles} vehicle${s.vehicles === 1 ? "" : "s"}` : "Fleet Sections", pills: [] }),
      render: () => `<form class="td-pform"><div class="td-fgrid">${F.text("name", "Name", s?.name, { req: true, max: 60, wide: true, ph: "e.g. Luxury" })}${F.area("description", "Description (public)", s?.description, { max: 400, rows: 2 })}</div>
        <div class="td-switches">${F.sw("active", "Active", s ? s.active : true, "Inactive sections are hidden on the public page; their vehicles keep the section.")}</div></form>
        <div class="td-pfoot">${s ? `<button type="button" class="td-btn is-danger" data-dp-act="sec-delete"><i class="fa-solid fa-trash"></i><span>Delete</span></button>` : "<span></span>"}<button type="button" class="td-btn is-primary" data-dp-act="sec-save"><i class="fa-solid fa-check"></i><span>Save</span></button></div>`,
      actions: {
        "sec-save": async () => {
          const d = formValues(panelForm());
          if (!d.name) throw new Error("Enter a section name.");
          await api("app_drive_section_save", { p: { id: s?.id || null, name: d.name, description: d.description, active: d.active } });
          closePanel(); await loadContext(); refresh(); toast("Section saved");
        },
        "sec-delete": async () => {
          if (!(await confirmBox(`Delete the section "${s.name}"? Its ${s.vehicles} vehicle(s), routes and rates are kept and simply have no section.`, { title: "Delete section?", ok: "Delete section", danger: true }))) return;
          await api("app_drive_section_delete", { p_id: s.id });
          closePanel(); await loadContext(); refresh(); toast("Section deleted");
        }
      }
    });
  }
  async function moveSection(i, d) {
    const ids = (S.ctx.sections || []).map(s => s.id);
    const [x] = ids.splice(i, 1); ids.splice(i + d, 0, x);
    await api("app_drive_sections_reorder", { p_ids: ids });
    await loadContext(); refresh();
  }

  // ---- shared API for the other files ------------------------------------------------------------
  const A = {
    esc, api, errText, toast, money, currency, parseLocal, fmtDate, fmtTime, fmtWhen, ymd, today, pill, bPill, vPill, skel, empty, btn, F, formValues, panelForm,
    panel, rerender, closePanel, confirmBox, compressImage, pickFiles, mediaUrls, fillMedia, loadContext, ctx, sectionName, vehicleName, publicUrl,
    sectionOptions, vehicleOptions, B_STATUS, V_STATUS, show, refresh, openVehicle, DP,
    actions: {
      "ov-range": b => { S.ovr.range = +b.dataset.d; refresh(); },
      "ov-retry": () => refresh(),
      "go-profile": () => show("profile"),
      "go-fleet": () => show("fleet"),
      "go-pending": () => show("bookings", { status: "pending" }),
      "go-confirmed": () => show("bookings", { status: "confirmed" }),
      "go-today": () => { const d = ymd(today()); show("bookings", { status: "open", from: d, to: d }); },
      "copy-url": async () => { try { await navigator.clipboard.writeText(publicUrl()); toast("Link copied"); } catch (_) { toast("Could not copy the link.", false); } },
      "open-booking": b => A.openBooking?.(b.dataset.id),
      "open-vehicle": b => openVehicle(b.dataset.id),
      "vehicle-new": () => newVehicle(),
      "section-new": () => openSection(null),
      "section-edit": b => openSection((S.ctx.sections || []).find(s => s.id === b.dataset.id)),
      "section-up": b => moveSection(+b.dataset.i, -1),
      "section-down": b => moveSection(+b.dataset.i, 1)
    },
    register(key, view) { VIEWS[key] = view; }
  };

  global.TriplemDriveApp = Object.freeze({ open, close, register: A.register, A, isOpen: () => !!(S.root && !S.root.hidden) });
})(window);
