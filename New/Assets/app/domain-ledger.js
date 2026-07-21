/**
 * Domain-table adapters for Triplem.
 * Converts per-section tables ↔ ledger-shaped in-memory rows so existing UI/math keep working.
 * Requires migrations 020 + 021.
 */
(function (global) {
  "use strict";

  const DOMAIN = {
    loans: "loans",
    loan_payments: "loan_payments",
    installment_plans: "installment_plans",
    installment_payments: "installment_payments",
    goods_items: "goods_items",
    goods_sales: "goods_sales",
    goods_events: "goods_events",
    expense_accounts: "expense_accounts",
    expense_topups: "expense_topups",
    expense_entries: "expense_entries",
    expense_transfers: "expense_transfers",
    bitcoin_wallets: "bitcoin_wallets",
    app_notes: "app_notes",
    app_user_prefs: "app_user_prefs"
  };

  const EXPENSE_ACCOUNT_TAG = "[EXPENSE_ACCOUNT]";
  const GOODS_TAG = "[GOODS]";
  const INSTALLMENT_TAG = "[INSTALLMENT]";
  const DELETED_TAG = "[DELETED]";

  function ownerQ() {
    if (typeof global.ownerIdQuery === "function") return global.ownerIdQuery();
    return "";
  }

  async function safeSelect(path) {
    try {
      if (typeof global.supabase !== "function") return [];
      const rows = await global.supabase(path);
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (/does not exist|42P01|404|Not Found|Could not find the table/i.test(msg)) {
        console.warn("Domain table unavailable (run migration 020):", path, msg);
        return [];
      }
      throw err;
    }
  }

  function markDomain(row, table) {
    return {
      ...row,
      is_legacy_meta: false,
      data_origin: "domain",
      domain_table: table
    };
  }

  function markLegacy(row) {
    return {
      ...row,
      is_legacy_meta: true,
      data_origin: "ledger"
    };
  }

  function ensureExpenseNotes(notes, { accountType, rowType, itemName, expenseType }) {
    let n = String(notes || "");
    if (!n.includes(EXPENSE_ACCOUNT_TAG)) n = `${EXPENSE_ACCOUNT_TAG} ${n}`.trim();
    if (accountType && !/\[ATYPE:/i.test(n)) n += ` [ATYPE:${accountType}]`;
    if (rowType && !/\[ETYPE:/i.test(n)) n += ` [ETYPE:${rowType}]`;
    if (itemName && !/\[ITEM:/i.test(n)) n += ` [ITEM:${itemName}]`;
    if (expenseType && !/\[XTYPE:/i.test(n)) n += ` [XTYPE:${expenseType}]`;
    return n.trim();
  }

  function ensureGoodsNotes(notes) {
    const n = String(notes || "");
    return n.includes(GOODS_TAG) ? n : `${GOODS_TAG} ${n}`.trim();
  }

  function ensureInstallmentNotes(notes) {
    const n = String(notes || "");
    return n.includes(INSTALLMENT_TAG) ? n : `${INSTALLMENT_TAG} ${n}`.trim();
  }

  function loanFromDomain(loan) {
    return markDomain({
      id: loan.id,
      group_id: loan.group_id,
      direction: loan.direction,
      entry_kind: "principal",
      person_name: loan.person_name,
      currency: loan.currency,
      principal_amount: loan.principal_amount,
      action_amount: null,
      loan_date: loan.loan_date,
      action_date: null,
      notes: loan.is_deleted ? `${loan.notes || ""} ${DELETED_TAG}`.trim() : loan.notes,
      owner_id: loan.owner_id,
      created_at: loan.created_at,
      updated_at: loan.updated_at
    }, DOMAIN.loans);
  }

  function loanPaymentFromDomain(p) {
    return markDomain({
      id: p.id,
      group_id: p.group_id,
      direction: p.direction,
      entry_kind: p.payment_kind,
      person_name: p.person_name,
      currency: p.currency,
      principal_amount: null,
      action_amount: p.payment_amount,
      loan_date: p.payment_date,
      action_date: p.payment_date,
      notes: p.is_deleted ? `${p.notes || ""} ${DELETED_TAG}`.trim() : p.notes,
      owner_id: p.owner_id,
      created_at: p.created_at,
      updated_at: p.updated_at
    }, DOMAIN.loan_payments);
  }

  function installmentPlanFromDomain(plan) {
    return markDomain({
      id: plan.id,
      group_id: plan.group_id,
      direction: "taken",
      entry_kind: "principal",
      person_name: plan.person_name,
      currency: plan.currency,
      principal_amount: plan.principal_amount,
      action_amount: null,
      loan_date: plan.loan_date,
      action_date: null,
      notes: ensureInstallmentNotes(plan.is_deleted ? `${plan.notes || ""} ${DELETED_TAG}` : plan.notes),
      owner_id: plan.owner_id,
      created_at: plan.created_at,
      updated_at: plan.updated_at
    }, DOMAIN.installment_plans);
  }

  function installmentPaymentFromDomain(p) {
    return markDomain({
      id: p.id,
      group_id: p.group_id,
      direction: "taken",
      entry_kind: p.payment_kind,
      person_name: p.person_name,
      currency: p.currency,
      principal_amount: null,
      action_amount: p.payment_amount,
      loan_date: p.payment_date,
      action_date: p.payment_date,
      notes: ensureInstallmentNotes(p.is_deleted ? `${p.notes || ""} ${DELETED_TAG}` : p.notes),
      owner_id: p.owner_id,
      created_at: p.created_at,
      updated_at: p.updated_at
    }, DOMAIN.installment_payments);
  }

  function expenseAccountFromDomain(a) {
    let notes = a.notes || "";
    notes = ensureExpenseNotes(notes, { accountType: a.account_type || "Bank Account", rowType: "ACCOUNT" });
    if (a.btc_address && !/\[BADDR:/i.test(notes)) notes += ` [BADDR:${a.btc_address}]`;
    if (a.btc_network && !/\[BNET:/i.test(notes)) notes += ` [BNET:${a.btc_network}]`;
    if (a.is_deleted) notes = `${notes} ${DELETED_TAG}`.trim();
    return markDomain({
      id: a.id,
      group_id: a.group_id,
      direction: "taken",
      entry_kind: "principal",
      person_name: a.account_name,
      currency: a.currency,
      principal_amount: a.opening_balance,
      action_amount: null,
      loan_date: a.account_date,
      action_date: null,
      notes,
      owner_id: a.owner_id,
      created_at: a.created_at,
      updated_at: a.updated_at
    }, DOMAIN.expense_accounts);
  }

  function expenseTopupFromDomain(t) {
    let notes = ensureExpenseNotes(t.notes, {
      accountType: "Bank Account",
      rowType: "TOPUP"
    });
    if (t.is_deleted) notes = `${notes} ${DELETED_TAG}`.trim();
    return markDomain({
      id: t.id,
      group_id: t.group_id,
      direction: "taken",
      entry_kind: "partial",
      person_name: t.account_name,
      currency: t.currency,
      principal_amount: null,
      action_amount: t.amount,
      loan_date: t.topup_date,
      action_date: t.topup_date,
      notes,
      owner_id: t.owner_id,
      created_at: t.created_at,
      updated_at: t.updated_at
    }, DOMAIN.expense_topups);
  }

  function expenseEntryFromDomain(e) {
    let notes = ensureExpenseNotes(e.notes, {
      accountType: "Bank Account",
      rowType: "EXPENSE",
      itemName: e.item_name,
      expenseType: e.expense_type
    });
    if (e.is_deleted) notes = `${notes} ${DELETED_TAG}`.trim();
    return markDomain({
      id: e.id,
      group_id: e.group_id,
      direction: "taken",
      entry_kind: "partial",
      person_name: e.account_name,
      currency: e.currency,
      principal_amount: null,
      action_amount: e.amount,
      loan_date: e.expense_date,
      action_date: e.expense_date,
      notes,
      owner_id: e.owner_id,
      created_at: e.created_at,
      updated_at: e.updated_at
    }, DOMAIN.expense_entries);
  }

  function appendGoodsMetaIfMissing(notes, meta) {
    let n = ensureGoodsNotes(notes);
    const add = (key, val) => {
      if (val == null || val === "") return;
      if (new RegExp(`\\[${key}:`, "i").test(n)) return;
      n = `${n} [${key}:${val}]`.trim();
    };
    if (meta.boughtQty != null) add("BQTY", meta.boughtQty);
    if (meta.soldQty != null) add("SQTY", meta.soldQty);
    if (meta.unitActualPrice != null) add("UAP", meta.unitActualPrice);
    if (meta.unitSoldPrice != null) add("USP", meta.unitSoldPrice);
    if (meta.itemCode) add("ICODE", meta.itemCode);
    if (meta.tx) add("TX", meta.tx);
    return n;
  }

  function goodsItemFromDomain(g) {
    const shape = g.meta && g.meta.ledger_shape;
    let notes = (shape && shape.notes) || g.notes || "";
    notes = appendGoodsMetaIfMissing(notes, {
      boughtQty: g.bought_qty,
      unitActualPrice: g.unit_actual_price,
      itemCode: g.item_code,
      tx: g.tx_type || "ITEM"
    });
    if (g.is_deleted) notes = `${notes} ${DELETED_TAG}`.trim();
    if (shape && shape.id) {
      return markDomain({
        ...shape,
        notes,
        owner_id: g.owner_id,
        created_at: g.created_at,
        updated_at: g.updated_at
      }, DOMAIN.goods_items);
    }
    return markDomain({
      id: g.id,
      group_id: g.group_id,
      direction: "taken",
      entry_kind: "principal",
      person_name: g.item_name,
      currency: g.currency,
      principal_amount: g.total_actual_price,
      action_amount: null,
      loan_date: g.bought_date,
      action_date: null,
      notes,
      owner_id: g.owner_id,
      created_at: g.created_at,
      updated_at: g.updated_at
    }, DOMAIN.goods_items);
  }

  function goodsSaleFromDomain(s) {
    const shape = s.meta && s.meta.ledger_shape;
    let notes = (shape && shape.notes) || s.notes || "";
    notes = appendGoodsMetaIfMissing(notes, {
      soldQty: s.sold_qty,
      unitSoldPrice: s.unit_sold_price,
      tx: s.tx_type || "SALE"
    });
    if (s.is_deleted) notes = `${notes} ${DELETED_TAG}`.trim();
    if (shape && shape.id) {
      return markDomain({
        ...shape,
        notes,
        owner_id: s.owner_id,
        created_at: s.created_at,
        updated_at: s.updated_at
      }, DOMAIN.goods_sales);
    }
    return markDomain({
      id: s.id,
      group_id: s.group_id,
      direction: "taken",
      entry_kind: "partial",
      person_name: s.item_name,
      currency: s.currency,
      principal_amount: null,
      action_amount: s.total_sold_price,
      loan_date: s.sold_date,
      action_date: s.sold_date,
      notes,
      owner_id: s.owner_id,
      created_at: s.created_at,
      updated_at: s.updated_at
    }, DOMAIN.goods_sales);
  }

  function bitcoinWalletFromDomain(w) {
    const notes = JSON.stringify({
      address: w.address || "",
      label: w.label || "",
      network: w.network || "mainnet",
      is_watch_only: w.is_watch_only !== false,
      rowType: "BITCOIN_WALLET"
    });
    return markDomain({
      id: w.id,
      group_id: w.id,
      direction: "taken",
      entry_kind: "principal",
      person_name: "SYSTEM",
      currency: w.currency || "BTC",
      principal_amount: 0,
      action_amount: null,
      loan_date: (w.created_at || "").slice(0, 10),
      action_date: (w.created_at || "").slice(0, 10),
      notes: w.is_deleted ? `${notes} ${DELETED_TAG}` : notes,
      owner_id: w.owner_id,
      created_at: w.created_at,
      updated_at: w.updated_at,
      _btc: {
        id: w.id,
        address: w.address || "",
        label: w.label || "",
        network: w.network || "mainnet",
        is_watch_only: w.is_watch_only !== false,
        createdAt: w.created_at,
        data_origin: "domain",
        is_legacy_meta: false
      }
    }, DOMAIN.bitcoin_wallets);
  }

  function appNoteFromDomain(n) {
    const content = n.content != null ? n.content : "";
    const notes = JSON.stringify({ content, rowType: "NOTE" });
    return markDomain({
      id: n.id,
      group_id: n.id,
      direction: "taken",
      entry_kind: "principal",
      person_name: "SYSTEM",
      currency: "AED",
      principal_amount: 0,
      action_amount: null,
      loan_date: (n.created_at || "").slice(0, 10),
      action_date: (n.created_at || "").slice(0, 10),
      notes: n.is_deleted ? `${notes} ${DELETED_TAG}` : notes,
      owner_id: n.owner_id,
      created_at: n.created_at,
      updated_at: n.updated_at,
      _note: {
        id: n.id,
        content,
        createdAt: n.created_at,
        data_origin: "domain",
        is_legacy_meta: false
      }
    }, DOMAIN.app_notes);
  }

  function goodsEventFromDomain(ev) {
    const shape = ev.meta && ev.meta.ledger_shape;
    if (shape && shape.id) {
      let notes = ensureGoodsNotes(shape.notes || ev.notes);
      if (ev.is_deleted) notes = `${notes} ${DELETED_TAG}`.trim();
      return markDomain({
        ...shape,
        notes,
        owner_id: ev.owner_id,
        created_at: ev.created_at,
        updated_at: ev.updated_at
      }, DOMAIN.goods_events);
    }
    let notes = ensureGoodsNotes(ev.notes);
    if (ev.is_deleted) notes = `${notes} ${DELETED_TAG}`.trim();
    return markDomain({
      id: ev.id,
      group_id: ev.group_id,
      direction: ev.direction || "taken",
      entry_kind: ev.entry_kind || "partial",
      person_name: ev.item_name,
      currency: ev.currency,
      principal_amount: ev.entry_kind === "principal" ? ev.amount : null,
      action_amount: ev.entry_kind === "principal" ? null : ev.amount,
      loan_date: ev.event_date,
      action_date: ev.entry_kind === "principal" ? null : ev.event_date,
      notes,
      owner_id: ev.owner_id,
      created_at: ev.created_at,
      updated_at: ev.updated_at
    }, DOMAIN.goods_events);
  }

  function currencyFilterQuery() {
    if (typeof global.selectedCurrencyQuery === "function") {
      const { blocked, query } = global.selectedCurrencyQuery();
      if (blocked) return { blocked: true, query: "" };
      return { blocked: false, query: query || "" };
    }
    return { blocked: false, query: "" };
  }

  async function loadDomainRowsForScope(scope) {
    const oq = ownerQ();
    const { blocked, query: cq } = currencyFilterQuery();
    if (blocked) return [];
    const out = [];
    if (scope === "loans-given" || scope === "given") {
      const loans = await safeSelect(`${DOMAIN.loans}?select=*&direction=eq.given${oq}${cq}&order=created_at.desc`);
      const pays = await safeSelect(`${DOMAIN.loan_payments}?select=*&direction=eq.given${oq}${cq}&order=created_at.desc`);
      out.push(...loans.map(loanFromDomain), ...pays.map(loanPaymentFromDomain));
    } else if (scope === "loans-taken" || scope === "taken") {
      const loans = await safeSelect(`${DOMAIN.loans}?select=*&direction=eq.taken${oq}${cq}&order=created_at.desc`);
      const pays = await safeSelect(`${DOMAIN.loan_payments}?select=*&direction=eq.taken${oq}${cq}&order=created_at.desc`);
      out.push(...loans.map(loanFromDomain), ...pays.map(loanPaymentFromDomain));
    } else if (scope === "installments") {
      const plans = await safeSelect(`${DOMAIN.installment_plans}?select=*${oq}${cq}&order=created_at.desc`);
      const pays = await safeSelect(`${DOMAIN.installment_payments}?select=*${oq}${cq}&order=created_at.desc`);
      out.push(...plans.map(installmentPlanFromDomain), ...pays.map(installmentPaymentFromDomain));
    } else if (scope === "expenses") {
      const accounts = await safeSelect(`${DOMAIN.expense_accounts}?select=*${oq}${cq}&order=created_at.desc`);
      const topups = await safeSelect(`${DOMAIN.expense_topups}?select=*${oq}${cq}&order=created_at.desc`);
      const entries = await safeSelect(`${DOMAIN.expense_entries}?select=*${oq}${cq}&order=created_at.desc`);
      out.push(
        ...accounts.map(expenseAccountFromDomain),
        ...topups.map(expenseTopupFromDomain),
        ...entries.map(expenseEntryFromDomain)
      );
    } else if (scope === "goods" || scope === "inventory") {
      const items = await safeSelect(`${DOMAIN.goods_items}?select=*${oq}${cq}&order=created_at.desc`);
      const sales = await safeSelect(`${DOMAIN.goods_sales}?select=*${oq}${cq}&order=created_at.desc`);
      const events = await safeSelect(`${DOMAIN.goods_events}?select=*${oq}${cq}&order=created_at.desc`);
      out.push(
        ...items.map(goodsItemFromDomain),
        ...sales.map(goodsSaleFromDomain),
        ...events.map(goodsEventFromDomain)
      );
    }
    return out;
  }

  async function loadAllDomainRows() {
    const scopes = ["loans-given", "loans-taken", "installments", "expenses", "goods"];
    const bundles = await Promise.all(scopes.map(s => loadDomainRowsForScope(s)));
    const byId = new Map();
    for (const rows of bundles) {
      for (const row of rows) {
        if (row?.id) byId.set(row.id, row);
      }
    }
    return [...byId.values()];
  }

  async function loadDomainBitcoinWallets() {
    const oq = ownerQ();
    const rows = await safeSelect(`${DOMAIN.bitcoin_wallets}?select=*&is_deleted=eq.false${oq}&order=created_at.desc`);
    return rows.map(bitcoinWalletFromDomain);
  }

  async function loadDomainAppNotes() {
    const oq = ownerQ();
    const rows = await safeSelect(`${DOMAIN.app_notes}?select=*&is_deleted=eq.false${oq}&order=created_at.desc`);
    return rows.map(appNoteFromDomain);
  }

  function classifyLedgerEntry(entry) {
    const notes = String(entry?.notes || "");
    const person = String(entry?.person_name || "").trim().toUpperCase();
    const direction = String(entry?.direction || "");
    if (/\[PAGE_CURRENCY:|\[VAT_SETTINGS:|\[SECRET_PIN_HASH:|\[SMART_PIN_DISABLED:/i.test(notes)) return "system_prefs";
    if (notes.includes(EXPENSE_ACCOUNT_TAG)) return "expenses";
    if (notes.includes(GOODS_TAG) || direction === "goods") return "inventory";
    if (notes.includes(INSTALLMENT_TAG)) return "installments";
    if (person === "SYSTEM" && /BITCOIN_WALLET|"rowType"\s*:\s*"BITCOIN_WALLET"/i.test(notes)) return "bitcoin";
    if (person === "SYSTEM" && /"rowType"\s*:\s*"NOTE"/i.test(notes)) return "notes";
    if (person === "SYSTEM") return "system_prefs";
    if (direction === "given") return "loans_given";
    if (direction === "taken") return "loans_taken";
    return "other";
  }

  function metaValue(notes, key) {
    const m = String(notes || "").match(new RegExp(`\\[${key}:([^\\]]*)\\]`, "i"));
    return m ? m[1] : "";
  }

  function domainInsertPayload(entry) {
    const section = classifyLedgerEntry(entry);
    const owner_id = entry.owner_id || global.state?.sessionUser?.id || null;
    const notes = entry.notes == null ? null : String(entry.notes);
    const deleted = notes && notes.includes(DELETED_TAG);

    if (section === "expenses") {
      const etype = (metaValue(notes, "ETYPE") || (entry.entry_kind === "principal" ? "ACCOUNT" : "EXPENSE")).toUpperCase();
      if (etype === "ACCOUNT" || entry.entry_kind === "principal") {
        return {
          table: DOMAIN.expense_accounts,
          body: {
            id: entry.id,
            group_id: entry.group_id,
            owner_id,
            account_name: entry.person_name,
            account_type: metaValue(notes, "ATYPE") || "Bank Account",
            currency: entry.currency,
            opening_balance: Number(entry.principal_amount || 0),
            account_date: entry.loan_date,
            notes,
            btc_address: metaValue(notes, "BADDR") || null,
            btc_network: metaValue(notes, "BNET") || null,
            meta: { etype: "ACCOUNT" },
            is_deleted: !!deleted,
            created_at: entry.created_at
          }
        };
      }
      if (etype === "TOPUP") {
        return {
          table: DOMAIN.expense_topups,
          body: {
            id: entry.id,
            group_id: entry.group_id,
            owner_id,
            account_name: entry.person_name,
            currency: entry.currency,
            amount: Number(entry.action_amount || 0),
            topup_date: entry.action_date || entry.loan_date,
            notes,
            meta: { etype: "TOPUP" },
            is_deleted: !!deleted,
            created_at: entry.created_at
          }
        };
      }
      return {
        table: DOMAIN.expense_entries,
        body: {
          id: entry.id,
          group_id: entry.group_id,
          owner_id,
          account_name: entry.person_name,
          currency: entry.currency,
          item_name: metaValue(notes, "ITEM") || entry.person_name || "Expense",
          expense_type: metaValue(notes, "XTYPE") || "Other",
          amount: Number(entry.action_amount || 0),
          expense_date: entry.action_date || entry.loan_date,
          notes,
          meta: { etype: "EXPENSE" },
          is_deleted: !!deleted,
          created_at: entry.created_at
        }
      };
    }

    if (section === "installments") {
      if (entry.entry_kind === "principal") {
        return {
          table: DOMAIN.installment_plans,
          body: {
            id: entry.id,
            group_id: entry.group_id,
            owner_id,
            person_name: entry.person_name,
            currency: entry.currency,
            principal_amount: Number(entry.principal_amount || 0),
            loan_date: entry.loan_date,
            notes,
            meta: {},
            is_deleted: !!deleted,
            created_at: entry.created_at
          }
        };
      }
      return {
        table: DOMAIN.installment_payments,
        body: {
          id: entry.id,
          group_id: entry.group_id,
          owner_id,
          person_name: entry.person_name,
          currency: entry.currency,
          payment_kind: entry.entry_kind,
          payment_amount: Number(entry.action_amount || 0),
          payment_date: entry.action_date || entry.loan_date,
          notes,
          meta: {},
          is_deleted: !!deleted,
          created_at: entry.created_at
        }
      };
    }

    if (section === "loans_given" || section === "loans_taken") {
      if (entry.entry_kind === "principal") {
        return {
          table: DOMAIN.loans,
          body: {
            id: entry.id,
            group_id: entry.group_id,
            owner_id,
            direction: entry.direction,
            person_name: entry.person_name,
            currency: entry.currency,
            principal_amount: Number(entry.principal_amount || 0),
            loan_date: entry.loan_date,
            notes,
            meta: {},
            is_deleted: !!deleted,
            created_at: entry.created_at
          }
        };
      }
      return {
        table: DOMAIN.loan_payments,
        body: {
          id: entry.id,
          group_id: entry.group_id,
          owner_id,
          direction: entry.direction,
          person_name: entry.person_name,
          currency: entry.currency,
          payment_kind: entry.entry_kind,
          payment_amount: Number(entry.action_amount || 0),
          payment_date: entry.action_date || entry.loan_date,
          notes,
          meta: {},
          is_deleted: !!deleted,
          created_at: entry.created_at
        }
      };
    }

    if (section === "inventory") {
      const tx = (metaValue(notes, "TX") || (entry.entry_kind === "principal" ? "ITEM" : "SALE")).toUpperCase();
      if (entry.entry_kind === "principal" && (tx === "ITEM" || tx === "PURCHASE" || !tx)) {
        return {
          table: DOMAIN.goods_items,
          body: {
            id: entry.id,
            group_id: entry.group_id,
            owner_id,
            item_name: entry.person_name,
            currency: entry.currency,
            unit_actual_price: Number(metaValue(notes, "UAP") || entry.principal_amount || 0),
            bought_qty: Number(metaValue(notes, "BQTY") || 1),
            total_actual_price: Number(entry.principal_amount || 0),
            bought_date: entry.loan_date,
            notes,
            tx_type: tx || "ITEM",
            item_code: metaValue(notes, "ICODE") || null,
            meta: { ledger_shape: entry },
            is_deleted: !!deleted,
            created_at: entry.created_at
          }
        };
      }
      if (tx === "SALE") {
        return {
          table: DOMAIN.goods_sales,
          body: {
            id: entry.id,
            group_id: entry.group_id,
            owner_id,
            item_name: entry.person_name,
            currency: entry.currency,
            unit_sold_price: Number(metaValue(notes, "USP") || entry.action_amount || 0),
            sold_qty: Number(metaValue(notes, "SQTY") || 1),
            total_sold_price: Number(entry.action_amount || entry.principal_amount || 0),
            sold_date: entry.action_date || entry.loan_date,
            notes,
            tx_type: "SALE",
            meta: { ledger_shape: entry },
            is_deleted: !!deleted,
            created_at: entry.created_at
          }
        };
      }
      return {
        table: DOMAIN.goods_events,
        body: {
          id: entry.id,
          group_id: entry.group_id,
          owner_id,
          tx_type: tx || "EVENT",
          item_name: entry.person_name,
          currency: entry.currency,
          entry_kind: entry.entry_kind,
          direction: entry.direction || "taken",
          amount: Number(entry.action_amount ?? entry.principal_amount ?? 0),
          qty: Number(metaValue(notes, "BQTY") || metaValue(notes, "SQTY") || 0) || null,
          event_date: entry.action_date || entry.loan_date,
          notes,
          meta: { ledger_shape: entry },
          is_deleted: !!deleted,
          created_at: entry.created_at
        }
      };
    }

    // Fallback: still write ledger for system prefs / unknown
    return { table: "loan_ledger_entries", body: null, useLedger: true };
  }

  async function insertDomainEntry(entry) {
    const mapped = domainInsertPayload(entry);
    if (mapped.useLedger || !mapped.body) {
      return { usedLedger: true };
    }
    await global.supabase(mapped.table, { method: "POST", body: JSON.stringify(mapped.body) });
    return { usedLedger: false, table: mapped.table };
  }

  /**
   * Upsert into the classified domain table: PATCH when id exists, else INSERT.
   * Falls back to ledger when the row cannot be mapped to a domain table.
   */
  async function upsertDomainEntry(entry) {
    const mapped = domainInsertPayload(entry);
    if (mapped.useLedger || !mapped.body) {
      return { usedLedger: true };
    }
    const id = entry?.id || mapped.body.id;
    if (!id) {
      await global.supabase(mapped.table, { method: "POST", body: JSON.stringify(mapped.body) });
      return { usedLedger: false, table: mapped.table, action: "insert" };
    }
    let existing = [];
    try {
      existing = await safeSelect(`${mapped.table}?id=eq.${encodeURIComponent(id)}&select=id`);
    } catch {
      existing = [];
    }
    if (existing.length) {
      await global.supabase(`${mapped.table}?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ ...mapped.body, updated_at: new Date().toISOString() })
      });
      return { usedLedger: false, table: mapped.table, action: "update" };
    }
    await global.supabase(mapped.table, { method: "POST", body: JSON.stringify(mapped.body) });
    return { usedLedger: false, table: mapped.table, action: "insert" };
  }

  /**
   * Move loan-domain rows into installment tables.
   * Inserts all installment rows first (principals before payments), then removes loan-domain
   * sources — so loans.group_id ON DELETE CASCADE cannot wipe payments mid-move.
   * Legacy ledger rows only get the [INSTALLMENT] notes tag via PATCH.
   */
  async function moveLoanEntriesToInstallments(entries) {
    const list = (Array.isArray(entries) ? entries : []).filter(Boolean);
    const byGroup = new Map();
    for (const entry of list) {
      const gid = String(entry.group_id || entry.id || "").trim() || crypto.randomUUID();
      if (!byGroup.has(gid)) byGroup.set(gid, []);
      byGroup.get(gid).push(entry);
    }

    const updated = [];
    for (const groupEntries of byGroup.values()) {
      const ordered = [
        ...groupEntries.filter(e => e.entry_kind === "principal"),
        ...groupEntries.filter(e => e.entry_kind !== "principal")
      ];
      const domainLoanRows = [];
      const insertedInstallments = [];

      for (const entry of ordered) {
        const nextNotes = ensureInstallmentNotes(entry.notes);
        const isDomainLoan =
          entry.data_origin === "domain" &&
          (entry.domain_table === DOMAIN.loans || entry.domain_table === DOMAIN.loan_payments);

        if (isDomainLoan) {
          const installmentEntry = {
            ...entry,
            direction: "taken",
            notes: nextNotes,
            is_legacy_meta: false,
            data_origin: "domain"
          };
          delete installmentEntry.domain_table;
          const insertResult = await insertDomainEntry(installmentEntry);
          if (insertResult.usedLedger) {
            if (typeof global.supabase === "function" && entry.id) {
              await global.supabase(`loan_ledger_entries?id=eq.${encodeURIComponent(entry.id)}`, {
                method: "PATCH",
                body: JSON.stringify({ notes: nextNotes })
              });
            }
            updated.push({
              ...entry,
              notes: nextNotes,
              data_origin: "ledger",
              is_legacy_meta: true
            });
            continue;
          }
          domainLoanRows.push(entry);
          const table =
            entry.entry_kind === "principal" ? DOMAIN.installment_plans : DOMAIN.installment_payments;
          insertedInstallments.push({
            ...installmentEntry,
            domain_table: insertResult.table || table,
            data_origin: "domain",
            is_legacy_meta: false
          });
        } else {
          if (typeof global.supabase === "function" && entry.id) {
            await global.supabase(`loan_ledger_entries?id=eq.${encodeURIComponent(entry.id)}`, {
              method: "PATCH",
              body: JSON.stringify({ notes: nextNotes })
            });
          }
          updated.push({
            ...entry,
            notes: nextNotes,
            data_origin: entry.data_origin || "ledger",
            is_legacy_meta: entry.data_origin === "domain" ? false : true
          });
        }
      }

      // Delete loan-domain sources only after every installment insert for the group succeeded.
      // Payments first, then principal — avoids cascade wiping siblings mid-loop.
      const deleteOrdered = [
        ...domainLoanRows.filter(e => e.entry_kind !== "principal"),
        ...domainLoanRows.filter(e => e.entry_kind === "principal")
      ];
      for (const entry of deleteOrdered) {
        try {
          await hardDeleteDomainEntry(entry);
        } catch (err) {
          console.warn("Loan domain cleanup after installment move:", entry.id, err);
        }
      }
      updated.push(...insertedInstallments);
    }
    return updated;
  }

  function mapLedgerPatchToDomain(entry, patchBody) {
    const table = entry.domain_table;
    const body = { updated_at: new Date().toISOString() };
    const notes = Object.prototype.hasOwnProperty.call(patchBody, "notes") ? patchBody.notes : undefined;
    if (notes !== undefined) {
      body.notes = notes;
      body.is_deleted = String(notes || "").includes(DELETED_TAG);
    }
    if (Object.prototype.hasOwnProperty.call(patchBody, "is_deleted")) {
      body.is_deleted = !!patchBody.is_deleted;
    }

    if (table === DOMAIN.loans || table === DOMAIN.loan_payments ||
        table === DOMAIN.installment_plans || table === DOMAIN.installment_payments) {
      if (patchBody.person_name != null) body.person_name = patchBody.person_name;
      if (patchBody.currency != null) body.currency = patchBody.currency;
      if (patchBody.direction != null && (table === DOMAIN.loans || table === DOMAIN.loan_payments)) {
        body.direction = patchBody.direction;
      }
    }
    if (table === DOMAIN.loans || table === DOMAIN.installment_plans) {
      if (patchBody.principal_amount != null) body.principal_amount = patchBody.principal_amount;
      if (patchBody.loan_date != null) body.loan_date = patchBody.loan_date;
    }
    if (table === DOMAIN.loan_payments || table === DOMAIN.installment_payments) {
      if (patchBody.action_amount != null) body.payment_amount = patchBody.action_amount;
      if (patchBody.action_date != null) body.payment_date = patchBody.action_date;
      if (patchBody.entry_kind != null) body.payment_kind = patchBody.entry_kind;
    }
    if (table === DOMAIN.expense_accounts) {
      if (patchBody.person_name != null) body.account_name = patchBody.person_name;
      if (patchBody.principal_amount != null) body.opening_balance = patchBody.principal_amount;
      if (patchBody.loan_date != null) body.account_date = patchBody.loan_date;
      if (patchBody.currency != null) body.currency = patchBody.currency;
      if (notes !== undefined) {
        const at = metaValue(notes, "ATYPE");
        const ba = metaValue(notes, "BADDR");
        const bn = metaValue(notes, "BNET");
        if (at) body.account_type = at;
        if (ba) body.btc_address = ba;
        if (bn) body.btc_network = bn;
      }
    }
    if (table === DOMAIN.expense_topups) {
      if (patchBody.person_name != null) body.account_name = patchBody.person_name;
      if (patchBody.action_amount != null) body.amount = patchBody.action_amount;
      if (patchBody.action_date != null) body.topup_date = patchBody.action_date;
      if (patchBody.currency != null) body.currency = patchBody.currency;
    }
    if (table === DOMAIN.expense_entries) {
      if (patchBody.person_name != null) body.account_name = patchBody.person_name;
      if (patchBody.action_amount != null) body.amount = patchBody.action_amount;
      if (patchBody.action_date != null) body.expense_date = patchBody.action_date;
      if (patchBody.currency != null) body.currency = patchBody.currency;
      if (notes !== undefined) {
        const item = metaValue(notes, "ITEM");
        const xt = metaValue(notes, "XTYPE");
        if (item) body.item_name = item;
        if (xt) body.expense_type = xt;
      }
    }
    if (table === DOMAIN.goods_items) {
      if (patchBody.person_name != null) body.item_name = patchBody.person_name;
      if (patchBody.principal_amount != null) body.total_actual_price = patchBody.principal_amount;
      if (patchBody.loan_date != null) body.bought_date = patchBody.loan_date;
      if (patchBody.currency != null) body.currency = patchBody.currency;
      if (notes !== undefined) {
        body.meta = { ...(entry.meta || {}), ledger_shape: { ...entry, ...patchBody, notes } };
        const bq = metaValue(notes, "BQTY");
        const uap = metaValue(notes, "UAP");
        const ic = metaValue(notes, "ICODE");
        if (bq) body.bought_qty = Number(bq);
        if (uap) body.unit_actual_price = Number(uap);
        if (ic) body.item_code = ic;
      }
    }
    if (table === DOMAIN.goods_sales || table === DOMAIN.goods_events) {
      if (patchBody.person_name != null) body.item_name = patchBody.person_name;
      if (patchBody.action_amount != null) {
        if (table === DOMAIN.goods_sales) body.total_sold_price = patchBody.action_amount;
        else body.amount = patchBody.action_amount;
      }
      if (patchBody.action_date != null) {
        if (table === DOMAIN.goods_sales) body.sold_date = patchBody.action_date;
        else body.event_date = patchBody.action_date;
      }
      if (patchBody.currency != null) body.currency = patchBody.currency;
      if (notes !== undefined) {
        body.meta = { ...(entry.meta || {}), ledger_shape: { ...entry, ...patchBody, notes } };
      }
    }
    if (table === DOMAIN.bitcoin_wallets && notes !== undefined) {
      try {
        const j = JSON.parse(String(notes).replace(DELETED_TAG, "").trim());
        if (j.label != null) body.label = j.label;
        if (j.address != null) body.address = j.address;
        if (j.network != null) body.network = j.network;
        if (j.is_watch_only != null) body.is_watch_only = !!j.is_watch_only;
      } catch { /* keep notes only */ }
    }
    if (table === DOMAIN.app_notes && notes !== undefined) {
      try {
        const j = JSON.parse(String(notes).replace(DELETED_TAG, "").trim());
        if (j.content != null) body.content = j.content;
      } catch { /* keep notes only */ }
    }
    return body;
  }

  async function patchDomainEntry(entry, patchBody) {
    const table = entry.domain_table;
    if (!table || entry.data_origin !== "domain") {
      return { usedLedger: true };
    }
    const body = mapLedgerPatchToDomain(entry, patchBody);
    await global.supabase(`${table}?id=eq.${encodeURIComponent(entry.id)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    return { usedLedger: false };
  }

  function resolveDomainTable(entry) {
    if (!entry) return null;
    if (entry.domain_table && entry.domain_table !== "loan_ledger_entries") {
      return entry.domain_table;
    }
    try {
      const mapped = domainInsertPayload(entry);
      if (mapped?.useLedger || !mapped?.body || !mapped?.table) return null;
      if (mapped.table === "loan_ledger_entries") return null;
      return mapped.table;
    } catch {
      return null;
    }
  }

  /** Domain tables that store group_id (wallet/loan/installment/inventory families). */
  const GROUP_DOMAIN_TABLES = [
    DOMAIN.loans,
    DOMAIN.loan_payments,
    DOMAIN.installment_plans,
    DOMAIN.installment_payments,
    DOMAIN.goods_items,
    DOMAIN.goods_sales,
    DOMAIN.goods_events,
    DOMAIN.expense_accounts,
    DOMAIN.expense_topups,
    DOMAIN.expense_entries,
    DOMAIN.expense_transfers
  ];

  async function softDeleteDomainEntry(entry) {
    if (!entry?.id) return false;
    const table = resolveDomainTable(entry);
    if (!table) return false;
    await global.supabase(`${table}?id=eq.${encodeURIComponent(entry.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ is_deleted: true, updated_at: new Date().toISOString() })
    });
    return true;
  }

  /**
   * Soft-delete every domain row for a group_id across all section tables.
   * Covers children not currently loaded in memory so dual-read cannot resurrect.
   */
  async function softDeleteDomainByGroupId(groupId) {
    if (!groupId) return;
    const oq = ownerQ();
    const body = JSON.stringify({ is_deleted: true, updated_at: new Date().toISOString() });
    await Promise.all(GROUP_DOMAIN_TABLES.map(async (table) => {
      try {
        await global.supabase(
          `${table}?group_id=eq.${encodeURIComponent(groupId)}${oq}`,
          { method: "PATCH", body }
        );
      } catch (err) {
        const msg = String(err?.message || err || "");
        if (!/does not exist|42P01|404|Not Found|Could not find the table/i.test(msg)) {
          console.warn("softDeleteDomainByGroupId failed for", table, err);
        }
      }
    }));
  }

  async function restoreDomainEntry(entry) {
    if (!entry?.id) return false;
    const table = resolveDomainTable(entry);
    if (!table) return false;
    const notes = String(entry.notes || "").replace(DELETED_TAG, "").trim();
    await global.supabase(`${table}?id=eq.${encodeURIComponent(entry.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ is_deleted: false, notes: notes || null, updated_at: new Date().toISOString() })
    });
    return true;
  }

  async function hardDeleteDomainEntry(entry) {
    if (!entry?.id) return false;
    const table = resolveDomainTable(entry);
    if (!table) return false;
    await global.supabase(`${table}?id=eq.${encodeURIComponent(entry.id)}`, { method: "DELETE" });
    return true;
  }

  async function hardDeleteDomainByGroupId(groupId) {
    if (!groupId) return;
    const oq = ownerQ();
    await Promise.all(GROUP_DOMAIN_TABLES.map(async (table) => {
      try {
        await global.supabase(
          `${table}?group_id=eq.${encodeURIComponent(groupId)}${oq}`,
          { method: "DELETE" }
        );
      } catch (err) {
        const msg = String(err?.message || err || "");
        if (!/does not exist|42P01|404|Not Found|Could not find the table/i.test(msg)) {
          console.warn("hardDeleteDomainByGroupId failed for", table, err);
        }
      }
    }));
  }

  async function migrateEntry(entryId) {
    return global.supabaseRpc("app_migrate_ledger_entry", { p_entry_id: entryId });
  }

  async function migrateSectionBatch(section, limit = 80) {
    return global.supabaseRpc("app_migrate_section_batch", {
      p_section: section,
      p_limit: limit
    });
  }

  function entryIsLegacyMeta(entry) {
    if (!entry) return false;
    if (entry.data_origin === "domain" || entry.domain_table) return false;
    if (entry.is_legacy_meta === false) return false;
    return entry.is_legacy_meta === true || entry.data_origin === "ledger";
  }

  function resolveGroupEntries(group) {
    if (!group) return [];
    if (Array.isArray(group)) return group;
    if (Array.isArray(group.entries)) return group.entries;
    if (Array.isArray(group.rows) && global.state?.entries) {
      const ids = new Set(group.rows.map(r => r.entryId || r.id).filter(Boolean));
      return global.state.entries.filter(e => ids.has(e.id));
    }
    if (group.principal || group.actions) {
      return [group.principal, ...(group.actions || [])].filter(Boolean);
    }
    return [];
  }

  function groupHasLegacyMeta(group) {
    return resolveGroupEntries(group).some(entryIsLegacyMeta);
  }

  function firstLegacyEntryId(group) {
    const legacy = resolveGroupEntries(group).find(entryIsLegacyMeta);
    return legacy?.id || "";
  }

  function legacyFixBadgeHtml(groupId, entryId) {
    const id = entryId || "";
    const gid = groupId || "";
    return `<button type="button" class="legacy-meta-fix-btn" data-legacy-fix-id="${escapeAttr(id)}" data-legacy-fix-group="${escapeAttr(gid)}" title="Stored as meta-tag in the old ledger. Click Fix to move into the proper section table."><span class="legacy-meta-badge">Stored as meta-tag</span> · Fix</button>`;
  }

  function legacyFixAllBtnHtml(sectionKey) {
    if (!sectionKey) return "";
    return `<button type="button" class="btn soft legacy-fix-all-btn" data-legacy-fix-all="${escapeAttr(sectionKey)}" title="Migrate all leftover meta-tag rows on this page into domain tables">Fix all on this page</button>`;
  }

  function escapeAttr(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function sectionBatchKeyForTab(tab) {
    const t = String(tab || "");
    if (t === "given" || t === "received") return "loans_given";
    if (t === "taken" || t === "returned") return "loans_taken";
    if (t === "installments") return "installments";
    if (t === "expenses") return "expenses";
    if (t === "goods" || t === "inventory") return "inventory";
    if (t === "bitcoin") return "bitcoin";
    if (t === "notes") return "notes";
    return "";
  }

  global.DomainLedger = {
    DOMAIN,
    markLegacy,
    markDomain,
    loadDomainRowsForScope,
    loadAllDomainRows,
    loadDomainBitcoinWallets,
    loadDomainAppNotes,
    classifyLedgerEntry,
    domainInsertPayload,
    insertDomainEntry,
    upsertDomainEntry,
    moveLoanEntriesToInstallments,
    patchDomainEntry,
    softDeleteDomainEntry,
    softDeleteDomainByGroupId,
    restoreDomainEntry,
    hardDeleteDomainEntry,
    hardDeleteDomainByGroupId,
    resolveDomainTable,
    migrateEntry,
    migrateSectionBatch,
    entryIsLegacyMeta,
    groupHasLegacyMeta,
    firstLegacyEntryId,
    legacyFixBadgeHtml,
    legacyFixAllBtnHtml,
    sectionBatchKeyForTab,
    bitcoinWalletFromDomain,
    appNoteFromDomain,
    loanFromDomain,
    expenseAccountFromDomain
  };

  // Convenience globals matching script.js style
  global.groupHasLegacyMeta = groupHasLegacyMeta;
})(typeof window !== "undefined" ? window : globalThis);
