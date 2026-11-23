/* Triplem Drive - Main Admin activation dialog (loaded only when the Main Admin uses it).
 * Switching Triplem Drive on needs a public page address; the address is checked on the server
 * as it is typed (format, reserved words, unique) and saved with app_admin_drive_set, which records
 * who changed what. The same dialog changes the address later.
 */
(function (global) {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const suggest = u => String(u?.company_name || u?.settings?.Company || u?.display_name || u?.username || "")
    .toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/[_\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  let box = null, timer = 0, seq = 0;

  function close() { if (box) { box.remove(); box = null; } }

  function open({ mode = "enable", user, drive = {}, rpc, host, onSaved }) {
    close();
    const enable = mode === "enable";
    const initial = drive.slug || suggest(user);
    box = document.createElement("div");
    box.className = "td-adlg";
    box.innerHTML = `<div class="td-adlg-backdrop" data-td-x></div>
      <div class="td-adlg-card" role="dialog" aria-modal="true" aria-labelledby="tdAdlgTitle">
        <div class="td-adlg-head">
          <span class="td-adlg-ico" aria-hidden="true"><i class="fa-solid fa-car-side"></i></span>
          <div><strong id="tdAdlgTitle">${enable ? "Switch on Triplem Drive" : "Public page address"}</strong>
            <small>${esc(user?.username || "")}${user?.company_name ? " · " + esc(user.company_name) : ""}</small></div>
          <button type="button" class="td-adlg-x" data-td-x aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
        <div class="td-adlg-body">
          ${enable ? `<p class="td-adlg-lead">The account gets Fleet Management &amp; Vehicle Bookings on its Home screen and a public booking page at the address below. You can change the address later.</p>` : `<p class="td-adlg-lead">Links to the old address keep working and open the new one.</p>`}
          <label class="td-adlg-field"><span>Public page address</span>
            <span class="td-adlg-url"><em>${esc(location.host || "triplem.vip")}/triplemdrive/</em><input type="text" value="${esc(initial)}" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="url" data-td-slug aria-describedby="tdAdlgMsg"><em>/</em></span>
          </label>
          <p class="td-adlg-msg" id="tdAdlgMsg" data-td-msg role="status">Lowercase letters, numbers and hyphens · 3 to 40 characters.</p>
          <label class="td-adlg-check"><input type="checkbox" data-td-root${drive.is_root ? " checked" : ""}>
            <span><b>Also open this business at ${esc(location.host || "triplem.vip")}/triplemdrive/</b><small>Only one business can have the plain address. Choosing it here moves it from any other business.</small></span></label>
        </div>
        <div class="td-adlg-foot">
          <button type="button" class="aum-btn" data-td-x>Cancel</button>
          <button type="button" class="aum-btn is-primary" data-td-save disabled><i class="fa-solid fa-check" aria-hidden="true"></i> ${enable ? "Switch on" : "Save address"}</button>
        </div>
      </div>`;
    (host || document.body).appendChild(box);
    const input = box.querySelector("[data-td-slug]"), msg = box.querySelector("[data-td-msg]"), save = box.querySelector("[data-td-save]"), root = box.querySelector("[data-td-root]");
    let okSlug = "";

    const show = (text, tone) => { msg.textContent = text; msg.className = `td-adlg-msg${tone ? " is-" + tone : ""}`; };
    async function check() {
      const v = input.value.trim().toLowerCase();
      okSlug = ""; save.disabled = true;
      if (!v) return show("Enter an address.", "bad");
      if (!enable && v === drive.slug && !!root.checked === !!drive.is_root) return show("This is the current address.", "");
      const my = ++seq;
      show("Checking…", "");
      try {
        const r = await rpc("app_admin_drive_check_slug", { p_user_id: user.id, p_slug: v });
        if (my !== seq || !box) return;
        if (r?.ok) { okSlug = r.slug; save.disabled = false; show(`Available: ${location.host || "triplem.vip"}/triplemdrive/${r.slug}/`, "ok"); }
        else show(r?.message || "This address cannot be used.", "bad");
      } catch (e) { if (my === seq && box) show(String(e?.message || e).replace(/^Error:\s*/, ""), "bad"); }
    }
    input.addEventListener("input", () => {
      const clean = input.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (clean !== input.value) input.value = clean;
      clearTimeout(timer); timer = setTimeout(check, 280);
    });
    root.addEventListener("change", check);
    box.addEventListener("click", async e => {
      if (e.target.closest("[data-td-x]")) return close();
      if (!e.target.closest("[data-td-save]") || save.disabled || !okSlug) return;
      save.disabled = true; save.classList.add("is-busy");
      try {
        const res = await rpc("app_admin_drive_set", { p_user_id: user.id, p_enabled: true, p_slug: okSlug, p_is_root: !!root.checked });
        close();
        onSaved?.(res);
      } catch (err) {
        save.classList.remove("is-busy"); save.disabled = false;
        show(String(err?.message || err).replace(/^Error:\s*/, ""), "bad");
      }
    });
    box.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    setTimeout(() => { input.focus(); input.select(); }, 30);
    check();
  }

  global.TriplemDriveAdminDialog = Object.freeze({ open, close });
})(window);
