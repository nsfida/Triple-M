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
})();
