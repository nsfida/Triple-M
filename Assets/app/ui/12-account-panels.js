/* Triplem VIP · Account menu side panels (2026-11-17)
 *
 * VAT Settings, Default start page and Help & Support open in the same side panel as wallets,
 * transactions, loans and notes (ui/10-detail-panels.js) instead of their old dialogs.
 *
 *  - VAT Settings: one card per currency with the rate, "add on top / included" switch, quick
 *    rates, a live example of what the setting does, changed markers, "apply to every currency",
 *    "no VAT anywhere" and "undo changes". Saving uses the app's own save code.
 *  - Default start page: every page you may open, with a short description, the current choice
 *    marked, "Save" and "Save and open now".
 *  - Help & Support: contact (email / WhatsApp, with your support details ready to send), quick
 *    answers that open the right place in the app, and the details of this device and app.
 *
 * Saving code, permissions and stored values are the app's: savePreferredDefaultTab(),
 * saveTaxSettingsPreferenceToDatabase() and the menu buttons themselves. If the side panel is not
 * available the old dialogs open as before.
 */
(function initTriplemAccountPanels(global){
  "use strict";

  const DP = () => global.TriplemDetailPanels || null;
  const K = () => DP()?.kit;
  const esc = v => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const avatar = (icon, tone = "") => `<span class="tm-dp-txico tm-ap-ico" style="--t:${tone || "var(--primary,#2563eb)"}"><i class="${icon}"></i></span>`;
  const closeMenus = () => {
    document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
    document.querySelectorAll(".menu-wrap.open").forEach(w => w.classList.remove("open"));
    document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(t => t.setAttribute("aria-expanded", "false"));
  };
  const toast = (m, ok = true) => { try { DP()?.toast(m, ok); } catch (_) {} };
  // A message that must outlive the panel (shown after it closes).
  const notify = (m, ok = true) => { try { if (typeof showEntryConfirmation === "function") { showEntryConfirmation(m, ok ? "success" : "error"); return; } } catch (_) {} toast(m, ok); };
  const fmt2 = n => num(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Opens another place of the app from a panel: the panel closes first, then the menu button
  // that normally opens it is pressed (so permissions and guest rules stay the app's).
  function go(btnId){
    const b = document.getElementById(btnId);
    if (!b) return false;
    DP()?.close();
    setTimeout(() => b.click(), 0);
    return true;
  }

  // ══════════════════════════════════════ VAT SETTINGS ══════════════════════════════════════
  const QUICK_RATES = [0, 5, 10, 15, 18];
  function vatClone(src){
    const out = {};
    for (const c of (global.SUPPORTED_CURRENCIES || SUPPORTED_CURRENCIES)) {
      const row = (src || {})[c] || (typeof DEFAULT_TAX_SETTINGS !== "undefined" ? DEFAULT_TAX_SETTINGS[c] : null) || { rate: 0, mode: "ADD" };
      out[c] = { rate: normalizeTaxRate(row.rate), mode: normalizeTaxMode(row.mode) };
    }
    return out;
  }
  const isAdd = mode => normalizeTaxMode(mode) === TAX_MODE_ADD;
  function vatExample(cur, row){
    const r = num(row.rate);
    if (r <= 0) return `<i class="fa-regular fa-circle" aria-hidden="true"></i> No VAT is added to new ${esc(cur)} records`;
    if (isAdd(row.mode)) {
      const vat = 100 * r / 100;
      return `<i class="fa-solid fa-calculator" aria-hidden="true"></i> ${esc(cur)} 100.00 + ${esc(trimRate(r))}% = <b>${esc(cur)} ${esc(fmt2(100 + vat))}</b> <small>(VAT ${esc(fmt2(vat))})</small>`;
    }
    const vat = 100 - 100 / (1 + r / 100);
    return `<i class="fa-solid fa-calculator" aria-hidden="true"></i> ${esc(cur)} 100.00 total includes <b>${esc(cur)} ${esc(fmt2(vat))}</b> VAT <small>(net ${esc(fmt2(100 - vat))})</small>`;
  }
  const trimRate = r => { try { return typeof trimInventoryNumber === "function" ? trimInventoryNumber(r, 2) : String(r); } catch (_) { return String(r); } };
  const sameRow = (a, b) => num(a?.rate) === num(b?.rate) && normalizeTaxMode(a?.mode) === normalizeTaxMode(b?.mode);

  function openVat(){
    const dp = DP(); if (!dp?.custom || typeof saveTaxSettingsPreferenceToDatabase !== "function") return false;
    const k = K();
    const saved = vatClone(state.taxSettings);
    const st = { saved, draft: vatClone(saved), saving: false, all: { rate: "", mode: TAX_MODE_ADD } };
    const curs = () => Object.keys(st.draft);
    const dirty = () => curs().some(c => !sameRow(st.draft[c], st.saved[c]));
    const withVat = () => curs().filter(c => num(st.draft[c].rate) > 0).length;

    function rowHtml(cur){
      const row = st.draft[cur], changed = !sameRow(row, st.saved[cur]);
      const add = isAdd(row.mode);
      return `<div class="tm-vat-row${changed ? " is-changed" : ""}${num(row.rate) > 0 ? " has-vat" : ""}" data-vat-row="${esc(cur)}">
        <div class="tm-vat-top">
          <span class="tm-vat-cur" translate="no">${esc(cur)}</span>
          <label class="tm-vat-rate"><input type="number" inputmode="decimal" min="0" max="100" step="0.01" value="${esc(trimRate(row.rate))}" data-vat-rate="${esc(cur)}" aria-label="${esc(cur)} VAT rate"><span>%</span></label>
          <div class="tm-vat-mode" role="radiogroup" aria-label="${esc(cur)} VAT treatment">
            <button type="button" role="radio" aria-checked="${add}" data-dp-act="vat-mode" data-cur="${esc(cur)}" data-mode="ADD">Add on top</button>
            <button type="button" role="radio" aria-checked="${!add}" data-dp-act="vat-mode" data-cur="${esc(cur)}" data-mode="INCLUDE">Included</button>
          </div>
          <span class="tm-vat-dot" title="Changed" aria-hidden="true"></span>
        </div>
        <div class="tm-vat-bottom">
          <span class="tm-vat-ex" data-vat-ex="${esc(cur)}">${vatExample(cur, row)}</span>
          <span class="tm-vat-quick" aria-label="Quick rates">${QUICK_RATES.map(q => `<button type="button" data-dp-act="vat-quick" data-cur="${esc(cur)}" data-rate="${q}"${num(row.rate) === q ? ' class="is-on"' : ""}>${q}%</button>`).join("")}</span>
        </div>
      </div>`;
    }
    function footHtml(){
      return `<div class="tm-ap-foot">
        ${dirty() ? `<span class="tm-ap-dirty"><i class="fa-solid fa-circle" aria-hidden="true"></i> Unsaved changes</span>${k.btn("vat-undo", "Undo changes", "fa-solid fa-rotate-left")}` : `<span class="tm-ap-dirty is-clean"><i class="fa-solid fa-check" aria-hidden="true"></i> Saved to your account</span>`}
        ${k.btn("vat-cancel", "Cancel", "")}
        ${k.btn("vat-save", st.saving ? "Saving…" : "Save VAT settings", "fa-solid fa-floppy-disk", { primary: true, disabled: st.saving || !dirty() })}
      </div>`;
    }
    // Small in-place updates while typing (no full redraw, so the cursor stays where it is).
    function refreshRow(cur){
      const body = dp.custom.body(); if (!body) return;
      const el = body.querySelector(`[data-vat-row="${CSS.escape(cur)}"]`);
      if (el) {
        const row = st.draft[cur];
        el.classList.toggle("is-changed", !sameRow(row, st.saved[cur]));
        el.classList.toggle("has-vat", num(row.rate) > 0);
        const ex = el.querySelector("[data-vat-ex]"); if (ex) ex.innerHTML = vatExample(cur, row);
        el.querySelectorAll("[data-dp-act='vat-quick']").forEach(b => b.classList.toggle("is-on", num(b.dataset.rate) === num(row.rate)));
        el.querySelectorAll("[data-dp-act='vat-mode']").forEach(b => b.setAttribute("aria-checked", String(b.dataset.mode === normalizeTaxMode(row.mode))));
      }
      const foot = body.querySelector(".tm-ap-foot"); if (foot) foot.outerHTML = footHtml();
      const pill = document.querySelector("#tmDetailPanel [data-vat-count]"); if (pill) pill.textContent = `${withVat()} with VAT`;
    }
    async function save(){
      if (st.saving || !dirty()) return;
      st.saving = true; dp.custom.render({ keepScroll: true });
      const next = {};
      curs().forEach(c => { next[c] = { rate: normalizeTaxRate(st.draft[c].rate), mode: normalizeTaxMode(st.draft[c].mode) }; });
      try {
        state.taxSettingsSaving = true;
        await saveTaxSettingsPreferenceToDatabase(next);
        try { syncGoodsPurchaseTaxDefaults(true); } catch (_) {}
        try { syncExpenseTaxDefaults(true); } catch (_) {}
        st.saved = vatClone(next); st.draft = vatClone(next);
        st.saving = false;
        try { renderAll(); } catch (_) {}
        dp.close();
        notify("VAT settings saved");
      } catch (err) {
        st.saving = false;
        dp.custom.render({ keepScroll: true });
        toast(String(err?.message || err || "VAT settings could not be saved."), false);
      } finally { state.taxSettingsSaving = false; }
    }

    dp.custom.open({
      icon: "home", tabs: [["rates", "VAT rates", "fa-solid fa-percent"]], tab: "rates", state: st,
      head: () => ({ title: "VAT Settings", avatar: avatar("fa-solid fa-percent"),
        sub: "Default VAT for new records in each currency",
        pills: [`<span class="aum-pill is-info" data-vat-count><i class="fa-solid fa-percent" aria-hidden="true"></i>${withVat()} with VAT</span>`, k.pill(`${curs().length} currencies`, "", "fa-solid fa-coins")] }),
      render(){
        return k.note("Used for <b>new</b> sales, purchases and expenses. Records you already saved keep their own VAT.", "info", "fa-solid fa-circle-info")
          + k.section("Default VAT by currency", `<div class="tm-vat-list">${curs().map(rowHtml).join("")}</div>`)
          + k.section("Every currency at once", `<div class="tm-vat-all">
              <label class="tm-vat-rate"><input type="number" inputmode="decimal" min="0" max="100" step="0.01" placeholder="Rate" value="${esc(st.all.rate)}" data-vat-all-rate aria-label="Rate for every currency"><span>%</span></label>
              <div class="tm-vat-mode" role="radiogroup" aria-label="VAT treatment for every currency">
                <button type="button" role="radio" aria-checked="${isAdd(st.all.mode)}" data-dp-act="vat-all-mode" data-mode="ADD">Add on top</button>
                <button type="button" role="radio" aria-checked="${!isAdd(st.all.mode)}" data-dp-act="vat-all-mode" data-mode="INCLUDE">Included</button>
              </div>
              ${k.btn("vat-all", "Apply to all", "fa-solid fa-check-double")}
              ${k.btn("vat-none", "No VAT anywhere", "fa-solid fa-ban")}
            </div><p class="aum-muted">Fills every currency above. Nothing is saved until you press Save.</p>`)
          + k.section("Good to know", `<ul class="tm-ap-list">
              <li><i class="fa-solid fa-plus" aria-hidden="true"></i><span><b>Add on top</b>: the VAT is added to the amount you enter (100 + 5% = 105).</span></li>
              <li><i class="fa-solid fa-equals" aria-hidden="true"></i><span><b>Included</b>: the amount you enter already contains the VAT (105 includes 5).</span></li>
              <li><i class="fa-solid fa-pen" aria-hidden="true"></i><span>You can still change the VAT on any single record while adding it.</span></li>
            </ul>`)
          + footHtml();
      },
      onInput(e, s){
        const r = e.target.closest?.("[data-vat-rate]");
        if (r) { const c = r.dataset.vatRate; s.draft[c].rate = r.value === "" ? 0 : normalizeTaxRate(r.value); refreshRow(c); return; }
        const a = e.target.closest?.("[data-vat-all-rate]");
        if (a) s.all.rate = a.value;
      },
      actions: {
        "vat-mode": b => { st.draft[b.dataset.cur].mode = normalizeTaxMode(b.dataset.mode); refreshRow(b.dataset.cur); },
        "vat-quick": b => {
          const c = b.dataset.cur; st.draft[c].rate = normalizeTaxRate(b.dataset.rate);
          const input = dp.custom.body()?.querySelector(`[data-vat-rate="${CSS.escape(c)}"]`); if (input) input.value = trimRate(st.draft[c].rate);
          refreshRow(c);
        },
        "vat-all-mode": b => { st.all.mode = normalizeTaxMode(b.dataset.mode); dp.custom.render({ keepScroll: true }); },
        "vat-all": () => {
          if (String(st.all.rate).trim() === "") { toast("Enter a rate first.", false); return; }
          const rate = normalizeTaxRate(st.all.rate);
          curs().forEach(c => { st.draft[c] = { rate, mode: normalizeTaxMode(st.all.mode) }; });
          dp.custom.render({ keepScroll: true }); toast(`${trimRate(rate)}% set for every currency — press Save to keep it`);
        },
        "vat-none": () => { curs().forEach(c => { st.draft[c] = { ...st.draft[c], rate: 0 }; }); dp.custom.render({ keepScroll: true }); },
        "vat-undo": () => { st.draft = vatClone(st.saved); dp.custom.render({ keepScroll: true }); },
        "vat-cancel": () => dp.close(),
        "vat-save": () => save()
      }
    });
    return true;
  }

  // ═══════════════════════════════════ DEFAULT START PAGE ═══════════════════════════════════
  const PAGE_INFO = {
    home: "Every section as a card, ready to open",
    dashboard: "Totals, charts and recent activity at a glance",
    expenses: "Wallets, spending and Expenses history",
    goods: "Products, stock, sales and purchases",
    insurance: "Insurance policies and their documents",
    audit: "The audit report of your records",
    "triplem-ai": "Ask Triplem AI and add records by chat",
    accounting: "Accounting books and financial reports",
    assets: "Assets and their depreciation",
    loans: "Money given, received, taken and returned",
    installments: "Installment plans and their payments",
    notes: "Notes and reminders",
    bitcoin: "Bitcoin wallets and payments"
  };
  const HOME = () => (typeof WORKSPACE_HOME_TAB !== "undefined" ? WORKSPACE_HOME_TAB : "home");
  function pageLabel(id, options){
    if (id === HOME()) return "Triplem VIP Home";
    return (options.find(o => o.id === id) || {}).label || (typeof getWorkspaceSectionLabel === "function" ? getWorkspaceSectionLabel(id) : id);
  }

  function openStartPage(){
    const dp = DP(); if (!dp?.custom || typeof listDefaultStartPageOptions !== "function" || typeof savePreferredDefaultTab !== "function") return false;
    const k = K();
    const options = listDefaultStartPageOptions();
    const cur0 = getPreferredDefaultTab();
    const current = cur0 === "given" ? "loans" : cur0;
    const st = { sel: options.some(o => o.id === current) ? current : (options[0]?.id || ""), current, saving: false };

    async function save(openNow){
      if (st.saving || !st.sel) return;
      st.saving = true; dp.custom.render({ keepScroll: true });
      try {
        const saved = await savePreferredDefaultTab(st.sel);
        st.current = saved === "given" ? "loans" : saved;
        st.saving = false;
        const msg = `Saved. Next sign-in opens ${pageLabel(st.current, options)}.`;
        if (openNow) notify(msg); else toast(msg);
        if (openNow) {
          dp.close();
          setTimeout(() => {
            try {
              if (st.current === HOME()) { if (typeof showWorkspaceHome === "function") showWorkspaceHome(); else activate(HOME()); }
              else activate(st.current === "loans" ? "given" : st.current);
            } catch (_) {}
          }, 0);
        } else dp.custom.render({ keepScroll: true });
      } catch (err) {
        st.saving = false; dp.custom.render({ keepScroll: true });
        toast(String(err?.message || err || "Could not save start page."), false);
      }
    }

    dp.custom.open({
      icon: "home", tabs: [["pages", "Start page", "fa-solid fa-house-chimney"]], tab: "pages", state: st,
      head: () => ({ title: "Default start page", avatar: avatar("fa-solid fa-house-chimney"), sub: "The page that opens when you sign in",
        pills: [k.pill(`Now: ${pageLabel(st.current, options)}`, "info", "fa-solid fa-thumbtack")] }),
      render(){
        if (!options.length) return k.empty("No pages available.");
        const changed = st.sel !== st.current;
        return k.section("Open when you sign in", `<div class="tm-sp-grid" role="radiogroup" aria-label="Start page">${options.map(o => {
            const on = o.id === st.sel, cur = o.id === st.current;
            return `<button type="button" class="tm-sp-card${on ? " is-on" : ""}" role="radio" aria-checked="${on}" data-dp-act="sp-pick" data-id="${esc(o.id)}">
              <span class="tm-sp-ico" aria-hidden="true"><i class="${esc(o.icon)}"></i></span>
              <span class="tm-sp-txt"><b>${esc(o.id === HOME() ? "Triplem VIP Home" : o.label)}</b><small>${esc(PAGE_INFO[o.id] || "")}</small></span>
              ${cur ? `<span class="tm-sp-tag">Current</span>` : `<span class="tm-sp-radio" aria-hidden="true"></span>`}
            </button>`;
          }).join("")}</div>`)
          + `<div class="tm-ap-foot">
              ${changed ? `<span class="tm-ap-dirty"><i class="fa-solid fa-circle" aria-hidden="true"></i> ${esc(pageLabel(st.sel, options))} selected</span>` : `<span class="tm-ap-dirty is-clean"><i class="fa-solid fa-check" aria-hidden="true"></i> Saved to your account</span>`}
              ${k.btn("sp-cancel", "Cancel", "")}
              ${k.btn("sp-open", "Save and open now", "fa-solid fa-arrow-right", { disabled: st.saving })}
              ${k.btn("sp-save", st.saving ? "Saving…" : "Save", "fa-solid fa-floppy-disk", { primary: true, disabled: st.saving || !changed })}
            </div>`;
      },
      actions: {
        "sp-pick": b => { st.sel = b.dataset.id; dp.custom.render({ keepScroll: true }); },
        "sp-cancel": () => dp.close(),
        "sp-save": () => save(false),
        "sp-open": () => save(true)
      }
    });
    return true;
  }

  // ═════════════════════════════════════ HELP & SUPPORT ═════════════════════════════════════
  const SUPPORT_EMAIL = "contact@triplem.vip";
  const SUPPORT_WA = "923339004564";
  function browserName(){
    const ua = navigator.userAgent || "";
    const m = ua.match(/Edg\/([\d.]+)/) ? ["Edge", ua.match(/Edg\/([\d.]+)/)[1]]
      : ua.match(/OPR\/([\d.]+)/) ? ["Opera", ua.match(/OPR\/([\d.]+)/)[1]]
      : ua.match(/Firefox\/([\d.]+)/) ? ["Firefox", ua.match(/Firefox\/([\d.]+)/)[1]]
      : ua.match(/Chrome\/([\d.]+)/) ? ["Chrome", ua.match(/Chrome\/([\d.]+)/)[1]]
      : ua.match(/Version\/([\d.]+).*Safari/) ? ["Safari", ua.match(/Version\/([\d.]+)/)[1]] : ["Browser", ""];
    return `${m[0]}${m[1] ? " " + m[1].split(".")[0] : ""}`;
  }
  function systemName(){
    const ua = navigator.userAgent || "";
    if (/Windows NT/.test(ua)) return "Windows";
    if (/Android/.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
    if (/Mac OS X/.test(ua)) return "macOS";
    if (/Linux/.test(ua)) return "Linux";
    return navigator.platform || "—";
  }
  /** Details that help support find a problem quickly. No passwords, PINs, keys or records. */
  function supportDetails(){
    const desk = (() => { try { return global.__TRIPLEM_DESKTOP__ || null; } catch (_) { return null; } })();
    const lang = (global.TriplemI18n && global.TriplemI18n.lang) || document.documentElement.lang || "en";
    const theme = document.documentElement.dataset.triplemTheme || "default";
    const mode = document.documentElement.dataset.triplemThemeMode || "";
    let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) {}
    const user = (() => { try { return state.sessionUser || null; } catch (_) { return null; } })();
    const section = String(document.body?.dataset?.workspaceSection || "home");
    return [
      ["App", desk ? `Triplem VIP for Windows ${desk.version || ""}${desk.edition === "store" || desk.packaged ? " (Microsoft Store)" : ""}`.trim() : `Triplem VIP website (${location.host || "local"})`],
      ["Account", user?.username ? `@${user.username}` : "—"],
      ["Open page", section],
      ["Browser", desk ? "Microsoft WebView2" : browserName()],
      ["System", systemName()],
      ["Screen", `${global.innerWidth}×${global.innerHeight}${global.devicePixelRatio && global.devicePixelRatio !== 1 ? ` @${Math.round(global.devicePixelRatio * 100) / 100}x` : ""}`],
      ["Language", lang],
      ["Theme", `${theme}${mode ? ` (${mode})` : ""}`],
      ["Connection", navigator.onLine === false ? "Offline" : "Online"],
      ["Time zone", tz || "—"],
      ["Local time", new Date().toLocaleString()]
    ];
  }
  const detailsText = () => supportDetails().map(([k, v]) => `${k}: ${v}`).join("\n");
  const HELP_TOPICS = [
    { q: "Change the language of the app", a: "Open Account settings and choose English, العربية or اردو under Language. Invoices, receipts and PDFs follow the same language.", btn: ["accountSettingsBtn", "Open Account settings", "fa-solid fa-user-gear"] },
    { q: "Set the VAT used for new records", a: "VAT Settings holds the default rate for each currency and whether VAT is added on top or already included.", act: ["help-vat", "Open VAT Settings", "fa-solid fa-percent"] },
    { q: "Back up or restore your records", a: "Backup & Restore downloads one ZIP file with all your records, and can add back anything that is missing from a backup.", btn: ["userBackupBtn", "Open Backup & Restore", "fa-solid fa-box-archive"] },
    { q: "Choose the page that opens after sign-in", a: "Pick Triplem VIP Home or any section as your start page.", act: ["help-start", "Choose start page", "fa-solid fa-house-chimney"] },
    { q: "Restore something you deleted", a: "Deleted records go to the Recycle Bin (the bin icon at the top) and can be restored from there.", btn: ["recycleBinBtn", "Open Recycle Bin", "fa-solid fa-trash-can-arrow-up"] },
    { q: "Install Triplem VIP on your phone or computer", a: "Download App shows the Android, iPhone and Windows options with step-by-step instructions.", btn: ["downloadAppBtn", "Open Download App", "fa-solid fa-download"] },
    { q: "Renew or upgrade your plan", a: "Plan & Subscription shows your current access and the plans you can extend to.", btn: ["planSubscriptionBtn", "Open Plan & Subscription", "fa-solid fa-crown"] },
    { q: "Keep your account safe", a: "Account settings → Account security: password, Smart PIN, two-step sign-in, passkeys and your signed-in devices.", btn: ["accountSettingsBtn", "Open Account security", "fa-solid fa-shield-halved"] }
  ];

  function openHelp(tab){
    const dp = DP(); if (!dp?.custom) return false;
    const k = K();
    const st = { q: "" };
    const enc = encodeURIComponent;
    const mail = () => `mailto:${SUPPORT_EMAIL}?subject=${enc("Triplem VIP support")}&body=${enc(`Hello Triplem VIP team,\n\n[Describe what you need help with]\n\n— Support details —\n${detailsText()}`)}`;
    const wa = () => `https://wa.me/${SUPPORT_WA}?text=${enc(`Hello Triplem VIP team, I need help with: \n\n— Support details —\n${detailsText()}`)}`;
    const available = id => { const b = document.getElementById(id); return !!b && !b.classList.contains("hide"); };

    dp.custom.open({
      icon: "home", tab: tab || "contact", state: st,
      tabs: [["contact", "Contact", "fa-solid fa-headset"], ["help", "Quick help", "fa-solid fa-lightbulb"], ["device", "This device", "fa-solid fa-laptop"]],
      head: () => ({ title: "Help & Support", avatar: avatar("fa-solid fa-circle-question"), sub: "Official Triplem VIP assistance",
        pills: [k.pill(navigator.onLine === false ? "Offline" : "Online", navigator.onLine === false ? "warn" : "ok", "fa-solid fa-signal"), k.pill("Email · WhatsApp", "info", "fa-solid fa-headset")] }),
      render(t, s){
        if (t === "help") {
          const q = s.q.trim().toLowerCase();
          const list = HELP_TOPICS.filter(x => (!x.btn || available(x.btn[0])) && (!q || `${x.q} ${x.a}`.toLowerCase().includes(q)));
          return `<label class="tm-help-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Search help" value="${esc(s.q)}" data-help-q aria-label="Search help"></label>`
            + k.section("Common questions", list.length ? `<div class="tm-help-list">${list.map((x, i) => `<details class="tm-help-item"${i === 0 && !q ? " open" : ""}>
                <summary><span>${esc(x.q)}</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary>
                <p>${esc(x.a)}</p>
                ${x.btn ? k.btn("help-go", x.btn[1], x.btn[2], { data: `data-target="${esc(x.btn[0])}"` }) : k.btn(x.act[0], x.act[1], x.act[2])}
              </details>`).join("")}</div>` : k.empty("No answer matches your search. Contact us and we will help."))
            + `<div class="aum-actions is-left">${k.btn("help-tab-contact", "Still need help? Contact us", "fa-solid fa-headset", { primary: true })}</div>`;
        }
        if (t === "device") {
          return k.note("Sending these details with your message helps us find the problem faster. They never include passwords, Smart PINs, codes or your records.", "info", "fa-solid fa-shield-halved")
            + k.section("Support details", k.kv(supportDetails().map(([a, b]) => [a, `<span translate="no">${esc(b)}</span>`])))
            + `<div class="aum-actions is-left is-wrap">${k.btn("help-copy", "Copy details", "fa-regular fa-copy", { primary: true })}</div>`;
        }
        return `<p class="tm-help-intro">For account help, product guidance or general assistance, contact Triplem VIP through either official channel. Your support details are added to the message so we can help faster.</p>
          <div class="tm-help-cards">
            <a class="tm-help-card" href="${esc(mail())}" data-help-link><span class="tm-help-card-ico"><i class="fa-solid fa-envelope" aria-hidden="true"></i></span><span><small>Email support</small><b translate="no">${esc(SUPPORT_EMAIL)}</b><em>Opens your email app with your support details</em></span><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
            <a class="tm-help-card is-wa" href="${esc(wa())}" target="_blank" rel="noopener noreferrer" data-help-link><span class="tm-help-card-ico"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></span><span><small>WhatsApp support</small><b translate="no" dir="ltr">+${esc(SUPPORT_WA)}</b><em>Opens WhatsApp with your support details</em></span><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
          </div>
          <div class="aum-actions is-left is-wrap">${k.btn("help-copy-email", "Copy email", "fa-regular fa-copy")}${k.btn("help-copy-wa", "Copy WhatsApp number", "fa-regular fa-copy")}${k.btn("help-tab-device", "See support details", "fa-solid fa-laptop")}</div>`
          + k.note("Use only these official channels for account help. Never share passwords, Smart PINs, verification codes or recovery secrets — Triplem VIP will never ask for them.", "warn", "fa-solid fa-shield-halved");
      },
      onInput(e, s){
        const q = e.target.closest?.("[data-help-q]");
        if (!q) return;
        s.q = q.value;
        const pos = q.selectionStart;
        dp.custom.render({ keepScroll: true });
        const again = dp.custom.body()?.querySelector("[data-help-q]");
        if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) {} }
      },
      actions: {
        "help-go": b => { if (!go(b.dataset.target)) toast("Not available for this account.", false); },
        "help-vat": () => { openVat(); },
        "help-start": () => { openStartPage(); },
        "help-tab-contact": () => dp.custom.tab("contact"),
        "help-tab-device": () => dp.custom.tab("device"),
        "help-copy": async () => { await navigator.clipboard.writeText(detailsText()); toast("Support details copied"); },
        "help-copy-email": async () => { await navigator.clipboard.writeText(SUPPORT_EMAIL); toast("Email copied"); },
        "help-copy-wa": async () => { await navigator.clipboard.writeText(`+${SUPPORT_WA}`); toast("WhatsApp number copied"); }
      }
    });
    return true;
  }

  // ══════════════════════ ACCOUNT SETTINGS · "Preferences & tools" card ═════════════════════
  // Added under the existing cards: the other account settings in one place, each with what is
  // set now. Each row closes Account settings and opens the setting in its own side panel.
  function prefsCardHtml(){
    let vat = "";
    try {
      const rows = Object.entries(vatClone(state.taxSettings)).filter(([, r]) => num(r.rate) > 0);
      vat = rows.length ? rows.slice(0, 3).map(([c, r]) => `${c} ${trimRate(r.rate)}%`).join(" · ") + (rows.length > 3 ? ` · +${rows.length - 3}` : "") : "No VAT set";
    } catch (_) { vat = "Default VAT per currency"; }
    let start = "";
    try { const opts = listDefaultStartPageOptions(); const c = getPreferredDefaultTab(); start = pageLabel(c === "given" ? "loans" : c, opts); } catch (_) { start = "Choose the page that opens first"; }
    const row = (id, icon, title, sub, target) => (target && !document.getElementById(target)) || (target && document.getElementById(target)?.classList.contains("hide")) ? "" :
      `<button type="button" class="account-settings-action-row tm-acct-pref" data-acct-pref="${esc(id)}"><span class="account-settings-action-icon"><i class="${icon}"></i></span><span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`;
    return `<section class="settings-card tm-acct-prefs">
      <div class="settings-card-head"><span><i class="fa-solid fa-sliders"></i> Preferences &amp; tools</span></div>
      <div class="tm-acct-pref-list">
        ${row("vat", "fa-solid fa-percent", "VAT Settings", vat, "taxSettingsBtn")}
        ${row("start", "fa-solid fa-house-chimney", "Default start page", start, "defaultStartPageBtn")}
        ${row("backup", "fa-solid fa-box-archive", "Backup & Restore", "Download a full copy or restore missing records", "userBackupBtn")}
        ${row("plan", "fa-solid fa-crown", "Plan & Subscription", "Your access and renewal", "planSubscriptionBtn")}
        ${row("app", "fa-solid fa-download", "Download App", "Android, iPhone and Windows", "downloadAppBtn")}
        ${row("help", "fa-solid fa-circle-question", "Help & Support", "Contact us, quick answers, support details", "userHelpBtn")}
      </div>
    </section>`;
  }
  const PREF_TARGET = { vat: "taxSettingsBtn", start: "defaultStartPageBtn", backup: "userBackupBtn", plan: "planSubscriptionBtn", app: "downloadAppBtn", help: "userHelpBtn" };
  function installAccountPrefs(){
    const base = global.renderAccountSettingsSummary;
    if (typeof base !== "function" || base.__tmAp) return;
    const f = function(modal){
      const r = base.apply(this, arguments);
      try {
        const body = modal?.querySelector?.("#accountSettingsSummaryBody");
        if (body && !body.querySelector(".tm-acct-prefs")) {
          body.insertAdjacentHTML("beforeend", prefsCardHtml());
          body.querySelectorAll("[data-acct-pref]").forEach(b => b.addEventListener("click", () => {
            const target = document.getElementById(PREF_TARGET[b.dataset.acctPref]);
            if (!target) return;
            modal.querySelector("[data-admin-modal-close]")?.click();   // close Account settings first
            setTimeout(() => target.click(), 0);
          }));
        }
      } catch (_) {}
      return r;
    };
    f.__tmAp = true;
    global.renderAccountSettingsSummary = f;
  }

  // ══════════════════════════ Download App: header icon for the side panel ═════════════════
  function decorateDownloadHub(){
    const head = document.querySelector("#appDownloadHubOverlay .triplem-apps-header");
    if (!head || head.querySelector(".tm-sheet-icon")) return;
    const ico = document.createElement("span");
    ico.className = "tm-sheet-icon is-fa";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = '<i class="fa-solid fa-download"></i>';
    head.prepend(ico);
  }

  // ═══════════════════════════════ Page scroll safety net ═══════════════════════════════════
  // Dialogs lock the page scroll while they are open (body overflow hidden). If one is closed
  // in a way that forgets to unlock it, the page can no longer be scrolled. When nothing is open
  // any more, the lock is lifted on the next wheel, touch or key press.
  function anythingOpen(){
    if (document.querySelector(".aum-root.is-open")) return true;
    for (const el of document.querySelectorAll('.modal:not(.hide), [aria-modal="true"], [role="dialog"], .landing-content-overlay:not(.hide), .triplem-apps-overlay:not(.hide), #appDataLoadingOverlay:not(.hide)')) {
      if (el.getAttribute("aria-hidden") === "true") continue;
      const cs = getComputedStyle(el);
      if (cs.display !== "none" && cs.visibility !== "hidden" && (el.offsetWidth || el.offsetHeight)) return true;
    }
    return false;
  }
  let guardAt = 0;
  function scrollGuard(){
    const now = Date.now();
    if (now - guardAt < 400) return;
    guardAt = now;
    const body = document.body; if (!body) return;
    if (body.style.overflow !== "hidden" && !document.documentElement.classList.contains("aum-open")) return;
    if (anythingOpen()) return;
    if (body.style.overflow === "hidden") body.style.overflow = "";
    document.documentElement.classList.remove("aum-open", "tm-dp-open");
  }

  // ── take over the menu entries (the old dialogs stay as a fallback) ─────────────────────
  function install(){
    const wrap = (name, fn) => {
      const base = global[name];
      if (typeof base !== "function" || base.__tmAp) return;
      const f = function(){ closeMenus(); try { if (fn()) return; } catch (err) { console.warn(`${name}: side panel failed, using the dialog.`, err); } return base.apply(this, arguments); };
      f.__tmAp = true;
      global[name] = f;
    };
    wrap("openTaxSettingsModal", openVat);
    wrap("openDefaultStartPageModal", openStartPage);
    wrap("openUserHelpSupportModal", () => openHelp());
    installAccountPrefs();
    decorateDownloadHub();
    if (!install.guard) {
      install.guard = true;
      ["wheel", "touchstart", "keydown"].forEach(t => document.addEventListener(t, scrollGuard, { passive: true, capture: true }));
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
  global.addEventListener("load", install);

  global.TriplemAccountPanels = Object.freeze({ vat: openVat, startPage: openStartPage, help: openHelp, supportDetails, _test: { vatExample, vatClone, PAGE_INFO, HELP_TOPICS } });
})(typeof window !== "undefined" ? window : globalThis);
