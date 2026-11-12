/* Triplem VIP wallet logos (2026-11-12)
 *
 *  • Logo picker: Automatic (matched to the wallet name, as before), any built-in logo from
 *    Assets/logo/wallet_logos (listed in manifest.json), or the user's own image.
 *  • Own images are stored in the Cloudflare file storage (R2, module "wallet_logo",
 *    migration 225) and referenced as "r2:<attachment id>". The image is saved with the
 *    wallet first, so it shows at once and works offline; it is moved to the file storage
 *    in the background once the wallet is saved. If the storage is off or unreachable, the
 *    image simply stays saved with the wallet.
 *  • Logos saved earlier (Supabase storage links, built-in paths, embedded images) are not
 *    changed and keep working as before.
 *  • Display: a copy kept on this device is used first (instant, also in PDFs); otherwise a
 *    short-lived signed link is requested once and reused.
 */
(function initTriplemWalletLogos(global){
  "use strict";

  const DIR = "Assets/logo/wallet_logos/";
  const MANIFEST_URL = DIR + "manifest.json?v=20261112";
  const DEFAULT_PATH = DIR + "triplem_default_wallet.png";
  const MODULE = "wallet_logo";
  const LINK_TTL = 4 * 60000;           // signed links last 5 minutes
  const RETRY_AFTER_FAIL = 60000;
  const LOCAL_PREFIX = "triplem-wlogo-v1:";
  const LOCAL_INDEX = "triplem-wlogo-v1-index";
  const LOCAL_MAX = 40;
  const SESSION_KEY = "triplem-wlogo-links-v1";
  const PROMOTE_RETRY = [3000, 10000, 30000, 90000];

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isR2Ref = v => /^r2:[0-9a-f-]{36}$/i.test(String(v || "").trim());
  const r2Id = v => String(v || "").trim().slice(3).toLowerCase();
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const marker = id => `#wl-${id}`;

  // ---- links and device copies ------------------------------------------------------------
  const links = new Map();   // id -> { url, at }
  const pending = new Map(); // id -> Promise
  const failedAt = new Map();
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}");
    for (const [id, v] of Object.entries(saved || {})) if (v?.url && Date.now() - v.at < LINK_TTL) links.set(id, v);
  } catch (_) {}
  function persistLinks(){
    try {
      const out = {};
      for (const [id, v] of links) if (Date.now() - v.at < LINK_TTL) out[id] = v;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(out));
    } catch (_) {}
  }

  function localCopy(id){ try { return localStorage.getItem(LOCAL_PREFIX + id) || ""; } catch (_) { return ""; } }
  function saveLocalCopy(id, dataUrl){
    if (!id || !/^data:image\//.test(dataUrl || "") || dataUrl.length > 450000) return;
    let index = [];
    try { index = JSON.parse(localStorage.getItem(LOCAL_INDEX) || "[]"); } catch (_) { index = []; }
    index = index.filter(x => x !== id).concat(id);
    for (let tries = 0; tries < 6; tries++) {
      while (index.length > LOCAL_MAX) { try { localStorage.removeItem(LOCAL_PREFIX + index.shift()); } catch (_) {} }
      try {
        localStorage.setItem(LOCAL_PREFIX + id, dataUrl);
        localStorage.setItem(LOCAL_INDEX, JSON.stringify(index));
        return;
      } catch (_) {
        const oldest = index.find(x => x !== id);
        if (!oldest) return;
        index = index.filter(x => x !== oldest);
        try { localStorage.removeItem(LOCAL_PREFIX + oldest); } catch (_) {}
      }
    }
  }
  function dropLocalCopy(id){ try { localStorage.removeItem(LOCAL_PREFIX + id); } catch (_) {} }

  function swapImages(id, url){
    const next = url + marker(id);
    document.querySelectorAll(`img[src*="${marker(id)}"]`).forEach(img => {
      if (img.getAttribute("src") === next) return;
      img.dataset.fallbackApplied = "";
      img.src = next;
    });
  }

  function refresh(id){
    if (pending.has(id)) return pending.get(id);
    if (Date.now() - (failedAt.get(id) || 0) < RETRY_AFTER_FAIL) return Promise.resolve("");
    const A = global.TriplemAttachments;
    if (!A?.directLink || navigator.onLine === false) return Promise.resolve("");
    const p = A.directLink(id).then(url => {
      if (!url) throw new Error("No link");
      links.set(id, { url, at: Date.now() });
      persistLinks();
      swapImages(id, url);
      return url;
    }).catch(() => { failedAt.set(id, Date.now()); return ""; })
      .finally(() => pending.delete(id));
    pending.set(id, p);
    return p;
  }

  /** Image source for an "r2:<id>" logo. Never waits: falls back to a placeholder that is
   *  replaced when the link arrives. */
  function srcFor(ref){
    const id = r2Id(ref);
    if (!UUID_RE.test(id)) return DEFAULT_PATH;
    const local = localCopy(id);
    if (local) return local;
    const link = links.get(id);
    if (link) {
      if (Date.now() - link.at > LINK_TTL) refresh(id);
      return link.url + marker(id);
    }
    refresh(id);
    return DEFAULT_PATH + marker(id);
  }

  // ---- upload / remove -----------------------------------------------------------------
  function dataUrlToBlob(dataUrl){
    const m = String(dataUrl).match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!m) return null;
    const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  }
  function currentLogo(gid){
    const principal = typeof findExpenseWalletPrincipal === "function" ? findExpenseWalletPrincipal(gid) : null;
    if (!principal) return { principal: null, logo: "" };
    const logo = typeof expenseMetaFromNotes === "function" ? String(expenseMetaFromNotes(principal.notes || "").customLogoUrl || "").trim() : "";
    return { principal, logo };
  }

  /** Moves a logo saved with the wallet (data URL) to the Cloudflare file storage. */
  async function promote(groupId, dataUrl, attempt = 0){
    const gid = String(groupId || "").trim();
    const A = global.TriplemAttachments;
    if (!gid || !dataUrl || !A?.directUpload) return false;
    try { if (typeof isGuestMode === "function" && isGuestMode()) return false; } catch (_) {}
    try { if (typeof global.waitForExpenseWrites === "function") await global.waitForExpenseWrites(); } catch (_) {}
    const { principal, logo } = currentLogo(gid);
    if (!principal || logo !== dataUrl || !UUID_RE.test(String(principal.id || ""))) return false;
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return false;
    let id = "";
    try {
      id = await A.directUpload({ module: MODULE, recordId: principal.id, blob, mime: blob.type, name: `${principal.person_name || "Wallet"} logo` });
    } catch (err) {
      const again = (err?.code === "record_pending" || err?.retry) && !err?.offline && attempt < PROMOTE_RETRY.length;
      if (again) setTimeout(() => { promote(gid, dataUrl, attempt + 1); }, PROMOTE_RETRY[attempt]);
      else if (err?.offline) global.addEventListener("online", () => promote(gid, dataUrl, attempt), { once: true });
      return false;
    }
    saveLocalCopy(id, dataUrl);
    const ok = typeof setExpenseWalletLogoValue === "function"
      && setExpenseWalletLogoValue(gid, `r2:${id}`, { onlyIfCurrent: dataUrl });
    if (!ok) { A.directDelete?.(id).catch(() => {}); dropLocalCopy(id); }
    return ok;
  }

  async function remove(ref){
    const id = r2Id(ref);
    if (!UUID_RE.test(id)) return false;
    dropLocalCopy(id);
    links.delete(id);
    persistLinks();
    try { await global.TriplemAttachments?.directDelete?.(id); return true; }
    catch (err) { console.warn("Wallet logo could not be deleted from file storage.", err); return false; }
  }

  // ---- built-in logos --------------------------------------------------------------------
  let manifest = null;
  function loadManifest(){
    if (!manifest) {
      manifest = fetch(MANIFEST_URL, { cache: "force-cache" })
        .then(r => (r.ok ? r.json() : { logos: [] }))
        .then(j => (Array.isArray(j?.logos) ? j.logos : []).filter(x => x && /^[^/\\]+\.(png|jpe?g|webp|svg)$/i.test(x.file)))
        .catch(() => { manifest = null; return []; });
    }
    return manifest;
  }
  const builtinPath = file => DIR + file;
  const isBuiltin = v => String(v || "").startsWith(DIR);
  const autoPath = name => (typeof walletLogoFilePath === "function" ? walletLogoFilePath(name || "Wallet") : DEFAULT_PATH);
  function srcOf(choice, name){
    if (!choice || choice.kind === "auto") return autoPath(name);
    if (choice.kind === "builtin") return choice.path;
    if (choice.kind === "upload") return choice.preview || DEFAULT_PATH;
    if (choice.kind === "current") return typeof resolveWalletLogoSrc === "function" ? resolveWalletLogoSrc(name, choice.value) : DEFAULT_PATH;
    return DEFAULT_PATH;
  }
  const onErr = `this.onerror=null;this.src='${DEFAULT_PATH}'`;

  // ---- picker ----------------------------------------------------------------------------
  let picker = null;
  function ensurePicker(){
    if (picker) return picker;
    const root = document.createElement("div");
    root.id = "walletLogoPickerModal";
    root.className = "modal hide wl-picker-modal";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="modal-backdrop" data-wl-close></div>
      <div class="modal-dialog wl-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="wlPickTitle">
        <div class="modal-head wl-picker-head">
          <div class="wl-preview"><img id="wlPickPreview" alt="" src="${DEFAULT_PATH}"></div>
          <div class="wl-picker-titles"><h3 id="wlPickTitle">Wallet logo</h3><p class="help" id="wlPickSub"></p></div>
          <button class="icon-btn ghost" type="button" data-wl-close aria-label="Close">×</button>
        </div>
        <div class="modal-body wl-picker-body">
          <div class="wl-tools">
            <input id="wlPickSearch" class="input" type="search" placeholder="Search logos" autocomplete="off" aria-label="Search logos">
            <label class="btn soft wl-upload-btn"><i class="fa-solid fa-upload" aria-hidden="true"></i><span>Upload</span>
              <input id="wlPickFile" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
          </div>
          <div class="wl-grid" id="wlPickGrid" role="listbox" aria-label="Logos"></div>
        </div>
        <div class="modal-actions wl-picker-actions">
          <button type="button" class="btn ghost" data-wl-close>Cancel</button>
          <button type="button" class="btn primary" id="wlPickUse">Use logo</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    picker = { root, opts: null, choice: null, upload: null, logos: [] };
    root.addEventListener("click", e => {
      if (e.target.closest("[data-wl-close]")) { e.preventDefault(); closePicker(); return; }
      const tile = e.target.closest(".wl-tile");
      if (tile) select(JSON.parse(tile.dataset.choice || "{}"));
    });
    root.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePicker(); }
      if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("wl-tile")) { e.preventDefault(); e.target.click(); }
    });
    root.querySelector("#wlPickSearch").addEventListener("input", e => filter(e.target.value));
    root.querySelector("#wlPickFile").addEventListener("change", async e => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (!/^image\//.test(file.type || "")) { alert("Choose an image file (PNG, JPG or WebP)."); return; }
      if (picker.upload?.preview?.startsWith("blob:")) URL.revokeObjectURL(picker.upload.preview);
      picker.upload = { kind: "upload", file, preview: URL.createObjectURL(file), name: file.name };
      renderGrid();
      select({ kind: "upload" });
    });
    root.querySelector("#wlPickUse").addEventListener("click", async () => {
      const opts = picker.opts, choice = picker.choice;
      closePicker({ keepUpload: true });
      if (!opts || !choice) return;
      try { await opts.onPick?.(choice.kind === "upload" ? picker.upload : choice); }
      catch (err) { alert(err?.message || "Could not change the wallet logo."); }
    });
    return picker;
  }

  function tileHtml(choice, label, src, extraClass = ""){
    return `<div class="wl-tile${extraClass}" role="option" tabindex="0" aria-selected="false" data-choice='${esc(JSON.stringify(choice))}' data-label="${esc(label.toLowerCase())}" title="${esc(label)}">
      <span class="wl-tile-img"><img src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="${onErr}"></span>
      <span class="wl-tile-name">${esc(label)}</span></div>`;
  }
  function renderGrid(){
    const { opts, upload, logos } = picker;
    const name = opts?.name || "Wallet";
    const parts = [];
    if (upload) parts.push(tileHtml({ kind: "upload" }, "Your upload", upload.preview, " wl-tile--upload"));
    if (opts?.current && !isBuiltin(opts.current)) parts.push(tileHtml({ kind: "current", value: "" }, "Current", srcOf({ kind: "current", value: opts.current }, name), " wl-tile--current"));
    parts.push(tileHtml({ kind: "auto" }, "Automatic", autoPath(name), " wl-tile--auto"));
    for (const l of logos) parts.push(tileHtml({ kind: "builtin", path: builtinPath(l.file) }, l.name || l.file, builtinPath(l.file)));
    const grid = picker.root.querySelector("#wlPickGrid");
    grid.innerHTML = parts.join("");
    // "current" tiles carry the value outside the markup (it can be a long image).
    grid.querySelectorAll(".wl-tile--current").forEach(t => { t.dataset.choice = JSON.stringify({ kind: "current" }); });
    filter(picker.root.querySelector("#wlPickSearch").value);
    markSelected();
  }
  function same(a, b){ return !!a && !!b && a.kind === b.kind && (a.kind !== "builtin" || a.path === b.path); }
  function markSelected(){
    picker.root.querySelectorAll(".wl-tile").forEach(t => {
      let c = {}; try { c = JSON.parse(t.dataset.choice || "{}"); } catch (_) {}
      const on = same(c, picker.choice);
      t.classList.toggle("is-selected", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    const name = picker.opts?.name || "Wallet";
    const choice = picker.choice?.kind === "upload" ? picker.upload : picker.choice?.kind === "current" ? { kind: "current", value: picker.opts?.current } : picker.choice;
    const prev = picker.root.querySelector("#wlPickPreview");
    prev.onerror = function(){ this.onerror = null; this.src = DEFAULT_PATH; };
    prev.src = srcOf(choice, name);
    const unchanged = !picker.choice || picker.choice.kind === "current" || same(picker.choice, picker.initial);
    picker.root.querySelector("#wlPickUse").disabled = unchanged;
  }
  function select(choice){ picker.choice = choice; markSelected(); }
  function filter(q){
    q = String(q || "").trim().toLowerCase();
    picker.root.querySelectorAll(".wl-tile").forEach(t => { t.hidden = !!q && !t.dataset.label.includes(q) && !t.classList.contains("is-selected"); });
  }

  async function openPicker(opts){
    const p = ensurePicker();
    p.opts = opts;
    if (p.upload?.preview?.startsWith("blob:") && opts.keepUpload !== p.upload) URL.revokeObjectURL(p.upload.preview);
    p.upload = opts.keepUpload || null;
    const cur = String(opts.current || "").trim();
    p.initial = opts.choice || (cur ? (isBuiltin(cur) ? { kind: "builtin", path: cur } : { kind: "current" }) : { kind: "auto" });
    p.choice = p.initial;
    p.root.querySelector("#wlPickSub").textContent = opts.name ? opts.name : "Choose a logo or upload your own";
    p.root.querySelector("#wlPickSearch").value = "";
    p.logos = await loadManifest();
    renderGrid();
    p.root.classList.remove("hide");
    p.root.setAttribute("aria-hidden", "false");
    p.prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => (p.root.querySelector(".wl-tile.is-selected") || p.root.querySelector("#wlPickSearch"))?.focus());
  }
  function closePicker({ keepUpload = false } = {}){
    if (!picker) return;
    picker.root.classList.add("hide");
    picker.root.setAttribute("aria-hidden", "true");
    // Another modal (Add Wallet) may still be open underneath.
    document.body.style.overflow = document.querySelector(".modal:not(.hide):not(#walletLogoPickerModal)") ? "hidden" : (picker.prevOverflow || "");
    if (!keepUpload && picker.upload?.preview?.startsWith("blob:") && picker.upload !== picker.opts?.keepUpload) URL.revokeObjectURL(picker.upload.preview);
    picker.opts?.returnFocus?.focus?.();
  }

  // ---- existing wallets ------------------------------------------------------------------
  function openForWallet(groupId){
    const gid = String(groupId || "").trim();
    if (!gid || typeof getExpenseWalletLogoState !== "function") return;
    const info = getExpenseWalletLogoState(gid);
    openPicker({
      name: info.name,
      current: info.customLogoUrl,
      returnFocus: document.activeElement,
      onPick: async choice => {
        if (!choice) return;
        if (choice.kind === "auto") {
          if (!info.customLogoUrl) return;
          if (typeof isStoredWalletLogoUrl === "function" && isStoredWalletLogoUrl(info.customLogoUrl) && typeof startExpenseWalletLogoDefault === "function") {
            await startExpenseWalletLogoDefault(gid); // asks before deleting the uploaded file
          } else setExpenseWalletLogoValue(gid, "");
        } else if (choice.kind === "builtin") {
          setExpenseWalletLogoValue(gid, choice.path);
        } else if (choice.kind === "upload" && choice.file) {
          await changeExpenseWalletLogo(gid, choice.file);
          if (choice.preview?.startsWith("blob:")) URL.revokeObjectURL(choice.preview);
        }
      }
    });
  }

  // ---- Add Wallet form -------------------------------------------------------------------
  function formParts(form){
    return {
      btn: form?.querySelector("#expenseLogoPickBtn"),
      img: form?.querySelector("#expenseLogoPickImg"),
      label: form?.querySelector("#expenseLogoPickName"),
      hint: form?.querySelector("#expenseLogoPickHint"),
      nameInput: form?.querySelector('[name="account_name"]')
    };
  }
  function paintForm(form){
    const { img, label, hint, nameInput } = formParts(form);
    if (!img) return;
    const choice = form._walletLogoChoice || { kind: "auto" };
    img.onerror = function(){ this.onerror = null; this.src = DEFAULT_PATH; };
    img.src = srcOf(choice, nameInput?.value.trim() || "Wallet");
    if (label) label.textContent = choice.kind === "builtin"
      ? (choice.path.slice(DIR.length).replace(/\.[^.]+$/, "") || "Logo")
      : choice.kind === "upload" ? "Your upload" : "Automatic";
    if (hint) hint.textContent = choice.kind === "auto" ? "Matched to the wallet name" : choice.kind === "upload" ? (choice.file?.name || "Image") : "Built-in logo";
  }
  function resetForm(form){
    if (!form) return;
    if (form._walletLogoChoice?.preview?.startsWith?.("blob:")) URL.revokeObjectURL(form._walletLogoChoice.preview);
    form._walletLogoChoice = null;
    form._walletLogoPending = null;
    const { btn, nameInput } = formParts(form);
    if (btn && btn.dataset.wlBound !== "1") {
      btn.dataset.wlBound = "1";
      btn.addEventListener("click", () => {
        const choice = form._walletLogoChoice;
        openPicker({
          name: nameInput?.value.trim() || "",
          choice: choice ? (choice.kind === "upload" ? { kind: "upload" } : choice) : { kind: "auto" },
          keepUpload: choice?.kind === "upload" ? choice : null,
          returnFocus: btn,
          onPick: picked => {
            if (!picked) return;
            const old = form._walletLogoChoice;
            if (old?.preview?.startsWith?.("blob:") && old !== picked) URL.revokeObjectURL(old.preview);
            form._walletLogoChoice = picked.kind === "auto" ? null : picked;
            paintForm(form);
          }
        });
      });
      let t = 0;
      nameInput?.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => paintForm(form), 200); });
    }
    paintForm(form);
  }

  global.TriplemWalletLogos = Object.freeze({
    isR2Ref, srcFor, promote, remove, openPicker, openForWallet, resetForm, loadManifest,
    _test: Object.freeze({ dataUrlToBlob, saveLocalCopy, localCopy, links })
  });
})(typeof window !== "undefined" ? window : globalThis);
