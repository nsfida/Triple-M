(function () {
  const C = window.KMR;

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

  const nameOf = s => { const em = s && s.user && s.user.email; const u = em ? em.split("@")[0] : ""; return C.ADMINS.includes(u) ? u : ""; };
  const listeners = [];
  const KMRAuth = {
    // instant, no network: who was signed in last time (used to avoid a flash of the sign-in form)
    hint: () => storage.getItem(HINT_KEY) || "",
    // verified: reads the stored session (refreshing the token if needed)
    async current() {
      try { const { data } = await sb.auth.getSession(); const u = nameOf(data.session); u ? storage.setItem(HINT_KEY, u) : storage.removeItem(HINT_KEY); return u; }
      catch (e) { return ""; }
    },
    async signIn(username, password) {
      const u = String(username || "").trim().toLowerCase();
      if (!C.ADMINS.includes(u)) return { error: "Wrong username or password." };
      const { error } = await sb.auth.signInWithPassword({ email: `${u}@${C.EMAIL_DOMAIN}`, password });
      if (error) return { error: "Wrong username or password." };
      storage.setItem(HINT_KEY, u); return { user: u };
    },
    async signOut() { storage.removeItem(HINT_KEY); try { await sb.auth.signOut({ scope: "local" }); } catch (e) {} },
    onChange(cb) { listeners.push(cb); }
  };
  window.KMRAuth = KMRAuth;
  const fire = async () => { const u = await KMRAuth.current(); listeners.forEach(f => f(u)); };
  // another tab signed in or out, or the token was refreshed/expired
  sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") setTimeout(fire, 0); });
  window.addEventListener("storage", e => { if (e.key === AUTH_KEY || e.key === HINT_KEY) fire(); });

  // ---- helpers -----------------------------------------------------------------
  window.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  window.photoUrl = p => p ? `${C.SUPABASE_URL}/storage/v1/object/public/photos/${p}` : "";
  window.fmtDate = d => { const x = new Date(d); return isNaN(x) ? "" : String(x.getDate()).padStart(2, "0") + "/" + String(x.getMonth() + 1).padStart(2, "0") + "/" + x.getFullYear(); };
  window.ageOf = d => { const b = new Date(d), n = new Date(); if (isNaN(b)) return null; let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
  window.rs = n => "Rs. " + Number(n).toLocaleString("en-US");
  window.slug = s => String(s).replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  window.toast = (msg, bad) => {
    let t = document.getElementById("toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    t.textContent = msg; t.className = "show" + (bad ? " bad" : ""); clearTimeout(t._t); t._t = setTimeout(() => t.className = "", bad ? 6000 : 3200);
  };


  // ---- local-first cache and shared loading / connection UI -------------------
  // Public directory data may be cached persistently. Admin records use sessionStorage
  // because they contain private contact information. Pending registration payloads
  // and uploaded-file blobs are stored in IndexedDB by register.html.
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
  const userIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.7"></circle><path d="M4.6 20c.55-3.5 3.4-5.4 7.4-5.4s6.85 1.9 7.4 5.4"></path></svg>';
  let profileReady = false, profileUser = "", avatarDraft = null;
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
      <a href="admin.html" class="profile-menu-item" data-profile-signin><span class="profile-menu-icon">↗</span><span><strong>Admin sign in</strong><small>Open organiser access</small></span></a>
      <button type="button" class="profile-menu-item" data-profile-settings hidden><span class="profile-menu-icon">⚙</span><span><strong>Profile &amp; security</strong><small>Picture and password</small></span></button>
      <a href="index.html" class="profile-menu-item" data-profile-public hidden><span class="profile-menu-icon">⌂</span><span><strong>Public participants</strong><small>View the runner directory</small></span></a>
      <a href="register.html" class="profile-menu-item" data-profile-register hidden><span class="profile-menu-icon">＋</span><span><strong>New registration</strong><small>Add a runner</small></span></a>
      <button type="button" class="profile-menu-item danger" data-profile-signout hidden><span class="profile-menu-icon">⇥</span><span><strong>Sign out</strong><small>End this device's session</small></span></button>
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
      const signIn = mount.querySelector("[data-profile-signin]");
      if (signIn) {
        signIn.hidden = false;
        const title = signIn.querySelector("strong"), sub = signIn.querySelector("small");
        if (title) title.textContent = signed ? "Admin control centre" : "Admin sign in";
        if (sub) sub.textContent = signed ? "Manage registrations and funds" : "Open organiser access";
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
