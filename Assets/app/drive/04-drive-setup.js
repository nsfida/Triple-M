/* Triplem Drive - Rates, Routes, Business Page (public branding, publishing) and Booking Form. */
(function (global) {
  "use strict";
  const app = global.TriplemDriveApp;
  if (!app) return;
  const A = app.A;
  const { esc, api, errText, toast, pill, skel, empty, btn, F, formValues, panelForm, panel, closePanel, confirmBox, money } = A;
  const pbtn = (act, label, icon, o) => btn(act, label, icon, o).replace("data-td-act=", "data-dp-act=");

  // ---- Rates -----------------------------------------------------------------------------------
  const RATE_TYPES = [["per_trip", "Per trip"], ["hourly", "Hourly"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["route", "Route"], ["custom_quote", "Custom quote"]];
  const rateType = t => (RATE_TYPES.find(x => x[0] === t) || [t, t])[1];
  const UNIT = { hourly: "hours", daily: "days", weekly: "weeks", monthly: "months", per_trip: "trips", route: "trips", custom_quote: "" };
  const appliesTo = r => r.vehicle_id ? `Vehicle: ${A.vehicleName(r.vehicle_id)}` : r.route_id ? `Route: ${routeName(r.route_id)}` : r.section_id ? `Section: ${A.sectionName(r.section_id)}` : "All vehicles";
  const routeName = id => { const r = (A.ctx().routes || []).find(x => x.id === id); return r ? `${r.pickup} → ${r.destination}` : ""; };

  app.register("rates", {
    render(el) {
      const list = A.ctx().rates || [];
      el.innerHTML = `<div class="td-toolbar"><p class="td-muted">Prices in ${esc(A.currency())} (change the currency in Business Page). A vehicle without a public price shows <b>Request a Quote</b>. Payments are not taken online.</p>${btn("rate-new", "Add rate", "fa-plus", { primary: true })}</div>
        ${list.length ? `<ul class="td-list">${list.map(r => `<li class="td-list-row is-click" data-td-act="rate-edit" data-id="${esc(r.id)}" role="button" tabindex="0">
          <span class="td-list-ico" aria-hidden="true"><i class="fa-solid fa-tag"></i></span>
          <span class="td-list-main"><b>${esc(r.label)}</b><small>${esc(rateType(r.rate_type))} · ${esc(appliesTo(r))}${r.valid_from || r.valid_to ? ` · ${esc(r.valid_from || "…")} – ${esc(r.valid_to || "…")}` : ""}</small></span>
          <span class="td-list-meta"><b>${r.rate_type === "custom_quote" ? "Quote" : esc(money(r.amount))}</b><small>${r.is_public ? "Public" : "Private"}${r.active ? "" : " · inactive"}</small></span></li>`).join("")}</ul>`
          : empty("fa-tags", "No rates yet", "Add per-trip, hourly, daily, weekly, monthly or route prices, or a custom quote.")}`;
    }
  });
  function openRate(r) {
    const c = A.ctx();
    panel({
      tabs: [["main", r ? "Rate" : "New rate", "fa-solid fa-tag"]], tab: "main", state: {},
      head: () => ({ title: r ? r.label : "Add rate", icon: "fa-tags", sub: `Rates · ${esc(A.currency())}`, pills: [] }),
      render: () => `<form class="td-pform"><div class="td-fgrid">
          ${F.text("label", "Name", r?.label, { req: true, max: 80, ph: "e.g. Daily rental", wide: true })}
          ${F.select("rate_type", "Type", r?.rate_type || "daily", RATE_TYPES)}
          ${F.num("amount", `Amount (${A.currency()})`, r?.amount, { min: 0, hint: "Leave empty for Custom quote." })}
          ${F.select("vehicle_id", "Vehicle", r?.vehicle_id || "", A.vehicleOptions("Any vehicle"))}
          ${F.select("section_id", "Fleet section", r?.section_id || "", A.sectionOptions("Any section"))}
          ${F.select("route_id", "Route", r?.route_id || "", [["", "No route"], ...(c.routes || []).map(x => [x.id, `${x.pickup} → ${x.destination}`])])}
          <span></span>
          ${F.num("min_duration", "Minimum duration", r?.min_duration, { step: 1, hint: "In the rate's unit (hours, days…)" })}${F.num("max_duration", "Maximum duration", r?.max_duration, { step: 1 })}
          ${F.text("valid_from", "Valid from", r?.valid_from, { type: "date" })}${F.text("valid_to", "Valid until", r?.valid_to, { type: "date" })}
          ${F.area("extras", "Extras (public)", r?.extras, { rows: 2, max: 600, ph: "e.g. Child seat 25 · Extra driver 50" })}
          ${F.area("notes", "Notes (private)", r?.notes, { rows: 2, max: 600 })}
        </div><div class="td-switches">${F.sw("is_public", "Show on the public page", r ? r.is_public : true)}${F.sw("active", "Active", r ? r.active : true)}</div></form>
        <div class="td-pfoot">${r ? pbtn("rate-delete", "Delete", "fa-trash", { danger: true }) : "<span></span>"}${pbtn("rate-save", "Save", "fa-check", { primary: true })}</div>`,
      actions: {
        "rate-save": async () => {
          const d = formValues(panelForm());
          if (!d.label) throw new Error("Enter a name for the rate.");
          await api("app_drive_rate_save", { p: { id: r?.id || null, ...d } });
          closePanel(); await A.loadContext(); A.refresh(); toast("Rate saved");
        },
        "rate-delete": async () => {
          if (!(await confirmBox(`Delete the rate "${r.label}"?`, { title: "Delete rate?", ok: "Delete", danger: true }))) return;
          await api("app_drive_rate_delete", { p_id: r.id }); closePanel(); await A.loadContext(); A.refresh(); toast("Rate deleted");
        }
      }
    });
  }
  A.actions["rate-new"] = () => openRate(null);
  A.actions["rate-edit"] = b => openRate((A.ctx().rates || []).find(r => r.id === b.dataset.id));

  // ---- Routes ----------------------------------------------------------------------------------
  app.register("routes", {
    render(el) {
      const list = A.ctx().routes || [];
      el.innerHTML = `<div class="td-toolbar"><p class="td-muted">Common trips such as airport transfers. Distance and duration are entered by you.</p>${btn("route-new", "Add route", "fa-plus", { primary: true })}</div>
        ${list.length ? `<ul class="td-list">${list.map(r => `<li class="td-list-row is-click" data-td-act="route-edit" data-id="${esc(r.id)}" role="button" tabindex="0">
          <span class="td-list-ico" aria-hidden="true"><i class="fa-solid fa-route"></i></span>
          <span class="td-list-main"><b>${esc(r.pickup)} → ${esc(r.destination)}</b><small>${esc([(r.stops || []).length ? `via ${r.stops.join(", ")}` : "", r.distance_km ? `${r.distance_km} km` : "", r.duration_min ? `${r.duration_min} min` : "", r.vehicle_id ? A.vehicleName(r.vehicle_id) : r.section_id ? A.sectionName(r.section_id) : ""].filter(Boolean).join(" · ") || "—")}</small></span>
          <span class="td-list-meta"><b>${r.price != null ? esc(money(r.price)) : "Quote"}</b><small>${r.is_public ? "Public" : "Private"}${r.active ? "" : " · inactive"}</small></span></li>`).join("")}</ul>`
          : empty("fa-route", "No routes yet", "Add the trips you offer, e.g. Airport → City Centre.")}`;
    }
  });
  function openRoute(r) {
    panel({
      tabs: [["main", r ? "Route" : "New route", "fa-solid fa-route"]], tab: "main", state: {},
      head: () => ({ title: r ? `${r.pickup} → ${r.destination}` : "Add route", icon: "fa-route", sub: "Routes", pills: [] }),
      render: () => `<form class="td-pform"><div class="td-fgrid">
          ${F.text("pickup", "Pickup", r?.pickup, { req: true, max: 120 })}${F.text("destination", "Destination", r?.destination, { req: true, max: 120 })}
          ${F.area("stops", "Stops (one per line)", (r?.stops || []).join("\n"), { rows: 2, max: 1300 })}
          ${F.num("distance_km", "Distance (km)", r?.distance_km, { step: 0.1 })}${F.num("duration_min", "Duration (minutes)", r?.duration_min, { step: 1 })}
          ${F.num("price", `Price (${A.currency()})`, r?.price, { hint: "Leave empty to show Request a Quote." })}
          ${F.select("vehicle_id", "Vehicle", r?.vehicle_id || "", A.vehicleOptions("Any vehicle"))}
          ${F.select("section_id", "Fleet section", r?.section_id || "", A.sectionOptions("Any section"))}
          ${F.area("notes", "Notes (private)", r?.notes, { rows: 2, max: 1000 })}
        </div><div class="td-switches">${F.sw("is_public", "Show on the public page", r ? r.is_public : true)}${F.sw("active", "Active", r ? r.active : true)}</div></form>
        <div class="td-pfoot">${r ? pbtn("route-delete", "Delete", "fa-trash", { danger: true }) : "<span></span>"}${pbtn("route-save", "Save", "fa-check", { primary: true })}</div>`,
      actions: {
        "route-save": async () => {
          const d = formValues(panelForm());
          if (!d.pickup || !d.destination) throw new Error("Enter the pickup and the destination.");
          d.stops = d.stops.split(/\n+/).map(s => s.trim()).filter(Boolean);
          await api("app_drive_route_save", { p: { id: r?.id || null, ...d } });
          closePanel(); await A.loadContext(); A.refresh(); toast("Route saved");
        },
        "route-delete": async () => {
          if (!(await confirmBox(`Delete the route ${r.pickup} → ${r.destination}? A route used by bookings is switched off instead.`, { title: "Delete route?", ok: "Delete", danger: true }))) return;
          const res = await api("app_drive_route_delete", { p_id: r.id }); closePanel(); await A.loadContext(); A.refresh(); toast(res?.archived ? "Route has bookings: switched off instead" : "Route deleted");
        }
      }
    });
  }
  A.actions["route-new"] = () => openRoute(null);
  A.actions["route-edit"] = b => openRoute((A.ctx().routes || []).find(r => r.id === b.dataset.id));

  // ---- Business Page (public branding) -----------------------------------------------------------
  const SOCIAL = [["website", "Website", "fa-globe"], ["instagram", "Instagram", "fa-brands fa-instagram"], ["facebook", "Facebook", "fa-brands fa-facebook"], ["x", "X", "fa-brands fa-x-twitter"], ["tiktok", "TikTok", "fa-brands fa-tiktok"], ["youtube", "YouTube", "fa-brands fa-youtube"], ["linkedin", "LinkedIn", "fa-brands fa-linkedin"]];
  const CURRENCIES = ["AED", "SAR", "QAR", "OMR", "KWD", "BHD", "USD", "EUR", "GBP", "PKR", "INR"];
  function zones(cur) {
    let list = [];
    try { list = Intl.supportedValuesOf("timeZone"); } catch (_) { list = ["UTC", "Asia/Dubai", "Asia/Riyadh", "Asia/Karachi", "Asia/Kolkata", "Europe/London"]; }
    if (cur && !list.includes(cur)) list.unshift(cur);
    return list.map(z => [z, z]);
  }
  app.register("profile", {
    render(el) {
      const f = A.ctx().fleet;
      const tz = f.profile_saved ? f.timezone : (Intl.DateTimeFormat().resolvedOptions().timeZone || f.timezone);
      const curList = [...new Set([f.currency, ...CURRENCIES])];
      el.innerHTML = `
        <section class="td-card td-publish">
          <div class="td-publish-main">
            <span class="td-publish-ico ${f.published ? "is-on" : ""}"><i class="fa-solid ${f.published ? "fa-globe" : "fa-eye-slash"}" aria-hidden="true"></i></span>
            <div><b>${f.published ? "Your public page is published" : "Your public page is not published"}</b>
              <a href="${esc(A.publicUrl())}" target="_blank" rel="noopener">${esc(A.publicUrl().replace(/^https?:\/\//, ""))}</a>
              <small>${f.published ? "Customers can see your public vehicles and send booking requests." : "Only you can preview it. Search engines are told not to index it."}</small></div>
          </div>
          <div class="td-actions">${btn("copy-url", "Copy link", "fa-regular fa-copy")}${btn("preview-public", "Preview", "fa-eye")}${btn(f.published ? "unpublish" : "publish", f.published ? "Unpublish" : "Publish", f.published ? "fa-eye-slash" : "fa-globe", { primary: !f.published })}</div>
        </section>
        <form class="td-form" data-profile novalidate>
          <section class="td-card"><h2>Branding</h2>
            <div class="td-brandrow">
              <div class="td-logo-box"><span class="td-logo-prev">${f.logo ? `<img data-td-media="${esc(f.logo)}" alt="Business logo">` : `<b>${esc((f.business_name || "T").trim().charAt(0).toUpperCase())}</b>`}</span>
                <div><b>Public logo</b><small>PNG, JPG or WebP. Shown as uploaded (proportions kept). Without a logo the business name is shown.</small>
                  <div class="td-actions">${btn("logo-upload", f.logo ? "Replace" : "Upload logo", "fa-upload")}${f.logo ? btn("logo-remove", "Remove", "fa-trash", { danger: true }) : ""}</div></div></div>
              <div class="td-logo-box is-banner"><span class="td-banner-prev">${f.banner ? `<img data-td-media="${esc(f.banner)}" alt="Banner">` : `<i class="fa-regular fa-image"></i>`}</span>
                <div><b>Banner image</b><small>Wide photo at the top of the public page (optional).</small>
                  <div class="td-actions">${btn("banner-upload", f.banner ? "Replace" : "Upload banner", "fa-upload")}${f.banner ? btn("banner-remove", "Remove", "fa-trash", { danger: true }) : ""}</div></div></div>
            </div>
            <div class="td-fgrid">
              ${F.text("business_name", "Public business name", f.business_name, { req: true, max: 80, hint: "Shown on your public page and in its title. Your Triplem VIP account name does not change." })}
              ${F.text("tagline", "Tagline", f.tagline, { max: 140, ph: "e.g. Luxury cars and airport transfers in Dubai" })}
              ${F.area("description", "About your business", f.description, { rows: 4 })}
            </div>
          </section>
          <section class="td-card"><h2>Contact</h2><div class="td-fgrid">
              ${F.text("phone", "Phone", f.phone, { type: "tel", max: 40 })}${F.text("whatsapp", "WhatsApp", f.whatsapp, { type: "tel", max: 40, hint: "With country code, e.g. +971 50 123 4567" })}
              ${F.text("email", "Email", f.email, { type: "email", max: 160 })}${F.text("hours", "Business hours", f.hours, { max: 300, ph: "e.g. Every day 8:00–22:00" })}
              ${F.area("address", "Address", f.address, { rows: 2, max: 300 })}
              ${F.text("location_url", "Map link", f.location_url, { type: "url", max: 500, ph: "https://maps.google.com/…", wide: true })}
              ${F.area("contact_note", "Contact instructions", f.contact_note, { rows: 2, max: 600, ph: "e.g. We reply on WhatsApp within 30 minutes." })}
          </div></section>
          <section class="td-card"><h2>Social links</h2><div class="td-fgrid">
              ${SOCIAL.map(([k, label]) => F.text(`social_${k}`, label, f.social?.[k], { type: "url", max: 300, ph: "https://" })).join("")}
          </div></section>
          <section class="td-card"><h2>Terms and cancellation</h2><div class="td-fgrid">
              ${F.area("terms", "Terms and conditions", f.terms, { rows: 5, max: 6000 })}
              ${F.area("cancellation_policy", "Cancellation policy", f.cancellation_policy, { rows: 3, max: 3000 })}
          </div></section>
          <section class="td-card"><h2>Bookings</h2><div class="td-fgrid">
              ${F.select("currency", "Currency", f.currency, curList.map(c => [c, c]))}
              ${F.select("timezone", "Time zone", tz, zones(tz), { hint: "Dates and times of bookings are in this time zone." })}
              ${F.num("default_trip_hours", "Default trip length (hours)", f.default_trip_hours, { min: 1, max: 72, step: 1, hint: "Used when a request has a pickup time but no return." })}
            </div>
            <div class="td-switches">${F.sw("auto_confirm", "Confirm requests automatically", f.auto_confirm, "Requests for a specific, free vehicle are confirmed at once. Otherwise every request waits for you (Pending).")}</div>
          </section>
          <div class="td-savebar">${btn("profile-save", "Save business page", "fa-check", { primary: true })}</div>
        </form>`;
      A.fillMedia(el);
    }
  });
  async function saveProfile() {
    const d = formValues(document.querySelector(".td-app form[data-profile]"));
    if (!d.business_name) throw new Error("Enter the public business name.");
    const social = {};
    SOCIAL.forEach(([k]) => { if (d[`social_${k}`]) social[k] = d[`social_${k}`]; delete d[`social_${k}`]; });
    await api("app_drive_profile_save", { p: { ...d, social } });
    await A.loadContext(); A.refresh(); toast("Business page saved");
  }
  async function uploadBrand(kind) {
    const [file] = await A.pickFiles(); if (!file) return;
    toast("Uploading…");
    const img = await A.compressImage(file, kind === "logo" ? { max: 800, thumb: 320, keepAlpha: true } : { max: 1920, thumb: 640 });
    await api("app_drive_media_add", { p_kind: kind, p_vehicle_id: null, p_mime: img.mime, p_width: img.width, p_height: img.height, p_data: img.data, p_thumb: img.thumb });
    await A.loadContext(); A.refresh(); toast(kind === "logo" ? "Logo saved" : "Banner saved");
  }
  async function removeBrand(kind) {
    if (!(await confirmBox(kind === "logo" ? "Remove the logo? The public page shows the business name instead." : "Remove the banner image?", { title: "Remove image?", ok: "Remove", danger: true }))) return;
    await api("app_drive_brand_remove", { p_kind: kind });
    await A.loadContext(); A.refresh(); toast("Removed");
  }
  Object.assign(A.actions, {
    "profile-save": () => saveProfile(),
    "logo-upload": () => uploadBrand("logo"), "banner-upload": () => uploadBrand("banner"),
    "logo-remove": () => removeBrand("logo"), "banner-remove": () => removeBrand("banner"),
    "preview-public": async () => {
      const u = A.publicUrl(); if (!u) return;
      if (A.ctx().fleet.published) { global.open(u, "_blank", "noopener"); return; }
      // Not published yet: a 30-minute preview link that only works for this page.
      const w = global.open("about:blank", "_blank");
      try { const r = await api("app_drive_preview_link", {}); if (w) { w.opener = null; w.location.href = `${u}?preview=${encodeURIComponent(r.token)}`; } }
      catch (e) { try { w?.close(); } catch (_) {} throw e; }
    },
    "publish": async () => {
      if (!(A.ctx().vehicles || []).some(v => v.is_public) && !(await confirmBox("None of your vehicles is shown on the public page yet. Publish anyway?", { title: "Publish?", ok: "Publish" }))) return;
      await api("app_drive_publish", { p_published: true }); await A.loadContext(); A.refresh(); toast("Public page published");
    },
    "unpublish": async () => {
      if (!(await confirmBox("Unpublish the public page? Visitors will see that bookings are not available. Your data is kept.", { title: "Unpublish?", ok: "Unpublish", danger: true }))) return;
      await api("app_drive_publish", { p_published: false }); await A.loadContext(); A.refresh(); toast("Public page unpublished");
    }
  });

  // ---- Booking form settings ----------------------------------------------------------------------
  let FS = null;
  app.register("form", {
    render(el) {
      const form = A.ctx().fleet.form;
      FS = { fields: form.fields.map(x => ({ ...x })), questions: (form.questions || []).map(q => ({ ...q, choices: [...(q.choices || [])] })), success: form.success_message };
      paint(el);
    }
  });
  function paint(el) {
    el = el || document.querySelector(".td-app .td-view-form");
    if (!el) return;
    const n = FS.fields.length;
    el.innerHTML = `
      <section class="td-card"><h2>Fields</h2><p class="td-muted">Choose which fields customers fill in, their names and order. Name, mobile and pickup date are always asked. Everything is checked again on the server.</p>
        <div class="td-ftable">${FS.fields.map((f, i) => `
          <div class="td-frow${f.enabled ? "" : " is-off"}" data-i="${i}">
            <span class="td-frow-move"><button type="button" class="td-icon-btn" data-td-act="ff-up" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move up"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="td-icon-btn" data-td-act="ff-down" data-i="${i}" ${i === n - 1 ? "disabled" : ""} aria-label="Move down"><i class="fa-solid fa-arrow-down"></i></button></span>
            <label class="td-frow-label"><small>${esc(f.key.replace(/_/g, " "))}${f.essential ? " · always asked" : ""}</small><input value="${esc(f.label)}" maxlength="60" data-ff-label="${i}" aria-label="Label"></label>
            <label class="td-mini-sw"><input type="checkbox" data-ff-enabled="${i}"${f.enabled ? " checked" : ""}${f.essential ? " disabled" : ""}><span>Shown</span></label>
            <label class="td-mini-sw"><input type="checkbox" data-ff-required="${i}"${f.required ? " checked" : ""}${f.essential ? " disabled" : ""}><span>Required</span></label>
            ${["pickup", "destination", "notes"].includes(f.key) ? `<label class="td-frow-def"><small>Default</small><input value="${esc(f.default || "")}" maxlength="120" data-ff-default="${i}" aria-label="Default value"></label>` : "<span></span>"}
          </div>`).join("")}</div>
      </section>
      <section class="td-card"><h2>Custom questions</h2><p class="td-muted">Up to 12 extra questions, e.g. "Child seat needed?" or "Flight number".</p>
        ${FS.questions.map((q, i) => `<div class="td-qrow">
            <input value="${esc(q.label)}" maxlength="120" placeholder="Question" data-q-label="${i}" aria-label="Question">
            <select data-q-type="${i}" aria-label="Answer type">${[["text", "Short text"], ["textarea", "Long text"], ["number", "Number"], ["select", "Choice"], ["checkbox", "Yes / No"]].map(([v, t]) => `<option value="${v}"${q.type === v ? " selected" : ""}>${t}</option>`).join("")}</select>
            <label class="td-mini-sw"><input type="checkbox" data-q-required="${i}"${q.required ? " checked" : ""}><span>Required</span></label>
            <button type="button" class="td-icon-btn is-danger" data-td-act="q-del" data-i="${i}" aria-label="Remove question"><i class="fa-solid fa-trash"></i></button>
            ${q.type === "select" ? `<input class="td-qchoices" value="${esc((q.choices || []).join(", "))}" placeholder="Choices, separated by commas" data-q-choices="${i}" aria-label="Choices">` : ""}
          </div>`).join("")}
        ${FS.questions.length < 12 ? btn("q-add", "Add question", "fa-plus") : ""}
      </section>
      <section class="td-card"><h2>Message after sending</h2>
        <div class="td-fgrid">${F.area("success_message", "Shown to the customer", FS.success, { rows: 2, max: 400 }).replace('name="success_message"', 'name="success_message" data-ff-success')}</div>
        <small class="td-muted">Requests confirmed automatically show "Your booking is confirmed" with the reference instead.</small>
      </section>
      <div class="td-savebar">${btn("ff-save", "Save booking form", "fa-check", { primary: true })}</div>`;
    el.oninput = el.onchange = e => {
      const t = e.target, d = t.dataset;
      if (d.ffLabel !== undefined) FS.fields[+d.ffLabel].label = t.value;
      else if (d.ffDefault !== undefined) FS.fields[+d.ffDefault].default = t.value;
      else if (d.ffEnabled !== undefined) { FS.fields[+d.ffEnabled].enabled = t.checked; t.closest(".td-frow").classList.toggle("is-off", !t.checked); }
      else if (d.ffRequired !== undefined) FS.fields[+d.ffRequired].required = t.checked;
      else if (d.qLabel !== undefined) FS.questions[+d.qLabel].label = t.value;
      else if (d.qType !== undefined && e.type === "change") { FS.questions[+d.qType].type = t.value; paint(); }
      else if (d.qRequired !== undefined) FS.questions[+d.qRequired].required = t.checked;
      else if (d.qChoices !== undefined) FS.questions[+d.qChoices].choices = t.value.split(",").map(s => s.trim()).filter(Boolean);
      else if (d.ffSuccess !== undefined) FS.success = t.value;
    };
  }
  Object.assign(A.actions, {
    "ff-up": b => { const i = +b.dataset.i; [FS.fields[i - 1], FS.fields[i]] = [FS.fields[i], FS.fields[i - 1]]; paint(); },
    "ff-down": b => { const i = +b.dataset.i; [FS.fields[i + 1], FS.fields[i]] = [FS.fields[i], FS.fields[i + 1]]; paint(); },
    "q-add": () => { FS.questions.push({ id: `q${Date.now().toString(36)}`, label: "", type: "text", required: false, choices: [] }); paint(); },
    "q-del": b => { FS.questions.splice(+b.dataset.i, 1); paint(); },
    "ff-save": async () => {
      const fields = {};
      FS.fields.forEach((f, i) => { fields[f.key] = { label: f.label, enabled: f.enabled, required: f.enabled && f.required, order: (i + 1) * 10, default: f.default || "", choices: f.choices || [] }; });
      if (FS.questions.some(q => !q.label.trim())) throw new Error("Every custom question needs a label.");
      await api("app_drive_form_save", { p: { fields, questions: FS.questions, success_message: FS.success } });
      await A.loadContext(); A.refresh(); toast("Booking form saved");
    }
  });
})(window);
