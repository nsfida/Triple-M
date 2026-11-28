/* Triplem VIP · Admin › Marketing (2026-11-28, v2) — Main Admin only
 *
 * Overview dashboard, contacts (list / board, filters, tags, priority, follow-ups, activity log,
 * bulk actions, CSV import / export), campaigns (bulk email drafts to Outlook or a ZIP, WhatsApp
 * queue, results: opened / replied / unsubscribed), Find new (OpenStreetMap: small central area
 * first, then wider; website contacts read in the background), templates with your own wording,
 * and the signature. Every email has a personal unsubscribe link and a tracked "trial" link
 * (https://triplem.vip/go/). Unsubscribed contacts are never emailed (server rule, 248/249).
 * Uses the shared side panel (TriplemDetailPanels.custom). Server checks on every call: Main
 * Admin + Admin Security Key.
 */
(function initTriplemMarketing(global){
  "use strict";

  const HELPER = "http://127.0.0.1:8765";
  const DP = () => global.TriplemDetailPanels || null;
  const T = () => global.TriplemMarketingTemplates || null;
  const esc = v => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const isMainAdmin = () => { try { return !!(state.sessionUser && state.sessionUser.role === "admin" && state.sessionUser.is_protected === true); } catch (_) { return false; } };
  const when = v => { if (!v) return "—"; try { return new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (_) { return String(v); } };
  const day = v => { if (!v) return "—"; try { return new Date(String(v).length <= 10 ? v + "T00:00:00" : v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (_) { return String(v); } };
  const iso = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const today = () => iso(new Date());
  const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const keyLocked = msg => /security key/i.test(String(msg || ""));
  const num = n => Number(n || 0).toLocaleString();
  const pct = (a, b) => b ? `${Math.round((Number(a) || 0) * 100 / b)}%` : "—";

  const STATUSES = [["new", "New", "fa-regular fa-circle"], ["contacted", "Contacted", "fa-regular fa-paper-plane"], ["interested", "Interested", "fa-regular fa-star"],
    ["client", "Client", "fa-solid fa-handshake"], ["done", "Done", "fa-solid fa-check"], ["not_interested", "Not interested", "fa-regular fa-circle-xmark"]];
  const STATUS_TONE = { new: "", contacted: "info", interested: "warn", client: "ok", done: "ok", not_interested: "muted" };
  const statusLabel = s => (STATUSES.find(x => x[0] === s) || [s, s])[1];
  const PRIORITY = [["high", "High"], ["normal", "Normal"], ["low", "Low"]];
  const ACTIVITY = [["note", "Note", "fa-regular fa-note-sticky"], ["call", "Call", "fa-solid fa-phone"], ["meeting", "Meeting", "fa-regular fa-calendar-check"], ["reply", "They replied", "fa-solid fa-reply"]];
  const CATEGORIES = [["insurance", "Insurance agencies & brokers", "insurance"], ["car_rental", "Car rental & chauffeur", "overview"], ["car_trade", "Car dealers, garages & parts", "inventory"],
    ["retail", "Shops & retail", "inventory"], ["grocery", "Supermarkets & grocery", "inventory"], ["wholesale", "Wholesale & trading", "inventory"],
    ["accounting", "Accountants, auditors & tax", "accounting"], ["finance", "Finance, lending & exchange", "lending"], ["real_estate", "Real estate & property", "assets"],
    ["travel", "Travel agencies", "overview"], ["logistics", "Logistics & courier", "overview"], ["restaurants", "Restaurants & cafés", "inventory"],
    ["clinics", "Clinics & pharmacies", "overview"], ["services", "Offices & services (general)", "overview"]];
  const COUNTRIES = ["United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "Pakistan", "India", "Belgium", "United Kingdom"];
  const FIELDS = [["name", "Company or person name", "text", 200], ["contact_person", "Contact person", "text", 120], ["category", "Business type", "text", 80],
    ["email", "Email", "email", 254], ["whatsapp", "WhatsApp (with country code)", "tel", 20], ["phone", "Phone", "tel", 40], ["website", "Website", "url", 300],
    ["address", "Address", "text", 400], ["city", "City", "text", 80], ["country", "Country", "text", 80]];
  const blankForm = () => ({ id: null, kind: "company", name: "", contact_person: "", category: "", email: "", whatsapp: "", phone: "", website: "", address: "", city: "", country: "United Arab Emirates", notes: "", tags: "", priority: "normal", next_follow_up: "" });

  // ---- small UI helpers (compact, like the wallet panel) -----------------------------------------
  const b = (act, label, icon = "", { primary = false, danger = false, data = "", disabled = false, title = "" } = {}) =>
    `<button type="button" class="tm-mk-b${primary ? " is-primary" : ""}${danger ? " is-danger" : ""}" data-dp-act="${act}"${data ? " " + data : ""}${disabled ? " disabled" : ""}${title ? ` title="${esc(title)}"` : ""}>${icon ? `<i class="${icon}" aria-hidden="true"></i>` : ""}${label ? `<span>${esc(label)}</span>` : ""}</button>`;
  const ib = (act, title, icon, data = "", extra = "") => `<button type="button" class="tm-mk-ib${extra ? " " + extra : ""}" data-dp-act="${act}" ${data} title="${esc(title)}" aria-label="${esc(title)}"><i class="${icon}" aria-hidden="true"></i></button>`;
  const field = (label, inner, hint = "") => `<label class="tm-mk-field"><span>${esc(label)}${hint ? ` <em>${esc(hint)}</em>` : ""}</span>${inner}</label>`;
  const sel = (attr, value, opts, extra = "") => `<select class="tm-mk-in" data-mk="${attr}"${extra}>${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const inp = (attr, value, { type = "text", max = 200, ph = "", extra = "" } = {}) => `<input class="tm-mk-in" type="${type}" data-mk="${attr}" value="${esc(value ?? "")}" maxlength="${max}" placeholder="${esc(ph)}" autocomplete="off"${extra}>`;
  const sec = (title, body, right = "") => `<section class="tm-mk-sec"><header><h3>${esc(title)}</h3>${right ? `<div>${right}</div>` : ""}</header>${body}</section>`;
  const tplOptions = () => (T()?.list() || []).map(t => [t.id, t.name]);
  const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";

  // ---- helpers: files, helper, zip --------------------------------------------------------------
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
  function download(blob, name){
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  const fileName = (company, subject) => `${String(subject || company || "Triplem VIP").replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 110)}.eml`;
  function mountPreview(host, html){
    if (!host || !html) return;
    const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;contain:content}a{pointer-events:none}</style>${m ? m[1] : ""}`;
  }
  function loadScript(src, test){
    if (test()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script"); s.src = src; s.async = true;
      s.onload = () => test() ? resolve() : reject(new Error("A component could not be loaded."));
      s.onerror = () => reject(new Error("A component could not be loaded. Check your connection."));
      document.head.appendChild(s);
    });
  }
  async function zipFiles(files){
    await loadScript("Assets/app/backup/04-system-backup-engine.js?v=20261117-sysbackup3", () => !!global.TriplemSystemBackupEngine?.ZipWriter);
    const parts = []; const zw = new global.TriplemSystemBackupEngine.ZipWriter({ write: async bytes => { parts.push(bytes); } });
    const enc = new TextEncoder(); const used = new Set();
    for (const f of files) {
      let n = f.name, i = 2; while (used.has(n)) n = f.name.replace(/\.eml$/, ` (${i++}).eml`); used.add(n);
      await zw.add(n, enc.encode(f.text));
    }
    await zw.finish();
    return new Blob(parts, { type: "application/zip" });
  }
  // CSV (RFC 4180) with spreadsheet-formula protection on export.
  function parseCsv(text){
    const rows = []; let row = [], cur = "", q = false;
    const s = String(text || "").replace(/^﻿/, "");
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
      if (c === '"') q = true; else if (c === "," || c === ";" || c === "\t") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; } else if (c !== "\r") cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim()));
  }
  const csvCell = v => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const HEADER_MAP = { name: "name", company: "name", "company name": "name", business: "name", email: "email", "e-mail": "email", whatsapp: "whatsapp", mobile: "whatsapp",
    phone: "phone", telephone: "phone", website: "website", web: "website", url: "website", city: "city", country: "country", category: "category", "business type": "category",
    industry: "category", "contact person": "contact_person", contact: "contact_person", person: "contact_person", address: "address", notes: "notes", note: "notes",
    tags: "tags", tag: "tags", type: "kind", kind: "kind", priority: "priority" };

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
    if (!res.ok) { const err = new Error(String(data?.error || `Search failed (${res.status})`)); err.code = data?.code || ""; throw err; }
    return data;
  }

  // Fallback when the public map services refuse the server's shared cloud address: the same
  // progressive OpenStreetMap queries run over this computer's own connection; the server then
  // checks the results (action "enrich") exactly like a normal search.
  async function browserSearch(f, onStage){
    const base = { category: f.category, city: f.city, country: f.country, keyword: f.keyword, limit: Number(f.limit) };
    let plan;
    try { plan = await finderCall({ action: "plan", ...base }); }
    catch (e) {
      if (e.code !== "geocode_unreachable") throw e;
      onStage("Finding the city from this computer…");
      const u = new URL("https://nominatim.openstreetmap.org/search");
      u.searchParams.set("q", [f.city, f.country].filter(Boolean).join(", ")); u.searchParams.set("format", "jsonv2"); u.searchParams.set("limit", "1"); u.searchParams.set("accept-language", "en");
      const r = await withTimeout(fetch(u.href, { headers: { Accept: "application/json" } }), 10000);
      const list = r.ok ? await r.json().catch(() => []) : [];
      if (!list[0]) throw new Error(`“${f.city}” was not found on the map. Check the city and country.`);
      plan = await finderCall({ action: "plan", ...base, lat: Number(list[0].lat), lon: Number(list[0].lon), label: String(list[0].display_name || f.city) });
    }
    const steps = plan.steps?.length ? plan.steps : [{ query: plan.query_small }, { query: plan.query }];
    const seen = new Map(); const tried = []; let okSteps = 0, partial = false;
    const started = Date.now();
    for (let i = 0; i < steps.length; i++) {
      if (Date.now() - started > 45000) { partial = okSteps > 0; break; }
      onStage(i === 0 ? "Searching the city centre from this computer…" : "Widening the search area…");
      let got = null;
      for (const url of plan.endpoints || []) {
        const host = new URL(url).hostname;
        try {
          const r = await withTimeout(fetch(url, { method: "POST", body: new URLSearchParams({ data: steps[i].query }), headers: { Accept: "application/json" } }), ((steps[i].timeout || 18) + 5) * 1000);
          if (!r.ok) { tried.push(`${host} ${r.status}`); continue; }
          const d = await r.json();
          if (Array.isArray(d?.elements) && !(d.elements.length === 0 && /timed out|runtime error/i.test(String(d.remark || "")))) { got = d.elements; break; }
          tried.push(`${host} ${/timed out/i.test(String(d?.remark || "")) ? "timeout" : "bad answer"}`);
        } catch (err) { tried.push(`${host} ${err?.message === "timeout" ? "timeout" : "unreachable"}`); }
      }
      if (!got) { partial = okSteps > 0; break; }
      okSteps++;
      got.forEach(x => seen.set(`${x.type}/${x.id}`, x));
      if (seen.size >= Number(f.limit) * 1.5) break;
    }
    if (!okSteps) throw new Error(`The business map servers did not answer from this computer either (${tried.join(", ")}). Please try again in a few minutes.`);
    const slim = [...seen.values()].slice(0, 1500).map(x => ({ type: x.type, id: x.id, lat: x.lat, lon: x.lon, center: x.center, tags: x.tags }));
    return finderCall({ action: "enrich", ...base, elements: slim, place: plan.place, partial });
  }

  async function open(opts = {}){
    const dp = DP(); const k = dp?.kit;
    if (!dp?.custom?.open || !k || !isMainAdmin()) return false;
    const st = {
      loading: true, err: "", items: [], counts: {}, tagList: [], filter: "all", search: "", layout: "list",
      view: null, detail: null, detailErr: "", previewHtml: null, formOpen: false,
      emailTpl: "overview", waTpl: "overview", note: "", subject: "", reason: "", confirmDelete: false, busy: "",
      act: { kind: "note", text: "", follow: "" }, tagInput: "",
      selecting: false, picked: new Set(), bulk: { status: "", priority: "", tag: "", follow: "" }, confirmBulkDelete: false,
      form: blankForm(), formBusy: false,
      stats: null, statsErr: "",
      camp: { list: null, name: "", channel: "email", template: "overview", audience: "selected", onlyNew: true, mode: "outlook", run: null },
      finder: { category: "insurance", city: "Dubai", country: "United Arab Emirates", keyword: "", limit: "40", scan: true, busy: false, err: "", results: null, place: "", selected: new Set(), attribution: "", template: "insurance", scanning: 0, partial: false },
      settings: null, settingsBusy: false, tpl: "overview", tplEdit: null, helper: null, importInfo: null
    };
    const R = (o = { keepScroll: true }) => dp.custom.render(o);

    async function loadList(){
      st.loading = !st.items.length; st.err = ""; R();
      try {
        const d = await supabaseRpc("app_marketing_list", { p_search: st.search || null, p_filter: st.filter, p_limit: 1000, p_offset: 0 });
        st.items = d?.items || []; st.counts = d?.counts || {}; st.tagList = d?.tags || [];
        const ids = new Set(st.items.map(x => x.id)); st.picked = new Set([...st.picked].filter(id => ids.has(id)));
      } catch (e) { st.err = String(e?.message || e || "Could not load Marketing."); }
      st.loading = false; R();
    }
    async function loadStats(){
      st.statsErr = "";
      try { st.stats = await supabaseRpc("app_marketing_stats", {}); } catch (e) { st.statsErr = String(e?.message || e); }
      R();
    }
    async function loadCampaigns(){
      try { st.camp.list = (await supabaseRpc("app_marketing_campaigns", {}))?.items || []; } catch (e) { st.camp.list = []; dp.toast(String(e?.message || e), false); }
      R();
    }
    async function loadDetail(id){
      st.view = id; st.detail = null; st.detailErr = ""; st.confirmDelete = false; st.note = ""; st.subject = ""; st.reason = ""; st.previewHtml = null;
      st.act = { kind: "note", text: "", follow: "" }; st.tagInput = ""; R({ keepScroll: false });
      try {
        st.detail = await supabaseRpc("app_marketing_get", { p_id: id });
        const it = st.detail.item;
        const cat = CATEGORIES.find(c => c[1] === it.category);
        st.emailTpl = st.waTpl = cat ? cat[2] : (it.last_email_template || "overview");
      } catch (e) { st.detailErr = String(e?.message || e); }
      R({ keepScroll: false });
    }
    async function refreshDetail(){ if (st.detail?.item?.id) { try { st.detail = await supabaseRpc("app_marketing_get", { p_id: st.detail.item.id }); } catch (_) {} } }
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

    // ---- email and WhatsApp (one contact or a campaign) ------------------------------------------
    async function buildDraft(contactId, template, campaignId, note = "", subject = ""){
      const tpl = T();
      const prep = await supabaseRpc("app_marketing_prepare_email", { p_id: contactId, p_template: template, p_campaign: campaignId || null });
      const mail = tpl.buildEmail({ template, contact: prep.item, settings: prep.settings, token: prep.token, note, subject });
      const eml = tpl.buildEml({ to: prep.item.email, toName: prep.item.contact_person || prep.item.name, subject: mail.subject, html: mail.html, text: mail.text,
        unsubscribeUrl: mail.unsubscribeUrl, replyTo: prep.settings?.email || "info@triplem.vip", logoBase64: await logoBase64(), template: mail.template });
      return { item: prep.item, name: fileName(prep.item.name, mail.subject), eml };
    }
    async function toOutlook(d){
      const r = await withTimeout(fetch(`${HELPER}/open?name=${encodeURIComponent(d.name)}`, { method: "POST", body: new Blob([d.eml], { type: "message/rfc822" }), mode: "cors", cache: "no-store" }), 4000);
      if (!r.ok) throw new Error("helper");
    }
    async function email(mode){
      const it = st.detail?.item; if (!it || !T()) return;
      await act(mode, async () => {
        const d = await buildDraft(it.id, st.emailTpl, null, st.note, st.subject);
        patchItem(d.item);
        if (mode === "outlook") {
          try { await toOutlook(d); st.helper = true; dp.toast("Opened in Outlook. Check it and press Send."); }
          catch (_) { st.helper = false; download(new Blob([d.eml], { type: "message/rfc822" }), d.name); dp.toast("Outlook helper not running: the email was downloaded. Open the .eml file to send it from Outlook.", false); }
        } else { download(new Blob([d.eml], { type: "message/rfc822" }), d.name); dp.toast("Email downloaded (.eml). Open it to send from Outlook."); }
        st.note = ""; st.subject = "";
        await refreshDetail();
      });
    }
    function whatsapp(contact, template, campaignId, after){
      const tpl = T(); if (!contact || !tpl) return;
      const text = tpl.buildWhatsApp({ template, contact, settings: st.settings || {} });
      const url = tpl.whatsappUrl(contact.whatsapp, text);
      if (!url) return;
      const w = global.open(url, "_blank");
      if (w) { try { w.opener = null; } catch (_) {} }
      act("wa", async () => {
        const d = await supabaseRpc("app_marketing_whatsapp_opened", { p_id: contact.id, p_template: template, p_campaign: campaignId || null });
        patchItem(d.item);
        if (after) await after(d.item);
        if (!w) dp.toast("Allow pop-ups for triplem.vip to open WhatsApp.", false);
      });
    }

    // ---- campaigns --------------------------------------------------------------------------------
    function audience(){
      const c = st.camp, ch = c.channel;
      const base = c.audience === "selected" ? st.items.filter(x => st.picked.has(x.id)) : st.items.filter(x =>
        c.audience === "all" ? true : c.audience === "due" ? (x.next_follow_up && x.next_follow_up <= today()) : c.audience === "high" ? x.priority === "high"
          : c.audience.startsWith("tag:") ? (x.tags || []).includes(c.audience.slice(4)) : x.status === c.audience);
      const ok = [], skip = [];
      for (const x of base) {
        const why = ch === "email"
          ? (!x.email ? "no email" : x.email_status === "unsubscribed" ? "unsubscribed" : x.email_status === "bounced" ? "bounced" : (c.onlyNew && x.emails_drafted > 0) ? "already emailed" : "")
          : (!x.whatsapp ? "no WhatsApp" : x.whatsapp_status !== "ok" ? "replied STOP" : (c.onlyNew && x.whatsapp_opened > 0) ? "already messaged" : "");
        (why ? skip : ok).push(why ? { x, why } : x);
      }
      return { ok, skip, total: base.length };
    }
    async function runEmailCampaign(){
      const c = st.camp, a = audience();
      if (!a.ok.length) { dp.toast("Nobody in this audience can be emailed.", false); return; }
      if (a.ok.length > 50) { dp.toast("Email at most 50 contacts per run. Narrow the audience (filter, tag or select).", false); return; }
      const k0 = (await supabaseRpc("app_marketing_campaign_start", { p_name: c.name || null, p_channel: "email", p_template: c.template, p_planned: a.ok.length }))?.campaign;
      c.run = { id: k0.id, name: k0.name, channel: "email", rows: a.ok.map(x => ({ id: x.id, name: x.name, state: "waiting" })).concat(a.skip.map(s => ({ id: s.x.id, name: s.x.name, state: "skipped", why: s.why }))), done: false, zip: c.mode === "zip" };
      R();
      let useHelper = c.mode === "outlook" && await helperRunning();
      const files = []; let sent = 0;
      for (const row of c.run.rows.filter(r => r.state === "waiting")) {
        row.state = "working"; R();
        try {
          const d = await buildDraft(row.id, c.template, k0.id);
          patchItem(d.item);
          if (useHelper) {
            try { await toOutlook(d); row.state = "outlook"; }
            catch (_) { useHelper = false; files.push({ name: d.name, text: d.eml }); row.state = "zip"; }
            await new Promise(r => setTimeout(r, 700));
          } else { files.push({ name: d.name, text: d.eml }); row.state = "zip"; }
          sent++;
        } catch (e) { row.state = "skipped"; row.why = String(e?.message || e).slice(0, 80); }
        R();
      }
      if (files.length) {
        const blob = await zipFiles(files);
        download(blob, `${(c.run.name || "Triplem VIP campaign").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80)}.zip`);
        dp.toast(`${files.length} email${files.length === 1 ? "" : "s"} saved in a ZIP. Unzip and open each .eml to send it from Outlook.`);
      } else if (sent) dp.toast(`${sent} email${sent === 1 ? "" : "s"} opened in Outlook. Check each and press Send.`);
      await supabaseRpc("app_marketing_campaign_finish", { p_id: k0.id, p_sent: sent, p_skipped: c.run.rows.length - sent });
      c.run.done = true; c.list = null; R();
    }
    async function startWhatsAppCampaign(){
      const c = st.camp, a = audience();
      if (!a.ok.length) { dp.toast("Nobody in this audience can get a WhatsApp message.", false); return; }
      const k0 = (await supabaseRpc("app_marketing_campaign_start", { p_name: c.name || null, p_channel: "whatsapp", p_template: c.template, p_planned: a.ok.length }))?.campaign;
      c.run = { id: k0.id, name: k0.name, channel: "whatsapp", queue: a.ok.map(x => x.id), pos: 0, sent: 0, skipped: a.skip.length, done: false };
      R();
    }
    async function finishWhatsApp(){
      const r = st.camp.run; if (!r || r.done) return;
      r.done = true;
      try { await supabaseRpc("app_marketing_campaign_finish", { p_id: r.id, p_sent: r.sent, p_skipped: r.skipped + (r.queue.length - r.pos) }); } catch (_) {}
      st.camp.list = null; R();
    }

    // ---- rendering -------------------------------------------------------------------------------
    const pill = (t, tone = "", icon = "") => k.pill(t, tone, icon);
    const emailPill = it => it.email_status === "unsubscribed" ? pill("Unsubscribed", "bad", "fa-solid fa-ban")
      : it.email_status === "bounced" ? pill("Bounced", "bad", "fa-solid fa-triangle-exclamation") : "";
    const duePill = it => it.next_follow_up ? (it.next_follow_up < today() ? pill(`Overdue ${day(it.next_follow_up)}`, "bad", "fa-regular fa-clock") : it.next_follow_up === today() ? pill("Follow up today", "warn", "fa-regular fa-clock") : "") : "";
    const star = it => it.priority === "high" ? `<i class="fa-solid fa-star tm-mk-star" title="High priority" aria-label="High priority"></i>` : "";
    const tagChips = (tags, max = 3) => (tags || []).slice(0, max).map(t => `<span class="tm-mk-tag">#${esc(t)}</span>`).join("") + ((tags || []).length > max ? `<span class="tm-mk-tag">+${(tags || []).length - max}</span>` : "");
    const locked = () => `<div class="tm-mk">${k.note(`The Admin Security Key is locked. Unlock it, then open Marketing again. ${b("mk-unlock", "Unlock", "fa-solid fa-lock-open", { primary: true })}`, "warn", "fa-solid fa-key")}</div>`;

    function overviewHtml(){
      if (!st.stats && !st.statsErr) { loadStats(); return k.skel(6); }
      if (st.statsErr) return keyLocked(st.statsErr) ? locked() : k.note(esc(st.statsErr), "warn") + b("mk-stats", "Try again", "fa-solid fa-rotate");
      const s = st.stats, t = s.totals || {}, f = s.funnel || {};
      const kpis = [[num(t.contacts), "Contacts", "fa-solid fa-address-book"], [num(t.reachable), "Reachable", "fa-solid fa-signal"],
        [num(t.emailed_contacts), "Emailed", "fa-regular fa-envelope"], [`${num(t.opened_contacts)} <small>${pct(t.opened_contacts, t.emailed_contacts)}</small>`, "Opened the link", "fa-solid fa-arrow-pointer"],
        [num((f.interested || 0) + (f.client || 0)), "Interested + clients", "fa-solid fa-fire"], [num(t.unsubscribed), "Unsubscribed", "fa-solid fa-ban"]];
      const maxF = Math.max(1, ...STATUSES.map(([v]) => f[v] || 0));
      const funnel = STATUSES.map(([v, l]) => `<li><span>${esc(l)}</span><i style="--w:${Math.round((f[v] || 0) * 100 / maxF)}%" class="is-${v}"></i><b>${num(f[v] || 0)}</b></li>`).join("");
      const days = s.days || [];
      const maxD = Math.max(1, ...days.map(d => d.emails + d.whatsapp + d.opens));
      const bars = days.map(d => `<span class="tm-mk-bar" title="${esc(day(d.day))}: ${d.emails} email, ${d.whatsapp} WhatsApp, ${d.opens} opened"><i class="e" style="height:${d.emails * 100 / maxD}%"></i><i class="w" style="height:${d.whatsapp * 100 / maxD}%"></i><i class="o" style="height:${d.opens * 100 / maxD}%"></i></span>`).join("");
      const due = (s.due || []).map(it => `<li><button type="button" class="tm-mk-mini" data-dp-act="mk-open" data-id="${esc(it.id)}"><b>${star(it)} ${esc(it.name)}</b><small>${esc(it.next_follow_up < today() ? "Overdue · " : it.next_follow_up === today() ? "Today · " : "")}${esc(day(it.next_follow_up))} · ${esc(statusLabel(it.status))}</small></button></li>`).join("");
      const evLabel = e => ({ email_drafted: "Email", whatsapp_opened: "WhatsApp", link_opened: "Opened the link", unsubscribed: "Unsubscribed", reply: "Replied", call: "Call", meeting: "Meeting", note: "Note", created: "Added", status: "Status", follow_up: "Follow-up set", deleted: "Deleted" }[e.kind] || e.kind);
      const recent = (s.recent || []).slice(0, 8).map(e => `<li><button type="button" class="tm-mk-mini" data-dp-act="mk-open" data-id="${esc(e.id)}"><b>${esc(evLabel(e))}</b><small>${esc(e.contact)} · ${esc(when(e.at))}</small></button></li>`).join("");
      const tops = (list) => (list || []).map(x => `<li><span>${esc(x.label)}</span><b>${num(x.count)}</b></li>`).join("");
      return `<div class="tm-mk">
        <div class="tm-mk-kpis">${kpis.map(([v, l, i]) => `<div><i class="${i}" aria-hidden="true"></i><b>${v}</b><small>${esc(l)}</small></div>`).join("")}</div>
        ${t.due ? `<button type="button" class="tm-mk-alert" data-dp-act="mk-filter" data-v="due" data-go="contacts"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${num(t.due)} follow-up${t.due === 1 ? "" : "s"} due today or overdue <span>Open</span></button>` : ""}
        ${sec("Pipeline", `<ul class="tm-mk-funnel">${funnel}</ul>`)}
        ${sec("Last 30 days", `<div class="tm-mk-chart" role="img" aria-label="Emails, WhatsApp messages and link openings per day">${bars}</div>
          <p class="tm-mk-legend"><span class="e"></span>Emails ${num(days.reduce((a, d) => a + d.emails, 0))} <span class="w"></span>WhatsApp ${num(days.reduce((a, d) => a + d.whatsapp, 0))} <span class="o"></span>Opened ${num(days.reduce((a, d) => a + d.opens, 0))}</p>`)}
        <div class="tm-mk-two">
          ${sec("Follow-ups (7 days)", due ? `<ul class="tm-mk-minis">${due}</ul>` : `<p class="tm-mk-muted">Nothing planned. Set a follow-up date on a contact.</p>`)}
          ${sec("Recent activity", recent ? `<ul class="tm-mk-minis">${recent}</ul>` : `<p class="tm-mk-muted">No activity yet.</p>`)}
        </div>
        <div class="tm-mk-two">
          ${sec("Top business types", (s.by_category || []).length ? `<ul class="tm-mk-tops">${tops(s.by_category)}</ul>` : `<p class="tm-mk-muted">—</p>`)}
          ${sec("Top cities", (s.by_city || []).length ? `<ul class="tm-mk-tops">${tops(s.by_city)}</ul>` : `<p class="tm-mk-muted">—</p>`)}
        </div>
        <p class="tm-mk-hint">“Opened the link” counts people who pressed the button in your email (a visit to triplem.vip). Email programs that check links can also count.</p>
      </div>`;
    }

    function listHtml(){
      if (st.loading) return k.skel(6);
      if (st.err && keyLocked(st.err)) return locked();
      if (st.err) return `<div class="tm-mk">${k.note(esc(st.err), "warn", "fa-solid fa-triangle-exclamation")}${b("mk-reload", "Try again", "fa-solid fa-rotate")}</div>`;
      const c = st.counts || {};
      const filters = [["all", `All (${c.all ?? 0})`], ...STATUSES.map(([v, l]) => [v, `${l} (${c[v] ?? 0})`]), ["due", `Follow-up due (${c.due ?? 0})`], ["high", `High priority (${c.high ?? 0})`],
        ["unsubscribed", `Unsubscribed (${c.unsubscribed ?? 0})`], ...(st.tagList || []).map(t => [`tag:${t.tag}`, `#${t.tag} (${t.count})`])];
      const quick = [["all", "All"], ["new", "New"], ["interested", "Interested"], ["due", "Due"], ["unsubscribed", "Unsubscribed"]];
      const tools = `<div class="tm-mk-tools">
          <label class="tm-mk-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input class="tm-mk-in" type="search" data-mk="search" value="${esc(st.search)}" placeholder="Search name, email, city, #tag…" autocomplete="off" aria-label="Search contacts"></label>
          ${sel("filter", st.filter, filters, ' aria-label="Filter"')}
          <span class="tm-mk-seg2" role="group" aria-label="View">${ib("mk-layout", "List", "fa-solid fa-list", 'data-v="list"', st.layout === "list" ? "is-on" : "")}${ib("mk-layout", "Board", "fa-solid fa-table-columns", 'data-v="board"', st.layout === "board" ? "is-on" : "")}</span>
        </div>
        <div class="tm-mk-tools is-row2">
          <div class="tm-mk-quick">${quick.map(([v, l]) => `<button type="button" class="tm-mk-q${st.filter === v ? " is-on" : ""}${v === "unsubscribed" ? " is-bad" : ""}" data-dp-act="mk-filter" data-v="${v}">${esc(l)}${c[v] ? ` <b>${num(c[v])}</b>` : ""}</button>`).join("")}</div>
          <span class="tm-mk-acts">${b("mk-select", st.selecting ? "Done" : "Select", st.selecting ? "fa-solid fa-check" : "fa-regular fa-square-check")}${b("mk-new", "Add", "fa-solid fa-plus")}${b("mk-import", "Import", "fa-solid fa-file-import")}${b("mk-export", "Export", "fa-solid fa-file-export")}</span>
        </div>
        <input type="file" accept=".csv,text/csv" data-mk-file="csv" hidden>
        ${st.importInfo ? k.note(st.importInfo, "info", "fa-solid fa-file-import") : ""}`;
      const bulkBar = st.selecting ? `<div class="tm-mk-bulk">
          <b>${num(st.picked.size)} selected</b> ${b("mk-pick-all", st.picked.size === st.items.length && st.items.length ? "Clear" : "All shown", "")}
          <span class="tm-mk-bulk-acts">
            ${b("mk-bulk-email", "Email", "fa-regular fa-envelope", { disabled: !st.picked.size })}${b("mk-bulk-wa", "WhatsApp", "fa-brands fa-whatsapp", { disabled: !st.picked.size })}
            ${sel("bulk.status", st.bulk.status, [["", "Status…"], ...STATUSES.map(([v, l]) => [v, l])], st.picked.size ? "" : " disabled")}
            ${sel("bulk.priority", st.bulk.priority, [["", "Priority…"], ...PRIORITY], st.picked.size ? "" : " disabled")}
            <span class="tm-mk-inline">${inp("bulk.tag", st.bulk.tag, { max: 30, ph: "Add #tag" })}${ib("mk-bulk-tag", "Add tag", "fa-solid fa-hashtag")}</span>
            <span class="tm-mk-inline">${inp("bulk.follow", st.bulk.follow, { type: "date" })}${ib("mk-bulk-follow", "Set follow-up", "fa-regular fa-clock")}</span>
            ${st.confirmBulkDelete ? b("mk-bulk-del-yes", `Delete ${st.picked.size}`, "fa-solid fa-trash", { danger: true }) + b("mk-bulk-del-no", "Keep", "") : b("mk-bulk-del", "Delete", "fa-regular fa-trash-can", { danger: true, disabled: !st.picked.size })}
          </span></div>` : "";
      if (!st.items.length) return `<div class="tm-mk">${tools}${k.empty(st.search || st.filter !== "all" ? "No contacts match." : "No contacts yet. Use Find new, Add or Import to start your list.")}</div>`;
      if (st.layout === "board") {
        const cols = STATUSES.map(([v, l]) => {
          const cards = st.items.filter(x => x.status === v).slice(0, 60).map(it => `<li><button type="button" class="tm-mk-card" data-dp-act="mk-open" data-id="${esc(it.id)}"><b>${star(it)} ${esc(it.name)}</b><small>${esc([it.city, it.category].filter(Boolean).join(" · ") || "—")}</small>${emailPill(it) || duePill(it)}</button>
            <span class="tm-mk-move">${v !== STATUSES[0][0] ? ib("mk-move", "Move left", "fa-solid fa-chevron-left", `data-id="${esc(it.id)}" data-dir="-1"`) : ""}${v !== STATUSES[STATUSES.length - 1][0] ? ib("mk-move", "Move right", "fa-solid fa-chevron-right", `data-id="${esc(it.id)}" data-dir="1"`) : ""}</span></li>`).join("");
          return `<section class="tm-mk-col is-${v}"><header><b>${esc(l)}</b><span>${num(st.items.filter(x => x.status === v).length)}</span></header><ul>${cards || `<li class="tm-mk-muted">—</li>`}</ul></section>`;
        }).join("");
        return `<div class="tm-mk">${tools}<div class="tm-mk-board">${cols}</div></div>`;
      }
      const rows = st.items.map(it => `
        <li class="${st.picked.has(it.id) ? "is-picked" : ""}">${st.selecting ? `<label class="tm-mk-pick"><input type="checkbox" data-mk-pick-c="${esc(it.id)}"${st.picked.has(it.id) ? " checked" : ""} aria-label="Select ${esc(it.name)}"></label>` : ""}
          <button type="button" class="tm-mk-row" data-dp-act="${st.selecting ? "mk-toggle" : "mk-open"}" data-id="${esc(it.id)}">
          <span class="tm-mk-av${it.kind === "individual" ? " is-person" : ""}" aria-hidden="true">${esc(initials(it.name))}</span>
          <span class="tm-mk-main"><b>${star(it)} ${esc(it.name)}</b><small>${esc([it.category, it.city].filter(Boolean).join(" · ") || (it.kind === "individual" ? "Individual" : "Company"))}${(it.tags || []).length ? " · " : ""}${tagChips(it.tags, 2)}</small></span>
          <span class="tm-mk-meta">
            <span class="tm-mk-ch" aria-label="Channels">${it.email ? `<i class="fa-regular fa-envelope${it.email_status !== "subscribed" ? " is-off" : ""}" title="${esc(it.email)}"></i>` : ""}${it.whatsapp ? `<i class="fa-brands fa-whatsapp${it.whatsapp_status !== "ok" ? " is-off" : ""}" title="+${esc(it.whatsapp)}"></i>` : ""}${it.link_opens ? `<i class="fa-solid fa-arrow-pointer is-hot" title="Opened the link ${esc(String(it.link_opens))}×"></i>` : ""}</span>
            ${duePill(it)}${emailPill(it)}${pill(statusLabel(it.status), STATUS_TONE[it.status] || "")}
          </span></button></li>`).join("");
      return `<div class="tm-mk">${tools}${bulkBar}<ul class="tm-mk-list">${rows}</ul>${st.items.length >= 1000 ? `<p class="tm-mk-hint">Showing the first 1,000. Search or filter to narrow down.</p>` : ""}</div>`;
    }

    function detailHtml(){
      const back = `<button type="button" class="tm-mk-back" data-dp-act="mk-back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> All contacts</button>`;
      if (st.detailErr) return `<div class="tm-mk">${back}${k.note(esc(st.detailErr), "warn")}</div>`;
      if (!st.detail) return `<div class="tm-mk">${back}${k.skel(6)}</div>`;
      const it = st.detail.item, ev = st.detail.events || [];
      const unsub = it.email_status === "unsubscribed", bounced = it.email_status === "bounced", waOff = it.whatsapp_status !== "ok";
      const busy = st.busy;
      const quick = `<div class="tm-mk-quickacts">
          ${it.email && !unsub && !bounced ? b("mk-outlook", busy === "outlook" ? "Opening…" : "Email", "fa-regular fa-envelope", { primary: true, disabled: !!busy }) : ""}
          ${it.whatsapp && !waOff ? b("mk-wa", "WhatsApp", "fa-brands fa-whatsapp", { disabled: !!busy }) : ""}
          ${it.phone || it.whatsapp ? `<a class="tm-mk-b" href="tel:${esc(String(it.phone || "+" + it.whatsapp).replace(/[^0-9+]/g, ""))}"><i class="fa-solid fa-phone" aria-hidden="true"></i><span>Call</span></a>` : ""}
          ${it.website ? `<a class="tm-mk-b" href="${esc(it.website)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-globe" aria-hidden="true"></i><span>Website</span></a>` : ""}
          ${b("mk-edit", "Edit", "fa-solid fa-pen")}
        </div>`;
      const statusRow = `<div class="tm-mk-status" role="group" aria-label="Status">${STATUSES.map(([v, l, ic]) =>
        `<button type="button" class="tm-mk-st${it.status === v ? " is-on" : ""}" data-dp-act="mk-status" data-v="${v}"${busy ? " disabled" : ""}><i class="${ic}" aria-hidden="true"></i> ${esc(l)}</button>`).join("")}</div>`;
      const plan = `<div class="tm-mk-plan">
          <div><span class="tm-mk-lbl">Priority</span><span class="tm-mk-seg2">${PRIORITY.map(([v, l]) => `<button type="button" class="tm-mk-sg${it.priority === v ? " is-on" : ""}" data-dp-act="mk-priority" data-v="${v}">${v === "high" ? '<i class="fa-solid fa-star" aria-hidden="true"></i> ' : ""}${esc(l)}</button>`).join("")}</span></div>
          <div><span class="tm-mk-lbl">Follow-up</span><span class="tm-mk-inline">${inp("followDate", it.next_follow_up || "", { type: "date" })}${ib("mk-follow", "Save date", "fa-solid fa-check")}${b("mk-follow-q", "+1d", "", { data: 'data-days="1"' })}${b("mk-follow-q", "+3d", "", { data: 'data-days="3"' })}${b("mk-follow-q", "+1w", "", { data: 'data-days="7"' })}${it.next_follow_up ? ib("mk-follow-clear", "Clear", "fa-solid fa-xmark") : ""}</span></div>
          <div><span class="tm-mk-lbl">Tags</span><span class="tm-mk-tags-edit">${(it.tags || []).map(t => `<span class="tm-mk-tag">#${esc(t)} <button type="button" data-dp-act="mk-tag-rm" data-v="${esc(t)}" aria-label="Remove ${esc(t)}">×</button></span>`).join("")}<span class="tm-mk-inline">${inp("tagInput", st.tagInput, { max: 30, ph: "add tag" })}${ib("mk-tag-add", "Add tag", "fa-solid fa-plus")}</span></span></div>
        </div>`;
      const emailBox = !it.email ? `<p class="tm-mk-muted">No email address. Edit the contact to add one.</p>`
        : unsub ? k.statusCard("Unsubscribed from emails", `${esc(it.email)} unsubscribed ${esc(when(it.unsubscribed_at))}${it.unsubscribe_source === "link" ? " with the link in our email" : " (marked by an admin)"}. Triplem VIP will not create emails to this address.`, "bad")
          + `<details class="tm-mk-more"><summary>Allow emails again</summary>${field("Reason (required)", inp("reason", st.reason, { max: 300, ph: "For example: asked by email on 1 Dec to receive offers" }))}
            <div class="tm-mk-foot">${b("mk-resub", "Allow emails again", "fa-solid fa-rotate-left", { disabled: !!busy })}</div></details>`
        : bounced ? k.statusCard("Emails bounced", `Check ${esc(it.email)} before emailing again.`, "warn") + `<div class="tm-mk-foot">${b("mk-resub-bounce", "Address is correct now", "fa-solid fa-check")}</div>`
        : `<div class="tm-mk-grid">${field("Template", sel("emailTpl", st.emailTpl, tplOptions()))}
             ${field("Subject", inp("subject", st.subject, { max: 180, ph: T()?.buildEmail({ template: st.emailTpl, contact: it, settings: st.settings || {}, token: "x" }).subject || "" }), "optional")}</div>
           ${field("Personal note", `<textarea class="tm-mk-in" data-mk="note" rows="2" maxlength="1200" placeholder="Optional first paragraph, for example how you know them">${esc(st.note)}</textarea>`, "optional")}
           <div class="tm-mk-foot is-left">
             ${b("mk-outlook", busy === "outlook" ? "Opening…" : "Open in Outlook", "fa-solid fa-envelope-open-text", { primary: true, disabled: !!busy })}
             ${b("mk-eml", busy === "eml" ? "Preparing…" : ".eml", "fa-solid fa-download", { disabled: !!busy, title: "Download the email as a file" })}
             ${b("mk-preview", "Preview", "fa-regular fa-eye")}
             <span class="tm-mk-hint">${st.helper === false ? '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Outlook helper not found: the email will be downloaded.' : st.helper ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Outlook helper running.' : ""}</span>
           </div>
           <details class="tm-mk-more"><summary>Mark as unsubscribed or bounced</summary><div class="tm-mk-foot is-left">${b("mk-unsub", "Mark unsubscribed", "fa-solid fa-ban", { danger: true })}${b("mk-bounce", "Mark bounced", "fa-solid fa-triangle-exclamation")}</div></details>`;
      const waBox = !it.whatsapp ? `<p class="tm-mk-muted">No WhatsApp number. Edit the contact to add one.</p>`
        : waOff ? k.statusCard("Asked not to get WhatsApp messages", "Do not message this number.", "bad") + `<div class="tm-mk-foot">${b("mk-wa-on", "Allow WhatsApp again", "fa-solid fa-rotate-left")}</div>`
        : `${field("Message", sel("waTpl", st.waTpl, tplOptions()))}
           <pre class="tm-mk-wa">${esc(T()?.buildWhatsApp({ template: st.waTpl, contact: it, settings: st.settings || {} }) || "")}</pre>
           <div class="tm-mk-foot is-left">${b("mk-wa", "Open WhatsApp", "fa-brands fa-whatsapp", { primary: true, disabled: !!busy })}${b("mk-wa-copy", "Copy", "fa-regular fa-copy")}${b("mk-wa-off", "Replied STOP", "fa-solid fa-hand", { danger: true })}</div>`;
      const logBox = `<div class="tm-mk-log">
          <span class="tm-mk-seg2" role="group" aria-label="Activity type">${ACTIVITY.map(([v, l, i]) => `<button type="button" class="tm-mk-sg${st.act.kind === v ? " is-on" : ""}" data-dp-act="mk-act-kind" data-v="${v}"><i class="${i}" aria-hidden="true"></i> ${esc(l)}</button>`).join("")}</span>
          <textarea class="tm-mk-in" data-mk="act.text" rows="2" maxlength="2000" placeholder="${st.act.kind === "call" ? "What was said on the call?" : st.act.kind === "meeting" ? "Meeting notes" : st.act.kind === "reply" ? "What did they reply?" : "Note"}">${esc(st.act.text)}</textarea>
          <div class="tm-mk-foot is-left"><span class="tm-mk-inline"><span class="tm-mk-lbl">Next follow-up</span>${inp("act.follow", st.act.follow, { type: "date" })}</span>${b("mk-act-save", "Save", "fa-solid fa-check", { primary: true, disabled: !!busy })}</div>
        </div>`;
      const evIcon = { created: "fa-solid fa-plus", updated: "fa-solid fa-pen", status: "fa-solid fa-flag", email_drafted: "fa-regular fa-envelope", whatsapp_opened: "fa-brands fa-whatsapp",
        unsubscribed: "fa-solid fa-ban", resubscribed: "fa-solid fa-rotate-left", whatsapp_opt_out: "fa-solid fa-hand", whatsapp_opt_in: "fa-brands fa-whatsapp", note: "fa-regular fa-note-sticky",
        call: "fa-solid fa-phone", meeting: "fa-regular fa-calendar-check", reply: "fa-solid fa-reply", link_opened: "fa-solid fa-arrow-pointer", follow_up: "fa-regular fa-clock", deleted: "fa-solid fa-trash" };
      const evLabel = e => ({ created: "Added", updated: "Edited", status: `Status: ${statusLabel(e.detail?.to)}`, email_drafted: `Email (${T()?.byId(e.template)?.name || e.template})`,
        whatsapp_opened: "WhatsApp message", unsubscribed: e.detail?.source === "link" ? "Unsubscribed with the email link" : "Marked unsubscribed", resubscribed: "Emails allowed again",
        whatsapp_opt_out: "WhatsApp: replied STOP", whatsapp_opt_in: "WhatsApp allowed again", note: "Note", call: "Call", meeting: "Meeting", reply: "They replied",
        link_opened: "Opened the link in the email", follow_up: `Follow-up: ${e.detail?.date ? day(e.detail.date) : "cleared"}`, deleted: "Deleted", restored: "Restored" }[e.kind] || e.kind);
      return `<div class="tm-mk">${back}${quick}
        <dl class="tm-mk-kv">
          ${[["Contact", esc(it.contact_person || (it.kind === "individual" ? "Individual" : "—"))],
            ["Email", it.email ? `<a href="mailto:${esc(it.email)}">${esc(it.email)}</a> ${emailPill(it)}` : "—"],
            ["WhatsApp", it.whatsapp ? `+${esc(it.whatsapp)}${waOff ? " " + pill("Opted out", "bad") : ""}` : "—"],
            ["Phone", esc(it.phone || "—")],
            ["Website", it.website ? `<a href="${esc(it.website)}" target="_blank" rel="noopener noreferrer">${esc(it.website.replace(/^https?:\/\//, ""))}</a>` : "—"],
            ["Address", esc([it.address, it.city, it.country].filter(Boolean).join(", ") || "—")],
            ["Business type", esc(it.category || "—")],
            ["Source", it.source === "search" ? (String(it.source_ref || "").startsWith("osm:") ? `Find new · <a href="https://www.openstreetmap.org/${esc(String(it.source_ref).slice(4))}" target="_blank" rel="noopener noreferrer">map</a>` : "Find new / import") : "Added by hand"],
            ["Engagement", `${esc(String(it.emails_drafted || 0))} email · ${esc(String(it.whatsapp_opened || 0))} WhatsApp · ${esc(String(it.link_opens || 0))} opened${it.last_reply_at ? ` · replied ${esc(day(it.last_reply_at))}` : ""}`]
          ].map(([kk, v]) => `<div><dt>${esc(kk)}</dt><dd>${v}</dd></div>`).join("")}
        </dl>
        ${it.notes ? `<p class="tm-mk-notes">${esc(it.notes)}</p>` : ""}
        ${sec("Status", statusRow)}
        ${sec("Plan", plan)}
        ${sec("Log a call, meeting, reply or note", logBox)}
        ${sec("Email", emailBox)}
        ${sec("WhatsApp", waBox)}
        ${sec("Activity", ev.length ? `<ul class="tm-mk-ev">${ev.map(e => `<li><i class="${evIcon[e.kind] || "fa-regular fa-circle"}" aria-hidden="true"></i><div><span>${esc(evLabel(e))}</span>${e.detail?.text ? `<p>${esc(e.detail.text)}</p>` : ""}<small>${esc(when(e.at))}${e.by ? ` · @${esc(e.by)}` : ""}</small></div></li>`).join("")}</ul>` : `<p class="tm-mk-muted">No activity yet.</p>`)}
        ${sec("Manage", `<div class="tm-mk-foot is-left">${st.confirmDelete ? b("mk-del-yes", "Yes, delete", "fa-solid fa-trash", { danger: true }) + b("mk-del-no", "Keep", "") : b("mk-del", "Delete contact", "fa-regular fa-trash-can", { danger: true })}</div>
            <p class="tm-mk-hint">Deleting hides the contact. An unsubscribed address stays blocked even if it is added again.</p>`)}
      </div>`;
    }

    function formHtml(){
      const f = st.form;
      return `<div class="tm-mk"><button type="button" class="tm-mk-back" data-dp-act="mk-form-cancel"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${f.id ? "Back to contact" : "All contacts"}</button>
        <form class="tm-mk-form" data-dp-form data-mk-form="contact">
          <h3 class="tm-mk-h">${f.id ? "Edit contact" : "Add contact"}</h3>
          <span class="tm-mk-seg2" role="radiogroup" aria-label="Type">
            <button type="button" role="radio" aria-checked="${f.kind === "company"}" class="tm-mk-sg${f.kind === "company" ? " is-on" : ""}" data-dp-act="mk-kind" data-v="company"><i class="fa-solid fa-building" aria-hidden="true"></i> Company</button>
            <button type="button" role="radio" aria-checked="${f.kind === "individual"}" class="tm-mk-sg${f.kind === "individual" ? " is-on" : ""}" data-dp-act="mk-kind" data-v="individual"><i class="fa-solid fa-user" aria-hidden="true"></i> Individual</button>
          </span>
          <div class="tm-mk-grid">${FIELDS.map(([key, label, type, max]) => field(label, `<input class="tm-mk-in" type="${type === "email" ? "email" : "text"}" inputmode="${type === "tel" ? "tel" : type === "email" ? "email" : type === "url" ? "url" : "text"}" data-mk="form.${key}" value="${esc(f[key] || "")}" maxlength="${max}"${key === "name" ? " required" : ""}${key === "country" ? ' list="tmMkCountries2"' : ""} autocomplete="off">`)).join("")}
            ${field("Tags", inp("form.tags", f.tags, { max: 300, ph: "vip, dubai expo" }), "comma-separated")}
            ${field("Priority", sel("form.priority", f.priority, PRIORITY))}
            ${field("Next follow-up", inp("form.next_follow_up", f.next_follow_up, { type: "date" }), "optional")}</div>
          <datalist id="tmMkCountries2">${COUNTRIES.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
          ${field("Notes", `<textarea class="tm-mk-in" data-mk="form.notes" rows="3" maxlength="4000">${esc(f.notes || "")}</textarea>`, "only visible to you")}
          <div class="tm-mk-foot">${b("mk-form-cancel", "Cancel", "")}${b("mk-form-save", st.formBusy ? "Saving…" : f.id ? "Save changes" : "Add contact", "fa-solid fa-check", { primary: true, disabled: st.formBusy })}</div>
        </form></div>`;
    }

    function campaignsHtml(){
      const c = st.camp;
      if (!st.settings) loadSettings();
      if (c.run) {
        const r = c.run;
        if (r.channel === "whatsapp") {
          const id = r.queue[r.pos];
          const cur = st.items.find(x => x.id === id);
          const text = cur ? T()?.buildWhatsApp({ template: c.template, contact: cur, settings: st.settings || {} }) : "";
          return `<div class="tm-mk">${sec(`WhatsApp · ${r.name}`, r.done || !cur
              ? k.statusCard("Campaign finished", `${num(r.sent)} message${r.sent === 1 ? "" : "s"} opened, ${num(r.skipped + (r.queue.length - r.pos))} skipped.`, "ok") + `<div class="tm-mk-foot">${b("mk-camp-close", "Close", "fa-solid fa-check", { primary: true })}</div>`
              : `<p class="tm-mk-progress"><b>${num(r.pos + 1)}</b> of ${num(r.queue.length)}</p>
                 <div class="tm-mk-wa-card"><b>${esc(cur.name)}</b><small>+${esc(cur.whatsapp)} · ${esc([cur.city, cur.category].filter(Boolean).join(" · "))}</small><pre class="tm-mk-wa">${esc(text)}</pre></div>
                 <div class="tm-mk-foot is-left">${b("mk-camp-wa-open", "Open WhatsApp", "fa-brands fa-whatsapp", { primary: true, disabled: !!st.busy })}${b("mk-camp-wa-skip", "Skip", "fa-solid fa-forward")}${b("mk-camp-wa-stop", "Stop", "fa-solid fa-stop", { danger: true })}</div>
                 <p class="tm-mk-hint">Each message opens in WhatsApp; press Send there, then come back. The next contact appears automatically.</p>`)}</div>`;
        }
        const label = { waiting: "Waiting", working: "Preparing…", outlook: "Opened in Outlook", zip: "In the ZIP", skipped: "Skipped" };
        return `<div class="tm-mk">${sec(`Email · ${r.name}`, `${r.done ? k.statusCard("Campaign finished", `${num(r.rows.filter(x => x.state === "outlook" || x.state === "zip").length)} email draft(s) created, ${num(r.rows.filter(x => x.state === "skipped").length)} skipped.`, "ok") : `<p class="tm-mk-progress">Preparing ${num(r.rows.filter(x => x.state !== "waiting").length)} of ${num(r.rows.length)}…</p>`}
            <ul class="tm-mk-runlist">${r.rows.map(x => `<li class="is-${x.state}"><span>${esc(x.name)}</span><small>${esc(label[x.state] || x.state)}${x.why ? ` · ${esc(x.why)}` : ""}</small></li>`).join("")}</ul>
            ${r.done ? `<div class="tm-mk-foot">${b("mk-camp-close", "Close", "fa-solid fa-check", { primary: true })}</div>` : ""}`)}</div>`;
      }
      if (!c.list) { loadCampaigns(); }
      const a = audience();
      const auds = [["selected", `Selected in Contacts (${st.picked.size})`], ["all", "All contacts"], ...STATUSES.map(([v, l]) => [v, `Status: ${l}`]), ["due", "Follow-up due"], ["high", "High priority"],
        ...(st.tagList || []).map(t => [`tag:${t.tag}`, `#${t.tag}`])];
      const form = `<div class="tm-mk-grid">
          ${field("Campaign name", inp("camp.name", c.name, { max: 120, ph: "For example: Dubai insurers – December" }))}
          ${field("Channel", sel("camp.channel", c.channel, [["email", "Email (Outlook)"], ["whatsapp", "WhatsApp"]]))}
          ${field("Template", sel("camp.template", c.template, tplOptions()))}
          ${field("Audience", sel("camp.audience", c.audience, auds))}
        </div>
        <label class="tm-mk-check"><input type="checkbox" data-mk="camp.onlyNew"${c.onlyNew ? " checked" : ""}> Only people not ${c.channel === "email" ? "emailed" : "messaged"} before</label>
        ${c.channel === "email" ? `<span class="tm-mk-seg2" role="radiogroup" aria-label="Delivery">
            <button type="button" class="tm-mk-sg${c.mode === "outlook" ? " is-on" : ""}" data-dp-act="mk-camp-mode" data-v="outlook"><i class="fa-solid fa-envelope-open-text" aria-hidden="true"></i> Open each in Outlook</button>
            <button type="button" class="tm-mk-sg${c.mode === "zip" ? " is-on" : ""}" data-dp-act="mk-camp-mode" data-v="zip"><i class="fa-solid fa-file-zipper" aria-hidden="true"></i> Download all as ZIP</button></span>` : ""}
        <div class="tm-mk-aud"><b>${num(a.ok.length)}</b> will get ${c.channel === "email" ? "an email draft" : "a WhatsApp message"}${a.skip.length ? ` · <span>${num(a.skip.length)} skipped (${esc([...new Set(a.skip.map(s => s.why))].join(", "))})</span>` : ""}</div>
        <div class="tm-mk-foot">${b("mk-camp-start", c.channel === "email" ? "Create email drafts" : "Start WhatsApp queue", c.channel === "email" ? "fa-solid fa-paper-plane" : "fa-brands fa-whatsapp", { primary: true, disabled: !a.ok.length || !!st.busy })}</div>
        <p class="tm-mk-hint">Every email gets the contact's name, your signature, a personal unsubscribe link and a tracked trial link. Unsubscribed, bounced and opted-out contacts are skipped automatically. At most 50 emails per run.</p>`;
      const hist = c.list === null ? k.skel(3) : !c.list.length ? `<p class="tm-mk-muted">No campaigns yet.</p>`
        : `<div class="tm-mk-table" role="table"><div class="tm-mk-tr is-head" role="row"><span>Campaign</span><span>Sent</span><span>Opened</span><span>Replied</span><span>Unsub.</span></div>
            ${c.list.map(x => `<div class="tm-mk-tr" role="row"><span><b>${esc(x.name)}</b><small>${x.channel === "email" ? "Email" : "WhatsApp"} · ${esc(T()?.byId(x.template)?.name || x.template)} · ${esc(day(x.created_at))}</small></span>
              <span>${num(x.sent)}</span><span>${x.channel === "email" ? `${num(x.opened)} <small>${pct(x.opened, x.sent)}</small>` : "—"}</span><span>${num(x.replied)}</span><span>${x.channel === "email" ? num(x.unsubscribed) : "—"}</span></div>`).join("")}</div>`;
      return `<div class="tm-mk">${sec("New campaign", form)}${sec("Past campaigns", hist, ib("mk-camp-refresh", "Refresh", "fa-solid fa-rotate"))}</div>`;
    }

    function finderHtml(){
      const f = st.finder;
      const res = f.results;
      const selectable = res ? res.filter(r => !r.in_list) : [];
      const results = !res ? "" : !res.length ? `<p class="tm-mk-muted">No businesses of this type were found there. Try another city, a nearby area or a different type.</p>`
        : `<div class="tm-mk-res-head"><b>${esc(String(res.length))} found</b> <small>in ${esc(f.place)}${f.partial ? " · central area only (the wider search was too slow)" : ""}</small>
            <span>${b("mk-f-all", f.selected.size === selectable.length && selectable.length ? "Clear" : "Select all", "fa-regular fa-square-check")}${b("mk-f-add", f.busy === "add" ? "Adding…" : `Add ${f.selected.size}`, "fa-solid fa-user-plus", { primary: true, disabled: !f.selected.size || !!f.busy })}</span></div>
          ${f.scanning ? `<p class="tm-mk-scan"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Reading ${num(f.scanning)} website${f.scanning === 1 ? "" : "s"} for email and WhatsApp…</p>` : ""}
          <ul class="tm-mk-res">${res.map((r, i) => `
            <li class="${r.in_list ? "is-in" : ""}"><label>
              <input type="checkbox" data-mk-pick="${i}"${f.selected.has(i) ? " checked" : ""}${r.in_list ? " disabled" : ""}>
              <span class="tm-mk-main"><b>${esc(r.name)}</b><small>${esc([r.address, r.city].filter(Boolean).join(", ") || r.category)}</small>
                <span class="tm-mk-tags2">${r.email ? `<span><i class="fa-regular fa-envelope"></i> ${esc(r.email)}</span>` : ""}${r.whatsapp ? `<span><i class="fa-brands fa-whatsapp"></i> +${esc(r.whatsapp)}</span>` : ""}${r.phone ? `<span><i class="fa-solid fa-phone"></i> ${esc(r.phone)}</span>` : ""}${r.website ? `<span><i class="fa-solid fa-globe"></i> ${esc(r.website.replace(/^https?:\/\//, ""))}</span>` : ""}${r.scanning ? `<span class="is-scan"><i class="fa-solid fa-spinner fa-spin"></i> website</span>` : ""}</span></span>
              <span class="tm-mk-meta">${r.in_list ? pill("In list", "muted") : ""}${r.unsubscribed ? pill("Unsubscribed", "bad", "fa-solid fa-ban") : ""}${!r.email && !r.whatsapp && !r.phone && !r.scanning ? pill("No contact", "muted") : ""}</span>
            </label></li>`).join("")}</ul>
          <p class="tm-mk-hint">${esc(f.attribution || "")} Check each business before contacting it.</p>`;
      return `<div class="tm-mk">
        <form class="tm-mk-form" data-dp-form data-mk-form="finder">
          <div class="tm-mk-grid is-3">
            ${field("Business type", sel("f.category", f.category, CATEGORIES.map(c => [c[0], c[1]])))}
            ${field("City", inp("f.city", f.city, { max: 80, extra: " required" }))}
            ${field("Country", inp("f.country", f.country, { max: 80, extra: ' list="tmMkCountries"' }))}
            ${field("Name contains", inp("f.keyword", f.keyword, { max: 60, ph: "optional" }))}
            ${field("Results", sel("f.limit", f.limit, [["20", "Up to 20"], ["40", "Up to 40"], ["60", "Up to 60"], ["100", "Up to 100"]]))}
            <div class="tm-mk-field is-end">${b("mk-f-search", f.busy === "search" ? "Searching…" : "Search", "fa-solid fa-magnifying-glass", { primary: true, disabled: !!f.busy })}</div>
          </div>
          <datalist id="tmMkCountries">${COUNTRIES.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
          <label class="tm-mk-check"><input type="checkbox" data-mk="f.scan"${f.scan ? " checked" : ""}> Find email and WhatsApp on their websites <em>(in the background)</em></label>
        </form>
        ${f.err ? k.note(esc(f.err), "warn", "fa-solid fa-triangle-exclamation") : ""}
        ${f.busy === "search" ? `<p class="tm-mk-scan"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${esc(f.stage || "Searching the business map…")} <b>${Math.max(0, Math.round((Date.now() - (f.started || Date.now())) / 1000))} s</b></p>` + k.skel(4) : results}
        <p class="tm-mk-hint">Searches OpenStreetMap in the chosen city, starting with the centre and widening until there are enough results. Nothing is saved until you add.</p>
      </div>`;
    }

    function templatesHtml(){
      const tpl = T(); if (!tpl) return k.note("Templates are not loaded.", "warn");
      const sample = { name: "Gulf Example Trading LLC", contact_person: "Ahmed Khan", kind: "company" };
      const settings = st.settings || {};
      const ov = (settings.template_overrides || {})[st.tpl] || {};
      if (!st.tplEdit || st.tplEdit.id !== st.tpl) st.tplEdit = { id: st.tpl, subject: ov.subject || "", headline: ov.headline || "", intro: ov.intro || "", closing: ov.closing || "", cta: ov.cta || "" };
      const def = tpl.defaults(st.tpl);
      const draft = { ...settings, template_overrides: { ...(settings.template_overrides || {}), [st.tpl]: st.tplEdit } };
      const mail = tpl.buildEmail({ template: st.tpl, contact: sample, settings: draft, token: "preview", logoSrc: new URL("Assets/logo/email-logo.png", document.baseURI).href });
      st.tplHtml = mail.html;
      const e = st.tplEdit;
      return `<div class="tm-mk">
        <div class="tm-mk-tpls">${tpl.list().map(t => `<button type="button" class="tm-mk-tpl${st.tpl === t.id ? " is-on" : ""}" title="${esc(t.name)}" data-dp-act="mk-tpl" data-v="${esc(t.id)}"><i class="${esc(t.icon)}" aria-hidden="true"></i><b>${esc(t.name)}</b>${(settings.template_overrides || {})[t.id] && Object.keys(settings.template_overrides[t.id]).length ? `<em>Customised</em>` : ""}</button>`).join("")}</div>
        ${sec("Your wording", `<p class="tm-mk-hint">Leave a field empty to use the standard text. <b>{company}</b> and <b>{name}</b> are filled in for each contact.</p>
          ${field("Subject", inp("te.subject", e.subject, { max: 180, ph: def.subject }))}
          ${field("Headline", inp("te.headline", e.headline, { max: 160, ph: def.headline }))}
          ${field("Introduction", `<textarea class="tm-mk-in" data-mk="te.intro" rows="3" maxlength="1200" placeholder="${esc(def.intro)}">${esc(e.intro)}</textarea>`)}
          ${field("Closing line", `<textarea class="tm-mk-in" data-mk="te.closing" rows="2" maxlength="600" placeholder="${esc(def.closing)}">${esc(e.closing)}</textarea>`)}
          ${field("Button text", inp("te.cta", e.cta, { max: 60, ph: def.cta }))}
          <div class="tm-mk-foot">${b("mk-te-reset", "Use standard text", "fa-solid fa-rotate-left")}${b("mk-te-preview", "Update preview", "fa-regular fa-eye")}${b("mk-te-save", st.settingsBusy ? "Saving…" : "Save wording", "fa-solid fa-check", { primary: true, disabled: st.settingsBusy })}</div>`)}
        ${sec("Preview", `<p class="tm-mk-subject">${esc(mail.subject)}</p><div class="tm-mk-frame" data-mk-mail="tpl" role="document" aria-label="Email preview"></div>`)}
        ${sec("WhatsApp text", `<pre class="tm-mk-wa">${esc(tpl.buildWhatsApp({ template: st.tpl, contact: sample, settings }))}</pre>`)}
        <p class="tm-mk-hint">The sample company is fictional. Real emails use the contact's name, your signature (Settings), a personal unsubscribe link and a tracked trial link.</p>
      </div>`;
    }

    function settingsHtml(){
      if (!st.settings) { loadSettings(); return k.skel(5); }
      const s = st.settings;
      const f = (key, label, hint = "", max = 120) => field(label, inp(`s.${key}`, s[key] || "", { max }), hint);
      return `<div class="tm-mk">${sec("Email signature", `<form class="tm-mk-form" data-dp-form data-mk-form="settings"><div class="tm-mk-grid">
            ${f("sender_name", "Name")}${f("sender_title", "Title", "optional")}${f("email", "Reply email", "replies and unsubscribe requests", 254)}
            ${f("phone", "Phone", "optional", 40)}${f("whatsapp", "WhatsApp number", "with country code", 20)}${f("website", "Website", "", 300)}</div>
            ${f("address", "Business address", "shown in the email footer, recommended", 300)}
            <div class="tm-mk-foot">${b("mk-s-save", st.settingsBusy ? "Saving…" : "Save signature", "fa-solid fa-check", { primary: true, disabled: st.settingsBusy })}</div></form>`)}
        ${sec("Outlook helper", `${st.helper === null ? `<p class="tm-mk-muted">Checking…</p>` : st.helper
            ? k.statusCard("Running on this PC", "“Open in Outlook” opens each email ready to send.", "ok")
            : k.statusCard("Not found on this PC", "Emails are downloaded as .eml files (or one ZIP for campaigns). Install the Outlook helper once to open them directly in Outlook.", "plain")}
            <div class="tm-mk-foot">${b("mk-helper", "Check again", "fa-solid fa-rotate")}</div>`)}
        ${k.note("Good practice: email only businesses whose address is public for business contact, keep messages relevant, include your business address, and never email an address marked Unsubscribed. The unsubscribe link and the blocked list handle this automatically.", "info", "fa-solid fa-shield-halved")}</div>`;
    }

    function preview(){
      const it = st.detail?.item; const tpl = T(); if (!it || !tpl) return;
      const mail = tpl.buildEmail({ template: st.emailTpl, contact: it, settings: st.settings || {}, token: "preview", note: st.note, subject: st.subject, logoSrc: new URL("Assets/logo/email-logo.png", document.baseURI).href });
      st.previewHtml = mail.html; st.previewSubject = mail.subject;
      R({ keepScroll: false });
    }

    async function importCsv(file){
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { dp.toast("The file is larger than 2 MB.", false); return; }
      const rows = parseCsv(await file.text());
      if (rows.length < 2) { dp.toast("The file has no rows.", false); return; }
      const head = rows[0].map(h => HEADER_MAP[String(h).trim().toLowerCase()] || "");
      if (!head.includes("name")) { dp.toast("The first row must contain a “name” (or “company”) column.", false); return; }
      const items = rows.slice(1, 2001).map(r => { const o = {}; head.forEach((key, i) => { if (key && r[i] != null && String(r[i]).trim()) o[key] = String(r[i]).trim(); });
        if (o.tags) o.tags = o.tags.split(/[,;|]/).map(t => t.trim()).filter(Boolean); if (o.kind) o.kind = /indiv|person/i.test(o.kind) ? "individual" : "company"; if (o.priority) o.priority = String(o.priority).toLowerCase(); return o; })
        .filter(o => o.name);
      let added = 0, skipped = 0, invalid = 0;
      await act("import", async () => {
        for (let i = 0; i < items.length; i += 200) {
          st.importInfo = `Importing ${Math.min(i + 200, items.length)} of ${items.length}…`; R();
          const d = await supabaseRpc("app_marketing_add_many", { p_items: items.slice(i, i + 200) });
          added += d.added; skipped += d.skipped; invalid += d.invalid;
        }
        st.importInfo = `Import finished: <b>${num(added)}</b> added, ${num(skipped)} already in the list, ${num(invalid)} with invalid details.${rows.length > 2001 ? " Only the first 2,000 rows were read." : ""}`;
        await loadList();
      });
    }
    async function exportCsv(){
      await act("export", async () => {
        const items = (await supabaseRpc("app_marketing_export", {}))?.items || [];
        const cols = ["name", "kind", "contact_person", "category", "email", "email_status", "whatsapp", "whatsapp_status", "phone", "website", "address", "city", "country", "status", "priority", "tags", "next_follow_up", "emails_drafted", "link_opens", "whatsapp_opened", "last_emailed_at", "notes", "created_at"];
        const lines = [cols.join(",")].concat(items.map(it => cols.map(cn => csvCell(cn === "tags" ? (it.tags || []).join("; ") : it[cn])).join(",")));
        download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `Triplem VIP marketing contacts ${today()}.csv`);
        dp.toast(`${num(items.length)} contacts exported.`);
      });
    }

    dp.custom.open({
      icon: "admin",
      tabs: [["overview", "Overview", "fa-solid fa-chart-pie"], ["contacts", "Contacts", "fa-solid fa-address-book"], ["campaigns", "Campaigns", "fa-solid fa-paper-plane"],
        ["find", "Find new", "fa-solid fa-wand-magic-sparkles"], ["templates", "Templates", "fa-regular fa-envelope"], ["settings", "Settings", "fa-solid fa-sliders"]],
      tab: opts.tab || "overview", state: st,
      head: () => {
        const c = st.counts || {};
        const onContact = st.view && st.detail && dp.custom.currentTab() === "contacts" && !st.formOpen;
        return { title: onContact ? st.detail.item.name : "Marketing", avatar: `<span class="tm-dp-txico tm-ap-ico" style="--t:#0e5a56"><i class="fa-solid fa-bullhorn"></i></span>`,
          sub: onContact ? esc([st.detail.item.category, st.detail.item.city].filter(Boolean).join(" · ") || "Contact") : "Main Admin · outreach",
          pills: onContact ? [k.pill(statusLabel(st.detail.item.status), STATUS_TONE[st.detail.item.status] || ""), emailPill(st.detail.item)].filter(Boolean)
            : [k.pill(`${c.all ?? 0} contacts`, ""), c.due ? k.pill(`${c.due} due`, "warn") : "", c.unsubscribed ? k.pill(`${c.unsubscribed} unsubscribed`, "bad") : ""].filter(Boolean) };
      },
      render(tab){
        if (tab === "overview") return overviewHtml();
        if (tab === "contacts") {
          if (st.formOpen) return formHtml();
          if (st.view && st.previewHtml) return `<div class="tm-mk"><button type="button" class="tm-mk-back" data-dp-act="mk-preview-close"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back to ${esc(st.detail?.item?.name || "contact")}</button>
            <p class="tm-mk-subject">${esc(st.previewSubject)}</p><div class="tm-mk-frame" data-mk-mail="contact" role="document" aria-label="Email preview"></div></div>`;
          return st.view ? detailHtml() : listHtml();
        }
        if (tab === "campaigns") return campaignsHtml();
        if (tab === "find") return finderHtml();
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
        const [a, sub] = key.split(".");
        if (sub) {
          const target = a === "f" ? st.finder : a === "form" ? st.form : a === "s" ? st.settings : a === "camp" ? st.camp : a === "bulk" ? st.bulk : a === "act" ? st.act : a === "te" ? st.tplEdit : null;
          if (target) target[sub] = val;
          return;
        }
        st[key] = val;
      },
      onChange(e){
        const file = e.target.closest?.("[data-mk-file]");
        if (file) { const fl = file.files?.[0]; file.value = ""; importCsv(fl); return; }
        const pick = e.target.closest?.("[data-mk-pick]");
        if (pick) { const i = Number(pick.dataset.mkPick); if (pick.checked) st.finder.selected.add(i); else st.finder.selected.delete(i); R(); return; }
        const pc = e.target.closest?.("[data-mk-pick-c]");
        if (pc) { const id = pc.dataset.mkPickC; if (pc.checked) st.picked.add(id); else st.picked.delete(id); R(); return; }
        const f = e.target.closest?.("[data-mk]"); if (!f) return;
        const key = f.dataset.mk, val = f.type === "checkbox" ? f.checked : f.value;
        if (key === "filter") { st.filter = val; loadList(); return; }
        if (key === "emailTpl" || key === "waTpl") { st[key] = val; R(); return; }
        if (key === "bulk.status" && val) { bulk({ status: val }, `Status set to ${statusLabel(val)}`); st.bulk.status = ""; return; }
        if (key === "bulk.priority" && val) { bulk({ priority: val }, `Priority set to ${val}`); st.bulk.priority = ""; return; }
        const [a, sub] = key.split(".");
        if (a === "camp" && sub) { st.camp[sub] = val; if (sub === "channel" || sub === "audience" || sub === "onlyNew") R(); return; }
        if (a === "f" && sub) st.finder[sub] = val;
        if (a === "act" && sub) st.act[sub] = val;
        if (a === "bulk" && sub) st.bulk[sub] = val;
        if (a === "form" && sub) st.form[sub] = val;
        if (key === "followDate") st.followDate = val;
      },
      onSubmit(form){
        if (form.dataset.mkForm === "finder") document.querySelector('[data-dp-act="mk-f-search"]')?.click();
      },
      actions: {
        "mk-reload": () => loadList(),
        "mk-stats": () => { st.stats = null; loadStats(); },
        "mk-unlock": () => { dp.close(); setTimeout(() => document.getElementById("adminSecurityKeyBtn")?.click() || document.getElementById("adminSecurityUnlockBtn")?.click(), 0); },
        "mk-filter": btn => { st.filter = btn.dataset.v; st.view = null; st.formOpen = false; if (btn.dataset.go) dp.custom.tab(btn.dataset.go); loadList(); },
        "mk-layout": btn => { st.layout = btn.dataset.v; R(); },
        "mk-open": btn => { if (dp.custom.currentTab() !== "contacts") dp.custom.tab("contacts"); st.formOpen = false; loadDetail(btn.dataset.id); if (st.settings === null) loadSettings(); if (st.helper === null) checkHelper(); },
        "mk-toggle": btn => { const id = btn.dataset.id; if (st.picked.has(id)) st.picked.delete(id); else st.picked.add(id); R(); },
        "mk-select": () => { st.selecting = !st.selecting; st.layout = "list"; st.confirmBulkDelete = false; R(); },
        "mk-pick-all": () => { st.picked = st.picked.size === st.items.length ? new Set() : new Set(st.items.map(x => x.id)); R(); },
        "mk-back": () => { st.view = null; st.detail = null; st.previewHtml = null; R({ keepScroll: false }); loadList(); },
        "mk-new": () => { st.form = blankForm(); st.formOpen = true; R({ keepScroll: false }); },
        "mk-import": () => document.querySelector('[data-mk-file="csv"]')?.click(),
        "mk-export": () => exportCsv(),
        "mk-move": btn => act("move", async () => {
          const it = st.items.find(x => x.id === btn.dataset.id); if (!it) return;
          const i = STATUSES.findIndex(s => s[0] === it.status) + Number(btn.dataset.dir);
          if (i < 0 || i >= STATUSES.length) return;
          const d = await supabaseRpc("app_marketing_set_status", { p_id: it.id, p_status: STATUSES[i][0] }); patchItem(d.item);
        }),
        "mk-status": btn => act("status", async () => { const d = await supabaseRpc("app_marketing_set_status", { p_id: st.detail.item.id, p_status: btn.dataset.v }); patchItem(d.item); await refreshDetail(); }),
        "mk-priority": btn => act("priority", async () => { await supabaseRpc("app_marketing_bulk", { p_ids: [st.detail.item.id], p_patch: { priority: btn.dataset.v } }); await refreshDetail(); patchItem(st.detail.item); }),
        "mk-follow": () => act("follow", async () => { await supabaseRpc("app_marketing_bulk", { p_ids: [st.detail.item.id], p_patch: { next_follow_up: st.followDate ?? st.detail.item.next_follow_up ?? "" } }); await refreshDetail(); patchItem(st.detail.item); dp.toast("Follow-up saved"); }),
        "mk-follow-q": btn => act("follow", async () => { await supabaseRpc("app_marketing_bulk", { p_ids: [st.detail.item.id], p_patch: { next_follow_up: addDays(Number(btn.dataset.days)) } }); st.followDate = undefined; await refreshDetail(); patchItem(st.detail.item); dp.toast(`Follow-up on ${day(addDays(Number(btn.dataset.days)))}`); }),
        "mk-follow-clear": () => act("follow", async () => { await supabaseRpc("app_marketing_bulk", { p_ids: [st.detail.item.id], p_patch: { next_follow_up: "" } }); st.followDate = undefined; await refreshDetail(); patchItem(st.detail.item); }),
        "mk-tag-add": () => act("tag", async () => { const t = String(st.tagInput || "").trim(); if (!t) return; await supabaseRpc("app_marketing_bulk", { p_ids: [st.detail.item.id], p_patch: { add_tags: t.split(/[,;]/) } }); st.tagInput = ""; await refreshDetail(); patchItem(st.detail.item); }),
        "mk-tag-rm": btn => act("tag", async () => { await supabaseRpc("app_marketing_bulk", { p_ids: [st.detail.item.id], p_patch: { remove_tags: [btn.dataset.v] } }); await refreshDetail(); patchItem(st.detail.item); }),
        "mk-act-kind": btn => { st.act.kind = btn.dataset.v; R(); },
        "mk-act-save": () => act("log", async () => {
          const d = await supabaseRpc("app_marketing_log_activity", { p_id: st.detail.item.id, p_kind: st.act.kind, p_text: st.act.text || "", p_follow_up: st.act.follow || null });
          patchItem(d.item); st.act = { kind: st.act.kind, text: "", follow: "" }; await refreshDetail(); dp.toast("Saved to the activity");
        }),
        "mk-outlook": () => email("outlook"),
        "mk-eml": () => email("eml"),
        "mk-preview": () => preview(),
        "mk-preview-close": () => { st.previewHtml = null; R({ keepScroll: false }); },
        "mk-unsub": () => act("unsub", async () => { const d = await supabaseRpc("app_marketing_set_email_status", { p_id: st.detail.item.id, p_status: "unsubscribed", p_note: null }); patchItem(d.item); await refreshDetail(); dp.toast("Marked Unsubscribed. No more emails to this address."); }),
        "mk-bounce": () => act("bounce", async () => { const d = await supabaseRpc("app_marketing_set_email_status", { p_id: st.detail.item.id, p_status: "bounced", p_note: null }); patchItem(d.item); await refreshDetail(); }),
        "mk-resub": () => act("resub", async () => { const d = await supabaseRpc("app_marketing_set_email_status", { p_id: st.detail.item.id, p_status: "subscribed", p_note: st.reason || null }); st.reason = ""; patchItem(d.item); await refreshDetail(); dp.toast("Emails allowed again."); }),
        "mk-resub-bounce": () => act("resub", async () => { const d = await supabaseRpc("app_marketing_set_email_status", { p_id: st.detail.item.id, p_status: "subscribed", p_note: "Address checked after bounce" }); patchItem(d.item); await refreshDetail(); }),
        "mk-wa": () => whatsapp(st.detail?.item, st.waTpl, null, async () => { await refreshDetail(); }),
        "mk-wa-copy": async () => { const it = st.detail?.item; if (!it) return; await navigator.clipboard.writeText(T().buildWhatsApp({ template: st.waTpl, contact: it, settings: st.settings || {} })); dp.toast("Message copied"); },
        "mk-wa-off": () => act("waoff", async () => { const d = await supabaseRpc("app_marketing_set_whatsapp_status", { p_id: st.detail.item.id, p_status: "opted_out" }); patchItem(d.item); await refreshDetail(); }),
        "mk-wa-on": () => act("waon", async () => { const d = await supabaseRpc("app_marketing_set_whatsapp_status", { p_id: st.detail.item.id, p_status: "ok" }); patchItem(d.item); await refreshDetail(); }),
        "mk-edit": () => { const it = st.detail.item; st.form = { ...blankForm(), ...Object.fromEntries(Object.keys(blankForm()).map(key => [key, it[key] ?? ""])), id: it.id, whatsapp: it.whatsapp ? "+" + it.whatsapp : "", tags: (it.tags || []).join(", "), next_follow_up: it.next_follow_up || "" }; st.formOpen = true; R({ keepScroll: false }); },
        "mk-del": () => { st.confirmDelete = true; R(); },
        "mk-del-no": () => { st.confirmDelete = false; R(); },
        "mk-del-yes": () => act("del", async () => { await supabaseRpc("app_marketing_delete", { p_id: st.detail.item.id }); st.view = null; st.detail = null; st.confirmDelete = false; dp.toast("Contact deleted"); await loadList(); }),
        "mk-kind": btn => { st.form.kind = btn.dataset.v; R(); },
        "mk-form-cancel": () => { const id = st.form.id; st.form = blankForm(); st.formOpen = false; R({ keepScroll: false }); if (id && st.view) loadDetail(id); },
        "mk-form-save": async () => {
          if (st.formBusy) return;
          if (!String(st.form.name || "").trim()) { dp.toast("Enter the company or person name.", false); return; }
          st.formBusy = true; R();
          try {
            const { id, ...data } = st.form;
            data.tags = String(data.tags || "").split(/[,;]/).map(t => t.trim()).filter(Boolean);
            const d = await supabaseRpc("app_marketing_save", { p_id: id || null, p_data: data });
            st.form = blankForm(); st.formBusy = false; st.formOpen = false; st.stats = null;
            dp.toast(id ? "Changes saved" : "Contact added");
            await loadList();
            loadDetail(d.item.id);
          } catch (e) { st.formBusy = false; R(); dp.toast(String(e?.message || e), false); }
        },
        // bulk
        "mk-bulk-email": () => { st.camp.audience = "selected"; st.camp.channel = "email"; st.camp.run = null; dp.custom.tab("campaigns"); },
        "mk-bulk-wa": () => { st.camp.audience = "selected"; st.camp.channel = "whatsapp"; st.camp.run = null; dp.custom.tab("campaigns"); },
        "mk-bulk-tag": () => { const t = String(st.bulk.tag || "").trim(); if (!t) { dp.toast("Type a tag first.", false); return; } bulk({ add_tags: t.split(/[,;]/) }, `Tag #${t} added`); st.bulk.tag = ""; },
        "mk-bulk-follow": () => { if (!st.bulk.follow) { dp.toast("Choose a date first.", false); return; } bulk({ next_follow_up: st.bulk.follow }, `Follow-up set to ${day(st.bulk.follow)}`); },
        "mk-bulk-del": () => { st.confirmBulkDelete = true; R(); },
        "mk-bulk-del-no": () => { st.confirmBulkDelete = false; R(); },
        "mk-bulk-del-yes": () => { st.confirmBulkDelete = false; bulk({ delete: true }, "Deleted"); },
        // campaigns
        "mk-camp-mode": btn => { st.camp.mode = btn.dataset.v; R(); },
        "mk-camp-start": () => act("camp", async () => { if (st.camp.channel === "email") await runEmailCampaign(); else await startWhatsAppCampaign(); }),
        "mk-camp-wa-open": () => {
          const r = st.camp.run; const cur = st.items.find(x => x.id === r.queue[r.pos]); if (!cur) return;
          whatsapp(cur, st.camp.template, r.id, async () => { r.sent++; r.pos++; if (r.pos >= r.queue.length) await finishWhatsApp(); });
        },
        "mk-camp-wa-skip": () => { const r = st.camp.run; r.skipped++; r.pos++; if (r.pos >= r.queue.length) finishWhatsApp(); else R(); },
        "mk-camp-wa-stop": () => finishWhatsApp(),
        "mk-camp-close": () => { st.camp.run = null; st.picked = new Set(); st.selecting = false; st.stats = null; loadCampaigns(); loadList(); },
        "mk-camp-refresh": () => { st.camp.list = null; R(); },
        // find new
        "mk-f-search": async () => {
          const f = st.finder; if (f.busy) return;
          if (!String(f.city || "").trim()) { dp.toast("Enter a city.", false); return; }
          f.busy = "search"; f.err = ""; f.results = null; f.selected = new Set(); f.started = Date.now(); f.stage = ""; f.partial = false; f.scanning = 0; f.searchId = (f.searchId || 0) + 1;
          const myId = f.searchId;
          R();
          const tick = setInterval(() => { if (f.busy === "search") R(); }, 1000);
          let d = null;
          try {
            const body = { action: "search", category: f.category, city: f.city, country: f.country, keyword: f.keyword, limit: Number(f.limit), scan_websites: false, scan_async: true };
            try { d = await finderCall(body); }
            catch (e) {
              if (!/^(geocode_unreachable|osm_unreachable)$/.test(e.code || "")) throw e;
              d = await browserSearch(f, msg => { f.stage = msg; R(); });
            }
            f.results = d.items || []; f.place = d.place || f.city; f.attribution = d.attribution || ""; f.template = d.template || "overview"; f.partial = !!d.partial;
            f.results.forEach((r, i) => { if (!r.in_list && (r.email || r.whatsapp)) f.selected.add(i); });
          } catch (e) { f.err = String(e?.message || e); }
          clearInterval(tick);
          f.busy = false; f.stage = ""; R();
          if (d && f.scan) scanWebsites(myId);
        },
        "mk-f-all": () => { const f = st.finder; const avail = (f.results || []).map((r, i) => r.in_list ? -1 : i).filter(i => i >= 0); f.selected = f.selected.size === avail.length ? new Set() : new Set(avail); R(); },
        "mk-f-add": async () => {
          const f = st.finder; if (f.busy || !f.selected.size) return;
          f.busy = "add"; R();
          try {
            const items = [...f.selected].map(i => f.results[i]).map(r => ({ name: r.name, category: r.category, email: r.email, whatsapp: r.whatsapp, phone: r.phone, website: r.website, address: r.address, city: r.city, country: r.country, source_ref: r.source_ref }));
            const d = await supabaseRpc("app_marketing_add_many", { p_items: items });
            [...f.selected].forEach(i => { f.results[i].in_list = true; });
            f.selected = new Set(); st.stats = null;
            dp.toast(`${d.added} added${d.skipped ? `, ${d.skipped} already in the list` : ""}${d.invalid ? `, ${d.invalid} skipped (invalid details)` : ""}.`);
            loadList();
          } catch (e) { dp.toast(String(e?.message || e), false); }
          f.busy = false; R();
        },
        // templates
        "mk-tpl": btn => { st.tpl = btn.dataset.v; st.tplEdit = null; R(); },
        "mk-te-preview": () => R(),
        "mk-te-reset": () => { st.tplEdit = { id: st.tpl, subject: "", headline: "", intro: "", closing: "", cta: "" }; R(); },
        "mk-te-save": async () => {
          if (st.settingsBusy) return; st.settingsBusy = true; R();
          try {
            const ov = { ...(st.settings.template_overrides || {}) };
            const e = st.tplEdit; const clean = Object.fromEntries(["subject", "headline", "intro", "closing", "cta"].map(x => [x, String(e[x] || "").trim()]).filter(([, v]) => v));
            if (Object.keys(clean).length) ov[st.tpl] = clean; else delete ov[st.tpl];
            st.settings = (await supabaseRpc("app_marketing_settings_save", { p_data: { ...st.settings, template_overrides: ov } }))?.settings || st.settings;
            st.tplEdit = null; dp.toast("Wording saved. New emails use it.");
          } catch (err) { dp.toast(String(err?.message || err), false); }
          st.settingsBusy = false; R();
        },
        "mk-s-save": async () => {
          if (st.settingsBusy) return; st.settingsBusy = true; R();
          try { st.settings = (await supabaseRpc("app_marketing_settings_save", { p_data: st.settings }))?.settings || st.settings; dp.toast("Signature saved"); }
          catch (e) { dp.toast(String(e?.message || e), false); }
          st.settingsBusy = false; R();
        },
        "mk-helper": () => { st.helper = null; R(); checkHelper(); }
      }
    });

    async function bulk(patch, done){
      const ids = [...st.picked]; if (!ids.length) return;
      await act("bulk", async () => {
        const d = await supabaseRpc("app_marketing_bulk", { p_ids: ids, p_patch: patch });
        if (patch.delete) st.picked = new Set();
        st.stats = null;
        dp.toast(`${done}: ${num(d.changed)} contact${d.changed === 1 ? "" : "s"}.`);
        await loadList();
      });
    }
    // Website contacts are read in the background, 12 sites per request, 2 requests at a time.
    async function scanWebsites(searchId){
      const f = st.finder;
      const todo = (f.results || []).filter(r => r.website && !r.email);
      if (!todo.length) return;
      todo.forEach(r => { r.scanning = true; });
      f.scanning = todo.length; R();
      const batches = []; for (let i = 0; i < todo.length; i += 12) batches.push(todo.slice(i, i + 12));
      let next = 0;
      await Promise.all([0, 1].map(async () => {
        while (next < batches.length) {
          const batch = batches[next++];
          try {
            const d = await finderCall({ action: "scan", items: batch.map(r => ({ source_ref: r.source_ref, website: r.website })) });
            if (f.searchId !== searchId) return;
            for (const x of d.items || []) {
              const r = f.results.find(y => y.source_ref === x.source_ref); if (!r) continue;
              if (x.email && !r.email) r.email = x.email;
              if (x.whatsapp && !r.whatsapp) r.whatsapp = x.whatsapp;
              if (x.in_list) r.in_list = true;
              if (x.unsubscribed) r.unsubscribed = true;
              const i = f.results.indexOf(r);
              if (!r.in_list && (r.email || r.whatsapp) && i >= 0) f.selected.add(i);
            }
          } catch (_) { /* a slow batch only leaves its sites without email */ }
          if (f.searchId !== searchId) return;
          batch.forEach(r => { r.scanning = false; });
          f.scanning = Math.max(0, f.scanning - batch.length); R();
        }
      }));
    }

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
