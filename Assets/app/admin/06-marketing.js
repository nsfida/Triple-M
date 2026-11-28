/* Triplem VIP · Admin › Marketing (2026-11-28) — Main Admin only
 *
 * Contacts (companies and individuals), "Find new" (OpenStreetMap search + public website
 * contacts, Edge Function marketing-finder), professional emails that open ready-to-send in
 * Outlook (the local Outlook helper at http://127.0.0.1:8765, or a downloaded .eml), WhatsApp
 * messages (wa.me), statuses, and the unsubscribe list. Each email carries a personal
 * unsubscribe link (https://triplem.vip/unsubscribe/); unsubscribed contacts are shown as
 * "Unsubscribed" and the server refuses new email drafts for them (migration 248).
 * Uses the shared side panel (TriplemDetailPanels.custom). Server checks: Main Admin + Admin
 * Security Key on every call.
 */
(function initTriplemMarketing(global){
  "use strict";

  const HELPER = "http://127.0.0.1:8765";
  const DP = () => global.TriplemDetailPanels || null;
  const T = () => global.TriplemMarketingTemplates || null;
  const esc = v => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const isMainAdmin = () => { try { return !!(state.sessionUser && state.sessionUser.role === "admin" && state.sessionUser.is_protected === true); } catch (_) { return false; } };
  const when = v => { if (!v) return "—"; try { return new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (_) { return String(v); } };
  const keyLocked = msg => /security key/i.test(String(msg || ""));

  const STATUSES = [["new", "New", "fa-regular fa-circle"], ["contacted", "Contacted", "fa-regular fa-paper-plane"], ["interested", "Interested", "fa-regular fa-star"],
    ["client", "Client", "fa-solid fa-handshake"], ["done", "Done", "fa-solid fa-check"], ["not_interested", "Not interested", "fa-regular fa-circle-xmark"]];
  const STATUS_TONE = { new: "", contacted: "info", interested: "warn", client: "ok", done: "ok", not_interested: "muted" };
  const statusLabel = s => (STATUSES.find(x => x[0] === s) || [s, s])[1];
  const CATEGORIES = [["insurance", "Insurance agencies & brokers", "insurance"], ["car_rental", "Car rental & chauffeur", "overview"], ["car_trade", "Car dealers, garages & parts", "inventory"],
    ["retail", "Shops & retail", "inventory"], ["grocery", "Supermarkets & grocery", "inventory"], ["wholesale", "Wholesale & trading", "inventory"],
    ["accounting", "Accountants, auditors & tax", "accounting"], ["finance", "Finance, lending & exchange", "lending"], ["real_estate", "Real estate & property", "assets"],
    ["travel", "Travel agencies", "overview"], ["logistics", "Logistics & courier", "overview"], ["restaurants", "Restaurants & cafés", "inventory"],
    ["clinics", "Clinics & pharmacies", "overview"], ["services", "Offices & services (general)", "overview"]];
  const COUNTRIES = ["United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "Pakistan", "India", "Belgium", "United Kingdom"];
  const FIELDS = [["name", "Company or person name", "text", 200], ["contact_person", "Contact person", "text", 120], ["category", "Business type", "text", 80],
    ["email", "Email", "email", 254], ["whatsapp", "WhatsApp (with country code)", "tel", 20], ["phone", "Phone", "tel", 40], ["website", "Website", "url", 300],
    ["address", "Address", "text", 400], ["city", "City", "text", 80], ["country", "Country", "text", 80]];
  const blankForm = () => ({ id: null, kind: "company", name: "", contact_person: "", category: "", email: "", whatsapp: "", phone: "", website: "", address: "", city: "", country: "United Arab Emirates", notes: "" });

  let logoB64 = null;
  async function logoBase64(){
    if (logoB64) return logoB64;
    const res = await fetch(new URL("Assets/logo/email-logo.png", document.baseURI).href, { cache: "force-cache" });
    if (!res.ok) throw new Error("The email logo could not be loaded.");
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    logoB64 = btoa(bin);
    return logoB64;
  }
  async function withTimeout(promise, ms){
    let t; const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); });
    try { return await Promise.race([promise, timer]); } finally { clearTimeout(t); }
  }
  async function helperRunning(){
    try { const r = await withTimeout(fetch(`${HELPER}/ping`, { method: "GET", cache: "no-store", mode: "cors" }), 1500); return r.ok; } catch (_) { return false; }
  }
  // The email is shown in a closed Shadow DOM: its own styles, no scripts (the HTML is built by
  // TriplemMarketingTemplates from escaped values), no iframe needed under the page's CSP.
  function mountPreview(host, html){
    if (!host || !html) return;
    const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;contain:content}a{pointer-events:none}</style>${m ? m[1] : ""}`;
  }
  function download(blob, name){
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  const fileName = (company, subject) => `${String(subject || company || "Triplem VIP").replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 110)}.eml`;

  async function finderCall(body){
    const cfg = getSupabaseConfig();
    const base = String(cfg.supabaseUrl || "").replace(/\/$/, "");
    const token = String(state?.sessionToken || "").trim();
    const res = await fetch(`${base}/functions/v1/marketing-finder`, {
      method: "POST", cache: "no-store",
      headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, "Content-Type": "application/json", "X-Session-Token": token },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 404 && !data?.code) throw new Error("The marketing-finder function is not deployed yet (supabase functions deploy marketing-finder).");
    if (!res.ok) throw new Error(String(data?.error || `Search failed (${res.status})`));
    return data;
  }

  async function open(opts = {}){
    const dp = DP(); const k = dp?.kit;
    if (!dp?.custom?.open || !k || !isMainAdmin()) return false;
    const st = {
      loading: true, err: "", items: [], counts: {}, filter: "all", search: "", view: null, detail: null, detailErr: "",
      emailTpl: "overview", waTpl: "overview", note: "", subject: "", reason: "", confirmDelete: false, busy: "",
      form: blankForm(), formBusy: false,
      finder: { category: "insurance", city: "Dubai", country: "United Arab Emirates", keyword: "", limit: "40", scan: true, busy: false, err: "", results: null, place: "", selected: new Set(), attribution: "", template: "insurance" },
      settings: null, settingsBusy: false, tpl: "overview", helper: null
    };
    const R = (o = { keepScroll: true }) => dp.custom.render(o);

    async function loadList(){
      st.loading = !st.items.length; st.err = ""; R();
      try {
        const d = await supabaseRpc("app_marketing_list", { p_search: st.search || null, p_filter: st.filter, p_limit: 300, p_offset: 0 });
        st.items = d?.items || []; st.counts = d?.counts || {};
      } catch (e) { st.err = String(e?.message || e || "Could not load Marketing."); }
      st.loading = false; R();
    }
    async function loadDetail(id){
      st.view = id; st.detail = null; st.detailErr = ""; st.confirmDelete = false; st.note = ""; st.subject = ""; st.reason = ""; R({ keepScroll: false });
      try {
        st.detail = await supabaseRpc("app_marketing_get", { p_id: id });
        const it = st.detail.item;
        const cat = CATEGORIES.find(c => c[1] === it.category);
        st.emailTpl = st.waTpl = cat ? cat[2] : (it.last_email_template || "overview");
      } catch (e) { st.detailErr = String(e?.message || e); }
      R({ keepScroll: false });
    }
    async function loadSettings(){
      if (st.settings) return;
      try { st.settings = (await supabaseRpc("app_marketing_settings_get", {}))?.settings || {}; }
      catch (e) { st.settings = {}; dp.toast(String(e?.message || e), false); }
      R();
    }
    async function checkHelper(){ st.helper = await helperRunning(); R(); }
    function patchItem(item){
      if (!item) return;
      st.items = st.items.map(x => x.id === item.id ? item : x);
      if (st.detail?.item?.id === item.id) st.detail.item = item;
    }
    async function act(label, fn){
      if (st.busy) return; st.busy = label; R();
      try { await fn(); } catch (e) { dp.toast(String(e?.message || e || "Something went wrong."), false); }
      st.busy = ""; R();
    }

    // ---- Email ---------------------------------------------------------------------------------
    async function email(mode){
      const it = st.detail?.item; const tpl = T(); if (!it || !tpl) return;
      await act(mode, async () => {
        const prep = await supabaseRpc("app_marketing_prepare_email", { p_id: it.id, p_template: st.emailTpl });
        const mail = tpl.buildEmail({ template: st.emailTpl, contact: prep.item, settings: prep.settings, token: prep.token, note: st.note, subject: st.subject });
        const eml = tpl.buildEml({ to: prep.item.email, toName: prep.item.contact_person || prep.item.name, subject: mail.subject, html: mail.html, text: mail.text,
          unsubscribeUrl: mail.unsubscribeUrl, replyTo: prep.settings?.email || "info@triplem.vip", logoBase64: await logoBase64(), template: mail.template });
        const blob = new Blob([eml], { type: "message/rfc822" });
        const name = fileName(prep.item.name, mail.subject);
        patchItem(prep.item);
        if (mode === "outlook") {
          try {
            const r = await withTimeout(fetch(`${HELPER}/open?name=${encodeURIComponent(name)}`, { method: "POST", body: blob, mode: "cors", cache: "no-store" }), 4000);
            if (!r.ok) throw new Error("helper");
            st.helper = true;
            dp.toast("Opened in Outlook. Check it and press Send.");
          } catch (_) {
            st.helper = false;
            download(blob, name);
            dp.toast("Outlook helper not running: the email was downloaded. Open the .eml file to send it from Outlook.", false);
          }
        } else {
          download(blob, name);
          dp.toast("Email downloaded (.eml). Open it to send from Outlook.");
        }
        st.note = ""; st.subject = "";
        try { st.detail = await supabaseRpc("app_marketing_get", { p_id: it.id }); } catch (_) {}
      });
    }
    function whatsapp(){
      const it = st.detail?.item; const tpl = T(); if (!it || !tpl) return;
      const text = tpl.buildWhatsApp({ template: st.waTpl, contact: it, settings: st.settings || {} });
      const url = tpl.whatsappUrl(it.whatsapp, text);
      if (!url) return;
      // Open the window first (allowed as a direct result of the click), then record it.
      const w = global.open(url, "_blank");
      if (w) { try { w.opener = null; } catch (_) {} }
      act("wa", async () => {
        const d = await supabaseRpc("app_marketing_whatsapp_opened", { p_id: it.id, p_template: st.waTpl });
        patchItem(d.item);
        try { st.detail = await supabaseRpc("app_marketing_get", { p_id: it.id }); } catch (_) {}
        if (!w) dp.toast("Allow pop-ups for triplem.vip to open WhatsApp.", false);
      });
    }

    // ---- Rendering -------------------------------------------------------------------------------
    const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
    const emailPill = it => it.email_status === "unsubscribed" ? k.pill("Unsubscribed", "bad", "fa-solid fa-ban")
      : it.email_status === "bounced" ? k.pill("Bounced", "bad", "fa-solid fa-triangle-exclamation") : "";
    const sel = (attr, value, opts) => `<select class="input" data-mk="${attr}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const tplOptions = () => (T()?.list() || []).map(t => [t.id, t.name]);
    const field = (label, inner, hint = "") => `<label class="tm-mk-field"><span>${esc(label)}${hint ? ` <em>${esc(hint)}</em>` : ""}</span>${inner}</label>`;

    function listHtml(){
      if (st.loading) return k.skel(6);
      if (st.err && keyLocked(st.err)) return k.note(`The Admin Security Key is locked. Unlock it, then open Marketing again. ${k.btn("mk-unlock", "Unlock", "fa-solid fa-lock-open", { primary: true })}`, "warn", "fa-solid fa-key");
      if (st.err) return k.note(esc(st.err), "warn", "fa-solid fa-triangle-exclamation") + k.btn("mk-reload", "Try again", "fa-solid fa-rotate");
      const c = st.counts || {};
      const chips = [["all", "All"], ...STATUSES.map(s => [s[0], s[1]]), ["unsubscribed", "Unsubscribed"]]
        .map(([v, l]) => `<button type="button" class="tm-mk-chip${st.filter === v ? " is-on" : ""}${v === "unsubscribed" ? " is-bad" : ""}" data-dp-act="mk-filter" data-v="${v}">${esc(l)} <b>${esc(String(c[v] ?? 0))}</b></button>`).join("");
      const rows = st.items.map(it => `
        <li><button type="button" class="tm-mk-row" data-dp-act="mk-open" data-id="${esc(it.id)}">
          <span class="tm-mk-av${it.kind === "individual" ? " is-person" : ""}" aria-hidden="true">${esc(initials(it.name))}</span>
          <span class="tm-mk-main"><b>${esc(it.name)}</b><small>${esc([it.category, it.city, it.country].filter(Boolean).join(" · ") || (it.kind === "individual" ? "Individual" : "Company"))}</small></span>
          <span class="tm-mk-meta">
            <span class="tm-mk-ch" aria-label="Channels">${it.email ? `<i class="fa-regular fa-envelope${it.email_status !== "subscribed" ? " is-off" : ""}" title="${esc(it.email)}"></i>` : ""}${it.whatsapp ? `<i class="fa-brands fa-whatsapp${it.whatsapp_status !== "ok" ? " is-off" : ""}" title="+${esc(it.whatsapp)}"></i>` : ""}</span>
            ${emailPill(it)}${k.pill(statusLabel(it.status), STATUS_TONE[it.status] || "")}
          </span></button></li>`).join("");
      return `<div class="tm-mk-tools">
          <label class="tm-mk-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input class="input" type="search" data-mk="search" value="${esc(st.search)}" placeholder="Search name, email, city…" autocomplete="off" aria-label="Search contacts"></label>
          ${k.btn("mk-goto-find", "Find new", "fa-solid fa-wand-magic-sparkles", { primary: true })}${k.btn("mk-goto-add", "Add", "fa-solid fa-plus")}
        </div>
        <div class="tm-mk-chips" role="group" aria-label="Filter">${chips}</div>
        ${st.items.length ? `<ul class="tm-mk-list">${rows}</ul>` : k.empty(st.search || st.filter !== "all" ? "No contacts match." : "No contacts yet. Use Find new or Add to start your list.")}`;
    }

    function detailHtml(){
      const back = `<button type="button" class="tm-mk-back" data-dp-act="mk-back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> All contacts</button>`;
      if (st.detailErr) return back + k.note(esc(st.detailErr), "warn");
      if (!st.detail) return back + k.skel(6);
      const it = st.detail.item, ev = st.detail.events || [];
      const unsub = it.email_status === "unsubscribed", bounced = it.email_status === "bounced", waOff = it.whatsapp_status !== "ok";
      const busy = st.busy;
      const statusRow = `<div class="tm-mk-status" role="group" aria-label="Status">${STATUSES.map(([v, l, ic]) =>
        `<button type="button" class="tm-mk-st${it.status === v ? " is-on" : ""}" data-dp-act="mk-status" data-v="${v}"${busy ? " disabled" : ""}><i class="${ic}" aria-hidden="true"></i> ${esc(l)}</button>`).join("")}</div>`;
      const emailBox = !it.email ? k.note("No email address. Edit the contact to add one.", "info")
        : unsub ? k.statusCard("Unsubscribed from emails", `${esc(it.email)} unsubscribed ${esc(when(it.unsubscribed_at))}${it.unsubscribe_source === "link" ? " with the link in our email" : " (marked by an admin)"}. Triplem VIP will not create emails to this address.`, "bad")
          + `<details class="tm-mk-more"><summary>Allow emails again</summary>${field("Reason (required)", `<input class="input" data-mk="reason" value="${esc(st.reason)}" maxlength="300" placeholder="For example: asked by email on 1 Dec to receive offers">`)}
            <div class="tm-ap-foot">${k.btn("mk-resub", "Allow emails again", "fa-solid fa-rotate-left", { disabled: !!busy })}</div></details>`
        : bounced ? k.statusCard("Emails bounced", `Check ${esc(it.email)} before emailing again.`, "warn") + `<div class="tm-ap-foot">${k.btn("mk-resub-bounce", "Address is correct now", "fa-solid fa-check")}</div>`
        : `${field("Email template", sel("emailTpl", st.emailTpl, tplOptions()))}
           ${field("Subject", `<input class="input" data-mk="subject" value="${esc(st.subject)}" maxlength="180" placeholder="${esc(T()?.buildEmail({ template: st.emailTpl, contact: it, settings: st.settings || {}, token: "x" }).subject || "")}">`, "optional, leave empty for the template subject")}
           ${field("Personal note", `<textarea class="input" data-mk="note" rows="3" maxlength="1200" placeholder="Optional first paragraph, for example how you know them">${esc(st.note)}</textarea>`, "optional")}
           <div class="tm-mk-actions">
             ${k.btn("mk-outlook", busy === "outlook" ? "Opening…" : "Open in Outlook", "fa-solid fa-envelope-open-text", { primary: true, disabled: !!busy })}
             ${k.btn("mk-eml", busy === "eml" ? "Preparing…" : "Download .eml", "fa-solid fa-download", { disabled: !!busy })}
             ${k.btn("mk-preview", "Preview", "fa-regular fa-eye")}
           </div>
           <p class="tm-mk-hint">${st.helper === false ? '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Outlook helper not found on this PC: the email will be downloaded instead.' : st.helper ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Outlook helper is running.' : ""} Every email has a personal unsubscribe link.</p>
           <details class="tm-mk-more"><summary>Mark as unsubscribed or bounced</summary><div class="tm-mk-actions">${k.btn("mk-unsub", "Mark unsubscribed", "fa-solid fa-ban", { danger: true })}${k.btn("mk-bounce", "Mark bounced", "fa-solid fa-triangle-exclamation")}</div></details>`;
      const waBox = !it.whatsapp ? k.note("No WhatsApp number. Edit the contact to add one.", "info")
        : waOff ? k.statusCard("Asked not to get WhatsApp messages", "Do not message this number.", "bad") + `<div class="tm-ap-foot">${k.btn("mk-wa-on", "Allow WhatsApp again", "fa-solid fa-rotate-left")}</div>`
        : `${field("WhatsApp message", sel("waTpl", st.waTpl, tplOptions()))}
           <pre class="tm-mk-wa">${esc(T()?.buildWhatsApp({ template: st.waTpl, contact: it, settings: st.settings || {} }) || "")}</pre>
           <div class="tm-mk-actions">${k.btn("mk-wa", "Open WhatsApp", "fa-brands fa-whatsapp", { primary: true, disabled: !!busy })}${k.btn("mk-wa-copy", "Copy text", "fa-regular fa-copy")}${k.btn("mk-wa-off", "Replied STOP", "fa-solid fa-hand", { danger: true })}</div>`;
      const evLabel = e => ({ created: "Added", updated: "Edited", status: `Status: ${statusLabel(e.detail?.to)}`, email_drafted: `Email drafted (${T()?.byId(e.template)?.name || e.template})`,
        whatsapp_opened: "WhatsApp opened", unsubscribed: e.detail?.source === "link" ? "Unsubscribed with the email link" : "Marked unsubscribed", resubscribed: "Emails allowed again",
        whatsapp_opt_out: "WhatsApp: replied STOP", whatsapp_opt_in: "WhatsApp allowed again", deleted: "Deleted", restored: "Restored" }[e.kind] || e.kind);
      return back + k.kv([
          ["Type", it.kind === "individual" ? "Individual" : "Company"],
          ["Contact person", esc(it.contact_person || "—")],
          ["Email", it.email ? `<a href="mailto:${esc(it.email)}">${esc(it.email)}</a> ${emailPill(it)}` : "—"],
          ["WhatsApp", it.whatsapp ? `+${esc(it.whatsapp)}${waOff ? " " + k.pill("Opted out", "bad") : ""}` : "—"],
          ["Phone", esc(it.phone || "—")],
          ["Website", it.website ? `<a href="${esc(it.website)}" target="_blank" rel="noopener noreferrer">${esc(it.website.replace(/^https?:\/\//, ""))}</a>` : "—"],
          ["Address", esc([it.address, it.city, it.country].filter(Boolean).join(", ") || "—")],
          ["Business type", esc(it.category || "—")],
          ["Source", it.source === "search" ? (String(it.source_ref || "").startsWith("osm:") ? `Find new · <a href="https://www.openstreetmap.org/${esc(String(it.source_ref).slice(4))}" target="_blank" rel="noopener noreferrer">map</a>` : "Find new") : "Added by hand"],
          ["Emails drafted", `${esc(String(it.emails_drafted || 0))}${it.last_emailed_at ? ` · last ${esc(when(it.last_emailed_at))}` : ""}`],
          ["WhatsApp opened", `${esc(String(it.whatsapp_opened || 0))}${it.last_whatsapp_at ? ` · last ${esc(when(it.last_whatsapp_at))}` : ""}`]
        ])
        + (it.notes ? k.section("Notes", `<p class="tm-mk-notes">${esc(it.notes)}</p>`) : "")
        + k.section("Status", statusRow)
        + k.section("Email", emailBox)
        + k.section("WhatsApp", waBox)
        + k.section("Activity", ev.length ? `<ul class="tm-mk-ev">${ev.map(e => `<li><span>${esc(evLabel(e))}</span><small>${esc(when(e.at))}${e.by ? ` · @${esc(e.by)}` : ""}</small></li>`).join("")}</ul>` : k.empty("No activity yet."))
        + k.section("Manage", `<div class="tm-mk-actions">${k.btn("mk-edit", "Edit", "fa-solid fa-pen")}${st.confirmDelete
            ? k.btn("mk-del-yes", "Yes, delete", "fa-solid fa-trash", { danger: true }) + k.btn("mk-del-no", "Keep", "")
            : k.btn("mk-del", "Delete", "fa-solid fa-trash", { danger: true })}</div>
            <p class="tm-mk-hint">Deleting hides the contact from the list. An unsubscribed address stays blocked even if it is added again.</p>`);
    }

    function finderHtml(){
      const f = st.finder;
      const res = f.results;
      const selectable = res ? res.filter(r => !r.in_list) : [];
      const results = !res ? "" : !res.length ? k.empty("No businesses of this type were found there. Try another city, a nearby area or a different type.")
        : `<div class="tm-mk-res-head"><b>${esc(String(res.length))} found</b> <small>in ${esc(f.place)}</small>
            <span>${k.btn("mk-f-all", f.selected.size === selectable.length && selectable.length ? "Clear" : "Select all", "fa-regular fa-square-check")}${k.btn("mk-f-add", f.busy === "add" ? "Adding…" : `Add ${f.selected.size} selected`, "fa-solid fa-user-plus", { primary: true, disabled: !f.selected.size || !!f.busy })}</span></div>
          <ul class="tm-mk-res">${res.map((r, i) => `
            <li class="${r.in_list ? "is-in" : ""}"><label>
              <input type="checkbox" data-mk-pick="${i}"${f.selected.has(i) ? " checked" : ""}${r.in_list ? " disabled" : ""}>
              <span class="tm-mk-main"><b>${esc(r.name)}</b><small>${esc([r.address, r.city].filter(Boolean).join(", ") || r.category)}</small>
                <span class="tm-mk-tags">${r.email ? `<span><i class="fa-regular fa-envelope"></i> ${esc(r.email)}</span>` : ""}${r.whatsapp ? `<span><i class="fa-brands fa-whatsapp"></i> +${esc(r.whatsapp)}</span>` : ""}${r.phone ? `<span><i class="fa-solid fa-phone"></i> ${esc(r.phone)}</span>` : ""}${r.website ? `<span><i class="fa-solid fa-globe"></i> ${esc(r.website.replace(/^https?:\/\//, ""))}</span>` : ""}</span></span>
              <span class="tm-mk-meta">${r.in_list ? k.pill("In list", "muted") : ""}${r.unsubscribed ? k.pill("Unsubscribed", "bad", "fa-solid fa-ban") : ""}${!r.email && !r.whatsapp && !r.phone ? k.pill("No contact", "muted") : ""}</span>
            </label></li>`).join("")}</ul>
          <p class="tm-mk-hint">${esc(f.attribution || "")} Check each business before contacting it.</p>`;
      return k.note("Finds businesses on OpenStreetMap in the city you choose and, if you want, reads their own websites for a public email or WhatsApp link. Nothing is saved until you add the ones you choose.", "info", "fa-solid fa-wand-magic-sparkles")
        + `<form class="tm-mk-form" data-mk-form="finder">
          ${field("Business type", sel("f.category", f.category, CATEGORIES.map(c => [c[0], c[1]])))}
          <div class="tm-mk-grid">${field("City", `<input class="input" data-mk="f.city" value="${esc(f.city)}" maxlength="80" required>`)}
          ${field("Country", `<input class="input" data-mk="f.country" value="${esc(f.country)}" maxlength="80" list="tmMkCountries"><datalist id="tmMkCountries">${COUNTRIES.map(c => `<option value="${esc(c)}">`).join("")}</datalist>`)}</div>
          <div class="tm-mk-grid">${field("Name contains", `<input class="input" data-mk="f.keyword" value="${esc(f.keyword)}" maxlength="60" placeholder="optional">`)}
          ${field("Results", sel("f.limit", f.limit, [["20", "Up to 20"], ["40", "Up to 40"], ["60", "Up to 60"], ["100", "Up to 100"]]))}</div>
          <label class="tm-mk-check"><input type="checkbox" data-mk="f.scan"${f.scan ? " checked" : ""}> Look for email and WhatsApp on their websites <em>(slower)</em></label>
          <div class="tm-ap-foot">${k.btn("mk-f-search", f.busy === "search" ? "Searching…" : "Search", "fa-solid fa-magnifying-glass", { primary: true, disabled: !!f.busy })}</div>
        </form>`
        + (f.err ? k.note(esc(f.err), "warn", "fa-solid fa-triangle-exclamation") : "")
        + (f.busy === "search" ? k.skel(5) : results);
    }

    function formHtml(){
      const f = st.form;
      return `<form class="tm-mk-form" data-mk-form="contact">
          <div class="tm-mk-seg" role="radiogroup" aria-label="Type">
            <button type="button" role="radio" aria-checked="${f.kind === "company"}" class="${f.kind === "company" ? "is-on" : ""}" data-dp-act="mk-kind" data-v="company"><i class="fa-solid fa-building" aria-hidden="true"></i> Company</button>
            <button type="button" role="radio" aria-checked="${f.kind === "individual"}" class="${f.kind === "individual" ? "is-on" : ""}" data-dp-act="mk-kind" data-v="individual"><i class="fa-solid fa-user" aria-hidden="true"></i> Individual</button>
          </div>
          ${FIELDS.map(([key, label, type, max]) => field(label, `<input class="input" type="${type === "email" ? "email" : "text"}" inputmode="${type === "tel" ? "tel" : type === "email" ? "email" : type === "url" ? "url" : "text"}" data-mk="form.${key}" value="${esc(f[key] || "")}" maxlength="${max}"${key === "name" ? " required" : ""}${key === "country" ? ' list="tmMkCountries2"' : ""} autocomplete="off">`)).join("")}
          <datalist id="tmMkCountries2">${COUNTRIES.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
          ${field("Notes", `<textarea class="input" data-mk="form.notes" rows="3" maxlength="4000">${esc(f.notes || "")}</textarea>`, "only visible to you")}
          <div class="tm-ap-foot">${f.id ? k.btn("mk-form-cancel", "Cancel", "") : ""}${k.btn("mk-form-save", st.formBusy ? "Saving…" : f.id ? "Save changes" : "Add contact", "fa-solid fa-check", { primary: true, disabled: st.formBusy })}</div>
        </form>`;
    }

    function templatesHtml(){
      const tpl = T(); if (!tpl) return k.note("Templates are not loaded.", "warn");
      const sample = { name: "Gulf Example Trading LLC", contact_person: "Ahmed Khan", kind: "company" };
      const mail = tpl.buildEmail({ template: st.tpl, contact: sample, settings: st.settings || {}, token: "preview", logoSrc: new URL("Assets/logo/email-logo.png", document.baseURI).href });
      st.tplHtml = mail.html;
      return `<div class="tm-mk-tpls">${tpl.list().map(t => `<button type="button" class="tm-mk-tpl${st.tpl === t.id ? " is-on" : ""}" data-dp-act="mk-tpl" data-v="${esc(t.id)}"><i class="${esc(t.icon)}" aria-hidden="true"></i><b>${esc(t.name)}</b><small>${esc(t.preheader)}</small></button>`).join("")}</div>`
        + k.section("Subject", `<p class="tm-mk-subject">${esc(mail.subject)}</p>`)
        + k.section("Email preview", `<div class="tm-mk-frame" data-mk-mail="tpl" role="document" aria-label="Email preview"></div>`)
        + k.section("WhatsApp text", `<pre class="tm-mk-wa">${esc(tpl.buildWhatsApp({ template: st.tpl, contact: sample, settings: st.settings || {} }))}</pre>`)
        + k.note("The sample company is fictional. Real emails use the contact's name, your signature (Settings) and a personal unsubscribe link.", "info");
    }

    function settingsHtml(){
      if (!st.settings) { loadSettings(); return k.skel(5); }
      const s = st.settings;
      const f = (key, label, hint = "", max = 120) => field(label, `<input class="input" data-mk="s.${key}" value="${esc(s[key] || "")}" maxlength="${max}" autocomplete="off">`, hint);
      return k.section("Email signature", `<form class="tm-mk-form" data-mk-form="settings">
            ${f("sender_name", "Name")}${f("sender_title", "Title", "optional")}${f("email", "Reply email", "replies and unsubscribe requests go here", 254)}
            ${f("phone", "Phone", "optional", 40)}${f("whatsapp", "WhatsApp number", "with country code, optional", 20)}${f("website", "Website", "", 300)}
            ${f("address", "Business address", "shown in the email footer, recommended", 300)}
            <div class="tm-ap-foot">${k.btn("mk-s-save", st.settingsBusy ? "Saving…" : "Save signature", "fa-solid fa-check", { primary: true, disabled: st.settingsBusy })}</div></form>`)
        + k.section("Outlook helper", `${st.helper === null ? k.note("Checking…", "info") : st.helper
            ? k.statusCard("Running on this PC", "“Open in Outlook” opens each email ready to send.", "ok")
            : k.statusCard("Not found on this PC", "Emails are downloaded as .eml files instead (double-click to open in Outlook). Install the Outlook helper once (Install_Outlook_Helper (run once).bat) to open them directly.", "plain")}
            <div class="tm-ap-foot">${k.btn("mk-helper", "Check again", "fa-solid fa-rotate")}</div>`)
        + k.note("Good practice: email only businesses whose address is public for business contact, keep messages relevant, and never email an address marked Unsubscribed. The unsubscribe link and the suppression list handle this automatically.", "info", "fa-solid fa-shield-halved");
    }

    function preview(){
      const it = st.detail?.item; const tpl = T(); if (!it || !tpl) return;
      const mail = tpl.buildEmail({ template: st.emailTpl, contact: it, settings: st.settings || {}, token: "preview", note: st.note, subject: st.subject, logoSrc: new URL("Assets/logo/email-logo.png", document.baseURI).href });
      st.tpl = st.emailTpl;
      st.previewHtml = mail.html; st.previewSubject = mail.subject;
      R({ keepScroll: false });
    }

    dp.custom.open({
      icon: "admin",
      tabs: [["contacts", "Contacts", "fa-solid fa-address-book"], ["find", "Find new", "fa-solid fa-wand-magic-sparkles"], ["add", "Add", "fa-solid fa-user-plus"],
        ["templates", "Templates", "fa-regular fa-envelope"], ["settings", "Settings", "fa-solid fa-signature"]],
      tab: opts.tab || "contacts", state: st,
      head: () => {
        const c = st.counts || {};
        const onContact = st.view && st.detail && dp.custom.currentTab() === "contacts";
        return { title: onContact ? st.detail.item.name : "Marketing", avatar: `<span class="tm-dp-txico tm-ap-ico" style="--t:#0e5a56"><i class="fa-solid fa-bullhorn"></i></span>`,
          sub: onContact ? esc([st.detail.item.category, st.detail.item.city].filter(Boolean).join(" · ") || "Contact") : "Main Admin · outreach",
          pills: onContact ? [k.pill(statusLabel(st.detail.item.status), STATUS_TONE[st.detail.item.status] || ""), emailPill(st.detail.item)].filter(Boolean)
            : [k.pill(`${c.all ?? 0} contacts`, ""), c.unsubscribed ? k.pill(`${c.unsubscribed} unsubscribed`, "bad") : ""].filter(Boolean) };
      },
      render(tab){
        if (tab === "contacts") {
          if (st.view && st.previewHtml) return `<button type="button" class="tm-mk-back" data-dp-act="mk-preview-close"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back to ${esc(st.detail?.item?.name || "contact")}</button>`
            + k.section("Subject", `<p class="tm-mk-subject">${esc(st.previewSubject)}</p>`) + `<div class="tm-mk-frame" data-mk-mail="contact" role="document" aria-label="Email preview"></div>`;
          return st.view ? detailHtml() : listHtml();
        }
        if (tab === "find") return finderHtml();
        if (tab === "add") return formHtml();
        if (tab === "templates") { if (!st.settings) loadSettings(); return templatesHtml(); }
        return settingsHtml();
      },
      after(tab, body){
        if (tab === "contacts" && !st.view && Date.now() - (st.searchAt || 0) < 4000) {
          const i = body.querySelector('[data-mk="search"]');
          if (i && document.activeElement !== i) { i.focus({ preventScroll: true }); const n = i.value.length; try { i.setSelectionRange(n, n); } catch (_) {} }
        }
        const host = body.querySelector("[data-mk-mail]");
        if (host) mountPreview(host, host.dataset.mkMail === "tpl" ? st.tplHtml : st.previewHtml);
      },
      onInput(e){
        const f = e.target.closest?.("[data-mk]"); if (!f) return;
        const key = f.dataset.mk, val = f.type === "checkbox" ? f.checked : f.value;
        if (key === "search") {
          st.search = val; st.searchAt = Date.now(); clearTimeout(st.searchTimer);
          st.searchTimer = setTimeout(() => { st.searchAt = Date.now(); loadList(); }, 320);
          return;
        }
        if (key.startsWith("f.")) { st.finder[key.slice(2)] = val; return; }
        if (key.startsWith("form.")) { st.form[key.slice(5)] = val; return; }
        if (key.startsWith("s.")) { st.settings[key.slice(2)] = val; return; }
        st[key] = val;
      },
      onChange(e){
        const pick = e.target.closest?.("[data-mk-pick]");
        if (pick) { const i = Number(pick.dataset.mkPick); if (pick.checked) st.finder.selected.add(i); else st.finder.selected.delete(i); R(); return; }
        const f = e.target.closest?.("[data-mk]"); if (!f) return;
        const key = f.dataset.mk, val = f.type === "checkbox" ? f.checked : f.value;
        if (key.startsWith("f.")) st.finder[key.slice(2)] = val;
        else if (key === "emailTpl" || key === "waTpl") { st[key] = val; R(); }
      },
      onSubmit(form){
        const which = form.dataset.mkForm;
        if (which === "finder") document.querySelector('[data-dp-act="mk-f-search"]')?.click();
      },
      actions: {
        "mk-reload": () => loadList(),
        "mk-unlock": () => { dp.close(); setTimeout(() => document.getElementById("adminSecurityKeyBtn")?.click() || document.getElementById("adminSecurityUnlockBtn")?.click(), 0); },
        "mk-filter": b => { st.filter = b.dataset.v; loadList(); },
        "mk-open": b => { loadDetail(b.dataset.id); if (st.settings === null) loadSettings(); if (st.helper === null) checkHelper(); },
        "mk-back": () => { st.view = null; st.detail = null; st.previewHtml = null; R({ keepScroll: false }); loadList(); },
        "mk-goto-find": () => dp.custom.tab("find"),
        "mk-goto-add": () => { st.form = blankForm(); dp.custom.tab("add"); },
        "mk-status": b => act("status", async () => { const d = await supabaseRpc("app_marketing_set_status", { p_id: st.detail.item.id, p_status: b.dataset.v }); patchItem(d.item); st.detail = await supabaseRpc("app_marketing_get", { p_id: d.item.id }); }),
        "mk-outlook": () => email("outlook"),
        "mk-eml": () => email("eml"),
        "mk-preview": () => preview(),
        "mk-preview-close": () => { st.previewHtml = null; R({ keepScroll: false }); },
        "mk-unsub": () => act("unsub", async () => { const d = await supabaseRpc("app_marketing_set_email_status", { p_id: st.detail.item.id, p_status: "unsubscribed", p_note: null }); patchItem(d.item); st.detail = await supabaseRpc("app_marketing_get", { p_id: d.item.id }); dp.toast("Marked Unsubscribed. No more emails to this address."); }),
        "mk-bounce": () => act("bounce", async () => { const d = await supabaseRpc("app_marketing_set_email_status", { p_id: st.detail.item.id, p_status: "bounced", p_note: null }); patchItem(d.item); st.detail = await supabaseRpc("app_marketing_get", { p_id: d.item.id }); }),
        "mk-resub": () => act("resub", async () => { const d = await supabaseRpc("app_marketing_set_email_status", { p_id: st.detail.item.id, p_status: "subscribed", p_note: st.reason || null }); st.reason = ""; patchItem(d.item); st.detail = await supabaseRpc("app_marketing_get", { p_id: d.item.id }); dp.toast("Emails allowed again."); }),
        "mk-resub-bounce": () => act("resub", async () => { const d = await supabaseRpc("app_marketing_set_email_status", { p_id: st.detail.item.id, p_status: "subscribed", p_note: "Address checked after bounce" }); patchItem(d.item); st.detail = await supabaseRpc("app_marketing_get", { p_id: d.item.id }); }),
        "mk-wa": () => whatsapp(),
        "mk-wa-copy": async () => { const it = st.detail?.item; if (!it) return; await navigator.clipboard.writeText(T().buildWhatsApp({ template: st.waTpl, contact: it, settings: st.settings || {} })); dp.toast("Message copied"); },
        "mk-wa-off": () => act("waoff", async () => { const d = await supabaseRpc("app_marketing_set_whatsapp_status", { p_id: st.detail.item.id, p_status: "opted_out" }); patchItem(d.item); st.detail = await supabaseRpc("app_marketing_get", { p_id: d.item.id }); }),
        "mk-wa-on": () => act("waon", async () => { const d = await supabaseRpc("app_marketing_set_whatsapp_status", { p_id: st.detail.item.id, p_status: "ok" }); patchItem(d.item); st.detail = await supabaseRpc("app_marketing_get", { p_id: d.item.id }); }),
        "mk-edit": () => { const it = st.detail.item; st.form = { ...blankForm(), ...Object.fromEntries(Object.keys(blankForm()).map(key => [key, it[key] ?? ""])), id: it.id, whatsapp: it.whatsapp ? "+" + it.whatsapp : "" }; dp.custom.tab("add"); },
        "mk-del": () => { st.confirmDelete = true; R(); },
        "mk-del-no": () => { st.confirmDelete = false; R(); },
        "mk-del-yes": () => act("del", async () => { await supabaseRpc("app_marketing_delete", { p_id: st.detail.item.id }); st.view = null; st.detail = null; st.confirmDelete = false; dp.toast("Contact deleted"); await loadList(); }),
        "mk-kind": b => { st.form.kind = b.dataset.v; R(); },
        "mk-form-cancel": () => { const id = st.form.id; st.form = blankForm(); dp.custom.tab("contacts"); if (id) loadDetail(id); },
        "mk-form-save": async () => {
          if (st.formBusy) return;
          if (!String(st.form.name || "").trim()) { dp.toast("Enter the company or person name.", false); return; }
          st.formBusy = true; R();
          try {
            const { id, ...data } = st.form;
            const d = await supabaseRpc("app_marketing_save", { p_id: id || null, p_data: data });
            st.form = blankForm(); st.formBusy = false;
            dp.toast(id ? "Changes saved" : "Contact added");
            dp.custom.tab("contacts");
            await loadList();
            loadDetail(d.item.id);
          } catch (e) { st.formBusy = false; R(); dp.toast(String(e?.message || e), false); }
        },
        "mk-f-search": async () => {
          const f = st.finder; if (f.busy) return;
          if (!String(f.city || "").trim()) { dp.toast("Enter a city.", false); return; }
          f.busy = "search"; f.err = ""; f.results = null; f.selected = new Set(); R();
          try {
            const d = await finderCall({ action: "search", category: f.category, city: f.city, country: f.country, keyword: f.keyword, limit: Number(f.limit), scan_websites: !!f.scan });
            f.results = d.items || []; f.place = d.place || f.city; f.attribution = d.attribution || ""; f.template = d.template || "overview";
            f.results.forEach((r, i) => { if (!r.in_list && (r.email || r.whatsapp)) f.selected.add(i); });
          } catch (e) { f.err = String(e?.message || e); }
          f.busy = false; R();
        },
        "mk-f-all": () => { const f = st.finder; const avail = (f.results || []).map((r, i) => r.in_list ? -1 : i).filter(i => i >= 0); f.selected = f.selected.size === avail.length ? new Set() : new Set(avail); R(); },
        "mk-f-add": async () => {
          const f = st.finder; if (f.busy || !f.selected.size) return;
          f.busy = "add"; R();
          try {
            const items = [...f.selected].map(i => f.results[i]).map(r => ({ name: r.name, category: r.category, email: r.email, whatsapp: r.whatsapp, phone: r.phone, website: r.website, address: r.address, city: r.city, country: r.country, source_ref: r.source_ref }));
            const d = await supabaseRpc("app_marketing_add_many", { p_items: items });
            [...f.selected].forEach(i => { f.results[i].in_list = true; });
            f.selected = new Set();
            dp.toast(`${d.added} added${d.skipped ? `, ${d.skipped} already in the list` : ""}${d.invalid ? `, ${d.invalid} skipped (invalid details)` : ""}.`);
            loadList();
          } catch (e) { dp.toast(String(e?.message || e), false); }
          f.busy = false; R();
        },
        "mk-tpl": b => { st.tpl = b.dataset.v; R(); },
        "mk-s-save": async () => {
          if (st.settingsBusy) return; st.settingsBusy = true; R();
          try { st.settings = (await supabaseRpc("app_marketing_settings_save", { p_data: st.settings }))?.settings || st.settings; dp.toast("Signature saved"); }
          catch (e) { dp.toast(String(e?.message || e), false); }
          st.settingsBusy = false; R();
        },
        "mk-helper": () => { st.helper = null; R(); checkHelper(); }
      }
    });
    loadList();
    loadSettings();
    checkHelper();
    return true;
  }

  function bind(){
    const btn = document.getElementById("adminMarketingBtn");
    if (!btn || btn.dataset.mkBound) return;
    btn.dataset.mkBound = "1";
    btn.addEventListener("click", () => { open(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true }); else bind();

  global.TriplemMarketing = Object.freeze({ open });
})(window);
