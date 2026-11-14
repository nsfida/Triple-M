/* Triplem VIP · Detail panels (2026-11-14)
 *
 * Loans, Installments, Assets, Depreciation and Notes open their records in the same panel as
 * Admin → user: the same size, header (section icon, title, status pills), tabs, small section
 * labels, cards, lists and buttons. They replace the old floating "details" dialogs, which each
 * had their own size and layout.
 *
 * The panels only read the records the app already has in memory and call the app's existing
 * functions for every change (record a payment, edit, delete, PDF, rename, ...). Saving code is
 * unchanged. When the data changes the open panel redraws itself; when its record is gone (for
 * example after Delete) it closes.
 *
 * Visual frame: the .aum-* styles in 69-admin-user-manager.css.
 */
(function initTriplemDetailPanels(global){
  "use strict";

  // ── tiny helpers ──────────────────────────────────────────────────────────────────────
  const esc = v => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const m = (n, cur) => { try { return money(num(n), cur); } catch (_) { return esc(`${cur || ""} ${num(n).toFixed(2)}`); } };
  const plain = (n, cur) => { try { return `${cur ? cur + " " : ""}${num(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; } catch (_) { return `${cur} ${num(n).toFixed(2)}`; } };
  const dd = v => { if (!v) return "—"; try { return displayDate(String(v).slice(0, 10)); } catch (_) { return String(v).slice(0, 10); } };
  const stamp = v => { try { return dateStamp(v); } catch (_) { const t = Date.parse(v); return Number.isFinite(t) ? t : 0; } };
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const daysBetween = (a, b) => Math.round((b - a) / 86400000);
  const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0);
  const canEdit = () => { try { return typeof teamCanShowEdit !== "function" || teamCanShowEdit("entries"); } catch (_) { return true; } };
  const canDelete = () => { try { return typeof teamCanShowDelete !== "function" || teamCanShowDelete("entries"); } catch (_) { return true; } };
  const company = () => { try { const c = getPdfCompanyContact(); if (c?.isCompany && c.name) return c.name; } catch (_) {} return ""; };
  const pill = (t, tone = "", icon = "") => `<span class="aum-pill${tone ? " is-" + tone : ""}">${icon ? `<i class="${icon}" aria-hidden="true"></i>` : ""}${esc(t)}</span>`;
  const section = (title, body, attrs = "") => `<section class="aum-section"${attrs}><h3>${esc(title)}</h3>${body}</section>`;
  const kv = rows => `<dl class="aum-kv">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  const btn = (act, label, icon, { primary = false, danger = false, data = "", disabled = false } = {}) =>
    `<button type="button" class="aum-btn${primary ? " is-primary" : ""}${danger ? " is-danger" : ""}" data-dp-act="${act}"${data ? " " + data : ""}${disabled ? " disabled" : ""}>${icon ? `<i class="${icon}" aria-hidden="true"></i> ` : ""}${esc(label)}</button>`;
  const iconBtn = (act, title, icon, data = "", danger = false) =>
    `<button type="button" class="tm-dp-icon-btn${danger ? " is-danger" : ""}" data-dp-act="${act}" ${data} title="${esc(title)}" aria-label="${esc(title)}"><i class="${icon}" aria-hidden="true"></i></button>`;
  const note = (html, tone = "info", icon = "fa-solid fa-circle-info") => `<div class="aum-note is-${tone}"><i class="${icon}" aria-hidden="true"></i><div>${html}</div></div>`;
  const statusCard = (title, sub, tone) => `<div class="aum-status is-${tone || "plain"}"><b>${title}</b><span>${sub}</span></div>`;
  const progress = (p, label) => `<div class="tm-dp-progress" role="img" aria-label="${esc(label)}"><span style="--p:${p}%"></span><small>${esc(label)}</small></div>`;
  const stats = items => `<div class="aum-stats">${items.map(([v, t]) => `<div><b>${v}</b><small>${esc(t)}</small></div>`).join("")}</div>`;
  const empty = t => `<p class="aum-muted">${esc(t)}</p>`;
  const monthKey = d => { const s = String(d || "").slice(0, 7); return /^\d{4}-\d{2}$/.test(s) ? s : ""; };
  const monthLabel = k => { try { return new Date(`${k}-15T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" }); } catch (_) { return k; } };
  const lastMonths = n => { const out = []; const d = new Date(); d.setDate(15); for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 15); out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`); } return out; };

  // ── charts: single series, theme colour, values on hover (SVG <title>) ─────────────────
  function barChart(points, cur, caption){
    const W = 540, H = 150, top = 16, base = 120;
    const max = Math.max(...points.map(p => p.value), 0);
    if (!(max > 0)) return `<p class="aum-muted">No ${esc(caption.toLowerCase())} yet.</p>`;
    const step = W / points.length, bw = Math.min(28, step * 0.56);
    const bars = points.map((p, i) => {
      const h = p.value > 0 ? Math.max(3, (p.value / max) * (base - top)) : 0;
      const x = i * step + (step - bw) / 2, y = base - h;
      const label = `${p.label}: ${plain(p.value, cur)}`;
      return `<g class="tm-dp-bar"><title>${esc(label)}</title>
        <rect class="tm-dp-hit" x="${(i * step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}"></rect>
        ${h ? `<path d="M${x.toFixed(1)},${base} V${(y + 4).toFixed(1)} Q${x.toFixed(1)},${y.toFixed(1)} ${(x + 4).toFixed(1)},${y.toFixed(1)} H${(x + bw - 4).toFixed(1)} Q${(x + bw).toFixed(1)},${y.toFixed(1)} ${(x + bw).toFixed(1)},${(y + 4).toFixed(1)} V${base} Z"></path>` : ""}
        <text x="${(i * step + step / 2).toFixed(1)}" y="${base + 16}" text-anchor="middle">${esc(p.short || p.label)}</text></g>`;
    }).join("");
    return `<figure class="tm-dp-chart"><figcaption>${esc(caption)} <span>highest ${esc(plain(max, cur))}</span></figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(caption)}"><line class="tm-dp-base" x1="0" x2="${W}" y1="${base}" y2="${base}"></line>${bars}</svg></figure>`;
  }
  function lineChart(points, cur, caption, lastWord = "now"){
    if (points.length < 2) return `<p class="aum-muted">Not enough history for ${esc(caption.toLowerCase())} yet.</p>`;
    const W = 540, H = 150, top = 14, base = 120;
    const vals = points.map(p => p.value), max = Math.max(...vals, 0), min = Math.min(...vals, 0);
    const span = max - min || 1;
    const t0 = points[0].t, t1 = points[points.length - 1].t, tw = (t1 - t0) || 1;
    const X = p => ((p.t - t0) / tw) * (W - 12) + 6, Y = v => base - ((v - min) / span) * (base - top);
    const d = points.map((p, i) => `${i ? "L" : "M"}${X(p).toFixed(1)},${Y(p.value).toFixed(1)}`).join(" ");
    const area = `${d} L${X(points[points.length - 1]).toFixed(1)},${base} L${X(points[0]).toFixed(1)},${base} Z`;
    const hits = points.map((p, i) => {
      const x = X(p), prev = i ? X(points[i - 1]) : 0, next = i < points.length - 1 ? X(points[i + 1]) : W;
      const a = i ? (x + prev) / 2 : 0, b = i < points.length - 1 ? (x + next) / 2 : W;
      return `<g class="tm-dp-pt"><title>${esc(`${p.label}: ${plain(p.value, cur)}`)}</title><rect class="tm-dp-hit" x="${a.toFixed(1)}" y="0" width="${Math.max(1, b - a).toFixed(1)}" height="${H}"></rect><circle cx="${x.toFixed(1)}" cy="${Y(p.value).toFixed(1)}" r="4"></circle></g>`;
    }).join("");
    const last = points[points.length - 1];
    return `<figure class="tm-dp-chart"><figcaption>${esc(caption)} <span>${esc(lastWord)} ${esc(plain(last.value, cur))}</span></figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(caption)}"><line class="tm-dp-base" x1="0" x2="${W}" y1="${base}" y2="${base}"></line>
      <path class="tm-dp-area" d="${area}"></path><path class="tm-dp-line" d="${d}"></path>${hits}
      <text x="6" y="${base + 16}">${esc(points[0].label)}</text><text x="${W - 6}" y="${base + 16}" text-anchor="end">${esc(last.label)}</text></svg></figure>`;
  }

  // ── the panel ─────────────────────────────────────────────────────────────────────────
  const P = { el: null, def: null, tab: "", st: {}, timer: 0 };
  function root(){
    if (P.el) return P.el;
    const el = document.createElement("div");
    el.id = "tmDetailPanel";
    el.className = "aum-root tm-dp-root";
    el.innerHTML = `<div class="aum-backdrop" data-dp-close></div>
      <aside class="aum-panel" role="dialog" aria-modal="true" aria-labelledby="tmDpTitle"><div class="aum-frame"></div><div class="aum-toast" role="status" aria-live="polite"></div></aside>`;
    document.body.appendChild(el);
    el.addEventListener("click", onClick);
    el.addEventListener("input", e => P.def?.onInput?.(e, P.st));
    el.addEventListener("change", e => P.def?.onChange?.(e, P.st));
    el.addEventListener("submit", e => { const f = e.target.closest("form[data-dp-form]"); if (f) { e.preventDefault(); P.def?.onSubmit?.(f, P.st); } });
    P.el = el;
    return el;
  }
  function iconUrl(key){ try { return new URL(workspaceNavIconUrl(key), document.baseURI).href; } catch (_) { return ""; } }
  function open(def){
    const el = root();
    P.def = def; P.tab = def.tab || def.tabs[0][0]; P.st = def.state || {};
    render();
    el.classList.add("is-open");
    document.documentElement.classList.add("aum-open", "tm-dp-open");
    requestAnimationFrame(() => el.querySelector(".aum-close")?.focus({ preventScroll: true }));
  }
  function close(){
    if (!P.el) return;
    P.el.classList.remove("is-open");
    P.def = null;
    document.documentElement.classList.remove("tm-dp-open");
    if (!global.TriplemAdminUserManager?.isOpen?.()) document.documentElement.classList.remove("aum-open");
  }
  function render({ keepScroll = false } = {}){
    const d = P.def; if (!d) return;
    const head = d.head();
    if (!head) { close(); return; }
    const frame = P.el.querySelector(".aum-frame");
    const old = frame.querySelector(".aum-body");
    const y = keepScroll && old ? old.scrollTop : 0;
    const url = iconUrl(d.icon);
    frame.innerHTML = `
      <header class="aum-head">
        <span class="aum-avatar tm-dp-avatar" style="--tm-sheet-icon:url('${esc(url)}')" aria-hidden="true"></span>
        <div class="aum-id"><strong id="tmDpTitle">${esc(head.title)}</strong><small>${head.sub || ""}</small>
          <div class="aum-pills">${(head.pills || []).join("")}</div></div>
        <button type="button" class="aum-close" data-dp-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </header>
      <nav class="aum-tabs" role="tablist" aria-label="${esc(head.title)}">
        ${d.tabs.map(([k, label, icon]) => `<button type="button" role="tab" data-dp-tab="${k}" aria-selected="${P.tab === k}"><i class="${icon}" aria-hidden="true"></i><span>${esc(label)}</span></button>`).join("")}
      </nav>
      <div class="aum-body" role="tabpanel">${d.render(P.tab, P.st)}</div>`;
    const body = frame.querySelector(".aum-body");
    if (y) body.scrollTop = y;
    d.after?.(P.tab, body, P.st);
  }
  function refresh(){
    if (!P.def || !P.el?.classList.contains("is-open")) return;
    clearTimeout(P.timer);
    P.timer = setTimeout(() => { if (P.def) render({ keepScroll: true }); }, 60);
  }
  function toast(msg, ok = true){
    const t = P.el?.querySelector(".aum-toast"); if (!t) return;
    t.className = `aum-toast is-${ok ? "ok" : "bad"} is-on`;
    t.innerHTML = `<i class="fa-solid ${ok ? "fa-circle-check" : "fa-triangle-exclamation"}" aria-hidden="true"></i><span>${esc(msg)}</span>`;
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("is-on"), ok ? 2400 : 5000);
  }
  async function onClick(e){
    const t = e.target;
    if (t.closest("[data-dp-close]")) return close();
    const tab = t.closest("[data-dp-tab]");
    if (tab) { P.tab = tab.dataset.dpTab; render(); return; }
    const a = t.closest("[data-dp-act]");
    if (a && !a.disabled && P.def?.actions?.[a.dataset.dpAct]) {
      try { await P.def.actions[a.dataset.dpAct](a, P.st); }
      catch (err) { toast(String(err?.message || err || "Something went wrong."), false); }
    }
  }
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !P.def || !P.el?.classList.contains("is-open")) return;
    if (document.querySelector(".modal:not(.hide)")) return; // the dialog on top closes first
    e.stopPropagation(); close();
  });

  // Shared: reminder composer (editable message, copy / WhatsApp / email)
  function reminderBlock(st, make){
    if (st.reminder == null) st.reminder = make();
    return `<label class="aum-field"><span>Message</span><textarea rows="6" data-dp-reminder>${esc(st.reminder)}</textarea></label>
      <div class="aum-actions is-wrap">
        ${btn("rem-copy", "Copy", "fa-regular fa-copy")}${btn("rem-wa", "WhatsApp", "fa-brands fa-whatsapp")}${btn("rem-mail", "Email", "fa-regular fa-envelope")}${btn("rem-reset", "Reset text", "fa-solid fa-rotate-left")}
      </div>`;
  }
  const reminderActions = (subject, make) => ({
    "rem-copy": async (_, st) => { await navigator.clipboard.writeText(st.reminder || ""); toast("Message copied"); },
    "rem-wa": (_, st) => { global.open(`https://wa.me/?text=${encodeURIComponent(st.reminder || "")}`, "_blank", "noopener"); },
    "rem-mail": (_, st) => { global.location.href = `mailto:?subject=${encodeURIComponent(subject())}&body=${encodeURIComponent(st.reminder || "")}`; },
    "rem-reset": (_, st) => { st.reminder = make(); render({ keepScroll: true }); }
  });
  const onReminderInput = (e, st) => { if (e.target.matches("[data-dp-reminder]")) st.reminder = e.target.value; };

  // ═════════════════════════════════════ LOANS ════════════════════════════════════════
  function loanData(name, dir){
    let entries = [];
    try {
      entries = getActiveEntries().filter(e => e.direction === dir && String(e.person_name || "").trim() === name
        && !hasGoodsTag(e.notes) && !hasExpenseAccountTag(e.notes) && !hasInstallmentTag(e.notes));
    } catch (_) { return null; }
    if (!entries.length) return null;
    const isP = e => e.entry_kind === "principal";
    const dateOf = e => (isP(e) ? e.loan_date : e.action_date);
    const amtOf = e => num(isP(e) ? e.principal_amount : e.action_amount);
    const tl = entries.slice().sort((a, b) => (stamp(dateOf(a)) - stamp(dateOf(b))) || ((isP(a) ? -1 : 1) - (isP(b) ? -1 : 1)));
    let run = 0;
    const rows = tl.map(e => { run = isP(e) ? run + amtOf(e) : Math.max(run - amtOf(e), 0); return { e, id: e.id, kind: isP(e) ? "principal" : e.entry_kind === "full" ? "full" : "partial", date: dateOf(e), amount: amtOf(e), after: run, note: String(e.notes || "").trim() }; });
    const principal = rows.filter(r => r.kind === "principal"), pays = rows.filter(r => r.kind !== "principal");
    const principalTotal = principal.reduce((s, r) => s + r.amount, 0), paid = pays.reduce((s, r) => s + r.amount, 0);
    const remaining = Math.max(principalTotal - paid, 0);
    const first = rows[0]?.date, last = rows[rows.length - 1]?.date;
    let openGroup = "";
    try { openGroup = groupByLoan(entries).find(g => calculateLoan(g).remaining > 0)?.group_id || ""; } catch (_) {}
    let unsynced = 0;
    try { unsynced = getUnsyncedEntriesForPerson(name, dir).length; } catch (_) {}
    return { name, dir, entries, rows, principal, pays, principalTotal, paid, remaining, currency: entries.find(isP)?.currency || entries[0].currency || "",
      status: remaining <= 0 ? "Closed" : paid > 0 ? "Partial" : "Open", first, last, openGroup, unsynced, groups: new Set(entries.map(e => e.group_id)).size };
  }
  function loanReminderText(L){
    const from = company();
    const lines = L.dir === "given"
      ? [`Dear ${L.name},`, ``, `This is a friendly reminder that ${plain(L.remaining, L.currency)} is still outstanding${L.first ? ` from ${dd(L.first)}` : ""}.`,
         `Total ${plain(L.principalTotal, L.currency)} · received so far ${plain(L.paid, L.currency)}.`, ``, `Kindly arrange the payment at your earliest convenience. Thank you.`]
      : [`Dear ${L.name},`, ``, `For your records: the remaining balance I owe you is ${plain(L.remaining, L.currency)} (total ${plain(L.principalTotal, L.currency)}, returned ${plain(L.paid, L.currency)}).`, ``, `Thank you.`];
    if (from) lines.push(``, from);
    return lines.join("\n");
  }
  function openLoan(name, dir){
    name = String(name || "").trim(); dir = dir === "given" ? "given" : "taken";
    if (!loanData(name, dir)) return;
    const words = dir === "given" ? { back: "Received back", rec: "Record received", more: "Give more", pct: "received back", noun: "given" } : { back: "Returned", rec: "Record returned", more: "Take more", pct: "returned", noun: "taken" };
    const L = () => loanData(name, dir);
    open({
      icon: "loans",
      tabs: [["overview", "Overview", "fa-solid fa-gauge-high"], ["activity", "Activity", "fa-solid fa-list"], ["insights", "Insights", "fa-solid fa-chart-column"], ["manage", "Manage", "fa-solid fa-sliders"]],
      state: { filter: "all" },
      head(){
        const d = L(); if (!d) return null;
        const tone = d.status === "Closed" ? "ok" : d.status === "Partial" ? "warn" : "info";
        return { title: d.name, sub: `Loan ${words.noun} · ${esc(d.currency)} · since ${esc(dd(d.first))}`,
          pills: [pill(d.status, tone), pill(`${pct(d.paid, d.principalTotal)}% ${words.pct}`), d.groups > 1 ? pill(`${d.groups} loans`, "", "fa-solid fa-layer-group") : "", d.unsynced ? pill(`${d.unsynced} not saved online`, "warn", "fa-solid fa-cloud-arrow-up") : ""] };
      },
      render(tab, st){
        const d = L(); if (!d) return "";
        const cur = d.currency;
        if (tab === "activity") {
          const list = d.rows.slice().reverse().filter(r => st.filter === "all" || (st.filter === "loans" ? r.kind === "principal" : r.kind !== "principal"));
          return `<div class="aum-chips">${[["all", "All"], ["loans", "Loans"], ["payments", words.back]].map(([k, t]) => `<button type="button" class="aum-chip" data-dp-act="filter" data-v="${k}" aria-pressed="${st.filter === k}">${t}</button>`).join("")}</div>
            ${list.length ? `<ul class="tm-dp-rows">${list.map(r => `<li>
              <span class="tm-dp-row-ico is-${r.kind === "principal" ? "out" : "in"}" aria-hidden="true"><i class="fa-solid ${r.kind === "principal" ? "fa-arrow-up" : "fa-arrow-down"}"></i></span>
              <span class="tm-dp-row-main"><b>${r.kind === "principal" ? (dir === "given" ? "Given" : "Taken") : r.kind === "full" ? "Final payment" : words.back}</b>
                <small>${esc(dd(r.date))}${r.note ? ` · ${esc(r.note.slice(0, 80))}` : ""}</small></span>
              <span class="tm-dp-row-amt"><b>${r.kind === "principal" ? "+" : "−"}${m(r.amount, cur)}</b><small>Balance ${m(r.after, cur)}</small></span>
              <span class="tm-dp-row-act">${global.TriplemAttachments ? TriplemAttachments.iconForId(r.id, "") : ""}
                ${canEdit() ? iconBtn("tx-edit", "Edit", "fa-solid fa-pen", `data-id="${esc(r.id)}"`) : ""}
                ${iconBtn("tx-pdf", "PDF", "fa-solid fa-file-pdf", `data-id="${esc(r.id)}"`)}
                ${canDelete() ? iconBtn("tx-delete", "Delete", "fa-solid fa-trash", `data-id="${esc(r.id)}"`, true) : ""}</span></li>`).join("")}</ul>` : empty("Nothing to show.")}`;
        }
        if (tab === "insights") {
          const months = lastMonths(12);
          const per = new Map(); d.pays.forEach(r => { const k = monthKey(r.date); if (k) per.set(k, (per.get(k) || 0) + r.amount); });
          const bars = months.map(k => ({ label: monthLabel(k), short: monthLabel(k).split(" ")[0], value: per.get(k) || 0 }));
          const balance = d.rows.map(r => ({ t: stamp(r.date), label: dd(r.date), value: r.after }));
          if (balance.length && d.remaining > 0) balance.push({ t: Date.now(), label: "Today", value: d.remaining });
          const avg = d.pays.length ? d.paid / d.pays.length : 0, big = d.pays.reduce((s, r) => Math.max(s, r.amount), 0);
          const days = d.first ? Math.max(0, daysBetween(new Date(stamp(d.first)), d.remaining > 0 ? today0() : new Date(stamp(d.last)))) : 0;
          const gaps = d.pays.slice(1).map((r, i) => daysBetween(new Date(stamp(d.pays[i].date)), new Date(stamp(r.date))));
          const gap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
          let payoff = "—";
          if (d.remaining > 0 && d.pays.length) {
            const span = Math.max(30, daysBetween(new Date(stamp(d.pays[0].date)), today0()));
            const perDay = d.paid / span;
            if (perDay > 0) { const dt = new Date(Date.now() + (d.remaining / perDay) * 86400000); payoff = dt.toLocaleDateString(undefined, { month: "short", year: "numeric" }); }
          } else if (d.remaining <= 0) payoff = "Settled";
          return section("Key figures", stats([[m(avg, cur), "Average payment"], [m(big, cur), "Largest payment"], [esc(String(d.pays.length)), "Payments"], [esc(gap ? `${gap} days` : "—"), "Between payments"], [esc(`${days} days`), d.remaining > 0 ? "Open for" : "Took"], [esc(payoff), "Settled by (at this pace)"]]))
            + section(`${words.back} per month`, barChart(bars, cur, `${words.back} per month`))
            + section("Balance over time", lineChart(balance, cur, "Balance"));
        }
        if (tab === "manage") {
          const enc = encodeURIComponent(name);
          return section("Documents", `<div class="aum-actions is-left is-wrap">${btn("pdf", "Full statement (PDF)", "fa-solid fa-file-pdf")}${btn("pdf-pick", "Choose transactions", "fa-solid fa-list-check")}</div>`)
            + (canEdit() ? section("Records", `<div class="aum-actions is-left is-wrap">${btn("rename", "Rename person", "fa-solid fa-pen")}${dir === "taken" ? btn("move", "Move to installments", "fa-solid fa-calendar-days") : ""}${d.unsynced ? btn("save-db", `Save ${d.unsynced} record(s) online`, "fa-solid fa-cloud-arrow-up", { primary: true }) : ""}</div>`) : "")
            + (canDelete() ? section("Danger zone", `<div class="aum-danger"><div><b>Delete all records of ${esc(name)}</b><small>Every loan and payment of this person (${d.rows.length} records) goes to the Recycle Bin.</small></div>${btn("delete-all", "Delete", "", { danger: true })}</div>`) : "")
            + `<span hidden data-enc="${esc(enc)}"></span>`;
        }
        // overview
        const p = pct(d.paid, d.principalTotal);
        const tone = d.status === "Closed" ? "ok" : d.status === "Partial" ? "warn" : "plain";
        const lastPay = d.pays[d.pays.length - 1];
        const since = lastPay ? daysBetween(new Date(stamp(lastPay.date)), today0()) : null;
        return section("Balance", statusCard(d.remaining > 0 ? `${m(d.remaining, cur)} remaining` : "Fully settled", `${esc(plain(d.principalTotal, cur))} in total · ${esc(plain(d.paid, cur))} ${esc(words.pct)}`, tone)
            + progress(p, `${p}% ${words.pct}`)
            + `<div class="aum-actions is-left is-wrap">${d.remaining > 0 && canEdit() ? btn("pay", words.rec, "fa-solid fa-hand-holding-dollar", { primary: true }) : ""}${canEdit() ? btn("more", words.more, "fa-solid fa-plus") : ""}${btn("pdf", "Statement", "fa-solid fa-file-pdf")}</div>`)
          + (since != null && since > 45 && d.remaining > 0 ? note(`No payment for <b>${since} days</b>. Last one was ${esc(dd(lastPay.date))}.`, "warn", "fa-regular fa-clock") : "")
          + section("Details", kv([["Total " + words.noun, m(d.principalTotal, cur)], [words.back, m(d.paid, cur)], ["Remaining", m(d.remaining, cur)], ["First entry", esc(dd(d.first))], ["Last activity", esc(dd(d.last))], ["Records", esc(`${d.principal.length} loan(s) · ${d.pays.length} payment(s)`)]]))
          + (d.remaining > 0 ? section(dir === "given" ? "Payment reminder" : "Balance message", reminderBlock(st, () => loanReminderText(L()))) : "");
      },
      onInput: onReminderInput,
      actions: {
        filter: (b, st) => { st.filter = b.dataset.v; render({ keepScroll: true }); },
        pay: () => { const d = L(); openEntryModal("payment", dir, { groupId: d?.openGroup || "" }); },
        more: () => { const d = L(); openEntryModal("principal", dir, { personName: name, currency: d?.currency || "" }); },
        pdf: () => downloadPersonPDF(encodeURIComponent(name), dir),
        "pdf-pick": () => openLoanPdfSelectionModal(name, dir),
        "tx-edit": b => openEditModal(b.dataset.id),
        "tx-pdf": b => downloadLoanTransactionsSelectionPDF(encodeURIComponent(name), dir, [b.dataset.id]),
        "tx-delete": b => deleteEntry(b.dataset.id),
        rename: async () => { await renamePersonRecords(encodeURIComponent(name), dir); },
        move: async () => { await movePersonToInstallments(encodeURIComponent(name), dir); },
        "save-db": async () => { await savePersonRecordsToDatabase(encodeURIComponent(name), dir); },
        "delete-all": async () => { await deletePersonRecords(encodeURIComponent(name), dir); },
        ...reminderActions(() => `${dir === "given" ? "Payment reminder" : "Balance"} · ${name}`, () => loanReminderText(L()))
      }
    });
  }

  // ═══════════════════════════════════ INSTALLMENTS ═══════════════════════════════════
  function openInstallment(groupId, tab){
    const G = () => { try { return getInstallmentPlanGroup(groupId); } catch (_) { return null; } };
    if (!G()) return;
    const bought = () => String(G()?.plan_type || "").toLowerCase() === "bought";
    const text = () => {
      const p = G(); if (!p) return "";
      const next = p.schedule?.nextOpen, from = company();
      const lines = [`Dear ${p.person_name},`, ``,
        next ? `A friendly reminder: installment #${next.index} of ${plain(next.balance, p.currency)} is due on ${dd(next.dueDate)}.` : `A friendly reminder about your installment plan.`,
        `Paid so far ${plain(p.paidTotal, p.currency)} · remaining ${plain(p.remaining, p.currency)}.`, ``, `Thank you.`];
      if (from) lines.push(``, from);
      return lines.join("\n");
    };
    open({
      icon: "installments", tab: tab || "overview",
      tabs: [["overview", "Overview", "fa-solid fa-gauge-high"], ["schedule", "Schedule", "fa-solid fa-calendar-days"], ["payments", "Payments", "fa-solid fa-list"], ["insights", "Insights", "fa-solid fa-chart-column"]],
      state: {},
      head(){
        const p = G(); if (!p) return null;
        const done = p.remaining <= 0.00000001, over = p.status === "Overdue" || num(p.schedule?.overdueCount) > 0;
        return { title: p.person_name || "Installment plan", sub: `${bought() ? "Bought · you pay" : "Sold · customer pays"} · ${esc(p.currency)} · started ${esc(dd(p.loan_date))}`,
          pills: [pill(done ? "Completed" : over ? "Overdue" : "Active", done ? "ok" : over ? "bad" : "info"), p.schedule ? pill(`${p.schedule.paidCount}/${p.schedule.count} paid`) : pill("No schedule", "warn"), pill(`${pct(p.paidTotal, p.principalTotal)}% paid`)] };
      },
      render(tab, st){
        const p = G(); if (!p) return "";
        const cur = p.currency, s = p.schedule, next = s?.nextOpen;
        if (tab === "schedule") {
          if (!s) return note("This plan has no monthly schedule yet.", "warn") + `<div class="aum-actions is-left">${canEdit() ? btn("edit", "Set a schedule", "fa-solid fa-calendar-plus", { primary: true }) : ""}</div>`;
          return `<ul class="tm-dp-rows">${s.slots.map(sl => {
            const open = num(sl.balance) > 0.00000001, st2 = String(sl.status || "");
            const tone = !open ? "ok" : /overdue/i.test(st2) ? "bad" : "info";
            return `<li><span class="tm-dp-row-ico is-${tone}" aria-hidden="true"><b>${esc(String(sl.index))}</b></span>
              <span class="tm-dp-row-main"><b>${esc(dd(sl.dueDate))}</b><small>${pill(st2 || (open ? "Open" : "Paid"), tone)}</small></span>
              <span class="tm-dp-row-amt"><b>${m(sl.scheduled, cur)}</b><small>Paid ${m(sl.paid, cur)}</small></span>
              <span class="tm-dp-row-act">${open && canEdit() ? btn("pay-slot", `Pay ${plain(sl.balance, "")}`, "", { data: `data-amount="${num(sl.balance)}"` }) : `<i class="fa-solid fa-circle-check tm-dp-ok" aria-label="Paid"></i>`}</span></li>`;
          }).join("")}</ul>`;
        }
        if (tab === "payments") {
          const rows = (p.payments || []).slice().sort((a, b) => stamp(b.action_date) - stamp(a.action_date));
          return rows.length ? `<ul class="tm-dp-rows">${rows.map(r => {
            let meta = {}, alloc = [], noteTxt = "";
            try { meta = installmentMetaFromNotes(r.notes); alloc = parseInstallmentAllocation(meta.allocation); noteTxt = cleanInstallmentDisplayNote(r.notes); } catch (_) {}
            const down = String(meta.paymentType || "").toLowerCase() === "down_payment";
            return `<li><span class="tm-dp-row-ico is-in" aria-hidden="true"><i class="fa-solid fa-arrow-down"></i></span>
              <span class="tm-dp-row-main"><b>${down ? "Down payment" : r.entry_kind === "full" ? "Final payment" : "Payment"}</b>
                <small>${esc(dd(r.action_date))}${alloc.length ? ` · ${esc(alloc.map(a => "#" + a.index).join(", "))}` : ""}${noteTxt ? ` · ${esc(noteTxt.slice(0, 60))}` : ""}</small></span>
              <span class="tm-dp-row-amt"><b>${m(r.action_amount, cur)}</b></span>
              <span class="tm-dp-row-act">${global.TriplemAttachments ? TriplemAttachments.iconForId(r.id, "") : ""}
                ${!down && canEdit() ? iconBtn("pay-edit", "Edit", "fa-solid fa-pen", `data-id="${esc(r.id)}"`) : ""}
                ${!down && canDelete() ? iconBtn("pay-delete", "Delete", "fa-solid fa-trash", `data-id="${esc(r.id)}"`, true) : ""}</span></li>`;
          }).join("")}</ul>` : empty("No payments yet.");
        }
        if (tab === "insights") {
          const per = new Map(); (p.payments || []).forEach(r => { const k = monthKey(r.action_date); if (k) per.set(k, (per.get(k) || 0) + num(r.action_amount)); });
          const bars = lastMonths(12).map(k => ({ label: monthLabel(k), short: monthLabel(k).split(" ")[0], value: per.get(k) || 0 }));
          const slots = s?.slots || [], paidSlots = slots.filter(x => num(x.balance) <= 0.00000001).length, overdue = slots.filter(x => /overdue/i.test(x.status || "")).length;
          const left = slots.filter(x => num(x.balance) > 0.00000001), endDate = slots.length ? slots[slots.length - 1].dueDate : null;
          return section("Key figures", stats([[esc(`${paidSlots}/${slots.length || "—"}`), "Installments paid"], [esc(String(overdue)), "Overdue"], [esc(String(left.length)), "Still to pay"], [m(p.payments?.length ? p.paidTotal / p.payments.length : 0, cur), "Average payment"], [esc(dd(endDate)), "Last installment"], [m(p.financedAmount || 0, cur), "Financed amount"]]))
            + section("Paid per month", barChart(bars, cur, "Paid per month"));
        }
        // overview
        const done = p.remaining <= 0.00000001, over = p.status === "Overdue";
        const pp = pct(p.paidTotal, p.principalTotal);
        let dueLine = "";
        if (next) { const days = daysBetween(today0(), new Date(stamp(next.dueDate))); dueLine = days < 0 ? `${-days} day(s) late` : days === 0 ? "due today" : `in ${days} day(s)`; }
        return section("Balance", statusCard(done ? "Fully paid" : `${m(p.remaining, cur)} left`, `${esc(plain(p.principalTotal, cur))} in total · ${esc(plain(p.paidTotal, cur))} paid`, done ? "ok" : over ? "bad" : "plain")
            + progress(pp, `${pp}% paid`)
            + (next ? `<div class="tm-dp-next ${over ? "is-bad" : ""}"><i class="fa-regular fa-calendar" aria-hidden="true"></i><div><b>Next: #${esc(String(next.index))} · ${m(next.balance, cur)}</b><small>${esc(dd(next.dueDate))} · ${esc(dueLine)}</small></div>${canEdit() ? btn("pay-next", "Pay now", "", { primary: true }) : ""}</div>` : "")
            + `<div class="aum-actions is-left is-wrap">${!done && canEdit() ? btn("pay", "Other amount", "fa-solid fa-hand-holding-dollar") : ""}${canEdit() ? btn("edit", s ? "Edit plan" : "Set schedule", "fa-solid fa-pen") : ""}${btn("pdf", "PDF", "fa-solid fa-file-pdf")}</div>`)
          + section("Details", kv([["Total price", m(p.principalTotal, cur)], ["Down payment", m(p.downPayment, cur)], ["Financed", m(p.financedAmount, cur)], ["Installments", esc(s ? `${s.count} × ${plain(s.slots?.[0]?.scheduled, "")}` : "—")], ["Started", esc(dd(p.loan_date))], [bought() ? "Seller" : "Customer", esc(p.person_name || "—")]]))
          + (!done && !bought() ? section("Payment reminder", reminderBlock(st, text)) : "");
      },
      onInput: onReminderInput,
      actions: {
        "pay-next": () => { const p = G(); openInstallmentPaymentModal(groupId, num(p?.schedule?.nextOpen?.balance) || null); },
        "pay-slot": b => openInstallmentPaymentModal(groupId, num(b.dataset.amount)),
        pay: () => openInstallmentPaymentModal(groupId),
        edit: () => openInstallmentEditModal(groupId),
        pdf: () => downloadInstallmentPlanPDF(groupId),
        "pay-edit": b => openEditModal(b.dataset.id),
        "pay-delete": async b => { await deleteInstallmentPayment(b.dataset.id); refresh(); },
        ...reminderActions(() => `Installment reminder · ${G()?.person_name || ""}`, text)
      }
    });
  }

  // ════════════════════════════════════ ASSETS ═════════════════════════════════════════
  function openAsset(assetId){
    const A = () => { try { return getAssetById(assetId); } catch (_) { return null; } };
    if (!A()) return;
    try { assetUi.selectedId = assetId; } catch (_) {}
    // The app opens the asset again after every save (to reload its transactions): keep the
    // panel and its tab, and only reload the data.
    if (P.def?.assetId === assetId && P.el?.classList.contains("is-open")) {
      Promise.resolve(ensureAssetTransactionsLoaded(assetId, { force: true })).catch(() => {}).finally(refresh);
      return;
    }
    const sum = () => { const a = A(); if (!a) return {}; try { return assetMath().summarizeAsset?.(a, getAssetTransactions(assetId), assetReportOptionsFor(a)) || {}; } catch (_) { return {}; } };
    const txs = () => { try { return getAssetTransactions(assetId) || []; } catch (_) { return []; } };
    const state0 = { loading: true, filter: "all" };
    open({
      assetId,
      icon: "assets",
      tabs: [["overview", "Overview", "fa-solid fa-gauge-high"], ["transactions", "Transactions", "fa-solid fa-list"], ["performance", "Performance", "fa-solid fa-chart-column"], ["manage", "Manage", "fa-solid fa-sliders"]],
      state: state0,
      head(){
        const a = A(); if (!a) return null;
        const s = sum(), net = num(s.net);
        return { title: a.name, sub: `${esc(assetTypeLabel(a.asset_type, a.asset_type_other))} · ${esc(a.currency)} · bought ${esc(dd(a.purchase_date))}`,
          pills: [pill(assetStatusLabel(a.status), a.status === "active" ? "ok" : ""), pill(`${net >= 0 ? "Profit" : "Loss"} ${plain(Math.abs(net), a.currency)}`, net > 0 ? "ok" : net < 0 ? "bad" : ""), s.ownership?.label ? pill(s.ownership.label, "", "fa-regular fa-clock") : ""] };
      },
      render(tab, st){
        const a = A(); if (!a) return "";
        // After a save the app empties its transaction cache for this asset; load it again.
        const loaded = (() => { try { return state.assetTransactionLoadedIds?.has(assetId); } catch (_) { return true; } })();
        if (!loaded && !st.fetching) {
          st.fetching = true; st.loading = true;
          Promise.resolve(ensureAssetTransactionsLoaded(assetId)).catch(() => {}).finally(() => { st.fetching = false; st.loading = false; refresh(); });
        }
        const cur = a.currency, s = sum();
        const cost = num(s.purchasePrice) + num(s.investedSpent), back = num(s.revenue) + num(s.salePrice);
        if (tab === "transactions") {
          if (st.loading) return `<div class="aum-skel"><span></span><span></span><span></span></div>`;
          const list = txs().slice().sort((x, y) => stamp(y.tx_date) - stamp(x.tx_date)).filter(t => st.filter === "all" || (st.filter === "revenue" ? t.tx_type === "revenue" : t.tx_type !== "revenue"));
          return `<div class="aum-chips">${[["all", "All"], ["revenue", "Income"], ["expense", "Expenses"]].map(([k, t]) => `<button type="button" class="aum-chip" data-dp-act="filter" data-v="${k}" aria-pressed="${st.filter === k}">${t}</button>`).join("")}
              ${canEdit() ? `<span class="tm-dp-spacer"></span>${btn("add-tx", "Add", "fa-solid fa-plus", { primary: true })}` : ""}</div>
            ${list.length ? `<ul class="tm-dp-rows">${list.map(t => `<li>
              <span class="tm-dp-row-ico is-${t.tx_type === "revenue" ? "in" : "out"}" aria-hidden="true"><i class="fa-solid ${t.tx_type === "revenue" ? "fa-arrow-down" : "fa-arrow-up"}"></i></span>
              <span class="tm-dp-row-main"><b>${esc(assetTxTypeLabel(t.tx_type, t.tx_label))}</b><small>${esc(dd(t.tx_date))}${t.notes ? ` · ${esc(String(t.notes).slice(0, 70))}` : ""}</small></span>
              <span class="tm-dp-row-amt"><b>${t.tx_type === "revenue" ? "+" : "−"}${m(Math.abs(num(t.amount)), cur)}</b></span>
              <span class="tm-dp-row-act">${canEdit() ? iconBtn("tx-edit", "Edit", "fa-solid fa-pen", `data-id="${esc(t.id)}"`) : ""}${canDelete() ? iconBtn("tx-delete", "Delete", "fa-solid fa-trash", `data-id="${esc(t.id)}"`, true) : ""}</span></li>`).join("")}</ul>`
              : empty("No transactions yet. Add income, maintenance, repairs and other costs to track the real return.")}`;
        }
        if (tab === "performance") {
          if (st.loading) return `<div class="aum-skel"><span></span><span></span><span></span></div>`;
          const months = lastMonths(12), inc = new Map(), exp = new Map();
          txs().forEach(t => { const k = monthKey(t.tx_date); if (!k) return; const map = t.tx_type === "revenue" ? inc : exp; map.set(k, (map.get(k) || 0) + Math.abs(num(t.amount))); });
          const mode = (() => { try { return assetUi.reportMode || "all"; } catch (_) { return "all"; } })();
          const recov = pct(back, cost);
          return section("Period", `<div class="aum-seg" role="radiogroup" aria-label="Period">${[["all", "Entire ownership"], ["yearly", "This year"], ["monthly", "This month"]].map(([k, t]) => `<button type="button" role="radio" data-dp-act="period" data-v="${k}" aria-checked="${mode === k}">${t}</button>`).join("")}</div>
              ${stats([[m(s.rangeRevenue, cur), "Income in period"], [m(s.revenue, cur), "Income, all time"], [m(s.investedSpent, cur), "Costs after purchase"], [m(s.net, cur), "Net profit / loss"]])}`)
            + section("Cost recovered", progress(recov, `${recov}% of everything spent has come back (${plain(back, cur)} of ${plain(cost, cur)})`))
            + section("Income per month", barChart(months.map(k => ({ label: monthLabel(k), short: monthLabel(k).split(" ")[0], value: inc.get(k) || 0 })), cur, "Income per month"))
            + section("Costs per month", barChart(months.map(k => ({ label: monthLabel(k), short: monthLabel(k).split(" ")[0], value: exp.get(k) || 0 })), cur, "Costs per month"));
        }
        if (tab === "manage") {
          return section("Reports", `<div class="aum-actions is-left is-wrap">${btn("pdf-full", "Full report", "fa-solid fa-file-pdf")}${btn("pdf-revenue", "Income report", "fa-solid fa-chart-line")}${btn("pdf-expenses", "Costs report", "fa-solid fa-receipt")}</div>`)
            + (canEdit() ? section("Asset", `<div class="aum-actions is-left is-wrap">${btn("edit", "Edit details", "fa-solid fa-pen")}${a.status === "active" ? btn("sell", "Sell or dispose", "fa-solid fa-handshake") : ""}${btn("add-tx", "Add transaction", "fa-solid fa-plus")}</div>`) : "")
            + (canDelete() ? section("Danger zone", `<div class="aum-danger"><div><b>Delete this asset</b><small>The asset and its transactions are removed.</small></div>${btn("delete", "Delete", "", { danger: true })}</div>`) : "");
        }
        const net = num(s.net);
        return section("Result", statusCard(`${net >= 0 ? "Profit" : "Loss"} ${m(Math.abs(net), cur)}`, `Income ${esc(plain(back, cur))} against costs ${esc(plain(cost, cur))}`, net > 0 ? "ok" : net < 0 ? "bad" : "plain")
            + `<div class="aum-actions is-left is-wrap">${canEdit() ? btn("add-tx", "Add transaction", "fa-solid fa-plus", { primary: true }) : ""}${canEdit() ? btn("edit", "Edit", "fa-solid fa-pen") : ""}${canEdit() && a.status === "active" ? btn("sell", "Sell", "fa-solid fa-handshake") : ""}${btn("pdf-full", "Report", "fa-solid fa-file-pdf")}</div>`)
          + section("Money in and out", stats([[m(s.purchasePrice, cur), "Purchase price"], [m(s.investedSpent, cur), "Spent after purchase"], [m(s.revenue, cur), "Income"], [m(s.salePrice, cur), "Sale proceeds"]]))
          + section("Details", kv([["Type", esc(assetTypeLabel(a.asset_type, a.asset_type_other))], ["Status", esc(assetStatusLabel(a.status))], ["Purchase date", esc(dd(a.purchase_date))], ["Owned for", esc(`${s.ownership?.label || "—"}${s.ownership?.ongoing ? " (ongoing)" : ""}`)], a.sale_date ? ["Sale date", esc(dd(a.sale_date))] : null, ["Description", esc(a.description || "—")]]))
          + section("Where the costs went", stats([[m(s.maintenance, cur), "Maintenance"], [m(s.repair, cur), "Repairs"], [m(s.operating, cur), "Operating"], [m(s.otherExpense, cur), "Other"], [m(s.additionalInvestment, cur), "Extra investment"], [m(s.saleCosts, cur), "Sale costs"]]));
      },
      actions: {
        filter: (b, st) => { st.filter = b.dataset.v; render({ keepScroll: true }); },
        period: b => { try { assetUi.reportMode = b.dataset.v; } catch (_) {} render({ keepScroll: true }); },
        "add-tx": () => { assetUi.selectedId = assetId; openAssetTxModal(null); },
        "tx-edit": b => { assetUi.selectedId = assetId; openAssetTxModal(b.dataset.id); },
        "tx-delete": async b => { assetUi.selectedId = assetId; await deleteAssetTransaction(b.dataset.id); refresh(); },
        edit: () => openAssetFormModal(assetId),
        sell: () => { assetUi.selectedId = assetId; openAssetSaleModal(); },
        delete: async () => { await deleteAsset(assetId); refresh(); },
        "pdf-full": () => downloadSingleAssetPDF(assetId),
        "pdf-revenue": () => downloadSingleAssetRevenuePDF(assetId),
        "pdf-expenses": () => downloadSingleAssetExpensesPDF(assetId)
      }
    });
    Promise.resolve(ensureAssetTransactionsLoaded(assetId)).catch(() => {}).finally(() => { state0.loading = false; refresh(); });
    return Promise.resolve();
  }

  // ═══════════════════════════════════ DEPRECIATION ═══════════════════════════════════
  function openDep(assetId){
    const api = global.TriplemDepApi; if (!api) return false;
    const D = () => api.getById(assetId);
    if (!D()) return false;
    const calc = (a, when = new Date()) => { try { return api.computeDepreciation(a, when) || {}; } catch (_) { return {}; } };
    open({
      icon: "assets",
      tabs: [["overview", "Overview", "fa-solid fa-gauge-high"], ["history", "History", "fa-solid fa-list"], ["forecast", "Forecast", "fa-solid fa-chart-line"], ["manage", "Manage", "fa-solid fa-sliders"]],
      state: {},
      head(){
        const a = D(); if (!a) return null;
        const c = calc(a), dep = pct(num(a.accumulated_depreciation ?? c.accumulated_depreciation), num(a.purchase_price) - num(a.salvage_value));
        return { title: a.name, sub: `${esc(api.typeLabel(a.asset_type))} · ${esc(api.methodLabel(a.depreciation_method))} · ${esc(a.currency)}`,
          pills: [pill(api.statusLabel(a.status), a.status === "active" ? "ok" : ""), pill(`${dep}% depreciated`), pill(`${c.remaining_label || "—"} left`, "", "fa-regular fa-clock")] };
      },
      render(tab){
        const a = D(); if (!a) return "";
        const cur = a.currency, c = calc(a);
        const book = num(a.current_book_value ?? c.current_book_value), acc = num(a.accumulated_depreciation ?? c.accumulated_depreciation);
        const base = Math.max(0, num(a.purchase_price) - num(a.salvage_value));
        if (tab === "history") {
          const rows = (c.periods || []).slice().sort((x, y) => String(y.period_date).localeCompare(String(x.period_date)));
          return rows.length ? section("Posted depreciation", `<ul class="tm-dp-rows">${rows.map(h => `<li>
              <span class="tm-dp-row-ico is-out" aria-hidden="true"><i class="fa-solid fa-arrow-trend-down"></i></span>
              <span class="tm-dp-row-main"><b>${esc(dd(h.period_date))}</b><small>Book ${esc(plain(h.book_value_before, ""))} → ${esc(plain(h.book_value_after, ""))}</small></span>
              <span class="tm-dp-row-amt"><b>−${m(h.depreciation_amount, cur)}</b></span></li>`).join("")}</ul>`) : empty("No depreciation posted yet.");
        }
        if (tab === "forecast") {
          const start = new Date(stamp(a.in_service_date || a.purchase_date) || Date.now());
          const end = new Date(start); end.setFullYear(end.getFullYear() + Math.max(1, Math.ceil(num(a.useful_life_years))));
          const pts = []; const step = new Date(start);
          while (step <= end && pts.length < 60) { const cc = calc(a, step); pts.push({ t: step.getTime(), label: step.toLocaleDateString(undefined, { month: "short", year: "numeric" }), value: num(cc.current_book_value) }); step.setMonth(step.getMonth() + Math.max(1, Math.round(num(a.useful_life_years) * 12 / 24))); }
          const endC = calc(a, end); pts.push({ t: end.getTime(), label: end.toLocaleDateString(undefined, { month: "short", year: "numeric" }), value: num(endC.current_book_value) });
          const years = []; const y0 = new Date().getFullYear();
          for (let y = y0; y <= end.getFullYear() && years.length < 12; y++) { const cc = calc(a, new Date(y, 11, 31)); years.push([y, num(cc.current_book_value), num(cc.accumulated_depreciation)]); }
          return section("Book value over the asset's life", lineChart(pts, cur, "Book value", "at end of life"))
            + section("Year-end values", `<ul class="tm-dp-rows">${years.map(([y, b, ac]) => `<li><span class="tm-dp-row-ico is-info" aria-hidden="true"><b>${String(y).slice(2)}</b></span><span class="tm-dp-row-main"><b>31 Dec ${y}</b><small>Depreciated so far ${esc(plain(ac, cur))}</small></span><span class="tm-dp-row-amt"><b>${m(b, cur)}</b><small>Book value</small></span></li>`).join("")}</ul>`);
        }
        if (tab === "manage") {
          return section("Reports", `<div class="aum-actions is-left is-wrap">${btn("report", "Valuation report", "fa-solid fa-file-pdf")}${btn("report-monthly", "Monthly report", "fa-solid fa-calendar")}</div>`)
            + (canEdit() ? section("Asset", `<div class="aum-actions is-left is-wrap">${btn("edit", "Edit details", "fa-solid fa-pen")}${a.status === "active" && a.depreciation_method === "units_of_production" ? btn("usage", "Record usage", "fa-solid fa-gauge-high") : ""}${a.status === "active" ? btn("dispose", "Sell or dispose", "fa-solid fa-handshake") : ""}</div>`) : "")
            + (canDelete() ? section("Danger zone", `<div class="aum-danger"><div><b>Delete this asset</b><small>The asset and its depreciation history are removed.</small></div>${btn("delete", "Delete", "", { danger: true })}</div>`) : "");
        }
        const review = !a.last_review_date || (Date.now() - new Date(a.last_review_date).getTime()) > 365 * 86400000;
        const dp = pct(acc, base);
        return section("Book value", statusCard(`${m(book, cur)} book value`, `Bought for ${esc(plain(a.purchase_price, cur))} · depreciated ${esc(plain(acc, cur))}`, a.status === "active" ? "plain" : "ok")
            + progress(dp, `${dp}% of the depreciable amount used · ${c.remaining_label || "—"} left`)
            + `<div class="aum-actions is-left is-wrap">${canEdit() ? btn("edit", "Edit", "fa-solid fa-pen") : ""}${canEdit() && a.status === "active" ? btn("dispose", "Sell / dispose", "fa-solid fa-handshake") : ""}${btn("report", "Report", "fa-solid fa-file-pdf")}</div>`)
          + (review && a.status === "active" ? note("Review the residual value and useful life once a year (last review: " + esc(a.last_review_date ? dd(a.last_review_date) : "never") + ").", "warn", "fa-solid fa-triangle-exclamation") : "")
          + section("Depreciation", stats([[m(a.monthly_depreciation ?? c.monthly_depreciation, cur), "Per month"], [m(a.annual_depreciation ?? c.annual_depreciation, cur), "Per year"], [m(acc, cur), "So far"], [m(Math.max(0, book - num(a.salvage_value)), cur), "Still to depreciate"]]))
          + section("Details", kv([["Method", esc(api.methodLabel(a.depreciation_method))], ["Purchase price", m(a.purchase_price, cur)], ["Salvage value", m(a.salvage_value, cur)], ["Useful life", esc(`${a.useful_life_years} years (${c.total_months || "—"} months)`)], ["In service", esc(dd(a.in_service_date || a.purchase_date))], a.disposal_date ? ["Disposed", esc(dd(a.disposal_date))] : null, ["Description", esc(a.description || "—")]]));
      },
      actions: {
        edit: () => api.openForm(assetId),
        dispose: () => api.openDispose(assetId),
        usage: () => api.openDepUsageModal(assetId),
        delete: async () => { await api.deleteAsset(assetId); refresh(); },
        report: () => api.openReportModal("valuation"),
        "report-monthly": () => api.openReportModal("monthly")
      }
    });
    return true;
  }

  // ═════════════════════════════════════ NOTES ═════════════════════════════════════════
  function openNote(noteId, mode){
    const N = () => (state.notes || []).find(n => String(n.id) === String(noteId));
    if (!N()) return;
    try { noteDetailUiState.noteId = String(noteId); } catch (_) {}
    const titleOf = n => { try { return noteTitleFor(n); } catch (_) { return "Note"; } };
    const hasReminder = () => { try { return noteReminderUiState.pendingNoteIds.has(String(noteId)); } catch (_) { return false; } };
    const all = () => { const n = N(); return n ? `${titleOf(n)}\n\n${String(n.content || "")}` : ""; };
    open({
      icon: "notes", tab: mode === "edit" ? "edit" : "note",
      tabs: [["note", "Note", "fa-regular fa-note-sticky"], ["edit", "Edit", "fa-solid fa-pen"], ["share", "Share", "fa-solid fa-share-nodes"]],
      state: {},
      head(){
        const n = N(); if (!n) return null;
        const words = (String(n.content || "").trim().match(/\S+/g) || []).length;
        return { title: titleOf(n), sub: `Created ${esc(n.createdAt ? new Date(n.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—")}`,
          pills: [hasReminder() ? pill("Reminder set", "info", "fa-solid fa-bell") : pill("No reminder"), pill(`${words} word${words === 1 ? "" : "s"}`), pill(`${Math.max(1, Math.round(words / 200))} min read`, "", "fa-regular fa-clock")] };
      },
      render(tab, st){
        const n = N(); if (!n) return "";
        const content = String(n.content || "");
        if (tab === "edit") {
          if (!canEdit()) return note("You do not have permission to edit notes.", "warn");
          return section("Edit note", `<form class="aum-form" data-dp-form="note">
            <label class="aum-field"><span>Title</span><input name="title" maxlength="120" required value="${esc(titleOf(n))}"></label>
            <label class="aum-field"><span>Note</span><textarea name="content" rows="12" required>${esc(content)}</textarea></label>
            <div class="aum-actions">${btn("tab-note", "Cancel", "")}<button type="submit" class="aum-btn is-primary"><i class="fa-solid fa-check" aria-hidden="true"></i> Save changes</button></div></form>`);
        }
        if (tab === "share") {
          return section("Send", `<div class="aum-actions is-left is-wrap">${btn("copy", "Copy text", "fa-regular fa-copy")}${btn("wa", "WhatsApp", "fa-brands fa-whatsapp")}${btn("mail", "Email", "fa-regular fa-envelope")}${navigator.share ? btn("native", "More…", "fa-solid fa-arrow-up-from-bracket") : ""}</div>`)
            + section("Save a copy", `<div class="aum-actions is-left is-wrap">${btn("txt", "Download text file", "fa-regular fa-file-lines")}${btn("print", "Print", "fa-solid fa-print")}</div>`);
        }
        const chars = content.trim().length, lines = content.split(/\n/).length;
        return section("Note", `<div class="tm-dp-note">${esc(content) || "<em>Empty note</em>"}</div>
            <div class="aum-actions is-left is-wrap">${canEdit() ? btn("tab-edit", "Edit", "fa-solid fa-pen", { primary: true }) : ""}${btn("reminder", hasReminder() ? "Manage reminder" : "Set reminder", "fa-regular fa-bell")}${btn("copy", "Copy", "fa-regular fa-copy")}${btn("tab-share", "Share", "fa-solid fa-share-nodes")}</div>`)
          + section("About this note", kv([["Created", esc(n.createdAt ? new Date(n.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—")], ["Characters", esc(String(chars))], ["Lines", esc(String(lines))], ["Reminder", esc(hasReminder() ? "Set" : "None")]]))
          + (canDelete() ? section("Danger zone", `<div class="aum-danger"><div><b>Delete this note</b><small>It goes to the Recycle Bin.</small></div>${btn("delete", "Delete", "", { danger: true })}</div>`) : "");
      },
      async onSubmit(form){
        const b = form.querySelector('[type="submit"]'); b.disabled = true;
        try {
          await saveEditedNoteContent(noteId, form.elements.content.value, form.elements.title.value);
          P.tab = "note"; render(); toast("Note saved");
        } catch (err) { toast(String(err?.message || err), false); }
        finally { if (b.isConnected) b.disabled = false; }
      },
      actions: {
        "tab-edit": () => { P.tab = "edit"; render(); },
        "tab-note": () => { P.tab = "note"; render(); },
        "tab-share": () => { P.tab = "share"; render(); },
        reminder: () => openNoteReminderModal(noteId),
        copy: async () => { await navigator.clipboard.writeText(all()); toast("Copied"); },
        wa: () => global.open(`https://wa.me/?text=${encodeURIComponent(all())}`, "_blank", "noopener"),
        mail: () => { const n = N(); global.location.href = `mailto:?subject=${encodeURIComponent(titleOf(n))}&body=${encodeURIComponent(String(n.content || ""))}`; },
        native: () => { const n = N(); navigator.share({ title: titleOf(n), text: String(n.content || "") }).catch(() => {}); },
        txt: () => {
          const n = N(), a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([all()], { type: "text/plain;charset=utf-8" }));
          a.download = `${titleOf(n).replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "note"}.txt`;
          document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        },
        print: () => {
          const n = N(), w = global.open("", "_blank", "width=720,height=900"); if (!w) return;
          w.document.write(`<!doctype html><title>${esc(titleOf(n))}</title><body style="font:15px/1.6 system-ui,sans-serif;padding:32px;max-width:680px;margin:auto"><h2 style="font-weight:500">${esc(titleOf(n))}</h2><div style="white-space:pre-wrap">${esc(n.content || "")}</div></body>`);
          w.document.close(); w.focus(); setTimeout(() => w.print(), 200);
        },
        delete: async () => { await global.deleteNote(noteId); refresh(); }
      }
    });
  }

  // ── take over the old "details" entry points ─────────────────────────────────────────
  function install(){
    if (typeof global.openLoanDetailsOverlay === "function") global.openLoanDetailsOverlay = (n, d) => openLoan(n, d);
    if (typeof global.openInstallmentItemDetailsOverlay === "function") global.openInstallmentItemDetailsOverlay = id => openInstallment(id, "overview");
    if (typeof global.openInstallmentPlanOverlay === "function") global.openInstallmentPlanOverlay = id => openInstallment(id, "schedule");
    if (typeof global.openAssetDetail === "function") global.openAssetDetail = id => openAsset(id);
    if (typeof global.openNoteDetailModal === "function") global.openNoteDetailModal = (id, mode = "view") => openNote(id, mode);
    // Redraw the open panel whenever the app redraws its data.
    ["renderAll", "renderNotes", "renderAssetDetail", "renderAssetsList"].forEach(name => {
      const fn = global[name];
      if (typeof fn !== "function" || fn.__tmDp) return;
      const wrapped = function(){ const r = fn.apply(this, arguments); refresh(); return r; };
      wrapped.__tmDp = true;
      global[name] = wrapped;
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
  global.addEventListener("load", install);

  global.TriplemDetailPanels = Object.freeze({ openLoan, openInstallment, openAsset, openDep, openNote, refresh, close, isOpen: () => !!P.def, toast });
})(typeof window !== "undefined" ? window : globalThis);
