/* Triplem VIP for Windows 3.9 - search bar beside the section button.
 *
 * Runs only inside the Windows app; in browsers and on phones it does nothing.
 * Finds sections and records (invoices, bills, receipts, customers and
 * suppliers, expenses, wallets, inventory, loans, installment plans, notes,
 * assets, insurance) and shows them in a dropdown, grouped by the section
 * they belong to. Choosing one opens it.
 *
 * Light on the PC and the database:
 *  - nothing is requested until something is typed (2+ characters), and the
 *    request waits until typing pauses (350 ms); an older request is aborted;
 *  - one small read-only call per search (migration 209, at most 5 rows per
 *    kind) and the same text is answered from a 60-second memory cache;
 *  - sections and records the app already loaded are found instantly
 *    without any request, and offline only those are searched;
 *  - no timers, polling or logging while the bar is not used.
 */
(() => {
  "use strict";
  if (window.TriplemDesktopSearch) return;
  const kit = window.TriplemDesktop?.kit;
  if (!kit) return;
  const { esc, safe } = kit;

  const MIN_CHARS = 2;
  const DEBOUNCE_MS = 350;
  const LOCAL_MS = 120;
  const CACHE_MS = 60 * 1000;
  const CACHE_MAX = 40;
  const PER_KIND = 5;
  const RPC = "app_desktop_search";

  // Kind → section, label, icon and how it opens.
  const KINDS = {
    section: { group: "Sections", icon: "fa-grip", order: 0 },
    doc: { group: "Accounting · Documents", icon: "fa-file-invoice", tab: "accounting", order: 1 },
    contact: { group: "Accounting · Customers & suppliers", icon: "fa-address-book", tab: "accounting", order: 2 },
    wallet: { group: "Expenses · Wallets", icon: "fa-wallet", tab: "expenses", order: 3 },
    expense: { group: "Expenses", icon: "fa-receipt", tab: "expenses", input: "searchExpenses", order: 4 },
    item: { group: "Inventory · Items", icon: "fa-box", tab: "goods", input: "searchGoods", order: 5 },
    sale: { group: "Inventory · Sales & receipts", icon: "fa-cash-register", tab: "goods", input: "searchGoods", order: 6 },
    loan: { group: "Loans", icon: "fa-hand-holding-dollar", tab: "loans", order: 7 },
    installment: { group: "Installment plans", icon: "fa-calendar-days", tab: "installments", input: "searchInstallments", order: 8 },
    ins_sale: { group: "Insurance · Sales", icon: "fa-shield-heart", tab: "insurance", input: "insuranceFilterSearch", order: 9 },
    ins_customer: { group: "Insurance · Customers", icon: "fa-user-shield", tab: "insurance", input: "insuranceFilterSearch", order: 10 },
    asset: { group: "Assets", icon: "fa-building", tab: "assets", input: "searchAssets", order: 11 },
    dep_asset: { group: "Assets · Depreciation", icon: "fa-chart-area", tab: "assets", input: "searchDepAssets", order: 12 },
    note: { group: "Notes", icon: "fa-note-sticky", tab: "notes", input: "searchNotes", order: 13 }
  };
  const SECTION_ICONS = { dashboard: "fa-chart-line", expenses: "fa-coins", goods: "fa-cart-shopping", insurance: "fa-shield-heart", audit: "fa-file-shield", "triplem-ai": "fa-wand-magic-sparkles", assets: "fa-building", loans: "fa-hand-holding-dollar", given: "fa-hand-holding-dollar", installments: "fa-calendar-days", notes: "fa-sticky-note", bitcoin: "fa-bitcoin", accounting: "fa-scale-balanced" };
  const DOC_TYPES = { quotation: "Quotation", sales_order: "Sales order", delivery_note: "Delivery note", sales_invoice: "Invoice", credit_note: "Credit note", sales_return: "Sales return", purchase_order: "Purchase order", purchase_receipt: "Goods receipt", purchase_bill: "Bill", expense_invoice: "Expense invoice", debit_note: "Debit note", purchase_return: "Purchase return" };

  const S = {
    el: null, input: null, pop: null, query: "", results: [], active: -1,
    cache: new Map(), controller: null, debounce: 0, localTimer: 0, rpcMissing: false, searching: false, open: false, seq: 0
  };

  // ---- Pure helpers (tested) ---------------------------------------------------------------
  function norm(v) { return safe(v).toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, ""); }
  function matches(text, q) { return !!q && norm(text).includes(q); }
  function rank(title, q) {
    const t = norm(title);
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    if (t.split(/[\s\-_/.,]+/).some(w => w.startsWith(q))) return 2;
    return 3;
  }
  function amountText(a, c) {
    const n = Number(a);
    if (a === null || a === undefined || a === "" || !Number.isFinite(n)) return "";
    const v = n.toLocaleString(undefined, { minimumFractionDigits: Math.abs(n % 1) > 0 ? 2 : 0, maximumFractionDigits: 2 });
    return c ? `${safe(c)} ${v}` : v;
  }
  function dateText(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(safe(d));
    if (!m) return "";
    try { return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (_) { return m[0]; }
  }
  function subText(r) {
    let x = safe(r.x);
    if (r.k === "doc") x = x.split(" · ").map((p, i) => (i === 0 ? DOC_TYPES[p] || p : p.replace(/_/g, " "))).join(" · ");
    if (r.k === "loan") x = x === "taken" ? "Taken" : x === "given" ? "Given" : x;
    if (r.k === "installment") x = x === "sold" ? "Sold on installments" : x === "bought" ? "Bought on installments" : x;
    if (r.k === "contact") x = x.replace(/^customer\b/, "Customer").replace(/^supplier\b/, "Supplier").replace(/^both\b/, "Customer & supplier");
    if (r.k === "sale") x = x === "SALE" ? "Sale" : x === "RETURN" ? "Return" : x;
    return [x, dateText(r.d), amountText(r.a, r.c)].filter(Boolean).join(" · ");
  }
  // Server rows first, then records found locally that the server did not return.
  function mergeResults(sections, local, server, q) {
    const seen = new Set();
    const out = [];
    const add = r => {
      const key = `${r.k}:${safe(r.id).toLowerCase()}`;
      if (!r.id || seen.has(key)) return;
      seen.add(key);
      out.push(r);
    };
    sections.forEach(add);
    (server || []).forEach(add);
    (local || []).forEach(add);
    const counts = {};
    return out
      .filter(r => KINDS[r.k])
      .sort((a, b) => KINDS[a.k].order - KINDS[b.k].order || rank(a.t, q) - rank(b.t, q))
      .filter(r => { counts[r.k] = (counts[r.k] || 0) + 1; return counts[r.k] <= (r.k === "section" ? 6 : PER_KIND); });
  }
  function highlight(text, q) {
    const t = safe(text);
    if (!q) return esc(t);
    const i = norm(t).indexOf(q);
    if (i < 0 || norm(t).length !== t.length) return esc(t);
    return `${esc(t.slice(0, i))}<mark>${esc(t.slice(i, i + q.length))}</mark>${esc(t.slice(i + q.length))}`;
  }

  // ---- What the app already has in memory ---------------------------------------------------
  function sectionResults(q) {
    const sel = document.getElementById("workspaceSectionSelect");
    const list = sel ? [...sel.options].map(o => ({ id: o.value, t: o.textContent.trim() })) : [];
    return list.filter(s => s.id && s.id !== "home" && matches(s.t, q))
      .map(s => ({ k: "section", id: s.id, t: s.t, x: "Open section" }));
  }
  function appState() { try { return window.state || null; } catch (_) { return null; } }
  function localResults(q) {
    const out = [];
    const st = appState();
    const take = (k, rows, fn) => {
      if (!kit.allowed(KINDS[k].tab === "loans" ? "loans" : KINDS[k].tab)) return;
      let n = 0;
      for (const row of rows || []) {
        if (n >= PER_KIND) break;
        const r = fn(row);
        if (r && matches(r.t, q)) { out.push({ k, ...r }); n += 1; }
      }
    };
    try {
      const acc = window.TriplemAccounting?.state;
      if (acc) {
        const contacts = new Map((acc.contacts || []).map(c => [safe(c.id), c]));
        take("doc", acc.documents, d => {
          const c = contacts.get(safe(d.contact_id));
          const hit = [d.document_no, d.reference, c?.name, c?.company_name].some(v => matches(v, q));
          return d.is_deleted || !hit ? null : { id: d.id, t: safe(d.document_no) || "Document", x: [d.doc_type, c?.name, d.status].filter(Boolean).join(" · "), c: d.currency, a: d.total_amount, d: d.issue_date, _hit: true };
        });
        take("contact", acc.contacts, c => ([c.name, c.company_name, c.email, c.phone].some(v => matches(v, q)) ? { id: c.id, t: safe(c.name), x: [c.contact_type, c.company_name].filter(Boolean).join(" · "), c: c.currency, _hit: true } : null));
      }
    } catch (_) {}
    try {
      if (typeof window.getExpenseAccounts === "function") {
        take("wallet", window.getExpenseAccounts({ applyUiFilters: false }), a => ({ id: a.group_id, t: safe(a.person_name || a.account_name || "Wallet").trim(), x: "Wallet", c: a.currency }));
      }
    } catch (_) {}
    try { if (st?.notesLoaded) take("note", st.notes, n => (n.is_deleted ? null : { id: n.id, t: safe(n.content || n.notes).replace(/\s+/g, " ").slice(0, 90), d: safe(n.updated_at).slice(0, 10) })); } catch (_) {}
    try { if (st?.assetsLoaded) take("asset", st.assets, a => (a.is_deleted ? null : { id: a.id, t: safe(a.name), x: a.asset_type, c: a.currency, a: a.purchase_price, d: a.purchase_date })); } catch (_) {}
    // Records matched on other fields still show their title.
    return out.map(r => { const { _hit, ...rest } = r; return rest; }).filter(r => r.t);
  }

  // ---- Server search (one call, only when asked) --------------------------------------------
  function cacheKey(q) { return `${kit.signedInUserId()}|${q}`; }
  function cached(q) {
    const hit = S.cache.get(cacheKey(q));
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
    if (hit) S.cache.delete(cacheKey(q));
    return null;
  }
  function remember(q, rows) {
    S.cache.set(cacheKey(q), { at: Date.now(), rows });
    while (S.cache.size > CACHE_MAX) S.cache.delete(S.cache.keys().next().value);
  }
  function canQueryServer() {
    return !S.rpcMissing && navigator.onLine !== false && typeof window.supabaseRpc === "function" && !!kit.signedInUserId() && !appState()?.offlineSync?.offlineSession;
  }
  async function serverSearch(raw, q) {
    const hit = cached(q);
    if (hit) return hit;
    if (!canQueryServer()) return null;
    S.controller?.abort();
    const controller = new AbortController();
    S.controller = controller;
    try {
      const data = await window.supabaseRpc(RPC, { p_query: raw.slice(0, 80), p_limit: PER_KIND }, { signal: controller.signal, offlineCache: false });
      const rows = (Array.isArray(data) ? data : data ? [data] : []).filter(r => r && typeof r === "object" && KINDS[r.k] && r.k !== "section")
        .map(r => ({ k: safe(r.k), id: safe(r.id), t: safe(r.t).slice(0, 120), x: safe(r.x).slice(0, 160), c: safe(r.c), a: r.a, d: safe(r.d) }));
      remember(q, rows);
      return rows;
    } catch (err) {
      if (err?.name === "AbortError" || controller.signal.aborted) return undefined;
      if (err?.status === 404 || /app_desktop_search|could not find the function|PGRST202/i.test(safe(err?.message))) S.rpcMissing = true; // migration 209 not run yet
      return null;
    } finally {
      if (S.controller === controller) S.controller = null;
    }
  }

  // ---- UI ----------------------------------------------------------------------------------
  function ensureStyles() {
    if (document.getElementById("triplemDesktopSearchStyles")) return;
    const style = document.createElement("style");
    style.id = "triplemDesktopSearchStyles";
    style.textContent = `
      .dgs{position:relative;flex:1 1 320px;min-width:150px;max-width:560px;height:34px;display:flex;align-items:center;gap:8px;padding:0 6px 0 11px;border-radius:10px;
        border:1px solid color-mix(in srgb,var(--primary,#2457d6) 18%,var(--line,rgba(71,85,105,.22)));background:var(--panel,#fff);color:var(--text,#17212b);
        box-shadow:0 1px 2px rgba(15,23,42,.05);transition:border-color .15s,box-shadow .15s}
      .dgs:focus-within{border-color:color-mix(in srgb,var(--primary,#2457d6) 55%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary,#2457d6) 16%,transparent)}
      .dgs>i{color:var(--muted,#667085);font-size:.8rem;flex:0 0 auto}
      .dgs input{flex:1;min-width:0;height:100%;border:0;outline:none;background:transparent;color:inherit;font:inherit;font-size:.8rem}
      .dgs input::placeholder{color:var(--muted,#667085)}
      .dgs input:focus,.dgs input:focus-visible{outline:none!important;box-shadow:none!important;border:0!important;background:transparent!important}
      .dgs input::-webkit-search-cancel-button{display:none}
      .dgs kbd{font:inherit;font-size:.64rem;font-weight:700;color:var(--muted,#667085);border:1px solid var(--line,rgba(71,85,105,.25));border-bottom-width:2px;border-radius:5px;padding:1px 5px;white-space:nowrap}
      .dgs .dgs-x{display:none;border:0;background:none;color:var(--muted,#667085);width:24px;height:24px;border-radius:6px;cursor:pointer;flex:0 0 auto}
      .dgs .dgs-x:hover{background:color-mix(in srgb,var(--text,#17212b) 8%,transparent)}
      .dgs.has-text .dgs-x{display:inline-grid;place-items:center}
      .dgs.has-text kbd{display:none}
      .dgs .dgs-spin{display:none;width:13px;height:13px;border-radius:50%;border:2px solid color-mix(in srgb,var(--primary,#2457d6) 22%,transparent);border-top-color:var(--primary,#2457d6);animation:dgsSpin .8s linear infinite;flex:0 0 auto}
      .dgs.is-busy .dgs-spin{display:block}
      @keyframes dgsSpin{to{transform:rotate(360deg)}}
      .dgs-pop{position:absolute;top:calc(100% + 6px);left:0;width:max(100%,440px);max-width:min(620px,calc(100vw - 24px));max-height:min(62vh,560px);overflow:auto;z-index:2147480000;
        background:linear-gradient(var(--surface-elevated,var(--panel,#fff)),var(--surface-elevated,var(--panel,#fff))),var(--bg,#fff);
        -webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);color:var(--text,#17212b);border:1px solid var(--line,rgba(71,85,105,.22));border-radius:14px;
        box-shadow:0 20px 50px rgba(15,23,42,.22),0 2px 6px rgba(15,23,42,.08);padding:6px;display:none;overscroll-behavior:contain}
      .dgs-pop.open{display:block}
      .dgs-group{padding:8px 10px 4px;font-size:.66rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#667085);display:flex;align-items:center;gap:6px}
      .dgs-item{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:10px;padding:7px 10px;border-radius:10px;cursor:pointer;min-width:0}
      .dgs-item[aria-selected="true"]{background:color-mix(in srgb,var(--primary,#2457d6) 11%,transparent)}
      .dgs-item:hover{background:color-mix(in srgb,var(--primary,#2457d6) 7%,transparent)}
      .dgs-icon{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:color-mix(in srgb,var(--primary,#2457d6) 10%,transparent);color:var(--primary,#2457d6);font-size:.82rem}
      .dgs-text{min-width:0;display:grid;gap:1px}
      .dgs-text strong{font-size:.82rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dgs-text small{font-size:.72rem;color:var(--muted,#667085);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dgs-text mark{background:color-mix(in srgb,var(--warning,#f59e0b) 30%,transparent);color:inherit;border-radius:3px;padding:0 1px}
      .dgs-go{font-size:.68rem;color:var(--muted,#667085);opacity:0;white-space:nowrap}
      .dgs-item[aria-selected="true"] .dgs-go{opacity:1}
      .dgs-empty,.dgs-note{padding:14px 12px;font-size:.8rem;color:var(--muted,#667085);text-align:center}
      .dgs-note{padding:6px 12px 8px;font-size:.7rem;text-align:left;border-top:1px solid var(--line,rgba(71,85,105,.15));margin-top:4px}
      .workspace-home-heading.dgs-host{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
      .workspace-home-heading.dgs-host>#triplemDesktopSearchBar.dgs{display:flex;flex-direction:row;align-items:center;gap:8px;flex:0 1 420px;align-self:center}
      @media (max-width:820px){.dgs{flex-basis:200px}.dgs kbd{display:none}.dgs-pop{width:min(100vw - 24px,520px)}}
      @media (prefers-reduced-motion:reduce){.dgs,.dgs .dgs-spin{transition:none;animation-duration:2s}}
      @media print{.dgs{display:none!important}}`;
    document.head.appendChild(style);
  }

  function build() {
    ensureStyles();
    const el = document.createElement("div");
    el.className = "dgs";
    el.id = "triplemDesktopSearchBar";
    el.setAttribute("role", "search");
    el.innerHTML = `<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <input type="search" placeholder="Search invoices, customers, expenses…" aria-label="Search Triplem VIP" autocomplete="off" spellcheck="false"
        role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="triplemDesktopSearchResults" maxlength="80">
      <span class="dgs-spin" aria-hidden="true"></span>
      <button type="button" class="dgs-x" aria-label="Clear search" title="Clear (Esc)"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      <kbd aria-hidden="true">Ctrl K</kbd>
      <div class="dgs-pop" id="triplemDesktopSearchResults" role="listbox" aria-label="Search results"></div>`;
    S.el = el;
    S.input = el.querySelector("input");
    S.pop = el.querySelector(".dgs-pop");
    S.input.addEventListener("input", onInput);
    S.input.addEventListener("keydown", onKey);
    S.input.addEventListener("focus", () => { if (S.query.length >= 1 && S.results.length) openPop(true); });
    el.querySelector(".dgs-x").addEventListener("click", () => { clear(); S.input.focus(); });
    S.pop.addEventListener("mousedown", e => e.preventDefault()); // keep focus in the box
    S.pop.addEventListener("click", e => {
      const item = e.target.closest(".dgs-item");
      if (item) choose(Number(item.dataset.i));
    });
    S.pop.addEventListener("mousemove", e => {
      const item = e.target.closest(".dgs-item");
      if (item && Number(item.dataset.i) !== S.active) setActive(Number(item.dataset.i), false);
    });
    document.addEventListener("pointerdown", e => { if (S.open && !S.el.contains(e.target)) openPop(false); }, true);
    window.addEventListener("resize", () => { if (S.open) openPop(true); });
    return el;
  }

  // The bar sits beside the section button; on Triplem VIP Home (no section
  // button) it sits in the Home heading.
  function place() {
    const signedIn = !!kit.signedInUserId();
    if (!signedIn) { if (S.el?.isConnected) { clear(); S.el.remove(); } return; }
    const nav = document.getElementById("workspaceSectionNav");
    const home = document.querySelector("#workspaceHome .workspace-home-heading");
    const navVisible = nav && !nav.classList.contains("hide");
    const target = navVisible ? nav : (home && !document.getElementById("workspaceHome")?.classList.contains("hide") ? home : nav);
    if (!target) return;
    if (!S.el) build();
    if (S.el.parentElement !== target) {
      const hadFocus = document.activeElement === S.input;
      target.appendChild(S.el);
      home?.classList.toggle("dgs-host", target === home);
      if (hadFocus) S.input.focus();
    }
  }

  function onInput() {
    const raw = S.input.value;
    const q = norm(raw.trim());
    S.el.classList.toggle("has-text", raw.length > 0);
    if (q === S.query) return;
    S.query = q;
    S.seq += 1;
    clearTimeout(S.debounce);
    clearTimeout(S.localTimer);
    S.controller?.abort();
    if (!q) { S.results = []; setBusy(false); openPop(false); return; }
    // Sections at once; loaded records a moment later; the server after a pause.
    const sections = sectionResults(q);
    render(mergeResults(sections, [], [], q), q, q.length >= MIN_CHARS);
    if (q.length < MIN_CHARS) { setBusy(false); return; }
    const seq = S.seq;
    let local = [];
    S.localTimer = setTimeout(() => {
      if (seq !== S.seq) return;
      local = localResults(q);
      const fromCache = cached(q);
      render(mergeResults(sections, local, fromCache, q), q, !fromCache && canQueryServer());
    }, LOCAL_MS);
    const fromCache = cached(q);
    if (fromCache || !canQueryServer()) { setBusy(false); return; }
    setBusy(true);
    S.debounce = setTimeout(async () => {
      const rows = await serverSearch(raw.trim(), q);
      if (seq !== S.seq || rows === undefined) return;
      setBusy(false);
      if (!local.length) local = localResults(q);
      render(mergeResults(sections, local, rows, q), q, false, rows === null && !S.rpcMissing && navigator.onLine !== false);
    }, DEBOUNCE_MS);
  }

  function setBusy(on) { S.searching = on; S.el?.classList.toggle("is-busy", on); }

  function render(results, q, pending, failed = false) {
    S.results = results;
    S.active = results.length ? 0 : -1;
    let html = "";
    let group = "";
    results.forEach((r, i) => {
      const kind = KINDS[r.k];
      if (kind.group !== group) { group = kind.group; html += `<div class="dgs-group" role="presentation">${esc(group)}</div>`; }
      const icon = r.k === "section" ? (SECTION_ICONS[r.id] || kind.icon) : kind.icon;
      const brand = icon === "fa-bitcoin" ? "fa-brands" : "fa-solid";
      const sub = r.k === "section" ? "Open section" : subText(r);
      html += `<div class="dgs-item" role="option" id="dgsOpt${i}" data-i="${i}" aria-selected="${i === S.active}">
        <span class="dgs-icon" aria-hidden="true"><i class="${brand} ${esc(icon)}"></i></span>
        <span class="dgs-text"><strong>${highlight(r.t, q)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span>
        <span class="dgs-go">Open ↵</span></div>`;
    });
    if (!results.length) {
      html = q.length < MIN_CHARS ? `<div class="dgs-empty">Keep typing to search records…</div>`
        : pending ? `<div class="dgs-empty">Searching…</div>` : `<div class="dgs-empty">No matches for “${esc(S.input.value.trim())}”.</div>`;
    }
    const offline = q.length >= MIN_CHARS && !pending && (navigator.onLine === false || S.rpcMissing || failed);
    if (offline) html += `<div class="dgs-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${navigator.onLine === false ? "Offline: showing records already on this PC." : "Showing records already loaded in the app."}</div>`;
    S.pop.innerHTML = html;
    openPop(true);
    updateActiveDescendant();
  }

  function openPop(on) {
    S.open = on && !!S.query;
    S.pop?.classList.toggle("open", S.open);
    S.input?.setAttribute("aria-expanded", S.open ? "true" : "false");
    if (S.open) {
      // Keep the list inside the window (the bar can sit far to the right).
      S.pop.style.left = "0px";
      const bar = S.el.getBoundingClientRect();
      const w = S.pop.offsetWidth;
      const overflow = bar.left + w - (window.innerWidth - 12);
      if (overflow > 0) S.pop.style.left = `${-Math.min(overflow, Math.max(0, bar.left - 12))}px`;
    }
  }
  function setActive(i, scroll = true) {
    if (!S.results.length) return;
    S.active = (i + S.results.length) % S.results.length;
    S.pop.querySelectorAll(".dgs-item").forEach(el => el.setAttribute("aria-selected", Number(el.dataset.i) === S.active ? "true" : "false"));
    if (scroll) S.pop.querySelector(`#dgsOpt${S.active}`)?.scrollIntoView({ block: "nearest" });
    updateActiveDescendant();
  }
  function updateActiveDescendant() {
    if (S.active >= 0) S.input.setAttribute("aria-activedescendant", `dgsOpt${S.active}`);
    else S.input.removeAttribute("aria-activedescendant");
  }

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!S.open) openPop(true); else setActive(S.active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(S.active - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (S.active >= 0) choose(S.active); }
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (S.open) openPop(false); else if (S.input.value) clear(); else S.input.blur();
    } else if (e.key === "Tab") openPop(false);
  }

  function clear() {
    if (!S.input) return;
    S.input.value = "";
    S.query = "";
    S.results = [];
    S.seq += 1;
    clearTimeout(S.debounce);
    clearTimeout(S.localTimer);
    S.controller?.abort();
    setBusy(false);
    S.el.classList.remove("has-text");
    openPop(false);
  }

  // ---- Opening a result ----------------------------------------------------------------
  async function sectionSearch(tab, inputId, text) {
    kit.goTab(tab);
    if (!inputId) return;
    const field = await kit.waitFor(() => { const el = document.getElementById(inputId); return el && el.offsetParent !== null ? el : null; }, 6000);
    if (!field) return;
    field.value = text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    try { field.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (_) {}
  }

  async function choose(i) {
    const r = S.results[i];
    if (!r) return;
    const kind = KINDS[r.k];
    openPop(false);
    S.input.blur();
    try {
      if (r.k === "section") { kit.goTab(r.id); return; }
      if (kind.tab && !kit.allowed(kind.tab)) { kit.notice(`${kind.group.split(" · ")[0]} is not available for your account.`, "warn"); return; }
      switch (r.k) {
        case "doc": kit.openTarget("doc", { id: r.id }); return;
        case "wallet": kit.openTarget("wallet", { id: r.id }); return;
        case "contact": {
          kit.goTab("accounting");
          try { await window.TriplemAccounting?.load?.(); } catch (_) {}
          const ok = (window.TriplemAccounting?.state?.contacts || []).some(c => safe(c.id) === r.id);
          if (ok && typeof window.TriplemAccounting?.openStatement === "function") window.TriplemAccounting.openStatement(r.id);
          else await sectionSearch("accounting", "accountingSearch", r.t);
          return;
        }
        case "loan": {
          const taken = safe(r.x) === "taken";
          await sectionSearch(taken ? "taken" : "given", taken ? "searchTaken" : "searchGiven", r.t);
          return;
        }
        case "expense": await sectionSearch("expenses", "searchExpenses", r.t); return;
        default: await sectionSearch(kind.tab, kind.input, r.k === "note" ? r.t.slice(0, 40) : r.t);
      }
    } catch (err) {
      console.warn("Opening a search result failed:", err);
    }
  }

  // ---- Start -------------------------------------------------------------------------------
  function start() {
    place();
    const nav = document.getElementById("workspaceSectionNav");
    const home = document.getElementById("workspaceHome");
    const mo = new MutationObserver(() => place());
    if (nav) mo.observe(nav, { attributes: true, attributeFilter: ["class"] });
    if (home) mo.observe(home, { attributes: true, attributeFilter: ["class"] });
    // Sign-in and sign-out (the bar exists only while signed in).
    document.addEventListener("visibilitychange", place);
    window.addEventListener("focus", place);
    setInterval(() => { if (!document.hidden) place(); }, 5000);
  }

  window.TriplemDesktopSearch = Object.freeze({
    focus() {
      place();
      if (!S.el?.isConnected || S.el.offsetParent === null) return false;
      S.input.focus();
      S.input.select();
      if (S.results.length && S.query) openPop(true);
      return true;
    },
    clear,
    _test: Object.freeze({ norm, rank, mergeResults, subText, highlight, amountText, KINDS })
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
