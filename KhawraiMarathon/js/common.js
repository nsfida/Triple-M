(function () {
  const C = window.KMR;

  // Display-only deadline helper. The same cutoff is also enforced by the Supabase
  // submit_registration function and storage INSERT policies in migration 20261028_005.
  const registrationCutoff = Date.parse(C.REGISTRATION_CUTOFF || "2026-11-06T00:00:00+05:00");
  window.KMRRegistration = {
    cutoffMs: registrationCutoff,
    isOpen() { return Date.now() < registrationCutoff; },
    remainingMs() { return Math.max(0, registrationCutoff - Date.now()); }
  };

  // ---- Persistent, shared login -------------------------------------------------
  // The Supabase session is kept in localStorage under ONE key, so every page of the site
  // (public list, register, admin) reads the same login and a refresh never signs you out.
  // Falls back to sessionStorage, then memory, when the browser blocks localStorage.
  const AUTH_KEY = "kmr-auth-v1", HINT_KEY = "kmr-admin-hint", mem = {};
  const stores = [() => window.localStorage, () => window.sessionStorage];
  const safe = (fn, fallback) => { for (const s of stores) { try { const st = s(); const r = fn(st); if (r !== undefined) return r; } catch (e) {} } return fallback; };
  const storage = {
    getItem: k => safe(st => st.getItem(k), mem[k] == null ? null : mem[k]),
    setItem: (k, v) => { mem[k] = v; safe(st => { st.setItem(k, v); return true; }); },
    removeItem: k => { delete mem[k]; safe(st => { st.removeItem(k); return true; }); }
  };

  window.sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_KEY, storage }
  });

  const listeners = [];
  const permissionListeners = [];
  let cachedPermissions = null;
  const usernameFromSession = session => {
    const email = String(session && session.user && session.user.email || '').trim().toLowerCase();
    const suffix = '@' + String(C.EMAIL_DOMAIN || 'khawrai.app').toLowerCase();
    if (!email.endsWith(suffix)) return '';
    return email.slice(0, -suffix.length);
  };
  const renderAdminResultsNav = () => {
    // The button is visible only after the server confirms an authenticated account
    // with the Results feature. A stored username hint is never used for this decision.
    const allowed = !!(cachedPermissions && cachedPermissions.is_admin === true && cachedPermissions.can_results === true);
    document.querySelectorAll('[data-admin-results-nav-wrap]').forEach(node => {
      node.hidden = !allowed;
      const nav = node.closest('.primary-nav');
      if (nav) nav.classList.toggle('has-admin-results', allowed);
    });
    document.querySelectorAll('[data-admin-results-nav]').forEach(node => {
      node.hidden = !allowed;
      if (allowed && /\/results\/manage\/?$/.test(location.pathname)) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
    });
    // Some legacy navigation selectors use display!important. Re-assert native hidden
    // state explicitly so public visitors never see a privileged link, even on mobile.
    if (!allowed) document.querySelectorAll('[data-admin-results-nav-wrap], [data-admin-results-nav]').forEach(node => { node.hidden = true; });
  };
  async function fetchMyPermissions() {
    try {
      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData || !sessionData.session || !sessionData.session.user) {
        cachedPermissions = null; renderAdminResultsNav(); permissionListeners.forEach(fn => fn(null)); return null;
      }
      const { data, error } = await sb.rpc('admin_my_permissions');
      if (error || !data || data.is_admin !== true) {
        cachedPermissions = null; renderAdminResultsNav(); permissionListeners.forEach(fn => fn(null)); return null;
      }
      cachedPermissions = data;
      if (!KMRAuth.canFunds() && window.KMRPurgeFundsCache) window.KMRPurgeFundsCache(true);
      renderAdminResultsNav(); permissionListeners.forEach(fn => fn(cachedPermissions));
      return cachedPermissions;
    } catch (_) {
      cachedPermissions = null; renderAdminResultsNav(); permissionListeners.forEach(fn => fn(null)); return null;
    }
  }
  const KMRAuth = {
    // Display hints are never authorization. Every route and privileged action is checked against the database.
    hint: () => storage.getItem(HINT_KEY) || '',
    permissions: () => cachedPermissions,
    // Fine-grained permissions granted by nsfida. These only decide what the interface shows;
    // the database enforces the same rules on every read and write.
    can: (flag) => !!(cachedPermissions && cachedPermissions.is_admin === true && cachedPermissions[flag] === true),
    canFunds: () => KMRAuth.can('can_funds'),                    // view Project Funds
    canFundsAdd: () => KMRAuth.can('can_funds_add'),
    canFundsEdit: () => KMRAuth.can('can_funds_edit'),
    canFundsDelete: () => KMRAuth.can('can_funds_delete'),
    canEditRegistrations: () => KMRAuth.can('can_edit_registrations'),
    canDeleteRegistrations: () => KMRAuth.can('can_delete_registrations'),
    async refreshPermissions() { return fetchMyPermissions(); },
    async current() {
      try {
        const { data, error } = await sb.auth.getSession();
        if (error || !data.session || !data.session.user) {
          cachedPermissions = null; storage.removeItem(HINT_KEY); renderAdminResultsNav(); return '';
        }
        const username = usernameFromSession(data.session);
        if (!username) { cachedPermissions = null; storage.removeItem(HINT_KEY); renderAdminResultsNav(); return ''; }
        const permissions = await fetchMyPermissions();
        if (!permissions || permissions.is_admin !== true) { storage.removeItem(HINT_KEY); return ''; }
        storage.setItem(HINT_KEY, username);
        return username;
      } catch (_) { cachedPermissions = null; renderAdminResultsNav(); return ''; }
    },
    async signIn(username, password) {
      const u = String(username || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{2,40}$/.test(u) || !password) return { error: 'Wrong username or password.' };
      const { error } = await sb.auth.signInWithPassword({ email: `${u}@${C.EMAIL_DOMAIN}`, password });
      if (error) return { error: 'Wrong username or password.' };
      const permissions = await fetchMyPermissions();
      if (!permissions || permissions.is_admin !== true) {
        storage.removeItem(HINT_KEY); cachedPermissions = null;
        try { await sb.auth.signOut({ scope: 'local' }); } catch (_) {}
        renderAdminResultsNav();
        return { error: 'This account has not been granted admin access. Contact nsfida if you believe this is an error.' };
      }
      storage.setItem(HINT_KEY, u); return { user: u, permissions };
    },
    async signOut() { storage.removeItem(HINT_KEY); cachedPermissions = null; if (window.KMRPurgeFundsCache) window.KMRPurgeFundsCache(true); renderAdminResultsNav(); try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {} },
    onChange(cb) { listeners.push(cb); },
    onPermissionChange(cb) { permissionListeners.push(cb); }
  };
  window.KMRAuth = KMRAuth;
  const fire = async () => { const u = await KMRAuth.current(); listeners.forEach(f => f(u)); renderAdminResultsNav(); };
  // another tab signed in or out, or the token was refreshed/expired
  sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") setTimeout(fire, 0); });
  window.addEventListener("storage", e => { if (e.key === AUTH_KEY || e.key === HINT_KEY) fire(); });

  // ---- helpers -----------------------------------------------------------------
  window.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  window.photoUrl = p => p ? `${C.SUPABASE_URL}/storage/v1/object/public/photos/${p}` : "";
  window.fmtDate = d => { const x = new Date(d); return isNaN(x) ? "" : String(x.getDate()).padStart(2, "0") + "/" + String(x.getMonth() + 1).padStart(2, "0") + "/" + x.getFullYear(); };
  window.ageOf = d => { const b = new Date(d), n = new Date(); if (isNaN(b)) return null; let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
  // Signed formatting puts the minus sign before the currency marker, so a negative net
  // balance is unambiguous everywhere it appears in the interface.
  window.rs = n => {
    const amount = Number(n || 0);
    const formatted = Math.abs(amount).toLocaleString("en-US");
    return amount < 0 ? `-Rs. ${formatted}` : `Rs. ${formatted}`;
  };
  // Receiving and spending are independent ledgers. Expenses are never capped by receipts;
  // the net balance is simply total received minus total expenses and may be negative.
  window.KMRFunds = {
    totals(receivingRows, expenseRows) {
      const sum = rows => (Array.isArray(rows) ? rows : []).reduce((total, row) => {
        const amount = Number(row && row.amount || 0);
        return total + (Number.isFinite(amount) ? amount : 0);
      }, 0);
      const received = sum(receivingRows), expenses = sum(expenseRows);
      return { received, expenses, netBalance: received - expenses };
    }
  };
  window.slug = s => String(s).replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  window.toast = (msg, bad) => {
    let t = document.getElementById("toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    t.textContent = msg; t.className = "show" + (bad ? " bad" : ""); clearTimeout(t._t); t._t = setTimeout(() => t.className = "", bad ? 6000 : 3200);
  };


  // ---- local-first cache and shared loading / connection UI -------------------
  // Public directory data may be cached persistently. Admin records use sessionStorage
  // because they contain private contact information. Pending registration payloads
  // and uploaded-file blobs are stored in IndexedDB by the registration page.
  const CACHE_PREFIX = "kmr-s3-cache-v2:";
  const cacheStorage = privateData => {
    try { return privateData ? window.sessionStorage : window.localStorage; }
    catch (e) { return null; }
  };
  window.KMRStore = {
    get(key, privateData = false) {
      try { const raw = cacheStorage(privateData)?.getItem(CACHE_PREFIX + key); return raw ? JSON.parse(raw) : null; }
      catch (e) { return null; }
    },
    set(key, value, privateData = false) {
      try { const st = cacheStorage(privateData); if (!st) return false; st.setItem(CACHE_PREFIX + key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    remove(key, privateData = false) {
      try { cacheStorage(privateData)?.removeItem(CACHE_PREFIX + key); } catch (e) {}
    }
  };
  // Project Funds are owner-only. Remove any cached ledger copies that older versions of the site left in
  // this browser (the public funds list used to be cached persistently).
  window.KMRPurgeFundsCache = function (includePrivate) {
    [["public-funds", false], ["public-expenses", false]].forEach(([k, priv]) => KMRStore.remove(k, priv));
    if (includePrivate) [["admin-funds", true], ["admin-expenses", true]].forEach(([k, priv]) => KMRStore.remove(k, priv));
  };
  window.KMRPurgeFundsCache(false);
  window.KMRUI = {
    hideLoading() {
      const node = document.getElementById("appLoader"); if (!node || node.dataset.closed) return;
      node.dataset.closed = "1"; node.classList.add("is-done");
      window.setTimeout(() => { node.hidden = true; }, 360);
    },
    showLoading() {
      const node = document.getElementById("appLoader"); if (!node) return;
      node.hidden = false; node.dataset.closed = ""; node.classList.remove("is-done");
    },
    updateConnection() {
      let node = document.getElementById("kmrConnection");
      if (!node) {
        node = document.createElement("div"); node.id = "kmrConnection"; node.className = "connection-status";
        node.setAttribute("role", "status"); node.setAttribute("aria-live", "polite"); document.body.appendChild(node);
      }
      if (!navigator.onLine) { node.textContent = "Offline mode · local changes will wait to sync"; node.className = "connection-status visible offline"; }
      else { node.textContent = "Back online"; node.className = "connection-status visible online"; clearTimeout(node._hideTimer); node._hideTimer = setTimeout(() => node.className = "connection-status", 2400); }
    }
  };
  window.addEventListener("offline", () => window.KMRUI.updateConnection());
  window.addEventListener("online", () => window.KMRUI.updateConnection());
  if (!navigator.onLine) window.KMRUI.updateConnection();

  // ---- Admin profile control: consistent avatar/menu on all three pages --------
  const AVATAR_PREFIX = "kmr-admin-avatar-v1:";
  const userIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="3.6"></circle><path d="M4.2 20c.35-4 3.2-6.1 7.8-6.1s7.45 2.1 7.8 6.1z"></path></svg>';
  let profileReady = false, profileUser = "", avatarDraft = null;
  function routeRootPath() {
    let path = window.location.pathname || "/";
    const routed = path.replace(/\/(?:results\/manage|participants|results|about|register|admin)(?:\/index\.html)?\/?$/i, "/");
    if (routed !== path) path = routed;
    else path = path.replace(/\/index\.html$/i, "/");
    if (!path.endsWith("/")) path = path.slice(0, path.lastIndexOf("/") + 1);
    return path || "/";
  }
  function routeHref(route) { return routeRootPath() + String(route || "participants").replace(/^\/+|\/+$/g, "") + "/"; }
  const initials = name => String(name || "").split(/[._\s-]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase() || "";
  const avatarFor = username => { try { return username ? localStorage.getItem(AVATAR_PREFIX + username) || "" : ""; } catch (e) { return ""; } };
  function avatarMarkup(username, large = false) {
    const photo = avatarFor(username);
    if (photo) return `<img src="${esc(photo)}" alt="" class="profile-photo">`;
    return username ? `<span class="profile-initials">${esc(initials(username))}</span>` : userIcon;
  }
  const PROFILE_MENU = `
    <button type="button" class="profile-trigger" aria-label="Open account menu" aria-haspopup="menu" aria-expanded="false">
      <span class="profile-avatar" data-avatar>${avatarMarkup("")}</span>
      <span class="profile-label"><strong data-profile-name>Admin sign in</strong><small data-profile-sub>Account menu</small></span>
      <svg class="profile-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"></path></svg>
    </button>
    <div class="profile-menu" role="menu" hidden>
      <div class="profile-menu-head"><span class="profile-avatar large" data-avatar>${avatarMarkup("")}</span><div><strong data-profile-name>Admin sign in</strong><small data-profile-sub>Account menu</small></div></div>
      <a href="../admin/" class="profile-menu-item" data-profile-signin><span class="profile-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg></span><span><strong>Admin sign in</strong><small>Open organiser access</small></span></a>
      <button type="button" class="profile-menu-item" data-profile-settings hidden><span class="profile-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.3"/><path d="M5 20c.4-3.5 2.8-5.5 7-5.5s6.6 2 7 5.5"/><path d="M19 3v4M17 5h4"/></svg></span><span><strong>Profile &amp; security</strong><small>Picture and password</small></span></button>
      <button type="button" class="profile-menu-item" data-profile-admin-accounts hidden><span class="profile-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M2.8 20c.3-3.4 2.4-5.2 6.2-5.2 1.6 0 2.9.3 3.9 1"/><circle cx="17.5" cy="16.5" r="3.2"/><path d="M17.5 14.8v3.4M15.8 16.5h3.4"/></svg></span><span><strong>Admin accounts &amp; access</strong><small>Create admins and manage feature permissions</small></span></button>
      <a href="../participants/" class="profile-menu-item" data-profile-public hidden><span class="profile-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/></svg></span><span><strong>Public participants</strong><small>View the runner directory</small></span></a>
      <a href="../register/" class="profile-menu-item" data-profile-register hidden><span class="profile-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span><span><strong>New registration</strong><small>Add a runner</small></span></a>
      <button type="button" class="profile-menu-item danger" data-profile-signout hidden><span class="profile-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg></span><span><strong>Sign out</strong><small>End this device's session</small></span></button>
    </div>`;
  function setAvatar(node, username) { if (node) { node.innerHTML = avatarMarkup(username); node.classList.toggle("has-photo", !!avatarFor(username)); } }
  function renderProfile(username) {
    profileUser = username || "";
    document.querySelectorAll(".profile-mount").forEach(mount => {
      mount.querySelectorAll("[data-profile-name]").forEach(n => n.textContent = profileUser || "Admin sign in");
      mount.querySelectorAll("[data-profile-sub]").forEach(n => n.textContent = profileUser ? "Administrator account" : "Account menu");
      mount.querySelectorAll("[data-avatar]").forEach(n => setAvatar(n, profileUser));
      const signed = !!profileUser;
      ["settings", "public", "register", "signout"].forEach(action => { const b = mount.querySelector(`[data-profile-${action}]`); if (b) b.hidden = !signed; });
      const permissionState = KMRAuth.permissions();
      const canManageAdminAccounts = !!(signed && profileUser.toLowerCase() === "nsfida" && permissionState && permissionState.is_owner === true && permissionState.can_manage_admins === true);
      const accountsEntry = mount.querySelector("[data-profile-admin-accounts]");
      if (accountsEntry) accountsEntry.hidden = !canManageAdminAccounts;
      const signIn = mount.querySelector("[data-profile-signin]");
      if (signIn) signIn.href = routeHref("admin");
      const publicLink = mount.querySelector("[data-profile-public]");
      if (publicLink) publicLink.href = routeHref("participants");
      const registerLink = mount.querySelector("[data-profile-register]");
      if (registerLink) registerLink.href = routeHref("register");
      if (signIn) {
        signIn.hidden = false;
        const title = signIn.querySelector("strong"), sub = signIn.querySelector("small");
        if (title) title.textContent = signed ? "Admin control centre" : "Admin sign in";
        if (sub) sub.textContent = signed ? (KMRAuth.canFunds() ? "Manage registrations and funds" : "Manage registrations and results") : "Open organiser access";
      }
      mount.classList.toggle("is-signed-in", signed);
      const menu = mount.querySelector(".profile-menu"); if (menu) menu.hidden = true;
      const trigger = mount.querySelector(".profile-trigger"); if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  }
  function ensureProfileDialog() {
    if (document.getElementById("kmrProfileDialog")) return;
    const d = document.createElement("dialog"); d.id = "kmrProfileDialog"; d.className = "profile-dialog";
    d.innerHTML = `<form id="kmrProfileForm" method="dialog">
      <div class="profile-dialog-heading"><span class="profile-avatar large" id="kmrProfilePreview">${userIcon}</span><div><span class="eyebrow">ACCOUNT SETTINGS</span><h2>Profile &amp; security</h2><p class="dlg-sub">Signed in as <strong id="kmrProfileAccount"></strong></p></div></div>
      <section class="profile-setting"><h3>Profile picture</h3><p>Choose a professional avatar. This picture is stored on this browser for the signed-in admin.</p>
        <div class="profile-picture-actions"><label class="btn ghost" for="kmrProfileFile">Choose picture</label><input id="kmrProfileFile" type="file" accept="image/png,image/jpeg,image/webp" hidden><button type="button" class="btn ghost sm" id="kmrProfileRemovePhoto">Remove picture</button></div>
      </section>
      <section class="profile-setting"><h3>Change password</h3><p>Leave both fields blank to keep your current password. Use at least 8 characters.</p>
        <label for="kmrProfilePassword">New password</label><input id="kmrProfilePassword" type="password" autocomplete="new-password" minlength="8" placeholder="Enter a new password">
        <label for="kmrProfilePassword2">Confirm new password</label><input id="kmrProfilePassword2" type="password" autocomplete="new-password" minlength="8" placeholder="Enter it again">
      </section>
      <p id="kmrProfileError" class="msg bad" hidden></p>
      <div class="row"><button type="button" class="btn ghost" data-profile-close>Cancel</button><button type="submit" class="btn" id="kmrProfileSave">Save settings</button></div>
    </form>`;
    document.body.appendChild(d);
    d.querySelector("[data-profile-close]").onclick = () => d.close();
    d.addEventListener("click", e => { if (e.target === d) d.close(); });
    d.addEventListener("close", () => { avatarDraft = null; d.querySelector("#kmrProfileFile").value = ""; d.querySelector("#kmrProfilePassword").value = ""; d.querySelector("#kmrProfilePassword2").value = ""; });
    d.querySelector("#kmrProfileRemovePhoto").onclick = () => { avatarDraft = ""; d.querySelector("#kmrProfilePreview").innerHTML = userIcon; };
    d.querySelector("#kmrProfileFile").addEventListener("change", async e => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast("Choose a JPG, PNG or WebP image.", true); e.target.value = ""; return; }
      try {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onerror = () => reject(new Error("Could not read the image."));
          reader.onload = () => { const img = new Image(); img.onerror = () => reject(new Error("This image could not be opened.")); img.onload = () => {
            const max = 320, scale = Math.min(1, max / Math.max(img.width, img.height)); const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", .82));
          }; img.src = reader.result; }; reader.readAsDataURL(file);
        });
        avatarDraft = data; d.querySelector("#kmrProfilePreview").innerHTML = `<img src="${esc(data)}" alt="Selected profile picture" class="profile-photo">`;
      } catch (err) { toast(err.message || "Could not process this picture.", true); }
    });
    d.querySelector("#kmrProfileForm").addEventListener("submit", async e => {
      e.preventDefault(); const error = d.querySelector("#kmrProfileError"), btn = d.querySelector("#kmrProfileSave");
      error.hidden = true; const pass = d.querySelector("#kmrProfilePassword").value, pass2 = d.querySelector("#kmrProfilePassword2").value;
      if (pass || pass2) {
        if (pass.length < 8) { error.textContent = "The new password must contain at least 8 characters."; error.hidden = false; return; }
        if (pass !== pass2) { error.textContent = "The password confirmation does not match."; error.hidden = false; return; }
      }
      btn.disabled = true; const old = btn.textContent; btn.textContent = "Saving…";
      try {
        if (pass) {
          const { error: updateError } = await sb.auth.updateUser({ password: pass });
          if (updateError) throw updateError;
        }
        if (avatarDraft !== null) {
          if (avatarDraft) localStorage.setItem(AVATAR_PREFIX + profileUser, avatarDraft);
          else localStorage.removeItem(AVATAR_PREFIX + profileUser);
        }
        renderProfile(profileUser); d.close(); toast(pass ? "Profile saved and password updated." : "Profile settings saved.");
      } catch (err) { error.textContent = err.message || "Could not save profile settings."; error.hidden = false; }
      finally { btn.disabled = false; btn.textContent = old; }
    });
  }
  window.KMRProfile = {
    init() {
      if (profileReady) return; profileReady = true;
      const mounts = [...document.querySelectorAll(".profile-mount")];
      mounts.forEach(mount => {
        mount.classList.add("profile-wrap");
        mount.innerHTML = PROFILE_MENU;
        const trigger = mount.querySelector(".profile-trigger"), menu = mount.querySelector(".profile-menu");
        trigger.addEventListener("click", e => {
          e.stopPropagation(); const open = !menu.hidden;
          document.querySelectorAll(".profile-menu").forEach(m => m.hidden = true);
          document.querySelectorAll(".profile-trigger").forEach(b => b.setAttribute("aria-expanded", "false"));
          menu.hidden = open; trigger.setAttribute("aria-expanded", String(!open));
        });
        mount.querySelector("[data-profile-settings]").addEventListener("click", () => {
          ensureProfileDialog(); const d = document.getElementById("kmrProfileDialog"); avatarDraft = null;
          d.querySelector("#kmrProfileAccount").textContent = profileUser;
          d.querySelector("#kmrProfilePreview").innerHTML = avatarMarkup(profileUser);
          d.querySelector("#kmrProfileError").hidden = true;
          if (!d.open) d.showModal();
          menu.hidden = true; trigger.setAttribute("aria-expanded", "false");
        });
        mount.querySelector("[data-profile-signout]").addEventListener("click", async () => {
          menu.hidden = true; trigger.setAttribute("aria-expanded", "false"); await KMRAuth.signOut(); renderProfile("");
        });
        mount.querySelectorAll("[data-profile-signin], [data-profile-public], [data-profile-register]").forEach(link => link.addEventListener("click", () => { menu.hidden = true; }));
      });
      document.addEventListener("click", e => { if (e.target.closest(".profile-wrap")) return; document.querySelectorAll(".profile-menu").forEach(m => m.hidden = true); document.querySelectorAll(".profile-trigger").forEach(b => b.setAttribute("aria-expanded", "false")); });
      document.addEventListener("keydown", e => { if (e.key === "Escape") { document.querySelectorAll(".profile-menu").forEach(m => m.hidden = true); document.querySelectorAll(".profile-trigger").forEach(b => b.setAttribute("aria-expanded", "false")); } });
      renderProfile(KMRAuth.hint()); KMRAuth.onChange(renderProfile); KMRAuth.current().then(renderProfile);
    }
  };
  window.KMRProfile.init();
})();
