/* Triplem Drive - Bookings, booking details, Availability calendar and blocks, Customers, Drivers. */
(function (global) {
  "use strict";
  const app = global.TriplemDriveApp;
  if (!app) return;
  const A = app.A;
  const { esc, api, errText, toast, pill, bPill, skel, empty, btn, F, formValues, panelForm, panel, rerender, closePanel, confirmBox, fmtDate, fmtTime, fmtWhen, ymd, today, parseLocal } = A;
  const pbtn = (act, label, icon, o) => btn(act, label, icon, o).replace("data-td-act=", "data-dp-act=");
  const waDigits = m => String(m || "").replace(/[^\d]/g, "");
  // Places picked on the map on the public page end with "· lat,lng": show the place and a map link.
  const placeHtml = t => {
    const m = String(t || "").match(/^(.*?)\s*·\s*(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)\s*$/);
    if (!m) return esc(t || "—");
    return `<span class="td-place">${esc(m[1] || "Pinned location")}<a href="https://www.google.com/maps?q=${esc(m[2])},${esc(m[3])}" target="_blank" rel="noopener"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i> Map</a></span>`;
  };

  // ---- Bookings list ----------------------------------------------------------------------------
  const STATUS_CHIPS = [["open", "Open"], ["pending", "Pending"], ["confirmed", "Confirmed"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["rejected", "Rejected"], ["no_show", "No Show"], ["", "All"]];
  const SORTS = [["submitted_desc", "Newest requests"], ["submitted_asc", "Oldest requests"], ["start_asc", "Trip date (soonest)"], ["start_desc", "Trip date (latest)"]];
  let BS = null;
  app.register("bookings", {
    render(el, _A, opts) {
      if (!BS || opts.status !== undefined || opts.from) BS = { q: "", status: opts.status ?? "open", vehicle: "", from: opts.from || "", to: opts.to || "", sort: opts.from ? "start_asc" : "submitted_desc", page: 0, size: 25, total: 0, rows: [] };
      el.innerHTML = `
        <div class="td-chips" role="radiogroup" aria-label="Status">${STATUS_CHIPS.map(([k, t]) => `<button type="button" role="radio" aria-checked="${BS.status === k}" data-td-act="bk-status" data-s="${k}">${esc(t)}</button>`).join("")}</div>
        <div class="td-toolbar">
          <label class="td-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Reference, customer, mobile, email, place or vehicle" value="${esc(BS.q)}" data-bk-q aria-label="Search bookings"></label>
          <select data-bk-vehicle aria-label="Vehicle">${A.vehicleOptions("All vehicles").map(([v, t]) => `<option value="${esc(v)}"${BS.vehicle === v ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>
          <label class="td-date"><span>From</span><input type="date" value="${esc(BS.from)}" data-bk-from></label>
          <label class="td-date"><span>To</span><input type="date" value="${esc(BS.to)}" data-bk-to></label>
          <select data-bk-sort aria-label="Sort">${SORTS.map(([v, t]) => `<option value="${v}"${BS.sort === v ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>
        </div>
        <div data-bk-list>${skel(8)}</div>`;
      let tm = 0;
      el.querySelector("[data-bk-q]").addEventListener("input", e => { clearTimeout(tm); tm = setTimeout(() => { BS.q = e.target.value.trim(); BS.page = 0; load(); }, 260); });
      el.querySelector("[data-bk-vehicle]").addEventListener("change", e => { BS.vehicle = e.target.value; BS.page = 0; load(); });
      el.querySelector("[data-bk-from]").addEventListener("change", e => { BS.from = e.target.value; BS.page = 0; load(); });
      el.querySelector("[data-bk-to]").addEventListener("change", e => { BS.to = e.target.value; BS.page = 0; load(); });
      el.querySelector("[data-bk-sort]").addEventListener("change", e => { BS.sort = e.target.value; BS.page = 0; load(); });
      async function load() {
        const box = el.querySelector("[data-bk-list]");
        if (!box) return;
        box.classList.add("is-busy");
        try {
          const r = await api("app_drive_bookings_list", { p: { q: BS.q, status: BS.status, vehicle_id: BS.vehicle, from: BS.from, to: BS.to, sort: BS.sort, limit: BS.size, offset: BS.page * BS.size } });
          BS.rows = r.rows || []; BS.total = r.total || 0;
          paint();
        } catch (e) { box.innerHTML = empty("fa-triangle-exclamation", "Bookings could not be loaded", errText(e)); }
        box.classList.remove("is-busy");
      }
      function paint() {
        const box = el.querySelector("[data-bk-list]");
        if (!BS.rows.length) {
          box.innerHTML = empty("fa-calendar-check", BS.q || BS.vehicle || BS.from || BS.to || BS.status !== "open" ? "No bookings match" : "No open bookings", "Booking requests from your public page and bookings you add appear here.", btn("new-booking", "New booking", "fa-plus", { primary: true }));
          return;
        }
        const pages = Math.max(1, Math.ceil(BS.total / BS.size));
        box.innerHTML = `<div class="td-table-wrap"><table class="td-table">
            <thead><tr><th>Reference</th><th>Customer</th><th>Mobile</th><th>Vehicle</th><th>Pickup → Destination</th><th>Date</th><th>Time</th><th>Submitted</th><th>Status</th></tr></thead>
            <tbody>${BS.rows.map(b => `<tr data-td-act="open-booking" data-id="${esc(b.id)}" tabindex="0">
              <td class="td-mono">${esc(b.reference)}</td>
              <td><b>${esc(b.customer_name)}</b>${b.customer_email ? `<small>${esc(b.customer_email)}</small>` : ""}</td>
              <td>${esc(b.customer_mobile)}</td>
              <td>${esc(b.vehicle_name || "Any vehicle")}</td>
              <td>${esc([b.pickup, b.destination].filter(Boolean).join(" → ") || b.route_name || "—")}${b.route_name && (b.pickup || b.destination) && b.route_name !== [b.pickup, b.destination].filter(Boolean).join(" → ") ? `<small>${esc(b.route_name)}</small>` : ""}</td>
              <td>${esc(fmtDate(b.start_at))}</td><td>${b.pickup_time_set ? esc(fmtTime(b.start_at)) : "—"}</td>
              <td><small>${esc(fmtWhen(b.submitted_at))}</small></td><td>${bPill(b.status)}</td></tr>`).join("")}</tbody></table></div>
          <ul class="td-bcards">${BS.rows.map(b => `<li class="td-bcard" data-td-act="open-booking" data-id="${esc(b.id)}" role="button" tabindex="0">
              <div><b>${esc(b.customer_name)}</b>${bPill(b.status)}</div>
              <small><span class="td-mono">${esc(b.reference)}</span> · ${esc(b.vehicle_name || "Any vehicle")}</small>
              <small><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${esc(fmtDate(b.start_at))}${b.pickup_time_set ? " · " + esc(fmtTime(b.start_at)) : ""}${b.pickup || b.destination ? " · " + esc([b.pickup, b.destination].filter(Boolean).join(" → ")) : ""}</small></li>`).join("")}</ul>
          <div class="td-pager"><span>${BS.page * BS.size + 1}–${BS.page * BS.size + BS.rows.length} of ${BS.total}</span>
            <span>${btn("bk-prev", "Previous", "fa-chevron-left", { disabled: BS.page === 0 })}<b>${BS.page + 1} / ${pages}</b>${btn("bk-next", "Next", "fa-chevron-right", { disabled: BS.page + 1 >= pages })}</span></div>`;
      }
      A.actions["bk-status"] = b => { BS.status = b.dataset.s; BS.page = 0; el.querySelectorAll("[data-td-act='bk-status']").forEach(x => x.setAttribute("aria-checked", String(x === b))); load(); };
      A.actions["bk-prev"] = () => { BS.page = Math.max(0, BS.page - 1); load(); };
      A.actions["bk-next"] = () => { BS.page++; load(); };
      A.bookingsReload = load;
      load();
      if (opts.booking) openBooking(opts.booking);
    }
  });
  const reloadLists = () => { try { A.bookingsReload?.(); } catch (_) {} };

  // ---- Booking details -----------------------------------------------------------------------------
  function detailsText(b) {
    const f = A.ctx().fleet;
    const lines = [
      "TRIPLEM DRIVE — BOOKING DETAILS",
      `Business: ${f.business_name}`,
      `Reference: ${b.reference}`,
      `Status: ${(A.B_STATUS[b.status] || [b.status])[0]}`,
      "",
      `Customer: ${b.customer_name}`,
      `Mobile: ${b.customer_mobile}`,
      b.customer_email ? `Email: ${b.customer_email}` : "",
      "",
      `Vehicle: ${b.vehicle_name || "Any vehicle"}`,
      b.route_name ? `Route: ${b.route_name}` : "",
      b.pickup ? `Pickup: ${b.pickup}` : "",
      b.destination ? `Destination: ${b.destination}` : "",
      `Pickup date: ${fmtDate(b.start_at)}${b.pickup_time_set ? " " + fmtTime(b.start_at) : ""}`,
      `Return: ${fmtDate(b.end_at)} ${fmtTime(b.end_at)}`,
      b.passengers ? `Passengers: ${b.passengers}` : "",
      b.driver_name ? `Driver: ${b.driver_name}${b.driver_mobile ? " (" + b.driver_mobile + ")" : ""}` : "",
      ...(b.answers || []).map(a => `${a.label}: ${a.answer}`),
      b.customer_notes ? `Notes: ${b.customer_notes}` : "",
      "",
      `Submitted: ${fmtWhen(b.submitted_at)}`
    ];
    return lines.filter((l, i, a) => l !== "" || (a[i - 1] !== "" && i < a.length - 1)).join("\n");
  }
  function customerMessage(b) {
    const f = A.ctx().fleet;
    const st = b.status === "confirmed" ? "is confirmed" : b.status === "pending" ? "has been received" : `is ${(A.B_STATUS[b.status] || [b.status])[0].toLowerCase()}`;
    return `Hello ${b.customer_name},\n\nYour booking ${b.reference} with ${f.business_name} ${st}.\n\nVehicle: ${b.vehicle_name || "To be confirmed"}\nPickup: ${fmtDate(b.start_at)}${b.pickup_time_set ? " " + fmtTime(b.start_at) : ""}${b.pickup ? "\nFrom: " + b.pickup : ""}${b.destination ? "\nTo: " + b.destination : ""}${b.driver_name && b.status === "confirmed" ? "\nDriver: " + b.driver_name + (b.driver_mobile ? " (" + b.driver_mobile + ")" : "") : ""}\n\nThank you,\n${f.business_name}`;
  }
  const NEXT = {
    pending: [["confirmed", "Confirm", "fa-circle-check", true], ["rejected", "Reject", "fa-ban"], ["cancelled", "Cancel", "fa-circle-xmark"]],
    confirmed: [["completed", "Complete", "fa-flag-checkered", true], ["no_show", "No show", "fa-user-slash"], ["cancelled", "Cancel", "fa-circle-xmark"]],
    rejected: [["pending", "Reopen", "fa-rotate-left"]], cancelled: [["pending", "Reopen", "fa-rotate-left"]],
    completed: [["confirmed", "Back to confirmed", "fa-rotate-left"]], no_show: [["confirmed", "Back to confirmed", "fa-rotate-left"]]
  };

  function openBooking(id, tab = "details") {
    const st = { b: null, err: "", busy: "" };
    const load = async () => { try { st.b = await api("app_drive_booking_get", { p_id: id }); st.err = ""; } catch (e) { st.err = errText(e); } rerender(); };
    panel({
      tabs: [["details", "Details", "fa-solid fa-circle-info"], ["edit", "Edit", "fa-solid fa-pen"], ["history", "History", "fa-solid fa-clock-rotate-left"]], tab, state: st,
      head: () => ({ title: st.b ? st.b.reference : "Booking", icon: "fa-calendar-check", sub: st.b ? esc(`${st.b.customer_name} · ${fmtDate(st.b.start_at)}`) : "Triplem Drive",
        pills: st.b ? [bPill(st.b.status), st.b.source === "public" ? pill("Public page", "", "fa-globe") : pill("Added by you", "", "fa-user-pen")] : [] }),
      render(t) {
        if (st.err) return `<div class="aum-note is-bad"><i class="fa-solid fa-triangle-exclamation"></i><div>${esc(st.err)}</div></div>`;
        const b = st.b; if (!b) return skel(8);
        const K = A.DP().kit;
        if (t === "history") return K.section("Status history", `<ol class="td-timeline">${(b.history || []).map(h => `<li><span class="td-tl-dot is-${(A.B_STATUS[h.to] || [, ""])[1] || "plain"}"></span><div><b>${h.from && h.from !== h.to ? `${esc((A.B_STATUS[h.from] || [h.from])[0])} → ` : ""}${esc((A.B_STATUS[h.to] || [h.to || "—"])[0])}</b>${h.note ? `<p>${esc(h.note)}</p>` : ""}<small>${esc(fmtWhen(h.at))} · ${esc(h.by || "")}</small></div></li>`).join("")}</ol>`);
        if (t === "edit") return bookingFormHtml(b) + `<div class="td-pfoot"><span></span>${pbtn("bk-save", "Save changes", "fa-check", { primary: true })}</div>`;
        const wa = waDigits(b.customer_mobile);
        const drivers = (A.ctx().drivers || []).filter(d => d.active || d.id === b.driver_id);
        return `<div class="td-bhero is-${(A.B_STATUS[b.status] || [, ""])[1] || "plain"}"><small>${esc((A.B_STATUS[b.status] || [b.status])[0])}</small><strong>${esc(fmtDate(b.start_at))}${b.pickup_time_set ? " · " + esc(fmtTime(b.start_at)) : ""}</strong><span>${esc(b.vehicle_name || "Any vehicle")}${b.route_name ? " · " + esc(b.route_name) : ""}</span></div>`
          + `<div class="td-pacts">${(NEXT[b.status] || []).map(([s, label, icon, primary]) => pbtn("bk-set", label, icon, { primary: !!primary, danger: ["rejected", "cancelled", "no_show"].includes(s), data: `data-s="${s}"`, disabled: !!st.busy })).join("")}</div>`
          + K.section("Customer", K.kv([["Name", esc(b.customer_name)], ["Mobile", `<a href="tel:${esc(b.customer_mobile)}">${esc(b.customer_mobile)}</a>`], b.customer_email ? ["Email", `<a href="mailto:${esc(b.customer_email)}">${esc(b.customer_email)}</a>`] : null, ["Bookings with you", esc(String(b.customer_bookings || 1))]]))
          + K.section("Trip", K.kv([["Vehicle", esc(b.vehicle_name || "Any vehicle") + (b.vehicle_registration ? ` <small class="td-muted">${esc(b.vehicle_registration)}</small>` : "")], b.route_name ? ["Route", esc(b.route_name)] : null,
              ["Pickup", placeHtml(b.pickup)], ["Destination", placeHtml(b.destination)], ["Pickup date", esc(fmtDate(b.start_at)) + (b.pickup_time_set ? " · " + esc(fmtTime(b.start_at)) : "")],
              ["Return", esc(fmtDate(b.end_at)) + " · " + esc(fmtTime(b.end_at))], b.passengers ? ["Passengers", esc(String(b.passengers))] : null, ["Submitted", esc(fmtWhen(b.submitted_at))]]))
          + ((b.answers || []).length ? K.section("Answers", K.kv(b.answers.map(a => [a.label, `<span dir="auto">${esc(a.answer)}</span>`]))) : "")
          + (b.customer_notes ? K.section("Customer notes", `<p class="td-pre" dir="auto">${esc(b.customer_notes)}</p>`) : "")
          + K.section("Driver", `<div class="td-inline"><select data-bk-driver aria-label="Driver"><option value="">No driver</option>${drivers.map(d => `<option value="${esc(d.id)}"${d.id === b.driver_id ? " selected" : ""}>${esc(d.name)}${d.mobile ? " · " + esc(d.mobile) : ""}</option>`).join("")}</select>${pbtn("bk-driver", b.driver_id ? "Reassign" : "Assign", "fa-id-card")}</div>${drivers.length ? "" : `<small class="td-muted">Add drivers in Drivers.</small>`}`)
          + K.section("Internal notes", `<textarea class="td-notes" data-bk-notes rows="3" maxlength="3000" placeholder="Only you can see these notes">${esc(b.internal_notes || "")}</textarea><div class="td-inline is-end">${pbtn("bk-notes", "Save notes", "fa-floppy-disk")}</div>`)
          + K.section("Contact the customer", `<div class="td-pacts">
              ${pbtn("bk-copy", "Copy details", "fa-regular fa-copy")}
              ${wa.length >= 7 ? `<a class="td-btn" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(customerMessage(b))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>WhatsApp</span></a>` : ""}
              ${b.customer_email ? `<a class="td-btn" href="mailto:${esc(b.customer_email)}?subject=${encodeURIComponent(`${A.ctx().fleet.business_name} · Booking ${b.reference}`)}&body=${encodeURIComponent(customerMessage(b))}"><i class="fa-regular fa-envelope" aria-hidden="true"></i><span>Email draft</span></a>` : ""}
            </div><small class="td-muted">WhatsApp and email open a prepared message in your own app; nothing is sent until you send it there.</small>`);
      },
      actions: {
        "bk-set": async b => {
          const to = b.dataset.s;
          const label = (A.B_STATUS[to] || [to])[0];
          if (["rejected", "cancelled", "no_show"].includes(to) && !(await confirmBox(`Mark ${st.b.reference} as ${label}?`, { title: `${label}?`, ok: label, danger: true }))) return;
          st.busy = to; rerender();
          try { st.b = await api("app_drive_booking_set_status", { p_id: id, p_status: to, p_note: null }); A.DP().toast(`Booking ${label.toLowerCase()}`); reloadLists(); }
          finally { st.busy = ""; rerender(); }
        },
        "bk-driver": async () => {
          const v = A.DP().custom.body().querySelector("[data-bk-driver]").value || null;
          st.b = await api("app_drive_booking_assign", { p_id: id, p_driver_id: v, p_internal_notes: null, p_set_notes: false });
          rerender(); A.DP().toast(v ? "Driver assigned" : "Driver removed"); reloadLists();
        },
        "bk-notes": async () => {
          const v = A.DP().custom.body().querySelector("[data-bk-notes]").value;
          st.b = await api("app_drive_booking_assign", { p_id: id, p_driver_id: st.b.driver_id || null, p_internal_notes: v, p_set_notes: true });
          rerender(); A.DP().toast("Notes saved");
        },
        "bk-copy": async () => { try { await navigator.clipboard.writeText(detailsText(st.b)); A.DP().toast("Booking details copied"); } catch (_) { A.DP().toast("Could not copy.", false); } },
        "bk-save": async () => {
          const p = bookingPayload(panelForm(), st.b);
          st.b = await api("app_drive_booking_save", { p });
          A.DP().toast("Booking saved"); reloadLists(); A.DP().custom.tab("details");
        }
      }
    });
    load();
  }

  // ---- Booking form (new / edit) -----------------------------------------------------------------------
  const splitLocal = v => { const m = String(v || "").match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/); return m ? [m[1], m[2] || ""] : ["", ""]; };
  function bookingFormHtml(b = {}, preset = {}) {
    const c = A.ctx();
    const [sd, stm] = splitLocal(b.start_at); const [ed, etm] = splitLocal(b.end_at);
    return `<form class="td-pform" novalidate><div class="td-fgrid">
      ${F.text("customer_name", "Customer name", b.customer_name, { req: true, max: 80 })}
      ${F.text("customer_mobile", "Mobile", b.customer_mobile, { req: true, max: 40, type: "tel" })}
      ${F.text("customer_email", "Email", b.customer_email, { max: 160, type: "email" })}
      ${F.num("passengers", "Passengers", b.passengers, { min: 1, max: 500, step: 1 })}
      ${F.select("vehicle_id", "Vehicle", b.vehicle_id || preset.vehicle_id || "", A.vehicleOptions("Any vehicle"))}
      ${F.select("route_id", "Route", b.route_id || "", [["", "No route"], ...(c.routes || []).filter(r => r.active || r.id === b.route_id).map(r => [r.id, `${r.pickup} → ${r.destination}`])])}
      ${F.text("pickup", "Pickup location", b.pickup, { max: 200 })}${F.text("destination", "Destination", b.destination, { max: 200 })}
      ${F.text("pickup_date", "Pickup date", sd || preset.date || "", { type: "date", req: true })}${F.text("pickup_time", "Pickup time", b.id ? (b.pickup_time_set ? stm : "") : "", { type: "time" })}
      ${F.text("return_date", "Return date", b.id ? ed : "", { type: "date" })}${F.text("return_time", "Return time", b.id ? etm : "", { type: "time" })}
      ${b.id ? "" : F.select("status", "Status", "pending", [["pending", "Pending"], ["confirmed", "Confirmed (checks availability)"]])}
      ${b.id ? "" : F.area("customer_notes", "Customer notes", "", { rows: 2, max: 2000 })}
      ${F.area("internal_notes", "Internal notes (private)", b.internal_notes, { rows: 2 })}
    </div><p class="td-muted">Without a return date, a booking with a pickup time lasts ${esc(String(c.fleet.default_trip_hours))} hours; without a time it takes the whole day.</p></form>`;
  }
  function bookingPayload(form, b) {
    const d = formValues(form);
    return { id: b?.id || null, customer_name: d.customer_name, customer_mobile: d.customer_mobile, customer_email: d.customer_email, passengers: d.passengers,
      vehicle_id: d.vehicle_id, route_id: d.route_id, driver_id: b?.driver_id || null, pickup: d.pickup, destination: d.destination,
      pickup_date: d.pickup_date, pickup_time: d.pickup_time, return_date: d.return_date, return_time: d.return_time, status: d.status,
      customer_notes: d.customer_notes, internal_notes: d.internal_notes };
  }
  A.openBookingForm = (b, preset = {}) => {
    if (b) return openBooking(b.id, "edit");
    panel({
      tabs: [["new", "New booking", "fa-solid fa-plus"]], tab: "new", state: {},
      head: () => ({ title: "New booking", icon: "fa-calendar-plus", sub: "For bookings taken by phone, WhatsApp or in person", pills: [] }),
      render: () => bookingFormHtml({}, { ...preset, date: preset.date || ymd(today()) }) + `<div class="td-pfoot"><span></span>${pbtn("bk-create", "Save booking", "fa-check", { primary: true })}</div>`,
      actions: {
        "bk-create": async () => {
          const p = bookingPayload(panelForm(), null);
          if (!p.customer_name || !p.customer_mobile || !p.pickup_date) throw new Error("Enter the customer's name, mobile and the pickup date.");
          const r = await api("app_drive_booking_save", { p });
          toast(`Booking ${r.reference} saved`); reloadLists(); A.calendarReload?.();
          openBooking(r.id);
        }
      }
    });
  };
  A.openBooking = id => openBooking(id);

  // ---- Availability calendar --------------------------------------------------------------------------
  const DAYS = 14;
  let CS = null;
  app.register("calendar", {
    render(el) {
      if (!CS) { const t = today(); CS = { start: new Date(t.getFullYear(), t.getMonth(), t.getDate()), vehicle: "" }; }
      const end = new Date(CS.start); end.setDate(end.getDate() + DAYS - 1);
      const vehicles = (A.ctx().vehicles || []).filter(v => !CS.vehicle || v.id === CS.vehicle).filter(v => !["sold", "inactive"].includes(v.status) || CS.vehicle);
      el.innerHTML = `<div class="td-toolbar">
          <div class="td-inline">${btn("cal-prev", "", "fa-chevron-left", { cls: "is-icon" })}<b class="td-cal-range">${esc(fmtDate(ymd(CS.start)))} – ${esc(fmtDate(ymd(end)))}</b>${btn("cal-next", "", "fa-chevron-right", { cls: "is-icon" })}${btn("cal-today", "Today", "fa-crosshairs")}</div>
          <select data-cal-vehicle aria-label="Vehicle">${A.vehicleOptions("All vehicles").map(([v, t]) => `<option value="${esc(v)}"${CS.vehicle === v ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>
          ${btn("block-new", "Block dates", "fa-ban")}${btn("new-booking", "New booking", "fa-plus", { primary: true })}
        </div>
        <div class="td-legend"><span><i class="is-ok"></i>Confirmed</span><span><i class="is-warn"></i>Pending</span><span><i class="is-block"></i>Blocked (maintenance, repairs, personal, other)</span></div>
        <div data-cal>${skel(6)}</div>`;
      el.querySelector("[data-cal-vehicle]").addEventListener("change", e => { CS.vehicle = e.target.value; app.A.refresh(); });
      const box = el.querySelector("[data-cal]");
      if (!vehicles.length) { box.innerHTML = empty("fa-car-side", "No vehicles", "Add vehicles in Fleet to see their availability."); return; }
      const load = async () => {
        try {
          const r = await api("app_drive_calendar", { p_from: ymd(CS.start), p_to: ymd(end), p_vehicle_id: CS.vehicle || null });
          paint(r);
        } catch (e) { box.innerHTML = empty("fa-triangle-exclamation", "The calendar could not be loaded", errText(e)); }
      };
      A.calendarReload = load;
      function paint(r) {
        const days = Array.from({ length: DAYS }, (_, i) => { const d = new Date(CS.start); d.setDate(d.getDate() + i); return d; });
        const t0 = ymd(today());
        const overlaps = (s, e, d) => { const a = parseLocal(s), b = parseLocal(e); const ds = new Date(d.getFullYear(), d.getMonth(), d.getDate()), de = new Date(ds); de.setDate(de.getDate() + 1); return a < de && b > ds; };
        box.innerHTML = `<div class="td-cal" style="--days:${DAYS}">
          <div class="td-cal-head"><span></span>${days.map(d => `<span class="${ymd(d) === t0 ? "is-today" : ""}${[0, 6].includes(d.getDay()) ? " is-weekend" : ""}"><small>${esc(d.toLocaleDateString(undefined, { weekday: "short" }))}</small><b>${d.getDate()}</b></span>`).join("")}</div>
          ${vehicles.map(v => `<div class="td-cal-row"><button type="button" class="td-cal-v" data-td-act="open-vehicle" data-id="${esc(v.id)}"><b>${esc(v.name)}</b>${v.status !== "available" ? `<small>${esc((A.V_STATUS[v.status] || [v.status])[0])}</small>` : ""}</button>
            ${days.map(d => {
              const items = [...(r.bookings || []).filter(b => b.vehicle_id === v.id && overlaps(b.start_at, b.end_at, d)).map(b => `<button type="button" class="td-cal-item is-${b.status === "confirmed" ? "ok" : "warn"}" data-td-act="open-booking" data-id="${esc(b.id)}" title="${esc(`${b.reference} · ${b.customer_name} · ${fmtDate(b.start_at)} ${fmtTime(b.start_at)} → ${fmtDate(b.end_at)} ${fmtTime(b.end_at)}`)}">${esc(b.customer_name.split(" ")[0])}</button>`),
                ...(r.blocks || []).filter(k => k.vehicle_id === v.id && overlaps(k.start_at, k.end_at, d)).map(k => `<button type="button" class="td-cal-item is-block" data-td-act="open-block" data-id="${esc(k.id)}" title="${esc(`${k.kind} · ${fmtDate(k.start_at)} ${fmtTime(k.start_at)} → ${fmtDate(k.end_at)} ${fmtTime(k.end_at)}${k.note ? " · " + k.note : ""}`)}">${esc(k.kind.replace("_", " "))}</button>`)];
              return `<div class="td-cal-cell${ymd(d) === t0 ? " is-today" : ""}" data-td-act="cal-cell" data-v="${esc(v.id)}" data-d="${ymd(d)}">${items.join("")}</div>`;
            }).join("")}</div>`).join("")}
        </div>`;
        CS.blocks = r.blocks || [];
      }
      load();
    }
  });
  Object.assign(A.actions, {
    "cal-prev": () => { CS.start.setDate(CS.start.getDate() - 7); A.refresh(); },
    "cal-next": () => { CS.start.setDate(CS.start.getDate() + 7); A.refresh(); },
    "cal-today": () => { const t = today(); CS.start = new Date(t.getFullYear(), t.getMonth(), t.getDate()); A.refresh(); },
    "cal-cell": (b, e) => { if (e.target.closest(".td-cal-item")) return; A.openBookingForm(null, { vehicle_id: b.dataset.v, date: b.dataset.d }); },
    "block-new": () => A.openBlockForm(null, { vehicle_id: CS?.vehicle || "" }),
    "open-block": b => A.openBlockForm((CS?.blocks || []).find(k => k.id === b.dataset.id))
  });
  const BLOCK_KINDS = [["maintenance", "Maintenance"], ["repairs", "Repairs"], ["personal", "Personal use"], ["other", "Other"]];
  A.openBlockForm = (k, preset = {}) => {
    const [sd, stm] = splitLocal(k?.start_at); const [ed, etm] = splitLocal(k?.end_at);
    const d0 = preset.date || ymd(today());
    panel({
      tabs: [["main", k ? "Block" : "New block", "fa-solid fa-ban"]], tab: "main", state: {},
      head: () => ({ title: k ? "Blocked dates" : "Block dates", icon: "fa-ban", sub: "The vehicle cannot be booked during this time", pills: [] }),
      render: () => `<form class="td-pform"><div class="td-fgrid">
          ${F.select("vehicle_id", "Vehicle", k?.vehicle_id || preset.vehicle_id || "", A.vehicleOptions("Choose a vehicle"), { req: true, wide: true })}
          ${F.select("kind", "Reason", k?.kind || "maintenance", BLOCK_KINDS)}
          <span></span>
          ${F.text("start_date", "From", sd || d0, { type: "date", req: true })}${F.text("start_time", "Time", stm || "00:00", { type: "time" })}
          ${F.text("end_date", "Until", ed || d0, { type: "date", req: true })}${F.text("end_time", "Time", etm || "23:59", { type: "time" })}
          ${F.area("note", "Note", k?.note, { rows: 2, max: 600 })}
        </div><p class="td-muted">A block cannot overlap a confirmed booking. Public requests for blocked times are refused.</p></form>
        <div class="td-pfoot">${k ? pbtn("blk-delete", "Delete", "fa-trash", { danger: true }) : "<span></span>"}${pbtn("blk-save", "Save", "fa-check", { primary: true })}</div>`,
      actions: {
        "blk-save": async () => {
          const d = formValues(panelForm());
          if (!d.vehicle_id) throw new Error("Choose the vehicle.");
          await api("app_drive_block_save", { p: { id: k?.id || null, vehicle_id: d.vehicle_id, kind: d.kind, start_at: `${d.start_date}T${d.start_time || "00:00"}:00`, end_at: `${d.end_date}T${d.end_time || "23:59"}:00`, note: d.note } });
          closePanel(); toast("Saved"); A.calendarReload?.();
        },
        "blk-delete": async () => {
          if (!(await confirmBox("Delete this block? The vehicle can be booked again for this time.", { title: "Delete block?", ok: "Delete", danger: true }))) return;
          await api("app_drive_block_delete", { p_id: k.id }); closePanel(); toast("Block deleted"); A.calendarReload?.();
        }
      }
    });
  };

  // ---- Customers -----------------------------------------------------------------------------------
  let US = null;
  app.register("customers", {
    render(el) {
      US = US || { q: "", rows: [], total: 0 };
      el.innerHTML = `<div class="td-toolbar"><label class="td-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Name, mobile or email" value="${esc(US.q)}" data-cu-q aria-label="Search customers"></label><p class="td-muted">Customers are built from your own bookings and are private to your business.</p></div><div data-cu>${skel(6)}</div>`;
      let tm = 0;
      el.querySelector("[data-cu-q]").addEventListener("input", e => { clearTimeout(tm); tm = setTimeout(() => { US.q = e.target.value.trim(); load(true); }, 260); });
      async function load(reset) {
        const box = el.querySelector("[data-cu]");
        if (reset) US.rows = [];
        try {
          const r = await api("app_drive_customers", { p: { q: US.q, limit: 30, offset: US.rows.length } });
          US.rows = US.rows.concat(r.rows || []); US.total = r.total || 0;
          box.innerHTML = US.rows.length ? `<ul class="td-list">${US.rows.map((c, i) => `<li class="td-list-row is-click" data-td-act="cu-open" data-i="${i}" role="button" tabindex="0">
              <span class="td-list-ico is-avatar" aria-hidden="true">${esc((c.customer_name || "?").trim().charAt(0).toUpperCase())}</span>
              <span class="td-list-main"><b>${esc(c.customer_name)}</b><small>${esc(c.customer_mobile)}${c.customer_email ? " · " + esc(c.customer_email) : ""}</small></span>
              <span class="td-list-meta"><b>${c.bookings}</b><small>booking${c.bookings === 1 ? "" : "s"}</small></span>
              <span class="td-list-meta td-hide-sm"><small>Last trip</small><b>${esc(fmtDate(c.last_trip))}</b></span></li>`).join("")}</ul>
            <div class="td-more-row"><span>${US.rows.length} of ${US.total}</span>${US.rows.length < US.total ? btn("cu-more", "Load more", "fa-angles-down") : ""}</div>`
            : empty("fa-user-group", US.q ? "No customers match" : "No customers yet", "Every booking adds its customer here.");
        } catch (e) { box.innerHTML = empty("fa-triangle-exclamation", "Customers could not be loaded", errText(e)); }
      }
      A.actions["cu-more"] = () => load(false);
      load(true);
    }
  });
  A.actions["cu-open"] = b => {
    const c = US.rows[+b.dataset.i]; if (!c) return;
    const st = { rows: null };
    panel({
      tabs: [["main", "Customer", "fa-solid fa-user"]], tab: "main", state: st,
      head: () => ({ title: c.customer_name, icon: "fa-user", sub: esc(c.customer_mobile), pills: [pill(`${c.bookings} booking${c.bookings === 1 ? "" : "s"}`, "", "fa-calendar-check"), c.completed ? pill(`${c.completed} completed`, "ok") : "", c.cancelled ? pill(`${c.cancelled} cancelled / no show`, "bad") : ""].filter(Boolean) }),
      render() {
        const K = A.DP().kit, wa = waDigits(c.customer_mobile);
        return K.section("Contact", K.kv([["Mobile", `<a href="tel:${esc(c.customer_mobile)}">${esc(c.customer_mobile)}</a>`], c.customer_email ? ["Email", `<a href="mailto:${esc(c.customer_email)}">${esc(c.customer_email)}</a>`] : null, ["Last request", esc(fmtWhen(c.last_request))]]))
          + `<div class="td-pacts">${wa.length >= 7 ? `<a class="td-btn" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i><span>WhatsApp</span></a>` : ""}${pbtn("cu-book", "New booking", "fa-calendar-plus", { primary: true })}</div>`
          + K.section("Bookings", st.rows ? `<ul class="td-rows">${st.rows.map(x => `<li class="td-row" data-dp-act="cu-booking" data-id="${esc(x.id)}" role="button" tabindex="0"><span class="td-row-main"><b>${esc(x.reference)} · ${esc(x.vehicle_name || "Any vehicle")}</b><small>${esc(fmtDate(x.start_at))}${x.pickup_time_set ? " " + esc(fmtTime(x.start_at)) : ""}</small></span><span class="td-row-side">${bPill(x.status)}</span></li>`).join("")}</ul>` : skel(4));
      },
      actions: {
        "cu-booking": x => openBooking(x.dataset.id),
        "cu-book": () => { A.openBookingForm(null, {}); setTimeout(() => { const f = panelForm(); if (f) { f.elements.customer_name.value = c.customer_name; f.elements.customer_mobile.value = c.customer_mobile; if (c.customer_email) f.elements.customer_email.value = c.customer_email; } }, 30); }
      }
    });
    api("app_drive_bookings_list", { p: { mobile: c.customer_mobile, status: "", limit: 50, sort: "start_desc" } }).then(r => { st.rows = r.rows || []; rerender(); }).catch(() => { st.rows = []; rerender(); });
  };

  // ---- Inquiries (questions sent from the public page; database update 239) ----------------------------
  const I_STATUS = { new: ["New", "warn", "fa-envelope"], answered: ["Answered", "ok", "fa-reply"], closed: ["Closed", "", "fa-box-archive"] };
  const iPill = s => { const x = I_STATUS[s] || [s, ""]; return pill(x[0], x[1], x[2]); };
  let IS = null;
  app.register("inquiries", {
    render(el, _A, opts) {
      if (!IS || opts.status !== undefined) IS = { status: opts.status ?? "", q: "", rows: [], total: 0 };
      el.innerHTML = `<div class="td-chips" role="radiogroup" aria-label="Status">${[["", "All"], ["new", "New"], ["answered", "Answered"], ["closed", "Closed"]].map(([k, t]) => `<button type="button" role="radio" aria-checked="${IS.status === k}" data-td-act="iq-status" data-s="${k}">${esc(t)}</button>`).join("")}</div>
        <div class="td-toolbar"><label class="td-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Name, mobile, email or message" value="${esc(IS.q)}" data-iq-q aria-label="Search inquiries"></label>
          <p class="td-muted">Questions visitors send from your public page. You get a notification (and a push message) for each one.</p></div>
        <div data-iq>${skel(5)}</div>`;
      let tm = 0;
      el.querySelector("[data-iq-q]").addEventListener("input", e => { clearTimeout(tm); tm = setTimeout(() => { IS.q = e.target.value.trim(); load(true); }, 260); });
      async function load(reset) {
        const box = el.querySelector("[data-iq]");
        if (reset) IS.rows = [];
        try {
          const r = await api("app_drive_inquiries_list", { p: { status: IS.status, q: IS.q, limit: 25, offset: IS.rows.length } });
          IS.rows = IS.rows.concat(r.rows || []); IS.total = r.total || 0;
          box.innerHTML = IS.rows.length ? `<ul class="td-list">${IS.rows.map((q, i) => `<li class="td-list-row is-click" data-td-act="iq-open" data-i="${i}" role="button" tabindex="0">
              <span class="td-list-ico" aria-hidden="true"><i class="fa-solid ${q.status === "new" ? "fa-envelope" : "fa-envelope-open"}"></i></span>
              <span class="td-list-main"><b>${esc(q.name)}${q.subject ? " · " + esc(q.subject) : ""}</b><small>${esc(q.message)}</small></span>
              <span class="td-list-meta">${iPill(q.status)}<small>${esc(fmtWhen(q.created_at))}</small></span></li>`).join("")}</ul>
            <div class="td-more-row"><span>${IS.rows.length} of ${IS.total}</span>${IS.rows.length < IS.total ? btn("iq-more", "Load more", "fa-angles-down") : ""}</div>`
            : empty("fa-envelope-open-text", IS.q || IS.status ? "No inquiries match" : "No inquiries yet", "Questions sent from your public page appear here.");
        } catch (e) { box.innerHTML = empty("fa-triangle-exclamation", "Inquiries could not be loaded", /function|schema/i.test(errText(e)) ? "Inquiries need database update 239." : errText(e)); }
      }
      A.actions["iq-more"] = () => load(false);
      A.inquiriesReload = () => load(true);
      load(true).then(() => { if (opts.inquiry) { const i = IS.rows.findIndex(q => q.id === opts.inquiry); if (i >= 0) openInquiry(IS.rows[i]); } });
    }
  });
  A.actions["iq-status"] = b => { IS.status = b.dataset.s; A.refresh(); };
  A.actions["iq-open"] = b => openInquiry(IS.rows[+b.dataset.i]);
  function openInquiry(q) {
    if (!q) return;
    const st = { q };
    const msgText = () => `Hello ${q.name},\n\nThank you for your message to ${A.ctx().fleet.business_name}.\n\n`;
    panel({
      tabs: [["main", "Inquiry", "fa-solid fa-envelope-open-text"]], tab: "main", state: st,
      head: () => ({ title: st.q.name, icon: "fa-envelope-open-text", sub: esc(fmtWhen(st.q.created_at)), pills: [iPill(st.q.status)] }),
      render() {
        const K = A.DP().kit, x = st.q, wa = waDigits(x.mobile);
        return K.section("Message", `${x.subject ? `<p><b>${esc(x.subject)}</b></p>` : ""}<p class="td-pre" dir="auto">${esc(x.message)}</p>`)
          + K.section("Contact", K.kv([x.mobile ? ["Mobile", `<a href="tel:${esc(x.mobile)}">${esc(x.mobile)}</a>`] : null, x.email ? ["Email", `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>`] : null]))
          + `<div class="td-pacts">${wa.length >= 7 ? `<a class="td-btn" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(msgText())}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i><span>Reply on WhatsApp</span></a>` : ""}
              ${x.email ? `<a class="td-btn" href="mailto:${esc(x.email)}?subject=${encodeURIComponent(`Re: ${x.subject || "Your inquiry"}`)}&body=${encodeURIComponent(msgText())}"><i class="fa-regular fa-envelope"></i><span>Email draft</span></a>` : ""}
              ${pbtn("iq-book", "New booking", "fa-calendar-plus")}</div>`
          + K.section("Status", `<div class="td-pacts">${Object.entries(I_STATUS).map(([k, v]) => pbtn("iq-set", v[0], v[2], { primary: x.status === k, data: `data-s="${k}"` })).join("")}</div>`)
          + K.section("Internal notes", `<textarea class="td-notes" data-iq-notes rows="3" maxlength="3000" placeholder="Only you can see these notes">${esc(x.internal_notes || "")}</textarea><div class="td-inline is-end">${pbtn("iq-notes", "Save notes", "fa-floppy-disk")}</div>`);
      },
      actions: {
        "iq-set": async b => { st.q = await api("app_drive_inquiry_set", { p_id: q.id, p_status: b.dataset.s, p_internal_notes: null, p_set_notes: false }); Object.assign(q, st.q); rerender(); A.DP().toast("Saved"); A.inquiriesReload?.(); A.refreshBadges?.(); },
        "iq-notes": async () => { st.q = await api("app_drive_inquiry_set", { p_id: q.id, p_status: null, p_internal_notes: A.DP().custom.body().querySelector("[data-iq-notes]").value, p_set_notes: true }); Object.assign(q, st.q); rerender(); A.DP().toast("Notes saved"); },
        "iq-book": () => { A.openBookingForm(null, {}); setTimeout(() => { const f = panelForm(); if (f) { f.elements.customer_name.value = q.name; if (q.mobile) f.elements.customer_mobile.value = q.mobile; if (q.email) f.elements.customer_email.value = q.email; } }, 30); }
      }
    });
  }

  // ---- Drivers ------------------------------------------------------------------------------------------
  app.register("drivers", {
    render(el) {
      const list = A.ctx().drivers || [];
      el.innerHTML = `<div class="td-toolbar"><p class="td-muted">Drivers you can assign to bookings. Their details are private.</p>${btn("driver-new", "Add driver", "fa-plus", { primary: true })}</div>
        ${list.length ? `<ul class="td-list">${list.map(d => `<li class="td-list-row is-click" data-td-act="driver-edit" data-id="${esc(d.id)}" role="button" tabindex="0">
          <span class="td-list-ico" aria-hidden="true"><i class="fa-solid fa-id-card"></i></span>
          <span class="td-list-main"><b>${esc(d.name)}</b><small>${esc([d.mobile, d.email].filter(Boolean).join(" · ") || "No contact details")}</small></span>
          ${d.active ? pill("Active", "ok") : pill("Inactive", "")}</li>`).join("")}</ul>` : empty("fa-id-card", "No drivers yet", "Add the drivers you assign to trips.")}`;
    }
  });
  function openDriver(d) {
    panel({
      tabs: [["main", d ? "Driver" : "New driver", "fa-solid fa-id-card"]], tab: "main", state: {},
      head: () => ({ title: d ? d.name : "Add driver", icon: "fa-id-card", sub: "Drivers", pills: [] }),
      render: () => `<form class="td-pform"><div class="td-fgrid">${F.text("name", "Name", d?.name, { req: true, max: 80, wide: true })}${F.text("mobile", "Mobile", d?.mobile, { max: 40, type: "tel" })}${F.text("email", "Email", d?.email, { max: 160, type: "email" })}${F.area("notes", "Notes", d?.notes, { rows: 2, max: 1000 })}</div>
        <div class="td-switches">${F.sw("active", "Active", d ? d.active : true, "Inactive drivers stay on their past bookings but cannot be assigned.")}</div></form>
        <div class="td-pfoot"><span></span>${pbtn("drv-save", "Save", "fa-check", { primary: true })}</div>`,
      actions: {
        "drv-save": async () => {
          const v = formValues(panelForm());
          if (!v.name) throw new Error("Enter the driver's name.");
          await api("app_drive_driver_save", { p: { id: d?.id || null, ...v } });
          closePanel(); await A.loadContext(); A.refresh(); toast("Driver saved");
        }
      }
    });
  }
  A.actions["driver-new"] = () => openDriver(null);
  A.actions["driver-edit"] = b => openDriver((A.ctx().drivers || []).find(d => d.id === b.dataset.id));
})(window);
