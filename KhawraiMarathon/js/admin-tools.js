// Shared admin actions used by the public list (index.html) and the admin page (admin.html).
// Every action is enforced by the database (RLS + RPC), these screens only call it.
(function () {
  const C = window.KMR, $ = id => document.getElementById(id);
  let ready = false;

  const HTML = `
<dialog id="kPay"><form method="dialog" id="kPayF"><h2>Confirm payment</h2><p class="dlg-sub" id="kPayWho"></p>
  <label for="kPa">Amount received (Rs.)</label><input id="kPa" type="number" min="1" step="1" inputmode="numeric" required>
  <label for="kPm">Mohallah</label><input id="kPm" required maxlength="100">
  <p class="msg bad" id="kPayE" hidden></p><div class="row"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn">Confirm payment</button></div></form></dialog>

<dialog id="kEdit"><form method="dialog" id="kEditF"><h2>Edit runner</h2><p class="dlg-sub" id="kEditWho"></p>
  <div class="two"><div><label for="kEn">Name</label><input id="kEn" required maxlength="100"></div><div><label for="kEf">Father's name</label><input id="kEf" required maxlength="100"></div></div>
  <div class="two"><div><label for="kEc">CNIC / B-Form</label><input id="kEc" required inputmode="numeric" maxlength="15" placeholder="35202-1234567-1"></div><div><label for="kEm">Mobile</label><input id="kEm" type="tel" required maxlength="12" placeholder="03XX-XXXXXXX"></div></div>
  <div class="two"><div><label for="kEg">Gender</label><select id="kEg"><option>Male</option><option>Female</option></select></div><div><label for="kEd">Date of birth</label><input id="kEd" type="date" required></div></div>
  <label for="kEe">Email</label><input id="kEe" type="email" maxlength="150">
  <label for="kEa">Permanent address</label><input id="kEa" required maxlength="200">
  <div class="two"><div><label for="kEt">District / Tehsil</label><input id="kEt" required maxlength="100"></div><div><label for="kEs">Sport</label><input id="kEs" required maxlength="100"></div></div>
  <label for="kEp">Payment receipt / reference</label><input id="kEp" maxlength="80">
  <p class="msg bad" id="kEditE" hidden></p><div class="row"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn">Save changes</button></div></form></dialog>

<dialog id="kFund"><form method="dialog" id="kFundF"><h2 id="kFundH">Funds received</h2>
  <label for="kFn">Name</label><input id="kFn" required maxlength="100"><label for="kFm">Mohallah</label><input id="kFm" required maxlength="100">
  <label for="kFa">Amount (Rs.)</label><input id="kFa" type="number" min="1" step="1" inputmode="numeric" required>
  <p class="msg bad" id="kFundE" hidden></p><div class="row"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" id="kFundB">Save entry</button></div></form></dialog>

<dialog id="kDet"><div id="kDetB"></div><div class="row"><button type="button" class="btn ghost" data-close>Close</button></div></dialog>`;

  function init() {
    if (ready) return; ready = true;
    const w = document.createElement("div"); w.innerHTML = HTML; document.body.append(...w.children);
    document.querySelectorAll("dialog [data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());
    document.querySelectorAll("dialog").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));
    $("kEc").addEventListener("input", e => { const d = e.target.value.replace(/\D/g, "").slice(0, 13); e.target.value = d.length > 12 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; });
    $("kEm").addEventListener("input", e => { const d = e.target.value.replace(/\D/g, "").slice(0, 11); e.target.value = d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d; });
  }
  const fmtCnic = d => { d = String(d || ""); return d.length === 13 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : d; };
  const fmtMob = d => { d = String(d || ""); return d.length === 11 ? `${d.slice(0, 4)}-${d.slice(4)}` : d; };
  const busy = (form, on) => form.querySelectorAll("button").forEach(b => b.disabled = on);

  // ---- confirm / unconfirm ----
  let payRow = null, payDone = null;
  function pay(r, done) {
    init(); payRow = r; payDone = done;
    $("kPayWho").textContent = `${r.reg_no} · ${r.name}`; $("kPa").value = C.FEE; $("kPm").value = r.district_tehsil || ""; $("kPayE").hidden = true;
    $("kPay").showModal(); $("kPa").select();
    $("kPayF").onsubmit = async e => {
      e.preventDefault(); busy($("kPayF"), true);
      const { error } = await sb.rpc("confirm_payment", { p_id: payRow.id, p_amount: Number($("kPa").value), p_mohallah: $("kPm").value.trim() });
      busy($("kPayF"), false);
      if (error) { $("kPayE").textContent = "Not saved: " + error.message; $("kPayE").hidden = false; return; }
      $("kPay").close(); toast(`${payRow.reg_no} confirmed`); payDone && payDone();
    };
  }
  async function unconfirm(r, done) {
    if (!confirm(`Mark ${r.reg_no} as pending? Its fee entry will be removed from the project funds.`)) return;
    const { error } = await sb.rpc("unconfirm_payment", { p_id: r.id });
    if (error) return toast("Not allowed: " + error.message, true);
    toast(`${r.reg_no} marked pending`); done && done();
  }

  // ---- edit ----
  function edit(r, done) {
    init();
    $("kEditWho").textContent = `${r.reg_no} · registered ${fmtDate(r.created_at)}`;
    $("kEn").value = r.name || ""; $("kEf").value = r.father_name || ""; $("kEc").value = fmtCnic(r.cnic); $("kEm").value = fmtMob(r.mobile);
    $("kEg").value = r.gender || "Male"; $("kEd").value = r.dob || ""; $("kEe").value = r.email || ""; $("kEa").value = r.address || "";
    $("kEt").value = r.district_tehsil || ""; $("kEs").value = r.sport || ""; $("kEp").value = r.payment_ref || ""; $("kEditE").hidden = true;
    $("kEd").max = new Date().toISOString().slice(0, 10);
    $("kEdit").showModal();
    $("kEditF").onsubmit = async e => {
      e.preventDefault(); const bad = m => { $("kEditE").textContent = m; $("kEditE").hidden = false; };
      const cnic = $("kEc").value.replace(/\D/g, ""), mobile = $("kEm").value.replace(/\D/g, "");
      if (cnic.length !== 13) return bad("CNIC/B-Form number must have 13 digits.");
      if (mobile.length !== 11) return bad("Mobile number must have 11 digits.");
      const upd = { name: $("kEn").value.trim(), father_name: $("kEf").value.trim(), cnic, mobile, email: $("kEe").value.trim() || null, gender: $("kEg").value, dob: $("kEd").value,
        address: $("kEa").value.trim(), district_tehsil: $("kEt").value.trim(), sport: $("kEs").value.trim(), payment_ref: $("kEp").value.trim() || null };
      busy($("kEditF"), true);
      const { data, error } = await sb.from("registrations").update(upd).eq("id", r.id).select();
      busy($("kEditF"), false);
      if (error) return bad(error.code === "23505" ? "Another runner already has this CNIC/B-Form number." : "Not saved: " + error.message);
      if (!data || !data.length) return bad("Not saved: you are not allowed to edit this entry. Sign in again.");
      Object.assign(r, data[0]); $("kEdit").close(); toast(`${r.reg_no} updated`); done && done(r);
    };
  }

  // ---- delete ----
  async function remove(r, done) {
    if (!confirm(`Delete ${r.reg_no} (${r.name})? This cannot be undone.`)) return;
    const { data, error } = await sb.from("registrations").delete().eq("id", r.id).select();
    if (error || !data.length) return toast("Delete was not allowed.", true);
    const rm = async (bk, ps) => { const l = ps.filter(Boolean); if (l.length) await sb.storage.from(bk).remove(l); };
    await rm("photos", [r.photo_path]); await rm("originals", [r.photo_original_path, r.cnic_front_original_path, r.cnic_back_original_path]);
    await rm("documents", [r.cnic_front_path, r.cnic_back_path, r.certificate_path, r.other_doc_path, r.signature_path]);
    toast(`${r.reg_no} deleted`); done && done(r);
  }

  // ---- PDF (jsPDF and pdf.js load only when first needed) ----
  const loadScript = src => new Promise((res, rej) => { if ([...document.scripts].some(s => s.src.endsWith(src))) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load " + src)); document.head.appendChild(s); });
  async function pdf(list, name, btn) {
    const old = btn && btn.textContent; if (btn) btn.disabled = true;
    try {
      if (!window.jspdf) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
      if (!window.KMRPDF) await loadScript("js/pdf.js");
      const doc = await KMRPDF.build(list, (i, n) => { if (btn) btn.textContent = `Building ${i}/${n}…`; });
      doc.save(name);
    } catch (e) { toast("PDF failed: " + e.message, true); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }

  // ---- files & details ----
  async function details(r, all) {
    init(); const box = $("kDetB"); box.innerHTML = `<h2>${esc(r.name)}</h2><p class="dlg-sub">${esc(r.reg_no)} · loading files…</p>`; $("kDet").showModal();
    const ext = p => (p.split(".").pop() || "jpg").toLowerCase(), fn = (k, p) => `${r.reg_no}_${slug(r.name)}_${k}.${ext(p)}`;
    const dls = [["Photo", "photo", r.photo_original_path, "originals", r.photo_path, "photos"], ["CNIC front", "cnic_front", r.cnic_front_original_path, "originals", r.cnic_front_path, "documents"], ["CNIC back", "cnic_back", r.cnic_back_original_path, "originals", r.cnic_back_path, "documents"]];
    const urls = [];
    const dl = await Promise.all(dls.map(async ([l, k, op, ob, sp, sb2]) => {
      const orig = !!op, path = orig ? op : sp, bk = orig ? ob : sb2;
      const { data } = await sb.storage.from(bk).createSignedUrl(path, 600, { download: fn(k, path) });
      if (!data) return ""; urls.push(data.signedUrl);
      return `<a class="chipl" href="${esc(data.signedUrl)}">${l}<small>${orig ? "original" : "standard"}</small></a>`;
    }));
    const items = [["Certificate", r.certificate_path], ["Other document", r.other_doc_path], ["Signature", r.signature_path]].filter(i => i[1]);
    const vw = await Promise.all(items.map(async ([l, p]) => { const { data } = await sb.storage.from("documents").createSignedUrl(p, 300); return data ? `<a class="chipl" target="_blank" rel="noopener" href="${esc(data.signedUrl)}">View ${l}</a>` : ""; }));
    const same = (all || []).filter(x => x.id !== r.id && x.fingerprint && x.fingerprint === r.fingerprint).map(x => x.reg_no);
    const where = r.lat != null ? `<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${r.lat},${r.lng}">Open location in Google Maps</a> <small>(${Number(r.lat).toFixed(5)}, ${Number(r.lng).toFixed(5)}, about ${Math.round(r.location_accuracy || 0)} m)</small>` : "No location recorded";
    const by = r.entered_by ? `Recorded by admin ${r.entered_by}` : `Self-registered, device ${(r.device_id || "—").slice(0, 8)}${r.device_id ? "…" : ""}`;
    box.innerHTML = `<h2>${esc(r.name)}</h2><p class="dlg-sub">${esc(r.reg_no)} · ${r.status === "confirmed" ? "Confirmed" : "Pending"} · ${esc(by)}</p>
      <dl class="kv"><dt>Father</dt><dd>${esc(r.father_name)}</dd><dt>CNIC</dt><dd>${esc(fmtCnic(r.cnic))}</dd><dt>Mobile</dt><dd>${esc(fmtMob(r.mobile))}</dd>${r.email ? `<dt>Email</dt><dd>${esc(r.email)}</dd>` : ""}
      <dt>Born</dt><dd>${fmtDate(r.dob)} · ${esc(r.gender)}</dd><dt>Address</dt><dd>${esc(r.address)}, ${esc(r.district_tehsil)}</dd><dt>Sport</dt><dd>${esc(r.sport)}</dd><dt>Receipt</dt><dd>${esc(r.payment_ref || "—")}</dd><dt>Location</dt><dd>${where}</dd></dl>
      ${same.length ? `<p class="msg bad">Same device fingerprint as ${esc(same.join(", "))} — please review.</p>` : ""}
      <div class="chiprow">${dl.join("")}${vw.join("")}</div>${urls.length ? '<p><button class="btn sm alt" id="kDlAll">Download all 3</button></p>' : ""}`;
    const b = $("kDlAll"); if (b) b.onclick = () => urls.forEach((u, n) => setTimeout(() => { const x = document.createElement("a"); x.href = u; x.download = ""; document.body.appendChild(x); x.click(); x.remove(); }, n * 700));
  }

  // ---- project funds ----
  function fund(f, done) {
    init(); $("kFundH").textContent = f ? "Edit entry" : "Funds received"; $("kFundE").hidden = true;
    $("kFn").value = f ? f.donor_name : ""; $("kFm").value = f ? f.mohallah : ""; $("kFa").value = f ? Math.round(f.amount) : "";
    $("kFund").showModal(); $("kFn").focus();
    $("kFundF").onsubmit = async e => {
      e.preventDefault(); const row = { donor_name: $("kFn").value.trim(), mohallah: $("kFm").value.trim(), amount: Math.round(Number($("kFa").value)) };
      busy($("kFundF"), true);
      const q = f ? sb.from("funds").update(row).eq("id", f.id).select() : sb.from("funds").insert({ ...row, source: "donation" }).select();
      const { data, error } = await q; busy($("kFundF"), false);
      if (error || !data || !data.length) { $("kFundE").textContent = "Not saved: " + (error ? error.message : "not allowed"); $("kFundE").hidden = false; return; }
      $("kFund").close(); toast(f ? "Entry updated" : "Entry saved"); done && done();
    };
  }
  async function removeFund(f, done) {
    if (!confirm(`Delete the entry of ${f.donor_name} (${rs(f.amount)})?`)) return;
    const { data, error } = await sb.from("funds").delete().eq("id", f.id).select();
    if (error || !data.length) return toast("Delete was not allowed.", true);
    toast("Entry deleted"); done && done();
  }

  window.KMRAdmin = { init, pay, unconfirm, edit, remove, pdf, details, fund, removeFund };
})();
