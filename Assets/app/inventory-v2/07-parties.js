/* Triplem VIP Inventory 2.0 - Phase 5: Customers and Suppliers.
 *
 * Separate Inventory 2.0 lists (not the Accounting contacts). Each customer or
 * supplier can optionally be linked to an Accounting contact by the owner; nothing
 * is merged automatically. Balances come from documents and payments on the server.
 * Shared here: the payment window used by Customers, Suppliers, Orders and
 * Outstanding Balances.
 */
(function () {
  "use strict";
  const I = () => window.TriplemInv2;
  const Shell = () => window.TriplemInventoryV2Shell;
  const Pr = () => window.TriplemInv2Print;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LABEL = { customer: ["Customer", "Customers", "fa-user-group"], supplier: ["Supplier", "Suppliers", "fa-handshake"] };
  const L = { customer: { query: "", status: "active", offset: 0 }, supplier: { query: "", status: "active", offset: 0 } };
  const LIMIT = 50;

  function view(kind) {
    return async function render(el) {
      await I().loadBoot();
      if (I().needsSetup(el)) return;
      const [one, many, icon] = LABEL[kind], st = L[kind];
      el.innerHTML = `
        <div class="inv2-section-head inv2-head-row"><h1><i class="fa-solid ${icon}" aria-hidden="true"></i> ${many}</h1>
          ${I().canEdit() ? `<button type="button" class="inv2-btn primary" data-add><i class="fa-solid fa-plus" aria-hidden="true"></i> Add ${one.toLowerCase()}</button>` : ""}</div>
        <div class="inv2-toolbar">
          <label class="inv2-search inv2-search-inline"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="Search name, phone, code or email" value="${esc(st.query)}" aria-label="Search ${many.toLowerCase()}"></label>
          <div class="inv2-seg inv2-seg-lg" role="tablist">${[["active", "Active"], ...(kind === "customer" ? [["owing", "Owing"]] : []), ["archived", "Archived"]].map(([k, v]) => `<button type="button" role="tab" data-st="${k}" aria-selected="${st.status === k}">${v}</button>`).join("")}</div>
        </div>
        <section class="inv2-card inv2-table-card"><div data-rows><div class="inv2-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading…</div></div></section>`;
      const q = el.querySelector("[data-q]"); let t = 0;
      q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { st.query = q.value.trim(); st.offset = 0; rows(kind, el); }, 260); });
      el.querySelectorAll("[data-st]").forEach(b => b.addEventListener("click", () => { st.status = b.dataset.st; st.offset = 0; el.querySelectorAll("[data-st]").forEach(x => x.setAttribute("aria-selected", String(x === b))); rows(kind, el); }));
      el.querySelector("[data-add]")?.addEventListener("click", () => editParty(kind, null, () => rows(kind, el)));
      await rows(kind, el);
    };
  }

  async function rows(kind, el) {
    const box = el.querySelector("[data-rows]"), st = L[kind];
    let r;
    try { r = await I().rpc("app_inv2_parties_list", { p_kind: kind, p_search: st.query || null, p_status: st.status === "owing" ? "active" : st.status, p_limit: LIMIT, p_offset: st.offset }); }
    catch (e) { box.innerHTML = `<div class="inv2-alert inv2-alert-error">${esc(e.message || e)}</div>`; return; }
    let list = r.rows;
    if (st.status === "owing") list = list.filter(x => Number(x.balance) > 0);
    if (!list.length) { box.innerHTML = `<div class="inv2-empty"><i class="fa-solid ${LABEL[kind][2]}" aria-hidden="true"></i><p>${st.query ? "Nothing matches." : `No ${LABEL[kind][1].toLowerCase()} yet.`}</p></div>`; return; }
    box.innerHTML = `<div class="inv2-table inv2-table-party" role="table">
      <div class="inv2-tr inv2-th" role="row"><span>Name</span><span>Phone</span><span>Terms</span><span class="num">Credit limit</span><span class="num">Balance</span></div>
      ${list.map((p, i) => `<button type="button" class="inv2-tr" role="row" data-open="${i}">
        <span class="inv2-prod" role="cell"><span class="inv2-ico-tile sm"><i class="fa-solid ${kind === "customer" ? "fa-user" : "fa-truck"}" aria-hidden="true"></i></span><span><strong dir="auto">${esc(p.name)}</strong><small>${esc(p.code || p.email || "")}</small></span></span>
        <span role="cell">${esc(p.phone || "—")}</span><span role="cell">${p.payment_terms_days ? `${p.payment_terms_days} days` : "Cash"}</span>
        <span role="cell" class="num">${p.credit_limit != null ? esc(I().money(p.credit_limit)) : "—"}</span>
        <span role="cell" class="num"><strong class="${Number(p.balance) > 0 ? (kind === "customer" ? "warn" : "") : Number(p.balance) < 0 ? "ok" : ""}">${esc(I().money(p.balance))}</strong></span></button>`).join("")}</div>
      <div class="inv2-pager"><span>${st.offset + 1}–${st.offset + r.rows.length} of ${r.total}</span>
        <button type="button" class="inv2-btn small" data-prev${st.offset === 0 ? " disabled" : ""}>Previous</button>
        <button type="button" class="inv2-btn small" data-next${st.offset + r.rows.length >= r.total ? " disabled" : ""}>Next</button></div>`;
    box.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openParty(kind, list[Number(b.dataset.open)].id, () => rows(kind, el))));
    box.querySelector("[data-prev]")?.addEventListener("click", () => { st.offset = Math.max(0, st.offset - LIMIT); rows(kind, el); });
    box.querySelector("[data-next]")?.addEventListener("click", () => { st.offset += LIMIT; rows(kind, el); });
  }

  function editParty(kind, p, after) {
    const [one] = LABEL[kind];
    const owner = I().isOwner();
    I().dialog({
      title: p ? `Edit ${one.toLowerCase()}` : `Add ${one.toLowerCase()}`, submitLabel: "Save",
      body: `<div class="inv2-form-grid">
        <label class="inv2-field wide">Name *<input class="inv2-input" name="name" maxlength="120" required value="${esc(p?.name || "")}" dir="auto"></label>
        <label class="inv2-field">Phone<input class="inv2-input" name="phone" type="tel" maxlength="40" value="${esc(p?.phone || "")}"></label>
        <label class="inv2-field">Email<input class="inv2-input" name="email" type="email" maxlength="120" value="${esc(p?.email || "")}"></label>
        <label class="inv2-field">Code<input class="inv2-input" name="code" maxlength="30" value="${esc(p?.code || "")}" placeholder="Optional"></label>
        <label class="inv2-field">Tax number (TRN)<input class="inv2-input" name="tax_number" maxlength="40" value="${esc(p?.tax_number || "")}"></label>
        <label class="inv2-field wide">Address<textarea class="inv2-input" name="address" rows="2" maxlength="400" dir="auto">${esc(p?.address || "")}</textarea></label>
        <label class="inv2-field">Payment terms (days)<input class="inv2-input" name="terms" type="number" min="0" max="3650" step="1" value="${esc(p?.payment_terms_days ?? 0)}"><small>0 = pay at once</small></label>
        <label class="inv2-field">Credit limit<input class="inv2-input" name="limit" type="number" min="0" step="0.01" value="${esc(p?.credit_limit ?? "")}" placeholder="No limit"></label>
        <label class="inv2-field">Opening balance<input class="inv2-input" name="opening" type="number" step="0.01" value="${esc(p?.opening_balance ?? 0)}"${p && !owner ? " disabled" : ""}><small>${kind === "customer" ? "What they owed you before Inventory 2.0" : "What you owed them before Inventory 2.0"}${p && !owner ? " · owner only" : ""}</small></label>
        <label class="inv2-field wide">Notes<textarea class="inv2-input" name="notes" rows="2" maxlength="1000">${esc(p?.notes || "")}</textarea></label>
        ${owner ? `<label class="inv2-field wide">Linked Accounting contact <select class="inv2-input" name="acct" data-acct><option value="">Not linked</option></select><small>Optional. Postings to Accounting carry this contact; the two lists are never merged.</small></label>` : ""}
      </div>`,
      async onOpen(f) {
        const sel = f.querySelector("[data-acct]");
        if (!sel) return;
        try {
          // The owner's Accounting contacts (read through the same access rules as the Accounting module).
          const res = typeof supabase === "function" ? await supabase("accounting_contacts?select=id,name,contact_type,is_active&is_active=eq.true&order=name.asc&limit=500").catch(() => []) : [];
          const rowsA = (Array.isArray(res) ? res : []).filter(c => kind === "customer" ? c.contact_type !== "supplier" : c.contact_type !== "customer");
          sel.insertAdjacentHTML("beforeend", rowsA.map(c => `<option value="${esc(c.id)}"${c.id === p?.accounting_contact_id ? " selected" : ""}>${esc(c.name)}</option>`).join(""));
          if (p?.accounting_contact_id && !rowsA.some(c => c.id === p.accounting_contact_id)) sel.insertAdjacentHTML("beforeend", `<option value="${esc(p.accounting_contact_id)}" selected>Linked contact</option>`);
          if (!rowsA.length && !p?.accounting_contact_id) sel.closest("label").hidden = true;
        } catch (_) { sel.closest("label").hidden = true; }
      },
      async onSubmit(f) {
        const body = { id: p?.id || null, name: f.name.value.trim(), phone: f.phone.value, email: f.email.value, code: f.code.value, tax_number: f.tax_number.value, address: f.address.value,
          payment_terms_days: f.terms.value || 0, credit_limit: f.limit.value, notes: f.notes.value, accounting_contact_id: f.acct ? f.acct.value : (p?.accounting_contact_id || "") };
        if (!p || owner) body.opening_balance = f.opening.value || 0;
        if (!body.name) throw new Error("Enter a name.");
        const saved = await I().rpc("app_inv2_party_save", { p_kind: kind, p_party: body });
        Shell().toast(`${one} saved.`);
        after && after(saved);
      }
    });
  }

  async function openParty(kind, id, after) {
    let p;
    try { p = await I().rpc("app_inv2_party_get", { p_kind: kind, p_id: id }); } catch (e) { Shell().toast(e.message || String(e)); return; }
    const [one] = LABEL[kind];
    const bal = Number(p.balance);
    const balNote = kind === "customer" ? (bal > 0 ? "owes you" : bal < 0 ? "has a credit with you" : "nothing owed") : (bal > 0 ? "you owe" : bal < 0 ? "credit in your favour" : "nothing owed");
    const st = [...(p.statement || [])].sort((a, b) => String(b.d).localeCompare(String(a.d)) || String(b.created_at).localeCompare(String(a.created_at)));
    const d = I().dialog({
      title: p.name, subtitle: [one, p.phone, p.email].filter(Boolean).join(" · "), wide: true,
      body: `<div class="inv2-party">
        <div class="inv2-party-top">
          <div class="inv2-party-bal ${bal > 0 && kind === "customer" ? "warn" : ""}"><span>Balance</span><strong>${esc(I().money(bal))}</strong><small>${balNote}</small></div>
          <div class="inv2-party-facts">${p.payment_terms_days ? `<span>Terms ${p.payment_terms_days} days</span>` : "<span>Pays at once</span>"}${p.credit_limit != null ? `<span>Limit ${esc(I().money(p.credit_limit))}</span>` : ""}${p.tax_number ? `<span>TRN ${esc(p.tax_number)}</span>` : ""}${p.is_active ? "" : `<span class="inv2-badge muted">Archived</span>`}</div>
          <div class="inv2-actions">
            ${I().canEdit() ? `<button type="button" class="inv2-btn primary small" data-pay><i class="fa-solid fa-${kind === "customer" ? "hand-holding-dollar" : "money-bill-transfer"}" aria-hidden="true"></i> ${kind === "customer" ? "Receive payment" : "Pay supplier"}</button>` : ""}
            <button type="button" class="inv2-btn small" data-stmt><i class="fa-solid fa-print" aria-hidden="true"></i> Statement</button>
            ${I().canEdit() ? `<button type="button" class="inv2-btn small" data-edit><i class="fa-solid fa-pen" aria-hidden="true"></i> Edit</button>` : ""}
            ${I().canDelete() ? `<button type="button" class="inv2-btn small ${p.is_active ? "danger-ghost" : ""}" data-arch>${p.is_active ? "Archive" : "Restore"}</button>` : ""}
          </div></div>
        ${(p.open_documents || []).length ? `<h3 class="inv2-sub">Open ${kind === "customer" ? "invoices" : "bills"}</h3><div class="inv2-mini-table">${p.open_documents.map(o => `<button type="button" data-doc="${esc(o.id)}"><span>${esc(o.doc_no)}${o.supplier_ref ? ` · ${esc(o.supplier_ref)}` : ""}</span><span>${esc(I().dateTime(o.doc_date).split(",")[0])}${o.due_date ? ` · due ${esc(o.due_date)}` : ""}</span><span class="num">${esc(I().money(o.total))}</span><strong class="num warn">${esc(I().money(o.due))}</strong></button>`).join("")}</div>` : ""}
        <h3 class="inv2-sub">Statement</h3>
        ${st.length ? `<div class="inv2-mini-table">${st.map(r => `<button type="button" data-st-id="${esc(r.id)}" data-st-kind="${esc(r.kind)}"><span>${esc(r.d)}</span><span>${esc(r.kind)} · ${esc(r.doc_no)}</span><span class="num">${Number(r.debit) ? esc(I().money(r.debit)) : ""}</span><span class="num ok">${Number(r.credit) ? esc(I().money(r.credit)) : ""}</span></button>`).join("")}</div>` : `<p class="inv2-note">No documents or payments yet. Opening balance ${esc(I().money(p.opening_balance))}.</p>`}
      </div>`,
      onOpen(f) {
        f.querySelector("[data-pay]")?.addEventListener("click", () => { d.close(true); paymentDialog(kind, p, () => { after && after(); openParty(kind, id, after); }); });
        f.querySelector("[data-stmt]").addEventListener("click", () => Pr().print(Pr().statementHtml(p)));
        f.querySelector("[data-edit]")?.addEventListener("click", () => { d.close(true); editParty(kind, p, () => { after && after(); openParty(kind, id, after); }); });
        f.querySelector("[data-arch]")?.addEventListener("click", async () => {
          if (p.is_active && !confirm(`Archive ${p.name}? History and balances are kept.`)) return;
          try { await I().rpc("app_inv2_party_save", { p_kind: kind, p_party: { ...p, is_active: !p.is_active, opening_balance: undefined } }); d.close(true); after && after(); } catch (e) { f.querySelector("[data-error]").textContent = e.message; }
        });
        f.querySelectorAll("[data-doc]").forEach(b => b.addEventListener("click", () => { d.close(true); kind === "customer" ? window.TriplemInv2Sales?.openSale(b.dataset.doc) : window.TriplemInv2Purchases?.openPurchase(b.dataset.doc); }));
        f.querySelectorAll("[data-st-id]").forEach(b => b.addEventListener("click", () => {
          const k = b.dataset.stKind;
          if (/Sale|Return/.test(k) && kind === "customer") { d.close(true); window.TriplemInv2Sales?.openSale(b.dataset.stId); }
          else if (/Purchase/.test(k)) { d.close(true); window.TriplemInv2Purchases?.openPurchase(b.dataset.stId); }
        }));
      }
    });
  }

  // Receive money from a customer or pay a supplier; open documents can be chosen, otherwise oldest first.
  async function paymentDialog(kind, party, after, preselect) {
    let p = party;
    if (!p?.open_documents) { try { p = await I().rpc("app_inv2_party_get", { p_kind: kind, p_id: party.id }); } catch (e) { Shell().toast(e.message); return; } }
    const opId = I().opId();
    const docs = p.open_documents || [];
    const suggested = preselect ? Number(docs.find(o => o.id === preselect)?.due || 0) : Math.max(Number(p.balance), 0);
    I().dialog({
      title: kind === "customer" ? "Receive payment" : "Pay supplier", subtitle: `${p.name} · balance ${I().money(p.balance)}`, submitLabel: kind === "customer" ? "Save receipt" : "Save payment",
      body: `<div class="inv2-form-grid">
        <label class="inv2-field">Amount *<input class="inv2-input" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required value="${suggested ? esc(suggested.toFixed(2)) : ""}"></label>
        <label class="inv2-field">Method<select class="inv2-input" name="method">${Object.entries(Pr().METHOD).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
        <label class="inv2-field">Date<input class="inv2-input" name="date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="inv2-field">Reference<input class="inv2-input" name="ref" maxlength="80" placeholder="Cheque or transfer number"></label>
        <label class="inv2-field wide">Notes<input class="inv2-input" name="notes" maxlength="300"></label>
      </div>
      ${docs.length ? `<h3 class="inv2-sub">Apply to</h3><div class="inv2-alloc" data-alloc>${docs.map(o => `<label class="inv2-alloc-row"><input type="checkbox" value="${esc(o.id)}" data-due="${esc(o.due)}"${preselect === o.id ? " checked" : ""}><span>${esc(o.doc_no)}</span><span>${esc(o.doc_date)}</span><strong class="num">${esc(I().money(o.due))}</strong></label>`).join("")}</div>
        <p class="inv2-note">Leave all unticked to settle the oldest first. Anything left over stays as a credit.</p>` : `<p class="inv2-note">No open ${kind === "customer" ? "invoices" : "bills"}; the payment is kept as a credit on the account.</p>`}`,
      async onSubmit(f) {
        const amount = Number(f.amount.value);
        if (!(amount > 0)) throw new Error("Enter the amount.");
        let allocations;
        const ticked = [...f.querySelectorAll("[data-alloc] input:checked")];
        if (ticked.length) {
          let left = amount; allocations = [];
          for (const x of ticked) { const take = Math.min(left, Number(x.dataset.due)); if (take > 0) allocations.push({ doc_id: x.value, amount: Math.round(take * 100) / 100 }); left -= take; }
        }
        const r = await I().rpc("app_inv2_payment_save", { p_client_op_id: opId, p_pay: { party: kind, party_id: p.id, method: f.method.value, amount, payment_date: f.date.value, reference: f.ref.value, notes: f.notes.value, allocations } });
        Shell().toast(`${r.doc_no} saved.${Number(r.unallocated) > 0 ? ` ${I().money(r.unallocated)} kept as credit.` : ""}${r.posting === "pending" ? " Accounting posting is waiting for setup." : ""}`);
        after && after(r);
        const doc = { doc_no: r.doc_no, direction: kind === "customer" ? "in" : "out", party: kind, party_obj: p, method: f.method.value, amount, payment_date: f.date.value, reference: f.ref.value };
        setTimeout(() => I().dialog({
          title: kind === "customer" ? "Payment received" : "Payment made", subtitle: r.doc_no,
          body: `<div class="inv2-done"><span class="inv2-done-ico"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
            <div class="inv2-done-grid"><div><span>Amount</span><strong>${esc(I().money(amount))}</strong></div><div><span>New balance</span><strong>${esc(I().money(r.balance))}</strong></div></div>
            <div class="inv2-done-actions"><button type="button" class="inv2-btn" data-prp><i class="fa-solid fa-print" aria-hidden="true"></i> Print ${kind === "customer" ? "receipt" : "voucher"}</button></div></div>`,
          onOpen(ff) { ff.querySelector("[data-prp]").addEventListener("click", () => Pr().print(Pr().paymentHtml(doc))); }
        }), 30);
      }
    });
  }

  // A small searchable picker (used by purchases and orders).
  function pickParty(kind) {
    return new Promise(resolve => {
      const d = I().dialog({
        title: `Choose a ${LABEL[kind][0].toLowerCase()}`,
        body: `<label class="inv2-search inv2-search-inline"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-pq placeholder="Search" autocomplete="off"></label><div class="inv2-pick-list" data-plist></div>
          ${I().canEdit() ? `<button type="button" class="inv2-btn small" data-pnew><i class="fa-solid fa-plus" aria-hidden="true"></i> New ${LABEL[kind][0].toLowerCase()}</button>` : ""}`,
        onOpen(f, dd) {
          const list = f.querySelector("[data-plist]"), q = f.querySelector("[data-pq]"); let t = 0;
          const load = async () => {
            const r = await I().rpc("app_inv2_parties_list", { p_kind: kind, p_search: q.value.trim() || null, p_status: "active", p_limit: 30, p_offset: 0 }).catch(() => ({ rows: [] }));
            list.innerHTML = r.rows.map((c, i) => `<button type="button" data-pi="${i}"><span><strong>${esc(c.name)}</strong><small>${esc(c.phone || "")}</small></span><span>${Number(c.balance) ? esc(I().money(c.balance)) : ""}</span></button>`).join("") || `<p class="inv2-note">None found.</p>`;
            list.querySelectorAll("[data-pi]").forEach(b => b.addEventListener("click", () => { resolve(r.rows[Number(b.dataset.pi)]); dd.close(true); }));
          };
          q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(load, 250); });
          f.querySelector("[data-pnew]")?.addEventListener("click", () => { dd.close(true); editParty(kind, null, saved => resolve(saved)); });
          load();
        }
      });
      d.el.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => resolve(null)));
    });
  }

  function init() { const sh = Shell(); if (!sh) return; sh.register("customers", { render: view("customer") }); sh.register("suppliers", { render: view("supplier") }); }
  window.TriplemInv2Parties = { openParty, editParty, paymentDialog, pickParty };
  if (window.TriplemInventoryV2Shell) init(); else document.addEventListener("DOMContentLoaded", init);
})();
