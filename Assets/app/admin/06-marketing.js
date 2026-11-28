/* Triplem VIP · Admin › Marketing (2026-11-28, v3) — Main Admin only
 *
 * Overview (numbers, tasks, follow-ups), Contacts (list / board, filters, bulk actions, CSV) with a
 * full contact page (overview with next best step and lead score, activity, email, WhatsApp,
 * tasks, journey, profile), Campaigns (each email in Outlook, a ZIP, or ONE email with everyone
 * in Bcc; A/B test; WhatsApp queue; automatic follow-up dates), Insights (visitor-to-customer
 * journey, monthly cohorts, retention, best time, template results, unsubscribe reasons), Find
 * new (OpenStreetMap, skips businesses already found, more filters), Templates (39 email and 30
 * WhatsApp templates in groups, your own wording and your own templates) and Settings.
 * Phone numbers written with a country code are used for WhatsApp too. Unsubscribed contacts are
 * never emailed (server rule, 248-250). Uses the shared side panel (TriplemDetailPanels.custom).
 * Server checks on every call: Main Admin + Admin Security Key.
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
  const daysSince = v => v ? Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 86400000)) : null;
  const keyLocked = msg => /security key/i.test(String(msg || ""));
  const needs250 = msg => /Could not find the function|PGRST202|schema cache/i.test(String(msg || ""));
  const num = n => Number(n || 0).toLocaleString();
  const pct = (a, b) => b ? `${Math.round((Number(a) || 0) * 100 / b)}%` : "—";
  const money = (v, cur) => v == null || v === "" ? "—" : `${esc(cur || "AED")} ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const STATUSES = [["new", "New", "fa-regular fa-circle"], ["contacted", "Contacted", "fa-regular fa-paper-plane"], ["interested", "Interested", "fa-regular fa-star"],
    ["client", "Client", "fa-solid fa-handshake"], ["done", "Done", "fa-solid fa-check"], ["not_interested", "Not interested", "fa-regular fa-circle-xmark"]];
  const STATUS_TONE = { new: "", contacted: "info", interested: "warn", client: "ok", done: "ok", not_interested: "muted" };
  const statusLabel = s => (STATUSES.find(x => x[0] === s) || [s, s])[1];
  const PRIORITY = [["high", "High"], ["normal", "Normal"], ["low", "Low"]];
  const ACTIVITY = [["note", "Note", "fa-regular fa-note-sticky"], ["call", "Call", "fa-solid fa-phone"], ["meeting", "Meeting", "fa-regular fa-calendar-check"], ["reply", "They replied", "fa-solid fa-reply"]];
  // id, label, product template, industry template
  const CATEGORIES = [["insurance", "Insurance agencies & brokers", "insurance"], ["car_rental", "Car rental & chauffeur", "ind_car_rental"], ["car_trade", "Car dealers, garages & parts", "inventory"],
    ["retail", "Shops & retail", "inventory"], ["grocery", "Supermarkets & grocery", "inventory"], ["wholesale", "Wholesale & trading", "ind_trading"],
    ["accounting", "Accountants, auditors & tax", "accounting"], ["finance", "Finance, lending & exchange", "lending"], ["real_estate", "Real estate & property", "ind_real_estate"],
    ["travel", "Travel agencies", "ind_travel"], ["logistics", "Logistics & courier", "ind_logistics"], ["restaurants", "Restaurants & cafés", "ind_restaurant"],
    ["clinics", "Clinics & pharmacies", "ind_clinic"], ["services", "Offices & services (general)", "overview"], ["hotels", "Hotels & apartments", "assets"],
    ["education", "Schools, training & driving schools", "overview"], ["construction", "Construction & contracting", "assets"], ["beauty", "Salons, spas & barbers", "inventory"],
    ["fitness", "Gyms & sports clubs", "overview"], ["legal", "Lawyers, notaries & PRO services", "accounting"], ["it_telecom", "IT, telecom & mobile shops", "inventory"],
    ["manufacturing", "Factories & workshops", "inventory"], ["printing", "Printing, signs & advertising", "overview"], ["laundry", "Laundry & cleaning", "expenses"],
    ["furniture", "Furniture, interiors & home", "inventory"], ["events", "Events, weddings & venues", "overview"]];
  const COUNTRIES = ["United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "Pakistan", "India", "Belgium", "United Kingdom"];
  const CURRENCIES = ["AED", "SAR", "QAR", "KWD", "BHD", "OMR", "PKR", "INR", "USD", "EUR", "GBP"];
  const REASONS = { too_many: "Too many emails", not_relevant: "Not relevant", never_asked: "Never asked for emails", already_customer: "Already a customer",
    other_tool: "Uses another system", not_business: "Not a business address", other: "Other", not_given: "No reason given" };
  const FIELDS = [["name", "Company or person name", "text", 200], ["contact_person", "Contact person", "text", 120], ["category", "Business type", "text", 80],
    ["email", "Email", "email", 254], ["whatsapp", "WhatsApp (with country code)", "tel", 20], ["phone", "Phone (with country code for WhatsApp)", "tel", 40], ["website", "Website", "url", 300],
    ["address", "Address", "text", 400], ["city", "City", "text", 80], ["country", "Country", "text", 80]];
  const blankForm = () => ({ id: null, kind: "company", name: "", contact_person: "", category: "", email: "", whatsapp: "", phone: "", website: "", address: "", city: "", country: "United Arab Emirates", notes: "", tags: "", priority: "normal", next_follow_up: "" });
  const waOf = it => it?.wa_number || it?.whatsapp || null;
  const canEmail = it => !!it?.email && it.email_status === "subscribed";

  // Lead score 0-100 from what the contact did (opened, replied), how reachable they are and their status.
  function score(it){
    if (!it) return 0;
    if (it.status === "client" || it.status === "done") return 100;
    if (it.status === "not_interested") return 0;
    let s = 0;
    if (canEmail(it)) s += 10;
    if (waOf(it) && it.whatsapp_status === "ok") s += 10;
    if (it.priority === "high") s += 15;
    if (it.link_opens > 0) s += 20 + Math.min(15, (it.link_opens - 1) * 5);
    if (it.last_reply_at) s += 25;
    if (it.status === "interested") s += 10;
    const touch = [it.last_emailed_at, it.last_whatsapp_at, it.last_link_open_at, it.last_reply_at].filter(Boolean).sort().pop();
    if (touch && daysSince(touch) <= 14) s += 5;
    if (it.email_status !== "subscribed" && it.email) s -= 15;
    return Math.max(0, Math.min(99, s));
  }
  const heat = n => n >= 60 ? ["Hot", "bad", "fa-solid fa-fire"] : n >= 30 ? ["Warm", "warn", "fa-solid fa-temperature-half"] : ["Cold", "info", "fa-regular fa-snowflake"];

  // The best email / WhatsApp template for a contact right now.
  function suggestEmail(it){
    if (!it) return "overview";
    const ar = it.lang === "ar";
    if (it.status === "client") return "referral";
    if (it.emails_drafted >= 3) return ar ? "ar_followup" : "reengage";
    if (it.emails_drafted === 2) return ar ? "ar_followup" : "fu_3";
    if (it.emails_drafted === 1) return ar ? "ar_followup" : (it.link_opens > 0 ? "demo_invite" : "fu_1");
    if (ar) return "ar_intro";
    const cat = CATEGORIES.find(c => c[1] === it.category);
    return cat ? cat[2] : "overview";
  }
  const suggestWa = it => it?.lang === "ar" ? (it.whatsapp_opened ? "wa_ar_followup" : "wa_ar_intro") : it?.status === "client" ? "wa_referral" : it?.whatsapp_opened ? "wa_followup" : "wa_intro";

  // ---- small UI helpers (compact) ------------------------------------------------------------------
  const b = (act, label, icon = "", { primary = false, danger = false, data = "", disabled = false, title = "", cls = "" } = {}) =>
    `<button type="button" class="tm-mk-b${primary ? " is-primary" : ""}${danger ? " is-danger" : ""}${cls ? " " + cls : ""}" data-dp-act="${act}"${data ? " " + data : ""}${disabled ? " disabled" : ""}${title ? ` title="${esc(title)}"` : ""}>${icon ? `<i class="${icon}" aria-hidden="true"></i>` : ""}${label ? `<span>${esc(label)}</span>` : ""}</button>`;
  const ib = (act, title, icon, data = "", extra = "") => `<button type="button" class="tm-mk-ib${extra ? " " + extra : ""}" data-dp-act="${act}" ${data} title="${esc(title)}" aria-label="${esc(title)}"><i class="${icon}" aria-hidden="true"></i></button>`;
  const field = (label, inner, hint = "") => `<label class="tm-mk-field"><span>${esc(label)}${hint ? ` <em>${esc(hint)}</em>` : ""}</span>${inner}</label>`;
  const sel = (attr, value, opts, extra = "") => `<select class="tm-mk-in" data-mk="${attr}"${extra}>${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const groupedSel = (attr, value, items, groups, extra = "") => `<select class="tm-mk-in" data-mk="${attr}"${extra}>${groups.map(g => {
      const list = items.filter(x => x.group === g); if (!list.length) return "";
      return `<optgroup label="${esc(g)}">${list.map(x => `<option value="${esc(x.id)}"${x.id === value ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</optgroup>`;
    }).join("")}</select>`;
  const inp = (attr, value, { type = "text", max = 200, ph = "", extra = "" } = {}) => `<input class="tm-mk-in" type="${type}" data-mk="${attr}" value="${esc(value ?? "")}" maxlength="${max}" placeholder="${esc(ph)}" autocomplete="off"${extra}>`;
  const sec = (title, body, right = "", icon = "") => `<section class="tm-mk-sec"><header><h3>${icon ? `<i class="${icon}" aria-hidden="true"></i>` : ""}${esc(title)}</h3>${right ? `<div class="tm-mk-sec-r">${right}</div>` : ""}</header>${body}</section>`;
  const emailTplSel = (attr, value, extra = "") => groupedSel(attr, value, T()?.list() || [], T()?.groups() || [], extra);
  const waTplSel = (attr, value, extra = "") => groupedSel(attr, value, T()?.waList() || [], T()?.waGroups() || [], extra);
  const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
  const subtabs = (attr, cur, list) => `<nav class="tm-mk-subtabs" role="tablist">${list.map(([v, l, n, i]) => `<button type="button" role="tab" aria-selected="${cur === v}" class="${cur === v ? "is-on" : ""}" data-dp-act="${attr}" data-v="${v}">${i ? `<i class="${i}" aria-hidden="true"></i>` : ""}<span>${esc(l)}</span>${n ? ` <b>${esc(String(n))}</b>` : ""}</button>`).join("")}</nav>`;
  const tile = (label, value, tone = "", sub = "") => `<div class="tm-mk-tile${tone ? " is-" + tone : ""}"><small>${esc(label)}</small><b>${value}</b>${sub ? `<em>${sub}</em>` : ""}</div>`;
  const copyBtn = (text, what) => `<button type="button" class="tm-mk-copy" data-dp-act="mk-copy" data-text="${esc(text)}" data-what="${esc(what)}" title="Copy ${esc(what)}" aria-label="Copy ${esc(what)}"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>`;

  // ---- files, helper, zip ----------------------------------------------------------------------
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
  async function browserSearch(f, onStage, extra){
    const base = { category: f.category, city: f.city, country: f.country, keyword: f.keyword, limit: Number(f.limit), ...extra };
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
      if (seen.size >= Number(f.limit) * 2) break;
    }
    if (!okSteps) throw new Error(`The business map servers did not answer from this computer either (${tried.join(", ")}). Please try again in a few minutes.`);
    const slim = [...seen.values()].slice(0, 1500).map(x => ({ type: x.type, id: x.id, lat: x.lat, lon: x.lon, center: x.center, tags: x.tags }));
    return finderCall({ action: "enrich", ...base, elements: slim, place: plan.place, partial });
  }

  async function open(opts = {}){
    const dp = DP(); const k = dp?.kit;
    if (!dp?.custom?.open || !k || !isMainAdmin()) return false;
    const st = {
      loading: true, err: "", items: [], counts: {}, tagList: [], filter: "all", search: "", layout: "list", channel: "",
      view: null, detail: null, detailErr: "", previewHtml: null, formOpen: false, ctab: "overview", menu: null, evFilter: "all",
      emailTpl: "overview", waTpl: "wa_intro", waText: null, note: "", subject: "", reason: "", confirmDelete: false, busy: "",
      act: { kind: "note", text: "", follow: "" }, tagInput: "", task: { title: "", due: "" }, profile: null, showPreview: false,
      selecting: false, picked: new Set(), bulk: { status: "", priority: "", tag: "", follow: "" }, confirmBulkDelete: false,
      form: blankForm(), formBusy: false,
      stats: null, statsErr: "", tasks: null, ins: null, insErr: "", itab: "journey",
      camp: { list: null, name: "", channel: "email", template: "overview", waTemplate: "wa_intro", abTemplate: "", audience: "selected", onlyNew: true, mode: "outlook", followDays: "3", run: null },
      finder: { category: "insurance", city: "Dubai", country: "United Arab Emirates", keyword: "", limit: "40", scan: true, skip: true, must: "", area: "", busy: false, err: "", results: null, place: "", selected: new Set(), attribution: "", template: "insurance", scanning: 0, partial: false, skipped: 0 },
      settings: null, settingsBusy: false, ttab: "email", tpl: "overview", tplEdit: null, waPreview: "wa_intro", my: null, myEdit: null, helper: null, importInfo: null, v3: true
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
      try { st.tasks = (await supabaseRpc("app_marketing_tasks", { p_scope: "open" }))?.items || []; } catch (e) { st.tasks = []; if (needs250(e?.message)) st.v3 = false; }
      R();
    }
    async function loadInsights(){
      st.insErr = "";
      try { st.ins = await supabaseRpc("app_marketing_insights", {}); } catch (e) { st.insErr = String(e?.message || e); st.ins = null; }
      R();
    }
    async function loadCampaigns(){
      try { st.camp.list = (await supabaseRpc("app_marketing_campaigns", {}))?.items || []; } catch (e) { st.camp.list = []; dp.toast(String(e?.message || e), false); }
      R();
    }
    async function loadMyTemplates(){
      try { st.my = (await supabaseRpc("app_marketing_templates", {}))?.items || []; T()?.setCustom(st.my); }
      catch (e) { st.my = []; if (needs250(e?.message)) st.v3 = false; }
      R();
    }
    async function loadDetail(id, tab){
      st.view = id; st.detail = null; st.detailErr = ""; st.confirmDelete = false; st.note = ""; st.subject = ""; st.reason = ""; st.previewHtml = null; st.menu = null;
      st.act = { kind: "note", text: "", follow: "" }; st.tagInput = ""; st.task = { title: "", due: "" }; st.profile = null; st.waText = null; st.showPreview = false;
      st.ctab = tab || "overview"; st.evFilter = "all";
      R({ keepScroll: false });
      try {
        st.detail = await supabaseRpc("app_marketing_get", { p_id: id });
        st.emailTpl = suggestEmail(st.detail.item);
        st.waTpl = suggestWa(st.detail.item);
      } catch (e) { st.detailErr = String(e?.message || e); }
      R({ keepScroll: false });
    }
    async function refreshDetail(){ if (st.detail?.item?.id) { try { st.detail = await supabaseRpc("app_marketing_get", { p_id: st.detail.item.id }); patchItem(st.detail.item); } catch (_) {} } }
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
      try { await fn(); } catch (e) { dp.toast(needs250(e?.message) ? "Run database update 250 first (Marketing v3)." : String(e?.message || e || "Something went wrong."), false); }
      st.busy = ""; R();
    }
    async function copy(text, what){
      try { await navigator.clipboard.writeText(String(text || "")); dp.toast(`${what} copied`); } catch (_) { dp.toast("Copy is not allowed here.", false); }
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
    async function deliver(d, preferOutlook = true){
      if (preferOutlook) {
        try { await toOutlook(d); st.helper = true; return "outlook"; } catch (_) { st.helper = false; }
      }
      download(new Blob([d.eml], { type: "message/rfc822" }), d.name);
      return "file";
    }
    async function email(mode){
      const it = st.detail?.item; if (!it || !T()) return;
      await act(mode, async () => {
        const d = await buildDraft(it.id, st.emailTpl, null, st.note, st.subject);
        patchItem(d.item);
        const how = await deliver(d, mode === "outlook");
        dp.toast(how === "outlook" ? "Opened in Outlook. Check it and press Send." : mode === "outlook" ? "Outlook helper not running: the email was downloaded. Open the .eml file to send it from Outlook." : "Email downloaded (.eml). Open it to send from Outlook.", how === "outlook" || mode !== "outlook");
        st.note = ""; st.subject = "";
        await refreshDetail();
      });
    }
    function whatsapp(contact, template, campaignId, after, textOverride){
      const tpl = T(); if (!contact || !tpl) return;
      const text = textOverride || tpl.buildWhatsApp({ template, contact, settings: st.settings || {} });
      const url = tpl.whatsappUrl(waOf(contact), text);
      if (!url) { dp.toast("No WhatsApp or mobile number with a country code.", false); return; }
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
    function audienceBase(){
      const c = st.camp;
      return c.audience === "selected" ? st.items.filter(x => st.picked.has(x.id)) : st.items.filter(x =>
        c.audience === "all" ? true : c.audience === "due" ? (x.next_follow_up && x.next_follow_up <= today()) : c.audience === "high" ? x.priority === "high"
          : c.audience === "hot" ? score(x) >= 60 : c.audience === "warm" ? score(x) >= 30 && score(x) < 60
          : c.audience === "has_wa" ? !!waOf(x) : c.audience === "has_email" ? !!x.email
          : c.audience.startsWith("tag:") ? (x.tags || []).includes(c.audience.slice(4)) : x.status === c.audience);
    }
    function audience(){
      const c = st.camp, ch = c.channel;
      const ok = [], skip = [];
      for (const x of audienceBase()) {
        const why = ch === "email"
          ? (!x.email ? "no email" : x.email_status === "unsubscribed" ? "unsubscribed" : x.email_status === "bounced" ? "bounced" : (c.onlyNew && x.emails_drafted > 0) ? "already emailed" : "")
          : (!waOf(x) ? "no WhatsApp / mobile" : x.whatsapp_status !== "ok" ? "replied STOP" : (c.onlyNew && x.whatsapp_opened > 0) ? "already messaged" : "");
        (why ? skip : ok).push(why ? { x, why } : x);
      }
      return { ok, skip };
    }
    async function setFollowUps(ids){
      const n = Number(st.camp.followDays || 0);
      if (!n || !ids.length) return;
      try { await supabaseRpc("app_marketing_bulk", { p_ids: ids, p_patch: { next_follow_up: addDays(n) } }); } catch (_) {}
    }
    async function runEmailCampaign(){
      const c = st.camp, a = audience();
      if (!a.ok.length) { dp.toast("Nobody in this audience can be emailed.", false); return; }
      if (c.mode === "bcc") return runBccCampaign(a);
      if (a.ok.length > 50) { dp.toast("Email at most 50 contacts per run (or use “One email · Bcc” for up to 300). Narrow the audience.", false); return; }
      const k0 = (await supabaseRpc("app_marketing_campaign_start", { p_name: c.name || null, p_channel: "email", p_template: c.template, p_planned: a.ok.length }))?.campaign;
      c.run = { id: k0.id, name: k0.name, channel: "email", rows: a.ok.map((x, i) => ({ id: x.id, name: x.name, state: "waiting", tpl: c.abTemplate && i % 2 ? c.abTemplate : c.template }))
        .concat(a.skip.map(s => ({ id: s.x.id, name: s.x.name, state: "skipped", why: s.why }))), done: false };
      R();
      let useHelper = c.mode === "outlook" && await helperRunning();
      const files = []; const sentIds = [];
      for (const row of c.run.rows.filter(r => r.state === "waiting")) {
        row.state = "working"; R();
        try {
          const d = await buildDraft(row.id, row.tpl, k0.id);
          patchItem(d.item);
          if (useHelper) {
            try { await toOutlook(d); row.state = "outlook"; }
            catch (_) { useHelper = false; files.push({ name: d.name, text: d.eml }); row.state = "zip"; }
            await new Promise(r => setTimeout(r, 700));
          } else { files.push({ name: d.name, text: d.eml }); row.state = "zip"; }
          sentIds.push(row.id);
        } catch (e) { row.state = "skipped"; row.why = String(e?.message || e).slice(0, 80); }
        R();
      }
      if (files.length) {
        download(await zipFiles(files), `${(c.run.name || "Triplem VIP campaign").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80)}.zip`);
        dp.toast(`${files.length} email${files.length === 1 ? "" : "s"} saved in a ZIP. Unzip and open each .eml to send it from Outlook.`);
      } else if (sentIds.length) dp.toast(`${sentIds.length} email${sentIds.length === 1 ? "" : "s"} opened in Outlook. Check each and press Send.`);
      await supabaseRpc("app_marketing_campaign_finish", { p_id: k0.id, p_sent: sentIds.length, p_skipped: c.run.rows.length - sentIds.length });
      await setFollowUps(sentIds);
      c.run.done = true; c.list = null; R();
    }
    // One email, To = your own address, everyone in Bcc (max 100 per email; more = several emails).
    async function runBccCampaign(a){
      const c = st.camp;
      if (a.ok.length > 300) { dp.toast("At most 300 people per Bcc campaign. Narrow the audience.", false); return; }
      const k0 = (await supabaseRpc("app_marketing_campaign_start", { p_name: c.name || null, p_channel: "email", p_template: c.template, p_planned: a.ok.length }))?.campaign;
      c.run = { id: k0.id, name: k0.name, channel: "email", bcc: true, rows: [], done: false }; R();
      const tpl = T(); const ids = a.ok.map(x => x.id); const sentIds = []; let n = 0; const skipped = [...a.skip.map(s => ({ name: s.x.name, why: s.why }))];
      const useHelper = await helperRunning();
      for (let i = 0; i < ids.length; i += 100) {
        const prep = await supabaseRpc("app_marketing_bcc_prepare", { p_ids: ids.slice(i, i + 100), p_template: c.template, p_campaign: k0.id });
        (prep.skipped || []).forEach(s => skipped.push(s));
        const rec = prep.recipients || [];
        if (!rec.length) continue;
        const me = prep.settings?.email || "info@triplem.vip";
        const mail = tpl.buildEmail({ template: c.template, contact: null, settings: prep.settings, bcc: true, campaign: k0.id });
        const eml = tpl.buildEml({ to: me, toName: prep.settings?.sender_name || "Triplem VIP", subject: mail.subject, html: mail.html, text: mail.text, unsubscribeUrl: "",
          replyTo: me, logoBase64: await logoBase64(), template: mail.template, bcc: rec.map(r => r.email) });
        n++;
        const d = { name: fileName("", `${mail.subject}${ids.length > 100 ? ` (part ${n})` : ""}`), eml };
        const how = await deliver(d, useHelper);
        rec.forEach(r => { sentIds.push(r.id); c.run.rows.push({ id: r.id, name: `${r.name} · ${r.email}`, state: how === "outlook" ? "bcc-outlook" : "bcc-file" }); });
        R();
      }
      skipped.forEach(s => c.run.rows.push({ name: s.name, state: "skipped", why: s.why }));
      await supabaseRpc("app_marketing_campaign_finish", { p_id: k0.id, p_sent: sentIds.length, p_skipped: skipped.length });
      await setFollowUps(sentIds);
      dp.toast(n ? `${n} email${n === 1 ? "" : "s"} with ${sentIds.length} people in Bcc ${useHelper ? "opened in Outlook" : "downloaded"}. Check and press Send.` : "Nobody could be emailed.", !!n);
      c.run.done = true; c.list = null; R();
    }
    async function startWhatsAppCampaign(){
      const c = st.camp, a = audience();
      if (!a.ok.length) { dp.toast("Nobody in this audience can get a WhatsApp message.", false); return; }
      const k0 = (await supabaseRpc("app_marketing_campaign_start", { p_name: c.name || null, p_channel: "whatsapp", p_template: c.waTemplate, p_planned: a.ok.length }))?.campaign;
      c.run = { id: k0.id, name: k0.name, channel: "whatsapp", queue: a.ok.map(x => x.id), pos: 0, sent: 0, sentIds: [], skipped: a.skip.length, done: false };
      R();
    }
    async function finishWhatsApp(){
      const r = st.camp.run; if (!r || r.done) return;
      r.done = true;
      try { await supabaseRpc("app_marketing_campaign_finish", { p_id: r.id, p_sent: r.sent, p_skipped: r.skipped + (r.queue.length - r.pos) }); } catch (_) {}
      await setFollowUps(r.sentIds);
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
    const v3note = () => st.v3 ? "" : k.note("Some Marketing v3 features need database update 250 (migrations/250_marketing_journeys_tasks_templates.sql).", "warn", "fa-solid fa-database");
    const tplName = id => T()?.waById?.(id)?.name || T()?.byId(id)?.name || id;
    const evLabel = e => ({ created: "Added", updated: "Edited", status: `Status: ${statusLabel(e.detail?.to)}`, email_drafted: `Email · ${tplName(e.template)}${e.detail?.bcc ? " (Bcc)" : ""}`,
      whatsapp_opened: `WhatsApp · ${tplName(e.template)}`, unsubscribed: e.detail?.source === "link" ? `Unsubscribed with the email link${e.detail?.reason ? ` · ${REASONS[e.detail.reason] || e.detail.reason}` : ""}` : "Marked unsubscribed",
      resubscribed: "Emails allowed again", whatsapp_opt_out: "WhatsApp: replied STOP", whatsapp_opt_in: "WhatsApp allowed again", note: "Note", call: "Call", meeting: "Meeting",
      reply: "They replied", link_opened: "Opened the link in the email", follow_up: `Follow-up: ${e.detail?.date ? day(e.detail.date) : "cleared"}`, deleted: "Deleted", restored: "Restored",
      task: `Task: ${e.detail?.text || ""}${e.detail?.due ? ` (due ${day(e.detail.due)})` : ""}`, task_done: `Task done: ${e.detail?.text || ""}`,
      deal: `Deal value: ${e.detail?.value != null ? money(e.detail.value, e.detail.currency) : "cleared"}` }[e.kind] || e.kind);
    const evIcon = { created: "fa-solid fa-plus", updated: "fa-solid fa-pen", status: "fa-solid fa-flag", email_drafted: "fa-regular fa-envelope", whatsapp_opened: "fa-brands fa-whatsapp",
      unsubscribed: "fa-solid fa-ban", resubscribed: "fa-solid fa-rotate-left", whatsapp_opt_out: "fa-solid fa-hand", whatsapp_opt_in: "fa-brands fa-whatsapp", note: "fa-regular fa-note-sticky",
      call: "fa-solid fa-phone", meeting: "fa-regular fa-calendar-check", reply: "fa-solid fa-reply", link_opened: "fa-solid fa-arrow-pointer", follow_up: "fa-regular fa-clock",
      deleted: "fa-solid fa-trash", task: "fa-regular fa-square", task_done: "fa-regular fa-square-check", deal: "fa-solid fa-coins" };
    const timeline = list => list.length ? `<ul class="tm-mk-ev">${list.map(e => `<li><i class="${evIcon[e.kind] || "fa-regular fa-circle"} is-${esc(e.kind)}" aria-hidden="true"></i><div><span>${esc(evLabel(e))}</span>${e.detail?.text && !/^task/.test(e.kind) ? `<p>${esc(e.detail.text)}</p>` : ""}<small>${esc(when(e.at))}${e.by ? ` · @${esc(e.by)}` : ""}</small></div></li>`).join("")}</ul>` : `<p class="tm-mk-muted">Nothing yet.</p>`;

    function tasksHtml(list, withContact){
      if (!list) return k.skel(2);
      if (!list.length) return `<p class="tm-mk-muted">No open tasks.</p>`;
      return `<ul class="tm-mk-tasks">${list.map(t => `<li class="${t.done_at ? "is-done" : ""}${!t.done_at && t.due_date && t.due_date < today() ? " is-late" : ""}">
          <label><input type="checkbox" data-mk-task="${esc(t.id)}"${t.done_at ? " checked" : ""} aria-label="Done"><span>${esc(t.title)}</span></label>
          <small>${t.due_date ? esc(day(t.due_date)) : ""}${withContact && t.contact ? ` · <button type="button" class="tm-mk-link" data-dp-act="mk-open" data-id="${esc(t.contact_id)}">${esc(t.contact)}</button>` : ""}</small>
          ${ib("mk-task-del", "Delete task", "fa-regular fa-trash-can", `data-id="${esc(t.id)}"`, "is-ghost")}</li>`).join("")}</ul>`;
    }

    function overviewHtml(){
      if (!st.stats && !st.statsErr) { loadStats(); return k.skel(6); }
      if (st.statsErr) return keyLocked(st.statsErr) ? locked() : k.note(esc(st.statsErr), "warn") + b("mk-stats", "Try again", "fa-solid fa-rotate");
      const s = st.stats, t = s.totals || {}, f = s.funnel || {};
      const hot = st.items.filter(x => score(x) >= 60 && !["client", "done", "not_interested"].includes(x.status)).sort((a, c) => score(c) - score(a)).slice(0, 6);
      const kpis = [[num(t.contacts), "Contacts", "fa-solid fa-address-book"], [num(t.reachable), "Reachable", "fa-solid fa-signal"],
        [num(t.emailed_contacts), "Emailed", "fa-regular fa-envelope"], [`${num(t.opened_contacts)} <small>${pct(t.opened_contacts, t.emailed_contacts)}</small>`, "Opened the link", "fa-solid fa-arrow-pointer"],
        [num((f.interested || 0) + (f.client || 0)), "Interested + clients", "fa-solid fa-fire"], [num(t.unsubscribed), "Unsubscribed", "fa-solid fa-ban"]];
      const maxF = Math.max(1, ...STATUSES.map(([v]) => f[v] || 0));
      const funnel = STATUSES.map(([v, l]) => `<li><span>${esc(l)}</span><i style="--w:${Math.round((f[v] || 0) * 100 / maxF)}%" class="is-${v}"></i><b>${num(f[v] || 0)}</b></li>`).join("");
      const days = s.days || [];
      const maxD = Math.max(1, ...days.map(d => d.emails + d.whatsapp + d.opens));
      const bars = days.map(d => `<span class="tm-mk-bar" title="${esc(day(d.day))}: ${d.emails} email, ${d.whatsapp} WhatsApp, ${d.opens} opened"><i class="e" style="height:${d.emails * 100 / maxD}%"></i><i class="w" style="height:${d.whatsapp * 100 / maxD}%"></i><i class="o" style="height:${d.opens * 100 / maxD}%"></i></span>`).join("");
      const due = (s.due || []).map(it => `<li><button type="button" class="tm-mk-mini" data-dp-act="mk-open" data-id="${esc(it.id)}"><b>${star(it)} ${esc(it.name)}</b><small>${esc(it.next_follow_up < today() ? "Overdue · " : it.next_follow_up === today() ? "Today · " : "")}${esc(day(it.next_follow_up))} · ${esc(statusLabel(it.status))}</small></button></li>`).join("");
      const recent = (s.recent || []).slice(0, 8).map(e => `<li><button type="button" class="tm-mk-mini" data-dp-act="mk-open" data-id="${esc(e.id)}"><b>${esc(evLabel(e))}</b><small>${esc(e.contact)} · ${esc(when(e.at))}</small></button></li>`).join("");
      const hotList = hot.map(it => `<li><button type="button" class="tm-mk-mini" data-dp-act="mk-open" data-id="${esc(it.id)}"><b>${esc(it.name)} <span class="tm-mk-score is-hot">${score(it)}</span></b><small>${it.link_opens ? `Opened ${it.link_opens}× · ` : ""}${it.last_reply_at ? "Replied · " : ""}${esc(statusLabel(it.status))}</small></button></li>`).join("");
      const tops = list => (list || []).map(x => `<li><span>${esc(x.label)}</span><b>${num(x.count)}</b></li>`).join("");
      return `<div class="tm-mk">${v3note()}
        <div class="tm-mk-quickbar">${b("mk-go", "Add contact", "fa-solid fa-user-plus", { data: 'data-v="add"' })}${b("mk-go", "Find businesses", "fa-solid fa-wand-magic-sparkles", { data: 'data-v="find"' })}${b("mk-go", "New campaign", "fa-solid fa-paper-plane", { data: 'data-v="campaigns"' })}${b("mk-go", "Insights", "fa-solid fa-chart-line", { data: 'data-v="insights"' })}</div>
        <div class="tm-mk-kpis">${kpis.map(([v, l, i]) => `<div><i class="${i}" aria-hidden="true"></i><b>${v}</b><small>${esc(l)}</small></div>`).join("")}</div>
        ${t.due ? `<button type="button" class="tm-mk-alert" data-dp-act="mk-filter" data-v="due" data-go="contacts"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${num(t.due)} follow-up${t.due === 1 ? "" : "s"} due today or overdue <span>Open</span></button>` : ""}
        <div class="tm-mk-two">
          ${sec("Hot leads", hotList ? `<ul class="tm-mk-minis">${hotList}</ul>` : `<p class="tm-mk-muted">No hot leads yet. Contacts become hot when they open your link or reply.</p>`, "", "fa-solid fa-fire")}
          ${sec("My tasks", tasksHtml(st.tasks, true) + `<div class="tm-mk-inline tm-mk-addtask">${inp("task.title", st.task.title, { max: 200, ph: "New task" })}${inp("task.due", st.task.due, { type: "date" })}${ib("mk-task-add", "Add task", "fa-solid fa-plus")}</div>`, "", "fa-regular fa-square-check")}
        </div>
        ${sec("Pipeline", `<ul class="tm-mk-funnel">${funnel}</ul>`, "", "fa-solid fa-filter")}
        ${sec("Last 30 days", `<div class="tm-mk-chart" role="img" aria-label="Emails, WhatsApp messages and link openings per day">${bars}</div>
          <p class="tm-mk-legend"><span class="e"></span>Emails ${num(days.reduce((a, d) => a + d.emails, 0))} <span class="w"></span>WhatsApp ${num(days.reduce((a, d) => a + d.whatsapp, 0))} <span class="o"></span>Opened ${num(days.reduce((a, d) => a + d.opens, 0))}</p>`, "", "fa-solid fa-chart-column")}
        <div class="tm-mk-two">
          ${sec("Follow-ups (7 days)", due ? `<ul class="tm-mk-minis">${due}</ul>` : `<p class="tm-mk-muted">Nothing planned.</p>`, "", "fa-regular fa-clock")}
          ${sec("Recent activity", recent ? `<ul class="tm-mk-minis">${recent}</ul>` : `<p class="tm-mk-muted">No activity yet.</p>`, "", "fa-solid fa-bolt")}
        </div>
        <div class="tm-mk-two">
          ${sec("Top business types", (s.by_category || []).length ? `<ul class="tm-mk-tops">${tops(s.by_category)}</ul>` : `<p class="tm-mk-muted">—</p>`)}
          ${sec("Top cities", (s.by_city || []).length ? `<ul class="tm-mk-tops">${tops(s.by_city)}</ul>` : `<p class="tm-mk-muted">—</p>`)}
        </div>
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
      let items = st.items;
      if (st.channel === "email") items = items.filter(canEmail);
      if (st.channel === "wa") items = items.filter(x => waOf(x) && x.whatsapp_status === "ok");
      if (st.channel === "hot") items = items.filter(x => score(x) >= 60);
      const tools = `<div class="tm-mk-tools">
          <label class="tm-mk-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input class="tm-mk-in" type="search" data-mk="search" value="${esc(st.search)}" placeholder="Search name, email, phone, city, #tag…" autocomplete="off" aria-label="Search contacts"></label>
          ${sel("filter", st.filter, filters, ' aria-label="Filter"')}
          ${sel("channel", st.channel, [["", "Any channel"], ["email", "Can email"], ["wa", "Has WhatsApp / mobile"], ["hot", "Hot leads"]], ' aria-label="Channel"')}
          <span class="tm-mk-seg2" role="group" aria-label="View">${ib("mk-layout", "List", "fa-solid fa-list", 'data-v="list"', st.layout === "list" ? "is-on" : "")}${ib("mk-layout", "Board", "fa-solid fa-table-columns", 'data-v="board"', st.layout === "board" ? "is-on" : "")}</span>
        </div>
        <div class="tm-mk-tools is-row2">
          <div class="tm-mk-quick">${quick.map(([v, l]) => `<button type="button" class="tm-mk-q${st.filter === v ? " is-on" : ""}${v === "unsubscribed" ? " is-bad" : ""}" data-dp-act="mk-filter" data-v="${v}">${esc(l)}${c[v] ? ` <b>${num(c[v])}</b>` : ""}</button>`).join("")}</div>
          <span class="tm-mk-acts">${b("mk-select", st.selecting ? "Done" : "Select", st.selecting ? "fa-solid fa-check" : "fa-regular fa-square-check")}${b("mk-new", "Add", "fa-solid fa-plus")}${b("mk-import", "Import", "fa-solid fa-file-import")}${b("mk-export", "Export", "fa-solid fa-file-export")}</span>
        </div>
        <input type="file" accept=".csv,text/csv" data-mk-file="csv" hidden>
        ${st.importInfo ? k.note(st.importInfo, "info", "fa-solid fa-file-import") : ""}`;
      const bulkBar = st.selecting ? `<div class="tm-mk-bulk">
          <b>${num(st.picked.size)} selected</b> ${b("mk-pick-all", st.picked.size && st.picked.size === items.length ? "Clear" : "All shown", "")}
          <span class="tm-mk-bulk-acts">
            ${b("mk-bulk-email", "Email", "fa-regular fa-envelope", { disabled: !st.picked.size })}${b("mk-bulk-bcc", "One email · Bcc", "fa-solid fa-user-secret", { disabled: !st.picked.size, title: "One email to all selected, addresses hidden in Bcc" })}${b("mk-bulk-wa", "WhatsApp", "fa-brands fa-whatsapp", { disabled: !st.picked.size })}
            ${sel("bulk.status", st.bulk.status, [["", "Status…"], ...STATUSES.map(([v, l]) => [v, l])], st.picked.size ? "" : " disabled")}
            ${sel("bulk.priority", st.bulk.priority, [["", "Priority…"], ...PRIORITY], st.picked.size ? "" : " disabled")}
            <span class="tm-mk-inline">${inp("bulk.tag", st.bulk.tag, { max: 30, ph: "Add #tag" })}${ib("mk-bulk-tag", "Add tag", "fa-solid fa-hashtag")}</span>
            <span class="tm-mk-inline">${inp("bulk.follow", st.bulk.follow, { type: "date" })}${ib("mk-bulk-follow", "Set follow-up", "fa-regular fa-clock")}</span>
            ${st.confirmBulkDelete ? b("mk-bulk-del-yes", `Delete ${st.picked.size}`, "fa-solid fa-trash", { danger: true }) + b("mk-bulk-del-no", "Keep", "") : b("mk-bulk-del", "Delete", "fa-regular fa-trash-can", { danger: true, disabled: !st.picked.size })}
          </span></div>` : "";
      if (!items.length) return `<div class="tm-mk">${tools}${k.empty(st.search || st.filter !== "all" || st.channel ? "No contacts match." : "No contacts yet. Use Find new, Add or Import to start your list.")}</div>`;
      if (st.layout === "board") {
        const cols = STATUSES.map(([v, l]) => {
          const inCol = items.filter(x => x.status === v);
          const cards = inCol.slice(0, 60).map(it => `<li><button type="button" class="tm-mk-card" data-dp-act="mk-open" data-id="${esc(it.id)}"><b>${star(it)} ${esc(it.name)}</b><small>${esc([it.city, it.category].filter(Boolean).join(" · ") || "—")}</small>${it.deal_value ? `<small class="tm-mk-deal">${money(it.deal_value, it.deal_currency)}</small>` : ""}${emailPill(it) || duePill(it)}</button>
            <span class="tm-mk-move">${v !== STATUSES[0][0] ? ib("mk-move", "Move left", "fa-solid fa-chevron-left", `data-id="${esc(it.id)}" data-dir="-1"`) : ""}${v !== STATUSES[STATUSES.length - 1][0] ? ib("mk-move", "Move right", "fa-solid fa-chevron-right", `data-id="${esc(it.id)}" data-dir="1"`) : ""}</span></li>`).join("");
          const val = inCol.reduce((a, x) => a + Number(x.deal_value || 0), 0);
          return `<section class="tm-mk-col is-${v}"><header><b>${esc(l)}</b><span>${num(inCol.length)}${val ? ` · ${num(val)}` : ""}</span></header><ul>${cards || `<li class="tm-mk-muted">—</li>`}</ul></section>`;
        }).join("");
        return `<div class="tm-mk">${tools}<div class="tm-mk-board">${cols}</div></div>`;
      }
      const rows = items.map(it => { const sc = score(it); const h = heat(sc); return `
        <li class="${st.picked.has(it.id) ? "is-picked" : ""}">${st.selecting ? `<label class="tm-mk-pick"><input type="checkbox" data-mk-pick-c="${esc(it.id)}"${st.picked.has(it.id) ? " checked" : ""} aria-label="Select ${esc(it.name)}"></label>` : ""}
          <button type="button" class="tm-mk-row" data-dp-act="${st.selecting ? "mk-toggle" : "mk-open"}" data-id="${esc(it.id)}">
          <span class="tm-mk-av${it.kind === "individual" ? " is-person" : ""}" aria-hidden="true">${esc(initials(it.name))}</span>
          <span class="tm-mk-main"><b>${star(it)} ${esc(it.name)}</b><small>${esc([it.category, it.city].filter(Boolean).join(" · ") || (it.kind === "individual" ? "Individual" : "Company"))}${(it.tags || []).length ? " · " : ""}${tagChips(it.tags, 2)}</small></span>
          <span class="tm-mk-meta">
            <span class="tm-mk-ch" aria-label="Channels">${it.email ? `<i class="fa-regular fa-envelope${it.email_status !== "subscribed" ? " is-off" : ""}" title="${esc(it.email)}"></i>` : ""}${waOf(it) ? `<i class="fa-brands fa-whatsapp${it.whatsapp_status !== "ok" ? " is-off" : ""}" title="+${esc(waOf(it))}${!it.whatsapp ? " (phone)" : ""}"></i>` : ""}${it.link_opens ? `<i class="fa-solid fa-arrow-pointer is-hot" title="Opened the link ${esc(String(it.link_opens))}×"></i>` : ""}</span>
            <span class="tm-mk-score is-${h[0].toLowerCase()}" title="Lead score ${sc} (${h[0]})">${sc}</span>
            ${duePill(it)}${emailPill(it)}${pill(statusLabel(it.status), STATUS_TONE[it.status] || "")}
          </span></button></li>`; }).join("");
      return `<div class="tm-mk">${tools}${bulkBar}<ul class="tm-mk-list">${rows}</ul>${st.items.length >= 1000 ? `<p class="tm-mk-hint">Showing the first 1,000. Search or filter to narrow down.</p>` : ""}</div>`;
    }

    // ---- contact page ----------------------------------------------------------------------------
    function nextStep(it, ev){
      const opened = ev.find(e => e.kind === "link_opened");
      const lastEmail = it.last_emailed_at ? daysSince(it.last_emailed_at) : null;
      const fu = it.emails_drafted === 1 ? "fu_1" : it.emails_drafted === 2 ? "fu_2" : "fu_3";
      if (it.status === "not_interested") return ["muted", "fa-regular fa-circle-xmark", "Marked not interested.", it.lost_reason ? `Reason: ${esc(it.lost_reason)}. ` : "", b("mk-ctab", "Re-engage later", "fa-solid fa-rotate-right", { data: 'data-v="email" data-tpl="reengage"' })];
      if (it.status === "client") return ["ok", "fa-solid fa-handshake", "Client.", "Ask for a referral or feedback; happy clients bring the next ones.", b("mk-ctab", "Referral email", "fa-regular fa-envelope", { data: 'data-v="email" data-tpl="referral"' }) + (waOf(it) ? b("mk-ctab", "WhatsApp", "fa-brands fa-whatsapp", { data: 'data-v="wa" data-tpl="wa_referral"' }) : "")];
      if (it.next_follow_up && it.next_follow_up < today()) return ["bad", "fa-regular fa-clock", `Follow-up overdue since ${esc(day(it.next_follow_up))}.`, "Call or message them today, then log what was said.", (it.phone || waOf(it) ? b("mk-ctab", "Log a call", "fa-solid fa-phone", { data: 'data-v="activity" data-kind="call"' }) : "") + (waOf(it) ? b("mk-ctab", "WhatsApp", "fa-brands fa-whatsapp", { data: 'data-v="wa" data-tpl="wa_followup"' }) : "")];
      if (it.link_opens > 0 && !it.last_reply_at && opened && daysSince(opened.at) <= 10) return ["warn", "fa-solid fa-fire", `Opened your link ${it.link_opens}× (last ${esc(when(opened.at))}).`, "This is the best moment to call or message them.", (it.phone || waOf(it) ? b("mk-ctab", "Log a call", "fa-solid fa-phone", { data: 'data-v="activity" data-kind="call"' }) : "") + (waOf(it) ? b("mk-ctab", "WhatsApp", "fa-brands fa-whatsapp", { data: 'data-v="wa" data-tpl="wa_demo"' }) : "") + (canEmail(it) ? b("mk-ctab", "Demo invitation", "fa-regular fa-envelope", { data: 'data-v="email" data-tpl="demo_invite"' }) : "")];
      if (it.email_status === "unsubscribed") return ["info", "fa-solid fa-ban", "Unsubscribed from emails.", `${it.unsubscribe_reason ? `Reason: ${esc(REASONS[it.unsubscribe_reason] || it.unsubscribe_reason)}. ` : ""}Use WhatsApp or a call only if they agree.`, ""];
      if (!it.emails_drafted && !it.whatsapp_opened) return ["info", "fa-regular fa-paper-plane", "Not contacted yet.", "Start with the introduction that fits their business.", (canEmail(it) ? b("mk-ctab", "Email introduction", "fa-regular fa-envelope", { primary: true, data: `data-v="email" data-tpl="${esc(suggestEmail(it))}"` }) : "") + (waOf(it) ? b("mk-ctab", "WhatsApp", "fa-brands fa-whatsapp", { data: `data-v="wa" data-tpl="${esc(suggestWa(it))}"` }) : "")];
      if (lastEmail != null && lastEmail >= 3 && !it.last_reply_at && canEmail(it) && it.emails_drafted < 4) return ["info", "fa-solid fa-reply", `No reply for ${lastEmail} days.`, `Send ${tplName(fu)}.`, b("mk-ctab", "Write follow-up", "fa-regular fa-envelope", { primary: true, data: `data-v="email" data-tpl="${fu}"` })];
      return null;
    }

    function contactHeader(it){
      const sc = score(it), h = heat(sc);
      const waOk = waOf(it) && it.whatsapp_status === "ok";
      const menu = st.menu === "contact" ? `<div class="tm-mk-menu" role="menu">
          <button type="button" role="menuitem" data-dp-act="mk-edit"><i class="fa-solid fa-pen"></i> Edit details</button>
          <button type="button" role="menuitem" data-dp-act="mk-ctab" data-v="profile"><i class="fa-solid fa-id-card"></i> Deal, people & links</button>
          <button type="button" role="menuitem" data-dp-act="mk-copy-card"><i class="fa-regular fa-copy"></i> Copy contact details</button>
          ${it.address || it.city ? `<a role="menuitem" href="https://www.openstreetmap.org/search?query=${encodeURIComponent([it.name, it.address, it.city, it.country].filter(Boolean).join(", "))}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-map-location-dot"></i> Open on the map</a>` : ""}
          <hr>
          ${it.email && it.email_status === "subscribed" ? `<button type="button" role="menuitem" data-dp-act="mk-unsub" class="is-danger"><i class="fa-solid fa-ban"></i> Mark unsubscribed</button><button type="button" role="menuitem" data-dp-act="mk-bounce"><i class="fa-solid fa-triangle-exclamation"></i> Mark email bounced</button>` : ""}
          ${waOk ? `<button type="button" role="menuitem" data-dp-act="mk-wa-off" class="is-danger"><i class="fa-solid fa-hand"></i> WhatsApp: replied STOP</button>` : ""}
          <button type="button" role="menuitem" data-dp-act="mk-del" class="is-danger"><i class="fa-regular fa-trash-can"></i> Delete contact</button>
        </div>` : "";
      return `<div class="tm-mk-hero">
          <div class="tm-mk-hero-top">
            <span class="tm-mk-av is-lg${it.kind === "individual" ? " is-person" : ""}" aria-hidden="true">${esc(initials(it.name))}</span>
            <div class="tm-mk-hero-id"><b>${star(it)} ${esc(it.contact_person || it.name)}</b>
              <small>${esc([it.contact_person ? it.name : (it.kind === "individual" ? "Individual" : "Company"), it.category, it.city].filter(Boolean).join(" · "))}</small>
              <div class="tm-mk-hero-pills">${pill(statusLabel(it.status), STATUS_TONE[it.status] || "")}${pill(`${h[0]} · ${sc}`, h[1], h[2])}${emailPill(it)}${duePill(it)}${it.deal_value ? pill(money(it.deal_value, it.deal_currency), "ok", "fa-solid fa-coins") : ""}${it.lang === "ar" ? pill("Arabic", "", "fa-solid fa-language") : ""}${tagChips(it.tags, 4)}</div>
            </div>
          </div>
          <div class="tm-mk-actbar">
            ${waOk ? `<button type="button" class="tm-mk-b is-wa" data-dp-act="mk-ctab" data-v="wa"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>WhatsApp</span></button>` : ""}
            ${waOk ? b("mk-wa-copy", "Copy message", "fa-regular fa-copy") : ""}
            ${b("mk-ctab", "Note", "fa-regular fa-note-sticky", { data: 'data-v="activity" data-kind="note"' })}
            ${it.phone || waOf(it) ? `<a class="tm-mk-b" href="tel:${esc(String(it.phone || "+" + waOf(it)).replace(/[^0-9+]/g, ""))}" data-dp-act="mk-call-log"><i class="fa-solid fa-phone" aria-hidden="true"></i><span>Call</span></a>` : ""}
            ${canEmail(it) ? b("mk-ctab", "Email", "fa-regular fa-envelope", { data: 'data-v="email"' }) : ""}
            ${it.website ? `<a class="tm-mk-b" href="${esc(it.website)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-globe" aria-hidden="true"></i><span>Website</span></a>` : ""}
            <span class="tm-mk-menu-wrap">${b("mk-menu", "More", "fa-solid fa-ellipsis", { data: 'data-v="contact"' })}${menu}</span>
          </div>
        </div>`;
    }

    function contactOverview(it, ev){
      const ns = nextStep(it, ev);
      const lastTouch = [it.last_emailed_at, it.last_whatsapp_at, it.last_link_open_at, it.last_reply_at, ...ev.filter(e => ["call", "meeting", "note"].includes(e.kind)).map(e => e.at)].filter(Boolean).sort().pop();
      const ds = daysSince(lastTouch);
      const replies = ev.filter(e => e.kind === "reply").length;
      const calls = ev.filter(e => e.kind === "call" || e.kind === "meeting").length;
      const tiles = `<div class="tm-mk-tiles">
          ${tile("Lead score", `${score(it)}`, heat(score(it))[1], heat(score(it))[0])}
          ${tile("Emails", num(it.emails_drafted), "", it.last_emailed_at ? `last ${esc(day(it.last_emailed_at))}` : "")}
          ${tile("Opened link", num(it.link_opens), it.link_opens ? "warn" : "", it.last_link_open_at ? esc(day(it.last_link_open_at)) : "")}
          ${tile("WhatsApp", num(it.whatsapp_opened), "", it.last_whatsapp_at ? esc(day(it.last_whatsapp_at)) : "")}
          ${tile("Replies · calls", `${num(replies)} · ${num(calls)}`, replies ? "ok" : "")}
          ${tile("Last touch", ds == null ? "—" : ds === 0 ? "Today" : `${ds} d`, ds != null && ds > 14 ? "bad" : "", lastTouch ? esc(day(lastTouch)) : "Never")}
        </div>`;
      const banner = ns ? `<div class="tm-mk-next is-${ns[0]}"><i class="${ns[1]}" aria-hidden="true"></i><div><b>${ns[2]}</b> ${ns[3]}</div>${ns[4] ? `<span>${ns[4]}</span>` : ""}</div>` : "";
      const wa = waOf(it);
      const row = (label, value, extra = "") => `<div class="tm-mk-row2"><dt>${esc(label)}</dt><dd>${value}${extra}</dd></div>`;
      const contactCard = `<dl class="tm-mk-dl">
          ${row("Contact person", esc(it.contact_person || "—"))}
          ${row("Email", it.email ? `<a href="mailto:${esc(it.email)}">${esc(it.email)}</a> ${emailPill(it)}` : "—", it.email ? copyBtn(it.email, "Email") : "")}
          ${row("WhatsApp", wa ? `+${esc(wa)}${!it.whatsapp ? ` <span class="tm-mk-faint">from phone</span>` : ""}${it.whatsapp_status !== "ok" ? " " + pill("Opted out", "bad") : ""}` : "—", wa ? copyBtn("+" + wa, "WhatsApp number") : "")}
          ${row("Phone", esc(it.phone || "—"), it.phone ? copyBtn(it.phone, "Phone") : "")}
          ${row("Website", it.website ? `<a href="${esc(it.website)}" target="_blank" rel="noopener noreferrer">${esc(it.website.replace(/^https?:\/\//, ""))}</a>` : "—")}
          ${row("Address", esc([it.address, it.city, it.country].filter(Boolean).join(", ") || "—"))}
          ${(it.people || []).length ? row("Other people", (it.people || []).map(p => `${esc(p.name)}${p.role ? ` <span class="tm-mk-faint">${esc(p.role)}</span>` : ""}${p.email ? ` · <a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ""}${p.phone ? ` · ${esc(p.phone)}` : ""}`).join("<br>")) : ""}
          ${Object.keys(it.social || {}).length ? row("Links", Object.entries(it.social).map(([kk, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc({ linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", x: "X", maps: "Map" }[kk] || kk)}</a>`).join(" · ")) : ""}
          ${row("Source", it.source === "search" ? (String(it.source_ref || "").startsWith("osm:") ? `Find new · <a href="https://www.openstreetmap.org/${esc(String(it.source_ref).slice(4))}" target="_blank" rel="noopener noreferrer">map</a>` : "Find new / import") : "Added by hand")}
          ${row("Added", esc(when(it.created_at)))}
        </dl>`;
      const statusRow = `<div class="tm-mk-status" role="group" aria-label="Status">${STATUSES.map(([v, l, ic]) =>
        `<button type="button" class="tm-mk-st${it.status === v ? " is-on" : ""}" data-dp-act="mk-status" data-v="${v}"${st.busy ? " disabled" : ""}><i class="${ic}" aria-hidden="true"></i> ${esc(l)}</button>`).join("")}</div>`;
      const plan = `<div class="tm-mk-plan">
          <div><span class="tm-mk-lbl">Priority</span><span class="tm-mk-seg2">${PRIORITY.map(([v, l]) => `<button type="button" class="tm-mk-sg${it.priority === v ? " is-on" : ""}" data-dp-act="mk-priority" data-v="${v}">${v === "high" ? '<i class="fa-solid fa-star" aria-hidden="true"></i> ' : ""}${esc(l)}</button>`).join("")}</span></div>
          <div><span class="tm-mk-lbl">Follow-up</span><span class="tm-mk-inline">${inp("followDate", it.next_follow_up || "", { type: "date" })}${ib("mk-follow", "Save date", "fa-solid fa-check")}${b("mk-follow-q", "+1d", "", { data: 'data-days="1"' })}${b("mk-follow-q", "+3d", "", { data: 'data-days="3"' })}${b("mk-follow-q", "+1w", "", { data: 'data-days="7"' })}${b("mk-follow-q", "+1m", "", { data: 'data-days="30"' })}${it.next_follow_up ? ib("mk-follow-clear", "Clear", "fa-solid fa-xmark") : ""}</span></div>
          <div><span class="tm-mk-lbl">Tags</span><span class="tm-mk-tags-edit">${(it.tags || []).map(t => `<span class="tm-mk-tag">#${esc(t)} <button type="button" data-dp-act="mk-tag-rm" data-v="${esc(t)}" aria-label="Remove ${esc(t)}">×</button></span>`).join("")}<span class="tm-mk-inline">${inp("tagInput", st.tagInput, { max: 30, ph: "add tag" })}${ib("mk-tag-add", "Add tag", "fa-solid fa-plus")}</span></span></div>
        </div>`;
      const notes = it.notes ? `<p class="tm-mk-notes">${esc(it.notes)}</p>` : `<p class="tm-mk-muted">No notes. ${b("mk-edit", "Add", "fa-solid fa-plus")}</p>`;
      return `${tiles}${banner}
        ${sec("Contact", contactCard, b("mk-edit", "Edit", "fa-solid fa-pen"), "fa-regular fa-address-card")}
        ${sec("Status", statusRow, "", "fa-solid fa-flag")}
        ${sec("Plan", plan, "", "fa-regular fa-calendar")}
        ${sec("Notes", notes, "", "fa-regular fa-note-sticky")}
        ${sec("Latest activity", timeline(ev.slice(0, 4)), ev.length > 4 ? b("mk-ctab", "All", "", { data: 'data-v="activity"' }) : "", "fa-solid fa-clock-rotate-left")}`;
    }

    function contactActivity(it, ev){
      const F = { all: () => true, email: e => /^email|link_opened|unsubscribed|resubscribed/.test(e.kind), wa: e => /whatsapp/.test(e.kind), talk: e => ["call", "meeting", "reply"].includes(e.kind),
        notes: e => e.kind === "note", tasks: e => /^task/.test(e.kind) };
      const list = ev.filter(F[st.evFilter] || F.all);
      const chips = [["all", "All"], ["email", "Email"], ["wa", "WhatsApp"], ["talk", "Calls & replies"], ["notes", "Notes"], ["tasks", "Tasks"]];
      return `${sec("Log a call, meeting, reply or note", `<div class="tm-mk-log">
          <span class="tm-mk-seg2" role="group" aria-label="Activity type">${ACTIVITY.map(([v, l, i]) => `<button type="button" class="tm-mk-sg${st.act.kind === v ? " is-on" : ""}" data-dp-act="mk-act-kind" data-v="${v}"><i class="${i}" aria-hidden="true"></i> ${esc(l)}</button>`).join("")}</span>
          <textarea class="tm-mk-in" data-mk="act.text" rows="2" maxlength="2000" placeholder="${st.act.kind === "call" ? "What was said on the call?" : st.act.kind === "meeting" ? "Meeting notes" : st.act.kind === "reply" ? "What did they reply?" : "Note"}">${esc(st.act.text)}</textarea>
          <div class="tm-mk-foot is-left"><span class="tm-mk-inline"><span class="tm-mk-lbl">Next follow-up</span>${inp("act.follow", st.act.follow, { type: "date" })}</span>${b("mk-act-save", "Save", "fa-solid fa-check", { primary: true, disabled: !!st.busy })}</div>
        </div>`, "", "fa-solid fa-pen-to-square")}
        ${sec(`Timeline (${list.length})`, `<div class="tm-mk-quick">${chips.map(([v, l]) => `<button type="button" class="tm-mk-q${st.evFilter === v ? " is-on" : ""}" data-dp-act="mk-ev-filter" data-v="${v}">${esc(l)}</button>`).join("")}</div>${timeline(list)}`, "", "fa-solid fa-clock-rotate-left")}`;
    }

    function contactEmail(it, ev){
      const unsub = it.email_status === "unsubscribed", bounced = it.email_status === "bounced";
      const sent = ev.filter(e => e.kind === "email_drafted" || e.kind === "link_opened" || e.kind === "unsubscribed");
      const busy = st.busy;
      let box;
      if (!it.email) box = `<p class="tm-mk-muted">No email address. ${b("mk-edit", "Add one", "fa-solid fa-plus")}</p>`;
      else if (unsub) box = k.statusCard("Unsubscribed from emails", `${esc(it.email)} unsubscribed ${esc(when(it.unsubscribed_at))}${it.unsubscribe_source === "link" ? " with the link in our email" : " (marked by an admin)"}${it.unsubscribe_reason ? `. Reason: <b>${esc(REASONS[it.unsubscribe_reason] || it.unsubscribe_reason)}</b>` : ""}${it.unsubscribe_note ? ` · “${esc(it.unsubscribe_note)}”` : ""}. Triplem VIP will not create emails to this address.`, "bad")
          + `<details class="tm-mk-more"><summary>Allow emails again</summary>${field("Reason (required)", inp("reason", st.reason, { max: 300, ph: "For example: asked by email on 1 Dec to receive offers" }))}
            <div class="tm-mk-foot">${b("mk-resub", "Allow emails again", "fa-solid fa-rotate-left", { disabled: !!busy })}</div></details>`;
      else if (bounced) box = k.statusCard("Emails bounced", `Check ${esc(it.email)} before emailing again.`, "warn") + `<div class="tm-mk-foot">${b("mk-resub-bounce", "Address is correct now", "fa-solid fa-check")}</div>`;
      else {
        const mail = T()?.buildEmail({ template: st.emailTpl, contact: it, settings: st.settings || {}, token: "preview", note: st.note, subject: st.subject, logoSrc: new URL("Assets/logo/email-logo.png", document.baseURI).href });
        if (st.showPreview) st.previewHtml = mail?.html;
        box = `<div class="tm-mk-grid">${field("Template", emailTplSel("emailTpl", st.emailTpl), st.emailTpl === suggestEmail(it) ? "suggested" : "")}
             ${field("Subject", inp("subject", st.subject, { max: 180, ph: mail?.subject || "" }), "optional")}</div>
           ${field("Personal note", `<textarea class="tm-mk-in" data-mk="note" rows="2" maxlength="1200" placeholder="Optional first paragraph, for example how you know them">${esc(st.note)}</textarea>`, "optional")}
           <div class="tm-mk-foot is-left">
             ${b("mk-outlook", busy === "outlook" ? "Opening…" : "Open in Outlook", "fa-solid fa-envelope-open-text", { primary: true, disabled: !!busy })}
             ${b("mk-eml", busy === "eml" ? "Preparing…" : ".eml", "fa-solid fa-download", { disabled: !!busy, title: "Download the email as a file" })}
             ${b("mk-preview-toggle", st.showPreview ? "Hide preview" : "Preview", "fa-regular fa-eye")}
             <span class="tm-mk-hint">${st.helper === false ? '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Outlook helper not found: the email will be downloaded.' : st.helper ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Outlook helper running.' : ""}</span>
           </div>
           ${st.showPreview ? `<p class="tm-mk-subject">${esc(mail?.subject || "")}</p><div class="tm-mk-frame" data-mk-mail="contact" role="document" aria-label="Email preview"></div>` : ""}`;
      }
      return `${sec("Write an email", box, "", "fa-regular fa-envelope")}
        ${sec(`Email history (${sent.length})`, timeline(sent), "", "fa-solid fa-clock-rotate-left")}`;
    }

    function contactWhatsApp(it, ev){
      const wa = waOf(it);
      const hist = ev.filter(e => /whatsapp/.test(e.kind));
      let box;
      if (!wa) box = `<p class="tm-mk-muted">No WhatsApp number, and the phone has no country code. ${b("mk-edit", "Add a number", "fa-solid fa-plus")}</p>`;
      else if (it.whatsapp_status !== "ok") box = k.statusCard("Asked not to get WhatsApp messages", "Do not message this number.", "bad") + `<div class="tm-mk-foot">${b("mk-wa-on", "Allow WhatsApp again", "fa-solid fa-rotate-left")}</div>`;
      else {
        const text = st.waText ?? T()?.buildWhatsApp({ template: st.waTpl, contact: it, settings: st.settings || {} }) ?? "";
        box = `<div class="tm-mk-grid">${field("Template", waTplSel("waTpl", st.waTpl), st.waTpl === suggestWa(it) ? "suggested" : "")}
            ${field("Number", `<div class="tm-mk-static">+${esc(wa)}${!it.whatsapp ? ` <span class="tm-mk-faint">from phone</span>` : ""}</div>`)}</div>
          ${field("Message", `<textarea class="tm-mk-in tm-mk-watext" data-mk="waText" rows="7" maxlength="3000" dir="auto">${esc(text)}</textarea>`, "you can edit it")}
          <div class="tm-mk-foot is-left">
            <button type="button" class="tm-mk-b is-wa" data-dp-act="mk-wa"${st.busy ? " disabled" : ""}><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>Open WhatsApp</span></button>
            ${b("mk-wa-copy", "Copy", "fa-regular fa-copy")}${st.waText != null ? b("mk-wa-reset", "Reset text", "fa-solid fa-rotate-left") : ""}
            ${b("mk-wa-off", "Replied STOP", "fa-solid fa-hand", { danger: true })}
          </div>`;
      }
      return `${sec("WhatsApp message", box, "", "fa-brands fa-whatsapp")}${sec(`WhatsApp history (${hist.length})`, timeline(hist), "", "fa-solid fa-clock-rotate-left")}`;
    }

    function contactTasks(it){
      const list = st.detail.tasks || [];
      return sec("Tasks", `<div class="tm-mk-inline tm-mk-addtask">${inp("task.title", st.task.title, { max: 200, ph: "For example: send the price list" })}${inp("task.due", st.task.due, { type: "date" })}${b("mk-task-add", "Add", "fa-solid fa-plus", { primary: true })}</div>
        <div class="tm-mk-quick">${[["Send the demo link", 1], ["Call back", 2], ["Send a proposal", 3], ["Check the trial", 7]].map(([t, d]) => `<button type="button" class="tm-mk-q" data-dp-act="mk-task-quick" data-t="${esc(t)}" data-d="${d}">+ ${esc(t)}</button>`).join("")}</div>
        ${tasksHtml(list, false)}`, "", "fa-regular fa-square-check");
    }

    function contactJourney(it){
      const j = st.detail.journey;
      if (!j) return v3note() || k.note("The journey needs database update 250.", "warn");
      const steps = [["added", "Added to your list", "fa-solid fa-plus"], ["contacted", "First contact (email, WhatsApp or call)", "fa-regular fa-paper-plane"], ["opened", "Opened the link in an email", "fa-solid fa-arrow-pointer"],
        ["replied", "Replied or met", "fa-solid fa-reply"], ["inquired", "Sent an inquiry on triplem.vip", "fa-regular fa-comments"], ["signed_up", "Created a Triplem VIP account", "fa-solid fa-user-check"],
        ["paying", "On a paid plan", "fa-solid fa-credit-card"], ["client", "Marked as client", "fa-solid fa-handshake"]];
      let prev = null;
      const li = steps.map(([key, label, icon]) => {
        const at = j[key]; const gap = at && prev ? Math.round((new Date(at) - new Date(prev)) / 86400000) : null; if (at) prev = at;
        return `<li class="${at ? "is-done" : ""}"><i class="${icon}" aria-hidden="true"></i><div><b>${esc(label)}</b><small>${at ? esc(when(at)) + (gap != null && gap >= 0 ? ` · +${gap} d` : "") : "Not yet"}${key === "inquired" && j.inquiries > 1 ? ` · ${j.inquiries} inquiries` : ""}</small></div></li>`;
      }).join("");
      const a = j.account;
      const acc = a ? `<dl class="tm-mk-dl">
          <div class="tm-mk-row2"><dt>Account</dt><dd>@${esc(a.username)}${a.name ? ` · ${esc(a.name)}` : ""}</dd></div>
          <div class="tm-mk-row2"><dt>Plan</dt><dd>${pill(a.plan === "full" ? "Paid" : a.plan === "trial" ? "Trial" : (a.plan || "—"), a.plan === "full" ? "ok" : "info")}${a.trial_expires_at && a.plan === "trial" ? ` <span class="tm-mk-faint">until ${esc(day(a.trial_expires_at))}</span>` : ""}${a.active ? "" : " " + pill("Disabled", "bad")}</dd></div>
          <div class="tm-mk-row2"><dt>Signed up</dt><dd>${esc(when(a.created_at))}</dd></div>
          <div class="tm-mk-row2"><dt>Last sign-in</dt><dd>${esc(when(a.last_login_at))}</dd></div>
          <div class="tm-mk-row2"><dt>Last active</dt><dd>${esc(when(a.last_seen_at))}${a.last_seen_at && daysSince(a.last_seen_at) > 14 ? " " + pill("At risk", "warn") : ""}</dd></div>
        </dl>` : `<p class="tm-mk-muted">No Triplem VIP account found with this email or phone yet.</p>`;
      return `${sec("Visitor-to-customer journey", `<ol class="tm-mk-journey">${li}</ol>`, "", "fa-solid fa-route")}
        ${sec("Triplem VIP account", acc + `<p class="tm-mk-hint">Matched by the account's company email or phone. Read-only.</p>`, "", "fa-solid fa-user-check")}`;
    }

    function contactProfile(it){
      if (!st.profile) st.profile = { deal_value: it.deal_value ?? "", deal_currency: it.deal_currency || "AED", expected_close: it.expected_close || "", lang: it.lang || "en",
        lost_reason: it.lost_reason || "", people: (it.people || []).map(p => ({ ...p })), social: { linkedin: "", instagram: "", facebook: "", x: "", maps: "", ...(it.social || {}) } };
      const p = st.profile;
      const people = p.people.map((x, i) => `<div class="tm-mk-person">
          ${inp(`pp.${i}.name`, x.name, { max: 120, ph: "Name" })}${inp(`pp.${i}.role`, x.role, { max: 80, ph: "Role" })}${inp(`pp.${i}.email`, x.email, { max: 254, ph: "Email", type: "email" })}${inp(`pp.${i}.phone`, x.phone, { max: 40, ph: "Phone" })}
          ${ib("mk-person-rm", "Remove", "fa-solid fa-xmark", `data-i="${i}"`)}</div>`).join("");
      return `${sec("Deal", `<div class="tm-mk-grid is-3">
            ${field("Value", inp("pf.deal_value", p.deal_value, { type: "number", max: 15, ph: "0", extra: ' min="0" step="0.01" inputmode="decimal"' }))}
            ${field("Currency", sel("pf.deal_currency", p.deal_currency, CURRENCIES.map(c => [c, c])))}
            ${field("Expected close", inp("pf.expected_close", p.expected_close, { type: "date" }))}</div>
          ${field("Lost reason", inp("pf.lost_reason", p.lost_reason, { max: 300, ph: "Only if they are not interested, for example: price, timing, uses another system" }))}`, "", "fa-solid fa-coins")}
        ${sec("Language", `<span class="tm-mk-seg2">${[["en", "English"], ["ar", "Arabic"]].map(([v, l]) => `<button type="button" class="tm-mk-sg${p.lang === v ? " is-on" : ""}" data-dp-act="mk-pf-lang" data-v="${v}">${esc(l)}</button>`).join("")}</span>
          <p class="tm-mk-hint">Arabic contacts get the Arabic email and WhatsApp templates suggested first.</p>`, "", "fa-solid fa-language")}
        ${sec("Other people", `${people || `<p class="tm-mk-muted">Add the owner, the accountant or the manager you speak with.</p>`}<div class="tm-mk-foot is-left">${b("mk-person-add", "Add person", "fa-solid fa-user-plus", { disabled: p.people.length >= 10 })}</div>`, "", "fa-solid fa-users")}
        ${sec("Links", `<div class="tm-mk-grid">${[["linkedin", "LinkedIn"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["x", "X (Twitter)"], ["maps", "Google Maps / map link"]].map(([kk, l]) => field(l, inp(`ps.${kk}`, p.social[kk], { max: 300, ph: "https://" }))).join("")}</div>`, "", "fa-solid fa-link")}
        <div class="tm-mk-foot">${b("mk-pf-cancel", "Undo changes", "fa-solid fa-rotate-left")}${b("mk-pf-save", st.busy === "profile" ? "Saving…" : "Save profile", "fa-solid fa-check", { primary: true, disabled: !!st.busy })}</div>`;
    }

    function detailHtml(){
      const back = `<button type="button" class="tm-mk-back" data-dp-act="mk-back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> All contacts</button>`;
      if (st.detailErr) return `<div class="tm-mk">${back}${k.note(esc(st.detailErr), "warn")}</div>`;
      if (!st.detail) return `<div class="tm-mk">${back}${k.skel(6)}</div>`;
      const it = st.detail.item, ev = st.detail.events || [];
      const n = f => ev.filter(f).length;
      const tabs = [["overview", "Overview", "", "fa-solid fa-gauge"], ["activity", "Activity", ev.length, "fa-solid fa-clock-rotate-left"], ["email", "Email", n(e => e.kind === "email_drafted"), "fa-regular fa-envelope"],
        ["wa", "WhatsApp", n(e => e.kind === "whatsapp_opened"), "fa-brands fa-whatsapp"], ["tasks", "Tasks", (st.detail.tasks || []).filter(t => !t.done_at).length, "fa-regular fa-square-check"],
        ["journey", "Journey", "", "fa-solid fa-route"], ["profile", "Profile", "", "fa-solid fa-id-card"]];
      const body = st.ctab === "activity" ? contactActivity(it, ev) : st.ctab === "email" ? contactEmail(it, ev) : st.ctab === "wa" ? contactWhatsApp(it, ev)
        : st.ctab === "tasks" ? contactTasks(it) : st.ctab === "journey" ? contactJourney(it) : st.ctab === "profile" ? contactProfile(it) : contactOverview(it, ev);
      return `<div class="tm-mk">${back}${contactHeader(it)}${subtabs("mk-ctab", st.ctab, tabs)}${body}
        ${st.confirmDelete ? `<div class="tm-mk-confirm">${k.note("Delete this contact? It is hidden from the list; an unsubscribed address stays blocked.", "warn")}<div class="tm-mk-foot">${b("mk-del-no", "Keep", "")}${b("mk-del-yes", "Yes, delete", "fa-solid fa-trash", { danger: true })}</div></div>` : ""}
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
          <div class="tm-mk-grid">${FIELDS.map(([key, label, type, max]) => field(label, `<input class="tm-mk-in" type="${type === "email" ? "email" : "text"}" inputmode="${type === "tel" ? "tel" : type === "email" ? "email" : type === "url" ? "url" : "text"}" data-mk="form.${key}" value="${esc(f[key] || "")}" maxlength="${max}"${key === "name" ? " required" : ""}${key === "country" ? ' list="tmMkCountries2"' : ""}${key === "category" ? ' list="tmMkCats"' : ""} autocomplete="off">`)).join("")}
            ${field("Tags", inp("form.tags", f.tags, { max: 300, ph: "vip, dubai expo" }), "comma-separated")}
            ${field("Priority", sel("form.priority", f.priority, PRIORITY))}
            ${field("Next follow-up", inp("form.next_follow_up", f.next_follow_up, { type: "date" }), "optional")}</div>
          <datalist id="tmMkCountries2">${COUNTRIES.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
          <datalist id="tmMkCats">${CATEGORIES.map(c => `<option value="${esc(c[1])}">`).join("")}</datalist>
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
          const text = cur ? T()?.buildWhatsApp({ template: c.waTemplate, contact: cur, settings: st.settings || {} }) : "";
          return `<div class="tm-mk">${sec(`WhatsApp · ${r.name}`, r.done || !cur
              ? k.statusCard("Campaign finished", `${num(r.sent)} message${r.sent === 1 ? "" : "s"} opened, ${num(r.skipped + (r.queue.length - r.pos))} skipped.`, "ok") + `<div class="tm-mk-foot">${b("mk-camp-close", "Close", "fa-solid fa-check", { primary: true })}</div>`
              : `<div class="tm-mk-progressbar"><i style="width:${Math.round(r.pos * 100 / r.queue.length)}%"></i></div><p class="tm-mk-progress"><b>${num(r.pos + 1)}</b> of ${num(r.queue.length)}</p>
                 <div class="tm-mk-wa-card"><b>${esc(cur.name)}</b><small>+${esc(waOf(cur))} · ${esc([cur.city, cur.category].filter(Boolean).join(" · "))}</small><pre class="tm-mk-wa" dir="auto">${esc(text)}</pre></div>
                 <div class="tm-mk-foot is-left"><button type="button" class="tm-mk-b is-wa" data-dp-act="mk-camp-wa-open"${st.busy ? " disabled" : ""}><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>Open WhatsApp</span></button>${b("mk-camp-wa-skip", "Skip", "fa-solid fa-forward")}${b("mk-camp-wa-stop", "Stop", "fa-solid fa-stop", { danger: true })}</div>
                 <p class="tm-mk-hint">Each message opens in WhatsApp; press Send there, then come back. The next contact appears automatically.</p>`, "", "fa-brands fa-whatsapp")}</div>`;
        }
        const label = { waiting: "Waiting", working: "Preparing…", outlook: "Opened in Outlook", zip: "In the ZIP", skipped: "Skipped", "bcc-outlook": "In Bcc · opened in Outlook", "bcc-file": "In Bcc · downloaded" };
        const okN = r.rows.filter(x => x.state !== "skipped" && x.state !== "waiting" && x.state !== "working").length;
        return `<div class="tm-mk">${sec(`${r.bcc ? "One email · Bcc" : "Email"} · ${r.name}`, `${r.done ? k.statusCard("Campaign finished", `${num(okN)} ${r.bcc ? "people in Bcc" : "email draft(s) created"}, ${num(r.rows.filter(x => x.state === "skipped").length)} skipped.${Number(c.followDays) ? ` Follow-up set in ${esc(c.followDays)} days.` : ""}`, "ok")
            : `<div class="tm-mk-progressbar"><i style="width:${r.rows.length ? Math.round(okN * 100 / r.rows.length) : 10}%"></i></div><p class="tm-mk-progress">Preparing…</p>`}
            <ul class="tm-mk-runlist">${r.rows.map(x => `<li class="is-${x.state}"><span>${esc(x.name)}</span><small>${esc(label[x.state] || x.state)}${x.tpl && c.abTemplate ? ` · ${esc(tplName(x.tpl))}` : ""}${x.why ? ` · ${esc(x.why)}` : ""}</small></li>`).join("")}</ul>
            ${r.done ? `<div class="tm-mk-foot">${b("mk-camp-close", "Close", "fa-solid fa-check", { primary: true })}</div>` : ""}`, "", "fa-regular fa-envelope")}</div>`;
      }
      if (!c.list) loadCampaigns();
      const a = audience();
      const auds = [["selected", `Selected in Contacts (${st.picked.size})`], ["all", "All contacts"], ["hot", "Hot leads (score 60+)"], ["warm", "Warm leads (30-59)"], ...STATUSES.map(([v, l]) => [v, `Status: ${l}`]),
        ["due", "Follow-up due"], ["high", "High priority"], ["has_email", "Has an email"], ["has_wa", "Has WhatsApp / mobile"], ...(st.tagList || []).map(t => [`tag:${t.tag}`, `#${t.tag}`])];
      const best = bestTime();
      const form = `<div class="tm-mk-grid">
          ${field("Campaign name", inp("camp.name", c.name, { max: 120, ph: "For example: Dubai insurers – December" }))}
          ${field("Channel", sel("camp.channel", c.channel, [["email", "Email"], ["whatsapp", "WhatsApp"]]))}
          ${c.channel === "email" ? field("Template", emailTplSel("camp.template", c.template)) : field("Template", waTplSel("camp.waTemplate", c.waTemplate))}
          ${field("Audience", sel("camp.audience", c.audience, auds))}
          ${c.channel === "email" && c.mode !== "bcc" ? field("A/B test", `<select class="tm-mk-in" data-mk="camp.abTemplate"><option value="">No test (one template)</option>${(T()?.list() || []).filter(t => t.id !== c.template).map(t => `<option value="${esc(t.id)}"${t.id === c.abTemplate ? " selected" : ""}>B: ${esc(t.name)}</option>`).join("")}</select>`, "half get template B") : ""}
          ${field("Follow-up date", sel("camp.followDays", c.followDays, [["0", "Do not set"], ["2", "In 2 days"], ["3", "In 3 days"], ["5", "In 5 days"], ["7", "In 1 week"], ["14", "In 2 weeks"]]), "for everyone reached")}
        </div>
        <label class="tm-mk-check"><input type="checkbox" data-mk="camp.onlyNew"${c.onlyNew ? " checked" : ""}> Only people not ${c.channel === "email" ? "emailed" : "messaged"} before</label>
        ${c.channel === "email" ? `<span class="tm-mk-seg2 is-full" role="radiogroup" aria-label="Delivery">
            <button type="button" class="tm-mk-sg${c.mode === "outlook" ? " is-on" : ""}" data-dp-act="mk-camp-mode" data-v="outlook"><i class="fa-solid fa-envelope-open-text" aria-hidden="true"></i> Personal emails in Outlook</button>
            <button type="button" class="tm-mk-sg${c.mode === "zip" ? " is-on" : ""}" data-dp-act="mk-camp-mode" data-v="zip"><i class="fa-solid fa-file-zipper" aria-hidden="true"></i> Personal emails as ZIP</button>
            <button type="button" class="tm-mk-sg${c.mode === "bcc" ? " is-on" : ""}" data-dp-act="mk-camp-mode" data-v="bcc"><i class="fa-solid fa-user-secret" aria-hidden="true"></i> One email · everyone in Bcc</button></span>
          ${c.mode === "bcc" ? k.note("One email goes to your own address with everyone else hidden in <b>Bcc</b>, so nobody sees the other addresses. It cannot use names or personal unsubscribe links: the email asks people to reply “Unsubscribe”, and link clicks are counted for the whole campaign. Up to 100 people per email (300 per campaign).", "info", "fa-solid fa-user-secret") : ""}` : ""}
        <div class="tm-mk-aud"><b>${num(a.ok.length)}</b> will get ${c.channel === "email" ? (c.mode === "bcc" ? "the Bcc email" : "an email draft") : "a WhatsApp message"}${a.skip.length ? ` · <span>${num(a.skip.length)} skipped (${esc([...new Set(a.skip.map(s => s.why))].join(", "))})</span>` : ""}</div>
        ${best ? `<p class="tm-mk-hint"><i class="fa-regular fa-clock" aria-hidden="true"></i> Your contacts open links most on <b>${esc(best)}</b> (Dubai time).</p>` : ""}
        <div class="tm-mk-foot">${b("mk-camp-preview", "Preview", "fa-regular fa-eye")}${b("mk-camp-start", c.channel === "email" ? (c.mode === "bcc" ? "Create the Bcc email" : "Create email drafts") : "Start WhatsApp queue", c.channel === "email" ? "fa-solid fa-paper-plane" : "fa-brands fa-whatsapp", { primary: true, disabled: !a.ok.length || !!st.busy })}</div>
        ${st.campPreview ? (c.channel === "email" ? `<p class="tm-mk-subject">${esc(st.campPreviewSubject)}</p><div class="tm-mk-frame" data-mk-mail="camp" role="document" aria-label="Email preview"></div>` : `<pre class="tm-mk-wa" dir="auto">${esc(st.campPreview)}</pre>`) : ""}`;
      const hist = c.list === null ? k.skel(3) : !c.list.length ? `<p class="tm-mk-muted">No campaigns yet.</p>`
        : `<div class="tm-mk-table" role="table"><div class="tm-mk-tr is-head" role="row"><span>Campaign</span><span>Sent</span><span>Opened</span><span>Replied</span><span>Unsub.</span></div>
            ${c.list.map(x => `<div class="tm-mk-tr" role="row"><span><b>${esc(x.name)}</b><small>${x.channel === "email" ? "Email" : "WhatsApp"} · ${esc(tplName(x.template))} · ${esc(day(x.created_at))}</small></span>
              <span>${num(x.sent)}</span><span>${x.channel === "email" ? `${num(x.opened)} <small>${pct(x.opened, x.sent)}</small>` : "—"}</span><span>${num(x.replied)}</span><span>${x.channel === "email" ? num(x.unsubscribed) : "—"}</span></div>`).join("")}</div>`;
      return `<div class="tm-mk">${v3note()}${sec("New campaign", form, "", "fa-solid fa-paper-plane")}${sec("Past campaigns", hist, ib("mk-camp-refresh", "Refresh", "fa-solid fa-rotate"), "fa-solid fa-clock-rotate-left")}</div>`;
    }
    const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    function bestTime(){
      const t = st.ins?.timing || []; if (!t.length) return "";
      const byDay = {}, byHour = {};
      t.forEach(x => { byDay[x.dow] = (byDay[x.dow] || 0) + x.n; const blk = Math.floor(x.hour / 3); byHour[blk] = (byHour[blk] || 0) + x.n; });
      const d = Object.entries(byDay).sort((a, c) => c[1] - a[1])[0], h = Object.entries(byHour).sort((a, c) => c[1] - a[1])[0];
      return `${DAYS[Number(d[0]) - 1]}, ${String(h[0] * 3).padStart(2, "0")}:00–${String(h[0] * 3 + 3).padStart(2, "0")}:00`;
    }

    // ---- insights ---------------------------------------------------------------------------------
    const heatCell = (v, max, label) => `<td style="--a:${max ? (0.06 + 0.5 * v / max).toFixed(2) : 0}" title="${esc(label)}">${v ? esc(String(v)) : ""}</td>`;
    function insightsHtml(){
      if (!st.ins && !st.insErr) { loadInsights(); return k.skel(6); }
      if (st.insErr) return `<div class="tm-mk">${keyLocked(st.insErr) ? locked() : needs250(st.insErr) ? v3note() || k.note("Insights need database update 250.", "warn") : k.note(esc(st.insErr), "warn")}${b("mk-ins-reload", "Try again", "fa-solid fa-rotate")}</div>`;
      const s = st.ins, j = s.journey || {};
      const tabs = [["journey", "Journey", "", "fa-solid fa-route"], ["cohorts", "Cohorts", "", "fa-solid fa-layer-group"], ["retention", "Retention", "", "fa-solid fa-arrows-rotate"],
        ["timing", "Best time", "", "fa-regular fa-clock"], ["templates", "Templates", "", "fa-regular fa-envelope"], ["reasons", "Unsubscribes", "", "fa-solid fa-ban"]];
      let body = "";
      if (st.itab === "journey") {
        const steps = [["found", "In your list"], ["contacted", "Contacted"], ["opened", "Opened the link"], ["replied", "Replied / met"], ["inquired", "Inquired on the website"], ["signed_up", "Created an account"], ["paying", "Paid plan"], ["active", "Active (30 days)"], ["clients", "Clients"]];
        const top = Math.max(1, j.found || 0);
        const funnel = steps.map(([key, label], i) => { const v = j[key] || 0; const prev = i ? (j[steps[i - 1][0]] || 0) : v;
          return `<li><span>${esc(label)}</span><i style="--w:${Math.max(2, Math.round(v * 100 / top))}%"></i><b>${num(v)}</b><em>${i ? pct(v, prev) : ""}</em></li>`; }).join("");
        const ch = s.channels || {};
        const chRow = (name, x, icon) => `<div class="tm-mk-tr is-ch"><span><b><i class="${icon}" aria-hidden="true"></i> ${esc(name)}</b></span><span>${num(x?.reached)}</span><span>${pct(x?.engaged, x?.reached)}</span><span>${pct(x?.interested, x?.reached)}</span></div>`;
        const pv = (s.pipeline_value || []).map(p => `${tile(`Open pipeline · ${p.currency}`, num(p.open))}${tile(`Won · ${p.currency}`, num(p.won), "ok")}`).join("");
        body = `${sec("Visitor-to-customer funnel", `<ul class="tm-mk-jfunnel">${funnel}</ul><p class="tm-mk-hint">Percentages compare each step with the step before. Accounts are matched to contacts by company email or phone.</p>`, "", "fa-solid fa-route")}
          <div class="tm-mk-tiles">${tile("Days to first contact", j.days_to_contact ?? "—", "", "median")}${tile("Days from contact to click", j.days_to_open ?? "—", "", "median")}${tile("Days to client", j.days_to_client ?? "—", "", "median")}${pv}</div>
          ${sec("Email vs WhatsApp", `<div class="tm-mk-table"><div class="tm-mk-tr is-head is-ch"><span>Channel</span><span>Reached</span><span>Engaged</span><span>Interested</span></div>${chRow("Email", ch.email, "fa-regular fa-envelope")}${chRow("WhatsApp", ch.whatsapp, "fa-brands fa-whatsapp")}</div>
            <p class="tm-mk-hint">Engaged: opened the link or replied. Interested: status Interested, Client or Done.</p>`, "", "fa-solid fa-scale-balanced")}
          ${(s.bcc || []).length ? sec("Bcc emails", `<div class="tm-mk-table">${s.bcc.map(x => `<div class="tm-mk-tr is-ch"><span><b>${esc(x.name)}</b><small>${esc(day(x.at))}</small></span><span>${num(x.sent)}</span><span>${num(x.clicks)} clicks</span><span>${pct(x.clicks, x.sent)}</span></div>`).join("")}</div>`, "", "fa-solid fa-user-secret") : ""}`;
      } else if (st.itab === "cohorts") {
        const rows = s.cohorts || [];
        const cols = [["contacted", "Contacted"], ["opened", "Opened"], ["replied", "Replied"], ["signed_up", "Account"], ["clients", "Client"]];
        body = sec("Monthly cohorts (by month added)", rows.length ? `<div class="tm-mk-scroll"><table class="tm-mk-heat"><thead><tr><th>Month</th><th>Added</th>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join("")}</tr></thead><tbody>
            ${rows.map(r => `<tr><th>${esc(r.month)}</th><td class="is-n">${num(r.size)}</td>${cols.map(([key, l]) => { const p = r.size ? Math.round(r[key] * 100 / r.size) : 0; return heatCell(p ? p + "%" : "", 100, `${l}: ${r[key]} of ${r.size}`).replace(/--a:[0-9.]+/, `--a:${(0.06 + 0.5 * p / 100).toFixed(2)}`); }).join("")}</tr>`).join("")}
          </tbody></table></div><p class="tm-mk-hint">Each row is the group of contacts added that month and how far they have come since. Compare months to see if your sources and messages are improving.</p>` : `<p class="tm-mk-muted">No data yet.</p>`, "", "fa-solid fa-layer-group");
      } else if (st.itab === "retention") {
        const rows = s.retention || [];
        body = sec("Retention of accounts from marketing", rows.length ? `<div class="tm-mk-scroll"><table class="tm-mk-heat"><thead><tr><th>Signed up</th><th>Accounts</th>${[0, 1, 2, 3, 4, 5].map(m => `<th>M${m}</th>`).join("")}</tr></thead><tbody>
            ${rows.map(r => `<tr><th>${esc(r.month)}</th><td class="is-n">${num(r.size)}</td>${[0, 1, 2, 3, 4, 5].map(m => { const v = (r.active || [])[m]; if (v == null) return "<td></td>"; const p = r.size ? Math.round(v * 100 / r.size) : 0; return `<td style="--a:${(0.06 + 0.5 * p / 100).toFixed(2)}" title="${v} of ${r.size} active in month ${m}">${p}%</td>`; }).join("")}</tr>`).join("")}
          </tbody></table></div><p class="tm-mk-hint">M0 is the month the account was created; M1 the next month, and so on. A cell shows the share of those accounts that used Triplem VIP that month.</p>`
          : `<p class="tm-mk-muted">No accounts matched to your contacts yet. When a contact signs up with the same company email or phone, they appear here.</p>`, "", "fa-solid fa-arrows-rotate");
      } else if (st.itab === "timing") {
        const t = s.timing || []; const grid = {}; let max = 0;
        t.forEach(x => { const key = `${x.dow}-${Math.floor(x.hour / 3)}`; grid[key] = (grid[key] || 0) + x.n; max = Math.max(max, grid[key]); });
        body = sec("When people open your links and reply", t.length ? `<div class="tm-mk-scroll"><table class="tm-mk-heat is-time"><thead><tr><th></th>${[0, 1, 2, 3, 4, 5, 6, 7].map(h => `<th>${String(h * 3).padStart(2, "0")}</th>`).join("")}</tr></thead><tbody>
            ${DAYS.map((d, i) => `<tr><th>${d}</th>${[0, 1, 2, 3, 4, 5, 6, 7].map(h => heatCell(grid[`${i + 1}-${h}`] || 0, max, `${d} ${String(h * 3).padStart(2, "0")}:00–${String(h * 3 + 3).padStart(2, "0")}:00: ${grid[`${i + 1}-${h}`] || 0}`)).join("")}</tr>`).join("")}
          </tbody></table></div><p class="tm-mk-hint">Dubai time, last 180 days. Best slot: <b>${esc(bestTime())}</b>. Send campaigns shortly before it.</p>` : `<p class="tm-mk-muted">No link openings yet.</p>`, "", "fa-regular fa-clock");
      } else if (st.itab === "templates") {
        const rows = (s.templates || []).filter(x => x.sent || x.opened);
        body = sec("Template results", rows.length ? `<div class="tm-mk-table"><div class="tm-mk-tr is-head"><span>Template</span><span>Sent</span><span>Opened</span><span>Rate</span><span>Unsub.</span></div>
            ${rows.map(x => `<div class="tm-mk-tr"><span><b>${esc(tplName(x.template))}</b></span><span>${num(x.sent)}</span><span>${num(x.opened)}</span><span>${pct(x.opened, x.sent)}</span><span>${num(x.unsubscribed)}</span></div>`).join("")}</div>
            <p class="tm-mk-hint">Use the A/B test in Campaigns to compare two templates on the same audience.</p>` : `<p class="tm-mk-muted">No emails yet.</p>`, "", "fa-regular fa-envelope");
      } else {
        const rows = s.reasons || []; const max = Math.max(1, ...rows.map(r => r.count));
        body = sec("Why people unsubscribed", rows.length ? `<ul class="tm-mk-funnel is-reasons">${rows.map(r => `<li><span>${esc(REASONS[r.reason] || r.reason)}</span><i style="--w:${Math.round(r.count * 100 / max)}%"></i><b>${num(r.count)}</b></li>`).join("")}</ul>
          <p class="tm-mk-hint">The unsubscribe page asks for an optional reason. “Too many emails” means space your follow-ups out; “Not relevant” means choose a closer template or audience.</p>` : `<p class="tm-mk-muted">Nobody has unsubscribed.</p>`, "", "fa-solid fa-ban");
      }
      return `<div class="tm-mk">${subtabs("mk-itab", st.itab, tabs)}${body}<div class="tm-mk-foot">${b("mk-ins-reload", "Refresh", "fa-solid fa-rotate")}</div></div>`;
    }

    function finderHtml(){
      const f = st.finder;
      const res = f.results;
      const selectable = res ? res.filter(r => !r.in_list) : [];
      const waNum = r => r.whatsapp || (/^\s*(\+|00)/.test(String(r.phone || "")) ? String(r.phone).replace(/[^0-9]/g, "").replace(/^00/, "") : "");
      const results = !res ? "" : !res.length ? `<p class="tm-mk-muted">No new businesses of this type were found there${f.skipped ? ` (${num(f.skipped)} found before were skipped)` : ""}. Try a wider area, another city or type.</p>`
        : `<div class="tm-mk-res-head"><b>${esc(String(res.length))} found</b> <small>in ${esc(f.place)}${f.partial ? " · central area only (the wider search was too slow)" : ""}${f.skipped ? ` · ${num(f.skipped)} skipped (already found or filtered)` : ""}</small>
            <span>${b("mk-f-all", f.selected.size === selectable.length && selectable.length ? "Clear" : "Select all", "fa-regular fa-square-check")}${b("mk-f-add", f.busy === "add" ? "Adding…" : `Add ${f.selected.size}`, "fa-solid fa-user-plus", { primary: true, disabled: !f.selected.size || !!f.busy })}</span></div>
          ${f.scanning ? `<p class="tm-mk-scan"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Reading ${num(f.scanning)} website${f.scanning === 1 ? "" : "s"} for email and WhatsApp…</p>` : ""}
          <ul class="tm-mk-res">${res.map((r, i) => `
            <li class="${r.in_list ? "is-in" : ""}"><label>
              <input type="checkbox" data-mk-pick="${i}"${f.selected.has(i) ? " checked" : ""}${r.in_list ? " disabled" : ""}>
              <span class="tm-mk-main"><b>${esc(r.name)}</b><small>${esc([r.address, r.city].filter(Boolean).join(", ") || r.category)}</small>
                <span class="tm-mk-tags2">${r.email ? `<span><i class="fa-regular fa-envelope"></i> ${esc(r.email)}</span>` : ""}${waNum(r) ? `<span><i class="fa-brands fa-whatsapp"></i> +${esc(waNum(r))}</span>` : ""}${r.phone && !waNum(r) ? `<span><i class="fa-solid fa-phone"></i> ${esc(r.phone)}</span>` : ""}${r.website ? `<span><i class="fa-solid fa-globe"></i> ${esc(r.website.replace(/^https?:\/\//, ""))}</span>` : ""}${r.scanning ? `<span class="is-scan"><i class="fa-solid fa-spinner fa-spin"></i> website</span>` : ""}</span></span>
              <span class="tm-mk-meta">${r.in_list ? pill("In list", "muted") : ""}${r.unsubscribed ? pill("Unsubscribed", "bad", "fa-solid fa-ban") : ""}${!r.email && !r.whatsapp && !r.phone && !r.scanning ? pill("No contact", "muted") : ""}${r.osm_url ? `<a class="tm-mk-ib is-ghost" href="${esc(r.osm_url)}" target="_blank" rel="noopener noreferrer" title="Open on the map" aria-label="Open on the map"><i class="fa-solid fa-map-location-dot"></i></a>` : ""}</span>
            </label></li>`).join("")}</ul>
          <p class="tm-mk-hint">${esc(f.attribution || "")} Check each business before contacting it.</p>`;
      return `<div class="tm-mk">
        <form class="tm-mk-form" data-dp-form data-mk-form="finder">
          <div class="tm-mk-grid is-3">
            ${field("Business type", sel("f.category", f.category, CATEGORIES.map(c => [c[0], c[1]])))}
            ${field("City", inp("f.city", f.city, { max: 80, extra: " required" }))}
            ${field("Country", inp("f.country", f.country, { max: 80, extra: ' list="tmMkCountries"' }))}
            ${field("Name contains", inp("f.keyword", f.keyword, { max: 60, ph: "optional" }))}
            ${field("Area", sel("f.area", f.area, [["centre", "City centre (fastest)"], ["", "Whole city"], ["wide", "City and surroundings"]]))}
            ${field("Must have", sel("f.must", f.must, [["", "Anything"], ["any", "Any contact detail"], ["phone", "Phone or WhatsApp"], ["website", "A website"], ["email", "Email (or a website to read)"]]))}
            ${field("Results", sel("f.limit", f.limit, [["20", "Up to 20"], ["40", "Up to 40"], ["60", "Up to 60"], ["100", "Up to 100"]]))}
            <div class="tm-mk-field is-end is-span2">${b("mk-f-search", f.busy === "search" ? "Searching…" : "Search", "fa-solid fa-magnifying-glass", { primary: true, disabled: !!f.busy })}</div>
          </div>
          <datalist id="tmMkCountries">${COUNTRIES.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
          <div class="tm-mk-checks">
            <label class="tm-mk-check"><input type="checkbox" data-mk="f.skip"${f.skip ? " checked" : ""}> Skip businesses already in my list or found in earlier searches</label>
            <label class="tm-mk-check"><input type="checkbox" data-mk="f.scan"${f.scan ? " checked" : ""}> Find email and WhatsApp on their websites <em>(in the background)</em></label>
          </div>
        </form>
        ${f.err ? k.note(esc(f.err), "warn", "fa-solid fa-triangle-exclamation") : ""}
        ${f.busy === "search" ? `<p class="tm-mk-scan"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${esc(f.stage || "Searching the business map…")} <b>${Math.max(0, Math.round((Date.now() - (f.started || Date.now())) / 1000))} s</b></p>` + k.skel(4) : results}
        <p class="tm-mk-hint">Searches OpenStreetMap, starting with the centre and widening until there are enough results. With “Skip” on, repeating a search in the same place shows only businesses you have not seen yet. Nothing is added until you press Add.</p>
      </div>`;
    }

    function templatesHtml(){
      const tpl = T(); if (!tpl) return k.note("Templates are not loaded.", "warn");
      if (st.my === null) loadMyTemplates();
      const tabs = [["email", "Email", tpl.list().length, "fa-regular fa-envelope"], ["wa", "WhatsApp", tpl.waList().length, "fa-brands fa-whatsapp"], ["my", "My templates", (st.my || []).length, "fa-solid fa-pen-nib"]];
      const sample = { name: "Gulf Example Trading LLC", contact_person: "Ahmed Khan", kind: "company" };
      const settings = st.settings || {};
      let body = "";
      if (st.ttab === "email") {
        const ov = (settings.template_overrides || {})[st.tpl] || {};
        if (!st.tplEdit || st.tplEdit.id !== st.tpl) st.tplEdit = { id: st.tpl, subject: ov.subject || "", headline: ov.headline || "", intro: ov.intro || "", closing: ov.closing || "", cta: ov.cta || "" };
        const def = tpl.defaults(st.tpl);
        const info = tpl.byId(st.tpl);
        const draft = { ...settings, template_overrides: { ...(settings.template_overrides || {}), [st.tpl]: st.tplEdit } };
        const mail = tpl.buildEmail({ template: st.tpl, contact: sample, settings: draft, token: "preview", logoSrc: new URL("Assets/logo/email-logo.png", document.baseURI).href });
        st.tplHtml = mail.html;
        const e = st.tplEdit;
        const isMine = info.group === "My templates";
        body = `${sec("Choose a template", `${field("Template", emailTplSel("tpl", st.tpl))}
            <p class="tm-mk-hint">${esc(info.group)} · ${info.layout === "features" ? "feature list layout" : "letter layout"}${info.lang === "ar" ? " · Arabic (right-to-left)" : ""}${(settings.template_overrides || {})[st.tpl] ? " · <b>customised</b>" : ""}</p>`, "", "fa-solid fa-list")}
          ${isMine ? k.note("This is one of your own templates. Edit it under “My templates”.", "info") : sec("Your wording", `<p class="tm-mk-hint">Leave a field empty to use the standard text. <b>{company}</b> and <b>{name}</b> are filled in for each contact.</p>
            ${field("Subject", inp("te.subject", e.subject, { max: 180, ph: def.subject }))}
            ${def.headline || info.layout === "features" ? field("Headline", inp("te.headline", e.headline, { max: 160, ph: def.headline })) : ""}
            ${field("Introduction", `<textarea class="tm-mk-in" data-mk="te.intro" rows="3" maxlength="1200" placeholder="${esc(def.intro)}" dir="auto">${esc(e.intro)}</textarea>`)}
            ${field("Closing line", `<textarea class="tm-mk-in" data-mk="te.closing" rows="2" maxlength="600" placeholder="${esc(def.closing)}" dir="auto">${esc(e.closing)}</textarea>`)}
            ${field("Button text", inp("te.cta", e.cta, { max: 60, ph: def.cta || "No button" }))}
            <div class="tm-mk-foot">${b("mk-te-reset", "Use standard text", "fa-solid fa-rotate-left")}${b("mk-te-preview", "Update preview", "fa-regular fa-eye")}${b("mk-te-save", st.settingsBusy ? "Saving…" : "Save wording", "fa-solid fa-check", { primary: true, disabled: st.settingsBusy })}</div>`, "", "fa-solid fa-pen")}
          ${sec("Preview", `<p class="tm-mk-subject">${esc(mail.subject)}</p><div class="tm-mk-frame" data-mk-mail="tpl" role="document" aria-label="Email preview"></div>`, "", "fa-regular fa-eye")}`;
      } else if (st.ttab === "wa") {
        const text = tpl.buildWhatsApp({ template: st.waPreview, contact: sample, settings });
        body = `${sec("Choose a WhatsApp template", field("Template", waTplSel("waPreview", st.waPreview)), "", "fa-solid fa-list")}
          ${sec("Message", `<div class="tm-mk-phone"><pre class="tm-mk-wa" dir="auto">${esc(text)}</pre></div><div class="tm-mk-foot">${b("mk-wa-copy-tpl", "Copy", "fa-regular fa-copy")}</div>`, "", "fa-brands fa-whatsapp")}
          <p class="tm-mk-hint">Every message ends with how to stop messages (STOP). Create your own under “My templates”.</p>`;
      } else {
        const m = st.myEdit;
        const list = (st.my || []).map(x => `<li><button type="button" class="tm-mk-mini" data-dp-act="mk-my-edit" data-id="${esc(x.id)}"><b><i class="${x.channel === "email" ? "fa-regular fa-envelope" : "fa-brands fa-whatsapp"}" aria-hidden="true"></i> ${esc(x.name)}</b><small>${x.channel === "email" ? "Email" : "WhatsApp"}${x.lang === "ar" ? " · Arabic" : ""} · ${esc(day(x.updated_at))}</small></button></li>`).join("");
        const form = !m ? "" : sec(m.id ? "Edit template" : `New ${m.channel === "email" ? "email" : "WhatsApp"} template`, `<form class="tm-mk-form" data-dp-form data-mk-form="mytpl">
            <div class="tm-mk-grid">${field("Name", inp("my.name", m.name, { max: 80, ph: "For example: Dubai insurers December" }))}${field("Language", sel("my.lang", m.lang, [["en", "English"], ["ar", "Arabic (right-to-left)"]]))}</div>
            ${m.channel === "email" ? `${field("Subject", inp("my.subject", m.subject, { max: 180, ph: "{company}: …" }))}
              ${field("Headline", inp("my.headline", m.headline, { max: 160, ph: "optional" }))}
              ${field("Introduction", `<textarea class="tm-mk-in" data-mk="my.intro" rows="3" maxlength="2000" dir="auto">${esc(m.intro)}</textarea>`)}
              ${field("More paragraphs", `<textarea class="tm-mk-in" data-mk="my.body" rows="4" maxlength="4000" dir="auto" placeholder="Leave an empty line between paragraphs">${esc(m.body)}</textarea>`, "optional")}
              ${field("Closing line", `<textarea class="tm-mk-in" data-mk="my.closing" rows="2" maxlength="800" dir="auto">${esc(m.closing)}</textarea>`, "optional")}
              ${field("Button text", inp("my.cta", m.cta, { max: 60, ph: "For example: Start your free trial (empty = no button)" }))}`
              : field("Message", `<textarea class="tm-mk-in" data-mk="my.body" rows="6" maxlength="1500" dir="auto" placeholder="Hello {name}, …">${esc(m.body)}</textarea>`)}
            <p class="tm-mk-hint">Placeholders: <b>{company}</b>, <b>{name}</b>${m.channel === "whatsapp" ? ", <b>{sender}</b>, <b>{link}</b>" : ""}. Your signature and the unsubscribe ${m.channel === "email" ? "link" : "line (STOP)"} are added automatically.</p>
            <div class="tm-mk-foot">${m.id ? (st.confirmMyDel ? b("mk-my-del-yes", "Yes, delete", "fa-solid fa-trash", { danger: true }) : b("mk-my-del", "Delete", "fa-regular fa-trash-can", { danger: true })) : ""}${b("mk-my-cancel", "Cancel", "")}${b("mk-my-save", st.busy === "my" ? "Saving…" : "Save template", "fa-solid fa-check", { primary: true, disabled: !!st.busy })}</div>
          </form>`, "", "fa-solid fa-pen-nib");
        body = `${v3note()}${sec("My templates", `${list ? `<ul class="tm-mk-minis">${list}</ul>` : `<p class="tm-mk-muted">No templates of your own yet.</p>`}
            <div class="tm-mk-foot is-left">${b("mk-my-new", "New email template", "fa-regular fa-envelope", { data: 'data-v="email"' })}${b("mk-my-new", "New WhatsApp template", "fa-brands fa-whatsapp", { data: 'data-v="whatsapp"' })}</div>`, "", "fa-solid fa-folder-open")}${form}`;
      }
      return `<div class="tm-mk">${subtabs("mk-ttab", st.ttab, tabs)}${body}</div>`;
    }

    function settingsHtml(){
      if (!st.settings) { loadSettings(); return k.skel(5); }
      const s = st.settings;
      const f = (key, label, hint = "", max = 120) => field(label, inp(`s.${key}`, s[key] || "", { max }), hint);
      return `<div class="tm-mk">${sec("Email signature", `<form class="tm-mk-form" data-dp-form data-mk-form="settings"><div class="tm-mk-grid">
            ${f("sender_name", "Name")}${f("sender_title", "Title", "optional")}${f("email", "Reply email", "replies, Bcc emails and unsubscribe requests", 254)}
            ${f("phone", "Phone", "optional", 40)}${f("whatsapp", "WhatsApp number", "with country code", 20)}${f("website", "Website", "", 300)}</div>
            ${f("address", "Business address", "shown in the email footer, recommended", 300)}
            <div class="tm-mk-foot">${b("mk-s-save", st.settingsBusy ? "Saving…" : "Save signature", "fa-solid fa-check", { primary: true, disabled: st.settingsBusy })}</div></form>`, "", "fa-solid fa-signature")}
        ${sec("Outlook helper", `${st.helper === null ? `<p class="tm-mk-muted">Checking…</p>` : st.helper
            ? k.statusCard("Running on this PC", "“Open in Outlook” opens each email ready to send.", "ok")
            : k.statusCard("Not found on this PC", "Emails are downloaded as .eml files (or one ZIP for campaigns). Install the Outlook helper once to open them directly in Outlook.", "plain")}
            <div class="tm-mk-foot">${b("mk-helper", "Check again", "fa-solid fa-rotate")}</div>`, "", "fa-brands fa-microsoft")}
        ${sec("Good practice", `<ul class="tm-mk-tips">
            <li>Email only businesses whose address is public for business contact, and keep each message relevant to their type of business.</li>
            <li>Send personal emails in small batches (up to 50 a day from a normal mailbox) so they are not treated as spam.</li>
            <li>Use “One email · Bcc” for announcements and greetings; use personal emails for introductions and follow-ups.</li>
            <li>Space follow-ups 3 to 5 days apart and stop after the third one (the “last note” template).</li>
            <li>Never email an address marked Unsubscribed. The unsubscribe link and the blocked list handle this automatically.</li>
          </ul>`, "", "fa-solid fa-shield-halved")}</div>`;
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
        const cols = ["name", "kind", "contact_person", "category", "email", "email_status", "unsubscribe_reason", "whatsapp", "wa_number", "whatsapp_status", "phone", "website", "address", "city", "country", "status", "priority", "score", "tags", "next_follow_up", "deal_value", "deal_currency", "expected_close", "emails_drafted", "link_opens", "whatsapp_opened", "last_emailed_at", "notes", "created_at"];
        const lines = [cols.join(",")].concat(items.map(it => cols.map(cn => csvCell(cn === "tags" ? (it.tags || []).join("; ") : cn === "score" ? score(it) : it[cn])).join(",")));
        download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `Triplem VIP marketing contacts ${today()}.csv`);
        dp.toast(`${num(items.length)} contacts exported.`);
      });
    }

    dp.custom.open({
      icon: "admin",
      tabs: [["overview", "Overview", "fa-solid fa-chart-pie"], ["contacts", "Contacts", "fa-solid fa-address-book"], ["campaigns", "Campaigns", "fa-solid fa-paper-plane"],
        ["insights", "Insights", "fa-solid fa-chart-line"], ["find", "Find new", "fa-solid fa-wand-magic-sparkles"], ["templates", "Templates", "fa-regular fa-envelope"], ["settings", "Settings", "fa-solid fa-sliders"]],
      tab: opts.tab || "overview", state: st,
      head: () => {
        const c = st.counts || {};
        const onContact = st.view && st.detail && dp.custom.currentTab() === "contacts" && !st.formOpen;
        return { title: onContact ? st.detail.item.name : "Marketing", avatar: `<span class="tm-dp-txico tm-ap-ico" style="--t:#0e5a56"><i class="fa-solid fa-bullhorn"></i></span>`,
          sub: onContact ? esc([st.detail.item.category, st.detail.item.city].filter(Boolean).join(" · ") || "Contact") : "Main Admin · outreach",
          pills: onContact ? [] : [k.pill(`${c.all ?? 0} contacts`, ""), c.due ? k.pill(`${c.due} due`, "warn") : "", c.unsubscribed ? k.pill(`${c.unsubscribed} unsubscribed`, "bad") : ""].filter(Boolean) };
      },
      render(tab){
        if (tab === "overview") return overviewHtml();
        if (tab === "contacts") {
          if (st.formOpen) return formHtml();
          return st.view ? detailHtml() : listHtml();
        }
        if (tab === "campaigns") return campaignsHtml();
        if (tab === "insights") return insightsHtml();
        if (tab === "find") return finderHtml();
        if (tab === "templates") { if (!st.settings) loadSettings(); return templatesHtml(); }
        return settingsHtml();
      },
      after(tab, body){
        if (tab === "contacts" && !st.view && Date.now() - (st.searchAt || 0) < 4000) {
          const i = body.querySelector('[data-mk="search"]');
          if (i && document.activeElement !== i) { i.focus({ preventScroll: true }); const n = i.value.length; try { i.setSelectionRange(n, n); } catch (_) {} }
        }
        body.querySelector(".tm-mk-subtabs .is-on")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        body.querySelectorAll("[data-mk-mail]").forEach(host => mountPreview(host, host.dataset.mkMail === "tpl" ? st.tplHtml : host.dataset.mkMail === "camp" ? st.campPreviewHtml : st.previewHtml));
        if (!body.dataset.mkMenuBound) {
          body.dataset.mkMenuBound = "1";
          body.addEventListener("click", e => { if (st.menu && !e.target.closest(".tm-mk-menu-wrap")) { st.menu = null; R(); } });
        }
      },
      onInput(e){
        const f = e.target.closest?.("[data-mk]"); if (!f) return;
        const key = f.dataset.mk, val = f.type === "checkbox" ? f.checked : f.value;
        if (key === "search") {
          st.search = val; st.searchAt = Date.now(); clearTimeout(st.searchTimer);
          st.searchTimer = setTimeout(() => { st.searchAt = Date.now(); loadList(); }, 320);
          return;
        }
        const parts = key.split(".");
        if (parts[0] === "pp" && st.profile) { const p = st.profile.people[Number(parts[1])]; if (p) p[parts[2]] = val; return; }
        if (parts[0] === "pf" && st.profile) { st.profile[parts[1]] = val; return; }
        if (parts[0] === "ps" && st.profile) { st.profile.social[parts[1]] = val; return; }
        const [a, sub] = parts;
        if (sub) {
          const target = { f: st.finder, form: st.form, s: st.settings, camp: st.camp, bulk: st.bulk, act: st.act, te: st.tplEdit, task: st.task, my: st.myEdit }[a];
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
        const tk = e.target.closest?.("[data-mk-task]");
        if (tk) { taskDone(tk.dataset.mkTask, tk.checked); return; }
        const f = e.target.closest?.("[data-mk]"); if (!f) return;
        const key = f.dataset.mk, val = f.type === "checkbox" ? f.checked : f.value;
        if (key === "filter") { st.filter = val; loadList(); return; }
        if (key === "channel") { st.channel = val; R(); return; }
        if (key === "emailTpl") { st.emailTpl = val; R(); return; }
        if (key === "waTpl") { st.waTpl = val; st.waText = null; R(); return; }
        if (key === "tpl") { st.tpl = val; st.tplEdit = null; R(); return; }
        if (key === "waPreview") { st.waPreview = val; R(); return; }
        if (key === "bulk.status" && val) { bulk({ status: val }, `Status set to ${statusLabel(val)}`); st.bulk.status = ""; return; }
        if (key === "bulk.priority" && val) { bulk({ priority: val }, `Priority set to ${val}`); st.bulk.priority = ""; return; }
        const [a, sub] = key.split(".");
        if (a === "camp" && sub) { st.camp[sub] = val; st.campPreview = null; R(); return; }
        if (a === "f" && sub) st.finder[sub] = val;
        if (a === "act" && sub) st.act[sub] = val;
        if (a === "bulk" && sub) st.bulk[sub] = val;
        if (a === "form" && sub) st.form[sub] = val;
        if (a === "task" && sub) st.task[sub] = val;
        if (a === "my" && sub && st.myEdit) st.myEdit[sub] = val;
        if (a === "pf" && sub && st.profile) st.profile[sub] = val;
        if (key === "followDate") st.followDate = val;
      },
      onSubmit(form){
        if (form.dataset.mkForm === "finder") document.querySelector('[data-dp-act="mk-f-search"]')?.click();
      },
      actions: {
        "mk-reload": () => loadList(),
        "mk-stats": () => { st.stats = null; loadStats(); },
        "mk-unlock": () => { dp.close(); setTimeout(() => document.getElementById("adminSecurityKeyBtn")?.click() || document.getElementById("adminSecurityUnlockBtn")?.click(), 0); },
        "mk-go": btn => { const v = btn.dataset.v; if (v === "add") { dp.custom.tab("contacts"); st.view = null; st.form = blankForm(); st.formOpen = true; R({ keepScroll: false }); } else dp.custom.tab(v); },
        "mk-filter": btn => { st.filter = btn.dataset.v; st.view = null; st.formOpen = false; if (btn.dataset.go) dp.custom.tab(btn.dataset.go); loadList(); },
        "mk-layout": btn => { st.layout = btn.dataset.v; R(); },
        "mk-open": btn => { if (dp.custom.currentTab() !== "contacts") dp.custom.tab("contacts"); st.formOpen = false; loadDetail(btn.dataset.id); if (st.settings === null) loadSettings(); if (st.helper === null) checkHelper(); },
        "mk-toggle": btn => { const id = btn.dataset.id; if (st.picked.has(id)) st.picked.delete(id); else st.picked.add(id); R(); },
        "mk-select": () => { st.selecting = !st.selecting; st.layout = "list"; st.confirmBulkDelete = false; R(); },
        "mk-pick-all": () => { const shown = st.items.filter(x => !st.channel || (st.channel === "email" ? canEmail(x) : st.channel === "wa" ? waOf(x) && x.whatsapp_status === "ok" : score(x) >= 60)); st.picked = st.picked.size && st.picked.size === shown.length ? new Set() : new Set(shown.map(x => x.id)); R(); },
        "mk-back": () => { st.view = null; st.detail = null; st.previewHtml = null; st.menu = null; R({ keepScroll: false }); loadList(); },
        "mk-new": () => { st.form = blankForm(); st.formOpen = true; R({ keepScroll: false }); },
        "mk-import": () => document.querySelector('[data-mk-file="csv"]')?.click(),
        "mk-export": () => exportCsv(),
        "mk-copy": btn => copy(btn.dataset.text, btn.dataset.what || "Text"),
        "mk-menu": btn => { st.menu = st.menu === btn.dataset.v ? null : btn.dataset.v; R(); },
        "mk-ctab": btn => {
          st.menu = null; st.ctab = btn.dataset.v; st.confirmDelete = false;
          if (btn.dataset.tpl) { if (st.ctab === "wa") { st.waTpl = btn.dataset.tpl; st.waText = null; } else st.emailTpl = btn.dataset.tpl; }
          if (btn.dataset.kind) st.act.kind = btn.dataset.kind;
          R({ keepScroll: false });
        },
        "mk-call-log": () => { st.ctab = "activity"; st.act.kind = "call"; setTimeout(() => R({ keepScroll: false }), 300); },
        "mk-copy-card": () => { st.menu = null; const it = st.detail?.item; if (!it) return; copy([it.name, it.contact_person, it.email, waOf(it) ? "+" + waOf(it) : "", it.phone, it.website, [it.address, it.city, it.country].filter(Boolean).join(", ")].filter(Boolean).join("\n"), "Contact details"); R(); },
        "mk-ev-filter": btn => { st.evFilter = btn.dataset.v; R(); },
        "mk-move": btn => act("move", async () => {
          const it = st.items.find(x => x.id === btn.dataset.id); if (!it) return;
          const i = STATUSES.findIndex(s => s[0] === it.status) + Number(btn.dataset.dir);
          if (i < 0 || i >= STATUSES.length) return;
          const d = await supabaseRpc("app_marketing_set_status", { p_id: it.id, p_status: STATUSES[i][0] }); patchItem(d.item);
        }),
        "mk-status": btn => act("status", async () => { const d = await supabaseRpc("app_marketing_set_status", { p_id: st.detail.item.id, p_status: btn.dataset.v }); patchItem(d.item); await refreshDetail(); }),
        "mk-priority": btn => act("priority", async () => { await supabaseRpc("app_marketing_bulk", { p_ids: [st.detail.item.id], p_patch: { priority: btn.dataset.v } }); await refreshDetail(); }),
        "mk-follow": () => act("follow", async () => { await supabaseRpc("app_marketing_bulk", { p_ids: [st.detail.item.id], p_patch: { next_follow_up: st.followDate ?? st.detail.item.next_follow_up ?? "" } }); await refreshDetail(); dp.toast("Follow-up saved"); }),
        "mk-follow-q": btn => act("follow", async () => { await supabaseRpc("app_marketing_bulk", { p_ids: [st.detail.item.id], p_patch: { next_follow_up: addDays(Number(btn.dataset.days)) } }); st.followDate = undefined; await refreshDetail(); dp.toast(`Follow-up on ${day(addDays(Number(btn.dataset.days)))}`); }),
        "mk-follow-clear": () => act("follow", async () => { await supabaseRpc("app_marketing_bulk", { p_ids: [st.detail.item.id], p_patch: { next_follow_up: "" } }); st.followDate = undefined; await refreshDetail(); }),
        "mk-tag-add": () => act("tag", async () => { const t = String(st.tagInput || "").trim(); if (!t) return; await supabaseRpc("app_marketing_bulk", { p_ids: [st.detail.item.id], p_patch: { add_tags: t.split(/[,;]/) } }); st.tagInput = ""; await refreshDetail(); }),
        "mk-tag-rm": btn => act("tag", async () => { await supabaseRpc("app_marketing_bulk", { p_ids: [st.detail.item.id], p_patch: { remove_tags: [btn.dataset.v] } }); await refreshDetail(); }),
        "mk-act-kind": btn => { st.act.kind = btn.dataset.v; R(); },
        "mk-act-save": () => act("log", async () => {
          const d = await supabaseRpc("app_marketing_log_activity", { p_id: st.detail.item.id, p_kind: st.act.kind, p_text: st.act.text || "", p_follow_up: st.act.follow || null });
          patchItem(d.item); st.act = { kind: st.act.kind, text: "", follow: "" }; await refreshDetail(); dp.toast("Saved to the activity");
        }),
        "mk-outlook": () => email("outlook"),
        "mk-eml": () => email("eml"),
        "mk-preview-toggle": () => { st.showPreview = !st.showPreview; R(); },
        "mk-unsub": () => { st.menu = null; act("unsub", async () => { const d = await supabaseRpc("app_marketing_set_email_status", { p_id: st.detail.item.id, p_status: "unsubscribed", p_note: null }); patchItem(d.item); await refreshDetail(); dp.toast("Marked Unsubscribed. No more emails to this address."); }); },
        "mk-bounce": () => { st.menu = null; act("bounce", async () => { const d = await supabaseRpc("app_marketing_set_email_status", { p_id: st.detail.item.id, p_status: "bounced", p_note: null }); patchItem(d.item); await refreshDetail(); }); },
        "mk-resub": () => act("resub", async () => { const d = await supabaseRpc("app_marketing_set_email_status", { p_id: st.detail.item.id, p_status: "subscribed", p_note: st.reason || null }); st.reason = ""; patchItem(d.item); await refreshDetail(); dp.toast("Emails allowed again."); }),
        "mk-resub-bounce": () => act("resub", async () => { const d = await supabaseRpc("app_marketing_set_email_status", { p_id: st.detail.item.id, p_status: "subscribed", p_note: "Address checked after bounce" }); patchItem(d.item); await refreshDetail(); }),
        "mk-wa": () => whatsapp(st.detail?.item, st.waTpl, null, async () => { await refreshDetail(); }, st.waText),
        "mk-wa-copy": async () => { const it = st.detail?.item; if (!it) return; await copy(st.waText ?? T().buildWhatsApp({ template: st.waTpl, contact: it, settings: st.settings || {} }), "Message"); },
        "mk-wa-reset": () => { st.waText = null; R(); },
        "mk-wa-copy-tpl": () => copy(T().buildWhatsApp({ template: st.waPreview, contact: { name: "Gulf Example Trading LLC", contact_person: "Ahmed Khan" }, settings: st.settings || {} }), "Message"),
        "mk-wa-off": () => { st.menu = null; act("waoff", async () => { const d = await supabaseRpc("app_marketing_set_whatsapp_status", { p_id: st.detail.item.id, p_status: "opted_out" }); patchItem(d.item); await refreshDetail(); }); },
        "mk-wa-on": () => act("waon", async () => { const d = await supabaseRpc("app_marketing_set_whatsapp_status", { p_id: st.detail.item.id, p_status: "ok" }); patchItem(d.item); await refreshDetail(); }),
        "mk-edit": () => { st.menu = null; const it = st.detail.item; st.form = { ...blankForm(), ...Object.fromEntries(Object.keys(blankForm()).map(key => [key, it[key] ?? ""])), id: it.id, whatsapp: it.whatsapp ? "+" + it.whatsapp : "", tags: (it.tags || []).join(", "), next_follow_up: it.next_follow_up || "" }; st.formOpen = true; R({ keepScroll: false }); },
        "mk-del": () => { st.menu = null; st.confirmDelete = true; R(); },
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
        // tasks
        "mk-task-add": () => addTask(st.task.title, st.task.due),
        "mk-task-quick": btn => addTask(btn.dataset.t, addDays(Number(btn.dataset.d))),
        "mk-task-del": btn => act("task", async () => { await supabaseRpc("app_marketing_task_delete", { p_id: btn.dataset.id }); await afterTask(); }),
        // profile
        "mk-pf-lang": btn => { st.profile.lang = btn.dataset.v; R(); },
        "mk-person-add": () => { st.profile.people.push({ name: "", role: "", email: "", phone: "" }); R(); },
        "mk-person-rm": btn => { st.profile.people.splice(Number(btn.dataset.i), 1); R(); },
        "mk-pf-cancel": () => { st.profile = null; R(); },
        "mk-pf-save": () => act("profile", async () => {
          const p = st.profile;
          const d = await supabaseRpc("app_marketing_profile_save", { p_id: st.detail.item.id, p_data: { deal_value: p.deal_value === "" ? "" : String(p.deal_value), deal_currency: p.deal_currency,
            expected_close: p.expected_close || "", lang: p.lang, lost_reason: p.lost_reason, people: p.people.filter(x => String(x.name || "").trim()), social: p.social } });
          patchItem(d.item); st.profile = null; await refreshDetail();
          st.emailTpl = suggestEmail(st.detail.item); st.waTpl = suggestWa(st.detail.item); st.waText = null;
          dp.toast("Profile saved");
        }),
        // bulk
        "mk-bulk-email": () => { Object.assign(st.camp, { audience: "selected", channel: "email", mode: st.camp.mode === "bcc" ? "outlook" : st.camp.mode, run: null }); dp.custom.tab("campaigns"); },
        "mk-bulk-bcc": () => { Object.assign(st.camp, { audience: "selected", channel: "email", mode: "bcc", abTemplate: "", onlyNew: false, run: null }); dp.custom.tab("campaigns"); },
        "mk-bulk-wa": () => { Object.assign(st.camp, { audience: "selected", channel: "whatsapp", run: null }); dp.custom.tab("campaigns"); },
        "mk-bulk-tag": () => { const t = String(st.bulk.tag || "").trim(); if (!t) { dp.toast("Type a tag first.", false); return; } bulk({ add_tags: t.split(/[,;]/) }, `Tag #${t} added`); st.bulk.tag = ""; },
        "mk-bulk-follow": () => { if (!st.bulk.follow) { dp.toast("Choose a date first.", false); return; } bulk({ next_follow_up: st.bulk.follow }, `Follow-up set to ${day(st.bulk.follow)}`); },
        "mk-bulk-del": () => { st.confirmBulkDelete = true; R(); },
        "mk-bulk-del-no": () => { st.confirmBulkDelete = false; R(); },
        "mk-bulk-del-yes": () => { st.confirmBulkDelete = false; bulk({ delete: true }, "Deleted"); },
        // campaigns
        "mk-camp-mode": btn => { st.camp.mode = btn.dataset.v; if (btn.dataset.v === "bcc") st.camp.abTemplate = ""; st.campPreview = null; R(); },
        "mk-camp-preview": () => {
          const c = st.camp; const first = audience().ok[0] || { name: "Gulf Example Trading LLC", contact_person: "Ahmed Khan" };
          if (c.channel === "email") {
            const m = T().buildEmail({ template: c.template, contact: c.mode === "bcc" ? null : first, settings: st.settings || {}, token: "preview", bcc: c.mode === "bcc", logoSrc: new URL("Assets/logo/email-logo.png", document.baseURI).href });
            st.campPreview = "1"; st.campPreviewHtml = m.html; st.campPreviewSubject = m.subject;
          } else st.campPreview = T().buildWhatsApp({ template: c.waTemplate, contact: first, settings: st.settings || {} });
          R();
        },
        "mk-camp-start": () => act("camp", async () => { st.campPreview = null; if (st.camp.channel === "email") await runEmailCampaign(); else await startWhatsAppCampaign(); }),
        "mk-camp-wa-open": () => {
          const r = st.camp.run; const cur = st.items.find(x => x.id === r.queue[r.pos]); if (!cur) return;
          whatsapp(cur, st.camp.waTemplate, r.id, async () => { r.sent++; r.sentIds.push(cur.id); r.pos++; if (r.pos >= r.queue.length) await finishWhatsApp(); });
        },
        "mk-camp-wa-skip": () => { const r = st.camp.run; r.skipped++; r.pos++; if (r.pos >= r.queue.length) finishWhatsApp(); else R(); },
        "mk-camp-wa-stop": () => finishWhatsApp(),
        "mk-camp-close": () => { st.camp.run = null; st.picked = new Set(); st.selecting = false; st.stats = null; st.ins = null; loadCampaigns(); loadList(); },
        "mk-camp-refresh": () => { st.camp.list = null; R(); },
        // insights
        "mk-itab": btn => { st.itab = btn.dataset.v; R({ keepScroll: false }); },
        "mk-ins-reload": () => { st.ins = null; st.insErr = ""; R(); },
        // find new
        "mk-f-search": async () => {
          const f = st.finder; if (f.busy) return;
          if (!String(f.city || "").trim()) { dp.toast("Enter a city.", false); return; }
          f.busy = "search"; f.err = ""; f.results = null; f.selected = new Set(); f.started = Date.now(); f.stage = ""; f.partial = false; f.scanning = 0; f.skipped = 0; f.searchId = (f.searchId || 0) + 1;
          const myId = f.searchId;
          R();
          const tick = setInterval(() => { if (f.busy === "search") R(); }, 1000);
          let d = null;
          const extra = { skip_known: !!f.skip, must: f.must || "", area: f.area || "" };
          try {
            const body = { action: "search", category: f.category, city: f.city, country: f.country, keyword: f.keyword, limit: Number(f.limit), scan_websites: false, scan_async: true, ...extra };
            try { d = await finderCall(body); }
            catch (e) {
              if (!/^(geocode_unreachable|osm_unreachable)$/.test(e.code || "")) throw e;
              d = await browserSearch(f, msg => { f.stage = msg; R(); }, extra);
            }
            f.results = d.items || []; f.place = d.place || f.city; f.attribution = d.attribution || ""; f.template = d.template || "overview"; f.partial = !!d.partial; f.skipped = Number(d.skipped || 0);
            f.results.forEach((r, i) => { if (!r.in_list && !r.unsubscribed && (r.email || r.whatsapp || /^\s*(\+|00)/.test(String(r.phone || "")))) f.selected.add(i); });
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
        "mk-ttab": btn => { st.ttab = btn.dataset.v; R({ keepScroll: false }); },
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
        "mk-my-new": btn => { st.myEdit = { id: null, channel: btn.dataset.v, name: "", lang: "en", subject: "", headline: "", intro: "", body: "", closing: "", cta: btn.dataset.v === "email" ? "Start your free 14-day trial" : "" }; st.confirmMyDel = false; R(); },
        "mk-my-edit": btn => { const x = (st.my || []).find(y => y.id === btn.dataset.id); if (!x) return; st.myEdit = { ...x, subject: x.subject || "", headline: x.headline || "", intro: x.intro || "", body: x.body || "", closing: x.closing || "", cta: x.cta || "" }; st.confirmMyDel = false; R(); },
        "mk-my-cancel": () => { st.myEdit = null; R(); },
        "mk-my-save": () => act("my", async () => {
          const m = st.myEdit;
          await supabaseRpc("app_marketing_template_save", { p_id: m.id || null, p_data: m });
          st.myEdit = null; await loadMyTemplates(); dp.toast("Template saved. It is in the template lists under “My templates”.");
        }),
        "mk-my-del": () => { st.confirmMyDel = true; R(); },
        "mk-my-del-yes": () => act("my", async () => { await supabaseRpc("app_marketing_template_delete", { p_id: st.myEdit.id }); st.myEdit = null; st.confirmMyDel = false; await loadMyTemplates(); dp.toast("Template deleted"); }),
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
    async function afterTask(){
      if (st.view && st.detail) await refreshDetail();
      try { st.tasks = (await supabaseRpc("app_marketing_tasks", { p_scope: "open" }))?.items || []; } catch (_) {}
    }
    function addTask(title, due){
      const t = String(title || "").trim();
      if (!t) { dp.toast("Write the task first.", false); return; }
      act("task", async () => {
        await supabaseRpc("app_marketing_task_save", { p_id: null, p_contact: st.view && st.detail && dp.custom.currentTab() === "contacts" ? st.detail.item.id : null, p_title: t, p_due: due || null });
        st.task = { title: "", due: "" }; await afterTask(); dp.toast("Task added");
      });
    }
    function taskDone(id, done){ act("task", async () => { await supabaseRpc("app_marketing_task_done", { p_id: id, p_done: done }); await afterTask(); }); }
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
              if (!r.in_list && !r.unsubscribed && (r.email || r.whatsapp) && i >= 0) f.selected.add(i);
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
    loadMyTemplates();
    checkHelper();
    supabaseRpc("app_marketing_insights", {}).then(d => { st.ins = d; }).catch(() => {});
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
